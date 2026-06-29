// ══════════════════════════════════════════════════════════════
// fetch-tally.js — Tally → Maniram Factory OS sync bridge
// Runs on the Windows PC where TallyPrime / Tally ERP 9 is open.
//
// SETUP (one-time):
//   1. Install Node.js from https://nodejs.org (any LTS version)
//   2. Edit APPS_SCRIPT_URL and COMPANY_NAME in the CONFIG section below
//   3. In TallyPrime: F1 → Features → TSS → Enable Tally.NET Features
//      OR: F12 → Advanced Config → Allow Cross Object Access: Yes
//   4. Test: open a terminal and run   node fetch-tally.js
//   5. Schedule daily: Windows Task Scheduler → Action: node fetch-tally.js
//      (see run-tally-sync.bat for a ready-made scheduled task)
//
// Usage:
//   node fetch-tally.js              ← syncs today
//   node fetch-tally.js 2025-06-29   ← syncs a specific date
// ══════════════════════════════════════════════════════════════

const http  = require('http');
const https = require('https');
const url   = require('url');

// ── CONFIG ─────────────────────────────────────────────────────
const TALLY_HOST      = '127.0.0.1';
const TALLY_PORT      = 9000;

// Your Apps Script deployment URL (from config.js)
const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbxCrZW5upLG7YWixwxaLq1y13opChsJdkcz-4sn2h9LwyuKSgW3mVFgb9KoDdq8lQP6/exec';

// Leave blank to use the company currently open in Tally,
// or set to your exact company name: 'MANIRAM INDUSTRIES'
const COMPANY_NAME = '';

// Voucher types to sync — start with Sales, add more when ready
const SYNC_TYPES = ['Sales'];
// ───────────────────────────────────────────────────────────────

function toTallyDate(iso) {
  return iso.replace(/-/g, '');           // 2025-06-29 → 20250629
}

function fromTallyDate(s) {
  if (!s || s.length < 8) return '';
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function xmlTag(tag, src) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m  = (src || '').match(re);
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
}

function allBlocks(tag, src) {
  const re = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
  return (src || '').match(re) || [];
}

// ── POST raw XML to Tally's built-in HTTP server ──
function tallyPost(xmlBody) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(xmlBody, 'utf8');
    const req = http.request(
      {
        hostname: TALLY_HOST, port: TALLY_PORT, method: 'POST',
        headers: { 'Content-Type': 'text/xml;charset=utf-8', 'Content-Length': buf.length },
      },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end',  () => resolve(Buffer.concat(chunks).toString('utf8')));
      }
    );
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Tally connection timed out after 8s')); });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

function buildDayBookXML(from, to) {
  const co = COMPANY_NAME ? `<SVCURRENTCOMPANY>${COMPANY_NAME}</SVCURRENTCOMPANY>` : '';
  return `<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY><EXPORTDATA><REQUESTDESC>
    <REPORTNAME>Day Book</REPORTNAME>
    <STATICVARIABLES>
      <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      <SVFROMDATE>${from}</SVFROMDATE>
      <SVTODATE>${to}</SVTODATE>
      ${co}
    </STATICVARIABLES>
  </REQUESTDESC></EXPORTDATA></BODY>
</ENVELOPE>`;
}

function parseVouchers(xml) {
  return allBlocks('VOUCHER', xml)
    .map(v => ({
      date:      fromTallyDate(xmlTag('DATE', v)),
      type:      xmlTag('VOUCHERTYPENAME', v),
      number:    xmlTag('VOUCHERNUMBER', v),
      party:     xmlTag('PARTYLEDGERNAME', v),
      amount:    Math.abs(parseFloat(xmlTag('AMOUNT', v)) || 0),
      narration: xmlTag('NARRATION', v),
      reference: xmlTag('REFERENCE', v),
    }))
    .filter(v => SYNC_TYPES.includes(v.type));
}

// ── POST JSON to Apps Script, following the redirect it returns ──
function appsScriptPost(payload) {
  const body = JSON.stringify(payload);

  function doRequest(targetUrl) {
    return new Promise((resolve, reject) => {
      const parsed = url.parse(targetUrl);
      const mod    = parsed.protocol === 'https:' ? https : http;
      const req = mod.request(
        {
          hostname: parsed.hostname, path: parsed.path, method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        },
        res => {
          if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
            return doRequest(res.headers.location).then(resolve).catch(reject);
          }
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end',  () => {
            try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
            catch { resolve({ raw: Buffer.concat(chunks).toString().slice(0, 200) }); }
          });
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  return doRequest(APPS_SCRIPT_URL);
}

// ── Main ──
async function main() {
  const isoDate   = process.argv[2] || new Date().toISOString().split('T')[0];
  const tallyDate = toTallyDate(isoDate);

  console.log('\n╔══════════════════════════════════════╗');
  console.log('║  Maniram Industries — Tally Sync     ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`Date     : ${isoDate}`);
  console.log(`Tally    : ${TALLY_HOST}:${TALLY_PORT}`);
  console.log(`Syncing  : ${SYNC_TYPES.join(', ')} vouchers\n`);

  // 1. Connect to Tally and fetch Day Book
  let xml;
  try {
    xml = await tallyPost(buildDayBookXML(tallyDate, tallyDate));
  } catch (err) {
    console.error('✘ Cannot connect to Tally:');
    console.error('  →', err.message);
    console.error('\nTroubleshooting:');
    console.error('  • Make sure TallyPrime is open and showing Gateway of Tally');
    console.error('  • In Tally: F12 → Advanced Config → Allow Cross Object Access → Yes');
    console.error('  • In Tally: F1 → Features → Tally.NET → Enable');
    process.exit(1);
  }

  // 2. Parse Sales vouchers
  const vouchers = parseVouchers(xml);

  if (!vouchers.length) {
    console.log(`ℹ  No ${SYNC_TYPES.join('/')} vouchers found for ${isoDate}.`);
    console.log('   (This is normal on non-working days or if no sales were entered yet.)');
    process.exit(0);
  }

  console.log(`Found ${vouchers.length} voucher(s):\n`);
  vouchers.forEach(v =>
    console.log(`  ${v.type.padEnd(10)} ${v.number.padEnd(14)} ${v.party.padEnd(32)} ₹${v.amount.toLocaleString('en-IN')}`)
  );

  // 3. Send to Apps Script
  console.log('\nSending to Factory OS...');
  let result;
  try {
    result = await appsScriptPost({ action: 'syncTally', date: isoDate, vouchers });
  } catch (err) {
    console.error('✘ Could not reach Apps Script:', err.message);
    process.exit(1);
  }

  if (result.success) {
    console.log(`\n✔ Sync complete!`);
    console.log(`  ${result.matched || 0} order(s) auto-matched and marked Dispatched`);
    console.log(`  ${result.written || vouchers.length} row(s) logged to TallySync sheet`);
    if (result.skipped > 0) console.log(`  ${result.skipped} duplicate(s) skipped`);
  } else {
    console.error('\n✘ Apps Script returned an error:', result.error || JSON.stringify(result));
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

// ══════════════════════════════════════════════════════════════
// TALLY-SYNC.JS — Read TallySync sheet and render dashboard
// ══════════════════════════════════════════════════════════════

let tallyRows = [];

async function fetchTallySync() {
  const el = document.getElementById('tally-sync-list');
  if (!el) return;
  el.innerHTML = '<div class="empty-state">Loading Tally data...</div>';

  const range = encodeURIComponent(`${TALLY_SYNC_TAB}!A1:I500`);
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${ORDERS_SHEET_ID}/values/${range}?key=${API_KEY}`;

  try {
    const res  = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);

    const rows = json.values || [];
    if (rows.length < 2) {
      tallyRows = [];
      renderTallySync();
      return;
    }

    // Skip header row; map to objects
    tallyRows = rows.slice(1).map(r => ({
      syncedAt:   r[0] || '',
      date:       r[1] || '',
      type:       r[2] || '',
      voucherNo:  r[3] || '',
      party:      r[4] || '',
      amount:     parseFloat(r[5]) || 0,
      narration:  r[6] || '',
      orderId:    r[7] || '',
      matchStatus:r[8] || 'Unmatched',
    }));

    renderTallySync();
  } catch (err) {
    el.innerHTML = `<div class="empty-state" style="color:var(--danger)">Error loading Tally data: ${err.message}</div>`;
  }
}

function renderTallySync() {
  const el = document.getElementById('tally-sync-list');
  if (!el) return;

  if (!tallyRows.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div style="font-size:32px;margin-bottom:12px">📊</div>
        <div style="font-weight:600;margin-bottom:6px">No Tally data synced yet</div>
        <div style="font-size:12px;color:var(--muted)">Run <code style="background:var(--border);padding:2px 6px;border-radius:4px">node scripts/fetch-tally.js</code> on the Tally PC to start syncing.</div>
      </div>`;
    return;
  }

  // Summary stats
  const sales        = tallyRows.filter(r => r.type === 'Sales');
  const totalAmount  = sales.reduce((s, r) => s + r.amount, 0);
  const autoMatched  = sales.filter(r => r.matchStatus === 'Auto-matched').length;
  const unmatched    = sales.filter(r => r.matchStatus === 'Unmatched').length;

  // Date filter state
  const filterVal = document.getElementById('tally-filter-date')?.value || '';
  const visible   = filterVal
    ? tallyRows.filter(r => r.date === filterVal)
    : tallyRows;

  el.innerHTML = `
    <!-- Stats row -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
      ${statCard('Total Sales Synced', sales.length + ' vouchers', 'var(--blue)')}
      ${statCard('Auto-matched Orders', autoMatched, 'var(--success)')}
      ${statCard('Unmatched', unmatched, unmatched > 0 ? 'var(--warning)' : 'var(--muted)')}
    </div>

    <!-- Filter -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <label style="font-size:12px;font-weight:600;color:var(--muted)">Filter by date:</label>
      <input type="date" id="tally-filter-date" class="form-input"
        style="width:160px;font-size:13px" value="${filterVal}"
        onchange="renderTallySync()">
      ${filterVal ? `<button class="btn-secondary" style="font-size:12px;padding:5px 10px" onclick="document.getElementById('tally-filter-date').value='';renderTallySync()">✕ Clear</button>` : ''}
      <div style="margin-left:auto;font-size:12px;color:var(--muted)">${visible.length} row(s)</div>
    </div>

    <!-- Table -->
    ${visible.length === 0 ? '<div class="empty-state">No records for this date.</div>' : `
    <div class="table-wrap">
      <div class="table-header" style="grid-template-columns:90px 100px 1fr 110px 90px 110px">
        <div>Date</div><div>Voucher No.</div><div>Party (Customer)</div>
        <div style="text-align:right">Amount</div><div>Order ID</div><div>Status</div>
      </div>
      ${visible.map(r => `
        <div class="table-row" style="grid-template-columns:90px 100px 1fr 110px 90px 110px;align-items:center">
          <div style="font-size:12px;color:var(--muted)">${formatDateShort(r.date)}</div>
          <div style="font-family:monospace;font-size:11px">${r.voucherNo || '—'}</div>
          <div>
            <div style="font-weight:600;font-size:13px">${r.party || '—'}</div>
            ${r.narration ? `<div style="font-size:11px;color:var(--muted)">${r.narration.slice(0,60)}</div>` : ''}
          </div>
          <div style="text-align:right;font-weight:600;font-size:13px">₹${r.amount.toLocaleString('en-IN')}</div>
          <div style="font-family:monospace;font-size:11px;color:var(--blue)">${r.orderId || '—'}</div>
          <div>${matchBadge(r.matchStatus)}</div>
        </div>
      `).join('')}
    </div>`}

    <!-- Last sync note -->
    ${tallyRows.length ? `<div style="font-size:11px;color:var(--muted);margin-top:12px;text-align:right">Last synced: ${tallyRows[tallyRows.length-1].syncedAt}</div>` : ''}
  `;
}

function statCard(label, value, color) {
  return `
    <div class="stat-card" style="border-top-color:${color}">
      <div class="stat-value" style="color:${color}">${value}</div>
      <div class="stat-label">${label}</div>
    </div>`;
}

function matchBadge(status) {
  if (status === 'Auto-matched') {
    return `<span class="status-tag status-delivered" style="font-size:10px">✓ Matched</span>`;
  }
  return `<span class="status-tag status-new" style="font-size:10px;background:#FEF3C7;color:#92400E">Unmatched</span>`;
}

function formatDateShort(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch { return iso; }
}

// ══════════════════════════════════════════════════════════════
// EXPORT TO TALLY — build importable Tally XML vouchers
// TallyPrime: Gateway of Tally → Import → Vouchers → pick the file
// ══════════════════════════════════════════════════════════════

const LS_TALLY_CFG = 'mi_tally_cfg_v1';

function _xmlEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ISO (YYYY-MM-DD) → Tally date (YYYYMMDD)
function _tallyDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso).replace(/-/g, '');
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function _tallyCfg() {
  const saved = (() => { try { return JSON.parse(localStorage.getItem(LS_TALLY_CFG) || '{}'); } catch { return {}; } })();
  const cfg = {
    company:  (document.getElementById('tally-company')?.value        ?? saved.company  ?? '').trim(),
    sales:    (document.getElementById('tally-sales-ledger')?.value    ?? saved.sales    ?? 'Sales').trim() || 'Sales',
    purchase: (document.getElementById('tally-purchase-ledger')?.value ?? saved.purchase ?? 'Purchase').trim() || 'Purchase',
    scope:    (document.getElementById('tally-export-scope')?.value    ?? 'all'),
  };
  localStorage.setItem(LS_TALLY_CFG, JSON.stringify(cfg));
  return cfg;
}

// Prefill the config inputs from saved settings when the page opens
function initTallyExportCfg() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS_TALLY_CFG) || '{}'); } catch {}
  const set = (id, v) => { const el = document.getElementById(id); if (el && v != null && v !== '') el.value = v; };
  set('tally-company', saved.company);
  set('tally-sales-ledger', saved.sales);
  set('tally-purchase-ledger', saved.purchase);
}

function _inScope(dateIso, scope) {
  if (scope !== 'month') return true;
  return (dateIso || '').slice(0, 7) === new Date().toISOString().slice(0, 7);
}

// One Sales voucher: debit the party (debtor), credit the Sales ledger.
function _salesVoucherXML(inv, cfg) {
  const total = +inv.total || 0;
  const narr  = (inv.items || []).map(i => `${i.desc} x${i.qty}`).join(', ');
  return `   <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View">
     <DATE>${_tallyDate(inv.date)}</DATE>
     <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
     <VOUCHERNUMBER>${_xmlEsc(inv.id)}</VOUCHERNUMBER>
     <PARTYLEDGERNAME>${_xmlEsc(inv.party)}</PARTYLEDGERNAME>
     <NARRATION>${_xmlEsc(narr)}</NARRATION>
     <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>${_xmlEsc(inv.party)}</LEDGERNAME>
      <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
      <AMOUNT>-${total.toFixed(2)}</AMOUNT>
     </ALLLEDGERENTRIES.LIST>
     <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>${_xmlEsc(cfg.sales)}</LEDGERNAME>
      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
      <AMOUNT>${total.toFixed(2)}</AMOUNT>
     </ALLLEDGERENTRIES.LIST>
    </VOUCHER>
   </TALLYMESSAGE>`;
}

// One Purchase voucher: debit the Purchase ledger, credit the supplier.
function _purchaseVoucherXML(p, cfg) {
  const total = (+p.quantityKg || 0) * (+p.ratePerKg || 0);
  const narr  = `${p.reelSize}" reel · ${p.quantityKg}kg @ ₹${p.ratePerKg}/kg`;
  return `   <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <VOUCHER VCHTYPE="Purchase" ACTION="Create" OBJVIEW="Accounting Voucher View">
     <DATE>${_tallyDate(p.purchaseDate)}</DATE>
     <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
     <VOUCHERNUMBER>${_xmlEsc(p.id)}</VOUCHERNUMBER>
     <PARTYLEDGERNAME>${_xmlEsc(p.supplier)}</PARTYLEDGERNAME>
     <NARRATION>${_xmlEsc(narr)}</NARRATION>
     <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>${_xmlEsc(cfg.purchase)}</LEDGERNAME>
      <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
      <AMOUNT>-${total.toFixed(2)}</AMOUNT>
     </ALLLEDGERENTRIES.LIST>
     <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>${_xmlEsc(p.supplier)}</LEDGERNAME>
      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
      <AMOUNT>${total.toFixed(2)}</AMOUNT>
     </ALLLEDGERENTRIES.LIST>
    </VOUCHER>
   </TALLYMESSAGE>`;
}

function _tallyEnvelope(messages, company) {
  const companyVar = company ? `\n     <SVCURRENTCOMPANY>${_xmlEsc(company)}</SVCURRENTCOMPANY>` : '';
  return `<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>Vouchers</REPORTNAME>
    <STATICVARIABLES>${companyVar}
    </STATICVARIABLES>
   </REQUESTDESC>
   <REQUESTDATA>
${messages.join('\n')}
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;
}

function _downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'application/xml' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function _tallyStatus(msg, ok) {
  const el = document.getElementById('tally-export-status');
  if (el) { el.textContent = msg; el.style.color = ok ? 'var(--success)' : 'var(--danger)'; }
}

// kind: 'sales' | 'purchase' | 'both'
function exportTallyXML(kind) {
  const cfg = _tallyCfg();
  const messages = [];
  let sales = 0, pur = 0;

  if (kind === 'sales' || kind === 'both') {
    const invs = (typeof invoiceList !== 'undefined' ? invoiceList : [])
      .filter(inv => _inScope(inv.date, cfg.scope))
      .slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    invs.forEach(inv => { messages.push(_salesVoucherXML(inv, cfg)); sales++; });
  }
  if (kind === 'purchase' || kind === 'both') {
    const purs = (typeof purchases !== 'undefined' ? purchases : [])
      .filter(p => _inScope(p.purchaseDate, cfg.scope))
      .slice().sort((a, b) => (a.purchaseDate || '').localeCompare(b.purchaseDate || ''));
    purs.forEach(p => { messages.push(_purchaseVoucherXML(p, cfg)); pur++; });
  }

  if (!messages.length) {
    _tallyStatus('Nothing to export for the selected period.', false);
    return;
  }

  const xml   = _tallyEnvelope(messages, cfg.company);
  const stamp = new Date().toISOString().slice(0, 10);
  const name  = kind === 'both' ? `tally-vouchers-${stamp}.xml`
              : kind === 'sales' ? `tally-sales-${stamp}.xml`
              : `tally-purchases-${stamp}.xml`;
  _downloadFile(name, xml);

  const parts = [];
  if (sales) parts.push(`${sales} sales invoice${sales === 1 ? '' : 's'}`);
  if (pur)   parts.push(`${pur} purchase${pur === 1 ? '' : 's'}`);
  _tallyStatus(`✅ Exported ${parts.join(' + ')} → ${name}. Import it in TallyPrime: Gateway → Import → Vouchers.`, true);
}

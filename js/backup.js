// ══════════════════════════════════════════════════════════════
// BACKUP.JS — ☁️ Challans, invoices, payments and the order log live in
// this browser's storage. This sends every new or changed record to backup
// tabs in the Orders spreadsheet (Code.gs backupRecords), reads the tabs
// back to confirm they arrived, and can restore missing records into an
// empty or wiped browser. Restore only ever adds what is missing — it
// never overwrites a record this browser already has.
// ══════════════════════════════════════════════════════════════

const LS_BACKUP_STATE  = 'mi_backup_state_v1';    // kind → { key: hash } of what was last sent
const LS_BACKUP_STATUS = 'mi_backup_status_v1';   // last read-back check
const BK_BATCH = 200;

const _bkSum = (items, f) => (items || []).reduce((s, x) => s + (+f(x) || 0), 0);
const BK_KINDS = {
  challans: {
    label: 'Challans', tab: 'ChallansBackup',
    list: () => challanList, add: r => challanList.push(r), save: () => saveChallans(),
    key: r => r.dcNum,
    valid: r => r && typeof r.dcNum === 'string' && r.dcNum && Number.isFinite(+r.qty),
    // Never a second challan for a supervisor dispatch line already here
    skip: r => !!r.svTs && challanList.some(c => c.svTs === r.svTs),
    row: r => ({ date: r.date || '', party: r.customer || '', orders: r.orderId || '', qty: +r.qty || 0, amount: Math.round((+r.qty || 0) * (+r.rate || 0)) }),
  },
  invoices: {
    label: 'Invoices', tab: 'InvoicesBackup',
    list: () => invoiceList, add: r => invoiceList.push(r), save: () => saveInvoiceList(),
    key: r => r.id,
    valid: r => r && typeof r.id === 'string' && r.id && Array.isArray(r.items),
    // An invoice for a challan this computer doesn't have would bill it twice
    skip: r => r.items.some(it => it && it.challanDc && !challanList.some(c => c.dcNum === it.challanDc)),
    row: r => ({ date: r.date || '', party: r.party || '', orders: [...new Set((r.items || []).map(i => i.orderId || r.orderId).filter(Boolean))].join(', '),
                 qty: _bkSum(r.items, i => i.qty), amount: +r.total || 0 }),
  },
  payments: {
    label: 'Payments', tab: 'PaymentsBackup',
    list: () => payments, add: r => payments.push(r), save: () => savePayments(),
    key: r => r.id,
    valid: r => r && typeof r.id === 'string' && r.id && Number.isFinite(+r.amount),
    row: r => ({ date: r.date || '', party: r.customer || '', orders: '', qty: 0, amount: +r.amount || 0 }),
  },
  orderlog: {
    label: 'Order history', tab: 'OrderLogBackup',
    list: () => orderLog, add: r => orderLog.push(r), save: () => saveOrderLogList(),
    // Log entries have no ID — the same event always gives the same key
    key: r => 'L' + _bkHash([r.ts, r.orderId, r.event, r.detail].join('|')),
    valid: r => r && typeof r.orderId === 'string' && r.orderId && typeof r.event === 'string' && typeof r.ts === 'string',
    row: r => ({ date: String(r.ts || '').slice(0, 10), party: '', orders: r.orderId || '', qty: 0, amount: 0 }),
  },
};

// Small stable text hash (FNV-1a, two lanes) — change detection only
function _bkHash(s) {
  let a = 0x811c9dc5, b = 0xdeadbeef;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193) >>> 0; b = Math.imul(b ^ c, 0x85ebca6b) >>> 0; }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

// One backup row per record: readable columns + the full record as JSON
function _bkRows(kind, list) {
  const k = BK_KINDS[kind];
  return (list || []).filter(r => k.valid(r)).map(r => ({ key: k.key(r), ...k.row(r), json: JSON.stringify(r) }));
}

// What to send: new or changed rows, plus a "deleted" marker for keys that
// were sent before but are gone now. Returns the new sent-state too.
function _bkDiff(kind, rows, prev) {
  prev = prev || {};
  const state = {}, send = [];
  rows.forEach(r => {
    const h = _bkHash(r.json);
    state[r.key] = h;
    if (prev[r.key] !== h) send.push(r);
  });
  Object.keys(prev).forEach(key => { if (!(key in state)) send.push({ key, deleted: true }); });
  return { send, state };
}

function _bkLoad(k, d) { try { return JSON.parse(localStorage.getItem(k) || '') || d; } catch (e) { return d; } }
function _bkSave(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

// Send everything new or changed. Writes are fire-and-forget, so the
// read-back check (_bkVerify) is what proves they arrived.
async function backupNow(full) {
  const all = full ? {} : _bkLoad(LS_BACKUP_STATE, {});
  let sent = 0;
  for (const kind of Object.keys(BK_KINDS)) {
    let list;
    try { list = BK_KINDS[kind].list(); } catch (e) { continue; }   // that part of the app isn't loaded
    const { send, state } = _bkDiff(kind, _bkRows(kind, list), all[kind]);
    for (let i = 0; i < send.length; i += BK_BATCH) {
      mirrorToSheet('backupRecords', { kind, records: send.slice(i, i + BK_BATCH) });
      sent += Math.min(BK_BATCH, send.length - i);
    }
    all[kind] = state;
  }
  _bkSave(LS_BACKUP_STATE, all);
  return sent;
}

async function _bkReadTab(tab) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${ORDERS_SHEET_ID}/values/${encodeURIComponent(tab + '!A1:I20000')}?key=${API_KEY}&_=${Date.now()}`;
  const json = await (await fetch(url)).json();
  return json.error ? [] : (json.values || []);
}

// Read the backup tabs back and count what is really there. Anything this
// browser has that the sheet doesn't is forgotten from the sent-state, so
// the next backup sends it again.
async function _bkVerify() {
  const status = { at: new Date().toISOString(), kinds: {} };
  const all = _bkLoad(LS_BACKUP_STATE, {});
  for (const [kind, k] of Object.entries(BK_KINDS)) {
    let local;
    try { local = _bkRows(kind, k.list()).map(r => r.key); } catch (e) { continue; }
    let inSheet = new Set();
    try { inSheet = new Set((await _bkReadTab(k.tab)).slice(1).filter(r => r[0] && String(r[7]).toUpperCase() !== 'TRUE').map(r => String(r[0]))); }
    catch (e) { status.offline = true; }
    const missing = local.filter(key => !inSheet.has(key));
    if (all[kind]) missing.forEach(key => { delete all[kind][key]; });
    status.kinds[kind] = { local: local.length, backedUp: local.length - missing.length, inSheet: inSheet.size };
  }
  _bkSave(LS_BACKUP_STATE, all);
  _bkSave(LS_BACKUP_STATUS, status);
  _bkRenderButton();
  return status;
}

// Rebuild records from backup-tab rows: only those missing here, never
// deleted ones, never anything that doesn't look like a real record.
function _bkRestoreRows(kind, rows) {
  const k = BK_KINDS[kind];
  const have = new Set(k.list().map(r => { try { return k.key(r); } catch (e) { return ''; } }));
  let added = 0;
  (rows || []).slice(1).forEach(r => {
    if (!r || !r[0] || String(r[7]).toUpperCase() === 'TRUE') return;
    let rec;
    try { rec = JSON.parse(r[8]); } catch (e) { return; }
    if (!k.valid(rec) || have.has(k.key(rec)) || (k.skip && k.skip(rec))) return;
    k.add(rec); have.add(k.key(rec)); added++;
  });
  if (added) k.save();
  return added;
}

// Nothing stored on this computer yet (new computer, or browser wiped)
function _bkIsEmpty() {
  return Object.values(BK_KINDS).every(k => { try { return !k.list().length; } catch (e) { return true; } });
}

// Run before the supervisor register rebuilds challans: on an empty
// computer, bring the backup in first so no dispatch is made twice.
async function autoRestoreIfEmpty() {
  if (!_bkIsEmpty()) return 0;
  let total = 0;
  try {
    // challans before invoices, so invoices find the challans they bill
    for (const kind of ['challans', 'invoices', 'payments', 'orderlog']) total += _bkRestoreRows(kind, await _bkReadTab(BK_KINDS[kind].tab));
  } catch (e) { return 0; }
  if (total && typeof showToast === 'function') showToast(`☁️ Restored ${total} records from the backup`);
  return total;
}

async function restoreFromBackup() {
  const msg = document.getElementById('bk-msg');
  if (msg) msg.textContent = 'Reading the backup…';
  const added = {};
  try {
    for (const [kind, k] of Object.entries(BK_KINDS)) added[kind] = _bkRestoreRows(kind, await _bkReadTab(k.tab));
  } catch (e) {
    if (msg) msg.textContent = 'Could not read the backup — check the internet connection.';
    return;
  }
  const total = Object.values(added).reduce((s, n) => s + n, 0);
  if (typeof renderOrders === 'function') renderOrders();
  if (typeof renderChallansTab === 'function') renderChallansTab();
  if (typeof renderInvoicingPage === 'function') renderInvoicingPage();
  if (typeof renderReceivables === 'function') renderReceivables();
  await _bkVerify();
  openBackupPanel();
  const m2 = document.getElementById('bk-msg');
  if (m2) m2.textContent = total
    ? `Restored ${Object.entries(added).filter(([, n]) => n).map(([kind, n]) => `${n} ${BK_KINDS[kind].label.toLowerCase()}`).join(', ')}.`
    : 'Nothing was missing — this computer already has everything in the backup.';
}

function _bkRenderButton() {
  const b = document.getElementById('backup-btn');
  if (!b) return;
  const st = _bkLoad(LS_BACKUP_STATUS, null);
  if (!st) { b.textContent = '☁️ Backup'; return; }
  const missing = Object.values(st.kinds).reduce((s, k) => s + (k.local - k.backedUp), 0);
  b.textContent = st.offline ? '☁️ Backup ?' : missing ? `☁️ ${missing} not backed up` : '☁️ Backed up';
  b.style.color = missing || st.offline ? '#B45309' : '';
  b.title = `Last checked ${new Date(st.at).toLocaleString('en-IN')}`;
}

function openBackupPanel() {
  let ov = document.getElementById('backup-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'backup-overlay'; ov.className = 'popup-overlay';
    ov.onclick = e => { if (e.target === ov) ov.style.display = 'none'; };
    document.body.appendChild(ov);
  }
  const st = _bkLoad(LS_BACKUP_STATUS, null);
  const rows = Object.entries(BK_KINDS).map(([kind, k]) => {
    const s = st && st.kinds[kind];
    const ok = s && s.backedUp === s.local;
    return `<tr style="border-top:1px solid var(--border)">
      <td style="padding:7px 8px;font-weight:600">${k.label}</td>
      <td style="padding:7px 8px">${s ? s.local.toLocaleString('en-IN') : '—'}</td>
      <td style="padding:7px 8px">${s ? s.inSheet.toLocaleString('en-IN') : '—'}</td>
      <td style="padding:7px 8px;font-weight:700;color:${!s ? 'var(--muted)' : ok ? '#15803D' : '#B45309'}">${!s ? '—' : ok ? '✅ all backed up' : `${(s.local - s.backedUp).toLocaleString('en-IN')} not yet`}</td></tr>`;
  }).join('');
  ov.innerHTML = `<div class="popup-box" style="width:min(560px,95vw);max-width:none;padding:22px" onclick="event.stopPropagation()">
    <div class="popup-title">☁️ Backup</div>
    <div style="font-size:12px;color:var(--muted);margin:-6px 0 12px">Challans, invoices, payments and order history are kept in this browser and copied to backup tabs in the Orders spreadsheet every 5 minutes. ${st ? `Last checked ${new Date(st.at).toLocaleString('en-IN')}.` : 'Not checked yet.'}</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px">
      <thead><tr style="text-align:left;color:var(--muted);font-size:11px"><th style="padding:4px 8px">Record</th><th style="padding:4px 8px">On this computer</th><th style="padding:4px 8px">In backup</th><th style="padding:4px 8px">Status</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <div id="bk-msg" style="font-size:12px;min-height:16px;margin-bottom:10px"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn-primary" onclick="document.getElementById('bk-msg').textContent='Backing up…';backupNow(true).then(()=>setTimeout(()=>_bkVerify().then(openBackupPanel),6000))">☁️ Back up now</button>
      <button class="btn-secondary" onclick="restoreFromBackup()" title="Adds records that are in the backup but missing on this computer. Never overwrites anything.">⤓ Restore missing records</button>
      <button class="btn-secondary" style="margin-left:auto" onclick="document.getElementById('backup-overlay').style.display='none'">Close</button>
    </div></div>`;
  ov.style.display = 'flex';
}

// On load and every 5 minutes: send changes, then check they arrived
function initBackup() {
  _bkRenderButton();
  const cycle = () => backupNow().then(() => setTimeout(_bkVerify, 8000));
  setTimeout(cycle, 3000);
  setInterval(cycle, 5 * 60 * 1000);
}

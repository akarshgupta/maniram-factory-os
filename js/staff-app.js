// ══════════════════════════════════════════════════════════════
// STAFF-APP.JS — Staff Portal Logic
// ══════════════════════════════════════════════════════════════

const STAFF_PIN_KEY     = 'mi_staff_pin_v1';
const STAFF_SESSION_KEY = 'mi_staff_session_v1';
const STAFF_SESSION_TTL = 12 * 60 * 60 * 1000; // 12 hours

// ── Synchronous hash — works everywhere ──
function staffHash(str) {
  const input = 'MI_STAFF_SALT_' + str + '_2024';
  let a = 0x811c9dc5, b = 0xdeadbeef;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    a = (Math.imul(a ^ c, 0x01000193) >>> 0);
    b = (Math.imul(b ^ c, 0x85ebca6b) >>> 0);
  }
  return 'v2:' + a.toString(16).padStart(8,'0') + b.toString(16).padStart(8,'0');
}

// ── Auth ──
function staffSave(k,v)     { try { localStorage.setItem(k,v); return true; } catch(e) { return false; } }
function staffRead(k)        { try { return localStorage.getItem(k); } catch(e) { return null; } }
function staffGetSession()   { try { return JSON.parse(staffRead(STAFF_SESSION_KEY) || '{}'); } catch { return {}; } }
function staffIsLoggedIn()   { const s = staffGetSession(); return s.ok === true && typeof s.expires === 'number' && Date.now() < s.expires; }
function staffSetSession()   { staffSave(STAFF_SESSION_KEY, JSON.stringify({ ok: true, expires: Date.now() + STAFF_SESSION_TTL })); }
function staffClearSession() { try { localStorage.removeItem(STAFF_SESSION_KEY); } catch(e) {} }
function staffHasPin()       { return !!staffRead(STAFF_PIN_KEY); }

function staffShowAuthMode(mode) {
  const overlay = document.getElementById('staff-auth');
  if (overlay) overlay.style.display = 'flex';
  ['setup','login'].forEach(m => {
    const el = document.getElementById('staff-' + m + '-panel');
    if (el) el.style.display = m === mode ? 'block' : 'none';
  });
  const focusId = mode === 'setup' ? 'staff-new-pin' : 'staff-pin';
  setTimeout(() => { const el = document.getElementById(focusId); if (el) el.focus(); }, 80);
}
function staffHideAuth() { const el = document.getElementById('staff-auth'); if (el) el.style.display = 'none'; }
function staffShowErr(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
}

function checkStaffAuth() {
  if (staffIsLoggedIn()) { staffHideAuth(); return; }
  staffShowAuthMode(staffHasPin() ? 'login' : 'setup');
}

function staffSetup() {
  const p1 = (document.getElementById('staff-new-pin')?.value  || '').trim();
  const p2 = (document.getElementById('staff-new-pin2')?.value || '').trim();
  staffShowErr('staff-setup-err', '');
  if (p1.length < 4 || !/^\d+$/.test(p1)) { staffShowErr('staff-setup-err', 'PIN must be 4–6 numeric digits.'); return; }
  if (p1 !== p2) { staffShowErr('staff-setup-err', 'PINs do not match.'); return; }
  if (!staffSave(STAFF_PIN_KEY, staffHash(p1))) {
    staffShowErr('staff-setup-err', 'Browser blocked the save. Check if Private/Incognito mode is on.'); return;
  }
  staffSetSession();
  staffHideAuth();
}

function staffLogin() {
  const pin = (document.getElementById('staff-pin')?.value || '').trim();
  staffShowErr('staff-login-err', '');
  if (!pin) { staffShowErr('staff-login-err', 'Please enter your PIN.'); return; }
  const stored = staffRead(STAFF_PIN_KEY);
  if (!stored) { staffShowAuthMode('setup'); return; }
  if (staffHash(pin) === stored) {
    staffSetSession(); staffHideAuth();
  } else {
    staffShowErr('staff-login-err', 'Incorrect PIN. Please try again.');
    const el = document.getElementById('staff-pin'); if (el) { el.value = ''; el.focus(); }
  }
}

function staffLogout() {
  if (!confirm('Are you sure you want to logout?')) return;
  staffClearSession();
  const pinEl = document.getElementById('staff-pin');
  if (pinEl) pinEl.value = '';
  staffShowAuthMode('login');
}

// ══════════════════════════════════════════════════════════════
// DATA
// ══════════════════════════════════════════════════════════════

let staffOrders = [];
let staffStock  = [];
const tmrwStr   = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Delivery Date in the sheet comes as DD/MM/YYYY (or already ISO from a
// couple of manual edits) — same normalizer as parseSheetDate() in
// js/orders.js, duplicated here since staff.html doesn't load orders.js.
function _staffParseSheetDate(raw) {
  if (!raw) return '';
  const dmy = String(raw).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const y = dmy[3].length === 2 ? '20' + dmy[3] : dmy[3];
    return `${y}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return '';
}

async function staffFetchOrders() {
  const syncEl = document.getElementById('staff-orders-sync');
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${ORDERS_SHEET_ID}/values/${encodeURIComponent(ORDERS_TAB + '!A1:P500')}?key=${API_KEY}`;
    const res  = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    const rows = json.values || [];
    if (!rows.length) { staffOrders = []; renderStaffOrders(); updateTodayBanner(); if (syncEl) syncEl.innerHTML = '<div class="sync-dot ok"></div><span>No orders yet</span>'; return; }

    // Header-detected column mapping, same approach as fetchOrders() in
    // js/orders.js — the sheet's actual column order ("Order ID, Customer,
    // Product, Box Specs, Ply, Colour, Weight, Quantity, Rate, Delivery
    // Date, Status, Priority, ...") doesn't match a fixed position list
    // reliably, and has drifted before.
    const header = rows[0].map(h => h.toString().trim().toLowerCase());
    const col = {
      id:       header.findIndex(h => h.includes('order id') || h === 'id'),
      customer: header.findIndex(h => h.includes('customer')),
      product:  header.findIndex(h => h.includes('product')),
      spec:     header.findIndex(h => h.includes('box spec') || h.includes('specs') || h.includes('size')),
      ply:      header.findIndex(h => h === 'ply' || h.includes('ply')),
      colour:   header.findIndex(h => h.includes('colour') || h.includes('color')),
      qty:      header.findIndex(h => h.includes('quantity') || h === 'qty'),
      date:     header.findIndex(h => h.includes('delivery')),
      status:   header.findIndex(h => h === 'status'),
      priority: header.findIndex(h => h.includes('priority')),
    };

    // `customer` is kept in memory only to fill in the Dispatch/Production
    // Entry payloads (the sheet row format requires it, same as a Google
    // Form submission would) — it is never rendered anywhere in this portal.
    // `rate` is intentionally never parsed; nothing here needs it.
    // Filter on Customer, not Order ID, matching fetchOrders() in js/orders.js
    // — guards against stray non-order rows (e.g. a misfiled purchase row)
    // and split continuation rows that carry specs but no ID/customer.
    staffOrders = rows.slice(1).filter(r => r[col.customer]).map(r => ({
      id:       r[col.id]       || '',
      customer: col.customer >= 0 ? (r[col.customer] || '') : '',
      product:  col.product  >= 0 ? (r[col.product]  || '') : '',
      size:     col.spec     >= 0 ? (r[col.spec]     || '') : '',
      ply:      col.ply      >= 0 ? (r[col.ply]      || '') : '',
      colour:   col.colour   >= 0 ? (r[col.colour]   || '') : '',
      qty:      col.qty      >= 0 ? (parseFloat(r[col.qty]) || 0) : 0,
      delivery: col.date     >= 0 ? _staffParseSheetDate(r[col.date] || '') : '',
      status:   col.status   >= 0 ? (r[col.status]   || 'New') : 'New',
      priority: col.priority >= 0 ? (r[col.priority] || 'Normal') : 'Normal',
    }));

    if (syncEl) syncEl.innerHTML = '<div class="sync-dot ok"></div><span>Updated just now</span>';
    renderStaffOrders();
    updateTodayBanner();
  } catch(e) {
    if (syncEl) syncEl.innerHTML = `<div class="sync-dot error"></div><span>Fetch failed: ${e.message}</span>`;
  }
}

// The Stock sheet is a ledger — one row per reel lot (purchase or manual
// adjustment), not one row per size. Same flexible SIZE/GSM/BF/WEIGHT/QTY
// header detection as js/reels.js's fetchReelStock, kept as its own copy
// here since staff.html doesn't load reels.js (it depends on order/client
// data this portal never fetches). Rows are grouped by size+GSM+GY status,
// matching the office Reels page, so a width stocking two GSMs — or the
// same GSM in both plain and coloured (GY) — shows as separate rows.
async function staffFetchStock() {
  const syncEl = document.getElementById('staff-stock-sync');
  try {
    const url  = `https://sheets.googleapis.com/v4/spreadsheets/${REEL_SHEET_ID}/values/${encodeURIComponent(REEL_TAB + '!A1:Z500')}?key=${API_KEY}&_=${Date.now()}`;
    const res  = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    const rows = json.values || [];

    let headerRow = -1, colSize = -1, colGSM = -1, colBF = -1, colWeight = -1, colQty = -1;
    for (let i = 0; i < rows.length; i++) {
      const r  = rows[i].map(c => c.toString().trim().toUpperCase());
      const si = r.findIndex(c => c === 'SIZE' || c === 'REEL SIZE' || c === 'REEL_SIZE');
      if (si >= 0) {
        headerRow = i;
        colSize   = si;
        colGSM    = r.findIndex(c => c === 'GSM');
        colBF     = r.findIndex(c => c === 'BF');
        colWeight = r.findIndex(c => c.includes('WEIGHT') || c === 'WT' || c === 'NET WT' || c === 'GROSS WT' || c === 'KG');
        colQty    = r.findIndex(c => c === 'QTY' || c === 'QUANTITY' || c === 'REELS' || c === 'COUNT' || c === 'NOS' || c === 'NO.');
        break;
      }
    }
    if (headerRow < 0) throw new Error('Header not found in reel sheet — expected a SIZE column');

    const parsed = [];
    for (let i = headerRow + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r[colSize]) continue;
      const size   = parseFloat(r[colSize]);
      const weight = parseFloat(colWeight >= 0 ? r[colWeight] : 0);
      if (!size || isNaN(size)) continue;
      const qty    = colQty >= 0 ? (parseInt(r[colQty]) || 1) : 1;
      const gsmRaw = colGSM >= 0 ? (r[colGSM] || '').toString().trim() : '';
      const isColoured = r.some((cell, ci) =>
        ci !== colSize && ci !== colGSM && ci !== colBF && ci !== colWeight && ci !== colQty &&
        (cell || '').toString().trim().toUpperCase() === 'GY'
      );
      const is100Plain = (parseInt(gsmRaw) === 100 || gsmRaw === '100') && !isColoured;
      parsed.push({ size, gsm: gsmRaw || '—', bf: colBF >= 0 ? r[colBF] : '—', weight: isNaN(weight) ? 0 : weight, qty, is100Plain, isColoured });
    }

    const grouped = {};
    parsed.forEach(r => {
      const k = r.size.toString() + '|' + r.gsm + '|' + (r.isColoured ? 'gy' : 'plain');
      if (!grouped[k]) grouped[k] = { size: r.size, count: 0, plain100Count: 0, totalWeight: 0, gsm: r.gsm, bf: r.bf, hasColoured: r.isColoured };
      grouped[k].count       += r.qty;
      grouped[k].totalWeight += r.weight * r.qty;
      if (r.is100Plain) grouped[k].plain100Count += r.qty;
    });

    staffStock = Object.values(grouped).sort((a, b) => {
      if (b.size !== a.size) return b.size - a.size;
      const aG = parseFloat(a.gsm) || 0, bG = parseFloat(b.gsm) || 0;
      if (aG !== bG) return aG - bG;
      return (a.hasColoured ? 1 : 0) - (b.hasColoured ? 1 : 0); // plain before GY
    });

    if (syncEl) syncEl.innerHTML = '<div class="sync-dot ok"></div><span>Updated just now</span>';
    renderStaffStock();
  } catch(e) {
    if (syncEl) syncEl.innerHTML = `<div class="sync-dot error"></div><span>Fetch failed: ${e.message}</span>`;
  }
}

// ══════════════════════════════════════════════════════════════
// TABS
// ══════════════════════════════════════════════════════════════

const STAFF_TABS = ['orders','dispatchentry','productionentry','stock','delivery','weight','process'];
const STAFF_TAB_TITLES = {
  orders: '📦 Orders', dispatchentry: '🚚 Dispatch Entry', productionentry: '🏭 Production Entry',
  stock: '🧻 Reel Stock', delivery: '📅 Delivery Date', weight: '⚖️ Box Weight', process: '⚗️ Process Log',
};

function showStaffTab(id, btn) {
  STAFF_TABS.forEach(t => {
    document.getElementById('staff-tab-' + t).style.display = t === id ? 'block' : 'none';
  });
  // The Pending/Dispatched toggle buttons are also .staff-tab elements
  // (same look, different row) — only clear/set active state among the
  // main nav buttons, which are the direct children of .staff-tabs.
  document.querySelectorAll('.staff-tabs > .staff-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('staff-page-title').textContent = STAFF_TAB_TITLES[id] || id;

  if (id === 'stock'           && !staffStock.length)       staffFetchStock();
  if (id === 'process'         && !staffProcessLog.length)  staffFetchProcessLog();
  if (id === 'dispatchentry'   && !staffDispatchLog.length)  staffFetchDispatchLog();
  if (id === 'productionentry' && !staffProductionLog.length) staffFetchProductionLog();
}

// ══════════════════════════════════════════════════════════════
// ORDERS
// ══════════════════════════════════════════════════════════════

const ACTIVE_STATUSES = ['New','In Production','Ready'];
const STATUS_CLASS_MAP = {
  'New':           'status-new',
  'In Production': 'status-production',
  'Ready':         'status-ready',
  'Dispatched':    'status-dispatched',
  'Delivered':     'status-delivered',
  'Cancelled':     'status-cancelled',
};

function updateTodayBanner() {
  const active = staffOrders.filter(o => !['Delivered','Dispatched','Cancelled'].includes(o.status));
  document.getElementById('staff-due-today').textContent    = active.filter(o => o.delivery === todayStr).length;
  document.getElementById('staff-due-tomorrow').textContent = active.filter(o => o.delivery === tmrwStr).length;
}

// Pending = still active (New/In Production/Ready), always shown in full —
// current backlog shouldn't be month-scoped. Dispatched = Dispatched or
// Delivered, restricted to one month at a time (defaults to the current
// month) so this portal never becomes a browsable archive of the whole
// dispatch history.
let staffOrdersView = 'pending';

function setStaffOrdersView(view) {
  staffOrdersView = view;
  document.getElementById('staff-view-pending').classList.toggle('active', view === 'pending');
  document.getElementById('staff-view-dispatched').classList.toggle('active', view === 'dispatched');
  document.getElementById('staff-status-filter').style.display = view === 'pending'    ? '' : 'none';
  document.getElementById('staff-month-filter').style.display  = view === 'dispatched' ? '' : 'none';
  if (view === 'dispatched' && !document.getElementById('staff-month-filter').value) {
    document.getElementById('staff-month-filter').value = todayStr.slice(0, 7);
  }
  renderStaffOrders();
}

function renderStaffOrders() {
  const list    = document.getElementById('staff-orders-list');
  const filter  = document.getElementById('staff-status-filter')?.value || '';
  const month   = document.getElementById('staff-month-filter')?.value  || '';
  const query   = (document.getElementById('staff-search')?.value || '').toLowerCase().trim();

  let orders;
  if (staffOrdersView === 'dispatched') {
    orders = staffOrders.filter(o => ['Dispatched','Delivered'].includes(o.status));
    if (month) orders = orders.filter(o => (o.delivery || '').slice(0, 7) === month);
  } else {
    orders = staffOrders.filter(o => !['Delivered','Dispatched','Cancelled'].includes(o.status));
    if (filter) orders = orders.filter(o => o.status === filter);
  }
  if (query) orders = orders.filter(o =>
    o.product.toLowerCase().includes(query) ||
    o.id.toLowerCase().includes(query)      ||
    o.size.toLowerCase().includes(query)
  );

  // Sort: today first, then by delivery date
  orders.sort((a, b) => {
    if (a.delivery === todayStr && b.delivery !== todayStr) return -1;
    if (b.delivery === todayStr && a.delivery !== todayStr) return  1;
    return (a.delivery || '').localeCompare(b.delivery || '');
  });

  if (!orders.length) {
    list.innerHTML = `<div class="empty-state">${staffOrdersView === 'dispatched' ? 'No dispatched orders in this month.' : 'No pending orders.'}</div>`;
    return;
  }

  list.innerHTML = '';
  orders.forEach(o => {
    const isToday   = o.delivery === todayStr;
    const isTmrw    = o.delivery === tmrwStr;
    const isOverdue = o.delivery && o.delivery < todayStr && staffOrdersView === 'pending';
    const urgency   = isOverdue ? '#FEE2E2' : isToday ? '#FEF3C7' : 'transparent';

    const row = document.createElement('div');
    row.className = 'card';
    row.style.cssText = `margin-bottom:10px;padding:0;overflow:hidden;border-left:4px solid ${isToday || isOverdue ? 'var(--danger)' : isTmrw ? '#D97706' : 'var(--border)'}`;
    row.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:14px 16px;background:${urgency}">
        <div style="flex:1;min-width:160px">
          <div style="font-size:13px;font-weight:700;color:var(--navy);font-family:monospace">${o.id}</div>
          <div style="font-size:12px;color:var(--muted)">${o.product} · ${o.size} · ${o.ply}ply</div>
        </div>
        <div style="text-align:center;min-width:70px">
          <div style="font-size:16px;font-weight:800;color:var(--navy)">${o.qty.toLocaleString('en-IN')}</div>
          <div style="font-size:10px;color:var(--muted)">pcs</div>
        </div>
        <div style="text-align:center;min-width:90px">
          <div style="font-size:12px;font-weight:600;color:${isOverdue ? 'var(--danger)' : isToday ? '#B45309' : 'var(--navy)'}">
            ${isOverdue ? '⚠️ OVERDUE' : isToday ? '🔴 TODAY' : isTmrw ? '⚠️ Tomorrow' : formatDate(o.delivery)}
          </div>
          <div style="font-size:10px;color:var(--muted)">delivery</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="status-badge ${STATUS_CLASS_MAP[o.status] || ''}">${o.status}</span>
          ${staffOrdersView === 'pending' ? `<button class="status-btn" style="background:var(--primary);color:#fff" onclick="openStaffStatus('${o.id.replace(/'/g,"\\'")}')">✏️ Update</button>` : ''}
        </div>
      </div>
    `;
    list.appendChild(row);
  });
}

// ── Status update modal ──
let _staffStatusOrderId = null;

function openStaffStatus(orderId) {
  const o = staffOrders.find(x => x.id === orderId);
  if (!o) return;
  _staffStatusOrderId = orderId;
  document.getElementById('ss-order-id').textContent   = orderId;
  document.getElementById('ss-order-desc').textContent = `${o.product} · ${o.size} · ${o.qty.toLocaleString('en-IN')} pcs`;
  document.getElementById('ss-status').value = o.status;
  document.getElementById('staff-status-overlay').style.display = 'flex';
}

function closeStaffStatus() {
  document.getElementById('staff-status-overlay').style.display = 'none';
  _staffStatusOrderId = null;
}

function saveStaffStatus() {
  const newStatus = document.getElementById('ss-status').value;
  const o         = staffOrders.find(x => x.id === _staffStatusOrderId);
  if (!o) return;

  o.status = newStatus;
  closeStaffStatus();
  renderStaffOrders();
  updateTodayBanner();

  // Post to Apps Script
  fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    mode:   'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'updateOrderStatus', id: o.id, status: newStatus }),
  }).catch(() => {});
}

// ══════════════════════════════════════════════════════════════
// DISPATCH ENTRY / PRODUCTION ENTRY — direct entry into the same
// register the supervisor's Google Form writes into (SUPERVISOR_SHEET_ID,
// Production/Dispatch tabs), via the supervisorDispatchAppend /
// supervisorProductionAppend Apps Script actions. Once saved, these
// entries are indistinguishable from Form submissions on the office
// side — js/supervisor-log.js needs no changes to pick them up.
//
// The order picker only ever shows Order ID + Product + Size — never
// the customer name, phone, or rate. The selected order's customer
// name is still sent in the save payload (the sheet's Party column,
// same as a Form entry would carry), just never rendered here.
// ══════════════════════════════════════════════════════════════

// Google Sheets' Date-typed form answers serialize as M/D/YYYY (no
// leading zeros) — matches what js/supervisor-log.js's _svNormDate
// already expects, so a portal entry reads identically to a Form one.
function _toMDY(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  return m ? `${parseInt(m[2])}/${parseInt(m[3])}/${m[1]}` : '';
}

// ── Dispatch Entry ──
let _deFiltered      = [];
let _deSelectedOrder = null;

function onDeOrderInput() {
  const val = (document.getElementById('de-order-search')?.value || '').trim().toLowerCase();
  const dd  = document.getElementById('de-order-dropdown');
  const open = staffOrders.filter(o => !['Delivered','Dispatched','Cancelled'].includes(o.status));
  _deFiltered = !val ? open : open.filter(o =>
    o.id.toLowerCase().includes(val) || o.product.toLowerCase().includes(val) || o.size.toLowerCase().includes(val)
  );
  if (!_deFiltered.length) { dd.style.display = 'none'; return; }
  dd.innerHTML = '';
  _deFiltered.slice(0, 30).forEach(o => {
    const item = document.createElement('div');
    item.className = 'autocomplete-item';
    item.innerHTML = `<strong style="font-family:monospace">${o.id}</strong> — ${o.product} · ${o.size}`;
    item.onmousedown = () => selectDeOrder(o.id);
    dd.appendChild(item);
  });
  dd.style.display = 'block';
}

function selectDeOrder(orderId) {
  const o = staffOrders.find(x => x.id === orderId);
  document.getElementById('de-order-dropdown').style.display = 'none';
  if (!o) return;
  _deSelectedOrder = o;
  document.getElementById('de-order-search').value = '';
  document.getElementById('de-selected-id').textContent   = o.id;
  document.getElementById('de-selected-desc').textContent = ` — ${o.product} · ${o.size} · ${o.ply}ply`;
  document.getElementById('de-order-selected').style.display = 'block';
}

document.addEventListener('click', e => {
  const grp = document.getElementById('de-order-search')?.closest('.form-group');
  if (grp && !grp.contains(e.target)) {
    const dd = document.getElementById('de-order-dropdown');
    if (dd) dd.style.display = 'none';
  }
});

function saveDispatchEntry() {
  const msg = document.getElementById('de-msg');
  msg.innerHTML = '';

  if (!_deSelectedOrder) { msg.innerHTML = '⚠️ Pick an order above first.'; return; }
  const dateVal = document.getElementById('de-date').value;
  const pcs     = parseInt(document.getElementById('de-pcs').value)  || 0;
  const wtPc    = parseFloat(document.getElementById('de-wtpc').value) || 0;
  if (!dateVal)  { msg.innerHTML = '⚠️ Pick a date.'; return; }
  if (pcs <= 0)  { msg.innerHTML = '⚠️ Enter pieces dispatched.'; return; }
  if (wtPc <= 0) { msg.innerHTML = '⚠️ Enter the weight per piece.'; return; }

  const o = _deSelectedOrder;
  const payload = {
    date: _toMDY(dateVal), party: o.customer, pcs, size: o.size, wtPc,
    product: o.product, orderId: o.id,
  };

  fetch(APPS_SCRIPT_URL, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ action: 'supervisorDispatchAppend' }, payload)),
  }).catch(() => {});

  msg.innerHTML = `✅ Saved — ${pcs.toLocaleString('en-IN')} pcs of ${o.id} dispatched`;
  document.getElementById('de-pcs').value  = '';
  document.getElementById('de-wtpc').value = '';
  document.getElementById('de-order-selected').style.display = 'none';
  _deSelectedOrder = null;
  setTimeout(staffFetchDispatchLog, 3000);
}

let staffDispatchLog = [];

async function staffFetchDispatchLog() {
  const syncEl = document.getElementById('de-sync');
  try {
    const url  = `https://sheets.googleapis.com/v4/spreadsheets/${SUPERVISOR_SHEET_ID}/values/${encodeURIComponent(SUPERVISOR_DISP_TAB + '!A2:H500')}?key=${API_KEY}`;
    const res  = await fetch(url);
    const json = await res.json();
    // A json.error here almost always just means no entry has ever been saved yet.
    staffDispatchLog = json.error ? [] : (json.values || []).filter(r => r[0]).map(r => ({
      ts: r[0] || '', date: r[1] || '', pcs: parseInt(r[3]) || 0, size: r[4] || '',
      wtPc: parseFloat(r[5]) || 0, product: r[6] || '',
      orderId: (r[7] || '').toString().split('—')[0].trim(),
    })).sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    if (syncEl) syncEl.innerHTML = '<div class="sync-dot ok"></div><span>Updated just now</span>';
  } catch (e) {
    if (syncEl) syncEl.innerHTML = `<div class="sync-dot error"></div><span>Fetch failed: ${e.message}</span>`;
  }
  renderDispatchLog();
}

function renderDispatchLog() {
  const list = document.getElementById('de-list');
  if (!list) return;
  if (!staffDispatchLog.length) { list.innerHTML = '<div class="empty-state">No dispatch entries logged yet.</div>'; return; }
  list.innerHTML = staffDispatchLog.slice(0, 20).map(e => `
    <div class="card" style="margin-bottom:8px;padding:12px 16px">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center">
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--navy);font-family:monospace">${e.orderId || '—'}</div>
          <div style="font-size:11px;color:var(--muted)">${formatDate(e.date)}${e.product ? ' · ' + e.product : ''}${e.size ? ' · ' + e.size : ''}</div>
        </div>
        <div style="font-size:12px;font-weight:600">${e.pcs.toLocaleString('en-IN')} pcs${e.wtPc ? ` · ${e.wtPc} gm/pc` : ''}</div>
      </div>
    </div>`).join('');
}

// ── Production Entry ──
function saveProductionEntry() {
  const msg = document.getElementById('pe-msg');
  msg.innerHTML = '';

  const dateVal = document.getElementById('pe-date').value;
  if (!dateVal) { msg.innerHTML = '⚠️ Pick a date.'; return; }

  const payload = {
    date: _toMDY(dateVal),
    r1w: document.getElementById('pe-r1w').value.trim(),
    r1g: document.getElementById('pe-r1g').value.trim(),
    r2w: document.getElementById('pe-r2w').value.trim(),
    r2g: document.getElementById('pe-r2g').value.trim(),
    cutSize: document.getElementById('pe-cutsize').value.trim(),
    plyPcs:  document.getElementById('pe-plypcs').value.trim(),
    sheets:  document.getElementById('pe-sheets').value.trim(),
    rolls:   document.getElementById('pe-rolls').value.trim(),
  };
  if (!payload.r1w && !payload.cutSize) { msg.innerHTML = '⚠️ Enter at least a reel width or cut size.'; return; }

  fetch(APPS_SCRIPT_URL, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ action: 'supervisorProductionAppend' }, payload)),
  }).catch(() => {});

  msg.innerHTML = '✅ Saved';
  ['pe-r1w','pe-r1g','pe-r2w','pe-r2g','pe-cutsize','pe-plypcs','pe-sheets','pe-rolls'].forEach(id => {
    document.getElementById(id).value = '';
  });
  setTimeout(staffFetchProductionLog, 3000);
}

let staffProductionLog = [];

async function staffFetchProductionLog() {
  const syncEl = document.getElementById('pe-sync');
  try {
    const url  = `https://sheets.googleapis.com/v4/spreadsheets/${SUPERVISOR_SHEET_ID}/values/${encodeURIComponent(SUPERVISOR_PROD_TAB + '!A2:J500')}?key=${API_KEY}`;
    const res  = await fetch(url);
    const json = await res.json();
    staffProductionLog = json.error ? [] : (json.values || []).filter(r => r[0]).map(r => ({
      ts: r[0] || '', date: r[1] || '',
      r1w: r[2] || '', r1g: r[3] || '', r2w: r[4] || '', r2g: r[5] || '',
      cutSize: r[6] || '', plyPcs: r[7] || '', sheets: r[8] || '', rolls: r[9] || '',
    })).sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    if (syncEl) syncEl.innerHTML = '<div class="sync-dot ok"></div><span>Updated just now</span>';
  } catch (e) {
    if (syncEl) syncEl.innerHTML = `<div class="sync-dot error"></div><span>Fetch failed: ${e.message}</span>`;
  }
  renderProductionLog();
}

function renderProductionLog() {
  const list = document.getElementById('pe-list');
  if (!list) return;
  if (!staffProductionLog.length) { list.innerHTML = '<div class="empty-state">No production entries logged yet.</div>'; return; }
  list.innerHTML = staffProductionLog.slice(0, 20).map(e => `
    <div class="card" style="margin-bottom:8px;padding:12px 16px">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center">
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--navy)">${e.cutSize || e.plyPcs || '—'}</div>
          <div style="font-size:11px;color:var(--muted)">${formatDate(e.date)}${e.r1w ? ` · Reel ${e.r1w}"${e.r1g ? '/' + e.r1g + 'gsm' : ''}` : ''}</div>
        </div>
        <div style="font-size:12px;font-weight:600">${e.sheets ? e.sheets + ' sheets' : ''}${e.sheets && e.rolls ? ' · ' : ''}${e.rolls ? e.rolls + ' rolls' : ''}</div>
      </div>
    </div>`).join('');
}

// ══════════════════════════════════════════════════════════════
// REEL STOCK
// ══════════════════════════════════════════════════════════════

// Same criticality rule as the office Reels page: 35"+35.5" pooled, 42"
// and 44" on their own, all by plain-100-GSM count only; every other
// size/GSM always reads OK (no threshold defined for it).
function _staffReelStatus(r) {
  const s = r.size.toString();
  // Criticality is only tracked for the plain-100 group at a size — a
  // different GSM or a GY row at the same size just reads OK, same as any
  // untracked size (matches getReelStatus in js/reels.js).
  const isPlain100 = (parseInt(r.gsm) === 100 || r.gsm === '100') && !r.hasColoured;
  if (s === '35' || s === '35.5') {
    if (!isPlain100) return 'ok';
    const pool = staffStock.filter(x => x.size.toString() === '35' || x.size.toString() === '35.5')
      .reduce((sum, x) => sum + (x.plain100Count || 0), 0);
    return pool < MIN_REELS ? 'critical' : pool === MIN_REELS ? 'low' : 'ok';
  }
  if (s === '42' || s === '44') {
    if (!isPlain100) return 'ok';
    const cnt = staffStock.filter(x => x.size.toString() === s).reduce((sum, x) => sum + (x.plain100Count || 0), 0);
    return cnt < MIN_REELS ? 'critical' : cnt === MIN_REELS ? 'low' : 'ok';
  }
  return 'ok';
}

function renderStaffStock() {
  const list = document.getElementById('staff-stock-list');
  if (!staffStock.length) {
    list.innerHTML = `<div class="empty-state">No stock data found.</div>`;
    return;
  }
  const max = Math.max(...staffStock.map(r => r.count), 1);
  list.innerHTML = `<div class="card" style="padding:0">` + staffStock.map(r => {
    const status = _staffReelStatus(r);
    const pct    = Math.round((r.count / max) * 100);
    const gy     = r.hasColoured ? ' <span style="color:#B45309;font-weight:600">· GY</span>' : '';
    const gsmKey = (r.gsm || '—').toString();
    return `
      <div class="reel-item">
        <div class="reel-size" style="font-size:24px;width:76px">${r.size}"</div>
        <div class="reel-bar-wrap"><div class="reel-bar ${status}" style="width:${pct}%"></div></div>
        <div style="flex:1;padding:0 12px">
          <div style="font-size:14px;font-weight:700">${r.count} reels · ${Math.round(r.totalWeight).toLocaleString('en-IN')} kg</div>
          <div style="font-size:11px;color:var(--muted)">GSM ${r.gsm} · BF ${r.bf}${gy}</div>
        </div>
        <div class="reel-badge ${status}">${status === 'ok' ? 'OK' : status === 'low' ? 'LOW' : '⚠ CRIT'}</div>
        <button class="status-btn" style="background:var(--primary);color:#fff;margin-left:8px" onclick="adjustReelStock('${r.size}','${gsmKey.replace(/'/g,"\\'")}',${r.hasColoured ? 'true' : 'false'})">✏️ Adjust</button>
      </div>`;
  }).join('') + `</div>`;
}

// Appends a correction lot for the delta between the entered count and the
// current aggregated total — the Stock sheet is an append-only ledger of
// lots (same as a purchase), so an edit here is a new row, never a
// mutation of past ones, exactly like addReelStock already does for
// purchases. weightPerReel carries over the group's own average so the
// total tonnage moves proportionally with the count.
function adjustReelStock(sizeKey, gsmKey, isColoured) {
  const r = staffStock.find(x => x.size.toString() === sizeKey && (x.gsm || '—').toString() === gsmKey && !!x.hasColoured === !!isColoured);
  if (!r) return;
  const input = prompt(`Current count for ${r.size}" (GSM ${r.gsm}${r.hasColoured ? ' · GY' : ''}): ${r.count} reels.\n\nEnter the correct count:`, r.count);
  if (input === null) return;
  const newCount = parseInt(input);
  if (isNaN(newCount) || newCount < 0) { alert('Enter a valid number of reels.'); return; }
  const delta = newCount - r.count;
  if (delta === 0) return;

  const avgWeight = r.count > 0 ? (r.totalWeight / r.count) : 0;
  fetch(APPS_SCRIPT_URL, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'addReelStock', reelSize: r.size, gsm: r.gsm === '—' ? '' : r.gsm, bf: r.bf === '—' ? '' : r.bf,
      numReels: delta, weightPerReel: avgWeight,
    }),
  }).catch(() => {});

  // Optimistic local update so the list reflects the change immediately;
  // a real fetch a few seconds later reconciles it against the sheet.
  r.count       += delta;
  r.totalWeight += avgWeight * delta;
  if ((parseInt(r.gsm) === 100 || r.gsm === '100') && !r.hasColoured) r.plain100Count = (r.plain100Count || 0) + delta;
  renderStaffStock();
  setTimeout(staffFetchStock, 3000);
}

// ══════════════════════════════════════════════════════════════
// DELIVERY DATE SUGGESTER
// ══════════════════════════════════════════════════════════════

// Production rate assumptions (boxes per day per shift)
const PROD_RATE = { '3': 3000, '5': 2000, '7': 1500 };

function calcDelivery() {
  const qty   = parseInt(document.getElementById('dd-qty').value);
  const ply   = document.getElementById('dd-ply').value;
  const start = document.getElementById('dd-start').value;
  const res   = document.getElementById('dd-result');

  if (!qty || !start) { res.style.display = 'none'; return; }

  const rate      = PROD_RATE[ply] || 2000;
  const prodDays  = Math.ceil(qty / rate);
  const setupDays = 1; // setup + loading
  const totalDays = prodDays + setupDays;

  // Add days skipping Sundays
  let d     = new Date(start);
  let added = 0;
  while (added < totalDays) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) added++; // skip Sunday
  }

  document.getElementById('dd-date').textContent = d.toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  document.getElementById('dd-breakdown').textContent =
    `${qty.toLocaleString('en-IN')} pcs ÷ ${rate.toLocaleString('en-IN')} pcs/day = ${prodDays} production day${prodDays !== 1 ? 's' : ''} + 1 setup day = ${totalDays} days total (Sundays excluded)`;
  res.style.display = 'block';
}

// ══════════════════════════════════════════════════════════════
// BOX WEIGHT CALCULATOR
// ══════════════════════════════════════════════════════════════

// Layers per ply type: 3ply = 3 layers, 5ply = 5, 7ply = 7
function calcWeight() {
  const L   = parseFloat(document.getElementById('wt-l').value);
  const W   = parseFloat(document.getElementById('wt-w').value);
  const H   = parseFloat(document.getElementById('wt-h').value);
  const ply = parseInt(document.getElementById('wt-ply').value) || 3;
  const gsm = parseFloat(document.getElementById('wt-gsm').value) || 120;
  const qty = parseInt(document.getElementById('wt-qty').value) || 0;
  const res = document.getElementById('wt-result');

  if (!L || !W || !H) { res.style.display = 'none'; return; }

  // Sheet area for a box: 2*(L*W + L*H + W*H) in cm², converted to m²
  // A corrugated sheet is formed by: top liner + flutes + bottom liner
  // For 3ply: 2 liners + 1 fluted medium (flute adds ~30% length)
  // Simplified industry formula: total area = (2*(L+W) + 4cm joins) * (W+H) * ply_factor
  // Using RSC (Regular Slotted Container) blank area:
  //   blank width  = 2*(L + W) + join allowance (3cm)
  //   blank height = H + W + join allowance (2cm)
  const blankW  = 2 * (L + W) + 3;   // cm
  const blankH  = H + W + 2;          // cm
  const areaCm2 = blankW * blankH;    // cm²
  const areaM2  = areaCm2 / 10000;    // m²

  // Layers: 3ply=3, 5ply=5, 7ply=7; fluted layers add ~30% area for the wave
  const fluteLayers = Math.floor(ply / 2);   // 3ply→1, 5ply→2, 7ply→3
  const linerLayers = ply - fluteLayers;      // 3ply→2, 5ply→3, 7ply→4
  const totalArea   = areaM2 * (linerLayers + fluteLayers * 1.30);

  const weightG  = totalArea * gsm;         // grams
  const weightKg = weightG / 1000;

  document.getElementById('wt-per-box').textContent = weightG >= 1000
    ? weightKg.toFixed(2) + ' kg'
    : Math.round(weightG) + ' gm';
  res.style.display = 'block';

  if (qty > 0) {
    const batchKg = weightKg * qty;
    document.getElementById('wt-batch').textContent = batchKg >= 1000
      ? (batchKg / 1000).toFixed(2) + ' tonne'
      : batchKg.toFixed(1) + ' kg';
    document.getElementById('wt-note').textContent =
      `${qty.toLocaleString('en-IN')} boxes × ${weightG >= 1000 ? weightKg.toFixed(2) + ' kg' : Math.round(weightG) + ' gm'} each`;
    document.getElementById('wt-batch-block').style.display = 'block';
  } else {
    document.getElementById('wt-batch-block').style.display = 'none';
  }
}

// ══════════════════════════════════════════════════════════════
// PROCESS LOG — batch costing input (gum, stitching, …)
// Records raw material used + approx output produced only. Cost/kg itself
// is computed on the office app's Process Costing page (js/process-costing.js)
// from a ₹/kg rate the owner sets there — this portal just logs quantities.
// ══════════════════════════════════════════════════════════════

let staffProcessLog = [];

async function staffFetchProcessLog() {
  const syncEl = document.getElementById('pl-sync');
  try {
    const url  = `https://sheets.googleapis.com/v4/spreadsheets/${ORDERS_SHEET_ID}/values/${encodeURIComponent(PROCESS_LOG_TAB + '!A2:G200')}?key=${API_KEY}`;
    const res  = await fetch(url);
    const json = await res.json();
    // A json.error here almost always just means the ProcessLog tab doesn't
    // exist yet (no batch has ever been saved) — treat as "no entries", not a failure.
    staffProcessLog = json.error ? [] : (json.values || []).filter(r => r[0]).map(r => ({
      date: r[0] || '', process: r[1] || '',
      rawMaterialKg: parseFloat(r[2]) || 0, outputQty: parseFloat(r[3]) || 0,
      outputUnit: r[4] || 'kg', notes: r[5] || '', ts: r[6] || '',
    })).sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    if (syncEl) syncEl.innerHTML = '<div class="sync-dot ok"></div><span>Updated just now</span>';
  } catch (e) {
    if (syncEl) syncEl.innerHTML = `<div class="sync-dot error"></div><span>Fetch failed: ${e.message}</span>`;
  }
  renderProcessLog();
}

function onPlProcessChange() {
  const p = document.getElementById('pl-process').value;
  document.getElementById('pl-process-other-wrap').style.display = p === 'Other' ? 'block' : 'none';
  document.getElementById('pl-output-label').textContent = p === 'Gum' ? 'Gum produced, approx' : 'Output produced, approx';
  const unitEl = document.getElementById('pl-unit');
  if (p === 'Stitching') unitEl.value = 'boxes';
  else if (p !== 'Other') unitEl.value = 'kg';
}

function saveProcessBatch() {
  const msg = document.getElementById('pl-msg');
  msg.innerHTML = '';

  let process = document.getElementById('pl-process').value;
  if (process === 'Other') process = document.getElementById('pl-process-other').value.trim();
  const date       = document.getElementById('pl-date').value || todayStr;
  const rawKg      = parseFloat(document.getElementById('pl-raw-kg').value)     || 0;
  const outputQty  = parseFloat(document.getElementById('pl-output-qty').value) || 0;
  const outputUnit = document.getElementById('pl-unit').value || 'kg';
  const notes      = document.getElementById('pl-notes').value.trim();

  if (!process)       { msg.innerHTML = '⚠️ Select or enter a process.'; return; }
  if (rawKg <= 0)      { msg.innerHTML = '⚠️ Enter the raw material used (kg).'; return; }
  if (outputQty <= 0)  { msg.innerHTML = '⚠️ Enter the approximate output produced.'; return; }

  const entry = { date, process, rawMaterialKg: rawKg, outputQty, outputUnit, notes, ts: new Date().toISOString() };
  staffProcessLog.unshift(entry);
  renderProcessLog();

  fetch(APPS_SCRIPT_URL, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ action: 'processLogAppend' }, entry)),
  }).catch(() => {});

  msg.innerHTML = `✅ Saved — ${rawKg} kg → ${outputQty} ${outputUnit} of ${process}`;
  document.getElementById('pl-raw-kg').value     = '';
  document.getElementById('pl-output-qty').value = '';
  document.getElementById('pl-notes').value      = '';
  setTimeout(staffFetchProcessLog, 3000);
}

function renderProcessLog() {
  const list = document.getElementById('pl-list');
  if (!list) return;
  if (!staffProcessLog.length) { list.innerHTML = '<div class="empty-state">No batches logged yet.</div>'; return; }

  list.innerHTML = staffProcessLog.slice(0, 20).map(e => `
    <div class="card" style="margin-bottom:8px;padding:12px 16px">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center">
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--navy)">${e.process}</div>
          <div style="font-size:11px;color:var(--muted)">${formatDate(e.date)}${e.notes ? ' · ' + e.notes : ''}</div>
        </div>
        <div style="font-size:12px;font-weight:600">${e.rawMaterialKg.toLocaleString('en-IN')} kg → ${e.outputQty.toLocaleString('en-IN')} ${e.outputUnit}</div>
      </div>
    </div>`).join('');
}

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════

function staffInit() {
  document.getElementById('staff-topbar-date').textContent =
    new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  document.getElementById('dd-start').value = todayStr;
  document.getElementById('pl-date').value  = todayStr;
  document.getElementById('de-date').value  = todayStr;
  document.getElementById('pe-date').value  = todayStr;

  checkStaffAuth();
  if (staffIsLoggedIn()) {
    staffFetchOrders();
    setInterval(staffFetchOrders, 5 * 60 * 1000);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', staffInit);
} else {
  staffInit();
}

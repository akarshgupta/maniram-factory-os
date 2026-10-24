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
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${ORDERS_SHEET_ID}/values/${encodeURIComponent(ORDERS_TAB + '!A1:Z2000')}?key=${API_KEY}`;
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
      orderDate: header.findIndex(h => h === 'orderdate' || h.includes('order date')),
      weight:   header.findIndex(h => h === 'weight' || h.startsWith('weight')),
    };

    // Party names are shown in the Dispatch Entry party picker (the owner
    // asked for it); `rate` is intentionally never parsed — rates stay office-only.
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
      orderDate: col.orderDate >= 0 ? _staffParseSheetDate(r[col.orderDate] || '') : '',
      weight:   col.weight   >= 0 ? (parseFloat(r[col.weight]) || 0) : 0,
    }));
    _deFillPartyList();
    _deLoggedMap = null;

    if (syncEl) syncEl.innerHTML = '<div class="sync-dot ok"></div><span>Updated just now</span>';
    renderStaffOrders();
    updateTodayBanner();
    // The dispatched bars need the dispatch register
    if (!staffDispatchLog.length) staffFetchDispatchLog();
  } catch(e) {
    if (syncEl) syncEl.innerHTML = `<div class="sync-dot error"></div><span>Fetch failed: ${e.message}</span>`;
  }
}

// The Stock sheet is a ledger — one row per reel lot (purchase or manual
// adjustment), not one row per size. Same flexible SIZE/GSM/BF/WEIGHT/QTY
// header detection as js/reels.js's fetchReelStock, kept as its own copy
// here since staff.html doesn't load reels.js (it depends on order/client
// data this portal never fetches). Rows are grouped by size+GSM, matching
// the office Reels page, so a width stocking two GSMs shows as two rows.
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
        ci !== colSize && ci !== colGSM && ci !== colWeight && ci !== colQty &&
        isColouredMark(cell)
      );
      const is100Plain = (parseInt(gsmRaw) === 100 || gsmRaw === '100') && !isColoured;
      parsed.push({ size, gsm: gsmRaw || '—', bf: colBF >= 0 ? r[colBF] : '—', weight: isNaN(weight) ? 0 : weight, qty, is100Plain, isColoured });
    }

    const grouped = {};
    parsed.forEach(r => {
      const k = r.size.toString() + '|' + r.gsm;
      if (!grouped[k]) grouped[k] = { size: r.size, count: 0, plain100Count: 0, totalWeight: 0, gsm: r.gsm, bf: r.bf, hasColoured: false };
      grouped[k].count       += r.qty;
      grouped[k].totalWeight += r.weight * r.qty;
      if (r.is100Plain)  grouped[k].plain100Count += r.qty;
      if (r.isColoured)  grouped[k].hasColoured = true;
    });

    staffStock = Object.values(grouped).sort((a, b) => {
      if (b.size !== a.size) return b.size - a.size;
      const aG = parseFloat(a.gsm) || 0, bG = parseFloat(b.gsm) || 0;
      return aG - bG;
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

const STAFF_TABS = ['orders','dispatchentry','productionentry','stock','delivery','weight','process','vehicles'];
const STAFF_TAB_TITLES = {
  orders: '📦 Orders', dispatchentry: '🚚 Dispatch Entry', productionentry: '🏭 Production Entry',
  stock: '🧻 Reel Stock', delivery: '📅 Delivery Date', weight: '⚖️ Box Weight', process: '⚗️ Process Log', vehicles: '🚛 Vehicles',
};

const LS_STAFF_TAB = 'mi_staff_last_tab_v1';
function showStaffTab(id, btn) {
  if (!STAFF_TABS.includes(id)) id = 'orders';
  // Remember it, so a refresh comes back to this tab instead of Orders
  try { localStorage.setItem(LS_STAFF_TAB, id); } catch (e) {}
  if (!btn) btn = [...document.querySelectorAll('.staff-tabs > .staff-tab')].find(b => (b.getAttribute('onclick') || '').includes(`'${id}'`));
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
  if (id === 'vehicles') {
    renderVehiclesPage();
    loadVehicles();
    if (!staffDispatchLog.length) staffFetchDispatchLog().then(renderVehiclesPage);
  }
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
  // What actually went out today, from the dispatch register
  const today = (typeof staffDispatchLog !== 'undefined' ? staffDispatchLog : []).filter(e => _deDayKey(e.date) === todayStr);
  const sentEl = document.getElementById('staff-sent-today');
  if (sentEl) {
    sentEl.textContent = today.reduce((s, e) => s + (e.pcs || 0), 0).toLocaleString('en-IN');
    const parties = new Set(today.map(e => _deKey(e.party)).filter(Boolean)).size;
    document.getElementById('staff-sent-today-sub').textContent = `pieces · ${today.length} line${today.length === 1 ? '' : 's'} · ${parties} part${parties === 1 ? 'y' : 'ies'}`;
  }
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
    // Month of the order's last dispatch — most orders carry no delivery date
    if (month) orders = orders.filter(o => (_deLastDay(o.id) || o.delivery || o.orderDate || '').slice(0, 7) === month);
  } else {
    orders = staffOrders.filter(o => !['Delivered','Dispatched','Cancelled'].includes(o.status));
    if (filter) orders = orders.filter(o => o.status === filter);
  }
  // Party dropdown: every party with an order in this view, with its count
  const partySel = document.getElementById('staff-party-filter');
  let party = partySel?.value || '';
  if (partySel) {
    const counts = {};
    orders.forEach(o => { const k = _deKey(o.customer); if (!k) return; (counts[k] = counts[k] || { name: o.customer.trim(), n: 0 }).n++; });
    partySel.innerHTML = '<option value="">All parties</option>' + Object.entries(counts).sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([k, c]) => `<option value="${k}" ${k === party ? 'selected' : ''}>${c.name.replace(/</g, '&lt;')} (${c.n})</option>`).join('');
    if (party && !counts[party]) party = '';   // that party has nothing in this view
  }
  if (party) orders = orders.filter(o => _deKey(o.customer) === party);
  if (query) orders = orders.filter(o =>
    (o.customer || '').toLowerCase().includes(query) ||
    o.product.toLowerCase().includes(query) ||
    o.id.toLowerCase().includes(query)      ||
    o.size.toLowerCase().includes(query)
  );

  // Totals for the chosen party
  const sumEl = document.getElementById('staff-party-summary');
  if (sumEl) {
    if (party && orders.length) {
      const q = orders.reduce((s, o) => s + (o.qty || 0), 0);
      const d = orders.reduce((s, o) => s + Math.min(o.qty || 0, _deLogged(o.id)), 0);
      sumEl.innerHTML = `<div class="card" style="margin-bottom:12px;padding:12px 16px;background:#EFF6FF;display:flex;gap:18px;flex-wrap:wrap;align-items:center">
        <div style="font-size:15px;font-weight:800;color:var(--navy);flex:1;min-width:150px">${orders[0].customer.replace(/</g, '&lt;')}</div>
        <div><div style="font-size:11px;color:var(--muted)">Orders</div><div style="font-size:17px;font-weight:800">${orders.length}</div></div>
        <div><div style="font-size:11px;color:var(--muted)">Ordered</div><div style="font-size:17px;font-weight:800">${q.toLocaleString('en-IN')}</div></div>
        <div><div style="font-size:11px;color:var(--muted)">Dispatched</div><div style="font-size:17px;font-weight:800;color:#15803D">${d.toLocaleString('en-IN')}</div></div>
        <div><div style="font-size:11px;color:var(--muted)">Pending</div><div style="font-size:17px;font-weight:800;color:#B45309">${(q - d).toLocaleString('en-IN')}</div></div>
      </div>`;
    } else sumEl.innerHTML = '';
  }

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
          <div style="font-size:12px;color:var(--muted)">${o.customer ? o.customer + ' · ' : ''}${o.product} · ${o.size} · ${o.ply}ply${o.colour ? ' · ' + o.colour : ''}</div>
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
      ${_staffOrderProgressHtml(o)}
    `;
    list.appendChild(row);
  });
}

// Dispatched / pending bar and order age — same idea as the office Orders
// page. Dispatched = pieces logged against this order ID in the dispatch
// register (the office splits a dispatch across same-item orders oldest
// first, so its own figure can differ slightly).
function _staffOrderProgressHtml(o) {
  const qty  = o.qty || 0;
  const sent = typeof _deLogged === 'function' ? _deLogged(o.id) : 0;
  const pend = Math.max(0, qty - sent);
  const pct  = qty ? Math.min(100, Math.round(sent / qty * 100)) : 0;
  let age = '';
  if (o.orderDate) {
    const days = Math.max(0, Math.round((new Date(todayStr + 'T00:00:00') - new Date(o.orderDate + 'T00:00:00')) / 86400000));
    const c = days > 30 ? 'var(--danger)' : days > 14 ? '#B45309' : 'var(--navy)';
    age = `<div style="text-align:right;white-space:nowrap"><div style="font-size:12px;font-weight:700;color:var(--navy)">Ordered ${formatDate(o.orderDate)}</div>
      <div style="font-size:12px;font-weight:800;color:${c}">${days === 0 ? 'today' : days === 1 ? '1 day ago' : days + ' days ago'}</div></div>`;
  }
  return `<div style="display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;padding:10px 16px;border-top:1px solid var(--border)">
    <div style="flex:1 1 220px;min-width:0">
      <div style="height:9px;border-radius:5px;background:#FDE68A;overflow:hidden"><div style="height:100%;width:${pct}%;background:#16A34A"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:4px;gap:8px">
        <span style="color:#15803D;font-weight:700">🚚 ${sent.toLocaleString('en-IN')} dispatched</span>
        <span style="color:#B45309;font-weight:700">${pend.toLocaleString('en-IN')} pending · ${pct}%</span>
      </div>
    </div>
    ${age}
  </div>`;
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
// Party first (dropdown of every party on the Orders sheet), then that
// party's pending orders, oldest first. If the order isn't there: add a new
// order (saved to the Orders sheet with no rate — the office sets it), or
// log the dispatch against the party without an order (the office links it).
// Rates are never shown here.
let _deMode = '';          // 'order' | 'new' | 'free'
let _deSelectedOrder = null;
const _deKey = n => String(n || '').toLowerCase().replace(/^m\/s\.?\s*/, '').replace(/[^a-z0-9]/g, '');
const _deDone = ['Delivered', 'Dispatched', 'Cancelled'];

function _deParties() {
  const seen = {};
  staffOrders.forEach(o => { const k = _deKey(o.customer); if (k && !seen[k]) seen[k] = o.customer.trim(); });
  return Object.values(seen).sort((a, b) => a.localeCompare(b));
}

function _deFillPartyList() {
  const dl = document.getElementById('de-party-list');
  if (dl) dl.innerHTML = _deParties().map(p => `<option value="${p.replace(/"/g, '&quot;')}">`).join('');
}

// Pieces already logged against an order from this portal / the register
// Pieces dispatched against each order, rebuilt when orders or the register
// change. Lines with an Order ID count for that order. Older lines without
// one are matched the way the office does it: same party, same product (and
// size), filling the oldest open order first — so the figure lines up with
// the office Orders page.
let _deLoggedMap = null, _deLoggedSig = '';
const _deDims = v => { const m = String(v || '').match(/(\d+(?:\.\d+)?)\s*[*x×]\s*(\d+(?:\.\d+)?)\s*[*x×]\s*(\d+(?:\.\d+)?)/i); return m ? [m[1], m[2], m[3]].map(Number).sort((a, b) => a - b).join('x') : ''; };
const _deNorm = v => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function _deBuildLogged() {
  const log = typeof staffDispatchLog !== 'undefined' ? staffDispatchLog : [];
  const sig = staffOrders.length + ':' + log.length;
  if (_deLoggedMap && sig === _deLoggedSig) return _deLoggedMap;
  const map = {}, last = {}, ids = new Set(staffOrders.map(o => o.id));
  const seen = (id, e) => { const d = _deDayKey(e.date); if (d && (!last[id] || d > last[id])) last[id] = d; };
  log.forEach(e => { if (e.orderId && ids.has(e.orderId)) { map[e.orderId] = (map[e.orderId] || 0) + (e.pcs || 0); seen(e.orderId, e); } });
  const pk = v => _deKey(v).slice(0, 4);   // "RP Prodect" still finds "RP Products"
  [...log].filter(e => !e.orderId || !ids.has(e.orderId)).sort((a, b) => _staffTsNum(a.ts) - _staffTsNum(b.ts)).forEach(e => {
    const p = _deNorm(e.product), d = _deDims(e.size || e.product);
    if (!p && !d) return;
    const cands = staffOrders.filter(o => pk(o.customer) && pk(o.customer) === pk(e.party) &&
      (!p || (_deNorm(o.product) && (_deNorm(o.product).includes(p) || p.includes(_deNorm(o.product))))) &&
      (!d || !_deDims(o.size) || _deDims(o.size) === d))
      .sort((a, b) => (a.orderDate || '').localeCompare(b.orderDate || '') || a.id.localeCompare(b.id));
    if (!cands.length) return;
    let left = e.pcs || 0;
    cands.forEach((o, i) => {
      if (left <= 0) return;
      const room = Math.max(0, (o.qty || 0) - (map[o.id] || 0));
      const take = i === cands.length - 1 ? left : Math.min(left, room);
      if (take > 0) { map[o.id] = (map[o.id] || 0) + take; left -= take; seen(o.id, e); }
    });
  });
  _deLoggedMap = map; _deLastDayMap = last; _deLoggedSig = sig;
  return map;
}
let _deLastDayMap = {};
function _deLogged(id) { return _deBuildLogged()[id] || 0; }
function _deLastDay(id) { _deBuildLogged(); return _deLastDayMap[id] || ''; }

function _deSetMode(mode) {
  _deMode = mode;
  document.getElementById('de-new').style.display  = mode === 'new'  ? 'block' : 'none';
  document.getElementById('de-free').style.display = mode === 'free' ? 'block' : 'none';
  // Once something is picked, only that stays on screen; "Change" brings the list back
  const picked = !!mode;
  document.querySelectorAll('#de-orders [data-oid], #de-orders [data-mode], #de-orders .de-head').forEach(el => {
    const on = (mode === 'order' && _deSelectedOrder && el.dataset.oid === _deSelectedOrder.id) || (el.dataset.mode && el.dataset.mode === mode);
    el.style.display     = !picked || on ? '' : 'none';
    el.style.borderColor = on ? 'var(--blue)' : 'var(--border)';
    el.style.background  = on ? '#EFF6FF' : '';
  });
  const ch = document.getElementById('de-change');
  if (ch) ch.style.display = picked ? 'block' : 'none';
  _deWeightHint();
}

// Expected weight from the order vs the sample box the supervisor weighed
function _deWeightHint() {
  const el = document.getElementById('de-wt-hint');
  if (!el) return;
  const exp = _deMode === 'order' && _deSelectedOrder ? (parseFloat(_deSelectedOrder.weight) || 0) : 0;
  const act = parseFloat(document.getElementById('de-wtpc')?.value) || 0;
  if (!exp) { el.innerHTML = act ? '' : '<span style="color:var(--muted)">Weigh one box from this lot and enter it above.</span>'; return; }
  if (!act) { el.innerHTML = `Expected weight of this box: <strong>${exp} gm</strong> — weigh one box and enter it above.`; return; }
  const diff = (act - exp) / exp * 100, a = Math.abs(diff);
  const c = a <= 3 ? '#15803D' : a <= 7 ? '#B45309' : '#B91C1C';
  el.innerHTML = `Expected <strong>${exp} gm</strong> · actual <strong>${act} gm</strong> · <strong style="color:${c}">${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%</strong>${a > 7 ? ' — check the paper GSM or size' : ''}`;
}

let _deLastParty = null;
function onDeParty(force) {
  const party = (document.getElementById('de-party')?.value || '').trim();
  // input + change both fire; re-drawing for the same party on blur would
  // swallow the tap on an order card that caused the blur
  if (!force && party === _deLastParty) return;
  // Products already added were for the previous party — start the vehicle over
  if (!force && _deItems.length && _deKey(party) !== _deKey(_deLastParty)) { _deItems = []; _deRenderItems(); }
  _deLastParty = party;
  const box = document.getElementById('de-orders');
  _deSelectedOrder = null; _deSetMode('');
  _deFillProducts(party);
  if (!party) { box.innerHTML = ''; return; }
  const known = _deParties().some(p => _deKey(p) === _deKey(party));
  const open = staffOrders.filter(o => _deKey(o.customer) === _deKey(party) && !_deDone.includes(o.status))
    .sort((a, b) => (a.orderDate || '').localeCompare(b.orderDate || '') || a.id.localeCompare(b.id));
  const card = o => {
    const logged = _deLogged(o.id);
    return `<div data-oid="${o.id}" onclick="selectDeOrder('${o.id}')" style="padding:9px 11px;border:1.5px solid var(--border);border-radius:9px;margin-bottom:6px;cursor:pointer">
      <div style="font-weight:800;font-size:14px;color:var(--navy)">${o.product || o.size || '—'}</div>
      <div style="font-size:12px">${[o.size, o.colour, o.ply ? o.ply + ' ply' : '', o.weight ? o.weight + ' gm/box' : ''].filter(Boolean).join(' · ')}</div>
      <div style="font-size:12px;margin-top:2px"><strong>${(o.qty || 0).toLocaleString('en-IN')} pcs</strong>${logged ? ` · ${logged.toLocaleString('en-IN')} logged so far` : ''}
        <span style="color:var(--muted)"> · ${o.id}${o.orderDate ? ' · ordered ' + formatDate(o.orderDate) : ''}</span></div></div>`;
  };
  const opt = (mode, label) => `<div data-mode="${mode}" onclick="_deSetMode('${mode}')" style="padding:9px 11px;border:1.5px dashed var(--border);border-radius:9px;margin-bottom:6px;cursor:pointer;font-size:13px;font-weight:700;color:var(--navy)">${label}</div>`;
  box.innerHTML =
    (open.length ? `<div class="de-head" style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:5px">Pending orders — oldest first, tap one</div>${open.map(card).join('')}`
      : `<div class="de-head" style="font-size:12px;color:var(--muted);margin-bottom:6px">${known ? 'No pending orders for this party.' : 'New party — not on any order yet.'}</div>`) +
    `<div class="de-head" style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin:8px 0 5px">Order not in the list?</div>` +
    opt('new', '➕ Add a new order for this party') +
    opt('free', '📦 Dispatch for this party without an order') +
    `<a id="de-change" href="#" onclick="event.preventDefault();_deSelectedOrder=null;_deSetMode('')" style="display:none;font-size:12px;font-weight:700;margin:2px 0 6px">↺ Change order</a>`;
}

// Every product this party has ever ordered (any status), so a new order or
// a no-order dispatch is picked from a list with size, colour and ply filled
// in from the earlier order — instead of typed by hand and mis-spelt.
let _deProducts = [];
function _deFillProducts(party) {
  const seen = {};
  staffOrders.filter(o => _deKey(o.customer) === _deKey(party) && (o.product || o.size)).forEach(o => {
    const k = [_deNorm(o.product), _deDims(o.size), _deNorm(o.colour), o.ply].join('|');
    if (!seen[k]) seen[k] = { product: o.product || '', size: o.size || '', colour: o.colour || '', ply: String(o.ply || ''), weight: o.weight || 0 };
  });
  _deProducts = Object.values(seen).sort((a, b) => (a.product || a.size).localeCompare(b.product || b.size));
  const opts = `<option value="">${_deProducts.length ? '— pick a product —' : 'No products on file for this party'}</option>` +
    _deProducts.map((p, i) => `<option value="${i}">${[p.product, p.size, p.colour, p.ply ? p.ply + ' ply' : ''].filter(Boolean).join(' · ').replace(/</g, '&lt;')}</option>`).join('') +
    '<option value="other">✏️ Other — type it below</option>';
  ['de-n-pick', 'de-free-pick'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = opts; });
}
function pickDeProduct(which) {
  const sel = document.getElementById(which === 'n' ? 'de-n-pick' : 'de-free-pick');
  const p = _deProducts[+sel.value];
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  if (which === 'n') {
    set('de-n-product', p ? p.product : ''); set('de-n-size', p ? p.size : ''); set('de-n-colour', p ? p.colour : '');
    if (p && p.ply) set('de-n-ply', p.ply);
  } else { set('de-free-product', p ? p.product : ''); set('de-free-size', p ? p.size : ''); }
  if (p && p.weight) document.getElementById('de-wt-hint').innerHTML = `Expected weight of this box: <strong>${p.weight} gm</strong> (from the earlier order).`;
  (document.getElementById(which === 'n' ? (p ? 'de-n-qty' : 'de-n-product') : (p ? 'de-pcs' : 'de-free-product')) || {}).focus?.();
}

function selectDeOrder(orderId) {
  _deSelectedOrder = staffOrders.find(x => x.id === orderId) || null;
  _deSetMode(_deSelectedOrder ? 'order' : '');
}

function _deNextOrderId() {
  let max = 0;
  staffOrders.forEach(o => { const m = String(o.id || '').match(/MIORD(\d+)/i); if (m) max = Math.max(max, +m[1]); });
  return 'MIORD' + String(max + 1).padStart(3, '0');
}

// ── Vehicle for this trip (shared list with the office 🚛 Vehicles page) ──
let _deVehicles = [];
function _deFillVehicles(selectNumber) {
  const sel = document.getElementById('de-vehicle');
  if (!sel) return;
  const keep = selectNumber || sel.value;
  sel.innerHTML = '<option value="">— pick the vehicle —</option>' +
    _deVehicles.map(v => `<option value="${v.number.replace(/"/g, '&quot;')}">${vehicleLabel(v).replace(/</g, '&lt;')}</option>`).join('') +
    '<option value="__new">➕ New vehicle…</option>';
  if (keep && keep !== '__new') sel.value = keep;
}
async function loadDeVehicles() { _deVehicles = await fetchVehicleList(); _deFillVehicles(); }
// The 🚛 Vehicles tab (vehicles.js) saves through saveVehicleRecord too — refresh the picker from the same cache
function _deRefreshVehiclePicker() { _deVehicles = loadCachedVehicles(); _deFillVehicles(); }
function onDeVehicle() {
  document.getElementById('de-v-new').style.display = document.getElementById('de-vehicle').value === '__new' ? 'block' : 'none';
}
function saveDeVehicle() {
  const v = id => (document.getElementById(id)?.value || '').trim();
  const msg = document.getElementById('de-msg');
  const number = v('de-v-number').toUpperCase();
  if (vehicleKey(number).length < 4) { msg.innerHTML = '⚠️ Enter the vehicle number.'; return; }
  if (!v('de-v-driver') && !v('de-v-owner')) { msg.innerHTML = '⚠️ Enter the driver or owner name.'; return; }
  _deVehicles = saveVehicleRecord({ number, type: v('de-v-type'), owner: v('de-v-owner'), ownerPhone: v('de-v-ownerphone'), driver: v('de-v-driver'), driverPhone: v('de-v-driverphone') });
  ['de-v-number', 'de-v-type', 'de-v-owner', 'de-v-ownerphone', 'de-v-driver', 'de-v-driverphone'].forEach(id => { document.getElementById(id).value = ''; });
  _deFillVehicles(number);
  onDeVehicle();
  msg.innerHTML = `✅ Vehicle ${number} saved.`;
}

// Products already added to this vehicle (➕ Add another product)
let _deItems = [];

// The product currently filled in, or an error message
function _deCurrentItem() {
  const v = id => (document.getElementById(id)?.value || '').trim();
  const pcs = parseInt(v('de-pcs')) || 0, wtPc = parseFloat(v('de-wtpc')) || 0;
  if (!_deMode) return 'Tap an order, or choose one of the two options under it.';
  if (pcs <= 0)  return 'Enter pieces dispatched.';
  if (wtPc <= 0) return 'Enter the actual weight of a sample box.';
  if (_deMode === 'order') {
    if (!_deSelectedOrder) return 'Tap an order.';
    const o = _deSelectedOrder;
    return { mode: 'order', o, pcs, wtPc, label: `${o.product || o.size} (${o.id})` };
  }
  if (_deMode === 'new') {
    const product = v('de-n-product'), size = v('de-n-size'), qty = parseInt(v('de-n-qty')) || 0;
    if (!product && !size) return 'Enter the new order\'s product or size.';
    if (qty <= 0) return 'Enter the quantity ordered.';
    return { mode: 'new', n: { product, size, colour: v('de-n-colour'), ply: v('de-n-ply'), qty }, pcs, wtPc, label: `${product || size} (new order)` };
  }
  const product = v('de-free-product'), size = v('de-free-size');
  if (!product && !size) return 'Type the product name or size.';
  return { mode: 'free', f: { product, size }, pcs, wtPc, label: `${product || size} (no order)` };
}

function _deClearItemFields() {
  ['de-pcs', 'de-wtpc', 'de-free-product', 'de-free-size', 'de-n-product', 'de-n-size', 'de-n-colour', 'de-n-qty'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  _deSelectedOrder = null; _deSetMode('');
}

function _deRenderItems() {
  const el = document.getElementById('de-items');
  if (!el) return;
  el.innerHTML = !_deItems.length ? '' :
    `<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:5px">In this vehicle — ${_deItems.length} product${_deItems.length > 1 ? 's' : ''} added</div>` +
    _deItems.map((it, i) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;margin-bottom:5px;font-size:13px;background:#F0FDF4">
      <div><strong>${it.label}</strong> · ${it.pcs.toLocaleString('en-IN')} pcs · ${it.wtPc} gm/pc</div>
      <button class="btn-secondary" style="font-size:12px;padding:3px 9px;color:var(--danger)" onclick="_deItems.splice(${i},1);_deRenderItems()" title="Remove">✕</button></div>`).join('') +
    `<div style="font-size:11px;color:var(--muted);margin:2px 0 10px">Pick the next product above, or just Save.</div>`;
}

function addDeItem() {
  const msg = document.getElementById('de-msg');
  if (!(document.getElementById('de-party')?.value || '').trim()) { msg.innerHTML = '⚠️ Pick the party first.'; return; }
  const it = _deCurrentItem();
  if (typeof it === 'string') { msg.innerHTML = '⚠️ ' + it; return; }
  msg.innerHTML = '';
  _deItems.push(it);
  _deClearItemFields();
  _deRenderItems();
}

function saveDispatchEntry() {
  const msg = document.getElementById('de-msg');
  msg.innerHTML = '';
  const v = id => (document.getElementById(id)?.value || '').trim();
  const party = v('de-party');
  if (!party) { msg.innerHTML = '⚠️ Pick the party first.'; return; }
  const dateVal = document.getElementById('de-date').value;
  if (!dateVal) { msg.innerHTML = '⚠️ Pick a date.'; return; }
  const vehicle = v('de-vehicle');
  if (!vehicle || vehicle === '__new') { msg.innerHTML = '⚠️ Pick the vehicle (or add it with ➕ New vehicle).'; return; }
  const tripId = 'T' + Date.now().toString(36).toUpperCase();

  // Everything added to the vehicle, plus whatever is filled in right now
  const cur = _deCurrentItem();
  const curFilled = _deMode || v('de-pcs') || v('de-wtpc');
  if (typeof cur === 'string' && (curFilled || !_deItems.length)) { msg.innerHTML = '⚠️ ' + cur; return; }
  const items = _deItems.concat(typeof cur === 'string' ? [] : [cur]);

  const post = body => fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
  const d = new Date(), today = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const notes = v('de-notes');
  const shared = items.length > 1 ? `Same vehicle as ${items.length - 1} other product${items.length > 2 ? 's' : ''}` : '';

  // One sheet row per product, ~2 s apart: the sheet stamps each row with its
  // time to the second, and that stamp keeps every row's challan separate.
  // A new order's row is sent first, so the office finds it when the dispatch arrives.
  items.forEach((it, i) => {
    let o = it.o;
    if (it.mode === 'new') {
      o = { id: _deNextOrderId(), customer: party, ...it.n, status: 'New', priority: 'Normal', orderDate: todayStr };
      staffOrders.push(o);
      post({ id: o.id, customer: party, product: o.product, size: o.size, ply: o.ply, colour: o.colour, weight: it.wtPc || '', qty: o.qty, rate: '', twoPart: false,
             date: '', orderDate: today, status: 'New', priority: 'Normal', reelSize: '', reservedKg: 0, remarks: 'Added from the staff portal — rate not set' });
      it.label = `${o.product || o.size} (new order ${o.id})`;
    }
    const payload = it.mode === 'free'
      ? { date: _toMDY(dateVal), party, pcs: it.pcs, size: it.f.size, wtPc: it.wtPc, product: it.f.product, orderId: '' }
      : { date: _toMDY(dateVal), party: o.customer, pcs: it.pcs, size: o.size, wtPc: it.wtPc, product: o.product, orderId: o.id };
    payload.notes = [notes, shared].filter(Boolean).join(' · ');
    payload.vehicle = vehicle; payload.tripId = tripId;
    setTimeout(() => post(Object.assign({ action: 'supervisorDispatchAppend' }, payload)), i * 2200 + (it.mode === 'new' ? 1200 : 0));
  });

  msg.innerHTML = `✅ Saved on ${vehicle} — ${items.map(it => `${it.pcs.toLocaleString('en-IN')} pcs ${it.label}`).join(', ')}. The office sees ${items.length > 1 ? 'them' : 'it'} within a few minutes.${items.length > 1 ? ' Keep this page open for a few seconds.' : ''}`;
  _deItems = [];
  _deRenderItems();
  _deClearItemFields();
  const el = document.getElementById('de-notes'); if (el) el.value = '';
  _deFillPartyList();
  onDeParty(true);
  const wait = (items.length - 1) * 2200;
  [3000, 8000].forEach(ms => setTimeout(() => { staffFetchDispatchLog(); }, ms + wait));
}

// ── Edit a logged dispatch line ──
// Saves the new values into the same Dispatch row and appends what changed to
// its Notes ("Edited 24 Oct 15:04: pieces 1000 → 1200"), so every correction
// stays on record. The office app picks up the new pieces on its next refresh
// and corrects that dispatch's challan and invoice line to match.
let _deEditTs = null;
function openDeEdit(ts) {
  const e = staffDispatchLog.find(x => x.ts === ts);
  if (!e) return;
  _deEditTs = ts;
  let ov = document.getElementById('de-edit-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'de-edit-overlay'; ov.className = 'popup-overlay';
    ov.onclick = ev => { if (ev.target === ov) ov.style.display = 'none'; };
    document.body.appendChild(ov);
  }
  const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const f = (id, label, val, type) => `<div class="form-group"><label class="form-label" style="display:block">${label}</label><input class="form-input" id="dee-${id}" ${type ? `type="${type}"` : ''} value="${esc(val)}"></div>`;
  const vOpts = (typeof _deVehicles !== 'undefined' ? _deVehicles : []).map(v => `<option value="${esc(v.number)}" ${vehicleKey(v.number) === vehicleKey(e.vehicle) ? 'selected' : ''}>${esc(vehicleLabel(v))}</option>`).join('');
  const known = (typeof _deVehicles !== 'undefined' ? _deVehicles : []).some(v => vehicleKey(v.number) === vehicleKey(e.vehicle));
  ov.innerHTML = `<div class="popup-box" style="width:min(480px,95vw);max-width:none;padding:22px;max-height:90vh;overflow-y:auto" onclick="event.stopPropagation()">
    <div class="popup-title">✏️ Edit dispatch</div>
    <div style="font-size:12px;color:var(--muted);margin:-6px 0 12px">${esc(e.party || '—')} · ${formatDate(_deDayKey(e.date))}${e.orderId ? ' · ' + esc(e.orderId) : ''}</div>
    <div class="calc-grid">
      ${f('pcs', 'Pieces', e.pcs, 'number')}
      ${f('wt', 'Sample box weight (gm)', e.wtPc || '', 'number')}
      ${f('product', 'Product', e.product)}
      ${f('size', 'Size', e.size)}
    </div>
    <div class="form-group"><label class="form-label" style="display:block">Vehicle</label>
      <select class="form-select" id="dee-vehicle"><option value="">— none —</option>${!known && e.vehicle ? `<option value="${esc(e.vehicle)}" selected>${esc(e.vehicle)}</option>` : ''}${vOpts}</select></div>
    <div class="form-group"><label class="form-label" style="display:block">Notes</label><textarea class="form-input" id="dee-notes" rows="3">${esc(e.notes)}</textarea></div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:10px">What you change is added to the notes automatically, e.g. "Edited ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}: pieces ${e.pcs} → …".</div>
    <div id="dee-msg" style="font-size:12px;min-height:16px;margin-bottom:6px"></div>
    <div style="display:flex;gap:10px"><button class="btn-primary" style="flex:1" onclick="saveDeEdit()">💾 Save changes</button>
    <button class="btn-secondary" onclick="document.getElementById('de-edit-overlay').style.display='none'">Cancel</button></div></div>`;
  ov.style.display = 'flex';
}

function saveDeEdit() {
  const e = staffDispatchLog.find(x => x.ts === _deEditTs);
  if (!e) return;
  const v = id => (document.getElementById('dee-' + id)?.value || '').trim();
  const pcs = parseInt(v('pcs')) || 0, wt = parseFloat(v('wt')) || 0;
  if (pcs <= 0) { document.getElementById('dee-msg').innerHTML = '⚠️ Pieces must be more than 0.'; return; }
  const next = { pcs, wtPc: wt, product: v('product'), size: v('size'), vehicle: v('vehicle') };
  const labels = { pcs: 'pieces', wtPc: 'weight', product: 'product', size: 'size', vehicle: 'vehicle' };
  const changes = Object.keys(next).filter(k => String(next[k] ?? '') !== String(e[k] ?? '') && !(k === 'wtPc' && +next[k] === +e[k]))
    .map(k => `${labels[k]} ${e[k] === '' || e[k] == null ? '—' : e[k]} → ${next[k] === '' ? '—' : next[k]}`);
  let notes = v('notes');
  const typedNoteChanged = notes !== String(e.notes || '');
  if (!changes.length && !typedNoteChanged) { document.getElementById('de-edit-overlay').style.display = 'none'; return; }
  if (changes.length) {
    const now = new Date();
    const stamp = `${now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    notes = [notes, `Edited ${stamp}: ${changes.join('; ')}`].filter(Boolean).join(' · ');
  }
  fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'supervisorDispatchUpdate', ts: e.ts, row: e.row, ...next, notes }) }).catch(() => {});
  Object.assign(e, next, { notes });     // show it straight away
  _deLoggedMap = null;
  document.getElementById('de-edit-overlay').style.display = 'none';
  renderDispatchLog();
  if (staffOrders.length) renderStaffOrders();
  [4000, 10000].forEach(ms => setTimeout(staffFetchDispatchLog, ms));
}

// "10/16/2026 14:03:05" → sortable number; the raw string sorts 9/30 after 10/1
function _staffTsNum(ts) {
  const m = String(ts || '').match(/(\d+)\/(\d+)\/(\d{4})(?:\s+(\d+):(\d+)(?::(\d+))?)?/);
  return m ? new Date(+m[3], +m[1] - 1, +m[2], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime() : 0;
}

let staffDispatchLog = [];

async function staffFetchDispatchLog() {
  const syncEl = document.getElementById('de-sync');
  try {
    const url  = `https://sheets.googleapis.com/v4/spreadsheets/${SUPERVISOR_SHEET_ID}/values/${encodeURIComponent(SUPERVISOR_DISP_TAB + '!A2:K2000')}?key=${API_KEY}`;
    const res  = await fetch(url);
    const json = await res.json();
    // A json.error here almost always just means no entry has ever been saved yet.
    staffDispatchLog = json.error ? [] : (json.values || []).map((r, i) => [r, i + 2]).filter(([r]) => r[0]).map(([r, row]) => ({
      row, ts: r[0] || '', date: r[1] || '', party: r[2] || '', pcs: parseInt(r[3]) || 0, size: r[4] || '',
      wtPc: parseFloat(r[5]) || 0, product: r[6] || '',
      orderId: (r[7] || '').toString().split('—')[0].trim(), notes: r[8] || '', vehicle: r[9] || '', tripId: r[10] || '',
    })).sort((a, b) => _staffTsNum(b.ts) - _staffTsNum(a.ts));
    if (syncEl) syncEl.innerHTML = '<div class="sync-dot ok"></div><span>Updated just now</span>';
  } catch (e) {
    if (syncEl) syncEl.innerHTML = `<div class="sync-dot error"></div><span>Fetch failed: ${e.message}</span>`;
  }
  _deLoggedMap = null;
  renderDispatchLog();
  if (typeof renderStaffOrders === 'function' && staffOrders.length) { renderStaffOrders(); updateTodayBanner(); }
}

// Form dates come as M/D/YYYY (sometimes D/M/YYYY by hand) — compare as YYYY-MM-DD
function _deDayKey(raw) {
  const m = String(raw || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) { let mo = +m[1], d = +m[2]; if (mo > 12) [mo, d] = [d, mo]; return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? String(raw).slice(0, 10) : '';
}

function shiftDeDay(n) {
  const el = document.getElementById('de-day');
  const d = new Date((el.value || todayStr) + 'T00:00:00');
  d.setDate(d.getDate() + n);
  el.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  renderDispatchLog();
}

// Every dispatch on the chosen day, one card per vehicle trip, with day totals
function renderDispatchLog() {
  const list = document.getElementById('de-list');
  if (!list) return;
  const dayEl = document.getElementById('de-day');
  if (dayEl && !dayEl.value) dayEl.value = todayStr;
  const day = dayEl ? dayEl.value : todayStr;
  const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const gm = w => w > 0 && w < 20 ? w * 1000 : w;       // a weight typed in kg by mistake
  const rows = staffDispatchLog.filter(e => _deDayKey(e.date) === day);
  if (!rows.length) { list.innerHTML = `<div class="empty-state">No dispatches logged for ${formatDate(day)}.</div>`; return; }

  const trips = {};
  rows.forEach(e => { const k = e.tripId || (e.vehicle ? 'v:' + e.vehicle : 'none'); (trips[k] = trips[k] || []).push(e); });
  const pcs = rows.reduce((s, e) => s + e.pcs, 0);
  const kg  = rows.reduce((s, e) => s + e.pcs * gm(e.wtPc) / 1000, 0);
  const parties = new Set(rows.map(e => (e.party || '').trim().toLowerCase()).filter(Boolean)).size;
  const vehicles = new Set(rows.map(e => e.vehicle).filter(Boolean)).size;

  list.innerHTML = `
    <div class="card" style="margin-bottom:10px;padding:12px 16px;display:flex;gap:18px;flex-wrap:wrap;background:#EFF6FF">
      <div><div style="font-size:11px;color:var(--muted)">Pieces</div><div style="font-size:18px;font-weight:800;color:var(--navy)">${pcs.toLocaleString('en-IN')}</div></div>
      <div><div style="font-size:11px;color:var(--muted)">Weight</div><div style="font-size:18px;font-weight:800;color:var(--navy)">${Math.round(kg).toLocaleString('en-IN')} kg</div></div>
      <div><div style="font-size:11px;color:var(--muted)">Lines</div><div style="font-size:18px;font-weight:800;color:var(--navy)">${rows.length}</div></div>
      <div><div style="font-size:11px;color:var(--muted)">Parties</div><div style="font-size:18px;font-weight:800;color:var(--navy)">${parties}</div></div>
      <div><div style="font-size:11px;color:var(--muted)">Vehicles</div><div style="font-size:18px;font-weight:800;color:var(--navy)">${vehicles}</div></div>
    </div>` +
    Object.values(trips).map(t => {
      const v = t[0].vehicle;
      const tp = t.reduce((s, e) => s + e.pcs, 0), tk = t.reduce((s, e) => s + e.pcs * gm(e.wtPc) / 1000, 0);
      return `<div class="card" style="margin-bottom:8px;padding:12px 16px">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:4px">
          <div style="font-size:13px;font-weight:800;color:var(--navy)">${v ? '🚛 ' + esc(v) : '🚛 No vehicle recorded'}</div>
          <div style="font-size:12px;font-weight:700">${tp.toLocaleString('en-IN')} pcs · ${Math.round(tk).toLocaleString('en-IN')} kg</div>
        </div>
        ${t.map(e => `<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-top:1px solid var(--border);font-size:12px">
          <div><strong>${esc(e.party || '—')}</strong> · ${esc(e.product || e.size || '—')}${e.orderId ? ` · <span style="font-family:monospace">${esc(e.orderId)}</span>` : ''}
            ${e.notes ? `<div style="font-size:11px;color:#B45309">📝 ${esc(e.notes)}</div>` : ''}</div>
          <div style="white-space:nowrap;font-weight:600;text-align:right">${e.pcs.toLocaleString('en-IN')} pcs${e.wtPc ? ` · ${gm(e.wtPc)} gm` : ''}
            <div><button class="btn-secondary" style="font-size:11px;padding:2px 9px;margin-top:3px" onclick="openDeEdit('${esc(e.ts).replace(/'/g, "\\'")}')">✏️ Edit</button></div></div>
        </div>`).join('')}
      </div>`;
    }).join('');
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
    const url  = `https://sheets.googleapis.com/v4/spreadsheets/${SUPERVISOR_SHEET_ID}/values/${encodeURIComponent(SUPERVISOR_PROD_TAB + '!A2:J2000')}?key=${API_KEY}`;
    const res  = await fetch(url);
    const json = await res.json();
    staffProductionLog = json.error ? [] : (json.values || []).filter(r => r[0]).map(r => ({
      ts: r[0] || '', date: r[1] || '',
      r1w: r[2] || '', r1g: r[3] || '', r2w: r[4] || '', r2g: r[5] || '',
      cutSize: r[6] || '', plyPcs: r[7] || '', sheets: r[8] || '', rolls: r[9] || '',
    })).sort((a, b) => _staffTsNum(b.ts) - _staffTsNum(a.ts));
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
  if (s === '35' || s === '35.5') {
    const pool = staffStock.filter(x => x.size.toString() === '35' || x.size.toString() === '35.5')
      .reduce((sum, x) => sum + (x.plain100Count || 0), 0);
    return pool < MIN_REELS ? 'critical' : pool === MIN_REELS ? 'low' : 'ok';
  }
  if (s === '42' || s === '44') {
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
        <button class="status-btn" style="background:var(--primary);color:#fff;margin-left:8px" onclick="adjustReelStock('${r.size}','${gsmKey.replace(/'/g,"\\'")}')">✏️ Adjust</button>
      </div>`;
  }).join('') + `</div>`;
}

// Appends a correction lot for the delta between the entered count and the
// current aggregated total — the Stock sheet is an append-only ledger of
// lots (same as a purchase), so an edit here is a new row, never a
// mutation of past ones, exactly like addReelStock already does for
// purchases. weightPerReel carries over the group's own average so the
// total tonnage moves proportionally with the count.
function adjustReelStock(sizeKey, gsmKey) {
  const r = staffStock.find(x => x.size.toString() === sizeKey && (x.gsm || '—').toString() === gsmKey);
  if (!r) return;
  const input = prompt(`Current count for ${r.size}" (GSM ${r.gsm}): ${r.count} reels.\n\nEnter the correct count:`, r.count);
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
// Same maths as the office Rate Calculator: calcBoxWeight() in config.js
// (inches, (L+W)×2+2 sheet length with the two-part rule, liners at GSM,
// flutes at GSM × 1.5). No paper rate or price here — rates stay office-only.
let _wtUnit = 'inch';

function setWtUnit(u) {
  _wtUnit = u;
  [['inch', 'wt-unit-inch'], ['mm', 'wt-unit-mm']].forEach(([k, id]) => {
    const b = document.getElementById(id);
    b.style.background = k === u ? 'var(--blue)' : 'transparent';
    b.style.color = k === u ? '#fff' : 'var(--muted)';
  });
  document.querySelectorAll('.wt-unit').forEach(el => { el.textContent = u; });
  calcWeight();
}

function renderWtLayers() {
  const box = document.getElementById('wt-layers');
  if (!box) return;
  const ply = parseInt(document.getElementById('wt-ply').value) || 5;
  const prev = [...box.querySelectorAll('input')].map(i => i.value);
  box.innerHTML = Array.from({ length: ply }, (_, i) => `
    <div class="form-group"><label class="form-label" style="display:block">Layer ${i + 1} — ${i % 2 ? 'Flute' : 'Liner'} GSM</label>
      <input class="form-input" type="number" id="wt-gsm-${i + 1}" value="${prev[i] || ''}" placeholder="e.g. 100" step="10" oninput="calcWeight()"></div>`).join('');
}

function fillWtGsm() {
  const g = document.getElementById('wt-gsm-all').value;
  if (!g) return;
  document.querySelectorAll('#wt-layers input').forEach(i => { i.value = g; });
  calcWeight();
}

function calcWeight() {
  const res = document.getElementById('wt-result');
  if (!res) return;
  const conv = v => _wtUnit === 'mm' ? v / 25.4 : v;
  const num = id => parseFloat(document.getElementById(id)?.value) || 0;
  const L = conv(num('wt-l')), W = conv(num('wt-w')), H = conv(num('wt-h'));
  const reel = num('wt-reel') ? conv(num('wt-reel')) : 0;
  const ply = parseInt(document.getElementById('wt-ply').value) || 5;
  const layers = Array.from({ length: ply }, (_, i) => num(`wt-gsm-${i + 1}`));
  const qty = parseInt(document.getElementById('wt-qty').value) || 0;

  if (!L || !W || !H) { res.style.display = 'none'; return; }
  res.style.display = 'block';
  if (layers.some(g => !g)) { res.innerHTML = '<div class="calc-result"><div class="calc-result-label">Enter the GSM of every layer</div></div>'; return; }

  const r = calcBoxWeight(L, W, H, layers, document.getElementById('wt-margin').checked);
  const f = n => +n.toFixed(2);
  const kg = r.totalWeight / 1000;
  const fmtW = g => g.toLocaleString('en-IN', { maximumFractionDigits: 1 }) + ' gm' + (g >= 1000 ? ` (${(g / 1000).toFixed(2)} kg)` : '');
  const reelOk = reel ? Math.abs(reel - r.sheetW) < 0.6 : null;

  res.innerHTML = `
    ${r.twoPart ? `<div style="padding:8px 12px;border-radius:8px;background:#FFF7E6;border:1px solid #F5C06B;font-size:12px;margin-bottom:10px">✂️ <strong>Two-part box</strong> — sheet length is over the single-piece limit, so it is made in 2 pieces (Sheet L = (L+W)×2+4).</div>`
      : r.special ? `<div style="padding:8px 12px;border-radius:8px;background:#FFF7E6;border:1px solid #F5C06B;font-size:12px;margin-bottom:10px">⚠️ <strong>Tight</strong> — 3-ply sheet ${f(r.sheetL)}" is above 80" (machine max 82").</div>` : ''}
    <div style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:10px">
      <div><div style="font-size:11px;color:var(--muted)">Sheet size (W × L)</div><div style="font-size:16px;font-weight:700">${f(r.sheetW)}" × ${f(r.sheetL)}"</div></div>
      <div><div style="font-size:11px;color:var(--muted)">Area</div><div style="font-size:16px;font-weight:700">${r.areaSqm.toFixed(4)} sqm</div></div>
    </div>
    ${r.layerWeights.map((l, i) => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--muted)">Layer ${i + 1} — ${l.type} (${l.gsm} GSM${l.type === 'Flute' ? ' ×1.5' : ''})</span><strong>${l.weight.toFixed(1)} gm</strong></div>`).join('')}
    <div class="calc-result" style="margin-top:10px">
      <div class="calc-result-label">Weight per Box</div>
      <div class="calc-result-value">${fmtW(r.totalWeight)}</div>
    </div>
    ${qty > 0 ? `<div class="calc-result" style="margin-top:10px">
      <div class="calc-result-label">Total for ${qty.toLocaleString('en-IN')} boxes</div>
      <div class="calc-result-value">${kg * qty >= 1000 ? (kg * qty / 1000).toFixed(2) + ' tonne' : (kg * qty).toFixed(1) + ' kg'}</div>
    </div>` : ''}
    ${reel ? `<div style="margin-top:10px;padding:8px 12px;border-radius:8px;font-size:12px;background:${reelOk ? '#F0FDF4' : '#FEF2F2'};border:1px solid ${reelOk ? '#86EFAC' : '#FECACA'}">
      ${reelOk ? '✅ Reel size matches' : '⚠️ Reel size does not match'} — sheet width ${f(r.sheetW)}", reel ${f(reel)}"${reelOk ? '' : ` (off by ${Math.abs(reel - r.sheetW).toFixed(1)}")`}</div>` : ''}`;
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
  // Each step on its own: one missing element (e.g. a page and script from
  // different releases still in the browser cache) must never stop the
  // orders from loading — that left the portal stuck on "Loading orders...".
  const step = (fn) => { try { fn(); } catch (e) { console.error('staffInit:', e); } };
  step(() => {
    document.getElementById('staff-topbar-date').textContent =
      new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  });
  ['dd-start', 'pl-date', 'de-date', 'pe-date'].forEach(id => step(() => { document.getElementById(id).value = todayStr; }));
  step(renderWtLayers);
  step(loadDeVehicles);

  checkStaffAuth();
  if (staffIsLoggedIn()) {
    // Reopen the tab that was open before the refresh
    step(() => { const last = localStorage.getItem(LS_STAFF_TAB); if (last && last !== 'orders') showStaffTab(last); });
    staffFetchOrders();
    setInterval(staffFetchOrders, 5 * 60 * 1000);
    // Still loading after 20 s → say so instead of spinning forever
    setTimeout(() => {
      const el = document.getElementById('staff-orders-sync');
      if (el && /Loading/.test(el.textContent)) el.innerHTML = '<div class="sync-dot error"></div><span>Orders are taking too long — check the internet connection, then press Ctrl+Shift+R to reload.</span>';
    }, 20000);
  }
}

// Show a script error in the orders bar instead of failing silently
window.addEventListener('error', e => {
  const el = document.getElementById('staff-orders-sync');
  if (el && /Loading/.test(el.textContent)) el.innerHTML = `<div class="sync-dot error"></div><span>Something went wrong (${String(e.message || '').replace(/</g, '&lt;')}) — press Ctrl+Shift+R to reload.</span>`;
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', staffInit);
} else {
  staffInit();
}

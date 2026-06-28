// ══════════════════════════════════════════════════════════════
// STAFF-APP.JS — Staff Portal Logic
// ══════════════════════════════════════════════════════════════

const STAFF_PIN_KEY     = 'mi_staff_pin_v1';
const STAFF_SESSION_KEY = 'mi_staff_session_v1';
const STAFF_SESSION_TTL = 12 * 60 * 60 * 1000; // 12 hours

// ── Simple hash (works on HTTP/file:// too) ──
async function staffHash(str) {
  if (window.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return 'sha:' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return 'djb:' + (h >>> 0).toString(16).padStart(8,'0');
}

// ── Auth ──
function staffGetSession()  { try { return JSON.parse(localStorage.getItem(STAFF_SESSION_KEY) || '{}'); } catch { return {}; } }
function staffIsLoggedIn()  { const s = staffGetSession(); return s.ok === true && s.expires && Date.now() < s.expires; }
function staffSetSession()  { localStorage.setItem(STAFF_SESSION_KEY, JSON.stringify({ ok: true, expires: Date.now() + STAFF_SESSION_TTL })); }
function staffClearSession(){ localStorage.removeItem(STAFF_SESSION_KEY); }
function staffHasPin()      { return !!localStorage.getItem(STAFF_PIN_KEY); }

function staffShowAuthMode(mode) {
  document.getElementById('staff-auth').style.display = 'flex';
  document.getElementById('staff-setup-panel').style.display = mode === 'setup' ? 'block' : 'none';
  document.getElementById('staff-login-panel').style.display = mode === 'login' ? 'block' : 'none';
  const id = mode === 'setup' ? 'staff-new-pin' : 'staff-pin';
  setTimeout(() => document.getElementById(id)?.focus(), 80);
}
function staffHideAuth()    { document.getElementById('staff-auth').style.display = 'none'; }
function staffShowErr(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
}

async function checkStaffAuth() {
  if (staffIsLoggedIn()) { staffHideAuth(); return; }
  staffShowAuthMode(staffHasPin() ? 'login' : 'setup');
}

async function staffSetup() {
  const p1 = document.getElementById('staff-new-pin').value.trim();
  const p2 = document.getElementById('staff-new-pin2').value.trim();
  staffShowErr('staff-setup-err', '');
  if (p1.length < 4 || !/^\d+$/.test(p1)) { staffShowErr('staff-setup-err', '4-6 digit numeric PIN chahiye.'); return; }
  if (p1 !== p2) { staffShowErr('staff-setup-err', 'Dono PIN match nahi kar rahe.'); return; }
  try {
    localStorage.setItem(STAFF_PIN_KEY, await staffHash(p1));
    staffSetSession();
    staffHideAuth();
  } catch(e) { staffShowErr('staff-setup-err', 'Error: ' + e.message); }
}

async function staffLogin() {
  const pin = document.getElementById('staff-pin').value.trim();
  staffShowErr('staff-login-err', '');
  if (!pin) { staffShowErr('staff-login-err', 'PIN daalo.'); return; }
  try {
    const hash = await staffHash(pin);
    if (hash === localStorage.getItem(STAFF_PIN_KEY)) {
      staffSetSession(); staffHideAuth();
    } else {
      staffShowErr('staff-login-err', 'Galat PIN. Dobara try karo.');
      document.getElementById('staff-pin').value = '';
      document.getElementById('staff-pin').focus();
    }
  } catch(e) { staffShowErr('staff-login-err', 'Error: ' + e.message); }
}

function staffLogout() {
  if (!confirm('Logout karna chahte ho?')) return;
  staffClearSession();
  document.getElementById('staff-pin').value = '';
  staffShowAuthMode('login');
}

// ══════════════════════════════════════════════════════════════
// DATA
// ══════════════════════════════════════════════════════════════

let staffOrders = [];
let staffStock  = [];
const todayStr  = new Date().toISOString().slice(0, 10);
const tmrwStr   = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function staffFetchOrders() {
  const syncEl = document.getElementById('staff-orders-sync');
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${ORDERS_SHEET_ID}/values/${encodeURIComponent(ORDERS_TAB + '!A1:P500')}?key=${API_KEY}`;
    const res  = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);

    const rows = (json.values || []).slice(1);
    staffOrders = rows.filter(r => r[0]).map(r => ({
      id:       r[0]  || '',
      date:     r[1]  || '',
      customer: r[2]  || '',
      product:  r[3]  || '',
      size:     r[4]  || '',
      ply:      r[5]  || '',
      colour:   r[6]  || '',
      qty:      parseFloat(r[7])  || 0,
      rate:     parseFloat(r[8])  || 0,
      delivery: r[9]  || '',
      status:   r[10] || 'New',
      priority: r[11] || 'Normal',
    }));

    if (syncEl) syncEl.innerHTML = '<div class="sync-dot ok"></div><span>Updated just now</span>';
    renderStaffOrders();
    updateTodayBanner();
  } catch(e) {
    if (syncEl) syncEl.innerHTML = `<div class="sync-dot error"></div><span>Fetch failed: ${e.message}</span>`;
  }
}

async function staffFetchStock() {
  const syncEl = document.getElementById('staff-stock-sync');
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${REEL_SHEET_ID}/values/${encodeURIComponent(REEL_TAB + '!A1:D200')}?key=${API_KEY}`;
    const res  = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);

    const rows  = (json.values || []).slice(1);
    staffStock  = rows.filter(r => r[0]).map(r => ({
      size:  r[0] || '',
      qty:   parseFloat(r[1]) || 0,
      unit:  r[2] || 'reels',
      notes: r[3] || '',
    }));

    if (syncEl) syncEl.innerHTML = '<div class="sync-dot ok"></div><span>Updated just now</span>';
    renderStaffStock();
  } catch(e) {
    if (syncEl) syncEl.innerHTML = `<div class="sync-dot error"></div><span>Fetch failed: ${e.message}</span>`;
  }
}

// ══════════════════════════════════════════════════════════════
// TABS
// ══════════════════════════════════════════════════════════════

const STAFF_TABS = ['orders','stock','delivery','weight'];
const STAFF_TAB_TITLES = { orders: '📦 Orders', stock: '🧻 Reel Stock', delivery: '📅 Delivery Date', weight: '⚖️ Box Weight' };

function showStaffTab(id, btn) {
  STAFF_TABS.forEach(t => {
    document.getElementById('staff-tab-' + t).style.display = t === id ? 'block' : 'none';
  });
  document.querySelectorAll('.staff-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('staff-page-title').textContent = STAFF_TAB_TITLES[id] || id;

  if (id === 'stock' && !staffStock.length) staffFetchStock();
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

function renderStaffOrders() {
  const list    = document.getElementById('staff-orders-list');
  const filter  = document.getElementById('staff-status-filter')?.value || '';
  const query   = (document.getElementById('staff-search')?.value || '').toLowerCase().trim();

  let orders = staffOrders.filter(o => !['Delivered','Dispatched','Cancelled'].includes(o.status));
  if (filter) orders = orders.filter(o => o.status === filter);
  if (query)  orders = orders.filter(o =>
    o.customer.toLowerCase().includes(query) ||
    o.product.toLowerCase().includes(query)  ||
    o.id.toLowerCase().includes(query)       ||
    o.size.toLowerCase().includes(query)
  );

  // Sort: today first, then by delivery date
  orders.sort((a, b) => {
    if (a.delivery === todayStr && b.delivery !== todayStr) return -1;
    if (b.delivery === todayStr && a.delivery !== todayStr) return  1;
    return (a.delivery || '').localeCompare(b.delivery || '');
  });

  if (!orders.length) {
    list.innerHTML = `<div class="empty-state">Koi active orders nahi hain.</div>`;
    return;
  }

  list.innerHTML = '';
  orders.forEach(o => {
    const isToday   = o.delivery === todayStr;
    const isTmrw    = o.delivery === tmrwStr;
    const isOverdue = o.delivery && o.delivery < todayStr;
    const urgency   = isOverdue ? '#FEE2E2' : isToday ? '#FEF3C7' : 'transparent';

    const row = document.createElement('div');
    row.className = 'card';
    row.style.cssText = `margin-bottom:10px;padding:0;overflow:hidden;border-left:4px solid ${isToday || isOverdue ? 'var(--danger)' : isTmrw ? '#D97706' : 'var(--border)'}`;
    row.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:14px 16px;background:${urgency}">
        <div style="flex:1;min-width:160px">
          <div style="font-size:13px;font-weight:700;color:var(--navy)">${o.customer}</div>
          <div style="font-size:12px;color:var(--muted)">${o.product} · ${o.size} · ${o.ply}ply</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;font-family:monospace">${o.id}</div>
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
          <button class="status-btn" style="background:var(--primary);color:#fff" onclick="openStaffStatus('${o.id.replace(/'/g,"\\'")}')">✏️ Update</button>
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
  document.getElementById('ss-order-desc').textContent = `${o.customer} · ${o.product} · ${o.qty.toLocaleString('en-IN')} pcs`;
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
    body: JSON.stringify({ action: 'updateStatus', orderId: o.id, status: newStatus }),
  }).catch(() => {});
}

// ══════════════════════════════════════════════════════════════
// REEL STOCK
// ══════════════════════════════════════════════════════════════

function renderStaffStock() {
  const list = document.getElementById('staff-stock-list');
  if (!staffStock.length) {
    list.innerHTML = `<div class="empty-state">Stock data nahi mila.</div>`;
    return;
  }
  list.innerHTML = '';
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px';

  staffStock.forEach(s => {
    const low  = s.qty <= 2;
    const ok   = s.qty >= 4;
    const card = document.createElement('div');
    card.className = 'stat-card ' + (low ? 'alert' : ok ? 'good' : 'warn');
    card.innerHTML = `
      <div class="stat-label">${s.size}"</div>
      <div class="stat-value" style="color:${low ? 'var(--danger)' : ok ? 'var(--success)' : '#B45309'};font-size:28px">${s.qty}</div>
      <div class="stat-sub">${s.unit} · ${low ? '⚠️ Low' : ok ? '✅ OK' : '⚠️ Watch'}</div>
      ${s.notes ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">${s.notes}</div>` : ''}
    `;
    grid.appendChild(card);
  });
  list.appendChild(grid);
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
// INIT
// ══════════════════════════════════════════════════════════════

function staffInit() {
  document.getElementById('staff-topbar-date').textContent =
    new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  document.getElementById('dd-start').value = todayStr;

  checkStaffAuth().then(() => {
    if (staffIsLoggedIn()) {
      staffFetchOrders();
      setInterval(staffFetchOrders, 5 * 60 * 1000);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', staffInit);
} else {
  staffInit();
}

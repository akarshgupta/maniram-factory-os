// ══════════════════════════════════════════════════════════════
// ORDERS.JS — Fetch, Save, Edit, Render, Stock Check
// ══════════════════════════════════════════════════════════════

let orders          = [];
let activeOrderTab  = 'all';
let editingOrderId  = null;
let orderSearchQuery = '';

// ── Search helper (used by active + history views) ──
function matchesSearch(o, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    o.customer.toLowerCase().includes(q) ||
    (o.product || '').toLowerCase().includes(q) ||
    o.id.toLowerCase().includes(q) ||
    (o.size || '').toLowerCase().includes(q)
  );
}

function onOrderSearch() {
  orderSearchQuery = (document.getElementById('order-search')?.value || '').trim().toLowerCase();
  if (activeOrderTab === 'all')     renderOrders();
  if (activeOrderTab === 'history') renderOrderHistory();
}

// ── Helpers ──
function colourDot(c) {
  if (!c) return '';
  const hex = COLOUR_HEX[c.toLowerCase()] || '#999';
  return `<span class="colour-dot" style="background:${hex}"></span>`;
}

function parseSheetDate(raw) {
  if (!raw) return '';
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const y = dmy[3].length === 2 ? '20' + dmy[3] : dmy[3];
    return `${y}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
  }
  if (raw.match(/^\d{4}-\d{2}-\d{2}$/)) return raw;
  return '';
}

function addBusinessDays(fromDate, days) {
  const d = new Date(fromDate);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) added++;
  }
  return d.toISOString().split('T')[0];
}

// ── Order ID ──
function generateOrderId() {
  let max = 0;
  orders.forEach(o => {
    const m = o.id.match(/MIORD(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1]));
  });
  return 'MIORD' + String(max + 1).padStart(3, '0');
}

function refreshOrderId() {
  document.getElementById('f-id').value = generateOrderId();
}

// ── Fetch Orders ──
async function fetchOrders() {
  setOrderSyncStatus('loading', 'Fetching orders...');
  const range = encodeURIComponent(`${ORDERS_TAB}!A1:N500`);
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${ORDERS_SHEET_ID}/values/${range}?key=${API_KEY}`;
  try {
    const res  = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    const rows = json.values || [];
    if (rows.length < 2) {
      orders = [];
      setOrderSyncStatus('ok', 'No orders yet');
      renderOrders(); renderGroupedOrders(); updateDashboardOrders(); renderCalendar();
      refreshOrderId();
      return;
    }

    const header = rows[0].map(h => h.toString().trim().toLowerCase());
    const col = {
      id:       header.findIndex(h => h.includes('order id') || h === 'order id'),
      customer: header.findIndex(h => h.includes('customer')),
      product:  header.findIndex(h => h.includes('product')),
      spec:     header.findIndex(h => h.includes('box spec') || h.includes('specs') || h.includes('size')),
      ply:      header.findIndex(h => h === 'ply' || h.includes('ply')),
      colour:   header.findIndex(h => h.includes('colour') || h.includes('color')),
      weight:   header.findIndex(h => h.includes('weight') || h === 'wt'),
      qty:      header.findIndex(h => h.includes('quantity') || h === 'qty'),
      rate:     header.findIndex(h => h === 'rate' || h.includes('rate')),
      date:     header.findIndex(h => h.includes('delivery')),
      status:   header.findIndex(h => h === 'status'),
      priority: header.findIndex(h => h.includes('priority')),
      reelSize: header.findIndex(h => h.includes('reel size') || h === 'reel_size' || h === 'reelsize'),
      resvKg:   header.findIndex(h => h.includes('reserved kg') || h === 'reserved_kg'),
    };

    orders = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r[col.customer]) continue;
      const rawDate = col.date >= 0 ? (r[col.date] || '') : '';
      orders.push({
        id:         col.id >= 0       ? (r[col.id]       || `MIORD${String(i).padStart(3,'0')}`) : `MIORD${String(i).padStart(3,'0')}`,
        customer:   col.customer >= 0 ? (r[col.customer] || '') : '',
        product:    col.product  >= 0 ? (r[col.product]  || '') : '',
        size:       col.spec     >= 0 ? (r[col.spec]     || '') : '',
        ply:        col.ply      >= 0 ? (r[col.ply]      || '') : '',
        colour:     col.colour   >= 0 ? (r[col.colour]   || '') : '',
        weight:     col.weight   >= 0 ? (r[col.weight]   || '') : '',
        qty:        col.qty      >= 0 ? parseInt(r[col.qty]) || 0 : 0,
        rate:       col.rate     >= 0 ? parseFloat(r[col.rate]) || 0 : 0,
        date:       parseSheetDate(rawDate),
        status:     col.status   >= 0 ? (r[col.status]   || 'New') : 'New',
        priority:   col.priority >= 0 ? (r[col.priority] || 'Normal') : 'Normal',
        reelSize:   col.reelSize >= 0 ? (r[col.reelSize] || '') : '',
        reservedKg: col.resvKg  >= 0 ? parseFloat(r[col.resvKg]) || 0 : 0,
        done: false, rowIndex: i + 1,
      });
    }

    const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    setOrderSyncStatus('ok', `Live · ${orders.length} orders · ${now}`);
    syncOrdersToHistory();
    renderOrders();
    updateDashboardOrders();
    renderCalendar();
    computeReminders();
    if (activeOrderTab === 'grouped') renderGroupedOrders();
    if (activeOrderTab === 'reelmap') renderReelProductMap();
    refreshOrderId();
  } catch (err) {
    setOrderSyncStatus('error', `Error: ${err.message}`);
  }
}

// ══════════════════════════════════════════════════════════════
// STOCK CHECK
// ══════════════════════════════════════════════════════════════

function calcOrderKg(weight, qty) {
  const w = parseFloat(weight) || 0;
  const q = parseInt(qty)      || 0;
  if (!w || !q) return 0;
  return Math.round((w * q) / 1000);
}

function getReservedKgForSize(reelSizeStr, excludeOrderId) {
  if (!reelSizeStr) return 0;
  return orders
    .filter(o =>
      o.reelSize &&
      o.reelSize.toString() === reelSizeStr.toString() &&
      o.status !== 'Delivered' &&
      o.status !== 'Dispatched' &&
      o.status !== 'Cancelled' &&
      (!excludeOrderId || o.id !== excludeOrderId)
    )
    .reduce((sum, o) => {
      return sum + Math.round(((parseFloat(o.weight)||0) * (parseInt(o.qty)||0)) / 1000);
    }, 0);
}

function getTotalKgForSize(reelSizeStr) {
  if (!reelSizeStr || !reelData.length) return 0;
  const found = reelData.find(r =>
    r.size.toString() === reelSizeStr.toString() ||
    Math.floor(r.size).toString() === reelSizeStr.toString()
  );
  return found ? (found.totalWeight + KATRA_BUFFER_KG) : 0;
}

function findSubstitutes(reelSizeStr, neededKg) {
  const base = parseFloat(reelSizeStr);
  if (isNaN(base)) return [];
  const subs = [];
  [1, 2].forEach(delta => {
    [base + delta, base + delta + 0.5].forEach(trySize => {
      const found = reelData.find(r => Math.abs(r.size - trySize) < 0.1);
      if (found) {
        const reservedKg  = getReservedKgForSize(found.size.toString());
        const availableKg = (found.totalWeight + KATRA_BUFFER_KG) - reservedKg;
        if (availableKg >= neededKg) {
          subs.push({ size: found.size, availableKg: Math.round(availableKg) });
        }
      }
    });
  });
  return subs.filter((s, i, arr) => arr.findIndex(x => x.size === s.size) === i);
}

function checkStockForCurrentOrder() {
  const reelSize = document.getElementById('f-reel-size')?.value.trim();
  const weight   = document.getElementById('f-weight')?.value.trim();
  const qty      = document.getElementById('f-qty')?.value.trim();
  if (!reelSize || !weight || !qty) { hideStockCheck(); return; }

  const neededKg    = calcOrderKg(weight, qty);
  if (!neededKg) { hideStockCheck(); return; }

  const totalKg     = getTotalKgForSize(reelSize);
  const reservedKg  = getReservedKgForSize(reelSize);
  const availableKg = totalKg - reservedKg;
  const box         = document.getElementById('stock-check-box');
  if (!box) return;
  box.style.display = 'block';

  if (totalKg === 0) {
    const subs = findSubstitutes(reelSize, neededKg);
    box.style.borderLeft = '4px solid var(--danger)';
    box.innerHTML = `
      <div style="font-size:13px;font-weight:700;color:var(--danger);margin-bottom:6px;">❌ ${reelSize}" — Stock data nahi mila</div>
      ${subs.length ? `<div style="font-size:12px;font-weight:600;color:#B45309;">🔄 Substitute:</div>${subs.map(s=>`<div style="font-size:12px;color:#92400E;">→ ${s.size}" · ${s.availableKg.toLocaleString('en-IN')} kg available</div>`).join('')}` : '<div style="font-size:12px;color:var(--danger)">Koi substitute bhi nahi.</div>'}`;
    return;
  }

  if (availableKg >= neededKg) {
    box.style.borderLeft = '4px solid var(--success)';
    box.innerHTML = `
      <div style="font-size:13px;font-weight:700;color:var(--success);margin-bottom:6px;">✅ Stock Available — ${reelSize}"</div>
      <div style="display:flex;gap:20px;flex-wrap:wrap;font-size:12px;">
        <div><span style="color:var(--muted)">Chahiye:</span> <strong>${neededKg.toLocaleString('en-IN')} kg</strong></div>
        <div><span style="color:var(--muted)">Reserved (other orders):</span> <strong>${reservedKg.toLocaleString('en-IN')} kg</strong></div>
        <div><span style="color:var(--muted)">Baad mein bachega:</span> <strong style="color:var(--success)">${(availableKg - neededKg).toLocaleString('en-IN')} kg</strong></div>
      </div>`;
  } else {
    const shortage = neededKg - availableKg;
    const subs     = findSubstitutes(reelSize, neededKg);
    box.style.borderLeft = '4px solid var(--danger)';
    box.innerHTML = `
      <div style="font-size:13px;font-weight:700;color:var(--danger);margin-bottom:6px;">⚠️ Stock Kam Hai — ${reelSize}"</div>
      <div style="display:flex;gap:20px;flex-wrap:wrap;font-size:12px;margin-bottom:8px;">
        <div><span style="color:var(--muted)">Chahiye:</span> <strong>${neededKg.toLocaleString('en-IN')} kg</strong></div>
        <div><span style="color:var(--muted)">Available:</span> <strong style="color:var(--danger)">${Math.max(0,Math.round(availableKg)).toLocaleString('en-IN')} kg</strong></div>
        <div><span style="color:var(--muted)">Shortage:</span> <strong style="color:var(--danger)">${shortage.toLocaleString('en-IN')} kg</strong></div>
      </div>
      ${subs.length ? `<div style="font-size:12px;font-weight:600;color:#B45309;margin-bottom:4px;">🔄 Substitute Available:</div>${subs.map(s=>`<div style="font-size:12px;color:#92400E;">→ ${s.size}" · ${s.availableKg.toLocaleString('en-IN')} kg ✅</div>`).join('')}` : '<div style="font-size:12px;color:var(--danger);font-weight:600;">Koi substitute bhi nahi. Pehle purchase karo.</div>'}`;
  }
}

function hideStockCheck() {
  const box = document.getElementById('stock-check-box');
  if (box) box.style.display = 'none';
}

// ── Stock badge for order list rows ──
function stockBadgeHtml(order) {
  if (!order.reelSize || !order.weight || !order.qty) return '';
  if (['Delivered','Dispatched','Cancelled'].includes(order.status)) return '';
  const neededKg    = calcOrderKg(order.weight, order.qty);
  const totalKg     = getTotalKgForSize(order.reelSize);
  const reservedKg  = getReservedKgForSize(order.reelSize);
  const availableKg = totalKg - reservedKg;
  if (totalKg === 0) return `<div style="font-size:10px;color:var(--danger);margin-top:2px;">🧻 ${order.reelSize}" — no stock data</div>`;
  if (availableKg >= neededKg)
    return `<div style="font-size:10px;color:var(--success);margin-top:2px;">🧻 ${order.reelSize}" · ${neededKg}kg · Avail after: ${Math.round(availableKg-neededKg)}kg</div>`;
  return `<div style="font-size:10px;color:var(--danger);margin-top:2px;">⚠️ ${order.reelSize}" · Need ${neededKg}kg · Only ${Math.max(0,Math.round(availableKg))}kg avail</div>`;
}

// ══════════════════════════════════════════════════════════════
// SAVE ORDER (new)
// ══════════════════════════════════════════════════════════════

async function saveOrderToSheet() {
  const id       = document.getElementById('f-id').value.trim() || generateOrderId();
  const customer = document.getElementById('f-customer').value.trim();
  const prodSel  = document.getElementById('f-product');
  const product  = prodSel.options[prodSel.selectedIndex]?.text?.split(' · ')[0] || '';
  const size     = document.getElementById('f-size').value.trim();
  const ply      = document.getElementById('f-ply').value.trim();
  const colour   = document.getElementById('f-colour').value.trim();
  const weight   = document.getElementById('f-weight').value.trim();
  const qty      = document.getElementById('f-qty').value;
  const rate     = document.getElementById('f-rate').value;
  const date     = document.getElementById('f-date').value;
  const status   = document.getElementById('f-status').value;
  const priority = document.getElementById('f-priority').value;
  const reelSize = document.getElementById('f-reel-size').value.trim();

  if (!customer || !date) { alert('Customer aur Delivery Date required hai.'); return; }

  const reservedKg = calcOrderKg(weight, qty);
  const d          = new Date(date);
  const formatted  = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  const payload    = { id, customer, product, size, ply, colour, weight, qty, rate, date: formatted, status, priority, reelSize, reservedKg, remarks: '' };

  try {
    const btn = document.querySelector('button.btn-primary[onclick="saveOrderToSheet()"]');
    if (btn) { btn.textContent = '⏳ Saving...'; btn.disabled = true; }
    await fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    clearOrderForm();
    if (btn) btn.textContent = '✅ Saved!';
    setTimeout(() => { if (btn) { btn.textContent = '💾 Save Order'; btn.disabled = false; } }, 2000);
    setTimeout(() => fetchOrders(), 1500);
  } catch (err) {
    alert(`Save failed: ${err.message}`);
    const btn = document.querySelector('button.btn-primary[onclick="saveOrderToSheet()"]');
    if (btn) { btn.textContent = '💾 Save Order'; btn.disabled = false; }
  }
}

function clearOrderForm() {
  ['f-customer','f-qty','f-rate','f-date','f-reel-size'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-product').innerHTML = '<option value="">— Select Customer First —</option>';
  clearProductFields();
  document.getElementById('f-status').value   = 'New';
  document.getElementById('f-priority').value = 'Normal';
  // Reset form title
  document.querySelector('.add-order-form .form-title').textContent = '➕ New Order';
  hideSuggestion();
  hideStockCheck();
}

// ══════════════════════════════════════════════════════════════
// EDIT ORDER
// ══════════════════════════════════════════════════════════════

function openEditModal(orderId) {
  const o = orders.find(x => x.id === orderId);
  if (!o) return;
  editingOrderId = orderId;

  document.getElementById('edit-order-id-display').textContent = orderId + ' · Row ' + o.rowIndex;
  document.getElementById('ef-customer').value  = o.customer;
  document.getElementById('ef-product').value   = o.product;
  document.getElementById('ef-size').value      = o.size;
  document.getElementById('ef-ply').value       = o.ply;
  document.getElementById('ef-colour').value    = o.colour;
  document.getElementById('ef-reel-size').value = o.reelSize || '';
  document.getElementById('ef-weight').value    = o.weight;
  document.getElementById('ef-qty').value       = o.qty;
  document.getElementById('ef-rate').value      = o.rate;
  document.getElementById('ef-date').value      = o.date;
  document.getElementById('ef-status').value    = o.status;
  document.getElementById('ef-priority').value  = o.priority;

  document.getElementById('edit-order-overlay').style.display = 'flex';
}

function closeEditModal(e) {
  if (!e || e.target === document.getElementById('edit-order-overlay')) {
    document.getElementById('edit-order-overlay').style.display = 'none';
    editingOrderId = null;
  }
}

async function saveEditedOrder() {
  if (!editingOrderId) return;
  const o = orders.find(x => x.id === editingOrderId);
  if (!o) return;

  const product  = document.getElementById('ef-product').value.trim();
  const size     = document.getElementById('ef-size').value.trim();
  const ply      = document.getElementById('ef-ply').value.trim();
  const colour   = document.getElementById('ef-colour').value.trim();
  const reelSize = document.getElementById('ef-reel-size').value.trim();
  const weight   = document.getElementById('ef-weight').value.trim();
  const qty      = document.getElementById('ef-qty').value;
  const rate     = document.getElementById('ef-rate').value;
  const dateVal  = document.getElementById('ef-date').value;
  const status   = document.getElementById('ef-status').value;
  const priority = document.getElementById('ef-priority').value;

  if (!dateVal) { alert('Delivery Date required hai.'); return; }

  const d          = new Date(dateVal);
  const formatted  = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  const reservedKg = calcOrderKg(weight, qty);

  const payload = {
    action: 'update',
    rowIndex: o.rowIndex,
    id: editingOrderId,
    customer: o.customer,
    product, size, ply, colour, weight, qty, rate,
    date: formatted, status, priority, reelSize, reservedKg, remarks: ''
  };

  const btn = document.getElementById('edit-save-btn');
  btn.textContent = '⏳ Saving...'; btn.disabled = true;

  try {
    await fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    // Optimistic update in memory
    const idx = orders.findIndex(x => x.id === editingOrderId);
    if (idx >= 0) {
      orders[idx] = { ...orders[idx], product, size, ply, colour, reelSize, weight, qty: parseInt(qty)||0, rate: parseFloat(rate)||0, date: dateVal, status, priority, reservedKg };
    }
    document.getElementById('edit-order-overlay').style.display = 'none';
    editingOrderId = null;
    renderOrders();
    if (activeOrderTab === 'grouped') renderGroupedOrders();
    updateDashboardOrders();
    renderCalendar();
    btn.textContent = '💾 Save Changes'; btn.disabled = false;
    setTimeout(() => fetchOrders(), 2000); // sync from sheet
  } catch(err) {
    alert('Save failed: ' + err.message);
    btn.textContent = '💾 Save Changes'; btn.disabled = false;
  }
}

// ── Sync Status ──
function setOrderSyncStatus(type, msg) {
  ['order-sync-dot','cal-sync-dot'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.className = `sync-dot ${type === 'ok' ? '' : type}`;
  });
  ['order-sync-label','cal-sync-label'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = msg;
  });
}

// ── Tab Switch ──
function switchOrderTab(tab, e) {
  activeOrderTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (e && e.target) e.target.classList.add('active');
  document.getElementById('tab-all').style.display        = tab === 'all'        ? 'block' : 'none';
  document.getElementById('tab-grouped').style.display    = tab === 'grouped'    ? 'block' : 'none';
  document.getElementById('tab-reelmap').style.display    = tab === 'reelmap'    ? 'block' : 'none';
  document.getElementById('tab-ratecalc').style.display   = tab === 'ratecalc'   ? 'block' : 'none';
  document.getElementById('tab-quotations').style.display = tab === 'quotations' ? 'block' : 'none';
  document.getElementById('tab-history').style.display    = tab === 'history'    ? 'block' : 'none';
  if (tab === 'grouped')    renderGroupedOrders();
  if (tab === 'reelmap')    renderReelProductMap();
  if (tab === 'ratecalc')   { onPlyChange(); }
  if (tab === 'quotations') renderQuotationsList();
  if (tab === 'history')    renderOrderHistory();
  // Show/hide search bar only for filterable tabs
  const searchBar = document.getElementById('order-search-bar');
  if (searchBar) searchBar.style.display = ['all','history'].includes(tab) ? 'flex' : 'none';
}

// ══════════════════════════════════════════════════════════════
// RENDER — Active Orders (hide Delivered + Dispatched + Cancelled)
// ══════════════════════════════════════════════════════════════

const FINISHED_STATUSES = ['Delivered', 'Dispatched', 'Cancelled'];

function renderOrders() {
  const list = document.getElementById('orders-list');
  const activeOrders = [...orders]
    .filter(o => !FINISHED_STATUSES.includes(o.status))
    .filter(o => matchesSearch(o, orderSearchQuery))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  if (!activeOrders.length) {
    const msg = orderSearchQuery ? `"${orderSearchQuery}" se koi order nahi mila.` : 'Koi active order nahi. Sab deliver ho gaye! 🎉';
    list.innerHTML = `<div class="empty-state">${msg}</div>`;
    return;
  }
  list.innerHTML = '';
  activeOrders.forEach(o => {
    const dateDisp = o.date ? new Date(o.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';
    const row      = document.createElement('div');
    row.className  = 'table-row';
    row.style.cursor = 'pointer';
    row.title = 'Click to edit';
    row.onclick = () => openEditModal(o.id);
    row.innerHTML = `
      <div style="font-family:monospace;font-size:11px;color:var(--muted)">${o.id}</div>
      <div>
        <div style="font-weight:600;font-size:13px">${o.customer}${o.priority === 'Urgent' ? '<span class="priority-urgent">URG</span>' : ''}</div>
        <div style="font-size:11px;color:var(--muted)">${o.product || '—'}</div>
        ${stockBadgeHtml(o)}
      </div>
      <div style="font-size:12px;font-family:monospace">${o.size || '—'}</div>
      <div style="font-size:12px">${colourDot(o.colour)}${o.colour || '—'}</div>
      <div style="font-size:12px">${o.weight ? o.weight + 'gm' : '—'}</div>
      <div style="font-size:12px;font-weight:500">${dateDisp}</div>
      <div><span class="status-badge ${STATUS_CLASS[o.status] || 'status-new'}">${o.status}</span></div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:13px;font-weight:600">${o.qty ? o.qty.toLocaleString('en-IN') : '—'}</span>
        ${o.rate ? `<button class="btn-sm" style="font-size:10px;padding:2px 7px" onclick="event.stopPropagation();openInvoice('${o.id}')">🧾</button>` : ''}
      </div>
    `;
    list.appendChild(row);
  });
}

// ── Render Order History (completed orders) ──
function renderOrderHistory() {
  const el = document.getElementById('history-orders-list');
  if (!el) return;

  const histOrders = [...orders]
    .filter(o => FINISHED_STATUSES.includes(o.status))
    .filter(o => matchesSearch(o, orderSearchQuery))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (!histOrders.length) {
    const msg = orderSearchQuery ? `"${orderSearchQuery}" se koi order nahi mila.` : 'Koi completed order nahi abhi.';
    el.innerHTML = `<div class="empty-state">${msg}</div>`;
    return;
  }

  el.innerHTML = '';
  histOrders.forEach(o => {
    const dateDisp = o.date ? new Date(o.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    const row      = document.createElement('div');
    row.className  = 'table-row';
    row.style.cssText = 'background:#FAFAFA;cursor:pointer';
    row.title = 'Click for invoice';
    row.onclick = () => openInvoice(o.id);
    row.innerHTML = `
      <div style="font-family:monospace;font-size:11px;color:var(--muted)">${o.id}</div>
      <div>
        <div style="font-weight:600;font-size:13px">${o.customer}</div>
        <div style="font-size:11px;color:var(--muted)">${o.product || '—'}</div>
      </div>
      <div style="font-size:12px;font-family:monospace">${o.size || '—'}</div>
      <div style="font-size:12px">${colourDot(o.colour)}${o.colour || '—'}</div>
      <div style="font-size:12px">${o.weight ? o.weight + 'gm' : '—'}</div>
      <div style="font-size:12px">${dateDisp}</div>
      <div><span class="status-badge ${STATUS_CLASS[o.status] || 'status-new'}">${o.status}</span></div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:13px;font-weight:600">${o.qty ? o.qty.toLocaleString('en-IN') : '—'}</span>
        ${o.rate ? `<span style="font-size:11px;color:var(--muted)">₹${(o.qty*o.rate).toLocaleString('en-IN',{maximumFractionDigits:0})}</span>` : ''}
      </div>
    `;
    el.appendChild(row);
  });
}

// ── Render Grouped (active only) ──
function renderGroupedOrders() {
  const el = document.getElementById('grouped-orders-list');
  const activeOrders = orders.filter(o => !FINISHED_STATUSES.includes(o.status));

  if (!activeOrders.length) { el.innerHTML = '<div class="empty-state">Koi active order nahi.</div>'; return; }

  const groups = {};
  activeOrders.forEach(o => {
    if (!groups[o.customer]) groups[o.customer] = [];
    groups[o.customer].push(o);
  });

  el.innerHTML = '';
  Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).forEach(([customer, cOrders]) => {
    const pendingQty = cOrders.reduce((s, o) => s + (o.qty || 0), 0);
    const pendingAmt = cOrders.reduce((s, o) => s + ((o.qty || 0) * (o.rate || 0)), 0);

    const group     = document.createElement('div');
    group.className = 'client-group';
    const safeKey   = customer.replace(/\s/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    group.innerHTML = `
      <div class="client-group-header">
        <div class="client-group-name">🏢 ${customer}</div>
        <div class="client-group-stats">
          <div class="client-stat"><div class="client-stat-val">${pendingQty.toLocaleString('en-IN')}</div><div class="client-stat-lbl">Pending pcs</div></div>
          ${pendingAmt > 0 ? `<div class="client-stat"><div class="client-stat-val">₹${Math.round(pendingAmt/1000)}K</div><div class="client-stat-lbl">Pending amt</div></div>` : ''}
          <div class="client-stat"><div class="client-stat-val">${cOrders.length}</div><div class="client-stat-lbl">Orders</div></div>
        </div>
      </div>
      <div class="orders-table" style="border-radius:0 0 12px 12px;border-top:none;">
        <div class="table-header">
          <div>Order ID</div><div>Product</div><div>Size</div>
          <div>Colour</div><div>Wt</div><div>Delivery</div><div>Status</div><div>Qty</div>
        </div>
        <div class="grouped-rows-${safeKey}"></div>
      </div>`;
    el.appendChild(group);

    const rowsContainer = group.querySelector(`.grouped-rows-${safeKey}`);
    [...cOrders].sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(o => {
      const dateDisp = o.date ? new Date(o.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';
      const row      = document.createElement('div');
      row.className  = 'table-row';
      row.style.cssText = 'background:#FFFBF0;cursor:pointer';
      row.title = 'Click to edit';
      row.onclick = () => openEditModal(o.id);
      row.innerHTML = `
        <div style="font-family:monospace;font-size:11px;color:var(--muted)">${o.id}</div>
        <div>
          <div style="font-weight:600;font-size:12px">${o.product || '—'}</div>
          ${stockBadgeHtml(o)}
        </div>
        <div style="font-size:11px;font-family:monospace">${o.size || '—'}</div>
        <div style="font-size:12px">${colourDot(o.colour)}${o.colour || '—'}</div>
        <div style="font-size:11px">${o.weight ? o.weight + 'gm' : '—'}</div>
        <div style="font-size:12px">${dateDisp}</div>
        <div><span class="status-badge ${STATUS_CLASS[o.status] || 'status-new'}">${o.status}</span></div>
        <div style="font-size:13px;font-weight:600">${o.qty ? o.qty.toLocaleString('en-IN') : '—'}</div>
      `;
      rowsContainer.appendChild(row);
    });
  });
}

// ══════════════════════════════════════════════════════════════
// REEL → PRODUCTS MAP TAB
// ══════════════════════════════════════════════════════════════

function renderReelProductMap() {
  const el = document.getElementById('reel-product-map');
  if (!el) return;

  // Build map: reelSize → [{ client, product, size, ply, weight }]
  const map = {};

  // From client product master
  if (typeof CLIENTS !== 'undefined') {
    CLIENTS.forEach(c => {
      (c.products || []).forEach(p => {
        if (!p.reelSize) return;
        const key = p.reelSize.toString();
        if (!map[key]) map[key] = [];
        map[key].push({ client: c.name, product: p.name, boxSize: p.size, ply: p.ply, weight: p.weight, source: 'master' });
      });
    });
  }

  // Also from active orders (catches products not in master)
  orders
    .filter(o => o.reelSize && !FINISHED_STATUSES.includes(o.status))
    .forEach(o => {
      const key = o.reelSize.toString();
      if (!map[key]) map[key] = [];
      const already = map[key].find(x => x.client === o.customer && x.product === o.product);
      if (!already) {
        map[key].push({ client: o.customer, product: o.product, boxSize: o.size, ply: o.ply, weight: o.weight, source: 'order' });
      }
    });

  if (!Object.keys(map).length) {
    el.innerHTML = '<div class="empty-state">Koi reel-product mapping nahi. Products mein reel size add karo.</div>';
    return;
  }

  el.innerHTML = '';

  // Sort reel sizes numerically
  Object.keys(map).sort((a, b) => parseFloat(a) - parseFloat(b)).forEach(reelSize => {
    const products   = map[reelSize];
    const totalKg    = getTotalKgForSize(reelSize);
    const reservedKg = getReservedKgForSize(reelSize);
    const availKg    = totalKg - reservedKg;

    const stockStatus = totalKg === 0 ? 'no-data' : availKg > 0 ? 'ok' : 'low';
    const stockColor  = stockStatus === 'ok' ? 'var(--success)' : stockStatus === 'low' ? 'var(--danger)' : '#999';
    const stockLabel  = totalKg === 0
      ? 'No stock data'
      : `Total: ${totalKg.toLocaleString('en-IN')} kg · Reserved: ${reservedKg.toLocaleString('en-IN')} kg · Available: ${Math.max(0,Math.round(availKg)).toLocaleString('en-IN')} kg`;

    const section = document.createElement('div');
    section.className = 'card';
    section.style.marginBottom = '16px';

    const rows = products.map(p => `
      <tr style="border-bottom:1px solid var(--border)">
        <td style="padding:8px 12px;font-size:13px;font-weight:600">${p.client}</td>
        <td style="padding:8px 12px;font-size:13px">${p.product || '—'}</td>
        <td style="padding:8px 12px;font-size:12px;font-family:monospace">${p.boxSize || '—'}</td>
        <td style="padding:8px 12px;font-size:12px">${p.ply ? p.ply + ' Ply' : '—'}</td>
        <td style="padding:8px 12px;font-size:12px">${p.weight ? p.weight + ' gm' : '—'}</td>
      </tr>
    `).join('');

    section.innerHTML = `
      <div class="card-header" style="flex-direction:column;align-items:flex-start;gap:4px">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div class="card-title" style="font-size:18px">🧻 ${reelSize}" Reel</div>
          <span style="font-size:12px;font-weight:700;color:${stockColor};background:${stockColor}18;padding:3px 10px;border-radius:20px">
            ${stockStatus === 'no-data' ? '— No Stock Data' : stockStatus === 'ok' ? '✅ In Stock' : '⚠️ Low / Reserved'}
          </span>
          <span style="font-size:11px;color:var(--muted)">${products.length} product${products.length > 1 ? 's' : ''}</span>
        </div>
        <div style="font-size:11px;color:${stockColor};margin-top:2px">${stockLabel}</div>
      </div>
      <div class="card-body" style="padding:0;overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:var(--bg);border-bottom:2px solid var(--border)">
              <th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase">Client</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase">Product</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase">Box Size</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase">Ply</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase">Weight</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
    el.appendChild(section);
  });
}

// ══════════════════════════════════════════════════════════════
// SMART DELIVERY SUGGESTION
// ══════════════════════════════════════════════════════════════

function getSuggestedDeliveryDate() {
  const ply      = parseInt(document.getElementById('f-ply').value)    || 3;
  const qty      = parseInt(document.getElementById('f-qty').value)    || 0;
  const size     = (document.getElementById('f-size').value || '').trim();
  const reelSize = document.getElementById('f-reel-size').value.trim() || guessReelSize(size);

  if (!qty)  { alert('Pehle Quantity enter karo.');  return; }
  if (!size) { alert('Pehle Box Size enter karo.');  return; }

  const prodDays = PRODUCTION_DAYS.calc(ply, qty);
  let suggestion = null, reason = '';

  if (reelSize) {
    const reelCheck = checkReelAvailability(reelSize);
    if (reelCheck.available) {
      const deliveryDate = addBusinessDays(todayStr, prodDays);
      suggestion = { date: deliveryDate, type: 'stock', reelSize, prodDays };
      reason = `✅ ${reelSize}" reel stock mein hai (${reelCheck.count} reels). Production aaj se shuru ho sakti hai.`;
    } else {
      const pending = getPendingDeliveries(reelSize);
      if (pending.length > 0) {
        const earliest = pending[0];
        const afterReel = addBusinessDays(earliest.expectedDelivery, prodDays);
        suggestion = { date: afterReel, type: 'pending', reelSize, prodDays, reelArrival: earliest.expectedDelivery, supplier: earliest.supplier };
        reason = `⏳ ${reelSize}" reel stock mein nahi. ${earliest.supplier} se delivery expected ${formatDate(earliest.expectedDelivery)}.`;
      } else {
        suggestion = { date: null, type: 'unavailable', reelSize };
        reason = `❌ ${reelSize}" reel nahi hai aur koi pending purchase nahi. Pehle reel order karo.`;
      }
    }
  } else {
    const deliveryDate = addBusinessDays(todayStr, prodDays);
    suggestion = { date: deliveryDate, type: 'generic', prodDays };
    reason = `ℹ️ Reel size nahi mili. Sirf production time (${prodDays} din) ke basis pe.`;
  }

  showDeliverySuggestion(suggestion, reason, prodDays);
}

function guessReelSize(boxSize) {
  if (!boxSize) return null;
  const parts = boxSize.split(/[×xX]/).map(p => parseFloat(p.trim()));
  if (parts.length < 3 || isNaN(parts[1]) || isNaN(parts[2])) return null;
  const needed = parts[1] + parts[2] + 0.5; // sheet width = W + H + 0.5"
  const sizes  = reelData.map(r => r.size).sort((a, b) => a - b);
  if (!sizes.length) return [35.5, 42, 44].find(s => s >= needed)?.toString() || null;
  return sizes.find(s => s >= needed)?.toString() || null;
}

function showDeliverySuggestion(suggestion, reason, prodDays) {
  const box = document.getElementById('delivery-suggestion-box');
  if (!box) return;
  const typeColor = suggestion.type === 'stock' ? 'var(--success)' : suggestion.type === 'pending' ? '#B45309' : 'var(--danger)';
  box.style.display    = 'block';
  box.style.borderLeft = `4px solid ${typeColor}`;
  box.innerHTML = `
    <div style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:8px;">🎯 Suggested Delivery Date</div>
    <div style="font-size:12px;color:var(--text);margin-bottom:10px;">${reason}</div>
    ${suggestion.date ? `
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <div style="font-size:22px;font-weight:800;font-family:monospace;color:${typeColor}">${formatDate(suggestion.date)}</div>
        <div style="font-size:11px;color:var(--muted)">Production: ${prodDays} din${suggestion.reelArrival ? `<br>Reel arrives: ${formatDate(suggestion.reelArrival)}` : ''}</div>
        <button class="btn-primary" onclick="acceptSuggestion('${suggestion.date}')" style="padding:8px 16px;font-size:12px;">✅ Yeh Date Use Karo</button>
      </div>` : `<div style="font-size:13px;font-weight:600;color:var(--danger)">Date suggest nahi ho sakti. Pehle reel purchase karo.</div>`}
  `;
}

function acceptSuggestion(dateStr) {
  document.getElementById('f-date').value = dateStr;
  hideSuggestion();
}

function hideSuggestion() {
  const box = document.getElementById('delivery-suggestion-box');
  if (box) box.style.display = 'none';
}

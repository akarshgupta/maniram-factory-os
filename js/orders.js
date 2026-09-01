// ══════════════════════════════════════════════════════════════
// ORDERS.JS — Fetch, Save, Edit, Render, Stock Check
// ══════════════════════════════════════════════════════════════

let orders          = [];
let activeOrderTab  = 'all';
let editingOrderId  = null;
let orderSearchQuery = '';
const pendingOrderIds = new Set(); // saved locally, not yet confirmed in sheet
let _justSavedOrderId = null; // scroll-to + flash this order on the next renderOrders() pass

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
  const od = document.getElementById('f-order-date');
  if (od && !od.value) od.value = new Date().toISOString().split('T')[0];
}

// ── Fetch Orders ──
async function fetchOrders() {
  setOrderSyncStatus('loading', 'Fetching orders...');
  const range = encodeURIComponent(`${ORDERS_TAB}!A1:P500`);
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
    // Positional fallback: matches the column order written by apps-script.gs appendOrder
    // [Order ID, Customer, Product, Box Spec, Ply, Colour, Weight, Qty, Rate, Delivery, Status, Priority, ReelSize, ReservedKG, Remarks]
    const hasHeaders = header.some(h => h.includes('customer') || h.includes('order'));
    const col = hasHeaders ? {
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
      reelSize:  header.findIndex(h => h.includes('reel size') || h === 'reel_size' || h === 'reelsize'),
      resvKg:    header.findIndex(h => h.includes('reserved kg') || h === 'reserved_kg'),
      orderDate: header.findIndex(h => h === 'orderdate' || h.includes('order date') || h === 'order_date'),
      twoPart:   header.findIndex(h => h.includes('two part') || h === 'twopart' || h === 'two_part'),
    } : { id:0, customer:1, product:2, spec:3, ply:4, colour:5, weight:6, qty:7, rate:8, date:9, status:10, priority:11, reelSize:12, resvKg:13, orderDate:14, twoPart:15 };

    // Snapshot pending local orders before we overwrite
    const stillPending = orders.filter(o => pendingOrderIds.has(o.id));

    orders = [];
    for (let i = hasHeaders ? 1 : 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r[col.customer]) continue;
      const rawDate      = col.date      >= 0 ? (r[col.date]      || '') : '';
      const rawOrderDate = col.orderDate >= 0 ? (r[col.orderDate] || '') : '';
      const fetchedId = col.id >= 0 ? (r[col.id] || `MIORD${String(i).padStart(3,'0')}`) : `MIORD${String(i).padStart(3,'0')}`;
      pendingOrderIds.delete(fetchedId); // confirmed in sheet
      orders.push({
        id:         fetchedId,
        customer:   col.customer >= 0 ? (r[col.customer] || '') : '',
        product:    col.product  >= 0 ? (r[col.product]  || '') : '',
        size:       col.spec     >= 0 ? (r[col.spec]     || '') : '',
        ply:        col.ply      >= 0 ? (r[col.ply]      || '') : '',
        colour:     col.colour   >= 0 ? (r[col.colour]   || '') : '',
        weight:     col.weight   >= 0 ? (r[col.weight]   || '') : '',
        qty:        col.qty      >= 0 ? parseInt(r[col.qty]) || 0 : 0,
        rate:       col.rate     >= 0 ? parseFloat(r[col.rate]) || 0 : 0,
        date:       parseSheetDate(rawDate),
        orderDate:  parseSheetDate(rawOrderDate),
        status:     col.status   >= 0 ? (r[col.status]   || 'New') : 'New',
        priority:   col.priority >= 0 ? (r[col.priority] || 'Normal') : 'Normal',
        reelSize:   col.reelSize >= 0 ? (r[col.reelSize] || '') : '',
        reservedKg: col.resvKg  >= 0 ? parseFloat(r[col.resvKg]) || 0 : 0,
        twoPart:    col.twoPart >= 0 ? String(r[col.twoPart]).toUpperCase() === 'TRUE' : false,
        done: false, rowIndex: i + 1,
      });
    }

    // Re-inject any locally-saved orders the sheet hasn't confirmed yet
    stillPending.forEach(o => { if (pendingOrderIds.has(o.id)) orders.push(o); });

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

  // Near-width substitutes — a touch wider than needed, trim the extra. Same
  // single lane as the order actually asked for.
  [1, 2].forEach(delta => {
    [base + delta, base + delta + 0.5].forEach(trySize => {
      const found = reelData.find(r => Math.abs(r.size - trySize) < 0.1);
      if (found) {
        const reservedKg  = getReservedKgForSize(found.size.toString());
        const availableKg = (found.totalWeight + KATRA_BUFFER_KG) - reservedKg;
        if (availableKg >= neededKg) subs.push({ size: found.size, availableKg: Math.round(availableKg), lanes: 1 });
      }
    });
  });

  // Multi-lane substitutes — for a narrow box, a reel roughly 2x/3x/4x the
  // needed width can be slit into that many lanes and run side by side, cutting
  // multiple boxes per pass instead of one. Paper mass needed doesn't change
  // with lane count (same total box area either way), so the same neededKg
  // threshold applies — just search wider targets. Up to ~1.5" of trim waste
  // over the exact multiple is accepted, since stocked widths jump in 0.5-1"
  // steps and rarely land on the multiple exactly (e.g. 15"×2=30" also
  // matches a 30.5" reel; 10"×4=40" also matches 41").
  [2, 3, 4].forEach(lanes => {
    const target = base * lanes;
    reelData.forEach(r => {
      if (r.size >= target && r.size <= target + 1.5) {
        const reservedKg  = getReservedKgForSize(r.size.toString());
        const availableKg = (r.totalWeight + KATRA_BUFFER_KG) - reservedKg;
        if (availableKg >= neededKg) subs.push({ size: r.size, availableKg: Math.round(availableKg), lanes });
      }
    });
  });

  // Dedup by size — keep the fewest-lanes reading when a size qualifies more than one way
  const bySize = {};
  subs.forEach(s => { if (!bySize[s.size] || s.lanes < bySize[s.size].lanes) bySize[s.size] = s; });
  return Object.values(bySize).sort((a, b) => a.size - b.size);
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
      <div style="font-size:13px;font-weight:700;color:var(--danger);margin-bottom:6px;">❌ ${reelSize}" — No stock data found</div>
      ${subs.length ? `<div style="font-size:12px;font-weight:600;color:#B45309;">🔄 Substitute:</div>${subs.map(s=>`<div style="font-size:12px;color:#92400E;">→ ${s.size}" · ${s.availableKg.toLocaleString('en-IN')} kg available${s.lanes > 1 ? ` · cut ${s.lanes} boxes per reel` : ''}</div>`).join('')}` : '<div style="font-size:12px;color:var(--danger)">No substitutes available.</div>'}`;
    return;
  }

  if (availableKg >= neededKg) {
    box.style.borderLeft = '4px solid var(--success)';
    box.innerHTML = `
      <div style="font-size:13px;font-weight:700;color:var(--success);margin-bottom:6px;">✅ Stock Available — ${reelSize}"</div>
      <div style="display:flex;gap:20px;flex-wrap:wrap;font-size:12px;">
        <div><span style="color:var(--muted)">Required:</span> <strong>${neededKg.toLocaleString('en-IN')} kg</strong></div>
        <div><span style="color:var(--muted)">Reserved (other orders):</span> <strong>${reservedKg.toLocaleString('en-IN')} kg</strong></div>
        <div><span style="color:var(--muted)">Remaining after order:</span> <strong style="color:var(--success)">${(availableKg - neededKg).toLocaleString('en-IN')} kg</strong></div>
      </div>`;
  } else {
    const shortage = neededKg - availableKg;
    const subs     = findSubstitutes(reelSize, neededKg);
    box.style.borderLeft = '4px solid var(--danger)';
    box.innerHTML = `
      <div style="font-size:13px;font-weight:700;color:var(--danger);margin-bottom:6px;">⚠️ Low Stock — ${reelSize}"</div>
      <div style="display:flex;gap:20px;flex-wrap:wrap;font-size:12px;margin-bottom:8px;">
        <div><span style="color:var(--muted)">Required:</span> <strong>${neededKg.toLocaleString('en-IN')} kg</strong></div>
        <div><span style="color:var(--muted)">Available:</span> <strong style="color:var(--danger)">${Math.max(0,Math.round(availableKg)).toLocaleString('en-IN')} kg</strong></div>
        <div><span style="color:var(--muted)">Shortage:</span> <strong style="color:var(--danger)">${shortage.toLocaleString('en-IN')} kg</strong></div>
      </div>
      ${subs.length ? `<div style="font-size:12px;font-weight:600;color:#B45309;margin-bottom:4px;">🔄 Substitute Available:</div>${subs.map(s=>`<div style="font-size:12px;color:#92400E;">→ ${s.size}" · ${s.availableKg.toLocaleString('en-IN')} kg ✅${s.lanes > 1 ? ` · cut ${s.lanes} boxes per reel` : ''}</div>`).join('')}` : '<div style="font-size:12px;color:var(--danger);font-weight:600;">No substitutes available. Please place a purchase order first.</div>'}`;
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
  const rate      = document.getElementById('f-rate').value;
  const date      = document.getElementById('f-date').value;
  const orderDate = document.getElementById('f-order-date').value || new Date().toISOString().split('T')[0];
  const status    = document.getElementById('f-status').value;
  const priority  = document.getElementById('f-priority').value;
  const reelSize  = document.getElementById('f-reel-size').value.trim();
  const twoPart   = !!document.getElementById('f-two-part').checked;

  if (!customer || !date) { alert('Customer and Delivery Date are required.'); return; }

  const reservedKg = calcOrderKg(weight, qty);
  const d          = new Date(date);
  const formatted  = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  const od         = new Date(orderDate);
  const fmtOd      = `${String(od.getDate()).padStart(2,'0')}/${String(od.getMonth()+1).padStart(2,'0')}/${od.getFullYear()}`;
  const payload    = { id, customer, product, size, ply, colour, weight, qty, rate, twoPart, date: formatted, orderDate: fmtOd, status, priority, reelSize, reservedKg, remarks: '' };

  try {
    const btn = document.querySelector('button.btn-primary[onclick="saveOrderToSheet()"]');
    if (btn) { btn.textContent = '⏳ Saving...'; btn.disabled = true; }
    await fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const savedOrder = { id, customer, product, size, ply, colour, weight, twoPart, qty: parseInt(qty)||0, rate: parseFloat(rate)||0, date, orderDate };
    // Optimistic update so generateOrderId() increments correctly on next save
    orders.push({ ...savedOrder, status, priority, reelSize, reservedKg, remarks: '', rowIndex: 9999 });
    pendingOrderIds.add(id);
    logOrderEvent(id, 'Order Received', `${customer} · ${product || size || ''} · ${qty || 0} pcs`);
    clearOrderForm();
    refreshOrderId();
    // Active Orders is sorted newest-entered-first (rowIndex desc), so a
    // freshly saved order already lands at the top — still flash/scroll to
    // it so it's obviously the one that just got added. Also surface the
    // Active tab itself, in case the order was saved while viewing
    // History/Grouped/etc.
    _justSavedOrderId = id;
    if (activeOrderTab !== 'all') switchOrderTab('all');
    renderOrders();
    if (btn) btn.textContent = '✅ Saved!';
    setTimeout(() => { if (btn) { btn.textContent = '💾 Save Order'; btn.disabled = false; } }, 2000);
    setTimeout(() => fetchOrders(), 4000);
    openWaModal(savedOrder);
  } catch (err) {
    alert(`Save failed: ${err.message}`);
    const btn = document.querySelector('button.btn-primary[onclick="saveOrderToSheet()"]');
    if (btn) { btn.textContent = '💾 Save Order'; btn.disabled = false; }
  }
}

function clearOrderForm() {
  ['f-id','f-customer','f-qty','f-rate','f-date','f-reel-size'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const od = document.getElementById('f-order-date');
  if (od) od.value = new Date().toISOString().split('T')[0];
  // The date-load strip below the field isn't tied to the input's value —
  // it only redraws on its own onchange — so clearing the field above
  // leaves it showing the previous pick, making an empty Delivery Date
  // look already filled in. Clear it explicitly here too.
  const dateHint = document.getElementById('f-date-load-hint');
  if (dateHint) dateHint.innerHTML = '';
  document.getElementById('f-product').innerHTML = '<option value="">— Select Customer First —</option>';
  clearProductFields();
  document.getElementById('f-status').value   = 'New';
  document.getElementById('f-priority').value = 'Normal';
  document.getElementById('f-two-part').checked = false;
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
  document.getElementById('ef-two-part').checked = !!o.twoPart;
  document.getElementById('ef-qty').value       = o.qty;
  document.getElementById('ef-rate').value       = o.rate;
  document.getElementById('ef-order-date').value = o.orderDate || new Date().toISOString().split('T')[0];
  document.getElementById('ef-date').value       = o.date;
  document.getElementById('ef-status').value    = o.status;
  document.getElementById('ef-priority').value  = o.priority;
  if (typeof convertSizeCmIn === 'function') convertSizeCmIn('ef-size', 'ef-size-in');
  // Refresh both hint strips for THIS order — they only redraw on their
  // own onchange otherwise, so without this a strip left over from a
  // previously edited order would show through here instead.
  if (typeof showDateLoadHint === 'function') showDateLoadHint('ef-date');
  if (typeof showReelHint === 'function') showReelHint(o.reelSize || '', 'ef-reel-hint');

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
  const prevStatus = o.status;

  const product  = document.getElementById('ef-product').value.trim();
  const size     = document.getElementById('ef-size').value.trim();
  const ply      = document.getElementById('ef-ply').value.trim();
  const colour   = document.getElementById('ef-colour').value.trim();
  const reelSize = document.getElementById('ef-reel-size').value.trim();
  const weight   = document.getElementById('ef-weight').value.trim();
  const twoPart  = !!document.getElementById('ef-two-part').checked;
  const qty      = document.getElementById('ef-qty').value;
  const rate      = document.getElementById('ef-rate').value;
  const dateVal   = document.getElementById('ef-date').value;
  const orderDateVal = document.getElementById('ef-order-date').value || new Date().toISOString().split('T')[0];
  const status    = document.getElementById('ef-status').value;
  const priority  = document.getElementById('ef-priority').value;

  if (!dateVal) { alert('Delivery Date is required.'); return; }

  const d          = new Date(dateVal);
  const formatted  = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  const od         = new Date(orderDateVal);
  const fmtOd      = `${String(od.getDate()).padStart(2,'0')}/${String(od.getMonth()+1).padStart(2,'0')}/${od.getFullYear()}`;
  const reservedKg = calcOrderKg(weight, qty);

  const payload = {
    action: 'update',
    rowIndex: o.rowIndex,
    id: editingOrderId,
    customer: o.customer,
    product, size, ply, colour, weight, qty, rate, twoPart,
    date: formatted, orderDate: fmtOd, status, priority, reelSize, reservedKg, remarks: ''
  };

  const btn = document.getElementById('edit-save-btn');
  btn.textContent = '⏳ Saving...'; btn.disabled = true;

  try {
    await fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    // Optimistic update in memory
    const idx = orders.findIndex(x => x.id === editingOrderId);
    if (idx >= 0) {
      orders[idx] = { ...orders[idx], product, size, ply, colour, reelSize, weight, twoPart, qty: parseInt(qty)||0, rate: parseFloat(rate)||0, date: dateVal, orderDate: orderDateVal, status, priority, reservedKg };
    }
    if (status !== prevStatus) logOrderEvent(editingOrderId, 'Status Changed', `${prevStatus} → ${status}`);
    document.getElementById('edit-order-overlay').style.display = 'none';
    editingOrderId = null;
    renderOrders();
    if (activeOrderTab === 'grouped') renderGroupedOrders();
    updateDashboardOrders();
    renderCalendar();
    if (typeof renderProductionPlan === 'function') renderProductionPlan();
    btn.textContent = '💾 Save Changes'; btn.disabled = false;
    setTimeout(() => fetchOrders(), 2000);
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
  const activeBtn = (e && e.target) || document.querySelector(`.tab-btn[onclick*="'${tab}'"]`);
  if (activeBtn) activeBtn.classList.add('active');
  document.getElementById('tab-all').style.display        = tab === 'all'        ? 'block' : 'none';
  document.getElementById('tab-grouped').style.display    = tab === 'grouped'    ? 'block' : 'none';
  document.getElementById('tab-reelmap').style.display    = tab === 'reelmap'    ? 'block' : 'none';
  document.getElementById('tab-challans').style.display   = tab === 'challans'   ? 'block' : 'none';
  document.getElementById('tab-history').style.display    = tab === 'history'    ? 'block' : 'none';
  if (tab === 'grouped')    renderGroupedOrders();
  if (tab === 'reelmap')    renderReelProductMap();
  if (tab === 'challans')   renderChallansTab();
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
  // Consumed exactly once per render, whichever path runs below, so a flash
  // request can never linger and re-trigger on some later, unrelated render.
  const flashId = _justSavedOrderId;
  _justSavedOrderId = null;

  // Most-recently-entered order first — rowIndex reflects append order in
  // the sheet (and pending, not-yet-synced orders sit at the sentinel 9999,
  // so a brand new order is always on top immediately, before the next
  // fetch confirms its real row).
  const activeOrders = [...orders]
    .filter(o => !FINISHED_STATUSES.includes(o.status))
    .filter(o => matchesSearch(o, orderSearchQuery))
    .sort((a, b) => (b.rowIndex || 0) - (a.rowIndex || 0));

  if (!activeOrders.length) {
    const msg = orderSearchQuery ? `No orders found matching "${orderSearchQuery}".` : 'No active orders. All delivered! 🎉';
    list.innerHTML = `<div class="empty-state">${msg}</div>`;
    return;
  }
  list.innerHTML = '';
  activeOrders.forEach(o => {
    const dateDisp    = o.date ? new Date(o.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';
    const dispatched  = typeof getDispatchedQty === 'function' ? getDispatchedQty(o.id) : 0;
    const invoiced    = typeof getInvoicedQty   === 'function' ? getInvoicedQty(o.id)   : 0;
    const remaining   = Math.max(0, (o.qty || 0) - dispatched);
    const dispPct     = o.qty > 0 ? Math.min(100, Math.round((dispatched / o.qty) * 100)) : 0;
    const invPct      = o.qty > 0 ? Math.min(100, Math.round((invoiced   / o.qty) * 100)) : 0;
    const dispBar     = o.qty > 0 && dispatched > 0 ? `
      <div style="margin-top:5px">
        <div style="background:#EEF1F5;border-radius:2px;height:3px;width:100%">
          <div style="background:${remaining === 0 ? 'var(--success)' : 'var(--blue)'};height:3px;border-radius:2px;width:${dispPct}%;transition:width 0.3s"></div>
        </div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">🚚 ${dispatched.toLocaleString('en-IN')} dispatched${remaining > 0 ? ` · ${remaining.toLocaleString('en-IN')} pending` : ' · <span style="color:var(--success)">done</span>'}</div>
      </div>` : '';
    const invBar      = o.qty > 0 && invoiced > 0 ? `
      <div style="margin-top:3px">
        <div style="background:#EEF1F5;border-radius:2px;height:3px;width:100%">
          <div style="background:#0D9488;height:3px;border-radius:2px;width:${invPct}%;transition:width 0.3s"></div>
        </div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">💵 ${invoiced.toLocaleString('en-IN')} invoiced${invoiced >= (o.qty||0) ? ' · <span style="color:var(--success)">fully invoiced</span>' : ''}</div>
      </div>` : '';

    const row      = document.createElement('div');
    row.id         = 'order-row-' + o.id;
    row.className  = 'table-row';
    row.style.cursor = 'pointer';
    row.style.borderLeft = `3px solid ${STATUS_ACCENT[o.status] || STATUS_ACCENT['New']}`;
    row.style.gridTemplateColumns = '90px 1fr 90px 90px 90px 100px 90px 195px';
    row.title = 'Click to edit';
    row.onclick = () => openEditModal(o.id);
    row.innerHTML = `
      <div style="font-family:monospace;font-size:11px;color:var(--muted)">${o.id}</div>
      <div>
        <div style="font-weight:600;font-size:13px">${o.customer}${o.priority === 'Urgent' ? '<span class="priority-urgent">URG</span>' : ''}</div>
        <div style="font-size:11px;color:var(--muted)">${o.product || '—'}${o.orderDate ? ' · <span style="color:var(--muted);font-size:10px">Ordered: ' + new Date(o.orderDate).toLocaleDateString('en-IN',{day:'numeric',month:'short'}) + '</span>' : ''}</div>
        ${stockBadgeHtml(o)}
        ${dispBar}
        ${invBar}
      </div>
      <div style="font-size:12px;font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${o.size || ''}">${o.size || '—'}</div>
      <div style="font-size:12px">${colourDot(o.colour)}${o.colour || '—'}</div>
      <div style="font-size:12px">${o.weight ? o.weight + 'gm' : '—'}</div>
      <div style="font-size:12px;font-weight:500">${dateDisp}</div>
      <div><span class="status-badge ${STATUS_CLASS[o.status] || 'status-new'}">${o.status}</span></div>
      <div style="display:flex;align-items:center;gap:5px;flex-wrap:nowrap">
        <span style="font-size:13px;font-weight:600">${o.qty ? o.qty.toLocaleString('en-IN') : '—'}</span>
        <button class="btn-sm" style="font-size:10px;padding:2px 6px" onclick="event.stopPropagation();openChallanModal('${o.id}')" title="Issue Delivery Challan">🚚</button>
        <button class="btn-sm" style="font-size:10px;padding:2px 6px" onclick="event.stopPropagation();quickPrintJobCard('${o.id}')" title="Print Job Card (holds print spec if saved)">📋</button>
        <button class="btn-sm" style="font-size:10px;padding:2px 6px;color:var(--muted)" onclick="event.stopPropagation();openPrintSpecModal('${o.id}')" title="Edit Print Spec">✏️</button>
        <button class="btn-sm" style="font-size:10px;padding:2px 6px;color:var(--success)" onclick="event.stopPropagation();markOrderComplete('${o.id}')" title="Mark Complete (even if short of full quantity)">✅</button>
        <button class="btn-sm" style="font-size:10px;padding:2px 6px;color:var(--muted)" onclick="event.stopPropagation();openOrderHistory('${o.id}')" title="Order History">🕐</button>
        <button class="btn-sm" style="font-size:10px;padding:2px 6px;color:var(--danger)" onclick="event.stopPropagation();removeOrder('${o.id}')" title="Delete Order">🗑</button>
      </div>
    `;
    list.appendChild(row);
  });

  if (flashId) {
    const el = document.getElementById('order-row-' + flashId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('order-row-flash');
      setTimeout(() => el.classList.remove('order-row-flash'), 2000);
    }
  }
}

// ── Shared "order is Delivered" finish line — sheet push + re-renders.
// Caller sets o.status/o.qty/o.remarks (and clears dispatch tracking if
// relevant) before calling. Used by every completion path: manual Mark
// Complete, and auto-complete when dispatch/challan quantity reaches the
// full ordered amount. ──
function _pushOrderUpdate(o) {
  if (!o.rowIndex || o.rowIndex === 9999) return;
  const d   = new Date(o.date + 'T00:00:00');
  const fmt = isNaN(d) ? o.date : `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  fetch(APPS_SCRIPT_URL, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'update', rowIndex: o.rowIndex,
      id: o.id, customer: o.customer, product: o.product || '', size: o.size || '',
      ply: o.ply || '', colour: o.colour || '', weight: o.weight || '',
      qty: o.qty, rate: o.rate, date: fmt, status: o.status,
      priority: o.priority || 'Normal', reelSize: o.reelSize || '',
      reservedKg: o.reservedKg || 0, remarks: o.remarks || ''
    })
  }).catch(() => {});
}

function _finalizeOrderDelivered(o) {
  if (typeof recordDeliveredOrder === 'function') recordDeliveredOrder(o);
  _pushOrderUpdate(o);
  renderOrders();
  if (typeof activeOrderTab !== 'undefined' && activeOrderTab === 'grouped') renderGroupedOrders();
  if (typeof updateDashboardOrders === 'function') updateDashboardOrders();
  if (typeof renderCalendar === 'function') renderCalendar();
  if (typeof renderProductionPlan === 'function') renderProductionPlan();
}

// If every ordered box has now been dispatched (no boxes pending), close
// the order out automatically. Call after any dispatch-quantity change —
// a Delivery Challan save or a Record Dispatch confirm.
function checkOrderFullyDispatched(orderId) {
  const o = orders.find(x => x.id === orderId);
  if (!o || FINISHED_STATUSES.includes(o.status)) return false;
  const total      = parseInt(o.qty) || 0;
  const dispatched = typeof getDispatchedQty === 'function' ? getDispatchedQty(orderId) : 0;
  if (!total || dispatched < total) return false;

  o.status = 'Delivered';
  logOrderEvent(orderId, 'Delivered', `Auto — fully dispatched (${dispatched}/${total} pcs)`);
  if (typeof clearDispatch === 'function') clearDispatch(orderId);
  _finalizeOrderDelivered(o);
  return true;
}

// ── Mark an order complete at less than (or equal to) its full ordered
// quantity. Use when production/dispatch fell short but the order is
// being closed out as-is (e.g. ordered 500, made 400 — close at 400). ──
function markOrderComplete(orderId) {
  const o = orders.find(x => x.id === orderId);
  if (!o) return;
  if (FINISHED_STATUSES.includes(o.status)) { alert(`${o.id} is already ${o.status}.`); return; }

  const ordered   = parseInt(o.qty) || 0;
  const dispatched = typeof getDispatchedQty === 'function' ? getDispatchedQty(orderId) : 0;
  const suggested = dispatched > 0 ? dispatched : ordered;

  const input = prompt(
    `Mark ${o.id} — ${o.customer} (${o.product || o.size || ''}) as complete.\n` +
    `Ordered: ${ordered.toLocaleString('en-IN')} boxes.\n\n` +
    `How many boxes were actually completed?`,
    String(suggested)
  );
  if (input === null) return; // cancelled
  const actual = parseInt(input.trim());
  if (!actual || actual <= 0) { alert('Enter a valid number of boxes.'); return; }

  const short = ordered - actual;
  if (short > 0 && !confirm(`This closes ${o.id} at ${actual.toLocaleString('en-IN')} of ${ordered.toLocaleString('en-IN')} ordered — ${short.toLocaleString('en-IN')} short.\nContinue?`)) return;

  const shortfallNote = short > 0 ? `Completed ${actual}/${ordered} — ${short} short` : '';
  o.remarks = [o.remarks, shortfallNote].filter(Boolean).join(' · ');
  o.qty     = actual;
  o.status  = 'Delivered';
  logOrderEvent(orderId, 'Delivered', shortfallNote || `Completed ${actual}/${ordered} — Mark Complete`);

  if (typeof clearDispatch === 'function') clearDispatch(orderId);
  _finalizeOrderDelivered(o);
}

// ── Delete order (app + sheet) ──
function removeOrder(orderId) {
  const o = orders.find(x => x.id === orderId);
  if (!o) return;
  if (!confirm(`Delete order ${o.id} — ${o.customer} (${o.product || o.size || ''})?\nIt will also be removed from the Google Sheet. This cannot be undone.`)) return;

  orders = orders.filter(x => x.id !== orderId);
  pendingOrderIds.delete(orderId);
  try {
    fetch(APPS_SCRIPT_URL, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deleteOrder', id: orderId }),
    }).catch(() => {});
  } catch (e) { /* offline — sheet row stays until next delete attempt */ }

  renderOrders();
  if (typeof activeOrderTab !== 'undefined' && activeOrderTab === 'grouped') renderGroupedOrders();
  if (typeof updateDashboardOrders === 'function') updateDashboardOrders();
  if (typeof renderCalendar === 'function') renderCalendar();
  if (typeof renderProductionPlan === 'function') renderProductionPlan();
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
    const msg = orderSearchQuery ? `No orders found matching "${orderSearchQuery}".` : 'No completed orders yet.';
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
      <div style="font-size:12px;font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${o.size || ''}">${o.size || '—'}</div>
      <div style="font-size:12px">${colourDot(o.colour)}${o.colour || '—'}</div>
      <div style="font-size:12px">${o.weight ? o.weight + 'gm' : '—'}</div>
      <div style="font-size:12px">${dateDisp}</div>
      <div><span class="status-badge ${STATUS_CLASS[o.status] || 'status-new'}">${o.status}</span></div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:13px;font-weight:600">${o.qty ? o.qty.toLocaleString('en-IN') : '—'}</span>
        ${o.rate ? `<span style="font-size:11px;color:var(--muted)">₹${(o.qty*o.rate).toLocaleString('en-IN',{maximumFractionDigits:0})}</span>` : ''}
        ${o.remarks && o.remarks.includes('short') ? `<span style="font-size:10px;color:#E67E22;font-weight:600" title="${o.remarks}">⚠️ short</span>` : ''}
      </div>
    `;
    el.appendChild(row);
  });
}

// ── Render Grouped (active only) ──
function renderGroupedOrders() {
  const el = document.getElementById('grouped-orders-list');
  const activeOrders = orders.filter(o => !FINISHED_STATUSES.includes(o.status));

  if (!activeOrders.length) { el.innerHTML = '<div class="empty-state">No active orders.</div>'; return; }

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
        <div style="font-size:11px;font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${o.size || ''}">${o.size || '—'}</div>
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
    el.innerHTML = '<div class="empty-state">No reel-product mappings found. Add reel sizes to products.</div>';
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

// Returns a human-readable note about why a slot was chosen
function slotNote(slot, reelSize) {
  if (!slot) return '';
  if (slot.reason === 'batch') return ` Batched with existing ${reelSize}" production run — same Stage-1 day.`;
  if (slot.pushedBy > 0)       return ` Floor full for ${reelSize}" reel — pushed ${slot.pushedBy} day(s) forward.`;
  return '';
}

function getSuggestedDeliveryDate() {
  const ply      = parseInt(document.getElementById('f-ply').value)    || 3;
  const qty      = parseInt(document.getElementById('f-qty').value)    || 0;
  const size     = (document.getElementById('f-size').value || '').trim();
  const weight   = parseFloat(document.getElementById('f-weight').value) || 0;
  const reelSize = document.getElementById('f-reel-size').value.trim() || guessReelSize(size);
  const orderKg  = qty * weight / 1000;

  if (!qty)  { alert('Please enter a Quantity first.');  return; }
  if (!size) { alert('Please enter a Box Size first.');  return; }

  const prodDays = typeof getLearnedProductionDays === 'function'
    ? getLearnedProductionDays(ply, qty)
    : PRODUCTION_DAYS.calc(ply, qty);
  let suggestion = null, reason = '';

  if (reelSize) {
    const reelCheck = checkReelAvailability(reelSize);
    if (reelCheck.available) {
      const earliest  = addBusinessDays(todayStr, prodDays);
      const slot      = typeof getNextAvailableDispatchDate === 'function' ? getNextAvailableDispatchDate(earliest, reelSize, orderKg) : { date: earliest, pushedBy: 0, reason: 'fresh' };
      const finalDate = slot ? slot.date : earliest;
      const pushed    = slot ? slotNote(slot, reelSize) : '';
      suggestion = { date: finalDate, type: 'stock', reelSize, prodDays };
      reason = `✅ ${reelSize}" reel in stock (${reelCheck.count} reels). Production can begin today.${pushed}`;
    } else {
      const pending = getPendingDeliveries(reelSize);
      if (pending.length > 0) {
        const earliest  = pending[0];
        const baseDate  = addBusinessDays(earliest.expectedDelivery, prodDays);
        const slot      = typeof getNextAvailableDispatchDate === 'function' ? getNextAvailableDispatchDate(baseDate, reelSize, orderKg) : { date: baseDate, pushedBy: 0, reason: 'fresh' };
        const finalDate = slot ? slot.date : baseDate;
        const pushed    = slot ? slotNote(slot, reelSize) : '';
        suggestion = { date: finalDate, type: 'pending', reelSize, prodDays, reelArrival: earliest.expectedDelivery, supplier: earliest.supplier };
        reason = `⏳ ${reelSize}" reel not in stock. Delivery from ${earliest.supplier} expected ${formatDate(earliest.expectedDelivery)}.${pushed}`;
      } else {
        suggestion = { date: null, type: 'unavailable', reelSize };
        reason = `❌ ${reelSize}" reel unavailable — no pending purchase orders. Please order reels first.`;
      }
    }
  } else {
    const earliest  = addBusinessDays(todayStr, prodDays);
    const slot      = typeof getNextAvailableDispatchDate === 'function' ? getNextAvailableDispatchDate(earliest, '', orderKg) : { date: earliest, pushedBy: 0 };
    const finalDate = slot ? slot.date : earliest;
    const pushed    = slot && slot.pushedBy > 0 ? ` Floor full — pushed ${slot.pushedBy} day(s) forward.` : '';
    suggestion = { date: finalDate, type: 'generic', prodDays };
    reason = `ℹ️ Reel size unknown. Estimate based on production time (${prodDays} days).${pushed}`;
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
        <div style="font-size:11px;color:var(--muted)">Production: ${prodDays} days${suggestion.reelArrival ? `<br>Reel arrives: ${formatDate(suggestion.reelArrival)}` : ''}</div>
        <button class="btn-primary" onclick="acceptSuggestion('${suggestion.date}')" style="padding:8px 16px;font-size:12px;">✅ Use This Date</button>
      </div>` : `<div style="font-size:13px;font-weight:600;color:var(--danger)">Cannot suggest a date. Please place a reel purchase order first.</div>`}
    ${_learnedDeliveryHtml()}
  `;
}

// Historical lead-time insight, based on actual past deliveries for this client
function _learnedDeliveryHtml() {
  if (typeof getPredictedLeadDays !== 'function') return '';
  const client   = (document.getElementById('f-customer')?.value || '').trim();
  const priority = document.getElementById('f-priority')?.value || 'Normal';
  const pred     = getPredictedLeadDays(client, priority);

  if (!pred.ready) {
    const s = pred.learning || { samples: 0, daysOfData: 0 };
    const remain = Math.max(0, 15 - (s.daysOfData || 0));
    return `<div style="margin-top:10px;padding-top:9px;border-top:1px dashed var(--border);font-size:11px;color:var(--muted)">
      📚 Learning delivery times — ${s.samples} deliveries recorded over ${s.daysOfData} day(s).
      ${remain > 0 ? `Predictions start in ~${remain} more day(s) of data.` : 'Almost ready.'}
    </div>`;
  }

  const predicted = typeof addBusinessDays === 'function'
    ? addBusinessDays(todayStr, pred.days)
    : null;
  return `<div style="margin-top:10px;padding-top:9px;border-top:1px dashed var(--border);font-size:12px;color:var(--text)">
    📈 <strong>History says:</strong> similar orders (${pred.basedOn}) actually took
    <strong>~${pred.days} day(s)</strong> to deliver
    ${predicted ? `→ <strong style="font-family:monospace">${formatDate(predicted)}</strong>
      <button class="btn-secondary" onclick="acceptSuggestion('${predicted}')" style="padding:4px 10px;font-size:11px;margin-left:6px">Use</button>` : ''}
    <span style="color:var(--muted)"> (from ${pred.sampleSize} past deliveries)</span>
  </div>`;
}

function acceptSuggestion(dateStr) {
  document.getElementById('f-date').value = dateStr;
  hideSuggestion();
}

function hideSuggestion() {
  const box = document.getElementById('delivery-suggestion-box');
  if (box) box.style.display = 'none';
}

// ══════════════════════════════════════════════════════════════
// WHATSAPP ORDER CONFIRMATION
// ══════════════════════════════════════════════════════════════

let waCurrentOrder = null;

const WA_OPT_FIELDS = ['deliveryDate', 'weight', 'colour', 'ply', 'orderId'];

function buildWaMessage(order, opts) {
  const lines = [
    `Dear ${order.customer},`,
    '',
    'Your order has been confirmed:',
    '',
    `• Product : ${order.product || '—'}`,
    `• Size    : ${order.size || '—'}`,
    `• Qty     : ${order.qty ? order.qty.toLocaleString('en-IN') : '—'} pcs`,
    `• Rate    : ₹${order.rate || '—'}/pc`,
  ];
  if (order.rate && order.qty)
    lines.push(`• Total   : ₹${(order.qty * order.rate).toLocaleString('en-IN')}`);
  if (opts.deliveryDate && order.date) {
    const d = new Date(order.date);
    lines.push(`• Delivery: ${d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}`);
  }
  if (opts.weight && order.weight) lines.push(`• Weight  : ${order.weight} gm/pc`);
  if (opts.colour && order.colour) lines.push(`• Colour  : ${order.colour}`);
  if (opts.ply    && order.ply)    lines.push(`• Ply     : ${order.ply} Ply`);
  if (opts.orderId)                lines.push(`• Order ID: ${order.id}`);
  lines.push('', 'Thank you for your order!', '— Maniram Industries');
  return lines.join('\n');
}

function openWaModal(order) {
  waCurrentOrder = order;
  const client  = (typeof CLIENTS !== 'undefined' ? CLIENTS : []).find(c => c.name === order.customer);
  const phoneEl = document.getElementById('wa-phone');
  if (phoneEl) phoneEl.value = client?.phone || '';
  WA_OPT_FIELDS.forEach(k => {
    const cb = document.getElementById(`wa-opt-${k}`);
    if (cb) cb.checked = false;
  });
  refreshWaMessage();
  const overlay = document.getElementById('wa-confirm-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function refreshWaMessage() {
  if (!waCurrentOrder) return;
  const opts = {};
  WA_OPT_FIELDS.forEach(k => {
    const cb = document.getElementById(`wa-opt-${k}`);
    opts[k] = cb?.checked || false;
  });
  const msgEl = document.getElementById('wa-message');
  if (msgEl) msgEl.value = buildWaMessage(waCurrentOrder, opts);
}

function sendWhatsAppNow() {
  const raw  = (document.getElementById('wa-phone')?.value || '').replace(/\D/g, '');
  const msg  = document.getElementById('wa-message')?.value || '';
  const num  = raw.length === 10 ? '91' + raw : raw;
  const url  = num
    ? `https://wa.me/${num}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
  closeWaModal();
}

function closeWaModal() {
  const overlay = document.getElementById('wa-confirm-overlay');
  if (overlay) overlay.style.display = 'none';
  waCurrentOrder = null;
}

function openJobCardFromWa() {
  if (!waCurrentOrder) return;
  const id = waCurrentOrder.id;
  closeWaModal();
  if (typeof quickPrintJobCard === 'function') quickPrintJobCard(id);
}

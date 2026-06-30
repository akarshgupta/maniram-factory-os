// ══════════════════════════════════════════════════════════════
// DISPATCH.JS — Partial delivery tracking (Sheets-backed)
// Tab: Dispatch  |  Columns: OrderID · DispatchedQty · LastUpdated
// ══════════════════════════════════════════════════════════════

let _dispatchCache = {}; // { orderId: qty } — loaded from Sheets at startup

async function fetchDispatch() {
  try {
    const url  = `https://sheets.googleapis.com/v4/spreadsheets/${DISPATCH_SHEET_ID}/values/${encodeURIComponent(DISPATCH_TAB + '!A2:B2000')}?key=${API_KEY}`;
    const json = await fetch(url).then(r => r.json());
    _dispatchCache = {};
    (json.values || []).forEach(r => {
      if (r[0]) _dispatchCache[r[0]] = parseInt(r[1]) || 0;
    });
  } catch(e) { console.warn('fetchDispatch:', e); }
}

function getDispatchedQty(orderId) {
  return _dispatchCache[orderId] || 0;
}

function addDispatchQty(orderId, qty) {
  _dispatchCache[orderId] = (_dispatchCache[orderId] || 0) + qty;
  fetch(APPS_SCRIPT_URL, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'saveDispatch', orderId, qty: _dispatchCache[orderId] }),
  }).catch(() => {});
  return _dispatchCache[orderId];
}

function clearDispatch(orderId) {
  delete _dispatchCache[orderId];
  fetch(APPS_SCRIPT_URL, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'clearDispatch', orderId }),
  }).catch(() => {});
}

// ── Modal ──
function openDispatchModal(orderId) {
  const o = orders.find(x => x.id === orderId);
  if (!o) return;
  const dispatched = getDispatchedQty(orderId);
  const total      = parseInt(o.qty) || 0;
  const remaining  = Math.max(0, total - dispatched);

  document.getElementById('dm-order-label').textContent    = `${o.product || o.id}`;
  document.getElementById('dm-customer-label').textContent = o.customer;
  document.getElementById('dm-progress-label').textContent =
    `${dispatched.toLocaleString('en-IN')} / ${total.toLocaleString('en-IN')} boxes dispatched · ${remaining.toLocaleString('en-IN')} remaining`;
  const inp = document.getElementById('dm-qty-input');
  inp.value       = '';
  inp.max         = remaining;
  inp.placeholder = `e.g. ${Math.min(1000, remaining)}`;
  document.getElementById('dm-order-id').value = orderId;
  document.getElementById('dispatch-overlay').style.display = 'flex';
  setTimeout(() => inp.focus(), 80);
}

function closeDispatchModal() {
  document.getElementById('dispatch-overlay').style.display = 'none';
}

function confirmDispatch() {
  const orderId    = document.getElementById('dm-order-id').value;
  const qty        = parseInt(document.getElementById('dm-qty-input').value) || 0;
  const o          = orders.find(x => x.id === orderId);
  if (!o) { closeDispatchModal(); return; }
  if (qty <= 0) { alert('Enter number of boxes dispatched.'); return; }

  const total      = parseInt(o.qty) || 0;
  const dispatched = addDispatchQty(orderId, qty);
  closeDispatchModal();

  if (dispatched >= total * 0.95) {
    o.status = 'Delivered';
    clearDispatch(orderId);
    if (typeof recordDeliveredOrder === 'function') recordDeliveredOrder(o);
    if (o.rowIndex && o.rowIndex !== 9999) {
      const d   = new Date(o.date + 'T00:00:00');
      const fmt = isNaN(d) ? o.date
        : `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      fetch(APPS_SCRIPT_URL, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update', rowIndex: o.rowIndex,
          id: o.id, customer: o.customer, product: o.product || '', size: o.size || '',
          ply: o.ply || '', colour: o.colour || '', weight: o.weight || '',
          qty: o.qty, rate: o.rate, date: fmt, status: 'Delivered',
          priority: o.priority || 'Normal', reelSize: o.reelSize || '',
          reservedKg: o.reservedKg || 0, remarks: o.remarks || ''
        })
      });
    }
  }

  renderCalendar();
  updateDashboardOrders();
  if (typeof renderProductionPlan === 'function') renderProductionPlan();
}

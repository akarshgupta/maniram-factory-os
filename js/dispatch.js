// ══════════════════════════════════════════════════════════════
// DISPATCH.JS — Partial delivery tracking (localStorage-backed)
// ══════════════════════════════════════════════════════════════

const LS_DISPATCH = 'mi_dispatch_v1';

function loadDispatchLog() {
  try { return JSON.parse(localStorage.getItem(LS_DISPATCH) || '{}'); } catch { return {}; }
}

function getDispatchedQty(orderId) {
  return loadDispatchLog()[orderId] || 0;
}

function addDispatchQty(orderId, qty) {
  const log      = loadDispatchLog();
  log[orderId]   = (log[orderId] || 0) + qty;
  localStorage.setItem(LS_DISPATCH, JSON.stringify(log));
  return log[orderId];
}

// Called when an order is fully delivered — clears the local counter
function clearDispatch(orderId) {
  const log = loadDispatchLog();
  delete log[orderId];
  localStorage.setItem(LS_DISPATCH, JSON.stringify(log));
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
    // Fully dispatched — mark Delivered in sheet
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

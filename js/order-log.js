// ══════════════════════════════════════════════════════════════
// ORDER-LOG.JS — Per-order activity timeline: order received, job card
// issued, status changes (In Production, Delivered, ...), dispatched,
// invoiced, rolled back. localStorage is the live store; every event
// also mirrors to its own sheet (ORDER_LOG_SHEET_ID) so the trail
// survives a browser wipe and is visible from any device — durability
// is the whole point of an audit log, unlike most localStorage-first
// features here.
// ══════════════════════════════════════════════════════════════

const LS_ORDER_LOG   = 'mi_order_log_v1';
const ORDER_LOG_MAX  = 3000; // cap local growth — the sheet mirror is the durable long-term record
let orderLog = [];

function loadOrderLog()     { try { return JSON.parse(localStorage.getItem(LS_ORDER_LOG) || '[]'); } catch { return []; } }
function saveOrderLogList() { localStorage.setItem(LS_ORDER_LOG, JSON.stringify(orderLog)); }
function initOrderLog()     { orderLog = loadOrderLog(); }

function logOrderEvent(orderId, event, detail) {
  if (!orderId || !event) return;
  const entry = { orderId, event, detail: detail || '', ts: new Date().toISOString() };
  orderLog.push(entry);
  if (orderLog.length > ORDER_LOG_MAX) orderLog = orderLog.slice(orderLog.length - ORDER_LOG_MAX);
  saveOrderLogList();
  if (typeof mirrorToSheet === 'function') mirrorToSheet('logOrderEvent', entry);
}

function getOrderLog(orderId) {
  return orderLog.filter(e => e.orderId === orderId).sort((a, b) => a.ts.localeCompare(b.ts));
}

// ── History modal ──
function openOrderHistory(orderId) {
  const overlay = document.getElementById('order-history-overlay');
  if (!overlay) return;
  const o = typeof orders !== 'undefined' ? orders.find(x => x.id === orderId) : null;
  const titleEl = document.getElementById('order-history-title');
  if (titleEl) titleEl.textContent = `🕐 ${orderId}${o ? ' — ' + o.customer : ''}`;

  // Every Delivery Challan issued against this order, whichever of the
  // three ways it got created (Supervisor Log auto-match, manual 🔗 Link,
  // or the 🚚 button on the order itself) — so "N dispatched" on the
  // order row can always be traced back to exactly which DC(s) make it up,
  // and a wrong one removed right from here.
  const challans = typeof getChallansByOrder === 'function' ? getChallansByOrder(orderId) : [];
  const challanTotal = challans.reduce((s, c) => s + (c.qty || 0), 0);
  const challansHtml = `
    <div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">
        🚚 Delivery Challans${challans.length ? ` — ${challanTotal.toLocaleString('en-IN')} pcs across ${challans.length}` : ''}
      </div>
      ${!challans.length ? '<div class="empty-state" style="padding:10px">No challans issued against this order.</div>' : challans.map(c => {
        const idx = challanList.indexOf(c);
        return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
          <div><strong style="font-family:monospace;color:var(--navy)">${c.dcNum}</strong> · ${c.date ? new Date(c.date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—'}</div>
          <div style="display:flex;align-items:center;gap:8px">
            <strong>${(c.qty || 0).toLocaleString('en-IN')} pcs</strong>
            <button class="btn-sm" style="color:var(--danger)" onclick="deleteChallan(${idx});openOrderHistory('${orderId}')" title="Delete this challan">✕</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;

  // Every invoice with at least one line item billed against this order —
  // so it can be deleted right from here instead of hunting for it on the
  // Invoicing page. Deleting removes the whole invoice (same as the
  // Invoicing page's own delete) even if it also carries items for other
  // orders — there's no item-level delete anywhere else in the app either.
  const relatedInvoices = typeof invoiceList !== 'undefined'
    ? invoiceList.filter(iv => (iv.items || []).some(it => (it.orderId || iv.orderId) === orderId))
    : [];
  const invoicesHtml = `
    <div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">
        🧾 Invoices${relatedInvoices.length ? ` — ${relatedInvoices.length}` : ''}
      </div>
      ${!relatedInvoices.length ? '<div class="empty-state" style="padding:10px">No invoices for this order.</div>' : relatedInvoices.map(iv => {
        const qtyForThisOrder = (iv.items || []).reduce((s, it) => s + ((it.orderId || iv.orderId) === orderId ? (it.qty || 0) : 0), 0);
        return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
          <div><strong style="font-family:monospace;color:var(--navy)">${iv.id}</strong> · ${iv.date ? new Date(iv.date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—'}</div>
          <div style="display:flex;align-items:center;gap:8px">
            <strong>${qtyForThisOrder.toLocaleString('en-IN')} pcs</strong>
            <button class="btn-sm" onclick="editInvoice('${iv.id}')" title="Open ${iv.id}">📄</button>
            <button class="btn-sm" style="color:var(--danger)" onclick="deleteInvoice('${iv.id}');openOrderHistory('${orderId}')" title="Delete this invoice">✕</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;

  const entries = getOrderLog(orderId);
  const body = document.getElementById('order-history-body');
  if (body) {
    body.innerHTML = challansHtml + invoicesHtml + (!entries.length
      ? '<div class="empty-state">No activity logged yet for this order.</div>'
      : entries.map(e => {
          const d = new Date(e.ts);
          const dateStr = isNaN(d) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
          const timeStr = isNaN(d) ? '' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
          return `<div style="display:flex;gap:12px;padding:9px 0;border-bottom:1px solid var(--border)">
            <div style="width:100px;flex:none;font-size:11px;color:var(--muted);line-height:1.4">${dateStr}<br>${timeStr}</div>
            <div>
              <div style="font-weight:700;font-size:13px">${e.event}</div>
              ${e.detail ? `<div style="font-size:12px;color:var(--muted);margin-top:1px">${e.detail}</div>` : ''}
            </div>
          </div>`;
        }).join(''));
  }
  overlay.style.display = 'flex';
}

function closeOrderHistory() {
  const overlay = document.getElementById('order-history-overlay');
  if (overlay) overlay.style.display = 'none';
}

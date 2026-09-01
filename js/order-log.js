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

  const entries = getOrderLog(orderId);
  const body = document.getElementById('order-history-body');
  if (body) {
    body.innerHTML = !entries.length
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
        }).join('');
  }
  overlay.style.display = 'flex';
}

function closeOrderHistory() {
  const overlay = document.getElementById('order-history-overlay');
  if (overlay) overlay.style.display = 'none';
}

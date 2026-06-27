// ══════════════════════════════════════════════════════════════
// RECEIVABLES.JS — Customer Outstanding & Payment Tracking
// ══════════════════════════════════════════════════════════════

const LS_PAYMENTS = 'mi_payments_v1';
let payments = [];
let recordingPaymentFor = null;

// ── Storage ──
function loadPayments()  { try { return JSON.parse(localStorage.getItem(LS_PAYMENTS) || '[]'); } catch { return []; } }
function savePayments()  { localStorage.setItem(LS_PAYMENTS, JSON.stringify(payments)); }
function initPayments()  { payments = loadPayments(); }

function generatePaymentId() {
  let max = 0;
  payments.forEach(p => {
    const m = p.id?.match(/PAY(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1]));
  });
  return 'PAY' + String(max + 1).padStart(3, '0');
}

// ── Data Helpers ──
function getCustomerSummaries() {
  // Billed = Delivered + Dispatched orders with rate > 0
  const billedOrders = orders.filter(o =>
    ['Delivered', 'Dispatched'].includes(o.status) && parseFloat(o.rate) > 0 && o.qty
  );
  // Active (in-pipeline) orders with rate > 0
  const activeOrders = orders.filter(o =>
    !['Delivered', 'Dispatched', 'Cancelled'].includes(o.status) && parseFloat(o.rate) > 0 && o.qty
  );

  const allCustomers = [...new Set([
    ...billedOrders.map(o => o.customer),
    ...activeOrders.map(o => o.customer),
  ])].filter(Boolean).sort();

  return allCustomers.map(customer => {
    const cBilled  = billedOrders.filter(o => o.customer === customer);
    const cActive  = activeOrders.filter(o => o.customer === customer);
    const cPayments = payments.filter(p => p.customer === customer);

    const totalBilled  = cBilled.reduce((s, o) => s + (o.qty||0) * (o.rate||0), 0);
    const totalPending = cActive.reduce((s, o) => s + (o.qty||0) * (o.rate||0), 0);
    const totalPaid    = cPayments.reduce((s, p) => s + (p.amount||0), 0);
    const outstanding  = totalBilled - totalPaid;

    return {
      customer,
      totalBilled,
      totalPaid,
      outstanding,
      totalPending,
      billedOrderCount:  cBilled.length,
      activeOrderCount:  cActive.length,
      paymentHistory:    [...cPayments].sort((a, b) => b.date.localeCompare(a.date)),
    };
  }).filter(s => s.totalBilled > 0 || s.totalPending > 0);
}

// ── Render Page ──
function renderReceivables() {
  const el = document.getElementById('receivables-list');
  if (!el) return;

  const summaries = getCustomerSummaries();
  el.innerHTML = '';

  if (!summaries.length) {
    el.innerHTML = `<div class="empty-state">Koi billed order nahi abhi.<br>Jab orders Delivered ya Dispatched mark honge tab yahan dikhega.</div>`;
    return;
  }

  const totalBilled      = summaries.reduce((s, x) => s + x.totalBilled, 0);
  const totalPaid        = summaries.reduce((s, x) => s + x.totalPaid, 0);
  const totalOutstanding = totalBilled - totalPaid;
  const fmt0 = n => Math.round(n).toLocaleString('en-IN');

  // ── Summary strip ──
  const strip = document.createElement('div');
  strip.className = 'grid-3';
  strip.style.marginBottom = '20px';
  strip.innerHTML = `
    <div class="stat-card alert">
      <div class="stat-label">Total Outstanding</div>
      <div class="stat-value" style="color:var(--danger);font-size:20px">₹${fmt0(totalOutstanding)}</div>
      <div class="stat-sub">${summaries.filter(s => s.outstanding > 0).length} client${summaries.filter(s=>s.outstanding>0).length!==1?'s':''} with dues</div>
    </div>
    <div class="stat-card info">
      <div class="stat-label">Total Billed</div>
      <div class="stat-value" style="font-size:20px">₹${fmt0(totalBilled)}</div>
      <div class="stat-sub">Delivered + Dispatched orders</div>
    </div>
    <div class="stat-card good">
      <div class="stat-label">Total Collected</div>
      <div class="stat-value" style="color:var(--success);font-size:20px">₹${fmt0(totalPaid)}</div>
      <div class="stat-sub">${totalBilled > 0 ? Math.round((totalPaid/totalBilled)*100) : 0}% of billed</div>
    </div>
  `;
  el.appendChild(strip);

  // ── Per-customer cards ──
  summaries.forEach(s => {
    const paidPct   = s.totalBilled > 0 ? Math.min(100, Math.round((s.totalPaid / s.totalBilled) * 100)) : 0;
    const isOverdue = s.outstanding > 0;

    const recentPayments = s.paymentHistory.slice(0, 3).map(p => `
      <div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:1px solid var(--border)">
        <span style="color:var(--muted)">${formatDate(p.date)}${p.note ? ' · ' + p.note : ''} <span style="font-family:monospace;color:var(--muted)">(${p.id})</span></span>
        <span style="color:var(--success);font-weight:600">+₹${fmt0(p.amount)}</span>
      </div>
    `).join('');

    const safeCustomer = s.customer.replace(/'/g, "\\'");
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = `margin-bottom:12px;border-left:4px solid ${isOverdue ? 'var(--danger)' : 'var(--success)'}`;
    card.innerHTML = `
      <div class="card-header" style="flex-wrap:wrap;gap:12px;align-items:flex-start">
        <div style="flex:1;min-width:160px">
          <div style="font-size:15px;font-weight:700;color:var(--navy)">${s.customer}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">
            ${s.billedOrderCount} delivered order${s.billedOrderCount!==1?'s':''}
            ${s.activeOrderCount ? ' · ' + s.activeOrderCount + ' active (₹' + fmt0(s.totalPending) + ' pending)' : ''}
          </div>
        </div>
        <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center">
          <div style="text-align:center">
            <div style="font-size:17px;font-weight:700;font-family:monospace;color:var(--navy)">₹${fmt0(s.totalBilled)}</div>
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase">Billed</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:17px;font-weight:700;font-family:monospace;color:var(--success)">₹${fmt0(s.totalPaid)}</div>
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase">Paid</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:17px;font-weight:700;font-family:monospace;color:${isOverdue ? 'var(--danger)' : 'var(--success)'}">
              ${isOverdue ? '₹' + fmt0(s.outstanding) : '✅ Clear'}
            </div>
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase">Outstanding</div>
          </div>
          <button class="btn-primary" style="font-size:12px;padding:7px 14px" onclick="openRecordPayment('${safeCustomer}')">💰 Record Payment</button>
        </div>
      </div>
      <div style="padding:0 20px 14px">
        <div style="background:var(--bg);border-radius:4px;height:6px;margin-bottom:6px">
          <div style="background:var(--success);height:6px;border-radius:4px;width:${paidPct}%;transition:width 0.4s"></div>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px">${paidPct}% collected</div>
        ${recentPayments ? `
          <div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Recent Payments</div>
          ${recentPayments}
          ${s.paymentHistory.length > 3 ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">+${s.paymentHistory.length - 3} more</div>` : ''}
        ` : `<div style="font-size:12px;color:var(--muted)">No payments recorded yet.</div>`}
      </div>
    `;
    el.appendChild(card);
  });
}

// ── Record Payment Modal ──
function openRecordPayment(customer) {
  recordingPaymentFor = customer;
  const s = getCustomerSummaries().find(x => x.customer === customer);
  document.getElementById('pay-modal-customer').textContent   = customer;
  document.getElementById('pay-modal-outstanding').textContent = s ? '₹' + Math.round(s.outstanding).toLocaleString('en-IN') : '₹0';
  document.getElementById('pay-amount').value = '';
  document.getElementById('pay-date').value   = todayStr;
  document.getElementById('pay-note').value   = '';
  document.getElementById('record-payment-overlay').style.display = 'flex';
  document.getElementById('pay-amount').focus();
}

function closeRecordPayment() {
  document.getElementById('record-payment-overlay').style.display = 'none';
  recordingPaymentFor = null;
}

function saveRecordedPayment() {
  const amount = parseFloat(document.getElementById('pay-amount').value);
  const date   = document.getElementById('pay-date').value;
  const note   = document.getElementById('pay-note').value.trim();

  if (!amount || amount <= 0) { alert('Valid amount daalo (₹ mein).'); return; }
  if (!date) { alert('Date required hai.'); return; }

  const entry = {
    id:         generatePaymentId(),
    customer:   recordingPaymentFor,
    amount,
    date,
    note,
    recordedAt: new Date().toISOString(),
  };

  payments.push(entry);
  savePayments();
  closeRecordPayment();
  renderReceivables();
}

function deletePayment(id) {
  if (!confirm(`Delete payment ${id}?`)) return;
  payments = payments.filter(p => p.id !== id);
  savePayments();
  renderReceivables();
}

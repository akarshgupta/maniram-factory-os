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
    el.innerHTML = `<div class="empty-state">No billed orders yet.<br>Orders marked as Delivered or Dispatched will appear here.</div>`;
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
          ${isOverdue ? `<button class="btn-secondary" style="font-size:12px;padding:7px 12px;color:#15803D;border-color:#86EFAC" onclick="openPaymentReminder('${safeCustomer}')" title="Send a payment reminder on WhatsApp">📲 Reminder</button>` : ''}
          <button class="btn-primary" style="font-size:12px;padding:7px 14px" onclick="openRecordPayment('${safeCustomer}')">💰 Record Payment</button>
        </div>
      </div>
      <div style="padding:0 20px 14px">
        <div style="background:var(--bg);border-radius:4px;height:6px;margin-bottom:6px">
          <div style="background:var(--success);height:6px;border-radius:4px;width:${paidPct}%;transition:width 0.4s"></div>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px">${paidPct}% collected${isOverdue && _payRemindedNote(s.customer) ? ' · ' + _payRemindedNote(s.customer) : ''}</div>
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

  if (!amount || amount <= 0) { alert('Please enter a valid amount (in ₹).'); return; }
  if (!date) { alert('Date is required.'); return; }

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
  if (typeof mirrorToSheet === 'function') {
    mirrorToSheet('savePayment', {
      id: entry.id, date: entry.date, customer: entry.customer,
      amount: entry.amount, note: entry.note,
    });
  }
  closeRecordPayment();
  renderReceivables();
}

function deletePayment(id) {
  if (!confirm(`Delete payment ${id}?`)) return;
  payments = payments.filter(p => p.id !== id);
  savePayments();
  if (typeof mirrorToSheet === 'function') mirrorToSheet('deletePayment', { id });
  renderReceivables();
}

// ══════════════════════════════════════════════════════════════
// PAYMENT REMINDER — WhatsApp. Pre-fills the outstanding amount (editable),
// picks a tone (friendly → firm → final), lists the party's recent bills,
// and ends with two easy reply options so the party actually answers
// instead of leaving the message on "seen". Sending opens WhatsApp with
// the text ready; the date sent is remembered per party.
// ══════════════════════════════════════════════════════════════
const LS_PAY_REMINDED = 'mi_pay_reminded_v1';
let _payRemFor = null;

function _payReminded()       { try { return JSON.parse(localStorage.getItem(LS_PAY_REMINDED) || '{}'); } catch { return {}; } }
function _payRemindedNote(c)  {
  const r = _payReminded()[c];
  if (!r) return '';
  const days = Math.floor((Date.now() - new Date(r.at).getTime()) / 86400000);
  return `📲 Reminded ${days === 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago'} (${r.tone})`;
}

function _payRemBills(customer) {
  if (typeof invoiceList === 'undefined') return [];
  const k = customer.toLowerCase().replace(/[^a-z0-9]/g, '');
  return invoiceList
    .filter(iv => (iv.party || '').toLowerCase().replace(/[^a-z0-9]/g, '') === k && iv.total > 0)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 5);
}

function openPaymentReminder(customer) {
  _payRemFor = customer;
  const s = getCustomerSummaries().find(x => x.customer === customer);
  const client = typeof _findClientForParty === 'function' ? _findClientForParty(customer) : null;
  const raw = (client?.phone || '').replace(/\D/g, '');
  const phone = raw.length > 10 && raw.startsWith('91') ? raw.slice(2) : raw;
  const due = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const bills = _payRemBills(customer);

  let ov = document.getElementById('payrem-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'payrem-overlay'; ov.className = 'popup-overlay';
    ov.onclick = e => { if (e.target === ov) closePaymentReminder(); };
    document.body.appendChild(ov);
  }
  const lbl = t => `<label class="form-label">${t}</label>`;
  ov.innerHTML = `<div class="popup-box" style="width:min(520px,95vw);max-width:none;padding:22px;max-height:92vh;overflow-y:auto" onclick="event.stopPropagation()">
    <div class="popup-title">📲 Payment Reminder — ${customer}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="form-group">${lbl('Amount due (₹)')}<input class="form-input" type="number" id="payrem-amount" value="${Math.max(0, Math.round(s ? s.outstanding : 0))}" oninput="refreshPaymentReminder()"></div>
      <div class="form-group">${lbl('WhatsApp number')}<input class="form-input" type="tel" id="payrem-phone" value="${phone}" placeholder="10-digit mobile"></div>
      <div class="form-group">${lbl('Contact name')}<input class="form-input" id="payrem-name" value="${(client?.contact || customer).replace(/"/g, '&quot;')}" oninput="refreshPaymentReminder()"></div>
      <div class="form-group">${lbl('Pay by')}<input class="form-input" type="date" id="payrem-due" value="${due}" onchange="refreshPaymentReminder()"></div>
    </div>
    <div class="form-group">${lbl('Tone')}
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${[['friendly', '🙂 Friendly'], ['firm', '📌 Firm'], ['final', '⚠️ Final']].map(([v, t], i) =>
          `<label class="wa-chip"><input type="radio" name="payrem-tone" value="${v}" ${i === 0 ? 'checked' : ''} onchange="refreshPaymentReminder()"> <span>${t}</span></label>`).join('')}
        ${bills.length ? `<label class="wa-chip"><input type="checkbox" id="payrem-bills" checked onchange="refreshPaymentReminder()"> <span>List recent bills</span></label>` : ''}
      </div>
    </div>
    <div class="form-group">${lbl('Message — edit anything before sending')}<textarea class="form-input" id="payrem-msg" rows="14" style="font-size:12.5px;line-height:1.45"></textarea></div>
    ${_payRemindedNote(customer) ? `<div style="font-size:11px;color:var(--muted);margin-bottom:8px">${_payRemindedNote(customer)}</div>` : ''}
    <div style="display:flex;gap:10px">
      <button class="btn-primary" style="flex:1;background:#16A34A" onclick="sendPaymentReminder()">📲 Open in WhatsApp</button>
      <button class="btn-secondary" onclick="copyPaymentReminder()">📋 Copy</button>
      <button class="btn-secondary" onclick="closePaymentReminder()">Cancel</button>
    </div></div>`;
  ov.style.display = 'flex';
  refreshPaymentReminder();
}

function _buildPaymentReminder() {
  const v = id => (document.getElementById(id) || {}).value || '';
  const amt  = Math.round(parseFloat(v('payrem-amount')) || 0).toLocaleString('en-IN');
  const name = v('payrem-name').trim() || _payRemFor;
  const tone = (document.querySelector('input[name="payrem-tone"]:checked') || {}).value || 'friendly';
  const d    = v('payrem-due') ? new Date(v('payrem-due') + 'T00:00:00') : null;
  const by   = d && !isNaN(d) ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }) : '';
  const bills = document.getElementById('payrem-bills')?.checked ? _payRemBills(_payRemFor) : [];
  const billTxt = bills.length
    ? '\n\n*Recent bills:*\n' + bills.map(iv => `• ${iv.id} — ${iv.date ? new Date(iv.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''} — ₹${Math.round(iv.total).toLocaleString('en-IN')}`).join('\n')
    : '';
  const reply = `\n\nA quick reply helps us update our records:\n*1* — Already paid (please share the UTR / cheque no.)\n*2* — Will pay on ____ (just tell us the date)`;
  const sign  = `\n\nThank you,\nManiram Industries, Jhansi`;

  if (tone === 'firm') return `Dear ${name},\n\nGreetings from Maniram Industries 🙏\n\nOur records show an outstanding balance of *₹${amt}* on your account, which is now overdue.${billTxt}\n\nWe request you to kindly clear it${by ? ` by *${by}*` : ' at the earliest'}. Timely payments help us keep your supplies running on schedule.${reply}${sign}`;
  if (tone === 'final') return `Dear ${name},\n\nThis is a final reminder regarding the outstanding balance of *₹${amt}* on your account with Maniram Industries.${billTxt}\n\nDespite our earlier reminders, the payment is still pending. Please clear it${by ? ` by *${by}*` : ' immediately'} — after that we will have to hold further dispatches until the account is settled.\n\nIf you have already paid, please send the UTR / cheque details so we can update our records right away.${sign}`;
  return `Dear ${name},\n\nGreetings from Maniram Industries 🙏\n\nHope business is going well. This is a gentle reminder that *₹${amt}* is pending on your account.${billTxt}\n\nCould you please arrange the payment${by ? ` by *${by}*` : ''}?${reply}${sign}`;
}

function refreshPaymentReminder() {
  const el = document.getElementById('payrem-msg');
  if (el) el.value = _buildPaymentReminder();
}

function _markPaymentReminded() {
  const r = _payReminded();
  r[_payRemFor] = { at: new Date().toISOString(), tone: (document.querySelector('input[name="payrem-tone"]:checked') || {}).value || 'friendly' };
  try { localStorage.setItem(LS_PAY_REMINDED, JSON.stringify(r)); } catch (e) {}
}

function sendPaymentReminder() {
  const raw = (document.getElementById('payrem-phone')?.value || '').replace(/\D/g, '');
  const num = raw.length === 10 ? '91' + raw : raw;
  const msg = document.getElementById('payrem-msg')?.value || '';
  window.open(num ? `https://wa.me/${num}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  _markPaymentReminded();
  closePaymentReminder();
  renderReceivables();
}

function copyPaymentReminder() {
  const msg = document.getElementById('payrem-msg')?.value || '';
  (navigator.clipboard ? navigator.clipboard.writeText(msg) : Promise.reject()).then(
    () => { _markPaymentReminded(); alert('Message copied.'); },
    () => { const el = document.getElementById('payrem-msg'); el.select(); document.execCommand('copy'); _markPaymentReminded(); });
}

function closePaymentReminder() {
  const ov = document.getElementById('payrem-overlay');
  if (ov) ov.style.display = 'none';
}

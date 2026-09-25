// ══════════════════════════════════════════════════════════════
// CHALLAN.JS — Delivery Challan (modal → print + history tab)
// ══════════════════════════════════════════════════════════════

const LS_CHALLANS = 'mi_challans_v2';
let challanList   = [];
let _challanOrderId = null;

// ── Storage ──
function loadChallans()  { try { return JSON.parse(localStorage.getItem(LS_CHALLANS) || '[]'); } catch { return []; } }
function saveChallans()  { localStorage.setItem(LS_CHALLANS, JSON.stringify(challanList)); }
function initChallans()  { challanList = loadChallans(); }

// ── DC Number — global sequential, stored per challan ──
function _nextDcNum() {
  const yr  = new Date().getFullYear().toString().slice(-2);
  let max   = 0;
  challanList.forEach(c => {
    const m = c.dcNum?.match(/DC-(\d+)\//);
    if (m) max = Math.max(max, parseInt(m[1]));
  });
  return `DC-${String(max + 1).padStart(3, '0')}/${yr}`;
}

// ── Dispatched qty helpers ──
// This shadows dispatch.js's own getDispatchedQty (this file loads after
// it), so it counts both entry points for "boxes out the door": Delivery
// Challans (this file) and the older Record Dispatch flow (dispatch.js's
// _dispatchCache, synced from the Dispatch sheet) — otherwise a dispatch
// logged via Record Dispatch would be invisible to every page that calls
// getDispatchedQty(), including the auto-complete check.
function getDispatchedQty(orderId) {
  const fromChallans = challanList.filter(c => c.orderId === orderId).reduce((s, c) => s + (c.qty || 0), 0);
  const fromRecordDispatch = (typeof _dispatchCache !== 'undefined' && _dispatchCache[orderId]) || 0;
  return fromChallans + fromRecordDispatch;
}

function getChallansByOrder(orderId) {
  return challanList.filter(c => c.orderId === orderId);
}

// ── Open challan modal ──
function openChallanModal(orderId) {
  const o = orders.find(x => x.id === orderId);
  if (!o) { alert('Order not found.'); return; }
  _challanOrderId = orderId;

  const dispatched  = getDispatchedQty(orderId);
  const remaining   = Math.max(0, (o.qty || 0) - dispatched);

  document.getElementById('ch-order-info').innerHTML =
    `<strong>${o.id}</strong> · ${o.customer} · ${o.product || o.size || '—'} · Total: ${(o.qty || 0).toLocaleString('en-IN')} pcs`;

  const dispInfo = document.getElementById('ch-dispatched-info');
  if (dispatched > 0) {
    dispInfo.style.display = 'block';
    dispInfo.innerHTML = `Already dispatched: <strong>${dispatched.toLocaleString('en-IN')} pcs</strong> across ${getChallansByOrder(orderId).length} challan(s) · Remaining: <strong style="color:var(--danger)">${remaining.toLocaleString('en-IN')} pcs</strong>`;
  } else {
    dispInfo.style.display = 'none';
  }

  document.getElementById('ch-qty').value  = remaining || (o.qty || '');
  document.getElementById('ch-date').value = todayStr;
  document.getElementById('ch-note').value = '';

  document.getElementById('challan-modal-overlay').style.display = 'flex';
  document.getElementById('ch-qty').focus();
}

function closeChallanModal() {
  document.getElementById('challan-modal-overlay').style.display = 'none';
  _challanOrderId = null;
}

// ── Save record + print ──
function saveAndPrintChallan() {
  if (!_challanOrderId) return;
  const o = orders.find(x => x.id === _challanOrderId);
  if (!o) return;

  const qty  = parseInt(document.getElementById('ch-qty').value) || 0;
  const date = document.getElementById('ch-date').value;
  const note = document.getElementById('ch-note').value.trim();

  if (!qty || qty <= 0) { alert('Please enter a valid quantity.'); return; }
  if (!date) { alert('Date is required.'); return; }

  const record = {
    dcNum:      _nextDcNum(),
    orderId:    _challanOrderId,
    customer:   o.customer,
    product:    o.product || o.size || '',
    size:       o.size || '',
    ply:        o.ply  || '',
    colour:     o.colour || '',
    weight:     o.weight || '',
    rate:       o.rate   || 0,
    qty,
    date,
    note,
    createdAt:  new Date().toISOString(),
  };

  challanList.push(record);
  saveChallans();
  if (typeof mirrorToSheet === 'function') {
    mirrorToSheet('saveChallan', {
      id: record.dcNum, date: record.date, orderId: record.orderId,
      customer: record.customer, product: record.product,
      qty: record.qty, vehicle: '', notes: record.note,
    });
  }
  if (typeof logOrderEvent === 'function') logOrderEvent(record.orderId, 'Dispatched', `${record.dcNum} · ${record.qty} pcs`);
  if (typeof notifyDispatchWA === 'function') notifyDispatchWA(record);
  if (typeof autoInvoiceChallans === 'function') autoInvoiceChallans(); // bill this challan if it has a rate on file

  const orderId = _challanOrderId;
  closeChallanModal();
  // If this challan covers every box still pending, close the order out —
  // checkOrderFullyDispatched() (orders.js) also re-renders the orders list.
  if (typeof checkOrderFullyDispatched !== 'function' || !checkOrderFullyDispatched(orderId)) {
    renderOrders();             // refresh progress bars when not yet complete
  }
  printDeliveryChallan(record);
}

// ── Print challan ──
function printDeliveryChallan(record) {
  const o      = orders.find(x => x.id === record.orderId) || {};
  const client = (typeof CLIENTS !== 'undefined' ? CLIENTS : []).find(c => c.name?.toLowerCase() === record.customer?.toLowerCase()) || {};
  const dateStr  = record.date ? new Date(record.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const delivStr = o.date ? new Date(o.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const amount   = record.qty * (record.rate || 0);
  const fmt2     = n => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const amtWords = (record.rate && typeof amountToWords === 'function') ? amountToWords(Math.round(amount)) : '';
  const productDesc = [record.product || 'Corrugated Box', record.size, record.weight ? record.weight + ' gm/pc' : ''].filter(Boolean).join(' · ');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Delivery Challan — ${record.dcNum}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; background: #fff; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 16mm 14mm; }
  @media print {
    @page { size: A4 portrait; margin: 0; }
    body { margin: 0; }
    .page { padding: 12mm 10mm; }
    .no-print { display: none !important; }
  }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10px; border-bottom: 3px solid #042C53; margin-bottom: 12px; }
  .company-name { font-size: 20px; font-weight: 800; color: #042C53; letter-spacing: -0.5px; }
  .company-sub { font-size: 10px; color: #555; margin-top: 2px; line-height: 1.5; }
  .doc-title { text-align: right; }
  .doc-title h1 { font-size: 16px; font-weight: 800; color: #042C53; letter-spacing: 1px; text-transform: uppercase; }
  .doc-meta { font-size: 10px; color: #333; margin-top: 4px; line-height: 1.9; }
  .doc-meta strong { font-weight: 700; }
  .section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
  .section-box { border: 1px solid #ccc; border-radius: 4px; padding: 10px 12px; }
  .section-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #888; margin-bottom: 6px; }
  .party-name { font-size: 14px; font-weight: 700; color: #042C53; margin-bottom: 3px; }
  .party-detail { font-size: 11px; color: #333; line-height: 1.7; }
  .blank-field { border-bottom: 1px solid #999; min-height: 16px; margin-bottom: 6px; font-size: 11px; color: #333; line-height: 1.6; }
  .blank-label { font-size: 10px; color: #777; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 11px; }
  thead th { background: #042C53; color: #fff; padding: 7px 8px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; }
  thead th.r { text-align: right; }
  tbody td { padding: 8px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  tbody td.r { text-align: right; }
  .total-row td { border-top: 2px solid #042C53; border-bottom: none; font-weight: 700; font-size: 12px; padding: 8px 8px; }
  .total-row td.r { text-align: right; color: #042C53; }
  .amount-words { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px 12px; margin-bottom: 14px; font-size: 11px; }
  .amount-words span { font-weight: 700; color: #042C53; }
  .remarks-box { border: 1px solid #ccc; border-radius: 4px; padding: 8px 12px; margin-bottom: 20px; min-height: 40px; font-size: 11px; color: #444; }
  .remarks-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #888; margin-bottom: 4px; }
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 30px; }
  .sig-block { text-align: center; }
  .sig-line { border-top: 1px solid #333; padding-top: 6px; margin-top: 40px; font-size: 10px; color: #555; font-weight: 600; }
  .print-bar { text-align: center; padding: 16px; background: #f1f5f9; }
  .print-btn { background: #042C53; color: #fff; border: none; padding: 10px 28px; font-size: 13px; font-weight: 700; border-radius: 6px; cursor: pointer; margin-right: 10px; }
</style>
</head>
<body>
<div class="no-print print-bar">
  <button class="print-btn" onclick="window.print()">🖨️ Print Challan</button>
  <button onclick="window.close()" style="background:#6b7280;color:#fff;border:none;padding:10px 20px;font-size:13px;font-weight:700;border-radius:6px;cursor:pointer">✕ Close</button>
</div>
<div class="page">
  <div class="header">
    <div>
      <div class="company-name">Maniram Industries</div>
      <div class="company-sub">Corrugated Box Manufacturers<br>Jhansi, Uttar Pradesh</div>
    </div>
    <div class="doc-title">
      <h1>Delivery Challan</h1>
      <div class="doc-meta">
        <strong>DC No.:</strong> ${record.dcNum}<br>
        <strong>Date:</strong> ${dateStr}<br>
        <strong>Order ID:</strong> ${record.orderId}<br>
        <strong>Delivery Date:</strong> ${delivStr}
      </div>
    </div>
  </div>

  <div class="section-grid">
    <div class="section-box">
      <div class="section-label">Consignee (Bill To / Ship To)</div>
      <div class="party-name">${record.customer}</div>
      <div class="party-detail">
        ${client.city    ? client.city + '<br>'     : ''}
        ${client.phone   ? '📞 ' + client.phone     : ''}
        ${client.contact ? '<br>' + client.contact  : ''}
      </div>
    </div>
    <div class="section-box">
      <div class="section-label">Transport Details</div>
      <div class="blank-label">Vehicle No.</div>
      <div class="blank-field">&nbsp;</div>
      <div class="blank-label">Driver Name</div>
      <div class="blank-field">&nbsp;</div>
      <div class="blank-label">Transport Company</div>
      <div class="blank-field">&nbsp;</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:30px">Sr.</th>
        <th>Product Description</th>
        <th style="width:80px">Size</th>
        <th style="width:45px">Ply</th>
        <th style="width:55px">Colour</th>
        <th class="r" style="width:75px">Qty (pcs)</th>
        ${record.rate ? `<th class="r" style="width:65px">Rate (₹)</th><th class="r" style="width:80px">Amount (₹)</th>` : ''}
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td>${productDesc}</td>
        <td>${record.size || '—'}</td>
        <td>${record.ply ? record.ply + ' Ply' : '—'}</td>
        <td>${record.colour || '—'}</td>
        <td class="r"><strong>${record.qty.toLocaleString('en-IN')}</strong></td>
        ${record.rate ? `<td class="r">₹${record.rate.toFixed(2)}</td><td class="r">₹${fmt2(amount)}</td>` : ''}
      </tr>
    </tbody>
    ${record.rate ? `<tfoot><tr class="total-row"><td colspan="5"></td><td class="r">${record.qty.toLocaleString('en-IN')} pcs</td><td class="r">Total</td><td class="r">₹${fmt2(amount)}</td></tr></tfoot>` : ''}
  </table>

  ${record.rate && amtWords ? `<div class="amount-words">Amount in Words: <span>${amtWords}</span></div>` : ''}

  <div class="remarks-box">
    <div class="remarks-label">Remarks</div>
    ${record.note || '&nbsp;'}
  </div>

  <div class="sig-grid">
    <div class="sig-block"><div class="sig-line">Receiver's Signature</div><div style="font-size:9px;color:#777;margin-top:4px">Name &amp; Stamp</div></div>
    <div class="sig-block"><div class="sig-line">Driver's Signature</div></div>
    <div class="sig-block"><div class="sig-line">For Maniram Industries</div><div style="font-size:9px;color:#777;margin-top:4px">Authorised Signatory</div></div>
  </div>
</div>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=900,height=1100');
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Delete challan ──
// An invoice built from this specific challan (item.challanDc === dcNum)
// must never be left behind, still showing an amount for a dispatch
// record that no longer exists — deleted right along with it (or, on a
// multi-item invoice, just that one line removed and totals recomputed).
function deleteChallan(idx) {
  const dc = challanList[idx];
  const dcNum = dc?.dcNum;
  const linkedInv = typeof invoiceList !== 'undefined'
    ? invoiceList.find(iv => (iv.items || []).some(it => it.challanDc === dcNum))
    : null;

  const msg = linkedInv
    ? `Delete challan ${dcNum}? Invoice ${linkedInv.id} was built from it${linkedInv.items.length > 1 ? " — that one line item will be removed and the invoice's total recalculated" : ' and will be deleted too'}. This cannot be undone.`
    : `Delete challan ${dcNum}? This cannot be undone.`;
  if (!confirm(msg)) return;

  challanList.splice(idx, 1);
  saveChallans();
  if (dcNum && typeof mirrorToSheet === 'function') mirrorToSheet('deleteChallan', { id: dcNum });

  if (linkedInv) {
    if (linkedInv.items.length <= 1 && typeof _deleteInvoiceCore === 'function') {
      _deleteInvoiceCore(linkedInv.id);
    } else {
      linkedInv.items = linkedInv.items.filter(it => it.challanDc !== dcNum);
      const subtotal  = linkedInv.items.reduce((s, i) => s + (i.qty || 0) * (i.rate || 0), 0);
      linkedInv.subtotal = subtotal;
      linkedInv.total    = Math.round(subtotal);
      linkedInv.roundOff = linkedInv.total - subtotal;
      if (typeof saveInvoiceList === 'function') saveInvoiceList();
      if (typeof _mirrorInvoice === 'function') _mirrorInvoice(linkedInv);
      if (typeof renderInvoicingPage === 'function') renderInvoicingPage();
    }
  }

  renderChallansTab();
  renderOrders();
}

// ── Re-print an existing challan ──
function reprintChallan(idx) {
  const record = challanList[idx];
  if (!record) return;
  printDeliveryChallan(record);
}

// ── Render Challans Tab ──
// Month filter — same pattern as Invoicing's: defaults to the current month
// (or the most recent month with data, if this one has none) the first time
// this tab renders, then stays wherever the user leaves it.
let _chMonthFilter = null;
function _chMonthKey(dateStr)  { return (dateStr || '').slice(0, 7); } // 'YYYY-MM'
function _chMonthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}
function setChallanMonthFilter(key) {
  _chMonthFilter = key;
  renderChallansTab();
}

function renderChallansTab() {
  const el = document.getElementById('challans-list');
  if (!el) return;

  if (!challanList.length) {
    el.innerHTML = `<div class="empty-state">No delivery challans issued yet.<br>Click 🚚 on any order to create one.</div>`;
    return;
  }

  const fmt0 = n => Math.round(n).toLocaleString('en-IN');

  const allMonths = [...new Set(challanList.map(c => _chMonthKey(c.date)).filter(Boolean))].sort().reverse();
  if (_chMonthFilter === null) {
    const curMonth = todayStr.slice(0, 7);
    _chMonthFilter = allMonths.includes(curMonth) ? curMonth : (allMonths[0] || 'all');
  }
  const filtered = _chMonthFilter === 'all' ? challanList : challanList.filter(c => _chMonthKey(c.date) === _chMonthFilter);

  const totalQty = filtered.reduce((s, c) => s + (c.qty || 0), 0);
  const totalAmt = filtered.reduce((s, c) => s + (c.qty || 0) * (c.rate || 0), 0);

  const monthSelect = `
    <select class="form-select" style="font-size:13px;width:auto;padding:8px 10px" onchange="setChallanMonthFilter(this.value)">
      <option value="all" ${_chMonthFilter === 'all' ? 'selected' : ''}>All Months</option>
      ${allMonths.map(m => `<option value="${m}" ${m === _chMonthFilter ? 'selected' : ''}>${_chMonthLabel(m)}</option>`).join('')}
    </select>`;

  // Sort by the challan's own date (not createdAt, which is when the
  // record was entered/matched — often days after a backfilled or
  // late-logged dispatch) — newest date first, createdAt as tiebreaker
  // within the same day.
  const sorted = filtered.map(c => ({ ...c, _idx: challanList.indexOf(c) }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));

  // Grouped into day blocks (within the selected month) so the date is
  // impossible to misread as jumbled — each day gets its own header with
  // a running total.
  const byDate = {};
  sorted.forEach(c => { const k = c.date || '—'; (byDate[k] || (byDate[k] = [])).push(c); });
  const dateKeys = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  const rowHtml = c => `
        <div class="table-row" style="grid-template-columns:110px 90px 1fr 1fr 90px 80px 100px;align-items:center">
          <div style="font-family:monospace;font-size:11px;font-weight:700;color:var(--navy)">${c.dcNum}</div>
          <div style="font-size:12px;color:var(--muted)">${c.date ? new Date(c.date).toLocaleDateString('en-IN',{day:'numeric',month:'short'}) : '—'}</div>
          <div style="font-size:12px;font-weight:600">${c.customer}</div>
          <div style="font-size:11px;color:var(--muted)">${c.product || c.size || '—'}</div>
          <div style="font-family:monospace;font-size:11px;color:var(--blue)">${c.orderId}</div>
          <div style="text-align:right;font-size:13px;font-weight:700">${(c.qty || 0).toLocaleString('en-IN')}</div>
          <div style="display:flex;gap:6px">
            <button class="btn-sm" style="font-size:11px;padding:3px 8px" onclick="reprintChallan(${c._idx})" title="Re-print">🖨️</button>
            <button class="btn-sm" style="font-size:11px;padding:3px 8px;background:#FEF2F2;color:var(--danger);border-color:var(--danger)" onclick="deleteChallan(${c._idx})" title="Delete">✕</button>
          </div>
        </div>`;

  const dayBlocksHtml = dateKeys.map(dateKey => {
    const dayItems = byDate[dateKey];
    const dayQty   = dayItems.reduce((s, c) => s + (c.qty || 0), 0);
    const dateLabel = dateKey === '—' ? 'No date on file' : new Date(dateKey).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    return `
      <div style="padding:8px 14px;background:var(--hover-bg,#f5f7fa);border-top:1px solid var(--border);font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;display:flex;justify-content:space-between">
        <span>${dateLabel} — ${dayItems.length} DC${dayItems.length === 1 ? '' : 's'}</span>
        <span>${dayQty.toLocaleString('en-IN')} pcs</span>
      </div>
      ${dayItems.map(rowHtml).join('')}`;
  }).join('');

  el.innerHTML = `
    <div style="margin-bottom:12px">${monthSelect}</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
      <div class="stat-card"><div class="stat-value">${filtered.length}</div><div class="stat-label">Challans Issued${_chMonthFilter !== 'all' ? ' — ' + _chMonthLabel(_chMonthFilter) : ''}</div></div>
      <div class="stat-card"><div class="stat-value">${fmt0(totalQty)}</div><div class="stat-label">Total Boxes Dispatched</div></div>
      ${totalAmt > 0 ? `<div class="stat-card"><div class="stat-value">₹${fmt0(totalAmt)}</div><div class="stat-label">Total Value Dispatched</div></div>` : '<div class="stat-card"><div class="stat-value">—</div><div class="stat-label">No rates recorded</div></div>'}
    </div>
    ${!filtered.length ? `<div class="empty-state">No challans in ${_chMonthFilter === 'all' ? 'range' : _chMonthLabel(_chMonthFilter)}.</div>` : `
    <div class="orders-table">
      <div class="table-header" style="grid-template-columns:110px 90px 1fr 1fr 90px 80px 100px">
        <div>DC No.</div><div>Date</div><div>Customer</div><div>Product</div><div>Order ID</div><div style="text-align:right">Qty</div><div>Actions</div>
      </div>
      ${dayBlocksHtml}
    </div>`}`;
}

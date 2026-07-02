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
function getDispatchedQty(orderId) {
  return challanList.filter(c => c.orderId === orderId).reduce((s, c) => s + (c.qty || 0), 0);
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

  const orderId = _challanOrderId;
  closeChallanModal();
  renderOrders();              // refresh progress bars
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
function deleteChallan(idx) {
  if (!confirm(`Delete challan ${challanList[idx]?.dcNum}? This cannot be undone.`)) return;
  challanList.splice(idx, 1);
  saveChallans();
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
function renderChallansTab() {
  const el = document.getElementById('challans-list');
  if (!el) return;

  if (!challanList.length) {
    el.innerHTML = `<div class="empty-state">No delivery challans issued yet.<br>Click 🚚 on any order to create one.</div>`;
    return;
  }

  const fmt0 = n => Math.round(n).toLocaleString('en-IN');

  const totalQty = challanList.reduce((s, c) => s + (c.qty || 0), 0);
  const totalAmt = challanList.reduce((s, c) => s + (c.qty || 0) * (c.rate || 0), 0);

  // Sort newest first
  const sorted = challanList.map((c, i) => ({ ...c, _idx: i })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
      <div class="stat-card"><div class="stat-value">${challanList.length}</div><div class="stat-label">Challans Issued</div></div>
      <div class="stat-card"><div class="stat-value">${fmt0(totalQty)}</div><div class="stat-label">Total Boxes Dispatched</div></div>
      ${totalAmt > 0 ? `<div class="stat-card"><div class="stat-value">₹${fmt0(totalAmt)}</div><div class="stat-label">Total Value Dispatched</div></div>` : '<div class="stat-card"><div class="stat-value">—</div><div class="stat-label">No rates recorded</div></div>'}
    </div>
    <div class="orders-table">
      <div class="table-header" style="grid-template-columns:110px 90px 1fr 1fr 90px 80px 100px">
        <div>DC No.</div><div>Date</div><div>Customer</div><div>Product</div><div>Order ID</div><div style="text-align:right">Qty</div><div>Actions</div>
      </div>
      ${sorted.map(c => `
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
        </div>`).join('')}
    </div>`;
}

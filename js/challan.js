// ══════════════════════════════════════════════════════════════
// CHALLAN.JS — Delivery Challan (Print)
// ══════════════════════════════════════════════════════════════

const LS_CHALLAN_NUMS = 'mi_challan_nums_v1';

function getChallanNumber(orderId) {
  let map = {};
  try { map = JSON.parse(localStorage.getItem(LS_CHALLAN_NUMS) || '{}'); } catch {}
  if (!map[orderId]) {
    const yr = new Date().getFullYear().toString().slice(-2);
    const existing = Object.values(map);
    let max = 0;
    existing.forEach(n => { const m = n?.match(/DC\/\w+\/\d+\/(\d+)/); if (m) max = Math.max(max, parseInt(m[1])); });
    map[orderId] = `DC/${orderId}/${yr}/${String(max + 1).padStart(3, '0')}`;
    localStorage.setItem(LS_CHALLAN_NUMS, JSON.stringify(map));
  }
  return map[orderId];
}

function printDeliveryChallan(orderId) {
  const o = orders.find(x => x.id === orderId);
  if (!o) { alert('Order not found.'); return; }

  const client   = (typeof CLIENTS !== 'undefined' ? CLIENTS : []).find(c => c.name?.toLowerCase() === o.customer?.toLowerCase()) || {};
  const dcNum    = getChallanNumber(orderId);
  const today    = new Date();
  const dateStr  = today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const delivStr = o.date ? new Date(o.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const amount   = (o.qty || 0) * (o.rate || 0);
  const fmt2     = n => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const amtWords = typeof amountToWords === 'function' ? amountToWords(Math.round(amount)) : '';

  const productDesc = [o.product || 'Corrugated Box', o.size, o.weight ? o.weight + ' gm/pc' : ''].filter(Boolean).join(' · ');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Delivery Challan — ${dcNum}</title>
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

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10px; border-bottom: 3px solid #042C53; margin-bottom: 12px; }
  .company-name { font-size: 20px; font-weight: 800; color: #042C53; letter-spacing: -0.5px; }
  .company-sub { font-size: 10px; color: #555; margin-top: 2px; line-height: 1.5; }
  .doc-title { text-align: right; }
  .doc-title h1 { font-size: 16px; font-weight: 800; color: #042C53; letter-spacing: 1px; text-transform: uppercase; }
  .doc-meta { font-size: 10px; color: #333; margin-top: 4px; line-height: 1.8; }
  .doc-meta strong { font-weight: 700; }

  /* Party + Transport */
  .section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
  .section-box { border: 1px solid #ccc; border-radius: 4px; padding: 10px 12px; }
  .section-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #888; margin-bottom: 6px; }
  .party-name { font-size: 14px; font-weight: 700; color: #042C53; margin-bottom: 3px; }
  .party-detail { font-size: 11px; color: #333; line-height: 1.7; }
  .blank-field { border-bottom: 1px solid #999; min-height: 16px; margin-bottom: 6px; font-size: 11px; color: #333; line-height: 1.6; }
  .blank-label { font-size: 10px; color: #777; margin-bottom: 2px; }

  /* Table */
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 11px; }
  thead th { background: #042C53; color: #fff; padding: 7px 8px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; }
  thead th.r { text-align: right; }
  tbody td { padding: 8px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  tbody td.r { text-align: right; }
  .total-row td { border-top: 2px solid #042C53; border-bottom: none; font-weight: 700; font-size: 12px; padding: 8px 8px; }
  .total-row td.r { text-align: right; color: #042C53; }

  /* Amount words */
  .amount-words { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px 12px; margin-bottom: 14px; font-size: 11px; }
  .amount-words span { font-weight: 700; color: #042C53; }

  /* Remarks */
  .remarks-box { border: 1px solid #ccc; border-radius: 4px; padding: 8px 12px; margin-bottom: 20px; min-height: 40px; }
  .remarks-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #888; margin-bottom: 4px; }

  /* Signatures */
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 30px; }
  .sig-block { text-align: center; }
  .sig-line { border-top: 1px solid #333; padding-top: 6px; margin-top: 40px; font-size: 10px; color: #555; font-weight: 600; }

  /* Print button */
  .print-bar { text-align: center; padding: 16px; background: #f1f5f9; margin-bottom: 0; }
  .print-btn { background: #042C53; color: #fff; border: none; padding: 10px 28px; font-size: 13px; font-weight: 700; border-radius: 6px; cursor: pointer; margin-right: 10px; }
  .print-btn:hover { background: #185FA5; }
</style>
</head>
<body>
<div class="no-print print-bar">
  <button class="print-btn" onclick="window.print()">🖨️ Print Challan</button>
  <button onclick="window.close()" style="background:#6b7280;color:#fff;border:none;padding:10px 20px;font-size:13px;font-weight:700;border-radius:6px;cursor:pointer">✕ Close</button>
</div>

<div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <div class="company-name">Maniram Industries</div>
      <div class="company-sub">
        Corrugated Box Manufacturers<br>
        Jhansi, Uttar Pradesh
      </div>
    </div>
    <div class="doc-title">
      <h1>Delivery Challan</h1>
      <div class="doc-meta">
        <strong>DC No.:</strong> ${dcNum}<br>
        <strong>Date:</strong> ${dateStr}<br>
        <strong>Order ID:</strong> ${o.id}<br>
        <strong>Delivery Date:</strong> ${delivStr}
      </div>
    </div>
  </div>

  <!-- Party + Transport -->
  <div class="section-grid">
    <div class="section-box">
      <div class="section-label">Consignee (Bill To / Ship To)</div>
      <div class="party-name">${o.customer}</div>
      <div class="party-detail">
        ${client.city    ? client.city + '<br>'  : ''}
        ${client.phone   ? '📞 ' + client.phone  : ''}
        ${client.contact ? '<br>' + client.contact : ''}
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

  <!-- Items Table -->
  <table>
    <thead>
      <tr>
        <th style="width:30px">Sr.</th>
        <th>Product Description</th>
        <th style="width:90px">Size</th>
        <th style="width:50px">Ply</th>
        <th style="width:60px">Colour</th>
        <th class="r" style="width:70px">Qty (pcs)</th>
        ${o.rate ? `<th class="r" style="width:70px">Rate (₹)</th><th class="r" style="width:80px">Amount (₹)</th>` : ''}
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td>${productDesc}</td>
        <td>${o.size || '—'}</td>
        <td>${o.ply ? o.ply + ' Ply' : '—'}</td>
        <td>${o.colour || '—'}</td>
        <td class="r"><strong>${(o.qty || 0).toLocaleString('en-IN')}</strong></td>
        ${o.rate ? `<td class="r">₹${(o.rate).toFixed(2)}</td><td class="r">₹${fmt2(amount)}</td>` : ''}
      </tr>
    </tbody>
    ${o.rate ? `<tfoot><tr class="total-row"><td colspan="5"></td><td class="r">${(o.qty || 0).toLocaleString('en-IN')} pcs</td><td class="r">Total</td><td class="r">₹${fmt2(amount)}</td></tr></tfoot>` : ''}
  </table>

  ${o.rate && amtWords ? `
  <div class="amount-words">
    Amount in Words: <span>${amtWords}</span>
  </div>` : ''}

  <!-- Remarks -->
  <div class="remarks-box">
    <div class="remarks-label">Remarks</div>
    &nbsp;
  </div>

  <!-- Signatures -->
  <div class="sig-grid">
    <div class="sig-block">
      <div class="sig-line">Receiver's Signature</div>
      <div style="font-size:9px;color:#777;margin-top:4px">Name &amp; Stamp</div>
    </div>
    <div class="sig-block">
      <div class="sig-line">Driver's Signature</div>
    </div>
    <div class="sig-block">
      <div class="sig-line">For Maniram Industries</div>
      <div style="font-size:9px;color:#777;margin-top:4px">Authorised Signatory</div>
    </div>
  </div>

</div>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=900,height=1100');
  if (w) { w.document.write(html); w.document.close(); }
}

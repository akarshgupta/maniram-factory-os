// ══════════════════════════════════════════════════════════════
// JOB-CARD.JS — Production Job Card + Flexo Print Spec
// ══════════════════════════════════════════════════════════════

const LS_PRINT_SPECS = 'mi_print_specs_v1';
let _printSpecOrderId = null;

function _fmtN(n) { return n % 1 === 0 ? String(n) : n.toFixed(1); }

// ── Storage ──
function _loadPrintSpecs() { try { return JSON.parse(localStorage.getItem(LS_PRINT_SPECS) || '{}'); } catch { return {}; } }
function _savePrintSpecs(map) { localStorage.setItem(LS_PRINT_SPECS, JSON.stringify(map)); }

function _specKey(clientName, productName) {
  return (clientName || '').trim().toLowerCase() + '||' + (productName || '').trim().toLowerCase();
}

function getPrintSpec(clientName, productName) {
  const map = _loadPrintSpecs();
  return map[_specKey(clientName, productName)] || null;
}

// ── Quick print: plain (non-printed) products never need a spec. Printed
// products print directly whenever there's already print info to show —
// a saved spec, or the colour/design already recorded on the product itself
// (entered once, on the Clients page) — since asking again would just repeat
// what's already on file. The spec modal only appears when there's truly
// nothing on record yet; "✏️ Edit Print Spec" is still there to add or
// change block ref / colour breakdown / notes whenever wanted. ──
function quickPrintJobCard(orderId) {
  const o = orders.find(x => x.id === orderId);
  if (!o) return;
  const client   = (typeof CLIENTS !== 'undefined' ? CLIENTS : []).find(c => c.name === o.customer);
  const product  = client ? (client.products || []).find(p => p.name === o.product) : null;
  const needsPrint = product ? !!product.hasPrint : false;
  const spec = getPrintSpec(o.customer, o.product);
  const hasPrintInfoOnFile = !!spec || !!(product && (product.printColour || product.printDesign)) || !!o.colour;
  if (!needsPrint || hasPrintInfoOnFile) {
    printJobCard(orderId);
  } else {
    openPrintSpecModal(orderId);
  }
}

// ── Open print-spec modal ──
function openPrintSpecModal(orderId) {
  const o = orders.find(x => x.id === orderId);
  if (!o) { alert('Order not found.'); return; }
  _printSpecOrderId = orderId;

  // Pre-fill from saved spec, with fallback to product-level print data
  const saved   = getPrintSpec(o.customer, o.product) || {};
  const prodData = (typeof CLIENTS !== 'undefined')
    ? CLIENTS.find(c => c.name === o.customer)?.products?.find(p => p.name === o.product)
    : null;

  document.getElementById('ps-order-info').textContent = `${o.id} · ${o.customer} · ${o.product || o.size || '—'}`;
  document.getElementById('ps-colours').value    = saved.colours   || 1;
  document.getElementById('ps-block-ref').value  = saved.blockRef  || '';
  document.getElementById('ps-print-desc').value = saved.printDesc || prodData?.printDesign || '';
  document.getElementById('ps-notes').value      = saved.notes     || '';

  const defaultRows = (prodData?.printColour && !saved.colourDetails?.length)
    ? [{ name: prodData.printColour, desc: prodData.printDesign || '' }]
    : (saved.colourDetails || []);
  _renderColourRows(parseInt(saved.colours || 1), defaultRows);
  document.getElementById('print-spec-overlay').style.display = 'flex';
  document.getElementById('ps-colours').focus();
}

function closePrintSpecModal() {
  document.getElementById('print-spec-overlay').style.display = 'none';
  _printSpecOrderId = null;
}

function _renderColourRows(n, existing) {
  const tbody = document.getElementById('ps-colour-rows');
  if (!tbody) return;
  tbody.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const d = existing[i] || {};
    tbody.innerHTML += `
      <tr>
        <td style="padding:6px 8px;font-weight:600;color:var(--navy);width:60px">C${i + 1}</td>
        <td style="padding:6px 4px"><input class="form-input" style="width:100%;font-size:12px" placeholder="e.g. Red, Blue, Black…" id="ps-c-name-${i}" value="${d.name || ''}"></td>
        <td style="padding:6px 4px"><input class="form-input" style="width:100%;font-size:12px" placeholder="e.g. Company logo top-left, barcode right…" id="ps-c-desc-${i}" value="${d.desc || ''}"></td>
      </tr>`;
  }
}

function onPsColoursChange() {
  const n = parseInt(document.getElementById('ps-colours').value) || 1;
  _renderColourRows(Math.min(Math.max(n, 1), 8), []);
}

function savePrintSpec() {
  if (!_printSpecOrderId) return;
  const o = orders.find(x => x.id === _printSpecOrderId);
  if (!o) return;

  const n = parseInt(document.getElementById('ps-colours').value) || 1;
  const colourDetails = [];
  for (let i = 0; i < n; i++) {
    colourDetails.push({
      name: (document.getElementById(`ps-c-name-${i}`)?.value || '').trim(),
      desc: (document.getElementById(`ps-c-desc-${i}`)?.value || '').trim(),
    });
  }

  const spec = {
    colours:      n,
    blockRef:     (document.getElementById('ps-block-ref').value || '').trim(),
    printDesc:    (document.getElementById('ps-print-desc').value || '').trim(),
    notes:        (document.getElementById('ps-notes').value || '').trim(),
    colourDetails,
    updatedAt:    new Date().toISOString(),
  };

  const map = _loadPrintSpecs();
  map[_specKey(o.customer, o.product)] = spec;
  _savePrintSpecs(map);

  const targetId = _printSpecOrderId;
  closePrintSpecModal();
  printJobCard(targetId);
}

// ── Print Job Card ──
function printJobCard(orderId) {
  const o = orders.find(x => x.id === orderId);
  if (!o) { alert('Order not found.'); return; }

  const spec   = getPrintSpec(o.customer, o.product) || {};
  const today  = new Date();
  const printed = today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const delivStr = o.date ? new Date(o.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const orderStr = o.orderDate ? new Date(o.orderDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  // Box schematic: parse L×W×H from size field
  const dims = _parseDims(o.size);

  // Cutting (sheet) size — notation is ALWAYS reel-size (width) first, then
  // length (skills/rate-calculator.md: "34.5 × 93, never 93×34.5"). The
  // actual reel size on the order IS the real sheet width once one's on
  // record ("Sheet Width = Reel Size the box will be made from") — the
  // W+H+0.5 formula is only the estimate used before that's known, and the
  // doc calls for a flag when the two disagree by a meaningful amount.
  const sheetLen       = dims ? (dims.l + dims.w) * 2 + 2 : null;
  const calcSheetWid   = dims ? dims.w + dims.h + 0.5 : null;
  const actualReelSize = parseFloat(o.reelSize) || null;
  const sheetWid        = actualReelSize || calcSheetWid;
  const reelMismatch    = !!(actualReelSize && calcSheetWid && Math.abs(actualReelSize - calcSheetWid) > 0.5);
  const cutSizeStr = dims
    ? `${_fmtN(sheetWid)}" × ${_fmtN(sheetLen)}"`
    : '______ × ______';

  const schematic = dims ? _buildSchematic(dims, spec, sheetWid) : '';

  // Product master lookup — GSM/BF per layer + print flag
  const client  = (typeof CLIENTS !== 'undefined' ? CLIENTS : []).find(c => c.name === o.customer);
  const product = client ? (client.products || []).find(p => p.name === o.product) : null;
  const isPrint = product ? !!product.hasPrint : (!!o.colour && o.colour.trim().toLowerCase() !== 'none');
  const layers  = (typeof PLY_LAYERS !== 'undefined' ? PLY_LAYERS[parseInt(o.ply) || 3] : null) || [];

  // Print reference photo (stored in localStorage by product modal)
  const printPhotoKey   = `mi_print_photo_${o.customer}__${o.product}`;
  const printPhotoData  = localStorage.getItem(printPhotoKey);

  // Colour spec rows — use the saved spec if there is one, otherwise fall back
  // to whatever's already recorded on the product itself (Colour + Text on Box)
  const colourDetails = (spec.colourDetails && spec.colourDetails.length)
    ? spec.colourDetails
    : (product?.printColour ? [{ name: product.printColour, desc: product.printDesign || '' }] : []);
  const colourRows = colourDetails.map((c, i) => `
    <tr>
      <td style="padding:5px 8px;font-weight:700;color:#042C53;width:50px">C${i + 1}</td>
      <td style="padding:5px 8px">${c.name || '—'}</td>
      <td style="padding:5px 8px;color:#444">${c.desc || '—'}</td>
    </tr>`).join('');
  const effColours   = spec.colours || (colourDetails.length || 0);
  const effBlockRef  = spec.blockRef  || '';
  const effPrintDesc = spec.printDesc || product?.printDesign || '';

  const gsmBfRows = layers.length ? layers.map((layer, i) => {
    const gsm = product && product.gsm ? (product.gsm[i] || '') : '';
    const bf  = product && product.bf  ? (product.bf[i]  || '') : '';
    return `<tr>
      <td style="padding:5px 8px;font-weight:600">${layer.label}</td>
      <td style="padding:5px 8px;text-align:center">${gsm || '______'}</td>
      <td style="padding:5px 8px;text-align:center">${bf || '______'}</td>
    </tr>`;
  }).join('') : '';

  // ── Stage sign-off — fixed shop-floor sequence, each with its required signers ──
  const stages = [
    { name: 'Paper Cutting Size Check', icon: '📏', detail: 'Cutting size: ' + cutSizeStr, signers: ['Supervisor'] },
    { name: 'Corrugation — Ply Size Check', icon: '🌀', detail: (o.ply ? o.ply + ' Ply' : '______') + ' · Reel: ' + (o.reelSize ? o.reelSize + '"' : '______'), signers: ['Technician', 'Supervisor'] },
    { name: 'Pasting — ' + (o.ply ? o.ply + ' Ply' : '___ Ply') + ' Check', icon: '🩹', detail: 'Layer count and alignment', signers: ['Technician'] },
    { name: 'Print Check', icon: '🖨️', detail: isPrint ? ('Colour: ' + (product?.printColour || o.colour || '______')) : 'PLAIN — NO PRINT', signers: ['Supervisor', 'Technician'] },
    { name: 'Rotary — Size Check', icon: '🔄', detail: 'Box size: ' + (o.size || '______'), signers: ['Supervisor', 'Technician'] },
    { name: 'RS4 / Slotter — Size Check', icon: '⚙️', detail: 'Score / slot positions', signers: ['Supervisor', 'Technician'] },
    { name: 'Stitching Ready — Bundle Count', icon: '📦', detail: 'Boxes/bundle: ______ · Bundles: ______', signers: ['Supervisor'] },
  ];

  const sigCell = (required) => required
    ? `<div style="font-size:10.5px;color:#888;margin-bottom:18px">Sign:</div><div style="border-bottom:1px solid #ccc;min-height:36px"></div>`
    : `<div style="font-size:10.5px;color:#ccc;text-align:center;padding-top:16px">N/A</div>`;

  const stageRows = stages.map((s, i) => `
    <tr>
      <td style="padding:14px 12px;width:38px;vertical-align:top;text-align:center;font-weight:800;color:#888;border-right:1px solid #e5e7eb">${i + 1}</td>
      <td style="padding:14px 12px;width:160px;vertical-align:top;border-right:1px solid #e5e7eb">
        <div style="font-weight:800;font-size:13px;color:#042C53">${s.icon} ${s.name}</div>
      </td>
      <td style="padding:14px 12px;vertical-align:top;border-right:1px solid #e5e7eb;font-size:11.5px;color:#444">${s.detail}</td>
      <td style="padding:14px 12px;vertical-align:top;width:120px;border-right:1px solid #e5e7eb">${sigCell(s.signers.includes('Supervisor'))}</td>
      <td style="padding:14px 12px;vertical-align:top;width:120px">${sigCell(s.signers.includes('Technician'))}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Job Card — ${o.id}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; background: #fff; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 12mm 10mm; }
  @media print {
    @page { size: A4 portrait; margin: 0; }
    body { margin: 0; }
    .page { padding: 8mm 8mm; }
    .no-print { display: none !important; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
  }

  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 8px; border-bottom: 3px solid #042C53; margin-bottom: 10px; }
  .company-name { font-size: 18px; font-weight: 800; color: #042C53; }
  .company-sub { font-size: 9px; color: #555; margin-top: 2px; }
  .doc-title h1 { font-size: 15px; font-weight: 800; color: #042C53; text-transform: uppercase; letter-spacing: 1px; text-align: right; }
  .doc-title .jc-num { font-size: 11px; color: #444; text-align: right; margin-top: 3px; }

  .order-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 10px; }
  .order-cell { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 3px; padding: 5px 8px; }
  .order-cell-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 2px; }
  .order-cell-val { font-size: 12px; font-weight: 700; color: #042C53; }

  .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #888; background: #f1f5f9; padding: 4px 8px; margin-bottom: 0; border: 1px solid #e2e8f0; border-bottom: none; }
  .bordered { border: 1px solid #e2e8f0; border-radius: 0 0 4px 4px; margin-bottom: 10px; }

  .spec-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
  .spec-half { padding: 8px 10px; }
  .spec-half + .spec-half { border-left: 1px solid #e2e8f0; }
  .spec-row { display: flex; gap: 8px; margin-bottom: 5px; font-size: 11px; }
  .spec-label { color: #666; min-width: 80px; }
  .spec-val { font-weight: 700; color: #042C53; }

  .schematic-wrap { padding: 10px; display: flex; align-items: center; justify-content: center; }
  .box-face { position: relative; border: 2px solid #042C53; background: #fff; display: inline-block; }
  .print-zone { position: absolute; border: 2px dashed #E74C3C; background: rgba(231,76,60,0.05); }
  .print-label { position: absolute; font-size: 9px; color: #E74C3C; font-weight: 700; text-align: center; width: 100%; bottom: -14px; left: 0; }

  table.stages { width: 100%; border-collapse: collapse; }
  table.stages td { border: 1px solid #e5e7eb; vertical-align: top; }
  table.stages tr:last-child td { border-bottom: 2px solid #042C53; }

  .colours-table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .colours-table th { background: #042C53; color: #fff; padding: 5px 8px; text-align: left; font-size: 10px; text-transform: uppercase; }
  .colours-table td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }

  .sig-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 20px; }
  .sig-block { text-align: center; }
  .sig-line { border-top: 1px solid #333; padding-top: 5px; margin-top: 30px; font-size: 10px; color: #555; font-weight: 600; }

  .print-bar { text-align: center; padding: 12px; background: #f1f5f9; }
  .print-btn { background: #042C53; color: #fff; border: none; padding: 9px 24px; font-size: 13px; font-weight: 700; border-radius: 6px; cursor: pointer; margin-right: 8px; }
</style>
</head>
<body>
<div class="no-print print-bar">
  <button class="print-btn" onclick="window.print()">🖨️ Print Job Card</button>
  <button onclick="window.close()" style="background:#6b7280;color:#fff;border:none;padding:9px 18px;font-size:13px;font-weight:700;border-radius:6px;cursor:pointer">✕ Close</button>
</div>

<div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <div class="company-name">Maniram Industries</div>
      <div class="company-sub">Corrugated Box Manufacturers · Jhansi, U.P.</div>
    </div>
    <div class="doc-title">
      <h1>Production Job Card</h1>
      <div class="jc-num">JC/${o.id} · Printed: ${printed}</div>
    </div>
  </div>

  <!-- Order details grid -->
  <div class="order-grid">
    <div class="order-cell"><div class="order-cell-label">Order ID</div><div class="order-cell-val">${o.id}</div></div>
    <div class="order-cell"><div class="order-cell-label">Party (Customer)</div><div class="order-cell-val">${o.customer}</div></div>
    <div class="order-cell"><div class="order-cell-label">Product</div><div class="order-cell-val">${o.product || '—'}</div></div>
    <div class="order-cell"><div class="order-cell-label">Qty</div><div class="order-cell-val">${(o.qty || 0).toLocaleString('en-IN')} pcs</div></div>
    <div class="order-cell"><div class="order-cell-label">Box Size</div><div class="order-cell-val">${o.size || '—'}</div></div>
    <div class="order-cell"><div class="order-cell-label">Cutting Size</div><div class="order-cell-val">${cutSizeStr}${reelMismatch ? ` <span style="color:#C0392B;font-size:10px;font-weight:700" title="Reel size on the order (${_fmtN(actualReelSize)}&quot;) differs from the calculated width (${_fmtN(calcSheetWid)}&quot;)">⚠ check reel</span>` : ''}</div></div>
    <div class="order-cell"><div class="order-cell-label">Ply</div><div class="order-cell-val">${o.ply ? o.ply + ' Ply' : '—'}</div></div>
    <div class="order-cell"><div class="order-cell-label">Print?</div><div class="order-cell-val" style="color:${isPrint ? '#C0392B' : '#0E9F6E'}">${isPrint ? '🖨️ PRINT' : '⬜ PLAIN'}</div></div>
    <div class="order-cell"><div class="order-cell-label">Print Colour</div><div class="order-cell-val">${isPrint ? (product?.printColour || o.colour || '—') : '—'}</div></div>
    <div class="order-cell"><div class="order-cell-label">Weight</div><div class="order-cell-val">${o.weight ? o.weight + ' gm' : '—'}</div></div>
    <div class="order-cell"><div class="order-cell-label">Reel Size</div><div class="order-cell-val">${o.reelSize ? o.reelSize + '"' : '—'}</div></div>
    <div class="order-cell"><div class="order-cell-label">Order Date</div><div class="order-cell-val">${orderStr}</div></div>
    <div class="order-cell"><div class="order-cell-label">Delivery Date</div><div class="order-cell-val" style="color:#C0392B">${delivStr}</div></div>
    <div class="order-cell"><div class="order-cell-label">Status</div><div class="order-cell-val">${o.status || '—'}</div></div>
  </div>

  <!-- Paper Layer Specification: GSM + BF per layer, always shown -->
  <div class="section-title">📄 Paper Specification — GSM &amp; BF per Layer (${o.ply ? o.ply + ' Ply' : '—'})</div>
  <div class="bordered" style="padding:8px 10px">
    ${gsmBfRows ? `
    <table class="colours-table">
      <thead><tr><th>Layer</th><th style="width:90px;text-align:center">GSM</th><th style="width:90px;text-align:center">BF</th></tr></thead>
      <tbody>${gsmBfRows}</tbody>
    </table>` : `<span style="font-size:11px;color:#888">No layer GSM/BF on file for this product — set it on the Clients page.</span>`}
  </div>

  <!-- Box Schematic — flat-blank cutting diagram, shown for every order regardless of print status -->
  <div class="section-title">📐 Box Schematic — Flat Blank</div>
  <div class="bordered schematic-wrap" style="flex-direction:column;gap:10px;align-items:center;padding:10px">
    ${schematic || '<span style="font-size:11px;color:#888">No box dimensions detected.</span>'}
  </div>

  <!-- Print Specification — omitted entirely for plain (non-printed) boxes -->
  ${isPrint ? `
  <div class="section-title">🖨️ Flexographic Print Specification</div>
  <div class="bordered">
    <div class="spec-grid">
      <div class="spec-half">
        <div class="spec-row"><span class="spec-label">No. of Colours:</span><span class="spec-val">${effColours || '—'}</span></div>
        <div class="spec-row"><span class="spec-label">Block Ref:</span><span class="spec-val">${effBlockRef || '—'}</span></div>
        <div class="spec-row"><span class="spec-label">Print Description:</span><span class="spec-val">${effPrintDesc || '—'}</span></div>
        ${spec.notes ? `<div class="spec-row"><span class="spec-label">Notes:</span><span class="spec-val">${spec.notes}</span></div>` : ''}
      </div>
      <div class="spec-half" style="display:flex;flex-direction:column;align-items:center;justify-content:center">
        ${printPhotoData ? `
        <div style="text-align:center">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#888;margin-bottom:4px">Print Reference Photo</div>
          <div style="width:200px;height:96px;margin:0 auto;display:flex;align-items:center;justify-content:center;border:1px solid #e5e7eb;border-radius:4px;overflow:hidden;background:#fafafa">
            <img id="jc-ref-photo" src="${printPhotoData}" style="border-radius:2px">
          </div>
        </div>` : `<span style="font-size:11px;color:#888">No reference photo on file.</span>`}
      </div>
    </div>

    ${colourRows ? `
    <div style="border-top:1px solid #e2e8f0;padding:8px 10px">
      <table class="colours-table">
        <thead><tr><th style="width:50px">Colour</th><th style="width:120px">Ink Name</th><th>What is Printed</th></tr></thead>
        <tbody>${colourRows}</tbody>
      </table>
    </div>` : ''}
  </div>
  ` : ''}

  <!-- Stage sign-off table -->
  <div class="section-title">📋 Process Sign-Off</div>
  <div class="bordered" style="padding:0">
    <table class="stages">
      <thead>
        <tr style="background:#f8fafc">
          <td style="padding:6px 8px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#666;border:1px solid #e2e8f0;width:38px">#</td>
          <td style="padding:6px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#666;border:1px solid #e2e8f0;width:150px">Stage</td>
          <td style="padding:6px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#666;border:1px solid #e2e8f0">Check</td>
          <td style="padding:6px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#666;border:1px solid #e2e8f0;width:110px">Supervisor</td>
          <td style="padding:6px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#666;border:1px solid #e2e8f0;width:110px">Technician</td>
        </tr>
      </thead>
      <tbody>${stageRows}</tbody>
    </table>
  </div>

</div>
<script>
(function(){
  var img = document.getElementById('jc-ref-photo');
  if (!img) return;
  function fit(){
    var w0 = img.naturalWidth, h0 = img.naturalHeight;
    if (!w0 || !h0) return;
    var boxW = 200, boxH = 96;
    if (h0 > w0) {
      // portrait photo — rotate onto its side so it always reads landscape
      var scale = Math.min(boxW / h0, boxH / w0);
      img.style.width  = (w0 * scale) + 'px';
      img.style.height = (h0 * scale) + 'px';
      img.style.transform = 'rotate(90deg)';
    } else {
      var scale2 = Math.min(boxW / w0, boxH / h0);
      img.style.width  = (w0 * scale2) + 'px';
      img.style.height = (h0 * scale2) + 'px';
    }
  }
  if (img.complete && img.naturalWidth) fit(); else img.onload = fit;
})();
</script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=900,height=1100');
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Parse L×W×H from size string ──
function _parseDims(sizeStr) {
  if (!sizeStr) return null;
  const parts = sizeStr.split(/[×xX*]/).map(p => parseFloat(p.trim()));
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { l: parts[0], w: parts[1], h: parts[2] || 0 };
  }
  return null;
}

// ── Build SVG flat box blank schematic ──
// Layout (left→right): [Stitch | W | L | W | L]
// Each panel has top and bottom flaps (W/2 height)
// Print area shown on both Length panels
function _buildSchematic(dims, spec, actualReelSize) {
  const { l, w, h } = dims;
  if (!l || !w) return '';
  const H = h || w;

  const stitch  = 2;                         // stitch/joint allowance — matches the "+2" in the cutting-size formula
  const flapH   = w / 2;                     // all flaps = W/2 deep
  const totalW  = 2 * l + 2 * w + stitch;    // == (l+w)×2+2 — same as the Cutting Size sheet length
  const totalH  = H + 2 * flapH;

  // Authoritative cutting-size numbers — always match the order-grid "Cutting Size" cell exactly,
  // reel-size (width) first per the notation standard. The actual reel size on the order wins over
  // the W+H+0.5 estimate once one's on record.
  const sheetLenLabel = (l + w) * 2 + 2;
  const sheetWidLabel = actualReelSize || (w + h + 0.5);

  // Scale to fit 460 × 182 px canvas
  const MAX_W = 460, MAX_H = 182;
  const sc    = Math.min(MAX_W / totalW, MAX_H / totalH, 6);

  const sl = l * sc, sw = w * sc, sH = H * sc;
  const sf = flapH * sc, ss = stitch * sc;

  const PAD = 2;
  const DIM_TOP   = 20; // room for the overall-length dimension line above the drawing
  const DIM_RIGHT = 48; // room for the "W/2 = n.n"" flap labels + the overall-width dimension line
  const VW = Math.ceil(totalW * sc + PAD * 2 + 18 + DIM_RIGHT);
  const VH = Math.ceil(totalH * sc + PAD * 2 + DIM_TOP);

  // Panel x-origins
  const xSt = PAD;
  const xW1 = xSt + ss;
  const xL1 = xW1 + sw;
  const xW2 = xL1 + sl;
  const xL2 = xW2 + sw;

  // Y bands
  const yTop  = PAD;
  const yBody = PAD + sf;
  const yBot  = yBody + sH;

  const hasSpec  = !!(spec && (spec.colours > 0 || spec.printDesc));
  const dLabel   = (spec && spec.printDesc) ? spec.printDesc : '';
  const dLines   = dLabel.split('\n').map(s => s.trim()).filter(Boolean);
  const fmtN     = n => n % 1 === 0 ? String(n) : n.toFixed(1);
  const r        = n => Math.round(n * 10) / 10;

  const bRect = (x, y, rw, rh) =>
    `<rect x="${r(x)}" y="${r(y)}" width="${r(rw)}" height="${r(rh)}" fill="#fff" stroke="#042C53" stroke-width="1.5"/>`;
  const fRect = (x, y, rw, rh) =>
    `<rect x="${r(x)}" y="${r(y)}" width="${r(rw)}" height="${r(rh)}" fill="#dbeafe" stroke="#1d4ed8" stroke-width="1" stroke-dasharray="4,2"/>`;
  const pRect = (x, y, rw, rh) => {
    const sty = hasSpec
      ? `fill="rgba(220,38,38,0.07)" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="5,3"`
      : `fill="#f8fafc" stroke="#94a3b8" stroke-width="1" stroke-dasharray="3,2"`;
    return `<rect x="${r(x)}" y="${r(y)}" width="${r(rw)}" height="${r(rh)}" ${sty}/>`;
  };
  const t = (x, y, anchor, size, fill, weight, content) =>
    `<text x="${r(x)}" y="${r(y)}" text-anchor="${anchor}" font-size="${size}" fill="${fill}" font-weight="${weight}">${content}</text>`;

  const printTxt = (px, py, prw, prh) => {
    if (!hasSpec && !dLines.length) return '';
    const cx = px + prw / 2;
    if (!dLines.length) return t(cx, py + prh / 2 + 3, 'middle', 7, '#dc2626', 'bold', '✦ PRINT');
    const lh = Math.min(prh / (dLines.length + 1.5), 11);
    const startY = py + prh / 2 - ((dLines.length - 1) * lh) / 2;
    return dLines.map((line, i) => {
      const fs = Math.min(lh * 0.82, 9);
      return t(cx, r(startY + i * lh), 'middle', fs, '#dc2626', i === 0 ? 'bold' : 'normal', line);
    }).join('');
  };

  // Dimension line — solid rule with end-ticks and a bold label, drawn outside the box group
  const dimLine = (x1, y1, x2, y2, label, vertical) => {
    const tk = 5;
    const ticks = vertical
      ? `<line x1="${r(x1-tk)}" y1="${r(y1)}" x2="${r(x1+tk)}" y2="${r(y1)}" stroke="#042C53" stroke-width="1"/>` +
        `<line x1="${r(x2-tk)}" y1="${r(y2)}" x2="${r(x2+tk)}" y2="${r(y2)}" stroke="#042C53" stroke-width="1"/>`
      : `<line x1="${r(x1)}" y1="${r(y1-tk)}" x2="${r(x1)}" y2="${r(y1+tk)}" stroke="#042C53" stroke-width="1"/>` +
        `<line x1="${r(x2)}" y1="${r(y2-tk)}" x2="${r(x2)}" y2="${r(y2+tk)}" stroke="#042C53" stroke-width="1"/>`;
    const line = `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="#042C53" stroke-width="1"/>`;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const label_ = vertical
      ? `<text x="${r(mx)}" y="${r(my)}" text-anchor="middle" font-size="9.5" font-weight="800" fill="#042C53" transform="rotate(-90 ${r(mx)} ${r(my)})">${label}</text>`
      : `<text x="${r(mx)}" y="${r(my - 4)}" text-anchor="middle" font-size="9.5" font-weight="800" fill="#042C53">${label}</text>`;
    return ticks + line + label_;
  };

  const parts = [
    `<svg width="${VW}" height="${VH}" viewBox="0 0 ${VW} ${VH}" xmlns="http://www.w3.org/2000/svg" style="font-family:Arial,sans-serif;display:block;max-width:100%">`,

    // Overall dimensions — always match the "Cutting Size" figure on the order-grid exactly
    dimLine(xSt, 11, xL2 + sl, 11, `SHEET LENGTH ${fmtN(sheetLenLabel)}"`, false),
    dimLine(VW - 12, PAD + DIM_TOP, VW - 12, PAD + DIM_TOP + totalH * sc, `SHEET WIDTH ${fmtN(sheetWidLabel)}"`, true),

    `<g transform="translate(0,${DIM_TOP})">`,

    // Stitch tab
    `<rect x="${r(xSt)}" y="${r(yBody)}" width="${r(ss)}" height="${r(sH)}" fill="#f3f4f6" stroke="#9ca3af" stroke-width="1" stroke-dasharray="3,2"/>`,
    ss > 5 ? `<text x="${r(xSt+ss/2)}" y="${r(yBody+sH/2+3)}" text-anchor="middle" font-size="6" fill="#6b7280" transform="rotate(-90 ${r(xSt+ss/2)} ${r(yBody+sH/2)})">2"</text>` : '',

    // W1
    bRect(xW1, yBody, sw, sH),
    fRect(xW1, yTop,  sw, sf),
    fRect(xW1, yBot,  sw, sf),
    t(xW1+sw/2, yBody+sH/2-3,  'middle', 8, '#042C53', 'bold',   'W'),
    sw > 20 ? t(xW1+sw/2, yBody+sH/2+9, 'middle', 7, '#555',    'normal', fmtN(w)) : '',

    // L1
    bRect(xL1, yBody, sl, sH),
    pRect(xL1+sl*0.07, yBody+sH*0.1, sl*0.86, sH*0.8),
    printTxt(xL1+sl*0.07, yBody+sH*0.1, sl*0.86, sH*0.8),
    fRect(xL1, yTop, sl, sf),
    fRect(xL1, yBot, sl, sf),
    sH > 14 ? t(xL1+sl/2, yBody+9, 'middle', 7, '#042C53', 'bold', `L=${fmtN(l)}`) : '',

    // W2
    bRect(xW2, yBody, sw, sH),
    fRect(xW2, yTop,  sw, sf),
    fRect(xW2, yBot,  sw, sf),
    t(xW2+sw/2, yBody+sH/2-3,  'middle', 8, '#042C53', 'bold',   'W'),
    sw > 20 ? t(xW2+sw/2, yBody+sH/2+9, 'middle', 7, '#555',    'normal', fmtN(w)) : '',

    // L2
    bRect(xL2, yBody, sl, sH),
    pRect(xL2+sl*0.07, yBody+sH*0.1, sl*0.86, sH*0.8),
    printTxt(xL2+sl*0.07, yBody+sH*0.1, sl*0.86, sH*0.8),
    fRect(xL2, yTop, sl, sf),
    fRect(xL2, yBot, sl, sf),
    sH > 14 ? t(xL2+sl/2, yBody+9, 'middle', 7, '#042C53', 'bold', `L=${fmtN(l)}`) : '',

    // Right-side annotations — flap depth is always W/2, show the actual inches too
    sf > 14 ? t(xL2+sl+3, yTop+sf/2+3,  'start', 7, '#1d4ed8', 'normal', `W/2 = ${fmtN(flapH)}"`) : '',
    sf > 14 ? t(xL2+sl+3, yBot+sf/2+3,  'start', 7, '#1d4ed8', 'normal', `W/2 = ${fmtN(flapH)}"`) : '',

    '</g>',
    '</svg>',
  ];

  return `<div style="overflow-x:auto">${parts.join('')}</div>
    <div style="font-size:9px;color:#888;text-align:center;margin-top:4px">
      Flat Blank · L=${fmtN(l)} × W=${fmtN(w)} × H=${fmtN(H)} · Cutting size ${fmtN(sheetWidLabel)}" × ${fmtN(sheetLenLabel)}" · Print areas on both Length panels
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// JOB-CARD.JS — Production Job Card + Flexo Print Spec
// ══════════════════════════════════════════════════════════════

const LS_PRINT_SPECS = 'mi_print_specs_v1';
let _printSpecOrderId = null;

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

// ── Open print-spec modal ──
function openPrintSpecModal(orderId) {
  const o = orders.find(x => x.id === orderId);
  if (!o) { alert('Order not found.'); return; }
  _printSpecOrderId = orderId;

  const spec = getPrintSpec(o.customer, o.product) || {};

  document.getElementById('ps-order-info').textContent = `${o.id} · ${o.customer} · ${o.product || o.size || '—'}`;
  document.getElementById('ps-colours').value       = spec.colours      || '1';
  document.getElementById('ps-block-ref').value     = spec.blockRef     || '';
  document.getElementById('ps-print-desc').value    = spec.printDesc    || '';
  document.getElementById('ps-notes').value         = spec.notes        || '';

  _renderColourRows(parseInt(spec.colours || 1), spec.colourDetails || []);
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
  const schematic = dims ? _buildSchematic(dims) : '';

  // Colour spec rows
  const colourRows = (spec.colourDetails || []).map((c, i) => `
    <tr>
      <td style="padding:5px 8px;font-weight:700;color:#042C53;width:50px">C${i + 1}</td>
      <td style="padding:5px 8px">${c.name || '—'}</td>
      <td style="padding:5px 8px;color:#444">${c.desc || '—'}</td>
    </tr>`).join('');

  // Stage sign-off rows
  const stages = [
    {
      num: 1, name: 'Corrugation', icon: '📐',
      checks: [
        'Reel size verified: ' + (o.reelSize ? o.reelSize + '"' : '______'),
        'Cutting size checked (L+W+0.5" × W+H+0.5")',
        'Flute type correct',
        'Sheet count: ' + (o.qty || '______') + ' pcs',
        'No moisture / delamination',
      ]
    },
    {
      num: 2, name: 'Pasting', icon: '🔲',
      checks: [
        'Ply count: ' + (o.ply ? o.ply + ' Ply' : '______'),
        'Paste coverage uniform',
        'Sheet alignment correct',
        'No air bubbles / separation',
        'Stack weight / pressure OK',
      ]
    },
    {
      num: 3, name: 'Printing (Flexo)', icon: '🖨️',
      checks: [
        'Block mounted correctly · Ref: ' + (spec.blockRef || '______'),
        'Colour proof approved',
        'Print register aligned',
        'Ink density correct',
        'All ' + (spec.colours || '—') + ' colour(s) printed',
      ]
    },
    {
      num: 4, name: 'Rotary / RS4', icon: '✂️',
      checks: [
        'Box dimensions: ' + (o.size || '______'),
        'Die cut / crease correct',
        'Score positions verified',
        'Slot depth correct',
        'No burr / rough edges',
      ]
    },
    {
      num: 5, name: 'Stitching', icon: '📎',
      checks: [
        'Joint type: Wire stitch',
        'Overlap: min 30 mm',
        'Stitch strength OK',
        'Count: ' + (o.qty || '______') + ' pcs verified',
        'No open/loose joints',
      ]
    },
    {
      num: 6, name: 'QC Final', icon: '✅',
      checks: [
        'Sample qty checked (min 5 pcs)',
        'Dimensions match: ' + (o.size || '______'),
        'Print quality: PASS / FAIL',
        'Reject count: ______',
        'FINAL RELEASE: PASS / FAIL',
      ]
    },
  ];

  const stageRows = stages.map(s => `
    <tr>
      <td style="padding:8px 10px;width:130px;vertical-align:top;border-right:2px solid #e5e7eb">
        <div style="font-weight:800;font-size:13px;color:#042C53">${s.icon} ${s.name}</div>
        <div style="font-size:10px;color:#888;margin-top:1px">Stage ${s.num}</div>
      </td>
      <td style="padding:8px 10px;vertical-align:top;border-right:1px solid #e5e7eb">
        ${s.checks.map(c => `<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:4px">
          <span style="display:inline-block;width:14px;height:14px;border:1.5px solid #999;border-radius:2px;flex-shrink:0;margin-top:1px"></span>
          <span style="font-size:11px;line-height:1.5">${c}</span>
        </div>`).join('')}
      </td>
      <td style="padding:8px 10px;vertical-align:top;width:140px;font-size:11px">
        <div style="margin-bottom:6px"><strong>Operator:</strong></div>
        <div style="border-bottom:1px solid #ccc;min-height:18px;margin-bottom:8px"></div>
        <div style="margin-bottom:6px"><strong>Signature:</strong></div>
        <div style="border-bottom:1px solid #ccc;min-height:24px;margin-bottom:8px"></div>
        <div style="margin-bottom:6px"><strong>Date / Time:</strong></div>
        <div style="border-bottom:1px solid #ccc;min-height:18px"></div>
      </td>
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
    <div class="order-cell"><div class="order-cell-label">Customer</div><div class="order-cell-val">${o.customer}</div></div>
    <div class="order-cell"><div class="order-cell-label">Product</div><div class="order-cell-val">${o.product || '—'}</div></div>
    <div class="order-cell"><div class="order-cell-label">Qty</div><div class="order-cell-val">${(o.qty || 0).toLocaleString('en-IN')} pcs</div></div>
    <div class="order-cell"><div class="order-cell-label">Box Size</div><div class="order-cell-val">${o.size || '—'}</div></div>
    <div class="order-cell"><div class="order-cell-label">Ply</div><div class="order-cell-val">${o.ply ? o.ply + ' Ply' : '—'}</div></div>
    <div class="order-cell"><div class="order-cell-label">Colour</div><div class="order-cell-val">${o.colour || '—'}</div></div>
    <div class="order-cell"><div class="order-cell-label">Weight</div><div class="order-cell-val">${o.weight ? o.weight + ' gm' : '—'}</div></div>
    <div class="order-cell"><div class="order-cell-label">Reel Size</div><div class="order-cell-val">${o.reelSize ? o.reelSize + '"' : '—'}</div></div>
    <div class="order-cell"><div class="order-cell-label">Order Date</div><div class="order-cell-val">${orderStr}</div></div>
    <div class="order-cell"><div class="order-cell-label">Delivery Date</div><div class="order-cell-val" style="color:#C0392B">${delivStr}</div></div>
    <div class="order-cell"><div class="order-cell-label">Status</div><div class="order-cell-val">${o.status || '—'}</div></div>
  </div>

  <!-- Print Specification -->
  <div class="section-title">🖨️ Flexographic Print Specification</div>
  <div class="bordered">
    <div class="spec-grid">
      <div class="spec-half">
        <div class="spec-row"><span class="spec-label">No. of Colours:</span><span class="spec-val">${spec.colours || '—'}</span></div>
        <div class="spec-row"><span class="spec-label">Block Ref:</span><span class="spec-val">${spec.blockRef || '—'}</span></div>
        <div class="spec-row"><span class="spec-label">Print Description:</span><span class="spec-val">${spec.printDesc || '—'}</span></div>
        ${spec.notes ? `<div class="spec-row"><span class="spec-label">Notes:</span><span class="spec-val">${spec.notes}</span></div>` : ''}
      </div>
      ${schematic ? `<div class="spec-half schematic-wrap">${schematic}</div>` : '<div class="spec-half" style="padding:10px;font-size:11px;color:#888">No box dimensions detected in size field.</div>'}
    </div>

    ${colourRows ? `
    <div style="border-top:1px solid #e2e8f0;padding:8px 10px">
      <table class="colours-table">
        <thead><tr><th style="width:50px">Colour</th><th style="width:120px">Ink Name</th><th>What is Printed</th></tr></thead>
        <tbody>${colourRows}</tbody>
      </table>
    </div>` : ''}
  </div>

  <!-- Stage sign-off table -->
  <div class="section-title">📋 Process Sign-Off</div>
  <div class="bordered" style="padding:0">
    <table class="stages">
      <thead>
        <tr style="background:#f8fafc">
          <td style="padding:6px 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#666;border:1px solid #e2e8f0;width:130px">Stage</td>
          <td style="padding:6px 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#666;border:1px solid #e2e8f0">Checkpoints</td>
          <td style="padding:6px 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#666;border:1px solid #e2e8f0;width:140px">Operator Sign-off</td>
        </tr>
      </thead>
      <tbody>${stageRows}</tbody>
    </table>
  </div>

  <!-- Signatures -->
  <div class="sig-grid">
    <div class="sig-block"><div class="sig-line">Production Supervisor</div></div>
    <div class="sig-block"><div class="sig-line">QC Manager</div></div>
    <div class="sig-block"><div class="sig-line">Dispatch In-Charge</div></div>
  </div>

</div>
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

// ── Build CSS box face schematic (front face: L × H) ──
function _buildSchematic(dims) {
  const { l, w, h } = dims;
  const maxW = 160, maxH = 110;
  const scale = Math.min(maxW / Math.max(l, 1), maxH / Math.max(h || w, 1), 2.5);
  const bW    = Math.round(l * scale);
  const bH    = Math.round((h || w) * scale);
  const pad   = 10;
  const pzX   = Math.round(bW * 0.1), pzY = Math.round(bH * 0.1);
  const pzW   = Math.round(bW * 0.8), pzH = Math.round(bH * 0.8);

  return `
    <div style="text-align:center">
      <div style="font-size:9px;color:#888;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Front Face (L × H)</div>
      <div class="box-face" style="width:${bW}px;height:${bH}px;margin:0 auto">
        <div class="print-zone" style="left:${pzX}px;top:${pzY}px;width:${pzW}px;height:${pzH}px">
          <div style="font-size:9px;color:#E74C3C;text-align:center;margin-top:${Math.round(pzH/2)-8}px;font-weight:700">PRINT AREA</div>
        </div>
      </div>
      <div style="font-size:9px;color:#555;margin-top:6px">${l} × ${h || w} cm (L × ${h ? 'H' : 'W'})</div>
      <div style="font-size:9px;color:#888">W = ${w} cm</div>
    </div>`;
}

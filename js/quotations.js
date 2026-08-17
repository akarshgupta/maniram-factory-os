// ══════════════════════════════════════════════════════════════
// QUOTATIONS.JS — Rate Calculator + Quotation Management
// ══════════════════════════════════════════════════════════════

const LS_QUOTATIONS = 'mi_quotations_v1';
let quotations = [];
let rcUnit = 'inch'; // 'inch' | 'mm'

// ── Unit toggle pill ──
function setRcUnit(unit) {
  rcUnit = unit;
  const isMM = unit === 'mm';

  const btnInch = document.getElementById('unit-btn-inch');
  const btnMM   = document.getElementById('unit-btn-mm');
  if (btnInch) { btnInch.style.background = isMM ? 'transparent' : 'var(--blue)'; btnInch.style.color = isMM ? 'var(--muted)' : '#fff'; }
  if (btnMM)   { btnMM.style.background   = isMM ? 'var(--blue)' : 'transparent'; btnMM.style.color   = isMM ? '#fff' : 'var(--muted)'; }

  document.querySelectorAll('.rc-unit-label').forEach(el => el.textContent = unit);

  const fields = [
    { id: 'rc-length',    phIn: 'e.g. 20',   phMM: 'e.g. 508',  stepIn: '0.1', stepMM: '1' },
    { id: 'rc-width',     phIn: 'e.g. 14',   phMM: 'e.g. 355',  stepIn: '0.1', stepMM: '1' },
    { id: 'rc-height',    phIn: 'e.g. 28',   phMM: 'e.g. 711',  stepIn: '0.1', stepMM: '1' },
    { id: 'rc-reel-size', phIn: 'e.g. 42.5', phMM: 'e.g. 1080', stepIn: '0.5', stepMM: '5' },
  ];
  fields.forEach(f => {
    const el = document.getElementById(f.id);
    if (!el) return;
    el.placeholder = isMM ? f.phMM : f.phIn;
    el.step        = isMM ? f.stepMM : f.stepIn;
  });

  const ml = document.getElementById('rc-margin-label');
  if (ml) ml.textContent = isMM
    ? 'Add 12.7mm margin to sheet width (W+H+12.7mm)'
    : 'Add 0.5" margin to sheet width (W+H+0.5)';

  const res = document.getElementById('rc-result');
  if (res) res.style.display = 'none';
}

// ── Load / Save ──
function loadQuotations() {
  try {
    const s = localStorage.getItem(LS_QUOTATIONS);
    return s ? JSON.parse(s) : [];
  } catch(e) { return []; }
}
function saveQuotations() {
  localStorage.setItem(LS_QUOTATIONS, JSON.stringify(quotations));
}
function initQuotations() {
  quotations = loadQuotations();
}

// ── Generate QT ID ──
function generateQTId() {
  let max = 0;
  quotations.forEach(q => {
    const m = q.id?.match(/QT(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1]));
  });
  return 'QT' + String(max + 1).padStart(3, '0');
}

// ══════════════════════════════════════════════════════════════
// RATE CALCULATOR LOGIC
// ══════════════════════════════════════════════════════════════

function calcBoxWeight(L, W, H, layers, withMargin) {
  // Sheet dimensions
  const plyCount = layers.length;
  const singleL  = (L + W) * 2 + 2;
  // Pasting machine rule (machine width 82"):
  //   5/7/9-ply: single-piece limit 76" — beyond that box is made in
  //   TWO PARTS, stitching margin 2" applied twice → +4 instead of +2.
  //   3-ply: single-piece up to 80" (special cases run up to 82").
  const limit    = plyCount >= 5 ? 76 : 82;
  const twoPart  = singleL > limit;
  const special  = plyCount < 5 && singleL > 80 && singleL <= 82; // 3-ply special zone
  const sheetL   = twoPart ? (L + W) * 2 + 4 : singleL;
  const sheetW = withMargin ? (W + H + 0.5) : (W + H);
  const areaSqm = (sheetL * sheetW) / 1550;

  // Layer weights: flat=liner, flute=medium (factor 1.5)
  // 5-ply: L1(flat), F1(flute), L2(flat), F2(flute), L3(flat)
  // 3-ply: L1(flat), F1(flute), L2(flat)
  let totalWeight = 0;
  const layerWeights = [];

  layers.forEach((gsm, i) => {
    const isFlute = (i % 2 === 1); // index 1,3 = flute
    const w = isFlute ? gsm * areaSqm * 1.5 : gsm * areaSqm;
    layerWeights.push({ gsm, type: isFlute ? 'Flute' : 'Liner', weight: w });
    totalWeight += w;
  });

  return { sheetL, sheetW, areaSqm, layerWeights, totalWeight, totalKg: totalWeight / 1000, twoPart, special };
}

function runRateCalculator() {
  // Inputs (convert mm→inches if needed)
  const isMM = rcUnit === 'mm';
  const rawL = parseFloat(document.getElementById('rc-length').value) || 0;
  const rawW = parseFloat(document.getElementById('rc-width').value)  || 0;
  const rawH = parseFloat(document.getElementById('rc-height').value) || 0;
  const rawReel = parseFloat(document.getElementById('rc-reel-size').value) || 0;

  const L = isMM ? rawL / 25.4 : rawL;
  const W = isMM ? rawW / 25.4 : rawW;
  const H = isMM ? rawH / 25.4 : rawH;
  const reelSize  = rawReel ? (isMM ? rawReel / 25.4 : rawReel) : 0;

  const paperRate = parseFloat(document.getElementById('rc-paper-rate').value) || 0;
  const withMargin = document.getElementById('rc-margin').checked;
  const plyCount   = parseInt(document.getElementById('rc-ply').value) || 5;

  if (!L || !W || !H) { alert('Please enter the box size first.'); return; }

  // Collect GSM layers
  const layers = [];
  for (let i = 1; i <= plyCount; i++) {
    const gsm = parseFloat(document.getElementById(`rc-gsm-${i}`)?.value) || 0;
    layers.push(gsm);
  }
  if (layers.some(g => !g)) { alert('Please enter GSM for all layers.'); return; }

  const result = calcBoxWeight(L, W, H, layers, withMargin);

  // Reel size check
  const reelMatch = reelSize ? Math.abs(reelSize - result.sheetW) < 0.6 : null;

  // Rate
  const GST_PCT   = 5; // Maniram standard — corrugated boxes
  const amtPerBox = paperRate ? result.totalKg * paperRate : null;
  const amtGST    = amtPerBox ? amtPerBox * (1 + GST_PCT / 100) : null;

  // Render result
  const box = document.getElementById('rc-result');
  box.style.display = 'block';

  const reelHTML = reelSize ? `
    <div style="display:flex;align-items:center;gap:10px;margin-top:10px;padding:10px 14px;border-radius:8px;background:${reelMatch ? '#F0FDF4' : '#FEF2F2'};border:1px solid ${reelMatch ? '#86EFAC' : '#FECACA'}">
      <span style="font-size:16px">${reelMatch ? '✅' : '⚠️'}</span>
      <div>
        <div style="font-size:12px;font-weight:700;color:${reelMatch ? 'var(--success)' : 'var(--danger)'}">
          ${reelMatch ? 'Reel Size Match!' : 'Reel Size Mismatch'}
        </div>
        <div style="font-size:11px;color:var(--muted)">
          Calculated Sheet Width: <strong>${result.sheetW}"</strong> &nbsp;|&nbsp; Entered Reel Size: <strong>${reelSize}"</strong>
          ${!reelMatch ? `<br>Difference: ${Math.abs(reelSize - result.sheetW).toFixed(1)}"` : ''}
        </div>
      </div>
    </div>` : `
    <div style="font-size:11px;color:var(--muted);margin-top:8px;">
      ℹ️ Enter Reel Size for validation
    </div>`;

  const layerRows = result.layerWeights.map((l, i) => `
    <div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--muted)">Layer ${i+1} — ${l.type} (${l.gsm} GSM${l.type==='Flute'?' ×1.5':''})</span>
      <strong>${l.weight.toFixed(1)} gm</strong>
    </div>`).join('');

  const rateHTML = paperRate ? `
    <div style="margin-top:14px;padding:12px 14px;background:var(--card-bg);border-radius:10px;border:1px solid var(--border)">
      <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">Rate @ ₹${paperRate}/kg</div>
      <div style="display:flex;gap:24px;flex-wrap:wrap">
        <div><div style="font-size:11px;color:var(--muted)">Per Box (ex-GST)</div><div style="font-size:20px;font-weight:800;color:var(--navy)">₹${amtPerBox.toFixed(2)}</div></div>
        <div><div style="font-size:11px;color:var(--muted)">Per Box (inc GST ${GST_PCT}%)</div><div style="font-size:20px;font-weight:800;color:var(--blue)">₹${amtGST.toFixed(2)}</div></div>
      </div>
    </div>` : '<div style="font-size:11px;color:var(--muted);margin-top:8px;">Enter paper rate to calculate box rate.</div>';

  const twoPartHTML = result.twoPart
    ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px 12px;border-radius:8px;background:#FFF7E6;border:1px solid #F5C06B;font-size:12px"><span>✂️</span><span><strong>Two-part box</strong> — sheet length ${((L+W)*2+2)}" exceeds the single-piece limit, so it's made as 2 pieces with the stitching margin applied twice (Sheet L = (L+W)×2+4)</span></div>`
    : result.special
    ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px 12px;border-radius:8px;background:#FFF7E6;border:1px solid #F5C06B;font-size:12px"><span>⚠️</span><span><strong>Special case</strong> — 3-ply ${result.sheetL}" is above 80" (machine max 82"). A single piece will work, but it is tight.</span></div>`
    : '';

  const mmBanner = isMM ? `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:7px 12px;border-radius:8px;background:#EFF6FF;border:1px solid #BFDBFE;font-size:12px">
      <span>🔄</span>
      <span>Input (mm): <strong>${rawL} × ${rawW} × ${rawH} mm</strong> → converted to <strong>${L.toFixed(3)}" × ${W.toFixed(3)}" × ${H.toFixed(3)}"</strong> for calculation</span>
    </div>` : '';

  box.innerHTML = `
    <div style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:10px;">📐 Calculation Result</div>
    ${mmBanner}
    ${twoPartHTML}
    <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:10px;">
      <div><div style="font-size:11px;color:var(--muted)">Sheet Size (W × L)</div><div style="font-size:16px;font-weight:700">${result.sheetW} × ${result.sheetL}</div><div style="font-size:10px;color:var(--muted)">reel-size first</div></div>
      <div><div style="font-size:11px;color:var(--muted)">Sheet Length</div><div style="font-size:16px;font-weight:700">${result.sheetL}"</div><div style="font-size:10px;color:var(--muted)">(${L}+${W})×2+${result.twoPart ? '4 (two-part)' : '2'}</div></div>
      <div><div style="font-size:11px;color:var(--muted)">Sheet Width</div><div style="font-size:16px;font-weight:700">${result.sheetW}"</div><div style="font-size:10px;color:var(--muted)">${W}+${H}${withMargin?'+0.5':''}</div></div>
      <div><div style="font-size:11px;color:var(--muted)">Area</div><div style="font-size:16px;font-weight:700">${result.areaSqm.toFixed(4)} sqm</div></div>
    </div>

    <div style="margin-bottom:6px;">${layerRows}</div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding:8px 0;">
      <span style="font-size:13px;font-weight:700;color:var(--navy)">Total Box Weight</span>
      <span style="font-size:20px;font-weight:800;color:var(--navy)">${result.totalWeight.toFixed(1)} gm</span>
    </div>

    ${reelHTML}
    ${rateHTML}

    <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
      <button class="btn-primary" onclick="saveAsQuotation()" style="font-size:12px">💾 Save as Quotation</button>
      <button class="btn-secondary" onclick="useInOrderForm()" style="font-size:12px">📦 Use in Order Form</button>
    </div>
  `;

  // Store last calc for save/use (L/W/H always in inches)
  window._lastCalc = { L, W, H, reelSize, layers, plyCount, paperRate, withMargin, result, amtPerBox, amtGST, unit: rcUnit, rawL, rawW, rawH };
}

// ── Fill GSM fields when ply changes or quick-fill ──
function onPlyChange() {
  const ply = parseInt(document.getElementById('rc-ply')?.value) || 5;
  const container = document.getElementById('rc-gsm-layers');
  if (!container) return;

  const layerNames = {
    3: ['Liner 1', 'Flute 1', 'Liner 2'],
    5: ['Liner 1', 'Flute 1', 'Liner 2', 'Flute 2', 'Liner 3'],
    7: ['Liner 1', 'Flute 1', 'Liner 2', 'Flute 2', 'Liner 3', 'Flute 3', 'Liner 4'],
    9: ['Liner 1', 'Flute 1', 'Liner 2', 'Flute 2', 'Liner 3', 'Flute 3', 'Liner 4', 'Flute 4', 'Liner 5'],
  };
  const names = layerNames[ply] || layerNames[5];

  container.innerHTML = names.map((name, i) => `
    <div class="form-group">
      <label class="form-label">${name} GSM</label>
      <input class="form-input" type="number" id="rc-gsm-${i+1}" placeholder="e.g. 100" value="${document.getElementById('rc-gsm-quick')?.value || ''}">
    </div>
  `).join('');
}

// ── Inch ↔ mm Converter ──
function convertUnits() {
  const val = parseFloat(document.getElementById('conv-value')?.value);
  const dir = document.getElementById('conv-direction')?.value;
  const out = document.getElementById('conv-result');
  if (!out) return;
  if (isNaN(val) || !val) { out.textContent = '—'; return; }
  if (dir === 'in-to-mm') {
    out.textContent = (val * 25.4).toFixed(2) + ' mm';
  } else {
    out.textContent = (val / 25.4).toFixed(3) + ' in';
  }
}

function quickFillGSM() {
  const gsm = parseFloat(document.getElementById('rc-gsm-quick').value) || 0;
  if (!gsm) return;
  const ply = parseInt(document.getElementById('rc-ply').value) || 5;
  for (let i = 1; i <= ply; i++) {
    const el = document.getElementById(`rc-gsm-${i}`);
    if (el) el.value = gsm;
  }
}

// ── Use in Order Form ──
function useInOrderForm() {
  if (!window._lastCalc) return;
  const c = window._lastCalc;
  document.getElementById('f-size').value      = `${c.L}×${c.W}×${c.H}`;
  document.getElementById('f-ply').value       = c.plyCount;
  document.getElementById('f-weight').value    = Math.round(c.result.totalWeight);
  if (c.reelSize) document.getElementById('f-reel-size').value = c.reelSize;
  if (c.amtPerBox) document.getElementById('f-rate').value = c.amtPerBox.toFixed(2);
  showPage('orders');
  switchOrderTab('all');
  document.querySelector('.add-order-form').scrollIntoView({ behavior: 'smooth' });
  checkStockForCurrentOrder();
}

// ── Save as Quotation ──
function saveAsQuotation() {
  if (!window._lastCalc) return;
  const c = window._lastCalc;
  const customer = prompt('Client name (for quotation):');
  if (!customer) return;

  const qt = {
    id:        generateQTId(),
    customer,
    boxSize:   `${c.L}×${c.W}×${c.H}`,
    ply:       c.plyCount,
    gsm:       c.layers.join('/'),
    weight:    Math.round(c.result.totalWeight),
    sheetL:    c.result.sheetL,
    sheetW:    c.result.sheetW,
    reelSize:  c.reelSize || '',
    paperRate: c.paperRate || '',
    ratePerBox: c.amtPerBox ? c.amtPerBox.toFixed(2) : '',
    rateGST:   c.amtGST ? c.amtGST.toFixed(2) : '',
    status:    'Pending',
    date:      new Date().toLocaleDateString('en-IN'),
    createdAt: new Date().toISOString(),
  };

  quotations.unshift(qt);
  saveQuotations();
  _mirrorQuotation(qt);
  renderQuotationsList();
  showPage('ratecalc');
  document.getElementById('quotations-list')?.scrollIntoView({ behavior: 'smooth' });
  alert(`✅ ${qt.id} saved!`);
}

// Push a quotation (create or status change) to its own Quotations sheet
function _mirrorQuotation(q) {
  if (typeof mirrorToSheet !== 'function') return;
  mirrorToSheet('saveQuotation', {
    id: q.id, date: q.date, customer: q.customer, size: q.boxSize,
    ply: q.ply, rate: q.ratePerBox || '', status: q.status || 'Pending',
    notes: `${q.weight}gm · ${q.gsm} GSM${q.reelSize ? ' · reel ' + q.reelSize + '"' : ''}`,
  });
}

// ── Render Quotations List ──
function renderQuotationsList() {
  const el = document.getElementById('quotations-list');
  if (!el) return;
  if (!quotations.length) {
    el.innerHTML = '<div class="empty-state">No quotations yet. Create one from the Rate Calculator.</div>';
    return;
  }

  el.innerHTML = quotations.map(q => `
    <div class="card" style="margin-bottom:12px;">
      <div class="card-header">
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--navy)">${q.id} — ${q.customer}</div>
          <div style="font-size:11px;color:var(--muted)">${q.date} · ${q.boxSize} · ${q.ply}ply · ${q.gsm} GSM</div>
        </div>
        <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:${q.status==='Converted'?'#F0FDF4':q.status==='Rejected'?'#FEF2F2':'#FFF7ED'};color:${q.status==='Converted'?'var(--success)':q.status==='Rejected'?'var(--danger)':'#B45309'}">
          ${q.status}
        </span>
      </div>
      <div class="card-body" style="padding-top:8px">
        <div style="display:flex;gap:20px;flex-wrap:wrap;font-size:12px;margin-bottom:10px;">
          <div><span style="color:var(--muted)">Weight:</span> <strong>${q.weight} gm</strong></div>
          <div><span style="color:var(--muted)">Sheet:</span> <strong>${q.sheetW} × ${q.sheetL}</strong></div>
          ${q.reelSize ? `<div><span style="color:var(--muted)">Reel:</span> <strong>${q.reelSize}"</strong></div>` : ''}
          ${q.ratePerBox ? `<div><span style="color:var(--muted)">Rate:</span> <strong>₹${q.ratePerBox}/box</strong></div>` : ''}
          ${q.rateGST ? `<div><span style="color:var(--muted)">Inc GST:</span> <strong>₹${q.rateGST}/box</strong></div>` : ''}
        </div>
        ${q.status === 'Pending' ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-primary" style="font-size:11px;padding:6px 12px" onclick="convertQuotation('${q.id}','order')">📦 Convert to Order</button>
          <button class="btn-secondary" style="font-size:11px;padding:6px 12px" onclick="convertQuotation('${q.id}','client')">🤝 Add to Client</button>
          <button class="btn-secondary" style="font-size:11px;padding:6px 12px;color:var(--danger)" onclick="rejectQuotation('${q.id}')">❌ Reject</button>
        </div>` : ''}
      </div>
    </div>
  `).join('');
}

function convertQuotation(id, mode) {
  const q = quotations.find(x => x.id === id);
  if (!q) return;

  if (mode === 'order') {
    // Pre-fill order form
    document.getElementById('f-customer').value   = q.customer;
    document.getElementById('f-size').value       = q.boxSize;
    document.getElementById('f-ply').value        = q.ply;
    document.getElementById('f-weight').value     = q.weight;
    if (q.reelSize) document.getElementById('f-reel-size').value = q.reelSize;
    if (q.ratePerBox) document.getElementById('f-rate').value   = q.ratePerBox;
    populateProductDropdown(q.customer);
    refreshOrderId();
    showPage('orders');
    switchOrderTab('all');
    document.querySelector('.add-order-form').scrollIntoView({ behavior: 'smooth' });
    checkStockForCurrentOrder();
  } else {
    // Add as product to client
    const ci = CLIENTS.findIndex(c => c.name.toLowerCase() === q.customer.toLowerCase());
    if (ci < 0) {
      alert(`"${q.customer}" is not in the client list. Please add the client first.`);
      return;
    }
    const productName = prompt('Product name:', q.boxSize);
    if (!productName) return;
    const product = {
      name: productName.trim(),
      size: q.boxSize,
      ply:  q.ply.toString(),
      colour: '',
      weight: q.weight.toString(),
      reelSize: q.reelSize?.toString() || '',
    };
    CLIENTS[ci].products.push(product);
    postClient({ action: 'saveProduct', clientName: CLIENTS[ci].name, ...product });
    setTimeout(fetchClients, 2000);
    renderClients();
    alert(`✅ "${productName}" added to ${q.customer}!`);
  }

  q.status = 'Converted';
  q.convertedAt = new Date().toISOString();
  q.convertedTo = mode;
  saveQuotations();
  _mirrorQuotation(q);
  renderQuotationsList();
}

function rejectQuotation(id) {
  if (!confirm('Reject this quotation?')) return;
  const q = quotations.find(x => x.id === id);
  if (q) { q.status = 'Rejected'; saveQuotations(); _mirrorQuotation(q); renderQuotationsList(); }
}

// ══════════════════════════════════════════════════════════════
// DECKLE.JS — Trim / Deckle Waste Optimizer
// Sheet width (inch) → rank available reels by waste %.
// Reel data comes from live reelData (js/reels.js); falls back to
// common stocked sizes when live data hasn't loaded.
// ══════════════════════════════════════════════════════════════

const DECKLE_FALLBACK_SIZES = [30, 32, 33, 35, 35.5, 36, 38, 40, 42, 44, 46, 48];

function _deckleReelSizes() {
  if (typeof reelData !== 'undefined' && Array.isArray(reelData) && reelData.length > 0) {
    return reelData.map(r => ({ size: parseFloat(r.size), live: true, count: r.count, kg: r.totalWeight }))
                   .filter(r => r.size > 0);
  }
  return DECKLE_FALLBACK_SIZES.map(s => ({ size: s, live: false }));
}

// ── Box L×W×H → required sheet width (deckle direction) ──
// Blank height across the reel = box W + box H (flaps = W/2 top & bottom).
function deckleFromBox() {
  const L = parseFloat(document.getElementById('dk-l').value);
  const W = parseFloat(document.getElementById('dk-w').value);
  const H = parseFloat(document.getElementById('dk-h').value);
  const info = document.getElementById('dk-sheet-info');
  if (!W || !H) {
    info.textContent = 'Box W aur H daalo — sheet width = W + H (+ margin).';
    return;
  }
  const heavy  = document.getElementById('dk-ply').value === 'heavy';
  const margin = document.getElementById('dk-margin').checked ? (heavy ? 0.5 : 0.25) : 0;
  const sheetW = W + H + margin;
  document.getElementById('dk-sheet-w').value = sheetW.toFixed(2);
  const cutLen = L && W ? (2 * (L + W) + 2).toFixed(1) : null;
  info.innerHTML = `Sheet width = ${W} + ${H}${margin ? ` + ${margin}" margin` : ''} = <b>${sheetW.toFixed(2)}"</b>` +
    (cutLen ? ` · cutting length ≈ ${cutLen}" (2×(L+W) + 2" joint)` : '');
  deckleRun();
}

function deckleRun() {
  const w1   = parseFloat(document.getElementById('dk-sheet-w').value);
  const w2   = parseFloat(document.getElementById('dk-sheet-w2').value) || 0;
  const rate = parseFloat(document.getElementById('dk-rate').value) || 0;
  const out  = document.getElementById('deckle-results');
  const rateHint = document.getElementById('dk-rate-hint');

  if (!w1 || w1 <= 0) {
    out.innerHTML = '<div class="empty-state">Sheet width daalo ya box size se calculate karo — available reels waste % ke hisaab se rank ho jayenge.</div>';
    rateHint.textContent = '';
    return;
  }

  const reels = _deckleReelSizes();
  const results = [];

  reels.forEach(r => {
    // best combo of n1 sheets of w1 (+ n2 of w2 when given) on this reel
    let best = null;
    const maxN1 = Math.floor(r.size / w1);
    for (let n1 = maxN1; n1 >= 0; n1--) {
      const rem   = r.size - n1 * w1;
      const n2    = w2 > 0 ? Math.floor(rem / w2) : 0;
      if (n1 === 0 && n2 === 0) continue;
      const used  = n1 * w1 + n2 * w2;
      const waste = r.size - used;
      if (!best || waste < best.waste) best = { n1, n2, used, waste };
      if (w2 <= 0) break; // without a combo width, only the max-ups split matters
    }
    if (!best) return;
    results.push({
      size: r.size, live: r.live, count: r.count, kg: r.kg,
      ...best, wastePct: (best.waste / r.size) * 100,
    });
  });

  if (results.length === 0) {
    out.innerHTML = `<div class="empty-state">Koi reel ${w1}" sheet ke liye kaafi wide nahi hai.</div>`;
    return;
  }

  results.sort((a, b) => a.wastePct - b.wastePct);

  rateHint.textContent = rate
    ? `Paper @ ₹${rate}/kg — waste % = same % of paper cost lost. Example: 1000 kg run pe 5% waste = ₹${(1000 * 0.05 * rate).toLocaleString('en-IN')} loss.`
    : '';

  const liveTag = results.some(r => r.live)
    ? '' : `<div class="field-hint" style="margin-bottom:8px">⚠️ Live reel stock load nahi hua — standard sizes dikha rahe hain. Reel Stock page kholke wapas aao.</div>`;

  out.innerHTML = liveTag + `
    <div class="add-order-form" style="padding:0;overflow-x:auto">
    <table class="data-table" style="width:100%;border-collapse:collapse">
      <thead><tr style="text-align:left">
        <th style="padding:9px 12px">Reel</th>
        <th style="padding:9px 12px">Cutting</th>
        <th style="padding:9px 12px">Used</th>
        <th style="padding:9px 12px">Waste</th>
        <th style="padding:9px 12px">Waste %</th>
        ${rate ? '<th style="padding:9px 12px">Loss ₹/1000 kg</th>' : ''}
        <th style="padding:9px 12px">Stock</th>
      </tr></thead>
      <tbody>` +
    results.map((r, i) => {
      const pctCol = r.wastePct <= 3 ? 'var(--success,#27AE60)' : r.wastePct <= 8 ? '#E67E22' : '#E74C3C';
      const combo  = r.n2 > 0 ? `${r.n1} × ${w1}" + ${r.n2} × ${w2}"` : `${r.n1} × ${w1}"`;
      const loss   = rate ? `₹${Math.round(1000 * (r.wastePct/100) * rate).toLocaleString('en-IN')}` : '';
      return `<tr style="border-top:1px solid var(--border,#e5e7eb);${i===0?'background:rgba(39,174,96,.07);font-weight:600':''}">
        <td style="padding:9px 12px">${i===0?'⭐ ':''}${r.size}"</td>
        <td style="padding:9px 12px">${combo}</td>
        <td style="padding:9px 12px">${r.used.toFixed(2)}"</td>
        <td style="padding:9px 12px">${r.waste.toFixed(2)}"</td>
        <td style="padding:9px 12px;color:${pctCol};font-weight:700">${r.wastePct.toFixed(1)}%</td>
        ${rate ? `<td style="padding:9px 12px">${loss}</td>` : ''}
        <td style="padding:9px 12px;font-size:12px;color:var(--muted,#888)">${r.live ? `${r.count} reels · ${Math.round(r.kg).toLocaleString('en-IN')} kg` : '—'}</td>
      </tr>`;
    }).join('') + `
      </tbody></table></div>`;
}

// Called from showPage — make sure live reel data is available.
function initDeckle() {
  if ((typeof reelData === 'undefined' || !reelData.length) && typeof fetchReelStock === 'function') {
    fetchReelStock().then(() => deckleRun()).catch(() => {});
  }
  deckleRun();
}

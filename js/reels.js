// ══════════════════════════════════════════════════════════════
// REELS.JS — Reel Stock Fetching & Rendering
//
// Criticality rules:
//   35" + 35.5" are ONE pool (same machine) — combined plain-100-GSM
//     count < 4 = critical, == 4 = low
//   42" and 44" — plain 100 GSM count only, same threshold
//   All other sizes → no criticality badge
//   "gy" in GSM value = coloured paper (tracked separately, not counted
//     toward the 100 GSM plain threshold)
// ══════════════════════════════════════════════════════════════

let reelData = [];

// ── Fetch ──
async function fetchReelStock() {
  setReelSyncStatus('loading', 'Fetching live reel data...');
  const range = encodeURIComponent(`${REEL_TAB}!A1:Z500`);
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${REEL_SHEET_ID}/values/${range}?key=${API_KEY}&_=${Date.now()}`;
  try {
    const res  = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    const rows = json.values || [];

    let headerRow = -1, colSize = -1, colGSM = -1, colBF = -1, colWeight = -1, colQty = -1;
    for (let i = 0; i < rows.length; i++) {
      const r  = rows[i].map(c => c.toString().trim().toUpperCase());
      const si = r.findIndex(c => c === 'SIZE' || c === 'REEL SIZE' || c === 'REEL_SIZE');
      if (si >= 0) {
        headerRow = i;
        colSize   = si;
        colGSM    = r.findIndex(c => c === 'GSM');
        colBF     = r.findIndex(c => c === 'BF');
        colWeight = r.findIndex(c => c.includes('WEIGHT') || c === 'WT' || c === 'NET WT' || c === 'GROSS WT' || c === 'KG');
        colQty    = r.findIndex(c => c === 'QTY' || c === 'QUANTITY' || c === 'REELS' || c === 'COUNT' || c === 'NOS' || c === 'NO.');
        break;
      }
    }
    if (headerRow < 0) throw new Error('Header not found in reel sheet — expected a SIZE column');

    const parsed = [];
    for (let i = headerRow + 1; i < rows.length; i++) {
      const r      = rows[i];
      if (!r || !r[colSize]) continue;
      const size   = parseFloat(r[colSize]);
      const weight = parseFloat(colWeight >= 0 ? r[colWeight] : 0);
      if (!size || isNaN(size)) continue;
      const qty      = colQty >= 0 ? (parseInt(r[colQty]) || 1) : 1;
      const gsmRaw   = colGSM >= 0 ? (r[colGSM] || '').toString().trim() : '';
      const gsmLow   = gsmRaw.toLowerCase();
      const isColoured = gsmLow.includes('gy');
      const is100Plain = (gsmLow.startsWith('100') || gsmRaw === '100') && !isColoured;
      parsed.push({
        size, gsm: gsmRaw || '—', bf: colBF >= 0 ? r[colBF] : '—',
        weight: isNaN(weight) ? 0 : weight, qty, is100Plain, isColoured,
      });
    }

    const grouped = {};
    parsed.forEach(r => {
      const k = r.size.toString();
      if (!grouped[k]) grouped[k] = {
        size: r.size, count: 0, plain100Count: 0, colouredCount: 0,
        totalWeight: 0, gsm: r.gsm, bf: r.bf, hasColoured: false,
      };
      grouped[k].count         += r.qty;
      grouped[k].totalWeight   += r.weight * r.qty;
      if (r.is100Plain) grouped[k].plain100Count += r.qty;
      if (r.isColoured) { grouped[k].colouredCount += r.qty; grouped[k].hasColoured = true; }
    });

    reelData = Object.values(grouped).sort((a, b) => b.size - a.size);
    const totalKg = reelData.reduce((s, r) => s + r.totalWeight, 0) + KATRA_BUFFER_KG;
    const now     = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    setReelSyncStatus('ok', `Live · ${now} · Total ${totalKg.toLocaleString('en-IN')} kg`);

    renderCriticalReels();
    renderFullReels();
    updateDashboardStock();
  } catch (err) {
    setReelSyncStatus('error', `Error: ${err.message}`);
  }
}

// ── Status bar ──
function setReelSyncStatus(type, msg) {
  ['reel-sync-dot', 'reel-sync-dot2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.className = `sync-dot ${type === 'ok' ? '' : type}`;
  });
  ['reel-sync-label', 'reel-sync-label2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = msg;
  });
}

// ── Criticality: new rules ──
// r = one entry from reelData (has .plain100Count)
function getReelStatus(r) {
  const s = r.size.toString();

  // 35 and 35.5 are a single pool — same machine, interchangeable
  if (s === '35' || s === '35.5') {
    const g35  = reelData.find(x => x.size.toString() === '35');
    const g355 = reelData.find(x => x.size.toString() === '35.5');
    const pool = ((g35 && g35.plain100Count) || 0) + ((g355 && g355.plain100Count) || 0);
    if (pool < MIN_REELS)  return 'critical';
    if (pool === MIN_REELS) return 'low';
    return 'ok';
  }

  // 42 and 44: only 100 GSM plain count matters
  if (s === '42' || s === '44') {
    const cnt = r.plain100Count;
    if (cnt < MIN_REELS)  return 'critical';
    if (cnt === MIN_REELS) return 'low';
    return 'ok';
  }

  return 'ok'; // all other sizes not tracked for criticality
}

// ── Render Critical (Dashboard card) ──
function renderCriticalReels() {
  const list = document.getElementById('critical-reel-list');
  if (!list) return;

  const g35  = reelData.find(r => r.size.toString() === '35');
  const g355 = reelData.find(r => r.size.toString() === '35.5');
  const g42  = reelData.find(r => r.size.toString() === '42');
  const g44  = reelData.find(r => r.size.toString() === '44');

  const pool35 = ((g35 && g35.plain100Count) || 0) + ((g355 && g355.plain100Count) || 0);

  const entries = [
    { label: '35 + 35.5"', count: pool35, note: '100 GSM pooled' },
    { label: '42"',        count: g42 ? g42.plain100Count : 0, note: '100 GSM' },
    { label: '44"',        count: g44 ? g44.plain100Count : 0, note: '100 GSM' },
  ];

  const max = Math.max(...entries.map(e => e.count), 1);
  list.innerHTML = '';
  entries.forEach(e => {
    const cnt    = e.count;
    const status = cnt < MIN_REELS ? 'critical' : cnt === MIN_REELS ? 'low' : 'ok';
    const pct    = Math.round((cnt / max) * 100);
    const item   = document.createElement('div');
    item.className = 'reel-item';
    item.innerHTML = `
      <div class="reel-size" style="font-size:12px;min-width:80px">${e.label}</div>
      <div class="reel-bar-wrap"><div class="reel-bar ${status}" style="width:${pct}%"></div></div>
      <div class="reel-count ${status}">${cnt} reels</div>
      <div class="reel-badge ${status}">${status === 'ok' ? 'OK' : status === 'low' ? 'LOW' : '⚠ CRIT'}</div>
    `;
    list.appendChild(item);
  });
}

// ── Render Full List (Reels page) ──
function renderFullReels() {
  const list = document.getElementById('full-reel-list');
  if (!list || !reelData.length) return;
  const max = Math.max(...reelData.map(r => r.count), 1);
  list.innerHTML = '';
  reelData.forEach(r => {
    const status     = getReelStatus(r);
    const pct        = Math.round((r.count / max) * 100);
    const latRate    = getLatestRate(r.size.toString());
    const rateStr    = latRate ? `· ₹${latRate}/kg` : '';
    const gyNote     = r.hasColoured
      ? `<span style="color:#B45309;font-weight:600"> · ${r.colouredCount} coloured (gy)</span>`
      : '';
    const plainNote  = (r.size.toString() === '35' || r.size.toString() === '35.5')
      ? ` · <span style="color:var(--muted)">${r.plain100Count} plain-100</span>`
      : (r.size.toString() === '42' || r.size.toString() === '44')
        ? ` · <span style="color:var(--muted)">${r.plain100Count} plain-100</span>`
        : '';

    const item = document.createElement('div');
    item.className = 'reel-item';
    item.innerHTML = `
      <div class="reel-size">${r.size}"</div>
      <div class="reel-bar-wrap"><div class="reel-bar ${status}" style="width:${pct}%"></div></div>
      <div style="flex:1;padding:0 12px">
        <div style="font-size:13px;font-weight:600">${r.count} reels · ${r.totalWeight.toLocaleString('en-IN')} kg ${rateStr}${plainNote}</div>
        <div style="font-size:11px;color:var(--muted)">GSM ${r.gsm} · BF ${r.bf}${gyNote}</div>
      </div>
      <div class="reel-badge ${status}">${status === 'ok' ? 'OK' : status === 'low' ? 'LOW' : '⚠ CRITICAL'}</div>
    `;
    list.appendChild(item);
  });
}

// ── Dashboard Stock Summary ──
function updateDashboardStock() {
  const g35  = reelData.find(r => r.size.toString() === '35');
  const g355 = reelData.find(r => r.size.toString() === '35.5');
  const g42  = reelData.find(r => r.size.toString() === '42');
  const g44  = reelData.find(r => r.size.toString() === '44');

  const pool35 = ((g35 && g35.plain100Count) || 0) + ((g355 && g355.plain100Count) || 0);
  const critCount = [
    pool35 < MIN_REELS,
    (g42 ? g42.plain100Count : 0) < MIN_REELS,
    (g44 ? g44.plain100Count : 0) < MIN_REELS,
  ].filter(Boolean).length;

  const card = document.getElementById('stock-status-card');
  const val  = document.getElementById('stat-stock');
  const sub  = document.getElementById('stat-stock-sub');
  if (critCount > 0) {
    card.className  = 'stat-card alert';
    val.style.color = 'var(--danger)';
    val.textContent = '⚠';
    sub.textContent = `${critCount} size(s) critical`;
  } else {
    card.className  = 'stat-card good';
    val.style.color = 'var(--success)';
    val.textContent = 'OK';
    sub.textContent = 'All critical sizes stocked';
  }
}

// ── Check reel availability for a given size ──
// Returns { available: bool, count: number, totalWeight: number }
function checkReelAvailability(reelSize) {
  const sizeStr = reelSize.toString();
  const found   = reelData.find(r => r.size.toString() === sizeStr || Math.floor(r.size).toString() === sizeStr);
  if (!found || found.count === 0) return { available: false, count: 0, totalWeight: 0 };
  return { available: found.count >= MIN_REELS, count: found.count, totalWeight: found.totalWeight };
}

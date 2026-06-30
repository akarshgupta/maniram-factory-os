// ══════════════════════════════════════════════════════════════
// REELS.JS — Reel Stock Fetching & Rendering
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
      // If a QTY column exists, each row represents multiple reels
      const qty    = colQty >= 0 ? (parseInt(r[colQty]) || 1) : 1;
      parsed.push({ size, gsm: colGSM >= 0 ? r[colGSM] : '—', bf: colBF >= 0 ? r[colBF] : '—', weight: isNaN(weight) ? 0 : weight, qty });
    }

    const grouped = {};
    parsed.forEach(r => {
      const k = r.size.toString();
      if (!grouped[k]) grouped[k] = { size: r.size, count: 0, totalWeight: 0, gsm: r.gsm, bf: r.bf };
      grouped[k].count       += r.qty;
      grouped[k].totalWeight += r.weight * r.qty;
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

// ── Status ──
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

function getReelStatus(size, count) {
  const isCrit = CRITICAL_SIZES.includes(size.toString()) || CRITICAL_SIZES.includes(Math.floor(size).toString());
  if (isCrit && count < MIN_REELS)  return 'critical';
  if (isCrit && count === MIN_REELS) return 'low';
  return 'ok';
}

// ── Render Critical (Dashboard card) ──
function renderCriticalReels() {
  const list = document.getElementById('critical-reel-list');
  if (!list) return;
  const critReels = reelData.filter(r => CRITICAL_SIZES.includes(r.size.toString()) || CRITICAL_SIZES.includes(Math.floor(r.size).toString()));
  if (!critReels.length) { list.innerHTML = '<div class="empty-state">No critical size data.</div>'; return; }
  const max = Math.max(...critReels.map(r => r.count), 1);
  list.innerHTML = '';
  critReels.forEach(r => {
    const status = getReelStatus(r.size, r.count);
    const pct    = Math.round((r.count / max) * 100);
    const item   = document.createElement('div');
    item.className = 'reel-item';
    item.innerHTML = `
      <div class="reel-size">${r.size}"</div>
      <div class="reel-bar-wrap"><div class="reel-bar ${status}" style="width:${pct}%"></div></div>
      <div class="reel-count ${status}">${r.count} reels</div>
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
    const status  = getReelStatus(r.size, r.count);
    const pct     = Math.round((r.count / max) * 100);
    const latRate = getLatestRate(r.size.toString());
    const rateStr = latRate ? `· ₹${latRate}/kg` : '';
    const item    = document.createElement('div');
    item.className = 'reel-item';
    item.innerHTML = `
      <div class="reel-size">${r.size}"</div>
      <div class="reel-bar-wrap"><div class="reel-bar ${status}" style="width:${pct}%"></div></div>
      <div style="flex:1;padding:0 12px">
        <div style="font-size:13px;font-weight:600">${r.count} reels · ${r.totalWeight.toLocaleString('en-IN')} kg ${rateStr}</div>
        <div style="font-size:11px;color:var(--muted)">GSM ${r.gsm} · BF ${r.bf}</div>
      </div>
      <div class="reel-badge ${status}">${status === 'ok' ? 'OK' : status === 'low' ? 'LOW' : '⚠ CRITICAL'}</div>
    `;
    list.appendChild(item);
  });
}

// ── Dashboard Stock Summary ──
function updateDashboardStock() {
  const crits = reelData.filter(r => getReelStatus(r.size, r.count) === 'critical');
  const card  = document.getElementById('stock-status-card');
  const val   = document.getElementById('stat-stock');
  const sub   = document.getElementById('stat-stock-sub');
  if (crits.length > 0) {
    card.className  = 'stat-card alert';
    val.style.color = 'var(--danger)';
    val.textContent = '⚠';
    sub.textContent = `${crits.length} size(s) critical`;
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

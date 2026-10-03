// ══════════════════════════════════════════════════════════════
// REELS.JS — Reel Stock Fetching & Rendering
//
// Criticality rules:
//   35" + 35.5" are ONE pool (same machine) — combined plain-100-GSM
//     count < 4 = critical, == 4 = low
//   42" and 44" — plain 100 GSM count only, same threshold
//   All other sizes → no criticality badge
//   "GY" = coloured paper — appears in a 5th column (no header) in the
//     reel sheet, NOT in the GSM column. Tracked separately, not counted
//     toward the 100 GSM plain threshold.
// ══════════════════════════════════════════════════════════════

let reelData = [];
const GST_RATE = 0.18;
let reelExpandedGroups = new Set();
// Size + GSM + BF + coloured(GY) status all identify a distinct group — two
// lots that only match on size+GSM but differ in BF or coloured status are
// never blended into one row, so neither a different BF nor a coloured lot
// can end up silently hidden inside an otherwise-plain group.
function _groupKey(r) {
  return r.size.toString() + '|' + (r.gsm === '—' ? '' : r.gsm).toString() + '|' +
    (r.bf === '—' ? '' : r.bf).toString() + '|' + (r.hasColoured ? 'GY' : 'N');
}

// ── Daily snapshot storage ──
// A day's closing stock is the last live fetch that day. The shared record
// lives in the private StockSnapshots tab (ORDERS_SHEET_ID — the supervisor
// never has that link), so history survives any browser/device; localStorage
// is only a cache so the calendar draws instantly. Kept: the last 31 days,
// plus the first and last recorded day of every month forever (month
// opening/closing). Code.gs's _pruneStockSnapshots applies the same rule.
const LS_REEL_SNAPS = 'mi_reel_snapshots_v2';
const SNAP_KEEP_DAYS = 31;

// Local (IST) calendar date — toISOString() is UTC and would file anything
// fetched before 5:30am under the previous day.
function _localDateKey(d) {
  d = d || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function _daysAgoKey(n) { const d = new Date(); d.setDate(d.getDate() - n); return _localDateKey(d); }

// Quantities only — a snapshot never carries rates or per-lot data.
function _compactSnapData(data) {
  return (data || []).map(r => ({
    size: r.size, gsm: r.gsm, bf: r.bf, hasColoured: !!r.hasColoured,
    count: r.count, totalWeight: Math.round(r.totalWeight || 0), plain100Count: r.plain100Count || 0,
  }));
}

function _pruneSnaps(snaps) {
  const cutoffKey = _daysAgoKey(SNAP_KEEP_DAYS - 1);
  const first = {}, last = {};
  Object.keys(snaps).forEach(k => {
    const m = k.slice(0, 7);
    if (!first[m] || k < first[m]) first[m] = k;
    if (!last[m]  || k > last[m])  last[m]  = k;
  });
  const keep = new Set([...Object.values(first), ...Object.values(last)]);
  Object.keys(snaps).forEach(k => { if (k < cutoffKey && !keep.has(k)) delete snaps[k]; });
  return snaps;
}

function _getReelSnaps() {
  try { return JSON.parse(localStorage.getItem(LS_REEL_SNAPS) || '{}'); } catch { return {}; }
}
function _writeSnapsCache(snaps) {
  try { localStorage.setItem(LS_REEL_SNAPS, JSON.stringify(snaps)); } catch {}
}

function _postSnapshot(key, snap) {
  const data = _compactSnapData(snap.data);
  fetch(APPS_SCRIPT_URL, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'saveStockSnapshot', date: key, ts: snap.ts || Date.now(),
      totalKg: Math.round(_snapTotalKg(data)),
      reels: data.reduce((s, r) => s + (r.count || 0), 0),
      data: JSON.stringify(data),
    }),
  }).catch(() => {});
}

function _saveReelSnapshot(data) {
  const key   = _localDateKey();
  const snaps = _getReelSnaps();
  snaps[key]  = { ts: Date.now(), data: _compactSnapData(data) };
  _writeSnapsCache(_pruneSnaps(snaps));
  _postSnapshot(key, snaps[key]);
  renderReelDateTabs();
}

// Merge the shared sheet history into the local cache (newer ts wins per
// day), and upload any day this browser has that the sheet doesn't — which
// is how history recorded before the sheet existed gets preserved.
async function fetchReelSnapshots() {
  try {
    const range = encodeURIComponent('StockSnapshots!A1:E2000');
    const res   = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ORDERS_SHEET_ID}/values/${range}?key=${API_KEY}&_=${Date.now()}`);
    const json  = await res.json();
    const rows  = (json.values || []).slice(1);
    const snaps = _getReelSnaps();
    const inSheet = new Set();
    rows.forEach(r => {
      const date = (r[0] || '').toString().trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      let data; try { data = JSON.parse(r[4] || '[]'); } catch { return; }
      inSheet.add(date);
      const ts = parseFloat(r[3]) || 0;
      if (!snaps[date] || (snaps[date].ts || 0) < ts) snaps[date] = { ts, data };
    });
    _pruneSnaps(snaps);
    const todayKey = _localDateKey();
    Object.keys(snaps).forEach(k => { if (k !== todayKey && !inSheet.has(k)) _postSnapshot(k, snaps[k]); });
    _writeSnapsCache(snaps);
  } catch {}
}

// ── Fetch ──
// Rate/transport never live in the Stock sheet itself — that sheet is
// directly open-able by the supervisor (for manual stock-count entry), so
// pricing is kept in ORDERS_SHEET_ID's "ReelRates" tab instead, which the
// supervisor is never given a link to. Stock rows only carry an opaque
// "Lot ID" used to join against that private tab, fetched separately here.
async function fetchReelStock() {
  setReelSyncStatus('loading', 'Fetching live reel data...');
  const snapsSync = fetchReelSnapshots();
  const stockRange = encodeURIComponent(`${REEL_TAB}!A1:Z500`);
  const stockUrl   = `https://sheets.googleapis.com/v4/spreadsheets/${REEL_SHEET_ID}/values/${stockRange}?key=${API_KEY}&_=${Date.now()}`;
  const ratesRange = encodeURIComponent('ReelRates!A1:E5000');
  const ratesUrl   = `https://sheets.googleapis.com/v4/spreadsheets/${ORDERS_SHEET_ID}/values/${ratesRange}?key=${API_KEY}&_=${Date.now()}`;
  try {
    const [res, ratesRes] = await Promise.all([fetch(stockUrl), fetch(ratesUrl)]);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    const rows = json.values || [];

    // Build the Lot ID -> {rate, transport} lookup. The ReelRates tab may
    // not exist yet (no rate has ever been saved) — that's fine, just an
    // empty map, not an error.
    const rateMap = {};
    try {
      const ratesJson = await ratesRes.json();
      const rateRows  = (ratesJson.values || []).slice(1); // skip header
      rateRows.forEach(rr => {
        if (!rr || !rr[0]) return;
        rateMap[rr[0]] = { rate: parseFloat(rr[3]) || 0, transport: parseFloat(rr[4]) || 0 };
      });
    } catch {}

    let headerRow = -1, colSize = -1, colGSM = -1, colBF = -1, colWeight = -1, colQty = -1, colLotId = -1;
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
        colLotId  = r.findIndex(c => c === 'LOT ID' || c === 'LOT_ID' || c === 'LOTID');
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
      const qty       = colQty >= 0 ? (parseInt(r[colQty]) || 1) : 1;
      const gsmRaw    = colGSM >= 0 ? (r[colGSM] || '').toString().trim() : '';
      const lotId     = colLotId >= 0 ? (r[colLotId] || '') : '';
      const rated     = rateMap[lotId] || { rate: 0, transport: 0 };
      // GY can be in the Normal/GY column or tacked onto BF ("18sg") — see isColouredMark()
      const isColoured = r.some((cell, ci) =>
        ci !== colSize && ci !== colGSM && ci !== colWeight && ci !== colQty && ci !== colLotId &&
        isColouredMark(cell)
      );
      const gsm100 = parseInt(gsmRaw) === 100 || gsmRaw === '100';
      const is100Plain = gsm100 && !isColoured;
      parsed.push({
        size, gsm: gsmRaw || '—', bf: colBF >= 0 ? cleanBf(r[colBF]) : '—',
        weight: isNaN(weight) ? 0 : weight, qty, is100Plain, isColoured,
        rate: rated.rate, transport: rated.transport,
        sheetRow: i + 1, // 1-based row number in the live sheet, for per-lot edits
      });
    }

    // Grouped by size + GSM + BF + coloured(GY) status — a width that stocks
    // both 100 GSM and some other GSM shows as separate rows instead of one
    // blended total, and the same split applies to BF and coloured paper:
    // two lots that only match on size+GSM but differ in BF, or where one is
    // coloured and the other isn't, never get blended into a single group
    // where one of those lots would otherwise be invisible. Each group also
    // keeps its individual lots (sheet rows) so the Reels page can expand a
    // group and show/edit each one.
    const grouped = {};
    parsed.forEach(r => {
      const gsmKey = (r.gsm || '—').toString();
      const bfKey  = (r.bf === '—' ? '' : r.bf).toString();
      const k = r.size.toString() + '|' + gsmKey + '|' + bfKey + '|' + (r.isColoured ? 'GY' : 'N');
      if (!grouped[k]) grouped[k] = {
        size: r.size, count: 0, plain100Count: 0, colouredCount: 0,
        totalWeight: 0, gsm: r.gsm, bf: r.bf, hasColoured: r.isColoured,
        ratedValue: 0, ratedWeight: 0, lots: [],
      };
      grouped[k].count         += r.qty;
      grouped[k].totalWeight   += r.weight * r.qty;
      if (r.is100Plain) grouped[k].plain100Count += r.qty;
      if (r.isColoured) { grouped[k].colouredCount += r.qty; grouped[k].hasColoured = true; }
      // Only lots with a recorded rate contribute to the weighted average —
      // older lots (no rate captured) are left out rather than treated as ₹0.
      if (r.rate > 0) {
        grouped[k].ratedValue  += r.rate * r.weight * r.qty;
        grouped[k].ratedWeight += r.weight * r.qty;
      }
      grouped[k].lots.push({
        sheetRow: r.sheetRow, qty: r.qty, weight: r.weight, rate: r.rate, transport: r.transport,
      });
    });
    Object.values(grouped).forEach(g => {
      g.avgRate = g.ratedWeight > 0 ? (g.ratedValue / g.ratedWeight) : null;
    });

    // Same width: 100 GSM row first, then other GSMs ascending, then BF
    // ascending, with a plain group always listed just before its coloured
    // (GY) counterpart so the two stay adjacent and easy to compare.
    reelData = Object.values(grouped).sort((a, b) => {
      if (b.size !== a.size) return b.size - a.size;
      const aG = parseFloat(a.gsm) || 0, bG = parseFloat(b.gsm) || 0;
      const a100 = aG === 100 ? 0 : 1, b100 = bG === 100 ? 0 : 1;
      if (a100 !== b100) return a100 - b100;
      if (aG !== bG) return aG - bG;
      const aBf = parseFloat(a.bf) || 0, bBf = parseFloat(b.bf) || 0;
      if (aBf !== bBf) return aBf - bBf;
      return (a.hasColoured ? 1 : 0) - (b.hasColoured ? 1 : 0);
    });
    const totalKg = reelData.reduce((s, r) => s + r.totalWeight, 0) + KATRA_BUFFER_KG;
    const now     = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    setReelSyncStatus('ok', `Live · ${now} · Total ${totalKg.toLocaleString('en-IN')} kg`);
    renderReelStockValue();

    await snapsSync;
    _saveReelSnapshot(reelData);
    renderCriticalReels();
    renderFullReels();
    updateDashboardStock();
  } catch (err) {
    setReelSyncStatus('error', `Error: ${err.message}`);
  }
}

// ── Calendar (last 31 days) + monthly opening/closing ──
let _reelCalSelected = 'live';

function _fmtKg(kg) { return Math.round(kg).toLocaleString('en-IN'); }

// A day's opening = closing of the last recorded day before it.
function _snapOpening(dateKey, snaps) {
  const prior = Object.keys(snaps).filter(k => k < dateKey).sort();
  const pk = prior[prior.length - 1];
  return pk ? { date: pk, kg: _snapTotalKg(snaps[pk].data) } : null;
}

function renderReelDateTabs() {
  const el = document.getElementById('reel-date-tabs');
  if (!el) return;
  const snaps    = _getReelSnaps();
  const todayKey = _localDateKey();

  // 31 days ending today, padded so columns line up with weekdays (Sun first)
  const start = new Date(); start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (SNAP_KEEP_DAYS - 1));
  const cells = [];
  for (let i = 0; i < start.getDay(); i++) cells.push('<div></div>');
  for (let i = 0; i < SNAP_KEEP_DAYS; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key   = _localDateKey(d);
    const snap  = snaps[key];
    const isSel = _reelCalSelected === key;
    const dayLbl = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    let bg = '#F8FAFC', fg = '#CBD5E1', title = `${dayLbl} — no record`;
    if (snap) {
      const close = _snapTotalKg(snap.data);
      const open  = _snapOpening(key, snaps);
      const delta = open ? close - open.kg : 0;
      bg = delta > 0 ? '#DCFCE7' : delta < 0 ? '#FEE2E2' : '#EFF6FF';
      fg = delta > 0 ? '#166534' : delta < 0 ? '#991B1B' : 'var(--navy)';
      title = `${dayLbl} — Opening ${_fmtKg(open ? open.kg : close)} kg · Closing ${_fmtKg(close)} kg`;
    }
    cells.push(`<div title="${title}" ${snap ? `onclick="selectReelDay('${key}')"` : ''}
      style="text-align:center;padding:6px 0;border-radius:6px;font-size:11px;font-weight:${isSel ? 800 : 600};
             background:${isSel ? 'var(--navy)' : bg};color:${isSel ? '#fff' : fg};cursor:${snap ? 'pointer' : 'default'};
             ${key === todayKey && !isSel ? 'box-shadow:inset 0 0 0 2px var(--blue);' : ''}">${d.getDate()}</div>`);
  }
  const rangeLbl = `${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;

  // Month opening = closing of the last recorded day before the month;
  // closing = its last recorded day. Both are kept forever.
  const months = {};
  Object.keys(snaps).sort().forEach(k => {
    const m = k.slice(0, 7);
    if (!months[m]) months[m] = { first: k, last: k };
    months[m].last = k;
  });
  const monthRows = Object.keys(months).sort().reverse().map(m => {
    const { first, last } = months[m];
    const prev    = _snapOpening(first, snaps);
    const openKg  = prev ? prev.kg : _snapTotalKg(snaps[first].data);
    const closeKg = _snapTotalKg(snaps[last].data);
    const delta   = closeKg - openKg;
    const label   = new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    const note    = m === todayKey.slice(0, 7) ? ' <span style="font-size:10px;color:var(--muted)">(so far)</span>' : '';
    const openTip = prev ? `close of ${prev.date}` : `no earlier record — first recorded day (${first})`;
    return `<tr onclick="selectReelDay('${last}')" style="cursor:pointer;border-top:1px solid var(--border)">
      <td style="padding:6px">${label}${note}</td>
      <td style="padding:6px;text-align:right" title="${openTip}">${prev ? '' : '~'}${_fmtKg(openKg)}</td>
      <td style="padding:6px;text-align:right">${_fmtKg(closeKg)}</td>
      <td style="padding:6px;text-align:right;color:${delta > 0 ? 'var(--success)' : delta < 0 ? 'var(--danger)' : 'var(--muted)'}">${delta > 0 ? '+' : ''}${_fmtKg(delta)}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start;width:100%">
      <div class="card" style="padding:12px;flex:0 1 320px;min-width:0;margin:0">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px">
          <div>
            <div style="font-size:12px;font-weight:700;color:var(--navy)">Daily stock</div>
            <div style="font-size:10px;color:var(--muted)">${rangeLbl}</div>
          </div>
          <button class="btn-secondary${_reelCalSelected === 'live' ? ' active' : ''}" style="font-size:11px;padding:3px 10px" onclick="selectReelDay('live')">Live</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;font-size:9px;color:var(--muted);text-align:center;font-weight:700;margin-bottom:3px">
          ${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(x => `<div>${x}</div>`).join('')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px">${cells.join('')}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:8px;line-height:1.5">
          <span style="color:#166534">■</span> stock up &nbsp;<span style="color:#991B1B">■</span> stock down &nbsp;<span style="color:#93C5FD">■</span> no change<br>Tap a day for its opening &amp; closing.
        </div>
      </div>
      <div class="card" style="padding:12px;flex:1 1 280px;min-width:0;margin:0">
        <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:6px">Monthly opening &amp; closing <span style="font-weight:400;color:var(--muted);font-size:10px">— kept permanently</span></div>
        ${monthRows ? `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
          <tr style="color:var(--muted);font-size:10px;text-transform:uppercase">
            <th style="text-align:left;padding:4px 6px">Month</th><th style="text-align:right;padding:4px 6px">Opening kg</th>
            <th style="text-align:right;padding:4px 6px">Closing kg</th><th style="text-align:right;padding:4px 6px">Change</th>
          </tr>${monthRows}</table></div>` : '<div class="empty-state" style="padding:10px">No history yet.</div>'}
      </div>
    </div>`;
}

function selectReelDay(key) {
  _reelCalSelected = key;
  renderReelDateTabs();
  if (key === 'live') { showReelLiveView(); return; }
  const snap = _getReelSnaps()[key];
  if (snap) showReelHistoryView(key, snap);
}

function _yesterday() {
  return _daysAgoKey(1);
}

// Total stock kg for a snapshot's data (matches the live total incl. katra buffer)
function _snapTotalKg(data) {
  if (!data || !data.length) return 0;
  return data.reduce((s, r) => s + (r.totalWeight || 0), 0) + KATRA_BUFFER_KG;
}

// The snapshot immediately before a given date (its opening basis = prior close)
function _prevSnap(dateKey) {
  const snaps = _getReelSnaps();
  const prior = Object.keys(snaps).filter(k => k < dateKey).sort();
  const pk    = prior[prior.length - 1];
  return pk ? { date: pk, snap: snaps[pk] } : null;
}

// Opening vs closing summary card for a given day
function _openCloseSummaryHtml(dateKey, snap) {
  const closingKg = _snapTotalKg(snap.data);
  const prev      = _prevSnap(dateKey);
  const openingKg = prev ? _snapTotalKg(prev.snap.data) : closingKg;
  const delta     = closingKg - openingKg;
  const deltaCol  = delta > 0 ? 'var(--success)' : delta < 0 ? 'var(--danger)' : 'var(--muted)';
  const deltaTxt  = delta === 0 ? 'No change'
    : `${delta > 0 ? '▲ +' : '▼ '}${Math.abs(delta).toLocaleString('en-IN')} kg ${delta > 0 ? 'added' : 'consumed'}`;
  const openLabel = prev
    ? `Opening (close of ${new Date(prev.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})`
    : 'Opening';

  return `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
      <div class="stat-card" style="padding:12px 14px">
        <div class="stat-label">${openLabel}</div>
        <div class="stat-value" style="font-size:17px">${Math.round(openingKg).toLocaleString('en-IN')} <span style="font-size:12px;color:var(--muted)">kg</span></div>
      </div>
      <div class="stat-card" style="padding:12px 14px">
        <div class="stat-label">Closing (this day)</div>
        <div class="stat-value" style="font-size:17px">${Math.round(closingKg).toLocaleString('en-IN')} <span style="font-size:12px;color:var(--muted)">kg</span></div>
      </div>
      <div class="stat-card" style="padding:12px 14px">
        <div class="stat-label">Net Change</div>
        <div class="stat-value" style="font-size:15px;color:${deltaCol}">${deltaTxt}</div>
      </div>
    </div>`;
}

function showReelLiveView() {
  const live = document.getElementById('reel-view-live');
  const hist = document.getElementById('reel-view-history');
  if (live) live.style.display = '';
  if (hist) hist.style.display = 'none';
}

function showReelHistoryView(dateKey, snap) {
  const live = document.getElementById('reel-view-live');
  const hist = document.getElementById('reel-view-history');
  if (live) live.style.display = 'none';
  if (hist) hist.style.display = '';

  const titleEl = document.getElementById('reel-hist-title');
  const timeEl  = document.getElementById('reel-hist-time');
  const listEl  = document.getElementById('reel-hist-list');
  if (!listEl) return;

  const dateLabel = dateKey === _localDateKey()
    ? 'Today\'s Stock (so far)'
    : dateKey === _yesterday()
      ? 'Yesterday\'s Closing Stock'
      : 'Closing Stock — ' + new Date(dateKey + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  if (titleEl) titleEl.textContent = dateLabel;
  if (timeEl && snap.ts) {
    timeEl.textContent = 'Snapshot: ' + new Date(snap.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  if (!snap.data || !snap.data.length) {
    listEl.innerHTML = '<div class="empty-state">No data for this date.</div>';
    return;
  }

  const histData = snap.data;
  const max = Math.max(...histData.map(r => r.count), 1);
  // Opening vs closing stock summary for the day
  const summary = document.createElement('div');
  summary.innerHTML = _openCloseSummaryHtml(dateKey, snap);
  listEl.innerHTML = '';
  listEl.appendChild(summary);
  histData.forEach(r => {
    const status    = getReelStatusFromData(r, histData);
    const pct       = Math.round((r.count / max) * 100);
    const gyNote    = r.hasColoured
      ? `<span style="color:#B45309;font-weight:700"> · 🎨 COLOURED (GY)</span>`
      : '';
    const s = r.size.toString();
    const plainNote = (s === '35' || s === '35.5' || s === '42' || s === '44')
      ? ` · <span style="color:var(--muted)">${r.plain100Count} plain-100</span>`
      : '';

    const item = document.createElement('div');
    item.className = 'reel-item';
    item.innerHTML = `
      <div class="reel-size">${r.size}"</div>
      <div class="reel-bar-wrap"><div class="reel-bar ${status}" style="width:${pct}%"></div></div>
      <div style="flex:1;padding:0 12px">
        <div style="font-size:13px;font-weight:600">${r.count} reels · ${(r.totalWeight || 0).toLocaleString('en-IN')} kg${plainNote}</div>
        <div style="font-size:11px;color:var(--muted)">GSM ${r.gsm} · BF ${r.bf}${gyNote}</div>
      </div>
      <div class="reel-badge ${status}">${status === 'ok' ? 'OK' : status === 'low' ? 'LOW' : '⚠ CRITICAL'}</div>
    `;
    listEl.appendChild(item);
  });
}

// Same criticality logic as getReelStatus but works on any snapshot array
function getReelStatusFromData(r, data) {
  const s = r.size.toString();
  if (s === '35' || s === '35.5') {
    const pool = data.filter(x => x.size.toString() === '35' || x.size.toString() === '35.5')
      .reduce((sum, x) => sum + (x.plain100Count || 0), 0);
    if (pool < MIN_REELS)  return 'critical';
    if (pool === MIN_REELS) return 'low';
    return 'ok';
  }
  if (s === '42' || s === '44') {
    const cnt = data.filter(x => x.size.toString() === s).reduce((sum, x) => sum + (x.plain100Count || 0), 0);
    if (cnt < MIN_REELS)  return 'critical';
    if (cnt === MIN_REELS) return 'low';
    return 'ok';
  }
  return 'ok';
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
    const pool = reelData.filter(x => x.size.toString() === '35' || x.size.toString() === '35.5')
      .reduce((sum, x) => sum + (x.plain100Count || 0), 0);
    if (pool < MIN_REELS)  return 'critical';
    if (pool === MIN_REELS) return 'low';
    return 'ok';
  }

  // 42 and 44: only 100 GSM plain count matters, summed across any other-GSM rows at that width
  if (s === '42' || s === '44') {
    const cnt = reelData.filter(x => x.size.toString() === s).reduce((sum, x) => sum + (x.plain100Count || 0), 0);
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

  const sumPlain100 = sizes => reelData.filter(r => sizes.includes(r.size.toString()))
    .reduce((sum, r) => sum + (r.plain100Count || 0), 0);

  const entries = [
    { label: '35 + 35.5"', count: sumPlain100(['35', '35.5']), note: '100 GSM pooled' },
    { label: '42"',        count: sumPlain100(['42']), note: '100 GSM' },
    { label: '44"',        count: sumPlain100(['44']), note: '100 GSM' },
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
// Each size/GSM group is clickable — expands to show every individual
// lot (sheet row) that makes up the group, with its own editable Rate,
// Transport, Subtotal and GST-inclusive landed cost.
function renderFullReels() {
  const list = document.getElementById('full-reel-list');
  if (!list || !reelData.length) return;
  const max = Math.max(...reelData.map(r => r.count), 1);
  list.innerHTML = '';
  reelData.forEach(r => {
    const key        = _groupKey(r);
    const status      = getReelStatus(r);
    const pct         = Math.round((r.count / max) * 100);
    // Prefer the real weighted-average rate recorded per GSM lot; fall back
    // to the width-only purchase-history approximation when no lot in this
    // size+GSM group has a recorded rate (older stock, captured before this).
    const hasRealRate = r.avgRate != null;
    const dispRate     = hasRealRate ? r.avgRate : getLatestRate(r.size.toString());
    const rateStr      = dispRate ? `· ₹${Math.round(dispRate)}/kg${hasRealRate ? '' : ' (approx)'}` : '';
    const valueStr     = hasRealRate ? ` · ₹${Math.round(r.avgRate * r.totalWeight).toLocaleString('en-IN')}` : '';
    // Groups are now split by coloured status too, so a coloured group is
    // ALL coloured — labelled plainly rather than as an "N of M" fraction.
    const gyNote     = r.hasColoured
      ? `<span style="color:#B45309;font-weight:700"> · 🎨 COLOURED (GY)</span>`
      : '';
    const plainNote  = (r.size.toString() === '35' || r.size.toString() === '35.5')
      ? ` · <span style="color:var(--muted)">${r.plain100Count} plain-100</span>`
      : (r.size.toString() === '42' || r.size.toString() === '44')
        ? ` · <span style="color:var(--muted)">${r.plain100Count} plain-100</span>`
        : '';

    const unratedWeight = r.totalWeight - (r.ratedWeight || 0);
    const rateBtn = unratedWeight > 0.01
      ? `<button class="btn-secondary" style="font-size:11px;padding:3px 8px" onclick="event.stopPropagation();setReelGroupRate('${key.replace(/'/g, "\\'")}')">💰 ${hasRealRate ? 'Set Rate (rest)' : 'Set Rate'}</button>`
      : '';

    const expanded   = reelExpandedGroups.has(key);
    const toggleIcon = expanded ? '▼' : '▶';

    const item = document.createElement('div');
    item.className = 'reel-item';
    item.style.cursor = 'pointer';
    if (r.hasColoured) item.style.background = '#FFFBEB'; // light amber — visually separates coloured groups at a glance
    item.onclick = () => toggleReelGroup(key);
    item.innerHTML = `
      <div class="reel-size" style="display:flex;align-items:center;gap:5px"><span style="font-size:11px;color:var(--muted)">${toggleIcon}</span>${r.size}"</div>
      <div class="reel-bar-wrap"><div class="reel-bar ${status}" style="width:${pct}%"></div></div>
      <div style="flex:1;padding:0 12px">
        <div style="font-size:13px;font-weight:600">${r.count} reels · ${r.totalWeight.toLocaleString('en-IN')} kg ${rateStr}${valueStr}${plainNote}</div>
        <div style="font-size:11px;color:var(--muted)">GSM ${r.gsm} · BF ${r.bf}${gyNote}</div>
      </div>
      ${rateBtn}
      <div class="reel-badge ${status}">${status === 'ok' ? 'OK' : status === 'low' ? 'LOW' : '⚠ CRITICAL'}</div>
    `;
    list.appendChild(item);

    if (expanded) {
      const detail = document.createElement('div');
      detail.style.cssText = 'padding:4px 10px 14px 10px;background:var(--bg);border-radius:8px;margin:-4px 0 10px';
      detail.onclick = e => e.stopPropagation();
      detail.innerHTML = _reelLotsTableHtml(r);
      list.appendChild(detail);
    }
  });
}

function toggleReelGroup(key) {
  if (reelExpandedGroups.has(key)) reelExpandedGroups.delete(key);
  else reelExpandedGroups.add(key);
  renderFullReels();
}

// ── Per-lot detail table (shown when a size/GSM group is expanded) ──
function _reelLotsTableHtml(group) {
  const keyArg = _groupKey(group).replace(/'/g, "\\'");
  const applyAllBtn = group.lots.length > 1
    ? `<button class="btn-secondary" style="font-size:11px;padding:4px 10px;margin:4px 6px 2px"
         onclick="applySameRateToGroup('${keyArg}')">⚡ Apply Same Rate to All ${group.lots.length} Lots</button>`
    : '';
  const header = `
    ${applyAllBtn}
    <div style="overflow-x:auto"><div style="min-width:580px">
      <div style="display:grid;grid-template-columns:1.3fr 1fr 1fr 1fr 1.1fr 0.6fr;gap:8px;font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.3px;padding:8px 6px 4px">
        <div>Lot</div><div>Rate (₹/kg)</div><div>Transport (₹/kg)</div><div>Subtotal</div><div>Incl. 18% GST</div><div></div>
      </div>
      ${group.lots.map(lot => _reelLotRowHtml(lot)).join('')}
    </div></div>`;
  return header;
}

// Sets ONE rate on EVERY lot in a size/GSM group at once — unlike
// setReelGroupRate (fills blanks only), this is an explicit bulk action the
// owner asked for directly, so it overwrites whatever rate each lot had.
// Each lot's own transport figure (if any) is left untouched.
function applySameRateToGroup(key) {
  const r = reelData.find(x => _groupKey(x) === key);
  if (!r || !r.lots || !r.lots.length) return;

  const rateSuggestion = r.avgRate != null ? Math.round(r.avgRate) : '';
  const rateInput = prompt(
    `Apply this rate (₹/kg) to ALL ${r.lots.length} lots of ${r.size}" / GSM ${r.gsm} / BF ${r.bf}${r.hasColoured ? ' / COLOURED (GY)' : ''} ` +
    `(${r.count} reels, ${Math.round(r.totalWeight).toLocaleString('en-IN')} kg).\n\n` +
    `This overwrites any rate already set on these lots.`,
    rateSuggestion
  );
  if (rateInput === null) return;
  const rate = parseFloat(rateInput);
  if (!rate || rate <= 0) { alert('Enter a valid rate greater than 0.'); return; }

  // No need to type a transport figure separately — if any lot in the group
  // already has one recorded, just confirm reusing that same value for all.
  const transportLot  = r.lots.find(l => l.transport > 0);
  const applyTransport = transportLot
    ? confirm(`Also apply ₹${transportLot.transport}/kg transport (same as already recorded on this group) to all ${r.lots.length} lots?`)
    : false;
  const transport = applyTransport ? transportLot.transport : null;

  r.lots.forEach(lot => {
    const lotTransport = applyTransport ? transport : (lot.transport || 0);
    fetch(APPS_SCRIPT_URL, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setReelLotRate', sheetRow: lot.sheetRow, rate, transport: lotTransport }),
    }).catch(() => {});
    lot.rate = rate;
    if (applyTransport) lot.transport = transport;
  });

  r.ratedValue  = rate * r.totalWeight;
  r.ratedWeight = r.totalWeight;
  r.avgRate     = rate;
  reelExpandedGroups.add(_groupKey(r)); // keep this group open after re-render

  renderFullReels();
  renderReelStockValue();
  setTimeout(fetchReelStock, 2500);
}

function _reelLotRowHtml(lot) {
  const rate      = lot.rate || 0;
  const transport = lot.transport || 0;
  const subtotal   = rate + transport;
  const total      = rate * (1 + GST_RATE) + transport;
  const rid = `lot-${lot.sheetRow}`;
  return `
    <div style="display:grid;grid-template-columns:1.3fr 1fr 1fr 1fr 1.1fr 0.6fr;gap:8px;align-items:center;padding:6px;border-top:1px solid var(--border)">
      <div style="font-size:12px">${lot.qty} reel${lot.qty > 1 ? 's' : ''} · ${Math.round(lot.weight * lot.qty).toLocaleString('en-IN')} kg</div>
      <input class="form-input" type="number" min="0" step="0.1" value="${rate || ''}" placeholder="—"
        style="font-size:12px;padding:5px 8px" id="${rid}-rate" oninput="_updateLotCalc(${lot.sheetRow})">
      <input class="form-input" type="number" min="0" step="0.1" value="${transport || ''}" placeholder="—"
        style="font-size:12px;padding:5px 8px" id="${rid}-transport" oninput="_updateLotCalc(${lot.sheetRow})">
      <div id="${rid}-subtotal" style="font-size:12px;font-weight:600">${subtotal ? '₹' + subtotal.toFixed(2) : '—'}</div>
      <div id="${rid}-total" style="font-size:12px;font-weight:700;color:var(--navy)">${total ? '₹' + total.toFixed(2) : '—'}</div>
      <button class="btn-secondary" style="font-size:11px;padding:4px 8px" onclick="saveReelLotRate(${lot.sheetRow})" title="Save this lot">💾</button>
    </div>`;
}

// Recomputes Subtotal / GST-inclusive cost live as the owner types,
// before anything is saved.
function _updateLotCalc(sheetRow) {
  const rid = `lot-${sheetRow}`;
  const rateEl = document.getElementById(`${rid}-rate`);
  const transEl = document.getElementById(`${rid}-transport`);
  if (!rateEl || !transEl) return;
  const rate      = parseFloat(rateEl.value) || 0;
  const transport = parseFloat(transEl.value) || 0;
  const subtotal  = rate + transport;
  const total     = rate * (1 + GST_RATE) + transport;
  const subEl = document.getElementById(`${rid}-subtotal`);
  const totEl = document.getElementById(`${rid}-total`);
  if (subEl) subEl.textContent = subtotal ? '₹' + subtotal.toFixed(2) : '—';
  if (totEl) totEl.textContent = total ? '₹' + total.toFixed(2) : '—';
}

// Saves one lot's Rate + Transport directly (addressed by its sheet row —
// an explicit per-lot edit, so unlike setReelGroupRate this is allowed to
// overwrite whatever was there before).
function saveReelLotRate(sheetRow) {
  const rid = `lot-${sheetRow}`;
  const rateEl  = document.getElementById(`${rid}-rate`);
  const transEl = document.getElementById(`${rid}-transport`);
  if (!rateEl || !transEl) return;
  const rate      = parseFloat(rateEl.value) || 0;
  const transport = parseFloat(transEl.value) || 0;
  if (!rate) { alert('Enter a rate before saving.'); return; }

  fetch(APPS_SCRIPT_URL, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'setReelLotRate', sheetRow, rate, transport }),
  }).catch(() => {});

  // Optimistic local update of the lot and its parent group's weighted average
  const group = reelData.find(g => (g.lots || []).some(l => l.sheetRow === sheetRow));
  if (group) {
    const lot = group.lots.find(l => l.sheetRow === sheetRow);
    const oldValue  = lot.rate > 0 ? lot.rate * lot.weight * lot.qty : 0;
    const oldWeight = lot.rate > 0 ? lot.weight * lot.qty : 0;
    lot.rate      = rate;
    lot.transport = transport;
    group.ratedValue  = (group.ratedValue || 0) - oldValue + rate * lot.weight * lot.qty;
    group.ratedWeight = (group.ratedWeight || 0) - oldWeight + lot.weight * lot.qty;
    group.avgRate     = group.ratedWeight > 0 ? (group.ratedValue / group.ratedWeight) : null;
    reelExpandedGroups.add(_groupKey(group)); // keep this group open after re-render
  }

  renderFullReels();
  renderReelStockValue();
  setTimeout(fetchReelStock, 2500);
}

// ── Total portfolio stock value (only counts lots with a recorded rate) ──
function renderReelStockValue() {
  const el = document.getElementById('reel-total-value');
  if (!el) return;
  const rated = reelData.filter(r => r.avgRate != null);
  if (!rated.length) {
    el.textContent = 'Stock value: no rates recorded yet — expand a size below to enter rates per lot, use "💰 Set Rate", or they\'ll be captured automatically from the next purchase marked received.';
    return;
  }
  const totalValue  = rated.reduce((s, r) => s + r.avgRate * r.totalWeight, 0);
  // Landed cost: each rated lot's rate + 18% GST on the rate, plus its own transport
  const landedValue = reelData.reduce((s, g) => s + (g.lots || []).reduce((ls, lot) =>
    ls + (lot.rate > 0 ? (lot.rate * (1 + GST_RATE) + (lot.transport || 0)) * lot.weight * lot.qty : 0), 0), 0);
  const ratedWeight = rated.reduce((s, r) => s + r.totalWeight, 0);
  const allWeight   = reelData.reduce((s, r) => s + r.totalWeight, 0);
  const coverage    = allWeight > 0 ? Math.round((ratedWeight / allWeight) * 100) : 0;
  el.textContent = `Stock value: ₹${Math.round(totalValue).toLocaleString('en-IN')}` +
    ` · Landed cost (incl. 18% GST + transport): ₹${Math.round(landedValue).toLocaleString('en-IN')}` +
    (coverage < 100 ? ` (${coverage}% of stock has a recorded rate — expand a size below to fill in the rest)` : '');
}

// Posts a rate for a size+GSM group's unrated stock and updates reelData
// in place (optimistic). Shared by the per-row "Set Rate" button and the
// bulk "Enter Stock Rates" modal. Returns the kg that got rated (0 if the
// group was already fully rated or the rate was invalid).
function _applyGroupRate(r, rate) {
  const unratedWeight = r.totalWeight - (r.ratedWeight || 0);
  if (!rate || rate <= 0 || unratedWeight <= 0.01) return 0;

  fetch(APPS_SCRIPT_URL, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'setReelGroupRate', reelSize: r.size, gsm: r.gsm === '—' ? '' : r.gsm,
      bf: r.bf === '—' ? '' : r.bf, coloured: !!r.hasColoured, rate,
    }),
  }).catch(() => {});

  r.ratedValue  = (r.ratedValue || 0) + unratedWeight * rate;
  r.ratedWeight = (r.ratedWeight || 0) + unratedWeight;
  r.avgRate     = r.ratedValue / r.ratedWeight;
  // Mirror onto the group's individual lots too (matches what the backend
  // just did — filled every blank-rate row in this group), so expanding
  // the group right after shows the right numbers without a refetch.
  (r.lots || []).forEach(lot => { if (!(lot.rate > 0)) lot.rate = rate; });
  return unratedWeight;
}

// ── Office: backfill/correct the rate for whatever stock in this size+GSM
// group doesn't have one recorded yet. Never touches a lot that already
// carries a real purchase rate. ──
function setReelGroupRate(key) {
  const r = reelData.find(x => _groupKey(x) === key);
  if (!r) return;
  const unratedWeight = r.totalWeight - (r.ratedWeight || 0);
  if (unratedWeight <= 0.01) { alert('This entire group already has a recorded rate.'); return; }

  const suggestion = r.avgRate != null ? Math.round(r.avgRate) : '';
  const input = prompt(
    `Set rate (₹/kg) for ${r.size}" / GSM ${r.gsm} / BF ${r.bf}${r.hasColoured ? ' / COLOURED (GY)' : ''} stock that doesn't have a rate recorded yet ` +
    `(${Math.round(unratedWeight).toLocaleString('en-IN')} kg of this group's ${Math.round(r.totalWeight).toLocaleString('en-IN')} kg).\n\n` +
    `This will NOT change any lot that already has a real purchase rate.`,
    suggestion
  );
  if (input === null) return;
  const rate = parseFloat(input);
  if (!rate || rate <= 0) { alert('Enter a valid rate greater than 0.'); return; }

  _applyGroupRate(r, rate);
  renderFullReels();
  renderReelStockValue();
  setTimeout(fetchReelStock, 2500);
}

// ── Office: bulk rate entry — lists every current stock group with an
// input next to it, so all the sizes in the stock list can be priced in
// one sitting instead of one prompt() at a time. Groups already fully
// rated (from a real purchase) show read-only, same backfill-only rule
// as the per-row button. ──
function openReelRatesModal() {
  if (!reelData.length) { alert('Stock not loaded yet — wait for the live fetch to finish, then try again.'); return; }
  const list = document.getElementById('reel-rates-list');
  const overlay = document.getElementById('reel-rates-overlay');
  if (!list || !overlay) return;

  list.innerHTML = '';
  reelData.forEach((r, idx) => {
    const unratedWeight = r.totalWeight - (r.ratedWeight || 0);
    const fullyRated = unratedWeight <= 0.01 && r.avgRate != null;

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)';
    row.innerHTML = `
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600">${r.size}" · GSM ${r.gsm} · BF ${r.bf}${r.hasColoured ? ' · <span style="color:#B45309">🎨 COLOURED</span>' : ''}</div>
        <div style="font-size:11px;color:var(--muted)">${r.totalWeight.toLocaleString('en-IN')} kg${
          (!fullyRated && r.avgRate != null) ? ` · ${Math.round(unratedWeight).toLocaleString('en-IN')} kg unrated` : ''
        }</div>
      </div>
      ${fullyRated
        ? `<div style="font-size:13px;font-weight:700;color:var(--success)">✓ ₹${Math.round(r.avgRate)}/kg</div>`
        : `<input class="form-input" type="number" min="0" step="0.1" placeholder="₹/kg" style="width:100px"
             id="rr-input-${idx}" data-idx="${idx}">`
      }
    `;
    list.appendChild(row);
  });

  overlay.style.display = 'flex';
}

function closeReelRatesModal() {
  const overlay = document.getElementById('reel-rates-overlay');
  if (overlay) overlay.style.display = 'none';
}

function saveAllReelRates() {
  const inputs = document.querySelectorAll('#reel-rates-list input[data-idx]');
  let savedGroups = 0, savedKg = 0;
  inputs.forEach(inp => {
    const rate = parseFloat(inp.value);
    if (!rate || rate <= 0) return;
    const r = reelData[parseInt(inp.dataset.idx)];
    if (!r) return;
    const kg = _applyGroupRate(r, rate);
    if (kg > 0) { savedGroups++; savedKg += kg; }
  });

  closeReelRatesModal();
  renderFullReels();
  renderReelStockValue();

  if (savedGroups > 0) {
    alert(`✅ Saved rates for ${savedGroups} size(s) — ${Math.round(savedKg).toLocaleString('en-IN')} kg now valued.`);
    setTimeout(fetchReelStock, 2500);
  }
}

// ── Office: add stock directly from the Reels page (not via Purchase
// Register) — e.g. for an opening-balance correction or a delivery that
// didn't go through a tracked purchase. Always carries a rate so the
// stock value stays accurate going forward. ──
function addReelStockManual() {
  const reelSize = (prompt('Reel width (inches), e.g. 44:') || '').trim();
  if (!reelSize) return;
  const gsm = (prompt('GSM:', '100') || '').trim();
  if (!gsm) return;
  const bf = (prompt('BF:', '18') || '').trim();

  const numReelsStr = prompt('Number of reels to add:', '1');
  if (numReelsStr === null) return;
  const numReels = parseInt(numReelsStr) || 1;

  const weightStr = prompt(`Weight per reel (kg):`);
  if (weightStr === null) return;
  const weightPerReel = parseFloat(weightStr) || 0;
  if (!weightPerReel) { alert('Enter a valid weight.'); return; }

  const rateStr = prompt('Rate paid (₹/kg):');
  if (rateStr === null) return;
  const rate = parseFloat(rateStr) || 0;
  if (!rate) { alert('Enter a valid rate — this is what makes the stock value accurate.'); return; }

  const transportStr = prompt('Transport (₹/kg) — optional, leave blank if none:');
  if (transportStr === null) return;
  const transport = parseFloat(transportStr) || 0;

  fetch(APPS_SCRIPT_URL, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'addReelStock', reelSize, gsm, bf, numReels, weightPerReel, rate, transport }),
  }).catch(() => {});

  alert(`✅ Added ${numReels} reel(s) of ${reelSize}" / GSM ${gsm} @ ₹${rate}/kg to stock.`);
  setTimeout(fetchReelStock, 2500);
}

// ── Dashboard Stock Summary ──
function updateDashboardStock() {
  const sumPlain100 = sizes => reelData.filter(r => sizes.includes(r.size.toString()))
    .reduce((sum, r) => sum + (r.plain100Count || 0), 0);

  const critCount = [
    sumPlain100(['35', '35.5']) < MIN_REELS,
    sumPlain100(['42']) < MIN_REELS,
    sumPlain100(['44']) < MIN_REELS,
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

// ── Aggregated by width only (ignores GSM) — for stock-availability and
// substitute math, where any GSM's paper counts toward filling a
// reel-width need. reelData itself stays split by size+GSM for display. ──
function reelSizesAggregated() {
  const byWidth = {};
  reelData.forEach(r => {
    const k = r.size.toString();
    if (!byWidth[k]) byWidth[k] = { size: r.size, count: 0, totalWeight: 0 };
    byWidth[k].count       += r.count;
    byWidth[k].totalWeight += r.totalWeight;
  });
  return Object.values(byWidth);
}

// ── Check reel availability for a given size ──
// Returns { available: bool, count: number, totalWeight: number }
function checkReelAvailability(reelSize) {
  const sizeStr = reelSize.toString();
  const found   = reelSizesAggregated().find(r => r.size.toString() === sizeStr || Math.floor(r.size).toString() === sizeStr);
  if (!found || found.count === 0) return { available: false, count: 0, totalWeight: 0 };
  return { available: found.count >= MIN_REELS, count: found.count, totalWeight: found.totalWeight };
}

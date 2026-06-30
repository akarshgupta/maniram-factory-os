// ══════════════════════════════════════════════════════════════
// PROD-LEARNING.JS — Staff presence + production rate learning
// Tabs: StaffLog (Date · StaffCount) · ProdPerf (OrderID · Date · Ply · Qty · Staff · RecordedAt)
// ══════════════════════════════════════════════════════════════

const BASELINE_RATE = { 3: 1000, 5: 667, 7: 500 }; // boxes/staff/day baseline

let _staffCache = {}; // { dateStr: count }
let _perfCache  = []; // [{ orderId, date, ply, qty, staff }]

// ── Load from Sheets ──
async function fetchStaffLog() {
  try {
    const url  = `https://sheets.googleapis.com/v4/spreadsheets/${ORDERS_SHEET_ID}/values/${encodeURIComponent(STAFF_LOG_TAB + '!A2:B500')}?key=${API_KEY}`;
    const json = await fetch(url).then(r => r.json());
    _staffCache = {};
    (json.values || []).forEach(r => {
      if (r[0]) _staffCache[r[0]] = parseInt(r[1]) || 0;
    });
  } catch(e) { console.warn('fetchStaffLog:', e); }
}

async function fetchProdPerf() {
  try {
    const url  = `https://sheets.googleapis.com/v4/spreadsheets/${ORDERS_SHEET_ID}/values/${encodeURIComponent(PROD_PERF_TAB + '!A2:F2000')}?key=${API_KEY}`;
    const json = await fetch(url).then(r => r.json());
    _perfCache = [];
    (json.values || []).forEach(r => {
      if (r[0]) _perfCache.push({
        orderId: r[0],
        date:    r[1] || '',
        ply:     parseInt(r[2]) || 3,
        qty:     parseInt(r[3]) || 0,
        staff:   parseInt(r[4]) || 0,
      });
    });
  } catch(e) { console.warn('fetchProdPerf:', e); }
}

// ── Staff Presence ──
function getStaffForDate(ds) {
  return _staffCache[ds] || 0;
}

function logTodayStaff() {
  const inp   = document.getElementById('prod-staff-input');
  const count = parseInt(inp ? inp.value : 0) || 0;
  if (!count || count < 1) { alert('Enter number of staff on floor today.'); return; }

  _staffCache[todayStr] = count;

  fetch(APPS_SCRIPT_URL, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'saveStaff', date: todayStr, count }),
  }).catch(() => {});

  if (inp) inp.style.borderColor = 'var(--success)';
  setTimeout(() => { if (inp) inp.style.borderColor = ''; }, 1200);
  renderPerfWidget();
  if (typeof renderProductionPlan === 'function') renderProductionPlan();
}

// ── Production Performance Recording ──
function recordDeliveredOrder(order) {
  if (!order || !order.date || !order.qty || !order.ply) return;
  if (_perfCache.find(p => p.orderId === order.id)) return; // already recorded

  const s1 = new Date(order.date + 'T00:00:00');
  s1.setDate(s1.getDate() - 1);
  const s1Str = s1.toISOString().split('T')[0];
  const staff  = getStaffForDate(s1Str) || getStaffForDate(order.date) || 0;
  const entry  = {
    orderId: order.id,
    date:    s1Str,
    ply:     parseInt(order.ply) || 3,
    qty:     parseInt(order.qty) || 0,
    staff,
  };

  _perfCache.push(entry);
  if (_perfCache.length > 100) _perfCache.splice(0, _perfCache.length - 100);

  fetch(APPS_SCRIPT_URL, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action:    'saveProdPerf',
      orderId:   entry.orderId,
      date:      entry.date,
      ply:       entry.ply,
      qty:       entry.qty,
      staff:     entry.staff,
      recordedAt: new Date().toISOString(),
    }),
  }).catch(() => {});
}

// ── Learned Rate ──
function getLearnedRate(ply) {
  const p       = parseInt(ply) || 3;
  const entries = _perfCache.filter(e => e.ply === p && e.qty > 0 && e.staff > 0);
  if (entries.length < 3) return null;
  const rates = entries.slice(-20).map(e => e.qty / e.staff);
  return rates.reduce((s, r) => s + r, 0) / rates.length;
}

function getLearnedProductionDays(ply, qty) {
  const p    = parseInt(ply) || 3;
  const q    = parseInt(qty) || 0;
  const rate = getLearnedRate(p);
  if (!rate) return PRODUCTION_DAYS.calc(p, q);
  const staff = getStaffForDate(todayStr) || 3;
  return Math.max(1, Math.ceil(q / (rate * staff)));
}

// ── Performance Summary ──
function getPerfSummary() {
  if (!_perfCache.length) return {};
  const byPly = {};
  _perfCache.slice(-30).forEach(e => {
    if (!e.staff || !e.qty) return;
    if (!byPly[e.ply]) byPly[e.ply] = [];
    byPly[e.ply].push(e.qty / e.staff);
  });
  const summary = {};
  Object.entries(byPly).forEach(([ply, rates]) => {
    const avg  = Math.round(rates.reduce((s, r) => s + r, 0) / rates.length);
    const base = BASELINE_RATE[ply] || 1000;
    summary[ply] = { rate: avg, dataPoints: rates.length, vsBaseline: Math.round((avg / base - 1) * 100) };
  });
  return summary;
}

// ── UI Widgets ──
function renderPerfWidget() {
  const el = document.getElementById('prod-perf-widget');
  if (!el) return;
  const todayStaff = getStaffForDate(todayStr);
  const summary    = getPerfSummary();
  const plies      = Object.keys(summary);
  const staffLine  = todayStaff > 0
    ? `<span style="color:var(--success);font-weight:700">${todayStaff} staff logged today</span>`
    : `<span style="color:var(--warn)">No staff logged for today yet</span>`;

  if (!plies.length) {
    el.innerHTML = `<div style="font-size:12px;color:var(--muted)">${staffLine} · No performance data yet.</div>`;
    return;
  }
  const rows = plies.map(ply => {
    const d   = summary[ply];
    const dir = d.vsBaseline >= 0 ? `↑ ${d.vsBaseline}%` : `↓ ${Math.abs(d.vsBaseline)}%`;
    const col = d.vsBaseline >= 0 ? 'var(--success)' : 'var(--danger)';
    return `<span style="font-size:11px;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:3px 8px;margin-right:4px">
      <strong>${ply}ply</strong> ${d.rate.toLocaleString('en-IN')} boxes/staff/day
      <span style="color:${col}">${dir}</span>
      <span style="color:var(--muted)"> (${d.dataPoints} orders)</span>
    </span>`;
  }).join('');
  el.innerHTML = `<div style="font-size:11px;color:var(--muted);margin-bottom:4px">Learned Rate · ${staffLine}</div><div>${rows}</div>`;
}

function initStaffWidget() {
  const inp = document.getElementById('prod-staff-input');
  if (!inp) return;
  const saved = getStaffForDate(todayStr);
  if (saved) inp.value = saved;
  renderPerfWidget();
}

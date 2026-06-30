// ══════════════════════════════════════════════════════════════
// PROD-LEARNING.JS — Staff presence tracking + production rate learning
// ══════════════════════════════════════════════════════════════

const LS_STAFF_LOG = 'mi_staff_log_v1'; // { dateStr: count }
const LS_PROD_PERF = 'mi_prod_perf_v1'; // [{ orderId, date, ply, qty, staff }]

// Hardcoded baseline rates (boxes/staff/day) — learned rates override these
const BASELINE_RATE = { 3: 1000, 5: 667, 7: 500 };

// ── Staff Presence ──
function loadStaffLog() {
  try { return JSON.parse(localStorage.getItem(LS_STAFF_LOG) || '{}'); } catch { return {}; }
}

function getStaffForDate(ds) {
  return loadStaffLog()[ds] || 0;
}

function logTodayStaff() {
  const inp   = document.getElementById('prod-staff-input');
  const count = parseInt(inp ? inp.value : 0) || 0;
  if (!count || count < 1) { alert('Enter number of staff on floor today.'); return; }
  const log   = loadStaffLog();
  log[todayStr] = count;
  localStorage.setItem(LS_STAFF_LOG, JSON.stringify(log));

  // Provide instant feedback and refresh the perf widget
  if (inp) inp.style.borderColor = 'var(--success)';
  setTimeout(() => { if (inp) inp.style.borderColor = ''; }, 1200);
  renderPerfWidget();
  if (typeof renderProductionPlan === 'function') renderProductionPlan();
}

// ── Production Performance Recording ──
function loadProdPerf() {
  try { return JSON.parse(localStorage.getItem(LS_PROD_PERF) || '[]'); } catch { return []; }
}

// Called when an order is marked Delivered (from dispatch.js or calendar.js)
function recordDeliveredOrder(order) {
  if (!order || !order.date || !order.qty || !order.ply) return;
  const perf = loadProdPerf();
  if (perf.find(p => p.orderId === order.id)) return; // already recorded

  // Stage 1 = day before delivery
  const s1 = new Date(order.date + 'T00:00:00');
  s1.setDate(s1.getDate() - 1);
  const s1Str = s1.toISOString().split('T')[0];
  const staff = getStaffForDate(s1Str) || getStaffForDate(order.date) || 0;

  perf.push({
    orderId: order.id,
    date:    s1Str,
    ply:     parseInt(order.ply) || 3,
    qty:     parseInt(order.qty) || 0,
    staff:   staff,
  });

  // Keep last 100 entries
  if (perf.length > 100) perf.splice(0, perf.length - 100);
  localStorage.setItem(LS_PROD_PERF, JSON.stringify(perf));
}

// ── Learned Rate ──
// Returns boxes per staff per day for a given ply, based on recent history.
// Returns null if < 3 data points exist (caller should fall back to baseline).
function getLearnedRate(ply) {
  const p       = parseInt(ply) || 3;
  const entries = loadProdPerf().filter(e => e.ply === p && e.qty > 0 && e.staff > 0);
  if (entries.length < 3) return null;
  const rates = entries.slice(-20).map(e => e.qty / e.staff);
  return rates.reduce((s, r) => s + r, 0) / rates.length;
}

// Get effective production days for an order using learned data + today's staff
function getLearnedProductionDays(ply, qty) {
  const p     = parseInt(ply) || 3;
  const q     = parseInt(qty) || 0;
  const rate  = getLearnedRate(p); // boxes/staff/day or null
  if (!rate) return PRODUCTION_DAYS.calc(p, q); // not enough data, use hardcoded

  const staff = getStaffForDate(todayStr) || 3;
  const days  = Math.ceil(q / (rate * staff));
  return Math.max(1, days);
}

// Returns { ply: { rate, staff, dataPoints, vsBaseline } } for display
function getPerfSummary() {
  const perf = loadProdPerf();
  if (!perf.length) return {};

  const byPly = {};
  perf.slice(-30).forEach(e => {
    if (!e.staff || !e.qty) return;
    if (!byPly[e.ply]) byPly[e.ply] = [];
    byPly[e.ply].push(e.qty / e.staff); // boxes/staff/day
  });

  const summary = {};
  Object.entries(byPly).forEach(([ply, rates]) => {
    const avg = Math.round(rates.reduce((s, r) => s + r, 0) / rates.length);
    const base = BASELINE_RATE[ply] || 1000;
    summary[ply] = {
      rate:        avg,
      dataPoints:  rates.length,
      vsBaseline:  Math.round((avg / base - 1) * 100),
    };
  });
  return summary;
}

// ── UI: Performance Widget ──
function renderPerfWidget() {
  const el = document.getElementById('prod-perf-widget');
  if (!el) return;

  const todayStaff = getStaffForDate(todayStr);
  const summary    = getPerfSummary();
  const plies      = Object.keys(summary);

  const staffLine = todayStaff > 0
    ? `<span style="color:var(--success);font-weight:700">${todayStaff} staff logged today</span>`
    : `<span style="color:var(--warn)">No staff logged for today yet</span>`;

  if (!plies.length) {
    el.innerHTML = `<div style="font-size:12px;color:var(--muted)">${staffLine} · No performance data yet — starts learning after first deliveries.</div>`;
    return;
  }

  const rows = plies.map(ply => {
    const d   = summary[ply];
    const dir = d.vsBaseline >= 0 ? `↑ ${d.vsBaseline}%` : `↓ ${Math.abs(d.vsBaseline)}%`;
    const col = d.vsBaseline >= 0 ? 'var(--success)' : 'var(--danger)';
    return `<span style="font-size:11px;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:3px 8px;margin-right:4px">
      <strong>${ply}ply</strong> ${d.rate.toLocaleString('en-IN')} boxes/staff/day <span style="color:${col}">${dir}</span>
      <span style="color:var(--muted)"> (${d.dataPoints} orders)</span>
    </span>`;
  }).join('');

  el.innerHTML = `<div style="font-size:11px;color:var(--muted);margin-bottom:4px">Learned Production Rate · ${staffLine}</div><div>${rows}</div>`;
}

// Initialise the staff input with today's saved value
function initStaffWidget() {
  const inp = document.getElementById('prod-staff-input');
  if (!inp) return;
  const saved = getStaffForDate(todayStr);
  if (saved) inp.value = saved;
  renderPerfWidget();
}

// ══════════════════════════════════════════════════════════════
// DELIVERY-LEARNING.JS — Learn actual order→delivery lead times
//
// Every time an order is marked Delivered we record how many days it
// actually took (orderDate → delivered date), tagged with the client
// and priority. After a warm-up period (≥15 days of history AND enough
// samples) the system starts predicting a realistic delivery lead per
// client, adjusted for priority, from that historical data.
// ══════════════════════════════════════════════════════════════

const LS_DELIVERY_LEADS = 'mi_delivery_leads_v1';
const LEARN_WARMUP_DAYS  = 15; // days of history before we trust predictions
const LEARN_MIN_SAMPLES  = 5;  // minimum recorded deliveries before predicting

function _loadLeads() {
  try { return JSON.parse(localStorage.getItem(LS_DELIVERY_LEADS) || '[]'); }
  catch { return []; }
}
function _saveLeads(list) {
  try { localStorage.setItem(LS_DELIVERY_LEADS, JSON.stringify(list)); } catch {}
}

function _daysBetween(a, b) {
  const d1 = new Date(a + 'T00:00:00');
  const d2 = new Date(b + 'T00:00:00');
  if (isNaN(d1) || isNaN(d2)) return null;
  return Math.round((d2 - d1) / 86400000);
}

// Called when an order flips to Delivered.
function recordDeliveryLead(order) {
  if (!order || !order.id || !order.orderDate) return;
  const deliveredDate = new Date().toISOString().split('T')[0];
  const leadDays = _daysBetween(order.orderDate, deliveredDate);
  if (leadDays === null || leadDays < 0 || leadDays > 365) return; // ignore nonsense

  const list = _loadLeads();
  if (list.some(l => l.orderId === order.id)) return; // already recorded

  list.push({
    orderId:       order.id,
    client:        order.customer || '',
    priority:      order.priority || 'Normal',
    ply:           order.ply || '',
    qty:           order.qty || 0,
    orderDate:     order.orderDate,
    deliveredDate,
    leadDays,
    recordedAt:    new Date().toISOString(),
  });
  if (list.length > 1000) list.splice(0, list.length - 1000);
  _saveLeads(list);
}

function _avg(arr) { return arr.reduce((s, n) => s + n, 0) / arr.length; }
function _median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Overall learning status — used to show "learning" vs "ready".
function getDeliveryLearningStatus() {
  const list = _loadLeads();
  if (!list.length) return { ready: false, samples: 0, daysOfData: 0 };
  const firstDate = list.map(l => l.deliveredDate).sort()[0];
  const daysOfData = _daysBetween(firstDate, new Date().toISOString().split('T')[0]) || 0;
  const ready = daysOfData >= LEARN_WARMUP_DAYS && list.length >= LEARN_MIN_SAMPLES;
  return { ready, samples: list.length, daysOfData };
}

// Predict a delivery lead (in days) for a client + priority.
// Returns { ready, days, basedOn, sampleSize, learning:{samples,daysOfData} }
function getPredictedLeadDays(client, priority) {
  const status = getDeliveryLearningStatus();
  if (!status.ready) {
    return { ready: false, learning: status };
  }

  const list = _loadLeads();
  const clientLeads = list.filter(l => client && l.client.toLowerCase() === client.toLowerCase());

  let sample, basedOn;
  if (clientLeads.length >= 3) {
    // Prefer this client's own history; prefer same-priority subset if it's big enough
    const samePri = clientLeads.filter(l => (l.priority || 'Normal') === (priority || 'Normal'));
    if (samePri.length >= 3) { sample = samePri; basedOn = `${client} · ${priority}`; }
    else                     { sample = clientLeads; basedOn = `${client} (all priorities)`; }
  } else {
    // Not enough client history — fall back to the global picture, priority-adjusted
    const samePri = list.filter(l => (l.priority || 'Normal') === (priority || 'Normal'));
    sample  = samePri.length >= LEARN_MIN_SAMPLES ? samePri : list;
    basedOn = samePri.length >= LEARN_MIN_SAMPLES ? `all clients · ${priority}` : 'all clients';
  }

  const leadVals = sample.map(l => l.leadDays);
  // Median resists the odd very-late order better than a plain mean
  const days = Math.max(1, Math.round(_median(leadVals)));
  return { ready: true, days, basedOn, sampleSize: sample.length };
}

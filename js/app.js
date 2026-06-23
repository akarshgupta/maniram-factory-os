// ══════════════════════════════════════════════════════════════
// APP.JS — Navigation, Utils, Init
// ══════════════════════════════════════════════════════════════

// ── Utils ──
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escStr(s) {
  return s.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// ── Navigation ──
const pageTitles = {
  dashboard: 'Dashboard',
  calendar:  'Order Calendar',
  orders:    'Orders',
  reels:     'Reel Stock',
  clients:   'Clients & Product Master',
  reminders: '🔔 Reminders',
  purchase:  '🛒 Purchase Register',
};

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item, .bnav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.querySelectorAll('.nav-item, .bnav-item').forEach(n => {
    if (n.getAttribute('onclick') && n.getAttribute('onclick').includes("'" + id + "'")) n.classList.add('active');
  });
  document.getElementById('page-title').textContent = pageTitles[id] || id;

  if (id === 'calendar')  renderCalendar();
  if (id === 'orders')    { renderOrders(); refreshOrderId(); }
  if (id === 'clients')   renderClients();
  if (id === 'reminders') computeReminders();
  if (id === 'purchase')  { renderPurchaseList(); renderRateHistory(); initPurchaseForm(); }
}

// ── Topbar Date ──
document.getElementById('topbar-date').textContent = today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// ── Close autocomplete on outside click ──
document.addEventListener('click', e => {
  const grp = document.getElementById('customer-group');
  if (grp && !grp.contains(e.target)) {
    document.getElementById('customer-dropdown').style.display = 'none';
  }
});

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════
function init() {
  initClients();
  initPurchases();
  renderCalendar();
  renderClients();
  fetchOrders();
  fetchReelStock();

  // Auto-refresh intervals
  setInterval(fetchReelStock,    10 * 60 * 1000); // every 10 min
  setInterval(fetchOrders,        5 * 60 * 1000); // every 5 min
  setInterval(computeReminders,  60 * 60 * 1000); // every 1 hr
}

// Run after DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

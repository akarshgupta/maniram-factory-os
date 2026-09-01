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
  dashboard:   'Dashboard',
  calendar:    'Order Calendar',
  orders:      'Orders',
  production:  '🏭 Production Plan',
  reels:       'Reel Stock',
  clients:     'Clients & Product Master',
  leads:       '📞 Leads',
  reminders:   '🔔 Reminders',
  purchase:    '🛒 Purchase Register',
  receivables: '💰 Receivables',
  tally:       '📊 Tally Sync',
  analytics:   '📊 Analytics',
  ratecalc:    '📐 Rate Calculator',
  invoicing:   '🧾 Invoicing',
  expenses:    '💸 Expense Tracker',
  registers:   '📋 Production Register',
  dailyreport: '🗓️ Daily Report',
  svlog:       '📝 Supervisor Register',
  ledger:      '📒 Party Ledger',
  pipeline:    '🚦 Pipeline Board',
  costing:     '🧮 Job Costing',
  processcosting: '⚗️ Process Costing',
  deckle:      '📏 Deckle Optimizer',
};

const LS_LAST_PAGE = 'mi_last_page_v1';

function showPage(id) {
  const target = document.getElementById('page-' + id);
  if (!target) return; // unknown page id — leave whatever's currently showing alone
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item, .bnav-item').forEach(n => n.classList.remove('active'));
  target.classList.add('active');
  document.querySelectorAll('.nav-item, .bnav-item').forEach(n => {
    if (n.getAttribute('onclick') && n.getAttribute('onclick').includes("'" + id + "'")) n.classList.add('active');
  });
  document.getElementById('page-title').textContent = pageTitles[id] || id;
  localStorage.setItem(LS_LAST_PAGE, id);

  if (id === 'calendar')    renderCalendar();
  if (id === 'orders')      { fetchClients().then(() => {}); renderOrders(); refreshOrderId(); }
  if (id === 'production')  renderProductionPlan();
  if (id === 'reels')       { fetchReelStock(); renderReelDateTabs(); }
  if (id === 'clients')     { fetchClients().then(ok => { if (ok) renderClients(); }); renderClients(); }
  if (id === 'leads')       loadLeadsPage();
  if (id === 'reminders')   computeReminders();
  if (id === 'purchase')    { renderPurchaseList(); renderRateHistory(); initPurchaseForm(); }
  if (id === 'receivables') renderReceivables();
  if (id === 'tally')       { initTallyExportCfg(); fetchTallySync(); }
  if (id === 'analytics')   renderAnalytics();
  if (id === 'ratecalc')    { onPlyChange(); renderQuotationsList(); }
  if (id === 'invoicing')   renderInvoicingPage();
  if (id === 'expenses')    renderExpensesPage();
  if (id === 'registers')   loadRegisters();
  if (id === 'dailyreport') loadDailyReport();
  if (id === 'svlog')       loadSupervisorLog();
  if (id === 'ledger')      renderLedger();
  if (id === 'pipeline')    renderPipelineBoard();
  if (id === 'costing')     initJobCosting();
  if (id === 'processcosting') initProcessCosting();
  if (id === 'deckle')      initDeckle();
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
async function init() {
  // Start non-blocking fetches immediately
  renderCalendar();
  const ordersReady = fetchOrders(); // awaited later, once, just to gate the page restore below
  fetchReelStock();

  // Load clients + purchases from Sheets in parallel (may migrate from localStorage once)
  await Promise.all([initClients(), initPurchases()]);

  // Initialise localStorage-backed modules
  initInvoices();
  initExpenses();
  initPayments();
  initQuotations();
  initChallans();
  initOrderLog();
  initLeads();
  fetchLeads().then(ok => { if (ok) { updateLeadsBadge(); renderDashboardLeadsBanner(); } });
  updateLeadsBadge();
  renderDashboardLeadsBanner();

  // Catch any challans that predate this feature (or were made on another
  // device) and still have no invoice — see autoInvoiceChallans() in invoices.js.
  if (typeof autoInvoiceChallans === 'function') autoInvoiceChallans();

  // Safe to render now — CLIENTS and purchases arrays are populated
  renderClients();

  // Supervisor log — after initChallans() so auto-created challans (see
  // _svAutoCreateChallans in supervisor-log.js) land on top of the loaded
  // list instead of being overwritten by it.
  if (typeof fetchSupervisorLog === 'function') fetchSupervisorLog();

  // Restore whichever page the user was on before a refresh, instead of
  // always landing back on Dashboard. Waits for orders to finish loading
  // first — several pages (Ledger, Receivables, Analytics, Registers,
  // Pipeline…) render straight from the `orders` array the one time
  // showPage() calls them, with nothing else re-triggering that render
  // once the data arrives, unlike Dashboard which updates itself as
  // fetches complete regardless of what page is showing.
  await ordersReady;
  const lastPage = localStorage.getItem(LS_LAST_PAGE);
  if (lastPage && lastPage !== 'dashboard') showPage(lastPage);

  // Auto-refresh intervals
  setInterval(fetchReelStock,    10 * 60 * 1000); // every 10 min
  setInterval(fetchOrders,        5 * 60 * 1000); // every 5 min
  setInterval(fetchClients,      10 * 60 * 1000); // every 10 min
  setInterval(computeReminders,  60 * 60 * 1000); // every 1 hr
  setInterval(() => fetchLeads().then(ok => { if (ok) { renderLeadsPage(); updateLeadsBadge(); renderDashboardLeadsBanner(); } }), 10 * 60 * 1000); // every 10 min
  if (typeof fetchSupervisorLog === 'function') setInterval(fetchSupervisorLog, 5 * 60 * 1000); // every 5 min — also drives auto-challan creation
}

// Run after DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

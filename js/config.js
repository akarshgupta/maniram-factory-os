// ══════════════════════════════════════════════════════════════
// CONFIG.JS — Constants, Sheet IDs, API Keys
// ══════════════════════════════════════════════════════════════

// ── Maniram Industries Database (Google Drive folder ID: 1ed7WrLZkohqjK-BLt6hL9nfE1jTt8cLO) ──
const REEL_SHEET_ID      = '1tcE8W_1q-tkXn6DZ9DX6darBnUpwcQtFZqA9sUbtjR8'; // Reel Stock
const ORDERS_SHEET_ID    = '1JVWfffLht7X_mGOyQb0QK1cB3vx68TTM1yx9pGZbb30'; // Orders
const CUSTOMERS_SHEET_ID = '1QZ-tp9RvzPX_kcK-uTuc8EsdG6RGzo8L8o6Me9OZy2A'; // Customers
const PRODUCTS_SHEET_ID  = '1fOsPGG5bvt9L2sG-l5dfHKzDjL7-pBshlzL6apzCJQI'; // Products
const DISPATCH_SHEET_ID  = '15BIRmrIyu4m76c_-9xau_SYC_BxsvR-kM6WadQKDV60'; // Dispatch
const STAFF_LOG_SHEET_ID = '14AYCaA4uQ7rSnfuOfG0Joff-LmWVCYVb9Wc_95Zr60k'; // StaffLog
const PROD_PERF_SHEET_ID = '1cK7sbz1pwsSJOD6ZBgdj12CN3Gznw9Y37KN-U3_hTwQ'; // ProdPerf
const SNAPSHOT_SHEET_ID  = '1bSoFhhJ4_RzD8YiFhZFAA8sW_r1ItwC_EAP-6fPdl9k'; // Reel Snapshot Log
const LEDGER_SHEET_ID    = '1dZKC2EtU9DAzGruKzeDIIM3XgWsqYVk2GqjHzfthdkE'; // Ledger July
const PROD_LOG_SHEET_ID  = '1T3mED9PNC9twyc1O6S4_4XBB1aOsd6-BqTGwLopgkYU'; // Maniram Production Log
const APPS_SCRIPT_URL    = 'https://script.google.com/macros/s/AKfycbxCrZW5upLG7YWixwxaLq1y13opChsJdkcz-4sn2h9LwyuKSgW3mVFgb9KoDdq8lQP6/exec';
const API_KEY            = 'AIzaSyBz9doIxDqLCmUd5mKjemM9ui3tVJBD34k';
const REEL_TAB           = 'Stock';
const ORDERS_TAB         = 'Orders';
const CUSTOMERS_TAB      = 'Sheet1'; // Customers spreadsheet — tab is Sheet1
const PRODUCTS_TAB       = 'Sheet1'; // Products spreadsheet — tab is Sheet1
const DISPATCH_TAB       = 'Sheet1'; // Dispatch spreadsheet — tab is Sheet1
const STAFF_LOG_TAB      = 'Sheet1'; // StaffLog spreadsheet — tab is Sheet1
const PROD_PERF_TAB      = 'Sheet1'; // ProdPerf spreadsheet — tab is Sheet1
const PURCHASES_TAB      = 'Purchases';
const TALLY_SYNC_TAB     = 'TallySync';

// legacy alias so any old reference to CLIENTS_TAB still works
const CLIENTS_TAB       = 'Customers';

const NOTION_CLIENTS_DB = '5be5433513b64fc9a14fa539ca06c475'; // Maniram Clients database

const KATRA_BUFFER_KG  = 5000;
const MAX_DAILY_KG     = 1500;  // max box weight (kg) ready per day
const CRITICAL_SIZES   = ['35.5', '44', '42', '35'];
const MIN_REELS        = 4;

const LS_ORDER_HISTORY = 'mi_order_history';
const LS_REMINDER_SENT = 'mi_reminder_sent';
const LS_CLIENTS       = 'mi_clients_v2';
const LS_PURCHASES     = 'mi_purchases_v1';

const today       = new Date();
const todayStr    = today.toISOString().split('T')[0];
const tomorrowStr = new Date(today.getTime() + 86400000).toISOString().split('T')[0];

const COLOUR_HEX = {
  red:    '#E74C3C',
  blue:   '#2980B9',
  green:  '#27AE60',
  orange: '#E67E22',
  yellow: '#F1C40F',
  black:  '#2C3E50',
  white:  '#ECF0F1',
  pink:   '#E91E63',
};

const STATUS_CLASS = {
  'New':           'status-new',
  'In Production': 'status-production',
  'Ready':         'status-ready',
  'Dispatched':    'status-dispatched',
  'Delivered':     'status-delivered',
  'Cancelled':     'status-cancelled',
};

const PRODUCTION_DAYS = {
  calc(ply, qty) {
    const p = parseInt(ply) || 3;
    if (p >= 5) return 2;
    return (qty <= 300) ? 1 : 2;
  }
};
const MAX_SIMULTANEOUS_ORDERS = 3;

// ── Auth recovery code — change this to something only you know ──
const ADMIN_RESET_CODE = 'MANIRAM-RESET-2024';

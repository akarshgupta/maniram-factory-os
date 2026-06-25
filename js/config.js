// ══════════════════════════════════════════════════════════════
// CONFIG.JS — Constants, Sheet IDs, API Keys
// ══════════════════════════════════════════════════════════════

// ── Maniram Industries Database (Google Drive folder) ──
const REEL_SHEET_ID    = '1tcE8W_1q-tkXn6DZ9DX6darBnUpwcQtFZqA9sUbtjR8'; // Reel Stock (in MI Database folder)
const ORDERS_SHEET_ID  = '1s-dvo3qF-1Ei571bcN9ytmVhU7IRs5O41CWq7_Srr0A'; // Maniram Orders (in MI Database folder)
const SNAPSHOT_SHEET_ID = '1bSoFhhJ4_RzD8YiFhZFAA8sW_r1ItwC_EAP-6fPdl9k'; // Reel Snapshot Log (in MI Database folder)
const APPS_SCRIPT_URL  = 'https://script.google.com/macros/s/AKfycbzDUXMfqaw4wvGYhq7_ui33eAnSLc25VVwD4V9Xl2UKaYJwU16RDmHoFY1D_Hjmw6BN/exec';
const API_KEY          = 'AIzaSyBz9doIxDqLCmUd5mKjemM9ui3tVJBD34k';
const REEL_TAB         = 'Stock';
const ORDERS_TAB       = 'Sheet1';

const KATRA_BUFFER_KG  = 5000;
const CRITICAL_SIZES   = ['35.5', '44', '42', '35'];
const MIN_REELS        = 4;

const LS_ORDER_HISTORY = 'mi_order_history';
const LS_REMINDER_SENT = 'mi_reminder_sent';
const LS_CLIENTS       = 'mi_clients_v2';

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
  'Cancelled':     'status-delivered',
};

// Production rules
const PRODUCTION_DAYS = {
  calc(ply, qty) {
    const p = parseInt(ply) || 3;
    if (p >= 5) return 2;
    return (qty <= 300) ? 1 : 2;
  }
};
const MAX_SIMULTANEOUS_ORDERS = 3;

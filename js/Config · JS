// ══════════════════════════════════════════════════════════════
// CONFIG.JS — Constants, Sheet IDs, API Keys
// ══════════════════════════════════════════════════════════════

const REEL_SHEET_ID    = '1cgyZbdG--0Qzb2LtJOIfOwnUCAxRwNh66452cYr3M7M';
const ORDERS_SHEET_ID  = '1wPi78kRtpmHMffp5VMIiR7oBmPhkrW8T2Sd5TpBWjic';
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
  // { ply, qty } → days
  calc(ply, qty) {
    const p = parseInt(ply) || 3;
    if (p >= 5) return 2;
    // 3-ply: ≤300 same day (1 day), >300 = 2 days
    return (qty <= 300) ? 1 : 2;
  }
};
const MAX_SIMULTANEOUS_ORDERS = 3;

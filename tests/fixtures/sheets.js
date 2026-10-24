// Made-up sheet data for the integration tests. The repo is public, so
// real customer names, rates and phone numbers must never be copied here.
// Shapes match the live sheets (same headers and column order).
'use strict';

const XSS = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';

const ORDERS = [
  ['Order ID', 'Customer', 'Product', 'Box Specs', 'Ply', 'Colour', 'Weight', 'Quantity', 'Rate', 'Delivery Date', 'Status', 'Priority', 'Reel Size', 'Reserved KG', 'Remarks', 'TwoPart', 'OrderDate'],
  ['MIORD201', 'Test Traders', 'Alpha Box', '20*14*28', '3', 'Red', '600', '2000', '30', '', 'New', 'Normal', '42', '0', '', 'FALSE', '01/10/2026'],
  ['MIORD202', 'Test Traders', 'Alpha Box', '20*14*28', '3', 'Red', '600', '3000', '31', '', 'New', 'Normal', '42', '0', '', 'FALSE', '10/10/2026'],
  ['MIORD203', 'Sample Foods', 'Beta Carton', '17*11.5*27', '5', 'Blue', '520', '1000', '27.5', '', 'In Production', 'Normal', '', '0', '', 'FALSE', '05/10/2026'],
  ['MIORD204', 'Demo Paper', 'Gamma Plain', '26*13*22', '3', '', '640', '500', '', '', 'New', 'Normal', '', '0', 'Added from the staff portal — rate not set', 'FALSE', '20/10/2026'],
  // Hostile text typed into the sheet — must show as text, never run
  ['MIORD205', 'Evil Co ' + XSS, 'Hack ' + XSS, '10*10*10', '3', XSS, '200', '100', '10', '', 'New', 'Normal', '', '0', XSS, 'FALSE', '21/10/2026'],
  ['MIORD150', 'Old Client', 'Done Box', '18*14*30', '3', 'Blue', '630', '500', '36', '', 'Delivered', 'Normal', '', '0', '', 'FALSE', '01/09/2026'],
];

const DISPATCH = [
  ['Timestamp', 'Date', 'Party', 'Pieces', 'Size', 'Weight/pc', 'Product', 'Order ID', 'Notes', 'Vehicle', 'Trip'],
  ['10/20/2026 10:00:00', '10/20/2026', 'Test Traders', '500', '20*14*28', '600', 'Alpha Box', 'MIORD201', '', 'UP93XX0001', 'T1'],
  ['10/20/2026 10:00:03', '10/20/2026', 'Sample Foods', '300', '17*11.5*27', '520', 'Beta Carton', 'MIORD203', '', 'UP93XX0001', 'T1'],
  ['10/21/2026 09:00:00', '10/21/2026', 'Test Traders', '200', '20*14*28', '605', 'Alpha Box', '', 'Short by 5 ' + XSS, '', ''],
];

const PRODUCTION = [
  ['Timestamp', 'Date', 'Reel1 W', 'Reel1 GSM', 'Reel2 W', 'Reel2 GSM', 'Cut', 'Ply/Pcs', 'Sheets', 'Rolls'],
  ['10/20/2026 08:00:00', '10/20/2026', '42', '120', '', '', '20*14*28', '3 ply 1000', '1050', '2'],
];

const VEHICLES = [
  ['Vehicle No', 'Type', 'Owner', 'Owner Phone', 'Driver', 'Driver Phone', 'Added'],
  ['UP93XX0001', 'Tempo', 'Test Owner', '9000000001', 'Test Driver', '9000000002', '20/10/2026'],
  ['UP93XX0002', 'Passenger CNG', 'Owner ' + XSS, '', 'Driver Two', '', '21/10/2026'],
];

// Backup tabs (made by Code.gs backupRecords) — used by the restore tests
const BK_HEAD = ['Key', 'Date', 'Party', 'Orders', 'Qty', 'Amount', 'Updated', 'Deleted', 'Record'];
const CHALLANS_BACKUP = [BK_HEAD,
  ['DC-901/26', '2026-10-20', 'Test Traders', 'MIORD201', '500', '15000', '', '', JSON.stringify({ dcNum: 'DC-901/26', date: '2026-10-20', orderId: 'MIORD201', customer: 'Test Traders', product: 'Alpha Box', size: '20*14*28', qty: 500, rate: 30, svTs: '10/20/2026 10:00:00', createdAt: '2026-10-20T04:30:00Z' })],
  ['DC-902/26', '2026-10-20', 'Evil Co', '', '5', '0', '', '', JSON.stringify({ dcNum: 'DC-902/26', date: '2026-10-20', customer: 'Evil Co ' + XSS, product: XSS, qty: 5, rate: 1 })],
  ['DC-903/26', '2026-10-20', 'Test Traders', '', '1', '0', '', 'TRUE', JSON.stringify({ dcNum: 'DC-903/26', date: '2026-10-20', customer: 'Test Traders', qty: 1 })],
];
const INVOICES_BACKUP = [BK_HEAD,
  ['INV901', '2026-10-20', 'Test Traders', 'MIORD201', '500', '15000', '', '', JSON.stringify({ id: 'INV901', date: '2026-10-20', party: 'Test Traders', orderId: 'MIORD201', total: 15000, items: [{ desc: 'Alpha Box', qty: 500, rate: 30, orderId: 'MIORD201', challanDc: 'DC-901/26' }] })],
];

// spreadsheetId → tab → rows. Anything else answers with an empty range.
function sheetsFixture(cfg) {
  return {
    [cfg.ORDERS_SHEET_ID]: { Orders: ORDERS, Vehicles: VEHICLES, ChallansBackup: CHALLANS_BACKUP, InvoicesBackup: INVOICES_BACKUP },
    [cfg.SUPERVISOR_SHEET_ID]: { Dispatch: DISPATCH, Production: PRODUCTION },
  };
}

// Answer one Sheets API v4 values URL the way the real API does
function answerSheets(url, cfg) {
  const m = new URL(url).pathname.match(/\/v4\/spreadsheets\/([^/]+)\/values\/(.+)$/);
  if (!m) return { status: 404, body: { error: { message: 'not a values URL' } } };
  const range = decodeURIComponent(m[2]);
  const tab = range.split('!')[0].replace(/^'|'$/g, '');
  const rows = (sheetsFixture(cfg)[m[1]] || {})[tab];
  if (!rows) return { status: 200, body: { range, majorDimension: 'ROWS' } };
  // Ranges starting at row 2 skip the header, like the real API
  const startRow = parseInt((range.split('!')[1] || 'A1').match(/\d+/) || [1], 10);
  return { status: 200, body: { range, majorDimension: 'ROWS', values: rows.slice(startRow - 1) } };
}

module.exports = { ORDERS, DISPATCH, PRODUCTION, VEHICLES, XSS, answerSheets };

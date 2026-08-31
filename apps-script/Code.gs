// ══════════════════════════════════════════════════════════════
// MANIRAM FACTORY OS — Google Apps Script
// Paste this ENTIRE file into your Apps Script editor and deploy.
// ══════════════════════════════════════════════════════════════

// ── Spreadsheet IDs ──
var ORDERS_SHEET_ID    = '1JVWfffLht7X_mGOyQb0QK1cB3vx68TTM1yx9pGZbb30';
var CUSTOMERS_SHEET_ID = '1QZ-tp9RvzPX_kcK-uTuc8EsdG6RGzo8L8o6Me9OZy2A';
var PRODUCTS_SHEET_ID  = '1fOsPGG5bvt9L2sG-l5dfHKzDjL7-pBshlzL6apzCJQI';
var DISPATCH_SHEET_ID  = '15BIRmrIyu4m76c_-9xau_SYC_BxsvR-kM6WadQKDV60';
var STAFF_LOG_SHEET_ID = '14AYCaA4uQ7rSnfuOfG0Joff-LmWVCYVb9Wc_95Zr60k';
var PROD_PERF_SHEET_ID = '1cK7sbz1pwsSJOD6ZBgdj12CN3Gznw9Y37KN-U3_hTwQ';

// ── Separate spreadsheet per finance operation ──
// Run setupSheets() ONCE (from the editor) to create these and print their IDs,
// then paste each ID below AND into js/config.js. Nothing is merged together.
var REEL_SHEET_ID        = '1tcE8W_1q-tkXn6DZ9DX6darBnUpwcQtFZqA9sUbtjR8';
var REEL_STOCK_TAB       = 'Stock';
var SNAPSHOT_SHEET_ID    = '1bSoFhhJ4_RzD8YiFhZFAA8sW_r1ItwC_EAP-6fPdl9k'; // Reel Snapshot Log — durable, never pruned
var SNAPSHOT_TAB         = 'Snapshots';

// ── Separate spreadsheet per finance operation ──
// Run setupSheets() ONCE (from the editor) to create these and print their IDs,
// then paste each ID below AND into js/config.js. Nothing is merged together.
var INVOICES_SHEET_ID    = '';
var EXPENSES_SHEET_ID    = '';
var RECEIVABLES_SHEET_ID = '';
var CHALLANS_SHEET_ID    = '';
var QUOTATIONS_SHEET_ID  = '';
var LEADS_SHEET_ID       = '';

// ── Supervisor Dispatch form — Order ID dropdown ──
// This is the FORM's own editable ID (from its /edit URL — Extensions >
// Apps Script inside the form editor also shows it), NOT the public
// viewform/e/... link. Paste it in, then run installOrderIdDropdownTrigger()
// once from this editor (function dropdown at top > select it > Run).
var SUPERVISOR_FORM_ID     = '';
var ORDER_ID_QUESTION_TITLE = 'Order ID'; // must exactly match the question title on the form

// ── WhatsApp Business Cloud API — automatic dispatch notification ──
// Blank by default; every call below silently no-ops until these are filled
// in. Requires a Meta WhatsApp Business Platform setup — see the numbered
// steps in the big comment above sendWhatsAppTemplate() below for exactly
// what to do and where these four values come from.
var WHATSAPP_PHONE_NUMBER_ID = '';
var WHATSAPP_ACCESS_TOKEN    = '';
var WHATSAPP_TEMPLATE_NAME   = 'dispatch_notification'; // must exactly match the approved template's name
var WHATSAPP_TEMPLATE_LANG   = 'en_US';                 // must exactly match the template's approved language
var WHATSAPP_OWNER_PHONE     = '';                       // optional, E.164 digits only e.g. 919876543210 — gets a copy of every notification too

// ── Entry point ──
function doPost(e) {
  try {
    var data         = JSON.parse(e.postData.contents);
    var action       = data.action;
    var responseData = {};

    if      (action === 'saveOrder')         saveOrder(data);
    else if (action === 'updateOrderStatus') updateOrderStatus(data);
    else if (action === 'deleteOrder')       deleteOrder(data);
    else if (action === 'saveClient')        saveClient(data);
    else if (action === 'saveProduct')       saveProduct(data);
    else if (action === 'deleteProduct')     deleteProduct(data);
    else if (action === 'saveDispatch')      saveDispatch(data);
    else if (action === 'clearDispatch')     clearDispatchRow(data);
    else if (action === 'saveStaffLog')      saveStaffLog(data);
    else if (action === 'saveProdPerf')      saveProdPerf(data);
    else if (action === 'savePurchase')      savePurchase(data);
    else if (action === 'updatePurchase')    updatePurchase(data);
    else if (action === 'addReelStock')      addReelStock(data);
    else if (action === 'saveReelSnapshot')  saveReelSnapshot(data);
    else if (action === 'saveOverhead')      saveOverhead(data);
    // ── Tally sync ──
    else if (action === 'syncTally')         responseData = syncTallyData(data);
    // ── Separate finance sheets ──
    else if (action === 'saveInvoice')       saveInvoice(data);
    else if (action === 'deleteInvoice')     deleteFinanceRow(INVOICES_SHEET_ID, 'Invoices', data.id);
    else if (action === 'saveExpense')       saveExpense(data);
    else if (action === 'deleteExpense')     deleteFinanceRow(EXPENSES_SHEET_ID, 'Expenses', data.id);
    else if (action === 'savePayment')       savePayment(data);
    else if (action === 'deletePayment')     deleteFinanceRow(RECEIVABLES_SHEET_ID, 'Receivables', data.id);
    else if (action === 'saveChallan')       saveChallan(data);
    else if (action === 'deleteChallan')     deleteFinanceRow(CHALLANS_SHEET_ID, 'Challans', data.id);
    else if (action === 'notifyDispatch')    notifyDispatch(data);
    else if (action === 'saveQuotation')     saveQuotation(data);
    else if (action === 'deleteQuotation')   deleteFinanceRow(QUOTATIONS_SHEET_ID, 'Quotations', data.id);
    else if (action === 'saveLead')          saveLead(data);
    else if (action === 'deleteLead')        deleteFinanceRow(LEADS_SHEET_ID, 'Leads', data.id);
    else if (action === 'createNotionPage')  { /* handled separately if needed */ }
    // ── Supervisor data collection ──
    else if (action === 'saveDispatchWeight') saveDispatchWeight(data);
    else if (action === 'saveProductionLog')  saveProductionLog(data);
    else if (action === 'saveReadyStock')     saveReadyStock(data);
    // ── Production Register (in-app machine-stage entries) ──
    else if (action === 'prodlogAppend')      prodlogAppend(data);
    else if (action === 'gsmSet')             gsmSet(data);
    // ── Process Costing (gum, stitching, … batch cost/kg — js/process-costing.js) ──
    else if (action === 'processLogAppend')   processLogAppend(data);
    // ── Frontend order contract (js/orders.js) ──
    // New orders POST with NO action; edits POST action 'update' + rowIndex.
    else if (action === 'update')             updateOrderRow(data);
    else if (!action && data.id && data.customer) appendOrderRow(data);

    return ContentService
      .createTextOutput(JSON.stringify(Object.assign({ success: true }, responseData)))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ══════════════════════════════════════════════════════════════
// ORDERS  →  ORDERS_SHEET_ID / "Orders" tab
// ══════════════════════════════════════════════════════════════

function saveOrder(data) {
  var ss    = SpreadsheetApp.openById(ORDERS_SHEET_ID);
  var sheet = ss.getSheetByName('Orders');
  if (!sheet) return;

  if (sheet.getLastRow() < 1 || sheet.getRange(1,1).getValue() === '') {
    sheet.appendRow(['ID','Customer','Product','Size','Ply','Colour','Weight','ReelSize','Qty','Date','Status','Notes','Price','OrderDate']);
  }

  var rows   = sheet.getDataRange().getValues();
  var row    = [
    data.id, data.customer, data.product, data.size, data.ply,
    data.colour, data.weight, data.reelSize, data.qty, data.date,
    data.status || 'New', data.notes || '', data.price || '', data.orderDate || ''
  ];

  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.id) {
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      return;
    }
  }
  sheet.appendRow(row);
}

function updateOrderStatus(data) {
  var ss    = SpreadsheetApp.openById(ORDERS_SHEET_ID);
  var sheet = ss.getSheetByName('Orders');
  if (!sheet) return;
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.id) {
      sheet.getRange(i + 1, 11).setValue(data.status); // column K = Status
      if (data.dispatchedQty) sheet.getRange(i + 1, 9).setValue(data.dispatchedQty);
      return;
    }
  }
}

function deleteOrder(data) {
  var ss    = SpreadsheetApp.openById(ORDERS_SHEET_ID);
  var sheet = ss.getSheetByName('Orders');
  if (!sheet) return;
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if ((rows[i][0] || '').toString() === (data.id || '').toString()) { sheet.deleteRow(i + 1); return; }
  }
}

// ── Live Orders tab layout (matches the deployed sheet's 15 columns) ──
// Order ID | Customer | Product | Box Specs | Ply | Colour | Weight |
// Quantity | Rate | Delivery Date | Status | Priority | Reel Size |
// Reserved KG | Remarks
function _orderRowVals(d) {
  return [
    d.id, d.customer, d.product || '', d.size || '', d.ply || '', d.colour || '',
    d.weight || '', d.qty || '', d.rate || '', d.date || '', d.status || 'New',
    d.priority || 'Normal', d.reelSize || '', d.reservedKg || 0, d.remarks || '',
    d.twoPart ? 'TRUE' : 'FALSE'
  ];
}

// Orders sheet header is otherwise hand-managed, not auto-created — self-heal
// just the one new column so existing sheets pick it up without a manual edit.
function _ensureOrderTwoPartHeader(sheet) {
  var header = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  if (header.indexOf('TwoPart') < 0) {
    sheet.getRange(1, 16, 1, 1).setValues([['TwoPart']]);
  }
}

function appendOrderRow(data) {
  var ss    = SpreadsheetApp.openById(ORDERS_SHEET_ID);
  var sheet = ss.getSheetByName('Orders');
  if (!sheet) return;
  _ensureOrderTwoPartHeader(sheet);
  sheet.appendRow(_orderRowVals(data));
}

function updateOrderRow(data) {
  var ss    = SpreadsheetApp.openById(ORDERS_SHEET_ID);
  var sheet = ss.getSheetByName('Orders');
  if (!sheet) return;
  _ensureOrderTwoPartHeader(sheet);
  var vals = _orderRowVals(data);
  var row  = parseInt(data.rowIndex);
  if (row > 1) {
    sheet.getRange(row, 1, 1, vals.length).setValues([vals]);
    return;
  }
  // rowIndex missing/unknown — fall back to match by ID
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if ((rows[i][0] || '').toString() === (data.id || '').toString()) {
      sheet.getRange(i + 1, 1, 1, vals.length).setValues([vals]);
      return;
    }
  }
}

// ══════════════════════════════════════════════════════════════
// CLIENTS  →  ORDERS_SHEET_ID / "Customers" tab
// ══════════════════════════════════════════════════════════════

function saveClient(data) {
  var ss    = SpreadsheetApp.openById(CUSTOMERS_SHEET_ID);
  var sheet = ss.getSheetByName('Sheet1') || ss.getSheets()[0];
  if (sheet.getLastRow() === 0) sheet.appendRow(['Name','Contact','Phone','City']);

  var rows       = sheet.getDataRange().getValues();
  var searchName = data.originalName || data.name;
  for (var i = 1; i < rows.length; i++) {
    if ((rows[i][0] || '').toString().trim() === searchName.trim()) {
      sheet.getRange(i + 1, 1, 1, 4).setValues([[data.name, data.contact || '', data.phone || '', data.city || '']]);
      return;
    }
  }
  sheet.appendRow([data.name, data.contact || '', data.phone || '', data.city || '']);
}

// ══════════════════════════════════════════════════════════════
// PRODUCTS  →  ORDERS_SHEET_ID / "Products" tab
// ══════════════════════════════════════════════════════════════

var PRODUCT_HEADERS = ['ClientName','Product','Size','Ply','Colour','Weight','ReelSize',
                        'GSM1','GSM2','GSM3','GSM4','GSM5','GSM6','GSM7','GSM8','GSM9',
                        'HasPrint','PrintColour','PrintDesign',
                        'BF1','BF2','BF3','BF4','BF5','BF6','BF7','BF8','BF9',
                        'TwoPart'];

function saveProduct(data) {
  var ss    = SpreadsheetApp.openById(PRODUCTS_SHEET_ID);
  var sheet = ss.getSheetByName('Sheet1') || ss.getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(PRODUCT_HEADERS);
  } else {
    // Sheet already exists from before BF columns were added — extend its header in place.
    var curHeader = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    if (curHeader.indexOf('BF1') < 0) {
      sheet.getRange(1, 20, 1, 9).setValues([PRODUCT_HEADERS.slice(19, 28)]);
    }
    if (curHeader.indexOf('TwoPart') < 0) {
      sheet.getRange(1, 29, 1, 1).setValues([['TwoPart']]);
    }
  }

  var gsm  = Array.isArray(data.gsm) ? data.gsm : [];
  var bf   = Array.isArray(data.bf)  ? data.bf  : [];
  var row  = [
    data.clientName, data.name, data.size || '', data.ply || '',
    data.colour || '', data.weight || '', data.reelSize || '',
    gsm[0]||'', gsm[1]||'', gsm[2]||'', gsm[3]||'', gsm[4]||'',
    gsm[5]||'', gsm[6]||'', gsm[7]||'', gsm[8]||'',
    data.hasPrint ? 'TRUE' : 'FALSE',
    data.printColour || '',
    data.printDesign || '',
    bf[0]||'', bf[1]||'', bf[2]||'', bf[3]||'', bf[4]||'',
    bf[5]||'', bf[6]||'', bf[7]||'', bf[8]||'',
    data.twoPart ? 'TRUE' : 'FALSE'
  ];

  var rows       = sheet.getDataRange().getValues();
  var searchProd = data.originalName || data.name;
  for (var i = 1; i < rows.length; i++) {
    if ((rows[i][0]||'').trim() === data.clientName.trim() && (rows[i][1]||'').trim() === searchProd.trim()) {
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      return;
    }
  }
  sheet.appendRow(row);
}

function deleteProduct(data) {
  var ss    = SpreadsheetApp.openById(PRODUCTS_SHEET_ID);
  var sheet = ss.getSheetByName('Sheet1') || ss.getSheets()[0];
  if (!sheet) return;
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if ((rows[i][0]||'').trim() === data.clientName.trim() && (rows[i][1]||'').trim() === data.productName.trim()) {
      sheet.deleteRow(i + 1);
      return;
    }
  }
}

// ══════════════════════════════════════════════════════════════
// DISPATCH  →  DISPATCH_SHEET_ID / "Sheet1"
// ══════════════════════════════════════════════════════════════

function saveDispatch(data) {
  var ss    = SpreadsheetApp.openById(DISPATCH_SHEET_ID);
  var sheet = ss.getSheetByName('Sheet1');
  if (!sheet) sheet = ss.getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['OrderID','DispatchedQty','Date','Notes']);
  }
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.orderId) {
      sheet.getRange(i + 1, 1, 1, 4).setValues([[data.orderId, data.qty, data.date || '', data.notes || '']]);
      return;
    }
  }
  sheet.appendRow([data.orderId, data.qty, data.date || '', data.notes || '']);
}

// Removes an order's row from the Dispatch sheet entirely — the write side of
// js/dispatch.js's clearDispatch() (un-marking a Record Dispatch entry).
function clearDispatchRow(data) {
  var ss    = SpreadsheetApp.openById(DISPATCH_SHEET_ID);
  var sheet = ss.getSheetByName('Sheet1');
  if (!sheet) sheet = ss.getSheets()[0];
  if (!sheet || sheet.getLastRow() === 0) return;
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] === data.orderId) sheet.deleteRow(i + 1);
  }
}

// ══════════════════════════════════════════════════════════════
// STAFF LOG  →  STAFF_LOG_SHEET_ID / "Sheet1"
// Daily headcount, upserted by date — matches js/prod-learning.js's
// fetchStaffLog(), which reads column B as a plain integer count keyed by
// column A's date.
// ══════════════════════════════════════════════════════════════

function saveStaffLog(data) {
  var ss    = SpreadsheetApp.openById(STAFF_LOG_SHEET_ID);
  var sheet = ss.getSheetByName('Sheet1');
  if (!sheet) sheet = ss.getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Date', 'StaffCount']);
  }
  var date = data.date || new Date().toISOString().split('T')[0];
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === date) {
      sheet.getRange(i + 1, 2).setValue(data.count || 0);
      return;
    }
  }
  sheet.appendRow([date, data.count || 0]);
}

// ══════════════════════════════════════════════════════════════
// PRODUCTION PERFORMANCE  →  PROD_PERF_SHEET_ID / "Sheet1"
// ══════════════════════════════════════════════════════════════

function saveProdPerf(data) {
  var ss    = SpreadsheetApp.openById(PROD_PERF_SHEET_ID);
  var sheet = ss.getSheetByName('Sheet1');
  if (!sheet) sheet = ss.getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Date','OrderID','Ply','PlannedQty','ActualQty','Notes','Staff']);
  }
  sheet.appendRow([data.date || '', data.orderId || '', data.ply || '',
                   data.plannedQty || '', data.actualQty || '', data.notes || '', data.staff || '']);
}

// ══════════════════════════════════════════════════════════════
// PURCHASES  →  ORDERS_SHEET_ID / "Purchases" tab  (unchanged)
// ══════════════════════════════════════════════════════════════

function _purchaseHeaders() {
  return ['ID','Supplier','ReelSize','GSM','BF','QuantityKg','RatePerKg',
          'PurchaseDate','ExpectedDelivery','ActualDelivery',
          'PaymentStatus','PaidAmount','Remarks','Status'];
}

function _purchaseRow(d) {
  return [
    d.id || '', d.supplier || '', d.reelSize || '', d.gsm || '', d.bf || '',
    d.quantityKg || 0, d.ratePerKg || 0, d.purchaseDate || '',
    d.expectedDelivery || '', d.actualDelivery || '',
    d.paymentStatus || 'Unpaid', d.paidAmount || 0, d.remarks || '', d.status || 'Pending'
  ];
}

function savePurchase(data) {
  var ss    = SpreadsheetApp.openById(ORDERS_SHEET_ID);
  var sheet = ss.getSheetByName('Purchases');
  if (!sheet) {
    sheet = ss.insertSheet('Purchases');
    sheet.appendRow(_purchaseHeaders());
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,14).setFontWeight('bold').setBackground('#E8F0FE');
  }
  if (sheet.getLastRow() === 0) sheet.appendRow(_purchaseHeaders());
  sheet.appendRow(_purchaseRow(data));
}

function updatePurchase(data) {
  var ss    = SpreadsheetApp.openById(ORDERS_SHEET_ID);
  var sheet = ss.getSheetByName('Purchases');
  if (!sheet) return;
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if ((rows[i][0] || '').toString() === (data.id || '').toString()) {
      sheet.getRange(i + 1, 1, 1, 14).setValues([_purchaseRow(data)]);
      return;
    }
  }
}

// ══════════════════════════════════════════════════════════════
// REEL STOCK  →  REEL_SHEET_ID / "Stock" tab
// Called when a purchase is marked received. Appends new reel
// rows matching the sheet's existing column layout.
// ══════════════════════════════════════════════════════════════

function addReelStock(data) {
  var ss    = SpreadsheetApp.openById(REEL_SHEET_ID);
  var sheet = ss.getSheetByName(REEL_STOCK_TAB);
  if (!sheet) sheet = ss.getSheets()[0];

  var rows      = sheet.getDataRange().getValues();
  var headerIdx = -1;
  var colSize = -1, colGSM = -1, colBF = -1, colWeight = -1, colQty = -1;

  // Detect header row (same logic as the JS frontend)
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i].map(function(c) { return (c || '').toString().trim().toUpperCase(); });
    var si = -1;
    for (var j = 0; j < r.length; j++) {
      if (r[j] === 'SIZE' || r[j] === 'REEL SIZE' || r[j] === 'REEL_SIZE') { si = j; break; }
    }
    if (si >= 0) {
      headerIdx = i;
      colSize   = si;
      for (var j = 0; j < r.length; j++) {
        if (r[j] === 'GSM')                                                          colGSM    = j;
        if (r[j] === 'BF')                                                           colBF     = j;
        if (r[j].indexOf('WEIGHT') >= 0 || r[j] === 'WT' || r[j] === 'KG' || r[j] === 'NET WT' || r[j] === 'GROSS WT') colWeight = j;
        if (r[j] === 'QTY' || r[j] === 'QUANTITY' || r[j] === 'REELS' || r[j] === 'COUNT' || r[j] === 'NOS' || r[j] === 'NO.') colQty = j;
      }
      break;
    }
  }

  var numReels     = parseInt(data.numReels)  || 1;
  var weightPerReel = parseFloat(data.weightPerReel) || parseFloat(data.quantityKg) || 0;

  if (headerIdx < 0 || (colSize < 0 && colGSM < 0)) {
    // Sheet has no recognisable header — just append a simple row
    sheet.appendRow([data.reelSize || '', data.gsm || '', data.bf || '', weightPerReel, numReels]);
    return;
  }

  var maxCol = Math.max(colSize, colGSM, colBF, colWeight, colQty) + 1;
  var newRow  = [];
  for (var k = 0; k < maxCol; k++) newRow.push('');
  if (colSize   >= 0) newRow[colSize]   = data.reelSize   || '';
  if (colGSM    >= 0) newRow[colGSM]    = data.gsm        || '';
  if (colBF     >= 0) newRow[colBF]     = data.bf         || '';
  if (colWeight >= 0) newRow[colWeight] = weightPerReel;
  if (colQty    >= 0) newRow[colQty]    = numReels;

  sheet.appendRow(newRow);
}

// ══════════════════════════════════════════════════════════════
// REEL STOCK SNAPSHOT  →  SNAPSHOT_SHEET_ID / "Snapshots" tab
// One row per calendar date (upserted — the last snapshot taken on a given
// day overwrites that day's row, so it settles on that day's closing state).
// Never pruned, unlike the localStorage snapshots in js/reels.js — this is
// the durable source for the app's monthly opening/closing stock report.
// DataJSON is the full per-reel-size breakdown (same shape reels.js already
// keeps locally) so the size-by-size detail survives too, not just the total.
// ══════════════════════════════════════════════════════════════

function saveReelSnapshot(d) {
  var ss = SpreadsheetApp.openById(SNAPSHOT_SHEET_ID);
  var sh = ss.getSheetByName(SNAPSHOT_TAB);
  if (!sh) {
    // The spreadsheet may already have an unused default first sheet from
    // when it was created — reuse that instead of leaving it dangling empty.
    var first = ss.getSheets()[0];
    sh = (ss.getSheets().length === 1 && first.getLastRow() === 0) ? first : ss.insertSheet(SNAPSHOT_TAB);
    sh.setName(SNAPSHOT_TAB);
    sh.appendRow(['Date', 'TotalKg', 'DataJSON', 'Timestamp']);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#E8F0FE');
  }
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(d.date)) {
      sh.getRange(i + 1, 1, 1, 4).setValues([[d.date, d.totalKg || 0, d.dataJson || '', d.ts || new Date().toISOString()]]);
      return;
    }
  }
  sh.appendRow([d.date || '', d.totalKg || 0, d.dataJson || '', d.ts || new Date().toISOString()]);
}

// ══════════════════════════════════════════════════════════════
// OVERHEADS  →  ORDERS_SHEET_ID / "Overheads" tab
// Columns: Month | Electricity | Labour | Rent | Transport | Maintenance | Other | Notes
// ══════════════════════════════════════════════════════════════

function saveOverhead(data) {
  var ss    = SpreadsheetApp.openById(ORDERS_SHEET_ID);
  var sheet = ss.getSheetByName('Overheads');
  if (!sheet) {
    sheet = ss.insertSheet('Overheads');
    sheet.appendRow(['Month','Electricity','Labour','Rent','Transport','Maintenance','Other','Notes']);
  }

  var row = [
    data.month        || '',
    data.electricity  || 0,
    data.labour       || 0,
    data.rent         || 0,
    data.transport    || 0,
    data.maintenance  || 0,
    data.other        || 0,
    data.notes        || '',
  ];

  // Upsert by month
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.month) {
      sheet.getRange(i + 1, 1, 1, 8).setValues([row]);
      return;
    }
  }
  sheet.appendRow(row);
}

// ══════════════════════════════════════════════════════════════
// TALLY SYNC  →  ORDERS_SHEET_ID / "TallySync" tab
// Called by scripts/fetch-tally.js running on the Tally PC.
// Receives Sales vouchers, deduplicates, auto-matches to orders.
// ══════════════════════════════════════════════════════════════

var TALLY_SYNC_HEADERS = [
  'SyncedAt','VoucherDate','Type','VoucherNo',
  'Party','Amount','Narration','MatchedOrderID','MatchStatus'
];

function syncTallyData(data) {
  var ss        = SpreadsheetApp.openById(ORDERS_SHEET_ID);
  var syncSheet = ss.getSheetByName('TallySync');
  if (!syncSheet) {
    syncSheet = ss.insertSheet('TallySync');
    syncSheet.appendRow(TALLY_SYNC_HEADERS);
    syncSheet.setFrozenRows(1);
    syncSheet.getRange(1, 1, 1, TALLY_SYNC_HEADERS.length).setFontWeight('bold').setBackground('#E8F0FE');
  }

  var ordersSheet = ss.getSheetByName('Orders');
  var orderRows   = ordersSheet ? ordersSheet.getDataRange().getValues() : [];

  // Load existing keys to prevent duplicates (VoucherDate|VoucherNo)
  var existing   = syncSheet.getDataRange().getValues();
  var syncedKeys = {};
  for (var k = 1; k < existing.length; k++) {
    syncedKeys[existing[k][1] + '|' + existing[k][3]] = true;
  }

  var vouchers = data.vouchers || [];
  var matched  = 0, written = 0, skipped = 0;
  var now = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd/MM/yyyy HH:mm');

  for (var idx = 0; idx < vouchers.length; idx++) {
    var v = vouchers[idx];

    var key = (v.date || data.date) + '|' + (v.number || '');
    if (syncedKeys[key]) { skipped++; continue; }

    var matchedId   = '';
    var matchStatus = 'Unmatched';
    var partyLower  = (v.party || '').toLowerCase().trim();

    // Fuzzy-match party name against order Customer column (col B = index 1)
    for (var i = 1; i < orderRows.length; i++) {
      var customer = (orderRows[i][1] || '').toLowerCase().trim();
      if (!customer || !partyLower) continue;
      var isMatch = customer === partyLower ||
                    customer.indexOf(partyLower) >= 0 ||
                    partyLower.indexOf(customer) >= 0;
      if (isMatch) {
        matchedId   = (orderRows[i][0] || '').toString();
        matchStatus = 'Auto-matched';
        matched++;
        // Advance order to Dispatched if currently active
        var curStatus = (orderRows[i][10] || '').toString();
        if (curStatus === 'New' || curStatus === 'In Production' || curStatus === 'Ready') {
          try { ordersSheet.getRange(i + 1, 11).setValue('Dispatched'); } catch (e) {}
        }
        break;
      }
    }

    syncSheet.appendRow([
      now, v.date || data.date, v.type || 'Sales',
      v.number || '', v.party || '', v.amount || 0,
      v.narration || '', matchedId, matchStatus
    ]);
    syncedKeys[key] = true;
    written++;
  }

  return { matched: matched, written: written, skipped: skipped };
}

// ══════════════════════════════════════════════════════════════
// SEPARATE FINANCE SHEETS — Invoices · Expenses · Receivables ·
// Challans · Quotations. Each in its OWN spreadsheet, upserted by ID.
// ══════════════════════════════════════════════════════════════

// Generic: open a finance spreadsheet, ensure headers, upsert a row by ID (column A).
function _financeUpsert(sheetId, tabName, headers, row) {
  if (!sheetId) return; // not configured yet
  var ss    = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(tabName) || ss.getSheets()[0];
  if (!sheet) sheet = ss.insertSheet(tabName);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);

  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if ((rows[i][0] || '').toString() === (row[0] || '').toString()) {
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      return;
    }
  }
  sheet.appendRow(row);
}

function deleteFinanceRow(sheetId, tabName, id) {
  if (!sheetId || !id) return;
  var ss    = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(tabName) || ss.getSheets()[0];
  if (!sheet) return;
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if ((rows[i][0] || '').toString() === id.toString()) { sheet.deleteRow(i + 1); return; }
  }
}

function saveInvoice(data) {
  _financeUpsert(INVOICES_SHEET_ID, 'Invoices',
    ['InvoiceNo','Date','Party','OrderIDs','Items','Qty','Amount','CreatedAt'],
    [data.id, data.date, data.party, data.orderIds || '', data.items || '',
     data.qty || 0, data.total || 0, data.createdAt || '']);
}

function saveExpense(data) {
  _financeUpsert(EXPENSES_SHEET_ID, 'Expenses',
    ['ID','Date','Category','PaidTo','Amount','Mode','Notes'],
    [data.id, data.date, data.category, data.payee || '',
     data.amount || 0, data.mode || '', data.notes || '']);
}

function savePayment(data) {
  _financeUpsert(RECEIVABLES_SHEET_ID, 'Receivables',
    ['ID','Date','Customer','Amount','Note'],
    [data.id, data.date, data.customer, data.amount || 0, data.note || '']);
}

function saveChallan(data) {
  _financeUpsert(CHALLANS_SHEET_ID, 'Challans',
    ['ChallanNo','Date','OrderID','Customer','Product','Qty','Vehicle','Notes'],
    [data.id, data.date, data.orderId || '', data.customer || '', data.product || '',
     data.qty || 0, data.vehicle || '', data.notes || '']);
}

// ══════════════════════════════════════════════════════════════
// WHATSAPP BUSINESS CLOUD API — automatic dispatch notification
//
// ONE-TIME SETUP (all of this happens on Meta's side, not in this file):
//   1. Create a Meta Business Account at business.facebook.com if you don't
//      have one already, using Maniram Industries' business details.
//   2. Go to developers.facebook.com → My Apps → Create App → choose
//      "Business" as the app type → add the "WhatsApp" product to it.
//   3. Meta gives you a free TEST phone number to start — it can send to up
//      to 5 phone numbers you manually verify, for free, while testing.
//      For real customers you'll eventually need to register a real
//      business number (Meta Business Suite → WhatsApp Manager → Phone
//      Numbers → Add). That number can't be actively used in the regular
//      WhatsApp app at the same time — plan for a number dedicated to this.
//   4. Business verification (Meta Business Suite → Business Settings →
//      Business Info → Start Verification) — required before you can send
//      to real, unverified customer numbers instead of just test numbers.
//      Needs business documents; can take a few days.
//   5. Create a Message Template (WhatsApp Manager → Message Templates →
//      Create Template). Category: Utility. Suggested body, with 5
//      placeholders in order — party, product, quantity, challan number,
//      date:
//        "Your order has been dispatched from Maniram Industries.
//
//         Party: {{1}}
//         Product: {{2}}
//         Quantity: {{3}} pcs
//         Challan No: {{4}}
//         Date: {{5}}
//
//         Thank you for your business!"
//      Submit for approval (usually minutes, sometimes up to a day).
//   6. Once approved, collect these four values and paste them into the
//      constants above doPost(): WHATSAPP_PHONE_NUMBER_ID (WhatsApp Manager
//      → Phone Numbers → click your number → Phone number ID),
//      WHATSAPP_ACCESS_TOKEN (Business Suite → System Users → create a
//      System User with WhatsApp permissions → Generate Token, set it to
//      never expire), WHATSAPP_TEMPLATE_NAME (exactly as named in step 5),
//      and WHATSAPP_TEMPLATE_LANG (the language you submitted it in, e.g.
//      'en_US'). Redeploy after pasting them in.
//
// Until all four are filled in, every call below silently does nothing —
// safe to leave blank indefinitely.
// ══════════════════════════════════════════════════════════════

function sendWhatsAppTemplate(toPhone, bodyParams) {
  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN || !toPhone) return;
  var url = 'https://graph.facebook.com/v19.0/' + WHATSAPP_PHONE_NUMBER_ID + '/messages';
  var payload = {
    messaging_product: 'whatsapp',
    to: toPhone,
    type: 'template',
    template: {
      name: WHATSAPP_TEMPLATE_NAME,
      language: { code: WHATSAPP_TEMPLATE_LANG },
      components: [{
        type: 'body',
        parameters: bodyParams.map(function (p) { return { type: 'text', text: String(p) }; }),
      }],
    },
  };
  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + WHATSAPP_ACCESS_TOKEN },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() >= 300) Logger.log('WhatsApp send failed: ' + res.getContentText());
  } catch (e) {
    Logger.log('WhatsApp send threw: ' + e);
  }
}

// Bare 10-digit Indian mobile numbers get a "91" prefix; anything already
// longer is assumed to already include a country code.
function _toE164(phone) {
  var digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length === 10 ? '91' + digits : digits;
}

// Fires on every dispatch — auto-matched from the Supervisor log or
// manually created — see _svCreateChallanFor() (js/supervisor-log.js) and
// saveAndPrintChallan() (js/challan.js).
function notifyDispatch(data) {
  var params = [data.customer || '', data.product || '', String(data.qty || ''), data.dcNum || '', data.date || ''];
  if (data.customerPhone) sendWhatsAppTemplate(_toE164(data.customerPhone), params);
  if (WHATSAPP_OWNER_PHONE) sendWhatsAppTemplate(WHATSAPP_OWNER_PHONE, params);
}

function saveQuotation(data) {
  _financeUpsert(QUOTATIONS_SHEET_ID, 'Quotations',
    ['ID','Date','Customer','BoxSize','Ply','RatePerBox','Status','Notes'],
    [data.id, data.date, data.customer || '', data.size || '',
     data.ply || '', data.rate || 0, data.status || 'Pending', data.notes || '']);
}

function saveLead(data) {
  _financeUpsert(LEADS_SHEET_ID, 'Leads',
    ['ID','Name','Company','Phone','Source','Status','LastContact','NextCall','Notes','CreatedAt'],
    [data.id, data.name || '', data.company || '', data.phone || '', data.source || '',
     data.status || 'New', data.lastContact || '', data.nextCall || '', data.notes || '', data.createdAt || '']);
}

// ══════════════════════════════════════════════════════════════
// SUPERVISOR DATA COLLECTION
// All three write to ORDERS_SHEET_ID for easy access.
// ══════════════════════════════════════════════════════════════

function saveDispatchWeight(data) {
  var ss    = SpreadsheetApp.openById(ORDERS_SHEET_ID);
  var sheet = ss.getSheetByName('WeightLog');
  if (!sheet) {
    sheet = ss.insertSheet('WeightLog');
    sheet.appendRow(['Date','OrderID','Customer','Product','BoxesCount','TotalWeightKg','PerBoxGrams','Notes','SavedAt']);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,9).setFontWeight('bold').setBackground('#E8F0FE');
  }
  var now = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd/MM/yyyy HH:mm');
  var perBox = (data.totalWeightKg && data.boxesCount)
    ? Math.round((parseFloat(data.totalWeightKg) / parseInt(data.boxesCount)) * 1000)
    : '';
  sheet.appendRow([
    data.date || '', data.orderId || '', data.customer || '', data.product || '',
    parseInt(data.boxesCount) || '', parseFloat(data.totalWeightKg) || '',
    perBox, data.notes || '', now
  ]);
}

function saveProductionLog(data) {
  var ss    = SpreadsheetApp.openById(ORDERS_SHEET_ID);
  var sheet = ss.getSheetByName('SupvProdLog');
  if (!sheet) {
    sheet = ss.insertSheet('SupvProdLog');
    sheet.appendRow([
      'Date','OrderID','Customer','Product',
      'Reel1Size','Reel1GSM','Reel2Size','Reel2GSM','Reel3Size','Reel3GSM',
      'PaperPly','BoxesCorrugated','BoxesStitched','TestingCount','Rejects','Notes','SavedAt'
    ]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,17).setFontWeight('bold').setBackground('#E8F0FE');
  }
  var reels = data.reels || [];
  var now = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd/MM/yyyy HH:mm');
  sheet.appendRow([
    data.date || '', data.orderId || '', data.customer || '', data.product || '',
    (reels[0] && reels[0].size) || '', (reels[0] && reels[0].gsm) || '',
    (reels[1] && reels[1].size) || '', (reels[1] && reels[1].gsm) || '',
    (reels[2] && reels[2].size) || '', (reels[2] && reels[2].gsm) || '',
    data.paperPly || '',
    parseInt(data.boxesCorrugated) || '', parseInt(data.boxesStitched) || '',
    parseInt(data.testingCount) || '', parseInt(data.rejects) || '',
    data.notes || '', now
  ]);
}

function saveReadyStock(data) {
  var ss    = SpreadsheetApp.openById(ORDERS_SHEET_ID);
  var sheet = ss.getSheetByName('ReadyStock');
  if (!sheet) {
    sheet = ss.insertSheet('ReadyStock');
    sheet.appendRow(['Date','OrderID','Customer','Product','QtyReady','Notes','SavedAt']);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,7).setFontWeight('bold').setBackground('#E8F0FE');
  }
  var now = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd/MM/yyyy HH:mm');
  sheet.appendRow([
    data.date || '', data.orderId || '', data.customer || '', data.product || '',
    parseInt(data.qtyReady) || '', data.notes || '', now
  ]);
}

// ══════════════════════════════════════════════════════════════
// PRODUCTION REGISTER  →  ORDERS_SHEET_ID / "ProdLog" + "GSMeta" tabs
// In-app machine-stage entries (js/registers.js). Tabs auto-create.
// ══════════════════════════════════════════════════════════════

function prodlogAppend(d) {
  var ss = SpreadsheetApp.openById(ORDERS_SHEET_ID);
  var sh = ss.getSheetByName('ProdLog');
  if (!sh) {
    sh = ss.insertSheet('ProdLog');
    sh.appendRow(['Date','Machine','OrderID','Qty','Remarks','Timestamp']);
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,6).setFontWeight('bold').setBackground('#E8F0FE');
  }
  sh.appendRow([d.date||'', d.machine||'', d.orderId||'', d.qty||0, d.remarks||'', d.ts||new Date().toISOString()]);
}

function gsmSet(d) {
  var ss = SpreadsheetApp.openById(ORDERS_SHEET_ID);
  var sh = ss.getSheetByName('GSMeta');
  if (!sh) {
    sh = ss.insertSheet('GSMeta');
    sh.appendRow(['OrderID','GSM','Timestamp']);
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,3).setFontWeight('bold').setBackground('#E8F0FE');
  }
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(d.orderId)) {
      sh.getRange(i + 1, 2, 1, 2).setValues([[d.gsm||'', d.ts||'']]);
      return;
    }
  }
  sh.appendRow([d.orderId||'', d.gsm||'', d.ts||new Date().toISOString()]);
}

// ══════════════════════════════════════════════════════════════
// PROCESS COSTING  →  ORDERS_SHEET_ID / "ProcessLog" tab
// Batch entries from the Staff Portal's Process Log tab (js/staff-app.js):
// raw material consumed + approx output produced for a process (gum,
// stitching, …). Tab auto-creates. Cost/kg itself is computed on the main
// app's Process Costing page (js/process-costing.js) from a ₹/kg rate the
// owner sets there — this sheet only stores the raw quantities.
// ══════════════════════════════════════════════════════════════

function processLogAppend(d) {
  var ss = SpreadsheetApp.openById(ORDERS_SHEET_ID);
  var sh = ss.getSheetByName('ProcessLog');
  if (!sh) {
    sh = ss.insertSheet('ProcessLog');
    sh.appendRow(['Date','Process','RawMaterialKg','OutputQty','OutputUnit','Notes','Timestamp']);
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,7).setFontWeight('bold').setBackground('#E8F0FE');
  }
  sh.appendRow([
    d.date || '', d.process || '', d.rawMaterialKg || 0, d.outputQty || 0,
    d.outputUnit || 'kg', d.notes || '', d.ts || new Date().toISOString()
  ]);
}

// ══════════════════════════════════════════════════════════════
// ONE-TIME SETUP — run this once from the Apps Script editor.
// Creates a SEPARATE spreadsheet for each finance operation, makes each
// readable by link (so the web app can read it), and logs the IDs.
// Copy the printed IDs into the vars at the top of this file AND into
// js/config.js, then redeploy.
// ══════════════════════════════════════════════════════════════
function setupSheets() {
  var defs = [
    { name: 'Maniram — Invoices',    tab: 'Invoices',    headers: ['InvoiceNo','Date','Party','OrderIDs','Items','Qty','Amount','CreatedAt'] },
    { name: 'Maniram — Expenses',    tab: 'Expenses',    headers: ['ID','Date','Category','PaidTo','Amount','Mode','Notes'] },
    { name: 'Maniram — Receivables', tab: 'Receivables', headers: ['ID','Date','Customer','Amount','Note'] },
    { name: 'Maniram — Challans',    tab: 'Challans',    headers: ['ChallanNo','Date','OrderID','Customer','Product','Qty','Vehicle','Notes'] },
    { name: 'Maniram — Quotations',  tab: 'Quotations',  headers: ['ID','Date','Customer','BoxSize','Ply','RatePerBox','Status','Notes'] },
    { name: 'Maniram — Leads',       tab: 'Leads',       headers: ['ID','Name','Company','Phone','Source','Status','LastContact','NextCall','Notes','CreatedAt'] },
  ];
  var out = [];
  for (var i = 0; i < defs.length; i++) {
    var ss = SpreadsheetApp.create(defs[i].name);
    var sh = ss.getSheets()[0];
    sh.setName(defs[i].tab);
    sh.appendRow(defs[i].headers);
    // Make readable by anyone with the link so the web app's API key can read it
    try { DriveApp.getFileById(ss.getId()).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
    out.push(defs[i].tab + '_SHEET_ID = ' + ss.getId());
  }
  Logger.log('Paste these IDs into Code.gs (top) and js/config.js:\n\n' + out.join('\n'));
  return out.join('\n');
}

// ══════════════════════════════════════════════════════════════
// ONE-TIME FORMATTING — run formatAllSheets() once from the Apps
// Script editor (select it from the function dropdown → ▶ Run).
// Makes every tab the app writes to look like a clean table: bold
// frozen header row, sensible column widths, thin borders, and
// alternating row banding in the app's blue. Only touches formatting
// — never cell values — so it's safe to run on live data, and safe
// to re-run any time (it clears old banding first so it never stacks).
//
// Includes the Register Responses sheet (Google Form) too — that
// sheet isn't written by this script, but formatting a Form's
// response sheet doesn't affect new form submissions, which always
// just append a new row regardless of styling.
// ══════════════════════════════════════════════════════════════
function formatAllSheets() {
  var SUPERVISOR_SHEET_ID = '1ArpIy-BTUzHAKmVlcX8_7LChLM8MRiWtO7lmRW2V3sk'; // Maniram — Register Responses

  var jobs = [
    { id: ORDERS_SHEET_ID, tabs: ['Orders', 'Purchases', 'Overheads', 'TallySync', 'ProdLog', 'GSMeta', 'SupvProdLog', 'WeightLog', 'ReadyStock'] },
    { id: CUSTOMERS_SHEET_ID, tabs: ['Sheet1'] },
    { id: PRODUCTS_SHEET_ID,  tabs: ['Sheet1'] },
    { id: DISPATCH_SHEET_ID,  tabs: ['Sheet1'] },
    { id: STAFF_LOG_SHEET_ID, tabs: ['Sheet1'] },
    { id: PROD_PERF_SHEET_ID, tabs: ['Sheet1'] },
    { id: REEL_SHEET_ID,      tabs: [REEL_STOCK_TAB] },
    { id: INVOICES_SHEET_ID,    tabs: ['Invoices'] },
    { id: EXPENSES_SHEET_ID,    tabs: ['Expenses'] },
    { id: RECEIVABLES_SHEET_ID, tabs: ['Receivables'] },
    { id: CHALLANS_SHEET_ID,    tabs: ['Challans'] },
    { id: QUOTATIONS_SHEET_ID,  tabs: ['Quotations'] },
    { id: LEADS_SHEET_ID,       tabs: ['Leads'] },
    { id: SUPERVISOR_SHEET_ID,  tabs: ['Production', 'Dispatch'] },
  ];

  var done = [], skipped = [];
  for (var j = 0; j < jobs.length; j++) {
    var sheetId = jobs[j].id;
    if (!sheetId) { skipped.push('(blank spreadsheet ID — run setupSheets() first)'); continue; }
    var ss;
    try { ss = SpreadsheetApp.openById(sheetId); }
    catch (e) { skipped.push(sheetId + ' — could not open: ' + e); continue; }

    for (var t = 0; t < jobs[j].tabs.length; t++) {
      var tabName = jobs[j].tabs[t];
      var sheet = ss.getSheetByName(tabName);
      if (!sheet) { skipped.push(ss.getName() + ' / ' + tabName + ' — tab does not exist yet'); continue; }
      try {
        _formatTabElegant(sheet);
        done.push(ss.getName() + ' / ' + tabName);
      } catch (e) {
        skipped.push(ss.getName() + ' / ' + tabName + ' — ' + e);
      }
    }
  }

  var summary = 'Formatted:\n' + done.join('\n') + '\n\nSkipped:\n' + skipped.join('\n');
  Logger.log(summary);
  return summary;
}

function _formatTabElegant(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var lastRow = Math.max(sheet.getLastRow(), 1);
  if (lastRow < 1) return;

  // Header row: bold, navy-on-white-blue tint, frozen
  var header = sheet.getRange(1, 1, 1, lastCol);
  header.setFontWeight('bold').setBackground('#E8F0FE').setFontColor('#042C53');
  sheet.setFrozenRows(1);

  // Thin borders around the used range
  var used = sheet.getRange(1, 1, lastRow, lastCol);
  used.setBorder(true, true, true, true, true, true, '#DEE8F3', SpreadsheetApp.BorderStyle.SOLID);

  // Alternating row banding (clear any existing banding first so re-runs don't stack/error)
  var existing = sheet.getBandings();
  for (var b = 0; b < existing.length; b++) existing[b].remove();
  if (lastRow > 1) {
    used.applyRowBanding(SpreadsheetApp.BandingTheme.BLUE, true, false);
  }

  // Auto-size columns to fit content
  sheet.autoResizeColumns(1, lastCol);
}

// ══════════════════════════════════════════════════════════════
// SUPERVISOR DISPATCH FORM — Order ID dropdown, synced from pending orders
// ══════════════════════════════════════════════════════════════

// Rebuilds the "Order ID" dropdown's choice list from every order that
// isn't Delivered/Dispatched/Cancelled yet. Choice text is
// "<OrderID> — <Customer> — <Product>" so the supervisor can recognise the
// right order by name, not just the code; js/supervisor-log.js on the app
// side splits on " — " and only keeps the first token.
function refreshOrderIdDropdown() {
  if (!SUPERVISOR_FORM_ID) throw new Error('Set SUPERVISOR_FORM_ID at the top of Code.gs first — see the comment above it.');

  var ordersSheet = SpreadsheetApp.openById(ORDERS_SHEET_ID).getSheetByName('Orders');
  var rows = ordersSheet ? ordersSheet.getDataRange().getValues() : [];
  var FINISHED_STATUSES = ['Delivered', 'Dispatched', 'Cancelled'];

  var choices = [];
  for (var i = 1; i < rows.length; i++) {
    var id       = (rows[i][0]  || '').toString().trim();  // col A
    var customer = (rows[i][1]  || '').toString().trim();  // col B
    var product  = (rows[i][2]  || '').toString().trim();  // col C
    var status   = (rows[i][10] || '').toString().trim();  // col K
    if (!id || FINISHED_STATUSES.indexOf(status) !== -1) continue;
    var label = id;
    if (customer) label += ' — ' + customer;
    if (product)  label += ' — ' + product;
    choices.push(label);
  }
  if (choices.length === 0) choices = ['(no pending orders right now)'];

  var form  = FormApp.openById(SUPERVISOR_FORM_ID);
  var items = form.getItems(FormApp.ItemType.LIST); // "Dropdown" question type
  var target = null;
  for (var j = 0; j < items.length; j++) {
    if (items[j].getTitle().trim() === ORDER_ID_QUESTION_TITLE) { target = items[j]; break; }
  }
  if (!target) {
    throw new Error('No Dropdown question titled "' + ORDER_ID_QUESTION_TITLE +
      '" found on the form. Check the question type is set to Dropdown (not Short answer) ' +
      'and its title matches exactly.');
  }
  target.asListItem().setChoiceValues(choices);
  Logger.log('Order ID dropdown refreshed — ' + choices.length + ' choice(s).');
}

// One-time setup: run this once from the Apps Script editor (pick it in the
// function dropdown at the top of the editor, click Run) to populate the
// dropdown immediately and install a 15-minute auto-refresh trigger.
function installOrderIdDropdownTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var t = 0; t < triggers.length; t++) {
    if (triggers[t].getHandlerFunction() === 'refreshOrderIdDropdown') ScriptApp.deleteTrigger(triggers[t]);
  }
  ScriptApp.newTrigger('refreshOrderIdDropdown').timeBased().everyMinutes(15).create();
  refreshOrderIdDropdown();
}

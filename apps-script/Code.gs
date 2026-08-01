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

// ── Separate spreadsheet per finance operation ──
// Run setupSheets() ONCE (from the editor) to create these and print their IDs,
// then paste each ID below AND into js/config.js. Nothing is merged together.
var INVOICES_SHEET_ID    = '';
var EXPENSES_SHEET_ID    = '';
var RECEIVABLES_SHEET_ID = '';
var CHALLANS_SHEET_ID    = '';
var QUOTATIONS_SHEET_ID  = '';

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
    else if (action === 'saveStaffLog')      saveStaffLog(data);
    else if (action === 'saveProdPerf')      saveProdPerf(data);
    else if (action === 'savePurchase')      savePurchase(data);
    else if (action === 'updatePurchase')    updatePurchase(data);
    else if (action === 'addReelStock')      addReelStock(data);
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
    else if (action === 'saveQuotation')     saveQuotation(data);
    else if (action === 'deleteQuotation')   deleteFinanceRow(QUOTATIONS_SHEET_ID, 'Quotations', data.id);
    else if (action === 'createNotionPage')  { /* handled separately if needed */ }
    // ── Supervisor data collection ──
    else if (action === 'saveDispatchWeight') saveDispatchWeight(data);
    else if (action === 'saveProductionLog')  saveProductionLog(data);
    else if (action === 'saveReadyStock')     saveReadyStock(data);
    // ── Production Register (in-app machine-stage entries) ──
    else if (action === 'prodlogAppend')      prodlogAppend(data);
    else if (action === 'gsmSet')             gsmSet(data);
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
    d.priority || 'Normal', d.reelSize || '', d.reservedKg || 0, d.remarks || ''
  ];
}

function appendOrderRow(data) {
  var ss    = SpreadsheetApp.openById(ORDERS_SHEET_ID);
  var sheet = ss.getSheetByName('Orders');
  if (!sheet) return;
  sheet.appendRow(_orderRowVals(data));
}

function updateOrderRow(data) {
  var ss    = SpreadsheetApp.openById(ORDERS_SHEET_ID);
  var sheet = ss.getSheetByName('Orders');
  if (!sheet) return;
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

function saveProduct(data) {
  var ss    = SpreadsheetApp.openById(PRODUCTS_SHEET_ID);
  var sheet = ss.getSheetByName('Sheet1') || ss.getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['ClientName','Product','Size','Ply','Colour','Weight','ReelSize',
                     'GSM1','GSM2','GSM3','GSM4','GSM5','GSM6','GSM7','GSM8','GSM9',
                     'HasPrint','PrintColour','PrintDesign']);
  }

  var gsm  = Array.isArray(data.gsm) ? data.gsm : [];
  var row  = [
    data.clientName, data.name, data.size || '', data.ply || '',
    data.colour || '', data.weight || '', data.reelSize || '',
    gsm[0]||'', gsm[1]||'', gsm[2]||'', gsm[3]||'', gsm[4]||'',
    gsm[5]||'', gsm[6]||'', gsm[7]||'', gsm[8]||'',
    data.hasPrint ? 'TRUE' : 'FALSE',
    data.printColour || '',
    data.printDesign || ''
  ];

  var rows       = sheet.getDataRange().getValues();
  var searchProd = data.originalName || data.name;
  for (var i = 1; i < rows.length; i++) {
    if ((rows[i][0]||'').trim() === data.clientName.trim() && (rows[i][1]||'').trim() === searchProd.trim()) {
      sheet.getRange(i + 1, 1, 1, 19).setValues([row]);
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

// ══════════════════════════════════════════════════════════════
// STAFF LOG  →  STAFF_LOG_SHEET_ID / "Sheet1"
// ══════════════════════════════════════════════════════════════

function saveStaffLog(data) {
  var ss    = SpreadsheetApp.openById(STAFF_LOG_SHEET_ID);
  var sheet = ss.getSheetByName('Sheet1');
  if (!sheet) sheet = ss.getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Date','Staff','OrderID','Action','Notes']);
  }
  sheet.appendRow([data.date || new Date().toISOString().split('T')[0],
                   data.staff || '', data.orderId || '', data.action || '', data.notes || '']);
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

function saveQuotation(data) {
  _financeUpsert(QUOTATIONS_SHEET_ID, 'Quotations',
    ['ID','Date','Customer','BoxSize','Ply','RatePerBox','Status','Notes'],
    [data.id, data.date, data.customer || '', data.size || '',
     data.ply || '', data.rate || 0, data.status || 'Pending', data.notes || '']);
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

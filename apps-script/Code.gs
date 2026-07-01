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

// ── Entry point ──
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;

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
    else if (action === 'saveOverhead')      saveOverhead(data);
    else if (action === 'createNotionPage')  { /* handled separately if needed */ }

    return ContentService.createTextOutput('ok');
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err.toString());
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
    sheet.appendRow(['ID','Customer','Product','Size','Ply','Colour','Weight','ReelSize','Qty','Date','Status','Notes','Price']);
  }

  var rows   = sheet.getDataRange().getValues();
  var row    = [
    data.id, data.customer, data.product, data.size, data.ply,
    data.colour, data.weight, data.reelSize, data.qty, data.date,
    data.status || 'New', data.notes || '', data.price || ''
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
    if (rows[i][0] === data.id) { sheet.deleteRow(i + 1); return; }
  }
}

// ══════════════════════════════════════════════════════════════
// CLIENTS  →  ORDERS_SHEET_ID / "Customers" tab
// ══════════════════════════════════════════════════════════════

function saveClient(data) {
  var ss    = SpreadsheetApp.openById(ORDERS_SHEET_ID);
  var sheet = ss.getSheetByName('Customers');
  if (!sheet) { sheet = ss.insertSheet('Customers'); sheet.appendRow(['Name','Contact','Phone','City']); }

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
  var ss    = SpreadsheetApp.openById(ORDERS_SHEET_ID);
  var sheet = ss.getSheetByName('Products');
  if (!sheet) {
    sheet = ss.insertSheet('Products');
    sheet.appendRow(['ClientName','Product','Size','Ply','Colour','Weight','ReelSize',
                     'GSM1','GSM2','GSM3','GSM4','GSM5','GSM6','GSM7','GSM8','GSM9']);
  }

  var gsm  = Array.isArray(data.gsm) ? data.gsm : [];
  var row  = [
    data.clientName, data.name, data.size || '', data.ply || '',
    data.colour || '', data.weight || '', data.reelSize || '',
    gsm[0]||'', gsm[1]||'', gsm[2]||'', gsm[3]||'', gsm[4]||'',
    gsm[5]||'', gsm[6]||'', gsm[7]||'', gsm[8]||''
  ];

  var rows       = sheet.getDataRange().getValues();
  var searchProd = data.originalName || data.name;
  for (var i = 1; i < rows.length; i++) {
    if ((rows[i][0]||'').trim() === data.clientName.trim() && (rows[i][1]||'').trim() === searchProd.trim()) {
      sheet.getRange(i + 1, 1, 1, 16).setValues([row]);
      return;
    }
  }
  sheet.appendRow(row);
}

function deleteProduct(data) {
  var ss    = SpreadsheetApp.openById(ORDERS_SHEET_ID);
  var sheet = ss.getSheetByName('Products');
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

function savePurchase(data) {
  var ss    = SpreadsheetApp.openById(ORDERS_SHEET_ID);
  var sheet = ss.getSheetByName('Purchases');
  if (!sheet) return;
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Date','Supplier','Item','Qty','Unit','Rate','Total','Notes']);
  }
  sheet.appendRow([data.date || '', data.supplier || '', data.item || '',
                   data.qty || '', data.unit || '', data.rate || '',
                   data.total || '', data.notes || '']);
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

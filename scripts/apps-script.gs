// ══════════════════════════════════════════════════════════════
// Maniram Industries Factory OS — Apps Script Backend
// Paste this entire file into your Apps Script editor and
// Deploy → Manage Deployments → New Version → Deploy
// The deployment URL stays the same.
// ══════════════════════════════════════════════════════════════

var ORDERS_SHEET_ID = '1JVWfffLht7X_mGOyQb0QK1cB3vx68TTM1yx9pGZbb30';

var CLIENT_HEADERS   = ['Name', 'Contact', 'Phone', 'City'];
var PRODUCT_HEADERS  = ['ClientName', 'ProductName', 'BoxSize', 'Ply', 'Colour', 'Weight', 'ReelSize'];
var PURCHASE_HEADERS = ['ID', 'Supplier', 'ReelSize', 'GSM', 'BF', 'QuantityKg', 'RatePerKg',
                        'PurchaseDate', 'ExpectedDelivery', 'ActualDelivery',
                        'PaymentStatus', 'PaidAmount', 'Remarks', 'Status'];

function doGet() {
  return ContentService.createTextOutput('Maniram Industries Factory OS — Backend OK')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    var data  = JSON.parse(e.postData.contents);
    var ss    = SpreadsheetApp.openById(ORDERS_SHEET_ID);
    var extra = {};

    switch (data.action) {
      // ── Orders ──
      case 'update':         updateOrder(ss, data);      break;

      // ── Clients ──
      case 'saveClient':     saveClient(ss, data);       break;
      case 'deleteClient':   deleteClient(ss, data);     break;

      // ── Products ──
      case 'saveProduct':    saveProduct(ss, data);      break;
      case 'deleteProduct':  deleteProduct(ss, data);    break;

      // ── Purchases ──
      case 'savePurchase':   savePurchase(ss, data);     break;
      case 'updatePurchase': updatePurchase(ss, data);   break;
      case 'deletePurchase': deletePurchase(ss, data);   break;

      // ── Tally Sync ──
      case 'syncTally':      extra = syncTallyData(ss, data); break;

      // ── Default: new order ──
      default:               appendOrder(ss, data);      break;
    }

    return ContentService
      .createTextOutput(JSON.stringify(Object.assign({ success: true }, extra)))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ══════════════════════════════════════════════════════════════
// ORDERS
// ══════════════════════════════════════════════════════════════

var ORDER_HEADERS = [
  'Order ID', 'Customer', 'Product', 'Box Spec', 'Ply', 'Colour',
  'Weight(GM)', 'Quantity', 'Rate', 'Delivery Date', 'Status', 'Priority',
  'Reel Size', 'Reserved KG', 'Remarks'
];

function appendOrder(ss, d) {
  var sheet = ensureSheet(ss, 'Sheet1', ORDER_HEADERS);
  sheet.appendRow([
    d.id, d.customer, d.product, d.size, d.ply, d.colour,
    d.weight, d.qty, d.rate, d.date, d.status, d.priority,
    d.reelSize, d.reservedKg, d.remarks || ''
  ]);
}

function updateOrder(ss, d) {
  var sheet = ensureSheet(ss, 'Sheet1', ORDER_HEADERS);
  var vals  = [
    d.id, d.customer, d.product, d.size, d.ply, d.colour,
    d.weight, d.qty, d.rate, d.date, d.status, d.priority,
    d.reelSize, d.reservedKg, d.remarks || ''
  ];
  sheet.getRange(d.rowIndex, 1, 1, vals.length).setValues([vals]);
}

// ══════════════════════════════════════════════════════════════
// CLIENTS
// ══════════════════════════════════════════════════════════════

function saveClient(ss, d) {
  var sheet = ensureSheet(ss, 'Clients', CLIENT_HEADERS);
  var data  = sheet.getDataRange().getValues();

  // Find existing row by originalName (supports renames) or name
  var searchName = d.originalName || d.name;
  var foundRow   = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === searchName) { foundRow = i + 1; break; }
  }

  var row = [d.name, d.contact || '', d.phone || '', d.city || ''];

  if (foundRow > 0) {
    sheet.getRange(foundRow, 1, 1, 4).setValues([row]);

    // If name changed, update ClientName in all product rows
    if (d.originalName && d.originalName !== d.name) {
      var prodSheet = ensureSheet(ss, 'ClientProducts', PRODUCT_HEADERS);
      var pData     = prodSheet.getDataRange().getValues();
      for (var j = pData.length - 1; j >= 1; j--) {
        if (pData[j][0] === d.originalName) {
          prodSheet.getRange(j + 1, 1).setValue(d.name);
        }
      }
    }
  } else {
    sheet.appendRow(row);
  }
}

function deleteClient(ss, d) {
  // Delete client row
  var clients = ensureSheet(ss, 'Clients', CLIENT_HEADERS);
  var cData   = clients.getDataRange().getValues();
  for (var i = cData.length - 1; i >= 1; i--) {
    if (cData[i][0] === d.name) { clients.deleteRow(i + 1); break; }
  }

  // Delete all products for this client
  var products = ensureSheet(ss, 'ClientProducts', PRODUCT_HEADERS);
  var pData    = products.getDataRange().getValues();
  for (var j = pData.length - 1; j >= 1; j--) {
    if (pData[j][0] === d.name) { products.deleteRow(j + 1); }
  }
}

// ══════════════════════════════════════════════════════════════
// PRODUCTS
// ══════════════════════════════════════════════════════════════

function saveProduct(ss, d) {
  var sheet      = ensureSheet(ss, 'ClientProducts', PRODUCT_HEADERS);
  var data       = sheet.getDataRange().getValues();
  var searchName = d.originalName || d.name;
  var foundRow   = -1;

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === d.clientName && data[i][1] === searchName) {
      foundRow = i + 1; break;
    }
  }

  var row = [d.clientName, d.name, d.size || '', d.ply || '',
             d.colour || '', d.weight || '', d.reelSize || ''];

  if (foundRow > 0) {
    sheet.getRange(foundRow, 1, 1, 7).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

function deleteProduct(ss, d) {
  var sheet = ensureSheet(ss, 'ClientProducts', PRODUCT_HEADERS);
  var data  = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === d.clientName && data[i][1] === d.productName) {
      sheet.deleteRow(i + 1); break;
    }
  }
}

// ══════════════════════════════════════════════════════════════
// PURCHASES
// ══════════════════════════════════════════════════════════════

function savePurchase(ss, d) {
  var sheet = ensureSheet(ss, 'Purchases', PURCHASE_HEADERS);
  sheet.appendRow([
    d.id, d.supplier, d.reelSize, d.gsm || '', d.bf || '',
    d.quantityKg, d.ratePerKg, d.purchaseDate,
    d.expectedDelivery || '', d.actualDelivery || '',
    d.paymentStatus || 'Unpaid', d.paidAmount || 0,
    d.remarks || '', d.status || 'Pending'
  ]);
}

function updatePurchase(ss, d) {
  var sheet = ensureSheet(ss, 'Purchases', PURCHASE_HEADERS);
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === d.id) {
      sheet.getRange(i + 1, 1, 1, 14).setValues([[
        d.id, d.supplier, d.reelSize, d.gsm || '', d.bf || '',
        d.quantityKg, d.ratePerKg, d.purchaseDate,
        d.expectedDelivery || '', d.actualDelivery || '',
        d.paymentStatus || 'Unpaid', d.paidAmount || 0,
        d.remarks || '', d.status || 'Pending'
      ]]);
      break;
    }
  }
}

function deletePurchase(ss, d) {
  var sheet = ensureSheet(ss, 'Purchases', PURCHASE_HEADERS);
  var data  = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === d.id) { sheet.deleteRow(i + 1); break; }
  }
}

// ══════════════════════════════════════════════════════════════
// TALLY SYNC
// ══════════════════════════════════════════════════════════════

var TALLY_SYNC_HEADERS = [
  'SyncedAt', 'VoucherDate', 'Type', 'VoucherNo',
  'Party', 'Amount', 'Narration', 'MatchedOrderID', 'MatchStatus'
];

function syncTallyData(ss, d) {
  var syncSheet   = ensureSheet(ss, 'TallySync', TALLY_SYNC_HEADERS);
  var ordersSheet = ss.getSheetByName('Sheet1');
  var orderRows   = ordersSheet ? ordersSheet.getDataRange().getValues() : [];

  // Load existing sync rows to prevent duplicates
  var existing     = syncSheet.getDataRange().getValues();
  var syncedKeys   = {};
  for (var k = 1; k < existing.length; k++) {
    // Key = VoucherDate + VoucherNo
    syncedKeys[existing[k][1] + '|' + existing[k][3]] = true;
  }

  var vouchers = d.vouchers || [];
  var matched  = 0;
  var written  = 0;
  var skipped  = 0;
  var now      = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd/MM/yyyy HH:mm');

  for (var idx = 0; idx < vouchers.length; idx++) {
    var v = vouchers[idx];
    if (v.type !== 'Sales') continue;

    // Skip duplicates (same date + voucher number)
    var key = (v.date || d.date) + '|' + (v.number || '');
    if (syncedKeys[key]) { skipped++; continue; }

    var matchedId   = '';
    var matchStatus = 'Unmatched';
    var partyLower  = (v.party || '').toLowerCase().trim();

    // Match party name against order customer (partial, case-insensitive)
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

        // Auto-advance order status → Dispatched (only if currently active)
        var curStatus = (orderRows[i][10] || '').toString();
        if (curStatus === 'New' || curStatus === 'In Production' || curStatus === 'Ready') {
          try { ordersSheet.getRange(i + 1, 11).setValue('Dispatched'); } catch (e) {}
        }
        break;
      }
    }

    syncSheet.appendRow([
      now,
      v.date || d.date,
      v.type,
      v.number  || '',
      v.party   || '',
      v.amount  || 0,
      v.narration || '',
      matchedId,
      matchStatus
    ]);
    syncedKeys[key] = true;
    written++;
  }

  return { matched: matched, written: written, skipped: skipped };
}

// ══════════════════════════════════════════════════════════════
// UTIL
// ══════════════════════════════════════════════════════════════

function ensureSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    // Basic formatting for the header row
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#E8F0FE');
  }
  return sheet;
}

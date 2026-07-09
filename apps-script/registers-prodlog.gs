// ══════════════════════════════════════════════════════════════
// REGISTERS-PRODLOG.GS — Standalone Apps Script for "Registers" sheet
// Deploy as its OWN Web App (existing Code.gs ko touch mat karo).
// Steps:
//   1. Registers Google Sheet kholo → Extensions → Apps Script
//   2. Ye poora code paste karo (REG_SHEET_ID neeche check karo)
//   3. Deploy → New deployment → Web App → Execute as: Me,
//      Access: Anyone → Deploy → URL copy karo
//   4. URL js/config.js ke REGISTERS_SCRIPT_URL mein paste karo
// Tabs (ProdLog, GSMeta) pehli entry pe khud ban jayenge.
// ══════════════════════════════════════════════════════════════

const REG_SHEET_ID = ''; // ← Registers sheet ka ID yahan paste karo
                         // (blank chhoda toh bound sheet khud use hogi)

function _regSS() {
  return REG_SHEET_ID ? SpreadsheetApp.openById(REG_SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}
function _regTabGet(name, headers) {
  const ss = _regSS();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(headers); sh.setFrozenRows(1); }
  return sh;
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'registers', time: new Date().toISOString() }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.action === 'prodlogAppend') {
      const sh = _regTabGet('ProdLog', ['Date','Machine','OrderID','Qty','Remarks','Timestamp']);
      sh.appendRow([d.date||'', d.machine||'', d.orderId||'', d.qty||0, d.remarks||'', d.ts||new Date().toISOString()]);
    }
    else if (d.action === 'gsmSet') {
      const sh = _regTabGet('GSMeta', ['OrderID','GSM','Timestamp']);
      const data = sh.getDataRange().getValues();
      let row = -1;
      for (let i = 1; i < data.length; i++) if (String(data[i][0]) === String(d.orderId)) { row = i + 1; break; }
      if (row > 0) sh.getRange(row, 2, 1, 2).setValues([[d.gsm||'', d.ts||'']]);
      else sh.appendRow([d.orderId||'', d.gsm||'', d.ts||new Date().toISOString()]);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

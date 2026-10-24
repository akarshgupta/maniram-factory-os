'use strict';
// Server side — apps-script/Code.gs backupRecords, run against a fake
// SpreadsheetApp so the Apps Script logic is tested without Google.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { plain } = require('./load.js');

function fakeGoogle() {
  const sheets = {};
  const makeSheet = name => {
    const rows = [];
    return {
      name, rows,
      appendRow: r => rows.push(r.slice()),
      getLastRow: () => rows.length,
      setFrozenRows: () => {},
      getDataRange: () => ({ getValues: () => rows.map(r => r.slice()) }),
      getRange: (row, col, nRows = 1, nCols = 1) => ({
        setValues: vals => vals.forEach((v, i) => { rows[row - 1 + i] = rows[row - 1 + i] || []; v.forEach((x, j) => { rows[row - 1 + i][col - 1 + j] = x; }); }),
        getValue: () => (rows[row - 1] || [])[col - 1],
      }),
    };
  };
  const ss = {
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = makeSheet(n)),
  };
  return {
    sheets,
    SpreadsheetApp: { openById: () => ss },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Utilities: { formatDate: d => d.toISOString() },
    ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: { JSON: 'json' } },
  };
}

function loadCodeGs() {
  const g = fakeGoogle();
  const ctx = vm.createContext({ ...g, console, Date, Math, JSON });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../apps-script/Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
  return { g, run: c => vm.runInContext(c, ctx) };
}

const rec = (key, extra = {}) => ({ key, date: '2026-10-17', party: 'Test Traders', orders: 'MIORD1', qty: 10, amount: 0, json: JSON.stringify({ dcNum: key, ...extra }), ...extra });

test('backupRecords creates the tab with headers and upserts by key', () => {
  const { g, run } = loadCodeGs();
  run(`backupRecords(${JSON.stringify({ kind: 'challans', records: [rec('DC-1'), rec('DC-2')] })})`);
  const sh = g.sheets.ChallansBackup;
  assert.ok(sh, 'tab created');
  assert.deepEqual(plain(sh.rows[0]), ['Key', 'Date', 'Party', 'Orders', 'Qty', 'Amount', 'Updated', 'Deleted', 'Record']);
  assert.equal(sh.rows.length, 3);
  // Same key again → updated in place, not appended
  run(`backupRecords(${JSON.stringify({ kind: 'challans', records: [{ ...rec('DC-1'), qty: 99 }] })})`);
  assert.equal(sh.rows.length, 3);
  assert.equal(sh.rows[1][4], 99);
});

test('backupRecords marks deleted records instead of removing the row', () => {
  const { g, run } = loadCodeGs();
  run(`backupRecords(${JSON.stringify({ kind: 'invoices', records: [rec('INV1')] })})`);
  run(`backupRecords(${JSON.stringify({ kind: 'invoices', records: [{ key: 'INV1', deleted: true }] })})`);
  const sh = g.sheets.InvoicesBackup;
  assert.equal(sh.rows.length, 2);
  assert.equal(sh.rows[1][7], 'TRUE');
  assert.ok(sh.rows[1][8], 'the record itself is kept');
});

test('backupRecords ignores unknown kinds, junk input and oversized batches', () => {
  const { g, run } = loadCodeGs();
  run(`backupRecords({ kind: 'Orders', records: [${JSON.stringify(rec('X'))}] })`);         // could overwrite a real tab
  run(`backupRecords({ kind: 'challans', records: 'nope' })`);
  run(`backupRecords({ kind: 'challans', records: [{ key: '' }, null, 5] })`);
  run(`backupRecords({ kind: 'challans', records: Array.from({ length: 501 }, (_, i) => (${JSON.stringify(rec('K'))})) })`);
  assert.equal(Object.keys(g.sheets).filter(n => n !== 'ChallansBackup').length, 0, 'no other tab touched');
  const sh = g.sheets.ChallansBackup;
  assert.ok(!sh || sh.rows.length <= 1, 'nothing written');
});

test('doPost routes the backupRecords action', () => {
  const { g, run } = loadCodeGs();
  run(`doPost({ postData: { contents: ${JSON.stringify(JSON.stringify({ action: 'backupRecords', kind: 'payments', records: [rec('PAY1')] }))} } })`);
  assert.ok(g.sheets.PaymentsBackup && g.sheets.PaymentsBackup.rows.length === 2);
});

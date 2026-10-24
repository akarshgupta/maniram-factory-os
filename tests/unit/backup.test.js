'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts, plain } = require('./load.js');

// Browser side — js/backup.js
const load = () => loadScripts(['js/config.js', 'js/order-log.js', 'js/orders.js', 'js/invoices.js', 'js/challan.js', 'js/receivables.js', 'js/backup.js']);

const CHALLAN = { dcNum: 'DC-013/26', date: '2026-10-17', orderId: 'MIORD063', customer: 'Test Traders', product: 'Alpha Box', qty: 583, rate: 27.5, svTs: '10/18/2026 18:41:05' };
const INVOICE = { id: 'INV052', date: '2026-10-21', party: 'Test Traders', orderId: 'MIORD062', total: 46465, items: [{ desc: 'Alpha Box', qty: 1387, rate: 33.5, orderId: 'MIORD062', challanDc: 'DC-052/26' }] };

test('backup rows: readable columns plus the full record, keyed by DC / invoice number', () => {
  const app = load();
  const [c] = plain(app.get('_bkRows')('challans', [CHALLAN]));
  assert.equal(c.key, 'DC-013/26');
  assert.equal(c.date, '2026-10-17');
  assert.equal(c.party, 'Test Traders');
  assert.equal(c.orders, 'MIORD063');
  assert.equal(c.qty, 583);
  assert.deepEqual(JSON.parse(c.json), CHALLAN);

  const [i] = plain(app.get('_bkRows')('invoices', [INVOICE]));
  assert.equal(i.key, 'INV052');
  assert.equal(i.qty, 1387);
  assert.equal(i.amount, 46465);
  assert.deepEqual(JSON.parse(i.json), INVOICE);
});

test('order-log rows get a stable key (same event backed up twice = one row)', () => {
  const app = load();
  const e = { orderId: 'MIORD063', event: 'Dispatched', detail: 'DC-013/26 · 583 pcs', ts: '2026-10-18T13:11:05.000Z' };
  const a = plain(app.get('_bkRows')('orderlog', [e]))[0], b = plain(app.get('_bkRows')('orderlog', [{ ...e }]))[0];
  assert.equal(a.key, b.key);
  assert.equal(a.orders, 'MIORD063');
});

test('only new or changed records are sent again; deleted ones are marked deleted', () => {
  const app = load();
  const rows = app.get('_bkRows');
  const diff = app.get('_bkDiff');
  const first = plain(diff('challans', rows('challans', [CHALLAN, { ...CHALLAN, dcNum: 'DC-014/26' }]), {}));
  assert.equal(first.send.length, 2);
  // Nothing changed → nothing to send
  const again = plain(diff('challans', rows('challans', [CHALLAN, { ...CHALLAN, dcNum: 'DC-014/26' }]), first.state));
  assert.equal(again.send.length, 0);
  // One edited, one deleted
  const later = plain(diff('challans', rows('challans', [{ ...CHALLAN, qty: 783 }]), first.state));
  assert.deepEqual(later.send.map(r => [r.key, !!r.deleted]).sort(), [['DC-013/26', false], ['DC-014/26', true]]);
});

test('backupNow posts changed records to Apps Script in batches of 200', async () => {
  const app = load();
  app.run(`challanList = ${JSON.stringify(Array.from({ length: 450 }, (_, n) => ({ ...CHALLAN, dcNum: 'DC-' + n })))};
           invoiceList = []; payments = []; orderLog = [];`);
  await app.get('backupNow')();
  const posts = app.posts.filter(p => p.body && p.body.action === 'backupRecords');
  assert.equal(posts.length, 3);
  assert.deepEqual(plain(posts.map(p => p.body.records.length)), [200, 200, 50]);
  assert.ok(posts.every(p => p.body.kind === 'challans'));
  // Second run with nothing changed sends nothing
  app.posts.length = 0;
  await app.get('backupNow')();
  assert.equal(app.posts.filter(p => p.body && p.body.action === 'backupRecords').length, 0);
});

test('restore adds only missing records, never overwrites local ones, skips deleted and broken rows', () => {
  const app = load();
  app.run(`challanList = [${JSON.stringify({ ...CHALLAN, qty: 999 })}];`);
  const sheetRows = [
    ['Key', 'Date', 'Party', 'Orders', 'Qty', 'Amount', 'Updated', 'Deleted', 'Record'],
    ['DC-013/26', '', '', '', '', '', '', '', JSON.stringify(CHALLAN)],                                   // exists locally → kept as is
    ['DC-020/26', '', '', '', '', '', '', '', JSON.stringify({ ...CHALLAN, dcNum: 'DC-020/26', svTs: '10/19/2026 09:00:00' })],  // missing → added
    ['DC-021/26', '', '', '', '', '', '', 'TRUE', JSON.stringify({ ...CHALLAN, dcNum: 'DC-021/26' })],  // deleted → skipped
    ['DC-022/26', '', '', '', '', '', '', '', '{not json'],                                              // broken → skipped
    ['DC-023/26', '', '', '', '', '', '', '', JSON.stringify({ hello: 1 })],                              // wrong shape → skipped
  ];
  const added = app.get('_bkRestoreRows')('challans', sheetRows);
  assert.equal(added, 1);
  const list = plain(app.get('challanList'));
  assert.deepEqual(list.map(c => c.dcNum).sort(), ['DC-013/26', 'DC-020/26']);
  assert.equal(list.find(c => c.dcNum === 'DC-013/26').qty, 999);
});

test('restore never adds a second challan for a supervisor line this computer already has', () => {
  const app = load();
  app.run(`challanList = [{ dcNum: 'DC-001/26', qty: 500, svTs: '10/20/2026 10:00:00', orderId: 'MIORD201' }]; invoiceList = [];`);
  const head = ['Key', 'Date', 'Party', 'Orders', 'Qty', 'Amount', 'Updated', 'Deleted', 'Record'];
  const added = app.get('_bkRestoreRows')('challans', [head, ['DC-901/26', '', '', '', '', '', '', '', JSON.stringify({ dcNum: 'DC-901/26', qty: 500, svTs: '10/20/2026 10:00:00' })]]);
  assert.equal(added, 0);
  // …and the invoice that billed the skipped challan is skipped too
  const addedInv = app.get('_bkRestoreRows')('invoices', [head, ['INV901', '', '', '', '', '', '', '', JSON.stringify({ id: 'INV901', items: [{ qty: 500, rate: 30, challanDc: 'DC-901/26' }] })]]);
  assert.equal(addedInv, 0);
});

test('an empty computer is detected so restore can run before anything is rebuilt', () => {
  const app = load();
  app.run(`challanList = []; invoiceList = []; payments = []; orderLog = [];`);
  assert.equal(app.get('_bkIsEmpty')(), true);
  app.run(`challanList = [{ dcNum: 'DC-1', qty: 1 }];`);
  assert.equal(app.get('_bkIsEmpty')(), false);
});

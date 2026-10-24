'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts, plain } = require('./load.js');

// ── Office: supervisor-log.js matching rules ──
const office = loadScripts(['js/config.js', 'js/order-log.js', 'js/orders.js', 'js/invoices.js', 'js/challan.js', 'js/supervisor-log.js', 'js/health-check.js']);

test('_dimsKey treats 20x14x28, 20*14*28 and 14*20*28 as the same box', () => {
  const k = office.get('_dimsKey');
  assert.equal(k('20×14×28'), k('20*14*28'));
  assert.equal(k('PLAIN 20*14*28 · 3 Ply'), k('14x20x28'));
  assert.notEqual(k('20*14*28'), k('18*19*10'));
  assert.equal(k('no size here'), '');
});

test('_svFifoPlan fills the oldest order first, newest takes the rest', () => {
  office.run(`orders = [
    { id: 'A', qty: 1000, status: 'New' },
    { id: 'B', qty: 3000, status: 'New' }];
    challanList = [{ dcNum: 'DC-1', orderId: 'A', qty: 613 }];`);
  const plan = office.get('_svFifoPlan')(3000, office.run(`[orders[0], orders[1]]`));
  assert.deepEqual(plain(plan.map(p => [p.o.id, p.take])), [['A', 387], ['B', 2613]]);
});

test('_svSameItemQueue: Blue and Red of the same box are different items', () => {
  office.run(`orders = [
    { id: 'O1', customer: 'Om Sai', product: '20*14*30', size: '20*14*30', colour: 'Blue', qty: 2000, status: 'New', orderDate: '2026-10-04' },
    { id: 'O2', customer: 'Om Sai', product: '20*14*30', size: '20*14*30', colour: 'Red',  qty: 2000, status: 'New', orderDate: '2026-10-04' }];
    challanList = [];`);
  const q = office.get('_svSameItemQueue')(office.run('orders[1]'), '2026-10-24');
  assert.deepEqual(plain(q.map(o => o.id)), ['O2']);
});

test('_svSameItemQueue: "Jalpari" is not "Supreme Jalpari"', () => {
  office.run(`orders = [
    { id: 'J1', customer: 'NDS Paper', product: 'JALPARI', size: '26*13*22', qty: 1000, status: 'New', orderDate: '2026-09-22' },
    { id: 'J2', customer: 'NDS Paper', product: 'SUPREME JALPARI', size: '26*13*22', qty: 1000, status: 'New', orderDate: '2026-09-22' }];`);
  assert.deepEqual(plain(office.get('_svSameItemQueue')(office.run('orders[1]'), '2026-10-24').map(o => o.id)), ['J2']);
});

test('generateOrderId never hands out the number of a deleted order', () => {
  office.run(`orders = [{ id: 'MIORD122' }]; challanList = [{ orderId: 'MIORD123' }]; invoiceList = [];`);
  assert.equal(office.get('generateOrderId')(), 'MIORD124');
});

test('dispatch edited in the staff portal: challan and its invoice line follow the new pieces', () => {
  office.run(`
    orders = [{ id: 'MIORD063', customer: 'RP Products', product: 'X', size: '17*11.5*27', qty: 5000, rate: 27.5, status: 'New' }];
    challanList = [{ dcNum: 'DC-013/26', orderId: 'MIORD063', qty: 583, rate: 27.5, svTs: '10/18/2026 18:41:05', createdAt: '2026-10-18' }];
    invoiceList = [{ id: 'INV1', items: [{ challanDc: 'DC-013/26', qty: 583, rate: 27.5, orderId: 'MIORD063' }], total: 16033 }];
    _svDisp = [{ ts: '10/18/2026 18:41:05', date: '10/17/2026', pcs: 783, notes: 'Edited 24 Oct 15:04: pieces 583 → 783' }];
    _svReconcileEditedDispatches();`);
  assert.equal(office.run('challanList[0].qty'), 783);
  assert.equal(office.run('invoiceList[0].items[0].qty'), 783);
  assert.equal(office.run('invoiceList[0].total'), Math.round(783 * 27.5));
});

test('unedited dispatch lines are never "reconciled"', () => {
  office.run(`
    challanList = [{ dcNum: 'DC-2', orderId: 'MIORD063', qty: 500, svTs: 'T2' }];
    _svDisp = [{ ts: 'T2', pcs: 700, notes: '' }];
    _svReconcileEditedDispatches();`);
  assert.equal(office.run('challanList[0].qty'), 500);
});

// ── Staff portal: staff-app.js ──
const staff = loadScripts(['js/config.js', 'js/staff-app.js']);

test('_deDayKey reads the form date format M/D/YYYY (and a hand-typed D/M/YYYY)', () => {
  const k = staff.get('_deDayKey');
  assert.equal(k('10/17/2026'), '2026-10-17');
  assert.equal(k('17/10/2026'), '2026-10-17');
  assert.equal(k('2026-10-17'), '2026-10-17');
  assert.equal(k(''), '');
});

test('_staffTsNum sorts 30 Sept before 1 Oct (text order would not)', () => {
  const n = staff.get('_staffTsNum');
  assert.ok(n('9/30/2026 10:00:00') < n('10/1/2026 09:00:00'));
});

test('staff dispatched counts: lines without an Order ID go to the oldest matching order', () => {
  staff.run(`
    staffOrders = [
      { id: 'MIORD062', customer: 'RP Products', product: 'Jalrani', size: '26*13*22', qty: 2000, orderDate: '2026-09-08', status: 'New' },
      { id: 'MIORD093', customer: 'RP Products', product: 'Jalrani', size: '26*13*22', qty: 3000, orderDate: '2026-10-05', status: 'New' }];
    staffDispatchLog = [
      { ts: '10/1/2026 10:00:00', date: '10/1/2026', party: 'RP Prodect', product: 'Jalrani', size: '26*13*22', pcs: 2500, orderId: '' },
      { ts: '10/2/2026 10:00:00', date: '10/2/2026', party: 'RP Products', product: 'Jalrani', size: '26*13*22', pcs: 100, orderId: 'MIORD093' }];
    _deLoggedMap = null;`);
  assert.equal(staff.get('_deLogged')('MIORD062'), 2000);
  assert.equal(staff.get('_deLogged')('MIORD093'), 600);
});

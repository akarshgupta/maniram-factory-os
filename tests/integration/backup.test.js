'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startSuite, newPage } = require('./harness.js');

let suite;
test.before(async () => { suite = await startSuite(); });
test.after(async () => { if (suite) await suite.close(); });

const LOCAL = {
  mi_challans_v2: JSON.stringify([{ dcNum: 'DC-001/26', date: '2026-10-20', orderId: 'MIORD201', customer: 'Test Traders', product: 'Alpha Box', qty: 100, rate: 30, svTs: 'x1' }]),
  mi_invoices_v2: JSON.stringify([{ id: 'INV001', date: '2026-10-20', party: 'Test Traders', orderId: 'MIORD201', total: 3000, items: [{ desc: 'Alpha Box', qty: 100, rate: 30, orderId: 'MIORD201', challanDc: 'DC-001/26' }] }]),
};

test('office backs up local challans and invoices to the backup tabs on load', async () => {
  const { page, writes, errors } = await newPage(suite, { storage: LOCAL });
  await page.waitForTimeout(5000);
  const sent = writes.filter(w => w && w.action === 'backupRecords');
  const keys = kind => sent.filter(w => w.kind === kind).flatMap(w => w.records.map(r => r.key));
  assert.ok(keys('challans').includes('DC-001/26'));
  assert.ok(keys('invoices').includes('INV001'));
  const inv = sent.find(w => w.kind === 'invoices').records.find(r => r.key === 'INV001');
  assert.deepEqual(JSON.parse(inv.json).items[0], { desc: 'Alpha Box', qty: 100, rate: 30, orderId: 'MIORD201', challanDc: 'DC-001/26' });
  assert.deepEqual(errors, []);
  await page.close();
});

test('☁️ button shows how much of the local data is in the backup sheet', async () => {
  const { page } = await newPage(suite, { storage: LOCAL });
  await page.waitForTimeout(5000);
  const label = await page.textContent('#backup-btn');
  assert.match(label, /☁️/);
  await page.click('#backup-btn');
  const panel = await page.textContent('#backup-overlay');
  assert.match(panel, /Challans/);
  assert.match(panel, /Invoices/);
  await page.close();
});

test('restore on an empty browser brings back missing records from the backup sheet', async () => {
  const { page, errors } = await newPage(suite);
  await page.waitForTimeout(4000);
  await page.click('#backup-btn');
  await page.click('text=Restore missing records');
  await page.waitForTimeout(1500);
  // (the app also makes its own challans from the sample supervisor dispatches)
  const dcs = await page.evaluate(() => challanList.map(c => c.dcNum));
  assert.ok(dcs.includes('DC-901/26') && dcs.includes('DC-902/26'), 'backed-up challans restored');
  // DC-903/26 was deleted before the backup (1 pc); the number may be reused by a new challan, the record must not come back
  assert.ok(!(await page.evaluate(() => challanList.some(c => c.dcNum === 'DC-903/26' && c.qty === 1 && !c.svTs))), 'deleted record stays deleted');
  assert.ok(await page.evaluate(() => invoiceList.some(i => i.id === 'INV901')));
  // survives a refresh
  await page.reload();
  await page.waitForTimeout(3000);
  assert.ok(await page.evaluate(() => challanList.some(c => c.dcNum === 'DC-901/26')));
  assert.deepEqual(errors, []);
  await page.close();
});

test('security: hostile text inside a backup record never runs after restore', async () => {
  const { page } = await newPage(suite);
  await page.waitForTimeout(4000);
  await page.click('#backup-btn');
  await page.click('text=Restore missing records');
  await page.waitForTimeout(1000);
  await page.evaluate(() => { showPage('orders'); switchOrderTab('challans'); });
  await page.waitForTimeout(800);
  await page.evaluate(() => showPage('invoicing'));
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => window.__xss || 0), 0);
  await page.close();
});

test('a wiped computer restores from the backup BEFORE rebuilding challans — no dispatch counted twice', async () => {
  const { page, errors } = await newPage(suite);          // empty browser storage
  await page.waitForTimeout(6000);
  // DC-901/26 in the backup came from the 20 Oct 10:00:00 supervisor line
  const sameLine = await page.evaluate(() => challanList.filter(c => c.svTs === '10/20/2026 10:00:00').map(c => c.dcNum));
  assert.deepEqual(sameLine, ['DC-901/26']);
  // and its invoice is the restored one, not a second one
  const billed = await page.evaluate(() => invoiceList.filter(i => i.items.some(it => it.challanDc === 'DC-901/26')).map(i => i.id));
  assert.deepEqual(billed, ['INV901']);
  // 500 restored (20 Oct) + 200 from the separate 21 Oct line — the 20 Oct line counted once
  assert.equal(await page.evaluate(() => getDispatchedQty('MIORD201')), 700);
  assert.deepEqual(errors, []);
  await page.close();
});

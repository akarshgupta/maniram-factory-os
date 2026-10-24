'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startSuite, newPage } = require('./harness.js');

let suite;
test.before(async () => { suite = await startSuite(); });
test.after(async () => { if (suite) await suite.close(); });

const settle = page => page.waitForTimeout(2500);

// ── Office portal ──
test('office: loads orders from the Orders sheet with no script errors', async () => {
  const { page, errors } = await newPage(suite);
  await settle(page);
  const ids = await page.evaluate(() => orders.map(o => o.id));
  assert.ok(ids.includes('MIORD201') && ids.includes('MIORD150'));
  assert.deepEqual(errors, []);
  await page.close();
});

test('office: an order with no rate is flagged "No rate set"', async () => {
  const { page } = await newPage(suite);
  await settle(page);
  await page.evaluate(() => { showPage('orders'); renderOrders(); });
  assert.ok(await page.locator('text=No rate set').count() >= 1);
  await page.close();
});

test('office: Vehicles page shows sheet vehicles, old "Tempo" as "3 Wheeler Loading", and trips', async () => {
  const { page, errors } = await newPage(suite);
  await settle(page);
  await page.evaluate(() => { _vhMonth = '2026-10'; showPage('vehicles'); });
  await page.waitForTimeout(1500);
  const text = await page.textContent('#vehicles-root');
  assert.match(text, /UP93XX0001/);
  assert.match(text, /3 Wheeler Loading/);
  assert.doesNotMatch(text, /Tempo/);
  assert.deepEqual(errors, []);
  await page.close();
});

// ── Staff portal ──
test('staff: party → pending order → save posts one dispatch row with vehicle and trip', async () => {
  const { page, writes, errors } = await newPage(suite, { portal: 'staff', viewport: { width: 420, height: 1200 } });
  await settle(page);
  await page.click('.staff-tabs >> text=🚚 Dispatch Entry');
  await settle(page);
  await page.selectOption('#de-vehicle', 'UP93XX0001');
  await page.fill('#de-party', 'Test Traders');
  await page.waitForTimeout(200);
  const cards = page.locator('#de-orders [data-oid]');
  assert.equal(await cards.count(), 2, 'both pending Test Traders orders listed');
  await cards.first().click();
  assert.equal(await page.locator('#de-orders [data-oid]:visible').count(), 1, 'other order hides once one is picked');
  await page.fill('#de-pcs', '250');
  await page.fill('#de-wtpc', '610');
  await page.click('text=💾 Save Dispatch');
  await page.waitForTimeout(500);
  const sent = writes.filter(w => w && w.action === 'supervisorDispatchAppend');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].orderId, 'MIORD201');
  assert.equal(sent[0].pcs, 250);
  assert.equal(sent[0].vehicle, 'UP93XX0001');
  assert.ok(sent[0].tripId);
  assert.deepEqual(errors, []);
  await page.close();
});

test('staff: editing a dispatch line saves the change with an "Edited …: pieces a → b" note', async () => {
  const { page, writes } = await newPage(suite, { portal: 'staff' });
  await settle(page);
  await page.click('.staff-tabs >> text=🚚 Dispatch Entry');
  await settle(page);
  await page.fill('#de-day', '2026-10-20');
  await page.dispatchEvent('#de-day', 'change');
  // The Alpha Box line on 20 Oct was logged as 500 pcs
  await page.locator('#de-list div', { hasText: 'Alpha Box' }).locator('text=✏️ Edit').last().click();
  await page.fill('#dee-pcs', '550');
  await page.click('text=💾 Save changes');
  await page.waitForTimeout(300);
  const upd = writes.find(w => w && w.action === 'supervisorDispatchUpdate');
  assert.ok(upd, 'update posted');
  assert.equal(upd.pcs, 550);
  assert.match(upd.notes, /Edited .*pieces 500 → 550/);
  await page.close();
});

test('staff: refresh reopens the tab that was open', async () => {
  const { page } = await newPage(suite, { portal: 'staff' });
  await settle(page);
  await page.click('.staff-tabs >> text=🚛 Vehicles');
  await page.reload();
  await settle(page);
  assert.match(await page.textContent('#staff-page-title'), /Vehicles/);
  await page.close();
});

test('staff: fits a phone screen (no sideways page scroll)', async () => {
  const { page } = await newPage(suite, { portal: 'staff', viewport: { width: 390, height: 900 } });
  await settle(page);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  await page.close();
});

// ── Security: hostile text in a sheet must never run in either portal ──
for (const portal of ['office', 'staff']) {
  test(`security (${portal}): HTML typed into the sheets is shown as text, never run`, async () => {
    const { page } = await newPage(suite, { portal });
    await settle(page);
    // Visit every place that shows sheet text
    const visits = portal === 'office'
      ? ['orders', 'svlog', 'vehicles', 'dashboard']
      : ['orders', 'dispatchentry', 'vehicles'];
    for (const v of visits) {
      await page.evaluate(id => (typeof showPage === 'function' ? showPage(id) : showStaffTab(id)), v);
      await page.waitForTimeout(700);
    }
    if (portal === 'office') await page.evaluate(() => { showPage('orders'); switchOrderTab('grouped'); });
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.__xss || 0), 0, 'injected script ran');
    await page.close();
  });
}

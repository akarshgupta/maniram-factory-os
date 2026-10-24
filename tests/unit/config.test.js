'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts, plain } = require('./load.js');

const app = loadScripts(['js/config.js']);

test('calcBoxWeight: 20x14x28 in, 5-ply, 100 GSM, with margin = 1151.6 gm (same as office Rate Calculator)', () => {
  const r = app.get('calcBoxWeight')(20, 14, 28, [100, 100, 100, 100, 100], true);
  assert.equal(r.sheetL, 70);              // (20+14)*2+2
  assert.equal(r.sheetW, 42.5);            // 14+28+0.5
  assert.equal(r.twoPart, false);
  assert.equal(r.totalWeight.toFixed(1), '1151.6');
});

test('calcBoxWeight: flutes count at GSM x 1.5, liners at GSM', () => {
  const r = app.get('calcBoxWeight')(10, 10, 10, [100, 100, 100], false);
  const area = (42 * 20) / 1550;
  assert.ok(Math.abs(r.layerWeights[0].weight - 100 * area) < 1e-9);
  assert.ok(Math.abs(r.layerWeights[1].weight - 150 * area) < 1e-9);
  assert.equal(r.layerWeights[1].type, 'Flute');
});

test('calcBoxWeight: 5-ply over 76" sheet length is a two-part box (+4 instead of +2)', () => {
  const r = app.get('calcBoxWeight')(25, 14, 20, [100, 100, 100, 100, 100], true);
  assert.equal(r.twoPart, true);
  assert.equal(r.sheetL, (25 + 14) * 2 + 4);
});

test('calcBoxWeight: 3-ply between 80" and 82" is the special single-piece case', () => {
  const r = app.get('calcBoxWeight')(26, 14.5, 20, [100, 100, 100], true);   // (40.5)*2+2 = 83 → two-part
  assert.equal(r.twoPart, true);
  const s = app.get('calcBoxWeight')(25.5, 14, 20, [100, 100, 100], true);   // 79*2+2 = 81 → special
  assert.equal(s.special, true);
  assert.equal(s.twoPart, false);
});

test('vehicleKey ignores spaces, case and punctuation', () => {
  const k = app.get('vehicleKey');
  assert.equal(k('up93 ab-1234'), 'UP93AB1234');
  assert.equal(k(' UP 93 AB 1234 '), k('up93ab1234'));
});

test('vehicleTypeName: old "Tempo" and "Loading" show as "3 Wheeler Loading"', () => {
  const n = app.get('vehicleTypeName');
  assert.equal(n('Tempo'), '3 Wheeler Loading');
  assert.equal(n(' tempo '), '3 Wheeler Loading');
  assert.equal(n('Loading'), '3 Wheeler Loading');
  assert.equal(n('Tata Ace'), 'Tata Ace');
  assert.ok(app.get('VEHICLE_TYPES').includes('Passenger CNG'));
});

test('isColouredMark / cleanBf: GY, sg, 18sg, 18bfsg mark a coloured reel; BF keeps digits only', () => {
  const coloured = app.get('isColouredMark'), bf = app.get('cleanBf');
  for (const v of ['GY', 'gy', 'sg', '18sg', '18bfsg']) assert.equal(coloured(v), true, v);
  for (const v of ['', 'N', '18', 'Normal']) assert.equal(coloured(v), false, v);
  assert.equal(bf('18bfsg'), '18');
  assert.equal(bf('22 BF'), '22');
});

// ── Security (TDD): text read from the Google Sheets is shown with innerHTML
// all over the app. Anyone who can type into a sheet (the supervisor's
// product names, notes, party names) could otherwise plant HTML/script that
// runs in the owner's browser — where the Anthropic API key also lives.
test('cleanSheetText strips anything that could become HTML, keeps normal text', () => {
  const clean = app.get('cleanSheetText');
  assert.equal(clean('<img src=x onerror=alert(1)>'), '‹img src=x onerror=alert(1)›');
  assert.equal(clean('Choti Lily 20*14*28'), 'Choti Lily 20*14*28');
  assert.equal(clean('A & B "quoted"'), 'A & B "quoted"');
  assert.equal(clean(1200), 1200);          // numbers untouched
  assert.equal(clean(undefined), undefined);
});

test('cleanSheetRows cleans every cell of every row', () => {
  const rows = app.get('cleanSheetRows')([['MIORD1', '<b>x</b>'], ['MIORD2', 'ok']]);
  assert.deepEqual(plain(rows), [['MIORD1', '‹b›x‹/b›'], ['MIORD2', 'ok']]);
});

# Tests

Zero-install test suite built on Node's own test runner (`node:test`) — the
app itself still has no npm, bundler or build step.

```bash
node tests/run.js              # everything
node tests/run.js unit         # fast, no browser
node tests/run.js integration  # drives real Chromium through both portals
```

## Unit tests — `tests/unit/*.test.js`

`tests/unit/load.js` loads the app's real `js/*.js` files into a Node `vm`
context (same shared global scope as `<script>` tags in the page) with small
browser stubs, so pure logic is tested directly:

```js
const { loadScripts, plain } = require('./load.js');
const app = loadScripts(['js/config.js', 'js/invoices.js']);
app.get('calcBoxWeight')(20, 14, 28, [100, 100, 100], true);
app.run(`orders = [{ id: 'MIORD1' }]`);         // set up state in that scope
assert.deepEqual(plain(sandboxArray), [...]);    // compare sandbox values via plain()
```

Writes (`fetch` to Apps Script) are captured in `app.posts`, never sent.

## Integration tests — `tests/integration/*.test.js`

`harness.js` serves the repo on a random local port, opens `index.html` /
`staff.html` in Chromium already logged in, answers **every Google Sheets read
from `tests/fixtures/sheets.js`** (made-up data — the repo is public, never
copy real customers, rates or phone numbers here), records every Apps Script
write in `writes`, and blocks every other outside request. Tests never touch
the live sheets.

Needs Playwright + Chromium once: `npm i -g playwright && npx playwright install chromium`
(or set `CHROMIUM_PATH`).

## Security tests

`tests/fixtures/sheets.js` deliberately contains hostile text (`XSS`) in
order, dispatch and vehicle fields; the `security (office|staff)` tests fail
if it ever runs as code. Add hostile cases here whenever a new field from a
sheet is shown on screen.

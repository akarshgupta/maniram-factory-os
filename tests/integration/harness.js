// Integration-test harness: serves the repo over a local HTTP server, drives
// real Chromium through both portals, answers every Google Sheets read from
// tests/fixtures/sheets.js, records every Apps Script write (never sent),
// and blocks every other outside request — so tests are repeatable and can
// never touch the live sheets.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { answerSheets } = require('../fixtures/sheets.js');

const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function loadPlaywright() {
  const tries = ['playwright', 'playwright-core', '/opt/node22/lib/node_modules/playwright', '/opt/node22/lib/node_modules/playwright-core'];
  for (const t of tries) { try { return require(t); } catch (e) { /* next */ } }
  throw new Error('Playwright not found. Install it once with: npm i -g playwright  (then run: npx playwright install chromium)');
}

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  return fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
}

// The two sheet IDs the fixtures answer for, read from the real config.js
function readConfig() {
  const src = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');
  const id = name => (src.match(new RegExp(`const ${name}\\s*=\\s*'([^']+)'`)) || [])[1];
  return { ORDERS_SHEET_ID: id('ORDERS_SHEET_ID'), SUPERVISOR_SHEET_ID: id('SUPERVISOR_SHEET_ID') };
}

function startServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function startSuite() {
  const { chromium } = loadPlaywright();
  const { server, base } = await startServer();
  const browser = await chromium.launch({ executablePath: chromiumPath() });
  const cfg = readConfig();
  return {
    base, browser, cfg,
    async close() { await browser.close(); server.close(); },
  };
}

// A page with sheets mocked, writes recorded, outside world blocked
async function newPage(suite, { portal = 'office', viewport = { width: 1280, height: 900 }, storage = {} } = {}) {
  const page = await suite.browser.newPage({ viewport });
  const errors = [], writes = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(suite.base)) return route.continue();
    if (url.includes('sheets.googleapis.com')) {
      const r = answerSheets(url, suite.cfg);
      return route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.body) });
    }
    if (url.includes('script.google.com')) {
      try { writes.push(JSON.parse(route.request().postData() || 'null')); } catch (e) { writes.push(route.request().postData()); }
      return route.fulfill({ status: 200, body: '' });
    }
    return route.abort();      // fonts, CDNs, anything else
  });
  const seed = portal === 'staff'
    ? { mi_staff_pin_v1: 'x', mi_staff_session_v1: JSON.stringify({ ok: true, expires: Date.now() + 864e5 }) }
    : { mi_auth_session_v1: JSON.stringify({ ok: true, expires: Date.now() + 864e5 }) };
  await page.addInitScript(items => { if (sessionStorage.getItem('__seeded')) return; sessionStorage.setItem('__seeded', '1'); for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v); }, { ...seed, ...storage });
  await page.goto(`${suite.base}/${portal === 'staff' ? 'staff.html' : 'index.html'}`);
  return { page, errors, writes };
}

module.exports = { startSuite, newPage };

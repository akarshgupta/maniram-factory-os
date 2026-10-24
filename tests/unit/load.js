// Loads the app's real browser scripts (plain global-scope files, no
// modules) into a Node `vm` context with just enough browser stubs to run
// their logic. Top-level const/let/functions are shared between the files
// loaded into one context, exactly like <script> tags in a page.
//
//   const app = loadScripts(['js/config.js', 'js/invoices.js']);
//   app.get('calcBoxWeight')(20, 14, 28, [100, 100, 100], true);
//   app.run('orders = [...]');            // run any statement in that scope
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');

function makeLocalStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    clear: () => m.clear(),
  };
}

// A do-nothing element: lets render code that the logic under test calls
// along the way (renderOrders, renderChallansTab, …) run without a page.
function makeElement() {
  const noop = () => {};
  return {
    style: {}, dataset: {}, value: '', innerHTML: '', textContent: '', checked: false,
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: noop, removeChild: noop, setAttribute: noop, getAttribute: () => null,
    addEventListener: noop, focus: noop, closest: () => null,
    querySelector: () => null, querySelectorAll: () => [],
  };
}

function makeDocument() {
  const noop = () => {};
  return {
    readyState: 'loading',          // keeps app.js / staff-app.js from running init()
    addEventListener: noop,
    removeEventListener: noop,
    getElementById: () => makeElement(),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => makeElement(),
    body: makeElement(),
  };
}

// Values made inside the sandbox have the sandbox's own Array/Object, so
// deepStrictEqual against test literals fails on prototype alone — compare
// plain copies instead.
const plain = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

function loadScripts(files, extraGlobals = {}) {
  const posts = [];
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    Date, Math, JSON, Intl, URL, Promise,
    localStorage: makeLocalStorage(),
    sessionStorage: makeLocalStorage(),
    document: makeDocument(),
    navigator: { clipboard: null },
    alert: () => {}, confirm: () => true, prompt: () => null,
    // Writes are captured, never sent
    fetch: (url, opts) => { posts.push({ url: String(url), body: opts && opts.body ? JSON.parse(opts.body) : null }); return Promise.resolve({ json: async () => ({ values: [] }) }); },
    ...extraGlobals,
  };
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of files) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
  return {
    ctx,
    posts,
    get: name => vm.runInContext(name, ctx),
    run: code => vm.runInContext(code, ctx),
  };
}

module.exports = { loadScripts, plain, ROOT };

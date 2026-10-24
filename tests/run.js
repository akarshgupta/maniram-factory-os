#!/usr/bin/env node
// Runs the whole test suite:  node tests/run.js            (unit + integration)
//                             node tests/run.js unit       (unit only — no browser needed)
//                             node tests/run.js integration
// Uses only Node's built-in test runner. Integration tests also need
// Playwright + Chromium (see tests/README.md).
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const which = process.argv[2] || 'all';
const dir = d => fs.readdirSync(path.join(__dirname, d)).filter(f => f.endsWith('.test.js')).map(f => path.join(__dirname, d, f));
const run = (label, files, extra = []) => {
  console.log(`\n━━ ${label} (${files.length} file${files.length === 1 ? '' : 's'}) ━━`);
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...extra, ...files], { stdio: 'inherit', env: process.env });
  return r.status === 0;
};

let ok = true;
if (which === 'all' || which === 'unit') ok = run('Unit tests', dir('unit')) && ok;
if (which === 'all' || which === 'integration') ok = run('Integration tests', dir('integration')) && ok;
console.log(ok ? '\n✅ All tests passed' : '\n❌ Some tests failed');
process.exit(ok ? 0 : 1);

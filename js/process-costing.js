// ══════════════════════════════════════════════════════════════
// PROCESS-COSTING.JS — Cost per kg for process batches (gum, stitching, …)
// Data backend: Google Sheets (ProcessLog tab in ORDERS_SHEET_ID), written
// by the Staff Portal's ⚗️ Process Log tab (js/staff-app.js) via the
// processLogAppend Apps Script action. Read-only here.
//
// Cost/unit = (raw material kg × owner's ₹/kg rate for that process) / output qty.
// The rate is a sticky per-process assumption in localStorage only — same
// tradeoff as job-costing.js's paper/conversion rates — so it has to be
// re-entered on each browser/device rather than syncing across them.
// ══════════════════════════════════════════════════════════════

const LS_PROCESS_RATES = 'mi_process_rates_v1';

// Always shown even with zero data yet, so there's somewhere to log the
// first purchase from — Gum is the default process across the app (see
// the Staff Portal's Process Log tab).
const DEFAULT_PROCESSES = ['Gum'];

let processLog       = [];
let processPurchases = [];
let _pcFetched  = false;

function _processRates() {
  try { return JSON.parse(localStorage.getItem(LS_PROCESS_RATES) || '{}'); }
  catch (e) { return {}; }
}

function _saveProcessRate(process, rate) {
  const r = _processRates();
  r[process] = rate;
  try { localStorage.setItem(LS_PROCESS_RATES, JSON.stringify(r)); } catch (e) {}
}

async function fetchProcessLog() {
  try {
    const range = encodeURIComponent(`${PROCESS_LOG_TAB}!A2:G2000`);
    const url   = `https://sheets.googleapis.com/v4/spreadsheets/${ORDERS_SHEET_ID}/values/${range}?key=${API_KEY}`;
    const res   = await fetch(url);
    const json  = await res.json();
    // A json.error here almost always just means the ProcessLog tab doesn't
    // exist yet (no batch has ever been saved) — treat as "no entries", not a failure.
    processLog = json.error ? [] : (json.values || []).filter(r => r[0]).map(r => ({
      date:          r[0] || '',
      process:       r[1] || '',
      rawMaterialKg: parseFloat(r[2]) || 0,
      outputQty:     parseFloat(r[3]) || 0,
      outputUnit:    r[4] || 'kg',
      notes:         r[5] || '',
      ts:            r[6] || '',
    })).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.ts || '').localeCompare(a.ts || ''));
    return true;
  } catch (e) {
    console.error('fetchProcessLog:', e);
    return false;
  }
}

// ── Raw material stock: purchased (this tab) − used (ProcessLog) ──
async function fetchProcessPurchases() {
  try {
    const range = encodeURIComponent(`${PROCESS_PURCHASES_TAB}!A2:G2000`);
    const url   = `https://sheets.googleapis.com/v4/spreadsheets/${ORDERS_SHEET_ID}/values/${range}?key=${API_KEY}`;
    const res   = await fetch(url);
    const json  = await res.json();
    // json.error here almost always just means the tab doesn't exist yet
    // (no purchase has ever been logged) — treat as "no entries".
    processPurchases = json.error ? [] : (json.values || []).filter(r => r[0]).map(r => ({
      date:      r[0] || '',
      process:   r[1] || '',
      supplier:  r[2] || '',
      kg:        parseFloat(r[3]) || 0,
      ratePerKg: parseFloat(r[4]) || 0,
      notes:     r[5] || '',
      ts:        r[6] || '',
    })).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.ts || '').localeCompare(a.ts || ''));
    return true;
  } catch (e) {
    console.error('fetchProcessPurchases:', e);
    return false;
  }
}

function logProcessPurchase(process, safeId) {
  const kgEl  = document.getElementById('pp-kg-' + safeId);
  const rateEl = document.getElementById('pp-rate-' + safeId);
  const supEl  = document.getElementById('pp-supplier-' + safeId);
  const kg = parseFloat(kgEl?.value) || 0;
  if (kg <= 0) { alert('Enter the kg purchased first.'); return; }
  const entry = {
    date: todayStr, process, supplier: (supEl?.value || '').trim(),
    kg, ratePerKg: parseFloat(rateEl?.value) || 0, notes: '', ts: new Date().toISOString(),
  };
  processPurchases.unshift(entry);
  mirrorToSheet('processPurchaseAppend', entry);
  if (kgEl)   kgEl.value = '';
  if (rateEl) rateEl.value = '';
  if (supEl)  supEl.value = '';
  renderProcessCosting();
}

function _pcEntryCost(e) {
  const rate     = parseFloat(_processRates()[e.process]) || 0;
  const cost     = e.rawMaterialKg * rate;
  const perUnit  = e.outputQty > 0 ? cost / e.outputQty : null;
  const yieldPct = (e.rawMaterialKg > 0 && e.outputUnit === 'kg') ? (e.outputQty / e.rawMaterialKg) * 100 : null;
  return { rate, cost, perUnit, yieldPct };
}

function saveProcessRateInput(process, safeId) {
  const el = document.getElementById('pc-rate-' + safeId);
  if (!el) return;
  _saveProcessRate(process, parseFloat(el.value) || 0);
  renderProcessCosting();
}

async function initProcessCosting() {
  if (!_pcFetched) {
    const root = document.getElementById('processcosting-body');
    if (root) root.innerHTML = '<div class="empty-state">Loading…</div>';
    await Promise.all([fetchProcessLog(), fetchProcessPurchases()]);
    _pcFetched = true;
  }
  renderProcessCosting();
}

function renderProcessCosting() {
  const root = document.getElementById('processcosting-body');
  if (!root) return;

  const processes = [...new Set([
    ...DEFAULT_PROCESSES,
    ...processLog.map(e => e.process),
    ...processPurchases.map(e => e.process),
  ].filter(Boolean))];

  const filterSel = document.getElementById('pc-filter');
  if (filterSel) {
    const cur = filterSel.value;
    filterSel.innerHTML = '<option value="">All processes</option>' +
      processes.map(p => `<option value="${p}"${p === cur ? ' selected' : ''}>${p}</option>`).join('');
  }
  const activeFilter   = filterSel?.value || '';
  const shownProcesses = activeFilter ? processes.filter(p => p === activeFilter) : processes;

  root.innerHTML = shownProcesses.map(p => {
    const entries   = processLog.filter(e => e.process === p);
    const purchases = processPurchases.filter(e => e.process === p);
    const rate      = _processRates()[p] || '';
    const safeId    = p.replace(/[^a-zA-Z0-9]/g, '_');

    let totRaw = 0, totCost = 0, totOutKg = 0, totOutOther = 0;
    entries.forEach(e => {
      totRaw  += e.rawMaterialKg;
      totCost += _pcEntryCost(e).cost;
      if (e.outputUnit === 'kg') totOutKg += e.outputQty; else totOutOther += e.outputQty;
    });
    const isKg           = totOutOther === 0;
    const unitLabel       = isKg ? 'kg' : (entries[0]?.outputUnit || 'unit');
    const totOut           = isKg ? totOutKg : totOutOther;
    const avgCostPerUnit  = totOut > 0 ? totCost / totOut : null;
    const avgYield         = (isKg && totRaw > 0) ? (totOutKg / totRaw) * 100 : null;

    const totPurchased = purchases.reduce((s, e) => s + e.kg, 0);
    const stockKg       = totPurchased - totRaw;
    const stockColor     = stockKg < 0 ? 'var(--danger)' : (totPurchased === 0 && purchases.length === 0 ? 'var(--muted)' : 'var(--success)');

    const rows = entries.slice(0, 8).map(e => {
      const c = _pcEntryCost(e);
      return `
      <div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px;flex-wrap:wrap">
        <span style="color:var(--muted)">${formatDate(e.date)}</span>
        <span>${e.rawMaterialKg.toLocaleString('en-IN')} kg in</span>
        <span>${e.outputQty.toLocaleString('en-IN')} ${e.outputUnit} out</span>
        <span style="font-weight:600;color:var(--navy)">${c.perUnit != null ? '₹' + c.perUnit.toFixed(2) + '/' + e.outputUnit : '—'}</span>
        <span style="color:var(--muted)">${e.notes || ''}</span>
      </div>`;
    }).join('');

    const purchaseRows = purchases.slice(0, 8).map(e => `
      <div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px;flex-wrap:wrap">
        <span style="color:var(--muted)">${formatDate(e.date)}</span>
        <span style="font-weight:600">+${e.kg.toLocaleString('en-IN')} kg</span>
        <span style="color:var(--muted)">${e.supplier || '—'}</span>
        <span style="color:var(--muted)">${e.ratePerKg ? '₹' + e.ratePerKg + '/kg' : ''}</span>
      </div>`).join('');

    return `
    <div style="background:white;border-radius:12px;border:1px solid var(--border);padding:16px 20px;margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:10px">
        <div style="font-size:16px;font-weight:700;color:var(--navy)">${p}</div>
        <div style="display:flex;align-items:center;gap:6px">
          <label class="form-label" style="margin:0">Raw material ₹/kg</label>
          <input class="form-input" style="width:90px" type="number" step="0.5" min="0" id="pc-rate-${safeId}" value="${rate}" placeholder="e.g. 32" onchange="saveProcessRateInput('${p.replace(/'/g, "\\'")}', '${safeId}')">
        </div>
      </div>
      <div style="display:flex;gap:22px;flex-wrap:wrap;margin-bottom:10px">
        <div><div class="form-label">Current stock</div><div style="font-size:18px;font-weight:700;color:${stockColor}">${stockKg.toLocaleString('en-IN', {maximumFractionDigits:1})} kg</div></div>
        <div><div class="form-label">Purchased (all time)</div><div style="font-size:18px;font-weight:700">${totPurchased.toLocaleString('en-IN', {maximumFractionDigits:1})} kg</div></div>
        <div><div class="form-label">Raw material used</div><div style="font-size:18px;font-weight:700">${totRaw.toLocaleString('en-IN', {maximumFractionDigits:1})} kg</div></div>
        <div><div class="form-label">Produced</div><div style="font-size:18px;font-weight:700">${totOut.toLocaleString('en-IN', {maximumFractionDigits:1})} ${unitLabel}</div></div>
        <div><div class="form-label">Avg cost / ${unitLabel}</div><div style="font-size:18px;font-weight:700;color:var(--blue)">${avgCostPerUnit != null ? '₹' + avgCostPerUnit.toFixed(2) : '—'}</div></div>
        ${avgYield != null ? `<div><div class="form-label">Yield</div><div style="font-size:18px;font-weight:700;color:var(--success)">${avgYield.toFixed(0)}%</div></div>` : ''}
      </div>
      ${stockKg < 0 ? `<div class="field-hint" style="margin-bottom:8px;color:var(--danger)">Usage logged exceeds purchases on record — log any missing ${p} purchases below to fix the stock figure.</div>` : ''}
      ${!rate ? '<div class="field-hint" style="margin-bottom:8px">Set the raw material ₹/kg rate above to see cost figures for this process.</div>' : ''}

      <div style="display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap;background:var(--bg);border-radius:8px;padding:10px 12px;margin-bottom:12px">
        <div><label class="form-label" style="margin:0">Kg purchased</label><input class="form-input" style="width:90px" type="number" step="1" min="0" id="pp-kg-${safeId}" placeholder="e.g. 200"></div>
        <div><label class="form-label" style="margin:0">₹/kg</label><input class="form-input" style="width:80px" type="number" step="0.5" min="0" id="pp-rate-${safeId}" placeholder="optional"></div>
        <div><label class="form-label" style="margin:0">Supplier</label><input class="form-input" style="width:140px" type="text" id="pp-supplier-${safeId}" placeholder="optional"></div>
        <button class="btn-primary" style="font-size:12px;padding:7px 14px" onclick="logProcessPurchase('${p.replace(/'/g, "\\'")}', '${safeId}')">+ Log Purchase</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Recent purchases</div>
          ${purchaseRows || '<div style="font-size:12px;color:var(--muted)">No purchases logged yet</div>'}
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Recent batches (used)</div>
          ${rows || '<div style="font-size:12px;color:var(--muted)">No batches yet</div>'}
        </div>
      </div>
    </div>`;
  }).join('');
}

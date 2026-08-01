// ══════════════════════════════════════════════════════════════
// DAILY-REPORT.JS — Minimal end-of-day report
//   1. Dispatch — what left the factory today (challans + supervisor
//      measured-weight log)
//   2. Production — what was made today, in the two halves of the
//      shop floor: Part 1 Corrugation (board making — reel cutting,
//      via the supervisor's form) and Part 2 Converting/Finishing
//      (printing → pasting → rotary → stitching, via the in-app
//      Production Register)
// Pulls from data other pages already load; no separate storage.
// ══════════════════════════════════════════════════════════════

let _drDate = todayStr;

function drShiftDate(days) {
  const d = new Date(_drDate + 'T00:00:00');
  d.setDate(d.getDate() + days);
  _drDate = d.toISOString().split('T')[0];
  renderDailyReport();
}
function drSetDate(value) {
  if (!value) return;
  _drDate = value;
  renderDailyReport();
}
function drToday() { _drDate = todayStr; renderDailyReport(); }

async function loadDailyReport() {
  renderDailyReport(true);
  const jobs = [];
  if (typeof _svProd === 'undefined' || !_svProd.length) jobs.push(fetchSupervisorLog().catch(() => {}));
  if (!_plFetched) jobs.push(fetchProdLog().catch(() => {}));
  if (jobs.length) await Promise.all(jobs);
  renderDailyReport(false);
}

function _drDateLabel(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function renderDailyReport(loading) {
  const root = document.getElementById('daily-report-root');
  if (!root) return;

  const nav = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      <button class="btn-secondary" style="padding:6px 12px" onclick="drShiftDate(-1)">◀</button>
      <input type="date" class="form-input" style="max-width:180px" value="${_drDate}" onchange="drSetDate(this.value)">
      <button class="btn-secondary" style="padding:6px 12px" onclick="drShiftDate(1)" ${_drDate >= todayStr ? 'disabled' : ''}>▶</button>
      <button class="btn-secondary" style="padding:6px 12px;font-size:12px" onclick="drToday()">Today</button>
      <div style="font-weight:700;font-size:15px;margin-left:6px">${_drDateLabel(_drDate)}</div>
      <button class="btn-secondary" style="font-size:11px;padding:5px 12px;margin-left:auto" onclick="window.print()">🖨 Print</button>
    </div>`;

  if (loading) {
    root.innerHTML = nav + '<div class="empty-state">Loading…</div>';
    return;
  }

  root.innerHTML = nav + _drDispatchSection() + _drProductionSection();
}

// ── Section 1: Dispatch ──────────────────────────────────────
function _drDispatchSection() {
  const challans = (typeof challanList !== 'undefined' ? challanList : []).filter(c => c.date === _drDate);
  const svDisp   = (typeof _svDisp !== 'undefined' ? _svDisp : []).filter(e => _svNormDate(e.date) === _drDate);

  const challanQty = challans.reduce((s, c) => s + (c.qty || 0), 0);
  const svPcs       = svDisp.reduce((s, e) => s + (e.pcs || 0), 0);
  const svKg        = svDisp.reduce((s, e) => s + ((e.pcs * e.wtPc / 1000) || 0), 0);

  const challanRows = challans.length ? challans.map(c => `
    <tr style="border-top:1px solid var(--border,#e5e7eb)">
      <td style="padding:7px 10px;font-family:monospace;font-size:12px">${c.dcNum}</td>
      <td style="padding:7px 10px;font-weight:600">${c.customer}</td>
      <td style="padding:7px 10px">${c.product || '—'}</td>
      <td style="padding:7px 10px;text-align:right;font-weight:600">${(c.qty||0).toLocaleString('en-IN')}</td>
    </tr>`).join('') : `<tr><td colspan="4" style="padding:12px 10px;color:var(--muted,#888)">No delivery challans issued this day.</td></tr>`;

  const svRows = svDisp.length ? svDisp.map(e => `
    <tr style="border-top:1px solid var(--border,#e5e7eb)">
      <td style="padding:7px 10px;font-weight:600">${e.party || '—'}</td>
      <td style="padding:7px 10px">${e.product || '—'}</td>
      <td style="padding:7px 10px;text-align:right">${e.pcs.toLocaleString('en-IN')}</td>
      <td style="padding:7px 10px;text-align:right">${e.wtPc ? e.wtPc + ' gm' : '—'}</td>
    </tr>`).join('') : `<tr><td colspan="4" style="padding:12px 10px;color:var(--muted,#888)">No supervisor dispatch entries this day.</td></tr>`;

  return `
    <div class="section-header" style="margin-top:4px"><div class="section-title">🚚 Dispatch — Output This Day</div></div>
    <div class="add-order-form" style="margin-bottom:12px;display:flex;gap:24px;flex-wrap:wrap">
      <div><div class="form-label">Challans issued</div><div style="font-size:20px;font-weight:700">${challans.length}</div></div>
      <div><div class="form-label">Boxes via challan</div><div style="font-size:20px;font-weight:700">${challanQty.toLocaleString('en-IN')}</div></div>
      <div><div class="form-label">Supervisor-logged pieces</div><div style="font-size:20px;font-weight:700">${svPcs.toLocaleString('en-IN')}</div></div>
      <div><div class="form-label">Supervisor-logged weight</div><div style="font-size:20px;font-weight:700">${svKg ? svKg.toLocaleString('en-IN',{maximumFractionDigits:1}) + ' kg' : '—'}</div></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:8px" class="dr-grid">
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--muted,#888);margin-bottom:6px">DELIVERY CHALLANS (app)</div>
        <div class="add-order-form" style="padding:0;overflow-x:auto">
        <table class="data-table" style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="text-align:left"><th style="padding:7px 10px">DC#</th><th style="padding:7px 10px">Customer</th><th style="padding:7px 10px">Product</th><th style="padding:7px 10px;text-align:right">Qty</th></tr></thead>
          <tbody>${challanRows}</tbody></table></div>
      </div>
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--muted,#888);margin-bottom:6px">SUPERVISOR LOG (weighed on dispatch)</div>
        <div class="add-order-form" style="padding:0;overflow-x:auto">
        <table class="data-table" style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="text-align:left"><th style="padding:7px 10px">Party</th><th style="padding:7px 10px">Product</th><th style="padding:7px 10px;text-align:right">Pieces</th><th style="padding:7px 10px;text-align:right">Wt/pc</th></tr></thead>
          <tbody>${svRows}</tbody></table></div>
      </div>
    </div>
    <div class="field-hint" style="margin-bottom:20px">Two independent logs, shown side by side — the app's Delivery Challans and the supervisor's own weighed dispatch entries. They usually cover the same physical dispatch from two different entry points, so don't add the two totals together.</div>`;
}

// ── Section 2: Production, in two parts ──────────────────────
function _drProductionSection() {
  const svProd = (typeof _svProd !== 'undefined' ? _svProd : []).filter(e => _svNormDate(e.date) === _drDate);
  const plToday = (typeof _plEntries !== 'undefined' ? _plEntries : []).filter(e => e.date === _drDate);
  const finishing = plToday.filter(e => e.machine !== 'sheeter' && e.machine !== 'toppaper');

  return `
    <div class="section-header"><div class="section-title">🏭 Production — Two Halves of the Shop Floor</div></div>
    <div class="field-hint" style="margin-bottom:12px">Part 1 is board-making (corrugation), reported by the supervisor. Part 2 is converting the board into finished boxes (printing → pasting → rotary → stitching), logged in the app's Production Register.</div>

    ${_drCorrugationPart(svProd)}
    ${_drFinishingPart(finishing)}`;
}

function _drCorrugationPart(svProd) {
  const plyPcs = svProd.reduce((s, e) => s + (parseInt(e.plyPcs) || 0), 0);
  const sheets = svProd.reduce((s, e) => s + (parseInt(e.sheets) || 0), 0);
  const rolls  = svProd.reduce((s, e) => s + (parseInt(e.rolls) || 0), 0);
  const kg     = svProd.reduce((s, e) => s + _svEntryKg(e), 0);

  const rows = svProd.length ? svProd.map(e => {
    const reels = [e.r1w ? `${e.r1w}" @ ${e.r1g||'?'}g` : '', e.r2w ? `${e.r2w}" @ ${e.r2g||'?'}g` : ''].filter(Boolean).join(' + ');
    return `<tr style="border-top:1px solid var(--border,#e5e7eb)">
      <td style="padding:7px 10px">${reels || '—'}</td>
      <td style="padding:7px 10px">${e.cutSize ? e.cutSize + '"' : '—'}</td>
      <td style="padding:7px 10px;text-align:right">${e.plyPcs ? parseInt(e.plyPcs).toLocaleString('en-IN') : '—'}</td>
      <td style="padding:7px 10px;text-align:right">${e.sheets ? parseInt(e.sheets).toLocaleString('en-IN') : '—'}</td>
      <td style="padding:7px 10px;text-align:right">${e.rolls || '—'}</td>
      <td style="padding:7px 10px;text-align:right;font-weight:600">${_svEntryKg(e) ? _svEntryKg(e).toLocaleString('en-IN',{maximumFractionDigits:1}) + ' kg' : '—'}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="6" style="padding:12px 10px;color:var(--muted,#888)">No corrugation entries logged this day.</td></tr>`;

  return `
    <div style="font-size:13px;font-weight:700;margin:14px 0 6px">PART 1 — CORRUGATION (Board Making)</div>
    <div class="add-order-form" style="margin-bottom:10px;display:flex;gap:24px;flex-wrap:wrap">
      <div><div class="form-label">Ply pieces cut</div><div style="font-size:18px;font-weight:700">${plyPcs ? plyPcs.toLocaleString('en-IN') : '—'}</div></div>
      <div><div class="form-label">Sheets cut</div><div style="font-size:18px;font-weight:700">${sheets ? sheets.toLocaleString('en-IN') : '—'}</div></div>
      <div><div class="form-label">Rolls made</div><div style="font-size:18px;font-weight:700">${rolls || '—'}</div></div>
      <div><div class="form-label">Paper consumed</div><div style="font-size:18px;font-weight:700;color:var(--accent,#2980B9)">${kg ? kg.toLocaleString('en-IN',{maximumFractionDigits:1}) + ' kg' : '—'}</div></div>
    </div>
    <div class="add-order-form" style="padding:0;overflow-x:auto;margin-bottom:16px">
    <table class="data-table" style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="text-align:left">
        <th style="padding:7px 10px">Reels (width @ GSM)</th><th style="padding:7px 10px">Cutting size</th>
        <th style="padding:7px 10px;text-align:right">Ply pcs</th><th style="padding:7px 10px;text-align:right">Sheets</th>
        <th style="padding:7px 10px;text-align:right">Rolls</th><th style="padding:7px 10px;text-align:right">Paper used</th>
      </tr></thead><tbody>${rows}</tbody></table></div>`;
}

function _drFinishingPart(entries) {
  const byMachine = {};
  REG_STAGE_ORDER.filter(m => m !== 'sheeter' && m !== 'toppaper').forEach(m => byMachine[m] = 0);
  entries.forEach(e => { if (byMachine[e.machine] !== undefined) byMachine[e.machine] += e.qty || 0; });
  const stitched = byMachine.stitching || 0;

  const tiles = Object.keys(byMachine).map(id => {
    const m = REG_MACHINES.find(x => x.id === id);
    return `<div><div class="form-label">${m ? m.label : id}</div><div style="font-size:18px;font-weight:700">${byMachine[id] ? byMachine[id].toLocaleString('en-IN') : '—'}</div></div>`;
  }).join('');

  const rows = entries.length ? entries.map(e => {
    const o = (typeof orders !== 'undefined' ? orders : []).find(x => x.id === e.orderId);
    const m = REG_MACHINES.find(x => x.id === e.machine);
    return `<tr style="border-top:1px solid var(--border,#e5e7eb)">
      <td style="padding:7px 10px">${m ? m.label : e.machine}</td>
      <td style="padding:7px 10px;font-family:monospace;font-size:12px">${e.orderId}</td>
      <td style="padding:7px 10px">${o ? `${o.customer} · ${o.product||o.size||''}` : '—'}</td>
      <td style="padding:7px 10px;text-align:right;font-weight:600">${(e.qty||0).toLocaleString('en-IN')}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="4" style="padding:12px 10px;color:var(--muted,#888)">No converting/finishing entries logged this day in the Production Register.</td></tr>`;

  return `
    <div style="font-size:13px;font-weight:700;margin:18px 0 6px">PART 2 — CONVERTING / FINISHING (Boxes Ready)</div>
    <div class="add-order-form" style="margin-bottom:10px;display:flex;gap:24px;flex-wrap:wrap">
      <div><div class="form-label">✅ Boxes finished (stitched)</div><div style="font-size:20px;font-weight:700;color:var(--success,#27AE60)">${stitched ? stitched.toLocaleString('en-IN') : '—'}</div></div>
      ${tiles}
    </div>
    <div class="add-order-form" style="padding:0;overflow-x:auto">
    <table class="data-table" style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="text-align:left"><th style="padding:7px 10px">Machine</th><th style="padding:7px 10px">Order</th><th style="padding:7px 10px">Customer / Product</th><th style="padding:7px 10px;text-align:right">Pieces</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <div class="field-hint" style="margin-top:8px">Enter these via Production Register → Daily Entry as boxes move through printing, pasting, rotary and stitching.</div>`;
}

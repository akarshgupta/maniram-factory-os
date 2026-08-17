// ══════════════════════════════════════════════════════════════
// REGISTERS.JS — Production Register (Daily Entry + Order Progress)
// Flow: Line A (Corrugation→Sheeter-Ply) ∥ Line B (Top Paper→Printing)
//       → Pasting (Phase 1 complete) → Rotary → Stitching (Phase 2) → Dispatch
// Entries: PIECES only. All KG derived by app (GSM job-card or sample weight).
// ══════════════════════════════════════════════════════════════

const LS_PRODLOG  = 'mi_prodlog_v1';
const LS_GSM_META = 'mi_gsm_meta_v1';

const REG_MACHINES = [
  { id: 'sheeter',  label: '🌀 Sheeter (Ply)',  hint: 'Line A — corrugated ply sheets cut', stage: 1 },
  { id: 'toppaper', label: '✂️ Top Paper',       hint: 'Line B — top/liner paper cut',       stage: 1 },
  { id: 'printing', label: '🖨️ Printing',        hint: 'Line B — printed sheets',            stage: 2 },
  { id: 'pasting',  label: '🩹 Pasting',          hint: 'Ply + paper = board (Phase 1 done)', stage: 3 },
  { id: 'rotary',   label: '🔄 Rotary (RS-4)',    hint: 'Phase 2 — creasing/slotting',        stage: 4 },
  { id: 'stitching',label: '🧷 Stitching',        hint: 'Phase 2 — box ready',                stage: 5 },
];
const REG_STAGE_ORDER = ['sheeter', 'toppaper', 'printing', 'pasting', 'rotary', 'stitching'];

let _plEntries  = [];    // {date, machine, orderId, qty, remarks, ts}
let _plFetched  = false;
let _regTab     = 'entry';
let _selMachine = null;

// ── Data layer ────────────────────────────────────────────────
function _plLocal()      { try { return JSON.parse(localStorage.getItem(LS_PRODLOG)) || []; } catch(e){ return []; } }
function _plSaveLocal(a) { localStorage.setItem(LS_PRODLOG, JSON.stringify(a)); }
function _gsmLocal()     { try { return JSON.parse(localStorage.getItem(LS_GSM_META)) || {}; } catch(e){ return {}; } }
function _gsmSaveLocal(m){ localStorage.setItem(LS_GSM_META, JSON.stringify(m)); }

async function fetchProdLog() {
  _plEntries = _plLocal();
  if (typeof REGISTERS_SHEET_ID !== 'undefined' && REGISTERS_SHEET_ID) {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${REGISTERS_SHEET_ID}/values/${PRODLOG_TAB}!A2:F?key=${API_KEY}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const rows = (data.values || []).map(r => ({
          date: r[0] || '', machine: r[1] || '', orderId: r[2] || '',
          qty: parseInt(r[3]) || 0, remarks: r[4] || '', ts: r[5] || ''
        })).filter(e => e.date && e.machine);
        if (rows.length >= _plEntries.length) { _plEntries = rows; _plSaveLocal(rows); }
      }
    } catch(e) { /* offline — localStorage cache stands */ }
    try {
      const gurl = `https://sheets.googleapis.com/v4/spreadsheets/${REGISTERS_SHEET_ID}/values/${GSMMETA_TAB}!A2:C?key=${API_KEY}`;
      const gres = await fetch(gurl);
      if (gres.ok) {
        const gd = await gres.json();
        const map = _gsmLocal();
        (gd.values || []).forEach(r => { if (r[0]) map[r[0]] = { gsm: r[1] || '', ts: r[2] || '' }; });
        _gsmSaveLocal(map);
      }
    } catch(e) {}
  }
  _plFetched = true;
}

function _regPost(action, payload) {
  const url = (typeof REGISTERS_SCRIPT_URL !== 'undefined' && REGISTERS_SCRIPT_URL) ? REGISTERS_SCRIPT_URL : APPS_SCRIPT_URL;
  try {
    fetch(url, { method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action }, payload || {})) }).catch(()=>{});
  } catch(e){}
}

// ── Box math (rate-calculator rules) ─────────────────────────
function _regParseSize(s) {
  const m = String(s||'').toLowerCase().replace(/×/g,'x').match(/([\d.]+)\s*x\s*([\d.]+)\s*x\s*([\d.]+)/);
  return m ? { L:+m[1], W:+m[2], H:+m[3] } : null;
}
function _regSheetArea(size, twoPart) {
  const d = _regParseSize(size); if (!d) return 0;
  const SL = calcSheetLen(d.L, d.W, twoPart), SW = d.W + d.H + 0.5;
  return (SL * SW) / 1550; // sqm
}
// gsmStr e.g. "140/120/120" (top-first). Returns {plyKg, topKg} per sheet.
function _regLayerWeights(order) {
  const area = _regSheetArea(order.size, order.twoPart); if (!area) return null;
  const meta = _gsmLocal()[order.id];
  if (meta && meta.gsm) {
    const layers = meta.gsm.split(/[\/,\s]+/).map(Number).filter(n => n > 0);
    if (layers.length >= 2) {
      const top = layers[0] * area / 1000;                       // kg
      let ply = 0;
      layers.slice(1).forEach((g, i) => { ply += g * area * (i % 2 === 0 ? 1.5 : 1) / 1000; }); // flute×1.5, liner×1
      return { plyKg: ply, topKg: top, src: 'gsm' };
    }
  }
  // fallback: sample box weight (gm) — ply ≈ 80%, top ≈ 20%
  const w = parseFloat(order.weight) || 0;
  if (w > 0) return { plyKg: w * 0.8 / 1000, topKg: w * 0.2 / 1000, src: 'sample' };
  return null;
}

// ── Aggregation / intelligence ────────────────────────────────
function _regCum(orderId) {
  const c = {}; REG_STAGE_ORDER.forEach(m => c[m] = 0);
  _plEntries.forEach(e => { if (e.orderId === orderId && c[e.machine] !== undefined) c[e.machine] += e.qty; });
  return c;
}
function _regNeedsPrint(o) { return !!(o.colour && String(o.colour).trim() && String(o.colour).toLowerCase() !== 'none'); }
function _regPhase(o, cum) {
  const qty = parseInt(o.qty) || 0; if (!qty) return { n: 1, label: 'Phase 1' };
  if (cum.stitching >= qty) return { n: 3, label: '✅ Ready' };
  if (cum.pasting  >= qty) return { n: 2, label: 'Phase 2' };
  return { n: 1, label: 'Phase 1' };
}
function _regMachineRate(machine) { // avg pcs/day over last 7 active days
  const byDay = {};
  _plEntries.forEach(e => { if (e.machine === machine) byDay[e.date] = (byDay[e.date] || 0) + e.qty; });
  const days = Object.keys(byDay).sort().slice(-7);
  if (!days.length) return 0;
  return Math.round(days.reduce((s, d) => s + byDay[d], 0) / days.length);
}
function _regEta(o, cum) {
  const qty = parseInt(o.qty) || 0; if (!qty) return null;
  const stages = REG_STAGE_ORDER.filter(m => m !== 'printing' || _regNeedsPrint(o));
  let worst = 0, bottleneck = '';
  stages.forEach(m => {
    const rem = Math.max(0, qty - cum[m]); if (!rem) return;
    const rate = _regMachineRate(m);
    const d = rate > 0 ? rem / rate : (rem / Math.max(1, qty)) * PRODUCTION_DAYS.calc(o.ply, qty);
    if (d > worst) { worst = d; bottleneck = m; }
  });
  if (!worst) return { days: 0, bottleneck: '' };
  return { days: Math.max(1, Math.ceil(worst)), bottleneck };
}
function _regTodayCorrugationKg() {
  const today = todayStr;
  let kg = 0;
  const list = (typeof orders !== 'undefined' && orders.length) ? orders : [];
  _plEntries.forEach(e => {
    if (e.date !== today || e.machine !== 'sheeter') return;
    const o = list.find(x => x.id === e.orderId);
    const w = o ? _regLayerWeights(o) : null;
    if (w) kg += e.qty * w.plyKg;
  });
  return Math.round(kg);
}

// ── UI ────────────────────────────────────────────────────────
async function loadRegisters() {
  const root = document.getElementById('registers-root');
  if (!root) return;
  if (typeof REGISTERS_SHEET_ID === 'undefined' || !REGISTERS_SHEET_ID) {
    root.innerHTML = `<div class="card" style="padding:20px">
      <b>⚙️ Setup pending</b><br><br>
      1. Create a new blank Sheet named <b>Registers</b> in the "Maniram Industries Database" folder<br>
      2. Share → "Anyone with link → Viewer"<br>
      3. Paste the Sheet ID into <code>REGISTERS_SHEET_ID</code> in <code>js/config.js</code><br>
      4. Paste <code>apps-script/registers-prodlog.gs</code> into that sheet's Apps Script, deploy it as a Web App and put the URL into <code>REGISTERS_SCRIPT_URL</code><br>
      <span style="color:var(--muted);font-size:12px">The ProdLog and GSMeta tabs are created automatically on the first entry.</span></div>`;
    return;
  }
  root.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px" id="reg-tabs">
      ${_regTabBtn('entry','➕ Daily Entry')}${_regTabBtn('progress','📊 Order Progress')}${_regTabBtn('log','📜 Log')}
    </div>
    <div id="reg-body"><div style="text-align:center;padding:24px;color:var(--muted)">⏳ Loading…</div></div>`;
  if (!_plFetched) await fetchProdLog();
  renderRegTab(_regTab);
}
function _regTabBtn(id, label) {
  const on = _regTab === id;
  return `<button onclick="renderRegTab('${id}')" id="regtab-${id}" style="padding:8px 16px;border-radius:8px;
    font-size:13px;font-weight:600;border:1px solid var(--horizon,#B5D4F4);cursor:pointer;
    background:${on?'var(--navy,#042C53)':'#fff'};color:${on?'#fff':'var(--navy,#042C53)'}">${label}</button>`;
}
function renderRegTab(id) {
  _regTab = id;
  ['entry','progress','log'].forEach(t => {
    const b = document.getElementById('regtab-'+t); if (!b) return;
    const on = t === id;
    b.style.background = on ? 'var(--navy,#042C53)' : '#fff';
    b.style.color = on ? '#fff' : 'var(--navy,#042C53)';
  });
  if (id === 'entry')    renderRegEntry();
  if (id === 'progress') renderRegProgress();
  if (id === 'log')      renderRegLog();
}

function _regActiveOrders() {
  const list = (typeof orders !== 'undefined' && orders.length) ? orders : [];
  return list.filter(o => !['Delivered','Cancelled','Dispatched'].includes(o.status));
}

function renderRegEntry() {
  const body = document.getElementById('reg-body');
  const act = _regActiveOrders();
  const kg = _regTodayCorrugationKg();
  body.innerHTML = `
    <div class="card" style="padding:16px;max-width:560px">
      <div style="font-weight:700;margin-bottom:10px">Choose a machine:</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:14px" id="reg-mbtns">
        ${REG_MACHINES.map(m => `<button onclick="_regPickMachine('${m.id}')" id="regm-${m.id}"
          style="padding:12px 8px;border-radius:10px;border:2px solid ${_selMachine===m.id?'var(--accent,#378ADD)':'var(--horizon,#B5D4F4)'};
          background:${_selMachine===m.id?'#EAF3FC':'#fff'};cursor:pointer;font-size:14px;font-weight:600;color:var(--navy,#042C53)">
          ${m.label}<div style="font-size:10px;font-weight:400;color:var(--muted);margin-top:3px">${m.hint}</div></button>`).join('')}
      </div>
      <div class="form-group"><label class="form-label">Order</label>
        <select class="form-input" id="reg-order">
          <option value="">— Select order —</option>
          ${act.map(o => `<option value="${o.id}">${o.id} · ${o.customer} · ${o.size} (${o.ply}-ply) · ${o.qty} pcs</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Aaj kitne pieces bane?</label>
        <input class="form-input" type="number" id="reg-qty" min="1" placeholder="e.g. 800"></div>
      <div class="form-group"><label class="form-label">Remarks (optional)</label>
        <input class="form-input" type="text" id="reg-remarks" placeholder="breakdown / reject / note"></div>
      <button class="btn-primary" style="width:100%;padding:12px;font-size:15px" onclick="saveProdEntry()">💾 Save Entry</button>
      <div id="reg-msg" style="margin-top:8px;font-size:13px"></div>
    </div>
    <div class="card" style="padding:12px;max-width:560px;margin-top:10px;background:#EAF3FC">
      🌀 <b>Corrugation aaj (derived):</b> ~${kg.toLocaleString('en-IN')} kg
      <span style="font-size:11px;color:var(--muted)"> — auto-calculated from sheeter pieces × per-sheet ply weight. No separate entry needed.</span>
    </div>`;
}
function _regPickMachine(id) { _selMachine = id; renderRegEntry(); }

function saveProdEntry() {
  const msg = document.getElementById('reg-msg');
  const orderId = document.getElementById('reg-order').value;
  const qty = parseInt(document.getElementById('reg-qty').value) || 0;
  const remarks = document.getElementById('reg-remarks').value.trim();
  if (!_selMachine) { msg.innerHTML = '⚠️ Choose a machine'; return; }
  if (!orderId)     { msg.innerHTML = '⚠️ Select an order'; return; }
  if (qty <= 0)     { msg.innerHTML = '⚠️ Enter a quantity'; return; }
  const entry = { date: todayStr, machine: _selMachine, orderId, qty, remarks, ts: new Date().toISOString() };
  _plEntries.push(entry); _plSaveLocal(_plEntries);
  _regPost('prodlogAppend', entry);
  const o = _regActiveOrders().find(x => x.id === orderId);
  const cum = _regCum(orderId);
  let extra = '';
  if (o) {
    const pct = Math.min(100, Math.round(cum[_selMachine] / (parseInt(o.qty)||1) * 100));
    extra = ` · ${REG_MACHINES.find(m=>m.id===_selMachine).label}: <b>${pct}%</b> of order`;
    if (_selMachine === 'pasting' && cum.pasting >= (parseInt(o.qty)||0)) extra += ' · 🎉 <b>Phase 1 COMPLETE → Phase 2</b>';
  }
  msg.innerHTML = `✅ Saved${extra}`;
  document.getElementById('reg-qty').value = ''; document.getElementById('reg-remarks').value = '';
}

function renderRegProgress() {
  const body = document.getElementById('reg-body');
  const act = _regActiveOrders();
  if (!act.length) { body.innerHTML = '<div class="card" style="padding:20px;color:var(--muted)">No active orders.</div>'; return; }
  body.innerHTML = act.map(o => {
    const qty = parseInt(o.qty) || 0;
    const cum = _regCum(o.id);
    const ph = _regPhase(o, cum);
    const eta = _regEta(o, cum);
    const w = _regLayerWeights(o);
    const gsmSet = (_gsmLocal()[o.id] || {}).gsm;
    const stages = REG_STAGE_ORDER.filter(m => m !== 'printing' || _regNeedsPrint(o));
    const bars = stages.map(m => {
      const mc = REG_MACHINES.find(x => x.id === m);
      const pct = qty ? Math.min(100, Math.round(cum[m] / qty * 100)) : 0;
      const col = pct >= 100 ? '#1E8E5A' : (pct > 0 ? 'var(--accent,#378ADD)' : '#D9E3F0');
      return `<div style="display:flex;align-items:center;gap:8px;margin:4px 0">
        <span style="width:130px;font-size:12px">${mc.label}</span>
        <div style="flex:1;height:10px;background:#EEF1F5;border-radius:5px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:${col}"></div></div>
        <span style="width:88px;font-size:11px;text-align:right;color:var(--muted)">${cum[m]}/${qty} (${pct}%)</span></div>`;
    }).join('');
    const outKg = Math.round(cum.stitching * (parseFloat(o.weight)||0) / 1000);
    const phCol = ph.n === 3 ? '#1E8E5A' : (ph.n === 2 ? '#B8780A' : 'var(--blue,#185FA5)');
    return `<div class="card" style="padding:14px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:8px">
        <div><b>${o.id}</b> · ${o.customer} · ${o.size} · ${o.ply}-ply · ${qty} pcs
          <span style="font-size:11px;color:var(--muted)">· delivery ${o.date||'—'}</span></div>
        <span style="background:${phCol};color:#fff;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:700">${ph.label}</span>
      </div>
      ${bars}
      <div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:8px;font-size:12px;color:var(--ink,#0B2240)">
        ${eta && eta.days ? `<span>⏱️ ETA: <b>~${eta.days} din</b> (bottleneck: ${eta.bottleneck})</span>` : (ph.n===3?'<span>✅ Complete</span>':'')}
        ${w ? `<span>🧻 Per-sheet ply: <b>${(w.plyKg*1000).toFixed(0)} gm</b> ${w.src==='sample'?'<i style="color:var(--muted)">(sample est.)</i>':''}</span>` : ''}
        <span>📦 Ready weight: <b>${outKg.toLocaleString('en-IN')} kg</b></span>
        <span style="cursor:pointer;color:var(--accent,#378ADD);font-weight:600" onclick="setOrderGsm('${o.id}')">
          ${gsmSet ? '🏷️ GSM: '+gsmSet+' ✏️' : '🏷️ + Set GSM (from job card)'}</span>
      </div></div>`;
  }).join('');
}

function setOrderGsm(orderId) {
  const cur = (_gsmLocal()[orderId] || {}).gsm || '';
  const val = prompt(`Order ${orderId} — GSM layers (top-first, / se alag)\ne.g. 3-ply: 140/120/120 · 5-ply: 140/120/120/120/120`, cur);
  if (val === null) return;
  const map = _gsmLocal();
  map[orderId] = { gsm: val.trim(), ts: new Date().toISOString() };
  _gsmSaveLocal(map);
  _regPost('gsmSet', { orderId, gsm: val.trim(), ts: map[orderId].ts });
  renderRegProgress();
}

function renderRegLog() {
  const body = document.getElementById('reg-body');
  const rows = [..._plEntries].reverse().slice(0, 100);
  if (!rows.length) { body.innerHTML = '<div class="card" style="padding:20px;color:var(--muted)">No entries yet.</div>'; return; }
  body.innerHTML = `<div class="card" style="padding:0;overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
    <tr style="background:var(--navy,#042C53);color:#fff"><th style="padding:8px;text-align:left">Date</th>
    <th style="padding:8px;text-align:left">Machine</th><th style="padding:8px;text-align:left">Order</th>
    <th style="padding:8px;text-align:right">Pieces</th><th style="padding:8px;text-align:left">Remarks</th></tr>
    ${rows.map(e => { const m = REG_MACHINES.find(x=>x.id===e.machine);
      return `<tr style="border-bottom:1px solid #EEF1F5"><td style="padding:7px 8px">${e.date}</td>
      <td style="padding:7px 8px">${m?m.label:e.machine}</td><td style="padding:7px 8px">${e.orderId}</td>
      <td style="padding:7px 8px;text-align:right;font-weight:600">${e.qty.toLocaleString('en-IN')}</td>
      <td style="padding:7px 8px;color:var(--muted)">${e.remarks||''}</td></tr>`; }).join('')}
  </table></div>`;
}

// ══════════════════════════════════════════════════════════════
// SUPERVISOR-LOG.JS — Live view of the supervisor's Google Form
// register ("Maniram — Register Responses" sheet).
//   Production tab: reel widths/GSM, cutting size, pieces/sheets/rolls
//   Dispatch tab:   party, pieces, size, measured weight per piece
// Read-only in the app — supervisor enters data via the form on phone.
// ══════════════════════════════════════════════════════════════

let _svProd = [];
let _svDisp = [];
let _svTab  = 'dispatch';

async function fetchSupervisorLog() {
  const get = async (tab, range) => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SUPERVISOR_SHEET_ID}/values/${encodeURIComponent(tab + '!' + range)}?key=${API_KEY}&_=${Date.now()}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    return (json.values || []).slice(1).filter(r => r.length > 1);
  };
  try {
    const [prod, disp] = await Promise.all([
      get(SUPERVISOR_PROD_TAB, 'A1:P500'),
      get(SUPERVISOR_DISP_TAB, 'A1:L500'),
    ]);
    _svProd = prod.map(r => ({
      ts: r[0] || '', date: r[1] || '',
      r1w: r[2] || '', r1g: r[3] || '', r2w: r[4] || '', r2g: r[5] || '',
      cutSize: r[6] || '', plyPcs: r[7] || '', sheets: r[8] || '', rolls: r[9] || '',
    })).reverse(); // newest first
    _svDisp = disp.map(r => ({
      ts: r[0] || '', date: r[1] || '', party: r[2] || '',
      pcs: parseInt(r[3]) || 0, size: r[4] || '',
      wtPc: parseFloat(r[5]) || 0,
    })).reverse();
    return true;
  } catch (e) {
    console.error('fetchSupervisorLog:', e);
    return false;
  }
}

// Find expected weight (gm) from the product master by product-name match.
function _svExpectedWeight(party) {
  if (typeof CLIENTS === 'undefined' || !party) return null;
  const p = party.toString().trim().toLowerCase();
  for (const c of CLIENTS) {
    for (const prod of (c.products || [])) {
      const n = (prod.name || '').trim().toLowerCase();
      if (n && (n === p || p.includes(n) || n.includes(p))) {
        const w = parseFloat(prod.weight);
        return w > 0 ? { weight: w, client: c.name, product: prod.name } : null;
      }
    }
  }
  return null;
}

function svShowTab(tab) {
  _svTab = tab;
  renderSupervisorLog(false);
}

async function loadSupervisorLog() {
  renderSupervisorLog(true);
  const ok = await fetchSupervisorLog();
  renderSupervisorLog(false, !ok);
}

function renderSupervisorLog(loading, error) {
  const root = document.getElementById('svlog-root');
  if (!root) return;

  const tabBtn = (id, label) =>
    `<button class="btn-secondary" onclick="svShowTab('${id}')"
       style="font-size:12px;padding:6px 14px;${_svTab === id ? 'background:var(--accent,#2980B9);color:#fff;border-color:var(--accent,#2980B9)' : ''}">${label}</button>`;

  let body;
  if (loading) {
    body = '<div class="empty-state">Loading supervisor register…</div>';
  } else if (error) {
    body = '<div class="empty-state">⚠️ Register sheet load nahi hua — internet check karke ↻ Refresh dabao.</div>';
  } else if (_svTab === 'dispatch') {
    body = _svDispatchHtml();
  } else {
    body = _svProductionHtml();
  }

  root.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      ${tabBtn('dispatch', `🚚 Dispatch Weights (${_svDisp.length})`)}
      ${tabBtn('production', `⚙️ Production (${_svProd.length})`)}
    </div>
    ${body}`;
}

function _svDispatchHtml() {
  if (!_svDisp.length) return '<div class="empty-state">Abhi koi dispatch entry nahi. Supervisor form bharega to yahan dikhega.</div>';

  const rows = _svDisp.map(e => {
    const totalKg = e.pcs && e.wtPc ? (e.pcs * e.wtPc / 1000) : 0;
    const exp = _svExpectedWeight(e.party);
    let deltaHtml = '<span style="color:var(--muted,#888)">—</span>';
    if (exp && e.wtPc) {
      const d = ((e.wtPc - exp.weight) / exp.weight) * 100;
      const col = Math.abs(d) <= 3 ? 'var(--success,#27AE60)' : Math.abs(d) <= 7 ? '#E67E22' : '#E74C3C';
      deltaHtml = `<span style="color:${col};font-weight:700" title="Master: ${exp.weight} gm (${exp.client} / ${exp.product})">${d > 0 ? '+' : ''}${d.toFixed(1)}%</span>`;
    }
    return `<tr style="border-top:1px solid var(--border,#e5e7eb)">
      <td style="padding:8px 10px;white-space:nowrap">${e.date}</td>
      <td style="padding:8px 10px;font-weight:600">${e.party}</td>
      <td style="padding:8px 10px">${e.size || '—'}</td>
      <td style="padding:8px 10px">${e.pcs.toLocaleString('en-IN')}</td>
      <td style="padding:8px 10px;font-weight:700">${e.wtPc ? e.wtPc + ' gm' : '—'}</td>
      <td style="padding:8px 10px">${totalKg ? totalKg.toLocaleString('en-IN', {maximumFractionDigits:1}) + ' kg' : '—'}</td>
      <td style="padding:8px 10px">${deltaHtml}</td>
    </tr>`;
  }).join('');

  const totKg = _svDisp.reduce((s, e) => s + (e.pcs * e.wtPc / 1000 || 0), 0);
  const totPcs = _svDisp.reduce((s, e) => s + (e.pcs || 0), 0);

  return `
    <div class="add-order-form" style="margin-bottom:12px;display:flex;gap:24px;flex-wrap:wrap">
      <div><div class="form-label">Entries</div><div style="font-size:20px;font-weight:700">${_svDisp.length}</div></div>
      <div><div class="form-label">Total pieces</div><div style="font-size:20px;font-weight:700">${totPcs.toLocaleString('en-IN')}</div></div>
      <div><div class="form-label">Total weight</div><div style="font-size:20px;font-weight:700">${totKg.toLocaleString('en-IN', {maximumFractionDigits:1})} kg</div></div>
    </div>
    <div class="add-order-form" style="padding:0;overflow-x:auto">
    <table class="data-table" style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="text-align:left">
        <th style="padding:8px 10px">Date</th>
        <th style="padding:8px 10px">Party / Item</th>
        <th style="padding:8px 10px">Size</th>
        <th style="padding:8px 10px">Pieces</th>
        <th style="padding:8px 10px">Wt / piece</th>
        <th style="padding:8px 10px">Total wt</th>
        <th style="padding:8px 10px" title="Measured vs product master weight">vs Master</th>
      </tr></thead><tbody>${rows}</tbody></table></div>
    <div class="field-hint" style="margin-top:8px">vs Master = supervisor ka measured weight vs Clients page ka product weight. ±3% green, ±7% orange, zyada red — red matlab paper GSM ya size check karo.</div>`;
}

// Group production + dispatch entries by date → daily totals.
function _svDailySummary() {
  const days = {};
  const day = d => {
    if (!days[d]) days[d] = { plyPcs: 0, sheets: 0, rolls: 0, prodEntries: 0, dispPcs: 0, dispKg: 0 };
    return days[d];
  };
  _svProd.forEach(e => {
    const d = day(e.date || '?');
    d.plyPcs += parseInt(e.plyPcs) || 0;
    d.sheets += parseInt(e.sheets) || 0;
    d.rolls  += parseInt(e.rolls) || 0;
    d.prodEntries++;
  });
  _svDisp.forEach(e => {
    const d = day(e.date || '?');
    d.dispPcs += e.pcs || 0;
    d.dispKg  += (e.pcs * e.wtPc / 1000) || 0;
  });
  // newest date first — dates are M/D/YYYY from the form
  const key = s => { const m = String(s).match(/(\d+)\/(\d+)\/(\d+)/); return m ? `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}` : s; };
  return Object.entries(days).sort((a, b) => key(b[0]).localeCompare(key(a[0])));
}

function _svDailySummaryHtml() {
  const days = _svDailySummary();
  if (!days.length) return '';
  return `
    <div class="add-order-form" style="padding:0;overflow-x:auto;margin-bottom:14px">
    <table class="data-table" style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="text-align:left">
        <th style="padding:8px 10px">📅 Day</th>
        <th style="padding:8px 10px">Ply pieces cut</th>
        <th style="padding:8px 10px">Sheets cut</th>
        <th style="padding:8px 10px">Rolls</th>
        <th style="padding:8px 10px">Dispatched</th>
        <th style="padding:8px 10px">Dispatch wt</th>
      </tr></thead><tbody>` +
    days.map(([date, d]) => `
      <tr style="border-top:1px solid var(--border,#e5e7eb)">
        <td style="padding:8px 10px;font-weight:700;white-space:nowrap">${date}</td>
        <td style="padding:8px 10px;font-weight:600">${d.plyPcs ? d.plyPcs.toLocaleString('en-IN') : '—'}</td>
        <td style="padding:8px 10px">${d.sheets ? d.sheets.toLocaleString('en-IN') : '—'}</td>
        <td style="padding:8px 10px">${d.rolls || '—'}</td>
        <td style="padding:8px 10px">${d.dispPcs ? d.dispPcs.toLocaleString('en-IN') + ' pcs' : '—'}</td>
        <td style="padding:8px 10px">${d.dispKg ? d.dispKg.toLocaleString('en-IN', {maximumFractionDigits:1}) + ' kg' : '—'}</td>
      </tr>`).join('') + `
    </tbody></table></div>`;
}

function _svProductionHtml() {
  if (!_svProd.length) return '<div class="empty-state">Abhi koi production entry nahi.</div>';

  const rows = _svProd.map(e => {
    const reels = [
      e.r1w ? `${e.r1w}" @ ${e.r1g || '?'}g` : '',
      e.r2w ? `${e.r2w}" @ ${e.r2g || '?'}g` : '',
    ].filter(Boolean).join(' + ');
    return `<tr style="border-top:1px solid var(--border,#e5e7eb)">
      <td style="padding:8px 10px;white-space:nowrap">${e.date}</td>
      <td style="padding:8px 10px">${reels || '—'}</td>
      <td style="padding:8px 10px">${e.cutSize ? e.cutSize + '"' : '—'}</td>
      <td style="padding:8px 10px">${e.plyPcs ? parseInt(e.plyPcs).toLocaleString('en-IN') : '—'}</td>
      <td style="padding:8px 10px">${e.sheets ? parseInt(e.sheets).toLocaleString('en-IN') : '—'}</td>
      <td style="padding:8px 10px">${e.rolls || '—'}</td>
    </tr>`;
  }).join('');

  return _svDailySummaryHtml() + `
    <div class="form-title" style="margin-bottom:8px">Entry details</div>
    <div class="add-order-form" style="padding:0;overflow-x:auto">
    <table class="data-table" style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="text-align:left">
        <th style="padding:8px 10px">Date</th>
        <th style="padding:8px 10px">Reels (width @ GSM)</th>
        <th style="padding:8px 10px">Cutting size</th>
        <th style="padding:8px 10px">Ply pieces</th>
        <th style="padding:8px 10px">Sheets</th>
        <th style="padding:8px 10px">Rolls</th>
      </tr></thead><tbody>${rows}</tbody></table></div>`;
}

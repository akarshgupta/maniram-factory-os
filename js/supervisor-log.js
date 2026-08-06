// ══════════════════════════════════════════════════════════════
// SUPERVISOR-LOG.JS — Live view of the supervisor's Google Form
// register ("Maniram — Register Responses" sheet).
//   Production tab: reel widths/GSM, cutting size, pieces/sheets/rolls
//   Dispatch tab:   party, product, order ID, pieces, size, measured weight/piece
// Read-only in the app — supervisor enters data via the form on phone.
//
// Dispatch column G ("Product Name") and H ("Order ID") are optional —
// Google Forms appends a NEW question as a new column at the END of the
// response sheet, not inline, so older rows (and the sheet before those
// questions existed) simply have them blank. Product Name falls back to
// fuzzy-matching the combined party/item column when empty. Order ID has
// no fallback — it's what lets a dispatch entry auto-generate a Delivery
// Challan (see _svAutoCreateChallans below); entries without it just sit
// in the log for the office to challan manually, same as before.
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
    // Sort by the entry's own Date field (not just submission order) — a late-
    // filed entry for an earlier date should still land in date order, newest
    // first, with submission timestamp as the tie-breaker for same-day entries.
    const byDateDesc = (a, b) => _svNormDate(b.date).localeCompare(_svNormDate(a.date)) || b.ts.localeCompare(a.ts);

    _svProd = prod.map(r => ({
      ts: r[0] || '', date: r[1] || '',
      r1w: r[2] || '', r1g: r[3] || '', r2w: r[4] || '', r2g: r[5] || '',
      cutSize: r[6] || '', plyPcs: r[7] || '', sheets: r[8] || '', rolls: r[9] || '',
    })).sort(byDateDesc);
    _svDisp = disp.map(r => ({
      ts: r[0] || '', date: r[1] || '', party: r[2] || '',
      pcs: parseInt(r[3]) || 0, size: r[4] || '',
      wtPc: parseFloat(r[5]) || 0,
      product: r[6] || '',  // "Product Name" question — appended column G, blank on older rows
      // "Order ID" question — appended column H, blank on older rows. The dropdown (Code.gs
      // refreshOrderIdDropdown) shows choices as "MIORD019 — Party — Product" so the supervisor
      // can recognise the right order; only the leading ID token is what matters here.
      orderId: (r[7] || '').toString().split('—')[0].trim(),
    })).sort(byDateDesc);
    _svAutoCreateChallans();
    if (document.getElementById('svlog-root')) renderSupervisorLog(false); // keep the register live if it's the open page
    return true;
  } catch (e) {
    console.error('fetchSupervisorLog:', e);
    return false;
  }
}

// Find expected weight (gm) from the product master. Prefers an exact
// product-name match (from the form's Product Name column); falls back
// to fuzzy-matching whatever text landed in the party/item column for
// rows entered before that question existed.
function _svExpectedWeight(party, product) {
  if (typeof CLIENTS === 'undefined') return null;
  const needle = (product || party || '').toString().trim().toLowerCase();
  if (!needle) return null;
  const exact = !!product;
  for (const c of CLIENTS) {
    for (const prod of (c.products || [])) {
      const n = (prod.name || '').trim().toLowerCase();
      if (!n) continue;
      const isMatch = exact ? (n === needle) : (n === needle || needle.includes(n) || n.includes(needle));
      if (isMatch) {
        const w = parseFloat(prod.weight);
        return w > 0 ? { weight: w, client: c.name, product: prod.name } : null;
      }
    }
  }
  return null;
}

function _svFuzzyEq(a, b) {
  a = (a || '').toString().trim().toLowerCase();
  b = (b || '').toString().trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

// Find which pending order a dispatch entry belongs to, when it has no
// Order ID (or one that didn't match). Tries product name first, narrowing
// by party if more than one order shares that product; falls back to party
// alone when there's no usable product text (common — the supervisor's
// Product Name question is still optional/newer, and today's real data
// mostly has it blank). Only ever returns a match when it's unambiguous —
// two candidate orders means "don't guess", not "pick one".
function _svMatchOrderByProduct(e) {
  if (typeof orders === 'undefined' || typeof FINISHED_STATUSES === 'undefined') return { order: null, reason: 'none' };
  const pending = orders.filter(o => !FINISHED_STATUSES.includes(o.status));
  if (!pending.length) return { order: null, reason: 'none' };

  const byProduct = e.product ? pending.filter(o => _svFuzzyEq(o.product, e.product)) : [];
  if (byProduct.length === 1) return { order: byProduct[0], reason: 'product' };
  if (byProduct.length > 1) {
    const narrowed = e.party ? byProduct.filter(o => _svFuzzyEq(o.customer, e.party)) : [];
    return narrowed.length === 1 ? { order: narrowed[0], reason: 'product+party' } : { order: null, reason: 'ambiguous' };
  }
  if (e.party) {
    const byParty = pending.filter(o => _svFuzzyEq(o.customer, e.party));
    if (byParty.length === 1) return { order: byParty[0], reason: 'party' };
    if (byParty.length > 1) return { order: null, reason: 'ambiguous' };
  }
  return { order: null, reason: 'none' };
}

// Turn dispatch entries into real Delivery Challans, automatically —
// matched by Order ID when present, otherwise by product/party (see
// _svMatchOrderByProduct). Idempotent: each form response's own timestamp
// (e.ts) is stamped onto the challan as svTs, so re-fetching never
// double-creates one. Entries that can't be matched at all, or match more
// than one pending order, are left alone and flagged in the dispatch table
// instead of guessed at.
function _svAutoCreateChallans() {
  if (typeof challanList === 'undefined' || typeof orders === 'undefined') return;
  let created = 0;
  _svDisp.forEach(e => {
    if (!e.ts || !e.pcs) return;
    if (challanList.some(c => c.svTs === e.ts)) return;

    let o = null, matchedBy = '';
    if (e.orderId) {
      o = orders.find(x => (x.id || '').toLowerCase() === e.orderId.toLowerCase());
      if (o) matchedBy = 'Order ID';
    }
    if (!o) {
      const m = _svMatchOrderByProduct(e);
      if (m.order) { o = m.order; matchedBy = 'product/party match'; }
    }
    if (!o) return;

    const record = {
      dcNum:     _nextDcNum(),
      orderId:   o.id,
      customer:  o.customer,
      product:   o.product || o.size || '',
      size:      o.size || '',
      ply:       o.ply  || '',
      colour:    o.colour || '',
      weight:    o.weight || '',
      rate:      o.rate   || 0,
      qty:       e.pcs,
      date:      _svNormDate(e.date) || todayStr,
      note:      `Auto-generated from Supervisor Dispatch Log (matched by ${matchedBy})`,
      createdAt: new Date().toISOString(),
      svTs:      e.ts,
    };
    challanList.push(record);
    created++;
    if (typeof mirrorToSheet === 'function') {
      mirrorToSheet('saveChallan', {
        id: record.dcNum, date: record.date, orderId: record.orderId,
        customer: record.customer, product: record.product,
        qty: record.qty, vehicle: '', notes: record.note,
      });
    }
    if (typeof checkOrderFullyDispatched === 'function') checkOrderFullyDispatched(record.orderId);
  });
  if (created > 0) {
    saveChallans();
    if (typeof renderOrders === 'function') renderOrders();
    if (typeof renderChallansTab === 'function') renderChallansTab();
  }
  // Every challan (this batch or already-existing) gets invoiced if it isn't yet —
  // see autoInvoiceChallans() in js/invoices.js.
  if (typeof autoInvoiceChallans === 'function') autoInvoiceChallans();
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
    body = '<div class="empty-state">⚠️ Could not load the register sheet — check the internet connection and press ↻ Refresh.</div>';
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
  if (!_svDisp.length) return '<div class="empty-state">No dispatch entries yet. They will appear here once the supervisor fills the form.</div>';

  const rows = _svDisp.map(e => {
    const totalKg = e.pcs && e.wtPc ? (e.pcs * e.wtPc / 1000) : 0;
    const exp = _svExpectedWeight(e.party, e.product);
    let deltaHtml = '<span style="color:var(--muted,#888)">—</span>';
    if (exp && e.wtPc) {
      const d = ((e.wtPc - exp.weight) / exp.weight) * 100;
      const col = Math.abs(d) <= 3 ? 'var(--success,#27AE60)' : Math.abs(d) <= 7 ? '#E67E22' : '#E74C3C';
      deltaHtml = `<span style="color:${col};font-weight:700" title="Master: ${exp.weight} gm (${exp.client} / ${exp.product})">${d > 0 ? '+' : ''}${d.toFixed(1)}%</span>`;
    }
    let dcHtml = '<span style="color:var(--muted,#888)">—</span>';
    const dc = typeof challanList !== 'undefined' ? challanList.find(c => c.svTs === e.ts) : null;
    if (dc) {
      dcHtml = `<span style="color:var(--success,#27AE60);font-weight:700" title="Auto-generated ${dc.dcNum} against ${dc.orderId}">✓ ${dc.dcNum} → ${dc.orderId}</span>`;
    } else if (e.orderId) {
      const matchedOrder = typeof orders !== 'undefined' ? orders.find(x => (x.id || '').toLowerCase() === e.orderId.toLowerCase()) : null;
      dcHtml = matchedOrder
        ? `<span style="color:var(--muted,#888)" title="Will challan on next refresh">${e.orderId} · pending</span>`
        : `<span style="color:var(--danger,#E74C3C);font-weight:600" title="No order with this ID — fix the Order ID on the form response">⚠ ${e.orderId}</span>`;
    } else {
      const m = _svMatchOrderByProduct(e);
      if (m.order) {
        dcHtml = `<span style="color:var(--muted,#888)" title="Matched by ${m.reason} — will challan on next refresh">${m.order.id} · pending</span>`;
      } else if (m.reason === 'ambiguous') {
        dcHtml = `<span style="color:#E67E22;font-weight:600" title="More than one pending order matches this product/party — add an Order ID to disambiguate">⚠ ambiguous</span>`;
      }
    }
    return `<tr style="border-top:1px solid var(--border,#e5e7eb)">
      <td style="padding:8px 10px;white-space:nowrap">${_svFmtDate(e.date)}</td>
      <td style="padding:8px 10px;font-weight:600">${e.party || '—'}</td>
      <td style="padding:8px 10px">${e.product || '<span style="color:var(--muted,#888)">—</span>'}</td>
      <td style="padding:8px 10px">${e.size || '—'}</td>
      <td style="padding:8px 10px">${e.pcs.toLocaleString('en-IN')}</td>
      <td style="padding:8px 10px;font-weight:700">${e.wtPc ? e.wtPc + ' gm' : '—'}</td>
      <td style="padding:8px 10px">${totalKg ? totalKg.toLocaleString('en-IN', {maximumFractionDigits:1}) + ' kg' : '—'}</td>
      <td style="padding:8px 10px">${deltaHtml}</td>
      <td style="padding:8px 10px;font-family:monospace;font-size:11px">${dcHtml}</td>
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
        <th style="padding:8px 10px">Party</th>
        <th style="padding:8px 10px">Product</th>
        <th style="padding:8px 10px">Size</th>
        <th style="padding:8px 10px">Pieces</th>
        <th style="padding:8px 10px">Wt / piece</th>
        <th style="padding:8px 10px">Total wt</th>
        <th style="padding:8px 10px" title="Measured vs product master weight">vs Master</th>
        <th style="padding:8px 10px" title="Auto-generates a Delivery Challan — by Order ID if present, otherwise by matching product/party against pending orders">Order / DC</th>
      </tr></thead><tbody>${rows}</tbody></table></div>
    <div class="field-hint" style="margin-top:8px">vs Master compares the supervisor's measured weight against the product weight on the Clients page. Within ±3% green, ±7% orange, beyond that red — red means check the paper GSM or size. Order / DC: a ✓ means a Delivery Challan was auto-created from this entry, reducing that order's pending quantity (see the Challans tab). With no Order ID, it's matched by product name (falling back to party) against pending orders — orange "ambiguous" means more than one pending order matches and nothing was guessed; a red ⚠ means a typed Order ID matches no order. Either way, fix the entry (or add/clarify an Order ID) and it'll challan on the next refresh.
    ${_svDisp.some(e => !e.product) ? '<br>⚠️ Older entries have no separate Product Name — see the note below on adding that question to the form.' : ''}</div>`;
}

// Paper weight consumed by one entry, in kg.
// One cut piece = (reel width × cutting size / 1550) sqm × GSM grams per layer.
// On two-reel (corrugated 2-ply) entries, Reel 2 is treated as the fluted
// layer, which consumes ~1.5× its length (flute take-up factor).
function _svEntryKg(e) {
  const cut = parseFloat(e.cutSize);
  const pcs = parseInt(e.plyPcs) || parseInt(e.sheets) || 0;
  if (!cut || !pcs) return 0;
  const r1w = parseFloat(e.r1w), r1g = parseFloat(e.r1g);
  const r2w = parseFloat(e.r2w), r2g = parseFloat(e.r2g);
  let gramsPerPc = 0;
  if (r1w && r1g) gramsPerPc += (r1w * cut / 1550) * r1g;
  if (r2w && r2g) gramsPerPc += (r2w * cut / 1550) * r2g * 1.5;
  return gramsPerPc * pcs / 1000;
}

// Normalize the form's M/D/YYYY date (no leading zeros) to YYYY-MM-DD,
// so it can be compared against dates from the rest of the app.
function _svNormDate(s) {
  const m = String(s || '').match(/(\d+)\/(\d+)\/(\d+)/);
  return m ? `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}` : (s || '');
}

// Display-format the form's M/D/YYYY date as DD/MM/YY.
function _svFmtDate(s) {
  const m = String(s || '').match(/(\d+)\/(\d+)\/(\d+)/);
  return m ? `${m[2].padStart(2,'0')}/${m[1].padStart(2,'0')}/${m[3].slice(-2)}` : (s || '—');
}

// Group production + dispatch entries by date → daily totals.
function _svDailySummary() {
  const days = {};
  const day = d => {
    if (!days[d]) days[d] = { plyPcs: 0, sheets: 0, rolls: 0, prodKg: 0, prodEntries: 0, dispPcs: 0, dispKg: 0 };
    return days[d];
  };
  _svProd.forEach(e => {
    const d = day(e.date || '?');
    d.plyPcs += parseInt(e.plyPcs) || 0;
    d.sheets += parseInt(e.sheets) || 0;
    d.rolls  += parseInt(e.rolls) || 0;
    d.prodKg += _svEntryKg(e);
    d.prodEntries++;
  });
  _svDisp.forEach(e => {
    const d = day(e.date || '?');
    d.dispPcs += e.pcs || 0;
    d.dispKg  += (e.pcs * e.wtPc / 1000) || 0;
  });
  // newest date first
  return Object.entries(days).sort((a, b) => _svNormDate(b[0]).localeCompare(_svNormDate(a[0])));
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
        <th style="padding:8px 10px" title="Paper consumed, computed from reel widths × GSM × cutting size">Production wt</th>
        <th style="padding:8px 10px">Dispatched</th>
        <th style="padding:8px 10px">Dispatch wt</th>
      </tr></thead><tbody>` +
    days.map(([date, d]) => `
      <tr style="border-top:1px solid var(--border,#e5e7eb)">
        <td style="padding:8px 10px;font-weight:700;white-space:nowrap">${_svFmtDate(date)}</td>
        <td style="padding:8px 10px;font-weight:600">${d.plyPcs ? d.plyPcs.toLocaleString('en-IN') : '—'}</td>
        <td style="padding:8px 10px">${d.sheets ? d.sheets.toLocaleString('en-IN') : '—'}</td>
        <td style="padding:8px 10px">${d.rolls || '—'}</td>
        <td style="padding:8px 10px;font-weight:700;color:var(--accent,#2980B9)">${d.prodKg ? d.prodKg.toLocaleString('en-IN', {maximumFractionDigits:1}) + ' kg' : '—'}</td>
        <td style="padding:8px 10px">${d.dispPcs ? d.dispPcs.toLocaleString('en-IN') + ' pcs' : '—'}</td>
        <td style="padding:8px 10px">${d.dispKg ? d.dispKg.toLocaleString('en-IN', {maximumFractionDigits:1}) + ' kg' : '—'}</td>
      </tr>`).join('') + `
    </tbody></table></div>
    <div class="field-hint" style="margin-bottom:14px">Production weight = paper consumed, calculated per entry as reel width × cutting size × GSM (Reel 2 counted at 1.5× for flute take-up). Roll-only entries have no weight — length is unknown.</div>`;
}

function _svProductionHtml() {
  if (!_svProd.length) return '<div class="empty-state">No production entries yet.</div>';

  const rows = _svProd.map(e => {
    const reels = [
      e.r1w ? `${e.r1w}" @ ${e.r1g || '?'}g` : '',
      e.r2w ? `${e.r2w}" @ ${e.r2g || '?'}g` : '',
    ].filter(Boolean).join(' + ');
    const kg = _svEntryKg(e);
    return `<tr style="border-top:1px solid var(--border,#e5e7eb)">
      <td style="padding:8px 10px;white-space:nowrap">${_svFmtDate(e.date)}</td>
      <td style="padding:8px 10px">${reels || '—'}</td>
      <td style="padding:8px 10px">${e.cutSize ? e.cutSize + '"' : '—'}</td>
      <td style="padding:8px 10px">${e.plyPcs ? parseInt(e.plyPcs).toLocaleString('en-IN') : '—'}</td>
      <td style="padding:8px 10px">${e.sheets ? parseInt(e.sheets).toLocaleString('en-IN') : '—'}</td>
      <td style="padding:8px 10px">${e.rolls || '—'}</td>
      <td style="padding:8px 10px;font-weight:600">${kg ? kg.toLocaleString('en-IN', {maximumFractionDigits:1}) + ' kg' : '—'}</td>
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
        <th style="padding:8px 10px">Paper used</th>
      </tr></thead><tbody>${rows}</tbody></table></div>`;
}

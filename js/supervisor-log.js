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

// Plain substring match, plus a second pass with spaces/punctuation stripped —
// real entries are typed as "N D S" vs "NDS", "S S D" vs "SSD", "Eagle ( small)"
// vs "Eagle (Big)", etc.
function _svFuzzyEq(a, b) {
  a = (a || '').toString().trim().toLowerCase();
  b = (b || '').toString().trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const na = a.replace(/[\s.,()]/g, ''), nb = b.replace(/[\s.,()]/g, '');
  return !!na && !!nb && (na === nb || na.includes(nb) || nb.includes(na));
}

// Find which pending order a dispatch entry belongs to, when it has no
// Order ID (or one that didn't match). Tries product name first, narrowing
// by party — then by the dispatch entry's own Size column — if more than
// one order shares that product. When there's no usable Product Name text
// (common — that question is newer/still optional, and most real entries
// predate it), falls back to the "Party Name" field — but tries it against
// BOTH order.customer and order.product, because real data shows the
// supervisor very often types the box/design name into that field instead
// of an actual customer name (e.g. "Madhubala", "Tower", "Jio" are product
// names, not parties). Only ever returns a match when it's unambiguous —
// two candidate orders means "don't guess", not "pick one".
function _svMatchOrderByProduct(e) {
  if (typeof orders === 'undefined' || typeof FINISHED_STATUSES === 'undefined') return { order: null, reason: 'none' };
  const pending = orders.filter(o => !FINISHED_STATUSES.includes(o.status));
  if (!pending.length) return { order: null, reason: 'none' };

  if (e.product) {
    const byProduct = pending.filter(o => _svFuzzyEq(o.product, e.product));
    if (byProduct.length === 1) return { order: byProduct[0], reason: 'product' };
    if (byProduct.length > 1) {
      let narrowed = e.party ? byProduct.filter(o => _svFuzzyEq(o.customer, e.party)) : [];
      if (narrowed.length === 1) return { order: narrowed[0], reason: 'product+party' };
      narrowed = e.size ? byProduct.filter(o => _svFuzzyEq(o.size, e.size)) : [];
      if (narrowed.length === 1) return { order: narrowed[0], reason: 'product+size' };
      return { order: null, reason: 'ambiguous' };
    }
  }
  if (e.party) {
    const byCustomer = pending.filter(o => _svFuzzyEq(o.customer, e.party));
    const byProdText = pending.filter(o => _svFuzzyEq(o.product, e.party));
    const combined   = [...new Set([...byCustomer, ...byProdText])];
    if (combined.length === 1) return { order: combined[0], reason: byCustomer.length ? 'party' : 'party-as-product' };
    if (combined.length > 1) return { order: null, reason: 'ambiguous' };
  }
  return { order: null, reason: 'none' };
}

// Build + save one challan for a dispatch entry matched to an order, shared
// by the automatic sweep below and the manual "Link to Order" picker.
// Returns the created record.
function _svCreateChallanFor(e, o, matchedBy) {
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
  saveChallans();
  if (typeof mirrorToSheet === 'function') {
    mirrorToSheet('saveChallan', {
      id: record.dcNum, date: record.date, orderId: record.orderId,
      customer: record.customer, product: record.product,
      qty: record.qty, vehicle: '', notes: record.note,
    });
  }
  if (typeof logOrderEvent === 'function') logOrderEvent(record.orderId, 'Dispatched', `${record.dcNum} · ${record.qty} pcs · matched by ${matchedBy}`);
  if (typeof notifyDispatchWA === 'function') notifyDispatchWA(record);
  if (typeof checkOrderFullyDispatched === 'function') checkOrderFullyDispatched(record.orderId);
  if (typeof renderOrders === 'function') renderOrders();
  if (typeof renderChallansTab === 'function') renderChallansTab();
  if (typeof autoInvoiceChallans === 'function') autoInvoiceChallans();
  return record;
}

// Turn dispatch entries into real Delivery Challans, automatically —
// matched by Order ID when present, otherwise by product/party (see
// _svMatchOrderByProduct), restricted to orders still open (not yet
// Delivered/Dispatched/Cancelled) since this path never has a human
// double-checking it. Idempotent: each form response's own timestamp
// (e.ts) is stamped onto the challan as svTs, so re-fetching never
// double-creates one. Entries that can't be matched at all, or match more
// than one pending order, are left alone and flagged in the dispatch table
// — with a "Link to Order" picker (any order, any status) to resolve by
// hand instead, since real supervisor data is often too messy (product
// names typed into the party field, plain box sizes, etc.) for automatic
// matching to safely guess.
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

    _svCreateChallanFor(e, o, matchedBy);
    created++;
  });
  if (created > 0 && document.getElementById('svlog-root')) renderSupervisorLog(false);
}

// ── Manual "Link to Order" — for dispatch entries automatic matching can't
// safely resolve (ambiguous, or no product/party text that matches anything).
// Unlike the automatic sweep, this searches every order regardless of status
// — a human is explicitly confirming the match, so there's no guessing risk,
// and it's the only way to backfill a dispatch against an order that was
// already marked Delivered by hand without ever being formally challaned. ──
let _svLinkTs = null;

function openSvLinkModal(ts) {
  _svLinkTs = ts;
  const overlay = document.getElementById('sv-link-overlay');
  if (!overlay) return;
  const e = _svDisp.find(x => x.ts === ts);
  document.getElementById('sv-link-info').textContent = e
    ? `${e.party || '—'}${e.product ? ' · ' + e.product : ''} · ${e.pcs.toLocaleString('en-IN')} pcs · ${_svFmtDate(e.date)}`
    : '';
  const search = document.getElementById('sv-link-search');
  search.value = '';
  renderSvLinkResults('');
  document.getElementById('sv-nq-form').style.display = 'none';
  overlay.style.display = 'flex';
  search.focus();
}

function closeSvLinkModal() {
  document.getElementById('sv-link-overlay').style.display = 'none';
  _svLinkTs = null;
}

// ── Customer autocomplete for the quick-create form — same typeahead as
// the main New Order form's Customer field (js/clients.js), kept as its
// own copy with separate state since both fields can't be open at once
// but shouldn't share acFiltered/acSelectedIdx regardless. ──
let _svNqFiltered    = [];
let _svNqSelectedIdx = -1;

function onSvNqCustomerInput() {
  const val = document.getElementById('sv-nq-customer').value.trim().toLowerCase();
  const dd  = document.getElementById('sv-nq-customer-dropdown');
  if (!val) { dd.style.display = 'none'; _svNqFiltered = []; return; }

  _svNqFiltered    = sortedClients().filter(c => c.name.toLowerCase().includes(val));
  _svNqSelectedIdx = -1;
  if (!_svNqFiltered.length) { dd.style.display = 'none'; return; }

  dd.innerHTML = '';
  _svNqFiltered.forEach(c => {
    const item = document.createElement('div');
    item.className = 'autocomplete-item';
    const idx    = c.name.toLowerCase().indexOf(val);
    const before = c.name.slice(0, idx);
    const match  = c.name.slice(idx, idx + val.length);
    const after  = c.name.slice(idx + val.length);
    item.innerHTML = `${before}<strong>${match}</strong>${after}`;
    item.onmousedown = () => selectSvNqCustomer(c.name);
    dd.appendChild(item);
  });
  dd.style.display = 'block';
}

function selectSvNqCustomer(name) {
  document.getElementById('sv-nq-customer').value = name;
  document.getElementById('sv-nq-customer-dropdown').style.display = 'none';
  _svNqFiltered = [];
  populateSvNqProductDropdown(name);
}

document.addEventListener('click', e => {
  const grp = document.getElementById('sv-nq-customer-group');
  if (grp && !grp.contains(e.target)) {
    const dd = document.getElementById('sv-nq-customer-dropdown');
    if (dd) dd.style.display = 'none';
  }
});

function onSvNqCustomerKey(e) {
  const dd    = document.getElementById('sv-nq-customer-dropdown');
  const items = dd.querySelectorAll('.autocomplete-item');
  if (e.key === 'ArrowDown') {
    _svNqSelectedIdx = Math.min(_svNqSelectedIdx + 1, _svNqFiltered.length - 1);
    items.forEach((el, i) => el.classList.toggle('selected', i === _svNqSelectedIdx));
    e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    _svNqSelectedIdx = Math.max(_svNqSelectedIdx - 1, 0);
    items.forEach((el, i) => el.classList.toggle('selected', i === _svNqSelectedIdx));
    e.preventDefault();
  } else if (e.key === 'Enter') {
    if (_svNqSelectedIdx >= 0 && _svNqFiltered[_svNqSelectedIdx]) selectSvNqCustomer(_svNqFiltered[_svNqSelectedIdx].name);
    e.preventDefault();
  } else if (e.key === 'Escape') {
    dd.style.display = 'none';
  }
}

// ── Product dropdown for the quick-create form — same customer→product
// cascade as the main New Order form (js/clients.js: populateProductDropdown
// / onProductChange): picking one of the customer's known products
// auto-fills Size/Ply/Colour/Weight/Reel Size/Rate. Unlike the main form,
// there's no "Add New Product for this Client" option here — the customer
// itself may not exist as a saved client yet at this point (it's only
// created when the order is submitted), so there's no client index to file
// a new product under. Size/Ply/Colour/Weight/Reel Size stay freely
// editable either way, same as the main form. ──
function populateSvNqProductDropdown(customerName) {
  const sel    = document.getElementById('sv-nq-product');
  const client = CLIENTS.find(c => c.name === customerName);

  if (!client || !client.products || !client.products.length) {
    sel.innerHTML = '<option value="">— No products yet —</option>';
    return;
  }
  sel.innerHTML = '<option value="">— Select Product —</option>';
  client.products.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value       = i;
    opt.textContent = `${p.name} · ${p.size} · ${p.ply}ply · ${p.weight}gm`;
    sel.appendChild(opt);
  });
}

function onSvNqProductChange() {
  const sel    = document.getElementById('sv-nq-product');
  const custNm = document.getElementById('sv-nq-customer').value;
  const client = CLIENTS.find(c => c.name === custNm);
  const idx    = parseInt(sel.value);
  const p      = client && !isNaN(idx) ? client.products[idx] : null;

  if (!p) {
    ['sv-nq-size', 'sv-nq-ply', 'sv-nq-colour', 'sv-nq-weight', 'sv-nq-reelsize'].forEach(id => { document.getElementById(id).value = ''; });
    return;
  }
  document.getElementById('sv-nq-size').value     = p.size     || '';
  document.getElementById('sv-nq-ply').value      = p.ply      || '';
  document.getElementById('sv-nq-colour').value   = p.colour   || '';
  document.getElementById('sv-nq-weight').value   = p.weight   || '';
  document.getElementById('sv-nq-reelsize').value = p.reelSize || '';
  if (p.rate) document.getElementById('sv-nq-rate').value = p.rate;
}

// ── Quick "create new order" from an unmatched dispatch entry — for when
// the dispatch genuinely has no order behind it yet (a backdated/off-books
// order). Pre-fills from the dispatch row; only Customer + Delivery Date
// are required, same as the main New Order form. Creating jumps straight
// into linkDispatchToOrder-style challan creation so the entry stops
// showing as unmatched immediately, instead of a second manual step. ──
function toggleSvNewOrderForm() {
  const form = document.getElementById('sv-nq-form');
  const opening = form.style.display === 'none';
  form.style.display = opening ? 'block' : 'none';
  if (!opening) return;

  const e = _svDisp.find(x => x.ts === _svLinkTs);
  const custName = e?.party || '';
  document.getElementById('sv-nq-customer').value = custName;
  document.getElementById('sv-nq-size').value      = e?.size  || '';
  document.getElementById('sv-nq-ply').value       = '';
  document.getElementById('sv-nq-colour').value    = '';
  document.getElementById('sv-nq-weight').value    = e?.wtPc  || '';
  document.getElementById('sv-nq-reelsize').value  = '';
  document.getElementById('sv-nq-qty').value       = e?.pcs   || '';
  document.getElementById('sv-nq-rate').value      = '';
  document.getElementById('sv-nq-date').value      = e ? _svNormDate(e.date) : '';

  populateSvNqProductDropdown(custName);
  // If the dispatch entry's product text matches one of this customer's
  // known products, select it so the cascade auto-fill (Size/Ply/Colour/
  // Weight/Reel Size/Rate) applies exactly as it would on the Orders tab —
  // its saved specs take precedence over the dispatch row's raw text.
  const client = CLIENTS.find(c => c.name === custName);
  if (client && e?.product) {
    const pIdx = client.products.findIndex(p => _svFuzzyEq(p.name, e.product));
    if (pIdx >= 0) {
      document.getElementById('sv-nq-product').value = String(pIdx);
      onSvNqProductChange();
    }
  }
  document.getElementById('sv-nq-customer').focus();
}

function createOrderFromDispatch() {
  const e = _svDisp.find(x => x.ts === _svLinkTs);
  if (!e) { closeSvLinkModal(); return; }

  const customer = document.getElementById('sv-nq-customer').value.trim();
  const date     = document.getElementById('sv-nq-date').value;
  if (!customer || !date) { alert('Customer and Delivery Date are required.'); return; }

  // Product name comes from the selected catalog entry, same as the Orders
  // tab — but falls back to the dispatch row's own product text when the
  // customer has no matching saved product (very often the case here,
  // since this modal exists for dispatches nothing could already match).
  const prodSel   = document.getElementById('sv-nq-product');
  const prodIdx   = parseInt(prodSel.value);
  const client    = CLIENTS.find(c => c.name === customer);
  const product   = (client && !isNaN(prodIdx) && client.products[prodIdx]) ? client.products[prodIdx].name : (e.product || '').trim();
  const size      = document.getElementById('sv-nq-size').value.trim();
  const ply       = document.getElementById('sv-nq-ply').value.trim();
  const colour    = document.getElementById('sv-nq-colour').value.trim();
  const qty       = document.getElementById('sv-nq-qty').value;
  const weight    = document.getElementById('sv-nq-weight').value;
  const reelSize  = document.getElementById('sv-nq-reelsize').value.trim();
  const rate      = document.getElementById('sv-nq-rate').value;

  const id = generateOrderId();
  const d       = new Date(date);
  const fmtDate = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  const reservedKg = typeof calcOrderKg === 'function' ? calcOrderKg(weight, qty) : 0;
  const payload = {
    id, customer, product, size, ply, colour, weight, qty, rate,
    date: fmtDate, orderDate: fmtDate, status: 'New', priority: 'Normal',
    reelSize, reservedKg, remarks: '',
  };

  const newOrder = {
    id, customer, product, size, ply, colour, weight,
    qty: parseInt(qty) || 0, rate: parseFloat(rate) || 0, date, orderDate: date,
    status: 'New', priority: 'Normal', reelSize, reservedKg, remarks: '', rowIndex: 9999,
  };
  orders.push(newOrder);
  pendingOrderIds.add(id);
  fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {});
  setTimeout(() => fetchOrders(), 4000);

  closeSvLinkModal();
  _svCreateChallanFor(e, newOrder, 'new order created from dispatch');
  renderSupervisorLog(false);
  if (typeof renderOrders === 'function') renderOrders();
}

function renderSvLinkResults(q) {
  const el = document.getElementById('sv-link-results');
  if (!el) return;
  const needle = q.trim().toLowerCase();
  const list = (typeof orders !== 'undefined' ? orders : [])
    .filter(o => !needle ||
      (o.id || '').toLowerCase().includes(needle) ||
      (o.customer || '').toLowerCase().includes(needle) ||
      (o.product || '').toLowerCase().includes(needle))
    .slice(0, 40);
  if (!list.length) { el.innerHTML = '<div class="empty-state">No matching orders.</div>'; return; }
  el.innerHTML = list.map(o => `
    <div onclick="linkDispatchToOrder('${o.id}')"
      style="padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--border)"
      onmouseover="this.style.background='var(--hover-bg,#f5f7fa)'" onmouseout="this.style.background=''">
      <div style="font-weight:700;font-size:13px">${o.id} — ${o.customer}</div>
      <div style="font-size:11px;color:var(--muted)">${o.product || '—'} · ${o.size || '—'} · ${o.status || '—'}</div>
    </div>`).join('');
}

function linkDispatchToOrder(orderId) {
  const e = _svDisp.find(x => x.ts === _svLinkTs);
  const o = typeof orders !== 'undefined' ? orders.find(x => x.id === orderId) : null;
  closeSvLinkModal();
  if (!e || !o) return;
  _svCreateChallanFor(e, o, 'manual link');
  renderSupervisorLog(false);
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
    // No challan yet for this entry — offer a manual picker regardless of why
    // (unmatched, ambiguous, or a mistyped Order ID) so nothing has to stay stuck.
    if (!dc) {
      dcHtml += ` <button class="btn-sm" style="font-size:10px;padding:2px 7px" onclick="openSvLinkModal('${e.ts.replace(/'/g, "\\'")}')" title="Pick the order this dispatch belongs to">🔗 Link</button>`;
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
    <div class="field-hint" style="margin-top:8px">vs Master compares the supervisor's measured weight against the product weight on the Clients page. Within ±3% green, ±7% orange, beyond that red — red means check the paper GSM or size. Order / DC: a ✓ means a Delivery Challan was auto-created from this entry, reducing that order's pending quantity (see the Challans tab). With no Order ID, it's matched by product name (falling back to party) against pending orders — orange "ambiguous" means more than one pending order matches and nothing was guessed; a red ⚠ means a typed Order ID matches no order. Anything not yet matched shows a <strong>🔗 Link</strong> button — pick the right order by hand (any order, any status) and it'll challan immediately, no need to wait for a form fix.
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

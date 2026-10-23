// ══════════════════════════════════════════════════════════════
// HEALTH-CHECK.JS — Data checker. Runs on load and every 5 minutes
// in this browser (the only place that can see challans, invoices and
// the order log, which live in localStorage) and lists anything that
// looks wrong: orders closed without their boxes going out, open orders
// that are actually complete, records linked to the wrong order,
// duplicates, unbilled or over-billed dispatches. Each problem has a
// one-click fix or a button to open the right place. "Ignore" hides a
// problem for good (e.g. an old order delivered before the app existed).
// ══════════════════════════════════════════════════════════════

const LS_HEALTH_IGNORED = 'mi_health_ignored_v1';
let _healthIssues = [];

function _healthIgnored() { try { return new Set(JSON.parse(localStorage.getItem(LS_HEALTH_IGNORED) || '[]')); } catch { return new Set(); } }
function ignoreHealthIssue(key) {
  const s = _healthIgnored(); s.add(key);
  try { localStorage.setItem(LS_HEALTH_IGNORED, JSON.stringify([...s])); } catch (e) {}
  runHealthCheck(); openHealthCheck();
}

const _hEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const _hN   = n => (n || 0).toLocaleString('en-IN');
const _hBtn = (label, js, danger) => `<button class="btn-secondary" style="font-size:11px;padding:3px 8px${danger ? ';color:var(--danger)' : ''}" onclick="${js}">${label}</button>`;
const _hOrderLine = o => `<strong style="font-family:monospace">${o.id}</strong> — ${_hEsc(o.customer)} · ${_hEsc(o.product || '')} ${_hEsc(o.size || '')}`;

function runHealthCheck() {
  if (typeof orders === 'undefined' || !orders.length) return [];
  const ignored  = _healthIgnored();
  const challans = typeof challanList !== 'undefined' ? challanList : [];
  const invoices = typeof invoiceList !== 'undefined' ? invoiceList : [];
  const sent     = id => typeof getDispatchedQty === 'function' ? getDispatchedQty(id) : 0;
  const billed   = id => invoices.reduce((s, iv) => s + (iv.items || []).reduce((t, it) => t + ((it.orderId || iv.orderId) === id ? (+it.qty || 0) : 0), 0), 0);
  const byId     = {}; orders.forEach(o => { (byId[o.id] = byId[o.id] || []).push(o); });
  const issues   = [];
  const keys = new Set();
  const add = (key, level, group, html, actions) => { if (!ignored.has(key) && !keys.has(key)) { keys.add(key); issues.push({ key, level, group, html, actions }); } };
  // Orders placed before the first challan ever recorded were delivered
  // before the app tracked dispatches — "0 dispatched" on those is normal.
  const trackingStart = challans.map(c => c.date || '').filter(Boolean).sort()[0] || '9999';

  orders.forEach(o => {
    const qty = parseInt(o.qty) || 0, s = sent(o.id), b = billed(o.id);
    const hist = _hBtn('🚚 History', `openOrderHistory('${o.id}')`);
    // Closed, but the boxes never (fully) went out
    const tracked = s > 0 || (o.orderDate && o.orderDate >= trackingStart);
    if ((o.status === 'Delivered' || o.status === 'Dispatched') && qty && s < qty && tracked && !/short/i.test(o.remarks || '')) {
      add(`closed:${o.id}`, s === 0 ? 'high' : 'mid', 'Closed but not fully dispatched',
        `${_hOrderLine(o)} — ${o.status}, only ${_hN(s)} of ${_hN(qty)} pcs dispatched`,
        [_hBtn('🔧 Fix', `openOrderFixer('${o.id}')`), hist, _hBtn('↩ Reopen', `reopenOrder('${o.id}');runHealthCheck();openHealthCheck()`)]);
    }
    // Every box out, but still sitting in active orders
    if (!FINISHED_STATUSES.includes(o.status) && qty && s >= qty) {
      add(`done:${o.id}`, 'mid', 'Fully dispatched but still open',
        `${_hOrderLine(o)} — ${_hN(s)} of ${_hN(qty)} pcs dispatched`,
        [hist, _hBtn('✅ Mark Delivered', `checkOrderFullyDispatched('${o.id}');renderOrders();runHealthCheck();openHealthCheck()`)]);
    }
    if (qty && s > qty * 1.1 && s - qty >= 50) {
      add(`over:${o.id}:${s}`, 'high', 'Dispatched far more than ordered',
        `${_hOrderLine(o)} — ${_hN(s)} pcs dispatched against ${_hN(qty)} ordered. A dispatch may be linked to the wrong order.`, [_hBtn('🔧 Fix', `openOrderFixer('${o.id}')`), hist]);
    }
    if (s > 0 && b > s) {
      add(`bill:${o.id}:${b}:${s}`, 'mid', 'Billed more than dispatched',
        `${_hOrderLine(o)} — ${_hN(b)} pcs invoiced, ${_hN(s)} pcs dispatched`, [_hBtn('🔧 Fix', `openOrderFixer('${o.id}')`), hist]);
    }
    if (!FINISHED_STATUSES.includes(o.status) && !o.orderDate) {
      add(`nodate:${o.id}`, 'low', 'Open order with no order date', _hOrderLine(o),
        [_hBtn('✏️ Edit', `closeHealthCheck();openEditModal('${o.id}')`)]);
    }
  });

  // Same order ID on two sheet rows
  Object.entries(byId).forEach(([id, list]) => {
    if (list.length > 1) add(`dupid:${id}`, 'high', 'Same order ID used twice',
      `<strong style="font-family:monospace">${id}</strong> is on ${list.length} rows: ${list.map(o => _hEsc(o.customer + ' · ' + (o.product || o.size || ''))).join(' / ')}.`, [_hBtn('🔧 Fix', `fixDuplicateId('${id}')`)]);
  });

  // Two open orders for the same party, box size, quantity and rate
  const seen = {};
  orders.filter(o => !FINISHED_STATUSES.includes(o.status)).forEach(o => {
    const dims = typeof _dimsKey === 'function' ? _dimsKey(o.size) : (o.size || '');
    const k = [(o.customer || '').toLowerCase().trim(), (o.product || '').toLowerCase().replace(/\s+/g, ' ').trim(), dims, o.qty, o.rate].join('|');
    if (seen[k]) {
      const a = seen[k];
      add(`duporder:${a.id}:${o.id}`, 'mid', 'Possible duplicate orders',
        `${_hOrderLine(a)} and <strong style="font-family:monospace">${o.id}</strong> — same party, product, size, ${_hN(o.qty)} pcs @ ₹${o.rate}`,
        [_hBtn(`🗑 Delete ${o.id}`, `removeOrder('${o.id}');runHealthCheck();openHealthCheck()`, true)]);
    } else seen[k] = o;
  });

  // Records whose box size doesn't match the order they point at
  if (typeof _dimsKey === 'function') {
    const wrong = [];
    challans.forEach(c => { const o = (byId[c.orderId] || [])[0]; if (o && _dimsKey(o.size) && _dimsKey(c.size) && _dimsKey(o.size) !== _dimsKey(c.size)) wrong.push(`${c.dcNum} → ${c.orderId}`); });
    invoices.forEach(iv => (iv.items || []).forEach(it => { const o = (byId[it.orderId] || [])[0]; if (o && _dimsKey(o.size) && _dimsKey(it.desc) && _dimsKey(o.size) !== _dimsKey(it.desc)) wrong.push(`${iv.id} → ${it.orderId}`); }));
    if (wrong.length) add(`wrongsize:${wrong.join(',')}`, 'high', 'Linked to an order of a different box size',
      wrong.map(_hEsc).join(', '), [_hBtn('Unlink them', `unlinkMislinkedOrderRecords();runHealthCheck();openHealthCheck()`)]);
  }

  // Challans pointing at an order that no longer exists
  const orphan = challans.filter(c => c.orderId && !byId[c.orderId]);
  if (orphan.length) add(`orphan:${orphan.map(c => c.dcNum).join(',')}`, 'low', 'Challans linked to a deleted order',
    orphan.map(c => `${_hEsc(c.dcNum)} → ${_hEsc(c.orderId)} (${_hN(c.qty)} pcs)`).join(', '),
    [_hBtn('🔧 Fix', `openOrphanFixer()`)]);

  // Duplicate challans / invoices
  if (typeof findDuplicateChallans === 'function') {
    const d = findDuplicateChallans();
    if (d.challans.length || d.invoices.length) add(`dups:${d.challans.join(',')}:${d.invoices.join(',')}`, 'high', 'Duplicate challans or invoices',
      `${d.challans.length} challan(s) ${_hEsc(d.challans.join(', '))}${d.invoices.length ? ` and ${d.invoices.length} invoice(s) ${_hEsc(d.invoices.join(', '))}` : ''}`,
      [_hBtn('Remove duplicates', `removeDuplicateChallans();runHealthCheck();openHealthCheck()`)]);
  }

  // Challans never billed (usually no rate on the order)
  const billedDcs = new Set(); invoices.forEach(iv => (iv.items || []).forEach(it => it.challanDc && billedDcs.add(it.challanDc)));
  const unbilled = challans.filter(c => c.dcNum && c.qty && !billedDcs.has(c.dcNum));
  if (unbilled.length) add(`unbilled:${unbilled.map(c => c.dcNum).join(',')}`, 'mid', 'Dispatched but not invoiced',
    unbilled.slice(0, 15).map(c => `${_hEsc(c.dcNum)} · ${_hEsc(c.customer)} · ${_hN(c.qty)} pcs${c.rate ? '' : ' (no rate)'}`).join('<br>') + (unbilled.length > 15 ? `<br>…and ${unbilled.length - 15} more` : ''),
    [...(unbilled.some(c => c.rate) ? [_hBtn('🔧 Bill them now', `autoInvoiceChallans();runHealthCheck();openHealthCheck()`)] : []), _hBtn('Open Invoicing', `closeHealthCheck();showPage('invoicing')`)]);

  // Supervisor dispatches from the last 30 days (but over a day old) that never became a challan
  if (typeof _svDisp !== 'undefined' && _svDisp.length) {
    const cutoff = Date.now() - 86400000, from = Date.now() - 30 * 86400000;
    const rejected = typeof _svRejectedTs !== 'undefined' ? _svRejectedTs : new Set();
    const loose = _svDisp.filter(e => !rejected.has(e.ts) && !challans.some(c => c.svTs === e.ts) && (() => {
      const d = new Date(typeof _svNormDate === 'function' ? _svNormDate(e.date) : e.date); return !isNaN(d) && d.getTime() < cutoff && d.getTime() >= from;
    })());
    if (loose.length) add(`svloose:${loose.length}:${loose[0].ts}`, 'low', 'Supervisor dispatches (last 30 days) not linked to any order',
      `${loose.length} entr${loose.length === 1 ? 'y' : 'ies'} — e.g. ${loose.slice(0, 5).map(e => `${_hEsc(e.party || e.product)} · ${_hN(e.pcs)} pcs`).join('; ')}`,
      [_hBtn('Open Supervisor Register', `closeHealthCheck();showPage('svlog')`)]);
  }

  const rank = { high: 0, mid: 1, low: 2 };
  _healthIssues = issues.sort((a, b) => rank[a.level] - rank[b.level]);
  _renderHealthBadge();
  return _healthIssues;
}

function _renderHealthBadge() {
  const btn = document.getElementById('health-btn');
  if (!btn) return;
  const high = _healthIssues.filter(i => i.level === 'high').length;
  const n = _healthIssues.length;
  btn.innerHTML = n ? `🩺 Checks <span style="background:${high ? '#DC2626' : '#F59E0B'};color:#fff;border-radius:9px;padding:0 6px;font-size:10px;font-weight:700;margin-left:3px">${n}</span>` : '🩺 All good';
  btn.title = n ? `${n} thing(s) to check${high ? `, ${high} important` : ''}` : 'Data checks passed';
}

function openHealthCheck() {
  let ov = document.getElementById('health-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'health-overlay'; ov.className = 'popup-overlay';
    ov.onclick = e => { if (e.target === ov) closeHealthCheck(); };
    document.body.appendChild(ov);
  }
  const colour = { high: '#DC2626', mid: '#D97706', low: '#64748B' };
  const groups = {};
  _healthIssues.forEach(i => { (groups[i.group] = groups[i.group] || []).push(i); });
  const body = !_healthIssues.length
    ? '<div class="empty-state">✅ Nothing to check — orders, challans and invoices all line up.</div>'
    : Object.entries(groups).map(([g, list]) => `
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:${colour[list[0].level]};text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">${g} — ${list.length}</div>
        ${list.map(i => `<div style="display:flex;gap:10px;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px">
          <div style="flex:1;min-width:0">${i.html}</div>
          <div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end">${i.actions.join('')}
            ${_hBtn('Ignore', `ignoreHealthIssue('${i.key.replace(/'/g, "\\'")}')`)}</div>
        </div>`).join('')}
      </div>`).join('');
  ov.innerHTML = `<div class="popup-box" style="width:min(760px,95vw);max-width:none;padding:22px;max-height:88vh;overflow-y:auto" onclick="event.stopPropagation()">
    <div class="popup-title">🩺 Data Checks</div>
    <div style="font-size:11px;color:var(--muted);margin:-4px 0 12px">Runs on every load and every 5 minutes. "Ignore" hides a problem for good on this computer.</div>
    ${body}
    <div style="display:flex;gap:10px;margin-top:10px"><button class="btn-secondary" onclick="runHealthCheck();openHealthCheck()">↻ Check again</button>
    <button class="btn-primary" style="margin-left:auto" onclick="closeHealthCheck()">Close</button></div></div>`;
  ov.style.display = 'flex';
}

function closeHealthCheck() {
  const ov = document.getElementById('health-overlay');
  if (ov) ov.style.display = 'none';
}

// ══════════════════════════════════════════════════════════════
// FIXER — "🔧 Fix" opens one order with every way to repair it:
// move extra boxes to the party's next open order (splitting a challan
// if needed, its invoice line follows), accept the extra by raising the
// order qty, close short, move/remove single challans, remove a double-
// billed invoice line. Every change is logged in the order's history and
// removed challans/lines go to Recently Deleted.
// ══════════════════════════════════════════════════════════════
const _hKey = n => String(n || '').toLowerCase().replace(/^m\/s\.?\s*/, '').replace(/[^a-z0-9]/g, '');
const _hSent = id => typeof getDispatchedQty === 'function' ? getDispatchedQty(id) : 0;
const _hLeft = o => Math.max(0, (parseInt(o.qty) || 0) - _hSent(o.id));
const _hDims = s => typeof _dimsKey === 'function' ? _dimsKey(s) : String(s || '');

// Open orders of the same party, same box first, then oldest first
function _hTargets(o, excludeId) {
  return orders.filter(x => x.id !== excludeId && !FINISHED_STATUSES.includes(x.status) && _hKey(x.customer) === _hKey(o.customer))
    .map(x => ({ x, same: _hDims(x.size) && _hDims(x.size) === _hDims(o.size) && _hKey(x.colour) === _hKey(o.colour) }))
    .sort((a, b) => (b.same - a.same) || (a.x.orderDate || '').localeCompare(b.x.orderDate || '') || a.x.id.localeCompare(b.x.id))
    .map(t => t.x);
}

function _hRecalcInvoice(iv) {
  const sub = (iv.items || []).reduce((s, it) => s + (+it.qty || 0) * (+it.rate || 0), 0);
  iv.subtotal = sub; iv.total = Math.round(sub); iv.roundOff = iv.total - sub;
  iv.orderId = [...new Set((iv.items || []).map(i => i.orderId).filter(Boolean))][0] || null;
}

function _hAfterChange(...ids) {
  if (typeof saveChallans === 'function') saveChallans();
  if (typeof saveInvoiceList === 'function') saveInvoiceList();
  ids.filter(Boolean).forEach(id => {
    if (typeof _svRevertStaleDeliveredOrder === 'function') _svRevertStaleDeliveredOrder(id, 'challans moved off it in Data Checks');
    if (typeof checkOrderFullyDispatched === 'function') checkOrderFullyDispatched(id);
  });
  if (typeof autoInvoiceChallans === 'function') autoInvoiceChallans();
  if (typeof renderOrders === 'function') renderOrders();
  if (typeof renderOrderHistory === 'function') renderOrderHistory();
  if (typeof renderChallansTab === 'function') renderChallansTab();
  if (typeof renderInvoicingPage === 'function') renderInvoicingPage();
  if (typeof _refreshTrashButtons === 'function') _refreshTrashButtons();
}

function _hMirrorChallan(c) {
  if (typeof mirrorToSheet === 'function') mirrorToSheet('saveChallan', { id: c.dcNum, date: c.date, orderId: c.orderId, customer: c.customer, product: c.product, qty: c.qty, vehicle: c.vehicle || '', notes: c.note || '' });
}

// Move `qty` pcs of one challan to another order — the whole challan is
// re-pointed, or split into two (new DC number for the moved part).
function _hMoveChallanQty(dcNum, toId, qty) {
  const c = challanList.find(x => x.dcNum === dcNum);
  const to = orders.find(x => x.id === toId);
  if (!c || !to || qty <= 0) return null;
  const fromId = c.orderId;
  const point = rec => Object.assign(rec, { orderId: to.id, customer: to.customer, product: to.product || to.size || '', size: to.size || '',
    ply: to.ply || '', colour: to.colour || '', weight: to.weight || '', rate: to.rate || 0 });
  if (qty >= c.qty) {
    point(c);
    c.note = `Moved from ${fromId || 'no order'} in Data Checks — ${c.note || ''}`;
    if (typeof _relinkInvoiceForChallan === 'function') _relinkInvoiceForChallan(c.dcNum, to);
    _hMirrorChallan(c);
    if (fromId && typeof logOrderEvent === 'function') logOrderEvent(fromId, 'Moved', `${c.dcNum} · ${c.qty} pcs moved to ${to.id}`);
    if (typeof logOrderEvent === 'function') logOrderEvent(to.id, 'Dispatched', `${c.dcNum} · ${c.qty} pcs moved here from ${fromId || 'no order'}`);
    return c.dcNum;
  }
  // Split: shrink the original (and its invoice line), new challan for the rest
  c.qty -= qty;
  const iv = invoiceList.find(i => (i.items || []).some(it => it.challanDc === c.dcNum));
  if (iv) { const it = iv.items.find(t => t.challanDc === c.dcNum); it.qty = c.qty; it.amount = it.qty * (+it.rate || 0); _hRecalcInvoice(iv); if (typeof _mirrorInvoice === 'function') _mirrorInvoice(iv); }
  const part = point(Object.assign({}, c, { dcNum: _nextDcNum(), qty, createdAt: new Date().toISOString(), note: `Split from ${c.dcNum} (${fromId}) in Data Checks` }));
  challanList.push(part);
  _hMirrorChallan(c); _hMirrorChallan(part);
  if (fromId && typeof logOrderEvent === 'function') logOrderEvent(fromId, 'Moved', `${qty} pcs of ${c.dcNum} split off to ${part.dcNum} → ${to.id}`);
  if (typeof logOrderEvent === 'function') logOrderEvent(to.id, 'Dispatched', `${part.dcNum} · ${qty} pcs (split from ${c.dcNum}, was on ${fromId})`);
  return part.dcNum;
}

// `silent` (the in-app assistant, which asks for approval itself) skips the
// confirm and the panel refresh, and every fix returns what it did.
function fixMoveExcess(fromId, toId, silent) {
  const o = orders.find(x => x.id === fromId), to = orders.find(x => x.id === toId);
  if (!o || !to) return 'Order not found.';
  let excess = _hSent(fromId) - (parseInt(o.qty) || 0);
  if (excess <= 0) return `${fromId} has no extra pieces.`;
  const total = excess;
  if (!silent && !confirm(`Move the extra ${excess.toLocaleString('en-IN')} pcs from ${o.id} to ${to.id} (${to.product || to.size}, ₹${to.rate || 0}/pc)?\n\nThe newest challans move first; one may be split in two.`)) return;
  challanList.filter(c => c.orderId === fromId).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''))
    .forEach(c => { if (excess <= 0) return; const take = Math.min(excess, c.qty || 0); _hMoveChallanQty(c.dcNum, toId, take); excess -= take; });
  _hAfterChange(fromId, toId);
  if (!silent) openOrderFixer(fromId);
  return `Moved ${total} pcs from ${fromId} to ${toId}.`;
}

function fixMoveChallan(dcNum) {
  const sel = document.getElementById('fx-to-' + dcNum), q = document.getElementById('fx-q-' + dcNum);
  const c = challanList.find(x => x.dcNum === dcNum);
  if (!c || !sel || !sel.value) { alert('Pick the order to move it to.'); return; }
  const qty = Math.min(parseInt(q?.value) || c.qty, c.qty);
  const fromId = c.orderId;
  _hMoveChallanQty(dcNum, sel.value, qty);
  _hAfterChange(fromId, sel.value);
  openOrderFixer(fromId || sel.value);
}

function fixSetQty(id, q, silent) {
  const o = orders.find(x => x.id === id);
  if (!o) return 'Order not found.';
  if (!silent && !confirm(`Change ${o.id}'s ordered quantity from ${(+o.qty).toLocaleString('en-IN')} to ${q.toLocaleString('en-IN')} pcs?`)) return;
  const prev = o.qty; o.qty = q;
  if (typeof logOrderEvent === 'function') logOrderEvent(id, 'Edited', `Qty ${prev} → ${q} (extra boxes accepted, Data Checks)`);
  if (typeof _pushOrderUpdate === 'function') _pushOrderUpdate(o);
  _hAfterChange(id);
  if (!silent) openOrderFixer(id);
  return `${id} quantity changed from ${prev} to ${q}.`;
}

function fixCloseShort(id, silent) {
  const o = orders.find(x => x.id === id);
  if (!o) return 'Order not found.';
  const s = _hSent(id), q = parseInt(o.qty) || 0;
  const note = `Closed short — ${s} of ${q} sent`;
  o.remarks = [o.remarks, note].filter(Boolean).join(' · ');
  if (typeof logOrderEvent === 'function') logOrderEvent(id, 'Closed Short', note + ' (Data Checks)');
  if (typeof _pushOrderUpdate === 'function') _pushOrderUpdate(o);
  _hAfterChange();
  if (!silent) { closeOrderFixer(); runHealthCheck(); openHealthCheck(); }
  return `${id} kept closed and marked short (${s} of ${q} sent).`;
}

function fixRemoveInvoiceLine(invId, idx, silent) {
  const iv = invoiceList.find(i => i.id === invId);
  const it = iv && iv.items[idx];
  if (!it) return 'Invoice line not found.';
  if (!silent && !confirm(`Remove ${it.qty} pcs @ ₹${it.rate} (${it.desc}) from ${invId}?${iv.items.length === 1 ? '\n\nIt is the only line, so the whole invoice is deleted.' : ''}\n\nYou can restore it from Recently Deleted.`)) return;
  const oid = it.orderId || iv.orderId;
  const whole = iv.items.length === 1;
  if (whole) { if (typeof _deleteInvoiceCore === 'function') _deleteInvoiceCore(invId); }
  else {
    if (typeof trashRecord === 'function') trashRecord('invoiceLine', it, { invoiceId: iv.id });
    iv.items.splice(idx, 1); _hRecalcInvoice(iv);
    if (typeof _mirrorInvoice === 'function') _mirrorInvoice(iv);
  }
  if (oid && typeof logOrderEvent === 'function') logOrderEvent(oid, 'Invoice Line Removed', `${invId} · ${it.qty} pcs @ ₹${it.rate} (Data Checks)`);
  _hAfterChange();
  if (!silent) openOrderFixer(oid);
  return `Removed ${it.qty} pcs @ ₹${it.rate} from ${invId}${whole ? ' (it was the only line, so the invoice was deleted)' : ''}.`;
}

// Same order ID on two rows: delete the copy if identical, else give it a new number
function fixDuplicateId(id, silent) {
  const rows = orders.filter(o => o.id === id).sort((a, b) => (a.rowIndex || 0) - (b.rowIndex || 0));
  if (rows.length < 2) return `${id} is only on one row.`;
  let did;
  const dup = rows[rows.length - 1];
  const f = o => ['customer', 'product', 'size', 'ply', 'colour', 'weight', 'qty', 'rate', 'date', 'orderDate'].map(k => String(o[k] || '')).join('|');
  if (f(rows[0]) === f(dup)) {
    if (!silent && !confirm(`Both ${id} rows are identical. Delete the extra one (sheet row ${dup.rowIndex})?`)) return;
    did = `Deleted the extra identical ${id} row (sheet row ${dup.rowIndex}).`;
    orders.splice(orders.indexOf(dup), 1);
    if (typeof _shiftRowsAfterDelete === 'function') _shiftRowsAfterDelete(dup.rowIndex);
    fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'deleteOrder', id }) }).catch(() => {});
  } else {
    const newId = typeof generateOrderId === 'function' ? generateOrderId() : '';
    if (!newId || (!silent && !confirm(`The two ${id} rows are different orders. Give the later one (${dup.product || dup.size}, sheet row ${dup.rowIndex}) the new number ${newId}?\n\nChallans and invoices stay on ${id}.`))) return;
    did = `The later ${id} row (${dup.product || dup.size}) is now ${newId}.`;
    dup.id = newId;
    if (typeof _pushOrderUpdate === 'function') _pushOrderUpdate(dup);
    if (typeof logOrderEvent === 'function') logOrderEvent(newId, 'Renumbered', `Was a second ${id} row (Data Checks)`);
  }
  _hAfterChange();
  if (!silent) { runHealthCheck(); openHealthCheck(); }
  return did;
}

function _hOrderOpt(x) {
  return `<option value="${x.id}">${x.id} · ${_hEsc(x.product || x.size || '')} ${_hEsc(x.size || '')}${x.colour ? ' · ' + _hEsc(x.colour) : ''} · ${_hN(_hLeft(x))} left · ₹${x.rate || 0}</option>`;
}

function openOrderFixer(orderId) {
  const o = orders.find(x => x.id === orderId);
  if (!o) { runHealthCheck(); openHealthCheck(); return; }
  let ov = document.getElementById('fix-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'fix-overlay'; ov.className = 'popup-overlay';
    ov.onclick = e => { if (e.target === ov) closeOrderFixer(); };
    document.body.appendChild(ov);
  }
  const qty = parseInt(o.qty) || 0, s = _hSent(o.id);
  const invLines = [];
  invoiceList.forEach(iv => (iv.items || []).forEach((it, i) => { if ((it.orderId || iv.orderId) === o.id) invLines.push({ iv, it, i }); }));
  const b = invLines.reduce((t, l) => t + (+l.it.qty || 0), 0);
  const targets = _hTargets(o, o.id);
  const sameTargets = targets.filter(x => _hDims(x.size) === _hDims(o.size) && _hKey(x.colour) === _hKey(o.colour));
  const challans = challanList.filter(c => c.orderId === o.id).sort((a, b2) => (b2.date || '').localeCompare(a.date || ''));
  const box = (t, inner) => `<div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:10px"><div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:6px">${t}</div>${inner}</div>`;
  const fixBtn = (label, js, primary) => `<button class="${primary ? 'btn-primary' : 'btn-secondary'}" style="font-size:12px;padding:6px 10px;margin:0 6px 6px 0" onclick="${js}">${label}</button>`;

  let quick = '';
  if (s > qty && qty) {
    const extra = s - qty;
    quick += `<div style="font-size:12px;margin-bottom:6px"><strong>${_hN(extra)} pcs more</strong> than ordered are on this order.</div>`;
    sameTargets.slice(0, 3).forEach(x => { quick += fixBtn(`↪ Move the extra ${_hN(extra)} pcs to ${x.id} (${_hEsc(x.product || x.size)}, ${_hN(_hLeft(x))} left, ₹${x.rate || 0})`, `fixMoveExcess('${o.id}','${x.id}')`, true); });
    if (!sameTargets.length) quick += `<div style="font-size:12px;color:var(--muted);margin-bottom:6px">No other open order of ${_hEsc(o.customer)} for this same box — move single challans below, or:</div>`;
    quick += fixBtn(`✅ The extra really went — change ordered qty to ${_hN(s)}`, `fixSetQty('${o.id}',${s})`);
  }
  if (FINISHED_STATUSES.includes(o.status) && s < qty) {
    quick += `<div style="font-size:12px;margin-bottom:6px">${o.status}, but only <strong>${_hN(s)} of ${_hN(qty)}</strong> pcs dispatched.</div>`;
    quick += fixBtn('↩ Reopen — boxes are still to go', `reopenOrder('${o.id}');closeOrderFixer();runHealthCheck();openHealthCheck()`, true);
    quick += fixBtn(`✔ Keep closed — mark as short (${_hN(s)} of ${_hN(qty)})`, `fixCloseShort('${o.id}')`);
  }
  if (s > 0 && b > s) quick += `<div style="font-size:12px;margin-bottom:6px"><strong>${_hN(b - s)} pcs billed more than dispatched.</strong> Lines typed by hand (no challan) are usually the double bill — remove one below.</div>`;
  if (!quick) quick = '<div style="font-size:12px;color:var(--muted)">Nothing out of line on this order right now.</div>';

  const chRows = !challans.length ? '<div style="font-size:12px;color:var(--muted)">No challans.</div>' : challans.map(c => `
    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
      <div style="flex:1;min-width:180px"><strong style="font-family:monospace">${c.dcNum}</strong> · ${c.date ? formatDate(c.date) : '—'} · <strong>${_hN(c.qty)} pcs</strong>${c.svTs ? ' <span style="color:var(--muted)">(supervisor)</span>' : ''}</div>
      <select id="fx-to-${c.dcNum}" class="form-select" style="font-size:11px;padding:4px 6px;max-width:240px"><option value="">Move to…</option>${targets.map(_hOrderOpt).join('')}</select>
      <input id="fx-q-${c.dcNum}" class="form-input" type="number" value="${c.qty}" min="1" max="${c.qty}" style="width:72px;font-size:11px;padding:4px 6px" title="Pieces to move">
      ${fixBtn('Move', `fixMoveChallan('${c.dcNum}')`)}
    </div>`).join('');

  const invRows = !invLines.length ? '<div style="font-size:12px;color:var(--muted)">No invoice lines.</div>' : invLines.map(l => `
    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
      <div style="flex:1;min-width:180px"><strong style="font-family:monospace">${l.iv.id}</strong> · ${l.iv.date ? formatDate(l.iv.date) : '—'} · <strong>${_hN(l.it.qty)} pcs</strong> @ ₹${l.it.rate} · ${l.it.challanDc ? `from ${l.it.challanDc}` : '<span style="color:#B45309;font-weight:700">typed by hand</span>'}</div>
      ${fixBtn('📄 Open', `editInvoice('${l.iv.id}')`)}${fixBtn('Remove line', `fixRemoveInvoiceLine('${l.iv.id}',${l.i})`)}
    </div>`).join('');

  ov.innerHTML = `<div class="popup-box" style="width:min(720px,95vw);max-width:none;padding:22px;max-height:90vh;overflow-y:auto" onclick="event.stopPropagation()">
    <div class="popup-title">🔧 Fix ${o.id}</div>
    <div style="font-size:13px;margin:-6px 0 12px"><strong>${_hEsc(o.customer)}</strong> · ${_hEsc(o.product || '')} ${_hEsc(o.size || '')}${o.colour ? ' · ' + _hEsc(o.colour) : ''} · ${o.status}<br>
      Ordered <strong>${_hN(qty)}</strong> · dispatched <strong>${_hN(s)}</strong> · billed <strong>${_hN(b)}</strong> · ₹${o.rate || 0}/pc · ordered ${o.orderDate ? formatDate(o.orderDate) : '—'}</div>
    ${box('Quick fix', quick)}
    ${box(`Challans on this order — ${challans.length}`, chRows)}
    ${box(`Invoice lines for this order — ${invLines.length}`, invRows)}
    <div style="display:flex;gap:10px"><button class="btn-secondary" onclick="openOrderHistory('${o.id}')">🚚 Full history</button>
    <button class="btn-primary" style="margin-left:auto" onclick="closeOrderFixer();runHealthCheck();openHealthCheck()">Done</button></div></div>`;
  ov.style.display = 'flex';
}

function closeOrderFixer() {
  const ov = document.getElementById('fix-overlay');
  if (ov) ov.style.display = 'none';
}

// Challans pointing at a deleted order — move each to an open order of the same party
function openOrphanFixer() {
  const ids = new Set(orders.map(o => o.id));
  const orphan = challanList.filter(c => c.orderId && !ids.has(c.orderId));
  let ov = document.getElementById('fix-overlay');
  if (!ov) { ov = document.createElement('div'); ov.id = 'fix-overlay'; ov.className = 'popup-overlay'; ov.onclick = e => { if (e.target === ov) closeOrderFixer(); }; document.body.appendChild(ov); }
  ov.innerHTML = `<div class="popup-box" style="width:min(720px,95vw);max-width:none;padding:22px;max-height:90vh;overflow-y:auto" onclick="event.stopPropagation()">
    <div class="popup-title">🔧 Challans linked to a deleted order</div>
    ${!orphan.length ? '<div class="empty-state">All fixed.</div>' : orphan.map(c => {
      const t = _hTargets({ customer: c.customer, size: c.size, colour: c.colour }, null);
      return `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px">
        <div style="flex:1;min-width:200px"><strong style="font-family:monospace">${c.dcNum}</strong> · ${c.date ? formatDate(c.date) : '—'} · ${_hEsc(c.customer)} · ${_hEsc(c.product || '')} ${_hEsc(c.size || '')} · <strong>${_hN(c.qty)} pcs</strong> <span style="color:var(--muted)">(was ${c.orderId})</span></div>
        <select id="fx-to-${c.dcNum}" class="form-select" style="font-size:11px;padding:4px 6px;max-width:240px"><option value="">Move to…</option>${t.map(_hOrderOpt).join('')}</select>
        <input id="fx-q-${c.dcNum}" type="hidden" value="${c.qty}">
        <button class="btn-secondary" style="font-size:12px;padding:6px 10px" onclick="fixMoveChallan('${c.dcNum}');openOrphanFixer()">Move</button>
      </div>`; }).join('')}
    <div style="display:flex;margin-top:12px"><button class="btn-primary" style="margin-left:auto" onclick="closeOrderFixer();runHealthCheck();openHealthCheck()">Done</button></div></div>`;
  ov.style.display = 'flex';
}

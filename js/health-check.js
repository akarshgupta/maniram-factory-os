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
        [hist, _hBtn('↩ Reopen', `reopenOrder('${o.id}');runHealthCheck();openHealthCheck()`)]);
    }
    // Every box out, but still sitting in active orders
    if (!FINISHED_STATUSES.includes(o.status) && qty && s >= qty) {
      add(`done:${o.id}`, 'mid', 'Fully dispatched but still open',
        `${_hOrderLine(o)} — ${_hN(s)} of ${_hN(qty)} pcs dispatched`,
        [hist, _hBtn('✅ Mark Delivered', `checkOrderFullyDispatched('${o.id}');renderOrders();runHealthCheck();openHealthCheck()`)]);
    }
    if (qty && s > qty * 1.1 && s - qty >= 50) {
      add(`over:${o.id}:${s}`, 'high', 'Dispatched far more than ordered',
        `${_hOrderLine(o)} — ${_hN(s)} pcs dispatched against ${_hN(qty)} ordered. A dispatch may be linked to the wrong order.`, [hist]);
    }
    if (s > 0 && b > s) {
      add(`bill:${o.id}:${b}:${s}`, 'mid', 'Billed more than dispatched',
        `${_hOrderLine(o)} — ${_hN(b)} pcs invoiced, ${_hN(s)} pcs dispatched`, [hist]);
    }
    if (!FINISHED_STATUSES.includes(o.status) && !o.orderDate) {
      add(`nodate:${o.id}`, 'low', 'Open order with no order date', _hOrderLine(o),
        [_hBtn('✏️ Edit', `closeHealthCheck();openEditModal('${o.id}')`)]);
    }
  });

  // Same order ID on two sheet rows
  Object.entries(byId).forEach(([id, list]) => {
    if (list.length > 1) add(`dupid:${id}`, 'high', 'Same order ID used twice',
      `<strong style="font-family:monospace">${id}</strong> is on ${list.length} rows: ${list.map(o => _hEsc(o.customer + ' · ' + (o.product || o.size || ''))).join(' / ')}. Fix the ID in the Orders sheet.`, []);
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
    [_hBtn('Open Challans', `closeHealthCheck();showPage('orders');if(typeof switchOrderTab==='function')switchOrderTab('challans')`)]);

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
    [_hBtn('Open Invoicing', `closeHealthCheck();showPage('invoicing')`)]);

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

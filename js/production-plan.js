// ══════════════════════════════════════════════════════════════
// PRODUCTION-PLAN.JS — Day-wise production schedule
// Stage 1 (D-1): Corrugation · Printing · Pasting
// Stage 2 (D):   Rotary · RS4 · Stitching · Packing · Dispatch
// ══════════════════════════════════════════════════════════════

// ── Sheets-Ready store ──────────────────────────────────────
// Supervisor taps once to mark an order's corrugated sheets as
// already cut. Stored in localStorage — no Sheets write needed.
const LS_SHEETS_READY = 'mi_sheets_ready_v1';
let _sheetsReady = {};
try { _sheetsReady = JSON.parse(localStorage.getItem(LS_SHEETS_READY) || '{}'); } catch {}

function isSheetsReady(orderId) { return !!_sheetsReady[orderId]; }

function toggleSheetsReady(orderId) {
  if (_sheetsReady[orderId]) {
    delete _sheetsReady[orderId];
  } else {
    _sheetsReady[orderId] = true;
  }
  localStorage.setItem(LS_SHEETS_READY, JSON.stringify(_sheetsReady));
  renderProductionPlan();
}

// ── Size converter: cm ↔ inches ──
// inputId: field to read, hintId: div below the field to write to
function convertSizeCmIn(inputId, hintId) {
  const inp  = document.getElementById(inputId);
  const hint = document.getElementById(hintId);
  if (!inp || !hint) return;
  const raw = inp.value.trim();
  if (!raw) { hint.textContent = ''; return; }

  // Parse dimensions: support ×, x, X, × as separator
  const parts = raw.split(/[×xX\/\s]+/).map(s => parseFloat(s.replace(',', '.'))).filter(n => !isNaN(n) && n > 0);
  if (!parts.length) { hint.textContent = ''; return; }

  // Detect unit: if largest dimension > 60 assume cm, else inches
  const maxVal = Math.max(...parts);
  if (maxVal <= 60) {
    // Assume cm → show inches conversion
    const inParts = parts.map(d => (d / 2.54).toFixed(1));
    hint.textContent = `≈ ${inParts.join(' × ')} inches`;
  } else {
    // Possibly already inches (unusual) — just show cm equivalent
    const cmParts = parts.map(d => (d * 2.54).toFixed(1));
    hint.textContent = `≈ ${cmParts.join(' × ')} cm`;
  }
}

// ── Priority Queue (order rearranging + auto-scheduler) ──
let priorityQueue   = []; // ordered array of order IDs
let _pqDragId       = null;

function togglePriorityQueue() {
  const sec = document.getElementById('priority-queue-section');
  const btn = document.getElementById('pq-toggle-btn');
  if (!sec) return;
  const open = sec.style.display === 'none' || !sec.style.display;
  sec.style.display = open ? 'block' : 'none';
  if (btn) btn.textContent = open ? '✕ Close Queue' : '⚡ Priority Queue';
  if (open) renderPriorityQueue();
}

function renderPriorityQueue() {
  const el = document.getElementById('priority-queue-list');
  if (!el) return;

  const active = orders.filter(o => !['Delivered','Dispatched','Cancelled'].includes(o.status));

  // Sync queue: keep existing order, add new orders at end, remove gone ones
  const activeIds = active.map(o => o.id);
  priorityQueue = priorityQueue.filter(id => activeIds.includes(id));
  activeIds.forEach(id => { if (!priorityQueue.includes(id)) priorityQueue.push(id); });

  if (!active.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:10px 0">No active orders to schedule.</div>';
    return;
  }

  el.innerHTML = '';
  priorityQueue.forEach((id, idx) => {
    const o = active.find(x => x.id === id);
    if (!o) return;
    const dateDisp = o.date ? new Date(o.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';
    const kg       = o.qty && o.weight ? Math.round(o.qty * parseFloat(o.weight) / 1000) : 0;

    const card = document.createElement('div');
    card.className   = 'pq-card';
    card.draggable   = true;
    card.dataset.id  = id;
    card.innerHTML   = `
      <div class="pq-rank">#${idx + 1}</div>
      <div class="pq-info">
        <div style="font-weight:700;font-size:12px">${o.customer}</div>
        <div style="font-size:11px;color:var(--muted)">${o.product || o.size || id} · ${(o.qty||0).toLocaleString('en-IN')} pcs · ${o.ply||'?'}ply${kg ? ' · ' + kg + ' kg' : ''}</div>
      </div>
      <div style="font-size:11px;color:var(--muted);white-space:nowrap">${dateDisp}</div>
      <div class="pq-drag-handle" title="Drag to reorder">⠿</div>
    `;

    card.addEventListener('dragstart', e => {
      _pqDragId = id;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => card.style.opacity = '0.4', 0);
    });
    card.addEventListener('dragend', () => {
      card.style.opacity = '';
      _pqDragId = null;
    });
    card.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.style.borderTop = '2px solid var(--blue)';
    });
    card.addEventListener('dragleave', () => { card.style.borderTop = ''; });
    card.addEventListener('drop', e => {
      e.preventDefault();
      card.style.borderTop = '';
      if (!_pqDragId || _pqDragId === id) return;
      const fi = priorityQueue.indexOf(_pqDragId);
      const ti = priorityQueue.indexOf(id);
      if (fi < 0 || ti < 0) return;
      priorityQueue.splice(fi, 1);
      priorityQueue.splice(ti, 0, _pqDragId);
      renderPriorityQueue();
    });

    el.appendChild(card);
  });
}

function resetPriorityQueue() {
  priorityQueue = [];
  document.getElementById('schedule-preview').innerHTML = '';
  renderPriorityQueue();
}

function runAutoSchedule() {
  const results = autoScheduleOrders();
  showSchedulePreview(results);
}

function autoScheduleOrders() {
  const active = orders.filter(o => !['Delivered','Dispatched','Cancelled'].includes(o.status));
  const queue  = priorityQueue.map(id => active.find(o => o.id === id)).filter(Boolean);

  const simKg = {};   // delivDateStr → kg committed
  const simS1 = {};   // stage1DateStr → { reelSize → count }
  const results = [];

  const base = new Date(today);
  base.setDate(base.getDate() + 1); // never schedule for today

  for (const o of queue) {
    const plyNum   = parseInt(o.ply) || 3;
    const prodDays = typeof getLearnedProductionDays === 'function'
      ? getLearnedProductionDays(plyNum, o.qty || 0)
      : PRODUCTION_DAYS.calc(plyNum, o.qty || 0);
    const earliest = new Date(base);
    earliest.setDate(base.getDate() + prodDays - 1);

    const orderKg = (parseInt(o.qty) || 0) * (parseFloat(o.weight) || 0) / 1000;
    const rs      = String(o.reelSize || '');

    let batchDate = null, freshDate = null;

    for (let i = 0; i < 60; i++) {
      const d     = new Date(earliest);
      d.setDate(earliest.getDate() + i);
      const ds    = d.toISOString().split('T')[0];
      const s1d   = new Date(d); s1d.setDate(d.getDate() - 1);
      const s1ds  = s1d.toISOString().split('T')[0];

      if (orderKg && (simKg[ds] || 0) + orderKg > MAX_DAILY_KG) continue;
      const s1slot   = simS1[s1ds] || {};
      const total    = Object.values(s1slot).reduce((s, v) => s + v, 0);
      if (total >= MAX_SIMULTANEOUS_ORDERS) continue;

      const reelCnt = s1slot[rs] || 0;
      if (!batchDate && rs && reelCnt > 0) batchDate = { ds, s1ds, i };
      if (!freshDate)                       freshDate = { ds, s1ds, i };
      if (batchDate && freshDate) break;
    }

    let pick = null;
    if (batchDate && freshDate) {
      pick = (batchDate.i - freshDate.i) <= 3 ? batchDate : freshDate;
    } else {
      pick = batchDate || freshDate;
    }

    if (pick) {
      simKg[pick.ds]  = (simKg[pick.ds] || 0) + orderKg;
      simS1[pick.s1ds] = simS1[pick.s1ds] || {};
      simS1[pick.s1ds][rs] = (simS1[pick.s1ds][rs] || 0) + 1;
      results.push({ order: o, newDate: pick.ds, changed: pick.ds !== o.date });
    } else {
      results.push({ order: o, newDate: o.date, changed: false, error: true });
    }
  }

  return results;
}

function showSchedulePreview(results) {
  const el = document.getElementById('schedule-preview');
  if (!el) return;

  const changedCount = results.filter(r => r.changed).length;
  const errorCount   = results.filter(r => r.error).length;

  const rows = results.map((r, i) => {
    const o       = r.order;
    const oldDisp = o.date ? new Date(o.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';
    const newDisp = r.newDate ? new Date(r.newDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';
    const changed = r.changed;
    const err     = r.error;
    return `<tr style="background:${changed ? '#F0FDF4' : 'transparent'}">
      <td style="padding:6px 10px;font-size:11px;color:var(--muted)">#${i+1}</td>
      <td style="padding:6px 10px;font-size:12px;font-weight:600">${o.customer}</td>
      <td style="padding:6px 10px;font-size:11px">${o.product || o.size || o.id}</td>
      <td style="padding:6px 10px;font-size:11px;text-decoration:${changed ? 'line-through' : 'none'};color:var(--muted)">${oldDisp}</td>
      <td style="padding:6px 10px;font-size:12px;font-weight:700;color:${err ? 'var(--danger)' : changed ? 'var(--success)' : 'var(--text)'}">${err ? '⚠ No slot' : newDisp}</td>
      <td style="padding:6px 10px">${changed ? '<span style="font-size:10px;background:#DCFCE7;color:#166534;padding:1px 7px;border-radius:8px">MOVED</span>' : ''}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:10px">
      Proposed Schedule — ${changedCount} date${changedCount !== 1 ? 's' : ''} will change${errorCount ? ' · ⚠ ' + errorCount + ' order(s) could not be scheduled in 60 days' : ''}
    </div>
    <div style="overflow-x:auto;border-radius:8px;border:1px solid var(--border)">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--bg)">
            <th style="padding:6px 10px;font-size:10px;text-align:left;font-weight:700;color:var(--muted)">#</th>
            <th style="padding:6px 10px;font-size:10px;text-align:left;font-weight:700;color:var(--muted)">CUSTOMER</th>
            <th style="padding:6px 10px;font-size:10px;text-align:left;font-weight:700;color:var(--muted)">PRODUCT</th>
            <th style="padding:6px 10px;font-size:10px;text-align:left;font-weight:700;color:var(--muted)">CURRENT DATE</th>
            <th style="padding:6px 10px;font-size:10px;text-align:left;font-weight:700;color:var(--muted)">NEW DATE</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${changedCount > 0 ? `<div style="margin-top:12px;display:flex;gap:10px">
      <button class="btn-primary" onclick="applyAutoSchedule()" style="font-size:12px">✅ Apply All Changes</button>
      <button class="btn-secondary" onclick="document.getElementById('schedule-preview').innerHTML=''" style="font-size:12px">Cancel</button>
    </div>` : '<div style="margin-top:10px;font-size:12px;color:var(--muted)">No changes needed — schedule is already optimal.</div>'}
  `;

  // Store results for apply
  el._results = results;
}

function applyAutoSchedule() {
  const el      = document.getElementById('schedule-preview');
  const results = el && el._results;
  if (!results) return;

  const toChange = results.filter(r => r.changed && !r.error);
  if (!toChange.length) return;

  toChange.forEach(r => {
    const o   = r.order;
    o.date    = r.newDate;
    const d   = new Date(r.newDate + 'T00:00:00');
    const fmt = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    if (o.rowIndex && o.rowIndex !== 9999) {
      fetch(APPS_SCRIPT_URL, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update', rowIndex: o.rowIndex,
          id: o.id, customer: o.customer, product: o.product || '', size: o.size || '',
          ply: o.ply || '', colour: o.colour || '', weight: o.weight || '',
          qty: o.qty, rate: o.rate, date: fmt, status: o.status,
          priority: o.priority || 'Normal', reelSize: o.reelSize || '',
          reservedKg: o.reservedKg || 0, remarks: o.remarks || ''
        })
      }).catch(() => {});
    }
  });

  el.innerHTML = `<div style="font-size:12px;color:var(--success);font-weight:600">✅ ${toChange.length} orders rescheduled and saved to Sheets.</div>`;
  renderProductionPlan();
  renderCalendar();
  updateDashboardOrders();
}

// Returns map of { deliveryDayStr → totalKg } for all active orders
function getDeliveryDayKg() {
  const kg = {};
  orders
    .filter(o => !['Delivered','Dispatched','Cancelled'].includes(o.status) && o.date)
    .forEach(o => {
      const w = (parseInt(o.qty) || 0) * (parseFloat(o.weight) || 0) / 1000;
      if (w > 0) kg[o.date] = (kg[o.date] || 0) + w;
    });
  return kg;
}

// Returns map of { stage1DayStr → { reelSize → count } } for all active orders
function getStage1Load() {
  const load = {};
  orders
    .filter(o => !['Delivered','Dispatched','Cancelled'].includes(o.status) && o.date)
    .forEach(o => {
      const d = new Date(o.date + 'T00:00:00');
      if (isNaN(d)) return;
      d.setDate(d.getDate() - 1); // day before delivery = Stage 1 day
      const key = d.toISOString().split('T')[0];
      const rs  = String(o.reelSize || '');
      if (!load[key]) load[key] = {};
      load[key][rs] = (load[key][rs] || 0) + 1;
    });
  return load;
}

// Given the earliest possible delivery date (and optional reel size), return the best
// available dispatch date on or after it.
//
// Strategy when reelSize is known:
//   1. PREFER a date where the same reel is already in Stage-1 production and still has
//      capacity — batching saves a separate machine setup.
//   2. Fall back to the earliest date with no orders for this reel (fresh slot).
//   3. If the batch opportunity is more than 3 days later than the fresh slot, prefer
//      the fresh slot instead (too long to wait for batching).
//
// Without reelSize (banner / generic): plain first-available by total load.
function getNextAvailableDispatchDate(earliestDeliveryStr, reelSize, orderKg) {
  const load   = getStage1Load();
  const kgMap  = getDeliveryDayKg();
  const start  = new Date(earliestDeliveryStr + 'T00:00:00');
  const rs     = String(reelSize || '');
  const reqKg  = parseFloat(orderKg) || 0;

  function kgOk(dayStr) {
    if (!reqKg) return true;
    return (kgMap[dayStr] || 0) + reqKg <= MAX_DAILY_KG;
  }

  if (!rs) {
    // Generic / banner: first slot where total Stage-1 load < max AND kg fits
    for (let i = 0; i < 60; i++) {
      const tryDeliv     = new Date(start);
      tryDeliv.setDate(start.getDate() + i);
      const tryDelivStr  = tryDeliv.toISOString().split('T')[0];
      const tryStage1    = new Date(tryDeliv);
      tryStage1.setDate(tryDeliv.getDate() - 1);
      const tryStage1Str = tryStage1.toISOString().split('T')[0];
      const total = Object.values(load[tryStage1Str] || {}).reduce((s, v) => s + v, 0);
      if (total < MAX_SIMULTANEOUS_ORDERS && kgOk(tryDelivStr)) {
        return { date: tryDelivStr, pushedBy: i, reason: 'fresh' };
      }
    }
    return null;
  }

  let batchDate = null;
  let freshDate = null;

  for (let i = 0; i < 60; i++) {
    const tryDeliv     = new Date(start);
    tryDeliv.setDate(start.getDate() + i);
    const tryDelivStr  = tryDeliv.toISOString().split('T')[0];
    const tryStage1    = new Date(tryDeliv);
    tryStage1.setDate(tryDeliv.getDate() - 1);
    const tryStage1Str = tryStage1.toISOString().split('T')[0];
    const count        = (load[tryStage1Str] || {})[rs] || 0;
    const fits         = kgOk(tryDelivStr);

    if (!batchDate && count > 0 && count < MAX_SIMULTANEOUS_ORDERS && fits) {
      batchDate = { date: tryDelivStr, pushedBy: i, reason: 'batch' };
    }
    if (!freshDate && count === 0 && fits) {
      freshDate = { date: tryDelivStr, pushedBy: i, reason: 'fresh' };
    }
    if (batchDate && freshDate) break;
  }

  if (batchDate && freshDate) {
    const diffDays = Math.round((new Date(batchDate.date) - new Date(freshDate.date)) / 86400000);
    return diffDays <= 3 ? batchDate : freshDate;
  }

  return batchDate || freshDate || null;
}

// ── Merge Opportunity Detection ──
// Returns orders that can be delivered EARLIER by joining an existing
// same-reel Stage-1 run that has spare capacity.
function getMergeOpportunities() {
  const active = orders.filter(o =>
    !['Delivered','Dispatched','Cancelled'].includes(o.status) && o.date && o.reelSize
  );

  // Build: stage1DateStr → { reelSize → [orders] }
  const s1Map = {};
  active.forEach(o => {
    const s1 = new Date(o.date + 'T00:00:00');
    s1.setDate(s1.getDate() - 1);
    const s1Str = s1.toISOString().split('T')[0];
    const rs    = String(o.reelSize);
    if (!s1Map[s1Str])     s1Map[s1Str]     = {};
    if (!s1Map[s1Str][rs]) s1Map[s1Str][rs] = [];
    s1Map[s1Str][rs].push(o);
  });

  const opps = [];
  active.forEach(o => {
    const rs      = String(o.reelSize);
    const myS1    = new Date(o.date + 'T00:00:00');
    myS1.setDate(myS1.getDate() - 1);
    const myS1Str = myS1.toISOString().split('T')[0];

    // Look for an EARLIER Stage-1 run with same reel that has capacity
    Object.entries(s1Map).forEach(([s1Str, reelMap]) => {
      if (!reelMap[rs]) return;
      if (s1Str >= myS1Str) return;      // not earlier
      if (s1Str < todayStr) return;      // already past
      const existingOrders = reelMap[rs];
      if (existingOrders.find(x => x.id === o.id)) return; // same order
      if (existingOrders.length >= MAX_SIMULTANEOUS_ORDERS) return; // full

      const earlierDeliv = new Date(s1Str + 'T00:00:00');
      earlierDeliv.setDate(earlierDeliv.getDate() + 1);
      const earlierStr   = earlierDeliv.toISOString().split('T')[0];
      const daysSaved    = Math.round((new Date(o.date) - earlierDeliv) / 86400000);
      if (daysSaved <= 0) return;

      opps.push({ order: o, suggestedDelivery: earlierStr, stage1Date: s1Str, daysSaved, existingOrders });
    });
  });

  // Deduplicate: one opportunity per order (earliest)
  const seen = new Set();
  return opps.filter(op => {
    if (seen.has(op.order.id)) return false;
    seen.add(op.order.id);
    return true;
  }).sort((a, b) => b.daysSaved - a.daysSaved);
}

function applyMergeDate(orderId, newDate) {
  const o = orders.find(x => x.id === orderId);
  if (!o) return;
  const label = new Date(newDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  if (!confirm(`Move ${orderId} delivery to ${label}? This will update the sheet.`)) return;

  o.date = newDate;
  if (o.rowIndex && o.rowIndex !== 9999) {
    const d   = new Date(newDate + 'T00:00:00');
    const fmt = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    fetch(APPS_SCRIPT_URL, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update', rowIndex: o.rowIndex,
        id: o.id, customer: o.customer, product: o.product || '', size: o.size || '',
        ply: o.ply || '', colour: o.colour || '', weight: o.weight || '',
        qty: o.qty, rate: o.rate, date: fmt, status: o.status,
        priority: o.priority || 'Normal', reelSize: o.reelSize || '',
        reservedKg: o.reservedKg || 0, remarks: o.remarks || ''
      })
    });
  }
  renderProductionPlan();
  renderCalendar();
  updateDashboardOrders();
}

function renderProductionPlan() {
  const el = document.getElementById('production-plan-body');
  if (!el) return;

  initStaffWidget();

  const active = orders.filter(o =>
    !['Delivered', 'Dispatched', 'Cancelled'].includes(o.status) && o.date
  );

  // Next available dispatch date banner (always shown)
  const tomorrow       = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr2   = tomorrow.toISOString().split('T')[0];
  const nextSlot       = getNextAvailableDispatchDate(tomorrowStr2);
  const nextSlotLabel  = nextSlot
    ? new Date(nextSlot.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
    : '—';
  const slotNote       = nextSlot && nextSlot.pushedBy > 0
    ? `<span style="font-size:11px;color:var(--warn);margin-left:8px">Floor full for ${nextSlot.pushedBy} day(s) — pushed forward</span>`
    : nextSlot ? `<span style="font-size:11px;color:var(--success);margin-left:8px">Floor available</span>` : '';

  const banner = `<div style="background:var(--card-bg);border:1px solid var(--border);border-left:4px solid var(--blue);border-radius:10px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
    <div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:4px">Next Available Dispatch Date</div>
      <div style="font-size:22px;font-weight:800;font-family:monospace;color:var(--blue)">${nextSlotLabel}</div>
    </div>
    <div style="flex:1;font-size:12px;color:var(--muted)">
      ${slotNote}
      <div style="margin-top:4px">Stage 1 must start the day before · Max ${MAX_SIMULTANEOUS_ORDERS} orders per day</div>
    </div>
    <button class="btn-secondary" onclick="applySuggestedDate('${nextSlot ? nextSlot.date : ''}')" style="font-size:12px;white-space:nowrap" ${!nextSlot ? 'disabled' : ''}>Use in New Order →</button>
  </div>`;

  // Merge opportunity alerts
  const opps    = getMergeOpportunities();
  const mergeBanner = opps.length ? `
    <div class="merge-alerts">
      <div class="merge-alerts-title">💡 Deliver Earlier — Merge with Existing Production Runs</div>
      ${opps.map(op => {
        const cur  = new Date(op.order.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        const sug  = new Date(op.suggestedDelivery + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        const s1   = new Date(op.stage1Date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        return `<div class="merge-alert-card">
          <div class="merge-alert-order">${op.order.id} · ${op.order.product || op.order.size || 'Order'} · ${op.order.customer}</div>
          <div class="merge-alert-info">
            ${op.order.reelSize}" reel is already going into production on <strong>${s1}</strong>.
            Deliver on <strong>${sug}</strong> instead of ${cur}
            <span class="merge-days-saved">${op.daysSaved}d earlier</span>
          </div>
          <button class="btn-primary" onclick="applyMergeDate('${escStr(op.order.id)}','${op.suggestedDelivery}')" style="font-size:11px;padding:5px 12px;white-space:nowrap">Apply Earlier Date →</button>
        </div>`;
      }).join('')}
    </div>` : '';

  if (!active.length) {
    el.innerHTML = banner + mergeBanner + '<div class="empty-state" style="padding:40px 0">No active orders with delivery dates.<br><span style="font-size:12px;color:var(--muted)">Add orders on the Orders page first.</span></div>';
    return;
  }

  // Build map: dateStr → { stage1: [], stage2: [] }
  const dayMap = {};

  function ensureDay(ds) {
    if (!dayMap[ds]) dayMap[ds] = { stage1: [], stage2: [] };
  }

  active.forEach(o => {
    const delivDate = new Date(o.date);
    if (isNaN(delivDate)) return;

    // Stage 2 = delivery day
    ensureDay(o.date);
    dayMap[o.date].stage2.push(o);

    // Stage 1 = day before delivery
    const prev = new Date(delivDate);
    prev.setDate(prev.getDate() - 1);
    const prevStr = prev.toISOString().split('T')[0];
    ensureDay(prevStr);
    dayMap[prevStr].stage1.push(o);
  });

  const sortedDays = Object.keys(dayMap).sort();

  el.innerHTML = banner + mergeBanner + sortedDays.map(ds => {
    const data    = dayMap[ds];
    if (!data.stage1.length && !data.stage2.length) return '';
    const d       = new Date(ds + 'T00:00:00');
    const isToday = ds === todayStr;
    const isPast  = ds < todayStr;
    const dayLabel = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

    let html = `<div class="prod-day-card${isToday ? ' prod-today' : ''}${isPast ? ' prod-past' : ''}">
      <div class="prod-day-header">
        <div class="prod-day-label">${dayLabel}</div>
        ${isToday ? '<span class="prod-now-badge">TODAY</span>' : ''}
        ${isPast  ? '<span class="prod-past-badge">PAST</span>'  : ''}
      </div>`;

    if (data.stage1.length) {
      // Group by reel size so each physical reel setup is visible
      const byReel = {};
      data.stage1.forEach(o => {
        const rs = o.reelSize ? String(o.reelSize) : 'Unknown';
        if (!byReel[rs]) byReel[rs] = [];
        byReel[rs].push(o);
      });
      const reelGroups = Object.entries(byReel).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));

      html += `<div class="prod-stage prod-stage1">
        <div class="prod-stage-title">
          <span class="prod-stage-dot s1"></span>
          Stage 1 — Corrugation &nbsp;·&nbsp; Printing &nbsp;·&nbsp; Pasting
        </div>
        ${reelGroups.map(([rs, reelOrders]) => `
          <div class="prod-reel-group">
            <div class="prod-reel-group-hdr">
              🔧 ${rs}" Reel &nbsp;→&nbsp; ${reelOrders.length} order${reelOrders.length > 1 ? 's' : ''}
              ${reelOrders.length >= MAX_SIMULTANEOUS_ORDERS ? '<span class="prod-reel-full">FULL</span>' : ''}
            </div>
            <div class="prod-orders">${reelOrders.map(o => prodOrderRow(o, 1)).join('')}</div>
          </div>`).join('')}
      </div>`;
    }

    if (data.stage2.length) {
      html += `<div class="prod-stage prod-stage2">
        <div class="prod-stage-title">
          <span class="prod-stage-dot s2"></span>
          Stage 2 — Rotary &nbsp;·&nbsp; RS4 &nbsp;·&nbsp; Stitching &nbsp;·&nbsp; Packing &nbsp;·&nbsp; <strong>Dispatch</strong>
        </div>
        <div class="prod-orders">
          ${data.stage2.map(o => prodOrderRow(o, 2)).join('')}
        </div>
      </div>`;
    }

    html += '</div>';
    return html;
  }).join('');
}

// Navigate to orders page and pre-fill the suggested date
function applySuggestedDate(dateStr) {
  if (!dateStr) return;
  showPage('orders');
  setTimeout(() => {
    const el = document.getElementById('f-date');
    if (el) { el.value = dateStr; el.dispatchEvent(new Event('change')); }
  }, 80);
}

function quickUpdateStatus(orderId, newStatus) {
  const o = orders.find(x => x.id === orderId);
  if (!o || o.status === newStatus) return;

  if (newStatus === 'Delivered' && typeof recordDeliveredOrder === 'function') {
    recordDeliveredOrder(o);
  }
  o.status = newStatus;

  if (o.rowIndex && o.rowIndex !== 9999) {
    const d   = new Date(o.date + 'T00:00:00');
    const fmt = isNaN(d) ? o.date : `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    fetch(APPS_SCRIPT_URL, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update', rowIndex: o.rowIndex,
        id: o.id, customer: o.customer, product: o.product || '', size: o.size || '',
        ply: o.ply || '', colour: o.colour || '', weight: o.weight || '',
        qty: o.qty, rate: o.rate, date: fmt, status: newStatus,
        priority: o.priority || 'Normal', reelSize: o.reelSize || '',
        reservedKg: o.reservedKg || 0, remarks: o.remarks || ''
      })
    }).catch(() => {});
  }

  renderProductionPlan();
  updateDashboardOrders();
  renderCalendar();
}

function prodOrderRow(o, stage) {
  const reelBadge = o.reelSize
    ? `<span class="prod-reel-tag">${o.reelSize}"</span>`
    : '';
  const qty  = o.qty  ? o.qty.toLocaleString('en-IN') + ' pcs' : '';
  const ply  = o.ply  ? o.ply + ' ply'                         : '';
  const size = o.size ? o.size                                  : '';
  const eid  = escStr(o.id);

  const statusOpts = ['New','In Production','Ready','Dispatched','Delivered'].map(s =>
    `<option value="${s}"${o.status === s ? ' selected' : ''}>${s}</option>`
  ).join('');

  const dispatchBtn = stage === 2
    ? `<button class="btn-sm" style="white-space:nowrap;font-size:11px" onclick="event.stopPropagation();openDispatchModal('${eid}')">📦 Dispatch</button>`
    : '';

  const sheetsReady = isSheetsReady(o.id);
  const sheetsBtn = `<button class="btn-sm sheets-ready-btn${sheetsReady ? ' active' : ''}"
    onclick="event.stopPropagation();toggleSheetsReady('${eid}')"
    title="${sheetsReady ? 'Sheets marked as pre-made — tap to unmark' : 'Mark corrugated sheets as already cut & ready'}">
    ${sheetsReady ? '✅ Sheets' : '📋 Sheets'}
  </button>`;

  return `
    <div class="prod-order-row${sheetsReady ? ' sheets-ready-row' : ''}">
      ${reelBadge}
      <div class="prod-order-info">
        <div class="prod-product-name">${o.product || size || 'Order'}</div>
        <div class="prod-order-meta">${o.customer}${qty ? ' · ' + qty : ''}${ply ? ' · ' + ply : ''}${size && stage === 2 ? ' · ' + size : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-left:auto;flex-shrink:0">
        <select class="prod-status-select" onchange="quickUpdateStatus('${eid}',this.value)" onclick="event.stopPropagation()" title="Change status">
          ${statusOpts}
        </select>
        ${sheetsBtn}
        ${dispatchBtn}
        <button class="btn-sm" onclick="openEditModal('${eid}')" title="Edit order">✏️</button>
      </div>
      <div class="prod-order-id">${o.id}</div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// PRINTABLE DAILY PRODUCTION SHEET
// ══════════════════════════════════════════════════════════════
function printDailySheet() {
  const dateLabel = today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const active = orders
    .filter(o => !['Delivered', 'Dispatched', 'Cancelled'].includes(o.status))
    .sort((a, b) => {
      if (a.date && b.date) return a.date.localeCompare(b.date);
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    });

  const rows = active.map((o, i) => {
    const delivLabel = o.date
      ? new Date(o.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      : '—';
    return `<tr>
      <td class="c-num">${i + 1}</td>
      <td class="c-id">${o.id}</td>
      <td>${o.customer || ''}</td>
      <td>${o.product || o.size || ''}</td>
      <td class="c-sm">${o.size || ''}</td>
      <td class="c-sm">${o.ply || ''}</td>
      <td class="c-sm">${(o.qty || 0).toLocaleString('en-IN')}</td>
      <td class="c-deliv">${delivLabel}</td>
      <td class="c-write"></td>
      <td class="c-write"></td>
      <td class="c-write"></td>
      <td class="c-remarks"></td>
    </tr>`;
  }).join('');

  const totalPlanned = active.reduce((s, o) => s + (parseInt(o.qty) || 0), 0);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Daily Production Sheet — ${dateLabel}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; background: #fff; }
  .header { text-align:center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 10px; }
  .header h1 { font-size: 18px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
  .header h2 { font-size: 13px; font-weight: 600; margin-top: 2px; }
  .meta { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 10px; gap: 16px; }
  .meta-block { flex: 1; }
  .meta-label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.6px; color:#555; margin-bottom:3px; }
  .meta-value { font-size:13px; font-weight:700; border-bottom:1px solid #000; padding-bottom:2px; min-width:140px; }
  .shift-row { display:flex; gap:20px; align-items:center; }
  .shift-box { display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; }
  .shift-box .sq { width:14px; height:14px; border:1.5px solid #000; display:inline-block; }
  table { width:100%; border-collapse:collapse; margin-top:4px; }
  th { background:#111; color:#fff; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; padding:5px 6px; text-align:left; border:1px solid #000; }
  td { border:1px solid #bbb; padding:5px 6px; vertical-align:middle; font-size:10px; }
  tr:nth-child(even) td { background:#f7f7f7; }
  .c-num  { width:28px; text-align:center; font-weight:700; color:#555; }
  .c-id   { width:90px; font-family:monospace; font-size:9px; font-weight:700; }
  .c-sm   { width:52px; text-align:center; }
  .c-deliv { width:62px; text-align:center; font-weight:600; }
  .c-write { width:72px; background:#fffbe6 !important; }
  .c-remarks { width:120px; background:#fffbe6 !important; }
  .totals-row td { background:#e8e8e8 !important; font-weight:700; font-size:11px; }
  .footer { margin-top:14px; display:flex; justify-content:space-between; gap:20px; }
  .sign-block { flex:1; }
  .sign-line { border-bottom:1px solid #000; margin-top:24px; }
  .sign-label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#555; margin-top:3px; }
  .note-box { background:#fffbe6; border:1px solid #ccc; padding:8px 10px; margin-top:10px; font-size:10px; }
  .note-box strong { display:block; font-size:9px; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px; }
  @media print {
    @page { margin: 12mm 10mm; size: A4 landscape; }
    body { font-size: 10px; }
  }
</style>
</head>
<body>
<div class="header">
  <h1>Maniram Industries</h1>
  <h2>Daily Production Sheet</h2>
</div>

<div class="meta">
  <div class="meta-block">
    <div class="meta-label">Date</div>
    <div class="meta-value">${dateLabel}</div>
  </div>
  <div class="meta-block">
    <div class="meta-label">Shift</div>
    <div class="shift-row">
      <div class="shift-box"><span class="sq"></span> Morning</div>
      <div class="shift-box"><span class="sq"></span> Evening</div>
    </div>
  </div>
  <div class="meta-block">
    <div class="meta-label">Supervisor Name</div>
    <div class="meta-value" style="min-width:180px">&nbsp;</div>
  </div>
  <div class="meta-block">
    <div class="meta-label">Staff Count Today</div>
    <div class="meta-value" style="min-width:80px">&nbsp;</div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Order ID</th>
      <th>Customer</th>
      <th>Product</th>
      <th>Size</th>
      <th>Ply</th>
      <th>Planned Qty (pcs)</th>
      <th>Delivery Date</th>
      <th>Actual Qty Made ✎</th>
      <th>Defects / Rejected ✎</th>
      <th>Done By (Name) ✎</th>
      <th>Remarks ✎</th>
    </tr>
  </thead>
  <tbody>
    ${rows || '<tr><td colspan="12" style="text-align:center;padding:20px;color:#666">No active orders</td></tr>'}
    <tr class="totals-row">
      <td colspan="6" style="text-align:right">TOTAL PLANNED →</td>
      <td>${totalPlanned.toLocaleString('en-IN')} pcs</td>
      <td></td>
      <td style="border-bottom:2px solid #000"></td>
      <td></td>
      <td></td>
      <td></td>
    </tr>
  </tbody>
</table>

<div class="note-box">
  <strong>Instructions for workers</strong>
  Fill columns marked ✎ at end of shift. Write actual pieces made, any defective/rejected pieces, your name, and any problems faced.
  Hand this sheet to supervisor before leaving.
</div>

<div class="footer">
  <div class="sign-block">
    <div class="sign-line"></div>
    <div class="sign-label">Supervisor Signature &amp; Date</div>
  </div>
  <div class="sign-block">
    <div class="sign-line"></div>
    <div class="sign-label">Quality Check Sign</div>
  </div>
  <div class="sign-block">
    <div class="sign-line"></div>
    <div class="sign-label">Manager Approval</div>
  </div>
</div>

<script>window.onload = function(){ window.print(); };<\/script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=1100,height=750');
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

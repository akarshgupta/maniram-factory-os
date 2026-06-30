// ══════════════════════════════════════════════════════════════
// PRODUCTION-PLAN.JS — Day-wise production schedule
// Stage 1 (D-1): Corrugation · Printing · Pasting
// Stage 2 (D):   Rotary · RS4 · Stitching · Packing · Dispatch
// ══════════════════════════════════════════════════════════════

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
function getNextAvailableDispatchDate(earliestDeliveryStr, reelSize) {
  const load  = getStage1Load();
  const start = new Date(earliestDeliveryStr + 'T00:00:00');
  const rs    = String(reelSize || '');

  if (!rs) {
    // Generic / banner: first slot where total Stage-1 load < max
    for (let i = 0; i < 60; i++) {
      const tryDeliv     = new Date(start);
      tryDeliv.setDate(start.getDate() + i);
      const tryDelivStr  = tryDeliv.toISOString().split('T')[0];
      const tryStage1    = new Date(tryDeliv);
      tryStage1.setDate(tryDeliv.getDate() - 1);
      const tryStage1Str = tryStage1.toISOString().split('T')[0];
      const total = Object.values(load[tryStage1Str] || {}).reduce((s, v) => s + v, 0);
      if (total < MAX_SIMULTANEOUS_ORDERS) return { date: tryDelivStr, pushedBy: i, reason: 'fresh' };
    }
    return null;
  }

  let batchDate = null; // earliest date where same reel already running + has capacity
  let freshDate = null; // earliest date where no orders exist for this reel

  for (let i = 0; i < 60; i++) {
    const tryDeliv     = new Date(start);
    tryDeliv.setDate(start.getDate() + i);
    const tryDelivStr  = tryDeliv.toISOString().split('T')[0];
    const tryStage1    = new Date(tryDeliv);
    tryStage1.setDate(tryDeliv.getDate() - 1);
    const tryStage1Str = tryStage1.toISOString().split('T')[0];
    const count        = (load[tryStage1Str] || {})[rs] || 0;

    if (!batchDate && count > 0 && count < MAX_SIMULTANEOUS_ORDERS) {
      batchDate = { date: tryDelivStr, pushedBy: i, reason: 'batch' };
    }
    if (!freshDate && count === 0) {
      freshDate = { date: tryDelivStr, pushedBy: i, reason: 'fresh' };
    }
    if (batchDate && freshDate) break;
  }

  if (batchDate && freshDate) {
    const batchMs = new Date(batchDate.date + 'T00:00:00');
    const freshMs = new Date(freshDate.date + 'T00:00:00');
    const diffDays = Math.round((batchMs - freshMs) / 86400000);
    // Prefer batching if it's within 3 days of the fresh slot
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

function prodOrderRow(o, stage) {
  const reelBadge = o.reelSize
    ? `<span class="prod-reel-tag">${o.reelSize}"</span>`
    : '';
  const qty  = o.qty  ? o.qty.toLocaleString('en-IN') + ' pcs' : '';
  const ply  = o.ply  ? o.ply + ' ply'                         : '';
  const size = o.size ? o.size                                  : '';

  return `
    <div class="prod-order-row">
      ${reelBadge}
      <div class="prod-order-info">
        <div class="prod-product-name">${o.product || size || 'Order'}</div>
        <div class="prod-order-meta">${o.customer}${qty ? ' · ' + qty : ''}${ply ? ' · ' + ply : ''}${size && stage === 2 ? ' · ' + size : ''}</div>
      </div>
      <div class="prod-order-id">${o.id}</div>
    </div>`;
}

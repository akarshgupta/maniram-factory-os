// ══════════════════════════════════════════════════════════════
// PRODUCTION-PLAN.JS — Day-wise production schedule
// Stage 1 (D-1): Corrugation · Printing · Pasting
// Stage 2 (D):   Rotary · RS4 · Stitching · Packing · Dispatch
// ══════════════════════════════════════════════════════════════

function renderProductionPlan() {
  const el = document.getElementById('production-plan-body');
  if (!el) return;

  const active = orders.filter(o =>
    !['Delivered', 'Dispatched', 'Cancelled'].includes(o.status) && o.date
  );

  if (!active.length) {
    el.innerHTML = '<div class="empty-state" style="padding:40px 0">No active orders with delivery dates.<br><span style="font-size:12px;color:var(--muted)">Add orders on the Orders page first.</span></div>';
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

  el.innerHTML = sortedDays.map(ds => {
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
      html += `<div class="prod-stage prod-stage1">
        <div class="prod-stage-title">
          <span class="prod-stage-dot s1"></span>
          Stage 1 — Corrugation &nbsp;·&nbsp; Printing &nbsp;·&nbsp; Pasting
        </div>
        <div class="prod-orders">
          ${data.stage1.map(o => prodOrderRow(o, 1)).join('')}
        </div>
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

// ══════════════════════════════════════════════════════════════
// DASHBOARD.JS — Live metrics, stats, pipeline
// ══════════════════════════════════════════════════════════════

const STATUS_COLORS = {
  'New':           { bg: '#EFF6FF', color: '#1D4ED8' },
  'In Production': { bg: '#FEF3C7', color: '#92400E' },
  'Ready':         { bg: '#DCFCE7', color: '#15803D' },
  'Dispatched':    { bg: '#E0E7FF', color: '#4338CA' },
  'Delivered':     { bg: '#F0FDF4', color: '#166534' },
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function dueBadge(dateStr) {
  if (!dateStr) return { label: '—', cls: '' };
  const diff = Math.round((new Date(dateStr) - new Date(todayStr)) / 86400000);
  if (diff < 0)   return { label: `${Math.abs(diff)}d overdue`, cls: 'due-overdue' };
  if (diff === 0) return { label: 'TODAY',    cls: 'due-today' };
  if (diff === 1) return { label: 'TOMORROW', cls: 'due-tomorrow' };
  if (diff <= 7)  return { label: `in ${diff} days`, cls: 'due-soon' };
  return { label: new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), cls: '' };
}

function fmtINR(n) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

// ── Main entry point ─────────────────────────────────────────
function updateDashboardOrders() {
  const active = orders.filter(o => !['Delivered', 'Dispatched', 'Cancelled'].includes(o.status));

  // ── Row 1: Daily status ──────────────────────────────────────
  const todayO    = active.filter(o => o.date === todayStr);
  const tomorrowO = active.filter(o => o.date === tomorrowStr);
  const overdueO  = active.filter(o => o.date && o.date < todayStr);
  const readyO    = active.filter(o => o.status === 'Ready');

  _set('stat-today',    todayO.length);
  _set('stat-tomorrow', tomorrowO.length);
  _set('stat-active',   active.length);
  _set('stat-overdue',  overdueO.length);
  _set('stat-ready',    readyO.length);

  const overdueCard = document.getElementById('stat-overdue-card');
  if (overdueCard) overdueCard.className = `stat-card ${overdueO.length > 0 ? 'alert' : 'good'}`;
  const readyCard = document.getElementById('stat-ready-card');
  if (readyCard) readyCard.className = `stat-card ${readyO.length > 0 ? 'warn' : ''}`;

  const sub = document.getElementById('stat-overdue-sub');
  if (sub) sub.textContent = overdueO.length > 0
    ? overdueO.map(o => o.customer).slice(0, 2).join(', ') + (overdueO.length > 2 ? ` +${overdueO.length - 2}` : '')
    : 'All on track';

  // ── Urgent alert banner ──────────────────────────────────────
  const banner = document.getElementById('urgent-banner');
  if (banner) {
    if (overdueO.length > 0) {
      banner.style.display = 'flex';
      banner.innerHTML = `⚠️ <strong>${overdueO.length} order${overdueO.length > 1 ? 's' : ''} overdue</strong> — ${overdueO.map(o => `${o.id} (${o.customer})`).join(', ')}`;
    } else if (todayO.length > 0) {
      banner.style.display = 'flex';
      banner.innerHTML = `📦 <strong>${todayO.length} order${todayO.length > 1 ? 's' : ''} due today</strong> — ${todayO.map(o => o.customer).join(', ')}`;
    } else {
      banner.style.display = 'none';
    }
  }

  // ── Row 2: Business metrics ──────────────────────────────────
  _renderMonthlyMetrics();

  // ── Row 3a: Due this week ────────────────────────────────────
  _renderWeekView(active);

  // ── Row 3b: Order funnel + production load ───────────────────
  _renderFunnel();
  _renderProductionLoad();

  // ── Row 4: Urgent next 2 days ───────────────────────────────
  _renderUrgentList(todayO, tomorrowO);

  // ── Row 5a: Top clients ──────────────────────────────────────
  _renderTopClients();

  // ── Row 5b: Pending receivables ──────────────────────────────
  _renderReceivables();

  // ── Merge banner ─────────────────────────────────────────────
  const mergeEl = document.getElementById('dashboard-merge-banner');
  if (mergeEl && typeof getMergeOpportunities === 'function') {
    const opps = getMergeOpportunities();
    if (opps.length) {
      mergeEl.style.display = 'block';
      mergeEl.innerHTML = `<div style="font-weight:700;margin-bottom:6px">💡 ${opps.length} order${opps.length > 1 ? 's' : ''} can be delivered earlier by merging with existing runs</div>` +
        opps.map(op => {
          const sug = new Date(op.suggestedDelivery + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
          const cur = new Date(op.order.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
          return `<div style="font-size:12px;margin-top:2px">→ <strong>${op.order.id}</strong> · ${op.order.product || op.order.customer} · ${op.order.reelSize}" reel already running — deliver <strong>${sug}</strong> (was ${cur}, save ${op.daysSaved}d)</div>`;
        }).join('') +
        `<div style="margin-top:8px"><button class="btn-secondary" onclick="showPage('production')" style="font-size:11px">View Plan →</button></div>`;
    } else {
      mergeEl.style.display = 'none';
    }
  }

  // ── Pipeline table ────────────────────────────────────────────
  _renderPipeline(active);
}

// ── Monthly metrics (Revenue + Boxes) ───────────────────────
function _renderMonthlyMetrics() {
  const now       = new Date();
  const monthStr  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthName = MONTH_NAMES[now.getMonth()];

  const doneOrders = orders.filter(o =>
    ['Delivered', 'Dispatched'].includes(o.status) &&
    o.date && o.date.startsWith(monthStr)
  );

  const revenue   = doneOrders.reduce((s, o) => s + (parseInt(o.qty) || 0) * (parseFloat(o.rate) || 0), 0);
  const boxCount  = doneOrders.reduce((s, o) => s + (parseInt(o.qty) || 0), 0);
  const orderCount = doneOrders.length;

  _set('stat-revenue', fmtINR(revenue));
  const revSub = document.getElementById('stat-revenue-sub');
  if (revSub) revSub.textContent = `${orderCount} order${orderCount !== 1 ? 's' : ''} · ${monthName} ${now.getFullYear()}`;

  _set('stat-boxes-month', boxCount.toLocaleString('en-IN'));
  const boxSub = document.getElementById('stat-boxes-sub');
  if (boxSub) boxSub.textContent = `${monthName} ${now.getFullYear()} · ${orderCount} orders`;
}

// ── Due This Week ────────────────────────────────────────────
function _renderWeekView(active) {
  const el = document.getElementById('dashboard-week-view');
  if (!el) return;

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(todayStr + 'T00:00:00');
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().split('T')[0]);
  }

  const rangeEl = document.getElementById('week-range-label');
  if (rangeEl) {
    const s = new Date(days[0] + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const e = new Date(days[6] + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    rangeEl.textContent = `${s} – ${e}`;
  }

  const byDay = {};
  days.forEach(d => { byDay[d] = []; });
  active.forEach(o => { if (o.date && byDay[o.date]) byDay[o.date].push(o); });

  const hasAny = days.some(d => byDay[d].length > 0);
  if (!hasAny) {
    el.innerHTML = '<div class="empty-state">No orders due this week.</div>';
    return;
  }

  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;padding:4px 0">
    ${days.map(d => {
      const list = byDay[d];
      const dt   = new Date(d + 'T00:00:00');
      const dow  = dt.toLocaleDateString('en-IN', { weekday: 'short' });
      const dom  = dt.getDate();
      const isToday = d === todayStr;
      const over = d < todayStr;
      const dotColor = list.length === 0 ? 'var(--border)' : over ? 'var(--danger)' : isToday ? 'var(--blue)' : 'var(--success)';
      return `<div style="text-align:center;padding:8px 4px;border-radius:8px;background:${isToday ? 'var(--blue)' : 'var(--card-bg)'};border:1.5px solid ${isToday ? 'var(--blue)' : 'var(--border)'}">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:${isToday ? '#fff' : 'var(--muted)'}">${dow}</div>
        <div style="font-size:15px;font-weight:800;color:${isToday ? '#fff' : 'var(--text)'};line-height:1.3">${dom}</div>
        <div style="margin-top:4px;width:22px;height:22px;border-radius:50%;background:${list.length > 0 ? dotColor : 'transparent'};border:2px solid ${dotColor};color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;margin:4px auto 0">
          ${list.length > 0 ? list.length : ''}
        </div>
        ${list.slice(0, 2).map(o => `<div style="font-size:8.5px;color:${isToday ? 'rgba(255,255,255,0.85)' : 'var(--muted)'};margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${o.customer}">${o.customer.split(' ')[0]}</div>`).join('')}
        ${list.length > 2 ? `<div style="font-size:8px;color:${isToday ? 'rgba(255,255,255,0.7)' : 'var(--muted)'}">+${list.length - 2}</div>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

// ── Order Funnel ─────────────────────────────────────────────
function _renderFunnel() {
  const el = document.getElementById('dashboard-funnel');
  if (!el) return;

  const stages = ['New', 'In Production', 'Ready', 'Dispatched'];
  const counts = {};
  const values = {};
  stages.forEach(s => { counts[s] = 0; values[s] = 0; });

  orders.forEach(o => {
    if (stages.includes(o.status)) {
      counts[o.status]++;
      values[o.status] += (parseInt(o.qty) || 0) * (parseFloat(o.rate) || 0);
    }
  });

  const maxCount = Math.max(...Object.values(counts), 1);
  const COLORS   = { 'New': '#2980B9', 'In Production': '#E67E22', 'Ready': '#27AE60', 'Dispatched': '#8B5CF6' };

  el.innerHTML = `<div style="display:flex;gap:8px;align-items:flex-end;padding:4px 0 12px">
    ${stages.map(s => {
      const pct = Math.round((counts[s] / maxCount) * 100);
      const ht  = Math.max(pct * 0.7, 6);
      return `<div style="flex:1;text-align:center">
        <div style="font-size:11px;font-weight:700;color:${COLORS[s]};margin-bottom:4px">${counts[s]}</div>
        <div style="height:${ht}px;background:${COLORS[s]};border-radius:4px 4px 0 0;opacity:0.85;min-height:6px"></div>
        <div style="font-size:8.5px;font-weight:600;color:var(--muted);margin-top:5px;text-transform:uppercase;letter-spacing:0.3px">${s === 'In Production' ? 'In Prod' : s}</div>
        ${values[s] > 0 ? `<div style="font-size:9px;color:var(--muted);margin-top:1px">${fmtINR(values[s])}</div>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

// ── Production Load Today ────────────────────────────────────
function _renderProductionLoad() {
  const bar   = document.getElementById('prod-load-bar');
  const label = document.getElementById('prod-load-label');
  if (!bar || !label) return;

  const kgMap = typeof getDeliveryDayKg === 'function' ? getDeliveryDayKg() : {};
  const kg    = Math.round(kgMap[todayStr] || 0);
  const pct   = Math.min(Math.round((kg / MAX_DAILY_KG) * 100), 100);
  const color = pct >= 95 ? 'var(--danger)' : pct >= 75 ? '#F59E0B' : 'var(--blue)';

  bar.style.width      = pct + '%';
  bar.style.background = color;
  label.textContent    = `${kg.toLocaleString('en-IN')} kg / ${MAX_DAILY_KG.toLocaleString('en-IN')} kg capacity (${pct}%)`;
  label.style.color    = pct >= 95 ? 'var(--danger)' : 'var(--muted)';
}

// ── Urgent next 2 days ───────────────────────────────────────
function _renderUrgentList(todayO, tomorrowO) {
  const list   = document.getElementById('urgent-orders-list');
  if (!list) return;
  const urgent = [...todayO, ...tomorrowO].slice(0, 6);
  if (!urgent.length) {
    list.innerHTML = '<div class="empty-state">✅ No urgent orders in next 2 days.</div>';
    return;
  }
  list.innerHTML = '';
  urgent.forEach(o => {
    const isToday = o.date === todayStr;
    const row = document.createElement('div');
    row.className = 'order-row';
    row.innerHTML = `
      <div class="order-id">${o.id}</div>
      <div class="order-info">
        <div class="order-customer">${o.customer}</div>
        <div class="order-product">${o.product || '—'} ${o.size ? '· ' + o.size : ''} ${o.qty ? '· ' + (parseInt(o.qty)||0).toLocaleString('en-IN') + ' pcs' : ''}</div>
      </div>
      <div class="order-due ${isToday ? 'today' : 'tomorrow'}">${isToday ? 'TODAY' : 'TOMORROW'}</div>
    `;
    list.appendChild(row);
  });
}

// ── Top 5 Clients This Month ─────────────────────────────────
function _renderTopClients() {
  const el = document.getElementById('dashboard-top-clients');
  if (!el) return;

  const now      = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const byClient = {};
  orders
    .filter(o => ['Delivered', 'Dispatched'].includes(o.status) && o.date && o.date.startsWith(monthStr))
    .forEach(o => {
      if (!byClient[o.customer]) byClient[o.customer] = { boxes: 0, revenue: 0, orders: 0 };
      byClient[o.customer].boxes   += parseInt(o.qty) || 0;
      byClient[o.customer].revenue += (parseInt(o.qty) || 0) * (parseFloat(o.rate) || 0);
      byClient[o.customer].orders++;
    });

  const ranked = Object.entries(byClient)
    .sort((a, b) => b[1].boxes - a[1].boxes)
    .slice(0, 5);

  if (!ranked.length) {
    el.innerHTML = '<div class="empty-state">No dispatched orders this month yet.</div>';
    return;
  }

  const maxBoxes = ranked[0][1].boxes || 1;
  el.innerHTML = ranked.map(([name, d], i) => {
    const pct   = Math.round((d.boxes / maxBoxes) * 100);
    const medal = ['🥇', '🥈', '🥉', '4.', '5.'][i];
    return `<div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div style="font-size:12px;font-weight:600">${medal} ${name}</div>
        <div style="font-size:11px;color:var(--muted)">${d.boxes.toLocaleString('en-IN')} boxes · ${fmtINR(d.revenue)}</div>
      </div>
      <div style="background:var(--border);border-radius:4px;height:6px">
        <div style="width:${pct}%;height:100%;background:var(--blue);border-radius:4px"></div>
      </div>
    </div>`;
  }).join('');
}

// ── Pending Receivables ──────────────────────────────────────
function _renderReceivables() {
  const el    = document.getElementById('dashboard-receivables');
  const total = document.getElementById('stat-outstanding-total');
  if (!el) return;

  if (typeof getCustomerSummaries !== 'function') {
    el.innerHTML = '<div class="empty-state">Receivables module not loaded.</div>';
    return;
  }

  const summaries = getCustomerSummaries()
    .filter(s => s.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);

  const grandTotal = summaries.reduce((s, c) => s + c.outstanding, 0);
  if (total) total.textContent = grandTotal > 0 ? fmtINR(grandTotal) : '';

  if (!summaries.length) {
    el.innerHTML = '<div class="empty-state">✅ No outstanding receivables.</div>';
    return;
  }

  const maxOut = summaries[0].outstanding || 1;
  el.innerHTML = summaries.slice(0, 6).map(s => {
    const pct     = Math.round((s.outstanding / maxOut) * 100);
    const urgency = s.outstanding > 50000 ? 'var(--danger)' : s.outstanding > 20000 ? '#B45309' : 'var(--text)';
    return `<div style="margin-bottom:11px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
        <div style="font-size:12px;font-weight:600">${s.customer}</div>
        <div style="font-size:12px;font-weight:700;color:${urgency}">${fmtINR(s.outstanding)}</div>
      </div>
      <div style="background:var(--border);border-radius:4px;height:5px">
        <div style="width:${pct}%;height:100%;background:${urgency === 'var(--text)' ? '#6B7280' : urgency};border-radius:4px"></div>
      </div>
      <div style="font-size:10px;color:var(--muted);margin-top:2px">Billed ${fmtINR(s.totalBilled)} · Paid ${fmtINR(s.totalPaid)}</div>
    </div>`;
  }).join('') + (summaries.length > 6 ? `<div style="font-size:11px;color:var(--muted);text-align:center;padding-top:4px">+ ${summaries.length - 6} more</div>` : '');
}

// ── Pipeline table ───────────────────────────────────────────
function _renderPipeline(active) {
  const pipe = document.getElementById('dashboard-pipeline-list');
  if (!pipe) return;
  if (!active.length) { pipe.innerHTML = '<div class="empty-state">No active orders.</div>'; return; }

  const sorted = [...active].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const sc     = STATUS_COLORS;
  pipe.innerHTML = `<table class="pipeline-table">
    <thead><tr><th>Order</th><th>Customer</th><th>Product · Qty</th><th>Due</th><th>Status</th></tr></thead>
    <tbody>
      ${sorted.map(o => {
        const due  = dueBadge(o.date);
        const sCol = sc[o.status] || { bg: '#F3F4F6', color: '#374151' };
        const dispQ = typeof getDispatchedQty === 'function' ? getDispatchedQty(o.id) : 0;
        const prog  = dispQ > 0
          ? `<span style="font-size:10px;color:var(--blue);font-weight:600;margin-left:4px">${dispQ.toLocaleString('en-IN')}/${(parseInt(o.qty)||0).toLocaleString('en-IN')} out</span>`
          : '';
        return `<tr class="pipeline-row${due.cls === 'due-overdue' ? ' pipeline-overdue' : ''}">
          <td class="pipeline-id">${o.id}</td>
          <td class="pipeline-customer">${o.customer}</td>
          <td class="pipeline-product">${o.product || o.size || '—'}${o.qty ? ' · ' + (parseInt(o.qty)||0).toLocaleString('en-IN') + ' pcs' : ''}${prog}</td>
          <td><span class="pipeline-due ${due.cls}">${due.label}</span></td>
          <td><span class="pipeline-status" style="background:${sCol.bg};color:${sCol.color}">${o.status}</span></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}

// ── Utility ──────────────────────────────────────────────────
function _set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD.JS — Stats, Urgent Orders, Pipeline
// ══════════════════════════════════════════════════════════════

const STATUS_COLORS = {
  'New':           { bg: '#EFF6FF', color: '#1D4ED8' },
  'In Production': { bg: '#FEF3C7', color: '#92400E' },
  'Ready':         { bg: '#DCFCE7', color: '#15803D' },
  'Dispatched':    { bg: '#E0E7FF', color: '#4338CA' },
  'Delivered':     { bg: '#F0FDF4', color: '#166534' },
};

function dueBadge(dateStr) {
  if (!dateStr) return { label: '—', cls: '' };
  const diff = Math.round((new Date(dateStr) - new Date(todayStr)) / 86400000);
  if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, cls: 'due-overdue' };
  if (diff === 0) return { label: 'TODAY',                    cls: 'due-today' };
  if (diff === 1) return { label: 'TOMORROW',                 cls: 'due-tomorrow' };
  if (diff <= 7)  return { label: `in ${diff} days`,          cls: 'due-soon' };
  return { label: new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), cls: '' };
}

function updateDashboardOrders() {
  const active    = orders.filter(o => !['Delivered', 'Dispatched', 'Cancelled'].includes(o.status));
  const todayO    = active.filter(o => o.date === todayStr);
  const tomorrowO = active.filter(o => o.date === tomorrowStr);

  document.getElementById('stat-today').textContent    = todayO.length;
  document.getElementById('stat-tomorrow').textContent = tomorrowO.length;
  document.getElementById('stat-active').textContent   = active.length;

  const banner = document.getElementById('urgent-banner');
  if (todayO.length > 0) {
    banner.style.display = 'flex';
    banner.innerHTML     = `⚠️ <strong>${todayO.length} order${todayO.length > 1 ? 's' : ''} due today</strong> — ${todayO.map(o => o.customer).join(', ')}`;
  } else {
    banner.style.display = 'none';
  }

  // Urgent card (next 2 days only)
  const list   = document.getElementById('urgent-orders-list');
  const urgent = [...todayO, ...tomorrowO].slice(0, 6);
  if (!urgent.length) {
    list.innerHTML = '<div class="empty-state">✅ No urgent orders in next 2 days.</div>';
  } else {
    list.innerHTML = '';
    urgent.forEach(o => {
      const isToday = o.date === todayStr;
      const row     = document.createElement('div');
      row.className = 'order-row';
      row.innerHTML = `
        <div class="order-id">${o.id}</div>
        <div class="order-info">
          <div class="order-customer">${o.customer}</div>
          <div class="order-product">${o.product || '—'} ${o.size ? '· ' + o.size : ''} ${o.qty ? '· ' + o.qty.toLocaleString('en-IN') + ' pcs' : ''}</div>
        </div>
        <div class="order-due ${isToday ? 'today' : 'tomorrow'}">${isToday ? 'TODAY' : 'TOMORROW'}</div>
      `;
      list.appendChild(row);
    });
  }

  // Active Pipeline card — all active orders sorted by date
  const pipe = document.getElementById('dashboard-pipeline-list');
  if (!pipe) return;
  if (!active.length) { pipe.innerHTML = '<div class="empty-state">No active orders.</div>'; return; }

  const sorted = [...active].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const sc = STATUS_COLORS;
  pipe.innerHTML = `<table class="pipeline-table">
    <thead><tr>
      <th>Order</th><th>Customer</th><th>Product · Qty</th><th>Due</th><th>Status</th>
    </tr></thead>
    <tbody>
      ${sorted.map(o => {
        const due   = dueBadge(o.date);
        const sCol  = sc[o.status] || { bg: '#F3F4F6', color: '#374151' };
        const dispQ = typeof getDispatchedQty === 'function' ? getDispatchedQty(o.id) : 0;
        const progStr = dispQ > 0
          ? `<span style="font-size:10px;color:var(--blue);font-weight:600;margin-left:4px">${dispQ.toLocaleString('en-IN')}/${(parseInt(o.qty)||0).toLocaleString('en-IN')} out</span>`
          : '';
        return `<tr class="pipeline-row${due.cls === 'due-overdue' ? ' pipeline-overdue' : ''}">
          <td class="pipeline-id">${o.id}</td>
          <td class="pipeline-customer">${o.customer}</td>
          <td class="pipeline-product">${o.product || o.size || '—'}${o.qty ? ' · ' + (parseInt(o.qty)||0).toLocaleString('en-IN') + ' pcs' : ''}${progStr}</td>
          <td><span class="pipeline-due ${due.cls}">${due.label}</span></td>
          <td><span class="pipeline-status" style="background:${sCol.bg};color:${sCol.color}">${o.status}</span></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}

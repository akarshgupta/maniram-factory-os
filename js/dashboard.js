// ══════════════════════════════════════════════════════════════
// DASHBOARD.JS — Stats, Urgent Orders
// ══════════════════════════════════════════════════════════════

function updateDashboardOrders() {
  const active    = orders.filter(o => o.status !== 'Delivered' && o.status !== 'Cancelled');
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

  const list   = document.getElementById('urgent-orders-list');
  const urgent = [...todayO, ...tomorrowO].slice(0, 6);
  if (!urgent.length) { list.innerHTML = '<div class="empty-state">✅ No urgent orders in next 2 days.</div>'; return; }

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

// ══════════════════════════════════════════════════════════════
// CALENDAR.JS — Monthly Order Calendar
// ══════════════════════════════════════════════════════════════

let calYear  = today.getFullYear();
let calMonth = today.getMonth();

const monthNames  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const chipColors  = ['chip-blue','chip-green','chip-orange','chip-purple','chip-red'];
const customerColorMap = {};
let colorIdx = 0;

function getCustomerColor(c) {
  if (!customerColorMap[c]) customerColorMap[c] = chipColors[colorIdx++ % chipColors.length];
  return customerColorMap[c];
}

function changeMonth(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  renderCalendar();
}

function calToggleDelivered(orderId) {
  const o = orders.find(x => x.id === orderId);
  if (!o) return;

  const nowDelivered = o.status !== 'Delivered';
  const newStatus    = nowDelivered ? 'Delivered' : 'Ready';
  o.status = newStatus;
  if (nowDelivered && typeof recordDeliveredOrder === 'function') recordDeliveredOrder(o);
  // clear dispatch log when manually reverting to un-delivered
  if (!nowDelivered && typeof clearDispatch === 'function') clearDispatch(orderId);

  // Push status update to sheet
  if (o.rowIndex && o.rowIndex !== 9999) {
    const d   = new Date(o.date);
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
    });
  }

  renderCalendar();
  updateDashboardOrders();
  if (typeof renderProductionPlan === 'function') renderProductionPlan();
}

function renderCalendar() {
  document.getElementById('cal-month-label').textContent = monthNames[calMonth] + ' ' + calYear;
  const body        = document.getElementById('cal-body');
  body.innerHTML    = '';
  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const c = document.createElement('div');
    c.className = 'cal-cell empty';
    body.appendChild(c);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const ds       = `${calYear}-${String(calMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday  = ds === todayStr;
    // Show all orders on their date except Cancelled; Delivered shown with strikethrough
    const dayOrders = orders.filter(o => o.date === ds && o.status !== 'Cancelled');
    const cell     = document.createElement('div');
    cell.className = 'cal-cell' + (isToday ? ' today' : '');

    const dateLabel      = document.createElement('div');
    dateLabel.className  = 'cal-date';
    dateLabel.textContent = d;
    cell.appendChild(dateLabel);

    const active = dayOrders.filter(o => o.status !== 'Delivered');
    const dayKg  = active.reduce((s, o) => s + (parseInt(o.qty) || 0) * (parseFloat(o.weight) || 0) / 1000, 0);
    const kgOver = dayKg > MAX_DAILY_KG;

    if (active.length > 3 || kgOver) {
      const notice     = document.createElement('div');
      notice.className = 'overload-notice' + (kgOver ? ' overload-kg' : '');
      notice.textContent = kgOver
        ? `⚠ ${Math.round(dayKg)} kg — over limit`
        : `⚠ ${active.length} orders · ${Math.round(dayKg)} kg`;
      cell.appendChild(notice);
    } else if (dayKg >= 500) {
      const kgEl     = document.createElement('div');
      kgEl.className = 'cal-kg-info';
      kgEl.textContent = `${Math.round(dayKg)} kg`;
      cell.appendChild(kgEl);
    }

    dayOrders.forEach(order => {
      const isDone     = order.status === 'Delivered';
      const dispatched = typeof getDispatchedQty === 'function' ? getDispatchedQty(order.id) : 0;
      const total      = parseInt(order.qty) || 0;
      const remaining  = Math.max(0, total - dispatched);
      const progressLine = dispatched > 0 && !isDone
        ? `<span class="chip-progress">${dispatched.toLocaleString('en-IN')}/${total.toLocaleString('en-IN')} out · ${remaining.toLocaleString('en-IN')} left</span>`
        : '';
      const chip = document.createElement('div');
      chip.className = `cal-order-chip ${getCustomerColor(order.customer)}${isDone ? ' done' : ''}`;
      chip.innerHTML = `
        <span class="chip-check${isDone ? ' checked' : ''}" onclick="event.stopPropagation();calToggleDelivered('${order.id}')">
          ${isDone ? '✓' : ''}
        </span>
        <span class="chip-label">
          <span class="chip-product">${order.product || order.size || 'Order'}</span>
          <span class="chip-customer">${order.customer.split(' ')[0]}</span>
          ${progressLine}
        </span>
        ${!isDone ? `<span class="chip-dispatch-btn" title="Record dispatch" onclick="event.stopPropagation();openDispatchModal('${escStr(order.id)}')">🚚</span>` : ''}`;
      cell.appendChild(chip);
    });

    body.appendChild(cell);
  }
}

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

function renderCalendar() {
  document.getElementById('cal-month-label').textContent = monthNames[calMonth] + ' ' + calYear;
  const body       = document.getElementById('cal-body');
  body.innerHTML   = '';
  const firstDay   = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth= new Date(calYear, calMonth + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const c = document.createElement('div');
    c.className = 'cal-cell empty';
    body.appendChild(c);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const ds        = `${calYear}-${String(calMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday   = ds === todayStr;
    const dayOrders = orders.filter(o => o.date === ds && o.status !== 'Delivered' && o.status !== 'Cancelled');
    const cell      = document.createElement('div');
    cell.className  = 'cal-cell' + (isToday ? ' today' : '');

    const dateLabel      = document.createElement('div');
    dateLabel.className  = 'cal-date';
    dateLabel.textContent= d;
    cell.appendChild(dateLabel);

    if (dayOrders.length > 3) {
      const notice      = document.createElement('div');
      notice.className  = 'overload-notice';
      notice.textContent= `⚠ ${dayOrders.length} orders`;
      cell.appendChild(notice);
    }

    dayOrders.forEach(order => {
      const chip       = document.createElement('div');
      chip.className   = `cal-order-chip ${getCustomerColor(order.customer)}${order.done ? ' done' : ''}`;
      chip.innerHTML   = `<span class="chip-check">${order.done ? '✓' : ''}</span><span class="chip-label">${order.customer.split(' ')[0]} · ${order.product || order.size || 'Order'}</span>`;
      chip.onclick     = e => { e.stopPropagation(); order.done = !order.done; renderCalendar(); };
      cell.appendChild(chip);
    });

    body.appendChild(cell);
  }
}

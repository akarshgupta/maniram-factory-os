// ══════════════════════════════════════════════════════════════
// REMINDERS.JS — Repeat Order Pattern Detection & WhatsApp
// ══════════════════════════════════════════════════════════════

let pendingWALink = '';

// ── LocalStorage Helpers ──
function loadOrderHistory()  { try { return JSON.parse(localStorage.getItem(LS_ORDER_HISTORY) || '{}'); } catch { return {}; } }
function saveOrderHistory(h) { localStorage.setItem(LS_ORDER_HISTORY, JSON.stringify(h)); }
function loadReminderSent()  { try { return JSON.parse(localStorage.getItem(LS_REMINDER_SENT) || '{}'); } catch { return {}; } }
function saveReminderSent(s) { localStorage.setItem(LS_REMINDER_SENT, JSON.stringify(s)); }

function patternKey(customer, product, size) {
  return [customer.trim(), product.trim(), size.trim()].join('||').toLowerCase();
}

// ── Sync orders → history ──
function syncOrdersToHistory() {
  const history = loadOrderHistory();
  orders.forEach(o => {
    if (!o.customer || !o.product || !o.size || !o.date) return;
    const key = patternKey(o.customer, o.product, o.size);
    if (!history[key]) history[key] = { customer: o.customer, product: o.product, size: o.size, orders: [] };
    const exists = history[key].orders.some(h => h.orderId === o.id);
    if (!exists) history[key].orders.push({ date: o.date, orderId: o.id });
  });
  Object.values(history).forEach(p => p.orders.sort((a, b) => a.date.localeCompare(b.date)));
  saveOrderHistory(history);
}

// ── Cycle Calculation ──
function calcAvgCycle(dates) {
  if (dates.length < 2) return null;
  const sorted = [...dates].sort();
  const gaps   = [];
  for (let i = 1; i < sorted.length; i++) {
    const diff = Math.round((new Date(sorted[i]) - new Date(sorted[i-1])) / (1000*60*60*24));
    if (diff > 0) gaps.push(diff);
  }
  if (!gaps.length) return null;
  return Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
}

function predictNextDate(lastDate, avgCycle) {
  const d = new Date(lastDate);
  d.setDate(d.getDate() + avgCycle);
  return d.toISOString().split('T')[0];
}

function daysFromToday(dateStr) {
  return Math.round((new Date(dateStr) - new Date(todayStr)) / (1000*60*60*24));
}

// ── Build Reminder Objects ──
function buildReminderObjects() {
  const history = loadOrderHistory();
  return Object.entries(history)
    .filter(([, p]) => p.orders.length >= 2)
    .map(([key, pattern]) => {
      const dates     = pattern.orders.map(o => o.date);
      const avgCycle  = calcAvgCycle(dates);
      if (!avgCycle) return null;
      const lastDate      = dates[dates.length - 1];
      const predictedDate = predictNextDate(lastDate, avgCycle);
      return { key, customer: pattern.customer, product: pattern.product, size: pattern.size, avgCycle, lastDate, predictedDate, daysUntil: daysFromToday(predictedDate), orderCount: pattern.orders.length };
    })
    .filter(Boolean)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

// ── Main Compute ──
function computeReminders() {
  const all      = buildReminderObjects();
  const sentMap  = loadReminderSent();
  const active   = all.filter(r => r.daysUntil >= -1 && r.daysUntil <= 3);
  const upcoming = all.filter(r => r.daysUntil > 3   && r.daysUntil <= 30);

  updateReminderBadge(active.length);
  renderDashboardReminderBanner(active);
  renderActiveReminders(active, sentMap);
  renderUpcomingReminders(upcoming);
  renderAllPatterns();
}

function updateReminderBadge(count) {
  const b = document.getElementById('sidebar-reminder-badge');
  const d = document.getElementById('bnav-dot');
  if (count > 0) {
    if (b) { b.style.display = 'inline-block'; b.textContent = count; }
    if (d) d.style.display = 'block';
  } else {
    if (b) b.style.display = 'none';
    if (d) d.style.display = 'none';
  }
}

// ── Dashboard Banner ──
function renderDashboardReminderBanner(active) {
  const banner = document.getElementById('dashboard-reminder-banner');
  const list   = document.getElementById('dashboard-reminder-list');
  if (!active.length) { banner.style.display = 'none'; return; }
  banner.style.display = 'block';
  list.innerHTML = '';
  active.forEach(r => {
    const item  = document.createElement('div');
    item.className = 'reminder-alert-item';
    const label = r.daysUntil <= 0 ? '🔴 Aaj!' : r.daysUntil === 1 ? '🟠 Kal' : `🟡 ${r.daysUntil} din`;
    item.innerHTML = `
      <div class="reminder-alert-info">
        <div class="reminder-alert-customer">${r.customer} — ${r.product} (${r.size})</div>
        <div class="reminder-alert-detail">Avg: ${r.avgCycle} din · ${label}</div>
      </div>
      <button class="btn-send-reminder" onclick="openWAPopup('${escStr(r.key)}')">📲 Remind</button>
    `;
    list.appendChild(item);
  });
}

// ── Active Reminders ──
function renderActiveReminders(active, sentMap) {
  const el = document.getElementById('active-reminders-list');
  if (!active.length) { el.innerHTML = '<div class="empty-state">✅ Koi reminder due nahi (next 3 days).</div>'; return; }
  el.innerHTML = '';
  active.forEach(r => {
    const wasSent  = sentMap[r.key + '_' + r.predictedDate];
    const daysLabel = r.daysUntil <= 0 ? '🔴 Aaj due!' : r.daysUntil === 1 ? '🟠 Kal due' : `🟡 ${r.daysUntil} din mein`;
    const card     = document.createElement('div');
    card.className = 'reminder-card' + (wasSent ? ' sent' : '');
    card.innerHTML = `
      <div class="reminder-icon">${wasSent ? '✅' : '🔔'}</div>
      <div class="reminder-info">
        <div class="reminder-customer">${r.customer}</div>
        <div class="reminder-product">${r.product} · ${r.size}</div>
        <div class="reminder-cycle">📊 Avg: ${r.avgCycle} din · ${r.orderCount} orders</div>
        <div class="reminder-due">📅 Last: ${formatDate(r.lastDate)} → Next: ${formatDate(r.predictedDate)} · ${daysLabel}</div>
        ${wasSent ? '<div style="font-size:11px;color:var(--success);margin-top:4px;font-weight:600;">✓ Bhej diya</div>' : ''}
      </div>
      <div class="reminder-actions">
        <button class="btn-wa" onclick="openWAPopup('${escStr(r.key)}')">📲 Remind</button>
        <button class="btn-dismiss" onclick="dismissReminder('${escStr(r.key)}','${r.predictedDate}')">Dismiss</button>
      </div>
    `;
    el.appendChild(card);
  });
}

// ── Upcoming Reminders ──
function renderUpcomingReminders(upcoming) {
  const el = document.getElementById('upcoming-reminders-list');
  if (!upcoming.length) { el.innerHTML = '<div class="empty-state">Koi upcoming nahi next 30 days.</div>'; return; }
  el.innerHTML = '';
  upcoming.forEach(r => {
    const card     = document.createElement('div');
    card.className = 'reminder-card';
    card.style.borderLeftColor = 'var(--accent)';
    card.style.opacity         = '0.85';
    card.innerHTML = `
      <div class="reminder-icon">📅</div>
      <div class="reminder-info">
        <div class="reminder-customer">${r.customer}</div>
        <div class="reminder-product">${r.product} · ${r.size}</div>
        <div class="reminder-cycle">📊 Avg: ${r.avgCycle} din · ${r.orderCount} orders</div>
        <div class="reminder-due">Next: ${formatDate(r.predictedDate)} (${r.daysUntil} din baad)</div>
      </div>
      <div class="reminder-actions"><span style="font-size:14px;font-weight:700;color:var(--muted)">${r.daysUntil}d</span></div>
    `;
    el.appendChild(card);
  });
}

// ── All Patterns ──
function renderAllPatterns() {
  const el       = document.getElementById('all-patterns-list');
  const history  = loadOrderHistory();
  const patterns = Object.values(history);
  if (!patterns.length) { el.innerHTML = '<div class="empty-state">Abhi koi repeat pattern nahi. 2+ same orders ke baad automatically track hoga.</div>'; return; }
  el.innerHTML = '';
  patterns.sort((a, b) => b.orders.length - a.orders.length).forEach(p => {
    const dates    = p.orders.map(o => o.date);
    const avgCycle = calcAvgCycle(dates);
    const lastDate = dates[dates.length - 1];
    const row      = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;padding:10px 20px;border-bottom:1px solid var(--border);gap:12px;font-size:13px;';
    row.innerHTML = `
      <div style="flex:1"><div style="font-weight:600">${p.customer}</div><div style="font-size:11px;color:var(--muted)">${p.product} · ${p.size}</div></div>
      <div style="text-align:center;min-width:60px"><div style="font-size:18px;font-weight:700;font-family:monospace;color:var(--blue)">${p.orders.length}</div><div style="font-size:10px;color:var(--muted)">orders</div></div>
      <div style="text-align:center;min-width:80px">${avgCycle ? `<div style="font-size:14px;font-weight:700">${avgCycle}d</div><div style="font-size:10px;color:var(--muted)">avg cycle</div>` : '<div style="font-size:11px;color:var(--muted)">Need 2+</div>'}</div>
      <div style="text-align:right;min-width:90px;font-size:11px;color:var(--muted)">${lastDate ? 'Last: ' + formatDate(lastDate) : '—'}</div>
    `;
    el.appendChild(row);
  });
}

function dismissReminder(key, predictedDate) {
  const s = loadReminderSent();
  s[key + '_' + predictedDate] = { dismissed: true, at: new Date().toISOString() };
  saveReminderSent(s);
  computeReminders();
}

// ── WhatsApp Popup ──
function openWAPopup(key) {
  const history = loadOrderHistory();
  const pattern = history[key];
  if (!pattern) return;
  const dates     = pattern.orders.map(o => o.date);
  const avgCycle  = calcAvgCycle(dates);
  const lastDate  = dates[dates.length - 1];
  const nextDate  = avgCycle ? predictNextDate(lastDate, avgCycle) : '';
  const client    = CLIENTS.find(c => c.name.toLowerCase() === pattern.customer.toLowerCase());
  const rawPhone  = (client?.phone || '').replace(/\D/g, '');
  const phone     = rawPhone.startsWith('91') && rawPhone.length > 10 ? rawPhone.slice(2) : rawPhone;
  const message   = `Namaskar Sir! 🙏\n\nManiram Industries ki taraf se reminder:\n\n📦 *${pattern.product}* (${pattern.size})\nka order ${nextDate ? formatDate(nextDate) : 'jald hi'} tak due hota hai aapka.\n\nKya aap order confirm karna chahenge?\n\n— Maniram Industries, Jhansi`;
  const waUrl     = phone ? `https://wa.me/91${phone}?text=${encodeURIComponent(message)}` : `https://wa.me/?text=${encodeURIComponent(message)}`;
  pendingWALink   = waUrl + '||' + key + '||' + nextDate;
  document.getElementById('popup-sub').textContent     = phone ? `${pattern.customer} (${phone})` : `${pattern.customer} — phone nahi mila`;
  document.getElementById('popup-preview').textContent = message;
  document.getElementById('popup-overlay').classList.add('show');
}

function closePopup() {
  document.getElementById('popup-overlay').classList.remove('show');
  pendingWALink = '';
}

function confirmSendWA() {
  const parts = pendingWALink.split('||');
  const waUrl = parts[0];
  const key   = parts[1];
  const date  = parts[2];
  if (key && date) { const s = loadReminderSent(); s[key + '_' + date] = { sent: true, at: new Date().toISOString() }; saveReminderSent(s); }
  closePopup();
  window.open(waUrl, '_blank');
  setTimeout(computeReminders, 500);
}

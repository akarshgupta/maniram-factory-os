// ══════════════════════════════════════════════════════════════
// ORDERS.JS — Fetch, Save, Render, Delivery Suggestion
// ══════════════════════════════════════════════════════════════

let orders         = [];
let activeOrderTab = 'all';

// ── Helpers ──
function colourDot(c) {
  if (!c) return '';
  const hex = COLOUR_HEX[c.toLowerCase()] || '#999';
  return `<span class="colour-dot" style="background:${hex}"></span>`;
}

function parseSheetDate(raw) {
  if (!raw) return '';
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const y = dmy[3].length === 2 ? '20' + dmy[3] : dmy[3];
    return `${y}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
  }
  if (raw.match(/^\d{4}-\d{2}-\d{2}$/)) return raw;
  return '';
}

function addBusinessDays(fromDate, days) {
  const d = new Date(fromDate);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0) added++; // skip Sunday
  }
  return d.toISOString().split('T')[0];
}

// ── Order ID ──
function generateOrderId() {
  let max = 0;
  orders.forEach(o => {
    const m = o.id.match(/MIORD(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1]));
  });
  return 'MIORD' + String(max + 1).padStart(3, '0');
}

function refreshOrderId() {
  document.getElementById('f-id').value = generateOrderId();
}

// ── Fetch Orders ──
async function fetchOrders() {
  setOrderSyncStatus('loading', 'Fetching orders...');
  const range = encodeURIComponent(`${ORDERS_TAB}!A1:L500`);
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${ORDERS_SHEET_ID}/values/${range}?key=${API_KEY}`;
  try {
    const res  = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    const rows = json.values || [];
    if (rows.length < 2) {
      orders = [];
      setOrderSyncStatus('ok', 'No orders yet');
      renderOrders(); renderGroupedOrders(); updateDashboardOrders(); renderCalendar();
      refreshOrderId();
      return;
    }

    const header = rows[0].map(h => h.toString().trim().toLowerCase());
    const col = {
      id:       header.findIndex(h => h.includes('order id') || h === 'order id'),
      customer: header.findIndex(h => h.includes('customer')),
      product:  header.findIndex(h => h.includes('product')),
      spec:     header.findIndex(h => h.includes('box spec') || h.includes('specs') || h.includes('size')),
      ply:      header.findIndex(h => h === 'ply' || h.includes('ply')),
      colour:   header.findIndex(h => h.includes('colour') || h.includes('color')),
      weight:   header.findIndex(h => h.includes('weight') || h === 'wt'),
      qty:      header.findIndex(h => h.includes('quantity') || h === 'qty'),
      rate:     header.findIndex(h => h === 'rate' || h.includes('rate')),
      date:     header.findIndex(h => h.includes('delivery')),
      status:   header.findIndex(h => h === 'status'),
      priority: header.findIndex(h => h.includes('priority')),
    };

    orders = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r[col.customer]) continue;
      const rawDate = col.date >= 0 ? (r[col.date] || '') : '';
      orders.push({
        id:       col.id >= 0       ? (r[col.id]       || `MIORD${String(i).padStart(3,'0')}`) : `MIORD${String(i).padStart(3,'0')}`,
        customer: col.customer >= 0 ? (r[col.customer] || '') : '',
        product:  col.product  >= 0 ? (r[col.product]  || '') : '',
        size:     col.spec     >= 0 ? (r[col.spec]     || '') : '',
        ply:      col.ply      >= 0 ? (r[col.ply]      || '') : '',
        colour:   col.colour   >= 0 ? (r[col.colour]   || '') : '',
        weight:   col.weight   >= 0 ? (r[col.weight]   || '') : '',
        qty:      col.qty      >= 0 ? parseInt(r[col.qty]) || 0 : 0,
        rate:     col.rate     >= 0 ? parseFloat(r[col.rate]) || 0 : 0,
        date:     parseSheetDate(rawDate),
        status:   col.status   >= 0 ? (r[col.status]   || 'New') : 'New',
        priority: col.priority >= 0 ? (r[col.priority] || 'Normal') : 'Normal',
        done: false, rowIndex: i + 1,
      });
    }

    const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    setOrderSyncStatus('ok', `Live · ${orders.length} orders · ${now}`);
    syncOrdersToHistory();
    renderOrders();
    updateDashboardOrders();
    renderCalendar();
    computeReminders();
    if (activeOrderTab === 'grouped') renderGroupedOrders();
    refreshOrderId();
  } catch (err) {
    setOrderSyncStatus('error', `Error: ${err.message}`);
  }
}

// ── Save Order ──
async function saveOrderToSheet() {
  const id       = document.getElementById('f-id').value.trim() || generateOrderId();
  const customer = document.getElementById('f-customer').value.trim();
  const prodSel  = document.getElementById('f-product');
  const product  = prodSel.options[prodSel.selectedIndex]?.text?.split(' · ')[0] || '';
  const size     = document.getElementById('f-size').value.trim();
  const ply      = document.getElementById('f-ply').value.trim();
  const colour   = document.getElementById('f-colour').value.trim();
  const weight   = document.getElementById('f-weight').value.trim();
  const qty      = document.getElementById('f-qty').value;
  const rate     = document.getElementById('f-rate').value;
  const date     = document.getElementById('f-date').value;
  const status   = document.getElementById('f-status').value;
  const priority = document.getElementById('f-priority').value;

  if (!customer || !date) { alert('Customer aur Delivery Date required hai.'); return; }

  const d         = new Date(date);
  const formatted = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  const payload   = { id, customer, product, size, ply, colour, weight, qty, rate, date: formatted, status, priority, remarks: '' };

  try {
    const btn = document.querySelector('button.btn-primary[onclick="saveOrderToSheet()"]');
    if (btn) { btn.textContent = '⏳ Saving...'; btn.disabled = true; }
    await fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    clearOrderForm();
    if (btn) btn.textContent = '✅ Saved!';
    setTimeout(() => { if (btn) { btn.textContent = '💾 Save Order'; btn.disabled = false; } }, 2000);
    setTimeout(() => fetchOrders(), 1500);
  } catch (err) {
    alert(`Save failed: ${err.message}`);
    const btn = document.querySelector('button.btn-primary[onclick="saveOrderToSheet()"]');
    if (btn) { btn.textContent = '💾 Save Order'; btn.disabled = false; }
  }
}

function clearOrderForm() {
  ['f-customer', 'f-qty', 'f-rate', 'f-date'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-product').innerHTML = '<option value="">— Select Customer First —</option>';
  clearProductFields();
  document.getElementById('f-status').value   = 'New';
  document.getElementById('f-priority').value = 'Normal';
  hideSuggestion();
}

// ── Sync Status ──
function setOrderSyncStatus(type, msg) {
  ['order-sync-dot', 'cal-sync-dot'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.className = `sync-dot ${type === 'ok' ? '' : type}`;
  });
  ['order-sync-label', 'cal-sync-label'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = msg;
  });
}

// ── Tab Switch ──
function switchOrderTab(tab) {
  activeOrderTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('tab-all').style.display     = tab === 'all'     ? 'block' : 'none';
  document.getElementById('tab-grouped').style.display = tab === 'grouped' ? 'block' : 'none';
  if (tab === 'grouped') renderGroupedOrders();
}

// ── Render All Orders ──
function renderOrders() {
  const list = document.getElementById('orders-list');
  if (!orders.length) { list.innerHTML = '<div class="empty-state">No orders. Add above or enter in Google Sheets.</div>'; return; }
  list.innerHTML = '';
  [...orders].sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(o => {
    const dateDisp = o.date ? new Date(o.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';
    const row      = document.createElement('div');
    row.className  = 'table-row';
    row.innerHTML  = `
      <div style="font-family:monospace;font-size:11px;color:var(--muted)">${o.id}</div>
      <div>
        <div style="font-weight:600;font-size:13px">${o.customer}${o.priority === 'Urgent' ? '<span class="priority-urgent">URG</span>' : ''}</div>
        <div style="font-size:11px;color:var(--muted)">${o.product || '—'}</div>
      </div>
      <div style="font-size:12px;font-family:monospace">${o.size || '—'}</div>
      <div style="font-size:12px">${colourDot(o.colour)}${o.colour || '—'}</div>
      <div style="font-size:12px">${o.weight ? o.weight + 'gm' : '—'}</div>
      <div style="font-size:12px;font-weight:500">${dateDisp}</div>
      <div><span class="status-badge ${STATUS_CLASS[o.status] || 'status-new'}">${o.status}</span></div>
      <div style="font-size:13px;font-weight:600">${o.qty ? o.qty.toLocaleString('en-IN') : '—'}</div>
    `;
    list.appendChild(row);
  });
}

// ── Render Grouped Orders ──
function renderGroupedOrders() {
  const el = document.getElementById('grouped-orders-list');
  if (!orders.length) { el.innerHTML = '<div class="empty-state">No orders yet.</div>'; return; }

  const groups = {};
  orders.forEach(o => {
    if (!groups[o.customer]) groups[o.customer] = [];
    groups[o.customer].push(o);
  });

  el.innerHTML = '';
  Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).forEach(([customer, cOrders]) => {
    const pending    = cOrders.filter(o => o.status !== 'Delivered' && o.status !== 'Dispatched' && o.status !== 'Cancelled');
    const pendingQty = pending.reduce((s, o) => s + (o.qty || 0), 0);
    const pendingAmt = pending.reduce((s, o) => s + ((o.qty || 0) * (o.rate || 0)), 0);

    const group        = document.createElement('div');
    group.className    = 'client-group';
    const safeKey      = customer.replace(/\s/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    group.innerHTML    = `
      <div class="client-group-header">
        <div class="client-group-name">🏢 ${customer}</div>
        <div class="client-group-stats">
          <div class="client-stat">
            <div class="client-stat-val">${pendingQty.toLocaleString('en-IN')}</div>
            <div class="client-stat-lbl">Pending pcs</div>
          </div>
          ${pendingAmt > 0 ? `<div class="client-stat"><div class="client-stat-val">₹${Math.round(pendingAmt/1000)}K</div><div class="client-stat-lbl">Pending amt</div></div>` : ''}
          <div class="client-stat">
            <div class="client-stat-val">${cOrders.length}</div>
            <div class="client-stat-lbl">Total orders</div>
          </div>
        </div>
      </div>
      <div class="orders-table" style="border-radius:0 0 12px 12px;border-top:none;">
        <div class="table-header">
          <div>Order ID</div><div>Product</div><div>Size</div>
          <div>Colour</div><div>Wt</div><div>Delivery</div><div>Status</div><div>Qty</div>
        </div>
        <div class="grouped-rows-${safeKey}"></div>
      </div>
    `;
    el.appendChild(group);

    const rowsContainer = group.querySelector(`.grouped-rows-${safeKey}`);
    [...cOrders].sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(o => {
      const dateDisp = o.date ? new Date(o.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';
      const isPending = o.status !== 'Delivered' && o.status !== 'Dispatched' && o.status !== 'Cancelled';
      const row       = document.createElement('div');
      row.className   = 'table-row';
      row.style.background = isPending ? '#FFFBF0' : '';
      row.innerHTML   = `
        <div style="font-family:monospace;font-size:11px;color:var(--muted)">${o.id}</div>
        <div><div style="font-weight:600;font-size:12px">${o.product || '—'}</div></div>
        <div style="font-size:11px;font-family:monospace">${o.size || '—'}</div>
        <div style="font-size:12px">${colourDot(o.colour)}${o.colour || '—'}</div>
        <div style="font-size:11px">${o.weight ? o.weight + 'gm' : '—'}</div>
        <div style="font-size:12px">${dateDisp}</div>
        <div><span class="status-badge ${STATUS_CLASS[o.status] || 'status-new'}">${o.status}</span></div>
        <div style="font-size:13px;font-weight:600">${o.qty ? o.qty.toLocaleString('en-IN') : '—'}</div>
      `;
      rowsContainer.appendChild(row);
    });
  });
}

// ══════════════════════════════════════════════════════════════
// SMART DELIVERY SUGGESTION
// ══════════════════════════════════════════════════════════════

function getSuggestedDeliveryDate() {
  const ply      = parseInt(document.getElementById('f-ply').value)    || 3;
  const qty      = parseInt(document.getElementById('f-qty').value)    || 0;
  const size     = (document.getElementById('f-size').value || '').trim();
  const reelSize = guessReelSize(size);

  if (!qty) { alert('Pehle Quantity enter karo.'); return; }
  if (!size) { alert('Pehle Box Size enter karo.'); return; }

  // Production days needed
  const prodDays = PRODUCTION_DAYS.calc(ply, qty);

  // Check reel stock
  let suggestion = null;
  let reason     = '';

  if (reelSize) {
    const reelCheck = checkReelAvailability(reelSize);

    if (reelCheck.available) {
      // Stock available → production can start today
      const deliveryDate = addBusinessDays(todayStr, prodDays);
      suggestion = { date: deliveryDate, type: 'stock', reelSize, prodDays };
      reason = `✅ ${reelSize}" reel stock mein hai (${reelCheck.count} reels). Production aaj se shuru ho sakti hai.`;
    } else {
      // Check pending purchases
      const pending = getPendingDeliveries(reelSize);
      if (pending.length > 0) {
        const earliest  = pending[0];
        const afterReel = addBusinessDays(earliest.expectedDelivery, prodDays);
        suggestion = { date: afterReel, type: 'pending', reelSize, prodDays, reelArrival: earliest.expectedDelivery, supplier: earliest.supplier };
        reason = `⏳ ${reelSize}" reel stock mein nahi. ${earliest.supplier} se delivery expected ${formatDate(earliest.expectedDelivery)}. Iske baad production shuru hogi.`;
      } else {
        // No stock, no pending
        suggestion = { date: null, type: 'unavailable', reelSize };
        reason = `❌ ${reelSize}" reel stock mein nahi aur koi purchase pending nahi. Pehle reel order karo.`;
      }
    }
  } else {
    // Can't guess reel size
    const deliveryDate = addBusinessDays(todayStr, prodDays);
    suggestion = { date: deliveryDate, type: 'generic', prodDays };
    reason = `ℹ️ Reel size auto-detect nahi hua. Sirf production time (${prodDays} din) ke basis pe suggest kar raha hoon.`;
  }

  showDeliverySuggestion(suggestion, reason, prodDays);
}

// ── Guess reel size from box size (heuristic) ──
// Box size format: L×W×H (e.g. 20×14×27)
// Reel width = L + W + ~2" for flutes — rough estimate
function guessReelSize(boxSize) {
  if (!boxSize) return null;
  const parts = boxSize.split(/[×xX]/).map(p => parseFloat(p.trim()));
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
  // Typically reel width = (L + W) inches + ~2" overlap
  // This is approximate — adjust if needed
  const needed = parts[0] + parts[1] + 2;
  // Find nearest available reel size from reelData
  const availableSizes = reelData.map(r => r.size).sort((a, b) => a - b);
  if (!availableSizes.length) {
    // Fall back to known critical sizes
    const defaults = [35.5, 42, 44];
    return defaults.find(s => s >= needed)?.toString() || null;
  }
  const match = availableSizes.find(s => s >= needed);
  return match ? match.toString() : null;
}

// ── Show Suggestion UI ──
function showDeliverySuggestion(suggestion, reason, prodDays) {
  const box = document.getElementById('delivery-suggestion-box');
  if (!box) return;

  const typeColor = suggestion.type === 'stock' ? 'var(--success)' :
                    suggestion.type === 'pending' ? '#B45309' : 'var(--danger)';

  box.style.display   = 'block';
  box.style.borderLeft = `4px solid ${typeColor}`;
  box.innerHTML = `
    <div style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:8px;">🎯 Suggested Delivery Date</div>
    <div style="font-size:12px;color:var(--text);margin-bottom:10px;">${reason}</div>
    ${suggestion.date ? `
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <div style="font-size:22px;font-weight:800;font-family:monospace;color:${typeColor}">
          ${formatDate(suggestion.date)}
        </div>
        <div style="font-size:11px;color:var(--muted)">
          Production: ${prodDays} din
          ${suggestion.reelArrival ? `<br>Reel arrives: ${formatDate(suggestion.reelArrival)}` : ''}
        </div>
        <button class="btn-primary" onclick="acceptSuggestion('${suggestion.date}')" style="padding:8px 16px;font-size:12px;">
          ✅ Yeh Date Use Karo
        </button>
      </div>
    ` : `
      <div style="font-size:13px;font-weight:600;color:var(--danger)">
        Date suggest nahi ho sakti. Pehle reel purchase karo aur expected delivery date daalo.
      </div>
    `}
  `;
}

function acceptSuggestion(dateStr) {
  document.getElementById('f-date').value = dateStr;
  hideSuggestion();
}

function hideSuggestion() {
  const box = document.getElementById('delivery-suggestion-box');
  if (box) box.style.display = 'none';
}

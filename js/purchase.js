// ══════════════════════════════════════════════════════════════
// PURCHASE.JS — Purchase Register (Reel Purchases + Rate History)
// ══════════════════════════════════════════════════════════════

const LS_PURCHASES = 'mi_purchases_v1';

// ── Data Structure ──
// {
//   id:               'PUR001',
//   supplier:         'Supplier Name',
//   reelSize:         '44',       // inches
//   gsm:              '120',
//   bf:               '22',
//   quantityKg:       500,
//   ratePerKg:        32.5,       // ₹ per kg
//   purchaseDate:     '2026-06-01',
//   expectedDelivery: '2026-06-05',
//   actualDelivery:   '',         // filled when received
//   paymentStatus:    'Unpaid',   // Unpaid | Partial | Paid
//   paidAmount:       0,
//   remarks:          '',
//   status:           'Pending',  // Pending | Received | Cancelled
// }

let purchases = [];

// ── Load / Save ──
function loadPurchases() {
  try {
    const stored = localStorage.getItem(LS_PURCHASES);
    if (stored) return JSON.parse(stored);
  } catch (e) {}
  return [];
}

function savePurchases(data) {
  localStorage.setItem(LS_PURCHASES, JSON.stringify(data));
}

function initPurchases() {
  purchases = loadPurchases();
}

// ── Generate ID ──
function generatePurchaseId() {
  let max = 0;
  purchases.forEach(p => {
    const m = p.id.match(/PUR(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1]));
  });
  return 'PUR' + String(max + 1).padStart(3, '0');
}

// ── Save Purchase ──
function savePurchase() {
  const supplier  = document.getElementById('pur-supplier').value.trim();
  const reelSize  = document.getElementById('pur-size').value.trim();
  const gsm       = document.getElementById('pur-gsm').value.trim();
  const bf        = document.getElementById('pur-bf').value.trim();
  const qty       = parseFloat(document.getElementById('pur-qty').value) || 0;
  const rate      = parseFloat(document.getElementById('pur-rate').value) || 0;
  const purDate   = document.getElementById('pur-date').value;
  const expDel    = document.getElementById('pur-expected-delivery').value;
  const payStatus = document.getElementById('pur-payment-status').value;
  const remarks   = document.getElementById('pur-remarks').value.trim();

  if (!supplier || !reelSize || !qty || !rate || !purDate) {
    alert('Supplier, Reel Size, Quantity, Rate aur Purchase Date required hai.');
    return;
  }

  const entry = {
    id:               generatePurchaseId(),
    supplier,
    reelSize,
    gsm,
    bf,
    quantityKg:       qty,
    ratePerKg:        rate,
    purchaseDate:     purDate,
    expectedDelivery: expDel,
    actualDelivery:   '',
    paymentStatus:    payStatus,
    paidAmount:       0,
    remarks,
    status:           'Pending',
  };

  purchases.push(entry);
  savePurchases(purchases);
  clearPurchaseForm();
  renderPurchaseList();
  renderRateHistory();
  alert(`✅ Purchase ${entry.id} saved!`);
}

// ── Mark Received ──
function markPurchaseReceived(id) {
  const idx = purchases.findIndex(p => p.id === id);
  if (idx < 0) return;
  const actual = prompt('Actual delivery date (YYYY-MM-DD):', todayStr);
  if (!actual) return;
  purchases[idx].status          = 'Received';
  purchases[idx].actualDelivery  = actual;
  savePurchases(purchases);
  renderPurchaseList();
  renderRateHistory();
}

// ── Mark Payment ──
function markPayment(id) {
  const idx = purchases.findIndex(p => p.id === id);
  if (idx < 0) return;
  const status = prompt('Payment status (Unpaid / Partial / Paid):', purchases[idx].paymentStatus);
  if (!status) return;
  purchases[idx].paymentStatus = status.trim();
  if (status === 'Partial') {
    const amt = parseFloat(prompt('Kitna paid hua (₹):') || '0');
    purchases[idx].paidAmount = amt;
  } else if (status === 'Paid') {
    purchases[idx].paidAmount = purchases[idx].quantityKg * purchases[idx].ratePerKg;
  }
  savePurchases(purchases);
  renderPurchaseList();
}

// ── Delete Purchase ──
function deletePurchase(id) {
  if (!confirm(`Delete ${id}?`)) return;
  purchases = purchases.filter(p => p.id !== id);
  savePurchases(purchases);
  renderPurchaseList();
  renderRateHistory();
}

// ── Clear Form ──
function clearPurchaseForm() {
  ['pur-supplier','pur-size','pur-gsm','pur-bf','pur-qty','pur-rate','pur-remarks','pur-expected-delivery'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const dateEl = document.getElementById('pur-date');
  if (dateEl) dateEl.value = todayStr;
  const payEl = document.getElementById('pur-payment-status');
  if (payEl) payEl.value = 'Unpaid';
  document.getElementById('pur-id-display').textContent = generatePurchaseId();
}

// ── Rate History per Reel Size ──
function getRateHistory(reelSize) {
  return purchases
    .filter(p => p.reelSize === reelSize && p.status !== 'Cancelled')
    .sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));
}

function getLatestRate(reelSize) {
  const hist = getRateHistory(reelSize);
  return hist.length ? hist[hist.length - 1].ratePerKg : null;
}

function getAvgRate(reelSize) {
  const hist = getRateHistory(reelSize);
  if (!hist.length) return null;
  return hist.reduce((s, p) => s + p.ratePerKg, 0) / hist.length;
}

// ── Get pending purchases for a reel size (expected delivery in future) ──
function getPendingDeliveries(reelSize) {
  return purchases.filter(p =>
    p.reelSize === reelSize &&
    p.status   === 'Pending' &&
    p.expectedDelivery &&
    p.expectedDelivery >= todayStr
  ).sort((a, b) => a.expectedDelivery.localeCompare(b.expectedDelivery));
}

// ── Render Purchase List ──
function renderPurchaseList() {
  const el = document.getElementById('purchase-list');
  if (!el) return;

  const filterSize   = document.getElementById('pur-filter-size')?.value   || '';
  const filterStatus = document.getElementById('pur-filter-status')?.value || '';

  let filtered = [...purchases].sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  if (filterSize)   filtered = filtered.filter(p => p.reelSize === filterSize);
  if (filterStatus) filtered = filtered.filter(p => p.status   === filterStatus);

  if (!filtered.length) {
    el.innerHTML = '<div class="empty-state">Koi purchase nahi mila.</div>';
    return;
  }

  el.innerHTML = '';
  filtered.forEach(p => {
    const totalAmt  = (p.quantityKg * p.ratePerKg).toLocaleString('en-IN', { maximumFractionDigits: 0 });
    const isPending = p.status === 'Pending';
    const isReceived= p.status === 'Received';
    const payColor  = p.paymentStatus === 'Paid' ? 'var(--success)' : p.paymentStatus === 'Partial' ? '#B45309' : 'var(--danger)';

    const card = document.createElement('div');
    card.className = 'purchase-card';
    card.style.cssText = `background:white;border-radius:12px;border:1px solid var(--border);border-left:4px solid ${isPending ? 'var(--warn)' : isReceived ? 'var(--success)' : '#ccc'};padding:16px 20px;margin-bottom:10px;`;

    card.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;">
        <div style="flex:1;min-width:200px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="font-family:monospace;font-size:11px;color:var(--muted)">${p.id}</span>
            <span style="font-size:12px;font-weight:700;padding:2px 8px;border-radius:20px;background:${isPending?'#FEF3C7':isReceived?'#DCFCE7':'#F3F4F6'};color:${isPending?'#92400E':isReceived?'var(--success)':'#6B7280'}">${p.status}</span>
            <span style="font-size:12px;font-weight:600;padding:2px 8px;border-radius:20px;background:#F3F4F6;color:${payColor}">${p.paymentStatus}</span>
          </div>
          <div style="font-size:15px;font-weight:700;color:var(--navy)">${p.supplier}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">
            ${p.reelSize}" reel · GSM ${p.gsm||'—'} · BF ${p.bf||'—'}
          </div>
        </div>
        <div style="display:flex;gap:20px;flex-wrap:wrap;">
          <div style="text-align:center;">
            <div style="font-size:18px;font-weight:700;font-family:monospace;color:var(--blue)">${p.quantityKg.toLocaleString('en-IN')}</div>
            <div style="font-size:10px;color:var(--muted)">kg</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:18px;font-weight:700;font-family:monospace;color:var(--navy)">₹${p.ratePerKg}</div>
            <div style="font-size:10px;color:var(--muted)">/kg</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:18px;font-weight:700;font-family:monospace;color:var(--success)">₹${totalAmt}</div>
            <div style="font-size:10px;color:var(--muted)">total</div>
          </div>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;flex-wrap:wrap;gap:8px;">
        <div style="font-size:11px;color:var(--muted);">
          📅 Purchase: ${formatDate(p.purchaseDate)}
          ${p.expectedDelivery ? ' · 🚚 Expected: ' + formatDate(p.expectedDelivery) : ''}
          ${p.actualDelivery   ? ' · ✅ Received: ' + formatDate(p.actualDelivery)   : ''}
          ${p.remarks ? ' · ' + p.remarks : ''}
        </div>
        <div style="display:flex;gap:6px;">
          ${isPending ? `<button class="btn-sm" style="color:var(--success)" onclick="markPurchaseReceived('${p.id}')">✅ Received</button>` : ''}
          <button class="btn-sm" onclick="markPayment('${p.id}')">💰 Payment</button>
          <button class="btn-sm" style="color:var(--danger)" onclick="deletePurchase('${p.id}')">🗑</button>
        </div>
      </div>
    `;
    el.appendChild(card);
  });
}

// ── Render Rate History Summary ──
function renderRateHistory() {
  const el = document.getElementById('rate-history-list');
  if (!el) return;

  // Collect unique reel sizes from purchases
  const sizes = [...new Set(purchases.map(p => p.reelSize))].sort((a, b) => parseFloat(b) - parseFloat(a));

  if (!sizes.length) {
    el.innerHTML = '<div class="empty-state">Abhi koi purchase record nahi. Pehle koi purchase add karo.</div>';
    return;
  }

  el.innerHTML = '';
  sizes.forEach(size => {
    const hist    = getRateHistory(size);
    const latest  = hist.length ? hist[hist.length - 1].ratePerKg : null;
    const avg     = getAvgRate(size);
    const min     = hist.length ? Math.min(...hist.map(p => p.ratePerKg)) : null;
    const max     = hist.length ? Math.max(...hist.map(p => p.ratePerKg)) : null;
    const trend   = hist.length >= 2 ? (hist[hist.length-1].ratePerKg - hist[hist.length-2].ratePerKg) : 0;
    const trendIcon = trend > 0 ? '📈' : trend < 0 ? '📉' : '➡️';

    const section = document.createElement('div');
    section.style.cssText = 'background:white;border-radius:12px;border:1px solid var(--border);padding:16px 20px;margin-bottom:12px;';

    // History rows
    const histRows = hist.slice().reverse().slice(0, 5).map(p => `
      <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px;">
        <span style="color:var(--muted)">${formatDate(p.purchaseDate)}</span>
        <span style="color:var(--muted)">${p.supplier}</span>
        <span style="font-weight:600;color:var(--navy)">₹${p.ratePerKg}/kg</span>
        <span style="color:var(--muted)">${p.quantityKg.toLocaleString('en-IN')} kg</span>
      </div>
    `).join('');

    section.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <div style="font-size:16px;font-weight:700;color:var(--navy)">${size}" Reel ${trendIcon}</div>
        <div style="display:flex;gap:16px;">
          <div style="text-align:center;">
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:var(--blue)">₹${latest?.toFixed(2)||'—'}</div>
            <div style="font-size:10px;color:var(--muted)">Latest Rate</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:var(--muted)">₹${avg?.toFixed(2)||'—'}</div>
            <div style="font-size:10px;color:var(--muted)">Avg Rate</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:13px;font-weight:700;font-family:monospace;color:var(--success)">₹${min?.toFixed(2)||'—'}</div>
            <div style="font-size:10px;color:var(--muted)">Min</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:13px;font-weight:700;font-family:monospace;color:var(--danger)">₹${max?.toFixed(2)||'—'}</div>
            <div style="font-size:10px;color:var(--muted)">Max</div>
          </div>
        </div>
      </div>
      <div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Last ${Math.min(hist.length,5)} Purchases</div>
      ${histRows || '<div style="font-size:12px;color:var(--muted)">Koi record nahi</div>'}
    `;
    el.appendChild(section);
  });
}

// ── Init Purchase form date ──
function initPurchaseForm() {
  const dateEl = document.getElementById('pur-date');
  if (dateEl) dateEl.value = todayStr;
  const idEl = document.getElementById('pur-id-display');
  if (idEl) idEl.textContent = generatePurchaseId();
}

// ══════════════════════════════════════════════════════════════
// TALLY-SYNC.JS — Read TallySync sheet and render dashboard
// ══════════════════════════════════════════════════════════════

let tallyRows = [];

async function fetchTallySync() {
  const el = document.getElementById('tally-sync-list');
  if (!el) return;
  el.innerHTML = '<div class="empty-state">Loading Tally data...</div>';

  const range = encodeURIComponent(`${TALLY_SYNC_TAB}!A1:I500`);
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${ORDERS_SHEET_ID}/values/${range}?key=${API_KEY}`;

  try {
    const res  = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);

    const rows = json.values || [];
    if (rows.length < 2) {
      tallyRows = [];
      renderTallySync();
      return;
    }

    // Skip header row; map to objects
    tallyRows = rows.slice(1).map(r => ({
      syncedAt:   r[0] || '',
      date:       r[1] || '',
      type:       r[2] || '',
      voucherNo:  r[3] || '',
      party:      r[4] || '',
      amount:     parseFloat(r[5]) || 0,
      narration:  r[6] || '',
      orderId:    r[7] || '',
      matchStatus:r[8] || 'Unmatched',
    }));

    renderTallySync();
  } catch (err) {
    el.innerHTML = `<div class="empty-state" style="color:var(--danger)">Error loading Tally data: ${err.message}</div>`;
  }
}

function renderTallySync() {
  const el = document.getElementById('tally-sync-list');
  if (!el) return;

  if (!tallyRows.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div style="font-size:32px;margin-bottom:12px">📊</div>
        <div style="font-weight:600;margin-bottom:6px">No Tally data synced yet</div>
        <div style="font-size:12px;color:var(--muted)">Run <code style="background:var(--border);padding:2px 6px;border-radius:4px">node scripts/fetch-tally.js</code> on the Tally PC to start syncing.</div>
      </div>`;
    return;
  }

  // Summary stats
  const sales        = tallyRows.filter(r => r.type === 'Sales');
  const totalAmount  = sales.reduce((s, r) => s + r.amount, 0);
  const autoMatched  = sales.filter(r => r.matchStatus === 'Auto-matched').length;
  const unmatched    = sales.filter(r => r.matchStatus === 'Unmatched').length;

  // Date filter state
  const filterVal = document.getElementById('tally-filter-date')?.value || '';
  const visible   = filterVal
    ? tallyRows.filter(r => r.date === filterVal)
    : tallyRows;

  el.innerHTML = `
    <!-- Stats row -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
      ${statCard('Total Sales Synced', sales.length + ' vouchers', 'var(--blue)')}
      ${statCard('Auto-matched Orders', autoMatched, 'var(--success)')}
      ${statCard('Unmatched', unmatched, unmatched > 0 ? 'var(--warning)' : 'var(--muted)')}
    </div>

    <!-- Filter -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <label style="font-size:12px;font-weight:600;color:var(--muted)">Filter by date:</label>
      <input type="date" id="tally-filter-date" class="form-input"
        style="width:160px;font-size:13px" value="${filterVal}"
        onchange="renderTallySync()">
      ${filterVal ? `<button class="btn-secondary" style="font-size:12px;padding:5px 10px" onclick="document.getElementById('tally-filter-date').value='';renderTallySync()">✕ Clear</button>` : ''}
      <div style="margin-left:auto;font-size:12px;color:var(--muted)">${visible.length} row(s)</div>
    </div>

    <!-- Table -->
    ${visible.length === 0 ? '<div class="empty-state">No records for this date.</div>' : `
    <div class="table-wrap">
      <div class="table-header" style="grid-template-columns:90px 100px 1fr 110px 90px 110px">
        <div>Date</div><div>Voucher No.</div><div>Party (Customer)</div>
        <div style="text-align:right">Amount</div><div>Order ID</div><div>Status</div>
      </div>
      ${visible.map(r => `
        <div class="table-row" style="grid-template-columns:90px 100px 1fr 110px 90px 110px;align-items:center">
          <div style="font-size:12px;color:var(--muted)">${formatDateShort(r.date)}</div>
          <div style="font-family:monospace;font-size:11px">${r.voucherNo || '—'}</div>
          <div>
            <div style="font-weight:600;font-size:13px">${r.party || '—'}</div>
            ${r.narration ? `<div style="font-size:11px;color:var(--muted)">${r.narration.slice(0,60)}</div>` : ''}
          </div>
          <div style="text-align:right;font-weight:600;font-size:13px">₹${r.amount.toLocaleString('en-IN')}</div>
          <div style="font-family:monospace;font-size:11px;color:var(--blue)">${r.orderId || '—'}</div>
          <div>${matchBadge(r.matchStatus)}</div>
        </div>
      `).join('')}
    </div>`}

    <!-- Last sync note -->
    ${tallyRows.length ? `<div style="font-size:11px;color:var(--muted);margin-top:12px;text-align:right">Last synced: ${tallyRows[tallyRows.length-1].syncedAt}</div>` : ''}
  `;
}

function statCard(label, value, color) {
  return `
    <div class="stat-card" style="border-top-color:${color}">
      <div class="stat-value" style="color:${color}">${value}</div>
      <div class="stat-label">${label}</div>
    </div>`;
}

function matchBadge(status) {
  if (status === 'Auto-matched') {
    return `<span class="status-tag status-delivered" style="font-size:10px">✓ Matched</span>`;
  }
  return `<span class="status-tag status-new" style="font-size:10px;background:#FEF3C7;color:#92400E">Unmatched</span>`;
}

function formatDateShort(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch { return iso; }
}

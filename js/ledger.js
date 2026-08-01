// ══════════════════════════════════════════════════════════════
// LEDGER.JS — Party khata (account statement)
// Debits  = invoices raised (invoices.js, localStorage)
// Credits = payments received (receivables.js, localStorage)
// Balance = invoiced − received  (positive → party owes us)
// ══════════════════════════════════════════════════════════════

let _ledgerParty = '';

function _ledgerInvoices() {
  try { return JSON.parse(localStorage.getItem(LS_INVOICES) || '[]'); } catch (e) { return []; }
}
function _ledgerPayments() {
  try { return JSON.parse(localStorage.getItem(LS_PAYMENTS) || '[]'); } catch (e) { return []; }
}

function _ledgerParties() {
  const names = new Set();
  _ledgerInvoices().forEach(i => i.party && names.add(i.party.trim()));
  _ledgerPayments().forEach(p => p.customer && names.add(p.customer.trim()));
  if (typeof CLIENTS !== 'undefined') CLIENTS.forEach(c => c.name && names.add(c.name.trim()));
  if (typeof orders !== 'undefined') orders.forEach(o => o.customer && names.add(o.customer.trim()));
  return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function _inr(n) { return '₹' + Math.round(n).toLocaleString('en-IN'); }

function ledgerSelectParty(name) {
  _ledgerParty = name || '';
  renderLedger();
}

function renderLedger() {
  const root = document.getElementById('ledger-root');
  if (!root) return;

  const parties = _ledgerParties();
  const selector = `
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      <select class="form-select" style="max-width:320px" onchange="ledgerSelectParty(this.value)">
        <option value="">— All parties (summary) —</option>
        ${parties.map(p => `<option value="${p.replace(/"/g,'&quot;')}"${p === _ledgerParty ? ' selected' : ''}>${p}</option>`).join('')}
      </select>
      ${_ledgerParty ? `<button class="btn-secondary" style="font-size:11px;padding:5px 12px" onclick="ledgerSelectParty('')">← All parties</button>` : ''}
    </div>`;

  root.innerHTML = selector + (_ledgerParty ? _ledgerStatementHtml(_ledgerParty) : _ledgerSummaryHtml());
}

// ── All-parties summary ──
function _ledgerSummaryHtml() {
  const invoices = _ledgerInvoices();
  const payments = _ledgerPayments();
  const rows = _ledgerParties().map(name => {
    const inv = invoices.filter(i => (i.party || '').trim().toLowerCase() === name.toLowerCase());
    const pay = payments.filter(p => (p.customer || '').trim().toLowerCase() === name.toLowerCase());
    const invoiced = inv.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
    const received = pay.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const dates = [...inv.map(i => i.date), ...pay.map(p => p.date)].filter(Boolean).sort();
    return { name, invoiced, received, balance: invoiced - received, last: dates[dates.length - 1] || '', txns: inv.length + pay.length };
  }).filter(r => r.txns > 0 || r.balance !== 0);

  if (!rows.length) return '<div class="empty-state">No invoices or payments recorded yet. Create entries from the Invoicing / Receivables pages and the ledger will build up here.</div>';

  rows.sort((a, b) => b.balance - a.balance);
  const totInv = rows.reduce((s, r) => s + r.invoiced, 0);
  const totRec = rows.reduce((s, r) => s + r.received, 0);

  return `
    <div class="add-order-form" style="margin-bottom:12px;display:flex;gap:24px;flex-wrap:wrap">
      <div><div class="form-label">Parties</div><div style="font-size:20px;font-weight:700">${rows.length}</div></div>
      <div><div class="form-label">Total invoiced</div><div style="font-size:20px;font-weight:700">${_inr(totInv)}</div></div>
      <div><div class="form-label">Total received</div><div style="font-size:20px;font-weight:700">${_inr(totRec)}</div></div>
      <div><div class="form-label">Outstanding</div><div style="font-size:20px;font-weight:700;color:${totInv - totRec > 0 ? 'var(--danger)' : 'var(--success)'}">${_inr(totInv - totRec)}</div></div>
    </div>
    <div class="data-table-wrap"><div class="data-table-scroll">
    <table class="data-table">
      <thead><tr>
        <th>Party</th><th class="num">Invoiced</th><th class="num">Received</th><th class="num">Balance</th><th>Last activity</th>
      </tr></thead><tbody>` +
    rows.map(r => `
      <tr style="cursor:pointer" onclick="ledgerSelectParty('${r.name.replace(/'/g, "\\'")}')">
        <td style="font-weight:600">${r.name}</td>
        <td class="num">${_inr(r.invoiced)}</td>
        <td class="num">${_inr(r.received)}</td>
        <td class="num" style="font-weight:700;color:${r.balance > 0 ? 'var(--danger)' : r.balance < 0 ? 'var(--warn)' : 'var(--success)'}">${_inr(r.balance)}</td>
        <td style="color:var(--muted)">${r.last ? formatDate(r.last) : '—'}</td>
      </tr>`).join('') + `
    </tbody></table></div></div>
    <div class="field-hint" style="margin-top:8px">Click a party to open their full statement. Red balance = party owes you; orange = advance / excess payment.</div>`;
}

// ── Single-party statement ──
function _ledgerStatementHtml(party) {
  const pl = party.toLowerCase();
  const inv = _ledgerInvoices().filter(i => (i.party || '').trim().toLowerCase() === pl);
  const pay = _ledgerPayments().filter(p => (p.customer || '').trim().toLowerCase() === pl);

  const entries = [
    ...inv.map(i => ({
      date: i.date || '', sort2: 0, ref: i.id,
      particulars: `🧾 Invoice ${i.id}${i.items ? ` — ${(Array.isArray(i.items) ? i.items.map(x => x.desc).filter(Boolean).join(', ') : i.items)}`.slice(0, 60) : ''}`,
      debit: parseFloat(i.total) || 0, credit: 0,
    })),
    ...pay.map(p => ({
      date: p.date || '', sort2: 1, ref: p.id,
      particulars: `💰 Payment received${p.note ? ' — ' + p.note : ''}`,
      debit: 0, credit: parseFloat(p.amount) || 0,
    })),
  ].sort((a, b) => (a.date + a.sort2).localeCompare(b.date + b.sort2));

  if (!entries.length) {
    // party exists in clients/orders but has no financial entries yet
    const activeOrders = (typeof orders !== 'undefined' ? orders : []).filter(o => (o.customer || '').trim().toLowerCase() === pl && !['Cancelled'].includes(o.status));
    return `<div class="empty-state">${party} has no invoices or payments yet.${activeOrders.length ? `<br>${activeOrders.length} order(s) are in the pipeline — the ledger starts as soon as you raise an invoice.` : ''}</div>`;
  }

  let bal = 0;
  const rowsHtml = entries.map(e => {
    bal += e.debit - e.credit;
    return `<tr>
      <td style="white-space:nowrap">${e.date ? formatDate(e.date) : '—'}</td>
      <td>${e.particulars}</td>
      <td class="num">${e.debit ? _inr(e.debit) : ''}</td>
      <td class="num">${e.credit ? _inr(e.credit) : ''}</td>
      <td class="num" style="font-weight:600;color:${bal > 0 ? 'var(--danger)' : 'inherit'}">${_inr(bal)}</td>
    </tr>`;
  }).join('');

  const totD = entries.reduce((s, e) => s + e.debit, 0);
  const totC = entries.reduce((s, e) => s + e.credit, 0);

  return `
    <div class="add-order-form" style="margin-bottom:12px;display:flex;gap:24px;flex-wrap:wrap;align-items:center">
      <div style="font-size:16px;font-weight:700">${party}</div>
      <div><div class="form-label">Invoiced</div><div style="font-size:18px;font-weight:700">${_inr(totD)}</div></div>
      <div><div class="form-label">Received</div><div style="font-size:18px;font-weight:700">${_inr(totC)}</div></div>
      <div><div class="form-label">Balance</div><div style="font-size:18px;font-weight:700;color:${totD - totC > 0 ? 'var(--danger)' : 'var(--success)'}">${_inr(totD - totC)} ${totD - totC > 0 ? 'receivable' : totD - totC < 0 ? 'advance' : '✓ settled'}</div></div>
      <button class="btn-secondary" style="font-size:11px;padding:5px 12px;margin-left:auto" onclick="window.print()">🖨 Print</button>
    </div>
    <div class="data-table-wrap"><div class="data-table-scroll">
    <table class="data-table">
      <thead><tr>
        <th>Date</th><th>Particulars</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th>
      </tr></thead><tbody>${rowsHtml}</tbody></table></div></div>`;
}

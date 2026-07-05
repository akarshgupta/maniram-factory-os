// ══════════════════════════════════════════════════════════════
// EXPENSES.JS — Expense Tracker (factory operating expenses)
// Reel purchases live in the Purchase Register; this tracks every
// other outflow: wages, power, rent, transport, maintenance, etc.
// localStorage-backed (key: mi_expenses_v1).
// ══════════════════════════════════════════════════════════════

const LS_EXPENSES = 'mi_expenses_v1';
let expenseList   = [];
let _expEditingId = null;

const EXPENSE_CATEGORIES = [
  { key: 'Wages / Labour',   icon: '👷' },
  { key: 'Electricity',      icon: '⚡' },
  { key: 'Rent',             icon: '🏠' },
  { key: 'Transport / Freight', icon: '🚚' },
  { key: 'Fuel / Diesel',    icon: '⛽' },
  { key: 'Maintenance / Repair', icon: '🔧' },
  { key: 'Raw Material (non-reel)', icon: '📦' },
  { key: 'Gum / Stitching / Consumables', icon: '🧴' },
  { key: 'Office / Admin',   icon: '🖊️' },
  { key: 'GST / Tax',        icon: '🧾' },
  { key: 'Loan / Interest',  icon: '🏦' },
  { key: 'Misc',             icon: '📌' },
];

const EXPENSE_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card'];

function _catIcon(cat) {
  const c = EXPENSE_CATEGORIES.find(x => x.key === cat);
  return c ? c.icon : '📌';
}

function loadExpenses() { try { return JSON.parse(localStorage.getItem(LS_EXPENSES) || '[]'); } catch { return []; } }
function saveExpenseList() { localStorage.setItem(LS_EXPENSES, JSON.stringify(expenseList)); }
function initExpenses() { expenseList = loadExpenses(); }

function generateExpenseId() {
  let max = 0;
  expenseList.forEach(e => {
    const m = String(e.id || '').match(/EXP(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1]));
  });
  return 'EXP' + String(max + 1).padStart(3, '0');
}

// ── Filters ──
function _expMonth()  { return document.getElementById('exp-filter-month')?.value    || _thisMonth(); }
function _expCatFlt() { return document.getElementById('exp-filter-cat')?.value       || ''; }
function _thisMonth() { return new Date().toISOString().slice(0, 7); } // YYYY-MM

function expensesInMonth(ym) {
  return expenseList.filter(e => (e.date || '').slice(0, 7) === ym);
}

// ── Save / edit / delete ──
function saveExpense() {
  const date   = document.getElementById('exp-date')?.value;
  const cat    = document.getElementById('exp-cat')?.value;
  const payee  = (document.getElementById('exp-payee')?.value || '').trim();
  const amount = parseFloat(document.getElementById('exp-amount')?.value) || 0;
  const mode   = document.getElementById('exp-mode')?.value || 'Cash';
  const notes  = (document.getElementById('exp-notes')?.value || '').trim();

  if (!date)       { alert('Please pick a date.'); return; }
  if (!cat)        { alert('Please choose a category.'); return; }
  if (amount <= 0) { alert('Please enter an amount greater than 0.'); return; }

  let rec;
  if (_expEditingId) {
    const idx = expenseList.findIndex(e => e.id === _expEditingId);
    if (idx >= 0) {
      expenseList[idx] = { ...expenseList[idx], date, category: cat, payee, amount, mode, notes };
      rec = expenseList[idx];
    }
    _expEditingId = null;
  } else {
    rec = {
      id: generateExpenseId(), date, category: cat, payee, amount, mode, notes,
      createdAt: new Date().toISOString(),
    };
    expenseList.unshift(rec);
  }
  saveExpenseList();
  if (rec && typeof mirrorToSheet === 'function') {
    mirrorToSheet('saveExpense', {
      id: rec.id, date: rec.date, category: rec.category, payee: rec.payee,
      amount: rec.amount, mode: rec.mode, notes: rec.notes,
    });
  }
  renderExpensesPage();
}

function editExpense(id) {
  const e = expenseList.find(x => x.id === id);
  if (!e) return;
  _expEditingId = id;
  renderExpensesPage();
  // Populate the form after re-render
  const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };
  set('exp-date', e.date);
  set('exp-cat', e.category);
  set('exp-payee', e.payee || '');
  set('exp-amount', e.amount);
  set('exp-mode', e.mode || 'Cash');
  set('exp-notes', e.notes || '');
  const form = document.getElementById('exp-form-card');
  if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEditExpense() {
  _expEditingId = null;
  renderExpensesPage();
}

function deleteExpense(id) {
  const e = expenseList.find(x => x.id === id);
  if (!e) return;
  if (!confirm(`Delete this ₹${e.amount.toLocaleString('en-IN')} ${e.category} expense?`)) return;
  expenseList = expenseList.filter(x => x.id !== id);
  saveExpenseList();
  if (typeof mirrorToSheet === 'function') mirrorToSheet('deleteExpense', { id });
  renderExpensesPage();
}

// ── Render ──
function renderExpensesPage() {
  const el = document.getElementById('expenses-page-content');
  if (!el) return;

  const fmt0  = n => '₹' + Math.round(n).toLocaleString('en-IN');
  const ym    = _expMonth();
  const catF  = _expCatFlt();
  const editing = _expEditingId ? expenseList.find(e => e.id === _expEditingId) : null;

  const monthRows = expensesInMonth(ym);
  const monthTotal = monthRows.reduce((s, e) => s + e.amount, 0);
  const allTotal   = expenseList.reduce((s, e) => s + e.amount, 0);

  // Category breakdown for the month
  const byCat = {};
  monthRows.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
  const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const topCat = catEntries.length ? catEntries[0][0] : '—';
  const maxCat = catEntries.length ? catEntries[0][1] : 1;

  const monthLabel = (() => {
    try { return new Date(ym + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); }
    catch { return ym; }
  })();

  // Filtered list (month + optional category)
  let listRows = monthRows.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (catF) listRows = listRows.filter(e => e.category === catF);

  el.innerHTML = `
    <!-- Stats -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px">
      <div class="stat-card" style="border-top-color:var(--danger)">
        <div class="stat-value" style="color:var(--danger)">${fmt0(monthTotal)}</div>
        <div class="stat-label">${monthLabel} Spend</div>
      </div>
      <div class="stat-card" style="border-top-color:var(--navy)">
        <div class="stat-value">${monthRows.length}</div>
        <div class="stat-label">Entries this month</div>
      </div>
      <div class="stat-card" style="border-top-color:var(--blue)">
        <div class="stat-value" style="font-size:15px">${_catIcon(topCat)} ${topCat}</div>
        <div class="stat-label">Top category</div>
      </div>
      <div class="stat-card" style="border-top-color:var(--muted)">
        <div class="stat-value" style="color:var(--muted)">${fmt0(allTotal)}</div>
        <div class="stat-label">All-time total</div>
      </div>
    </div>

    <!-- Add / edit form -->
    <div class="add-order-form" id="exp-form-card" style="${editing ? 'border:1.5px solid var(--blue)' : ''}">
      <div class="form-title">${editing ? '✏️ Edit Expense ' + editing.id : '➕ Add Expense'}</div>
      <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
        <div class="form-group">
          <label class="form-label">Date</label>
          <input class="form-input" type="date" id="exp-date">
        </div>
        <div class="form-group">
          <label class="form-label">Category</label>
          <select class="form-select" id="exp-cat">
            ${EXPENSE_CATEGORIES.map(c => `<option value="${c.key}">${c.icon} ${c.key}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Paid To / Description</label>
          <input class="form-input" type="text" id="exp-payee" placeholder="e.g. Ramesh (labour), UPPCL…">
        </div>
        <div class="form-group">
          <label class="form-label">Amount (₹)</label>
          <input class="form-input" type="number" id="exp-amount" placeholder="0" step="0.01">
        </div>
        <div class="form-group">
          <label class="form-label">Paid Via</label>
          <select class="form-select" id="exp-mode">
            ${EXPENSE_MODES.map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Notes <span style="font-weight:400;text-transform:none;color:var(--muted)">(optional)</span></label>
          <input class="form-input" type="text" id="exp-notes" placeholder="any note">
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
        <button class="btn-primary" onclick="saveExpense()">${editing ? '💾 Update Expense' : '💾 Save Expense'}</button>
        ${editing ? `<button class="btn-secondary" onclick="cancelEditExpense()">✖ Cancel</button>` : ''}
      </div>
    </div>

    <!-- Category breakdown -->
    ${catEntries.length ? `
    <div class="card" style="margin-top:16px"><div class="card-body">
      <div style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:10px">${monthLabel} — by Category</div>
      ${catEntries.map(([cat, amt]) => `
        <div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
            <span>${_catIcon(cat)} ${cat}</span>
            <span style="font-weight:700">${fmt0(amt)} <span style="color:var(--muted);font-weight:400">· ${Math.round(amt / monthTotal * 100)}%</span></span>
          </div>
          <div style="background:var(--border);border-radius:3px;height:6px;width:100%">
            <div style="background:var(--blue);height:6px;border-radius:3px;width:${Math.round(amt / maxCat * 100)}%"></div>
          </div>
        </div>`).join('')}
    </div></div>` : ''}

    <!-- Filters + list -->
    <div style="display:flex;align-items:center;gap:10px;margin:16px 0 12px;flex-wrap:wrap">
      <label style="font-size:12px;font-weight:600;color:var(--muted)">Month:</label>
      <input type="month" id="exp-filter-month" class="form-input" style="width:160px;font-size:13px" value="${ym}" onchange="renderExpensesPage()">
      <label style="font-size:12px;font-weight:600;color:var(--muted)">Category:</label>
      <select id="exp-filter-cat" class="form-select" style="width:auto;font-size:13px" onchange="renderExpensesPage()">
        <option value="">All</option>
        ${EXPENSE_CATEGORIES.map(c => `<option value="${c.key}"${c.key === catF ? ' selected' : ''}>${c.icon} ${c.key}</option>`).join('')}
      </select>
      <div style="margin-left:auto;font-size:12px;color:var(--muted)">${listRows.length} entr${listRows.length === 1 ? 'y' : 'ies'}</div>
    </div>

    ${listRows.length === 0
      ? '<div class="empty-state">No expenses for this month. Add one above.</div>'
      : `<div class="card"><div class="card-body" style="padding:0">
          <div class="orders-table">
            <div class="table-header" style="grid-template-columns:90px 1.4fr 1fr 100px 110px 70px">
              <div>Date</div><div>Category</div><div>Paid To</div><div>Mode</div><div style="text-align:right">Amount</div><div></div>
            </div>
            ${listRows.map(e => {
              const dd = (() => { try { return new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); } catch { return e.date; } })();
              return `
              <div class="table-row" style="grid-template-columns:90px 1.4fr 1fr 100px 110px 70px;align-items:center">
                <div style="font-size:12px">${dd}</div>
                <div style="font-size:12px;font-weight:600">${_catIcon(e.category)} ${e.category}</div>
                <div style="font-size:12px;color:var(--muted);padding-right:10px;overflow:hidden;text-overflow:ellipsis">${e.payee || '—'}${e.notes ? `<div style="font-size:10px">${e.notes}</div>` : ''}</div>
                <div style="font-size:11px">${e.mode || '—'}</div>
                <div style="font-size:13px;font-weight:700;color:var(--danger);text-align:right">${fmt0(e.amount)}</div>
                <div style="display:flex;gap:5px;justify-content:flex-end">
                  <button class="btn-secondary" style="font-size:10px;padding:3px 6px" onclick="editExpense('${e.id}')" title="Edit">✏️</button>
                  <button style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--danger)" onclick="deleteExpense('${e.id}')" title="Delete">🗑</button>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div></div>`
    }
  `;

  // Default the form date to today when adding a fresh entry
  if (!editing) {
    const d = document.getElementById('exp-date');
    if (d && !d.value) d.value = new Date().toISOString().slice(0, 10);
  }
}

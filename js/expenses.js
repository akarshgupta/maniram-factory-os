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
  { key: 'Loading Charges',  icon: '🏗️' },
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

// ── Vehicle Owner loading-charge rates ──
// Most vehicle owners charge the same fixed loading rate on every trip, so
// this is a small name→rate master (localStorage-backed, mirrored to its
// own auto-created sheet tab like gsmSet/processLogAppend). Picking a
// Category of "Loading Charges" turns the Paid To field into an
// autocomplete against this list and auto-fills Amount from the match —
// still a plain editable number afterward, for the "in some case it must
// be editable" trips that differ from the usual rate.
const LS_VEHICLE_OWNERS = 'mi_vehicle_owners_v1';
let vehicleOwners = [];
let _voFiltered    = [];
let _voSelectedIdx = -1;

function loadVehicleOwners()    { try { return JSON.parse(localStorage.getItem(LS_VEHICLE_OWNERS) || '[]'); } catch { return []; } }
function saveVehicleOwnersList(){ localStorage.setItem(LS_VEHICLE_OWNERS, JSON.stringify(vehicleOwners)); }
function initVehicleOwners()    { vehicleOwners = loadVehicleOwners().sort((a, b) => a.name.localeCompare(b.name)); }

// Exact match first; falls back to substring-either-way like matchesSearch
// elsewhere, so "Ramesh" finds "Ramesh Transport Co." and vice versa.
function findVehicleOwnerRate(typed) {
  const n = (typed || '').trim().toLowerCase();
  if (!n) return null;
  const exact = vehicleOwners.find(v => v.name.toLowerCase() === n);
  if (exact) return exact;
  return vehicleOwners.find(v => {
    const vl = v.name.toLowerCase();
    return vl.includes(n) || n.includes(vl);
  }) || null;
}

let _voEditingIdx  = -1;    // -1 = adding new
let _voSectionOpen = false; // <details> resets closed on every re-render by default — track it so
                             // clicking Edit doesn't immediately hide the form it just populated

function saveVehicleOwnerRateForm() {
  const name = (document.getElementById('vo-name')?.value || '').trim();
  const rate = parseFloat(document.getElementById('vo-rate')?.value) || 0;
  if (!name) { alert("Enter the vehicle owner's name."); return; }
  if (rate <= 0) { alert('Enter a rate greater than 0.'); return; }

  const idx = vehicleOwners.findIndex((v, i) => i !== _voEditingIdx && v.name.toLowerCase() === name.toLowerCase());
  if (idx >= 0) { alert(`${vehicleOwners[idx].name} already has a rate on file — edit that entry instead.`); return; }

  if (_voEditingIdx >= 0) vehicleOwners[_voEditingIdx] = { name, rate };
  else vehicleOwners.push({ name, rate });
  vehicleOwners.sort((a, b) => a.name.localeCompare(b.name));
  saveVehicleOwnersList();
  if (typeof mirrorToSheet === 'function') mirrorToSheet('saveVehicleOwnerRate', { name, rate });
  _voEditingIdx = -1;
  _voSectionOpen = true;
  renderExpensesPage();
}

function editVehicleOwnerRate(idx) {
  const v = vehicleOwners[idx];
  if (!v) return;
  _voEditingIdx = idx;
  _voSectionOpen = true;
  renderExpensesPage();
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('vo-name', v.name);
  set('vo-rate', v.rate);
}

function cancelEditVehicleOwnerRate() {
  _voEditingIdx = -1;
  renderExpensesPage();
}

function deleteVehicleOwnerRate(idx) {
  const v = vehicleOwners[idx];
  if (!v) return;
  if (!confirm(`Delete the fixed loading rate for "${v.name}"?`)) return;
  vehicleOwners.splice(idx, 1);
  saveVehicleOwnersList();
  if (typeof mirrorToSheet === 'function') mirrorToSheet('deleteVehicleOwnerRate', { name: v.name });
  if (_voEditingIdx === idx) _voEditingIdx = -1;
  _voSectionOpen = true;
  renderExpensesPage();
}

function toggleVehicleOwnersSection(detailsEl) {
  _voSectionOpen = !!detailsEl?.open;
}

// ── Paid To autocomplete + auto-fill, active only for Loading Charges ──
function onExpCatChange() {
  const hint = document.getElementById('exp-payee-hint');
  if (!hint) return;
  const cat = document.getElementById('exp-cat')?.value;
  hint.textContent = cat === 'Loading Charges'
    ? "Type the vehicle owner's name — their fixed rate auto-fills below."
    : '';
  const dd = document.getElementById('exp-payee-dropdown');
  if (dd && cat !== 'Loading Charges') dd.style.display = 'none';
}

function onExpPayeeInput() {
  const cat = document.getElementById('exp-cat')?.value;
  const val = document.getElementById('exp-payee')?.value.trim() || '';
  const dd  = document.getElementById('exp-payee-dropdown');

  if (cat === 'Loading Charges' && dd) {
    _voFiltered    = val ? vehicleOwners.filter(v => v.name.toLowerCase().includes(val.toLowerCase())) : vehicleOwners;
    _voSelectedIdx = -1;
    if (!_voFiltered.length) {
      dd.style.display = 'none';
    } else {
      dd.innerHTML = '';
      _voFiltered.forEach(v => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.innerHTML = `${v.name} <span style="float:right;color:var(--muted)">₹${v.rate}</span>`;
        item.onmousedown = () => selectVehicleOwner(v.name);
        dd.appendChild(item);
      });
      dd.style.display = 'block';
    }
  } else if (dd) {
    dd.style.display = 'none';
  }
  _applyVehicleOwnerRate(val);
}

function onExpPayeeKey(e) {
  const cat = document.getElementById('exp-cat')?.value;
  if (cat !== 'Loading Charges') return;
  const dd    = document.getElementById('exp-payee-dropdown');
  const items = dd ? dd.querySelectorAll('.autocomplete-item') : [];
  if (e.key === 'ArrowDown') {
    _voSelectedIdx = Math.min(_voSelectedIdx + 1, _voFiltered.length - 1);
    items.forEach((el, i) => el.classList.toggle('selected', i === _voSelectedIdx));
    e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    _voSelectedIdx = Math.max(_voSelectedIdx - 1, 0);
    items.forEach((el, i) => el.classList.toggle('selected', i === _voSelectedIdx));
    e.preventDefault();
  } else if (e.key === 'Enter') {
    if (_voSelectedIdx >= 0 && _voFiltered[_voSelectedIdx]) selectVehicleOwner(_voFiltered[_voSelectedIdx].name);
    e.preventDefault();
  } else if (e.key === 'Escape') {
    if (dd) dd.style.display = 'none';
  }
}

function selectVehicleOwner(name) {
  const payeeEl = document.getElementById('exp-payee');
  if (payeeEl) payeeEl.value = name;
  const dd = document.getElementById('exp-payee-dropdown');
  if (dd) dd.style.display = 'none';
  _applyVehicleOwnerRate(name);
}

function _applyVehicleOwnerRate(typed) {
  const cat  = document.getElementById('exp-cat')?.value;
  const hint = document.getElementById('exp-payee-hint');
  if (cat !== 'Loading Charges') return;
  const match  = findVehicleOwnerRate(typed);
  const amtEl  = document.getElementById('exp-amount');
  if (match) {
    if (amtEl) amtEl.value = match.rate;
    if (hint) hint.innerHTML = `Auto-filled from <b>${match.name}</b>'s fixed rate — edit Amount above if this trip differs.`;
  } else if (hint) {
    hint.textContent = typed
      ? "No fixed rate on file for this name yet — add one below and it'll auto-fill next time."
      : "Type the vehicle owner's name — their fixed rate auto-fills below.";
  }
}

document.addEventListener('click', e => {
  const grp = document.getElementById('exp-payee')?.closest('.form-group');
  if (grp && !grp.contains(e.target)) {
    const dd = document.getElementById('exp-payee-dropdown');
    if (dd) dd.style.display = 'none';
  }
});

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
  onExpCatChange();
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
          <select class="form-select" id="exp-cat" onchange="onExpCatChange()">
            ${EXPENSE_CATEGORIES.map(c => `<option value="${c.key}">${c.icon} ${c.key}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Paid To / Description</label>
          <input class="form-input" type="text" id="exp-payee" placeholder="e.g. Ramesh (labour), UPPCL…" autocomplete="off" oninput="onExpPayeeInput()" onkeydown="onExpPayeeKey(event)" onfocus="onExpPayeeInput()">
          <div class="autocomplete-list" id="exp-payee-dropdown" style="display:none"></div>
          <div class="field-hint" id="exp-payee-hint"></div>
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

    <!-- Vehicle Owner loading-charge rates -->
    <details${_voSectionOpen ? ' open' : ''} ontoggle="toggleVehicleOwnersSection(this)" style="margin-top:16px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <summary style="cursor:pointer;padding:12px 14px;background:var(--bg,#f8fafc);font-size:13px;font-weight:700;color:var(--navy)">
        🏗️ Vehicle Owner Loading Rates${vehicleOwners.length ? ` (${vehicleOwners.length})` : ''}
      </summary>
      <div style="padding:14px">
        <div class="add-order-form" style="margin-bottom:${vehicleOwners.length ? '14px' : '0'};${_voEditingIdx >= 0 ? 'border:1.5px solid var(--blue)' : ''}">
          <div class="form-title">${_voEditingIdx >= 0 ? '✏️ Edit Rate' : '➕ Add Vehicle Owner Rate'}</div>
          <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
            <div class="form-group">
              <label class="form-label">Vehicle Owner Name</label>
              <input class="form-input" type="text" id="vo-name" placeholder="e.g. Ramesh Transport">
            </div>
            <div class="form-group">
              <label class="form-label">Fixed Rate (₹)</label>
              <input class="form-input" type="number" id="vo-rate" placeholder="0" step="1">
            </div>
          </div>
          <div style="display:flex;gap:10px;margin-top:12px">
            <button class="btn-primary" onclick="saveVehicleOwnerRateForm()">${_voEditingIdx >= 0 ? '💾 Update Rate' : '💾 Save Rate'}</button>
            ${_voEditingIdx >= 0 ? `<button class="btn-secondary" onclick="cancelEditVehicleOwnerRate()">✖ Cancel</button>` : ''}
          </div>
        </div>
        ${vehicleOwners.length ? vehicleOwners.map((v, i) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--border);font-size:13px">
            <span style="font-weight:600">${v.name}</span>
            <div style="display:flex;align-items:center;gap:12px">
              <strong>₹${v.rate.toLocaleString('en-IN')}</strong>
              <button class="btn-secondary" style="font-size:10px;padding:3px 6px" onclick="editVehicleOwnerRate(${i})" title="Edit">✏️</button>
              <button style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--danger)" onclick="deleteVehicleOwnerRate(${i})" title="Delete">🗑</button>
            </div>
          </div>`).join('') : '<div class="empty-state" style="padding:10px 0">No vehicle owners on file yet. Add one above.</div>'}
      </div>
    </details>

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

// ══════════════════════════════════════════════════════════════
// INVOICES.JS — Invoice Generation & Management
// ══════════════════════════════════════════════════════════════

const LS_INVOICES = 'mi_invoices_v2';
let invoiceList = [];

function loadInvoices()    { try { return JSON.parse(localStorage.getItem(LS_INVOICES) || '[]'); } catch { return []; } }
function saveInvoiceList() { localStorage.setItem(LS_INVOICES, JSON.stringify(invoiceList)); }
function initInvoices()    { invoiceList = loadInvoices(); }

function generateInvoiceId() {
  let max = 0;
  invoiceList.forEach(inv => {
    const m = String(inv.id || '').match(/INV(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1]));
  });
  return 'INV' + String(max + 1).padStart(3, '0');
}

// Sum of all qty items invoiced against a specific order
function getInvoicedQty(orderId) {
  return invoiceList
    .filter(inv => inv.orderId === orderId)
    .reduce((sum, inv) => sum + (inv.items || []).reduce((s, item) => s + (item.qty || 0), 0), 0);
}

// ── Create Invoice Modal ──
let _ciItems = [];

// Backward-compat: called from order history rows
function openInvoice(orderId) {
  openCreateInvoiceForm(orderId || null);
}

function openCreateInvoiceForm(orderId) {
  _ciItems = [];
  const overlay = document.getElementById('create-invoice-overlay');
  if (!overlay) return;

  // Today's date
  const dateEl = document.getElementById('ci-date');
  if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);

  // Party autocomplete datalist
  const dl = document.getElementById('ci-party-list');
  if (dl && typeof CLIENTS !== 'undefined') {
    dl.innerHTML = CLIENTS.map(c => `<option value="${c.name}">`).join('');
  }

  // Order dropdown
  const sel = document.getElementById('ci-order-link');
  if (sel && typeof orders !== 'undefined') {
    const activeOrders = orders
      .filter(o => o.status !== 'Cancelled')
      .sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    sel.innerHTML = '<option value="">— Standalone Invoice —</option>' +
      activeOrders.map(o =>
        `<option value="${o.id}" ${o.id === orderId ? 'selected' : ''}>${o.id} · ${o.customer} (${(o.qty || 0).toLocaleString('en-IN')} pcs)</option>`
      ).join('');
  }

  overlay.style.display = 'flex';

  if (orderId) {
    _prefillFromOrder(orderId);
  } else {
    _ciItems = [{ desc: '', qty: '', rate: '' }];
    renderInvoiceItemRows();
    recalcInvoiceTotals();
  }
}

function closeCreateInvoice() {
  const overlay = document.getElementById('create-invoice-overlay');
  if (overlay) overlay.style.display = 'none';
}

function onInvoiceOrderLink() {
  const orderId = document.getElementById('ci-order-link')?.value;
  if (orderId) {
    _prefillFromOrder(orderId);
  } else {
    _ciItems = [{ desc: '', qty: '', rate: '' }];
    renderInvoiceItemRows();
    recalcInvoiceTotals();
  }
}

function _prefillFromOrder(orderId) {
  const o = typeof orders !== 'undefined' ? orders.find(x => x.id === orderId) : null;
  if (!o) return;

  const partyEl = document.getElementById('ci-party');
  if (partyEl && !partyEl.value) partyEl.value = o.customer || '';

  const alreadyInvoiced = getInvoicedQty(orderId);
  const remaining = Math.max(0, (o.qty || 0) - alreadyInvoiced);
  const desc = [o.product || 'Corrugated Box', o.size, o.ply ? o.ply + ' Ply' : '', o.colour].filter(Boolean).join(' · ');

  _ciItems = [{ desc, qty: remaining, rate: o.rate || '' }];
  renderInvoiceItemRows();
  recalcInvoiceTotals();
}

function renderInvoiceItemRows() {
  const container = document.getElementById('ci-items-table');
  if (!container) return;

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:2fr 80px 90px 90px 28px;gap:6px;font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px;padding:0 2px">
      <div>Description</div><div>Qty</div><div>Rate (₹)</div><div>Amount</div><div></div>
    </div>` +
    _ciItems.map((item, i) => `
    <div style="display:grid;grid-template-columns:2fr 80px 90px 90px 28px;gap:6px;margin-bottom:6px;align-items:center">
      <input class="form-input" type="text" placeholder="e.g. Corrugated Box 20×14×28" value="${(item.desc || '').replace(/"/g,'&quot;')}"
        style="font-size:12px;padding:6px 8px" oninput="_ciItems[${i}].desc=this.value">
      <input class="form-input" type="number" placeholder="0" value="${item.qty !== '' ? item.qty : ''}"
        style="font-size:12px;padding:6px 8px" oninput="_ciItems[${i}].qty=+this.value||0;recalcInvoiceTotals()">
      <input class="form-input" type="number" placeholder="0.00" step="0.01" value="${item.rate !== '' ? item.rate : ''}"
        style="font-size:12px;padding:6px 8px" oninput="_ciItems[${i}].rate=+this.value||0;recalcInvoiceTotals()">
      <div style="font-size:12px;font-weight:700;padding:6px 0;text-align:right">₹${(+(item.qty||0) * +(item.rate||0)).toFixed(2)}</div>
      ${_ciItems.length > 1
        ? `<button onclick="removeInvoiceItem(${i})" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--danger);line-height:1">×</button>`
        : '<div></div>'}
    </div>`).join('');
}

function addInvoiceItemRow() {
  _ciItems.push({ desc: '', qty: '', rate: '' });
  renderInvoiceItemRows();
  recalcInvoiceTotals();
}

function removeInvoiceItem(i) {
  _ciItems.splice(i, 1);
  renderInvoiceItemRows();
  recalcInvoiceTotals();
}

function recalcInvoiceTotals() {
  const subtotal = _ciItems.reduce((s, item) => s + +(item.qty || 0) * +(item.rate || 0), 0);
  const gstPct   = parseFloat(document.getElementById('ci-gst')?.value) || 0;
  const gstAmt   = subtotal * gstPct / 100;
  const total    = subtotal + gstAmt;
  const fmt2     = n => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const sub = document.getElementById('ci-subtotal');
  const gl  = document.getElementById('ci-gst-label');
  const ga  = document.getElementById('ci-gst-amt');
  const tot = document.getElementById('ci-total');
  if (sub) sub.textContent = '₹' + fmt2(subtotal);
  if (gl)  gl.textContent  = `GST (${gstPct}%)`;
  if (ga)  ga.textContent  = '₹' + fmt2(gstAmt);
  if (tot) tot.textContent = '₹' + fmt2(total);
}

function _buildInvoiceRecord() {
  const party   = (document.getElementById('ci-party')?.value || '').trim();
  const dateVal = document.getElementById('ci-date')?.value || new Date().toISOString().slice(0, 10);
  const orderId = document.getElementById('ci-order-link')?.value || null;
  const gstPct  = parseFloat(document.getElementById('ci-gst')?.value) || 0;
  const items   = _ciItems.filter(item => item.desc && +(item.qty || 0) > 0);

  if (!party)        { alert('Please enter party name.'); return null; }
  if (!items.length) { alert('Please add at least one item with a description and qty > 0.'); return null; }

  const subtotal = items.reduce((s, i) => s + +(i.qty) * +(i.rate || 0), 0);
  const gstAmt   = subtotal * gstPct / 100;
  const total    = subtotal + gstAmt;

  return {
    id:        generateInvoiceId(),
    party,
    date:      dateVal,
    orderId:   orderId || null,
    items:     items.map(i => ({ desc: i.desc, qty: +i.qty, rate: +(i.rate || 0), amount: +i.qty * +(i.rate || 0) })),
    subtotal,
    gstPct,
    gstAmt,
    total,
    createdAt: new Date().toISOString(),
  };
}

function saveInvoiceOnly() {
  const inv = _buildInvoiceRecord();
  if (!inv) return;
  invoiceList.unshift(inv);
  saveInvoiceList();
  closeCreateInvoice();
  renderInvoicingPage();
  if (typeof renderOrders === 'function') renderOrders();
  alert(`✅ ${inv.id} saved!`);
}

function saveAndPrintInvoice() {
  const inv = _buildInvoiceRecord();
  if (!inv) return;
  invoiceList.unshift(inv);
  saveInvoiceList();
  closeCreateInvoice();
  renderInvoicingPage();
  if (typeof renderOrders === 'function') renderOrders();
  _populateInvoiceOverlay(inv);
}

function _populateInvoiceOverlay(inv) {
  const ordObj = inv.orderId && typeof orders !== 'undefined' ? orders.find(o => o.id === inv.orderId) : null;
  const client = inv.party && typeof CLIENTS !== 'undefined'
    ? (CLIENTS.find(c => c.name.toLowerCase() === inv.party.toLowerCase()) || {})
    : {};
  const fmt2   = n => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dateStr = (() => {
    try { return new Date(inv.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch { return inv.date; }
  })();

  document.getElementById('inv-number').textContent          = inv.id;
  document.getElementById('inv-date').textContent            = dateStr;
  document.getElementById('inv-order-id').textContent        = inv.orderId || '—';
  document.getElementById('inv-delivery-date').textContent   = ordObj ? formatDate(ordObj.date) : '—';
  document.getElementById('inv-customer-name').textContent   = inv.party;
  document.getElementById('inv-customer-contact').textContent = client.contact || '';
  document.getElementById('inv-customer-city').textContent   = client.city    || '';
  document.getElementById('inv-customer-phone').textContent  = client.phone   ? '📞 ' + client.phone : '';

  document.getElementById('inv-items').innerHTML = inv.items.map(item => `
    <tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:12px;font-size:13px">${item.desc}</td>
      <td style="padding:12px;text-align:center;font-size:13px">${item.qty.toLocaleString('en-IN')} pcs</td>
      <td style="padding:12px;text-align:right;font-size:13px">₹${item.rate.toFixed(2)}</td>
      <td style="padding:12px;text-align:right;font-size:13px;font-weight:600">₹${fmt2(item.amount)}</td>
    </tr>`).join('');

  document.getElementById('inv-subtotal').textContent = '₹' + fmt2(inv.subtotal);
  const gstLabelEl = document.getElementById('inv-gst-label');
  if (gstLabelEl) gstLabelEl.textContent = `GST @ ${inv.gstPct}%`;
  document.getElementById('inv-gst').textContent  = '₹' + fmt2(inv.gstAmt);
  document.getElementById('inv-total').textContent = '₹' + fmt2(inv.total);
  document.getElementById('inv-amount-words').textContent = amountToWords(Math.round(inv.total));

  document.getElementById('invoice-overlay').style.display = 'flex';
}

function reprintInvoice(invId) {
  const inv = invoiceList.find(i => i.id === invId);
  if (inv) _populateInvoiceOverlay(inv);
}

function deleteInvoice(invId) {
  if (!confirm(`Delete invoice ${invId}? This cannot be undone.`)) return;
  invoiceList = invoiceList.filter(inv => inv.id !== invId);
  saveInvoiceList();
  renderInvoicingPage();
  if (typeof renderOrders === 'function') renderOrders();
}

function closeInvoice() {
  document.getElementById('invoice-overlay').style.display = 'none';
}

// ── Print Invoice (new window) ──
function printInvoice() {
  const content = document.getElementById('invoice-printable').innerHTML;
  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>Invoice</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Inter', Arial, sans-serif; padding: 40px; font-size: 13px; color: #111; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #e5e7eb; }
    </style>
    </head><body>${content}</body></html>
  `);
  win.document.close();
  win.focus();
  win.print();
}

// ── Invoicing Page ──
function renderInvoicingPage() {
  const el = document.getElementById('invoicing-page-content');
  if (!el) return;

  const fmt2 = n => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const totalInvoiced = invoiceList.reduce((s, inv) => s + inv.total, 0);

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <div class="stat-card good" style="padding:10px 16px;min-width:140px">
          <div class="stat-label">Total Invoiced</div>
          <div class="stat-value" style="color:var(--success);font-size:18px">₹${fmt2(totalInvoiced)}</div>
        </div>
        <div class="stat-card info" style="padding:10px 16px;min-width:100px">
          <div class="stat-label">Invoices</div>
          <div class="stat-value">${invoiceList.length}</div>
        </div>
      </div>
      <button class="btn-primary" onclick="openCreateInvoiceForm(null)" style="font-size:13px">+ New Invoice</button>
    </div>

    ${invoiceList.length === 0
      ? '<div class="empty-state">No invoices yet. Click "+ New Invoice" to create one.</div>'
      : `<div class="card">
          <div class="card-body" style="padding:0">
            <div class="orders-table">
              <div class="table-header" style="grid-template-columns:90px 110px 1.5fr 1fr 80px 100px 100px">
                <div>Invoice #</div><div>Date</div><div>Party</div><div>Order</div><div>Qty</div><div>Total</div><div>Actions</div>
              </div>
              ${invoiceList.map(inv => {
                const qty = (inv.items || []).reduce((s, i) => s + (i.qty || 0), 0);
                const dateDisp = (() => { try { return new Date(inv.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return inv.date; } })();
                return `
                <div class="table-row" style="grid-template-columns:90px 110px 1.5fr 1fr 80px 100px 100px">
                  <div style="font-family:monospace;font-size:12px;color:var(--navy);font-weight:700">${inv.id}</div>
                  <div style="font-size:12px">${dateDisp}</div>
                  <div style="font-size:12px;font-weight:600">${inv.party}</div>
                  <div style="font-size:11px;font-family:monospace;color:var(--muted)">${inv.orderId || '—'}</div>
                  <div style="font-size:12px">${qty.toLocaleString('en-IN')} pcs</div>
                  <div style="font-size:12px;font-weight:700;color:var(--navy)">₹${fmt2(inv.total)}</div>
                  <div style="display:flex;gap:6px;align-items:center">
                    <button class="btn-secondary" style="font-size:10px;padding:3px 8px" onclick="reprintInvoice('${inv.id}')">🖨 Print</button>
                    <button style="background:none;border:none;cursor:pointer;font-size:15px;color:var(--danger)" onclick="deleteInvoice('${inv.id}')" title="Delete">🗑</button>
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>`
    }
  `;
}

// ── Number to Words (Indian format) ──
function amountToWords(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '';
  if (amount === 0) return 'Rupees Zero Only';
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function convert(n) {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? ' ' + ones[n%10] : '');
    if (n < 1000) return ones[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' ' + convert(n%100) : '');
    if (n < 100000) return convert(Math.floor(n/1000)) + ' Thousand' + (n%1000 ? ' ' + convert(n%1000) : '');
    if (n < 10000000) return convert(Math.floor(n/100000)) + ' Lakh' + (n%100000 ? ' ' + convert(n%100000) : '');
    return convert(Math.floor(n/10000000)) + ' Crore' + (n%10000000 ? ' ' + convert(n%10000000) : '');
  }
  return 'Rupees ' + convert(amount) + ' Only';
}

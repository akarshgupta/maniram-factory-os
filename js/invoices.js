// ══════════════════════════════════════════════════════════════
// INVOICES.JS — Invoice Generation & Management
// ══════════════════════════════════════════════════════════════

const LS_INVOICES = 'mi_invoices_v1';
let invoiceRegistry = {}; // { orderId: invoiceNumber }

function loadInvoices()  { try { return JSON.parse(localStorage.getItem(LS_INVOICES) || '{}'); } catch { return {}; } }
function saveInvoices()  { localStorage.setItem(LS_INVOICES, JSON.stringify(invoiceRegistry)); }
function initInvoices()  { invoiceRegistry = loadInvoices(); }

function generateInvoiceNumber() {
  let max = 0;
  Object.values(invoiceRegistry).forEach(n => {
    const m = n.match(/INV(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1]));
  });
  return 'INV' + String(max + 1).padStart(3, '0');
}

function getOrCreateInvoiceNumber(orderId) {
  if (!invoiceRegistry[orderId]) {
    invoiceRegistry[orderId] = generateInvoiceNumber();
    saveInvoices();
  }
  return invoiceRegistry[orderId];
}

// ── Open Invoice Modal ──
function openInvoice(orderId) {
  const o = orders.find(x => x.id === orderId);
  if (!o) { alert('Order not found.'); return; }

  const invNum   = getOrCreateInvoiceNumber(orderId);
  const client   = CLIENTS.find(c => c.name.toLowerCase() === o.customer.toLowerCase()) || {};
  const subtotal = (o.qty || 0) * (o.rate || 0);
  const gst      = subtotal * 0.18;
  const total    = subtotal + gst;
  const fmt2     = n => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const invDate  = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  document.getElementById('inv-number').textContent          = invNum;
  document.getElementById('inv-date').textContent            = invDate;
  document.getElementById('inv-order-id').textContent        = o.id;
  document.getElementById('inv-delivery-date').textContent   = formatDate(o.date);
  document.getElementById('inv-customer-name').textContent   = o.customer;
  document.getElementById('inv-customer-contact').textContent = client.contact || '';
  document.getElementById('inv-customer-city').textContent   = client.city    || '';
  document.getElementById('inv-customer-phone').textContent  = client.phone   ? '📞 ' + client.phone : '';

  const desc = [o.product || 'Corrugated Box', o.size, o.ply ? o.ply + ' Ply' : '', o.colour].filter(Boolean).join(' · ');
  document.getElementById('inv-items').innerHTML = `
    <tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:12px;font-size:13px">${o.product || 'Corrugated Box'}<br>
        <span style="font-size:11px;color:#666">${[o.size, o.ply ? o.ply+' Ply' : '', o.colour].filter(Boolean).join(' · ')}</span>
      </td>
      <td style="padding:12px;text-align:center;font-size:13px">${(o.qty||0).toLocaleString('en-IN')} pcs</td>
      <td style="padding:12px;text-align:right;font-size:13px">₹${(o.rate||0).toFixed(2)}</td>
      <td style="padding:12px;text-align:right;font-size:13px;font-weight:600">₹${fmt2(subtotal)}</td>
    </tr>
  `;

  document.getElementById('inv-subtotal').textContent = '₹' + fmt2(subtotal);
  document.getElementById('inv-gst').textContent      = '₹' + fmt2(gst);
  document.getElementById('inv-total').textContent    = '₹' + fmt2(total);

  document.getElementById('inv-amount-words').textContent = amountToWords(Math.round(total));

  document.getElementById('invoice-overlay').style.display = 'flex';
}

function closeInvoice() {
  document.getElementById('invoice-overlay').style.display = 'none';
}

// ── Print Invoice (open in new window for clean print) ──
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

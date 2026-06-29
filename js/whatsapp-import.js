// ══════════════════════════════════════════════════════════════
// WHATSAPP-IMPORT.JS — Parse WhatsApp order messages
// ══════════════════════════════════════════════════════════════

function openWhatsAppImport() {
  document.getElementById('wa-import-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('wa-text').focus(), 50);
}

function closeWhatsAppImport() {
  document.getElementById('wa-import-overlay').style.display = 'none';
  document.getElementById('wa-text').value = '';
  document.getElementById('wa-preview').innerHTML = '';
  document.getElementById('wa-apply-btn').style.display = 'none';
}

// ── Main parser ──
function parseOrderText(text) {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const result = {};

  function extract(patterns) {
    for (const re of patterns) {
      const m = text.match(re);
      if (m) return m[1].trim();
    }
    return null;
  }

  // Quantity — labeled first, then inline (e.g. "300 boxes", "500 pcs")
  const qtyRaw = extract([
    /(?:qty|quantity|pieces|pcs|boxes?|nos?)[\s:=\-]*(\d[\d,]*)/i,
    /(\d[\d,]*)\s*(?:boxes?|pcs|pieces|nos\.?)\b/i,
    /order[\s:=]+(\d[\d,]*)/i,
  ]);
  if (qtyRaw) result.qty = parseInt(qtyRaw.replace(/,/g, ''));

  // Box size — L×W×H with various separators
  const sizeM = text.match(/(\d{1,3})\s*[xX×\*]\s*(\d{1,3})\s*[xX×\*]\s*(\d{1,3})/);
  if (sizeM) result.size = `${sizeM[1]}×${sizeM[2]}×${sizeM[3]}`;

  // Ply
  const plyRaw = extract([/(\d)\s*ply/i, /ply[\s:=]*(\d)/i]);
  if (plyRaw) result.ply = plyRaw;

  // Rate — ₹, rs, @, or "rate X"
  const rateRaw = extract([
    /(?:rate|@|₹|rs\.?)[\s:=]*(\d+(?:\.\d{1,2})?)/i,
    /(\d+(?:\.\d{1,2})?)\s*(?:per\s*(?:box|pcs?|piece)|\/(?:box|pc))\b/i,
  ]);
  if (rateRaw) result.rate = parseFloat(rateRaw);

  // Weight in grams
  const wtRaw = extract([/(\d+(?:\.\d+)?)\s*(?:gm|gram|grm|grams?)\b/i]);
  if (wtRaw) result.weight = parseFloat(wtRaw);

  // Colour — explicit label or keyword match
  const colourLabel = extract([/(?:colour|color|rang)[\s:=]+([a-z]+)/i]);
  const COLOURS = ['red','blue','green','orange','yellow','black','white','pink','brown','grey','gray'];
  if (colourLabel && COLOURS.includes(colourLabel.toLowerCase())) {
    result.colour = colourLabel.charAt(0).toUpperCase() + colourLabel.slice(1).toLowerCase();
  } else {
    for (const c of COLOURS) {
      if (new RegExp(`\\b${c}\\b`, 'i').test(text)) {
        result.colour = c.charAt(0).toUpperCase() + c.slice(1);
        break;
      }
    }
  }

  // Delivery date
  // Priority: DD/MM/YYYY → DD-MMM → "by" phrase
  const MONTH_NAMES = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const dateM1 = text.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (dateM1) {
    const day = String(parseInt(dateM1[1])).padStart(2, '0');
    const mon = String(parseInt(dateM1[2])).padStart(2, '0');
    const rawYr = dateM1[3];
    const yr = rawYr ? (rawYr.length === 2 ? '20' + rawYr : rawYr) : new Date().getFullYear();
    result.date = `${yr}-${mon}-${day}`;
  } else {
    for (let i = 0; i < MONTH_NAMES.length; i++) {
      const mName = MONTH_NAMES[i];
      const re1 = new RegExp(`(\\d{1,2})\\s*${mName}[a-z]*`, 'i');
      const re2 = new RegExp(`${mName}[a-z]*\\s*(\\d{1,2})`, 'i');
      let dm = text.match(re1) || text.match(re2);
      if (dm) {
        const yr = new Date().getFullYear();
        const day = String(parseInt(dm[1])).padStart(2, '0');
        result.date = `${yr}-${String(i + 1).padStart(2, '0')}-${day}`;
        break;
      }
    }
  }

  // Customer — labeled, then match against saved clients, then first plausible line
  const custLabel = extract([
    /(?:customer|client|party|from|naam|name)[\s:=\-]+([^\n,;]+)/i,
  ]);
  if (custLabel) {
    result.customer = custLabel.trim();
  } else if (typeof clients !== 'undefined' && clients.length) {
    for (const line of lines) {
      const found = clients.find(c =>
        line.toLowerCase().includes(c.name.toLowerCase()) ||
        c.name.toLowerCase().includes(line.toLowerCase())
      );
      if (found) { result.customer = found.name; break; }
    }
  }
  if (!result.customer) {
    // First non-numeric, non-phone line longer than 2 chars
    const firstLine = lines.find(l =>
      !l.match(/^\+?\d[\d\s\-]{6,}$/) &&
      !l.match(/^[\d\s]+$/) &&
      l.length > 2 &&
      l.length < 60
    );
    if (firstLine) result.customer = firstLine;
  }

  // Product — labeled only (product names vary too much to guess)
  const prodLabel = extract([
    /(?:product|item|box[\s\-]?type|type|model)[\s:=\-]+([^\n,;]+)/i,
  ]);
  if (prodLabel) result.product = prodLabel.trim();

  return result;
}

// ── Render parsed fields as editable preview ──
function parseWhatsAppMessage() {
  const raw = (document.getElementById('wa-text').value || '').trim();
  if (!raw) { alert('Please paste the WhatsApp message first.'); return; }

  const p = parseOrderText(raw);
  const fields = [
    { key: 'customer', label: 'Customer',    type: 'text',   val: p.customer || '' },
    { key: 'product',  label: 'Product',     type: 'text',   val: p.product  || '' },
    { key: 'size',     label: 'Box Size',    type: 'text',   val: p.size     || '' },
    { key: 'ply',      label: 'Ply',         type: 'text',   val: p.ply      || '' },
    { key: 'colour',   label: 'Colour',      type: 'text',   val: p.colour   || '' },
    { key: 'weight',   label: 'Weight (gm)', type: 'number', val: p.weight   || '' },
    { key: 'qty',      label: 'Qty (pcs)',   type: 'number', val: p.qty      || '' },
    { key: 'rate',     label: 'Rate (₹)',    type: 'number', val: p.rate     || '' },
    { key: 'date',     label: 'Delivery',    type: 'date',   val: p.date     || '' },
  ];

  const anyFound = fields.some(f => f.val !== '');
  const notice = anyFound
    ? `<div style="font-size:12px;color:var(--muted);margin-bottom:14px">Review and correct any fields, then click <strong>Apply to Order Form</strong>. Blank fields won't overwrite the form.</div>`
    : `<div style="font-size:12px;color:var(--danger);background:#FEF2F2;padding:10px 12px;border-radius:8px;margin-bottom:14px">Could not detect order details automatically. Please fill in the fields manually or adjust the message format.</div>`;

  document.getElementById('wa-preview').innerHTML = `
    <div style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:8px">Parsed Fields</div>
    ${notice}
    <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px">
      ${fields.map(f => `
        <div class="form-group">
          <label class="form-label">${f.label}</label>
          <input class="form-input" style="font-size:13px" type="${f.type}"
            id="wa-f-${f.key}" value="${f.val}" placeholder="—" ${f.type === 'number' ? 'step="any"' : ''}>
        </div>
      `).join('')}
    </div>
  `;

  document.getElementById('wa-apply-btn').style.display = 'inline-flex';
}

// ── Apply parsed values to the order form ──
function applyWhatsAppOrder() {
  const get = id => document.getElementById(id);

  const customer = (get('wa-f-customer')?.value || '').trim();
  const product  = (get('wa-f-product')?.value  || '').trim();
  const size     = (get('wa-f-size')?.value      || '').trim();
  const ply      = (get('wa-f-ply')?.value       || '').trim();
  const colour   = (get('wa-f-colour')?.value    || '').trim();
  const weight   = (get('wa-f-weight')?.value    || '').trim();
  const qty      = (get('wa-f-qty')?.value       || '').trim();
  const rate     = (get('wa-f-rate')?.value      || '').trim();
  const date     = (get('wa-f-date')?.value      || '').trim();

  closeWhatsAppImport();

  // Fill the order form (blank values are skipped)
  if (customer) {
    const el = get('f-customer');
    if (el) { el.value = customer; onCustomerInput(); }
  }
  if (size)   { const el = get('f-size');     if (el) el.value = size; }
  if (ply)    { const el = get('f-ply');      if (el) el.value = ply; }
  if (colour) { const el = get('f-colour');   if (el) el.value = colour; }
  if (weight) { const el = get('f-weight');   if (el) { el.value = weight; checkStockForCurrentOrder(); } }
  if (qty)    { const el = get('f-qty');      if (el) { el.value = qty;    checkStockForCurrentOrder(); } }
  if (rate)   { const el = get('f-rate');     if (el) el.value = rate; }
  if (date)   { const el = get('f-date');     if (el) el.value = date; }

  // Product match: after customer dropdown populates, try to select matching product
  if (product) {
    setTimeout(() => {
      const sel = get('f-product');
      if (!sel) return;
      for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].text.toLowerCase().includes(product.toLowerCase())) {
          sel.selectedIndex = i;
          onProductChange();
          break;
        }
      }
    }, 600);
  }

  // Scroll order form into view
  document.querySelector('#page-orders .add-order-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

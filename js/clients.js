// ══════════════════════════════════════════════════════════════
// CLIENTS.JS — Client Data, Autocomplete, Product Dropdown
// Data backend: Google Sheets (Clients + ClientProducts tabs in ORDERS_SHEET_ID)
// ══════════════════════════════════════════════════════════════

const DEFAULT_CLIENTS = [
  {
    name: 'Gaida Enterprises', contact: 'Suresh Gaida', phone: '9800000001', city: 'Gwalior',
    products: [
      { name: 'JIO', size: '18×14×30', ply: '3', colour: 'Red', weight: '655', reelSize: '35.5' },
    ]
  },
  {
    name: 'NDS International', contact: 'Rajesh Kumar', phone: '9800000002', city: 'Jhansi',
    products: [
      { name: 'Kingfisher', size: '20×14×27', ply: '3', colour: 'Red',  weight: '648', reelSize: '35.5' },
      { name: 'Kanha',      size: '18×14×27', ply: '3', colour: 'Blue', weight: '611', reelSize: '35.5' },
    ]
  },
  {
    name: 'NDS Paper', contact: 'Rajesh Kumar', phone: '9800000003', city: 'Jhansi',
    products: [
      { name: 'Gulabjal', size: '20×14×28', ply: '3', colour: 'Red', weight: '701', reelSize: '35.5' },
    ]
  },
  {
    name: 'RP Products', contact: 'Ramesh Prasad', phone: '9800000004', city: 'Jhansi',
    products: [
      { name: 'Jalrani', size: '26×13×22', ply: '3', colour: 'Blue', weight: '641', reelSize: '42' },
    ]
  },
  {
    name: 'SSD', contact: 'SSD Contact', phone: '9800000005', city: 'Jhansi',
    products: [
      { name: 'SSD', size: '26×13×22', ply: '3', colour: 'Green', weight: '641', reelSize: '42' },
    ]
  },
];

const PLY_LAYERS = {
  3: [
    { label: 'Top Liner',    type: 'liner'   },
    { label: 'Fluting',      type: 'fluting' },
    { label: 'Bottom Liner', type: 'liner'   },
  ],
  5: [
    { label: 'Top Liner',    type: 'liner'   },
    { label: 'Fluting',      type: 'fluting' },
    { label: 'Middle Liner', type: 'liner'   },
    { label: 'Fluting',      type: 'fluting' },
    { label: 'Bottom Liner', type: 'liner'   },
  ],
  7: [
    { label: 'Top Liner',    type: 'liner'   },
    { label: 'Fluting',      type: 'fluting' },
    { label: 'Middle 1',     type: 'liner'   },
    { label: 'Fluting',      type: 'fluting' },
    { label: 'Middle 2',     type: 'liner'   },
    { label: 'Fluting',      type: 'fluting' },
    { label: 'Bottom Liner', type: 'liner'   },
  ],
  9: [
    { label: 'Top Liner',    type: 'liner'   },
    { label: 'Fluting',      type: 'fluting' },
    { label: 'Middle 1',     type: 'liner'   },
    { label: 'Fluting',      type: 'fluting' },
    { label: 'Middle 2',     type: 'liner'   },
    { label: 'Fluting',      type: 'fluting' },
    { label: 'Middle 3',     type: 'liner'   },
    { label: 'Fluting',      type: 'fluting' },
    { label: 'Bottom Liner', type: 'liner'   },
  ],
};

// ── State ──
let CLIENTS       = [];
let acSelectedIdx = -1;
let acFiltered    = [];

// ── Client Modal State ──
let _clientModalIdx    = -1; // -1 = adding new
let _clientSaveCallback = null; // optional callback(name) after adding a new client
let _productModalCi  = -1;
let _productModalPi  = -1; // -1 = adding new
let _productModalCb  = null; // optional callback after save

// ── GSM Grid ──
function updateGsmFields(existingGsm) {
  const grid = document.getElementById('pm-gsm-grid');
  if (!grid) return;
  const ply    = parseInt(document.getElementById('pm-ply')?.value) || 3;
  const layers = PLY_LAYERS[ply] || PLY_LAYERS[3];
  grid.innerHTML = layers.map((layer, i) => {
    const val         = Array.isArray(existingGsm) ? (existingGsm[i] || '') : '';
    const isFluting   = layer.type === 'fluting';
    const accent      = isFluting ? '#FFA500' : '#2980B9';
    const placeholder = isFluting ? '100–150' : '120–200';
    return `<div style="display:flex;flex-direction:column;gap:3px">
      <label style="font-size:10px;font-weight:600;color:${accent}">${layer.label}</label>
      <input class="form-input" type="number" id="pm-gsm-${i+1}"
        placeholder="${placeholder}" min="60" max="400" step="5"
        value="${val}"
        style="border-left:3px solid ${accent};padding-left:8px"
        onkeydown="if(event.key==='Escape')closeProductModal()">
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════
// SHEETS DATA LAYER
// ══════════════════════════════════════════════════════════════

async function fetchClients() {
  try {
    const cUrl    = `https://sheets.googleapis.com/v4/spreadsheets/${CUSTOMERS_SHEET_ID}/values/${encodeURIComponent(CUSTOMERS_TAB + '!A1:D500')}?key=${API_KEY}`;
    const cUrlOld = `https://sheets.googleapis.com/v4/spreadsheets/${ORDERS_SHEET_ID}/values/${encodeURIComponent('Customers!A1:D500')}?key=${API_KEY}`;
    const pUrl    = `https://sheets.googleapis.com/v4/spreadsheets/${PRODUCTS_SHEET_ID}/values/${encodeURIComponent(PRODUCTS_TAB + '!A1:P2000')}?key=${API_KEY}`;
    const pUrlOld = `https://sheets.googleapis.com/v4/spreadsheets/${ORDERS_SHEET_ID}/values/${encodeURIComponent('Products!A1:P2000')}?key=${API_KEY}`;

    let [cRes, pRes] = await Promise.all([fetch(cUrl), fetch(pUrl)]);
    let [cJson, pJson] = await Promise.all([cRes.json(), pRes.json()]);

    // Fall back to the old Customers/Products tabs in the Orders spreadsheet
    if (cJson.error || !(cJson.values || []).slice(1).filter(r => r[0]).length) {
      const [cResOld, pResOld] = await Promise.all([fetch(cUrlOld), fetch(pUrlOld)]);
      const [cJsonOld, pJsonOld] = await Promise.all([cResOld.json(), pResOld.json()]);
      if (!cJsonOld.error) { cJson = cJsonOld; pJson = pJsonOld; }
    }

    if (cJson.error) return false;

    const cRows = (cJson.values || []).slice(1); // skip header
    const pRows = (pJson.values || []).slice(1);

    CLIENTS = cRows
      .filter(r => r[0])
      .map(r => ({
        name:     r[0] || '',
        contact:  r[1] || '',
        phone:    r[2] || '',
        city:     r[3] || '',
        products: pRows
          .filter(p => p[0] === r[0])
          .map(p => ({
            name:     p[1] || '',
            size:     p[2] || '',
            ply:      p[3] || '',
            colour:   p[4] || '',
            weight:   p[5] || '',
            reelSize: p[6] || '',
            gsm:      [p[7],p[8],p[9],p[10],p[11],p[12],p[13],p[14],p[15]].map(Number).filter(v => v > 0),
          })),
      }));

    return true;
  } catch (e) {
    console.error('fetchClients:', e);
    return false;
  }
}

function postClient(payload) {
  return fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    mode:   'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

function createNotionClientPage(name, contact, phone, city) {
  const content = [
    '## Psychology Profile',
    '',
    '> *Fill in the answers below after your first few interactions with this client.*',
    '',
    '---',
    '',
    '## Negotiator Type (Chris Voss)',
    '',
    '> **Accommodator** — relationship-first, quick decider, avoids conflict, goes quiet when unhappy',
    '> **Analyst** — data-first, slow to decide, needs details, hates surprises',
    '> **Assertive** — results-now, direct, time is money, can be aggressive',
    '',
    '**Type:** *(fill after observation)*',
    '',
    '---',
    '',
    '## 10 Psychology Questions',
    '',
    '**Q1. When you give them something extra (free delivery, extra boxes) — do they feel obligated to return the favour?**',
    'Answer:',
    '',
    '**Q2. If they verbally agree to an order but haven\'t paid advance — do they follow through?**',
    'Answer:',
    '',
    '**Q3. Do they mention competitors or "everyone else does it differently"?**',
    'Answer:',
    '',
    '**Q4. When you explain your experience/quality — does it impress them?**',
    'Answer:',
    '',
    '**Q5. Is your relationship personal (know family, casual chat) or purely transactional?**',
    'Answer:',
    '',
    '**Q6. If you say "stock is running low, order now" — do they order faster?**',
    'Answer:',
    '',
    '**Q7. How long does it take them to decide on a new order — quick or lots of back and forth?**',
    'Answer:',
    '',
    '**Q8. What do they complain about most — price, delivery time, quality, or service?**',
    'Answer:',
    '',
    '**Q9. When there\'s a problem — do they get aggressive, go quiet, or talk it out calmly?**',
    'Answer:',
    '',
    '**Q10. Do they pay on time, late but reliably, or do you have to follow up?**',
    'Answer:',
    '',
    '---',
    '',
    '## Key Rules For This Client',
    '',
    '*(Fill after completing the questionnaire)*',
    '',
    '1.',
    '2.',
    '3.',
    '',
    '---',
    '',
    '## Relationship Notes',
    '',
    '*(Personal details — family names, interests, important dates, past conversations)*',
    '',
    '---',
    '',
    '## Order History Notes',
    '',
    '*(Seasonal patterns, preferred box sizes, recurring complaints, special requests)*',
    '',
    '---',
    '',
    '## Follow-Up Log',
    '',
    '*(Date | What was discussed | Next action)*',
  ].join('\n');

  postClient({
    action:         'createNotionPage',
    notionDbId:     NOTION_CLIENTS_DB,
    clientName:     name,
    clientContact:  contact || '',
    clientPhone:    phone || '',
    clientCity:     city || '',
    pageContent:    content,
  });
}

async function migrateClientsToSheets(clients) {
  const reqs = [];
  for (const c of clients) {
    reqs.push(postClient({
      action: 'saveClient',
      name: c.name, contact: c.contact || '', phone: c.phone || '', city: c.city || '',
    }));
    for (const p of (c.products || [])) {
      reqs.push(postClient({
        action: 'saveProduct',
        clientName: c.name,
        name: p.name, size: p.size || '', ply: p.ply || '',
        colour: p.colour || '', weight: p.weight || '', reelSize: p.reelSize || '',
        gsm: p.gsm || [],
      }));
    }
  }
  await Promise.all(reqs);
  // Give Apps Script time to write before we read back
  await new Promise(r => setTimeout(r, 3000));
}

// Track whether data came from the old fallback location
let _clientsFromFallback = false;

async function initClients() {
  const migrated = localStorage.getItem('mi_clients_migrated');

  if (!migrated) {
    const stored = localStorage.getItem(LS_CLIENTS);
    if (stored) {
      try {
        const local = JSON.parse(stored);
        if (Array.isArray(local) && JSON.stringify(local) !== JSON.stringify(DEFAULT_CLIENTS)) {
          await migrateClientsToSheets(local);
        }
      } catch (e) {}
    }
    localStorage.setItem('mi_clients_migrated', '1');
  }

  const ok = await fetchClients();
  if (!ok || CLIENTS.length === 0) {
    const stored = localStorage.getItem(LS_CLIENTS);
    CLIENTS = stored ? JSON.parse(stored) : JSON.parse(JSON.stringify(DEFAULT_CLIENTS));
  } else {
    localStorage.removeItem(LS_CLIENTS);
  }
}

// ── One-click migration: copy from old ORDERS tabs → new dedicated sheets ──
async function runClientMigration() {
  const statusEl = document.getElementById('migration-status');
  const btn      = document.querySelector('#client-migration-banner .btn-primary');

  if (!CLIENTS || CLIENTS.length === 0) {
    if (statusEl) statusEl.textContent = '❌ No client data loaded. Refresh first.';
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Copying...'; }
  if (statusEl) statusEl.textContent = `Sending ${CLIENTS.length} clients…`;

  try {
    await migrateClientsToSheets(CLIENTS);
    localStorage.setItem('mi_new_sheets_migrated', '1');
    if (statusEl) statusEl.textContent = `✅ ${CLIENTS.length} clients copied. Reloading…`;
    if (btn) btn.textContent = '✅ Done';
    setTimeout(() => window.location.reload(), 2500);
  } catch (e) {
    if (statusEl) statusEl.textContent = '❌ Failed — check that Apps Script is updated.';
    if (btn) { btn.disabled = false; btn.textContent = '📤 Retry'; }
  }
}

// ══════════════════════════════════════════════════════════════
// AUTOCOMPLETE
// ══════════════════════════════════════════════════════════════

function sortedClients() {
  return [...CLIENTS].sort((a, b) => a.name.localeCompare(b.name));
}

function onCustomerInput() {
  const val = document.getElementById('f-customer').value.trim().toLowerCase();
  const dd  = document.getElementById('customer-dropdown');
  if (!val) { dd.style.display = 'none'; acFiltered = []; return; }

  acFiltered    = sortedClients().filter(c => c.name.toLowerCase().includes(val));
  acSelectedIdx = -1;
  if (!acFiltered.length) { dd.style.display = 'none'; return; }

  dd.innerHTML = '';
  acFiltered.forEach((c) => {
    const item = document.createElement('div');
    item.className = 'autocomplete-item';
    const idx    = c.name.toLowerCase().indexOf(val);
    const before = c.name.slice(0, idx);
    const match  = c.name.slice(idx, idx + val.length);
    const after  = c.name.slice(idx + val.length);
    item.innerHTML = `${before}<strong>${match}</strong>${after}`;
    item.onmousedown = () => selectCustomer(c.name);
    dd.appendChild(item);
  });
  dd.style.display = 'block';
}

function onCustomerKey(e) {
  const dd    = document.getElementById('customer-dropdown');
  const items = dd.querySelectorAll('.autocomplete-item');
  if (e.key === 'ArrowDown') {
    acSelectedIdx = Math.min(acSelectedIdx + 1, acFiltered.length - 1);
    items.forEach((el, i) => el.classList.toggle('selected', i === acSelectedIdx));
    e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    acSelectedIdx = Math.max(acSelectedIdx - 1, 0);
    items.forEach((el, i) => el.classList.toggle('selected', i === acSelectedIdx));
    e.preventDefault();
  } else if (e.key === 'Enter') {
    if (acSelectedIdx >= 0 && acFiltered[acSelectedIdx]) selectCustomer(acFiltered[acSelectedIdx].name);
    e.preventDefault();
  } else if (e.key === 'Escape') {
    dd.style.display = 'none';
  }
}

function selectCustomer(name) {
  document.getElementById('f-customer').value               = name;
  document.getElementById('customer-dropdown').style.display = 'none';
  acFiltered    = [];
  acSelectedIdx = -1;
  populateProductDropdown(name);
  refreshOrderId();
}

// ══════════════════════════════════════════════════════════════
// PRODUCT DROPDOWN
// ══════════════════════════════════════════════════════════════

function populateProductDropdown(customerName) {
  const sel    = document.getElementById('f-product');
  sel.innerHTML = '';
  const client = CLIENTS.find(c => c.name === customerName);

  if (!client || !client.products || !client.products.length) {
    sel.innerHTML = '<option value="">— No products yet —</option>';
  } else {
    sel.innerHTML = '<option value="">— Select Product —</option>';
    client.products.forEach((p, i) => {
      const opt = document.createElement('option');
      opt.value       = i;
      opt.textContent = `${p.name} · ${p.size} · ${p.ply}ply · ${p.weight}gm`;
      sel.appendChild(opt);
    });
    if (client.products.length === 1) { sel.value = '0'; onProductChange(); }
  }

  const addOpt = document.createElement('option');
  addOpt.value       = '__add__';
  addOpt.textContent = '➕ Add New Product for this Client';
  sel.appendChild(addOpt);
}

function onProductChange() {
  const sel    = document.getElementById('f-product');
  const custNm = document.getElementById('f-customer').value;
  const val    = sel.value;

  if (val === '__add__') {
    const ci = CLIENTS.findIndex(c => c.name === custNm);
    if (ci < 0) { alert('Please select a customer first.'); sel.value = ''; return; }
    sel.value = '';
    openProductModal(ci, -1, (product, newIdx) => {
      populateProductDropdown(custNm);
      document.getElementById('f-product').value = newIdx.toString();
      onProductChange();
    });
    return;
  }

  const idx    = parseInt(val);
  const client = CLIENTS.find(c => c.name === custNm);
  if (!client || isNaN(idx)) { clearProductFields(); return; }
  const p = client.products[idx];
  if (!p) { clearProductFields(); return; }

  document.getElementById('f-size').value      = p.size     || '';
  document.getElementById('f-ply').value       = p.ply      || '';
  document.getElementById('f-colour').value    = p.colour   || '';
  document.getElementById('f-weight').value    = p.weight   || '';
  document.getElementById('f-reel-size').value = p.reelSize || '';

  checkStockForCurrentOrder();
}

function clearProductFields() {
  ['f-size', 'f-ply', 'f-colour', 'f-weight', 'f-reel-size'].forEach(id => {
    document.getElementById(id).value = '';
  });
  hideStockCheck();
}

// ══════════════════════════════════════════════════════════════
// CLIENTS PAGE — Render & CRUD
// ══════════════════════════════════════════════════════════════

function renderClients() {
  // Show migration banner if not yet migrated to new sheets
  const banner = document.getElementById('client-migration-banner');
  if (banner) {
    const alreadyMigrated = !!localStorage.getItem('mi_new_sheets_migrated');
    banner.style.display = (!alreadyMigrated && CLIENTS.length > 0) ? 'block' : 'none';
  }

  const list = document.getElementById('clients-list');
  list.innerHTML = '';
  CLIENTS.forEach((c, ci) => {
    const card = document.createElement('div');
    card.className = 'client-card';
    const productsHtml = c.products.map((p, pi) => {
      const gsmStr = (p.gsm && p.gsm.length) ? ` · <span style="color:var(--muted);font-size:10px">${p.gsm.join('/')}</span>` : '';
      return `<div class="product-chip" style="display:flex;align-items:center;gap:6px;padding:6px 12px;">
        <span class="colour-dot" style="background:${COLOUR_HEX[p.colour?.toLowerCase()] || '#999'}"></span>
        <span><strong>${p.name}</strong> · ${p.size} · ${p.ply}ply · ${p.weight}gm · 🧻${p.reelSize || '?'}"${gsmStr}</span>
        <button class="btn-sm" style="margin-left:6px" onclick="editProduct(${ci},${pi})">✏️</button>
        <button class="btn-sm" style="color:var(--danger)" onclick="deleteProduct(${ci},${pi})">🗑</button>
      </div>`;
    }).join('');
    card.innerHTML = `
      <div class="client-card-header">
        <div class="client-avatar">${c.name[0]}</div>
        <div>
          <div class="client-name">${c.name}</div>
          <div class="client-meta">${c.contact} · ${c.city} · ${c.phone}</div>
        </div>
        <div class="client-edit-btn" style="display:flex;gap:6px">
          <button class="btn-sm" onclick="editClient(${ci})">✏️ Edit</button>
          <button class="btn-sm" style="color:var(--success)" onclick="addProduct(${ci})">+ Product</button>
        </div>
      </div>
      <div class="client-products">${productsHtml || '<span style="font-size:12px;color:var(--muted)">No products defined yet</span>'}</div>
    `;
    list.appendChild(card);
  });

  const addBtn = document.createElement('button');
  addBtn.className   = 'btn-primary';
  addBtn.style.marginTop = '8px';
  addBtn.textContent = '+ Add New Client';
  addBtn.onclick     = addNewClient;
  list.appendChild(addBtn);
}

// ── Client Modal ──
function openClientModal(ci, onSaved) {
  _clientModalIdx     = ci;
  _clientSaveCallback = onSaved || null;
  const c = ci >= 0 ? CLIENTS[ci] : null;
  document.getElementById('client-modal-title').textContent   = ci >= 0 ? 'Edit Client' : 'Add New Client';
  document.getElementById('cm-name').value    = c ? c.name    : '';
  document.getElementById('cm-contact').value = c ? c.contact : '';
  document.getElementById('cm-phone').value   = c ? c.phone   : '';
  document.getElementById('cm-city').value    = c ? c.city    : '';
  document.getElementById('client-modal-overlay').style.display = 'flex';
  document.getElementById('cm-name').focus();
}

function closeClientModal() {
  document.getElementById('client-modal-overlay').style.display = 'none';
}

function saveClientModal() {
  const name    = document.getElementById('cm-name').value.trim();
  const contact = document.getElementById('cm-contact').value.trim();
  const phone   = document.getElementById('cm-phone').value.trim();
  const city    = document.getElementById('cm-city').value.trim();

  if (!name) { document.getElementById('cm-name').focus(); return; }

  if (_clientModalIdx >= 0) {
    const originalName = CLIENTS[_clientModalIdx].name;
    CLIENTS[_clientModalIdx] = { ...CLIENTS[_clientModalIdx], name, contact, phone, city };
    postClient({ action: 'saveClient', name, contact, phone, city, originalName });
  } else {
    CLIENTS.push({ name, contact, phone, city, products: [] });
    CLIENTS.sort((a, b) => a.name.localeCompare(b.name));
    postClient({ action: 'saveClient', name, contact, phone, city });
    createNotionClientPage(name, contact, phone, city);
  }

  closeClientModal();
  renderClients();
  if (_clientModalIdx < 0 && _clientSaveCallback) {
    _clientSaveCallback(name);
    _clientSaveCallback = null;
  }
  setTimeout(fetchClients, 2000);
}

// ── Product Modal ──
function openProductModal(ci, pi, callback) {
  _productModalCi = ci;
  _productModalPi = pi;
  _productModalCb = callback || null;
  const p = (pi >= 0) ? CLIENTS[ci].products[pi] : null;
  document.getElementById('product-modal-title').textContent = pi >= 0 ? 'Edit Product' : 'Add Product';
  document.getElementById('pm-name').value     = p ? p.name     : '';
  document.getElementById('pm-size').value     = p ? p.size     : '';
  document.getElementById('pm-ply').value      = p ? p.ply      : '3';
  document.getElementById('pm-colour').value   = p ? p.colour   : 'Red';
  document.getElementById('pm-weight').value   = p ? p.weight   : '';
  document.getElementById('pm-reelsize').value = p ? p.reelSize : '';
  document.getElementById('product-modal-overlay').style.display = 'flex';
  updateGsmFields(p ? p.gsm : null);
  if (typeof convertSizeCmIn === 'function') convertSizeCmIn('pm-size', 'pm-size-in');
  document.getElementById('pm-name').focus();
}

function closeProductModal() {
  document.getElementById('product-modal-overlay').style.display = 'none';
  _productModalCb = null;
}

function saveProductModal() {
  const name     = document.getElementById('pm-name').value.trim();
  const size     = document.getElementById('pm-size').value.trim();
  const ply      = document.getElementById('pm-ply').value.trim();
  const colour   = document.getElementById('pm-colour').value.trim();
  const weight   = document.getElementById('pm-weight').value.trim();
  const reelSize = document.getElementById('pm-reelsize').value.trim();
  const layers   = PLY_LAYERS[parseInt(ply)] || PLY_LAYERS[3];
  const gsm      = layers.map((_, i) => parseInt(document.getElementById('pm-gsm-' + (i+1))?.value) || 0).filter(v => v > 0);

  if (!name) { document.getElementById('pm-name').focus(); return; }
  if (!size) { document.getElementById('pm-size').focus(); return; }

  const product = { name, size, ply, colour, weight, reelSize, gsm };
  const ci      = _productModalCi;

  if (_productModalPi >= 0) {
    const originalName = CLIENTS[ci].products[_productModalPi].name;
    CLIENTS[ci].products[_productModalPi] = product;
    postClient({ action: 'saveProduct', clientName: CLIENTS[ci].name, ...product, gsm, originalName });
  } else {
    CLIENTS[ci].products.push(product);
    postClient({ action: 'saveProduct', clientName: CLIENTS[ci].name, ...product, gsm });
  }

  const cb    = _productModalCb;
  const newIdx = CLIENTS[ci].products.length - 1;
  closeProductModal();

  if (cb) {
    cb(product, _productModalPi >= 0 ? _productModalPi : newIdx);
  } else {
    renderClients();
  }
  setTimeout(fetchClients, 2000);
}

function editClient(ci)    { openClientModal(ci); }
function addNewClient()    { openClientModal(-1); }
function addProduct(ci)    { openProductModal(ci, -1); }
function editProduct(ci, pi) { openProductModal(ci, pi); }

function deleteProduct(ci, pi) {
  if (!confirm(`Delete "${CLIENTS[ci].products[pi].name}"?`)) return;
  const clientName  = CLIENTS[ci].name;
  const productName = CLIENTS[ci].products[pi].name;
  CLIENTS[ci].products.splice(pi, 1);
  renderClients();

  postClient({ action: 'deleteProduct', clientName, productName });
  setTimeout(fetchClients, 2000);
}

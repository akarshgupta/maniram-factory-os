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

// ── State ──
let CLIENTS       = [];
let acSelectedIdx = -1;
let acFiltered    = [];

// ══════════════════════════════════════════════════════════════
// SHEETS DATA LAYER
// ══════════════════════════════════════════════════════════════

async function fetchClients() {
  try {
    const cUrl = `https://sheets.googleapis.com/v4/spreadsheets/${ORDERS_SHEET_ID}/values/${encodeURIComponent(CLIENTS_TAB + '!A1:D500')}?key=${API_KEY}`;
    const pUrl = `https://sheets.googleapis.com/v4/spreadsheets/${ORDERS_SHEET_ID}/values/${encodeURIComponent(PRODUCTS_TAB + '!A1:G2000')}?key=${API_KEY}`;

    const [cRes, pRes]   = await Promise.all([fetch(cUrl), fetch(pUrl)]);
    const [cJson, pJson] = await Promise.all([cRes.json(), pRes.json()]);

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
      }));
    }
  }
  await Promise.all(reqs);
  // Give Apps Script time to write before we read back
  await new Promise(r => setTimeout(r, 3000));
}

async function initClients() {
  const migrated = localStorage.getItem('mi_clients_migrated');

  if (!migrated) {
    const stored = localStorage.getItem(LS_CLIENTS);
    if (stored) {
      try {
        const local = JSON.parse(stored);
        // Only migrate if the stored data differs from the placeholder defaults
        if (Array.isArray(local) && JSON.stringify(local) !== JSON.stringify(DEFAULT_CLIENTS)) {
          await migrateClientsToSheets(local);
        }
      } catch (e) {}
    }
    localStorage.setItem('mi_clients_migrated', '1');
  }

  const ok = await fetchClients();
  if (!ok || CLIENTS.length === 0) {
    // Sheets empty or unreachable — fall back to localStorage
    const stored = localStorage.getItem(LS_CLIENTS);
    CLIENTS = stored ? JSON.parse(stored) : JSON.parse(JSON.stringify(DEFAULT_CLIENTS));
  } else {
    // Sheets has data; safe to clear the old localStorage copy
    localStorage.removeItem(LS_CLIENTS);
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
    if (ci < 0) { alert('Pehle customer select karo.'); sel.value = ''; return; }
    const name     = prompt('Product name (e.g. Kingfisher):'); if (!name)     { sel.value = ''; return; }
    const size     = prompt('Box size (e.g. 20×14×27):');       if (!size)     { sel.value = ''; return; }
    const ply      = prompt('Ply (3/5/7):', '3');                if (!ply)      { sel.value = ''; return; }
    const colour   = prompt('Print colour:', 'Red');             if (!colour)   { sel.value = ''; return; }
    const weight   = prompt('Weight (gm):');                     if (!weight)   { sel.value = ''; return; }
    const reelSize = prompt('Reel Size (inches, e.g. 35.5):');   if (!reelSize) { sel.value = ''; return; }

    const product = { name: name.trim(), size: size.trim(), ply: ply.trim(), colour: colour.trim(), weight: weight.trim(), reelSize: reelSize.trim() };
    CLIENTS[ci].products.push(product);
    postClient({ action: 'saveProduct', clientName: custNm, ...product });
    setTimeout(fetchClients, 2000);
    populateProductDropdown(custNm);
    sel.value = CLIENTS[ci].products.length - 1;
    onProductChange();
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
  const list = document.getElementById('clients-list');
  list.innerHTML = '';
  CLIENTS.forEach((c, ci) => {
    const card = document.createElement('div');
    card.className = 'client-card';
    const productsHtml = c.products.map((p, pi) => `
      <div class="product-chip" style="display:flex;align-items:center;gap:6px;padding:6px 12px;">
        <span class="colour-dot" style="background:${COLOUR_HEX[p.colour?.toLowerCase()] || '#999'}"></span>
        <span><strong>${p.name}</strong> · ${p.size} · ${p.ply}ply · ${p.weight}gm · 🧻${p.reelSize || '?'}"</span>
        <button class="btn-sm" style="margin-left:6px" onclick="editProduct(${ci},${pi})">✏️</button>
        <button class="btn-sm" style="color:var(--danger)" onclick="deleteProduct(${ci},${pi})">🗑</button>
      </div>
    `).join('');
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

function editClient(ci) {
  const c       = CLIENTS[ci];
  const name    = prompt('Client name:', c.name);      if (name    === null) return;
  const contact = prompt('Contact person:', c.contact); if (contact === null) return;
  const phone   = prompt('Phone:', c.phone);            if (phone   === null) return;
  const city    = prompt('City:', c.city);              if (city    === null) return;

  const originalName = c.name;
  CLIENTS[ci] = { ...c, name: name.trim(), contact: contact.trim(), phone: phone.trim(), city: city.trim() };
  renderClients();

  postClient({ action: 'saveClient', name: name.trim(), contact: contact.trim(), phone: phone.trim(), city: city.trim(), originalName });
  setTimeout(fetchClients, 2000);
}

function addNewClient() {
  const name    = prompt('Client name:');    if (!name) return;
  const contact = prompt('Contact person:'); if (contact === null) return;
  const phone   = prompt('Phone:');          if (phone   === null) return;
  const city    = prompt('City:');           if (city    === null) return;

  const client = { name: name.trim(), contact: contact.trim(), phone: phone.trim(), city: city.trim(), products: [] };
  CLIENTS.push(client);
  CLIENTS.sort((a, b) => a.name.localeCompare(b.name));
  renderClients();

  postClient({ action: 'saveClient', name: client.name, contact: client.contact, phone: client.phone, city: client.city });
  setTimeout(fetchClients, 2000);
}

function addProduct(ci) {
  const name     = prompt('Product name:');                  if (!name)     return;
  const size     = prompt('Box size:');                      if (!size)     return;
  const ply      = prompt('Ply (3/5/7):', '3');              if (!ply)      return;
  const colour   = prompt('Colour:', 'Red');                 if (!colour)   return;
  const weight   = prompt('Weight (gm):');                   if (!weight)   return;
  const reelSize = prompt('Reel Size (inches, e.g. 35.5):'); if (!reelSize) return;

  const product = { name: name.trim(), size: size.trim(), ply: ply.trim(), colour: colour.trim(), weight: weight.trim(), reelSize: reelSize.trim() };
  CLIENTS[ci].products.push(product);
  renderClients();

  postClient({ action: 'saveProduct', clientName: CLIENTS[ci].name, ...product });
  setTimeout(fetchClients, 2000);
}

function editProduct(ci, pi) {
  const p        = CLIENTS[ci].products[pi];
  const name     = prompt('Product name:', p.name);                if (name     === null) return;
  const size     = prompt('Box size:', p.size);                    if (size     === null) return;
  const ply      = prompt('Ply:', p.ply);                          if (ply      === null) return;
  const colour   = prompt('Colour:', p.colour);                    if (colour   === null) return;
  const weight   = prompt('Weight (gm):', p.weight);               if (weight   === null) return;
  const reelSize = prompt('Reel Size (inches):', p.reelSize || ''); if (reelSize === null) return;

  const originalName = p.name;
  const updated = { name: name.trim(), size: size.trim(), ply: ply.trim(), colour: colour.trim(), weight: weight.trim(), reelSize: reelSize.trim() };
  CLIENTS[ci].products[pi] = updated;
  renderClients();

  postClient({ action: 'saveProduct', clientName: CLIENTS[ci].name, ...updated, originalName });
  setTimeout(fetchClients, 2000);
}

function deleteProduct(ci, pi) {
  if (!confirm(`Delete "${CLIENTS[ci].products[pi].name}"?`)) return;
  const clientName  = CLIENTS[ci].name;
  const productName = CLIENTS[ci].products[pi].name;
  CLIENTS[ci].products.splice(pi, 1);
  renderClients();

  postClient({ action: 'deleteProduct', clientName, productName });
  setTimeout(fetchClients, 2000);
}

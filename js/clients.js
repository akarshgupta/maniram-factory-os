// ══════════════════════════════════════════════════════════════
// CLIENTS.JS — Client Data, Autocomplete, Product Dropdown
// ══════════════════════════════════════════════════════════════

const DEFAULT_CLIENTS = [
  {
    name: 'Gaida Enterprises', contact: 'Suresh Gaida', phone: '9800000001', city: 'Gwalior',
    products: [
      { name: 'JIO', size: '18×14×30', ply: '3', colour: 'Red', weight: '655' },
    ]
  },
  {
    name: 'NDS International', contact: 'Rajesh Kumar', phone: '9800000002', city: 'Jhansi',
    products: [
      { name: 'Kingfisher', size: '20×14×27', ply: '3', colour: 'Red',  weight: '648' },
      { name: 'Kanha',      size: '18×14×27', ply: '3', colour: 'Blue', weight: '611' },
    ]
  },
  {
    name: 'NDS Paper', contact: 'Rajesh Kumar', phone: '9800000003', city: 'Jhansi',
    products: [
      { name: 'Gulabjal', size: '20×14×28', ply: '3', colour: 'Red', weight: '701' },
    ]
  },
  {
    name: 'RP Products', contact: 'Ramesh Prasad', phone: '9800000004', city: 'Jhansi',
    products: [
      { name: 'Jalrani', size: '26×13×22', ply: '3', colour: 'Blue', weight: '641' },
    ]
  },
  {
    name: 'SSD', contact: 'SSD Contact', phone: '9800000005', city: 'Jhansi',
    products: [
      { name: 'SSD', size: '26×13×22', ply: '3', colour: 'Green', weight: '641' },
    ]
  },
];

// ── State ──
let CLIENTS = [];
let acSelectedIdx = -1;
let acFiltered    = [];

// ── Load / Save ──
function loadClients() {
  try {
    const stored = localStorage.getItem(LS_CLIENTS);
    if (stored) return JSON.parse(stored);
  } catch (e) {}
  localStorage.setItem(LS_CLIENTS, JSON.stringify(DEFAULT_CLIENTS));
  return JSON.parse(JSON.stringify(DEFAULT_CLIENTS));
}

function saveClients(data) {
  localStorage.setItem(LS_CLIENTS, JSON.stringify(data));
}

function sortedClients() {
  return [...CLIENTS].sort((a, b) => a.name.localeCompare(b.name));
}

function initClients() {
  CLIENTS = loadClients();
}

// ── Autocomplete ──
function onCustomerInput() {
  const val = document.getElementById('f-customer').value.trim().toLowerCase();
  const dd  = document.getElementById('customer-dropdown');
  if (!val) { dd.style.display = 'none'; acFiltered = []; return; }

  acFiltered    = sortedClients().filter(c => c.name.toLowerCase().includes(val));
  acSelectedIdx = -1;
  if (!acFiltered.length) { dd.style.display = 'none'; return; }

  dd.innerHTML = '';
  acFiltered.forEach((c, i) => {
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
  document.getElementById('f-customer').value          = name;
  document.getElementById('customer-dropdown').style.display = 'none';
  acFiltered    = [];
  acSelectedIdx = -1;
  populateProductDropdown(name);
  refreshOrderId();
}

// ── Product Dropdown ──
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
    const name   = prompt('Product name (e.g. Kingfisher):'); if (!name)   { sel.value = ''; return; }
    const size   = prompt('Box size (e.g. 20×14×27):');       if (!size)   { sel.value = ''; return; }
    const ply    = prompt('Ply (3/5/7):', '3');                if (!ply)    { sel.value = ''; return; }
    const colour = prompt('Print colour:', 'Red');             if (!colour) { sel.value = ''; return; }
    const weight = prompt('Weight (gm):');                     if (!weight) { sel.value = ''; return; }
    CLIENTS[ci].products.push({ name: name.trim(), size: size.trim(), ply: ply.trim(), colour: colour.trim(), weight: weight.trim() });
    saveClients(CLIENTS);
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

  document.getElementById('f-size').value   = p.size   || '';
  document.getElementById('f-ply').value    = p.ply    || '';
  document.getElementById('f-colour').value = p.colour || '';
  document.getElementById('f-weight').value = p.weight || '';
}

function clearProductFields() {
  ['f-size', 'f-ply', 'f-colour', 'f-weight'].forEach(id => {
    document.getElementById(id).value = '';
  });
}

// ── Clients Page Render ──
function renderClients() {
  const list = document.getElementById('clients-list');
  list.innerHTML = '';
  CLIENTS.forEach((c, ci) => {
    const card = document.createElement('div');
    card.className = 'client-card';
    const productsHtml = c.products.map((p, pi) => `
      <div class="product-chip" style="display:flex;align-items:center;gap:6px;padding:6px 12px;">
        <span class="colour-dot" style="background:${COLOUR_HEX[p.colour?.toLowerCase()] || '#999'}"></span>
        <span><strong>${p.name}</strong> · ${p.size} · ${p.ply}ply · ${p.weight}gm</span>
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
  const name    = prompt('Client name:', c.name);      if (name === null) return;
  const contact = prompt('Contact person:', c.contact); if (contact === null) return;
  const phone   = prompt('Phone:', c.phone);            if (phone === null) return;
  const city    = prompt('City:', c.city);              if (city === null) return;
  CLIENTS[ci]   = { ...c, name: name.trim(), contact: contact.trim(), phone: phone.trim(), city: city.trim() };
  saveClients(CLIENTS);
  renderClients();
}

function addNewClient() {
  const name    = prompt('Client name:');    if (!name) return;
  const contact = prompt('Contact person:'); if (contact === null) return;
  const phone   = prompt('Phone:');          if (phone === null) return;
  const city    = prompt('City:');           if (city === null) return;
  CLIENTS.push({ name: name.trim(), contact: contact.trim(), phone: phone.trim(), city: city.trim(), products: [] });
  CLIENTS.sort((a, b) => a.name.localeCompare(b.name));
  saveClients(CLIENTS);
  renderClients();
}

function addProduct(ci) {
  const name   = prompt('Product name:');     if (!name) return;
  const size   = prompt('Box size:');         if (!size) return;
  const ply    = prompt('Ply (3/5/7):', '3'); if (!ply) return;
  const colour = prompt('Colour:', 'Red');    if (!colour) return;
  const weight = prompt('Weight (gm):');      if (!weight) return;
  CLIENTS[ci].products.push({ name: name.trim(), size: size.trim(), ply: ply.trim(), colour: colour.trim(), weight: weight.trim() });
  saveClients(CLIENTS);
  renderClients();
}

function editProduct(ci, pi) {
  const p      = CLIENTS[ci].products[pi];
  const name   = prompt('Product name:', p.name);   if (name === null) return;
  const size   = prompt('Box size:', p.size);        if (size === null) return;
  const ply    = prompt('Ply:', p.ply);              if (ply === null) return;
  const colour = prompt('Colour:', p.colour);        if (colour === null) return;
  const weight = prompt('Weight (gm):', p.weight);   if (weight === null) return;
  CLIENTS[ci].products[pi] = { name: name.trim(), size: size.trim(), ply: ply.trim(), colour: colour.trim(), weight: weight.trim() };
  saveClients(CLIENTS);
  renderClients();
}

function deleteProduct(ci, pi) {
  if (!confirm(`Delete "${CLIENTS[ci].products[pi].name}"?`)) return;
  CLIENTS[ci].products.splice(pi, 1);
  saveClients(CLIENTS);
  renderClients();
}

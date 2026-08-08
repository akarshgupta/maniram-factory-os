// ══════════════════════════════════════════════════════════════
// CLIENTS.JS — Client Data, Autocomplete, Product Dropdown
// Data backend: Google Sheets (Clients + ClientProducts tabs in ORDERS_SHEET_ID)
// ══════════════════════════════════════════════════════════════

const pendingClientNames = new Set(); // saved locally, not yet confirmed in sheet

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

// ── Suggest Weight, Reel Size & Rate from box dimensions ──
// Sheet Length = (L+W)×2+2, Sheet Width (= reel size) = W+H+0.5, Area = SheetL×SheetW/1550
// (skills/rate-calculator.md). Reel size is the box-derived width itself — it must NOT be
// rounded up to a wider stocked reel, since that width also drives the weight calc below
// and a wider reel would overstate paper actually consumed per box. Weight depends on the
// actual paper, so this asks for GSM on each layer first (focuses the first blank one)
// rather than guessing a default and calculating on top of a guess. Rate is then estimated
// from that weight at the current paper cost (PAPER_RATE_PER_KG). All three fields stay
// plain number inputs, editable like any other value.
function suggestWeightAndReel() {
  const hint = document.getElementById('pm-suggest-hint');
  const dims = typeof _parseDims === 'function' ? _parseDims(document.getElementById('pm-size')?.value || '') : null;
  if (!dims || !dims.l || !dims.w || !dims.h) {
    if (hint) hint.textContent = 'Enter box size as L×W×H (all three dimensions) first.';
    return;
  }
  const { l, w, h } = dims;
  const ply    = parseInt(document.getElementById('pm-ply')?.value) || 3;
  const layers = PLY_LAYERS[ply] || PLY_LAYERS[3];

  const sheetLen = (l + w) * 2 + 2;
  const reelSize = w + h + 0.5;
  document.getElementById('pm-reelsize').value = reelSize;

  // Weight needs real GSM per layer — ask for it instead of assuming a default.
  const gsmInputs  = layers.map((_, i) => document.getElementById('pm-gsm-' + (i + 1)));
  const firstBlank = gsmInputs.find(inp => !inp || !(parseInt(inp.value) > 0));
  if (firstBlank) {
    if (hint) hint.innerHTML = `Reel size suggested: <b>${reelSize}"</b>. Now enter the <b>GSM</b> for each paper layer above, then click Suggest again to calculate weight.`;
    firstBlank.scrollIntoView({ behavior: 'smooth', block: 'center' });
    firstBlank.focus();
    return;
  }

  const area = (sheetLen * reelSize) / 1550; // sqm
  let weight = 0;
  const gsmUsed = layers.map((layer, i) => {
    const gsm = parseInt(gsmInputs[i].value);
    weight += gsm * area * (layer.type === 'fluting' ? 1.5 : 1);
    return gsm;
  });
  document.getElementById('pm-weight').value = weight.toFixed(1);

  const rate = (weight / 1000) * PAPER_RATE_PER_KG;
  const rateEl = document.getElementById('pm-rate');
  if (rateEl) rateEl.value = rate.toFixed(2);

  if (hint) {
    hint.innerHTML = `Sheet ${_fmtN(sheetLen)}×${_fmtN(reelSize)}" (${ply}-ply) → est. weight <b>${weight.toFixed(1)} gm</b> from GSM ${gsmUsed.join('/')} → suggested rate <b>₹${rate.toFixed(2)}</b>/pc @ ₹${PAPER_RATE_PER_KG}/kg paper. Edit any field above if actuals differ.`;
  }
}

// Weight depends on box size, ply, GSM per layer, and reel size — so if any
// of the three that already have values change after a Suggest, keep weight
// in sync instead of leaving it stale. Fires on every reel-size or GSM edit;
// does nothing (silently) until there's a real box size and at least one GSM
// value to work from, so it never fights with someone who hasn't gotten that
// far yet.
function recalcWeightFromReelSize() {
  const dims = typeof _parseDims === 'function' ? _parseDims(document.getElementById('pm-size')?.value || '') : null;
  const reelSize = parseFloat(document.getElementById('pm-reelsize')?.value);
  if (!dims || !dims.l || !dims.w || !reelSize) return;

  const ply    = parseInt(document.getElementById('pm-ply')?.value) || 3;
  const layers = PLY_LAYERS[ply] || PLY_LAYERS[3];
  const sheetLen = (dims.l + dims.w) * 2 + 2;
  const area     = (sheetLen * reelSize) / 1550;

  let weight = 0, anyGsm = false;
  layers.forEach((layer, i) => {
    const gsm = parseInt(document.getElementById('pm-gsm-' + (i + 1))?.value) || 0;
    if (gsm > 0) anyGsm = true;
    weight += gsm * area * (layer.type === 'fluting' ? 1.5 : 1);
  });
  if (!anyGsm) return;

  document.getElementById('pm-weight').value = weight.toFixed(1);
  const hint = document.getElementById('pm-suggest-hint');
  if (hint) hint.innerHTML = `Weight recalculated for reel <b>${reelSize}"</b> → <b>${weight.toFixed(1)} gm</b>. Edit either field above if actuals differ.`;
}

// ── State ──
let CLIENTS       = [];
let acSelectedIdx = -1;
let acFiltered    = [];
let _clientSearchQuery = '';
let _clientSortBy      = 'name';

// ── Client Modal State ──
let _clientModalIdx    = -1; // -1 = adding new
let _clientSaveCallback = null; // optional callback(name) after adding a new client
let _productModalCi  = -1;
let _productModalPi  = -1; // -1 = adding new
let _productModalCb  = null; // optional callback after save

// ── Print photo helpers ──
let _pmCurrentPhoto = null; // base64 string for the photo in the current open modal

function handlePrintPhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 900;
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      _pmCurrentPhoto = canvas.toDataURL('image/jpeg', 0.78);
      _showPhotoPreview(_pmCurrentPhoto);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function _showPhotoPreview(dataUrl) {
  const preview  = document.getElementById('pm-photo-preview');
  const imgEl    = document.getElementById('pm-photo-img');
  const clearBtn = document.getElementById('pm-photo-clear');
  if (preview)  preview.style.display  = dataUrl ? 'block' : 'none';
  if (imgEl)    imgEl.src              = dataUrl || '';
  if (clearBtn) clearBtn.style.display = dataUrl ? 'inline-block' : 'none';
}

function clearPrintPhoto() {
  _pmCurrentPhoto = null;
  _showPhotoPreview(null);
  const inp = document.getElementById('pm-print-photo');
  if (inp) inp.value = '';
}

function _photoKey(clientName, productName) {
  return `mi_print_photo_${clientName}__${productName}`;
}

// ── Print fields toggle in product modal ──
function toggleProductPrintFields() {
  const hasPrint = !!document.getElementById('pm-has-print')?.checked;
  const div = document.getElementById('pm-print-fields');
  if (div) div.style.display = hasPrint ? 'block' : 'none';
  _updatePmColourEcho();
  updateProductSchematic();
}

// Print colour is entered once, in the main Colour field — the printing
// section just echoes it back so it's never asked for twice.
function _updatePmColourEcho() {
  const echo = document.getElementById('pm-print-colour-echo');
  if (!echo) return;
  echo.textContent = document.getElementById('pm-colour')?.value.trim() || '—';
}

// ── Box blank schematic preview in product modal ──
function updateProductSchematic() {
  const preview = document.getElementById('pm-box-preview');
  if (!preview) return;
  const sizeStr = document.getElementById('pm-size')?.value || '';
  const dims = (typeof _parseDims === 'function') ? _parseDims(sizeStr) : null;
  if (!dims || !dims.l || !dims.w || !dims.h) {
    preview.innerHTML = '<span style="font-size:11px;color:#aaa">Enter box size above to preview</span>';
    return;
  }
  const hasPrint   = !!document.getElementById('pm-has-print')?.checked;
  const printDesc  = hasPrint ? (document.getElementById('pm-print-design')?.value || '') : '';
  const spec       = hasPrint ? { colours: 1, printDesc, printLines: printDesc.split('\n').filter(Boolean) } : null;
  if (typeof _buildSchematic === 'function') {
    preview.innerHTML = _buildSchematic(dims, spec);
    preview.style.display = 'block';
  }
}

// ── GSM + BF Grid (per paper layer — top to bottom) ──
function updateGsmFields(existingGsm, existingBf) {
  const grid = document.getElementById('pm-gsm-grid');
  if (!grid) return;
  const ply    = parseInt(document.getElementById('pm-ply')?.value) || 3;
  const layers = PLY_LAYERS[ply] || PLY_LAYERS[3];
  grid.innerHTML = layers.map((layer, i) => {
    const gsmVal      = Array.isArray(existingGsm) ? (existingGsm[i] || '') : '';
    const bfVal       = Array.isArray(existingBf) ? (existingBf[i] || '') : '';
    const isFluting   = layer.type === 'fluting';
    const accent      = isFluting ? '#FFA500' : '#2980B9';
    const placeholder = isFluting ? '100–150' : '120–200';
    return `<div style="display:flex;flex-direction:column;gap:3px">
      <label style="font-size:10px;font-weight:600;color:${accent}">${layer.label}</label>
      <div style="display:flex;gap:4px">
        <input class="form-input" type="number" id="pm-gsm-${i+1}"
          placeholder="GSM ${placeholder}" title="GSM" min="60" max="400" step="5"
          value="${gsmVal}"
          style="border-left:3px solid ${accent};padding-left:8px;flex:1;min-width:0"
          onkeydown="if(event.key==='Escape')closeProductModal()" oninput="recalcWeightFromReelSize()">
        <input class="form-input" type="number" id="pm-bf-${i+1}"
          placeholder="BF" title="Bursting Factor" min="10" max="40" step="1"
          value="${bfVal}"
          style="width:56px;flex:none"
          onkeydown="if(event.key==='Escape')closeProductModal()">
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════
// SHEETS DATA LAYER
// ══════════════════════════════════════════════════════════════

async function fetchClients() {
  try {
    const cUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CUSTOMERS_SHEET_ID}/values/${encodeURIComponent(CUSTOMERS_TAB + '!A1:D500')}?key=${API_KEY}`;
    const pUrl = `https://sheets.googleapis.com/v4/spreadsheets/${PRODUCTS_SHEET_ID}/values/${encodeURIComponent(PRODUCTS_TAB + '!A1:AB2000')}?key=${API_KEY}`;

    const [cRes, pRes]   = await Promise.all([fetch(cUrl), fetch(pUrl)]);
    const [cJson, pJson] = await Promise.all([cRes.json(), pRes.json()]);

    if (cJson.error) return false;

    const allCRows = (cJson.values || []).slice(1).filter(r => r[0]);
    // If the dedicated sheet is blank, signal failure so callers fall back to localStorage
    if (allCRows.length === 0) return false;

    const pRows = (pJson.values || []).slice(1);

    // Snapshot pending local-only clients before we overwrite — a client just
    // saved via "+ New Client" may not have propagated to the sheet yet
    // (writes are fire-and-forget), and this fetch runs 2s after every save.
    const stillPending = CLIENTS.filter(c => pendingClientNames.has(c.name));

    CLIENTS = allCRows.map(r => {
        pendingClientNames.delete(r[0]); // confirmed in sheet
        return {
        name:     r[0] || '',
        contact:  r[1] || '',
        phone:    r[2] || '',
        city:     r[3] || '',
        products: pRows
          .filter(p => p[0] === r[0])
          .map(p => ({
            name:        p[1] || '',
            size:        p[2] || '',
            ply:         p[3] || '',
            colour:      p[4] || '',
            weight:      p[5] || '',
            reelSize:    p[6] || '',
            // Zero-padded, NOT filtered — index i must line up with PLY_LAYERS[ply][i]
            gsm:         [p[7],p[8],p[9],p[10],p[11],p[12],p[13],p[14],p[15]].map(v => Number(v) || 0),
            hasPrint:    String(p[16] || '').toUpperCase() === 'TRUE' || p[16] === '1' || p[16] === true,
            printColour: p[17] || '',
            printDesign: p[18] || '',
            bf:          [p[19],p[20],p[21],p[22],p[23],p[24],p[25],p[26],p[27]].map(v => Number(v) || 0),
          })),
      };
      });

    // Re-inject any locally-saved clients the sheet hasn't confirmed yet
    stillPending.forEach(c => { if (pendingClientNames.has(c.name)) CLIENTS.push(c); });
    CLIENTS.sort((a, b) => a.name.localeCompare(b.name));

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

// true = clients were loaded from Google Sheets; false = loaded from localStorage/defaults
let _clientsFromSheet = false;

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
    _clientsFromSheet = false;
  } else {
    localStorage.removeItem(LS_CLIENTS);
    _clientsFromSheet = true;
  }
}

// ── One-click migration: reads directly from Orders sheet → new dedicated sheets ──
async function runClientMigration() {
  const statusEl = document.getElementById('migration-status');
  const btn      = document.querySelector('#client-migration-banner .btn-primary');

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Reading Orders sheet…'; }
  if (statusEl) statusEl.textContent = 'Looking for client data…';

  try {
    const cUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CUSTOMERS_SHEET_ID}/values/${encodeURIComponent(CUSTOMERS_TAB + '!A2:D500')}?key=${API_KEY}`;
    const pUrl = `https://sheets.googleapis.com/v4/spreadsheets/${PRODUCTS_SHEET_ID}/values/${encodeURIComponent(PRODUCTS_TAB + '!A2:S2000')}?key=${API_KEY}`;

    const [cRes, pRes]   = await Promise.all([fetch(cUrl), fetch(pUrl)]);
    const [cJson, pJson] = await Promise.all([cRes.json(), pRes.json()]);

    let cRows = (cJson.values || []).filter(r => r[0]);
    let pRows = (pJson.values || []).filter(r => r[0] && r[1]);

    // Dedicated sheets are blank — fall back to in-memory CLIENTS, then localStorage
    if (!cRows.length) {
      let source = CLIENTS.length > 0 ? CLIENTS : null;
      if (!source) {
        const stored = localStorage.getItem(LS_CLIENTS);
        source = stored ? JSON.parse(stored) : JSON.parse(JSON.stringify(DEFAULT_CLIENTS));
      }
      if (source && source.length > 0) {
        cRows = source.map(c => [c.name, c.contact || '', c.phone || '', c.city || '']);
        pRows = source.flatMap(c =>
          (c.products || []).map(p => [c.name, p.name, p.size||'', p.ply||'',
            p.colour||'', p.weight||'', p.reelSize||'', ...(p.gsm||[])])
        );
      }
    }

    if (!cRows.length) {
      if (statusEl) statusEl.textContent = '⚠️ No client data found. Please add clients manually.';
      if (btn) { btn.disabled = false; btn.textContent = '📤 Retry'; }
      return;
    }

    if (btn) btn.textContent = '⏳ Writing…';
    if (statusEl) statusEl.textContent = `Found ${cRows.length} clients — copying to new sheets…`;

    const reqs = cRows.map(r =>
      postClient({ action: 'saveClient', name: r[0], contact: r[1]||'', phone: r[2]||'', city: r[3]||'' })
    );
    for (const p of pRows) {
      const gsm = [p[7],p[8],p[9],p[10],p[11],p[12],p[13],p[14],p[15]].map(Number).filter(v => v > 0);
      reqs.push(postClient({
        action: 'saveProduct', clientName: p[0], name: p[1],
        size: p[2]||'', ply: p[3]||'', colour: p[4]||'', weight: p[5]||'', reelSize: p[6]||'', gsm
      }));
    }

    await Promise.all(reqs);
    await new Promise(r => setTimeout(r, 3000)); // wait for Apps Script to write

    localStorage.setItem('mi_new_sheets_migrated', '1');
    if (statusEl) statusEl.textContent = `✅ ${cRows.length} clients + ${pRows.length} products copied. Reloading…`;
    if (btn) btn.textContent = '✅ Done';
    setTimeout(() => window.location.reload(), 2500);
  } catch (e) {
    if (statusEl) statusEl.textContent = '❌ Error: ' + e.message;
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
  if (p.rate) document.getElementById('f-rate').value = p.rate;

  checkStockForCurrentOrder();
}

function clearProductFields() {
  ['f-size', 'f-ply', 'f-colour', 'f-weight', 'f-reel-size'].forEach(id => {
    document.getElementById(id).value = '';
  });
  const hint = document.getElementById('f-size-in');
  if (hint) hint.textContent = '';
  hideStockCheck();
}

// ══════════════════════════════════════════════════════════════
// CLIENTS PAGE — Render & CRUD
// ══════════════════════════════════════════════════════════════

// ── Per-client order stats — orders count, boxes, revenue, and an estimated
// profit (revenue minus paper cost, costed at PAPER_RATE_PER_KG the same way
// clients.js suggests a rate) — plus the most recent delivery date across
// their orders, used to spot clients who've gone quiet. Cancelled orders
// don't count as business; every other status does, delivered or not.
function _clientOrderStats(name) {
  const empty = { orderCount: 0, totalQty: 0, revenue: 0, estProfit: 0, lastDate: null, daysSince: null };
  if (typeof orders === 'undefined' || !name) return empty;
  const needle = name.trim().toLowerCase();
  const mine = orders.filter(o => o.status !== 'Cancelled' && (o.customer || '').trim().toLowerCase() === needle);
  if (!mine.length) return empty;

  let totalQty = 0, revenue = 0, cost = 0, lastDate = null;
  const paperRate = typeof PAPER_RATE_PER_KG !== 'undefined' ? PAPER_RATE_PER_KG : 60;
  mine.forEach(o => {
    const qty    = parseInt(o.qty) || 0;
    const rate   = parseFloat(o.rate) || 0;
    const weight = parseFloat(o.weight) || 0;
    totalQty += qty;
    revenue  += qty * rate;
    cost     += (weight / 1000) * qty * paperRate;
    if (o.date && (!lastDate || o.date > lastDate)) lastDate = o.date;
  });
  const daysSince = lastDate ? Math.floor((Date.now() - new Date(lastDate + 'T00:00:00').getTime()) / 86400000) : null;
  return { orderCount: mine.length, totalQty, revenue, estProfit: revenue - cost, lastDate, daysSince };
}

function onClientSearch() {
  _clientSearchQuery = (document.getElementById('client-search')?.value || '').trim().toLowerCase();
  renderClients();
}

function onClientSortChange() {
  _clientSortBy = document.getElementById('client-sort')?.value || 'name';
  renderClients();
}

function renderClients() {
  const banner = document.getElementById('client-migration-banner');
  if (banner) banner.style.display = _clientsFromSheet ? 'none' : 'block';

  const list = document.getElementById('clients-list');
  list.innerHTML = '';

  let rows = CLIENTS.map((c, ci) => ({ c, ci, stats: _clientOrderStats(c.name) }));

  const topRow    = rows.reduce((best, r) => (r.stats.revenue > (best ? best.stats.revenue : 0)) ? r : best, null);
  const quietRows = rows.filter(r => r.stats.daysSince !== null && r.stats.daysSince >= 60);

  const summaryEl = document.getElementById('clients-summary');
  if (summaryEl) {
    summaryEl.innerHTML = rows.length ? `
      <div class="client-summary-strip">
        <div class="client-summary-card">
          <div class="cs-label">🏆 Top Client (by revenue)</div>
          <div class="cs-value">${topRow && topRow.stats.revenue > 0 ? topRow.c.name : '—'}</div>
          ${topRow && topRow.stats.revenue > 0 ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">₹${Math.round(topRow.stats.revenue).toLocaleString('en-IN')} across ${topRow.stats.orderCount} order${topRow.stats.orderCount > 1 ? 's' : ''}</div>` : ''}
        </div>
        <div class="client-summary-card">
          <div class="cs-label">📦 Total Clients</div>
          <div class="cs-value">${rows.length}</div>
        </div>
        <div class="client-summary-card">
          <div class="cs-label">⚠️ Quiet 60+ Days</div>
          <div class="cs-value" style="${quietRows.length ? 'color:var(--danger)' : ''}">${quietRows.length}</div>
          ${quietRows.length ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">${quietRows.slice(0, 3).map(r => r.c.name).join(', ')}${quietRows.length > 3 ? ` +${quietRows.length - 3} more` : ''}</div>` : ''}
        </div>
      </div>
      <div class="field-hint" style="margin-top:8px">Revenue and Est. Profit are computed from saved order quantities and rates; Est. Profit only subtracts paper cost (weight × ${typeof PAPER_RATE_PER_KG !== 'undefined' ? PAPER_RATE_PER_KG : 60}/kg) — it doesn't include labour, overhead, or other materials, so treat it as a rough ranking, not an exact number.</div>` : '';
  }

  if (_clientSearchQuery) {
    rows = rows.filter(r =>
      r.c.name.toLowerCase().includes(_clientSearchQuery) ||
      (r.c.contact || '').toLowerCase().includes(_clientSearchQuery) ||
      (r.c.city || '').toLowerCase().includes(_clientSearchQuery)
    );
  }

  rows.sort((a, b) => {
    if (_clientSortBy === 'revenue') return b.stats.revenue - a.stats.revenue;
    if (_clientSortBy === 'profit')  return b.stats.estProfit - a.stats.estProfit;
    if (_clientSortBy === 'orders')  return b.stats.orderCount - a.stats.orderCount;
    if (_clientSortBy === 'stale') {
      // Never-ordered clients first, then oldest last-order first.
      if (a.stats.lastDate === null && b.stats.lastDate === null) return a.c.name.localeCompare(b.c.name);
      if (a.stats.lastDate === null) return -1;
      if (b.stats.lastDate === null) return 1;
      return a.stats.lastDate.localeCompare(b.stats.lastDate);
    }
    return a.c.name.localeCompare(b.c.name);
  });

  if (!rows.length) {
    list.innerHTML = `<div class="empty-state">${_clientSearchQuery ? 'No clients match your search.' : 'No clients yet.'}</div>`;
  }

  rows.forEach(({ c, ci, stats }) => {
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

    const isTop   = !!(topRow && topRow.c === c && stats.revenue > 0);
    const isQuiet = stats.daysSince !== null && stats.daysSince >= 60;
    const lastOrderLbl = stats.lastDate
      ? (stats.daysSince < 0 ? 'Upcoming' : stats.daysSince === 0 ? 'Today' : `${stats.daysSince}d ago`)
      : 'Never';

    card.innerHTML = `
      <div class="client-card-header">
        <div class="client-avatar">${c.name[0]}</div>
        <div>
          <div class="client-name">${c.name}${isTop ? '<span class="client-badge client-badge-top">🏆 Top Client</span>' : ''}${isQuiet ? `<span class="client-badge client-badge-quiet">⚠️ Quiet ${stats.daysSince}d</span>` : ''}</div>
          <div class="client-meta">${c.contact || '—'} · ${c.city || '—'} · ${c.phone || '—'}</div>
        </div>
        <div class="client-edit-btn" style="display:flex;gap:6px">
          <button class="btn-sm" onclick="editClient(${ci})">✏️ Edit</button>
          <button class="btn-sm" style="color:var(--success)" onclick="addProduct(${ci})">+ Product</button>
        </div>
      </div>
      <div class="client-stats-row">
        <div class="client-stat">Orders<strong>${stats.orderCount}</strong></div>
        <div class="client-stat">Boxes<strong>${stats.totalQty.toLocaleString('en-IN')}</strong></div>
        <div class="client-stat">Revenue<strong>${stats.revenue ? '₹' + Math.round(stats.revenue).toLocaleString('en-IN') : '—'}</strong></div>
        <div class="client-stat">Est. Profit<strong style="${stats.estProfit > 0 ? 'color:var(--success)' : stats.estProfit < 0 ? 'color:var(--danger)' : ''}">${stats.revenue ? '₹' + Math.round(stats.estProfit).toLocaleString('en-IN') : '—'}</strong></div>
        <div class="client-stat">Last Order<strong style="${isQuiet ? 'color:var(--danger)' : ''}">${lastOrderLbl}</strong></div>
      </div>
      <details>
        <summary class="client-products-toggle">${c.products.length} product${c.products.length === 1 ? '' : 's'}</summary>
        <div class="client-products">${productsHtml || '<span style="font-size:12px;color:var(--muted)">No products defined yet</span>'}</div>
      </details>
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

  // Case-insensitive duplicate check — without this, adding a client whose
  // name already exists silently pushed a second CLIENTS entry with the
  // same name (products on the duplicate become unreachable, since every
  // by-name lookup elsewhere finds only the first match).
  const dupIdx = CLIENTS.findIndex((c, i) => i !== _clientModalIdx && c.name.toLowerCase() === name.toLowerCase());
  if (dupIdx >= 0) {
    const existing = CLIENTS[dupIdx];
    if (_clientModalIdx < 0 && confirm(`"${existing.name}" is already a saved client. Use the existing client instead of adding a duplicate?`)) {
      closeClientModal();
      if (_clientSaveCallback) { _clientSaveCallback(existing.name); _clientSaveCallback = null; }
      return;
    }
    alert(`A client named "${existing.name}" already exists. Please use a different name, or pick them from the Customer field instead.`);
    document.getElementById('cm-name').focus();
    return;
  }

  if (_clientModalIdx >= 0) {
    const originalName = CLIENTS[_clientModalIdx].name;
    CLIENTS[_clientModalIdx] = { ...CLIENTS[_clientModalIdx], name, contact, phone, city };
    postClient({ action: 'saveClient', name, contact, phone, city, originalName });
  } else {
    CLIENTS.push({ name, contact, phone, city, products: [] });
    CLIENTS.sort((a, b) => a.name.localeCompare(b.name));
    pendingClientNames.add(name);
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
  const pmRate = document.getElementById('pm-rate');
  if (pmRate) pmRate.value = p ? (p.rate || '') : '';
  // Print fields — print colour reuses the Colour field above, never asked twice
  const hpEl = document.getElementById('pm-has-print');
  if (hpEl) hpEl.checked = p ? !!p.hasPrint : false;
  const pdEl = document.getElementById('pm-print-design');
  if (pdEl) pdEl.value = p ? (p.printDesign || '') : '';
  _updatePmColourEcho();
  // Print photo
  _pmCurrentPhoto = null;
  if (p) {
    const stored = localStorage.getItem(_photoKey(CLIENTS[ci].name, p.name));
    if (stored) _pmCurrentPhoto = stored;
  }
  _showPhotoPreview(_pmCurrentPhoto);
  const inp = document.getElementById('pm-print-photo');
  if (inp) inp.value = '';
  toggleProductPrintFields();
  document.getElementById('product-modal-overlay').style.display = 'flex';
  updateGsmFields(p ? p.gsm : null, p ? p.bf : null);
  if (typeof convertSizeCmIn === 'function') convertSizeCmIn('pm-size', 'pm-size-in');
  setTimeout(updateProductSchematic, 60);
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
  const rate     = document.getElementById('pm-rate')?.value.trim() || '';
  const layers   = PLY_LAYERS[parseInt(ply)] || PLY_LAYERS[3];
  // gsm/bf keep one slot per layer (including zeros) so index i always lines up with PLY_LAYERS[i]
  const gsm      = layers.map((_, i) => parseInt(document.getElementById('pm-gsm-' + (i+1))?.value) || 0);
  const bf       = layers.map((_, i) => parseInt(document.getElementById('pm-bf-'  + (i+1))?.value) || 0);

  if (!name) { document.getElementById('pm-name').focus(); return; }
  if (!size) { document.getElementById('pm-size').focus(); return; }

  const hasPrint    = !!document.getElementById('pm-has-print')?.checked;
  const printColour = hasPrint ? colour : ''; // same value as the Colour field — never asked twice
  const printDesign = hasPrint ? (document.getElementById('pm-print-design')?.value || '') : '';
  const product = { name, size, ply, colour, weight, reelSize, rate, gsm, bf, hasPrint, printColour, printDesign };
  const ci      = _productModalCi;

  if (_productModalPi >= 0) {
    const originalName = CLIENTS[ci].products[_productModalPi].name;
    CLIENTS[ci].products[_productModalPi] = product;
    postClient({ action: 'saveProduct', clientName: CLIENTS[ci].name, ...product, gsm, bf, originalName });
  } else {
    CLIENTS[ci].products.push(product);
    postClient({ action: 'saveProduct', clientName: CLIENTS[ci].name, ...product, gsm, bf });
  }

  // Save / remove print reference photo in localStorage
  const key = _photoKey(CLIENTS[ci].name, name);
  let photoSaveFailed = false;
  if (hasPrint && _pmCurrentPhoto) {
    try { localStorage.setItem(key, _pmCurrentPhoto); }
    catch (e) { photoSaveFailed = true; } // storage full — everything else in this save still went through
  } else if (!hasPrint || !_pmCurrentPhoto) {
    localStorage.removeItem(key);
  }
  if (photoSaveFailed) {
    alert('Product saved, but the reference photo is too large to store — storage is full. Everything else was saved; try a smaller photo or clear old ones (Clients page → open another product → Remove Photo).');
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

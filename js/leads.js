// ══════════════════════════════════════════════════════════════
// LEADS.JS — Lead Tracker & Callback Scheduler
// Data backend: Google Sheets (LEADS_SHEET_ID) — reads live, writes via
// Apps Script (saveLead/deleteLead action). localStorage is the offline
// cache/fallback (mirrorToSheet pattern, same as everywhere else) — the
// page works fully before LEADS_SHEET_ID is even set up.
// ══════════════════════════════════════════════════════════════

const LS_LEADS = 'mi_leads_v1';
let leadList = [];
let _leadsFromSheet = false;
let _leadFilterStatus = 'active'; // 'active' = everything but Converted/Lost

const LEAD_STATUSES = ['New', 'Contacted', 'Interested', 'Negotiating', 'Converted', 'Lost'];
const LEAD_DONE_STATUSES = ['Converted', 'Lost'];

const LEAD_STATUS_COLOURS = {
  New:         '#2980B9',
  Contacted:   '#8E44AD',
  Interested:  '#D68910',
  Negotiating: '#C0392B',
  Converted:   '#1E8449',
  Lost:        '#7F8C8D',
};

// Days until the next call, by status — used only to SUGGEST a Next Call
// Date (shown via the 🧮 Suggest button and after logging a call); the
// field itself always stays freely editable per lead. Converted/Lost are
// terminal — no callback is suggested for either.
const LEAD_CALLBACK_DAYS = { New: 1, Contacted: 3, Interested: 5, Negotiating: 2, Converted: null, Lost: null };

function suggestNextCallDate(status, fromDate) {
  const days = LEAD_CALLBACK_DAYS[status];
  if (days === null || days === undefined) return '';
  const base = fromDate ? new Date(fromDate + 'T00:00:00') : new Date(todayStr + 'T00:00:00');
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadLeads()    { try { return JSON.parse(localStorage.getItem(LS_LEADS) || '[]'); } catch { return []; } }
function saveLeadList() { localStorage.setItem(LS_LEADS, JSON.stringify(leadList)); }
function initLeads()    { leadList = loadLeads(); }

function generateLeadId() {
  let max = 0;
  leadList.forEach(l => {
    const m = String(l.id || '').match(/LEAD(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1]));
  });
  return 'LEAD' + String(max + 1).padStart(3, '0');
}

async function fetchLeads() {
  try {
    if (!LEADS_SHEET_ID) return false; // not set up yet — localStorage is the only store for now
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${LEADS_SHEET_ID}/values/${encodeURIComponent(LEADS_TAB + '!A1:J2000')}?key=${API_KEY}`;
    const res  = await fetch(url);
    const json = await res.json();
    if (json.error) return false;

    const rows = (json.values || []).slice(1).filter(r => r[0]);
    if (!rows.length) return false; // blank sheet — keep whatever's in localStorage

    leadList = rows.map(r => ({
      id:          r[0] || '',
      name:        r[1] || '',
      company:     r[2] || '',
      phone:       r[3] || '',
      source:      r[4] || '',
      status:      r[5] || 'New',
      lastContact: r[6] || '',
      nextCall:    r[7] || '',
      notes:       r[8] || '',
      createdAt:   r[9] || '',
    }));
    _leadsFromSheet = true;
    saveLeadList();
    return true;
  } catch (e) { return false; }
}

function _mirrorLead(l) {
  if (typeof mirrorToSheet !== 'function') return;
  mirrorToSheet('saveLead', { ...l });
}

// ── Callback-due helpers — shared by the nav badge, dashboard banner, and list sort ──
function _leadsDue() {
  return leadList.filter(l => l.nextCall && l.nextCall <= todayStr && !LEAD_DONE_STATUSES.includes(l.status));
}

function updateLeadsBadge() {
  const count = _leadsDue().length;
  const badge = document.getElementById('leads-badge');
  if (badge) { badge.style.display = count ? 'inline-block' : 'none'; badge.textContent = count; }
}

function renderDashboardLeadsBanner() {
  const banner = document.getElementById('dashboard-leads-banner');
  if (!banner) return;
  const due = _leadsDue().sort((a, b) => (a.nextCall < b.nextCall ? -1 : 1));
  if (!due.length) { banner.style.display = 'none'; return; }

  banner.style.display = 'block';
  banner.innerHTML = `<div style="font-weight:700;margin-bottom:6px">📞 ${due.length} lead${due.length > 1 ? 's' : ''} due for a callback</div>` +
    due.slice(0, 6).map(l => `<div style="font-size:12px;margin-top:2px">→ <strong>${l.name}</strong>${l.company ? ' · ' + l.company : ''}${l.phone ? ' · ' + l.phone : ''} · ${l.status}${l.nextCall < todayStr ? ' <span style="color:#C0392B;font-weight:700">(overdue)</span>' : ''}
      <button class="btn-secondary" style="font-size:10px;padding:2px 8px;margin-left:8px" onclick="showPage('leads');logLeadCall('${l.id}')">📞 Log Call</button></div>`).join('') +
    (due.length > 6 ? `<div style="font-size:11px;margin-top:6px">+ ${due.length - 6} more — see Leads page</div>` : '');
}

// ── Quick action: mark a call as made right now — sets Last Contact to
// today and re-suggests Next Call from the lead's current status. Doesn't
// touch Status (a call that changes the lead's stage needs the full Edit
// form), but covers the common "called, still same stage, push the date"
// case in one click. ──
function logLeadCall(id) {
  const l = leadList.find(x => x.id === id);
  if (!l) return;
  l.lastContact = todayStr;
  l.nextCall    = suggestNextCallDate(l.status, todayStr);
  saveLeadList();
  _mirrorLead(l);
  renderLeadsPage();
  updateLeadsBadge();
  renderDashboardLeadsBanner();
}

function deleteLead(id) {
  if (!confirm('Delete this lead? This cannot be undone.')) return;
  leadList = leadList.filter(l => l.id !== id);
  saveLeadList();
  if (typeof mirrorToSheet === 'function') mirrorToSheet('deleteLead', { id });
  renderLeadsPage();
  updateLeadsBadge();
  renderDashboardLeadsBanner();
}

// Hands the lead's basic details to "+ New Client" so converting a won
// lead into a real customer doesn't mean retyping name/phone — mirrors
// how a Quotation can already be added as a client. Marks the lead
// Converted rather than deleting it, so the pipeline history stays intact.
function convertLeadToClient(id) {
  const l = leadList.find(x => x.id === id);
  if (!l) return;
  openClientModal(-1, () => {
    l.status   = 'Converted';
    l.nextCall = '';
    saveLeadList();
    _mirrorLead(l);
    renderLeadsPage();
    updateLeadsBadge();
    renderDashboardLeadsBanner();
  });
  setTimeout(() => {
    document.getElementById('cm-name').value  = l.name || '';
    document.getElementById('cm-phone').value = l.phone || '';
  }, 0);
}

// ── Add/Edit Lead modal ──
let _leadModalId = null; // null = adding new

function openLeadModal(id) {
  _leadModalId = id || null;
  const l = id ? leadList.find(x => x.id === id) : null;
  const overlay = document.getElementById('lead-modal-overlay');
  if (!overlay) return;

  document.getElementById('lead-modal-title').textContent = l ? 'Edit Lead' : 'Add Lead';
  document.getElementById('lm-name').value    = l ? l.name    : '';
  document.getElementById('lm-company').value = l ? l.company : '';
  document.getElementById('lm-phone').value   = l ? l.phone   : '';
  document.getElementById('lm-source').value  = l ? l.source  : '';
  document.getElementById('lm-status').value  = l ? l.status  : 'New';
  document.getElementById('lm-last-contact').value = l ? (l.lastContact || '') : '';
  document.getElementById('lm-next-call').value    = l ? (l.nextCall || '')    : '';
  document.getElementById('lm-notes').value   = l ? l.notes   : '';

  overlay.style.display = 'flex';
  document.getElementById('lm-name').focus();
}

function closeLeadModal() {
  document.getElementById('lead-modal-overlay').style.display = 'none';
  _leadModalId = null;
}

// Fills Next Call from the cadence rule for whatever Status is currently
// selected — a starting point, not a lock; stays editable right after.
function suggestLeadNextCall() {
  const status = document.getElementById('lm-status').value;
  const from   = document.getElementById('lm-last-contact').value || todayStr;
  document.getElementById('lm-next-call').value = suggestNextCallDate(status, from);
}

function saveLeadModal() {
  const name = document.getElementById('lm-name').value.trim();
  if (!name) { document.getElementById('lm-name').focus(); return; }

  const l = {
    id:          _leadModalId || generateLeadId(),
    name,
    company:     document.getElementById('lm-company').value.trim(),
    phone:       document.getElementById('lm-phone').value.trim(),
    source:      document.getElementById('lm-source').value.trim(),
    status:      document.getElementById('lm-status').value,
    lastContact: document.getElementById('lm-last-contact').value,
    nextCall:    document.getElementById('lm-next-call').value,
    notes:       document.getElementById('lm-notes').value.trim(),
    createdAt:   _leadModalId ? (leadList.find(x => x.id === _leadModalId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
  };

  const idx = leadList.findIndex(x => x.id === l.id);
  if (idx >= 0) leadList[idx] = l; else leadList.unshift(l);
  saveLeadList();
  _mirrorLead(l);

  closeLeadModal();
  renderLeadsPage();
  updateLeadsBadge();
  renderDashboardLeadsBanner();
}

// ── Leads Page ──
function setLeadFilter(status) {
  _leadFilterStatus = status;
  renderLeadsPage();
}

function renderLeadsPage() {
  const el = document.getElementById('leads-root');
  if (!el) return;

  const filtered = leadList.filter(l => {
    if (_leadFilterStatus === 'active') return !LEAD_DONE_STATUSES.includes(l.status);
    if (_leadFilterStatus === 'all') return true;
    return l.status === _leadFilterStatus;
  });

  // Soonest callback first; leads with no Next Call Date sort to the end.
  const sorted = filtered.slice().sort((a, b) => {
    if (!a.nextCall && !b.nextCall) return 0;
    if (!a.nextCall) return 1;
    if (!b.nextCall) return -1;
    return a.nextCall < b.nextCall ? -1 : 1;
  });

  const due = _leadsDue().length;
  const filterBtn = (val, label) => `<button class="btn-secondary" style="font-size:12px;padding:6px 14px;${_leadFilterStatus === val ? 'background:var(--accent,#2980B9);color:#fff;border-color:var(--accent,#2980B9)' : ''}" onclick="setLeadFilter('${val}')">${label}</button>`;

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
        <div class="stat-card ${due ? 'warn' : 'good'}" style="padding:10px 16px;min-width:140px">
          <div class="stat-label">Due for Callback</div>
          <div class="stat-value" style="color:${due ? 'var(--danger)' : 'var(--success)'};font-size:18px">${due}</div>
        </div>
        <div class="stat-card info" style="padding:10px 16px;min-width:100px">
          <div class="stat-label">Total Leads</div>
          <div class="stat-value">${leadList.length}</div>
        </div>
      </div>
      <button class="btn-primary" onclick="openLeadModal(null)" style="font-size:13px">+ New Lead</button>
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      ${filterBtn('active', 'Active')}
      ${filterBtn('all', 'All')}
      ${LEAD_STATUSES.map(s => filterBtn(s, s)).join('')}
    </div>

    ${!_leadsFromSheet ? `<div class="field-hint" style="margin-bottom:12px">📴 Leads sheet isn't set up yet — everything above is saved to this browser only. Ask to have <code>setupSheets()</code> run in Apps Script to back this up to Google Sheets and sync across devices.</div>` : ''}

    ${sorted.length === 0
      ? '<div class="empty-state">No leads here. Click "+ New Lead" to add one.</div>'
      : `<div class="card">
          <div class="card-body" style="padding:0">
            <div class="orders-table">
              <div class="table-header" style="grid-template-columns:1.3fr 1fr 90px 100px 100px 1.2fr 150px">
                <div>Lead</div><div>Company / Source</div><div>Status</div><div>Last Contact</div><div>Next Call</div><div>Notes</div><div>Actions</div>
              </div>
              ${sorted.map(l => {
                const overdue  = l.nextCall && l.nextCall < todayStr && !LEAD_DONE_STATUSES.includes(l.status);
                const dueToday = l.nextCall === todayStr && !LEAD_DONE_STATUSES.includes(l.status);
                const nextCallColour = overdue ? 'var(--danger)' : (dueToday ? '#D68910' : 'inherit');
                return `
                <div class="table-row" style="grid-template-columns:1.3fr 1fr 90px 100px 100px 1.2fr 150px">
                  <div>
                    <div style="font-weight:700;font-size:13px">${l.name}</div>
                    <div style="font-size:11px;color:var(--muted)">${l.phone || '—'}</div>
                  </div>
                  <div style="font-size:12px">${l.company || '—'}${l.source ? `<div style="font-size:10px;color:var(--muted)">via ${l.source}</div>` : ''}</div>
                  <div><span style="font-size:10px;font-weight:700;color:#fff;background:${LEAD_STATUS_COLOURS[l.status] || '#7F8C8D'};padding:2px 8px;border-radius:10px">${l.status}</span></div>
                  <div style="font-size:12px">${l.lastContact ? formatDate(l.lastContact) : '—'}</div>
                  <div style="font-size:12px;font-weight:700;color:${nextCallColour}">${l.nextCall ? formatDate(l.nextCall) : '—'}${overdue ? ' ⚠' : ''}</div>
                  <div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(l.notes || '').replace(/"/g,'&quot;')}">${l.notes || '—'}</div>
                  <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap">
                    <button class="btn-secondary" style="font-size:10px;padding:3px 7px" onclick="logLeadCall('${l.id}')" title="Log a call made today">📞</button>
                    <button class="btn-secondary" style="font-size:10px;padding:3px 7px" onclick="openLeadModal('${l.id}')" title="Edit">✏️</button>
                    ${!LEAD_DONE_STATUSES.includes(l.status) ? `<button class="btn-secondary" style="font-size:10px;padding:3px 7px" onclick="convertLeadToClient('${l.id}')" title="Convert to Client">🤝</button>` : ''}
                    <button style="background:none;border:none;cursor:pointer;font-size:15px;color:var(--danger)" onclick="deleteLead('${l.id}')" title="Delete">🗑</button>
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>`
    }
  `;
}

async function loadLeadsPage() {
  renderLeadsPage();
  const ok = await fetchLeads();
  if (ok) renderLeadsPage();
  updateLeadsBadge();
  renderDashboardLeadsBanner();
}

// ══════════════════════════════════════════════════════════════
// LEADS.JS — Sales Pipeline / Lead Register
// Tracks prospective customers from first contact through Won/Lost.
// Separate from Clients & Product Master (js/clients.js), which is
// for parties already placing orders — marking a lead Won offers to
// create a real Client record so contact details aren't re-typed.
// localStorage is the live store; sheet writes are fire-and-forget
// mirrors via LEADS_SHEET_ID, same blank-until-configured pattern as
// Invoices/Expenses/Receivables/Challans/Quotations (js/config.js).
// ══════════════════════════════════════════════════════════════

const LS_LEADS = 'mi_leads_v1';
const LEAD_STATUSES = ['Hot', 'Warm', 'Cold', 'Won', 'Lost'];
const LEAD_STATUS_COLOR = {
  Hot:  { bg: '#FFF3E0', text: '#B45309', ring: '#FDBA74' },
  Warm: { bg: '#EFF6FF', text: '#1D4ED8', ring: '#93C5FD' },
  Cold: { bg: '#F1F5F9', text: '#475569', ring: '#CBD5E1' },
  Won:  { bg: '#F0FDF4', text: '#15803D', ring: '#86EFAC' },
  Lost: { bg: '#F8FAFC', text: '#94A3B8', ring: '#E2E8F0' },
};
// Follow-up cadence in days, per the sheet's own "How to Use" rules —
// used only to suggest the next follow-up date after logging a touch.
const LEAD_FOLLOWUP_CADENCE = { Hot: 3, Warm: 6, Cold: 40 };

// Seeded from the owner's SALES_AND_MARKETS.xlsx Lead Register on first run —
// only used if nothing is in localStorage yet (a fresh install), never
// re-applied over real data.
const DEFAULT_LEADS = [
  { id:'LD001', dateAdded:'2026-07-14', company:'Arron Enterprises', location:'Chirgaon, Jhansi', address:'Saket Nagar, Chirgaon', contact:'', phone:'', status:'Hot', quoteSent:false, value:0, nextFollowup:'', followupCount:1, lostReason:'Not interested', notes:'Food mfr + wholesaler, 5-star reviews. Pitch: free box audit + 48-hr sample of their fastest SKU carton. Priority 1.' },
  { id:'LD002', dateAdded:'2026-07-14', company:'Amit Flour Mill', location:'Chirgaon, Jhansi', address:'Main Road, Chirgaon', contact:'', phone:'', status:'Warm', quoteSent:false, value:0, nextFollowup:'', followupCount:1, lostReason:'Not interested', notes:'Walk in - check if they do 1-5kg retail atta packs. If yes, monthly carton demand.' },
  { id:'LD003', dateAdded:'2026-07-14', company:'BASIX Chirgaon Producer Co. (FPO)', location:'Chirgaon, Jhansi', address:'Chirgaon', contact:'', phone:'', status:'Hot', quoteSent:false, value:0, nextFollowup:'', followupCount:1, lostReason:'Not interested', notes:'Ask at mandi/block office for location. Packs pulses/spices in big seasonal lots. Sell local-supplier reliability.' },
  { id:'LD004', dateAdded:'2026-07-14', company:'MRTECHBOX', location:'Badagaon, Jhansi', address:'Takiyapura, Baragaon', contact:'', phone:'+91 89228 41415', status:'Hot', quoteSent:true, value:14000, nextFollowup:'2026-08-02', followupCount:2, lostReason:'', notes:'Ships project kits pan-India year-round. Needs small e-commerce shipping boxes, steady reorders. CALL FIRST, then visit. | 01-Aug-2026: Contacted, good response. Requested tape quotes - 2.5in and 3in. Follow up Aug 2 to send quote.' },
  { id:'LD005', dateAdded:'2026-07-14', company:'Jhansi Baragaon Spices & Oilseeds FPO', location:'Badagaon, Jhansi', address:'Barwa Sagar / Baragaon', contact:'', phone:'', status:'Warm', quoteSent:false, value:0, nextFollowup:'', followupCount:1, lostReason:'Not interested', notes:'FPO packing spices/oilseeds - cartons for pouches and dispatch. Trial order entry.' },
  { id:'LD006', dateAdded:'2026-07-14', company:'Bahuayami Agro Farmer Producer Co. Ltd', location:'Chirgaon, Jhansi', address:'Near gas agency, Chirgaon 284301', contact:'Amit Kumar Pal', phone:'7355414278', status:'Lost', quoteSent:false, value:0, nextFollowup:'2026-07-15', followupCount:0, lostReason:'Not needed', notes:'VERIFIED contact from UP govt FPO list. Email: bahuayamiagro.fpcl.jhansiup@gmail.com. CALL to fix meeting before Chirgaon trip. Pitch: branded retail cartons + local small-MOQ supply.' },
  { id:'LD007', dateAdded:'2026-07-14', company:'Safal Kisaan PCL', location:'Jhansi district', address:'', contact:'Amit Kumar Pandey', phone:'9721267804', status:'Warm', quoteSent:false, value:0, nextFollowup:'', followupCount:1, lostReason:'Not interested', notes:'Bonus FPO lead from same govt list. Call to locate and qualify.' },
  { id:'LD008', dateAdded:'2026-07-14', company:'Bijak Agro Farmer Producer Co. Ltd', location:'Chirgaon, Jhansi', address:'Katra Bajariya, Pahari Buzurg, Chirgaon 284301', contact:'Rohit Gupta / Neeraj Mishra (Directors)', phone:'', status:'Warm', quoteSent:false, value:0, nextFollowup:'', followupCount:1, lostReason:'Not interested', notes:'Third FPO in Chirgaon - visit Katra Bajariya landmark during Chirgaon trip. Ask for directors by name.' },
  { id:'LD009', dateAdded:'2026-07-14', company:'Tarun jain Bidi', location:'Chirgaon, Jhansi', address:'Havelli mohalla chirgaon', contact:'Tarun Jain', phone:'9936663628', status:'Hot', quoteSent:false, value:10000, nextFollowup:'2026-08-22', followupCount:1, lostReason:'', notes:'01-Aug-2026: Reminded. Customer says order will be placed in 1-2 months. Check-in set for Aug 22.' },
  { id:'LD010', dateAdded:'2026-07-11', company:'Akash Toast', location:'Lalitpur', address:'Chandera Industrial area', contact:'Akash/ Ashish', phone:'+91 70076 94013', status:'Warm', quoteSent:false, value:150000, nextFollowup:'2026-07-20', followupCount:1, lostReason:'', notes:'' },
  { id:'LD011', dateAdded:'2026-07-11', company:'Mohan Mawa', location:'Lalitpur', address:'Sanichar Chauraha lalitpur', contact:'Anki /Anklur', phone:'+91 75669 50241', status:'Warm', quoteSent:true, value:25000, nextFollowup:'2026-07-20', followupCount:1, lostReason:'', notes:'' },
  { id:'LD012', dateAdded:'2026-07-15', company:'Ashish Chanchal', location:'Jhansi district', address:'Pal; colony Jhansi', contact:'Ashish chanchal', phone:'9795315359', status:'Warm', quoteSent:true, value:0, nextFollowup:'', followupCount:0, lostReason:'', notes:'' },
  { id:'LD013', dateAdded:'2026-07-16', company:'Bhaskar Lodhi', location:'Ashoknagar', address:'Ashoknagar', contact:'Bhaskar Lodhi', phone:'9179813020', status:'Warm', quoteSent:true, value:34000, nextFollowup:'', followupCount:0, lostReason:'', notes:'' },
  { id:'LD014', dateAdded:'2026-07-17', company:'Abhishek Josi', location:'Jhansi district', address:'jhansi', contact:'Abhishek', phone:'9755217638', status:'Won', quoteSent:true, value:15000, nextFollowup:'', followupCount:1, lostReason:'', notes:'30-Jul-2026: Converted - order placed. Logged 01-Aug-2026.' },
  { id:'LD015', dateAdded:'2026-07-17', company:'Puneet Gupta', location:'Jhansi district', address:'jhansi', contact:'Puneet', phone:'7309456846', status:'Hot', quoteSent:true, value:20000, nextFollowup:'', followupCount:0, lostReason:'', notes:'' },
  { id:'LD016', dateAdded:'2026-07-17', company:'Rathoriya enterprises', location:'Niwadi', address:'Niwadi', contact:'Dheeraj Pal', phone:'9936080844', status:'Hot', quoteSent:true, value:0, nextFollowup:'', followupCount:0, lostReason:'', notes:'' },
  { id:'LD017', dateAdded:'2026-07-13', company:'Ravi Sahu', location:'Jhansi district', address:'Ganj Jhansi', contact:'Ravi sahu', phone:'7355404632', status:'Hot', quoteSent:true, value:10000, nextFollowup:'2026-08-03', followupCount:1, lostReason:'', notes:'01-Aug-2026: Called, no answer. Retry Aug 3.' },
  { id:'LD018', dateAdded:'2026-07-23', company:'Amit Porwal', location:'Mauranipur', address:'', contact:'Amit Porwal', phone:'9415585110', status:'Hot', quoteSent:true, value:0, nextFollowup:'2026-08-04', followupCount:3, lostReason:'', notes:'Inquiry for corrugated rolls. Quoted Rs 48/unit incl. GST. | Followed up 31-Jul-2026. | 01-Aug-2026: Called. Sample arranged via bhaiya - pick up Aug 2, then follow up with customer Aug 4.' },
  { id:'LD019', dateAdded:'2026-07-23', company:'Ramesh Panchal', location:'Gursarai, Jhansi', address:'', contact:'Ramesh Panchal', phone:'9415949447', status:'Hot', quoteSent:true, value:0, nextFollowup:'2026-08-03', followupCount:2, lostReason:'', notes:'Inquiry for corrugated rolls. Quoted Rs 48.50/unit incl. GST. | 01-Aug-2026: Called, no answer. Retry Aug 3.' },
  { id:'LD020', dateAdded:'2026-07-26', company:'ranipur bidi', location:'ranipur', address:'ranipur', contact:'', phone:'', status:'Warm', quoteSent:false, value:0, nextFollowup:'', followupCount:0, lostReason:'', notes:'' },
  { id:'LD021', dateAdded:'2026-08-01', company:'Apra Doodh', location:'Jhansi', address:'', contact:'Amitabh Nagariya', phone:'', status:'Hot', quoteSent:false, value:80000, nextFollowup:'2026-08-04', followupCount:2, lostReason:'', notes:'Milk brand, Jhansi. Order value up to Rs 80,000/month. | 01-Aug-2026: Called, hot - confirmed will place order for boxes, will contact in 2-3 days.' },
];

let leads = [];
let _leadSearchQuery = '';

// ── Storage ──
function loadLeads()    { try { return JSON.parse(localStorage.getItem(LS_LEADS)) || []; } catch (e) { return []; } }
function saveLeadList() { localStorage.setItem(LS_LEADS, JSON.stringify(leads)); }
function initLeads() {
  const stored = localStorage.getItem(LS_LEADS);
  leads = stored ? JSON.parse(stored) : JSON.parse(JSON.stringify(DEFAULT_LEADS));
  if (!stored) saveLeadList();
}

function _nextLeadId() {
  let max = 0;
  leads.forEach(l => { const m = (l.id || '').match(/LD(\d+)/); if (m) max = Math.max(max, parseInt(m[1])); });
  return 'LD' + String(max + 1).padStart(3, '0');
}

function _mirrorLead(l) {
  if (typeof mirrorToSheet !== 'function') return;
  mirrorToSheet('saveLead', {
    id: l.id, dateAdded: l.dateAdded, company: l.company, location: l.location, address: l.address,
    contact: l.contact, phone: l.phone, status: l.status, quoteSent: l.quoteSent ? 'Yes' : 'No',
    value: l.value || 0, nextFollowup: l.nextFollowup || '', followupCount: l.followupCount || 0,
    lostReason: l.lostReason || '', notes: l.notes || '',
  });
}

// ── Search ──
function onLeadSearch() {
  _leadSearchQuery = (document.getElementById('lead-search')?.value || '').trim().toLowerCase();
  renderLeads();
}

// ── Add / Edit Modal ──
let _leadModalIdx = -1; // -1 = adding new

function openLeadModal(idx) {
  _leadModalIdx = idx;
  const l = idx >= 0 ? leads[idx] : null;
  document.getElementById('lead-modal-title').textContent = idx >= 0 ? 'Edit Lead' : 'Add New Lead';
  document.getElementById('lm-company').value       = l ? l.company : '';
  document.getElementById('lm-location').value      = l ? l.location : '';
  document.getElementById('lm-address').value       = l ? l.address : '';
  document.getElementById('lm-contact').value        = l ? l.contact : '';
  document.getElementById('lm-phone').value         = l ? l.phone : '';
  document.getElementById('lm-status').value        = l ? l.status : 'Warm';
  document.getElementById('lm-quote').checked       = l ? !!l.quoteSent : false;
  document.getElementById('lm-value').value         = l && l.value ? l.value : '';
  document.getElementById('lm-next-followup').value = l ? (l.nextFollowup || '') : '';
  document.getElementById('lm-lost-reason').value   = l ? (l.lostReason || '') : '';
  document.getElementById('lm-notes').value         = l ? (l.notes || '') : '';
  document.getElementById('lead-modal-overlay').style.display = 'flex';
  document.getElementById('lm-company').focus();
}

function closeLeadModal() {
  document.getElementById('lead-modal-overlay').style.display = 'none';
  _leadModalIdx = -1;
}

function saveLeadModal() {
  const company = document.getElementById('lm-company').value.trim();
  if (!company) { document.getElementById('lm-company').focus(); return; }

  const status     = document.getElementById('lm-status').value;
  const wasStatus  = _leadModalIdx >= 0 ? leads[_leadModalIdx].status : null;
  const data = {
    company,
    location: document.getElementById('lm-location').value.trim(),
    address:  document.getElementById('lm-address').value.trim(),
    contact:  document.getElementById('lm-contact').value.trim(),
    phone:    document.getElementById('lm-phone').value.trim(),
    status,
    quoteSent:     document.getElementById('lm-quote').checked,
    value:         parseFloat(document.getElementById('lm-value').value) || 0,
    nextFollowup:  document.getElementById('lm-next-followup').value || '',
    lostReason:    document.getElementById('lm-lost-reason').value.trim(),
    notes:         document.getElementById('lm-notes').value.trim(),
  };

  let lead;
  if (_leadModalIdx >= 0) {
    lead = leads[_leadModalIdx];
    Object.assign(lead, data);
  } else {
    lead = { id: _nextLeadId(), dateAdded: todayStr, followupCount: 0, ...data };
    leads.push(lead);
  }
  saveLeadList();
  _mirrorLead(lead);
  closeLeadModal();
  renderLeads();

  // Freshly marked Won → offer to create a real Client record so the sales
  // hand-off into order-taking doesn't mean re-typing contact details.
  if (status === 'Won' && wasStatus !== 'Won' && typeof openClientModal === 'function') {
    if (confirm(`🎉 ${company} marked Won! Add them as a Client now so you can start taking orders?`)) {
      openClientModal(-1);
      setTimeout(() => {
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        set('cm-name', company);
        set('cm-contact', lead.contact || '');
        set('cm-phone', lead.phone || '');
        set('cm-city', (lead.location || '').split(',')[0].trim());
      }, 30);
    }
  }
}

// ── Quick actions ──
function logLeadFollowup(idx) {
  const l = leads[idx];
  if (!l) return;
  const note = prompt(`Log a follow-up for ${l.company}:`, '');
  if (note === null || !note.trim()) return;
  const stamp = `${formatDate(todayStr)}: ${note.trim()}`;
  l.notes = l.notes ? `${l.notes} | ${stamp}` : stamp;
  l.followupCount = (l.followupCount || 0) + 1;
  const cadence = LEAD_FOLLOWUP_CADENCE[l.status] || 14;
  const next = new Date();
  next.setDate(next.getDate() + cadence);
  l.nextFollowup = next.toISOString().split('T')[0];
  saveLeadList();
  _mirrorLead(l);
  renderLeads();
}

function deleteLead(idx) {
  const l = leads[idx];
  if (!l) return;
  if (!confirm(`Delete lead "${l.company}"? This cannot be undone.`)) return;
  leads.splice(idx, 1);
  saveLeadList();
  if (typeof mirrorToSheet === 'function') mirrorToSheet('deleteLead', { id: l.id });
  renderLeads();
}

// ── Render ──
function renderLeads() {
  const summaryEl = document.getElementById('leads-summary');
  const root      = document.getElementById('leads-board');
  if (!root) return;

  const active  = leads.filter(l => l.status !== 'Won' && l.status !== 'Lost');
  const pipelineValue = active.reduce((s, l) => s + (l.value || 0), 0);
  const wonLeads = leads.filter(l => l.status === 'Won');
  const wonValue = wonLeads.reduce((s, l) => s + (l.value || 0), 0);
  const overdue  = leads.filter(l => l.status !== 'Won' && l.status !== 'Lost' && l.nextFollowup && l.nextFollowup < todayStr);

  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="client-summary-strip">
        <div class="client-summary-card">
          <div class="cs-label">📊 Active Pipeline Value</div>
          <div class="cs-value">₹${Math.round(pipelineValue).toLocaleString('en-IN')}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${active.length} lead${active.length === 1 ? '' : 's'} in Hot / Warm / Cold</div>
        </div>
        <div class="client-summary-card">
          <div class="cs-label">🏆 Won</div>
          <div class="cs-value">${wonLeads.length}</div>
          ${wonValue ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">₹${Math.round(wonValue).toLocaleString('en-IN')} converted</div>` : ''}
        </div>
        <div class="client-summary-card">
          <div class="cs-label">⏰ Overdue Follow-ups</div>
          <div class="cs-value" style="${overdue.length ? 'color:var(--danger)' : ''}">${overdue.length}</div>
          ${overdue.length ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">${overdue.slice(0, 3).map(l => l.company).join(', ')}${overdue.length > 3 ? ` +${overdue.length - 3} more` : ''}</div>` : ''}
        </div>
      </div>`;
  }

  let rows = leads.map((l, idx) => ({ l, idx }));
  if (_leadSearchQuery) {
    rows = rows.filter(({ l }) =>
      l.company.toLowerCase().includes(_leadSearchQuery) ||
      (l.location || '').toLowerCase().includes(_leadSearchQuery) ||
      (l.contact || '').toLowerCase().includes(_leadSearchQuery) ||
      (l.phone || '').toLowerCase().includes(_leadSearchQuery)
    );
  }

  if (!leads.length) {
    root.innerHTML = '<div class="empty-state">No leads yet. Click + Add New Lead to start tracking prospects.</div>';
    return;
  }

  root.innerHTML = `<div style="display:flex;gap:12px;overflow-x:auto;align-items:flex-start;padding-bottom:8px">` +
    LEAD_STATUSES.map(status => {
      const col   = LEAD_STATUS_COLOR[status];
      const cards = rows.filter(({ l }) => l.status === status);
      return `
      <div style="min-width:250px;flex:1;background:var(--card,#fff);border:1px solid var(--border,#e5e7eb);border-radius:12px;padding:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid ${col.ring}">
          <span style="font-weight:700;font-size:13px;color:${col.text}">${status}</span>
          <span style="background:${col.ring};color:${col.text};border-radius:10px;padding:1px 8px;font-size:11px;font-weight:700">${cards.length}</span>
        </div>
        ${cards.length === 0 ? '<div style="color:var(--muted,#999);font-size:12px;text-align:center;padding:14px 0">—</div>' : cards.map(({ l, idx }) => {
          const isOverdue = l.status !== 'Won' && l.status !== 'Lost' && l.nextFollowup && l.nextFollowup < todayStr;
          const phoneLink = l.phone ? `<a href="tel:${l.phone.replace(/\s+/g, '')}" style="color:${col.text};text-decoration:none" title="Call ${l.phone}">📞 ${l.phone}</a>` : '';
          return `
          <div style="border:1px solid var(--border,#e5e7eb);border-left:3px solid ${col.ring};border-radius:8px;padding:8px 10px;margin-bottom:8px;background:${col.bg}">
            <div style="display:flex;justify-content:space-between;gap:6px;font-size:12px;font-weight:700;color:var(--navy)">
              <span>${l.company}</span>
              ${isOverdue ? '<span style="color:#E74C3C;white-space:nowrap" title="Follow-up overdue">⏰</span>' : ''}
            </div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">${l.location || '—'}${l.contact ? ' · ' + l.contact : ''}</div>
            ${phoneLink ? `<div style="font-size:11px;margin-top:3px">${phoneLink}</div>` : ''}
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;font-size:11px">
              ${l.value ? `<span style="font-weight:700;color:${col.text}">₹${l.value.toLocaleString('en-IN')}/mo</span>` : ''}
              ${l.quoteSent ? '<span style="color:var(--success)">✓ Quoted</span>' : ''}
              ${l.nextFollowup ? `<span style="color:${isOverdue ? 'var(--danger)' : 'var(--muted)'}">${isOverdue ? 'Due' : 'Next'} ${formatDate(l.nextFollowup)}</span>` : ''}
            </div>
            ${l.status === 'Lost' && l.lostReason ? `<div style="font-size:10.5px;color:var(--muted);margin-top:4px">Reason: ${l.lostReason}</div>` : ''}
            <div style="display:flex;justify-content:flex-end;gap:4px;margin-top:6px">
              <button class="btn-sm" onclick="logLeadFollowup(${idx})" title="Log a follow-up">📝</button>
              <button class="btn-sm" onclick="openLeadModal(${idx})" title="Edit">✏️</button>
              <button class="btn-sm" style="color:var(--danger)" onclick="deleteLead(${idx})" title="Delete">🗑</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    }).join('') + `</div>`;
}

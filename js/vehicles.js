// ══════════════════════════════════════════════════════════════
// VEHICLES.JS — 🚛 Vehicles page: the list of vehicles (number, type,
// owner, driver, phones — "Vehicles" tab of the Orders spreadsheet, shared
// with the staff portal) and what each one carried, from the Dispatch
// register's Vehicle (J) and Trip (K) columns. A trip is every dispatch line
// saved together for one vehicle; older lines with no trip ID count one
// trip per vehicle per day.
// ══════════════════════════════════════════════════════════════

let vehicleList = [];
let _vhMonth = null;

async function loadVehicles() {
  vehicleList = await fetchVehicleList();
  const open = document.getElementById('page-vehicles')?.classList.contains('active') || document.getElementById('staff-tab-vehicles')?.style.display === 'block';
  if (open) renderVehiclesPage();
}

const _vhEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const _vhN = n => Math.round(n || 0).toLocaleString('en-IN');
const _vhMonthLabel = m => { const [y, mo] = m.split('-'); return new Date(+y, +mo - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); };

// The dispatch register as each portal loads it — office: _svDisp
// (supervisor-log.js), staff portal: staffDispatchLog (staff-app.js) —
// with dates as YYYY-MM-DD and weights in grams.
const _vhIsStaff = () => typeof _svDisp === 'undefined';
function _vhSource() {
  if (!_vhIsStaff()) return _svDisp.map(e => ({ ...e, day: _svNormDate(e.date) }));
  return (typeof staffDispatchLog !== 'undefined' ? staffDispatchLog : []).map(e => ({
    ...e, vehicle: String(e.vehicle || '').toUpperCase().trim(), day: _deDayKey(e.date),
    wtPc: e.wtPc > 0 && e.wtPc < 20 ? e.wtPc * 1000 : e.wtPc,   // typed in kg by mistake
  }));
}

// Every dispatch line with a vehicle, grouped into trips
function _vhTrips() {
  const rows = _vhSource().filter(e => e.vehicle);
  const trips = {};
  rows.forEach(e => {
    const date = e.day || '';
    const key = vehicleKey(e.vehicle) + '|' + (e.tripId || date);
    const t = trips[key] || (trips[key] = { vehicle: vehicleKey(e.vehicle), number: e.vehicle, date, lines: [], pcs: 0, kg: 0, parties: new Set() });
    t.lines.push(e);
    t.pcs += e.pcs || 0;
    t.kg  += (e.pcs || 0) * (e.wtPc || 0) / 1000;
    if (e.party) t.parties.add(e.party.trim());
    if (date < t.date) t.date = date;
  });
  return Object.values(trips).sort((a, b) => b.date.localeCompare(a.date));
}

function _vhStats(trips) {
  const parties = new Set();
  trips.forEach(t => t.parties.forEach(p => parties.add(p)));
  return { trips: trips.length, pcs: trips.reduce((s, t) => s + t.pcs, 0), kg: trips.reduce((s, t) => s + t.kg, 0), parties: parties.size, last: trips[0]?.date || '' };
}

function _vhLoadingRate(v) {
  return v && v.owner && typeof findVehicleOwnerRate === 'function' ? findVehicleOwnerRate(v.owner) : null;
}

function renderVehiclesPage() {
  const root = document.getElementById('vehicles-root');
  if (!root) return;
  const allTrips = _vhTrips();
  const months = [...new Set([todayStr.slice(0, 7), ...allTrips.map(t => t.date.slice(0, 7))])].filter(Boolean).sort().reverse();
  if (!_vhMonth || !months.includes(_vhMonth)) _vhMonth = months[0];
  const trips = allTrips.filter(t => t.date.startsWith(_vhMonth));
  const st = _vhStats(trips);
  const noVehicle = _vhSource().filter(e => !e.vehicle && (e.day || '').startsWith(_vhMonth)).length;
  const showCharges = !_vhIsStaff();   // rates stay office-only

  // Listed vehicles, plus any number seen on a dispatch that isn't listed yet
  const known = new Set(vehicleList.map(v => vehicleKey(v.number)));
  const unlisted = [...new Set(allTrips.map(t => t.vehicle))].filter(k => !known.has(k))
    .map(k => ({ number: allTrips.find(t => t.vehicle === k).number, _unlisted: true }));
  const rows = [...vehicleList, ...unlisted].map(v => {
    const vt = trips.filter(t => t.vehicle === vehicleKey(v.number));
    return { v, s: _vhStats(vt), all: allTrips.filter(t => t.vehicle === vehicleKey(v.number)).length };
  }).sort((a, b) => b.s.trips - a.s.trips || a.v.number.localeCompare(b.v.number));

  const card = (label, value, sub) => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value" style="font-size:20px">${value}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`;
  const phone = p => p ? ` <a href="tel:${_vhEsc(p)}" style="color:var(--blue);font-size:11px">${_vhEsc(p)}</a>` : '';

  root.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <select class="form-select" style="width:auto" onchange="_vhMonth=this.value;renderVehiclesPage()">
        ${months.map(m => `<option value="${m}" ${m === _vhMonth ? 'selected' : ''}>${_vhMonthLabel(m)}</option>`).join('')}
      </select>
      <button class="btn-primary" style="margin-left:auto" onclick="openVehicleForm()">+ Add Vehicle</button>
    </div>
    <div class="grid-3" style="margin-bottom:16px">
      ${card('Trips', _vhN(st.trips), `${rows.filter(r => r.s.trips).length} vehicle${rows.filter(r => r.s.trips).length === 1 ? '' : 's'} used`)}
      ${card('Pieces delivered', _vhN(st.pcs), `${st.parties} part${st.parties === 1 ? 'y' : 'ies'}`)}
      ${card('Weight delivered', _vhN(st.kg) + ' kg', st.trips ? `~${_vhN(st.kg / st.trips)} kg per trip` : '')}
    </div>
    ${noVehicle ? `<div class="alert-banner" style="display:block;background:#FFFBEB;border-color:#F59E0B;color:#78350F;margin-bottom:14px">⚠️ ${noVehicle} dispatch line${noVehicle === 1 ? '' : 's'} in ${_vhMonthLabel(_vhMonth)} have no vehicle — they were logged before vehicles were recorded, or without picking one.</div>` : ''}
    <div class="data-table-wrap"><div class="data-table-scroll">
      <table class="data-table" style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="text-align:left">
          <th style="padding:8px 10px">Vehicle</th><th style="padding:8px 10px">Owner</th><th style="padding:8px 10px">Driver</th>
          <th style="padding:8px 10px">Trips</th><th style="padding:8px 10px">Pieces</th><th style="padding:8px 10px">Weight</th>
          <th style="padding:8px 10px">Parties</th><th style="padding:8px 10px">Last trip</th>${showCharges ? '<th style="padding:8px 10px">Loading charges</th>' : ''}<th></th>
        </tr></thead>
        <tbody>${!rows.length ? '<tr><td colspan="11"><div class="empty-state">No vehicles yet — add one, or let the supervisor add it from the staff portal.</div></td></tr>' : rows.map(({ v, s, all }) => {
          const rate = _vhLoadingRate(v);
          return `<tr style="border-top:1px solid var(--border)">
            <td style="padding:8px 10px"><strong style="font-family:monospace">${_vhEsc(v.number)}</strong>${v.type ? `<div style="font-size:11px;color:var(--muted)">${_vhEsc(v.type)}</div>` : ''}${v._unlisted ? '<div style="font-size:11px;color:#B45309">not in the list</div>' : ''}</td>
            <td style="padding:8px 10px">${_vhEsc(v.owner || '—')}${phone(v.ownerPhone)}</td>
            <td style="padding:8px 10px">${_vhEsc(v.driver || '—')}${phone(v.driverPhone)}</td>
            <td style="padding:8px 10px"><strong>${s.trips}</strong>${all > s.trips ? `<div style="font-size:10px;color:var(--muted)">${all} all time</div>` : ''}</td>
            <td style="padding:8px 10px">${_vhN(s.pcs)}</td>
            <td style="padding:8px 10px">${_vhN(s.kg)} kg</td>
            <td style="padding:8px 10px">${s.parties}</td>
            <td style="padding:8px 10px">${s.last ? formatDate(s.last) : '—'}</td>
            ${showCharges ? `<td style="padding:8px 10px">${rate && s.trips ? `₹${_vhN(rate.rate * s.trips)}<div style="font-size:10px;color:var(--muted)">${s.trips} × ₹${rate.rate}</div>` : '<span style="color:var(--muted);font-size:11px">—</span>'}</td>` : ''}
            <td style="padding:8px 10px;white-space:nowrap">
              <button class="btn-sm" onclick="openVehicleDetail('${_vhEsc(v.number)}')" title="Trips and monthly totals">📊</button>
              <button class="btn-sm" onclick="openVehicleForm('${_vhEsc(v.number)}')" title="${v._unlisted ? 'Add to the list' : 'Edit'}">${v._unlisted ? '➕' : '✏️'}</button>
              ${v._unlisted ? '' : `<button class="btn-sm" style="color:var(--danger)" onclick="deleteVehicleEntry('${_vhEsc(v.number)}')" title="Remove from the list">✕</button>`}
            </td></tr>`;
        }).join('')}</tbody>
      </table>
    </div></div>
    <div class="field-hint" style="margin-top:8px">A trip is every dispatch line saved together for one vehicle. Weight = pieces × the sample box weight entered at dispatch.${showCharges ? " Loading charges use the owner's fixed rate from Expenses → Vehicle owner loading rates, where one is set." : ''} The same list and figures show in the ${_vhIsStaff() ? 'office app' : 'staff portal'}.</div>`;
}

function _vhOverlay() {
  let ov = document.getElementById('vehicle-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'vehicle-overlay'; ov.className = 'popup-overlay';
    ov.onclick = e => { if (e.target === ov) ov.style.display = 'none'; };
    document.body.appendChild(ov);
  }
  return ov;
}

function openVehicleDetail(number) {
  const k = vehicleKey(number);
  const v = vehicleList.find(x => vehicleKey(x.number) === k) || { number };
  const trips = _vhTrips().filter(t => t.vehicle === k);
  const byMonth = {};
  trips.forEach(t => { (byMonth[t.date.slice(0, 7)] = byMonth[t.date.slice(0, 7)] || []).push(t); });
  const monthRows = Object.keys(byMonth).sort().reverse().map(m => { const s = _vhStats(byMonth[m]); return `<tr style="border-top:1px solid var(--border)"><td style="padding:6px 8px">${_vhMonthLabel(m)}</td><td style="padding:6px 8px"><strong>${s.trips}</strong></td><td style="padding:6px 8px">${_vhN(s.pcs)}</td><td style="padding:6px 8px">${_vhN(s.kg)} kg</td><td style="padding:6px 8px">${s.parties}</td></tr>`; }).join('');
  const shown = trips.filter(t => t.date.startsWith(_vhMonth));
  const tripRows = shown.map(t => `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:12px">
      <div style="display:flex;justify-content:space-between;gap:8px"><strong>${formatDate(t.date)}</strong><span><strong>${_vhN(t.pcs)} pcs</strong> · ${_vhN(t.kg)} kg</span></div>
      ${t.lines.map(e => `<div style="color:var(--muted)">${_vhEsc(e.party || '—')} · ${_vhEsc(e.product || e.size || '')} · ${_vhN(e.pcs)} pcs${e.orderId ? ' · ' + _vhEsc(e.orderId) : ''}</div>`).join('')}
      ${t.lines.find(e => e.notes) ? `<div style="color:#B45309">📝 ${_vhEsc(t.lines.find(e => e.notes).notes)}</div>` : ''}
    </div>`).join('');
  const ov = _vhOverlay();
  ov.innerHTML = `<div class="popup-box" style="width:min(640px,95vw);max-width:none;padding:22px;max-height:88vh;overflow-y:auto" onclick="event.stopPropagation()">
    <div class="popup-title">🚛 ${_vhEsc(v.number)}${v.type ? ' · ' + _vhEsc(v.type) : ''}</div>
    <div style="font-size:12px;color:var(--muted);margin:-6px 0 12px">Owner: ${_vhEsc(v.owner || '—')} ${_vhEsc(v.ownerPhone || '')} · Driver: ${_vhEsc(v.driver || '—')} ${_vhEsc(v.driverPhone || '')}</div>
    <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Month by month — ${trips.length} trips in all</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px"><thead><tr style="text-align:left;color:var(--muted)"><th style="padding:4px 8px">Month</th><th style="padding:4px 8px">Trips</th><th style="padding:4px 8px">Pieces</th><th style="padding:4px 8px">Weight</th><th style="padding:4px 8px">Parties</th></tr></thead>
      <tbody>${monthRows || '<tr><td colspan="5" style="padding:8px;color:var(--muted)">No trips yet.</td></tr>'}</tbody></table>
    <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Trips in ${_vhMonthLabel(_vhMonth)} — ${shown.length}</div>
    ${tripRows || '<div style="font-size:12px;color:var(--muted)">No trips this month.</div>'}
    <div style="display:flex;margin-top:14px"><button class="btn-primary" style="margin-left:auto" onclick="document.getElementById('vehicle-overlay').style.display='none'">Close</button></div></div>`;
  ov.style.display = 'flex';
}

function openVehicleForm(number) {
  const v = number ? (vehicleList.find(x => vehicleKey(x.number) === vehicleKey(number)) || { number }) : {};
  const f = (id, label, val, extra) => `<div class="form-group"><label class="form-label">${label}</label><input class="form-input" id="vf-${id}" value="${_vhEsc(val || '')}" ${extra || ''}></div>`;
  const ov = _vhOverlay();
  ov.innerHTML = `<div class="popup-box" style="width:min(520px,95vw);max-width:none;padding:22px" onclick="event.stopPropagation()">
    <div class="popup-title">🚛 ${v.owner || v.driver ? 'Edit' : 'Add'} Vehicle</div>
    <div class="form-grid" style="grid-template-columns:1fr 1fr">
      ${f('number', 'Vehicle number', v.number, `style="text-transform:uppercase" ${v.owner || v.driver ? 'readonly' : ''}`)}
      ${f('type', 'Vehicle type', v.type, 'placeholder="e.g. Tata Ace" list="vf-types"')}<datalist id="vf-types">${VEHICLE_TYPES.map(t => `<option value="${t}">`).join('')}</datalist>
      ${f('owner', 'Owner name', v.owner)}
      ${f('ownerPhone', 'Owner phone', v.ownerPhone, 'type="tel"')}
      ${f('driver', 'Driver name', v.driver)}
      ${f('driverPhone', 'Driver phone', v.driverPhone, 'type="tel"')}
    </div>
    <div style="display:flex;gap:10px;margin-top:6px"><button class="btn-primary" style="flex:1" onclick="saveVehicleForm()">💾 Save</button>
    <button class="btn-secondary" onclick="document.getElementById('vehicle-overlay').style.display='none'">Cancel</button></div></div>`;
  ov.style.display = 'flex';
}

function saveVehicleForm() {
  const g = id => (document.getElementById('vf-' + id)?.value || '').trim();
  const number = g('number').toUpperCase();
  if (vehicleKey(number).length < 4) { alert('Enter the vehicle number.'); return; }
  vehicleList = saveVehicleRecord({ number, type: g('type'), owner: g('owner'), ownerPhone: g('ownerPhone'), driver: g('driver'), driverPhone: g('driverPhone') });
  document.getElementById('vehicle-overlay').style.display = 'none';
  renderVehiclesPage();
  if (typeof _deRefreshVehiclePicker === 'function') _deRefreshVehiclePicker();
}

function deleteVehicleEntry(number) {
  if (!confirm(`Remove ${number} from the vehicle list?\n\nIts past trips stay in the dispatch register.`)) return;
  vehicleList = vehicleList.filter(v => vehicleKey(v.number) !== vehicleKey(number));
  try { localStorage.setItem(LS_VEHICLES, JSON.stringify(vehicleList)); } catch (e) {}
  fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'deleteVehicle', number }) }).catch(() => {});
  renderVehiclesPage();
  if (typeof _deRefreshVehiclePicker === 'function') _deRefreshVehiclePicker();
}

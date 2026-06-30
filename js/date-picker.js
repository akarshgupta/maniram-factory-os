// ══════════════════════════════════════════════════════════════
// DATE-PICKER.JS — Custom calendar overlay with order-load colours
//                  + Reel production schedule hint
// ══════════════════════════════════════════════════════════════

// Load colours: 0 = none · 1 = green · 2 = light-green · 3 = yellow · 4+ = red
const LOAD_PALETTE = [
  { max: 0, bg: '',        text: 'var(--text)',  ring: 'transparent', label: ''       },
  { max: 1, bg: '#DCFCE7', text: '#166534',      ring: '#86EFAC',     label: '1'      },
  { max: 2, bg: '#BBF7D0', text: '#15803D',      ring: '#4ADE80',     label: '2'      },
  { max: 3, bg: '#FEF3C7', text: '#92400E',      ring: '#FCD34D',     label: '3'      },
  { max: 99,bg: '#FEE2E2', text: '#991B1B',      ring: '#FCA5A5',     label: '4+'     },
];

function _loadColour(count) {
  if (!count) return LOAD_PALETTE[0];
  for (const p of LOAD_PALETTE) if (count <= p.max) return p;
  return LOAD_PALETTE[LOAD_PALETTE.length - 1];
}

// Build { dateStr → count } from active orders
function _orderCountMap() {
  const map = {};
  (typeof orders !== 'undefined' ? orders : [])
    .filter(o => !['Delivered','Dispatched','Cancelled'].includes(o.status) && o.date)
    .forEach(o => { map[o.date] = (map[o.date] || 0) + 1; });
  return map;
}

// ── Calendar overlay ─────────────────────────────────────────
let _calTarget   = null;  // id of the input we're controlling
let _calYear     = null;
let _calMonth    = null;  // 0-based

function showDateCalendar(inputId) {
  const inp = document.getElementById(inputId);
  if (!inp) return;

  _calTarget = inputId;

  // Decide which month to show
  const val = inp.value; // YYYY-MM-DD
  const ref  = val ? new Date(val + 'T00:00:00') : new Date();
  _calYear   = ref.getFullYear();
  _calMonth  = ref.getMonth();

  _renderCalOverlay(inp);
}

function _renderCalOverlay(anchorEl) {
  let overlay = document.getElementById('__date-cal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = '__date-cal-overlay';
    overlay.style.cssText = `
      position:fixed;z-index:9000;background:#fff;border:1.5px solid var(--border);
      border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.14);
      padding:12px;min-width:270px;user-select:none;
    `;
    document.body.appendChild(overlay);

    // Close on outside click
    document.addEventListener('mousedown', e => {
      if (!e.target.closest('#__date-cal-overlay') && e.target.id !== _calTarget) {
        hideDateCalendar();
      }
    }, true);
  }

  // Position below the anchor
  const rect = anchorEl.getBoundingClientRect();
  const top  = rect.bottom + 4;
  const left = Math.min(rect.left, window.innerWidth - 290);
  overlay.style.top  = top + 'px';
  overlay.style.left = left + 'px';

  _fillCalOverlay(overlay);
  overlay.style.display = 'block';
}

function _fillCalOverlay(overlay) {
  const map      = _orderCountMap();
  const today    = new Date();
  today.setHours(0,0,0,0);
  const selStr   = (document.getElementById(_calTarget) || {}).value || '';

  const firstDay = new Date(_calYear, _calMonth, 1);
  const lastDay  = new Date(_calYear, _calMonth + 1, 0);
  const startDow = firstDay.getDay(); // 0=Sun
  const totalDays = lastDay.getDate();

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  // Legend
  const legendHtml = LOAD_PALETTE.slice(1).map(p =>
    `<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;color:var(--muted)">
      <span style="width:10px;height:10px;border-radius:3px;background:${p.bg};border:1px solid ${p.ring};display:inline-block"></span>${p.label} order${p.label==='1'?'':'s'}
    </span>`
  ).join('  ');

  // Build day cells
  let cells = '';
  // empty cells for days before month start
  for (let d = 0; d < startDow; d++) {
    cells += `<div style="width:34px;height:34px"></div>`;
  }

  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${_calYear}-${String(_calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dt      = new Date(_calYear, _calMonth, day);
    const count   = map[dateStr] || 0;
    const col     = _loadColour(count);
    const isToday = dt.getTime() === today.getTime();
    const isSel   = dateStr === selStr;
    const isPast  = dt < today;

    let bg      = col.bg || (isPast ? '#F8FAFC' : '#fff');
    let textCol = col.text;
    let border  = isSel ? 'var(--blue)' : col.ring !== 'transparent' ? col.ring : 'var(--border)';
    let fontW   = isToday || isSel ? '800' : '500';
    if (isSel) { bg = 'var(--blue)'; textCol = '#fff'; border = 'var(--blue)'; }
    if (isPast && !isSel) textCol = '#CBD5E1';

    const tooltip = count > 0
      ? `title="${count} order${count>1?'s':''} — ${(map[dateStr+'_labels']||'')}"`
      : '';

    cells += `<div ${tooltip}
      onclick="pickDate('${dateStr}')"
      style="width:34px;height:34px;border-radius:8px;background:${bg};border:1.5px solid ${border};
             display:flex;flex-direction:column;align-items:center;justify-content:center;
             cursor:pointer;transition:all 0.1s;font-size:12px;font-weight:${fontW};color:${textCol}"
      onmouseenter="this.style.opacity='0.8'" onmouseleave="this.style.opacity='1'">
      <div>${day}</div>
      ${count > 0 && !isSel ? `<div style="font-size:8px;font-weight:700;line-height:1">${count}</div>` : ''}
    </div>`;
  }

  overlay.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <button onclick="_calNav(-1)" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--muted);padding:0 4px;line-height:1">‹</button>
      <div style="font-size:13px;font-weight:700;color:var(--text)">${MONTHS[_calMonth]} ${_calYear}</div>
      <button onclick="_calNav(1)"  style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--muted);padding:0 4px;line-height:1">›</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,34px);gap:3px;margin-bottom:6px">
      ${DAYS.map(d => `<div style="text-align:center;font-size:9.5px;font-weight:700;color:var(--muted);padding-bottom:2px">${d}</div>`).join('')}
      ${cells}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;padding-top:6px;border-top:1px solid var(--border)">
      ${legendHtml}
    </div>
  `;
}

function _calNav(dir) {
  _calMonth += dir;
  if (_calMonth > 11) { _calMonth = 0;  _calYear++; }
  if (_calMonth < 0)  { _calMonth = 11; _calYear--; }
  const overlay = document.getElementById('__date-cal-overlay');
  if (overlay) _fillCalOverlay(overlay);
}

function pickDate(dateStr) {
  const inp = document.getElementById(_calTarget);
  if (inp) {
    inp.value = dateStr;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    inp.dispatchEvent(new Event('input',  { bubbles: true }));
  }
  hideDateCalendar();
  showDateLoadHint(_calTarget);
}

function hideDateCalendar() {
  const ov = document.getElementById('__date-cal-overlay');
  if (ov) ov.style.display = 'none';
}

// ── Date load hint strip (shown below date input after picking) ──
function showDateLoadHint(inputId) {
  const hintId = inputId + '-load-hint';
  const hint   = document.getElementById(hintId);
  if (!hint) return;

  const inp  = document.getElementById(inputId);
  const val  = inp ? inp.value : '';
  if (!val) { hint.innerHTML = ''; return; }

  const map    = _orderCountMap();
  const count  = map[val] || 0;
  const col    = _loadColour(count);
  const dt     = new Date(val + 'T00:00:00');
  const dayLbl = dt.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });

  // Show ±3 day strip
  const strip = [];
  for (let i = -3; i <= 3; i++) {
    const d = new Date(val + 'T00:00:00');
    d.setDate(d.getDate() + i);
    const ds  = d.toISOString().split('T')[0];
    const cnt = map[ds] || 0;
    const c   = _loadColour(cnt);
    const isCur = i === 0;
    strip.push(`<div style="text-align:center;flex:1">
      <div style="width:100%;padding:4px 0;border-radius:6px;background:${isCur ? (c.bg||'#EFF6FF') : (c.bg||'#F8FAFC')};
                  border:${isCur ? '2px solid var(--blue)' : '1px solid var(--border)'};font-size:10px;font-weight:${isCur?'800':'500'};
                  color:${isCur ? 'var(--blue)' : (c.text||'var(--muted)') }">
        <div>${d.toLocaleDateString('en-IN',{weekday:'short'}).substring(0,2)}</div>
        <div style="font-size:11px">${d.getDate()}</div>
        ${cnt > 0 ? `<div style="font-size:9px;font-weight:700">${cnt}</div>` : '<div style="font-size:9px;color:transparent">0</div>'}
      </div>
    </div>`);
  }

  const msg = count === 0
    ? `<span style="color:var(--success)">Free slot</span> on ${dayLbl}`
    : `<span style="font-weight:700;color:${col.text}">${count} order${count>1?'s':''} already</span> on ${dayLbl}`;

  hint.innerHTML = `
    <div style="display:flex;gap:3px;margin-bottom:4px">${strip.join('')}</div>
    <div style="font-size:10.5px;padding:2px 0">${msg}</div>
  `;
}

// ── Reel production hint ─────────────────────────────────────
function showReelHint(reelSize, hintId) {
  const hint = document.getElementById(hintId);
  if (!hint) return;
  const rs = (reelSize || '').toString().trim();
  if (!rs) { hint.innerHTML = ''; return; }

  if (typeof orders === 'undefined') { hint.innerHTML = ''; return; }

  const active = orders
    .filter(o =>
      !['Delivered','Dispatched','Cancelled'].includes(o.status) &&
      o.date && o.reelSize && o.reelSize.toString() === rs &&
      !(typeof isSheetsReady === 'function' && isSheetsReady(o.id))
    )
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  if (!active.length) {
    hint.innerHTML = `<div style="font-size:11px;color:var(--success);padding:5px 0">
      ✅ No active orders using ${rs}" reel — this date gets a fresh reel run.
    </div>`;
    return;
  }

  const byDate = {};
  active.forEach(o => {
    if (!byDate[o.date]) byDate[o.date] = [];
    byDate[o.date].push(o);
  });

  const today = new Date(todayStr + 'T00:00:00');
  const rows = Object.entries(byDate)
    .sort(([a],[b]) => a.localeCompare(b))
    .slice(0, 4)
    .map(([date, ords]) => {
      const dt     = new Date(date + 'T00:00:00');
      const diff   = Math.round((dt - today) / 86400000);
      const lbl    = dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
      const when   = diff < 0 ? `<span style="color:var(--danger)">${Math.abs(diff)}d overdue</span>`
                   : diff === 0 ? `<span style="color:var(--blue);font-weight:700">Today</span>`
                   : diff === 1 ? `<span style="color:#B45309">Tomorrow</span>`
                   : `in ${diff}d`;
      const names  = ords.map(o => o.product || o.id).join(', ');
      const totalQ = ords.reduce((s,o) => s + (parseInt(o.qty)||0), 0);
      return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:10px;font-weight:700;min-width:70px">${lbl}</div>
        <div style="flex:1;font-size:10.5px;color:var(--muted)">${names} · ${totalQ.toLocaleString('en-IN')} pcs</div>
        <div style="font-size:10px">${when}</div>
      </div>`;
    });

  const batchMsg = byDate[Object.keys(byDate).sort()[0]]
    ? `<div style="margin-top:5px;font-size:10.5px;color:var(--blue)">
        💡 Match delivery date to batch with an existing run and save a reel changeover.
       </div>`
    : '';

  hint.innerHTML = `
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);margin-bottom:4px">
      ${rs}" Reel — Active Schedule (${active.length} order${active.length>1?'s':''})
    </div>
    ${rows.join('')}
    ${batchMsg}
  `;
}

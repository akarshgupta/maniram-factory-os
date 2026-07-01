// ══════════════════════════════════════════════════════════════
// ANALYTICS.JS — Factory Performance Dashboards + P&L
// ══════════════════════════════════════════════════════════════

let _anCharts = {};
let _anPeriod = 6;
let overheads = []; // { month, electricity, labour, rent, transport, maintenance, other, notes, total }

// ── Main entry point ─────────────────────────────────────────

async function renderAnalytics() {
  Object.values(_anCharts).forEach(c => { try { c.destroy(); } catch(_) {} });
  _anCharts = {};

  await fetchOverheads();

  _renderAnKPIs();
  _renderRevenueChart();
  _renderTopCustomersChart();
  _renderStatusDonut();
  _renderVolumeChart();
  _renderProductMixChart();
  _renderCustomerTable();
  _renderPLChart();
  _renderPLTable();
}

// ── Helpers ──────────────────────────────────────────────────

function _monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function _lastNMonths(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    out.push({ key: _monthKey(d), label: d.toLocaleDateString('en-IN', { month:'short', year:'2-digit' }) });
  }
  return out;
}

function _doneOrders()   { return orders.filter(o => ['Dispatched','Delivered'].includes(o.status)); }
function _activeOrders() { return orders.filter(o => !['Dispatched','Delivered','Cancelled'].includes(o.status)); }

function _purchaseDateKey(p) {
  const raw = p.purchaseDate || '';
  const parsed = typeof parseSheetDate === 'function' ? parseSheetDate(raw) : raw;
  return parsed ? parsed.substring(0, 7) : '';
}

// ── KPI Cards ────────────────────────────────────────────────

function _renderAnKPIs() {
  const thisKey = _monthKey(today);
  const lastKey = _monthKey(new Date(today.getFullYear(), today.getMonth()-1, 1));

  const done   = _doneOrders();
  const active = _activeOrders();

  const thisRev   = done.filter(o => o.date?.startsWith(thisKey)).reduce((s,o) => s+(o.qty||0)*(o.rate||0), 0);
  const lastRev   = done.filter(o => o.date?.startsWith(lastKey)).reduce((s,o) => s+(o.qty||0)*(o.rate||0), 0);
  const thisBoxes = done.filter(o => o.date?.startsWith(thisKey)).reduce((s,o) => s+(o.qty||0), 0);
  const pipeline  = active.reduce((s,o) => s+(o.qty||0)*(o.rate||0), 0);
  const uniqCust  = new Set(done.map(o=>o.customer)).size;
  const growth    = lastRev > 0 ? Math.round(((thisRev - lastRev) / lastRev) * 100) : null;

  const $set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  $set('an-kpi-revenue',      fmtINR(thisRev));
  $set('an-kpi-revenue-sub',  growth !== null ? (growth >= 0 ? `↑${growth}%` : `↓${Math.abs(growth)}%`) + ' vs last month' : 'this month');
  $set('an-kpi-boxes',        thisBoxes.toLocaleString('en-IN'));
  $set('an-kpi-boxes-sub',    'dispatched / delivered');
  $set('an-kpi-pipeline',     fmtINR(pipeline));
  $set('an-kpi-pipeline-sub', `${active.length} active orders`);
  $set('an-kpi-customers',    uniqCust);
  $set('an-kpi-customers-sub','unique buyers (all time)');

  const card = document.getElementById('an-kpi-revenue-card');
  if (card) card.className = 'stat-card ' + (growth === null ? 'info' : growth >= 0 ? 'good' : 'alert');
}

// ── Revenue Trend ─────────────────────────────────────────────

function _renderRevenueChart() {
  const ctx = document.getElementById('an-chart-revenue')?.getContext('2d');
  if (!ctx || typeof Chart === 'undefined') return;

  const months   = _lastNMonths(_anPeriod);
  const revenues = months.map(m => _doneOrders().filter(o => o.date?.startsWith(m.key)).reduce((s,o) => s+(o.qty||0)*(o.rate||0), 0) / 1000);
  const boxes    = months.map(m => _doneOrders().filter(o => o.date?.startsWith(m.key)).reduce((s,o) => s+(o.qty||0), 0));

  _anCharts.revenue = new Chart(ctx, {
    data: {
      labels: months.map(m => m.label),
      datasets: [
        { type:'bar',  label:'Revenue (₹K)', data:revenues, backgroundColor:'rgba(4,44,83,0.85)', borderRadius:6, yAxisID:'y',  order:2 },
        { type:'line', label:'Boxes',        data:boxes,    borderColor:'#3B82F6', backgroundColor:'rgba(59,130,246,0.08)', borderWidth:2.5, pointRadius:5, pointBackgroundColor:'#3B82F6', tension:0.35, fill:true, yAxisID:'y1', order:1 },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'top', labels:{ boxWidth:12, font:{ size:12 } } } },
      scales:{
        y:  { beginAtZero:true, title:{ display:true, text:'₹K' }, grid:{ color:'rgba(0,0,0,0.05)' } },
        y1: { beginAtZero:true, position:'right', title:{ display:true, text:'Boxes' }, grid:{ drawOnChartArea:false } },
      }
    }
  });
}

// ── Top Customers ─────────────────────────────────────────────

function _renderTopCustomersChart() {
  const ctx = document.getElementById('an-chart-customers')?.getContext('2d');
  if (!ctx || typeof Chart === 'undefined') return;

  const map = {};
  _doneOrders().forEach(o => { map[o.customer] = (map[o.customer]||0) + (o.qty||0)*(o.rate||0); });
  const sorted  = Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const palette = ['#042C53','#185FA5','#1D4ED8','#3B82F6','#60A5FA','#93C5FD','#BFDBFE','#DBEAFE'];

  _anCharts.customers = new Chart(ctx, {
    type:'bar',
    data:{ labels:sorted.map(([k])=>k), datasets:[{ data:sorted.map(([,v])=>Math.round(v/1000)), backgroundColor:palette.slice(0,sorted.length), borderRadius:5 }] },
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:c=>` ₹${c.raw}K` } } },
      scales:{ x:{ beginAtZero:true, title:{ display:true, text:'₹K' }, grid:{ color:'rgba(0,0,0,0.05)' } } }
    }
  });
}

// ── Status Donut ──────────────────────────────────────────────

function _renderStatusDonut() {
  const ctx = document.getElementById('an-chart-status')?.getContext('2d');
  if (!ctx || typeof Chart === 'undefined') return;

  const map = {};
  orders.forEach(o => { map[o.status] = (map[o.status]||0)+1; });
  const order  = ['New','In Production','Ready','Dispatched','Delivered','Cancelled'];
  const labels = order.filter(k => map[k]);
  const colors = { 'New':'#3B82F6','In Production':'#F59E0B','Ready':'#10B981','Dispatched':'#6366F1','Delivered':'#059669','Cancelled':'#EF4444' };

  _anCharts.status = new Chart(ctx, {
    type:'doughnut',
    data:{ labels, datasets:[{ data:labels.map(k=>map[k]), backgroundColor:labels.map(l=>colors[l]||'#94A3B8'), borderWidth:3, borderColor:'#fff', hoverOffset:6 }] },
    options:{
      responsive:true, maintainAspectRatio:false, cutout:'62%',
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:12, font:{ size:11 }, padding:10 } }, tooltip:{ callbacks:{ label:c=>` ${c.label}: ${c.raw} orders` } } }
    }
  });
}

// ── Monthly Volume ────────────────────────────────────────────

function _renderVolumeChart() {
  const ctx = document.getElementById('an-chart-volume')?.getContext('2d');
  if (!ctx || typeof Chart === 'undefined') return;

  const months = _lastNMonths(_anPeriod);
  const mk = fn => months.map(m => orders.filter(o => fn(o) && o.date?.startsWith(m.key)).length);

  _anCharts.volume = new Chart(ctx, {
    type:'bar',
    data:{
      labels:months.map(m=>m.label),
      datasets:[
        { label:'Completed', data:mk(o=>['Dispatched','Delivered'].includes(o.status)), backgroundColor:'#10B981', borderRadius:4 },
        { label:'Active',    data:mk(o=>!['Dispatched','Delivered','Cancelled'].includes(o.status)), backgroundColor:'#3B82F6', borderRadius:4 },
        { label:'Cancelled', data:mk(o=>o.status==='Cancelled'), backgroundColor:'#F87171', borderRadius:4 },
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'top', labels:{ boxWidth:12, font:{ size:12 } } } },
      scales:{ x:{ stacked:true, grid:{ display:false } }, y:{ stacked:true, beginAtZero:true, ticks:{ precision:0 }, grid:{ color:'rgba(0,0,0,0.05)' } } }
    }
  });
}

// ── Product Mix ───────────────────────────────────────────────

function _renderProductMixChart() {
  const ctx = document.getElementById('an-chart-products')?.getContext('2d');
  if (!ctx || typeof Chart === 'undefined') return;

  const map = {};
  _doneOrders().filter(o=>o.product?.trim()).forEach(o => { const k=o.product.trim(); map[k]=(map[k]||0)+(o.qty||0); });

  if (!Object.keys(map).length) {
    const wrap = ctx.canvas.closest('.an-chart-wrap');
    if (wrap) wrap.innerHTML = '<div class="empty-state" style="padding:60px 0;margin:0">No product data yet</div>';
    return;
  }

  const sorted  = Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const palette = ['#042C53','#185FA5','#1D4ED8','#3B82F6','#60A5FA','#93C5FD','#BFDBFE','#EFF6FF'];

  _anCharts.products = new Chart(ctx, {
    type:'bar',
    data:{ labels:sorted.map(([k])=>k), datasets:[{ data:sorted.map(([,v])=>v), backgroundColor:palette.slice(0,sorted.length), borderRadius:5 }] },
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:c=>` ${c.raw.toLocaleString('en-IN')} boxes` } } },
      scales:{ x:{ beginAtZero:true, title:{ display:true, text:'Boxes' }, grid:{ color:'rgba(0,0,0,0.05)' } } }
    }
  });
}

// ── Customer Table ────────────────────────────────────────────

function _renderCustomerTable() {
  const el = document.getElementById('an-customer-table');
  if (!el) return;

  const map = {};
  orders.forEach(o => {
    if (!o.customer) return;
    if (!map[o.customer]) map[o.customer] = { revenue:0, boxes:0, count:0, pipeline:0, lastDate:'' };
    const d = map[o.customer];
    d.count++;
    if (['Dispatched','Delivered'].includes(o.status)) { d.revenue+=(o.qty||0)*(o.rate||0); d.boxes+=(o.qty||0); }
    else if (o.status !== 'Cancelled') { d.pipeline+=(o.qty||0)*(o.rate||0); }
    if ((o.date||'') > d.lastDate) d.lastDate = o.date;
  });

  const rows = Object.entries(map).sort((a,b)=>b[1].revenue-a[1].revenue);
  if (!rows.length) { el.innerHTML='<div class="empty-state">No order data yet.</div>'; return; }

  el.innerHTML = `
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--bg);border-bottom:2px solid var(--border)">
            <th class="an-th">#</th>
            <th class="an-th" style="text-align:left">Customer</th>
            <th class="an-th" style="text-align:right">Revenue</th>
            <th class="an-th" style="text-align:right">Boxes</th>
            <th class="an-th" style="text-align:right">Orders</th>
            <th class="an-th" style="text-align:right">Pipeline</th>
            <th class="an-th" style="text-align:right">Last Order</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(([name,d],i) => `
            <tr style="border-bottom:1px solid var(--border)${i%2===1?';background:#FAFBFC':''}">
              <td class="an-td" style="color:var(--muted);font-size:12px">${i+1}</td>
              <td class="an-td" style="font-weight:600">${name}</td>
              <td class="an-td" style="text-align:right;font-weight:700;color:var(--success)">${fmtINR(d.revenue)}</td>
              <td class="an-td" style="text-align:right">${d.boxes.toLocaleString('en-IN')}</td>
              <td class="an-td" style="text-align:right">${d.count}</td>
              <td class="an-td" style="text-align:right;color:${d.pipeline>0?'#B45309':'var(--muted)'}">
                ${d.pipeline > 0 ? fmtINR(d.pipeline) : '—'}
              </td>
              <td class="an-td" style="text-align:right;font-size:12px;color:var(--muted)">${d.lastDate ? formatDate(d.lastDate) : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════
// PROFIT & LOSS
// ══════════════════════════════════════════════════════════════

async function fetchOverheads() {
  try {
    const url  = `https://sheets.googleapis.com/v4/spreadsheets/${ORDERS_SHEET_ID}/values/${encodeURIComponent('Overheads!A1:H200')}?key=${API_KEY}`;
    const json = await fetch(url).then(r => r.json());
    if (json.error) return; // tab may not exist yet — that's fine
    overheads = (json.values || []).slice(1).filter(r => r[0]).map(r => {
      const e=parseFloat(r[1])||0, l=parseFloat(r[2])||0, rn=parseFloat(r[3])||0,
            t=parseFloat(r[4])||0, m=parseFloat(r[5])||0, o=parseFloat(r[6])||0;
      return { month:r[0], electricity:e, labour:l, rent:rn, transport:t, maintenance:m, other:o, notes:r[7]||'', total:e+l+rn+t+m+o };
    });
  } catch(e) { console.warn('fetchOverheads:', e); }
}

function _plRow(m) {
  const revenue  = _doneOrders()
    .filter(o => o.date?.startsWith(m.key))
    .reduce((s,o) => s+(o.qty||0)*(o.rate||0), 0);

  const material = purchases
    .filter(p => _purchaseDateKey(p) === m.key)
    .reduce((s,p) => s+(p.quantityKg||0)*(p.ratePerKg||0), 0);

  const ov          = overheads.find(o => o.month === m.key);
  const overheadAmt = ov?.total || 0;
  const grossProfit = revenue - material;
  const netProfit   = grossProfit - overheadAmt;
  const grossMargin = revenue > 0 ? Math.round((grossProfit/revenue)*100) : null;
  const netMargin   = revenue > 0 ? Math.round((netProfit/revenue)*100) : null;

  return { ...m, revenue, material, grossProfit, grossMargin, overheadAmt, ov, netProfit, netMargin };
}

function _renderPLChart() {
  const ctx = document.getElementById('an-chart-pl')?.getContext('2d');
  if (!ctx || typeof Chart === 'undefined') return;

  const months = _lastNMonths(_anPeriod);
  const rows   = months.map(_plRow);

  _anCharts.pl = new Chart(ctx, {
    data: {
      labels: months.map(m => m.label),
      datasets: [
        { type:'bar',  label:'Revenue',    data:rows.map(r=>+(r.revenue/1000).toFixed(1)),    backgroundColor:'rgba(4,44,83,0.8)',   borderRadius:5, order:2 },
        { type:'bar',  label:'Total Cost', data:rows.map(r=>+((r.material+r.overheadAmt)/1000).toFixed(1)), backgroundColor:'rgba(239,68,68,0.65)', borderRadius:5, order:2 },
        { type:'line', label:'Net Profit', data:rows.map(r=>+(r.netProfit/1000).toFixed(1)),  borderColor:'#10B981', backgroundColor:'rgba(16,185,129,0.08)', borderWidth:2.5, pointRadius:5, pointBackgroundColor:'#10B981', tension:0.3, fill:true, order:1 },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'top', labels:{ boxWidth:12, font:{ size:12 } } }, tooltip:{ callbacks:{ label:c=>` ${c.dataset.label}: ₹${c.raw}K` } } },
      scales:{
        x:{ grid:{ display:false } },
        y:{ title:{ display:true, text:'₹K' }, grid:{ color:'rgba(0,0,0,0.05)' } }
      }
    }
  });
}

function _renderPLTable() {
  const el = document.getElementById('an-pl-table');
  if (!el) return;

  // Show last 12 months, most recent first
  const rows = _lastNMonths(12).reverse().map(_plRow).filter(r => r.revenue>0 || r.material>0 || r.overheadAmt>0);

  if (!rows.length) {
    el.innerHTML = `
      <div class="empty-state" style="padding:40px 0">
        No order or purchase data yet.<br>
        <span style="font-size:12px;color:var(--muted)">Once orders are dispatched/delivered and purchases are recorded, P&L will appear here.</span>
      </div>`;
    return;
  }

  const pctCell = (val, pct) => {
    if (pct === null) return '<td class="an-td" style="text-align:right;color:var(--muted)">—</td>';
    const col = pct >= 0 ? 'var(--success)' : 'var(--danger)';
    return `<td class="an-td" style="text-align:right;color:${col};font-weight:600">${pct >= 0 ? '+' : ''}${pct}%</td>`;
  };

  el.innerHTML = `
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--bg);border-bottom:2px solid var(--border)">
            <th class="an-th" style="text-align:left;min-width:80px">Month</th>
            <th class="an-th" style="text-align:right;min-width:90px">Revenue</th>
            <th class="an-th" style="text-align:right;min-width:110px">Material Cost</th>
            <th class="an-th" style="text-align:right;min-width:100px">Gross Profit</th>
            <th class="an-th" style="text-align:right;min-width:55px">GM%</th>
            <th class="an-th" style="text-align:right;min-width:100px">Overheads</th>
            <th class="an-th" style="text-align:right;min-width:100px">Net Profit</th>
            <th class="an-th" style="text-align:right;min-width:55px">NM%</th>
            <th class="an-th" style="text-align:center;min-width:50px"></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r,i) => `
            <tr style="border-bottom:1px solid var(--border)${i%2===1?';background:#FAFBFC':''}">
              <td class="an-td" style="font-weight:600">${r.label}</td>
              <td class="an-td" style="text-align:right;font-weight:600">${fmtINR(r.revenue)}</td>
              <td class="an-td" style="text-align:right;color:var(--danger)">${r.material > 0 ? fmtINR(r.material) : '<span style="color:var(--muted)">—</span>'}</td>
              <td class="an-td" style="text-align:right;font-weight:700;color:${r.grossProfit>=0?'var(--success)':'var(--danger)'}">${fmtINR(r.grossProfit)}</td>
              ${pctCell(r.grossProfit, r.grossMargin)}
              <td class="an-td" style="text-align:right">
                ${r.ov
                  ? `<span style="color:var(--danger)">${fmtINR(r.overheadAmt)}</span>`
                  : `<span style="font-size:11px;color:var(--muted)">Not entered</span>`}
              </td>
              <td class="an-td" style="text-align:right;font-weight:700;color:${r.netProfit>=0?'var(--success)':'var(--danger)'}">
                ${r.ov ? fmtINR(r.netProfit) : '<span style="color:var(--muted)">—</span>'}
              </td>
              ${pctCell(r.netProfit, r.ov ? r.netMargin : null)}
              <td class="an-td" style="text-align:center">
                <button class="btn-sm" onclick="openOverheadModal('${r.key}')" title="${r.ov ? 'Edit overheads' : 'Add overheads'}">
                  ${r.ov ? '✏️' : '➕'}
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div style="padding:10px 16px;font-size:11px;color:var(--muted);border-top:1px solid var(--border)">
      Material Cost = paper/reel purchases matched by purchase date (cash basis).
      Net Profit shown only when overheads are entered. Click ➕ to add monthly expenses.
    </div>
  `;
}

// ── Overhead modal ────────────────────────────────────────────

function openOverheadModal(month) {
  const m  = month || _monthKey(today);
  const ov = overheads.find(o => o.month === m);

  document.getElementById('ov-month').value       = m;
  document.getElementById('ov-electricity').value = ov?.electricity || '';
  document.getElementById('ov-labour').value      = ov?.labour      || '';
  document.getElementById('ov-rent').value        = ov?.rent        || '';
  document.getElementById('ov-transport').value   = ov?.transport   || '';
  document.getElementById('ov-maintenance').value = ov?.maintenance || '';
  document.getElementById('ov-other').value       = ov?.other       || '';
  document.getElementById('ov-notes').value       = ov?.notes       || '';
  _updateOvTotal();
  document.getElementById('ov-overlay').style.display = 'flex';
}

function closeOverheadModal() {
  document.getElementById('ov-overlay').style.display = 'none';
}

function _updateOvTotal() {
  const get = id => parseFloat(document.getElementById(id)?.value) || 0;
  const total = get('ov-electricity') + get('ov-labour') + get('ov-rent') + get('ov-transport') + get('ov-maintenance') + get('ov-other');
  const el = document.getElementById('ov-total');
  if (el) el.textContent = fmtINR(total);
}

async function saveOverheadEntry() {
  const month       = document.getElementById('ov-month')?.value;
  if (!month) { alert('Please select a month.'); return; }

  const get  = id  => parseFloat(document.getElementById(id)?.value) || 0;
  const electricity = get('ov-electricity'), labour      = get('ov-labour'),
        rent        = get('ov-rent'),        transport   = get('ov-transport'),
        maintenance = get('ov-maintenance'), other        = get('ov-other');
  const notes = document.getElementById('ov-notes')?.value || '';
  const total = electricity + labour + rent + transport + maintenance + other;

  const btn = document.getElementById('ov-save-btn');
  if (btn) { btn.textContent = '⏳ Saving...'; btn.disabled = true; }

  await fetch(APPS_SCRIPT_URL, {
    method:'POST', mode:'no-cors',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ action:'saveOverhead', month, electricity, labour, rent, transport, maintenance, other, notes }),
  }).catch(() => {});

  // Optimistic update
  const idx = overheads.findIndex(o => o.month === month);
  const entry = { month, electricity, labour, rent, transport, maintenance, other, notes, total };
  if (idx >= 0) overheads[idx] = entry; else overheads.push(entry);

  closeOverheadModal();
  _renderPLTable();
  _renderPLChart();

  if (btn) { btn.textContent = '💾 Save'; btn.disabled = false; }
}

// ── Period toggle ─────────────────────────────────────────────

function setAnPeriod(n, el) {
  _anPeriod = n;
  document.querySelectorAll('.an-period-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  _renderRevenueChart();
  _renderVolumeChart();
  _renderPLChart();
}

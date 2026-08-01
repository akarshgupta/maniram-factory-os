// ══════════════════════════════════════════════════════════════
// JOB-COSTING.JS — Per-order cost & profitability
// cost/box = (box weight kg × (paper ₹/kg + conversion ₹/kg)) + printing ₹/box
// Assumptions persist in localStorage.
// ══════════════════════════════════════════════════════════════

const LS_COST_ASSUME = 'mi_cost_assumptions_v1';

function _costAssumptions() {
  try { return JSON.parse(localStorage.getItem(LS_COST_ASSUME) || '{}'); }
  catch (e) { return {}; }
}

function saveCostAssumptions() {
  const a = {
    paper:  parseFloat(document.getElementById('jc-paper').value) || 0,
    conv:   parseFloat(document.getElementById('jc-conv').value) || 0,
    print:  parseFloat(document.getElementById('jc-print').value) || 0,
    period: document.getElementById('jc-period').value,
  };
  try { localStorage.setItem(LS_COST_ASSUME, JSON.stringify(a)); } catch (e) {}
  renderJobCosting();
}

function _loadCostAssumptionsIntoForm() {
  const a = _costAssumptions();
  if (a.paper)  document.getElementById('jc-paper').value = a.paper;
  if (a.conv)   document.getElementById('jc-conv').value  = a.conv;
  if (a.print)  document.getElementById('jc-print').value = a.print;
  if (a.period) document.getElementById('jc-period').value = a.period;

  // Suggest latest purchase rate as the paper rate
  const chip = document.getElementById('jc-rate-chip');
  if (chip) {
    try {
      const purchases = JSON.parse(localStorage.getItem(LS_PURCHASES) || '[]');
      const withRate = purchases.filter(p => parseFloat(p.ratePerKg) > 0)
        .sort((x, y) => (y.purchaseDate || '').localeCompare(x.purchaseDate || ''));
      chip.innerHTML = withRate.length
        ? ` Last reel purchase: <b>₹${parseFloat(withRate[0].ratePerKg)}/kg</b>` : '';
    } catch (e) { chip.textContent = ''; }
  }
}

function _costingOrders() {
  const period = _costAssumptions().period || 'month';
  const all = (typeof orders !== 'undefined' ? orders : []);
  if (period === 'all') return all;
  if (period === 'active') return all.filter(o => !FINISHED_STATUSES.includes(o.status));
  // this month — by delivery date, plus anything still active
  const ym = new Date().toISOString().slice(0, 7);
  return all.filter(o => (o.date || '').startsWith(ym) || !FINISHED_STATUSES.includes(o.status));
}

function renderJobCosting() {
  const body = document.getElementById('costing-body');
  if (!body) return;
  const a = _costAssumptions();

  if (!a.paper && !a.conv) {
    body.innerHTML = '<div class="empty-state">Enter the paper and conversion rates above — cost and profit for every order will appear here.</div>';
    return;
  }

  const list = _costingOrders();
  if (!list.length) {
    body.innerHTML = '<div class="empty-state">No orders found in this period.</div>';
    return;
  }

  let totQty = 0, totCost = 0, totRevenue = 0;
  const rows = list.map(o => {
    const wtKg    = (parseFloat(o.weight) || 0) / 1000;   // weight stored in grams/box
    const qty     = parseInt(o.qty) || 0;
    const rate    = parseFloat(o.rate) || 0;
    const costBox = wtKg * (a.paper + a.conv) + (a.print || 0);
    const profitBox = rate - costBox;
    const marginPct = rate > 0 ? (profitBox / rate) * 100 : null;
    totQty     += qty;
    totCost    += costBox * qty;
    totRevenue += rate * qty;
    return { o, wtKg, qty, rate, costBox, profitBox, marginPct };
  }).sort((x, y) => (x.marginPct ?? 999) - (y.marginPct ?? 999)); // worst margin first

  const totProfit = totRevenue - totCost;
  const totMargin = totRevenue > 0 ? (totProfit / totRevenue) * 100 : 0;

  const marginBadge = (m) => {
    if (m === null) return '<span style="color:var(--muted)">no rate</span>';
    const cls = m >= 15 ? 'margin-good' : m >= 5 ? 'margin-mid' : 'margin-bad';
    return `<span class="margin-pill ${cls}">${m.toFixed(1)}%</span>`;
  };

  body.innerHTML = `
    <div class="add-order-form" style="margin-bottom:12px;display:flex;gap:24px;flex-wrap:wrap">
      <div><div class="form-label">Orders</div><div style="font-size:20px;font-weight:700">${list.length}</div></div>
      <div><div class="form-label">Boxes</div><div style="font-size:20px;font-weight:700">${totQty.toLocaleString('en-IN')}</div></div>
      <div><div class="form-label">Revenue</div><div style="font-size:20px;font-weight:700">₹${Math.round(totRevenue).toLocaleString('en-IN')}</div></div>
      <div><div class="form-label">Cost</div><div style="font-size:20px;font-weight:700">₹${Math.round(totCost).toLocaleString('en-IN')}</div></div>
      <div><div class="form-label">Profit</div><div style="font-size:20px;font-weight:700;color:${totProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">₹${Math.round(totProfit).toLocaleString('en-IN')}</div></div>
      <div><div class="form-label">Margin</div><div style="font-size:20px;font-weight:700">${marginBadge(totMargin)}</div></div>
    </div>
    <div class="data-table-wrap"><div class="data-table-scroll">
    <table class="data-table">
      <thead><tr>
        <th>Order</th><th>Customer / Product</th><th class="num">Qty</th><th class="num">Wt g/box</th>
        <th class="num">Cost/box</th><th class="num">Rate/box</th><th class="num">Profit/box</th>
        <th class="num">Total profit</th><th class="num">Margin</th>
      </tr></thead><tbody>` +
    rows.map(r => `
      <tr>
        <td style="font-weight:600">${r.o.id}</td>
        <td>${r.o.customer}<span style="color:var(--muted)"> · ${r.o.product || '—'}</span></td>
        <td class="num">${r.qty.toLocaleString('en-IN')}</td>
        <td class="num">${r.wtKg ? Math.round(r.wtKg * 1000) : '—'}</td>
        <td class="num">₹${r.costBox.toFixed(2)}</td>
        <td class="num">${r.rate ? '₹' + r.rate.toFixed(2) : '—'}</td>
        <td class="num" style="color:${r.profitBox >= 0 ? 'inherit' : 'var(--danger)'}">${r.rate ? '₹' + r.profitBox.toFixed(2) : '—'}</td>
        <td class="num">${r.rate ? '₹' + Math.round(r.profitBox * r.qty).toLocaleString('en-IN') : '—'}</td>
        <td class="num">${marginBadge(r.marginPct)}</td>
      </tr>`).join('') + `
    </tbody></table></div></div>
    <div class="field-hint" style="margin-top:8px">Cost/box = (weight × (paper + conversion)) + printing. Orders without a weight or rate show incomplete figures — set product weights on the Clients page.</div>`;
}

function initJobCosting() {
  _loadCostAssumptionsIntoForm();
  renderJobCosting();
}

// ══════════════════════════════════════════════════════════════
// PIPELINE-BOARD.JS — Kanban view of orders by status
// Status moves reuse quickUpdateStatus() (production-plan.js),
// which persists to the Orders sheet.
// ══════════════════════════════════════════════════════════════

const PIPELINE_STAGES = ['New', 'In Production', 'Ready', 'Dispatched', 'Delivered'];

const PIPELINE_STAGE_META = {
  'New':           { icon: '🆕', col: '#2980B9' },
  'In Production': { icon: '🏭', col: '#E67E22' },
  'Ready':         { icon: '✅', col: '#27AE60' },
  'Dispatched':    { icon: '🚚', col: '#8E44AD' },
  'Delivered':     { icon: '📬', col: '#7F8C8D' },
};

function pipelineMove(orderId, dir) {
  const o = (typeof orders !== 'undefined' ? orders : []).find(x => x.id === orderId);
  if (!o) return;
  const idx = PIPELINE_STAGES.indexOf(o.status);
  const next = PIPELINE_STAGES[idx + dir];
  if (idx < 0 || !next) return;
  quickUpdateStatus(orderId, next);
  renderPipelineBoard();
}

function renderPipelineBoard() {
  const root = document.getElementById('kanban-root');
  if (!root) return;
  const all = (typeof orders !== 'undefined' ? orders : []).filter(o => o.status !== 'Cancelled');

  if (!all.length) {
    root.innerHTML = '<div class="empty-state">Koi order nahi — Orders page se naya order banao.</div>';
    return;
  }

  root.innerHTML = `<div style="display:flex;gap:12px;overflow-x:auto;align-items:flex-start;padding-bottom:8px">` +
    PIPELINE_STAGES.map(stage => {
      const meta  = PIPELINE_STAGE_META[stage];
      const cards = all.filter(o => o.status === stage);
      return `
      <div style="min-width:220px;flex:1;background:var(--card,#fff);border:1px solid var(--border,#e5e7eb);border-radius:12px;padding:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid ${meta.col}">
          <span style="font-weight:700;font-size:13px">${meta.icon} ${stage}</span>
          <span style="background:${meta.col};color:#fff;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:700">${cards.length}</span>
        </div>
        ${cards.length === 0 ? '<div style="color:var(--muted,#999);font-size:12px;text-align:center;padding:14px 0">—</div>' : cards.map(o => {
          const overdue = o.date && o.date < todayStr && !['Dispatched','Delivered'].includes(o.status);
          const idx = PIPELINE_STAGES.indexOf(stage);
          return `
          <div style="border:1px solid var(--border,#e5e7eb);border-left:3px solid ${meta.col};border-radius:8px;padding:8px 10px;margin-bottom:8px;background:var(--bg,#fafafa)">
            <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700">
              <span>${o.id}</span>
              ${overdue ? '<span style="color:#E74C3C" title="Past delivery date">⏰</span>' : ''}
            </div>
            <div style="font-size:12px;margin:2px 0">${o.customer}</div>
            <div style="font-size:11px;color:var(--muted,#888)">${o.product || o.size || ''} · ${(parseInt(o.qty)||0).toLocaleString('en-IN')} pcs${o.date ? ' · ' + formatDate(o.date) : ''}</div>
            <div style="display:flex;justify-content:space-between;margin-top:6px">
              <button class="btn-sm" ${idx === 0 ? 'disabled style="opacity:.3"' : ''} onclick="pipelineMove('${o.id}', -1)" title="Move back">◀</button>
              <button class="btn-sm" onclick="if(typeof quickPrintJobCard==='function')quickPrintJobCard('${o.id}')" title="Job Card">📋</button>
              <button class="btn-sm" ${idx === PIPELINE_STAGES.length - 1 ? 'disabled style="opacity:.3"' : ''} onclick="pipelineMove('${o.id}', 1)" title="Move forward">▶</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    }).join('') + `</div>`;
}

// ══════════════════════════════════════════════════════════════
// AI-AGENT.JS — "🤖 Assistant": a chat panel where Claude looks into
// orders, challans and invoices and repairs problems using the same fix
// functions as Data Checks' 🔧 panel. It runs entirely in this browser
// (that's where challans/invoices live): the official Anthropic SDK is
// loaded from the CDN and called with the owner's own API key, kept in
// this browser's localStorage only — never in the repo or a sheet.
// Reading is free-running; every change waits for an Approve click.
// ══════════════════════════════════════════════════════════════

// jsDelivr's +esm build: one browser-ready ES module with its dependencies resolved
const AI_SDK_URL      = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm';
const LS_AI_KEY       = 'mi_ai_api_key_v1';
const LS_AI_MODEL     = 'mi_ai_model_v1';
const AI_MODELS       = [['claude-opus-5-5', 'Claude Opus 5.5 (best)'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (cheaper)']];
const AI_MAX_STEPS    = 25;

let _aiSdk = null, _aiClient = null, _aiClientKey = '';
let _aiMessages = [];      // the API conversation — assistant turns appended unchanged
let _aiBusy = false;
let _aiPendingApproval = null;

function _aiKey()   { try { return localStorage.getItem(LS_AI_KEY) || ''; } catch { return ''; } }
function _aiModel() { try { return localStorage.getItem(LS_AI_MODEL) || AI_MODELS[0][0]; } catch { return AI_MODELS[0][0]; } }

async function _aiGetClient() {
  if (!_aiSdk) _aiSdk = await import(AI_SDK_URL);
  const key = _aiKey();
  if (!_aiClient || _aiClientKey !== key) {
    // The key belongs to the owner and stays in this browser — that is what
    // dangerouslyAllowBrowser acknowledges.
    _aiClient = new _aiSdk.default({ apiKey: key, dangerouslyAllowBrowser: true });
    _aiClientKey = key;
  }
  return _aiClient;
}

const AI_SYSTEM = `You are the assistant inside Maniram Factory OS, the office app of Maniram Industries, a corrugated-box maker in Jhansi. You help the owner find and fix problems in orders, delivery challans and invoices.

How the data works:
- An order (MIORD###) has a party, product, size (L*W*H inches), colour, ply, quantity (pieces), rate (₹ per piece), order date and status. Delivered, Dispatched and Cancelled orders are closed; anything else is open.
- A delivery challan (DC-###/YY) records boxes that left the factory against one order. Dispatched quantity = the sum of an order's challans. Most challans are made automatically from the supervisor's dispatch entries.
- Invoices (INV###) bill challans; each line usually points at its challan. A line with no challan was typed by hand and is the usual cause of double billing.
- When a party has several open orders for the same box, dispatches must use up the oldest order first.
- Orders placed before the first challan was recorded were delivered before the app tracked dispatches, so "0 dispatched" on them is normal.

How to work:
- Look before you act: use run_data_checks, get_order and search_orders to understand the problem, then say in one or two sentences what is wrong and what you propose.
- Then call the fix tool. The owner sees an Approve / Reject card for every change; do not ask for permission in text first. If a change is rejected, ask what they want instead.
- Make one change per tool call, and check the result with get_order afterwards when it matters.
- If something cannot be fixed with your tools (for example a wrong rate in the order sheet), say exactly where in the app the owner should fix it.
- Write in plain, short English. Use Indian number formatting (1,00,000) and ₹. Use order IDs and DC numbers so the owner can find them.`;

const _aiObj = (props, required) => ({ type: 'object', properties: props, required: required || Object.keys(props), additionalProperties: false });
const AI_TOOLS = [
  { name: 'run_data_checks', description: 'Run the Data Checks and list every problem currently found (same list as the 🩺 Checks button).', input_schema: _aiObj({}, []) },
  { name: 'get_order', description: 'Full detail of one order: fields, dispatched/billed totals, every challan, every invoice line (with its index) and the recent history log.', input_schema: _aiObj({ order_id: { type: 'string', description: 'e.g. MIORD062' } }) },
  { name: 'search_orders', description: 'Find orders by party, product, size or order ID text. Returns up to 30 matches with qty, dispatched, rate, order date and status.', input_schema: _aiObj({ query: { type: 'string' }, include_closed: { type: 'boolean', description: 'Also return Delivered/Dispatched/Cancelled orders' } }) },
  { name: 'move_challan', write: true, description: 'Move a challan, or some pieces of it, to another order. Moving part of it splits the challan in two and its invoice line follows.', input_schema: _aiObj({ dc_number: { type: 'string' }, to_order_id: { type: 'string' }, pieces: { type: 'integer', description: 'Pieces to move; the full challan quantity moves the whole challan' } }) },
  { name: 'move_extra_pieces', write: true, description: 'For an order dispatched beyond its quantity, move exactly the extra pieces (newest challans first) to another order.', input_schema: _aiObj({ from_order_id: { type: 'string' }, to_order_id: { type: 'string' } }) },
  { name: 'set_order_quantity', write: true, description: 'Change an order\'s ordered quantity, e.g. when extra boxes really were sent and accepted.', input_schema: _aiObj({ order_id: { type: 'string' }, quantity: { type: 'integer' } }) },
  { name: 'reopen_order', write: true, description: 'Move a closed order back to open (status New) because boxes are still to go.', input_schema: _aiObj({ order_id: { type: 'string' } }) },
  { name: 'close_order_short', write: true, description: 'Keep a closed order closed but record that it was closed short (fewer boxes sent than ordered).', input_schema: _aiObj({ order_id: { type: 'string' } }) },
  { name: 'remove_invoice_line', write: true, description: 'Remove one line from an invoice (goes to Recently Deleted). If it is the only line the whole invoice is deleted. Get line_index from get_order.', input_schema: _aiObj({ invoice_id: { type: 'string' }, line_index: { type: 'integer' } }) },
  { name: 'fix_duplicate_order_id', write: true, description: 'An order ID on two sheet rows: delete the extra row if both are identical, otherwise give the later row a new order number.', input_schema: _aiObj({ order_id: { type: 'string' } }) },
  { name: 'unlink_wrong_size_records', write: true, description: 'Unlink every challan or invoice line whose box size differs from the order it points at.', input_schema: _aiObj({}, []) },
  { name: 'bill_unbilled_challans', write: true, description: 'Create invoices for every challan that has a rate but no invoice yet.', input_schema: _aiObj({}, []) },
].map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema, strict: true, ...(t.write ? { _write: true } : {}) }));
const _aiWriteTools = new Set(AI_TOOLS.filter(t => t._write).map(t => t.name));
const _aiApiTools = AI_TOOLS.map(({ _write, ...t }) => t);

// ── Tool implementations (read straight from the app's live data) ──
function _aiOrderBrief(o) {
  const sent = typeof getDispatchedQty === 'function' ? getDispatchedQty(o.id) : 0;
  return { id: o.id, party: o.customer, product: o.product, size: o.size, colour: o.colour || '', qty: parseInt(o.qty) || 0, dispatched: sent, rate: o.rate || 0, order_date: o.orderDate || '', status: o.status };
}

function _aiFindOrder(id) {
  const o = orders.find(x => x.id.toLowerCase() === String(id || '').trim().toLowerCase());
  if (!o) throw new Error(`No order ${id}.`);
  return o;
}

const _aiDescribe = {
  move_challan:             i => `Move ${i.pieces.toLocaleString('en-IN')} pcs of ${i.dc_number} to ${i.to_order_id}`,
  move_extra_pieces:        i => `Move the extra pieces of ${i.from_order_id} to ${i.to_order_id}`,
  set_order_quantity:       i => `Change ${i.order_id} quantity to ${i.quantity.toLocaleString('en-IN')} pcs`,
  reopen_order:             i => `Reopen ${i.order_id} (status New)`,
  close_order_short:        i => `Keep ${i.order_id} closed and mark it short`,
  remove_invoice_line:      i => { const iv = invoiceList.find(x => x.id === i.invoice_id); const it = iv && iv.items[i.line_index]; return `Remove ${it ? `${it.qty} pcs @ ₹${it.rate} (${it.desc})` : 'line ' + i.line_index} from ${i.invoice_id}`; },
  fix_duplicate_order_id:   i => `Fix the duplicate ${i.order_id} row`,
  unlink_wrong_size_records: () => 'Unlink every record of a different box size from its order',
  bill_unbilled_challans:   () => 'Create invoices for unbilled challans that have a rate',
};

function _aiRunTool(name, input) {
  switch (name) {
    case 'run_data_checks': {
      const list = runHealthCheck();
      return list.length ? list.map(i => `[${i.level}] ${i.group}: ${i.html.replace(/<br>/g, '; ').replace(/<[^>]+>/g, '')}`).join('\n') : 'No problems found.';
    }
    case 'get_order': {
      const o = _aiFindOrder(input.order_id);
      const challans = challanList.filter(c => c.orderId === o.id).map(c => ({ dc: c.dcNum, date: c.date, pieces: c.qty, rate: c.rate, from_supervisor: !!c.svTs, note: c.note || '' }));
      const lines = [];
      invoiceList.forEach(iv => (iv.items || []).forEach((it, idx) => { if ((it.orderId || iv.orderId) === o.id) lines.push({ invoice: iv.id, line_index: idx, date: iv.date, pieces: it.qty, rate: it.rate, challan: it.challanDc || 'typed by hand', desc: it.desc }); }));
      const others = orders.filter(x => x.id !== o.id && !FINISHED_STATUSES.includes(x.status) && (typeof _hKey === 'function' ? _hKey(x.customer) === _hKey(o.customer) : x.customer === o.customer)).map(_aiOrderBrief);
      return JSON.stringify({ order: { ..._aiOrderBrief(o), remarks: o.remarks || '', weight_gm: o.weight || '', ply: o.ply || '' },
        billed: lines.reduce((s, l) => s + (+l.pieces || 0), 0), challans, invoice_lines: lines,
        other_open_orders_of_party: others, history: (typeof getOrderLog === 'function' ? getOrderLog(o.id) : []).slice(-15) });
    }
    case 'search_orders': {
      const q = String(input.query || '').toLowerCase();
      const hits = orders.filter(o => (input.include_closed || !FINISHED_STATUSES.includes(o.status)) && (typeof matchesSearch === 'function' ? matchesSearch(o, q) : JSON.stringify(o).toLowerCase().includes(q)));
      return JSON.stringify({ count: hits.length, orders: hits.slice(0, 30).map(_aiOrderBrief) });
    }
    case 'move_challan': {
      const c = challanList.find(x => x.dcNum.toLowerCase() === String(input.dc_number).toLowerCase());
      if (!c) throw new Error(`No challan ${input.dc_number}.`);
      const to = _aiFindOrder(input.to_order_id);
      const qty = Math.min(input.pieces, c.qty);
      if (qty <= 0) throw new Error('Pieces must be more than 0.');
      const from = c.orderId;
      const dc = _hMoveChallanQty(c.dcNum, to.id, qty);
      _hAfterChange(from, to.id);
      return `Moved ${qty} pcs of ${c.dcNum} from ${from || 'no order'} to ${to.id}${dc !== c.dcNum ? ` (split off as ${dc})` : ''}.`;
    }
    case 'move_extra_pieces': return fixMoveExcess(_aiFindOrder(input.from_order_id).id, _aiFindOrder(input.to_order_id).id, true);
    case 'set_order_quantity': {
      if (!(input.quantity > 0)) throw new Error('Quantity must be more than 0.');
      return fixSetQty(_aiFindOrder(input.order_id).id, input.quantity, true);
    }
    case 'reopen_order': {
      const o = _aiFindOrder(input.order_id);
      const prev = o.status; o.status = 'New';
      if (typeof logOrderEvent === 'function') logOrderEvent(o.id, 'Reopened', `${prev} → New — by the Assistant`);
      if (typeof _pushOrderUpdate === 'function') _pushOrderUpdate(o);
      _hAfterChange();
      return `${o.id} reopened (was ${prev}).`;
    }
    case 'close_order_short':      return fixCloseShort(_aiFindOrder(input.order_id).id, true);
    case 'remove_invoice_line':    return fixRemoveInvoiceLine(input.invoice_id, input.line_index, true);
    case 'fix_duplicate_order_id': return fixDuplicateId(_aiFindOrder(input.order_id).id, true);
    case 'unlink_wrong_size_records': {
      const n = typeof unlinkMislinkedOrderRecords === 'function' ? unlinkMislinkedOrderRecords() : 0;
      return n ? `Unlinked ${n} record(s).` : 'Nothing to unlink.';
    }
    case 'bill_unbilled_challans': {
      const n = typeof autoInvoiceChallans === 'function' ? autoInvoiceChallans() : 0;
      return n ? `Created ${n} invoice(s).` : 'No unbilled challans with a rate.';
    }
  }
  throw new Error(`Unknown tool ${name}.`);
}

// ── Approval card: resolves true/false when the owner clicks ──
function _aiAskApproval(text) {
  return new Promise(resolve => {
    _aiPendingApproval = resolve;
    _aiAppend('approval', `<div style="font-weight:700;margin-bottom:6px">✋ Approve this change?</div><div>${_aiEsc(text)}</div>
      <div style="display:flex;gap:8px;margin-top:8px"><button class="btn-primary" style="font-size:12px;padding:6px 14px" onclick="_aiResolveApproval(true,this)">✅ Approve</button>
      <button class="btn-secondary" style="font-size:12px;padding:6px 14px" onclick="_aiResolveApproval(false,this)">✕ Reject</button></div>`);
  });
}
function _aiResolveApproval(ok, btn) {
  if (!_aiPendingApproval) return;
  const r = _aiPendingApproval; _aiPendingApproval = null;
  const card = btn.closest('.ai-msg');
  if (card) card.querySelector('div:last-child').outerHTML = `<div style="margin-top:6px;font-weight:700;color:${ok ? '#15803D' : '#B91C1C'}">${ok ? '✅ Approved' : '✕ Rejected'}</div>`;
  r(ok);
}

// ── The agent loop ──
async function aiSend() {
  const input = document.getElementById('ai-input');
  const text = (input?.value || '').trim();
  if (!text || _aiBusy) return;
  if (!_aiKey()) { aiShowSettings(true); return; }
  input.value = '';
  _aiAppend('user', _aiEsc(text));
  _aiMessages.push({ role: 'user', content: text });
  _aiBusy = true; _aiSetStatus('Thinking…');

  try {
    const client = await _aiGetClient();
    for (let step = 0; step < AI_MAX_STEPS; step++) {
      const response = await client.beta.messages.create({
        model: _aiModel(),
        max_tokens: 16000,
        system: AI_SYSTEM,
        tools: _aiApiTools,
        messages: _aiMessages,
        output_config: { effort: 'medium' },
        cache_control: { type: 'ephemeral' },
        // If a safety classifier declines, the server retries on a suitable model
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
      // Thinking and tool_use blocks go back exactly as received
      _aiMessages.push({ role: 'assistant', content: response.content });
      const said = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      if (said) _aiAppend('assistant', _aiFormat(said));

      if (response.stop_reason === 'refusal') { _aiAppend('note', 'The assistant declined this request.'); break; }
      if (response.stop_reason === 'pause_turn') continue;
      if (response.stop_reason === 'max_tokens') { _aiAppend('note', 'The reply was cut off — ask it to continue.'); break; }
      const calls = response.content.filter(b => b.type === 'tool_use');
      if (response.stop_reason !== 'tool_use' || !calls.length) break;

      const results = [];
      for (const call of calls) {
        let content, isError = false;
        try {
          if (_aiWriteTools.has(call.name)) {
            _aiSetStatus('Waiting for your approval…');
            const ok = await _aiAskApproval((_aiDescribe[call.name] || (() => call.name))(call.input));
            _aiSetStatus('Working…');
            if (!ok) { results.push({ type: 'tool_result', tool_use_id: call.id, content: 'The owner rejected this change. Do not retry it; ask what they want instead.' }); continue; }
          } else {
            _aiAppend('tool', `🔎 ${_aiEsc(call.name.replace(/_/g, ' '))}${call.input && Object.keys(call.input).length ? ' · ' + _aiEsc(Object.values(call.input).join(' · ')) : ''}`);
          }
          content = String(_aiRunTool(call.name, call.input) || 'Done.');
          if (_aiWriteTools.has(call.name)) _aiAppend('tool', '✔ ' + _aiEsc(content));
        } catch (e) {
          isError = true; content = e.message || String(e);
          _aiAppend('tool', '⚠ ' + _aiEsc(content));
        }
        results.push({ type: 'tool_result', tool_use_id: call.id, content, ...(isError ? { is_error: true } : {}) });
      }
      // All results for this turn go back together in one user message
      _aiMessages.push({ role: 'user', content: results });
      _aiSetStatus('Thinking…');
    }
  } catch (e) {
    const S = _aiSdk || {};
    const msg = S.AuthenticationError && e instanceof S.AuthenticationError ? 'The API key was rejected — check it in ⚙️ Settings.'
      : S.RateLimitError && e instanceof S.RateLimitError ? 'Too many requests right now — wait a minute and try again.'
      : S.APIConnectionError && e instanceof S.APIConnectionError ? 'Could not reach the assistant — check the internet connection.'
      : S.APIError && e instanceof S.APIError ? `The assistant returned an error (${e.status || ''}): ${e.message}`
      : `Could not start the assistant: ${e.message || e}`;
    _aiAppend('note', _aiEsc(msg));
    // Drop the unanswered user turn so the conversation stays valid
    const last = _aiMessages[_aiMessages.length - 1];
    if (last && last.role === 'user' && typeof last.content === 'string') _aiMessages.pop();
  } finally {
    _aiBusy = false; _aiSetStatus('');
    if (typeof runHealthCheck === 'function') runHealthCheck();
  }
}

// ── UI ──
const _aiEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function _aiFormat(t) {
  return _aiEsc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^\s*[-•]\s+/gm, '• ').replace(/\n/g, '<br>');
}

function _aiAppend(kind, html) {
  const log = document.getElementById('ai-log');
  if (!log) return;
  const style = {
    user: 'align-self:flex-end;background:var(--navy,#0D1B4A);color:#fff',
    assistant: 'align-self:flex-start;background:var(--bg,#F1F5F9)',
    tool: 'align-self:flex-start;background:transparent;color:var(--muted);font-size:11px;padding:2px 4px',
    approval: 'align-self:stretch;background:#FFFBEB;border:1px solid #F59E0B',
    note: 'align-self:stretch;background:#FEF2F2;color:#991B1B;font-size:12px',
  }[kind];
  const d = document.createElement('div');
  d.className = 'ai-msg';
  d.style.cssText = `max-width:92%;padding:8px 11px;border-radius:10px;font-size:13px;line-height:1.45;${style}`;
  d.innerHTML = html;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}

function _aiSetStatus(t) {
  const el = document.getElementById('ai-status');
  if (el) el.textContent = t;
  const b = document.getElementById('ai-send');
  if (b) b.disabled = !!t && t !== '';
}

function aiShowSettings(show) {
  const el = document.getElementById('ai-settings');
  if (!el) return;
  el.style.display = show ? 'block' : 'none';
  if (show) {
    document.getElementById('ai-key').value = _aiKey();
    document.getElementById('ai-model').value = _aiModel();
  }
}

function aiSaveSettings() {
  const key = document.getElementById('ai-key').value.trim();
  try {
    if (key) localStorage.setItem(LS_AI_KEY, key); else localStorage.removeItem(LS_AI_KEY);
    localStorage.setItem(LS_AI_MODEL, document.getElementById('ai-model').value);
  } catch (e) {}
  aiShowSettings(false);
}

function aiNewChat() {
  if (_aiBusy) return;
  _aiMessages = [];
  const log = document.getElementById('ai-log');
  if (log) log.innerHTML = '';
  _aiWelcome();
}

function _aiWelcome() {
  _aiAppend('assistant', `Hi! I can look into orders, challans and invoices and fix problems — I'll ask before changing anything.<br><br>Try:
    <div style="display:flex;flex-direction:column;gap:5px;margin-top:6px">
      ${['Go through the data checks and fix what you can', 'Why is MIORD113 showing more dispatched than ordered?', 'Which orders are billed more than dispatched?'].map(s =>
        `<button class="btn-secondary" style="font-size:12px;padding:5px 9px;text-align:left" onclick="document.getElementById('ai-input').value=this.textContent;aiSend()">${s}</button>`).join('')}
    </div>`);
}

function openAiAgent() {
  let p = document.getElementById('ai-panel');
  if (!p) {
    p = document.createElement('div');
    p.id = 'ai-panel';
    p.style.cssText = 'position:fixed;top:0;right:0;bottom:0;width:min(440px,100vw);background:var(--white,#fff);box-shadow:-12px 0 40px rgba(13,27,74,0.18);z-index:1150;display:flex;flex-direction:column';
    p.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--border)">
        <div style="font-weight:800;font-size:15px;color:var(--navy);flex:1">🤖 Assistant</div>
        <button class="btn-secondary" style="font-size:11px;padding:4px 9px" onclick="aiNewChat()" title="Start a new conversation">New chat</button>
        <button class="btn-secondary" style="font-size:11px;padding:4px 9px" onclick="aiShowSettings(document.getElementById('ai-settings').style.display==='none')" title="API key and model">⚙️</button>
        <button class="btn-secondary" style="font-size:11px;padding:4px 9px" onclick="closeAiAgent()">✕</button>
      </div>
      <div id="ai-settings" style="display:none;padding:12px 16px;border-bottom:1px solid var(--border);background:var(--bg,#F8FAFC);font-size:12px">
        <label class="form-label" style="font-size:11px">Anthropic API key</label>
        <input id="ai-key" class="form-input" type="password" placeholder="sk-ant-..." autocomplete="off" style="width:100%">
        <div style="color:var(--muted);margin:4px 0 8px">Get one at console.anthropic.com → API Keys. It is saved only in this browser on this computer. Set a monthly spend limit in the Console.</div>
        <label class="form-label" style="font-size:11px">Model</label>
        <select id="ai-model" class="form-select" style="width:100%">${AI_MODELS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        <button class="btn-primary" style="margin-top:10px;width:100%" onclick="aiSaveSettings()">Save</button>
      </div>
      <div id="ai-log" style="flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:8px"></div>
      <div id="ai-status" style="font-size:11px;color:var(--muted);padding:0 16px;min-height:16px"></div>
      <div style="display:flex;gap:8px;padding:10px 16px 16px;border-top:1px solid var(--border)">
        <textarea id="ai-input" class="form-input" rows="2" placeholder="Ask about an order, or say what to fix…" style="flex:1;resize:none"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();aiSend()}"></textarea>
        <button id="ai-send" class="btn-primary" style="padding:0 16px" onclick="aiSend()">Send</button>
      </div>`;
    document.body.appendChild(p);
    _aiWelcome();
  }
  p.style.display = 'flex';
  if (!_aiKey()) aiShowSettings(true);
  document.getElementById('ai-input')?.focus();
}

function closeAiAgent() {
  const p = document.getElementById('ai-panel');
  if (p) p.style.display = 'none';
}

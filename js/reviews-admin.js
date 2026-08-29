// ══════════════════════════════════════════════════════════════
// REVIEWS-ADMIN.JS — "Customer Reviews" page (owner-facing, inside index.html)
// Shows the printable QR code for review.html and reads back everything
// customers have submitted from the "Reviews" tab (Orders spreadsheet,
// written by Code.gs's saveReview — see js/review.js for the customer side).
// ══════════════════════════════════════════════════════════════

let _reviewsLoaded = [];
let _reviewsQrRendered = false;

function reviewPageUrl() {
  return new URL('review.html', window.location.href).href;
}

function renderReviewQR() {
  const box = document.getElementById('review-qr-box');
  if (!box || _reviewsQrRendered || typeof QRCode === 'undefined') return;
  const url = reviewPageUrl();
  document.getElementById('review-qr-url').textContent = url;
  new QRCode(box, { text: url, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M });
  _reviewsQrRendered = true;
}

function downloadReviewQR() {
  const box = document.getElementById('review-qr-box');
  const canvas = box && box.querySelector('canvas');
  if (!canvas) { alert('QR code is still loading — try again in a second.'); return; }
  const a = document.createElement('a');
  a.download = 'maniram-review-qr.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
}

async function _adminCopyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) { return false; }
}

function copyReviewLink() {
  _adminCopyText(reviewPageUrl()).then(ok => alert(ok ? 'Link copied!' : 'Could not copy — long-press the link above to copy it manually.'));
}

function _rvStars(n) {
  const i = Math.max(0, Math.min(5, parseInt(n) || 0));
  return '★★★★★'.slice(0, i) + '☆☆☆☆☆'.slice(0, 5 - i);
}

async function fetchReviews() {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${ORDERS_SHEET_ID}/values/${encodeURIComponent('Reviews!A2:G5000')}?key=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) { _reviewsLoaded = []; return; } // tab doesn't exist yet — no reviews submitted so far
    const data = await res.json();
    _reviewsLoaded = (data.values || []).map(r => ({
      ts: r[0] || '', rating: parseInt(r[1]) || 0, type: r[2] || '',
      comment: r[3] || '', feedback: r[4] || '', phone: r[5] || '', savedAt: r[6] || '',
    })).filter(r => r.rating > 0);
    // newest first
    _reviewsLoaded.sort((a, b) => (b.savedAt || b.ts).localeCompare(a.savedAt || a.ts));
  } catch (e) { _reviewsLoaded = []; }
}

function renderReviewsStats() {
  const total = _reviewsLoaded.length;
  const avg   = total ? (_reviewsLoaded.reduce((s, r) => s + r.rating, 0) / total) : 0;
  const pub   = _reviewsLoaded.filter(r => r.rating >= 4).length;
  const priv  = _reviewsLoaded.filter(r => r.rating <= 3).length;
  document.getElementById('rv-stat-total').textContent   = total || '0';
  document.getElementById('rv-stat-avg').textContent     = total ? avg.toFixed(1) + ' ★' : '—';
  document.getElementById('rv-stat-public').textContent  = pub;
  document.getElementById('rv-stat-private').textContent = priv;
}

function renderReviewsPrivateList() {
  const el = document.getElementById('reviews-private-list');
  const rows = _reviewsLoaded.filter(r => r.rating <= 3);
  if (!rows.length) { el.innerHTML = '<div class="empty-state">No low ratings — nothing needs follow-up right now.</div>'; return; }
  el.innerHTML = rows.map(r => `
    <div style="padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:4px">
        <span style="color:#F1C40F;letter-spacing:1px">${_rvStars(r.rating)}</span>
        <span style="font-size:11px;color:var(--muted)">${escStr(r.savedAt || r.ts)}</span>
      </div>
      <div style="font-size:13px;color:var(--navy);margin-bottom:4px">${escStr(r.feedback || '(no comment left)')}</div>
      ${r.phone ? `<div style="font-size:11.5px;color:var(--muted)">📞 ${escStr(r.phone)}</div>` : ''}
    </div>
  `).join('');
}

function renderReviewsAllList() {
  const el = document.getElementById('reviews-all-list');
  if (!_reviewsLoaded.length) { el.innerHTML = '<div class="empty-state">No ratings yet — share your QR code to start collecting them.</div>'; return; }
  el.innerHTML = _reviewsLoaded.slice(0, 100).map(r => `
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:9px 0;border-bottom:1px solid var(--border);font-size:12.5px">
      <span style="color:#F1C40F;letter-spacing:1px">${_rvStars(r.rating)}</span>
      <span style="color:var(--muted)">${r.type === 'Public' ? '🌐 Public' : '🔒 Private'}</span>
      <span style="color:var(--muted)">${escStr(r.savedAt || r.ts)}</span>
    </div>
  `).join('');
}

async function loadReviewsAdmin() {
  renderReviewQR();
  document.getElementById('reviews-private-list').innerHTML = '<div class="empty-state">Loading...</div>';
  document.getElementById('reviews-all-list').innerHTML = '<div class="empty-state">Loading...</div>';
  await fetchReviews();
  renderReviewsStats();
  renderReviewsPrivateList();
  renderReviewsAllList();
}

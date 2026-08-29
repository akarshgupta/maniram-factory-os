// ══════════════════════════════════════════════════════════════
// REVIEW.JS — Customer review funnel (review.html, reached via QR code)
// 4-5 stars  → pick/edit a comment, copy it, open Google to post it.
// 1-3 stars  → private feedback only, sent to the owner, never public.
// Writes go to the "Reviews" tab (Orders spreadsheet) via Code.gs's
// saveReview action — same fire-and-forget mirrorToSheet() pattern as
// the rest of the app. No login here; this page is public.
// ══════════════════════════════════════════════════════════════

// Edit these anytime — no code changes needed elsewhere. 5 options for a
// 5-star rating, 4 for a 4-star rating (matches the shorter, less effusive
// tone a 4-star customer tends to actually write).
const REVIEW_TEMPLATES_5 = [
  "Excellent experience with Maniram Industries! The owner is very supportive and personally handles every order. Got clear updates at each step and my boxes were delivered exactly on time. Highly recommend.",
  "Great quality corrugated boxes and on-time delivery every time. The owner is hands-on, easy to reach, and keeps you updated on your order status. Very trustworthy business.",
  "Very professional and reliable box manufacturer. Owner is supportive and quick to respond to any query. Order was handled well from start to finish, delivered right on schedule.",
  "One of the best packaging suppliers I've worked with in Jhansi. Timely delivery, consistent quality, and the owner makes sure everything is updated and on track.",
  "Smooth experience end to end — regular updates on my order, on-time dispatch, and great support from the owner. Will definitely order again.",
];

const REVIEW_TEMPLATES_4 = [
  "Satisfied with the service. Good quality boxes and on-time delivery.",
  "Good experience overall — timely delivery and decent quality. Would order again.",
  "Reliable box supplier, responsive team, and delivery was on time.",
  "Quality boxes at a fair price, delivered on time. Happy with the order.",
];

let rvRating = 0;
let rvSelectedTplIndex = -1;

function rvSelectStar(n) {
  rvRating = n;
  document.querySelectorAll('.rv-star').forEach(btn => {
    btn.classList.toggle('on', parseInt(btn.dataset.n) <= n);
  });
  const labels = { 1: 'Poor', 2: 'Below average', 3: 'Okay', 4: 'Good', 5: 'Excellent' };
  document.getElementById('rv-rating-label').textContent = labels[n] || '';

  // Small delay so the customer sees their star tap register before the card switches.
  setTimeout(() => {
    if (n >= 4) rvShowPublicStep(n); else rvShowPrivateStep();
  }, 220);
}

function rvShowPublicStep(n) {
  document.getElementById('rv-step-rate').classList.add('rv-hidden');
  document.getElementById('rv-step-private').classList.add('rv-hidden');
  document.getElementById('rv-step-thanks').classList.add('rv-hidden');
  document.getElementById('rv-step-public').classList.remove('rv-hidden');
  rvSelectedTplIndex = -1;
  document.getElementById('rv-comment').value = '';
  rvRenderTemplates(n);
  rvUpdatePostBtn();
}

function rvShowPrivateStep() {
  document.getElementById('rv-step-rate').classList.add('rv-hidden');
  document.getElementById('rv-step-public').classList.add('rv-hidden');
  document.getElementById('rv-step-thanks').classList.add('rv-hidden');
  document.getElementById('rv-step-private').classList.remove('rv-hidden');
  document.getElementById('rv-feedback').value = '';
  document.getElementById('rv-phone').value = '';
  rvUpdateFeedbackBtn();
}

function rvRenderTemplates(n) {
  const list = n === 5 ? REVIEW_TEMPLATES_5 : REVIEW_TEMPLATES_4;
  const wrap = document.getElementById('rv-tpl-list');
  wrap.innerHTML = list.map((t, i) =>
    `<div class="rv-tpl-card" id="rv-tpl-${i}" onclick="rvPickTemplate(${i}, ${n})">${t}</div>`
  ).join('');
}

function rvPickTemplate(i, n) {
  const list = n === 5 ? REVIEW_TEMPLATES_5 : REVIEW_TEMPLATES_4;
  rvSelectedTplIndex = i;
  document.querySelectorAll('.rv-tpl-card').forEach(c => c.classList.remove('sel'));
  const card = document.getElementById('rv-tpl-' + i);
  if (card) card.classList.add('sel');
  document.getElementById('rv-comment').value = list[i];
  rvUpdatePostBtn();
}

function rvUpdatePostBtn() {
  const btn = document.getElementById('rv-post-btn');
  const has = document.getElementById('rv-comment').value.trim().length > 0;
  btn.disabled = !has;
}

function rvUpdateFeedbackBtn() {
  const btn = document.getElementById('rv-feedback-btn');
  const has = document.getElementById('rv-feedback').value.trim().length > 0;
  btn.disabled = !has;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('rv-comment').addEventListener('input', rvUpdatePostBtn);
  document.getElementById('rv-feedback').addEventListener('input', rvUpdateFeedbackBtn);
});

// ── Clipboard (with fallback for browsers/contexts without the async API) ──
async function rvCopyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* fall through to legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) { return false; }
}

async function rvPostToGoogle() {
  const comment = document.getElementById('rv-comment').value.trim();
  if (!comment) return;

  await rvCopyText(comment);
  window.open(GOOGLE_REVIEW_URL, '_blank');

  rvLog({
    rating: rvRating,
    comment: comment,
    templateIndex: rvSelectedTplIndex,
  });

  rvShowThanks(
    '🙏',
    'Thank you!',
    "We've copied your review and opened Google in a new tab — just paste it in, pick your star rating there too, and tap Post. It means a lot to our small business."
  );
}

function rvSubmitFeedback() {
  const feedback = document.getElementById('rv-feedback').value.trim();
  if (!feedback) return;
  const phone = document.getElementById('rv-phone').value.trim();

  rvLog({
    rating: rvRating,
    feedback: feedback,
    phone: phone,
  });

  rvShowThanks(
    '🤝',
    'Thanks for letting us know',
    "We take this seriously — the owner will personally look into it" + (phone ? " and call you back." : ".")
  );
}

function rvLog(payload) {
  mirrorToSheet('saveReview', Object.assign({ ts: new Date().toISOString() }, payload));
}

function rvShowThanks(icon, title, body) {
  document.querySelectorAll('#rv-step-rate, #rv-step-public, #rv-step-private').forEach(el => el.classList.add('rv-hidden'));
  document.getElementById('rv-thanks-icon').textContent = icon;
  document.getElementById('rv-thanks-title').textContent = title;
  document.getElementById('rv-thanks-body').textContent = body;
  document.getElementById('rv-step-thanks').classList.remove('rv-hidden');
}

function rvReset() {
  rvRating = 0;
  rvSelectedTplIndex = -1;
  document.querySelectorAll('.rv-star').forEach(btn => btn.classList.remove('on'));
  document.getElementById('rv-rating-label').textContent = ' ';
  document.getElementById('rv-step-public').classList.add('rv-hidden');
  document.getElementById('rv-step-private').classList.add('rv-hidden');
  document.getElementById('rv-step-thanks').classList.add('rv-hidden');
  document.getElementById('rv-step-rate').classList.remove('rv-hidden');
}

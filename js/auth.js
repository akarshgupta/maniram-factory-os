// ══════════════════════════════════════════════════════════════
// AUTH.JS — Admin login, session, password management
// ══════════════════════════════════════════════════════════════

const AUTH_HASH_KEY    = 'mi_auth_hash_v1';
const AUTH_SESSION_KEY = 'mi_auth_session_v1';
const SESSION_TTL_MS   = 24 * 60 * 60 * 1000; // 24 hours

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getSession() {
  try { return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || '{}'); } catch { return {}; }
}

function isLoggedIn() {
  const s = getSession();
  return s.ok === true && s.expires && Date.now() < s.expires;
}

function setSession() {
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ ok: true, expires: Date.now() + SESSION_TTL_MS }));
}

function clearSession() {
  localStorage.removeItem(AUTH_SESSION_KEY);
}

// ── Password helpers ──
function hasPassword() {
  return !!localStorage.getItem(AUTH_HASH_KEY);
}

// ── UI helpers ──
function authShowMode(mode) {
  // mode: 'setup' | 'login' | 'change'
  const overlay = document.getElementById('auth-overlay');
  overlay.style.display = 'flex';

  document.getElementById('auth-setup-panel').style.display  = mode === 'setup'  ? 'block' : 'none';
  document.getElementById('auth-login-panel').style.display  = mode === 'login'  ? 'block' : 'none';
  document.getElementById('auth-change-panel').style.display = mode === 'change' ? 'block' : 'none';

  const focus = {
    setup:  'auth-new-pw',
    login:  'auth-pw',
    change: 'auth-cur-pw',
  };
  setTimeout(() => document.getElementById(focus[mode])?.focus(), 80);
}

function authHide() {
  document.getElementById('auth-overlay').style.display = 'none';
}

function authShowError(panelId, msg) {
  const el = document.getElementById(panelId);
  if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
}

// ── Check on page load ──
async function checkAuth() {
  if (isLoggedIn()) {
    authHide();
    return;
  }
  authShowMode(hasPassword() ? 'login' : 'setup');
}

// ── Login ──
async function authLogin() {
  const pw = document.getElementById('auth-pw').value;
  authShowError('auth-login-err', '');
  if (!pw) { authShowError('auth-login-err', 'Password daalo.'); return; }

  const hash    = await sha256(pw);
  const stored  = localStorage.getItem(AUTH_HASH_KEY);

  if (hash === stored) {
    setSession();
    authHide();
  } else {
    authShowError('auth-login-err', 'Galat password. Dobara try karo.');
    document.getElementById('auth-pw').value = '';
    document.getElementById('auth-pw').focus();
  }
}

// ── First-time setup ──
async function authSetup() {
  const pw1 = document.getElementById('auth-new-pw').value;
  const pw2 = document.getElementById('auth-new-pw2').value;
  authShowError('auth-setup-err', '');

  if (pw1.length < 4) { authShowError('auth-setup-err', 'Password kam se kam 4 characters ka hona chahiye.'); return; }
  if (pw1 !== pw2)    { authShowError('auth-setup-err', 'Dono passwords match nahi kar rahe.'); return; }

  localStorage.setItem(AUTH_HASH_KEY, await sha256(pw1));
  setSession();
  authHide();
}

// ── Change password ──
async function authChangePassword() {
  const cur  = document.getElementById('auth-cur-pw').value;
  const pw1  = document.getElementById('auth-ch-pw1').value;
  const pw2  = document.getElementById('auth-ch-pw2').value;
  authShowError('auth-change-err', '');

  const curHash    = await sha256(cur);
  const storedHash = localStorage.getItem(AUTH_HASH_KEY);

  if (curHash !== storedHash) { authShowError('auth-change-err', 'Purana password galat hai.'); return; }
  if (pw1.length < 4)         { authShowError('auth-change-err', 'Naya password kam se kam 4 characters ka hona chahiye.'); return; }
  if (pw1 !== pw2)            { authShowError('auth-change-err', 'Naye passwords match nahi kar rahe.'); return; }

  localStorage.setItem(AUTH_HASH_KEY, await sha256(pw1));
  document.getElementById('auth-cur-pw').value = '';
  document.getElementById('auth-ch-pw1').value = '';
  document.getElementById('auth-ch-pw2').value = '';
  closeChangePassword();
  alert('Password badal gaya! ✅');
}

function openChangePassword() {
  authShowError('auth-change-err', '');
  authShowMode('change');
}

function closeChangePassword() {
  authHide();
}

// ── Logout ──
function logout() {
  if (!confirm('Logout karna chahte ho?')) return;
  clearSession();
  document.getElementById('auth-pw').value = '';
  authShowMode('login');
}

// ══════════════════════════════════════════════════════════════
// AUTH.JS — Admin login, session, password management
// ══════════════════════════════════════════════════════════════

const AUTH_HASH_KEY    = 'mi_auth_hash_v1';
const AUTH_SESSION_KEY = 'mi_auth_session_v1';
const SESSION_TTL_MS   = 24 * 60 * 60 * 1000; // 24 hours

// Works on both HTTPS (crypto.subtle) and plain HTTP/file:// (fallback)
async function authHash(str) {
  if (window.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return 'sha:' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }
  // Fallback: djb2 hash — not cryptographic but works on HTTP/file://
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return 'djb:' + (h >>> 0).toString(16).padStart(8, '0');
}

// ── Session ──
function getSession()  { try { return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || '{}'); } catch { return {}; } }
function isLoggedIn()  { const s = getSession(); return s.ok === true && s.expires && Date.now() < s.expires; }
function setSession()  { localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ ok: true, expires: Date.now() + SESSION_TTL_MS })); }
function clearSession(){ localStorage.removeItem(AUTH_SESSION_KEY); }
function hasPassword() { return !!localStorage.getItem(AUTH_HASH_KEY); }

// ── UI ──
function authShowMode(mode) {
  document.getElementById('auth-overlay').style.display = 'flex';
  document.getElementById('auth-setup-panel').style.display  = mode === 'setup'  ? 'block' : 'none';
  document.getElementById('auth-login-panel').style.display  = mode === 'login'  ? 'block' : 'none';
  document.getElementById('auth-change-panel').style.display = mode === 'change' ? 'block' : 'none';
  const ids = { setup: 'auth-new-pw', login: 'auth-pw', change: 'auth-cur-pw' };
  setTimeout(() => document.getElementById(ids[mode])?.focus(), 80);
}

function authHide() { document.getElementById('auth-overlay').style.display = 'none'; }

function authShowError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
}

// ── Check on load ──
async function checkAuth() {
  if (isLoggedIn()) { authHide(); return; }
  authShowMode(hasPassword() ? 'login' : 'setup');
}

// ── Login ──
async function authLogin() {
  const pw = document.getElementById('auth-pw').value;
  authShowError('auth-login-err', '');
  if (!pw) { authShowError('auth-login-err', 'Password daalo.'); return; }
  try {
    const hash = await authHash(pw);
    if (hash === localStorage.getItem(AUTH_HASH_KEY)) {
      setSession(); authHide();
    } else {
      authShowError('auth-login-err', 'Galat password. Dobara try karo.');
      document.getElementById('auth-pw').value = '';
      document.getElementById('auth-pw').focus();
    }
  } catch(e) {
    authShowError('auth-login-err', 'Error: ' + e.message);
  }
}

// ── First-time setup ──
async function authSetup() {
  const pw1 = document.getElementById('auth-new-pw').value;
  const pw2 = document.getElementById('auth-new-pw2').value;
  authShowError('auth-setup-err', '');
  if (pw1.length < 4) { authShowError('auth-setup-err', 'Password kam se kam 4 characters ka hona chahiye.'); return; }
  if (pw1 !== pw2)    { authShowError('auth-setup-err', 'Dono passwords match nahi kar rahe.'); return; }
  try {
    localStorage.setItem(AUTH_HASH_KEY, await authHash(pw1));
    setSession();
    authHide();
  } catch(e) {
    authShowError('auth-setup-err', 'Save nahi hua: ' + e.message);
  }
}

// ── Change password ──
async function authChangePassword() {
  const cur = document.getElementById('auth-cur-pw').value;
  const pw1 = document.getElementById('auth-ch-pw1').value;
  const pw2 = document.getElementById('auth-ch-pw2').value;
  authShowError('auth-change-err', '');
  try {
    if (await authHash(cur) !== localStorage.getItem(AUTH_HASH_KEY)) {
      authShowError('auth-change-err', 'Purana password galat hai.'); return;
    }
    if (pw1.length < 4) { authShowError('auth-change-err', 'Naya password kam se kam 4 characters ka hona chahiye.'); return; }
    if (pw1 !== pw2)    { authShowError('auth-change-err', 'Naye passwords match nahi kar rahe.'); return; }
    localStorage.setItem(AUTH_HASH_KEY, await authHash(pw1));
    ['auth-cur-pw','auth-ch-pw1','auth-ch-pw2'].forEach(id => document.getElementById(id).value = '');
    closeChangePassword();
    alert('Password badal gaya! ✅');
  } catch(e) {
    authShowError('auth-change-err', 'Error: ' + e.message);
  }
}

function openChangePassword()  { authShowError('auth-change-err', ''); authShowMode('change'); }
function closeChangePassword() { authHide(); }

// ── Logout ──
function logout() {
  if (!confirm('Logout karna chahte ho?')) return;
  clearSession();
  document.getElementById('auth-pw').value = '';
  authShowMode('login');
}

// Run as soon as DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkAuth);
} else {
  checkAuth();
}

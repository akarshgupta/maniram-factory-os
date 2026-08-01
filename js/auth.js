// ══════════════════════════════════════════════════════════════
// AUTH.JS — Admin login · Must be first script loaded
// Single fixed user. Credentials are checked against AUTH_CRED_HASH
// (salted hash of "username::password") — no setup / self-service
// password creation, no recovery code.
//
// To change the username or password: open the browser console on
// the app and run  authHash('newusername::newpassword')  — paste the
// output into AUTH_CRED_HASH below, commit and deploy.
// ══════════════════════════════════════════════════════════════

const AUTH_SESSION_KEY = 'mi_auth_session_v1';
const SESSION_TTL_MS   = 24 * 60 * 60 * 1000; // 24 hours

// authHash('maniram::' + password) — username is case-insensitive
const AUTH_CRED_HASH = 'v2:0dc8d2d4bbb87f5e';

// ── Synchronous hash — works on HTTP, HTTPS, file://, everywhere ──
function authHash(str) {
  const input = 'MI_FACTORY_SALT_' + str + '_2024';
  let a = 0x811c9dc5, b = 0xdeadbeef;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    a = (Math.imul(a ^ c, 0x01000193) >>> 0);
    b = (Math.imul(b ^ c, 0x85ebca6b) >>> 0);
  }
  return 'v2:' + a.toString(16).padStart(8,'0') + b.toString(16).padStart(8,'0');
}

// ── Safe localStorage wrappers ──
function authSave(key, val) {
  try { localStorage.setItem(key, val); return true; }
  catch(e) { console.error('Auth save failed:', e); return false; }
}
function authRead(key) {
  try { return localStorage.getItem(key); } catch(e) { return null; }
}
function authRemove(key) {
  try { localStorage.removeItem(key); } catch(e) {}
}

// ── Session ──
function isLoggedIn() {
  try {
    const s = JSON.parse(authRead(AUTH_SESSION_KEY) || '{}');
    return s.ok === true && typeof s.expires === 'number' && Date.now() < s.expires;
  } catch(e) { return false; }
}
function setSession()   { authSave(AUTH_SESSION_KEY, JSON.stringify({ ok: true, expires: Date.now() + SESSION_TTL_MS })); }
function clearSession() { authRemove(AUTH_SESSION_KEY); }

// ── App shell — hidden until auth passes ──
function showApp()  {
  const shell = document.getElementById('app-shell');
  if (shell) shell.style.display = '';
}
function hideApp()  {
  const shell = document.getElementById('app-shell');
  if (shell) shell.style.display = 'none';
}

// ── Auth overlay ──
function authShowLogin() {
  const overlay = document.getElementById('auth-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  const panel = document.getElementById('auth-login-panel');
  if (panel) panel.style.display = 'block';
  setTimeout(() => { const el = document.getElementById('auth-user'); if (el) el.focus(); }, 80);
}

function authHideOverlay() {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.style.display = 'none';
}

function authErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

// ── Check on load — runs synchronously ──
function checkAuth() {
  hideApp();
  authRemove('mi_auth_hash_v1'); // legacy self-set password — no longer honoured
  if (isLoggedIn()) {
    authHideOverlay();
    showApp();
    return;
  }
  authShowLogin();
}

// ── Login ──
function authLogin() {
  const user = (document.getElementById('auth-user')?.value || '').trim().toLowerCase();
  const pw   = (document.getElementById('auth-pw')?.value   || '').trim();
  authErr('auth-login-err', '');
  if (!user || !pw) { authErr('auth-login-err', 'Enter username and password.'); return; }

  if (authHash(user + '::' + pw) === AUTH_CRED_HASH) {
    setSession();
    authHideOverlay();
    showApp();
  } else {
    authErr('auth-login-err', 'Wrong username or password.');
    document.getElementById('auth-pw').value = '';
    document.getElementById('auth-pw').focus();
  }
}

// ── Logout ──
function logout() {
  if (!confirm('Are you sure you want to logout?')) return;
  clearSession();
  hideApp();
  const u = document.getElementById('auth-user'); if (u) u.value = '';
  const p = document.getElementById('auth-pw');   if (p) p.value = '';
  authShowLogin();
}

// ── Auto-run ──
(function () {
  function run() {
    try { checkAuth(); }
    catch(e) {
      // If something errors, still show the auth screen — never silently allow access
      console.error('Auth error:', e);
      const overlay = document.getElementById('auth-overlay');
      if (overlay) { overlay.style.display = 'flex'; }
      authShowLogin();
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();

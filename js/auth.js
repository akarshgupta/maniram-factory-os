// ══════════════════════════════════════════════════════════════
// AUTH.JS — Admin login · Must be first script loaded
// ══════════════════════════════════════════════════════════════

const AUTH_HASH_KEY    = 'mi_auth_hash_v1';
const AUTH_SESSION_KEY = 'mi_auth_session_v1';
const SESSION_TTL_MS   = 24 * 60 * 60 * 1000; // 24 hours

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
function hasPassword()  { return !!authRead(AUTH_HASH_KEY); }

// ── App shell — hidden until auth passes ──
function showApp()  {
  const shell = document.getElementById('app-shell');
  if (shell) shell.style.display = '';
}
function hideApp()  {
  const shell = document.getElementById('app-shell');
  if (shell) shell.style.display = 'none';
}

// ── Auth overlay panels ──
function authShowMode(mode) {
  const overlay = document.getElementById('auth-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  ['setup','login','change','recovery'].forEach(m => {
    const el = document.getElementById('auth-' + m + '-panel');
    if (el) el.style.display = m === mode ? 'block' : 'none';
  });
  const focusIds = { setup:'auth-new-pw', login:'auth-pw', change:'auth-cur-pw', recovery:'auth-recovery-code' };
  setTimeout(() => { const el = document.getElementById(focusIds[mode]); if (el) el.focus(); }, 80);
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
  if (isLoggedIn()) {
    authHideOverlay();
    showApp();
    return;
  }
  authShowMode(hasPassword() ? 'login' : 'setup');
}

// ── Login ──
function authLogin() {
  const pw = (document.getElementById('auth-pw')?.value || '').trim();
  authErr('auth-login-err', '');
  if (!pw) { authErr('auth-login-err', 'Please enter your password.'); return; }

  const stored = authRead(AUTH_HASH_KEY);
  if (!stored) { authShowMode('setup'); return; } // no password set yet

  if (authHash(pw) === stored) {
    setSession();
    authHideOverlay();
    showApp();
  } else {
    authErr('auth-login-err', 'Incorrect password. Please try again.');
    document.getElementById('auth-pw').value = '';
    document.getElementById('auth-pw').focus();
  }
}

// ── First-time setup ──
function authSetup() {
  const pw1 = (document.getElementById('auth-new-pw')?.value  || '').trim();
  const pw2 = (document.getElementById('auth-new-pw2')?.value || '').trim();
  authErr('auth-setup-err', '');

  if (pw1.length < 4) { authErr('auth-setup-err', 'Password must be at least 4 characters.'); return; }
  if (pw1 !== pw2)    { authErr('auth-setup-err', 'Passwords do not match.'); return; }

  const hash = authHash(pw1);
  if (!authSave(AUTH_HASH_KEY, hash)) {
    authErr('auth-setup-err', 'Browser blocked the save. Check if Private/Incognito mode is on.'); return;
  }
  setSession();
  authHideOverlay();
  showApp();
}

// ── Change password (from topbar) ──
function authChangePassword() {
  const cur = (document.getElementById('auth-cur-pw')?.value  || '').trim();
  const pw1 = (document.getElementById('auth-ch-pw1')?.value  || '').trim();
  const pw2 = (document.getElementById('auth-ch-pw2')?.value  || '').trim();
  authErr('auth-change-err', '');

  const stored = authRead(AUTH_HASH_KEY);
  if (authHash(cur) !== stored) { authErr('auth-change-err', 'Current password is incorrect.'); return; }
  if (pw1.length < 4)           { authErr('auth-change-err', 'New password must be at least 4 characters.'); return; }
  if (pw1 !== pw2)              { authErr('auth-change-err', 'New passwords do not match.'); return; }

  authSave(AUTH_HASH_KEY, authHash(pw1));
  ['auth-cur-pw','auth-ch-pw1','auth-ch-pw2'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  closeChangePassword();
  alert('Password changed successfully! ✅');
}

function openChangePassword()  {
  authErr('auth-change-err', '');
  ['auth-cur-pw','auth-ch-pw1','auth-ch-pw2'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  authShowMode('change');
}
function closeChangePassword() { authHideOverlay(); }

// ── Forgot password / Recovery ──
function openRecovery() {
  authErr('auth-recovery-err', '');
  const el = document.getElementById('auth-recovery-code'); if (el) el.value = '';
  authShowMode('recovery');
}

function authRecovery() {
  const code   = (document.getElementById('auth-recovery-code')?.value || '').trim();
  const newPw1 = (document.getElementById('auth-recovery-pw1')?.value  || '').trim();
  const newPw2 = (document.getElementById('auth-recovery-pw2')?.value  || '').trim();
  authErr('auth-recovery-err', '');

  // ADMIN_RESET_CODE is defined in config.js (loaded before this file's functions run)
  const resetCode = (typeof ADMIN_RESET_CODE !== 'undefined') ? ADMIN_RESET_CODE : '';
  if (!resetCode || code !== resetCode) { authErr('auth-recovery-err', 'Invalid reset code.'); return; }
  if (newPw1.length < 4) { authErr('auth-recovery-err', 'Password must be at least 4 characters.'); return; }
  if (newPw1 !== newPw2) { authErr('auth-recovery-err', 'Passwords do not match.'); return; }

  authSave(AUTH_HASH_KEY, authHash(newPw1));
  setSession();
  authHideOverlay();
  showApp();
  alert('Password reset successfully! ✅');
}

// ── Logout ──
function logout() {
  if (!confirm('Are you sure you want to logout?')) return;
  clearSession();
  hideApp();
  const el = document.getElementById('auth-pw'); if (el) el.value = '';
  authShowMode('login');
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
      authShowMode(hasPassword() ? 'login' : 'setup');
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();

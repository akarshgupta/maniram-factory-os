// ══════════════════════════════════════════════════════════════
// SW.JS — Maniram Factory OS service worker
// Static shell: cache-first with background refresh.
// Google APIs / Apps Script: network-only (live data must be live).
// ══════════════════════════════════════════════════════════════
const CACHE = 'mi-factory-os-v6';
const SHELL = [
  './', './index.html', './staff.html', './css/style.css', './manifest.json',
  './js/config.js', './js/auth.js', './js/app.js',
  './js/orders.js', './js/reels.js', './js/clients.js', './js/calendar.js',
  './js/quotations.js', './js/reminders.js', './js/dashboard.js',
  './js/purchase.js', './js/receivables.js', './js/invoices.js', './js/expenses.js',
  './js/production-plan.js', './js/analytics.js', './js/dispatch.js',
  './js/dispatch-pdf.js', './js/challan.js', './js/job-card.js',
  './js/whatsapp-import.js', './js/tally-sync.js', './js/prod-learning.js',
  './js/delivery-learning.js', './js/date-picker.js', './js/staff-app.js',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', e => {
  // Cache each shell file individually so one missing file can't abort the whole install
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;                       // writes: never intercept
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleusercontent.com')) return;   // live data: network only

  // Stale-while-revalidate for shell + fonts
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request).then(res => {
        if (res && res.status === 200 && (url.origin === location.origin || url.hostname.includes('fonts.g'))) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});

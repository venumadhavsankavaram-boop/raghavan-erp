/* Service worker — makes the ERP installable ("Add to Home Screen") and quick/forgiving on a weak connection.
   NOT an offline app: school fee/attendance data must always be live, so this deliberately
     - never touches /api/* requests (those always go to the network), and
     - keeps only the app's own files (the page, its scripts, icons).
   How it helps a slow connection:
     - Scripts carry a version stamp (?v=...). A stamped script can never change, so once saved on the phone it is
       used straight from the phone's memory — no waiting, no data used — until the app is updated.
     - The page itself ('/') is always asked for fresh, but if the network is slow (4 s) or down, the last saved
       copy is shown instead of a blank screen.
   Bump CACHE_NAME whenever this file's behaviour changes so old caches get cleared. */
const CACHE_NAME = 'school-erp-shell-v3';
const SHELL_URLS = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

const isVersionedModule = (url) => url.pathname.startsWith('/modules/') && url.pathname.endsWith('.js') && url.searchParams.has('v');

// Saves a versioned script and removes older versions of the same file, so the phone never piles up old copies.
async function saveModule(request, response) {
  const cache = await caches.open(CACHE_NAME);
  const url = new URL(request.url);
  const keys = await cache.keys();
  await Promise.all(keys.filter((k) => { const u = new URL(k.url); return u.pathname === url.pathname && u.search !== url.search; }).map((k) => cache.delete(k)));
  await cache.put(request, response);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // ERP data is always fetched live, never cached

  if (isVersionedModule(url)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((response) => {
        if (response.ok) saveModule(request, response.clone()).catch(() => {});
        return response;
      }))
    );
    return;
  }

  if (request.mode === 'navigate') {
    // Fresh page first; fall back to the saved page if the network is slow or down.
    event.respondWith(new Promise((resolve) => {
      let settled = false;
      const fallback = () => caches.match('/').then((cached) => { if (!settled && cached) { settled = true; resolve(cached); } });
      const timer = setTimeout(fallback, 4000);
      fetch(request).then((response) => {
        clearTimeout(timer);
        if (response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then((c) => c.put('/', copy)).catch(() => {}); }
        if (!settled) { settled = true; resolve(response); }
      }).catch(() => { clearTimeout(timer); fallback().then(() => { if (!settled) { settled = true; resolve(Response.error()); } }); });
    }));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {}); }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});

/* ===== Web Push ===== */
// Fee payment / fee due / marks / attendance alerts (Parent/Student logins)
// and deletion-request / discount-approval alerts (Admin/Principal logins)
// — see server.js's "Notifications: Web Push + WhatsApp" section for what
// sends these and index.html's maybeSubscribeToPush() for how a login opts
// in. The payload is always the small JSON object each notify* function
// builds: { title, body, tag, url } — this handler doesn't care which one
// sent it.
self.addEventListener('push', (event) => {
  let data = { title: 'Notification', body: '' };
  try { data = event.data ? event.data.json() : data; } catch (e) { /* non-JSON payload — keep the default */ }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Notification', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'erp-notification',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => 'focus' in c);
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});

// Service worker 影 AaKATSUKI 影 : l'appli s'ouvre même sans réseau.
// - Code du site (HTML, JS, CSS) : réseau d'abord, copie locale si hors ligne,
//   donc toujours la dernière version quand on est connecté.
// - Images, Three.js et polices : copie locale d'abord (fichiers qui ne changent pas).
// - État du clan (/api/state) : réseau d'abord, dernier état connu si hors ligne.
//   Effacé à la déconnexion. Les écritures (POST) ne passent jamais par le cache.
const VERSION = 'akt-v7';
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const DATA = `${VERSION}-data`;
const PRECACHE = [
  '/', '/index.html', '/css/app.css', '/manifest.webmanifest',
  '/js/main.js', '/js/api.js', '/js/pwa.js', '/js/core.js', '/js/ui.js', '/js/icons.js', '/js/scene3d.js', '/js/welcome3d.js', '/js/mvp3d.js',
  '/js/views/public.js', '/js/views/member.js', '/js/views/admin.js', '/js/views/welcome.js', '/js/views/challenges.js',
  '/assets/logo-solid.webp', '/assets/logo-256.webp', '/assets/logo-mask.webp', '/assets/icon-192.png', '/assets/badge-96.png',
];
const CDN = ['https://cdn.jsdelivr.net', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(VERSION)) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
  if (e.data === 'clear-data') e.waitUntil(caches.delete(DATA));
});

async function networkFirst(req, cacheName, fallbackKey, markOffline = false) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(fallbackKey || req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(fallbackKey || req, { ignoreSearch: true });
    if (!hit) throw new Error('hors ligne');
    if (!markOffline) return hit;
    const headers = new Headers(hit.headers); headers.set('X-Offline', '1');
    return new Response(hit.body, { status: 200, headers });
  }
}
async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname === '/api/state') {
      e.respondWith(networkFirst(req, DATA, '/api/state', true).catch(() => new Response(JSON.stringify({ error: 'Hors ligne et aucun état enregistré.' }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
      return;
    }
    if (url.pathname.startsWith('/api/')) return;
    if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/media/')) { e.respondWith(cacheFirst(req)); return; }
    if (req.mode === 'navigate') { e.respondWith(networkFirst(req, SHELL, '/index.html')); return; }
    e.respondWith(networkFirst(req, SHELL));
    return;
  }
  if (CDN.includes(url.origin)) e.respondWith(cacheFirst(req));
});

// ---------- Notifications push ----------
self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(m.title || '影 AaKATSUKI 影', {
    body: m.body || 'Nouvelle activité dans le clan.',
    icon: '/assets/icon-192.png',
    badge: '/assets/badge-96.png',
    tag: m.tag || undefined,
    renotify: !!m.tag,
    data: { url: m.url || '#/notifications' },
    lang: 'fr',
  }));
});

// Toucher la notification ouvre l'appli sur la bonne page
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const hash = String(e.notification.data?.url || '#/notifications');
  const target = new URL('/' + (hash.startsWith('#') ? hash : '#/notifications'), self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
    if (win) { await win.focus(); return win.navigate(target).catch(() => win.postMessage({ type: 'open', url: hash })); }
    return self.clients.openWindow(target);
  })());
});

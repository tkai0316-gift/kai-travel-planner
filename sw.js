const CACHE = 'kai-travel-v4';
const SHELL = ['/', '/index.html', '/css/style.css', '/js/app.js', '/js/utils.js', '/js/store.js', '/js/api.js', '/js/mapManager.js', '/js/uiRenderer.js', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Pass through: non-same-origin (Supabase, CDN, MapLibre tiles)
  if (url.origin !== self.location.origin) return;

  // Pass through: API calls
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).catch(() => new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  // Network-first: always fetch fresh when online, fall back to cache when offline
  e.respondWith(
    fetch(e.request).then(resp => {
      if (resp.ok) caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
      return resp;
    }).catch(() => caches.match(e.request))
  );
});

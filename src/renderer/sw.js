const CACHE_NAME = 'oila-uy-v1';

const isImmutableStatic = (url) => {
  const p = url.pathname;
  if (p.startsWith('/node_modules/')) return true;
  if (p.startsWith('/api/photo/')) return true;
  if (url.searchParams.has('v') && /\.(js|mjs|css|svg|png|jpg|webp)$/i.test(p)) return true;
  if (p === '/icon.svg' || p === '/manifest.json') return true;
  return false;
};

const isAppShell = (url) => {
  const p = url.pathname;
  return p === '/' || p === '/index.html';
};

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Jonli API va APK fayllari hech qachon keshlanmaydi
  if (
    url.pathname === '/api/state' ||
    url.pathname === '/api/events' ||
    url.pathname.startsWith('/api/action') ||
    url.pathname.startsWith('/api/pair') ||
    url.pathname.endsWith('.apk') ||
    url.pathname === '/sw.js'
  ) {
    return;
  }

  // 1. Katta kutubxonalar, rasm va versiyali JS/CSS: telefonda keshdan 0 ms da yuklanadi
  if (isImmutableStatic(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(req).then((hit) => {
          if (hit) return hit;
          return fetch(req).then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // 2. Asosiy HTML sahifa: tarmoqdan (3.5 s timeout), kuchsiz/uzilgan internetda darhol keshdan
  if (isAppShell(url) || req.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3500);
        return fetch(req, { signal: ctrl.signal })
          .then((res) => {
            clearTimeout(timer);
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => {
            clearTimeout(timer);
            return cache.match(req).then((hit) => hit || cache.match('/') || Response.error());
          });
      })
    );
  }
});

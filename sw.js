var CACHE = 'op-shop-v4';
var STATIC = ['./', './index.html', './assets/css/app.css', './assets/img/icon.svg'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(STATIC); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  // API: network only (always fresh data), fallback to empty array on offline
  if (e.request.url.includes('/api/')) {
    e.respondWith(
      fetch(e.request).catch(function () {
        return new Response('[]', {headers: {'Content-Type': 'application/json'}});
      })
    );
    return;
  }
  // Static assets: cache first, then network
  e.respondWith(
    caches.match(e.request).then(function (cached) { return cached || fetch(e.request); })
  );
});

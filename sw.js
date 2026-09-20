const CACHE_NAME = 'tccc-eval-web-v3-4-4-web-1-tta-cuf-order-1';
const VERSION = '3.4.4-web.1';
const SHELL = [
  './', './index.html',
  `./styles.css?v=${VERSION}`, `./version.js?v=${VERSION}`,
  `./tiers.js?v=${VERSION}`, `./branding.js?v=${VERSION}`, `./supabase-config.js?v=${VERSION}`, `./cloud-auth.js?v=${VERSION}`, `./cloud-sync.js?v=${VERSION}`, `./cloud-roster-sync.js?v=${VERSION}`, `./cloud-grading-sync.js?v=${VERSION}`, `./admin-ui.js?v=${VERSION}`, `./program-manager-dashboard.js?v=${VERSION}`, `./majcom-manager-dashboard.js?v=${VERSION}`, `./enterprise-dashboard.js?v=${VERSION}`,
  `./installations.js?v=${VERSION}`, `./app.js?v=${VERSION}`,
  './manifest.webmanifest', './assets/app-icon.png', './assets/icon-192.png',
  './assets/icon-512.png', './assets/splash-background.png'
];
self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE_NAME)
    .then(cache => cache.addAll(SHELL.map(path => new URL(path, self.registration.scope).href)))
    .then(() => self.skipWaiting())
));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const versionedShell = url.searchParams.get('v') === VERSION;
  if (request.mode === 'navigate' || versionedShell) {
    event.respondWith(fetch(request).then(response => {
      if (response?.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    }).catch(async () => (await caches.match(request)) || (request.mode === 'navigate' ? caches.match(new URL('./index.html', self.registration.scope).href) : undefined)));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response?.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  }).catch(() => cached)));
});

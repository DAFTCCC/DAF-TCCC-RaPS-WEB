const CACHE_NAME = 'tccc-eval-web-v3-4-8-web-1-r1';
const VERSION = '3.4.8-web.1';
const SHELL = [
  './', './index.html',
  `./styles.css?v=${VERSION}`, `./version.js?v=${VERSION}`,
  `./tiers.js?v=${VERSION}`, `./branding.js?v=${VERSION}`, `./supabase-config.js?v=${VERSION}`, `./cloud-auth.js?v=${VERSION}`, `./cloud-sync.js?v=${VERSION}`, `./cloud-roster-sync.js?v=${VERSION}`, `./cloud-grading-sync.js?v=${VERSION}`, `./admin-ui.js?v=3.4.8-web.1-r2`, `./program-manager-dashboard.js?v=${VERSION}`, `./majcom-manager-dashboard.js?v=${VERSION}`, `./enterprise-dashboard.js?v=${VERSION}`,
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

  // Never cache Supabase/API traffic. The staging frontend and API share
  // the same origin, so API GET responses must always go to the network.
  const apiPaths = [
    '/auth/v1/',
    '/rest/v1/',
    '/graphql/v1',
    '/realtime/v1/',
    '/storage/v1/',
    '/functions/v1/',
    '/mcp',
    '/sso/'
  ];

  if (apiPaths.some(path => url.pathname.startsWith(path))) {
    event.respondWith(fetch(request));
    return;
  }

  const versionedShell = url.searchParams.has('v');
  if (request.mode === 'navigate' || versionedShell) {
    event.respondWith(fetch(request).then(response => {
      if (response?.ok) {
        const cacheCopy = response.clone();
        caches.open(CACHE_NAME)
          .then(cache => cache.put(request, cacheCopy))
          .catch(() => {});
      }
      return response;
    }).catch(async () => (await caches.match(request)) || (request.mode === 'navigate' ? caches.match(new URL('./index.html', self.registration.scope).href) : undefined)));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response?.ok) {
      const cacheCopy = response.clone();
      caches.open(CACHE_NAME)
        .then(cache => cache.put(request, cacheCopy))
        .catch(() => {});
    }
    return response;
  }).catch(() => cached)));
});

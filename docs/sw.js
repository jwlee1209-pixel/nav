// gilnavi service worker: the app page is network-first (always fresh when online),
// icons and manifest are cache-first. Map tiles, search and routing requests are not touched.
const CACHE = 'gilnavi-v1.9';
const SHELL = ['./', './manifest.json', './icon-192.png', './icon-512.png', './cameras.json'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.indexOf('gilnavi-') === 0 && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || url.pathname.indexOf(scope.pathname) !== 0) return;
  const isPage = req.mode === 'navigate' || /\/$|\.html$/.test(url.pathname);
  if (isPage) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./', copy)); }
      return res;
    }).catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});

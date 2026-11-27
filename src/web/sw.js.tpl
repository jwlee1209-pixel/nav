// PPT editor service worker. The page is network-first (always the newest version when online,
// the saved copy when offline); icons and manifest are cache-first. Only files directly in this
// folder are handled; files the user opens never leave the browser and are never cached here.
const CACHE = 'pptedit-v__VER__';
const SHARE = 'pptshare';   // files received through the Android share sheet (Web Share Target), read once by the page
const SHELL = ['./', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.indexOf('pptedit-') === 0 && k !== CACHE && k !== SHARE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope);
  // Share target: Android "Share -> PPT editor" posts the file here (multipart/form-data).
  // Keep it in a cache for the page, then show the page with ?share=N (303 so a reload does not re-post).
  if (req.method === 'POST' && url.origin === scope.origin && url.pathname === scope.pathname + 'share') {
    e.respondWith((async () => {
      try {
        const fd = await req.formData();
        const files = fd.getAll('file').filter(f => f && typeof f !== 'string');
        const c = await caches.open(SHARE);
        await Promise.all((await c.keys()).map(k => c.delete(k)));
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          await c.put(new Request(scope.href + '__shared/' + i), new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream', 'x-name': encodeURIComponent(f.name || 'shared.pptx') } }));
        }
        return Response.redirect(scope.href + '?share=' + files.length, 303);
      } catch (err) {
        return Response.redirect(scope.href + '?share=error', 303);
      }
    })());
    return;
  }
  if (req.method !== 'GET') return;
  if (url.origin !== scope.origin || url.pathname.indexOf(scope.pathname) !== 0) return;
  const rest = url.pathname.slice(scope.pathname.length);
  if (rest.indexOf('/') >= 0) return;
  const isPage = rest === '' || rest === 'index.html';
  if (!isPage && req.mode === 'navigate') return;
  if (isPage) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./', copy)); }
      return res;
    }).catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});

// Cache only this app's public shell, static build assets and bounded public map tiles.
const DEVELOPMENT = new URL(self.location.href).searchParams.has('dev');
const PREFIX = 'sih-disaster-';
const SHELL = PREFIX + 'shell-v3';
const TILES = PREFIX + 'tiles-v3';
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    if (DEVELOPMENT) { await self.skipWaiting(); return; }
    const cache = await caches.open(SHELL);
    await cache.addAll(['/', '/index.html', '/manifest.json', '/favicon.svg']);
    const response = await fetch('/offline-assets.json', { cache: 'no-store' });
    await cache.put('/offline-assets.json', response.clone());
    const assets = await response.json();
    if (!Array.isArray(assets) || !assets.every(asset => typeof asset === 'string' && asset.startsWith('/assets/') && !asset.startsWith('//'))) throw new Error('Invalid build asset manifest');
    await cache.addAll(assets);
    await self.skipWaiting();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type !== 'OFFLINE_STATUS' || !event.ports?.[0] || !event.source?.url || new URL(event.source.url).origin !== self.location.origin) return;
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL), manifest = await cache.match('/offline-assets.json');
    const assets = manifest ? await manifest.json() : [];
    const missing = Array.isArray(assets) ? (await Promise.all(assets.map(async asset => (await cache.match(asset)) ? null : asset))).filter(Boolean) : ['manifest'];
    const shell = Boolean(await cache.match('/index.html')) && assets.length > 0 && missing.length === 0;
    const tiles = (await (await caches.open(TILES)).keys()).length;
    event.ports[0].postMessage({ shell, assets:assets.length, missing:missing.length, tiles, development:DEVELOPMENT });
  })().catch(() => event.ports[0].postMessage({shell:false,tiles:0,reason:'Offline cache inspection failed'})));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name.startsWith(PREFIX) && ![SHELL, TILES].includes(name)).map(name => caches.delete(name)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (DEVELOPMENT) return;
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || !['http:', 'https:'].includes(url.protocol) || request.headers.has('Authorization') || url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;
  const sameOrigin = url.origin === self.location.origin;
  const tileHost = url.hostname === 'tile.openstreetmap.org' || url.hostname.endsWith('.tile.openstreetmap.org') || url.hostname.endsWith('.basemaps.cartocdn.com');
  if (tileHost) {
    event.respondWith((async () => {
      const cache = await caches.open(TILES);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok || response.type === 'opaque') {
          try {
            await cache.put(request, response.clone());
            const keys = await cache.keys();
            await Promise.all(keys.slice(0, Math.max(0, keys.length - 200)).map(key => cache.delete(key)));
          } catch { /* Storage failure must not discard a successfully fetched tile. */ }
        }
        return response;
      } catch { return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#F6F4EF"/><text x="80" y="128">Offline map</text></svg>', { headers: { 'Content-Type': 'image/svg+xml' } }); }
    })());
    return;
  }
  if (!sameOrigin) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      try {
        const response = await fetch(request);
        if (response.ok) { try { await cache.put('/index.html', response.clone()); } catch { /* Keep the live response when storage is full. */ } }
        return response;
      } catch { return (await cache.match('/index.html')) || new Response('Offline. Reconnect to load the application.', { status: 503 }); }
    })());
  } else if (/^\/assets\/|^\/(manifest\.json|favicon\.svg)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      // Public build files do not vary by account. A server's Vary: Origin header
      // must not separate install-time fetches from same-origin module requests.
      const cached = await cache.match(request, { ignoreVary: true });
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) { try { await cache.put(request, response.clone()); } catch { /* Keep the live response when storage is full. */ } }
      return response;
    })());
  }
});
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { data = { body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Disaster response alert', {
    body: data.body || 'Open the application for the latest published alert.', icon: '/favicon.svg', badge: '/favicon.svg',
    tag: 'emergency-alert-' + (data.alertId || Date.now()), requireInteraction: data.severity === 'CRITICAL',
    data: { url: data.url || '/' }, actions: [{ action: 'open', title: 'Open alert map' }, { action: 'dismiss', title: 'Dismiss' }],
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  let target = new URL('/', self.location.origin);
  try { const proposed = new URL(event.notification.data?.url || '/', self.location.origin); if (proposed.origin === self.location.origin) target = proposed; } catch {}
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const client = clients.find(candidate => new URL(candidate.url).origin === self.location.origin);
    if (client) { await client.navigate(target.href); return client.focus(); }
    return self.clients.openWindow(target.href);
  }));
});

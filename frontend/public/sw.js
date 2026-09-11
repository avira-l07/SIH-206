// SIH26206 Disaster Response Hub Service Worker
// Versioned cache with offline map tile caching and network bypass for live APIs
const CACHE_NAME = 'sih-disaster-cache-v2';

const STATIC_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
];

// Install: pre-cache application shell and immediately activate
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] Pre-caching emergency application shell...');
      try {
        await cache.addAll(STATIC_SHELL);
      } catch (err) {
        console.warn('[SW] Non-critical pre-cache item skipped:', err);
      }
      return self.skipWaiting();
    })
  );
});

// Activate: clean up legacy cache versions and claim all open clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (cacheNames) => {
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Evicting legacy cache:', name);
            return caches.delete(name);
          })
      );
      return self.clients.claim();
    })
  );
});

// Fetch: specialized routing for live APIs, map tiles, and offline app shell
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Ignore non-http/https schemes (e.g. chrome-extension://, moz-extension://)
  if (!request.url.startsWith('http://') && !request.url.startsWith('https://')) {
    return;
  }

  // Only GET requests can be cached
  if (request.method !== 'GET') {
    return;
  }

  let url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return;
  }

  // 1. Live API endpoints (/api/*) & WebSockets MUST bypass SW cache entirely
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) {
    return;
  }

  // 2. Map tiles (OpenStreetMap / Carto / Leaflet assets) -> Cache-first strategy
  const isMapTile =
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('cartocdn.com') ||
    url.pathname.endsWith('.png') && (url.pathname.includes('/tile') || url.pathname.includes('/osm'));

  if (isMapTile) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone()).catch(() => {});
          }
          return networkResponse;
        } catch (err) {
          // If offline and tile not cached, return transparent placeholder
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="#F6F4EF"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="monospace" font-size="10" fill="#14231F" opacity="0.3">[OFFLINE MAP TILE]</text></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        }
      })
    );
    return;
  }

  // 3. Static assets, fonts & navigation -> Stale-while-revalidate / Cache-first fallback
  event.respondWith(
    caches.match(request).then(async (cachedResponse) => {
      if (cachedResponse) {
        // Revalidate in background if online
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse).catch(() => {})).catch(() => {});
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200 && request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache).catch(() => {})).catch(() => {});
        }
        return networkResponse;
      } catch (err) {
        // If offline and navigating to a page, return index.html shell
        if (request.mode === 'navigate') {
          return (await caches.match('/index.html')) || (await caches.match('/'));
        }
        throw err;
      }
    })
  );
});

// 4. Web Push Notification Handling for Emergency Alerts
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || '🚨 EMERGENCY DISASTER BROADCAST';
  const severity = data.severity || 'ALERT';
  const isCritical = severity === 'CRITICAL';

  const options = {
    body: data.body || 'Immediate attention required. Tap to view disaster response instructions.',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    vibrate: isCritical ? [300, 100, 300, 100, 500] : [200, 100, 200],
    tag: `emergency-alert-${data.alertId || Date.now()}`,
    renotify: true,
    requireInteraction: isCritical,
    data: {
      url: data.url || '/',
      alertId: data.alertId,
      severity: severity,
      hazardType: data.hazardType,
      region: data.region,
    },
    actions: [
      { action: 'open', title: 'Open Incident Map' },
      { action: 'dismiss', title: 'Acknowledge' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 5. Notification Click Handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});


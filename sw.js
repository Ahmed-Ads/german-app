// Service Worker for Deutsch Lernen PWA
// Cache Version: v6 (Critical precache hardening & HTML fallback chain with async IIFE)
const CACHE_NAME = 'deutsch-lernen-v6';

// Critical precache assets: Service Worker installation MUST fail if any of these cannot be cached,
// ensuring the previous Service Worker remains active and clients are not left in a broken state.
const CRITICAL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './fonts/fonts.css'
];

// Optional assets: Fonts and icons are cached defensively. If any fails to download,
// a warning is logged but the installation succeeds to maintain offline functionality.
const OPTIONAL_ASSETS = [
  './fonts/font_1.woff2',
  './fonts/font_2.woff2',
  './fonts/font_3.woff2',
  './fonts/font_4.woff2',
  './fonts/font_5.woff2',
  './fonts/font_6.woff2',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];

// Combined precache list (kept for complete site/ audits and asset verification)
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './fonts/fonts.css',
  './fonts/font_1.woff2',
  './fonts/font_2.woff2',
  './fonts/font_3.woff2',
  './fonts/font_4.woff2',
  './fonts/font_5.woff2',
  './fonts/font_6.woff2',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];

// Install: Cache critical assets strictly (fail install if any fails), optional assets resiliently
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // 1. Critical assets: cache.addAll rejects if any request fails, aborting installation
      await cache.addAll(CRITICAL_ASSETS);

      // 2. Optional assets: cache individually with error handling to avoid breaking install
      await Promise.all(
        OPTIONAL_ASSETS.map(url => {
          return cache.add(url).catch(err => {
            console.warn(`[SW] Optional precache failed for asset: ${url}`, err);
          });
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up old caches and claim clients immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Strategy depending on request type
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isHtml = event.request.mode === 'navigate' ||
                (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html'));

  if (isHtml) {
    // Network-First with 3-second timeout for HTML to ensure fast fallback offline or on poor network
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              reject(new Error('Network HTML fetch timed out after 3000ms'));
            }, 3000);

            fetch(event.request).then(response => {
              clearTimeout(timeoutId);
              if (response && response.status === 200) {
                const copy = response.clone();
                event.waitUntil(
                  caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy))
                );
              }
              resolve(response);
            }).catch(err => {
              clearTimeout(timeoutId);
              reject(err);
            });
          });
          return networkResponse;
        } catch (err) {
          const cachedRequest = await caches.match(event.request);
          if (cachedRequest) return cachedRequest;
          const cachedIndex = await caches.match('./index.html');
          if (cachedIndex) return cachedIndex;
          const cachedRoot = await caches.match('./');
          if (cachedRoot) return cachedRoot;
          return Response.error();
        }
      })()
    );
    return;
  }

  const isCss = url.pathname.endsWith('.css');
  if (isCss) {
    // Stale-While-Revalidate for CSS: instant offline delivery from cache while refreshing in background
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cachedResponse = await cache.match(event.request);
        const fetchPromise = fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then(c => c.put(event.request, copy))
            );
          }
          return networkResponse;
        }).catch(() => null);

        return cachedResponse || (await fetchPromise) || Response.error();
      })
    );
    return;
  }

  // Cache-First for static assets (fonts, icons, images)
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200 || (networkResponse.type !== 'basic' && networkResponse.type !== 'cors')) {
          return networkResponse;
        }
        const copy = networkResponse.clone();
        event.waitUntil(
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy))
        );
        return networkResponse;
      }).catch(() => {
        return Response.error();
      });
    })
  );
});

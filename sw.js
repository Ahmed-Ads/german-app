// Service Worker for Deutsch Lernen PWA
// Cache Version: v5 (Offline-first with local self-hosted fonts & male voice preference)
const CACHE_NAME = 'deutsch-lernen-v5';

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

// Install: Cache core assets resiliently (don't break if an individual optional asset fails)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await Promise.all(
        PRECACHE_ASSETS.map(url => {
          return cache.add(url).catch(err => {
            console.warn(`[SW] Precache failed for asset: ${url}`, err);
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
      new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Network HTML fetch timed out after 3000ms'));
        }, 3000);

        fetch(event.request).then(networkResponse => {
          clearTimeout(timeoutId);
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          resolve(networkResponse);
        }).catch(err => {
          clearTimeout(timeoutId);
          reject(err);
        });
      }).catch(() => {
        return caches.match('./index.html').then(cachedHtml => {
          return cachedHtml || caches.match(event.request) || Response.error();
        });
      })
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
            cache.put(event.request, networkResponse.clone());
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
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, copy);
        });
        return networkResponse;
      }).catch(() => {
        return Response.error();
      });
    })
  );
});


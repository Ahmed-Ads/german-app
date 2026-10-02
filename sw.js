// Service Worker for Deutsch Lernen PWA
// Cache Version: v3 (Offline-first with local self-hosted fonts)
const CACHE_NAME = 'deutsch-lernen-v3';

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
    // Network-First for HTML to ensure updates arrive immediately when online, with Cache Fallback for offline
    event.respondWith(
      fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return networkResponse;
      }).catch(() => {
        return caches.match('./index.html').then(cachedHtml => {
          return cachedHtml || caches.match(event.request);
        });
      })
    );
    return;
  }

  // Cache-First for static assets (fonts, icons, css, js)
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
        // Return null or fallback if network fails
        return null;
      });
    })
  );
});

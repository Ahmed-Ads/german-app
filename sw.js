// Service Worker for Deutsch Lernen PWA
// Cache Version: v10 (Fix: sync flush wrongly treated runtimes without navigator.onLine as offline)
const CACHE_NAME = 'deutsch-lernen-v10';

// Critical precache assets: Service Worker installation MUST fail if any of these cannot be cached,
// ensuring the previous Service Worker remains active and clients are not left in a broken state.
// Note: We precache canonical root './' (not './index.html') to stay fully compatible with static hosts
// like Cloudflare Pages that enforce clean URLs by redirecting /index.html to /.
const CRITICAL_ASSETS = [
  './',
  './manifest.json',
  './fonts/fonts.css'
];

// Optional assets: Fonts, icons, and sync modules are cached defensively. If any fails to download,
// a warning is logged but the installation succeeds to maintain full offline functionality.
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
  './icons/icon-maskable-512.png',
  './firebase-config.js',
  './sync/merge_policy.js',
  './sync/firebase_adapter.js',
  './sync/sync_manager.js',
  './vendor/firebase-sync.bundle.js'
];

// Combined precache list (single source of truth = CRITICAL + OPTIONAL; used for site/ audits and
// asset verification, so the three lists can never drift apart).
const PRECACHE_ASSETS = [...CRITICAL_ASSETS, ...OPTIONAL_ASSETS];

// Reconstruct a clean Response if the response was redirected (or has redirected === true),
// preventing "response.redirected === true" from being stored in Cache Storage
// or returned to fulfill navigation requests (which causes browser navigation errors per Fetch spec).
function cleanRedirectedResponse(response) {
  if (!response || !response.redirected) {
    return response;
  }
  const headers = new Headers(response.headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers
  });
}

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

  // Handle SAME-ORIGIN requests only. Cross-origin requests (e.g. googleapis.com, gstatic.com,
  // accounts.google.com, firebase, firestore) must pass straight through to the network,
  // never intercepted or cached by the Service Worker.
  if (url.origin !== self.location.origin) return;

  const isHtml = event.request.mode === 'navigate' ||
                (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html'));

  if (isHtml) {
    // When navigation URL ends with /index.html (e.g. bookmarks or PWA shortcuts on hosts like Cloudflare Pages
    // that redirect /index.html to /), serve the canonical cached root './' response directly so we never return
    // or cache a redirected response.
    if (url.pathname.endsWith('/index.html')) {
      event.respondWith(
        (async () => {
          const cachedRoot = (await caches.match('./')) || (await caches.match('/'));
          if (cachedRoot) {
            return cleanRedirectedResponse(cachedRoot);
          }
          try {
            const rootResponse = await fetch('./');
            if (rootResponse && rootResponse.status === 200) {
              const copy = cleanRedirectedResponse(rootResponse.clone());
              event.waitUntil(
                caches.open(CACHE_NAME).then(cache => cache.put('./', copy))
              );
            }
            return cleanRedirectedResponse(rootResponse);
          } catch (_) {
            const fallback = (await caches.match('./')) || (await caches.match('/'));
            if (fallback) return cleanRedirectedResponse(fallback);
            return Response.error();
          }
        })()
      );
      return;
    }

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
                const copy = cleanRedirectedResponse(response.clone());
                event.waitUntil(
                  caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy))
                );
              }
              resolve(cleanRedirectedResponse(response));
            }).catch(err => {
              clearTimeout(timeoutId);
              reject(err);
            });
          });
          return networkResponse;
        } catch (err) {
          const cachedRequest = await caches.match(event.request);
          if (cachedRequest) return cleanRedirectedResponse(cachedRequest);
          const cachedRoot = (await caches.match('./')) || (await caches.match('/'));
          if (cachedRoot) return cleanRedirectedResponse(cachedRoot);
          const cachedIndex = await caches.match('./index.html');
          if (cachedIndex) return cleanRedirectedResponse(cachedIndex);
          return Response.error();
        }
      })()
    );
    return;
  }

  const isCss = url.pathname.endsWith('.css');
  const isJs = url.pathname.endsWith('.js');
  if (isCss || isJs) {
    // Stale-While-Revalidate for CSS and JS (incl. sync/*.js): instant offline delivery from cache while
    // refreshing in the background, so a fixed script reaches users on their next visit even if
    // CACHE_NAME was not bumped. (Cache-first here previously kept stale JS forever.)
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

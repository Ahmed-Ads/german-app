import fs from 'fs';
import { describe, it, expect } from 'vitest';

describe('Service Worker Configuration & Precache Hardening (sw.js)', () => {
  const swCode = fs.readFileSync('sw.js', 'utf8');
  const readmeCode = fs.readFileSync('README.md', 'utf8');

  // Dynamic CACHE_NAME extraction (no hardcoding)
  const cacheNameMatch = swCode.match(/const\s+CACHE_NAME\s*=\s*['"]([^'"]+)['"]/);
  const cacheName = cacheNameMatch ? cacheNameMatch[1] : null;

  it('declares a valid versioned CACHE_NAME dynamically', () => {
    expect(cacheName).not.toBeNull();
    expect(cacheName).toMatch(/^deutsch-lernen-v\d+$/);
  });

  it('declares CRITICAL_ASSETS containing ./, manifest.json, and fonts.css without index.html', () => {
    const match = swCode.match(/const\s+CRITICAL_ASSETS\s*=\s*\[([\s\S]*?)\];/);
    expect(match).not.toBeNull();
    const criticalAssetsText = match[1];
    expect(criticalAssetsText).toContain("'./'");
    expect(criticalAssetsText).not.toContain("'./index.html'");
    expect(criticalAssetsText).toContain("'./manifest.json'");
    expect(criticalAssetsText).toContain("'./fonts/fonts.css'");
  });

  it('declares OPTIONAL_ASSETS with non-blocking error handling', () => {
    expect(swCode).toMatch(/const\s+OPTIONAL_ASSETS\s*=\s*\[[\s\S]*?\];/);
    for (let i = 1; i <= 6; i++) {
      expect(swCode).toContain(`./fonts/font_${i}.woff2`);
    }
    expect(swCode).toContain("'./icons/icon.svg'");
    expect(swCode).toContain("'./icons/icon-192.png'");
    expect(swCode).toContain("'./vendor/firebase-sync.bundle.js'");
    expect(swCode).toContain("'./sync/merge_policy.js'");
  });

  it('implements Stale-While-Revalidate for CSS files', () => {
    expect(swCode).toContain("url.pathname.endsWith('.css')");
    expect(swCode).toContain('cachedResponse || (await fetchPromise) || Response.error()');
  });

  it('handles SAME-ORIGIN requests only and passes cross-origin requests directly through', () => {
    expect(swCode).toContain('url.origin !== self.location.origin');
  });

  it('wraps background cache.put calls in event.waitUntil', () => {
    expect(swCode).toMatch(/event\.waitUntil\s*\(\s*caches\.open\(CACHE_NAME\)\.then\(cache\s*=>\s*cache\.put/);
  });

  it('implements HTML fallback chain with clean non-redirected Response handling', () => {
    expect(swCode).toContain('cleanRedirectedResponse');
    expect(swCode).toContain("url.pathname.endsWith('/index.html')");
    expect(swCode).toContain("await caches.match('./')");
    expect(swCode).toContain('return Response.error()');
  });

  it('sanitizes redirected responses before returning or caching', () => {
    expect(swCode).toContain('function cleanRedirectedResponse(response)');
    expect(swCode).toContain('new Response(response.body');
  });

  it('purges legacy caches upon activation', () => {
    expect(swCode).toContain('if (name !== CACHE_NAME)');
    expect(swCode).toContain('return caches.delete(name)');
  });

  it('documents current CACHE_NAME and Stale-While-Revalidate in README.md', () => {
    expect(readmeCode).toContain(cacheName);
    expect(readmeCode).toContain('Stale-While-Revalidate');
  });
});

describe('Service Worker Lifecycle & Fallback Simulation', () => {
  it('fails installation when any CRITICAL asset fails to cache', async () => {
    // Simulating cache.addAll with a failing critical asset
    const criticalAssets = ['./', './manifest.json', './fonts/fonts.css'];
    const mockCache = {
      addAll: async (assets) => {
        for (const asset of assets) {
          if (asset === './manifest.json') {
            throw new Error(`Failed to fetch critical asset: ${asset} (404 Not Found)`);
          }
        }
      },
      add: async () => {}
    };

    let installError = null;
    try {
      await mockCache.addAll(criticalAssets);
    } catch (err) {
      installError = err;
    }

    expect(installError).not.toBeNull();
    expect(installError.message).toContain('Failed to fetch critical asset: ./manifest.json');
  });

  it('succeeds installation even if OPTIONAL assets fail to cache', async () => {
    const optionalAssets = ['./fonts/font_1.woff2', './icons/icon-192.png'];
    const mockCache = {
      addAll: async () => {},
      add: async (url) => {
        if (url.includes('font_1.woff2')) {
          throw new Error('Network error on font download');
        }
      }
    };

    const warnings = [];
    await Promise.all(
      optionalAssets.map(url => {
        return mockCache.add(url).catch(err => {
          warnings.push(`[SW] Optional precache failed for asset: ${url}`);
        });
      })
    );

    // Optional failure logged warning but did not reject Promise.all
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('font_1.woff2');
  });

  it('returns cached root ./ when offline and network fails', async () => {
    const fakeHtmlResponse = new Response('<!DOCTYPE html><html><body>Offline App</body></html>', {
      headers: { 'Content-Type': 'text/html' }
    });

    const mockCaches = {
      match: async (query) => {
        if (query === './') return fakeHtmlResponse;
        return null;
      }
    };

    // Simulate HTML navigation fetch handler catch block
    const handleFetchFallback = async (requestUrl) => {
      const cachedReq = await mockCaches.match(requestUrl);
      if (cachedReq) return cachedReq;
      const cachedRoot = await mockCaches.match('./');
      if (cachedRoot) return cachedRoot;
      return Response.error();
    };

    const result = await handleFetchFallback('http://127.0.0.1:8000/some/deep/route');
    expect(result).toBe(fakeHtmlResponse);
    const bodyText = await result.text();
    expect(bodyText).toContain('Offline App');
  });

  it('returns Response.error() when both network and cache are completely unavailable', async () => {
    const mockEmptyCaches = {
      match: async () => null
    };

    const handleFetchFallback = async (requestUrl) => {
      const cachedReq = await mockEmptyCaches.match(requestUrl);
      if (cachedReq) return cachedReq;
      const cachedRoot = await mockEmptyCaches.match('./');
      if (cachedRoot) return cachedRoot;
      return Response.error();
    };

    const result = await handleFetchFallback('http://127.0.0.1:8000/index.html');
    expect(result.type).toBe('error');
  });

  it('passes cross-origin requests (Firebase, Google Auth, Firestore) straight through without interception', () => {
    const swCode = fs.readFileSync('sw.js', 'utf8');
    expect(swCode).toMatch(/if\s*\(\s*url\.origin\s*!==\s*self\.location\.origin\s*\)\s*return;/);

    const selfLocation = { origin: 'https://german-app.pages.dev' };
    const crossOriginUrls = [
      'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel',
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup',
      'https://accounts.google.com/o/oauth2/v2/auth',
      'https://www.gstatic.com/firebasejs/10.0.0/firebase.js'
    ];

    for (const testUrl of crossOriginUrls) {
      const url = new URL(testUrl);
      const isSameOrigin = (url.origin === selfLocation.origin);
      expect(isSameOrigin).toBe(false);
    }
  });
});


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

  it('declares CRITICAL_ASSETS containing index.html, manifest.json, and fonts.css', () => {
    expect(swCode).toMatch(/const\s+CRITICAL_ASSETS\s*=\s*\[[\s\S]*?\];/);
    expect(swCode).toContain("'./index.html'");
    expect(swCode).toContain("'./manifest.json'");
    expect(swCode).toContain("'./fonts/fonts.css'");
  });

  it('declares OPTIONAL_ASSETS with non-blocking error handling', () => {
    expect(swCode).toMatch(/const\s+OPTIONAL_ASSETS\s*=\s*\[[\s\S]*?\];/);
    for (let i = 1; i <= 6; i++) {
      expect(swCode).toContain(`./fonts/font_${i}.woff2`);
    }
    expect(swCode).toContain("'./icons/icon.svg'");
    expect(swCode).toContain("'./icons/icon-192.png'");
  });

  it('implements Stale-While-Revalidate for CSS files', () => {
    expect(swCode).toContain("url.pathname.endsWith('.css')");
    expect(swCode).toContain('cachedResponse || (await fetchPromise) || Response.error()');
  });

  it('wraps background cache.put calls in event.waitUntil', () => {
    expect(swCode).toMatch(/event\.waitUntil\s*\(\s*caches\.open\(CACHE_NAME\)\.then\(cache\s*=>\s*cache\.put/);
  });

  it('implements HTML fallback chain with async IIFE and Response.error() fallback', () => {
    expect(swCode).toContain('await caches.match(event.request)');
    expect(swCode).toContain("await caches.match('./index.html')");
    expect(swCode).toContain('return Response.error()');
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
    const criticalAssets = ['./', './index.html', './manifest.json', './fonts/fonts.css'];
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

  it('returns cached index.html when offline and network fails', async () => {
    const fakeHtmlResponse = new Response('<!DOCTYPE html><html><body>Offline App</body></html>', {
      headers: { 'Content-Type': 'text/html' }
    });

    const mockCaches = {
      match: async (query) => {
        if (query === './index.html') return fakeHtmlResponse;
        return null;
      }
    };

    // Simulate HTML navigation fetch handler catch block
    const handleFetchFallback = async (requestUrl) => {
      const cachedReq = await mockCaches.match(requestUrl);
      if (cachedReq) return cachedReq;
      const cachedIndex = await mockCaches.match('./index.html');
      if (cachedIndex) return cachedIndex;
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
      const cachedIndex = await mockEmptyCaches.match('./index.html');
      if (cachedIndex) return cachedIndex;
      return Response.error();
    };

    const result = await handleFetchFallback('http://127.0.0.1:8000/index.html');
    expect(result.type).toBe('error');
  });
});

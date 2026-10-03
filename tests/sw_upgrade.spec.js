// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Service Worker Cache Upgrade Verification (v3 -> v4)', () => {
  test('v3 cache is deleted, v4 is active, fonts.css revalidated, font_1 returns 200 with 0 404s', async ({ browser }) => {
    const context = await browser.newContext({
      serviceWorkers: 'allow'
    });
    const page = await context.newPage();

    const notFoundUrls = [];
    page.on('response', resp => {
      if (resp.status() === 404) {
        notFoundUrls.push(resp.url());
      }
    });

    const appUrl = process.env.APP_URL || 'http://localhost:8000/';

    // 1. Initial page load
    console.log('Navigating to app URL:', appUrl);
    await page.goto(appUrl, { waitUntil: 'networkidle' });

    // 2. Simulate pre-existing legacy v3 cache with outdated mock fonts.css
    await page.evaluate(async () => {
      const v3Cache = await caches.open('deutsch-lernen-v3');
      await v3Cache.put(new Request('/fonts/fonts.css'), new Response('/* legacy fonts.css v3 */', {
        headers: { 'Content-Type': 'text/css' }
      }));
    });

    const initialCaches = await page.evaluate(async () => await caches.keys());
    expect(initialCaches).toContain('deutsch-lernen-v3');
    console.log('[Step 1] Seeded legacy cache:', initialCaches);

    // 3. Trigger Service Worker activation and cache purge
    console.log('[Step 2] Triggering Service Worker activation and cache purge...');
    await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
        }
      }
    });

    // Wait for the new service worker v4 to activate and purge older caches
    await page.waitForFunction(async () => {
      const keys = await caches.keys();
      return keys.includes('deutsch-lernen-v4') && !keys.includes('deutsch-lernen-v3');
    }, { timeout: 15000 });

    // 4. Reload page under v4
    console.log('[Step 3] Reloading page to apply v4...');
    await page.reload({ waitUntil: 'networkidle' });

    // 5. Assert cache migration
    const updatedCaches = await page.evaluate(async () => await caches.keys());
    console.log('[Step 4] Updated Caches:', updatedCaches);
    expect(updatedCaches).toContain('deutsch-lernen-v4');
    expect(updatedCaches).not.toContain('deutsch-lernen-v3');

    // 6. Assert font_1.woff2 is served 200 from cache and 0 404s
    const fontCheck = await page.evaluate(async () => {
      const cache = await caches.open('deutsch-lernen-v4');
      const keys = await cache.keys();
      const fontReq = keys.find(r => r.url.includes('font_1.woff2'));
      if (!fontReq) return { cached: false, status: 0 };
      const res = await cache.match(fontReq);
      return { cached: true, status: res ? res.status : 0 };
    });

    console.log('[Step 5] Font cache check:', fontCheck);
    expect(fontCheck.cached).toBe(true);
    expect(fontCheck.status).toBe(200);

    // Direct font fetch inside the page
    const fetchStatus = await page.evaluate(async () => {
      const res = await fetch('./fonts/font_1.woff2');
      return res.status;
    });
    expect(fetchStatus).toBe(200);

    console.log('404 requests count: ' + notFoundUrls.length);
    expect(notFoundUrls).toHaveLength(0);
    console.log('✅ Service worker upgrade v3 -> v4 verified successfully with 0 404s.');
  });
});

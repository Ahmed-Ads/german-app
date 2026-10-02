// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * End-to-End Offline PWA & Service Worker Test Suite
 * Validates offline capability, service worker controlling, offline reloading,
 * and font availability when completely disconnected from network.
 */
test.describe('PWA Offline & Service Worker Verification', () => {

  test('Service worker installs, activates, controls page, and serves app offline with fonts', async ({ browser }) => {
    // 1. Create a fresh browser context
    const context = await browser.newContext({
      viewport: { width: 412, height: 915 }, // Pixel-like mobile viewport
      serviceWorkers: 'allow'
    });

    const page = await context.newPage();

    // 2. Navigate to local app server
    const appUrl = process.env.APP_URL || 'http://localhost:8000/';
    console.log('Navigating to app URL:', appUrl);
    const response = await page.goto(appUrl, { waitUntil: 'networkidle' });
    expect(response.status()).toBe(200);

    // 3. Wait for Service Worker registration and active controller
    await page.waitForFunction(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.ready;
      return !!reg && !!navigator.serviceWorker.controller;
    }, { timeout: 10000 });

    // 4. Verify Cache Storage contents
    const cacheVerified = await page.evaluate(async () => {
      const cacheNames = await caches.keys();
      const swCache = cacheNames.find(c => c.startsWith('deutsch-lernen-'));
      if (!swCache) return false;
      const cache = await caches.open(swCache);
      const keys = await cache.keys();
      const urls = keys.map(r => r.url);
      const hasHtml = urls.some(u => u.includes('index.html') || u.endsWith('/'));
      const hasCss = urls.some(u => u.includes('fonts.css'));
      const hasFonts = urls.some(u => u.includes('font_1.woff2'));
      return { cacheName: swCache, totalCached: urls.length, hasHtml, hasCss, hasFonts };
    });

    console.log('Cache verification result:', cacheVerified);
    expect(cacheVerified.hasHtml).toBe(true);
    expect(cacheVerified.hasCss).toBe(true);
    expect(cacheVerified.hasFonts).toBe(true);

    // 5. Emulate full offline mode (disconnect network)
    console.log('Emulating offline mode via context.setOffline(true)...');
    await context.setOffline(true);

    // 6. Reload page while offline
    console.log('Reloading page offline...');
    await page.reload({ waitUntil: 'networkidle' });

    // 7. Assert home screen elements render properly from cache
    const appContainer = page.locator('#app');
    await expect(appContainer).toBeVisible();

    const categoryCards = page.locator('.cat-card');
    const cardCount = await categoryCards.count();
    console.log('Rendered category cards offline:', cardCount);
    expect(cardCount).toBe(30);

    // 8. Assert typography and local self-hosted fonts loaded offline
    const fontsLoaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.status === 'loaded';
    });
    console.log('Fonts status offline:', fontsLoaded);
    expect(fontsLoaded).toBe(true);

    await context.close();
  });

});

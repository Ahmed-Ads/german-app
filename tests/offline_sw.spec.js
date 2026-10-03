// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * End-to-End Offline PWA & Service Worker Test Suite
 * Validates:
 *  (a) Home renders exactly 30 distinct categories (.cat-card[data-cat])
 *  (b) Interactive offline exercise (open category, answer MCQ question)
 *  (c) Feedback appears
 *  (d) Progress persists after another offline reload
 *  (e) document.fonts.check for Cairo is true and NO external font requests are made
 *  (f) Direct navigation to /index.html offline works
 *  (g) All offline requests are logged with Service Worker cache status
 */
test.describe('PWA Offline & Service Worker Verification', () => {

  test('Service worker installs, serves app offline, handles exercises, and persists progress', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 412, height: 915 },
      serviceWorkers: 'allow'
    });

    const page = await context.newPage();

    // Track requests and responses
    const allRequests = [];
    const offlineRequests = [];
    let isOffline = false;

    page.on('request', req => {
      const entry = { url: req.url(), method: req.method(), offline: isOffline };
      allRequests.push(entry);
      if (isOffline) {
        offlineRequests.push(entry);
      }
    });

    page.on('response', resp => {
      const fromSW = resp.fromServiceWorker();
      if (isOffline) {
        console.log(`  [Offline Request] ${resp.status()} ${resp.url()} (from SW: ${fromSW})`);
      }
    });

    // Track console errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push({ text: msg.text(), location: msg.location() });
      }
    });

    const pageErrors = [];
    page.on('pageerror', err => {
      pageErrors.push(err.message);
    });

    const appUrl = process.env.APP_URL || 'http://localhost:8000/';
    console.log('Navigating to app URL:', appUrl);
    const response = await page.goto(appUrl, { waitUntil: 'networkidle' });
    expect(response.status()).toBe(200);

    // Wait for Service Worker registration and active controller
    await page.waitForFunction(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.ready;
      return !!reg && !!navigator.serviceWorker.controller;
    }, { timeout: 15000 });

    // Verify Cache Storage contents
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

    expect(cacheVerified.hasHtml).toBe(true);
    expect(cacheVerified.hasCss).toBe(true);
    expect(cacheVerified.hasFonts).toBe(true);
    console.log('Cache verified:', cacheVerified);

    // -------------------------------------------------------------
    // Enable Full Offline Mode
    // -------------------------------------------------------------
    console.log('\n--- Switching to OFFLINE mode (context.setOffline(true)) ---');
    isOffline = true;
    await context.setOffline(true);

    // (a) Reload page while offline and assert 30 category cards
    console.log('Reloading page offline...');
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('#app')).toBeVisible();

    const catCards = page.locator('.cat-card[data-cat]');
    const cardCount = await catCards.count();
    console.log(`Rendered category cards offline: ${cardCount}`);
    expect(cardCount).toBe(30);

    const catIds = await catCards.evaluateAll(cards => cards.map(c => c.getAttribute('data-cat')));
    const distinctIds = Array.from(new Set(catIds));
    console.log(`Distinct category IDs count: ${distinctIds.length}`);
    expect(distinctIds.length).toBe(30);

    // (b) Open one category and answer one MCQ question
    console.log('Testing offline exercise: Opening category obst...');
    await page.locator('.cat-card[data-cat="obst"]').click();
    await page.waitForSelector('[data-mode="mcq"]', { state: 'visible', timeout: 5000 });

    console.log('Starting MCQ mode...');
    await page.locator('[data-mode="mcq"]').click();
    await page.waitForSelector('.opt', { state: 'visible', timeout: 5000 });

    const firstOption = page.locator('.opt').first();
    await firstOption.click();

    // (c) Feedback appears
    const feedback = page.locator('#fb, .feedback');
    await expect(feedback).not.toBeEmpty();
    console.log('MCQ feedback appeared successfully offline.');
    await page.waitForTimeout(500);

    // (d) Progress persists after another offline reload
    console.log('Performing second offline reload to verify progress persistence...');
    await page.reload({ waitUntil: 'networkidle' });

    const progressData = await page.evaluate(() => {
      const raw = localStorage.getItem('german-arabic-progress-v1') ||
                  localStorage.getItem('deutsch_lern_v1') ||
                  localStorage.getItem('german-arabic-stats-v1') ||
                  localStorage.getItem('deutsch_stats_v1');
      return raw ? JSON.parse(raw) : null;
    });
    console.log('Progress data found after offline reload:', !!progressData);
    expect(progressData).not.toBeNull();

    // (e) Typography check: Cairo font is loaded and NO external Google fonts requested
    const cairoReady = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check('16px Cairo');
    });
    console.log('Cairo font status offline:', cairoReady);
    expect(cairoReady).toBe(true);

    const externalFontRequests = allRequests.filter(r =>
      r.url.includes('fonts.googleapis.com') || r.url.includes('fonts.gstatic.com')
    );
    expect(externalFontRequests.length).toBe(0);

    // (f) Direct offline navigation to /index.html
    console.log('Navigating directly to /index.html offline...');
    const indexUrl = new URL('index.html', appUrl).href;
    await page.goto(indexUrl, { waitUntil: 'networkidle' });
    await expect(page.locator('#app')).toBeVisible();

    const directIndexCatCount = await page.locator('.cat-card[data-cat]').count();
    expect(directIndexCatCount).toBe(30);
    console.log('Direct navigation to /index.html offline succeeded (30 category cards rendered).');

    // (g) Report offline requests
    console.log(`\nTotal offline requests made: ${offlineRequests.length}`);
    expect(consoleErrors.length).toBe(0);
    expect(pageErrors.length).toBe(0);

    console.log('[PASS] Full offline PWA lifecycle verified.');
    await context.close();
  });

});

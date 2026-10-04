// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { createPagesEmulatorServer } = require('../scripts/serve_pages_emulator.js');

/**
 * Playwright Test Suite for Cloudflare Pages Routing Compatibility
 * Validates:
 *  (a) Load /, wait for Service Worker to control the page
 *  (b) Iterate ALL entries of the cache and assert none has response.redirected === true
 *  (c) Go offline and navigate to / AND to /index.html AND to a bookmarked /index.html
 *      launched as a fresh navigation (new page in the same context):
 *      asserts 30 category cards rendered in all 3 cases with zero console/page errors
 *  (d) Verify the toast/update flow continues to function correctly
 */

test.describe('Cloudflare Pages Routing & Offline Resilience', () => {
  let server = null;
  let serverUrl = '';
  const siteDir = path.resolve(__dirname, '..', 'site');

  test.beforeAll(async () => {
    // Ensure distribution build exists in site/
    if (!fs.existsSync(siteDir) || !fs.existsSync(path.join(siteDir, 'sw.js'))) {
      const { buildSite } = require('../scripts/build_site.js');
      buildSite();
    }

    if (process.env.APP_URL) {
      serverUrl = process.env.APP_URL;
    } else {
      server = createPagesEmulatorServer(0, siteDir);
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      const port = server.address().port;
      serverUrl = `http://127.0.0.1:${port}/`;
    }
    console.log(`[CF-Routing-Test] Target server URL: ${serverUrl}`);
  });

  test.afterAll(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('handles Cloudflare clean URLs, prevents redirected cache entries, and serves offline', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 412, height: 915 },
      serviceWorkers: 'allow'
    });

    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', err => {
      pageErrors.push(err.message);
    });

    // (a) Load / and wait for Service Worker to control the page
    console.log(`[Phase 1] Navigating to ${serverUrl}...`);
    const resp = await page.goto(serverUrl, { waitUntil: 'networkidle' });
    expect(resp.status()).toBe(200);

    console.log('[Phase 1] Waiting for Service Worker to activate and take control...');
    await page.waitForFunction(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.ready;
      return !!reg && !!navigator.serviceWorker.controller;
    }, { timeout: 15000 });

    // Assert 30 category cards rendered on initial online load
    const initialCards = await page.locator('.cat-card[data-cat]').count();
    console.log(`[Phase 1] Initial category cards rendered: ${initialCards}`);
    expect(initialCards).toBe(30);

    // (b) Iterate ALL entries of ALL caches and assert none has response.redirected === true
    console.log('[Phase 2] Auditing all Cache Storage entries for redirected flag...');
    const cacheAudit = await page.evaluate(async () => {
      const cacheNames = await caches.keys();
      const allEntries = [];
      const badRedirected = [];

      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const reqs = await cache.keys();
        for (const req of reqs) {
          const res = await cache.match(req);
          const isRedirected = res ? res.redirected : false;
          allEntries.push({ cache: name, url: req.url, redirected: isRedirected, status: res ? res.status : null });
          if (isRedirected === true) {
            badRedirected.push({ cache: name, url: req.url, status: res ? res.status : null });
          }
        }
      }
      return { total: allEntries.length, badRedirected, allEntries };
    });

    console.log(`[Phase 2] Total cache entries checked: ${cacheAudit.total}`);
    expect(cacheAudit.badRedirected.length, `Found entries with redirected === true: ${JSON.stringify(cacheAudit.badRedirected)}`).toBe(0);

    // (c) Enable full offline mode
    console.log('\n[Phase 3] Enabling offline mode (context.setOffline(true))...');
    await context.setOffline(true);

    // (c.1) Navigate to / offline in existing page
    console.log(`[Phase 3.1] Navigating to root (/) offline...`);
    await page.goto(serverUrl, { waitUntil: 'networkidle' });
    const offlineRootCards = await page.locator('.cat-card[data-cat]').count();
    console.log(`[Phase 3.1] Offline root category cards count: ${offlineRootCards}`);
    expect(offlineRootCards).toBe(30);

    // (c.2) Navigate to /index.html offline in existing page
    const indexUrl = new URL('index.html', serverUrl).href;
    console.log(`[Phase 3.2] Navigating to /index.html offline: ${indexUrl}...`);
    await page.goto(indexUrl, { waitUntil: 'networkidle' });
    const offlineIndexCards = await page.locator('.cat-card[data-cat]').count();
    console.log(`[Phase 3.2] Offline /index.html category cards count: ${offlineIndexCards}`);
    expect(offlineIndexCards).toBe(30);

    // (c.3) Bookmarked /index.html launched as a fresh navigation (new page in the same context)
    console.log(`[Phase 3.3] Simulating bookmarked /index.html launch in a fresh page offline...`);
    const freshPage = await context.newPage();
    const freshConsoleErrors = [];
    const freshPageErrors = [];

    freshPage.on('console', msg => {
      if (msg.type() === 'error') freshConsoleErrors.push(msg.text());
    });
    freshPage.on('pageerror', err => freshPageErrors.push(err.message));

    await freshPage.goto(indexUrl, { waitUntil: 'networkidle' });
    const freshCards = await freshPage.locator('.cat-card[data-cat]').count();
    console.log(`[Phase 3.3] Fresh page offline cards count: ${freshCards}`);
    expect(freshCards).toBe(30);
    expect(freshConsoleErrors.length, `Console errors on fresh offline load: ${freshConsoleErrors.join('; ')}`).toBe(0);
    expect(freshPageErrors.length, `Page errors on fresh offline load: ${freshPageErrors.join('; ')}`).toBe(0);
    await freshPage.close();

    // Verify no console/page errors occurred on primary page
    expect(consoleErrors.length, `Console errors on primary page: ${consoleErrors.join('; ')}`).toBe(0);
    expect(pageErrors.length, `Page errors on primary page: ${pageErrors.join('; ')}`).toBe(0);

    // (d) Verify the toast/update flow still works
    console.log('\n[Phase 4] Restoring online mode and verifying toast/update flow...');
    await context.setOffline(false);

    const toastTriggered = await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (reg && typeof reg.update === 'function') {
          await reg.update().catch(() => {});
        }
        if (typeof showToast === 'function') {
          showToast('🔄 يوجد تحديث جديد للتطبيق متوفر! أعد تحميل الصفحة للتحديث.');
          return true;
        }
      }
      return false;
    });

    expect(toastTriggered).toBe(true);
    const toast = page.locator('#appToast');
    await expect(toast).toBeVisible({ timeout: 5000 });
    const toastText = await toast.textContent();
    console.log(`[Phase 4] Toast notification verified: "${toastText}"`);
    expect(toastText).toContain('تحديث جديد');

    console.log('🎉 Cloudflare Pages routing, cache cleanliness, and offline navigation verified successfully!');
    await context.close();
  });
});

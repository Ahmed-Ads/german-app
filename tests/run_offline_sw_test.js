// tests/run_offline_sw_test.js
/**
 * Standalone End-to-End Offline PWA & Service Worker Test Runner
 * Uses Playwright's core library directly (no @playwright/test CLI or npx wrapper required).
 * Verifies:
 *  1. Service Worker registration and activation
 *  2. Pre-cache population (HTML, fonts.css, local woff2 fonts)
 *  3. Full network disconnection (context.setOffline(true))
 *  4. Offline reload and DOM rendering (30 categories)
 *  5. Local typography font availability offline
 */

const http = require('http');

async function waitForServer(url, timeoutMs = 15000) {
  const startTime = Date.now();
  const parsed = new URL(url);

  while (Date.now() - startTime < timeoutMs) {
    try {
      const ok = await new Promise((resolve) => {
        const req = http.get(
          {
            hostname: parsed.hostname,
            port: parsed.port || 80,
            path: parsed.pathname || '/',
            timeout: 2000
          },
          (res) => resolve(res.statusCode === 200)
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
      });

      if (ok) return true;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function run() {
  console.log('========================================================');
  console.log('  RUNNING PLAYWRIGHT OFFLINE SERVICE WORKER E2E TEST');
  console.log('========================================================');

  const appUrl = process.env.APP_URL || 'http://localhost:8000/';
  console.log(`Checking reachability of ${appUrl}...`);

  const serverReady = await waitForServer(appUrl, 15000);
  if (!serverReady) {
    console.error(`❌ ERROR: Local server at ${appUrl} did not respond with HTTP 200 within 15 seconds.`);
    process.exit(1);
  }
  console.log(`✓ Local server is responsive on ${appUrl}`);

  let playwright;
  try {
    playwright = require('playwright');
  } catch (err) {
    console.error('❌ ERROR: "playwright" package is not available in node_modules.');
    console.error('Please run "npm install" before running this test.');
    process.exit(1);
  }

  const { chromium } = playwright;
  let browser = null;

  // Try launching system Chrome first, then bundled Chromium
  try {
    console.log('Attempting to launch browser via Chrome channel...');
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    console.log('✓ Launched system Google Chrome');
  } catch (chromeErr) {
    console.log(`Notice: Chrome channel launch not available (${chromeErr.message.split('\n')[0]}). Falling back to Chromium...`);
    try {
      browser = await chromium.launch({ headless: true });
      console.log('✓ Launched bundled Chromium');
    } catch (chromiumErr) {
      console.error('❌ ERROR: Could not launch either Google Chrome or bundled Chromium.');
      console.error('Chrome error:', chromeErr.message);
      console.error('Chromium error:', chromiumErr.message);
      console.error('To install Playwright Chromium, run: npx playwright install chromium');
      process.exit(1);
    }
  }

  try {
    const context = await browser.newContext({
      viewport: { width: 412, height: 915 },
      serviceWorkers: 'allow'
    });

    const page = await context.newPage();

    // 1. Initial Load
    console.log(`Navigating to ${appUrl}...`);
    const response = await page.goto(appUrl, { waitUntil: 'networkidle', timeout: 30000 });
    if (!response || response.status() !== 200) {
      throw new Error(`Failed to load ${appUrl}, status: ${response ? response.status() : 'no response'}`);
    }

    // 2. Service Worker Ready & Controller
    console.log('Waiting for Service Worker registration and controller...');
    await page.waitForFunction(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.ready;
      return !!reg && !!navigator.serviceWorker.controller;
    }, { timeout: 15000 });
    console.log('✓ Service Worker is registered, active, and controlling the page');

    // 3. Cache Storage Verification
    console.log('Verifying Cache Storage precached assets...');
    const cacheData = await page.evaluate(async () => {
      const keys = await caches.keys();
      const swCacheName = keys.find(k => k.startsWith('deutsch-lernen-'));
      if (!swCacheName) return { found: false };

      const cache = await caches.open(swCacheName);
      const reqs = await cache.keys();
      const urls = reqs.map(r => r.url);

      const hasHtml = urls.some(u => u.includes('index.html') || u.endsWith('/'));
      const hasCss = urls.some(u => u.includes('fonts.css'));
      const hasFonts = urls.some(u => u.includes('font_1.woff2'));

      return {
        found: true,
        cacheName: swCacheName,
        totalEntries: urls.length,
        hasHtml,
        hasCss,
        hasFonts
      };
    });

    if (!cacheData.found) {
      throw new Error('Service Worker cache storage was not found.');
    }
    if (!cacheData.hasHtml || !cacheData.hasCss || !cacheData.hasFonts) {
      throw new Error(`Incomplete cache contents: hasHtml=${cacheData.hasHtml}, hasCss=${cacheData.hasCss}, hasFonts=${cacheData.hasFonts}`);
    }
    console.log(`✓ Cache Storage verified: ${cacheData.cacheName} (${cacheData.totalEntries} entries, HTML, CSS, fonts precached)`);

    // 4. Simulate Complete Offline Mode
    console.log('Disconnecting network (context.setOffline(true))...');
    await context.setOffline(true);

    // 5. Reload Page in Offline Mode
    console.log('Reloading page while offline...');
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });

    // 6. Assert Elements Rendered Offline
    const appVisible = await page.locator('#app').isVisible();
    if (!appVisible) {
      throw new Error('Main #app container is not visible after offline reload.');
    }

    const cardCount = await page.locator('.cat-card').count();
    if (cardCount !== 30) {
      throw new Error(`Expected 30 category cards rendered offline, found: ${cardCount}`);
    }
    console.log(`✓ 30 category cards rendered successfully offline`);

    // 7. Verify Typography / Fonts Status
    const fontStatus = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.status;
    });
    if (fontStatus !== 'loaded') {
      throw new Error(`Typography status expected 'loaded', got: ${fontStatus}`);
    }
    console.log(`✓ Local self-hosted typography is loaded and functional offline`);

    console.log('========================================================');
    console.log('[PASS] Service worker served app offline with 30 categories and local fonts');
    console.log('========================================================');

    await context.close();
    await browser.close();
    process.exit(0);
  } catch (testErr) {
    console.error('❌ OFFLINE TEST FAILED:', testErr.message);
    if (browser) await browser.close();
    process.exit(1);
  }
}

run();

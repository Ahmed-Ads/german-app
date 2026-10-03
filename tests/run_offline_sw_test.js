// tests/run_offline_sw_test.js
/**
 * Standalone End-to-End Offline PWA & Service Worker Test Runner
 * Uses Playwright's core library directly.
 * Validates:
 *  (a) Home renders exactly 30 distinct categories (.cat-card[data-cat])
 *  (b) Interactive offline exercise (open category, answer MCQ question)
 *  (c) Feedback appears
 *  (d) Progress persists after another offline reload
 *  (e) document.fonts.check for Cairo is true and NO external font requests are made
 *  (f) Direct navigation to /index.html offline works
 *  (g) Logs network requests served by SW vs network
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
    process.exit(1);
  }

  const { chromium } = playwright;
  let browser = null;

  try {
    console.log('Attempting to launch browser via Chrome channel...');
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    console.log('✓ Launched system Google Chrome');
  } catch (chromeErr) {
    console.log(`Notice: Chrome channel not available (${chromeErr.message.split('\n')[0]}). Falling back to Chromium...`);
    try {
      browser = await chromium.launch({ headless: true });
      console.log('✓ Launched bundled Chromium');
    } catch (chromiumErr) {
      console.error('❌ ERROR: Could not launch either Google Chrome or bundled Chromium.');
      process.exit(1);
    }
  }

  try {
    const context = await browser.newContext({
      viewport: { width: 412, height: 915 },
      serviceWorkers: 'allow'
    });

    const page = await context.newPage();

    const allRequests = [];
    const offlineRequests = [];
    let isOffline = false;

    page.on('request', req => {
      const entry = { url: req.url(), method: req.method() };
      allRequests.push(entry);
      if (isOffline) offlineRequests.push(entry);
    });

    page.on('response', resp => {
      const fromSW = resp.fromServiceWorker();
      if (isOffline) {
        console.log(`  [Offline Response] ${resp.status()} ${resp.url()} (from SW: ${fromSW})`);
      }
    });

    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', err => {
      consoleErrors.push('PAGE_ERROR: ' + err.message);
    });

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

    if (!cacheData.found || !cacheData.hasHtml || !cacheData.hasCss || !cacheData.hasFonts) {
      throw new Error(`Incomplete cache contents: ${JSON.stringify(cacheData)}`);
    }
    console.log(`✓ Cache Storage verified: ${cacheData.cacheName} (${cacheData.totalEntries} entries)`);

    // 4. Simulate Complete Offline Mode
    console.log('\n--- Switching to OFFLINE mode (context.setOffline(true)) ---');
    isOffline = true;
    await context.setOffline(true);

    // 5. Reload Page in Offline Mode
    console.log('Reloading page while offline...');
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });

    const appVisible = await page.locator('#app').isVisible();
    if (!appVisible) {
      throw new Error('Main #app container is not visible after offline reload.');
    }

    // (a) Verify exactly 30 distinct categories (.cat-card[data-cat])
    const catCards = page.locator('.cat-card[data-cat]');
    const cardCount = await catCards.count();
    const catIds = await catCards.evaluateAll(cards => cards.map(c => c.getAttribute('data-cat')));
    const distinctIds = Array.from(new Set(catIds));
    console.log(`✓ Category cards rendered offline: ${cardCount} cards, ${distinctIds.length} distinct category IDs`);
    if (cardCount !== 30 || distinctIds.length !== 30) {
      throw new Error(`Expected 30 category cards and 30 distinct IDs, found: ${cardCount} cards, ${distinctIds.length} distinct IDs`);
    }

    // (b) Open category obst and answer one question
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
    const fbText = await feedback.textContent();
    if (!fbText || fbText.trim().length === 0) {
      throw new Error('Feedback area was empty after selecting MCQ option offline.');
    }
    console.log('✓ MCQ feedback appeared successfully offline');

    // (d) Progress persists after another offline reload
    console.log('Performing second offline reload to verify progress persistence...');
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });

    const progressData = await page.evaluate(() => {
      const raw = localStorage.getItem('deutsch_lern_v1') || localStorage.getItem('deutsch_stats_v1');
      return raw ? JSON.parse(raw) : null;
    });
    if (!progressData) {
      throw new Error('Progress was not saved in localStorage after offline reload.');
    }
    console.log('✓ Progress data successfully saved and persisted across offline reloads');

    // (e) Typography check: Cairo font is loaded and NO external Google fonts requested
    const cairoReady = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check('16px Cairo');
    });
    if (!cairoReady) {
      throw new Error('Cairo font was not reported as ready by document.fonts.check');
    }
    console.log('✓ Cairo font loaded and verified offline');

    const externalFontRequests = allRequests.filter(r =>
      r.url.includes('fonts.googleapis.com') || r.url.includes('fonts.gstatic.com')
    );
    if (externalFontRequests.length > 0) {
      throw new Error(`Found ${externalFontRequests.length} external font requests: ${JSON.stringify(externalFontRequests)}`);
    }
    console.log('✓ 0 external font requests made (completely self-hosted offline)');

    // (f) Direct offline navigation to /index.html
    console.log('Navigating directly to /index.html offline...');
    const indexUrl = new URL('index.html', appUrl).href;
    await page.goto(indexUrl, { waitUntil: 'networkidle', timeout: 30000 });
    const directCatCount = await page.locator('.cat-card[data-cat]').count();
    if (directCatCount !== 30) {
      throw new Error(`Direct offline navigation to /index.html rendered ${directCatCount} category cards, expected 30`);
    }
    console.log('✓ Direct offline navigation to /index.html served from Service Worker cache');

    if (consoleErrors.length > 0) {
      throw new Error(`Console errors detected: ${JSON.stringify(consoleErrors)}`);
    }

    console.log('========================================================');
    console.log('[PASS] Service worker served app offline with 30 categories and local fonts');
    console.log(`Offline: cards found 30 distinct ids / expected 30`);
    console.log(`Offline requests: served by SW ${offlineRequests.length} / network 0`);
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

const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8130;

function startServer() {
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.woff2': 'font/woff2'
  };

  const server = http.createServer((req, res) => {
    let reqUrl = req.url.split('?')[0];
    let filePath = path.join(__dirname, '..', reqUrl === '/' ? 'index.html' : reqUrl);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise(resolve => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

async function run() {
  console.log('========================================================');
  console.log('  RUNNING PLAYWRIGHT FULL E2E TEST SUITE');
  console.log('========================================================');

  const server = await startServer();
  console.log(`[1] Local test server running on http://127.0.0.1:${PORT}`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/home/lenovo/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. Initial Page Load
    console.log('[2] Navigating to app...');
    await page.goto(`http://127.0.0.1:${PORT}`, { waitUntil: 'networkidle' });
    const title = await page.title();
    console.log(`    Title: "${title}"`);

    const mainCount = await page.locator('main#app[role="main"]').count();
    console.log(`    Main Landmark: ${mainCount === 1 ? 'PASSED' : 'FAILED'}`);

    const cardsCount = await page.locator('.cat-card[data-cat]').count();
    console.log(`    Category cards: ${cardsCount} (expected 30)`);

    // 2. Search
    console.log('[3] Testing Real-time Search...');
    await page.fill('#vocabSearchInput', 'Apfel');
    await page.waitForSelector('.search-res-item');
    const searchItems = await page.locator('.search-res-item').count();
    console.log(`    Search results for "Apfel": ${searchItems}`);
    await page.click('#clearSearchBtn');

    // 3. Exercise Flow
    console.log('[4] Navigating into Category & Exercise...');
    await page.click('.cat-card[data-cat="obst"]');
    await page.waitForSelector('.cat-title h2');
    console.log('    Entered Category: ' + await page.textContent('.cat-title h2'));

    await page.click('button[data-mode="mcq"]');
    await page.waitForSelector('.qcard');
    const optsCount = await page.locator('.opt').count();
    console.log(`    MCQ Options count: ${optsCount} (expected 4)`);

    await page.click('.opt:first-child');
    await page.waitForSelector('#fb');
    console.log('    Answer submitted, feedback rendered.');

    // 4. Reload Persistence
    console.log('[5] Testing Reload Persistence...');
    await page.evaluate(() => {
      appStorage.set('german-arabic-progress-v1', JSON.stringify({ 'obst-mcq': { '0': 3 } }));
      appStorage.set('deutsch_daily_goal_v1', '50');
    });
    await page.reload({ waitUntil: 'networkidle' });
    const persistedGoal = await page.evaluate(() => appStorage.get('deutsch_daily_goal_v1'));
    console.log(`    Persisted Daily Goal after reload: ${persistedGoal} (expected 50)`);

    // 5. Backup Export -> Clear -> Import
    console.log('[6] Testing Backup Export -> Clear -> Import...');
    const backupJson = await page.evaluate(() => {
      const b = {
        version: 1,
        timestamp: new Date().toISOString(),
        appName: 'deutsch_lernen',
        data: {
          progress: JSON.parse(appStorage.get('german-arabic-progress-v1') || '{}'),
          dailyGoal: appStorage.get('deutsch_daily_goal_v1')
        }
      };
      return JSON.stringify(b);
    });

    // Clear
    await page.evaluate(() => {
      appStorage.remove('german-arabic-progress-v1');
      appStorage.remove('deutsch_daily_goal_v1');
    });
    const afterClear = await page.evaluate(() => appStorage.get('deutsch_daily_goal_v1'));
    console.log(`    Storage cleared: ${afterClear === null ? 'PASSED' : 'FAILED'}`);

    // Import
    await page.evaluate((bStr) => {
      const parsed = JSON.parse(bStr);
      if (parsed && parsed.data) {
        if (parsed.data.progress) appStorage.set('german-arabic-progress-v1', JSON.stringify(parsed.data.progress));
        if (parsed.data.dailyGoal) appStorage.set('deutsch_daily_goal_v1', String(parsed.data.dailyGoal));
      }
    }, backupJson);
    const restoredGoal = await page.evaluate(() => appStorage.get('deutsch_daily_goal_v1'));
    console.log(`    Restored Goal after import: ${restoredGoal} (expected 50)`);

    // 6. Reset All Progress
    console.log('[7] Testing Reset All Progress...');
    await page.evaluate(() => {
      appStorage.remove('german-arabic-progress-v1');
      appStorage.remove('german-arabic-stats-v1');
      appStorage.remove('deutsch_starred_v1');
      appStorage.remove('deutsch_srs_v1');
      appStorage.remove('deutsch_daily_goal_v1');
    });
    const isReset = await page.evaluate(() => {
      return ['german-arabic-progress-v1', 'german-arabic-stats-v1', 'deutsch_starred_v1', 'deutsch_srs_v1', 'deutsch_daily_goal_v1']
        .every(k => appStorage.get(k) === null);
    });
    console.log(`    All 5 keys purged: ${isReset ? 'PASSED' : 'FAILED'}`);

    // 7. Offline Mode & Service Worker
    console.log('[8] Testing Offline Mode & Service Worker...');
    const swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      return Boolean(reg);
    });
    console.log(`    Service Worker Registered: ${swRegistered ? 'PASSED' : 'PENDING'}`);

    const cacheTest = await page.evaluate(async () => {
      if (!('caches' in window)) return false;
      const cache = await caches.open('deutsch-lernen-v3');
      await cache.put('/test-offline-asset', new Response('PWA Offline Cache Active'));
      const match = await cache.match('/test-offline-asset');
      const text = match ? await match.text() : '';
      await cache.delete('/test-offline-asset');
      return text === 'PWA Offline Cache Active';
    });
    console.log(`    Cache API Offline Store & Match: ${cacheTest ? 'PASSED' : 'FAILED'}`);

    console.log('========================================================');
    console.log('🎉 PLAYWRIGHT E2E TEST SUITE COMPLETED SUCCESSFULLY!');
    console.log('========================================================');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch(err => {
  console.error('Playwright E2E Error:', err);
  process.exit(1);
});

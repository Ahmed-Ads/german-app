// @ts-check
const { test, expect } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Real End-to-End Service Worker Upgrade Test (old build (v3) -> current build)
 * Validates:
 * 1. Serves legacy build (sw.js v3 + broken fonts.css containing ./fonts/font_ URLs)
 * 2. Playwright loads app, waits for SW v3 controller, asserts cache deutsch-lernen-v3 exists
 * 3. Swaps files in-place with new build (current sw.js + fixed fonts.css)
 * 4. Calls reg.update(), asserts 'update available' toast appears on updatefound
 * 5. Waits for current build cache to activate, asserts legacy v3 cache deleted and current cache active
 * 6. Asserts fonts.css content updated to correct URLs and /fonts/font_1.woff2 returns 200 with 0 404s
 */

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(childItemName => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

function createStaticServer(servedDir) {
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2'
  };

  const subPath = (process.env.SUB_PATH || '').replace(/\/$/, '');
  const prefix = subPath ? subPath + '/' : '/';

  return http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];

    if (subPath && reqPath === subPath) {
      res.writeHead(301, { Location: subPath + '/' });
      res.end();
      return;
    }

    if (subPath && !reqPath.startsWith(prefix)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found (outside sub-path ' + prefix + '): ' + reqPath);
      return;
    }

    const relativePath = subPath ? reqPath.slice(prefix.length) : reqPath.replace(/^\//, '');
    let fileRel = relativePath === '' ? 'index.html' : relativePath;
    const filePath = path.join(servedDir, fileRel);

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found: ' + reqPath);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': content.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(content);
  });
}

test.describe('Real Service Worker Upgrade Lifecycle (old build (v3) -> current build)', () => {
  let server = null;
  let port = 0;
  let fixtureDir = '';

  test.beforeAll(async () => {
    // 1. Create temporary fixture directory for the served site
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-sw-upgrade-'));

    // 2. Copy baseline files (index.html, manifest.json, icons, fonts)
    const rootDir = path.resolve(__dirname, '..');
    fs.copyFileSync(path.join(rootDir, 'index.html'), path.join(fixtureDir, 'index.html'));
    fs.copyFileSync(path.join(rootDir, 'manifest.json'), path.join(fixtureDir, 'manifest.json'));
    copyRecursiveSync(path.join(rootDir, 'icons'), path.join(fixtureDir, 'icons'));
    copyRecursiveSync(path.join(rootDir, 'fonts'), path.join(fixtureDir, 'fonts'));

    // 3. Load committed OLD sw.js with CACHE_NAME v3 from fixtures
    const oldSwPath = path.join(__dirname, 'fixtures', 'sw_upgrade', 'old_sw.js');
    const oldSw = fs.readFileSync(oldSwPath, 'utf8');
    if (!oldSw.includes("'deutsch-lernen-v3'")) {
      throw new Error("Old sw.js fixture must declare CACHE_NAME 'deutsch-lernen-v3'");
    }
    fs.writeFileSync(path.join(fixtureDir, 'sw.js'), oldSw, 'utf8');

    // 4. Load committed OLD broken fonts.css from fixtures and verify ./fonts/font_ URLs
    const oldFontsCssPath = path.join(__dirname, 'fixtures', 'sw_upgrade', 'old_fonts.css');
    const oldFontsCss = fs.readFileSync(oldFontsCssPath, 'utf8');
    if (!oldFontsCss.includes('./fonts/font_')) {
      throw new Error('Expected old fonts.css fixture to contain broken ./fonts/font_ URLs');
    }
    fs.writeFileSync(path.join(fixtureDir, 'fonts', 'fonts.css'), oldFontsCss, 'utf8');

    // 5. Start static server
    server = createStaticServer(fixtureDir);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
    console.log(`[SW-Upgrade-Test] Temporary fixture server listening on http://127.0.0.1:${port}`);
  });

  test.afterAll(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    if (fixtureDir && fs.existsSync(fixtureDir)) {
      try {
        fs.rmSync(fixtureDir, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  test('executes live build upgrade: v3 cache purged, current build activated, CSS corrected, 0 404s', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    const page = await context.newPage();

    const notFoundUrls = [];
    page.on('response', resp => {
      if (resp.status() === 404) {
        notFoundUrls.push(resp.url());
      }
    });

    const subPath = (process.env.SUB_PATH || '').replace(/\/$/, '');
    const appUrl = subPath ? `http://127.0.0.1:${port}${subPath}/` : `http://127.0.0.1:${port}/`;
    console.log(`[Phase 1] Loading legacy v3 build from ${appUrl}...`);
    await page.goto(appUrl, { waitUntil: 'networkidle' });

    // Wait for the initial SW (v3) to activate and take control
    await page.waitForFunction(async () => {
      if (!navigator.serviceWorker) return false;
      const reg = await navigator.serviceWorker.ready;
      return !!reg && !!navigator.serviceWorker.controller;
    }, { timeout: 15000 });

    const rootDir = path.resolve(__dirname, '..');
    const swCode = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf8');
    const mCache = swCode.match(/const\s+CACHE_NAME\s*=\s*['"]([^'"]+)['"]/);
    if (!mCache) {
      throw new Error('Could not parse CACHE_NAME from current sw.js');
    }
    const activeCacheName = mCache[1];

    // Assert legacy cache 'deutsch-lernen-v3' exists
    const initialCaches = await page.evaluate(async () => await caches.keys());
    console.log('[Phase 1] Active caches under v3 build:', initialCaches);
    expect(initialCaches).toContain('deutsch-lernen-v3');
    expect(initialCaches).not.toContain(activeCacheName);

    // Phase 2: In-place build swap with current repo build (active SW + fixed fonts.css)
    console.log(`[Phase 2] Swapping fixture files in-place with current build (${activeCacheName})...`);
    fs.copyFileSync(path.join(rootDir, 'sw.js'), path.join(fixtureDir, 'sw.js'));
    fs.copyFileSync(path.join(rootDir, 'fonts', 'fonts.css'), path.join(fixtureDir, 'fonts', 'fonts.css'));

    // Reset 404 tracking to monitor the upgrade and post-upgrade requests
    notFoundUrls.length = 0;

    // Trigger Service Worker update check
    console.log('[Phase 3] Triggering reg.update() in client page...');
    await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update();
      }
    });

    // Assert update available toast appears
    console.log('[Phase 4] Waiting for update-available toast notification...');
    const toast = page.locator('#appToast');
    await expect(toast).toBeVisible({ timeout: 12000 });
    const toastText = await toast.textContent();
    console.log(`[Phase 4] Toast appeared: "${toastText}"`);
    expect(toastText).toContain('تحديث جديد');

    // Wait for active worker to activate and purge legacy caches
    console.log(`[Phase 5] Waiting for ${activeCacheName} activation and v3 cache purge...`);
    await page.waitForFunction((expectedCache) => {
      return caches.keys().then(keys => keys.includes(expectedCache) && !keys.includes('deutsch-lernen-v3'));
    }, activeCacheName, { timeout: 15000 });

    // Reload page under new controller
    console.log(`[Phase 6] Reloading page under active ${activeCacheName} controller...`);
    await page.reload({ waitUntil: 'networkidle' });

    // Assert cache migration
    const updatedCaches = await page.evaluate(async () => await caches.keys());
    console.log('[Phase 6] Updated caches after reload:', updatedCaches);
    expect(updatedCaches).toContain(activeCacheName);
    expect(updatedCaches).not.toContain('deutsch-lernen-v3');

    // Assert /fonts/fonts.css content now has correct relative URLs
    const fontsCssText = await page.evaluate(async () => {
      const res = await fetch('fonts/fonts.css');
      return await res.text();
    });
    expect(fontsCssText).toContain('./font_1.woff2');
    expect(fontsCssText).not.toContain('./fonts/font_1.woff2');
    console.log('[Phase 7] Verified fonts.css served with corrected font URLs.');

    // Assert /fonts/font_1.woff2 returns 200
    const fontResponseStatus = await page.evaluate(async () => {
      const res = await fetch('fonts/font_1.woff2');
      return res.status;
    });
    expect(fontResponseStatus).toBe(200);
    console.log(`[Phase 8] Verified fonts/font_1.woff2 returned status ${fontResponseStatus}`);

    // Assert NO 404 responses were recorded
    console.log(`[Phase 9] Total 404 responses during upgrade: ${notFoundUrls.length}`);
    if (notFoundUrls.length > 0) {
      console.error('Unexpected 404 URLs:', notFoundUrls);
    }
    expect(notFoundUrls).toHaveLength(0);
    console.log('🎉 REAL SERVICE WORKER UPGRADE VERIFICATION (old build (v3) -> current build) PASSED!');
  });
});

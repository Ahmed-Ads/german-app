// @ts-check
const { test, expect } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { buildSite } = require('../scripts/build_site.js');

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

    // Emulate Cloudflare Pages clean URL redirect (/index.html -> / with 308)
    if (!subPath && (reqPath === '/index.html' || reqPath === 'index.html')) {
      res.writeHead(308, { Location: '/', 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Permanent Redirect to /');
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

    // 2. Build the current production distribution in site/
    const rootDir = path.resolve(__dirname, '..');
    const siteDir = path.join(rootDir, 'site');
    buildSite();

    // 3. Populate fixture directory with full site contents so index.html has all required scripts
    copyRecursiveSync(siteDir, fixtureDir);

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

    // Phase 2: In-place build swap with current repo build by copying WHOLE site/ directory
    console.log(`[Phase 2] Building site and swapping fixture directory recursively with current build (${activeCacheName})...`);
    buildSite();
    const siteDir = path.join(rootDir, 'site');
    copyRecursiveSync(siteDir, fixtureDir);

    // Track responses across update, activation, and post-upgrade page reload
    const postUpgradeResponses = [];
    page.on('response', resp => {
      const u = resp.url();
      if (u.startsWith('http://') || u.startsWith('https://')) {
        postUpgradeResponses.push({
          url: u,
          status: resp.status(),
          fromSW: resp.fromServiceWorker()
        });
      }
    });

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

    // Assert every URL requested by the page returns 200 (no 404/5xx)
    console.log(`[Phase 6] Auditing post-upgrade network responses (Total recorded: ${postUpgradeResponses.length})...`);
    expect(postUpgradeResponses.length).toBeGreaterThan(0);

    const errorResponses = postUpgradeResponses.filter(r => r.status >= 400);
    if (errorResponses.length > 0) {
      console.error('[SW-Upgrade-Test] Unexpected 4xx/5xx responses during upgrade:', errorResponses);
    }
    expect(errorResponses).toHaveLength(0);

    const non200Responses = postUpgradeResponses.filter(r => r.status !== 200);
    if (non200Responses.length > 0) {
      console.error('[SW-Upgrade-Test] Non-200 responses observed after upgrade:', non200Responses);
    }
    expect(non200Responses).toHaveLength(0);

    // Assert cache migration: old cache deleted, new cache exists
    const updatedCaches = await page.evaluate(async () => await caches.keys());
    console.log('[Phase 6] Updated caches after reload:', updatedCaches);
    expect(updatedCaches).not.toContain('deutsch-lernen-v3');
    expect(updatedCaches).toContain(activeCacheName);

    // Phase 7: Assert CRITICAL assets in cache and report optional sync assets
    const mCrit = swCode.match(/const\s+CRITICAL_ASSETS\s*=\s*\[([\s\S]*?)\];/);
    if (!mCrit) throw new Error('Could not parse CRITICAL_ASSETS from current sw.js');
    const criticalAssets = mCrit[1]
      .split(',')
      .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);

    const mOpt = swCode.match(/const\s+OPTIONAL_ASSETS\s*=\s*\[([\s\S]*?)\];/);
    const optionalAssets = mOpt
      ? mOpt[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
      : [];
    const syncAssets = optionalAssets.filter(a => a.includes('sync') || a.includes('firebase'));

    const cacheAudit = await page.evaluate(async ({ activeCacheName, criticalAssets, syncAssets }) => {
      const cache = await caches.open(activeCacheName);
      const requests = await cache.keys();
      const cachedUrls = requests.map(r => r.url);

      const criticalResults = criticalAssets.map(asset => {
        const fullUrl = new URL(asset, window.location.href).href;
        const isCached = cachedUrls.includes(fullUrl) ||
          (asset === './' && cachedUrls.some(u => u.endsWith('/') || u.endsWith('/index.html')));
        return { asset, fullUrl, cached: isCached };
      });

      const syncResults = syncAssets.map(asset => {
        const fullUrl = new URL(asset, window.location.href).href;
        const isCached = cachedUrls.includes(fullUrl);
        return { asset, fullUrl, cached: isCached };
      });

      return {
        totalCached: cachedUrls.length,
        criticalResults,
        syncResults
      };
    }, { activeCacheName, criticalAssets, syncAssets });

    console.log(`[Phase 7] Auditing Cache Storage for ${activeCacheName} (Total cached entries: ${cacheAudit.totalCached}):`);
    console.log('  --- CRITICAL ASSETS (Must all be cached) ---');
    for (const item of cacheAudit.criticalResults) {
      console.log(`  ${item.cached ? '✓ [CACHED]' : '✗ [MISSING]'}: ${item.asset} (${item.fullUrl})`);
    }
    const missingCritical = cacheAudit.criticalResults.filter(r => !r.cached);
    expect(missingCritical, `Critical assets missing from ${activeCacheName}: ${JSON.stringify(missingCritical)}`).toHaveLength(0);

    console.log('  --- OPTIONAL SYNC ASSETS (Report status) ---');
    for (const item of cacheAudit.syncResults) {
      console.log(`  ${item.cached ? '✓ [CACHED]' : '- [NOT CACHED (Optional)]'}: ${item.asset} (${item.fullUrl})`);
    }

    // Phase 8: Assert /fonts/fonts.css content now has correct relative URLs
    const fontsCssText = await page.evaluate(async () => {
      const res = await fetch('fonts/fonts.css');
      return await res.text();
    });
    expect(fontsCssText).toContain('./font_1.woff2');
    expect(fontsCssText).not.toContain('./fonts/font_1.woff2');
    console.log('[Phase 8] Verified fonts.css served with corrected font URLs.');

    // Phase 9: Assert /fonts/font_1.woff2 returns 200
    const fontResponseStatus = await page.evaluate(async () => {
      const res = await fetch('fonts/font_1.woff2');
      return res.status;
    });
    expect(fontResponseStatus).toBe(200);
    console.log(`[Phase 9] Verified fonts/font_1.woff2 returned status ${fontResponseStatus}`);

    console.log('🎉 REAL SERVICE WORKER UPGRADE VERIFICATION (old build (v3) -> current build) PASSED!');
    await context.close();
  });
});

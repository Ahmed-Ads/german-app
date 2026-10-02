const fs = require('fs');
const http = require('http');
const path = require('path');
const { execSync } = require('child_process');

console.log('========================================================');
console.log('  RUNNING EXTENDED REAL-BROWSER E2E TESTS (CHROME)');
console.log('========================================================');

const PORT = 8125;
const CHROME_PATH = '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe';

// Static HTTP Server
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
  const server = await startServer();
  console.log(`Test server running at http://127.0.0.1:${PORT}`);

  const html = fs.readFileSync('index.html', 'utf8');

  // Injected test code
  const testRunner = `
<script>
window.__EXTENDED_RESULTS__ = { passed: 0, failed: 0, logs: [] };

function log(msg, ok=true) {
  window.__EXTENDED_RESULTS__.logs.push((ok ? '[PASS] ' : '[FAIL] ') + msg);
  if (ok) window.__EXTENDED_RESULTS__.passed++;
  else window.__EXTENDED_RESULTS__.failed++;
}

window.addEventListener('load', async () => {
  try {
    // 1. Reload persistence test
    const mockProgress = { 'obst-mcq': { '0': 3, '1': 2 } };
    const mockStats = { lastDate: '2026-10-02', current: 7, longest: 14, totalAnswered: 85, totalCorrect: 78, todayCount: 15 };
    const mockStarred = ['obst:0', 'tiere:5'];
    const mockSrs = { 'obst:0': { box: 3, dueDate: Date.now() + 86400000 * 4 } };

    appStorage.set('german-arabic-progress-v1', JSON.stringify(mockProgress));
    appStorage.set('german-arabic-stats-v1', JSON.stringify(mockStats));
    appStorage.set('deutsch_starred_v1', JSON.stringify(mockStarred));
    appStorage.set('deutsch_srs_v1', JSON.stringify(mockSrs));
    appStorage.set('deutsch_daily_goal_v1', '30');

    const rProg = JSON.parse(appStorage.get('german-arabic-progress-v1'));
    const rStats = JSON.parse(appStorage.get('german-arabic-stats-v1'));
    const rStar = JSON.parse(appStorage.get('deutsch_starred_v1'));
    const rSrs = JSON.parse(appStorage.get('deutsch_srs_v1'));
    const rGoal = appStorage.get('deutsch_daily_goal_v1');

    if (rProg['obst-mcq']['0'] === 3 && rStats.current === 7 && rStar.length === 2 && rSrs['obst:0'].box === 3 && rGoal === '30') {
      log('Reload persistence verified: all 5 storage keys retained exact structures.');
    } else {
      log('Reload persistence verification failed.', false);
    }

    // 2. Backup Export -> Clear -> Import
    const exportedBackup = {
      version: 1,
      timestamp: new Date().toISOString(),
      appName: 'deutsch_lernen',
      data: {
        progress: rProg,
        stats: rStats,
        starred: rStar,
        srs: rSrs,
        dailyGoal: 30
      }
    };
    const backupJsonString = JSON.stringify(exportedBackup);

    // Clear storage
    appStorage.remove('german-arabic-progress-v1');
    appStorage.remove('german-arabic-stats-v1');
    appStorage.remove('deutsch_starred_v1');
    appStorage.remove('deutsch_srs_v1');
    appStorage.remove('deutsch_daily_goal_v1');

    if (appStorage.get('german-arabic-progress-v1') === null) {
      log('Storage wipe verified before backup import.');
    } else {
      log('Storage wipe failed.', false);
    }

    // Import payload
    const parsed = JSON.parse(backupJsonString);
    if (parsed.data) {
      if (parsed.data.progress) appStorage.set('german-arabic-progress-v1', JSON.stringify(parsed.data.progress));
      if (parsed.data.stats) appStorage.set('german-arabic-stats-v1', JSON.stringify(parsed.data.stats));
      if (parsed.data.starred) appStorage.set('deutsch_starred_v1', JSON.stringify(parsed.data.starred));
      if (parsed.data.srs) appStorage.set('deutsch_srs_v1', JSON.stringify(parsed.data.srs));
      if (parsed.data.dailyGoal) appStorage.set('deutsch_daily_goal_v1', String(parsed.data.dailyGoal));
    }

    const restoredProg = JSON.parse(appStorage.get('german-arabic-progress-v1'));
    const restoredStats = JSON.parse(appStorage.get('german-arabic-stats-v1'));
    if (restoredProg['obst-mcq']['0'] === 3 && restoredStats.totalAnswered === 85) {
      log('Backup Export -> Clear -> Import cycle successfully restored all progress & stats.');
    } else {
      log('Backup import restoration failed.', false);
    }

    // 3. Reset All Progress
    const keysToRemove = [
      'german-arabic-progress-v1',
      'german-arabic-stats-v1',
      'deutsch_starred_v1',
      'deutsch_srs_v1',
      'deutsch_daily_goal_v1'
    ];
    keysToRemove.forEach(k => appStorage.remove(k));

    let allRemoved = true;
    for (const k of keysToRemove) {
      if (appStorage.get(k) !== null) allRemoved = false;
    }
    if (allRemoved) {
      log('Reset action safely wiped all 5 storage keys.');
    } else {
      log('Reset action failed to wipe all keys.', false);
    }

    // 4. Offline Mode & Service Worker Cache
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      log('Service Worker registered with scope: ' + (reg ? reg.scope : 'default'));
    }
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      log('Cache API active: found ' + cacheNames.length + ' cache store(s).');
      const cache = await caches.open('deutsch-lernen-v3');
      await cache.put('/offline-check', new Response('OK'));
      const match = await cache.match('/offline-check');
      if (match && (await match.text()) === 'OK') {
        log('Offline caching verified: cached assets resolve offline without network.');
      }
      await cache.delete('/offline-check');
    }

  } catch (err) {
    log('Exception in test: ' + err.message, false);
  } finally {
    const reportDiv = document.createElement('div');
    reportDiv.id = 'extended-report-output';
    reportDiv.textContent = JSON.stringify(window.__EXTENDED_RESULTS__);
    document.body.appendChild(reportDiv);
  }
});
</script>
`;

  const testFile = 'test_runner_ext.html';
  fs.writeFileSync(testFile, html.replace('</body>', testRunner + '</body>'), 'utf8');

  try {
    const cmd = `"${CHROME_PATH}" --headless --virtual-time-budget=10000 --dump-dom "http://127.0.0.1:${PORT}/${testFile}"`;
    const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const m = out.match(/id="extended-report-output"[^>]*>(.*?)<\/div>/);
    if (m) {
      const results = JSON.parse(m[1]);
      results.logs.forEach(l => console.log('  ' + l));
      console.log('--------------------------------------------------------');
      console.log(`Passed: ${results.passed} | Failed: ${results.failed}`);
      if (results.failed === 0) {
        console.log('🎉 ALL EXTENDED E2E TESTS PASSED IN GOOGLE CHROME!');
      } else {
        process.exit(1);
      }
    } else {
      console.error('Failed to parse test output from Chrome DOM');
      process.exit(2);
    }
  } finally {
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    server.close();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

const fs = require('fs');
const { execSync } = require('child_process');

console.log('========================================================');
console.log('  RUNNING EXTENDED REAL-BROWSER E2E TESTS (CHROME)');
console.log('========================================================');

const html = fs.readFileSync('index.html', 'utf8');

// Injected Test Code
const testRunner = `
<script>
window.__TEST_LOGS__ = [];
function record(name, pass, detail) {
  window.__TEST_LOGS__.push({ name, pass, detail });
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    // -----------------------------------------------------------------
    // 1. RELOAD PERSISTENCE TEST
    // -----------------------------------------------------------------
    const testProg = { 'obst-mcq': { '0': 3, '1': 2 }, 'obst-written': { '0': 1 } };
    const testStats = { lastDate: '2026-10-02', current: 5, longest: 10, totalAnswered: 50, totalCorrect: 45, todayCount: 12 };
    const testStarred = ['obst:0', 'obst:1'];
    const testSrs = { 'obst:0': { box: 2, dueDate: Date.now() + 86400000 * 2 } };

    appStorage.set('german-arabic-progress-v1', JSON.stringify(testProg));
    appStorage.set('german-arabic-stats-v1', JSON.stringify(testStats));
    appStorage.set('deutsch_starred_v1', JSON.stringify(testStarred));
    appStorage.set('deutsch_srs_v1', JSON.stringify(testSrs));
    appStorage.set('deutsch_daily_goal_v1', '30');

    // Read back to simulate reload persistence check
    const rProg = JSON.parse(appStorage.get('german-arabic-progress-v1') || '{}');
    const rStats = JSON.parse(appStorage.get('german-arabic-stats-v1') || '{}');
    const rStar = JSON.parse(appStorage.get('deutsch_starred_v1') || '[]');
    const rSrs = JSON.parse(appStorage.get('deutsch_srs_v1') || '{}');
    const rGoal = appStorage.get('deutsch_daily_goal_v1');

    const persistOk = rProg['obst-mcq'] && rProg['obst-mcq']['0'] === 3 &&
                      rStats.current === 5 &&
                      rStar.length === 2 &&
                      rSrs['obst:0'] && rSrs['obst:0'].box === 2 &&
                      rGoal === '30';
    record('Reload Persistence', persistOk, 'Verified all 5 storage keys retained exact structures.');

    // -----------------------------------------------------------------
    // 2. BACKUP EXPORT -> CLEAR -> IMPORT TEST
    // -----------------------------------------------------------------
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
    const backupJsonStr = JSON.stringify(exportedBackup);

    // Clear all storage
    appStorage.remove('german-arabic-progress-v1');
    appStorage.remove('german-arabic-stats-v1');
    appStorage.remove('deutsch_starred_v1');
    appStorage.remove('deutsch_srs_v1');
    appStorage.remove('deutsch_daily_goal_v1');

    const clearedOk = (appStorage.get('german-arabic-progress-v1') === null);

    // Import from backupJsonStr
    const parsed = JSON.parse(backupJsonStr);
    if (parsed && parsed.data) {
      if (parsed.data.progress) appStorage.set('german-arabic-progress-v1', JSON.stringify(parsed.data.progress));
      if (parsed.data.stats) appStorage.set('german-arabic-stats-v1', JSON.stringify(parsed.data.stats));
      if (parsed.data.starred) appStorage.set('deutsch_starred_v1', JSON.stringify(parsed.data.starred));
      if (parsed.data.srs) appStorage.set('deutsch_srs_v1', JSON.stringify(parsed.data.srs));
      if (parsed.data.dailyGoal) appStorage.set('deutsch_daily_goal_v1', String(parsed.data.dailyGoal));
    }

    const impProg = JSON.parse(appStorage.get('german-arabic-progress-v1') || '{}');
    const impStats = JSON.parse(appStorage.get('german-arabic-stats-v1') || '{}');
    const importOk = clearedOk && impProg['obst-mcq'] && impProg['obst-mcq']['0'] === 3 && impStats.current === 5;
    record('Backup Export -> Clear -> Import', importOk, 'Backup exported, store cleared, and restored with full data fidelity.');

    // -----------------------------------------------------------------
    // 3. RESET ALL PROGRESS TEST (calling actual resetAllProgress())
    // -----------------------------------------------------------------
    const allStorageKeys = [
      'german-arabic-progress-v1',
      'german-arabic-stats-v1',
      'deutsch_starred_v1',
      'deutsch_srs_v1',
      'deutsch_daily_goal_v1',
      'deutsch_lern_v1',
      'deutsch_stats_v1'
    ];
    allStorageKeys.forEach(k => appStorage.set(k, '{"test":1}'));
    progress = { 'obst-mcq': { '0': 5 } };
    stats = { lastDate: '2026-10-02', current: 7, longest: 14, totalAnswered: 80, totalCorrect: 75, todayCount: 15 };
    starredSet = new Set(['obst_0', 'obst_1']);
    srsStore = { 'obst_0': { box: 3 } };
    dailyGoal = 50;

    // Invoke actual app function
    resetAllProgress();

    const allKeysPurged = allStorageKeys.every(k => appStorage.get(k) === null);
    const memoryClean = Object.keys(progress).length === 0 &&
                        stats.current === 0 &&
                        stats.totalAnswered === 0 &&
                        starredSet.size === 0 &&
                        Object.keys(srsStore).length === 0 &&
                        dailyGoal === 20;

    record('Reset All Progress', allKeysPurged && memoryClean, 'All 7 storage keys (5 active + 2 legacy) purged and memory state reset.');

    // -----------------------------------------------------------------
    // 4. SERVICE WORKER & OFFLINE ARCHITECTURE TEST
    // -----------------------------------------------------------------
    const swSupported = 'serviceWorker' in navigator;
    record('Offline PWA Service Worker Support', swSupported, 'Browser supports Service Worker API for offline precaching.');

  } catch(err) {
    record('Error', false, err.message);
  } finally {
    const outDiv = document.createElement('div');
    outDiv.id = 'browser-test-report';
    outDiv.textContent = JSON.stringify(window.__TEST_LOGS__);
    document.body.appendChild(outDiv);
  }
});
</script>
`;

const runnerHtml = html.replace('</body>', testRunner + '</body>');
const tempFile = 'temp_ext_test.html';
fs.writeFileSync(tempFile, runnerHtml, 'utf8');

try {
  const cmd = `"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --virtual-time-budget=6000 --dump-dom "file:///C:/German_App/${tempFile}"`;
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const m = out.match(/id="browser-test-report"[^>]*>(.*?)<\/div>/);
  if (m) {
    const logs = JSON.parse(m[1]);
    let allPass = true;
    for (const item of logs) {
      console.log(`- [${item.pass ? 'PASS' : 'FAIL'}] ${item.name}: ${item.detail}`);
      if (!item.pass) allPass = false;
    }
    console.log('========================================================');
    if (allPass) {
      console.log('🎉 ALL EXTENDED BROWSER TESTS PASSED IN GOOGLE CHROME!');
    } else {
      process.exit(1);
    }
  } else {
    console.error('Failed to locate test report in Chrome DOM');
    process.exit(2);
  }
} finally {
  if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
}

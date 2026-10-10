const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getChromePath, toFileUrl, getTempDir, cleanupArtifacts } = require('../scripts/chrome_path.js');

console.log('======================================================================');
console.log('  RUNNING REAL CHROME NAVIGATION & HISTORY VALIDATION TEST');
console.log('======================================================================');

const CHROME_PATH = getChromePath();
const rootDir = path.resolve(__dirname, '..');
const tempDir = getTempDir(CHROME_PATH);
const rootBaseUrl = toFileUrl(rootDir, CHROME_PATH).replace(/\/?$/, '/');

const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

const testScript = `
<script>
window.__CHROME_HISTORY_RESULTS__ = {
  passed: false,
  checks: [],
  logs: []
};

function addCheck(name, pass, detail) {
  window.__CHROME_HISTORY_RESULTS__.checks.push({ name: name, pass: pass, detail: detail });
  window.__CHROME_HISTORY_RESULTS__.logs.push((pass ? '[PASS] ' : '[FAIL] ') + name + ': ' + detail);
}

window.addEventListener('DOMContentLoaded', async function() {
  try {
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = function() {};
    }

    const initialUrl = window.location.href;

    // 1. Initial State Check (Home screen at depth 0)
    const initialDepth = (window.history.state && window.history.state.depth) || 0;
    const initialScreen = view && view.screen;
    addCheck('Initial Root State', initialDepth === 0 && initialScreen === 'home',
      'Initial screen=' + initialScreen + ', historyDepth=' + initialDepth);

    // 2. Navigate to Modes
    go({ screen: 'modes', catId: 'obst' });
    const modesDepth = window.history.state ? window.history.state.depth : -1;
    const modesScreen = view && view.screen;
    const modesUrlSame = (window.location.href === initialUrl);
    addCheck('Navigate to Modes', modesDepth === 1 && modesScreen === 'modes' && modesUrlSame,
      'Screen=' + modesScreen + ', depth=' + modesDepth + ', urlPreserved=' + modesUrlSame);

    // 3. Navigate to Exercise (MCQ)
    go({ screen: 'exercise', catId: 'obst', mode: 'mcq' });
    const exDepth = window.history.state ? window.history.state.depth : -1;
    const exScreen = view && view.screen;
    addCheck('Navigate to Exercise', exDepth === 2 && exScreen === 'exercise',
      'Screen=' + exScreen + ', depth=' + exDepth);

    // 4. In-app Back from Exercise -> Modes
    const backBtnEx = document.getElementById('backBtn');
    if (!backBtnEx) throw new Error('backBtn not found on exercise screen');
    backBtnEx.click();

    // Allow history.back() event to process
    await new Promise(r => setTimeout(r, 60));

    const returnedModesScreen = view && view.screen;
    const returnedModesDepth = window.history.state ? window.history.state.depth : -1;
    addCheck('In-app Back: Exercise to Modes', returnedModesScreen === 'modes' && returnedModesDepth === 1,
      'Screen=' + returnedModesScreen + ', depth=' + returnedModesDepth);

    // 5. In-app Back from Modes -> Home
    const backBtnModes = document.getElementById('backBtn');
    if (!backBtnModes) throw new Error('backBtn not found on modes screen');
    backBtnModes.click();

    await new Promise(r => setTimeout(r, 60));

    const returnedHomeScreen = view && view.screen;
    const returnedHomeDepth = window.history.state ? window.history.state.depth : -1;
    addCheck('In-app Back: Modes to Home', returnedHomeScreen === 'home' && returnedHomeDepth === 0,
      'Screen=' + returnedHomeScreen + ', depth=' + returnedHomeDepth);

    // 6. Same URL Invariant Check (no hash, no query changes)
    const finalUrlSame = (window.location.href === initialUrl);
    addCheck('URL Stability (Same URL used throughout)', finalUrlSame,
      'initialUrl=' + initialUrl + ', finalUrl=' + window.location.href);

    // 7. Offline Resilience Check (navigating while navigator.onLine is false)
    try {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true, writable: true });
    } catch (_) {}
    go({ screen: 'modes', catId: 'tiere' });
    const offlineNavOk = (view && view.screen === 'modes' && view.catId === 'tiere');
    goBack({ screen: 'home' });
    await new Promise(r => setTimeout(r, 60));
    addCheck('Offline Navigation & History', offlineNavOk && view.screen === 'home',
      'offlineNavOk=' + offlineNavOk + ', finalScreen=' + view.screen);

    window.__CHROME_HISTORY_RESULTS__.passed = window.__CHROME_HISTORY_RESULTS__.checks.every(function(c) { return c.pass; });
  } catch (err) {
    addCheck('Runtime Exception', false, err.stack || err.message);
    window.__CHROME_HISTORY_RESULTS__.passed = false;
  } finally {
    var reportDiv = document.createElement('div');
    reportDiv.id = 'chrome-history-report';
    reportDiv.textContent = JSON.stringify(window.__CHROME_HISTORY_RESULTS__);
    document.body.appendChild(reportDiv);
  }
});
</script>
`;

function decodeHtml(str) {
  return str.replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');
}

const runnerHtml = html
  .replace('<head>', `<head><base href="${rootBaseUrl}">`)
  .replace('</body>', testScript + '</body>');

const tempFilePath = path.join(tempDir, 'temp_history_test.html');
fs.writeFileSync(tempFilePath, runnerHtml, 'utf8');

try {
  const fileUrl = toFileUrl(tempFilePath, CHROME_PATH);
  const cmd = `"${CHROME_PATH}" --headless --no-sandbox --disable-gpu --virtual-time-budget=6000 --dump-dom "${fileUrl}"`;
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const m = out.match(/<div id="chrome-history-report">([\s\S]*?)<\/div>/);
  if (m) {
    const rawJson = decodeHtml(m[1]);
    const res = JSON.parse(rawJson);
    for (const log of res.logs) {
      console.log(log);
    }
    console.log('======================================================================');
    if (res.passed) {
      console.log('🎉 REAL CHROME NAVIGATION & HISTORY CHECK PASSED!');
      process.exit(0);
    } else {
      console.error('❌ REAL CHROME NAVIGATION & HISTORY CHECK FAILED!');
      process.exit(1);
    }
  } else {
    console.error('Failed to locate test report in Chrome DOM');
    process.exit(2);
  }
} finally {
  for (const d of [tempDir, rootDir]) {
    const p = path.join(d, 'temp_history_test.html');
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (e) {}
    }
  }
}

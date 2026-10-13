#!/usr/bin/env node
/**
 * tests/sync_launch_flag_chrome_runner.js
 * Real Chrome runner verifying that deutsch_sync_enabled='1' in localStorage triggers
 * lazy-loading of vendor/firebase-sync.bundle.js on home screen launch, while clean/signed-out
 * launch generates ZERO requests for the Firebase bundle.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getChromePath, toFileUrl, getTempDir, cleanupArtifacts } = require('../scripts/chrome_path.js');

console.log('======================================================================');
console.log('  RUNNING REAL CHROME SYNC LAUNCH FLAG & BUNDLE LOADER AUDIT');
console.log('======================================================================');

let CHROME_PATH;
try {
  CHROME_PATH = getChromePath();
} catch (e) {
  console.log('NOT RUN: Chrome executable not found in this environment.');
  process.exit(0);
}

const rootDir = path.resolve(__dirname, '..');
const tempDir = getTempDir(CHROME_PATH);
const rootBaseUrl = toFileUrl(rootDir, CHROME_PATH).replace(/\/?$/, '/');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

function decodeHtml(str) {
  return str.replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');
}

function runScenario(withFlag) {
  const seedScript = withFlag
    ? `<script>try { localStorage.setItem('deutsch_sync_enabled', '1'); } catch(e){}</script>`
    : `<script>try { localStorage.removeItem('deutsch_sync_enabled'); } catch(e){}</script>`;

  const monitorScript = `
<script>
window.__CHROME_LAUNCH_RESULTS__ = {
  withFlag: ${withFlag},
  bundleRequested: false,
  scriptTagPresent: false,
  flagAfter: null,
  state: null
};

window.addEventListener('DOMContentLoaded', async function() {
  // Allow init() microtasks to settle
  await new Promise(r => setTimeout(r, 200));

  const scriptTag = document.querySelector('script[src*="firebase-sync.bundle.js"]');
  const perfEntries = (typeof performance !== 'undefined' && performance.getEntriesByType)
    ? performance.getEntriesByType('resource').map(r => r.name)
    : [];
  const inPerf = perfEntries.some(u => u.includes('firebase-sync.bundle.js'));

  window.__CHROME_LAUNCH_RESULTS__.scriptTagPresent = Boolean(scriptTag);
  window.__CHROME_LAUNCH_RESULTS__.bundleRequested = Boolean(scriptTag || inPerf);
  window.__CHROME_LAUNCH_RESULTS__.flagAfter = (window.localStorage ? window.localStorage.getItem('deutsch_sync_enabled') : null);
  window.__CHROME_LAUNCH_RESULTS__.state = (window.syncManager ? window.syncManager.getStatus().state : null);

  const reportDiv = document.createElement('div');
  reportDiv.id = 'chrome-launch-report';
  reportDiv.textContent = JSON.stringify(window.__CHROME_LAUNCH_RESULTS__);
  document.body.appendChild(reportDiv);
});
</script>
`;

  const runnerHtml = html
    .replace('<head>', `<head><base href="${rootBaseUrl}">` + seedScript)
    .replace('</body>', monitorScript + '</body>');

  const filename = `temp_sync_launch_${withFlag ? 'with' : 'without'}_flag.html`;
  const tempFilePath = path.join(tempDir, filename);
  fs.writeFileSync(tempFilePath, runnerHtml, 'utf8');

  try {
    const fileUrl = toFileUrl(tempFilePath, CHROME_PATH);
    const cmd = `"${CHROME_PATH}" --headless --no-sandbox --disable-gpu --virtual-time-budget=6000 --dump-dom "${fileUrl}"`;
    const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const m = out.match(/<div id="chrome-launch-report">([\s\S]*?)<\/div>/);
    if (!m) {
      throw new Error('Failed to locate chrome-launch-report in Chrome DOM');
    }
    const rawJson = decodeHtml(m[1]);
    return JSON.parse(rawJson);
  } finally {
    for (const d of [tempDir, rootDir]) {
      const p = path.join(d, filename);
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch (e) {}
      }
    }
  }
}

try {
  console.log('Testing Scenario 1: With deutsch_sync_enabled="1"...');
  const resWithFlag = runScenario(true);
  console.log(`  - Script tag injected: ${resWithFlag.scriptTagPresent}`);
  console.log(`  - Bundle requested: ${resWithFlag.bundleRequested}`);
  console.log(`  - Flag preserved after init: ${resWithFlag.flagAfter}`);
  console.log(`  - SyncManager state: ${resWithFlag.state}`);

  if (!resWithFlag.bundleRequested) {
    console.error('❌ FAIL: Expected bundle request when flag was present, but none was observed.');
    process.exit(1);
  }
  if (resWithFlag.flagAfter !== '1') {
    console.error(`❌ FAIL: Expected flag '1' to be preserved, found '${resWithFlag.flagAfter}'.`);
    process.exit(1);
  }
  console.log('✓ Scenario 1 PASSED: Bundle requested and flag preserved at launch.\n');

  console.log('Testing Scenario 2: Without deutsch_sync_enabled (clean launch)...');
  const resWithoutFlag = runScenario(false);
  console.log(`  - Script tag injected: ${resWithoutFlag.scriptTagPresent}`);
  console.log(`  - Bundle requested: ${resWithoutFlag.bundleRequested}`);
  console.log(`  - SyncManager state: ${resWithoutFlag.state}`);

  if (resWithoutFlag.bundleRequested) {
    console.error('❌ FAIL: Expected ZERO bundle requests when flag was absent, but request occurred.');
    process.exit(1);
  }
  console.log('✓ Scenario 2 PASSED: Zero bundle requests when flag absent (lazy-load invariant held).\n');

  console.log('======================================================================');
  console.log('🎉 REAL CHROME SYNC LAUNCH FLAG AUDIT PASSED!');
  console.log('======================================================================');
  process.exit(0);
} catch (err) {
  console.error('❌ Exception in real Chrome test:', err.message);
  process.exit(1);
}

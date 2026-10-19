#!/usr/bin/env node
/**
 * tests/vocab_sync_chrome_runner.js
 * Real-Chrome Runner Scenario for DO 4:
 *
 * 1. Seeds localStorage with progress, starred, and srs containing removed IDs
 *    both in ID form (musik.didgeridoo) and in legacy-index form (musik_44 / 44).
 * 2. Loads the app in real Google Chrome.
 * 3. Runs the app's own sync merge path against an in-page fake sync adapter
 *    holding a cloud document with removed IDs.
 * 4. Asserts that no removed ID remains in in-memory progress, starred, or srs
 *    after the merge, while active progress (musik.gitarre) is preserved.
 * 5. Asserts the updated cloud document is also cleaned of all removed IDs.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getChromePath, toFileUrl, getTempDir } = require('../scripts/chrome_path.js');

console.log('======================================================================');
console.log('  RUNNING REAL CHROME SYNC REMOVED-IDS MERGE RUNNER');
console.log('======================================================================');

let CHROME_PATH;
try {
  CHROME_PATH = getChromePath();
} catch (e) {
  console.log('[NOT RUN] Chrome is not available in this environment: ' + e.message);
  process.exit(0);
}

if (!CHROME_PATH || !fs.existsSync(CHROME_PATH)) {
  console.log('[NOT RUN] Chrome binary not found at ' + CHROME_PATH);
  process.exit(0);
}

const rootDir = path.resolve(__dirname, '..');
const tempDir = getTempDir(CHROME_PATH);
const rootBaseUrl = toFileUrl(rootDir, CHROME_PATH).replace(/\/?$/, '/');

const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

const seedScript = `
<script>
try {
  // Seed localStorage before app scripts initialize
  localStorage.setItem('deutsch_progress_v1', JSON.stringify({
    musik: {
      mcq: {
        unlocked: 20,
        counts: {
          '44': 7,
          'musik.didgeridoo': 5,
          'musik.gitarre': 4
        }
      }
    }
  }));
  localStorage.setItem('deutsch_starred_v1', JSON.stringify([
    'musik_44',
    'musik.didgeridoo',
    'musik.gitarre'
  ]));
  localStorage.setItem('deutsch_srs_v1', JSON.stringify({
    'musik_44': { box: 1, lastDate: '2026-10-15', nextDate: '2026-10-16' },
    'musik.didgeridoo': { box: 2, lastDate: '2026-10-15', nextDate: '2026-10-18' },
    'musik.gitarre': { box: 1, lastDate: '2026-10-15', nextDate: '2026-10-16' }
  }));
} catch (e) {
  console.error('Failed to seed localStorage', e);
}
</script>
`;

const testScript = `
<script>
window.__CHROME_SYNC_MERGE_RESULTS__ = {
  passed: false,
  checks: [],
  logs: [],
  consoleErrors: []
};

const origError = console.error;
console.error = function() {
  const args = Array.prototype.slice.call(arguments).map(function(a) {
    return String(a);
  });
  window.__CHROME_SYNC_MERGE_RESULTS__.consoleErrors.push(args.join(' '));
  origError.apply(console, arguments);
};

function addCheck(name, pass, detail) {
  window.__CHROME_SYNC_MERGE_RESULTS__.checks.push({ name: name, pass: pass, detail: detail });
  window.__CHROME_SYNC_MERGE_RESULTS__.logs.push((pass ? '[PASS] ' : '[FAIL] ') + name + ': ' + detail);
}

class InPageFakeSyncAdapter {
  constructor(initialCloudDoc) {
    this.cloudData = initialCloudDoc;
    this.currentUser = null;
    this.listeners = new Set();
  }
  isConfigured() { return true; }
  async signIn(user = { uid: 'user_vocab_runner_123', email: 'vocab_test@example.com', displayName: 'Vocab Learner' }) {
    this.currentUser = user;
    for (const cb of this.listeners) cb(this.currentUser);
    return this.currentUser;
  }
  async signOut() {
    this.currentUser = null;
    for (const cb of this.listeners) cb(null);
  }
  onAuthChange(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  async load(uid) {
    return this.cloudData ? JSON.parse(JSON.stringify(this.cloudData)) : null;
  }
  async save(uid, data) {
    this.cloudData = JSON.parse(JSON.stringify(data));
  }
  async deleteData(uid) {
    this.cloudData = null;
  }
}

window.addEventListener('DOMContentLoaded', async function() {
  try {
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = function() {};
    }
    window.alert = function() {};
    window.confirm = function() { return true; };
    window.exportBackup = function() { return '{"backup":true}'; };

    const removedId = 'musik.didgeridoo';
    const keptId = 'musik.gitarre';

    // 1. Initial cloud document holding removed IDs
    const cloudDoc = {
      schemaVersion: 1,
      dataFormat: 2,
      dataVersion: 5,
      progress: {
        musik: {
          mcq: {
            unlocked: 19,
            counts: {
              [removedId]: 12,
              [keptId]: 10
            }
          }
        }
      },
      starred: [removedId, keptId],
      srs: {
        [removedId]: { box: 3, lastDate: '2026-10-10', nextDate: '2026-10-17' },
        [keptId]: { box: 2, lastDate: '2026-10-10', nextDate: '2026-10-15' }
      },
      stats: { current: 3, longest: 5, totalAnswered: 40, totalCorrect: 35 },
      dailyGoal: { target: 20 }
    };

    const fakeAdapter = new InPageFakeSyncAdapter(cloudDoc);
    if (!window.syncManager) {
      throw new Error('syncManager is not available on window');
    }

    window.syncManager.setAdapter(fakeAdapter);
    await window.syncManager.signIn();
    await window.syncManager.syncNow();
    await window.syncManager.flushSave();

    // Give microtasks and state application a moment
    await new Promise(function(r) { setTimeout(r, 100); });

    // Assert In-Memory Progress:
    const mcqCounts = (progress && progress.musik && progress.musik.mcq && progress.musik.mcq.counts) || {};
    const hasRemovedInProg = (removedId in mcqCounts) || ('44' in mcqCounts);
    const keptCount = mcqCounts[keptId] || 0;
    addCheck('In-Memory Progress Drops Removed IDs', !hasRemovedInProg,
      'removed in progress=' + hasRemovedInProg + ', keys=' + Object.keys(mcqCounts).join(','));
    addCheck('In-Memory Progress Preserves Active Words', keptCount >= 10,
      'keptCount=' + keptCount + ' (expected >= 10)');

    // Assert In-Memory Starred:
    const hasRemovedInStarred = starredSet.has(removedId) || starredSet.has('musik_44');
    const hasKeptInStarred = starredSet.has(keptId);
    addCheck('In-Memory Starred Drops Removed IDs', !hasRemovedInStarred,
      'removed in starred=' + hasRemovedInStarred + ', starred=' + Array.from(starredSet).join(','));
    addCheck('In-Memory Starred Preserves Active Words', hasKeptInStarred,
      'hasKeptInStarred=' + hasKeptInStarred);

    // Assert In-Memory SRS:
    const hasRemovedInSrs = Boolean(srsStore[removedId] || srsStore['musik_44']);
    const hasKeptInSrs = Boolean(srsStore[keptId]);
    addCheck('In-Memory SRS Drops Removed IDs', !hasRemovedInSrs,
      'removed in SRS=' + hasRemovedInSrs + ', srsKeys=' + Object.keys(srsStore).join(','));
    addCheck('In-Memory SRS Preserves Active Words', hasKeptInSrs,
      'hasKeptInSrs=' + hasKeptInSrs);

    // Assert Cloud Document after merge:
    const cloudAfter = fakeAdapter.cloudData || {};
    const cloudCounts = (cloudAfter.progress && cloudAfter.progress.musik && cloudAfter.progress.musik.mcq && cloudAfter.progress.musik.mcq.counts) || {};
    const hasRemovedInCloudProg = (removedId in cloudCounts) || ('44' in cloudCounts);
    const cloudStarred = cloudAfter.starred || [];
    const hasRemovedInCloudStarred = cloudStarred.includes(removedId) || cloudStarred.includes('musik_44');
    const cloudSrs = cloudAfter.srs || {};
    const hasRemovedInCloudSrs = Boolean(cloudSrs[removedId] || cloudSrs['musik_44']);

    addCheck('Cloud Progress Cleaned of Removed IDs', !hasRemovedInCloudProg,
      'cloudProgRemoved=' + hasRemovedInCloudProg + ', cloudCounts=' + JSON.stringify(cloudCounts));
    addCheck('Cloud Starred Cleaned of Removed IDs', !hasRemovedInCloudStarred,
      'cloudStarredRemoved=' + hasRemovedInCloudStarred + ', cloudStarred=' + JSON.stringify(cloudStarred));
    addCheck('Cloud SRS Cleaned of Removed IDs', !hasRemovedInCloudSrs,
      'cloudSrsRemoved=' + hasRemovedInCloudSrs + ', cloudSrs=' + JSON.stringify(Object.keys(cloudSrs)));

    // Console Errors
    const errCount = window.__CHROME_SYNC_MERGE_RESULTS__.consoleErrors.length;
    addCheck('Zero Console Errors', errCount === 0,
      'errorCount=' + errCount + (errCount > 0 ? (': ' + window.__CHROME_SYNC_MERGE_RESULTS__.consoleErrors.join(' | ')) : ''));

    window.__CHROME_SYNC_MERGE_RESULTS__.passed = window.__CHROME_SYNC_MERGE_RESULTS__.checks.every(function(c) { return c.pass; });
  } catch (err) {
    addCheck('Runtime Exception', false, err.stack || err.message);
    window.__CHROME_SYNC_MERGE_RESULTS__.passed = false;
  } finally {
    var reportDiv = document.createElement('div');
    reportDiv.id = 'chrome-sync-merge-report';
    reportDiv.textContent = JSON.stringify(window.__CHROME_SYNC_MERGE_RESULTS__);
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
  .replace('<head>', `<head><base href="${rootBaseUrl}">${seedScript}`)
  .replace('</body>', testScript + '</body>');

const tempFilePath = path.join(tempDir, 'temp_vocab_sync_chrome_runner.html');
fs.writeFileSync(tempFilePath, runnerHtml, 'utf8');

try {
  const fileUrl = toFileUrl(tempFilePath, CHROME_PATH);
  const cmd = `"${CHROME_PATH}" --headless --no-sandbox --disable-gpu --virtual-time-budget=6000 --dump-dom "${fileUrl}"`;
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 15 * 1024 * 1024 });
  const m = out.match(/<div id="chrome-sync-merge-report">([\s\S]*?)<\/div>/);
  if (m) {
    const rawJson = decodeHtml(m[1]);
    const res = JSON.parse(rawJson);
    for (const log of res.logs) {
      console.log(log);
    }
    console.log('======================================================================');
    if (res.passed) {
      console.log('🎉 REAL CHROME SYNC REMOVED-IDS MERGE CHECK PASSED!');
      process.exit(0);
    } else {
      console.error('❌ REAL CHROME SYNC REMOVED-IDS MERGE CHECK FAILED!');
      process.exit(1);
    }
  } else {
    console.error('Failed to locate test report in Chrome DOM');
    process.exit(2);
  }
} finally {
  for (const d of [tempDir, rootDir]) {
    const p = path.join(d, 'temp_vocab_sync_chrome_runner.html');
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (e) {}
    }
  }
}

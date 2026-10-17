const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getChromePath, toFileUrl, getTempDir, cleanupArtifacts } = require('../scripts/chrome_path.js');

console.log('======================================================================');
console.log('  RUNNING REAL CHROME STORAGE MIGRATION & RUNTIME VALIDATION TEST');
console.log('======================================================================');

const CHROME_PATH = getChromePath();
const rootDir = path.resolve(__dirname, '..');
const tempDir = getTempDir(CHROME_PATH);
const rootBaseUrl = toFileUrl(rootDir, CHROME_PATH).replace(/\/?$/, '/');

const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

// Legacy storage setup script injected at top of <head> before app runtime boots
const preSeedScript = `
<script>
try {
  localStorage.clear();
  // 1. Pre-seed legacy format 1 progress (keyed by numeric string index)
  localStorage.setItem('german-arabic-progress-v1', JSON.stringify({
    obst: {
      mcq: { unlocked: 6, counts: { '0': 10, '1': 3 } },
      written: { unlocked: 6, counts: { '0': 10 } },
      article: { unlocked: 6, counts: { '0': 8 } }
    },
    tiere: {
      written: { unlocked: 4, counts: { '0': 2 } }
    }
  }));

  // 2. Pre-seed legacy starred (catId_idx)
  localStorage.setItem('deutsch_starred_v1', JSON.stringify(['obst_0', 'tiere_0']));

  // 3. Pre-seed legacy SRS (catId_idx)
  localStorage.setItem('deutsch_srs_v1', JSON.stringify({
    'obst_0': { box: 2, lastDate: '2026-10-15', nextDate: '2026-10-22' }
  }));

  // 4. Pre-seed stats
  localStorage.setItem('deutsch_stats_v1', JSON.stringify({
    current: 4,
    longest: 10,
    totalAnswered: 30,
    totalCorrect: 28
  }));

  // Crucial: ensure format marker is absent so runtime migrates it
  localStorage.removeItem('deutsch_data_format_v1');
} catch (e) {
  console.error('Failed to pre-seed localStorage:', e);
}
</script>
`;

// Validation test script injected before </body> to run after app init()
const testScript = `
<script>
window.__CHROME_MIGRATION_RESULTS__ = {
  passed: false,
  checks: [],
  logs: []
};

function addCheck(name, pass, detail) {
  window.__CHROME_MIGRATION_RESULTS__.checks.push({ name: name, pass: pass, detail: detail });
  window.__CHROME_MIGRATION_RESULTS__.logs.push((pass ? '[PASS] ' : '[FAIL] ') + name + ': ' + detail);
}

window.addEventListener('DOMContentLoaded', async function() {
  try {
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = function() {};
    }
    window.confirm = function() { return true; };
    window.alert = function() {};
    HTMLAnchorElement.prototype.click = function() {};

    // 1. Verify format marker
    const formatMarker = localStorage.getItem('deutsch_data_format_v1');
    addCheck('Format Marker Set to 2', formatMarker === '2', 'deutsch_data_format_v1=' + formatMarker);

    // 2. Verify Word ID accessibility under new ID
    const apfelCountById = getWordCount('obst', 'mcq', 'obst.apfel');
    const apfelCountByIdx = getWordCount('obst', 'mcq', 0);
    const bananeCountById = getWordCount('obst', 'mcq', 'obst.banane');
    const hundCountById = getWordCount('tiere', 'written', 'tiere.hund');
    const apfelStarred = isStarred('obst', 'obst.apfel') && starredSet.has('obst.apfel');
    const hundStarred = isStarred('tiere', 'tiere.hund') && starredSet.has('tiere.hund');
    const srsEntry = srsStore['obst.apfel'];

    addCheck('Word Progress Migrated to IDs',
      apfelCountById === 10 && apfelCountByIdx === 10 && bananeCountById === 3 && hundCountById === 2,
      'apfelCount=' + apfelCountById + ', bananeCount=' + bananeCountById + ', hundCount=' + hundCountById);

    addCheck('Starred Migrated to IDs',
      apfelStarred === true && hundStarred === true,
      'apfelStarred=' + apfelStarred + ', hundStarred=' + hundStarred);

    addCheck('SRS Migrated to IDs',
      srsEntry && srsEntry.box === 2,
      'srs obst.apfel=' + JSON.stringify(srsEntry));

    // 3. UI displays correct mastered / unlocked counts
    const obstUnlocked = progress.obst && progress.obst.mcq && progress.obst.mcq.unlocked;
    const tiereUnlocked = progress.tiere && progress.tiere.written && progress.tiere.written.unlocked;
    const totalMastered = computeMasteredCount();

    addCheck('Unlocked and Mastered Counts',
      obstUnlocked === 6 && tiereUnlocked === 4 && totalMastered >= 1,
      'obstUnlocked=' + obstUnlocked + ', tiereUnlocked=' + tiereUnlocked + ', totalMastered=' + totalMastered);

    // 4. Playing a word increments count under new ID
    setWordCount('obst', 'mcq', 'obst.apfel', 6);
    const countAfterPlay = getWordCount('obst', 'mcq', 'obst.apfel');
    const hasNumericIndexKey = ('0' in progress.obst.mcq.counts);
    const hasWordIdKey = ('obst.apfel' in progress.obst.mcq.counts);

    addCheck('Play Word Updates Stable ID Key',
      countAfterPlay === 6 && hasWordIdKey && !hasNumericIndexKey,
      'countAfter=' + countAfterPlay + ', hasWordIdKey=' + hasWordIdKey + ', hasNumericIndexKey=' + hasNumericIndexKey);

    // 5. Export produces valid dataFormat 2 backup
    const exportedJson = exportBackup(true); // pass true for auto/silent
    const parsedBackup = JSON.parse(exportedJson);
    const valResult = validateBackupData(parsedBackup, CATEGORIES);

    addCheck('Export Produces Valid Format-2 Backup',
      parsedBackup.dataFormat === 2 &&
      parsedBackup.progress.obst.mcq.counts['obst.apfel'] === 6 &&
      valResult.valid === true,
      'dataFormat=' + parsedBackup.dataFormat + ', valid=' + valResult.valid + ', error=' + (valResult.error || 'none'));

    // 6. resetAllProgress clears everything cleanly including legacy keys
    await resetAllProgress();

    const formatMarkerAfterReset = localStorage.getItem('deutsch_data_format_v1');
    const progressKeyAfterReset = localStorage.getItem('german-arabic-progress-v1');
    const starredKeyAfterReset = localStorage.getItem('deutsch_starred_v1');
    const srsKeyAfterReset = localStorage.getItem('deutsch_srs_v1');
    const legacyLernKey = localStorage.getItem('deutsch_lern_v1');
    const starredEmpty = starredSet.size === 0;
    const srsEmpty = Object.keys(srsStore).length === 0;

    addCheck('Reset Purges All Format & Legacy Keys Cleanly',
      formatMarkerAfterReset === null &&
      progressKeyAfterReset === null &&
      starredKeyAfterReset === null &&
      srsKeyAfterReset === null &&
      legacyLernKey === null &&
      starredEmpty &&
      srsEmpty,
      'formatMarker=' + formatMarkerAfterReset + ', starredEmpty=' + starredEmpty + ', srsEmpty=' + srsEmpty);

    window.__CHROME_MIGRATION_RESULTS__.passed = window.__CHROME_MIGRATION_RESULTS__.checks.every(function(c) { return c.pass; });
  } catch (err) {
    addCheck('Runtime Exception', false, err.stack || err.message);
    window.__CHROME_MIGRATION_RESULTS__.passed = false;
  } finally {
    var reportDiv = document.createElement('div');
    reportDiv.id = 'chrome-migration-report';
    reportDiv.textContent = JSON.stringify(window.__CHROME_MIGRATION_RESULTS__);
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
  .replace('<head>', `<head><base href="${rootBaseUrl}">\n${preSeedScript}`)
  .replace('</body>', testScript + '</body>');

const tempFilePath = path.join(tempDir, 'temp_storage_migration_test.html');
fs.writeFileSync(tempFilePath, runnerHtml, 'utf8');

try {
  const fileUrl = toFileUrl(tempFilePath, CHROME_PATH);
  const cmd = `"${CHROME_PATH}" --headless --no-sandbox --disable-gpu --virtual-time-budget=6000 --dump-dom "${fileUrl}"`;
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const m = out.match(/<div id="chrome-migration-report">([\s\S]*?)<\/div>/);
  if (m) {
    const rawJson = decodeHtml(m[1]);
    const res = JSON.parse(rawJson);
    for (const log of res.logs) {
      console.log(log);
    }
    console.log('======================================================================');
    if (res.passed) {
      console.log('🎉 REAL CHROME STORAGE MIGRATION VALIDATION PASSED!');
      process.exit(0);
    } else {
      console.error('❌ REAL CHROME STORAGE MIGRATION VALIDATION FAILED!');
      process.exit(1);
    }
  } else {
    console.error('Failed to locate test report in Chrome DOM');
    process.exit(2);
  }
} finally {
  for (const d of [tempDir, rootDir]) {
    const p = path.join(d, 'temp_storage_migration_test.html');
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (e) {}
    }
  }
}

/**
 * tests/data_safety_runner.js
 * -----------------------------------------------------------------------------
 * Data Safety & Migration Verification Runner in Real Google Chrome.
 * Proves that user data (progress, statistics, starred items, Leitner SRS schedule,
 * and daily goal) survive an application upgrade from a previous release build/tag.
 *
 * Usage:
 *   node tests/data_safety_runner.js [git-tag-or-file-path]
 *
 * Examples:
 *   node tests/data_safety_runner.js v1.3-voice
 *   node tests/data_safety_runner.js path/to/previous_index.html
 *   BASE_REF=v1.2-hosting node tests/data_safety_runner.js
 *
 * Note:
 *   Requires full local git history/tags or a direct file path;
 *   intentionally NOT run by CI shallow checkouts.
 * -----------------------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const baseRefOrPath = process.argv[2] || process.env.BASE_REF || 'v1.3-voice';

console.log('======================================================================');
console.log(`  DATA SAFETY PROOF TEST IN REAL GOOGLE CHROME (${baseRefOrPath} -> current)`);
console.log('======================================================================');

const CHROME_PATH = '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe';
const RUN_ID = Date.now();
const PROFILE_DIR = 'C:/German_App/.proof_chrome_profile_' + RUN_ID;
const PROFILE_DIR_WSL = '/mnt/c/German_App/.proof_chrome_profile_' + RUN_ID;

// Ensure clean profile directory
try {
  if (fs.existsSync(PROFILE_DIR_WSL)) {
    fs.rmSync(PROFILE_DIR_WSL, { recursive: true, force: true });
  }
} catch(e) {}

function decodeHtml(str) {
  return str.replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');
}

function runChrome(htmlFile, useProfile = true) {
  const winFile = 'file:///C:/German_App/' + htmlFile;
  const profileArg = useProfile ? `--user-data-dir="${PROFILE_DIR}"` : '';
  const cmd = `"${CHROME_PATH}" --headless ${profileArg} --virtual-time-budget=6000 --dump-dom "${winFile}"`;
  return execSync(cmd, { encoding: 'utf8', maxBuffer: 15 * 1024 * 1024 });
}

let mainBackupJson = '';

try {
  // -------------------------------------------------------------------------
  // STAGE 1: Load base build in real Chrome and generate user progress
  // -------------------------------------------------------------------------
  console.log(`\n--- STAGE 1: Simulating User Progress on "${baseRefOrPath}" build ---`);
  let mainHtml = '';
  if (fs.existsSync(baseRefOrPath)) {
    mainHtml = fs.readFileSync(baseRefOrPath, 'utf8');
  } else {
    mainHtml = execSync(`git show ${baseRefOrPath}:index.html`, { encoding: 'utf8', maxBuffer: 15 * 1024 * 1024 });
  }

  const stage1Script = `
  <script>
  window.addEventListener('DOMContentLoaded', async () => {
    try {
      await new Promise(r => setTimeout(r, 400));

      // 1. Create progress in 'obst'
      const p = ensureProgress('obst', 'mcq');
      p.counts[0] = 7;
      p.unlocked = 10;
      saveProgressSoon();

      // 2. Star a word
      starredSet.add('obst_0');
      saveStarredSoon();

      // 3. Set daily goal to 30
      if (typeof setDailyGoal === 'function') {
        setDailyGoal(30);
      }

      // 4. Record SRS entry
      srsStore['obst_0'] = { box: 1, lastDate: todayStr(), nextDate: todayStr() };
      saveSrsSoon();

      // 5. Record Stats
      stats.totalAnswered = 15;
      stats.totalCorrect = 14;
      stats.current = 3;
      saveStatsSoon();

      // Wait 600ms for debounced timers to flush to localStorage
      await new Promise(r => setTimeout(r, 600));

      // Generate backup export JSON
      const backupData = {
        version: 2,
        exportDate: new Date().toISOString(),
        progress: progress || {},
        stats: stats || {},
        starred: Array.from(starredSet),
        srs: srsStore || {},
        dailyGoal: getDailyGoal ? getDailyGoal() : 30
      };

      const report = {
        success: true,
        backupJson: JSON.stringify(backupData),
        ls_progress: localStorage.getItem('german-arabic-progress-v1'),
        ls_stats: localStorage.getItem('german-arabic-stats-v1'),
        ls_starred: localStorage.getItem('deutsch_starred_v1'),
        ls_srs: localStorage.getItem('deutsch_srs_v1'),
        ls_daily_goal: localStorage.getItem('deutsch_daily_goal_v1'),
        inmem_goal: getDailyGoal ? getDailyGoal() : 30,
        inmem_starred: Array.from(starredSet),
        inmem_srs: srsStore
      };

      const out = document.createElement('div');
      out.id = 'stage1-report';
      out.textContent = JSON.stringify(report);
      document.body.appendChild(out);
    } catch(err) {
      const out = document.createElement('div');
      out.id = 'stage1-report';
      out.textContent = JSON.stringify({ success: false, error: err.message, stack: err.stack });
      document.body.appendChild(out);
    }
  });
  </script>
  `;

  const stage1Html = mainHtml.replace('</body>', stage1Script + '</body>');
  fs.writeFileSync('temp_stage1_main.html', stage1Html, 'utf8');

  const stage1Out = runChrome('temp_stage1_main.html');
  const m1 = stage1Out.match(/<div id="stage1-report">([\s\S]*?)<\/div>/);
  if (!m1) {
    throw new Error('Stage 1 failed: Could not find stage1-report in Chrome output.');
  }

  const stage1Report = JSON.parse(decodeHtml(m1[1]));
  if (!stage1Report.success) {
    throw new Error('Stage 1 failed inside Chrome: ' + stage1Report.error);
  }

  mainBackupJson = stage1Report.backupJson;
  console.log('✓ Stage 1 (main build): Progress created and persisted to Chrome profile:');
  console.log('  - Progress key: german-arabic-progress-v1 =', Boolean(stage1Report.ls_progress));
  console.log('  - Stats key: german-arabic-stats-v1 =', Boolean(stage1Report.ls_stats));
  console.log('  - Starred key: deutsch_starred_v1 =', stage1Report.ls_starred);
  console.log('  - SRS key: deutsch_srs_v1 =', Boolean(stage1Report.ls_srs));
  console.log('  - Daily goal key: deutsch_daily_goal_v1 =', stage1Report.ls_daily_goal);
  console.log('  - Backup exported from main successfully (' + mainBackupJson.length + ' bytes)');

  // -------------------------------------------------------------------------
  // STAGE 2: Load current fix/audit build on SAME origin (same profile)
  // Assert full preservation of progress, stats, starred, SRS, and daily goal
  // -------------------------------------------------------------------------
  console.log('\n--- STAGE 2: Verifying Data Preservation on current build ---');
  const currentHtml = fs.readFileSync('index.html', 'utf8');

  const stage2Script = `
  <script>
  window.addEventListener('DOMContentLoaded', async () => {
    const checks = [];
    function assert(name, condition, detail) {
      checks.push({ name, pass: Boolean(condition), detail: String(detail) });
    }

    try {
      await new Promise(r => setTimeout(r, 500));

      // 1. Verify Progress
      const hasCat = progress && progress['obst'] && progress['obst']['mcq'];
      const obstCount = hasCat ? progress['obst']['mcq'].counts[0] : null;
      assert('Progress Category & MCQ Count', obstCount === 7, 'obst mcq count: ' + obstCount + ' (expected 7)');
      assert('Progress Unlocked', hasCat && progress['obst']['mcq'].unlocked === 10, 'unlocked: ' + (hasCat ? progress['obst']['mcq'].unlocked : null));

      // 2. Verify Stats
      assert('Stats Answered Count', stats && stats.totalAnswered === 15, 'totalAnswered: ' + (stats ? stats.totalAnswered : null));
      assert('Stats Correct Count', stats && stats.totalCorrect === 14, 'totalCorrect: ' + (stats ? stats.totalCorrect : null));
      assert('Stats Streak', stats && stats.current === 3, 'current streak: ' + (stats ? stats.current : null));

      // 3. Verify Starred
      assert('Starred Set', starredSet && starredSet.has('obst_0'), 'starredSet has obst_0: ' + (starredSet && starredSet.has('obst_0')));

      // 4. Verify SRS
      assert('SRS Store Record', srsStore && srsStore['obst_0'] && srsStore['obst_0'].box === 1, 'srsStore obst_0: ' + JSON.stringify(srsStore ? srsStore['obst_0'] : null));

      // 5. Verify Daily Goal
      const activeGoal = getDailyGoal();
      assert('Daily Goal Value', activeGoal === 30, 'dailyGoal: ' + activeGoal + ' (expected 30)');

      // 6. Verify Direct LocalStorage Keys
      assert('LS german-arabic-progress-v1', localStorage.getItem('german-arabic-progress-v1') !== null, 'present');
      assert('LS german-arabic-stats-v1', localStorage.getItem('german-arabic-stats-v1') !== null, 'present');
      assert('LS deutsch_starred_v1', localStorage.getItem('deutsch_starred_v1') !== null, 'present');
      assert('LS deutsch_srs_v1', localStorage.getItem('deutsch_srs_v1') !== null, 'present');
      assert('LS deutsch_daily_goal_v1', localStorage.getItem('deutsch_daily_goal_v1') === '30', localStorage.getItem('deutsch_daily_goal_v1'));

      const out = document.createElement('div');
      out.id = 'stage2-report';
      out.textContent = JSON.stringify({ success: true, checks });
      document.body.appendChild(out);
    } catch(err) {
      const out = document.createElement('div');
      out.id = 'stage2-report';
      out.textContent = JSON.stringify({ success: false, error: err.message, stack: err.stack, checks });
      document.body.appendChild(out);
    }
  });
  </script>
  `;

  const stage2Html = currentHtml.replace('</body>', stage2Script + '</body>');
  fs.writeFileSync('temp_stage2_curr.html', stage2Html, 'utf8');

  const stage2Out = runChrome('temp_stage2_curr.html');
  const m2 = stage2Out.match(/<div id="stage2-report">([\s\S]*?)<\/div>/);
  if (!m2) {
    throw new Error('Stage 2 failed: Could not find stage2-report in Chrome output.');
  }

  const stage2Report = JSON.parse(decodeHtml(m2[1]));
  if (!stage2Report.success) {
    throw new Error('Stage 2 failed inside Chrome: ' + stage2Report.error);
  }

  let stage2AllPass = true;
  for (const c of stage2Report.checks) {
    console.log(`  - [${c.pass ? 'PASS' : 'FAIL'}] ${c.name}: ${c.detail}`);
    if (!c.pass) stage2AllPass = false;
  }
  if (!stage2AllPass) {
    throw new Error('Stage 2 data preservation assertions failed.');
  }
  console.log('✓ Stage 2 PASSED: 100% data preservation verified on same origin in Google Chrome!');

  // -------------------------------------------------------------------------
  // STAGE 3: Test Backup Export from main -> Import into fix/audit
  // -------------------------------------------------------------------------
  console.log('\n--- STAGE 3: Testing Backup Export (main) -> Import (fix/audit) ---');

  const stage3Script = `
  <script>
  window.addEventListener('DOMContentLoaded', async () => {
    const checks = [];
    function assert(name, condition, detail) {
      checks.push({ name, pass: Boolean(condition), detail: String(detail) });
    }

    try {
      await new Promise(r => setTimeout(r, 400));

      // 1. Wipe current storage completely
      localStorage.clear();
      if (typeof appStorage !== 'undefined' && appStorage.clear) appStorage.clear();
      progress = {};
      stats = { lastDate:null, current:0, longest:0, totalAnswered:0, totalCorrect:0, todayCount:0 };
      starredSet = new Set();
      srsStore = {};

      assert('Clean Slate Before Import', Object.keys(progress).length === 0 && starredSet.size === 0, 'wiped');

      // 2. Import backup string exported from main
      window.confirm = function() { return true; };
      window.alert = function() {};
      HTMLAnchorElement.prototype.click = function() {};
      const mainBackupData = ${JSON.stringify(mainBackupJson)};
      importBackup(mainBackupData);

      // 3. Verify restored in-memory state
      assert('Restored Progress', progress['obst'] && progress['obst']['mcq'] && progress['obst']['mcq'].counts[0] === 7, 'counts[0]=7');
      assert('Restored Stats', stats && stats.totalAnswered === 15 && stats.totalCorrect === 14, 'answered=15, correct=14');
      assert('Restored Starred', starredSet && starredSet.has('obst_0'), 'has obst_0');
      assert('Restored SRS', srsStore && srsStore['obst_0'] && srsStore['obst_0'].box === 1, 'srs obst_0 box=1');
      assert('Restored Goal', getDailyGoal() === 30, 'dailyGoal=30');

      // 4. Verify both active and legacy keys populated in storage
      assert('Storage PROGRESS', localStorage.getItem('german-arabic-progress-v1') !== null, 'populated');
      assert('Storage STATS', localStorage.getItem('german-arabic-stats-v1') !== null, 'populated');
      assert('Storage Legacy PROGRESS', localStorage.getItem('deutsch_lern_v1') !== null, 'populated');
      assert('Storage Legacy STATS', localStorage.getItem('deutsch_stats_v1') !== null, 'populated');
      assert('Storage STARRED', localStorage.getItem('deutsch_starred_v1') !== null, 'populated');
      assert('Storage SRS', localStorage.getItem('deutsch_srs_v1') !== null, 'populated');
      assert('Storage DAILY_GOAL', localStorage.getItem('deutsch_daily_goal_v1') === '30', '30');

      const out = document.createElement('div');
      out.id = 'stage3-report';
      out.textContent = JSON.stringify({ success: true, checks });
      document.body.appendChild(out);
    } catch(err) {
      const out = document.createElement('div');
      out.id = 'stage3-report';
      out.textContent = JSON.stringify({ success: false, error: err.message, stack: err.stack, checks });
      document.body.appendChild(out);
    }
  });
  </script>
  `;

  const stage3Html = currentHtml.replace('</body>', stage3Script + '</body>');
  fs.writeFileSync('temp_stage3_import.html', stage3Html, 'utf8');

  const stage3Out = runChrome('temp_stage3_import.html', false);
  const m3 = stage3Out.match(/<div id="stage3-report">([\s\S]*?)<\/div>/);
  if (!m3) {
    throw new Error('Stage 3 failed: Could not find stage3-report in Chrome output.');
  }

  const stage3Report = JSON.parse(decodeHtml(m3[1]));
  if (!stage3Report.success) {
    throw new Error('Stage 3 failed inside Chrome: ' + stage3Report.error);
  }

  let stage3AllPass = true;
  for (const c of stage3Report.checks) {
    console.log(`  - [${c.pass ? 'PASS' : 'FAIL'}] ${c.name}: ${c.detail}`);
    if (!c.pass) stage3AllPass = false;
  }
  if (!stage3AllPass) {
    throw new Error('Stage 3 backup import assertions failed.');
  }
  console.log('✓ Stage 3 PASSED: Backup from main cleanly restored all entities!');

  // -------------------------------------------------------------------------
  // STAGE 4: Shape Validation & Reset All Progress
  // -------------------------------------------------------------------------
  console.log('\n--- STAGE 4: Shape Validation & resetAllProgress() Audit ---');

  const stage4Script = `
  <script>
  window.addEventListener('DOMContentLoaded', async () => {
    const checks = [];
    function assert(name, condition, detail) {
      checks.push({ name, pass: Boolean(condition), detail: String(detail) });
    }

    try {
      await new Promise(r => setTimeout(r, 400));

      let alertMessage = '';
      window.alert = function(msg) { alertMessage = msg; };
      window.confirm = function() { return false; };
      HTMLAnchorElement.prototype.click = function() {};

      // 1. Shape validation: Corrupted JSON
      alertMessage = '';
      importBackup('{ invalid json: true }');
      assert('Reject Syntax Error JSON', alertMessage.includes('فشل استيراد') || alertMessage.includes('غير صالح'), 'alert: ' + alertMessage);

      // 2. Shape validation: Array JSON
      alertMessage = '';
      importBackup('[1, 2, 3]');
      assert('Reject Array Backup', alertMessage.includes('غير صالح'), 'alert: ' + alertMessage);

      // 3. Shape validation: Empty Object
      alertMessage = '';
      importBackup('{}');
      assert('Reject Empty Object', alertMessage.includes('غير صالح أو فارغ'), 'alert: ' + alertMessage);

      // 4. Shape validation: Wrong field types
      alertMessage = '';
      importBackup(JSON.stringify({ progress: "string_should_fail", stats: 123 }));
      assert('Reject Non-Object Progress/Stats', alertMessage.includes('غير صالح أو فارغ'), 'alert: ' + alertMessage);

      // 5. Test resetAllProgress()
      // First ensure keys exist
      localStorage.setItem('german-arabic-progress-v1', '{"test":1}');
      localStorage.setItem('german-arabic-stats-v1', '{"test":1}');
      localStorage.setItem('deutsch_starred_v1', '["test"]');
      localStorage.setItem('deutsch_srs_v1', '{"test":1}');
      localStorage.setItem('deutsch_daily_goal_v1', '40');
      localStorage.setItem('deutsch_lern_v1', '{"test":1}');
      localStorage.setItem('deutsch_stats_v1', '{"test":1}');

      resetAllProgress();

      // Assert in-memory state
      assert('Reset In-Memory Progress', Object.keys(progress).length === 0, 'empty');
      assert('Reset In-Memory Stats Answered', stats.totalAnswered === 0, '0');
      assert('Reset In-Memory Starred', starredSet.size === 0, '0');
      assert('Reset In-Memory SRS', Object.keys(srsStore).length === 0, 'empty');
      assert('Reset In-Memory Daily Goal', dailyGoal === 20, '20');

      // Assert all 7 storage keys purged
      assert('Reset Purged german-arabic-progress-v1', localStorage.getItem('german-arabic-progress-v1') === null, 'null');
      assert('Reset Purged german-arabic-stats-v1', localStorage.getItem('german-arabic-stats-v1') === null, 'null');
      assert('Reset Purged deutsch_starred_v1', localStorage.getItem('deutsch_starred_v1') === null, 'null');
      assert('Reset Purged deutsch_srs_v1', localStorage.getItem('deutsch_srs_v1') === null, 'null');
      assert('Reset Purged deutsch_daily_goal_v1', localStorage.getItem('deutsch_daily_goal_v1') === null, 'null');
      assert('Reset Purged Legacy deutsch_lern_v1', localStorage.getItem('deutsch_lern_v1') === null, 'null');
      assert('Reset Purged Legacy deutsch_stats_v1', localStorage.getItem('deutsch_stats_v1') === null, 'null');

      const out = document.createElement('div');
      out.id = 'stage4-report';
      out.textContent = JSON.stringify({ success: true, checks });
      document.body.appendChild(out);
    } catch(err) {
      const out = document.createElement('div');
      out.id = 'stage4-report';
      out.textContent = JSON.stringify({ success: false, error: err.message, stack: err.stack, checks });
      document.body.appendChild(out);
    }
  });
  </script>
  `;

  const stage4Html = currentHtml.replace('</body>', stage4Script + '</body>');
  fs.writeFileSync('temp_stage4_reset.html', stage4Html, 'utf8');

  const stage4Out = runChrome('temp_stage4_reset.html', false);
  const m4 = stage4Out.match(/<div id="stage4-report">([\s\S]*?)<\/div>/);
  if (!m4) {
    throw new Error('Stage 4 failed: Could not find stage4-report in Chrome output.');
  }

  const stage4Report = JSON.parse(decodeHtml(m4[1]));
  if (!stage4Report.success) {
    throw new Error('Stage 4 failed inside Chrome: ' + stage4Report.error);
  }

  let stage4AllPass = true;
  for (const c of stage4Report.checks) {
    console.log(`  - [${c.pass ? 'PASS' : 'FAIL'}] ${c.name}: ${c.detail}`);
    if (!c.pass) stage4AllPass = false;
  }
  if (!stage4AllPass) {
    throw new Error('Stage 4 assertions failed.');
  }
  console.log('✓ Stage 4 PASSED: Shape validation rejects malformed data & resetAllProgress purges all keys!');

  console.log('\n======================================================================');
  console.log('🎉 ALL DATA SAFETY PROOF TESTS PASSED IN REAL GOOGLE CHROME!');
  console.log('======================================================================\n');
} finally {
  // Clean up temporary files
  const toClean = ['temp_stage1_main.html', 'temp_stage2_curr.html', 'temp_stage3_import.html', 'temp_stage4_reset.html'];
  for (const f of toClean) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  if (fs.existsSync(PROFILE_DIR_WSL)) {
    try { fs.rmSync(PROFILE_DIR_WSL, { recursive: true, force: true }); } catch(e) {}
  }
}

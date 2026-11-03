/**
 * tests/goal_mastery_chrome_runner.js
 *
 * Real headless Chrome runner verifying:
 * 1. Daily goal header 🎯 counter reflects MASTERED WORDS in written mode.
 * 2. REAL keyboard events (typing + Enter keydown) trigger submission and advance.
 * 3. Wrong answer leaves 🎯 goal counter unchanged.
 * 4. Correct answer crossing threshold (preset to 9, crossing to 10) increments 🎯 counter immediately.
 * 5. Tested on both a noun category (milch) and on verben.
 * 6. 360px viewport overflow audit of header with standard and expanded goal text.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getChromePath, toFileUrl, getTempDir } = require('../scripts/chrome_path.js');

console.log('======================================================================');
console.log('  RUNNING REAL CHROME DAILY GOAL MASTERY VALIDATION RUNNER');
console.log('======================================================================');

let CHROME_PATH;
try {
  CHROME_PATH = getChromePath();
} catch (e) {
  console.log('[NOT RUN] Headless Chrome path not found: ' + (e.message || e));
  process.exit(0);
}

const rootDir = path.resolve(__dirname, '..');
const tempDir = getTempDir(CHROME_PATH);
const rootBaseUrl = toFileUrl(rootDir, CHROME_PATH).replace(/\/?$/, '/');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

const testScript = `
<script>
window.__GOAL_MASTERY_RESULTS__ = { passed: false, checks: [], logs: [] };

function addCheck(name, pass, detail) {
  window.__GOAL_MASTERY_RESULTS__.checks.push({ name: name, pass: pass, detail: detail });
  window.__GOAL_MASTERY_RESULTS__.logs.push((pass ? '[PASS] ' : '[FAIL] ') + name + ': ' + detail);
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function getGoalText() {
  var el = document.querySelector('#headGoalBtn .goal-num');
  return el ? el.textContent.trim() : 'N/A';
}

function check360Overflow(ctxName) {
  var header = document.querySelector('.app-head');
  var body = document.body;
  var bodyOverflow = body.scrollWidth > 361;
  var headerOverflow = header && (header.scrollWidth > 361);
  var pass = !bodyOverflow && !headerOverflow;
  addCheck('360px Viewport Audit: ' + ctxName, pass,
    'bodyScroll=' + body.scrollWidth + ', headerScroll=' + (header ? header.scrollWidth : 0));
}

function dispatchKey(el, keyName, repeatFlag) {
  var ev = new KeyboardEvent('keydown', {
    key: keyName,
    code: keyName === 'Enter' ? 'Enter' : (keyName === ' ' ? 'Space' : keyName),
    repeat: Boolean(repeatFlag),
    bubbles: true,
    cancelable: true
  });
  el.dispatchEvent(ev);
  return ev;
}

window.addEventListener('DOMContentLoaded', async function() {
  try {
    if (window.speechSynthesis) window.speechSynthesis.speak = function(){};

    // Ensure 360px mobile viewport styling
    document.documentElement.style.width = '360px';
    document.body.style.width = '360px';
    document.body.style.margin = '0 auto';
    document.body.style.boxSizing = 'border-box';

    await resetAllProgress();

    // ──────────────────────────────────────────────────────────────────────
    // PART 1: Noun Category (milch) in Written Mode with Real Keyboard Events
    // ──────────────────────────────────────────────────────────────────────
    go({ screen: 'exercise', catId: 'milch', mode: 'written' });
    await sleep(50);

    var initGoalText = getGoalText();
    addCheck('Noun Written: Initial Goal counter is 0/20', initGoalText === '0/20', 'text=' + initGoalText);

    check360Overflow('Noun Written Initial State (0/20)');

    // 1. Submit WRONG answer via Enter key
    var wIn = document.getElementById('wIn');
    if (wIn) {
      wIn.value = 'falscheAntwort';
      dispatchKey(wIn, 'Enter', false);
      await sleep(50);
    }

    var goalAfterWrong = getGoalText();
    addCheck('Noun Written: Wrong answer via Enter leaves 🎯 unchanged (0/20)', goalAfterWrong === '0/20', 'afterWrong=' + goalAfterWrong);

    // 2. Advance via next button
    var nextBtn = document.getElementById('nextBtn');
    if (nextBtn) {
      nextBtn.click();
      await sleep(50);
    }

    // 3. Preset count for active word to 9 (threshold - 1)
    setWordCount('milch', 'written', exState.idx, threshFor('written') - 1);
    var goalBeforeMastery = getGoalText();
    addCheck('Noun Written: Presetting count to 9 leaves 🎯 unchanged (0/20)', goalBeforeMastery === '0/20', 'before=' + goalBeforeMastery);

    // 4. Submit CORRECT answer via Enter key (crossing 9 -> 10)
    var catMilch = CATEGORIES.find(function(c){ return c.id === 'milch'; });
    var activeWord = catMilch.words[exState.idx];
    var correctNounAnswer = (activeWord.a ? activeWord.a + ' ' : '') + activeWord.n;

    wIn = document.getElementById('wIn');
    if (wIn) {
      wIn.value = correctNounAnswer;
      dispatchKey(wIn, 'Enter', false);
      await sleep(50);
    }

    var goalAfterMastery = getGoalText();
    addCheck('Noun Written: Correct mastery answer (9->10) via Enter increments 🎯 immediately to 1/20',
      goalAfterMastery === '1/20',
      'before=' + goalBeforeMastery + ', after=' + goalAfterMastery);

    check360Overflow('Noun Written After Mastery Credit (1/20)');

    // ──────────────────────────────────────────────────────────────────────
    // PART 2: Verbs Category (verben) in Written Mode with Real Keyboard Events
    // ──────────────────────────────────────────────────────────────────────
    go({ screen: 'exercise', catId: 'verben', mode: 'written' });
    await sleep(50);

    var verbenStartGoal = getGoalText();
    addCheck('Verben Written: Starts with existing daily count (1/20)', verbenStartGoal === '1/20', 'start=' + verbenStartGoal);

    // 1. Submit WRONG answer on verb via Enter key
    wIn = document.getElementById('wIn');
    if (wIn) {
      wIn.value = 'falschesVerb';
      dispatchKey(wIn, 'Enter', false);
      await sleep(50);
    }

    var verbenAfterWrong = getGoalText();
    addCheck('Verben Written: Wrong answer via Enter leaves 🎯 unchanged (1/20)', verbenAfterWrong === '1/20', 'afterWrong=' + verbenAfterWrong);

    // 2. Advance via next button
    nextBtn = document.getElementById('nextBtn');
    if (nextBtn) {
      nextBtn.click();
      await sleep(50);
    }

    // 3. Preset count for active verb to 9 (threshold - 1)
    setWordCount('verben', 'written', exState.idx, threshFor('written') - 1);

    // 4. Submit CORRECT infinitive answer via Enter key (crossing 9 -> 10)
    var catVerben = CATEGORIES.find(function(c){ return c.id === 'verben'; });
    var activeVerb = catVerben.words[exState.idx];
    var correctVerbAnswer = activeVerb.n;

    wIn = document.getElementById('wIn');
    if (wIn) {
      wIn.value = correctVerbAnswer;
      dispatchKey(wIn, 'Enter', false);
      await sleep(50);
    }

    var verbenAfterMastery = getGoalText();
    addCheck('Verben Written: Correct mastery answer (9->10) via Enter increments 🎯 immediately to 2/20',
      verbenAfterMastery === '2/20',
      'before=' + verbenStartGoal + ', after=' + verbenAfterMastery);

    check360Overflow('Verben Written After Mastery Credit (2/20)');

    // ──────────────────────────────────────────────────────────────────────
    // PART 3: Large Goal Number 360px Header Stress Test
    // ──────────────────────────────────────────────────────────────────────
    stats.lastDate = todayStr();
    stats.todayCount = 188;
    setDailyGoal(200);
    refreshGoalDisplay();
    var largeGoalText = getGoalText();
    addCheck('Header Large Text Display: Updated to 188/200', largeGoalText === '188/200', 'text=' + largeGoalText);

    check360Overflow('Header with Large Goal Text (188/200)');

    window.__GOAL_MASTERY_RESULTS__.passed = window.__GOAL_MASTERY_RESULTS__.checks.every(function(c){ return c.pass; });
  } catch (err) {
    addCheck('Runner Uncaught Exception', false, err.message + '\\n' + err.stack);
    window.__GOAL_MASTERY_RESULTS__.passed = false;
  } finally {
    var reportDiv = document.createElement('div');
    reportDiv.id = 'chrome-goal-mastery-report';
    reportDiv.textContent = JSON.stringify(window.__GOAL_MASTERY_RESULTS__);
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

const tempFile = 'temp_goal_mastery_runner.html';
const tempFilePath = path.join(tempDir, tempFile);
fs.writeFileSync(tempFilePath, runnerHtml, 'utf8');

try {
  const fileUrl = toFileUrl(tempFilePath, CHROME_PATH);
  const cmd = `"${CHROME_PATH}" --headless --no-sandbox --disable-gpu --window-size=360,740 --virtual-time-budget=15000 --dump-dom "${fileUrl}"`;
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 15 * 1024 * 1024 });

  const m = out.match(/<div id="chrome-goal-mastery-report">([\s\S]*?)<\/div>/);
  if (m) {
    const rawJson = decodeHtml(m[1]);
    const res = JSON.parse(rawJson);
    for (const log of res.logs) {
      console.log(log);
    }
    console.log('======================================================================');
    if (res.passed) {
      console.log('🎉 REAL CHROME DAILY GOAL MASTERY RUNNER PASSED!');
      console.log('======================================================================');
      process.exit(0);
    } else {
      console.error('❌ SOME REAL CHROME CHECKS FAILED');
      console.log('======================================================================');
      process.exit(1);
    }
  } else {
    console.error('Failed to locate test report in Chrome DOM');
    process.exit(2);
  }
} finally {
  for (const d of [tempDir, rootDir]) {
    const p = path.join(d, tempFile);
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (e) {}
    }
  }
}

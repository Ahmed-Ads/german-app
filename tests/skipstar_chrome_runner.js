/**
 * tests/skipstar_chrome_runner.js
 *
 * Real Chrome headless runner for Tasks 1, 2, and 3:
 *   - Star button: computed SVG glyph differs between starred/unstarred states, aria-pressed
 *   - Skip button:
 *       (1) Skipped word written counter before=0, after equals THRESH.written (10)
 *       (2) Next question word is a different word (compare .qmain prompt text as variable)
 *       (3) Other modes counters of skipped word are untouched
 *       (4) After undo click, counter equals previous value
 *       (5) Stale undo: skip, navigate to home (go({screen:'home'})); action toast must be gone
 *           after Fix 1b; if still in DOM, click it; no uncaught exceptions; counter safe
 *       (6) Empty submit in real written screen leaves #headGoalBtn .goal-num unchanged
 *       (7) After skipping all currently active words, the next 5 words are active
 *   - Goal counter: wrong answer → +1 immediately; correct answer → +1; skip → unchanged
 *   - No horizontal overflow at 360px viewport
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getChromePath, toFileUrl, getTempDir } = require('../scripts/chrome_path.js');

console.log('======================================================================');
console.log('  RUNNING REAL CHROME SKIP / STAR / COUNTER VALIDATION TEST');
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
window.__SKIPSTAR_RESULTS__ = { passed: false, checks: [], logs: [] };

function addCheck(name, pass, detail) {
  window.__SKIPSTAR_RESULTS__.checks.push({ name: name, pass: pass, detail: detail });
  window.__SKIPSTAR_RESULTS__.logs.push((pass ? '[PASS] ' : '[FAIL] ') + name + ': ' + detail);
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

window.addEventListener('DOMContentLoaded', async function() {
  try {
    // Silence TTS
    if (window.speechSynthesis) window.speechSynthesis.speak = function(){};

    await resetAllProgress();

    // ──────────────────────────────────────────────────────────────────────
    // TASK 1: Star button visual state differs (SVG not emoji)
    // ──────────────────────────────────────────────────────────────────────
    go({ screen: 'exercise', catId: 'milch', mode: 'written' });
    await sleep(50);

    // Submit a wrong answer to get feedback with star button
    var wIn = document.getElementById('wIn');
    var wSub = document.getElementById('wSub');
    if (wIn && wSub) {
      wIn.value = 'zzz_wrong';
      wSub.click();
      await sleep(50);
    }

    // Check that .star-btn contains SVG (not ⭐)
    var starFb = document.querySelector('.star-btn');
    var hasSvg = starFb && starFb.querySelector('svg') !== null;
    var hasEmoji = starFb && starFb.textContent.includes('⭐');
    addCheck('Star button uses SVG glyph (not ⭐ emoji)', hasSvg && !hasEmoji,
      'hasSvg=' + hasSvg + ', hasEmoji=' + hasEmoji);

    // Check outline visible when not starred
    var outlinePath = starFb && starFb.querySelector('.st-outline');
    var solidPath = starFb && starFb.querySelector('.st-solid');
    var outlineVisible = outlinePath && getComputedStyle(outlinePath).display !== 'none';
    var solidHidden = solidPath && getComputedStyle(solidPath).display === 'none';
    addCheck('Unstarred: outline visible, solid hidden', Boolean(outlineVisible && solidHidden),
      'outlineDisplay=' + (outlinePath ? getComputedStyle(outlinePath).display : 'N/A') +
      ', solidDisplay=' + (solidPath ? getComputedStyle(solidPath).display : 'N/A'));

    // Click star button and verify state flips
    if (starFb) {
      starFb.click();
      await sleep(30);
      var outlineAfter = starFb.querySelector('.st-outline');
      var solidAfter = starFb.querySelector('.st-solid');
      var outlineHiddenAfter = outlineAfter && getComputedStyle(outlineAfter).display === 'none';
      var solidVisibleAfter = solidAfter && getComputedStyle(solidAfter).display !== 'none';
      var ariaPressedTrue = starFb.getAttribute('aria-pressed') === 'true';
      addCheck('Starred: outline hidden, solid visible, aria-pressed=true',
        Boolean(outlineHiddenAfter && solidVisibleAfter && ariaPressedTrue),
        'outlineDisplay=' + (outlineAfter ? getComputedStyle(outlineAfter).display : 'N/A') +
        ', solidDisplay=' + (solidAfter ? getComputedStyle(solidAfter).display : 'N/A') +
        ', ariaPressedTrue=' + ariaPressedTrue);
    } else {
      addCheck('Starred: outline hidden, solid visible, aria-pressed=true', false, 'No star-btn found after wrong answer');
    }

    // ──────────────────────────────────────────────────────────────────────
    // TASK 3: Goal counter increments IMMEDIATELY after answer
    // ──────────────────────────────────────────────────────────────────────
    await resetAllProgress();
    go({ screen: 'exercise', catId: 'milch', mode: 'written' });
    await sleep(50);

    // Read initial goal number
    var goalEl = document.querySelector('#headGoalBtn .goal-num');
    var goalBefore = goalEl ? goalEl.textContent : 'N/A';

    // Submit a WRONG answer
    wIn = document.getElementById('wIn');
    wSub = document.getElementById('wSub');
    if (wIn && wSub) {
      wIn.value = 'zzz_wrong';
      wSub.click();
      await sleep(50); // No re-render needed; refreshGoalDisplay() updates DOM inline
    }

    var goalAfterWrong = goalEl ? goalEl.textContent : 'N/A';
    // todayCount should now be 1
    var goalWrongOk = goalAfterWrong !== goalBefore && goalAfterWrong.startsWith('1/');
    addCheck('Wrong answer → goal counter increments immediately (no re-render)',
      goalWrongOk,
      'before=' + goalBefore + ', afterWrong=' + goalAfterWrong);

    // Move to next question and submit a CORRECT answer
    var nextBtn = document.getElementById('nextBtn');
    if (nextBtn) {
      nextBtn.click();
      await sleep(50);
    }

    wIn = document.getElementById('wIn');
    wSub = document.getElementById('wSub');
    // Find correct answer (first word of milch category: die Milch)
    var catMilch = typeof CATEGORIES !== 'undefined' && CATEGORIES.find(function(c){ return c.id==='milch'; });
    var firstWord = catMilch && catMilch.words[0];
    var correctText = firstWord ? ((firstWord.a ? firstWord.a+' ' : '') + firstWord.n) : 'die Milch';

    goalEl = document.querySelector('#headGoalBtn .goal-num');
    var goalBefore2 = goalEl ? goalEl.textContent : 'N/A';

    if (wIn && wSub) {
      wIn.value = correctText;
      wSub.click();
      await sleep(50);
    }

    var goalAfterCorrect = goalEl ? goalEl.textContent : 'N/A';
    var goalCorrectOk = goalAfterCorrect !== goalBefore2;
    addCheck('Correct answer → goal counter increments immediately',
      goalCorrectOk,
      'before=' + goalBefore2 + ', after=' + goalAfterCorrect);

    // ──────────────────────────────────────────────────────────────────────
    // ASSERTION 6: Empty submit in real written screen leaves goal counter unchanged
    // ──────────────────────────────────────────────────────────────────────
    await resetAllProgress();
    go({ screen: 'exercise', catId: 'milch', mode: 'written' });
    await sleep(50);
    goalEl = document.querySelector('#headGoalBtn .goal-num');
    var goalBeforeEmpty = goalEl ? goalEl.textContent.trim() : 'N/A';
    wIn = document.getElementById('wIn');
    wSub = document.getElementById('wSub');
    if (wIn && wSub) {
      wIn.value = '';
      wSub.click();
      await sleep(30);
    }
    var goalAfterEmpty = goalEl ? goalEl.textContent.trim() : 'N/A';
    addCheck('Assertion 6: Empty submit in real written screen leaves goal counter unchanged',
      Boolean(goalBeforeEmpty !== 'N/A' && goalBeforeEmpty === goalAfterEmpty),
      'before=' + goalBeforeEmpty + ', after=' + goalAfterEmpty);

    // ──────────────────────────────────────────────────────────────────────
    // TASK 2: Skip button in written exercise with Assertions 1, 2, 3, 4
    // ──────────────────────────────────────────────────────────────────────
    await resetAllProgress();
    go({ screen: 'exercise', catId: 'milch', mode: 'written' });
    await sleep(60);

    var skipBtn = document.getElementById('skipWordBtn');
    addCheck('Skip button present in category written exercise', skipBtn !== null,
      skipBtn ? 'found' : 'not found');

    // Read initial written counter of current word from real progress state
    var initialWordIdx = exState.idx;
    var writtenBefore = getWordCount('milch', 'written', initialWordIdx);

    // Read prompt text .qmain before skip (saved in a variable, not a placeholder)
    var qmainEl = document.querySelector('.qmain');
    var promptBefore = qmainEl ? qmainEl.textContent.trim() : '';

    // Set non-zero counts in other modes for this word to verify they remain untouched (Assertion 3)
    setWordCount('milch', 'mcq', initialWordIdx, 4);
    setWordCount('milch', 'article', initialWordIdx, 2);
    setWordCount('milch', 'plural', initialWordIdx, 0);
    setWordCount('milch', 'listen', initialWordIdx, 1);

    // Read goal before skip
    goalEl = document.querySelector('#headGoalBtn .goal-num');
    var goalBeforeSkip = goalEl ? goalEl.textContent.trim() : 'N/A';

    // Click skip! (Deterministic branch: ensure active question selection without review collision)
    var origRandom = Math.random;
    Math.random = function() { return 0.5; };
    if (skipBtn) {
      skipBtn.click();
      await sleep(80);
    }
    Math.random = origRandom;

    // Assertion 1: Skipped word written counter equals THRESH.written (10)
    var writtenAfterSkip = getWordCount('milch', 'written', initialWordIdx);
    var thWritten = (typeof THRESH !== 'undefined' && THRESH.written) ? THRESH.written : 10;
    addCheck('Assertion 1: Skipped word written counter equals THRESH.written (10)',
      Boolean(writtenBefore === 0 && writtenAfterSkip === thWritten),
      'before=' + writtenBefore + ', afterSkip=' + writtenAfterSkip + ', expected=' + thWritten);

    // Assertion 2: Next question word is a different word (compare .qmain prompt text before/after)
    var qmainElAfter = document.querySelector('.qmain');
    var promptAfter = qmainElAfter ? qmainElAfter.textContent.trim() : '';
    addCheck('Assertion 2: Next question word is a different word (.qmain prompt changed)',
      Boolean(promptBefore && promptAfter && promptBefore !== promptAfter),
      'promptBefore="' + promptBefore + '", promptAfter="' + promptAfter + '"');

    // Assertion 3: Other modes counters of skipped word are unchanged
    var mcqAfter = getWordCount('milch', 'mcq', initialWordIdx);
    var articleAfter = getWordCount('milch', 'article', initialWordIdx);
    var pluralAfter = getWordCount('milch', 'plural', initialWordIdx);
    var listenAfter = getWordCount('milch', 'listen', initialWordIdx);
    var otherModesUnchanged = (mcqAfter === 4 && articleAfter === 2 && pluralAfter === 0 && listenAfter === 1);
    addCheck('Assertion 3: Other modes counters of skipped word are unchanged',
      otherModesUnchanged,
      'mcq=' + mcqAfter + ' (exp 4), article=' + articleAfter + ' (exp 2), plural=' + pluralAfter + ', listen=' + listenAfter);

    // Goal counter should NOT have changed from skip
    goalEl = document.querySelector('#headGoalBtn .goal-num');
    var goalAfterSkip = goalEl ? goalEl.textContent.trim() : 'N/A';
    addCheck('Skip does NOT increment goal counter', goalBeforeSkip === goalAfterSkip,
      'before=' + goalBeforeSkip + ', after=' + goalAfterSkip);

    // Undo button should be visible (action toast)
    var actionToast = document.getElementById('appActionToast');
    var undoVisible = actionToast && actionToast.classList.contains('show');
    addCheck('Undo toast appears after skip', undoVisible,
      undoVisible ? 'toast visible' : 'toast not visible');

    // Assertion 4: After undo click the counter equals the previous value
    if (actionToast) {
      var undoBtn = actionToast.querySelector('.app-action-toast__btn');
      if (undoBtn) {
        undoBtn.click();
        await sleep(80);
      }
    }
    var writtenAfterUndo = getWordCount('milch', 'written', initialWordIdx);
    addCheck('Assertion 4: After undo click written counter equals previous value',
      writtenAfterUndo === writtenBefore,
      'before=' + writtenBefore + ', afterSkip=' + writtenAfterSkip + ', afterUndo=' + writtenAfterUndo);

    // ──────────────────────────────────────────────────────────────────────
    // ASSERTION 5: Stale undo after navigation to home screen
    // ──────────────────────────────────────────────────────────────────────
    var uncaughtErrors = [];
    var errListener = function(ev) {
      var msg = ev.message || (ev.error && ev.error.message) || String(ev);
      uncaughtErrors.push(msg);
    };
    var rejListener = function(ev) {
      var msg = ev.reason ? (ev.reason.message || String(ev.reason)) : 'Unhandled rejection';
      uncaughtErrors.push(msg);
    };
    window.addEventListener('error', errListener);
    window.addEventListener('unhandledrejection', rejListener);

    await resetAllProgress();
    go({ screen: 'exercise', catId: 'milch', mode: 'written' });
    await sleep(60);

    var targetIdx = exState.idx;
    var prevTargetCount = getWordCount('milch', 'written', targetIdx);
    var skipBtn5 = document.getElementById('skipWordBtn');
    if (skipBtn5) {
      skipBtn5.click();
      await sleep(80);
    }
    var countAfterTargetSkip = getWordCount('milch', 'written', targetIdx);

    // Navigate to home screen (standard home navigation)
    go({ screen: 'home', catId: null, mode: null, highlightIdx: null, fromSearch: false });
    await sleep(60);

    // Fix 1b check: Action toast must be dismissed/gone from DOM after screen change
    var undoBtnInDomAfterNav = document.querySelector('.app-action-toast__btn');
    var toastEl = document.getElementById('appActionToast');
    var isToastGone = (undoBtnInDomAfterNav === null) && (!toastEl || !toastEl.classList.contains('show'));

    // Trigger the undo button if it is still in the DOM (in old index.html without Fix 1b, it is; click it)
    if (undoBtnInDomAfterNav) {
      undoBtnInDomAfterNav.click();
      await sleep(60);
    }

    var finalTargetCount = getWordCount('milch', 'written', targetIdx);
    var counterSafe = (finalTargetCount === prevTargetCount || finalTargetCount === countAfterTargetSkip);
    var noExceptions = (uncaughtErrors.length === 0);

    addCheck('Assertion 5: Skip then navigate home: toast dismissed, no uncaught exception if triggered, counter safe',
      Boolean(isToastGone && noExceptions && counterSafe),
      'toastGone=' + isToastGone + ', uncaughtErrors=[' + uncaughtErrors.join('; ') + '], counterSafe=' + counterSafe + ' (count=' + finalTargetCount + ')');

    window.removeEventListener('error', errListener);
    window.removeEventListener('unhandledrejection', rejListener);

    // ──────────────────────────────────────────────────────────────────────
    // ASSERTION 7: After a skip of every currently active word, next 5 words active
    // ──────────────────────────────────────────────────────────────────────
    await resetAllProgress();
    go({ screen: 'exercise', catId: 'milch', mode: 'written' });
    await sleep(60);

    var initialActive = activeIndices('milch', 'written');
    var initialActiveLen = initialActive.length;

    // Skip every currently active word until all 5 are mastered
    var attempts = 0;
    while (initialActive.some(function(i){ return getWordCount('milch', 'written', i) < 10; }) && attempts < 20) {
      attempts++;
      var curSkipBtn = document.getElementById('skipWordBtn');
      if (curSkipBtn) {
        curSkipBtn.click();
        await sleep(60);
      }
    }

    var activeAfterBatch = activeIndices('milch', 'written');
    var next5Unlocked = (activeAfterBatch.length === 5) && (activeAfterBatch[0] === 5);
    addCheck('Assertion 7: After skipping all 5 active words, next 5 words are active',
      Boolean(initialActiveLen === 5 && next5Unlocked),
      'initialActiveLen=' + initialActiveLen + ', activeAfterBatchLen=' + activeAfterBatch.length + ', firstActiveIdx=' + activeAfterBatch[0] + ', indices=[' + activeAfterBatch.join(',') + ']');

    // Skip button NOT present in global review written mode
    await resetAllProgress();
    var firstCat = typeof CATEGORIES !== 'undefined' && CATEGORIES[0];
    if (firstCat) {
      for (var gi = 0; gi < 3; gi++) {
        setWordCount(firstCat.id, 'written', gi, 1);
        setWordCount(firstCat.id, 'mcq', gi, 1);
      }
    }
    go({ screen: 'exercise', mode: 'globalWritten' });
    await sleep(50);
    var globalSkipBtn = document.getElementById('skipWordBtn');
    addCheck('Skip button NOT present in global review written mode',
      globalSkipBtn === null,
      globalSkipBtn ? 'FOUND (should be absent)' : 'correctly absent');

    // ──────────────────────────────────────────────────────────────────────
    // 360px horizontal overflow check
    // ──────────────────────────────────────────────────────────────────────
    await resetAllProgress();
    go({ screen: 'exercise', catId: 'milch', mode: 'written' });
    await sleep(50);

    document.body.style.width = '360px';
    document.body.style.margin = '0 auto';
    document.body.style.padding = '20px 12px 48px';

    var docW = document.body.scrollWidth;
    var bodyRect = document.body.getBoundingClientRect();
    var allElements = Array.from(document.querySelectorAll('.wrap *'));
    var offenders = [];
    allElements.forEach(function(el){
      if(el.scrollWidth > 360){
        var cls = el.className ? ('.' + String(el.className).replace(/\\s+/g, '.')) : el.tagName;
        offenders.push(cls + ' (scrollWidth=' + el.scrollWidth + ')');
      }
      var rect = el.getBoundingClientRect();
      var relativeRight = rect.right - bodyRect.left;
      if(relativeRight > 360.5){
        var cls2 = el.className ? ('.' + String(el.className).replace(/\\s+/g, '.')) : el.tagName;
        offenders.push(cls2 + ' (relativeRight=' + Math.round(relativeRight) + ')');
      }
    });
    var noOverflow = (docW <= 360) && (offenders.length === 0);
    addCheck('360px viewport: no horizontal overflow in written exercise with skip button',
      noOverflow,
      'bodyScrollWidth=' + docW + ', offendersCount=' + offenders.length +
      (offenders.length ? ' [' + offenders.slice(0,3).join(', ') + ']' : ''));

    window.__SKIPSTAR_RESULTS__.passed = window.__SKIPSTAR_RESULTS__.checks.every(function(c){ return c.pass; });

  } catch(err) {
    addCheck('Runtime Exception', false, String(err.stack || err.message || err));
    window.__SKIPSTAR_RESULTS__.passed = false;
  } finally {
    var div = document.createElement('div');
    div.id = 'chrome-skipstar-report';
    div.textContent = JSON.stringify(window.__SKIPSTAR_RESULTS__);
    document.body.appendChild(div);
  }
});
</script>
`;

function decodeHtml(str) {
  return str.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

const runnerHtml = html
  .replace('<head>', `<head><base href="${rootBaseUrl}">`)
  .replace('</body>', testScript + '</body>');

const tempFilePath = path.join(tempDir, 'temp_skipstar_test.html');
fs.writeFileSync(tempFilePath, runnerHtml, 'utf8');

try {
  const fileUrl = toFileUrl(tempFilePath, CHROME_PATH);
  const cmd = `"${CHROME_PATH}" --headless --no-sandbox --disable-gpu --virtual-time-budget=15000 --dump-dom "${fileUrl}"`;
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const m = out.match(/<div id="chrome-skipstar-report">([\s\S]*?)<\/div>/);
  if (m) {
    const res = JSON.parse(decodeHtml(m[1]));
    for (const log of res.logs) console.log(log);
    console.log('======================================================================');
    if (res.passed) {
      console.log('🎉 REAL CHROME SKIP / STAR / COUNTER CHECK PASSED!');
      process.exit(0);
    } else {
      console.error('❌ REAL CHROME SKIP / STAR / COUNTER CHECK FAILED!');
      process.exit(1);
    }
  } else {
    console.error('Failed to locate test report in Chrome DOM output');
    process.exit(2);
  }
} finally {
  try { fs.unlinkSync(tempFilePath); } catch (e) {}
}

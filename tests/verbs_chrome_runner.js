/**
 * tests/verbs_chrome_runner.js
 *
 * Real Chrome headless runner for Verbs section (Release v1.17):
 *   - Category 'verben' present with 77 A1 verbs, hasArticles: false
 *   - Total 31 categories, 1029 words
 *   - Spot assertions for:
 *       * gehen (ging, ist gegangen)
 *       * essen (isst, aß, hat gegessen)
 *       * aufstehen (stehe auf, ist aufgestanden)
 *       * können (kann, konnte, hat gekonnt)
 *   - Modes screen: mcq, written, listen offered; no article or plural modes
 *   - MCQ mode: answer feedback displays .verb-panel with Präsens, Präteritum, Perfekt
 *   - Written mode:
 *       * Skip button works (sets mastery threshold, shows toast, advances)
 *       * Typing "aufstehen" accepts infinitive without article, shows .verb-panel
 *   - Listen mode: answer feedback displays .verb-panel
 *   - Flashcards: front has no article, back displays .verb-panel
 *   - Word list: expandable <details class="wl-verb-details"> with "عرض التصريف"
 *   - Stats: displays 31 categories and 1029 words
 *   - 360px viewport: no horizontal overflow across verbs screens
 *   - Zero console errors
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getChromePath, toFileUrl, getTempDir } = require('../scripts/chrome_path.js');

console.log('======================================================================');
console.log('  RUNNING REAL CHROME VERBS SECTION VALIDATION RUNNER');
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

const testScript = `
<script>
window.__VERBS_CHROME_RESULTS__ = {
  passed: false,
  checks: [],
  logs: [],
  consoleErrors: []
};

const origError = console.error;
console.error = function() {
  const args = Array.prototype.slice.call(arguments).map(function(a) { return String(a); });
  window.__VERBS_CHROME_RESULTS__.consoleErrors.push(args.join(' '));
  origError.apply(console, arguments);
};

window.addEventListener('error', function(e) {
  window.__VERBS_CHROME_RESULTS__.consoleErrors.push('Uncaught error: ' + (e.message || e));
});

function addCheck(name, pass, detail) {
  window.__VERBS_CHROME_RESULTS__.checks.push({ name: name, pass: pass, detail: detail });
  window.__VERBS_CHROME_RESULTS__.logs.push((pass ? '[PASS] ' : '[FAIL] ') + name + ': ' + detail);
}

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function check360Overflow(screenName) {
  var docW = document.body.scrollWidth;
  var bodyRect = document.body.getBoundingClientRect();
  var allElements = Array.from(document.querySelectorAll('#app *'));
  var offenders = [];
  allElements.forEach(function(el) {
    if (el.scrollWidth > 360) {
      var cls = el.className ? ('.' + String(el.className).replace(/\\s+/g, '.')) : el.tagName;
      offenders.push(cls + ' (scrollWidth=' + el.scrollWidth + ')');
    }
    var rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      var relRight = rect.right - bodyRect.left;
      if (relRight > 360.5) {
        var cls2 = el.className ? ('.' + String(el.className).replace(/\\s+/g, '.')) : el.tagName;
        offenders.push(cls2 + ' (relRight=' + Math.round(relRight) + ')');
      }
    }
  });
  var pass = (docW <= 360) && (offenders.length === 0);
  addCheck('360px Overflow Check - ' + screenName, pass,
    'scrollW=' + docW + ', offendersCount=' + offenders.length +
    (offenders.length ? ' [' + offenders.slice(0, 3).join(', ') + ']' : ''));
}

window.addEventListener('DOMContentLoaded', async function() {
  try {
    // Silence TTS
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = function() {};
    }

    // Set 360px mobile viewport styles on body for real responsive behavior
    document.body.style.width = '360px';
    document.body.style.margin = '0 auto';
    document.body.style.padding = '20px 12px 48px';

    await resetAllProgress();

    // 1. Data counts
    var totalCats = CATEGORIES.length;
    var totalWords = CATEGORIES.reduce(function(acc, c) { return acc + (c.words ? c.words.length : 0); }, 0);
    addCheck('Total Categories Count', totalCats === 31, 'totalCats=' + totalCats);
    addCheck('Total Words Count', totalWords === 1029, 'totalWords=' + totalWords);

    var verbenCat = CATEGORIES.find(function(c) { return c.id === 'verben'; });
    addCheck('Verben Category Exists', Boolean(verbenCat), 'verbenCat=' + (verbenCat ? verbenCat.ar : 'missing'));
    addCheck('Verben Words Count = 77', verbenCat && verbenCat.words && verbenCat.words.length === 77, 'words=' + (verbenCat ? verbenCat.words.length : 0));
    addCheck('Verben hasArticles === false', verbenCat && verbenCat.hasArticles === false, 'hasArticles=' + (verbenCat ? verbenCat.hasArticles : 'undefined'));

    // 2. Spot assertions
    var pGehen = renderVerbPanel('verben.gehen');
    var pGehenOk = pGehen.includes('ging') && pGehen.includes('ist gegangen');
    addCheck('Spot Assertion: gehen (ging, ist gegangen)', pGehenOk, 'pGehenOk=' + pGehenOk);

    var pEssen = renderVerbPanel('verben.essen');
    var pEssenOk = pEssen.includes('isst') && pEssen.includes('aß') && pEssen.includes('hat gegessen');
    addCheck('Spot Assertion: essen (isst, aß, hat gegessen)', pEssenOk, 'pEssenOk=' + pEssenOk);

    var pAuf = renderVerbPanel('verben.aufstehen');
    var pAufOk = pAuf.includes('stehe auf') && pAuf.includes('ist aufgestanden');
    addCheck('Spot Assertion: aufstehen (stehe auf, ist aufgestanden)', pAufOk, 'pAufOk=' + pAufOk);

    var pKoennen = renderVerbPanel('verben.koennen');
    var pKoennenOk = pKoennen.includes('kann') && pKoennen.includes('konnte') && pKoennen.includes('hat gekonnt');
    addCheck('Spot Assertion: können (kann, konnte, hat gekonnt)', pKoennenOk, 'pKoennenOk=' + pKoennenOk);

    // 3. Verbs Mode Picker Screen
    go({ screen: 'modes', catId: 'verben' });
    await sleep(50);
    var modeBtns = Array.from(document.querySelectorAll('.mode-card, .mode-btn, [data-mode]'));
    var hasArticleMode = modeBtns.some(function(b) {
      return (b.getAttribute('data-mode') === 'article') || (b.textContent && b.textContent.includes('أداة التعريف'));
    });
    var hasPluralMode = modeBtns.some(function(b) {
      return (b.getAttribute('data-mode') === 'plural') || (b.textContent && b.textContent.includes('صيغة الجمع'));
    });
    addCheck('Verben Modes Picker: No Article or Plural Modes', !hasArticleMode && !hasPluralMode,
      'hasArticleMode=' + hasArticleMode + ', hasPluralMode=' + hasPluralMode);

    var reviewBtn = document.querySelector('.mode-btn[data-mode="review"]');
    addCheck('Verben Modes Picker: Category Review Button Present', Boolean(reviewBtn), 'reviewBtn=' + Boolean(reviewBtn));
    check360Overflow('Modes Screen');

    // 3b. Verbs Category Review ("مراجعة القسم") Mode
    go({ screen: 'exercise', catId: 'verben', mode: 'review' });
    await sleep(50);
    var isCatReview = exState && exState.kind === 'catReview';
    var totalQIs77 = exState && exState.totalQ === 77;
    addCheck('Verben Category Review: Initialized with 77 Single-Step Questions',
      Boolean(isCatReview && totalQIs77),
      'isCatReview=' + isCatReview + ', totalQ=' + (exState ? exState.totalQ : 0));

    var revOpt = document.querySelector('#qzone .opt');
    if (revOpt) {
      revOpt.click();
      await sleep(50);
    }
    var revPanel = document.querySelector('#fb .verb-panel, #fb .verb-conjugation-panel');
    addCheck('Verben Category Review: Feedback shows Conjugation Panel', Boolean(revPanel),
      'revPanel=' + Boolean(revPanel));
    check360Overflow('Review Feedback Screen');

    // Complete review to done screen
    if (exState && exState.queue) {
      exState.pos = exState.queue.length - 1;
      exState.answered = false;
      renderReviewCat(verbenCat);
      await sleep(50);
      var lastOpt = document.querySelector('#qzone .opt');
      if (lastOpt) {
        lastOpt.click();
        await sleep(50);
      }
      var revNext = document.getElementById('nextBtn');
      if (revNext) {
        revNext.click();
        await sleep(50);
      }
      var doneCard = document.querySelector('.done-card');
      var doneCardText = doneCard ? doneCard.textContent : '';
      var reviewDone = Boolean(doneCard && (doneCardText.includes('إجابة صحيحة') || doneCardText.includes('المراجعة')));
      addCheck('Verben Category Review: Completes to Done Screen', reviewDone,
        'reviewDone=' + reviewDone + ', text=' + (doneCardText ? doneCardText.slice(0, 35) : 'none'));
      check360Overflow('Review Done Screen');
    }

    // 4. Verbs MCQ Mode
    go({ screen: 'exercise', catId: 'verben', mode: 'mcq' });
    await sleep(50);
    var mcqOpt = document.querySelector('#qzone .opt');
    if (mcqOpt) {
      mcqOpt.click();
      await sleep(50);
    }
    var mcqPanel = document.querySelector('#fb .verb-panel, #fb .verb-conjugation-panel');
    var hasTables = mcqPanel && mcqPanel.querySelectorAll('table.verb-table').length >= 2;
    var hasPerfekt = mcqPanel && mcqPanel.querySelector('.verb-perfekt-line') !== null;
    addCheck('Verben MCQ Mode: Feedback shows Conjugation Panel', Boolean(mcqPanel && hasTables && hasPerfekt),
      'hasPanel=' + Boolean(mcqPanel) + ', hasTables=' + hasTables + ', hasPerfekt=' + hasPerfekt);
    check360Overflow('MCQ Feedback Screen');

    // 5. Verbs Written Mode: Skip Button
    go({ screen: 'exercise', catId: 'verben', mode: 'written' });
    await sleep(50);
    var skipBtn = document.getElementById('skipWordBtn');
    addCheck('Verben Written Mode: Skip Button Present', Boolean(skipBtn), 'skipBtn=' + Boolean(skipBtn));

    var currentIdx = exState ? exState.idx : 0;
    if (skipBtn) {
      skipBtn.click();
      await sleep(50);
    }
    var writtenTh = threshFor('written');
    var writtenCountAfterSkip = getWordCount('verben', 'written', currentIdx);
    var toast = document.getElementById('appActionToast');
    var toastVisible = toast && (toast.classList.contains('show') || toast.textContent.includes('تم تخطّي الكلمة'));
    addCheck('Verben Written Mode: Skip Button sets Mastery & shows Toast',
      writtenCountAfterSkip === writtenTh && Boolean(toastVisible),
      'count=' + writtenCountAfterSkip + ' (expected ' + writtenTh + '), toastVisible=' + Boolean(toastVisible));

    var pool = learnedPool();
    var skippedInPool = pool.find(function(it) { return it.catId === 'verben' && it.idx === currentIdx; });
    addCheck('Verben Skipped Word Appears in Learned Pool',
      Boolean(skippedInPool && skippedInPool.sources && skippedInPool.sources.includes('written')),
      'skippedInPool=' + Boolean(skippedInPool));

    // 6. Verbs Written Mode: Type "aufstehen"
    var aufIdx = verbenCat.words.findIndex(function(w) { return w.id === 'verben.aufstehen'; });
    if (aufIdx !== -1) {
      var aufWord = verbenCat.words[aufIdx];
      exState = { catId: 'verben', mode: 'written', idx: aufIdx, answered: false };
      renderQuestion(verbenCat, 'written', aufIdx, aufWord);
      await sleep(50);
      var wIn = document.getElementById('wIn');
      var wSub = document.getElementById('wSub');
      if (wIn && wSub) {
        wIn.value = 'aufstehen';
        wSub.click();
        await sleep(50);
      }
      var writtenPanel = document.querySelector('#fb .verb-panel, #fb .verb-conjugation-panel');
      var panelHasAuf = writtenPanel && writtenPanel.textContent.includes('stehe auf');
      addCheck('Verben Written Mode: Typing "aufstehen" shows Panel with Conjugation',
        Boolean(writtenPanel && panelHasAuf),
        'hasPanel=' + Boolean(writtenPanel) + ', hasSeparable=' + panelHasAuf);
      check360Overflow('Written Feedback Screen');
    }

    // 7. Verbs Listen Mode
    go({ screen: 'exercise', catId: 'verben', mode: 'listen' });
    await sleep(50);
    var listenOpt = document.querySelector('#qzone .opt');
    if (listenOpt) {
      listenOpt.click();
      await sleep(50);
    }
    var listenPanel = document.querySelector('#fb .verb-panel, #fb .verb-conjugation-panel');
    addCheck('Verben Listen Mode: Feedback shows Conjugation Panel', Boolean(listenPanel),
      'listenPanel=' + Boolean(listenPanel));

    // 8. Verbs Flashcards: Back face has Conjugation Panel
    go({ screen: 'flashcards', catId: 'verben' });
    await sleep(50);
    var fcCard = document.getElementById('flashcard');
    var fcFront = document.querySelector('.fc-face.fc-front');
    var fcFrontHasTag = fcFront && fcFront.querySelector('.gender-tag') !== null;
    addCheck('Verben Flashcards Front: No Gender Tag', !fcFrontHasTag, 'fcFrontHasTag=' + fcFrontHasTag);

    if (fcCard) {
      fcCard.classList.add('flipped');
      await sleep(50);
    }
    var fcBackPanel = document.querySelector('.fc-face.fc-back .verb-panel, .fc-face.fc-back .verb-conjugation-panel');
    addCheck('Verben Flashcards Back: Renders Conjugation Panel', Boolean(fcBackPanel),
      'fcBackPanel=' + Boolean(fcBackPanel));
    check360Overflow('Flashcard Back Screen');

    // 9. Verbs Word List: Expandable Details
    go({ screen: 'wordlist', catId: 'verben' });
    await sleep(50);
    var detailsList = Array.from(document.querySelectorAll('.wl-verb-details'));
    var summaryList = Array.from(document.querySelectorAll('.wl-verb-summary'));
    var detailsHas77 = detailsList.length === 77;
    var summaryHasText = summaryList.length > 0 && summaryList[0].textContent.includes('عرض التصريف');
    addCheck('Verben Word List: 77 Expandable Details with "عرض التصريف"',
      detailsHas77 && summaryHasText,
      'detailsCount=' + detailsList.length + ', summaryHasText=' + summaryHasText);

    if (detailsList.length > 0) {
      detailsList[0].open = true;
      await sleep(50);
      var wlPanel = detailsList[0].querySelector('.verb-panel, .verb-conjugation-panel');
      addCheck('Verben Word List: Expanded Details Contains Verb Panel',
        Boolean(wlPanel), 'wlPanel=' + Boolean(wlPanel));
    }
    check360Overflow('Wordlist Screen');

    // 10. Stats Screen: 31 categories, 1029 words
    go({ screen: 'stats' });
    await sleep(80);
    var statRows = document.querySelectorAll('.stat-cat-row');
    var titleEl = document.querySelector('.stats-section-title');
    var titleText = titleEl ? titleEl.textContent : '';
    var has31InTitle = titleText.includes('31 قسمًا') || titleText.includes('31 قسماً');
    var appText = document.getElementById('app') ? document.getElementById('app').innerText : '';
    var has1029 = appText.includes('1029');
    addCheck('Stats Screen: 31 Categories and 1029 Words Displayed',
      statRows.length === 31 && has31InTitle && has1029,
      'statRows=' + statRows.length + ', has31InTitle=' + has31InTitle + ', has1029=' + has1029);

    // 11. Zero Console Errors
    var errCount = window.__VERBS_CHROME_RESULTS__.consoleErrors.length;
    addCheck('Zero Console Errors', errCount === 0,
      'errCount=' + errCount + (errCount > 0 ? (': ' + window.__VERBS_CHROME_RESULTS__.consoleErrors.join(' | ')) : ''));

    window.__VERBS_CHROME_RESULTS__.passed = window.__VERBS_CHROME_RESULTS__.checks.every(function(c) { return c.pass; });
  } catch (err) {
    addCheck('Runtime Exception', false, err.stack || err.message);
    window.__VERBS_CHROME_RESULTS__.passed = false;
  } finally {
    var reportDiv = document.createElement('div');
    reportDiv.id = 'chrome-verbs-report';
    reportDiv.textContent = JSON.stringify(window.__VERBS_CHROME_RESULTS__);
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

const tempFilePath = path.join(tempDir, 'temp_verbs_test.html');
fs.writeFileSync(tempFilePath, runnerHtml, 'utf8');

try {
  const fileUrl = toFileUrl(tempFilePath, CHROME_PATH);
  const cmd = `"${CHROME_PATH}" --headless --no-sandbox --disable-gpu --virtual-time-budget=12000 --dump-dom "${fileUrl}"`;
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const m = out.match(/<div id="chrome-verbs-report">([\s\S]*?)<\/div>/);
  if (m) {
    const rawJson = decodeHtml(m[1]);
    const res = JSON.parse(rawJson);
    for (const log of res.logs) {
      console.log(log);
    }
    console.log('======================================================================');
    if (res.passed) {
      console.log('🎉 REAL CHROME VERBS SECTION CHECK PASSED!');
      process.exit(0);
    } else {
      console.error('❌ REAL CHROME VERBS SECTION CHECK FAILED!');
      process.exit(1);
    }
  } else {
    console.error('Failed to locate test report in Chrome DOM');
    process.exit(2);
  }
} finally {
  try { fs.unlinkSync(tempFilePath); } catch (e) {}
}

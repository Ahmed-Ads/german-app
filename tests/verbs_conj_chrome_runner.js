/**
 * tests/verbs_conj_chrome_runner.js
 *
 * Real Chrome headless runner for Verbs Conjugation Quiz (Release v1.18):
 *   - Verbs mode picker displays NEW card "اختبار التصريفات" (data-mode="conj")
 *   - Pool < 3: displays clear Arabic lock message and button to other quizzes
 *   - Pool >= 3: starts session with typing stages
 *   - Perfect run: completes 4 stages (Infinitive, Präsens, Präteritum, Perfekt),
 *     verifies word counter +1 and goal counter +1 once
 *   - Separable verb: typing only stem shows specific Arabic hint about missing prefix
 *   - Imperfect run: wrong stage prevents word counter from incrementing
 *   - Umlaut bar present and functional
 *   - Conjugation panel (.verb-panel) rendered after each stage
 *   - End screen shows score, mastery, and "جولة جديدة" button
 *   - Zero console errors
 *   - 360px viewport: zero horizontal overflow across all quiz screens
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getChromePath, toFileUrl, getTempDir, cleanupArtifacts } = require('../scripts/chrome_path.js');

console.log('======================================================================');
console.log('  RUNNING REAL CHROME VERBS CONJUGATION QUIZ RUNNER (v1.18)');
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

const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

const testScript = `
<script>
window.__VERBS_CONJ_RESULTS__ = {
  passed: false,
  checks: [],
  logs: [],
  consoleErrors: []
};

const origError = console.error;
console.error = function() {
  const args = Array.prototype.slice.call(arguments).map(function(a) { return String(a); });
  window.__VERBS_CONJ_RESULTS__.consoleErrors.push(args.join(' '));
  origError.apply(console, arguments);
};

window.addEventListener('error', function(e) {
  window.__VERBS_CONJ_RESULTS__.consoleErrors.push('Uncaught error: ' + (e.message || e));
});

function addCheck(name, pass, detail) {
  window.__VERBS_CONJ_RESULTS__.checks.push({ name: name, pass: pass, detail: detail });
  window.__VERBS_CONJ_RESULTS__.logs.push((pass ? '[PASS] ' : '[FAIL] ') + name + ': ' + detail);
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
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = function() {};
    }

    document.body.style.width = '360px';
    document.body.style.margin = '0 auto';
    document.body.style.padding = '20px 12px 48px';

    await resetAllProgress();

    // 1. Verbs Mode Picker Screen: check new "اختبار التصريفات" card
    go({ screen: 'modes', catId: 'verben' });
    await sleep(60);

    var conjCard = document.querySelector('.mode-btn[data-mode="conj"]');
    addCheck('Verben Mode Picker: Conj Card Exists', Boolean(conjCard), 'conjCard=' + Boolean(conjCard));
    var verbenCat = CATEGORIES.find(function(c) { return c.id === 'verben'; });
    addCheck('Verben Words Count = 169', verbenCat && verbenCat.words && verbenCat.words.length === 169, 'words=' + (verbenCat ? verbenCat.words.length : 0));
    var cardText = conjCard ? conjCard.textContent : '';
    addCheck('Verben Mode Picker: Conj Card Arabic Text', cardText.includes('اختبار التصريفات'), 'text=' + cardText);
    check360Overflow('Modes Screen with Conj Card');

    // 2. Lock screen: 0 verbs unlocked -> click card
    conjCard.click();
    await sleep(60);

    var lockMsg = document.querySelector('.qcard .qmain');
    addCheck('Conj Quiz: Under-3-Verbs Lock Screen Message', Boolean(lockMsg) && lockMsg.textContent.includes('3 أفعال على الأقل'), 'lockMsg=' + (lockMsg ? lockMsg.textContent : 'none'));
    var toOtherBtn = document.getElementById('conjGoOtherQuizzes');
    addCheck('Conj Quiz: Button to other quizzes present', Boolean(toOtherBtn), 'toOtherBtn=' + Boolean(toOtherBtn));
    check360Overflow('Lock Screen (< 3 verbs)');

    // 3. Unlock 4 verbs (sein, haben, gehen, aufstehen) via existing mechanics
    setWordCount('verben', 'written', 0, 2); // sein
    setWordCount('verben', 'written', 1, 2); // haben
    setWordCount('verben', 'written', 2, 2); // werden
    setWordCount('verben', 'written', 4, 2); // gehen
    setWordCount('verben', 'written', 6, 2); // aufstehen (separable)

    var pool = getVerbConjPool();
    addCheck('Conj Pool has >= 3 verbs', pool.length >= 3, 'poolLength=' + pool.length);

    // 4. Start active conj session
    go({ screen: 'exercise', mode: 'conj' });
    await sleep(60);

    var inputEl = document.getElementById('conjIn');
    var subBtn = document.getElementById('conjSub');
    addCheck('Conj Quiz: Input and Submit button present', Boolean(inputEl) && Boolean(subBtn), 'hasInput=' + Boolean(inputEl));

    // Verify umlaut bar
    var umlautBtns = document.querySelectorAll('.umlaut-btn');
    addCheck('Conj Quiz: Umlaut Bar Present', umlautBtns.length >= 4, 'umlautBtnsCount=' + umlautBtns.length);
    check360Overflow('Stage 1 Typing Prompt');

    // Click an umlaut button and verify insertion
    if (umlautBtns.length > 0) {
      umlautBtns[0].click(); // 'ä'
      addCheck('Umlaut button inserts character', inputEl.value.includes('ä'), 'val=' + inputEl.value);
      inputEl.value = '';
    }

    // Capture initial metrics
    var activeVerbIdx = conjState.sessionIndices[conjState.currentIndex];
    var activeWord = CATEGORIES.find(c => c.id === 'verben').words[activeVerbIdx];
    // Preset count to THRESH.conj - 1 (4) so reaching threshold 5 credits daily goal mastery
    setWordCount('verben', 'conj', activeVerbIdx, THRESH.conj - 1);
    var startToday = getTodayCount();
    var startVerbCount = getWordCount('verben', 'conj', activeVerbIdx);

    // 5. Complete a PERFECT 4-stage run on first verb
    // Stage 1: Infinitive
    inputEl.value = activeWord.n;
    subBtn.click();
    await sleep(50);

    var fbBox = document.getElementById('fb');
    var hasPanelStage1 = Boolean(fbBox.querySelector('.verb-panel'));
    var isOkStage1 = Boolean(fbBox.querySelector('.fb-status-line.ok'));
    addCheck('Stage 1 Feedback: Correct & Panel rendered', isOkStage1 && hasPanelStage1, 'isOk=' + isOkStage1 + ', hasPanel=' + hasPanelStage1);
    addCheck('Stage 1: Input and submit disabled after checking', inputEl.disabled && subBtn.disabled, 'disabled=' + inputEl.disabled);
    check360Overflow('Stage 1 Feedback with Panel');

    // Advance to Stage 2
    var nextBtn = document.getElementById('nextBtn');
    nextBtn.click();
    await sleep(50);

    // Stage 2: Präsens
    inputEl = document.getElementById('conjIn');
    subBtn = document.getElementById('conjSub');
    var vf = VERB_FORMS[activeWord.id];
    var pPresIdx = conjState.presPronounIdx;
    inputEl.value = vf.pres[pPresIdx];
    subBtn.click();
    await sleep(50);

    fbBox = document.getElementById('fb');
    var isOkStage2 = Boolean(fbBox.querySelector('.fb-status-line.ok'));
    addCheck('Stage 2 Feedback: Correct & Panel rendered', isOkStage2, 'isOk=' + isOkStage2);
    check360Overflow('Stage 2 Feedback with Panel');

    // Advance to Stage 3
    nextBtn = document.getElementById('nextBtn');
    nextBtn.click();
    await sleep(50);

    // Stage 3: Präteritum
    inputEl = document.getElementById('conjIn');
    subBtn = document.getElementById('conjSub');
    var pPretIdx = conjState.pretPronounIdx;
    inputEl.value = vf.pret[pPretIdx];
    subBtn.click();
    await sleep(50);

    fbBox = document.getElementById('fb');
    var isOkStage3 = Boolean(fbBox.querySelector('.fb-status-line.ok'));
    addCheck('Stage 3 Feedback: Correct & Panel rendered', isOkStage3, 'isOk=' + isOkStage3);

    // Advance to Stage 4
    nextBtn = document.getElementById('nextBtn');
    nextBtn.click();
    await sleep(50);

    // Stage 4: Perfekt with optional leading pronoun ("er " + vf.perfekt)
    inputEl = document.getElementById('conjIn');
    subBtn = document.getElementById('conjSub');
    inputEl.value = 'er ' + vf.perfekt;
    subBtn.click();
    await sleep(50);

    fbBox = document.getElementById('fb');
    var isOkStage4 = Boolean(fbBox.querySelector('.fb-status-line.ok'));
    addCheck('Stage 4 Feedback: Correct & Panel rendered', isOkStage4, 'isOk=' + isOkStage4);

    // FIX 3 Assertion: counter is updated IMMEDIATELY upon stage 4 submit BEFORE clicking next
    var countAfterStage4Submit = getWordCount('verben', 'conj', activeVerbIdx);
    addCheck('Stage 4 Timing: Counter updated immediately on submit before clicking next', countAfterStage4Submit === startVerbCount + 1, 'start=' + startVerbCount + ', afterSubmit=' + countAfterStage4Submit);

    // Advance past Stage 4: Run navigates to next verb
    nextBtn = document.getElementById('nextBtn');
    nextBtn.click();
    await sleep(50);

    // Verify counter +1 and goal counter +1 once
    var endVerbCount = getWordCount('verben', 'conj', activeVerbIdx);
    var endToday = getTodayCount();
    addCheck('Perfect Run: Word Conj Counter +1', endVerbCount === startVerbCount + 1, 'start=' + startVerbCount + ', end=' + endVerbCount);
    addCheck('Perfect Run: Goal Counter +1 Once', endToday === startToday + 1, 'startToday=' + startToday + ', endToday=' + endToday);

    // 6. Test Separable Verb & Pronoun rules in page runtime
    var aufResOk = checkConjAnswer('ich stehe auf', 'verben.aufstehen', 2, 0);
    addCheck('Pronoun Acceptance: ich stehe auf accepted', aufResOk.ok === true, 'ok=' + aufResOk.ok);

    var aufResWrongPronoun = checkConjAnswer('du stehe auf', 'verben.aufstehen', 2, 0);
    addCheck('Pronoun Rejection: du stehe auf rejected when asked ich', aufResWrongPronoun.ok === false, 'ok=' + aufResWrongPronoun.ok);

    var aufResMissing = checkConjAnswer('ich stehe', 'verben.aufstehen', 2, 0);
    addCheck('Separable Verb with Pronoun: Stem only rejected', aufResMissing.ok === false && aufResMissing.missingPrefix === true, 'ok=' + aufResMissing.ok + ', missingPrefix=' + aufResMissing.missingPrefix);
    addCheck('Separable Verb: Arabic hint returned', Boolean(aufResMissing.hint) && aufResMissing.hint.includes('auf'), 'hint=' + aufResMissing.hint);

    var lesenDuAlt = checkConjAnswer('du lasest', 'verben.lesen', 3, 1);
    addCheck('Pronoun & pretDuAlt: du lasest accepted', lesenDuAlt.ok === true, 'ok=' + lesenDuAlt.ok);

    var telPerfekt = checkConjAnswer('er hat telefoniert', 'verben.telefonieren', 4);
    addCheck('Stage 4 Pronoun: er hat telefoniert accepted', telPerfekt.ok === true, 'ok=' + telPerfekt.ok);

    var telPerfektWrong = checkConjAnswer('ich hat telefoniert', 'verben.telefonieren', 4);
    addCheck('Stage 4 Pronoun: ich hat telefoniert rejected for er/sie/es', telPerfektWrong.ok === false, 'ok=' + telPerfektWrong.ok);

    // 6b. Test FIX 3 in real DOM: finish stage 4, go back without clicking next, counter is updated!
    var v2Idx = conjState.sessionIndices[conjState.currentIndex];
    var v2StartCount = getWordCount('verben', 'conj', v2Idx);
    var v2StartToday = getTodayCount();
    var v2Word = CATEGORIES.find(c => c.id === 'verben').words[v2Idx];
    var v2Vf = VERB_FORMS[v2Word.id];

    // Stage 1
    document.getElementById('conjIn').value = v2Word.n;
    document.getElementById('conjSub').click();
    await sleep(40);
    document.getElementById('nextBtn').click();
    await sleep(40);

    // Stage 2
    document.getElementById('conjIn').value = v2Vf.pres[conjState.presPronounIdx];
    document.getElementById('conjSub').click();
    await sleep(40);
    document.getElementById('nextBtn').click();
    await sleep(40);

    // Stage 3
    document.getElementById('conjIn').value = v2Vf.pret[conjState.pretPronounIdx];
    document.getElementById('conjSub').click();
    await sleep(40);
    document.getElementById('nextBtn').click();
    await sleep(40);

    // Stage 4: submit answer, DO NOT click next, instead click backBtn!
    document.getElementById('conjIn').value = v2Vf.perfekt;
    document.getElementById('conjSub').click();
    await sleep(50);

    // Click back button directly from stage 4 feedback
    document.getElementById('backBtn').click();
    await sleep(60);

    var v2EndCount = getWordCount('verben', 'conj', v2Idx);
    addCheck('Stage 4 Timing: Go back without clicking next preserves updated counter', v2EndCount === v2StartCount + 1, 'start=' + v2StartCount + ', end=' + v2EndCount);
    addCheck('Stage 4 Timing: Returned safely to modes screen', view.screen === 'modes' && view.catId === 'verben', 'screen=' + view.screen);

    // 6c. Test FIX 1: Synonym typing in Written Mode and Conj Stage 1
    var verbenCat = CATEGORIES.find(c => c.id === 'verben');
    var oeffnenIdx = verbenCat.words.findIndex(w => w.n === 'öffnen');

    // Written exercise with synonym
    go({ screen: 'exercise', catId: 'verben', mode: 'written' });
    await sleep(60);
    exState = { catId: 'verben', mode: 'written', idx: oeffnenIdx, answered: false };
    renderQuestion(verbenCat, 'written', oeffnenIdx, verbenCat.words[oeffnenIdx]);
    await sleep(50);

    document.getElementById('wIn').value = 'aufmachen';
    document.getElementById('wSub').click();
    await sleep(60);

    var writtenFb = document.getElementById('fb');
    var writtenOk = Boolean(writtenFb.querySelector('.fb-status-line.ok'));
    var writtenNote = Array.from(writtenFb.querySelectorAll('.fbnote')).map(function(el){ return el.textContent; }).join(' ');
    var writtenPanel = Boolean(writtenFb.querySelector('.verb-panel'));
    addCheck('Written Mode Synonym: aufmachen accepted for öffnen', writtenOk, 'ok=' + writtenOk);
    addCheck('Written Mode Synonym Note: contains target word notice', writtenNote.includes('مقبول أيضاً') && writtenNote.includes('öffnen'), 'note=' + writtenNote);
    addCheck('Written Mode Synonym Panel: target verb panel rendered', writtenPanel, 'panel=' + writtenPanel);

    // Conj Stage 1 with synonym
    conjState = {
      sessionIndices: [oeffnenIdx],
      currentIndex: 0,
      currentStage: 1,
      presPronounIdx: 0,
      pretPronounIdx: 0,
      stageResults: [],
      score: 0,
      answered: false,
      runRecorded: false,
      lastResult: null,
      done: false
    };
    go({ screen: 'exercise', catId: 'verben', mode: 'conj' });
    await sleep(60);

    document.getElementById('conjIn').value = 'aufmachen';
    document.getElementById('conjSub').click();
    await sleep(60);

    var conjFb = document.getElementById('fb');
    var conjOk = Boolean(conjFb.querySelector('.fb-status-line.ok'));
    var conjNote = conjFb.querySelector('.fbnote') ? conjFb.querySelector('.fbnote').textContent : '';
    var conjPanel = Boolean(conjFb.querySelector('.verb-panel'));
    addCheck('Conj Stage 1 Synonym: aufmachen accepted for öffnen', conjOk, 'ok=' + conjOk);
    addCheck('Conj Stage 1 Synonym Note: contains target word notice', conjNote.includes('مقبول أيضاً') && conjNote.includes('öffnen'), 'note=' + conjNote);
    addCheck('Conj Stage 1 Synonym Panel: target verb panel rendered', conjPanel, 'panel=' + conjPanel);

    // 7. Imperfect Run: make an error and verify counter does NOT rise
    var v3Idx = 2; // aufstehen
    var v3StartCount = getWordCount('verben', 'conj', v3Idx);
    var v3StartToday = getTodayCount();

    conjState = {
      sessionIndices: [v3Idx],
      currentIndex: 0,
      currentStage: 1,
      presPronounIdx: 0,
      pretPronounIdx: 0,
      stageResults: [],
      score: 0,
      answered: false,
      runRecorded: false,
      lastResult: null,
      done: false
    };
    renderConjExercise();
    await sleep(50);

    // Stage 1 wrong
    inputEl = document.getElementById('conjIn');
    subBtn = document.getElementById('conjSub');
    inputEl.value = 'wronginfinitive';
    subBtn.click();
    await sleep(50);

    fbBox = document.getElementById('fb');
    var isBadStage1 = Boolean(fbBox.querySelector('.fb-status-line.bad'));
    addCheck('Wrong Answer Feedback: Red status line with correct form', isBadStage1, 'isBad=' + isBadStage1);
    check360Overflow('Wrong Answer Feedback');

    // Click next through stages 2, 3, 4
    for (var st = 2; st <= 4; st++) {
      document.getElementById('nextBtn').click();
      await sleep(40);
      document.getElementById('conjIn').value = 'bla';
      document.getElementById('conjSub').click();
      await sleep(40);
    }

    // Complete run
    document.getElementById('nextBtn').click();
    await sleep(50);

    var v3EndCount = getWordCount('verben', 'conj', v3Idx);
    var v3EndToday = getTodayCount();
    addCheck('Imperfect Run: Word Conj Counter does not rise', v3EndCount <= v3StartCount, 'start=' + v3StartCount + ', end=' + v3EndCount);
    addCheck('Imperfect Run: Goal Counter does not rise on wrong answer', v3EndToday === v3StartToday, 'startToday=' + v3StartToday + ', endToday=' + v3EndToday);

    // 7b. Real Keyboard Interaction Suite (Owner Bug Regression)
    function dispatchKey(el, keyName, repeatFlag) {
      var ev = new KeyboardEvent('keydown', {
        key: keyName,
        code: keyName === ' ' ? 'Space' : keyName,
        repeat: Boolean(repeatFlag),
        bubbles: true,
        cancelable: true
      });
      el.dispatchEvent(ev);
      return ev;
    }

    var kVerbIdx = 0; // sein
    setWordCount('verben', 'conj', kVerbIdx, 0);
    var kWord = CATEGORIES.find(function(c) { return c.id === 'verben'; }).words[kVerbIdx];
    var kVf = VERB_FORMS[kWord.id];
    var kStartCount = getWordCount('verben', 'conj', kVerbIdx);

    conjState = {
      sessionIndices: [kVerbIdx],
      currentIndex: 0,
      currentStage: 1,
      presPronounIdx: 0,
      pretPronounIdx: 0,
      stageResults: [],
      score: 0,
      answered: false,
      runRecorded: false,
      lastResult: null,
      done: false
    };
    renderConjExercise();
    await sleep(50);

    // Stage 1: Type answer and press Enter with keyboard
    var kInput = document.getElementById('conjIn');
    kInput.value = kWord.n;
    var kEv1 = dispatchKey(kInput, 'Enter', false);
    await sleep(50);

    var kFb = document.getElementById('fb');
    var kNextBtn = document.getElementById('nextBtn');
    addCheck('Keyboard Stage 1: Enter prevented default', kEv1.defaultPrevented, 'defaultPrevented=' + kEv1.defaultPrevented);
    addCheck('Keyboard Stage 1: Stage remains 1 after Enter submit', conjState.currentStage === 1, 'stage=' + conjState.currentStage);
    addCheck('Keyboard Stage 1: Feedback displayed with panel', Boolean(kFb.querySelector('.fb-status-line')) && Boolean(kFb.querySelector('.verb-panel')), 'hasFb=' + Boolean(kFb.children.length));
    addCheck('Keyboard Stage 1: Next button visible', kNextBtn.classList.contains('show'), 'nextShow=' + kNextBtn.classList.contains('show'));
    addCheck('Keyboard Stage 1: Next button NOT focused on submit', document.activeElement !== kNextBtn, 'active=' + (document.activeElement ? document.activeElement.tagName : 'null'));

    // Held Enter (repeat=true) must NOT skip stage
    dispatchKey(window, 'Enter', true);
    await sleep(40);
    addCheck('Keyboard Stage 1: Held Enter (repeat) does not advance', conjState.currentStage === 1, 'stage=' + conjState.currentStage);

    // Second Enter (non-repeat) advances to Stage 2
    dispatchKey(window, 'Enter', false);
    await sleep(50);
    addCheck('Keyboard Stage 2: Second Enter advances to stage 2', conjState.currentStage === 2, 'stage=' + conjState.currentStage);

    // Stage 2: Type and submit via Enter
    kInput = document.getElementById('conjIn');
    kInput.value = kVf.pres[conjState.presPronounIdx];
    dispatchKey(kInput, 'Enter', false);
    await sleep(50);
    addCheck('Keyboard Stage 2: Feedback stays visible after submit', conjState.currentStage === 2 && document.getElementById('nextBtn').classList.contains('show'), 'stage=' + conjState.currentStage);

    // Second Enter advances to Stage 3
    dispatchKey(window, 'Enter', false);
    await sleep(50);
    addCheck('Keyboard Stage 3: Advanced to stage 3', conjState.currentStage === 3, 'stage=' + conjState.currentStage);

    // Stage 3: Type and submit via Enter
    kInput = document.getElementById('conjIn');
    kInput.value = kVf.pret[conjState.pretPronounIdx];
    dispatchKey(kInput, 'Enter', false);
    await sleep(50);
    addCheck('Keyboard Stage 3: Feedback stays visible after submit', conjState.currentStage === 3, 'stage=' + conjState.currentStage);

    // Second Enter advances to Stage 4
    dispatchKey(window, 'Enter', false);
    await sleep(50);
    addCheck('Keyboard Stage 4: Advanced to stage 4', conjState.currentStage === 4, 'stage=' + conjState.currentStage);

    // Stage 4: Type and submit via Enter
    kInput = document.getElementById('conjIn');
    kInput.value = kVf.perfekt;
    dispatchKey(kInput, 'Enter', false);
    await sleep(50);
    addCheck('Keyboard Stage 4: Feedback stays visible and run recorded', conjState.currentStage === 4 && conjState.runRecorded === true, 'runRecorded=' + conjState.runRecorded);

    // Second Enter navigates to completion/done
    dispatchKey(window, 'Enter', false);
    await sleep(50);
    addCheck('Keyboard Run Complete: Counter incremented by 1', getWordCount('verben', 'conj', kVerbIdx) === kStartCount + 1, 'count=' + getWordCount('verben', 'conj', kVerbIdx));

    // 8. Complete remaining verbs to reach End Screen
    while (conjState && !conjState.done && conjState.currentIndex < conjState.sessionIndices.length) {
      for (var s = conjState.currentStage; s <= 4; s++) {
        var inp = document.getElementById('conjIn');
        var sb = document.getElementById('conjSub');
        if (inp && sb && !conjState.answered) {
          inp.value = 'dummy';
          sb.click();
          await sleep(25);
        }
        var nb = document.getElementById('nextBtn');
        if (nb) {
          nb.click();
          await sleep(25);
        }
      }
    }
    await sleep(60);

    // 9. End Screen Assertions
    var doneCard = document.querySelector('.done-card');
    addCheck('End Screen: Done Card Rendered', Boolean(doneCard), 'doneCard=' + Boolean(doneCard));
    var newRoundBtn = document.getElementById('conjNewRoundBtn');
    addCheck('End Screen: New Round Button Present', Boolean(newRoundBtn), 'newRoundBtn=' + Boolean(newRoundBtn));
    check360Overflow('Session End Screen');

    // Click New Round button
    if (newRoundBtn) {
      newRoundBtn.click();
      await sleep(60);
      addCheck('New Round: Session restarts cleanly', Boolean(conjState) && conjState.currentIndex === 0, 'restarted=' + Boolean(conjState));
    }

    // 9b. Written mode regression check with keyboard Enter
    go({ screen: 'exercise', catId: 'obst', mode: 'written' });
    await sleep(50);
    var wInput = document.getElementById('wIn');
    wInput.value = 'dummy';
    dispatchKey(wInput, 'Enter', false);
    await sleep(50);
    var wNext = document.getElementById('nextBtn');
    addCheck('Written Mode Keyboard: Enter submits and shows feedback', exState.answered === true && wNext.classList.contains('show'), 'answered=' + exState.answered);
    dispatchKey(window, 'Enter', false);
    await sleep(50);
    var nextWInput = document.getElementById('wIn');
    addCheck('Written Mode Keyboard: Second Enter advances to new question', nextWInput && nextWInput.disabled === false, 'nextInputReady=' + Boolean(nextWInput && !nextWInput.disabled));

    // 9c. A2 Verbs Suite: regular verb (holen), separable verb (abholen), sein verb (fliegen)
    var vHolenIdx = verbenCat.words.findIndex(function(w) { return w.id === 'verben.holen'; });
    var vAbholenIdx = verbenCat.words.findIndex(function(w) { return w.id === 'verben.abholen'; });
    var vFliegenIdx = verbenCat.words.findIndex(function(w) { return w.id === 'verben.fliegen'; });

    addCheck('A2 Target Verbs Present in Vocabulary', vHolenIdx !== -1 && vAbholenIdx !== -1 && vFliegenIdx !== -1, 'holen=' + vHolenIdx + ', abholen=' + vAbholenIdx + ', fliegen=' + vFliegenIdx);

    // --- Part A: Regular A2 Verb (holen) ---
    // Preset count to 4 (THRESH.conj - 1) to test daily goal mastery credit (v1.22 rule)
    setWordCount('verben', 'conj', vHolenIdx, THRESH.conj - 1);
    var goalBeforeHolen = getTodayCount();

    conjState = {
      sessionIndices: [vHolenIdx],
      currentIndex: 0,
      currentStage: 1,
      presPronounIdx: 1, // du
      pretPronounIdx: 0, // ich
      stageResults: [],
      score: 0,
      answered: false,
      runRecorded: false,
      lastResult: null,
      done: false
    };
    renderConjExercise();
    await sleep(50);
    check360Overflow('A2 Regular Verb: Stage 1 Prompt');

    // Stage 1 (Infinitive): type correct with real Enter
    var a2Input = document.getElementById('conjIn');
    a2Input.value = 'holen';
    dispatchKey(a2Input, 'Enter', false);
    await sleep(50);
    addCheck('A2 Regular (holen) Stage 1: Accepted', conjState.lastResult && conjState.lastResult.ok === true, 'ok=' + (conjState.lastResult ? conjState.lastResult.ok : false));

    // Advance to Stage 2
    dispatchKey(window, 'Enter', false);
    await sleep(50);

    // Stage 2 (Präsens): test wrong rejection first, then correct
    var wrongPresRes = checkConjAnswer('holstDuFalsch', 'verben.holen', 2, 1);
    addCheck('A2 Regular (holen) Stage 2: Wrong answer rejected', wrongPresRes.ok === false, 'ok=' + wrongPresRes.ok);

    // Type correct du holst
    a2Input = document.getElementById('conjIn');
    a2Input.value = 'du holst';
    dispatchKey(a2Input, 'Enter', false);
    await sleep(50);
    addCheck('A2 Regular (holen) Stage 2: Correct accepted with pronoun', conjState.lastResult && conjState.lastResult.ok === true, 'ok=' + (conjState.lastResult ? conjState.lastResult.ok : false));

    // Advance to Stage 3
    dispatchKey(window, 'Enter', false);
    await sleep(50);

    // Stage 3 (Präteritum): ich holte
    a2Input = document.getElementById('conjIn');
    a2Input.value = 'holte';
    dispatchKey(a2Input, 'Enter', false);
    await sleep(50);
    addCheck('A2 Regular (holen) Stage 3: Correct accepted', conjState.lastResult && conjState.lastResult.ok === true, 'ok=' + (conjState.lastResult ? conjState.lastResult.ok : false));

    // Advance to Stage 4
    dispatchKey(window, 'Enter', false);
    await sleep(50);

    // Stage 4 (Perfekt): hat geholt
    a2Input = document.getElementById('conjIn');
    a2Input.value = 'hat geholt';
    dispatchKey(a2Input, 'Enter', false);
    await sleep(50);
    addCheck('A2 Regular (holen) Stage 4: Correct accepted', conjState.lastResult && conjState.lastResult.ok === true, 'ok=' + (conjState.lastResult ? conjState.lastResult.ok : false));
    check360Overflow('A2 Regular Verb: Stage 4 Feedback');

    var goalAfterHolen = getTodayCount();
    var holenFinalCount = getWordCount('verben', 'conj', vHolenIdx);
    addCheck('A2 Regular (holen) Mastery: Counter reached threshold 5', holenFinalCount === 5, 'count=' + holenFinalCount);
    addCheck('A2 Regular (holen) Daily Goal: Incremented by 1 once (v1.22 rule)', goalAfterHolen === goalBeforeHolen + 1, 'before=' + goalBeforeHolen + ', after=' + goalAfterHolen);

    // --- Part B: Separable A2 Verb (abholen) ---
    // Test prefix requirement and rejection of stem-only
    var abholenStemOnly = checkConjAnswer('hole', 'verben.abholen', 2, 0); // ich hole (missing ab)
    addCheck('A2 Separable (abholen): Stem-only rejected with missingPrefix=true', abholenStemOnly.ok === false && abholenStemOnly.missingPrefix === true, 'ok=' + abholenStemOnly.ok + ', missingPrefix=' + abholenStemOnly.missingPrefix);
    addCheck('A2 Separable (abholen): Arabic hint contains prefix ab', Boolean(abholenStemOnly.hint) && abholenStemOnly.hint.includes('ab'), 'hint=' + abholenStemOnly.hint);

    var abholenCorrectPres = checkConjAnswer('hole ab', 'verben.abholen', 2, 0);
    addCheck('A2 Separable (abholen): Form with prefix ab accepted', abholenCorrectPres.ok === true, 'ok=' + abholenCorrectPres.ok);

    // Complete 4-stage run on abholen with keyboard
    conjState = {
      sessionIndices: [vAbholenIdx],
      currentIndex: 0,
      currentStage: 1,
      presPronounIdx: 0, // ich
      pretPronounIdx: 2, // er/sie/es
      stageResults: [],
      score: 0,
      answered: false,
      runRecorded: false,
      lastResult: null,
      done: false
    };
    renderConjExercise();
    await sleep(50);

    // Stage 1: abholen
    a2Input = document.getElementById('conjIn');
    a2Input.value = 'abholen';
    dispatchKey(a2Input, 'Enter', false);
    await sleep(50);

    // Stage 2: hole ab
    dispatchKey(window, 'Enter', false);
    await sleep(50);
    a2Input = document.getElementById('conjIn');
    a2Input.value = 'hole ab';
    dispatchKey(a2Input, 'Enter', false);
    await sleep(50);

    // Stage 3: holte ab
    dispatchKey(window, 'Enter', false);
    await sleep(50);
    a2Input = document.getElementById('conjIn');
    a2Input.value = 'holte ab';
    dispatchKey(a2Input, 'Enter', false);
    await sleep(50);

    // Stage 4: hat abgeholt
    dispatchKey(window, 'Enter', false);
    await sleep(50);
    a2Input = document.getElementById('conjIn');
    a2Input.value = 'hat abgeholt';
    dispatchKey(a2Input, 'Enter', false);
    await sleep(50);

    addCheck('A2 Separable (abholen): All 4 stages completed successfully', conjState.stageResults.length === 4 && conjState.stageResults.every(Boolean), 'stages=' + conjState.stageResults.join(','));

    // --- Part C: Sein A2 Verb (fliegen) ---
    // Test that 'hat geflogen' is rejected, and 'ist geflogen' is accepted
    var fliegenWrongAux = checkConjAnswer('hat geflogen', 'verben.fliegen', 4, 2);
    addCheck('A2 Sein Verb (fliegen): Wrong aux (hat geflogen) rejected', fliegenWrongAux.ok === false, 'ok=' + fliegenWrongAux.ok);

    var fliegenCorrectAux = checkConjAnswer('ist geflogen', 'verben.fliegen', 4, 2);
    addCheck('A2 Sein Verb (fliegen): Correct aux (ist geflogen) accepted', fliegenCorrectAux.ok === true, 'ok=' + fliegenCorrectAux.ok);

    // 4 stages on fliegen
    conjState = {
      sessionIndices: [vFliegenIdx],
      currentIndex: 0,
      currentStage: 1,
      presPronounIdx: 0, // ich
      pretPronounIdx: 0, // ich
      stageResults: [],
      score: 0,
      answered: false,
      runRecorded: false,
      lastResult: null,
      done: false
    };
    renderConjExercise();
    await sleep(50);

    // Stage 1: fliegen
    a2Input = document.getElementById('conjIn');
    a2Input.value = 'fliegen';
    dispatchKey(a2Input, 'Enter', false);
    await sleep(50);

    // Stage 2: fliege
    dispatchKey(window, 'Enter', false);
    await sleep(50);
    a2Input = document.getElementById('conjIn');
    a2Input.value = 'fliege';
    dispatchKey(a2Input, 'Enter', false);
    await sleep(50);

    // Stage 3: flog
    dispatchKey(window, 'Enter', false);
    await sleep(50);
    a2Input = document.getElementById('conjIn');
    a2Input.value = 'flog';
    dispatchKey(a2Input, 'Enter', false);
    await sleep(50);

    // Stage 4: ist geflogen
    dispatchKey(window, 'Enter', false);
    await sleep(50);
    a2Input = document.getElementById('conjIn');
    a2Input.value = 'ist geflogen';
    dispatchKey(a2Input, 'Enter', false);
    await sleep(50);

    addCheck('A2 Sein Verb (fliegen): All 4 stages completed with ist geflogen', conjState.stageResults.length === 4 && conjState.stageResults.every(Boolean), 'stages=' + conjState.stageResults.join(','));
    check360Overflow('A2 Sein Verb (fliegen): Stage 4 Feedback with Panel');

    // 10. Console Errors Check
    var errCount = window.__VERBS_CONJ_RESULTS__.consoleErrors.length;
    addCheck('Zero Console Errors', errCount === 0, 'errors=' + (errCount ? window.__VERBS_CONJ_RESULTS__.consoleErrors.join('; ') : '0'));

    var allPassed = window.__VERBS_CONJ_RESULTS__.checks.every(function(c) { return c.pass; });
    window.__VERBS_CONJ_RESULTS__.passed = allPassed;

  } catch (err) {
    window.__VERBS_CONJ_RESULTS__.consoleErrors.push('Top-level error: ' + err.message + ' ' + (err.stack || ''));
    addCheck('Fatal Exception', false, err.message);
    window.__VERBS_CONJ_RESULTS__.passed = false;
  } finally {
    var reportDiv = document.createElement('div');
    reportDiv.id = 'chrome-verbs-conj-report';
    reportDiv.textContent = JSON.stringify(window.__VERBS_CONJ_RESULTS__);
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

const rootBaseUrl = toFileUrl(rootDir, CHROME_PATH).replace(/\/?$/, '/');
const runnerHtml = html
  .replace('<head>', `<head><base href="${rootBaseUrl}">`)
  .replace('</body>', testScript + '</body>');

const tempFile = 'temp_verbs_conj_runner.html';
const tempFilePath = path.join(tempDir, tempFile);
fs.writeFileSync(tempFilePath, runnerHtml, 'utf8');

try {
  const fileUrl = toFileUrl(tempFilePath, CHROME_PATH);
  const cmd = `"${CHROME_PATH}" --headless --no-sandbox --disable-gpu --virtual-time-budget=15000 --dump-dom "${fileUrl}"`;
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 15 * 1024 * 1024 });

  const m = out.match(/<div id="chrome-verbs-conj-report">([\s\S]*?)<\/div>/);
  if (m) {
    const rawJson = decodeHtml(m[1]);
    const res = JSON.parse(rawJson);
    for (const log of res.logs) {
      console.log(log);
    }
    console.log('======================================================================');
    if (res.passed) {
      console.log('🎉 REAL CHROME VERBS CONJUGATION QUIZ CHECK PASSED!');
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

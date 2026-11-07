// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Verbs Conjugation & App Keyboard Interaction (Release v1.18)', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', err => {
      console.error('[PAGE ERROR]', err.message);
    });
  });

  test('(a, b, c) Enter submits and feedback stays visible across stages; 2nd Enter advances; repeat Enter ignored', async ({ page }) => {
    const fileUrl = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(fileUrl);
    await page.waitForLoadState('domcontentloaded');

    // Setup 4 unlocked verbs so conj quiz can start
    await page.evaluate(async () => {
      if (typeof resetAllProgress === 'function') await resetAllProgress();
      setWordCount('verben', 'written', 0, 2);
      setWordCount('verben', 'written', 1, 2);
      setWordCount('verben', 'written', 2, 2);
      setWordCount('verben', 'written', 4, 2);
      go({ screen: 'exercise', mode: 'conj' });
    });

    await page.waitForSelector('#conjIn');

    // STAGE 1
    let stage = await page.evaluate(() => conjState.currentStage);
    expect(stage).toBe(1);

    // Type wrong answer using real keyboard
    await page.keyboard.type('falscheAntwort');
    // First Enter: submit
    await page.keyboard.press('Enter');

    // Assert stage unchanged, feedback visible, Next button visible, input disabled
    let state1 = await page.evaluate(() => ({
      stage: conjState.currentStage,
      fbText: document.getElementById('fb').textContent.trim(),
      nextVisible: document.getElementById('nextBtn').classList.contains('show'),
      inputDisabled: document.getElementById('conjIn').disabled,
      hasPanel: Boolean(document.querySelector('.verb-panel'))
    }));

    expect(state1.stage).toBe(1);
    expect(state1.nextVisible).toBe(true);
    expect(state1.inputDisabled).toBe(true);
    expect(state1.fbText.length).toBeGreaterThan(0);
    expect(state1.hasPanel).toBe(true);

    // Test holding Enter (repeats) - must NOT advance or skip
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      windowsVirtualKeyCode: 13,
      unmodifiedText: '\r',
      text: '\r',
      code: 'Enter',
      key: 'Enter',
      autoRepeat: true
    });
    // Also test repeating DOM event
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', repeat: true, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(100);

    let stageStill1 = await page.evaluate(() => conjState.currentStage);
    expect(stageStill1).toBe(1);

    // Second Enter (non-repeat): advance to Stage 2
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    let stage2 = await page.evaluate(() => conjState.currentStage);
    expect(stage2).toBe(2);

    let inputFocusedStage2 = await page.evaluate(() => document.activeElement === document.getElementById('conjIn'));
    expect(inputFocusedStage2).toBe(true);

    // STAGE 2
    await page.keyboard.type('falsch2');
    await page.keyboard.press('Enter');

    let state2 = await page.evaluate(() => ({
      stage: conjState.currentStage,
      fbText: document.getElementById('fb').textContent.trim(),
      nextVisible: document.getElementById('nextBtn').classList.contains('show'),
      inputDisabled: document.getElementById('conjIn').disabled
    }));
    expect(state2.stage).toBe(2);
    expect(state2.nextVisible).toBe(true);
    expect(state2.inputDisabled).toBe(true);

    // Advance to Stage 3 via Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    let stage3 = await page.evaluate(() => conjState.currentStage);
    expect(stage3).toBe(3);

    // STAGE 3
    await page.keyboard.type('falsch3');
    await page.keyboard.press('Enter');

    let state3 = await page.evaluate(() => ({
      stage: conjState.currentStage,
      fbText: document.getElementById('fb').textContent.trim(),
      nextVisible: document.getElementById('nextBtn').classList.contains('show'),
      inputDisabled: document.getElementById('conjIn').disabled
    }));
    expect(state3.stage).toBe(3);
    expect(state3.nextVisible).toBe(true);

    // Advance to Stage 4 via Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    let stage4 = await page.evaluate(() => conjState.currentStage);
    expect(stage4).toBe(4);

    // STAGE 4
    await page.keyboard.type('falsch4');
    await page.keyboard.press('Enter');

    let state4 = await page.evaluate(() => ({
      stage: conjState.currentStage,
      fbText: document.getElementById('fb').textContent.trim(),
      nextVisible: document.getElementById('nextBtn').classList.contains('show'),
      runRecorded: conjState.runRecorded
    }));
    expect(state4.stage).toBe(4);
    expect(state4.nextVisible).toBe(true);
    expect(state4.runRecorded).toBe(true);
  });

  test('(d) A full perfect run typed and advanced ONLY with keyboard updates counter once', async ({ page }) => {
    const fileUrl = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(fileUrl);
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate(async () => {
      if (typeof resetAllProgress === 'function') await resetAllProgress();
      setWordCount('verben', 'written', 0, 2);
      setWordCount('verben', 'written', 1, 2);
      setWordCount('verben', 'written', 2, 2);
      setWordCount('verben', 'written', 4, 2);
      go({ screen: 'exercise', mode: 'conj' });
    });

    await page.waitForSelector('#conjIn');

    const activeVerbIdx = await page.evaluate(() => conjState.sessionIndices[conjState.currentIndex]);
    const initCounter = await page.evaluate((idx) => getWordCount('verben', 'conj', idx), activeVerbIdx);
    expect(initCounter).toBe(0);

    // Complete all 4 stages correctly using real keyboard typing and Enter keys
    for (let st = 1; st <= 4; st++) {
      const expectedAnswer = await page.evaluate((currStage) => {
        const vIdx = conjState.sessionIndices[conjState.currentIndex];
        const w = CATEGORIES.find(c => c.id === 'verben').words[vIdx];
        const vf = VERB_FORMS[w.id];
        if (currStage === 1) return w.n;
        if (currStage === 2) return vf.pres[conjState.presPronounIdx];
        if (currStage === 3) return vf.pret[conjState.pretPronounIdx];
        if (currStage === 4) return vf.perfekt;
        return '';
      }, st);

      // Type expected answer
      await page.keyboard.type(expectedAnswer);
      // Press Enter to submit
      await page.keyboard.press('Enter');

      // Verify correct feedback shown and stage not jumped prematurely
      const stageAfterSubmit = await page.evaluate(() => conjState.currentStage);
      expect(stageAfterSubmit).toBe(st);

      const isOk = await page.evaluate(() => document.querySelector('.fb-status-line.ok') !== null);
      expect(isOk).toBe(true);

      // Press Enter to advance
      await page.keyboard.press('Enter');
      await page.waitForTimeout(100);
    }

    // Verify counter updated exactly +1
    const postCounter = await page.evaluate((idx) => getWordCount('verben', 'conj', idx), activeVerbIdx);
    expect(postCounter).toBe(1);
  });

  test('(keyboard accessibility) Tab reaches Next button and Enter/Space activates it', async ({ page }) => {
    const fileUrl = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(fileUrl);
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate(async () => {
      if (typeof resetAllProgress === 'function') await resetAllProgress();
      setWordCount('verben', 'written', 0, 2);
      setWordCount('verben', 'written', 1, 2);
      setWordCount('verben', 'written', 2, 2);
      go({ screen: 'exercise', mode: 'conj' });
    });

    await page.waitForSelector('#conjIn');

    // Submit stage 1
    await page.keyboard.type('test');
    await page.keyboard.press('Enter');

    // Next button should be reachable and focused
    const nextBtn = page.locator('#nextBtn');
    await nextBtn.focus();
    expect(await page.evaluate(() => document.activeElement === document.getElementById('nextBtn'))).toBe(true);

    // Press Space on focused button
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);

    const stageAfterSpace = await page.evaluate(() => conjState.currentStage);
    expect(stageAfterSpace).toBe(2);
  });

  test('(e) Written exercise Enter submission and second Enter advance behaves correctly', async ({ page }) => {
    const fileUrl = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(fileUrl);
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate(async () => {
      if (typeof resetAllProgress === 'function') await resetAllProgress();
      go({ screen: 'exercise', catId: 'obst', mode: 'written' });
    });

    await page.waitForSelector('#wIn');

    // Type answer
    await page.keyboard.type('falscheAntwort');
    // First Enter: submit
    await page.keyboard.press('Enter');

    const stateWritten = await page.evaluate(() => ({
      answered: exState.answered,
      inputDisabled: document.getElementById('wIn').disabled,
      nextVisible: document.getElementById('nextBtn').classList.contains('show'),
      fbVisible: document.getElementById('fb').children.length > 0
    }));

    expect(stateWritten.answered).toBe(true);
    expect(stateWritten.inputDisabled).toBe(true);
    expect(stateWritten.nextVisible).toBe(true);
    expect(stateWritten.fbVisible).toBe(true);

    // Second Enter: advance to next question
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    const secondQuestionInput = await page.evaluate(() => {
      const input = document.getElementById('wIn');
      return {
        exists: Boolean(input),
        disabled: input ? input.disabled : null,
        value: input ? input.value : null
      };
    });

    expect(secondQuestionInput.exists).toBe(true);
    expect(secondQuestionInput.disabled).toBe(false);
    expect(secondQuestionInput.value).toBe('');
  });

  test('(e) Search input Enter does not trigger unintended navigation or errors', async ({ page }) => {
    const fileUrl = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(fileUrl);
    await page.waitForLoadState('domcontentloaded');

    await page.waitForSelector('#vocabSearchInput');
    await page.keyboard.type('Haus');
    await page.keyboard.press('Enter');

    const currentScreen = await page.evaluate(() => view.screen);
    expect(currentScreen).toBe('home');
  });

  test('(f) Verbs conj quiz: 263 verbs, real key events for abholen (A2 separable), fliegen (A2 sein), überlegen (B1 inseparable), ausfallen (B1 separable+sein), vorschlagen (B1 separable strong)', async ({ page }) => {
    // 360px viewport
    await page.setViewportSize({ width: 360, height: 640 });
    const fileUrl = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(fileUrl);
    await page.waitForLoadState('domcontentloaded');

    // 1. Check verbs section has 263 words
    const verbsCount = await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'verben');
      return cat ? cat.words.length : 0;
    });
    expect(verbsCount).toBe(263);

    // 2. Set up progress with target verbs
    const setupData = await page.evaluate(async () => {
      if (typeof resetAllProgress === 'function') await resetAllProgress();
      const cat = CATEGORIES.find(c => c.id === 'verben');
      const vHolenIdx = cat.words.findIndex(w => w.id === 'verben.holen');
      const vAbholenIdx = cat.words.findIndex(w => w.id === 'verben.abholen');
      const vFliegenIdx = cat.words.findIndex(w => w.id === 'verben.fliegen');
      const vUeberlegenIdx = cat.words.findIndex(w => w.id === 'verben.ueberlegen');
      const vAusfallenIdx = cat.words.findIndex(w => w.id === 'verben.ausfallen');
      const vVorschlagenIdx = cat.words.findIndex(w => w.id === 'verben.vorschlagen');

      // Unlock them in written mode so pool >= 3
      setWordCount('verben', 'written', vHolenIdx, 2);
      setWordCount('verben', 'written', vAbholenIdx, 2);
      setWordCount('verben', 'written', vFliegenIdx, 2);
      setWordCount('verben', 'written', vUeberlegenIdx, 2);
      setWordCount('verben', 'written', vAusfallenIdx, 2);
      setWordCount('verben', 'written', vVorschlagenIdx, 2);

      return { vHolenIdx, vAbholenIdx, vFliegenIdx, vUeberlegenIdx, vAusfallenIdx, vVorschlagenIdx };
    });

    // Helper to start a clean 1-verb session
    async function startSession(verbIdx) {
      await page.evaluate(({ idx }) => {
        conjState = {
          sessionIndices: [idx],
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
      }, { idx: verbIdx });
      await page.waitForSelector('#conjIn');
    }

    // 3. Test Regular Verb (holen) in Conj Quiz (with wrong stage 2 attempt)
    await page.evaluate(({ vHolenIdx }) => {
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
    }, { vHolenIdx: setupData.vHolenIdx });

    await page.waitForSelector('#conjIn');

    // Stage 1: Type holen
    await page.keyboard.type('holen');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    let s1Ok = await page.evaluate(() => conjState.lastResult && conjState.lastResult.ok);
    expect(s1Ok).toBe(true);

    // 2nd Enter: advance to stage 2
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);

    // Stage 2: Type wrong first
    await page.keyboard.type('falsch');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    let s2Wrong = await page.evaluate(() => conjState.lastResult && conjState.lastResult.ok);
    expect(s2Wrong).toBe(false);

    // Advance to Stage 3
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);

    // Stage 3: Type holte
    await page.keyboard.type('holte');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    let s3Ok = await page.evaluate(() => conjState.lastResult && conjState.lastResult.ok);
    expect(s3Ok).toBe(true);

    // Advance to Stage 4
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);

    // Stage 4: Type hat geholt
    await page.keyboard.type('hat geholt');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    let s4Ok = await page.evaluate(() => conjState.lastResult && conjState.lastResult.ok);
    expect(s4Ok).toBe(true);

    // 4. Test Separable Verb (abholen):
    // 4a. Negative check: prefix requirement (stem only without prefix rejected)
    await startSession(setupData.vAbholenIdx);
    await page.keyboard.type('abholen');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter'); // advance to Stage 2
    await page.waitForTimeout(50);

    await page.keyboard.type('hole');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const abholenStemRes = await page.evaluate(() => ({
      ok: conjState.lastResult.ok,
      missingPrefix: conjState.lastResult.missingPrefix,
      hint: conjState.lastResult.hint
    }));
    expect(abholenStemRes.ok).toBe(false);
    expect(abholenStemRes.missingPrefix).toBe(true);
    expect(abholenStemRes.hint).toContain('ab');

    // 4b. POSITIVE full 4-stage path for abholen with real keys + 🎯 mastery threshold crossing
    await page.evaluate(({ vAbholenIdx }) => {
      setWordCount('verben', 'conj', vAbholenIdx, 4); // preset threshold - 1
    }, { vAbholenIdx: setupData.vAbholenIdx });
    const goalBeforeAbholen = await page.evaluate(() => getTodayCount());

    await startSession(setupData.vAbholenIdx);
    // Stage 1: abholen
    await page.keyboard.type('abholen');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => conjState.lastResult.ok)).toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);

    // Stage 2: hole ab
    await page.keyboard.type('hole ab');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => conjState.lastResult.ok)).toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);

    // Stage 3: holte ab
    await page.keyboard.type('holte ab');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => conjState.lastResult.ok)).toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);

    // Stage 4: hat abgeholt
    await page.keyboard.type('hat abgeholt');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => conjState.lastResult.ok)).toBe(true);

    const abholenResult = await page.evaluate(({ vAbholenIdx }) => ({
      allStagesOk: conjState.stageResults.length === 4 && conjState.stageResults.every(Boolean),
      count: getWordCount('verben', 'conj', vAbholenIdx),
      todayCount: getTodayCount()
    }), { vAbholenIdx: setupData.vAbholenIdx });
    expect(abholenResult.allStagesOk).toBe(true);
    expect(abholenResult.count).toBe(5);
    expect(abholenResult.todayCount).toBe(goalBeforeAbholen + 1);

    // 5. Test Sein Verb (fliegen):
    // 5a. Negative check: wrong aux ('hat geflogen') rejected
    await startSession(setupData.vFliegenIdx);
    // Navigate straight to stage 4 for negative test
    await page.evaluate(() => {
      conjState.currentStage = 4;
      renderConjExercise();
    });
    await page.waitForSelector('#conjIn');
    await page.keyboard.type('hat geflogen');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => conjState.lastResult.ok)).toBe(false);

    // 5b. POSITIVE full 4-stage path for fliegen with real keys + 🎯 mastery threshold crossing
    await page.evaluate(({ vFliegenIdx }) => {
      setWordCount('verben', 'conj', vFliegenIdx, 4);
    }, { vFliegenIdx: setupData.vFliegenIdx });
    const goalBeforeFliegen = await page.evaluate(() => getTodayCount());

    await startSession(setupData.vFliegenIdx);
    // Stage 1: fliegen
    await page.keyboard.type('fliegen');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => conjState.lastResult.ok)).toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);

    // Stage 2: fliege
    await page.keyboard.type('fliege');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => conjState.lastResult.ok)).toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);

    // Stage 3: flog
    await page.keyboard.type('flog');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => conjState.lastResult.ok)).toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);

    // Stage 4: ist geflogen
    await page.keyboard.type('ist geflogen');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => conjState.lastResult.ok)).toBe(true);

    const fliegenResult = await page.evaluate(({ vFliegenIdx }) => ({
      allStagesOk: conjState.stageResults.length === 4 && conjState.stageResults.every(Boolean),
      count: getWordCount('verben', 'conj', vFliegenIdx),
      todayCount: getTodayCount()
    }), { vFliegenIdx: setupData.vFliegenIdx });
    expect(fliegenResult.allStagesOk).toBe(true);
    expect(fliegenResult.count).toBe(5);
    expect(fliegenResult.todayCount).toBe(goalBeforeFliegen + 1);

    // 6. Test B1 Inseparable Verb (überlegen):
    // POSITIVE full 4-stage path (stage 4: 'hat überlegt', no ge-) + 🎯 mastery threshold crossing
    await page.evaluate(({ vUeberlegenIdx }) => {
      setWordCount('verben', 'conj', vUeberlegenIdx, 4);
    }, { vUeberlegenIdx: setupData.vUeberlegenIdx });
    const goalBeforeUeberlegen = await page.evaluate(() => getTodayCount());

    await startSession(setupData.vUeberlegenIdx);
    // Stage 1: überlegen
    await page.keyboard.type('überlegen');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => conjState.lastResult.ok)).toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);

    // Stage 2: überlege
    await page.keyboard.type('überlege');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => conjState.lastResult.ok)).toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);

    // Stage 3: überlegte
    await page.keyboard.type('überlegte');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => conjState.lastResult.ok)).toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);

    // Stage 4: hat überlegt (inseparable weak without ge-)
    await page.keyboard.type('hat überlegt');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => conjState.lastResult.ok)).toBe(true);

    const ueberlegenResult = await page.evaluate(({ vUeberlegenIdx }) => ({
      allStagesOk: conjState.stageResults.length === 4 && conjState.stageResults.every(Boolean),
      count: getWordCount('verben', 'conj', vUeberlegenIdx),
      todayCount: getTodayCount()
    }), { vUeberlegenIdx: setupData.vUeberlegenIdx });
    expect(ueberlegenResult.allStagesOk).toBe(true);
    expect(ueberlegenResult.count).toBe(5);
    expect(ueberlegenResult.todayCount).toBe(goalBeforeUeberlegen + 1);

    // 7. Test B1 Separable + Sein (ausfallen):
    // 7a. Negative checks
    await startSession(setupData.vAusfallenIdx);
    await page.keyboard.type('ausfallen');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter'); // Stage 2
    await page.waitForTimeout(50);
    // Stem only without prefix: falle
    await page.keyboard.type('falle');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => conjState.lastResult.missingPrefix)).toBe(true);

    // 7b. POSITIVE full 4-stage path for ausfallen with real keys + 🎯 mastery threshold crossing
    await page.evaluate(({ vAusfallenIdx }) => {
      setWordCount('verben', 'conj', vAusfallenIdx, 4);
    }, { vAusfallenIdx: setupData.vAusfallenIdx });
    const goalBeforeAusfallen = await page.evaluate(() => getTodayCount());

    await startSession(setupData.vAusfallenIdx);
    // Stage 1: ausfallen
    await page.keyboard.type('ausfallen');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => conjState.lastResult.ok)).toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);

    // Stage 2: falle aus
    await page.keyboard.type('falle aus');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => conjState.lastResult.ok)).toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);

    // Stage 3: fiel aus
    await page.keyboard.type('fiel aus');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => conjState.lastResult.ok)).toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);

    // Stage 4: ist ausgefallen
    await page.keyboard.type('ist ausgefallen');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => conjState.lastResult.ok)).toBe(true);

    const ausfallenResult = await page.evaluate(({ vAusfallenIdx }) => ({
      allStagesOk: conjState.stageResults.length === 4 && conjState.stageResults.every(Boolean),
      count: getWordCount('verben', 'conj', vAusfallenIdx),
      todayCount: getTodayCount()
    }), { vAusfallenIdx: setupData.vAusfallenIdx });
    expect(ausfallenResult.allStagesOk).toBe(true);
    expect(ausfallenResult.count).toBe(5);
    expect(ausfallenResult.todayCount).toBe(goalBeforeAusfallen + 1);

    // 8. Test B1 Separable Strong (vorschlagen):
    // 8a. Negative check
    await startSession(setupData.vVorschlagenIdx);
    await page.keyboard.type('vorschlagen');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter'); // Stage 2
    await page.waitForTimeout(50);
    await page.keyboard.type('schlage');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => conjState.lastResult.missingPrefix)).toBe(true);

    // 8b. POSITIVE full 4-stage path for vorschlagen with real keys + 🎯 mastery threshold crossing
    await page.evaluate(({ vVorschlagenIdx }) => {
      setWordCount('verben', 'conj', vVorschlagenIdx, 4);
    }, { vVorschlagenIdx: setupData.vVorschlagenIdx });
    const goalBeforeVorschlagen = await page.evaluate(() => getTodayCount());

    await startSession(setupData.vVorschlagenIdx);
    // Stage 1: vorschlagen
    await page.keyboard.type('vorschlagen');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => conjState.lastResult.ok)).toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);

    // Stage 2: schlage vor
    await page.keyboard.type('schlage vor');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => conjState.lastResult.ok)).toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);

    // Stage 3: schlug vor
    await page.keyboard.type('schlug vor');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => conjState.lastResult.ok)).toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);

    // Stage 4: hat vorgeschlagen
    await page.keyboard.type('hat vorgeschlagen');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => conjState.lastResult.ok)).toBe(true);

    const vorschlagenResult = await page.evaluate(({ vVorschlagenIdx }) => ({
      allStagesOk: conjState.stageResults.length === 4 && conjState.stageResults.every(Boolean),
      count: getWordCount('verben', 'conj', vVorschlagenIdx),
      todayCount: getTodayCount()
    }), { vVorschlagenIdx: setupData.vVorschlagenIdx });
    expect(vorschlagenResult.allStagesOk).toBe(true);
    expect(vorschlagenResult.count).toBe(5);
    expect(vorschlagenResult.todayCount).toBe(goalBeforeVorschlagen + 1);

    // Verify 360px overflow
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > 360 || document.body.scrollWidth > 360;
    });
    expect(overflow).toBe(false);
  });
});

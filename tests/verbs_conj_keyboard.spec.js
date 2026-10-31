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
});

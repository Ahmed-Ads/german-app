// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('New Categories Real Keyboard Interaction & Rules (Task 6d)', () => {
  const fileUrl = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

  test.beforeEach(async ({ page }) => {
    page.on('pageerror', err => {
      console.error('[PAGE ERROR]', err.message);
    });
    await page.goto(fileUrl);
    await page.waitForLoadState('domcontentloaded');
  });

  test('1. Home screen shows 33 category cards without overflow at 360px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.waitForSelector('#app');

    const cardCount = await page.evaluate(() => {
      return document.querySelectorAll('.cat-card[data-cat]').length;
    });
    expect(cardCount).toBe(33);

    // Verify both new categories are present in the DOM
    const hasGesundheit = await page.evaluate(() => {
      const card = document.querySelector('.cat-card[data-cat="gesundheit"]');
      return card !== null && card.textContent.includes('الصحة');
    });
    expect(hasGesundheit).toBe(true);

    const hasEinkaufen = await page.evaluate(() => {
      const card = document.querySelector('.cat-card[data-cat="einkaufen"]');
      return card !== null && card.textContent.includes('التسوق');
    });
    expect(hasEinkaufen).toBe(true);

    // Verify 360px horizontal overflow
    const overflowInfo = await page.evaluate(() => {
      const docEl = document.documentElement;
      const body = document.body;
      const scrollW = Math.max(docEl.scrollWidth, body.scrollWidth);
      return {
        scrollW,
        clientWidth: docEl.clientWidth,
        hasHorizontalScroll: scrollW > 360.5
      };
    });
    expect(overflowInfo.hasHorizontalScroll).toBe(false);
  });

  test('2. Einkaufen: written mode on einkaufen.preis accepts correct answer and rejects wrong article', async ({ page }) => {
    // Navigate to written mode with einkaufen.preis
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'einkaufen');
      const pIdx = cat.words.findIndex(w => w.id === 'einkaufen.preis');
      ensureProgress('einkaufen', 'written').unlocked = Math.max(ensureProgress('einkaufen', 'written').unlocked, pIdx + 1);
      go({ screen: 'exercise', catId: 'einkaufen', mode: 'written' });
      exState = { catId: 'einkaufen', mode: 'written', idx: pIdx, answered: false };
      renderQuestion(cat, 'written', pIdx, cat.words[pIdx]);
    });

    await page.waitForSelector('#wIn');

    // Focus input and type wrong article using real keyboard: "die Preis"
    await page.locator('#wIn').focus();
    await page.keyboard.type('die Preis');
    await page.keyboard.press('Enter');

    // Expect rejection (wrong article feedback)
    const wrongFb = await page.evaluate(() => {
      const fb = document.getElementById('fb');
      const statusLine = fb.querySelector('.fb-status-line');
      const isBad = statusLine !== null && statusLine.classList.contains('bad');
      const nextVisible = document.getElementById('nextBtn').classList.contains('show');
      return { isBad, nextVisible, fbText: fb.textContent.trim() };
    });
    expect(wrongFb.isBad).toBe(true);
    expect(wrongFb.nextVisible).toBe(true);

    // Reset exercise state for einkaufen.preis to test correct answer
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'einkaufen');
      const pIdx = cat.words.findIndex(w => w.id === 'einkaufen.preis');
      exState = { catId: 'einkaufen', mode: 'written', idx: pIdx, answered: false };
      renderQuestion(cat, 'written', pIdx, cat.words[pIdx]);
    });

    await page.waitForSelector('#wIn');
    await page.locator('#wIn').focus();
    // Type correct answer with real keyboard: "der Preis"
    await page.keyboard.type('der Preis');
    await page.keyboard.press('Enter');

    // Expect acceptance (correct feedback)
    const correctFb = await page.evaluate(() => {
      const fb = document.getElementById('fb');
      const statusLine = fb.querySelector('.fb-status-line');
      const isOk = statusLine !== null && statusLine.classList.contains('ok');
      const nextVisible = document.getElementById('nextBtn').classList.contains('show');
      const inputDisabled = document.getElementById('wIn').disabled;
      return { isOk, nextVisible, inputDisabled, fbText: fb.textContent.trim() };
    });
    expect(correctFb.isOk).toBe(true);
    expect(correctFb.nextVisible).toBe(true);
    expect(correctFb.inputDisabled).toBe(true);
  });

  test('3. Einkaufen: plural quiz on einkaufen.preis accepts "die Preise" via real keyboard', async ({ page }) => {
    // Navigate to plural mode for einkaufen.preis
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'einkaufen');
      const pIdx = cat.words.findIndex(w => w.id === 'einkaufen.preis');
      ensureProgress('einkaufen', 'plural').unlocked = Math.max(ensureProgress('einkaufen', 'plural').unlocked, pIdx + 1);
      go({ screen: 'exercise', catId: 'einkaufen', mode: 'plural' });
      exState = { catId: 'einkaufen', mode: 'plural', idx: pIdx, answered: false };
      renderQuestion(cat, 'plural', pIdx, cat.words[pIdx]);
    });

    await page.waitForSelector('#qzone .options .opt');

    // Determine the 1-based shortcut key corresponding to "die Preise"
    const targetKey = await page.evaluate(() => {
      const opts = Array.from(document.querySelectorAll('#qzone .options .opt'));
      const idx = opts.findIndex(o => o.getAttribute('data-val') === 'die Preise');
      return idx >= 0 ? idx + 1 : -1;
    });
    expect(targetKey).toBeGreaterThan(0);

    // Press the real numeric key
    await page.keyboard.press(String(targetKey));

    // Verify answer is accepted as correct
    const pluralFb = await page.evaluate(() => {
      const fb = document.getElementById('fb');
      const statusLine = fb.querySelector('.fb-status-line');
      const isOk = statusLine !== null && statusLine.classList.contains('ok');
      const nextVisible = document.getElementById('nextBtn').classList.contains('show');
      return { isOk, nextVisible, fbText: fb.textContent.trim() };
    });
    expect(pluralFb.isOk).toBe(true);
    expect(pluralFb.nextVisible).toBe(true);
  });

  test('4. Einkaufen: plural-less word (einkaufen.geld) is never asked in plural mode', async ({ page }) => {
    const checkResult = await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'einkaufen');
      const geld = cat.words.find(w => w.id === 'einkaufen.geld');
      const geldIdx = cat.words.indexOf(geld);

      // Verify geld has pl: null in vocabulary
      const plIsNull = geld.pl === null;

      // Sample pickQuestionIndex 100 times in plural mode
      let geldWasPicked = false;
      for (let i = 0; i < 100; i++) {
        const pickedIdx = pickQuestionIndex('einkaufen', 'plural');
        if (pickedIdx === geldIdx) {
          geldWasPicked = true;
          break;
        }
      }

      return { plIsNull, geldWasPicked };
    });

    expect(checkResult.plIsNull).toBe(true);
    expect(checkResult.geldWasPicked).toBe(false);
  });

  test('5. Goal counter 🎯 follows v1.22 rule when einkaufen.preis reaches threshold', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const cat = CATEGORIES.find(c => c.id === 'einkaufen');
      const pIdx = cat.words.findIndex(w => w.id === 'einkaufen.preis');
      const th = threshFor('written');

      // Initialize stats and preset count to threshold - 1
      stats.todayCount = 0;
      stats.dailyGoal = stats.dailyGoal || 20;
      ensureProgress('einkaufen', 'written').unlocked = Math.max(ensureProgress('einkaufen', 'written').unlocked, pIdx + 1);
      setWordCount('einkaufen', 'written', pIdx, th - 1);
      refreshGoalDisplay();

      const initialCount = getTodayCount();
      const initialGoalText = document.querySelector('#headGoalBtn .goal-num')?.textContent.trim();

      // Trigger exercise and answer correctly
      go({ screen: 'exercise', catId: 'einkaufen', mode: 'written' });
      exState = { catId: 'einkaufen', mode: 'written', idx: pIdx, answered: false };
      renderQuestion(cat, 'written', pIdx, cat.words[pIdx]);

      return { initialCount, initialGoalText, th, pIdx };
    });

    expect(result.initialCount).toBe(0);

    // Answer correctly using real keyboard
    await page.waitForSelector('#wIn');
    await page.locator('#wIn').focus();
    await page.keyboard.type('der Preis');
    await page.keyboard.press('Enter');

    // Verify counter incremented
    const afterResult = await page.evaluate(() => {
      const todayCount = getTodayCount();
      const goalText = document.querySelector('#headGoalBtn .goal-num')?.textContent.trim();
      const finalCount = getWordCount('einkaufen', 'written', 'einkaufen.preis');
      return { todayCount, goalText, finalCount };
    });

    expect(afterResult.finalCount).toBe(result.th);
    expect(afterResult.todayCount).toBe(1);
    expect(afterResult.goalText).toBe('1/20');

    // Answer again (already mastered in written mode) -> should NOT increment again (no double counting)
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'einkaufen');
      const pIdx = cat.words.findIndex(w => w.id === 'einkaufen.preis');
      exState = { catId: 'einkaufen', mode: 'written', idx: pIdx, answered: false };
      renderQuestion(cat, 'written', pIdx, cat.words[pIdx]);
    });
    await page.waitForSelector('#wIn');
    await page.locator('#wIn').focus();
    await page.keyboard.type('der Preis');
    await page.keyboard.press('Enter');

    const noDoubleCount = await page.evaluate(() => getTodayCount());
    expect(noDoubleCount).toBe(1);
  });

  test('6. Gesundheit: written mode, plural quiz, plural-less word (gesundheit.gesundheit), and goal counter', async ({ page }) => {
    // 6a. Written mode on gesundheit.schmerz
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'gesundheit');
      const sIdx = cat.words.findIndex(w => w.id === 'gesundheit.schmerz');
      ensureProgress('gesundheit', 'written').unlocked = Math.max(ensureProgress('gesundheit', 'written').unlocked, sIdx + 1);
      go({ screen: 'exercise', catId: 'gesundheit', mode: 'written' });
      exState = { catId: 'gesundheit', mode: 'written', idx: sIdx, answered: false };
      renderQuestion(cat, 'written', sIdx, cat.words[sIdx]);
    });

    await page.waitForSelector('#wIn');

    // Type wrong article: "die Schmerz"
    await page.locator('#wIn').focus();
    await page.keyboard.type('die Schmerz');
    await page.keyboard.press('Enter');

    let wrongFb = await page.evaluate(() => {
      const fb = document.getElementById('fb');
      const statusLine = fb.querySelector('.fb-status-line');
      return statusLine !== null && statusLine.classList.contains('bad');
    });
    expect(wrongFb).toBe(true);

    // Type correct answer: "der Schmerz"
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'gesundheit');
      const sIdx = cat.words.findIndex(w => w.id === 'gesundheit.schmerz');
      exState = { catId: 'gesundheit', mode: 'written', idx: sIdx, answered: false };
      renderQuestion(cat, 'written', sIdx, cat.words[sIdx]);
    });

    await page.waitForSelector('#wIn');
    await page.locator('#wIn').focus();
    await page.keyboard.type('der Schmerz');
    await page.keyboard.press('Enter');

    let correctFb = await page.evaluate(() => {
      const fb = document.getElementById('fb');
      const statusLine = fb.querySelector('.fb-status-line');
      return statusLine !== null && statusLine.classList.contains('ok');
    });
    expect(correctFb).toBe(true);

    // 6b. Plural mode on gesundheit.schmerz accepts "die Schmerzen"
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'gesundheit');
      const sIdx = cat.words.findIndex(w => w.id === 'gesundheit.schmerz');
      ensureProgress('gesundheit', 'plural').unlocked = Math.max(ensureProgress('gesundheit', 'plural').unlocked, sIdx + 1);
      go({ screen: 'exercise', catId: 'gesundheit', mode: 'plural' });
      exState = { catId: 'gesundheit', mode: 'plural', idx: sIdx, answered: false };
      renderQuestion(cat, 'plural', sIdx, cat.words[sIdx]);
    });

    await page.waitForSelector('#qzone .options .opt');
    const schmerzKey = await page.evaluate(() => {
      const opts = Array.from(document.querySelectorAll('#qzone .options .opt'));
      const idx = opts.findIndex(o => o.getAttribute('data-val') === 'die Schmerzen');
      return idx >= 0 ? idx + 1 : -1;
    });
    expect(schmerzKey).toBeGreaterThan(0);
    await page.keyboard.press(String(schmerzKey));

    const schmerzPluralFb = await page.evaluate(() => {
      const fb = document.getElementById('fb');
      const statusLine = fb.querySelector('.fb-status-line');
      return statusLine !== null && statusLine.classList.contains('ok');
    });
    expect(schmerzPluralFb).toBe(true);

    // 6c. Plural-less word (gesundheit.gesundheit) has pl: null and is never picked in plural mode
    const plLessCheck = await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'gesundheit');
      const gWord = cat.words.find(w => w.id === 'gesundheit.gesundheit');
      const gIdx = cat.words.indexOf(gWord);
      const isNull = gWord.pl === null;

      let picked = false;
      for (let i = 0; i < 100; i++) {
        if (pickQuestionIndex('gesundheit', 'plural') === gIdx) {
          picked = true;
          break;
        }
      }
      return { isNull, picked };
    });
    expect(plLessCheck.isNull).toBe(true);
    expect(plLessCheck.picked).toBe(false);

    // 6d. Goal counter 🎯 increments when gesundheit.schmerz reaches threshold
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'gesundheit');
      const sIdx = cat.words.findIndex(w => w.id === 'gesundheit.schmerz');
      const th = threshFor('written');
      stats.todayCount = 0;
      stats.dailyGoal = 20;
      ensureProgress('gesundheit', 'written').unlocked = Math.max(ensureProgress('gesundheit', 'written').unlocked, sIdx + 1);
      setWordCount('gesundheit', 'written', sIdx, th - 1);
      refreshGoalDisplay();

      go({ screen: 'exercise', catId: 'gesundheit', mode: 'written' });
      exState = { catId: 'gesundheit', mode: 'written', idx: sIdx, answered: false };
      renderQuestion(cat, 'written', sIdx, cat.words[sIdx]);
    });

    await page.waitForSelector('#wIn');
    await page.locator('#wIn').focus();
    await page.keyboard.type('der Schmerz');
    await page.keyboard.press('Enter');

    const schmerzGoal = await page.evaluate(() => ({
      todayCount: getTodayCount(),
      goalText: document.querySelector('#headGoalBtn .goal-num')?.textContent.trim()
    }));
    expect(schmerzGoal.todayCount).toBe(1);
    expect(schmerzGoal.goalText).toBe('1/20');
  });
});

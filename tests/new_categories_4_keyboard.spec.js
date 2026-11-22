// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('New Categories Batch 8 Real Keyboard Interaction & Rules', () => {
  const fileUrl = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

  test.beforeEach(async ({ page }) => {
    page.on('pageerror', err => {
      console.error('[PAGE ERROR]', err.message);
    });
    await page.goto(fileUrl);
    await page.waitForLoadState('domcontentloaded');
  });

  test('1. Home screen shows 39 category cards without overflow at 360px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.waitForSelector('#app');

    const cardCount = await page.evaluate(() => {
      return document.querySelectorAll('.cat-card[data-cat]').length;
    });
    expect(cardCount).toBe(39);

    // Verify both new categories are present in the DOM
    const hasRestaurant = await page.evaluate(() => {
      const card = document.querySelector('.cat-card[data-cat="restaurant"]');
      return card !== null && card.textContent.includes('المطعم');
    });
    expect(hasRestaurant).toBe(true);

    const hasBehoerden = await page.evaluate(() => {
      const card = document.querySelector('.cat-card[data-cat="behoerden"]');
      return card !== null && card.textContent.includes('الحكومية');
    });
    expect(hasBehoerden).toBe(true);

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

  test('2. Restaurant: written mode on restaurant.speisekarte accepts correct answer and rejects wrong article', async ({ page }) => {
    // Navigate to written mode with restaurant.speisekarte
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'restaurant');
      const sIdx = cat.words.findIndex(w => w.id === 'restaurant.speisekarte');
      ensureProgress('restaurant', 'written').unlocked = Math.max(ensureProgress('restaurant', 'written').unlocked, sIdx + 1);
      go({ screen: 'exercise', catId: 'restaurant', mode: 'written' });
      exState = { catId: 'restaurant', mode: 'written', idx: sIdx, answered: false };
      renderQuestion(cat, 'written', sIdx, cat.words[sIdx]);
    });

    await page.waitForSelector('#wIn');

    // Focus input and type wrong article using real keyboard: "der Speisekarte"
    await page.locator('#wIn').focus();
    await page.keyboard.type('der Speisekarte');
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

    // Reset exercise state for restaurant.speisekarte to test correct answer
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'restaurant');
      const sIdx = cat.words.findIndex(w => w.id === 'restaurant.speisekarte');
      exState = { catId: 'restaurant', mode: 'written', idx: sIdx, answered: false };
      renderQuestion(cat, 'written', sIdx, cat.words[sIdx]);
    });

    await page.waitForSelector('#wIn');
    await page.locator('#wIn').focus();
    // Type correct answer with real keyboard: "die Speisekarte"
    await page.keyboard.type('die Speisekarte');
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

  test('3. Restaurant: plural quiz on restaurant.speisekarte accepts "die Speisekarten" via real keyboard', async ({ page }) => {
    // Navigate to plural mode for restaurant.speisekarte
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'restaurant');
      const sIdx = cat.words.findIndex(w => w.id === 'restaurant.speisekarte');
      ensureProgress('restaurant', 'plural').unlocked = Math.max(ensureProgress('restaurant', 'plural').unlocked, sIdx + 1);
      go({ screen: 'exercise', catId: 'restaurant', mode: 'plural' });
      exState = { catId: 'restaurant', mode: 'plural', idx: sIdx, answered: false };
      renderQuestion(cat, 'plural', sIdx, cat.words[sIdx]);
    });

    await page.waitForSelector('#qzone .options .opt');

    // Find 1-based index of option with value "die Speisekarten"
    const targetKey = await page.evaluate(() => {
      const opts = Array.from(document.querySelectorAll('#qzone .options .opt'));
      const idx = opts.findIndex(o => o.getAttribute('data-val') === 'die Speisekarten');
      return idx >= 0 ? idx + 1 : -1;
    });
    expect(targetKey).toBeGreaterThan(0);

    // Press real numeric key (1, 2, 3, or 4)
    await page.keyboard.press(String(targetKey));

    // Verify answer feedback is ok
    const fbResult = await page.evaluate(() => {
      const fb = document.getElementById('fb');
      const statusLine = fb.querySelector('.fb-status-line');
      const isOk = statusLine !== null && statusLine.classList.contains('ok');
      const nextVisible = document.getElementById('nextBtn').classList.contains('show');
      return { isOk, nextVisible };
    });
    expect(fbResult.isOk).toBe(true);
    expect(fbResult.nextVisible).toBe(true);
  });

  test('4. Restaurant: plural-less word restaurant.nachtisch has pl: null and is never picked in plural mode', async ({ page }) => {
    const result = await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'restaurant');
      const nWord = cat.words.find(w => w.id === 'restaurant.nachtisch');
      const nIdx = cat.words.indexOf(nWord);

      // Verify word has pl === null
      const isNull = nWord.pl === null;

      // Unlock all words in plural mode
      ensureProgress('restaurant', 'plural').unlocked = cat.words.length;

      // Call pickQuestionIndex 100 times: restaurant.nachtisch must NEVER be selected
      let pickedNachtisch = false;
      for (let i = 0; i < 100; i++) {
        const pickedIdx = pickQuestionIndex('restaurant', 'plural');
        if (pickedIdx === nIdx) {
          pickedNachtisch = true;
          break;
        }
      }

      return { isNull, pickedNachtisch };
    });

    expect(result.isNull).toBe(true);
    expect(result.pickedNachtisch).toBe(false);
  });

  test('5. Restaurant: goal counter 🎯 increments when restaurant.speisekarte reaches mastery threshold', async ({ page }) => {
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'restaurant');
      const sIdx = cat.words.findIndex(w => w.id === 'restaurant.speisekarte');
      const th = threshFor('written');

      // Reset today's stats and set word count to (threshold - 1)
      stats.todayCount = 0;
      stats.dailyGoal = 20;
      ensureProgress('restaurant', 'written').unlocked = Math.max(ensureProgress('restaurant', 'written').unlocked, sIdx + 1);
      setWordCount('restaurant', 'written', sIdx, th - 1);
      refreshGoalDisplay();

      // Launch question for restaurant.speisekarte
      go({ screen: 'exercise', catId: 'restaurant', mode: 'written' });
      exState = { catId: 'restaurant', mode: 'written', idx: sIdx, answered: false };
      renderQuestion(cat, 'written', sIdx, cat.words[sIdx]);
    });

    await page.waitForSelector('#wIn');
    await page.locator('#wIn').focus();
    // Type correct answer via real keyboard
    await page.keyboard.type('die Speisekarte');
    await page.keyboard.press('Enter');

    // Verify goal counter incremented from 0 to 1
    const goalResult = await page.evaluate(() => {
      return {
        todayCount: getTodayCount(),
        goalText: document.querySelector('#headGoalBtn .goal-num')?.textContent.trim()
      };
    });

    expect(goalResult.todayCount).toBe(1);
    expect(goalResult.goalText).toBe('1/20');
  });

  test('6. Behörden: written mode (amt: das), plural quiz (amt: die Ämter), plural-less (polizei), and goal 🎯 counter', async ({ page }) => {
    // 6a. Written mode on behoerden.amt (das Amt)
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'behoerden');
      const aIdx = cat.words.findIndex(w => w.id === 'behoerden.amt');
      ensureProgress('behoerden', 'written').unlocked = Math.max(ensureProgress('behoerden', 'written').unlocked, aIdx + 1);
      go({ screen: 'exercise', catId: 'behoerden', mode: 'written' });
      exState = { catId: 'behoerden', mode: 'written', idx: aIdx, answered: false };
      renderQuestion(cat, 'written', aIdx, cat.words[aIdx]);
    });

    await page.waitForSelector('#wIn');
    // Wrong article rejection
    await page.locator('#wIn').focus();
    await page.keyboard.type('der Amt');
    await page.keyboard.press('Enter');

    const wrongResult = await page.evaluate(() => {
      const fb = document.getElementById('fb');
      const statusLine = fb.querySelector('.fb-status-line');
      return statusLine !== null && statusLine.classList.contains('bad');
    });
    expect(wrongResult).toBe(true);

    // Correct input: das Amt
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'behoerden');
      const aIdx = cat.words.findIndex(w => w.id === 'behoerden.amt');
      exState = { catId: 'behoerden', mode: 'written', idx: aIdx, answered: false };
      renderQuestion(cat, 'written', aIdx, cat.words[aIdx]);
    });
    await page.waitForSelector('#wIn');
    await page.locator('#wIn').focus();
    await page.keyboard.type('das Amt');
    await page.keyboard.press('Enter');

    const correctResult = await page.evaluate(() => {
      const fb = document.getElementById('fb');
      const statusLine = fb.querySelector('.fb-status-line');
      return statusLine !== null && statusLine.classList.contains('ok');
    });
    expect(correctResult).toBe(true);

    // 6b. Plural quiz on behoerden.amt (die Ämter)
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'behoerden');
      const aIdx = cat.words.findIndex(w => w.id === 'behoerden.amt');
      ensureProgress('behoerden', 'plural').unlocked = Math.max(ensureProgress('behoerden', 'plural').unlocked, aIdx + 1);
      go({ screen: 'exercise', catId: 'behoerden', mode: 'plural' });
      exState = { catId: 'behoerden', mode: 'plural', idx: aIdx, answered: false };
      renderQuestion(cat, 'plural', aIdx, cat.words[aIdx]);
    });
    await page.waitForSelector('#qzone .options .opt');
    const plKey = await page.evaluate(() => {
      const opts = Array.from(document.querySelectorAll('#qzone .options .opt'));
      const idx = opts.findIndex(o => o.getAttribute('data-val') === 'die Ämter');
      return idx >= 0 ? idx + 1 : -1;
    });
    expect(plKey).toBeGreaterThan(0);
    await page.keyboard.press(String(plKey));

    const plResult = await page.evaluate(() => {
      const fb = document.getElementById('fb');
      const statusLine = fb.querySelector('.fb-status-line');
      return statusLine !== null && statusLine.classList.contains('ok');
    });
    expect(plResult).toBe(true);

    // 6c. Plural-less word behoerden.polizei has pl: null and is never picked
    const plLessResult = await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'behoerden');
      const pWord = cat.words.find(w => w.id === 'behoerden.polizei');
      const pIdx = cat.words.indexOf(pWord);
      const isNull = pWord.pl === null;

      ensureProgress('behoerden', 'plural').unlocked = cat.words.length;
      let picked = false;
      for (let i = 0; i < 100; i++) {
        if (pickQuestionIndex('behoerden', 'plural') === pIdx) {
          picked = true;
          break;
        }
      }
      return { isNull, picked };
    });
    expect(plLessResult.isNull).toBe(true);
    expect(plLessResult.picked).toBe(false);

    // 6d. Goal counter increment for behoerden.amt
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'behoerden');
      const aIdx = cat.words.findIndex(w => w.id === 'behoerden.amt');
      const th = threshFor('written');
      stats.todayCount = 4;
      stats.dailyGoal = 20;
      ensureProgress('behoerden', 'written').unlocked = Math.max(ensureProgress('behoerden', 'written').unlocked, aIdx + 1);
      setWordCount('behoerden', 'written', aIdx, th - 1);
      refreshGoalDisplay();

      go({ screen: 'exercise', catId: 'behoerden', mode: 'written' });
      exState = { catId: 'behoerden', mode: 'written', idx: aIdx, answered: false };
      renderQuestion(cat, 'written', aIdx, cat.words[aIdx]);
    });
    await page.waitForSelector('#wIn');
    await page.locator('#wIn').focus();
    await page.keyboard.type('das Amt');
    await page.keyboard.press('Enter');

    const behoerdenGoal = await page.evaluate(() => getTodayCount());
    expect(behoerdenGoal).toBe(5);
  });
});

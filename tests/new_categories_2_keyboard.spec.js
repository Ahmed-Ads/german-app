// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('New Categories Batch 6 Real Keyboard Interaction & Rules', () => {
  const fileUrl = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

  test.beforeEach(async ({ page }) => {
    page.on('pageerror', err => {
      console.error('[PAGE ERROR]', err.message);
    });
    await page.goto(fileUrl);
    await page.waitForLoadState('domcontentloaded');
  });

  test('1. Home screen shows 35 category cards without overflow at 360px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.waitForSelector('#app');

    const cardCount = await page.evaluate(() => {
      return document.querySelectorAll('.cat-card[data-cat]').length;
    });
    expect(cardCount).toBe(35);

    // Verify both new categories are present in the DOM
    const hasReisen = await page.evaluate(() => {
      const card = document.querySelector('.cat-card[data-cat="reisen"]');
      return card !== null && card.textContent.includes('السفر');
    });
    expect(hasReisen).toBe(true);

    const hasArbeit = await page.evaluate(() => {
      const card = document.querySelector('.cat-card[data-cat="arbeit"]');
      return card !== null && card.textContent.includes('العمل');
    });
    expect(hasArbeit).toBe(true);

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

  test('2. Reisen: written mode on reisen.koffer accepts correct answer and rejects wrong article', async ({ page }) => {
    // Navigate to written mode with reisen.koffer
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'reisen');
      const pIdx = cat.words.findIndex(w => w.id === 'reisen.koffer');
      ensureProgress('reisen', 'written').unlocked = Math.max(ensureProgress('reisen', 'written').unlocked, pIdx + 1);
      go({ screen: 'exercise', catId: 'reisen', mode: 'written' });
      exState = { catId: 'reisen', mode: 'written', idx: pIdx, answered: false };
      renderQuestion(cat, 'written', pIdx, cat.words[pIdx]);
    });

    await page.waitForSelector('#wIn');

    // Focus input and type wrong article using real keyboard: "die Koffer"
    await page.locator('#wIn').focus();
    await page.keyboard.type('die Koffer');
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

    // Reset exercise state for reisen.koffer to test correct answer
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'reisen');
      const pIdx = cat.words.findIndex(w => w.id === 'reisen.koffer');
      exState = { catId: 'reisen', mode: 'written', idx: pIdx, answered: false };
      renderQuestion(cat, 'written', pIdx, cat.words[pIdx]);
    });

    await page.waitForSelector('#wIn');
    await page.locator('#wIn').focus();
    // Type correct answer with real keyboard: "der Koffer"
    await page.keyboard.type('der Koffer');
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

  test('3. Reisen: plural quiz on reisen.ticket accepts "die Tickets" via real keyboard', async ({ page }) => {
    // Navigate to plural mode for reisen.ticket
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'reisen');
      const tIdx = cat.words.findIndex(w => w.id === 'reisen.ticket');
      ensureProgress('reisen', 'plural').unlocked = Math.max(ensureProgress('reisen', 'plural').unlocked, tIdx + 1);
      go({ screen: 'exercise', catId: 'reisen', mode: 'plural' });
      exState = { catId: 'reisen', mode: 'plural', idx: tIdx, answered: false };
      renderQuestion(cat, 'plural', tIdx, cat.words[tIdx]);
    });

    await page.waitForSelector('#qzone .options .opt');

    // Find 1-based index of option with value "die Tickets"
    const targetKey = await page.evaluate(() => {
      const opts = Array.from(document.querySelectorAll('#qzone .options .opt'));
      const idx = opts.findIndex(o => o.getAttribute('data-val') === 'die Tickets');
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

  test('4. Reisen: plural-less word reisen.gepaeck has pl: null and is never picked in plural mode', async ({ page }) => {
    const result = await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'reisen');
      const gWord = cat.words.find(w => w.id === 'reisen.gepaeck');
      const gIdx = cat.words.indexOf(gWord);

      // Verify word has pl === null
      const isNull = gWord.pl === null;

      // Unlock all words in plural mode
      ensureProgress('reisen', 'plural').unlocked = cat.words.length;

      // Call pickQuestionIndex 100 times: reisen.gepaeck must NEVER be selected
      let pickedGepaeck = false;
      for (let i = 0; i < 100; i++) {
        const pickedIdx = pickQuestionIndex('reisen', 'plural');
        if (pickedIdx === gIdx) {
          pickedGepaeck = true;
          break;
        }
      }

      return { isNull, pickedGepaeck };
    });

    expect(result.isNull).toBe(true);
    expect(result.pickedGepaeck).toBe(false);
  });

  test('5. Reisen: goal counter 🎯 increments when reisen.koffer reaches mastery threshold', async ({ page }) => {
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'reisen');
      const kIdx = cat.words.findIndex(w => w.id === 'reisen.koffer');
      const th = threshFor('written');

      // Reset today's stats and set word count to (threshold - 1)
      stats.todayCount = 0;
      stats.dailyGoal = 20;
      ensureProgress('reisen', 'written').unlocked = Math.max(ensureProgress('reisen', 'written').unlocked, kIdx + 1);
      setWordCount('reisen', 'written', kIdx, th - 1);
      refreshGoalDisplay();

      // Launch question for reisen.koffer
      go({ screen: 'exercise', catId: 'reisen', mode: 'written' });
      exState = { catId: 'reisen', mode: 'written', idx: kIdx, answered: false };
      renderQuestion(cat, 'written', kIdx, cat.words[kIdx]);
    });

    await page.waitForSelector('#wIn');
    await page.locator('#wIn').focus();
    // Type correct answer via real keyboard
    await page.keyboard.type('der Koffer');
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

  test('6. Arbeit: written mode (firma: die), plural quiz (kollege: die Kollegen), plural-less (teilzeit), and goal 🎯 counter', async ({ page }) => {
    // 6a. Written mode on arbeit.firma (die Firma)
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'arbeit');
      const fIdx = cat.words.findIndex(w => w.id === 'arbeit.firma');
      ensureProgress('arbeit', 'written').unlocked = Math.max(ensureProgress('arbeit', 'written').unlocked, fIdx + 1);
      go({ screen: 'exercise', catId: 'arbeit', mode: 'written' });
      exState = { catId: 'arbeit', mode: 'written', idx: fIdx, answered: false };
      renderQuestion(cat, 'written', fIdx, cat.words[fIdx]);
    });

    await page.waitForSelector('#wIn');

    // Type wrong article: "der Firma"
    await page.locator('#wIn').focus();
    await page.keyboard.type('der Firma');
    await page.keyboard.press('Enter');

    let wrongFb = await page.evaluate(() => {
      const fb = document.getElementById('fb');
      const statusLine = fb.querySelector('.fb-status-line');
      return statusLine !== null && statusLine.classList.contains('bad');
    });
    expect(wrongFb).toBe(true);

    // Type correct answer: "die Firma"
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'arbeit');
      const fIdx = cat.words.findIndex(w => w.id === 'arbeit.firma');
      exState = { catId: 'arbeit', mode: 'written', idx: fIdx, answered: false };
      renderQuestion(cat, 'written', fIdx, cat.words[fIdx]);
    });

    await page.waitForSelector('#wIn');
    await page.locator('#wIn').focus();
    await page.keyboard.type('die Firma');
    await page.keyboard.press('Enter');

    let correctFb = await page.evaluate(() => {
      const fb = document.getElementById('fb');
      const statusLine = fb.querySelector('.fb-status-line');
      return statusLine !== null && statusLine.classList.contains('ok');
    });
    expect(correctFb).toBe(true);

    // 6b. Plural mode on arbeit.kollege accepts "die Kollegen"
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'arbeit');
      const kIdx = cat.words.findIndex(w => w.id === 'arbeit.kollege');
      ensureProgress('arbeit', 'plural').unlocked = Math.max(ensureProgress('arbeit', 'plural').unlocked, kIdx + 1);
      go({ screen: 'exercise', catId: 'arbeit', mode: 'plural' });
      exState = { catId: 'arbeit', mode: 'plural', idx: kIdx, answered: false };
      renderQuestion(cat, 'plural', kIdx, cat.words[kIdx]);
    });

    await page.waitForSelector('#qzone .options .opt');
    const kollegeKey = await page.evaluate(() => {
      const opts = Array.from(document.querySelectorAll('#qzone .options .opt'));
      const idx = opts.findIndex(o => o.getAttribute('data-val') === 'die Kollegen');
      return idx >= 0 ? idx + 1 : -1;
    });
    expect(kollegeKey).toBeGreaterThan(0);
    await page.keyboard.press(String(kollegeKey));

    const kollegePluralFb = await page.evaluate(() => {
      const fb = document.getElementById('fb');
      const statusLine = fb.querySelector('.fb-status-line');
      return statusLine !== null && statusLine.classList.contains('ok');
    });
    expect(kollegePluralFb).toBe(true);

    // 6c. Plural-less word (arbeit.teilzeit) has pl: null and is never picked in plural mode
    const plLessCheck = await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'arbeit');
      const tWord = cat.words.find(w => w.id === 'arbeit.teilzeit');
      const tIdx = cat.words.indexOf(tWord);
      const isNull = tWord.pl === null;

      let picked = false;
      for (let i = 0; i < 100; i++) {
        if (pickQuestionIndex('arbeit', 'plural') === tIdx) {
          picked = true;
          break;
        }
      }
      return { isNull, picked };
    });
    expect(plLessCheck.isNull).toBe(true);
    expect(plLessCheck.picked).toBe(false);

    // 6d. Goal counter 🎯 increments when arbeit.firma reaches threshold
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'arbeit');
      const fIdx = cat.words.findIndex(w => w.id === 'arbeit.firma');
      const th = threshFor('written');
      stats.todayCount = 0;
      stats.dailyGoal = 20;
      ensureProgress('arbeit', 'written').unlocked = Math.max(ensureProgress('arbeit', 'written').unlocked, fIdx + 1);
      setWordCount('arbeit', 'written', fIdx, th - 1);
      refreshGoalDisplay();

      go({ screen: 'exercise', catId: 'arbeit', mode: 'written' });
      exState = { catId: 'arbeit', mode: 'written', idx: fIdx, answered: false };
      renderQuestion(cat, 'written', fIdx, cat.words[fIdx]);
    });

    await page.waitForSelector('#wIn');
    await page.locator('#wIn').focus();
    await page.keyboard.type('die Firma');
    await page.keyboard.press('Enter');

    const firmaGoal = await page.evaluate(() => ({
      todayCount: getTodayCount(),
      goalText: document.querySelector('#headGoalBtn .goal-num')?.textContent.trim()
    }));
    expect(firmaGoal.todayCount).toBe(1);
    expect(firmaGoal.goalText).toBe('1/20');
  });
});

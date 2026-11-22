// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('New Categories Batch 7 Real Keyboard Interaction & Rules', () => {
  const fileUrl = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

  test.beforeEach(async ({ page }) => {
    page.on('pageerror', err => {
      console.error('[PAGE ERROR]', err.message);
    });
    await page.goto(fileUrl);
    await page.waitForLoadState('domcontentloaded');
  });

  test('1. Home screen shows 37 category cards without overflow at 360px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.waitForSelector('#app');

    const cardCount = await page.evaluate(() => {
      return document.querySelectorAll('.cat-card[data-cat]').length;
    });
    expect(cardCount).toBe(37);

    // Verify both new categories are present in the DOM
    const hasNatur = await page.evaluate(() => {
      const card = document.querySelector('.cat-card[data-cat="natur"]');
      return card !== null && card.textContent.includes('الطبيعة');
    });
    expect(hasNatur).toBe(true);

    const hasFreizeit = await page.evaluate(() => {
      const card = document.querySelector('.cat-card[data-cat="freizeit"]');
      return card !== null && card.textContent.includes('الفراغ');
    });
    expect(hasFreizeit).toBe(true);

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

  test('2. Natur: written mode on natur.baum accepts correct answer and rejects wrong article', async ({ page }) => {
    // Navigate to written mode with natur.baum
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'natur');
      const bIdx = cat.words.findIndex(w => w.id === 'natur.baum');
      ensureProgress('natur', 'written').unlocked = Math.max(ensureProgress('natur', 'written').unlocked, bIdx + 1);
      go({ screen: 'exercise', catId: 'natur', mode: 'written' });
      exState = { catId: 'natur', mode: 'written', idx: bIdx, answered: false };
      renderQuestion(cat, 'written', bIdx, cat.words[bIdx]);
    });

    await page.waitForSelector('#wIn');

    // Focus input and type wrong article using real keyboard: "die Baum"
    await page.locator('#wIn').focus();
    await page.keyboard.type('die Baum');
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

    // Reset exercise state for natur.baum to test correct answer
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'natur');
      const bIdx = cat.words.findIndex(w => w.id === 'natur.baum');
      exState = { catId: 'natur', mode: 'written', idx: bIdx, answered: false };
      renderQuestion(cat, 'written', bIdx, cat.words[bIdx]);
    });

    await page.waitForSelector('#wIn');
    await page.locator('#wIn').focus();
    // Type correct answer with real keyboard: "der Baum"
    await page.keyboard.type('der Baum');
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

  test('3. Natur: plural quiz on natur.blume accepts "die Blumen" via real keyboard', async ({ page }) => {
    // Navigate to plural mode for natur.blume
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'natur');
      const bIdx = cat.words.findIndex(w => w.id === 'natur.blume');
      ensureProgress('natur', 'plural').unlocked = Math.max(ensureProgress('natur', 'plural').unlocked, bIdx + 1);
      go({ screen: 'exercise', catId: 'natur', mode: 'plural' });
      exState = { catId: 'natur', mode: 'plural', idx: bIdx, answered: false };
      renderQuestion(cat, 'plural', bIdx, cat.words[bIdx]);
    });

    await page.waitForSelector('#qzone .options .opt');

    // Find 1-based index of option with value "die Blumen"
    const targetKey = await page.evaluate(() => {
      const opts = Array.from(document.querySelectorAll('#qzone .options .opt'));
      const idx = opts.findIndex(o => o.getAttribute('data-val') === 'die Blumen');
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

  test('4. Natur: plural-less word natur.natur has pl: null and is never picked in plural mode', async ({ page }) => {
    const result = await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'natur');
      const nWord = cat.words.find(w => w.id === 'natur.natur');
      const nIdx = cat.words.indexOf(nWord);

      // Verify word has pl === null
      const isNull = nWord.pl === null;

      // Unlock all words in plural mode
      ensureProgress('natur', 'plural').unlocked = cat.words.length;

      // Call pickQuestionIndex 100 times: natur.natur must NEVER be selected
      let pickedNatur = false;
      for (let i = 0; i < 100; i++) {
        const pickedIdx = pickQuestionIndex('natur', 'plural');
        if (pickedIdx === nIdx) {
          pickedNatur = true;
          break;
        }
      }

      return { isNull, pickedNatur };
    });

    expect(result.isNull).toBe(true);
    expect(result.pickedNatur).toBe(false);
  });

  test('5. Natur: goal counter 🎯 increments when natur.baum reaches mastery threshold', async ({ page }) => {
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'natur');
      const bIdx = cat.words.findIndex(w => w.id === 'natur.baum');
      const th = threshFor('written');

      // Reset today's stats and set word count to (threshold - 1)
      stats.todayCount = 0;
      stats.dailyGoal = 20;
      ensureProgress('natur', 'written').unlocked = Math.max(ensureProgress('natur', 'written').unlocked, bIdx + 1);
      setWordCount('natur', 'written', bIdx, th - 1);
      refreshGoalDisplay();

      // Launch question for natur.baum
      go({ screen: 'exercise', catId: 'natur', mode: 'written' });
      exState = { catId: 'natur', mode: 'written', idx: bIdx, answered: false };
      renderQuestion(cat, 'written', bIdx, cat.words[bIdx]);
    });

    await page.waitForSelector('#wIn');
    await page.locator('#wIn').focus();
    // Type correct answer via real keyboard
    await page.keyboard.type('der Baum');
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

  test('6. Freizeit: written mode (hobby: das), plural quiz (spiel: die Spiele), plural-less (schach), and goal 🎯 counter', async ({ page }) => {
    // 6a. Written mode on freizeit.hobby (das Hobby)
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'freizeit');
      const hIdx = cat.words.findIndex(w => w.id === 'freizeit.hobby');
      ensureProgress('freizeit', 'written').unlocked = Math.max(ensureProgress('freizeit', 'written').unlocked, hIdx + 1);
      go({ screen: 'exercise', catId: 'freizeit', mode: 'written' });
      exState = { catId: 'freizeit', mode: 'written', idx: hIdx, answered: false };
      renderQuestion(cat, 'written', hIdx, cat.words[hIdx]);
    });

    await page.waitForSelector('#wIn');

    // Type wrong article: "der Hobby"
    await page.locator('#wIn').focus();
    await page.keyboard.type('der Hobby');
    await page.keyboard.press('Enter');

    let wrongFb = await page.evaluate(() => {
      const fb = document.getElementById('fb');
      const statusLine = fb.querySelector('.fb-status-line');
      return statusLine !== null && statusLine.classList.contains('bad');
    });
    expect(wrongFb).toBe(true);

    // Type correct answer: "das Hobby"
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'freizeit');
      const hIdx = cat.words.findIndex(w => w.id === 'freizeit.hobby');
      exState = { catId: 'freizeit', mode: 'written', idx: hIdx, answered: false };
      renderQuestion(cat, 'written', hIdx, cat.words[hIdx]);
    });

    await page.waitForSelector('#wIn');
    await page.locator('#wIn').focus();
    await page.keyboard.type('das Hobby');
    await page.keyboard.press('Enter');

    let correctFb = await page.evaluate(() => {
      const fb = document.getElementById('fb');
      const statusLine = fb.querySelector('.fb-status-line');
      return statusLine !== null && statusLine.classList.contains('ok');
    });
    expect(correctFb).toBe(true);

    // 6b. Plural mode on freizeit.spiel accepts "die Spiele"
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'freizeit');
      const sIdx = cat.words.findIndex(w => w.id === 'freizeit.spiel');
      ensureProgress('freizeit', 'plural').unlocked = Math.max(ensureProgress('freizeit', 'plural').unlocked, sIdx + 1);
      go({ screen: 'exercise', catId: 'freizeit', mode: 'plural' });
      exState = { catId: 'freizeit', mode: 'plural', idx: sIdx, answered: false };
      renderQuestion(cat, 'plural', sIdx, cat.words[sIdx]);
    });

    await page.waitForSelector('#qzone .options .opt');
    const spielKey = await page.evaluate(() => {
      const opts = Array.from(document.querySelectorAll('#qzone .options .opt'));
      const idx = opts.findIndex(o => o.getAttribute('data-val') === 'die Spiele');
      return idx >= 0 ? idx + 1 : -1;
    });
    expect(spielKey).toBeGreaterThan(0);
    await page.keyboard.press(String(spielKey));

    const spielPluralFb = await page.evaluate(() => {
      const fb = document.getElementById('fb');
      const statusLine = fb.querySelector('.fb-status-line');
      return statusLine !== null && statusLine.classList.contains('ok');
    });
    expect(spielPluralFb).toBe(true);

    // 6c. Plural-less word (freizeit.schach) has pl: null and is never picked in plural mode
    const plLessCheck = await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'freizeit');
      const sWord = cat.words.find(w => w.id === 'freizeit.schach');
      const sIdx = cat.words.indexOf(sWord);
      const isNull = sWord.pl === null;

      let picked = false;
      for (let i = 0; i < 100; i++) {
        if (pickQuestionIndex('freizeit', 'plural') === sIdx) {
          picked = true;
          break;
        }
      }
      return { isNull, picked };
    });
    expect(plLessCheck.isNull).toBe(true);
    expect(plLessCheck.picked).toBe(false);

    // 6d. Goal counter 🎯 increments when freizeit.hobby reaches threshold
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'freizeit');
      const hIdx = cat.words.findIndex(w => w.id === 'freizeit.hobby');
      const th = threshFor('written');
      stats.todayCount = 0;
      stats.dailyGoal = 20;
      ensureProgress('freizeit', 'written').unlocked = Math.max(ensureProgress('freizeit', 'written').unlocked, hIdx + 1);
      setWordCount('freizeit', 'written', hIdx, th - 1);
      refreshGoalDisplay();

      go({ screen: 'exercise', catId: 'freizeit', mode: 'written' });
      exState = { catId: 'freizeit', mode: 'written', idx: hIdx, answered: false };
      renderQuestion(cat, 'written', hIdx, cat.words[hIdx]);
    });

    await page.waitForSelector('#wIn');
    await page.locator('#wIn').focus();
    await page.keyboard.type('das Hobby');
    await page.keyboard.press('Enter');

    const hobbyGoal = await page.evaluate(() => ({
      todayCount: getTodayCount(),
      goalText: document.querySelector('#headGoalBtn .goal-num')?.textContent.trim()
    }));
    expect(hobbyGoal.todayCount).toBe(1);
    expect(hobbyGoal.goalText).toBe('1/20');
  });
});

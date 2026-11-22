// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('New Category Batch 9 Real Keyboard Interaction & Rules', () => {
  const fileUrl = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

  test.beforeEach(async ({ page }) => {
    page.on('pageerror', err => {
      console.error('[PAGE ERROR]', err.message);
    });
    await page.goto(fileUrl);
    await page.waitForLoadState('domcontentloaded');
  });

  test('1. Home screen shows 40 category cards without overflow at 360px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.waitForSelector('#app');

    const cardCount = await page.evaluate(() => {
      return document.querySelectorAll('.cat-card[data-cat]').length;
    });
    expect(cardCount).toBe(40);

    // Verify new category gegensaetze is present in the DOM
    const hasGegensaetze = await page.evaluate(() => {
      const card = document.querySelector('.cat-card[data-cat="gegensaetze"]');
      return card !== null && card.textContent.includes('الأضداد');
    });
    expect(hasGegensaetze).toBe(true);

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

  test('2. Modes screen: no plural mode and no article mode offered for gegensaetze', async ({ page }) => {
    await page.evaluate(() => {
      go({ screen: 'modes', catId: 'gegensaetze' });
    });

    await page.waitForSelector('.mode-btn');

    const modes = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.mode-btn[data-mode]'));
      return btns.map(b => b.getAttribute('data-mode'));
    });

    expect(modes).toContain('mcq');
    expect(modes).toContain('written');
    expect(modes).not.toContain('plural');
    expect(modes).not.toContain('article');
  });

  test('3. Gegensätze: written mode on gegensaetze.gross accepts bare word and rejects incorrect input', async ({ page }) => {
    // Navigate to written mode with gegensaetze.gross
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'gegensaetze');
      const gIdx = cat.words.findIndex(w => w.id === 'gegensaetze.gross');
      ensureProgress('gegensaetze', 'written').unlocked = Math.max(ensureProgress('gegensaetze', 'written').unlocked, gIdx + 1);
      go({ screen: 'exercise', catId: 'gegensaetze', mode: 'written' });
      exState = { catId: 'gegensaetze', mode: 'written', idx: gIdx, answered: false };
      renderQuestion(cat, 'written', gIdx, cat.words[gIdx]);
    });

    await page.waitForSelector('#wIn');

    // Focus input and type wrong word using real keyboard: "falsch"
    await page.locator('#wIn').focus();
    await page.keyboard.type('falsch');
    await page.keyboard.press('Enter');

    // Expect rejection (bad feedback)
    const wrongFb = await page.evaluate(() => {
      const fb = document.getElementById('fb');
      const statusLine = fb.querySelector('.fb-status-line');
      const isBad = statusLine !== null && statusLine.classList.contains('bad');
      const nextVisible = document.getElementById('nextBtn').classList.contains('show');
      return { isBad, nextVisible, fbText: fb.textContent.trim() };
    });
    expect(wrongFb.isBad).toBe(true);
    expect(wrongFb.nextVisible).toBe(true);

    // Reset exercise state for gegensaetze.gross to test correct answer
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'gegensaetze');
      const gIdx = cat.words.findIndex(w => w.id === 'gegensaetze.gross');
      exState = { catId: 'gegensaetze', mode: 'written', idx: gIdx, answered: false };
      renderQuestion(cat, 'written', gIdx, cat.words[gIdx]);
    });

    await page.waitForSelector('#wIn');
    await page.locator('#wIn').focus();
    // Type correct answer with real keyboard without article: "groß"
    await page.keyboard.type('groß');
    await page.keyboard.press('Enter');

    // Expect acceptance (ok feedback)
    const correctFb = await page.evaluate(() => {
      const fb = document.getElementById('fb');
      const statusLine = fb.querySelector('.fb-status-line');
      const isOk = statusLine !== null && statusLine.classList.contains('ok');
      const nextVisible = document.getElementById('nextBtn').classList.contains('show');
      return { isOk, nextVisible, fbText: fb.textContent.trim() };
    });
    expect(correctFb.isOk).toBe(true);
    expect(correctFb.nextVisible).toBe(true);
  });

  test('4. Gegensätze: goal counter 🎯 increments when gegensaetze.gross reaches mastery threshold', async ({ page }) => {
    await page.evaluate(() => {
      const cat = CATEGORIES.find(c => c.id === 'gegensaetze');
      const gIdx = cat.words.findIndex(w => w.id === 'gegensaetze.gross');
      const th = threshFor('written');
      stats.todayCount = 0;
      stats.dailyGoal = 20;
      ensureProgress('gegensaetze', 'written').unlocked = Math.max(ensureProgress('gegensaetze', 'written').unlocked, gIdx + 1);
      setWordCount('gegensaetze', 'written', gIdx, th - 1);
      refreshGoalDisplay();

      go({ screen: 'exercise', catId: 'gegensaetze', mode: 'written' });
      exState = { catId: 'gegensaetze', mode: 'written', idx: gIdx, answered: false };
      renderQuestion(cat, 'written', gIdx, cat.words[gIdx]);
    });

    await page.waitForSelector('#wIn');
    await page.locator('#wIn').focus();
    await page.keyboard.type('groß');
    await page.keyboard.press('Enter');

    const goalInfo = await page.evaluate(() => ({
      todayCount: getTodayCount(),
      goalText: document.querySelector('#headGoalBtn .goal-num')?.textContent.trim()
    }));
    expect(goalInfo.todayCount).toBe(1);
    expect(goalInfo.goalText).toBe('1/20');
  });
});

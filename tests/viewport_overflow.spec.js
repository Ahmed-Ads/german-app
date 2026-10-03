// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

/**
 * Real 360px Viewport Overflow Audit & Multi-Resolution Screenshots
 * Viewport: { width: 360, height: 740 }, deviceScaleFactor: 2
 * Screens:
 *  1. home
 *  2. category (mode picker)
 *  3. mcq_exercise
 *  4. feedback_state
 *  5. written_exercise
 *  6. flashcard
 *  7. stats
 *  8. starred_list
 *  (settings: not present in app)
 *
 * For each screen:
 *  - Measures document.documentElement.scrollWidth
 *  - Identifies elements exceeding [0, 360] horizontal bounds (right > 360 or left < 0)
 *  - Captures full-page screenshots at 360px and 1280px widths to audit/windows_results/screens/
 *  - Prints detailed report of all offenders
 */

test.describe('360px Mobile Viewport Overflow Audit & Screenshots', () => {
  const screensDir = path.resolve(__dirname, '..', 'audit', 'windows_results', 'screens');

  test.beforeAll(() => {
    if (!fs.existsSync(screensDir)) {
      fs.mkdirSync(screensDir, { recursive: true });
    }
  });

  test('audits horizontal overflow and saves screenshots across all screens', async ({ page }) => {
    const appUrl = process.env.APP_URL || 'http://localhost:8000/';
    console.log('========================================================');
    console.log('  360px VIEWPORT HORIZONTAL OVERFLOW AUDIT');
    console.log(`  Target: ${appUrl}`);
    console.log('  Viewport: 360x740 @ 2x DPR');
    console.log('========================================================');

    await page.setViewportSize({ width: 360, height: 740 });

    const auditResults = {};

    async function auditCurrentScreen(screenKey, screenName) {
      console.log(`\n--- Auditing Screen: ${screenName} (${screenKey}) ---`);

      // Ensure 360x740 viewport
      await page.setViewportSize({ width: 360, height: 740 });
      await page.waitForTimeout(400);

      // Save 360px screenshot
      const screen360Path = path.join(screensDir, `${screenKey}_360.png`);
      await page.screenshot({ path: screen360Path, fullPage: true });

      // Audit DOM elements bounds and scrollWidth
      const audit = await page.evaluate(() => {
        const docEl = document.documentElement;
        const body = document.body;
        const scrollW = Math.max(docEl.scrollWidth, body.scrollWidth);
        const clientW = docEl.clientWidth;

        const offenders = [];
        document.querySelectorAll('*').forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const rightOverflow = rect.right > 360.5;
            const leftOverflow = rect.left < -0.5;
            if (rightOverflow || leftOverflow) {
              let sel = el.tagName.toLowerCase();
              if (el.id) sel += '#' + el.id;
              if (el.className && typeof el.className === 'string') {
                sel += '.' + el.className.trim().split(/\s+/).join('.');
              }
              offenders.push({
                selector: sel,
                left: Math.round(rect.left * 10) / 10,
                right: Math.round(rect.right * 10) / 10,
                width: Math.round(rect.width * 10) / 10,
                overflowSide: rightOverflow && leftOverflow ? 'BOTH' : rightOverflow ? 'RIGHT' : 'LEFT',
                text: el.textContent ? el.textContent.trim().replace(/\s+/g, ' ').slice(0, 30) : ''
              });
            }
          }
        });

        return {
          scrollWidth: scrollW,
          clientWidth: clientW,
          scrollWidthOk: scrollW <= 360,
          offendersCount: offenders.length,
          offenders
        };
      });

      console.log(`  scrollWidth: ${audit.scrollWidth}px (Target <= 360px -> ${audit.scrollWidthOk ? 'PASS' : 'OVERFLOW'})`);
      console.log(`  Offending Elements Count: ${audit.offendersCount}`);

      if (audit.offendersCount > 0) {
        console.log('  Top Offenders:');
        audit.offenders.slice(0, 15).forEach((off, idx) => {
          console.log(`    ${idx + 1}. [${off.overflowSide}] <${off.selector}> width=${off.width}px, left=${off.left}px, right=${off.right}px ${off.text ? '("' + off.text + '")' : ''}`);
        });
      }

      // Capture 1280px desktop screenshot for comparison
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.waitForTimeout(300);
      const screen1280Path = path.join(screensDir, `${screenKey}_1280.png`);
      await page.screenshot({ path: screen1280Path, fullPage: true });

      // Reset to 360px viewport
      await page.setViewportSize({ width: 360, height: 740 });
      await page.waitForTimeout(200);

      auditResults[screenKey] = audit;
    }

    // 1. Home Screen
    await page.goto(appUrl, { waitUntil: 'networkidle' });
    await auditCurrentScreen('home', 'Home Screen');

    // 2. Category / Mode Picker
    await page.evaluate(() => {
      if (typeof window.go === 'function') window.go({ screen: 'modes', catId: 'obst' });
    });
    await auditCurrentScreen('category', 'Category Mode Picker (obst)');

    // 3. MCQ Exercise
    await page.evaluate(() => {
      if (typeof window.go === 'function') window.go({ screen: 'exercise', catId: 'obst', mode: 'mcq' });
    });
    await auditCurrentScreen('mcq_exercise', 'MCQ Exercise');

    // 4. Feedback State
    const optButton = page.locator('.opt').first();
    if (await optButton.count() > 0) {
      await optButton.click();
      await page.waitForTimeout(300);
    }
    await auditCurrentScreen('feedback_state', 'MCQ Feedback State');

    // 5. Written Exercise
    await page.evaluate(() => {
      if (typeof window.go === 'function') window.go({ screen: 'exercise', catId: 'obst', mode: 'written' });
    });
    await auditCurrentScreen('written_exercise', 'Written Exercise');

    // 6. Flashcard Mode
    await page.evaluate(() => {
      if (typeof window.go === 'function') window.go({ screen: 'flashcards', catId: 'obst' });
    });
    await auditCurrentScreen('flashcard', 'Flashcard Screen');

    // 7. Stats Screen
    await page.evaluate(() => {
      if (typeof window.go === 'function') window.go({ screen: 'stats' });
    });
    await auditCurrentScreen('stats', 'Statistics Screen');

    // 8. Starred List Screen
    await page.evaluate(() => {
      if (typeof window.go === 'function') window.go({ screen: 'starredList' });
    });
    await auditCurrentScreen('starred_list', 'Starred Words List');

    // Summary logging
    console.log('\n========================================================');
    console.log('  360px VIEWPORT AUDIT SUMMARY:');
    console.log('========================================================');
    for (const [key, res] of Object.entries(auditResults)) {
      console.log(`- ${key.padEnd(18)}: scrollWidth=${res.scrollWidth}px, clientWidth=${res.clientWidth}px | Offenders: ${res.offendersCount} (${res.scrollWidthOk ? 'Clean' : 'Overflow'})`);
    }
    console.log('========================================================');
    console.log(`Screenshots saved to: ${screensDir}`);
  });
});

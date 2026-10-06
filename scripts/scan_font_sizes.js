const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { getChromePath, toFileUrl, getTempDir, cleanupArtifacts } = require('./chrome_path.js');

const CHROME_PATH = getChromePath();
const rootDir = path.resolve(__dirname, '..');
const tempDir = getTempDir(CHROME_PATH);
const rootBaseUrl = toFileUrl(rootDir, CHROME_PATH).replace(/\/?$/, '/');

const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

const scanScript = `
<script>
window.addEventListener('DOMContentLoaded', async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  await wait(500);

  const findings = [];
  const overflowChecks = [];
  const scannedElements = new Set();

  function scanScreen(screenName) {
    const all = document.querySelectorAll('#app *');
    all.forEach(el => {
      if (el.children.length === 0 && el.textContent.trim().length > 0) {
        if (!el.offsetParent && el.tagName.toLowerCase() !== 'body') {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return;
        }
        const style = window.getComputedStyle(el);
        const sizePx = parseFloat(style.fontSize);
        if (sizePx < 12) {
          const key = screenName + ':' + el.tagName + ':' + el.className + ':' + el.textContent.trim().slice(0, 20);
          if (!scannedElements.has(key)) {
            scannedElements.add(key);
            let sel = el.tagName.toLowerCase();
            if (el.id) sel += '#' + el.id;
            if (el.className) sel += '.' + Array.from(el.classList).join('.');
            findings.push({
              screen: screenName,
              selector: sel,
              fontSize: style.fontSize,
              text: el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 45)
            });
          }
        }
      }
    });
  }

  function checkOverflow(screenName) {
    if (screenName === 'Home') {
      const cards = Array.from(document.querySelectorAll('.cat-card'));
      const allCardsOk = cards.length > 0 && cards.every(c => c.scrollWidth <= c.clientWidth);
      const c0 = cards[0];
      overflowChecks.push({
        target: 'Home (.cat-card with 12px cat-meta)',
        clientWidth: c0 ? c0.clientWidth : 0,
        scrollWidth: c0 ? c0.scrollWidth : 0,
        noOverflow: allCardsOk
      });
    } else if (screenName === 'Stats') {
      const cards = Array.from(document.querySelectorAll('.stat-card'));
      const allCardsOk = cards.length > 0 && cards.every(c => c.scrollWidth <= c.clientWidth);
      const c0 = cards[0];
      overflowChecks.push({
        target: 'Stats (.stat-card with 12px stat-card-tag)',
        clientWidth: c0 ? c0.clientWidth : 0,
        scrollWidth: c0 ? c0.scrollWidth : 0,
        noOverflow: allCardsOk
      });
      const tags = Array.from(document.querySelectorAll('.stat-card-tag'));
      const allTagsOk = tags.length > 0 && tags.every(t => t.scrollWidth <= t.clientWidth);
      overflowChecks.push({
        target: 'Stats (12px .stat-card-tag)',
        clientWidth: tags[0] ? tags[0].clientWidth : 0,
        scrollWidth: tags[0] ? tags[0].scrollWidth : 0,
        noOverflow: allTagsOk
      });
    }
  }

  try {
    // 1. Home screen
    scanScreen('Home');
    checkOverflow('Home');

    // 2. Open Category (Obst)
    if (typeof openCategory === 'function') {
      openCategory('obst');
      await wait(300);
      scanScreen('Category (Obst)');
    }

    // 3. Exercise screen (MCQ)
    if (typeof startMode === 'function') {
      startMode('mcq');
      await wait(300);
      scanScreen('Exercise (MCQ)');
    }

    // 4. Flashcard screen
    if (typeof startMode === 'function') {
      startMode('flashcard');
      await wait(300);
      scanScreen('Flashcard');
    }

    // 5. Stats screen
    if (typeof renderStats === 'function') {
      renderStats();
      await wait(300);
      scanScreen('Stats');
      checkOverflow('Stats');
    }
  } catch(e) {
    findings.push({ screen: 'Error', selector: 'none', fontSize: '0', text: e.message });
  }

  const outDiv = document.createElement('div');
  outDiv.id = 'font-scan-results';
  outDiv.textContent = JSON.stringify({ findings, overflowChecks });
  document.body.appendChild(outDiv);
});
</script>
`;

const runnerHtml = html
  .replace('<head>', `<head><base href="${rootBaseUrl}">`)
  .replace('</body>', scanScript + '</body>');
const tempFilePath = path.join(tempDir, 'temp_scan_fonts.html');
fs.writeFileSync(tempFilePath, runnerHtml, 'utf8');

try {
  // Use 360x640 mobile viewport
  const fileUrl = toFileUrl(tempFilePath, CHROME_PATH);
  const cmd = `"${CHROME_PATH}" --headless --no-sandbox --disable-gpu --window-size=360,640 --virtual-time-budget=6000 --dump-dom "${fileUrl}"`;
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const m = out.match(/<div id="font-scan-results">([\s\S]*?)<\/div>/);
  if (m) {
    const raw = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const results = JSON.parse(raw);
    console.log('========================================================');
    console.log(`TOTAL ELEMENTS WITH FONT-SIZE < 12px: ${results.findings.length}`);
    console.log('========================================================');
    if (results.findings.length > 0) {
      console.log(JSON.stringify(results.findings, null, 2));
    } else {
      console.log('🎉 ZERO ELEMENTS WITH FONT-SIZE < 12px ACROSS ALL SCREENS!');
    }
    console.log('\n========================================================');
    console.log('  360px VIEWPORT OVERFLOW AUDIT:');
    console.log('========================================================');
    results.overflowChecks.forEach(c => {
      console.log(`- ${c.target || c.screen}: clientWidth=${c.clientWidth}px, scrollWidth=${c.scrollWidth}px -> Overflow: ${c.noOverflow ? 'NO (Clean: scrollWidth <= clientWidth)' : 'YES (Fail)'}`);
    });
    console.log('========================================================');
  } else {
    console.log('Results div not found');
  }
} finally {
  for (const d of [tempDir, rootDir]) {
    const p = path.join(d, 'temp_scan_fonts.html');
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (e) {}
    }
  }
  cleanupArtifacts([rootDir, tempDir], ['temp_scan_fonts.html']);
}

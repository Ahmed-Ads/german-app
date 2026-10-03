const fs = require('fs');
const { execSync } = require('child_process');

const html = fs.readFileSync('index.html', 'utf8');

const scanScript = `
<script>
window.addEventListener('DOMContentLoaded', async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  await wait(500);

  const findings = [];
  const scannedElements = new Set();

  function scanScreen(screenName) {
    const all = document.querySelectorAll('#app *');
    all.forEach(el => {
      if (el.children.length === 0 && el.textContent.trim().length > 0) {
        if (!el.offsetParent && el.tagName.toLowerCase() !== 'body') {
          // Check if element is visible or within a visible container
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return;
        }
        const style = window.getComputedStyle(el);
        const sizePx = parseFloat(style.fontSize);
        if (sizePx < 12) {
          const key = screenName + ':' + el.tagName + ':' + el.className + ':' + el.textContent.trim().slice(0, 20);
          if (!scannedElements.has(key)) {
            scannedElements.add(key);
            
            // Build informative selector
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

  try {
    // 1. Home screen
    scanScreen('Home');

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
    }
  } catch(e) {
    findings.push({ screen: 'Error', selector: 'none', fontSize: '0', text: e.message });
  }

  const outDiv = document.createElement('div');
  outDiv.id = 'font-scan-results';
  outDiv.textContent = JSON.stringify(findings);
  document.body.appendChild(outDiv);
});
</script>
`;

const runnerHtml = html.replace('</body>', scanScript + '</body>');
const tempFile = 'temp_scan_fonts.html';
fs.writeFileSync(tempFile, runnerHtml, 'utf8');

try {
  const cmd = '"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --virtual-time-budget=6000 --dump-dom "file:///C:/German_App/' + tempFile + '"';
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const m = out.match(/<div id="font-scan-results">([\s\S]*?)<\/div>/);
  if (m) {
    const raw = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const results = JSON.parse(raw);
    console.log(`TOTAL ELEMENTS WITH FONT-SIZE < 12px: ${results.length}`);
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log('Results div not found');
  }
} finally {
  if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
}

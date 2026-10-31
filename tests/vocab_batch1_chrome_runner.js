const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getChromePath, toFileUrl, getTempDir } = require('../scripts/chrome_path.js');

console.log('======================================================================');
console.log('  RUNNING REAL CHROME VOCABULARY BATCH 1 VALIDATION RUNNER');
console.log('======================================================================');

let CHROME_PATH;
try {
  CHROME_PATH = getChromePath();
} catch (e) {
  console.log('[NOT RUN] Chrome is not available in this environment: ' + e.message);
  process.exit(0);
}

if (!CHROME_PATH || !fs.existsSync(CHROME_PATH)) {
  console.log('[NOT RUN] Chrome binary not found at ' + CHROME_PATH);
  process.exit(0);
}

const rootDir = path.resolve(__dirname, '..');
const tempDir = getTempDir(CHROME_PATH);
const rootBaseUrl = toFileUrl(rootDir, CHROME_PATH).replace(/\/?$/, '/');

const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

const testScript = `
<script>
window.__CHROME_VOCAB_RESULTS__ = {
  passed: false,
  checks: [],
  logs: [],
  consoleErrors: []
};

const origError = console.error;
console.error = function() {
  const args = Array.prototype.slice.call(arguments).map(function(a) {
    return String(a);
  });
  window.__CHROME_VOCAB_RESULTS__.consoleErrors.push(args.join(' '));
  origError.apply(console, arguments);
};

function addCheck(name, pass, detail) {
  window.__CHROME_VOCAB_RESULTS__.checks.push({ name: name, pass: pass, detail: detail });
  window.__CHROME_VOCAB_RESULTS__.logs.push((pass ? '[PASS] ' : '[FAIL] ') + name + ': ' + detail);
}

window.addEventListener('DOMContentLoaded', async function() {
  try {
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = function() {};
    }

    // 1. Total categories and words check
    const totalCategories = CATEGORIES.length;
    const totalWords = CATEGORIES.reduce(function(s, c) { return s + (c.words ? c.words.length : 0); }, 0);
    addCheck('Total Categories Count', totalCategories === 31, 'categories=' + totalCategories);
    addCheck('Total Words Count', totalWords === 1029, 'totalWords=' + totalWords);

    // 2. Check removed word absent (musik.didgeridoo)
    const musikCat = CATEGORIES.find(function(c) { return c.id === 'musik'; });
    const hasDidgeridoo = musikCat && musikCat.words.some(function(w) {
      return w.n === 'Didgeridoo' || w.id === 'musik.didgeridoo';
    });
    addCheck('Removed Word Didgeridoo Absent', !hasDidgeridoo, 'hasDidgeridoo=' + hasDidgeridoo);

    // 3. Check kept word present (musik.gitarre)
    const hasGitarre = musikCat && musikCat.words.some(function(w) {
      return w.n === 'Gitarre' && w.id === 'musik.gitarre';
    });
    addCheck('Kept Word Gitarre Present', hasGitarre, 'hasGitarre=' + hasGitarre);

    // 4. Navigate to Stats Screen and verify total words displayed
    go({ screen: 'stats' });
    await new Promise(function(r) { setTimeout(r, 80); });

    const statsScreenActive = view && view.screen === 'stats';
    const appText = document.getElementById('app') ? document.getElementById('app').innerText : '';
    const statsShows1029 = appText.indexOf('/ 1029') !== -1 || appText.indexOf('1029') !== -1;
    addCheck('Stats Screen Total Words Match', statsScreenActive && statsShows1029,
      'statsScreenActive=' + statsScreenActive + ', shows1029=' + statsShows1029);

    // 5. Check console errors count
    const errCount = window.__CHROME_VOCAB_RESULTS__.consoleErrors.length;
    addCheck('Zero Console Errors', errCount === 0,
      'errorCount=' + errCount + (errCount > 0 ? (': ' + window.__CHROME_VOCAB_RESULTS__.consoleErrors.join(' | ')) : ''));

    window.__CHROME_VOCAB_RESULTS__.passed = window.__CHROME_VOCAB_RESULTS__.checks.every(function(c) { return c.pass; });
  } catch (err) {
    addCheck('Runtime Exception', false, err.stack || err.message);
    window.__CHROME_VOCAB_RESULTS__.passed = false;
  } finally {
    var reportDiv = document.createElement('div');
    reportDiv.id = 'chrome-vocab-report';
    reportDiv.textContent = JSON.stringify(window.__CHROME_VOCAB_RESULTS__);
    document.body.appendChild(reportDiv);
  }
});
</script>
`;

function decodeHtml(str) {
  return str.replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');
}

const runnerHtml = html
  .replace('<head>', `<head><base href="${rootBaseUrl}">`)
  .replace('</body>', testScript + '</body>');

const tempFilePath = path.join(tempDir, 'temp_vocab_batch1_test.html');
fs.writeFileSync(tempFilePath, runnerHtml, 'utf8');

try {
  const fileUrl = toFileUrl(tempFilePath, CHROME_PATH);
  const cmd = `"${CHROME_PATH}" --headless --no-sandbox --disable-gpu --virtual-time-budget=6000 --dump-dom "${fileUrl}"`;
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const m = out.match(/<div id="chrome-vocab-report">([\s\S]*?)<\/div>/);
  if (m) {
    const rawJson = decodeHtml(m[1]);
    const res = JSON.parse(rawJson);
    for (const log of res.logs) {
      console.log(log);
    }
    console.log('======================================================================');
    if (res.passed) {
      console.log('🎉 REAL CHROME VOCABULARY BATCH 1 CHECK PASSED!');
      process.exit(0);
    } else {
      console.error('❌ REAL CHROME VOCABULARY BATCH 1 CHECK FAILED!');
      process.exit(1);
    }
  } else {
    console.error('Failed to locate test report in Chrome DOM');
    process.exit(2);
  }
} finally {
  for (const d of [tempDir, rootDir]) {
    const p = path.join(d, 'temp_vocab_batch1_test.html');
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (e) {}
    }
  }
}

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getChromePath, toFileUrl, getTempDir, cleanupArtifacts } = require('../scripts/chrome_path.js');

console.log('======================================================================');
console.log('  RUNNING REAL CHROME WRITTEN ARTICLE VALIDATION TEST');
console.log('======================================================================');

const CHROME_PATH = getChromePath();
const rootDir = path.resolve(__dirname, '..');
const tempDir = getTempDir(CHROME_PATH);
const rootBaseUrl = toFileUrl(rootDir, CHROME_PATH).replace(/\/?$/, '/');

const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

const testScript = `
<script>
window.__CHROME_WRITTEN_RESULTS__ = {
  passed: false,
  checks: [],
  logs: []
};

function addCheck(name, pass, detail) {
  window.__CHROME_WRITTEN_RESULTS__.checks.push({ name: name, pass: pass, detail: detail });
  window.__CHROME_WRITTEN_RESULTS__.logs.push((pass ? '[PASS] ' : '[FAIL] ') + name + ': ' + detail);
}

window.addEventListener('DOMContentLoaded', async function() {
  try {
    // Mock speech to avoid audio calls in headless
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = function() {};
    }

    resetAllProgress();

    // 1. Navigate to written mode in category with articles ('obst')
    go({ screen: 'exercise', catId: 'obst', mode: 'written' });

    var obstCat = CATEGORIES.find(function(c) { return c.id === 'obst'; });
    var currentWord = obstCat.words[exState.idx];
    var wInput = document.getElementById('wIn');
    var wSubmitBtn = document.getElementById('wSub');

    var prevAnswered = stats.totalAnswered || 0;
    var prevCorrect = stats.totalCorrect || 0;

    // Check 1: Instruction label indicates article requirement
    var qsub = document.querySelector('.qsub');
    var hasInstruction = qsub && qsub.textContent.includes('يجب كتابتها مع أداة التعريف');
    addCheck('Instruction Notice', Boolean(hasInstruction),
      hasInstruction ? 'qsub displays \"يجب كتابتها مع أداة التعريف\"' : 'qsub missing required article instruction');

    // Check 2: Submit noun WITHOUT article (e.g. "Apfel")
    wInput.value = currentWord.n;
    wSubmitBtn.click();

    var fb = document.getElementById('fb');
    var expectedArabicNotice = 'تنبيه: الكلمة صحيحة لكن لازم تكتب أداة التعريف (der / die / das) معها.';
    var noticePresent = fb && fb.textContent.includes(expectedArabicNotice);
    var badStatusPresent = fb && fb.querySelector('.fb-status-line.bad') !== null;
    var countedWrong = (stats.totalAnswered === prevAnswered + 1) && (stats.totalCorrect === prevCorrect);
    var inputDisabled = (wInput.disabled === true);

    addCheck('Missing Article Rejection & Arabic Notice', Boolean(noticePresent && badStatusPresent && countedWrong && inputDisabled),
      'Noun \"' + currentWord.n + '\" without article: noticePresent=' + noticePresent + ', badStatusPresent=' + badStatusPresent + ', countedWrong=' + countedWrong + ', inputDisabled=' + inputDisabled);

    // Check 3: Proceed and test correct submission with article
    var nextBtn = document.getElementById('nextBtn');
    if (nextBtn) nextBtn.click();

    var nextWord = obstCat.words[exState.idx];
    var nextInput = document.getElementById('wIn');
    var nextSubmitBtn = document.getElementById('wSub');
    var prevAnswered2 = stats.totalAnswered;
    var prevCorrect2 = stats.totalCorrect;

    // Submit WITH correct article (e.g. "der Apfel")
    nextInput.value = nextWord.a + ' ' + nextWord.n;
    nextSubmitBtn.click();

    var nextFb = document.getElementById('fb');
    var okStatusPresent = nextFb && nextFb.querySelector('.fb-status-line.ok') !== null;
    var countedCorrect = (stats.totalAnswered === prevAnswered2 + 1) && (stats.totalCorrect === prevCorrect2 + 1);

    addCheck('Correct Answer With Article Accepted', Boolean(okStatusPresent && countedCorrect),
      'Full answer \"' + nextWord.a + ' ' + nextWord.n + '\": okStatusPresent=' + okStatusPresent + ', countedCorrect=' + countedCorrect);

    window.__CHROME_WRITTEN_RESULTS__.passed = window.__CHROME_WRITTEN_RESULTS__.checks.every(function(c) { return c.pass; });
  } catch (err) {
    addCheck('Runtime Exception', false, err.stack || err.message);
    window.__CHROME_WRITTEN_RESULTS__.passed = false;
  } finally {
    var reportDiv = document.createElement('div');
    reportDiv.id = 'chrome-written-report';
    reportDiv.textContent = JSON.stringify(window.__CHROME_WRITTEN_RESULTS__);
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

const tempFilePath = path.join(tempDir, 'temp_written_test.html');
fs.writeFileSync(tempFilePath, runnerHtml, 'utf8');

try {
  const fileUrl = toFileUrl(tempFilePath, CHROME_PATH);
  const cmd = `"${CHROME_PATH}" --headless --no-sandbox --disable-gpu --virtual-time-budget=6000 --dump-dom "${fileUrl}"`;
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const m = out.match(/<div id="chrome-written-report">([\s\S]*?)<\/div>/);
  if (m) {
    const rawJson = decodeHtml(m[1]);
    const res = JSON.parse(rawJson);
    for (const log of res.logs) {
      console.log(log);
    }
    console.log('======================================================================');
    if (res.passed) {
      console.log('🎉 REAL CHROME WRITTEN ARTICLE CHECK PASSED!');
      process.exit(0);
    } else {
      console.error('❌ REAL CHROME WRITTEN ARTICLE CHECK FAILED!');
      process.exit(1);
    }
  } else {
    console.error('Failed to locate test report in Chrome DOM');
    process.exit(2);
  }
} finally {
  for (const d of [tempDir, rootDir]) {
    const p = path.join(d, 'temp_written_test.html');
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (e) {}
    }
  }
}

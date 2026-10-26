const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getChromePath, toFileUrl, getTempDir, cleanupArtifacts } = require('../scripts/chrome_path.js');

console.log('======================================================================');
console.log('  RUNNING REAL CHROME UMLAUT ON-SCREEN INPUT VALIDATION TEST');
console.log('======================================================================');

let CHROME_PATH;
try {
  CHROME_PATH = getChromePath();
} catch (e) {
  console.log('[NOT RUN] Headless Chrome path not found: ' + (e.message || e));
  process.exit(0);
}

const rootDir = path.resolve(__dirname, '..');
const tempDir = getTempDir(CHROME_PATH);
const rootBaseUrl = toFileUrl(rootDir, CHROME_PATH).replace(/\/?$/, '/');

const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

const testScript = `
<script>
window.__CHROME_UMLAUT_RESULTS__ = {
  passed: false,
  checks: [],
  logs: []
};

function addCheck(name, pass, detail) {
  window.__CHROME_UMLAUT_RESULTS__.checks.push({ name: name, pass: pass, detail: detail });
  window.__CHROME_UMLAUT_RESULTS__.logs.push((pass ? '[PASS] ' : '[FAIL] ') + name + ': ' + detail);
}

window.addEventListener('DOMContentLoaded', async function() {
  try {
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = function() {};
    }

    await resetAllProgress();

    // -----------------------------------------------------------------
    // 1. Umlaut Bar Presence & Structure in Written Mode
    // -----------------------------------------------------------------
    go({ screen: 'exercise', catId: 'milch', mode: 'written' });

    var wInput = document.getElementById('wIn');
    var wSubmitBtn = document.getElementById('wSub');
    var bar = document.querySelector('.umlaut-bar');

    var barPresent = Boolean(bar);
    var btnRow = bar ? bar.querySelector('.umlaut-btn-row') : null;
    var rowAttrsOk = btnRow && btnRow.getAttribute('dir') === 'ltr' && btnRow.getAttribute('lang') === 'de';

    var expectedChars = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'];
    var btns = bar ? Array.from(bar.querySelectorAll('.umlaut-btn')) : [];
    var btnsOk = btns.length === 7 && expectedChars.every(function(ch, idx) {
      var b = btns[idx];
      return b && b.textContent === ch && b.type === 'button' &&
             b.getAttribute('aria-label') === ('إدراج الحرف ' + ch) &&
             b.getAttribute('dir') === 'ltr' && b.getAttribute('lang') === 'de';
    });

    var hint = bar ? bar.querySelector('.umlaut-hint') : null;
    var hintOk = hint && hint.textContent.includes('اكتب ae أو oe أو ue أو ss، أو استعمل الأزرار');

    addCheck('Written Mode Umlaut Bar Structure', Boolean(barPresent && rowAttrsOk && btnsOk && hintOk),
      'barPresent=' + barPresent + ', rowAttrsOk=' + rowAttrsOk + ', btnsCount=' + btns.length + ', hintOk=' + hintOk);

    // -----------------------------------------------------------------
    // 2. Click ä button with caret in the middle of text
    // -----------------------------------------------------------------
    wInput.focus();
    wInput.value = 'Kse';
    wInput.selectionStart = 1;
    wInput.selectionEnd = 1;

    var aeBtn = btns.find(function(b) { return b.textContent === 'ä'; });
    if (aeBtn) aeBtn.click();

    var caretMidOk = (wInput.value === 'Käse') && (wInput.selectionStart === 2) && (wInput.selectionEnd === 2);
    addCheck('Caret Middle Insertion & Caret Advance', Boolean(caretMidOk),
      'Value after ä click: \"' + wInput.value + '\" (expected \"Käse\"), caret=' + wInput.selectionStart + ' (expected 2)');

    // -----------------------------------------------------------------
    // 3. Submit word with umlaut typed via buttons
    // -----------------------------------------------------------------
    var milchCat = CATEGORIES.find(function(c) { return c.id === 'milch'; });
    var kaeseIdx = milchCat.words.findIndex(function(w) { return w.n === 'Käse'; });

    exState = { catId: milchCat.id, mode: 'written', idx: kaeseIdx, answered: false };
    renderQuestion(milchCat, 'written', kaeseIdx, milchCat.words[kaeseIdx]);

    var input1 = document.getElementById('wIn');
    var sub1 = document.getElementById('wSub');
    var bar1 = document.querySelector('.umlaut-bar');
    var aeBtn1 = bar1 ? Array.from(bar1.querySelectorAll('.umlaut-btn')).find(function(b) { return b.textContent === 'ä'; }) : null;

    input1.value = 'der K';
    input1.selectionStart = 5;
    input1.selectionEnd = 5;
    if (aeBtn1) aeBtn1.click();
    input1.value += 'se';
    input1.selectionStart = 8;
    input1.selectionEnd = 8;

    sub1.click();

    var fb1 = document.getElementById('fb');
    var ok1 = fb1 && fb1.querySelector('.fb-status-line.ok') !== null;
    addCheck('Umlaut Word Accepted via Buttons', Boolean(ok1),
      'Word \"der Käse\" submitted via buttons: ok=' + ok1);

    // -----------------------------------------------------------------
    // 4. Submit word with umlaut typed via ASCII digraph (ae & oe)
    // -----------------------------------------------------------------
    exState = { catId: milchCat.id, mode: 'written', idx: kaeseIdx, answered: false };
    renderQuestion(milchCat, 'written', kaeseIdx, milchCat.words[kaeseIdx]);

    var input2 = document.getElementById('wIn');
    var sub2 = document.getElementById('wSub');

    input2.value = 'der Kaese';
    sub2.click();

    var fb2 = document.getElementById('fb');
    var ok2 = fb2 && fb2.querySelector('.fb-status-line.ok') !== null;
    addCheck('Umlaut Word Accepted via ASCII Digraph (ae)', Boolean(ok2),
      'Word \"der Kaese\" submitted with ASCII digraph: ok=' + ok2);

    // Digraph oe for ö (der Löwe in tiere)
    var tiereCat = CATEGORIES.find(function(c) { return c.id === 'tiere'; });
    var loeweIdx = tiereCat.words.findIndex(function(w) { return w.n === 'Löwe'; });
    exState = { catId: tiereCat.id, mode: 'written', idx: loeweIdx, answered: false };
    renderQuestion(tiereCat, 'written', loeweIdx, tiereCat.words[loeweIdx]);

    var input3 = document.getElementById('wIn');
    var sub3 = document.getElementById('wSub');
    input3.value = 'der Loewe';
    sub3.click();

    var fb3 = document.getElementById('fb');
    var ok3 = fb3 && fb3.querySelector('.fb-status-line.ok') !== null;
    addCheck('Umlaut Word Accepted via ASCII Digraph (oe)', Boolean(ok3),
      'Word \"der Loewe\" submitted with ASCII digraph oe: ok=' + ok3);

    // -----------------------------------------------------------------
    // 5. Assert Bar Present in Every Typed Mode / Field
    // -----------------------------------------------------------------
    // Mode A: Category Written
    go({ screen: 'exercise', catId: 'obst', mode: 'written' });
    var barCatWritten = document.querySelector('#wIn') && document.querySelector('.umlaut-bar');

    // Mode B: Search Box on Home Screen
    go({ screen: 'home' });
    var barSearch = document.querySelector('#vocabSearchInput') && document.querySelector('.umlaut-bar');

    // Mode C: Global Written (seed 1 learned word)
    var testCat = CATEGORIES[0];
    applyResult(testCat.id, 'written', 0, true);
    go({ screen: 'exercise', mode: 'globalWritten' });
    var barGlobalWritten = document.querySelector('#wIn') && document.querySelector('.umlaut-bar');

    // Mode D: Difficult Written (seed 1 difficult word)
    var pDiff = ensureProgress(testCat.id, 'written');
    pDiff.counts[0] = 0;
    go({ screen: 'exercise', mode: 'diffWritten' });
    var barDiffWritten = document.querySelector('#wIn') && document.querySelector('.umlaut-bar');

    var allTypedModesOk = Boolean(barCatWritten && barSearch && barGlobalWritten && barDiffWritten);
    addCheck('Bar Present Across All Typed Modes', allTypedModesOk,
      'catWritten=' + Boolean(barCatWritten) + ', search=' + Boolean(barSearch) + ', globalWritten=' + Boolean(barGlobalWritten) + ', diffWritten=' + Boolean(barDiffWritten));

    // -----------------------------------------------------------------
    // 6. Assert No Horizontal Overflow at 360px Viewport Width on Written Screen
    // -----------------------------------------------------------------
    go({ screen: 'exercise', catId: 'obst', mode: 'written' });
    document.body.style.width = '360px';
    document.body.style.margin = '0 auto';
    document.body.style.padding = '20px 12px 48px';

    var docW = document.body.scrollWidth;
    var bodyRect = document.body.getBoundingClientRect();

    var allElements = Array.from(document.querySelectorAll('.wrap *'));
    var offenders = [];
    allElements.forEach(function(el) {
      if (el.scrollWidth > 360) {
        var cls = el.className ? ('.' + String(el.className).replace(/\\s+/g, '.')) : el.tagName;
        offenders.push(cls + ' (scrollWidth=' + el.scrollWidth + ')');
      }
      var rect = el.getBoundingClientRect();
      var relativeRight = rect.right - bodyRect.left;
      if (relativeRight > 360.5) {
        var cls2 = el.className ? ('.' + String(el.className).replace(/\\s+/g, '.')) : el.tagName;
        offenders.push(cls2 + ' (relativeRight=' + Math.round(relativeRight) + ')');
      }
    });

    var noOverflow = (docW <= 360) && (offenders.length === 0);
    addCheck('360px Viewport No Horizontal Overflow', noOverflow,
      'bodyScrollWidth=' + docW + ', offendersCount=' + offenders.length + (offenders.length ? ' [' + offenders.slice(0, 3).join(', ') + ']' : ''));

    window.__CHROME_UMLAUT_RESULTS__.passed = window.__CHROME_UMLAUT_RESULTS__.checks.every(function(c) { return c.pass; });
  } catch (err) {
    addCheck('Runtime Exception', false, err.stack || err.message);
    window.__CHROME_UMLAUT_RESULTS__.passed = false;
  } finally {
    var reportDiv = document.createElement('div');
    reportDiv.id = 'chrome-umlaut-report';
    reportDiv.textContent = JSON.stringify(window.__CHROME_UMLAUT_RESULTS__);
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

const tempFilePath = path.join(tempDir, 'temp_umlaut_test.html');
fs.writeFileSync(tempFilePath, runnerHtml, 'utf8');

try {
  const fileUrl = toFileUrl(tempFilePath, CHROME_PATH);
  const cmd = `"${CHROME_PATH}" --headless --no-sandbox --disable-gpu --virtual-time-budget=10000 --dump-dom "${fileUrl}"`;
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const m = out.match(/<div id="chrome-umlaut-report">([\s\S]*?)<\/div>/);
  if (m) {
    const rawJson = decodeHtml(m[1]);
    const res = JSON.parse(rawJson);
    for (const log of res.logs) {
      console.log(log);
    }
    console.log('======================================================================');
    if (res.passed) {
      console.log('🎉 REAL CHROME UMLAUT ON-SCREEN INPUT CHECK PASSED!');
      process.exit(0);
    } else {
      console.error('❌ REAL CHROME UMLAUT ON-SCREEN INPUT CHECK FAILED!');
      process.exit(1);
    }
  } else {
    console.error('Failed to locate test report in Chrome DOM');
    process.exit(2);
  }
} finally {
  for (const d of [tempDir, rootDir]) {
    const p = path.join(d, 'temp_umlaut_test.html');
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (e) {}
    }
  }
}

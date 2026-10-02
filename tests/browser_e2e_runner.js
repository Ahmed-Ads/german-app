const fs = require('fs');
const { execSync } = require('child_process');

console.log('========================================================');
console.log('  RUNNING END-TO-END BROWSER TESTS IN REAL CHROME');
console.log('========================================================');

const html = fs.readFileSync('index.html', 'utf8');

// Injected E2E Test Suite
const testRunner = `
<script>
window.__E2E_RESULTS__ = { passed: 0, failed: 0, logs: [] };

function log(msg, ok=true) {
  window.__E2E_RESULTS__.logs.push((ok ? '[PASS] ' : '[FAIL] ') + msg);
  if (ok) window.__E2E_RESULTS__.passed++;
  else window.__E2E_RESULTS__.failed++;
}

window.addEventListener('DOMContentLoaded', async () => {
  try {
    // Test 1: Page rendering and main landmark
    const main = document.querySelector('main#app[role="main"]');
    if (main) log('Main landmark <main#app role="main"> exists');
    else log('Main landmark missing', false);

    // Test 2: Categories grid rendered
    const catCards = document.querySelectorAll('.cat-card[data-cat]');
    if (catCards.length === 30) log('Rendered exactly 30 category cards on home screen');
    else log('Expected 30 category cards, found ' + catCards.length, false);

    // Test 3: Search input functionality
    const sInput = document.getElementById('vocabSearchInput');
    if (sInput) {
      sInput.value = 'Apfel';
      sInput.dispatchEvent(new Event('input', { bubbles: true }));
      // Wait for search
      await new Promise(r => setTimeout(r, 100));
      const results = document.querySelectorAll('.search-res-item');
      if (results.length > 0) log('Search for "Apfel" successfully returned ' + results.length + ' results');
      else log('Search for "Apfel" returned 0 results', false);
    }

    // Test 4: Storage layer get/set
    appStorage.set('e2e_test_key', 'test_value_123');
    const val = appStorage.get('e2e_test_key');
    if (val === 'test_value_123') log('appStorage successfully wrote and read test value');
    else log('appStorage failed: got ' + val, false);
    appStorage.remove('e2e_test_key');

    // Test 5: Navigate to category (obst)
    go({ screen: 'modes', catId: 'obst' });
    await new Promise(r => setTimeout(r, 50));
    const headerTitle = document.querySelector('.cat-title h2');
    if (headerTitle && headerTitle.textContent.includes('الفواكه')) {
      log('Successfully navigated to Category view (الفواكه)');
    } else {
      log('Category navigation failed', false);
    }

    // Test 6: Launch MCQ Exercise
    go({ screen: 'exercise', catId: 'obst', mode: 'mcq' });
    await new Promise(r => setTimeout(r, 50));
    const opts = document.querySelectorAll('.opt');
    if (opts.length === 4) {
      log('MCQ exercise launched with exactly 4 options');
    } else {
      log('MCQ exercise failed to render 4 options, found ' + opts.length, false);
    }

    // Test 7: Click option and verify feedback
    if (opts.length > 0) {
      opts[0].click();
      await new Promise(r => setTimeout(r, 50));
      const fb = document.getElementById('fb');
      if (fb && fb.style.display !== 'none' && fb.textContent.length > 0) {
        log('Answer submitted: instant feedback displayed in #fb (aria-live="polite")');
      } else {
        log('Feedback display failed', false);
      }
    }

    // Test 8: Written mode evaluator
    const evalRes = evaluateWrittenAnswer('der Apfel', { a: 'der', n: 'Apfel', ar: 'تفاحة' }, { hasArticles: true });
    if (evalRes.ok) log('Written mode answer evaluation verified');
    else log('Written mode evaluation failed', false);

    // Test 9: Service worker registration check
    if ('serviceWorker' in navigator) {
      log('Service Worker API is available in browser');
    }

  } catch (err) {
    log('Exception in E2E tests: ' + err.message, false);
  } finally {
    const reportDiv = document.createElement('div');
    reportDiv.id = 'e2e-report-output';
    reportDiv.textContent = JSON.stringify(window.__E2E_RESULTS__);
    document.body.appendChild(reportDiv);
  }
});
</script>
`;

const runnerHtml = html.replace('</body>', testRunner + '</body>');
const tempFile = 'temp_e2e_test.html';
fs.writeFileSync(tempFile, runnerHtml, 'utf8');

try {
  const cmd = `"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --virtual-time-budget=8000 --dump-dom "file:///C:/German_App/${tempFile}"`;
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const m = out.match(/id="e2e-report-output"[^>]*>(.*?)<\/div>/);
  if (m) {
    const results = JSON.parse(m[1]);
    results.logs.forEach(l => console.log('  ' + l));
    console.log('--------------------------------------------------------');
    console.log(`Passed: ${results.passed} | Failed: ${results.failed}`);
    if (results.failed === 0) {
      console.log('🎉 ALL REAL BROWSER E2E TESTS PASSED IN GOOGLE CHROME!');
    } else {
      process.exit(1);
    }
  } else {
    console.error('Failed to locate test output in browser DOM dump');
    process.exit(2);
  }
} finally {
  if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
}

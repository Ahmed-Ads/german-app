const fs = require('fs');
const { execSync } = require('child_process');

const html = fs.readFileSync('index.html', 'utf8');

const testScript = `
<script>
window.__CONSOLE_LOGS__ = [];
window.__ERRORS__ = [];

const origError = console.error;
console.error = function(...args) {
  window.__CONSOLE_LOGS__.push({ type: 'error', text: args.map(a => String(a)).join(' ') });
  origError.apply(console, args);
};

const origWarn = console.warn;
console.warn = function(...args) {
  window.__CONSOLE_LOGS__.push({ type: 'warn', text: args.map(a => String(a)).join(' ') });
  origWarn.apply(console, args);
};

window.addEventListener('error', function(e) {
  window.__ERRORS__.push({ type: 'pageerror', message: e.message, filename: e.filename, lineno: e.lineno });
});

window.addEventListener('DOMContentLoaded', async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await wait(500);

  try {
    // Flow 1: Home screen already rendered

    // Flow 2: Open category 'obst'
    if (typeof openCategory === 'function') {
      openCategory('obst');
      await wait(300);
    }

    // Flow 3: Start MCQ and answer one question
    if (typeof startMode === 'function') {
      startMode('mcq');
      await wait(300);
      const optBtn = document.querySelector('.mcq-btn');
      if (optBtn) {
        optBtn.click();
        await wait(300);
      }
    }

    // Flow 4: Open stats screen
    if (typeof renderStats === 'function') {
      renderStats();
      await wait(300);
    }

    // Flow 5: Go back to home
    if (typeof goHome === 'function') {
      goHome();
      await wait(300);
    }
  } catch(err) {
    window.__ERRORS__.push({ type: 'flow_exception', message: err.message });
  }

  const outDiv = document.createElement('div');
  outDiv.id = 'console-flow-results';
  outDiv.textContent = JSON.stringify({
    consoleLogs: window.__CONSOLE_LOGS__,
    errors: window.__ERRORS__
  });
  document.body.appendChild(outDiv);
});
</script>
`;

const runnerHtml = html.replace('</body>', testScript + '</body>');
const tempFile = 'temp_console_flow.html';
fs.writeFileSync(tempFile, runnerHtml, 'utf8');

try {
  const cmd = '"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --virtual-time-budget=6000 --dump-dom "file:///C:/German_App/' + tempFile + '"';
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const m = out.match(/<div id="console-flow-results">([\s\S]*?)<\/div>/);
  if (m) {
    const raw = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const results = JSON.parse(raw);
    console.log('========================================================');
    console.log('  CONSOLE & ERROR SCAN RESULTS:');
    console.log('========================================================');
    console.log('Console Logs count:', results.consoleLogs.length);
    console.log('Errors count:', results.errors.length);
    if (results.consoleLogs.length > 0) {
      console.log('Console Logs:', JSON.stringify(results.consoleLogs, null, 2));
    }
    if (results.errors.length > 0) {
      console.log('Errors:', JSON.stringify(results.errors, null, 2));
    }
    if (results.consoleLogs.length === 0 && results.errors.length === 0) {
      console.log('🎉 ZERO CONSOLE ERRORS, ZERO WARNINGS, ZERO PAGE ERRORS DETECTED IN FLOW!');
    }
    console.log('========================================================');
  } else {
    console.log('Results div not found');
  }
} finally {
  if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
}

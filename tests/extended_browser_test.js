const fs = require('fs');
const { execSync } = require('child_process');

console.log('========================================================');
console.log('  RUNNING EXTENDED REAL-BROWSER E2E TESTS (CHROME)');
console.log('========================================================');

const html = fs.readFileSync('index.html', 'utf8');
const testScript = fs.readFileSync('tests/injected_test.js', 'utf8');

function decodeHtml(str) {
  return str.replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');
}

const runnerHtml = html.replace('</body>', '<script>' + testScript + '</script></body>');
const tempFile = 'temp_ext_test.html';
fs.writeFileSync(tempFile, runnerHtml, 'utf8');

try {
  const cmd = '"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --virtual-time-budget=6000 --dump-dom "file:///C:/German_App/' + tempFile + '"';
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const m = out.match(/<div id="browser-test-report">([\s\S]*?)<\/div>/);
  if (m) {
    const rawJson = decodeHtml(m[1]);
    const logs = JSON.parse(rawJson);
    let allPass = true;
    for (const item of logs) {
      console.log(`- [${item.pass ? 'PASS' : 'FAIL'}] ${item.name}: ${item.detail}`);
      if (!item.pass) allPass = false;
    }
    console.log('========================================================');
    if (allPass) {
      console.log('🎉 ALL EXTENDED BROWSER TESTS PASSED IN GOOGLE CHROME!');
    } else {
      process.exit(1);
    }
  } else {
    console.error('Failed to locate test report in Chrome DOM');
    process.exit(2);
  }
} finally {
  if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
}

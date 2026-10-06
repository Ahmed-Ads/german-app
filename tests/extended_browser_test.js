const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { getChromePath, toFileUrl, getTempDir, cleanupArtifacts } = require('../scripts/chrome_path.js');

console.log('========================================================');
console.log('  RUNNING EXTENDED REAL-BROWSER E2E TESTS (CHROME)');
console.log('========================================================');

const CHROME_PATH = getChromePath();
const rootDir = path.resolve(__dirname, '..');
const tempDir = getTempDir(CHROME_PATH);
const rootBaseUrl = toFileUrl(rootDir, CHROME_PATH).replace(/\/?$/, '/');

const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const testScript = fs.readFileSync(path.join(rootDir, 'tests/injected_test.js'), 'utf8');

function decodeHtml(str) {
  return str.replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');
}

const runnerHtml = html
  .replace('<head>', `<head><base href="${rootBaseUrl}">`)
  .replace('</body>', '<script>' + testScript + '</script></body>');
const tempFilePath = path.join(tempDir, 'temp_ext_test.html');
fs.writeFileSync(tempFilePath, runnerHtml, 'utf8');

try {
  const fileUrl = toFileUrl(tempFilePath, CHROME_PATH);
  const cmd = `"${CHROME_PATH}" --headless --no-sandbox --disable-gpu --virtual-time-budget=6000 --dump-dom "${fileUrl}"`;
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
  for (const d of [tempDir, rootDir]) {
    const p = path.join(d, 'temp_ext_test.html');
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (e) {}
    }
  }
  cleanupArtifacts([rootDir, tempDir], ['temp_ext_test.html']);
}

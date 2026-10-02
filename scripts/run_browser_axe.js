const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const axeSource = fs.readFileSync(path.join(__dirname, '../node_modules/axe-core/axe.min.js'), 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

// Inject axe and runner script right before </body>
const runner = `
<script>
${axeSource}
</script>
<script>
window.addEventListener('DOMContentLoaded', () => {
  axe.run(document, { resultTypes: ['violations'] }).then(results => {
    const reportDiv = document.createElement('div');
    reportDiv.id = 'axe-results-container';
    reportDiv.textContent = JSON.stringify(results.violations);
    document.body.appendChild(reportDiv);
  }).catch(err => {
    const reportDiv = document.createElement('div');
    reportDiv.id = 'axe-results-container';
    reportDiv.textContent = JSON.stringify([{ id: 'error', description: err.message }]);
    document.body.appendChild(reportDiv);
  });
});
</script>
`;

const testHtml = html.replace('</body>', runner + '</body>');
const tempPath = '/mnt/c/German_App/test_axe_browser.html';
fs.writeFileSync(tempPath, testHtml, 'utf8');

try {
  const cmd = `"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --virtual-time-budget=5000 --dump-dom "file:///C:/German_App/test_axe_browser.html"`;
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const m = out.match(/id="axe-results-container"[^>]*>(.*?)<\/div>/);
  if (m) {
    const violations = JSON.parse(m[1]);
    const serious = violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
    console.log(`====================================================`);
    console.log(`  REAL BROWSER AXE-CORE ACCESSIBILITY AUDIT`);
    console.log(`====================================================`);
    console.log(`Total violation types: ${violations.length}`);
    console.log(`Critical / Serious: ${serious.length}`);
    for (const v of serious) {
      console.log(`- [${v.impact.toUpperCase()}] ${v.id}: ${v.description}`);
      for (const node of v.nodes.slice(0, 3)) {
        console.log(`    target: ${node.target.join(' ')}`);
      }
    }
    if (serious.length === 0) {
      console.log('🎉 0 CRITICAL OR SERIOUS ACCESSIBILITY ISSUES IN CHROME!');
    }
    console.log(`====================================================`);
  } else {
    console.log('Could not find axe results container in browser output');
  }
} finally {
  if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
}

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { getChromePath, toFileUrl, getTempDir, cleanupArtifacts } = require('../scripts/chrome_path.js');

console.log('========================================================');
console.log('  RUNNING AXE-CORE ACCESSIBILITY AUDIT IN REAL CHROME');
console.log('========================================================');

const CHROME_PATH = getChromePath();
const rootDir = path.resolve(__dirname, '..');
const tempDir = getTempDir(CHROME_PATH);
const rootBaseUrl = toFileUrl(rootDir, CHROME_PATH).replace(/\/?$/, '/');

const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const axeSource = fs.readFileSync(path.join(rootDir, 'node_modules/axe-core/axe.min.js'), 'utf8');

const runner = `
<script>${axeSource}</script>
<script>
window.addEventListener('DOMContentLoaded', async () => {
  try {
    // Wait for initial render
    await new Promise(r => setTimeout(r, 200));
    const results = await axe.run(document.documentElement, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'best-practice']
      }
    });

    const report = {
      passes: results.passes.length,
      violations: results.violations.map(v => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.length
      }))
    };

    const out = document.createElement('div');
    out.id = 'axe-report-output';
    out.textContent = JSON.stringify(report);
    document.body.appendChild(out);
  } catch(e) {
    const out = document.createElement('div');
    out.id = 'axe-report-output';
    out.textContent = JSON.stringify({ error: e.message });
    document.body.appendChild(out);
  }
});
</script>
`;

const runnerHtml = html
  .replace('<head>', `<head><base href="${rootBaseUrl}">`)
  .replace('</body>', runner + '</body>');
const tempFilePath = path.join(tempDir, 'temp_axe_test.html');
fs.writeFileSync(tempFilePath, runnerHtml, 'utf8');

try {
  const fileUrl = toFileUrl(tempFilePath, CHROME_PATH);
  const cmd = `"${CHROME_PATH}" --headless --no-sandbox --disable-gpu --virtual-time-budget=6000 --dump-dom "${fileUrl}"`;
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const m = out.match(/id="axe-report-output"[^>]*>(.*?)<\/div>/);
  if (m) {
    const report = JSON.parse(m[1]);
    if (report.error) {
      console.error('Axe execution error:', report.error);
      process.exit(1);
    }
    console.log(`WCAG / Best-Practice Rules Passed: ${report.passes}`);
    console.log(`Accessibility Violations: ${report.violations.length}`);
    if (report.violations.length > 0) {
      report.violations.forEach(v => {
        console.log(`- [${v.impact.toUpperCase()}] ${v.id}: ${v.description} (${v.nodes} elements)`);
      });
      process.exit(1);
    } else {
      console.log('✅ ZERO ACCESSIBILITY VIOLATIONS MEASURED IN REAL GOOGLE CHROME');
    }
  } else {
    console.error('Failed to locate axe report output in DOM dump');
    process.exit(2);
  }
} finally {
  for (const d of [tempDir, rootDir]) {
    const p = path.join(d, 'temp_axe_test.html');
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (e) {}
    }
  }
  cleanupArtifacts([rootDir, tempDir], ['temp_axe_test.html']);
}

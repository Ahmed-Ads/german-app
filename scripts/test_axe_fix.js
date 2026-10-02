const fs = require('fs');
const { execSync } = require('child_process');
const axeSource = fs.readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
let html = fs.readFileSync('index.html', 'utf8');

// Replace div#app with main#app
html = html.replace('<div class="wrap" id="app"></div>', '<main class="wrap" id="app" role="main"></main>');

// Replace h3 with h2 for top cards
html = html.replace('<h3 style="margin:0 0 4px;color:#1B5E20;">📅 مراجعة اليوم الذكية (SRS)</h3>', '<h2 style="margin:0 0 4px;font-size:16px;color:#1B5E20;">📅 مراجعة اليوم الذكية (SRS)</h2>')
           .replace('<h3 style="margin:0 0 4px;color:#78350F;">⭐ بنك الكلمات المميزة</h3>', '<h2 style="margin:0 0 4px;font-size:16px;color:#78350F;">⭐ بنك الكلمات المميزة</h2>')
           .replace('<h3 style="margin:0 0 4px;">🔁 مراجعة شاملة لكل الكلمات</h3>', '<h2 style="margin:0 0 4px;font-size:16px;">🔁 مراجعة شاملة لكل الكلمات</h2>')
           .replace('<h3 style="margin:0 0 4px;">🎯 بنك الكلمات الصعبة</h3>', '<h2 style="margin:0 0 4px;font-size:16px;">🎯 بنك الكلمات الصعبة</h2>');

const runner = `
<script>${axeSource}</script>
<script>
window.addEventListener('DOMContentLoaded', () => {
  axe.run(document, { resultTypes: ['violations'] }).then(results => {
    const div = document.createElement('div');
    div.id = 'axe-all';
    div.textContent = JSON.stringify(results.violations);
    document.body.appendChild(div);
  });
});
</script>
`;

fs.writeFileSync('temp_axe_test.html', html.replace('</body>', runner + '</body>'));
try {
  const out = execSync('"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --virtual-time-budget=5000 --dump-dom "file:///C:/German_App/temp_axe_test.html"', { encoding: 'utf8', maxBuffer: 10*1024*1024 });
  const m = out.match(/id="axe-all"[^>]*>(.*?)<\/div>/);
  if (m) {
    const v = JSON.parse(m[1]);
    console.log('VIOLATIONS REMAINING:', v.length);
    v.forEach(x => console.log(' - ' + x.id + ': ' + x.help));
  }
} finally {
  if (fs.existsSync('temp_axe_test.html')) fs.unlinkSync('temp_axe_test.html');
}

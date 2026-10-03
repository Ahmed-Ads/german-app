const fs = require('fs');
const { execSync } = require('child_process');

const html = fs.readFileSync('index.html', 'utf8');

const testCode = `
<script>
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const cards = document.querySelectorAll('.cat-card');
    const results = [];
    cards.forEach((c, idx) => {
      const dataAttrs = {};
      for (const attr of c.attributes) {
        if (attr.name.startsWith('data-')) {
          dataAttrs[attr.name] = attr.value;
        }
      }
      results.push({
        index: idx,
        tag: c.tagName.toLowerCase(),
        id: c.id || '',
        className: c.className || '',
        data: dataAttrs,
        text: (c.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 50)
      });
    });
    const div = document.createElement('div');
    div.id = 'cat-cards-inspect-results';
    div.textContent = JSON.stringify(results);
    document.body.appendChild(div);
  }, 1000);
});
</script>
`;

const runnerHtml = html.replace('</body>', testCode + '</body>');
const tempFile = 'temp_inspect_cards.html';
fs.writeFileSync(tempFile, runnerHtml, 'utf8');

try {
  const cmd = '"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --virtual-time-budget=4000 --dump-dom "file:///C:/German_App/' + tempFile + '"';
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const m = out.match(/<div id="cat-cards-inspect-results">([\s\S]*?)<\/div>/);
  if (m) {
    const str = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const list = JSON.parse(str);
    console.log(`TOTAL .cat-card FOUND: ${list.length}`);
    list.forEach(item => {
      console.log(`[#${item.index}] <${item.tag}> ID='${item.id}' Class='${item.className}' Data=${JSON.stringify(item.data)} Text='${item.text}'`);
    });
  } else {
    console.log('Could not find results marker in DOM');
  }
} finally {
  if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
}

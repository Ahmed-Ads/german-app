const fs = require('fs');
const http = require('http');
const path = require('path');
const { execSync } = require('child_process');

const PORT = 8135;

function startServer() {
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.woff2': 'font/woff2'
  };

  const server = http.createServer((req, res) => {
    let reqUrl = req.url.split('?')[0];
    let filePath = path.join(__dirname, '..', reqUrl === '/' ? 'index.html' : reqUrl);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise(resolve => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

async function runLighthouseAudit() {
  console.log('========================================================');
  console.log('  STARTING LIGHTHOUSE AUDIT (ACCESSIBILITY, BEST-PRACTICES, PWA)');
  console.log('========================================================');

  const server = await startServer();
  console.log(`Server started on http://127.0.0.1:${PORT}`);

  try {
    // Find installed chromium in ~/.cache/ms-playwright
    const findChrome = execSync('find ~/.cache/ms-playwright -name "chrome" -type f 2>/dev/null', { encoding: 'utf8' }).trim();
    const chromePath = findChrome.split('\n')[0];
    if (!chromePath) {
      throw new Error('Chromium binary not found in ~/.cache/ms-playwright');
    }
    console.log(`Using Chromium at: ${chromePath}`);

    const cmd = `npx lighthouse "http://127.0.0.1:${PORT}" --chrome-flags="--headless --no-sandbox" --only-categories=accessibility,best-practices,pwa --output=json --output-path=audit/lighthouse_report.json --no-enable-error-reporting`;
    
    const env = Object.assign({}, process.env, { CHROME_PATH: chromePath });
    execSync(cmd, { env, encoding: 'utf8', stdio: 'inherit' });

    if (fs.existsSync('audit/lighthouse_report.json')) {
      const report = JSON.parse(fs.readFileSync('audit/lighthouse_report.json', 'utf8'));
      console.log('\n========================================================');
      console.log('  LIGHTHOUSE AUDIT SCORES:');
      console.log('========================================================');
      for (const [catId, cat] of Object.entries(report.categories)) {
        console.log(`  - ${cat.title}: ${Math.round(cat.score * 100)} / 100`);
      }
      console.log('========================================================');
    }
  } finally {
    server.close();
  }
}

runLighthouseAudit().catch(err => {
  console.error('Lighthouse execution error:', err.message);
  process.exit(1);
});

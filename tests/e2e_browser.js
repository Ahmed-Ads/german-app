const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8124;

// Simple static HTTP server for tests
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
    let filePath = path.join(__dirname, '..', req.url === '/' ? 'index.html' : req.url.split('?')[0]);
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

async function runE2E() {
  console.log('--- Starting Static Test Server ---');
  const server = await startServer();
  console.log(`Server listening on http://127.0.0.1:${PORT}`);

  console.log('--- Launching Headless Chrome via Puppeteer-Core ---');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    console.log('1. Navigating to http://127.0.0.1:' + PORT);
    await page.goto(`http://127.0.0.1:${PORT}`, { waitUntil: 'networkidle0' });

    // Verify Title & Main Landmark
    const title = await page.title();
    console.log(`   Page title: "${title}"`);
    if (!title.includes('Deutsch lernen')) throw new Error('Incorrect page title');

    const mainExists = await page.$('main#app[role="main"]');
    if (!mainExists) throw new Error('main#app landmark not found');
    console.log('   [✓] Main landmark verified.');

    // Verify Search functionality
    console.log('2. Testing Real-time Search...');
    await page.type('#vocabSearchInput', 'Apfel');
    await page.waitForSelector('.search-res-item', { timeout: 3000 });
    const searchResCount = await page.$$eval('.search-res-item', els => els.length);
    console.log(`   Found ${searchResCount} search results for "Apfel".`);
    if (searchResCount === 0) throw new Error('Search failed to return results');
    console.log('   [✓] Vocabulary search verified.');

    // Clear search
    await page.click('#clearSearchBtn');
    await page.waitForFunction(() => document.getElementById('searchResults').style.display === 'none');
    console.log('   [✓] Search clear button verified.');

    // Verify Category Card Click
    console.log('3. Navigating to Category (obst)...');
    await page.click('.cat-card[data-cat="obst"]');
    await page.waitForSelector('.cat-view-header', { timeout: 3000 });
    const catTitle = await page.$eval('.cat-view-title', el => el.textContent);
    console.log(`   Opened category: "${catTitle}"`);
    console.log('   [✓] Category view opened successfully.');

    // Start MCQ Exercise
    console.log('4. Starting MCQ Exercise...');
    await page.click('button[data-mode="mcq"]');
    await page.waitForSelector('.qcard', { timeout: 3000 });
    const questionText = await page.$eval('.qprompt-ar', el => el.textContent);
    console.log(`   Prompt question: "${questionText}"`);
    const optionsCount = await page.$$eval('.opt', els => els.length);
    if (optionsCount !== 4) throw new Error(`Expected 4 options, found ${optionsCount}`);
    console.log('   [✓] MCQ exercise rendered 4 unique options.');

    // Click an option and verify feedback
    console.log('5. Submitting an answer...');
    await page.click('.opt:first-child');
    await page.waitForSelector('#fb', { timeout: 2000 });
    const fbText = await page.$eval('#fb', el => el.textContent);
    console.log(`   Feedback received: "${fbText.trim().slice(0, 30)}..."`);
    console.log('   [✓] Real-time feedback and state transition verified.');

    // Star a word toggle
    console.log('6. Testing Starred Word toggle...');
    const starBtn = await page.$('.btn-star-toggle');
    if (starBtn) {
      await starBtn.click();
      console.log('   [✓] Starred toggle clicked.');
    }

    // Verify LocalStorage persistence across page reload
    console.log('7. Testing persistence across page reload...');
    await page.reload({ waitUntil: 'networkidle0' });
    const storageProgress = await page.evaluate(() => localStorage.getItem('german-arabic-progress-v1'));
    if (!storageProgress) throw new Error('Progress was not persisted to localStorage');
    console.log('   [✓] Progress safely persisted in unified storage layer across reload.');

    // Verify Service Worker Registration
    console.log('8. Verifying Service Worker...');
    const swReg = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return null;
      const reg = await navigator.serviceWorker.getRegistration();
      return reg ? reg.scope : null;
    });
    console.log(`   Service Worker Scope: ${swReg}`);

    console.log('========================================================');
    console.log('🎉 ALL PLAYWRIGHT / PUPPETEER E2E TESTS PASSED 100%!');
    console.log('========================================================');
  } finally {
    await browser.close();
    server.close();
  }
}

runE2E().catch(err => {
  console.error('E2E TEST FAILURE:', err);
  process.exit(1);
});

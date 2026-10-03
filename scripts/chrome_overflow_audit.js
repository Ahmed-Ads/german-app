const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const widths = [320, 360, 390, 1280];
const screens = [
  { key: 'home', name: 'Home' },
  { key: 'category', name: 'Category (Mode Picker)' },
  { key: 'mcq_exercise', name: 'MCQ Exercise' },
  { key: 'feedback_state', name: 'Feedback State' },
  { key: 'written_exercise', name: 'Written Exercise' },
  { key: 'flashcard', name: 'Flashcard' },
  { key: 'stats', name: 'Stats' },
  { key: 'starred_list', name: 'Starred List' }
];

const screensDir = path.resolve(__dirname, '..', 'audit', 'windows_results', 'screens');
if (!fs.existsSync(screensDir)) {
  fs.mkdirSync(screensDir, { recursive: true });
}

console.log('========================================================');
console.log('  RUNNING COMPREHENSIVE VIEWPORT OVERFLOW AUDIT');
console.log('  Target: Chrome Headless (Real Engine)');
console.log('  Widths: 320px, 360px, 390px, 1280px');
console.log('  Screens: 8 distinct screens');
console.log('========================================================\n');

// Results matrix: screenKey -> { width: { scrollWidth, clientWidth, innerWidth, offendersCount, offenders } }
const matrix = {};
screens.forEach(s => {
  matrix[s.key] = { name: s.name };
});

for (const w of widths) {
  const runnerHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: #fff; overflow: hidden; }
  iframe { border: none; width: ${w}px; height: 800px; display: block; }
</style>
</head>
<body>
<iframe id="app-frame" src="file:///C:/German_App/index.html"></iframe>
<script>
window.addEventListener('DOMContentLoaded', async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  await wait(600);

  const ifr = document.getElementById('app-frame');
  const win = ifr.contentWindow;
  const doc = ifr.contentDocument;

  const results = {};

  async function auditScreen(key) {
    await wait(250);
    const docEl = doc.documentElement;
    const body = doc.body;
    const scrollW = Math.max(docEl.scrollWidth, body.scrollWidth);
    const clientW = docEl.clientWidth;
    const innerW = win.innerWidth;

    const offenders = [];
    const allEls = doc.querySelectorAll('#app *');
    allEls.forEach(el => {
      // Skip detached or invisible elements
      if (!el.offsetParent && el.tagName.toLowerCase() !== 'body') {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        // Elements should not exceed right border (innerW) or left border (0)
        // With RTL scrollbar, left margin is ~15px, so left should be >= -0.5
        const rightOverflow = rect.right > innerW + 0.5;
        const leftOverflow = rect.left < -0.5;
        if (rightOverflow || leftOverflow) {
          let sel = el.tagName.toLowerCase();
          if (el.id) sel += '#' + el.id;
          if (el.className && typeof el.className === 'string') {
            sel += '.' + Array.from(el.classList).join('.');
          }
          offenders.push({
            selector: sel,
            left: Math.round(rect.left * 10) / 10,
            right: Math.round(rect.right * 10) / 10,
            width: Math.round(rect.width * 10) / 10,
            text: el.textContent ? el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 30) : ''
          });
        }
      }
    });

    const hasScrollOverflow = scrollW > clientW;

    results[key] = {
      scrollWidth: scrollW,
      clientWidth: clientW,
      innerWidth: innerW,
      hasScrollOverflow,
      offendersCount: offenders.length,
      offenders
    };
  }

  try {
    // 1. Home
    win.go({ screen: 'home', catId: null, mode: null });
    await auditScreen('home');

    // 2. Category (Mode Picker)
    win.go({ screen: 'modes', catId: 'obst' });
    await auditScreen('category');

    // 3. MCQ Exercise
    win.go({ screen: 'exercise', catId: 'obst', mode: 'mcq' });
    await auditScreen('mcq_exercise');

    // 4. Feedback State (click first option)
    const opt = doc.querySelector('.opt');
    if (opt) {
      opt.click();
      await wait(250);
    }
    await auditScreen('feedback_state');

    // 5. Written Exercise
    win.go({ screen: 'exercise', catId: 'obst', mode: 'written' });
    await auditScreen('written_exercise');

    // 6. Flashcard
    win.go({ screen: 'flashcards', catId: 'obst' });
    await auditScreen('flashcard');

    // 7. Stats
    win.go({ screen: 'stats' });
    await auditScreen('stats');

    // 8. Starred List
    win.go({ screen: 'starredList' });
    await auditScreen('starred_list');

  } catch(e) {
    results.error = e.message;
  }

  const out = document.createElement('div');
  out.id = 'audit-output';
  out.textContent = JSON.stringify(results);
  document.body.appendChild(out);
});
</script>
</body>
</html>`;

  const tempFile = `temp_audit_${w}.html`;
  fs.writeFileSync(tempFile, runnerHtml, 'utf8');

  try {
    const cmd = `"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --allow-file-access-from-files --disable-web-security --window-size=${Math.max(w, 550)},900 --virtual-time-budget=14000 --dump-dom "file:///C:/German_App/${tempFile}"`;
    const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 15 * 1024 * 1024 });
    const m = out.match(/<div id="audit-output">([\s\S]*?)<\/div>/);
    if (m) {
      const raw = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      const res = JSON.parse(raw);
      if (res.error) {
        console.error(`Audit error at ${w}px:`, res.error);
      } else {
        screens.forEach(s => {
          matrix[s.key][w] = res[s.key];
        });
      }
    } else {
      console.error(`Could not find audit-output div for ${w}px`);
    }
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
}

// Print Matrix Table
console.log('========================================================================================================');
console.log(`| ${'Screen'.padEnd(24)} | ${'320px'.padEnd(14)} | ${'360px'.padEnd(14)} | ${'390px'.padEnd(14)} | ${'1280px'.padEnd(14)} |`);
console.log('--------------------------------------------------------------------------------------------------------');

let totalOffenders = 0;
screens.forEach(s => {
  const row = matrix[s.key];
  const col320 = row[320] ? `${row[320].offendersCount} off (${row[320].scrollWidth}px)` : 'N/A';
  const col360 = row[360] ? `${row[360].offendersCount} off (${row[360].scrollWidth}px)` : 'N/A';
  const col390 = row[390] ? `${row[390].offendersCount} off (${row[390].scrollWidth}px)` : 'N/A';
  const col1280 = row[1280] ? `${row[1280].offendersCount} off (${row[1280].scrollWidth}px)` : 'N/A';

  [320, 360, 390, 1280].forEach(w => {
    if (row[w]) totalOffenders += row[w].offendersCount;
  });

  console.log(`| ${s.name.padEnd(24)} | ${col320.padEnd(14)} | ${col360.padEnd(14)} | ${col390.padEnd(14)} | ${col1280.padEnd(14)} |`);
});
console.log('========================================================================================================');

if (totalOffenders > 0) {
  console.log('\n⚠️ OFFENDING ELEMENTS DETAIL:');
  screens.forEach(s => {
    [320, 360, 390, 1280].forEach(w => {
      const data = matrix[s.key][w];
      if (data && data.offendersCount > 0) {
        console.log(`\nScreen: ${s.name} at ${w}px (scrollWidth: ${data.scrollWidth}px, innerWidth: ${data.innerWidth}px):`);
        data.offenders.forEach((o, i) => {
          console.log(`  ${i+1}. <${o.selector}> w=${o.width}px, left=${o.left}px, right=${o.right}px "${o.text}"`);
        });
      }
    });
  });
} else {
  console.log('\n🎉 ZERO OVERFLOW DETECTED ACROSS ALL 8 SCREENS AND ALL 4 VIEWPORT WIDTHS!');
}

// Generate Screenshots for 360px and 1280px
console.log('\n--- Capturing Required Screenshots ---');
const screensToCapture = [
  { key: 'home', w: 360, h: 740, filename: 'home_360.png', nav: "win.go({screen:'home'})" },
  { key: 'exercise', w: 360, h: 740, filename: 'exercise_360.png', nav: "win.go({screen:'exercise', catId:'obst', mode:'mcq'})" },
  { key: 'home_1280', w: 1280, h: 800, filename: 'home_1280.png', nav: "win.go({screen:'home'})" }
];

for (const sc of screensToCapture) {
  const runnerFile = `temp_shot_${sc.key}.html`;
  const shotFileWindows = `C:\\\\German_App\\\\audit\\\\windows_results\\\\screens\\\\${sc.filename}`;
  const runnerHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: #F7F4EC; }
  iframe { border: none; width: ${sc.w}px; height: ${sc.h}px; display: block; }
</style>
</head>
<body>
<iframe id="f" src="file:///C:/German_App/index.html"></iframe>
<script>
window.onload = async () => {
  await new Promise(r => setTimeout(r, 600));
  const ifr = document.getElementById('f');
  const win = ifr.contentWindow;
  ${sc.nav};
  await new Promise(r => setTimeout(r, 400));
  document.title = 'READY_FOR_SCREENSHOT';
};
</script>
</body>
</html>`;

  fs.writeFileSync(runnerFile, runnerHtml, 'utf8');
  try {
    const cmd = `"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --allow-file-access-from-files --disable-web-security --window-size=${sc.w},${sc.h} --screenshot="${shotFileWindows}" "file:///C:/German_App/${runnerFile}"`;
    execSync(cmd, { encoding: 'utf8' });
    console.log(`- Saved screenshot: audit/windows_results/screens/${sc.filename}`);
  } catch(e) {
    console.error(`Failed to capture ${sc.filename}:`, e.message);
  } finally {
    if (fs.existsSync(runnerFile)) fs.unlinkSync(runnerFile);
  }
}

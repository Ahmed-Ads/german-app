const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const axe = require('axe-core');

const html = fs.readFileSync('index.html', 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  pretendToBeVisual: true
});

// Run axe on DOM
axe.run(dom.window.document.documentElement, {
  resultTypes: ['violations']
}, (err, results) => {
  if (err) {
    console.error('Axe error:', err);
    process.exit(1);
  }

  const serious = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
  console.log(`Axe-core audit completed: ${results.violations.length} total violation types found.`);
  console.log(`Critical / Serious violations: ${serious.length}`);

  for (const v of serious) {
    console.log(`- [${v.impact.toUpperCase()}] ${v.id}: ${v.description} (${v.nodes.length} nodes)`);
  }

  if (serious.length > 0) {
    console.log('Details on serious issues:', JSON.stringify(serious.map(s => ({ id: s.id, help: s.help, nodes: s.nodes.map(n => n.html) })), null, 2));
  } else {
    console.log('✅ ZERO critical or serious accessibility violations found in static markup!');
  }
});

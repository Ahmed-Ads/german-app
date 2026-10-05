#!/usr/bin/env node
/**
 * scripts/sw_assets_hash.js
 * Computes a content hash of every non-HTML asset precached by sw.js, and the current CACHE_NAME.
 *
 * Why: sw.js caches these files, so when one changes the CACHE_NAME must be bumped or returning users
 * may keep running stale code. tests/sw_cache_version.test.js compares against tests/sw_assets_baseline.json.
 * The HTML shell ('./') is excluded because it is served network-first and never goes stale.
 *
 * Usage:  node scripts/sw_assets_hash.js --write    (after bumping CACHE_NAME)  ==  npm run update:sw-baseline
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');
const TEXT_EXT = new Set(['.js', '.css', '.json', '.svg', '.html', '.md']);

function extractArray(swCode, name) {
  const m = swCode.match(new RegExp('const\\s+' + name + '\\s*=\\s*\\[([\\s\\S]*?)\\];'));
  if (!m) throw new Error('Could not find ' + name + ' in sw.js');
  return m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}

function computeSwAssetsState() {
  const swCode = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf8');
  const nameMatch = swCode.match(/const\s+CACHE_NAME\s*=\s*['"]([^'"]+)['"]/);
  if (!nameMatch) throw new Error('Could not find CACHE_NAME in sw.js');

  const assets = [...extractArray(swCode, 'CRITICAL_ASSETS'), ...extractArray(swCode, 'OPTIONAL_ASSETS')]
    .filter(a => a !== './' && !a.endsWith('.html'))
    .map(a => a.replace(/^\.\//, ''))
    .sort();

  const hash = crypto.createHash('sha256');
  for (const rel of assets) {
    let buf = fs.readFileSync(path.join(rootDir, rel));
    if (TEXT_EXT.has(path.extname(rel).toLowerCase())) {
      buf = Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8'); // CRLF-safe on Windows checkouts
    }
    hash.update(rel + '\0');
    hash.update(buf);
    hash.update('\0');
  }
  return { cacheName: nameMatch[1], assetsHash: hash.digest('hex'), assetCount: assets.length };
}

module.exports = { computeSwAssetsState };

if (require.main === module) {
  const state = computeSwAssetsState();
  if (process.argv.includes('--write')) {
    const out = path.join(rootDir, 'tests', 'sw_assets_baseline.json');
    fs.writeFileSync(out, JSON.stringify({ cacheName: state.cacheName, assetsHash: state.assetsHash }, null, 2) + '\n');
    console.log(`Baseline written: ${state.cacheName} (${state.assetCount} assets) -> tests/sw_assets_baseline.json`);
  } else {
    console.log(JSON.stringify(state, null, 2));
  }
}

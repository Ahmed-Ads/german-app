import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const siteDir = path.join(rootDir, 'site');
const swPath = path.join(rootDir, 'sw.js');

function extractPrecacheAssets(swCode) {
  const match = swCode.match(/const\s+PRECACHE_ASSETS\s*=\s*\[([\s\S]*?)\];/);
  if (!match) {
    throw new Error('Could not find PRECACHE_ASSETS array in sw.js');
  }
  return match[1]
    .split(',')
    .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function getAllFiles(dir, baseDir = dir) {
  const fileList = [];
  if (!fs.existsSync(dir)) return fileList;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      fileList.push(...getAllFiles(fullPath, baseDir));
    } else {
      fileList.push(relPath);
    }
  }
  return fileList;
}

describe('Site Build & Distribution Integrity (site/)', () => {
  // Ensure site is built
  if (!fs.existsSync(siteDir)) {
    execSync('node scripts/build_site.js', { cwd: rootDir, stdio: 'inherit' });
  }

  const swContent = fs.readFileSync(swPath, 'utf8');
  const precacheAssets = extractPrecacheAssets(swContent);

  it('contains all precached assets defined in sw.js', () => {
    for (const asset of precacheAssets) {
      let relFile = asset.replace(/^\.\//, '');
      if (relFile === '' || relFile === '.') relFile = 'index.html';
      const filePath = path.join(siteDir, relFile);
      expect(fs.existsSync(filePath), `Missing precached asset in site/: ${relFile}`).toBe(true);
    }
  });

  it('contains sw.js, index.html, and manifest.json', () => {
    expect(fs.existsSync(path.join(siteDir, 'sw.js')), 'Missing site/sw.js').toBe(true);
    expect(fs.existsSync(path.join(siteDir, 'index.html')), 'Missing site/index.html').toBe(true);
    expect(fs.existsSync(path.join(siteDir, 'manifest.json')), 'Missing site/manifest.json').toBe(true);
  });

  it('contains zero forbidden directories or files (tests, audit, scripts, proof, node_modules, .bak, .git, etc.)', () => {
    const actualFiles = getAllFiles(siteDir);
    const forbiddenKeywords = ['test', 'audit', 'script', 'proof', 'node_modules', '.bak', '.git'];

    for (const file of actualFiles) {
      const lower = file.toLowerCase();
      for (const kw of forbiddenKeywords) {
        expect(lower, `Forbidden keyword "${kw}" found in site/ file: ${file}`).not.toContain(kw);
      }
      expect(file).not.toMatch(/\.(py|bat|md|sh)$/i);
    }
  });

  it('contains ONLY allowed production files and directories', () => {
    const actualFiles = getAllFiles(siteDir);
    const allowedFiles = new Set([
      'index.html',
      'sw.js',
      'manifest.json',
      'fonts/fonts.css',
      'fonts/font_1.woff2',
      'fonts/font_2.woff2',
      'fonts/font_3.woff2',
      'fonts/font_4.woff2',
      'fonts/font_5.woff2',
      'fonts/font_6.woff2',
      'icons/icon.svg',
      'icons/icon-192.png',
      'icons/icon-512.png',
      'icons/icon-maskable-192.png',
      'icons/icon-maskable-512.png',
      'icons/icon-maskable.svg'
    ]);

    for (const file of actualFiles) {
      expect(allowedFiles.has(file), `Unexpected non-production file in site/: ${file}`).toBe(true);
    }
  });
});

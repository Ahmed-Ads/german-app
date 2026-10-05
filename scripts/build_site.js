#!/usr/bin/env node
/**
 * scripts/build_site.js
 * Builds the production distribution folder `site/` for GitHub Pages.
 * 
 * Copies ONLY:
 *  - index.html
 *  - sw.js
 *  - manifest.json
 *  - _headers
 *  - icons/
 *  - fonts/
 * 
 * Never includes tests, audit, scripts, proof, node_modules, .bak, .git, or any auxiliary files.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const siteDir = path.join(rootDir, 'site');

function copyRecursiveSync(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      copyRecursiveSync(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function buildSite() {
  console.log('========================================================');
  console.log('  BUILDING GITHUB PAGES SITE (site/)');
  console.log('========================================================');
  console.log(`Source directory     : ${rootDir}`);
  console.log(`Target site directory : ${siteDir}`);

  // 1. Clean existing site/ directory
  if (fs.existsSync(siteDir)) {
    console.log('Cleaning existing site/ directory...');
    fs.rmSync(siteDir, { recursive: true, force: true });
  }
  fs.mkdirSync(siteDir, { recursive: true });

  // 2. Specific files to copy
  const filesToCopy = ['index.html', 'sw.js', 'manifest.json', '_headers', 'firebase-config.js'];
  for (const file of filesToCopy) {
    const srcPath = path.join(rootDir, file);
    const destPath = path.join(siteDir, file);
    if (!fs.existsSync(srcPath)) {
      console.error(`❌ ERROR: Source file not found: ${srcPath}`);
      process.exit(1);
    }
    fs.copyFileSync(srcPath, destPath);
    console.log(`  ✓ Copied: ${file} -> site/${file}`);
  }

  // 3. Sync modules and vendor bundle
  const syncFiles = [
    { src: 'sync/merge_policy.js', dest: 'sync/merge_policy.js' },
    { src: 'sync/firebase_adapter.js', dest: 'sync/firebase_adapter.js' },
    { src: 'sync/sync_manager.js', dest: 'sync/sync_manager.js' },
    { src: 'vendor/firebase-sync.bundle.js', dest: 'vendor/firebase-sync.bundle.js' }
  ];
  for (const item of syncFiles) {
    const srcPath = path.join(rootDir, item.src);
    const destPath = path.join(siteDir, item.dest);
    if (!fs.existsSync(srcPath)) {
      console.error(`❌ ERROR: Source file not found: ${srcPath}`);
      process.exit(1);
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
    console.log(`  ✓ Copied: ${item.src} -> site/${item.dest}`);
  }

  // 4. Specific directories to copy
  const dirsToCopy = ['icons', 'fonts'];
  for (const dir of dirsToCopy) {
    const srcPath = path.join(rootDir, dir);
    const destPath = path.join(siteDir, dir);
    if (!fs.existsSync(srcPath)) {
      console.error(`❌ ERROR: Source directory not found: ${srcPath}`);
      process.exit(1);
    }
    copyRecursiveSync(srcPath, destPath);
    console.log(`  ✓ Copied: ${dir}/ -> site/${dir}/`);
  }

  console.log('========================================================');
  console.log('🎉 Site build completed successfully in site/');
  console.log('========================================================');
}

if (require.main === module) {
  buildSite();
}

module.exports = { buildSite };

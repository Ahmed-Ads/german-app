#!/usr/bin/env node
/**
 * scripts/build_sync_bundle.js
 * Bundles only modular Firebase Auth and Firestore into vendor/firebase-sync.bundle.js
 * using esbuild / esbuild-wasm.
 * Calculates hashes, size metrics, and writes vendor/bundle_meta.json.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const rootDir = path.resolve(__dirname, '..');
const entryPath = path.join(rootDir, 'sync', 'firebase_entry.js');
const outputPath = path.join(rootDir, 'vendor', 'firebase-sync.bundle.js');
const metaPath = path.join(rootDir, 'vendor', 'bundle_meta.json');
const pkgPath = path.join(rootDir, 'package.json');
const lockPath = path.join(rootDir, 'package-lock.json');

function computeHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function computeInputHash() {
  const h = crypto.createHash('sha256');
  if (fs.existsSync(entryPath)) h.update(fs.readFileSync(entryPath));
  if (fs.existsSync(pkgPath)) {
    // Hash ONLY the dependency specs that affect the bundle, so unrelated package.json edits
    // (scripts, test-only devDependencies) do not mark the vendored bundle as stale.
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    h.update(JSON.stringify({ firebase: deps.firebase || null, 'esbuild-wasm': deps['esbuild-wasm'] || null }));
  }
  if (fs.existsSync(lockPath)) {
    // Extract only firebase-related dependencies from lockfile to keep it stable
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    const packages = lock.packages || {};
    const fbKeys = Object.keys(packages)
      .filter(k => (k.includes('firebase') || k.includes('esbuild')) && !k.includes('rules-unit-testing'))
      .sort();
    for (const k of fbKeys) {
      h.update(k + ':' + JSON.stringify(packages[k]));
    }
  }
  return h.digest('hex');
}

async function getEsbuild() {
  try {
    return require('esbuild');
  } catch (e) {
    return require('esbuild-wasm');
  }
}

async function build() {
  console.log('========================================================');
  console.log('  BUILDING MINIMAL FIREBASE SYNC BUNDLE');
  console.log('========================================================');

  const esbuild = await getEsbuild();
  console.log(`Using bundler: ${esbuild.version || 'esbuild'}`);

  const licenseNotice = `/*!
 * Firebase Modular Web SDK (Auth + Firestore subset)
 * Copyright Google LLC. Licensed under Apache License 2.0 (http://www.apache.org/licenses/LICENSE-2.0)
 * Bundled with esbuild for German App Cross-Device Sync.
 */`;

  // 1. Build unminified to measure before/after
  const unminified = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    format: 'iife',
    globalName: 'FirebaseSyncBundle',
    write: false,
    target: ['es2020'],
    define: {
      'process.env.NODE_ENV': '"production"'
    }
  });

  const unminifiedCode = unminified.outputFiles[0].text;
  const unminifiedBytes = Buffer.byteLength(unminifiedCode, 'utf8');

  // 2. Build minified production bundle
  const minified = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    format: 'iife',
    globalName: 'FirebaseSyncBundle',
    minify: true,
    write: false,
    banner: { js: licenseNotice },
    target: ['es2020'],
    define: {
      'process.env.NODE_ENV': '"production"'
    }
  });

  const bundleCode = minified.outputFiles[0].text;
  const bundleBytes = Buffer.byteLength(bundleCode, 'utf8');
  const gzippedBytes = zlib.gzipSync(Buffer.from(bundleCode, 'utf8')).length;

  // Ensure vendor/ exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, bundleCode, 'utf8');

  const inputHash = computeInputHash();
  const bundleHash = computeHash(bundleCode);

  const meta = {
    inputHash,
    bundleHash,
    unminifiedBytes,
    bundleBytes,
    gzippedBytes,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

  console.log(`✓ Input Hash         : ${inputHash.slice(0, 16)}...`);
  console.log(`✓ Output Bundle      : vendor/firebase-sync.bundle.js`);
  console.log(`✓ Bundle Hash        : ${bundleHash.slice(0, 16)}...`);
  console.log(`✓ Size (unminified)  : ${(unminifiedBytes / 1024).toFixed(2)} KB (${unminifiedBytes} bytes)`);
  console.log(`✓ Size (minified)    : ${(bundleBytes / 1024).toFixed(2)} KB (${bundleBytes} bytes)`);
  console.log(`✓ Size (gzipped)     : ${(gzippedBytes / 1024).toFixed(2)} KB (${gzippedBytes} bytes)`);
  console.log(`✓ Size Reduction     : ${((1 - bundleBytes / unminifiedBytes) * 100).toFixed(1)}% minified`);
  console.log('========================================================');
  console.log('🎉 Firebase sync bundle successfully built and committed!');
  console.log('========================================================');
}

if (require.main === module) {
  build().catch(err => {
    console.error('Error building firebase sync bundle:', err);
    process.exit(1);
  });
}

module.exports = { build, computeInputHash, computeHash };

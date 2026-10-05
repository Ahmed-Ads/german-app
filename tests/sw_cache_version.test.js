/**
 * tests/sw_cache_version.test.js
 * Guards against shipping changed precached assets without bumping CACHE_NAME in sw.js.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { computeSwAssetsState } = require('../scripts/sw_assets_hash.js');
const baseline = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'sw_assets_baseline.json'), 'utf8'));

describe('Service Worker cache versioning', () => {
  const current = computeSwAssetsState();

  it('bumps CACHE_NAME whenever a precached non-HTML asset changes', () => {
    if (current.cacheName === baseline.cacheName) {
      expect(
        current.assetsHash,
        `Precached assets changed but CACHE_NAME is still "${current.cacheName}". ` +
          `Bump CACHE_NAME in sw.js (e.g. v10 -> v11), then run: npm run update:sw-baseline`
      ).toBe(baseline.assetsHash);
    }
  });

  it('keeps the recorded baseline in sync with sw.js', () => {
    expect(
      { cacheName: current.cacheName, assetsHash: current.assetsHash },
      'tests/sw_assets_baseline.json is out of date. Run: npm run update:sw-baseline'
    ).toEqual(baseline);
  });
});

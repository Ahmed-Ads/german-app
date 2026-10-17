#!/usr/bin/env node
/**
 * scripts/make_legacy_index_ids.js
 * Generates the deterministic mapping LEGACY_INDEX_IDS = { catId: [id0, id1, ...] }
 * from the pre-change vocabulary order in vocab_baseline.json.
 *
 * Id generation rule:
 * - Format: <catId>.<slug>
 * - slug derived from German word without article:
 *   lowercase, ä->ae, ö->oe, ü->ue, ß->ss, spaces and hyphens -> "-",
 *   remove non-[a-z0-9-], collision suffix -2, -3... within category.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const baselinePath = path.join(rootDir, 'vocab_baseline.json');
const outJsonPath = path.join(rootDir, 'sync', 'legacy_index_ids.json');

function generateSlug(wordN) {
  let s = String(wordN || '').replace(/^(der|die|das)\s+/i, '');
  s = s.toLowerCase();
  s = s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  s = s.replace(/[\s\-]+/g, '-');
  s = s.replace(/[^a-z0-9\-]/g, '');
  s = s.replace(/^\-+|\-+$/g, '');
  return s;
}

function buildLegacyIndexIds(categories) {
  const result = {};
  for (const cat of categories) {
    const catId = cat.id;
    result[catId] = [];
    const seen = {};
    for (const w of cat.words) {
      let slug = generateSlug(w.n) || 'word';
      if (!seen[slug]) {
        seen[slug] = 1;
        result[catId].push(`${catId}.${slug}`);
      } else {
        seen[slug]++;
        result[catId].push(`${catId}.${slug}-${seen[slug]}`);
      }
    }
  }
  return result;
}

const outJsPath = path.join(rootDir, 'sync', 'legacy_index_ids.js');

function run() {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const legacyIndexIds = buildLegacyIndexIds(baseline);
  fs.writeFileSync(outJsonPath, JSON.stringify(legacyIndexIds, null, 2) + '\n', 'utf8');

  const jsContent = `(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LEGACY_INDEX_IDS = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return ${JSON.stringify(legacyIndexIds, null, 2)};
}));
`;
  fs.writeFileSync(outJsPath, jsContent, 'utf8');
  console.log(`Generated legacy index IDs for ${Object.keys(legacyIndexIds).length} categories -> ${outJsPath} and ${outJsonPath}`);
  return legacyIndexIds;
}

module.exports = { generateSlug, buildLegacyIndexIds, run };

if (require.main === module) {
  run();
}

#!/usr/bin/env node
/**
 * tools/apply_words_batch7.js
 * ----------------------------
 * Deterministic and idempotent tool to append two new noun categories:
 * - 'natur' (40 words)
 * - 'freizeit' (40 words)
 * from tools/words_batch7.json to CATEGORIES in index.html.
 *
 * Rules:
 * - Reads tools/words_batch7.json (80 words across 2 categories).
 * - Checks base canonical vocab hash (2b64f6c6f68a002b348da6df7f6b8254d8126e80a2c6369c2e38b12633f061d6).
 * - Idempotent: detects if already applied and exits cleanly without modifying.
 * - Aborts without writing on any mismatch (schema, counts, id collision, base hash).
 * - Dry-run by default (--write or --apply required to persist changes).
 * - Appends new categories at the end of CATEGORIES (after 'arbeit'), in JSON order.
 * - Preserves existing 35 categories (including 263 verbs and batch 6) and VERB_FORMS byte-identical.
 * - Verifies inline script syntax before writing.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const { resolveCategoriesSource } = require('../scripts/vocab_source.js');

const EXPECTED_BASE_HASH = '2b64f6c6f68a002b348da6df7f6b8254d8126e80a2c6369c2e38b12633f061d6';
const EXPECTED_NEW_HASH = '6175494747eead771264dd54f18ade0f7495ca9669ceba42729d4c1023fae8dd';
const EXPECTED_VERB_FORMS_CHECKSUM = 'c2d747185f9f66d27921f0320124098d2ad0ab65a308e3c15d7a3c295e0cfe72';

const EXPECTED_CATEGORIES = [
  { id: 'natur', wordCount: 40 },
  { id: 'freizeit', wordCount: 40 }
];
const EXPECTED_WORD_COUNT = 80;

function canonicalJson(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

function computeCanonicalHash(categories) {
  const normalized = categories.map(cat => ({
    ...cat,
    hasArticles: Boolean(cat.hasArticles)
  }));
  const cjson = canonicalJson(normalized);
  return crypto.createHash('sha256').update(Buffer.from(cjson, 'utf8')).digest('hex');
}

function extractCategoriesAndVerbForms(htmlContent, categoriesSource) {
  const scripts = [...htmlContent.matchAll(/<script(?![^>]*src=)(?:[^>]*)>([\s\S]*?)<\/script>/gi)];
  if (scripts.length < 2) {
    throw new Error('Could not find main application script in HTML');
  }
  const mainScript = scripts[1][1].replace(/\ninit\(\);/g, '\n// init();');

  const sandbox = {
    console,
    Math,
    String,
    Number,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    RegExp,
    JSON,
    setTimeout: () => {},
    clearTimeout: () => {},
    setInterval: () => {},
    clearInterval: () => {},
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    window: {
      addEventListener: () => {},
      removeEventListener: () => {},
      location: { href: '' },
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
      }
    },
    navigator: {
      language: 'de',
      languages: ['de'],
      serviceWorker: { addEventListener: () => {} }
    }
  };
  sandbox.window.window = sandbox.window;
  sandbox.window.document = sandbox.document;

  vm.createContext(sandbox);
  vm.runInContext((categoriesSource ? categoriesSource + '\n' : '') + mainScript, sandbox);

  return {
    categories: sandbox.window.CATEGORIES,
    verbForms: sandbox.window.VERB_FORMS
  };
}

function validateBatch7(batchData, retiredPath) {
  if (!batchData || typeof batchData !== 'object') {
    throw new Error('Batch 7 data is invalid');
  }
  if (batchData.version !== 1) {
    throw new Error(`Expected batch 7 version 1, found ${batchData.version}`);
  }
  if (!Array.isArray(batchData.categories) || batchData.categories.length !== EXPECTED_CATEGORIES.length) {
    throw new Error(`Expected exactly ${EXPECTED_CATEGORIES.length} categories in batch 7, found ${batchData.categories ? batchData.categories.length : 0}`);
  }

  let retiredIds = new Set();
  if (retiredPath && fs.existsSync(retiredPath)) {
    try {
      const retiredList = JSON.parse(fs.readFileSync(retiredPath, 'utf8'));
      if (Array.isArray(retiredList)) {
        retiredIds = new Set(retiredList.map(item => (typeof item === 'string' ? item : item.id)));
      }
    } catch (_) {}
  }

  const seenWordIds = new Set();
  let totalWordCount = 0;

  batchData.categories.forEach((cat, cIdx) => {
    const expectedCat = EXPECTED_CATEGORIES[cIdx];
    if (cat.id !== expectedCat.id) {
      throw new Error(`Category at index ${cIdx} has id '${cat.id}', expected '${expectedCat.id}'`);
    }
    if (!cat.de || typeof cat.de !== 'string') throw new Error(`Category '${cat.id}' missing valid 'de'`);
    if (!cat.ar || typeof cat.ar !== 'string') throw new Error(`Category '${cat.id}' missing valid 'ar'`);
    if (cat.hasArticles !== true) throw new Error(`Category '${cat.id}' hasArticles must be true`);
    if (!Array.isArray(cat.words) || cat.words.length !== expectedCat.wordCount) {
      throw new Error(`Category '${cat.id}' expected ${expectedCat.wordCount} words, found ${cat.words ? cat.words.length : 0}`);
    }

    if (retiredIds.has(cat.id)) {
      throw new Error(`Category id '${cat.id}' is in vocab_ids_retired.json`);
    }

    totalWordCount += cat.words.length;

    cat.words.forEach(w => {
      if (!w.id || typeof w.id !== 'string') throw new Error(`Word missing valid 'id' in category '${cat.id}'`);
      if (!w.id.startsWith(cat.id + '.')) {
        throw new Error(`Word id '${w.id}' does not start with category prefix '${cat.id}.'`);
      }
      if (seenWordIds.has(w.id)) {
        throw new Error(`Duplicate word id '${w.id}' inside batch 7`);
      }
      seenWordIds.add(w.id);

      if (retiredIds.has(w.id)) {
        throw new Error(`Batch 7 word '${w.id}' collides with retired id in vocab_ids_retired.json`);
      }

      if (!['der', 'die', 'das'].includes(w.a)) {
        throw new Error(`Word '${w.id}' invalid article '${w.a}', expected der/die/das`);
      }
      if (typeof w.n !== 'string' || !w.n.trim()) throw new Error(`Word '${w.id}' missing valid 'n'`);
      if (typeof w.ar !== 'string' || !w.ar.trim()) throw new Error(`Word '${w.id}' missing valid 'ar'`);

      if (w.pl !== null && (typeof w.pl !== 'string' || !w.pl.startsWith('die '))) {
        throw new Error(`Word '${w.id}' invalid plural '${w.pl}', expected null or 'die ...'`);
      }

      if (typeof w.s !== 'string' || !w.s.trim()) throw new Error(`Word '${w.id}' missing valid 's'`);
      if (typeof w.sar !== 'string' || !w.sar.trim()) throw new Error(`Word '${w.id}' missing valid 'sar'`);
    });
  });

  if (totalWordCount !== EXPECTED_WORD_COUNT) {
    throw new Error(`Expected total ${EXPECTED_WORD_COUNT} words in batch 7, found ${totalWordCount}`);
  }
}

function serializeWord(w) {
  let line = "    {id:'" + w.id + "',a:'" + w.a + "',n:'" + w.n + "',ar:'" + w.ar + "'";
  if (w.note !== undefined && w.note !== null && String(w.note).trim() !== '') {
    line += ",note:'" + String(w.note).trim().replace(/'/g, "\\'") + "'";
  }
  if (w.pl === null || w.pl === undefined) {
    line += ",pl:null";
  } else {
    line += ",pl:'" + w.pl.replace(/'/g, "\\'") + "'";
  }
  line += ",s:'" + w.s.replace(/'/g, "\\'") + "',sar:'" + w.sar.replace(/'/g, "\\'") + "'}";
  return line;
}

function serializeCategory(c, isLast) {
  const header = "  { id:'" + c.id + "', ar:'" + c.ar.replace(/'/g, "\\'") + "', de:'" + c.de.replace(/'/g, "\\'") + "', hasArticles:" + (c.hasArticles ? "true" : "false") + ", words:[";
  const wordLines = c.words.map((w, idx) => {
    const isLastWord = idx === c.words.length - 1;
    return serializeWord(w) + (isLastWord ? '' : ',');
  }).join('\n');
  const footer = isLast ? '  ]}' : '  ]},';
  return header + '\n' + wordLines + '\n' + footer;
}

function applyWordsBatch7(htmlPath, jsonPath, options = {}) {
  // Dry-run by default: only false when dryRun === false or write === true
  const dryRun = options.dryRun !== undefined ? Boolean(options.dryRun) : (!options.write);
  const expectedBaseHash = options.expectedBaseHash || EXPECTED_BASE_HASH;

  if (!fs.existsSync(htmlPath)) {
    throw new Error(`Target HTML file not found: ${htmlPath}`);
  }
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Words JSON file not found: ${jsonPath}`);
  }

  const { html, mode, sourceText, sourcePath, categoriesSource } = resolveCategoriesSource(htmlPath, options.categoriesPath);
  const batchData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const retiredPath = path.join(path.dirname(htmlPath), 'vocab_ids_retired.json');
  validateBatch7(batchData, retiredPath);

  const { categories, verbForms } = extractCategoriesAndVerbForms(html, categoriesSource);

  // Check VERB_FORMS checksum
  const vfCanonical = JSON.stringify(verbForms);
  const vfChecksum = crypto.createHash('sha256').update(vfCanonical).digest('hex');
  if (vfChecksum !== EXPECTED_VERB_FORMS_CHECKSUM) {
    throw new Error(`VERB_FORMS checksum mismatch: expected ${EXPECTED_VERB_FORMS_CHECKSUM}, found ${vfChecksum}. Aborting.`);
  }

  const existingCatIds = new Set(categories.map(c => c.id));
  const existingWordIds = new Set();
  categories.forEach(c => {
    c.words.forEach(w => {
      existingWordIds.add(w.id);
    });
  });

  const batchCatIds = batchData.categories.map(c => c.id);
  const presentCatIds = batchCatIds.filter(id => existingCatIds.has(id));

  const allBatchWordIds = [];
  batchData.categories.forEach(c => c.words.forEach(w => allBatchWordIds.push(w.id)));
  const presentWordIds = allBatchWordIds.filter(id => existingWordIds.has(id));

  // Idempotency check: if both categories and all 80 words already present
  if (presentCatIds.length === EXPECTED_CATEGORIES.length && presentWordIds.length === EXPECTED_WORD_COUNT) {
    const currentHash = computeCanonicalHash(categories);
    const vfCanonicalCurrent = JSON.stringify(verbForms);
    const vfChecksumCurrent = crypto.createHash('sha256').update(vfCanonicalCurrent).digest('hex');
    return {
      applied: false,
      alreadyApplied: true,
      categoryCount: EXPECTED_CATEGORIES.length,
      wordCount: EXPECTED_WORD_COUNT,
      baseHash: expectedBaseHash,
      newHash: currentHash,
      verbFormsChecksum: vfChecksumCurrent
    };
  }

  // Partial presence or ID collision check
  if (presentCatIds.length > 0 || presentWordIds.length > 0) {
    const collCat = presentCatIds[0] || 'none';
    const collWord = presentWordIds[0] || 'none';
    throw new Error(`ID collision or partial batch 7 application: category '${collCat}' or word '${collWord}' already exists in vocabulary (${presentCatIds.length}/${EXPECTED_CATEGORIES.length} cats, ${presentWordIds.length}/${EXPECTED_WORD_COUNT} words present). Aborting.`);
  }

  // Base hash check
  const currentBaseHash = computeCanonicalHash(categories);
  if (currentBaseHash !== expectedBaseHash) {
    throw new Error(`Base vocabulary hash mismatch: expected ${expectedBaseHash}, but current HTML has ${currentBaseHash}. Aborting without changes.`);
  }

  // Verify structure: exactly 35 categories, 1381 words, 'arbeit' as last category (index 34)
  if (categories.length !== 35) {
    throw new Error(`Expected exactly 35 categories before applying batch 7, found ${categories.length}. Aborting.`);
  }
  const currentWordCount = categories.reduce((s, c) => s + c.words.length, 0);
  if (currentWordCount !== 1381) {
    throw new Error(`Expected exactly 1381 words before applying batch 7, found ${currentWordCount}. Aborting.`);
  }

  // Ensure 'verben' is category index 30 with 263 words
  if (categories[30].id !== 'verben' || categories[30].words.length !== 263) {
    throw new Error(`Expected category 30 to be 'verben' with 263 verbs, found ${categories[30].id} with ${categories[30].words.length} words. Aborting.`);
  }

  // Ensure 'gesundheit' is category index 31 with 46 words
  if (categories[31].id !== 'gesundheit' || categories[31].words.length !== 46) {
    throw new Error(`Expected category 31 to be 'gesundheit' with 46 words, found ${categories[31].id} with ${categories[31].words.length} words. Aborting.`);
  }

  // Ensure 'einkaufen' is category index 32 with 42 words
  if (categories[32].id !== 'einkaufen' || categories[32].words.length !== 42) {
    throw new Error(`Expected category 32 to be 'einkaufen' with 42 words, found ${categories[32].id} with ${categories[32].words.length} words. Aborting.`);
  }

  // Ensure 'reisen' is category index 33 with 36 words
  if (categories[33].id !== 'reisen' || categories[33].words.length !== 36) {
    throw new Error(`Expected category 33 to be 'reisen' with 36 words, found ${categories[33].id} with ${categories[33].words.length} words. Aborting.`);
  }

  // Ensure 'arbeit' is category index 34 with 42 words (the LAST category)
  if (categories[34].id !== 'arbeit' || categories[34].words.length !== 42) {
    throw new Error(`Expected category 34 to be 'arbeit' with 42 words, found ${categories[34].id} with ${categories[34].words.length} words. Aborting.`);
  }

  // Format new categories lines (levels field in batch 7 json ignored, matching batch 6)
  const serializedCategories = batchData.categories.map((c, idx) =>
    serializeCategory(c, idx === batchData.categories.length - 1)
  ).join('\n');

  // Locate the closing of 'arbeit' category and the end of CATEGORIES array
  const arbeitEndRegex = /(\n\s*\{\s*id\s*:\s*['"]arbeit['"][\s\S]*?\n\s*\]\s*\})(\s*\n\s*\]\s*;)/;
  const match = sourceText.match(arbeitEndRegex);
  if (!match) {
    throw new Error("Could not locate the closing of 'arbeit' category at the end of CATEGORIES");
  }

  const updatedCategoriesSection = `${match[1]},\n${serializedCategories}\n];`;
  const transformedHtml = sourceText.replace(arbeitEndRegex, updatedCategoriesSection);

  // Verify syntax of the transformed source
  if (mode === 'inline') {
    const scriptMatches = [...transformedHtml.matchAll(/<script(?![^>]*src=)(?:[^>]*)>([\s\S]*?)<\/script>/gi)];
    scriptMatches.forEach((sm, i) => {
      new vm.Script(sm[1], { filename: `transformed-inline-script-${i}.js` });
    });
  } else {
    new vm.Script(transformedHtml, { filename: sourcePath });
  }

  // Verify updated categories and compute new hash
  const updatedState = extractCategoriesAndVerbForms(
    mode === 'inline' ? transformedHtml : html,
    mode === 'inline' ? null : transformedHtml
  );
  if (updatedState.categories.length !== 37) {
    throw new Error(`Verification failed: categories count is ${updatedState.categories.length}, expected 37`);
  }
  const updatedWordCount = updatedState.categories.reduce((s, c) => s + c.words.length, 0);
  if (updatedWordCount !== 1461) {
    throw new Error(`Verification failed: total words count is ${updatedWordCount}, expected 1461`);
  }
  if (updatedState.categories[35].id !== 'natur' || updatedState.categories[35].words.length !== 40) {
    throw new Error(`Verification failed: natur category invalid`);
  }
  if (updatedState.categories[36].id !== 'freizeit' || updatedState.categories[36].words.length !== 40) {
    throw new Error(`Verification failed: freizeit category invalid`);
  }

  // Verify VERB_FORMS unchanged
  const newVfCanonical = JSON.stringify(updatedState.verbForms);
  const newVfChecksum = crypto.createHash('sha256').update(newVfCanonical).digest('hex');
  if (newVfChecksum !== EXPECTED_VERB_FORMS_CHECKSUM) {
    throw new Error(`Verification failed: VERB_FORMS checksum changed from ${EXPECTED_VERB_FORMS_CHECKSUM} to ${newVfChecksum}`);
  }

  const newHash = computeCanonicalHash(updatedState.categories);
  if (newHash !== EXPECTED_NEW_HASH) {
    throw new Error(`Verification failed: new hash is ${newHash}, expected ${EXPECTED_NEW_HASH}`);
  }

  if (!dryRun) {
    fs.writeFileSync(sourcePath, transformedHtml, 'utf8');
  }

  return {
    applied: !dryRun,
    dryRun,
    alreadyApplied: false,
    categoryCount: EXPECTED_CATEGORIES.length,
    wordCount: EXPECTED_WORD_COUNT,
    baseHash: currentBaseHash,
    newHash,
    verbFormsChecksum: newVfChecksum
  };
}

if (require.main === module) {
  const rootDir = path.resolve(__dirname, '..');
  const defaultHtml = path.join(rootDir, 'index.html');
  const defaultJson = path.join(__dirname, 'words_batch7.json');

  const args = process.argv.slice(2);
  const writeRequested = args.includes('--write') || args.includes('--apply');
  const isDryRun = args.includes('--dry-run') || !writeRequested;
  const nonFlagArgs = args.filter(a => !a.startsWith('--'));

  const targetHtml = nonFlagArgs[0] ? path.resolve(nonFlagArgs[0]) : defaultHtml;
  const targetJson = nonFlagArgs[1] ? path.resolve(nonFlagArgs[1]) : defaultJson;

  try {
    const res = applyWordsBatch7(targetHtml, targetJson, { dryRun: isDryRun });
    if (res.alreadyApplied) {
      console.log(`[ALREADY APPLIED] Batch 7 (${res.categoryCount} categories, ${res.wordCount} words) is already present in ${targetHtml}`);
      console.log(`  Canonical vocab hash : ${res.newHash}`);
      console.log(`  VERB_FORMS checksum  : ${res.verbFormsChecksum}`);
    } else if (res.dryRun) {
      console.log(`[DRY-RUN OK] Batch 7 (${res.categoryCount} categories, ${res.wordCount} words) can be cleanly applied to ${targetHtml}`);
      console.log(`  Base canonical hash  : ${res.baseHash}`);
      console.log(`  New canonical hash   : ${res.newHash}`);
      console.log(`  VERB_FORMS checksum  : ${res.verbFormsChecksum}`);
      console.log(`  (No files were modified - run with --write or --apply to persist)`);
    } else {
      console.log(`[APPLIED OK] Successfully appended ${res.categoryCount} categories (${res.wordCount} words) to CATEGORIES in ${targetHtml}`);
      console.log(`  Base canonical hash  : ${res.baseHash}`);
      console.log(`  New canonical hash   : ${res.newHash}`);
      console.log(`  VERB_FORMS checksum  : ${res.verbFormsChecksum}`);
    }
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  applyWordsBatch7,
  EXPECTED_BASE_HASH,
  EXPECTED_NEW_HASH,
  EXPECTED_VERB_FORMS_CHECKSUM,
  EXPECTED_CATEGORIES,
  EXPECTED_WORD_COUNT,
  computeCanonicalHash,
  extractCategoriesAndVerbForms
};

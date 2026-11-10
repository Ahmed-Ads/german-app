#!/usr/bin/env node
/**
 * tools/apply_words_batch5.js
 * ----------------------------
 * Deterministic and idempotent tool to append two new noun categories:
 * - 'gesundheit' (46 words)
 * - 'einkaufen' (42 words)
 * from tools/words_batch5.json to CATEGORIES in index.html.
 *
 * Rules:
 * - Reads tools/words_batch5.json (88 words across 2 categories).
 * - Checks base canonical vocab hash (d34a3d166c27434a988f0125edfb041a575c72cda806df04322d28bec9b9a945).
 * - Idempotent: detects if already applied and exits cleanly without modifying.
 * - Aborts without writing on any mismatch (schema, counts, id collision, base hash).
 * - Supports dry-run mode (--dry-run).
 * - Appends new categories at the end of CATEGORIES (after 'verben'), in JSON order.
 * - Preserves existing 31 categories (including 263 verbs) and VERB_FORMS byte-identical.
 * - Verifies inline script syntax before writing.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const EXPECTED_BASE_HASH = 'd34a3d166c27434a988f0125edfb041a575c72cda806df04322d28bec9b9a945';
const EXPECTED_NEW_HASH = '3997584f3d925b1ee88db7e9096c08d88bcd9630a43401902f9d1379cf7da5ae';
const EXPECTED_VERB_FORMS_CHECKSUM = 'c2d747185f9f66d27921f0320124098d2ad0ab65a308e3c15d7a3c295e0cfe72';

const EXPECTED_CATEGORIES = [
  { id: 'gesundheit', wordCount: 46 },
  { id: 'einkaufen', wordCount: 42 }
];
const EXPECTED_WORD_COUNT = 88;

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

function extractCategoriesAndVerbForms(htmlContent) {
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
  vm.runInContext(mainScript, sandbox);

  return {
    categories: sandbox.window.CATEGORIES,
    verbForms: sandbox.window.VERB_FORMS
  };
}

function validateBatch5(batchData, retiredPath) {
  if (!batchData || typeof batchData !== 'object') {
    throw new Error('Batch 5 data is invalid');
  }
  if (batchData.version !== 1) {
    throw new Error(`Expected batch 5 version 1, found ${batchData.version}`);
  }
  if (!Array.isArray(batchData.categories) || batchData.categories.length !== EXPECTED_CATEGORIES.length) {
    throw new Error(`Expected exactly ${EXPECTED_CATEGORIES.length} categories in batch 5, found ${batchData.categories ? batchData.categories.length : 0}`);
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
    if (cat.hasArticles !== true) throw new Error(`Category '${cat.id}' must have hasArticles === true`);

    if (!Array.isArray(cat.words) || cat.words.length !== expectedCat.wordCount) {
      throw new Error(`Category '${cat.id}' expected ${expectedCat.wordCount} words, found ${cat.words ? cat.words.length : 0}`);
    }
    totalWordCount += cat.words.length;

    cat.words.forEach((w, wIdx) => {
      if (!w.id || typeof w.id !== 'string') {
        throw new Error(`Word at index ${wIdx} in '${cat.id}' is missing valid 'id'`);
      }
      if (!w.id.startsWith(cat.id + '.')) {
        throw new Error(`Word '${w.id}' does not start with category prefix '${cat.id}.'`);
      }
      if (seenWordIds.has(w.id)) {
        throw new Error(`Duplicate word id in batch 5: '${w.id}'`);
      }
      seenWordIds.add(w.id);

      if (retiredIds.has(w.id)) {
        throw new Error(`Batch 5 word '${w.id}' collides with retired id in vocab_ids_retired.json`);
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
    throw new Error(`Expected total ${EXPECTED_WORD_COUNT} words in batch 5, found ${totalWordCount}`);
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

function applyWordsBatch5(htmlPath, jsonPath, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const expectedBaseHash = options.expectedBaseHash || EXPECTED_BASE_HASH;

  if (!fs.existsSync(htmlPath)) {
    throw new Error(`Target HTML file not found: ${htmlPath}`);
  }
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Words JSON file not found: ${jsonPath}`);
  }

  const rootDir = path.dirname(path.resolve(htmlPath));
  const retiredPath = path.join(rootDir, 'vocab_ids_retired.json');

  const rawJson = fs.readFileSync(jsonPath, 'utf8');
  const batchData = JSON.parse(rawJson);
  validateBatch5(batchData, retiredPath);

  const html = fs.readFileSync(htmlPath, 'utf8');

  // Extract current runtime state
  const { categories, verbForms } = extractCategoriesAndVerbForms(html);

  const existingCatIds = new Set(categories.map(c => c.id));
  const existingWordIds = new Set();
  categories.forEach(c => {
    if (Array.isArray(c.words)) {
      c.words.forEach(w => { if (w && w.id) existingWordIds.add(w.id); });
    }
  });

  const batchCatIds = batchData.categories.map(c => c.id);
  const presentCatIds = batchCatIds.filter(id => existingCatIds.has(id));

  const allBatchWordIds = [];
  batchData.categories.forEach(c => c.words.forEach(w => allBatchWordIds.push(w.id)));
  const presentWordIds = allBatchWordIds.filter(id => existingWordIds.has(id));

  // Idempotency check: if both categories and all 88 words already present
  if (presentCatIds.length === EXPECTED_CATEGORIES.length && presentWordIds.length === EXPECTED_WORD_COUNT) {
    const currentHash = computeCanonicalHash(categories);
    const vfCanonical = JSON.stringify(verbForms);
    const vfChecksum = crypto.createHash('sha256').update(vfCanonical).digest('hex');
    return {
      applied: false,
      alreadyApplied: true,
      categoryCount: EXPECTED_CATEGORIES.length,
      wordCount: EXPECTED_WORD_COUNT,
      baseHash: expectedBaseHash,
      newHash: currentHash,
      verbFormsChecksum: vfChecksum
    };
  }

  // Partial presence or ID collision check
  if (presentCatIds.length > 0 || presentWordIds.length > 0) {
    const collCat = presentCatIds[0] || 'none';
    const collWord = presentWordIds[0] || 'none';
    throw new Error(`ID collision or partial batch 5 application: category '${collCat}' or word '${collWord}' already exists in vocabulary (${presentCatIds.length}/${EXPECTED_CATEGORIES.length} cats, ${presentWordIds.length}/${EXPECTED_WORD_COUNT} words present). Aborting.`);
  }

  // Base hash check
  const currentBaseHash = computeCanonicalHash(categories);
  if (currentBaseHash !== expectedBaseHash) {
    throw new Error(`Base vocabulary hash mismatch: expected ${expectedBaseHash}, but current HTML has ${currentBaseHash}. Aborting without changes.`);
  }

  // Ensure current category count is 31 and words count is 1215
  if (categories.length !== 31) {
    throw new Error(`Expected exactly 31 categories before applying batch 5, found ${categories.length}. Aborting.`);
  }
  const currentWordCount = categories.reduce((s, c) => s + c.words.length, 0);
  if (currentWordCount !== 1215) {
    throw new Error(`Expected exactly 1215 words before applying batch 5, found ${currentWordCount}. Aborting.`);
  }

  // Ensure 'verben' is category index 30
  if (categories[30].id !== 'verben' || categories[30].words.length !== 263) {
    throw new Error(`Expected category 30 to be 'verben' with 263 verbs, found ${categories[30].id} with ${categories[30].words.length} words. Aborting.`);
  }

  // Format new categories lines
  const serializedCategories = batchData.categories.map((c, idx) =>
    serializeCategory(c, idx === batchData.categories.length - 1)
  ).join('\n');

  // Locate the closing of 'verben' category and the end of CATEGORIES array
  const verbenEndRegex = /(\n\s*\{\s*id\s*:\s*['"]verben['"][\s\S]*?\n\s*\]\s*\})(\s*\n\s*\]\s*;)/;
  const match = html.match(verbenEndRegex);
  if (!match) {
    throw new Error("Could not locate the closing of 'verben' category at the end of CATEGORIES");
  }

  const updatedCategoriesSection = `${match[1]},\n${serializedCategories}\n];`;
  const transformedHtml = html.replace(verbenEndRegex, updatedCategoriesSection);

  // Verify inline scripts syntax
  const scriptMatches = [...transformedHtml.matchAll(/<script(?![^>]*src=)(?:[^>]*)>([\s\S]*?)<\/script>/gi)];
  scriptMatches.forEach((sm, i) => {
    new vm.Script(sm[1], { filename: `transformed-inline-script-${i}.js` });
  });

  // Verify updated categories and compute new hash
  const updatedState = extractCategoriesAndVerbForms(transformedHtml);
  if (updatedState.categories.length !== 33) {
    throw new Error(`Verification failed: categories count is ${updatedState.categories.length}, expected 33`);
  }
  const updatedWordCount = updatedState.categories.reduce((s, c) => s + c.words.length, 0);
  if (updatedWordCount !== 1303) {
    throw new Error(`Verification failed: total words count is ${updatedWordCount}, expected 1303`);
  }
  if (updatedState.categories[31].id !== 'gesundheit' || updatedState.categories[31].words.length !== 46) {
    throw new Error(`Verification failed: gesundheit category invalid`);
  }
  if (updatedState.categories[32].id !== 'einkaufen' || updatedState.categories[32].words.length !== 42) {
    throw new Error(`Verification failed: einkaufen category invalid`);
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
    fs.writeFileSync(htmlPath, transformedHtml, 'utf8');
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
  const defaultJson = path.join(__dirname, 'words_batch5.json');

  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const nonFlagArgs = args.filter(a => !a.startsWith('--'));

  const targetHtml = nonFlagArgs[0] ? path.resolve(nonFlagArgs[0]) : defaultHtml;
  const targetJson = nonFlagArgs[1] ? path.resolve(nonFlagArgs[1]) : defaultJson;

  try {
    const res = applyWordsBatch5(targetHtml, targetJson, { dryRun: isDryRun });
    if (res.alreadyApplied) {
      console.log(`[ALREADY APPLIED] Batch 5 (${res.categoryCount} categories, ${res.wordCount} words) is already present in ${targetHtml}`);
      console.log(`  Canonical vocab hash : ${res.newHash}`);
      console.log(`  VERB_FORMS checksum  : ${res.verbFormsChecksum}`);
    } else if (res.dryRun) {
      console.log(`[DRY-RUN OK] Batch 5 (${res.categoryCount} categories, ${res.wordCount} words) can be cleanly applied to ${targetHtml}`);
      console.log(`  Base canonical hash  : ${res.baseHash}`);
      console.log(`  New canonical hash   : ${res.newHash}`);
      console.log(`  VERB_FORMS checksum  : ${res.verbFormsChecksum}`);
      console.log(`  (No files were modified)`);
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
  applyWordsBatch5,
  EXPECTED_BASE_HASH,
  EXPECTED_NEW_HASH,
  EXPECTED_VERB_FORMS_CHECKSUM,
  EXPECTED_CATEGORIES,
  EXPECTED_WORD_COUNT,
  computeCanonicalHash
};

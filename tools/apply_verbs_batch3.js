#!/usr/bin/env node
/**
 * tools/apply_verbs_batch3.js
 * ----------------------------
 * Deterministic and idempotent tool to append the B1 verbs batch (94 verbs)
 * to the 'verben' category and the VERB_FORMS conjugation constant in index.html.
 *
 * Rules:
 * - Reads tools/verbs_batch3.json (94 B1 verbs).
 * - Checks base canonical vocab hash (8144a1fa30ab76d3b88f5931d008d80f05d981cd4f18a9dca303c2bee605c8d5).
 * - Idempotent: detects if already applied and exits cleanly without modifying.
 * - Aborts without writing on any mismatch (schema, counts, id collision, base hash).
 * - Supports dry-run mode (--dry-run).
 * - Appends words to 'verben' category, preserving the first 169 verbs byte-identical.
 * - Appends entries to VERB_FORMS, preserving the first 169 entries byte-identical.
 * - Verifies inline script syntax before writing.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const EXPECTED_BASE_HASH = '8144a1fa30ab76d3b88f5931d008d80f05d981cd4f18a9dca303c2bee605c8d5';
const EXPECTED_VERB_COUNT = 94;

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

function validateBatch3(verbs, retiredPath) {
  if (!Array.isArray(verbs) || verbs.length !== EXPECTED_VERB_COUNT) {
    throw new Error(`Expected exactly ${EXPECTED_VERB_COUNT} verbs in batch 3, found ${verbs ? verbs.length : 0}`);
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

  const ids = new Set();
  verbs.forEach((v, idx) => {
    if (!v.id || typeof v.id !== 'string') {
      throw new Error(`Verb at index ${idx} is missing a valid 'id'`);
    }
    if (!v.id.startsWith('verben.')) {
      throw new Error(`Verb at index ${idx} ('${v.id}') must start with 'verben.'`);
    }
    if (ids.has(v.id)) {
      throw new Error(`Duplicate id in batch 3: '${v.id}'`);
    }
    ids.add(v.id);

    if (retiredIds.has(v.id)) {
      throw new Error(`Batch 3 verb '${v.id}' collides with retired id in vocab_ids_retired.json`);
    }

    if (v.level !== 'B1') {
      throw new Error(`Verb '${v.id}' has level '${v.level}', expected 'B1'`);
    }
    if (typeof v.n !== 'string' || !v.n.trim()) throw new Error(`Verb '${v.id}' missing valid 'n'`);
    if (typeof v.ar !== 'string' || !v.ar.trim()) throw new Error(`Verb '${v.id}' missing valid 'ar'`);
    if (typeof v.s !== 'string' || !v.s.trim()) throw new Error(`Verb '${v.id}' missing valid 's'`);
    if (typeof v.sar !== 'string' || !v.sar.trim()) throw new Error(`Verb '${v.id}' missing valid 'sar'`);
    if (v.aux !== 'haben' && v.aux !== 'sein') throw new Error(`Verb '${v.id}' invalid aux '${v.aux}'`);
    if (!Array.isArray(v.pres) || v.pres.length !== 6) throw new Error(`Verb '${v.id}' pres must be 6 forms`);
    if (!Array.isArray(v.pret) || v.pret.length !== 6) throw new Error(`Verb '${v.id}' pret must be 6 forms`);
    if (typeof v.pp !== 'string' || !v.pp.trim()) throw new Error(`Verb '${v.id}' missing valid 'pp'`);
    if (typeof v.perfekt !== 'string' || !v.perfekt.trim()) throw new Error(`Verb '${v.id}' missing valid 'perfekt'`);
  });
}

function applyVerbsBatch3(htmlPath, jsonPath, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const expectedBaseHash = options.expectedBaseHash || EXPECTED_BASE_HASH;

  if (!fs.existsSync(htmlPath)) {
    throw new Error(`Target HTML file not found: ${htmlPath}`);
  }
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Verbs JSON file not found: ${jsonPath}`);
  }

  const rootDir = path.dirname(path.resolve(htmlPath));
  const retiredPath = path.join(rootDir, 'vocab_ids_retired.json');

  const rawJson = fs.readFileSync(jsonPath, 'utf8');
  const verbs = JSON.parse(rawJson);
  validateBatch3(verbs, retiredPath);

  let html = fs.readFileSync(htmlPath, 'utf8');

  // Extract current runtime state
  const { categories, verbForms } = extractCategoriesAndVerbForms(html);

  const verbenCat = categories.find(c => c.id === 'verben');
  if (!verbenCat) {
    throw new Error("Category 'verben' not found in HTML");
  }

  const existingWordIds = new Set();
  categories.forEach(c => {
    if (Array.isArray(c.words)) {
      c.words.forEach(w => { if (w && w.id) existingWordIds.add(w.id); });
    }
  });

  const batch3Ids = verbs.map(v => v.id);
  const alreadyPresent = batch3Ids.filter(id => existingWordIds.has(id));

  // Idempotency check: if all 94 already present in verben and verbForms
  if (alreadyPresent.length === EXPECTED_VERB_COUNT) {
    const allInVf = batch3Ids.every(id => verbForms && verbForms[id]);
    if (allInVf) {
      const currentHash = computeCanonicalHash(categories);
      const vfCanonical = JSON.stringify(verbForms);
      const vfChecksum = crypto.createHash('sha256').update(vfCanonical).digest('hex');
      return {
        applied: false,
        alreadyApplied: true,
        wordCount: EXPECTED_VERB_COUNT,
        baseHash: currentHash,
        newHash: currentHash,
        verbFormsChecksum: vfChecksum
      };
    }
  }

  // Partial presence or ID collision check
  if (alreadyPresent.length > 0 && alreadyPresent.length < EXPECTED_VERB_COUNT) {
    throw new Error(`ID collision or partial batch 3 application: '${alreadyPresent[0]}' already exists in vocabulary (${alreadyPresent.length}/${EXPECTED_VERB_COUNT} present). Aborting.`);
  }

  // Base hash check
  const currentBaseHash = computeCanonicalHash(categories);
  if (currentBaseHash !== expectedBaseHash) {
    throw new Error(`Base vocabulary hash mismatch: expected ${expectedBaseHash}, but current HTML has ${currentBaseHash}. Aborting without changes.`);
  }

  // Ensure verben category has 169 verbs before applying
  if (verbenCat.words.length !== 169) {
    throw new Error(`Expected 'verben' category to have exactly 169 verbs, found ${verbenCat.words.length}. Aborting.`);
  }

  // Verify none of batch 3 IDs collide with ANY existing word ID
  for (const v of verbs) {
    if (existingWordIds.has(v.id)) {
      throw new Error(`ID collision: '${v.id}' already exists in vocabulary.`);
    }
  }

  // 1. Build new words lines for CATEGORIES
  const newWords = verbs.map(v => {
    const w = {
      id: v.id,
      n: v.n,
      ar: v.ar,
      s: v.s,
      sar: v.sar
    };
    if (v.note && typeof v.note === 'string' && v.note.trim()) {
      w.note = v.note.trim();
    }
    return w;
  });

  const wordsLines = newWords.map(w => {
    let line = `    {id:${JSON.stringify(w.id)},n:${JSON.stringify(w.n)},ar:${JSON.stringify(w.ar)}`;
    if (w.note) {
      line += `,note:${JSON.stringify(w.note)}`;
    }
    line += `,s:${JSON.stringify(w.s)},sar:${JSON.stringify(w.sar)}}`;
    return line;
  }).join(',\n');

  // Locate the last word of batch 2 (verben.zurueckkommen) and the closing of the verben category
  const lastVerbRegex = /(\{\s*id\s*:\s*['"]verben\.zurueckkommen['"][\s\S]*?\})(\s*\n\s*\]\s*\})/m;
  const lastVerbMatch = html.match(lastVerbRegex);
  if (!lastVerbMatch) {
    throw new Error("Could not locate the closing of 'verben' category after 'verben.zurueckkommen'");
  }

  const updatedVerbenCategory = `${lastVerbMatch[1]},\n${wordsLines}${lastVerbMatch[2]}`;
  let transformedHtml = html.replace(lastVerbRegex, updatedVerbenCategory);

  // 2. Build updated VERB_FORMS
  const vfRegex = /(const\s+VERB_FORMS\s*=\s*)(\{[\s\S]*?\n\});/;
  const vfMatch = transformedHtml.match(vfRegex);
  if (!vfMatch) {
    throw new Error('Could not locate const VERB_FORMS in HTML');
  }

  const currentVf = JSON.parse(vfMatch[2]);
  const updatedVf = { ...currentVf };
  verbs.forEach(v => {
    updatedVf[v.id] = {
      level: v.level || 'B1',
      sep: v.sep !== undefined ? v.sep : null,
      aux: v.aux,
      pres: v.pres,
      pret: v.pret,
      pp: v.pp,
      perfekt: v.perfekt,
      pretDuAlt: v.pret_du_alt || null
    };
  });

  const newVfJson = JSON.stringify(updatedVf, null, 2);
  transformedHtml = transformedHtml.replace(vfRegex, `${vfMatch[1]}${newVfJson};`);

  // Verify inline scripts syntax
  const scriptMatches = [...transformedHtml.matchAll(/<script(?![^>]*src=)(?:[^>]*)>([\s\S]*?)<\/script>/gi)];
  scriptMatches.forEach((sm, i) => {
    new vm.Script(sm[1], { filename: `transformed-inline-script-${i}.js` });
  });

  // Verify updated categories and compute new hash
  const updatedState = extractCategoriesAndVerbForms(transformedHtml);
  const updatedCat = updatedState.categories.find(c => c.id === 'verben');
  if (!updatedCat || updatedCat.words.length !== 263) {
    throw new Error(`Verification failed: verben category length is ${updatedCat ? updatedCat.words.length : 0}, expected 263`);
  }
  if (Object.keys(updatedState.verbForms).length !== 263) {
    throw new Error(`Verification failed: VERB_FORMS keys count is ${Object.keys(updatedState.verbForms).length}, expected 263`);
  }

  const newHash = computeCanonicalHash(updatedState.categories);
  const newVfCanonical = JSON.stringify(updatedState.verbForms);
  const newVfChecksum = crypto.createHash('sha256').update(newVfCanonical).digest('hex');

  if (!dryRun) {
    fs.writeFileSync(htmlPath, transformedHtml, 'utf8');
  }

  return {
    applied: !dryRun,
    dryRun,
    alreadyApplied: false,
    wordCount: EXPECTED_VERB_COUNT,
    baseHash: currentBaseHash,
    newHash,
    verbFormsChecksum: newVfChecksum
  };
}

if (require.main === module) {
  const rootDir = path.resolve(__dirname, '..');
  const defaultHtml = path.join(rootDir, 'index.html');
  const defaultJson = path.join(__dirname, 'verbs_batch3.json');

  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const nonFlagArgs = args.filter(a => !a.startsWith('--'));

  const targetHtml = nonFlagArgs[0] ? path.resolve(nonFlagArgs[0]) : defaultHtml;
  const targetJson = nonFlagArgs[1] ? path.resolve(nonFlagArgs[1]) : defaultJson;

  try {
    const res = applyVerbsBatch3(targetHtml, targetJson, { dryRun: isDryRun });
    if (res.alreadyApplied) {
      console.log(`[ALREADY APPLIED] Batch 3 (${res.wordCount} verbs) is already present in ${targetHtml}`);
      console.log(`  Canonical vocab hash : ${res.newHash}`);
      console.log(`  VERB_FORMS checksum  : ${res.verbFormsChecksum}`);
    } else if (res.dryRun) {
      console.log(`[DRY-RUN OK] Batch 3 (${res.wordCount} verbs) can be cleanly applied to ${targetHtml}`);
      console.log(`  Base canonical hash  : ${res.baseHash}`);
      console.log(`  New canonical hash   : ${res.newHash}`);
      console.log(`  VERB_FORMS checksum  : ${res.verbFormsChecksum}`);
      console.log(`  (No files were modified)`);
    } else {
      console.log(`[APPLIED OK] Successfully appended ${res.wordCount} verbs to 'verben' and VERB_FORMS in ${targetHtml}`);
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
  applyVerbsBatch3,
  EXPECTED_BASE_HASH,
  EXPECTED_VERB_COUNT,
  computeCanonicalHash
};

#!/usr/bin/env node
/**
 * scripts/apply_vocab_changes.js
 * ---------------------------------
 * Applies owner-approved vocabulary review described by a changes JSON file
 * (default docs/vocab_changes_batch1.json, or custom e.g. tools/vocab_changes_sentences_batch1.json)
 * to the CATEGORIES data in index.html.
 *
 * Rules:
 * 1. Structured, exact edit (never a blind global replace).
 * 2. For every edit, checks expect_current equals the word's current value and refuses
 *    to write anything (exits non-zero, lists all mismatches) if any check fails or any id is unknown.
 * 3. Idempotent: a second run reports "already applied" and changes nothing (exit code 0).
 * 4. Refuses to touch category 'section-names' (or any in keep_untouched_categories).
 * 5. Verifies base_vocab_sha256 against canonical hash of current data before modifying.
 * 6. Writes removals (delete the word object), edits (field -> new) and nothing else.
 * 7. Supports fields: a, ar, note, s, sar.
 * 8. Supports --dry-run to simulate and verify without writing.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_HTML_PATH = path.join(ROOT_DIR, 'index.html');
const DEFAULT_CHANGES_PATH = path.join(ROOT_DIR, 'docs', 'vocab_changes_batch1.json');

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractCategoriesFromHtml(html) {
  const declPattern = /const\s+CATEGORIES\s*=\s*\[/;
  const match = declPattern.exec(html);
  if (!match) throw new Error("Could not find 'const CATEGORIES = [' in HTML");

  const arrayStartIndex = match.index + match[0].length - 1;
  let depth = 0;
  let inString = null;
  let inLineComment = false;
  let inBlockComment = false;
  let arrayEndIndex = -1;

  for (let i = arrayStartIndex; i < html.length; i++) {
    const ch = html[i];
    const next = html[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        i++;
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }
    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch;
      continue;
    }
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        arrayEndIndex = i;
        break;
      }
    }
  }

  if (arrayEndIndex === -1) throw new Error("Could not find matching closing bracket for CATEGORIES array");
  const arrayJs = html.slice(arrayStartIndex, arrayEndIndex + 1);
  return vm.runInNewContext('(' + arrayJs + ')');
}

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

function checkInlineScriptsSyntax(html) {
  const matches = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  matches.forEach((m) => {
    new vm.Script(m[1]);
  });
}

function applyVocabChanges({ htmlPath = DEFAULT_HTML_PATH, changesPath = DEFAULT_CHANGES_PATH, dryRun = false } = {}) {
  if (!fs.existsSync(changesPath)) {
    throw new Error(`Changes file not found: ${changesPath}`);
  }
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`HTML file not found: ${htmlPath}`);
  }

  const changes = JSON.parse(fs.readFileSync(changesPath, 'utf8'));
  const keepCategories = new Set(changes.keep_untouched_categories || ['section-names']);
  const rawHtml = fs.readFileSync(htmlPath, 'utf8').replace(/\r\n/g, '\n');

  // Extract current categories
  const currentCategories = extractCategoriesFromHtml(rawHtml);
  const currentWordsMap = new Map();
  for (const cat of currentCategories) {
    for (const w of cat.words) {
      currentWordsMap.set(w.id, { catId: cat.id, word: w });
    }
  }

  const removeList = changes.remove || [];
  const editList = changes.edit || [];

  // Check untouchable categories
  for (const r of removeList) {
    const cat = r.id.split('.')[0];
    if (keepCategories.has(cat)) {
      throw new Error(`Removal targets forbidden category '${cat}': ${r.id}`);
    }
  }
  for (const e of editList) {
    const cat = e.id.split('.')[0];
    if (keepCategories.has(cat)) {
      throw new Error(`Edit targets forbidden category '${cat}': ${e.id}`);
    }
  }

  // 1. Idempotence Check: Has this batch already been applied?
  let allRemovesAbsent = true;
  for (const r of removeList) {
    if (currentWordsMap.has(r.id)) {
      allRemovesAbsent = false;
      break;
    }
  }

  let allEditsPresent = true;
  for (const e of editList) {
    const entry = currentWordsMap.get(e.id);
    if (!entry) {
      allEditsPresent = false;
      break;
    }
    const currentVal = entry.word[e.field] !== undefined ? entry.word[e.field] : '';
    if (currentVal !== e.new) {
      allEditsPresent = false;
      break;
    }
  }

  const hasModifications = removeList.length > 0 || editList.length > 0;
  if (hasModifications && allRemovesAbsent && allEditsPresent) {
    return {
      alreadyApplied: true,
      message: `Notice: Vocabulary changes batch (${path.basename(changesPath)}) is already applied. Nothing changed.`
    };
  }

  // 2. Base Canonical Hash Verification (before applying unapplied batch)
  if (changes.base_vocab_sha256) {
    const currentCanonicalHash = computeCanonicalHash(currentCategories);
    if (currentCanonicalHash !== changes.base_vocab_sha256) {
      throw new Error(
        `base_vocab_sha256 mismatch!\n` +
        `    Expected base: ${changes.base_vocab_sha256}\n` +
        `    Current base : ${currentCanonicalHash}`
      );
    }
  }

  // 3. Strict Pre-Application Validation
  const errors = [];

  // Check all removals exist
  for (const r of removeList) {
    if (!currentWordsMap.has(r.id)) {
      errors.push(`Unknown removal word id: '${r.id}' (expected in current vocabulary)`);
    }
  }

  // Check all edits exist and expect_current matches
  for (const e of editList) {
    const entry = currentWordsMap.get(e.id);
    if (!entry) {
      errors.push(`Unknown edit word id: '${e.id}'`);
      continue;
    }
    const currentVal = entry.word[e.field] !== undefined ? entry.word[e.field] : '';
    if (currentVal !== e.expect_current) {
      errors.push(
        `Edit mismatch for word '${e.id}' field '${e.field}':\n` +
        `    Expected: ${JSON.stringify(e.expect_current)}\n` +
        `    Actual  : ${JSON.stringify(currentVal)}`
      );
    }
  }

  if (errors.length > 0) {
    const msg = `CRITICAL VALIDATION FAILURE: ${errors.length} error(s) found! Refusing to modify ${path.basename(htmlPath)}.\n` +
      errors.map(err => "  - " + err).join('\n');
    const err = new Error(msg);
    err.validationErrors = errors;
    throw err;
  }

  // 4. Structured Line-Level Transformation
  const removeSet = new Set(removeList.map(r => r.id));
  const editMap = new Map();
  for (const e of editList) {
    if (!editMap.has(e.id)) editMap.set(e.id, []);
    editMap.get(e.id).push(e);
  }

  const lines = rawHtml.split('\n');
  const newLines = [];
  let inCategories = false;
  let catWordIndices = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inCategories) {
      if (line.includes('const CATEGORIES = [')) {
        inCategories = true;
      }
      newLines.push(line);
      continue;
    }

    if (line.trim() === '];') {
      inCategories = false;
      newLines.push(line);
      continue;
    }

    const catMatch = line.match(/\{\s*id:['"]([^'"]+)['"]/);
    if (catMatch && line.includes('words:[')) {
      catWordIndices = [];
      newLines.push(line);
      continue;
    }

    if (line.trim().startsWith(']}')) {
      // Format category words properly (all words comma-separated, last word without trailing comma)
      if (catWordIndices.length > 0) {
        for (let w = 0; w < catWordIndices.length - 1; w++) {
          let wl = newLines[catWordIndices[w]];
          if (!wl.trim().endsWith(',')) {
            newLines[catWordIndices[w]] = wl.replace(/\}[ \t]*$/, '},');
          }
        }
        let lastWl = newLines[catWordIndices[catWordIndices.length - 1]];
        if (lastWl.trim().endsWith(',')) {
          newLines[catWordIndices[catWordIndices.length - 1]] = lastWl.replace(/\},[ \t]*$/, '}');
        }
      }
      catWordIndices = [];
      newLines.push(line);
      continue;
    }

    const wordMatch = line.match(/^(\s*)\{id:['"]([^'"]+)['"],(.*)$/);
    if (wordMatch) {
      const wid = wordMatch[2];

      // Removal check
      if (removeSet.has(wid)) {
        continue; // Drop the line
      }

      let modifiedLine = line;

      // Edit check
      if (editMap.has(wid)) {
        const edits = editMap.get(wid);
        for (const ed of edits) {
          if (ed.field === 'a') {
            const aRegex = new RegExp(`(a:\\s*['"])${escapeRegExp(ed.expect_current)}(['"])`);
            modifiedLine = modifiedLine.replace(aRegex, `$1${ed.new}$2`);
          } else if (ed.field === 'ar') {
            const arRegex = new RegExp(`(ar:\\s*['"])${escapeRegExp(ed.expect_current)}(['"])`);
            modifiedLine = modifiedLine.replace(arRegex, `$1${ed.new}$2`);
          } else if (ed.field === 's') {
            const sRegex = new RegExp(`(s:\\s*['"])${escapeRegExp(ed.expect_current)}(['"])`);
            modifiedLine = modifiedLine.replace(sRegex, `$1${ed.new}$2`);
          } else if (ed.field === 'sar') {
            const sarRegex = new RegExp(`(sar:\\s*['"])${escapeRegExp(ed.expect_current)}(['"])`);
            modifiedLine = modifiedLine.replace(sarRegex, `$1${ed.new}$2`);
          } else if (ed.field === 'note') {
            if (ed.expect_current === '') {
              // Insert note after ar
              const arCapture = /(ar:\s*['"][^'"]*['"])/;
              if (arCapture.test(modifiedLine)) {
                modifiedLine = modifiedLine.replace(arCapture, `$1,note:'${ed.new}'`);
              } else {
                // Fallback after n
                const nCapture = /(n:\s*['"][^'"]*['"])/;
                modifiedLine = modifiedLine.replace(nCapture, `$1,note:'${ed.new}'`);
              }
            } else {
              const noteRegex = new RegExp(`(note:\\s*['"])${escapeRegExp(ed.expect_current)}(['"])`);
              modifiedLine = modifiedLine.replace(noteRegex, `$1${ed.new}$2`);
            }
          } else {
            throw new Error(`Unsupported edit field '${ed.field}' for word '${wid}'`);
          }
        }
      }

      const newIdx = newLines.length;
      newLines.push(modifiedLine);
      catWordIndices.push(newIdx);
      continue;
    }

    newLines.push(line);
  }

  const transformedHtml = newLines.join('\n');

  // 5. Post-Transformation Integrity Verification
  checkInlineScriptsSyntax(transformedHtml);

  const updatedCategories = extractCategoriesFromHtml(transformedHtml);
  const expectedCategoryCount = currentCategories.length;
  if (updatedCategories.length !== expectedCategoryCount) {
    throw new Error(`Post-check failed: category count is ${updatedCategories.length}, expected ${expectedCategoryCount}`);
  }

  const updatedWordsMap = new Map();
  let totalRemainingWords = 0;
  for (const cat of updatedCategories) {
    totalRemainingWords += cat.words.length;
    for (const w of cat.words) {
      updatedWordsMap.set(w.id, { catId: cat.id, word: w });
    }
  }

  const expectedWords = currentWordsMap.size - removeSet.size;
  if (totalRemainingWords !== expectedWords) {
    throw new Error(`Post-check failed: total words is ${totalRemainingWords}, expected ${expectedWords}`);
  }

  // Verify all removed words are absent
  for (const r of removeList) {
    if (updatedWordsMap.has(r.id)) {
      throw new Error(`Post-check failed: removed word '${r.id}' is still present!`);
    }
  }

  // Verify all edits were applied
  for (const e of editList) {
    const w = updatedWordsMap.get(e.id);
    if (!w) {
      throw new Error(`Post-check failed: edited word '${e.id}' is missing!`);
    }
    if (w.word[e.field] !== e.new) {
      throw new Error(`Post-check failed: edit '${e.id}.${e.field}' value mismatch: expected '${e.new}', got '${w.word[e.field]}'`);
    }
  }

  // Verify keep_untouched_categories are identical
  for (const catId of keepCategories) {
    const origCat = currentCategories.find(c => c.id === catId);
    const newCat = updatedCategories.find(c => c.id === catId);
    if (origCat && newCat) {
      if (JSON.stringify(origCat) !== JSON.stringify(newCat)) {
        throw new Error(`Post-check failed: category '${catId}' was touched!`);
      }
    }
  }

  // Verify remaining word order in all categories
  for (const origCat of currentCategories) {
    const newCat = updatedCategories.find(c => c.id === origCat.id);
    if (!newCat) continue;
    const expectedIds = origCat.words.map(w => w.id).filter(id => !removeSet.has(id));
    const actualIds = newCat.words.map(w => w.id);
    if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) {
      throw new Error(`Post-check failed: word order mismatch in category '${origCat.id}'`);
    }
  }

  if (dryRun) {
    // Do not write to disk
  } else {
    fs.writeFileSync(htmlPath, transformedHtml, 'utf8');
  }

  return {
    alreadyApplied: false,
    dryRun,
    transformedHtml,
    updatedCategories,
    totalRemainingWords,
    appliedRemovalsCount: removeList.length,
    appliedEditsCount: editList.length
  };
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fileArgs = args.filter(a => a !== '--dry-run' && !a.startsWith('-'));
  const changesFile = fileArgs[0] || DEFAULT_CHANGES_PATH;
  const changesPath = path.resolve(process.cwd(), changesFile);

  try {
    const res = applyVocabChanges({
      htmlPath: DEFAULT_HTML_PATH,
      changesPath,
      dryRun
    });

    if (res.alreadyApplied) {
      console.log(res.message);
      process.exit(0);
    }

    console.log(`✅ All post-transformation checks PASSED (${res.updatedCategories.length} categories, ${res.totalRemainingWords} words, exact removals and edits).`);
    if (res.dryRun) {
      console.log("Dry run: no changes written to disk.");
    } else {
      console.log(`Successfully updated ${DEFAULT_HTML_PATH}`);
    }
    process.exit(0);
  } catch (err) {
    console.error("=" .repeat(70));
    console.error(err.message);
    console.error("=" .repeat(70));
    process.exit(1);
  }
}

module.exports = {
  extractCategoriesFromHtml,
  canonicalJson,
  computeCanonicalHash,
  checkInlineScriptsSyntax,
  applyVocabChanges
};

if (require.main === module) {
  main();
}

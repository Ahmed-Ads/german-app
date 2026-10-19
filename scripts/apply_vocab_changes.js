#!/usr/bin/env node
/**
 * scripts/apply_vocab_changes.js
 * ---------------------------------
 * Applies owner-approved vocabulary review described by docs/vocab_changes_batch1.json
 * to the CATEGORIES data in index.html.
 *
 * Rules:
 * 1. Structured, exact edit (never a blind global replace).
 * 2. For every edit, checks expect_current equals the word's current value and refuses
 *    to write anything (exits non-zero, lists all mismatches) if any check fails or any id is unknown.
 * 3. Idempotent: a second run reports "already applied" and changes nothing (exit code 0).
 * 4. Refuses to touch category 'section-names' (or any in keep_untouched_categories).
 * 5. Writes removals (delete the word object), edits (field -> new) and nothing else.
 * 6. Supports --dry-run to simulate and verify without writing.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT_DIR, 'index.html');
const CHANGES_PATH = path.join(ROOT_DIR, 'docs', 'vocab_changes_batch1.json');

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

function checkInlineScriptsSyntax(html) {
  const matches = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  matches.forEach((m, i) => {
    new vm.Script(m[1]);
  });
}

function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (!fs.existsSync(CHANGES_PATH)) {
    console.error(`CRITICAL: Changes file not found: ${CHANGES_PATH}`);
    process.exit(1);
  }

  const changes = JSON.parse(fs.readFileSync(CHANGES_PATH, 'utf8'));
  const keepCategories = new Set(changes.keep_untouched_categories || ['section-names']);
  const rawHtml = fs.readFileSync(HTML_PATH, 'utf8').replace(/\r\n/g, '\n');

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
      console.error(`CRITICAL ERROR: Removal targets forbidden category '${cat}': ${r.id}`);
      process.exit(1);
    }
  }
  for (const e of editList) {
    const cat = e.id.split('.')[0];
    if (keepCategories.has(cat)) {
      console.error(`CRITICAL ERROR: Edit targets forbidden category '${cat}': ${e.id}`);
      process.exit(1);
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

  if (allRemovesAbsent && allEditsPresent && currentWordsMap.size === 952) {
    console.log("Notice: Vocabulary changes batch 1 is already applied. Nothing changed.");
    process.exit(0);
  }

  // 2. Strict Pre-Application Validation
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
    console.error("=" .repeat(70));
    console.error(`CRITICAL VALIDATION FAILURE: ${errors.length} error(s) found! Refusing to modify index.html.`);
    console.error("=" .repeat(70));
    for (const err of errors) {
      console.error("  - " + err);
    }
    process.exit(1);
  }

  // 3. Structured Line-Level Transformation
  const removeSet = new Set(removeList.map(r => r.id));
  const editMap = new Map();
  for (const e of editList) {
    if (!editMap.has(e.id)) editMap.set(e.id, []);
    editMap.get(e.id).push(e);
  }

  const lines = rawHtml.split('\n');
  const newLines = [];
  let inCategories = false;
  let currentCatId = null;
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
      currentCatId = catMatch[1];
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
      currentCatId = null;
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

  // 4. Post-Transformation Integrity Verification
  console.log("Verifying transformed HTML...");
  checkInlineScriptsSyntax(transformedHtml);

  const updatedCategories = extractCategoriesFromHtml(transformedHtml);
  if (updatedCategories.length !== 30) {
    console.error(`Post-check failed: category count is ${updatedCategories.length}, expected 30`);
    process.exit(1);
  }

  const updatedWordsMap = new Map();
  let totalRemainingWords = 0;
  for (const cat of updatedCategories) {
    totalRemainingWords += cat.words.length;
    for (const w of cat.words) {
      updatedWordsMap.set(w.id, { catId: cat.id, word: w });
    }
  }

  if (totalRemainingWords !== 952) {
    console.error(`Post-check failed: total words is ${totalRemainingWords}, expected 952`);
    process.exit(1);
  }

  // Verify all 208 removed words are absent
  for (const r of removeList) {
    if (updatedWordsMap.has(r.id)) {
      console.error(`Post-check failed: removed word '${r.id}' is still present!`);
      process.exit(1);
    }
  }

  // Verify all 145 edits were applied
  for (const e of editList) {
    const w = updatedWordsMap.get(e.id);
    if (!w) {
      console.error(`Post-check failed: edited word '${e.id}' is missing!`);
      process.exit(1);
    }
    if (w.word[e.field] !== e.new) {
      console.error(`Post-check failed: edit '${e.id}.${e.field}' value mismatch: expected '${e.new}', got '${w.word[e.field]}'`);
      process.exit(1);
    }
  }

  // Verify section-names is identical
  const origSec = currentCategories.find(c => c.id === 'section-names');
  const newSec = updatedCategories.find(c => c.id === 'section-names');
  if (JSON.stringify(origSec) !== JSON.stringify(newSec)) {
    console.error("Post-check failed: category 'section-names' was touched!");
    process.exit(1);
  }

  // Verify remaining word order in all categories
  for (const origCat of currentCategories) {
    const newCat = updatedCategories.find(c => c.id === origCat.id);
    const expectedIds = origCat.words.map(w => w.id).filter(id => !removeSet.has(id));
    const actualIds = newCat.words.map(w => w.id);
    if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) {
      console.error(`Post-check failed: word order mismatch in category '${origCat.id}'`);
      process.exit(1);
    }
  }

  console.log("✅ All post-transformation checks PASSED (30 categories, 952 words, exact removals and edits).");

  if (dryRun) {
    console.log("Dry run: no changes written to disk.");
  } else {
    fs.writeFileSync(HTML_PATH, transformedHtml, 'utf8');
    console.log(`Successfully updated ${HTML_PATH}`);
  }
}

if (require.main === module) {
  main();
}

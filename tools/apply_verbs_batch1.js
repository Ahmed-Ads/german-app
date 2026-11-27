#!/usr/bin/env node
/**
 * tools/apply_verbs_batch1.js
 * ----------------------------
 * Deterministic and idempotent tool to insert the new 'verben' vocabulary category
 * and the VERB_FORMS conjugation constant into index.html.
 *
 * Rules:
 * - Reads tools/verbs_batch1.json (77 A1 verbs).
 * - Refuses to run if 'verben' or VERB_FORMS already exists in the target HTML file.
 * - Inserts { id:'verben', ar:'الأفعال', de:'Verben', hasArticles:false, words:[...] }
 *   at the end of CATEGORIES.
 * - Inserts VERB_FORMS constant immediately outside CATEGORIES.
 */

const fs = require('fs');
const path = require('path');

const { resolveCategoriesSource } = require('../scripts/vocab_source.js');

function applyVerbsBatch1(htmlPath, jsonPath, options = {}) {
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`Target HTML file not found: ${htmlPath}`);
  }
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Verbs JSON file not found: ${jsonPath}`);
  }

  const rawJson = fs.readFileSync(jsonPath, 'utf8');
  const verbs = JSON.parse(rawJson);

  if (!Array.isArray(verbs) || verbs.length !== 77) {
    throw new Error(`Expected exactly 77 verbs in ${jsonPath}, found ${verbs ? verbs.length : 0}`);
  }

  const { html, mode, sourceText, sourcePath } = resolveCategoriesSource(htmlPath, options.categoriesPath);

  // Check idempotency: refuse to run if already applied
  if (/id\s*:\s*['"]verben['"]/.test(sourceText) || /const\s+VERB_FORMS\s*=/.test(html)) {
    throw new Error(`Category 'verben' or VERB_FORMS already exists in ${htmlPath}. Refusing to run twice.`);
  }

  // 1. Build words array for CATEGORIES
  const words = verbs.map(v => {
    const w = {
      id: v.id,
      n: v.n,
      ar: v.ar,
      s: v.s,
      sar: v.sar
    };
    if (v.note && typeof v.note === 'string' && v.note.trim()) {
      const wordNote = v.note.trim();
      w.note = wordNote;
    }
    return w;
  });

  // 2. Build VERB_FORMS dictionary (keyed by word id)
  const verbForms = {};
  verbs.forEach(v => {
    verbForms[v.id] = {
      level: v.level || 'A1',
      sep: v.sep !== undefined ? v.sep : null,
      aux: v.aux,
      pres: v.pres,
      pret: v.pret,
      pp: v.pp,
      perfekt: v.perfekt,
      pretDuAlt: v.pret_du_alt || null
    };
  });

  // 3. Find end of CATEGORIES array
  // We locate the closing bracket of section-names and the CATEGORIES array
  const categoryEndRegex = /(\n\s*\{\s*id\s*:\s*['"]section-names['"][\s\S]*?\n\s*\]\s*\})(\n\s*\]\s*;)/;
  const match = sourceText.match(categoryEndRegex);
  if (!match) {
    throw new Error("Could not find the closing bracket of CATEGORIES after 'section-names' in " + sourcePath);
  }

  // Format category words JSON
  const wordsLines = words.map(w => {
    let line = `    {id:${JSON.stringify(w.id)},n:${JSON.stringify(w.n)},ar:${JSON.stringify(w.ar)}`;
    if (w.note) {
      line += `,note:${JSON.stringify(w.note)}`;
    }
    line += `,s:${JSON.stringify(w.s)},sar:${JSON.stringify(w.sar)}}`;
    return line;
  }).join(',\n');

  const categorySnippet = `,\n  { id:'verben', ar:'الأفعال', de:'Verben', hasArticles:false, words:[\n${wordsLines}\n  ]}`;
  const verbFormsSnippet = `\n\n/* Conjugation data for verbs (stored outside CATEGORIES to keep canonical vocab hash focused) */\n` +
    `const VERB_FORMS = ${JSON.stringify(verbForms, null, 2)};\n` +
    `if(typeof window !== 'undefined'){ window.VERB_FORMS = VERB_FORMS; }\n`;

  // Replace
  let updatedSource;
  let updatedHtml;
  if (mode === 'inline') {
    const replacement = match[1] + categorySnippet + match[2] + verbFormsSnippet;
    updatedSource = sourceText.replace(categoryEndRegex, replacement);
    updatedHtml = updatedSource;
  } else {
    updatedSource = sourceText.replace(categoryEndRegex, match[1] + categorySnippet + match[2]);
    const scriptEnd = html.lastIndexOf('</script>');
    if (scriptEnd === -1) {
      throw new Error('Could not locate the main script closing tag in ' + htmlPath);
    }
    updatedHtml = html.slice(0, scriptEnd) + verbFormsSnippet + html.slice(scriptEnd);
  }

  fs.writeFileSync(sourcePath, updatedSource, 'utf8');
  if (mode !== 'inline') {
    fs.writeFileSync(htmlPath, updatedHtml, 'utf8');
  }
  return { applied: true, wordCount: words.length };
}

if (require.main === module) {
  const rootDir = path.resolve(__dirname, '..');
  const defaultHtml = path.join(rootDir, 'index.html');
  const defaultJson = path.join(__dirname, 'verbs_batch1.json');

  try {
    const res = applyVerbsBatch1(defaultHtml, defaultJson);
    console.log(`[OK] Successfully inserted category 'verben' with ${res.wordCount} verbs and VERB_FORMS into ${defaultHtml}`);
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  }
}

module.exports = { applyVerbsBatch1 };

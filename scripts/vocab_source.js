'use strict';
/**
 * scripts/vocab_source.js
 * -----------------------
 * Shared helper for tooling that reads or edits the CATEGORIES vocabulary.
 *
 * Since Phase A1 the vocabulary lives in `data/categories.js` instead of being
 * inlined inside `index.html`. Historical batch tools still receive a path to
 * `index.html`, so this helper resolves where the CATEGORIES array really is:
 *
 *  - split layout (current):  index.html + data/categories.js
 *  - legacy layout (fixtures): CATEGORIES inlined in the HTML document
 *
 * The returned object is:
 *   {
 *     html,              // raw text of index.html (for VERB_FORMS and friends)
 *     mode,              // 'inline' | 'split'
 *     sourceText,        // text that actually contains `const CATEGORIES = [`
 *     sourcePath,        // file that must be written back after a transform
 *     categoriesSource   // data/categories.js text in split mode, else null
 *   }
 */

const fs = require('fs');
const path = require('path');

const CATEGORIES_DECL = /const\s+CATEGORIES\s*=\s*\[/;
const DEFAULT_CATEGORIES_RELATIVE_PATH = path.join('data', 'categories.js');

function hasInlineCategories(text) {
  return CATEGORIES_DECL.test(text);
}

function resolveCategoriesSource(htmlPath, categoriesPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');

  if (hasInlineCategories(html)) {
    return {
      html,
      mode: 'inline',
      sourceText: html,
      sourcePath: htmlPath,
      categoriesSource: null
    };
  }

  const resolvedPath = categoriesPath || path.join(path.dirname(htmlPath), DEFAULT_CATEGORIES_RELATIVE_PATH);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Vocabulary source not found: '${htmlPath}' has no inline 'const CATEGORIES = [' ` +
      `and no categories file exists at '${resolvedPath}'`
    );
  }

  const categoriesSource = fs.readFileSync(resolvedPath, 'utf8');
  if (!hasInlineCategories(categoriesSource)) {
    throw new Error(`Categories file '${resolvedPath}' does not declare 'const CATEGORIES = ['`);
  }

  return {
    html,
    mode: 'split',
    sourceText: categoriesSource,
    sourcePath: resolvedPath,
    categoriesSource
  };
}

module.exports = {
  resolveCategoriesSource,
  hasInlineCategories
};

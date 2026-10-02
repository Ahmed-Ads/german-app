#!/usr/bin/env node
/**
 * scripts/extract_categories_ast.js
 * ---------------------------------
 * Robust JavaScript AST / VM extractor for CATEGORIES array in HTML files.
 * Uses balanced bracket matching respecting string literals, escapes, and comments.
 * Outputs normalized JSON to stdout.
 *
 * Usage:
 *   node scripts/extract_categories_ast.js <path-to-html-file>
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function main() {
  const targetPath = process.argv[2] || path.join(__dirname, '..', 'index.html');

  if (!fs.existsSync(targetPath)) {
    process.stderr.write(`CRITICAL: File does not exist: ${targetPath}\n`);
    process.exit(1);
  }

  // Read HTML file as UTF-8 and normalize CRLF to LF
  const html = fs.readFileSync(targetPath, 'utf8').replace(/\r\n/g, '\n');

  const declPattern = /const\s+CATEGORIES\s*=\s*\[/;
  const match = declPattern.exec(html);
  if (!match) {
    process.stderr.write(`CRITICAL: Could not find 'const CATEGORIES = [' in ${targetPath}\n`);
    process.exit(2);
  }

  const arrayStartIndex = match.index + match[0].length - 1; // points to '['

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
        i++; // skip escaped char
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

    if (ch === '[') {
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0) {
        arrayEndIndex = i;
        break;
      }
    }
  }

  if (arrayEndIndex === -1) {
    process.stderr.write('CRITICAL: Could not find matching closing bracket for CATEGORIES array\n');
    process.exit(3);
  }

  const arrayJs = html.slice(arrayStartIndex, arrayEndIndex + 1);
  const sandbox = {};
  vm.createContext(sandbox);

  try {
    vm.runInContext('CATEGORIES = ' + arrayJs, sandbox);
  } catch (err) {
    process.stderr.write(`CRITICAL: VM evaluation error: ${err.message}\n`);
    process.exit(4);
  }

  if (!sandbox.CATEGORIES || !Array.isArray(sandbox.CATEGORIES)) {
    process.stderr.write('CRITICAL: Evaluated CATEGORIES is not an array\n');
    process.exit(5);
  }

  // Normalize hasArticles to boolean
  const normalized = sandbox.CATEGORIES.map(cat => ({
    ...cat,
    hasArticles: Boolean(cat.hasArticles)
  }));

  process.stdout.write(JSON.stringify(normalized));
}

main();

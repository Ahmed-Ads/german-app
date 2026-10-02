#!/usr/bin/env node
/**
 * extract_categories_ast.js
 * -------------------------
 * Extracts CATEGORIES array from index.html using Node.js vm module (real JavaScript AST evaluation).
 * Verifies deep equality against vocab_baseline.json without using regex heuristics.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT_DIR, 'index.html');
const BASELINE_PATH = path.join(ROOT_DIR, 'vocab_baseline.json');
const OUTPUT_PATH = path.join(ROOT_DIR, 'proof', 'extracted_categories.json');

console.log('Reading index.html...');
const html = fs.readFileSync(HTML_PATH, 'utf8');

// Find CATEGORIES declaration
const declIdx = html.indexOf('const CATEGORIES =');
if (declIdx === -1) {
  console.error('ERROR: Could not find const CATEGORIES in index.html');
  process.exit(1);
}

const threshPos = html.indexOf('/* thresholds requested by user */', declIdx);
if (threshPos === -1) {
  console.error('ERROR: Could not find end of CATEGORIES definition');
  process.exit(1);
}

const jsSnippet = html.slice(declIdx, threshPos);

// Run in isolated VM sandbox
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(jsSnippet.replace('const CATEGORIES', 'CATEGORIES'), sandbox);

if (!sandbox.CATEGORIES || !Array.isArray(sandbox.CATEGORIES)) {
  console.error('ERROR: Failed to evaluate CATEGORIES into an array');
  process.exit(1);
}

// Convert from VM realm to host Realm and ensure hasArticles is boolean
const extracted = JSON.parse(JSON.stringify(sandbox.CATEGORIES)).map(cat => ({
  ...cat,
  hasArticles: Boolean(cat.hasArticles)
}));

console.log(`Evaluated: ${extracted.length} categories, ${extracted.reduce((s, c) => s + c.words.length, 0)} words.`);

// Compare with baseline
const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));

try {
  assert.deepStrictEqual(extracted, baseline);
  console.log('✅ PASS: Extracted CATEGORIES is 100% DEEP-EQUAL to vocab_baseline.json');
} catch (err) {
  console.error('❌ FAIL: Extracted CATEGORIES differs from vocab_baseline.json!');
  console.error(err.message);
  process.exit(1);
}

// Save extracted JSON
fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(extracted, null, 2), 'utf8');
console.log(`Saved extracted data to: ${OUTPUT_PATH}`);

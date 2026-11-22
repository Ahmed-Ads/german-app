/**
 * tests/words_batch9.test.js
 *
 * Comprehensive Vitest suite for the 60 words in the new category
 * 'gegensaetze' (60 words, hasArticles: false, no a/pl keys):
 * 1. Schema integrity: categories count 40, order, IDs, hasArticles false, word count 60
 * 2. Word schema: no a/pl keys, valid n, ar, s, sar, note
 * 3. Exact match with tools/words_batch9.json
 * 4. Sentence rules: <= 8 whitespace tokens, ends with punctuation, contains word, script purity
 * 5. Note rules & pair symmetry: every note starts with "عكسها: " and pairs symmetrically
 * 6. Global uniqueness: covers all 1601 words across all 40 categories with 0 duplicate sentences
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const htmlPath = path.join(rootDir, 'index.html');
const jsonPath = path.join(rootDir, 'tools', 'words_batch9.json');
const retiredPath = path.join(rootDir, 'vocab_ids_retired.json');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const batch9Json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const retiredIds = JSON.parse(fs.readFileSync(retiredPath, 'utf8'));

function createTestContext() {
  const scripts = [...htmlContent.matchAll(/<script(?![^>]*src=)(?:[^>]*)>([\s\S]*?)<\/script>/gi)];
  if (scripts.length < 2) throw new Error('Could not find main script in index.html');
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

  return sandbox.window;
}

const windowCtx = createTestContext();
const CATEGORIES = windowCtx.CATEGORIES;

describe('Words Batch 9: Category & Word Schema Integrity', () => {
  it('contains exactly 40 categories with gegensaetze appended after behoerden', () => {
    expect(CATEGORIES.length).toBe(40);
    expect(CATEGORIES[30].id).toBe('verben');
    expect(CATEGORIES[31].id).toBe('gesundheit');
    expect(CATEGORIES[32].id).toBe('einkaufen');
    expect(CATEGORIES[33].id).toBe('reisen');
    expect(CATEGORIES[34].id).toBe('arbeit');
    expect(CATEGORIES[35].id).toBe('natur');
    expect(CATEGORIES[36].id).toBe('freizeit');
    expect(CATEGORIES[37].id).toBe('restaurant');
    expect(CATEGORIES[38].id).toBe('behoerden');
    expect(CATEGORIES[39].id).toBe('gegensaetze');
  });

  it('gegensaetze category matches expected metadata and word count', () => {
    const gegensaetze = CATEGORIES[39];
    expect(gegensaetze.id).toBe('gegensaetze');
    expect(gegensaetze.de).toBe('Gegensätze');
    expect(gegensaetze.ar).toBe('الأضداد');
    expect(gegensaetze.hasArticles).toBe(false);
    expect(gegensaetze.words.length).toBe(60);
  });

  it('all 60 batch 9 words have no a or pl keys and IDs start with gegensaetze.', () => {
    const gegensaetze = CATEGORIES[39];
    gegensaetze.words.forEach(w => {
      expect(w.id.startsWith('gegensaetze.')).toBe(true);
      expect(w.a).toBeUndefined();
      expect(w.pl).toBeUndefined();
      expect(typeof w.n).toBe('string');
      expect(w.n.trim().length).toBeGreaterThan(0);
      expect(typeof w.ar).toBe('string');
      expect(w.ar.trim().length).toBeGreaterThan(0);
      expect(typeof w.s).toBe('string');
      expect(w.s.trim().length).toBeGreaterThan(0);
      expect(typeof w.sar).toBe('string');
      expect(w.sar.trim().length).toBeGreaterThan(0);
      expect(typeof w.note).toBe('string');
      expect(w.note.trim().length).toBeGreaterThan(0);
    });
  });

  it('all 60 batch 9 words match tools/words_batch9.json field by field in order', () => {
    const jsonGegensaetze = batch9Json.categories.find(c => c.id === 'gegensaetze');
    const appGegensaetze = CATEGORIES[39];

    expect(appGegensaetze.words.length).toBe(jsonGegensaetze.words.length);
    for (let i = 0; i < jsonGegensaetze.words.length; i++) {
      const aw = appGegensaetze.words[i];
      const jw = jsonGegensaetze.words[i];

      expect(aw.id).toBe(jw.id);
      expect(aw.n).toBe(jw.n);
      expect(aw.ar).toBe(jw.ar);
      expect(aw.note).toBe(jw.note);
      expect(aw.s).toBe(jw.s);
      expect(aw.sar).toBe(jw.sar);
      expect(aw.a).toBeUndefined();
      expect(aw.pl).toBeUndefined();
    }
  });
});

describe('Words Batch 9: Linguistic & Sentence Rules', () => {
  const batch9Words = CATEGORIES[39].words;
  const arabicRegex = /[\u0600-\u06FF]/;
  const latinRegex = /[a-zA-Z\u00c4\u00e4\u00d6\u00f6\u00dc\u00fc\u00df]/;

  it('all 60 German sentences have at most 8 whitespace-separated tokens', () => {
    batch9Words.forEach(w => {
      const tokens = w.s.trim().split(/\s+/);
      expect(tokens.length, `Sentence > 8 tokens in ${w.id}: "${w.s}" (${tokens.length})`).toBeLessThanOrEqual(8);
    });
  });

  it('all 60 German sentences end with sentence-ending punctuation (. ? or !)', () => {
    batch9Words.forEach(w => {
      expect(/[.?!]$/.test(w.s.trim()), `Sentence in ${w.id} must end with [.?!]: "${w.s}"`).toBe(true);
    });
  });

  it('all 60 German sentences contain the word itself (case-insensitive)', () => {
    batch9Words.forEach(w => {
      const stem = w.n.trim().toLowerCase();
      const sLower = w.s.toLowerCase();
      expect(sLower.includes(stem), `Sentence in ${w.id} ("${w.s}") must contain word "${w.n}"`).toBe(true);
    });
  });

  it('script purity: no Arabic in German fields, no Latin in Arabic translation/sentence', () => {
    batch9Words.forEach(w => {
      expect(arabicRegex.test(w.s), `German sentence in ${w.id} contains Arabic: "${w.s}"`).toBe(false);
      expect(arabicRegex.test(w.n), `German word in ${w.id} contains Arabic: "${w.n}"`).toBe(false);

      expect(latinRegex.test(w.sar), `Arabic sentence in ${w.id} contains Latin: "${w.sar}"`).toBe(false);
      expect(latinRegex.test(w.ar), `Arabic gloss in ${w.id} contains Latin: "${w.ar}"`).toBe(false);
    });
  });

  it('every note starts with "عكسها: " and opposite exists and names the word back (pair symmetry)', () => {
    const wordsByName = new Map();
    batch9Words.forEach(w => wordsByName.set(w.n, w));

    let symmetricPairsCount = 0;

    batch9Words.forEach(w => {
      expect(w.note.startsWith('عكسها: '), `Word ${w.id} note must start with "عكسها: "`).toBe(true);

      const oppMatch = w.note.match(/^عكسها:\s*([^\s؛;]+)/);
      expect(oppMatch, `Failed to parse opposite word from note "${w.note}" in ${w.id}`).not.toBeNull();
      const oppName = oppMatch[1];

      const oppWord = wordsByName.get(oppName);
      expect(oppWord, `Opposite word "${oppName}" named in ${w.id} must exist in gegensaetze`).toBeDefined();

      const backMatch = oppWord.note.match(/^عكسها:\s*([^\s؛;]+)/);
      expect(backMatch, `Failed to parse opposite word from note in opposite ${oppWord.id}`).not.toBeNull();
      expect(backMatch[1], `Pair symmetry failed: ${w.n} -> ${oppName}, but ${oppWord.n} -> ${backMatch[1]}`).toBe(w.n);

      symmetricPairsCount++;
    });

    expect(symmetricPairsCount).toBe(60);
  });
});

describe('Words Batch 9: Global Uniqueness & Integrity Across All 1601 Words', () => {
  it('contains exactly 40 categories and 1601 words total', () => {
    expect(CATEGORIES.length).toBe(40);
    const totalWords = CATEGORIES.reduce((s, c) => s + c.words.length, 0);
    expect(totalWords).toBe(1601);
  });

  it('all 1601 word IDs are unique and none in vocab_ids_retired.json', () => {
    const allIds = new Set();
    const retiredSet = new Set(retiredIds.map(item => (typeof item === 'string' ? item : item.id)));

    for (const cat of CATEGORIES) {
      for (const w of cat.words) {
        expect(allIds.has(w.id), `Duplicate word id: ${w.id}`).toBe(false);
        allIds.add(w.id);
        expect(retiredSet.has(w.id), `Active word ${w.id} is in retired set`).toBe(false);
      }
    }
    expect(allIds.size).toBe(1601);
  });

  it('all 1601 German example sentences and Arabic translations are globally unique', () => {
    const deSentences = new Map();
    const arSentences = new Map();

    for (const cat of CATEGORIES) {
      for (const w of cat.words) {
        expect(deSentences.has(w.s), `Duplicate German sentence in ${w.id}: "${w.s}" (first in ${deSentences.get(w.s)})`).toBe(false);
        deSentences.set(w.s, w.id);

        expect(arSentences.has(w.sar), `Duplicate Arabic sentence in ${w.id}: "${w.sar}" (first in ${arSentences.get(w.sar)})`).toBe(false);
        arSentences.set(w.sar, w.id);
      }
    }

    expect(deSentences.size).toBe(1601);
    expect(arSentences.size).toBe(1601);
  });
});

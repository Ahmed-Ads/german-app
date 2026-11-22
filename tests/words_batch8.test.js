/**
 * tests/words_batch8.test.js
 *
 * Comprehensive Vitest suite for the 80 words across two new noun categories
 * 'restaurant' (40 words) and 'behoerden' (40 words):
 * 1. Schema integrity: categories, order, IDs, hasArticles true, counts 40 and 40
 * 2. Word schema: article in der/die/das, Arabic gloss, pl null or 'die ...'
 * 3. Exact match for plural-less words with tools/words_batch8.json
 * 4. Sentence rules: <= 8 whitespace tokens, ends with punctuation, contains noun or plural, script purity
 * 5. Global uniqueness: covers all 1601 words across all 40 categories with 0 duplicate sentences
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
const jsonPath = path.join(rootDir, 'tools', 'words_batch8.json');
const retiredPath = path.join(rootDir, 'vocab_ids_retired.json');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const batch8Json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
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

describe('Words Batch 8: Category & Word Schema Integrity', () => {
  it('contains exactly 40 categories with restaurant and behoerden appended after freizeit', () => {
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
  });

  it('restaurant category matches expected metadata and word count', () => {
    const restaurant = CATEGORIES[37];
    expect(restaurant.id).toBe('restaurant');
    expect(restaurant.de).toBe('Restaurant & Essen');
    expect(restaurant.ar).toBe('المطعم والأكل');
    expect(restaurant.hasArticles).toBe(true);
    expect(restaurant.words.length).toBe(40);
  });

  it('behoerden category matches expected metadata and word count', () => {
    const behoerden = CATEGORIES[38];
    expect(behoerden.id).toBe('behoerden');
    expect(behoerden.de).toBe('Behörden & Ämter');
    expect(behoerden.ar).toBe('الجهات الحكومية والمكاتب');
    expect(behoerden.hasArticles).toBe(true);
    expect(behoerden.words.length).toBe(40);
  });

  it('all 80 batch 8 words match tools/words_batch8.json field by field in order', () => {
    const jsonRestaurant = batch8Json.categories.find(c => c.id === 'restaurant');
    const jsonBehoerden = batch8Json.categories.find(c => c.id === 'behoerden');
    const appRestaurant = CATEGORIES[37];
    const appBehoerden = CATEGORIES[38];

    [
      { appCat: appRestaurant, jsonCat: jsonRestaurant },
      { appCat: appBehoerden, jsonCat: jsonBehoerden }
    ].forEach(({ appCat, jsonCat }) => {
      expect(appCat.words.length).toBe(jsonCat.words.length);
      for (let i = 0; i < jsonCat.words.length; i++) {
        const aw = appCat.words[i];
        const jw = jsonCat.words[i];

        expect(aw.id).toBe(jw.id);
        expect(aw.id.startsWith(appCat.id + '.')).toBe(true);
        expect(aw.a).toBe(jw.a);
        expect(['der', 'die', 'das']).toContain(aw.a);
        expect(aw.n).toBe(jw.n);
        expect(aw.ar).toBe(jw.ar);

        const expectedPl = jw.pl === undefined ? null : jw.pl;
        expect(aw.pl).toBe(expectedPl);
        if (aw.pl !== null) {
          expect(aw.pl.startsWith('die ')).toBe(true);
        }

        const expectedNote = (jw.note && jw.note.trim()) ? jw.note.trim() : undefined;
        expect(aw.note).toBe(expectedNote);

        expect(aw.s).toBe(jw.s);
        expect(aw.sar).toBe(jw.sar);
      }
    });
  });

  it('plural-less words in app match exactly those in tools/words_batch8.json', () => {
    const jsonNullPlurals = new Set();
    batch8Json.categories.forEach(c => {
      c.words.forEach(w => {
        if (w.pl === null || w.pl === undefined) jsonNullPlurals.add(w.id);
      });
    });

    const appNullPlurals = new Set();
    [CATEGORIES[37], CATEGORIES[38]].forEach(c => {
      c.words.forEach(w => {
        if (w.pl === null || w.pl === undefined) appNullPlurals.add(w.id);
      });
    });

    expect(appNullPlurals.size).toBe(jsonNullPlurals.size);
    for (const id of jsonNullPlurals) {
      expect(appNullPlurals.has(id)).toBe(true);
    }
  });
});

describe('Words Batch 8: Linguistic & Sentence Rules', () => {
  const batch8Words = [...CATEGORIES[37].words, ...CATEGORIES[38].words];
  const arabicRegex = /[\u0600-\u06FF]/;
  const latinRegex = /[a-zA-Z\u00c4\u00e4\u00d6\u00f6\u00dc\u00fc\u00df]/;

  it('all 80 German sentences have at most 8 whitespace-separated tokens', () => {
    batch8Words.forEach(w => {
      const tokens = w.s.trim().split(/\s+/);
      expect(tokens.length, `Sentence > 8 tokens in ${w.id}: "${w.s}" (${tokens.length})`).toBeLessThanOrEqual(8);
    });
  });

  it('all 80 German sentences end with sentence-ending punctuation (. ? or !)', () => {
    batch8Words.forEach(w => {
      expect(/[.?!]$/.test(w.s.trim()), `Sentence in ${w.id} must end with [.?!]: "${w.s}"`).toBe(true);
    });
  });

  it('all 80 German sentences contain the noun or its plural form (case-insensitive)', () => {
    batch8Words.forEach(w => {
      const nounStem = w.n.trim().toLowerCase();
      const plStem = w.pl ? w.pl.replace('die ', '').trim().toLowerCase() : null;
      const sLower = w.s.toLowerCase();

      const found = sLower.includes(nounStem) || (plStem && sLower.includes(plStem));
      expect(found, `Sentence in ${w.id} ("${w.s}") must contain noun "${w.n}" or plural "${w.pl}"`).toBe(true);
    });
  });

  it('script purity: no Arabic letters in German, no Latin letters in Arabic', () => {
    batch8Words.forEach(w => {
      expect(arabicRegex.test(w.s), `German sentence in ${w.id} contains Arabic: "${w.s}"`).toBe(false);
      expect(arabicRegex.test(w.n), `German noun in ${w.id} contains Arabic: "${w.n}"`).toBe(false);

      expect(latinRegex.test(w.sar), `Arabic sentence in ${w.id} contains Latin: "${w.sar}"`).toBe(false);
      expect(latinRegex.test(w.ar), `Arabic gloss in ${w.id} contains Latin: "${w.ar}"`).toBe(false);
    });
  });
});

describe('Words Batch 8: Global Uniqueness & Integrity Across All 1601 Words', () => {
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

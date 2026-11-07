/**
 * tests/verbs_b1.test.js
 *
 * Comprehensive Vitest suite for the 94 B1 verbs added to "الأفعال" (Verben):
 * 1. 94 new verbs appended to 'verben', order, IDs, level B1, non-article schema
 * 2. VERB_FORMS complete: 6 pres, 6 pret, pp, perfekt non-empty, sep prefix, aux haben/sein matching JSON
 * 3. Participles of inseparable verbs (überlegen, überraschen, unterstützen, untersuchen) carry no ge-
 * 4. Sentence rules: <= 8 whitespace tokens, ends with punctuation, finite verb form, sep prefix, script purity
 * 5. Global uniqueness: covers all 1215 words across all 31 categories with 0 duplicate sentences
 * 6. Synonym computation: verifies exactly 6 pairs across all 263 verbs, with anfangen/beginnen as the only new pair
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
const jsonPath = path.join(rootDir, 'tools', 'verbs_batch3.json');
const retiredPath = path.join(rootDir, 'vocab_ids_retired.json');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const batch3Json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
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
      location: { href: '', search: '', pathname: '', hash: '' },
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
      }
    },
    navigator: {
      language: 'de',
      languages: ['de', 'ar'],
      serviceWorker: {
        addEventListener: () => {}
      }
    }
  };
  sandbox.window.window = sandbox.window;
  sandbox.window.document = sandbox.document;

  vm.createContext(sandbox);
  vm.runInContext(mainScript, sandbox);

  return sandbox;
}

const ctx = createTestContext();
const CATEGORIES = ctx.window.CATEGORIES;
const VERB_FORMS = ctx.window.VERB_FORMS;
const verbSynonyms = ctx.window.verbSynonyms;
const evaluateWrittenAnswer = ctx.window.evaluateWrittenAnswer;
const checkConjAnswer = ctx.window.checkConjAnswer;

const ARABIC_SCRIPT_REGEX = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_SCRIPT_REGEX = /[A-Za-zÄÖÜäöüß]/;

describe('B1 Verbs: Category Integration & Ordering', () => {
  const verbenCat = CATEGORIES.find(c => c.id === 'verben');

  it('contains exactly 263 verbs (77 A1 + 92 A2 + 94 B1)', () => {
    expect(verbenCat).toBeDefined();
    expect(verbenCat.words.length).toBe(263);
  });

  it('appends the 94 B1 verbs starting at index 169 in exact JSON order', () => {
    expect(batch3Json.length).toBe(94);

    for (let i = 0; i < 94; i++) {
      const actual = verbenCat.words[169 + i];
      const expected = batch3Json[i];

      expect(actual.id).toBe(expected.id);
      expect(actual.id.startsWith('verben.')).toBe(true);
      expect(actual.n).toBe(expected.n);
      expect(actual.ar).toBe(expected.ar);
      expect(actual.s).toBe(expected.s);
      expect(actual.sar).toBe(expected.sar);

      const expNote = expected.note && expected.note.trim() ? expected.note.trim() : undefined;
      expect(actual.note).toBe(expNote);

      // Non-article schema: no article, no plural
      expect(actual.a).toBeUndefined();
      expect(actual.pl).toBeUndefined();
    }
  });

  it('all 94 new verbs have level B1 in VERB_FORMS', () => {
    for (const v of batch3Json) {
      const vf = VERB_FORMS[v.id];
      expect(vf, `Missing VERB_FORMS entry for ${v.id}`).toBeDefined();
      expect(vf.level).toBe('B1');
    }
  });
});

describe('B1 Verbs: Conjugation Forms Completeness & Integrity', () => {
  it('every new verb has 6 pres forms, 6 pret forms, non-empty pp and perfekt, and matching aux', () => {
    for (const expected of batch3Json) {
      const vf = VERB_FORMS[expected.id];

      expect(['haben', 'sein']).toContain(vf.aux);
      expect(vf.aux).toBe(expected.aux);

      expect(Array.isArray(vf.pres)).toBe(true);
      expect(vf.pres.length).toBe(6);
      expect(vf.pres).toEqual(expected.pres);

      expect(Array.isArray(vf.pret)).toBe(true);
      expect(vf.pret.length).toBe(6);
      expect(vf.pret).toEqual(expected.pret);

      expect(typeof vf.pp).toBe('string');
      expect(vf.pp.trim().length).toBeGreaterThan(0);
      expect(vf.pp).toBe(expected.pp);

      expect(typeof vf.perfekt).toBe('string');
      expect(vf.perfekt.trim().length).toBeGreaterThan(0);
      expect(vf.perfekt).toBe(expected.perfekt);

      expect(vf.sep).toBe(expected.sep !== undefined ? expected.sep : null);
      expect(vf.pretDuAlt).toBe(expected.pret_du_alt || null);
    }
  });

  it('exactly 5 B1 verbs use auxiliary sein (steigen, verreisen, verschwinden, ausfallen, vorkommen)', () => {
    const seinVerbs = batch3Json.filter(v => v.aux === 'sein');
    expect(seinVerbs.length).toBe(5);
    const seinIds = seinVerbs.map(v => v.id).sort();
    expect(seinIds).toEqual([
      'verben.ausfallen',
      'verben.steigen',
      'verben.verreisen',
      'verben.verschwinden',
      'verben.vorkommen'
    ]);

    for (const v of seinVerbs) {
      const vf = VERB_FORMS[v.id];
      expect(vf.aux).toBe('sein');
      expect(vf.perfekt.startsWith('ist ')).toBe(true);
    }
  });

  it('separable verbs have correct prefix structure in present tense forms', () => {
    const separableVerbs = batch3Json.filter(v => v.sep);
    expect(separableVerbs.length).toBe(25);

    for (const v of separableVerbs) {
      const vf = VERB_FORMS[v.id];
      expect(vf.sep).toBeTruthy();
      for (const p of vf.pres) {
        expect(p.endsWith(' ' + vf.sep), `Form '${p}' of ${v.id} must end with prefix '${vf.sep}'`).toBe(true);
      }
    }
  });

  it('participles of inseparable verbs (überlegen, überraschen, unterstützen, untersuchen) carry no ge-', () => {
    const checkNoGe = {
      'verben.ueberlegen': 'überlegt',
      'verben.ueberraschen': 'überrascht',
      'verben.unterstuetzen': 'unterstützt',
      'verben.untersuchen': 'untersucht'
    };

    for (const [id, expectedPp] of Object.entries(checkNoGe)) {
      const vf = VERB_FORMS[id];
      expect(vf, `Missing VERB_FORMS entry for ${id}`).toBeDefined();
      expect(vf.pp).toBe(expectedPp);
      expect(vf.pp.startsWith('ge'), `${id} participle '${vf.pp}' must not start with ge-`).toBe(false);
      expect(vf.perfekt).toBe(`hat ${expectedPp}`);
    }
  });
});

describe('B1 Verbs: Example Sentences & Linguistic Rules', () => {
  it('every new German sentence contains at most 8 whitespace-separated tokens', () => {
    for (const v of batch3Json) {
      const tokens = v.s.trim().split(/\s+/);
      expect(tokens.length, `Verb ${v.id} German sentence exceeds 8 tokens: "${v.s}"`).toBeLessThanOrEqual(8);
    }
  });

  it('every new German sentence ends with . ? or ! and Arabic ends with . ? ! or ؟', () => {
    for (const v of batch3Json) {
      expect(/[.?!]$/.test(v.s.trim()), `Verb ${v.id} German sentence punctuation: "${v.s}"`).toBe(true);
      expect(/[.?!؟]$/.test(v.sar.trim()), `Verb ${v.id} Arabic sentence punctuation: "${v.sar}"`).toBe(true);
    }
  });

  it('enforces script purity: no Arabic letters in German fields, no Latin letters in Arabic fields', () => {
    for (const v of batch3Json) {
      expect(ARABIC_SCRIPT_REGEX.test(v.n), `Verb ${v.id} 'n' has Arabic`).toBe(false);
      expect(ARABIC_SCRIPT_REGEX.test(v.s), `Verb ${v.id} 's' has Arabic`).toBe(false);
      expect(LATIN_SCRIPT_REGEX.test(v.ar), `Verb ${v.id} 'ar' has Latin`).toBe(false);
      expect(LATIN_SCRIPT_REGEX.test(v.sar), `Verb ${v.id} 'sar' has Latin`).toBe(false);
    }
  });

  it('contains the finite, infinitive, or participle form in the example sentence', () => {
    for (const v of batch3Json) {
      const wordsInS = v.s.toLowerCase().replace(/[^a-zäöüß]/gi, ' ').split(/\s+/).filter(Boolean);
      const allForms = [v.n, ...v.pres, ...v.pret, v.pp].map(f => f.toLowerCase());

      const found = allForms.some(f => {
        return wordsInS.includes(f) || wordsInS.some(w => f.includes(w) && w.length >= 3);
      });
      expect(found, `Verb ${v.id} forms not found in sentence: "${v.s}"`).toBe(true);
    }
  });

  it('separable verbs contain their prefix in the example sentence', () => {
    const separableVerbs = batch3Json.filter(v => v.sep);
    expect(separableVerbs.length).toBeGreaterThan(0);

    for (const v of separableVerbs) {
      const sLower = v.s.toLowerCase();
      const prefixLower = v.sep.toLowerCase();
      expect(sLower.includes(prefixLower), `Separable verb ${v.id} sep '${v.sep}' not found in "${v.s}"`).toBe(true);
    }
  });
});

describe('Global Integrity Guard: Uniqueness Across All 1215 Words', () => {
  it('contains exactly 31 categories and 1215 words total', () => {
    expect(CATEGORIES.length).toBe(31);
    const totalWords = CATEGORIES.reduce((s, c) => s + c.words.length, 0);
    expect(totalWords).toBe(1215);
  });

  it('all 1215 word IDs are unique and none in vocab_ids_retired.json', () => {
    const allIds = new Set();
    const retiredSet = new Set(retiredIds.map(item => (typeof item === 'string' ? item : item.id)));

    for (const cat of CATEGORIES) {
      for (const w of cat.words) {
        expect(allIds.has(w.id), `Duplicate word id: ${w.id}`).toBe(false);
        allIds.add(w.id);
        expect(retiredSet.has(w.id), `Active word ${w.id} is in retired set`).toBe(false);
      }
    }
    expect(allIds.size).toBe(1215);
  });

  it('all 1215 German example sentences and Arabic translations are globally unique', () => {
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

    expect(deSentences.size).toBe(1215);
    expect(arSentences.size).toBe(1215);
  });
});

describe('Synonym Computation & Invariants', () => {
  it('verbSynonyms across all 263 verbs finds exactly 6 pairs with anfangen/beginnen as the only new pair', () => {
    const verbenCat = CATEGORIES.find(c => c.id === 'verben');
    const pairs = new Map();

    for (const w of verbenCat.words) {
      const syns = verbSynonyms(w.id);
      for (const s of syns) {
        const sName = typeof s === 'string' ? s : s.n;
        const pair = [w.n, sName].sort().join(' - ');
        pairs.set(pair, true);
      }
    }

    const discoveredPairs = Array.from(pairs.keys()).sort();
    expect(discoveredPairs).toEqual([
      'anfangen - beginnen',
      'aufmachen - öffnen',
      'fahren - reisen',
      'gefallen - mögen',
      'gehen - laufen',
      'schließen - zumachen'
    ]);
    expect(discoveredPairs.length).toBe(6);
  });

  it('checkConjAnswer evaluates B1 verbs accurately across all stages', () => {
    // 1. Inseparable weak without ge-: überlegen
    const r1 = checkConjAnswer('überlegen', 'verben.ueberlegen', 1);
    expect(r1.ok).toBe(true);

    const r4 = checkConjAnswer('hat überlegt', 'verben.ueberlegen', 4);
    expect(r4.ok).toBe(true);

    // 2. Separable + sein: ausfallen
    const rAus1 = checkConjAnswer('ausfallen', 'verben.ausfallen', 1);
    expect(rAus1.ok).toBe(true);

    const rAus4 = checkConjAnswer('ist ausgefallen', 'verben.ausfallen', 4);
    expect(rAus4.ok).toBe(true);

    // 3. Separable strong: vorschlagen
    const rVor1 = checkConjAnswer('vorschlagen', 'verben.vorschlagen', 1);
    expect(rVor1.ok).toBe(true);

    const rVor4 = checkConjAnswer('hat vorgeschlagen', 'verben.vorschlagen', 4);
    expect(rVor4.ok).toBe(true);
  });
});

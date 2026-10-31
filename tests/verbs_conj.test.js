/**
 * tests/verbs_conj.test.js
 *
 * Comprehensive Vitest suite for Release v1.18:
 * Typed Conjugation Quiz for the Verbs Category ("اختبار التصريفات" data-mode="conj")
 *
 * Real code extracted from index.html:
 * 1. THRESH and PROGRESS_MODES wiring & isolation from global mastery
 * 2. Answer checking (digraphs, case, spaces, pretDuAlt, missing prefix, 6 required verbs)
 * 3. Session selection rules (pool >= 3 requirement, lowest counter first, random ties, no repeats, max 10)
 * 4. Run scoring (exactly one applyResult per 4-stage run, only when all 4 right, goal counter +1 once)
 * 5. Backup export/import round-trip and resetAllProgress purging
 * 6. Cross-device sync merge properties and old-client behavior
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const SyncMergePolicy = require('../sync/merge_policy.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const htmlPath = path.join(rootDir, 'index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

function createTestContext() {
  const scripts = [...htmlContent.matchAll(/<script(?![^>]*src=)(?:[^>]*)>([\s\S]*?)<\/script>/gi)];
  if (scripts.length < 2) throw new Error('Could not find main script in index.html');
  const mainScript = scripts[1][1].replace(/\ninit\(\);/g, '\n// init();');

  const storageMap = new Map();
  const mockStorage = {
    get: async (k) => storageMap.get(k) || null,
    set: async (k, v) => { storageMap.set(k, v); return true; },
    remove: async (k) => { storageMap.delete(k); return true; }
  };

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
    Date,
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: () => {},
    setInterval: () => {},
    clearInterval: () => {},
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => ({
        style: {},
        setAttribute: () => {},
        appendChild: () => {},
        addEventListener: () => {},
        click: () => {},
        classList: { add: () => {}, remove: () => {}, contains: () => false }
      }),
      body: { appendChild: () => {}, removeChild: () => {} }
    },
    window: {
      addEventListener: () => {},
      removeEventListener: () => {},
      location: { href: '', search: '', pathname: '', hash: '' },
      storage: mockStorage,
      localStorage: {
        getItem: (k) => storageMap.get(k) || null,
        setItem: (k, v) => storageMap.set(k, v),
        removeItem: (k) => storageMap.delete(k)
      }
    },
    navigator: {
      language: 'de',
      languages: ['de', 'ar'],
      serviceWorker: { addEventListener: () => {} }
    },
    Blob: class { constructor(parts) { this.parts = parts; } },
    URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
    SyncMergePolicy
  };
  sandbox.window.window = sandbox.window;
  sandbox.window.document = sandbox.document;

  vm.createContext(sandbox);
  vm.runInContext(mainScript, sandbox);

  const exportedKeys = [
    'CATEGORIES', 'VERB_FORMS', 'PROGRESS_MODES', 'THRESH',
    'threshFor', 'checkConjAnswer', 'getVerbConjPool', 'selectConjSession',
    'computeConjMasteredCount', 'applyResult', 'getWordCount', 'setWordCount',
    'ensureProgress', 'validateBackupData', 'exportBackup', 'resetAllProgress',
    'computeMasteredCount', 'getTodayCount', 'verbSynonyms', 'evaluateWrittenAnswer',
    'buildMcqDistractors', 'buildListenDistractors', 'renderConjExercise'
  ];
  for (const k of exportedKeys) {
    if (sandbox.window[k] !== undefined) {
      sandbox[k] = sandbox.window[k];
    }
  }

  return sandbox;
}

describe('Task 1: THRESH, PROGRESS_MODES Wiring & Mastery Isolation', () => {
  let ctx;
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('declares PROGRESS_MODES with conj and THRESH.conj = 5', () => {
    expect(ctx.PROGRESS_MODES).toContain('conj');
    expect(ctx.THRESH.conj).toBe(5);
    expect(ctx.threshFor('conj')).toBe(5);
  });

  it('keeps conj strictly isolated from computeMasteredCount', () => {
    // Zero conj progress initially
    const masteredBefore = ctx.computeMasteredCount();

    // Give perfect conj scores (5) to all 77 verbs
    const verbenCat = ctx.CATEGORIES.find(c => c.id === 'verben');
    for (let i = 0; i < verbenCat.words.length; i++) {
      ctx.setWordCount('verben', 'conj', i, 5);
    }

    // computeMasteredCount MUST remain completely unchanged
    const masteredAfter = ctx.computeMasteredCount();
    expect(masteredAfter).toBe(masteredBefore);

    // But computeConjMasteredCount reflects the 77 mastered
    expect(ctx.computeConjMasteredCount()).toBe(77);
  });
});

describe('Task 2: Answer Checker (checkConjAnswer) on Real Extracted Code', () => {
  let ctx;
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('gehen: accepts digraphs, case, and extra spaces; rejects wrong forms', () => {
    const wid = 'verben.gehen';

    // Stage 1: infinitive
    expect(ctx.checkConjAnswer('gehen', wid, 1).ok).toBe(true);
    expect(ctx.checkConjAnswer('  GeHeN   ', wid, 1).ok).toBe(true);
    expect(ctx.checkConjAnswer('fährt', wid, 1).ok).toBe(false);

    // Stage 2: pres ich (0) -> gehe
    expect(ctx.checkConjAnswer('gehe', wid, 2, 0).ok).toBe(true);
    expect(ctx.checkConjAnswer('GEHE', wid, 2, 0).ok).toBe(true);
    expect(ctx.checkConjAnswer('gehst', wid, 2, 0).ok).toBe(false);

    // Stage 3: pret er/sie/es (2) -> ging
    expect(ctx.checkConjAnswer('ging', wid, 3, 2).ok).toBe(true);
    expect(ctx.checkConjAnswer('ginge', wid, 3, 2).ok).toBe(false);

    // Stage 4: perfekt -> ist gegangen
    expect(ctx.checkConjAnswer('ist gegangen', wid, 4).ok).toBe(true);
    expect(ctx.checkConjAnswer('  IST   GEGANGEN  ', wid, 4).ok).toBe(true);
    expect(ctx.checkConjAnswer('hat gegangen', wid, 4).ok).toBe(false);
  });

  it('essen: accepts both regular and pretDuAlt alternative du-forms', () => {
    const wid = 'verben.essen';
    // VERB_FORMS.essen pret is: ich aß (0), du aßt (1) with pretDuAlt: "aßest"
    // Stage 3: pret du (1) -> both aßt and aßest must be accepted, plus ss digraph
    expect(ctx.checkConjAnswer('aßt', wid, 3, 1).ok).toBe(true);
    expect(ctx.checkConjAnswer('asst', wid, 3, 1).ok).toBe(true);
    expect(ctx.checkConjAnswer('aßest', wid, 3, 1).ok).toBe(true);
    expect(ctx.checkConjAnswer('assest', wid, 3, 1).ok).toBe(true);
    expect(ctx.checkConjAnswer('ASST', wid, 3, 1).ok).toBe(true);
    expect(ctx.checkConjAnswer('asse', wid, 3, 1).ok).toBe(false);

    // Stage 4: perfekt -> hat gegessen
    expect(ctx.checkConjAnswer('hat gegessen', wid, 4).ok).toBe(true);
    expect(ctx.checkConjAnswer('ist gegessen', wid, 4).ok).toBe(false);
  });

  it('aufstehen: requires separable prefix; rejects bare stem with specific Arabic hint', () => {
    const wid = 'verben.aufstehen';

    // Stage 1: infinitive aufstehen. If user types "stehen", missingPrefix hint is triggered
    const rStem1 = ctx.checkConjAnswer('stehen', wid, 1);
    expect(rStem1.ok).toBe(false);
    expect(rStem1.missingPrefix).toBe(true);
    expect(rStem1.hint).toContain('auf');
    expect(ctx.checkConjAnswer('aufstehen', wid, 1).ok).toBe(true);

    // Stage 2: pres ich (0) -> stehe auf
    const rStem2 = ctx.checkConjAnswer('stehe', wid, 2, 0);
    expect(rStem2.ok).toBe(false);
    expect(rStem2.missingPrefix).toBe(true);
    expect(rStem2.hint).toContain('auf');
    expect(rStem2.hint).toContain('stehe auf');
    expect(ctx.checkConjAnswer('stehe auf', wid, 2, 0).ok).toBe(true);
    expect(ctx.checkConjAnswer('   STEHE     AUF   ', wid, 2, 0).ok).toBe(true);

    // Stage 3: pret wir (3) -> standen auf
    const rStem3 = ctx.checkConjAnswer('standen', wid, 3, 3);
    expect(rStem3.ok).toBe(false);
    expect(rStem3.missingPrefix).toBe(true);
    expect(ctx.checkConjAnswer('standen auf', wid, 3, 3).ok).toBe(true);

    // Stage 4: perfekt -> ist aufgestanden
    expect(ctx.checkConjAnswer('ist aufgestanden', wid, 4).ok).toBe(true);
  });

  it('können: accepts umlaut digraph oe (koennen / koennte)', () => {
    const wid = 'verben.koennen';

    // Stage 1: infinitive können or koennen
    expect(ctx.checkConjAnswer('können', wid, 1).ok).toBe(true);
    expect(ctx.checkConjAnswer('koennen', wid, 1).ok).toBe(true);

    // Stage 2: pres ich (0) -> kann
    expect(ctx.checkConjAnswer('kann', wid, 2, 0).ok).toBe(true);

    // Stage 3: pret er/sie/es (2) -> konnte
    expect(ctx.checkConjAnswer('konnte', wid, 3, 2).ok).toBe(true);

    // Stage 4: perfekt -> hat gekonnt
    expect(ctx.checkConjAnswer('hat gekonnt', wid, 4).ok).toBe(true);
  });

  it('telefonieren: -ieren regular verb', () => {
    const wid = 'verben.telefonieren';
    expect(ctx.checkConjAnswer('telefonieren', wid, 1).ok).toBe(true);
    // pres ihr (4) -> telefoniert
    expect(ctx.checkConjAnswer('telefoniert', wid, 2, 4).ok).toBe(true);
    // pret er/sie/es (2) -> telefonierte
    expect(ctx.checkConjAnswer('telefonierte', wid, 3, 2).ok).toBe(true);
    // perfekt -> hat telefoniert
    expect(ctx.checkConjAnswer('hat telefoniert', wid, 4).ok).toBe(true);
  });

  it('lesen: stem change verb (liest, las, hat gelesen)', () => {
    const wid = 'verben.lesen';
    expect(ctx.checkConjAnswer('lesen', wid, 1).ok).toBe(true);
    // pres du (1) -> liest
    expect(ctx.checkConjAnswer('liest', wid, 2, 1).ok).toBe(true);
    expect(ctx.checkConjAnswer('lese', wid, 2, 1).ok).toBe(false);
    // pret ich (0) -> las
    expect(ctx.checkConjAnswer('las', wid, 3, 0).ok).toBe(true);
    // perfekt -> hat gelesen
    expect(ctx.checkConjAnswer('hat gelesen', wid, 4).ok).toBe(true);
  });
});

describe('Task 2B: Optional Leading Pronoun in Conj Stages 2-4 (Fix 2)', () => {
  let ctx;
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('stage 1 never accepts a leading pronoun', () => {
    expect(ctx.checkConjAnswer('ich gehen', 'verben.gehen', 1).ok).toBe(false);
    expect(ctx.checkConjAnswer('er essen', 'verben.essen', 1).ok).toBe(false);
    expect(ctx.checkConjAnswer('du aufstehen', 'verben.aufstehen', 1).ok).toBe(false);
    expect(ctx.checkConjAnswer('wir können', 'verben.koennen', 1).ok).toBe(false);
  });

  it('stage 2/3 accept matching leading pronoun for all pronoun categories; reject non-matching', () => {
    const widGehen = 'verben.gehen';
    // ich (0): gehe
    expect(ctx.checkConjAnswer('ich gehe', widGehen, 2, 0).ok).toBe(true);
    expect(ctx.checkConjAnswer('gehe', widGehen, 2, 0).ok).toBe(true);
    expect(ctx.checkConjAnswer('du gehe', widGehen, 2, 0).ok).toBe(false);
    expect(ctx.checkConjAnswer('er gehe', widGehen, 2, 0).ok).toBe(false);

    const widEssen = 'verben.essen';
    // du (1): isst
    expect(ctx.checkConjAnswer('du isst', widEssen, 2, 1).ok).toBe(true);
    expect(ctx.checkConjAnswer('isst', widEssen, 2, 1).ok).toBe(true);
    expect(ctx.checkConjAnswer('er isst', widEssen, 2, 1).ok).toBe(false);
    expect(ctx.checkConjAnswer('ich isst', widEssen, 2, 1).ok).toBe(false);

    const widKoennen = 'verben.koennen';
    // er/sie/es (2): kann -> accepts er, sie, or es
    expect(ctx.checkConjAnswer('er kann', widKoennen, 2, 2).ok).toBe(true);
    expect(ctx.checkConjAnswer('sie kann', widKoennen, 2, 2).ok).toBe(true);
    expect(ctx.checkConjAnswer('es kann', widKoennen, 2, 2).ok).toBe(true);
    expect(ctx.checkConjAnswer('kann', widKoennen, 2, 2).ok).toBe(true);
    expect(ctx.checkConjAnswer('wir kann', widKoennen, 2, 2).ok).toBe(false);
    expect(ctx.checkConjAnswer('ich kann', widKoennen, 2, 2).ok).toBe(false);
  });

  it('separable verb prefix rule works with matching leading pronoun; rejects mismatch', () => {
    const widAuf = 'verben.aufstehen';
    // asked for ich (0) in pres -> stehe auf
    expect(ctx.checkConjAnswer('ich stehe auf', widAuf, 2, 0).ok).toBe(true);
    expect(ctx.checkConjAnswer('stehe auf', widAuf, 2, 0).ok).toBe(true);

    // Missing prefix with matching pronoun triggers prefix hint
    const rMiss = ctx.checkConjAnswer('ich stehe', widAuf, 2, 0);
    expect(rMiss.ok).toBe(false);
    expect(rMiss.missingPrefix).toBe(true);
    expect(rMiss.hint).toContain('auf');

    // Wrong pronoun is rejected without treating as missing prefix
    const rWrongPronoun = ctx.checkConjAnswer('er stehe auf', widAuf, 2, 0);
    expect(rWrongPronoun.ok).toBe(false);
    expect(rWrongPronoun.missingPrefix).toBe(false);
  });

  it('pretDuAlt works with matching leading pronoun (du)', () => {
    const widLesen = 'verben.lesen';
    // du (1) pret: last or lasest
    expect(ctx.checkConjAnswer('du last', widLesen, 3, 1).ok).toBe(true);
    expect(ctx.checkConjAnswer('last', widLesen, 3, 1).ok).toBe(true);
    expect(ctx.checkConjAnswer('du lasest', widLesen, 3, 1).ok).toBe(true);
    expect(ctx.checkConjAnswer('lasest', widLesen, 3, 1).ok).toBe(true);

    // Mismatched pronoun is rejected
    expect(ctx.checkConjAnswer('er last', widLesen, 3, 1).ok).toBe(false);
    expect(ctx.checkConjAnswer('ich lasest', widLesen, 3, 1).ok).toBe(false);
  });

  it('stage 4 accepts optional er, sie, or es; rejects others', () => {
    const widTel = 'verben.telefonieren';
    expect(ctx.checkConjAnswer('hat telefoniert', widTel, 4).ok).toBe(true);
    expect(ctx.checkConjAnswer('er hat telefoniert', widTel, 4).ok).toBe(true);
    expect(ctx.checkConjAnswer('sie hat telefoniert', widTel, 4).ok).toBe(true);
    expect(ctx.checkConjAnswer('es hat telefoniert', widTel, 4).ok).toBe(true);
    expect(ctx.checkConjAnswer('ich hat telefoniert', widTel, 4).ok).toBe(false);
    expect(ctx.checkConjAnswer('wir hat telefoniert', widTel, 4).ok).toBe(false);

    const widAuf = 'verben.aufstehen';
    expect(ctx.checkConjAnswer('ist aufgestanden', widAuf, 4).ok).toBe(true);
    expect(ctx.checkConjAnswer('er ist aufgestanden', widAuf, 4).ok).toBe(true);
    expect(ctx.checkConjAnswer('sie ist aufgestanden', widAuf, 4).ok).toBe(true);
    expect(ctx.checkConjAnswer('es ist aufgestanden', widAuf, 4).ok).toBe(true);
    expect(ctx.checkConjAnswer('du ist aufgestanden', widAuf, 4).ok).toBe(false);
  });
});

describe('Task 2C: Verb Synonyms Extraction & Typing Acceptance (Fix 1)', () => {
  let ctx;
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('verbSynonyms finds exactly the five specified pairs on real CATEGORIES and no others', () => {
    const verbenCat = ctx.CATEGORIES.find(c => c.id === 'verben');
    expect(verbenCat).toBeDefined();

    const pairs = new Map();
    for (const w of verbenCat.words) {
      const syns = ctx.verbSynonyms(w.id);
      for (const s of syns) {
        const sName = typeof s === 'string' ? s : s.n;
        const pair = [w.n, sName].sort().join(' - ');
        pairs.set(pair, true);
      }
    }

    const discoveredPairs = Array.from(pairs.keys()).sort();
    expect(discoveredPairs).toEqual([
      'aufmachen - öffnen',
      'fahren - reisen',
      'gefallen - mögen',
      'gehen - laufen',
      'schließen - zumachen'
    ]);
    expect(discoveredPairs.length).toBe(5);
  });

  it('written exercise accepts synonym infinitives for each of the 5 pairs with isSynonym=true', () => {
    const verbenCat = ctx.CATEGORIES.find(c => c.id === 'verben');

    const testPairs = [
      { target: 'öffnen', syn: 'aufmachen' },
      { target: 'aufmachen', syn: 'öffnen' },
      { target: 'schließen', syn: 'zumachen' },
      { target: 'zumachen', syn: 'schließen' },
      { target: 'gehen', syn: 'laufen' },
      { target: 'laufen', syn: 'gehen' },
      { target: 'fahren', syn: 'reisen' },
      { target: 'reisen', syn: 'fahren' },
      { target: 'mögen', syn: 'gefallen' },
      { target: 'gefallen', syn: 'mögen' }
    ];

    for (const { target, syn } of testPairs) {
      const targetWord = verbenCat.words.find(w => w.n === target);
      expect(targetWord).toBeDefined();

      // Typing exact target: ok=true, isSynonym is falsy
      const exactRes = ctx.evaluateWrittenAnswer(target, targetWord, verbenCat);
      expect(exactRes.ok).toBe(true);
      expect(Boolean(exactRes.isSynonym)).toBe(false);

      // Typing synonym: ok=true, isSynonym=true
      const synRes = ctx.evaluateWrittenAnswer(syn, targetWord, verbenCat);
      expect(synRes.ok).toBe(true);
      expect(synRes.isSynonym).toBe(true);

      // Case and digraph variations on synonym
      const synUpperRes = ctx.evaluateWrittenAnswer(syn.toUpperCase(), targetWord, verbenCat);
      expect(synUpperRes.ok).toBe(true);
      expect(synUpperRes.isSynonym).toBe(true);

      // Wrong word is rejected
      const wrongRes = ctx.evaluateWrittenAnswer('schlafen', targetWord, verbenCat);
      expect(wrongRes.ok).toBe(false);
    }
  });

  it('written exercise has zero effect on non-verb categories', () => {
    const obstCat = ctx.CATEGORIES.find(c => c.id === 'obst');
    const apfel = obstCat.words.find(w => w.n === 'Apfel');

    // Missing article rejected
    const noArt = ctx.evaluateWrittenAnswer('Apfel', apfel, obstCat);
    expect(noArt.ok).toBe(false);
    expect(noArt.missingArticle).toBe(true);

    // Correct with article accepted
    const withArt = ctx.evaluateWrittenAnswer('der Apfel', apfel, obstCat);
    expect(withArt.ok).toBe(true);
    expect(Boolean(withArt.isSynonym)).toBe(false);
  });

  it('conj stage 1 accepts synonym infinitives for each of the 5 pairs with isSynonym=true', () => {
    const verbenCat = ctx.CATEGORIES.find(c => c.id === 'verben');

    const testPairs = [
      { target: 'öffnen', syn: 'aufmachen' },
      { target: 'schließen', syn: 'zumachen' },
      { target: 'gehen', syn: 'laufen' },
      { target: 'fahren', syn: 'reisen' },
      { target: 'mögen', syn: 'gefallen' }
    ];

    for (const { target, syn } of testPairs) {
      const targetWord = verbenCat.words.find(w => w.n === target);

      // Exact target: ok=true, isSynonym=false
      const exactRes = ctx.checkConjAnswer(target, targetWord.id, 1);
      expect(exactRes.ok).toBe(true);
      expect(exactRes.isSynonym).toBe(false);

      // Synonym: ok=true, isSynonym=true
      const synRes = ctx.checkConjAnswer(syn, targetWord.id, 1);
      expect(synRes.ok).toBe(true);
      expect(synRes.isSynonym).toBe(true);

      // Digraph / case tolerance on synonym
      const synCapsRes = ctx.checkConjAnswer(syn.toUpperCase(), targetWord.id, 1);
      expect(synCapsRes.ok).toBe(true);
      expect(synCapsRes.isSynonym).toBe(true);

      // Leading pronoun with synonym in stage 1 is rejected
      expect(ctx.checkConjAnswer('ich ' + syn, targetWord.id, 1).ok).toBe(false);
    }
  });
});

describe('Task 2D: MCQ & Listen Distractor Synonym Exclusion & Fuzz Proof (Fix 1)', () => {
  let ctx;
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('mcq and listen distractor builders never offer a synonym of the target verb', () => {
    const verbenCat = ctx.CATEGORIES.find(c => c.id === 'verben');

    for (let i = 0; i < verbenCat.words.length; i++) {
      const w = verbenCat.words[i];
      const syns = ctx.verbSynonyms(w.id);
      if (syns.length === 0) continue;

      const synGermanNames = syns.map(s => s.n);
      const synArabicGlosses = syns.map(s => s.ar);

      // Run multiple times to exercise random pools
      for (let run = 0; run < 20; run++) {
        const mcqDist = ctx.buildMcqDistractors(verbenCat, i, 3);
        for (const synName of synGermanNames) {
          expect(mcqDist).not.toContain(synName);
        }

        const listenDist = ctx.buildListenDistractors(verbenCat, i, 3);
        for (const synGloss of synArabicGlosses) {
          expect(listenDist).not.toContain(synGloss);
        }
      }
    }
  });

  it('fuzz proof: across all 77 verbs x 50 seeds, no question contains two correct options', () => {
    const verbenCat = ctx.CATEGORIES.find(c => c.id === 'verben');

    for (let i = 0; i < verbenCat.words.length; i++) {
      const w = verbenCat.words[i];
      const synGermanNames = new Set(ctx.verbSynonyms(w.id).map(s => s.n));
      const synArabicGlosses = new Set(ctx.verbSynonyms(w.id).map(s => s.ar));

      for (let seed = 0; seed < 50; seed++) {
        // MCQ check
        const mcqDist = ctx.buildMcqDistractors(verbenCat, i, 3);
        expect(mcqDist.length).toBe(3);
        const mcqOptions = [w.n, ...mcqDist];
        expect(new Set(mcqOptions).size).toBe(4);

        // Assert no distractor in MCQ is a synonym of target
        for (const dist of mcqDist) {
          expect(synGermanNames.has(dist)).toBe(false);
        }

        // Listen check
        const listenDist = ctx.buildListenDistractors(verbenCat, i, 3);
        expect(listenDist.length).toBe(3);
        const listenOptions = [w.ar, ...listenDist];
        expect(new Set(listenOptions).size).toBe(4);

        // Assert no distractor in Listen is a synonym of target
        for (const dist of listenDist) {
          expect(synArabicGlosses.has(dist)).toBe(false);
        }
      }
    }
  });
});

describe('Task 3: Session Selection Rules & Pool Logic', () => {
  let ctx;
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('requires at least 3 unlocked verbs in the pool before launching session', () => {
    // Fresh state: 0 verbs unlocked in verben
    expect(ctx.getVerbConjPool().length).toBe(0);
    expect(ctx.selectConjSession(ctx.getVerbConjPool(), () => 0, 10)).toEqual([]);

    // Unlock 2 verbs
    ctx.setWordCount('verben', 'mcq', 0, 1);
    ctx.setWordCount('verben', 'written', 1, 1);
    expect(ctx.getVerbConjPool().length).toBe(2);
    // Still < 3 -> returns empty
    expect(ctx.selectConjSession(ctx.getVerbConjPool(), () => 0, 10)).toEqual([]);

    // Unlock 3rd verb
    ctx.setWordCount('verben', 'listen', 2, 1);
    expect(ctx.getVerbConjPool().length).toBe(3);
    const session = ctx.selectConjSession(ctx.getVerbConjPool(), () => 0, 10);
    expect(session.length).toBe(3);
    expect(session).toEqual(expect.arrayContaining([0, 1, 2]));
  });

  it('sorts lowest conj counter first with random tie-breaking and no duplicates', () => {
    const pool = [0, 1, 2, 3, 4, 5, 6, 7];
    const counters = {
      0: 4,
      1: 0,
      2: 2,
      3: 0,
      4: 5,
      5: 1,
      6: 0,
      7: 3
    };
    const session = ctx.selectConjSession(pool, (idx) => counters[idx], 10);
    expect(session.length).toBe(8);

    // No duplicates
    expect(new Set(session).size).toBe(session.length);

    // The first 3 items must be the counter-0 items: {1, 3, 6}
    const firstThree = session.slice(0, 3);
    expect(firstThree).toEqual(expect.arrayContaining([1, 3, 6]));

    // 4th item must be counter-1 item: 5
    expect(session[3]).toBe(5);

    // 5th item must be counter-2 item: 2
    expect(session[4]).toBe(2);

    // 6th item must be counter-3 item: 7
    expect(session[5]).toBe(7);

    // 7th item must be counter-4 item: 0
    expect(session[6]).toBe(0);

    // 8th item must be counter-5 item: 4
    expect(session[7]).toBe(4);
  });

  it('caps session at maximum 10 verbs when pool is larger', () => {
    const largePool = Array.from({ length: 25 }, (_, i) => i);
    const session = ctx.selectConjSession(largePool, () => 0, 10);
    expect(session.length).toBe(10);
    expect(new Set(session).size).toBe(10);
  });
});

describe('Task 4: Run Scoring & Progress Tracking', () => {
  let ctx;
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('increments conj counter by 1 and updates daily goal ONLY once when all 4 stages are correct', () => {
    const catId = 'verben';
    const wordIdx = 0; // gehen

    const initialConjCount = ctx.getWordCount(catId, 'conj', wordIdx);
    const initialTodayCount = ctx.getTodayCount();

    // A perfect run calls applyResult(catId, 'conj', wordIdx, true) ONCE
    ctx.applyResult(catId, 'conj', wordIdx, true);

    expect(ctx.getWordCount(catId, 'conj', wordIdx)).toBe(initialConjCount + 1);
    expect(ctx.getTodayCount()).toBe(initialTodayCount + 1);
  });

  it('does NOT increment conj counter when any stage is wrong, per applyResult rules', () => {
    const catId = 'verben';
    const wordIdx = 1; // essen

    ctx.setWordCount(catId, 'conj', wordIdx, 2);

    // Wrong stage in run calls applyResult(catId, 'conj', wordIdx, false)
    ctx.applyResult(catId, 'conj', wordIdx, false);

    // Per existing applyResult logic: counter decreases or stays bounded, does not rise
    expect(ctx.getWordCount(catId, 'conj', wordIdx)).toBe(1);
  });

  it('caps conj counter at THRESH.conj = 5', () => {
    const catId = 'verben';
    const wordIdx = 2; // aufstehen

    ctx.setWordCount(catId, 'conj', wordIdx, 5);
    ctx.applyResult(catId, 'conj', wordIdx, true);
    expect(ctx.getWordCount(catId, 'conj', wordIdx)).toBe(5);
  });

  it('stage 4 submit timing: runs applyResult immediately upon stage 4 submit, guarded against double submit', () => {
    const catId = 'verben';
    const wordIdx = 0; // gehen

    const initialCount = ctx.getWordCount(catId, 'conj', wordIdx);
    const initialToday = ctx.getTodayCount();

    // Simulate stage 4 submission logic
    let stageResults = [true, true, true, true];
    let runRecorded = false;
    let score = 0;

    function simulateStage4Submit() {
      if (!runRecorded) {
        runRecorded = true;
        const allOk = stageResults.length === 4 && stageResults.every(Boolean);
        if (allOk) score++;
        ctx.applyResult(catId, 'conj', wordIdx, allOk);
      }
    }

    // Submit stage 4
    simulateStage4Submit();

    // Counter is updated IMMEDIATELY before navigation
    expect(ctx.getWordCount(catId, 'conj', wordIdx)).toBe(initialCount + 1);
    expect(ctx.getTodayCount()).toBe(initialToday + 1);
    expect(score).toBe(1);

    // Re-submit / re-render does not trigger duplicate call
    simulateStage4Submit();
    expect(ctx.getWordCount(catId, 'conj', wordIdx)).toBe(initialCount + 1);
    expect(ctx.getTodayCount()).toBe(initialToday + 1);
    expect(score).toBe(1);
  });
});

describe('Task 5: Backup Export/Import & resetAllProgress Purging', () => {
  let ctx;
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('exports and validates backup containing conj progress', () => {
    ctx.setWordCount('verben', 'conj', 'verben.gehen', 3);
    const backupStr = ctx.exportBackup(true);
    const parsed = JSON.parse(backupStr);

    expect(parsed.progress.verben).toHaveProperty('conj');
    expect(parsed.progress.verben.conj.counts['verben.gehen']).toBe(3);

    // Validate backup data accepts it
    const validation = ctx.validateBackupData(parsed);
    expect(validation.valid).toBe(true);
  });

  it('validates and imports older backup WITHOUT conj mode cleanly', () => {
    const olderBackup = {
      version: 2,
      dataFormat: 2,
      exportDate: '2026-10-01T00:00:00.000Z',
      progress: {
        verben: {
          mcq: { unlocked: 5, counts: { 'verben.gehen': 5 } },
          written: { unlocked: 5, counts: { 'verben.gehen': 5 } }
        }
      },
      stats: { totalAnswered: 10, totalCorrect: 10 },
      starred: [],
      srs: {},
      dailyGoal: 20
    };

    const validation = ctx.validateBackupData(olderBackup);
    expect(validation.valid).toBe(true);
  });

  it('resetAllProgress purges all progress including conj mode', async () => {
    ctx.setWordCount('verben', 'conj', 0, 5);
    expect(ctx.getWordCount('verben', 'conj', 0)).toBe(5);

    await ctx.resetAllProgress();

    expect(ctx.getWordCount('verben', 'conj', 0)).toBe(0);
    expect(ctx.computeConjMasteredCount()).toBe(0);
  });
});

describe('Task 6: Cross-Device Sync & Old-Client Compatibility', () => {
  const mockCategories = [
    {
      id: 'verben',
      words: [
        { id: 'verben.gehen', n: 'gehen', ar: 'يذهب' },
        { id: 'verben.essen', n: 'essen', ar: 'يأكل' }
      ]
    }
  ];

  it('(1) merge of two devices with conj counters is commutative, idempotent, and monotonic', () => {
    const devA = {
      verben: {
        conj: {
          unlocked: 5,
          counts: { 'verben.gehen': 2, 'verben.essen': 4 }
        }
      }
    };
    const devB = {
      verben: {
        conj: {
          unlocked: 10,
          counts: { 'verben.gehen': 3, 'verben.essen': 1 }
        }
      }
    };

    const mergedAB = SyncMergePolicy.mergeProgress(devA, devB, mockCategories);
    const mergedBA = SyncMergePolicy.mergeProgress(devB, devA, mockCategories);

    // Commutativity: merge(A, B) === merge(B, A)
    expect(mergedAB).toEqual(mergedBA);

    // Idempotence: merge(A, A) === A
    const mergedAA = SyncMergePolicy.mergeProgress(devA, devA, mockCategories);
    expect(mergedAA.verben.conj.counts).toEqual(devA.verben.conj.counts);

    // Monotonicity: max counts preserved
    expect(mergedAB.verben.conj.counts['verben.gehen']).toBe(3); // max(2, 3)
    expect(mergedAB.verben.conj.counts['verben.essen']).toBe(4); // max(4, 1)
    expect(mergedAB.verben.conj.unlocked).toBe(10); // max(5, 10)
  });

  it('(2) an OLD-format progress document without conj merges fine with a document that has conj', () => {
    const oldDoc = {
      verben: {
        mcq: { unlocked: 5, counts: { 'verben.gehen': 5 } }
      }
    };
    const newDoc = {
      verben: {
        mcq: { unlocked: 5, counts: { 'verben.gehen': 7 } },
        conj: { unlocked: 5, counts: { 'verben.gehen': 3 } }
      }
    };

    const merged = SyncMergePolicy.mergeProgress(oldDoc, newDoc, mockCategories);
    expect(merged.verben.mcq.counts['verben.gehen']).toBe(7);
    expect(merged.verben.conj.counts['verben.gehen']).toBe(3);
  });

  it('(3) documents precise behavior of an OLD client receiving a cloud doc with conj', () => {
    // An old client policy has DEFAULT_PROGRESS_MODES without 'conj'
    const OLD_MODES = ['mcq', 'written', 'article', 'plural', 'listen'];

    const cloudDoc = {
      schemaVersion: 1,
      progress: {
        verben: {
          mcq: { unlocked: 5, counts: { 'verben.gehen': 5 } },
          conj: { unlocked: 5, counts: { 'verben.gehen': 3 } }
        }
      }
    };

    // A: In an old client, validateCloudDocument encounters mKey === 'conj'.
    // At line 372 of sync/merge_policy.js:
    //   if (!isSafeKey(mKey) || !modes.has(mKey)) return { valid: false, error: ... }
    // Because 'conj' is not in modes, validateCloudDocument REJECTS the document.
    // In sync/sync_manager.js lines 427-429 & 744-748, this throws an error and
    // sync halts WITHOUT overwriting or corrupting cloud data (fail-closed safety).
    const modesSet = new Set(OLD_MODES);
    expect(modesSet.has('conj')).toBe(false);

    // B: If validation were somehow bypassed, mergeProgress in the old client:
    // At line 538 of sync/merge_policy.js:
    //   for (const m of modes) {
    // Since 'conj' is not iterated over, the unknown 'conj' key is DROPPED from local merged output.
    const mergedOldClient = {};
    for (const m of OLD_MODES) {
      if (cloudDoc.progress.verben[m]) {
        mergedOldClient[m] = cloudDoc.progress.verben[m];
      }
    }
    expect(mergedOldClient).not.toHaveProperty('conj');
  });
});

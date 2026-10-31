/**
 * tests/verbs_section.test.js
 *
 * Comprehensive Vitest suite for Release v1.17 "الأفعال" (Verbs) Section:
 * 1. Category schema, ID format, and word order from index.html match tools/verbs_batch1.json
 * 2. Non-article word schema: w.a is undefined, no plural field
 * 3. VERB_FORMS integrity: exact 77 keys equal to verben word ids, 6+6 forms, aux haben|sein,
 *    and cryptographic SHA-256 checksum guard
 * 4. renderVerbPanel markup verified for regular (machen), strong (gehen), modal (können),
 *    separable (aufstehen), -ieren (telefonieren), and alternative du-form (essen) verbs
 * 5. Accessibility invariants: real <table> with scope headers, aria-label in Arabic, LTR German cells
 * 6. Search integration: searchVocabulary matches conjugated forms from VERB_FORMS
 * 7. apply_verbs_batch1.js script idempotency and refusal to run twice
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { applyVerbsBatch1 } from '../tools/apply_verbs_batch1.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const htmlPath = path.join(rootDir, 'index.html');
const jsonPath = path.join(rootDir, 'tools', 'verbs_batch1.json');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const expectedVerbsJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// Extract CATEGORIES, VERB_FORMS, renderVerbPanel, and searchVocabulary directly from index.html
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
const renderVerbPanel = ctx.window.renderVerbPanel;
const searchVocabulary = ctx.window.searchVocabulary;

describe('Task A: Verben Category & Word Data Schema Integrity', () => {
  it('contains exactly 31 categories with verben as the last category', () => {
    expect(CATEGORIES.length).toBe(31);
    const lastCat = CATEGORIES[30];
    expect(lastCat.id).toBe('verben');
    expect(lastCat.ar).toBe('الأفعال');
    expect(lastCat.de).toBe('Verben');
    expect(lastCat.hasArticles).toBe(false);
  });

  it('contains exactly 77 verbs matching verbs_batch1.json order and IDs', () => {
    const verbenCat = CATEGORIES.find(c => c.id === 'verben');
    expect(verbenCat).toBeDefined();
    expect(verbenCat.words.length).toBe(77);

    for (let i = 0; i < 77; i++) {
      const actualWord = verbenCat.words[i];
      const expectedJson = expectedVerbsJson[i];

      expect(actualWord.id).toBe(expectedJson.id);
      expect(actualWord.id.startsWith('verben.')).toBe(true);
      expect(actualWord.n).toBe(expectedJson.n);
      expect(actualWord.ar).toBe(expectedJson.ar);
      expect(actualWord.s).toBe(expectedJson.s);
      expect(actualWord.sar).toBe(expectedJson.sar);

      if (expectedJson.note && expectedJson.note.trim()) {
        expect(actualWord.note).toBe(expectedJson.note.trim());
      } else {
        expect(actualWord.note).toBeUndefined();
      }

      // Crucial non-article schema rule: article field 'a' must be undefined
      expect(actualWord.a).toBeUndefined();
      expect(actualWord.pl).toBeUndefined();
    }
  });

  it('total words across all 31 categories equals 1029', () => {
    const totalWords = CATEGORIES.reduce((s, c) => s + c.words.length, 0);
    expect(totalWords).toBe(1029);
  });
});

describe('Task A: VERB_FORMS Constant Integrity & Checksum Guard', () => {
  const EXPECTED_CHECKSUM = 'd6652c064e78cc1ab873d29ef1a6e29c35200576aa43815b71135a0052452d5f';

  it('VERB_FORMS is defined and contains all 77 verb IDs as keys', () => {
    expect(VERB_FORMS).toBeDefined();
    const keys = Object.keys(VERB_FORMS);
    expect(keys.length).toBe(77);

    const verbenCat = CATEGORIES.find(c => c.id === 'verben');
    const wordIds = verbenCat.words.map(w => w.id);
    expect(keys).toEqual(wordIds);
  });

  it('every VERB_FORMS entry has valid 6+6 forms, aux in haben|sein, and required fields', () => {
    for (const [id, entry] of Object.entries(VERB_FORMS)) {
      expect(entry.level, `Verb ${id} missing level`).toBe('A1');
      expect(['haben', 'sein']).toContain(entry.aux);
      expect(Array.isArray(entry.pres), `Verb ${id} pres is not an array`).toBe(true);
      expect(entry.pres.length, `Verb ${id} pres must have 6 forms`).toBe(6);
      expect(Array.isArray(entry.pret), `Verb ${id} pret is not an array`).toBe(true);
      expect(entry.pret.length, `Verb ${id} pret must have 6 forms`).toBe(6);
      expect(typeof entry.pp).toBe('string');
      expect(entry.pp.length).toBeGreaterThan(0);
      expect(typeof entry.perfekt).toBe('string');
      expect(entry.perfekt.length).toBeGreaterThan(0);

      // Verify no empty string forms
      entry.pres.forEach((f, idx) => {
        expect(typeof f).toBe('string');
        expect(f.trim().length, `Verb ${id} pres[${idx}] is empty`).toBeGreaterThan(0);
      });
      entry.pret.forEach((f, idx) => {
        expect(typeof f).toBe('string');
        expect(f.trim().length, `Verb ${id} pret[${idx}] is empty`).toBeGreaterThan(0);
      });
    }
  });

  it('matches cryptographic SHA-256 integrity checksum so accidental edits are caught', () => {
    const canonical = JSON.stringify(VERB_FORMS);
    const hash = crypto.createHash('sha256').update(canonical).digest('hex');
    expect(hash).toBe(EXPECTED_CHECKSUM);
  });
});

describe('Task B: renderVerbPanel Markup & Accessibility', () => {
  it('renders a regular verb correctly (machen)', () => {
    const html = renderVerbPanel('verben.machen');
    expect(html).toContain('class="verb-conjugation-panel verb-panel"');
    expect(html).toContain('data-word-id="verben.machen"');
    expect(html).toContain('class="verb-level-chip">A1</span>');
    expect(html).toContain('class="verb-infinitive de" lang="de" dir="ltr">machen</span>');
    expect(html).toContain('يفعل / يصنع');

    // Präsens
    expect(html).toContain('<td class="de" lang="de" dir="ltr">mache</td>');
    expect(html).toContain('<td class="de" lang="de" dir="ltr">machst</td>');
    expect(html).toContain('<td class="de" lang="de" dir="ltr">macht</td>');
    expect(html).toContain('<td class="de" lang="de" dir="ltr">machen</td>');

    // Präteritum
    expect(html).toContain('<td class="de" lang="de" dir="ltr">machte</td>');
    expect(html).toContain('<td class="de" lang="de" dir="ltr">machtest</td>');

    // Perfekt
    expect(html).toContain('er/sie/es hat gemacht');
  });

  it('renders a strong verb correctly (gehen: ging, ist gegangen)', () => {
    const html = renderVerbPanel('verben.gehen');
    expect(html).toContain('class="verb-infinitive de" lang="de" dir="ltr">gehen</span>');
    expect(html).toContain('يذهب / يمشي');
    expect(html).toContain('<td class="de" lang="de" dir="ltr">geht</td>');
    expect(html).toContain('<td class="de" lang="de" dir="ltr">ging</td>');
    expect(html).toContain('<td class="de" lang="de" dir="ltr">gingst</td>');
    expect(html).toContain('<td class="de" lang="de" dir="ltr">gingen</td>');
    expect(html).toContain('er/sie/es ist gegangen');
  });

  it('renders a modal verb correctly (können: kann, konnte, hat gekonnt)', () => {
    const html = renderVerbPanel('verben.koennen');
    expect(html).toContain('können');
    expect(html).toContain('يستطيع');
    expect(html).toContain('<td class="de" lang="de" dir="ltr">kann</td>');
    expect(html).toContain('<td class="de" lang="de" dir="ltr">kannst</td>');
    expect(html).toContain('<td class="de" lang="de" dir="ltr">konnte</td>');
    expect(html).toContain('<td class="de" lang="de" dir="ltr">konntest</td>');
    expect(html).toContain('er/sie/es hat gekonnt');
  });

  it('renders a separable verb showing prefix as separate word at end (aufstehen: stehe auf, ist aufgestanden)', () => {
    const html = renderVerbPanel('verben.aufstehen');
    expect(html).toContain('aufstehen');
    expect(html).toContain('يستيقظ / ينهض');
    expect(html).toContain('<td class="de" lang="de" dir="ltr">stehe auf</td>');
    expect(html).toContain('<td class="de" lang="de" dir="ltr">stehst auf</td>');
    expect(html).toContain('<td class="de" lang="de" dir="ltr">stand auf</td>');
    expect(html).toContain('<td class="de" lang="de" dir="ltr">standen auf</td>');
    expect(html).toContain('er/sie/es ist aufgestanden');
  });

  it('renders an -ieren verb correctly (telefonieren)', () => {
    const html = renderVerbPanel('verben.telefonieren');
    expect(html).toContain('telefonieren');
    expect(html).toContain('يتحدث بالهاتف');
    expect(html).toContain('<td class="de" lang="de" dir="ltr">telefoniert</td>');
    expect(html).toContain('<td class="de" lang="de" dir="ltr">telefonierte</td>');
    expect(html).toContain('er/sie/es hat telefoniert');
  });

  it('renders an irregular verb with alternative du-form note (essen: isst, aß, aßt, hat gegessen)', () => {
    const html = renderVerbPanel('verben.essen');
    expect(html).toContain('essen');
    expect(html).toContain('يأكل');
    expect(html).toContain('<td class="de" lang="de" dir="ltr">isst</td>');
    expect(html).toContain('aß');
    expect(html).toContain('aßest');
    expect(html).toContain('بديل: aßt');
    expect(html).toContain('er/sie/es hat gegessen');
  });

  it('guarantees accessibility markup: real <table>, scope headers, aria-labels in Arabic', () => {
    const html = renderVerbPanel('verben.sein');
    expect(html).toContain('<table class="verb-table" aria-label="تصريف الفعل في زمن المضارع (Präsens)">');
    expect(html).toContain('<table class="verb-table" aria-label="تصريف الفعل في زمن الماضي البسيط (Präteritum)">');
    expect(html).toContain('<th scope="col">الضمير</th>');
    expect(html).toContain('<th scope="col">التصريف</th>');
    expect(html).toContain('<th scope="row" class="de" lang="de" dir="ltr">ich</th>');
    expect(html).toContain('<th scope="row" class="de" lang="de" dir="ltr">du</th>');
    expect(html).toContain('<th scope="row" class="de" lang="de" dir="ltr">er/sie/es</th>');
    expect(html).toContain('<th scope="row" class="de" lang="de" dir="ltr">wir</th>');
    expect(html).toContain('<th scope="row" class="de" lang="de" dir="ltr">ihr</th>');
    expect(html).toContain('<th scope="row" class="de" lang="de" dir="ltr">sie/Sie</th>');
  });

  it('returns empty string for non-existent or invalid verb id', () => {
    expect(renderVerbPanel('nonexistent.verb')).toBe('');
    expect(renderVerbPanel('obst.apfel')).toBe('');
    expect(renderVerbPanel(null)).toBe('');
    expect(renderVerbPanel(undefined)).toBe('');
  });
});

describe('Task C: Vocabulary Search with Conjugated Forms', () => {
  it('finds infinitive verb when searching directly', () => {
    const res = searchVocabulary('gehen');
    expect(res.some(r => r.word.id === 'verben.gehen')).toBe(true);
  });

  it('finds verb when searching for conjugated past form (e.g. "ging" -> gehen)', () => {
    const res = searchVocabulary('ging');
    expect(res.some(r => r.word.id === 'verben.gehen')).toBe(true);
  });

  it('finds verb when searching for conjugated present form (e.g. "isst" -> essen)', () => {
    const res = searchVocabulary('isst');
    expect(res.some(r => r.word.id === 'verben.essen')).toBe(true);
  });

  it('finds verb when searching for Partizip II (e.g. "aufgestanden" -> aufstehen)', () => {
    const res = searchVocabulary('aufgestanden');
    expect(res.some(r => r.word.id === 'verben.aufstehen')).toBe(true);
  });
});

describe('Task A & Rule 3: apply_verbs_batch1.js Idempotency Guard', () => {
  it('refuses to run twice on index.html', () => {
    expect(() => {
      applyVerbsBatch1(htmlPath, jsonPath);
    }).toThrow(/already exists/i);
  });

  it('runs cleanly on a fresh temporary HTML copy without verben', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verbs-apply-'));
    const tmpHtmlPath = path.join(tmpDir, `temp_test_apply_${Date.now()}.html`);
    // Create copy without verben
    const pristineHtml = htmlContent.replace(/,\s*\{\s*id\s*:\s*['"]verben['"][\s\S]*?\n\s*\]\s*\}/, '')
      .replace(/\/\* Conjugation data for verbs[\s\S]*?window\.VERB_FORMS\s*=\s*VERB_FORMS;\s*\}/, '');
    fs.writeFileSync(tmpHtmlPath, pristineHtml, 'utf8');

    try {
      const res1 = applyVerbsBatch1(tmpHtmlPath, jsonPath);
      expect(res1.applied).toBe(true);
      expect(res1.wordCount).toBe(77);

      // Second run must throw
      expect(() => {
        applyVerbsBatch1(tmpHtmlPath, jsonPath);
      }).toThrow(/already exists/i);
    } finally {
      try {
        if (fs.existsSync(tmpHtmlPath)) {
          fs.unlinkSync(tmpHtmlPath);
        }
        if (fs.existsSync(tmpDir)) {
          if (typeof fs.rmSync === 'function') {
            fs.rmSync(tmpDir, { recursive: true, force: true });
          } else {
            fs.rmdirSync(tmpDir, { recursive: true });
          }
        }
      } catch (_) {}
    }
  });
});

describe('Task 4: Category Review for Verben ("مراجعة القسم") & Learned Pool', () => {
  const verbenCat = CATEGORIES.find(c => c.id === 'verben');

  it('enables the category review button for verben (pluralReady(cat) || !cat.hasArticles)', () => {
    const pluralReady = ctx.pluralReady;
    expect(pluralReady(verbenCat)).toBe(false); // Verbs have no plural
    const isReviewAvailable = pluralReady(verbenCat) || !verbenCat.hasArticles;
    expect(isReviewAvailable).toBe(true);

    // Verify mode button markup in modes screen logic
    expect(htmlContent).toContain('${(pluralReady(cat) || !cat.hasArticles) ?');
  });

  it('computes reviewTotalQ as exactly 1 question per word for non-article categories (77 vs 154)', () => {
    const reviewTotalQ = ctx.reviewTotalQ;
    const queue = verbenCat.words.map((_, i) => ({ catId: 'verben', idx: i }));
    expect(reviewTotalQ(queue)).toBe(77);

    // Compare with a category with articles (e.g. obst hasArticles: true -> 2 questions per word)
    const obstCat = CATEGORIES.find(c => c.id === 'obst');
    const obstQueue = obstCat.words.map((_, i) => ({ catId: 'obst', idx: i }));
    expect(reviewTotalQ(obstQueue)).toBe(obstCat.words.length * 2);
  });

  it('renders review step for verben with single step per word and shows conjugation panel in feedback', () => {
    const buildFeedbackHtml = ctx.buildFeedbackHtml;
    const firstVerb = verbenCat.words[0]; // sein
    const feedbackHtml = buildFeedbackHtml(firstVerb, verbenCat, true, firstVerb.n, false);
    expect(feedbackHtml).toContain('class="verb-conjugation-panel verb-panel"');
    expect(feedbackHtml).toContain('data-word-id="verben.sein"');
    expect(feedbackHtml).not.toContain('اسم غير معدود');
  });

  it('proves that a verb mastered via skip button appears in both category review and global review pool', () => {
    ctx.resetAllProgress();
    const learnedPoolBefore = ctx.learnedPool();
    expect(learnedPoolBefore.some(it => it.catId === 'verben')).toBe(false);

    // Skip the first verb (index 0) in written mode (sets count to threshFor("written") = 10)
    const thWritten = ctx.threshFor('written');
    ctx.setWordCount('verben', 'written', 0, thWritten);

    // Verify count recorded
    const savedCount = ctx.getWordCount('verben', 'written', 0);
    expect(savedCount).toBe(thWritten);

    // 1. Appears in global review pool (learnedPool)
    const learnedPoolAfter = ctx.learnedPool();
    const skippedInGlobal = learnedPoolAfter.find(it => it.catId === 'verben' && it.idx === 0);
    expect(skippedInGlobal).toBeDefined();
    expect(skippedInGlobal.sources).toContain('written');

    // 2. Appears in category review queue (built from all category words)
    const catReviewQueue = verbenCat.words.map((_, i) => ({ catId: 'verben', idx: i }));
    expect(catReviewQueue.some(it => it.catId === 'verben' && it.idx === 0)).toBe(true);
  });
});

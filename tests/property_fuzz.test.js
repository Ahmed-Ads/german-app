import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractFunction } from './extract_written.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.resolve(__dirname, '../index.html');
const html = fs.readFileSync(indexPath, 'utf8');

const categories = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../vocab_baseline.json'), 'utf8'));

// Extract REAL functions from index.html (no copies)
const shuffleCode = extractFunction(html, 'shuffle');
const pluralDistCode = extractFunction(html, 'pluralDistractors');
const mcqDistCode = extractFunction(html, 'buildMcqDistractors');

const shuffle = new Function(`${shuffleCode}\nreturn shuffle;`)();
const pluralDistractors = new Function('CATEGORIES', 'shuffle', `${pluralDistCode}\nreturn pluralDistractors;`)(categories, shuffle);
const buildMcqDistractors = new Function('CATEGORIES', 'shuffle', `${mcqDistCode}\nreturn buildMcqDistractors;`)(categories, shuffle);

// Seeded PRNG for reproducible fuzzing
function createSeededRandom(seed) {
  let s = seed + 1;
  return function() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe('Property & Fuzz Testing with Real Helpers from index.html', () => {
  it('fuzz tests all 1160 words × 20 seeds for MCQ invariant correctness', () => {
    let testedCount = 0;
    for (const cat of categories) {
      for (let idx = 0; idx < cat.words.length; idx++) {
        const w = cat.words[idx];
        const targetGloss = (w.ar || '').trim();
        testedCount++;

        for (let seed = 0; seed < 20; seed++) {
          const prng = createSeededRandom(seed);
          const origRandom = Math.random;
          let correctText, distractors, options;
          try {
            Math.random = prng;
            correctText = cat.hasArticles && w.a ? `${w.a} ${w.n}` : w.n;
            distractors = buildMcqDistractors(cat, idx, 3);
            options = shuffle([correctText, ...distractors]);
          } finally {
            Math.random = origRandom;
          }

          // Invariant 1: Exactly 4 options
          expect(options.length, `[${cat.id}:${w.n}:seed${seed}] expected 4 options`).toBe(4);

          // Invariant 2: All displayed texts unique (no duplicate options)
          expect(new Set(options).size, `[${cat.id}:${w.n}:seed${seed}] duplicate option texts: ${JSON.stringify(options)}`).toBe(4);

          // Invariant 3: Exactly one option equals correct text
          const correctMatches = options.filter(o => o === correctText);
          expect(correctMatches.length, `[${cat.id}:${w.n}:seed${seed}] correct option match count != 1`).toBe(1);

          // Invariant 4: No distractor shares the question word's trimmed Arabic gloss
          for (const dist of distractors) {
            const sharesGloss = (cat.words || []).some(d => {
              const dt = cat.hasArticles && d.a ? `${d.a} ${d.n}` : d.n;
              return dt === dist && (d.ar || '').trim() === targetGloss;
            });
            expect(sharesGloss, `[${cat.id}:${w.n}:seed${seed}] distractor "${dist}" shares question word Arabic gloss "${targetGloss}"`).toBe(false);

            const crossSharesGloss = categories.some(c => (c.words || []).some(d => {
              const dt = c.hasArticles && d.a ? `${d.a} ${d.n}` : d.n;
              return dt === dist && (d.ar || '').trim() === targetGloss;
            }));
            expect(crossSharesGloss, `[${cat.id}:${w.n}:seed${seed}] distractor "${dist}" cross-category shares question word Arabic gloss "${targetGloss}"`).toBe(false);
          }
        }
      }
    }
    expect(testedCount).toBe(1160);
  }, 30000);

  it('fuzz tests all words in article categories for article correctness', () => {
    const articleCats = categories.filter(c => c.hasArticles);
    let count = 0;
    for (const cat of articleCats) {
      for (const w of cat.words) {
        count++;
        expect(['der', 'die', 'das']).toContain(w.a);
        expect(w.n).toBeDefined();
        expect(w.n.includes('undefined')).toBe(false);
      }
    }
    expect(count).toBeGreaterThan(0);
  });

  it('fuzz tests plural questions with real pluralDistractors for invariant correctness', () => {
    const articleCats = categories.filter(c => c.hasArticles);
    let testedPlurals = 0;
    for (const cat of articleCats) {
      for (const w of cat.words) {
        if (!w.pl) continue;
        testedPlurals++;
        const correct = w.pl;

        for (let seed = 0; seed < 20; seed++) {
          const prng = createSeededRandom(seed);
          const origRandom = Math.random;
          let distractors, options;
          try {
            Math.random = prng;
            distractors = pluralDistractors(w, cat);
            options = shuffle([correct, ...distractors]);
          } finally {
            Math.random = origRandom;
          }

          expect(options.length).toBe(4);
          expect(new Set(options).size).toBe(4);
          expect(options.filter(o => o === correct).length).toBe(1);
          expect(options.every(o => o.startsWith('die '))).toBe(true);
        }
      }
    }
    expect(testedPlurals).toBeGreaterThan(0);
  }, 30000);
});

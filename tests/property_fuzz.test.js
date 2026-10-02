import { describe, it, expect } from 'vitest';
import fs from 'fs';

const categories = JSON.parse(fs.readFileSync('vocab_baseline.json', 'utf8'));

// Helper to shuffle
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Generate MCQ Question
function generateMcqQuestion(cat, idx) {
  const w = cat.words[idx];
  const correctText = cat.hasArticles && w.a ? `${w.a} ${w.n}` : w.n;
  const pool = cat.words.filter((d, i) => i !== idx && d.ar.trim() !== w.ar.trim());
  let distractors = shuffle(pool).slice(0, 3).map(d => cat.hasArticles && d.a ? `${d.a} ${d.n}` : d.n);
  
  // Ensure distractors don't duplicate
  distractors = Array.from(new Set(distractors.filter(d => d !== correctText)));
  if (distractors.length < 3) {
    const others = categories
      .filter(c => c.id !== cat.id && c.hasArticles === cat.hasArticles)
      .flatMap(c => c.words.map(d => cat.hasArticles && d.a ? `${d.a} ${d.n}` : d.n))
      .filter(d => d !== correctText && !distractors.includes(d));
    distractors.push(...shuffle(others).slice(0, 3 - distractors.length));
  }

  const options = shuffle([correctText, ...distractors.slice(0, 3)]);
  return { q: w.ar, correctText, options };
}

// Generate Article Question
function generateArticleQuestion(cat, idx) {
  const w = cat.words[idx];
  const correct = w.a;
  const options = ['der', 'die', 'das'];
  return { q: w.n, correct, options };
}

// Generate Plural Question
function generatePluralQuestion(cat, idx) {
  const w = cat.words[idx];
  if (!w.pl) return null;
  const correct = w.pl;
  const catPlurals = cat.words.filter(cw => cw.pl && cw.pl.trim() !== correct.trim()).map(cw => cw.pl.trim());
  const globalPlurals = categories.filter(c => c.hasArticles).flatMap(c => c.words.filter(cw => cw.pl && cw.pl.trim() !== correct.trim()).map(cw => cw.pl.trim()));
  const pool = Array.from(new Set([...shuffle(catPlurals), ...shuffle(globalPlurals)]));
  const options = shuffle([correct, ...pool.slice(0, 3)]);
  return { q: `${w.a} ${w.n}`, correct, options };
}

describe('Phase 5 Property & Fuzz Testing (10,000 Generations)', () => {
  it('fuzz tests 10,000 MCQ questions for invariant correctness', () => {
    for (let i = 0; i < 10000; i++) {
      const cat = categories[Math.floor(Math.random() * categories.length)];
      const idx = Math.floor(Math.random() * cat.words.length);
      const res = generateMcqQuestion(cat, idx);

      expect(res.q).toBeDefined();
      expect(res.q.includes('undefined')).toBe(false);
      expect(res.q.includes('NaN')).toBe(false);

      expect(res.options.length).toBe(4);
      expect(new Set(res.options).size).toBe(4); // No duplicates
      expect(res.options).toContain(res.correctText); // Correct option present
      const correctMatches = res.options.filter(o => o === res.correctText);
      expect(correctMatches.length).toBe(1); // Exactly one correct option
    }
  });

  it('fuzz tests 10,000 Article questions for invariant correctness', () => {
    const articleCats = categories.filter(c => c.hasArticles);
    for (let i = 0; i < 10000; i++) {
      const cat = articleCats[Math.floor(Math.random() * articleCats.length)];
      const idx = Math.floor(Math.random() * cat.words.length);
      const res = generateArticleQuestion(cat, idx);

      expect(res.q).toBeDefined();
      expect(res.options).toEqual(['der', 'die', 'das']);
      expect(res.options).toContain(res.correct);
      expect(res.correct.includes('undefined')).toBe(false);
    }
  });

  it('fuzz tests 10,000 Plural questions for invariant correctness', () => {
    const articleCats = categories.filter(c => c.hasArticles);
    let count = 0;
    while (count < 10000) {
      const cat = articleCats[Math.floor(Math.random() * articleCats.length)];
      const idx = Math.floor(Math.random() * cat.words.length);
      const res = generatePluralQuestion(cat, idx);
      if (!res) continue; // Skip pl:null

      count++;
      expect(res.options.length).toBe(4);
      expect(new Set(res.options).size).toBe(4); // No duplicates
      expect(res.options).toContain(res.correct); // Correct present
      expect(res.options.every(o => o.startsWith('die '))).toBe(true);
      expect(res.q.includes('undefined')).toBe(false);
    }
  }, 30000);
});

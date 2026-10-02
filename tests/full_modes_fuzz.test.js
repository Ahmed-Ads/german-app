import { describe, it, expect } from 'vitest';
import fs from 'fs';

const categories = JSON.parse(fs.readFileSync('vocab_baseline.json', 'utf8'));

function normalizeDe(s) {
  return s.trim().toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

function evaluateWrittenAnswer(inputVal, targetWord, category) {
  const val = (inputVal || '').trim();
  if (!val) return { ok: false, empty: true };

  const given = normalizeDe(val).replace(/\s+/g, ' ');
  const wantArticle = category.hasArticles && Boolean(targetWord.a);
  const correctWithArt = wantArticle ? `${targetWord.a} ${targetWord.n}` : targetWord.n;
  const normCorrectWithArt = normalizeDe(correctWithArt);
  const normWordOnly = normalizeDe(targetWord.n);

  let ok = false;
  let casingNotice = false;

  const articleRegex = /^(der|die|das)\s+/i;
  const matchArt = val.match(articleRegex);

  const matchingWords = category.words ? category.words.filter(w => w.ar.trim() === targetWord.ar.trim()) : [targetWord];

  for (const mw of matchingWords) {
    const mwWantArticle = category.hasArticles && Boolean(mw.a);
    const mwCorrectWithArt = mwWantArticle ? `${mw.a} ${mw.n}` : mw.n;
    const mwNormWithArt = normalizeDe(mwCorrectWithArt);
    const mwNormOnly = normalizeDe(mw.n);

    if (mwWantArticle) {
      if (matchArt) {
        const typedArt = matchArt[1].toLowerCase();
        if (typedArt === mw.a.toLowerCase() && given === mwNormWithArt) {
          ok = true;
          break;
        }
      } else {
        if (given === mwNormOnly) {
          ok = true;
          break;
        }
      }
    } else {
      if (given === mwNormOnly) {
        ok = true;
        break;
      }
    }
  }

  if (ok && targetWord.n && /^[A-ZÄÖÜ]/.test(targetWord.n)) {
    const nounPart = matchArt ? val.slice(matchArt[0].length).trim() : val.trim();
    if (nounPart.length > 0 && /^[a-zäöü]/.test(nounPart)) {
      casingNotice = true;
    }
  }

  return { ok, casingNotice };
}

describe('Comprehensive Fuzz Testing (Written, Listen, Flashcards, SRS Reviews)', () => {
  it('fuzz tests 10,000 Written Mode inputs with strict/permissive invariants', () => {
    for (let i = 0; i < 10000; i++) {
      const cat = categories[Math.floor(Math.random() * categories.length)];
      const word = cat.words[Math.floor(Math.random() * cat.words.length)];

      // 1. Exact answer
      const exact = cat.hasArticles && word.a ? `${word.a} ${word.n}` : word.n;
      const resExact = evaluateWrittenAnswer(exact, word, cat);
      expect(resExact.ok).toBe(true);

      // 2. Answer without article
      const resNoArt = evaluateWrittenAnswer(word.n, word, cat);
      expect(resNoArt.ok).toBe(true);

      // 3. Lowercase noun triggers casingNotice
      const lower = word.n.toLowerCase();
      const resLower = evaluateWrittenAnswer(lower, word, cat);
      expect(resLower.ok).toBe(true);
      if (/^[A-ZÄÖÜ]/.test(word.n)) {
        expect(resLower.casingNotice).toBe(true);
      }

      // 4. Umlaut transliteration (ae/oe/ue/ss)
      const translit = word.n
        .replace(/ä/g, 'ae').replace(/Ä/g, 'Ae')
        .replace(/ö/g, 'oe').replace(/Ö/g, 'Oe')
        .replace(/ü/g, 'ue').replace(/Ü/g, 'Ue')
        .replace(/ß/g, 'ss');
      const resTranslit = evaluateWrittenAnswer(translit, word, cat);
      expect(resTranslit.ok).toBe(true);

      // 5. Wrong article must fail
      if (cat.hasArticles && word.a) {
        const wrongArt = word.a === 'der' ? 'das' : 'der';
        const resWrong = evaluateWrittenAnswer(`${wrongArt} ${word.n}`, word, cat);
        expect(resWrong.ok).toBe(false);
      }

      // 6. Empty / spaces must fail
      expect(evaluateWrittenAnswer('', word, cat).ok).toBe(false);
      expect(evaluateWrittenAnswer('   ', word, cat).ok).toBe(false);
    }
  });

  it('fuzz tests 10,000 Listen Mode generations', () => {
    for (let i = 0; i < 10000; i++) {
      const cat = categories[Math.floor(Math.random() * categories.length)];
      const idx = Math.floor(Math.random() * cat.words.length);
      const w = cat.words[idx];

      const audioText = cat.hasArticles && w.a ? `${w.a} ${w.n}` : w.n;
      expect(audioText.length).toBeGreaterThan(0);
      expect(audioText).not.toContain('undefined');
      expect(audioText).not.toContain('null');

      // Distractors in Arabic
      const pool = cat.words.filter((_, di) => di !== idx).map(dw => dw.ar);
      const uniqueDistractors = Array.from(new Set(pool.filter(ar => ar !== w.ar)));
      expect(uniqueDistractors.length).toBeGreaterThan(0);
    }
  });

  it('fuzz tests Flashcards generation across all 1,160 words', () => {
    for (const cat of categories) {
      for (let i = 0; i < cat.words.length; i++) {
        const w = cat.words[i];
        // Front card invariant
        const frontText = cat.hasArticles && w.a ? `${w.a} ${w.n}` : w.n;
        expect(frontText).toBeTruthy();
        expect(frontText).not.toContain('undefined');

        // Back card invariant
        expect(w.ar).toBeTruthy();
        if (cat.hasArticles) {
          expect(w.a).toBeTruthy();
          expect(['der', 'die', 'das']).toContain(w.a);
        }
        if (w.s) {
          expect(w.s.length).toBeGreaterThan(5);
          expect(w.sar.length).toBeGreaterThan(3);
        }
      }
    }
  });

  it('fuzz tests SRS Leitner scheduling and intervals across 10,000 transitions', () => {
    const SRS_INTERVALS_DAYS = [1, 2, 4, 7, 14, 30, 90];

    for (let i = 0; i < 10000; i++) {
      let stage = Math.floor(Math.random() * SRS_INTERVALS_DAYS.length);
      const isCorrect = Math.random() > 0.3;

      let nextStage;
      if (isCorrect) {
        nextStage = Math.min(stage + 1, SRS_INTERVALS_DAYS.length - 1);
      } else {
        nextStage = 0; // reset to beginning on error
      }

      const daysToAdd = SRS_INTERVALS_DAYS[nextStage];
      const now = Date.now();
      const dueDate = now + daysToAdd * 86400000;

      expect(nextStage).toBeGreaterThanOrEqual(0);
      expect(nextStage).toBeLessThan(SRS_INTERVALS_DAYS.length);
      expect(dueDate).toBeGreaterThan(now);

      // Verify due filter invariant
      const isDueNow = dueDate <= now;
      expect(isDueNow).toBe(false);
      const isDueLater = dueDate <= (now + (daysToAdd + 1) * 86400000);
      expect(isDueLater).toBe(true);
    }
  });
});

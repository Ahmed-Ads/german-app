import { describe, it, expect } from 'vitest';
import fs from 'fs';

const baseline = JSON.parse(fs.readFileSync('vocab_baseline.json', 'utf8'));

describe('Phase 5 Data Integrity Tests (Permanent CI Guardrails)', () => {
  it('contains exactly 30 categories and 1,160 words', () => {
    expect(baseline.length).toBe(30);
    const totalWords = baseline.reduce((s, c) => s + c.words.length, 0);
    expect(totalWords).toBe(1160);
  });

  it('validates schema: hasArticles consistency and required fields', () => {
    for (const cat of baseline) {
      expect(cat.id).toBeDefined();
      expect(cat.ar).toBeDefined();
      expect(cat.de).toBeDefined();
      expect(typeof cat.hasArticles).toBe('boolean');
      expect(cat.words.length).toBeGreaterThan(0);

      for (let i = 0; i < cat.words.length; i++) {
        const w = cat.words[i];
        expect(w.n).toBeDefined();
        expect(w.ar).toBeDefined();
        expect(w.s).toBeDefined();
        expect(w.sar).toBeDefined();

        if (cat.hasArticles) {
          expect(['der', 'die', 'das']).toContain(w.a);
          if (w.pl !== null && w.pl !== undefined) {
            expect(w.pl.startsWith('die ')).toBe(true);
          }
        } else {
          expect(w.a).toBeUndefined();
        }
      }
    }
  });

  it('verifies unicode integrity: NFC normalized, no zero-width, no Persian/Urdu lookalikes', () => {
    const BAD_UNICODE_REGEX = /[\u200B-\u200F\uFEFF]/;
    const PERSIAN_URDU_REGEX = /[یکە]/;

    for (const cat of baseline) {
      for (const w of cat.words) {
        for (const [key, val] of Object.entries(w)) {
          if (typeof val === 'string') {
            // NFC normalization
            expect(val).toBe(val.normalize('NFC'));
            // Trim check
            expect(val).toBe(val.trim());
            // Double space check
            expect(val.includes('  ')).toBe(false);
            // No invisible zero-width or bidi markers
            expect(BAD_UNICODE_REGEX.test(val)).toBe(false);

            // In Arabic translations and headwords, no Persian/Urdu characters
            if (key === 'ar' || key === 'sar') {
              expect(PERSIAN_URDU_REGEX.test(val)).toBe(false);
            }
          }
        }
      }
    }
  });

  it('checks that all example sentences end with proper punctuation and are non-empty', () => {
    const punctuation = ['.', '!', '?', '؟', '…'];
    for (const cat of baseline) {
      for (const w of cat.words) {
        expect(w.s.length).toBeGreaterThan(5);
        expect(w.sar.length).toBeGreaterThan(5);
        const sLast = w.s.slice(-1);
        const sarLast = w.sar.slice(-1);
        expect(punctuation).toContain(sLast);
        expect(punctuation).toContain(sarLast);
      }
    }
  });
});

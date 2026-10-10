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

  it('enforces script purity: no Arabic characters in German fields, no mixed-script tokens in Arabic fields (M6)', () => {
    const ARABIC_SCRIPT_REGEX = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
    const LATIN_SCRIPT_REGEX = /[A-Za-zÄÖÜäöüß]/;

    // Documented exception rule: Arabic clitic prefixes (e.g. و-, بـ-, كـ-, لـ-, الـ-, كالـ-, للـ-)
    // attached to a Latin word/acronym (such as 'للـWi-Fi' or 'بالـSIM') are permitted.
    const ALLOWED_CLITIC_PREFIX = /^(?:[وبلكف]|ال|كال|لل|فال|بال)[\u200C\-]?[A-Za-zÄÖÜäöüß]+$/;

    for (const cat of baseline) {
      for (let i = 0; i < cat.words.length; i++) {
        const w = cat.words[i];
        const wordId = `${cat.id}_${i}`;

        // 1. German fields (a, n, pl, s) must contain NO Arabic-script characters
        for (const field of ['a', 'n', 'pl', 's']) {
          if (w[field] && typeof w[field] === 'string') {
            const hasArabic = ARABIC_SCRIPT_REGEX.test(w[field]);
            expect(
              hasArabic,
              `German field '${field}' in ${wordId} (${w.n}) contains Arabic characters: "${w[field]}"`
            ).toBe(false);
          }
        }

        // 2. Arabic fields (ar, sar) must contain NO mixed-script tokens (unless allowed clitic prefix)
        for (const field of ['ar', 'sar']) {
          if (w[field] && typeof w[field] === 'string') {
            const tokens = w[field].split(/[\s\.,،؛:!؟\(\)\[\]\"\'«»\-_/]+/);
            for (const token of tokens) {
              if (!token) continue;
              const hasArabic = ARABIC_SCRIPT_REGEX.test(token);
              const hasLatin = LATIN_SCRIPT_REGEX.test(token);
              if (hasArabic && hasLatin) {
                const isAllowedClitic = ALLOWED_CLITIC_PREFIX.test(token);
                expect(
                  isAllowedClitic,
                  `Arabic field '${field}' in ${wordId} contains invalid mixed-script token: "${token}" in "${w[field]}"`
                ).toBe(true);
              }
            }
          }
        }
      }
    }
  });

  it('proves script purity test fails on old simulated berufe_26 sentence and passes after M6 fix', () => {
    const ARABIC_SCRIPT_REGEX = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
    const oldDefectiveSentence = 'Der Tierarzt behandelt den verletzten Hund behutsام.';
    const fixedSentence = 'Der Tierarzt behandelt den verletzten Hund behutsam.';

    // Simulated in memory: old data MUST trigger failure
    const oldHasArabic = ARABIC_SCRIPT_REGEX.test(oldDefectiveSentence);
    expect(oldHasArabic).toBe(true); // Fails assertion: expect(hasArabic).toBe(false) would throw

    // Fixed data MUST pass
    const fixedHasArabic = ARABIC_SCRIPT_REGEX.test(fixedSentence);
    expect(fixedHasArabic).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { extractCategoriesFromHtml } from '../scripts/apply_vocab_changes.js';

describe('Release v1.26 Sentences Deduplication Quality, Structure & Global Uniqueness', () => {
  const rootDir = path.resolve(__dirname, '..');
  const indexHtmlPath = path.join(rootDir, 'index.html');
  const changesPath = path.join(rootDir, 'tools', 'vocab_changes_sentences_dedupe.json');

  const changes = JSON.parse(fs.readFileSync(changesPath, 'utf8'));
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const categories = extractCategoriesFromHtml(html);

  const allWords = [];
  categories.forEach(c => allWords.push(...c.words));
  const wordMap = new Map();
  allWords.forEach(w => wordMap.set(w.id, w));

  const sEdits = changes.edit.filter(e => e.field === 's');
  const sarEdits = changes.edit.filter(e => e.field === 'sar');

  it('contains exactly 2 German sentence edits and 3 Arabic translation edits (5 total)', () => {
    expect(sEdits.length).toBe(2);
    expect(sarEdits.length).toBe(3);
    expect(changes.edit.length).toBe(5);
  });

  it('all 5 edits belong to the 3 target words: tiere.giraffe, schule.buch, verben.spielen', () => {
    const targetWordIds = ['tiere.giraffe', 'schule.buch', 'verben.spielen'];
    for (const e of changes.edit) {
      expect(targetWordIds).toContain(e.id);
    }
  });

  it('all German sentence edits have max 8 whitespace tokens, end with punctuation, and contain noun or plural', () => {
    for (const e of sEdits) {
      const w = wordMap.get(e.id);
      expect(w, `Word ${e.id} must exist in vocabulary`).toBeDefined();

      const text = e.new.trim();
      const tokens = text.split(/\s+/).filter(Boolean);

      // (1) German sentence at most 8 tokens
      expect(
        tokens.length,
        `German sentence for '${e.id}' exceeds 8 tokens (${tokens.length} tokens): "${text}"`
      ).toBeLessThanOrEqual(8);

      // (2) Ends with . ? or !
      expect(
        /[.?!]$/.test(text),
        `German sentence for '${e.id}' must end with . ? or !: "${text}"`
      ).toBe(true);

      // (3) Contains target noun or its plural
      const noun = w.n;
      const plWithoutArticle = w.pl ? w.pl.replace(/^(die|der|das)\s+/i, '').trim() : null;

      const containsNoun = text.toLowerCase().includes(noun.toLowerCase());
      const containsPlural = plWithoutArticle ? text.toLowerCase().includes(plWithoutArticle.toLowerCase()) : false;

      expect(
        containsNoun || containsPlural,
        `German sentence for '${e.id}' must contain noun '${noun}' or plural '${plWithoutArticle}': "${text}"`
      ).toBe(true);
    }
  });

  it('no Arabic letters in any German sentence edit, and no Latin letters in any Arabic sentence edit', () => {
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    for (const e of sEdits) {
      const text = e.new.trim();
      expect(
        arabicRegex.test(text),
        `German sentence for '${e.id}' must not contain Arabic characters: "${text}"`
      ).toBe(false);
    }

    const latinRegex = /[a-zA-Z]/;
    for (const e of sarEdits) {
      const text = e.new.trim();
      expect(
        latinRegex.test(text),
        `Arabic translation for '${e.id}' must contain no Latin characters: "${text}"`
      ).toBe(false);
    }
  });

  it('verifies all 3 words in index.html match the dedupe values (s and sar)', () => {
    for (const e of changes.edit) {
      const w = wordMap.get(e.id);
      expect(w).toBeDefined();
      expect(w[e.field]).toBe(e.new);
    }

    // verben.spielen German sentence remains unchanged
    const spielen = wordMap.get('verben.spielen');
    expect(spielen.s).toBe('Die Kinder spielen im Park.');
  });

  it('proves global uniqueness: exactly 1186 distinct German and 1186 distinct Arabic sentences across learning words', () => {
    const learningCategories = categories.filter(c => c.id !== 'section-names');
    expect(learningCategories.length).toBe(30);

    const learningWords = [];
    learningCategories.forEach(c => learningWords.push(...c.words));
    expect(learningWords.length).toBe(1186);

    const germanSentences = new Set(learningWords.map(w => w.s));
    const arabicSentences = new Set(learningWords.map(w => w.sar));

    expect(germanSentences.size).toBe(1186);
    expect(arabicSentences.size).toBe(1186);
  });
});

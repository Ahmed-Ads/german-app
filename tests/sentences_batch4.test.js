import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { extractCategoriesFromHtml } from '../scripts/apply_vocab_changes.js';

describe('Release v1.25 Sentences Batch 4 Quality & Structure Checks', () => {
  const rootDir = path.resolve(__dirname, '..');
  const indexHtmlPath = path.join(rootDir, 'index.html');
  const changesPath = path.join(rootDir, 'tools', 'vocab_changes_sentences_batch4.json');

  const changes = JSON.parse(fs.readFileSync(changesPath, 'utf8'));
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const categories = extractCategoriesFromHtml(html);

  const targetCategoryIds = ['wetter', 'gefuehle', 'farben', 'zahlen', 'monate', 'wochentage', 'jahreszeiten'];

  const allWords = [];
  categories.forEach(c => allWords.push(...c.words));
  const wordMap = new Map();
  allWords.forEach(w => wordMap.set(w.id, w));

  const sEdits = changes.edit.filter(e => e.field === 's');
  const sarEdits = changes.edit.filter(e => e.field === 'sar');

  it('contains exactly 137 German sentence edits and 137 Arabic translation edits (274 total)', () => {
    expect(sEdits.length).toBe(137);
    expect(sarEdits.length).toBe(137);
    expect(changes.edit.length).toBe(274);
  });

  it('all 137 words belong to the 7 target categories: wetter (42), gefuehle (37), farben (15), zahlen (20), monate (12), wochentage (7), jahreszeiten (4)', () => {
    const counts = { wetter: 0, gefuehle: 0, farben: 0, zahlen: 0, monate: 0, wochentage: 0, jahreszeiten: 0 };
    for (const e of sEdits) {
      const cat = e.id.split('.')[0];
      expect(targetCategoryIds).toContain(cat);
      counts[cat]++;
    }
    expect(counts.wetter).toBe(42);
    expect(counts.gefuehle).toBe(37);
    expect(counts.farben).toBe(15);
    expect(counts.zahlen).toBe(20);
    expect(counts.monate).toBe(12);
    expect(counts.wochentage).toBe(7);
    expect(counts.jahreszeiten).toBe(4);
  });

  it('all 137 German sentences have max 8 whitespace tokens, end with punctuation (. ? !), and contain noun or plural', () => {
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

      // (3) Contains target noun or its plural (case-insensitive)
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

  it('no Arabic letters in any German sentence, and no Latin letters in any Arabic sentence', () => {
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

  it('no duplicate sentences inside the seven categories (all 137 German and 137 Arabic sentences are distinct)', () => {
    const germanSentences = new Set();
    for (const e of sEdits) {
      const text = e.new.trim();
      expect(
        germanSentences.has(text),
        `Duplicate German sentence found: "${text}"`
      ).toBe(false);
      germanSentences.add(text);
    }
    expect(germanSentences.size).toBe(137);

    const arabicSentences = new Set();
    for (const e of sarEdits) {
      const text = e.new.trim();
      expect(
        arabicSentences.has(text),
        `Duplicate Arabic translation found: "${text}"`
      ).toBe(false);
      arabicSentences.add(text);
    }
    expect(arabicSentences.size).toBe(137);
  });

  it('verifies all 137 words in index.html match the new sentence values (s and sar)', () => {
    for (const e of changes.edit) {
      const w = wordMap.get(e.id);
      expect(w).toBeDefined();
      expect(w[e.field]).toBe(e.new);
    }
  });
});

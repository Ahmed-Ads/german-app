import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { extractCategoriesFromHtml } from '../scripts/apply_vocab_changes.js';

describe('Release v1.23 Sentences Batch 3a Quality & Structure Checks', () => {
  const rootDir = path.resolve(__dirname, '..');
  const indexHtmlPath = path.join(rootDir, 'index.html');
  const changesPath = path.join(rootDir, 'tools', 'vocab_changes_sentences_batch3a.json');

  const changes = JSON.parse(fs.readFileSync(changesPath, 'utf8'));
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const categories = extractCategoriesFromHtml(html);

  const targetCategoryIds = ['berufe', 'verkehr', 'schule'];
  const targetCategories = categories.filter(c => targetCategoryIds.includes(c.id));

  const allWords = [];
  categories.forEach(c => allWords.push(...c.words));
  const wordMap = new Map();
  allWords.forEach(w => wordMap.set(w.id, w));

  const sEdits = changes.edit.filter(e => e.field === 's');
  const sarEdits = changes.edit.filter(e => e.field === 'sar');

  it('contains exactly 135 German sentence edits and 135 Arabic translation edits (270 total)', () => {
    expect(sEdits.length).toBe(135);
    expect(sarEdits.length).toBe(135);
    expect(changes.edit.length).toBe(270);
  });

  it('all 135 words belong to the 3 target categories: berufe (46), verkehr (42), schule (47)', () => {
    const counts = { berufe: 0, verkehr: 0, schule: 0 };
    for (const e of sEdits) {
      const cat = e.id.split('.')[0];
      expect(targetCategoryIds).toContain(cat);
      counts[cat]++;
    }
    expect(counts.berufe).toBe(46);
    expect(counts.verkehr).toBe(42);
    expect(counts.schule).toBe(47);
  });

  it('all 135 German sentences have max 8 tokens, end with punctuation (. ? !), and contain noun or plural', () => {
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

  it('no duplicate sentences inside the three categories (all 135 German and 135 Arabic sentences are distinct)', () => {
    const germanSentences = new Set();
    for (const e of sEdits) {
      const text = e.new.trim();
      expect(
        germanSentences.has(text),
        `Duplicate German sentence found: "${text}"`
      ).toBe(false);
      germanSentences.add(text);
    }
    expect(germanSentences.size).toBe(135);

    const arabicSentences = new Set();
    for (const e of sarEdits) {
      const text = e.new.trim();
      expect(
        arabicSentences.has(text),
        `Duplicate Arabic translation found: "${text}"`
      ).toBe(false);
      arabicSentences.add(text);
    }
    expect(arabicSentences.size).toBe(135);
  });

  const dedupePath = path.join(rootDir, 'tools', 'vocab_changes_sentences_dedupe.json');
  const supersededIds = fs.existsSync(dedupePath)
    ? new Set(JSON.parse(fs.readFileSync(dedupePath, 'utf8')).edit.map(e => e.id))
    : new Set();

  it('verifies all 135 words in index.html match the new sentence values (s and sar) unless superseded', () => {
    for (const e of changes.edit) {
      if (supersededIds.has(e.id)) continue;
      const w = wordMap.get(e.id);
      expect(w).toBeDefined();
      expect(w[e.field]).toBe(e.new);
    }
  });
});

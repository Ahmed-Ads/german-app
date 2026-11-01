import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Release v1.19 Sentences Batch 2 Quality & Structure Checks', () => {
  const rootDir = path.resolve(__dirname, '..');
  const changesPath = path.join(rootDir, 'tools', 'vocab_changes_sentences_batch2.json');
  const baselinePath = path.join(rootDir, 'vocab_baseline.json');

  const changes = JSON.parse(fs.readFileSync(changesPath, 'utf8'));
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

  const wordMap = new Map();
  baseline.forEach(c => c.words.forEach(w => wordMap.set(w.id, w)));

  const sEdits = changes.edit.filter(e => e.field === 's');
  const sarEdits = changes.edit.filter(e => e.field === 'sar');

  it('contains exactly 172 German sentence edits and 172 Arabic translation edits (344 total)', () => {
    expect(sEdits.length).toBe(172);
    expect(sarEdits.length).toBe(172);
    expect(changes.edit.length).toBe(344);
  });

  it('all 172 German sentences have max 8 words, end with punctuation (. ? !), and contain noun or plural', () => {
    for (const e of sEdits) {
      const w = wordMap.get(e.id);
      expect(w, `Word ${e.id} must exist in vocabulary`).toBeDefined();

      const text = e.new.trim();
      const words = text.split(/\s+/).filter(Boolean);

      // (1) German sentence at most 8 words
      expect(
        words.length,
        `German sentence for '${e.id}' exceeds 8 words (${words.length} words): "${text}"`
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

  it('all 172 Arabic sentences have no Latin characters', () => {
    for (const e of sarEdits) {
      const text = e.new.trim();
      const hasLatin = /[a-zA-Z]/.test(text);
      expect(
        hasLatin,
        `Arabic translation for '${e.id}' must contain no Latin characters: "${text}"`
      ).toBe(false);
    }
  });

  it('verifies all 172 words in index.html match the new sentence values', () => {
    for (const e of changes.edit) {
      const w = wordMap.get(e.id);
      expect(w).toBeDefined();
      expect(w[e.field]).toBe(e.new);
    }
  });
});

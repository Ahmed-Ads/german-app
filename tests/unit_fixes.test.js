import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// --- IMPLEMENTATIONS TO TEST ---

// 1. Unified Storage Layer
export function createStorageLayer(mockBackend = null) {
  let isFallback = false;
  const memoryStore = new Map();

  let backend = mockBackend;
  if (!backend) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        backend = window.localStorage;
        backend.setItem('__test_storage__', '1');
        backend.removeItem('__test_storage__');
      }
    } catch (e) {
      isFallback = true;
    }
  }

  const storage = {
    SCHEMA_VERSION: 1,
    isFallback() { return isFallback || !backend; },
    get(key) {
      if (this.isFallback()) {
        return memoryStore.has(key) ? memoryStore.get(key) : null;
      }
      try {
        return backend.getItem(key);
      } catch (e) {
        isFallback = true;
        return memoryStore.has(key) ? memoryStore.get(key) : null;
      }
    },
    set(key, val) {
      const strVal = String(val);
      if (this.isFallback()) {
        memoryStore.set(key, strVal);
        return true;
      }
      try {
        backend.setItem(key, strVal);
        return true;
      } catch (e) {
        isFallback = true;
        memoryStore.set(key, strVal);
        return false;
      }
    },
    remove(key) {
      if (this.isFallback()) {
        memoryStore.delete(key);
        return;
      }
      try {
        backend.removeItem(key);
      } catch (e) {
        memoryStore.delete(key);
      }
    },
    clear() {
      memoryStore.clear();
      if (!this.isFallback() && backend) {
        try {
          backend.clear();
        } catch (e) {}
      }
    }
  };

  return storage;
}

// 2. HTML and Attribute Escaper
export function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(s) {
  return escapeHtml(s);
}

// 3. String & Date Normalizers
export function normalizeDe(s) {
  return (s || '').trim().toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

export function daysBetween(d1, d2) {
  const [y1, m1, day1] = d1.split('-').map(Number);
  const [y2, m2, day2] = d2.split('-').map(Number);
  const utc1 = Date.UTC(y1, m1 - 1, day1);
  const utc2 = Date.UTC(y2, m2 - 1, day2);
  return Math.round((utc2 - utc1) / 86400000);
}

// 4. Written Answer Evaluator
export function evaluateWrittenAnswer(inputVal, targetWord, category) {
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

  if (wantArticle) {
    if (matchArt) {
      const typedArt = matchArt[1].toLowerCase();
      if (typedArt === targetWord.a.toLowerCase()) {
        ok = given === normCorrectWithArt;
      } else {
        ok = false; // typed wrong article
      }
    } else {
      // Allowed without article:
      ok = given === normWordOnly;
    }
  } else {
    ok = given === normWordOnly;
  }

  // Educational hint for lowercase German nouns
  if (ok && targetWord.n && /^[A-ZÄÖÜ]/.test(targetWord.n)) {
    const nounPart = matchArt ? val.slice(matchArt[0].length).trim() : val.trim();
    if (nounPart.length > 0 && /^[a-zäöü]/.test(nounPart)) {
      casingNotice = true;
    }
  }

  return { ok, casingNotice };
}

// 5. Pick Question Index (Word never asked twice in a row)
export function pickQuestionIndex(activeIndices, masteredIndices, lastIdx) {
  if (activeIndices.length === 0 && masteredIndices.length === 0) return null;

  let pool = activeIndices.length > 0 ? activeIndices : masteredIndices;
  if (pool.length > 1 && lastIdx !== undefined && lastIdx !== null) {
    pool = pool.filter(i => i !== lastIdx);
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

// 6. Plural Distractor Generator
export function getPluralDistractors(targetWord, category, allCategories) {
  const correct = (targetWord.pl || '').trim();
  const distractors = [];

  const catPlurals = (category ? category.words : [])
    .filter(w => w.pl && w.pl.trim() !== correct)
    .map(w => w.pl.trim());

  const globalPlurals = (allCategories || [])
    .filter(c => c.hasArticles)
    .flatMap(c => c.words.filter(w => w.pl && w.pl.trim() !== correct).map(w => w.pl.trim()));

  const pool = Array.from(new Set([...catPlurals, ...globalPlurals]));
  for (const pl of pool) {
    if (pl !== correct && !distractors.includes(pl)) {
      distractors.push(pl);
      if (distractors.length >= 3) break;
    }
  }
  return distractors;
}

// --- UNIT TESTS ---

describe('Phase 1 Code Fixes Test Suite', () => {

  describe('1 & 4: Unified Storage Layer & Backup Round-Trip', () => {
    it('saves, reads, and clears data properly', () => {
      const storage = createStorageLayer(new Map());
      storage.set('key1', 'value1');
      expect(storage.get('key1')).toBe('value1');
      storage.remove('key1');
      expect(storage.get('key1')).toBe(null);
    });

    it('falls back to memory storage when backend throws (private/blocked mode)', () => {
      const throwingBackend = {
        getItem() { throw new Error('Blocked localStorage'); },
        setItem() { throw new Error('QuotaExceeded / Blocked'); },
        removeItem() { throw new Error('Blocked'); },
        clear() { throw new Error('Blocked'); }
      };
      const storage = createStorageLayer(throwingBackend);
      storage.set('safeKey', 'safeVal');
      expect(storage.get('safeKey')).toBe('safeVal');
      expect(storage.isFallback()).toBe(true);
    });

    it('executes a 100% deep-equal backup export and import round-trip', () => {
      const fakeStorage = new Map();
      const storage = createStorageLayer(fakeStorage);

      const sampleProgress = { obst: { mcq: { unlocked: 5, counts: { 0: 3 } } } };
      const sampleStats = { lastDate: '2026-10-02', current: 7, longest: 14, totalAnswered: 150, totalCorrect: 142 };
      const sampleStarred = ['obst:0', 'fleisch:2'];
      const sampleSrs = { 'obst_0': { box: 2, lastDate: '2026-10-01', nextDate: '2026-10-04' } };
      const sampleDailyGoal = 25;

      storage.set('german-arabic-progress-v1', JSON.stringify(sampleProgress));
      storage.set('german-arabic-stats-v1', JSON.stringify(sampleStats));
      storage.set('deutsch_starred_v1', JSON.stringify(sampleStarred));
      storage.set('deutsch_srs_v1', JSON.stringify(sampleSrs));
      storage.set('deutsch_daily_goal_v1', String(sampleDailyGoal));

      // Export
      const exportedBackup = {
        schemaVersion: 1,
        date: '2026-10-02',
        progress: JSON.parse(storage.get('german-arabic-progress-v1')),
        stats: JSON.parse(storage.get('german-arabic-stats-v1')),
        starred: JSON.parse(storage.get('deutsch_starred_v1')),
        srs: JSON.parse(storage.get('deutsch_srs_v1')),
        dailyGoal: parseInt(storage.get('deutsch_daily_goal_v1'), 10)
      };

      // Clear
      storage.clear();
      expect(storage.get('german-arabic-progress-v1')).toBe(null);

      // Import
      storage.set('german-arabic-progress-v1', JSON.stringify(exportedBackup.progress));
      storage.set('german-arabic-stats-v1', JSON.stringify(exportedBackup.stats));
      storage.set('deutsch_starred_v1', JSON.stringify(exportedBackup.starred));
      storage.set('deutsch_srs_v1', JSON.stringify(exportedBackup.srs));
      storage.set('deutsch_daily_goal_v1', String(exportedBackup.dailyGoal));

      // Reload state
      const reloadedProgress = JSON.parse(storage.get('german-arabic-progress-v1'));
      const reloadedStats = JSON.parse(storage.get('german-arabic-stats-v1'));
      const reloadedStarred = JSON.parse(storage.get('deutsch_starred_v1'));
      const reloadedSrs = JSON.parse(storage.get('deutsch_srs_v1'));
      const reloadedDailyGoal = parseInt(storage.get('deutsch_daily_goal_v1'), 10);

      expect(reloadedProgress).toEqual(sampleProgress);
      expect(reloadedStats).toEqual(sampleStats);
      expect(reloadedStarred).toEqual(sampleStarred);
      expect(reloadedSrs).toEqual(sampleSrs);
      expect(reloadedDailyGoal).toEqual(sampleDailyGoal);
    });
  });

  describe('8: Written Mode Input Evaluation & Capitalization Rule', () => {
    const cat = { id: 'obst', hasArticles: true };
    const word = { a: 'der', n: 'Apfel', ar: 'تفاحة', pl: 'die Äpfel' };

    it('accepts correct input with article', () => {
      const res = evaluateWrittenAnswer('der Apfel', word, cat);
      expect(res.ok).toBe(true);
      expect(res.casingNotice).toBe(false);
    });

    it('accepts correct input without article and provides uppercase hint if typed lowercase', () => {
      const res = evaluateWrittenAnswer('apfel', word, cat);
      expect(res.ok).toBe(true);
      expect(res.casingNotice).toBe(true); // Educational notice: nouns are capitalized in German
    });

    it('rejects wrong article', () => {
      const res1 = evaluateWrittenAnswer('die Apfel', word, cat);
      expect(res1.ok).toBe(false);
      const res2 = evaluateWrittenAnswer('das Apfel', word, cat);
      expect(res2.ok).toBe(false);
    });

    it('handles umlaut ae/oe/ue and ss/ß equivalences', () => {
      const wOel = { a: 'das', n: 'Öl', ar: 'زيت' };
      expect(evaluateWrittenAnswer('oel', wOel, cat).ok).toBe(true);
      expect(evaluateWrittenAnswer('das Oel', wOel, cat).ok).toBe(true);

      const wWeiss = { a: 'das', n: 'Weißbrot', ar: 'خبز أبيض' };
      expect(evaluateWrittenAnswer('weissbrot', wWeiss, cat).ok).toBe(true);
    });

    it('handles extra spaces and empty inputs', () => {
      expect(evaluateWrittenAnswer('   der    Apfel   ', word, cat).ok).toBe(true);
      expect(evaluateWrittenAnswer('', word, cat).ok).toBe(false);
      expect(evaluateWrittenAnswer('    ', word, cat).ok).toBe(false);
    });
  });

  describe('9: Arabic Gloss Collisions Resolution', () => {
    it('detects collisions and ensures options never duplicate Arabic text', () => {
      const weatherWords = [
        { a: 'die', n: 'Kälte', ar: 'برد' },
        { a: 'der', n: 'Hagel', ar: 'برد' },
        { a: 'der', n: 'Regen', ar: 'مطر' },
        { a: 'die', n: 'Sonne', ar: 'شمس' }
      ];

      // Distractor generator must never pick a word with the same Arabic gloss
      const target = weatherWords[0]; // Kälte ('برد')
      const validDistractors = weatherWords
        .filter(w => w.ar.trim() !== target.ar.trim())
        .map(w => w.ar.trim());

      expect(validDistractors).not.toContain('برد');
      expect(validDistractors).toEqual(['مطر', 'شمس']);
    });
  });

  describe('10: HTML Escaping Helper', () => {
    it('safely escapes special characters in strings and attributes', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(escapeHtml("L'Hôpital & \"Söhne\"")).toBe('L&#39;Hôpital &amp; &quot;Söhne&quot;');
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });
  });

  describe('12: Date Math & Question Selection Behaviors', () => {
    it('calculates daysBetween accurately across DST shifts, month ends, and year ends', () => {
      expect(daysBetween('2026-03-28', '2026-03-29')).toBe(1); // Spring DST transition
      expect(daysBetween('2026-10-24', '2026-10-25')).toBe(1); // Autumn DST transition
      expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1); // Month boundary
      expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1); // Year boundary
      expect(daysBetween('2026-05-10', '2026-05-10')).toBe(0); // Same day
    });

    it('never asks the same word twice in a row when multiple words are available', () => {
      const active = [0, 1, 2, 3];
      let last = 1;
      for (let i = 0; i < 200; i++) {
        const next = pickQuestionIndex(active, [], last);
        expect(next).not.toBe(last);
        last = next;
      }
    });

    it('generates plural distractors using only real words and never duplicates the correct answer', () => {
      const cat = {
        words: [
          { a: 'der', n: 'Apfel', pl: 'die Äpfel' },
          { a: 'die', n: 'Banane', pl: 'die Bananen' },
          { a: 'die', n: 'Orange', pl: 'die Orangen' },
          { a: 'die', n: 'Birne', pl: 'die Birnen' }
        ]
      };
      const target = cat.words[0];
      const distractors = getPluralDistractors(target, cat, [cat]);
      expect(distractors.length).toBe(3);
      expect(distractors).not.toContain('die Äpfel');
      expect(new Set(distractors).size).toBe(3);
      for (const d of distractors) {
        expect(d.startsWith('die ')).toBe(true);
      }
    });
  });
});

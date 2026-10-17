/**
 * tests/merge_policy.test.js
 * Comprehensive unit tests for deterministic sync merge policy.
 * Asserts commutativity, idempotence, monotonicity, error rejection, and mode coverage.
 */

import { describe, it, expect } from 'vitest';
import SyncMergePolicy from '../sync/merge_policy.js';

const mockCategories = [
  { id: 'obst', ar: 'الفواكه', words: new Array(20).fill(null).map((_, i) => ({ n: `word_${i}` })) },
  { id: 'berufe', ar: 'المهن', words: new Array(15).fill(null).map((_, i) => ({ n: `beruf_${i}` })) }
];

describe('SyncMergePolicy: Invariants & Determinism', () => {
  it('mergeProgress is commutative: merge(A, B) === merge(B, A)', () => {
    const a = {
      obst: {
        mcq: { unlocked: 5, counts: { '0': 3, '1': 10 } },
        listen: { unlocked: 3, counts: { '0': 8, '2': 5 } }
      }
    };
    const b = {
      obst: {
        mcq: { unlocked: 8, counts: { '0': 7, '1': 4, '3': 2 } },
        listen: { unlocked: 5, counts: { '0': 4, '2': 9 } }
      },
      berufe: {
        written: { unlocked: 4, counts: { '0': 6 } }
      }
    };

    const ab = SyncMergePolicy.mergeProgress(a, b);
    const ba = SyncMergePolicy.mergeProgress(b, a);

    expect(ab).toEqual(ba);
    expect(ab.obst.mcq.unlocked).toBe(8);
    expect(ab.obst.mcq.counts['0']).toBe(7);
    expect(ab.obst.mcq.counts['1']).toBe(10);
    expect(ab.obst.listen.counts['0']).toBe(8);
    expect(ab.obst.listen.counts['2']).toBe(9);
    expect(ab.berufe.written.unlocked).toBe(4);
  });

  it('mergeProgress is idempotent: merge(A, A) === A', () => {
    const a = {
      obst: {
        mcq: { unlocked: 10, counts: { '0': 10, '1': 8, '2': 5 } },
        listen: { unlocked: 5, counts: { '0': 8 } },
        coreAcked: true
      }
    };

    const aa = SyncMergePolicy.mergeProgress(a, a);
    expect(aa).toEqual(a);
  });

  it('monotonicity: mastery and counts NEVER decrease after merge', () => {
    const local = {
      obst: {
        mcq: { unlocked: 10, counts: { '0': 10, '1': 10, '2': 4 } },
        listen: { unlocked: 8, counts: { '0': 8, '1': 7 } }
      }
    };
    const remote = {
      obst: {
        mcq: { unlocked: 5, counts: { '0': 2, '1': 5, '2': 9 } },
        listen: { unlocked: 4, counts: { '0': 4, '1': 3 } }
      }
    };

    const merged = SyncMergePolicy.mergeProgress(local, remote);

    // Assert that every single count in merged is >= local and >= remote
    for (const catId of ['obst']) {
      for (const mode of ['mcq', 'listen']) {
        expect(merged[catId][mode].unlocked).toBeGreaterThanOrEqual(local[catId][mode].unlocked);
        expect(merged[catId][mode].unlocked).toBeGreaterThanOrEqual(remote[catId][mode].unlocked);
        for (const idx of ['0', '1', '2']) {
          const lVal = local[catId]?.[mode]?.counts?.[idx] || 0;
          const rVal = remote[catId]?.[mode]?.counts?.[idx] || 0;
          const mVal = merged[catId][mode].counts[idx] || 0;
          expect(mVal).toBeGreaterThanOrEqual(lVal);
          expect(mVal).toBeGreaterThanOrEqual(rVal);
        }
      }
    }
  });
});

describe('SyncMergePolicy: Stats & Streak Merging', () => {
  it('mergeStats is commutative: merge(A, B) === merge(B, A)', () => {
    const sA = {
      current: 5,
      longest: 12,
      lastDate: '2026-10-04',
      todayCount: 20,
      totalAnswered: 150,
      totalCorrect: 140
    };
    const sB = {
      current: 7,
      longest: 10,
      lastDate: '2026-10-05',
      todayCount: 15,
      totalAnswered: 180,
      totalCorrect: 160
    };

    const ab = SyncMergePolicy.mergeStats(sA, sB);
    const ba = SyncMergePolicy.mergeStats(sB, sA);

    expect(ab).toEqual(ba);
    expect(ab.current).toBe(7); // latest date 2026-10-05 wins
    expect(ab.lastDate).toBe('2026-10-05');
    expect(ab.longest).toBe(12);
    expect(ab.totalAnswered).toBe(180);
    expect(ab.totalCorrect).toBe(160);
  });

  it('mergeStats picks maximum streak on identical dates', () => {
    const s1 = { current: 4, lastDate: '2026-10-05', todayCount: 10, totalAnswered: 50, totalCorrect: 40 };
    const s2 = { current: 6, lastDate: '2026-10-05', todayCount: 25, totalAnswered: 60, totalCorrect: 50 };

    const merged = SyncMergePolicy.mergeStats(s1, s2);
    expect(merged.current).toBe(6);
    expect(merged.todayCount).toBe(25);
  });
});

describe('SyncMergePolicy: Starred & SRS Sets', () => {
  it('mergeStarred computes deterministic set union', () => {
    const s1 = ['obst_0', 'obst_2', 'berufe_1'];
    const s2 = ['obst_1', 'obst_2', 'berufe_5'];

    const merged = SyncMergePolicy.mergeStarred(s1, s2);
    expect(merged).toEqual(['berufe_1', 'berufe_5', 'obst_0', 'obst_1', 'obst_2']);

    const reverse = SyncMergePolicy.mergeStarred(s2, s1);
    expect(merged).toEqual(reverse);
  });

  it('mergeSrs resolves conflicts by latest lastDate or higher box tie-break', () => {
    const srsA = {
      'obst_0': { box: 2, lastDate: '2026-10-03', nextDate: '2026-10-06' },
      'obst_1': { box: 3, lastDate: '2026-10-04', nextDate: '2026-10-08' },
      'berufe_0': { box: 1, lastDate: '2026-10-05', nextDate: '2026-10-07' }
    };
    const srsB = {
      'obst_0': { box: 3, lastDate: '2026-10-04', nextDate: '2026-10-09' }, // later date -> wins
      'obst_1': { box: 4, lastDate: '2026-10-04', nextDate: '2026-10-10' }, // same date -> higher box wins (4)
      'obst_2': { box: 1, lastDate: '2026-10-02', nextDate: '2026-10-04' }  // unique to B
    };

    const merged = SyncMergePolicy.mergeSrs(srsA, srsB);

    expect(merged['obst_0']).toEqual(srsB['obst_0']);
    expect(merged['obst_1'].box).toBe(4);
    expect(merged['berufe_0']).toEqual(srsA['berufe_0']);
    expect(merged['obst_2']).toEqual(srsB['obst_2']);
  });
});

describe('SyncMergePolicy: Validation and Corruption Rejection', () => {
  it('accepts valid cloud document matching schema', () => {
    const doc = {
      schemaVersion: 1,
      progress: {
        obst: {
          mcq: { unlocked: 5, counts: { '0': 2 } },
          listen: { unlocked: 5, counts: { '0': 3 } }
        }
      },
      stats: { current: 3, longest: 5, totalAnswered: 50, totalCorrect: 45 },
      starred: ['obst_0'],
      srs: { 'obst_0': { box: 1, lastDate: '2026-10-05', nextDate: '2026-10-07' } },
      dailyGoal: { target: 30, updatedAt: '2026-10-05T00:00:00Z' }
    };

    const res = SyncMergePolicy.validateCloudDocument(doc, mockCategories);
    expect(res.valid).toBe(true);
  });

  it('rejects unknown category ID in progress', () => {
    const doc = {
      progress: {
        unknown_cat_xyz: { mcq: { unlocked: 1 } }
      }
    };
    const res = SyncMergePolicy.validateCloudDocument(doc, mockCategories);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('غير معروف في التطبيق');
  });

  it('rejects unknown mode outside PROGRESS_MODES', () => {
    const doc = {
      progress: {
        obst: { hacker_mode: { unlocked: 5 } }
      }
    };
    const res = SyncMergePolicy.validateCloudDocument(doc, mockCategories);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('غير معروف');
  });

  it('validates every supported mode including listen mode', () => {
    const modes = SyncMergePolicy.getProgressModes();
    expect(modes).toEqual(['mcq', 'written', 'article', 'plural', 'listen']);

    for (const m of modes) {
      const doc = {
        progress: {
          obst: { [m]: { unlocked: 5, counts: { '0': 1 } } }
        }
      };
      const res = SyncMergePolicy.validateCloudDocument(doc, mockCategories);
      expect(res.valid).toBe(true);
    }
  });

  it('rejects out of range word index in progress counts', () => {
    const doc = {
      progress: {
        obst: { mcq: { unlocked: 5, counts: { '999': 10 } } }
      }
    };
    const res = SyncMergePolicy.validateCloudDocument(doc, mockCategories);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('خارج النطاق');
  });

  it('rejects corrupted non-object cloud root', () => {
    expect(SyncMergePolicy.validateCloudDocument(null).valid).toBe(false);
    expect(SyncMergePolicy.validateCloudDocument([1, 2, 3]).valid).toBe(false);
    expect(SyncMergePolicy.validateCloudDocument('string').valid).toBe(false);
  });
});

describe('SyncMergePolicy: Handcrafted Tie-Breaks & Timestamp Preservation (Task C)', () => {
  it('dailyGoal tie-break: equal updatedAt picks higher target deterministically in both directions', () => {
    const g1 = { target: 30, updatedAt: '2026-10-09T10:00:00Z' };
    const g2 = { target: 50, updatedAt: '2026-10-09T10:00:00Z' };

    const m12 = SyncMergePolicy.mergeDailyGoal(g1, g2);
    const m21 = SyncMergePolicy.mergeDailyGoal(g2, g1);

    expect(m12).toEqual(m21);
    expect(m12.target).toBe(50);
    expect(m12.updatedAt).toBe('2026-10-09T10:00:00Z');
  });

  it('dailyGoal tie-break: both without updatedAt picks higher target deterministically in both directions', () => {
    const g1 = { target: 20 };
    const g2 = { target: 45 };

    const m12 = SyncMergePolicy.mergeDailyGoal(g1, g2);
    const m21 = SyncMergePolicy.mergeDailyGoal(g2, g1);

    expect(m12).toEqual(m21);
    expect(m12.target).toBe(45);
  });

  it('dailyGoal with single updatedAt wins over goal without timestamp', () => {
    const g1 = { target: 15, updatedAt: '2026-10-01T00:00:00Z' };
    const g2 = { target: 100, updatedAt: '' };

    const m12 = SyncMergePolicy.mergeDailyGoal(g1, g2);
    const m21 = SyncMergePolicy.mergeDailyGoal(g2, g1);

    expect(m12).toEqual(m21);
    expect(m12.target).toBe(15);
    expect(m12.updatedAt).toBe('2026-10-01T00:00:00Z');
  });

  it('SRS tie-break: equal lastDate and equal box picks earlier nextDate for educational retention safety', () => {
    const recA = { box: 2, lastDate: '2026-10-05', nextDate: '2026-10-08' };
    const recB = { box: 2, lastDate: '2026-10-05', nextDate: '2026-10-12' };

    const ab = SyncMergePolicy.mergeSrs({ 'obst_0': recA }, { 'obst_0': recB });
    const ba = SyncMergePolicy.mergeSrs({ 'obst_0': recB }, { 'obst_0': recA });

    expect(ab).toEqual(ba);
    // Earlier nextDate ('2026-10-08') must be selected to avoid forgetting curve decay
    expect(ab['obst_0'].nextDate).toBe('2026-10-08');
    expect(ab['obst_0'].box).toBe(2);
    expect(ab['obst_0'].lastDate).toBe('2026-10-05');
  });

  it('SRS tie-break: missing lastDate on both with equal box picks earlier nextDate', () => {
    const recA = { box: 1, nextDate: '2026-10-07' };
    const recB = { box: 1, nextDate: '2026-10-03' };

    const ab = SyncMergePolicy.mergeSrs({ 'obst_0': recA }, { 'obst_0': recB });
    const ba = SyncMergePolicy.mergeSrs({ 'obst_0': recB }, { 'obst_0': recA });

    expect(ab).toEqual(ba);
    expect(ab['obst_0'].nextDate).toBe('2026-10-03');
    expect(ab['obst_0'].box).toBe(1);
  });

  it('createCloudPayload preserves existing dailyGoal.updatedAt without refreshing it to current time', () => {
    const userTimestamp = '2026-10-01T15:30:00.000Z';
    const localData = {
      dataVersion: 3,
      progress: { obst: { mcq: { unlocked: 5 } } },
      dailyGoal: { target: 40, updatedAt: userTimestamp }
    };

    const payload = SyncMergePolicy.createCloudPayload(localData);
    expect(payload.dailyGoal.target).toBe(40);
    // Must preserve user change timestamp
    expect(payload.dailyGoal.updatedAt).toBe(userTimestamp);
    // Top-level updatedAt is refreshed, but dailyGoal.updatedAt is preserved
    expect(payload.updatedAt).not.toBe(userTimestamp);
  });
});

describe('SyncMergePolicy: Property-Based Tests (3,000 Seeded Random Pairs)', () => {
  // Mulberry32 seeded pseudo-random number generator for 100% deterministic test execution
  function createPrng(seed) {
    let s = seed | 0;
    return function() {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const prng = createPrng(20261009);
  const randint = (min, max) => Math.floor(prng() * (max - min + 1)) + min;
  const choice = (arr) => arr[randint(0, arr.length - 1)];

  const sampleDates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', ''];
  const sampleCats = ['obst', 'berufe'];
  const sampleModes = ['mcq', 'written', 'article', 'plural', 'listen'];

  function generateRandomProgress() {
    const prog = {};
    for (const cat of sampleCats) {
      if (prng() < 0.2) continue; // sometimes absent
      prog[cat] = {};
      if (prng() < 0.5) prog[cat].coreAcked = true;
      for (const m of sampleModes) {
        if (prng() < 0.3) continue;
        const counts = {};
        const numWords = randint(0, 4);
        for (let i = 0; i < numWords; i++) {
          counts[String(randint(0, 9))] = randint(0, 20);
        }
        prog[cat][m] = {
          unlocked: randint(0, 15),
          counts
        };
      }
    }
    return prog;
  }

  function generateRandomStats() {
    const totalAnswered = randint(0, 200);
    const totalCorrect = randint(0, totalAnswered);
    const current = randint(0, 20);
    const longest = Math.max(current, randint(current, 30));
    const lastDate = choice(sampleDates);
    const stats = {
      current,
      longest,
      totalAnswered,
      totalCorrect
    };
    if (lastDate) {
      stats.lastDate = lastDate;
      stats.todayCount = randint(0, 30);
    }
    return stats;
  }

  function generateRandomStarred() {
    const all = ['obst_0', 'obst_1', 'obst_2', 'berufe_0', 'berufe_1'];
    return all.filter(() => prng() < 0.5);
  }

  function generateRandomSrs() {
    const keys = ['obst_0', 'obst_1', 'berufe_0'];
    const srs = {};
    for (const k of keys) {
      if (prng() < 0.4) continue;
      const rec = { box: randint(0, 4) };
      const ld = choice(sampleDates);
      const nd = choice(sampleDates);
      if (ld) rec.lastDate = ld;
      if (nd) rec.nextDate = nd;
      srs[k] = rec;
    }
    return srs;
  }

  function generateRandomGoal() {
    const target = randint(5, 200);
    const updatedAt = prng() < 0.6 ? `2026-10-0${randint(1, 9)}T12:00:00Z` : '';
    return { target, updatedAt };
  }

  it('proves commutativity, idempotence, and monotonicity across 3,000 random pairs', () => {
    const NUM_PAIRS = 3000;

    for (let i = 0; i < NUM_PAIRS; i++) {
      const progA = generateRandomProgress();
      const progB = generateRandomProgress();
      const statsA = generateRandomStats();
      const statsB = generateRandomStats();
      const starA = generateRandomStarred();
      const starB = generateRandomStarred();
      const srsA = generateRandomSrs();
      const srsB = generateRandomSrs();
      const goalA = generateRandomGoal();
      const goalB = generateRandomGoal();

      // 1. Commutativity: merge(A, B) === merge(B, A)
      const pAB = SyncMergePolicy.mergeProgress(progA, progB);
      const pBA = SyncMergePolicy.mergeProgress(progB, progA);
      expect(pAB).toEqual(pBA);

      const stAB = SyncMergePolicy.mergeStats(statsA, statsB);
      const stBA = SyncMergePolicy.mergeStats(statsB, statsA);
      expect(stAB).toEqual(stBA);

      const starAB = SyncMergePolicy.mergeStarred(starA, starB);
      const starBA = SyncMergePolicy.mergeStarred(starB, starA);
      expect(starAB).toEqual(starBA);

      const srsAB = SyncMergePolicy.mergeSrs(srsA, srsB);
      const srsBA = SyncMergePolicy.mergeSrs(srsB, srsA);
      expect(srsAB).toEqual(srsBA);

      const gAB = SyncMergePolicy.mergeDailyGoal(goalA, goalB);
      const gBA = SyncMergePolicy.mergeDailyGoal(goalB, goalA);
      expect(gAB).toEqual(gBA);

      // 2. Idempotence: merge(A, A) === A (normalized)
      const pAA = SyncMergePolicy.mergeProgress(progA, progA);
      expect(pAA).toEqual(SyncMergePolicy.mergeProgress(progA, {}));

      const starAA = SyncMergePolicy.mergeStarred(starA, starA);
      expect(starAA).toEqual(Array.from(new Set(starA)).sort());

      const srsAA = SyncMergePolicy.mergeSrs(srsA, srsA);
      expect(srsAA).toEqual(srsA);

      const gAA = SyncMergePolicy.mergeDailyGoal(goalA, goalA);
      expect(gAA.target).toBe(goalA.target);

      // 3. Monotonicity: counts and stats never decrease
      expect(stAB.totalAnswered).toBeGreaterThanOrEqual(statsA.totalAnswered);
      expect(stAB.totalAnswered).toBeGreaterThanOrEqual(statsB.totalAnswered);
      expect(stAB.totalCorrect).toBeGreaterThanOrEqual(statsA.totalCorrect);
      expect(stAB.totalCorrect).toBeGreaterThanOrEqual(statsB.totalCorrect);
      expect(stAB.longest).toBeGreaterThanOrEqual(statsA.longest);
      expect(stAB.longest).toBeGreaterThanOrEqual(statsB.longest);

      for (const catId of Object.keys(progA)) {
        if (!progA[catId]) continue;
        for (const m of sampleModes) {
          if (!progA[catId][m]) continue;
          expect(pAB[catId][m].unlocked).toBeGreaterThanOrEqual(progA[catId][m].unlocked);
          for (const [wIdx, cnt] of Object.entries(progA[catId][m].counts || {})) {
            expect(pAB[catId][m].counts[wIdx]).toBeGreaterThanOrEqual(cnt);
          }
        }
      }
    }
  }, 15000);

  it('proves associativity across 500 random triples: merge(merge(A, B), C) === merge(A, merge(B, C))', () => {
    const NUM_TRIPLES = 500;

    for (let i = 0; i < NUM_TRIPLES; i++) {
      const progA = generateRandomProgress();
      const progB = generateRandomProgress();
      const progC = generateRandomProgress();

      const pAB_C = SyncMergePolicy.mergeProgress(SyncMergePolicy.mergeProgress(progA, progB), progC);
      const pA_BC = SyncMergePolicy.mergeProgress(progA, SyncMergePolicy.mergeProgress(progB, progC));
      expect(pAB_C).toEqual(pA_BC);

      const starA = generateRandomStarred();
      const starB = generateRandomStarred();
      const starC = generateRandomStarred();
      const starAB_C = SyncMergePolicy.mergeStarred(SyncMergePolicy.mergeStarred(starA, starB), starC);
      const starA_BC = SyncMergePolicy.mergeStarred(starA, SyncMergePolicy.mergeStarred(starB, starC));
      expect(starAB_C).toEqual(starA_BC);

      const goalA = generateRandomGoal();
      const goalB = generateRandomGoal();
      const goalC = generateRandomGoal();
      const gAB_C = SyncMergePolicy.mergeDailyGoal(SyncMergePolicy.mergeDailyGoal(goalA, goalB), goalC);
      const gA_BC = SyncMergePolicy.mergeDailyGoal(goalA, SyncMergePolicy.mergeDailyGoal(goalB, goalC));
      expect(gAB_C).toEqual(gA_BC);

      const srsA = generateRandomSrs();
      const srsB = generateRandomSrs();
      const srsC = generateRandomSrs();
      const srsAB_C = SyncMergePolicy.mergeSrs(SyncMergePolicy.mergeSrs(srsA, srsB), srsC);
      const srsA_BC = SyncMergePolicy.mergeSrs(srsA, SyncMergePolicy.mergeSrs(srsB, srsC));
      expect(srsAB_C).toEqual(srsA_BC);
    }
  });
});

describe('SyncMergePolicy: Prototype Pollution & Hostile Key Hardening (L6)', () => {
  it('mergeFullUserData directly with JSON.parse hostile input does not pollute or replace prototypes', () => {
    const hostileJson = `{
      "__proto__": { "polluted": "yes" },
      "constructor": { "polluted": "yes" },
      "prototype": { "polluted": "yes" },
      "progress": {
        "__proto__": { "polluted": "yes" },
        "constructor": { "polluted": "yes" },
        "prototype": { "polluted": "yes" },
        "obst": {
          "__proto__": { "polluted": "yes" },
          "mcq": {
            "unlocked": 5,
            "counts": {
              "0": 2,
              "__proto__": 999,
              "constructor": 999,
              "prototype": 999
            }
          }
        }
      },
      "starred": ["obst_0", "__proto__", "constructor", "prototype"],
      "srs": {
        "__proto__": { "box": 5 },
        "constructor": { "box": 5 },
        "prototype": { "box": 5 },
        "obst_0": { "box": 2, "lastDate": "2026-10-04", "__proto__": { "polluted": "yes" } }
      }
    }`;

    const hostileCloud = JSON.parse(hostileJson);
    const localData = {
      progress: {
        obst: {
          mcq: { unlocked: 3, counts: { '0': 1, '1': 1 } }
        }
      },
      stats: { current: 2, longest: 4, totalAnswered: 20, totalCorrect: 18 },
      starred: ['obst_1'],
      srs: {
        obst_0: { box: 1, lastDate: '2026-10-02' }
      }
    };

    const merged = SyncMergePolicy.mergeFullUserData(localData, hostileCloud);

    // Global Object.prototype must NOT be polluted
    expect(({}).polluted).toBeUndefined();
    expect(Object.prototype.polluted).toBeUndefined();

    // Result object and its nested objects must have normal Object.prototype
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(merged.progress)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(merged.srs)).toBe(Object.prototype);

    // No hostile keys present as own properties
    expect(Object.prototype.hasOwnProperty.call(merged.progress, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(merged.progress, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(merged.progress, 'prototype')).toBe(false);

    expect(Object.prototype.hasOwnProperty.call(merged.srs, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(merged.srs, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(merged.srs, 'prototype')).toBe(false);

    // Starred list must not contain hostile key strings
    expect(merged.starred).not.toContain('__proto__');
    expect(merged.starred).not.toContain('constructor');
    expect(merged.starred).not.toContain('prototype');
    expect(merged.starred).toEqual(['obst.apfel', 'obst.banane']);

    // Progress counts must not contain hostile keys
    const obstMcqCounts = merged.progress.obst.mcq.counts;
    expect(Object.prototype.hasOwnProperty.call(obstMcqCounts, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(obstMcqCounts, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(obstMcqCounts, 'prototype')).toBe(false);
    expect(obstMcqCounts['obst.apfel']).toBe(2);
    expect(obstMcqCounts['obst.banane']).toBe(1);

    // SRS entry obst.apfel has clean fields
    expect(merged.srs['obst.apfel']).toEqual({ box: 2, lastDate: '2026-10-04' });
    expect(Object.getPrototypeOf(merged.srs['obst.apfel'])).toBe(Object.prototype);
  });
});

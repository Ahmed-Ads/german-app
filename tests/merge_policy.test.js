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

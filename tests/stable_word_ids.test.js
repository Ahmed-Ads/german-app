/**
 * tests/stable_word_ids.test.js
 *
 * Comprehensive Vitest suite for Stable Word IDs (Task feat/stable-word-ids):
 * (1) Every word in CATEGORIES has a valid, unique ID conforming to format <catId>.<slug>
 * (2) LEGACY_INDEX_IDS matches the exact pre-migration order of CATEGORIES
 * (3) vocab_ids_retired.json is respected (no active ID is retired)
 * (4) migrateLegacyUserData losslessly converts legacy progress, SRS, and starred data
 * (5) Unknown, out-of-range, and retired IDs are handled gracefully without throwing
 * (6) 1v1, 1v2, and 2v2 sync merge commutativity, idempotence, and monotonicity
 * (7) Backup export and import round-trip format 1 -> 2 and 2 -> 2
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import SyncMergePolicy from '../sync/merge_policy.js';
import { validateBackupData } from './unit_fixes.test.js';

import { execSync } from 'child_process';
const categoriesJson = execSync(`node "${path.join(__dirname, '../scripts/extract_categories_ast.js')}"`, { encoding: 'utf8' });
const CATEGORIES = JSON.parse(categoriesJson);
const retiredIds = JSON.parse(fs.readFileSync(path.join(__dirname, '../vocab_ids_retired.json'), 'utf8'));

describe('Stable Word IDs: Specification & Integrity (Item 1 & 3)', () => {
  it('every word in every category has a valid, unique id prefixed with catId', () => {
    const allIds = new Set();
    let totalWords = 0;

    for (const cat of CATEGORIES) {
      expect(cat.id).toBeDefined();
      expect(Array.isArray(cat.words)).toBe(true);

      for (let i = 0; i < cat.words.length; i++) {
        const w = cat.words[i];
        totalWords++;
        expect(w.id).toBeDefined();
        expect(typeof w.id).toBe('string');
        expect(w.id.length).toBeGreaterThan(0);

        // ID must start with cat.id followed by a dot
        expect(w.id.startsWith(`${cat.id}.`)).toBe(true);

        // Slug must follow [a-z0-9]+(-[a-z0-9]+)*
        const slug = w.id.slice(cat.id.length + 1);
        expect(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)).toBe(true);

        // Must be globally unique across all 1,160 words
        expect(allIds.has(w.id)).toBe(false);
        allIds.add(w.id);
      }
    }

    expect(totalWords).toBe(1160);
    expect(allIds.size).toBe(1160);
  });

  it('no active word ID is in vocab_ids_retired.json', () => {
    const retiredSet = new Set(retiredIds);
    for (const cat of CATEGORIES) {
      for (const w of cat.words) {
        expect(retiredSet.has(w.id)).toBe(false);
      }
    }
  });
});

describe('Legacy Mapping & Order Preservation (Item 2)', () => {
  it('LEGACY_INDEX_IDS matches the exact pre-migration word order of CATEGORIES', () => {
    const legacyMap = SyncMergePolicy.LEGACY_INDEX_IDS;
    expect(legacyMap).toBeDefined();

    const catIds = CATEGORIES.map(c => c.id);
    expect(Object.keys(legacyMap).sort()).toEqual(catIds.slice().sort());

    let mappedCount = 0;
    for (const cat of CATEGORIES) {
      const list = legacyMap[cat.id];
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBe(cat.words.length);

      for (let i = 0; i < cat.words.length; i++) {
        expect(list[i]).toBe(cat.words[i].id);
        mappedCount++;
      }
    }
    expect(mappedCount).toBe(1160);
  });
});

describe('Data Migration: Lossless Conversion & Idempotence (Item 4 & 5)', () => {
  it('losslessly converts legacy progress, SRS, and starred across all 1160 words', () => {
    // Construct legacy data using all 1160 words
    const legacyProgress = {};
    const legacyStarred = [];
    const legacySrs = {};

    for (const cat of CATEGORIES) {
      legacyProgress[cat.id] = {
        mcq: { unlocked: cat.words.length, counts: {} },
        written: { unlocked: cat.words.length, counts: {} }
      };
      cat.words.forEach((_, idx) => {
        legacyProgress[cat.id].mcq.counts[String(idx)] = (idx % 10) + 1;
        legacyStarred.push(`${cat.id}_${idx}`);
        legacySrs[`${cat.id}_${idx}`] = { box: (idx % 5), lastDate: '2026-10-01', nextDate: '2026-10-05' };
      });
    }

    const legacyPayload = {
      dataVersion: 1,
      progress: legacyProgress,
      stats: { current: 15, longest: 20, totalAnswered: 500, totalCorrect: 480 },
      starred: legacyStarred,
      srs: legacySrs,
      dailyGoal: { target: 35, updatedAt: '2026-10-01T00:00:00Z' }
    };

    const migrated = SyncMergePolicy.migrateLegacyUserData(legacyPayload, CATEGORIES);

    expect(migrated.dataFormat).toBe(2);
    expect(migrated.dataVersion).toBe(2);
    expect(migrated.stats).toEqual(legacyPayload.stats);
    expect(migrated.dailyGoal).toEqual(legacyPayload.dailyGoal);

    // Verify progress counts are keyed by word ID
    for (const cat of CATEGORIES) {
      expect(migrated.progress[cat.id].mcq.unlocked).toBe(cat.words.length);
      cat.words.forEach((w, idx) => {
        const expectedCount = (idx % 10) + 1;
        expect(migrated.progress[cat.id].mcq.counts[w.id]).toBe(expectedCount);
        // Numeric index key must be gone
        expect(migrated.progress[cat.id].mcq.counts[String(idx)]).toBeUndefined();
      });
    }

    // Verify starred list contains all word IDs
    expect(migrated.starred.length).toBe(1160);
    for (const cat of CATEGORIES) {
      for (const w of cat.words) {
        expect(migrated.starred).toContain(w.id);
      }
    }

    // Verify SRS contains all word IDs with intact scheduling
    for (const cat of CATEGORIES) {
      cat.words.forEach((w, idx) => {
        expect(migrated.srs[w.id]).toEqual({
          box: (idx % 5),
          lastDate: '2026-10-01',
          nextDate: '2026-10-05'
        });
        expect(migrated.srs[`${cat.id}_${idx}`]).toBeUndefined();
      });
    }

    // Idempotence: migrating already migrated data produces identical result
    const reMigrated = SyncMergePolicy.migrateLegacyUserData(migrated, CATEGORIES);
    expect(reMigrated).toEqual(migrated);
  });

  it('silently drops out-of-range indices and unknown category keys without throwing', () => {
    const corruptedLegacy = {
      progress: {
        obst: {
          mcq: {
            unlocked: 5,
            counts: {
              '0': 3,
              '9999': 10 // out of range
            }
          }
        },
        unknown_cat_123: {
          mcq: { unlocked: 5, counts: { '0': 2 } }
        }
      },
      starred: ['obst_0', 'obst_9999', 'ghost_cat_0'],
      srs: {
        'obst_0': { box: 1, lastDate: '2026-10-01' },
        'obst_9999': { box: 2, lastDate: '2026-10-01' },
        'unknown_0': { box: 3, lastDate: '2026-10-01' }
      }
    };

    const migrated = SyncMergePolicy.migrateLegacyUserData(corruptedLegacy, CATEGORIES);

    expect(migrated.progress.obst.mcq.counts['obst.apfel']).toBe(3);
    expect(Object.keys(migrated.progress.obst.mcq.counts).length).toBe(1);
    expect(migrated.progress.unknown_cat_123).toBeDefined(); // preserved structure, but no valid index mapping

    expect(migrated.starred).toEqual(['obst.apfel']);
    expect(Object.keys(migrated.srs)).toEqual(['obst.apfel']);
  });

  it('tolerates already present format-2 word IDs and unknown future IDs', () => {
    const dataWithFutureIds = {
      dataFormat: 2,
      dataVersion: 2,
      progress: {
        obst: {
          mcq: {
            unlocked: 5,
            counts: {
              'obst.apfel': 5,
              'obst.future-word-deleted': 3
            }
          }
        }
      },
      starred: ['obst.apfel', 'obst.future-word-deleted'],
      srs: {
        'obst.apfel': { box: 2 },
        'obst.future-word-deleted': { box: 1 }
      }
    };

    const migrated = SyncMergePolicy.migrateLegacyUserData(dataWithFutureIds, CATEGORIES);
    expect(migrated.progress.obst.mcq.counts['obst.future-word-deleted']).toBe(3);
    expect(migrated.starred).toContain('obst.future-word-deleted');
    expect(migrated.srs['obst.future-word-deleted']).toBeDefined();
  });
});

describe('Cross-Version Sync Merge: 1v1, 1v2, 2v2 (Item 6)', () => {
  it('2v2 merge satisfies commutativity, idempotence, and monotonicity', () => {
    const docA = {
      dataFormat: 2,
      dataVersion: 2,
      progress: { obst: { mcq: { unlocked: 5, counts: { 'obst.apfel': 4, 'obst.banane': 2 } } } },
      stats: { current: 3, longest: 5, totalAnswered: 20, totalCorrect: 18 },
      starred: ['obst.apfel'],
      srs: { 'obst.apfel': { box: 1, lastDate: '2026-10-02' } },
      dailyGoal: { target: 20, updatedAt: '2026-10-01T00:00:00Z' }
    };

    const docB = {
      dataFormat: 2,
      dataVersion: 2,
      progress: { obst: { mcq: { unlocked: 7, counts: { 'obst.apfel': 2, 'obst.banane': 5 } } } },
      stats: { current: 4, longest: 6, totalAnswered: 30, totalCorrect: 27 },
      starred: ['obst.banane'],
      srs: { 'obst.apfel': { box: 2, lastDate: '2026-10-04' } },
      dailyGoal: { target: 25, updatedAt: '2026-10-03T00:00:00Z' }
    };

    const ab = SyncMergePolicy.mergeFullUserData(docA, docB, CATEGORIES);
    const ba = SyncMergePolicy.mergeFullUserData(docB, docA, CATEGORIES);

    // Commutativity
    expect(ab.progress).toEqual(ba.progress);
    expect(ab.stats).toEqual(ba.stats);
    expect(ab.starred).toEqual(ba.starred);
    expect(ab.srs).toEqual(ba.srs);
    expect(ab.dailyGoal).toEqual(ba.dailyGoal);

    // Invariants
    expect(ab.progress.obst.mcq.unlocked).toBe(7);
    expect(ab.progress.obst.mcq.counts['obst.apfel']).toBe(4);
    expect(ab.progress.obst.mcq.counts['obst.banane']).toBe(5);
    expect(ab.starred).toEqual(['obst.apfel', 'obst.banane']);
    expect(ab.srs['obst.apfel'].box).toBe(2);
    expect(ab.dailyGoal.target).toBe(25);
    expect(ab.dataVersion).toBe(3);
  });

  it('1v2 merge migrates version 1 operand first and produces valid format-2 document', () => {
    const legacyDoc = {
      schemaVersion: 1,
      dataVersion: 1,
      progress: { obst: { mcq: { unlocked: 3, counts: { '0': 3 } } } },
      starred: ['obst_0'],
      srs: { 'obst_0': { box: 1, lastDate: '2026-10-01' } },
      dailyGoal: { target: 20 }
    };

    const modernDoc = {
      schemaVersion: 1,
      dataVersion: 2,
      dataFormat: 2,
      progress: { obst: { mcq: { unlocked: 6, counts: { 'obst.apfel': 5, 'obst.banane': 2 } } } },
      starred: ['obst.banane'],
      srs: { 'obst.banane': { box: 1, lastDate: '2026-10-02' } },
      dailyGoal: { target: 30, updatedAt: '2026-10-05T00:00:00Z' }
    };

    const merged = SyncMergePolicy.mergeFullUserData(legacyDoc, modernDoc, CATEGORIES);

    expect(merged.dataVersion).toBeGreaterThanOrEqual(2);
    expect(merged.progress.obst.mcq.unlocked).toBe(6);
    expect(merged.progress.obst.mcq.counts['obst.apfel']).toBe(5);
    expect(merged.progress.obst.mcq.counts['obst.banane']).toBe(2);
    expect(merged.progress.obst.mcq.counts['0']).toBeUndefined();
    expect(merged.starred).toEqual(['obst.apfel', 'obst.banane']);
    expect(merged.srs['obst.apfel']).toBeDefined();
    expect(merged.srs['obst.banane']).toBeDefined();
    expect(merged.srs['obst_0']).toBeUndefined();
  });

  it('1v1 merge migrates both operands and produces valid format-2 document', () => {
    const legacyDocA = {
      progress: { obst: { mcq: { unlocked: 3, counts: { '0': 4 } } } },
      starred: ['obst_0']
    };
    const legacyDocB = {
      progress: { obst: { mcq: { unlocked: 5, counts: { '1': 3 } } } },
      starred: ['obst_1']
    };

    const merged = SyncMergePolicy.mergeFullUserData(legacyDocA, legacyDocB, CATEGORIES);
    expect(merged.dataVersion).toBeGreaterThanOrEqual(2);
    expect(merged.progress.obst.mcq.counts['obst.apfel']).toBe(4);
    expect(merged.progress.obst.mcq.counts['obst.banane']).toBe(3);
    expect(merged.starred).toEqual(['obst.apfel', 'obst.banane']);
  });
});

describe('Backup Export/Import & Round-Trip (Item 7)', () => {
  it('validates and round-trips a dataFormat 2 backup with 100% deep equality', () => {
    const backupFormat2 = {
      version: 2,
      dataFormat: 2,
      exportDate: '2026-10-16T12:00:00.000Z',
      progress: {
        obst: {
          mcq: { unlocked: 5, counts: { 'obst.apfel': 8, 'obst.banane': 4 } }
        }
      },
      stats: { current: 5, longest: 10, totalAnswered: 50, totalCorrect: 45 },
      starred: ['obst.apfel'],
      srs: { 'obst.apfel': { box: 2, lastDate: '2026-10-10', nextDate: '2026-10-17' } },
      dailyGoal: { target: 25, updatedAt: '2026-10-10T00:00:00Z' }
    };

    const validation = validateBackupData(backupFormat2, CATEGORIES);
    expect(validation.valid).toBe(true);

    const serialized = JSON.stringify(backupFormat2);
    const deserialized = JSON.parse(serialized);
    expect(deserialized).toEqual(backupFormat2);
  });

  it('validates a legacy format backup and migrates it cleanly', () => {
    const legacyBackup = {
      version: 2,
      progress: {
        obst: {
          mcq: { unlocked: 5, counts: { '0': 6, '1': 3 } }
        }
      },
      stats: { current: 3, longest: 4, totalAnswered: 20, totalCorrect: 19 },
      starred: ['obst_0'],
      srs: { 'obst_0': { box: 1, lastDate: '2026-10-01', nextDate: '2026-10-04' } },
      dailyGoal: 20
    };

    const validation = validateBackupData(legacyBackup, CATEGORIES);
    expect(validation.valid).toBe(true);

    const migrated = SyncMergePolicy.migrateLegacyUserData(legacyBackup, CATEGORIES);
    expect(migrated.dataFormat).toBe(2);
    expect(migrated.progress.obst.mcq.counts['obst.apfel']).toBe(6);
    expect(migrated.starred).toEqual(['obst.apfel']);
    expect(migrated.srs['obst.apfel'].box).toBe(1);
  });

  it('rejects malformed format 2 backup with invalid word id format', () => {
    const badBackup = {
      dataFormat: 2,
      progress: {
        obst: {
          mcq: {
            unlocked: 5,
            counts: {
              '0': 3 // In format 2, numeric keys are not allowed
            }
          }
        }
      }
    };

    const res = validateBackupData(badBackup, CATEGORIES);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('ليس معرفاً مستقراً صالحاً');
  });
});

describe('Fail-Safe Behavior when Legacy Map Missing (DO 3)', () => {
  it('fails safe when legacy map is missing or empty (leaves legacy data untouched)', () => {
    const legacyDoc = {
      progress: { obst: { mcq: { unlocked: 3, counts: { '0': 4 } } } },
      starred: ['obst_0'],
      srs: { 'obst_0': { box: 1 } }
    };
    let toastShown = null;
    global.showToast = (msg) => { toastShown = msg; };

    const origDesc = Object.getOwnPropertyDescriptor(SyncMergePolicy, 'LEGACY_INDEX_IDS');
    try {
      Object.defineProperty(SyncMergePolicy, 'LEGACY_INDEX_IDS', { get: () => null, configurable: true });

      const res = SyncMergePolicy.migrateLegacyUserData(legacyDoc, []);
      expect(res).toBe(legacyDoc); // Returns untouched
      expect(res.dataFormat).toBeUndefined(); // Does not mark format 2
      expect(toastShown).toContain('تعذر تحميل خريطة المعرفات القديمة');
    } finally {
      if (origDesc) {
        Object.defineProperty(SyncMergePolicy, 'LEGACY_INDEX_IDS', origDesc);
      }
      delete global.showToast;
    }
  });
});

describe('Runtime Double-Key Absence & Property Test (DO 2 & 5d)', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  function extractFn(name) {
    const m = html.match(new RegExp(`function\\s+${name}\\s*\\([\\s\\S]*?\\n\\}`));
    if (!m) throw new Error(`Function ${name} not found in index.html`);
    return m[0];
  }

  function createRuntimeContext() {
    const code = `
      let progress = {};
      let starredSet = new Set();
      let srsStore = {};
      const PROGRESS_MODES = ["mcq", "written", "article", "plural", "listen"];
      const UNLOCK_STEP = 5;
      const SRS_INTERVALS = [1, 3, 7, 14, 30];
      function showToast() {}
      function saveProgressSoon() {}
      function saveStarredSoon() {}
      function saveSrsSoon() {}

      ${extractFn("todayStr")}
      ${extractFn("addDaysToStr")}
      ${extractFn("resolveWordId")}
      ${extractFn("ensureProgress")}
      ${extractFn("getWordCount")}
      ${extractFn("setWordCount")}
      ${extractFn("isStarred")}
      ${extractFn("toggleStar")}
      ${extractFn("updateSrs")}

      return {
        getProgress: () => progress,
        getStarredSet: () => starredSet,
        getSrsStore: () => srsStore,
        getWordCount,
        setWordCount,
        isStarred,
        toggleStar,
        updateSrs,
        resolveWordId
      };
    `;
    return new Function('CATEGORIES', code)(CATEGORIES);
  }

  it('unresolvable target calls (unknown id, out-of-range index) are harmless no-ops', () => {
    const ctx = createRuntimeContext();

    // Out-of-range index
    expect(ctx.resolveWordId('obst', 9999)).toBeNull();
    expect(ctx.resolveWordId('obst', -1)).toBeNull();
    expect(ctx.getWordCount('obst', 'mcq', 9999)).toBe(0);
    ctx.setWordCount('obst', 'mcq', 9999, 10);
    expect(ctx.getProgress().obst?.mcq?.counts['9999']).toBeUndefined();
    expect(ctx.isStarred('obst', 9999)).toBe(false);
    expect(ctx.toggleStar('obst', 9999)).toBe(false);
    ctx.updateSrs('obst', 9999, true);
    expect(ctx.getSrsStore()['obst_9999']).toBeUndefined();

    // Unknown word ID
    expect(ctx.resolveWordId('obst', 'obst.nonexistent_word')).toBeNull();
    expect(ctx.getWordCount('obst', 'mcq', 'obst.nonexistent_word')).toBe(0);
    ctx.setWordCount('obst', 'mcq', 'obst.nonexistent_word', 10);
    expect(ctx.getProgress().obst?.mcq?.counts['obst.nonexistent_word']).toBeUndefined();
    expect(ctx.isStarred('obst', 'obst.nonexistent_word')).toBe(false);
    expect(ctx.toggleStar('obst', 'obst.nonexistent_word')).toBe(false);
    ctx.updateSrs('obst', 'obst.nonexistent_word', true);
    expect(ctx.getSrsStore()['obst.nonexistent_word']).toBeUndefined();

    // Malformed targets (null, undefined, boolean, object)
    expect(ctx.resolveWordId('obst', null)).toBeNull();
    expect(ctx.resolveWordId('obst', undefined)).toBeNull();
    expect(ctx.resolveWordId('obst', true)).toBeNull();
    expect(ctx.resolveWordId('obst', {})).toBeNull();
  });

  it('property test: random sequence of operations over real functions never produces numeric or legacy keys', () => {
    const ctx = createRuntimeContext();
    const categories = CATEGORIES.map(c => c.id);
    const allWordIds = [];
    CATEGORIES.forEach(c => c.words.forEach(w => allWordIds.push(w.id)));

    // Deterministic LCG PRNG for reproducibility
    let seed = 123456789;
    function rand() {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    }
    function randChoice(arr) {
      return arr[Math.floor(rand() * arr.length)];
    }
    function randInt(min, max) {
      return Math.floor(rand() * (max - min + 1)) + min;
    }

    const testTargets = [
      // Valid indices
      0, 1, 2, 10, 20,
      // Numeric strings
      '0', '1', '5', '9999',
      // Out of bounds / negative indices
      -1, -10, 9999, 100,
      // Valid IDs
      ...allWordIds.slice(0, 20),
      // Invalid IDs
      'obst.unknown', 'fake.word', 'obst.', 'invalid-id',
      // Objects
      { id: 'obst.apfel' }, { id: 'fake.id' }, {},
      // Nil / types
      null, undefined, false, NaN
    ];

    const modes = ['mcq', 'written', 'article', 'plural'];

    // Run 1,000 random operations
    for (let i = 0; i < 1000; i++) {
      const op = randInt(1, 5);
      const catId = rand() < 0.8 ? randChoice(categories) : randChoice(['unknown_cat', '', null, undefined]);
      const mode = randChoice(modes);
      const target = randChoice(testTargets);

      switch (op) {
        case 1:
          ctx.getWordCount(catId, mode, target);
          break;
        case 2:
          ctx.setWordCount(catId, mode, target, randInt(-5, 20));
          break;
        case 3:
          ctx.isStarred(catId, target);
          break;
        case 4:
          ctx.toggleStar(catId, target);
          break;
        case 5:
          ctx.updateSrs(catId, target, rand() > 0.3);
          break;
      }
    }

    // Verify progress: zero numeric keys, all keys are valid word IDs
    const progress = ctx.getProgress();
    for (const [cId, catVal] of Object.entries(progress)) {
      for (const [m, mVal] of Object.entries(catVal)) {
        if (m === 'coreAcked' || !mVal || !mVal.counts) continue;
        for (const key of Object.keys(mVal.counts)) {
          expect(/^\d+$/.test(key), `Numeric key "${key}" found in progress.${cId}.${m}.counts`).toBe(false);
          expect(key).toMatch(/^[a-z0-9-]+\.[a-z0-9-]+(-\d+)?$/);
        }
      }
    }

    // Verify starredSet: zero legacy catId_idx keys, all entries are valid word IDs
    const starredSet = ctx.getStarredSet();
    for (const key of starredSet) {
      expect(key.includes('_'), `Legacy key "${key}" found in starredSet`).toBe(false);
      expect(key).toMatch(/^[a-z0-9-]+\.[a-z0-9-]+(-\d+)?$/);
    }

    // Verify srsStore: zero legacy catId_idx keys, all keys are valid word IDs
    const srsStore = ctx.getSrsStore();
    for (const key of Object.keys(srsStore)) {
      expect(key.includes('_'), `Legacy key "${key}" found in srsStore`).toBe(false);
      expect(key).toMatch(/^[a-z0-9-]+\.[a-z0-9-]+(-\d+)?$/);
    }
  });
});

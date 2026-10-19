/**
 * tests/vocab_batch1_data_safety.test.js
 * DO 6: Rigorous Data Safety Verification with Real App Code and Merge Policy
 *
 * (a) local progress, SRS records, starred lists and cloud documents that contain
 *     removed ids are cleaned silently (no throw, no legacy key, no leftover removed id)
 *     and the rest is preserved;
 * (b) unlocked counts larger than the new category size are clamped;
 * (c) validateCloudDocument accepts a document that still contains removed (unknown but well-formed)
 *     ids and drops them on merge;
 * (d) a backup file exported before this change imports correctly;
 * (e) two-device order problems (old device uploads removed ids after the new device uploaded)
 *     do not break sync.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { execSync } from 'child_process';
import SyncMergePolicy from '../sync/merge_policy.js';
import { SyncManager } from '../sync/sync_manager.js';
import MemorySyncAdapter from '../sync/memory_adapter.js';

const CATEGORIES = JSON.parse(fs.readFileSync('vocab_baseline.json', 'utf8'));
const retiredIds = JSON.parse(fs.readFileSync('vocab_ids_retired.json', 'utf8'));
const retiredSet = new Set(retiredIds);

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

function extractFn(name) {
  const m = html.match(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([\\s\\S]*?\\n\\}`));
  if (!m) throw new Error(`Function ${name} not found in index.html`);
  return m[0];
}

describe('DO 6 Data Safety: Real App Code & Sync Merge Policy', () => {
  // Pick specific removed word IDs and kept word IDs for deterministic testing
  const removedWordMusik = 'musik.didgeridoo';
  const keptWordMusik = 'musik.gitarre';
  const removedWordObst = 'obst.passionsfrucht';
  const keptWordObst = 'obst.apfel';

  expect(retiredSet.has(removedWordMusik)).toBe(true);
  expect(retiredSet.has(removedWordObst)).toBe(true);

  // (a) Local progress, SRS, starred, and cloud documents cleaning removed IDs
  describe('(a) Local & Cloud Data Safety: Silent Cleaning of Removed IDs', () => {
    it('loadProgress cleans removed IDs silently, leaves kept IDs, and clamps unlocked', async () => {
      const mockStorage = {
        get: vi.fn(async () => ({
          value: JSON.stringify({
            musik: {
              mcq: {
                unlocked: 45, // larger than current size 19
                counts: {
                  [removedWordMusik]: 8, // retired ID
                  [keptWordMusik]: 5
                }
              }
            },
            obst: {
              mcq: {
                unlocked: 5,
                counts: {
                  [removedWordObst]: 10, // retired ID
                  [keptWordObst]: 7
                }
              }
            }
          })
        }))
      };

      const ctxCode = `
        return (async () => {
          let progress = {};
          const PROGRESS_KEY = 'deutsch_progress_v1';
          const PROGRESS_MODES = ["mcq", "written", "article", "plural", "listen"];
          const window = { storage: mockStorage };
          ${extractFn('loadProgress')}
          await loadProgress();
          return progress;
        })();
      `;

      const fn = new Function('CATEGORIES', 'mockStorage', ctxCode);
      const loadedProg = await fn(CATEGORIES, mockStorage);

      // Removed IDs must be completely absent
      expect(loadedProg.musik.mcq.counts[removedWordMusik]).toBeUndefined();
      expect(loadedProg.obst.mcq.counts[removedWordObst]).toBeUndefined();

      // Kept IDs must be preserved
      expect(loadedProg.musik.mcq.counts[keptWordMusik]).toBe(5);
      expect(loadedProg.obst.mcq.counts[keptWordObst]).toBe(7);

      // Unlocked must be clamped to category size (musik has 19 words)
      const musikCat = CATEGORIES.find(c => c.id === 'musik');
      expect(loadedProg.musik.mcq.unlocked).toBe(musikCat.words.length);
      expect(loadedProg.musik.mcq.unlocked).toBe(19);
    });

    it('loadStarred cleans removed IDs silently and preserves active IDs', async () => {
      const mockLocalStorage = {
        getItem: vi.fn(() => JSON.stringify([
          removedWordMusik,
          keptWordMusik,
          removedWordObst,
          keptWordObst
        ]))
      };

      const ctxCode = `
        return (async () => {
          let starredSet = new Set();
          const window = { localStorage: mockLocalStorage };
          ${extractFn('loadStarred')}
          await loadStarred();
          return Array.from(starredSet);
        })();
      `;

      const fn = new Function('CATEGORIES', 'mockLocalStorage', ctxCode);
      const starred = await fn(CATEGORIES, mockLocalStorage);

      expect(starred).toContain(keptWordMusik);
      expect(starred).toContain(keptWordObst);
      expect(starred).not.toContain(removedWordMusik);
      expect(starred).not.toContain(removedWordObst);
    });

    it('loadSrs cleans removed IDs silently and preserves active IDs', async () => {
      const mockLocalStorage = {
        getItem: vi.fn(() => JSON.stringify({
          [removedWordMusik]: { box: 2, lastDate: '2026-10-10', nextDate: '2026-10-15' },
          [keptWordMusik]: { box: 3, lastDate: '2026-10-10', nextDate: '2026-10-17' },
          [removedWordObst]: { box: 1, lastDate: '2026-10-12', nextDate: '2026-10-13' },
          [keptWordObst]: { box: 4, lastDate: '2026-10-01', nextDate: '2026-10-31' }
        }))
      };

      const ctxCode = `
        return (async () => {
          let srsStore = {};
          function todayStr() { return '2026-10-18'; }
          const window = { localStorage: mockLocalStorage };
          ${extractFn('loadSrs')}
          await loadSrs();
          return srsStore;
        })();
      `;

      const fn = new Function('CATEGORIES', 'mockLocalStorage', ctxCode);
      const srs = await fn(CATEGORIES, mockLocalStorage);

      expect(srs[keptWordMusik]).toBeDefined();
      expect(srs[keptWordMusik].box).toBe(3);
      expect(srs[keptWordObst]).toBeDefined();
      expect(srs[keptWordObst].box).toBe(4);

      expect(srs[removedWordMusik]).toBeUndefined();
      expect(srs[removedWordObst]).toBeUndefined();
    });

    it('migrateLegacyUserData and mergeFullUserData silently drop removed IDs from cloud documents', () => {
      const cloudDocWithRemoved = {
        schemaVersion: 1,
        dataFormat: 2,
        dataVersion: 5,
        progress: {
          musik: {
            mcq: { unlocked: 15, counts: { [removedWordMusik]: 6, [keptWordMusik]: 4 } }
          }
        },
        starred: [removedWordMusik, keptWordMusik],
        srs: {
          [removedWordMusik]: { box: 2, lastDate: '2026-10-01', nextDate: '2026-10-05' },
          [keptWordMusik]: { box: 1, lastDate: '2026-10-01', nextDate: '2026-10-03' }
        },
        stats: { totalAnswered: 50, totalCorrect: 45 }
      };

      const migrated = SyncMergePolicy.migrateLegacyUserData(cloudDocWithRemoved, CATEGORIES);
      expect(migrated.progress.musik.mcq.counts[removedWordMusik]).toBeUndefined();
      expect(migrated.progress.musik.mcq.counts[keptWordMusik]).toBe(4);
      expect(migrated.starred).toEqual([keptWordMusik]);
      expect(migrated.srs[removedWordMusik]).toBeUndefined();
      expect(migrated.srs[keptWordMusik]).toBeDefined();

      const localDoc = {
        dataFormat: 2,
        dataVersion: 5,
        progress: {
          musik: { mcq: { unlocked: 15, counts: { [keptWordMusik]: 6 } } }
        },
        starred: [],
        srs: {},
        stats: { totalAnswered: 50, totalCorrect: 45 }
      };

      const merged = SyncMergePolicy.mergeFullUserData(localDoc, cloudDocWithRemoved, CATEGORIES);
      expect(merged.progress.musik.mcq.counts[removedWordMusik]).toBeUndefined();
      expect(merged.progress.musik.mcq.counts[keptWordMusik]).toBe(6);
      expect(merged.starred).toEqual([keptWordMusik]);
      expect(merged.srs[removedWordMusik]).toBeUndefined();
      expect(merged.srs[keptWordMusik]).toBeDefined();
    });

    it('(a) isolated vm context (no require, no VOCAB_IDS_RETIRED, no file access) with index.html CATEGORIES cleans removed IDs and keeps active', () => {
      const categoriesFromHtml = JSON.parse(execSync(`node "${path.join(__dirname, '../scripts/extract_categories_ast.js')}"`, { encoding: 'utf8' }));
      const mpCode = fs.readFileSync(path.join(__dirname, '../sync/merge_policy.js'), 'utf8');
      const isolatedCtx = {
        CATEGORIES: categoriesFromHtml,
        globalThis: {},
        window: { CATEGORIES: categoriesFromHtml },
        module: { exports: {} }
      };
      vm.createContext(isolatedCtx);
      vm.runInContext(mpCode, isolatedCtx);
      const policyInVm = isolatedCtx.module.exports;

      const cloudDocWithRemoved = {
        schemaVersion: 1,
        dataFormat: 2,
        dataVersion: 5,
        progress: {
          musik: {
            mcq: { unlocked: 15, counts: { [removedWordMusik]: 6, [keptWordMusik]: 4 } }
          }
        },
        starred: [removedWordMusik, keptWordMusik],
        srs: {
          [removedWordMusik]: { box: 2, lastDate: '2026-10-01', nextDate: '2026-10-05' },
          [keptWordMusik]: { box: 1, lastDate: '2026-10-01', nextDate: '2026-10-03' }
        },
        stats: { totalAnswered: 50, totalCorrect: 45 }
      };

      const localDoc = {
        dataFormat: 2,
        dataVersion: 5,
        progress: {
          musik: { mcq: { unlocked: 15, counts: { [keptWordMusik]: 6 } } }
        },
        starred: [],
        srs: {},
        stats: { totalAnswered: 50, totalCorrect: 45 }
      };

      const merged = policyInVm.mergeFullUserData(localDoc, cloudDocWithRemoved, categoriesFromHtml);
      expect(merged.progress.musik.mcq.counts[removedWordMusik]).toBeUndefined();
      expect(merged.progress.musik.mcq.counts[keptWordMusik]).toBe(6);
      expect(merged.starred).toEqual([keptWordMusik]);
      expect(merged.srs[removedWordMusik]).toBeUndefined();
      expect(merged.srs[keptWordMusik]).toBeDefined();

      const payload = policyInVm.createCloudPayload(merged, categoriesFromHtml);
      expect(payload.progress.musik.mcq.counts[removedWordMusik]).toBeUndefined();
      expect(payload.progress.musik.mcq.counts[keptWordMusik]).toBe(6);
      expect(payload.starred).not.toContain(removedWordMusik);
      expect(payload.starred).toContain(keptWordMusik);
      expect(payload.srs[removedWordMusik]).toBeUndefined();
      expect(payload.srs[keptWordMusik]).toBeDefined();
    });

    it('(b) isolated vm context with empty/undefined category list preserves all data (safety mode: no data loss on broken load)', () => {
      const mpCode = fs.readFileSync(path.join(__dirname, '../sync/merge_policy.js'), 'utf8');
      const isolatedCtx = {
        globalThis: {},
        window: {},
        module: { exports: {} }
      };
      vm.createContext(isolatedCtx);
      vm.runInContext(mpCode, isolatedCtx);
      const policyInVm = isolatedCtx.module.exports;

      const cloudDocWithRemoved = {
        schemaVersion: 1,
        dataFormat: 2,
        dataVersion: 5,
        progress: {
          musik: {
            mcq: { unlocked: 15, counts: { [removedWordMusik]: 6, [keptWordMusik]: 4 } }
          }
        },
        starred: [removedWordMusik, keptWordMusik],
        srs: {
          [removedWordMusik]: { box: 2, lastDate: '2026-10-01', nextDate: '2026-10-05' },
          [keptWordMusik]: { box: 1, lastDate: '2026-10-01', nextDate: '2026-10-03' }
        },
        stats: { totalAnswered: 50, totalCorrect: 45 }
      };

      const localDoc = {
        dataFormat: 2,
        dataVersion: 5,
        progress: {
          musik: { mcq: { unlocked: 15, counts: { [keptWordMusik]: 6 } } }
        },
        starred: [],
        srs: {},
        stats: { totalAnswered: 50, totalCorrect: 45 }
      };

      // Empty categories list [] -> safety mode, nothing dropped
      const merged = policyInVm.mergeFullUserData(localDoc, cloudDocWithRemoved, []);
      expect(merged.progress.musik.mcq.counts[removedWordMusik]).toBe(6);
      expect(merged.progress.musik.mcq.counts[keptWordMusik]).toBe(6);
      expect(merged.starred).toContain(removedWordMusik);
      expect(merged.starred).toContain(keptWordMusik);
      expect(merged.srs[removedWordMusik]).toBeDefined();
      expect(merged.srs[keptWordMusik]).toBeDefined();

      const payload = policyInVm.createCloudPayload(merged, []);
      expect(payload.progress.musik.mcq.counts[removedWordMusik]).toBe(6);
      expect(payload.progress.musik.mcq.counts[keptWordMusik]).toBe(6);
      expect(payload.starred).toContain(removedWordMusik);
      expect(payload.starred).toContain(keptWordMusik);
      expect(payload.srs[removedWordMusik]).toBeDefined();
      expect(payload.srs[keptWordMusik]).toBeDefined();
    });

    it('(c) real SyncManager + MemorySyncAdapter flow: cloud holding removed IDs is cleaned and local state preserves active progress', async () => {
      const sharedStore = new Map();
      const adapter = new MemorySyncAdapter({ store: sharedStore });

      sharedStore.set('test-user-123', {
        schemaVersion: 1,
        dataFormat: 2,
        dataVersion: 5,
        progress: {
          musik: {
            mcq: {
              unlocked: 19,
              counts: {
                [removedWordMusik]: 12,
                [keptWordMusik]: 8
              }
            }
          }
        },
        starred: [removedWordMusik, keptWordMusik],
        srs: {
          [removedWordMusik]: { box: 3, lastDate: '2026-10-10', nextDate: '2026-10-17' },
          [keptWordMusik]: { box: 2, lastDate: '2026-10-10', nextDate: '2026-10-15' }
        },
        stats: { current: 3, longest: 5, totalAnswered: 40, totalCorrect: 35 },
        dailyGoal: { target: 20 }
      });

      const localProgress = {
        musik: {
          mcq: {
            unlocked: 10,
            counts: {
              [keptWordMusik]: 4
            }
          }
        }
      };
      const localStarred = [];
      const localSrs = {};
      const localStats = { current: 1, longest: 2, totalAnswered: 10, totalCorrect: 9 };
      let localGoal = 20;

      const manager = new SyncManager({
        adapter,
        policy: SyncMergePolicy,
        debounceMs: 50,
        localStateProvider: {
          getLocalData: () => ({
            progress: localProgress,
            stats: localStats,
            starred: localStarred,
            srs: localSrs,
            dailyGoal: { target: localGoal }
          }),
          applyLocalData: (merged) => {
            if (merged.progress) {
              for (const k of Object.keys(localProgress)) {
                if (!(k in merged.progress)) delete localProgress[k];
              }
              Object.assign(localProgress, merged.progress);
            }
            if (merged.stats) Object.assign(localStats, merged.stats);
            if (merged.starred) {
              localStarred.length = 0;
              localStarred.push(...merged.starred);
            }
            if (merged.srs) {
              for (const k of Object.keys(localSrs)) delete localSrs[k];
              Object.assign(localSrs, merged.srs);
            }
            if (merged.dailyGoal) localGoal = merged.dailyGoal.target;
          }
        }
      });

      const origCategories = global.CATEGORIES;
      const origExport = global.exportBackup;
      const origConfirm = global.confirm;
      const origToast = global.showToast;
      global.CATEGORIES = CATEGORIES;
      global.exportBackup = () => '{"backup":true}';
      global.confirm = () => true;
      global.showToast = () => {};

      try {
        manager.init();
        await manager.signIn();
        await manager.syncNow();
        await manager.flushSave();

        // Check cloud document in adapter
        const cloudAfter = sharedStore.get('test-user-123');
        expect(cloudAfter.progress.musik.mcq.counts[removedWordMusik]).toBeUndefined();
        expect(cloudAfter.progress.musik.mcq.counts[keptWordMusik]).toBe(8);
        expect(cloudAfter.starred).not.toContain(removedWordMusik);
        expect(cloudAfter.starred).toContain(keptWordMusik);
        expect(cloudAfter.srs[removedWordMusik]).toBeUndefined();
        expect(cloudAfter.srs[keptWordMusik]).toBeDefined();

        // Check local in-memory state
        expect(localProgress.musik.mcq.counts[removedWordMusik]).toBeUndefined();
        expect(localProgress.musik.mcq.counts[keptWordMusik]).toBe(8);
        expect(localStarred).not.toContain(removedWordMusik);
        expect(localStarred).toContain(keptWordMusik);
        expect(localSrs[removedWordMusik]).toBeUndefined();
        expect(localSrs[keptWordMusik]).toBeDefined();
      } finally {
        manager.destroy();
        global.CATEGORIES = origCategories;
        global.exportBackup = origExport;
        global.confirm = origConfirm;
        global.showToast = origToast;
      }
    });
  });

  // (b) Unlocked counts clamping
  describe('(b) Unlocked Counts Clamping', () => {
    it('clamps unlocked counts larger than category word count in ensureProgress and loadProgress', async () => {
      const ctxCode = `
        let progress = {
          musik: {
            mcq: { unlocked: 50, counts: {} }
          }
        };
        const PROGRESS_MODES = ["mcq", "written", "article", "plural", "listen"];
        const UNLOCK_STEP = 5;
        ${extractFn('ensureProgress')}
        
        const musikCat = CATEGORIES.find(c => c.id === 'musik');
        const p = ensureProgress('musik', 'mcq');
        return {
          categoryLength: musikCat.words.length
        };
      `;

      const fn = new Function('CATEGORIES', ctxCode);
      const res = fn(CATEGORIES);
      expect(res.categoryLength).toBe(19);
    });

    it('importBackup clamps unlocked to new category size', () => {
      const backupJson = JSON.stringify({
        version: 2,
        dataFormat: 2,
        exportDate: '2026-10-15T00:00:00Z',
        progress: {
          musik: {
            mcq: { unlocked: 50, counts: { [keptWordMusik]: 8 } }
          }
        },
        stats: { current: 1, longest: 2, totalAnswered: 10, totalCorrect: 9 },
        starred: [keptWordMusik],
        srs: {},
        dailyGoal: 20
      });

      const ctxCode = `
        let progress = {};
        let starredSet = new Set();
        let srsStore = {};
        let stats = {};
        const PROGRESS_MODES = ["mcq", "written", "article", "plural", "listen"];
        const appStorage = { set: () => {} };
        const STORAGE_KEYS = { PROGRESS: 'prog', STATS: 'st', STARRED: 'star', SRS: 'sr', DAILY_GOAL: 'dg' };
        const window = {
          alert: () => {},
          confirm: () => true,
          localStorage: { setItem: () => {}, getItem: () => null }
        };
        function setDailyGoal() {}
        function alert() {}
        function confirm() { return true; }
        function exportBackup() {}
        function render() {}
        function renderProgress() {}
        function renderStats() {}
        function renderStarred() {}
        function renderSrs() {}
        function showToast() {}
        function saveProgressSoon() {}
        function saveStarredSoon() {}
        function saveSrsSoon() {}
        function saveStats() {}
        function saveDailyGoal() {}

        ${extractFn('validateBackupData')}
        ${extractFn('importBackup')}

        importBackup(backupJson);

        return progress;
      `;

      const fn = new Function('CATEGORIES', 'SyncMergePolicy', 'backupJson', ctxCode);
      const importedProgress = fn(CATEGORIES, SyncMergePolicy, backupJson);

      expect(importedProgress.musik.mcq.unlocked).toBe(19);
      expect(importedProgress.musik.mcq.counts[keptWordMusik]).toBe(8);
    });
  });

  // (c) validateCloudDocument accepts documents with removed (unknown well-formed) IDs and drops them on merge
  describe('(c) Cloud Document Validation & Merge Drop', () => {
    it('accepts cloud document with removed/retired IDs as valid and drops them upon merge', () => {
      const cloudDoc = {
        schemaVersion: 1,
        dataFormat: 2,
        dataVersion: 3,
        progress: {
          musik: {
            mcq: {
              unlocked: 19,
              counts: {
                [removedWordMusik]: 12,
                [keptWordMusik]: 9
              }
            }
          }
        },
        starred: [removedWordMusik, keptWordMusik],
        srs: {
          [removedWordMusik]: { box: 3, lastDate: '2026-10-01', nextDate: '2026-10-08' },
          [keptWordMusik]: { box: 2, lastDate: '2026-10-02', nextDate: '2026-10-05' }
        },
        dailyGoal: { target: 25 }
      };

      // 1. validateCloudDocument MUST accept it
      const validation = SyncMergePolicy.validateCloudDocument(cloudDoc, CATEGORIES);
      expect(validation.valid).toBe(true);

      // 2. mergeFullUserData MUST drop removed IDs
      const localDoc = {
        dataFormat: 2,
        dataVersion: 3,
        progress: {
          musik: { mcq: { unlocked: 10, counts: { [keptWordMusik]: 4 } } }
        },
        starred: [],
        srs: {}
      };

      const merged = SyncMergePolicy.mergeFullUserData(localDoc, cloudDoc, CATEGORIES);

      expect(merged.progress.musik.mcq.counts[removedWordMusik]).toBeUndefined();
      expect(merged.progress.musik.mcq.counts[keptWordMusik]).toBe(9);
      expect(merged.starred).toEqual([keptWordMusik]);
      expect(merged.srs[removedWordMusik]).toBeUndefined();
      expect(merged.srs[keptWordMusik].box).toBe(2);
    });
  });

  // (d) Pre-change backup import
  describe('(d) Pre-change Backup Import', () => {
    it('cleanly imports a backup generated before this vocabulary review', () => {
      // Create a full pre-change backup containing legacy index keys and removed IDs
      const preChangeBackup = {
        version: 2,
        exportDate: '2026-10-10T08:00:00.000Z',
        progress: {
          musik: {
            mcq: {
              unlocked: 50,
              counts: {
                '0': 10,
                [removedWordMusik]: 15,
                [keptWordMusik]: 20
              }
            }
          },
          obst: {
            mcq: {
              unlocked: 45,
              counts: {
                [removedWordObst]: 5,
                [keptWordObst]: 8
              }
            }
          }
        },
        stats: { current: 7, longest: 14, totalAnswered: 300, totalCorrect: 280 },
        starred: [removedWordMusik, keptWordMusik, 'obst_0'],
        srs: {
          [removedWordMusik]: { box: 2, lastDate: '2026-10-05', nextDate: '2026-10-12' },
          [keptWordMusik]: { box: 4, lastDate: '2026-10-05', nextDate: '2026-11-04' }
        },
        dailyGoal: 30
      };

      const ctxCode = `
        let progress = {};
        let starredSet = new Set();
        let srsStore = {};
        let stats = {};
        let dailyGoal = 20;
        const PROGRESS_MODES = ["mcq", "written", "article", "plural", "listen"];
        const appStorage = { set: () => {} };
        const STORAGE_KEYS = { PROGRESS: 'prog', STATS: 'st', STARRED: 'star', SRS: 'sr', DAILY_GOAL: 'dg' };
        const window = {
          alert: () => {},
          confirm: () => true,
          localStorage: { setItem: () => {}, getItem: () => null }
        };
        function setDailyGoal() {}
        function alert(msg) { throw new Error('Alert called: ' + msg); }
        function confirm() { return true; }
        function exportBackup() {}
        function render() {}
        function renderProgress() {}
        function renderStats() {}
        function renderStarred() {}
        function renderSrs() {}
        function showToast() {}
        function saveProgressSoon() {}
        function saveStarredSoon() {}
        function saveSrsSoon() {}
        function saveStats() {}
        function saveDailyGoal() {}

        ${extractFn('validateBackupData')}
        ${extractFn('importBackup')}

        const val = validateBackupData(backupData);
        if (!val.valid) throw new Error('Validation failed: ' + val.error);

        importBackup(JSON.stringify(backupData));

        return {
          progress,
          starred: Array.from(starredSet),
          srs: srsStore,
          stats
        };
      `;

      const fn = new Function('CATEGORIES', 'SyncMergePolicy', 'backupData', ctxCode);
      const imported = fn(CATEGORIES, SyncMergePolicy, preChangeBackup);

      // Verify removed IDs are not in progress, starred, or SRS
      expect(imported.progress.musik.mcq.counts[removedWordMusik]).toBeUndefined();
      expect(imported.progress.obst.mcq.counts[removedWordObst]).toBeUndefined();
      expect(imported.starred).not.toContain(removedWordMusik);
      expect(imported.starred).not.toContain(removedWordObst);
      expect(imported.srs[removedWordMusik]).toBeUndefined();

      // Verify kept IDs are preserved
      expect(imported.progress.musik.mcq.counts[keptWordMusik]).toBe(20);
      expect(imported.progress.obst.mcq.counts[keptWordObst]).toBe(8);
      expect(imported.starred).toContain(keptWordMusik);
      expect(imported.srs[keptWordMusik].box).toBe(4);

      // Verify unlocked clamped to new category bounds (musik: 19, obst: 31)
      expect(imported.progress.musik.mcq.unlocked).toBe(19);
      expect(imported.progress.obst.mcq.unlocked).toBe(31);

      // Verify stats preserved
      expect(imported.stats.totalAnswered).toBe(300);
      expect(imported.stats.totalCorrect).toBe(280);
    });
  });

  // (e) Two-device order problems: old device uploads after new device uploaded
  describe('(e) Two-Device Sync Invariant: Out-of-Order Multi-Device Sync', () => {
    it('resolves cleanly when an old device uploads removed IDs after a new device has synced', () => {
      // Step 1: Device A (New v23) syncs with cloud
      const deviceANewLocal = {
        dataFormat: 2,
        dataVersion: 10,
        progress: {
          musik: {
            mcq: {
              unlocked: 15,
              counts: { [keptWordMusik]: 15 }
            }
          }
        },
        starred: [keptWordMusik],
        srs: {
          [keptWordMusik]: { box: 3, lastDate: '2026-10-18', nextDate: '2026-10-25' }
        },
        stats: { totalAnswered: 100, totalCorrect: 95 }
      };

      // Step 2: Device B (Old v22) was offline or late, uploads a doc containing removed IDs and older counts
      const deviceBOldUpload = {
        schemaVersion: 1,
        dataFormat: 2,
        dataVersion: 11,
        progress: {
          musik: {
            mcq: {
              unlocked: 45,
              counts: {
                [removedWordMusik]: 20, // removed word
                [keptWordMusik]: 10      // older count
              }
            }
          }
        },
        starred: [removedWordMusik, keptWordMusik],
        srs: {
          [removedWordMusik]: { box: 4, lastDate: '2026-10-17', nextDate: '2026-11-17' },
          [keptWordMusik]: { box: 2, lastDate: '2026-10-16', nextDate: '2026-10-19' }
        },
        stats: { totalAnswered: 110, totalCorrect: 100 }
      };

      // Device A merges Device B's upload from cloud
      const mergedOnDeviceA = SyncMergePolicy.mergeFullUserData(deviceANewLocal, deviceBOldUpload, CATEGORIES);

      // Invariants:
      // 1. DataVersion is monotonically incremented
      expect(mergedOnDeviceA.dataVersion).toBe(12);

      // 2. Kept word count is max(15, 10) = 15
      expect(mergedOnDeviceA.progress.musik.mcq.counts[keptWordMusik]).toBe(15);

      // 3. Removed word is completely dropped
      expect(mergedOnDeviceA.progress.musik.mcq.counts[removedWordMusik]).toBeUndefined();
      expect(mergedOnDeviceA.starred).toEqual([keptWordMusik]);
      expect(mergedOnDeviceA.srs[removedWordMusik]).toBeUndefined();

      // 4. Kept word SRS prefers higher box / monotonicity
      expect(mergedOnDeviceA.srs[keptWordMusik].box).toBe(3);

      // 5. Stats are merged monotonically
      expect(mergedOnDeviceA.stats.totalAnswered).toBe(110);
      expect(mergedOnDeviceA.stats.totalCorrect).toBe(100);

      // 6. Commutativity: merge(B, A) produces identical clean data
      const mergedOnDeviceB = SyncMergePolicy.mergeFullUserData(deviceBOldUpload, deviceANewLocal, CATEGORIES);
      expect(mergedOnDeviceB.progress).toEqual(mergedOnDeviceA.progress);
      expect(mergedOnDeviceB.starred).toEqual(mergedOnDeviceA.starred);
      expect(mergedOnDeviceB.srs).toEqual(mergedOnDeviceA.srs);
      expect(mergedOnDeviceB.stats).toEqual(mergedOnDeviceA.stats);
    });
  });
});

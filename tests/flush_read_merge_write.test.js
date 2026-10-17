/**
 * tests/flush_read_merge_write.test.js
 * Regression test for DEFECT H5:
 * flushSave must read-merge-write with the cloud document before uploading,
 * so concurrent changes from another device are not overwritten.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SyncManager, STATES } from '../sync/sync_manager.js';
import MemorySyncAdapter from '../sync/memory_adapter.js';
import SyncMergePolicy from '../sync/merge_policy.js';

describe('DEFECT H5: flushSave Read-Merge-Write and Concurrency Safety', () => {
  let sharedStore;
  let adapterA;
  let adapterB;
  let managerA;
  let managerB;
  const categories = [
    { id: 'obst', words: new Array(10).fill({ n: 'Apfel' }), hasArticles: true },
    { id: 'tiere', words: new Array(10).fill({ n: 'Hund' }), hasArticles: true }
  ];

  beforeEach(() => {
    sharedStore = new Map();
    adapterA = new MemorySyncAdapter({ store: sharedStore });
    adapterB = new MemorySyncAdapter({ store: sharedStore });

    globalThis.CATEGORIES = categories;
    globalThis.getDailyGoalRecord = () => ({ target: 20, updatedAt: '2026-10-08T00:00:00Z' });
    globalThis.exportBackup = vi.fn(() => '{"backup":true}');
    globalThis.confirm = vi.fn(() => true);
  });

  afterEach(() => {
    if (managerA) managerA.destroy();
    if (managerB) managerB.destroy();
    delete globalThis.CATEGORIES;
    delete globalThis.getDailyGoalRecord;
  });

  it('Device A flushing after Device B uploads must merge and preserve BOTH devices in cloud', async () => {
    const user = { uid: 'user-shared', email: 'user@example.com' };

    // Device A state provider
    let localDataA = {
      dataFormat: 2,
      dataVersion: 2,
      progress: { obst: { mcq: { unlocked: 3, counts: { 'obst.apfel': 2 } } } },
      stats: { current: 1, longest: 1, totalAnswered: 5, totalCorrect: 5 },
      starred: ['obst.apfel'],
      srs: {},
      dailyGoal: { target: 20, updatedAt: '2026-10-08T00:00:00Z' }
    };

    // Device B state provider
    let localDataB = {
      dataFormat: 2,
      dataVersion: 2,
      progress: {
        obst: { mcq: { unlocked: 5, counts: { 'obst.apfel': 4, 'obst.banane': 3 } } },
        tiere: { mcq: { unlocked: 2, counts: { 'tiere.hund': 2 } } }
      },
      stats: { current: 2, longest: 2, totalAnswered: 10, totalCorrect: 9 },
      starred: ['tiere.hund'],
      srs: {},
      dailyGoal: { target: 30, updatedAt: '2026-10-08T12:00:00Z' }
    };

    managerA = new SyncManager({
      adapter: adapterA,
      policy: SyncMergePolicy,
      localStateProvider: {
        getLocalData: () => JSON.parse(JSON.stringify(localDataA)),
        applyLocalData: (merged) => { localDataA = JSON.parse(JSON.stringify(merged)); }
      }
    });

    managerB = new SyncManager({
      adapter: adapterB,
      policy: SyncMergePolicy,
      localStateProvider: {
        getLocalData: () => JSON.parse(JSON.stringify(localDataB)),
        applyLocalData: (merged) => { localDataB = JSON.parse(JSON.stringify(merged)); }
      }
    });

    // Device A signs in first with initial data
    managerA.user = user;
    await managerA.syncOnSignIn();

    // Device B signs in and uploads its progress (merging with A's initial data)
    managerB.user = user;
    await managerB.syncOnSignIn();

    // Verify Device B's progress is in cloud
    let cloudData = sharedStore.get('user-shared');
    expect(cloudData.progress.obst.mcq.unlocked).toBe(5);
    expect(cloudData.progress.tiere.mcq.unlocked).toBe(2);

    // Now Device A has been open for long.
    // User on Device A studies and masters obst_0 to count 10
    localDataA.progress.obst.mcq.counts['obst.apfel'] = 10;
    managerA.notifyChange();

    // Device A flushes its changes
    await managerA.flushSave();

    // INVARIANT (DEFECT H5): Cloud MUST contain BOTH Device A's changes AND Device B's progress!
    cloudData = sharedStore.get('user-shared');
    expect(cloudData.progress.obst.mcq.counts['obst.apfel']).toBe(10);
    // Device B's tiere progress and obst_1 progress must NOT be erased!
    expect(cloudData.progress.tiere).toBeDefined();
    expect(cloudData.progress.tiere.mcq.unlocked).toBe(2);
    expect(cloudData.progress.obst.mcq.unlocked).toBe(5);
    expect(cloudData.progress.obst.mcq.counts['obst.banane']).toBe(3);
    // Starred from both devices should be merged
    expect(cloudData.starred).toContain('obst.apfel');
    expect(cloudData.starred).toContain('tiere.hund');
  });

  it('invalid cloud data rejects overwrite, sets error state, and keeps pendingChanges', async () => {
    const user = { uid: 'user-shared', email: 'user@example.com' };
    // Corrupt cloud data with invalid schemaVersion
    sharedStore.set('user-shared', {
      schemaVersion: 999,
      progress: 'invalid-string',
      stats: null
    });

    let localData = {
      progress: { obst: { mcq: { unlocked: 3, counts: { '0': 2 } } } },
      stats: { current: 1, longest: 1, totalAnswered: 5, totalCorrect: 5 },
      starred: [],
      srs: {},
      dailyGoal: { target: 20, updatedAt: '2026-10-08T00:00:00Z' }
    };

    managerA = new SyncManager({
      adapter: adapterA,
      policy: SyncMergePolicy,
      localStateProvider: {
        getLocalData: () => JSON.parse(JSON.stringify(localData)),
        applyLocalData: (merged) => { localData = JSON.parse(JSON.stringify(merged)); }
      }
    });

    managerA.user = user;
    managerA.pendingChanges = true;

    await managerA.flushSave();

    expect(managerA.getStatus().state).toBe(STATES.ERROR);
    expect(managerA.pendingChanges).toBe(true);
    // Cloud document was NOT overwritten
    expect(sharedStore.get('user-shared').schemaVersion).toBe(999);
  });

  it('offline during flush retains pendingChanges', async () => {
    const user = { uid: 'user-shared', email: 'user@example.com' };
    adapterA.isOffline = true;

    let localData = {
      progress: { obst: { mcq: { unlocked: 3, counts: { '0': 2 } } } },
      stats: { current: 1, longest: 1, totalAnswered: 5, totalCorrect: 5 },
      starred: [],
      srs: {},
      dailyGoal: { target: 20, updatedAt: '2026-10-08T00:00:00Z' }
    };

    managerA = new SyncManager({
      adapter: adapterA,
      policy: SyncMergePolicy,
      localStateProvider: {
        getLocalData: () => JSON.parse(JSON.stringify(localData)),
        applyLocalData: () => {}
      }
    });

    managerA.user = user;
    managerA.pendingChanges = true;

    await managerA.flushSave();

    expect(managerA.pendingChanges).toBe(true);
    expect(managerA.getStatus().state).toBe(STATES.ERROR);
  });
});

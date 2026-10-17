/**
 * tests/sync_now_pull.test.js
 *
 * Unit and integration tests for SyncManager.syncNow() and pull synchronization:
 * (a) A uploads progress; B has no pending changes; B.syncNow() => B's local state now contains
 *     A's progress and nothing was written to the cloud (assert on adapter call counts);
 * (b) Both have changes => merged state in cloud and on both devices after syncNow on each;
 * (c) Invalid cloud document => no overwrite, error state, no retry loop;
 * (d) Offline => OFFLINE state, no timers left;
 * (e) Visibility 'visible' twice within 60 s => only one cycle (throttled auto-pull);
 * (f) Concurrent syncNow + flushSave => single in-flight operation coalesced.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SyncManager, STATES } from '../sync/sync_manager.js';
import MemorySyncAdapter from '../sync/memory_adapter.js';
import * as policy from '../sync/merge_policy.js';

describe('SyncManager.syncNow() & Cross-Device Pull Synchronization', () => {
  let originalCategories;
  let originalNavigator;
  let originalDocument;

  beforeEach(() => {
    originalCategories = globalThis.CATEGORIES;
    globalThis.CATEGORIES = [
      { id: 'obst', words: [{ id: 'obst.apfel', de: 'Apfel' }, { id: 'obst.banane', de: 'Banane' }] },
      { id: 'tiere', words: [{ id: 'tiere.hund', de: 'Hund' }, { id: 'tiere.katze', de: 'Katze' }] }
    ];
  });

  afterEach(() => {
    globalThis.CATEGORIES = originalCategories;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('(a) A uploads progress; B has no pending changes; B.syncNow() => B contains A progress, 0 cloud writes on B', async () => {
    const sharedStore = new Map();
    const adapterA = new MemorySyncAdapter({ store: sharedStore });
    const adapterB = new MemorySyncAdapter({ store: sharedStore });

    // Device A setup with local progress
    let stateA = {
      dataFormat: 2,
      dataVersion: 2,
      progress: {
        obst: {
          mcq: { unlocked: 10, counts: { 'obst.apfel': 2 } }
        }
      },
      stats: { totalAnswered: 5, totalCorrect: 5, current: 5, longest: 5, lastDate: '2026-10-11', todayCount: 5 },
      starred: ['obst.apfel'],
      srs: { 'obst.apfel': { box: 1, lastDate: '2026-10-11', nextDate: '2026-10-12' } },
      dailyGoal: { target: 30, updatedAt: '2026-10-11T12:00:00Z' }
    };

    const managerA = new SyncManager({
      adapter: adapterA,
      policy,
      localStateProvider: {
        getLocalData: () => stateA,
        applyLocalData: (merged) => { stateA = JSON.parse(JSON.stringify(merged)); }
      }
    });
    managerA.user = { uid: 'user_cross_1' };
    managerA.state = STATES.SYNCED;

    // A uploads progress
    managerA.notifyChange();
    await managerA.flushSave();

    // Verify cloud has A's payload
    expect(sharedStore.has('user_cross_1')).toBe(true);

    // Device B starts clean with NO pending changes
    let stateB = {
      dataFormat: 2,
      dataVersion: 2,
      progress: {},
      stats: { totalAnswered: 0, totalCorrect: 0, current: 0, longest: 0 },
      starred: [],
      srs: {},
      dailyGoal: { target: 20, updatedAt: '' }
    };

    const saveSpyB = vi.spyOn(adapterB, 'save');
    const loadSpyB = vi.spyOn(adapterB, 'load');

    const managerB = new SyncManager({
      adapter: adapterB,
      policy,
      localStateProvider: {
        getLocalData: () => stateB,
        applyLocalData: (merged) => { stateB = JSON.parse(JSON.stringify(merged)); }
      }
    });
    managerB.user = { uid: 'user_cross_1' };
    managerB.state = STATES.SYNCED;
    managerB.pendingChanges = false;

    // B executes syncNow()
    await managerB.syncNow();

    // 1. Device B now contains Device A's progress locally
    expect(stateB.progress.obst).toBeDefined();
    expect(stateB.progress.obst.mcq.unlocked).toBe(10);
    expect(stateB.progress.obst.mcq.counts['obst.apfel']).toBe(2);
    expect(stateB.stats.totalAnswered).toBe(5);
    expect(stateB.starred).toContain('obst.apfel');
    expect(stateB.dailyGoal.target).toBe(30);

    // 2. Adapter call counts on Device B: exactly 1 load, 0 writes (no redundant save)
    expect(loadSpyB).toHaveBeenCalledTimes(1);
    expect(saveSpyB).toHaveBeenCalledTimes(0);

    // 3. Manager state on B is synced, no pending changes
    expect(managerB.state).toBe(STATES.SYNCED);
    expect(managerB.pendingChanges).toBe(false);
    expect(managerB.lastSyncTime).toBeTruthy();
  });

  it('(b) both have changes => merged state in cloud and on both after syncNow on each', async () => {
    const sharedStore = new Map();
    const adapterA = new MemorySyncAdapter({ store: sharedStore });
    const adapterB = new MemorySyncAdapter({ store: sharedStore });

    // Device A has progress in 'obst'
    let stateA = {
      dataFormat: 2,
      dataVersion: 2,
      progress: {
        obst: { mcq: { unlocked: 10, counts: { 'obst.apfel': 2 } } }
      },
      stats: { totalAnswered: 5, totalCorrect: 5, current: 5, longest: 5, lastDate: '2026-10-11', todayCount: 5 },
      starred: ['obst.apfel'],
      srs: {},
      dailyGoal: { target: 20, updatedAt: '' }
    };

    // Device B has progress in 'tiere'
    let stateB = {
      dataFormat: 2,
      dataVersion: 2,
      progress: {
        tiere: { mcq: { unlocked: 8, counts: { 'tiere.hund': 1 } } }
      },
      stats: { totalAnswered: 3, totalCorrect: 3, current: 3, longest: 3, lastDate: '2026-10-11', todayCount: 3 },
      starred: ['tiere.hund'],
      srs: {},
      dailyGoal: { target: 25, updatedAt: '2026-10-11T14:00:00Z' }
    };

    const managerA = new SyncManager({
      adapter: adapterA,
      policy,
      localStateProvider: {
        getLocalData: () => stateA,
        applyLocalData: (merged) => { stateA = JSON.parse(JSON.stringify(merged)); }
      }
    });
    managerA.user = { uid: 'user_shared' };
    managerA.state = STATES.SYNCED;

    const managerB = new SyncManager({
      adapter: adapterB,
      policy,
      localStateProvider: {
        getLocalData: () => stateB,
        applyLocalData: (merged) => { stateB = JSON.parse(JSON.stringify(merged)); }
      }
    });
    managerB.user = { uid: 'user_shared' };
    managerB.state = STATES.SYNCED;

    // Device A syncs first
    managerA.notifyChange();
    await managerA.syncNow();

    // Device B now syncs its changes with the cloud
    managerB.notifyChange();
    await managerB.syncNow();

    // At this point, cloud has merged data (both obst and tiere)
    const cloudDocAfterB = sharedStore.get('user_shared');
    expect(cloudDocAfterB.progress.obst).toBeDefined();
    expect(cloudDocAfterB.progress.tiere).toBeDefined();

    // Device B also has both
    expect(stateB.progress.obst).toBeDefined();
    expect(stateB.progress.tiere).toBeDefined();

    // Now Device A calls syncNow() to pull B's additions
    await managerA.syncNow();

    // Both devices now have the fully converged merged state
    expect(stateA.progress.obst).toBeDefined();
    expect(stateA.progress.tiere).toBeDefined();
    expect(stateA.starred).toContain('obst.apfel');
    expect(stateA.starred).toContain('tiere.hund');
    expect(stateB.starred).toContain('obst.apfel');
    expect(stateB.starred).toContain('tiere.hund');
  });

  it('(c) invalid cloud document => no overwrite, error state, no retry loop', async () => {
    vi.useFakeTimers();
    const sharedStore = new Map();
    // Corrupted document in cloud
    sharedStore.set('user_corrupt', { progress: 'not-an-object-invalid' });

    const adapter = new MemorySyncAdapter({ store: sharedStore });
    const loadSpy = vi.spyOn(adapter, 'load');

    let localState = {
      progress: { obst: { mcq: { unlocked: 5, counts: {} } } },
      stats: { totalAnswered: 2 },
      starred: ['obst_0'],
      srs: {},
      dailyGoal: { target: 20, updatedAt: '' }
    };
    const untouchedSnapshot = JSON.stringify(localState);

    const manager = new SyncManager({
      adapter,
      policy,
      localStateProvider: {
        getLocalData: () => localState,
        applyLocalData: (merged) => { localState = JSON.parse(JSON.stringify(merged)); }
      }
    });
    manager.user = { uid: 'user_corrupt' };
    manager.state = STATES.SYNCED;
    manager.pendingChanges = false;

    await manager.syncNow();

    // 1. Local state must NOT be overwritten
    expect(JSON.stringify(localState)).toBe(untouchedSnapshot);

    // 2. Error state set with clear Arabic message
    expect(manager.state).toBe(STATES.ERROR);
    expect(manager.lastError).toMatch(/بيانات السحابة غير صالحة/);

    // 3. No auto-retry loop scheduled
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(manager.debounceTimer).toBeNull();
  });

  it('(d) offline => OFFLINE state, no timers left', async () => {
    vi.useFakeTimers();
    const sharedStore = new Map();
    const adapter = new MemorySyncAdapter({ store: sharedStore });

    let localState = { progress: {}, stats: {}, starred: [], srs: {}, dailyGoal: { target: 20, updatedAt: '' } };
    const manager = new SyncManager({
      adapter,
      policy,
      localStateProvider: {
        getLocalData: () => localState,
        applyLocalData: (merged) => { localState = merged; }
      }
    });
    manager.user = { uid: 'user_off' };
    manager.state = STATES.SYNCED;

    // Simulate browser offline
    vi.stubGlobal('navigator', { onLine: false });

    await manager.syncNow();

    expect(manager.state).toBe(STATES.OFFLINE);
    expect(manager.lastError).toBe('الجهاز غير متصل بالإنترنت حالياً');
    expect(manager.debounceTimer).toBeNull();

    // Timers advanced: zero scheduled retries
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(manager.debounceTimer).toBeNull();
  });

  it('(e) visibility "visible" twice within 60 s => only one cycle (throttled)', async () => {
    vi.useFakeTimers();
    const sharedStore = new Map();
    const adapter = new MemorySyncAdapter({ store: sharedStore });

    let localState = { progress: {}, stats: {}, starred: [], srs: {}, dailyGoal: { target: 20, updatedAt: '' } };
    const manager = new SyncManager({
      adapter,
      policy,
      localStateProvider: {
        getLocalData: () => localState,
        applyLocalData: (merged) => { localState = merged; }
      }
    });
    manager.user = { uid: 'user_throttle' };
    manager.state = STATES.SYNCED;
    manager.pendingChanges = false;

    const syncNowSpy = vi.spyOn(manager, 'syncNow');

    // Simulate mock document
    vi.stubGlobal('document', { visibilityState: 'visible' });
    vi.stubGlobal('navigator', { onLine: true });

    // 1st return to foreground
    manager._onVisibilityChange();
    expect(syncNowSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);

    // 2nd return to foreground 5 seconds later
    manager._onVisibilityChange();
    // Still only 1 call due to 60s throttle!
    expect(syncNowSpy).toHaveBeenCalledTimes(1);

    // Advance beyond 60s throttle (61s later)
    await vi.advanceTimersByTimeAsync(61000);
    manager._onVisibilityChange();
    // Now runs 2nd cycle
    expect(syncNowSpy).toHaveBeenCalledTimes(2);
  });

  it('(f) concurrent syncNow + flushSave => single in-flight operation', async () => {
    const sharedStore = new Map();
    let resolveLoad;
    const adapter = {
      isConfigured: () => true,
      load: vi.fn(() => new Promise(r => { resolveLoad = r; })),
      save: vi.fn().mockResolvedValue(),
      onAuthChange: vi.fn()
    };

    let localState = { progress: {}, stats: {}, starred: [], srs: {}, dailyGoal: { target: 20, updatedAt: '' } };
    const manager = new SyncManager({
      adapter,
      policy,
      localStateProvider: {
        getLocalData: () => localState,
        applyLocalData: (merged) => { localState = merged; }
      }
    });
    manager.user = { uid: 'user_conc' };
    manager.state = STATES.SYNCED;
    manager.pendingChanges = true;

    const p1 = manager.syncNow();
    const p2 = manager.flushSave();

    // Exactly the same promise coalesced in-flight
    expect(p1).toBe(p2);

    resolveLoad(null);
    await p1;

    expect(adapter.load).toHaveBeenCalledTimes(1);
    expect(adapter.save).toHaveBeenCalledTimes(1);
  });
});

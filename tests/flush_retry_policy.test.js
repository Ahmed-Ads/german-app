import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SyncManager, STATES } from '../sync/sync_manager.js';
import * as policy from '../sync/merge_policy.js';

describe('B2-1: Flush retry policy and bounded retry limits', () => {
  let manager;
  let fakeAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    fakeAdapter = {
      isConfigured: () => true,
      onAuthChange: vi.fn(),
      load: vi.fn(),
      save: vi.fn(),
    };
  });

  afterEach(() => {
    if (manager) manager.destroy();
    vi.useRealTimers();
  });

  it('(a) save always fails with transient error => at most 1 initial attempt + 3 scheduled retries, then stops', async () => {
    fakeAdapter.load.mockResolvedValue(null);
    fakeAdapter.save.mockRejectedValue(new Error('network-request-failed'));

    manager = new SyncManager({
      adapter: fakeAdapter,
      policy,
      debounceMs: 1000,
    });
    manager.user = { uid: 'user_1' };
    manager.state = STATES.SYNCED;

    manager.notifyChange();

    // Trigger initial debounced flush (1 initial attempt)
    await vi.advanceTimersByTimeAsync(1000);

    // Advance timers by 24 hours to see how many retries occur
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

    // Current code loops forever! B2-1 requires at most 1 initial + 3 retries = 4 save calls.
    expect(fakeAdapter.save.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('(b) invalid cloud doc => exactly one cloud read, no retry loop, state ERROR, pendingChanges true', async () => {
    // Cloud returns invalid document that fails policy validation
    fakeAdapter.load.mockResolvedValue({ progress: 'not-an-object' });

    manager = new SyncManager({
      adapter: fakeAdapter,
      policy,
      debounceMs: 1000,
    });
    manager.user = { uid: 'user_1' };
    manager.state = STATES.SYNCED;

    manager.notifyChange();

    // Initial flush
    await vi.advanceTimersByTimeAsync(1000);

    // Advance timers by 1 hour
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    // Exactly 1 load call, no retry loop
    expect(fakeAdapter.load).toHaveBeenCalledTimes(1);
    expect(manager.state).toBe(STATES.ERROR);
    expect(manager.pendingChanges).toBe(true);
  });

  it('(c) permission-denied => exactly one attempt, no auto retry', async () => {
    fakeAdapter.load.mockResolvedValue(null);
    const permErr = new Error('Missing or insufficient permissions');
    permErr.code = 'permission-denied';
    fakeAdapter.save.mockRejectedValue(permErr);

    manager = new SyncManager({
      adapter: fakeAdapter,
      policy,
      debounceMs: 1000,
    });
    manager.user = { uid: 'user_1' };
    manager.state = STATES.SYNCED;

    manager.notifyChange();

    await vi.advanceTimersByTimeAsync(1000); // initial attempt
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000); // 24h later

    expect(fakeAdapter.save).toHaveBeenCalledTimes(1);
    expect(manager.state).toBe(STATES.ERROR);
    expect(manager.pendingChanges).toBe(true);
  });

  it('(d) failure then a later notifyChange or online event resumes and succeeds', async () => {
    let callCount = 0;
    fakeAdapter.load.mockResolvedValue(null);
    fakeAdapter.save.mockImplementation(async () => {
      callCount++;
      if (callCount <= 4) {
        throw new Error('transient-error');
      }
      return true;
    });

    manager = new SyncManager({
      adapter: fakeAdapter,
      policy,
      debounceMs: 1000,
      retryDelays: [1000, 2000, 3000],
    });
    manager.user = { uid: 'user_1' };
    manager.state = STATES.SYNCED;

    manager.notifyChange();
    // Advance through initial + 3 retries (1s + 1s + 2s + 3s = 7s)
    await vi.advanceTimersByTimeAsync(10000);
    expect(callCount).toBe(4);
    expect(manager.state).toBe(STATES.ERROR);
    expect(manager.pendingChanges).toBe(true);

    // Now user performs another action: notifyChange resets retry counters and schedules flush
    manager.notifyChange();
    await vi.advanceTimersByTimeAsync(1000);

    expect(callCount).toBe(5);
    expect(manager.state).toBe(STATES.SYNCED);
    expect(manager.pendingChanges).toBe(false);

    // Also test online event resume
    callCount = 0;
    fakeAdapter.save.mockResolvedValue(true);
    manager.state = STATES.OFFLINE;
    manager.pendingChanges = true;
    manager._onOnline();
    await vi.advanceTimersByTimeAsync(100);
    expect(manager.state).toBe(STATES.SYNCED);
    expect(manager.pendingChanges).toBe(false);
  });

  it('(e) in-flight overlap still coalesced', async () => {
    let resolveSave;
    const savePromise = new Promise(r => { resolveSave = r; });
    fakeAdapter.load.mockResolvedValue(null);
    fakeAdapter.save.mockImplementation(() => savePromise);

    manager = new SyncManager({
      adapter: fakeAdapter,
      policy,
      debounceMs: 1000,
    });
    manager.user = { uid: 'user_1' };
    manager.state = STATES.SYNCED;
    manager.pendingChanges = true;

    const p1 = manager.flushSave();
    const p2 = manager.flushSave();
    expect(p1).toBe(p2); // same promise coalesced

    resolveSave();
    await p1;
    expect(fakeAdapter.save).toHaveBeenCalledTimes(1);
  });
});

describe('B2-2: pendingChanges cleared only if no in-flight change occurred', () => {
  let manager;
  let adapter;
  let store;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (manager) manager.destroy();
    vi.useRealTimers();
  });

  it('change local state while save() is in flight => pendingChanges remains true, follow-up flush uploads newer state', async () => {
    let localData = {
      progress: { obst: { mcq: { unlocked: 1, counts: { '0': 1 } } } },
      stats: { current: 1, longest: 1, totalAnswered: 1, totalCorrect: 1 },
      starred: [],
      srs: {},
      dailyGoal: { target: 20, updatedAt: '2026-10-08T00:00:00Z' }
    };

    let saveDeferred;
    let saveCount = 0;
    const savedDocs = [];

    const fakeAdapter = {
      isConfigured: () => true,
      onAuthChange: vi.fn(),
      load: vi.fn(async () => null),
      save: vi.fn(async (uid, data) => {
        saveCount++;
        savedDocs.push(JSON.parse(JSON.stringify(data)));
        if (saveCount === 1) {
          await new Promise(r => { saveDeferred = r; });
        }
        return true;
      })
    };

    manager = new SyncManager({
      adapter: fakeAdapter,
      policy,
      debounceMs: 1000,
      localStateProvider: {
        getLocalData: () => localData
      }
    });
    manager.user = { uid: 'user_b2_2' };
    manager.state = STATES.SYNCED;

    // Trigger initial change
    manager.notifyChange();
    await vi.advanceTimersByTimeAsync(1000); // starts flush 1, hits adapter.save

    expect(saveCount).toBe(1);

    // WHILE SAVE 1 IS IN FLIGHT: user changes something and notifies change
    localData = {
      ...localData,
      progress: { obst: { mcq: { unlocked: 2, counts: { '0': 2 } } } }
    };
    manager.notifyChange();

    // Now resolve save 1
    saveDeferred();
    await Promise.resolve();
    await Promise.resolve();

    // After flush 1 completes, pendingChanges must STILL be true because _changeSeq incremented!
    expect(manager.pendingChanges).toBe(true);

    // Advance timers for debounced follow-up flush
    await vi.advanceTimersByTimeAsync(1000);

    expect(saveCount).toBe(2);
    expect(manager.pendingChanges).toBe(false);
    expect(savedDocs[1].progress.obst.mcq.unlocked).toBe(2);
  });
});

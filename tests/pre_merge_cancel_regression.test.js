/**
 * tests/pre_merge_cancel_regression.test.js
 * Regression test for DEFECT 2: Cancelling pre-merge backup prompt.
 * Verifies that cancelling leaves user signed out and flushSave/notifyChange cannot overwrite cloud data.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncManager, STATES } from '../sync/sync_manager.js';
import SyncMergePolicy from '../sync/merge_policy.js';

describe('DEFECT 2 Regression: Pre-Merge Backup Cancel Data-Safety', () => {
  let saveCalls;
  let cloudDoc;
  let fakeAdapter;
  let manager;

  beforeEach(() => {
    saveCalls = [];
    cloudDoc = {
      schemaVersion: 1,
      progress: { obst: { mcq: { unlocked: 9, counts: { '0': 8 } } } },
      stats: { current: 10, longest: 10, totalAnswered: 50, totalCorrect: 48 },
      starred: ['obst_0'],
      srs: {},
      dailyGoal: { target: 30, updatedAt: '2026-10-08T00:00:00Z' }
    };

    fakeAdapter = {
      isConfigured: () => true,
      load: vi.fn(async () => JSON.parse(JSON.stringify(cloudDoc))),
      save: vi.fn(async (uid, data) => {
        saveCalls.push({ uid, data: JSON.parse(JSON.stringify(data)) });
        cloudDoc = JSON.parse(JSON.stringify(data));
      }),
      signOut: vi.fn(async () => {}),
      onAuthChange: (cb) => {
        // Initially signed in
        setTimeout(() => cb({ uid: 'user-123', email: 'test@example.com' }), 0);
        return () => {};
      }
    };

    globalThis.progress = { obst: { mcq: { unlocked: 3, counts: { '0': 2 } } } };
    globalThis.stats = { current: 1, longest: 1, totalAnswered: 5, totalCorrect: 5 };
    globalThis.starredSet = new Set();
    globalThis.srsStore = {};
    globalThis.getDailyGoal = () => 20;
    globalThis.CATEGORIES = [{ id: 'obst', words: new Array(10).fill({ n: 'Apfel' }) }];
    globalThis.showToast = vi.fn();

    manager = new SyncManager({
      adapter: fakeAdapter,
      policy: SyncMergePolicy,
      debounceMs: 50
    });
  });

  afterEach(() => {
    manager.destroy();
    delete globalThis.progress;
    delete globalThis.stats;
    delete globalThis.starredSet;
    delete globalThis.srsStore;
    delete globalThis.getDailyGoal;
    delete globalThis.CATEGORIES;
    delete globalThis.showToast;
    delete globalThis.exportBackup;
    delete globalThis.confirm;
  });

  it('declining backup on pre-merge aborts cleanly, signs user out, and subsequent local change never saves to cloud', async () => {
    // Backup blocked / returns null
    globalThis.exportBackup = vi.fn(() => null);
    // User declines to continue without backup (clicks Cancel)
    globalThis.confirm = vi.fn(() => false);

    manager.init();
    // Wait for onAuthChange to fire and syncOnSignIn to complete
    await new Promise((r) => setTimeout(r, 50));

    expect(globalThis.exportBackup).toHaveBeenCalledWith('sync');
    expect(globalThis.confirm).toHaveBeenCalled();
    expect(fakeAdapter.signOut).toHaveBeenCalled();
    expect(manager.state).toBe(STATES.SIGNED_OUT);

    // Reset recorded save calls from init
    saveCalls.length = 0;

    // User continues studying locally and makes a local change
    globalThis.progress.obst.mcq.counts['0'] = 10;
    manager.notifyChange();

    // Advance or explicitly call flushSave
    await manager.flushSave();

    // INVARIANT: adapter.save must NEVER be called, and cloud data must remain intact!
    expect(fakeAdapter.save).not.toHaveBeenCalled();
    expect(cloudDoc.progress.obst.mcq.unlocked).toBe(9);
    expect(cloudDoc.progress.obst.mcq.counts['0']).toBe(8);
  });

  it('backup ok -> merge happens and cloud is updated with merged data', async () => {
    globalThis.exportBackup = vi.fn(() => '{"backup":true}');
    globalThis.confirm = vi.fn(() => false); // Should not even be called

    manager.init();
    await new Promise((r) => setTimeout(r, 50));

    expect(globalThis.exportBackup).toHaveBeenCalledWith('sync');
    expect(globalThis.confirm).not.toHaveBeenCalled();
    expect(fakeAdapter.save).toHaveBeenCalledTimes(1);
    expect(manager.state).toBe(STATES.SYNCED);
    // Highest values merged: unlocked max(3, 9) = 9, count max(2, 8) = 8
    expect(cloudDoc.progress.obst.mcq.unlocked).toBe(9);
    expect(cloudDoc.progress.obst.mcq.counts['obst.apfel'] ?? cloudDoc.progress.obst.mcq.counts['0']).toBe(8);
  });

  it('backup throws + user declines -> no writes and user signed out', async () => {
    globalThis.exportBackup = vi.fn(() => {
      throw new Error('Download blocked or permission denied');
    });
    globalThis.confirm = vi.fn(() => false);

    manager.init();
    await new Promise((r) => setTimeout(r, 50));

    expect(globalThis.exportBackup).toHaveBeenCalledWith('sync');
    expect(globalThis.confirm).toHaveBeenCalled();
    expect(fakeAdapter.save).not.toHaveBeenCalled();
    expect(fakeAdapter.signOut).toHaveBeenCalled();
    expect(manager.state).toBe(STATES.SIGNED_OUT);

    // Further local change does not save
    globalThis.progress.obst.mcq.counts['0'] = 99;
    manager.notifyChange();
    await manager.flushSave();
    expect(fakeAdapter.save).not.toHaveBeenCalled();
  });

  it('backup throws + user accepts -> merge happens', async () => {
    globalThis.exportBackup = vi.fn(() => {
      throw new Error('Download blocked');
    });
    globalThis.confirm = vi.fn(() => true);

    manager.init();
    await new Promise((r) => setTimeout(r, 50));

    expect(globalThis.exportBackup).toHaveBeenCalledWith('sync');
    expect(globalThis.confirm).toHaveBeenCalled();
    expect(fakeAdapter.save).toHaveBeenCalledTimes(1);
    expect(manager.state).toBe(STATES.SYNCED);
  });
});


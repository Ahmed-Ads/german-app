/**
 * tests/merge_save_retry.test.js
 * Regression test for DEFECT M8:
 * When adapter.save fails after a local merge in syncOnSignIn,
 * it must perform a bounded retry (e.g. up to 3 attempts),
 * and if retries fail, it must set pendingChanges = true so subsequent triggers retry.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SyncManager, STATES } from '../sync/sync_manager.js';
import SyncMergePolicy from '../sync/merge_policy.js';

describe('DEFECT M8: Bounded Retry and PendingChanges on Save Failure after Merge', () => {
  let fakeAdapter;
  let manager;
  let cloudDoc;

  beforeEach(() => {
    cloudDoc = {
      schemaVersion: 1,
      progress: { obst: { mcq: { unlocked: 5, counts: { '0': 5 } } } },
      stats: { current: 5, longest: 5, totalAnswered: 20, totalCorrect: 20 },
      starred: [],
      srs: {},
      dailyGoal: { target: 20, updatedAt: '2026-10-08T00:00:00Z' }
    };

    globalThis.CATEGORIES = [{ id: 'obst', words: new Array(10).fill({ n: 'Apfel' }) }];
    globalThis.progress = { obst: { mcq: { unlocked: 3, counts: { '0': 2 } } } };
    globalThis.stats = { current: 1, longest: 1, totalAnswered: 5, totalCorrect: 5 };
    globalThis.starredSet = new Set();
    globalThis.srsStore = {};
    globalThis.getDailyGoal = () => 20;
    globalThis.getDailyGoalRecord = () => ({ target: 20, updatedAt: '' });
    globalThis.exportBackup = vi.fn(() => '{"backup":true}');
    globalThis.confirm = vi.fn(() => true);
  });

  afterEach(() => {
    if (manager) manager.destroy();
    delete globalThis.CATEGORIES;
    delete globalThis.progress;
    delete globalThis.stats;
    delete globalThis.starredSet;
    delete globalThis.srsStore;
    delete globalThis.getDailyGoal;
    delete globalThis.getDailyGoalRecord;
    delete globalThis.exportBackup;
    delete globalThis.confirm;
  });

  it('save fails once then succeeds on bounded retry -> finishes in SYNCED state', async () => {
    let saveAttempts = 0;
    fakeAdapter = {
      isConfigured: () => true,
      load: vi.fn(async () => JSON.parse(JSON.stringify(cloudDoc))),
      save: vi.fn(async () => {
        saveAttempts++;
        if (saveAttempts === 1) {
          throw new Error('Transient 503 Server Error');
        }
      })
    };

    manager = new SyncManager({
      adapter: fakeAdapter,
      policy: SyncMergePolicy
    });
    manager.user = { uid: 'user-retry', email: 'retry@example.com' };

    await manager.syncOnSignIn();

    expect(saveAttempts).toBe(2);
    expect(manager.getStatus().state).toBe(STATES.SYNCED);
    expect(manager.pendingChanges).toBe(false);
  });

  it('save fails on all retries -> sets pendingChanges = true and state ERROR', async () => {
    let saveAttempts = 0;
    fakeAdapter = {
      isConfigured: () => true,
      load: vi.fn(async () => JSON.parse(JSON.stringify(cloudDoc))),
      save: vi.fn(async () => {
        saveAttempts++;
        throw new Error('Persistent Network Failure');
      })
    };

    manager = new SyncManager({
      adapter: fakeAdapter,
      policy: SyncMergePolicy
    });
    manager.user = { uid: 'user-retry', email: 'retry@example.com' };

    await manager.syncOnSignIn();

    expect(saveAttempts).toBe(3);
    expect(manager.getStatus().state).toBe(STATES.ERROR);
    expect(manager.pendingChanges).toBe(true);
  });
});

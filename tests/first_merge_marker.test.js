/**
 * tests/first_merge_marker.test.js
 * Regression test for DEFECT H4:
 * A pre-merge backup should be requested on the genuine FIRST merge of an account on this device,
 * NOT on every subsequent app launch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncManager, STATES } from '../sync/sync_manager.js';
import SyncMergePolicy from '../sync/merge_policy.js';

describe('DEFECT H4: Pre-merge backup runs ONLY on genuine first merge per account', () => {
  let fakeAdapter;
  let manager;
  let mockStorage;
  let cloudDoc;

  beforeEach(() => {
    mockStorage = new Map();
    globalThis.window = {
      localStorage: {
        getItem: (k) => (mockStorage.has(k) ? mockStorage.get(k) : null),
        setItem: (k, v) => { mockStorage.set(k, String(v)); },
        removeItem: (k) => { mockStorage.delete(k); },
        clear: () => { mockStorage.clear(); }
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    globalThis.document = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    cloudDoc = {
      schemaVersion: 1,
      progress: { obst: { mcq: { unlocked: 5, counts: { '0': 5 } } } },
      stats: { current: 5, longest: 5, totalAnswered: 20, totalCorrect: 20 },
      starred: [],
      srs: {},
      dailyGoal: { target: 20, updatedAt: '2026-10-08T00:00:00Z' }
    };

    fakeAdapter = {
      isConfigured: () => true,
      load: vi.fn(async () => JSON.parse(JSON.stringify(cloudDoc))),
      save: vi.fn(async () => {}),
      signOut: vi.fn(async () => {})
    };

    globalThis.progress = { obst: { mcq: { unlocked: 3, counts: { '0': 2 } } } };
    globalThis.stats = { current: 1, longest: 1, totalAnswered: 5, totalCorrect: 5 };
    globalThis.starredSet = new Set();
    globalThis.srsStore = {};
    globalThis.getDailyGoal = () => 20;
    globalThis.CATEGORIES = [{ id: 'obst', words: new Array(10).fill({ n: 'Apfel' }) }];
    globalThis.showToast = vi.fn();
    globalThis.exportBackup = vi.fn(() => '{"backup":true}');
    globalThis.confirm = vi.fn(() => true);

    manager = new SyncManager({
      adapter: fakeAdapter,
      policy: SyncMergePolicy,
      debounceMs: 50
    });
  });

  afterEach(() => {
    manager.destroy();
    delete globalThis.window;
    delete globalThis.document;
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

  it('three consecutive launches with local+cloud data triggers exportBackup exactly ONCE', async () => {
    // Launch 1 (First merge):
    manager.user = { uid: 'user-A', email: 'a@example.com' };
    await manager.syncOnSignIn();

    expect(globalThis.exportBackup).toHaveBeenCalledTimes(1);
    expect(manager.getStatus().state).toBe(STATES.SYNCED);

    // Launch 2 (App restart / reload with persistent auth):
    const manager2 = new SyncManager({ adapter: fakeAdapter, policy: SyncMergePolicy });
    manager2.user = { uid: 'user-A', email: 'a@example.com' };
    await manager2.syncOnSignIn();
    manager2.destroy();

    // Launch 3:
    const manager3 = new SyncManager({ adapter: fakeAdapter, policy: SyncMergePolicy });
    manager3.user = { uid: 'user-A', email: 'a@example.com' };
    await manager3.syncOnSignIn();
    manager3.destroy();

    // Invariant: exportBackup should be called exactly ONCE across all 3 launches!
    expect(globalThis.exportBackup).toHaveBeenCalledTimes(1);
  });

  it('second uid on the same device triggers the first-merge backup flow again', async () => {
    // First user
    manager.user = { uid: 'user-A', email: 'a@example.com' };
    await manager.syncOnSignIn();
    expect(globalThis.exportBackup).toHaveBeenCalledTimes(1);

    // Second user signs in
    const managerB = new SyncManager({ adapter: fakeAdapter, policy: SyncMergePolicy });
    managerB.user = { uid: 'user-B', email: 'b@example.com' };
    await managerB.syncOnSignIn();
    managerB.destroy();

    expect(globalThis.exportBackup).toHaveBeenCalledTimes(2);
  });

  it('cancelled flow does NOT set marker, so next launch asks again', async () => {
    globalThis.exportBackup = vi.fn(() => null); // backup fails/blocked
    globalThis.confirm = vi.fn(() => false); // user cancels

    manager.user = { uid: 'user-A', email: 'a@example.com' };
    await manager.syncOnSignIn();

    expect(globalThis.exportBackup).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('deutsch_sync_first_merge_done_v1')).not.toBe('user-A');

    // Next launch: user now accepts
    globalThis.exportBackup = vi.fn(() => '{"backup":true}');
    const managerNext = new SyncManager({ adapter: fakeAdapter, policy: SyncMergePolicy });
    managerNext.user = { uid: 'user-A', email: 'a@example.com' };
    await managerNext.syncOnSignIn();
    managerNext.destroy();

    // exportBackup was called again on second launch because marker was never set
    expect(globalThis.exportBackup).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('deutsch_sync_first_merge_done_v1')).toBe('user-A');
  });

  it('marker storage throwing behaves safely without crashing', async () => {
    window.localStorage.getItem = () => { throw new Error('SecurityError: localStorage denied'); };
    window.localStorage.setItem = () => { throw new Error('SecurityError: localStorage denied'); };

    manager.user = { uid: 'user-A', email: 'a@example.com' };
    await expect(manager.syncOnSignIn()).resolves.not.toThrow();
    expect(globalThis.exportBackup).toHaveBeenCalledTimes(1);
  });
});

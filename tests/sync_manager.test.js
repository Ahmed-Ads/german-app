/**
 * tests/sync_manager.test.js
 * Comprehensive unit and workflow tests for SyncManager using MemorySyncAdapter.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SyncManager, STATES } from '../sync/sync_manager.js';
import MemorySyncAdapter from '../sync/memory_adapter.js';
import SyncMergePolicy from '../sync/merge_policy.js';

describe('SyncManager Unit & Lifecycle Workflow', () => {
  let sharedStore;
  let adapter;
  let manager;
  let mockGlobal;

  beforeEach(() => {
    sharedStore = new Map();
    adapter = new MemorySyncAdapter({ store: sharedStore });

    mockGlobal = {
      progress: { obst: { mcq: { unlocked: 5, counts: { '0': 3 } } } },
      stats: { current: 3, longest: 5, lastDate: '2026-10-04', totalAnswered: 30, totalCorrect: 25 },
      starred: ['obst_0'],
      srs: { 'obst_0': { box: 1, lastDate: '2026-10-04' } },
      getDailyGoal: () => 25,
      appStorage: { set: vi.fn() },
      STORAGE_KEYS: { PROGRESS: 'prog', STATS: 'st', STARRED: 'star', SRS: 'sr', DAILY_GOAL: 'dg' },
      CATEGORIES: [{ id: 'obst', words: new Array(10).fill({ n: 'Apfel' }) }],
      showToast: vi.fn(),
      render: vi.fn()
    };

    manager = new SyncManager({
      adapter,
      policy: SyncMergePolicy,
      debounceMs: 50
    });
    // Set mock global environment
    Object.assign(globalThis, mockGlobal);
  });

  afterEach(() => {
    manager.destroy();
  });

  it('initializes to SIGNED_OUT when configured, UNCONFIGURED when not configured', () => {
    manager.init();
    expect(manager.getStatus().state).toBe(STATES.SIGNED_OUT);

    const inertAdapter = new MemorySyncAdapter({ configured: false });
    const inertManager = new SyncManager({ adapter: inertAdapter });
    inertManager.init();
    expect(inertManager.getStatus().state).toBe(STATES.UNCONFIGURED);
    expect(inertManager.getStatus().isConfigured).toBe(false);
    inertManager.destroy();
  });

  it('first sign-in with empty cloud uploads current local state', async () => {
    manager.init();
    await manager.signIn();

    expect(manager.getStatus().state).toBe(STATES.SYNCED);
    expect(sharedStore.has('test-user-123')).toBe(true);

    const savedDoc = sharedStore.get('test-user-123');
    expect(savedDoc.progress.obst.mcq.unlocked).toBe(5);
    expect(savedDoc.stats.current).toBe(3);
    expect(savedDoc.starred).toEqual(['obst_0']);
    expect(savedDoc.dailyGoal.target).toBe(25);
  });

  it('first sign-in with existing cloud data merges deterministically and updates both sides', async () => {
    // Populate cloud beforehand
    sharedStore.set('test-user-123', {
      schemaVersion: 1,
      progress: { obst: { mcq: { unlocked: 8, counts: { '0': 7 } } } },
      stats: { current: 5, longest: 8, lastDate: '2026-10-05', totalAnswered: 50, totalCorrect: 45 },
      starred: ['obst_1'],
      srs: { 'obst_0': { box: 2, lastDate: '2026-10-05' } },
      dailyGoal: { target: 30, updatedAt: '2026-10-05T00:00:00Z' }
    });

    manager.init();
    await manager.signIn();

    expect(manager.getStatus().state).toBe(STATES.SYNCED);

    // Assert merged state applied to local memory
    expect(globalThis.progress.obst.mcq.unlocked).toBe(8);
    expect(globalThis.progress.obst.mcq.counts['0']).toBe(7);
    expect(globalThis.stats.current).toBe(5);
    expect(globalThis.starred).toEqual(['obst_0', 'obst_1']);
    expect(globalThis.srs['obst_0'].box).toBe(2);

    // Assert merged state saved back to cloud
    const cloudDoc = sharedStore.get('test-user-123');
    expect(cloudDoc.progress.obst.mcq.unlocked).toBe(8);
    expect(cloudDoc.stats.current).toBe(5);
  });

  it('sign-out clears cloud user session but keeps all local progress intact', async () => {
    manager.init();
    await manager.signIn();
    await manager.signOut();

    expect(manager.getStatus().state).toBe(STATES.SIGNED_OUT);
    expect(manager.getStatus().user).toBeNull();

    // Local data remains untouched
    expect(globalThis.progress.obst.mcq.unlocked).toBe(5);
    expect(globalThis.stats.current).toBe(3);
  });

  it('debounced save flushes changes to the cloud', async () => {
    manager.init();
    await manager.signIn();

    // Simulate user answering questions locally
    globalThis.progress.obst.mcq.counts['0'] = 10;
    manager.notifyChange();

    expect(manager.getStatus().pendingChanges).toBe(true);

    // Wait for debounce timer (50ms)
    await new Promise(r => setTimeout(r, 80));

    expect(manager.getStatus().pendingChanges).toBe(false);
    const updatedCloud = sharedStore.get('test-user-123');
    expect(updatedCloud.progress.obst.mcq.counts['0']).toBe(10);
  });

  it('deleteCloudData removes remote document and keeps local progress', async () => {
    manager.init();
    await manager.signIn();
    expect(sharedStore.has('test-user-123')).toBe(true);

    await manager.deleteCloudData();

    expect(sharedStore.has('test-user-123')).toBe(false);
    expect(manager.getStatus().state).toBe(STATES.SYNCED);

    // Local progress is intact
    expect(globalThis.progress.obst.mcq.unlocked).toBe(5);
  });

  it('handles network failure gracefully without throwing unhandled exceptions', async () => {
    adapter.shouldFail = true; // simulate cloud outage

    manager.init();
    await expect(manager.signIn()).rejects.toThrow('خطأ محاكى');

    expect(manager.getStatus().state).toBe(STATES.ERROR);
    expect(manager.getStatus().lastError).toContain('خطأ محاكى');

    // Local progress is completely unharmed
    expect(globalThis.progress.obst.mcq.unlocked).toBe(5);
  });

  // Regression: Node >= 21 (and some embedded webviews) expose a global `navigator` WITHOUT `onLine`.
  // `!navigator.onLine` is then `true`, which previously made every flush look "offline" and never saved.
  describe('navigator.onLine handling', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('still saves when navigator exists but onLine is undefined', async () => {
      vi.stubGlobal('navigator', {});
      manager.init();
      await manager.signIn();

      globalThis.progress.obst.mcq.counts['0'] = 11;
      manager.notifyChange();
      await manager.flushSave();

      expect(manager.getStatus().pendingChanges).toBe(false);
      expect(manager.getStatus().state).toBe(STATES.SYNCED);
      expect(sharedStore.get('test-user-123').progress.obst.mcq.counts['0']).toBe(11);
    });

    it('does NOT save and reports OFFLINE only when navigator.onLine is explicitly false', async () => {
      manager.init();
      await manager.signIn();
      const before = JSON.stringify(sharedStore.get('test-user-123'));

      vi.stubGlobal('navigator', { onLine: false });
      globalThis.progress.obst.mcq.counts['0'] = 12;
      manager.notifyChange();
      await manager.flushSave();

      expect(manager.getStatus().state).toBe(STATES.OFFLINE);
      expect(manager.getStatus().pendingChanges).toBe(true);
      expect(JSON.stringify(sharedStore.get('test-user-123'))).toBe(before);
    });
  });
});

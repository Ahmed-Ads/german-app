/**
 * tests/sync_upload_timing.test.js
 * Verification of upload timing, 8-second debounce, checkpoint flush on quiz exit,
 * and dirty-marker crash recovery.
 * Uses REAL SyncManager, MemorySyncAdapter, SyncMergePolicy, and extracted index.html functions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SyncManager, STATES } from '../sync/sync_manager.js';
import MemorySyncAdapter from '../sync/memory_adapter.js';
import SyncMergePolicy from '../sync/merge_policy.js';
import { extractFunction } from './extract_written.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.resolve(__dirname, '../index.html');
const html = fs.readFileSync(indexPath, 'utf8');

const goCode = extractFunction(html, 'go');
const resetCode = extractFunction(html, 'resetAllProgress');

describe('Sync Upload Timing & Checkpoint Flush (8s debounce & dirty recovery)', () => {
  let mockStorage;
  let mockLocalStorage;

  beforeEach(() => {
    mockStorage = new Map();
    mockLocalStorage = {
      getItem: vi.fn((k) => (mockStorage.has(k) ? mockStorage.get(k) : null)),
      setItem: vi.fn((k, v) => { mockStorage.set(k, String(v)); }),
      removeItem: vi.fn((k) => { mockStorage.delete(k); }),
      clear: vi.fn(() => { mockStorage.clear(); })
    };

    globalThis.window = {
      localStorage: mockLocalStorage,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    globalThis.document = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      visibilityState: 'visible'
    };
    globalThis.localStorage = mockLocalStorage;
    globalThis.CATEGORIES = [
      { id: 'obst', words: [{ n: 'Apfel' }, { n: 'Banane' }] }
    ];
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.localStorage;
    delete globalThis.CATEGORIES;
    delete globalThis.progress;
    delete globalThis.stats;
    delete globalThis.starredSet;
    delete globalThis.srsStore;
    delete globalThis.dailyGoal;
  });

  // (a) a change is uploaded 8 s later and not before
  it('(a) a change is uploaded 8 s later and not before', async () => {
    vi.useFakeTimers();

    const adapter = new MemorySyncAdapter({ configured: true });
    vi.spyOn(adapter, 'save');

    // SyncManager instantiated with DEFAULT debounceMs (no option passed)
    const manager = new SyncManager({
      adapter,
      policy: SyncMergePolicy
    });

    manager.user = { uid: 'user-timed' };
    manager.state = STATES.SYNCED;

    manager.setLocalStateProvider({
      getLocalData: () => ({
        progress: { obst: { mcq: { counts: { '0': 3 } } } },
        stats: {},
        starred: [],
        srs: {},
        dailyGoal: 20
      }),
      applyLocalData: () => {}
    });

    // Notify that local progress changed
    manager.notifyChange();
    expect(manager.pendingChanges).toBe(true);

    // Advance 7,999 ms -> MUST NOT have uploaded yet
    await vi.advanceTimersByTimeAsync(7999);
    expect(adapter.save).not.toHaveBeenCalled();

    // Advance 1 ms to reach 8,000 ms -> MUST have uploaded now
    await vi.advanceTimersByTimeAsync(1);
    expect(adapter.save).toHaveBeenCalledTimes(1);
    expect(manager.pendingChanges).toBe(false);

    manager.destroy();
  });

  // (b) leaving an exercise triggers an immediate upload attempt and does not block navigation
  it('(b) leaving an exercise triggers an immediate upload attempt and does not block navigation', async () => {
    const adapter = new MemorySyncAdapter({ configured: true });
    const manager = new SyncManager({
      adapter,
      policy: SyncMergePolicy,
      debounceMs: 8000
    });
    manager.user = { uid: 'user-quiz' };
    manager.state = STATES.SYNCED;
    manager.pendingChanges = true;

    const flushSpy = vi.spyOn(manager, 'flushSave');
    globalThis.window.syncManager = manager;

    // Set up environment for real extracted go() function
    let currentView = { screen: 'exercise', catId: 'obst', mode: 'mcq' };
    let renderCalled = false;

    const sandbox = {
      view: currentView,
      exState: null,
      historyDepth: 1,
      pendingRefresh: false,
      render: () => { renderCalled = true; },
      isSameView: (a, b) => (a.screen === b.screen && a.catId === b.catId && a.mode === b.mode),
      cloneView: (v) => ({ ...v }),
      isExerciseInProgress: () => false,
      window: {
        syncManager: manager,
        history: {
          pushState: vi.fn(),
          replaceState: vi.fn()
        },
        scrollTo: vi.fn()
      }
    };

    const goFn = new Function(
      'sandbox',
      `with(sandbox) {
        ${goCode}
        return go;
      }`
    )(sandbox);

    // User navigates from 'exercise' to 'modes'
    goFn({ screen: 'modes', catId: 'obst' });

    // Navigation MUST complete synchronously without blocking
    expect(sandbox.view.screen).toBe('modes');
    expect(renderCalled).toBe(true);

    // Checkpoint flush MUST be triggered immediately
    expect(flushSpy).toHaveBeenCalledTimes(1);

    manager.destroy();
  });

  // (c) simulate "page killed mid-upload": mark dirty, drop the manager, create a new manager with the same storage and cloud => the launch cycle uploads the unsent change, then clears the marker
  it('(c) simulate page killed mid-upload: launch recovery uploads unsent change and clears marker', async () => {
    const sharedStore = new Map();
    // Cloud currently has count = 1
    sharedStore.set('user-mid-kill', {
      schemaVersion: 1,
      dataVersion: 2,
      progress: { obst: { mcq: { unlocked: 1, counts: { 'obst.apfel': 1 } } } },
      stats: { current: 1, longest: 1, totalAnswered: 1, totalCorrect: 1 },
      starred: [],
      srs: {},
      dailyGoal: { target: 20 }
    });

    // Local device has count = 5 (unsent because app closed mid-upload)
    const localProgress = { obst: { mcq: { unlocked: 1, counts: { 'obst.apfel': 5 } } } };
    mockStorage.set('deutsch_sync_enabled', '1');
    mockStorage.set('deutsch_sync_dirty_v1', '1');
    mockStorage.set('deutsch_sync_first_merge_done_v1', 'user-mid-kill');

    const adapter1 = new MemorySyncAdapter({ store: sharedStore, configured: true });
    const manager1 = new SyncManager({ adapter: adapter1, policy: SyncMergePolicy });
    // Page is killed / dropped
    manager1.destroy();

    // New app launch: new manager created with same storage & cloud
    const adapter2 = new MemorySyncAdapter({ store: sharedStore, configured: true });
    const saveSpy = vi.spyOn(adapter2, 'save');

    const manager2 = new SyncManager({
      adapter: adapter2,
      policy: SyncMergePolicy
    });

    let currentLocal = {
      dataFormat: 2,
      dataVersion: 2,
      progress: localProgress,
      stats: { current: 1, longest: 1, totalAnswered: 1, totalCorrect: 1 },
      starred: [],
      srs: {},
      dailyGoal: { target: 20 }
    };

    manager2.setLocalStateProvider({
      getLocalData: () => currentLocal,
      applyLocalData: (merged) => { currentLocal = merged; }
    });

    // Run launch cycle
    manager2.init();

    // Adapter emits authenticated user
    await adapter2.signIn({ uid: 'user-mid-kill', email: 'user@example.com' });

    // Wait for async sync cycle to complete
    await new Promise(r => setTimeout(r, 60));

    // The unsent progress MUST have been uploaded to cloud
    expect(saveSpy).toHaveBeenCalled();
    const cloudDoc = sharedStore.get('user-mid-kill');
    expect(cloudDoc.progress.obst.mcq.counts['obst.apfel']).toBe(5);

    // The dirty marker MUST now be cleared
    expect(mockLocalStorage.getItem('deutsch_sync_dirty_v1')).toBeNull();

    manager2.destroy();
  });

  // (d) a failing upload keeps the marker and does not create a retry loop
  it('(d) a failing upload keeps the dirty marker and does not create a retry loop', async () => {
    vi.useFakeTimers();

    const adapter = new MemorySyncAdapter({ configured: true });
    // Simulate persistent cloud server failure (500)
    adapter.save = vi.fn().mockRejectedValue(new Error('Internal Cloud Server Error 500'));

    const manager = new SyncManager({
      adapter,
      policy: SyncMergePolicy,
      debounceMs: 8000,
      retryDelays: [30000, 120000, 600000] // 3 bounded retries max
    });

    manager.user = { uid: 'user-failing' };
    manager.state = STATES.SYNCED;

    manager.setLocalStateProvider({
      getLocalData: () => ({ progress: { obst: {} }, stats: {}, starred: [], srs: {}, dailyGoal: 20 }),
      applyLocalData: () => {}
    });

    // User makes a change
    manager.notifyChange();
    expect(mockLocalStorage.getItem('deutsch_sync_dirty_v1')).toBe('1');

    // Initial 8s debounce fires -> attempt 1 fails
    await vi.advanceTimersByTimeAsync(8000);
    expect(adapter.save).toHaveBeenCalledTimes(1);
    expect(mockLocalStorage.getItem('deutsch_sync_dirty_v1')).toBe('1');
    expect(manager.state).toBe(STATES.ERROR);

    // Retry 1 (after 30s) -> attempt 2 fails
    await vi.advanceTimersByTimeAsync(30000);
    expect(mockLocalStorage.getItem('deutsch_sync_dirty_v1')).toBe('1');

    // Retry 2 (after 120s) -> attempt 3 fails
    await vi.advanceTimersByTimeAsync(120000);
    expect(mockLocalStorage.getItem('deutsch_sync_dirty_v1')).toBe('1');

    // Retry 3 (after 600s) -> attempt 4 fails
    await vi.advanceTimersByTimeAsync(600000);
    expect(mockLocalStorage.getItem('deutsch_sync_dirty_v1')).toBe('1');

    // Bounded retries exhausted: timer MUST be cleared and no further auto-retries occur
    expect(manager.debounceTimer).toBeNull();
    const callsAtStop = adapter.save.mock.calls.length;

    await vi.advanceTimersByTimeAsync(1200000);
    expect(adapter.save.mock.calls.length).toBe(callsAtStop);
    expect(mockLocalStorage.getItem('deutsch_sync_dirty_v1')).toBe('1');

    manager.destroy();
  });

  // (e) sign-out and reset clear the marker
  it('(e) sign-out and resetAllProgress clear the dirty marker', async () => {
    const adapter = new MemorySyncAdapter({ configured: true });
    const manager = new SyncManager({ adapter, policy: SyncMergePolicy });
    manager.user = { uid: 'user-reset' };
    manager.state = STATES.SYNCED;

    // 1. Sign out clears dirty marker
    mockStorage.set('deutsch_sync_dirty_v1', '1');
    await manager.signOut();
    expect(mockLocalStorage.getItem('deutsch_sync_dirty_v1')).toBeNull();

    // 2. resetAllProgress clears dirty marker
    mockStorage.set('deutsch_sync_dirty_v1', '1');

    const resetSandbox = {
      window: {
        syncManager: manager,
        localStorage: mockLocalStorage
      },
      appStorage: { remove: vi.fn() },
      STORAGE_KEYS: {
        PROGRESS: 'prog',
        STATS: 'stat',
        STARRED: 'star',
        SRS: 'srs',
        DAILY_GOAL: 'goal'
      },
      showToast: vi.fn(),
      progress: {},
      stats: {},
      starredSet: new Set(),
      srsStore: {},
      dailyGoal: 20
    };

    const resetFn = new Function(
      'sandbox',
      `with(sandbox) {
        ${resetCode}
        return resetAllProgress;
      }`
    )(resetSandbox);

    await resetFn();
    expect(mockLocalStorage.getItem('deutsch_sync_dirty_v1')).toBeNull();

    manager.destroy();
  });
});

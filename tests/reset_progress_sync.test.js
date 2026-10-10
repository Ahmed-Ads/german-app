import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractFunction } from './extract_written.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.resolve(__dirname, '../index.html');
const html = fs.readFileSync(indexPath, 'utf8');

// Extract the REAL resetAllProgress function from index.html (no copies)
const resetCode = extractFunction(html, 'resetAllProgress');

describe('M2 - resetAllProgress cloud sync and stamp key cleanup', () => {
  let mockLocalStorage;
  let mockAppStorage;
  let mockWindow;
  let mockToast;
  let resetFn;

  // Global state variables matching index.html
  let progressState;
  let statsState;
  let starredSetState;
  let srsStoreState;
  let dailyGoalState;

  beforeEach(() => {
    const store = new Map();
    mockLocalStorage = {
      getItem: vi.fn((k) => (store.has(k) ? store.get(k) : null)),
      setItem: vi.fn((k, v) => store.set(k, String(v))),
      removeItem: vi.fn((k) => store.delete(k)),
      clear: vi.fn(() => store.clear()),
    };

    mockAppStorage = {
      remove: vi.fn((k) => store.delete(k)),
    };

    mockToast = vi.fn();

    mockWindow = {
      localStorage: mockLocalStorage,
      syncManager: null,
      voiceManager: { resetSavedVoice: vi.fn() },
    };

    progressState = { cat1: { mcq: { unlocked: 5 } } };
    statsState = { lastDate: '2026-01-01', current: 3, longest: 5, totalAnswered: 10, totalCorrect: 9, todayCount: 4 };
    starredSetState = new Set(['cat1_0']);
    srsStoreState = { 'cat1_0': { box: 2 } };
    dailyGoalState = 50;

    const STORAGE_KEYS = {
      PROGRESS: 'german-arabic-progress-v1',
      STATS: 'german-arabic-stats-v1',
      STARRED: 'deutsch_starred_v1',
      SRS: 'deutsch_srs_v1',
      DAILY_GOAL: 'deutsch_daily_goal_v1',
    };

    // Construct runner binding all real scope variables
    resetFn = new Function(
      'window',
      'appStorage',
      'STORAGE_KEYS',
      'showToast',
      'progress',
      'stats',
      'starredSet',
      'srsStore',
      'dailyGoal',
      `
      return async function runReset() {
        ${resetCode}
        return await resetAllProgress();
      };
      `
    )(mockWindow, mockAppStorage, STORAGE_KEYS, mockToast, progressState, statsState, starredSetState, srsStoreState, dailyGoalState);
  });

  it('removes the daily-goal stamp key and keeps the first-merge marker', async () => {
    mockLocalStorage.setItem('deutsch_daily_goal_updated_at_v1', '2026-03-01T12:00:00.000Z');
    mockLocalStorage.setItem('deutsch_sync_first_merge_done_v1', 'true');

    await resetFn();

    // deutsch_daily_goal_updated_at_v1 MUST be removed
    expect(mockLocalStorage.getItem('deutsch_daily_goal_updated_at_v1')).toBeNull();
    expect(mockAppStorage.remove).toHaveBeenCalledWith('deutsch_daily_goal_updated_at_v1');

    // deutsch_sync_first_merge_done_v1 MUST NOT be removed
    expect(mockLocalStorage.getItem('deutsch_sync_first_merge_done_v1')).toBe('true');
  });

  it('calls deleteCloudData FIRST when signed in with sync configured, then wipes local data', async () => {
    const callOrder = [];
    const fakeSyncManager = {
      isConfigured: true,
      user: { uid: 'user_123' },
      getStatus: vi.fn(() => ({ isConfigured: true, user: { uid: 'user_123' }, state: 'SYNCED' })),
      deleteCloudData: vi.fn(async () => {
        callOrder.push('cloudDelete');
      }),
    };
    mockAppStorage.remove = vi.fn((k) => {
      callOrder.push('storageRemove');
    });
    mockWindow.syncManager = fakeSyncManager;

    const res = await resetFn();

    expect(res).toBe(true);
    expect(fakeSyncManager.deleteCloudData).toHaveBeenCalledTimes(1);
    expect(fakeSyncManager.deleteCloudData).toHaveBeenCalledWith({ silentToast: true });
    expect(callOrder[0]).toBe('cloudDelete');
    expect(mockAppStorage.remove).toHaveBeenCalled();
  });

  it('does NOT call deleteCloudData when sync is unconfigured or user is signed out, but still wipes local data', async () => {
    // Case 1: unconfigured
    const unconfSyncManager = {
      isConfigured: false,
      user: null,
      getStatus: vi.fn(() => ({ isConfigured: false, user: null, state: 'UNCONFIGURED' })),
      deleteCloudData: vi.fn(),
    };
    mockWindow.syncManager = unconfSyncManager;

    const res1 = await resetFn();
    expect(res1).toBe(true);
    expect(unconfSyncManager.deleteCloudData).not.toHaveBeenCalled();
    expect(mockAppStorage.remove).toHaveBeenCalled();

    mockAppStorage.remove.mockClear();

    // Case 2: configured but signed out
    const signedOutSyncManager = {
      isConfigured: true,
      user: null,
      getStatus: vi.fn(() => ({ isConfigured: true, user: null, state: 'IDLE' })),
      deleteCloudData: vi.fn(),
    };
    mockWindow.syncManager = signedOutSyncManager;

    const res2 = await resetFn();
    expect(res2).toBe(true);
    expect(signedOutSyncManager.deleteCloudData).not.toHaveBeenCalled();
    expect(mockAppStorage.remove).toHaveBeenCalled();

    // Case 3: no syncManager at all
    mockWindow.syncManager = null;
    await expect(resetFn()).resolves.toBe(true);
  });

  it('cloud delete failure => local state untouched, reports honestly in Arabic, returns false', async () => {
    const failingSyncManager = {
      isConfigured: true,
      user: { uid: 'user_123' },
      getStatus: vi.fn(() => ({ isConfigured: true, user: { uid: 'user_123' }, state: 'SYNCED' })),
      deleteCloudData: vi.fn().mockRejectedValue(new Error('شبكة غير متصلة')),
    };
    mockWindow.syncManager = failingSyncManager;

    const res = await resetFn();

    expect(res).toBe(false);
    expect(failingSyncManager.deleteCloudData).toHaveBeenCalledTimes(1);
    // Local storage and app storage must NOT be wiped!
    expect(mockAppStorage.remove).not.toHaveBeenCalled();
    expect(mockLocalStorage.removeItem).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('لم يتم تصفير'));
  });
});

/**
 * tests/refresh_after_pull.test.js
 * Verification of UI refresh and toast behavior when cloud data is pulled and merged.
 * Tests requirements (a)-(e) using real SyncManager + MemorySyncAdapter + SyncMergePolicy,
 * with real functions extracted from index.html.
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
const indexHtml = fs.readFileSync(indexPath, 'utf8');

// Extract exact production functions from index.html
const isSameViewCode = extractFunction(indexHtml, 'isSameView');
const cloneViewCode = extractFunction(indexHtml, 'cloneView');
const isExCode = extractFunction(indexHtml, 'isExerciseInProgress');
const refCode = extractFunction(indexHtml, 'refreshAfterSync');
const goCode = extractFunction(indexHtml, 'go');

const makeIndexScope = new Function(
  'render',
  'showToast',
  `
  let view = { screen: 'home', catId: null, mode: null, highlightIdx: null, fromSearch: false };
  let historyDepth = 0;
  let exState = null;
  ${cloneViewCode}
  ${isSameViewCode}
  ${isExCode}
  ${refCode}
  ${goCode}
  return {
    getView: () => view,
    setView: (v) => { view = v; },
    getPendingRefresh: () => pendingRefresh,
    setPendingRefresh: (v) => { pendingRefresh = v; },
    refreshAfterSync: (status, event) => refreshAfterSync(status, event),
    isExerciseInProgress: () => isExerciseInProgress(),
    go: (v, opts) => go(v, opts)
  };
  `
);

describe('UI Refresh After Cloud Pull (Requirements a-e)', () => {
  let sharedStore;
  let adapter;
  let manager;
  let renderMock;
  let showToastMock;
  let scope;
  let localData;

  const categories = [
    { id: 'obst', words: [{ id: 'obst.apfel', n: 'Apfel' }, { id: 'obst.banane', n: 'Banane' }], hasArticles: true },
    { id: 'tiere', words: [{ id: 'tiere.hund', n: 'Hund' }, { id: 'tiere.katze', n: 'Katze' }], hasArticles: true }
  ];

  beforeEach(() => {
    sharedStore = new Map();
    adapter = new MemorySyncAdapter({
      store: sharedStore,
      initialUser: { uid: 'user-refresh-test', email: 'test@example.com' }
    });

    globalThis.CATEGORIES = categories;
    globalThis.getDailyGoalRecord = () => ({ target: 20, updatedAt: '2026-10-08T00:00:00Z' });
    globalThis.exportBackup = vi.fn(() => '{"backup":true}');
    globalThis.confirm = vi.fn(() => true);

    renderMock = vi.fn();
    showToastMock = vi.fn();
    globalThis.render = renderMock;
    globalThis.showToast = showToastMock;

    scope = makeIndexScope(renderMock, showToastMock);

    localData = {
      dataFormat: 2,
      dataVersion: 2,
      progress: { obst: { mcq: { unlocked: 2, counts: { 'obst.apfel': 1 } } } },
      stats: { current: 1, longest: 1, totalAnswered: 3, totalCorrect: 3, todayCount: 1, lastDate: '2026-10-08' },
      starred: ['obst.apfel'],
      srs: {},
      dailyGoal: { target: 20, updatedAt: '2026-10-08T00:00:00Z' }
    };

    manager = new SyncManager({
      adapter,
      policy: SyncMergePolicy,
      debounceMs: 50
    });

    manager.user = { uid: 'user-refresh-test', email: 'test@example.com' };

    manager.setLocalStateProvider({
      getLocalData: () => JSON.parse(JSON.stringify(localData)),
      applyLocalData: (merged) => {
        if (merged.progress) localData.progress = JSON.parse(JSON.stringify(merged.progress));
        if (merged.stats) Object.assign(localData.stats, merged.stats);
        if (merged.starred) localData.starred = Array.from(merged.starred);
        if (merged.srs) localData.srs = JSON.parse(JSON.stringify(merged.srs));
        if (merged.dailyGoal) localData.dailyGoal = JSON.parse(JSON.stringify(merged.dailyGoal));
      }
    });

    manager.init();
    manager.subscribe((status, event) => {
      scope.refreshAfterSync(status, event);
    });
  });

  afterEach(() => {
    if (manager) manager.destroy();
    delete globalThis.CATEGORIES;
    delete globalThis.getDailyGoalRecord;
    delete globalThis.exportBackup;
    delete globalThis.confirm;
    delete globalThis.render;
    delete globalThis.showToast;
  });

  it('(a) pull that changes data on Home => render called once and the toast shown once', async () => {
    scope.setView({ screen: 'home', catId: null, mode: null, highlightIdx: null, fromSearch: false });

    // Cloud has newer/more advanced progress from another device
    const cloudPayload = {
      schemaVersion: 1,
      dataVersion: 2,
      progress: {
        obst: { mcq: { unlocked: 5, counts: { 'obst.apfel': 3, 'obst.banane': 2 } } }
      },
      stats: {
        totalAnswered: 15,
        totalCorrect: 14,
        current: 4,
        longest: 6,
        todayCount: 5,
        lastDate: '2026-10-08'
      },
      starred: ['obst.apfel', 'obst.banane'],
      srs: {},
      dailyGoal: { target: 30, updatedAt: '2026-10-08T01:00:00Z' },
      updatedAt: '2026-10-08T01:00:00Z'
    };
    await adapter.save(manager.user.uid, cloudPayload);

    renderMock.mockClear();
    showToastMock.mockClear();

    // Pull from cloud
    await manager.syncNow();

    // (a) Render called once, and toast shown once
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(showToastMock).toHaveBeenCalledTimes(1);
    expect(showToastMock).toHaveBeenCalledWith('تم تحديث تقدمك من السحابة');
    expect(manager.lastApplyChangedLocal).toBe(true);
    expect(manager.getStatus().lastApplyChangedLocal).toBe(true);
  });

  it('(b) pull with no change => no render, no toast', async () => {
    scope.setView({ screen: 'home', catId: null, mode: null, highlightIdx: null, fromSearch: false });

    // Cloud payload identical to localData
    const cloudPayload = {
      schemaVersion: 1,
      progress: JSON.parse(JSON.stringify(localData.progress)),
      stats: JSON.parse(JSON.stringify(localData.stats)),
      starred: Array.from(localData.starred),
      srs: JSON.parse(JSON.stringify(localData.srs)),
      dailyGoal: JSON.parse(JSON.stringify(localData.dailyGoal)),
      updatedAt: '2026-10-08T00:00:00Z'
    };
    await adapter.save(manager.user.uid, cloudPayload);

    renderMock.mockClear();
    showToastMock.mockClear();

    await manager.syncNow();

    expect(renderMock).toHaveBeenCalledTimes(0);
    expect(showToastMock).toHaveBeenCalledTimes(0);
    expect(manager.lastApplyChangedLocal).toBe(false);
    expect(manager.getStatus().lastApplyChangedLocal).toBe(false);
  });

  it('(c) pull while an exercise is on screen => no render, pendingRefresh set, one render after leaving the exercise', async () => {
    scope.setView({ screen: 'exercise', catId: 'obst', mode: 'mcq', highlightIdx: null, fromSearch: false });

    const cloudPayload = {
      schemaVersion: 1,
      dataVersion: 2,
      progress: {
        obst: { mcq: { unlocked: 6, counts: { 'obst.apfel': 4, 'obst.banane': 3 } } }
      },
      stats: {
        totalAnswered: 20,
        totalCorrect: 19,
        current: 5,
        longest: 8,
        todayCount: 6,
        lastDate: '2026-10-08'
      },
      starred: ['obst.apfel'],
      srs: {},
      dailyGoal: { target: 20, updatedAt: '2026-10-08T00:00:00Z' },
      updatedAt: '2026-10-08T02:00:00Z'
    };
    await adapter.save(manager.user.uid, cloudPayload);

    renderMock.mockClear();
    showToastMock.mockClear();

    // Pull arrives while exercise question is active
    await manager.syncNow();

    // Render must NOT be called while question is active, toast is shown, pendingRefresh set
    expect(renderMock).toHaveBeenCalledTimes(0);
    expect(showToastMock).toHaveBeenCalledWith('تم تحديث تقدمك من السحابة');
    expect(scope.getPendingRefresh()).toBe(true);

    // User finishes or leaves the exercise
    scope.go({ screen: 'home', catId: null, mode: null, highlightIdx: null, fromSearch: false });

    // Render is called once upon leaving, pendingRefresh reset
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(scope.getPendingRefresh()).toBe(false);
    expect(scope.getView().screen).toBe('home');
  });

  it('(d) Stats screen still works and does not loop', async () => {
    scope.setView({ screen: 'stats', catId: null, mode: null, highlightIdx: null, fromSearch: false });

    const cloudPayload = {
      schemaVersion: 1,
      dataVersion: 2,
      progress: {
        obst: { mcq: { unlocked: 4, counts: { 'obst.apfel': 2 } } }
      },
      stats: {
        totalAnswered: 12,
        totalCorrect: 11,
        current: 3,
        longest: 4,
        todayCount: 3,
        lastDate: '2026-10-08'
      },
      starred: ['obst.apfel'],
      srs: {},
      dailyGoal: { target: 25, updatedAt: '2026-10-08T02:00:00Z' },
      updatedAt: '2026-10-08T02:00:00Z'
    };
    await adapter.save(manager.user.uid, cloudPayload);

    renderMock.mockClear();
    showToastMock.mockClear();

    await manager.syncNow();

    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(showToastMock).toHaveBeenCalledWith('تم تحديث تقدمك من السحابة');

    // Allow any event cycles to settle: must not trigger a loop
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(renderMock).toHaveBeenCalledTimes(1);
  });

  it('(e) two pulls in a row with the same data => second causes no render', async () => {
    scope.setView({ screen: 'home', catId: null, mode: null, highlightIdx: null, fromSearch: false });

    const cloudPayload = {
      schemaVersion: 1,
      dataVersion: 2,
      progress: {
        obst: { mcq: { unlocked: 5, counts: { 'obst.apfel': 3 } } }
      },
      stats: {
        totalAnswered: 14,
        totalCorrect: 13,
        current: 2,
        longest: 5,
        todayCount: 4,
        lastDate: '2026-10-08'
      },
      starred: ['obst.apfel'],
      srs: {},
      dailyGoal: { target: 20, updatedAt: '2026-10-08T00:00:00Z' },
      updatedAt: '2026-10-08T03:00:00Z'
    };
    await adapter.save(manager.user.uid, cloudPayload);

    renderMock.mockClear();
    showToastMock.mockClear();

    // Pull 1: has changes
    await manager.syncNow();
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(showToastMock).toHaveBeenCalledTimes(1);
    expect(manager.lastApplyChangedLocal).toBe(true);

    // Pull 2: same cloud document, no local changes
    await manager.syncNow();
    // Render count must stay 1 (0 additional renders)
    expect(renderMock).toHaveBeenCalledTimes(1);
    // Toast must stay 1
    expect(showToastMock).toHaveBeenCalledTimes(1);
    expect(manager.lastApplyChangedLocal).toBe(false);
  });
});

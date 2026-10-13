/**
 * tests/sync_launch_flag.test.js
 * Verification of sync launch flag preservation and lazy-bundle startup behavior.
 * Uses REAL production classes (SyncManager, FirebaseSyncAdapter, SyncMergePolicy).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { SyncManager, STATES } from '../sync/sync_manager.js';
import FirebaseSyncAdapter from '../sync/firebase_adapter.js';
import SyncMergePolicy from '../sync/merge_policy.js';

const rootDir = path.resolve(__dirname, '..');
const indexPath = path.join(rootDir, 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

describe('Cross-Device Sync Launch Flag & Session Retention', () => {
  let mockStorage;
  let mockLocalStorage;
  const validConfig = {
    apiKey: 'AIzaSyFakeKey1234567890',
    authDomain: 'test-app.firebaseapp.com',
    projectId: 'test-proj',
    appId: '1:123456789:web:abcdef123456'
  };

  beforeEach(() => {
    mockStorage = new Map();
    mockLocalStorage = {
      getItem: (k) => (mockStorage.has(k) ? mockStorage.get(k) : null),
      setItem: (k, v) => { mockStorage.set(k, String(v)); },
      removeItem: (k) => { mockStorage.delete(k); },
      clear: () => { mockStorage.clear(); }
    };

    globalThis.window = {
      localStorage: mockLocalStorage,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    globalThis.document = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    globalThis.localStorage = mockLocalStorage;
    delete globalThis.FirebaseSync;
    globalThis.FIREBASE_CONFIG = validConfig;
    globalThis.isFirebaseConfigured = (cfg) => Boolean(cfg && cfg.apiKey && !cfg.apiKey.includes('PLACEHOLDER'));
  });

  afterEach(() => {
    delete globalThis.FirebaseSync;
    delete globalThis.FIREBASE_CONFIG;
    delete globalThis.isFirebaseConfigured;
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.localStorage;
  });

  // (a) flag '1' + no bundle: after init() the flag is still '1' and state is not treated as signed out
  it('(a) flag "1" + no bundle: after init() the flag is still "1" and state is not treated as signed out', () => {
    mockLocalStorage.setItem('deutsch_sync_enabled', '1');
    expect(globalThis.FirebaseSync).toBeUndefined();

    const adapter = new FirebaseSyncAdapter(validConfig);
    const manager = new SyncManager({
      adapter,
      policy: SyncMergePolicy
    });

    manager.init();

    // Flag must remain intact and not wiped by synthetic cb(null)
    expect(mockLocalStorage.getItem('deutsch_sync_enabled')).toBe('1');
    // State must NOT be treated as signed out (should be SYNCING while awaiting bundle/auth)
    expect(manager.getStatus().state).not.toBe(STATES.SIGNED_OUT);
    expect(manager.getStatus().state).toBe(STATES.SYNCING);

    manager.destroy();
  });

  // (b) explicit signOut() clears the flag
  it('(b) explicit signOut() clears the flag and transitions to SIGNED_OUT', async () => {
    mockLocalStorage.setItem('deutsch_sync_enabled', '1');

    const fakeFb = {
      getApps: vi.fn(() => []),
      initializeApp: vi.fn(() => ({})),
      getAuth: vi.fn(() => ({ currentUser: { uid: 'user-xyz' } })),
      getFirestore: vi.fn(() => ({})),
      GoogleAuthProvider: vi.fn(function() { this.setCustomParameters = vi.fn(); }),
      signOut: vi.fn().mockResolvedValue(undefined),
      onAuthStateChanged: vi.fn((auth, cb) => () => {})
    };
    globalThis.FirebaseSync = fakeFb;

    const adapter = new FirebaseSyncAdapter(validConfig);
    const manager = new SyncManager({
      adapter,
      policy: SyncMergePolicy
    });
    manager.init();
    manager.user = { uid: 'user-xyz', email: 'user@example.com' };
    manager.state = STATES.SYNCED;

    await manager.signOut();

    expect(mockLocalStorage.getItem('deutsch_sync_enabled')).toBeNull();
    expect(manager.getStatus().state).toBe(STATES.SIGNED_OUT);
    expect(manager.getStatus().user).toBeNull();

    manager.destroy();
  });

  // (c) SDK-emitted null after the bundle is loaded clears the flag
  it('(c) SDK-emitted null after bundle is loaded clears flag and transitions to SIGNED_OUT', async () => {
    mockLocalStorage.setItem('deutsch_sync_enabled', '1');

    let authStateCallback = null;
    const fakeFb = {
      getApps: vi.fn(() => []),
      initializeApp: vi.fn(() => ({})),
      getAuth: vi.fn(() => ({ currentUser: null })),
      getFirestore: vi.fn(() => ({})),
      GoogleAuthProvider: vi.fn(function() { this.setCustomParameters = vi.fn(); }),
      onAuthStateChanged: vi.fn((auth, cb) => {
        authStateCallback = cb;
        return () => {};
      })
    };
    globalThis.FirebaseSync = fakeFb;

    const adapter = new FirebaseSyncAdapter(validConfig);
    const manager = new SyncManager({
      adapter,
      policy: SyncMergePolicy
    });
    manager.init();

    // Adapter attaches the real SDK auth listener
    adapter.attachAuthListener();
    expect(authStateCallback).toBeTypeOf('function');

    // Simulate SDK emitting null (session expired or logged out)
    authStateCallback(null);

    expect(mockLocalStorage.getItem('deutsch_sync_enabled')).toBeNull();
    expect(manager.getStatus().state).toBe(STATES.SIGNED_OUT);
    expect(manager.getStatus().user).toBeNull();

    manager.destroy();
  });

  // (d) with a fake FirebaseSync that emits a user, a launch sequence "init() then lazy load then attachAuthListener" ends SYNCED with the flag set
  it('(d) launch sequence "init() -> load bundle -> attachAuthListener" ends in SYNCED with flag set', async () => {
    mockLocalStorage.setItem('deutsch_sync_enabled', '1');

    let authStateCallback = null;
    const fakeFb = {
      getApps: vi.fn(() => []),
      initializeApp: vi.fn(() => ({})),
      getAuth: vi.fn(() => ({ currentUser: { uid: 'user-saved' } })),
      getFirestore: vi.fn(() => ({})),
      GoogleAuthProvider: vi.fn(function() { this.setCustomParameters = vi.fn(); }),
      doc: vi.fn((db, col, id) => ({ path: `${col}/${id}` })),
      getDoc: vi.fn().mockResolvedValue({
        exists: () => true,
        data: () => ({
          schemaVersion: 1,
          progress: {},
          stats: {},
          starred: [],
          srs: {}
        })
      }),
      setDoc: vi.fn().mockResolvedValue(undefined),
      onAuthStateChanged: vi.fn((auth, cb) => {
        authStateCallback = cb;
        return () => {};
      })
    };

    const adapter = new FirebaseSyncAdapter(validConfig);
    const manager = new SyncManager({
      adapter,
      policy: SyncMergePolicy
    });

    // 1. App launch: init() called with no bundle loaded
    manager.init();
    expect(mockLocalStorage.getItem('deutsch_sync_enabled')).toBe('1');

    // 2. Bundle lazy-loaded
    globalThis.FirebaseSync = fakeFb;

    // 3. attachAuthListener called
    adapter.attachAuthListener();
    expect(authStateCallback).toBeTypeOf('function');

    // 4. Firebase emits restored user
    authStateCallback({
      uid: 'user-saved',
      email: 'saved@example.com',
      displayName: 'Saved Learner',
      photoURL: null
    });

    // Wait for async syncOnSignIn
    await new Promise(r => setTimeout(r, 60));

    expect(manager.getStatus().state).toBe(STATES.SYNCED);
    expect(manager.getStatus().user).toEqual({
      uid: 'user-saved',
      email: 'saved@example.com',
      displayName: 'Saved Learner',
      photoURL: null
    });
    expect(mockLocalStorage.getItem('deutsch_sync_enabled')).toBe('1');

    manager.destroy();
  });

  // (e) the index.html launch logic: extract the real launch code and show behavior
  it('(e) real index.html launch logic: bundle loader is called when flag is set, and NOT called when flag is absent', async () => {
    // Extract the exact launch block from index.html that initializes sync and decides whether to load the bundle
    const initIdx = indexHtml.indexOf('async function init(){');
    expect(initIdx).toBeGreaterThan(0);
    const sub = indexHtml.slice(initIdx);
    const smIfIdx = sub.indexOf('if(window.syncManager){');
    expect(smIfIdx).toBeGreaterThan(0);
    const endIdx = sub.indexOf('requestPersistentStorageOnce();');
    expect(endIdx).toBeGreaterThan(0);
    const slice = sub.slice(smIfIdx, endIdx);
    const lastBrace = slice.lastIndexOf('}');
    const extractedBlock = slice.slice(0, lastBrace + 1).trim();

    // Helper to run the extracted launch block in a controlled context
    function runLaunchBlock(initialFlag) {
      if (initialFlag !== null) {
        mockLocalStorage.setItem('deutsch_sync_enabled', initialFlag);
      } else {
        mockLocalStorage.removeItem('deutsch_sync_enabled');
      }

      let bundleLoaderCalls = 0;
      const testAdapter = new FirebaseSyncAdapter(validConfig);
      const testManager = new SyncManager({
        adapter: testAdapter,
        policy: SyncMergePolicy
      });

      const ctxWindow = {
        localStorage: mockLocalStorage,
        syncManager: testManager,
        FIREBASE_CONFIG: validConfig,
        SYNC_STATES: STATES,
        loadFirebaseSyncBundle: vi.fn(() => {
          bundleLoaderCalls++;
          return Promise.resolve();
        }),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };

      const ctxDocument = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };

      const sandbox = {
        window: ctxWindow,
        document: ctxDocument,
        isFirebaseConfigured: globalThis.isFirebaseConfigured,
        refreshAfterSync: vi.fn(),
        loadFirebaseSyncBundle: ctxWindow.loadFirebaseSyncBundle,
        getDailyGoalRecord: () => 10,
        progress: {},
        stats: {},
        starredSet: new Set(),
        srsStore: {},
        appStorage: { set: vi.fn() },
        STORAGE_KEYS: { PROGRESS: 'p', STATS: 's', DAILY_GOAL: 'dg' },
        saveStarredSoon: vi.fn(),
        saveSrsSoon: vi.fn(),
        setDailyGoalUpdatedAt: vi.fn()
      };

      vm.createContext(sandbox);
      vm.runInContext(extractedBlock, sandbox);

      testManager.destroy();
      return { bundleLoaderCalls, flagAfter: mockLocalStorage.getItem('deutsch_sync_enabled') };
    }

    // Sub-case 1: With flag '1', bundle loader MUST be called at launch
    const withFlag = runLaunchBlock('1');
    expect(withFlag.bundleLoaderCalls).toBe(1);

    // Sub-case 2: With NO flag (clean / signed out user), bundle loader MUST NOT be called (zero requests invariant)
    const withoutFlag = runLaunchBlock(null);
    expect(withoutFlag.bundleLoaderCalls).toBe(0);
  });
});

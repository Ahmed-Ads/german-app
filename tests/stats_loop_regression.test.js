/**
 * tests/stats_loop_regression.test.js
 * Regression test for DEFECT 1: Infinite re-render loop on Stats screen.
 * Exercises REAL sync/sync_manager.js and REAL sync/firebase_adapter.js with a fake FirebaseSync.
 * Simulates onAuthStateChanged firing on subscribe, and a subscriber calling renderStats.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncManager, STATES } from '../sync/sync_manager.js';
import FirebaseSyncAdapter from '../sync/firebase_adapter.js';
import SyncMergePolicy from '../sync/merge_policy.js';

describe('DEFECT 1 Regression: Stats Screen Render Loop', () => {
  let fakeAuth;
  let fakeFb;
  let adapter;
  let manager;

  beforeEach(() => {
    fakeAuth = { currentUser: { uid: 'user-123', email: 'test@example.com' } };
    fakeFb = {
      getApps: () => [],
      initializeApp: () => ({}),
      getAuth: () => fakeAuth,
      getFirestore: () => ({}),
      GoogleAuthProvider: vi.fn(),
      // Real Firebase SDK fires onAuthStateChanged asynchronously on every subscription
      onAuthStateChanged: vi.fn((auth, cb) => {
        const timer = setTimeout(() => {
          cb({ uid: 'user-123', email: 'test@example.com' });
        }, 0);
        return () => clearTimeout(timer);
      }),
      doc: () => ({}),
      getDoc: vi.fn().mockResolvedValue({ exists: () => true, data: () => ({ schemaVersion: 1 }) }),
      setDoc: vi.fn().mockResolvedValue(undefined)
    };

    globalThis.FirebaseSync = fakeFb;
    globalThis.FIREBASE_CONFIG = {
      apiKey: 'AIzaSyFakeKey123',
      authDomain: 'test.firebaseapp.com',
      projectId: 'test',
      appId: '1:123:web:abc'
    };
    globalThis.isFirebaseConfigured = () => true;

    adapter = new FirebaseSyncAdapter(globalThis.FIREBASE_CONFIG);
    manager = new SyncManager({ adapter, policy: SyncMergePolicy });
  });

  afterEach(() => {
    manager.destroy();
    delete globalThis.FirebaseSync;
    delete globalThis.FIREBASE_CONFIG;
    delete globalThis.isFirebaseConfigured;
  });

  it('opening stats screen while signed in must settle in <= 5 renders and reach SYNCED state', async () => {
    let renderCount = 0;
    const MAX_RENDERS_ALLOWED = 5;
    const HARD_LOOP_LIMIT = 20;

    // Simulate renderStats logic from index.html: triggers attachAuthListener
    function simulateRenderStats() {
      renderCount++;
      if (renderCount > HARD_LOOP_LIMIT) {
        throw new Error(`Infinite render loop detected: renderCount exceeded ${HARD_LOOP_LIMIT}`);
      }
      if (adapter && typeof adapter.attachAuthListener === 'function') {
        adapter.attachAuthListener();
      }
    }

    manager.init();

    // Subscribe to syncManager state updates, re-rendering on every notify just like init() in index.html
    manager.subscribe(() => {
      simulateRenderStats();
    });

    // Initial render when entering Stats screen
    simulateRenderStats();

    // Allow asynchronous auth event cycles to settle
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(renderCount).toBeLessThanOrEqual(MAX_RENDERS_ALLOWED);
    expect(manager.getStatus().state).toBe(STATES.SYNCED);
  });
});

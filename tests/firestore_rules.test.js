/**
 * tests/firestore_rules.test.js
 * Verification of firestore.rules hardening.
 *
 * Two layers:
 *  1. Static checks (always run): the rules file declares single-owner guard,
 *     whitelisted & required keys (hasAll and hasOnly), schema version, and realistic bounds.
 *  2. Behavioural checks against the Firestore emulator (needs Java 21+ and firebase-tools).
 *     - If emulator / Java is missing, reports NOT MEASURED (never claims pass).
 *     - When emulator runs, tests single-owner isolation, placeholder fail-closed,
 *       bounds on maps, lists, strings, dailyGoal range [5, 200], and subcollection denials.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import net from 'net';

const REQUIRE_EMULATOR = process.env.REQUIRE_EMULATOR === '1' || !!process.env.FIRESTORE_EMULATOR_HOST;
const rulesContent = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');

// The designated owner UID used for testing configured owner state
const TEST_OWNER_UID = 'test_owner_uid_123';
// Rules with placeholder replaced with a valid test owner UID
const rulesConfiguredOwner = rulesContent.replace(/ALLOWED_UID_PLACEHOLDER/g, TEST_OWNER_UID);

let testEnvPlaceholder = null;
let testEnvOwner = null;
let emulatorRunning = false;
let emulatorError = null;

const validPayload = () => ({
  schemaVersion: 1,
  dataVersion: 1,
  updatedAt: '2026-10-09T00:00:00Z',
  progress: { obst: { mcq: { unlocked: 5, counts: { '0': 2 } } } },
  stats: { current: 3, longest: 5, totalAnswered: 30, totalCorrect: 25 },
  starred: ['obst_0'],
  srs: { obst_0: { box: 1, lastDate: '2026-10-09' } },
  dailyGoal: { target: 20 }
});

describe('Firestore Security Rules: static guards', () => {
  it('declares deny-by-default on all collections', () => {
    expect(rulesContent).toContain('match /{document=**}');
    expect(rulesContent).toContain('allow read, write: if false;');
  });

  it('declares single-owner check isOwner with ALLOWED_UID_PLACEHOLDER', () => {
    expect(rulesContent).toContain('function isOwner(userId)');
    expect(rulesContent).toContain("request.auth.uid == 'ALLOWED_UID_PLACEHOLDER'");
    expect(rulesContent).toContain('request.auth.uid == userId');
  });

  it('enforces both hasAll and hasOnly on all 8 required top-level keys', () => {
    const requiredKeys = ['schemaVersion', 'dataVersion', 'updatedAt', 'progress', 'stats', 'starred', 'srs', 'dailyGoal'];
    for (const k of requiredKeys) {
      expect(rulesContent).toContain(`'${k}'`);
    }
    expect(rulesContent).toContain('keys().hasAll([');
    expect(rulesContent).toContain('keys().hasOnly([');
  });

  it('enforces schemaVersion == 1 and dataVersion >= 1', () => {
    expect(rulesContent).toContain('request.resource.data.schemaVersion is int');
    expect(rulesContent).toContain('request.resource.data.schemaVersion == 1');
    expect(rulesContent).toContain('request.resource.data.dataVersion is int');
    expect(rulesContent).toContain('request.resource.data.dataVersion >= 1');
  });

  it('enforces structural bounds on progress, stats, starred, srs, and dailyGoal', () => {
    expect(rulesContent).toContain('request.resource.data.progress.size() <= 35');
    expect(rulesContent).toContain('request.resource.data.stats.size() <= 10');
    expect(rulesContent).toContain('request.resource.data.starred.size() <= 1200');
    expect(rulesContent).toContain('request.resource.data.srs.size() <= 1200');
    expect(rulesContent).toContain('request.resource.data.dailyGoal.target >= 5');
    expect(rulesContent).toContain('request.resource.data.dailyGoal.target <= 200');
    expect(rulesContent).toContain('request.resource.data.updatedAt.size() <= 40');
  });
});

describe('Firestore Security Rules: emulator behaviour', () => {
  beforeAll(async () => {
    try {
      const hostEnv = process.env.FIRESTORE_EMULATOR_HOST;
      const host = hostEnv ? hostEnv.split(':')[0] : '127.0.0.1';
      const port = hostEnv ? parseInt(hostEnv.split(':')[1], 10) : 8080;

      const isOpen = await new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(800);
        socket.on('connect', () => { socket.destroy(); resolve(true); });
        socket.on('timeout', () => { socket.destroy(); resolve(false); });
        socket.on('error', () => { socket.destroy(); resolve(false); });
        socket.connect(port, host);
      });
      if (!isOpen) {
        throw new Error(`Firestore emulator is not reachable at ${host}:${port}`);
      }

      const { initializeTestEnvironment } = await import('@firebase/rules-unit-testing');

      // 1. Environment with repo placeholder rules
      testEnvPlaceholder = await initializeTestEnvironment({
        projectId: 'demo-german-app-placeholder',
        firestore: { rules: rulesContent, host, port }
      });

      // 2. Environment with configured owner rules
      testEnvOwner = await initializeTestEnvironment({
        projectId: 'demo-german-app-owner',
        firestore: { rules: rulesConfiguredOwner, host, port }
      });

      emulatorRunning = true;
    } catch (e) {
      emulatorRunning = false;
      emulatorError = e;
      if (REQUIRE_EMULATOR) {
        throw new Error('REQUIRE_EMULATOR=1 but the Firestore emulator is unavailable: ' + (e && e.message));
      }
    }
  });

  afterAll(async () => {
    if (testEnvPlaceholder) await testEnvPlaceholder.cleanup();
    if (testEnvOwner) await testEnvOwner.cleanup();
  });

  beforeEach(async (ctx) => {
    if (!emulatorRunning) {
      console.log('NOT MEASURED: Firestore emulator is not running.');
      ctx.skip();
      return;
    }
    await testEnvPlaceholder.clearFirestore();
    await testEnvOwner.clearFirestore();
  });

  const db = (ctxUser) => ctxUser.firestore();

  it('placeholder rules fail closed: even user accessing their matching userId is DENIED', async () => {
    const { assertFails } = await import('@firebase/rules-unit-testing');
    const alice = testEnvPlaceholder.authenticatedContext('alice');
    // Alice accesses users/alice -> denied because 'alice' !== 'ALLOWED_UID_PLACEHOLDER'
    await assertFails(db(alice).doc('users/alice').set(validPayload()));
    await assertFails(db(alice).doc('users/alice').get());
    await assertFails(db(alice).doc('users/alice').delete());
  });

  it('configured owner can create, read, update, and delete their own document', async () => {
    const { assertSucceeds } = await import('@firebase/rules-unit-testing');
    const owner = testEnvOwner.authenticatedContext(TEST_OWNER_UID);
    const docRef = db(owner).doc(`users/${TEST_OWNER_UID}`);

    // Create
    await assertSucceeds(docRef.set(validPayload()));
    // Read
    await assertSucceeds(docRef.get());
    // Update
    await assertSucceeds(docRef.set({ ...validPayload(), starred: ['obst_1'] }));
    // Delete
    await assertSucceeds(docRef.delete());
  });

  it('other authenticated users cannot read, write, or delete owner or own documents', async () => {
    const { assertFails, assertSucceeds } = await import('@firebase/rules-unit-testing');
    const owner = testEnvOwner.authenticatedContext(TEST_OWNER_UID);
    const bob = testEnvOwner.authenticatedContext('bob');

    await assertSucceeds(db(owner).doc(`users/${TEST_OWNER_UID}`).set(validPayload()));

    // Bob cannot read/write/delete owner's document
    await assertFails(db(bob).doc(`users/${TEST_OWNER_UID}`).get());
    await assertFails(db(bob).doc(`users/${TEST_OWNER_UID}`).set(validPayload()));
    await assertFails(db(bob).doc(`users/${TEST_OWNER_UID}`).delete());

    // Bob cannot create or read his own document users/bob because bob !== TEST_OWNER_UID
    await assertFails(db(bob).doc('users/bob').set(validPayload()));
    await assertFails(db(bob).doc('users/bob').get());
  });

  it('unauthenticated requests are denied everything', async () => {
    const { assertFails } = await import('@firebase/rules-unit-testing');
    const anon = testEnvOwner.unauthenticatedContext();
    await assertFails(db(anon).doc(`users/${TEST_OWNER_UID}`).get());
    await assertFails(db(anon).doc(`users/${TEST_OWNER_UID}`).set(validPayload()));
  });

  it('rejects unknown extra keys (hasOnly whitelist)', async () => {
    const { assertFails } = await import('@firebase/rules-unit-testing');
    const owner = testEnvOwner.authenticatedContext(TEST_OWNER_UID);
    const docRef = db(owner).doc(`users/${TEST_OWNER_UID}`);

    await assertFails(docRef.set({ ...validPayload(), unknownExtraKey: true }));
    await assertFails(docRef.set({ ...validPayload(), isAdmin: true }));
  });

  it('rejects missing required keys (hasAll)', async () => {
    const { assertFails } = await import('@firebase/rules-unit-testing');
    const owner = testEnvOwner.authenticatedContext(TEST_OWNER_UID);
    const docRef = db(owner).doc(`users/${TEST_OWNER_UID}`);

    const { srs, ...withoutSrs } = validPayload();
    await assertFails(docRef.set(withoutSrs));

    const { dailyGoal, ...withoutGoal } = validPayload();
    await assertFails(docRef.set(withoutGoal));
  });

  it('rejects invalid schemaVersion and wrong data types', async () => {
    const { assertFails } = await import('@firebase/rules-unit-testing');
    const owner = testEnvOwner.authenticatedContext(TEST_OWNER_UID);
    const docRef = db(owner).doc(`users/${TEST_OWNER_UID}`);

    await assertFails(docRef.set({ ...validPayload(), schemaVersion: 2 }));
    await assertFails(docRef.set({ ...validPayload(), schemaVersion: '1' }));
    await assertFails(docRef.set({ ...validPayload(), dataVersion: 0 }));
    await assertFails(docRef.set({ ...validPayload(), starred: { obst_0: true } })); // starred must be list
    await assertFails(docRef.set({ ...validPayload(), progress: [] })); // progress must be map
    await assertFails(docRef.set({ ...validPayload(), stats: 'stats' })); // stats must be map
  });

  it('rejects oversize maps, lists, and strings', async () => {
    const { assertFails } = await import('@firebase/rules-unit-testing');
    const owner = testEnvOwner.authenticatedContext(TEST_OWNER_UID);
    const docRef = db(owner).doc(`users/${TEST_OWNER_UID}`);

    // Progress > 35 keys
    const bigProgress = {};
    for (let i = 0; i < 36; i++) {
      bigProgress[`cat_${i}`] = { mcq: { unlocked: 1 } };
    }
    await assertFails(docRef.set({ ...validPayload(), progress: bigProgress }));

    // Starred > 1200 items
    const bigStarred = new Array(1201).fill('obst_0');
    await assertFails(docRef.set({ ...validPayload(), starred: bigStarred }));

    // updatedAt > 40 chars
    const longTimestamp = '2026-10-09T00:00:00.0000000000000000000000Z';
    await assertFails(docRef.set({ ...validPayload(), updatedAt: longTimestamp }));
  });

  it('rejects dailyGoal outside [5, 200] range', async () => {
    const { assertFails, assertSucceeds } = await import('@firebase/rules-unit-testing');
    const owner = testEnvOwner.authenticatedContext(TEST_OWNER_UID);
    const docRef = db(owner).doc(`users/${TEST_OWNER_UID}`);

    // target < 5
    await assertFails(docRef.set({ ...validPayload(), dailyGoal: { target: 4 } }));
    // target > 200
    await assertFails(docRef.set({ ...validPayload(), dailyGoal: { target: 201 } }));
    // non-integer target
    await assertFails(docRef.set({ ...validPayload(), dailyGoal: { target: '20' } }));

    // Valid dailyGoal boundaries
    await assertSucceeds(docRef.set({ ...validPayload(), dailyGoal: { target: 5 } }));
    await assertSucceeds(docRef.set({ ...validPayload(), dailyGoal: { target: 200 } }));
  });

  it('denies any collection path other than users/{userId}', async () => {
    const { assertFails } = await import('@firebase/rules-unit-testing');
    const owner = testEnvOwner.authenticatedContext(TEST_OWNER_UID);

    await assertFails(db(owner).doc('other_collection/doc1').get());
    await assertFails(db(owner).doc('other_collection/doc1').set({ a: 1 }));
    await assertFails(db(owner).doc(`users/${TEST_OWNER_UID}/subcollection/doc1`).set({ a: 1 }));
  });
});

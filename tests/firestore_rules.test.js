/**
 * tests/firestore_rules.test.js
 * Verification of firestore.rules.
 *
 * Two layers:
 *  1. Static checks (always run): the rules file declares the expected guards.
 *  2. Behavioural checks against the Firestore emulator (need Java 21+ and firebase-tools).
 *     - Without an emulator these tests are reported as SKIPPED (never as a silent pass).
 *     - With REQUIRE_EMULATOR=1 (or when run via `firebase emulators:exec`) a missing emulator is a hard FAILURE.
 *
 * Run everything locally with:  npm run test:rules
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Strict when explicitly requested, or when launched through `firebase emulators:exec` (which sets FIRESTORE_EMULATOR_HOST).
const REQUIRE_EMULATOR = process.env.REQUIRE_EMULATOR === '1' || !!process.env.FIRESTORE_EMULATOR_HOST;
const rulesContent = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');

let testEnv = null;
let emulatorRunning = false;
let emulatorError = null;

const validPayload = () => ({
  schemaVersion: 1,
  dataVersion: 1,
  updatedAt: '2026-10-05T00:00:00Z',
  progress: { obst: { mcq: { unlocked: 5, counts: { '0': 2 } } } },
  stats: { current: 3, longest: 5, totalAnswered: 30, totalCorrect: 25 },
  starred: ['obst_0'],
  srs: { obst_0: { box: 1, lastDate: '2026-10-05' } },
  dailyGoal: { target: 20 }
});

describe('Firestore Security Rules: static guards', () => {
  it('declares deny-by-default and owner-only access to users/{userId}', () => {
    expect(rulesContent).toContain('match /users/{userId}');
    expect(rulesContent).toContain('request.auth != null && request.auth.uid == userId');
    expect(rulesContent).toContain('allow read, write: if false;');
  });

  it('validates schemaVersion and restricts top-level keys with hasOnly (map.size() counts keys, not bytes)', () => {
    expect(rulesContent).toContain('request.resource.data.schemaVersion == 1');
    expect(rulesContent).toContain('request.resource.data.keys().hasOnly([');
    expect(rulesContent).not.toMatch(/data\.size\(\)\s*<\s*100000/);
  });
});

describe('Firestore Security Rules: emulator behaviour', () => {
  beforeAll(async () => {
    try {
      const { initializeTestEnvironment } = await import('@firebase/rules-unit-testing');
      const hostEnv = process.env.FIRESTORE_EMULATOR_HOST;
      testEnv = await initializeTestEnvironment({
        projectId: 'demo-german-app',
        firestore: {
          rules: rulesContent,
          host: hostEnv ? hostEnv.split(':')[0] : '127.0.0.1',
          port: hostEnv ? parseInt(hostEnv.split(':')[1], 10) : 8080
        }
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
    if (testEnv) await testEnv.cleanup();
  });

  beforeEach(async (ctx) => {
    if (!emulatorRunning) {
      ctx.skip(); // visible as "skipped": run `npm run test:rules` to execute these
      return;
    }
    await testEnv.clearFirestore();
  });

  const db = (ctxUser) => ctxUser.firestore();

  it('owner can create, read and delete their own document', async () => {
    const { assertSucceeds } = await import('@firebase/rules-unit-testing');
    const alice = testEnv.authenticatedContext('alice');
    await assertSucceeds(db(alice).doc('users/alice').set(validPayload()));
    await assertSucceeds(db(alice).doc('users/alice').get());
    await assertSucceeds(db(alice).doc('users/alice').delete());
  });

  it('owner can update their own document', async () => {
    const { assertSucceeds } = await import('@firebase/rules-unit-testing');
    const alice = testEnv.authenticatedContext('alice');
    await assertSucceeds(db(alice).doc('users/alice').set(validPayload()));
    await assertSucceeds(db(alice).doc('users/alice').set({ ...validPayload(), starred: ['obst_1'] }));
  });

  it("another user cannot read, write or delete someone else's document", async () => {
    const { assertFails } = await import('@firebase/rules-unit-testing');
    const alice = testEnv.authenticatedContext('alice');
    const bob = testEnv.authenticatedContext('bob');
    await db(alice).doc('users/alice').set(validPayload());
    await assertFails(db(bob).doc('users/alice').get());
    await assertFails(db(bob).doc('users/alice').set(validPayload()));
    await assertFails(db(bob).doc('users/alice').delete());
  });

  it('unauthenticated clients are denied everything', async () => {
    const { assertFails } = await import('@firebase/rules-unit-testing');
    const anon = testEnv.unauthenticatedContext();
    await assertFails(db(anon).doc('users/alice').get());
    await assertFails(db(anon).doc('users/alice').set(validPayload()));
  });

  it('rejects wrong schemaVersion, unknown extra keys, missing keys and wrong types', async () => {
    const { assertFails } = await import('@firebase/rules-unit-testing');
    const alice = testEnv.authenticatedContext('alice');
    const ref = db(alice).doc('users/alice');

    await assertFails(ref.set({ ...validPayload(), schemaVersion: 2 }));
    await assertFails(ref.set({ ...validPayload(), schemaVersion: '1' }));
    await assertFails(ref.set({ ...validPayload(), isAdmin: true })); // unknown key (hasOnly)
    const { srs, ...missingSrs } = validPayload();
    await assertFails(ref.set(missingSrs));
    await assertFails(ref.set({ ...validPayload(), starred: { a: 1 } })); // must be a list
    await assertFails(ref.set({ ...validPayload(), progress: [] })); // must be a map
  });

  it('denies every collection other than users/{userId}', async () => {
    const { assertFails } = await import('@firebase/rules-unit-testing');
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(db(alice).doc('random_collection/doc1').get());
    await assertFails(db(alice).doc('random_collection/doc1').set({ a: 1 }));
    await assertFails(db(alice).doc('users/alice/sub/doc1').set({ a: 1 }));
  });
});

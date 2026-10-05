/**
 * tests/sync_bundle.test.js
 * Verifies that the committed vendor/firebase-sync.bundle.js is up-to-date,
 * contains the Apache 2.0 license notice, and matches the input hash.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import vm from 'vm';
import { computeInputHash, computeHash } from '../scripts/build_sync_bundle.js';

const rootDir = path.resolve(__dirname, '..');
const bundlePath = path.join(rootDir, 'vendor', 'firebase-sync.bundle.js');
const metaPath = path.join(rootDir, 'vendor', 'bundle_meta.json');

describe('Vendor Firebase Sync Bundle Integrity', () => {
  it('exists and has non-zero size', () => {
    expect(fs.existsSync(bundlePath)).toBe(true);
    const stat = fs.statSync(bundlePath);
    expect(stat.size).toBeGreaterThan(100000); // at least 100 KB
  });

  it('includes the official Apache 2.0 license banner', () => {
    const content = fs.readFileSync(bundlePath, 'utf8');
    expect(content).toContain('Apache License 2.0');
    expect(content).toContain('Firebase Modular Web SDK');
    expect(content).toContain('Google LLC');
  });

  it('matches the committed bundle_meta.json and is not stale', () => {
    expect(fs.existsSync(metaPath)).toBe(true);
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

    const currentInputHash = computeInputHash();
    expect(currentInputHash).toBe(meta.inputHash);

    const bundleContent = fs.readFileSync(bundlePath, 'utf8');
    const currentBundleHash = computeHash(bundleContent);
    expect(currentBundleHash).toBe(meta.bundleHash);
  });

  it('evaluates cleanly and exposes expected FirebaseSync APIs without polluting global scope', () => {
    const content = fs.readFileSync(bundlePath, 'utf8');
    const sandbox = {
      window: {},
      console: console,
      setTimeout,
      clearTimeout
    };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    vm.createContext(sandbox);

    expect(() => {
      vm.runInContext(content, sandbox);
    }).not.toThrow();

    const fb = sandbox.FirebaseSync;
    expect(fb).toBeDefined();
    expect(typeof fb.initializeApp).toBe('function');
    expect(typeof fb.getAuth).toBe('function');
    expect(typeof fb.GoogleAuthProvider).toBe('function');
    expect(typeof fb.signInWithPopup).toBe('function');
    expect(typeof fb.signOut).toBe('function');
    expect(typeof fb.onAuthStateChanged).toBe('function');
    expect(typeof fb.getFirestore).toBe('function');
    expect(typeof fb.doc).toBe('function');
    expect(typeof fb.getDoc).toBe('function');
    expect(typeof fb.setDoc).toBe('function');
    expect(typeof fb.deleteDoc).toBe('function');
  });
});

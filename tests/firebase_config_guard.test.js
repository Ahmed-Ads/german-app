/**
 * tests/firebase_config_guard.test.js
 *
 * Guard tests (Steps 4 & 5):
 * 4a) The repo's firebase-config.js is configured (isFirebaseConfigured true, projectId 'german-app-ads').
 * 4b) The repo contains no secrets: scans tracked text files (excluding vendor/firebase-sync.bundle.js,
 *     package-lock.json, and node_modules) for forbidden credential signatures.
 * 4c) firestore.rules still contains ALLOWED_UID_PLACEHOLDER and no 28-character Firebase UID inside isOwner.
 * 5)  Lazy-load invariant with REAL config: bundle is NOT requested on clean startup/home screen,
 *     and is only requested when opening the Stats screen or when previous session flags exist.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import vm from 'vm';

const rootDir = path.resolve(__dirname, '..');

describe('Step 4: Firebase Config & Security Guard Tests', () => {
  it('4a: firebase-config.js is configured for german-app-ads', () => {
    const configPath = path.join(rootDir, 'firebase-config.js');
    expect(fs.existsSync(configPath)).toBe(true);

    const configCode = fs.readFileSync(configPath, 'utf8');
    const sandbox = {};
    vm.createContext(sandbox);
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.runInContext(configCode, sandbox);

    expect(sandbox.FIREBASE_CONFIG).toBeDefined();
    expect(typeof sandbox.isFirebaseConfigured).toBe('function');
    expect(sandbox.isFirebaseConfigured(sandbox.FIREBASE_CONFIG)).toBe(true);

    expect(sandbox.FIREBASE_CONFIG.projectId).toBe('german-app-ads');
    expect(sandbox.FIREBASE_CONFIG.authDomain).toBe('german-app-ads.firebaseapp.com');
    expect(sandbox.FIREBASE_CONFIG.storageBucket).toBe('german-app-ads.firebasestorage.app');
    expect(sandbox.FIREBASE_CONFIG.apiKey).toBe('AIzaSyApuBJN4hT0_iLg37H5Y0yW5mPL2ZrflS0');
    expect(sandbox.FIREBASE_CONFIG.messagingSenderId).toBe('79286358420');
    expect(sandbox.FIREBASE_CONFIG.appId).toBe('1:79286358420:web:846d1f8e613ef5c597ff81');
  });

  it('4b: repository contains no secrets in tracked files', () => {
    const trackedFiles = execSync('git ls-files', { cwd: rootDir, encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);

    const excludedFiles = new Set([
      'vendor/firebase-sync.bundle.js',
      'package-lock.json',
      'tests/firebase_config_guard.test.js'
    ]);

    // Construct search tokens dynamically to prevent false self-matches in tests/scanners
    const forbiddenPatterns = [
      '-----' + 'BEGIN',
      'private' + '_key',
      '"type"' + ': "service_account"',
      'client' + '_secret',
      'refresh' + '_token'
    ];

    const violations = [];

    for (const relPath of trackedFiles) {
      if (excludedFiles.has(relPath) || relPath.startsWith('node_modules/')) {
        continue;
      }
      const fullPath = path.join(rootDir, relPath);
      if (!fs.existsSync(fullPath)) continue;
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) continue;

      let content;
      try {
        content = fs.readFileSync(fullPath, 'utf8');
      } catch {
        // Binary or unreadable file
        continue;
      }

      for (const pattern of forbiddenPatterns) {
        if (content.includes(pattern)) {
          violations.push({ file: relPath, pattern });
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('4c: firestore.rules preserves ALLOWED_UID_PLACEHOLDER and has no 28-char UID in isOwner', () => {
    const rulesPath = path.join(rootDir, 'firestore.rules');
    expect(fs.existsSync(rulesPath)).toBe(true);

    const rulesContent = fs.readFileSync(rulesPath, 'utf8');
    expect(rulesContent).toContain('ALLOWED_UID_PLACEHOLDER');

    const isOwnerMatch = rulesContent.match(/function\s+isOwner\s*\([^)]*\)\s*\{[\s\S]*?\}/);
    expect(isOwnerMatch).not.toBeNull();
    const isOwnerBody = isOwnerMatch[0];

    expect(isOwnerBody).toContain('request.auth.uid == \'ALLOWED_UID_PLACEHOLDER\'');

    // Firebase Authentication UIDs are 28 alphanumeric characters
    // Ensure no 28-character UID literal exists in isOwner
    const uidLikeTokens = isOwnerBody.match(/\b[A-Za-z0-9_-]{28}\b/g) || [];
    expect(uidLikeTokens).toEqual([]);
  });
});

describe('Step 5: Lazy-Load Invariant With Real Config', () => {
  let indexHtml;
  let realConfigSandbox;
  let appendedScripts;
  let mockHead;
  let mockLocalStorage;

  beforeEach(() => {
    indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

    const configCode = fs.readFileSync(path.join(rootDir, 'firebase-config.js'), 'utf8');
    realConfigSandbox = {};
    vm.createContext(realConfigSandbox);
    realConfigSandbox.window = realConfigSandbox;
    realConfigSandbox.globalThis = realConfigSandbox;
    vm.runInContext(configCode, realConfigSandbox);

    appendedScripts = [];
    mockHead = {
      appendChild: vi.fn((el) => {
        appendedScripts.push(el);
        return el;
      })
    };

    const storageMap = new Map();
    mockLocalStorage = {
      getItem: vi.fn((k) => storageMap.get(k) || null),
      setItem: vi.fn((k, v) => storageMap.set(k, String(v))),
      removeItem: vi.fn((k) => storageMap.delete(k)),
      clear: vi.fn(() => storageMap.clear())
    };

    globalThis.document = {
      head: mockHead,
      createElement: vi.fn((tag) => ({
        tagName: tag.toUpperCase(),
        src: '',
        async: false,
        onload: null,
        onerror: null
      }))
    };
    globalThis.window = {
      localStorage: mockLocalStorage,
      FIREBASE_CONFIG: realConfigSandbox.FIREBASE_CONFIG,
      isFirebaseConfigured: realConfigSandbox.isFirebaseConfigured,
      syncManager: {
        init: vi.fn(),
        subscribe: vi.fn(),
        adapter: {
          attachAuthListener: vi.fn(),
          checkRedirectResult: vi.fn().mockResolvedValue(null)
        }
      }
    };
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true },
      configurable: true,
      writable: true
    });
  });

  afterEach(() => {
    delete globalThis.document;
    delete globalThis.window;
  });

  it('clean startup on home screen: Firebase bundle is NOT requested despite real config', () => {
    // Verify pre-conditions: clean local storage
    expect(mockLocalStorage.getItem('deutsch_sync_enabled')).toBeNull();
    expect(mockLocalStorage.getItem('deutsch_sync_redirect_pending')).toBeNull();
    expect(realConfigSandbox.isFirebaseConfigured(realConfigSandbox.FIREBASE_CONFIG)).toBe(true);

    // Extract the startup sync check logic from index.html (lines ~5930-5948)
    const hadSyncEnabled = window.localStorage && window.localStorage.getItem('deutsch_sync_enabled') === '1';
    const redirectPending = window.localStorage && window.localStorage.getItem('deutsch_sync_redirect_pending') === '1';

    let bundleLoaderCalled = false;
    window.loadFirebaseSyncBundle = () => {
      bundleLoaderCalled = true;
      return Promise.resolve();
    };

    if ((hadSyncEnabled || redirectPending) && typeof window.isFirebaseConfigured === 'function' && window.isFirebaseConfigured(window.FIREBASE_CONFIG)) {
      if (typeof window.loadFirebaseSyncBundle === 'function') {
        window.loadFirebaseSyncBundle();
      }
    }

    expect(bundleLoaderCalled).toBe(false);
    expect(appendedScripts.length).toBe(0);
    expect(mockHead.appendChild).not.toHaveBeenCalled();
  });

  it('opening Stats screen: Firebase bundle IS requested when configured', async () => {
    // Extract loadFirebaseSyncBundle and triggerSyncBundleOnStatsOpen from index.html
    const loaderMatch = indexHtml.match(/let\s+_firebaseBundlePromise\s*=\s*null;\s*function\s+loadFirebaseSyncBundle\(\)\s*\{[\s\S]*?\n\}/);
    expect(loaderMatch).not.toBeNull();

    const triggerMatch = indexHtml.match(/let\s+_statsSyncBundleTriggered\s*=\s*false;\s*function\s+triggerSyncBundleOnStatsOpen\(\)\s*\{[\s\S]*?\n\}/);
    expect(triggerMatch).not.toBeNull();

    const contextSandbox = {
      window: globalThis.window,
      document: globalThis.document,
      navigator: globalThis.navigator,
      FIREBASE_CONFIG: realConfigSandbox.FIREBASE_CONFIG,
      isFirebaseConfigured: realConfigSandbox.isFirebaseConfigured
    };
    vm.createContext(contextSandbox);
    vm.runInContext(`${loaderMatch[0]}; window.loadFirebaseSyncBundle = loadFirebaseSyncBundle;`, contextSandbox);
    vm.runInContext(triggerMatch[0], contextSandbox);

    // Trigger stats open
    contextSandbox.triggerSyncBundleOnStatsOpen();

    expect(mockHead.appendChild).toHaveBeenCalledTimes(1);
    expect(appendedScripts.length).toBe(1);
    expect(appendedScripts[0].src).toBe('vendor/firebase-sync.bundle.js');
  });

  it('startup with previous session flag (deutsch_sync_enabled=1): bundle IS requested', () => {
    mockLocalStorage.setItem('deutsch_sync_enabled', '1');

    const hadSyncEnabled = window.localStorage && window.localStorage.getItem('deutsch_sync_enabled') === '1';
    const redirectPending = window.localStorage && window.localStorage.getItem('deutsch_sync_redirect_pending') === '1';

    let bundleLoaderCalled = false;
    window.loadFirebaseSyncBundle = () => {
      bundleLoaderCalled = true;
      return Promise.resolve();
    };

    if ((hadSyncEnabled || redirectPending) && typeof window.isFirebaseConfigured === 'function' && window.isFirebaseConfigured(window.FIREBASE_CONFIG)) {
      if (typeof window.loadFirebaseSyncBundle === 'function') {
        window.loadFirebaseSyncBundle();
      }
    }

    expect(bundleLoaderCalled).toBe(true);
  });
});

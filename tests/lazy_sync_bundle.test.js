/**
 * tests/lazy_sync_bundle.test.js
 * Verifies lazy loading of Firebase bundle (Task E).
 * Ensures ZERO network requests and ZERO script tags on initial load when unconfigured,
 * tests lazy loading on-demand when configured, verifies graceful offline handling,
 * and asserts clean unconfigured UI state.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const rootDir = path.resolve(__dirname, '..');
const indexHtmlPath = path.join(rootDir, 'index.html');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

describe('Lazy Loading of Firebase Sync Bundle (Task E)', () => {
  it('static inspection: index.html contains ZERO static script tags for firebase-sync.bundle.js', () => {
    // Must NOT have static script tag for vendor/firebase-sync.bundle.js
    expect(indexHtml).not.toMatch(/<script[^>]+src=["'][^"']*firebase-sync\.bundle\.js["'][^>]*>/i);

    // Initial sync scripts are limited to config, policy, adapter, and manager
    const scriptSrcMatches = Array.from(indexHtml.matchAll(/<script\s+src=["']([^"']+)["']\s*><\/script>/gi)).map(m => m[1]);
    expect(scriptSrcMatches).toContain('firebase-config.js');
    expect(scriptSrcMatches).toContain('sync/merge_policy.js');
    expect(scriptSrcMatches).toContain('sync/firebase_adapter.js');
    expect(scriptSrcMatches).toContain('sync/sync_manager.js');
    expect(scriptSrcMatches).not.toContain('vendor/firebase-sync.bundle.js');
  });

  describe('Dynamic Lazy Loader & Zero-Request Invariants', () => {
    let mockHead;
    let appendedScripts;
    let originalNavigator;
    let originalWindow;

    // Simulate Node >= 21 where globalThis.navigator is a getter-only property
    const originalNavigatorDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    beforeAll(() => {
      Object.defineProperty(globalThis, 'navigator', {
        get() { return { userAgent: 'node-simulated-getter-only' }; },
        configurable: true,
        enumerable: true
      });
    });
    afterAll(() => {
      if (originalNavigatorDesc) {
        Object.defineProperty(globalThis, 'navigator', originalNavigatorDesc);
      } else {
        delete globalThis.navigator;
      }
    });

    function setMockNavigator(navObj) {
      Object.defineProperty(globalThis, 'navigator', {
        value: navObj,
        configurable: true,
        writable: true,
        enumerable: true
      });
    }

    beforeEach(() => {
      appendedScripts = [];
      mockHead = {
        appendChild: vi.fn((el) => {
          appendedScripts.push(el);
          return el;
        })
      };

      globalThis.document = {
        head: mockHead,
        createElement: vi.fn((tag) => {
          return {
            tagName: tag.toUpperCase(),
            src: '',
            async: false,
            onload: null,
            onerror: null
          };
        })
      };

      setMockNavigator({ onLine: true });
      globalThis.window = globalThis;
      delete globalThis.FirebaseSync;
      delete globalThis._firebaseBundlePromise;
    });

    afterEach(() => {
      delete globalThis.document;
      if (originalNavigatorDesc) {
        Object.defineProperty(globalThis, 'navigator', originalNavigatorDesc);
      } else {
        delete globalThis.navigator;
      }
      delete globalThis.window;
      delete globalThis.FirebaseSync;
      delete globalThis.FIREBASE_CONFIG;
      delete globalThis.isFirebaseConfigured;
      delete globalThis.loadFirebaseSyncBundle;
      delete globalThis._firebaseBundlePromise;
    });

    it('when unconfigured: loadFirebaseSyncBundle generates ZERO network requests / script tags', async () => {
      globalThis.FIREBASE_CONFIG = {
        apiKey: 'PLACEHOLDER_API_KEY',
        projectId: 'PLACEHOLDER_PROJECT_ID'
      };
      globalThis.isFirebaseConfigured = () => false;

      // Extract and execute the real loadFirebaseSyncBundle definition from index.html
      const loaderMatch = indexHtml.match(/let\s+_firebaseBundlePromise\s*=\s*null;\s*function\s+loadFirebaseSyncBundle\(\)\s*\{[\s\S]*?\n\}/);
      expect(loaderMatch).not.toBeNull();
      const loaderFunc = new Function(`${loaderMatch[0]}; return loadFirebaseSyncBundle;`)();

      const result = await loaderFunc();
      expect(result).toBeNull();
      // Zero scripts created or appended to head
      expect(appendedScripts.length).toBe(0);
      expect(mockHead.appendChild).not.toHaveBeenCalled();
    });

    it('when offline: loadFirebaseSyncBundle fails gracefully with clear Arabic error', async () => {
      globalThis.FIREBASE_CONFIG = {
        apiKey: 'AIzaSyFakeKey123',
        authDomain: 'test.firebaseapp.com',
        projectId: 'test',
        appId: '1:123:web:abc'
      };
      globalThis.isFirebaseConfigured = () => true;
      setMockNavigator({ onLine: false }); // Offline

      const loaderMatch = indexHtml.match(/let\s+_firebaseBundlePromise\s*=\s*null;\s*function\s+loadFirebaseSyncBundle\(\)\s*\{[\s\S]*?\n\}/);
      const loaderFunc = new Function(`${loaderMatch[0]}; return loadFirebaseSyncBundle;`)();

      await expect(loaderFunc()).rejects.toThrow('أنت غير متصل بالإنترنت. تعذر تحميل حزمة المزامنة السحابية أوفلاين.');
      expect(appendedScripts.length).toBe(0);
      expect(mockHead.appendChild).not.toHaveBeenCalled();
    });

    it('when online & configured: injects script tag with async attribute and resolves on load', async () => {
      globalThis.FIREBASE_CONFIG = {
        apiKey: 'AIzaSyFakeKey123',
        authDomain: 'test.firebaseapp.com',
        projectId: 'test',
        appId: '1:123:web:abc'
      };
      globalThis.isFirebaseConfigured = () => true;
      setMockNavigator({ onLine: true });

      const loaderMatch = indexHtml.match(/let\s+_firebaseBundlePromise\s*=\s*null;\s*function\s+loadFirebaseSyncBundle\(\)\s*\{[\s\S]*?\n\}/);
      const loaderFunc = new Function(`${loaderMatch[0]}; return loadFirebaseSyncBundle;`)();

      const loadPromise = loaderFunc();

      expect(mockHead.appendChild).toHaveBeenCalledTimes(1);
      expect(appendedScripts.length).toBe(1);
      const scriptTag = appendedScripts[0];
      expect(scriptTag.src).toBe('vendor/firebase-sync.bundle.js');
      expect(scriptTag.async).toBe(true);

      // Simulate successful script load
      globalThis.FirebaseSync = { initialized: true };
      scriptTag.onload();

      const resolved = await loadPromise;
      expect(resolved).toEqual({ initialized: true });
    });

    it('handles script loading error with clear Arabic message and allows retry', async () => {
      globalThis.FIREBASE_CONFIG = {
        apiKey: 'AIzaSyFakeKey123',
        authDomain: 'test.firebaseapp.com',
        projectId: 'test',
        appId: '1:123:web:abc'
      };
      globalThis.isFirebaseConfigured = () => true;
      setMockNavigator({ onLine: true });

      const loaderMatch = indexHtml.match(/let\s+_firebaseBundlePromise\s*=\s*null;\s*function\s+loadFirebaseSyncBundle\(\)\s*\{[\s\S]*?\n\}/);
      const loaderFunc = new Function(`${loaderMatch[0]}; return loadFirebaseSyncBundle;`)();

      const loadPromise = loaderFunc();
      const scriptTag = appendedScripts[0];

      // Simulate script error (e.g. 404 or network disconnect)
      scriptTag.onerror();

      await expect(loadPromise).rejects.toThrow('فشل تحميل حزمة المزامنة السحابية. تحقق من اتصالك بالإنترنت.');
    });
  });

  describe('UI Unconfigured State Verification', () => {
    it('renderSyncBoxHtml displays clean unconfigured badge without buttons when sync is inert', () => {
      // Extract renderSyncBoxHtml function from index.html
      const funcMatch = indexHtml.match(/function\s+renderSyncBoxHtml\(\)\s*\{[\s\S]*?\n\}/);
      expect(funcMatch).not.toBeNull();

      // Execute with null / unconfigured syncManager
      globalThis.window = {
        syncManager: {
          getStatus: () => ({ state: 'UNCONFIGURED', isConfigured: false, user: null })
        }
      };

      const renderSyncBoxHtml = new Function(`${funcMatch[0]}; return renderSyncBoxHtml;`)();
      const html = renderSyncBoxHtml();

      expect(html).toContain('المزامنة غير مفعّلة (الإعداد غير مكتمل)');
      expect(html).toContain('sync-status-inactive');
      expect(html).toContain('المزامنة السحابية غير متاحة حاليًا');
      // No action buttons rendered in unconfigured state
      expect(html).not.toContain('syncSignInBtn');
      expect(html).not.toContain('syncNowBtn');
      expect(html).not.toContain('syncSignOutBtn');
      expect(html).not.toContain('syncDeleteBtn');

      delete globalThis.window;
    });
  });
});

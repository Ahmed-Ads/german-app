/**
 * tests/firebase_adapter.test.js
 * Unit tests for sync/firebase_adapter.js exercising the REAL production class.
 * Tests popup fallback to signInWithRedirect, getRedirectResult, error mappings,
 * and fail-safe inert behaviour when unconfigured.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import FirebaseSyncAdapter from '../sync/firebase_adapter.js';

describe('FirebaseSyncAdapter - Fallback Sign-In & Redirect (Task D)', () => {
  let mockAuth;
  let mockDb;
  let mockFb;
  let adapter;
  const validConfig = {
    apiKey: 'AIzaSyFakeValidKey1234567890',
    authDomain: 'test-app.firebaseapp.com',
    projectId: 'test-proj',
    appId: '1:123456789:web:abcdef123456'
  };

  let mockStorage;

  beforeEach(() => {
    mockStorage = new Map();
    globalThis.window = {
      localStorage: {
        getItem: (k) => (mockStorage.has(k) ? mockStorage.get(k) : null),
        setItem: (k, v) => { mockStorage.set(k, String(v)); },
        removeItem: (k) => { mockStorage.delete(k); },
        clear: () => { mockStorage.clear(); }
      }
    };
    mockAuth = { currentUser: null };
    mockDb = {};
    mockFb = {
      getApps: vi.fn(() => []),
      initializeApp: vi.fn(() => ({})),
      getAuth: vi.fn(() => mockAuth),
      getFirestore: vi.fn(() => mockDb),
      GoogleAuthProvider: vi.fn(function () {
        this.setCustomParameters = vi.fn();
      }),
      signInWithPopup: vi.fn(),
      signInWithRedirect: vi.fn().mockResolvedValue(undefined),
      getRedirectResult: vi.fn(),
      signOut: vi.fn().mockResolvedValue(undefined),
      onAuthStateChanged: vi.fn(),
      doc: vi.fn((db, col, id) => ({ path: `${col}/${id}` })),
      getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
      setDoc: vi.fn().mockResolvedValue(undefined),
      deleteDoc: vi.fn().mockResolvedValue(undefined)
    };

    globalThis.FirebaseSync = mockFb;
    globalThis.isFirebaseConfigured = (cfg) => {
      if (!cfg || !cfg.apiKey) return false;
      return !cfg.apiKey.includes('PLACEHOLDER');
    };
    adapter = new FirebaseSyncAdapter(validConfig);
  });

  afterEach(() => {
    delete globalThis.FirebaseSync;
    delete globalThis.isFirebaseConfigured;
    delete globalThis.loadFirebaseSyncBundle;
    delete globalThis.window;
  });

  it('successful popup sign-in returns normalized user profile', async () => {
    mockFb.signInWithPopup.mockResolvedValueOnce({
      user: {
        uid: 'user-abc',
        email: 'user@example.com',
        displayName: 'Test Learner',
        photoURL: 'https://photo.url'
      }
    });

    const user = await adapter.signIn();
    expect(user).toEqual({
      uid: 'user-abc',
      email: 'user@example.com',
      displayName: 'Test Learner',
      photoURL: 'https://photo.url'
    });
    expect(mockFb.signInWithPopup).toHaveBeenCalledTimes(1);
    expect(mockFb.signInWithRedirect).not.toHaveBeenCalled();
  });

  it('falls back to signInWithRedirect on auth/popup-blocked and sets redirect pending flag', async () => {
    const error = new Error('Popup blocked');
    error.code = 'auth/popup-blocked';
    mockFb.signInWithPopup.mockRejectedValueOnce(error);

    expect(window.localStorage.getItem('deutsch_sync_redirect_pending')).toBeNull();
    const result = await adapter.signIn();
    expect(result).toBeNull(); // Redirect initiated
    expect(mockFb.signInWithPopup).toHaveBeenCalledTimes(1);
    expect(mockFb.signInWithRedirect).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('deutsch_sync_redirect_pending')).toBe('1');
  });

  it('does NOT fallback on auth/popup-closed-by-user, throws Arabic cancellation, and does not set redirect pending flag', async () => {
    const error = new Error('Popup closed by user');
    error.code = 'auth/popup-closed-by-user';
    mockFb.signInWithPopup.mockRejectedValueOnce(error);

    await expect(adapter.signIn()).rejects.toThrow('تم إلغاء طلب تسجيل الدخول.');
    expect(mockFb.signInWithPopup).toHaveBeenCalledTimes(1);
    expect(mockFb.signInWithRedirect).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('deutsch_sync_redirect_pending')).toBeNull();
  });

  it('falls back to signInWithRedirect on auth/operation-not-supported-in-this-environment', async () => {
    const error = new Error('Operation not supported');
    error.code = 'auth/operation-not-supported-in-this-environment';
    mockFb.signInWithPopup.mockRejectedValueOnce(error);

    const result = await adapter.signIn();
    expect(result).toBeNull();
    expect(mockFb.signInWithPopup).toHaveBeenCalledTimes(1);
    expect(mockFb.signInWithRedirect).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('deutsch_sync_redirect_pending')).toBe('1');
  });

  it('does NOT fallback on auth/network-request-failed and throws Arabic explanation', async () => {
    const error = new Error('Network failed');
    error.code = 'auth/network-request-failed';
    mockFb.signInWithPopup.mockRejectedValueOnce(error);

    await expect(adapter.signIn()).rejects.toThrow('تعذر الاتصال بخوادم المصادقة. تحقق من اتصالك بالإنترنت.');
    expect(mockFb.signInWithRedirect).not.toHaveBeenCalled();
  });

  it('does NOT fallback on auth/cancelled-popup-request and throws Arabic explanation', async () => {
    const error = new Error('Cancelled popup');
    error.code = 'auth/cancelled-popup-request';
    mockFb.signInWithPopup.mockRejectedValueOnce(error);

    await expect(adapter.signIn()).rejects.toThrow('تم إلغاء طلب تسجيل الدخول.');
    expect(mockFb.signInWithRedirect).not.toHaveBeenCalled();
  });

  it('handles fallback redirect failure cleanly with clear Arabic error and clears pending flag', async () => {
    const popupError = new Error('Popup blocked');
    popupError.code = 'auth/popup-blocked';
    mockFb.signInWithPopup.mockRejectedValueOnce(popupError);

    const redirectError = new Error('Redirect navigation denied');
    redirectError.code = 'auth/redirect-operation-failed';
    mockFb.signInWithRedirect.mockRejectedValueOnce(redirectError);

    await expect(adapter.signIn()).rejects.toThrow('تعذر تحويل تسجيل الدخول (Redirect)');
    expect(window.localStorage.getItem('deutsch_sync_redirect_pending')).toBeNull();
  });

  it('checkRedirectResult resolves to user when returning from redirect sign-in and clears pending flag', async () => {
    window.localStorage.setItem('deutsch_sync_redirect_pending', '1');
    mockFb.getRedirectResult.mockResolvedValueOnce({
      user: {
        uid: 'user-redirect-xyz',
        email: 'redirect@example.com',
        displayName: 'Redirect Learner',
        photoURL: null
      }
    });

    const user = await adapter.checkRedirectResult();
    expect(user).toEqual({
      uid: 'user-redirect-xyz',
      email: 'redirect@example.com',
      displayName: 'Redirect Learner',
      photoURL: null
    });
    expect(mockFb.getRedirectResult).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('deutsch_sync_redirect_pending')).toBeNull();
  });

  it('checkRedirectResult returns null when no redirect operation was in progress and clears pending flag', async () => {
    window.localStorage.setItem('deutsch_sync_redirect_pending', '1');
    mockFb.getRedirectResult.mockResolvedValueOnce(null);

    const user = await adapter.checkRedirectResult();
    expect(user).toBeNull();
    expect(mockFb.getRedirectResult).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('deutsch_sync_redirect_pending')).toBeNull();
  });

  it('checkRedirectResult throws clear Arabic error on network failure and clears pending flag', async () => {
    window.localStorage.setItem('deutsch_sync_redirect_pending', '1');
    const netErr = new Error('Network error');
    netErr.code = 'auth/network-request-failed';
    mockFb.getRedirectResult.mockRejectedValueOnce(netErr);

    await expect(adapter.checkRedirectResult()).rejects.toThrow(
      'تعذر الاتصال بخوادم المصادقة بعد إعادة التوجيه'
    );
    expect(window.localStorage.getItem('deutsch_sync_redirect_pending')).toBeNull();
  });

  it('remains completely inert when unconfigured with placeholder config', async () => {
    const inertAdapter = new FirebaseSyncAdapter({
      apiKey: 'AIzaSy_FAKE_PLACEHOLDER_KEY',
      projectId: 'placeholder-project'
    });

    expect(inertAdapter.isConfigured()).toBe(false);
    await expect(inertAdapter.signIn()).rejects.toThrow('المزامنة السحابية غير مهيأة بعد');
    const redirectRes = await inertAdapter.checkRedirectResult();
    expect(redirectRes).toBeNull();
    expect(mockFb.signInWithPopup).not.toHaveBeenCalled();
    expect(mockFb.getRedirectResult).not.toHaveBeenCalled();

    // Data operations return null / void safely without throwing
    const loadRes = await inertAdapter.load('some-uid');
    expect(loadRes).toBeNull();
    await expect(inertAdapter.save('some-uid', {})).resolves.toBeUndefined();
    await expect(inertAdapter.deleteData('some-uid')).resolves.toBeUndefined();
  });
});

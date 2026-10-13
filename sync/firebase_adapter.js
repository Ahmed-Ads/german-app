/**
 * sync/firebase_adapter.js
 * Production Cloud Firestore & Google Auth Adapter.
 * Integrates with window.FirebaseSync and window.FIREBASE_CONFIG.
 */

(function(global) {
  'use strict';

  class FirebaseSyncAdapter {
    constructor(config) {
      this.config = config || (typeof global !== 'undefined' ? global.FIREBASE_CONFIG : null);
      this.app = null;
      this.auth = null;
      this.db = null;
      this.googleProvider = null;
      this._authUnsubscribe = null;
      this._authCallback = null;
    }

    isConfigured() {
      if (typeof global !== 'undefined' && typeof global.isFirebaseConfigured === 'function') {
        return global.isFirebaseConfigured(this.config);
      }
      if (!this.config || typeof this.config !== 'object') return false;
      const key = this.config.apiKey || '';
      return key.length > 0 && !key.includes('PLACEHOLDER');
    }

    async loadBundle() {
      if (!this.isConfigured()) return false;
      const fb = typeof global !== 'undefined' ? global.FirebaseSync : null;
      if (fb) return true;
      if (typeof global !== 'undefined' && typeof global.loadFirebaseSyncBundle === 'function') {
        const res = await global.loadFirebaseSyncBundle();
        return Boolean(res);
      }
      return false;
    }

    _ensureInitialized() {
      if (!this.isConfigured()) {
        throw new Error('Firebase is not configured (placeholders detected).');
      }
      const fb = typeof global !== 'undefined' ? global.FirebaseSync : null;
      if (!fb) {
        throw new Error('لم يتم تحميل حزمة المزامنة بعد (FirebaseSync bundle is not loaded).');
      }

      if (!this.app) {
        const apps = fb.getApps();
        this.app = apps.length > 0 ? apps[0] : fb.initializeApp(this.config);
        this.auth = fb.getAuth(this.app);
        this.db = fb.getFirestore(this.app);
        this.googleProvider = new fb.GoogleAuthProvider();
        this.googleProvider.setCustomParameters({ prompt: 'select_account' });
      }
      return { fb, auth: this.auth, db: this.db };
    }

    async signIn() {
      if (!this.isConfigured()) {
        throw new Error('المزامنة السحابية غير مهيأة بعد.');
      }
      await this.loadBundle();
      const { fb, auth } = this._ensureInitialized();
      try {
        const result = await fb.signInWithPopup(auth, this.googleProvider);
        const user = result.user;
        return {
          uid: user.uid,
          email: user.email || null,
          displayName: user.displayName || null,
          photoURL: user.photoURL || null
        };
      } catch (err) {
        const fallbackCodes = [
          'auth/popup-blocked',
          'auth/operation-not-supported-in-this-environment'
        ];
        if (fallbackCodes.includes(err.code) && typeof fb.signInWithRedirect === 'function') {
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              try {
                window.localStorage.setItem('deutsch_sync_redirect_pending', '1');
              } catch (e) {}
            }
            await fb.signInWithRedirect(auth, this.googleProvider);
            return null; // Redirect initiated
          } catch (redirectErr) {
            if (typeof window !== 'undefined' && window.localStorage) {
              try {
                window.localStorage.removeItem('deutsch_sync_redirect_pending');
              } catch (e) {}
            }
            throw new Error('تعذر تحويل تسجيل الدخول (Redirect): ' + (redirectErr.message || redirectErr.code));
          }
        }
        // Handle common auth errors with Arabic explanations
        if (err.code === 'auth/popup-blocked') {
          throw new Error('تم حظر النافذة المنبثقة من قبل المتصفح. يُرجى السماح بالنوافذ المنبثقة للتسجيل.');
        } else if (err.code === 'auth/popup-closed-by-user') {
          throw new Error('تم إلغاء طلب تسجيل الدخول.');
        } else if (err.code === 'auth/cancelled-popup-request') {
          throw new Error('تم إلغاء طلب تسجيل الدخول.');
        } else if (err.code === 'auth/network-request-failed') {
          throw new Error('تعذر الاتصال بخوادم المصادقة. تحقق من اتصالك بالإنترنت.');
        } else if (err.code === 'auth/operation-not-supported-in-this-environment') {
          throw new Error('طريقة تسجيل الدخول غير مدعومة في هذه البيئة.');
        }
        throw err;
      }
    }

    async checkRedirectResult() {
      if (!this.isConfigured()) return null;
      const fb = typeof global !== 'undefined' ? global.FirebaseSync : null;
      if (!fb || typeof fb.getRedirectResult !== 'function') return null;
      try {
        const { auth } = this._ensureInitialized();
        const result = await fb.getRedirectResult(auth);
        if (typeof window !== 'undefined' && window.localStorage) {
          try {
            window.localStorage.removeItem('deutsch_sync_redirect_pending');
          } catch (e) {}
        }
        if (result && result.user) {
          const user = result.user;
          return {
            uid: user.uid,
            email: user.email || null,
            displayName: user.displayName || null,
            photoURL: user.photoURL || null
          };
        }
        return null;
      } catch (err) {
        if (typeof window !== 'undefined' && window.localStorage) {
          try {
            window.localStorage.removeItem('deutsch_sync_redirect_pending');
          } catch (e) {}
        }
        if (err.code === 'auth/network-request-failed') {
          throw new Error('تعذر الاتصال بخوادم المصادقة بعد إعادة التوجيه. تحقق من اتصالك بالإنترنت.');
        }
        throw new Error('فشل تسجيل الدخول عبر إعادة التوجيه: ' + (err.message || err.code));
      }
    }

    async signOut() {
      if (!this.isConfigured() || !this.auth) return;
      const { fb, auth } = this._ensureInitialized();
      await fb.signOut(auth);
    }

    onAuthChange(callback) {
      this._authCallback = callback;
      if (!this.isConfigured()) {
        callback(null, { synthetic: true });
        return () => { this._authCallback = null; };
      }
      const fb = typeof global !== 'undefined' ? global.FirebaseSync : null;
      if (!fb) {
        callback(null, { synthetic: true });
        return () => { this._authCallback = null; };
      }
      try {
        const { auth } = this._ensureInitialized();
        if (this._authUnsubscribe) {
          this._authUnsubscribe();
        }
        this._authUnsubscribe = fb.onAuthStateChanged(auth, user => {
          if (user) {
            callback({
              uid: user.uid,
              email: user.email || null,
              displayName: user.displayName || null,
              photoURL: user.photoURL || null
            }, { synthetic: false });
          } else {
            callback(null, { synthetic: false });
          }
        });
        return () => {
          if (this._authUnsubscribe) {
            this._authUnsubscribe();
            this._authUnsubscribe = null;
          }
          this._authCallback = null;
        };
      } catch (e) {
        callback(null, { synthetic: true });
        return () => { this._authCallback = null; };
      }
    }

    attachAuthListener() {
      if (this._authUnsubscribe) {
        // Idempotent: already attached, return existing unsubscribe and do nothing
        return this._authUnsubscribe;
      }
      if (this._authCallback) {
        return this.onAuthChange(this._authCallback);
      }
      return () => {};
    }

    async load(uid) {
      if (!this.isConfigured()) return null;
      await this.loadBundle();
      const { fb, db } = this._ensureInitialized();
      const docRef = fb.doc(db, 'users', uid);
      const snap = await fb.getDoc(docRef);
      if (!snap.exists()) {
        return null;
      }
      return snap.data();
    }

    async save(uid, payload) {
      if (!this.isConfigured()) return;
      await this.loadBundle();
      const { fb, db } = this._ensureInitialized();
      const docRef = fb.doc(db, 'users', uid);
      await fb.setDoc(docRef, payload);
    }

    async deleteData(uid) {
      if (!this.isConfigured()) return;
      await this.loadBundle();
      const { fb, db } = this._ensureInitialized();
      const docRef = fb.doc(db, 'users', uid);
      await fb.deleteDoc(docRef);
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FirebaseSyncAdapter;
  }
  if (typeof window !== 'undefined') {
    window.FirebaseSyncAdapter = FirebaseSyncAdapter;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

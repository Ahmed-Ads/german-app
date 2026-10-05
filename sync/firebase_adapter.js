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
    }

    isConfigured() {
      if (typeof global !== 'undefined' && typeof global.isFirebaseConfigured === 'function') {
        return global.isFirebaseConfigured(this.config);
      }
      if (!this.config || typeof this.config !== 'object') return false;
      const key = this.config.apiKey || '';
      return key.length > 0 && !key.includes('PLACEHOLDER');
    }

    _ensureInitialized() {
      if (!this.isConfigured()) {
        throw new Error('Firebase is not configured (placeholders detected).');
      }
      const fb = typeof global !== 'undefined' ? global.FirebaseSync : null;
      if (!fb) {
        throw new Error('FirebaseSync bundle is not loaded.');
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
        // Handle common auth errors with Arabic explanations
        if (err.code === 'auth/popup-blocked') {
          throw new Error('تم حظر النافذة المنبثقة من قبل المتصفح. يُرجى السماح بالنوافذ المنبثقة للتسجيل.');
        } else if (err.code === 'auth/popup-closed-by-user') {
          throw new Error('تم إغلاق نافذة تسجيل الدخول قبل اكتمال العملية.');
        } else if (err.code === 'auth/cancelled-popup-request') {
          throw new Error('تم إلغاء طلب تسجيل الدخول.');
        } else if (err.code === 'auth/network-request-failed') {
          throw new Error('تعذر الاتصال بخوادم المصادقة. تحقق من اتصالك بالإنترنت.');
        }
        throw err;
      }
    }

    async signOut() {
      if (!this.isConfigured() || !this.auth) return;
      const { fb, auth } = this._ensureInitialized();
      await fb.signOut(auth);
    }

    onAuthChange(callback) {
      if (!this.isConfigured()) {
        callback(null);
        return () => {};
      }
      try {
        const { fb, auth } = this._ensureInitialized();
        return fb.onAuthStateChanged(auth, user => {
          if (user) {
            callback({
              uid: user.uid,
              email: user.email || null,
              displayName: user.displayName || null,
              photoURL: user.photoURL || null
            });
          } else {
            callback(null);
          }
        });
      } catch (e) {
        callback(null);
        return () => {};
      }
    }

    async load(uid) {
      if (!this.isConfigured()) return null;
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
      const { fb, db } = this._ensureInitialized();
      const docRef = fb.doc(db, 'users', uid);
      await fb.setDoc(docRef, payload);
    }

    async deleteData(uid) {
      if (!this.isConfigured()) return;
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

/**
 * firebase-config.js
 * Client-side Firebase configuration.
 *
 * NOTE: These configuration values are public by design in client-side web apps.
 * Real security is enforced strictly by Firestore Security Rules (firestore.rules),
 * not by hiding these keys.
 *
 * When PLACEHOLDER values are present, the sync engine remains completely inert:
 * - No Firebase network calls are initiated.
 * - No console errors or warnings are emitted.
 * - UI displays "المزامنة السحابية غير مفعّلة (الإعداد غير مكتمل)".
 */

(function(global) {
  'use strict';

  const FIREBASE_CONFIG = {
    apiKey: "PLACEHOLDER_API_KEY",
    authDomain: "PLACEHOLDER_PROJECT_ID.firebaseapp.com",
    projectId: "PLACEHOLDER_PROJECT_ID",
    storageBucket: "PLACEHOLDER_PROJECT_ID.appspot.com",
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:0000000000000000000000"
  };

  function isFirebaseConfigured(config) {
    const cfg = config || (typeof global !== 'undefined' && global.FIREBASE_CONFIG ? global.FIREBASE_CONFIG : FIREBASE_CONFIG);
    if (!cfg || typeof cfg !== 'object') return false;
    const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
    return required.every(key => {
      const val = cfg[key];
      return typeof val === 'string' && val.trim().length > 0 && !val.includes('PLACEHOLDER');
    });
  }

  const exportObj = {
    FIREBASE_CONFIG,
    isFirebaseConfigured
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportObj;
  }
  if (typeof window !== 'undefined') {
    window.FIREBASE_CONFIG = FIREBASE_CONFIG;
    window.isFirebaseConfigured = isFirebaseConfigured;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

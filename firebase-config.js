/**
 * firebase-config.js
 * Client-side Firebase configuration.
 *
 * Configured for the owner's project (german-app-ads).
 * Public by design in client-side web apps; real security is enforced strictly
 * by Firestore Security Rules (firestore.rules) and an API key restriction applied manually in Google Cloud Console.
 * No private keys, service-account credentials, or secrets belong in this file.
 */

(function(global) {
  'use strict';

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyApuBJN4hT0_iLg37H5Y0yW5mPL2ZrflS0",
    authDomain: "german-app-ads.firebaseapp.com",
    projectId: "german-app-ads",
    storageBucket: "german-app-ads.firebasestorage.app",
    messagingSenderId: "79286358420",
    appId: "1:79286358420:web:846d1f8e613ef5c597ff81"
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

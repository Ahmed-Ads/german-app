/**
 * sync/firebase_entry.js
 * Minimal modular Firebase entry point for cross-device sync.
 * Only imports Auth (Google Provider) and Firestore.
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';

const FirebaseSync = {
  initializeApp,
  getApps,
  getApp,
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp
};

if (typeof window !== 'undefined') {
  window.FirebaseSync = FirebaseSync;
}

export default FirebaseSync;

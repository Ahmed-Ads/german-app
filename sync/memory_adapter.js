/**
 * sync/memory_adapter.js
 * In-memory & Test Mock Adapter for Cross-Device Sync.
 * Simulates network latency, offline states, and multi-client cloud sharing.
 */

(function(global) {
  'use strict';

  class MemorySyncAdapter {
    constructor(options = {}) {
      this.store = options.store || new Map();
      this.currentUser = options.initialUser || null;
      this.listeners = new Set();
      this.isOffline = options.isOffline || false;
      this.shouldFail = options.shouldFail || false;
      this.latencyMs = options.latencyMs || 0;
      this.configured = options.configured !== undefined ? options.configured : true;
    }

    isConfigured() {
      return this.configured;
    }

    async _simulateNetwork() {
      if (this.latencyMs > 0) {
        await new Promise(r => setTimeout(r, this.latencyMs));
      }
      if (this.isOffline) {
        throw new Error('فشل الاتصال: الجهاز غير متصل بالإنترنت (Offline).');
      }
      if (this.shouldFail) {
        throw new Error('خطأ محاكى في خادم السحابة.');
      }
    }

    async signIn(mockUser = { uid: 'test-user-123', email: 'user@example.com', displayName: 'Test Learner' }) {
      await this._simulateNetwork();
      this.currentUser = mockUser;
      this._notify();
      return { ...this.currentUser };
    }

    async signOut() {
      await this._simulateNetwork();
      this.currentUser = null;
      this._notify();
    }

    onAuthChange(callback) {
      this.listeners.add(callback);
      // Immediately call with current state
      setTimeout(() => callback(this.currentUser ? { ...this.currentUser } : null), 0);
      return () => this.listeners.delete(callback);
    }

    _notify() {
      for (const cb of this.listeners) {
        try {
          cb(this.currentUser ? { ...this.currentUser } : null);
        } catch (e) {}
      }
    }

    async load(uid) {
      await this._simulateNetwork();
      if (!this.store.has(uid)) return null;
      // Deep clone to simulate wire serialization
      return JSON.parse(JSON.stringify(this.store.get(uid)));
    }

    async save(uid, payload) {
      await this._simulateNetwork();
      this.store.set(uid, JSON.parse(JSON.stringify(payload)));
    }

    async deleteData(uid) {
      await this._simulateNetwork();
      this.store.delete(uid);
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MemorySyncAdapter;
  }
  if (typeof window !== 'undefined') {
    window.MemorySyncAdapter = MemorySyncAdapter;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

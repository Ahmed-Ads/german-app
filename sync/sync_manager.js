/**
 * sync/sync_manager.js
 * Central Cross-Device Synchronization Manager.
 * Coordinates between UI, local appStorage, SyncMergePolicy, and SyncAdapter.
 */

(function(global) {
  'use strict';

  const STATES = {
    UNCONFIGURED: 'UNCONFIGURED',
    SIGNED_OUT: 'SIGNED_OUT',
    SYNCING: 'SYNCING',
    SYNCED: 'SYNCED',
    OFFLINE: 'OFFLINE',
    ERROR: 'ERROR'
  };

  class SyncManager {
    constructor(options = {}) {
      this.adapter = options.adapter || null;
      this.policy = options.policy || (typeof global !== 'undefined' ? global.SyncMergePolicy : null);
      this.state = STATES.UNCONFIGURED;
      this.user = null;
      this.lastSyncTime = null;
      this.lastError = null;
      this.pendingChanges = false;
      this.debounceTimer = null;
      this.debounceMs = options.debounceMs || 30000;
      this.localStateProvider = options.localStateProvider || null;
      this._listeners = new Set();
      this._initialized = false;

      // Bind handlers
      this._onVisibilityChange = this._onVisibilityChange.bind(this);
      this._onPageHide = this._onPageHide.bind(this);
      this._onOnline = this._onOnline.bind(this);
      this._onOffline = this._onOffline.bind(this);
    }

    setLocalStateProvider(provider) {
      this.localStateProvider = provider;
    }

    setAdapter(adapter) {
      this.adapter = adapter;
      this.updateState();
    }

    init() {
      if (this._initialized) return;
      this._initialized = true;

      if (!this.policy && typeof global !== 'undefined') {
        this.policy = global.SyncMergePolicy;
      }

      if (!this.adapter && typeof global !== 'undefined') {
        if (typeof global.FirebaseSyncAdapter === 'function') {
          this.adapter = new global.FirebaseSyncAdapter();
        }
      }

      if (typeof window !== 'undefined') {
        document.addEventListener('visibilitychange', this._onVisibilityChange);
        window.addEventListener('pagehide', this._onPageHide);
        window.addEventListener('online', this._onOnline);
        window.addEventListener('offline', this._onOffline);
      }

      if (!this.adapter || !this.adapter.isConfigured()) {
        this.state = STATES.UNCONFIGURED;
        this._notify();
        return;
      }

      this.state = this.user ? STATES.SYNCED : STATES.SIGNED_OUT;

      this.adapter.onAuthChange(user => {
        this._handleAuthChanged(user);
      });
    }

    destroy() {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      if (typeof window !== 'undefined') {
        document.removeEventListener('visibilitychange', this._onVisibilityChange);
        window.removeEventListener('pagehide', this._onPageHide);
        window.removeEventListener('online', this._onOnline);
        window.removeEventListener('offline', this._onOffline);
      }
      this._listeners.clear();
      this._initialized = false;
    }

    subscribe(callback) {
      this._listeners.add(callback);
      return () => this._listeners.delete(callback);
    }

    _notify() {
      const status = this.getStatus();
      for (const cb of this._listeners) {
        try {
          cb(status);
        } catch (e) {}
      }
    }

    getStatus() {
      return {
        state: this.state,
        user: this.user ? { ...this.user } : null,
        lastSyncTime: this.lastSyncTime,
        lastError: this.lastError,
        pendingChanges: this.pendingChanges,
        isConfigured: Boolean(this.adapter && this.adapter.isConfigured())
      };
    }

    updateState() {
      if (!this.adapter || !this.adapter.isConfigured()) {
        this.state = STATES.UNCONFIGURED;
      } else if (!this.user) {
        this.state = STATES.SIGNED_OUT;
      }
      this._notify();
    }

    async _handleAuthChanged(user) {
      if (user) {
        const wasSignedOut = !this.user;
        this.user = user;
        this.state = STATES.SYNCING;
        this.lastError = null;
        this._notify();

        if (wasSignedOut) {
          await this.syncOnSignIn();
        }
      } else {
        this.user = null;
        this.state = (this.adapter && this.adapter.isConfigured()) ? STATES.SIGNED_OUT : STATES.UNCONFIGURED;
        this.lastError = null;
        this.pendingChanges = false;
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = null;
        }
        this._notify();
      }
    }

    async signIn() {
      if (!this.adapter || !this.adapter.isConfigured()) {
        throw new Error('المزامنة السحابية غير مهيأة بعد.');
      }
      this.state = STATES.SYNCING;
      this.lastError = null;
      this._notify();
      try {
        const user = await this.adapter.signIn();
        this.user = user;
        await this.syncOnSignIn();
        return user;
      } catch (err) {
        this.state = STATES.ERROR;
        this.lastError = err.message || 'فشل تسجيل الدخول';
        this._notify();
        throw err;
      }
    }

    async signOut() {
      if (!this.adapter) return;
      if (this.pendingChanges && this.user) {
        try {
          await this.flushSave();
        } catch (e) {}
      }
      await this.adapter.signOut();
      this.user = null;
      this.state = STATES.SIGNED_OUT;
      this.pendingChanges = false;
      this._notify();
    }

    /**
     * First sign-in and sync workflow.
     */
    async syncOnSignIn() {
      if (!this.user || !this.adapter) return;

      this.state = STATES.SYNCING;
      this.lastError = null;
      this._notify();

      try {
        const cloudData = await this.adapter.load(this.user.uid);
        const localData = this._getLocalData();

        if (!cloudData) {
          // Case A: Cloud is empty, upload local data
          const payload = this.policy ? this.policy.createCloudPayload(localData) : localData;
          await this.adapter.save(this.user.uid, payload);
          this.state = STATES.SYNCED;
          this.lastSyncTime = new Date().toISOString();
          this.pendingChanges = false;
          this._notify();
          if (typeof global.showToast === 'function') {
            global.showToast('تم ربط الحساب ورفع تقدمك الحالي إلى السحابة بنجاح ☁️');
          }
          return;
        }

        // Case B: Cloud has data. Validate it first.
        const categories = global.CATEGORIES || [];
        if (this.policy && typeof this.policy.validateCloudDocument === 'function') {
          const validation = this.policy.validateCloudDocument(cloudData, categories);
          if (!validation.valid) {
            throw new Error(`بيانات السحابة غير صالحة: ${validation.error}`);
          }
        }

        // Offer backup download if local has data
        const localHasData = this._hasLocalData(localData);
        if (localHasData && typeof global.exportBackup === 'function') {
          try {
            // Suggest backup export
            if (typeof global.showToast === 'function') {
              global.showToast('جاري دمج التقدم مع السحابة... 🔄');
            }
          } catch (e) {}
        }

        // Perform deterministic merge
        const merged = this.policy 
          ? this.policy.mergeFullUserData(localData, cloudData, categories)
          : localData;

        // Apply merged state locally
        this._applyLocalData(merged);

        // Save merged state back to cloud
        await this.adapter.save(this.user.uid, merged);

        this.state = STATES.SYNCED;
        this.lastSyncTime = new Date().toISOString();
        this.pendingChanges = false;
        this._notify();

        if (typeof global.showToast === 'function') {
          global.showToast('🎉 تمت مزامنة تقدمك بنجاح وحفظ أعلى إتقان من الجهازين!');
        }

        if (typeof global.render === 'function') {
          global.render();
        }
      } catch (err) {
        this.state = (typeof navigator !== 'undefined' && navigator.onLine === false) ? STATES.OFFLINE : STATES.ERROR;
        this.lastError = err.message || 'حدث خطأ أثناء المزامنة السحابية';
        this._notify();
      }
    }

    /**
     * Mark that local progress has changed and schedule a debounced save.
     */
    notifyChange() {
      if (!this.user || !this.adapter || !this.adapter.isConfigured()) return;
      this.pendingChanges = true;

      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = setTimeout(() => {
        this.flushSave().catch(() => {});
      }, this.debounceMs);
    }

    /**
     * Flushes pending saves to the cloud immediately.
     */
    async flushSave() {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }

      if (!this.user || !this.adapter || !this.adapter.isConfigured()) return;
      if (!this.pendingChanges) return;

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        this.state = STATES.OFFLINE;
        this._notify();
        return;
      }

      this.state = STATES.SYNCING;
      this.lastError = null;
      this._notify();

      try {
        const localData = this._getLocalData();
        const payload = this.policy ? this.policy.createCloudPayload(localData) : localData;
        await this.adapter.save(this.user.uid, payload);
        this.state = STATES.SYNCED;
        this.lastSyncTime = new Date().toISOString();
        this.pendingChanges = false;
        this._notify();
      } catch (err) {
        this.state = (typeof navigator !== 'undefined' && navigator.onLine === false) ? STATES.OFFLINE : STATES.ERROR;
        this.lastError = err.message || 'تعذر حفظ التقدم سحابياً';
        this._notify();
      }
    }

    /**
     * Deletes user cloud data from the remote document.
     */
    async deleteCloudData() {
      if (!this.user || !this.adapter) {
        throw new Error('لا يوجد حساب مسجل حالياً.');
      }
      this.state = STATES.SYNCING;
      this._notify();
      try {
        await this.adapter.deleteData(this.user.uid);
        this.state = STATES.SYNCED;
        this.lastSyncTime = new Date().toISOString();
        this.pendingChanges = true; // Local changes now need re-upload if sync continues
        this._notify();
        if (typeof global.showToast === 'function') {
          global.showToast('تم حذف بياناتك من السحابة بنجاح. بياناتك المحلية ما زالت محفوظة على هذا الجهاز 🗑️');
        }
      } catch (err) {
        this.state = STATES.ERROR;
        this.lastError = err.message || 'تعذر حذف البيانات من السحابة';
        this._notify();
        throw err;
      }
    }

    _onVisibilityChange() {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        this.flushSave().catch(() => {});
      }
    }

    _onPageHide() {
      this.flushSave().catch(() => {});
    }

    _onOnline() {
      if (this.state === STATES.OFFLINE) {
        this.state = this.user ? STATES.SYNCED : STATES.SIGNED_OUT;
        this._notify();
      }
      if (this.pendingChanges && this.user) {
        this.flushSave().catch(() => {});
      }
    }

    _onOffline() {
      this.state = STATES.OFFLINE;
      this._notify();
    }

    _getLocalData() {
      if (this.localStateProvider && typeof this.localStateProvider.getLocalData === 'function') {
        return this.localStateProvider.getLocalData();
      }
      const prog = (typeof global.progress !== 'undefined') ? global.progress : {};
      const st = (typeof global.stats !== 'undefined') ? global.stats : {};
      const star = (typeof global.starred !== 'undefined') ? global.starred : [];
      const sr = (typeof global.srs !== 'undefined') ? global.srs : {};
      const dg = (typeof global.getDailyGoal === 'function') ? global.getDailyGoal() : 20;

      return {
        progress: prog,
        stats: st,
        starred: star,
        srs: sr,
        dailyGoal: { target: dg, updatedAt: new Date().toISOString() }
      };
    }

    _hasLocalData(localData) {
      if (!localData) return false;
      const hasProg = localData.progress && Object.keys(localData.progress).length > 0;
      const hasStats = localData.stats && (localData.stats.totalAnswered > 0 || localData.stats.current > 0);
      const hasStarred = Array.isArray(localData.starred) && localData.starred.length > 0;
      const hasSrs = localData.srs && Object.keys(localData.srs).length > 0;
      return Boolean(hasProg || hasStats || hasStarred || hasSrs);
    }

    _applyLocalData(merged) {
      if (!merged || typeof merged !== 'object') return;

      if (this.localStateProvider && typeof this.localStateProvider.applyLocalData === 'function') {
        this.localStateProvider.applyLocalData(merged);
        return;
      }

      if (merged.progress && typeof global.progress !== 'undefined') {
        global.progress = merged.progress;
        if (global.appStorage && global.STORAGE_KEYS) {
          global.appStorage.set(global.STORAGE_KEYS.PROGRESS, merged.progress);
        }
      }

      if (merged.stats && typeof global.stats !== 'undefined') {
        global.stats = merged.stats;
        if (global.appStorage && global.STORAGE_KEYS) {
          global.appStorage.set(global.STORAGE_KEYS.STATS, merged.stats);
        }
      }

      if (merged.starred && typeof global.starred !== 'undefined') {
        global.starred = merged.starred;
        if (global.appStorage && global.STORAGE_KEYS) {
          global.appStorage.set(global.STORAGE_KEYS.STARRED, merged.starred);
        }
      }

      if (merged.srs && typeof global.srs !== 'undefined') {
        global.srs = merged.srs;
        if (global.appStorage && global.STORAGE_KEYS) {
          global.appStorage.set(global.STORAGE_KEYS.SRS, merged.srs);
        }
      }

      if (merged.dailyGoal) {
        const target = typeof merged.dailyGoal === 'object' ? merged.dailyGoal.target : merged.dailyGoal;
        if (Number.isInteger(target) && target >= 5 && target <= 200) {
          if (global.appStorage && global.STORAGE_KEYS) {
            global.appStorage.set(global.STORAGE_KEYS.DAILY_GOAL, String(target));
          }
          if (typeof window !== 'undefined' && window.localStorage) {
            try { window.localStorage.setItem('deutsch_daily_goal_v1', String(target)); } catch (e) {}
          }
        }
      }
    }
  }

  const syncManager = new SyncManager();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SyncManager, syncManager, STATES };
  }
  if (typeof window !== 'undefined') {
    window.SyncManager = SyncManager;
    window.syncManager = syncManager;
    window.SYNC_STATES = STATES;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

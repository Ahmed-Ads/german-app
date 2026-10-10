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
    ERROR: 'ERROR',
    IDLE: 'IDLE'
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
      this._firstMergePending = false;
      this._flushPromise = null;
      this._changeSeq = 0;
      this._failedFlushes = 0;
      this._lastFlushErrorType = null;
      this.retryDelays = options.retryDelays || [30000, 120000, 600000];
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
        if (typeof document !== 'undefined') {
          document.addEventListener('visibilitychange', this._onVisibilityChange);
        }
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

      if (typeof this.adapter.checkRedirectResult === 'function') {
        this.adapter.checkRedirectResult().then(user => {
          if (user) {
            this._handleAuthChanged(user);
          }
        }).catch(err => {
          this.state = STATES.ERROR;
          this.lastError = err.message || 'فشل استرجاع نتيجة تسجيل الدخول';
          this._notify();
        });
      }
    }

    destroy() {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      if (typeof window !== 'undefined') {
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', this._onVisibilityChange);
        }
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
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          if (user) {
            window.localStorage.setItem('deutsch_sync_enabled', '1');
          } else {
            window.localStorage.removeItem('deutsch_sync_enabled');
          }
        } catch (e) {}
      }

      if (user) {
        // If the same uid is already signed in and already synced, no-op (prevents re-render storm)
        if (this.user && this.user.uid === user.uid && this.state === STATES.SYNCED) {
          return;
        }

        const wasSignedOut = !this.user || this.user.uid !== user.uid;
        this.user = user;
        this.state = STATES.SYNCING;
        this.lastError = null;
        this._notify();

        if (wasSignedOut) {
          await this.syncOnSignIn();
        } else {
          // Token refresh or auth confirmation for same UID: return to SYNCED
          this.state = STATES.SYNCED;
          this._notify();
        }
      } else {
        if (!this.user && this.state === STATES.SIGNED_OUT) {
          return; // Duplicate signed out event; no-op
        }
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
        if (user) {
          this.user = user;
          await this.syncOnSignIn();
          return user;
        }
        // Redirect initiated; user is null
        return null;
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
     * Bounded retry helper for saving payloads to the adapter.
     */
    async _saveWithRetry(uid, payload, maxAttempts = 3) {
      let lastError = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await this.adapter.save(uid, payload);
          return;
        } catch (err) {
          lastError = err;
          if (attempt < maxAttempts) {
            await new Promise(r => setTimeout(r, attempt * 50));
          }
        }
      }
      throw lastError;
    }

    /**
     * First sign-in and sync workflow.
     */
    async syncOnSignIn() {
      if (!this.user || !this.adapter) return;
      const seqAtStart = this._changeSeq;

      this.state = STATES.SYNCING;
      this.lastError = null;
      this._notify();

      try {
        const cloudData = await this.adapter.load(this.user.uid);
        const localData = this._getLocalData();

        if (!cloudData) {
          // Case A: Cloud is empty, upload local data
          const payload = this.policy ? this.policy.createCloudPayload(localData) : localData;
          await this._saveWithRetry(this.user.uid, payload);
          if (typeof window !== 'undefined' && window.localStorage) {
            try {
              window.localStorage.setItem('deutsch_sync_first_merge_done_v1', this.user.uid);
            } catch (e) {}
          }
          this.state = STATES.SYNCED;
          this.lastSyncTime = new Date().toISOString();
          if (this._changeSeq === seqAtStart) {
            this.pendingChanges = false;
          } else {
            this.pendingChanges = true;
            if (this.debounceTimer) clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
              this.flushSave().catch(() => {});
            }, this.debounceMs);
          }
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

        // Check if first-merge was already performed on this device for this user
        let isFirstMergeDone = false;
        if (typeof window !== 'undefined' && window.localStorage) {
          try {
            isFirstMergeDone = (window.localStorage.getItem('deutsch_sync_first_merge_done_v1') === this.user.uid);
          } catch (e) {
            isFirstMergeDone = false;
          }
        }

        // Trigger real backup before genuine first merge if local has data AND marker not set
        const localHasData = this._hasLocalData(localData);
        if (localHasData && cloudData && !isFirstMergeDone) {
          this._firstMergePending = true;
          let backupSuccess = false;
          if (typeof global.exportBackup === 'function') {
            try {
              const res = global.exportBackup('sync');
              if (res) backupSuccess = true;
            } catch (e) {
              backupSuccess = false;
            }
          }

          if (!backupSuccess) {
            const warningMsg =
              'تعذر تنزيل نسخة احتياطية وقائية لبياناتك المحلية تلقائياً (قد تكون التنزيلات التلقائية محظورة في متصفحك).\n\n' +
              'هل ترغب في متابعة المزامنة والدمج على أي حال دون حفظ نسخة وقائية؟';
            const proceed = (typeof global.confirm === 'function') ? global.confirm(warningMsg) : false;
            if (!proceed) {
              // User canceled: abort cleanly, no merge, no data written to local or cloud, sign out cleanly
              this._firstMergePending = false;
              if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
                this.debounceTimer = null;
              }
              this.pendingChanges = false;
              this.user = null;
              this.state = STATES.SIGNED_OUT;
              try {
                if (typeof this.adapter.signOut === 'function') {
                  await this.adapter.signOut();
                }
              } catch (e) {}
              if (typeof window !== 'undefined' && window.localStorage) {
                try {
                  window.localStorage.removeItem('deutsch_sync_enabled');
                } catch (e) {}
              }
              this._notify();
              return;
            }
          } else {
            if (typeof global.showToast === 'function') {
              global.showToast('تم طلب تنزيل نسخة احتياطية وقائية. تأكد من وجود الملف في مجلد التنزيلات 📥');
            }
          }
          this._firstMergePending = false;
        }

        // Perform deterministic merge
        const merged = this.policy 
          ? this.policy.mergeFullUserData(localData, cloudData, categories)
          : localData;

        // Apply merged state locally
        this._applyLocalData(merged);

        // Mark first merge as done on this device for this account (even if save fails next)
        if (typeof window !== 'undefined' && window.localStorage) {
          try {
            window.localStorage.setItem('deutsch_sync_first_merge_done_v1', this.user.uid);
          } catch (e) {}
        }

        // Save merged state back to cloud with bounded retry (M8)
        try {
          await this._saveWithRetry(this.user.uid, merged);
          this.state = STATES.SYNCED;
          this.lastSyncTime = new Date().toISOString();
          if (this._changeSeq === seqAtStart) {
            this.pendingChanges = false;
          } else {
            this.pendingChanges = true;
            if (this.debounceTimer) clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
              this.flushSave().catch(() => {});
            }, this.debounceMs);
          }
          this._notify();

          if (typeof global.showToast === 'function') {
            global.showToast('🎉 تمت مزامنة تقدمك بنجاح وحفظ أعلى إتقان من الجهازين!');
          }

          if (typeof global.render === 'function') {
            global.render();
          }
        } catch (saveErr) {
          this.pendingChanges = true;
          this.state = (typeof navigator !== 'undefined' && navigator.onLine === false) ? STATES.OFFLINE : STATES.ERROR;
          this.lastError = saveErr.message || 'تعذر حفظ البيانات المدمجة في السحابة';
          this._notify();
        }
      } catch (err) {
        this._firstMergePending = false;
        this.state = (typeof navigator !== 'undefined' && navigator.onLine === false) ? STATES.OFFLINE : STATES.ERROR;
        this.lastError = err.message || 'حدث خطأ أثناء المزامنة السحابية';
        this._notify();
      }
    }

    /**
     * Mark that local progress has changed and schedule a debounced save.
     */
    notifyChange() {
      if (this._firstMergePending || !this.user || !this.adapter || !this.adapter.isConfigured()) return;
      this._changeSeq++;
      this.pendingChanges = true;
      this._failedFlushes = 0;
      this._lastFlushErrorType = null;

      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = setTimeout(() => {
        this.flushSave().catch(() => {});
      }, this.debounceMs);
    }

    _classifyError(err) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return 'offline';
      }
      if (!err) return 'transient';
      if (err.isOffline) return 'offline';
      if (err.isValidationError || err.name === 'ValidationError') return 'non-transient';
      const code = String(err.code || '').toLowerCase();
      const msg = String(err.message || '').toLowerCase();
      if (
        code === 'permission-denied' ||
        code === 'unauthenticated' ||
        code === 'not-found' ||
        code === 'invalid-argument' ||
        code === 'failed-precondition' ||
        code === 'out-of-range' ||
        msg.includes('غير صالحة') ||
        msg.includes('permission') ||
        msg.includes('unauthenticated') ||
        msg.includes('validation')
      ) {
        return 'non-transient';
      }
      return 'transient';
    }

    _scheduleNextFlushIfNeeded(seqAtStart, errType) {
      if (!this.user || !this.adapter || !this.adapter.isConfigured() || this._firstMergePending) {
        return;
      }

      // If flush succeeded (no error)
      if (!errType) {
        if (this._changeSeq !== seqAtStart || this.pendingChanges) {
          if (this.debounceTimer) clearTimeout(this.debounceTimer);
          this.debounceTimer = setTimeout(() => {
            this.flushSave().catch(() => {});
          }, this.debounceMs);
        }
        return;
      }

      // Offline: do not schedule polling timers; rely on online event and visibility
      if (errType === 'offline') {
        return;
      }

      // Non-transient errors: do not auto-retry at all
      if (errType === 'non-transient') {
        return;
      }

      // Transient errors: bounded retry with increasing delay
      if (errType === 'transient') {
        this._failedFlushes++;
        const delays = this.retryDelays || [30000, 120000, 600000];
        if (this._failedFlushes <= delays.length) {
          const delay = delays[this._failedFlushes - 1];
          if (this.debounceTimer) clearTimeout(this.debounceTimer);
          this.debounceTimer = setTimeout(() => {
            this.flushSave().catch(() => {});
          }, delay);
        } else {
          // Bounded retries exhausted: stop automatic retrying
          if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
          }
        }
      }
    }

    /**
     * Flushes pending saves to the cloud immediately with Read-Merge-Write concurrency safety.
     * Serialized to coalesce overlapping calls.
     */
    flushSave() {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }

      if (this._firstMergePending || !this.user || !this.adapter || !this.adapter.isConfigured()) return Promise.resolve();
      if (!this.pendingChanges) return Promise.resolve();

      if (this._flushPromise) {
        return this._flushPromise;
      }

      const seqAtStart = this._changeSeq;

      this._flushPromise = (async () => {
        let errType = null;
        try {
          await this._doFlushSave(seqAtStart);
          this._failedFlushes = 0;
          this._lastFlushErrorType = null;
        } catch (err) {
          errType = this._classifyError(err);
          this._lastFlushErrorType = errType;
          this.pendingChanges = true;
          if (errType === 'offline') {
            this.state = STATES.OFFLINE;
            this.lastError = 'الجهاز غير متصل بالإنترنت حالياً';
          } else {
            this.state = STATES.ERROR;
            this.lastError = (err && err.message) || 'تعذر حفظ التقدم سحابياً';
          }
          this._notify();
        } finally {
          this._flushPromise = null;
          this._scheduleNextFlushIfNeeded(seqAtStart, errType);
        }
      })();

      return this._flushPromise;
    }

    async _doFlushSave(seqAtStart) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const offErr = new Error('الجهاز غير متصل بالإنترنت حالياً');
        offErr.isOffline = true;
        throw offErr;
      }

      this.state = STATES.SYNCING;
      this.lastError = null;
      this._notify();

      const localData = this._getLocalData();
      const categories = global.CATEGORIES || [];

      // 1. Read cloud document before writing
      const cloudData = await this.adapter.load(this.user.uid);

      let payloadToSave;
      if (!cloudData) {
        payloadToSave = this.policy ? this.policy.createCloudPayload(localData) : localData;
      } else {
        // 2. Validate cloud document
        if (this.policy && typeof this.policy.validateCloudDocument === 'function') {
          const validation = this.policy.validateCloudDocument(cloudData, categories);
          if (!validation.valid) {
            const valErr = new Error(`بيانات السحابة غير صالحة: ${validation.error}`);
            valErr.isValidationError = true;
            throw valErr;
          }
        }

        // 3. Merge cloud and local data
        const merged = this.policy
          ? this.policy.mergeFullUserData(localData, cloudData, categories)
          : localData;

        // 4. Apply merged state locally
        this._applyLocalData(merged);

        payloadToSave = merged;
      }

      // 5. Upload merged result
      await this.adapter.save(this.user.uid, payloadToSave);

      this.state = STATES.SYNCED;
      this.lastSyncTime = new Date().toISOString();
      this.lastError = null;

      // B2-2: Check if new changes occurred while save was in flight
      if (this._changeSeq === seqAtStart) {
        this.pendingChanges = false;
      } else {
        this.pendingChanges = true;
      }
      this._notify();
    }

    /**
     * Deletes user cloud data from the remote document.
     */
    async deleteCloudData(options = {}) {
      if (!this.user || !this.adapter) {
        throw new Error('لا يوجد حساب مسجل حالياً.');
      }
      this.state = STATES.SYNCING;
      this._notify();
      try {
        await this.adapter.deleteData(this.user.uid);
        this.state = STATES.SYNCED;
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = null;
        }
        this.lastSyncTime = new Date().toISOString();
        this.pendingChanges = false;
        this._notify();
        if (!options.silentToast && typeof global.showToast === 'function') {
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
      if (typeof document !== 'undefined') {
        if (document.visibilityState === 'hidden') {
          this.flushSave().catch(() => {});
        } else if (document.visibilityState === 'visible') {
          if (this.pendingChanges && this.user) {
            this._failedFlushes = 0;
            this._lastFlushErrorType = null;
            this.flushSave().catch(() => {});
          }
        }
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
        this._failedFlushes = 0;
        this._lastFlushErrorType = null;
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
      let dg = 20;
      let dgUpdated = '';
      if (typeof global.getDailyGoalRecord === 'function') {
        const rec = global.getDailyGoalRecord();
        if (rec) {
          dg = rec.target || 20;
          dgUpdated = rec.updatedAt || '';
        }
      } else if (typeof global.getDailyGoal === 'function') {
        dg = global.getDailyGoal();
      }

      return {
        progress: prog,
        stats: st,
        starred: star,
        srs: sr,
        dailyGoal: { target: dg, updatedAt: dgUpdated }
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

      if (merged.progress && typeof global.progress === 'object') {
        for (const k of Object.keys(global.progress)) {
          if (!(k in merged.progress)) delete global.progress[k];
        }
        Object.assign(global.progress, merged.progress);
        if (global.appStorage && global.STORAGE_KEYS) {
          global.appStorage.set(global.STORAGE_KEYS.PROGRESS, global.progress);
        }
      }

      if (merged.stats && typeof global.stats === 'object') {
        Object.assign(global.stats, merged.stats);
        if (global.appStorage && global.STORAGE_KEYS) {
          global.appStorage.set(global.STORAGE_KEYS.STATS, global.stats);
        }
      }

      if (merged.starred) {
        if (global.starredSet instanceof Set) {
          global.starredSet.clear();
          for (const item of merged.starred) global.starredSet.add(item);
        }
        if (Array.isArray(global.starred)) {
          global.starred.length = 0;
          global.starred.push(...merged.starred);
        }
        if (global.appStorage && global.STORAGE_KEYS) {
          global.appStorage.set(global.STORAGE_KEYS.STARRED, merged.starred);
        }
      }

      if (merged.srs && typeof global.srs === 'object') {
        for (const k of Object.keys(global.srs)) {
          if (!(k in merged.srs)) delete global.srs[k];
        }
        Object.assign(global.srs, merged.srs);
        if (global.appStorage && global.STORAGE_KEYS) {
          global.appStorage.set(global.STORAGE_KEYS.SRS, global.srs);
        }
      }

      if (merged.dailyGoal) {
        const target = typeof merged.dailyGoal === 'object' ? merged.dailyGoal.target : merged.dailyGoal;
        const updatedAt = typeof merged.dailyGoal === 'object' && typeof merged.dailyGoal.updatedAt === 'string' ? merged.dailyGoal.updatedAt : '';
        if (Number.isInteger(target) && target >= 5 && target <= 200) {
          if (global.appStorage && global.STORAGE_KEYS) {
            global.appStorage.set(global.STORAGE_KEYS.DAILY_GOAL, String(target));
            if (updatedAt) {
              global.appStorage.set('deutsch_daily_goal_updated_at_v1', updatedAt);
            }
          }
          if (typeof window !== 'undefined' && window.localStorage) {
            try {
              window.localStorage.setItem('deutsch_daily_goal_v1', String(target));
              if (updatedAt) {
                window.localStorage.setItem('deutsch_daily_goal_updated_at_v1', updatedAt);
              }
            } catch (e) {}
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

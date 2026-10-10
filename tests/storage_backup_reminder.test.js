/**
 * tests/storage_backup_reminder.test.js
 * Verification for Requirement I2:
 * - navigator.storage.persist() called once per session after user has progress.
 * - Robust error handling (persist rejected/missing/throws => no crash).
 * - Last backup export date in localStorage (kept across reset).
 * - 14-day backup reminder banner on Stats screen, dismissible for 7 days.
 * - Extracts real functions from index.html.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractFunction } from './extract_written.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.resolve(__dirname, '../index.html');
const html = fs.readFileSync(indexPath, 'utf8');

const requestStorageCode = extractFunction(html, 'requestPersistentStorageOnce');
const getLastBackupDateCode = extractFunction(html, 'getLastBackupDate');
const shouldShowBackupReminderCode = extractFunction(html, 'shouldShowBackupReminder');

describe('I2: Persistent Storage & Backup Reminder Logic', () => {
  let mockLocalStorage;
  let store;
  let mockNavigator;

  beforeEach(() => {
    store = {};
    mockLocalStorage = {
      getItem: vi.fn((key) => store[key] ?? null),
      setItem: vi.fn((key, val) => { store[key] = String(val); }),
      removeItem: vi.fn((key) => { delete store[key]; })
    };

    mockNavigator = {
      storage: {
        persist: vi.fn().mockResolvedValue(true)
      }
    };
  });

  function createEnv(initialStats = { totalAnswered: 0 }, initialProgress = {}) {
    const setup = `
      let stats = ${JSON.stringify(initialStats)};
      let progress = ${JSON.stringify(initialProgress)};
      let isStoragePersisted = false;
      let storagePersistAttempted = false;
      const BACKUP_DATE_KEY = 'deutsch_last_backup_v1';
      const BACKUP_REMINDER_DISMISSED_KEY = 'deutsch_backup_reminder_dismissed_v1';

      ${requestStorageCode}
      ${getLastBackupDateCode}
      ${shouldShowBackupReminderCode}

      return {
        getStats: () => stats,
        setStats: (s) => { stats = s; },
        getProgress: () => progress,
        setProgress: (p) => { progress = p; },
        isStoragePersisted: () => isStoragePersisted,
        storagePersistAttempted: () => storagePersistAttempted,
        requestPersistentStorageOnce,
        getLastBackupDate,
        shouldShowBackupReminder
      };
    `;

    return new Function(
      'navigator',
      'localStorage',
      setup
    )(mockNavigator, mockLocalStorage);
  }

  describe('requestPersistentStorageOnce()', () => {
    it('does not request persist if user has zero progress', () => {
      const env = createEnv({ totalAnswered: 0 }, {});
      env.requestPersistentStorageOnce();
      expect(mockNavigator.storage.persist).not.toHaveBeenCalled();
      expect(env.storagePersistAttempted()).toBe(false);
      expect(env.isStoragePersisted()).toBe(false);
    });

    it('requests persist when stats.totalAnswered > 0 and updates in-memory flag', async () => {
      const env = createEnv({ totalAnswered: 5 }, {});
      env.requestPersistentStorageOnce();
      expect(mockNavigator.storage.persist).toHaveBeenCalledTimes(1);
      expect(env.storagePersistAttempted()).toBe(true);

      // Wait for promise resolution
      await Promise.resolve();
      expect(env.isStoragePersisted()).toBe(true);
    });

    it('requests persist when progress dictionary has entries', async () => {
      const env = createEnv({ totalAnswered: 0 }, { obst: { mcq: { counts: [1] } } });
      env.requestPersistentStorageOnce();
      expect(mockNavigator.storage.persist).toHaveBeenCalledTimes(1);
      expect(env.storagePersistAttempted()).toBe(true);
    });

    it('calls persist at most ONCE per session', async () => {
      const env = createEnv({ totalAnswered: 10 }, {});
      env.requestPersistentStorageOnce();
      env.requestPersistentStorageOnce();
      env.requestPersistentStorageOnce();
      expect(mockNavigator.storage.persist).toHaveBeenCalledTimes(1);
    });

    it('handles navigator.storage.persist rejection gracefully without crashing', async () => {
      mockNavigator.storage.persist = vi.fn().mockRejectedValue(new Error('Quota / permission denied'));
      const env = createEnv({ totalAnswered: 10 }, {});
      expect(() => env.requestPersistentStorageOnce()).not.toThrow();
      await Promise.resolve();
      expect(env.isStoragePersisted()).toBe(false);
    });

    it('handles missing navigator.storage gracefully without crashing', () => {
      mockNavigator = {};
      const env = createEnv({ totalAnswered: 10 }, {});
      expect(() => env.requestPersistentStorageOnce()).not.toThrow();
      expect(env.isStoragePersisted()).toBe(false);
    });
  });

  describe('getLastBackupDate()', () => {
    it('returns null when no backup date is stored', () => {
      const env = createEnv();
      expect(env.getLastBackupDate()).toBeNull();
    });

    it('returns stored ISO date string from localStorage', () => {
      const testDate = '2026-10-01T12:00:00.000Z';
      store['deutsch_last_backup_v1'] = testDate;
      const env = createEnv();
      expect(env.getLastBackupDate()).toBe(testDate);
    });

    it('handles localStorage throwing (e.g. security error) gracefully', () => {
      mockLocalStorage.getItem = vi.fn(() => { throw new Error('Access denied'); });
      const env = createEnv();
      expect(env.getLastBackupDate()).toBeNull();
    });
  });

  describe('shouldShowBackupReminder()', () => {
    it('returns false when totalAnswered is 0 (new learner)', () => {
      const env = createEnv({ totalAnswered: 0 });
      expect(env.shouldShowBackupReminder()).toBe(false);
    });

    it('returns true when user has progress but has NEVER exported', () => {
      const env = createEnv({ totalAnswered: 25 });
      expect(env.shouldShowBackupReminder()).toBe(true);
    });

    it('returns false when last export was recent (< 14 days ago)', () => {
      const env = createEnv({ totalAnswered: 25 });
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      store['deutsch_last_backup_v1'] = fiveDaysAgo;
      expect(env.shouldShowBackupReminder()).toBe(false);
    });

    it('returns true when last export is older than 14 days', () => {
      const env = createEnv({ totalAnswered: 25 });
      const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      store['deutsch_last_backup_v1'] = fifteenDaysAgo;
      expect(env.shouldShowBackupReminder()).toBe(true);
    });

    it('returns false when reminder was dismissed within the last 7 days', () => {
      const env = createEnv({ totalAnswered: 25 });
      const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      store['deutsch_last_backup_v1'] = fifteenDaysAgo;

      // Dismissed 2 days ago
      const twoDaysAgoMs = Date.now() - 2 * 24 * 60 * 60 * 1000;
      store['deutsch_backup_reminder_dismissed_v1'] = String(twoDaysAgoMs);

      expect(env.shouldShowBackupReminder()).toBe(false);
    });

    it('returns true again after 7-day dismissal window expires', () => {
      const env = createEnv({ totalAnswered: 25 });
      const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      store['deutsch_last_backup_v1'] = fifteenDaysAgo;

      // Dismissed 8 days ago (> 7 days)
      const eightDaysAgoMs = Date.now() - 8 * 24 * 60 * 60 * 1000;
      store['deutsch_backup_reminder_dismissed_v1'] = String(eightDaysAgoMs);

      expect(env.shouldShowBackupReminder()).toBe(true);
    });
  });
});

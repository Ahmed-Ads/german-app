/**
 * tests/export_backup_names.test.js
 * Verifies Defect 4: exportBackup filename generation for all three modes:
 * 1. 'sync' -> deutsch_lernen_backup_pre_sync_<date>.json
 * 2. true / 'restore' -> deutsch_lernen_backup_pre_restore_<date>.json
 * 3. default / false -> deutsch_lernen_backup_<date>.json
 * Extracts the REAL function from index.html (no duplicated logic).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractFunction } from './extract_written.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.resolve(__dirname, '../index.html');
const html = fs.readFileSync(indexPath, 'utf8');

const exportBackupCode = extractFunction(html, 'exportBackup');
const exportBackupFn = new Function(`
  ${exportBackupCode}
  return exportBackup;
`)();

describe('DEFECT 4: exportBackup filename verification', () => {
  let createdAnchor;
  let clickedDownload;

  beforeEach(() => {
    createdAnchor = null;
    clickedDownload = '';

    globalThis.Blob = class {
      constructor(parts, opts) {
        this.parts = parts;
        this.opts = opts;
      }
    };

    globalThis.URL = {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn()
    };

    globalThis.document = {
      createElement: vi.fn((tag) => {
        if (tag === 'a') {
          createdAnchor = {
            href: '',
            download: '',
            click: vi.fn(function () {
              clickedDownload = this.download;
            })
          };
          return createdAnchor;
        }
        return {};
      }),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn()
      }
    };

    globalThis.todayStr = () => '2026-10-09';
    globalThis.progress = {};
    globalThis.stats = {};
    globalThis.starredSet = new Set();
    globalThis.srsStore = {};
    globalThis.getDailyGoal = () => 20;
    globalThis.showToast = vi.fn();
    globalThis.alert = vi.fn();
  });

  afterEach(() => {
    delete globalThis.Blob;
    delete globalThis.URL;
    delete globalThis.document;
    delete globalThis.todayStr;
    delete globalThis.progress;
    delete globalThis.stats;
    delete globalThis.starredSet;
    delete globalThis.srsStore;
    delete globalThis.getDailyGoal;
    delete globalThis.showToast;
    delete globalThis.alert;
  });

  it('pre-sync mode produces deutsch_lernen_backup_pre_sync_*.json', () => {
    exportBackupFn('sync');
    expect(createdAnchor.click).toHaveBeenCalled();
    expect(clickedDownload).toBe('deutsch_lernen_backup_pre_sync_2026-10-09.json');
  });

  it('pre-restore mode (boolean true) produces deutsch_lernen_backup_pre_restore_*.json', () => {
    exportBackupFn(true);
    expect(createdAnchor.click).toHaveBeenCalled();
    expect(clickedDownload).toBe('deutsch_lernen_backup_pre_restore_2026-10-09.json');
  });

  it('pre-restore mode (string "restore") produces deutsch_lernen_backup_pre_restore_*.json', () => {
    exportBackupFn('restore');
    expect(createdAnchor.click).toHaveBeenCalled();
    expect(clickedDownload).toBe('deutsch_lernen_backup_pre_restore_2026-10-09.json');
  });

  it('manual export mode (default / false) produces deutsch_lernen_backup_*.json', () => {
    exportBackupFn();
    expect(createdAnchor.click).toHaveBeenCalled();
    expect(clickedDownload).toBe('deutsch_lernen_backup_2026-10-09.json');
    expect(globalThis.showToast).toHaveBeenCalled();
  });
});

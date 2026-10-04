import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import { PROGRESS_MODES, validateBackupData } from './unit_fixes.test.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const indexHtmlPath = path.join(rootDir, 'index.html');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

describe('Backup Modes & Static AST Verification', () => {
  describe('Static scan of index.html for progress modes', () => {
    it('declares PROGRESS_MODES with all 5 active modes', () => {
      const match = indexHtml.match(/const\s+PROGRESS_MODES\s*=\s*\[([^\]]+)\]/);
      expect(match, 'PROGRESS_MODES must be declared in index.html').toBeTruthy();
      const declaredModes = match[1]
        .split(',')
        .map(s => s.trim().replace(/['"]/g, ''));
      expect(declaredModes).toEqual(['mcq', 'written', 'article', 'plural', 'listen']);
    });

    it('explicitly defines THRESH for all 5 modes including listen', () => {
      const match = indexHtml.match(/const\s+THRESH\s*=\s*\{([^}]+)\}/);
      expect(match, 'THRESH must be declared in index.html').toBeTruthy();
      const entries = match[1].split(',').map(s => s.trim());
      const threshMap = {};
      entries.forEach(e => {
        const [k, v] = e.split(':').map(x => x.trim().replace(/['"]/g, ''));
        if (k && v) threshMap[k] = parseInt(v, 10);
      });
      expect(threshMap).toHaveProperty('mcq', 10);
      expect(threshMap).toHaveProperty('written', 10);
      expect(threshMap).toHaveProperty('article', 8);
      expect(threshMap).toHaveProperty('plural', 8);
      expect(threshMap).toHaveProperty('listen', 8);
    });

    it('ensures every applyResult call site uses a mode present in PROGRESS_MODES', () => {
      // Find all applyResult(catId, mode, idx, ok) calls in index.html
      const regex = /applyResult\s*\(\s*[^,]+,\s*([^,]+),/g;
      const modesFound = new Set();
      let m;
      while ((m = regex.exec(indexHtml)) !== null) {
        const rawArg = m[1].trim();
        // If literal mode string
        if (/^['"][a-zA-Z0-9_]+['"]$/.test(rawArg)) {
          modesFound.add(rawArg.replace(/['"]/g, ''));
        }
      }
      // Check that all found literal modes are in PROGRESS_MODES
      for (const mode of modesFound) {
        expect(PROGRESS_MODES).toContain(mode);
      }
      expect(PROGRESS_MODES).toEqual(expect.arrayContaining(['mcq', 'written', 'article', 'plural', 'listen']));
    });

    it('ensures every ensureProgress call site passes a mode present in PROGRESS_MODES', () => {
      // Find all ensureProgress calls with string literal arguments
      const regex = /ensureProgress\s*\(\s*[^,]+,\s*([^)]+)\)/g;
      const modesFound = new Set();
      let m;
      while ((m = regex.exec(indexHtml)) !== null) {
        const rawArg = m[1].trim();
        if (/^['"][a-zA-Z0-9_]+['"]$/.test(rawArg)) {
          modesFound.add(rawArg.replace(/['"]/g, ''));
        }
      }
      for (const mode of modesFound) {
        expect(PROGRESS_MODES).toContain(mode);
      }
    });

    it('verifies quiz and review modes never call applyResult with their own mode key', () => {
      expect(indexHtml).not.toMatch(/applyResult\s*\(\s*[^,]+,\s*['"]quiz['"]/);
      expect(indexHtml).not.toMatch(/applyResult\s*\(\s*[^,]+,\s*['"]review['"]/);
      expect(indexHtml).not.toMatch(/ensureProgress\s*\(\s*[^,]+,\s*['"]quiz['"]/);
      expect(indexHtml).not.toMatch(/ensureProgress\s*\(\s*[^,]+,\s*['"]review['"]/);
    });
  });

  describe('Backup roundtrip with progress in EVERY mode (mcq, written, article, plural, listen)', () => {
    const mockCategories = [
      { id: 'obst', words: [{ n: 'Apfel', a: 'der', ar: 'تفاحة', pl: 'Äpfel' }, { n: 'Banane', a: 'die', ar: 'موزة', pl: 'Bananen' }] },
      { id: 'tiere', words: [{ n: 'Hund', a: 'der', ar: 'كلب', pl: 'Hunde' }] }
    ];

    it('validates and round-trips a backup with progress across all 5 modes', () => {
      const fullProgressBackup = {
        version: 2,
        exportDate: '2026-10-04T12:00:00.000Z',
        progress: {
          obst: {
            mcq: { unlocked: 5, counts: { '0': 10, '1': 4 }, coreAcked: false },
            written: { unlocked: 5, counts: { '0': 8, '1': 2 }, coreAcked: false },
            article: { unlocked: 5, counts: { '0': 8, '1': 5 }, coreAcked: false },
            plural: { unlocked: 5, counts: { '0': 8, '1': 3 }, coreAcked: false },
            listen: { unlocked: 5, counts: { '0': 8, '1': 1 }, coreAcked: false }
          }
        },
        stats: {
          lastDate: '2026-10-04',
          current: 4,
          longest: 12,
          totalAnswered: 85,
          totalCorrect: 78,
          todayCount: 22
        },
        starred: ['obst_0', 'obst_1'],
        srs: {
          'obst_0': { box: 3, lastDate: '2026-10-02', nextDate: '2026-10-16' },
          'obst_1': { box: 1, lastDate: '2026-10-04', nextDate: '2026-10-05' }
        },
        dailyGoal: 25
      };

      const val = validateBackupData(fullProgressBackup, mockCategories);
      expect(val.valid, val.error).toBe(true);

      // JSON roundtrip
      const serialized = JSON.stringify(fullProgressBackup);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(fullProgressBackup);
      expect(deserialized.progress.obst).toHaveProperty('mcq');
      expect(deserialized.progress.obst).toHaveProperty('written');
      expect(deserialized.progress.obst).toHaveProperty('article');
      expect(deserialized.progress.obst).toHaveProperty('plural');
      expect(deserialized.progress.obst).toHaveProperty('listen');
    });

    it('strictly preserves the 7 invalid-backup rejection cases', () => {
      // 1. non-object / empty payload
      expect(validateBackupData(null, mockCategories).valid).toBe(false);
      expect(validateBackupData({}, mockCategories).valid).toBe(false);
      // 2. unknown category
      expect(validateBackupData({ progress: { nonexistent_cat: { mcq: {} } } }, mockCategories).valid).toBe(false);
      // 3. unknown mode
      expect(validateBackupData({ progress: { obst: { unknown_mode: {} } } }, mockCategories).valid).toBe(false);
      // 4. out-of-range counts / unlocked
      expect(validateBackupData({ progress: { obst: { mcq: { counts: { '0': -1 } } } } }, mockCategories).valid).toBe(false);
      expect(validateBackupData({ progress: { obst: { mcq: { counts: { '999': 1 } } } } }, mockCategories).valid).toBe(false);
      // 5. malformed starred
      expect(validateBackupData({ starred: ['invalid_star'] }, mockCategories).valid).toBe(false);
      // 6. invalid SRS box
      expect(validateBackupData({ srs: { 'obst_0': { box: 9 } } }, mockCategories).valid).toBe(false);
      // 7. invalid dailyGoal
      expect(validateBackupData({ dailyGoal: 3 }, mockCategories).valid).toBe(false);
      expect(validateBackupData({ dailyGoal: 300 }, mockCategories).valid).toBe(false);
    });
  });
});

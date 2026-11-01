import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  extractCategoriesFromHtml,
  computeCanonicalHash,
  applyVocabChanges
} from '../scripts/apply_vocab_changes.js';

describe('scripts/apply_vocab_changes.js unit tests', () => {
  const rootDir = path.resolve(__dirname, '..');
  const indexHtmlPath = path.join(rootDir, 'index.html');
  const batch1Path = path.join(rootDir, 'docs', 'vocab_changes_batch1.json');
  const sentencesBatch1Path = path.join(rootDir, 'tools', 'vocab_changes_sentences_batch1.json');

  it('reports historical docs/vocab_changes_batch1.json as already applied (idempotent)', () => {
    const res = applyVocabChanges({
      htmlPath: indexHtmlPath,
      changesPath: batch1Path,
      dryRun: true
    });
    expect(res.alreadyApplied).toBe(true);
    expect(res.message).toContain('already applied');
  });

  it('reports tools/vocab_changes_sentences_batch1.json as already applied on current index.html', () => {
    const res = applyVocabChanges({
      htmlPath: indexHtmlPath,
      changesPath: sentencesBatch1Path,
      dryRun: true
    });
    expect(res.alreadyApplied).toBe(true);
    expect(res.message).toContain('already applied');
  });

  it('applies sentences batch 1 on a base copy, proves exact 386 changes, second run is no-op', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-test-'));
    try {
      const tempHtml = path.join(tmpDir, 'index.html');
      const changesData = JSON.parse(fs.readFileSync(sentencesBatch1Path, 'utf8'));

      // Construct base HTML by replacing the 386 new values with expect_current
      let baseHtml = fs.readFileSync(indexHtmlPath, 'utf8');
      for (const e of changesData.edit) {
        if (e.field === 's') {
          baseHtml = baseHtml.replace(`s:'${e.new}'`, `s:'${e.expect_current}'`);
        } else if (e.field === 'sar') {
          baseHtml = baseHtml.replace(`sar:'${e.new}'`, `sar:'${e.expect_current}'`);
        }
      }
      fs.writeFileSync(tempHtml, baseHtml, 'utf8');

      // Verify base copy has base_vocab_sha256
      const baseCategories = extractCategoriesFromHtml(fs.readFileSync(tempHtml, 'utf8'));
      const baseHash = computeCanonicalHash(baseCategories);
      expect(baseHash).toBe(changesData.base_vocab_sha256);
      expect(baseHash).toBe('7b4dc30d9ca9407142391356beb2eada26c9fabf3ad27a841d4fe6468139aa77');

      // First run: apply changes
      const res1 = applyVocabChanges({
        htmlPath: tempHtml,
        changesPath: sentencesBatch1Path,
        dryRun: false
      });

      expect(res1.alreadyApplied).toBe(false);
      expect(res1.appliedEditsCount).toBe(386);
      expect(res1.appliedRemovalsCount).toBe(0);

      // Verify file modified and resulting hash is new canonical hash
      const updatedCategories = extractCategoriesFromHtml(fs.readFileSync(tempHtml, 'utf8'));
      expect(updatedCategories.length).toBe(31);
      const newHash = computeCanonicalHash(updatedCategories);
      expect(newHash).toBe('edaeb00dd7f83b4e0360a980bfc32c57bf2c5603f4962446a1becf732f1fe8ac');

      // Compare field-by-field against baseCategories
      const expectedEditsMap = new Map();
      for (const e of changesData.edit) {
        expectedEditsMap.set(`${e.id}::${e.field}`, e);
      }
      expect(expectedEditsMap.size).toBe(386);

      let totalDiffCount = 0;
      for (let c = 0; c < baseCategories.length; c++) {
        const bc = baseCategories[c];
        const uc = updatedCategories[c];
        expect(uc.id).toBe(bc.id);
        expect(uc.words.length).toBe(bc.words.length);

        for (let w = 0; w < bc.words.length; w++) {
          const bw = bc.words[w];
          const uw = uc.words[w];
          expect(uw.id).toBe(bw.id);

          const allKeys = new Set([...Object.keys(bw), ...Object.keys(uw)]);
          for (const k of allKeys) {
            if (bw[k] !== uw[k]) {
              totalDiffCount++;
              const key = `${bw.id}::${k}`;
              expect(expectedEditsMap.has(key)).toBe(true);
              const exp = expectedEditsMap.get(key);
              expect(bw[k]).toBe(exp.expect_current);
              expect(uw[k]).toBe(exp.new);
            }
          }
        }
      }
      expect(totalDiffCount).toBe(386);

      // Second run: idempotent no-op
      const htmlBeforeSecond = fs.readFileSync(tempHtml, 'utf8');
      const res2 = applyVocabChanges({
        htmlPath: tempHtml,
        changesPath: sentencesBatch1Path,
        dryRun: false
      });
      const htmlAfterSecond = fs.readFileSync(tempHtml, 'utf8');

      expect(res2.alreadyApplied).toBe(true);
      expect(htmlAfterSecond).toBe(htmlBeforeSecond);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('aborts without writing when expect_current does not match', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-err-test-'));
    try {
      const tempHtml = path.join(tmpDir, 'index.html');
      const changesData = JSON.parse(fs.readFileSync(sentencesBatch1Path, 'utf8'));

      // Construct base HTML
      let baseHtml = fs.readFileSync(indexHtmlPath, 'utf8');
      for (const e of changesData.edit) {
        if (e.field === 's') {
          baseHtml = baseHtml.replace(`s:'${e.new}'`, `s:'${e.expect_current}'`);
        } else if (e.field === 'sar') {
          baseHtml = baseHtml.replace(`sar:'${e.new}'`, `sar:'${e.expect_current}'`);
        }
      }
      fs.writeFileSync(tempHtml, baseHtml, 'utf8');
      const origContent = fs.readFileSync(tempHtml, 'utf8');

      // Create corrupted changes file
      const corruptedChangesPath = path.join(tmpDir, 'corrupt.json');
      changesData.edit[0].expect_current = 'WRONG EXPECTED TEXT';
      fs.writeFileSync(corruptedChangesPath, JSON.stringify(changesData, null, 2), 'utf8');

      expect(() => {
        applyVocabChanges({
          htmlPath: tempHtml,
          changesPath: corruptedChangesPath,
          dryRun: false
        });
      }).toThrow(/Edit mismatch/);

      // Verify file was NOT modified
      const postContent = fs.readFileSync(tempHtml, 'utf8');
      expect(postContent).toBe(origContent);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('aborts without writing when base_vocab_sha256 does not match current data', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-hash-test-'));
    try {
      const tempHtml = path.join(tmpDir, 'index.html');
      const changesData = JSON.parse(fs.readFileSync(sentencesBatch1Path, 'utf8'));

      // Construct base HTML
      let baseHtml = fs.readFileSync(indexHtmlPath, 'utf8');
      for (const e of changesData.edit) {
        if (e.field === 's') {
          baseHtml = baseHtml.replace(`s:'${e.new}'`, `s:'${e.expect_current}'`);
        } else if (e.field === 'sar') {
          baseHtml = baseHtml.replace(`sar:'${e.new}'`, `sar:'${e.expect_current}'`);
        }
      }
      fs.writeFileSync(tempHtml, baseHtml, 'utf8');
      const origContent = fs.readFileSync(tempHtml, 'utf8');

      const corruptedChangesPath = path.join(tmpDir, 'hash_mismatch.json');
      changesData.base_vocab_sha256 = '0000000000000000000000000000000000000000000000000000000000000000';
      fs.writeFileSync(corruptedChangesPath, JSON.stringify(changesData, null, 2), 'utf8');

      expect(() => {
        applyVocabChanges({
          htmlPath: tempHtml,
          changesPath: corruptedChangesPath,
          dryRun: false
        });
      }).toThrow(/base_vocab_sha256 mismatch/);

      expect(fs.readFileSync(tempHtml, 'utf8')).toBe(origContent);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('aborts without writing when an unknown word id is encountered', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-id-test-'));
    try {
      const tempHtml = path.join(tmpDir, 'index.html');
      const changesData = JSON.parse(fs.readFileSync(sentencesBatch1Path, 'utf8'));

      // Construct base HTML
      let baseHtml = fs.readFileSync(indexHtmlPath, 'utf8');
      for (const e of changesData.edit) {
        if (e.field === 's') {
          baseHtml = baseHtml.replace(`s:'${e.new}'`, `s:'${e.expect_current}'`);
        } else if (e.field === 'sar') {
          baseHtml = baseHtml.replace(`sar:'${e.new}'`, `sar:'${e.expect_current}'`);
        }
      }
      fs.writeFileSync(tempHtml, baseHtml, 'utf8');
      const origContent = fs.readFileSync(tempHtml, 'utf8');

      const corruptedChangesPath = path.join(tmpDir, 'unknown_id.json');
      changesData.edit[0].id = 'unknown_category.nonexistent_word';
      fs.writeFileSync(corruptedChangesPath, JSON.stringify(changesData, null, 2), 'utf8');

      expect(() => {
        applyVocabChanges({
          htmlPath: tempHtml,
          changesPath: corruptedChangesPath,
          dryRun: false
        });
      }).toThrow(/Unknown edit word id/);

      expect(fs.readFileSync(tempHtml, 'utf8')).toBe(origContent);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('refuses to touch forbidden category section-names', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-sec-test-'));
    try {
      const tempHtml = path.join(tmpDir, 'index.html');
      fs.copyFileSync(indexHtmlPath, tempHtml);
      const origContent = fs.readFileSync(tempHtml, 'utf8');

      const corruptedChangesPath = path.join(tmpDir, 'forbidden.json');
      const changesData = JSON.parse(fs.readFileSync(sentencesBatch1Path, 'utf8'));
      changesData.edit[0].id = 'section-names.verben';
      fs.writeFileSync(corruptedChangesPath, JSON.stringify(changesData, null, 2), 'utf8');

      expect(() => {
        applyVocabChanges({
          htmlPath: tempHtml,
          changesPath: corruptedChangesPath,
          dryRun: false
        });
      }).toThrow(/Edit targets forbidden category 'section-names'/);

      expect(fs.readFileSync(tempHtml, 'utf8')).toBe(origContent);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

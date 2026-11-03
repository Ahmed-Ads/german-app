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
  const sentencesBatch2Path = path.join(rootDir, 'tools', 'vocab_changes_sentences_batch2.json');
  const sentencesPilot4Path = path.join(rootDir, 'tools', 'vocab_changes_sentences_pilot4.json');
  const sentencesBatch3aPath = path.join(rootDir, 'tools', 'vocab_changes_sentences_batch3a.json');

  function revertEdits(html, changesJsonPath) {
    const changes = JSON.parse(fs.readFileSync(changesJsonPath, 'utf8'));
    let res = html;
    for (const e of changes.edit) {
      if (e.field === 's') {
        res = res.replace(`s:'${e.new}'`, `s:'${e.expect_current}'`);
      } else if (e.field === 'sar') {
        res = res.replace(`sar:'${e.new}'`, `sar:'${e.expect_current}'`);
      }
    }
    return res;
  }

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

  it('reports tools/vocab_changes_sentences_batch2.json as already applied on current index.html', () => {
    const res = applyVocabChanges({
      htmlPath: indexHtmlPath,
      changesPath: sentencesBatch2Path,
      dryRun: true
    });
    expect(res.alreadyApplied).toBe(true);
    expect(res.message).toContain('already applied');
  });

  it('reports tools/vocab_changes_sentences_pilot4.json as already applied on current index.html', () => {
    const res = applyVocabChanges({
      htmlPath: indexHtmlPath,
      changesPath: sentencesPilot4Path,
      dryRun: true
    });
    expect(res.alreadyApplied).toBe(true);
    expect(res.message).toContain('already applied');
  });

  it('reports tools/vocab_changes_sentences_batch3a.json as already applied on current index.html', () => {
    const res = applyVocabChanges({
      htmlPath: indexHtmlPath,
      changesPath: sentencesBatch3aPath,
      dryRun: true
    });
    expect(res.alreadyApplied).toBe(true);
    expect(res.message).toContain('already applied');
  });

  it('applies sentences batch 2 on a base copy, proves exact 344 changes, second run is no-op', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-b2-test-'));
    try {
      const tempHtml = path.join(tmpDir, 'index.html');
      const changesData = JSON.parse(fs.readFileSync(sentencesBatch2Path, 'utf8'));

      // Reconstruct batch 2 base HTML by reverting batch 3a, pilot 4, and batch 2 edits
      let baseHtml = fs.readFileSync(indexHtmlPath, 'utf8');
      baseHtml = revertEdits(baseHtml, sentencesBatch3aPath);
      baseHtml = revertEdits(baseHtml, sentencesPilot4Path);
      baseHtml = revertEdits(baseHtml, sentencesBatch2Path);
      fs.writeFileSync(tempHtml, baseHtml, 'utf8');

      // Verify base copy has base_vocab_sha256
      const baseCategories = extractCategoriesFromHtml(fs.readFileSync(tempHtml, 'utf8'));
      const baseHash = computeCanonicalHash(baseCategories);
      expect(baseHash).toBe(changesData.base_vocab_sha256);
      expect(baseHash).toBe('edaeb00dd7f83b4e0360a980bfc32c57bf2c5603f4962446a1becf732f1fe8ac');

      // First run: apply changes
      const res1 = applyVocabChanges({
        htmlPath: tempHtml,
        changesPath: sentencesBatch2Path,
        dryRun: false
      });

      expect(res1.alreadyApplied).toBe(false);
      expect(res1.appliedEditsCount).toBe(344);
      expect(res1.appliedRemovalsCount).toBe(0);

      // Verify file modified and resulting hash is new canonical hash
      const updatedCategories = extractCategoriesFromHtml(fs.readFileSync(tempHtml, 'utf8'));
      expect(updatedCategories.length).toBe(31);
      const newHash = computeCanonicalHash(updatedCategories);
      expect(newHash).toBe('677954c564d622bbaa1d188f9f71b674a889187c4f523774435bf9adb2c92f69');

      // Compare field-by-field against baseCategories
      const expectedEditsMap = new Map();
      for (const e of changesData.edit) {
        expectedEditsMap.set(`${e.id}::${e.field}`, e);
      }
      expect(expectedEditsMap.size).toBe(344);

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
      expect(totalDiffCount).toBe(344);

      // Second run: idempotent no-op
      const htmlBeforeSecond = fs.readFileSync(tempHtml, 'utf8');
      const res2 = applyVocabChanges({
        htmlPath: tempHtml,
        changesPath: sentencesBatch2Path,
        dryRun: false
      });
      const htmlAfterSecond = fs.readFileSync(tempHtml, 'utf8');

      expect(res2.alreadyApplied).toBe(true);
      expect(htmlAfterSecond).toBe(htmlBeforeSecond);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('applies sentences pilot 4 on a base copy, proves exact 322 changes, second run is no-op', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-p4-test-'));
    try {
      const tempHtml = path.join(tmpDir, 'index.html');
      const changesData = JSON.parse(fs.readFileSync(sentencesPilot4Path, 'utf8'));

      // Construct base HTML by reverting batch 3a and pilot 4 values
      let baseHtml = fs.readFileSync(indexHtmlPath, 'utf8');
      baseHtml = revertEdits(baseHtml, sentencesBatch3aPath);
      baseHtml = revertEdits(baseHtml, sentencesPilot4Path);
      fs.writeFileSync(tempHtml, baseHtml, 'utf8');

      // Verify base copy has base_vocab_sha256
      const baseCategories = extractCategoriesFromHtml(fs.readFileSync(tempHtml, 'utf8'));
      const baseHash = computeCanonicalHash(baseCategories);
      expect(baseHash).toBe(changesData.base_vocab_sha256);
      expect(baseHash).toBe('677954c564d622bbaa1d188f9f71b674a889187c4f523774435bf9adb2c92f69');

      // First run: apply changes
      const res1 = applyVocabChanges({
        htmlPath: tempHtml,
        changesPath: sentencesPilot4Path,
        dryRun: false
      });

      expect(res1.alreadyApplied).toBe(false);
      expect(res1.appliedEditsCount).toBe(322);
      expect(res1.appliedRemovalsCount).toBe(0);

      // Verify file modified and resulting hash is new canonical hash
      const updatedCategories = extractCategoriesFromHtml(fs.readFileSync(tempHtml, 'utf8'));
      expect(updatedCategories.length).toBe(31);
      const newHash = computeCanonicalHash(updatedCategories);
      expect(newHash).toBe('ed269c3e53f2df595e8ab81a656d535debf66b223535ce9490c9ea8e8338c5b7');

      // Compare field-by-field against baseCategories
      const expectedEditsMap = new Map();
      for (const e of changesData.edit) {
        expectedEditsMap.set(`${e.id}::${e.field}`, e);
      }
      expect(expectedEditsMap.size).toBe(322);

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
      expect(totalDiffCount).toBe(322);

      // Second run: idempotent no-op
      const htmlBeforeSecond = fs.readFileSync(tempHtml, 'utf8');
      const res2 = applyVocabChanges({
        htmlPath: tempHtml,
        changesPath: sentencesPilot4Path,
        dryRun: false
      });
      const htmlAfterSecond = fs.readFileSync(tempHtml, 'utf8');

      expect(res2.alreadyApplied).toBe(true);
      expect(htmlAfterSecond).toBe(htmlBeforeSecond);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('applies sentences batch 3a on a base copy, proves exact 270 changes, second run is no-op', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-b3a-test-'));
    try {
      const tempHtml = path.join(tmpDir, 'index.html');
      const changesData = JSON.parse(fs.readFileSync(sentencesBatch3aPath, 'utf8'));

      // Construct base HTML by reverting batch 3a values
      let baseHtml = fs.readFileSync(indexHtmlPath, 'utf8');
      baseHtml = revertEdits(baseHtml, sentencesBatch3aPath);
      fs.writeFileSync(tempHtml, baseHtml, 'utf8');

      // Verify base copy has base_vocab_sha256
      const baseCategories = extractCategoriesFromHtml(fs.readFileSync(tempHtml, 'utf8'));
      const baseHash = computeCanonicalHash(baseCategories);
      expect(baseHash).toBe(changesData.base_vocab_sha256);
      expect(baseHash).toBe('ed269c3e53f2df595e8ab81a656d535debf66b223535ce9490c9ea8e8338c5b7');

      // First run: apply changes
      const res1 = applyVocabChanges({
        htmlPath: tempHtml,
        changesPath: sentencesBatch3aPath,
        dryRun: false
      });

      expect(res1.alreadyApplied).toBe(false);
      expect(res1.appliedEditsCount).toBe(270);
      expect(res1.appliedRemovalsCount).toBe(0);

      // Verify file modified and resulting hash is new canonical hash
      const updatedCategories = extractCategoriesFromHtml(fs.readFileSync(tempHtml, 'utf8'));
      expect(updatedCategories.length).toBe(31);
      const newHash = computeCanonicalHash(updatedCategories);
      expect(newHash).toBe('a8a40f4d7273a8f2f05d139661a837249e05408b18bc343c030fdd106edc9c2e');

      // Compare field-by-field against baseCategories
      const expectedEditsMap = new Map();
      for (const e of changesData.edit) {
        expectedEditsMap.set(`${e.id}::${e.field}`, e);
      }
      expect(expectedEditsMap.size).toBe(270);

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
      expect(totalDiffCount).toBe(270);

      // Second run: idempotent no-op
      const htmlBeforeSecond = fs.readFileSync(tempHtml, 'utf8');
      const res2 = applyVocabChanges({
        htmlPath: tempHtml,
        changesPath: sentencesBatch3aPath,
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
      const changesData = JSON.parse(fs.readFileSync(sentencesBatch3aPath, 'utf8'));

      // Construct base HTML
      let baseHtml = fs.readFileSync(indexHtmlPath, 'utf8');
      baseHtml = revertEdits(baseHtml, sentencesBatch3aPath);
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
      const changesData = JSON.parse(fs.readFileSync(sentencesBatch3aPath, 'utf8'));

      // Construct base HTML
      let baseHtml = fs.readFileSync(indexHtmlPath, 'utf8');
      baseHtml = revertEdits(baseHtml, sentencesBatch3aPath);
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
      const changesData = JSON.parse(fs.readFileSync(sentencesBatch3aPath, 'utf8'));

      // Construct base HTML
      let baseHtml = fs.readFileSync(indexHtmlPath, 'utf8');
      baseHtml = revertEdits(baseHtml, sentencesBatch3aPath);
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
      const changesData = JSON.parse(fs.readFileSync(sentencesBatch3aPath, 'utf8'));
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

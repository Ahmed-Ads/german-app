import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  extractCategoriesFromHtml,
  computeCanonicalHash,
  applyVocabChanges
} from '../scripts/apply_vocab_changes.js';
import {
  applyVerbsBatch2,
  EXPECTED_BASE_HASH,
  EXPECTED_VERB_COUNT
} from '../tools/apply_verbs_batch2.js';
import {
  applyVerbsBatch3,
  EXPECTED_BASE_HASH as BATCH3_EXPECTED_BASE_HASH,
  EXPECTED_VERB_COUNT as BATCH3_EXPECTED_VERB_COUNT
} from '../tools/apply_verbs_batch3.js';

describe('scripts/apply_vocab_changes.js unit tests', () => {
  const rootDir = path.resolve(__dirname, '..');
  const indexHtmlPath = path.join(rootDir, 'index.html');
  const batch1Path = path.join(rootDir, 'docs', 'vocab_changes_batch1.json');
  const sentencesBatch1Path = path.join(rootDir, 'tools', 'vocab_changes_sentences_batch1.json');
  const sentencesBatch2Path = path.join(rootDir, 'tools', 'vocab_changes_sentences_batch2.json');
  const sentencesPilot4Path = path.join(rootDir, 'tools', 'vocab_changes_sentences_pilot4.json');
  const sentencesBatch3aPath = path.join(rootDir, 'tools', 'vocab_changes_sentences_batch3a.json');
  const sentencesBatch3bPath = path.join(rootDir, 'tools', 'vocab_changes_sentences_batch3b.json');
  const sentencesBatch4Path = path.join(rootDir, 'tools', 'vocab_changes_sentences_batch4.json');
  const sentencesDedupePath = path.join(rootDir, 'tools', 'vocab_changes_sentences_dedupe.json');
  const verbsBatch2Path = path.join(rootDir, 'tools', 'verbs_batch2.json');
  const verbsBatch3Path = path.join(rootDir, 'tools', 'verbs_batch3.json');

  function removeBatch3Verbs(html) {
    // 1. Remove from CATEGORIES (the 94 verbs appended after verben.zurueckkommen)
    let res = html.replace(
      /(\{\s*id\s*:\s*['"]verben\.zurueckkommen['"][\s\S]*?\})(,\s*\n\s*\{\s*id\s*:\s*['"]verben\.beschreiben['"][\s\S]*?)(\s*\n\s*\]\s*\})/m,
      '$1$3'
    );
    // 2. Remove from VERB_FORMS (the 94 entries appended after verben.zurueckkommen)
    res = res.replace(
      /("verben\.zurueckkommen":\s*\{[\s\S]*?\n\s*\})(,\s*\n\s*"verben\.beschreiben":[\s\S]*?\n)(\};)/,
      '$1\n$3'
    );
    return res;
  }

  function removeBatch2Verbs(html) {
    // 1. Remove from CATEGORIES (the 92 verbs appended after verben.kennenlernen)
    let res = html.replace(
      /(\{\s*id\s*:\s*['"]verben\.kennenlernen['"][\s\S]*?\})(,\s*\n\s*\{\s*id\s*:\s*['"]verben\.bekommen['"][\s\S]*?)(\s*\n\s*\]\s*\})/m,
      '$1$3'
    );
    // 2. Remove from VERB_FORMS (the 92 entries appended after verben.kennenlernen)
    res = res.replace(
      /("verben\.kennenlernen":\s*\{[\s\S]*?\n\s*\})(,\s*\n\s*"verben\.bekommen":[\s\S]*?\n)(\};)/,
      '$1\n$3'
    );
    return res;
  }

  function revertEdits(html, changesJsonPath) {
    let res = html;
    if (res.includes('"verben.beschreiben"')) {
      res = removeBatch3Verbs(res);
    }
    if (res.includes('"verben.bekommen"')) {
      res = removeBatch2Verbs(res);
    }
    const changes = JSON.parse(fs.readFileSync(changesJsonPath, 'utf8'));
    for (const e of changes.edit) {
      const q = e.id.startsWith('verben.') ? '"' : "'";
      if (e.field === 's') {
        res = res.replace(`s:${q}${e.new}${q}`, `s:${q}${e.expect_current}${q}`);
      } else if (e.field === 'sar') {
        res = res.replace(`sar:${q}${e.new}${q}`, `sar:${q}${e.expect_current}${q}`);
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

  it('reports tools/vocab_changes_sentences_pilot4.json as already applied on base copy before dedupe', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-p4-check-'));
    try {
      const tempHtml = path.join(tmpDir, 'index.html');
      const baseHtml = revertEdits(fs.readFileSync(indexHtmlPath, 'utf8'), sentencesDedupePath);
      fs.writeFileSync(tempHtml, baseHtml, 'utf8');

      const res = applyVocabChanges({
        htmlPath: tempHtml,
        changesPath: sentencesPilot4Path,
        dryRun: true
      });
      expect(res.alreadyApplied).toBe(true);
      expect(res.message).toContain('already applied');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('reports tools/vocab_changes_sentences_batch3a.json as already applied on base copy before dedupe', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-b3a-check-'));
    try {
      const tempHtml = path.join(tmpDir, 'index.html');
      const baseHtml = revertEdits(fs.readFileSync(indexHtmlPath, 'utf8'), sentencesDedupePath);
      fs.writeFileSync(tempHtml, baseHtml, 'utf8');

      const res = applyVocabChanges({
        htmlPath: tempHtml,
        changesPath: sentencesBatch3aPath,
        dryRun: true
      });
      expect(res.alreadyApplied).toBe(true);
      expect(res.message).toContain('already applied');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('reports tools/vocab_changes_sentences_batch3b.json as already applied on current index.html', () => {
    const res = applyVocabChanges({
      htmlPath: indexHtmlPath,
      changesPath: sentencesBatch3bPath,
      dryRun: true
    });
    expect(res.alreadyApplied).toBe(true);
    expect(res.message).toContain('already applied');
  });

  it('reports tools/vocab_changes_sentences_batch4.json as already applied on current index.html', () => {
    const res = applyVocabChanges({
      htmlPath: indexHtmlPath,
      changesPath: sentencesBatch4Path,
      dryRun: true
    });
    expect(res.alreadyApplied).toBe(true);
    expect(res.message).toContain('already applied');
  });

  it('reports tools/vocab_changes_sentences_dedupe.json as already applied on current index.html', () => {
    const res = applyVocabChanges({
      htmlPath: indexHtmlPath,
      changesPath: sentencesDedupePath,
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

      // Reconstruct batch 2 base HTML by reverting dedupe, 4, 3b, 3a, pilot 4, and batch 2 edits
      let baseHtml = fs.readFileSync(indexHtmlPath, 'utf8');
      baseHtml = revertEdits(baseHtml, sentencesDedupePath);
      baseHtml = revertEdits(baseHtml, sentencesBatch4Path);
      baseHtml = revertEdits(baseHtml, sentencesBatch3bPath);
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

      // Construct base HTML by reverting dedupe, 4, 3b, 3a, and pilot 4 values
      let baseHtml = fs.readFileSync(indexHtmlPath, 'utf8');
      baseHtml = revertEdits(baseHtml, sentencesDedupePath);
      baseHtml = revertEdits(baseHtml, sentencesBatch4Path);
      baseHtml = revertEdits(baseHtml, sentencesBatch3bPath);
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

      // Construct base HTML by reverting dedupe, 4, 3b and 3a values
      let baseHtml = fs.readFileSync(indexHtmlPath, 'utf8');
      baseHtml = revertEdits(baseHtml, sentencesDedupePath);
      baseHtml = revertEdits(baseHtml, sentencesBatch4Path);
      baseHtml = revertEdits(baseHtml, sentencesBatch3bPath);
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

  it('applies sentences batch 3b on a base copy, proves exact 250 changes, second run is no-op', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-b3b-test-'));
    try {
      const tempHtml = path.join(tmpDir, 'index.html');
      const changesData = JSON.parse(fs.readFileSync(sentencesBatch3bPath, 'utf8'));

      // Construct base HTML by reverting dedupe, 4 and 3b values
      let baseHtml = fs.readFileSync(indexHtmlPath, 'utf8');
      baseHtml = revertEdits(baseHtml, sentencesDedupePath);
      baseHtml = revertEdits(baseHtml, sentencesBatch4Path);
      baseHtml = revertEdits(baseHtml, sentencesBatch3bPath);
      fs.writeFileSync(tempHtml, baseHtml, 'utf8');

      // Verify base copy has base_vocab_sha256
      const baseCategories = extractCategoriesFromHtml(fs.readFileSync(tempHtml, 'utf8'));
      const baseHash = computeCanonicalHash(baseCategories);
      expect(baseHash).toBe(changesData.base_vocab_sha256);
      expect(baseHash).toBe('a8a40f4d7273a8f2f05d139661a837249e05408b18bc343c030fdd106edc9c2e');

      // First run: apply changes
      const res1 = applyVocabChanges({
        htmlPath: tempHtml,
        changesPath: sentencesBatch3bPath,
        dryRun: false
      });

      expect(res1.alreadyApplied).toBe(false);
      expect(res1.appliedEditsCount).toBe(250);
      expect(res1.appliedRemovalsCount).toBe(0);

      // Verify file modified and resulting hash is new canonical hash
      const updatedCategories = extractCategoriesFromHtml(fs.readFileSync(tempHtml, 'utf8'));
      expect(updatedCategories.length).toBe(31);
      const newHash = computeCanonicalHash(updatedCategories);
      expect(newHash).toBe('8ad910bb3de85974da5466ab9fff45b3556b69b1612e5c0b82a39628af87eab7');

      // Compare field-by-field against baseCategories
      const expectedEditsMap = new Map();
      for (const e of changesData.edit) {
        expectedEditsMap.set(`${e.id}::${e.field}`, e);
      }
      expect(expectedEditsMap.size).toBe(250);

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
      expect(totalDiffCount).toBe(250);

      // Second run: idempotent no-op
      const htmlBeforeSecond = fs.readFileSync(tempHtml, 'utf8');
      const res2 = applyVocabChanges({
        htmlPath: tempHtml,
        changesPath: sentencesBatch3bPath,
        dryRun: false
      });
      const htmlAfterSecond = fs.readFileSync(tempHtml, 'utf8');

      expect(res2.alreadyApplied).toBe(true);
      expect(htmlAfterSecond).toBe(htmlBeforeSecond);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('applies sentences batch 4 on a base copy, proves exact 274 changes, second run is no-op', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-b4-test-'));
    try {
      const tempHtml = path.join(tmpDir, 'index.html');
      const changesData = JSON.parse(fs.readFileSync(sentencesBatch4Path, 'utf8'));

      // Construct base HTML by reverting dedupe and batch 4 values
      let baseHtml = fs.readFileSync(indexHtmlPath, 'utf8');
      baseHtml = revertEdits(baseHtml, sentencesDedupePath);
      baseHtml = revertEdits(baseHtml, sentencesBatch4Path);
      fs.writeFileSync(tempHtml, baseHtml, 'utf8');

      // Verify base copy has base_vocab_sha256
      const baseCategories = extractCategoriesFromHtml(fs.readFileSync(tempHtml, 'utf8'));
      const baseHash = computeCanonicalHash(baseCategories);
      expect(baseHash).toBe(changesData.base_vocab_sha256);
      expect(baseHash).toBe('8ad910bb3de85974da5466ab9fff45b3556b69b1612e5c0b82a39628af87eab7');

      // First run: apply changes
      const res1 = applyVocabChanges({
        htmlPath: tempHtml,
        changesPath: sentencesBatch4Path,
        dryRun: false
      });

      expect(res1.alreadyApplied).toBe(false);
      expect(res1.appliedEditsCount).toBe(274);
      expect(res1.appliedRemovalsCount).toBe(0);

      // Verify file modified and resulting hash is new canonical hash
      const updatedCategories = extractCategoriesFromHtml(fs.readFileSync(tempHtml, 'utf8'));
      expect(updatedCategories.length).toBe(31);
      const newHash = computeCanonicalHash(updatedCategories);
      expect(newHash).toBe('709fe2cac14d73a089fc1d91c74d532beeb44a8654c2cea872721cc75e329a0e');

      // Compare field-by-field against baseCategories
      const expectedEditsMap = new Map();
      for (const e of changesData.edit) {
        expectedEditsMap.set(`${e.id}::${e.field}`, e);
      }
      expect(expectedEditsMap.size).toBe(274);

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
      expect(totalDiffCount).toBe(274);

      // Second run: idempotent no-op
      const htmlBeforeSecond = fs.readFileSync(tempHtml, 'utf8');
      const res2 = applyVocabChanges({
        htmlPath: tempHtml,
        changesPath: sentencesBatch4Path,
        dryRun: false
      });
      const htmlAfterSecond = fs.readFileSync(tempHtml, 'utf8');

      expect(res2.alreadyApplied).toBe(true);
      expect(htmlAfterSecond).toBe(htmlBeforeSecond);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('applies sentences dedupe on a base copy, proves exact 5 changes, second run is no-op', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-dedupe-test-'));
    try {
      const tempHtml = path.join(tmpDir, 'index.html');
      const changesData = JSON.parse(fs.readFileSync(sentencesDedupePath, 'utf8'));

      // Construct base HTML by reverting dedupe values
      let baseHtml = fs.readFileSync(indexHtmlPath, 'utf8');
      baseHtml = revertEdits(baseHtml, sentencesDedupePath);
      fs.writeFileSync(tempHtml, baseHtml, 'utf8');

      // Verify base copy has base_vocab_sha256
      const baseCategories = extractCategoriesFromHtml(fs.readFileSync(tempHtml, 'utf8'));
      const baseHash = computeCanonicalHash(baseCategories);
      expect(baseHash).toBe(changesData.base_vocab_sha256);
      expect(baseHash).toBe('709fe2cac14d73a089fc1d91c74d532beeb44a8654c2cea872721cc75e329a0e');

      // First run: apply changes
      const res1 = applyVocabChanges({
        htmlPath: tempHtml,
        changesPath: sentencesDedupePath,
        dryRun: false
      });

      expect(res1.alreadyApplied).toBe(false);
      expect(res1.appliedEditsCount).toBe(5);
      expect(res1.appliedRemovalsCount).toBe(0);

      // Verify file modified and resulting hash is new canonical hash
      const updatedCategories = extractCategoriesFromHtml(fs.readFileSync(tempHtml, 'utf8'));
      expect(updatedCategories.length).toBe(31);
      const newHash = computeCanonicalHash(updatedCategories);
      expect(newHash).toBe('dd1a2e139128ff3812faa89082605c087832c2393e5343a6245767c349d46a29');

      // Compare field-by-field against baseCategories
      const expectedEditsMap = new Map();
      for (const e of changesData.edit) {
        expectedEditsMap.set(`${e.id}::${e.field}`, e);
      }
      expect(expectedEditsMap.size).toBe(5);

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
      expect(totalDiffCount).toBe(5);

      // Second run: idempotent no-op
      const htmlBeforeSecond = fs.readFileSync(tempHtml, 'utf8');
      const res2 = applyVocabChanges({
        htmlPath: tempHtml,
        changesPath: sentencesDedupePath,
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
      const changesData = JSON.parse(fs.readFileSync(sentencesDedupePath, 'utf8'));

      // Construct base HTML
      let baseHtml = fs.readFileSync(indexHtmlPath, 'utf8');
      baseHtml = revertEdits(baseHtml, sentencesDedupePath);
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
      const changesData = JSON.parse(fs.readFileSync(sentencesDedupePath, 'utf8'));

      // Construct base HTML
      let baseHtml = fs.readFileSync(indexHtmlPath, 'utf8');
      baseHtml = revertEdits(baseHtml, sentencesDedupePath);
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
      const changesData = JSON.parse(fs.readFileSync(sentencesDedupePath, 'utf8'));

      // Construct base HTML
      let baseHtml = fs.readFileSync(indexHtmlPath, 'utf8');
      baseHtml = revertEdits(baseHtml, sentencesDedupePath);
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
      const changesData = JSON.parse(fs.readFileSync(sentencesDedupePath, 'utf8'));
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

  describe('tools/apply_verbs_batch2.js integration tests', () => {
    it('reports tools/verbs_batch2.json as already applied on current index.html (idempotent)', () => {
      const res = applyVerbsBatch2(indexHtmlPath, verbsBatch2Path, { dryRun: true });
      expect(res.alreadyApplied).toBe(true);
      expect(res.applied).toBe(false);
      expect(res.wordCount).toBe(EXPECTED_VERB_COUNT);
      expect(res.newHash).toBe('d34a3d166c27434a988f0125edfb041a575c72cda806df04322d28bec9b9a945');
      expect(res.verbFormsChecksum).toBe('c2d747185f9f66d27921f0320124098d2ad0ab65a308e3c15d7a3c295e0cfe72');
    });

    it('applies verbs batch 2 on a reconstructed base copy proving exactly 92 new words, correct hashes, and second run is no-op', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verbs-b2-apply-'));
      try {
        const tempHtml = path.join(tmpDir, 'index.html');
        // Reconstruct base HTML before batch 2 (first remove batch 3, then batch 2)
        const baseHtml = removeBatch2Verbs(removeBatch3Verbs(fs.readFileSync(indexHtmlPath, 'utf8')));
        fs.writeFileSync(tempHtml, baseHtml, 'utf8');

        // Verify base copy has base canonical hash
        const baseCats = extractCategoriesFromHtml(baseHtml);
        const baseHash = computeCanonicalHash(baseCats);
        expect(baseHash).toBe(EXPECTED_BASE_HASH);
        expect(baseHash).toBe('dd1a2e139128ff3812faa89082605c087832c2393e5343a6245767c349d46a29');
        const baseWordCount = baseCats.reduce((s, c) => s + c.words.length, 0);
        expect(baseWordCount).toBe(1029);

        // First run: apply batch 2
        const res1 = applyVerbsBatch2(tempHtml, verbsBatch2Path, { dryRun: false });
        expect(res1.applied).toBe(true);
        expect(res1.alreadyApplied).toBe(false);
        expect(res1.wordCount).toBe(92);
        expect(res1.baseHash).toBe(EXPECTED_BASE_HASH);
        expect(res1.newHash).toBe('8144a1fa30ab76d3b88f5931d008d80f05d981cd4f18a9dca303c2bee605c8d5');
        expect(res1.verbFormsChecksum).toBe('475d9b0064f593a35f1041afa30cb6290c36d8f057328311f96f968c8cdeee0b');

        // Verify updated HTML state
        const appliedCats = extractCategoriesFromHtml(fs.readFileSync(tempHtml, 'utf8'));
        const appliedWordCount = appliedCats.reduce((s, c) => s + c.words.length, 0);
        expect(appliedWordCount).toBe(1121);
        expect(appliedWordCount - baseWordCount).toBe(92);

        // Second run: idempotent no-op
        const contentBefore = fs.readFileSync(tempHtml, 'utf8');
        const res2 = applyVerbsBatch2(tempHtml, verbsBatch2Path, { dryRun: false });
        const contentAfter = fs.readFileSync(tempHtml, 'utf8');

        expect(res2.alreadyApplied).toBe(true);
        expect(res2.applied).toBe(false);
        expect(contentAfter).toBe(contentBefore);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('error guards: aborts when base hash does not match', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verbs-b2-guard-hash-'));
      try {
        const tempHtml = path.join(tmpDir, 'index.html');
        // A base copy that is modified so its hash does not match EXPECTED_BASE_HASH
        let baseHtml = removeBatch2Verbs(removeBatch3Verbs(fs.readFileSync(indexHtmlPath, 'utf8')));
        baseHtml = baseHtml.replace("id:'obst.apfel',a:'der',n:'Apfel'", "id:'obst.apfel',a:'der',n:'ApfelX'");
        fs.writeFileSync(tempHtml, baseHtml, 'utf8');
        const origContent = fs.readFileSync(tempHtml, 'utf8');

        expect(() => {
          applyVerbsBatch2(tempHtml, verbsBatch2Path, { dryRun: false });
        }).toThrow(/Base vocabulary hash mismatch/);

        expect(fs.readFileSync(tempHtml, 'utf8')).toBe(origContent);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('error guards: aborts when a batch 2 id already exists in vocabulary', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verbs-b2-guard-id-'));
      try {
        const tempHtml = path.join(tmpDir, 'index.html');
        const baseHtml = removeBatch2Verbs(removeBatch3Verbs(fs.readFileSync(indexHtmlPath, 'utf8')));
        fs.writeFileSync(tempHtml, baseHtml, 'utf8');
        const origContent = fs.readFileSync(tempHtml, 'utf8');

        // Create temporary JSON with colliding id
        const collidingJsonPath = path.join(tmpDir, 'colliding.json');
        const batch2Data = JSON.parse(fs.readFileSync(verbsBatch2Path, 'utf8'));
        batch2Data[0].id = 'verben.sein'; // Collides with existing A1 verb
        fs.writeFileSync(collidingJsonPath, JSON.stringify(batch2Data, null, 2), 'utf8');

        expect(() => {
          applyVerbsBatch2(tempHtml, collidingJsonPath, { dryRun: false });
        }).toThrow(/already exists in vocabulary/);

        expect(fs.readFileSync(tempHtml, 'utf8')).toBe(origContent);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('error guards: aborts when batch 2 JSON is tampered (invalid count or invalid level)', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verbs-b2-guard-tamper-'));
      try {
        const tempHtml = path.join(tmpDir, 'index.html');
        const baseHtml = removeBatch2Verbs(removeBatch3Verbs(fs.readFileSync(indexHtmlPath, 'utf8')));
        fs.writeFileSync(tempHtml, baseHtml, 'utf8');
        const origContent = fs.readFileSync(tempHtml, 'utf8');

        // Tampered JSON: missing verb (91 items instead of 92)
        const tamperedJsonPath = path.join(tmpDir, 'tampered.json');
        const batch2Data = JSON.parse(fs.readFileSync(verbsBatch2Path, 'utf8')).slice(0, 91);
        fs.writeFileSync(tamperedJsonPath, JSON.stringify(batch2Data, null, 2), 'utf8');

        expect(() => {
          applyVerbsBatch2(tempHtml, tamperedJsonPath, { dryRun: false });
        }).toThrow(/Expected exactly 92 verbs in batch 2/);

        // Tampered JSON: invalid level
        const badLevelJsonPath = path.join(tmpDir, 'bad_level.json');
        const batch2DataBadLevel = JSON.parse(fs.readFileSync(verbsBatch2Path, 'utf8'));
        batch2DataBadLevel[0].level = 'B1';
        fs.writeFileSync(badLevelJsonPath, JSON.stringify(batch2DataBadLevel, null, 2), 'utf8');

        expect(() => {
          applyVerbsBatch2(tempHtml, badLevelJsonPath, { dryRun: false });
        }).toThrow(/expected 'A2'/);

        expect(fs.readFileSync(tempHtml, 'utf8')).toBe(origContent);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('tools/apply_verbs_batch3.js integration tests', () => {
    it('reports tools/verbs_batch3.json as already applied on current index.html (idempotent)', () => {
      const res = applyVerbsBatch3(indexHtmlPath, verbsBatch3Path, { dryRun: true });
      expect(res.alreadyApplied).toBe(true);
      expect(res.applied).toBe(false);
      expect(res.wordCount).toBe(BATCH3_EXPECTED_VERB_COUNT);
      expect(res.newHash).toBe('d34a3d166c27434a988f0125edfb041a575c72cda806df04322d28bec9b9a945');
      expect(res.verbFormsChecksum).toBe('c2d747185f9f66d27921f0320124098d2ad0ab65a308e3c15d7a3c295e0cfe72');
    });

    it('applies verbs batch 3 on a reconstructed base copy proving exactly 94 new words, correct hashes, and second run is no-op', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verbs-b3-apply-'));
      try {
        const tempHtml = path.join(tmpDir, 'index.html');
        // Reconstruct base HTML before batch 3
        const baseHtml = removeBatch3Verbs(fs.readFileSync(indexHtmlPath, 'utf8'));
        fs.writeFileSync(tempHtml, baseHtml, 'utf8');

        // Verify base copy has base canonical hash
        const baseCats = extractCategoriesFromHtml(baseHtml);
        const baseHash = computeCanonicalHash(baseCats);
        expect(baseHash).toBe(BATCH3_EXPECTED_BASE_HASH);
        expect(baseHash).toBe('8144a1fa30ab76d3b88f5931d008d80f05d981cd4f18a9dca303c2bee605c8d5');
        const baseWordCount = baseCats.reduce((s, c) => s + c.words.length, 0);
        expect(baseWordCount).toBe(1121);

        // First run: apply batch 3
        const res1 = applyVerbsBatch3(tempHtml, verbsBatch3Path, { dryRun: false });
        expect(res1.applied).toBe(true);
        expect(res1.alreadyApplied).toBe(false);
        expect(res1.wordCount).toBe(94);
        expect(res1.baseHash).toBe(BATCH3_EXPECTED_BASE_HASH);
        expect(res1.newHash).toBe('d34a3d166c27434a988f0125edfb041a575c72cda806df04322d28bec9b9a945');
        expect(res1.verbFormsChecksum).toBe('c2d747185f9f66d27921f0320124098d2ad0ab65a308e3c15d7a3c295e0cfe72');

        // Verify updated HTML state
        const appliedCats = extractCategoriesFromHtml(fs.readFileSync(tempHtml, 'utf8'));
        const appliedWordCount = appliedCats.reduce((s, c) => s + c.words.length, 0);
        expect(appliedWordCount).toBe(1215);
        expect(appliedWordCount - baseWordCount).toBe(94);

        // Second run: idempotent no-op
        const contentBefore = fs.readFileSync(tempHtml, 'utf8');
        const res2 = applyVerbsBatch3(tempHtml, verbsBatch3Path, { dryRun: false });
        const contentAfter = fs.readFileSync(tempHtml, 'utf8');

        expect(res2.alreadyApplied).toBe(true);
        expect(res2.applied).toBe(false);
        expect(contentAfter).toBe(contentBefore);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('error guards: aborts when base hash does not match', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verbs-b3-guard-hash-'));
      try {
        const tempHtml = path.join(tmpDir, 'index.html');
        // A base copy that is modified so its hash does not match BATCH3_EXPECTED_BASE_HASH
        let baseHtml = removeBatch3Verbs(fs.readFileSync(indexHtmlPath, 'utf8'));
        baseHtml = baseHtml.replace("id:'obst.apfel',a:'der',n:'Apfel'", "id:'obst.apfel',a:'der',n:'ApfelX'");
        fs.writeFileSync(tempHtml, baseHtml, 'utf8');
        const origContent = fs.readFileSync(tempHtml, 'utf8');

        expect(() => {
          applyVerbsBatch3(tempHtml, verbsBatch3Path, { dryRun: false });
        }).toThrow(/Base vocabulary hash mismatch/);

        expect(fs.readFileSync(tempHtml, 'utf8')).toBe(origContent);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('error guards: aborts when a batch 3 id already exists in vocabulary', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verbs-b3-guard-id-'));
      try {
        const tempHtml = path.join(tmpDir, 'index.html');
        const baseHtml = removeBatch3Verbs(fs.readFileSync(indexHtmlPath, 'utf8'));
        fs.writeFileSync(tempHtml, baseHtml, 'utf8');
        const origContent = fs.readFileSync(tempHtml, 'utf8');

        // Create temporary JSON with colliding id
        const collidingJsonPath = path.join(tmpDir, 'colliding.json');
        const batch3Data = JSON.parse(fs.readFileSync(verbsBatch3Path, 'utf8'));
        batch3Data[0].id = 'verben.sein'; // Collides with existing A1 verb
        fs.writeFileSync(collidingJsonPath, JSON.stringify(batch3Data, null, 2), 'utf8');

        expect(() => {
          applyVerbsBatch3(tempHtml, collidingJsonPath, { dryRun: false });
        }).toThrow(/already exists in vocabulary/);

        expect(fs.readFileSync(tempHtml, 'utf8')).toBe(origContent);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('error guards: aborts when batch 3 JSON is tampered (invalid count or invalid level)', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verbs-b3-guard-tamper-'));
      try {
        const tempHtml = path.join(tmpDir, 'index.html');
        const baseHtml = removeBatch3Verbs(fs.readFileSync(indexHtmlPath, 'utf8'));
        fs.writeFileSync(tempHtml, baseHtml, 'utf8');
        const origContent = fs.readFileSync(tempHtml, 'utf8');

        // Tampered JSON: missing verb (93 items instead of 94)
        const tamperedJsonPath = path.join(tmpDir, 'tampered.json');
        const batch3Data = JSON.parse(fs.readFileSync(verbsBatch3Path, 'utf8')).slice(0, 93);
        fs.writeFileSync(tamperedJsonPath, JSON.stringify(batch3Data, null, 2), 'utf8');

        expect(() => {
          applyVerbsBatch3(tempHtml, tamperedJsonPath, { dryRun: false });
        }).toThrow(/Expected exactly 94 verbs in batch 3/);

        // Tampered JSON: invalid level
        const badLevelJsonPath = path.join(tmpDir, 'bad_level.json');
        const batch3DataBadLevel = JSON.parse(fs.readFileSync(verbsBatch3Path, 'utf8'));
        batch3DataBadLevel[0].level = 'B2';
        fs.writeFileSync(badLevelJsonPath, JSON.stringify(batch3DataBadLevel, null, 2), 'utf8');

        expect(() => {
          applyVerbsBatch3(tempHtml, badLevelJsonPath, { dryRun: false });
        }).toThrow(/expected 'B1'/);

        expect(fs.readFileSync(tempHtml, 'utf8')).toBe(origContent);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});

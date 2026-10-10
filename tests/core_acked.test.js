import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.resolve(__dirname, '../index.html');
const html = fs.readFileSync(indexPath, 'utf8');

describe('B2-5: Stale object prevention on core words mastered screen', () => {
  it('handlers in index.html call ensureProgress dynamically rather than using a closed-over stale reference', () => {
    // Verify the static code in index.html calls ensureProgress inside continueExtra and goNextCat handlers
    const continueExtraMatch = html.match(/document\.getElementById\('continueExtra'\)\.addEventListener\('click',\s*\(\)\s*=>\s*\{([\s\S]*?)\}\);/);
    expect(continueExtraMatch).not.toBeNull();
    expect(continueExtraMatch[1]).toContain('ensureProgress(cat.id, mode).coreAcked = true');
    expect(continueExtraMatch[1]).not.toMatch(/\bp\.coreAcked\s*=\s*true/);

    const goNextCatMatch = html.match(/nextBtn2\.addEventListener\('click',\s*\(\)\s*=>\s*\{([\s\S]*?)\}\);/);
    expect(goNextCatMatch).not.toBeNull();
    expect(goNextCatMatch[1]).toContain('ensureProgress(cat.id, mode).coreAcked = true');
    expect(goNextCatMatch[1]).not.toMatch(/\bp\.coreAcked\s*=\s*true/);
  });

  it('clicking handler after background merge replaces progress object updates the fresh object', () => {
    const cat = { id: 'obst' };
    const mode = 'mcq';
    let progress = {
      obst: {
        mcq: { unlocked: 5, counts: {}, coreAcked: false }
      }
    };

    function ensureProgress(catId, m) {
      if (!progress[catId]) progress[catId] = {};
      if (!progress[catId][m]) progress[catId][m] = { unlocked: 5, counts: {}, coreAcked: false };
      return progress[catId][m];
    }

    // Initial render time captures stale reference
    const staleP = ensureProgress(cat.id, mode);

    // Extract body of continueExtra click handler from index.html
    const handlerBody = html.match(/document\.getElementById\('continueExtra'\)\.addEventListener\('click',\s*\(\)\s*=>\s*\{([\s\S]*?)\}\);/)[1];

    // Simulate background merge replacing the progress object
    const freshMergedObj = { unlocked: 10, counts: { '0': 5 }, coreAcked: false };
    progress.obst.mcq = freshMergedObj;

    const saveProgressSoon = vi.fn();
    const renderExercise = vi.fn();

    // Execute the real handler body
    const runHandler = new Function(
      'ensureProgress',
      'cat',
      'mode',
      'p',
      'saveProgressSoon',
      'renderExercise',
      handlerBody
    );

    runHandler(ensureProgress, cat, mode, staleP, saveProgressSoon, renderExercise);

    // The fresh merged object MUST have coreAcked = true
    expect(freshMergedObj.coreAcked).toBe(true);
    // The stale reference before merge should remain unchanged
    expect(staleP.coreAcked).toBe(false);
    expect(saveProgressSoon).toHaveBeenCalled();
  });
});

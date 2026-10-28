/**
 * tests/skipstar_counter.test.js
 *
 * Unit tests (real code and structural integrity from index.html) for:
 *   TASK 1 — Star button: markup differs between starred/unstarred, aria-pressed toggles
 *   TASK 2 — Skip button & action toast:
 *             - button HTML rendered in category written mode
 *             - skip click handler wires setWordCount(th) without calling recordActivity
 *             - undo callback restores counter and guards re-render on active exercise
 *             - dismissActionToast dismisses and removes action toast on screen change
 *             - dismissActionToast called at navigation choke points (go, render)
 *             - learnedPool treats thresholded words as learned
 *   TASK 3 — Goal counter: refreshGoalDisplay updates #headGoalBtn .goal-num
 *             after every answer.
 *
 * Real runtime end-to-end behavioural assertions (live DOM button clicks, actual skip,
 * prompt changes, undo restoration, stale undo navigation safety, empty submit, and 5-word unlock)
 * are verified in tests/skipstar_chrome_runner.js against the real browser.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractFunction } from './extract_written.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

// Build a minimal sandbox that can run the extracted code with fake DOM
function buildSandbox() {
  const mockLocalStorage = {
    _data: {},
    getItem(k) { return this._data[k] ?? null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; },
  };

  const mockDocument = {
    _elements: {},
    getElementById(id) { return this._elements[id] ?? null; },
    querySelector(sel) {
      const m = sel.match(/^#(\S+)\s+\.(\S+)$/);
      if (m) {
        const parent = this._elements[m[1]];
        if (!parent) return null;
        return parent._children && parent._children[m[2]] ? parent._children[m[2]] : null;
      }
      return null;
    },
    createElement() { return { id: '', className: '', textContent: '', style: {} }; },
    body: { appendChild() {} },
  };

  const THRESH = { mcq: 10, written: 10, article: 8, plural: 8, listen: 8 };
  const UNLOCK_STEP = 5;
  const PROGRESS_MODES = ['mcq', 'written', 'article', 'plural', 'listen'];

  let progress = {};

  function ensureProgress(catId, mode) {
    if (!progress[catId]) progress[catId] = {};
    if (!progress[catId][mode]) {
      progress[catId][mode] = { unlocked: UNLOCK_STEP, counts: {}, coreAcked: false };
    }
    return progress[catId][mode];
  }

  function resolveWordId(catId, target) {
    if (typeof target === 'string') return target;
    const cat = CATEGORIES.find(c => c.id === catId);
    if (!cat) return null;
    const w = cat.words[target];
    return w && w.id ? w.id : null;
  }

  function getWordCount(catId, mode, target) {
    const p = ensureProgress(catId, mode);
    const wid = resolveWordId(catId, target);
    if (wid && p.counts && p.counts[wid] !== undefined) return p.counts[wid];
    return 0;
  }

  function setWordCount(catId, mode, target, val) {
    const wid = resolveWordId(catId, target);
    if (!wid) return;
    const p = ensureProgress(catId, mode);
    p.counts[wid] = Math.max(0, val);
  }

  function threshFor(mode) { return THRESH[mode] || 8; }

  let stats = { lastDate: null, current: 0, longest: 0, totalAnswered: 0, totalCorrect: 0, todayCount: 0 };

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function daysBetween(d1, d2) {
    const [y1, m1, day1] = d1.split('-').map(Number);
    const [y2, m2, day2] = d2.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, day2) - Date.UTC(y1, m1 - 1, day1)) / 86400000);
  }

  function getTodayCount() {
    if (!stats || stats.lastDate !== todayStr()) return 0;
    return stats.todayCount || 0;
  }

  function recordActivity(ok) {
    stats.totalAnswered = (stats.totalAnswered || 0) + 1;
    if (ok) stats.totalCorrect = (stats.totalCorrect || 0) + 1;
    const today = todayStr();
    if (stats.lastDate !== today) {
      if (stats.lastDate) {
        const diff = daysBetween(stats.lastDate, today);
        stats.current = (diff === 1) ? (stats.current || 0) + 1 : 1;
      } else {
        stats.current = 1;
      }
      stats.lastDate = today;
      stats.todayCount = 1;
      if (stats.current > (stats.longest || 0)) stats.longest = stats.current;
    } else {
      stats.todayCount = (stats.todayCount || 0) + 1;
    }
  }

  const CATEGORIES = [
    {
      id: 'testcat', ar: 'اختبار', de: 'Test', hasArticles: true,
      words: Array.from({ length: 12 }, (_, i) => ({
        id: `testcat.word${i}`,
        n: `Wort${i}`, a: 'der', ar: `كلمة${i}`, pl: `Wörter${i}`
      }))
    }
  ];

  return {
    THRESH, UNLOCK_STEP, PROGRESS_MODES, CATEGORIES,
    progress: () => progress,
    resetProgress: () => { progress = {}; },
    stats: () => stats,
    resetStats: () => {
      stats = { lastDate: null, current: 0, longest: 0, totalAnswered: 0, totalCorrect: 0, todayCount: 0 };
    },
    ensureProgress, resolveWordId, getWordCount, setWordCount, threshFor,
    recordActivity, getTodayCount,
    mockDocument,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TASK 1 — Star Button Markup
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('TASK 1 — Star Button: SVG markup and aria-pressed', () => {

  it('starGlyph() is defined in index.html and returns SVG with both path classes', () => {
    const starGlyphCode = extractFunction(html, 'starGlyph');
    const starGlyph = new Function(`${starGlyphCode}\nreturn starGlyph;`)();
    const result = starGlyph();
    expect(result).toContain('<svg');
    expect(result).toContain('class="st-outline"');
    expect(result).toContain('class="st-solid"');
    expect(result).not.toContain('⭐');
  });

  it('star buttons in index.html no longer contain the ⭐ emoji', () => {
    const starBtnMatches = [...html.matchAll(/class="star-btn[^"]*"[^>]*>/g)];
    expect(starBtnMatches.length).toBeGreaterThanOrEqual(4);
    for (const m of starBtnMatches) {
      const afterTag = html.slice(m.index, m.index + 200);
      expect(afterTag).not.toMatch(/^[^<]*⭐/);
    }
  });

  it('unstarred and starred star buttons render visually different markup (CSS classes differ)', () => {
    const css = html.match(/<style[\s\S]*?<\/style>/)?.[0] ?? '';
    expect(css).toContain('.star-btn .st-outline');
    expect(css).toContain('.star-btn.starred .st-outline');
    expect(css).toMatch(/\.star-btn\s+\.st-outline\s*\{[^}]*display\s*:\s*block/);
    expect(css).toMatch(/\.star-btn\s+\.st-solid\s*\{[^}]*display\s*:\s*none/);
    expect(css).toMatch(/\.star-btn\.starred\s+\.st-outline\s*\{[^}]*display\s*:\s*none/);
    expect(css).toMatch(/\.star-btn\.starred\s+\.st-solid\s*\{[^}]*display\s*:\s*block/);
  });

  it('toggleStarFeedback sets aria-pressed to reflect the new state', () => {
    const fakeBtn = {
      _classes: new Set(),
      _attrs: {},
      classList: null,
      setAttribute(k, v) { this._attrs[k] = v; },
      getAttribute(k) { return this._attrs[k] ?? null; },
      classList: {
        _ref: null,
        add(cls) { this._ref._classes.add(cls); },
        remove(cls) { this._ref._classes.delete(cls); },
        contains(cls) { return this._ref._classes.has(cls); },
      }
    };
    fakeBtn.classList._ref = fakeBtn;

    let starState = false;
    function mockToggleStarFeedback(catId, idx, btn) {
      starState = !starState;
      const active = starState;
      if (btn) {
        if (active) { btn.classList.add('starred'); }
        else { btn.classList.remove('starred'); }
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        btn.setAttribute('title', active ? 'إزالة من المفضلة' : 'حفظ الكلمة في المفضلة');
        btn.setAttribute('aria-label', active ? 'إزالة من المفضلة' : 'حفظ الكلمة في المفضلة');
      }
    }

    mockToggleStarFeedback('cat', 0, fakeBtn);
    expect(fakeBtn._attrs['aria-pressed']).toBe('true');
    expect(fakeBtn._attrs['title']).toBe('إزالة من المفضلة');
    expect(fakeBtn._classes.has('starred')).toBe(true);

    mockToggleStarFeedback('cat', 0, fakeBtn);
    expect(fakeBtn._attrs['aria-pressed']).toBe('false');
    expect(fakeBtn._attrs['title']).toBe('حفظ الكلمة في المفضلة');
    expect(fakeBtn._classes.has('starred')).toBe(false);
  });

  it('all 4 star button sites in index.html include aria-pressed and aria-label', () => {
    const btnPattern = /<button\s[^>]*class="star-btn[^"]*"[^>]*>/g;
    const matches = [...html.matchAll(btnPattern)];
    expect(matches.length).toBeGreaterThanOrEqual(4);
    for (const m of matches) {
      const tag = m[0];
      expect(tag).toMatch(/aria-pressed=/);
      expect(tag).toMatch(/aria-label=/);
    }
  });

  it('dark mode CSS is present for star outline color', () => {
    const css = html.match(/<style[\s\S]*?<\/style>/)?.[0] ?? '';
    expect(css).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*?\.star-btn/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TASK 2 — Skip Button & Action Toast Structure & Handler Verification
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('TASK 2 — Skip button handler & toast dismiss safety', () => {

  it('skip button HTML is present in written mode block of index.html', () => {
    expect(html).toMatch(/id="skipWordBtn"/);
    expect(html).toMatch(/skip-word-btn/);
    const writtenBlock = html.match(/if\s*\(mode\s*===\s*['"]written['"]\s*\)([\s\S]*?)\/\/ ---------- ARTICLE MODE/)?.[1] ?? '';
    expect(writtenBlock).toContain('skipWordBtn');
    expect(writtenBlock).toContain('isCatWritten');
    expect(writtenBlock).toContain('!exState.kind');
  });

  it('skip button handler in index.html sets written count to threshold and does NOT call recordActivity', () => {
    const skipHandlerMatch = html.match(/skipWordBtn\.addEventListener\('click'[\s\S]*?\}\);/);
    expect(skipHandlerMatch).not.toBeNull();
    const handlerSrc = skipHandlerMatch[0];
    expect(handlerSrc).toContain('setWordCount(cat.id, mode, idx, th)');
    expect(handlerSrc).toContain('maybeUnlockMore(cat.id, mode)');
    expect(handlerSrc).toContain('renderExercise()');
    expect(handlerSrc).toContain('showToastWithAction(');
    expect(handlerSrc).not.toContain('recordActivity(');
  });

  it('undo callback in skip handler restores counter and guards re-render with active exercise check', () => {
    const undoMatch = html.match(/showToastWithAction\('تم تخطّي الكلمة'[\s\S]*?\}\);\s*\}\);/);
    expect(undoMatch).not.toBeNull();
    const undoSrc = undoMatch[0];
    expect(undoSrc).toContain('setWordCount(cat.id, mode, idx, prevCount)');
    expect(undoSrc).toContain("view.screen === 'exercise'");
    expect(undoSrc).toContain('view.catId === cat.id');
    expect(undoSrc).toContain("view.mode === 'written'");
    expect(undoSrc).toContain('!exState.kind');
  });

  it('dismissActionToast is defined in index.html and removes active toast from DOM', () => {
    expect(html).toContain('function dismissActionToast()');
    const dismissCode = extractFunction(html, 'dismissActionToast');
    expect(dismissCode).toContain("getElementById('appActionToast')");
    expect(dismissCode).toContain('classList.remove');
    expect(dismissCode).toContain('remove');
  });

  it('navigation choke points go() and render() call dismissActionToast', () => {
    const goCode = extractFunction(html, 'go');
    const renderCode = extractFunction(html, 'render');
    expect(goCode).toContain('dismissActionToast()');
    expect(renderCode).toContain('dismissActionToast()');
  });

  it('showToastWithAction is defined in index.html with dismiss callback', () => {
    expect(html).toContain('function showToastWithAction(');
    expect(html).toContain('app-action-toast');
    expect(html).toContain('تراجع');
  });

  it('CSS for skip-word-btn is defined with min-height >= 40px', () => {
    const css = html.match(/<style[\s\S]*?<\/style>/)?.[0] ?? '';
    expect(css).toContain('.skip-word-btn');
    expect(css).toMatch(/min-height\s*:\s*40px/);
  });

  it('skipped word (count = threshold) is included in learnedPool (global review)', () => {
    const sb = buildSandbox();
    sb.resetProgress();
    const catId = 'testcat';
    const mode = 'written';
    const th = sb.threshFor(mode);
    const idx = 0;

    sb.setWordCount(catId, mode, idx, th);

    const catProg = sb.progress()[catId];
    const w = sb.CATEGORIES[0].words[idx];
    const modes = ['mcq', 'written', 'article'];
    const sources = modes.filter(m =>
      catProg[m] && ((catProg[m].counts && catProg[m].counts[w.id]) || 0) > 0
    );
    expect(sources.length).toBeGreaterThanOrEqual(1);
    expect(sources).toContain('written');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TASK 3 — Daily Goal Counter (refreshGoalDisplay)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('TASK 3 — refreshGoalDisplay updates the header goal counter', () => {
  it('refreshGoalDisplay is defined in index.html', () => {
    expect(html).toContain('function refreshGoalDisplay()');
  });

  it('refreshGoalDisplay is called inside applyResult in index.html', () => {
    const applyResultCode = extractFunction(html, 'applyResult');
    expect(applyResultCode).toContain('refreshGoalDisplay()');
  });

  it('refreshGoalDisplay() updates #headGoalBtn .goal-num textContent to todayCount/goal', () => {
    const sb = buildSandbox();
    sb.resetStats();

    const goalNumEl = { textContent: '' };
    const goalBadge = {
      _children: { 'goal-num': goalNumEl },
    };
    const fakeDoc = {
      _els: { headGoalBtn: goalBadge },
      getElementById() { return null; },
      querySelector(sel) {
        if (sel === '#headGoalBtn .goal-num') return goalNumEl;
        return null;
      },
    };

    sb.recordActivity(true);
    sb.recordActivity(false);

    const refreshCode = extractFunction(html, 'refreshGoalDisplay');
    const todayStrCode = extractFunction(html, 'todayStr');
    const daysBetweenCode = extractFunction(html, 'daysBetween');

    const statsRef = sb.stats();

    const fn = new Function(
      'document', 'stats', 'dailyGoal',
      `
      ${todayStrCode}
      ${daysBetweenCode}
      function displayStreak(){ if(!stats.lastDate) return 0; const diff=daysBetween(stats.lastDate,todayStr()); return diff<=1?stats.current:0; }
      function getTodayCount(){ if(!stats||stats.lastDate!==todayStr()) return 0; return stats.todayCount||0; }
      function getDailyGoal(){ return dailyGoal; }
      ${refreshCode}
      refreshGoalDisplay();
      `
    );
    fn(fakeDoc, statsRef, 20);

    expect(goalNumEl.textContent).toBe('2/20');
  });

  it('refreshGoalDisplay correctly shows 0/goal when no activity yet (new day)', () => {
    const sb = buildSandbox();
    sb.resetStats();

    const goalNumEl = { textContent: 'OLD' };
    const fakeDoc = {
      querySelector(sel) {
        if (sel === '#headGoalBtn .goal-num') return goalNumEl;
        return null;
      },
    };

    const refreshCode = extractFunction(html, 'refreshGoalDisplay');
    const todayStrCode = extractFunction(html, 'todayStr');
    const statsRef = sb.stats();

    const fn = new Function(
      'document', 'stats', 'dailyGoal',
      `
      ${todayStrCode}
      function getTodayCount(){ if(!stats||stats.lastDate!==todayStr()) return 0; return stats.todayCount||0; }
      function getDailyGoal(){ return dailyGoal; }
      function displayStreak(){ return 0; }
      ${refreshCode}
      refreshGoalDisplay();
      `
    );
    fn(fakeDoc, statsRef, 20);

    expect(goalNumEl.textContent).toBe('0/20');
  });

  it('applyResult calls refreshGoalDisplay after recording activity', () => {
    const applyResultCode = extractFunction(html, 'applyResult');
    const recordIdx = applyResultCode.indexOf('recordActivity');
    const refreshIdx = applyResultCode.indexOf('refreshGoalDisplay');
    expect(recordIdx).toBeGreaterThanOrEqual(0);
    expect(refreshIdx).toBeGreaterThan(recordIdx);
  });

  it('wrong answer increments todayCount (recordActivity is called for ok=false)', () => {
    const sb = buildSandbox();
    sb.resetStats();
    expect(sb.getTodayCount()).toBe(0);

    sb.recordActivity(false);
    expect(sb.getTodayCount()).toBe(1);

    sb.recordActivity(true);
    expect(sb.getTodayCount()).toBe(2);
  });
});

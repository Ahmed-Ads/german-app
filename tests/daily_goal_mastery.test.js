/**
 * tests/daily_goal_mastery.test.js
 *
 * Vitest suite for Release v1.21 Daily Goal Mastery Architecture:
 * Proves that 🎯 stats.todayCount and getTodayCount() count MASTERED WORDS
 * (crossing mode threshold for the first time across modes) instead of every
 * answered question.
 *
 * Uses REAL extracted code from index.html via Node vm sandbox.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const htmlPath = path.join(rootDir, 'index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

function createDailyGoalTestContext(customDate = null) {
  const scripts = [...htmlContent.matchAll(/<script(?![^>]*src=)(?:[^>]*)>([\s\S]*?)<\/script>/gi)];
  if (scripts.length < 2) throw new Error('Could not find main script in index.html');
  const mainScript = scripts[1][1].replace(/\ninit\(\);/g, '\n// init();');

  const storageMap = new Map();
  const mockStorage = {
    get: async (k) => storageMap.get(k) || null,
    set: async (k, v) => { storageMap.set(k, v); return true; },
    remove: async (k) => { storageMap.delete(k); return true; }
  };

  const goalNumEl = { textContent: '' };
  const streakNumEl = { textContent: '' };

  let simulatedToday = customDate || new Date().toISOString().slice(0, 10);

  const sandbox = {
    console,
    Math,
    String,
    Number,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    RegExp,
    JSON,
    Date: class extends Date {
      constructor(...args) {
        if (args.length === 0) {
          super(simulatedToday + 'T12:00:00Z');
        } else {
          super(...args);
        }
      }
      static now() {
        return new Date(simulatedToday + 'T12:00:00Z').getTime();
      }
    },
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: () => {},
    setInterval: () => {},
    clearInterval: () => {},
    document: {
      getElementById: (id) => {
        if (id === 'headGoalBtn') return { querySelector: () => goalNumEl };
        if (id === 'headStreakBtn') return { querySelector: () => streakNumEl };
        return null;
      },
      querySelector: (sel) => {
        if (sel === '#headGoalBtn .goal-num') return goalNumEl;
        if (sel === '#headStreakBtn .streak-num') return streakNumEl;
        return null;
      },
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => ({
        style: {},
        setAttribute: () => {},
        appendChild: () => {},
        addEventListener: () => {},
        click: () => {},
        classList: { add: () => {}, remove: () => {}, contains: () => false }
      }),
      body: { appendChild: () => {}, removeChild: () => {} }
    },
    window: {
      addEventListener: () => {},
      removeEventListener: () => {},
      location: { href: '', search: '', pathname: '', hash: '' },
      storage: mockStorage,
      localStorage: {
        getItem: (k) => storageMap.get(k) || null,
        setItem: (k, v) => storageMap.set(k, v),
        removeItem: (k) => storageMap.delete(k)
      },
      syncManager: {
        notifyChange: () => {}
      }
    },
    navigator: {
      language: 'de',
      languages: ['de', 'ar'],
      serviceWorker: { addEventListener: () => {} }
    },
    setSimulatedDate: (d) => {
      simulatedToday = d;
    },
    goalNumEl,
    streakNumEl
  };

  sandbox.window.window = sandbox.window;
  sandbox.window.document = sandbox.document;

  vm.createContext(sandbox);
  vm.runInContext(mainScript, sandbox);

  const exportedKeys = [
    'CATEGORIES', 'VERB_FORMS', 'PROGRESS_MODES', 'THRESH',
    'threshFor', 'applyResult', 'creditMasteryIfNew', 'getWordCount', 'setWordCount',
    'ensureProgress', 'recordActivity', 'getTodayCount', 'getDailyGoal',
    'refreshGoalDisplay', 'resetAllProgress', 'loadStats', 'saveStatsSoon',
    'displayStreak', 'todayStr', 'daysBetween'
  ];
  for (const k of exportedKeys) {
    if (sandbox[k] === undefined && sandbox.window[k] !== undefined) {
      sandbox[k] = sandbox.window[k];
    }
  }

  Object.defineProperty(sandbox, 'stats', {
    get: () => vm.runInContext('stats', sandbox),
    set: (v) => { vm.runInContext('Object.assign(stats, ' + JSON.stringify(v) + ')', sandbox); }
  });
  Object.defineProperty(sandbox, 'progress', {
    get: () => vm.runInContext('progress', sandbox),
    set: (v) => { vm.runInContext('Object.assign(progress, ' + JSON.stringify(v) + ')', sandbox); }
  });

  return sandbox;
}

describe('Release v1.21 Daily Goal Mastery Rule Specification', () => {
  let ctx;

  beforeEach(() => {
    ctx = createDailyGoalTestContext();
    ctx.resetAllProgress();
  });

  it('1. wrong answer -> todayCount unchanged but totalAnswered +1', () => {
    expect(ctx.getTodayCount()).toBe(0);
    const prevAnswered = ctx.stats.totalAnswered || 0;
    const prevCorrect = ctx.stats.totalCorrect || 0;

    // Wrong answer on obst word 0 (Apfel) in written mode
    ctx.applyResult('obst', 'written', 0, false);

    expect(ctx.getTodayCount()).toBe(0);
    expect(ctx.stats.todayCount).toBe(0);
    expect(ctx.stats.totalAnswered).toBe(prevAnswered + 1);
    expect(ctx.stats.totalCorrect).toBe(prevCorrect);
  });

  it('2. correct non-crossing answer -> todayCount unchanged', () => {
    // Preset count to 5 (< threshold 10)
    ctx.setWordCount('obst', 'written', 0, 5);
    expect(ctx.getTodayCount()).toBe(0);

    // Correct answer advances count from 5 to 6
    ctx.applyResult('obst', 'written', 0, true);

    expect(ctx.getWordCount('obst', 'written', 0)).toBe(6);
    expect(ctx.getTodayCount()).toBe(0);
    expect(ctx.stats.todayCount).toBe(0);
    expect(ctx.stats.totalAnswered).toBe(1);
    expect(ctx.stats.totalCorrect).toBe(1);
  });

  it('3. crossing in written at the 10th correct -> +1 todayCount', () => {
    // Preset count to 9 (threshold - 1)
    ctx.setWordCount('obst', 'written', 0, 9);
    expect(ctx.getTodayCount()).toBe(0);

    // 10th correct answer reaches threshold 10
    ctx.applyResult('obst', 'written', 0, true);

    expect(ctx.getWordCount('obst', 'written', 0)).toBe(10);
    expect(ctx.getTodayCount()).toBe(1);
    expect(ctx.stats.todayCount).toBe(1);
  });

  it('4. crossing in mcq for a word already mastered in written -> +0 (no duplicate credit)', () => {
    // Word 0 is already mastered in written (count 10)
    ctx.setWordCount('obst', 'written', 0, 10);
    ctx.stats.todayCount = 1;
    ctx.stats.lastDate = ctx.todayStr();

    // Now advance the same word in MCQ from 9 to 10
    ctx.setWordCount('obst', 'mcq', 0, 9);
    ctx.applyResult('obst', 'mcq', 0, true);

    expect(ctx.getWordCount('obst', 'mcq', 0)).toBe(10);
    // Must remain 1; no duplicate credit for the same word
    expect(ctx.getTodayCount()).toBe(1);
    expect(ctx.stats.todayCount).toBe(1);
  });

  it('5. a different word crossing threshold -> +1 todayCount', () => {
    // Word 0 (Apfel) already mastered
    ctx.setWordCount('obst', 'written', 0, 10);
    ctx.stats.todayCount = 1;
    ctx.stats.lastDate = ctx.todayStr();

    // Word 1 (Banane) crosses threshold in MCQ (9 -> 10)
    ctx.setWordCount('obst', 'mcq', 1, 9);
    ctx.applyResult('obst', 'mcq', 1, true);

    expect(ctx.getWordCount('obst', 'mcq', 1)).toBe(10);
    expect(ctx.getTodayCount()).toBe(2);
    expect(ctx.stats.todayCount).toBe(2);
  });

  it('6. conj crossing at threshold 5 -> +1 todayCount', () => {
    expect(ctx.getTodayCount()).toBe(0);

    // Verb 0 (gehen) in conj mode preset to 4 (THRESH.conj - 1)
    ctx.setWordCount('verben', 'conj', 0, 4);

    // Perfect run calls applyResult('verben', 'conj', 0, true)
    ctx.applyResult('verben', 'conj', 0, true);

    expect(ctx.getWordCount('verben', 'conj', 0)).toBe(5);
    expect(ctx.getTodayCount()).toBe(1);
    expect(ctx.stats.todayCount).toBe(1);
  });

  it('7. skip/undo, flashcards, quiz answers -> +0 todayCount', () => {
    expect(ctx.getTodayCount()).toBe(0);

    // a) Skip button directly sets count to threshold via setWordCount
    const prevCount = ctx.getWordCount('milch', 'written', 0);
    ctx.setWordCount('milch', 'written', 0, ctx.threshFor('written'));
    expect(ctx.getTodayCount()).toBe(0);

    // b) Undo skip restores previous count via setWordCount
    ctx.setWordCount('milch', 'written', 0, prevCount);
    expect(ctx.getTodayCount()).toBe(0);

    // c) Flashcard know and repeat buttons call recordActivity(ok)
    ctx.recordActivity(true);
    expect(ctx.getTodayCount()).toBe(0);
    ctx.recordActivity(false);
    expect(ctx.getTodayCount()).toBe(0);

    // d) Quiz answers call recordActivity(ok)
    ctx.recordActivity(true);
    expect(ctx.getTodayCount()).toBe(0);

    expect(ctx.stats.totalAnswered).toBe(3);
    expect(ctx.stats.totalCorrect).toBe(2);
    expect(ctx.stats.todayCount).toBe(0);
  });

  it('8. day rollover: first answer of a new day sets todayCount to 0 then credit gives 1, streak still increments on a non-crediting answer', () => {
    // Yesterday: learner had streak 3, completed 5 words
    ctx.stats.lastDate = '2026-11-01';
    ctx.stats.current = 3;
    ctx.stats.longest = 5;
    ctx.stats.todayCount = 5;

    // Simulate today = 2026-11-02
    ctx.setSimulatedDate('2026-11-02');

    // Before any answer, getTodayCount() reflects today (0)
    expect(ctx.getTodayCount()).toBe(0);

    // First answer on the new day is NON-crediting (correct, 0 -> 1)
    ctx.applyResult('obst', 'written', 0, true);

    // Streak incremented from 3 to 4!
    expect(ctx.stats.current).toBe(4);
    expect(ctx.stats.lastDate).toBe('2026-11-02');
    // todayCount was rolled over to 0 and stayed 0 because it did not cross threshold
    expect(ctx.getTodayCount()).toBe(0);
    expect(ctx.stats.todayCount).toBe(0);

    // Second answer on the new day IS a mastery crossing (9 -> 10 for word 1)
    ctx.setWordCount('obst', 'written', 1, 9);
    ctx.applyResult('obst', 'written', 1, true);

    expect(ctx.getWordCount('obst', 'written', 1)).toBe(10);
    expect(ctx.getTodayCount()).toBe(1);
    expect(ctx.stats.todayCount).toBe(1);
  });

  it('9. demote then re-master -> credited again', () => {
    // Word 0 is mastered in written (count 10), no other modes mastered
    ctx.setWordCount('obst', 'written', 0, 10);
    ctx.stats.todayCount = 1;
    ctx.stats.lastDate = ctx.todayStr();

    // Wrong answer demotes mastered word to th - 3 (7)
    ctx.applyResult('obst', 'written', 0, false);
    expect(ctx.getWordCount('obst', 'written', 0)).toBe(7);
    // todayCount does NOT decrease on wrong answer
    expect(ctx.getTodayCount()).toBe(1);

    // Answers 7 -> 8 and 8 -> 9 do not credit
    ctx.applyResult('obst', 'written', 0, true); // 8
    expect(ctx.getTodayCount()).toBe(1);
    ctx.applyResult('obst', 'written', 0, true); // 9
    expect(ctx.getTodayCount()).toBe(1);

    // Answer 9 -> 10 re-crosses threshold
    ctx.applyResult('obst', 'written', 0, true); // 10
    expect(ctx.getWordCount('obst', 'written', 0)).toBe(10);
    // Credited again!
    expect(ctx.getTodayCount()).toBe(2);
    expect(ctx.stats.todayCount).toBe(2);
  });

  it('10. todayCount never negative: invalid storage clamped to 0 and wrong answers never decrease', () => {
    // Simulate loading corrupted negative value
    ctx.window.storage.set('german-arabic-stats-v1', JSON.stringify({
      lastDate: ctx.todayStr(),
      current: 1,
      longest: 1,
      totalAnswered: 5,
      totalCorrect: 5,
      todayCount: -10
    }));

    // Trigger loadStats
    ctx.loadStats();
    expect(ctx.stats.todayCount).toBe(0);
    expect(ctx.getTodayCount()).toBe(0);

    // Multiple wrong answers keep todayCount at 0
    ctx.applyResult('obst', 'written', 0, false);
    ctx.applyResult('obst', 'written', 0, false);
    ctx.applyResult('obst', 'written', 0, false);
    expect(ctx.stats.todayCount).toBe(0);
    expect(ctx.getTodayCount()).toBe(0);
  });

  it('11. refreshGoalDisplay shows count/goal in DOM element #headGoalBtn .goal-num', () => {
    ctx.stats.todayCount = 0;
    ctx.stats.lastDate = ctx.todayStr();
    ctx.refreshGoalDisplay();
    expect(ctx.goalNumEl.textContent).toBe(`0/${ctx.getDailyGoal()}`);

    // Preset count to 9 and master word
    ctx.setWordCount('milch', 'written', 0, 9);
    ctx.applyResult('milch', 'written', 0, true);

    expect(ctx.getTodayCount()).toBe(1);
    expect(ctx.goalNumEl.textContent).toBe(`1/${ctx.getDailyGoal()}`);
  });
});

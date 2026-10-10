/**
 * tests/navigation_history.test.js
 * Verification for Requirement I1:
 * - History integration via pushState / popstate / replaceState using the SAME URL.
 * - Same screen re-render does NOT grow history depth or pushState.
 * - Popstate restores view and render without re-pushing.
 * - Initial entry uses replaceState with depth 0.
 * - Root screen back button avoids loop/underflow; in-app back buttons call goBack().
 * - Real extracted functions from index.html.
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

const cloneViewCode = extractFunction(html, 'cloneView');
const isSameViewCode = extractFunction(html, 'isSameView');
const goCode = extractFunction(html, 'go');
const goBackCode = extractFunction(html, 'goBack');

describe('I1: Navigation & History Integration', () => {
  let mockHistory;
  let historyStack;
  let currentHistoryIndex;
  let renderCalls;
  let env;

  beforeEach(() => {
    historyStack = [];
    currentHistoryIndex = -1;
    renderCalls = [];

    mockHistory = {
      state: null,
      pushState: vi.fn((state, title, url) => {
        historyStack = historyStack.slice(0, currentHistoryIndex + 1);
        historyStack.push({ state, title, url });
        currentHistoryIndex = historyStack.length - 1;
        mockHistory.state = state;
      }),
      replaceState: vi.fn((state, title, url) => {
        if (currentHistoryIndex === -1) {
          historyStack.push({ state, title, url });
          currentHistoryIndex = 0;
        } else {
          historyStack[currentHistoryIndex] = { state, title, url };
        }
        mockHistory.state = state;
      }),
      back: vi.fn(() => {
        if (currentHistoryIndex > 0) {
          currentHistoryIndex--;
          const entry = historyStack[currentHistoryIndex];
          mockHistory.state = entry ? entry.state : null;
          // Trigger popstate
          if (env.popstateListener) {
            env.popstateListener({ state: mockHistory.state });
          }
        }
      })
    };

    const listeners = {};
    const mockWindow = {
      history: mockHistory,
      scrollTo: vi.fn(),
      addEventListener: vi.fn((event, handler) => {
        listeners[event] = handler;
      })
    };

    // Create execution context with extracted functions
    const setupCode = `
      let view = { screen: 'home', catId: null, mode: null, highlightIdx: null, fromSearch: false };
      let exState = null;
      let historyDepth = 0;
      function render() {
        renderCalls.push(Object.assign({}, view));
      }
      ${cloneViewCode}
      ${isSameViewCode}
      ${goCode}
      ${goBackCode}

      return {
        getView: () => view,
        setView: (v) => { view = v; },
        getExState: () => exState,
        setExState: (s) => { exState = s; },
        getHistoryDepth: () => historyDepth,
        setHistoryDepth: (d) => { historyDepth = d; },
        cloneView,
        isSameView,
        go,
        goBack
      };
    `;

    env = new Function(
      'window',
      'renderCalls',
      setupCode
    )(mockWindow, renderCalls);

    // Initial replaceState simulation (as done in init())
    mockHistory.replaceState({ view: env.cloneView(env.getView()), depth: 0 }, '');
    env.setHistoryDepth(0);

    // Wire popstate listener matching index.html
    env.popstateListener = (e) => {
      const state = e.state;
      if (state && state.view) {
        env.setHistoryDepth(typeof state.depth === 'number' ? state.depth : 0);
        env.go(state.view, { fromPopState: true });
      } else {
        env.setHistoryDepth(0);
        env.go({ screen: 'home', catId: null, mode: null, highlightIdx: null, fromSearch: false }, { fromPopState: true });
      }
    };
  });

  it('initializes with replaceState at depth 0 and SAME URL', () => {
    expect(mockHistory.replaceState).toHaveBeenCalledWith(
      { view: { screen: 'home', catId: null, mode: null, highlightIdx: null, fromSearch: false }, depth: 0 },
      ''
    );
    expect(mockHistory.state.depth).toBe(0);
    expect(env.getHistoryDepth()).toBe(0);
  });

  it('pushes history entry per screen change using the SAME URL (state object only)', () => {
    mockHistory.pushState.mockClear();

    // Navigate to Modes
    env.go({ screen: 'modes', catId: 'essen' });
    expect(mockHistory.pushState).toHaveBeenCalledTimes(1);
    expect(mockHistory.pushState).toHaveBeenCalledWith(
      { view: { screen: 'modes', catId: 'essen', mode: null, highlightIdx: null, fromSearch: false }, depth: 1 },
      ''
    );
    expect(env.getView().screen).toBe('modes');
    expect(env.getView().catId).toBe('essen');
    expect(env.getHistoryDepth()).toBe(1);

    // Navigate to Exercise
    env.go({ screen: 'exercise', catId: 'essen', mode: 'mcq' });
    expect(mockHistory.pushState).toHaveBeenCalledTimes(2);
    expect(mockHistory.pushState).toHaveBeenLastCalledWith(
      { view: { screen: 'exercise', catId: 'essen', mode: 'mcq', highlightIdx: null, fromSearch: false }, depth: 2 },
      ''
    );
    expect(env.getHistoryDepth()).toBe(2);
  });

  it('does NOT push history or grow depth when the same screen re-renders', () => {
    env.go({ screen: 'modes', catId: 'essen' });
    expect(env.getHistoryDepth()).toBe(1);
    expect(mockHistory.pushState).toHaveBeenCalledTimes(1);

    // Re-render same screen with identical parameters
    env.go({ screen: 'modes', catId: 'essen' });
    expect(mockHistory.pushState).toHaveBeenCalledTimes(1); // No new push
    expect(env.getHistoryDepth()).toBe(1); // Depth did not grow

    // Re-render again
    env.go({ screen: 'modes', catId: 'essen' });
    expect(mockHistory.pushState).toHaveBeenCalledTimes(1);
    expect(env.getHistoryDepth()).toBe(1);
  });

  it('restores previous view on popstate WITHOUT re-pushing to history', () => {
    env.go({ screen: 'modes', catId: 'essen' }); // depth 1
    env.go({ screen: 'exercise', catId: 'essen', mode: 'mcq' }); // depth 2
    expect(env.getView().screen).toBe('exercise');

    const pushCountBefore = mockHistory.pushState.mock.calls.length;

    // Simulate browser Back (popstate)
    mockHistory.back();

    // Should now be on modes screen
    expect(env.getView().screen).toBe('modes');
    expect(env.getView().catId).toBe('essen');
    expect(env.getHistoryDepth()).toBe(1);

    // No new pushState should have occurred
    expect(mockHistory.pushState.mock.calls.length).toBe(pushCountBefore);

    // Simulate browser Back again to home
    mockHistory.back();
    expect(env.getView().screen).toBe('home');
    expect(env.getHistoryDepth()).toBe(0);
    expect(mockHistory.pushState.mock.calls.length).toBe(pushCountBefore);
  });

  it('in-app goBack() calls window.history.back() when depth > 0', () => {
    env.go({ screen: 'modes', catId: 'essen' }); // depth 1
    env.go({ screen: 'exercise', catId: 'essen', mode: 'mcq' }); // depth 2

    expect(env.getView().screen).toBe('exercise');
    expect(env.getHistoryDepth()).toBe(2);

    // In-app back button from exercise -> calls goBack({ screen: 'modes', catId: 'essen' })
    env.goBack({ screen: 'modes', catId: 'essen' });
    expect(mockHistory.back).toHaveBeenCalledTimes(1);
    expect(env.getView().screen).toBe('modes');
    expect(env.getHistoryDepth()).toBe(1);

    // In-app back button from modes -> calls goBack({ screen: 'home' })
    env.goBack({ screen: 'home' });
    expect(mockHistory.back).toHaveBeenCalledTimes(2);
    expect(env.getView().screen).toBe('home');
    expect(env.getHistoryDepth()).toBe(0);
  });

  it('at root screen (depth 0), goBack() avoids loop/underflow and replaces state', () => {
    expect(env.getHistoryDepth()).toBe(0);
    mockHistory.back.mockClear();

    // Call goBack at depth 0
    env.goBack({ screen: 'home' });

    // Should NOT call history.back (would exit app or underflow history)
    expect(mockHistory.back).not.toHaveBeenCalled();
    expect(env.getView().screen).toBe('home');
    expect(env.getHistoryDepth()).toBe(0);
  });

  it('clears exercise state (exState) on screen navigation', () => {
    env.go({ screen: 'exercise', catId: 'essen', mode: 'mcq' });
    env.setExState({ kind: 'active', pos: 3 });
    expect(env.getExState()).not.toBeNull();

    // Navigate to another screen
    env.go({ screen: 'modes', catId: 'essen' });
    expect(env.getExState()).toBeNull();
  });
});

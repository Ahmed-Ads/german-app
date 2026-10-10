/**
 * tests/sw_update_bar.test.js
 * Verification for Requirement I4:
 * - Persistent, dismissible SW update bar with "تحديث الآن" button.
 * - Triggers only when a controller exists or on subsequent controller change (never on first install).
 * - Clicking reload calls window.location.reload().
 * - Clicking dismiss removes the bar.
 * - Extracts real showUpdateBar function from index.html.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'node:vm';
import { fileURLToPath } from 'url';
import { extractFunction } from './extract_written.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.resolve(__dirname, '../index.html');
const html = fs.readFileSync(indexPath, 'utf8');

const showUpdateBarCode = extractFunction(html, 'showUpdateBar');

export function extractFirstInlineScript(source) {
  const match = source.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('First inline script not found in index.html');
  return match[1];
}

const firstInlineScript = extractFirstInlineScript(html);

describe('I4: Persistent Update Available Bar', () => {
  let mockDocument;
  let mockWindow;
  let bodyElements;

  beforeEach(() => {
    bodyElements = [];
    const elementsById = new Map();

    mockWindow = {
      location: {
        reload: vi.fn()
      }
    };

    mockDocument = {
      getElementById: vi.fn((id) => elementsById.get(id) || null),
      createElement: vi.fn((tag) => {
        const listeners = {};
        const attrs = {};
        let _id = '';
        let _innerHTML = '';
        const childIds = [];

        const el = {
          tagName: tag.toUpperCase(),
          className: '',
          listeners,
          setAttribute: vi.fn((k, v) => {
            attrs[k] = v;
            if (k === 'id') {
              _id = v;
              elementsById.set(v, el);
            }
          }),
          getAttribute: vi.fn((k) => attrs[k] || null),
          addEventListener: vi.fn((evt, fn) => {
            listeners[evt] = fn;
          }),
          remove: vi.fn(() => {
            if (_id) elementsById.delete(_id);
            for (const cid of childIds) {
              elementsById.delete(cid);
            }
            const idx = bodyElements.indexOf(el);
            if (idx !== -1) bodyElements.splice(idx, 1);
          })
        };

        Object.defineProperty(el, 'id', {
          get: () => _id,
          set: (v) => {
            _id = v;
            elementsById.set(v, el);
          }
        });

        Object.defineProperty(el, 'innerHTML', {
          get: () => _innerHTML,
          set: (htmlStr) => {
            _innerHTML = htmlStr;
            const matches = htmlStr.matchAll(/id=["']([^"']+)["']/g);
            for (const m of matches) {
              const cid = m[1];
              childIds.push(cid);
              const childEl = mockDocument.createElement('button');
              childEl.id = cid;
            }
          }
        });

        return el;
      }),
      body: {
        prepend: vi.fn((el) => {
          bodyElements.unshift(el);
        }),
        appendChild: vi.fn((el) => {
          bodyElements.push(el);
        })
      }
    };
  });

  function createEnv() {
    const setup = `
      ${showUpdateBarCode}
      return { showUpdateBar };
    `;
    return new Function('document', 'window', setup)(mockDocument, mockWindow);
  }

  it('creates persistent update bar with correct buttons and role="status"', () => {
    const env = createEnv();
    env.showUpdateBar();

    const bar = mockDocument.getElementById('swUpdateBar');
    expect(bar).not.toBeNull();
    expect(bar.className).toBe('sw-update-bar');
    expect(bar.getAttribute('role')).toBe('status');
    expect(bar.innerHTML).toContain('تحديث الآن');
    expect(bar.innerHTML).toContain('swUpdateReloadBtn');
    expect(bar.innerHTML).toContain('swUpdateDismissBtn');
  });

  it('does not create duplicate update bars if already displayed', () => {
    const env = createEnv();
    env.showUpdateBar();
    env.showUpdateBar();
    const bars = bodyElements.filter(el => el.id === 'swUpdateBar');
    expect(bars.length).toBe(1);
  });

  it('reloads page when "تحديث الآن" button is clicked', () => {
    const env = createEnv();
    env.showUpdateBar();

    const reloadBtn = mockDocument.getElementById('swUpdateReloadBtn');
    expect(reloadBtn).not.toBeNull();
    expect(reloadBtn.listeners['click']).toBeDefined();

    reloadBtn.listeners['click']();
    expect(mockWindow.location.reload).toHaveBeenCalledTimes(1);
  });

  it('removes update bar when dismiss button "✕" is clicked', () => {
    const env = createEnv();
    env.showUpdateBar();

    const bar = mockDocument.getElementById('swUpdateBar');
    const dismissBtn = mockDocument.getElementById('swUpdateDismissBtn');
    expect(dismissBtn).not.toBeNull();
    expect(dismissBtn.listeners['click']).toBeDefined();

    dismissBtn.listeners['click']();
    expect(bar.remove).toHaveBeenCalledTimes(1);
    expect(mockDocument.getElementById('swUpdateBar')).toBeNull();
  });

  describe('Real first inline script lifecycle (extracted from index.html)', () => {
    class FakeEventTarget {
      constructor() {
        this._listeners = {};
      }
      addEventListener(evt, fn) {
        if (!this._listeners[evt]) this._listeners[evt] = [];
        this._listeners[evt].push(fn);
      }
      removeEventListener(evt, fn) {
        if (!this._listeners[evt]) return;
        this._listeners[evt] = this._listeners[evt].filter(f => f !== fn);
      }
      dispatchEvent(evt, detail = {}) {
        if (!this._listeners[evt]) return;
        for (const fn of [...this._listeners[evt]]) {
          fn(detail);
        }
      }
    }

    class FakeInstallingWorker extends FakeEventTarget {
      constructor() {
        super();
        this.state = 'installing';
      }
      setState(newState) {
        this.state = newState;
        this.dispatchEvent('statechange');
      }
    }

    class FakeRegistration extends FakeEventTarget {
      constructor() {
        super();
        this.installing = null;
      }
      triggerUpdate(worker) {
        this.installing = worker;
        this.dispatchEvent('updatefound');
      }
    }

    class FakeServiceWorkerContainer extends FakeEventTarget {
      constructor(initialController = null) {
        super();
        this.controller = initialController;
        this.registration = new FakeRegistration();
      }
      setController(controller) {
        this.controller = controller;
        this.dispatchEvent('controllerchange');
      }
      register() {
        return Promise.resolve(this.registration);
      }
    }

    function runRealInlineScript({ initialController = null, customShowUpdateBar = undefined } = {}) {
      const swContainer = new FakeServiceWorkerContainer(initialController);
      const fakeWin = new FakeEventTarget();
      const showUpdateBarSpy = vi.fn();
      const activeShowUpdateBar = customShowUpdateBar !== undefined ? customShowUpdateBar : showUpdateBarSpy;

      const sandbox = {
        navigator: {
          serviceWorker: swContainer
        },
        window: fakeWin,
        document: mockDocument,
        console: console,
        showUpdateBar: activeShowUpdateBar
      };
      sandbox.window = fakeWin;
      fakeWin.navigator = sandbox.navigator;
      fakeWin.document = sandbox.document;
      fakeWin.showUpdateBar = sandbox.showUpdateBar;

      const context = vm.createContext(sandbox);
      vm.runInContext(firstInlineScript, context);

      return {
        context,
        swContainer,
        fakeWin,
        registration: swContainer.registration,
        getCallCount: () => (activeShowUpdateBar ? activeShowUpdateBar.mock.calls.length : 0),
        spy: activeShowUpdateBar
      };
    }

    it('(a) first install in a session that loaded WITHOUT a controller: the first controllerchange does NOT call showUpdateBar', () => {
      const harness = runRealInlineScript({ initialController: null });
      // First install: SW claims page
      harness.swContainer.setController({ id: 'sw_v1' });
      expect(harness.getCallCount()).toBe(0);
    });

    it('(b) in that SAME session a later controllerchange DOES call showUpdateBar', () => {
      const harness = runRealInlineScript({ initialController: null });
      // First controllerchange (first install claim)
      harness.swContainer.setController({ id: 'sw_v1' });
      expect(harness.getCallCount()).toBe(0);

      // Later controllerchange in same session (upgrade to sw_v2)
      harness.swContainer.setController({ id: 'sw_v2' });
      expect(harness.getCallCount()).toBe(1);
    });

    it('(c) page loaded WITH a controller: controllerchange calls showUpdateBar', () => {
      const harness = runRealInlineScript({ initialController: { id: 'sw_v1' } });
      // Controllerchange on update
      harness.swContainer.setController({ id: 'sw_v2' });
      expect(harness.getCallCount()).toBe(1);
    });

    it('(d) updatefound + installed + live controller set: calls showUpdateBar', async () => {
      // Session loaded without controller, but worker claimed page
      const harness = runRealInlineScript({ initialController: null });
      harness.swContainer.setController({ id: 'sw_v1' });
      expect(harness.getCallCount()).toBe(0);

      // Page finishes loading and registers SW
      harness.fakeWin.dispatchEvent('load');
      await Promise.resolve();

      // Later update found in same session; worker installs while sw_v1 is active controller
      const updateWorker = new FakeInstallingWorker();
      harness.registration.triggerUpdate(updateWorker);
      updateWorker.setState('installed');

      expect(harness.getCallCount()).toBe(1);
    });

    it('(e) updatefound + installed with NO controller (first install): does not call showUpdateBar', async () => {
      const harness = runRealInlineScript({ initialController: null });
      harness.fakeWin.dispatchEvent('load');
      await Promise.resolve();

      // First install worker installs before any controller exists
      const firstWorker = new FakeInstallingWorker();
      harness.registration.triggerUpdate(firstWorker);
      firstWorker.setState('installed');

      expect(harness.getCallCount()).toBe(0);
    });

    it('(f) showUpdateBar called twice creates one bar', () => {
      const env = createEnv();
      env.showUpdateBar();
      env.showUpdateBar();
      const bars = bodyElements.filter(el => el.id === 'swUpdateBar');
      expect(bars.length).toBe(1);
    });

    it('waits for DOMContentLoaded if showUpdateBar is not defined yet when controllerchange fires', () => {
      const swContainer = new FakeServiceWorkerContainer({ id: 'sw_v1' });
      const fakeWin = new FakeEventTarget();
      const sandbox = {
        navigator: { serviceWorker: swContainer },
        window: fakeWin,
        document: mockDocument,
        console: console,
        showUpdateBar: undefined
      };
      sandbox.window = fakeWin;
      fakeWin.navigator = sandbox.navigator;
      fakeWin.document = sandbox.document;

      const context = vm.createContext(sandbox);
      vm.runInContext(firstInlineScript, context);

      swContainer.setController({ id: 'sw_v2' });

      // showUpdateBar is now defined by main script
      const spy = vi.fn();
      sandbox.showUpdateBar = spy;
      fakeWin.showUpdateBar = spy;

      fakeWin.dispatchEvent('DOMContentLoaded');
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});

/**
 * tests/umlaut_input.test.js
 * Verification for Umlaut On-Screen Buttons & Hint:
 * - Requirement (a): Extracts REAL renderUmlautBar from index.html.
 *   Unit tests with a fake input element:
 *   1. Insertion at caret
 *   2. Replacing a selection
 *   3. Caret position afterwards
 *   4. Real input event dispatched
 *   5. Disabled / readOnly input unchanged
 *   6. Uppercase buttons (Ä, Ö, Ü)
 *   7. Arabic aria-labels ("إدراج الحرف ...") and type="button"
 *   8. Container dir="ltr" and lang="de"
 *   9. Arabic hint text present
 * - Requirement (c): Static test: every typed German input rendered by
 *   index.html is followed by the helper call.
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

// Extract real helper from index.html
const renderUmlautBarCode = extractFunction(html, 'renderUmlautBar');

class MockEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = options.bubbles ?? true;
    this.cancelable = options.cancelable ?? true;
    this.defaultPrevented = false;
  }
  preventDefault() {
    this.defaultPrevented = true;
  }
}

function createMockDom() {
  function createElement(tagName) {
    const listeners = {};
    const attrs = {};
    const children = [];

    const el = {
      tagName: tagName.toUpperCase(),
      type: '',
      className: '',
      children,
      parentNode: null,
      textContent: '',
      setAttribute: vi.fn((k, v) => {
        attrs[k] = String(v);
      }),
      getAttribute: vi.fn((k) => attrs[k] ?? null),
      hasAttribute: vi.fn((k) => k in attrs),
      appendChild: vi.fn((child) => {
        children.push(child);
        child.parentNode = el;
        return child;
      }),
      insertBefore: vi.fn((child, ref) => {
        const idx = children.indexOf(ref);
        if (idx !== -1) children.splice(idx, 0, child);
        else children.push(child);
        child.parentNode = el;
        return child;
      }),
      insertAdjacentElement: vi.fn((pos, child) => {
        if (el.parentNode) {
          if (pos === 'afterend') {
            const idx = el.parentNode.children.indexOf(el);
            if (idx !== -1) el.parentNode.children.splice(idx + 1, 0, child);
            else el.parentNode.children.push(child);
            child.parentNode = el.parentNode;
          }
        }
        return child;
      }),
      closest: vi.fn((sel) => null),
      addEventListener: vi.fn((type, fn) => {
        if (!listeners[type]) listeners[type] = [];
        listeners[type].push(fn);
      }),
      dispatchEvent: vi.fn((evt) => {
        const fns = listeners[evt.type] || [];
        for (const fn of fns) fn(evt);
        return !evt.defaultPrevented;
      }),
      click: vi.fn(() => {
        const evt = new MockEvent('click');
        el.dispatchEvent(evt);
      }),
      querySelectorAll: vi.fn((sel) => {
        const result = [];
        function walk(node) {
          for (const c of node.children) {
            if (sel.toLowerCase() === 'button' && c.tagName === 'BUTTON') {
              result.push(c);
            } else if (sel.startsWith('.') && c.className.split(/\s+/).includes(sel.slice(1))) {
              result.push(c);
            }
            walk(c);
          }
        }
        walk(el);
        return result;
      }),
      querySelector: vi.fn((sel) => {
        const res = el.querySelectorAll(sel);
        return res.length > 0 ? res[0] : null;
      })
    };
    return el;
  }

  const mockDoc = {
    createElement,
    createEvent: () => new MockEvent('')
  };

  return mockDoc;
}

function createFakeInput(opts = {}) {
  const listeners = {};
  const dispatchedEvents = [];

  const input = {
    tagName: 'INPUT',
    type: 'text',
    value: opts.value ?? '',
    selectionStart: opts.selectionStart ?? (opts.value ? opts.value.length : 0),
    selectionEnd: opts.selectionEnd ?? (opts.value ? opts.value.length : 0),
    disabled: opts.disabled ?? false,
    readOnly: opts.readOnly ?? false,
    focusCalls: 0,
    setSelectionRangeCalls: [],
    focus: vi.fn(() => {
      input.focusCalls++;
    }),
    setSelectionRange: vi.fn((s, e) => {
      input.selectionStart = s;
      input.selectionEnd = e;
      input.setSelectionRangeCalls.push({ start: s, end: e });
    }),
    addEventListener: vi.fn((type, fn) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(fn);
    }),
    dispatchEvent: vi.fn((evt) => {
      dispatchedEvents.push(evt);
      const fns = listeners[evt.type] || [];
      for (const fn of fns) fn(evt);
      return !evt.defaultPrevented;
    }),
    dispatchedEvents
  };

  return input;
}

function getHelper(mockDoc) {
  const runner = new Function(
    'document',
    'Event',
    `
    ${renderUmlautBarCode}
    return renderUmlautBar;
  `
  );
  return runner(mockDoc, MockEvent);
}

describe('Umlaut helper: unit tests with fake input element (Requirement a)', () => {
  let mockDoc;
  let renderUmlautBar;

  beforeEach(() => {
    mockDoc = createMockDom();
    renderUmlautBar = getHelper(mockDoc);
  });

  it('renders all 7 required buttons (ä, ö, ü, ß, Ä, Ö, Ü) with type="button" and Arabic aria-label', () => {
    const input = createFakeInput({ value: '' });
    const bar = renderUmlautBar(input);
    expect(bar).toBeDefined();

    const buttons = bar.querySelectorAll('button');
    expect(buttons.length).toBe(7);

    const expected = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'];
    expected.forEach((ch, idx) => {
      const btn = buttons[idx];
      expect(btn.textContent).toBe(ch);
      expect(btn.type).toBe('button');
      expect(btn.getAttribute('aria-label')).toBe(`إدراج الحرف ${ch}`);
      expect(btn.getAttribute('dir')).toBe('ltr');
      expect(btn.getAttribute('lang')).toBe('de');
    });
  });

  it('sets dir="ltr" and lang="de" on the buttons container', () => {
    const input = createFakeInput({ value: '' });
    const bar = renderUmlautBar(input);
    const row = bar.querySelector('.umlaut-btn-row');
    expect(row).toBeDefined();
    expect(row.getAttribute('dir')).toBe('ltr');
    expect(row.getAttribute('lang')).toBe('de');
  });

  it('renders the Arabic hint line under the buttons', () => {
    const input = createFakeInput({ value: '' });
    const bar = renderUmlautBar(input);
    const hint = bar.querySelector('.umlaut-hint');
    expect(hint).toBeDefined();
    expect(hint.textContent).toContain('اكتب ae أو oe أو ue أو ss، أو استعمل الأزرار');
  });

  it('inserts character at caret in the middle of text and updates caret position right after', () => {
    const input = createFakeInput({ value: 'Kse', selectionStart: 1, selectionEnd: 1 });
    const bar = renderUmlautBar(input);
    const aeBtn = bar.querySelectorAll('button').find(b => b.textContent === 'ä');
    expect(aeBtn).toBeDefined();

    // Trigger mousedown to verify preventDefault (keeps focus)
    const mdEvt = new MockEvent('mousedown');
    aeBtn.dispatchEvent(mdEvt);
    expect(mdEvt.defaultPrevented).toBe(true);

    // Trigger click to insert
    aeBtn.click();

    expect(input.value).toBe('Käse');
    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(2);
    expect(input.focusCalls).toBeGreaterThanOrEqual(1);
  });

  it('replaces a text selection with the activated character', () => {
    const input = createFakeInput({ value: 'Apfel', selectionStart: 0, selectionEnd: 1 });
    const bar = renderUmlautBar(input);
    const capAeBtn = bar.querySelectorAll('button').find(b => b.textContent === 'Ä');
    expect(capAeBtn).toBeDefined();

    capAeBtn.click();

    expect(input.value).toBe('Äpfel');
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(1);
  });

  it('dispatches a real input event on activation', () => {
    const input = createFakeInput({ value: 'Lwe', selectionStart: 1, selectionEnd: 1 });
    const bar = renderUmlautBar(input);
    const oeBtn = bar.querySelectorAll('button').find(b => b.textContent === 'ö');
    expect(oeBtn).toBeDefined();

    oeBtn.click();

    const inputEvents = input.dispatchedEvents.filter(e => e.type === 'input');
    expect(inputEvents.length).toBe(1);
    expect(inputEvents[0].bubbles).toBe(true);
  });

  it('does nothing when input is disabled', () => {
    const input = createFakeInput({ value: 'Banane', selectionStart: 3, selectionEnd: 3, disabled: true });
    const bar = renderUmlautBar(input);
    const btn = bar.querySelectorAll('button')[0];

    btn.click();

    expect(input.value).toBe('Banane');
    expect(input.selectionStart).toBe(3);
    expect(input.dispatchedEvents.length).toBe(0);
  });

  it('does nothing when input is readOnly', () => {
    const input = createFakeInput({ value: 'Banane', selectionStart: 3, selectionEnd: 3, readOnly: true });
    const bar = renderUmlautBar(input);
    const btn = bar.querySelectorAll('button')[0];

    btn.click();

    expect(input.value).toBe('Banane');
    expect(input.selectionStart).toBe(3);
    expect(input.dispatchedEvents.length).toBe(0);
  });

  it('supports touch activation with preventDefault on touchstart', () => {
    const input = createFakeInput({ value: 'Krbi', selectionStart: 1, selectionEnd: 1 });
    const bar = renderUmlautBar(input);
    const ueBtn = bar.querySelectorAll('button').find(b => b.textContent === 'ü');
    expect(ueBtn).toBeDefined();

    const touchEvt = new MockEvent('touchstart');
    ueBtn.dispatchEvent(touchEvt);

    expect(touchEvt.defaultPrevented).toBe(true);
    expect(input.value).toBe('Kürbi');
    expect(input.selectionStart).toBe(2);
  });

  it('correctly inserts uppercase umlaut characters (Ä, Ö, Ü)', () => {
    const input = createFakeInput({ value: '' });
    const bar = renderUmlautBar(input);
    const buttons = bar.querySelectorAll('button');

    const capAe = buttons.find(b => b.textContent === 'Ä');
    const capOe = buttons.find(b => b.textContent === 'Ö');
    const capUe = buttons.find(b => b.textContent === 'Ü');

    capAe.click();
    capOe.click();
    capUe.click();

    expect(input.value).toBe('ÄÖÜ');
    expect(input.selectionStart).toBe(3);
  });
});

describe('Static test: every typed German input is followed by renderUmlautBar (Requirement c)', () => {
  it('ensures written mode input (#wIn) in index.html is followed by renderUmlautBar', () => {
    // Check that #wIn is rendered in written mode and followed by renderUmlautBar
    const writtenBlockMatch = html.match(/if\s*\(\s*mode\s*===\s*['"]written['"]\s*\)[\s\S]*?id=["']wIn["'][\s\S]*?renderUmlautBar\s*\(/);
    expect(writtenBlockMatch).not.toBeNull();
  });

  it('ensures German search input (#vocabSearchInput) in index.html is followed by renderUmlautBar', () => {
    const searchMatch = html.match(/id=["']vocabSearchInput["'][\s\S]*?renderUmlautBar\s*\(/);
    expect(searchMatch).not.toBeNull();
  });

  it('verifies no other typed German input element exists without renderUmlautBar', () => {
    const inputTags = [...html.matchAll(/<input\b[^>]*>/gi)];
    for (const match of inputTags) {
      const tag = match[0];
      const isFile = /type=["']file["']/i.test(tag);
      const isSearch = /id=["']vocabSearchInput["']/i.test(tag);
      const isWritten = /id=["']wIn["']/i.test(tag);

      // If it's a typed German input, ensure it is one of the wired inputs
      if (!isFile) {
        expect(isSearch || isWritten).toBe(true);
      }
    }
  });
});

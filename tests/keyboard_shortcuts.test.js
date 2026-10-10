/**
 * tests/keyboard_shortcuts.test.js
 * Unit test for DEFECT M3:
 * Exercises the REAL handleGlobalKeydown function extracted from index.html.
 * Verifies modifier keys are not swallowed, focused interactive controls are not hijacked,
 * and valid shortcuts on non-interactive elements still function properly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractFunction } from './extract_written.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.resolve(__dirname, '../index.html');
const html = fs.readFileSync(indexPath, 'utf8');

const code = extractFunction(html, 'handleGlobalKeydown');
const handleGlobalKeydown = new Function(`
  ${code}
  return handleGlobalKeydown;
`)();

describe('DEFECT M3: handleGlobalKeydown keyboard shortcuts', () => {
  let mockNextBtn;
  let mockSpeakBtn;
  let mockOptBtns;

  beforeEach(() => {
    mockNextBtn = {
      classList: { contains: vi.fn((cls) => cls === 'show') },
      click: vi.fn()
    };
    mockSpeakBtn = {
      click: vi.fn()
    };
    mockOptBtns = [
      { classList: { contains: () => false }, click: vi.fn() },
      { classList: { contains: () => false }, click: vi.fn() },
      { classList: { contains: () => false }, click: vi.fn() },
      { classList: { contains: () => false }, click: vi.fn() }
    ];

    globalThis.document = {
      getElementById: vi.fn((id) => {
        if (id === 'nextBtn') return mockNextBtn;
        return null;
      }),
      querySelector: vi.fn((sel) => {
        if (sel.includes('listen-hero-btn') || sel.includes('speak-btn')) return mockSpeakBtn;
        return null;
      }),
      querySelectorAll: vi.fn((sel) => {
        if (sel.includes('.options .opt')) return mockOptBtns;
        return [];
      })
    };

    globalThis.view = { screen: 'exercise' };
  });

  afterEach(() => {
    delete globalThis.document;
    delete globalThis.view;
  });

  it('Ctrl+R, Meta+R, Alt+1, and Ctrl+S are NOT prevented', () => {
    const events = [
      { key: 'r', ctrlKey: true, preventDefault: vi.fn(), target: { tagName: 'BODY' } },
      { key: 'r', metaKey: true, preventDefault: vi.fn(), target: { tagName: 'BODY' } },
      { key: '1', altKey: true, preventDefault: vi.fn(), target: { tagName: 'BODY' } },
      { key: 's', ctrlKey: true, preventDefault: vi.fn(), target: { tagName: 'BODY' } },
      { key: ' ', isComposing: true, preventDefault: vi.fn(), target: { tagName: 'BODY' } },
      { key: 'Enter', defaultPrevented: true, preventDefault: vi.fn(), target: { tagName: 'BODY' } }
    ];

    for (const e of events) {
      handleGlobalKeydown(e);
      expect(e.preventDefault).not.toHaveBeenCalled();
      expect(mockNextBtn.click).not.toHaveBeenCalled();
      expect(mockSpeakBtn.click).not.toHaveBeenCalled();
    }
  });

  it('plain "r" on body IS handled and triggers speak button', () => {
    const e = {
      key: 'r',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      isComposing: false,
      defaultPrevented: false,
      preventDefault: vi.fn(),
      target: { tagName: 'BODY' }
    };

    handleGlobalKeydown(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(mockSpeakBtn.click).toHaveBeenCalled();
  });

  it('Enter on a focused button is NOT hijacked to click next', () => {
    const e = {
      key: 'Enter',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      isComposing: false,
      defaultPrevented: false,
      preventDefault: vi.fn(),
      target: { tagName: 'BUTTON' }
    };

    handleGlobalKeydown(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(mockNextBtn.click).not.toHaveBeenCalled();
  });

  it('Space on body with the next button visible IS handled and clicks next', () => {
    const e = {
      key: ' ',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      isComposing: false,
      defaultPrevented: false,
      preventDefault: vi.fn(),
      target: { tagName: 'BODY' }
    };

    handleGlobalKeydown(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(mockNextBtn.click).toHaveBeenCalled();
  });

  it('number key 1 on body clicks first option', () => {
    const e = {
      key: '1',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      isComposing: false,
      defaultPrevented: false,
      preventDefault: vi.fn(),
      target: { tagName: 'BODY' }
    };

    handleGlobalKeydown(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(mockOptBtns[0].click).toHaveBeenCalled();
  });

  it('B2-3: e.key undefined does not throw and does not call preventDefault', () => {
    const e = {
      key: undefined,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      isComposing: false,
      defaultPrevented: false,
      preventDefault: vi.fn(),
      target: { tagName: 'BODY' }
    };

    expect(() => handleGlobalKeydown(e)).not.toThrow();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('B2-3: e.key null does not throw and does not call preventDefault', () => {
    const e = {
      key: null,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      isComposing: false,
      defaultPrevented: false,
      preventDefault: vi.fn(),
      target: { tagName: 'BODY' }
    };

    expect(() => handleGlobalKeydown(e)).not.toThrow();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('B2-3: e.key empty string does not throw and does not call preventDefault', () => {
    const e = {
      key: '',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      isComposing: false,
      defaultPrevented: false,
      preventDefault: vi.fn(),
      target: { tagName: 'BODY' }
    };

    expect(() => handleGlobalKeydown(e)).not.toThrow();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});

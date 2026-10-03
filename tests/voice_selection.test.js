import fs from 'fs';
import { describe, it, expect, beforeEach } from 'vitest';

// Extract the exact production VoiceSelection module directly from index.html
const html = fs.readFileSync('index.html', 'utf8');
const match = html.match(/\/\* =+ SPEECH & VOICE SELECTION =+ \*\/([\s\S]*?)let deVoice = null;/);
if (!match) throw new Error('Could not find SPEECH & VOICE SELECTION block in index.html');

const moduleCode = match[1];
const sandbox = { window: {}, appStorage: null };
const fn = new Function('window', 'appStorage', `${moduleCode}\nreturn VoiceSelection;`);
const VoiceSelection = fn(sandbox.window, sandbox.appStorage);
const { isGermanVoice, isFemaleVoice, isMaleVoice, selectVoice, createVoiceManager } = VoiceSelection;

describe('Voice Selection Module (German Male Preference & Candidate Ranking)', () => {

  it('1. Windows-like list: selects Stefan (male) over Katja and Hedda (female)', () => {
    const voices = [
      { name: 'Microsoft Stefan - German (Germany)', lang: 'de-DE', voiceURI: 'stefan-uri' },
      { name: 'Microsoft Katja - German (Germany)', lang: 'de-DE', voiceURI: 'katja-uri' },
      { name: 'Microsoft Hedda - German (Germany)', lang: 'de-DE', voiceURI: 'hedda-uri' }
    ];

    expect(isMaleVoice(voices[0])).toBe(true);
    expect(isFemaleVoice(voices[1])).toBe(true);
    expect(isMaleVoice(voices[1])).toBe(false);
    expect(isFemaleVoice(voices[2])).toBe(true);
    expect(isMaleVoice(voices[2])).toBe(false);

    const result = selectVoice(voices, null);
    expect(result.voice).toBe(voices[0]);
    expect(result.reason).toBe('male');
    expect(result.isMale).toBe(true);
  });

  it('2. Apple-like list: selects Markus (male) over Anna (female)', () => {
    const voices = [
      { name: 'Anna', lang: 'de-DE', voiceURI: 'anna-uri' },
      { name: 'Markus', lang: 'de-DE', voiceURI: 'markus-uri' }
    ];

    expect(isFemaleVoice(voices[0])).toBe(true);
    expect(isMaleVoice(voices[0])).toBe(false);
    expect(isMaleVoice(voices[1])).toBe(true);

    const result = selectVoice(voices, null);
    expect(result.voice).toBe(voices[1]);
    expect(result.reason).toBe('male');
    expect(result.isMale).toBe(true);
  });

  it('3. Android-like list: selects generic Google Deutsch as fallback (not classified as male)', () => {
    const voices = [
      { name: 'Google Deutsch', lang: 'de-DE', voiceURI: 'google-de-uri' }
    ];

    expect(isGermanVoice(voices[0])).toBe(true);
    expect(isMaleVoice(voices[0])).toBe(false);

    const result = selectVoice(voices, null);
    expect(result.voice).toBe(voices[0]);
    expect(result.reason).toBe('fallback');
    expect(result.isMale).toBe(false);
  });

  it('4. Only-female list: falls back to first German voice with isMale: false', () => {
    const voices = [
      { name: 'Microsoft Katja - German (Germany)', lang: 'de-DE' },
      { name: 'Anna', lang: 'de-DE' },
      { name: 'Petra', lang: 'de-DE' },
      { name: 'Marlene', lang: 'de-DE' }
    ];

    const result = selectVoice(voices, null);
    expect(result.voice).toBe(voices[0]); // Katja
    expect(result.reason).toBe('fallback');
    expect(result.isMale).toBe(false);
  });

  it('5. Empty list: returns null voice and default reason', () => {
    const result = selectVoice([], null);
    expect(result.voice).toBeNull();
    expect(result.reason).toBe('default');
    expect(result.isMale).toBe(false);
  });

  it('6. Voices arriving late via voiceschanged: waits and selects voice asynchronously', async () => {
    let currentVoices = [];
    const listeners = {};

    const mockSynth = {
      getVoices() { return currentVoices; },
      addEventListener(type, cb) {
        listeners[type] = listeners[type] || [];
        listeners[type].push(cb);
      },
      removeEventListener(type, cb) {
        if (listeners[type]) {
          listeners[type] = listeners[type].filter(f => f !== cb);
        }
      }
    };

    const vm = createVoiceManager(mockSynth, null);
    const initPromise = vm.init(2000);

    // Initial state before voices load
    expect(vm.getVoice()).toBeNull();

    // Simulate voices loading after 150ms
    setTimeout(() => {
      currentVoices = [
        { name: 'Microsoft Katja - German (Germany)', lang: 'de-DE' },
        { name: 'Microsoft Stefan - German (Germany)', lang: 'de-DE' }
      ];
      if (listeners['voiceschanged']) {
        listeners['voiceschanged'].forEach(cb => cb());
      }
    }, 150);

    const resolvedVoice = await initPromise;
    expect(resolvedVoice).not.toBeNull();
    expect(resolvedVoice.name).toContain('Stefan');
    expect(vm.isMale()).toBe(true);
  });

  it('7. Saved choice present but voice no longer installed: falls back to best male German voice', () => {
    const voices = [
      { name: 'Microsoft Stefan - German (Germany)', lang: 'de-DE', voiceURI: 'stefan' },
      { name: 'Microsoft Katja - German (Germany)', lang: 'de-DE', voiceURI: 'katja' }
    ];

    const result = selectVoice(voices, 'OldUninstalledVoiceURI');
    expect(result.voice).toBe(voices[0]);
    expect(result.reason).toBe('male');
    expect(result.isMale).toBe(true);
  });

  it('8. Saved choice present and installed: honors user selection even if female', () => {
    const voices = [
      { name: 'Microsoft Stefan - German (Germany)', lang: 'de-DE', voiceURI: 'stefan' },
      { name: 'Microsoft Katja - German (Germany)', lang: 'de-DE', voiceURI: 'katja' }
    ];

    const result = selectVoice(voices, 'katja');
    expect(result.voice).toBe(voices[1]);
    expect(result.reason).toBe('saved');
    expect(result.isMale).toBe(false);
  });

  it('9. de-AT and de-CH voices: Christoph and Killian are recognized as German and male', () => {
    const voices = [
      { name: 'Microsoft Christoph Online (Natural) - German (Austria)', lang: 'de-AT' },
      { name: 'Killian', lang: 'de-CH' }
    ];

    expect(isGermanVoice(voices[0])).toBe(true);
    expect(isMaleVoice(voices[0])).toBe(true);
    expect(isGermanVoice(voices[1])).toBe(true);
    expect(isMaleVoice(voices[1])).toBe(true);

    const result = selectVoice(voices, null);
    expect(result.voice).toBe(voices[0]);
    expect(result.reason).toBe('male');
  });

  it('10. Non-German voices ignored: English male voices are not considered German candidates', () => {
    const voices = [
      { name: 'Google US English', lang: 'en-US' },
      { name: 'Google UK English Male', lang: 'en-GB' },
      { name: 'Microsoft David Desktop - English (United States)', lang: 'en-US' }
    ];

    expect(isGermanVoice(voices[0])).toBe(false);
    expect(isGermanVoice(voices[1])).toBe(false);
    expect(isGermanVoice(voices[2])).toBe(false);

    const result = selectVoice(voices, null);
    expect(result.voice).toBeNull();
    expect(result.reason).toBe('default');
  });

  it('11. Reset clears the saved key and restores male preference', () => {
    const store = new Map();
    const mockStorage = {
      get(k) { return store.has(k) ? store.get(k) : null; },
      set(k, v) { store.set(k, String(v)); },
      remove(k) { store.delete(k); }
    };

    const mockSynth = {
      getVoices() {
        return [
          { name: 'Microsoft Stefan - German (Germany)', lang: 'de-DE', voiceURI: 'stefan' },
          { name: 'Microsoft Katja - German (Germany)', lang: 'de-DE', voiceURI: 'katja' }
        ];
      }
    };

    const vm = createVoiceManager(mockSynth, mockStorage);
    vm.update();
    expect(vm.getVoice().name).toContain('Stefan');

    // User chooses Katja
    vm.setSavedChoice('katja');
    expect(mockStorage.get('deutsch_voice_v1')).toBe('katja');
    expect(vm.getVoice().name).toContain('Katja');

    // Reset action
    vm.resetSavedVoice();
    expect(mockStorage.get('deutsch_voice_v1')).toBeNull();
    expect(vm.getVoice().name).toContain('Stefan');
    expect(vm.isMale()).toBe(true);
  });

});

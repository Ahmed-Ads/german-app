import fs from 'fs';
import { describe, it, expect } from 'vitest';

// Extract the exact production VoiceSelection module directly from index.html
const html = fs.readFileSync('index.html', 'utf8');
const match = html.match(/\/\* =+ SPEECH & VOICE SELECTION =+ \*\/([\s\S]*?)let deVoice = null;/);
if (!match) throw new Error('Could not find SPEECH & VOICE SELECTION block in index.html');

const moduleCode = match[1];
const sandbox = { window: {}, appStorage: null };
const fn = new Function('window', 'appStorage', `${moduleCode}\nreturn VoiceSelection;`);
const VoiceSelection = fn(sandbox.window, sandbox.appStorage);
const { isGermanVoice, isFemaleVoice, isMaleVoice, selectVoice, createVoiceManager } = VoiceSelection;

describe('Voice Selection Module (German Male Preference, Validation & Offline-First Ranking)', () => {

  // 1. Windows-like list
  it('1. Windows-like list: selects Stefan (male) over Katja and Hedda (female)', () => {
    const voices = [
      { name: 'Microsoft Stefan - German (Germany)', lang: 'de-DE', localService: true, voiceURI: 'stefan-uri' },
      { name: 'Microsoft Katja - German (Germany)', lang: 'de-DE', localService: true, voiceURI: 'katja-uri' },
      { name: 'Microsoft Hedda - German (Germany)', lang: 'de-DE', localService: true, voiceURI: 'hedda-uri' }
    ];

    expect(isMaleVoice(voices[0])).toBe(true);
    expect(isFemaleVoice(voices[1])).toBe(true);
    expect(isMaleVoice(voices[1])).toBe(false);
    expect(isFemaleVoice(voices[2])).toBe(true);
    expect(isMaleVoice(voices[2])).toBe(false);

    const result = selectVoice(voices, null, true);
    expect(result.voice).toBe(voices[0]);
    expect(result.reason).toBe('male_local');
    expect(result.isMale).toBe(true);
    expect(result.isLocal).toBe(true);
  });

  // 2. Apple-like list
  it('2. Apple-like list: selects Markus (male) over Anna (female)', () => {
    const voices = [
      { name: 'Anna', lang: 'de-DE', localService: true, voiceURI: 'anna-uri' },
      { name: 'Markus', lang: 'de-DE', localService: true, voiceURI: 'markus-uri' }
    ];

    expect(isFemaleVoice(voices[0])).toBe(true);
    expect(isMaleVoice(voices[0])).toBe(false);
    expect(isMaleVoice(voices[1])).toBe(true);

    const result = selectVoice(voices, null, true);
    expect(result.voice).toBe(voices[1]);
    expect(result.reason).toBe('male_local');
    expect(result.isMale).toBe(true);
  });

  // 3. Android-like list: generic Google Deutsch fallback
  it('3. Android-like list: selects generic Google Deutsch as fallback (not classified as male)', () => {
    const voices = [
      { name: 'Google Deutsch', lang: 'de-DE', localService: false, voiceURI: 'google-de-uri' }
    ];

    expect(isGermanVoice(voices[0])).toBe(true);
    expect(isMaleVoice(voices[0])).toBe(false);

    const result = selectVoice(voices, null, true);
    expect(result.voice).toBe(voices[0]);
    expect(result.reason).toBe('any_online');
    expect(result.isMale).toBe(false);
    expect(result.isLocal).toBe(false);
  });

  // 4. Saved non-German voice is ignored
  it('4. Saved non-German voice is ignored and falls back to German candidate', () => {
    const voices = [
      { name: 'Microsoft Naayf - Arabic (Saudi)', lang: 'ar-SA', localService: true, voiceURI: 'naayf-uri' },
      { name: 'Microsoft Stefan - German (Germany)', lang: 'de-DE', localService: true, voiceURI: 'stefan-uri' }
    ];

    // Attempting to use saved Arabic voice
    const result = selectVoice(voices, 'Microsoft Naayf - Arabic (Saudi)', true);
    expect(result.voice).toBe(voices[1]); // Stefan
    expect(result.reason).toBe('male_local'); // Ignored non-German saved choice
    expect(result.isMale).toBe(true);
  });

  // 5. Saved German voice no longer installed falls back
  it('5. Saved German voice no longer installed: falls back to best available German voice', () => {
    const voices = [
      { name: 'Microsoft Stefan - German (Germany)', lang: 'de-DE', localService: true, voiceURI: 'stefan' },
      { name: 'Microsoft Katja - German (Germany)', lang: 'de-DE', localService: true, voiceURI: 'katja' }
    ];

    const result = selectVoice(voices, 'UninstalledGermanVoice', true);
    expect(result.voice).toBe(voices[0]);
    expect(result.reason).toBe('male_local');
    expect(result.isMale).toBe(true);
  });

  // 6. Saved German voice present and valid
  it('6. Saved German voice present: honored even if female', () => {
    const voices = [
      { name: 'Microsoft Stefan - German (Germany)', lang: 'de-DE', localService: true, voiceURI: 'stefan' },
      { name: 'Microsoft Katja - German (Germany)', lang: 'de-DE', localService: true, voiceURI: 'katja' }
    ];

    const result = selectVoice(voices, 'katja', true);
    expect(result.voice).toBe(voices[1]);
    expect(result.reason).toBe('saved');
    expect(result.isMale).toBe(false);
  });

  // 7. Offline-first ranking: male local > male online > any local > any online
  it('7. Offline-first ranking online: male local > male online > any local > any online', () => {
    const maleLocal = { name: 'Microsoft Stefan', lang: 'de-DE', localService: true };
    const maleOnline = { name: 'Microsoft Conrad Online', lang: 'de-DE', localService: false };
    const femaleLocal = { name: 'Microsoft Katja', lang: 'de-DE', localService: true };
    const femaleOnline = { name: 'Microsoft Amala Online', lang: 'de-DE', localService: false };

    // 1. Male local beats male online
    expect(selectVoice([maleOnline, maleLocal], null, true).voice).toBe(maleLocal);

    // 2. Male online beats female local when online
    expect(selectVoice([femaleLocal, maleOnline], null, true).voice).toBe(maleOnline);

    // 3. Female local beats female online
    expect(selectVoice([femaleOnline, femaleLocal], null, true).voice).toBe(femaleLocal);
  });

  // 8. Offline mode (navigator.onLine === false) prefers local German voice over online voice
  it('8. Offline mode: prefers local German voice when active voice is not local', () => {
    const maleOnline = { name: 'Microsoft Conrad Online', lang: 'de-DE', localService: false };
    const femaleLocal = { name: 'Microsoft Katja', lang: 'de-DE', localService: true };

    // When online, Conrad (male online) is chosen over Katja (female local)
    const onlineResult = selectVoice([femaleLocal, maleOnline], null, true);
    expect(onlineResult.voice).toBe(maleOnline);
    expect(onlineResult.reason).toBe('male_online');

    // When offline, Katja (local) is preferred because Conrad is not local
    const offlineResult = selectVoice([femaleLocal, maleOnline], null, false);
    expect(offlineResult.voice).toBe(femaleLocal);
    expect(offlineResult.reason).toBe('any_local');
    expect(offlineResult.isLocal).toBe(true);
    expect(offlineResult.needsNetwork).toBe(false);
  });

  // 9. Offline mode with saved online voice: prefers local German voice if available
  it('9. Offline mode with saved online voice: prefers local German voice when available', () => {
    const onlineChoice = { name: 'Microsoft Conrad Online', lang: 'de-DE', localService: false, voiceURI: 'conrad-uri' };
    const localFallback = { name: 'Microsoft Katja', lang: 'de-DE', localService: true, voiceURI: 'katja-uri' };

    const result = selectVoice([onlineChoice, localFallback], 'conrad-uri', false);
    expect(result.voice).toBe(localFallback);
    expect(result.reason).toBe('any_local_offline');
    expect(result.isLocal).toBe(true);
  });

  // 10. Offline mode with NO local German voice: keeps online voice and sets needsNetwork: true
  it('10. Offline mode with NO local German voice: flags needsNetwork: true for Arabic alert', () => {
    const voices = [
      { name: 'Google Deutsch', lang: 'de-DE', localService: false }
    ];

    const result = selectVoice(voices, null, false);
    expect(result.voice).toBe(voices[0]);
    expect(result.isLocal).toBe(false);
    expect(result.needsNetwork).toBe(true);
  });

  // 11. de-AT and de-CH voices: Christoph and Killian are recognized as German and male
  it('11. de-AT and de-CH voices: Christoph and Killian are recognized as German and male', () => {
    const voices = [
      { name: 'Microsoft Christoph Online (Natural) - German (Austria)', lang: 'de-AT', localService: false },
      { name: 'Killian', lang: 'de-CH', localService: true }
    ];

    expect(isGermanVoice(voices[0])).toBe(true);
    expect(isMaleVoice(voices[0])).toBe(true);
    expect(isGermanVoice(voices[1])).toBe(true);
    expect(isMaleVoice(voices[1])).toBe(true);

    const result = selectVoice(voices, null, true);
    expect(result.voice).toBe(voices[1]); // Killian is local male
    expect(result.reason).toBe('male_local');
  });

  // 12. Non-German voices ignored: English male voices are not considered German candidates
  it('12. Non-German voices ignored: English male voices are not considered German candidates', () => {
    const voices = [
      { name: 'Google US English', lang: 'en-US' },
      { name: 'Google UK English Male', lang: 'en-GB' },
      { name: 'Microsoft David Desktop - English (United States)', lang: 'en-US' }
    ];

    expect(isGermanVoice(voices[0])).toBe(false);
    expect(isGermanVoice(voices[1])).toBe(false);
    expect(isGermanVoice(voices[2])).toBe(false);

    const result = selectVoice(voices, null, true);
    expect(result.voice).toBeNull();
    expect(result.reason).toBe('default');
  });

  // 13. Reset clears the saved key and restores male preference
  it('13. Reset clears the saved key and restores male preference', () => {
    const store = new Map();
    const mockStorage = {
      get(k) { return store.has(k) ? store.get(k) : null; },
      set(k, v) { store.set(k, String(v)); },
      remove(k) { store.delete(k); }
    };

    const mockSynth = {
      getVoices() {
        return [
          { name: 'Microsoft Stefan - German (Germany)', lang: 'de-DE', localService: true, voiceURI: 'stefan' },
          { name: 'Microsoft Katja - German (Germany)', lang: 'de-DE', localService: true, voiceURI: 'katja' }
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

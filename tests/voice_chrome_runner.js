const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('======================================================================');
console.log('  RUNNING REAL CHROME VOICE & TTS TEST SUITE');
console.log('======================================================================');

const CHROME_PATH = '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe';
const html = fs.readFileSync('index.html', 'utf8');

const testScript = `
<script>
window.__VOICE_CHROME_RESULTS__ = {
  rawVoices: [],
  selectedVoice: null,
  selectionReason: null,
  isMale: false,
  persistencePassed: false,
  resetPassed: false,
  speakUtteranceVoicePassed: false,
  speakSentencePassed: false,
  listenModePassed: false,
  stats360OverflowPassed: false,
  consoleErrors: [],
  logs: []
};

function vlog(msg, ok = true) {
  window.__VOICE_CHROME_RESULTS__.logs.push((ok ? '[PASS] ' : '[FAIL] ') + msg);
}

window.addEventListener('error', e => {
  window.__VOICE_CHROME_RESULTS__.consoleErrors.push(e.message || String(e));
});

window.addEventListener('load', async () => {
  try {
    // 1. Wait for voiceManager initialization
    if (window.voiceManager) {
      await window.voiceManager.init(2000);
    }

    const allVoices = (window.speechSynthesis && window.speechSynthesis.getVoices()) || [];
    window.__VOICE_CHROME_RESULTS__.rawVoices = allVoices.map(v => ({
      name: v.name,
      lang: v.lang,
      localService: v.localService,
      default: v.default
    }));

    const cur = window.voiceManager ? window.voiceManager.getVoice() : null;
    const reason = window.voiceManager ? window.voiceManager.getReason() : 'none';
    const isMale = window.voiceManager ? window.voiceManager.isMale() : false;

    window.__VOICE_CHROME_RESULTS__.selectedVoice = cur ? { name: cur.name, lang: cur.lang } : null;
    window.__VOICE_CHROME_RESULTS__.selectionReason = reason;
    window.__VOICE_CHROME_RESULTS__.isMale = isMale;

    vlog('VoiceManager initialized. Found ' + allVoices.length + ' system voice(s).');
    vlog('Selected voice: ' + (cur ? (cur.name + ' (' + cur.lang + ')') : 'null') + ' | Reason: ' + reason + ' | isMale: ' + isMale);

    // 2. Persistence & Utterance Voice Test
    let lastSpokenUtterance = null;
    const origSpeak = window.speechSynthesis ? window.speechSynthesis.speak.bind(window.speechSynthesis) : null;
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = function(u) {
        lastSpokenUtterance = u;
        if (origSpeak) {
          try { origSpeak(u); } catch(_) {}
        }
      };
    }

    // Set custom choice
    const testChoice = allVoices.length > 0 ? (allVoices[0].voiceURI || allVoices[0].name) : 'MockGermanVoice';
    window.voiceManager.setSavedChoice(testChoice);
    const savedInStorage = appStorage.get('deutsch_voice_v1');
    const isSavedMatch = savedInStorage === testChoice;

    // Trigger speak to assert utterance.voice
    speak('Guten Tag!');
    const speakVoiceMatches = lastSpokenUtterance && (!cur || lastSpokenUtterance.voice === window.voiceManager.getVoice());

    window.__VOICE_CHROME_RESULTS__.persistencePassed = isSavedMatch;
    window.__VOICE_CHROME_RESULTS__.speakUtteranceVoicePassed = !!speakVoiceMatches;
    vlog('Persistence test: choice saved to deutsch_voice_v1 = ' + savedInStorage, isSavedMatch);
    vlog('SpeechSynthesisUtterance.voice matches active selection', speakVoiceMatches);

    // 3. Reset All Progress Test
    resetAllProgress();
    const afterResetStorage = appStorage.get('deutsch_voice_v1');
    const resetOk = (afterResetStorage === null) && (window.voiceManager.getSavedChoice() === null);
    window.__VOICE_CHROME_RESULTS__.resetPassed = resetOk;
    vlog('Reset test: resetAllProgress cleanly removed deutsch_voice_v1 key', resetOk);

    // 4. Regression: Delegated speak button with apostrophe & quotes
    let spokenSentenceText = null;
    window.speechSynthesis.speak = function(u) {
      spokenSentenceText = u.text;
    };
    const testSentence = 'Er sagte: "Das ist \\'fantastisch\\'!"; synth-word: K\\'tzel';
    const testDiv = document.createElement('div');
    testDiv.innerHTML = sentenceLine({ s: testSentence, sar: 'ترجمة تجريبية' });
    document.body.appendChild(testDiv);
    const speakBtn = testDiv.querySelector('button[data-speak]');
    if (speakBtn) speakBtn.click();
    const sentencePassed = (spokenSentenceText === testSentence);
    window.__VOICE_CHROME_RESULTS__.speakSentencePassed = sentencePassed;
    vlog('Regression test: Delegated speak with quotes & apostrophes', sentencePassed);

    // 5. Listening Mode Test
    go({ screen: 'exercise', mode: 'listen', catId: 'obst' });
    await new Promise(r => setTimeout(r, 200));
    const listenBtn = document.getElementById('listenPlayBtn');
    const listenOk = !!listenBtn;
    window.__VOICE_CHROME_RESULTS__.listenModePassed = listenOk;
    vlog('Regression test: Listening mode render and replay button', listenOk);

    // 6. Stats screen render & 360px viewport overflow test
    document.documentElement.style.width = '360px';
    document.body.style.width = '360px';
    document.body.style.maxWidth = '360px';
    go({ screen: 'stats' });
    await new Promise(r => setTimeout(r, 200));
    const voicePicker = document.querySelector('.voice-box');
    const voiceSelect = document.getElementById('voiceSelect');
    const voiceTestBtn = document.getElementById('voiceTestBtn');
    const scrollWidth = document.body.scrollWidth;
    const voiceBoxWidth = voicePicker ? voicePicker.offsetWidth : 999;
    const noOverflow = scrollWidth <= 360 && voiceBoxWidth <= 360 && !!voicePicker && !!voiceSelect && !!voiceTestBtn;
    window.__VOICE_CHROME_RESULTS__.stats360OverflowPassed = noOverflow;
    vlog('Stats screen voice picker rendered without 360px overflow (body.scrollWidth=' + scrollWidth + ', voiceBoxWidth=' + voiceBoxWidth + ')', noOverflow);

  } catch(err) {
    window.__VOICE_CHROME_RESULTS__.consoleErrors.push(err.message + '\\n' + err.stack);
    vlog('Exception in test: ' + err.message, false);
  } finally {
    const reportDiv = document.createElement('div');
    reportDiv.id = 'chrome-voice-output';
    reportDiv.textContent = JSON.stringify(window.__VOICE_CHROME_RESULTS__);
    document.body.appendChild(reportDiv);
  }
});
</script>
`;

const tempFile = 'temp_voice_chrome_test.html';
fs.writeFileSync(tempFile, html.replace('</body>', testScript + '</body>'), 'utf8');

try {
  const cmd = `"${CHROME_PATH}" --headless --window-size=360,740 --virtual-time-budget=6000 --dump-dom "file:///C:/German_App/${tempFile}"`;
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const m = out.match(/id="chrome-voice-output"[^>]*>(.*?)<\/div>/);
  if (!m) {
    console.error('Failed to find #chrome-voice-output in Chrome DOM');
    process.exit(1);
  }

  const res = JSON.parse(m[1].replace(/&quot;/g, '"'));
  console.log('\n--- REAL GOOGLE CHROME GETVOICES() OUTPUT ---');
  if (res.rawVoices.length === 0) {
    console.log('No voices returned by speechSynthesis.getVoices() in headless mode.');
  } else {
    console.log(`Total system voices detected: ${res.rawVoices.length}`);
    res.rawVoices.forEach((v, idx) => {
      console.log(`  [${idx + 1}] "${v.name}" | lang: ${v.lang} | localService: ${v.localService}`);
    });
  }

  console.log('\n--- VOICE SELECTION RESULT ---');
  console.log('Selected Voice   :', res.selectedVoice ? `${res.selectedVoice.name} (${res.selectedVoice.lang})` : 'None');
  console.log('Selection Reason :', res.selectionReason);
  console.log('Is Male Voice    :', res.isMale);

  console.log('\n--- TEST ASSERTION LOGS ---');
  res.logs.forEach(l => console.log('  ' + l));

  if (res.consoleErrors.length > 0) {
    console.error('\nConsole Errors Detected:');
    res.consoleErrors.forEach(e => console.error('  ❌ ' + e));
  } else {
    console.log('\nConsole Errors: 0');
  }

  const allPassed = res.persistencePassed &&
                    res.resetPassed &&
                    res.speakUtteranceVoicePassed &&
                    res.speakSentencePassed &&
                    res.listenModePassed &&
                    res.stats360OverflowPassed &&
                    res.consoleErrors.length === 0;

  console.log('----------------------------------------------------------------------');
  if (allPassed) {
    console.log('🎉 ALL REAL CHROME VOICE & REGRESSION TESTS PASSED!');
  } else {
    console.error('❌ SOME TESTS FAILED IN REAL CHROME');
    process.exit(1);
  }

} finally {
  if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
}

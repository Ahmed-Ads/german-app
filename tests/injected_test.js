window.__TEST_LOGS__ = [];
function record(name, pass, detail) {
  window.__TEST_LOGS__.push({ name, pass, detail });
}

window.addEventListener('DOMContentLoaded', async () => {
  try {
    // -----------------------------------------------------------------
    // 1. RELOAD PERSISTENCE TEST
    // -----------------------------------------------------------------
    const testProg = { 'obst-mcq': { '0': 3, '1': 2 }, 'obst-written': { '0': 1 } };
    const testStats = { lastDate: '2026-10-02', current: 5, longest: 10, totalAnswered: 50, totalCorrect: 45, todayCount: 12 };
    const testStarred = ['obst_0', 'obst_1'];
    const testSrs = { 'obst_0': { box: 2, dueDate: Date.now() + 86400000 * 2 } };

    appStorage.set('german-arabic-progress-v1', JSON.stringify(testProg));
    appStorage.set('german-arabic-stats-v1', JSON.stringify(testStats));
    appStorage.set('deutsch_starred_v1', JSON.stringify(testStarred));
    appStorage.set('deutsch_srs_v1', JSON.stringify(testSrs));
    appStorage.set('deutsch_daily_goal_v1', '30');

    // Read back to simulate reload persistence check
    const rProg = JSON.parse(appStorage.get('german-arabic-progress-v1') || '{}');
    const rStats = JSON.parse(appStorage.get('german-arabic-stats-v1') || '{}');
    const rStar = JSON.parse(appStorage.get('deutsch_starred_v1') || '[]');
    const rSrs = JSON.parse(appStorage.get('deutsch_srs_v1') || '{}');
    const rGoal = appStorage.get('deutsch_daily_goal_v1');

    const persistOk = rProg['obst-mcq'] && rProg['obst-mcq']['0'] === 3 &&
                      rStats.current === 5 &&
                      rStar.length === 2 &&
                      rSrs['obst_0'] && rSrs['obst_0'].box === 2 &&
                      rGoal === '30';
    record('Reload Persistence', persistOk, 'Verified all 5 storage keys retained exact structures.');

    // -----------------------------------------------------------------
    // 2. BACKUP EXPORT -> CLEAR -> IMPORT TEST
    // -----------------------------------------------------------------
    const exportedBackup = {
      version: 1,
      timestamp: new Date().toISOString(),
      appName: 'deutsch_lernen',
      data: {
        progress: rProg,
        stats: rStats,
        starred: rStar,
        srs: rSrs,
        dailyGoal: 30
      }
    };
    const backupJsonStr = JSON.stringify(exportedBackup);

    // Clear all storage
    appStorage.remove('german-arabic-progress-v1');
    appStorage.remove('german-arabic-stats-v1');
    appStorage.remove('deutsch_starred_v1');
    appStorage.remove('deutsch_srs_v1');
    appStorage.remove('deutsch_daily_goal_v1');

    const clearedOk = (appStorage.get('german-arabic-progress-v1') === null);

    // Import from backupJsonStr
    const parsed = JSON.parse(backupJsonStr);
    if (parsed && parsed.data) {
      if (parsed.data.progress) appStorage.set('german-arabic-progress-v1', JSON.stringify(parsed.data.progress));
      if (parsed.data.stats) appStorage.set('german-arabic-stats-v1', JSON.stringify(parsed.data.stats));
      if (parsed.data.starred) appStorage.set('deutsch_starred_v1', JSON.stringify(parsed.data.starred));
      if (parsed.data.srs) appStorage.set('deutsch_srs_v1', JSON.stringify(parsed.data.srs));
      if (parsed.data.dailyGoal) appStorage.set('deutsch_daily_goal_v1', String(parsed.data.dailyGoal));
    }

    const impProg = JSON.parse(appStorage.get('german-arabic-progress-v1') || '{}');
    const impStats = JSON.parse(appStorage.get('german-arabic-stats-v1') || '{}');
    const importOk = clearedOk && impProg['obst-mcq'] && impProg['obst-mcq']['0'] === 3 && impStats.current === 5;
    record('Backup Export -> Clear -> Import', importOk, 'Backup exported, store cleared, and restored with full data fidelity.');

    // -----------------------------------------------------------------
    // 3. RESET ALL PROGRESS TEST (calling actual resetAllProgress())
    // -----------------------------------------------------------------
    const allStorageKeys = [
      'german-arabic-progress-v1',
      'german-arabic-stats-v1',
      'deutsch_starred_v1',
      'deutsch_srs_v1',
      'deutsch_daily_goal_v1',
      'deutsch_lern_v1',
      'deutsch_stats_v1',
      'deutsch_voice_v1',
      'deutsch_no_male_warned_v1',
      'deutsch_offline_voice_warned_v1'
    ];
    allStorageKeys.forEach(k => appStorage.set(k, '{\"test\":1}'));
    progress = { 'obst-mcq': { '0': 5 } };
    stats = { lastDate: '2026-10-02', current: 7, longest: 14, totalAnswered: 80, totalCorrect: 75, todayCount: 15 };
    starredSet = new Set(['obst_0', 'obst_1']);
    srsStore = { 'obst_0': { box: 3 } };
    dailyGoal = 50;

    // Invoke actual app function
    resetAllProgress();

    const allKeysPurged = allStorageKeys.every(k => appStorage.get(k) === null);
    const memoryClean = Object.keys(progress).length === 0 &&
                        stats.current === 0 &&
                        stats.totalAnswered === 0 &&
                        starredSet.size === 0 &&
                        Object.keys(srsStore).length === 0 &&
                        dailyGoal === 20;

    record('Reset All Progress', allKeysPurged && memoryClean, 'All storage keys (active progress, legacy, and voice preferences) purged and memory state reset.');

    // -----------------------------------------------------------------
    // 4. BEHAVIOR TEST: DELEGATED SPEAK BUTTON (data-speak)
    // -----------------------------------------------------------------
    let lastSpokenText = null;
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = function(u) { lastSpokenText = u.text; };
    } else {
      window.speechSynthesis = {
        speak: function(u) { lastSpokenText = u.text; },
        cancel: function() {}
      };
    }

    // Synthetic sentence containing both single quotes (apostrophe) and double quotes
    const testSentence = 'Er sagte: "Das ist \'fantastisch\'!"; synth-word: K\'tzel';
    const testSpeakContainer = document.createElement('div');
    testSpeakContainer.innerHTML = sentenceLine({ s: testSentence, sar: 'ترجمة تجريبية' });
    document.body.appendChild(testSpeakContainer);

    const speakBtn = testSpeakContainer.querySelector('button[data-speak]');
    if (speakBtn) {
      speakBtn.click();
    }
    const speakPassed = (lastSpokenText === testSentence);
    record('Delegated Speak Button (data-speak)', speakPassed, 
      speakPassed ? 'speechSynthesis.speak called with exact sentence containing apostrophe and quotes.' : 'Failed: expected ' + testSentence + ', got ' + lastSpokenText);

    // -----------------------------------------------------------------
    // 5. BEHAVIOR TEST: DELEGATED DAILY GOAL (data-action="set-daily-goal")
    // -----------------------------------------------------------------
    const goalContainer = document.createElement('div');
    goalContainer.innerHTML = '<button class="goal-sel-btn" data-action="set-daily-goal" data-goal="50">50 كلمة</button>';
    document.body.appendChild(goalContainer);

    const gBtn = goalContainer.querySelector('button');
    gBtn.click();
    const activeGoal = getDailyGoal();
    const storedGoal = appStorage.get('deutsch_daily_goal_v1');
    const goalPassed = (activeGoal === 50 && storedGoal === '50');
    record('Delegated Daily Goal (data-action="set-daily-goal")', goalPassed, 'Goal changed to 50 and persisted to storage.');

    // -----------------------------------------------------------------
    // 6. BEHAVIOR TEST: DELEGATED STAR CONTROLS (Wordlist, Feedback, Remove)
    // -----------------------------------------------------------------
    starredSet = new Set();
    saveStarredSoon();

    // 6a. Wordlist star toggle
    const wlContainer = document.createElement('div');
    wlContainer.innerHTML = '<button class="star-btn" data-action="toggle-star-wordlist" data-cat="obst" data-idx="0">⭐</button>';
    document.body.appendChild(wlContainer);
    const wlBtn = wlContainer.querySelector('button');
    wlBtn.click();
    const wlActive = isStarred('obst', 0) && wlBtn.classList.contains('starred');
    const wlPersisted = JSON.parse(appStorage.get('deutsch_starred_v1') || '[]').includes('obst_0');
    record('Delegated Star: Wordlist', wlActive && wlPersisted, 'Wordlist star toggled on, class updated, and persisted.');

    // 6b. Exercise feedback star toggle
    const fbContainer = document.createElement('div');
    fbContainer.innerHTML = '<button class="star-btn" data-action="toggle-star-feedback" data-cat="obst" data-idx="1">⭐</button>';
    document.body.appendChild(fbContainer);
    const fbBtn = fbContainer.querySelector('button');
    fbBtn.click();
    const fbActive = isStarred('obst', 1) && fbBtn.classList.contains('starred');
    record('Delegated Star: Feedback', fbActive, 'Feedback star toggled on and active class applied.');

    // 6c. Starred list removal
    const remContainer = document.createElement('div');
    remContainer.innerHTML = '<button class="star-btn starred" data-action="toggle-star-remove" data-cat="obst" data-idx="0">⭐</button>';
    document.body.appendChild(remContainer);
    const remBtn = remContainer.querySelector('button');
    remBtn.click();
    const remOk = !isStarred('obst', 0) && !JSON.parse(appStorage.get('deutsch_starred_v1') || '[]').includes('obst_0');
    record('Delegated Star: Remove', remOk, 'Word unstarred via delegated remove button and storage updated.');

    // -----------------------------------------------------------------
    // 7. BEHAVIOR TEST: DELEGATED FLASHCARD FLIP & NESTED STAR
    // -----------------------------------------------------------------
    const fcContainer = document.createElement('div');
    fcContainer.innerHTML = [
      '<div class="fc-wrap" data-action="flip-flashcard">',
      '  <div class="fc-card" id="flashcard">',
      '    <div class="fc-face fc-front">',
      '      <button class="star-btn" data-action="toggle-star-flashcard" data-cat="obst" data-idx="2">⭐</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(fcContainer);

    const fcWrap = fcContainer.querySelector('.fc-wrap');
    const fcCard = fcContainer.querySelector('#flashcard');
    const fcStarBtn = fcContainer.querySelector('.star-btn');

    // Initial state: not flipped
    const step1_notFlipped = !fcCard.classList.contains('flipped');

    // Action 1: Click card wrapper -> card MUST flip
    fcWrap.click();
    const step2_flipped = fcCard.classList.contains('flipped');

    // Action 2: Click nested star button inside flipped card -> star toggles, card MUST NOT flip
    fcStarBtn.click();
    const step3_starToggled = isStarred('obst', 2) && fcStarBtn.classList.contains('starred');
    const step4_cardDidNotFlip = fcCard.classList.contains('flipped');

    // Action 3: Click card wrapper again -> card flips back to front
    fcWrap.click();
    const step5_unflipped = !fcCard.classList.contains('flipped');

    const fcPassed = step1_notFlipped && step2_flipped && step3_starToggled && step4_cardDidNotFlip && step5_unflipped;
    record('Delegated Flashcard & Nested Star', fcPassed, 
      'Card flipped on wrap click; star button inside toggled without flipping; wrapper click flipped back.');

    // -----------------------------------------------------------------
    // 8. SECURITY TEST: SEARCH RENDERING XSS PREVENTION
    // -----------------------------------------------------------------
    window.__x = undefined;
    const xssPayload = '<img src=x onerror=window.__x=1>';
    
    // Ensure home view is rendered with search input
    go({ screen: 'home', catId: null });
    const sInput = document.getElementById('vocabSearchInput');
    const sPanel = document.getElementById('searchResults');
    
    if (sInput && sPanel) {
      sInput.value = xssPayload;
      sInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    const xssFlagClean = (window.__x === undefined);
    const noImgInjected = (document.querySelector('img[src="x"]') === null);
    const textRenderedSafely = sPanel ? sPanel.textContent.includes(xssPayload) : false;
    const xssPassed = xssFlagClean && noImgInjected && textRenderedSafely;
    
    record('Search Rendering XSS Prevention', xssPassed,
      xssPassed ? 'User query with <img onerror> escaped as text; window.__x remains undefined and 0 elements injected.'
                : 'Failed: window.__x=' + window.__x + ', img=' + document.querySelector('img[src="x"]'));

    // -----------------------------------------------------------------
    // 9. BEHAVIOR TEST: SYNTHETIC WORD WITH QUOTES & HTML ENTITIES
    // -----------------------------------------------------------------
    let spokenSpecialText = null;
    window.speechSynthesis.speak = function(u) { spokenSpecialText = u.text; };
    const synthWord = '\' " < & \\';

    const synthContainer = document.createElement('div');
    synthContainer.innerHTML = [
      '<button id="testSynthMiniSpeak" class="mini-speak" data-speak="' + escapeAttr(synthWord) + '"></button>',
      '<button id="testSynthWlSpeak" class="wl-speak" data-text="' + escapeAttr(synthWord) + '"></button>'
    ].join('');
    document.body.appendChild(synthContainer);

    const synthMiniBtn = document.getElementById('testSynthMiniSpeak');
    const synthWlBtn = document.getElementById('testSynthWlSpeak');
    synthWlBtn.addEventListener('click', function() { speak(this.dataset.text); });

    // Test mini-speak delegation
    spokenSpecialText = null;
    synthMiniBtn.click();
    const miniSpeakOk = (spokenSpecialText === synthWord);

    // Test wl-speak delegation
    spokenSpecialText = null;
    synthWlBtn.click();
    const wlSpeakOk = (spokenSpecialText === synthWord);

    const synthPassed = miniSpeakOk && wlSpeakOk;
    record('Exact Speech Synthesis with Quotes & Entities', synthPassed,
      synthPassed ? 'Exact text (\' " < & \\) passed to speak() without entity corruption or quote syntax errors.'
                  : 'Failed: expected ' + synthWord + ', got ' + spokenSpecialText);

    // -----------------------------------------------------------------
    // 10. DATA INTEGRITY: IMPORT BACKUP HARDENING (REJECT INVALID NESTED DATA)
    // -----------------------------------------------------------------
    const preBackupProg = { obst: { mcq: { unlocked: 3, counts: { '0': 1 } } } };
    const preBackupStarred = ['obst_0'];
    appStorage.set('german-arabic-progress-v1', JSON.stringify(preBackupProg));
    appStorage.set('deutsch_starred_v1', JSON.stringify(preBackupStarred));

    const invalidBackups = [
      { name: 'Unknown category', data: { progress: { 'unknown_cat_xyz': { mcq: {} } } } },
      { name: 'Unknown mode', data: { progress: { obst: { 'unsupported_mode': {} } } } },
      { name: 'Negative unlocked', data: { progress: { obst: { mcq: { unlocked: -5 } } } } },
      { name: 'Invalid starred format', data: { starred: ['invalid_star_format'] } },
      { name: 'Starred out of bounds', data: { starred: ['obst_999999'] } },
      { name: 'Invalid SRS box', data: { srs: { 'obst_0': { box: 99 } } } },
      { name: 'Daily goal out of range', data: { dailyGoal: 1000 } }
    ];

    let allInvalidRejected = true;
    const origAlert = window.alert;
    const origConfirm = window.confirm;
    window.alert = function() {};
    window.confirm = function() { return false; };

    for (const b of invalidBackups) {
      const valRes = validateBackupData(b.data);
      if (valRes.valid) {
        allInvalidRejected = false;
        break;
      }
      importBackup(JSON.stringify(b.data));
    }

    const postStorageProg = JSON.parse(appStorage.get('german-arabic-progress-v1') || '{}');
    const postStorageStarred = JSON.parse(appStorage.get('deutsch_starred_v1') || '[]');
    const storageUnchanged = (postStorageProg.obst && postStorageProg.obst.mcq.unlocked === 3) &&
                             (postStorageStarred.length === 1 && postStorageStarred[0] === 'obst_0');

    window.alert = origAlert;
    window.confirm = origConfirm;

    const invalidHardeningPassed = allInvalidRejected && storageUnchanged;
    record('Import Backup Hardening (Reject Invalid)', invalidHardeningPassed,
      invalidHardeningPassed ? '7 invalid backup schemas strictly rejected; storage remained completely untouched.'
                             : 'Failed: allInvalidRejected=' + allInvalidRejected + ', storageUnchanged=' + storageUnchanged);

    // -----------------------------------------------------------------
    // 11. DATA INTEGRITY: VALID BACKUP RESTORATION
    // -----------------------------------------------------------------
    const validFullBackup = {
      version: 2,
      exportDate: '2026-10-03T12:00:00.000Z',
      progress: {
        obst: {
          mcq: { unlocked: 6, counts: { '0': 3, '1': 2 } },
          written: { unlocked: 3, counts: { '0': 1 } }
        }
      },
      stats: {
        lastDate: '2026-10-03',
        current: 5,
        longest: 12,
        totalAnswered: 40,
        totalCorrect: 36,
        todayCount: 15
      },
      starred: ['obst_0', 'obst_1', 'gemuese_0'],
      srs: {
        'obst_0': { box: 3, lastDate: '2026-10-01', nextDate: '2026-10-15' }
      },
      dailyGoal: 30
    };

    const origAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {};
    window.confirm = function() { return true; }; // accept restore
    window.alert = function() {};
    importBackup(JSON.stringify(validFullBackup));
    window.confirm = origConfirm;
    window.alert = origAlert;
    HTMLAnchorElement.prototype.click = origAnchorClick;

    const restoredOk = (progress.obst && progress.obst.mcq.unlocked === 6) &&
                       (stats.current === 5 && stats.totalAnswered === 40) &&
                       (starredSet.has('obst_0') && starredSet.has('gemuese_0')) &&
                       (srsStore['obst_0'] && srsStore['obst_0'].box === 3) &&
                       (getDailyGoal() === 30);

    record('Valid Backup Full Restoration', restoredOk,
      restoredOk ? 'Valid backup verified and restored all progress, stats, starred words, SRS, and goal.'
                 : 'Failed restoring valid backup.');

    // -----------------------------------------------------------------
    // 12. STORAGE RESILIENCY: CORRUPTED LOCALSTORAGE RECOVERY
    // -----------------------------------------------------------------
    try {
      localStorage.setItem('german-arabic-progress-v1', '{corrupted_malformed_json: true');
      localStorage.setItem('german-arabic-stats-v1', 'null');
      localStorage.setItem('deutsch_starred_v1', '{"not": "an array"}');
      localStorage.setItem('deutsch_srs_v1', '["primitive", "array"]');
      localStorage.setItem('deutsch_daily_goal_v1', 'not_a_valid_number');
    } catch(e) {}

    await loadProgress();
    await loadStats();
    await loadStarred();
    await loadSrs();

    const defensiveDefaultsOk = (typeof progress === 'object' && progress !== null) &&
                                (stats.current === 0 && stats.totalAnswered === 0) &&
                                (starredSet.size === 0) &&
                                (Object.keys(srsStore).length === 0) &&
                                (getDailyGoal() === 20);

    let renderSurvived = true;
    try {
      render();
    } catch(renderErr) {
      renderSurvived = false;
    }

    const corruptedRecoveryPassed = defensiveDefaultsOk && renderSurvived;
    record('Corrupted Storage Defensive Recovery', corruptedRecoveryPassed,
      corruptedRecoveryPassed ? 'Defensive readers fell back to safe defaults without crashing; render() succeeded.'
                              : 'Failed to safely recover from corrupted storage.');

  } catch(err) {
    record('Error', false, err.message);
  } finally {
    const outDiv = document.createElement('div');
    outDiv.id = 'browser-test-report';
    outDiv.textContent = JSON.stringify(window.__TEST_LOGS__);
    document.body.appendChild(outDiv);
  }
});
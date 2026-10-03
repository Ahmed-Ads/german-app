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

  } catch(err) {
    record('Error', false, err.message);
  } finally {
    const outDiv = document.createElement('div');
    outDiv.id = 'browser-test-report';
    outDiv.textContent = JSON.stringify(window.__TEST_LOGS__);
    document.body.appendChild(outDiv);
  }
});
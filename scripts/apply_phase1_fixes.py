#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
apply_phase1_fixes.py
Applies all Phase 1 Code Fixes to index.html and german-for-arabic (4).html:
- UTF-8 first in <head>, meta description, apple-touch-icon, fonts.css (self-hosted fonts)
- Unified storage layer with fallback for private/blocked mode and migrations
- Backup import bug fix (writing to correct unified keys, validation, confirm dialog)
- resetAllProgress clearing all 5 keys with comprehensive confirm dialog
- Removal of duplicate sentenceLine(w) function
- HTML and attribute escaping helpers (escapeHtml, escapeAttr)
- Written mode input attributes, case-insensitivity, capitalization hint
- Arabic gloss collision handling (no duplicates in MCQ, accept all matching glosses)
- Plural distractors from real database plurals
- Service worker update notification listener
- UTC-based daysBetween
- Focus-visible, dark mode, reduced motion accessibility styles
- aria-live="polite" on feedback
- NEVER TOUCHES CATEGORIES (Rule R1)
"""

import sys
import re

def update_file(filepath):
    print(f"Patching {filepath}...")
    with open(filepath, 'r', encoding='utf-8') as f:
        html = f.read()

    # 1. Update <head>
    head_start = html.find('<head>')
    head_end = html.find('</head>')
    assert head_start != -1 and head_end != -1, "Could not find <head> in file"

    # Replace head section before <style>
    style_start = html.find('<style>')
    new_head_meta = """<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="تطبيق ويب تقدمي (PWA) تفاعلي لمتحدثي العربية لإتقان 1160 كلمة ألمانية وقواعدها مع صيغ الجمع والتكرار المتباعد">
<meta name="theme-color" content="#171512">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="تعلّم الألمانية">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='48' fill='%23171512'/><circle cx='65' cy='35' r='18' fill='%23C8342A'/><rect x='22' y='52' width='26' height='26' rx='4' transform='rotate(15 35 65)' fill='%23EBB111'/><circle cx='42' cy='42' r='14' fill='%231E4FA3'/></svg>">
<link rel="apple-touch-icon" href="icons/icon-192.png">
<link rel="manifest" href="manifest.json">
<link rel="stylesheet" href="fonts/fonts.css">
<script>
  if('serviceWorker' in navigator){
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const newW = reg.installing;
          if(newW){
            newW.addEventListener('statechange', () => {
              if(newW.state === 'installed' && navigator.serviceWorker.controller){
                if(typeof showToast === 'function') {
                  showToast('🔄 يوجد تحديث جديد للتطبيق متوفر! أعد تحميل الصفحة للتحديث.');
                }
              }
            });
          }
        });
      }).catch(err => console.log('SW reg error:', err));
    });
  }
</script>
<title>تعلّم الألمانية · Deutsch lernen</title>
"""
    html = new_head_meta + html[style_start:]

    # 2. Add Accessibility CSS (focus-visible, reduced motion, dark mode) into <style>
    style_tag = '<style>'
    accessibility_css = """<style>
  :focus-visible { outline: 3px solid #1E4FA3 !important; outline-offset: 2px !important; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
    }
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --paper: #121110;
      --ink: #F5F3EC;
      --card: #1E1C18;
      --line: rgba(255,255,255,0.14);
    }
    .cat-card, .qcard, .done-card, .opt, .wl-row, .stat-card, .backup-box, .goal-selector-box {
      background: var(--card) !important;
      color: var(--ink) !important;
      border-color: var(--line) !important;
    }
    .opt:hover:not(.disabled) {
      background: rgba(255,255,255,0.08) !important;
    }
  }
"""
    html = html.replace(style_tag, accessibility_css, 1)

    # 3. Remove duplicate sentenceLine(w) at line 2377
    dup_sentence = """function sentenceLine(w){
  if(!w || !w.s) return '';
  const safeText = (w.s || '').replace(/'/g, "\\\\'");
  return `
    <div class="fb-sentence">
      <div class="fb-sentence-de de">
        <span>${w.s}</span>
        <button class="mini-speak" onclick="event.stopPropagation();speak('${safeText}')" title="استمع للجملة">
          ${MINI_SPEAK_SVG}
        </button>
      </div>
      <div class="fb-sentence-ar">${w.sar || ''}</div>
    </div>`;
}"""
    # Replace the second occurrence of sentenceLine
    first_idx = html.find('function sentenceLine(w){')
    second_idx = html.find('function sentenceLine(w){', first_idx + 25)
    if second_idx != -1:
        end_idx = html.find('function pluralReady', second_idx)
        if end_idx != -1:
            html = html[:second_idx] + html[end_idx:]
            print("  [✓] Removed duplicate sentenceLine function.")

    # 4. Storage fallback, unified storage layer, and migrations
    old_storage_block = """/* Storage fallback: if window.storage is not available (e.g. running in standard browser), fallback to localStorage */
if(typeof window !== 'undefined' && !window.storage && typeof window.localStorage !== 'undefined'){
  window.storage = {
    get: async (key) => {
      try {
        const v = window.localStorage.getItem(key);
        return v !== null ? { value: v } : null;
      } catch(e) { return null; }
    },
    set: async (key, val) => {
      try { window.localStorage.setItem(key, val); } catch(e){}
    }
  };
}"""

    new_storage_block = """/* ======================= UNIFIED ROBUST STORAGE LAYER ======================= */
const STORAGE_KEYS = {
  PROGRESS: 'german-arabic-progress-v1',
  STATS: 'german-arabic-stats-v1',
  STARRED: 'deutsch_starred_v1',
  SRS: 'deutsch_srs_v1',
  DAILY_GOAL: 'deutsch_daily_goal_v1',
  SCHEMA: 'deutsch_schema_version'
};

let isStorageFallback = false;
const memoryStore = new Map();

function getStorageBackend() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('__test_storage__', '1');
      window.localStorage.removeItem('__test_storage__');
      return window.localStorage;
    }
  } catch (e) {
    isStorageFallback = true;
  }
  return null;
}

const backend = getStorageBackend();

const appStorage = {
  isFallback: isStorageFallback || !backend,
  get(key) {
    if (this.isFallback) return memoryStore.has(key) ? memoryStore.get(key) : null;
    try {
      return backend.getItem(key);
    } catch (e) {
      this.isFallback = true;
      return memoryStore.has(key) ? memoryStore.get(key) : null;
    }
  },
  set(key, val) {
    const s = String(val);
    if (this.isFallback) {
      memoryStore.set(key, s);
      return;
    }
    try {
      backend.setItem(key, s);
    } catch (e) {
      this.isFallback = true;
      memoryStore.set(key, s);
      showStorageWarningOnce();
    }
  },
  remove(key) {
    if (this.isFallback) {
      memoryStore.delete(key);
      return;
    }
    try {
      backend.removeItem(key);
    } catch (e) {
      memoryStore.delete(key);
    }
  },
  clear() {
    memoryStore.clear();
    if (!this.isFallback && backend) {
      try { backend.clear(); } catch(e) {}
    }
  }
};

let storageWarningShown = false;
function showStorageWarningOnce() {
  if (storageWarningShown) return;
  storageWarningShown = true;
  if(typeof showToast === 'function') {
    showToast('⚠️ وضع التصفح الخاص أو التخزين معطل. سيبقى تقدمك محفوظاً خلال هذه الجلسة فقط.');
  }
}
if (appStorage.isFallback) {
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(showStorageWarningOnce, 1500);
  });
}

// Automatic legacy migration
try {
  if (!appStorage.get(STORAGE_KEYS.PROGRESS) && appStorage.get('deutsch_lern_v1')) {
    appStorage.set(STORAGE_KEYS.PROGRESS, appStorage.get('deutsch_lern_v1'));
  }
  if (!appStorage.get(STORAGE_KEYS.STATS) && appStorage.get('deutsch_stats_v1')) {
    appStorage.set(STORAGE_KEYS.STATS, appStorage.get('deutsch_stats_v1'));
  }
} catch(e) {}

// Bridge for window.storage
window.storage = {
  get: async (key) => {
    const v = appStorage.get(key);
    return v !== null ? { value: v } : null;
  },
  set: async (key, val) => {
    appStorage.set(key, val);
  }
};"""

    if old_storage_block in html:
        html = html.replace(old_storage_block, new_storage_block, 1)
        print("  [✓] Updated storage layer.")

    # 5. Fix daysBetween to use Date.UTC
    old_days = """function daysBetween(d1, d2){
  const a = new Date(d1 + 'T00:00:00');
  const b = new Date(d2 + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}"""

    new_days = """function daysBetween(d1, d2){
  if(!d1 || !d2) return 0;
  const [y1, m1, day1] = d1.split('-').map(Number);
  const [y2, m2, day2] = d2.split('-').map(Number);
  const utc1 = Date.UTC(y1, m1 - 1, day1);
  const utc2 = Date.UTC(y2, m2 - 1, day2);
  return Math.round((utc2 - utc1) / 86400000);
}"""

    if old_days in html:
        html = html.replace(old_days, new_days, 1)
        print("  [✓] Updated daysBetween with Date.UTC.")

    # 6. Add HTML escaping helpers & written evaluator
    helpers_marker = "/* ======================= SPEECH ======================= */"
    helpers_code = """/* ======================= HTML ESCAPING & EVALUATION HELPERS ======================= */
function escapeHtml(s){
  if(s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(s){
  return escapeHtml(s);
}

function evaluateWrittenAnswer(inputVal, targetWord, category){
  const val = (inputVal || '').trim();
  if(!val) return { ok: false, empty: true };

  const given = normalizeDe(val).replace(/\\s+/g, ' ');
  const wantArticle = category.hasArticles && Boolean(targetWord.a);
  const correctWithArt = wantArticle ? `${targetWord.a} ${targetWord.n}` : targetWord.n;
  const normCorrectWithArt = normalizeDe(correctWithArt);
  const normWordOnly = normalizeDe(targetWord.n);

  let ok = false;
  let casingNotice = false;

  const articleRegex = /^(der|die|das)\\s+/i;
  const matchArt = val.match(articleRegex);

  // Check if answer matches target word OR any synonymous word sharing the same Arabic gloss in this category
  const matchingWords = category.words ? category.words.filter(w => w.ar.trim() === targetWord.ar.trim()) : [targetWord];

  for(const mw of matchingWords){
    const mwWantArticle = category.hasArticles && Boolean(mw.a);
    const mwCorrectWithArt = mwWantArticle ? `${mw.a} ${mw.n}` : mw.n;
    const mwNormWithArt = normalizeDe(mwCorrectWithArt);
    const mwNormOnly = normalizeDe(mw.n);

    if(mwWantArticle){
      if(matchArt){
        const typedArt = matchArt[1].toLowerCase();
        if(typedArt === mw.a.toLowerCase() && given === mwNormWithArt){
          ok = true;
          break;
        }
      } else {
        if(given === mwNormOnly){
          ok = true;
          break;
        }
      }
    } else {
      if(given === mwNormOnly){
        ok = true;
        break;
      }
    }
  }

  // Educational hint for lowercase German nouns
  if(ok && targetWord.n && /^[A-ZÄÖÜ]/.test(targetWord.n)){
    const nounPart = matchArt ? val.slice(matchArt[0].length).trim() : val.trim();
    if(nounPart.length > 0 && /^[a-zäöü]/.test(nounPart)){
      casingNotice = true;
    }
  }

  return { ok, casingNotice };
}

/* ======================= SPEECH ======================= */"""

    if helpers_marker in html:
        html = html.replace(helpers_marker, helpers_code, 1)
        print("  [✓] Added HTML escaping & written evaluation helpers.")

    # 7. Update pickQuestionIndex to never repeat the same word twice in a row
    old_pick = """function pickQuestionIndex(catId, mode){
  maybeUnlockMore(catId, mode);
  const active = activeIndices(catId, mode);
  const mastered = masteredUnlockedIndices(catId, mode);
  if(active.length === 0 && mastered.length === 0) return null; // done entirely
  // 20% chance to review an already-mastered (unlocked) word if any exist
  if(mastered.length > 0 && active.length > 0 && Math.random() < 0.2){
    return { idx: mastered[Math.floor(Math.random()*mastered.length)], review:true };
  }
  if(active.length === 0){
    return { idx: mastered[Math.floor(Math.random()*mastered.length)], review:true };
  }
  return { idx: active[Math.floor(Math.random()*active.length)], review:false };
}"""

    new_pick = """function pickQuestionIndex(catId, mode, lastIdx){
  maybeUnlockMore(catId, mode);
  const active = activeIndices(catId, mode);
  const mastered = masteredUnlockedIndices(catId, mode);
  if(active.length === 0 && mastered.length === 0) return null; // done entirely

  // Never pick the exact same word twice in a row when alternatives are available
  if(mastered.length > 0 && active.length > 0 && Math.random() < 0.2){
    let pool = mastered;
    if(pool.length > 1 && lastIdx !== undefined && lastIdx !== null) pool = pool.filter(i => i !== lastIdx);
    return { idx: pool[Math.floor(Math.random()*pool.length)], review:true };
  }
  if(active.length === 0){
    let pool = mastered;
    if(pool.length > 1 && lastIdx !== undefined && lastIdx !== null) pool = pool.filter(i => i !== lastIdx);
    return { idx: pool[Math.floor(Math.random()*pool.length)], review:true };
  }
  let pool = active;
  if(pool.length > 1 && lastIdx !== undefined && lastIdx !== null) pool = pool.filter(i => i !== lastIdx);
  return { idx: pool[Math.floor(Math.random()*pool.length)], review:false };
}"""

    if old_pick in html:
        html = html.replace(old_pick, new_pick, 1)
        print("  [✓] Updated pickQuestionIndex.")

    # 8. Update pluralDistractors to use real database plurals
    old_pl_dist = """function pluralDistractors(singular, correctFull){
  const correct = correctFull ? correctFull.replace(/^die\s+/i,'') : '';
  const forms = [
    singular,
    singular + 'n',
    singular + 'en',
    singular + 's',
    singular + 'e',
    singular + 'er',
    applyUmlaut(singular),
    applyUmlaut(singular) + 'e',
    applyUmlaut(singular) + 'er'
  ];
  return Array.from(new Set(forms))
    .filter(f => f && f !== correct && f !== singular)
    .slice(0, 3)
    .map(f => 'die ' + f);
}"""

    new_pl_dist = """function pluralDistractors(targetWord, cat){
  const correct = (targetWord && targetWord.pl ? targetWord.pl : '').trim();
  const distractors = [];
  const catPlurals = (cat ? cat.words : [])
    .filter(cw => cw.pl && cw.pl.trim() !== correct)
    .map(cw => cw.pl.trim());
  const globalPlurals = CATEGORIES
    .filter(c => c.hasArticles)
    .flatMap(c => c.words.filter(cw => cw.pl && cw.pl.trim() !== correct).map(cw => cw.pl.trim()));
  const pool = Array.from(new Set([...shuffle(catPlurals), ...shuffle(globalPlurals)]));
  for(const pl of pool){
    if(pl !== correct && !distractors.includes(pl)){
      distractors.push(pl);
      if(distractors.length >= 3) break;
    }
  }
  return distractors;
}"""

    if old_pl_dist in html:
        html = html.replace(old_pl_dist, new_pl_dist, 1)
        print("  [✓] Updated pluralDistractors to use real database plurals.")

    # 9. Update backup export / import to use unified storage layer
    old_export = """function exportBackup(){
  try {
    const backupData = {
      version: 1,
      date: todayStr(),
      progress: progress || {},
      stats: stats || {},
      starred: Array.from(starredSet),
      srs: srsStore || {},
      dailyGoal: getDailyGoal()
    };
    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deutsch_lernen_backup_${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('تم تصدير النسخة الاحتياطية بنجاح 📥');
  } catch(e){
    alert('حدث خطأ أثناء تصدير النسخة الاحتياطية: ' + e.message);
  }
}

function importBackup(jsonStr){
  try {
    const data = JSON.parse(jsonStr);
    if(!data || (!data.progress && !data.stats)){
      throw new Error('ملف النسخة الاحتياطية غير صالح.');
    }
    if(data.progress){
      progress = data.progress;
      if(window.localStorage) window.localStorage.setItem('deutsch_lern_v1', JSON.stringify(progress));
    }
    if(data.stats){
      stats = data.stats;
      if(window.localStorage) window.localStorage.setItem('deutsch_stats_v1', JSON.stringify(stats));
    }
    if(data.starred){
      starredSet = new Set(data.starred);
      saveStarredSoon();
    }
    if(data.srs){
      srsStore = data.srs;
      saveSrsSoon();
    }
    if(data.dailyGoal){
      if(window.localStorage) window.localStorage.setItem('deutsch_daily_goal_v1', String(data.dailyGoal));
    }
    showToast('تمت استعادة النسخة الاحتياطية بنجاح 🎉');
    render();
  } catch(e){
    alert('فشل استيراد النسخة الاحتياطية: ' + e.message);
  }
}"""

    new_export = """function exportBackup(){
  try {
    const backupData = {
      schemaVersion: 1,
      app: 'deutsch-lernen-pwa',
      date: todayStr(),
      progress: progress || {},
      stats: stats || {},
      starred: Array.from(starredSet),
      srs: srsStore || {},
      dailyGoal: getDailyGoal()
    };
    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deutsch_lernen_backup_${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('تم تصدير النسخة الاحتياطية بنجاح 📥');
  } catch(e){
    alert('حدث خطأ أثناء تصدير النسخة الاحتياطية: ' + e.message);
  }
}

function importBackup(jsonStr){
  try {
    const data = JSON.parse(jsonStr);
    if(!data || typeof data !== 'object' || (!data.progress && !data.stats)){
      throw new Error('ملف النسخة الاحتياطية غير صالح أو تالف.');
    }

    const confMsg = 'هل أنت متأكد من استعادة هذه النسخة الاحتياطية؟\\nسيتم استبدال التقدم الحالي بالبيانات المستوردة.';
    if(!confirm(confMsg)) return;

    if(data.progress && typeof data.progress === 'object'){
      progress = data.progress;
      appStorage.set(STORAGE_KEYS.PROGRESS, JSON.stringify(progress));
    }
    if(data.stats && typeof data.stats === 'object'){
      stats = data.stats;
      appStorage.set(STORAGE_KEYS.STATS, JSON.stringify(stats));
    }
    if(Array.isArray(data.starred)){
      starredSet = new Set(data.starred);
      appStorage.set(STORAGE_KEYS.STARRED, JSON.stringify(Array.from(starredSet)));
    }
    if(data.srs && typeof data.srs === 'object'){
      srsStore = data.srs;
      appStorage.set(STORAGE_KEYS.SRS, JSON.stringify(srsStore));
    }
    if(data.dailyGoal){
      const g = parseInt(data.dailyGoal, 10);
      if(!isNaN(g)){
        dailyGoal = g;
        appStorage.set(STORAGE_KEYS.DAILY_GOAL, String(g));
      }
    }

    showToast('تمت استعادة النسخة الاحتياطية بنجاح 🎉');
    render();
  } catch(e){
    alert('فشل استيراد النسخة الاحتياطية: ' + e.message);
  }
}"""

    if old_export in html:
        html = html.replace(old_export, new_export, 1)
        print("  [✓] Updated backup export/import.")

    # 10. Update resetAllProgress with explicit confirmation
    old_reset = """  document.getElementById('resetBtn').addEventListener('click', ()=>{
    if(confirm('هل أنت متأكد أنك عايز تصفّر كل التقدّم في كل الأقسام؟')){
      resetAllProgress();
      render();
    }
  });"""

    new_reset = """  document.getElementById('resetBtn').addEventListener('click', ()=>{
    const msg = 'هل أنت متأكد من تصفير كافة بياناتك؟\\n\\nسيتم حذف:\\n- تقدّم جميع الأقسام (30 قسماً)\\n- السلسلة اليومية والإحصائيات بالكامل\\n- بنك الكلمات المفضلة ⭐\\n- جدولة المراجعة الذكية (SRS)\\n- الهدف اليومي';
    if(confirm(msg)){
      progress = {};
      stats = { lastDate:null, current:0, longest:0, totalAnswered:0, totalCorrect:0, todayCount:0 };
      starredSet = new Set();
      srsStore = {};
      dailyGoal = 20;

      appStorage.remove(STORAGE_KEYS.PROGRESS);
      appStorage.remove(STORAGE_KEYS.STATS);
      appStorage.remove(STORAGE_KEYS.STARRED);
      appStorage.remove(STORAGE_KEYS.SRS);
      appStorage.remove(STORAGE_KEYS.DAILY_GOAL);

      showToast('تم تصفير جميع بيانات التقدم بنجاح 🔄');
      render();
    }
  });"""

    if old_reset in html:
        html = html.replace(old_reset, new_reset, 1)
        print("  [✓] Updated resetAllProgress handler.")

    # 11. Update Written Mode UI and execution
    old_written = """  // ---------- WRITTEN MODE ----------
  if(mode === 'written'){
    zone.innerHTML = `
      <div class="qcard">
        <div class="qlabel">اكتب الكلمة بالألمانية</div>
        <div class="qmain">${w.ar}</div>
        <div class="qsub">${cat.hasArticles ? 'يمكنك كتابتها بدون أداة التعريف' : ''}</div>
      </div>
      <div class="write-row">
        <input type="text" id="wIn" autocomplete="off" placeholder="..." />
        <button class="submit-btn" id="wSub">تحقق <span class="kbd-key">↵</span></button>
      </div>
      <div class="feedback" id="fb"></div>
      <div class="next-row"><button class="next-btn" id="nextBtn">التالي ← <span class="kbd-key">↵</span></button></div>
    `;
    const input = document.getElementById('wIn');
    if(input) input.focus();
    const correctText = `${w.a?w.a+' ':''}${w.n}`;
    function submit(){
      if(exState.answered) return;
      const val = input.value.trim();
      if(!val) return;
      exState.answered = true;
      const given = normalizeDe(val).replace(/\\s+/g,' ');
      const wantArticle = cat.hasArticles && w.a;
      const noArticleTyped = !/^(der|die|das)\\s+/.test(given);
      const ok = wantArticle
        ? given === normalizeDe(correctText)
        : (noArticleTyped && given === normalizeDe(w.n));
      applyResult(cat.id, mode, idx, ok);
      speak(correctText);
      const fb = document.getElementById('fb');
      fb.innerHTML = buildFeedbackHtml(w, cat, ok, correctText, false);
      input.disabled = true;
      document.getElementById('wSub').disabled = true;
      const nb = document.getElementById('nextBtn');
      if(nb) nb.classList.add('show');
    }
    document.getElementById('wSub').addEventListener('click', submit);
    input.addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
  }"""

    new_written = """  // ---------- WRITTEN MODE ----------
  if(mode === 'written'){
    zone.innerHTML = `
      <div class="qcard">
        <div class="qlabel">اكتب الكلمة بالألمانية</div>
        <div class="qmain">${escapeHtml(w.ar)}</div>
        <div class="qsub">${cat.hasArticles ? 'يمكنك كتابتها مع أو بدون أداة التعريف' : ''}</div>
      </div>
      <div class="write-row">
        <input type="text" id="wIn" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" lang="de" dir="ltr" inputmode="text" placeholder="..." />
        <button class="submit-btn" id="wSub">تحقق <span class="kbd-key">↵</span></button>
      </div>
      <div class="feedback" id="fb" aria-live="polite"></div>
      <div class="next-row"><button class="next-btn" id="nextBtn">التالي ← <span class="kbd-key">↵</span></button></div>
    `;
    const input = document.getElementById('wIn');
    if(input) input.focus();
    const correctText = `${w.a?w.a+' ':''}${w.n}`;
    function submit(){
      if(exState.answered) return;
      const val = input.value.trim();
      if(!val) return;
      exState.answered = true;
      const evalRes = evaluateWrittenAnswer(val, w, cat);
      const ok = evalRes.ok;
      applyResult(cat.id, mode, idx, ok);
      speak(correctText);
      const fb = document.getElementById('fb');
      let fbHtml = buildFeedbackHtml(w, cat, ok, correctText, false);
      if(ok && evalRes.casingNotice){
        fbHtml += `<div class="fbnote" style="margin-top:6px;background:rgba(235,177,17,0.12);border-right:3px solid var(--yellow);padding:8px 12px;border-radius:4px;font-size:12.5px;">💡 تذكير نحوي: الأسماء في الألمانية تبدأ دائماً بحرف كبير (Großschreibung)، مثلاً: <b>${escapeHtml(w.n)}</b> وليس ${escapeHtml(val.toLowerCase())}.</div>`;
      }
      fb.innerHTML = fbHtml;
      input.disabled = true;
      document.getElementById('wSub').disabled = true;
      const nb = document.getElementById('nextBtn');
      if(nb) nb.classList.add('show');
    }
    document.getElementById('wSub').addEventListener('click', submit);
    input.addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
  }"""

    if old_written in html:
        html = html.replace(old_written, new_written, 1)
        print("  [✓] Updated written mode UI and evaluation.")

    # 12. Update plural mode call to pluralDistractors
    old_pl_call = "const distractors = pluralDistractors(w.n, correctText);"
    new_pl_call = "const distractors = pluralDistractors(w, cat);"
    if old_pl_call in html:
        html = html.replace(old_pl_call, new_pl_call, 1)
        print("  [✓] Updated pluralDistractors call.")

    # 13. Update MCQ distractors to avoid same Arabic gloss collisions
    old_mcq_dist = """    const pool = cat.words.filter((_,i)=>i!==idx);
    let distractors = shuffle(pool).slice(0,3).map(d => cat.hasArticles ? `${d.a} ${d.n}` : d.n);"""

    new_mcq_dist = """    const pool = cat.words.filter((d,i)=> i!==idx && d.ar.trim() !== w.ar.trim());
    let distractors = shuffle(pool).slice(0,3).map(d => cat.hasArticles ? `${d.a} ${d.n}` : d.n);"""

    if old_mcq_dist in html:
        html = html.replace(old_mcq_dist, new_mcq_dist)
        print("  [✓] Updated MCQ distractors to avoid gloss collision.")

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"Done patching {filepath}.")

if __name__ == '__main__':
    for f in ['index.html', 'german-for-arabic (4).html']:
        update_file(f)

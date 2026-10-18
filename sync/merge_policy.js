/**
 * sync/merge_policy.js
 * Deterministic Cross-Device Progress Merge Module.
 * Plain JS (UMD) - compatible with Node.js and Browser.
 *
 * Mathematical Invariants:
 * 1. Commutativity: merge(A, B) === merge(B, A)
 * 2. Idempotence: merge(A, A) === A
 * 3. Monotonicity: Mastery never decreases.
 */

(function(global) {
  'use strict';

  const DEFAULT_PROGRESS_MODES = ['mcq', 'written', 'article', 'plural', 'listen'];
  const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

  /**
   * Deterministic mapping of pre-migration category order to permanent word IDs.
   * Preserved permanently to guarantee lossless migration of legacy user data,
   * backups, and cloud documents.
   */
  /**
   * Deterministic mapping of pre-migration category order to permanent word IDs.
   * Loaded dynamically from sync/legacy_index_ids.js (browser window.LEGACY_INDEX_IDS,
   * self.LEGACY_INDEX_IDS, or require('./legacy_index_ids.js') in Node).
   */
  function getLegacyMap() {
    if (typeof global !== 'undefined' && global && global.LEGACY_INDEX_IDS && typeof global.LEGACY_INDEX_IDS === 'object') {
      return global.LEGACY_INDEX_IDS;
    }
    if (typeof globalThis !== 'undefined' && globalThis && globalThis.LEGACY_INDEX_IDS && typeof globalThis.LEGACY_INDEX_IDS === 'object') {
      return globalThis.LEGACY_INDEX_IDS;
    }
    if (typeof window !== 'undefined' && window && window.LEGACY_INDEX_IDS && typeof window.LEGACY_INDEX_IDS === 'object') {
      return window.LEGACY_INDEX_IDS;
    }
    if (typeof self !== 'undefined' && self && self.LEGACY_INDEX_IDS && typeof self.LEGACY_INDEX_IDS === 'object') {
      return self.LEGACY_INDEX_IDS;
    }
    if (typeof require === 'function') {
      try {
        return require('./legacy_index_ids.js');
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  function isSafeKey(k) {
    return typeof k === 'string' && !FORBIDDEN_KEYS.has(k);
  }

  function hasOwn(obj, key) {
    return obj !== null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function getProgressModes() {
    if (typeof global !== 'undefined' && Array.isArray(global.PROGRESS_MODES)) {
      return global.PROGRESS_MODES;
    }
    return DEFAULT_PROGRESS_MODES;
  }

  function sanitizeSrsEntry(rec) {
    if (!rec || typeof rec !== 'object') return null;
    const out = { box: (Number.isInteger(rec.box) && rec.box >= 0 && rec.box <= 4) ? rec.box : 0 };
    if (typeof rec.lastDate === 'string') out.lastDate = rec.lastDate;
    if (typeof rec.nextDate === 'string') out.nextDate = rec.nextDate;
    return out;
  }

  /**
   * Pure function to migrate legacy index-based user data to format-2 stable word IDs.
   * Converts:
   * - progress[catId][mode].counts keys from numeric index to word id
   * - starred array from 'catId_idx' to word id
   * - srs object keys from 'catId_idx' to word id
   * Drops out-of-range indices gracefully and preserves already-migrated keys idempotently.
   */
  function migrateLegacyUserData(data, categoriesList) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return data;
    }
    const legacyMap = (typeof SyncMergePolicy !== 'undefined' && SyncMergePolicy && SyncMergePolicy.LEGACY_INDEX_IDS !== undefined)
      ? SyncMergePolicy.LEGACY_INDEX_IDS
      : getLegacyMap();
    if (!legacyMap || typeof legacyMap !== 'object' || Object.keys(legacyMap).length === 0) {
      const msg = 'تعذر تحميل خريطة المعرفات القديمة. تم إيقاف الترقية لضمان عدم فقدان البيانات.';
      if (typeof global !== 'undefined' && typeof global.showToast === 'function') {
        global.showToast(msg);
      } else if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
        window.showToast(msg);
      } else if (typeof showToast === 'function') {
        showToast(msg);
      }
      return data;
    }
    const result = { ...data };
    const categories = Array.isArray(categoriesList) ? categoriesList : (global && global.CATEGORIES ? global.CATEGORIES : []);
    const catWordIdMap = new Map();
    for (const cat of categories) {
      if (cat && cat.id && Array.isArray(cat.words)) {
        catWordIdMap.set(cat.id, cat.words.map((w, idx) => {
          if (w && typeof w === 'object' && w.id) return w.id;
          if (legacyMap[cat.id] && legacyMap[cat.id][idx]) return legacyMap[cat.id][idx];
          return `${cat.id}.${idx}`;
        }));
      }
    }

    function getWordId(catId, idx) {
      if (legacyMap[catId] && legacyMap[catId][idx]) {
        return legacyMap[catId][idx];
      }
      if (catWordIdMap.has(catId)) {
        const list = catWordIdMap.get(catId);
        if (list && list[idx]) return list[idx];
      }
      return null;
    }

    // 1. Progress migration
    if (data.progress && typeof data.progress === 'object' && !Array.isArray(data.progress)) {
      const newProgress = {};
      for (const [catId, catVal] of Object.entries(data.progress)) {
        if (!isSafeKey(catId) || typeof catVal !== 'object' || catVal === null || Array.isArray(catVal)) {
          continue;
        }
        const newCatVal = {};
        if (catVal.coreAcked !== undefined) {
          newCatVal.coreAcked = Boolean(catVal.coreAcked);
        }
        for (const [mKey, mVal] of Object.entries(catVal)) {
          if (mKey === 'coreAcked') continue;
          if (!isSafeKey(mKey) || typeof mVal !== 'object' || mVal === null || Array.isArray(mVal)) {
            continue;
          }
          const newMVal = {
            unlocked: Number.isInteger(mVal.unlocked) ? Math.max(0, mVal.unlocked) : 0,
            counts: {}
          };
          if (mVal.coreAcked !== undefined) {
            newMVal.coreAcked = Boolean(mVal.coreAcked);
          }
          if (mVal.counts && typeof mVal.counts === 'object' && !Array.isArray(mVal.counts)) {
            for (const [key, cnt] of Object.entries(mVal.counts)) {
              if (!isSafeKey(key) || !Number.isInteger(cnt) || cnt < 0) continue;
              if (/^\d+$/.test(key)) {
                const idx = parseInt(key, 10);
                const wid = getWordId(catId, idx);
                if (wid) {
                  newMVal.counts[wid] = Math.max(newMVal.counts[wid] || 0, cnt);
                }
              } else if (key.includes('.')) {
                // Already a word ID
                newMVal.counts[key] = Math.max(newMVal.counts[key] || 0, cnt);
              }
            }
          }
          newCatVal[mKey] = newMVal;
        }
        newProgress[catId] = newCatVal;
      }
      result.progress = newProgress;
    }

    // 2. Starred migration
    if (data.starred && Array.isArray(data.starred)) {
      const newStarredSet = new Set();
      for (const item of data.starred) {
        if (typeof item !== 'string' || !isSafeKey(item)) continue;
        if (/^[a-z0-9-]+_\d+$/.test(item)) {
          const lastIdx = item.lastIndexOf('_');
          const catId = item.slice(0, lastIdx);
          const idxStr = item.slice(lastIdx + 1);
          const idx = parseInt(idxStr, 10);
          const wid = getWordId(catId, idx);
          if (wid) newStarredSet.add(wid);
        } else if (item.includes('.')) {
          newStarredSet.add(item);
        }
      }
      result.starred = Array.from(newStarredSet).sort();
    }

    // 3. SRS migration
    if (data.srs && typeof data.srs === 'object' && !Array.isArray(data.srs)) {
      const newSrs = {};
      for (const [k, rec] of Object.entries(data.srs)) {
        if (!isSafeKey(k) || typeof rec !== 'object' || rec === null || Array.isArray(rec)) continue;
        const sanitized = sanitizeSrsEntry(rec);
        if (!sanitized) continue;
        let wid = null;
        if (/^[a-z0-9-]+_\d+$/.test(k)) {
          const lastIdx = k.lastIndexOf('_');
          const catId = k.slice(0, lastIdx);
          const idxStr = k.slice(lastIdx + 1);
          const idx = parseInt(idxStr, 10);
          wid = getWordId(catId, idx);
        } else if (k.includes('.')) {
          wid = k;
        }
        if (wid) {
          if (newSrs[wid]) {
            newSrs[wid] = mergeSrs({ [wid]: newSrs[wid] }, { [wid]: sanitized })[wid];
          } else {
            newSrs[wid] = sanitized;
          }
        }
      }
      result.srs = newSrs;
    }

    if (data.dailyGoal !== undefined) {
      result.dailyGoal = data.dailyGoal;
    }
    if (data.stats !== undefined) {
      result.stats = data.stats;
    }

    result.dataFormat = 2;
    return result;
  }

  /**
   * Validates a cloud document against structural rules and schema.
   * Accepts both legacy keys and stable word ID keys determined by key shape.
   */
  function validateCloudDocument(data, categoriesList) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { valid: false, error: 'وثيقة السحابة غير صالحة: يجب أن تكون كائناً (JSON Object).' };
    }

    const categories = Array.isArray(categoriesList) ? categoriesList : (global && global.CATEGORIES ? global.CATEGORIES : []);
    const knownCatIds = new Set(categories.map(c => c.id));
    const catWordCounts = new Map(categories.map(c => [c.id, c.words ? c.words.length : 0]));
    const modes = new Set(getProgressModes());

    // Check schema version if present
    if (data.schemaVersion !== undefined && data.schemaVersion !== 1) {
      return { valid: false, error: `إصدار المخطط (${data.schemaVersion}) غير مدعوم.` };
    }

    // 1. Progress validation
    if (data.progress !== undefined) {
      if (typeof data.progress !== 'object' || data.progress === null || Array.isArray(data.progress)) {
        return { valid: false, error: 'حقل التقدم (progress) غير صالح.' };
      }
      for (const [catId, catVal] of Object.entries(data.progress)) {
        if (!isSafeKey(catId) || !knownCatIds.has(catId)) {
          return { valid: false, error: `القسم «${catId}» في التقدم غير معروف في التطبيق.` };
        }
        if (typeof catVal !== 'object' || catVal === null || Array.isArray(catVal)) {
          return { valid: false, error: `بيانات القسم «${catId}» غير صالحة.` };
        }
        const maxWords = catWordCounts.get(catId) || 0;
        for (const [mKey, mVal] of Object.entries(catVal)) {
          if (mKey === 'coreAcked') {
            if (typeof mVal !== 'boolean') return { valid: false, error: `حقل coreAcked في «${catId}» غير صالح.` };
            continue;
          }
          if (!isSafeKey(mKey) || !modes.has(mKey)) {
            return { valid: false, error: `النمط «${mKey}» في «${catId}» غير معروف.` };
          }
          if (typeof mVal !== 'object' || mVal === null || Array.isArray(mVal)) {
            return { valid: false, error: `بيانات النمط «${mKey}» في «${catId}» غير صالحة.` };
          }
          if (mVal.unlocked !== undefined && (!Number.isInteger(mVal.unlocked) || mVal.unlocked < 0 || mVal.unlocked > maxWords + 50)) {
            return { valid: false, error: `الكلمات المفتوحة في «${catId}/${mKey}» غير صالحة.` };
          }
          if (mVal.counts !== undefined) {
            if (typeof mVal.counts !== 'object' || mVal.counts === null || Array.isArray(mVal.counts)) {
              return { valid: false, error: `عدادات الكلمات في «${catId}/${mKey}» غير صالحة.` };
            }
            for (const [keyStr, cnt] of Object.entries(mVal.counts)) {
              if (!isSafeKey(keyStr)) {
                return { valid: false, error: `مفتاح الكلمة (${keyStr}) في «${catId}» غير صالح.` };
              }
              if (/^\d+$/.test(keyStr)) {
                const wIdx = parseInt(keyStr, 10);
                if (!Number.isInteger(wIdx) || wIdx < 0 || wIdx >= maxWords) {
                  return { valid: false, error: `فهرس الكلمة (${keyStr}) في «${catId}» خارج النطاق.` };
                }
              } else if (keyStr.startsWith(catId + '.') && keyStr.slice(catId.length + 1).length > 0 && /^[a-z0-9_.-]+$/.test(keyStr.slice(catId.length + 1))) {
                // Valid word ID
              } else {
                return { valid: false, error: `معرف الكلمة (${keyStr}) في «${catId}» ليس معرفاً مستقراً صالحاً.` };
              }
              if (!Number.isInteger(cnt) || cnt < 0 || cnt > 10000) {
                return { valid: false, error: `قيمة العداد للكلمة (${keyStr}) في «${catId}/${mKey}» غير صالحة.` };
              }
            }
          }
        }
      }
    }

    // 2. Stats validation
    if (data.stats !== undefined) {
      if (typeof data.stats !== 'object' || data.stats === null || Array.isArray(data.stats)) {
        return { valid: false, error: 'حقل الإحصائيات (stats) غير صالح.' };
      }
      const numFields = ['current', 'longest', 'totalAnswered', 'totalCorrect'];
      for (const f of numFields) {
        if (data.stats[f] !== undefined && (!Number.isInteger(data.stats[f]) || data.stats[f] < 0)) {
          return { valid: false, error: `حقل «${f}» في الإحصائيات يجب أن يكون عدداً غير سالب.` };
        }
      }
      if (data.stats.todayCount !== undefined && (!Number.isInteger(data.stats.todayCount) || data.stats.todayCount < 0)) {
        return { valid: false, error: 'حقل todayCount في الإحصائيات غير صالح.' };
      }
      if (data.stats.lastDate !== undefined && data.stats.lastDate !== null && typeof data.stats.lastDate !== 'string') {
        return { valid: false, error: 'حقل lastDate في الإحصائيات غير صالح.' };
      }
    }

    // 3. Starred validation
    if (data.starred !== undefined) {
      if (!Array.isArray(data.starred)) {
        return { valid: false, error: 'حقل المفضلة (starred) يجب أن يكون مصفوفة.' };
      }
      for (const item of data.starred) {
        if (typeof item !== 'string' || !isSafeKey(item)) return { valid: false, error: 'عنصر في المفضلة غير صالح.' };
        if (/^[a-z0-9-]+_\d+$/.test(item)) {
          const lastIdx = item.lastIndexOf('_');
          const catId = item.slice(0, lastIdx);
          const idxStr = item.slice(lastIdx + 1);
          if (!knownCatIds.has(catId)) return { valid: false, error: `القسم «${catId}» في المفضلة غير معروف.` };
          const idx = parseInt(idxStr, 10);
          if (!Number.isInteger(idx) || idx < 0 || idx >= (catWordCounts.get(catId) || 0)) {
            return { valid: false, error: `فهرس الكلمة «${item}» في المفضلة خارج النطاق.` };
          }
        } else if (item.includes('.')) {
          const dotIdx = item.indexOf('.');
          const catId = item.slice(0, dotIdx);
          const slug = item.slice(dotIdx + 1);
          if (!knownCatIds.has(catId)) return { valid: false, error: `القسم «${catId}» في المفضلة غير معروف.` };
          if (!slug || !/^[a-z0-9_.-]+$/.test(slug)) {
            return { valid: false, error: `معرف المفضلة «${item}» ليس معرفاً مستقراً صالحاً.` };
          }
        } else {
          return { valid: false, error: `معرف المفضلة «${item}» ليس معرفاً مستقراً صالحاً.` };
        }
      }
    }

    // 4. SRS validation
    if (data.srs !== undefined) {
      if (typeof data.srs !== 'object' || data.srs === null || Array.isArray(data.srs)) {
        return { valid: false, error: 'حقل التكرار المتباعد (srs) غير صالح.' };
      }
      for (const [k, rec] of Object.entries(data.srs)) {
        if (!isSafeKey(k)) return { valid: false, error: `مفتاح SRS «${k}» غير صالح.` };
        if (/^[a-z0-9-]+_\d+$/.test(k)) {
          const lastIdx = k.lastIndexOf('_');
          const catId = k.slice(0, lastIdx);
          const idxStr = k.slice(lastIdx + 1);
          if (!knownCatIds.has(catId)) return { valid: false, error: `قسم SRS «${catId}» غير معروف.` };
          const idx = parseInt(idxStr, 10);
          if (!Number.isInteger(idx) || idx < 0 || idx >= (catWordCounts.get(catId) || 0)) {
            return { valid: false, error: `فهرس الكلمة «${k}» في SRS خارج النطاق.` };
          }
        } else if (k.includes('.')) {
          const dotIdx = k.indexOf('.');
          const catId = k.slice(0, dotIdx);
          const slug = k.slice(dotIdx + 1);
          if (!knownCatIds.has(catId)) return { valid: false, error: `قسم SRS «${catId}» غير معروف.` };
          if (!slug || !/^[a-z0-9_.-]+$/.test(slug)) {
            return { valid: false, error: `مفتاح SRS «${k}» ليس معرفاً مستقراً صالحاً.` };
          }
        } else {
          return { valid: false, error: `مفتاح SRS «${k}» ليس معرفاً مستقراً صالحاً.` };
        }
        if (typeof rec !== 'object' || rec === null || Array.isArray(rec)) {
          return { valid: false, error: `سجل SRS «${k}» غير صالح.` };
        }
        if (rec.box !== undefined && (!Number.isInteger(rec.box) || rec.box < 0 || rec.box > 4)) {
          return { valid: false, error: `صندوق SRS للكلمة «${k}» يجب أن يكون بين 0 و 4.` };
        }
        if (rec.lastDate !== undefined && typeof rec.lastDate !== 'string') {
          return { valid: false, error: `تاريخ المراجعة السابق للكلمة «${k}» غير صالح.` };
        }
        if (rec.nextDate !== undefined && typeof rec.nextDate !== 'string') {
          return { valid: false, error: `تاريخ المراجعة القادم للكلمة «${k}» غير صالح.` };
        }
      }
    }

    // 5. DailyGoal validation
    if (data.dailyGoal !== undefined) {
      const g = typeof data.dailyGoal === 'object' && data.dailyGoal !== null ? data.dailyGoal.target : data.dailyGoal;
      const numG = Number(g);
      if (isNaN(numG) || !Number.isInteger(numG) || numG < 5 || numG > 200) {
        return { valid: false, error: 'الهدف اليومي (dailyGoal) يجب أن يكون عدداً صحيحاً بين 5 و 200.' };
      }
    }

    return { valid: true };
  }

  /**
   * Merges two progress trees deterministically.
   * Supports both legacy numeric keys and stable format-2 word IDs.
   * Mastery and unlocked counts only increase, never decrease.
   */
  function mergeProgress(a, b) {
    const progA = a && typeof a === 'object' ? a : {};
    const progB = b && typeof b === 'object' ? b : {};
    const allCatIds = Array.from(new Set([
      ...Object.keys(progA).filter(k => hasOwn(progA, k) && isSafeKey(k)),
      ...Object.keys(progB).filter(k => hasOwn(progB, k) && isSafeKey(k))
    ])).sort();
    const merged = {};
    const modes = getProgressModes();

    for (const catId of allCatIds) {
      const catA = (hasOwn(progA, catId) && typeof progA[catId] === 'object' && progA[catId]) || {};
      const catB = (hasOwn(progB, catId) && typeof progB[catId] === 'object' && progB[catId]) || {};
      merged[catId] = {};

      if (catA.coreAcked || catB.coreAcked) {
        merged[catId].coreAcked = true;
      }

      for (const m of modes) {
        if (!isSafeKey(m)) continue;
        const mA = (hasOwn(catA, m) && typeof catA[m] === 'object' && catA[m]) || {};
        const mB = (hasOwn(catB, m) && typeof catB[m] === 'object' && catB[m]) || {};
        const hasA = hasOwn(catA, m) && catA[m] !== undefined;
        const hasB = hasOwn(catB, m) && catB[m] !== undefined;
        if (!hasA && !hasB) continue;

        const unlocked = Math.max(mA.unlocked || 0, mB.unlocked || 0);
        const countsA = (hasOwn(mA, 'counts') && typeof mA.counts === 'object' && mA.counts) || {};
        const countsB = (hasOwn(mB, 'counts') && typeof mB.counts === 'object' && mB.counts) || {};

        const allKeys = Array.from(new Set([
          ...Object.keys(countsA).filter(k => hasOwn(countsA, k) && isSafeKey(k)),
          ...Object.keys(countsB).filter(k => hasOwn(countsB, k) && isSafeKey(k))
        ])).sort((x, y) => {
          const nx = Number(x);
          const ny = Number(y);
          if (!isNaN(nx) && !isNaN(ny)) return nx - ny;
          return x.localeCompare(y);
        });

        const mergedCounts = {};
        for (const k of allKeys) {
          const cA = (hasOwn(countsA, k) && countsA[k]) || 0;
          const cB = (hasOwn(countsB, k) && countsB[k]) || 0;
          mergedCounts[k] = Math.max(cA, cB);
        }

        merged[catId][m] = {
          unlocked,
          counts: mergedCounts
        };
      }
    }
    return merged;
  }

  /**
   * Merges stats deterministically.
   */
  function mergeStats(a, b) {
    const sA = a && typeof a === 'object' ? a : {};
    const sB = b && typeof b === 'object' ? b : {};

    const totalAnswered = Math.max(sA.totalAnswered || 0, sB.totalAnswered || 0);
    const totalCorrect = Math.max(sA.totalCorrect || 0, sB.totalCorrect || 0);

    const dateA = typeof sA.lastDate === 'string' ? sA.lastDate : '';
    const dateB = typeof sB.lastDate === 'string' ? sB.lastDate : '';

    let streak = 0;
    let chosenDate = null;
    let todayCount = 0;

    if (dateA && dateB) {
      if (dateA > dateB) {
        streak = sA.current || 0;
        chosenDate = dateA;
        todayCount = sA.todayCount || 0;
      } else if (dateB > dateA) {
        streak = sB.current || 0;
        chosenDate = dateB;
        todayCount = sB.todayCount || 0;
      } else {
        // Same date
        streak = Math.max(sA.current || 0, sB.current || 0);
        chosenDate = dateA;
        todayCount = Math.max(sA.todayCount || 0, sB.todayCount || 0);
      }
    } else if (dateA) {
      streak = sA.current || 0;
      chosenDate = dateA;
      todayCount = sA.todayCount || 0;
    } else if (dateB) {
      streak = sB.current || 0;
      chosenDate = dateB;
      todayCount = sB.todayCount || 0;
    }

    const longest = Math.max(
      sA.longest || 0,
      sB.longest || 0,
      sA.current || 0,
      sB.current || 0,
      streak
    );

    const merged = {
      current: streak,
      longest: longest,
      totalAnswered: totalAnswered,
      totalCorrect: Math.min(totalCorrect, totalAnswered)
    };

    if (chosenDate) {
      merged.lastDate = chosenDate;
      merged.todayCount = todayCount;
    }

    return merged;
  }

  /**
   * Merges starred items as a deterministic set union.
   */
  function mergeStarred(a, b) {
    const listA = Array.isArray(a) ? a : [];
    const listB = Array.isArray(b) ? b : [];
    const set = new Set();
    for (const item of [...listA, ...listB]) {
      if (typeof item === 'string' && isSafeKey(item)) {
        set.add(item);
      }
    }
    return Array.from(set).sort();
  }

  /**
   * Merges SRS records deterministically.
   * Latest review date wins; tie goes to higher box; tie goes to earlier nextDate.
   */
  function mergeSrs(a, b) {
    const srsA = a && typeof a === 'object' && !Array.isArray(a) ? a : {};
    const srsB = b && typeof b === 'object' && !Array.isArray(b) ? b : {};
    const allKeys = Array.from(new Set([
      ...Object.keys(srsA).filter(k => hasOwn(srsA, k) && isSafeKey(k)),
      ...Object.keys(srsB).filter(k => hasOwn(srsB, k) && isSafeKey(k))
    ])).sort();
    const merged = {};

    for (const key of allKeys) {
      const recA = hasOwn(srsA, key) ? srsA[key] : null;
      const recB = hasOwn(srsB, key) ? srsB[key] : null;

      if (recA && !recB) {
        merged[key] = sanitizeSrsEntry(recA);
        continue;
      }
      if (!recA && recB) {
        merged[key] = sanitizeSrsEntry(recB);
        continue;
      }

      const dateA = (recA && typeof recA.lastDate === 'string') ? recA.lastDate : '';
      const dateB = (recB && typeof recB.lastDate === 'string') ? recB.lastDate : '';

      if (dateA > dateB) {
        merged[key] = sanitizeSrsEntry(recA);
      } else if (dateB > dateA) {
        merged[key] = sanitizeSrsEntry(recB);
      } else {
        // Equal lastDate or both empty -> compare box
        const boxA = (recA && Number.isInteger(recA.box)) ? recA.box : 0;
        const boxB = (recB && Number.isInteger(recB.box)) ? recB.box : 0;
        if (boxA > boxB) {
          merged[key] = sanitizeSrsEntry({ ...recA, box: boxA });
        } else if (boxB > boxA) {
          merged[key] = sanitizeSrsEntry({ ...recB, box: boxB });
        } else {
          // Equal lastDate AND equal box -> deterministic tie-break for nextDate.
          // Choose earlier nextDate (learning-safety rationale).
          const nextA = (recA && typeof recA.nextDate === 'string') ? recA.nextDate : '';
          const nextB = (recB && typeof recB.nextDate === 'string') ? recB.nextDate : '';
          let chosenNext = '';
          if (nextA && nextB) {
            chosenNext = nextA <= nextB ? nextA : nextB;
          } else {
            chosenNext = nextA || nextB || '';
          }
          const chosenLast = dateA || dateB || '';
          const entry = { box: boxA };
          if (chosenLast) entry.lastDate = chosenLast;
          if (chosenNext) entry.nextDate = chosenNext;
          merged[key] = entry;
        }
      }
    }

    return merged;
  }

  /**
   * Merges daily goals deterministically.
   */
  function mergeDailyGoal(a, b) {
    function normalize(g) {
      if (!g) return { target: 20, updatedAt: '' };
      if (typeof g === 'object') {
        const t = Math.max(5, Math.min(200, Math.round(Number(g.target) || 20)));
        return { target: t, updatedAt: typeof g.updatedAt === 'string' ? g.updatedAt : '' };
      }
      const t = Math.max(5, Math.min(200, Math.round(Number(g) || 20)));
      return { target: t, updatedAt: '' };
    }

    const goalA = normalize(a);
    const goalB = normalize(b);

    if (goalA.updatedAt && goalB.updatedAt) {
      if (goalA.updatedAt > goalB.updatedAt) return goalA;
      if (goalB.updatedAt > goalA.updatedAt) return goalB;
      // Equal timestamps: deterministic tie-break -> higher target wins
      if (goalA.target !== goalB.target) {
        return goalA.target > goalB.target ? goalA : goalB;
      }
      return { target: goalA.target, updatedAt: goalA.updatedAt };
    }
    if (goalA.updatedAt) return goalA;
    if (goalB.updatedAt) return goalB;

    // Neither has timestamp -> deterministic tie-break -> higher target wins
    if (goalA.target !== goalB.target) {
      return goalA.target > goalB.target ? goalA : goalB;
    }
    return { target: goalA.target, updatedAt: '' };
  }

  /**
   * Merges full local user data with cloud document payload.
   * Migrates operands by shape in memory before merging.
   * Always produces a clean payload with monotonic counter semantics.
   */
  function mergeFullUserData(localData, cloudData, categoriesList) {
    const loc = migrateLegacyUserData(localData || {}, categoriesList);
    const cld = migrateLegacyUserData(cloudData || {}, categoriesList);

    const mergedProgress = mergeProgress(loc.progress, cld.progress);
    const mergedStats = mergeStats(loc.stats, cld.stats);
    const mergedStarred = mergeStarred(loc.starred, cld.starred);
    const mergedSrs = mergeSrs(loc.srs, cld.srs);
    const mergedDailyGoal = mergeDailyGoal(loc.dailyGoal, cld.dailyGoal);

    return {
      schemaVersion: 1,
      dataVersion: Math.max(Number(loc.dataVersion) || 1, Number(cld.dataVersion) || 1) + 1,
      updatedAt: new Date().toISOString(),
      progress: mergedProgress,
      stats: mergedStats,
      starred: mergedStarred,
      srs: mergedSrs,
      dailyGoal: mergedDailyGoal
    };
  }

  /**
   * Prepares a clean cloud payload from local data objects.
   * Migrates legacy data by shape in memory if needed.
   * Preserves monotonic counter dataVersion and dailyGoal.updatedAt.
   */
  function createCloudPayload(localData) {
    const loc = migrateLegacyUserData(localData || {});
    let dgTarget = 20;
    let dgUpdated = '';
    if (typeof loc.dailyGoal === 'object' && loc.dailyGoal !== null) {
      dgTarget = Math.max(5, Math.min(200, Math.round(Number(loc.dailyGoal.target) || 20)));
      dgUpdated = typeof loc.dailyGoal.updatedAt === 'string' ? loc.dailyGoal.updatedAt : '';
    } else if (loc.dailyGoal !== undefined) {
      dgTarget = Math.max(5, Math.min(200, Math.round(Number(loc.dailyGoal) || 20)));
    }
    const dgPayload = { target: dgTarget };
    if (dgUpdated) dgPayload.updatedAt = dgUpdated;

    return {
      schemaVersion: 1,
      dataVersion: Number(loc.dataVersion) || 1,
      updatedAt: new Date().toISOString(),
      progress: loc.progress || {},
      stats: loc.stats || {},
      starred: Array.isArray(loc.starred) ? loc.starred : [],
      srs: loc.srs || {},
      dailyGoal: dgPayload
    };
  }

  const SyncMergePolicy = {
    get LEGACY_INDEX_IDS() {
      return getLegacyMap();
    },
    migrateLegacyUserData,
    getProgressModes,
    validateCloudDocument,
    mergeProgress,
    mergeStats,
    mergeStarred,
    mergeSrs,
    mergeDailyGoal,
    mergeFullUserData,
    createCloudPayload
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SyncMergePolicy;
  }
  if (typeof window !== 'undefined') {
    window.SyncMergePolicy = SyncMergePolicy;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

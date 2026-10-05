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

  function getProgressModes() {
    if (typeof global !== 'undefined' && Array.isArray(global.PROGRESS_MODES)) {
      return global.PROGRESS_MODES;
    }
    return DEFAULT_PROGRESS_MODES;
  }

  /**
   * Validates a cloud document against structural rules and schema.
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
        if (!knownCatIds.has(catId)) {
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
          if (!modes.has(mKey)) {
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
            for (const [wIdxStr, cnt] of Object.entries(mVal.counts)) {
              const wIdx = parseInt(wIdxStr, 10);
              if (!Number.isInteger(wIdx) || wIdx < 0 || wIdx >= maxWords) {
                return { valid: false, error: `فهرس الكلمة (${wIdxStr}) في «${catId}» خارج النطاق.` };
              }
              if (!Number.isInteger(cnt) || cnt < 0 || cnt > 10000) {
                return { valid: false, error: `قيمة العداد للكلمة (${wIdxStr}) في «${catId}/${mKey}» غير صالحة.` };
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
        if (typeof item !== 'string') return { valid: false, error: 'عنصر في المفضلة غير صالح.' };
        const parts = item.split('_');
        if (parts.length !== 2) return { valid: false, error: `معرف المفضلة «${item}» غير صالح.` };
        const [catId, idxStr] = parts;
        if (!knownCatIds.has(catId)) return { valid: false, error: `القسم «${catId}» في المفضلة غير معروف.` };
        const idx = parseInt(idxStr, 10);
        if (!Number.isInteger(idx) || idx < 0 || idx >= (catWordCounts.get(catId) || 0)) {
          return { valid: false, error: `فهرس الكلمة «${item}» في المفضلة خارج النطاق.` };
        }
      }
    }

    // 4. SRS validation
    if (data.srs !== undefined) {
      if (typeof data.srs !== 'object' || data.srs === null || Array.isArray(data.srs)) {
        return { valid: false, error: 'حقل التكرار المتباعد (srs) غير صالح.' };
      }
      for (const [k, rec] of Object.entries(data.srs)) {
        const parts = k.split('_');
        if (parts.length !== 2) return { valid: false, error: `مفتاح SRS «${k}» غير صالح.` };
        const [catId, idxStr] = parts;
        if (!knownCatIds.has(catId)) return { valid: false, error: `قسم SRS «${catId}» غير معروف.` };
        const idx = parseInt(idxStr, 10);
        if (!Number.isInteger(idx) || idx < 0 || idx >= (catWordCounts.get(catId) || 0)) {
          return { valid: false, error: `فهرس الكلمة «${k}» في SRS خارج النطاق.` };
        }
        if (typeof rec !== 'object' || rec === null || Array.isArray(rec)) {
          return { valid: false, error: `سجل SRS «${k}» غير صالح.` };
        }
        if (rec.box !== undefined && (!Number.isInteger(rec.box) || rec.box < 0 || rec.box > 5)) {
          return { valid: false, error: `صندوق SRS للكلمة «${k}» يجب أن يكون بين 0 و 5.` };
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
   * Mastery and unlocked counts only increase, never decrease.
   */
  function mergeProgress(a, b) {
    const progA = a && typeof a === 'object' ? a : {};
    const progB = b && typeof b === 'object' ? b : {};
    const allCatIds = Array.from(new Set([...Object.keys(progA), ...Object.keys(progB)])).sort();
    const merged = {};
    const modes = getProgressModes();

    for (const catId of allCatIds) {
      const catA = progA[catId] || {};
      const catB = progB[catId] || {};
      merged[catId] = {};

      if (catA.coreAcked || catB.coreAcked) {
        merged[catId].coreAcked = true;
      }

      for (const m of modes) {
        const mA = catA[m] || {};
        const mB = catB[m] || {};
        const hasA = catA[m] !== undefined;
        const hasB = catB[m] !== undefined;
        if (!hasA && !hasB) continue;

        const unlocked = Math.max(mA.unlocked || 0, mB.unlocked || 0);
        const countsA = mA.counts || {};
        const countsB = mB.counts || {};
        const allWIdx = Array.from(new Set([...Object.keys(countsA), ...Object.keys(countsB)])).sort((x, y) => parseInt(x, 10) - parseInt(y, 10));

        const mergedCounts = {};
        for (const idxStr of allWIdx) {
          const cA = countsA[idxStr] || 0;
          const cB = countsB[idxStr] || 0;
          mergedCounts[idxStr] = Math.max(cA, cB);
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
    const set = new Set([...listA, ...listB]);
    return Array.from(set).sort();
  }

  /**
   * Merges SRS records deterministically.
   * Latest review date wins; tie goes to higher box.
   */
  function mergeSrs(a, b) {
    const srsA = a && typeof a === 'object' && !Array.isArray(a) ? a : {};
    const srsB = b && typeof b === 'object' && !Array.isArray(b) ? b : {};
    const allKeys = Array.from(new Set([...Object.keys(srsA), ...Object.keys(srsB)])).sort();
    const merged = {};

    for (const key of allKeys) {
      const recA = srsA[key];
      const recB = srsB[key];

      if (recA && !recB) {
        merged[key] = { ...recA };
        continue;
      }
      if (!recA && recB) {
        merged[key] = { ...recB };
        continue;
      }

      const dateA = typeof recA.lastDate === 'string' ? recA.lastDate : '';
      const dateB = typeof recB.lastDate === 'string' ? recB.lastDate : '';

      if (dateA > dateB) {
        merged[key] = { ...recA };
      } else if (dateB > dateA) {
        merged[key] = { ...recB };
      } else {
        // Equal lastDate or both empty -> higher box wins
        const boxA = Number.isInteger(recA.box) ? recA.box : 0;
        const boxB = Number.isInteger(recB.box) ? recB.box : 0;
        const higherRec = boxA >= boxB ? recA : recB;
        merged[key] = {
          box: Math.max(boxA, boxB),
          lastDate: higherRec.lastDate || dateA || undefined,
          nextDate: higherRec.nextDate || undefined
        };
      }
    }

    return merged;
  }

  /**
   * Merges daily goals deterministically.
   */
  function mergeDailyGoal(a, b) {
    // Normalization to object { target, updatedAt }
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
      return goalA.updatedAt >= goalB.updatedAt ? goalA : goalB;
    }
    if (goalA.updatedAt) return goalA;
    if (goalB.updatedAt) return goalB;

    // Neither has timestamp -> prefer non-default or A
    if (goalA.target !== 20) return goalA;
    if (goalB.target !== 20) return goalB;
    return goalA;
  }

  /**
   * Merges full local user data with cloud document payload.
   */
  function mergeFullUserData(localData, cloudData, categoriesList) {
    const loc = localData || {};
    const cld = cloudData || {};

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
   */
  function createCloudPayload(localData) {
    const loc = localData || {};
    return {
      schemaVersion: 1,
      dataVersion: Number(loc.dataVersion) || 1,
      updatedAt: new Date().toISOString(),
      progress: loc.progress || {},
      stats: loc.stats || {},
      starred: Array.isArray(loc.starred) ? loc.starred : [],
      srs: loc.srs || {},
      dailyGoal: typeof loc.dailyGoal === 'object' && loc.dailyGoal !== null 
        ? loc.dailyGoal 
        : { target: Number(loc.dailyGoal) || 20, updatedAt: new Date().toISOString() }
    };
  }

  const SyncMergePolicy = {
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

# ☁️ Cross-Device Progress Sync Design (المزامنة السحابية عبر الأجهزة)

**Status:** Approved Architecture · **Target Version:** v1.8 (Cache v9 at design time; current: see sw.js)  
**Date Checked:** 2026-10-05 · **Backend:** Google Firebase (Spark Free Tier) / Agnostic Adapter

---

## 1. Free-Tier Quota & Pricing Facts (حقائق الخطة المجانية)

Official documentation checked on **October 5, 2026**:
- [Firebase Pricing (Official)](https://firebase.google.com/pricing)
- [Cloud Firestore Quotas & Limits](https://firebase.google.com/docs/firestore/quotas)
- [Firebase Authentication Limits](https://firebase.google.com/docs/auth)

### Key Verifications
1. **Credit Card Requirement:** **None ($0, No Credit Card Required)**. The Firebase Spark plan allows creating projects, enabling Authentication (Google Sign-In), and provisioning a Cloud Firestore Native database without providing billing or credit card details.
2. **Hard Cap Safety (Zero Charge Guarantee):** Spark projects cannot incur surprise bills or overdraft charges. When any quota is exceeded, Cloud Firestore returns `RESOURCE_EXHAUSTED` (HTTP 429) and halts writes/reads until the daily quota resets at midnight Pacific Time.
3. **Google Sign-In:** Included at no cost under standard Firebase Authentication.

### Usage Estimation & Math (تقدير الاستهلاك الفعلي للمتعلم)
- **User profile:** 1 user studying across 2–3 personal devices (e.g. mobile PWA, tablet, PC).
- **Document structure:** Exactly **1 document** per user located at `users/{uid}`.
- **Estimated Document Size:**
  - Progress for 30 categories across 5 modes (`mcq`, `written`, `article`, `plural`, `listen`): ~10–15 KB.
  - SRS Leitner schedule (1,160 items worst case): ~20–30 KB.
  - Stats, streak, starred indices, daily goal: ~2 KB.
  - **Total Document Size:** ~35–50 KB (Max Firestore document size: **1 MiB = 1,048,576 bytes** -> **~4.8% of limit**).

| Resource | Spark Free Daily/Monthly Quota | App Estimated Usage (1 User, 2-3 Devices) | % of Free Quota | Margin |
|---|---|---|---|---|
| **Stored Data** | 1 GiB total | ~50 KB (0.00005 GiB) | **0.005%** | > 99.99% free |
| **Document Writes** | 20,000 / day | ~60–120 writes / day (debounced 30–60s) | **~0.6%** | > 99.4% free |
| **Document Reads** | 50,000 / day | ~5–20 reads / day (on open / auth change) | **~0.04%** | > 99.9% free |
| **Document Deletes** | 20,000 / day | 1 delete on demand ("حذف بياناتي") | **0.005%** | > 99.99% free |
| **Network Egress** | 10 GiB / month | ~150 MB / month | **~1.5%** | > 98.5% free |

---

## 2. Architecture & Adapter Interface (الهيكلية وواجهة المحول)

The sync engine uses a decoupled adapter pattern. The core application logic and UI never communicate with Firebase directly.

```
+-----------------------------------------------------------+
|                    German App UI & Screens                |
+-----------------------------------------------------------+
                             |
+-----------------------------------------------------------+
|             SyncManager (sync/sync_manager.js)            |
| - Auth State Coordination                                 |
| - Debounced Auto-Save (~30-60s, visibilitychange)         |
| - Conflict Resolution via SyncMergePolicy                 |
+-----------------------------------------------------------+
                             |
            +----------------+----------------+
            |                                 |
+-----------------------+         +-----------------------+
|  FirebaseSyncAdapter  |         |   MemorySyncAdapter   |
| (Real Cloud Backend)  |         | (Fake Cloud for Tests)|
+-----------------------+         +-----------------------+
            |                                 |
   Google Cloud Firestore            In-Memory Mock Server
```

### Adapter Interface Specification
Each adapter implements:
- `signIn()`: Triggers Google OAuth sign-in, returns user object `{ uid, email, displayName }`.
- `signOut()`: Signs out of cloud session. Keeps local browser data 100% intact.
- `onAuthChange(callback)`: Subscribes to authentication lifecycle changes; returns an `unsubscribe` function.
- `load(uid)`: Fetches cloud document `users/{uid}`, returns raw cloud payload or `null` if not found.
- `save(uid, payload)`: Writes payload to `users/{uid}`.
- `deleteData(uid)`: Deletes cloud document `users/{uid}`.
- `isConfigured()`: Returns boolean indicating whether valid credentials (not placeholders) are present.

---

## 3. Pure Deterministic Merge Policy (سياسة الدمج الحتمية)

The merge policy is implemented in a single plain JavaScript file ([sync/merge_policy.js](../sync/merge_policy.js)), usable in both Node.js (Vitest) and the browser without bundlers.

### Mathematical Invariants
1. **Commutativity:** $\text{Merge}(A, B) \equiv \text{Merge}(B, A)$
2. **Idempotence:** $\text{Merge}(A, A) \equiv A$
3. **Monotonicity (Mastery Never Decreases):** $\text{Mastery}(\text{Merge}(A, B)) \ge \max(\text{Mastery}(A), \text{Mastery}(B))$

### Merge Rules (Bilingual Documentation)

| Section | Arabic Rule (القاعدة باللغة العربية) | English Technical Specification |
|---|---|---|
| **Progress (التقدم)** | لكل قسم ونمط (`mcq`, `written`, `article`, `plural`, `listen`): يتم أخذ القيمة الأعلى دائماً لعدد الكلمات المتقنة والكلمات المفتوحة. لا ينقص التقدم أبداً. | For each category and each mode in `PROGRESS_MODES`: `unlocked = max(local, cloud)`, and for every word index $i$, `count[i] = max(local.count[i], cloud.count[i])`. Mastery never decreases. |
| **Stats (الإحصائيات)** | إجمالي الأسئلة والإجابات الصحيحة = القيمة الأكبر. السلسلة = اعتماد سلسلة التاريخ الأحدث؛ وإذا تساوى التاريخ يؤخذ الأكبر. إنجاز اليوم = يُحتسب فقط إذا كان التاريخ يطابق اليوم. | `totalAnswered = max(local, cloud)`, `totalCorrect = max(local, cloud)`. For `streak`, select side with latest `lastDate`; if equal dates, `max(local.current, cloud.current)`. `todayCount` applies only if date equals today. |
| **Starred (المفضلة)** | اتحاد المجموعتين (Union). أي كلمة تم تمييزها بنجمة في أي جهاز تظل مميزة. *(ملاحظة: إلغاء النجمة يتطلب مزامنة الجهازين لمنع عودتها).* | Set union: $\text{Starred} = S_{\text{local}} \cup S_{\text{cloud}}$. Known trade-off: un-starring a word on one device will re-star if the other device has not synced. |
| **SRS (التكرار المتباعد)** | لكل كلمة: السجل ذو تاريخ المراجعة الأحدث (`lastDate`) هو الفائز. في حال تعادل التاريخ، يفوز الصندوق الأعلى (`box`). | For each word ID (`cat_idx`): record with later `lastDate` wins. Tie-breaker: higher `box` wins ($\max(\text{local.box}, \text{cloud.box})$). |
| **Daily Goal (الهدف اليومي)** | التعديل الأحدث زمنياً (`updatedAt`) هو المعتمد. | Object `{ target, updatedAt }`: latest `updatedAt` wins. |

### Data Representation
The cloud document contains **strictly metadata and indices**:
- Category IDs: e.g. `'obst'`, `'berufe'`
- Word Indices: e.g. `'0'`, `'1'`
- Counters, box numbers (0–5), and ISO date strings.
**No vocabulary words, translations, or sentences are transmitted or stored in the cloud**, preserving bandwidth and privacy.

---

## 4. First Sign-In Workflow (مسار تسجيل الدخول لأول مرة)

To protect user progress and avoid unintentional loss:
1. **Case A (Cloud is empty):** Immediately upload current local data to `users/{uid}`.
2. **Case B (Cloud has data, local has data):**
   - Automatically offer/trigger a local backup download (`deutsch_backup_pre_sync.json`) before merging.
   - If download fails or is cancelled by user, provide an honest confirmation dialog informing the user that remote data will merge with local progress.
   - Execute deterministic merge via `SyncMergePolicy.mergeFullUserData`.
   - Save merged result to local storage and update cloud document.
   - Display a clear summary toast in Arabic (e.g. `🎉 تمت مزامنة تقدمك بنجاح وحفظ أعلى إتقان من الجهازين!`).
3. **Sign-Out:**
   - Clears active user session.
   - **Local progress remains untouched** in localStorage.

---

## 5. Triggers & Debounce Architecture (محفزات المزامنة وجدولتها)

To stay comfortably within the 20,000 writes/day free quota:
1. **Debounce Interval:** Study events (answering questions, toggling stars, moving Leitner cards) trigger a debounced save with a **30-second window**.
2. **Lifecycle Flush:** Unsaved progress is immediately saved when:
   - `document.visibilityState === 'hidden'` (`visibilitychange` event)
   - `window.addEventListener('pagehide', ...)`
3. **App Open / Focus:** Re-checks cloud document for updates made on other devices.
4. **Network Reconnect:** `window.addEventListener('online', ...)` flushes any pending changes.
5. **Fault Tolerance:** Cloud network failures **never block offline learning** or interrupt UI interaction. The app simply transitions to `OFFLINE` or `ERROR` state with a retry option.

---

## 6. Authentication: Popup vs Redirect in PWAs

### Research & Official Guidance
According to official Firebase Auth guidance and web standards:
- **`signInWithRedirect` Limitations:** Modern browsers (Safari iOS standalone mode, Chrome with third-party cookie restrictions, Firefox Total Cookie Protection) partition storage across origins. When redirecting from `app.pages.dev` to `project-id.firebaseapp.com` and back, the cross-origin iframe frequently loses authentication session tokens unless a custom `authDomain` on the same top-level domain is configured.
- **`signInWithPopup` Advantages:** Executes inside a direct browser popup opened synchronously via user click gesture. It maintains the PWA application context, circumvents storage partitioning, and works reliably on desktop and mobile browsers.

### Chosen Strategy
- Primary Sign-In Method: `signInWithPopup(auth, googleProvider)`.
- If blocked by a popup blocker, a friendly Arabic message explains how to allow the popup or retry.
- **No COOP/COEP Headers:** Cross-Origin-Opener-Policy (`same-origin`) is intentionally avoided in `_headers` to preserve popup communication.

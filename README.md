# 🇩🇪 تطبيق تعلّم الألمانية للمتحدثين بالعربية · Deutsch lernen

تطبيق ويب تقدمي (PWA) متكامل لتعليم اللغة الألمانية، يضم 1,160 مفردة مفحوصة آلياً وموزعة على 30 قسماً، مع صيغ الجمع، التكرار المتباعد الذكي (SRS)، أنماط استماع وبطاقات 3D، وتفضيل تلقائي لأصوات النطق الألمانية الرجالية، ويعمل بكفاءة تامة دون الحاجة إلى اتصال بالإنترنت.

---

## 📁 خريطة الملفات والمستودع (Repository File Map)

```text
German_App/
├── index.html                 # التطبيق الأساسي (الواجهة، المنطق، المفردات، إدارة الصوت)
├── manifest.json              # ملف تعريف تطبيق الويب التقدمي (PWA)
├── sw.js                      # خادم الخدمة (Service Worker v10) لإدارة الكاش والعمل Offline
├── _headers                   # إعدادات ترويسات الاستضافة لمنع كاش sw.js و manifest.json على Cloudflare Pages
├── vocab_baseline.json        # قاعدة البيانات المرجعية المعتمدة للمفردات (SHA-256)
├── verify_vocab.py            # أداة التحقق التشفيري الصارم من سلامة 1,160 مفردة
├── CHANGELOG_VOCAB.md         # سجل التعديلات المعتمدة للمفردات والقرارات اللغوية
├── vitest.config.mjs          # إعدادات مشغّل اختبارات Vitest
├── package.json               # حزم وتعاريف المشروع وسكربتات الفحص
├── package-lock.json          # قفل إصدارات الحزم والاعتماديات
├── Run_App.bat                # تشغيل خادم محلي على 127.0.0.1:8000 وفتح المتصفح
├── Run_Windows_Checks.bat     # تشغيل حزمة الفحص الشاملة على ويندوز
├── .gitattributes             # ضبط نهايات الأسطر في Git (LF/CRLF)
├── .gitignore                 # استبعاد الملفات المؤقتة وحزم node_modules
├── LICENSE                    # رخصة الاستخدام (MIT) <!-- TODO: Final license choice is pending user decision -->
├── README.md                  # دليل المشروع والتشغيل والنشر والصيانة
│
├── .github/
│   └── workflows/
│       └── ci.yml             # سير عمل التحقق الآلي على GitHub Actions (فحوصات فقط)
│
├── docs/
│   ├── AUDIT_SUMMARY.md       # ملخص تدقيق المفردات، القرارات اللغوية، وحدود التدقيق
│   └── tts_voices.md          # توثيق الأصوات الرجالية المعتمدة وخطوات التثبيت
│
├── fonts/                     # الخطوط المدمجة محلياً للعمل بدون إنترنت
│   ├── fonts.css              # تعريفات @font-face
│   └── font_1.woff2..font_6   # ملفات الخطوط بصيغة WOFF2
│
├── icons/                     # أيقونات التطبيق للشاشات والهواتف (PNG & SVG)
│   ├── icon.svg, icon-192.png, icon-512.png
│   └── icon-maskable.svg, icon-maskable-192.png, icon-maskable-512.png
│
├── scripts/                   # سكربتات البناء والتشخيص
│   ├── build_site.js          # تجميع وتوليد مجلد التوزيع النظيف (site/) للنشر
│   ├── extract_categories_ast.js # استخراج مصفوفة الكلمات عبر Node VM لصالح verifier
│   ├── scan_font_sizes.js     # فحص أحجام الخطوط في DOM لضمان عدم وجود نصوص < 12px
│   ├── serve_subpath.js       # خادم محلي لاختبار الاستضافة تحت مسار فرعي (/german-app/)
│   ├── serve_pages_emulator.js # محاكي توجيه Cloudflare Pages وفحص تحويل /index.html إلى /
│   ├── check_actions_versions.js # فحص توافر إصدارات إجراءات GitHub Actions ودعمها لـ Node 24
│   ├── chrome_overflow_audit.js # فحص التجاوب ومنع التمرير الأفقي عبر 4 شاشات
│   └── verify_console_flow.js # التحقق من خلو المتصفح من أي أخطاء في وحدة التحكم (Console)
│
├── tests/                     # منظومة الاختبارات الآلية
│   ├── unit_fixes.test.js     # اختبارات الوحدة لمعالجة البيانات ومنطق SRS
│   ├── data_integrity.test.js # اختبارات سلامة هيكل البيانات والأقسام
│   ├── property_fuzz.test.js  # اختبارات عشوائية مكثفة (30,000 سؤال)
│   ├── full_modes_fuzz.test.js # اختبارات إجهاد لكافة أنماط التعلّم
│   ├── voice_selection.test.js# اختبارات اختيار وترتيب الأصوات والعمل Offline
│   ├── voice_chrome_runner.js # فحص أصوات المتصفح الحقيقية في Google Chrome
│   ├── sw_static_check.test.js# فحص سلامة إصدار وتوافق ملف sw.js
│   ├── site_contents.test.js  # فحص اكتمال ونظافة مجلد التوزيع site/
│   ├── mutation_verifier_test.py # اختبارات الطفرات والانحدار لإثبات رفض التعديلات الباطلة
│   ├── test_mutation_runner_logic.ps1 # اختبار ذاتي لمنطق فحص نتائج الطفرات في مشغل ويندوز
│   ├── test_baseline_update.py# اختبار إثبات عمل تحديث المرجع وتوثيق الهاش آلياً
│   ├── data_safety_runner.js  # اختبار ترقية المتصفح وضمان بقاء التقدم والإحصائيات
│   ├── cf_routing.spec.js     # اختبار Playwright لتوافق توجيه Cloudflare Pages والعمل دون اتصال
│   ├── offline_sw.spec.js     # اختبار Playwright لدورة حياة PWA بدون إنترنت
│   ├── sw_upgrade.spec.js     # اختبار Playwright لترقية Service Worker
│   ├── viewport_overflow.spec.js # اختبار Playwright لعدم تجاوز عرض 360px
│   ├── chrome_axe_runner.js   # اختبار إمكانية الوصول في المتصفح الحقيقي (Axe WCAG)
│   └── run_offline_sw_test.js # مشغّل احتياطي لاختبار العمل بدون إنترنت
│
└── tools/
    └── run_windows_checks.ps1 # الحزمة البرمجية الكاملة للفحص على ويندوز (12 مرحلة)
```

---

## 🚀 1. التشغيل المحلي (على حاسوبك)

- **الطريقة الموصى بها:** اضغط مرتين على `Run_App.bat` لتشغيل خادم محلي آمن مرتبط بالعنوان `127.0.0.1:8000` وفتح التطبيق تلقائياً في المتصفح (أو نفّذ `python -m http.server 8000`). فتح ملف `index.html` مباشرة عبر بروتوكول `file://` لا يدعم Service Worker ولا يوفر إمكانيات التخزين المؤقت للعمل دون اتصال، كما يمتلك مساحة تخزين محلية منفصلة.

---

## 🌐 2. النشر والتوافق مع Cloudflare Pages (استضافة مجانية للمستودعات الخاصة)

تم اختيار **Cloudflare Pages** لاستضافة التطبيق مجاناً مع إبقاء الكود المصدري داخل **مستودع خاص (Private Repository)** على GitHub، لأن GitHub Pages المجاني يتطلب مستودعاً عاماً.

### إعدادات البناء المعتمدة (Build Settings):
عند ربط المستودع في لوحة تحكم Cloudflare Dashboard (**Workers & Pages** > **Create application** > **Pages** > **Connect to Git**)، اضبط الإعدادات التالية بدقة:
- **Framework preset:** `None` (تطبيق بدون إطار عمل).
- **Build command:**
  ```bash
  node scripts/build_site.js
  ```
- **Build output directory:**
  ```text
  site
  ```
- **Root directory:** `/` (اتركه فارغاً، ليعتمد جذر المستودع).
- **إصدار Node.js (اختياري/موصى به):** في **Settings** > **Builds & deployments** > **Environment variables**، يمكن إضافة المتغير `NODE_VERSION` بالقيمة `20`.

### سلوك التوجيه والتوافق الهندسي (Routing & SW Compatibility):
- **التحويل التلقائي للروابط النظيفة:** تُجري Cloudflare Pages تحويلاً دائماً (HTTP 308) لأي طلب للمسار `/index.html` إلى الجذر التوجيهي النظيف `/` (Clean URLs).
- **معالجة استجابات التنقل (Navigation Responses):** تنص مواصفة Fetch و Service Worker على حظر الاستجابة لطلبات التنقل (Navigation) باستجابة تحمل راية التحويل `response.redirected === true` لتجنب أخطاء المتصفح وفشل التشغيل أوفلاين. لذا تم ضبط التطبيق هندسياً كالتالي:
  1. ضبط `start_url: "./"` داخل `manifest.json`.
  2. تضمين المسار الأساسي `'./'` في التخزين المسبق الحرج `CRITICAL_ASSETS` بملف `sw.js` (بدلاً من `'./index.html'`).
  3. إعادة بناء أي استجابة شبكية محولة لتكون استجابة نظيفة (`cleanRedirectedResponse`) قبل التخزين المؤقت عبر `cache.put` وقبل الإرجاع للمتصفح.
  4. اعتراض طلبات التنقل التي تنتهي بـ `/index.html` وتقديم استجابة الجذر النظيفة المخزنة فورياً للعمل دون اتصال بكفاءة تامة.
- **ملف الترويسات (`_headers`):** يتضمن مجلد الإنتاج `site/` ملف `_headers` لضبط `Cache-Control: no-cache` لكل من `/sw.js` و `/manifest.json` لضمان عدم احتفاظ خوادم الحافة (CDN) بنسخ قديمة منهما وسرعة وصول التحديثات للمستخدمين.

### الفحوصات اليدوية على الرابط الحقيقي بعد النشر (Manual Verification on Real URL):
نظراً لأن بيئات الفحص الآلي (CI) تعمل محلياً ومحاكاتياً، يجب إجراء الفحوصات الثلاثة التالية يدوياً على الرابط الفعلي المنشور (`https://<project-name>.pages.dev`) للتأكد التام:
1. **الفحص الأول (أونلاين - Online):** افتح الرابط المباشر في المتصفح، وتأكد من تحميل كافة الأقسام (30 قسماً) وتفعيل كاش Service Worker v10 دون أي أخطاء في Console.
2. **الفحص الثاني (أوفلاين - Offline):** افصل الاتصال بالإنترنت (أو اختر Offline من تبويب Network في DevTools)، ثم أعد تحميل الصفحة في المسارين: `/` وكذلك `/index.html`، وتأكد من ظهور الأقسام والتفاعل السليم.
3. **الفحص الثالث (التشغيل من أيقونة PWA المثبتة أوفلاين - Launch from Installed Icon Offline):** ثبّت التطبيق كـ PWA على الهاتف أو الحاسوب، وافصل الإنترنت تماماً، ثم شغّل التطبيق من الأيقونة المثبتة على سطح المكتب أو الشاشة الرئيسية، وتأكد من فتح التطبيق وظهور الـ 30 قسماً دون انقطاع، مع خلو Console من أي أخطاء.
*(تنبيه أمان وموثوقية: هذه الفحوصات الثلاثة على النطاق الحقيقي تُجرى يدوياً فقط، ولا ندعي التحقق منها على الخادم الحقيقي آلياً).*

---

## 📋 3. روتين إصدار التحديثات (Release Routine)

عند إجراء أي تحديث أو تحسين مستقبلي، اتبع الخطوات التالية بالترتيب:

1. **التحقق من كافة البوابات (Verify):**
   ```bash
   npm run test:all
   ```
   أو قم بتشغيل فحص ويندوز الشامل عبر النقر المزدوج على `Run_Windows_Checks.bat`.
2. **ترقية إصدار الكاش (Bump CACHE_NAME):**
   - افتح ملف `sw.js` وقم بزيادة رقم الإصدار في `CACHE_NAME` (مثلاً من `deutsch-lernen-v10` إلى `deutsch-lernen-v11`).
   - اختبار `tests/sw_static_check.test.js` يتحقق من اسم الكاش تلقائياً.
   - إن غيّرت أي ملف مخزّن مؤقتاً (مثل `sync/*.js` أو الخطوط أو الأيقونات) دون ترقية `CACHE_NAME` سيفشل اختبار `tests/sw_cache_version.test.js` ويخبرك بالخطوة المطلوبة. بعد الترقية شغّل:
     ```bash
     npm run update:sw-baseline
     ```
3. **الالتزام (Commit):**
   ```bash
   git add .
   git commit -m "feat: وصف التحديث الجديد"
   ```
4. **الدفع (Push):**
   ```bash
   git push origin main
   ```
   ستقوم Cloudflare Pages تلقائياً بسحب التحديث، وبناء المجلد `site/` ونشر النسخة الجديدة في ثوانٍ.

---

## 🛠️ 4. أين تعدّل ماذا؟ (Where to Change What)

- **تعديل المفردات الألمانية (Vocabulary):**
  - **تنبيه صارم (Rule R1):** لا تعدل الكلمات اعتباطياً. أي تعديل في المفردات داخل `index.html` يتطلب توثيقاً بمصادر لغوية معتمدة (Duden/DWDS)، وتحديثاً متعمداً لقاعدة المرجع عبر:
    ```bash
    python verify_vocab.py --update-baseline --reason "سبب التعديل" --source "المصدر اللغوي" --ids "المعرف"
    ```
    سيتم تسجيل الهاش الجديد تلقائياً في `CHANGELOG_VOCAB.md`.
- **تعديل التصميم والألوان والأنماط (CSS):**
  - يتم التعديل داخل قسم `<style>` في `index.html`. لا يتطلب تغيير الكاش لأن أنماط CSS تستخدم استراتيجية *Stale-While-Revalidate* وتتحدث فورياً في الخلفية.
- **تعديل منطق التطبيق والواجهة (JavaScript):**
  - يتم داخل قسم `<script>` في `index.html`. بعد التعديل، يجب ترقية `CACHE_NAME` في `sw.js` ليحصل المستخدمون على التحديث.
- **تعديل وترقية Service Worker (الكاش والعمل Offline):**
  - يتم التعديل في `sw.js`. تذكر تغيير `CACHE_NAME` عند إضافة ملفات جديدة للأصول الثابتة.
- **تعديل تفضيلات الصوت (TTS Voices):**
  - يتم ضبط ترتيب الأصوات وقائمة الأسماء الرجالية المدعومة داخل كائن منطق الصوت في `index.html`، وتوثيق أي اسم جديد بمصدر رسمي في `docs/tts_voices.md`.

---

## 🧰 5. قائمة الأدوات والسكربتات واستخداماتها (Tools & Scripts)

| السكربت / الأداة | بيئة التشغيل | الهدف منها وكيفية تشغيلها |
|---|:---:|---|
| **`verify_vocab.py`** | Python | الفاحص الأساسي للمفردات. يتحقق من تطابق 1,160 كلمة مع البصمة التشفيرية (`python verify_vocab.py`). |
| **`tests/mutation_verifier_test.py`** | Python | يثبت كفاءة الفاحص بحزمة اختبارات الطفرات والانحدار والتأكد من رفضها جميعاً (`python tests/mutation_verifier_test.py`). |
| **`tests/test_mutation_runner_logic.ps1`** | PowerShell | اختبار ذاتي للتحقق من دقة كشف مشغل ويندوز لحالات النجاح والفشل (`powershell -File tests/test_mutation_runner_logic.ps1`). |
| **`tests/test_baseline_update.py`** | Python | يثبت قدرة الفاحص على تحديث المرجع وتسجيل الهاش في بيئة معزولة (`python tests/test_baseline_update.py`). |
| **`scripts/build_site.js`** | Node.js | يجمع ملفات التطبيق الإنتاجية في مجلد `site/` للنشر (`node scripts/build_site.js`). |
| **`scripts/scan_font_sizes.js`** | Node/Chrome | يفحص عناصر الصفحة ويتأكد من عدم وجود أي خط يقل عن 12px لمنع مشاكل القراءة والوصول (`node scripts/scan_font_sizes.js`). |
| **`scripts/chrome_overflow_audit.js`** | Node/Chrome | يفحص التجاوب وعدم التجاوز الأفقي للشاشات (320px، 360px، 390px، 1280px) (`node scripts/chrome_overflow_audit.js`). |
| **`scripts/verify_console_flow.js`** | Node/Chrome | يتنقل بين كافة الشاشات ويتأكد من تسجيل 0 أخطاء في Console (`node scripts/verify_console_flow.js`). |
| **`scripts/serve_subpath.js`** | Node.js | خادم محلي يخدم المسار الفرعي `/german-app/` للتحقق من توافق المسارات (`node scripts/serve_subpath.js`). |
| **`scripts/serve_pages_emulator.js`** | Node.js | خادم محلي يحاكي توجيه Cloudflare Pages وتحويل 308 لـ `/index.html` (`node scripts/serve_pages_emulator.js`). |
| **`scripts/check_actions_versions.js`** | Node.js | يفحص توافر إصدارات GitHub Actions عبر GitHub API والتأكد من اعتمادها على Node 24 (`node scripts/check_actions_versions.js`). |
| **`tests/data_safety_runner.js`** | Node/Chrome | يثبت أمان بيانات المستخدم وحفظ التقدم والإحصائيات و SRS عند ترقية التطبيق من إصدار سابق (`node tests/data_safety_runner.js v1.3-voice`). |
| **`tests/chrome_axe_runner.js`** | Node/Chrome | فحص إمكانية الوصول الكاملة بمكتبة axe-core والتأكد من 0 مخالفات WCAG (`node tests/chrome_axe_runner.js`). |
| **`tests/voice_chrome_runner.js`** | Node/Chrome | فحص أصوات المتصفح الحقيقية والتأكد من تفضيل الأصوات الرجالية الألمانية وحفظ الاختيار (`node tests/voice_chrome_runner.js`). |
| **`tools/run_windows_checks.ps1`** | PowerShell | حزمة الفحص الشاملة على ويندوز (14 خطوة) عبر `Run_Windows_Checks.bat`. |
| **`scripts/build_sync_bundle.js`** | Node.js | بناء الحزمة المستقلة لمزامنة Firebase دون أطر عمل ثقيلة (`node scripts/build_sync_bundle.js`). |
| **`tests/sync_bundle.test.js`** | Node/Vitest | فحص حجم وبنية حزمة المزامنة والتحقق من التراخيص (`npx vitest run tests/sync_bundle.test.js`). |
| **`tests/merge_policy.test.js`** | Node/Vitest | إثبات الخصائص الرياضية للدمج (تبادلي، تكراري، أحادي الاتجاه) (`npx vitest run tests/merge_policy.test.js`). |
| **`tests/sync_manager.test.js`** | Node/Vitest | فحص دورة حياة المزامنة، التخزين المؤقت، وحالات الاتصال/الانقطاع (`npx vitest run tests/sync_manager.test.js`). |
| **`tests/firestore_rules.test.js`** | Node/Vitest + Java 21 | فحص قواعد أمان Firestore (عزل المستخدمين، منع الحقول الغريبة، فحص الأنواع). الفحوصات الساكنة تعمل دائماً، أما فحوصات المحاكي فتظهر **Skipped** إن لم يوجد محاكي، وتفشل عند تشغيلها عبر `npm run test:rules` (يشغّل المحاكي تلقائياً) أو عند ضبط `REQUIRE_EMULATOR=1`. |
| **`tests/sw_cache_version.test.js`** + **`scripts/sw_assets_hash.js`** | Node/Vitest | يمنع نسيان ترقية `CACHE_NAME` عند تغيّر أي ملف مخزّن مؤقتاً (غير HTML). بعد الترقية شغّل `npm run update:sw-baseline` لتحديث `tests/sw_assets_baseline.json`. |
| **`firebase.json`** | Firebase CLI | إعداد محاكي Firestore المحلي لفحوصات القواعد (المنفذ 8080). |
| **`tests/sync_chrome_runner.js`** | Node/Chrome | اختبار E2E واقعي بسياقين حقيقيين في كروم (جهاز أ + جهاز ب) وسيرفر سحابي وهمي (`node tests/sync_chrome_runner.js`). |
| **`tests/sync_cross_device.spec.js`** | Playwright | مواصفة Playwright E2E الشاملة للمزامنة متعددة السياقات وحل التعارضات (`npx playwright test tests/sync_cross_device.spec.js`). |

---

## 🔊 6. خطوات تثبيت أصوات ألمانية إضافية ورجالية على الأجهزة (Adding German Voices)

إذا أظهر التطبيق رسالة تفيد بعدم العثور على صوت ألماني رجالي على جهازك، يمكنك تثبيت حزمة صوتية إضافية عبر إعدادات النظام:

### أ) على نظام Windows 11 و Windows 10
1. افتح **الإعدادات** (Settings) بالضغط على `Windows + I`.
2. انتقل إلى **الوقت واللغة** (Time & language) ثم **اللغة والمنطقة** (Language & region).
3. اضغط على **إضافة لغة** (Add a language)، وابحث عن `German (Germany)` واضغط التالي (Next).
4. تأكد من تحديد خيار **تحويل النص إلى كلام** (Text-to-speech) واضغط **تثبيت** (Install).
5. بعد اكتمال التنزيل، انتقل إلى: **الوقت واللغة** > **الكلام** (Speech) وتحت **الأصوات** (Voices) اختر صوتاً رجالياً مثل Stefan.
- *المصدر الرسمي لـ Microsoft:* [How to download Text-to-Speech languages for Windows](https://support.microsoft.com/en-us/windows/how-to-download-text-to-speech-languages-for-windows-d5a6b612-b3ae-423f-afa5-4f6caf144d1a).

### ب) على نظام Android
1. افتح تطبيق **الإعدادات** (Settings).
2. انتقل إلى **إمكانية الوصول** (Accessibility) > **تحويل النص إلى كلام** (Text-to-speech output).
3. اضغط على أيقونة الترس بجوار **المحرك المفضل** (Preferred engine - Speech Services by Google).
4. اضغط على **تثبيت البيانات الصوتية** (Install voice data)، ثم اختر **الألمانية** (German) ونزّل الحزمة الصوتية.
- *المصدر الرسمي لـ Google:* [Google Text-to-Speech Voice Data Settings](https://support.google.com/accessibility/android/answer/6006983).

### ج) على نظام Apple iOS (iPhone / iPad)
1. افتح تطبيق **الإعدادات** (Settings).
2. انتقل إلى **تسهيلات الاستخدام** (Accessibility) > **المحتوى المنطوق** (Spoken Content).
3. اضغط على **الأصوات** (Voices) واختر **الألمانية** (German).
4. اختر صوتاً رجالياً (مثل Markus أو Yannick) واضغط على زر التنزيل لتثبيته.
- *المصدر الرسمي لـ Apple:* [Hear iPhone speak selected text - Apple Support](https://support.apple.com/guide/iphone/hear-iphone-speak-iph96b214f0/ios).

---

## ☁️ 7. المزامنة السحابية الاختيارية وحفظ التقدم عبر الأجهزة (Cross-Device Cloud Sync)

يتضمن التطبيق ميزة **مزامنة سحابية اختيارية تماماً** تتيح تسجيل الدخول بحساب Google لمزامنة التقدم بين الهاتف والحاسوب والأجهزة اللوحية بسلاسة تامة، مع بقاء التطبيق يعمل بشكل مستقل وبلا إنترنت (Offline-First) ودون أي تغيير لمن لا يرغب في إنشاء حساب.

### 💰 ضمان المجانية الكاملة وحسابات الاستهلاك (Free Tier Quota Math)
تعتمد المزامنة على باقة **Firebase Spark (المجانية بالكامل)**.
- **لا تتطلب إدخال أي بطاقة ائتمان** ولا يمكن أن تفرض أي رسوم مالية على الإطلاق (Hard-Capped Quota).
- **حدود الباقة المجانية اليومية:**
  - سعة التخزين: **1 جيجابايت** (1 GiB).
  - عمليات القراءة: **50,000 عملية قراءة يومياً** (50,000 reads/day).
  - عمليات الكتابة: **20,000 عملية كتابة يومياً** (20,000 writes/day).
  - عمليات الحذف: **20,000 عملية حذف يومياً** (20,000 deletes/day).
- **حساب الاستهلاك الفعلي للمستخدم الشخصي:**
  - يتم تخزين كل تقدم المستخدم في **وثيقة واحدة فقط** لكل مستخدم: `users/{uid}`.
  - حجم الوثيقة الكاملة بجميع الأقسام الـ 30 والإحصائيات والكلمات المميزة يتراوح بين **35 و 50 كيلوبايت فقط** (أقل من 5% من الحد الأقصى المسموح للوثيقة الواحدة وهو 1 ميجابايت).
  - يتم تجميع وحفظ التعديلات آلياً بتقنية Debounce (بفاصل 30 ثانية أو عند مغادرة الصفحة أو إغلاق التطبيق)، ما يعادل نحو **60 إلى 120 عملية كتابة يومياً** أثناء الاستخدام المكثف، أي **أقل من 0.6% من الحصة اليومية المجانية**!
  - القراءة تتم فقط عند فتح التطبيق لأول مرة أو تسجيل الدخول، بمعدل نحو **5 إلى 15 عملية قراءة يومياً** (أقل من 0.03% من الحصة المجانية).

> ⚠️ **تنبيه صارم:** إذا طُلب منك في أي خطوة أثناء إعداد Firebase إدخال بيانات بطاقة بنكية أو الترقية لخطة Blaze المدفوعة، **توقف فوراً ولا تُدخل بطاقتك**؛ فباقة Spark مجانية 100% ولا تتطلب أي بطاقة.

---

### 📋 خطوات الإعداد اليدوي خطوة بخطوة (10-Step Setup Checklist)

اتبع هذه الخطوات البسيطة لإعداد قاعدة بياناتك السحابية الخاصة مجاناً:

1. **نشر التطبيق على Cloudflare Pages أولاً:**
   - انشر التطبيق للحصول على رابط النطاق الإنتاجي الرسمي (مثل: `https://german-app.pages.dev`).
2. **إنشاء مشروع Firebase جديد:**
   - ادخل إلى [Firebase Console](https://console.firebase.google.com/)، واضغط **Add project**.
   - اختر اسماً للمشروع (مثل `german-learning-app`).
   - اختر خطة **Spark (Free)** وتأكد من عدم تفعيل خطة مدفوعة.
3. **تفعيل تسجيل الدخول عبر Google:**
   - من القائمة الجانبية، اختر **Build** ثم **Authentication**.
   - اضغط **Get started**، ومن تبويب **Sign-in method** اختر **Google** وقم بتفعيله (Enable).
   - حدد بريد الدعم الخاص بك ثم اضغط **Save**.
4. **إضافة النطاقات المصرح لها (Authorized Domains):**
   - داخل صفحة **Authentication**، انتقل إلى تبويب **Settings** ثم قسم **Authorized domains**.
   - تأكد من وجود `localhost`، واضغط **Add domain** وأضف نطاقك على Cloudflare Pages (مثل `german-app.pages.dev`).
5. **إنشاء قاعدة بيانات Cloud Firestore:**
   - من القائمة الجانبية، اختر **Build** ثم **Firestore Database**.
   - اضغط **Create database**، واختر الوضع الإنتاجي **Start in production mode**.
   - اختر أقرب موقع جغرافي لك (مثل `europe-west3` فرانكفورت أو `europe-west1` بلجيكا) واضغط **Enable**.
6. **تطبيق قواعد الأمان (Firestore Security Rules):**
   - داخل صفحة **Firestore Database**، انتقل إلى تبويب **Rules**.
   - امسح القواعد الافتراضية، وانسخ محتوى الملف المرفق في المشروع [firestore.rules](./firestore.rules) بالكامل والصقه هناك، ثم اضغط **Publish**.
   - تضمن هذه القواعد منع أي شخص من قراءة أو كتابة أي بيانات سوى صاحب الحساب نفسه على وثيقته الخاصة `users/{uid}` مع التحقق من صحة المخطط.
7. **تقييد مفتاح الواجهة البرمجية (Restrict Web API Key):**
   - في [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials)، افتح المفتاح المسمى `Browser key (auto created by Firebase)`.
   - تحت قسم **Application restrictions**، اختر **Web sites** وأضف نطاقاتك المسموح بها فقط (`https://<project>.pages.dev/*` و `http://localhost:*`).
8. **نسخ الإعدادات إلى `firebase-config.js`:**
   - في Firebase Console، اذهب إلى **Project settings** (أيقونة الترس) > **General**.
   - تحت قسم **Your apps**، اضغط على أيقونة الويب `</>` لتسجيل تطبيق ويب.
   - انسخ كائن الإعدادات `firebaseConfig` والصق قيمه في ملف [firebase-config.js](./firebase-config.js) في مشروعك.
9. **اختبار المزامنة عبر جهازين:**
   - افتح التطبيق على حاسوبك، وسجل الدخول بحساب Google وأجب عن بعض الأسئلة واضغط "حفظ سحابي".
   - افتح التطبيق على هاتفك وسجل الدخول بنفس الحساب، وستجد تقدمك وإحصائياتك ومستويات إتقانك قد ظهرت تلقائياً!
10. **مراقبة الاستهلاك الشهري في الكونسول:**
    - يمكنك في أي وقت الدخول إلى **Usage and billing** داخل Firebase Console للاطمئنان على بقاء استهلاكك ضمن الصفر دولار ونسب الاستخدام المتناهية الصغر.

---

### 🛡️ أمان مفاتيح الويب (Why Web API Keys are Public by Design)
في تطبيقات الويب أحادية الصفحة (SPAs) وتطبيقات الويب التقدمية (PWAs)، تُعتبر مفاتيح Firebase Web API مفاتيح تعريفية للمشروع (Identifiers) وليست أسراراً مشفرة. وهي موجودة في كود المتصفح لدى ملايين التطبيقات العالمية.
- **أين يكمن الأمان الحقيقي؟**
  1. **قواعد الأمان (Firestore Security Rules):** هي خط الدفاع الصارم؛ حيث يرفض خادم Google أي طلب قراءة أو كتابة لا يحمل توقيع المستخدم الصالح `request.auth.uid == userId`.
  2. **تقييد النطاقات (HTTP Referrer Restriction):** يمنع استخدام المفتاح من خارج نطاق موقعك المعتمد.

---

### 🔒 قاعدة عدم المساس بالمفردات ومفاتيح التقدم (Vocabulary Immutability Rule)
يعتمد نظام المزامنة والتقدم على مفاتيح مشتقة من فهارس الكلمات داخل كل قسم (`catId_idx`):
- **لا يجوز أبداً إدراج أو حذف أو إعادة ترتيب الكلمات** داخل أي قسم دون كتابة سكربت ترقية لقاعدة البيانات (Data Migration Script)، لأن تغيير ترتيب الكلمات سينقل إتقان كلمة إلى كلمة أخرى لدى المستخدمين في السحابة.
- تظل بصمة المفردات التشفيرية المعتمدة (Canonical SHA-256) هي المرجع الحاكم للنزاهة الرقمية:
  `bc4f1b85a867c1f126cdde46eed031b0600440e84708c1e4e264d5106ef8e417`.

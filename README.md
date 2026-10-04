# 🇩🇪 تطبيق تعلّم الألمانية للمتحدثين بالعربية · Deutsch lernen

تطبيق ويب تقدمي (PWA) متكامل لتعليم اللغة الألمانية، يضم 1,160 مفردة مفحوصة آلياً وموزعة على 30 قسماً، مع صيغ الجمع، التكرار المتباعد الذكي (SRS)، أنماط استماع وبطاقات 3D، وتفضيل تلقائي لأصوات النطق الألمانية الرجالية، ويعمل بكفاءة تامة دون الحاجة إلى اتصال بالإنترنت.

---

## 📁 خريطة الملفات والمستودع (Repository File Map)

```text
German_App/
├── index.html                 # التطبيق الأساسي (الواجهة، المنطق، المفردات، إدارة الصوت)
├── manifest.json              # ملف تعريف تطبيق الويب التقدمي (PWA)
├── sw.js                      # خادم الخدمة (Service Worker v8) لإدارة الكاش والعمل Offline
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
1. **الفحص الأول (أونلاين - Online):** افتح الرابط المباشر في المتصفح، وتأكد من تحميل كافة الأقسام (30 قسماً) وتفعيل كاش Service Worker v8 دون أي أخطاء في Console.
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
   - افتح ملف `sw.js` وقم بزيادة رقم الإصدار في `CACHE_NAME` (مثلاً من `deutsch-lernen-v8` إلى `deutsch-lernen-v9`).
   - اختبار `tests/sw_static_check.test.js` يتحقق من اسم الكاش تلقائياً.
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
| **`tools/run_windows_checks.ps1`** | PowerShell | حزمة الفحص الشاملة على ويندوز (12 خطوة) عبر `Run_Windows_Checks.bat`. |

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

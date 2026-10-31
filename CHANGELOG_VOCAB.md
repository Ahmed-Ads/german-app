
## [2026-10-02 22:59:29] Phase 4 Officially Approved Vocabulary Modifications
- **Authority / Approval:** User explicit approval for Phase 4.
- **Linguistic Sources:** Duden (duden.de), DWDS (dwds.de), Hans Wehr, Almaany.
- **Previous Canonical SHA-256:** `5f89e187ccf3f2350a2287c1c71746f6486fe990727fb58484e09b8922d341dc`
- **New Canonical SHA-256:** `e9d4dece46ab9df37f4bb91790ca46a9613a8aaa975a182c46fe54b133f5a716`
- **Total Categories:** 30 (Untouched)
- **Total Words:** 1,160 (Preserved at exact indices, zero insertions, zero deletions)

### Modifications Applied:
1. `gewuerze[13]`: `Knoblauchpulver` -> `a: das` (Duden compound rule for `-pulver`).
2. `musik[27]`: `Panflöte` -> `ar: ناي بان (مزمار بان)`, `sar: بنَفَس لطيف يستخرج من ناي بان أنغاماً طبيعية ساحرة.` (Corrected Greek god Pan mistranslation).
3. `verkehr[6]`: `U-Bahn` -> `s: Die U-Bahn fährt schnell und pünktlich unter den belebten Straßen der Stadt.`, `sar: يسير المترو بسرعة وانتظام تحت شوارع المدينة المزدحمة.` (Replaced Straßenbahn sentence).
4. `pl -> null` (13 uncountable mass nouns per Duden Singularetantum):
   - `gemuese[9]`: `Spinat` -> `pl: null`
   - `gemuese[15]`: `Mais` -> `pl: null`
   - `gemuese[22]`: `Lauch` -> `pl: null`
   - `gemuese[24]`: `Blumenkohl` -> `pl: null`
   - `milch[0]`: `Milch` -> `pl: null`
   - `milch[6]`: `Buttermilch` -> `pl: null`
   - `milch[13]`: `Kaffeesahne` -> `pl: null`
   - `milch[14]`: `Sojamilch` -> `pl: null`
   - `gewuerze[0]`: `Pfeffer` -> `pl: null`
   - `gewuerze[6]`: `Petersilie` -> `pl: null`
   - `gewuerze[8]`: `Kurkuma` -> `pl: null`
   - `gewuerze[37]`: `Zucker` -> `pl: null`
   - `suessigkeiten[7]`: `Honig` -> `pl: null`
5. `kleidung[6]`: `Schuhe` -> `a: der`, `n: Schuh`, `pl: die Schuhe`, `s: Er putzt jeden Samstag seinen ledernen Schuh.`, `sar: هو ينظف كل سبت حذاءه الجلدي.`
6. `suessigkeiten[24]`: `Gummibärchen` -> `a: das`, `n: Gummibärchen`, `pl: die Gummibärchen` (Neuter diminutive rule).

## [2026-10-02 23:11:21] Revert Schuh Example Sentence to Original Plural
- **Authority / Instruction:** User requested restoring the original plural example sentence for Schuh while keeping `a: der, n: Schuh, pl: die Schuhe`.
- **Previous Canonical SHA-256:** `e9d4dece46ab9df37f4bb91790ca46a9613a8aaa975a182c46fe54b133f5a716`
- **New Canonical SHA-256:** `8108166f38db8ea9d4f7e35cc45aac26c707e3b32c8ad13221879e1df09d4a09`
- **Item ID:** `kleidung[6]` (`Schuh`)
- **German Sentence (s):** `Er putzt jeden Samstag seine ledernen Schuhe.`
- **Arabic Translation (sar):** `هو ينظف كل سبت حذاءه الجلدي.`

## [2026-10-02 23:39:58] Final Approved Vocabulary Updates
- **Authority / Approval:** User explicit approval for Sakko, Kaki, Zwetschge, Mirabelle.
- **Previous Canonical SHA-256:** `8108166f38db8ea9d4f7e35cc45aac26c707e3b32c8ad13221879e1df09d4a09`
- **New Canonical SHA-256:** `a06623dfbcf1980c8a153fc79aca664bdd3bebecccd0f5f7dc7d67857fb8e8f3`
- **Items Modified:**
  1. `kleidung[33]` (Sakko): `a: das` (Standard neuter form in Duden).
  2. `obst[39]` (Kaki): `a: die` (Standard feminine form in Duden `die Kaki`, sentence updated to `Die süße Kaki isst man im Spätherbst.`).
  3. `obst[41]` (Zwetschge): `ar: برقوق أزرق بيضاوي` (Disambiguated Damson/prune plum from round Pflaume).
  4. `obst[42]` (Mirabelle): `ar: برقوق أصفر صغير`, `sar: البرقوق الأصفر الصغير نكهته عطرية ورفيعة.`, `note: برقوق صغير أصفر حلو المذاق`.
- **Not Modified (Retained per instruction):**
  - `suessigkeiten[4]` (Bonbon): `a: der` (Primary form listed in Duden `der oder (österreichisch nur:) das Bonbon`).
  - `obst[44]` (Physalis): `pl: die Physalen` (Botanical plural attested in Duden).
  - `gewuerze[1]` (Salz): `pl: die Salze` (Chemical/variety plural in Duden).
  - `getreide[1]` (Mehl): `pl: die Mehle` (Variety plural in Duden).
  - `getraenke[38]` (Pils): `pl: die Pils` (Primary plural in Duden/DWDS).
  - `wetter[15]` (Klima): `pl: die Klimata` (Primary plural in Duden/DWDS).

## [2026-10-02 23:55:45] Authorized Baseline Update
- **Reason:** Remove Mirabelle note, revert Kaki sar to original, keep minimal edits strictly per user instructions
- **Source:** User instruction / Duden
- **Target Item IDs:** obst_39,obst_41,obst_42,kleidung_33
- **Previous SHA-256:** `a06623dfbcf1980c8a153fc79aca664bdd3bebecccd0f5f7dc7d67857fb8e8f3`
- **New SHA-256:** `bc4f1b85a867c1f126cdde46eed031b0600440e84708c1e4e264d5106ef8e417`

### Clarification Note on Sources and Verification Scope
- **Authoritative Reference Dictionaries:** The sources listed in earlier changelog entries (Duden, DWDS, Hans Wehr, Almaany, PONS) are the authoritative reference dictionaries consulted during the audit process. Not every individual vocabulary entry was reviewed or verified by a human lexicographer.
- **Verification Scope:** German vocabulary headword spellings, grammatical genders/articles, and plurals are mechanically verified against curated word lists and official lexical databases. Arabic translations and example sentences have not undergone an exhaustive human review.

## [2026-10-10 15:09:52] Authorized Baseline Update
- **Reason:** Arabic letters accidentally inside German word 'behutsam' in berufe_26 sentence
- **Source:** German spelling / Duden
- **Target Item IDs:** berufe_26_s
- **Previous SHA-256:** `bc4f1b85a867c1f126cdde46eed031b0600440e84708c1e4e264d5106ef8e417`
- **New SHA-256:** `420c831eaead691b7218b3bef7d7c8c2dee90b47bf2e0a440c03b69829022fed`

## [2026-10-16 21:21:38] Authorized Baseline Update
- **Reason:** Added permanent word ids; no other change
- **Source:** feat/stable-word-ids
- **Target Item IDs:** all_1160_words
- **Previous SHA-256:** `420c831eaead691b7218b3bef7d7c8c2dee90b47bf2e0a440c03b69829022fed`
- **New SHA-256:** `9815eb51167cd7f57191b0fd5ea452a10f1f9df331d871b119d105d9a24a33b7`

## [2026-10-18 20:31:41] Authorized Baseline Update
- **Reason:** Owner-approved vocabulary review: 208 words removed, 145 field edits; see docs/vocab_changes_batch1.json
- **Source:** Owner / docs/vocab_changes_batch1.json
- **Target Item IDs:** docs/vocab_changes_batch1.json (208 removed, 145 edited)
- **Previous SHA-256:** `9815eb51167cd7f57191b0fd5ea452a10f1f9df331d871b119d105d9a24a33b7`
- **New SHA-256:** `bdb4224842632072b7a4de2986963e8fa30ce027fedd80847f0e6c45bbe6434d`

## [2026-10-29 14:59:24] Authorized Baseline Update
- **Reason:** Add new category verben with 77 A1 verbs (infinitive, Arabic gloss, hand-written example sentence and note); conjugation data stored separately in VERB_FORMS
- **Source:** Principal parts of 44 irregular verbs cross-checked against the Klett Deutsch intensiv Wortschatz B2 irregular-verb list (44/44 match); gefallen, lesen, heissen, oeffnen, reisen checked on Duden/Wiktionary/verbformen; levels are the maintainer's own estimate; no exam word lists used
- **Target Item IDs:** verben.*
- **Previous SHA-256:** `bdb4224842632072b7a4de2986963e8fa30ce027fedd80847f0e6c45bbe6434d`
- **New SHA-256:** `7b4dc30d9ca9407142391356beb2eada26c9fabf3ad27a841d4fe6468139aa77`

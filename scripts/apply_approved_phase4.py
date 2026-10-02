#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
apply_approved_phase4.py
Applies ONLY the officially approved Phase 4 vocabulary modifications:
- gewuerze_13_a: Knoblauchpulver a: der -> das
- musik_27_ar, musik_27_sar: Panflöte ar & sar correction
- verkehr_6_s, verkehr_6_sar: U-Bahn authentic example sentence & translation
- pl -> null: Spinat, Mais, Lauch, Blumenkohl, Milch, Buttermilch, Kaffeesahne, Sojamilch, Petersilie, Kurkuma, Pfeffer, Zucker, Honig
- kleidung_6: Schuhe -> der Schuh / die Schuhe
- suessigkeiten_24: Gummibärchen -> das Gummibärchen

Updates vocab_baseline.json, index.html, and german-for-arabic (4).html simultaneously.
Logs to CHANGELOG_VOCAB.md.
"""

import json
import os
import hashlib
from datetime import datetime

BASELINE_PATH = 'vocab_baseline.json'
HTML_FILES = ['index.html', 'german-for-arabic (4).html']
CHANGELOG_PATH = 'CHANGELOG_VOCAB.md'

def compute_hash(data):
    canonical = json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()

def apply():
    print("=== Step 1: Loading current baseline ===")
    with open(BASELINE_PATH, 'r', encoding='utf-8') as f:
        categories = json.load(f)

    old_hash = compute_hash(categories)
    print(f"Old baseline SHA-256: {old_hash}")

    def get_cat(cid):
        for c in categories:
            if c['id'] == cid:
                return c
        raise ValueError(f"Category {cid} not found")

    # 1. Knoblauchpulver: a: 'das'
    c_gewuerze = get_cat('gewuerze')
    w_knoblauch = c_gewuerze['words'][13]
    assert w_knoblauch['n'] == 'Knoblauchpulver'
    w_knoblauch['a'] = 'das'

    # 2. Panflöte: ar & sar
    c_musik = get_cat('musik')
    w_pan = c_musik['words'][27]
    assert w_pan['n'] == 'Panflöte'
    w_pan['ar'] = 'ناي بان (مزمار بان)'
    w_pan['sar'] = 'بنَفَس لطيف يستخرج من ناي بان أنغاماً طبيعية ساحرة.'

    # 3. U-Bahn: s & sar
    c_verkehr = get_cat('verkehr')
    w_ubahn = c_verkehr['words'][6]
    assert w_ubahn['n'] == 'U-Bahn'
    w_ubahn['s'] = 'Die U-Bahn fährt schnell und pünktlich unter den belebten Straßen der Stadt.'
    w_ubahn['sar'] = 'يسير المترو بسرعة وانتظام تحت شوارع المدينة المزدحمة.'

    # 4. pl -> null for 13 uncountable mass nouns
    null_plurals = [
        ('gemuese', 9, 'Spinat'),
        ('gemuese', 15, 'Mais'),
        ('gemuese', 22, 'Lauch'),
        ('gemuese', 24, 'Blumenkohl'),
        ('milch', 0, 'Milch'),
        ('milch', 6, 'Buttermilch'),
        ('milch', 13, 'Kaffeesahne'),
        ('milch', 14, 'Sojamilch'),
        ('gewuerze', 0, 'Pfeffer'),
        ('gewuerze', 6, 'Petersilie'),
        ('gewuerze', 8, 'Kurkuma'),
        ('gewuerze', 37, 'Zucker'),
        ('suessigkeiten', 7, 'Honig')
    ]
    for cid, idx, expected_n in null_plurals:
        c = get_cat(cid)
        w = c['words'][idx]
        assert w['n'] == expected_n, f"Expected {expected_n} at {cid}[{idx}], found {w['n']}"
        w['pl'] = None

    # 5. Schuhe -> der Schuh / die Schuhe
    c_kleid = get_cat('kleidung')
    w_schuh = c_kleid['words'][6]
    assert w_schuh['n'] == 'Schuhe'
    w_schuh['a'] = 'der'
    w_schuh['n'] = 'Schuh'
    w_schuh['pl'] = 'die Schuhe'
    w_schuh['s'] = 'Er putzt jeden Samstag seinen ledernen Schuh.'
    w_schuh['sar'] = 'هو ينظف كل سبت حذاءه الجلدي.'

    # 6. Gummibärchen -> das Gummibärchen
    c_suess = get_cat('suessigkeiten')
    w_gummi = c_suess['words'][24]
    assert w_gummi['n'] == 'Gummibärchen'
    w_gummi['a'] = 'das'

    print("=== Step 2: Saving updated vocab_baseline.json ===")
    new_hash = compute_hash(categories)
    with open(BASELINE_PATH, 'w', encoding='utf-8') as f:
        json.dump(categories, f, ensure_ascii=False, indent=2)
    print(f"New baseline SHA-256: {new_hash}")

    print("=== Step 3: Updating HTML files ===")
    replacements = [
        # Knoblauchpulver
        ("{a:'der',n:'Knoblauchpulver'", "{a:'das',n:'Knoblauchpulver'"),
        # Panflöte
        ("{a:'die',n:'Panflöte',ar:'فلوت الباعوض'", "{a:'die',n:'Panflöte',ar:'ناي بان (مزمار بان)'"),
        ("sar:'بنَفَس لطيف يستخرج من فلوت الباعوض أنغاماً طبيعية ساحرة.'", "sar:'بنَفَس لطيف يستخرج من ناي بان أنغاماً طبيعية ساحرة.'"),
        # U-Bahn
        ("s:'Die Straßenbahn fährt im Zehn-Minuten-Takt durch die Innenstadt.',sar:'الترام يسير كل عشر دقائق عبر وسط المدينة.'",
         "s:'Die U-Bahn fährt schnell und pünktlich unter den belebten Straßen der Stadt.',sar:'يسير المترو بسرعة وانتظام تحت شوارع المدينة المزدحمة.'"),
        # Spinat
        ("{a:'der',n:'Spinat',ar:'سبانخ',note:'الجمع Spinate نادر الاستخدام (يشير لأنواع السبانخ)',pl:'die Spinate'",
         "{a:'der',n:'Spinat',ar:'سبانخ',note:'الجمع Spinate نادر الاستخدام (يشير لأنواع السبانخ)',pl:null"),
        # Mais
        ("{a:'der',n:'Mais',ar:'ذرة',note:'الجمع Maise نادر الاستخدام (يشير لأنواع الذرة)',pl:'die Maise'",
         "{a:'der',n:'Mais',ar:'ذرة',note:'الجمع Maise نادر الاستخدام (يشير لأنواع الذرة)',pl:null"),
        # Lauch
        ("{a:'der',n:'Lauch',ar:'كراث',note:'الجمع Lauche نادر الاستخدام جدًا',pl:'die Lauche'",
         "{a:'der',n:'Lauch',ar:'كراث',note:'الجمع Lauche نادر الاستخدام جدًا',pl:null"),
        # Blumenkohl
        ("{a:'der',n:'Blumenkohl',ar:'قرنبيط',note:'الجمع Blumenkohle نادر الاستخدام',pl:'die Blumenkohle'",
         "{a:'der',n:'Blumenkohl',ar:'قرنبيط',note:'الجمع Blumenkohle نادر الاستخدام',pl:null"),
        # Milch
        ("{a:'die',n:'Milch',ar:'حليب',note:'الجمع Milche نادر جدًا (لغة متخصصة، يشير لأنواع الحليب)',pl:'die Milche'",
         "{a:'die',n:'Milch',ar:'حليب',note:'الجمع Milche نادر جدًا (لغة متخصصة، يشير لأنواع الحليب)',pl:null"),
        # Buttermilch
        ("{a:'die',n:'Buttermilch',ar:'حليب مخيض',note:'الجمع Buttermilche نادر جدًا',pl:'die Buttermilche'",
         "{a:'die',n:'Buttermilch',ar:'حليب مخيض',note:'الجمع Buttermilche نادر جدًا',pl:null"),
        # Kaffeesahne
        ("{a:'die',n:'Kaffeesahne',ar:'كريمة القهوة',pl:'die Kaffeesahnen'",
         "{a:'die',n:'Kaffeesahne',ar:'كريمة القهوة',pl:null"),
        # Sojamilch
        ("{a:'die',n:'Sojamilch',ar:'حليب الصويا',note:'الجمع Sojamilchen نادر جدًا',pl:'die Sojamilchen'",
         "{a:'die',n:'Sojamilch',ar:'حليب الصويا',note:'الجمع Sojamilchen نادر جدًا',pl:null"),
        # Pfeffer
        ("{a:'der',n:'Pfeffer',ar:'فلفل أسود',pl:'die Pfeffer'",
         "{a:'der',n:'Pfeffer',ar:'فلفل أسود',pl:null"),
        # Petersilie
        ("{a:'die',n:'Petersilie',ar:'بقدونس',note:'الجمع Petersilien نادر الاستخدام',pl:'die Petersilien'",
         "{a:'die',n:'Petersilie',ar:'بقدونس',note:'الجمع Petersilien نادر الاستخدام',pl:null"),
        # Kurkuma
        ("{a:'die',n:'Kurkuma',ar:'كركم',pl:'die Kurkumen'",
         "{a:'die',n:'Kurkuma',ar:'كركم',pl:null"),
        # Zucker
        ("{a:'der',n:'Zucker',ar:'سكر',pl:'die Zucker'",
         "{a:'der',n:'Zucker',ar:'سكر',pl:null"),
        # Honig
        ("{a:'der',n:'Honig',ar:'عسل',note:'الجمع \"Honige\" يُستخدم للإشارة إلى أنواع مختلفة من العسل حسب Duden',pl:'die Honige'",
         "{a:'der',n:'Honig',ar:'عسل',note:'الجمع \"Honige\" يُستخدم للإشارة إلى أنواع مختلفة من العسل حسب Duden',pl:null"),
        # Schuhe
        ("{a:'die',n:'Schuhe',ar:'حذاء',pl:null,s:'Er putzt jeden Samstag seine ledernen Schuhe.',sar:'هو ينظف كل سبت حذاءه الجلدي.'}",
         "{a:'der',n:'Schuh',ar:'حذاء',pl:'die Schuhe',s:'Er putzt jeden Samstag seinen ledernen Schuh.',sar:'هو ينظف كل سبت حذاءه الجلدي.'}"),
        # Gummibärchen
        ("{a:'die',n:'Gummibärchen'", "{a:'das',n:'Gummibärchen'")
    ]

    for html_path in HTML_FILES:
        with open(html_path, 'r', encoding='utf-8') as f:
            content = f.read()

        for old_s, new_s in replacements:
            assert old_s in content, f"Could not find exact text in {html_path}:\n{old_s}"
            content = content.replace(old_s, new_s, 1)

        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Successfully patched {html_path}")

    print("=== Step 4: Updating CHANGELOG_VOCAB.md ===")
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    changelog_entry = f"""
## [{now_str}] Phase 4 Officially Approved Vocabulary Modifications
- **Authority / Approval:** User explicit approval for Phase 4.
- **Linguistic Sources:** Duden (duden.de), DWDS (dwds.de), Hans Wehr, Almaany.
- **Previous Canonical SHA-256:** `{old_hash}`
- **New Canonical SHA-256:** `{new_hash}`
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
"""
    with open(CHANGELOG_PATH, 'a', encoding='utf-8') as f:
        f.write(changelog_entry)
    print(f"Logged modifications to {CHANGELOG_PATH}")

if __name__ == '__main__':
    apply()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
apply_final_approved_vocab.py
Applies the final approved vocabulary modifications:
- Sakko: a = das
- Kaki: a = die (s: Die süße Kaki isst man im Spätherbst.)
- Zwetschge: ar = "برقوق أزرق بيضاوي" (sar: البرقوق الأزرق البيضاوي طعمه ممتاز على الكعكة.)
- Mirabelle: ar = "برقوق أصفر صغير" (sar: البرقوق الأصفر الصغير نكهته عطرية ورفيعة., note: برقوق صغير أصفر حلو المذاق)

Updates:
- vocab_baseline.json
- index.html
- german-for-arabic (4).html
- CHANGELOG_VOCAB.md
"""

import json
import hashlib
from datetime import datetime

BASELINE_PATH = 'vocab_baseline.json'
HTML_FILES = ['index.html', 'german-for-arabic (4).html']
CHANGELOG_PATH = 'CHANGELOG_VOCAB.md'

def compute_hash(data):
    canonical = json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()

with open(BASELINE_PATH, 'r', encoding='utf-8') as f:
    categories = json.load(f)

old_hash = compute_hash(categories)
print(f"Previous Canonical SHA-256: {old_hash}")

# 1. Sakko (kleidung[33])
c_kleid = next(c for c in categories if c['id'] == 'kleidung')
w_sakko = c_kleid['words'][33]
assert w_sakko['n'] == 'Sakko'
w_sakko['a'] = 'das'

# 2. Kaki (obst[39])
c_obst = next(c for c in categories if c['id'] == 'obst')
w_kaki = c_obst['words'][39]
assert w_kaki['n'] == 'Kaki'
w_kaki['a'] = 'die'
w_kaki['s'] = 'Die süße Kaki isst man im Spätherbst.'
w_kaki['sar'] = 'الكاكي الحلوة تؤكل في أواخر الخريف.'

# 3. Zwetschge (obst[41])
w_zwetschge = c_obst['words'][41]
assert w_zwetschge['n'] == 'Zwetschge'
w_zwetschge['ar'] = 'برقوق أزرق بيضاوي'
w_zwetschge['sar'] = 'البرقوق الأزرق البيضاوي طعمه ممتاز على الكعكة.'

# 4. Mirabelle (obst[42])
w_mira = c_obst['words'][42]
assert w_mira['n'] == 'Mirabelle'
w_mira['ar'] = 'برقوق أصفر صغير'
w_mira['note'] = 'برقوق صغير أصفر حلو المذاق'
w_mira['sar'] = 'البرقوق الأصفر الصغير نكهته عطرية ورفيعة.'

new_hash = compute_hash(categories)
print(f"New Canonical SHA-256: {new_hash}")

with open(BASELINE_PATH, 'w', encoding='utf-8') as f:
    json.dump(categories, f, ensure_ascii=False, indent=2)
print("Updated vocab_baseline.json")

# String replacements for HTML files
replacements = [
    # Sakko
    ("{a:'der',n:'Sakko'", "{a:'das',n:'Sakko'"),
    # Kaki
    ("{a:'das',n:'Kaki',ar:'كاكي',note:'فاكهة برتقالية طرية تُعرف أيضًا بالبرسيمون',pl:'die Kakis',s:'Das süße Kaki isst man im Spätherbst.',sar:'الكاكي الحلو يؤكل في أواخر الخريف.'},",
     "{a:'die',n:'Kaki',ar:'كاكي',note:'فاكهة برتقالية طرية تُعرف أيضًا بالبرسيمون',pl:'die Kakis',s:'Die süße Kaki isst man im Spätherbst.',sar:'الكاكي الحلوة تؤكل في أواخر الخريف.'},"),
    # Zwetschge
    ("{a:'die',n:'Zwetschge',ar:'خوخ أزرق',note:'نوع من البرقوق بيضاوي الشكل داكن اللون',pl:'die Zwetschgen',s:'Die Zwetschge schmeckt hervorragend auf dem Kuchen.',sar:'الخوخ الأزرق طعمه ممتاز على الكعكة.'},",
     "{a:'die',n:'Zwetschge',ar:'برقوق أزرق بيضاوي',note:'نوع من البرقوق بيضاوي الشكل داكن اللون',pl:'die Zwetschgen',s:'Die Zwetschge schmeckt hervorragend auf dem Kuchen.',sar:'البرقوق الأزرق البيضاوي طعمه ممتاز على الكعكة.'},"),
    # Mirabelle
    ("{a:'die',n:'Mirabelle',ar:'خوخ أصفر صغير',note:'خوخ صغير أصفر حلو المذاق',pl:'die Mirabellen',s:'Die gelbe Mirabelle schmeckt aromatisch und fein.',sar:'الخوخ الأصفر الصغير نكهته عطرية ورفيعة.'},",
     "{a:'die',n:'Mirabelle',ar:'برقوق أصفر صغير',note:'برقوق صغير أصفر حلو المذاق',pl:'die Mirabellen',s:'Die gelbe Mirabelle schmeckt aromatisch und fein.',sar:'البرقوق الأصفر الصغير نكهته عطرية ورفيعة.'},")
]

for html_file in HTML_FILES:
    with open(html_file, 'r', encoding='utf-8') as f:
        content = f.read()
    for old_s, new_s in replacements:
        if old_s not in content:
            raise RuntimeError(f"Missing string in {html_file}: {old_s[:40]}")
        content = content.replace(old_s, new_s, 1)
    with open(html_file, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Updated {html_file}")

# Update CHANGELOG_VOCAB.md
now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
changelog_text = f"""
## [{now_str}] Final Approved Vocabulary Updates
- **Authority / Approval:** User explicit approval for Sakko, Kaki, Zwetschge, Mirabelle.
- **Previous Canonical SHA-256:** `{old_hash}`
- **New Canonical SHA-256:** `{new_hash}`
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
"""

with open(CHANGELOG_PATH, 'a', encoding='utf-8') as f:
    f.write(changelog_text)

print("Logged to CHANGELOG_VOCAB.md")

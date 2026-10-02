#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
revert_schuh_sentence.py
Reverts the Schuh example sentence to the original plural sentence:
  s: 'Er putzt jeden Samstag seine ledernen Schuhe.'
  sar: 'هو ينظف كل سبت حذاءه الجلدي.'
While keeping:
  a: 'der'
  n: 'Schuh'
  pl: 'die Schuhe'

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

# Update baseline
for cat in categories:
    if cat['id'] == 'kleidung':
        w = cat['words'][6]
        assert w['n'] == 'Schuh'
        w['s'] = 'Er putzt jeden Samstag seine ledernen Schuhe.'
        w['sar'] = 'هو ينظف كل سبت حذاءه الجلدي.'
        break

new_hash = compute_hash(categories)

with open(BASELINE_PATH, 'w', encoding='utf-8') as f:
    json.dump(categories, f, ensure_ascii=False, indent=2)

print(f"Updated vocab_baseline.json: old hash {old_hash} -> new hash {new_hash}")

# Update HTML files
old_line = "{a:'der',n:'Schuh',ar:'حذاء',pl:'die Schuhe',s:'Er putzt jeden Samstag seinen ledernen Schuh.',sar:'هو ينظف كل سبت حذاءه الجلدي.'}"
new_line = "{a:'der',n:'Schuh',ar:'حذاء',pl:'die Schuhe',s:'Er putzt jeden Samstag seine ledernen Schuhe.',sar:'هو ينظف كل سبت حذاءه الجلدي.'}"

for html_file in HTML_FILES:
    with open(html_file, 'r', encoding='utf-8') as f:
        content = f.read()
    if old_line not in content:
        raise RuntimeError(f"Could not find exact Schuh line in {html_file}")
    content = content.replace(old_line, new_line, 1)
    with open(html_file, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Successfully updated {html_file}")

# Log to CHANGELOG_VOCAB.md
now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
entry = f"""
## [{now_str}] Revert Schuh Example Sentence to Original Plural
- **Authority / Instruction:** User requested restoring the original plural example sentence for Schuh while keeping `a: der, n: Schuh, pl: die Schuhe`.
- **Previous Canonical SHA-256:** `{old_hash}`
- **New Canonical SHA-256:** `{new_hash}`
- **Item ID:** `kleidung[6]` (`Schuh`)
- **German Sentence (s):** `Er putzt jeden Samstag seine ledernen Schuhe.`
- **Arabic Translation (sar):** `هو ينظف كل سبت حذاءه الجلدي.`
"""
with open(CHANGELOG_PATH, 'a', encoding='utf-8') as f:
    f.write(entry)

print("Logged to CHANGELOG_VOCAB.md")

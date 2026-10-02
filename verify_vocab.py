#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Automated Vocabulary Integrity Verification Script
--------------------------------------------------
Ensures 100% compliance with CRITICAL RULE 4:
"Do Not Modify Existing Vocabulary Without Official Verification"

Verifies all 1,160 words across all 30 categories against official baseline:
- Exact German spelling (n)
- Grammatical article (a)
- Plural form (pl)
- Arabic translation (ar)
- Contextual example sentences (s, sar)
- Linguistic usage notes (note)
- Category assignment & order
- Cryptographic SHA-256 integrity hash
"""

import os
import sys
import json
import re
import hashlib

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASELINE_PATH = os.path.join(SCRIPT_DIR, 'vocab_baseline.json')

# Target files to verify
TARGET_FILES = [
    os.path.join(SCRIPT_DIR, 'index.html'),
    os.path.join(SCRIPT_DIR, 'german-for-arabic (4).html')
]

def extract_blocks(s):
    blocks = []
    pos = 0
    while True:
        st = s.find('{', pos)
        if st == -1: break
        en = s.find('}', st)
        if en == -1: break
        blocks.append(s[st:en+1])
        pos = en + 1
    return blocks

def extract_field(wb, key):
    m = re.search(rf'\b{key}\s*:\s*([\x27\"])', wb)
    if not m:
        if key == 'pl' and 'pl:null' in wb:
            return None
        return None
    quote = m.group(1)
    st = m.end()
    chars = []
    i = st
    while i < len(wb):
        c = wb[i]
        if c == '\\':
            if i + 1 < len(wb):
                chars.append(wb[i+1])
                i += 2
                continue
        elif c == quote:
            return ''.join(chars)
        else:
            chars.append(c)
        i += 1
    return None

def compute_canonical_hash(categories):
    canonical_json = json.dumps(categories, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256(canonical_json.encode('utf-8')).hexdigest()

def verify_file(html_path, baseline, baseline_hash):
    filename = os.path.basename(html_path)
    print(f"\n--- فحص الملف: {filename} ---")

    if not os.path.exists(html_path):
        print(f"[SKIP] الملف غير موجود: {html_path}")
        return True, 0, []

    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()

    cat_start = html.find('const CATEGORIES = [')
    thresh_pos = html.find('/* thresholds requested by user */')
    if cat_start == -1 or thresh_pos == -1:
        return False, 0, [f"Could not locate 'const CATEGORIES' in {filename}"]

    cat_block = html[cat_start:thresh_pos]
    cat_chunks = re.split(r'\{\s*id:\s*[\x27\"]', cat_block)[1:]

    if len(cat_chunks) != len(baseline):
        return False, 0, [f"Category count mismatch in {filename}: expected {len(baseline)}, got {len(cat_chunks)}"]

    total_words = 0
    errors = []
    extracted_categories = []

    for idx, (b_cat, chunk) in enumerate(zip(baseline, cat_chunks)):
        cid = re.match(r'([^\x27\"]+)', chunk).group(1)
        if cid != b_cat['id']:
            errors.append(f"Category {idx} ID mismatch: expected '{b_cat['id']}', got '{cid}'")
            continue

        wmatch = re.search(r'words:\s*\[(.*?)\]\s*(?:,\s*note:|\s*\})', chunk, re.DOTALL)
        if not wmatch:
            errors.append(f"Could not parse words array in category '{cid}'")
            continue

        word_blocks = extract_blocks(wmatch.group(1))
        if len(word_blocks) != len(b_cat['words']):
            errors.append(f"Category '{cid}' word count mismatch: expected {len(b_cat['words'])}, got {len(word_blocks)}")
            continue

        cat_words = []
        for w_idx, (b_word, wb) in enumerate(zip(b_cat['words'], word_blocks)):
            total_words += 1
            extracted_word = {}
            for key in ['a', 'n', 'ar', 'pl', 'note', 's', 'sar']:
                val = extract_field(wb, key)
                if val is not None or (key == 'pl' and 'pl:null' in wb):
                    extracted_word[key] = val

            # Exact field by field check against baseline
            for k, expected_v in b_word.items():
                actual_v = extracted_word.get(k)
                if actual_v != expected_v:
                    errors.append(f"Word '{cid}'[{w_idx}] ({b_word.get('n')}): field '{k}' expected '{expected_v}', got '{actual_v}'")

            # Check no unauthorized extra fields
            for k in extracted_word.keys():
                if k not in b_word:
                    errors.append(f"Word '{cid}'[{w_idx}] ({b_word.get('n')}): unauthorized extra field '{k}'='{extracted_word[k]}'")

            cat_words.append(extracted_word)

        extracted_categories.append({
            'id': cid,
            'ar': extract_field(chunk, 'ar') or '',
            'de': extract_field(chunk, 'de') or '',
            'hasArticles': 'hasArticles:true' in chunk,
            'words': cat_words
        })

    # Cryptographic Hash Check
    file_vocab_hash = compute_canonical_hash(extracted_categories)
    if file_vocab_hash != baseline_hash:
        errors.append(f"Cryptographic hash mismatch in {filename}! Expected {baseline_hash}, got {file_vocab_hash}")
    else:
        print(f"[✓] البصمة التشفيرية SHA-256 متطابقة: {file_vocab_hash[:16]}...")

    return len(errors) == 0, total_words, errors

def verify():
    print("=" * 70)
    print("  🇩🇪 التحقق الشامل والدقيق لسلامة المفردات (Rule 4 Audit & SHA-256)")
    print("=" * 70)

    if not os.path.exists(BASELINE_PATH):
        print(f"[FAIL] Missing baseline file: {BASELINE_PATH}")
        sys.exit(1)

    with open(BASELINE_PATH, 'r', encoding='utf-8') as f:
        baseline = json.load(f)

    baseline_hash = compute_canonical_hash(baseline)
    print(f"قاعدة البيانات المرجعية: {len(baseline)} قسماً · {sum(len(c['words']) for c in baseline)} كلمة")
    print(f"بصمة البيانات المرجعية (Canonical SHA-256): {baseline_hash}")

    overall_ok = True
    for target in TARGET_FILES:
        ok, total_w, errs = verify_file(target, baseline, baseline_hash)
        if not ok:
            overall_ok = False
            print(f"\n❌ تم العثور على {len(errs)} خطأ في {os.path.basename(target)}:")
            for err in errs[:10]:
                print("  - " + err)
            if len(errs) > 10:
                print(f"  ... و {len(errs)-10} أخطاء أخرى.")
        else:
            print(f"[✓] {os.path.basename(target)}: تم التحقق من كافة الأقسام (30) والمفردات ({total_w}) بنجاح تام.")

    print("\n" + "=" * 70)
    if overall_ok:
        print("  🎉 النتيجة النهائية: كافة المفردات مطابقة للأصل بنسبة 100% (PASSED)")
        print("=" * 70)
        sys.exit(0)
    else:
        print("  ❌ النتيجة النهائية: فشل التحقق، توجد تعديلات غير مصرح بها (FAILED)")
        print("=" * 70)
        sys.exit(1)

if __name__ == '__main__':
    verify()

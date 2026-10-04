#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Automated Vocabulary Integrity Verification System (Phase 3 Production Verifier)
-------------------------------------------------------------------------------
Ensures strict compliance with CRITICAL RULE:
"Do Not Modify Existing Vocabulary Without Official Verification"

Features:
1. Real JavaScript AST / VM Evaluation (No brittle regex heuristics or comment dependencies).
2. Cryptographic Canonical SHA-256 Hash verification.
3. Strict field-by-field, count-by-count, and category-by-category checking.
4. Human-readable diff outputs on any discrepancy.
5. Traceable `--update-baseline` requiring reason, sources, and logging to CHANGELOG_VOCAB.md.
"""

import os
import sys
import re
import json
import argparse
import hashlib
import subprocess
import shutil
from datetime import datetime

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
if hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASELINE_PATH = os.path.join(SCRIPT_DIR, 'vocab_baseline.json')
CHANGELOG_PATH = os.path.join(SCRIPT_DIR, 'CHANGELOG_VOCAB.md')

TARGET_FILES = [
    os.path.join(SCRIPT_DIR, 'index.html')
]

def compute_canonical_hash(categories):
    """Computes deterministic canonical SHA-256 hash."""
    canonical_json = json.dumps(categories, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256(canonical_json.encode('utf-8')).hexdigest()

def extract_vocab_from_html(html_path):
    """
    Extracts the CATEGORIES array from HTML using a real JavaScript VM runner (Node.js).
    Invokes scripts/extract_categories_ast.js via list-form subprocess.
    """
    if not os.path.exists(html_path):
        return None, [f"File does not exist: {html_path}"]

    node_bin = shutil.which('node')
    if not node_bin:
        return None, [
            "CRITICAL ERROR: Node.js executable ('node') was not found in PATH.\n"
            "Please ensure Node.js is installed and available in the system PATH."
        ]

    extractor_script = os.path.join(SCRIPT_DIR, 'scripts', 'extract_categories_ast.js')
    if not os.path.exists(extractor_script):
        return None, [f"Extractor script not found: {extractor_script}"]

    try:
        proc = subprocess.run(
            [node_bin, extractor_script, os.path.abspath(html_path)],
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            check=False
        )
        if proc.returncode != 0:
            return None, [f"Node extraction failed (exit {proc.returncode}): {proc.stderr.strip()}"]

        extracted = json.loads(proc.stdout)
        return extracted, []
    except Exception as e:
        return None, [f"Failed to execute parser: {str(e)}"]

def verify_file(html_path, baseline, baseline_hash, total_baseline_words):
    filename = os.path.basename(html_path)
    print(f"\n--- فحص الملف: {filename} ---")

    if not os.path.exists(html_path):
        err = f"Target file does not exist: {html_path}"
        print(f"[FAIL] ❌ {err}")
        return False, 0, [err]

    extracted, errors = extract_vocab_from_html(html_path)
    if errors:
        return False, 0, errors

    total_words = 0
    diff_errors = []

    if len(extracted) != len(baseline):
        diff_errors.append(f"Category count mismatch: expected {len(baseline)}, got {len(extracted)}")
        return False, 0, diff_errors

    for idx, (b_cat, e_cat) in enumerate(zip(baseline, extracted)):
        cid = b_cat['id']
        if e_cat.get('id') != cid:
            diff_errors.append(f"Category {idx} ID mismatch: expected '{cid}', got '{e_cat.get('id')}'")
            continue

        if e_cat.get('ar') != b_cat.get('ar'):
            diff_errors.append(f"Category '{cid}' Arabic title mismatch: expected '{b_cat.get('ar')}', got '{e_cat.get('ar')}'")
        if e_cat.get('de') != b_cat.get('de'):
            diff_errors.append(f"Category '{cid}' German title mismatch: expected '{b_cat.get('de')}', got '{e_cat.get('de')}'")
        if bool(e_cat.get('hasArticles')) != bool(b_cat.get('hasArticles')):
            diff_errors.append(f"Category '{cid}' hasArticles mismatch: expected {b_cat.get('hasArticles')}, got {e_cat.get('hasArticles')}")

        b_words = b_cat.get('words', [])
        e_words = e_cat.get('words', [])

        if len(e_words) != len(b_words):
            diff_errors.append(f"Category '{cid}' word count mismatch: expected {len(b_words)}, got {len(e_words)}")
            continue

        for w_idx, (b_w, e_w) in enumerate(zip(b_words, e_words)):
            total_words += 1
            wn = b_w.get('n', '')

            # Compare every expected field
            for key in ['a', 'n', 'ar', 'pl', 'note', 's', 'sar']:
                b_val = b_w.get(key)
                e_val = e_w.get(key)

                # Normalize empty string/null for note/pl
                if key == 'pl' and b_val is None and e_val is None:
                    continue
                if key == 'note' and not b_val and not e_val:
                    continue

                if b_val != e_val:
                    diff_errors.append(
                        f"Word '{cid}'[{w_idx}] ({wn}) field '{key}' mismatch:\n"
                        f"    Expected: {json.dumps(b_val, ensure_ascii=False)}\n"
                        f"    Actual  : {json.dumps(e_val, ensure_ascii=False)}"
                    )

            # Check unauthorized extra fields
            for e_k in e_w.keys():
                if e_k not in b_w and e_w[e_k] is not None:
                    diff_errors.append(f"Word '{cid}'[{w_idx}] ({wn}) has unauthorized extra field '{e_k}': {e_w[e_k]}")

    if total_words != total_baseline_words or total_words == 0:
        diff_errors.append(f"Total words verified in {filename} ({total_words}) does not match expected baseline count ({total_baseline_words})")

    file_hash = compute_canonical_hash(extracted)
    if file_hash != baseline_hash:
        diff_errors.append(f"Cryptographic hash mismatch in {filename}!\n    Expected: {baseline_hash}\n    Actual  : {file_hash}")
    else:
        print(f"[OK] [✓] البصمة التشفيرية SHA-256 متطابقة تماماً: {file_hash[:16]}...")

    return len(diff_errors) == 0, total_words, diff_errors

def check_changelog_sync(baseline_hash):
    """
    CI / Pre-commit guard: Ensures that the current canonical hash of vocab_baseline.json
    appears as the 'New SHA-256' value of the LATEST changelog entry in CHANGELOG_VOCAB.md.
    """
    if not os.path.exists(CHANGELOG_PATH):
        return False, f"Changelog file does not exist: {CHANGELOG_PATH}"

    with open(CHANGELOG_PATH, 'r', encoding='utf-8') as f:
        content = f.read()

    entries = re.findall(r'(?ms)^##\s*\[.*?(?=(?:^##\s*\[)|\Z)', content)
    if not entries:
        return False, f"No changelog entries starting with '## [' found in {os.path.basename(CHANGELOG_PATH)}"

    latest_entry = entries[-1]
    hash_match = re.search(r'\*\*(?:New\s+(?:Canonical\s+)?SHA-256):\*\*\s*`([a-f0-9]{64})`', latest_entry, re.IGNORECASE)
    if not hash_match:
        return False, (
            f"CRITICAL CI/PRE-COMMIT CHECK FAILED:\n"
            f"The latest changelog entry in {os.path.basename(CHANGELOG_PATH)} does not contain a valid 'New SHA-256' value."
        )

    latest_new_hash = hash_match.group(1).lower()
    if latest_new_hash != baseline_hash.lower():
        return False, (
            f"CRITICAL CI/PRE-COMMIT CHECK FAILED:\n"
            f"The current canonical hash of vocab_baseline.json:\n"
            f"    {baseline_hash}\n"
            f"does not match the 'New SHA-256' of the latest entry in {os.path.basename(CHANGELOG_PATH)}:\n"
            f"    {latest_new_hash}\n"
            f"Any modification to the vocabulary baseline requires an authorized entry\n"
            f"at the end of CHANGELOG_VOCAB.md documenting the change, rationale, and source."
        )

    return True, None

def update_baseline_cmd(args, baseline):
    if not args.reason or not args.source:
        print("❌ ERROR: --update-baseline REQUIRES both --reason and --source flags!")
        print("Example: python3 verify_vocab.py --update-baseline --reason 'Fix Knoblauchpulver gender' --source 'Duden' --ids 'gewuerze_13_a'")
        sys.exit(1)

    print("=" * 70)
    print("  ⚠️ تحديث قاعدة البيانات المرجعية الرسمية (Deliberate Baseline Update)")
    print("=" * 70)

    # Extract latest from primary source (index.html)
    primary_html = TARGET_FILES[0]
    extracted, errors = extract_vocab_from_html(primary_html)
    if errors or not extracted:
        print(f"❌ ERROR: Failed to extract vocabulary from {primary_html}:")
        for err in errors:
            print("  - " + err)
        sys.exit(1)

    old_hash = compute_canonical_hash(baseline)
    new_hash = compute_canonical_hash(extracted)

    # Write new baseline
    with open(BASELINE_PATH, 'w', encoding='utf-8') as f:
        json.dump(extracted, f, indent=2, ensure_ascii=False)
        f.write('\n')

    # Format changelog entry
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    changelog_entry = f"""
## [{now_str}] Authorized Baseline Update
- **Reason:** {args.reason}
- **Source:** {args.source}
- **Target Item IDs:** {args.ids or 'Not specified'}
- **Previous SHA-256:** `{old_hash}`
- **New SHA-256:** `{new_hash}`
"""
    with open(CHANGELOG_PATH, 'a', encoding='utf-8') as f:
        f.write(changelog_entry)

    print(f"[✓] تم تحديث ملف المرجع: {BASELINE_PATH}")
    print(f"    البصمة السابقة: {old_hash}")
    print(f"    البصمة الجديدة: {new_hash}")
    print(f"[✓] تم تسجيل التحديث في: {CHANGELOG_PATH}")

def main():
    parser = argparse.ArgumentParser(description="Automated Vocabulary Integrity Verification Tool")
    parser.add_argument('--update-baseline', action='store_true', help="Authorized deliberate baseline update flag")
    parser.add_argument('--reason', type=str, help="Mandatory rationale for baseline change")
    parser.add_argument('--source', type=str, help="Authoritative linguistic source citation")
    parser.add_argument('--ids', type=str, help="Target item IDs modified")
    args = parser.parse_args()

    print("=" * 70)
    print("  [AUDIT] 🇩🇪 التحقق الشامل والدقيق لسلامة المفردات (Rule 4 Audit & SHA-256)")
    print("=" * 70)

    if not os.path.exists(BASELINE_PATH):
        print(f"[FAIL] Missing baseline file: {BASELINE_PATH}")
        sys.exit(1)

    with open(BASELINE_PATH, 'r', encoding='utf-8') as f:
        baseline = json.load(f)

    baseline_hash = compute_canonical_hash(baseline)
    total_baseline_words = sum(len(c['words']) for c in baseline)

    print(f"قاعدة البيانات المرجعية: {len(baseline)} قسماً · {total_baseline_words} كلمة")
    print(f"بصمة البيانات المرجعية (Canonical SHA-256): {baseline_hash}")

    if args.update_baseline:
        update_baseline_cmd(args, baseline)
        sys.exit(0)

    # CI / Pre-commit guard check
    cl_ok, cl_err = check_changelog_sync(baseline_hash)
    if not cl_ok:
        print("\n[FAILED] ❌ " + cl_err)
        sys.exit(1)
    print(f"[OK] [✓] توثيق سجل التغييرات: البصمة الحالية موثقة رسمياً في آخر تدوينة في {os.path.basename(CHANGELOG_PATH)}")

    overall_ok = True
    verified_files_count = 0
    total_words_verified = 0

    if not TARGET_FILES:
        print("\n[FAILED] ❌ No target files defined for verification.")
        overall_ok = False

    for target in TARGET_FILES:
        ok, total_w, errs = verify_file(target, baseline, baseline_hash, total_baseline_words)
        if not ok:
            overall_ok = False
            print(f"\n[FAILED] ❌ تم العثور على {len(errs)} اختلاف في {os.path.basename(target)}:")
            for err in errs[:10]:
                print("  - " + err)
            if len(errs) > 10:
                print(f"  ... و {len(errs)-10} اختلافات أخرى.")
        else:
            verified_files_count += 1
            total_words_verified += total_w
            print(f"[OK] [✓] {os.path.basename(target)}: تم التحقق من كافة الأقسام ({len(baseline)}) والمفردات ({total_w}) بنجاح تام.")

    if verified_files_count != len(TARGET_FILES) or len(TARGET_FILES) == 0:
        overall_ok = False
        print(f"\n[FAILED] ❌ لم يتم فحص جميع الملفات المستهدفة بنجاح ({verified_files_count}/{len(TARGET_FILES)}).")

    expected_total_words = total_baseline_words * len(TARGET_FILES)
    if total_words_verified != expected_total_words or total_words_verified == 0:
        overall_ok = False
        print(f"\n[FAILED] ❌ إجمالي المفردات المفحوصة ({total_words_verified}) لا يتطابق مع الإجمالي المرجعي المتوقع ({expected_total_words}).")

    print("\n" + "=" * 70)
    if overall_ok:
        print("  [PASSED] 🎉 النتيجة النهائية: كافة المفردات مطابقة للأصل والمواصفات المعتمدة (PASSED)")
        print("=" * 70)
        sys.exit(0)
    else:
        print("  [FAILED] ❌ النتيجة النهائية: فشل التحقق، توجد تعديلات غير مصرح بها (FAILED)")
        print("=" * 70)
        sys.exit(1)

if __name__ == '__main__':
    main()

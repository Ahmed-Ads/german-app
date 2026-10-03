#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Automated Mutation Testing Suite for verify_vocab.py (Phase 3)
Mutates a temporary copy of index.html in every field type:
- German spelling (1 char)
- Article modification
- Arabic translation (1 char)
- Arabic letter variation (ة -> ه)
- German ß -> ss
- Added hyphen
- Trailing space
- Example sentence modification
- Plural modification
- Word deletion
- Word addition
- Category reordering

Proves that verify_vocab.py FAILS every single mutation.
"""

import os
import sys
import tempfile
import subprocess
import json

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
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
VERIFIER_PATH = os.path.join(ROOT_DIR, 'verify_vocab.py')
INDEX_PATH = os.path.join(ROOT_DIR, 'index.html')

with open(INDEX_PATH, 'r', encoding='utf-8') as f:
    original_html = f.read().replace('\r\n', '\n')

def run_mutation_test(name, mutated_content, expected_err_keyword):
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', suffix='.html', delete=False) as tf:
        tf.write(mutated_content)
        tpath = tf.name

    try:
        # Run verify_vocab.py pointing TARGET_FILES to this temp file
        code = (
            "import sys, os\n"
            f"sys.path.insert(0, {repr(ROOT_DIR)})\n"
            "import verify_vocab\n"
            f"verify_vocab.TARGET_FILES = [{repr(tpath)}]\n"
            "verify_vocab.main()\n"
        )
        cmd = [sys.executable, '-c', code]
        sub_env = os.environ.copy()
        sub_env['PYTHONUTF8'] = '1'
        sub_env['PYTHONIOENCODING'] = 'utf-8'

        res = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            env=sub_env
        )
        combined_output = (res.stdout or "") + (res.stderr or "")

        # 1. Fail immediately as an ERROR if there is an unhandled traceback or encoding crash
        if "Traceback (most recent call last):" in combined_output or "UnicodeEncodeError" in combined_output or "UnicodeDecodeError" in combined_output:
            raise RuntimeError(
                f"CRITICAL ERROR in Mutation Test '{name}': Verifier crashed with unhandled traceback/encoding error:\n"
                f"{combined_output}"
            )

        # 2. Verifier MUST reject the invalid mutation with non-zero exit code
        if res.returncode == 0:
            raise AssertionError(f"Mutation Test '{name}' FAILED: Verifier unexpectedly passed with exit code 0 on invalid mutation!")

        # 3. Verifier MUST contain the expected mismatch message or diff
        if expected_err_keyword not in combined_output:
            raise AssertionError(
                f"Mutation Test '{name}' FAILED: Expected rejection keyword '{expected_err_keyword}' was not found in verifier output.\n"
                f"Verifier Exit Code: {res.returncode}\n"
                f"Verifier Output:\n{combined_output}"
            )

        print(f"[OK] ✅ Mutation Test [{name}]: PASSED (Verifier rejected mutation with '{expected_err_keyword}')")
    finally:
        if os.path.exists(tpath):
            os.remove(tpath)

print("=" * 65)
print("  RUNNING CONTROLLED MUTATION TESTS AGAINST VERIFIER")
print("=" * 65)

# 1. German headword 1 char
run_mutation_test("German_1_char", original_html.replace("n:'Apfel'", "n:'Apfell'", 1), "mismatch")

# 2. Article
run_mutation_test("Article_change", original_html.replace("a:'der',n:'Apfel'", "a:'das',n:'Apfel'", 1), "mismatch")

# 3. Arabic translation
run_mutation_test("Arabic_translation", original_html.replace("ar:'تفاحة'", "ar:'برتقالة'", 1), "mismatch")

# 4. Arabic letter/diacritic variation (ة -> ه)
run_mutation_test("Arabic_ta_marbuta", original_html.replace("ar:'تفاحة'", "ar:'تفاحه'", 1), "mismatch")

# 5. German ß -> ss
run_mutation_test("German_sharp_s", original_html.replace("n:'Weißkohl'", "n:'Weisskohl'", 1), "mismatch")

# 6. Added hyphen
run_mutation_test("Added_hyphen", original_html.replace("n:'U-Bahn'", "n:'U--Bahn'", 1), "mismatch")

# 7. Trailing space
run_mutation_test("Trailing_space", original_html.replace("n:'Apfel'", "n:'Apfel '", 1), "mismatch")

# 8. Sentence change
run_mutation_test("Sentence_edit", original_html.replace("s:'Der Apfel schmeckt süß und frisch.'", "s:'Der Apfel ist rot.'", 1), "mismatch")

# 9. Plural change
run_mutation_test("Plural_edit", original_html.replace("pl:'die Äpfel'", "pl:'die Apfeln'", 1), "mismatch")

# 10. Word deletion
run_mutation_test("Word_deletion", original_html.replace("{a:'der',n:'Apfel',ar:'تفاحة',pl:'die Äpfel',s:'Der Apfel schmeckt süß und frisch.',sar:'التفاحة طعمها حلو وطازج.'},", "", 1), "word count mismatch")

# 11. Word addition
run_mutation_test("Word_addition", original_html.replace("{a:'der',n:'Apfel'", "{a:'der',n:'Apfel_neu',ar:'تفاحة جديدة',pl:'die Äpfel',s:'s',sar:'s'},{a:'der',n:'Apfel'", 1), "word count mismatch")

# 12. Category reordering
w1 = "{a:'der',n:'Apfel',ar:'تفاحة',pl:'die Äpfel',s:'Der Apfel schmeckt süß und frisch.',sar:'التفاحة طعمها حلو وطازج.'}"
w2 = "{a:'die',n:'Banane',ar:'موزة',pl:'die Bananen',s:'Die Banane ist gelb und reif.',sar:'الموزة صفراء وناضجة.'}"
run_mutation_test("Word_reordering", original_html.replace(f"{w1},\n    {w2}", f"{w2},\n    {w1}", 1), "mismatch")

print("=" * 65)
print("🎉 ALL 12 MUTATION TESTS PASSED: VERIFIER REJECTS ALL INVALID MUTATIONS.")
print("=" * 65)

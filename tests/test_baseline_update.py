#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tests/test_baseline_update.py
Proves that verify_vocab.py --update-baseline --reason ... --source ...
works end-to-end on an isolated temporary copy of the repository files,
updating the baseline JSON and recording the true old and new hashes in CHANGELOG_VOCAB.md.
"""

import os
import sys
import shutil
import tempfile
import subprocess
import json

def test_baseline_update():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    with tempfile.TemporaryDirectory() as temp_dir:
        # Copy required files
        shutil.copy2(os.path.join(repo_root, 'index.html'), os.path.join(temp_dir, 'index.html'))
        shutil.copy2(os.path.join(repo_root, 'vocab_baseline.json'), os.path.join(temp_dir, 'vocab_baseline.json'))
        shutil.copy2(os.path.join(repo_root, 'CHANGELOG_VOCAB.md'), os.path.join(temp_dir, 'CHANGELOG_VOCAB.md'))
        shutil.copy2(os.path.join(repo_root, 'verify_vocab.py'), os.path.join(temp_dir, 'verify_vocab.py'))

        os.makedirs(os.path.join(temp_dir, 'scripts'), exist_ok=True)
        shutil.copy2(
            os.path.join(repo_root, 'scripts', 'extract_categories_ast.js'),
            os.path.join(temp_dir, 'scripts', 'extract_categories_ast.js')
        )

        # Record initial baseline hash
        with open(os.path.join(temp_dir, 'vocab_baseline.json'), 'r', encoding='utf-8') as f:
            old_baseline_data = json.load(f)
        old_canonical = json.dumps(old_baseline_data, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
        import hashlib
        old_hash = hashlib.sha256(old_canonical.encode('utf-8')).hexdigest()

        # Mutate a sentence in index.html
        with open(os.path.join(temp_dir, 'index.html'), 'r', encoding='utf-8') as f:
            html = f.read()

        target_str = "s:'Der Apfel schmeckt süß und frisch.'"
        replacement_str = "s:'Der Apfel schmeckt besonders süß und frisch.'"
        assert target_str in html, f"Target string not found in index.html"
        mutated_html = html.replace(target_str, replacement_str, 1)

        with open(os.path.join(temp_dir, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(mutated_html)

        # Run verify_vocab.py --update-baseline
        env = os.environ.copy()
        env['PYTHONUTF8'] = '1'
        env['PYTHONIOENCODING'] = 'utf-8'

        cmd = [
            sys.executable,
            os.path.join(temp_dir, 'verify_vocab.py'),
            '--update-baseline',
            '--reason', 'Test baseline update in temporary sandbox',
            '--source', 'Duden / Controlled Test Runner',
            '--ids', 'obst_0_s'
        ]

        res = subprocess.run(cmd, cwd=temp_dir, capture_output=True, text=True, encoding='utf-8', env=env)
        if res.returncode != 0:
            print("STDERR:\n", res.stderr)
            print("STDOUT:\n", res.stdout)
            raise AssertionError(f"verify_vocab.py --update-baseline failed with code {res.returncode}")

        # Verify updated vocab_baseline.json
        with open(os.path.join(temp_dir, 'vocab_baseline.json'), 'r', encoding='utf-8') as f:
            new_baseline_data = json.load(f)

        new_canonical = json.dumps(new_baseline_data, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
        new_hash = hashlib.sha256(new_canonical.encode('utf-8')).hexdigest()

        assert old_hash != new_hash, "Old hash and new hash should be different after mutation"
        assert new_baseline_data[0]['words'][0]['s'] == 'Der Apfel schmeckt besonders süß und frisch.'

        # Verify CHANGELOG_VOCAB.md
        with open(os.path.join(temp_dir, 'CHANGELOG_VOCAB.md'), 'r', encoding='utf-8') as f:
            changelog_content = f.read()

        assert old_hash in changelog_content, f"Old hash {old_hash} not found in CHANGELOG_VOCAB.md"
        assert new_hash in changelog_content, f"New hash {new_hash} not found in CHANGELOG_VOCAB.md"
        assert "Test baseline update in temporary sandbox" in changelog_content
        assert "Duden / Controlled Test Runner" in changelog_content
        assert "obst_0_s" in changelog_content

        # Verify that normal verify_vocab.py now passes completely in the temp dir
        verify_res = subprocess.run(
            [sys.executable, os.path.join(temp_dir, 'verify_vocab.py')],
            cwd=temp_dir,
            capture_output=True,
            text=True,
            encoding='utf-8',
            env=env
        )
        assert verify_res.returncode == 0, f"Subsequent verify_vocab.py failed: {verify_res.stdout}\n{verify_res.stderr}"
        assert "[PASSED]" in verify_res.stdout

        print("=================================================================")
        print("  PROVING --update-baseline WORKS END-TO-END")
        print("=================================================================")
        print(f"[OK] ✅ Previous SHA-256 : {old_hash}")
        print(f"[OK] ✅ New SHA-256      : {new_hash}")
        print("[OK] ✅ CHANGELOG_VOCAB.md updated with reasons, sources, and hashes")
        print("[OK] ✅ verify_vocab.py passed on updated baseline with 0 errors")
        print("=================================================================")

if __name__ == '__main__':
    test_baseline_update()

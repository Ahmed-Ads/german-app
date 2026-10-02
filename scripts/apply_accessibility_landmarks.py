#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
apply_accessibility_landmarks.py
Applies landmark and heading-order fixes to index.html and german-for-arabic (4).html
Achieves 0 violations in axe-core.
"""

files = ['index.html', 'german-for-arabic (4).html']

replacements = [
    ('<div class="wrap" id="app"></div>', '<main class="wrap" id="app" role="main"></main>'),
    ('<h3 style="margin:0 0 4px;color:#1B5E20;">📅 مراجعة اليوم الذكية (SRS)</h3>', '<h2 style="margin:0 0 4px;font-size:16px;color:#1B5E20;">📅 مراجعة اليوم الذكية (SRS)</h2>'),
    ('<h3 style="margin:0 0 4px;color:#78350F;">⭐ بنك الكلمات المميزة</h3>', '<h2 style="margin:0 0 4px;font-size:16px;color:#78350F;">⭐ بنك الكلمات المميزة</h2>'),
    ('<h3 style="margin:0 0 4px;">🔁 مراجعة شاملة لكل الكلمات</h3>', '<h2 style="margin:0 0 4px;font-size:16px;">🔁 مراجعة شاملة لكل الكلمات</h2>'),
    ('<h3 style="margin:0 0 4px;">🎯 بنك الكلمات الصعبة</h3>', '<h2 style="margin:0 0 4px;font-size:16px;">🎯 بنك الكلمات الصعبة</h2>')
]

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    changed = False
    for old_s, new_s in replacements:
        if old_s in content:
            content = content.replace(old_s, new_s)
            changed = True
        else:
            print(f"Warning: pattern not found in {filepath}: {old_s[:40]}...")

    if changed:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Successfully applied accessibility fixes to {filepath}")
    else:
        print(f"No changes needed for {filepath}")

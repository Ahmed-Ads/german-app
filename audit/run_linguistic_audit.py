#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Automated Comprehensive Linguistic Audit Engine (Phase 2A)
Scans all 1,160 words across all 30 categories in vocab_baseline.json.
"""

import json
import re
import unicodedata
from collections import defaultdict

with open('vocab_baseline.json', 'r', encoding='utf-8') as f:
    baseline = json.load(f)

findings = {
    'total_categories': len(baseline),
    'total_words': sum(len(c['words']) for c in baseline),
    'schema_issues': [],
    'unicode_issues': [],
    'casing_issues': [],
    'compound_gender_mismatches': [],
    'uncountable_mass_nouns_with_plural': [],
    'duplicate_words': [],
    'duplicate_glosses': [],
    'sentence_target_missing': [],
    'sentence_punctuation_issues': [],
    'known_suspicious_items': []
}

# 1. Unicode & Character Sets
PERSIAN_URDU_CHARS = {'ی': 'ي', 'ک': 'ك', 'ە': 'ه'}
PUNCTUATION_ENDINGS = ('.', '!', '?', '؟', '…')

# Known compounds and their expected last headword gender
COMPOUND_HEADS = {
    'pulver': 'das',   # das Pulver
    'suppe': 'die',    # die Suppe
    'brot': 'das',     # das Brot
    'kuchen': 'der',   # der Kuchen
    'kraut': 'das',    # das Kraut
    'saft': 'der',     # der Saft
    'wasser': 'das',   # das Wasser
    'oel': 'das',      # das Öl
    'öl': 'das',       # das Öl
    'fleisch': 'das',  # das Fleisch
    'wurst': 'die',    # die Wurst
    'salat': 'der',    # der Salat
    'käse': 'der',     # der Käse
    'kaese': 'der',    # der Käse
    'beere': 'die',    # die Beere
    'frucht': 'die',   # die Frucht
    'bohne': 'die',    # die Bohne
    'nuss': 'die',     # die Nuss
    'zwiebel': 'die',  # die Zwiebel
    'schokolade': 'die', # die Schokolade
    'tee': 'der',      # der Tee
    'wein': 'der',     # der Wein
    'milch': 'die',    # die Milch
    'butter': 'die',   # die Butter
    'tuch': 'das',     # das Tuch
    'zeug': 'das',     # das Zeug
    'schuh': 'der',    # der Schuh
    'tasche': 'die',   # die Tasche
    'schirm': 'der',   # der Schirm
    'brille': 'die',   # die Brille
    'mütze': 'die',    # die Mütze
    'mantel': 'der',   # der Mantel
    'anzug': 'der',    # der Anzug
    'kleid': 'das',    # das Kleid
    'hemd': 'das',     # das Hemd
    'hose': 'die',     # die Hose
    'jacke': 'die',    # die Jacke
    'uhr': 'die',      # die Uhr
    'wagen': 'der',    # der Wagen
    'bahn': 'die',     # die Bahn
    'rad': 'das',      # das Rad
    'boot': 'das',     # das Boot
    'schiff': 'das',   # das Schiff
    'zeug': 'das',     # das Zeug
    'maschine': 'die', # die Maschine
    'station': 'die',  # die Station
    'zimmer': 'das',   # das Zimmer
    'haus': 'das',     # das Haus
    'tür': 'die',      # die Tür
    'fenster': 'das',  # das Fenster
    'tisch': 'der',    # der Tisch
    'stuhl': 'der',    # der Stuhl
    'schrank': 'der',  # der Schrank
    'glas': 'das',     # das Glas
    'kanne': 'die',    # die Kanne
    'pfanne': 'die',   # die Pfanne
    'löffel': 'der',   # der Löffel
    'gabel': 'die',    # die Gabel
    'messer': 'das'    # das Messer
}

# Mass/Uncountable nouns that typically don't have natural plurals
UNCOUNTABLE_CANDIDATES = {
    'Milch', 'Spinat', 'Mais', 'Lauch', 'Blumenkohl', 'Kurkuma', 'Petersilie',
    'Honig', 'Buttermilch', 'Sojamilch', 'Kaffeesahne', 'Reis', 'Zucker',
    'Salz', 'Pfeffer', 'Mehl', 'Fleisch', 'Geflügel', 'Schmuck', 'Besteck',
    'Obst', 'Gemüse', 'Gepäck', 'Verkehr', 'Wetter', 'Schnee', 'Regen',
    'Luft', 'Durst', 'Hunger', 'Wolle', 'Baumwolle', 'Seide', 'Leder',
    'Gold', 'Silber', 'Eisen', 'Kupfer', 'Holz', 'Glas', 'Papier', 'Geld'
}

seen_words = defaultdict(list)
seen_sentences_de = defaultdict(list)

for c_idx, cat in enumerate(baseline):
    cid = cat['id']
    has_art = cat.get('hasArticles', False)

    for w_idx, w in enumerate(cat['words']):
        wn = w.get('n', '')
        wa = w.get('a', '')
        wpl = w.get('pl')
        war = w.get('ar', '')
        ws = w.get('s', '')
        wsar = w.get('sar', '')

        loc = f"{cid}[{w_idx}] ({wn})"

        # A. Schema checks
        if has_art:
            if not wa or wa not in ('der', 'die', 'das'):
                findings['schema_issues'].append(f"{loc}: Category hasArticles=true but article is '{wa}'")
            if wpl is not None and not isinstance(wpl, str):
                findings['schema_issues'].append(f"{loc}: Plural must be string or null, got {type(wpl)}")
            elif isinstance(wpl, str) and not wpl.startswith('die '):
                findings['schema_issues'].append(f"{loc}: Plural does not start with 'die ': '{wpl}'")
        else:
            if wa:
                findings['schema_issues'].append(f"{loc}: Category hasArticles=false but article '{wa}' is present")

        # B. Unicode checks
        for fld, val in [('n', wn), ('ar', war), ('pl', wpl), ('s', ws), ('sar', wsar)]:
            if not isinstance(val, str): continue
            # NFC normalization
            if val != unicodedata.normalize('NFC', val):
                findings['unicode_issues'].append(f"{loc}.{fld}: Text not NFC-normalized")
            # Zero-width & control chars
            if any(ord(c) in (0x200B, 0x200C, 0x200D, 0xFEFF, 0x200E, 0x200F, 0x0640) for c in val):
                findings['unicode_issues'].append(f"{loc}.{fld}: Contains zero-width, bidi control, or tatweel character")
            # Trailing or leading whitespace
            if val != val.strip():
                findings['unicode_issues'].append(f"{loc}.{fld}: Has leading or trailing whitespace")
            # Double spaces
            if '  ' in val:
                findings['unicode_issues'].append(f"{loc}.{fld}: Contains double space")
            # Persian/Urdu characters in Arabic fields
            if fld in ('ar', 'sar'):
                for bad, repl in PERSIAN_URDU_CHARS.items():
                    if bad in val:
                        findings['unicode_issues'].append(f"{loc}.{fld}: Contains Persian/Urdu character '{bad}' (should be '{repl}')")

        # C. Casing checks
        if has_art:
            if wn and not wn[0].isupper():
                findings['casing_issues'].append(f"{loc}: Noun in article-category does not start with capital: '{wn}'")
        elif cid in ('zahlen', 'farben', 'gefuehle'):
            # Some are adjectives or numbers or adverbs
            pass

        # D. Compound gender rule check
        wn_lower = wn.lower()
        if has_art and wa:
            for head, expected_art in COMPOUND_HEADS.items():
                if wn_lower.endswith(head) and len(wn_lower) > len(head):
                    if wa != expected_art:
                        findings['compound_gender_mismatches'].append({
                            'location': loc,
                            'word': wn,
                            'current_article': wa,
                            'expected_article': expected_art,
                            'headword': head,
                            'reason': f"Compound ends in -{head} (which takes '{expected_art}'), but entry has '{wa}'"
                        })

        # E. Uncountable mass noun check
        if wn in UNCOUNTABLE_CANDIDATES and wpl is not None:
            findings['uncountable_mass_nouns_with_plural'].append({
                'location': loc,
                'word': wn,
                'current_plural': wpl,
                'reason': f"'{wn}' is typically an uncountable mass noun (Singularetantum). Expected pl: null or non-standard plural."
            })

        # F. Duplicate tracking
        seen_words[wn].append((cid, w_idx))
        if ws:
            seen_sentences_de[ws].append((cid, w_idx, wn))

        # G. Sentence checks
        if ws:
            if not ws.rstrip().endswith(PUNCTUATION_ENDINGS):
                findings['sentence_punctuation_issues'].append(f"{loc}.s: German sentence does not end with punctuation: '{ws}'")
            # Check target word in sentence
            wn_stem = wn.rstrip('en').rstrip('e').rstrip('s')
            if len(wn_stem) >= 3:
                pattern = re.compile(rf'\b{re.escape(wn_stem)}', re.IGNORECASE)
                if not pattern.search(ws):
                    findings['sentence_target_missing'].append(f"{loc}: Target word '{wn}' (stem '{wn_stem}') not found in sentence: '{ws}'")
            elif wn not in ws:
                findings['sentence_target_missing'].append(f"{loc}: Short word '{wn}' not found in sentence: '{ws}'")

        if wsar:
            if not wsar.rstrip().endswith(PUNCTUATION_ENDINGS):
                findings['sentence_punctuation_issues'].append(f"{loc}.sar: Arabic sentence does not end with punctuation: '{wsar}'")

# Check duplicate words across categories
for w, locs in seen_words.items():
    if len(locs) > 1:
        findings['duplicate_words'].append({'word': w, 'occurrences': locs})

with open('audit/audit_findings_2a.json', 'w', encoding='utf-8') as f:
    json.dump(findings, f, ensure_ascii=False, indent=2)

print("Phase 2A deterministic audit complete!")
print(f"Total categories: {findings['total_categories']}, Total words: {findings['total_words']}")
print(f"Schema issues: {len(findings['schema_issues'])}")
print(f"Unicode / encoding issues: {len(findings['unicode_issues'])}")
print(f"Casing issues: {len(findings['casing_issues'])}")
print(f"Compound gender mismatches: {len(findings['compound_gender_mismatches'])}")
print(f"Uncountable mass nouns with forced plurals: {len(findings['uncountable_mass_nouns_with_plural'])}")
print(f"Cross-category duplicate words: {len(findings['duplicate_words'])}")
print(f"Sentence punctuation issues: {len(findings['sentence_punctuation_issues'])}")
print(f"Sentences missing target word: {len(findings['sentence_target_missing'])}")

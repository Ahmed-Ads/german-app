/**
 * tests/lang_de.test.js
 * Verification for Requirement I3:
 * - Static test over index.html verifying that no element with class="de" lacks lang="de" or dir="ltr".
 * - Ensures accessibility for screen readers on all German words, sentences, and articles.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.resolve(__dirname, '../index.html');
const html = fs.readFileSync(indexPath, 'utf8');

describe('I3: German Accessibility Attributes (lang="de" dir="ltr")', () => {
  it('enforces that no element with class="de" lacks lang="de" and dir="ltr"', () => {
    // Regex matching HTML start tags
    const tagRegex = /<([a-zA-Z0-9]+)\s+([^>]*)>/g;
    let match;
    const deElements = [];
    const missingAttributes = [];

    while ((match = tagRegex.exec(html)) !== null) {
      const tagName = match[1];
      const attributes = match[2];

      // Extract class attribute
      const classMatch = attributes.match(/\bclass=["']([^"']*)["']/);
      if (classMatch) {
        const classes = classMatch[1].split(/\s+/);
        if (classes.includes('de')) {
          deElements.push({ tagName, attributes, fullTag: match[0] });

          const hasLangDe = /\blang=["']de["']/.test(attributes);
          const hasDirLtr = /\bdir=["']ltr["']/.test(attributes);

          if (!hasLangDe || !hasDirLtr) {
            missingAttributes.push({
              tag: match[0],
              hasLangDe,
              hasDirLtr
            });
          }
        }
      }
    }

    // Ensure we checked a non-empty set of de elements
    expect(deElements.length).toBeGreaterThanOrEqual(25);

    // Fail if any element with class="de" lacks lang="de" or dir="ltr"
    expect(
      missingAttributes,
      `Found ${missingAttributes.length} element(s) with class="de" missing lang="de" or dir="ltr":\n` +
      missingAttributes.map(m => `  ${m.tag} (lang="de": ${m.hasLangDe}, dir="ltr": ${m.hasDirLtr})`).join('\n')
    ).toEqual([]);
  });

  it('ensures written input element has lang="de" dir="ltr"', () => {
    const inputMatch = html.match(/<input[^>]*id=["']wIn["'][^>]*>/);
    expect(inputMatch).not.toBeNull();
    const inputTag = inputMatch[0];
    expect(inputTag).toContain('lang="de"');
    expect(inputTag).toContain('dir="ltr"');
  });
});

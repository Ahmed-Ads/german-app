# Service Worker Upgrade Test Fixtures

This directory contains static, committed fixtures used exclusively by `tests/sw_upgrade.spec.js` to verify real live upgrades from a legacy Service Worker build to the current production build without relying on git history or deep checkouts in CI.

## Files & Provenance

1. **`old_sw.js`**
   - **Source Commit:** `bf625e4` (`bf625e4test(behavioral): add Chrome E2E tests...`, parent of `0f4b571`)
   - **Extraction Command:** `git show bf625e4:sw.js > tests/fixtures/sw_upgrade/old_sw.js`
   - **Key Signature:** Declares `const CACHE_NAME = 'deutsch-lernen-v3';`
   - **Purpose:** Represents the legacy Service Worker declaring cache v3 to test cache purging, updatefound handling, and activation of current build.

2. **`old_fonts.css`**
   - **Source Commit:** `333ed38` (`333ed38feat(phase1): unified storage layer...`, parent of `4f1f580`)
   - **Extraction Command:** `git show 333ed38:fonts/fonts.css > tests/fixtures/sw_upgrade/old_fonts.css`
   - **Key Signature:** Contains broken relative font URLs: `url(./fonts/font_1.woff2)`
   - **Purpose:** Represents the legacy CSS with faulty relative font paths to verify that upgrading to the current build updates CSS and resolves 404s.

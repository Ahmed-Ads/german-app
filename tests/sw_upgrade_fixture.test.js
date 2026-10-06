// @ts-check
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'url';
import { buildSite } from '../scripts/build_site.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const siteDir = path.join(rootDir, 'site');

/**
 * Extracts relative local asset paths from HTML <script src="..."> and <link href="..."> tags.
 * Excludes external URLs (http/https), protocol-relative URLs (//), data URIs, and anchors.
 */
export function extractHtmlAssets(htmlContent) {
  const assets = new Set();

  // Match <script ... src="...">
  const scriptRegex = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = scriptRegex.exec(htmlContent)) !== null) {
    const rawSrc = match[1].trim();
    if (!rawSrc.startsWith('http://') && !rawSrc.startsWith('https://') && !rawSrc.startsWith('//') && !rawSrc.startsWith('data:') && !rawSrc.startsWith('#')) {
      const cleanPath = rawSrc.split('?')[0].replace(/^\.?\//, '');
      if (cleanPath) assets.add(cleanPath);
    }
  }

  // Match <link ... href="...">
  const linkRegex = /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
  while ((match = linkRegex.exec(htmlContent)) !== null) {
    const rawHref = match[1].trim();
    if (!rawHref.startsWith('http://') && !rawHref.startsWith('https://') && !rawHref.startsWith('//') && !rawHref.startsWith('data:') && !rawHref.startsWith('#')) {
      const cleanPath = rawHref.split('?')[0].replace(/^\.?\//, '');
      if (cleanPath) assets.add(cleanPath);
    }
  }

  return Array.from(assets);
}

/**
 * Extracts array elements declared as: const <name> = [ ... ];
 */
export function extractSwAssetArray(swContent, arrayName) {
  const regex = new RegExp(`const\\s+${arrayName}\\s*=\\s*\\[([\\s\\S]*?)\\];`);
  const match = swContent.match(regex);
  if (!match) return [];
  return match[1]
    .split(',')
    .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

/**
 * Validates that every asset in assetList exists in targetDir.
 * Returns an array of missing asset paths.
 */
export function validateAssetsExist(assetList, targetDir) {
  const missing = [];
  for (const asset of assetList) {
    let relFile = asset.replace(/^\.?\//, '');
    if (relFile === '' || relFile === '.') {
      relFile = 'index.html';
    }
    const fullPath = path.join(targetDir, relFile);
    if (!fs.existsSync(fullPath)) {
      missing.push(asset);
    }
  }
  return missing;
}

describe('Service Worker Upgrade & Distribution Static Guard', () => {
  // Ensure site/ is built
  if (!fs.existsSync(siteDir) || !fs.existsSync(path.join(siteDir, 'sw.js'))) {
    buildSite();
  }

  const indexPath = path.join(rootDir, 'index.html');
  const swPath = path.join(rootDir, 'sw.js');
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  const swContent = fs.readFileSync(swPath, 'utf8');

  it('guarantees all <script src> and <link href> assets in index.html exist in site/', () => {
    const referencedAssets = extractHtmlAssets(indexContent);
    expect(referencedAssets.length).toBeGreaterThan(0);

    const missingAssets = validateAssetsExist(referencedAssets, siteDir);
    if (missingAssets.length > 0) {
      console.error('Missing index.html assets in site/:', missingAssets);
    }
    expect(
      missingAssets,
      `index.html references assets not present in site/ distribution: ${missingAssets.join(', ')}`
    ).toHaveLength(0);
  });

  it('guarantees all CRITICAL_ASSETS and OPTIONAL_ASSETS in sw.js exist in site/', () => {
    const critical = extractSwAssetArray(swContent, 'CRITICAL_ASSETS');
    const optional = extractSwAssetArray(swContent, 'OPTIONAL_ASSETS');
    const allSwAssets = [...critical, ...optional];

    expect(critical.length).toBeGreaterThan(0);
    expect(optional.length).toBeGreaterThan(0);

    const missingCritical = validateAssetsExist(critical, siteDir);
    expect(
      missingCritical,
      `sw.js CRITICAL_ASSETS missing in site/: ${missingCritical.join(', ')}`
    ).toHaveLength(0);

    const missingOptional = validateAssetsExist(optional, siteDir);
    expect(
      missingOptional,
      `sw.js OPTIONAL_ASSETS missing in site/: ${missingOptional.join(', ')}`
    ).toHaveLength(0);
  });

  it('guarantees all fonts referenced in fonts.css exist in site/fonts/', () => {
    const cssPath = path.join(siteDir, 'fonts', 'fonts.css');
    expect(fs.existsSync(cssPath), 'site/fonts/fonts.css must exist').toBe(true);

    const cssContent = fs.readFileSync(cssPath, 'utf8');
    const fontMatches = Array.from(cssContent.matchAll(/url\(['"]?([^'")]+)['"]?\)/gi));
    expect(fontMatches.length).toBeGreaterThan(0);

    const missingFonts = [];
    for (const match of fontMatches) {
      const fontUrl = match[1].trim();
      const cleanFontFile = fontUrl.split('?')[0].replace(/^\.?\//, '');
      const fullFontPath = path.join(siteDir, 'fonts', cleanFontFile);
      if (!fs.existsSync(fullFontPath)) {
        missingFonts.push(fontUrl);
      }
    }

    expect(
      missingFonts,
      `fonts.css references font files missing from site/fonts/: ${missingFonts.join(', ')}`
    ).toHaveLength(0);
  });

  it('verifies static guard sensitivity: correctly detects missing files when present', () => {
    const fakeAssets = ['non_existent_module.js', 'missing/sync_helper.js'];
    const detected = validateAssetsExist(fakeAssets, siteDir);
    expect(detected).toEqual(fakeAssets);
  });
});

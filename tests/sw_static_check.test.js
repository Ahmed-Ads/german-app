import fs from 'fs';
import { describe, it, expect } from 'vitest';

describe('Static Check: Service Worker v4 Configuration & Precache Rules', () => {
  const swCode = fs.readFileSync('sw.js', 'utf8');
  const readmeCode = fs.readFileSync('README.md', 'utf8');

  it('declares CACHE_NAME as deutsch-lernen-v4', () => {
    expect(swCode).toMatch(/const\s+CACHE_NAME\s*=\s*['"]deutsch-lernen-v4['"]/);
  });

  it('includes fonts.css and all 6 local woff2 fonts in PRECACHE_ASSETS', () => {
    expect(swCode).toContain("'./fonts/fonts.css'");
    for (let i = 1; i <= 6; i++) {
      expect(swCode).toContain(`./fonts/font_${i}.woff2`);
    }
  });

  it('implements Stale-While-Revalidate for CSS files', () => {
    expect(swCode).toContain("url.pathname.endsWith('.css')");
    expect(swCode).toContain('cachedResponse || (await fetchPromise) || Response.error()');
  });

  it('purges legacy caches (like deutsch-lernen-v3) upon activation', () => {
    expect(swCode).toContain('if (name !== CACHE_NAME)');
    expect(swCode).toContain('return caches.delete(name)');
  });

  it('uses Response.error() on network failures for static assets', () => {
    expect(swCode).toContain('Response.error()');
    expect(swCode).not.toContain('return null');
  });

  it('documents v4 and SWR for CSS in README.md', () => {
    expect(readmeCode).toContain('deutsch-lernen-v4');
    expect(readmeCode).toContain('Stale-While-Revalidate');
  });
});

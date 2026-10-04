import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPagesEmulatorServer } from '../scripts/serve_pages_emulator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const siteDir = path.resolve(__dirname, '..', 'site');

describe('Cloudflare Pages Emulator Server (scripts/serve_pages_emulator.js)', () => {
  let server = null;
  let port = 0;

  beforeAll(async () => {
    server = createPagesEmulatorServer(0, siteDir);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
  });

  afterAll(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  function makeRequest(reqPath) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: port,
        path: reqPath,
        method: 'GET'
      };
      const req = http.request(options, res => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, body });
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  it('redirects /index.html to / with HTTP 308 Permanent Redirect', async () => {
    const res = await makeRequest('/index.html');
    expect(res.status).toBe(308);
    expect(res.headers.location).toBe('/');
  });

  it('redirects subpath /sub/index.html to /sub/ with HTTP 308', async () => {
    const res = await makeRequest('/sub/index.html');
    expect(res.status).toBe(308);
    expect(res.headers.location).toBe('/sub/');
  });

  it('serves / with HTTP 200 and site/index.html content without redirect', async () => {
    const res = await makeRequest('/');
    expect(res.status).toBe(200);
    expect(res.headers.location).toBeUndefined();
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('<!DOCTYPE html>');
  });

  it('serves static assets with correct MIME types and HTTP 200', async () => {
    const swRes = await makeRequest('/sw.js');
    expect(swRes.status).toBe(200);
    expect(swRes.headers['content-type']).toContain('javascript');

    const manifestRes = await makeRequest('/manifest.json');
    expect(manifestRes.status).toBe(200);
    expect(manifestRes.headers['content-type']).toContain('json');

    const cssRes = await makeRequest('/fonts/fonts.css');
    expect(cssRes.status).toBe(200);
    expect(cssRes.headers['content-type']).toContain('css');
  });

  it('returns HTTP 404 for non-existent files', async () => {
    const res = await makeRequest('/does-not-exist.html');
    expect(res.status).toBe(404);
    expect(res.body).toContain('Not Found');
  });
});

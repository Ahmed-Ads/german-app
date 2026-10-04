#!/usr/bin/env node
/**
 * scripts/serve_pages_emulator.js
 * Emulates Cloudflare Pages routing and clean URLs behavior:
 *  - Serves site/ distribution at the root
 *  - Redirects /index.html to / with HTTP 308 Permanent Redirect (Clean URLs)
 *  - Redirects /<path>/index.html to /<path>/ with HTTP 308 Permanent Redirect
 *  - Serves / with site/index.html (HTTP 200, not redirected)
 *  - Serves static assets from site/ with correct MIME types
 *  - Returns HTTP 404 for non-existent files
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '8000', 10);
const defaultSiteDir = path.resolve(__dirname, '..', 'site');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
};

function createPagesEmulatorServer(port = PORT, dir = defaultSiteDir) {
  const server = http.createServer((req, res) => {
    const rawUrl = req.url.split('?')[0];

    // 1. Cloudflare Pages canonical redirect: /index.html -> / with 308 Permanent Redirect
    if (rawUrl === '/index.html' || rawUrl === 'index.html') {
      res.writeHead(308, {
        'Location': '/',
        'Content-Type': 'text/plain; charset=utf-8'
      });
      res.end('Permanent Redirect to /');
      return;
    }

    // Handle subpath index.html redirects: e.g. /about/index.html -> /about/
    if (rawUrl.endsWith('/index.html')) {
      const target = rawUrl.slice(0, -'index.html'.length);
      res.writeHead(308, {
        'Location': target,
        'Content-Type': 'text/plain; charset=utf-8'
      });
      res.end(`Permanent Redirect to ${target}`);
      return;
    }

    // 2. Root URL serves index.html (200 OK, not redirected)
    let subPath = rawUrl.replace(/^\/+/, '');
    if (subPath === '') {
      subPath = 'index.html';
    }

    const filePath = path.join(dir, subPath);

    // If file does not exist or is a directory without index: 404 Not Found
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found: ' + rawUrl);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': content.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(content);
  });

  return server;
}

if (require.main === module) {
  const server = createPagesEmulatorServer();
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Cloudflare Pages emulator running at http://127.0.0.1:${PORT}/`);
    console.log(`Serving distribution directory: ${defaultSiteDir}`);
    console.log(`Redirecting /index.html -> / (308 Permanent Redirect)`);
  });
}

module.exports = { createPagesEmulatorServer };

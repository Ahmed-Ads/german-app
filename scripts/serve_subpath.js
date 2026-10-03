#!/usr/bin/env node
/**
 * scripts/serve_subpath.js
 * Serves the `site/` distribution build under a sub-path prefix (default: /german-app/)
 * to emulate GitHub Pages repo hosting (https://<user>.github.io/<repo>/).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '8000', 10);
const SUB_PATH = process.env.SUB_PATH || '/german-app';
const siteDir = path.resolve(__dirname, '..', 'site');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
};

function createSubpathServer(port = PORT, prefix = SUB_PATH, dir = siteDir) {
  const normalizedPrefix = prefix.startsWith('/') ? prefix : '/' + prefix;
  const prefixWithSlash = normalizedPrefix.endsWith('/') ? normalizedPrefix : normalizedPrefix + '/';
  const prefixWithoutSlash = prefixWithSlash.slice(0, -1);

  const server = http.createServer((req, res) => {
    const rawUrl = req.url.split('?')[0];

    // Redirect /prefix to /prefix/
    if (rawUrl === prefixWithoutSlash) {
      res.writeHead(301, { Location: prefixWithSlash });
      res.end();
      return;
    }

    if (!rawUrl.startsWith(prefixWithSlash)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found (outside sub-path ' + prefixWithSlash + '): ' + rawUrl);
      return;
    }

    let subPath = rawUrl.slice(prefixWithSlash.length);
    if (subPath === '' || subPath === '/') {
      subPath = 'index.html';
    }

    const filePath = path.join(dir, subPath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
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
  const server = createSubpathServer();
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Subpath server running at http://localhost:${PORT}${SUB_PATH}/`);
    console.log(`Serving files from: ${siteDir}`);
  });
}

module.exports = { createSubpathServer };

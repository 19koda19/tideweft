'use strict';

const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeBasePath(value) {
  assert(typeof value === 'string' && value.startsWith('/'), 'Pages base path must begin with `/`.');
  assert(!value.includes('?') && !value.includes('#') && !value.includes('\\'), 'Pages base path is malformed.');
  const withTrailingSlash = value.endsWith('/') ? value : `${value}/`;
  const segments = withTrailingSlash.split('/').filter(Boolean);
  assert(segments.length > 0, 'The smoke test must use a nested project path, not the domain root.');
  assert(segments.every((segment) => segment !== '.' && segment !== '..'), 'Pages base path may not traverse.');
  return withTrailingSlash;
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function sendText(response, statusCode, message, extraHeaders = {}) {
  const body = Buffer.from(message, 'utf8');
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  response.end(body);
}

function createPagesServer(basePath) {
  const baseWithoutSlash = basePath.slice(0, -1);

  return http.createServer(async (request, response) => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        sendText(response, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
        return;
      }

      const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
      if (requestUrl.pathname === baseWithoutSlash) {
        response.writeHead(308, {
          'Cache-Control': 'no-store',
          Location: basePath,
        });
        response.end();
        return;
      }
      if (!requestUrl.pathname.startsWith(basePath)) {
        sendText(response, 404, 'Not found');
        return;
      }

      let relativePath;
      try {
        relativePath = decodeURIComponent(requestUrl.pathname.slice(basePath.length));
      } catch {
        sendText(response, 400, 'Malformed URL');
        return;
      }

      if (relativePath.includes('\0') || relativePath.includes('\\')) {
        sendText(response, 400, 'Malformed path');
        return;
      }
      if (relativePath === '') relativePath = 'index.html';

      const targetPath = path.resolve(distRoot, relativePath);
      if (!isInside(distRoot, targetPath)) {
        sendText(response, 403, 'Path traversal denied');
        return;
      }

      let stat;
      try {
        stat = await fs.stat(targetPath);
      } catch (error) {
        if (error && error.code === 'ENOENT') {
          sendText(response, 404, 'Not found');
          return;
        }
        throw error;
      }
      if (!stat.isFile()) {
        sendText(response, 404, 'Not found');
        return;
      }

      const body = request.method === 'HEAD' ? null : await fs.readFile(targetPath);
      response.writeHead(200, {
        'Cache-Control': path.extname(targetPath) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
        'Content-Length': stat.size,
        'Content-Type': contentTypes.get(path.extname(targetPath).toLowerCase()) || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(body);
    } catch (error) {
      sendText(response, 500, error instanceof Error ? error.message : String(error));
    }
  });
}

module.exports = {
  contentTypes,
  createPagesServer,
  normalizeBasePath,
};

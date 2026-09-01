'use strict';

const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const requestedBasePath = process.env.TIDEWEFT_PAGES_BASE_PATH || '/tideweft/';
const resultPrefix = 'TIDEWEFT_WEB_SMOKE_RESULT ';

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

async function listArtifactFiles(directory, relativeDirectory = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    const absolutePath = path.join(directory, entry.name);
    assert(!entry.isSymbolicLink(), `Pages artifact contains a symbolic link: ${relativePath}`);
    if (entry.isDirectory()) {
      files.push(...(await listArtifactFiles(absolutePath, relativePath)));
    } else if (entry.isFile()) {
      files.push({ relativePath, absolutePath });
    }
  }

  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function localEntryReferences(indexHtml) {
  const references = [];
  const elementPattern = /<(?:script|link)\b[^>]*\b(?:src|href)=(['"])(.*?)\1[^>]*>/giu;
  let match;

  while ((match = elementPattern.exec(indexHtml)) !== null) {
    const reference = match[2];
    if (!reference || reference.startsWith('#') || reference.startsWith('data:') || reference.startsWith('blob:')) {
      continue;
    }
    assert(!reference.startsWith('//'), `Protocol-relative production dependency is not self-contained: ${reference}`);
    assert(!/^[a-z][a-z\d+.-]*:/iu.test(reference), `External production dependency is not self-contained: ${reference}`);
    assert(!reference.startsWith('/'), `Root-relative asset would break on a GitHub project page: ${reference}`);
    references.push(reference);
  }

  return [...new Set(references)];
}

function assertCssReferencesArePortable(cssText, relativePath) {
  const urlPattern = /url\(\s*(['"]?)(.*?)\1\s*\)/giu;
  let match;
  while ((match = urlPattern.exec(cssText)) !== null) {
    const reference = match[2];
    if (!reference || reference.startsWith('data:') || reference.startsWith('blob:') || reference.startsWith('#')) continue;
    assert(!reference.startsWith('/'), `Root-relative CSS asset in ${relativePath}: ${reference}`);
    assert(!/^[a-z][a-z\d+.-]*:/iu.test(reference), `External CSS asset in ${relativePath}: ${reference}`);
  }
}

async function expectStatus(url, expectedStatus, options) {
  const response = await fetch(url, { redirect: 'manual', ...options });
  assert(response.status === expectedStatus, `${url} returned ${response.status}; expected ${expectedStatus}.`);
  return response;
}

async function runSmoke() {
  const basePath = normalizeBasePath(requestedBasePath);
  const indexPath = path.join(distRoot, 'index.html');
  let indexHtml;
  try {
    indexHtml = await fs.readFile(indexPath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error('dist/index.html does not exist. Run `npm run build:web` first.');
    }
    throw error;
  }

  const artifactFiles = await listArtifactFiles(distRoot);
  assert(artifactFiles.length >= 3, `Pages artifact is unexpectedly sparse (${artifactFiles.length} files).`);
  assert(indexHtml.includes('<title>TIDEWEFT'), 'Generated entry is missing the TIDEWEFT title.');
  assert(indexHtml.includes('http-equiv="Content-Security-Policy"'), 'Generated entry is missing its CSP.');
  assert(indexHtml.includes('id="p5-mount"'), 'Generated entry is missing the p5 mount.');
  assert(indexHtml.includes('id="game-ui"'), 'Generated entry is missing the UI mount.');
  assert(!indexHtml.includes('/src/'), 'Generated entry still points at development source files.');
  assert(!indexHtml.includes('@vite/client'), 'Generated entry still points at the Vite development client.');

  const entryReferences = localEntryReferences(indexHtml);
  assert(entryReferences.some((reference) => reference.endsWith('.js')), 'Generated entry has no JavaScript bundle.');
  assert(entryReferences.some((reference) => reference.endsWith('.css')), 'Generated entry has no CSS bundle.');

  for (const file of artifactFiles) {
    if (file.relativePath.endsWith('.css')) {
      assertCssReferencesArePortable(await fs.readFile(file.absolutePath, 'utf8'), file.relativePath);
    }
  }

  const server = createPagesServer(basePath);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const address = server.address();
    assert(address && typeof address === 'object', 'Pages smoke server did not expose a TCP address.');
    const origin = `http://127.0.0.1:${address.port}`;
    const entryUrl = new URL(`${basePath}?source=pages-smoke`, origin);
    const entryResponse = await expectStatus(entryUrl, 200);
    assert(entryResponse.headers.get('content-type')?.startsWith('text/html'), 'Entry has the wrong MIME type.');
    const servedIndex = await entryResponse.text();
    assert(servedIndex === indexHtml, 'HTTP-served index differs from the generated artifact.');

    const redirectResponse = await expectStatus(new URL(basePath.slice(0, -1), origin), 308);
    assert(redirectResponse.headers.get('location') === basePath, 'Nested base redirect points to the wrong location.');
    await expectStatus(new URL('/', origin), 404);
    await expectStatus(new URL(`${basePath}route-that-does-not-exist`, origin), 404);
    await expectStatus(new URL(`${basePath}%2e%2e%2fpackage.json`, origin), 403);
    await expectStatus(entryUrl, 405, { method: 'POST' });

    let servedBytes = Buffer.byteLength(indexHtml);
    const manifestResources = [];
    for (const reference of entryReferences) {
      const assetUrl = new URL(reference, entryUrl);
      assert(assetUrl.origin === origin, `Generated entry escaped the Pages origin: ${reference}`);
      assert(assetUrl.pathname.startsWith(basePath), `Generated entry escaped the nested Pages path: ${reference}`);

      const response = await expectStatus(assetUrl, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert(bytes.length > 0, `Generated asset is empty: ${reference}`);
      assert(Number(response.headers.get('content-length')) === bytes.length, `Wrong Content-Length for ${reference}.`);
      const extension = path.extname(assetUrl.pathname).toLowerCase();
      const expectedContentType = contentTypes.get(extension)?.split(';')[0];
      if (expectedContentType) {
        assert(
          response.headers.get('content-type')?.startsWith(expectedContentType),
          `Generated asset has wrong MIME (${response.headers.get('content-type')}): ${reference}`,
        );
      }
      if (reference.endsWith('.js')) {
        assert(bytes.includes(Buffer.from('__TIDEWEFT__')), `Entry bundle lacks the runtime boot marker: ${reference}`);
      }
      if (reference.endsWith('.svg')) {
        assert(bytes.includes(Buffer.from('<svg')), `SVG entry dependency is malformed: ${reference}`);
      }
      if (reference.endsWith('.webmanifest')) {
        let manifest;
        try {
          manifest = JSON.parse(bytes.toString('utf8'));
        } catch (error) {
          throw new Error(`Web manifest is invalid JSON (${reference}): ${error.message}`);
        }
        assert(typeof manifest.name === 'string' && manifest.name.includes('TIDEWEFT'), 'Web manifest has no game name.');
        assert(typeof manifest.start_url === 'string', 'Web manifest has no start_url.');
        assert(typeof manifest.scope === 'string', 'Web manifest has no scope.');
        for (const [label, portableReference] of [
          ['start_url', manifest.start_url],
          ['scope', manifest.scope],
          ...((Array.isArray(manifest.icons) ? manifest.icons : []).map((icon) => ['icon', icon?.src])),
        ]) {
          assert(typeof portableReference === 'string' && portableReference.length > 0, `Manifest ${label} is empty.`);
          assert(!portableReference.startsWith('/'), `Manifest ${label} breaks project Pages: ${portableReference}`);
          assert(!/^[a-z][a-z\d+.-]*:/iu.test(portableReference), `Manifest ${label} is external: ${portableReference}`);
          const resolved = new URL(portableReference, assetUrl);
          assert(resolved.origin === origin, `Manifest ${label} escaped the Pages origin: ${portableReference}`);
          assert(resolved.pathname.startsWith(basePath), `Manifest ${label} escaped the project path: ${portableReference}`);
          if (label === 'icon') manifestResources.push(resolved);
        }
      }
      const headResponse = await expectStatus(assetUrl, 200, { method: 'HEAD' });
      assert((await headResponse.arrayBuffer()).byteLength === 0, `HEAD returned a body for ${reference}.`);
      assert(headResponse.headers.get('content-length') === String(bytes.length), `HEAD length differs for ${reference}.`);
      servedBytes += bytes.length;
    }

    for (const resourceUrl of manifestResources) {
      const response = await expectStatus(resourceUrl, 200);
      assert((await response.arrayBuffer()).byteLength > 0, `Manifest resource is empty: ${resourceUrl.href}`);
    }

    return {
      ok: true,
      basePath,
      entryUrl: entryUrl.href,
      artifactFiles: artifactFiles.length,
      entryReferences,
      servedBytes,
      node: process.version,
    };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

runSmoke()
  .then((result) => {
    process.stdout.write(`${resultPrefix}${JSON.stringify(result)}\n`);
  })
  .catch((error) => {
    process.stderr.write(
      `${resultPrefix}${JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  });

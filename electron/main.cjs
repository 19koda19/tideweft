'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, net, protocol, session } = require('electron');

const APP_SCHEME = 'app';
const APP_HOST = 'bundle';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
const PRODUCTION_ENTRY_URL = `${APP_ORIGIN}/index.html`;
const DEV_ORIGIN = 'http://127.0.0.1:5173';
const DEV_ENTRY_URL = `${DEV_ORIGIN}/`;

const SMOKE_TEST = Object.freeze({
  enabled:
    process.env.TIDEWEFT_SMOKE === '1' ||
    process.argv.includes('--tideweft-smoke'),
  screenshotPath: process.env.TIDEWEFT_SMOKE_SCREENSHOT || '',
  timeoutMs: Math.max(
    5_000,
    Math.min(60_000, Number.parseInt(process.env.TIDEWEFT_SMOKE_TIMEOUT_MS || '30000', 10) || 30_000),
  ),
});

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

const windows = new Set();
let smokeTestSettled = false;

if (SMOKE_TEST.enabled) {
  const isolatedUserData = process.env.TIDEWEFT_SMOKE_USER_DATA;
  if (isolatedUserData) app.setPath('userData', path.resolve(isolatedUserData));
  app.commandLine.appendSwitch('disable-background-timer-throttling');
}

// Privileged schemes must be registered before Electron's ready event.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true,
    },
  },
]);

// Keep Chromium's process-level sandbox enabled even if defaults change later.
app.enableSandbox();

function errorResponse(status, message) {
  return new Response(message, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function resolveBundlePath(requestUrl) {
  let url;

  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }

  if (
    url.protocol !== `${APP_SCHEME}:` ||
    url.hostname !== APP_HOST ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== ''
  ) {
    return null;
  }

  let decodedPath;

  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  if (decodedPath.includes('\0')) {
    return null;
  }

  const bundleRoot = path.resolve(app.getAppPath(), 'dist');
  const relativeRequest = decodedPath.replace(/^[/\\]+/, '') || 'index.html';
  const resolvedPath = path.resolve(bundleRoot, relativeRequest);
  const relativePath = path.relative(bundleRoot, resolvedPath);

  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }

  return resolvedPath;
}

async function handleBundleRequest(request) {
  if (request.method !== 'GET') {
    return errorResponse(405, 'Method not allowed');
  }

  const bundlePath = resolveBundlePath(request.url);

  if (bundlePath === null) {
    return errorResponse(404, 'Not found');
  }

  try {
    const fileResponse = await net.fetch(pathToFileURL(bundlePath).toString());
    const headers = new Headers(fileResponse.headers);

    headers.set('X-Content-Type-Options', 'nosniff');

    if (path.extname(bundlePath).toLowerCase() === '.html') {
      headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
      headers.set('Referrer-Policy', 'no-referrer');
    }

    return new Response(fileResponse.body, {
      status: fileResponse.status,
      statusText: fileResponse.statusText,
      headers,
    });
  } catch {
    return errorResponse(404, 'Not found');
  }
}

function configureSessionSecurity(targetSession) {
  targetSession.setPermissionCheckHandler(() => false);
  targetSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  targetSession.setDevicePermissionHandler(() => false);
}

function isTrustedNavigation(rawUrl) {
  let target;

  try {
    target = new URL(rawUrl);
  } catch {
    return false;
  }

  if (app.isPackaged) {
    return (
      target.protocol === `${APP_SCHEME}:` &&
      target.hostname === APP_HOST &&
      target.port === '' &&
      target.username === '' &&
      target.password === ''
    );
  }

  return (
    target.protocol === 'http:' &&
    target.hostname === '127.0.0.1' &&
    target.port === '5173' &&
    target.username === '' &&
    target.password === '' &&
    target.origin === DEV_ORIGIN
  );
}

function lockDownWebContents(contents) {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));

  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  contents.on('will-frame-navigate', (details) => {
    if (!details.isMainFrame || !isTrustedNavigation(details.url)) {
      details.preventDefault();
    }
  });

  contents.on('will-navigate', (details) => {
    if (!isTrustedNavigation(details.url)) {
      details.preventDefault();
    }
  });

  contents.on('will-redirect', (details) => {
    if (!isTrustedNavigation(details.url)) {
      details.preventDefault();
    }
  });
}

function createWindow(options = {}) {
  const deferLoad = options.deferLoad === true;
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#07141a',
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      enableWebSQL: false,
      plugins: false,
      navigateOnDragDrop: false,
      safeDialogs: true,
      spellcheck: false,
      devTools: !app.isPackaged,
      backgroundThrottling: !SMOKE_TEST.enabled,
    },
  });

  windows.add(window);
  window.on('closed', () => windows.delete(window));
  if (!SMOKE_TEST.enabled) window.once('ready-to-show', () => window.show());
  window.setMenuBarVisibility(false);

  lockDownWebContents(window.webContents);

  const entryUrl = app.isPackaged ? PRODUCTION_ENTRY_URL : DEV_ENTRY_URL;
  if (!deferLoad) {
    void window.loadURL(entryUrl).catch(() => {
      if (!window.isDestroyed()) {
        window.destroy();
      }
    });
  }

  return window;
}

function smokeResult(success, details) {
  if (smokeTestSettled) return;
  smokeTestSettled = true;

  const payload = {
    ok: success,
    electron: process.versions.electron,
    packaged: app.isPackaged,
    platform: `${process.platform}-${process.arch}`,
    ...details,
  };
  const output = `TIDEWEFT_SMOKE_RESULT ${JSON.stringify(payload)}\n`;
  const stream = success ? process.stdout : process.stderr;
  const exitCode = success ? 0 : 1;
  process.exitCode = exitCode;
  stream.write(output, () => app.exit(exitCode));

  // A broken stdio pipe must not leave a hidden Electron process running.
  const fallback = setTimeout(() => app.exit(exitCode), 500);
  fallback.unref();
}

function smokeFailure(reason, details = {}) {
  smokeResult(false, { reason, ...details });
}

function rendererProbeScript() {
  return `(() => {
    const status = document.querySelector('#connection-status');
    const shell = document.querySelector('#game-ui .ui-layer');
    const title = document.querySelector('.title-dialog');
    const canvas = document.querySelector('#p5-mount canvas');
    const bridge = window.__TIDEWEFT__;
    const runtime = bridge && bridge.runtime;
    const renderView = runtime && typeof runtime.getRenderView === 'function'
      ? runtime.getRenderView()
      : null;
    const uiView = runtime && typeof runtime.getUIView === 'function'
      ? runtime.getUIView()
      : null;
    return {
      url: location.href,
      title: document.title,
      documentReadyState: document.readyState,
      statusState: status ? status.getAttribute('data-state') : null,
      statusText: status ? status.textContent : null,
      hasRuntime: Boolean(runtime),
      uiReady: shell ? shell.getAttribute('data-ready') : null,
      titleOpen: Boolean(title && title.open),
      paused: renderView ? Boolean(renderView.paused) : null,
      tick: renderView && Number.isFinite(renderView.tick) ? renderView.tick : null,
      worldName: renderView ? renderView.worldName : null,
      settlementCount: renderView && Array.isArray(renderView.settlements)
        ? renderView.settlements.length
        : null,
      terrainTileCount: renderView && renderView.terrain && Array.isArray(renderView.terrain.tiles)
        ? renderView.terrain.tiles.length
        : null,
      contractCount: uiView && Array.isArray(uiView.contracts) ? uiView.contracts.length : null,
      canvas: canvas
        ? { width: canvas.width, height: canvas.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight }
        : null,
      styleSheetCount: document.styleSheets.length,
      nodeGlobalsAbsent:
        typeof window.require === 'undefined' &&
        typeof window.process === 'undefined' &&
        typeof window.module === 'undefined',
    };
  })()`;
}

async function readRendererProbe(contents) {
  return contents.executeJavaScript(rendererProbeScript(), true);
}

async function waitForRenderer(contents, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastProbe = null;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      lastProbe = await readRendererProbe(contents);
      if (predicate(lastProbe)) return lastProbe;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const suffix = lastError ? ` Last renderer error: ${lastError}` : '';
  throw new Error(`renderer readiness timed out.${suffix} Last probe: ${JSON.stringify(lastProbe)}`);
}

async function startSmokeWorld(contents) {
  const started = await contents.executeJavaScript(`(() => {
    const form = document.querySelector('.new-world-form');
    const seed = document.querySelector('#world-seed');
    if (!(form instanceof HTMLFormElement) || !(seed instanceof HTMLInputElement)) return false;
    seed.value = 'electron-smoke';
    seed.dispatchEvent(new Event('input', { bubbles: true }));
    form.requestSubmit();
    return true;
  })()`, true);

  if (!started) throw new Error('the title screen did not expose its new-world form');
}

async function captureSmokeEvidence(window, screenshotPath) {
  if (!screenshotPath) return null;

  const resolvedPath = path.resolve(screenshotPath);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  const image = await window.webContents.capturePage();
  if (image.isEmpty()) throw new Error('Electron returned an empty smoke-test screenshot');
  const png = image.toPNG();
  if (png.length < 1_024) throw new Error(`smoke-test screenshot was unexpectedly small (${png.length} bytes)`);
  await fs.writeFile(resolvedPath, png);
  return {
    path: resolvedPath,
    bytes: png.length,
    size: image.getSize(),
  };
}

async function runProductionSmoke(window) {
  if (!app.isPackaged) {
    throw new Error('desktop smoke mode must run from the packaged application');
  }

  const rendererErrors = [];
  const rendererWarnings = [];
  const resourceFailures = [];
  const contents = window.webContents;

  contents.on('console-message', (event) => {
    const level = typeof event.level === 'string' ? event.level : 'info';
    const message = typeof event.message === 'string' ? event.message : '';
    const line = Number.isFinite(event.lineNumber) ? event.lineNumber : 0;
    const source = typeof event.sourceId === 'string' ? event.sourceId : '';
    const entry = { level, message, line, source };
    if (level === 'error') rendererErrors.push(entry);
    if (level === 'warning') rendererWarnings.push(entry);
  });
  contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame) {
      smokeFailure('main-frame-load-failed', { errorCode, errorDescription, validatedURL });
    }
  });
  contents.on('render-process-gone', (_event, details) => {
    smokeFailure('renderer-process-gone', { rendererExit: details });
  });
  contents.on('unresponsive', () => smokeFailure('renderer-became-unresponsive'));
  contents.on('preload-error', (_event, preloadPath, error) => {
    smokeFailure('preload-failed', { preloadPath, error: error.message });
  });

  const requestFilter = { urls: ['app://bundle/*'] };
  contents.session.webRequest.onCompleted(requestFilter, (details) => {
    if (details.statusCode >= 400) {
      resourceFailures.push({ url: details.url, statusCode: details.statusCode });
    }
  });
  contents.session.webRequest.onErrorOccurred(requestFilter, (details) => {
    resourceFailures.push({ url: details.url, error: details.error });
  });

  await window.loadURL(PRODUCTION_ENTRY_URL);
  const bootProbe = await waitForRenderer(
    contents,
    (probe) =>
      probe.url === PRODUCTION_ENTRY_URL &&
      probe.documentReadyState === 'complete' &&
      probe.statusState === 'ready' &&
      probe.hasRuntime === true &&
      probe.uiReady === 'true' &&
      probe.titleOpen === true &&
      probe.nodeGlobalsAbsent === true &&
      probe.styleSheetCount > 0 &&
      probe.canvas !== null &&
      probe.canvas.width > 0 &&
      probe.canvas.height > 0,
    SMOKE_TEST.timeoutMs,
  );

  await startSmokeWorld(contents);
  const worldProbe = await waitForRenderer(
    contents,
    (probe) =>
      probe.titleOpen === false &&
      probe.paused === false &&
      probe.tick >= 2 &&
      probe.worldName === 'The Electron Smoke Estuary' &&
      probe.settlementCount >= 5 &&
      probe.terrainTileCount >= 3_000 &&
      probe.contractCount > 0,
    SMOKE_TEST.timeoutMs,
  );

  // Give p5 a couple of paint frames after the deterministic simulation advances.
  await new Promise((resolve) => setTimeout(resolve, 250));
  const screenshot = await captureSmokeEvidence(window, SMOKE_TEST.screenshotPath);

  if (resourceFailures.length > 0) {
    throw new Error(`production resources failed to load: ${JSON.stringify(resourceFailures)}`);
  }
  if (rendererErrors.length > 0) {
    throw new Error(`renderer logged errors: ${JSON.stringify(rendererErrors)}`);
  }

  smokeResult(true, {
    entryUrl: PRODUCTION_ENTRY_URL,
    boot: bootProbe,
    world: worldProbe,
    rendererWarnings,
    resourceFailures,
    screenshot,
  });
}

app.whenReady().then(() => {
  protocol.handle(APP_SCHEME, handleBundleRequest);
  configureSessionSecurity(session.defaultSession);
  if (SMOKE_TEST.enabled) {
    const window = createWindow({ deferLoad: true });
    void runProductionSmoke(window).catch((error) => {
      smokeFailure('smoke-verification-failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    });
    return;
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

if (SMOKE_TEST.enabled) {
  process.on('uncaughtException', (error) => {
    smokeFailure('main-process-uncaught-exception', { error: error.stack || error.message });
  });
  process.on('unhandledRejection', (reason) => {
    smokeFailure('main-process-unhandled-rejection', {
      error: reason instanceof Error ? reason.stack || reason.message : String(reason),
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

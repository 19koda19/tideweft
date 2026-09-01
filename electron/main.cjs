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
const SMOKE_WORLD_TILE_COUNT = 96 * 72;
const SMOKE_MINIMUM_VIEWPORT = Object.freeze({ width: 960, height: 640 });
const SMOKE_SCREENSHOT_VIEWPORT = Object.freeze({ width: 1440, height: 900 });

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
      // Keep the packaged intent explicit: Relief 3D is optional at runtime,
      // but Electron should offer WebGL whenever Chromium can initialize it.
      webgl: true,
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
    const canvases = Array.from(document.querySelectorAll('#p5-mount canvas[data-renderer]'));
    const bridge = window.__TIDEWEFT__;
    const runtime = bridge && bridge.runtime;
    const renderer = bridge && bridge.renderer;
    const renderView = runtime && typeof runtime.getRenderView === 'function'
      ? runtime.getRenderView()
      : null;
    const uiView = runtime && typeof runtime.getUIView === 'function'
      ? runtime.getUIView()
      : null;
    const canvasStates = canvases.map((canvas) => {
      const style = getComputedStyle(canvas);
      const active = !canvas.hidden &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0';
      return {
        renderer: canvas.dataset.renderer || null,
        active,
        hidden: canvas.hidden,
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
      };
    });
    const activeCanvases = canvasStates.filter((canvas) => canvas.active);
    const activeCanvas = activeCanvases[0] || null;
    const controllerCanvas = renderer && typeof renderer.canvas === 'function'
      ? renderer.canvas()
      : null;
    const viewButton = document.querySelector('#view-mode-toggle');
    const contractRail = document.querySelector('.contract-rail');
    const contractList = document.querySelector('.contract-list');
    const contractStyle = contractList ? getComputedStyle(contractList) : null;
    const contractClientHeight = contractList ? contractList.clientHeight : null;
    const contractScrollHeight = contractList ? contractList.scrollHeight : null;
    const interactButton = document.querySelector('.action-button--interact');
    const wayknotButton = document.querySelector('.action-button--wayknot');
    const wayknotCount = document.querySelector('.field-readout__wayknot-count');
    const wayknotActive = document.querySelector('.field-readout__wayknot-active');
    const activeContracts = uiView && Array.isArray(uiView.contracts)
      ? uiView.contracts.filter((contract) => contract.status === 'accepted' || contract.status === 'tracked')
      : [];
    const terrain = renderView?.terrain;
    const playerPosition = renderView?.player?.position;
    const playerTileIndex = terrain && playerPosition
      ? Math.floor(playerPosition.y / terrain.tileSize) * terrain.columns +
        Math.floor(playerPosition.x / terrain.tileSize)
      : null;
    const projectedWayknots = renderView && Array.isArray(renderView.wayknots)
      ? renderView.wayknots.map((wayknot) => ({
          id: wayknot.id,
          kind: wayknot.kind,
          active: wayknot.active,
          tileIndex: terrain
            ? Math.floor(wayknot.position.y / terrain.tileSize) * terrain.columns +
              Math.floor(wayknot.position.x / terrain.tileSize)
            : null,
        }))
      : [];
    return {
      url: location.href,
      title: document.title,
      documentReadyState: document.readyState,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
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
      activeContractCount: activeContracts.length,
      playerCargoLoad: renderView && renderView.player ? renderView.player.cargoLoad : null,
      playerDestinationLabel: renderView && renderView.player
        ? renderView.player.destinationLabel || null
        : null,
      playerPosition: playerPosition
        ? { x: playerPosition.x, y: playerPosition.y }
        : null,
      playerVelocity: renderView && renderView.player
        ? { x: renderView.player.velocity.x, y: renderView.player.velocity.y }
        : null,
      playerTileIndex,
      interact: interactButton
        ? {
            label: interactButton.childNodes[0]?.textContent?.trim() || interactButton.textContent?.trim() || null,
            disabled: interactButton instanceof HTMLButtonElement ? interactButton.disabled : null,
          }
        : null,
      wayknots: {
        projectedCount: projectedWayknots.length,
        projected: projectedWayknots,
        deployedCount: uiView?.field?.deployedWayknots ?? null,
        capacity: uiView?.field?.wayknotCapacity ?? null,
        activeLabels: Array.isArray(uiView?.field?.activeWayknotLabels)
          ? [...uiView.field.activeWayknotLabels]
          : [],
        countText: wayknotCount?.textContent?.trim() || null,
        activeText: wayknotActive?.textContent?.trim() || null,
        button: wayknotButton
          ? {
              label: wayknotButton.querySelector('.action-button__label')?.textContent?.trim() || null,
              title: wayknotButton.getAttribute('title'),
              disabled: wayknotButton instanceof HTMLButtonElement ? wayknotButton.disabled : null,
            }
          : null,
        controlAvailable: uiView?.controls?.canWayknot ?? null,
        controlLabel: uiView?.controls?.wayknotLabel ?? null,
      },
      canvasCount: canvasStates.length,
      activeCanvasCount: activeCanvases.length,
      activeRenderer: activeCanvas ? activeCanvas.renderer : null,
      canvases: canvasStates,
      canvas: activeCanvas,
      controllerCanvasRenderer: controllerCanvas instanceof HTMLCanvasElement
        ? controllerCanvas.dataset.renderer || null
        : null,
      viewMode: bridge ? bridge.viewMode || null : null,
      rendererMode: renderer && typeof renderer.mode === 'function' ? renderer.mode() : null,
      reliefSupported: renderer && typeof renderer.reliefSupported === 'function'
        ? renderer.reliefSupported()
        : null,
      reliefFailure: document.querySelector('#p5-mount')?.dataset.reliefFailure || null,
      viewButton: viewButton
        ? {
            mode: viewButton.getAttribute('data-view-mode'),
            ariaPressed: viewButton.getAttribute('aria-pressed'),
            ariaDisabled: viewButton.getAttribute('aria-disabled'),
            disabled: viewButton instanceof HTMLButtonElement ? viewButton.disabled : null,
            current: viewButton.querySelector('[data-view-mode-current]')?.textContent || null,
            next: viewButton.querySelector('[data-view-mode-next]')?.textContent || null,
          }
        : null,
      promises: {
        railOpen: contractRail instanceof HTMLDetailsElement ? contractRail.open : null,
        clientHeight: contractClientHeight,
        scrollHeight: contractScrollHeight,
        overflowY: contractStyle ? contractStyle.overflowY : null,
        hasVerticalOverflow:
          contractClientHeight !== null &&
          contractScrollHeight !== null &&
          contractScrollHeight > contractClientHeight + 1,
      },
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

async function readGpuDiagnostics(contents) {
  let gpuInfoAvailable = false;
  let gpuInfoError = null;

  try {
    await app.getGPUInfo('basic');
    gpuInfoAvailable = true;
  } catch (error) {
    gpuInfoError = error instanceof Error ? error.message : String(error);
  }

  let renderer = null;
  try {
    renderer = await contents.executeJavaScript(`(() => {
      const probeContext = (name) => {
        const canvas = document.createElement('canvas');
        let creationError = null;
        canvas.addEventListener('webglcontextcreationerror', (event) => {
          creationError = typeof event.statusMessage === 'string' ? event.statusMessage : 'unknown';
        }, { once: true });
        let context = null;
        try {
          context = canvas.getContext(name, { antialias: false });
        } catch (error) {
          creationError = error instanceof Error ? error.message : String(error);
        }
        const result = {
          available: Boolean(context),
          creationError,
          version: context ? context.getParameter(context.VERSION) : null,
          renderer: context ? context.getParameter(context.RENDERER) : null,
          vendor: context ? context.getParameter(context.VENDOR) : null,
        };
        if (context) context.getExtension('WEBGL_lose_context')?.loseContext();
        return result;
      };
      return {
        webglConstructor: typeof WebGLRenderingContext,
        webgl2Constructor: typeof WebGL2RenderingContext,
        webgl2: probeContext('webgl2'),
        webgl: probeContext('webgl'),
      };
    })()`, true);
  } catch (error) {
    renderer = {
      probeError: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    hardwareAccelerationEnabled: app.isHardwareAccelerationEnabled(),
    featureStatus: app.getGPUFeatureStatus(),
    gpuInfoAvailable,
    gpuInfoError,
    renderer,
  };
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

async function acceptSmokePromise(contents) {
  const clicked = await contents.executeJavaScript(`(() => {
    const button = document.querySelector(
      '.contract-card[data-status="available"] .contract-card__action:not(:disabled)',
    );
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`, true);

  if (!clicked) throw new Error('no available pickup promise action could be clicked');
  return waitForRenderer(
    contents,
    (probe) =>
      probe.activeContractCount === 1 &&
      probe.playerCargoLoad > 0 &&
      typeof probe.playerDestinationLabel === 'string' &&
      probe.playerDestinationLabel.startsWith('DELIVER'),
    SMOKE_TEST.timeoutMs,
  );
}

async function bindSmokeWayknot(contents) {
  const target = await contents.executeJavaScript(`(() => {
    const runtime = window.__TIDEWEFT__?.runtime;
    const view = runtime?.getRenderView?.();
    const terrain = view?.terrain;
    const player = view?.player;
    if (!runtime || !terrain || !player?.position) return null;

    const playerX = Math.floor(player.position.x / terrain.tileSize);
    const playerY = Math.floor(player.position.y / terrain.tileSize);
    const occupied = new Set(
      view.settlements.map((settlement) =>
        Math.floor(settlement.position.y / terrain.tileSize) * terrain.columns +
        Math.floor(settlement.position.x / terrain.tileSize),
      ),
    );
    // These render categories correspond to dry authoritative contexts for a
    // Reed mat or Wind knot. Staying out of live water keeps this smoke path
    // focused on binding and avoids making it depend on a particular tide.
    const compatibleLand = new Set(['salt-marsh', 'mudflat', 'sandbar', 'scrub', 'ridge']);
    const candidates = terrain.tiles.flatMap((tile, index) => {
      if (
        !compatibleLand.has(tile.kind) ||
        occupied.has(index) ||
        !Number.isFinite(tile.waterDepth) ||
        tile.waterDepth > 0.04
      ) return [];
      const x = index % terrain.columns;
      const y = Math.floor(index / terrain.columns);
      const distance = Math.abs(x - playerX) + Math.abs(y - playerY);
      if (distance === 0) return [];
      return [{
        index,
        kind: tile.kind,
        distance,
        point: {
          x: x * terrain.tileSize + terrain.tileSize / 2,
          y: y * terrain.tileSize + terrain.tileSize / 2,
        },
      }];
    }).sort((left, right) => left.distance - right.distance || left.index - right.index);
    const candidate = candidates[0];
    if (!candidate || candidate.distance > 8) return null;

    runtime.dispatchUI({ type: 'set-pace', pace: 'swift' });
    runtime.dispatchRenderer({ type: 'move-target', point: candidate.point, additive: false });
    return candidate;
  })()`, true);

  if (!target) {
    throw new Error('no dry Wayknot-compatible terrain was reachable within eight tiles');
  }

  const arrival = await waitForRenderer(
    contents,
    (probe) => {
      const dx = (probe.playerPosition?.x ?? Number.POSITIVE_INFINITY) - target.point.x;
      const dy = (probe.playerPosition?.y ?? Number.POSITIVE_INFINITY) - target.point.y;
      return probe.playerTileIndex === target.index &&
        Math.hypot(dx, dy) <= 3 &&
        probe.wayknots?.controlAvailable === true &&
        probe.wayknots?.button?.disabled === false;
    },
    SMOKE_TEST.timeoutMs,
  );

  const clicked = await contents.executeJavaScript(`(() => {
    const button = document.querySelector('.action-button--wayknot');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`, true);
  if (!clicked) throw new Error('the Wayknot action was unavailable after reaching compatible terrain');

  const bound = await waitForRenderer(
    contents,
    (probe) => {
      const projected = probe.wayknots?.projected;
      return probe.playerTileIndex === target.index &&
        probe.wayknots?.projectedCount === 1 &&
        probe.wayknots?.deployedCount === 1 &&
        probe.wayknots?.capacity === 6 &&
        Array.isArray(projected) &&
        projected.length === 1 &&
        projected[0]?.tileIndex === target.index &&
        projected[0]?.active === true &&
        probe.wayknots?.activeLabels?.length === 1 &&
        probe.wayknots?.button?.disabled === false &&
        probe.wayknots?.button?.label?.startsWith('Reclaim ');
    },
    SMOKE_TEST.timeoutMs,
  );

  return { target, arrival, bound };
}

async function focusSmokePlayer(contents) {
  return contents.executeJavaScript(`(() => {
    const bridge = window.__TIDEWEFT__;
    const view = bridge?.runtime?.getRenderView?.();
    if (!view?.player?.position || typeof bridge?.renderer?.focusWorld !== 'function') return false;
    bridge.renderer.focusWorld(view.player.position, 1);
    return true;
  })()`, true);
}

function probeHasActiveRenderer(probe, expectedRenderer) {
  if (
    !probe ||
    probe.canvasCount !== 2 ||
    probe.activeCanvasCount !== 1 ||
    probe.activeRenderer !== expectedRenderer ||
    probe.controllerCanvasRenderer !== expectedRenderer ||
    probe.viewMode !== expectedRenderer ||
    probe.rendererMode !== expectedRenderer ||
    !Array.isArray(probe.canvases)
  ) {
    return false;
  }

  return probe.canvases.every((canvas) =>
    canvas.renderer === expectedRenderer
      ? canvas.active === true && canvas.hidden === false && canvas.clientWidth > 0 && canvas.clientHeight > 0
      : canvas.active === false && canvas.hidden === true,
  );
}

function probeHasViewButtonMode(probe, expectedMode) {
  const button = probe && probe.viewButton;
  const relief = expectedMode === 'relief-3d';
  return Boolean(
    button &&
    button.mode === expectedMode &&
    button.ariaPressed === String(relief) &&
    button.ariaDisabled === 'false' &&
    button.disabled === false &&
    button.current === (relief ? 'Relief 3D' : 'Chart 2D') &&
    button.next === (relief ? 'Switch to Chart 2D' : 'Switch to Relief 3D'),
  );
}

async function toggleSmokeView(contents, expectedMode) {
  const clicked = await contents.executeJavaScript(`(() => {
    const button = document.querySelector('#view-mode-toggle');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`, true);

  if (!clicked) throw new Error(`view toggle was unavailable while switching to ${expectedMode}`);
  return waitForRenderer(
    contents,
    (probe) =>
      probe.reliefSupported === true &&
      probeHasActiveRenderer(probe, expectedMode) &&
      probeHasViewButtonMode(probe, expectedMode),
    SMOKE_TEST.timeoutMs,
  );
}

async function resizeSmokeViewport(window, size, predicate) {
  window.setContentSize(size.width, size.height, false);
  return waitForRenderer(
    window.webContents,
    (probe) =>
      probe.viewport &&
      probe.viewport.width === size.width &&
      probe.viewport.height === size.height &&
      predicate(probe),
    SMOKE_TEST.timeoutMs,
  );
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
  const shellProbe = await waitForRenderer(
    contents,
    (probe) =>
      probe.url === PRODUCTION_ENTRY_URL &&
      probe.documentReadyState === 'complete' &&
      probe.statusState === 'ready' &&
      probe.hasRuntime === true &&
      probe.uiReady === 'true',
    SMOKE_TEST.timeoutMs,
  );
  if (shellProbe.reliefSupported !== true) {
    throw new Error(
      `Relief 3D initialization failed: ${shellProbe.reliefFailure || 'unknown reason'}. ` +
        `Renderer warnings: ${JSON.stringify(rendererWarnings)}`,
    );
  }
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
      probe.reliefSupported === true &&
      probeHasActiveRenderer(probe, 'relief-3d') &&
      probeHasViewButtonMode(probe, 'relief-3d') &&
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
      probe.terrainTileCount === SMOKE_WORLD_TILE_COUNT &&
      probe.contractCount > 0 &&
      probe.reliefSupported === true &&
      probeHasActiveRenderer(probe, 'relief-3d') &&
      probeHasViewButtonMode(probe, 'relief-3d'),
    SMOKE_TEST.timeoutMs,
  );

  // Exercise the exact UI path that previously lost clicks during live card
  // refreshes. The deterministic smoke seed begins beside an offered cargo
  // promise, so one action must reserve the contract, load physical cargo,
  // and replace PICK UP guidance with an explicit DELIVER marker.
  const promisePickupProbe = await acceptSmokePromise(contents);

  // Walk out of the harbor through the public pointer-routing command, then
  // use the real field-kit button. The resulting object must exist in the
  // renderer projection and agree with the HUD's deployed/active accounting.
  const wayknotProbe = await bindSmokeWayknot(contents);

  const chartProbe = await toggleSmokeView(contents, 'chart-2d');
  const reliefProbe = await toggleSmokeView(contents, 'relief-3d');

  const minimumViewportProbe = await resizeSmokeViewport(
    window,
    SMOKE_MINIMUM_VIEWPORT,
    (probe) =>
      probeHasActiveRenderer(probe, 'relief-3d') &&
      probeHasViewButtonMode(probe, 'relief-3d') &&
      probe.promises &&
      probe.promises.railOpen === true &&
      probe.promises.clientHeight >= 64 &&
      probe.promises.hasVerticalOverflow === true &&
      (probe.promises.overflowY === 'auto' || probe.promises.overflowY === 'scroll'),
  );

  const screenshotViewportProbe = await resizeSmokeViewport(
    window,
    SMOKE_SCREENSHOT_VIEWPORT,
    (probe) =>
      probeHasActiveRenderer(probe, 'relief-3d') &&
      probeHasViewButtonMode(probe, 'relief-3d') &&
      probe.terrainTileCount === SMOKE_WORLD_TILE_COUNT,
  );

  if (!await focusSmokePlayer(contents)) {
    throw new Error('the active renderer could not return its camera to the courier');
  }
  // Let the Relief camera ease back from contract inspection to the courier,
  // so visual evidence contains both actual terrain and the loaded delivery UI.
  await new Promise((resolve) => setTimeout(resolve, 750));
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
    promisePickup: promisePickupProbe,
    wayknot: wayknotProbe,
    modeToggle: {
      chart: chartProbe,
      relief: reliefProbe,
    },
    minimumViewport: minimumViewportProbe,
    screenshotViewport: screenshotViewportProbe,
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
      void readGpuDiagnostics(window.webContents)
        .catch((diagnosticError) => ({
          diagnosticError: diagnosticError instanceof Error
            ? diagnosticError.message
            : String(diagnosticError),
        }))
        .then((gpu) => {
          smokeFailure('smoke-verification-failed', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            gpu,
          });
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

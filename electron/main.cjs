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
const SMOKE_COMPATIBILITY_COLUMNS = 96;
const SMOKE_REGIONAL_COLUMNS = 120;
const SMOKE_REGIONAL_ROWS = 120;
// The deterministic smoke seed starts at compatibility tile 32,68. Its
// player-centered 120×120 frame initially projects compatibility 0,0 at
// 28,-8. Installing the proven Harp fixture at 62,30 then makes the production
// loader perform the expected two-quanta frame rebase, after which the same
// compatibility origin projects at -4,24.
const SMOKE_FIXTURE_COMPATIBILITY_OFFSET_X = 28;
const SMOKE_FIXTURE_COMPATIBILITY_OFFSET_Y = -8;
const SMOKE_PROJECTED_COMPATIBILITY_OFFSET_X = -4;
const SMOKE_PROJECTED_COMPATIBILITY_OFFSET_Y = 24;
const SMOKE_WORLD_TILE_COUNT = SMOKE_REGIONAL_COLUMNS * SMOKE_REGIONAL_ROWS;
const SMOKE_WORLD_SEED = 'phase ten glass ebb';
const SMOKE_WORLD_NAME = 'The Phase Ten Glass Ebb Estuary';
const SMOKE_EXPECTED_RELEASE_VERSION = '0.3.3-alpha.10';
const SMOKE_EXPECTED_GAMEPLAY_CONTRACT_VERSION = 18;
const smokeRegionalTileIndex = (compatibilityTileIndex, offsetX, offsetY) => {
  const x = compatibilityTileIndex % SMOKE_COMPATIBILITY_COLUMNS;
  const y = Math.floor(compatibilityTileIndex / SMOKE_COMPATIBILITY_COLUMNS);
  return (y + offsetY) * SMOKE_REGIONAL_COLUMNS + x + offsetX;
};
const smokeFixtureTileIndex = (compatibilityTileIndex) => smokeRegionalTileIndex(
  compatibilityTileIndex,
  SMOKE_FIXTURE_COMPATIBILITY_OFFSET_X,
  SMOKE_FIXTURE_COMPATIBILITY_OFFSET_Y,
);
const smokeProjectedTileIndex = (compatibilityTileIndex) => smokeRegionalTileIndex(
  compatibilityTileIndex,
  SMOKE_PROJECTED_COMPATIBILITY_OFFSET_X,
  SMOKE_PROJECTED_COMPATIBILITY_OFFSET_Y,
);
const SMOKE_TIDE_HARP = Object.freeze({
  id: 'tide-harp:r1-a3-w5',
  label: 'Glass-Ebb Tide Harp · R1 · A3 · W5',
  reedLocalTileIndex: 2_942,
  anchorLocalTileIndex: 3_230,
  windLocalTileIndex: 2_751,
  fixturePlayerTileIndex: smokeFixtureTileIndex(2_942),
  reedTileIndex: smokeProjectedTileIndex(2_942),
  anchorTileIndex: smokeProjectedTileIndex(3_230),
  windTileIndex: smokeProjectedTileIndex(2_751),
  // Six tiles south of A3, but nine tiles from the player at R1. The normal
  // radius-8 pulse cannot reach it; the anchor's radius-6 echo can.
  remoteEchoTileIndex: smokeProjectedTileIndex(3_806),
});
const SMOKE_MINIMUM_VIEWPORT = Object.freeze({ width: 960, height: 640 });
const SMOKE_RESPONSIVE_VIEWPORT = Object.freeze({ width: 927, height: 640 });
const SMOKE_PHONE_VIEWPORT = Object.freeze({ width: 700, height: 640 });
const SMOKE_COMPACT_PHONE_VIEWPORT = Object.freeze({ width: 360, height: 640 });
const SMOKE_NARROW_PHONE_VIEWPORT = Object.freeze({ width: 320, height: 640 });
const SMOKE_LANDSCAPE_PHONE_VIEWPORT = Object.freeze({ width: 844, height: 390 });
const SMOKE_SCREENSHOT_VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const SMOKE_REQUESTED =
  process.env.TIDEWEFT_SMOKE === '1' ||
  process.argv.includes('--tideweft-smoke');
const SMOKE_USER_DATA = process.env.TIDEWEFT_SMOKE_USER_DATA?.trim() || '';

const SMOKE_TEST = Object.freeze({
  enabled: SMOKE_REQUESTED,
  screenshotPath: process.env.TIDEWEFT_SMOKE_SCREENSHOT || '',
  titleScreenshotPath: process.env.TIDEWEFT_SMOKE_TITLE_SCREENSHOT || '',
  mobileScreenshotPath: process.env.TIDEWEFT_SMOKE_MOBILE_SCREENSHOT || '',
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
  if (!SMOKE_USER_DATA) {
    throw new Error('Refusing smoke mode without an isolated TIDEWEFT_SMOKE_USER_DATA profile.');
  }
  const defaultUserData = path.resolve(app.getPath('userData'));
  const isolatedUserData = path.resolve(SMOKE_USER_DATA);
  if (isolatedUserData === defaultUserData) {
    throw new Error('Refusing smoke mode against the normal Tideweft user-data profile.');
  }
  app.setPath('userData', isolatedUserData);
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
    minWidth: SMOKE_TEST.enabled ? 320 : 960,
    minHeight: SMOKE_TEST.enabled ? 320 : 640,
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
    const rectOf = (element) => {
      if (!(element instanceof Element)) return null;
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
    };
    const visiblyIntersectsViewport = (element) => {
      if (!(element instanceof Element)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.top < window.innerHeight;
    };
    const whollyInsideViewport = (element) => {
      if (!visiblyIntersectsViewport(element)) return false;
      const rect = element.getBoundingClientRect();
      const tolerance = 0.5;
      return rect.left >= -tolerance &&
        rect.top >= -tolerance &&
        rect.right <= window.innerWidth + tolerance &&
        rect.bottom <= window.innerHeight + tolerance;
    };
    const elementsOverlap = (left, right) => {
      if (!visiblyIntersectsViewport(left) || !visiblyIntersectsViewport(right)) return false;
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return Math.max(leftRect.left, rightRect.left) < Math.min(leftRect.right, rightRect.right) &&
        Math.max(leftRect.top, rightRect.top) < Math.min(leftRect.bottom, rightRect.bottom);
    };
    const status = document.querySelector('#connection-status');
    const shell = document.querySelector('#game-ui .ui-layer');
    const title = document.querySelector('.title-dialog');
    const titleContent = document.querySelector('.title-dialog__content');
    const titleHeading = document.querySelector('.title-dialog__heading');
    const restartForm = document.querySelector('.restart-form');
    const restartInput = document.querySelector('#restart-phrase');
    const newWorldForm = document.querySelector('.new-world-form');
    const seedLabel = newWorldForm?.querySelector('label[for="world-seed"]') || null;
    const seedInput = newWorldForm?.querySelector('#world-seed') || null;
    const beginWorldButton = newWorldForm?.querySelector('button[type="submit"]') || null;
    const continueWorldButton = document.querySelector('.continue-card');
    const quietDialog = document.querySelector('.quiet-dialog');
    const quietFinishButton = quietDialog?.querySelector('.text-button--primary') || null;
    const titlePatchNotesButton = title?.querySelector('.patch-notes-trigger') || null;
    const quietPatchNotesButton = quietDialog?.querySelector('.patch-notes-trigger') || null;
    const patchNotesDialog = document.querySelector('.patch-notes-dialog');
    const patchNotesContent = patchNotesDialog?.querySelector('.patch-notes-dialog__content') || null;
    const patchNotesScroll = patchNotesDialog?.querySelector('.patch-notes-dialog__scroll') || null;
    const patchNotesClose = patchNotesDialog?.querySelector('[data-patch-action="close"]') || null;
    const patchNoteReleases = Array.from(patchNotesDialog?.querySelectorAll('.patch-release') || []);
    const patchNoteCategories = Array.from(patchNotesDialog?.querySelectorAll('.patch-category') || []);
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
    const worldCompass = document.querySelector('.world-compass');
    const worldCompassNorth = worldCompass?.querySelector('.world-compass__north') || null;
    const worldCompassArrow = worldCompass?.querySelector('.world-compass__arrow') || null;
    const objectivePanel = document.querySelector('.objective-panel');
    const leftRail = document.querySelector('.left-rail');
    const hudBar = document.querySelector('.hud-bar');
    const desktopFieldLine = document.querySelector('.desktop-field-line');
    const desktopFieldTerrain = document.querySelector('.desktop-field-line__terrain');
    const desktopFieldSafety = document.querySelector('.desktop-field-line__safety');
    const desktopFieldNavigation = document.querySelector('.desktop-field-line__navigation');
    const actionDock = document.querySelector('.action-dock');
    const actionControls = actionDock ? Array.from(actionDock.children) : [];
    const mobileFieldStrip = document.querySelector('.mobile-field-strip');
    const mobileHudToggle = document.querySelector('.mobile-field-toggle');
    const mobileFieldCopy = document.querySelector('.mobile-field-strip__copy');
    const mobileObjective = document.querySelector('.mobile-field-strip__objective');
    const mobileSafety = document.querySelector('.mobile-field-strip__safety');
    const mobileTerrain = document.querySelector('.mobile-field-strip__terrain');
    const mobileNavigation = document.querySelector('.mobile-field-strip__navigation');
    const mobileActions = document.querySelector('.mobile-field-strip__actions');
    const mobileVitals = Array.from(document.querySelectorAll('.mobile-vital')).map((vital) => {
      const progress = vital.querySelector('progress');
      const label = vital.querySelector('.mobile-vital__label');
      return {
        label: label?.textContent?.trim() || null,
        labelVisible: visiblyIntersectsViewport(label),
        value: vital.querySelector('.mobile-vital__value')?.textContent?.trim() || null,
        visible: visiblyIntersectsViewport(vital),
        insideViewport: whollyInsideViewport(vital),
        progress: progress instanceof HTMLProgressElement
          ? { value: progress.value, max: progress.max, ariaLabel: progress.getAttribute('aria-label') }
          : null,
      };
    });
    const tutorialButton = document.querySelector('.tutorial-button');
    const titleMenuButton = document.querySelector('.title-menu-button');
    const quietHourButton = document.querySelector('.quiet-button');
    const tutorialDialog = document.querySelector('.tutorial-dialog');
    const tutorialContent = document.querySelector('.tutorial-dialog__content');
    const tutorialTopics = document.querySelector('.tutorial-dialog__topics');
    const tutorialPage = document.querySelector('.tutorial-page');
    const tutorialHeading = document.querySelector('.tutorial-page__title');
    const tutorialPrevious = document.querySelector('[data-tutorial-action="previous"]');
    const tutorialNext = document.querySelector('[data-tutorial-action="next"]');
    const tutorialClose = document.querySelector('[data-tutorial-action="close"]');
    const tutorialPageAction = document.querySelector('[data-tutorial-action="open-patch-notes"]');
    const mobileKitButton = document.querySelector('.mobile-kit-button');
    const kitDialog = document.querySelector('.kit-dialog');
    const kitContent = document.querySelector('.kit-dialog__content');
    const kitHeader = document.querySelector('.kit-dialog__header');
    const kitClose = document.querySelector('[data-kit-action="close"]');
    const kitLoad = document.querySelector('.kit-load');
    const kitLoadLabel = document.querySelector('.kit-load__label');
    const kitLoadValue = document.querySelector('.kit-load__value');
    const kitLoadProgress = document.querySelector('.kit-load__progress');
    const kitTabs = Array.from(document.querySelectorAll('.kit-tab'));
    const kitPanel = document.querySelector('.kit-panel');
    const kitScroll = document.querySelector('.kit-panel__scroll');
    const kitRecipeCards = Array.from(document.querySelectorAll('.kit-recipe'));
    const kitRecipeActions = Array.from(document.querySelectorAll('.kit-action--make'));
    const kitBlockedRecipeCards = kitRecipeCards.filter(
      (recipe) => recipe.getAttribute('data-ready') === 'false',
    );
    const kitBlockedReasons = kitBlockedRecipeCards
      .map((recipe) => recipe.querySelector('.kit-row__reason'))
      .filter((reason) => reason instanceof Element);
    const kitScrollStyle = kitScroll ? getComputedStyle(kitScroll) : null;
    const visiblyRendered = (element) => {
      if (!(element instanceof Element)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number.parseFloat(style.opacity || '1') > 0 &&
        rect.width > 0 &&
        rect.height > 0;
    };
    const visiblyIntersectsKitScroll = (element) => {
      if (!visiblyRendered(element) || !(kitScroll instanceof Element)) return false;
      const rect = element.getBoundingClientRect();
      const scrollRect = kitScroll.getBoundingClientRect();
      return Math.max(rect.left, scrollRect.left, 0) <
          Math.min(rect.right, scrollRect.right, window.innerWidth) &&
        Math.max(rect.top, scrollRect.top, 0) <
          Math.min(rect.bottom, scrollRect.bottom, window.innerHeight);
    };
    const targetProbe = (target) => ({
      visible: visiblyIntersectsViewport(target),
      rendered: visiblyRendered(target),
      insideViewport: whollyInsideViewport(target),
      rect: rectOf(target),
      disabled: target instanceof HTMLButtonElement ? target.disabled : null,
    });
    const contractRail = document.querySelector('.contract-rail');
    const contractSummary = contractRail?.querySelector('.panel-summary') || null;
    const contractList = document.querySelector('.contract-list');
    const contractActionControls = Array.from(document.querySelectorAll('.contract-card__action'));
    const settlementInspector = document.querySelector('.settlement-inspector');
    const reportActionControls = Array.from(document.querySelectorAll('.report-item__action'));
    const residentAbout = document.querySelector('.resident-about');
    const residentAboutHeader = residentAbout?.querySelector('.resident-about__header') || null;
    const residentAboutTitle = residentAbout?.querySelector('.resident-about__title') || null;
    const residentAboutIdentity = residentAbout?.querySelector('.resident-about__identity') || null;
    const residentAboutBody = residentAbout?.querySelector('.resident-about__body') || null;
    const residentAboutKnowledge = residentAbout?.querySelector('.resident-about__knowledge') || null;
    const residentAboutObserved = residentAbout?.querySelector('.resident-about__facts') || null;
    const residentAboutKnown = residentAbout?.querySelectorAll('.resident-about__facts')?.[1] || null;
    const residentAboutClose = residentAbout?.querySelector('.resident-about__close') || null;
    const residentAboutActions = residentAbout?.querySelector('.resident-about__actions') || null;
    const residentAboutGreet = residentAbout?.querySelector('.resident-about__greet') || null;
    const residentAboutActionHint = residentAbout?.querySelector('.resident-about__action-hint') || null;
    const chroniclePanel = document.querySelector('.chronicle-panel');
    const residentAboutStyle = residentAbout ? getComputedStyle(residentAbout) : null;
    const residentAboutBodyStyle = residentAboutBody ? getComputedStyle(residentAboutBody) : null;
    const residentFactRows = residentAbout
      ? Array.from(residentAbout.querySelectorAll('.resident-about__fact'))
      : [];
    const contractStyle = contractList ? getComputedStyle(contractList) : null;
    const contractClientHeight = contractList ? contractList.clientHeight : null;
    const contractScrollHeight = contractList ? contractList.scrollHeight : null;
    const objectiveRect = rectOf(objectivePanel);
    const contractRect = rectOf(contractRail);
    const leftPaneOverlap = objectiveRect && contractRect
      ? Math.max(objectiveRect.left, contractRect.left) < Math.min(objectiveRect.right, contractRect.right) &&
        Math.max(objectiveRect.top, contractRect.top) < Math.min(objectiveRect.bottom, contractRect.bottom)
      : null;
    const interactButton = document.querySelector('.action-button--interact');
    const wayknotButton = document.querySelector('.action-button--wayknot');
    const braceButton = document.querySelector('.brace-button');
    const stabilityDetail = document.querySelector('.vital__detail[data-bracing]');
    const wayknotCount = document.querySelector('.field-readout__wayknot-count');
    const wayknotActive = document.querySelector('.field-readout__wayknot-active');
    const scanButton = document.querySelector('.action-button--scan');
    const tideHarpField = document.querySelector('.field-readout__tide-harps');
    const tideHarpCount = document.querySelector('.field-readout__tide-harp-count');
    const tideHarpActive = document.querySelector('.field-readout__tide-harp-active');
    const tideHarpActiveStyle = tideHarpActive ? getComputedStyle(tideHarpActive) : null;
    const reliefLabelLayer = document.querySelector('.relief-label-layer[data-renderer="relief-3d"]');
    const reliefAdriftLabel = reliefLabelLayer?.querySelector(
      '.relief-world-label[data-tone="adrift"]',
    ) || null;
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
    const projectedTideHarps = renderView && Array.isArray(renderView.tideHarps)
      ? renderView.tideHarps.map((harp) => ({
          id: harp.id,
          label: harp.label,
          active: harp.active,
          center: harp.center ? { x: harp.center.x, y: harp.center.y } : null,
          knots: Array.isArray(harp.knots)
            ? harp.knots.map((knot) => ({
                id: knot.id,
                kind: knot.kind,
                tileIndex: terrain
                  ? Math.floor(knot.point.y / terrain.tileSize) * terrain.columns +
                    Math.floor(knot.point.x / terrain.tileSize)
                  : null,
              }))
            : [],
          edges: Array.isArray(harp.edges)
            ? harp.edges.map((edge) => ({
                id: edge.id,
                fromId: edge.fromId,
                toId: edge.toId,
                from: edge.from ? { x: edge.from.x, y: edge.from.y } : null,
                to: edge.to ? { x: edge.to.x, y: edge.to.y } : null,
              }))
            : [],
        }))
      : [];
    const remoteEchoTile = terrain && Array.isArray(terrain.tiles)
      ? terrain.tiles[${SMOKE_TIDE_HARP.remoteEchoTileIndex}]
      : null;
    const reliefHarpLabels = reliefLabelLayer
      ? Array.from(reliefLabelLayer.querySelectorAll('.relief-world-label'))
          .filter((node) => node.textContent?.includes('Tide Harp'))
          .map((node) => ({
            text: node.textContent?.trim() || null,
            hidden: node.hidden,
            tone: node.getAttribute('data-tone'),
            selected: node.getAttribute('data-selected'),
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
      release: bridge
        ? {
            version: bridge.version || null,
            buildIdentity: bridge.buildIdentity || null,
            gameplayContract: bridge.gameplayContract || null,
          }
        : null,
      uiReady: shell ? shell.getAttribute('data-ready') : null,
      titleOpen: Boolean(title && title.open),
      titleLayout: {
        dialog: rectOf(title),
        content: rectOf(titleContent),
        heading: rectOf(titleHeading),
        headingText: titleHeading?.textContent?.trim() || null,
        restartForm: rectOf(restartForm),
        form: rectOf(newWorldForm),
        seedLabel: rectOf(seedLabel),
        seedInput: rectOf(seedInput),
        beginButton: rectOf(beginWorldButton),
        contentVisible: visiblyIntersectsViewport(titleContent),
        headingVisible: visiblyIntersectsViewport(titleHeading),
        seedLabelVisible: visiblyIntersectsViewport(seedLabel),
        seedLabelText: seedLabel?.textContent?.trim() || null,
        seedInputVisible: visiblyIntersectsViewport(seedInput),
        restartFormVisible: visiblyIntersectsViewport(restartForm),
        restartInputVisible: visiblyIntersectsViewport(restartInput),
        formVisible: visiblyIntersectsViewport(newWorldForm),
        beginButtonVisible: visiblyIntersectsViewport(beginWorldButton),
        beginButtonText: beginWorldButton?.textContent?.trim() || null,
        beginButtonColor: beginWorldButton instanceof Element
          ? getComputedStyle(beginWorldButton).color
          : null,
        continueButtonVisible: visiblyIntersectsViewport(continueWorldButton),
        patchNotesTrigger: {
          ...targetProbe(titlePatchNotesButton),
          text: titlePatchNotesButton?.textContent?.trim() || null,
          ariaControls: titlePatchNotesButton?.getAttribute('aria-controls') || null,
          ariaHasPopup: titlePatchNotesButton?.getAttribute('aria-haspopup') || null,
          focused: document.activeElement === titlePatchNotesButton,
        },
        postureSelectorCount: document.querySelectorAll('input[name="posture"]').length,
        sessionShapeSelectorCount: document.querySelectorAll('input[name="session-shape"]').length,
        clientHeight: title instanceof HTMLElement ? title.clientHeight : null,
        scrollHeight: title instanceof HTMLElement ? title.scrollHeight : null,
        overflowY: title instanceof Element ? getComputedStyle(title).overflowY : null,
      },
      paused: renderView ? Boolean(renderView.paused) : null,
      quietHour: {
        open: quietDialog instanceof HTMLDialogElement ? quietDialog.open : null,
        dialogVisible: visiblyIntersectsViewport(quietDialog),
        dialogInsideViewport: whollyInsideViewport(quietDialog),
        finishVisible: visiblyIntersectsViewport(quietFinishButton),
        finishInsideViewport: whollyInsideViewport(quietFinishButton),
        finishRect: rectOf(quietFinishButton),
        finishDisabled: quietFinishButton instanceof HTMLButtonElement
          ? quietFinishButton.disabled
          : null,
        patchNotesTrigger: {
          ...targetProbe(quietPatchNotesButton),
          text: quietPatchNotesButton?.textContent?.trim() || null,
          ariaControls: quietPatchNotesButton?.getAttribute('aria-controls') || null,
          ariaHasPopup: quietPatchNotesButton?.getAttribute('aria-haspopup') || null,
        },
      },
      patchNotes: {
        open: patchNotesDialog instanceof HTMLDialogElement ? patchNotesDialog.open : null,
        source: patchNotesDialog?.getAttribute('data-open-source') || null,
        latestVersion: patchNotesDialog?.getAttribute('data-latest-version') || null,
        latestBuild: patchNotesDialog?.getAttribute('data-latest-build') || null,
        dialog: targetProbe(patchNotesDialog),
        content: targetProbe(patchNotesContent),
        close: {
          ...targetProbe(patchNotesClose),
          ariaLabel: patchNotesClose?.getAttribute('aria-label') || null,
        },
        scroll: {
          ...targetProbe(patchNotesScroll),
          ariaLabel: patchNotesScroll?.getAttribute('aria-label') || null,
          tabIndex: patchNotesScroll instanceof HTMLElement ? patchNotesScroll.tabIndex : null,
          clientHeight: patchNotesScroll instanceof HTMLElement ? patchNotesScroll.clientHeight : null,
          scrollHeight: patchNotesScroll instanceof HTMLElement ? patchNotesScroll.scrollHeight : null,
          scrollTop: patchNotesScroll instanceof HTMLElement ? patchNotesScroll.scrollTop : null,
          overflowY: patchNotesScroll ? getComputedStyle(patchNotesScroll).overflowY : null,
        },
        releaseCount: patchNoteReleases.length,
        categoryCount: patchNoteCategories.length,
        newestFirst: patchNoteReleases[0]?.getAttribute('data-latest') === 'true',
        hasKnownLimitations: patchNoteCategories.some(
          (category) => category.getAttribute('data-category') === 'knownLimitations'
        ),
      },
      tick: renderView && Number.isFinite(renderView.tick) ? renderView.tick : null,
      worldName: renderView ? renderView.worldName : null,
      surfaceCurrent: renderView?.tide?.surfaceCurrent &&
        Number.isFinite(renderView.tide.surfaceCurrent.x) &&
        Number.isFinite(renderView.tide.surfaceCurrent.y)
        ? {
            x: renderView.tide.surfaceCurrent.x,
            y: renderView.tide.surfaceCurrent.y,
          }
        : null,
      settlementCount: renderView && Array.isArray(renderView.settlements)
        ? renderView.settlements.length
        : null,
      terrainTileCount: renderView && renderView.terrain && Array.isArray(renderView.terrain.tiles)
        ? renderView.terrain.tiles.length
        : null,
      contractCount: uiView && Array.isArray(uiView.contracts) ? uiView.contracts.length : null,
      activeContractCount: activeContracts.length,
      playerCargoLoad: renderView && renderView.player ? renderView.player.cargoLoad : null,
      playerMode: renderView?.player?.mode ?? null,
      playerStamina: renderView?.player?.stamina ?? null,
      playerAdrift: renderView?.player?.adrift
        ? {
            paddling: renderView.player.adrift.paddling === true,
            catchingBreath: renderView.player.adrift.catchingBreath === true,
            canStand: renderView.player.adrift.canStand === true,
            waterDepth: renderView.player.adrift.waterDepth,
            currentDirection: renderView.player.adrift.currentDirection
              ? {
                  x: renderView.player.adrift.currentDirection.x,
                  y: renderView.player.adrift.currentDirection.y,
                }
              : null,
          }
        : null,
      uiAdrift: uiView?.field?.adrift
        ? {
            label: uiView.field.adrift.label,
            instruction: uiView.field.adrift.instruction,
            paddling: uiView.field.adrift.paddling === true,
            catchingBreath: uiView.field.adrift.catchingBreath === true,
            canStand: uiView.field.adrift.canStand === true,
            waterDepth: uiView.field.adrift.waterDepth,
          }
        : null,
      reliefAdrift: reliefAdriftLabel
        ? {
            visible: visiblyIntersectsViewport(reliefAdriftLabel),
            insideViewport: whollyInsideViewport(reliefAdriftLabel),
            text: reliefAdriftLabel.textContent?.trim() || null,
            tone: reliefAdriftLabel.getAttribute('data-tone'),
            selected: reliefAdriftLabel.getAttribute('data-selected'),
          }
        : null,
      playerBracing: renderView?.player?.bracing === true,
      stabilityBraceFeedback: stabilityDetail
        ? {
            text: stabilityDetail.textContent?.trim() || null,
            active: stabilityDetail.getAttribute('data-bracing'),
          }
        : null,
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
      tideHarps: {
        projectedCount: projectedTideHarps.length,
        projected: projectedTideHarps,
        tunedCount: uiView?.field?.tideHarps?.tunedCount ?? null,
        activeId: uiView?.field?.tideHarps?.activeId ?? null,
        activeLabel: uiView?.field?.tideHarps?.activeLabel ?? null,
        benefitLabel: uiView?.field?.tideHarps?.benefitLabel ?? null,
        countText: tideHarpCount?.textContent?.trim() || null,
        activeText: tideHarpActive?.textContent?.trim() || null,
        dataActive: tideHarpField?.getAttribute('data-active') || null,
        dataHarpId: tideHarpField?.getAttribute('data-harp-id') || null,
        ariaLabel: tideHarpField?.getAttribute('aria-label') || null,
        activeGeometry: tideHarpActive
          ? {
              clientWidth: tideHarpActive.clientWidth,
              scrollWidth: tideHarpActive.scrollWidth,
              clientHeight: tideHarpActive.clientHeight,
              scrollHeight: tideHarpActive.scrollHeight,
              whiteSpace: tideHarpActiveStyle?.whiteSpace || null,
              overflowX: tideHarpActiveStyle?.overflowX || null,
              overflowY: tideHarpActiveStyle?.overflowY || null,
            }
          : null,
        reliefLayerHidden: reliefLabelLayer instanceof HTMLElement ? reliefLabelLayer.hidden : null,
        reliefLabels: reliefHarpLabels,
        remoteEcho: remoteEchoTile
          ? {
              tileIndex: ${SMOKE_TIDE_HARP.remoteEchoTileIndex},
              discovered: Number(remoteEchoTile.discovered || 0),
              depthKnown: Number(remoteEchoTile.depthKnown || 0),
            }
          : null,
      },
      scan: scanButton
        ? { disabled: scanButton instanceof HTMLButtonElement ? scanButton.disabled : null }
        : null,
      announcement: uiView?.announcement
        ? {
            id: uiView.announcement.id,
            message: uiView.announcement.message,
            assertive: uiView.announcement.assertive,
          }
        : null,
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
      compass: worldCompass
        ? {
            visible: visiblyIntersectsViewport(worldCompass),
            insideViewport: whollyInsideViewport(worldCompass),
            rect: rectOf(worldCompass),
            pointerEvents: getComputedStyle(worldCompass).pointerEvents,
            viewMode: worldCompass.getAttribute('data-view-mode'),
            angle: getComputedStyle(worldCompass).getPropertyValue('--world-north-angle').trim(),
            ariaLabel: worldCompass.getAttribute('aria-label'),
            role: worldCompass.getAttribute('role'),
            north: worldCompassNorth?.textContent?.trim() || null,
            arrow: worldCompassArrow?.textContent?.trim() || null,
          }
        : null,
      desktopField: {
        visible: visiblyIntersectsViewport(desktopFieldLine),
        insideViewport: whollyInsideViewport(desktopFieldLine),
        pointerEvents: desktopFieldLine ? getComputedStyle(desktopFieldLine).pointerEvents : null,
        terrain: desktopFieldTerrain?.textContent?.trim() || null,
        safety: desktopFieldSafety?.textContent?.trim() || null,
        navigation: desktopFieldNavigation?.textContent?.trim() || null,
      },
      promises: {
        railOpen: contractRail instanceof HTMLDetailsElement ? contractRail.open : null,
        railVisible: visiblyIntersectsViewport(contractRail),
        railInsideViewport: whollyInsideViewport(contractRail),
        summaryVisible: visiblyIntersectsViewport(contractSummary),
        listVisible: visiblyIntersectsViewport(contractList),
        listInsideViewport: whollyInsideViewport(contractList),
        listTabIndex: contractList instanceof HTMLElement ? contractList.tabIndex : null,
        clientHeight: contractClientHeight,
        scrollHeight: contractScrollHeight,
        overflowY: contractStyle ? contractStyle.overflowY : null,
        hasVerticalOverflow:
          contractClientHeight !== null &&
          contractScrollHeight !== null &&
          contractScrollHeight > contractClientHeight + 1,
        actionTargetCount: contractActionControls.length,
        actionTargetsAtLeast44: contractActionControls.every((control) => {
          const rect = control.getBoundingClientRect();
          return rect.width >= 44 && rect.height >= 44;
        }),
      },
      residentAbout: {
        selectedId: uiView?.selectedResident?.id || null,
        open: residentAbout instanceof HTMLElement ? !residentAbout.hidden : null,
        visible: visiblyIntersectsViewport(residentAbout),
        insideViewport: whollyInsideViewport(residentAbout),
        rect: rectOf(residentAbout),
        role: residentAbout?.getAttribute('role') || null,
        modal: residentAbout?.getAttribute('data-modal') || null,
        pausesGameplay: residentAbout?.getAttribute('data-pauses-gameplay') || null,
        pointerEvents: residentAbout ? getComputedStyle(residentAbout).pointerEvents : null,
        paneFree: residentAboutStyle
          ? residentAboutStyle.backgroundColor === 'rgba(0, 0, 0, 0)' &&
            residentAboutStyle.backgroundImage === 'none' &&
            Number.parseFloat(residentAboutStyle.borderTopWidth || '0') === 0 &&
            residentAboutStyle.boxShadow === 'none' &&
            residentAboutStyle.backdropFilter === 'none'
          : null,
        heading: residentAboutTitle?.textContent?.trim() || null,
        identity: residentAboutIdentity?.textContent?.trim() || null,
        knowledge: residentAboutKnowledge?.textContent?.trim() || null,
        observedFactCount: residentAboutObserved?.querySelectorAll('.resident-about__fact').length ?? null,
        knownFactCount: residentAboutKnown?.querySelectorAll('.resident-about__fact').length ?? null,
        header: {
          visible: visiblyIntersectsViewport(residentAboutHeader),
          insideViewport: whollyInsideViewport(residentAboutHeader),
          rect: rectOf(residentAboutHeader),
          pointerEvents: residentAboutHeader ? getComputedStyle(residentAboutHeader).pointerEvents : null,
        },
        body: {
          visible: visiblyIntersectsViewport(residentAboutBody),
          insideViewport: whollyInsideViewport(residentAboutBody),
          rect: rectOf(residentAboutBody),
          pointerEvents: residentAboutBodyStyle?.pointerEvents || null,
          overflowX: residentAboutBodyStyle?.overflowX || null,
          overflowY: residentAboutBodyStyle?.overflowY || null,
          overscrollBehavior: residentAboutBodyStyle?.overscrollBehavior || null,
          tabIndex: residentAboutBody instanceof HTMLElement ? residentAboutBody.tabIndex : null,
          ariaLabel: residentAboutBody?.getAttribute('aria-label') || null,
          clientWidth: residentAboutBody instanceof HTMLElement ? residentAboutBody.clientWidth : null,
          scrollWidth: residentAboutBody instanceof HTMLElement ? residentAboutBody.scrollWidth : null,
          clientHeight: residentAboutBody instanceof HTMLElement ? residentAboutBody.clientHeight : null,
          scrollHeight: residentAboutBody instanceof HTMLElement ? residentAboutBody.scrollHeight : null,
          scrollTop: residentAboutBody instanceof HTMLElement ? residentAboutBody.scrollTop : null,
          hasVerticalOverflow: residentAboutBody instanceof HTMLElement
            ? residentAboutBody.scrollHeight > residentAboutBody.clientHeight + 1
            : null,
          hasHorizontalOverflow: residentAboutBody instanceof HTMLElement
            ? residentAboutBody.scrollWidth > residentAboutBody.clientWidth + 1
            : null,
          factsInsideWidth: residentAboutBody instanceof HTMLElement
            ? residentFactRows.every((row) => {
                const rowRect = row.getBoundingClientRect();
                const bodyRect = residentAboutBody.getBoundingClientRect();
                return rowRect.left >= bodyRect.left - 1 && rowRect.right <= bodyRect.right + 1;
              })
            : null,
        },
        actions: {
          visible: visiblyIntersectsViewport(residentAboutActions),
          insideViewport: whollyInsideViewport(residentAboutActions),
          rect: rectOf(residentAboutActions),
          pointerEvents: residentAboutActions ? getComputedStyle(residentAboutActions).pointerEvents : null,
        },
        overlapsTopHud: elementsOverlap(
          residentAbout,
          visiblyIntersectsViewport(mobileFieldStrip) ? mobileFieldStrip : hudBar,
        ),
        overlapsActionDock: elementsOverlap(residentAbout, actionDock),
        close: {
          ...targetProbe(residentAboutClose),
          pointerEvents: residentAboutClose ? getComputedStyle(residentAboutClose).pointerEvents : null,
          ariaLabel: residentAboutClose?.getAttribute('aria-label') || null,
        },
        greet: {
          ...targetProbe(residentAboutGreet),
          pointerEvents: residentAboutGreet ? getComputedStyle(residentAboutGreet).pointerEvents : null,
          text: residentAboutGreet?.textContent?.trim() || null,
          ariaDescribedBy: residentAboutGreet?.getAttribute('aria-describedby') || null,
        },
        actionHint: {
          visible: visiblyIntersectsViewport(residentAboutActionHint),
          insideViewport: whollyInsideViewport(residentAboutActionHint),
          id: residentAboutActionHint?.id || null,
          text: residentAboutActionHint?.textContent?.trim() || null,
        },
        chronicleVisible: visiblyIntersectsViewport(chroniclePanel),
      },
      mobileHud: {
        breakpointActive: window.matchMedia(
          '(max-width: 44rem), (max-height: 34rem) and (max-width: 64rem)',
        ).matches,
        portraitBreakpointActive: window.matchMedia('(max-width: 44rem)').matches,
        shortLandscapeBreakpointActive: window.matchMedia(
          '(max-height: 34rem) and (max-width: 64rem)',
        ).matches,
        expanded: shell?.getAttribute('data-mobile-hud-expanded') || null,
        sheet: shell?.getAttribute('data-mobile-sheet') || null,
        desktopHud: {
          visible: visiblyIntersectsViewport(hudBar),
          display: hudBar ? getComputedStyle(hudBar).display : null,
          rect: rectOf(hudBar),
        },
        strip: {
          visible: visiblyIntersectsViewport(mobileFieldStrip),
          insideViewport: whollyInsideViewport(mobileFieldStrip),
          rect: rectOf(mobileFieldStrip),
          pointerEvents: mobileFieldStrip ? getComputedStyle(mobileFieldStrip).pointerEvents : null,
          overflowX: mobileFieldStrip instanceof HTMLElement
            ? mobileFieldStrip.scrollWidth > mobileFieldStrip.clientWidth + 1
            : null,
        },
        toggle: mobileHudToggle
          ? {
              visible: visiblyIntersectsViewport(mobileHudToggle),
              insideViewport: whollyInsideViewport(mobileHudToggle),
              rect: rectOf(mobileHudToggle),
              ariaExpanded: mobileHudToggle.getAttribute('aria-expanded'),
              ariaControls: mobileHudToggle.getAttribute('aria-controls'),
              ariaLabel: mobileHudToggle.getAttribute('aria-label'),
              text: mobileHudToggle.textContent?.trim() || null,
              disabled: mobileHudToggle instanceof HTMLButtonElement ? mobileHudToggle.disabled : null,
              pointerEvents: getComputedStyle(mobileHudToggle).pointerEvents,
            }
          : null,
        compactCopy: {
          visible: visiblyIntersectsViewport(mobileFieldCopy),
          objective: mobileObjective?.textContent?.trim() || null,
          safety: mobileSafety?.textContent?.trim() || null,
          terrain: mobileTerrain?.textContent?.trim() || null,
          navigation: mobileNavigation?.textContent?.trim() || null,
          actions: mobileActions?.textContent?.trim() || null,
          vitals: mobileVitals,
        },
        titleMenuButton: {
          visible: visiblyIntersectsViewport(titleMenuButton),
          display: titleMenuButton ? getComputedStyle(titleMenuButton).display : null,
        },
        quietHourButton: {
          visible: visiblyIntersectsViewport(quietHourButton),
          insideViewport: whollyInsideViewport(quietHourButton),
          rect: rectOf(quietHourButton),
          visibleText: quietHourButton instanceof HTMLElement ? quietHourButton.innerText.trim() : null,
          ariaLabel: quietHourButton?.getAttribute('aria-label') || null,
        },
        objective: {
          visible: visiblyIntersectsViewport(objectivePanel),
          insideViewport: whollyInsideViewport(objectivePanel),
          rect: rectOf(objectivePanel),
          display: objectivePanel ? getComputedStyle(objectivePanel).display : null,
          pointerEvents: objectivePanel ? getComputedStyle(objectivePanel).pointerEvents : null,
          overlapsStrip: elementsOverlap(objectivePanel, mobileFieldStrip),
          overlapsActionDock: elementsOverlap(objectivePanel, actionDock),
        },
        promises: {
          visible: visiblyIntersectsViewport(contractRail),
          insideViewport: whollyInsideViewport(contractRail),
          rect: rectOf(contractRail),
          display: contractRail ? getComputedStyle(contractRail).display : null,
          pointerEvents: contractRail ? getComputedStyle(contractRail).pointerEvents : null,
          overlapsStrip: elementsOverlap(contractRail, mobileFieldStrip),
          overlapsActionDock: elementsOverlap(contractRail, actionDock),
        },
        inspector: {
          visible: visiblyIntersectsViewport(settlementInspector),
          insideViewport: whollyInsideViewport(settlementInspector),
          rect: rectOf(settlementInspector),
          display: settlementInspector ? getComputedStyle(settlementInspector).display : null,
          pointerEvents: settlementInspector ? getComputedStyle(settlementInspector).pointerEvents : null,
          clientHeight: settlementInspector instanceof HTMLElement ? settlementInspector.clientHeight : null,
          scrollHeight: settlementInspector instanceof HTMLElement ? settlementInspector.scrollHeight : null,
          overflowY: settlementInspector ? getComputedStyle(settlementInspector).overflowY : null,
          hidden: settlementInspector instanceof HTMLElement ? settlementInspector.hidden : null,
          overlapsStrip: elementsOverlap(settlementInspector, mobileFieldStrip),
          overlapsActionDock: elementsOverlap(settlementInspector, actionDock),
          reportTargetCount: reportActionControls.length,
          reportTargetsAtLeast44: reportActionControls.every((control) => {
            const rect = control.getBoundingClientRect();
            return rect.width >= 44 && rect.height >= 44;
          }),
        },
        actionDock: {
          visible: visiblyIntersectsViewport(actionDock),
          insideViewport: whollyInsideViewport(actionDock),
          controlsInsideViewport: actionControls
            .filter((control) => visiblyIntersectsViewport(control))
            .every((control) => whollyInsideViewport(control)),
          coreControlsVisibleAndInside: [scanButton, interactButton, wayknotButton]
            .every((control) => visiblyIntersectsViewport(control) && whollyInsideViewport(control)),
          brace: braceButton
            ? {
                visible: visiblyIntersectsViewport(braceButton),
                insideViewport: whollyInsideViewport(braceButton),
                rect: rectOf(braceButton),
                text: braceButton.textContent?.trim() || null,
                ariaPressed: braceButton.getAttribute('aria-pressed'),
                ariaLabel: braceButton.getAttribute('aria-label'),
              }
            : null,
          labelsInsideControls: actionControls
            .filter((control) => visiblyIntersectsViewport(control))
            .every((control) => Array.from(control.querySelectorAll('.action-button__label')).every((label) => {
              const controlRect = control.getBoundingClientRect();
              const labelRect = label.getBoundingClientRect();
              return labelRect.left >= controlRect.left - 1 &&
                labelRect.right <= controlRect.right + 1 &&
                labelRect.top >= controlRect.top - 1 &&
                labelRect.bottom <= controlRect.bottom + 1;
            })),
          rect: rectOf(actionDock),
          overflowX: actionDock instanceof HTMLElement
            ? actionDock.scrollWidth > actionDock.clientWidth + 1
            : null,
        },
      },
      tutorial: {
        button: tutorialButton
          ? {
              visible: visiblyIntersectsViewport(tutorialButton),
              insideViewport: whollyInsideViewport(tutorialButton),
              rect: rectOf(tutorialButton),
              text: tutorialButton.textContent?.trim() || null,
              visibleText: tutorialButton.innerText?.trim() || null,
              ariaLabel: tutorialButton.getAttribute('aria-label'),
              ariaKeyShortcuts: tutorialButton.getAttribute('aria-keyshortcuts'),
            }
          : null,
        open: tutorialDialog instanceof HTMLDialogElement ? tutorialDialog.open : null,
        audience: tutorialDialog?.getAttribute('data-tutorial-audience') || null,
        pageId: tutorialDialog?.getAttribute('data-tutorial-page') || null,
        dialog: {
          visible: visiblyIntersectsViewport(tutorialDialog),
          insideViewport: whollyInsideViewport(tutorialDialog),
          rect: rectOf(tutorialDialog),
        },
        content: {
          visible: visiblyIntersectsViewport(tutorialContent),
          insideViewport: whollyInsideViewport(tutorialContent),
          rect: rectOf(tutorialContent),
        },
        topics: {
          visible: visiblyIntersectsViewport(tutorialTopics),
          insideViewport: whollyInsideViewport(tutorialTopics),
          rect: rectOf(tutorialTopics),
          overflowX: tutorialTopics ? getComputedStyle(tutorialTopics).overflowX : null,
        },
        page: {
          visible: visiblyIntersectsViewport(tutorialPage),
          insideViewport: whollyInsideViewport(tutorialPage),
          rect: rectOf(tutorialPage),
          clientHeight: tutorialPage instanceof HTMLElement ? tutorialPage.clientHeight : null,
          scrollHeight: tutorialPage instanceof HTMLElement ? tutorialPage.scrollHeight : null,
          overflowY: tutorialPage ? getComputedStyle(tutorialPage).overflowY : null,
          heading: tutorialHeading?.textContent?.trim() || null,
        },
        controls: [tutorialPrevious, tutorialNext, tutorialClose].map((control) => ({
          visible: visiblyIntersectsViewport(control),
          insideViewport: whollyInsideViewport(control),
          rect: rectOf(control),
          disabled: control instanceof HTMLButtonElement ? control.disabled : null,
        })),
        pageAction: {
          ...targetProbe(tutorialPageAction),
          text: tutorialPageAction?.textContent?.trim() || null,
          ariaControls: tutorialPageAction?.getAttribute('aria-controls') || null,
          ariaHasPopup: tutorialPageAction?.getAttribute('aria-haspopup') || null,
          focused: document.activeElement === tutorialPageAction,
        },
      },
      kit: {
        trigger: mobileKitButton
          ? {
              ...targetProbe(mobileKitButton),
              text: mobileKitButton.textContent?.trim() || null,
              ariaControls: mobileKitButton.getAttribute('aria-controls'),
              ariaExpanded: mobileKitButton.getAttribute('aria-expanded'),
              ariaHasPopup: mobileKitButton.getAttribute('aria-haspopup'),
              ariaKeyShortcuts: mobileKitButton.getAttribute('aria-keyshortcuts'),
              pointerEvents: getComputedStyle(mobileKitButton).pointerEvents,
            }
          : null,
        open: kitDialog instanceof HTMLDialogElement ? kitDialog.open : null,
        modal: kitDialog instanceof HTMLDialogElement && kitDialog.open
          ? kitDialog.matches(':modal')
          : false,
        tab: kitDialog?.getAttribute('data-kit-tab') || null,
        pausesWorld: kitDialog?.getAttribute('data-pauses-world') || null,
        dialog: targetProbe(kitDialog),
        content: targetProbe(kitContent),
        header: targetProbe(kitHeader),
        close: {
          ...targetProbe(kitClose),
          text: kitClose?.textContent?.trim() || null,
          ariaLabel: kitClose?.getAttribute('aria-label') || null,
        },
        load: {
          ...targetProbe(kitLoad),
          label: kitLoadLabel?.textContent?.trim() || null,
          value: kitLoadValue?.textContent?.trim() || null,
          valueVisible: visiblyIntersectsViewport(kitLoadValue),
          progress: kitLoadProgress instanceof HTMLProgressElement
            ? {
                visible: visiblyIntersectsViewport(kitLoadProgress),
                insideViewport: whollyInsideViewport(kitLoadProgress),
                value: kitLoadProgress.value,
                max: kitLoadProgress.max,
                ariaLabel: kitLoadProgress.getAttribute('aria-label'),
                ariaValueText: kitLoadProgress.getAttribute('aria-valuetext'),
              }
            : null,
        },
        tabs: kitTabs.map((tab) => ({
          ...targetProbe(tab),
          text: tab.textContent?.trim() || null,
          id: tab.id || null,
          selected: tab.getAttribute('aria-selected'),
          controls: tab.getAttribute('aria-controls'),
          role: tab.getAttribute('role'),
        })),
        panel: {
          ...targetProbe(kitPanel),
          role: kitPanel?.getAttribute('role') || null,
          labelledBy: kitPanel?.getAttribute('aria-labelledby') || null,
        },
        scroll: {
          ...targetProbe(kitScroll),
          ariaLabel: kitScroll?.getAttribute('aria-label') || null,
          tabIndex: kitScroll instanceof HTMLElement ? kitScroll.tabIndex : null,
          clientHeight: kitScroll instanceof HTMLElement ? kitScroll.clientHeight : null,
          scrollHeight: kitScroll instanceof HTMLElement ? kitScroll.scrollHeight : null,
          scrollTop: kitScroll instanceof HTMLElement ? kitScroll.scrollTop : null,
          maxScrollTop: kitScroll instanceof HTMLElement
            ? Math.max(0, kitScroll.scrollHeight - kitScroll.clientHeight)
            : null,
          overflowY: kitScrollStyle?.overflowY || null,
          overscrollBehavior: kitScrollStyle?.overscrollBehavior || null,
          hasVerticalOverflow: kitScroll instanceof HTMLElement
            ? kitScroll.scrollHeight > kitScroll.clientHeight + 1
            : null,
        },
        fixedChromeSeparated: Boolean(
          kitLoad &&
          kitTabs[0] &&
          kitPanel &&
          kitLoad.getBoundingClientRect().bottom <= kitTabs[0].getBoundingClientRect().top + 1 &&
          kitTabs[0].getBoundingClientRect().bottom <= kitPanel.getBoundingClientRect().top + 1
        ),
        recipeCount: kitRecipeCards.length,
        recipeActionCount: kitRecipeActions.length,
        blockedRecipeCount: kitBlockedRecipeCards.length,
        blockedReasonCount: kitBlockedReasons.length,
        visibleRecipeActionCount: kitRecipeActions.filter(visiblyIntersectsKitScroll).length,
        visibleBlockedReasonCount: kitBlockedReasons.filter(visiblyIntersectsKitScroll).length,
        recipeActionsAtLeast44: kitRecipeActions.every((action) => {
          const rect = action.getBoundingClientRect();
          return rect.width >= 44 && rect.height >= 44;
        }),
        recipeActionsWithinScrollWidth: kitScroll instanceof HTMLElement
          ? kitRecipeActions.every((action) => {
              const actionRect = action.getBoundingClientRect();
              const scrollRect = kitScroll.getBoundingClientRect();
              return actionRect.left >= scrollRect.left - 1 && actionRect.right <= scrollRect.right + 1;
            })
          : null,
        blockedReasonsRendered: kitBlockedReasons.every((reason) =>
          visiblyRendered(reason) && Boolean(reason.textContent?.trim())
        ),
        disabledActionsHaveReasons: kitBlockedRecipeCards.every((recipe) => {
          const action = recipe.querySelector('.kit-action--make');
          const reason = recipe.querySelector('.kit-row__reason');
          return action instanceof HTMLButtonElement &&
            action.disabled &&
            Boolean(action.title.trim()) &&
            visiblyRendered(reason) &&
            Boolean(reason?.textContent?.trim());
        }),
        activeElementIsTrigger: document.activeElement === mobileKitButton,
      },
      leftPaneGap: objectivePanel && contractRail
        ? contractRail.getBoundingClientRect().top - objectivePanel.getBoundingClientRect().bottom
        : null,
      layout: {
        leftRailDisplay: leftRail ? getComputedStyle(leftRail).display : null,
        leftRailPointerEvents: leftRail ? getComputedStyle(leftRail).pointerEvents : null,
        objectivePosition: objectivePanel ? getComputedStyle(objectivePanel).position : null,
        objectivePointerEvents: objectivePanel ? getComputedStyle(objectivePanel).pointerEvents : null,
        contractPosition: contractRail ? getComputedStyle(contractRail).position : null,
        contractPointerEvents: contractRail ? getComputedStyle(contractRail).pointerEvents : null,
        objective: objectiveRect,
        contract: contractRect,
        hud: rectOf(hudBar),
        actionDock: rectOf(actionDock),
        leftPaneOverlap,
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

function probeHasOpenPatchNotes(probe, source) {
  const notes = probe?.patchNotes;
  return Boolean(
    notes?.open === true &&
    notes.source === source &&
    notes.latestVersion === SMOKE_EXPECTED_RELEASE_VERSION &&
    notes.latestBuild === SMOKE_EXPECTED_RELEASE_VERSION &&
    notes.dialog?.visible === true &&
    notes.dialog.insideViewport === true &&
    notes.content?.visible === true &&
    notes.content.insideViewport === true &&
    notes.close?.visible === true &&
    notes.close.insideViewport === true &&
    notes.close.rect?.width >= 44 &&
    notes.close.rect?.height >= 44 &&
    notes.close.ariaLabel?.includes('Close Patch Notes') &&
    notes.scroll?.visible === true &&
    notes.scroll.insideViewport === true &&
    notes.scroll.tabIndex === 0 &&
    notes.scroll.clientHeight >= 96 &&
    notes.scroll.scrollHeight > notes.scroll.clientHeight &&
    (notes.scroll.overflowY === 'auto' || notes.scroll.overflowY === 'scroll') &&
    notes.scroll.ariaLabel?.includes('newest release first') &&
    notes.releaseCount >= 2 &&
    notes.categoryCount >= 12 &&
    notes.newestFirst === true &&
    notes.hasKnownLimitations === true
  );
}

function probeHasResidentAbout(probe, acquainted) {
  const about = probe?.residentAbout;
  const known = acquainted === true;
  return Boolean(
    probe?.paused === false &&
    about?.selectedId &&
    about.open === true &&
    about.visible === true &&
    about.insideViewport === true &&
    about.role === 'region' &&
    about.modal === 'false' &&
    about.pausesGameplay === 'false' &&
    about.pointerEvents === 'none' &&
    about.paneFree === true &&
    about.overlapsTopHud === false &&
    about.overlapsActionDock === false &&
    about.observedFactCount >= 5 &&
    about.chronicleVisible === false &&
    about.header?.visible === true &&
    about.header.insideViewport === true &&
    about.header.pointerEvents === 'none' &&
    about.body?.visible === true &&
    about.body.insideViewport === true &&
    about.body.pointerEvents === 'auto' &&
    about.body.overflowX === 'hidden' &&
    (about.body.overflowY === 'auto' || about.body.overflowY === 'scroll') &&
    about.body.overscrollBehavior === 'contain' &&
    about.body.tabIndex === 0 &&
    about.body.ariaLabel?.toLowerCase().includes('scrollable resident details') &&
    about.body.clientHeight > 0 &&
    about.body.scrollHeight >= about.body.clientHeight &&
    about.body.hasHorizontalOverflow === false &&
    about.body.factsInsideWidth === true &&
    about.close?.visible === true &&
    about.close.insideViewport === true &&
    about.close.rect?.width >= 44 &&
    about.close.rect?.height >= 44 &&
    about.close.pointerEvents === 'auto' &&
    about.close.ariaLabel?.toLowerCase().includes('close resident') &&
    (known
      ? about.knowledge === 'Acquainted' &&
        about.heading !== 'UNKNOWN RESIDENT' &&
        about.heading !== 'UNKNOWN PORTER' &&
        about.knownFactCount === 3 &&
        about.greet.visible === false
      : (about.knowledge === 'Unfamiliar' || about.knowledge === 'Recognized') &&
        (about.heading === 'UNKNOWN RESIDENT' || about.heading === 'UNKNOWN PORTER') &&
        about.knownFactCount === 0 &&
        about.greet.visible === true &&
        about.greet.insideViewport === true &&
        about.greet.rect?.width >= 44 &&
        about.greet.rect?.height >= 44 &&
        about.greet.pointerEvents === 'auto' &&
        about.greet.disabled === false &&
        about.greet.text === 'GREET' &&
        !about.greet.ariaDescribedBy &&
        about.actionHint?.visible === false)
  );
}

async function sendPhysicalLeftClick(contents, rect, label) {
  if (
    !rect ||
    !Number.isFinite(rect.left) ||
    !Number.isFinite(rect.top) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    throw new Error(`${label} did not expose a physical click rectangle`);
  }
  const x = Math.round(rect.left + rect.width / 2);
  const y = Math.round(rect.top + rect.height / 2);
  contents.sendInputEvent({ type: 'mouseMove', x, y, movementX: 0, movementY: 0 });
  contents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
  contents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 90));
  return { x, y };
}

async function exerciseResidentAboutPhysicalScroll(contents, probe) {
  const body = probe?.residentAbout?.body;
  if (!body?.hasVerticalOverflow) {
    return {
      required: false,
      initialScrollTop: body?.scrollTop ?? null,
      finalScrollTop: body?.scrollTop ?? null,
    };
  }
  const rect = body.rect;
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    throw new Error('resident ABOUT overflow existed without a physical scroll rectangle');
  }
  const x = Math.round(rect.left + rect.width / 2);
  const y = Math.round(rect.top + rect.height / 2);
  const initialScrollTop = body.scrollTop;
  contents.sendInputEvent({ type: 'mouseMove', x, y, movementX: 0, movementY: 0 });
  for (const deltaY of [240, -240]) {
    contents.sendInputEvent({
      type: 'mouseWheel',
      x,
      y,
      deltaX: 0,
      deltaY,
      canScroll: true,
      hasPreciseScrollingDeltas: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 140));
    const moved = await readRendererProbe(contents);
    if ((moved.residentAbout?.body?.scrollTop ?? 0) > initialScrollTop + 1) {
      return {
        required: true,
        point: { x, y },
        initialScrollTop,
        finalScrollTop: moved.residentAbout.body.scrollTop,
        maxScrollTop: moved.residentAbout.body.scrollHeight - moved.residentAbout.body.clientHeight,
      };
    }
  }
  throw new Error('resident ABOUT facts overflowed but physical wheel input did not scroll them');
}

async function exerciseSmokeResidentAbout(
  contents,
  excludedResidentIds = [],
  captureOpenState = null,
) {
  const exclusions = (Array.isArray(excludedResidentIds) ? excludedResidentIds : [excludedResidentIds])
    .filter((id) => id !== null && id !== undefined)
    .map(String);
  const target = await contents.executeJavaScript(`(() => {
    const bridge = window.__TIDEWEFT__;
    const runtime = bridge?.runtime;
    const renderer = bridge?.renderer;
    const view = runtime?.getRenderView?.();
    if (!renderer?.setMode || !renderer?.focusWorld || !view?.player?.position || !Array.isArray(view.porters)) {
      return null;
    }
    const candidates = view.porters
      .filter((porter) => !${JSON.stringify(exclusions)}.includes(String(porter?.id)) && porter?.position)
      .map((porter) => ({
        porter,
        distance: Math.hypot(
          porter.position.x - view.player.position.x,
          porter.position.y - view.player.position.y,
        ),
      }))
      .filter(({ distance }) => distance <= 70)
      .sort((left, right) => {
        const leftWaiting = left.porter.state === 'waiting' ? 0 : 1;
        const rightWaiting = right.porter.state === 'waiting' ? 0 : 1;
        return leftWaiting - rightWaiting || left.distance - right.distance ||
          String(left.porter.id).localeCompare(String(right.porter.id));
      });
    const chosen = candidates[0];
    if (!chosen) return null;
    const previousMode = renderer.mode();
    renderer.setMode('chart-2d');
    renderer.focusWorld(chosen.porter.position, 1.65);
    return { id: chosen.porter.id, previousMode, distance: chosen.distance };
  })()`, true);
  if (!target?.id) throw new Error('no nearby resident was available for a physical Chart selection');
  await waitForRenderer(
    contents,
    (probe) => probeHasActiveRenderer(probe, 'chart-2d'),
    SMOKE_TEST.timeoutMs,
  );
  // focusWorld keeps this resident at Chart center for 1.8 seconds. Give the
  // eased camera enough time to settle before the OS-level pointer click.
  await new Promise((resolve) => setTimeout(resolve, 760));
  const chartTarget = await contents.executeJavaScript(`(() => {
    const canvas = document.querySelector('#p5-mount canvas[data-renderer="chart-2d"]:not([hidden])');
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const rect = canvas.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  })()`, true);
  const canvasPoint = await sendPhysicalLeftClick(contents, chartTarget, 'resident Chart target');

  const opened = await waitForRenderer(
    contents,
    (probe) => probe.residentAbout?.selectedId === target.id && probeHasResidentAbout(probe, false),
    SMOKE_TEST.timeoutMs,
  );
  const greetPoint = await sendPhysicalLeftClick(
    contents,
    opened.residentAbout.greet.rect,
    'resident GREET',
  );
  const acquainted = await waitForRenderer(
    contents,
    (probe) => probe.residentAbout?.selectedId === target.id && probeHasResidentAbout(probe, true),
    SMOKE_TEST.timeoutMs,
  );
  if (target.previousMode !== 'chart-2d') {
    await contents.executeJavaScript(`(() => {
      const renderer = window.__TIDEWEFT__?.renderer;
      return renderer?.setMode?.(${JSON.stringify(target.previousMode)}) ?? null;
    })()`, true);
    await waitForRenderer(
      contents,
      (probe) => probeHasActiveRenderer(probe, target.previousMode),
      SMOKE_TEST.timeoutMs,
    );
  }
  const screenshot = typeof captureOpenState === 'function'
    ? await captureOpenState()
    : null;
  const scroll = await exerciseResidentAboutPhysicalScroll(contents, acquainted);
  const beforeClose = await readRendererProbe(contents);
  const closePoint = await sendPhysicalLeftClick(
    contents,
    beforeClose.residentAbout.close.rect,
    'resident ABOUT close',
  );
  const closed = await waitForRenderer(
    contents,
    (probe) => probe.residentAbout?.open === false && probe.residentAbout?.selectedId === null,
    SMOKE_TEST.timeoutMs,
  );
  return {
    id: target.id,
    distance: target.distance,
    input: { canvasPoint, greetPoint, closePoint },
    opened,
    acquainted,
    scroll,
    closed,
    screenshot,
  };
}

async function verifySmokeTitlePatchNotes(contents) {
  const opened = await contents.executeJavaScript(`(() => {
    const title = document.querySelector('.title-dialog');
    const button = title?.querySelector('.patch-notes-trigger');
    if (!(title instanceof HTMLDialogElement) || !title.open ||
        !(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`, true);
  if (!opened) throw new Error('the title Patch Notes trigger was unavailable');
  const open = await waitForRenderer(
    contents,
    (probe) => probe.titleOpen === false && probeHasOpenPatchNotes(probe, 'title'),
    SMOKE_TEST.timeoutMs,
  );
  const scrolled = await contents.executeJavaScript(`(() => {
    const scroll = document.querySelector('.patch-notes-dialog__scroll');
    if (!(scroll instanceof HTMLElement) || scroll.scrollHeight <= scroll.clientHeight) return false;
    scroll.scrollTop = scroll.scrollHeight;
    scroll.dispatchEvent(new Event('scroll', { bubbles: true }));
    return scroll.scrollTop > 0;
  })()`, true);
  if (!scrolled) throw new Error('the offline Patch Notes ledger could not scroll');
  const closed = await contents.executeJavaScript(`(() => {
    const button = document.querySelector('[data-patch-action="close"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`, true);
  if (!closed) throw new Error('the title Patch Notes dialog could not close');
  const returned = await waitForRenderer(
    contents,
    (probe) =>
      probe.titleOpen === true &&
      probe.patchNotes?.open === false &&
      probe.titleLayout?.patchNotesTrigger?.focused === true,
    SMOKE_TEST.timeoutMs,
  );
  return { open, returned };
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
    seed.value = ${JSON.stringify(SMOKE_WORLD_SEED)};
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
    for (const parcel of view.looseCargo || []) {
      occupied.add(
        Math.floor(parcel.position.y / terrain.tileSize) * terrain.columns +
        Math.floor(parcel.position.x / terrain.tileSize),
      );
    }
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

/**
 * The proven Harp fixture is intentionally installed through the smoke
 * profile's persisted save, then reloaded through the production validator.
 * Walking the remote generated fixture with loaded cargo would make this
 * package gate depend on stamina recovery and tide timing. No renderer or
 * gameplay debug API is shipped for this setup.
 */
async function installSmokeTideHarpFixture(contents) {
  const fixture = await contents.executeJavaScript(`(async () => {
    const runtime = window.__TIDEWEFT__?.runtime;
    if (!runtime?.save || !runtime?.getRenderView) return null;
    await runtime.save();

    const openRequest = indexedDB.open('tideweft', 1);
    const database = await new Promise((resolve, reject) => {
      openRequest.addEventListener('success', () => resolve(openRequest.result), { once: true });
      openRequest.addEventListener('error', () => reject(openRequest.error), { once: true });
    });
    const readTransaction = database.transaction('saves', 'readonly');
    const getRequest = readTransaction.objectStore('saves').get('autosave');
    const record = await new Promise((resolve, reject) => {
      getRequest.addEventListener('success', () => resolve(getRequest.result), { once: true });
      getRequest.addEventListener('error', () => reject(getRequest.error), { once: true });
    });
    if (!record || typeof record.worldJson !== 'string') {
      database.close();
      return null;
    }

    const envelope = JSON.parse(record.worldJson);
    const player = envelope?.player;
    const knots = player?.wayknots?.wayknots;
    const promiseJourney = envelope?.promiseJourney;
    const activeRegion = envelope?.physicalCargo?.activeRegion;
    if (
      envelope?.format !== 'tideweft-session' ||
      envelope?.version !== 5 ||
      record.payloadVersion !== 5 ||
      typeof envelope.regionalTravel !== 'string' ||
      !player ||
      !Array.isArray(knots) ||
      !Number.isSafeInteger(player.activeContractId) ||
      promiseJourney?.contractId !== player.activeContractId ||
      promiseJourney?.version !== 1 ||
      activeRegion?.x !== 0 ||
      activeRegion?.y !== 0
    ) {
      database.close();
      return null;
    }
    const placementById = new Map([
      [1, ${SMOKE_TIDE_HARP.reedLocalTileIndex}],
      [3, ${SMOKE_TIDE_HARP.anchorLocalTileIndex}],
      [5, ${SMOKE_TIDE_HARP.windLocalTileIndex}],
    ]);
    player.wayknots.wayknots = knots.map((knot) => ({
      ...knot,
      region: placementById.has(knot.id) ? { x: 0, y: 0 } : null,
      tileIndex: placementById.has(knot.id) ? placementById.get(knot.id) : null,
    }));

    // Player coordinates are fixed-point tile units in the persisted format.
    const columns = player.worldWidth;
    const tileIndex = ${SMOKE_TIDE_HARP.fixturePlayerTileIndex};
    if (!Number.isSafeInteger(columns) || columns !== ${SMOKE_REGIONAL_COLUMNS}) {
      database.close();
      return null;
    }
    player.x = (tileIndex % columns) * 1_000 + 500;
    player.y = Math.floor(tileIndex / columns) * 1_000 + 500;
    player.previousX = player.x;
    player.previousY = player.y;
    player.velocityX = 0;
    player.velocityY = 0;
    player.mode = 'foot';
    player.pace = 'steady';
    player.stamina = 1_000_000;
    player.scanCharge = 1_000_000;
    player.sweepPath = [];
    player.sweepTicksRemaining = 0;
    player.sweepTotalTicks = 0;
    player.sweepSupport = null;
    player.currentTrace = [tileIndex];
    player.surveyTrace = [tileIndex];

    // Relocating the porter away from the live compatibility trace must also
    // update the current Promise-journey sidecar. A detour preserves contract
    // custody while explicitly refusing finite-route credit; leaving the old
    // trace in place is correctly rejected by the production loader.
    envelope.promiseJourney = {
      version: promiseJourney.version,
      contractId: player.activeContractId,
      detoured: true,
      compatibilityTrace: [],
    };
    envelope.perceptionCarry = {
      version: 1,
      playerStepsSinceWorldTick: 0,
      playerSenseSamples: [],
      nextPlayerSenseSampleOrdinal: 0,
    };

    // The v5 production loader seals the complete envelope. This smoke-only
    // persisted fixture deliberately changes player state, so reseal it with
    // the exact canonical encoder/hash used by the production runtime before
    // proving that the normal load path accepts it.
    const stableStringify = (value) => {
      if (value === null) return 'null';
      switch (typeof value) {
        case 'boolean': return value ? 'true' : 'false';
        case 'number':
          if (!Number.isFinite(value)) throw new TypeError('Cannot encode a non-finite number');
          if (Object.is(value, -0)) return '0';
          return JSON.stringify(value);
        case 'string': return JSON.stringify(value);
        case 'object': {
          if (Array.isArray(value)) {
            return '[' + value.map((entry) => stableStringify(entry)).join(',') + ']';
          }
          const keys = Object.keys(value).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
          return '{' + keys.map((key) => {
            if (value[key] === undefined) throw new TypeError('Cannot encode undefined at key ' + key);
            return JSON.stringify(key) + ':' + stableStringify(value[key]);
          }).join(',') + '}';
        }
        default: throw new TypeError('Cannot canonically encode ' + typeof value);
      }
    };
    const unsealed = { ...envelope };
    delete unsealed.integrity;
    const encoded = stableStringify(unsealed);
    let high = 0x811c9dc5;
    let low = 0x9e3779b9;
    for (let index = 0; index < encoded.length; index += 1) {
      const code = encoded.charCodeAt(index);
      high = Math.imul(high ^ code, 0x01000193) >>> 0;
      low = Math.imul(low ^ code, 0x85ebca6b) >>> 0;
      low ^= high >>> 13;
    }
    envelope.integrity = (high >>> 0).toString(16).padStart(8, '0')
      + (low >>> 0).toString(16).padStart(8, '0');

    record.worldJson = JSON.stringify(envelope);
    record.updatedAt = Math.max(Date.now(), Number(record.updatedAt || 0) + 1);
    const writeTransaction = database.transaction('saves', 'readwrite');
    writeTransaction.objectStore('saves').put(record);
    await new Promise((resolve, reject) => {
      writeTransaction.addEventListener('complete', resolve, { once: true });
      writeTransaction.addEventListener('abort', () => reject(writeTransaction.error), { once: true });
      writeTransaction.addEventListener('error', () => reject(writeTransaction.error), { once: true });
    });
    database.close();

    // Pagehide normally saves the live pre-fixture closure. Disable that one
    // smoke-page write so it cannot race and overwrite the verified record.
    runtime.save = async () => {};
    return {
      seed: record.seed,
      tiles: [...placementById.values()],
      playerTileIndex: tileIndex,
      saveVersion: envelope.version,
      gameplayContractVersion: ${SMOKE_EXPECTED_GAMEPLAY_CONTRACT_VERSION},
      activeRegion: { x: activeRegion.x, y: activeRegion.y },
      promiseJourney: { ...envelope.promiseJourney },
    };
  })()`, true);

  if (!fixture) throw new Error('the smoke-only Tide Harp save fixture could not be installed');
  await contents.loadURL(PRODUCTION_ENTRY_URL);
  await waitForRenderer(
    contents,
    (probe) =>
      probe.titleOpen === false &&
      probe.paused === false &&
      probe.worldName === SMOKE_WORLD_NAME &&
      probe.hasRuntime === true &&
      probe.uiReady === 'true',
    SMOKE_TEST.timeoutMs,
  );
  const openedResetGate = await contents.executeJavaScript(`(() => {
    const runtime = window.__TIDEWEFT__ && window.__TIDEWEFT__.runtime;
    if (!runtime || typeof runtime.dispatchUI !== 'function') return false;
    runtime.dispatchUI({ type: 'open-title' });
    return true;
  })()`, true);
  if (!openedResetGate) throw new Error('the auto-resumed fixture could not open its guarded title');
  await waitForRenderer(
    contents,
    (probe) =>
      probe.titleOpen === true &&
      probe.titleLayout?.restartFormVisible === true &&
      probe.titleLayout?.restartInputVisible === true &&
      probe.titleLayout?.formVisible === false,
    SMOKE_TEST.timeoutMs,
  );
  const wrongRestartDraft = await contents.executeJavaScript(`(async () => {
    const restartForm = document.querySelector('.restart-form');
    const restartInput = document.querySelector('#restart-phrase');
    const newWorldForm = document.querySelector('.new-world-form');
    if (!(restartForm instanceof HTMLFormElement) ||
        !(restartInput instanceof HTMLInputElement) ||
        !(newWorldForm instanceof HTMLFormElement)) return null;
    restartInput.value = 'restartrestart';
    restartInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    restartInput.focus();
    restartInput.blur();
    restartInput.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      value: restartInput.value,
      locked: newWorldForm.hidden === true,
      autocapitalize: restartInput.getAttribute('autocapitalize'),
      autocorrect: restartInput.getAttribute('autocorrect'),
      enterkeyhint: restartInput.getAttribute('enterkeyhint'),
    };
  })()`, true);
  if (wrongRestartDraft?.value !== 'restartrestart' ||
      wrongRestartDraft?.locked !== true ||
      wrongRestartDraft?.autocapitalize !== 'none' ||
      wrongRestartDraft?.autocorrect !== 'off' ||
      wrongRestartDraft?.enterkeyhint !== 'next') {
    throw new Error(`saved-world restart mobile draft failed: ${JSON.stringify(wrongRestartDraft)}`);
  }
  const wrongRestartSubmit = await contents.executeJavaScript(`(async () => {
    const restartForm = document.querySelector('.restart-form');
    const newWorldForm = document.querySelector('.new-world-form');
    if (!(restartForm instanceof HTMLFormElement) || !(newWorldForm instanceof HTMLFormElement)) return null;
    restartForm.requestSubmit();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return { locked: newWorldForm.hidden === true };
  })()`, true);
  if (wrongRestartSubmit?.locked !== true) {
    throw new Error(`saved-world wrong restart phrase unlocked: ${JSON.stringify(wrongRestartSubmit)}`);
  }
  const exactRestartCommit = await contents.executeJavaScript(`(async () => {
    const restartInput = document.querySelector('#restart-phrase');
    const newWorldForm = document.querySelector('.new-world-form');
    const seedInput = document.querySelector('#world-seed');
    if (!(restartInput instanceof HTMLInputElement) ||
        !(newWorldForm instanceof HTMLFormElement) ||
        !(seedInput instanceof HTMLInputElement)) return null;
    restartInput.value = 'restartrestartrestart';
    restartInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    restartInput.focus();
    restartInput.blur();
    restartInput.dispatchEvent(new Event('change', { bubbles: true }));
    // Deliberately cross UI animation frames before inspecting the later seed
    // step. The old smoke submitted in one task and could not reproduce the
    // phone blur/re-render race reported by playtesters.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      unlocked: newWorldForm.hidden === false,
      seedRequired: seedInput.required === true,
      seedFocused: document.activeElement === seedInput,
    };
  })()`, true);
  if (exactRestartCommit?.unlocked !== true ||
      exactRestartCommit?.seedRequired !== true ||
      exactRestartCommit?.seedFocused !== true) {
    throw new Error(`saved-world exact restart phrase failed: ${JSON.stringify(exactRestartCommit)}`);
  }
  const blankRestartSeed = await contents.executeJavaScript(`(async () => {
    const newWorldForm = document.querySelector('.new-world-form');
    const seedInput = document.querySelector('#world-seed');
    const title = document.querySelector('.title-dialog');
    const runtime = window.__TIDEWEFT__?.runtime;
    if (!(newWorldForm instanceof HTMLFormElement) ||
        !(seedInput instanceof HTMLInputElement)) return null;
    const worldBeforeBlank = runtime?.getRenderView?.()?.worldName;
    seedInput.value = '';
    seedInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    newWorldForm.requestSubmit();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const rejected =
      title instanceof HTMLDialogElement &&
      title.open === true &&
      newWorldForm.hidden === false &&
      runtime?.getRenderView?.()?.worldName === worldBeforeBlank;
    return { rejected, worldBeforeBlank, worldAfterBlank: runtime?.getRenderView?.()?.worldName };
  })()`, true);
  if (blankRestartSeed?.rejected !== true || blankRestartSeed?.worldAfterBlank !== SMOKE_WORLD_NAME) {
    throw new Error(`saved-world blank restart seed changed the world: ${JSON.stringify(blankRestartSeed)}`);
  }
  await contents.executeJavaScript(`(() => {
    const continued = document.querySelector('.continue-card');
    if (continued instanceof HTMLButtonElement && !continued.disabled) continued.click();
  })()`, true);
  await waitForRenderer(
    contents,
    (probe) => probe.titleOpen === false && probe.paused === false,
    SMOKE_TEST.timeoutMs,
  );
  return fixture;
}

/**
 * Installs one sealed v5 deep-water starting posture through the isolated
 * smoke autosave. The next ordinary movement beat must enter ADRIFT through
 * production footing rules; no gameplay debug surface is shipped for it.
 * The exact pre-probe record is returned so the smoke can restore it after
 * proving held input and release behavior.
 */
async function installSmokeAdriftFixture(contents) {
  const fixture = await contents.executeJavaScript(`(async () => {
    const runtime = window.__TIDEWEFT__?.runtime;
    const view = runtime?.getRenderView?.();
    if (!runtime?.save || !view?.terrain || !view?.player?.position) return null;
    await runtime.save();

    const openRequest = indexedDB.open('tideweft', 1);
    const database = await new Promise((resolve, reject) => {
      openRequest.addEventListener('success', () => resolve(openRequest.result), { once: true });
      openRequest.addEventListener('error', () => reject(openRequest.error), { once: true });
    });
    const readTransaction = database.transaction('saves', 'readonly');
    const getRequest = readTransaction.objectStore('saves').get('autosave');
    const record = await new Promise((resolve, reject) => {
      getRequest.addEventListener('success', () => resolve(getRequest.result), { once: true });
      getRequest.addEventListener('error', () => reject(getRequest.error), { once: true });
    });
    if (!record || typeof record.worldJson !== 'string') {
      database.close();
      return null;
    }

    const backup = JSON.parse(JSON.stringify(record));
    const envelope = JSON.parse(record.worldJson);
    const player = envelope?.player;
    const activeRegion = envelope?.physicalCargo?.activeRegion;
    const terrain = view.terrain;
    if (
      envelope?.format !== 'tideweft-session' ||
      envelope?.version !== 5 ||
      record.payloadVersion !== 5 ||
      typeof envelope.regionalTravel !== 'string' ||
      !player ||
      player.worldWidth !== terrain.columns ||
      player.worldHeight !== terrain.rows ||
      activeRegion?.x !== 0 ||
      activeRegion?.y !== 0
    ) {
      database.close();
      return null;
    }

    const occupied = new Set(
      view.settlements.map((settlement) =>
        Math.floor(settlement.position.y / terrain.tileSize) * terrain.columns +
        Math.floor(settlement.position.x / terrain.tileSize),
      ),
    );
    const playerX = Math.floor(view.player.position.x / terrain.tileSize);
    const playerY = Math.floor(view.player.position.y / terrain.tileSize);
    const deepNeighborCount = (index) => {
      const x = index % terrain.columns;
      const y = Math.floor(index / terrain.columns);
      return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
        .filter(([neighborX, neighborY]) =>
          neighborX >= 0 && neighborX < terrain.columns &&
          neighborY >= 0 && neighborY < terrain.rows &&
          (terrain.tiles[neighborY * terrain.columns + neighborX]?.waterDepth ?? 0) >= 0.18,
        ).length;
    };
    const candidates = terrain.tiles.flatMap((tile, index) => {
      const x = index % terrain.columns;
      const y = Math.floor(index / terrain.columns);
      if (
        !Number.isFinite(tile.waterDepth) ||
        tile.waterDepth < 0.24 ||
        x < 3 || x >= terrain.columns - 3 ||
        y < 3 || y >= terrain.rows - 3 ||
        occupied.has(index)
      ) return [];
      return [{
        index,
        x,
        y,
        depth: tile.waterDepth,
        deepNeighbors: deepNeighborCount(index),
        distance: Math.abs(x - playerX) + Math.abs(y - playerY),
      }];
    }).sort((left, right) =>
      right.deepNeighbors - left.deepNeighbors ||
      left.distance - right.distance ||
      left.index - right.index,
    );
    const candidate = candidates.find(({ deepNeighbors }) => deepNeighbors === 4) || candidates[0];
    if (!candidate) {
      database.close();
      return null;
    }

    player.x = candidate.x * 1_000 + 500;
    player.y = candidate.y * 1_000 + 500;
    player.previousX = player.x;
    player.previousY = player.y;
    player.velocityX = 0;
    player.velocityY = 0;
    player.mode = 'foot';
    player.pace = 'rest';
    // Keep one lawful movement beat available, but make that beat exhaust the
    // courier before tide progression can change this smoke-only deep-water
    // contact. The packaged test is about the production ADRIFT transition and
    // held/released paddle controls, not a multi-second endurance countdown.
    player.stamina = 13_000;
    player.stability = 0;
    player.stabilityTrend = 'falling';
    player.stabilityHint = 'Deep current · one movement beat tests ADRIFT recovery';
    player.sweepPath = [];
    player.sweepTicksRemaining = 0;
    player.sweepTotalTicks = 0;
    player.sweepSupport = null;
    player.currentTrace = [candidate.index];
    player.surveyTrace = [candidate.index];
    envelope.perceptionCarry = {
      version: 1,
      playerStepsSinceWorldTick: 0,
      playerSenseSamples: [],
      nextPlayerSenseSampleOrdinal: 0,
    };

    const stableStringify = (value) => {
      if (value === null) return 'null';
      switch (typeof value) {
        case 'boolean': return value ? 'true' : 'false';
        case 'number':
          if (!Number.isFinite(value)) throw new TypeError('Cannot encode a non-finite number');
          if (Object.is(value, -0)) return '0';
          return JSON.stringify(value);
        case 'string': return JSON.stringify(value);
        case 'object': {
          if (Array.isArray(value)) {
            return '[' + value.map((entry) => stableStringify(entry)).join(',') + ']';
          }
          const keys = Object.keys(value).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
          return '{' + keys.map((key) => {
            if (value[key] === undefined) throw new TypeError('Cannot encode undefined at key ' + key);
            return JSON.stringify(key) + ':' + stableStringify(value[key]);
          }).join(',') + '}';
        }
        default: throw new TypeError('Cannot canonically encode ' + typeof value);
      }
    };
    const unsealed = { ...envelope };
    delete unsealed.integrity;
    const encoded = stableStringify(unsealed);
    let high = 0x811c9dc5;
    let low = 0x9e3779b9;
    for (let index = 0; index < encoded.length; index += 1) {
      const code = encoded.charCodeAt(index);
      high = Math.imul(high ^ code, 0x01000193) >>> 0;
      low = Math.imul(low ^ code, 0x85ebca6b) >>> 0;
      low ^= high >>> 13;
    }
    envelope.integrity = (high >>> 0).toString(16).padStart(8, '0') +
      (low >>> 0).toString(16).padStart(8, '0');

    record.worldJson = JSON.stringify(envelope);
    record.updatedAt = Math.max(Date.now(), Number(record.updatedAt || 0) + 1);
    const writeTransaction = database.transaction('saves', 'readwrite');
    writeTransaction.objectStore('saves').put(record);
    await new Promise((resolve, reject) => {
      writeTransaction.addEventListener('complete', resolve, { once: true });
      writeTransaction.addEventListener('abort', () => reject(writeTransaction.error), { once: true });
      writeTransaction.addEventListener('error', () => reject(writeTransaction.error), { once: true });
    });
    database.close();

    runtime.save = async () => {};
    const backupEnvelope = JSON.parse(backup.worldJson);
    const backupPlayer = backupEnvelope.player;
    return {
      backup,
      tileIndex: candidate.index,
      depth: candidate.depth,
      deepNeighbors: candidate.deepNeighbors,
      stamina: player.stamina / 1_000_000,
      restore: {
        tileIndex: Math.floor(backupPlayer.y / 1_000) * backupPlayer.worldWidth +
          Math.floor(backupPlayer.x / 1_000),
        mode: backupPlayer.mode,
      },
    };
  })()`, true);

  if (!fixture?.backup) throw new Error('the smoke-only ADRIFT save fixture could not be installed');
  await contents.loadURL(PRODUCTION_ENTRY_URL);
  await waitForRenderer(
    contents,
    (probe) =>
      probe.titleOpen === false &&
      probe.paused === false &&
      probe.worldName === SMOKE_WORLD_NAME &&
      probe.playerMode === 'foot' &&
      probe.playerTileIndex === fixture.tileIndex &&
      probe.playerAdrift === null &&
      probe.uiAdrift === null &&
      probeHasActiveRenderer(probe, 'relief-3d'),
    SMOKE_TEST.timeoutMs,
  );
  return fixture;
}

function smokeAdriftEvidence(probe) {
  return {
    tick: probe?.tick ?? null,
    mode: probe?.playerMode ?? null,
    position: probe?.playerPosition ?? null,
    velocity: probe?.playerVelocity ?? null,
    stamina: probe?.playerStamina ?? null,
    render: probe?.playerAdrift ?? null,
    ui: probe?.uiAdrift ?? null,
    reliefLabel: probe?.reliefAdrift ?? null,
    interact: probe?.interact ?? null,
  };
}

async function verifySmokeAdrift(contents, fixture) {
  if (!await focusSmokePlayer(contents)) {
    throw new Error('the ADRIFT fixture could not focus the production courier');
  }
  const pressed = await contents.executeJavaScript(`(() => {
    const canvas = Array.from(document.querySelectorAll('#p5-mount canvas[data-renderer]'))
      .find((candidate) => !candidate.hidden && candidate.dataset.renderer === 'relief-3d');
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    canvas.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'w',
      code: 'KeyW',
      bubbles: true,
      cancelable: true,
    });
    return {
      consumed: canvas.dispatchEvent(event) === false,
      focused: document.activeElement === canvas,
    };
  })()`, true);
  if (pressed?.consumed !== true || pressed?.focused !== true) {
    throw new Error(`the packaged ADRIFT paddle key was not accepted: ${JSON.stringify(pressed)}`);
  }

  // The deliberately exhausted fixture enters ADRIFT before it has the reserve
  // for a useful stroke. Prove that state first, then release the held key and
  // let the production recovery loop build a small, real paddling reserve.
  const transition = await waitForRenderer(
    contents,
    (probe) =>
      probeHasActiveRenderer(probe, 'relief-3d') &&
      probe.playerMode === 'swept' &&
      probe.playerAdrift?.paddling === false &&
      probe.playerAdrift?.catchingBreath === true &&
      probe.uiAdrift?.paddling === false &&
      probe.uiAdrift?.catchingBreath === true &&
      probe.uiAdrift?.label === 'CATCHING BREATH' &&
      probe.uiAdrift?.instruction === 'FLOAT · LET STAMINA RETURN' &&
      probe.interact?.label === 'ADRIFT · paddle / float' &&
      probe.interact?.disabled === true &&
      probe.reliefAdrift?.visible === true &&
      probe.reliefAdrift?.insideViewport === true &&
      probe.reliefAdrift?.tone === 'adrift' &&
      probe.reliefAdrift?.selected === 'true' &&
      probe.reliefAdrift?.text === 'CATCHING BREATH · FLOAT · LET STAMINA RETURN',
    SMOKE_TEST.timeoutMs,
  );

  const recoveryRelease = await contents.executeJavaScript(`(() => {
    const canvas = Array.from(document.querySelectorAll('#p5-mount canvas[data-renderer]'))
      .find((candidate) => !candidate.hidden && candidate.dataset.renderer === 'relief-3d');
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const event = new KeyboardEvent('keyup', {
      key: 'w',
      code: 'KeyW',
      bubbles: true,
      cancelable: true,
    });
    const consumed = canvas.dispatchEvent(event) === false;
    return {
      consumed,
      staminaAtRelease: window.__TIDEWEFT__?.runtime?.getRenderView?.()?.player?.stamina ?? null,
    };
  })()`, true);
  if (recoveryRelease?.consumed !== true) {
    throw new Error(`the packaged ADRIFT recovery release was not accepted: ${JSON.stringify(recoveryRelease)}`);
  }

  const recovered = await waitForRenderer(
    contents,
    (probe) =>
      probeHasActiveRenderer(probe, 'relief-3d') &&
      probe.playerMode === 'swept' &&
      probe.playerStamina >= 0.04 &&
      probe.playerAdrift?.paddling === false &&
      probe.playerAdrift?.catchingBreath === true &&
      probe.uiAdrift?.paddling === false &&
      probe.uiAdrift?.catchingBreath === true &&
      probe.uiAdrift?.label === 'CATCHING BREATH' &&
      probe.uiAdrift?.instruction === 'FLOAT · LET STAMINA RETURN' &&
      Number.isFinite(recoveryRelease.staminaAtRelease) &&
      probe.playerStamina > recoveryRelease.staminaAtRelease &&
      probe.reliefAdrift?.visible === true &&
      probe.reliefAdrift?.insideViewport === true &&
      probe.reliefAdrift?.text === 'CATCHING BREATH · FLOAT · LET STAMINA RETURN',
    SMOKE_TEST.timeoutMs,
  );

  const paddlePressed = await contents.executeJavaScript(`(() => {
    const canvas = Array.from(document.querySelectorAll('#p5-mount canvas[data-renderer]'))
      .find((candidate) => !candidate.hidden && candidate.dataset.renderer === 'relief-3d');
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    canvas.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'w',
      code: 'KeyW',
      bubbles: true,
      cancelable: true,
    });
    return {
      consumed: canvas.dispatchEvent(event) === false,
      focused: document.activeElement === canvas,
    };
  })()`, true);
  if (paddlePressed?.consumed !== true || paddlePressed?.focused !== true) {
    throw new Error(`the packaged ADRIFT recovered paddle key was not accepted: ${JSON.stringify(paddlePressed)}`);
  }

  const paddling = await waitForRenderer(
    contents,
    (probe) =>
      probeHasActiveRenderer(probe, 'relief-3d') &&
      probe.playerMode === 'swept' &&
      probe.playerStamina < recovered.playerStamina &&
      probe.playerAdrift?.paddling === true &&
      probe.playerAdrift?.catchingBreath === false &&
      probe.uiAdrift?.paddling === true &&
      probe.uiAdrift?.catchingBreath === false &&
      probe.uiAdrift?.label === 'PADDLING' &&
      probe.uiAdrift?.instruction === 'PADDLE TOWARD SHALLOW WATER' &&
      probe.interact?.label === 'ADRIFT · paddle / float' &&
      probe.interact?.disabled === true &&
      probe.reliefAdrift?.visible === true &&
      probe.reliefAdrift?.insideViewport === true &&
      probe.reliefAdrift?.tone === 'adrift' &&
      probe.reliefAdrift?.selected === 'true' &&
      probe.reliefAdrift?.text === 'PADDLING · PADDLE TOWARD SHALLOW WATER',
    SMOKE_TEST.timeoutMs,
  );

  const released = await contents.executeJavaScript(`(() => {
    const canvas = Array.from(document.querySelectorAll('#p5-mount canvas[data-renderer]'))
      .find((candidate) => !candidate.hidden && candidate.dataset.renderer === 'relief-3d');
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const event = new KeyboardEvent('keyup', {
      key: 'w',
      code: 'KeyW',
      bubbles: true,
      cancelable: true,
    });
    const consumed = canvas.dispatchEvent(event) === false;
    return {
      consumed,
      staminaAtRelease: window.__TIDEWEFT__?.runtime?.getRenderView?.()?.player?.stamina ?? null,
    };
  })()`, true);
  if (released?.consumed !== true) {
    throw new Error(`the packaged ADRIFT paddle release was not accepted: ${JSON.stringify(released)}`);
  }

  const floating = await waitForRenderer(
    contents,
    (probe) =>
      probeHasActiveRenderer(probe, 'relief-3d') &&
      probe.playerMode === 'swept' &&
      probe.playerAdrift?.paddling === false &&
      probe.playerAdrift?.catchingBreath === true &&
      probe.uiAdrift?.paddling === false &&
      probe.uiAdrift?.catchingBreath === true &&
      probe.uiAdrift?.label === 'CATCHING BREATH' &&
      probe.uiAdrift?.instruction === 'FLOAT · LET STAMINA RETURN' &&
      Number.isFinite(released.staminaAtRelease) &&
      probe.playerStamina > released.staminaAtRelease &&
      probe.reliefAdrift?.visible === true &&
      probe.reliefAdrift?.insideViewport === true &&
      probe.reliefAdrift?.text === 'CATCHING BREATH · FLOAT · LET STAMINA RETURN',
    SMOKE_TEST.timeoutMs,
  );

  return {
    input: { pressed, recoveryRelease, paddlePressed, released },
    transition: smokeAdriftEvidence(transition),
    recovered: smokeAdriftEvidence(recovered),
    paddling: smokeAdriftEvidence(paddling),
    floating: smokeAdriftEvidence(floating),
  };
}

async function restoreSmokeAdriftFixture(contents, fixture) {
  const encodedBackup = Buffer.from(JSON.stringify(fixture.backup), 'utf8').toString('base64');
  const written = await contents.executeJavaScript(`(async () => {
    const runtime = window.__TIDEWEFT__?.runtime;
    if (!runtime) return null;
    runtime.dispatchRenderer?.({ type: 'movement', vector: { x: 0, y: 0 } });
    runtime.save = async () => {};
    const bytes = Uint8Array.from(atob('${encodedBackup}'), (character) => character.charCodeAt(0));
    const record = JSON.parse(new TextDecoder().decode(bytes));
    record.updatedAt = Math.max(Date.now(), Number(record.updatedAt || 0) + 1);
    const openRequest = indexedDB.open('tideweft', 1);
    const database = await new Promise((resolve, reject) => {
      openRequest.addEventListener('success', () => resolve(openRequest.result), { once: true });
      openRequest.addEventListener('error', () => reject(openRequest.error), { once: true });
    });
    const transaction = database.transaction('saves', 'readwrite');
    transaction.objectStore('saves').put(record);
    await new Promise((resolve, reject) => {
      transaction.addEventListener('complete', resolve, { once: true });
      transaction.addEventListener('abort', () => reject(transaction.error), { once: true });
      transaction.addEventListener('error', () => reject(transaction.error), { once: true });
    });
    database.close();
    return { payloadVersion: record.payloadVersion, seed: record.seed };
  })()`, true);
  if (written?.payloadVersion !== 5 || written?.seed !== SMOKE_WORLD_SEED) {
    throw new Error(`the ADRIFT smoke fixture backup was not restored: ${JSON.stringify(written)}`);
  }

  await contents.loadURL(PRODUCTION_ENTRY_URL);
  const restored = await waitForRenderer(
    contents,
    (probe) =>
      probe.titleOpen === false &&
      probe.paused === false &&
      probe.worldName === SMOKE_WORLD_NAME &&
      probe.playerMode === fixture.restore.mode &&
      probe.playerTileIndex === fixture.restore.tileIndex &&
      probe.playerAdrift === null &&
      probe.uiAdrift === null &&
      probe.reliefAdrift === null &&
      probeHasPlayableTideHarp(probe) &&
      probeHasActiveRenderer(probe, 'relief-3d'),
    SMOKE_TEST.timeoutMs,
  );
  return smokeAdriftEvidence(restored);
}

function probeHasPlayableTideHarp(probe) {
  const projected = probe?.tideHarps?.projected;
  const harp = Array.isArray(projected)
    ? projected.find((candidate) => candidate.id === SMOKE_TIDE_HARP.id)
    : null;
  if (
    !harp ||
    harp.label !== SMOKE_TIDE_HARP.label ||
    harp.active !== true ||
    !Array.isArray(harp.knots) ||
    harp.knots.length !== 3 ||
    !Array.isArray(harp.edges) ||
    harp.edges.length !== 3
  ) return false;
  const expectedKnots = [
    `reed-mat:${SMOKE_TIDE_HARP.reedTileIndex}`,
    `tide-anchor:${SMOKE_TIDE_HARP.anchorTileIndex}`,
    `wind-knot:${SMOKE_TIDE_HARP.windTileIndex}`,
  ];
  const knots = harp.knots.map((knot) => `${knot.kind}:${knot.tileIndex}`);
  const edgePairs = new Set(harp.edges.map((edge) =>
    [String(edge.fromId), String(edge.toId)].sort().join('-'),
  ));
  const reliefLabel = probe.tideHarps.reliefLabels?.find(
    (label) => label.text === SMOKE_TIDE_HARP.label,
  );
  return expectedKnots.every((expected) => knots.includes(expected)) &&
    edgePairs.size === 3 &&
    ['1-3', '1-5', '3-5'].every((pair) => edgePairs.has(pair)) &&
    probe.tideHarps.projectedCount === 1 &&
    probe.tideHarps.tunedCount === 1 &&
    probe.tideHarps.activeId === SMOKE_TIDE_HARP.id &&
    probe.tideHarps.activeLabel === SMOKE_TIDE_HARP.label &&
    probe.tideHarps.benefitLabel === '+900 Loom/tick · Space sounds radius 6 from all 3 knots' &&
    probe.tideHarps.countText === 'TIDE HARPS · 1 tuned' &&
    probe.tideHarps.activeText ===
      `${SMOKE_TIDE_HARP.label} active · +900 Loom/tick · Space sounds radius 6 from all 3 knots` &&
    probe.tideHarps.dataActive === 'true' &&
    probe.tideHarps.dataHarpId === SMOKE_TIDE_HARP.id &&
    probe.tideHarps.ariaLabel?.includes('1 Tide Harp tuned') &&
    probe.tideHarps.activeGeometry?.clientWidth > 0 &&
    probe.tideHarps.activeGeometry?.clientHeight > 0 &&
    probe.tideHarps.activeGeometry.scrollWidth <= probe.tideHarps.activeGeometry.clientWidth + 1 &&
    probe.tideHarps.activeGeometry.scrollHeight <= probe.tideHarps.activeGeometry.clientHeight + 1 &&
    probe.tideHarps.reliefLayerHidden === false &&
    reliefLabel?.hidden === false &&
    reliefLabel.tone === 'wayknot' &&
    reliefLabel.selected === 'true' &&
    probeHasActiveRenderer(probe, 'relief-3d');
}

async function verifySmokeTideHarp(contents) {
  const tuned = await waitForRenderer(
    contents,
    (probe) =>
      probe.titleOpen === false &&
      probe.playerTileIndex === SMOKE_TIDE_HARP.reedTileIndex &&
      probe.activeContractCount === 1 &&
      probe.playerCargoLoad > 0 &&
      probe.playerDestinationLabel?.startsWith('DELIVER') &&
      probe.scan?.disabled === false &&
      probe.tideHarps?.remoteEcho?.tileIndex === SMOKE_TIDE_HARP.remoteEchoTileIndex &&
      probe.tideHarps.remoteEcho.discovered === 0 &&
      probe.tideHarps.remoteEcho.depthKnown === 0 &&
      probeHasPlayableTideHarp(probe),
    SMOKE_TEST.timeoutMs,
  );
  const announcementId = tuned.announcement?.id ?? 0;
  const clicked = await contents.executeJavaScript(`(() => {
    const button = document.querySelector('.action-button--scan');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`, true);
  if (!clicked) throw new Error('the active Tide Harp could not pulse the real Scan control');
  const expectedEcho = `${SMOKE_TIDE_HARP.label} answered the Loom. One pulse sounded from your position and from its three knot origins: Reed mat #1, Tide anchor #3, and Wind knot #5. Each origin recorded nearby terrain and water depth.`;
  const echoed = await waitForRenderer(
    contents,
    (probe) =>
      probeHasPlayableTideHarp(probe) &&
      (probe.announcement?.id ?? 0) > announcementId &&
      probe.announcement?.message === expectedEcho &&
      probe.tideHarps?.remoteEcho?.tileIndex === SMOKE_TIDE_HARP.remoteEchoTileIndex &&
      probe.tideHarps.remoteEcho.discovered > 0 &&
      probe.tideHarps.remoteEcho.depthKnown > 0,
    SMOKE_TEST.timeoutMs,
  );
  return { tuned, echoed, expectedEcho };
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
  ) && probeHasWorldCompass(probe, expectedRenderer);
}

function probeHasWorldCompass(probe, expectedMode) {
  const compass = probe?.compass;
  const angle = Number.parseFloat(compass?.angle || '');
  return Boolean(
    compass &&
    compass.visible === true &&
    compass.insideViewport === true &&
    compass.pointerEvents === 'none' &&
    compass.viewMode === expectedMode &&
    compass.role === 'img' &&
    compass.north === 'N' &&
    compass.arrow === '↑' &&
    compass.ariaLabel?.toLowerCase().includes('north') &&
    Number.isFinite(angle) &&
    (expectedMode !== 'chart-2d' || Math.abs(angle) < 0.001),
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

function probeHasSurfaceCurrent(probe) {
  const current = probe?.surfaceCurrent;
  return Boolean(
    current &&
    (current.x === -1_000_000 || current.x === 1_000_000) &&
    Number.isFinite(current.y) &&
    Math.abs(current.y) <= 1_000_000,
  );
}

function probeHasPointerTransparentObjective(probe) {
  return Boolean(
    probe?.layout?.leftRailPointerEvents === 'none' &&
    probe.layout.objectivePointerEvents === 'none' &&
    probe.layout.contractPointerEvents === 'auto',
  );
}

function probeHasDesktopFieldTruth(probe) {
  const field = probe?.desktopField;
  return Boolean(
    probe?.mobileHud?.breakpointActive === false &&
    field?.visible === true &&
    field.insideViewport === true &&
    field.pointerEvents === 'none' &&
    /^(?:WATER|GROUND) · /u.test(field.terrain || '') &&
    field.terrain.split(' · ').length >= 4 &&
    field.safety?.includes('STAB') &&
    /^E\s*[+-]?\d+\s*·\s*N\s*[+-]?\d+\s*·\s*\d+\s+FPS$/u.test(field.navigation || '') &&
    !/REGION|LOCAL|GLOBAL/u.test(field.navigation || '')
  );
}

function probeHasMobileHudFrame(probe) {
  const mobile = probe?.mobileHud;
  const toggle = mobile?.toggle;
  const vitals = mobile?.compactCopy?.vitals;
  const tutorial = probe?.tutorial?.button;
  const kit = probe?.kit?.trigger;
  return Boolean(
    mobile?.breakpointActive === true &&
    probe?.desktopField?.visible === false &&
    mobile.strip?.visible === true &&
    mobile.strip?.insideViewport === true &&
    mobile.strip?.overflowX === false &&
    mobile.strip?.pointerEvents === 'none' &&
    mobile.compactCopy?.visible === true &&
    mobile.compactCopy.objective?.includes('DELIVER') &&
    mobile.compactCopy.safety?.includes('STAM') &&
    mobile.compactCopy.safety?.includes('STAB') &&
    mobile.compactCopy.safety?.includes('DEEP: STAM/STAB 0 → ADRIFT') &&
    /^(?:WATER|GROUND) · /u.test(mobile.compactCopy.terrain || '') &&
    mobile.compactCopy.terrain.split(' · ').length >= 4 &&
    /^E[+-]?\d+\s*·\s*N[+-]?\d+\s*·\s*\d+\s+FPS$/u.test(mobile.compactCopy.navigation || '') &&
    !/REGION|LOCAL|GLOBAL/u.test(mobile.compactCopy.navigation || '') &&
    Array.isArray(vitals) &&
    vitals.length === 4 &&
    vitals.map((vital) => vital.label).join(',') === 'STAM,STAB,LOOM,CARGO' &&
    vitals.every((vital) =>
      vital.visible === true &&
      vital.insideViewport === true &&
      vital.labelVisible === true &&
      typeof vital.value === 'string' &&
      vital.value.length > 0 &&
      vital.progress &&
      Number.isFinite(vital.progress.value) &&
      Number.isFinite(vital.progress.max) &&
      vital.progress.max > 0 &&
      vital.progress.value >= 0 &&
      vital.progress.value <= vital.progress.max &&
      typeof vital.progress.ariaLabel === 'string' &&
      vital.progress.ariaLabel.length > 0
    ) &&
    tutorial?.visible === true &&
    tutorial.insideViewport === true &&
    tutorial.rect?.width >= 44 &&
    tutorial.rect?.height >= 44 &&
    tutorial.visibleText === '?' &&
    tutorial.ariaLabel?.toLowerCase().includes('tutorial') &&
    tutorial.ariaKeyShortcuts === 'T' &&
    kit?.visible === true &&
    kit.insideViewport === true &&
    kit.rect?.width >= 44 &&
    kit.rect?.height >= 44 &&
    kit.text === 'KIT' &&
    kit.disabled === false &&
    kit.ariaControls === 'tideweft-kit' &&
    kit.ariaHasPopup === 'dialog' &&
    kit.ariaKeyShortcuts === 'I' &&
    kit.pointerEvents === 'auto' &&
    mobile.titleMenuButton?.visible === false &&
    mobile.titleMenuButton?.display === 'none' &&
    mobile.quietHourButton?.visible === true &&
    mobile.quietHourButton.insideViewport === true &&
    mobile.quietHourButton.rect?.width >= 44 &&
    mobile.quietHourButton.rect?.height >= 44 &&
    mobile.quietHourButton.visibleText === '☾' &&
    mobile.quietHourButton.ariaLabel?.includes('Quiet Hour') &&
    toggle?.visible === true &&
    toggle.insideViewport === true &&
    toggle.rect?.width >= 44 &&
    toggle.rect?.height >= 44 &&
    (toggle.ariaControls === 'promises-panel' || toggle.ariaControls === 'settlement-inspector') &&
    toggle.disabled === false &&
    toggle.pointerEvents === 'auto' &&
    mobile.actionDock?.visible === true &&
    mobile.actionDock.insideViewport === true &&
    mobile.actionDock.controlsInsideViewport === true &&
    mobile.actionDock.coreControlsVisibleAndInside === true &&
    mobile.actionDock.brace?.visible === true &&
    mobile.actionDock.brace.insideViewport === true &&
    mobile.actionDock.brace.rect?.width >= 44 &&
    mobile.actionDock.brace.rect?.height >= 44 &&
    mobile.actionDock.brace.text === 'BRACE' &&
    mobile.actionDock.brace.ariaPressed === 'false' &&
    mobile.actionDock.brace.ariaLabel?.includes('Hold to brace') &&
    mobile.actionDock.labelsInsideControls === true &&
    mobile.actionDock.overflowX === false &&
    probeHasSurfaceCurrent(probe),
  );
}

function probeHasOpenMobileTutorial(probe) {
  const tutorial = probe?.tutorial;
  return Boolean(
    probeHasMobileHudFrame(probe) &&
    probe?.paused === false &&
    tutorial?.open === true &&
    tutorial.audience === 'mobile' &&
    typeof tutorial.pageId === 'string' &&
    tutorial.pageId.length > 0 &&
    tutorial.dialog?.visible === true &&
    tutorial.dialog.insideViewport === true &&
    tutorial.content?.visible === true &&
    tutorial.content.insideViewport === true &&
    tutorial.topics?.visible === true &&
    tutorial.topics.insideViewport === true &&
    (tutorial.topics.overflowX === 'auto' || tutorial.topics.overflowX === 'scroll') &&
    tutorial.page?.visible === true &&
    tutorial.page.insideViewport === true &&
    tutorial.page.clientHeight >= 96 &&
    tutorial.page.scrollHeight >= tutorial.page.clientHeight &&
    (tutorial.page.overflowY === 'auto' || tutorial.page.overflowY === 'scroll') &&
    Array.isArray(tutorial.controls) &&
    tutorial.controls.length === 3 &&
    tutorial.controls.every((control) =>
      control.visible === true &&
      control.insideViewport === true &&
      control.rect?.width >= 44 &&
      control.rect?.height >= 44
    )
  );
}

function probeHasOpenMobileKit(probe, expectedTab = 'pack') {
  const kit = probe?.kit;
  const tabs = kit?.tabs;
  const selectedTabId = `kit-tab-${expectedTab}`;
  return Boolean(
    probeHasMobileHudFrame(probe) &&
    probe?.paused === false &&
    probe?.tutorial?.open === false &&
    kit?.open === true &&
    kit.modal === true &&
    kit.tab === expectedTab &&
    kit.pausesWorld === 'false' &&
    kit.trigger?.ariaExpanded === 'true' &&
    kit.dialog?.visible === true &&
    kit.dialog.insideViewport === true &&
    kit.content?.visible === true &&
    kit.content.insideViewport === true &&
    kit.header?.visible === true &&
    kit.header.insideViewport === true &&
    kit.close?.visible === true &&
    kit.close.insideViewport === true &&
    kit.close.rect?.width >= 44 &&
    kit.close.rect?.height >= 44 &&
    kit.close.disabled === false &&
    kit.close.ariaLabel?.includes('return to play') &&
    kit.load?.visible === true &&
    kit.load.insideViewport === true &&
    kit.load.label === 'COMBINED LOAD' &&
    /^\d+\.\d{3} load \/ \d+\.\d{3} load$/u.test(kit.load.value || '') &&
    kit.load.valueVisible === true &&
    kit.load.progress?.visible === true &&
    kit.load.progress.insideViewport === true &&
    Number.isFinite(kit.load.progress.value) &&
    kit.load.progress.max === 1 &&
    kit.load.progress.value >= 0 &&
    kit.load.progress.value <= kit.load.progress.max &&
    kit.load.progress.ariaLabel === 'Combined pack load' &&
    kit.load.progress.ariaValueText?.includes('combined capacity') &&
    Array.isArray(tabs) &&
    tabs.length === 3 &&
    tabs.map((tab) => tab.text).join(',') === 'PACK,MAKE,MEND' &&
    tabs.every((tab) =>
      tab.visible === true &&
      tab.insideViewport === true &&
      tab.rect?.width >= 44 &&
      tab.rect?.height >= 44 &&
      tab.disabled === false &&
      tab.role === 'tab' &&
      tab.controls === 'tideweft-kit-panel'
    ) &&
    tabs.filter((tab) => tab.selected === 'true').length === 1 &&
    tabs.some((tab) => tab.id === selectedTabId && tab.selected === 'true') &&
    kit.panel?.visible === true &&
    kit.panel.insideViewport === true &&
    kit.panel.role === 'tabpanel' &&
    kit.panel.labelledBy === selectedTabId &&
    kit.scroll?.visible === true &&
    kit.scroll.insideViewport === true &&
    kit.scroll.tabIndex === 0 &&
    kit.scroll.ariaLabel?.startsWith(expectedTab.toUpperCase()) &&
    kit.scroll.clientHeight >= 96 &&
    kit.scroll.scrollHeight >= kit.scroll.clientHeight &&
    (kit.scroll.overflowY === 'auto' || kit.scroll.overflowY === 'scroll') &&
    kit.fixedChromeSeparated === true &&
    probe.mobileHud?.expanded === 'false'
  );
}

function probeHasOpenMobileMakeKit(probe, requireScrolled = false) {
  const kit = probe?.kit;
  return Boolean(
    probeHasOpenMobileKit(probe, 'make') &&
    kit?.recipeCount > 0 &&
    kit.recipeActionCount === kit.recipeCount &&
    kit.blockedRecipeCount > 0 &&
    kit.blockedReasonCount === kit.blockedRecipeCount &&
    kit.recipeActionsAtLeast44 === true &&
    kit.recipeActionsWithinScrollWidth === true &&
    kit.blockedReasonsRendered === true &&
    kit.disabledActionsHaveReasons === true &&
    kit.scroll?.hasVerticalOverflow === true &&
    kit.scroll.maxScrollTop > 0 &&
    (!requireScrolled || (
      kit.scroll.scrollTop > 0 &&
      kit.visibleRecipeActionCount > 0 &&
      kit.visibleBlockedReasonCount > 0
    ))
  );
}

function probeHasClosedMobileKit(probe) {
  return Boolean(
    probeHasCollapsedMobileHud(probe) &&
    probe?.paused === false &&
    probe?.tutorial?.open === false &&
    probe?.kit?.open === false &&
    probe.kit.trigger?.ariaExpanded === 'false' &&
    probe.kit.activeElementIsTrigger === true
  );
}

function probeHasCollapsedMobileHud(probe) {
  const mobile = probe?.mobileHud;
  return Boolean(
    probeHasMobileHudFrame(probe) &&
    mobile.expanded === 'false' &&
    mobile.sheet === 'promises' &&
    mobile.toggle?.ariaExpanded === 'false' &&
    mobile.toggle?.ariaLabel === 'Open promises' &&
    mobile.toggle?.text === 'PROMISES +' &&
    mobile.objective?.visible === false &&
    mobile.promises?.visible === false &&
    mobile.inspector?.visible === false,
  );
}

function probeHasLandscapeMobileFrame(probe) {
  const mobile = probe?.mobileHud;
  return Boolean(
    probeHasMobileHudFrame(probe) &&
    mobile.portraitBreakpointActive === false &&
    mobile.shortLandscapeBreakpointActive === true &&
    mobile.desktopHud?.visible === false &&
    mobile.desktopHud.display === 'none' &&
    probe.layout?.leftRailDisplay === 'contents',
  );
}

function probeHasExpandedMobileHud(probe) {
  const mobile = probe?.mobileHud;
  return Boolean(
    probeHasMobileHudFrame(probe) &&
    mobile.expanded === 'true' &&
    mobile.sheet === 'promises' &&
    mobile.toggle?.ariaExpanded === 'true' &&
    mobile.toggle?.ariaLabel === 'Close promises' &&
    mobile.toggle?.text === 'PROMISES −' &&
    mobile.objective?.visible === false &&
    mobile.objective.pointerEvents === 'none' &&
    mobile.promises?.visible === true &&
    mobile.promises.insideViewport === true &&
    mobile.promises.pointerEvents === 'auto' &&
    mobile.promises.overlapsStrip === false &&
    mobile.promises.overlapsActionDock === false &&
    mobile.promises.rect?.top >= mobile.strip.rect?.bottom - 1 &&
    mobile.promises.rect?.bottom <= mobile.actionDock.rect?.top + 1 &&
    mobile.inspector?.visible === false &&
    probe.layout?.leftPaneOverlap === false &&
    probeHasPointerTransparentObjective(probe) &&
    probe.leftPaneGap >= 0 &&
    probe.promises?.railOpen === true &&
    probe.promises.railVisible === true &&
    probe.promises.railInsideViewport === true &&
    probe.promises.summaryVisible === true &&
    probe.promises.listVisible === true &&
    probe.promises.listInsideViewport === true &&
    probe.promises.listTabIndex === 0 &&
    probe.promises.actionTargetCount > 0 &&
    probe.promises.actionTargetsAtLeast44 === true &&
    probe.promises.clientHeight >= 96 &&
    probe.promises.hasVerticalOverflow === true &&
    (probe.promises.overflowY === 'auto' || probe.promises.overflowY === 'scroll'),
  );
}

function probeHasExpandedMobileInspector(probe) {
  const mobile = probe?.mobileHud;
  return Boolean(
    probeHasMobileHudFrame(probe) &&
    mobile.expanded === 'true' &&
    mobile.sheet === 'inspector' &&
    mobile.toggle?.ariaExpanded === 'true' &&
    mobile.toggle?.ariaControls === 'settlement-inspector' &&
    mobile.toggle?.ariaLabel === 'Close settlement details' &&
    mobile.toggle?.text === 'CLOSE ×' &&
    mobile.objective?.visible === false &&
    mobile.promises?.visible === false &&
    mobile.inspector?.visible === true &&
    mobile.inspector.insideViewport === true &&
    mobile.inspector.hidden === false &&
    mobile.inspector.pointerEvents === 'auto' &&
    mobile.inspector.overlapsStrip === false &&
    mobile.inspector.overlapsActionDock === false &&
    mobile.inspector.rect?.top >= mobile.strip.rect?.bottom - 1 &&
    mobile.inspector.rect?.bottom <= mobile.actionDock.rect?.top + 1 &&
    mobile.inspector.clientHeight >= 96 &&
    mobile.inspector.scrollHeight >= mobile.inspector.clientHeight &&
    mobile.inspector.reportTargetCount > 0 &&
    mobile.inspector.reportTargetsAtLeast44 === true &&
    (mobile.inspector.overflowY === 'auto' || mobile.inspector.overflowY === 'scroll') &&
    probeHasPointerTransparentObjective(probe)
  );
}

async function toggleSmokeMobileHud(contents, expanded) {
  const clicked = await contents.executeJavaScript(`(() => {
    const button = document.querySelector('.mobile-field-toggle');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`, true);
  if (!clicked) throw new Error(`mobile HUD toggle was unavailable while setting expanded=${String(expanded)}`);
  return waitForRenderer(
    contents,
    expanded ? probeHasExpandedMobileHud : probeHasCollapsedMobileHud,
    SMOKE_TEST.timeoutMs,
  );
}

async function openSmokeMobileInspector(contents) {
  const opened = await contents.executeJavaScript(`(() => {
    const runtime = window.__TIDEWEFT__?.runtime;
    const settlement = runtime?.getRenderView?.()?.settlements?.find(
      (candidate) => candidate?.currentVisibility === 1,
    );
    if (!runtime?.dispatchUI || !settlement?.id) return false;
    runtime.dispatchUI({
      type: 'settlement',
      action: 'focus',
      settlementId: String(settlement.id),
    });
    return true;
  })()`, true);
  if (!opened) throw new Error('a settlement could not be opened through the public mobile UI command path');
  return waitForRenderer(contents, probeHasExpandedMobileInspector, SMOKE_TEST.timeoutMs);
}

async function openSmokeTutorial(contents) {
  const clicked = await contents.executeJavaScript(`(() => {
    const button = document.querySelector('.tutorial-button');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`, true);
  if (!clicked) throw new Error('the complete tutorial button was unavailable on mobile');
  return waitForRenderer(contents, probeHasOpenMobileTutorial, SMOKE_TEST.timeoutMs);
}

async function advanceSmokeTutorial(contents, previousPageId) {
  const clicked = await contents.executeJavaScript(`(() => {
    const button = document.querySelector('[data-tutorial-action="next"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`, true);
  if (!clicked) throw new Error('the mobile tutorial next control was unavailable');
  return waitForRenderer(
    contents,
    (probe) => probeHasOpenMobileTutorial(probe) && probe.tutorial.pageId !== previousPageId,
    SMOKE_TEST.timeoutMs,
  );
}

async function verifySmokeTutorialPatchNotes(contents) {
  const ready = await waitForRenderer(
    contents,
    (probe) =>
      probeHasOpenMobileTutorial(probe) &&
      probe.tutorial.pageId === 'whats-new' &&
      probe.tutorial.pageAction?.visible === true &&
      probe.tutorial.pageAction.insideViewport === true &&
      probe.tutorial.pageAction.rect?.width >= 44 &&
      probe.tutorial.pageAction.rect?.height >= 44 &&
      probe.tutorial.pageAction.text === 'OPEN PATCH NOTES' &&
      probe.tutorial.pageAction.ariaControls === 'tideweft-patch-notes' &&
      probe.tutorial.pageAction.ariaHasPopup === 'dialog',
    SMOKE_TEST.timeoutMs,
  );
  const opened = await contents.executeJavaScript(`(() => {
    const button = document.querySelector('[data-tutorial-action="open-patch-notes"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`, true);
  if (!opened) throw new Error("the field manual's What's New Patch Notes action was unavailable");
  const notes = await waitForRenderer(
    contents,
    (probe) => probe.tutorial?.open === false && probeHasOpenPatchNotes(probe, 'tutorial'),
    SMOKE_TEST.timeoutMs,
  );
  const closed = await contents.executeJavaScript(`(() => {
    const button = document.querySelector('[data-patch-action="close"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`, true);
  if (!closed) throw new Error("the field manual's Patch Notes dialog could not close");
  const returned = await waitForRenderer(
    contents,
    (probe) =>
      probeHasOpenMobileTutorial(probe) &&
      probe.tutorial.pageId === 'whats-new' &&
      probe.patchNotes?.open === false &&
      probe.tutorial.pageAction?.focused === true,
    SMOKE_TEST.timeoutMs,
  );
  return { ready, notes, returned };
}

async function closeSmokeTutorialWithKeyboard(contents) {
  const dispatched = await contents.executeJavaScript(`(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 't',
      code: 'KeyT',
      bubbles: true,
      cancelable: true,
    }));
    return true;
  })()`, true);
  if (!dispatched) throw new Error('the tutorial keyboard shortcut could not be dispatched');
  return waitForRenderer(
    contents,
    (probe) => probe?.tutorial?.open === false && probe?.paused === false,
    SMOKE_TEST.timeoutMs,
  );
}

async function openSmokeMobileKit(contents, previousTick) {
  const clicked = await contents.executeJavaScript(`(() => {
    const button = document.querySelector('.mobile-kit-button');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`, true);
  if (!clicked) throw new Error('the compact mobile KIT trigger was unavailable');
  return waitForRenderer(
    contents,
    (probe) => probeHasOpenMobileKit(probe, 'pack') && probe.tick > previousTick,
    SMOKE_TEST.timeoutMs,
  );
}

async function switchSmokeMobileKitToMake(contents) {
  const clicked = await contents.executeJavaScript(`(() => {
    const button = document.querySelector('[data-kit-tab="make"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`, true);
  if (!clicked) throw new Error('the mobile KIT MAKE tab was unavailable');
  return waitForRenderer(contents, probeHasOpenMobileMakeKit, SMOKE_TEST.timeoutMs);
}

async function scrollSmokeMobileMakeKit(contents) {
  const scrolled = await contents.executeJavaScript(`(() => {
    const scroll = document.querySelector('.kit-panel__scroll');
    if (!(scroll instanceof HTMLElement)) return false;
    const maximum = scroll.scrollHeight - scroll.clientHeight;
    if (maximum <= 1) return false;
    scroll.scrollTop = maximum;
    scroll.dispatchEvent(new Event('scroll', { bubbles: true }));
    return scroll.scrollTop > 0;
  })()`, true);
  if (!scrolled) throw new Error('the mobile KIT MAKE panel did not accept independent scrolling');
  return waitForRenderer(
    contents,
    (probe) => probeHasOpenMobileMakeKit(probe, true),
    SMOKE_TEST.timeoutMs,
  );
}

async function closeSmokeMobileKit(contents) {
  const clicked = await contents.executeJavaScript(`(() => {
    const button = document.querySelector('[data-kit-action="close"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`, true);
  if (!clicked) throw new Error('the mobile KIT close control was unavailable');
  return waitForRenderer(contents, probeHasClosedMobileKit, SMOKE_TEST.timeoutMs);
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

async function rotateSmokeReliefWithKey(contents) {
  const before = await readRendererProbe(contents);
  if (!probeHasWorldCompass(before, 'relief-3d')) {
    throw new Error(`Relief compass was not ready before J/L rotation: ${JSON.stringify(before?.compass)}`);
  }
  const beforeAngle = Number.parseFloat(before.compass.angle);
  const pressed = await contents.executeJavaScript(`(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'l',
      code: 'KeyL',
      bubbles: true,
      cancelable: true,
    }));
    return true;
  })()`, true);
  if (!pressed) throw new Error('the Relief L rotation key could not be pressed');
  await new Promise((resolve) => setTimeout(resolve, 180));
  await contents.executeJavaScript(`(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'l',
      code: 'KeyL',
      bubbles: true,
      cancelable: true,
    }));
    return true;
  })()`, true);
  return waitForRenderer(
    contents,
    (probe) => {
      const angle = Number.parseFloat(probe?.compass?.angle || '');
      return probeHasActiveRenderer(probe, 'relief-3d') &&
        Number.isFinite(angle) &&
        Math.abs(angle - beforeAngle) >= 1;
    },
    SMOKE_TEST.timeoutMs,
  );
}

async function verifySmokeDesktopGlobalBrace(contents) {
  const pressed = await contents.executeJavaScript(`(() => {
    const hudControl = document.querySelector('#view-mode-toggle');
    if (!(hudControl instanceof HTMLButtonElement) || hudControl.disabled) return false;
    hudControl.focus();
    return hudControl.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Shift',
      code: 'ShiftLeft',
      bubbles: true,
      cancelable: true,
    })) === false;
  })()`, true);
  if (!pressed) throw new Error('desktop Shift was not consumed from HUD focus');
  const held = await waitForRenderer(
    contents,
    (probe) =>
      probe.playerBracing === true &&
      probe.stabilityBraceFeedback?.active === 'true' &&
      probe.stabilityBraceFeedback?.text?.startsWith('BRACING'),
    SMOKE_TEST.timeoutMs,
  );
  const released = await contents.executeJavaScript(`(() => {
    const hudControl = document.querySelector('#view-mode-toggle');
    if (!(hudControl instanceof HTMLButtonElement)) return false;
    return hudControl.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'Shift',
      code: 'ShiftLeft',
      bubbles: true,
      cancelable: true,
    })) === false;
  })()`, true);
  if (!released) throw new Error('desktop Shift release was not consumed from HUD focus');
  const clear = await waitForRenderer(
    contents,
    (probe) =>
      probe.playerBracing === false &&
      probe.stabilityBraceFeedback?.active === 'false' &&
      !probe.stabilityBraceFeedback?.text?.startsWith('BRACING'),
    SMOKE_TEST.timeoutMs,
  );
  return { held, clear };
}

function probeHasSmokeBraceState(probe, active, touchHeld) {
  const brace = probe?.mobileHud?.actionDock?.brace;
  const feedback = probe?.stabilityBraceFeedback;
  return Boolean(
    probe?.playerBracing === active &&
    feedback?.active === String(active) &&
    (active
      ? feedback?.text?.startsWith('BRACING')
      : !feedback?.text?.startsWith('BRACING')) &&
    brace?.ariaPressed === String(touchHeld) &&
    brace?.text === (touchHeld ? 'BRACING' : 'BRACE')
  );
}

function smokeBraceEvidence(probe) {
  return {
    tick: probe?.tick ?? null,
    playerBracing: probe?.playerBracing ?? null,
    feedback: probe?.stabilityBraceFeedback ?? null,
    touchControl: probe?.mobileHud?.actionDock?.brace ?? null,
  };
}

async function dispatchSmokeBracePointer(contents, type, pointerId) {
  return contents.executeJavaScript(`(() => {
    const button = document.querySelector('.brace-button');
    if (!(button instanceof HTMLButtonElement) || button.disabled ||
        typeof PointerEvent !== 'function') return null;
    const target = ${JSON.stringify(type)} === 'pointerdown' ? button : window;
    const event = new PointerEvent(${JSON.stringify(type)}, {
      pointerId: ${pointerId},
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      buttons: ${type === 'pointerdown' ? 1 : 0},
      bubbles: true,
      cancelable: true,
    });
    return {
      consumed: target.dispatchEvent(event) === false,
      buttonVisible: (() => {
        const style = getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' &&
          Number.parseFloat(style.opacity || '1') > 0 && rect.width > 0 && rect.height > 0;
      })(),
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      type: event.type,
    };
  })()`, true);
}

async function dispatchSmokeHudShift(contents, type, targetKind = 'hud') {
  return contents.executeJavaScript(`(() => {
    const hudControl = document.querySelector('#view-mode-toggle');
    const activeCanvas = Array.from(document.querySelectorAll('#p5-mount canvas[data-renderer]'))
      .find((canvas) => !canvas.hidden && getComputedStyle(canvas).display !== 'none');
    const target = ${JSON.stringify(targetKind)} === 'canvas' ? activeCanvas : hudControl;
    if (!(target instanceof HTMLElement)) return null;
    target.focus({ preventScroll: true });
    const event = new KeyboardEvent(${JSON.stringify(type)}, {
      key: 'Shift',
      code: 'ShiftLeft',
      bubbles: true,
      cancelable: true,
    });
    return {
      consumed: target.dispatchEvent(event) === false,
      focused: document.activeElement === target,
      target: target instanceof HTMLCanvasElement ? target.dataset.renderer || 'canvas' : 'hud',
      type: event.type,
    };
  })()`, true);
}

/**
 * Exercises aggregate BRACE ownership through the real mobile button and
 * global/canvas keyboard listeners. A source releasing must never clear a
 * still-held source on hybrid touch laptops.
 */
async function verifySmokeHybridBrace(contents) {
  const ready = await waitForRenderer(
    contents,
    (probe) =>
      probeHasSmokeBraceState(probe, false, false) &&
      probe.mobileHud?.actionDock?.brace?.visible === true &&
      probe.mobileHud.actionDock.brace.insideViewport === true,
    SMOKE_TEST.timeoutMs,
  );

  const touchFirstDown = await dispatchSmokeBracePointer(contents, 'pointerdown', 701);
  if (!touchFirstDown?.consumed || touchFirstDown.buttonVisible !== true) {
    throw new Error(`mobile BRACE pointerdown was not consumed while visible: ${JSON.stringify(touchFirstDown)}`);
  }
  const touchFirstHeld = await waitForRenderer(
    contents,
    (probe) => probeHasSmokeBraceState(probe, true, true),
    SMOKE_TEST.timeoutMs,
  );
  const touchFirstShiftDown = await dispatchSmokeHudShift(contents, 'keydown');
  if (!touchFirstShiftDown?.consumed || touchFirstShiftDown.focused !== true) {
    throw new Error(`hybrid Shift keydown was not consumed from HUD focus: ${JSON.stringify(touchFirstShiftDown)}`);
  }
  const touchFirstBothHeld = await waitForRenderer(
    contents,
    (probe) => probeHasSmokeBraceState(probe, true, true),
    SMOKE_TEST.timeoutMs,
  );
  const touchFirstShiftUp = await dispatchSmokeHudShift(contents, 'keyup');
  if (!touchFirstShiftUp?.consumed) {
    throw new Error(`hybrid Shift release was not consumed from HUD focus: ${JSON.stringify(touchFirstShiftUp)}`);
  }
  const touchSurvivedShiftRelease = await waitForRenderer(
    contents,
    (probe) => probeHasSmokeBraceState(probe, true, true),
    SMOKE_TEST.timeoutMs,
  );
  const touchFirstUp = await dispatchSmokeBracePointer(contents, 'pointerup', 701);
  if (!touchFirstUp?.consumed) {
    throw new Error(`mobile BRACE pointerup was not consumed: ${JSON.stringify(touchFirstUp)}`);
  }
  const touchFirstClear = await waitForRenderer(
    contents,
    (probe) => probeHasSmokeBraceState(probe, false, false),
    SMOKE_TEST.timeoutMs,
  );

  const shiftFirstDown = await dispatchSmokeHudShift(contents, 'keydown');
  if (!shiftFirstDown?.consumed || shiftFirstDown.focused !== true) {
    throw new Error(`inverse hybrid Shift keydown was not consumed from HUD focus: ${JSON.stringify(shiftFirstDown)}`);
  }
  const shiftFirstHeld = await waitForRenderer(
    contents,
    (probe) => probeHasSmokeBraceState(probe, true, false),
    SMOKE_TEST.timeoutMs,
  );
  const shiftFirstTouchDown = await dispatchSmokeBracePointer(contents, 'pointerdown', 702);
  if (!shiftFirstTouchDown?.consumed || shiftFirstTouchDown.buttonVisible !== true) {
    throw new Error(`inverse mobile BRACE pointerdown failed: ${JSON.stringify(shiftFirstTouchDown)}`);
  }
  const shiftFirstBothHeld = await waitForRenderer(
    contents,
    (probe) => probeHasSmokeBraceState(probe, true, true),
    SMOKE_TEST.timeoutMs,
  );
  const shiftFirstTouchUp = await dispatchSmokeBracePointer(contents, 'pointerup', 702);
  if (!shiftFirstTouchUp?.consumed) {
    throw new Error(`inverse mobile BRACE pointerup failed: ${JSON.stringify(shiftFirstTouchUp)}`);
  }
  const shiftSurvivedTouchRelease = await waitForRenderer(
    contents,
    (probe) => probeHasSmokeBraceState(probe, true, false),
    SMOKE_TEST.timeoutMs,
  );
  // The key went down over the HUD and comes up over the active renderer. The
  // renderer may consume the event first; the global owner must still release.
  const shiftFirstUp = await dispatchSmokeHudShift(contents, 'keyup', 'canvas');
  if (!shiftFirstUp?.consumed || shiftFirstUp.focused !== true || shiftFirstUp.target === 'hud') {
    throw new Error(`focus-transfer Shift release did not reach the active canvas: ${JSON.stringify(shiftFirstUp)}`);
  }
  const shiftFirstClear = await waitForRenderer(
    contents,
    (probe) => probeHasSmokeBraceState(probe, false, false),
    SMOKE_TEST.timeoutMs,
  );

  const cancelTouchDown = await dispatchSmokeBracePointer(contents, 'pointerdown', 703);
  if (!cancelTouchDown?.consumed) {
    throw new Error(`cancellation BRACE pointerdown failed: ${JSON.stringify(cancelTouchDown)}`);
  }
  await waitForRenderer(
    contents,
    (probe) => probeHasSmokeBraceState(probe, true, true),
    SMOKE_TEST.timeoutMs,
  );
  const cancelShiftDown = await dispatchSmokeHudShift(contents, 'keydown');
  if (!cancelShiftDown?.consumed) {
    throw new Error(`cancellation overlap Shift keydown failed: ${JSON.stringify(cancelShiftDown)}`);
  }
  const pointerCancel = await dispatchSmokeBracePointer(contents, 'pointercancel', 703);
  if (!pointerCancel?.consumed) {
    throw new Error(`mobile BRACE pointercancel was not consumed: ${JSON.stringify(pointerCancel)}`);
  }
  const shiftSurvivedPointerCancel = await waitForRenderer(
    contents,
    (probe) => probeHasSmokeBraceState(probe, true, false),
    SMOKE_TEST.timeoutMs,
  );
  const cancelShiftUp = await dispatchSmokeHudShift(contents, 'keyup');
  if (!cancelShiftUp?.consumed) {
    throw new Error(`cancellation overlap Shift release failed: ${JSON.stringify(cancelShiftUp)}`);
  }
  const cancellationClear = await waitForRenderer(
    contents,
    (probe) => probeHasSmokeBraceState(probe, false, false),
    SMOKE_TEST.timeoutMs,
  );

  // Releasing already-clear sources is intentionally harmless. The mobile
  // listener does not consume an unrelated stale pointer, while the aggregate
  // state must remain clear after both repeated release paths.
  const repeatedPointerUp = await dispatchSmokeBracePointer(contents, 'pointerup', 703);
  const repeatedShiftUp = await dispatchSmokeHudShift(contents, 'keyup');
  const finalClear = await waitForRenderer(
    contents,
    (probe) => probeHasSmokeBraceState(probe, false, false),
    SMOKE_TEST.timeoutMs,
  );

  return {
    ready: smokeBraceEvidence(ready),
    touchThenShift: {
      touchDown: touchFirstDown,
      touchHeld: smokeBraceEvidence(touchFirstHeld),
      shiftDown: touchFirstShiftDown,
      bothHeld: smokeBraceEvidence(touchFirstBothHeld),
      shiftUp: touchFirstShiftUp,
      touchSurvivedShiftRelease: smokeBraceEvidence(touchSurvivedShiftRelease),
      touchUp: touchFirstUp,
      clear: smokeBraceEvidence(touchFirstClear),
    },
    shiftThenTouch: {
      shiftDown: shiftFirstDown,
      shiftHeld: smokeBraceEvidence(shiftFirstHeld),
      touchDown: shiftFirstTouchDown,
      bothHeld: smokeBraceEvidence(shiftFirstBothHeld),
      touchUp: shiftFirstTouchUp,
      shiftSurvivedTouchRelease: smokeBraceEvidence(shiftSurvivedTouchRelease),
      focusTransferShiftUp: shiftFirstUp,
      clear: smokeBraceEvidence(shiftFirstClear),
    },
    pointerCancellation: {
      touchDown: cancelTouchDown,
      shiftDown: cancelShiftDown,
      pointerCancel,
      shiftSurvivedPointerCancel: smokeBraceEvidence(shiftSurvivedPointerCancel),
      shiftUp: cancelShiftUp,
      clear: smokeBraceEvidence(cancellationClear),
    },
    repeatedRelease: {
      pointerUp: repeatedPointerUp,
      shiftUp: repeatedShiftUp,
      clear: smokeBraceEvidence(finalClear),
    },
  };
}

async function verifySmokeMobileQuietHourTitlePath(contents) {
  const opened = await contents.executeJavaScript(`(() => {
    const button = document.querySelector('.quiet-button');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`, true);
  if (!opened) throw new Error('the compact Quiet Hour control could not be opened');
  const quiet = await waitForRenderer(
    contents,
    (probe) =>
      probe.titleOpen === false &&
      probe.paused === true &&
      probe.quietHour?.open === true &&
      probe.quietHour.dialogVisible === true &&
      probe.quietHour.dialogInsideViewport === true &&
      probe.quietHour.finishVisible === true &&
      probe.quietHour.finishInsideViewport === true &&
      probe.quietHour.finishRect?.width >= 44 &&
      probe.quietHour.finishRect?.height >= 44 &&
      probe.quietHour.finishDisabled === false &&
      probe.quietHour.patchNotesTrigger?.visible === true &&
      probe.quietHour.patchNotesTrigger.insideViewport === true &&
      probe.quietHour.patchNotesTrigger.rect?.width >= 44 &&
      probe.quietHour.patchNotesTrigger.rect?.height >= 44 &&
      probe.quietHour.patchNotesTrigger.text === 'PATCH NOTES' &&
      probe.quietHour.patchNotesTrigger.ariaControls === 'tideweft-patch-notes' &&
      probe.quietHour.patchNotesTrigger.ariaHasPopup === 'dialog',
    SMOKE_TEST.timeoutMs,
  );
  const openedPatchNotes = await contents.executeJavaScript(`(() => {
    const dialog = document.querySelector('.quiet-dialog');
    const button = dialog?.querySelector('.patch-notes-trigger');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`, true);
  if (!openedPatchNotes) throw new Error('Quiet Hour could not open Patch Notes');
  const patchNotes = await waitForRenderer(
    contents,
    (probe) =>
      probe.paused === true &&
      probe.quietHour?.open === false &&
      probeHasOpenPatchNotes(probe, 'quiet-hour'),
    SMOKE_TEST.timeoutMs,
  );
  const closedPatchNotes = await contents.executeJavaScript(`(() => {
    const button = document.querySelector('[data-patch-action="close"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`, true);
  if (!closedPatchNotes) throw new Error('Quiet Hour Patch Notes could not close');
  const patchNotesReturned = await waitForRenderer(
    contents,
    (probe) =>
      probe.paused === true &&
      probe.quietHour?.open === true &&
      probe.patchNotes?.open === false,
    SMOKE_TEST.timeoutMs,
  );
  const finished = await contents.executeJavaScript(`(() => {
    const dialog = document.querySelector('.quiet-dialog');
    const button = dialog?.querySelector('.text-button--primary');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`, true);
  if (!finished) throw new Error('Quiet Hour could not return the compact player to the title');
  const title = await waitForRenderer(
    contents,
    (probe) =>
      probe.titleOpen === true &&
      probe.paused === true &&
      probe.quietHour?.open === false &&
      probe.titleLayout?.contentVisible === true &&
      probe.titleLayout?.restartFormVisible === true &&
      probe.titleLayout?.restartInputVisible === true &&
      probe.titleLayout?.formVisible === false &&
      probe.titleLayout?.continueButtonVisible === true,
    SMOKE_TEST.timeoutMs,
  );
  const resumed = await contents.executeJavaScript(`(() => {
    const button = document.querySelector('.continue-card');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`, true);
  if (!resumed) throw new Error('the saved title could not return to the compact world');
  const returned = await waitForRenderer(
    contents,
    (probe) =>
      probe.titleOpen === false &&
      probe.paused === false &&
      probeHasActiveRenderer(probe, 'relief-3d') &&
      probeHasCollapsedMobileHud(probe),
    SMOKE_TEST.timeoutMs,
  );
  return { quiet, patchNotes, patchNotesReturned, title, returned };
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
  let shellProbe;
  try {
    shellProbe = await waitForRenderer(
      contents,
      (probe) =>
        probe.url === PRODUCTION_ENTRY_URL &&
        probe.documentReadyState === 'complete' &&
        probe.statusState === 'ready' &&
        probe.hasRuntime === true &&
        probe.uiReady === 'true',
      SMOKE_TEST.timeoutMs,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${reason} Renderer errors: ${JSON.stringify(rendererErrors)}. ` +
      `Renderer warnings: ${JSON.stringify(rendererWarnings)}. ` +
      `Resource failures: ${JSON.stringify(resourceFailures)}.`,
    );
  }
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
      probe.titleLayout?.contentVisible === true &&
      probe.titleLayout?.headingVisible === true &&
      probe.titleLayout?.formVisible === true &&
      probe.titleLayout?.beginButtonVisible === true &&
      probe.titleLayout?.content?.width > 0 &&
      probe.titleLayout?.content?.height > 0 &&
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
  await contents.executeJavaScript(`new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
  })`, true);
  // Capture the title after its 1.25 s opening flourish has fully settled;
  // an early-frame screenshot can make readable controls look artificially
  // dim even though the animation resolves correctly for a player.
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  const paintedTitleProbe = await readRendererProbe(contents);
  if (
    paintedTitleProbe.release?.version !== SMOKE_EXPECTED_RELEASE_VERSION ||
    paintedTitleProbe.release?.buildIdentity !== SMOKE_EXPECTED_RELEASE_VERSION ||
    paintedTitleProbe.release?.gameplayContract?.id !== 'challenging-hard' ||
    paintedTitleProbe.release?.gameplayContract?.name !== 'A CHALLENGING HARD' ||
    paintedTitleProbe.release?.gameplayContract?.version !== SMOKE_EXPECTED_GAMEPLAY_CONTRACT_VERSION ||
    paintedTitleProbe.titleOpen !== true ||
    paintedTitleProbe.titleLayout?.contentVisible !== true ||
    paintedTitleProbe.titleLayout?.headingVisible !== true ||
    paintedTitleProbe.titleLayout?.headingText !== 'TIDEWEFT' ||
    paintedTitleProbe.titleLayout?.seedLabelVisible !== true ||
    paintedTitleProbe.titleLayout?.seedLabelText !== 'Seed phrase' ||
    paintedTitleProbe.titleLayout?.seedInputVisible !== true ||
    paintedTitleProbe.titleLayout?.beginButtonVisible !== true ||
    paintedTitleProbe.titleLayout?.beginButtonText !== 'START' ||
    paintedTitleProbe.titleLayout?.beginButtonColor !== 'rgb(236, 238, 233)' ||
    paintedTitleProbe.titleLayout?.continueButtonVisible !== false ||
    paintedTitleProbe.titleLayout?.patchNotesTrigger?.visible !== true ||
    paintedTitleProbe.titleLayout?.patchNotesTrigger?.insideViewport !== true ||
    paintedTitleProbe.titleLayout?.patchNotesTrigger?.rect?.width < 44 ||
    paintedTitleProbe.titleLayout?.patchNotesTrigger?.rect?.height < 44 ||
    paintedTitleProbe.titleLayout?.patchNotesTrigger?.text !== 'PATCH NOTES' ||
    paintedTitleProbe.titleLayout?.patchNotesTrigger?.ariaControls !== 'tideweft-patch-notes' ||
    paintedTitleProbe.titleLayout?.patchNotesTrigger?.ariaHasPopup !== 'dialog' ||
    paintedTitleProbe.titleLayout?.postureSelectorCount !== 0 ||
    paintedTitleProbe.titleLayout?.sessionShapeSelectorCount !== 0
  ) {
    throw new Error(`title screen was not visibly painted: ${JSON.stringify(paintedTitleProbe.titleLayout)}`);
  }
  const titlePatchNotesProbe = await verifySmokeTitlePatchNotes(contents);
  // Closing Patch Notes reopens the semantic title dialog and intentionally
  // replays its CSS arrival without rearming the audio opening. Let that
  // return flourish settle before recording the title evidence too.
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  const titleScreenshot = await captureSmokeEvidence(window, SMOKE_TEST.titleScreenshotPath);

  await startSmokeWorld(contents);
  const worldProbe = await waitForRenderer(
    contents,
    (probe) =>
      probe.titleOpen === false &&
      probe.paused === false &&
      probe.tick >= 2 &&
      probe.worldName === SMOKE_WORLD_NAME &&
      probe.settlementCount >= 5 &&
      probe.terrainTileCount === SMOKE_WORLD_TILE_COUNT &&
      probe.contractCount > 0 &&
      probe.reliefSupported === true &&
      probeHasActiveRenderer(probe, 'relief-3d') &&
      probeHasViewButtonMode(probe, 'relief-3d'),
    SMOKE_TEST.timeoutMs,
  );
  const desktopBraceProbe = await verifySmokeDesktopGlobalBrace(contents);
  const desktopResidentProbe = await exerciseSmokeResidentAbout(contents);

  // Exercise the exact UI path that previously lost clicks during live card
  // refreshes. The deterministic smoke seed begins beside an offered cargo
  // promise, so one action must reserve the contract, load physical cargo,
  // and replace PICK UP guidance with an explicit DELIVER marker.
  const promisePickupProbe = await acceptSmokePromise(contents);

  // Perception now correctly refuses a remote inspector. Exercise the mobile
  // inspector while the deterministic smoke courier is still standing beside
  // the directly observed origin harbor, before the Harp fixture relocates the
  // courier into an intentionally settlement-free field position.
  await resizeSmokeViewport(
    window,
    SMOKE_LANDSCAPE_PHONE_VIEWPORT,
    (probe) =>
      probeHasActiveRenderer(probe, 'relief-3d') &&
      probeHasLandscapeMobileFrame(probe) &&
      probeHasCollapsedMobileHud(probe),
  );
  const mobileScreenshotParts = SMOKE_TEST.mobileScreenshotPath
    ? path.parse(SMOKE_TEST.mobileScreenshotPath)
    : null;
  const residentAboutScreenshotPath = mobileScreenshotParts
    ? path.join(
        mobileScreenshotParts.dir,
        `${mobileScreenshotParts.name}-resident-about${mobileScreenshotParts.ext || '.png'}`,
      )
    : '';
  const landscapeResidentProbe = await exerciseSmokeResidentAbout(
    contents,
    [desktopResidentProbe.id],
    async () => {
      const landscapeScreenshot = await captureSmokeEvidence(window, residentAboutScreenshotPath);
      const portraitOpen = await resizeSmokeViewport(
        window,
        SMOKE_NARROW_PHONE_VIEWPORT,
        (probe) => probeHasActiveRenderer(probe, 'relief-3d') && probeHasResidentAbout(probe, true),
      );
      const landscapeRestored = await resizeSmokeViewport(
        window,
        SMOKE_LANDSCAPE_PHONE_VIEWPORT,
        (probe) =>
          probeHasActiveRenderer(probe, 'relief-3d') &&
          probeHasLandscapeMobileFrame(probe) &&
          probeHasResidentAbout(probe, true),
      );
      return { landscapeScreenshot, portraitOpen, landscapeRestored };
    },
  );
  const landscapeInspectorProbe = await openSmokeMobileInspector(contents);
  const landscapeInspectorClosedProbe = await toggleSmokeMobileHud(contents, false);
  await resizeSmokeViewport(
    window,
    SMOKE_SCREENSHOT_VIEWPORT,
    (probe) =>
      probeHasActiveRenderer(probe, 'relief-3d') &&
      probeHasViewButtonMode(probe, 'relief-3d') &&
      probe.terrainTileCount === SMOKE_WORLD_TILE_COUNT,
  );

  // Walk out of the harbor through the public pointer-routing command, then
  // use the real field-kit button. The resulting object must exist in the
  // renderer projection and agree with the HUD's deployed/active accounting.
  const wayknotProbe = await bindSmokeWayknot(contents);

  // UI pickup is intentionally optimistic until accept + pickup cross an
  // authoritative world-tick boundary. Do not snapshot the Harp fixture in
  // that short window: production load repair correctly rolls it back.
  const promiseCommitProbe = await waitForRenderer(
    contents,
    (probe) =>
      probe.tick > wayknotProbe.bound.tick &&
      probe.activeContractCount === 1 &&
      probe.playerCargoLoad > 0 &&
      probe.playerDestinationLabel?.startsWith('DELIVER'),
    SMOKE_TEST.timeoutMs,
  );

  // Complete the proven generated three-piece formation through a smoke-only
  // persisted fixture, reload it through production validation, and use the
  // real HUD/Relief/Scan paths for every assertion that follows.
  const tideHarpFixture = await installSmokeTideHarpFixture(contents);
  const tideHarpProbe = await verifySmokeTideHarp(contents);

  const chartProbe = await toggleSmokeView(contents, 'chart-2d');
  const reliefProbe = await toggleSmokeView(contents, 'relief-3d');
  const reliefKeyRotationProbe = await rotateSmokeReliefWithKey(contents);

  const minimumViewportProbe = await resizeSmokeViewport(
    window,
    SMOKE_MINIMUM_VIEWPORT,
    (probe) =>
      probeHasActiveRenderer(probe, 'relief-3d') &&
      probeHasViewButtonMode(probe, 'relief-3d') &&
      probeHasDesktopFieldTruth(probe) &&
      probeHasPlayableTideHarp(probe) &&
      probeHasPointerTransparentObjective(probe) &&
      probe.leftPaneGap >= 0 &&
      probe.promises &&
      probe.promises.railOpen === true &&
      probe.promises.clientHeight >= 64 &&
      probe.promises.hasVerticalOverflow === true &&
      (probe.promises.overflowY === 'auto' || probe.promises.overflowY === 'scroll'),
  );

  const responsiveViewportProbe = await resizeSmokeViewport(
    window,
    SMOKE_RESPONSIVE_VIEWPORT,
    (probe) =>
      probeHasActiveRenderer(probe, 'relief-3d') &&
      probeHasViewButtonMode(probe, 'relief-3d') &&
      probeHasDesktopFieldTruth(probe) &&
      probeHasPlayableTideHarp(probe) &&
      probeHasPointerTransparentObjective(probe) &&
      probe.layout?.leftRailDisplay === 'flex' &&
      probe.layout?.leftPaneOverlap === false &&
      probe.leftPaneGap >= 0 &&
      probe.layout?.objective?.width <= 320 &&
      probe.layout?.contract?.width <= 320 &&
      probe.layout?.hud?.height <= 64 &&
      probe.promises?.clientHeight >= 64 &&
      probe.promises?.hasVerticalOverflow === true,
  );

  const phoneViewportCollapsedProbe = await resizeSmokeViewport(
    window,
    SMOKE_PHONE_VIEWPORT,
    (probe) =>
      probeHasActiveRenderer(probe, 'relief-3d') &&
      probeHasViewButtonMode(probe, 'relief-3d') &&
      probeHasCollapsedMobileHud(probe) &&
      probe.layout?.leftRailDisplay === 'contents' &&
      probe.layout?.contractPosition === 'absolute' &&
      probe.layout?.hud?.height <= 64,
  );
  const phoneViewportExpandedProbe = await toggleSmokeMobileHud(contents, true);
  const phoneViewportRecollapsedProbe = await toggleSmokeMobileHud(contents, false);

  // Exercise the <=384px compact branch directly. A 390px probe can validate
  // phone layout while still missing the smallest-screen action/label rules.
  const compactPhoneCollapsedProbe = await resizeSmokeViewport(
    window,
    SMOKE_COMPACT_PHONE_VIEWPORT,
    (probe) =>
      probeHasActiveRenderer(probe, 'relief-3d') &&
      probeHasViewButtonMode(probe, 'relief-3d') &&
      probeHasCollapsedMobileHud(probe) &&
      probe.layout?.leftRailDisplay === 'contents' &&
      probe.layout?.hud?.height <= 64,
  );
  const compactPhoneExpandedProbe = await toggleSmokeMobileHud(contents, true);
  const compactPhoneRecollapsedProbe = await toggleSmokeMobileHud(contents, false);
  const compactTutorialOpenedProbe = await openSmokeTutorial(contents);
  const compactTutorialAdvancedProbe = await advanceSmokeTutorial(
    contents,
    compactTutorialOpenedProbe.tutorial.pageId,
  );
  const compactTutorialPatchNotesProbe = await verifySmokeTutorialPatchNotes(contents);
  const compactTutorialClosedProbe = await closeSmokeTutorialWithKeyboard(contents);
  const compactKitOpenedProbe = await openSmokeMobileKit(
    contents,
    compactTutorialClosedProbe.tick,
  );
  const compactKitMakeProbe = await switchSmokeMobileKitToMake(contents);
  const compactKitMakeScrolledProbe = await scrollSmokeMobileMakeKit(contents);
  const compactKitClosedProbe = await closeSmokeMobileKit(contents);
  const hybridBraceProbe = await verifySmokeHybridBrace(contents);

  const narrowPhoneCollapsedProbe = await resizeSmokeViewport(
    window,
    SMOKE_NARROW_PHONE_VIEWPORT,
    (probe) =>
      probeHasActiveRenderer(probe, 'relief-3d') &&
      probeHasViewButtonMode(probe, 'relief-3d') &&
      probeHasCollapsedMobileHud(probe) &&
      probe.layout?.leftRailDisplay === 'contents' &&
      probe.layout?.hud?.height <= 64,
  );
  const narrowPhoneExpandedProbe = await toggleSmokeMobileHud(contents, true);
  const narrowPhoneRecollapsedProbe = await toggleSmokeMobileHud(contents, false);
  const narrowPhoneQuietHourProbe = await verifySmokeMobileQuietHourTitlePath(contents);

  if (!await focusSmokePlayer(contents)) {
    throw new Error('the active mobile renderer could not return its camera to the courier');
  }
  await new Promise((resolve) => setTimeout(resolve, 450));
  const mobileScreenshot = await captureSmokeEvidence(window, SMOKE_TEST.mobileScreenshotPath);

  const landscapePhoneCollapsedProbe = await resizeSmokeViewport(
    window,
    SMOKE_LANDSCAPE_PHONE_VIEWPORT,
    (probe) =>
      probeHasActiveRenderer(probe, 'relief-3d') &&
      probeHasViewButtonMode(probe, 'relief-3d') &&
      probeHasLandscapeMobileFrame(probe) &&
      probeHasCollapsedMobileHud(probe),
  );
  await toggleSmokeMobileHud(contents, true);
  const landscapePhoneExpandedProbe = await waitForRenderer(
    contents,
    (probe) =>
      probeHasActiveRenderer(probe, 'relief-3d') &&
      probeHasLandscapeMobileFrame(probe) &&
      probeHasExpandedMobileHud(probe) &&
      probe.mobileHud.promises.rect?.width >= probe.viewport.width - 32,
    SMOKE_TEST.timeoutMs,
  );
  await toggleSmokeMobileHud(contents, false);
  const landscapePhoneRecollapsedProbe = await waitForRenderer(
    contents,
    (probe) =>
      probeHasActiveRenderer(probe, 'relief-3d') &&
      probeHasLandscapeMobileFrame(probe) &&
      probeHasCollapsedMobileHud(probe),
    SMOKE_TEST.timeoutMs,
  );
  const screenshotViewportProbe = await resizeSmokeViewport(
    window,
    SMOKE_SCREENSHOT_VIEWPORT,
    (probe) =>
      probeHasActiveRenderer(probe, 'relief-3d') &&
      probeHasViewButtonMode(probe, 'relief-3d') &&
      probeHasPlayableTideHarp(probe) &&
      probe.leftPaneGap >= 0 &&
      probe.terrainTileCount === SMOKE_WORLD_TILE_COUNT,
  );

  if (!await focusSmokePlayer(contents)) {
    throw new Error('the active renderer could not return its camera to the courier');
  }
  // Let the Relief camera ease back from contract inspection to the courier,
  // so visual evidence contains both actual terrain and the loaded delivery UI.
  await new Promise((resolve) => setTimeout(resolve, 750));
  const screenshot = await captureSmokeEvidence(window, SMOKE_TEST.screenshotPath);

  // Prove the packaged production input, projection, UI, and Relief label for
  // the controllable-water slice, then put the exact pre-probe autosave back.
  // Existing screenshot evidence therefore remains the normal expedition and
  // every later smoke check starts from the same stable foot state.
  const adriftFixture = await installSmokeAdriftFixture(contents);
  const adriftProbe = await verifySmokeAdrift(contents, adriftFixture);
  const adriftRestored = await restoreSmokeAdriftFixture(contents, adriftFixture);

  if (resourceFailures.length > 0) {
    throw new Error(`production resources failed to load: ${JSON.stringify(resourceFailures)}`);
  }
  if (rendererErrors.length > 0) {
    throw new Error(`renderer logged errors: ${JSON.stringify(rendererErrors)}`);
  }

  smokeResult(true, {
    entryUrl: PRODUCTION_ENTRY_URL,
    boot: paintedTitleProbe,
    titlePatchNotes: titlePatchNotesProbe,
    world: worldProbe,
    desktopBrace: desktopBraceProbe,
    residentAbout: {
      desktop: desktopResidentProbe,
      portraitTouchLayout: landscapeResidentProbe.screenshot?.portraitOpen ?? null,
      landscapeTouchLayout: landscapeResidentProbe,
    },
    hybridBrace: hybridBraceProbe,
    promisePickup: promisePickupProbe,
    promiseCommit: promiseCommitProbe,
    wayknot: wayknotProbe,
    tideHarp: {
      fixture: tideHarpFixture,
      tuned: tideHarpProbe.tuned,
      echoed: tideHarpProbe.echoed,
      expectedEcho: tideHarpProbe.expectedEcho,
    },
    adrift: {
      fixture: {
        tileIndex: adriftFixture.tileIndex,
        depth: adriftFixture.depth,
        deepNeighbors: adriftFixture.deepNeighbors,
        restore: adriftFixture.restore,
      },
      ...adriftProbe,
      restored: adriftRestored,
    },
    modeToggle: {
      chart: chartProbe,
      relief: reliefProbe,
      reliefKeyRotation: reliefKeyRotationProbe,
    },
    minimumViewport: minimumViewportProbe,
    responsiveViewport: responsiveViewportProbe,
    phoneViewport: {
      collapsed: phoneViewportCollapsedProbe,
      expanded: phoneViewportExpandedProbe,
      recollapsed: phoneViewportRecollapsedProbe,
    },
    compactPhoneViewport: {
      collapsed: compactPhoneCollapsedProbe,
      expanded: compactPhoneExpandedProbe,
      recollapsed: compactPhoneRecollapsedProbe,
      tutorial: {
        opened: compactTutorialOpenedProbe,
        advanced: compactTutorialAdvancedProbe,
        patchNotes: compactTutorialPatchNotesProbe,
        closed: compactTutorialClosedProbe,
      },
      kit: {
        opened: compactKitOpenedProbe,
        make: compactKitMakeProbe,
        makeScrolled: compactKitMakeScrolledProbe,
        closed: compactKitClosedProbe,
      },
    },
    narrowPhoneViewport: {
      collapsed: narrowPhoneCollapsedProbe,
      expanded: narrowPhoneExpandedProbe,
      recollapsed: narrowPhoneRecollapsedProbe,
      quietHourTitlePath: narrowPhoneQuietHourProbe,
    },
    landscapePhoneViewport: {
      collapsed: landscapePhoneCollapsedProbe,
      expanded: landscapePhoneExpandedProbe,
      recollapsed: landscapePhoneRecollapsedProbe,
      inspector: landscapeInspectorProbe,
      inspectorClosed: landscapeInspectorClosedProbe,
    },
    screenshotViewport: screenshotViewportProbe,
    rendererWarnings,
    resourceFailures,
    titleScreenshot,
    mobileScreenshot,
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

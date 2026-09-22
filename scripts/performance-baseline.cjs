'use strict';

const { createHash } = require('node:crypto');
const { createReadStream, constants: fsConstants } = require('node:fs');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(__dirname, '..');
const releaseRoot = path.join(projectRoot, 'release');
const artifactRoot = path.join(projectRoot, 'artifacts');
const DEFAULT_SAMPLE_MS = 10_000;
const BOOT_TIMEOUT_MS = 45_000;
const CDP_CALL_TIMEOUT_MS = 15_000;
const PROCESS_SHUTDOWN_TIMEOUT_MS = 3_000;
const TARGET_RENDERER_WARMUP_FRAMES = 30;
const LONG_TRAVEL_MINIMUM_SAMPLE_MS = 210_000;
const MAX_CHILD_OUTPUT_CHARACTERS = 64 * 1_024;
const BASELINE_WORLD_SEED = 'runtime baseline estuary';
const CDP_METRIC_NAMES = Object.freeze([
  'LayoutCount',
  'RecalcStyleCount',
  'LayoutDuration',
  'RecalcStyleDuration',
  'ScriptDuration',
  'TaskDuration',
  'ThreadTime',
  'ProcessTime',
]);
const CDP_METRIC_UNITS = Object.freeze({
  LayoutCount: 'count',
  RecalcStyleCount: 'count',
  LayoutDuration: 'seconds',
  RecalcStyleDuration: 'seconds',
  ScriptDuration: 'seconds',
  TaskDuration: 'seconds',
  ThreadTime: 'seconds',
  ProcessTime: 'seconds',
});

function argumentValue(argv, index, option) {
  const value = argv[index + 1];
  if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function parseSampleMs(rawValue) {
  if (!/^\d+$/u.test(rawValue)) {
    throw new Error('--sample-ms must be a whole number from 1000 through 60000');
  }
  const sampleMs = Number(rawValue);
  if (!Number.isSafeInteger(sampleMs) || sampleMs < 1_000 || sampleMs > 60_000) {
    throw new Error('--sample-ms must be a whole number from 1000 through 60000');
  }
  return sampleMs;
}

function outputPath(rawOutput) {
  const resolved = rawOutput
    ? path.resolve(rawOutput)
    : path.join(
      artifactRoot,
      'performance',
      `runtime-baseline-${new Date().toISOString().replace(/[:.]/gu, '-')}.json`,
    );
  const relative = path.relative(artifactRoot, resolved);
  if (
    relative.length === 0
    || relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
    || path.extname(resolved).toLowerCase() !== '.json'
  ) {
    throw new Error('--output must name a .json file under the ignored artifacts/ directory');
  }
  return resolved;
}

function parseArguments(argv) {
  let executable = process.env.TIDEWEFT_PACKAGED_EXECUTABLE || '';
  let output = '';
  let sampleMs = DEFAULT_SAMPLE_MS;
  let scenarioId = '';

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--executable') {
      executable = argumentValue(argv, index, '--executable');
      index += 1;
    } else if (argument.startsWith('--executable=')) {
      executable = argument.slice('--executable='.length);
      if (executable.length === 0) throw new Error('--executable requires a value');
    } else if (argument === '--output') {
      output = argumentValue(argv, index, '--output');
      index += 1;
    } else if (argument.startsWith('--output=')) {
      output = argument.slice('--output='.length);
      if (output.length === 0) throw new Error('--output requires a value');
    } else if (argument === '--sample-ms') {
      sampleMs = parseSampleMs(argumentValue(argv, index, '--sample-ms'));
      index += 1;
    } else if (argument.startsWith('--sample-ms=')) {
      sampleMs = parseSampleMs(argument.slice('--sample-ms='.length));
    } else if (argument === '--scenario') {
      scenarioId = argumentValue(argv, index, '--scenario');
      index += 1;
    } else if (argument.startsWith('--scenario=')) {
      scenarioId = argument.slice('--scenario='.length);
      if (scenarioId.length === 0) throw new Error('--scenario requires a value');
    } else {
      throw new Error(`Unknown performance-baseline argument: ${argument}`);
    }
  }

  return {
    executable: executable ? path.resolve(executable) : '',
    output: outputPath(output),
    sampleMs,
    scenarioId,
  };
}

async function directoriesAt(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(directory, entry.name))
    .sort();
}

async function filesAt(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(directory, entry.name))
    .sort();
}

async function macBundleExecutable(appBundle) {
  const executableDirectory = path.join(appBundle, 'Contents', 'MacOS');
  const executables = await filesAt(executableDirectory);
  const preferredName = path.basename(appBundle, '.app').toLowerCase();
  const preferred = executables.find(
    (candidate) => path.basename(candidate).toLowerCase() === preferredName,
  );
  return preferred ?? executables[0] ?? null;
}

async function resolveExplicitExecutable(candidate) {
  let metadata;
  try {
    metadata = await fs.stat(candidate);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error(`Packaged executable does not exist: ${candidate}`);
    }
    throw error;
  }

  if (metadata.isDirectory() && process.platform === 'darwin' && candidate.endsWith('.app')) {
    const bundled = await macBundleExecutable(candidate);
    if (bundled === null) throw new Error(`No executable exists inside app bundle: ${candidate}`);
    return bundled;
  }
  if (!metadata.isFile()) throw new Error(`Packaged executable is not a file: ${candidate}`);
  return candidate;
}

function preferredPackagedName(directory, platformMarker) {
  const directoryName = path.basename(directory);
  const markerIndex = directoryName.indexOf(platformMarker);
  return (markerIndex > 0 ? directoryName.slice(0, markerIndex) : 'tideweft').toLowerCase();
}

async function packagedExecutable() {
  let packageDirectories;
  try {
    packageDirectories = await directoriesAt(releaseRoot);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error('No release directory exists. Run `npm run package:desktop` first.');
    }
    throw error;
  }

  const platformMarker = `-${process.platform}-${process.arch}`;
  const candidates = packageDirectories.filter(
    (directory) => path.basename(directory).endsWith(platformMarker),
  );
  if (candidates.length === 0) {
    throw new Error(
      `No packaged ${process.platform}-${process.arch} directory exists under ${releaseRoot}. `
      + 'Run `npm run package:desktop` first or pass --executable.',
    );
  }
  if (candidates.length > 1) {
    throw new Error(
      `Multiple packaged ${process.platform}-${process.arch} directories exist. Pass --executable explicitly.`,
    );
  }
  const packageDirectory = candidates[0];
  const preferredName = preferredPackagedName(packageDirectory, platformMarker);

  if (process.platform === 'darwin') {
    const appBundles = (await directoriesAt(packageDirectory)).filter((entry) => (
      entry.endsWith('.app')
      && path.basename(entry, '.app').toLowerCase() === preferredName
    ));
    if (appBundles.length === 1) {
      const executables = await filesAt(path.join(appBundles[0], 'Contents', 'MacOS'));
      const exact = executables.find(
        (candidate) => path.basename(candidate).toLowerCase() === preferredName,
      );
      if (exact) return exact;
    }
    throw new Error(
      `Packaged directory ${packageDirectory} does not contain the exact ${preferredName}.app executable`,
    );
  }

  if (process.platform === 'win32') {
    const preferred = (await filesAt(packageDirectory)).find(
      (candidate) => path.basename(candidate).toLowerCase() === `${preferredName}.exe`,
    );
    if (preferred) return preferred;
    throw new Error(
      `Packaged directory ${packageDirectory} does not contain ${preferredName}.exe`,
    );
  }

  const preferred = (await filesAt(packageDirectory)).find(
    (candidate) => path.basename(candidate).toLowerCase() === preferredName,
  );
  if (preferred) {
    await fs.access(preferred, fsConstants.X_OK);
    return preferred;
  }

  throw new Error(
    `Packaged directory ${packageDirectory} does not contain executable ${preferredName}. `
    + 'Run `npm run package:desktop` first or pass --executable.',
  );
}

async function validateExecutable(executable) {
  const metadata = await fs.stat(executable);
  if (!metadata.isFile()) throw new Error(`Packaged executable is not a file: ${executable}`);
  if (process.platform === 'win32') {
    if (path.extname(executable).toLowerCase() !== '.exe') {
      throw new Error(`Packaged Windows executable must end in .exe: ${executable}`);
    }
  } else {
    await fs.access(executable, fsConstants.X_OK);
  }
}

async function fileIdentity(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  const metadata = await fs.stat(filename);
  return Object.freeze({ bytes: metadata.size, sha256: hash.digest('hex') });
}

function packagedAsarPath(executable) {
  return process.platform === 'darwin'
    ? path.resolve(path.dirname(executable), '..', 'Resources', 'app.asar')
    : path.join(path.dirname(executable), 'resources', 'app.asar');
}

async function executableIdentity(executable) {
  const relative = path.relative(projectRoot, executable);
  const reportedPath = (
    relative.length > 0
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  ) ? relative.split(path.sep).join('/') : path.basename(executable);
  const binary = await fileIdentity(executable);
  const asarPath = packagedAsarPath(executable);
  let applicationArchive;
  try {
    applicationArchive = await fileIdentity(asarPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error(
        `Packaged application archive is missing: ${asarPath}. `
        + 'The launcher binary alone cannot identify the game build.',
      );
    }
    throw error;
  }
  return Object.freeze({
    path: reportedPath,
    binary,
    applicationArchive,
  });
}

async function openPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  if (!Number.isSafeInteger(port) || port <= 0) throw new Error('Could not reserve a CDP port');
  return port;
}

function childExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

async function waitForPage(port, child, childState, timeoutMs = BOOT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (childState.spawnError) throw childState.spawnError;
    if (childExited(child)) {
      throw new Error(
        `Packaged app exited before profiling (code=${child.exitCode}, signal=${child.signalCode})`,
      );
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (!response.ok) throw new Error(`CDP discovery returned HTTP ${response.status}`);
      const pages = await response.json();
      if (!Array.isArray(pages)) throw new Error('CDP discovery did not return a page list');
      const page = pages.find((candidate) => {
        if (!candidate || candidate.type !== 'page' || typeof candidate.url !== 'string') return false;
        try {
          const pageUrl = new URL(candidate.url);
          return pageUrl.protocol === 'app:' && pageUrl.hostname === 'bundle';
        } catch {
          return false;
        }
      });
      if (page && typeof page.webSocketDebuggerUrl === 'string') return page;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Timed out waiting for packaged CDP page${lastError ? `: ${lastError.message}` : ''}`,
  );
}

class CdpClient {
  constructor(url) {
    if (typeof WebSocket !== 'function') {
      throw new Error('This profiler requires the WebSocket global provided by Node 22 or newer');
    }
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
    this.closed = false;
  }

  async open() {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out opening the CDP WebSocket')), 10_000);
      const onOpen = () => {
        clearTimeout(timer);
        this.socket.removeEventListener('error', onError);
        resolve();
      };
      const onError = () => {
        clearTimeout(timer);
        this.socket.removeEventListener('open', onOpen);
        reject(new Error('Could not open the CDP WebSocket'));
      };
      this.socket.addEventListener('open', onOpen, { once: true });
      this.socket.addEventListener('error', onError, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        this.rejectPending(new Error('CDP returned malformed JSON'));
        return;
      }
      if (!Number.isSafeInteger(message.id)) return;
      const deferred = this.pending.get(message.id);
      if (!deferred) return;
      this.pending.delete(message.id);
      clearTimeout(deferred.timer);
      if (message.error) deferred.reject(new Error(JSON.stringify(message.error)));
      else deferred.resolve(message.result);
    });
    this.socket.addEventListener('close', () => {
      this.closed = true;
      this.rejectPending(new Error('CDP WebSocket closed before the request completed'));
    });
    this.socket.addEventListener('error', () => {
      this.rejectPending(new Error('CDP WebSocket failed'));
    });
  }

  rejectPending(error) {
    for (const deferred of this.pending.values()) {
      clearTimeout(deferred.timer);
      deferred.reject(error);
    }
    this.pending.clear();
  }

  call(method, params = {}, timeoutMs = CDP_CALL_TIMEOUT_MS) {
    if (this.closed || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`Cannot call ${method}; the CDP WebSocket is not open`));
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async evaluate(expression, timeoutMs = CDP_CALL_TIMEOUT_MS) {
    const response = await this.call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    }, timeoutMs);
    if (response.exceptionDetails) {
      const description = response.exceptionDetails.exception?.description;
      throw new Error(description || response.exceptionDetails.text || 'Renderer evaluation failed');
    }
    return response.result.value;
  }

  async waitFor(expression, timeoutMs = BOOT_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    let latest;
    while (Date.now() < deadline) {
      latest = await this.evaluate(expression);
      if (latest) return latest;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${expression}; latest=${JSON.stringify(latest)}`);
  }

  async close() {
    if (this.closed || this.socket.readyState === WebSocket.CLOSED) return;
    this.closed = true;
    this.rejectPending(new Error('CDP client closed'));
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 500);
      this.socket.addEventListener('close', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      try {
        this.socket.close(1000, 'profiling complete');
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  }
}

function metricsRecord(result) {
  if (!result || !Array.isArray(result.metrics)) {
    throw new Error('Performance.getMetrics returned an invalid response');
  }
  const metrics = {};
  for (const metric of result.metrics) {
    if (
      metric
      && typeof metric.name === 'string'
      && typeof metric.value === 'number'
      && Number.isFinite(metric.value)
    ) {
      metrics[metric.name] = metric.value;
    }
  }
  return metrics;
}

function metricsDelta(before, after) {
  return Object.fromEntries(CDP_METRIC_NAMES.map((name) => {
    const beforeValue = before[name];
    const afterValue = after[name];
    const delta = Number.isFinite(beforeValue) && Number.isFinite(afterValue)
      ? afterValue - beforeValue
      : null;
    return [name, delta];
  }));
}

async function setViewport(client, viewport) {
  await client.call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });
  if (viewport === null) {
    await client.call('Emulation.clearDeviceMetricsOverride');
    return;
  }
  await client.call('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.deviceScaleFactor,
    mobile: viewport.mobile,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
  });
  await client.waitFor(
    `innerWidth === ${viewport.width} && innerHeight === ${viewport.height} `
    + `&& Math.abs(devicePixelRatio - ${viewport.deviceScaleFactor}) < 0.001`,
  );
}

async function browserPointInTime(client) {
  const [dom, heap] = await Promise.all([
    client.call('Memory.getDOMCounters'),
    client.evaluate(`(() => ({
      documentNodeCount: document.getElementsByTagName('*').length,
      heap: performance.memory ? {
        usedJSHeapBytes: performance.memory.usedJSHeapSize,
        totalJSHeapBytes: performance.memory.totalJSHeapSize,
        limitJSHeapBytes: performance.memory.jsHeapSizeLimit,
      } : null,
    }))()`),
  ]);
  return {
    scope: {
      dom: 'renderer document/CDP DOM counters at one point in time',
      heap: 'Chromium renderer performance.memory only; not whole-Electron RSS',
    },
    dom,
    ...heap,
  };
}

async function requirePerformanceInstrumentation(client, scenario) {
  const missing = await client.evaluate(`(() => {
    const bridge = window.__TIDEWEFT__;
    return [
      ['runtime.setPerformanceTelemetryEnabled', bridge.runtime?.setPerformanceTelemetryEnabled],
      ['runtime.resetPerformanceTelemetry', bridge.runtime?.resetPerformanceTelemetry],
      ['runtime.getPerformanceTelemetry', bridge.runtime?.getPerformanceTelemetry],
      ['runtime.getUIView', bridge.runtime?.getUIView],
      ['ui.setPerformanceTelemetryEnabled', bridge.ui?.setPerformanceTelemetryEnabled],
      ['ui.resetPerformanceTelemetry', bridge.ui?.resetPerformanceTelemetry],
      ['ui.getPerformanceTelemetry', bridge.ui?.getPerformanceTelemetry],
      ['ui.start', bridge.ui?.start],
      ['ui.stop', bridge.ui?.stop],
      ['renderer.setPerformanceTelemetryEnabled', bridge.renderer?.setPerformanceTelemetryEnabled],
      ['renderer.setActive', bridge.renderer?.setActive],
      ['renderer.telemetry', bridge.renderer?.telemetry],
    ].filter(([, value]) => typeof value !== 'function').map(([name]) => name);
  })()`);
  if (!Array.isArray(missing) || missing.length > 0) {
    throw new Error(
      `Scenario ${scenario.id} requires packaged performance instrumentation: `
      + JSON.stringify(missing),
    );
  }
}

async function preparePerformanceInstrumentation(client, scenario) {
  const prepared = await client.evaluate(`(() => {
    const bridge = window.__TIDEWEFT__;
    bridge.runtime.stop();
    bridge.renderer.setActive(false);
    bridge.ui.stop();
    bridge.renderer.setPerformanceTelemetryEnabled(true);
    bridge.runtime.setPerformanceTelemetryEnabled(true);
    bridge.ui.setPerformanceTelemetryEnabled(true);
    bridge.runtime.resetPerformanceTelemetry();
    bridge.ui.resetPerformanceTelemetry();
    return {
      renderer: bridge.renderer.telemetry(),
      runtime: bridge.runtime.getPerformanceTelemetry(),
      ui: bridge.ui.getPerformanceTelemetry(),
    };
  })()`);
  if (
    prepared?.renderer?.active !== false
    || prepared?.runtime?.fixedStep?.enabled !== true
    || prepared?.runtime?.viewProjection?.enabled !== true
    || prepared?.runtime?.audioProjection?.enabled !== true
    || prepared?.runtime?.saveSnapshot?.enabled !== true
    || prepared?.ui?.update?.enabled !== true
  ) {
    throw new Error(
      `Scenario ${scenario.id} could not prepare dormant performance probes: `
      + JSON.stringify(prepared),
    );
  }
}

async function warmTargetRenderer(client, scenario) {
  await setViewport(client, scenario.viewport);
  const warmup = await client.evaluate(`new Promise((resolve) => {
    const bridge = window.__TIDEWEFT__;
    const requestedMode = ${JSON.stringify(scenario.mode)};
    const appliedMode = bridge.renderer.setMode(requestedMode);
    if (appliedMode !== requestedMode) {
      resolve({ ok: false, reason: 'requested-mode-unavailable', appliedMode });
      return;
    }
    const initialFrameCount = bridge.renderer.telemetry().frameCount;
    const requiredFrames = ${TARGET_RENDERER_WARMUP_FRAMES};
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
      resolve(result);
    };
    const poll = () => {
      const currentFrameCount = bridge.renderer.telemetry().frameCount;
      if (currentFrameCount - initialFrameCount >= requiredFrames) {
        finish({ ok: true, frames: currentFrameCount - initialFrameCount });
      }
    };
    const pollTimer = setInterval(poll, 50);
    const timeoutTimer = setTimeout(() => {
      const currentFrameCount = bridge.renderer.telemetry().frameCount;
      finish({
        ok: false,
        reason: 'renderer-warmup-timeout',
        frames: currentFrameCount - initialFrameCount,
      });
    }, 45000);
    poll();
  })`, 50_000);
  if (!warmup?.ok) {
    throw new Error(`Scenario ${scenario.id} could not warm its renderer: ${JSON.stringify(warmup)}`);
  }
  return warmup.frames;
}

function assertMeasurementTelemetry(scenario, frameSample) {
  const renderer = frameSample.telemetry?.renderer;
  const runtime = frameSample.telemetry?.runtime;
  const ui = frameSample.telemetry?.ui;
  const boundedSnapshots = [
    ['runtime fixed-step', runtime?.fixedStep],
    ['runtime world-advance', runtime?.worldAdvanceStep],
    ['runtime view projection', runtime?.viewProjection],
    ['runtime audio projection', runtime?.audioProjection],
    ['runtime save snapshot', runtime?.saveSnapshot],
    ['UI update', ui?.update],
  ];
  for (const [label, snapshot] of boundedSnapshots) {
    if (
      snapshot === null
      || typeof snapshot !== 'object'
      || !Number.isSafeInteger(snapshot.capacity)
      || snapshot.capacity <= 0
      || !Number.isSafeInteger(snapshot.count)
      || !Number.isSafeInteger(snapshot.totalCount)
      || snapshot.count < 0
      || snapshot.totalCount < 0
      || snapshot.count !== Math.min(snapshot.totalCount, snapshot.capacity)
    ) {
      throw new Error(
        `Scenario ${scenario.id} returned an invalid bounded ${label} snapshot: `
        + JSON.stringify(snapshot),
      );
    }
  }
  const requiredFinite = [
    ['browser rAF average interval', frameSample.browserAnimationFrameCadence?.meanIntervalMs],
    ['renderer draw count', frameSample.rendererCadence?.frameCount],
    ['renderer whole-window throughput', frameSample.rendererCadence?.averageFps],
    ['renderer raw p99 interval', frameSample.rendererCadence?.p99IntervalMs],
    ['renderer raw worst interval', frameSample.rendererCadence?.worstIntervalMs],
    ['renderer observed interval count', frameSample.rendererFrameObserver?.intervalCount],
    ['renderer interval count', renderer?.rawFrameIntervalSampleCount],
    ['renderer draw count', renderer?.drawCpuSampleCount],
    ['runtime fixed-step count', runtime?.fixedStep?.count],
    ['runtime fixed-step total count', runtime?.fixedStep?.totalCount],
    ['runtime world-advance count', runtime?.worldAdvanceStep?.count],
    ['runtime world-advance total count', runtime?.worldAdvanceStep?.totalCount],
    ['runtime view projection count', runtime?.viewProjection?.count],
    ['runtime view projection total count', runtime?.viewProjection?.totalCount],
    ['runtime audio projection count', runtime?.audioProjection?.count],
    ['runtime audio projection total count', runtime?.audioProjection?.totalCount],
    ['UI update count', ui?.update?.count],
    ['UI update total count', ui?.update?.totalCount],
    ['sample start tick', frameSample.startTick],
    ['sample end tick', frameSample.endTick],
    ['actors total', runtime?.counts?.actorsTotal],
    ['actors materialized', runtime?.counts?.actorsMaterialized],
    ['actors visible', runtime?.counts?.actorsVisible],
    ['humans', runtime?.counts?.humans],
    ['humans visible', runtime?.counts?.humansVisible],
    ['dogs', runtime?.counts?.dogs],
    ['dogs visible', runtime?.counts?.dogsVisible],
    ['wildlife actor records', runtime?.counts?.wildlifeActorRecords],
    ['wildlife population units', runtime?.counts?.wildlifePopulationUnits],
    [
      'wildlife aggregate population units',
      runtime?.counts?.wildlifeAggregatePopulationUnits,
    ],
    ['wildlife materialized', runtime?.counts?.wildlifeMaterialized],
    ['wildlife visible', runtime?.counts?.wildlifeVisible],
  ];
  for (const [label, value] of requiredFinite) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Scenario ${scenario.id} returned invalid ${label}: ${value}`);
    }
  }
  const counts = runtime.counts;
  if (
    !Object.values(counts).every(Number.isSafeInteger)
    || counts.actorsTotal !== counts.humans + counts.dogs + counts.wildlifeActorRecords
    || counts.actorsMaterialized
      !== counts.humans + counts.dogs + counts.wildlifeMaterialized
    || counts.actorsVisible
      !== counts.humansVisible + counts.dogsVisible + counts.wildlifeVisible
  ) {
    throw new Error(
      `Scenario ${scenario.id} returned inconsistent authoritative actor counts: `
      + JSON.stringify(counts),
    );
  }
  if (
    frameSample.reason !== 'sample-window-complete'
    || frameSample.browserAnimationFrameCadence.intervalCount < 1
    || frameSample.rendererCadence.frameCount < 2
    || frameSample.rendererFrameObserver.intervalCount < 1
    || renderer.rawFrameIntervalSampleCount < 1
    || renderer.drawCpuSampleCount < 1
    || runtime.fixedStep.totalCount < 1
    || runtime.viewProjection.totalCount < 1
    || runtime.audioProjection.totalCount < 1
    || ui.update.totalCount < 1
    || frameSample.endTick < frameSample.startTick
  ) {
    throw new Error(
      `Scenario ${scenario.id} did not produce a complete instrumented sample: `
      + JSON.stringify(frameSample),
    );
  }
  const tickDelta = frameSample.endTick - frameSample.startTick;
  const residualFixedSteps = runtime.fixedStep.totalCount
    - runtime.worldAdvanceStep.totalCount * 10;
  if (
    tickDelta !== runtime.worldAdvanceStep.totalCount
    || residualFixedSteps < 0
    || residualFixedSteps > 9
    || runtime.audioProjection.totalCount !== runtime.fixedStep.totalCount
    || runtime.viewProjection.totalCount < runtime.fixedStep.totalCount
  ) {
    throw new Error(
      `Scenario ${scenario.id} measured an inconsistent authoritative workload: `
      + JSON.stringify({
        tickDelta,
        fixedSteps: runtime.fixedStep.totalCount,
        worldAdvanceSteps: runtime.worldAdvanceStep.totalCount,
        viewProjections: runtime.viewProjection.totalCount,
        audioProjections: runtime.audioProjection.totalCount,
      }),
    );
  }

  const terrainTiles = frameSample.telemetry?.renderer?.terrainTiles;
  if (!Number.isSafeInteger(terrainTiles) || terrainTiles <= 0) {
    throw new Error(`Scenario ${scenario.id} rendered no terrain work: ${terrainTiles}`);
  }
  if (counts.humans <= 0 || counts.dogs <= 0 || counts.wildlifeActorRecords <= 0) {
    throw new Error(
      `Scenario ${scenario.id} is not a representative living-world scene: `
      + JSON.stringify(counts),
    );
  }
  if (scenario.denseBiodiversity === true && (
    counts.wildlifeMaterialized < 20
    || counts.wildlifeMaterialized > 24
    || counts.wildlifeActorRecords <= counts.wildlifeMaterialized
    || counts.wildlifeAggregatePopulationUnits <= 0
  )) {
    throw new Error(
      `Scenario ${scenario.id} did not retain a legitimate near-budget biodiversity scene: `
      + JSON.stringify(counts),
    );
  }
  if (scenario.travel !== undefined) {
    const travel = frameSample.travel;
    const uniqueRegions = new Set(
      Array.isArray(travel?.visitedRegions)
        ? travel.visitedRegions.map(({ key }) => key)
        : [],
    );
    const canonicalRegionProgress = (
      (travel?.end?.canonicalRegion?.[scenario.travel.axis] ?? Number.NaN)
      - (travel?.start?.canonicalRegion?.[scenario.travel.axis] ?? Number.NaN)
    ) * scenario.travel.direction;
    const directedProgress = (
      (travel?.end?.[scenario.travel.axis] ?? Number.NaN)
      - (travel?.start?.[scenario.travel.axis] ?? Number.NaN)
    ) * scenario.travel.direction;
    const movementSpanMs = (
      (travel?.lastMovementElapsedMs ?? Number.NaN)
      - (travel?.firstMovementElapsedMs ?? Number.NaN)
    );
    const stationaryTailMs = frameSample.actualDurationMs
      - (travel?.lastMovementElapsedMs ?? Number.NEGATIVE_INFINITY);
    const initialStationaryMs = travel?.firstMovementElapsedMs ?? Number.POSITIVE_INFINITY;
    if (
      travel?.dispatchFailure !== undefined
      || travel?.axis !== scenario.travel.axis
      || travel?.routeBudgetTiles !== scenario.travel.routeBudgetTiles
      || travel?.targetDistanceIssued < scenario.travel.minimumIssuedTiles
      || travel?.targetsIssued < 3
      || uniqueRegions.size < 3
      || !Number.isFinite(canonicalRegionProgress)
      || canonicalRegionProgress < 2
      || travel?.projectionMismatches?.length !== 0
      || (
        scenario.travel.requiresNegativeRegion === true
        && !travel?.visitedRegions?.some(
          ({ region }) => region.x < 0 || region.y < 0,
        )
      )
      || !Number.isFinite(directedProgress)
      || directedProgress < scenario.travel.minimumProgressTiles
      || !Number.isFinite(travel?.observedDistanceTiles)
      || travel.observedDistanceTiles < scenario.travel.minimumProgressTiles
      || !Number.isFinite(movementSpanMs)
      || movementSpanMs < scenario.travel.minimumMovementSpanMs
      || !Number.isFinite(initialStationaryMs)
      || initialStationaryMs > scenario.travel.maximumInitialStationaryMs
      || !Number.isFinite(stationaryTailMs)
      || stationaryTailMs > scenario.travel.maximumStationaryTailMs
      || !Number.isFinite(travel?.maxStationaryGapMs)
      || travel.maxStationaryGapMs > scenario.travel.maximumStationaryGapMs
      || !Number.isFinite(travel?.maxObservedStepTiles)
      || travel.maxObservedStepTiles > scenario.travel.maximumObservedStepTiles
      || travel?.discontinuities?.length !== 0
      || !Array.isArray(travel?.modesObserved)
      || travel.modesObserved.some(
        (mode) => mode !== 'foot' && mode !== 'wading' && mode !== 'skiff' && mode !== 'camp',
      )
    ) {
      throw new Error(
        `Scenario ${scenario.id} did not complete continuous ordinary travel through `
        + `at least three regions: ${JSON.stringify(travel)}`,
      );
    }
  }
}

async function measureScenario(client, scenario, sampleMs) {
  await requirePerformanceInstrumentation(client, scenario);
  const warmupFrames = await warmTargetRenderer(client, scenario);
  await preparePerformanceInstrumentation(client, scenario);
  const browserBefore = await browserPointInTime(client);
  const performanceBefore = metricsRecord(await client.call('Performance.getMetrics'));
  const frameSample = await client.evaluate(`new Promise((resolve) => {
    const bridge = window.__TIDEWEFT__;
    const requestedMode = ${JSON.stringify(scenario.mode)};
    const travelConfig = ${JSON.stringify(scenario.travel ?? null)};
    const missing = [
      ['runtime.setPerformanceTelemetryEnabled', bridge.runtime?.setPerformanceTelemetryEnabled],
      ['runtime.resetPerformanceTelemetry', bridge.runtime?.resetPerformanceTelemetry],
      ['runtime.getPerformanceTelemetry', bridge.runtime?.getPerformanceTelemetry],
      ['runtime.getUIView', bridge.runtime?.getUIView],
      ['ui.setPerformanceTelemetryEnabled', bridge.ui?.setPerformanceTelemetryEnabled],
      ['ui.resetPerformanceTelemetry', bridge.ui?.resetPerformanceTelemetry],
      ['ui.getPerformanceTelemetry', bridge.ui?.getPerformanceTelemetry],
      ['ui.start', bridge.ui?.start],
      ['ui.stop', bridge.ui?.stop],
      ['renderer.setPerformanceTelemetryEnabled', bridge.renderer?.setPerformanceTelemetryEnabled],
      ['renderer.setActive', bridge.renderer?.setActive],
      ['renderer.telemetry', bridge.renderer?.telemetry],
    ].filter(([, value]) => typeof value !== 'function').map(([name]) => name);
    if (missing.length > 0) {
      resolve({ reason: 'missing-instrumentation', missing });
      return;
    }
    const activeMode = bridge.renderer.mode();
    if (activeMode !== requestedMode) {
      resolve({ reason: 'requested-mode-unavailable', appliedMode: activeMode });
      return;
    }
    const dormantTelemetry = {
      renderer: bridge.renderer.telemetry(),
      runtime: bridge.runtime.getPerformanceTelemetry(),
      ui: bridge.ui.getPerformanceTelemetry(),
    };
    if (
      dormantTelemetry.renderer.active !== false
      || dormantTelemetry.runtime.fixedStep?.enabled !== true
      || dormantTelemetry.runtime.viewProjection?.enabled !== true
      || dormantTelemetry.runtime.audioProjection?.enabled !== true
      || dormantTelemetry.ui.update?.enabled !== true
    ) {
      resolve({ reason: 'instrumentation-not-prepared', dormantTelemetry });
      return;
    }

    const browserRafGaps = [];
    const rendererDrawGaps = [];
    const expectedDurationMs = ${sampleMs};
    bridge.renderer.setActive(true);
    bridge.ui.start();
    bridge.runtime.start();
    const startedAt = performance.now();
    const startTick = bridge.runtime.getRenderView().tick;
    const initialRendererFrameCount = bridge.renderer.telemetry().frameCount;
    let priorBrowserRafAt = null;
    let priorRendererDrawObservedAt = null;
    let priorRendererFrameCount = initialRendererFrameCount;
    let browserRafCallbacks = 0;
    let unresolvedRendererFrameAdvances = 0;
    let settled = false;
    const travel = travelConfig === null ? null : {
      axis: travelConfig.axis,
      direction: travelConfig.direction,
      segmentTiles: travelConfig.segmentTiles,
      routeBudgetTiles: travelConfig.routeBudgetTiles,
      targetsIssued: 0,
      targetDistanceIssued: 0,
      targetGlobalCoordinate: null,
      observedDistanceTiles: 0,
      movingObservationCount: 0,
      firstMovementElapsedMs: null,
      lastMovementElapsedMs: null,
      maxStationaryGapMs: 0,
      maxObservedStepTiles: 0,
      discontinuities: [],
      modesObserved: [],
      modeTransitions: [],
      braceActive: false,
      braceTransitions: [],
      projectionMismatches: [],
      start: null,
      end: null,
      visitedRegions: [],
      transitions: [],
    };
    let previousTravelObservation = null;
    let previousTravelMode = null;
    const globalPlayer = () => {
      const view = bridge.runtime.getRenderView();
      const navigation = bridge.runtime.getUIView().navigation;
      const origin = view.terrain.worldTileOrigin;
      const tileSize = view.terrain.tileSize;
      const playerPosition = view.player?.position;
      if (
        !origin
        || !Number.isFinite(origin.x)
        || !Number.isFinite(origin.y)
        || !Number.isFinite(tileSize)
        || tileSize <= 0
        || !playerPosition
        || !Number.isFinite(playerPosition.x)
        || !Number.isFinite(playerPosition.y)
        || !navigation
        || !Number.isSafeInteger(navigation.regionX)
        || !Number.isSafeInteger(navigation.regionY)
        || !Number.isSafeInteger(navigation.globalX)
        || !Number.isSafeInteger(navigation.globalY)
      ) return null;
      const x = origin.x + playerPosition.x / tileSize;
      const y = origin.y + playerPosition.y / tileSize;
      return {
        x,
        y,
        localX: playerPosition.x,
        localY: playerPosition.y,
        tileSize,
        columns: view.terrain.columns,
        rows: view.terrain.rows,
        mode: view.player.mode,
        spatialEpoch: view.spatialEpoch ?? null,
        canonicalRegion: { x: navigation.regionX, y: navigation.regionY },
        canonicalGlobal: { x: navigation.globalX, y: navigation.globalY },
        projectionConsistent: Math.floor(x) === navigation.globalX
          && Math.floor(y) === navigation.globalY,
      };
    };
    const observeTravel = (elapsedMs) => {
      if (travel === null) return;
      const position = globalPlayer();
      if (position === null) return;
      if (travel.start === null) travel.start = position;
      travel.end = position;
      if (!position.projectionConsistent) {
        travel.projectionMismatches.push({ elapsedMs, position });
      }
      if (!travel.modesObserved.includes(position.mode)) {
        travel.modesObserved.push(position.mode);
      }
      if (previousTravelMode !== position.mode) {
        travel.modeTransitions.push({
          from: previousTravelMode,
          to: position.mode,
          elapsedMs,
          global: { x: position.x, y: position.y },
        });
        previousTravelMode = position.mode;
      }
      const shouldBrace = position.mode === 'wading' || position.mode === 'skiff';
      if (travel.braceActive !== shouldBrace) {
        travel.braceActive = shouldBrace;
        travel.braceTransitions.push({
          active: shouldBrace,
          elapsedMs,
          mode: position.mode,
          global: { x: position.x, y: position.y },
        });
        bridge.runtime.dispatchRenderer({ type: 'brace', active: shouldBrace });
      }
      if (previousTravelObservation !== null) {
        const stepTiles = Math.hypot(
          position.x - previousTravelObservation.x,
          position.y - previousTravelObservation.y,
        );
        if (Number.isFinite(stepTiles)) {
          travel.maxObservedStepTiles = Math.max(travel.maxObservedStepTiles, stepTiles);
          if (stepTiles > 0.001) {
            travel.observedDistanceTiles += stepTiles;
            travel.movingObservationCount += 1;
            if (travel.firstMovementElapsedMs === null) {
              travel.firstMovementElapsedMs = elapsedMs;
            }
            if (travel.lastMovementElapsedMs !== null) {
              travel.maxStationaryGapMs = Math.max(
                travel.maxStationaryGapMs,
                elapsedMs - travel.lastMovementElapsedMs,
              );
            }
            travel.lastMovementElapsedMs = elapsedMs;
          }
          if (stepTiles > travelConfig.maximumObservedStepTiles) {
            travel.discontinuities.push({
              elapsedMs,
              stepTiles,
              from: {
                x: previousTravelObservation.x,
                y: previousTravelObservation.y,
                spatialEpoch: previousTravelObservation.spatialEpoch,
              },
              to: { x: position.x, y: position.y, spatialEpoch: position.spatialEpoch },
            });
          }
        }
      }
      previousTravelObservation = position;
      const region = position.canonicalRegion;
      const key = region.x + ':' + region.y;
      if (travel.visitedRegions.at(-1)?.key !== key) {
        const observation = {
          key,
          region,
          elapsedMs,
          global: { x: position.x, y: position.y },
          spatialEpoch: position.spatialEpoch,
        };
        travel.visitedRegions.push(observation);
        if (travel.visitedRegions.length > 1) travel.transitions.push(observation);
      }
      const globalCoordinate = position[travel.axis];
      const localCoordinate = travel.axis === 'x' ? position.localX : position.localY;
      const axisCells = travel.axis === 'x' ? position.columns : position.rows;
      const reachedTarget = travel.targetGlobalCoordinate === null
        || (globalCoordinate - travel.targetGlobalCoordinate) * travel.direction >= -1.25;
      const remainingDistance = travel.routeBudgetTiles - travel.targetDistanceIssued;
      if (reachedTarget && remainingDistance > 0.001) {
        const safeEdgeCenter = travel.direction > 0
          ? (axisCells - 1.5) * position.tileSize
          : 1.5 * position.tileSize;
        const availableTiles = travel.direction > 0
          ? Math.max(0, (safeEdgeCenter - localCoordinate) / position.tileSize)
          : Math.max(0, (localCoordinate - safeEdgeCenter) / position.tileSize);
        if (availableTiles < 0.5) {
          travel.dispatchFailure = {
            reason: 'insufficient-bounded-target-space',
            position,
            availableTiles,
          };
          return;
        }
        const nextDistance = Math.min(
          travel.segmentTiles,
          remainingDistance,
          availableTiles,
        );
        const targetLocalCoordinate = localCoordinate
          + nextDistance * position.tileSize * travel.direction;
        if (
          !Number.isFinite(targetLocalCoordinate)
          || targetLocalCoordinate < 0
          || targetLocalCoordinate >= axisCells * position.tileSize
        ) {
          travel.dispatchFailure = {
            reason: 'no-bounded-forward-target',
            position,
            availableTiles,
            nextDistance,
            targetLocalCoordinate,
          };
          return;
        }
        travel.targetGlobalCoordinate = globalCoordinate + nextDistance * travel.direction;
        travel.targetDistanceIssued += nextDistance;
        travel.targetsIssued += 1;
        bridge.runtime.dispatchRenderer({
          type: 'move-target',
          point: {
            x: travel.axis === 'x' ? targetLocalCoordinate : position.localX,
            y: travel.axis === 'y' ? targetLocalCoordinate : position.localY,
          },
          additive: false,
        });
      }
    };
    observeTravel(0);
    const finish = () => {
      if (settled) return;
      settled = true;
      bridge.runtime.stop();
      const finishedAt = performance.now();
      const durationMs = finishedAt - startedAt;
      const statistics = (samples) => {
        const ordered = [...samples].sort((left, right) => left - right);
        const p99Index = Math.max(0, Math.ceil(ordered.length * 0.99) - 1);
        const mean = samples.length === 0
          ? 0
          : samples.reduce((sum, value) => sum + value, 0) / samples.length;
        const p99 = ordered[p99Index] ?? 0;
        return {
          intervalCount: samples.length,
          meanIntervalMs: mean,
          p99IntervalMs: p99,
          p99IntervalEquivalentFps: p99 > 0 ? 1000 / p99 : 0,
          worstIntervalMs: ordered.at(-1) ?? 0,
        };
      };
      const telemetry = {
        renderer: bridge.renderer.telemetry(),
        runtime: bridge.runtime.getPerformanceTelemetry(),
        ui: bridge.ui.getPerformanceTelemetry(),
      };
      const rendererFrameCount = Math.max(
        0,
        telemetry.renderer.frameCount - initialRendererFrameCount,
      );
      const rawRendererP99 = telemetry.renderer.rawFrameIntervalP99Ms ?? 0;
      const result = {
        reason: 'sample-window-complete',
        expectedDurationMs,
        actualDurationMs: durationMs,
        startTick,
        endTick: bridge.runtime.getRenderView().tick,
        browserAnimationFrameCadence: {
          scope: 'completed browser-rAF callback intervals observed inside the measured window; start and terminal edge intervals are censored',
          callbacks: browserRafCallbacks,
          ...statistics(browserRafGaps),
        },
        rendererCadence: {
          scope: 'game renderer frame-count delta over the complete measured wall-clock window; p99 and worst are from the bounded newest completed callback intervals, with start and terminal edge intervals censored',
          frameCount: rendererFrameCount,
          averageFps: durationMs > 0 ? rendererFrameCount * 1000 / durationMs : 0,
          boundedIntervalSampleCount: telemetry.renderer.rawFrameIntervalSampleCount ?? 0,
          p99IntervalMs: rawRendererP99,
          p99IntervalEquivalentFps: rawRendererP99 > 0 ? 1000 / rawRendererP99 : 0,
          worstIntervalMs: telemetry.renderer.rawFrameIntervalWorstMs ?? 0,
        },
        rendererFrameObserver: {
          scope: 'completed browser-rAF polling intervals between observed renderer frame-count advances; edge-censored diagnostic only, not the renderer FPS source',
          unresolvedFrameAdvances: unresolvedRendererFrameAdvances,
          ...statistics(rendererDrawGaps),
        },
        sceneCounts: telemetry.runtime.counts,
        travel,
        telemetryScope: {
          runtime: 'newest bounded ' + telemetry.runtime.fixedStep.capacity
            + ' samples per stage; totalCount covers the complete reset-to-snapshot window',
          ui: 'newest bounded ' + telemetry.ui.update.capacity
            + ' update samples; totalCount covers the complete reset-to-snapshot window',
          renderer: 'newest bounded '
            + (telemetry.renderer.detailedSampleCapacity ?? 'implementation-defined')
            + ' raw interval and draw samples; frameCount delta covers the complete wall-clock window',
        },
        telemetry,
      };
      // Stop presentation only after taking its immutable end-of-window snapshot.
      bridge.renderer.setActive(false);
      bridge.ui.stop();
      resolve(result);
    };
    setTimeout(finish, expectedDurationMs);
    const sample = (now) => {
      if (settled) return;
      if (priorBrowserRafAt !== null) browserRafGaps.push(now - priorBrowserRafAt);
      priorBrowserRafAt = now;
      browserRafCallbacks += 1;
      const rendererFrameCount = bridge.renderer.telemetry().frameCount;
      observeTravel(performance.now() - startedAt);
      if (
        travel?.dispatchFailure !== undefined
        || travel?.modesObserved?.some(
          (mode) => mode !== 'foot' && mode !== 'wading' && mode !== 'skiff' && mode !== 'camp',
        )
      ) {
        finish();
        return;
      }
      if (rendererFrameCount > priorRendererFrameCount) {
        const advance = rendererFrameCount - priorRendererFrameCount;
        if (advance === 1 && priorRendererDrawObservedAt !== null) {
          rendererDrawGaps.push(now - priorRendererDrawObservedAt);
        } else if (advance > 1) {
          unresolvedRendererFrameAdvances += advance;
        }
        priorRendererDrawObservedAt = now;
        priorRendererFrameCount = rendererFrameCount;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  })`, sampleMs + CDP_CALL_TIMEOUT_MS);
  assertMeasurementTelemetry(scenario, frameSample);

  const performanceAfterSample = metricsRecord(await client.call('Performance.getMetrics'));
  const browserAfterSample = await browserPointInTime(client);
  const performanceBeforeSave = metricsRecord(await client.call('Performance.getMetrics'));
  const saveSample = await client.evaluate(`(async () => {
    const bridge = window.__TIDEWEFT__;
    const startedAt = performance.now();
    await bridge.runtime.save();
    const finishedAt = performance.now();
    const telemetry = bridge.runtime.getPerformanceTelemetry();
    return {
      endToEndMs: finishedAt - startedAt,
      synchronousSnapshot: telemetry.saveSnapshot,
      serializedBytes: telemetry.lastSerializedSaveBytes,
    };
  })()`);
  if (
    !Number.isFinite(saveSample?.endToEndMs)
    || saveSample.endToEndMs < 0
    || !Number.isFinite(saveSample?.serializedBytes)
    || saveSample.serializedBytes <= 0
    || !Number.isFinite(saveSample?.synchronousSnapshot?.totalCount)
    || saveSample.synchronousSnapshot.totalCount < 1
  ) {
    throw new Error(`Scenario ${scenario.id} did not produce a valid save sample: ${JSON.stringify(saveSample)}`);
  }
  const performanceAfterSave = metricsRecord(await client.call('Performance.getMetrics'));
  const browserAfterSave = await browserPointInTime(client);
  const snapshot = await client.evaluate(`(() => {
    const bridge = window.__TIDEWEFT__;
    const view = bridge.runtime.getRenderView();
    return {
      tick: view.tick,
      mode: bridge.renderer.mode(),
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      projected: {
        terrainTiles: view.terrain?.tiles?.length ?? 0,
        porters: view.porters?.length ?? 0,
        dogs: view.dogs?.length ?? 0,
        wildlife: view.wildlife?.length ?? 0,
        aggregateWildlifeEvidence: view.aggregateWildlifeEvidence?.length ?? 0,
        looseCargo: view.looseCargo?.length ?? 0,
      },
    };
  })()`);
  if (snapshot.mode !== scenario.mode) {
    throw new Error(`Scenario ${scenario.id} measured ${snapshot.mode} instead of ${scenario.mode}`);
  }
  if (snapshot.reducedMotion !== false) {
    throw new Error(
      `Scenario ${scenario.id} did not retain the fixed no-preference motion profile`,
    );
  }
  if (
    scenario.viewport !== null
    && (
      snapshot.viewport.width !== scenario.viewport.width
      || snapshot.viewport.height !== scenario.viewport.height
      || Math.abs(snapshot.viewport.dpr - scenario.viewport.deviceScaleFactor) >= 0.001
    )
  ) {
    throw new Error(`Scenario ${scenario.id} measured the wrong viewport: ${JSON.stringify(snapshot.viewport)}`);
  }

  return {
    id: scenario.id,
    label: scenario.label,
    seed: scenario.seed,
    worldGroup: scenario.worldGroup,
    controlledWarmupFrames: warmupFrames,
    frameSample,
    saveSample,
    snapshot,
    browser: {
      cdpMetricUnits: CDP_METRIC_UNITS,
      metricWindowScope: {
        sample: 'from the CDP boundary immediately before the in-page measured sample through the first CDP boundary after presentation is stopped',
        save: 'from the immediate pre-save CDP boundary through the immediate post-save CDP boundary while runtime and presentation remain stopped',
      },
      sampleMetricDelta: metricsDelta(performanceBefore, performanceAfterSample),
      saveMetricDelta: metricsDelta(performanceBeforeSave, performanceAfterSave),
      performanceBefore,
      performanceAfterSample,
      performanceBeforeSave,
      performanceAfterSave,
      pointInTimeBefore: browserBefore,
      pointInTimeAfterSample: browserAfterSample,
      pointInTimeAfterSave: browserAfterSave,
    },
  };
}

async function worldFingerprint(client) {
  const source = await client.evaluate(`(() => {
    const view = window.__TIDEWEFT__.runtime.getRenderView();
    return JSON.stringify({
      tick: view.tick,
      worldName: view.worldName,
      terrain: view.terrain,
      tide: view.tide,
      weather: view.weather,
      settlements: view.settlements,
      player: view.player,
      routes: view.routes,
      porters: view.porters,
      dogs: view.dogs ?? [],
      wildlife: view.wildlife ?? [],
      looseCargo: view.looseCargo ?? [],
    });
  })()`);
  if (typeof source !== 'string' || source.length === 0) {
    throw new Error('Could not derive the deterministic baseline-world fingerprint');
  }
  return createHash('sha256').update(source).digest('hex');
}

async function bootstrapWorld(client, seed) {
  await client.call('Runtime.enable');
  await client.call('Performance.enable');
  await client.waitFor(`Boolean(
    window.__TIDEWEFT__?.runtime
    && window.__TIDEWEFT__?.renderer
    && window.__TIDEWEFT__?.ui
    && document.querySelector('#game-ui .ui-layer')?.getAttribute('data-ready') === 'true'
  )`);
  const began = await client.evaluate(`(() => {
    const bridge = window.__TIDEWEFT__;
    const input = document.querySelector('#world-seed');
    const form = document.querySelector('.new-world-form');
    if (!(input instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) return null;
    input.value = ${JSON.stringify(seed)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    form.requestSubmit();
    bridge.runtime.stop();
    const view = bridge.runtime.getRenderView();
    return {
      tick: view.tick,
      titleVisible: bridge.runtime.getUIView().title.visible,
      worldName: view.worldName ?? null,
    };
  })()`);
  if (
    !began
    || began.titleVisible
    || !Number.isSafeInteger(began.tick)
    || began.tick < 0
  ) {
    throw new Error(`Could not freeze the isolated baseline world: ${JSON.stringify(began)}`);
  }
  // Flush the initial background save before any measured work begins.
  await client.evaluate('window.__TIDEWEFT__.runtime.save()');
  const fingerprint = await worldFingerprint(client);
  const identity = await client.evaluate(`(() => ({
    userAgent: navigator.userAgent,
    release: window.__TIDEWEFT__?.version ?? null,
    buildIdentity: window.__TIDEWEFT__?.buildIdentity ?? null,
    gameplayContract: window.__TIDEWEFT__?.gameplayContract ?? null,
  }))()`);
  const graphics = await client.evaluate(`(() => {
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('webgl2', {
        antialias: false,
        depth: false,
        stencil: false,
      }) || canvas.getContext('webgl', {
        antialias: false,
        depth: false,
        stencil: false,
      });
      if (!context) {
        return {
          available: false,
          reason: 'webgl-context-unavailable',
          scope: 'renderer-process in-page WebGL capability query',
        };
      }
      const debug = context.getExtension('WEBGL_debug_renderer_info');
      const vendor = debug
        ? context.getParameter(debug.UNMASKED_VENDOR_WEBGL)
        : context.getParameter(context.VENDOR);
      const renderer = debug
        ? context.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : context.getParameter(context.RENDERER);
      return {
        available: true,
        scope: 'renderer-process in-page WebGL capability query; not system-wide GPU inventory',
        api: typeof WebGL2RenderingContext === 'function'
          && context instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl',
        detail: debug ? 'unmasked-extension' : 'standard-context',
        vendor: typeof vendor === 'string' ? vendor : String(vendor),
        renderer: typeof renderer === 'string' ? renderer : String(renderer),
      };
    } catch (error) {
      return {
        available: false,
        reason: 'webgl-query-failed',
        errorName: error instanceof Error ? error.name : 'unknown',
        scope: 'renderer-process in-page WebGL capability query',
      };
    }
  })()`);
  return {
    fingerprint,
    identity,
    graphics,
    worldName: began.worldName,
    startTick: began.tick,
  };
}

function waitForChildExit(child, timeoutMs) {
  if (childExited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.removeListener('exit', onExit);
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    child.once('exit', onExit);
    if (childExited(child)) {
      clearTimeout(timer);
      child.removeListener('exit', onExit);
      resolve(true);
    }
  });
}

async function terminateChild(child, spawnError) {
  if (spawnError || childExited(child) || child.pid === undefined) return;
  if (process.platform === 'win32') {
    await execFileAsync('taskkill', ['/pid', String(child.pid), '/t', '/f']);
  } else {
    child.kill('SIGTERM');
    if (await waitForChildExit(child, PROCESS_SHUTDOWN_TIMEOUT_MS)) return;
    child.kill('SIGKILL');
  }
  if (!await waitForChildExit(child, PROCESS_SHUTDOWN_TIMEOUT_MS)) {
    throw new Error(`Packaged profiling process ${child.pid} did not terminate`);
  }
}

function appendBoundedOutput(current, chunk) {
  return (current + chunk).slice(-MAX_CHILD_OUTPUT_CHARACTERS);
}

async function runIsolatedScenario(executable, scenario, sampleMs) {
  const port = await openPort();
  const userDataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'tideweft-performance-'));
  const childState = { spawnError: null };
  const child = spawn(executable, [
    `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${userDataDirectory}`,
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ], {
    cwd: projectRoot,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let childOutput = '';
  let completed = false;
  let client = null;
  let signalCount = 0;
  const interrupt = () => {
    signalCount += 1;
    if (signalCount === 1 && client !== null) {
      void client.call('Browser.close', {}, 2_000).catch(() => client?.close());
      return;
    }
    if (childExited(child) || child.pid === undefined) return;
    if (process.platform === 'win32') {
      void execFileAsync('taskkill', ['/pid', String(child.pid), '/t', '/f']).catch(() => undefined);
    } else {
      child.kill(signalCount > 1 ? 'SIGKILL' : 'SIGTERM');
    }
  };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);

  child.once('error', (error) => {
    childState.spawnError = error;
  });
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (chunk) => {
    childOutput = appendBoundedOutput(childOutput, chunk);
  });
  child.stderr?.on('data', (chunk) => {
    childOutput = appendBoundedOutput(childOutput, chunk);
  });

  try {
    const page = await waitForPage(port, child, childState);
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.open();
    const bootstrap = await bootstrapWorld(client, scenario.seed);
    const measurement = await measureScenario(
      client,
      scenario,
      scenario.minimumSampleMs === undefined
        ? sampleMs
        : Math.max(sampleMs, scenario.minimumSampleMs),
    );
    completed = true;
    return { bootstrap, measurement };
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    const detail = childOutput.trim();
    if (detail) {
      failure.message += `\nPackaged process output (tail):\n${detail.slice(-4_000)}`;
    }
    throw failure;
  } finally {
    try {
      if (client !== null && !client.closed && !childExited(child)) {
        await client.call('Browser.close', {}, 2_000).catch(() => undefined);
        await waitForChildExit(child, PROCESS_SHUTDOWN_TIMEOUT_MS);
      }
      await client?.close().catch(() => undefined);
      await terminateChild(child, childState.spawnError);
      await fs.rm(userDataDirectory, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
      if (!completed && childState.spawnError && childOutput) {
        process.stderr.write(childOutput.slice(-4_000));
      }
    } finally {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
    }
  }
}

async function repositoryAtCapture() {
  try {
    const [head, status, diff] = await Promise.all([
      execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot }),
      execFileAsync('git', ['status', '--porcelain'], { cwd: projectRoot }),
      execFileAsync('git', ['diff', '--binary', 'HEAD', '--', '.', ':(exclude)artifacts'], {
        cwd: projectRoot,
        maxBuffer: 64 * 1_024 * 1_024,
      }),
    ]);
    return {
      head: head.stdout.trim(),
      dirty: status.stdout.trim().length > 0,
      trackedDiffSha256: createHash('sha256').update(diff.stdout).digest('hex'),
    };
  } catch {
    return null;
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const executable = options.executable
    ? await resolveExplicitExecutable(options.executable)
    : await packagedExecutable();
  await validateExecutable(executable);
  const packagedIdentity = await executableIdentity(executable);
  const profilerHarness = await fileIdentity(__filename);
  const scenarios = [
    {
      id: 'estuary-desktop-relief',
      label: 'Fixed estuary — desktop Relief 3D',
      seed: BASELINE_WORLD_SEED,
      worldGroup: 'estuary',
      mode: 'relief-3d',
      viewport: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
    },
    {
      id: 'estuary-desktop-chart',
      label: 'Fixed estuary — desktop Chart 2D',
      seed: BASELINE_WORLD_SEED,
      worldGroup: 'estuary',
      mode: 'chart-2d',
      viewport: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
    },
    {
      id: 'estuary-mobile-relief',
      label: 'Fixed estuary — mobile-sized Relief 3D',
      seed: BASELINE_WORLD_SEED,
      worldGroup: 'estuary',
      mode: 'relief-3d',
      viewport: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
    },
    {
      id: 'estuary-mobile-chart',
      label: 'Fixed estuary — mobile-sized Chart 2D',
      seed: BASELINE_WORLD_SEED,
      worldGroup: 'estuary',
      mode: 'chart-2d',
      viewport: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
    },
    {
      id: 'dense-biodiversity-relief',
      label: 'Near-budget biodiversity — desktop Relief 3D',
      seed: 'breathing room regional density 8',
      worldGroup: 'dense-biodiversity',
      mode: 'relief-3d',
      viewport: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
      denseBiodiversity: true,
    },
    {
      id: 'dense-biodiversity-retina-relief',
      label: 'Near-budget biodiversity — Retina desktop Relief 3D',
      seed: 'breathing room regional density 8',
      worldGroup: 'dense-biodiversity',
      mode: 'relief-3d',
      viewport: { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false },
      denseBiodiversity: true,
    },
    {
      id: 'continuous-regional-travel-relief',
      label: 'Continuous ordinary travel through three regions — desktop Relief 3D',
      seed: 'breathing-room all-tide corridor 187',
      worldGroup: 'continuous-regional-travel',
      mode: 'relief-3d',
      viewport: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
      minimumSampleMs: LONG_TRAVEL_MINIMUM_SAMPLE_MS,
      travel: {
        axis: 'y',
        direction: -1,
        segmentTiles: 26,
        routeBudgetTiles: 512,
        minimumIssuedTiles: 130,
        minimumProgressTiles: 95,
        minimumMovementSpanMs: 180_000,
        maximumInitialStationaryMs: 15_000,
        maximumStationaryTailMs: 15_000,
        maximumStationaryGapMs: 15_000,
        maximumObservedStepTiles: 4,
        requiresNegativeRegion: true,
      },
    },
  ];
  const selectedScenarios = options.scenarioId.length === 0
    ? scenarios
    : scenarios.filter(({ id }) => id === options.scenarioId);
  if (selectedScenarios.length === 0) {
    throw new Error(
      `Unknown --scenario ${JSON.stringify(options.scenarioId)}. Expected one of: `
      + scenarios.map(({ id }) => id).join(', '),
    );
  }
  const measurements = [];
  let canonicalBootstrap = null;
  const worldGroups = new Map();
  const packagedIdentityJson = JSON.stringify(packagedIdentity);
  for (const scenario of selectedScenarios) {
    const packagedBeforeScenario = await executableIdentity(executable);
    if (JSON.stringify(packagedBeforeScenario) !== packagedIdentityJson) {
      throw new Error(
        `Packaged build changed before scenario ${scenario.id}; refusing mixed-binary evidence`,
      );
    }
    process.stdout.write(`Measuring ${scenario.label}…\n`);
    const isolated = await runIsolatedScenario(executable, scenario, options.sampleMs);
    const packagedAfterScenario = await executableIdentity(executable);
    if (JSON.stringify(packagedAfterScenario) !== packagedIdentityJson) {
      throw new Error(
        `Packaged build changed during scenario ${scenario.id}; refusing mixed-binary evidence`,
      );
    }
    if (canonicalBootstrap === null) {
      canonicalBootstrap = isolated.bootstrap;
    } else if (
      JSON.stringify(isolated.bootstrap.identity) !== JSON.stringify(canonicalBootstrap.identity)
    ) {
      throw new Error(
        `Scenario ${scenario.id} did not use the same packaged build identity`,
      );
    }
    const existingWorld = worldGroups.get(scenario.worldGroup);
    if (existingWorld !== undefined && (
      isolated.bootstrap.fingerprint !== existingWorld.initialProjectionSha256
      || isolated.bootstrap.startTick !== existingWorld.startTick
      || scenario.seed !== existingWorld.seed
    )) {
      throw new Error(
        `Scenario ${scenario.id} did not reproduce world group ${scenario.worldGroup}`,
      );
    }
    if (existingWorld === undefined) {
      worldGroups.set(scenario.worldGroup, {
        seed: scenario.seed,
        name: isolated.bootstrap.worldName,
        startTick: isolated.bootstrap.startTick,
        initialProjectionSha256: isolated.bootstrap.fingerprint,
      });
    }
    measurements.push(isolated.measurement);
  }

  const result = {
    schema: 'tideweft-performance-baseline/v2',
    capturedAt: new Date().toISOString(),
    captureScope: {
      kind: selectedScenarios.length === scenarios.length
        ? 'complete-baseline'
        : 'partial-diagnostic',
      complete: selectedScenarios.length === scenarios.length,
      expectedScenarioIds: scenarios.map(({ id }) => id),
      selectedScenarioIds: selectedScenarios.map(({ id }) => id),
    },
    repositoryAtCapture: await repositoryAtCapture(),
    host: {
      platform: process.platform,
      architecture: process.arch,
      operatingSystem: {
        type: os.type(),
        release: os.release(),
        version: os.version(),
      },
      cpu: {
        model: os.cpus()[0]?.model ?? null,
        logicalCores: os.cpus().length,
      },
      totalSystemMemoryBytes: os.totalmem(),
      node: process.version,
      graphics: canonicalBootstrap.graphics,
    },
    packagedExecutable: packagedIdentity,
    profilerHarness,
    requestedSampleWindowMs: options.sampleMs,
    controlledRendererWarmupFrames: TARGET_RENDERER_WARMUP_FRAMES,
    identity: canonicalBootstrap.identity,
    worlds: Object.fromEntries(worldGroups),
    worldIsolation: {
      isolation: 'fresh packaged process and fresh user-data profile per scenario',
      clockControl: {
        sequence: 'new-world submission and runtime stop complete in the same renderer task; the queued initial save is then explicitly flushed before measurement',
        validation: 'scenarios in the same world group must match seed, observed start tick, and initial projection SHA-256; every group must share the packaged build identity',
        residualLimitation: 'the private fixed-step accumulator phase is intentionally neither inspected nor mutated',
      },
    },
    measurements,
  };
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(
    `${result.captureScope.complete ? 'Complete performance baseline' : 'Partial performance diagnostic'} `
    + `written to ${options.output}\n`,
  );
  for (const measurement of measurements) {
    process.stdout.write(
      `${measurement.id}: ${measurement.frameSample.rendererCadence.averageFps.toFixed(2)} renderer FPS average; `
      + `${measurement.frameSample.rendererCadence.p99IntervalEquivalentFps.toFixed(2)} FPS p99-gap equivalent; `
      + `${measurement.frameSample.rendererCadence.worstIntervalMs.toFixed(1)} ms worst renderer gap\n`,
    );
  }
}

main().catch((error) => {
  process.stderr.write(
    `Performance baseline failed: ${error instanceof Error ? error.stack || error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});

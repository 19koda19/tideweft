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
const HITCH_TRACE_THRESHOLD_MS = 80;
const HITCH_TRACE_RECORD_CAPACITY = 32;
const HITCH_TRACE_SNAPSHOT_CAPACITY = 16;
const MAX_CHILD_OUTPUT_CHARACTERS = 64 * 1_024;
const BASELINE_WORLD_SEED = 'runtime baseline estuary';
const RESOURCE_SHAKEDOWN_WORLD_SEED = 'breathing-room all-tide corridor 187';
const RESOURCE_SHAKEDOWN_CYCLES = 2;
const RESOURCE_SHAKEDOWN_OUTBOUND_GLOBAL_Y = -8;
const RESOURCE_SHAKEDOWN_SETTLE_MS = 5_000;
const RESOURCE_SHAKEDOWN_GC_SETTLE_MS = 1_000;
const RESOURCE_SHAKEDOWN_CYCLE_TIMEOUT_MS = 240_000;
const RESOURCE_SHAKEDOWN_ENDPOINT_TOLERANCE_TILES = 1.5;
const RESOURCE_SHAKEDOWN_MAX_OBSERVED_STEP_TILES = 4;
const RESOURCE_SOAK_MINIMUM_TRAVEL_MS = 60 * 60 * 1_000;
const RESOURCE_SOAK_MINIMUM_CYCLES = 12;
const RESOURCE_SOAK_MAXIMUM_CYCLES = 120;
const RESOURCE_SOAK_SAVE_INTERVAL_CYCLES = 4;
const RESOURCE_SOAK_PENDING_DRAIN_TIMEOUT_MS = 5_000;
const RESOURCE_SOAK_PENDING_DRAIN_POLL_MS = 100;
const RESOURCE_SOAK_SAVE_PAYLOAD_BUDGET_BYTES = 4 * 1_024 * 1_024;
const RESOURCE_SOAK_SAVE_GROWTH_BUDGET_BYTES = 512 * 1_024;
const RESOURCE_SOAK_RENDERER_HEAP_GROWTH_FLOOR_BYTES = 16 * 1_024 * 1_024;
const RESOURCE_SOAK_RENDERER_HEAP_GROWTH_FRACTION = 0.25;
const RESOURCE_SOAK_GC_CONVERGENCE_FLOOR_BYTES = 1 * 1_024 * 1_024;
const RESOURCE_SOAK_GC_CONVERGENCE_FRACTION = 0.01;
const RESOURCE_SOAK_ATTACHED_DOM_GROWTH_BUDGET = 64;
const RESOURCE_SOAK_CDP_DOM_GROWTH_BUDGET = 512;
const RESOURCE_SOAK_CLOSING_FPS_RATIO_FLOOR = 0.8;
const RESOURCE_SOAK_CLOSING_P99_RATIO_CEILING = 1.25;
const RESOURCE_CHECKPOINT_LABELS = Object.freeze([
  'pre',
  'half',
  'post',
  'settled',
  'forced-gc-1',
  'forced-gc-2',
  'post-save',
]);
const RESOURCE_SOAK_OPENING_CHECKPOINT_LABELS = Object.freeze([
  'soak-pre',
  'soak-warmup-post',
  'soak-baseline-forced-gc-1',
  'soak-baseline-forced-gc-2',
]);
const RESOURCE_SOAK_CLOSING_CHECKPOINT_LABELS = Object.freeze([
  'soak-settled',
  'soak-final-forced-gc-1',
  'soak-final-forced-gc-2',
  'soak-post-save',
]);
const RESOURCE_CHECKPOINT_POLICY_ACTIVE_FULL = Object.freeze({
  requirePendingDrained: false,
  audioGraph: 'active',
  domDetail: 'full',
});
const RESOURCE_CHECKPOINT_POLICY_SETTLED_ACTIVE_FULL = Object.freeze({
  requirePendingDrained: true,
  audioGraph: 'active',
  domDetail: 'full',
});
const RESOURCE_CHECKPOINT_POLICY_ORDINARY_FULL = Object.freeze({
  requirePendingDrained: true,
  audioGraph: 'ordinary',
  domDetail: 'full',
});
const RESOURCE_CHECKPOINT_POLICY_ORDINARY_COARSE = Object.freeze({
  requirePendingDrained: true,
  audioGraph: 'ordinary',
  domDetail: 'coarse',
});
const RESOURCE_CHECKPOINT_POLICY_COLLECTED_FULL = Object.freeze({
  requirePendingDrained: true,
  audioGraph: 'collected',
  domDetail: 'full',
});
const RESOURCE_CDP_METRIC_NAMES = Object.freeze([
  'AudioHandlers',
  'Documents',
  'Frames',
  'JSEventListeners',
  'LayoutObjects',
  'Nodes',
  'Resources',
  'ContextLifecycleStateObservers',
  'V8PerContextDatas',
  'WorkerGlobalScopes',
  'ResourceFetchers',
  'ArrayBufferContents',
  'JSHeapUsedSize',
  'JSHeapTotalSize',
]);
const RESOURCE_COUNT_FIELDS = Object.freeze({
  regions: Object.freeze([
    'loadedTerrainRegions',
    'activeEcologyRegions',
    'durableTerrainRegionRecords',
    'durableEcologyRegionRecords',
    'chartedRegionRecords',
    'inactiveCargoRegionWorlds',
  ]),
  caches: Object.freeze([
    'regionTerrainValues',
    'registeredTerrainGeneratorSeeds',
    'registeredTerrainGeneratorRegions',
    'outdoorIlluminationFields',
    'regionalHabitats',
    'alpineHabitats',
    'polarShoreHabitats',
    'coldShoreHabitats',
    'polarConsumerHabitats',
    'breadthHabitats',
    'runtimeCompatibilityHabitats',
    'alpineRidgeAuthorities',
    'polarConsumerAuthorities',
    'activityAuthorityReceipts',
    'breadthPreparationSlots',
  ]),
  pending: Object.freeze([
    'runtimeTerrainPrefetchJobs',
    'registeredTerrainPrefetchJobs',
    'queuedCommands',
    'queuedSaveSnapshots',
    'saveWaiters',
    'activeSaveWorkers',
  ]),
});
const RESOURCE_LIMIT_FIELDS = Object.freeze({
  regions: RESOURCE_COUNT_FIELDS.regions,
  caches: RESOURCE_COUNT_FIELDS.caches,
  pending: Object.freeze([
    'runtimeTerrainPrefetchJobs',
    'queuedSaveSnapshots',
    'activeSaveWorkers',
  ]),
});
const ELECTRON_PROCESS_ROLES = Object.freeze([
  'browser',
  'renderer',
  'gpu',
  'audio-service',
  'utility',
  'crashpad/zygote',
  'other',
]);
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

function retainBoundedHitchGap(records, candidate, capacity, thresholdMs) {
  if (!Array.isArray(records)) throw new TypeError('hitch records must be an array');
  if (!Number.isSafeInteger(capacity) || capacity <= 0) {
    throw new RangeError('hitch record capacity must be a positive safe integer');
  }
  if (!Number.isFinite(thresholdMs) || thresholdMs < 0) {
    throw new RangeError('hitch threshold must be a finite non-negative number');
  }
  if (
    candidate === null
    || typeof candidate !== 'object'
    || !Number.isFinite(candidate.gapMs)
    || !Number.isFinite(candidate.after?.elapsedMs)
  ) {
    throw new TypeError('hitch record must have finite gap and end time');
  }
  if (candidate.gapMs < thresholdMs) return false;
  records.push(candidate);
  records.sort((left, right) => (
    right.gapMs - left.gapMs
    || left.after.elapsedMs - right.after.elapsedMs
  ));
  if (records.length > capacity) records.length = capacity;
  return records.includes(candidate);
}

function retainBoundedHitchSnapshot(records, candidate, capacity) {
  if (!Array.isArray(records)) throw new TypeError('hitch snapshots must be an array');
  if (!Number.isSafeInteger(capacity) || capacity <= 0) {
    throw new RangeError('hitch snapshot capacity must be a positive safe integer');
  }
  if (
    candidate === null
    || typeof candidate !== 'object'
    || !Number.isFinite(candidate.elapsedMs)
    || !Number.isFinite(candidate.gapMs)
    || candidate.gapMs < 0
    || !Array.isArray(candidate.reasons)
    || candidate.reasons.length === 0
  ) {
    throw new TypeError('hitch snapshot must have finite time, gap, and at least one reason');
  }
  const isTransition = (snapshot) => snapshot.reasons.includes('canonical-region-change')
    || snapshot.reasons.includes('spatial-epoch-change');
  const isWorstWitness = (snapshot) => snapshot.reasons.includes('new-worst-gap');
  const byDiagnosticValue = (left, right) => (
    Number(isTransition(right)) - Number(isTransition(left))
    || right.gapMs - left.gapMs
    || right.elapsedMs - left.elapsedMs
  );
  records.push(candidate);
  const worstWitness = records
    .filter(isWorstWitness)
    .sort((left, right) => right.gapMs - left.gapMs || right.elapsedMs - left.elapsedMs)[0];
  records.sort(byDiagnosticValue);
  if (records.length > capacity) {
    records.length = capacity;
    if (worstWitness !== undefined && !records.includes(worstWitness)) {
      records[records.length - 1] = worstWitness;
      records.sort(byDiagnosticValue);
    }
  }
  return records.includes(candidate);
}

function buildHitchDelta(before, after) {
  const required = [
    before?.tick,
    after?.tick,
    before?.rendererFrameCount,
    after?.rendererFrameCount,
    before?.floatingGlobalTiles?.x,
    before?.floatingGlobalTiles?.y,
    after?.floatingGlobalTiles?.x,
    after?.floatingGlobalTiles?.y,
    before?.canonical?.region?.x,
    before?.canonical?.region?.y,
    after?.canonical?.region?.x,
    after?.canonical?.region?.y,
  ];
  if (!required.every(Number.isFinite)) {
    throw new TypeError('hitch witnesses must contain finite timing and position fields');
  }
  return {
    tick: after.tick - before.tick,
    rendererFrames: after.rendererFrameCount - before.rendererFrameCount,
    distanceTiles: Math.hypot(
      after.floatingGlobalTiles.x - before.floatingGlobalTiles.x,
      after.floatingGlobalTiles.y - before.floatingGlobalTiles.y,
    ),
    regionChanged: before.canonical.region.x !== after.canonical.region.x
      || before.canonical.region.y !== after.canonical.region.y,
    spatialEpochChanged: before.spatialEpoch !== after.spatialEpoch,
  };
}

function hitchSnapshotReasons(gapMs, priorWorstGapMs, delta) {
  if (!Number.isFinite(gapMs) || !Number.isFinite(priorWorstGapMs)) {
    throw new TypeError('hitch gaps must be finite');
  }
  if (delta === null || typeof delta !== 'object') {
    throw new TypeError('hitch delta is required');
  }
  const reasons = [];
  if (delta.regionChanged === true) reasons.push('canonical-region-change');
  if (delta.spatialEpochChanged === true) reasons.push('spatial-epoch-change');
  if (gapMs > priorWorstGapMs) reasons.push('new-worst-gap');
  return reasons;
}

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

function outputPath(rawOutput, defaultStem = 'runtime-baseline') {
  const resolved = rawOutput
    ? path.resolve(rawOutput)
    : path.join(
      artifactRoot,
      'performance',
      `${defaultStem}-${new Date().toISOString().replace(/[:.]/gu, '-')}.json`,
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
  let sampleMsSpecified = false;
  let scenarioId = '';
  let traceHitches = false;
  let resourceShakedown = false;
  let resourceSoak = false;

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
      sampleMsSpecified = true;
      index += 1;
    } else if (argument.startsWith('--sample-ms=')) {
      sampleMs = parseSampleMs(argument.slice('--sample-ms='.length));
      sampleMsSpecified = true;
    } else if (argument === '--scenario') {
      scenarioId = argumentValue(argv, index, '--scenario');
      index += 1;
    } else if (argument.startsWith('--scenario=')) {
      scenarioId = argument.slice('--scenario='.length);
      if (scenarioId.length === 0) throw new Error('--scenario requires a value');
    } else if (argument === '--trace-hitches') {
      traceHitches = true;
    } else if (argument === '--resource-shakedown') {
      resourceShakedown = true;
    } else if (argument === '--resource-soak') {
      resourceSoak = true;
    } else {
      throw new Error(`Unknown performance-baseline argument: ${argument}`);
    }
  }

  if (resourceShakedown && resourceSoak) {
    throw new Error('--resource-shakedown and --resource-soak are mutually exclusive');
  }
  const resourceDiagnostic = resourceShakedown || resourceSoak;
  const resourceFlag = resourceSoak ? '--resource-soak' : '--resource-shakedown';
  if (resourceDiagnostic && scenarioId.length > 0) {
    throw new Error(`${resourceFlag} cannot be combined with --scenario`);
  }
  if (resourceDiagnostic && traceHitches) {
    throw new Error(`${resourceFlag} cannot be combined with --trace-hitches`);
  }
  if (resourceDiagnostic && sampleMsSpecified) {
    throw new Error(`${resourceFlag} uses a fixed route and cannot be combined with --sample-ms`);
  }

  return {
    executable: executable ? path.resolve(executable) : '',
    output: outputPath(
      output,
      resourceSoak
        ? 'resource-soak'
        : resourceShakedown ? 'resource-shakedown' : 'runtime-baseline',
    ),
    sampleMs,
    scenarioId,
    traceHitches,
    resourceShakedown,
    resourceSoak,
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
    this.notificationListeners = new Map();
    this.notificationError = null;
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
      if (!Number.isSafeInteger(message.id)) {
        if (typeof message.method === 'string') {
          this.dispatchNotification(message.method, message.params ?? {});
        }
        return;
      }
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

  onNotification(method, listener) {
    if (typeof method !== 'string' || method.length === 0) {
      throw new TypeError('CDP notification method must be a non-empty string');
    }
    if (typeof listener !== 'function') {
      throw new TypeError('CDP notification listener must be a function');
    }
    const listeners = this.notificationListeners.get(method) ?? new Set();
    listeners.add(listener);
    this.notificationListeners.set(method, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.notificationListeners.delete(method);
    };
  }

  dispatchNotification(method, params) {
    const listeners = this.notificationListeners.get(method);
    if (listeners === undefined) return;
    for (const listener of listeners) {
      try {
        listener(params);
      } catch {
        if (this.notificationError === null) {
          this.notificationError = new Error(
            `CDP notification handler failed for ${method}`,
          );
        }
      }
    }
  }

  throwIfNotificationFailed() {
    if (this.notificationError !== null) throw this.notificationError;
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
    this.notificationListeners.clear();
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

function incrementCount(record, key) {
  record[key] = (record[key] ?? 0) + 1;
}

function sortedCountRecord(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value);
    if (typeof key === 'string' && key.length > 0) incrementCount(counts, key);
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => (
    left.localeCompare(right)
  )));
}

function createWebAudioLifecycleTracker() {
  const contexts = new Map();
  const listeners = new Set();
  const nodes = new Map();
  const params = new Set();
  const eventTotals = {};
  let unmatchedDestroyEvents = 0;
  let malformedLifecycleEvents = 0;

  const identifier = (value, field) => (
    value !== null
    && typeof value === 'object'
    && typeof value[field] === 'string'
    && value[field].length > 0
      ? value[field]
      : null
  );
  const destroy = (setOrMap, id) => {
    if (typeof id !== 'string' || id.length === 0 || !setOrMap.delete(id)) {
      unmatchedDestroyEvents += 1;
    }
  };

  return Object.freeze({
    handle(method, event = {}) {
      incrementCount(eventTotals, method);
      if (method === 'WebAudio.contextCreated' || method === 'WebAudio.contextChanged') {
        const id = identifier(event.context, 'contextId');
        if (id === null) {
          malformedLifecycleEvents += 1;
        } else {
          contexts.set(id, {
            type: typeof event.context.contextType === 'string'
              ? event.context.contextType
              : 'unknown',
            state: typeof event.context.contextState === 'string'
              ? event.context.contextState
              : 'unknown',
          });
        }
      } else if (method === 'WebAudio.contextWillBeDestroyed') {
        if (typeof event.contextId !== 'string' || event.contextId.length === 0) {
          malformedLifecycleEvents += 1;
        }
        destroy(contexts, event.contextId);
      } else if (method === 'WebAudio.audioListenerCreated') {
        const id = identifier(event.listener, 'listenerId');
        if (id === null) malformedLifecycleEvents += 1;
        else listeners.add(id);
      } else if (method === 'WebAudio.audioListenerWillBeDestroyed') {
        if (typeof event.listenerId !== 'string' || event.listenerId.length === 0) {
          malformedLifecycleEvents += 1;
        }
        destroy(listeners, event.listenerId);
      } else if (method === 'WebAudio.audioNodeCreated') {
        const id = identifier(event.node, 'nodeId');
        if (id === null) {
          malformedLifecycleEvents += 1;
        } else {
          nodes.set(id, typeof event.node.nodeType === 'string' ? event.node.nodeType : 'unknown');
        }
      } else if (method === 'WebAudio.audioNodeWillBeDestroyed') {
        if (typeof event.nodeId !== 'string' || event.nodeId.length === 0) {
          malformedLifecycleEvents += 1;
        }
        destroy(nodes, event.nodeId);
      } else if (method === 'WebAudio.audioParamCreated') {
        const id = identifier(event.param, 'paramId');
        if (id === null) malformedLifecycleEvents += 1;
        else params.add(id);
      } else if (method === 'WebAudio.audioParamWillBeDestroyed') {
        if (typeof event.paramId !== 'string' || event.paramId.length === 0) {
          malformedLifecycleEvents += 1;
        }
        destroy(params, event.paramId);
      }
    },
    snapshot() {
      return {
        scope: 'CDP WebAudio lifecycle events observed since WebAudio.enable; counts only',
        live: {
          contexts: contexts.size,
          listeners: listeners.size,
          nodes: nodes.size,
          params: params.size,
          contextsByType: sortedCountRecord(contexts.values(), ({ type }) => type),
          contextsByState: sortedCountRecord(contexts.values(), ({ state }) => state),
          nodesByType: sortedCountRecord(nodes.values(), (type) => type),
        },
        eventTotals: Object.fromEntries(
          Object.entries(eventTotals).sort(([left], [right]) => left.localeCompare(right)),
        ),
        unmatchedDestroyEvents,
        malformedLifecycleEvents,
      };
    },
  });
}

function assertWebAudioLifecycleEvidence(
  snapshot,
  checkpointLabel = 'resource checkpoint',
  graphExpectation = 'active',
) {
  if (!['active', 'ordinary', 'collected'].includes(graphExpectation)) {
    throw new TypeError('WebAudio graph expectation must be active, ordinary, or collected');
  }
  const label = RESOURCE_CHECKPOINT_LABELS.includes(checkpointLabel)
    ? `resource checkpoint ${checkpointLabel}`
    : checkpointLabel;
  const liveCountsAreValid = ['contexts', 'listeners', 'nodes', 'params'].every((key) => (
    Number.isSafeInteger(snapshot?.live?.[key]) && snapshot.live[key] >= 0
  ));
  const countRecordTotal = (record) => {
    if (record === null || typeof record !== 'object' || Array.isArray(record)) return null;
    let total = 0;
    for (const value of Object.values(record)) {
      if (!Number.isSafeInteger(value) || value < 0) return null;
      total += value;
      if (!Number.isSafeInteger(total)) return null;
    }
    return total;
  };
  const liveBreakdownsAreValid = (
    countRecordTotal(snapshot?.live?.contextsByType) === snapshot?.live?.contexts
    && countRecordTotal(snapshot?.live?.contextsByState) === snapshot?.live?.contexts
    && countRecordTotal(snapshot?.live?.nodesByType) === snapshot?.live?.nodes
  );
  const eventTotalsAreValid = (
    snapshot?.eventTotals !== null
    && typeof snapshot?.eventTotals === 'object'
    && !Array.isArray(snapshot.eventTotals)
    && Object.values(snapshot.eventTotals).every((value) => (
      Number.isSafeInteger(value) && value >= 0
    ))
  );
  const eventTotal = (method) => snapshot?.eventTotals?.[method] ?? 0;
  const lifecycleBalancesAreExact = [
    ['contexts', 'WebAudio.contextCreated', 'WebAudio.contextWillBeDestroyed'],
    ['listeners', 'WebAudio.audioListenerCreated', 'WebAudio.audioListenerWillBeDestroyed'],
    ['nodes', 'WebAudio.audioNodeCreated', 'WebAudio.audioNodeWillBeDestroyed'],
    ['params', 'WebAudio.audioParamCreated', 'WebAudio.audioParamWillBeDestroyed'],
  ].every(([liveKey, createdMethod, destroyedMethod]) => {
    const created = eventTotal(createdMethod);
    const destroyed = eventTotal(destroyedMethod);
    return Number.isSafeInteger(created)
      && created >= 0
      && Number.isSafeInteger(destroyed)
      && destroyed >= 0
      && destroyed <= created
      && created - destroyed === snapshot?.live?.[liveKey];
  });
  const persistentContextWitnessIsValid = (
    eventTotal('WebAudio.contextCreated') === 1
    && eventTotal('WebAudio.contextWillBeDestroyed') === 0
    && snapshot?.live?.contexts === 1
    && eventTotal('WebAudio.audioNodeCreated') >= 1
  );
  const checkpointGraphShapeIsValid = graphExpectation === 'collected'
    ? (
      snapshot?.live?.listeners === 0
      && snapshot?.live?.nodes === 0
      && snapshot?.live?.params === 0
    )
    : graphExpectation === 'active' ? snapshot?.live?.nodes >= 1 : true;
  if (
    !liveCountsAreValid
    || !liveBreakdownsAreValid
    || !eventTotalsAreValid
    || !lifecycleBalancesAreExact
    || !persistentContextWitnessIsValid
    || !checkpointGraphShapeIsValid
    || snapshot?.unmatchedDestroyEvents !== 0
    || snapshot?.malformedLifecycleEvents !== 0
  ) {
    throw new Error(
      `${label} did not retain a complete, internally consistent CDP WebAudio lifecycle witness`,
    );
  }
  return true;
}

const WEB_AUDIO_LIFECYCLE_METHODS = Object.freeze([
  'WebAudio.contextCreated',
  'WebAudio.contextWillBeDestroyed',
  'WebAudio.contextChanged',
  'WebAudio.audioListenerCreated',
  'WebAudio.audioListenerWillBeDestroyed',
  'WebAudio.audioNodeCreated',
  'WebAudio.audioNodeWillBeDestroyed',
  'WebAudio.audioParamCreated',
  'WebAudio.audioParamWillBeDestroyed',
  'WebAudio.nodesConnected',
  'WebAudio.nodesDisconnected',
  'WebAudio.nodeParamConnected',
  'WebAudio.nodeParamDisconnected',
]);

function attachWebAudioLifecycleTracker(client) {
  const tracker = createWebAudioLifecycleTracker();
  const unsubscribe = WEB_AUDIO_LIFECYCLE_METHODS.map((method) => (
    client.onNotification(method, (params) => tracker.handle(method, params))
  ));
  return Object.freeze({
    snapshot: () => tracker.snapshot(),
    detach: () => unsubscribe.forEach((remove) => remove()),
  });
}

function parsePosixProcessTable(source) {
  if (typeof source !== 'string') throw new TypeError('POSIX process table must be text');
  const rows = [];
  const lines = source.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim().length === 0) continue;
    const match = lines[index].match(/^\s*(\d+)\s+(\d+)\s+(-?\d+)(?:\s+(.*))?$/u);
    if (match === null) {
      throw new Error(`Invalid POSIX process table row at line ${index + 1}`);
    }
    const pid = Number(match[1]);
    const parentPid = Number(match[2]);
    const rssKibibytes = Number(match[3]);
    if (
      !Number.isSafeInteger(pid)
      || pid <= 0
      || !Number.isSafeInteger(parentPid)
      || parentPid < 0
      || !Number.isSafeInteger(rssKibibytes)
      || rssKibibytes < 0
      || !Number.isSafeInteger(rssKibibytes * 1_024)
    ) {
      throw new Error(`Invalid POSIX process table values at line ${index + 1}`);
    }
    rows.push({
      pid,
      parentPid,
      rssBytes: rssKibibytes * 1_024,
      command: match[4] ?? '',
    });
  }
  return rows;
}

function parseWindowsProcessTable(source) {
  if (typeof source !== 'string') throw new TypeError('Windows process table must be text');
  let parsed;
  try {
    parsed = JSON.parse(source.replace(/^\uFEFF/u, ''));
  } catch {
    throw new Error('Invalid Windows process table JSON');
  }
  const entries = parsed === null ? [] : (Array.isArray(parsed) ? parsed : [parsed]);
  return entries.map((entry, index) => {
    const pid = Number(entry?.ProcessId);
    const parentPid = Number(entry?.ParentProcessId);
    const rssBytes = Number(entry?.WorkingSetSize);
    if (
      !Number.isSafeInteger(pid)
      || pid <= 0
      || !Number.isSafeInteger(parentPid)
      || parentPid < 0
      || !Number.isSafeInteger(rssBytes)
      || rssBytes < 0
    ) {
      throw new Error(`Invalid Windows process table values at row ${index + 1}`);
    }
    return {
      pid,
      parentPid,
      rssBytes,
      command: typeof entry.CommandLine === 'string' ? entry.CommandLine : '',
    };
  });
}

function classifyElectronProcessRole(command, root = false) {
  if (root) return 'browser';
  const normalized = typeof command === 'string' ? command.toLowerCase() : '';
  const typeMatch = normalized.match(/(?:^|\s)--type=([^\s]+)/u);
  const type = typeMatch?.[1] ?? '';
  if (type === 'renderer') return 'renderer';
  if (type === 'gpu-process') return 'gpu';
  if (type === 'utility') {
    const utilityMatch = normalized.match(/(?:^|\s)--utility-sub-type=([^\s]+)/u);
    if ((utilityMatch?.[1] ?? '').includes('audio')) return 'audio-service';
    return 'utility';
  }
  if (
    type === 'zygote'
    || type === 'crashpad-handler'
    || normalized.includes('crashpad_handler')
    || normalized.includes('crashpad-handler')
  ) return 'crashpad/zygote';
  return 'other';
}

function aggregateElectronProcessTree(rows, rootPid, method) {
  if (!Array.isArray(rows)) throw new TypeError('Process table rows must be an array');
  if (!Number.isSafeInteger(rootPid) || rootPid <= 0) {
    throw new RangeError('Electron root PID must be a positive safe integer');
  }
  const byPid = new Map();
  const childrenByParent = new Map();
  for (const row of rows) {
    if (
      !Number.isSafeInteger(row?.pid)
      || row.pid <= 0
      || !Number.isSafeInteger(row?.parentPid)
      || row.parentPid < 0
      || !Number.isSafeInteger(row?.rssBytes)
      || row.rssBytes < 0
      || typeof row?.command !== 'string'
      || byPid.has(row.pid)
    ) {
      throw new Error('Process table contains an invalid or duplicate row');
    }
    byPid.set(row.pid, row);
    const children = childrenByParent.get(row.parentPid) ?? [];
    children.push(row.pid);
    childrenByParent.set(row.parentPid, children);
  }
  if (!byPid.has(rootPid)) throw new Error('Electron root process was absent from the process table');

  const descendants = [];
  const pending = [rootPid];
  const seen = new Set();
  while (pending.length > 0) {
    const pid = pending.shift();
    if (seen.has(pid)) continue;
    seen.add(pid);
    const row = byPid.get(pid);
    if (row === undefined) continue;
    descendants.push(row);
    pending.push(...(childrenByParent.get(pid) ?? []));
  }

  const roleTotals = Object.fromEntries(ELECTRON_PROCESS_ROLES.map((role) => [role, {
    role,
    processCount: 0,
    summedRssBytes: 0,
  }]));
  for (const row of descendants) {
    const role = classifyElectronProcessRole(row.command, row.pid === rootPid);
    roleTotals[role].processCount += 1;
    roleTotals[role].summedRssBytes += row.rssBytes;
  }
  const summedRssBytes = descendants.reduce((sum, row) => sum + row.rssBytes, 0);
  return {
    scope: 'launched Electron root and descendants present in one process-table capture',
    method,
    completeness: 'best-effort point-in-time descendant tree; process churn may race capture',
    rssInterpretation: 'summed RSS double-counts shared pages and is not unique physical memory',
    processCount: descendants.length,
    summedRssBytes,
    roles: ELECTRON_PROCESS_ROLES.map((role) => roleTotals[role]),
  };
}

function sanitizeRuntimeResourceCounts(resources) {
  if (resources === null || typeof resources !== 'object' || Array.isArray(resources)) {
    throw new Error('Resource shakedown requires performance telemetry resources');
  }
  const sanitized = {};
  for (const [group, fields] of Object.entries(RESOURCE_COUNT_FIELDS)) {
    const source = resources[group];
    if (
      source === null
      || typeof source !== 'object'
      || Array.isArray(source)
      || Object.keys(source).sort().join(',') !== [...fields].sort().join(',')
    ) {
      throw new Error(`Resource telemetry has malformed or unexpected count group ${group}`);
    }
    sanitized[group] = {};
    for (const field of fields) {
      const value = source[field];
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`Resource telemetry has invalid count ${group}.${field}`);
      }
      sanitized[group][field] = value;
    }
  }
  if (
    resources.limits === null
    || typeof resources.limits !== 'object'
    || Array.isArray(resources.limits)
    || Object.keys(resources.limits).sort().join(',') !== Object.keys(RESOURCE_LIMIT_FIELDS).sort().join(',')
  ) {
    throw new Error('Resource telemetry has malformed or unexpected limit groups');
  }
  sanitized.limits = {};
  for (const [group, fields] of Object.entries(RESOURCE_LIMIT_FIELDS)) {
    const source = resources.limits[group];
    if (
      source === null
      || typeof source !== 'object'
      || Array.isArray(source)
      || Object.keys(source).sort().join(',') !== [...fields].sort().join(',')
    ) {
      throw new Error(`Resource telemetry has malformed or unexpected ${group} limits`);
    }
    sanitized.limits[group] = {};
    for (const field of fields) {
      const limit = source[field];
      if (!Number.isSafeInteger(limit) || limit < 0) {
        throw new Error(`Resource telemetry has invalid limit ${group}.${field}`);
      }
      if (sanitized[group][field] > limit) {
        throw new Error(
          `Resource telemetry count ${group}.${field} exceeded its declared limit`,
        );
      }
      sanitized.limits[group][field] = limit;
    }
  }
  return sanitized;
}

function assertSettledResourcePendingDrained(resources, label, required = true) {
  if (!required) return true;
  const pending = resources?.pending;
  const undrained = Object.entries(pending ?? {}).filter(([, value]) => value !== 0);
  if (
    pending === null
    || typeof pending !== 'object'
    || Array.isArray(pending)
    || undrained.length > 0
  ) {
    throw new Error(
      `Resource checkpoint ${label} retained pending work: `
      + undrained.map(([field, value]) => `${field}=${value}`).join(', '),
    );
  }
  return true;
}

function resourceSoakCycleCheckpointLabel(ordinal) {
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) {
    throw new RangeError('Resource-soak cycle ordinal must be a positive safe integer');
  }
  return `soak-cycle-${String(ordinal).padStart(3, '0')}`;
}

function isResourceCheckpointLabel(label) {
  if (typeof label !== 'string') return false;
  return RESOURCE_CHECKPOINT_LABELS.includes(label)
    || RESOURCE_SOAK_OPENING_CHECKPOINT_LABELS.includes(label)
    || RESOURCE_SOAK_CLOSING_CHECKPOINT_LABELS.includes(label)
    || /^soak-cycle-\d{3}$/u.test(label);
}

function assertResourceCheckpointOrder(checkpoints) {
  if (!Array.isArray(checkpoints)) throw new TypeError('Resource checkpoints must be an array');
  const labels = checkpoints.map((checkpoint) => checkpoint?.label);
  if (
    labels.length !== RESOURCE_CHECKPOINT_LABELS.length
    || labels.some((label, index) => label !== RESOURCE_CHECKPOINT_LABELS[index])
  ) {
    throw new Error(
      `Resource checkpoint order must be ${RESOURCE_CHECKPOINT_LABELS.join(' -> ')}`,
    );
  }
  return true;
}

function assertResourceSoakCheckpointOrder(checkpoints, cycleCount) {
  if (!Array.isArray(checkpoints)) throw new TypeError('Resource-soak checkpoints must be an array');
  if (!Number.isSafeInteger(cycleCount) || cycleCount < RESOURCE_SOAK_MINIMUM_CYCLES) {
    throw new RangeError('Resource-soak cycle count is below its minimum');
  }
  const expected = [
    ...RESOURCE_SOAK_OPENING_CHECKPOINT_LABELS,
    ...Array.from(
      { length: cycleCount },
      (_, index) => resourceSoakCycleCheckpointLabel(index + 1),
    ),
    ...RESOURCE_SOAK_CLOSING_CHECKPOINT_LABELS,
  ];
  const labels = checkpoints.map((checkpoint) => checkpoint?.label);
  if (
    labels.length !== expected.length
    || labels.some((label, index) => label !== expected[index])
  ) {
    throw new Error(
      `Resource-soak checkpoint order must be ${expected.join(' -> ')}`,
    );
  }
  return true;
}

function assertNoResourceInputContamination(input, label = 'resource checkpoint') {
  const trusted = input?.trustedInputs;
  const baseline = input?.baselineViewport;
  const current = input?.currentViewport;
  const lifecycle = input?.pageLifecycle;
  const numericViewportFields = [
    'layoutWidth',
    'layoutHeight',
    'devicePixelRatio',
    'visualWidth',
    'visualHeight',
    'visualScale',
  ];
  if (
    !trusted
    || !Number.isSafeInteger(trusted.total)
    || trusted.total < 0
    || !Number.isSafeInteger(trusted.blockingTotal)
    || trusted.blockingTotal < 0
    || !['wheel', 'pointerDown', 'pointerMove', 'pointerUp', 'key', 'touch']
      .every((field) => Number.isSafeInteger(trusted[field]) && trusted[field] >= 0)
    || trusted.blockingTotal !== (
      trusted.wheel
      + trusted.pointerDown
      + trusted.pointerUp
      + trusted.key
      + trusted.touch
    )
    || trusted.total !== trusted.blockingTotal + trusted.pointerMove
    || !Number.isSafeInteger(input?.viewportChangeEvents)
    || input.viewportChangeEvents < 0
    || baseline === null
    || typeof baseline !== 'object'
    || current === null
    || typeof current !== 'object'
    || lifecycle === null
    || typeof lifecycle !== 'object'
    || typeof lifecycle.baselineVisibility !== 'string'
    || typeof lifecycle.currentVisibility !== 'string'
    || ![
      'visibilityChangeEvents',
      'hiddenTransitions',
      'pageHideEvents',
      'freezeEvents',
      'focusEvents',
      'blurEvents',
    ].every((field) => Number.isSafeInteger(lifecycle[field]) && lifecycle[field] >= 0)
    || !Number.isFinite(lifecycle.hiddenDurationMs)
    || lifecycle.hiddenDurationMs < 0
    || typeof lifecycle.baselineHasFocus !== 'boolean'
    || typeof lifecycle.currentHasFocus !== 'boolean'
  ) {
    throw new Error(`${label} returned invalid input-contamination evidence`);
  }
  const viewportDriftFields = numericViewportFields.filter((field) => {
    const left = baseline[field];
    const right = current[field];
    if (left === null || right === null) return left !== right;
    return !Number.isFinite(left) || !Number.isFinite(right) || Math.abs(left - right) > 0.001;
  });
  if (
    trusted.blockingTotal > 0
    || input.viewportChangeEvents > 0
    || viewportDriftFields.length > 0
    || lifecycle.baselineVisibility !== 'visible'
    || lifecycle.currentVisibility !== 'visible'
    || lifecycle.hiddenTransitions > 0
    || lifecycle.pageHideEvents > 0
    || lifecycle.freezeEvents > 0
  ) {
    throw new Error(
      `${label} was contaminated by trusted input, viewport/zoom drift, or a hidden/frozen page lifecycle: `
      + `trusted=${JSON.stringify(trusted)}, `
      + `viewportChangeEvents=${input.viewportChangeEvents}, `
      + `driftFields=${JSON.stringify(viewportDriftFields)}, `
      + `pageLifecycle=${JSON.stringify(lifecycle)}`,
    );
  }
  return true;
}

function assertResourceShakedownCycle(cycle, route, expectedOrdinal) {
  const expectedRegions = ['0:0', '0:-1', '0:0'];
  const allowedModes = new Set(['foot', 'wading', 'skiff', 'camp']);
  const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y);
  if (
    cycle?.schema !== 'tideweft-resource-route-cycle/v2'
    || cycle.reason !== 'complete'
    || cycle.failure !== null
    || cycle.ordinal !== expectedOrdinal
    || !Number.isFinite(cycle.durationMs)
    || cycle.durationMs <= 0
    || !Number.isSafeInteger(cycle.startTick)
    || !Number.isSafeInteger(cycle.endTick)
    || cycle.endTick <= cycle.startTick
    || !Number.isFinite(cycle.observedDistanceTiles)
    || !Number.isFinite(cycle.maxObservedStepTiles)
    || cycle.maxObservedStepTiles > RESOURCE_SHAKEDOWN_MAX_OBSERVED_STEP_TILES
    || cycle.projectionMismatchCount !== 0
    || cycle.discontinuityCount !== 0
    || !Number.isSafeInteger(cycle.targetsIssued)
    || cycle.targetsIssued < 4
    || !Array.isArray(cycle.visitedRegionKeys)
    || cycle.visitedRegionKeys.length !== expectedRegions.length
    || cycle.visitedRegionKeys.some((key, index) => key !== expectedRegions[index])
    || !Array.isArray(cycle.modesObserved)
    || cycle.modesObserved.length === 0
    || cycle.modesObserved.some((mode) => !allowedModes.has(mode))
    || cycle.presentationCadence?.scope
      !== 'requestAnimationFrame intervals observed by the ordinary route driver'
    || !Number.isSafeInteger(cycle.presentationCadence?.frameCount)
    || cycle.presentationCadence.frameCount < 2
    || !Number.isSafeInteger(cycle.presentationCadence?.intervalCount)
    || cycle.presentationCadence.intervalCount !== cycle.presentationCadence.frameCount - 1
    || !Number.isFinite(cycle.presentationCadence?.averageIntervalMs)
    || cycle.presentationCadence.averageIntervalMs <= 0
    || !Number.isFinite(cycle.presentationCadence?.averageFps)
    || cycle.presentationCadence.averageFps <= 0
    || !Number.isFinite(cycle.presentationCadence?.p99IntervalUpperBoundMs)
    || cycle.presentationCadence.p99IntervalUpperBoundMs <= 0
    || !Number.isFinite(cycle.presentationCadence?.worstIntervalMs)
    || cycle.presentationCadence.p99IntervalUpperBoundMs
      > Math.ceil(cycle.presentationCadence.worstIntervalMs)
    || !cycle.start?.projectionConsistent
    || !cycle.turn?.projectionConsistent
    || !cycle.end?.projectionConsistent
    || cycle.start?.canonicalRegion?.x !== 0
    || cycle.start?.canonicalRegion?.y !== 0
    || cycle.turn?.canonicalRegion?.x !== 0
    || cycle.turn?.canonicalRegion?.y !== -1
    || cycle.end?.canonicalRegion?.x !== 0
    || cycle.end?.canonicalRegion?.y !== 0
    || !Number.isFinite(route?.anchorGlobal?.x)
    || !Number.isFinite(route?.anchorGlobal?.y)
    || !Number.isFinite(route?.outboundGlobal?.x)
    || !Number.isFinite(route?.outboundGlobal?.y)
    || distance(cycle.start, route.anchorGlobal) > RESOURCE_SHAKEDOWN_ENDPOINT_TOLERANCE_TILES
    || distance(cycle.turn, route.outboundGlobal) > RESOURCE_SHAKEDOWN_ENDPOINT_TOLERANCE_TILES
    || distance(cycle.end, route.anchorGlobal) > RESOURCE_SHAKEDOWN_ENDPOINT_TOLERANCE_TILES
    || cycle.observedDistanceTiles < (
      Math.abs(route.anchorGlobal.y - route.outboundGlobal.y) * 2
      - RESOURCE_SHAKEDOWN_ENDPOINT_TOLERANCE_TILES * 4
    )
  ) {
    throw new Error(
      `Resource shakedown cycle ${expectedOrdinal} did not complete the absolute `
      + `0:0 -> 0:-1 -> 0:0 corridor: ${JSON.stringify(cycle)}`,
    );
  }
  return true;
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

async function captureElectronProcessTree(rootPid) {
  try {
    if (process.platform === 'win32') {
      const command = [
        'Get-CimInstance Win32_Process',
        '| Select-Object ProcessId,ParentProcessId,WorkingSetSize,CommandLine',
        '| ConvertTo-Json -Compress',
      ].join(' ');
      const result = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        command,
      ], { maxBuffer: 16 * 1_024 * 1_024 });
      return aggregateElectronProcessTree(
        parseWindowsProcessTable(result.stdout),
        rootPid,
        'Windows CIM process snapshot',
      );
    }
    const result = await execFileAsync('ps', [
      '-ww',
      '-axo',
      'pid=,ppid=,rss=,command=',
    ], { maxBuffer: 16 * 1_024 * 1_024 });
    return aggregateElectronProcessTree(
      parsePosixProcessTable(result.stdout),
      rootPid,
      'POSIX ps point-in-time process snapshot',
    );
  } catch {
    throw new Error(
      `Could not capture a sanitized Electron descendant-process RSS snapshot on ${process.platform}`,
    );
  }
}

async function installResourceInputGuard(client) {
  const evidence = await client.evaluate(`(() => {
    const property = '__TIDEWEFT_RESOURCE_SHAKEDOWN_INPUT_GUARD__';
    const prior = window[property];
    if (prior && typeof prior.dispose === 'function') prior.dispose();
    const trustedInputs = {
      total: 0,
      blockingTotal: 0,
      wheel: 0,
      pointerDown: 0,
      pointerMove: 0,
      pointerUp: 0,
      key: 0,
      touch: 0,
    };
    let viewportChangeEvents = 0;
    const viewport = () => ({
      layoutWidth: innerWidth,
      layoutHeight: innerHeight,
      devicePixelRatio,
      visualWidth: visualViewport?.width ?? null,
      visualHeight: visualViewport?.height ?? null,
      visualScale: visualViewport?.scale ?? null,
    });
    let baselineViewport = viewport();
    const baselineVisibility = document.visibilityState;
    const baselineHasFocus = document.hasFocus();
    let visibilityChangeEvents = 0;
    let hiddenTransitions = 0;
    let hiddenDurationMs = 0;
    let hiddenSince = baselineVisibility === 'hidden' ? performance.now() : null;
    let pageHideEvents = 0;
    let freezeEvents = 0;
    let focusEvents = 0;
    let blurEvents = 0;
    const listeners = [];
    const listen = (target, type, callback) => {
      target.addEventListener(type, callback, { capture: true, passive: true });
      listeners.push(() => target.removeEventListener(type, callback, { capture: true }));
    };
    const trusted = (category, blocksEvidence = true) => (event) => {
      if (!event.isTrusted) return;
      trustedInputs.total += 1;
      if (blocksEvidence) trustedInputs.blockingTotal += 1;
      trustedInputs[category] += 1;
    };
    listen(window, 'wheel', trusted('wheel'));
    listen(window, 'pointerdown', trusted('pointerDown'));
    listen(window, 'pointermove', trusted('pointerMove', false));
    listen(window, 'pointerup', trusted('pointerUp'));
    listen(window, 'keydown', trusted('key'));
    listen(window, 'keyup', trusted('key'));
    listen(window, 'touchstart', trusted('touch'));
    listen(window, 'touchmove', trusted('touch'));
    listen(window, 'touchend', trusted('touch'));
    listen(window, 'resize', () => { viewportChangeEvents += 1; });
    if (visualViewport) {
      listen(visualViewport, 'resize', () => { viewportChangeEvents += 1; });
    }
    listen(document, 'visibilitychange', () => {
      visibilityChangeEvents += 1;
      if (document.visibilityState === 'hidden' && hiddenSince === null) {
        hiddenTransitions += 1;
        hiddenSince = performance.now();
      } else if (document.visibilityState === 'visible' && hiddenSince !== null) {
        hiddenDurationMs += performance.now() - hiddenSince;
        hiddenSince = null;
      }
    });
    listen(window, 'pagehide', () => { pageHideEvents += 1; });
    listen(document, 'freeze', () => { freezeEvents += 1; });
    listen(window, 'focus', () => { focusEvents += 1; });
    listen(window, 'blur', () => { blurEvents += 1; });
    const snapshot = () => ({
      scope: 'count-only trusted browser input and viewport/zoom evidence from the stable packaged gameplay document through bootstrap and guarded measurement',
      trustedInputs: { ...trustedInputs },
      viewportChangeEvents,
      baselineViewport: { ...baselineViewport },
      currentViewport: viewport(),
      pageLifecycle: {
        baselineVisibility,
        currentVisibility: document.visibilityState,
        visibilityChangeEvents,
        hiddenTransitions,
        hiddenDurationMs: hiddenDurationMs + (
          hiddenSince === null ? 0 : performance.now() - hiddenSince
        ),
        pageHideEvents,
        freezeEvents,
        baselineHasFocus,
        currentHasFocus: document.hasFocus(),
        focusEvents,
        blurEvents,
      },
    });
    Object.defineProperty(window, property, {
      configurable: true,
      value: {
        snapshot,
        rebaseViewport: (expected) => {
          const current = viewport();
          const matchesExpected = expected
            && current.layoutWidth === expected.width
            && current.layoutHeight === expected.height
            && Math.abs(current.devicePixelRatio - expected.deviceScaleFactor) < 0.001
            && (current.visualScale === null || Math.abs(current.visualScale - 1) < 0.001);
          if (trustedInputs.blockingTotal > 0 || !matchesExpected) {
            return { ok: false, evidence: snapshot() };
          }
          baselineViewport = current;
          viewportChangeEvents = 0;
          return { ok: true, evidence: snapshot() };
        },
        dispose: () => listeners.splice(0).forEach((remove) => remove()),
      },
    });
    return snapshot();
  })()`);
  assertNoResourceInputContamination(evidence, 'resource input-guard installation');
  return evidence;
}

async function rebaseResourceInputGuardAfterViewport(client, viewport) {
  const result = await client.evaluate(`(() => {
    const guard = window.__TIDEWEFT_RESOURCE_SHAKEDOWN_INPUT_GUARD__;
    if (typeof guard?.rebaseViewport !== 'function') return null;
    return guard.rebaseViewport(${JSON.stringify(viewport)});
  })()`);
  if (!result?.ok) {
    throw new Error(
      'Guarded performance measurement received trusted input or zoom drift during controlled viewport setup: '
      + JSON.stringify(result?.evidence ?? null),
    );
  }
  assertNoResourceInputContamination(
    result.evidence,
    'resource input-guard viewport rebase',
  );
  return result.evidence;
}

async function captureInputGuardEvidence(client, label) {
  const evidence = await client.evaluate(`(() => {
    const guard = window.__TIDEWEFT_RESOURCE_SHAKEDOWN_INPUT_GUARD__;
    return typeof guard?.snapshot === 'function' ? guard.snapshot() : null;
  })()`);
  assertNoResourceInputContamination(evidence, label);
  return evidence;
}

function resourceMetricsRecord(metrics) {
  return Object.fromEntries(RESOURCE_CDP_METRIC_NAMES.map((name) => [
    name,
    Number.isFinite(metrics[name]) ? metrics[name] : null,
  ]));
}

async function resourceCheckpoint(
  client,
  rootPid,
  webAudioTracker,
  label,
  policy,
) {
  if (!isResourceCheckpointLabel(label)) {
    throw new Error(`Unknown resource checkpoint ${JSON.stringify(label)}`);
  }
  if (
    policy === null
    || typeof policy !== 'object'
    || typeof policy.requirePendingDrained !== 'boolean'
    || !['active', 'ordinary', 'collected'].includes(policy.audioGraph)
    || !['coarse', 'full'].includes(policy.domDetail)
  ) throw new Error(`Resource checkpoint ${label} requires an explicit valid policy`);
  client.throwIfNotificationFailed();
  const captureStartedAt = new Date().toISOString();
  const [performanceResult, dom, heap, page, processTree] = await Promise.all([
    client.call('Performance.getMetrics'),
    client.call('Memory.getDOMCounters'),
    client.call('Runtime.getHeapUsage'),
    client.evaluate(`(() => {
      const bridge = window.__TIDEWEFT__;
      const telemetry = bridge.runtime.getPerformanceTelemetry();
      const detail = ${JSON.stringify(policy.domDetail)};
      const elementCollection = document.getElementsByTagName('*');
      const tagCounts = {};
      const classCounts = {};
      if (detail === 'full') {
        for (const element of elementCollection) {
          const tag = element.tagName.toLowerCase();
          tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
          for (const className of element.classList) {
            classCounts[className] = (classCounts[className] ?? 0) + 1;
          }
        }
      }
      const ordered = (record) => Object.fromEntries(
        Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
      );
      const guard = window.__TIDEWEFT_RESOURCE_SHAKEDOWN_INPUT_GUARD__;
      return {
        attachedDom: {
          detail,
          elementCount: elementCollection.length,
          ...(detail === 'full' ? {
            byTag: ordered(tagCounts),
            byClass: ordered(classCounts),
          } : {}),
        },
        runtimeResources: telemetry?.resources ?? null,
        lastSerializedSaveBytes: telemetry?.lastSerializedSaveBytes ?? null,
        inputContamination: typeof guard?.snapshot === 'function' ? guard.snapshot() : null,
      };
    })()`),
    captureElectronProcessTree(rootPid),
  ]);
  client.throwIfNotificationFailed();
  if (
    !Number.isSafeInteger(dom?.documents)
    || dom.documents < 0
    || !Number.isSafeInteger(dom?.nodes)
    || dom.nodes < 0
    || !Number.isSafeInteger(dom?.jsEventListeners)
    || dom.jsEventListeners < 0
    || !Number.isSafeInteger(page?.attachedDom?.elementCount)
    || page.attachedDom.elementCount < 0
  ) {
    throw new Error(`Resource checkpoint ${label} returned invalid DOM counters`);
  }
  assertNoResourceInputContamination(page.inputContamination, `resource checkpoint ${label}`);
  const runtimeResources = sanitizeRuntimeResourceCounts(page.runtimeResources);
  assertSettledResourcePendingDrained(
    runtimeResources,
    label,
    policy.requirePendingDrained,
  );
  const performance = resourceMetricsRecord(metricsRecord(performanceResult));
  const webAudio = webAudioTracker.snapshot();
  assertWebAudioLifecycleEvidence(webAudio, label, policy.audioGraph);
  return {
    label,
    policy: { ...policy },
    captureStartedAt,
    captureFinishedAt: new Date().toISOString(),
    processTree,
    renderer: {
      scope: 'renderer-process CDP point-in-time measurements',
      performance,
      heap,
      dom: {
        cdp: dom,
        attached: page.attachedDom,
        interpretation: 'CDP Nodes minus attached element count is not labeled or treated as detached nodes',
      },
      webAudio,
      viewportAndInput: page.inputContamination,
    },
    runtimeResources,
    lastSerializedSaveBytes: Number.isSafeInteger(page.lastSerializedSaveBytes)
      && page.lastSerializedSaveBytes >= 0
      ? page.lastSerializedSaveBytes
      : null,
  };
}

async function resourceRoutePlan(client) {
  const anchor = await client.evaluate(`(() => {
    const bridge = window.__TIDEWEFT__;
    const view = bridge.runtime.getRenderView();
    const navigation = bridge.runtime.getUIView().navigation;
    const origin = view.terrain.worldTileOrigin;
    const tileSize = view.terrain.tileSize;
    const position = view.player?.position;
    if (!origin || !position || !navigation || !Number.isFinite(tileSize) || tileSize <= 0) {
      return null;
    }
    return {
      x: origin.x + position.x / tileSize,
      y: origin.y + position.y / tileSize,
      canonicalRegion: { x: navigation.regionX, y: navigation.regionY },
      canonicalGlobal: { x: navigation.globalX, y: navigation.globalY },
    };
  })()`);
  if (
    !Number.isFinite(anchor?.x)
    || !Number.isFinite(anchor?.y)
    || anchor?.canonicalRegion?.x !== 0
    || anchor?.canonicalRegion?.y !== 0
    || Math.floor(anchor.x) !== anchor?.canonicalGlobal?.x
    || Math.floor(anchor.y) !== anchor?.canonicalGlobal?.y
  ) {
    throw new Error(
      `Resource shakedown seed did not begin at the absolute 0:0 corridor anchor: `
      + JSON.stringify(anchor),
    );
  }
  return {
    scope: 'two complete ordinary-travel cycles through the absolute 0:0 <-> 0:-1 corridor',
    cycles: RESOURCE_SHAKEDOWN_CYCLES,
    anchorGlobal: { x: anchor.x, y: anchor.y },
    outboundGlobal: { x: anchor.x, y: RESOURCE_SHAKEDOWN_OUTBOUND_GLOBAL_Y },
    endpointToleranceTiles: RESOURCE_SHAKEDOWN_ENDPOINT_TOLERANCE_TILES,
    maximumObservedStepTiles: RESOURCE_SHAKEDOWN_MAX_OBSERVED_STEP_TILES,
  };
}

async function runResourceTravelCycle(client, route, ordinal) {
  const cycle = await client.evaluate(`new Promise((resolve) => {
    const bridge = window.__TIDEWEFT__;
    const route = ${JSON.stringify(route)};
    const ordinal = ${JSON.stringify(ordinal)};
    const tolerance = ${RESOURCE_SHAKEDOWN_ENDPOINT_TOLERANCE_TILES};
    const maximumStep = ${RESOURCE_SHAKEDOWN_MAX_OBSERVED_STEP_TILES};
    const segmentTiles = 26;
    const allowedModes = new Set(['foot', 'wading', 'skiff', 'camp']);
    const startedAt = performance.now();
    const startTick = bridge.runtime.getRenderView().tick;
    let phase = 'outbound';
    let issuedTarget = null;
    let previous = null;
    let start = null;
    let turn = null;
    let end = null;
    let observedDistanceTiles = 0;
    let maxObservedStepTiles = 0;
    let projectionMismatchCount = 0;
    let discontinuityCount = 0;
    let targetsIssued = 0;
    let presentationFrameCount = 0;
    let presentationIntervalCount = 0;
    let presentationIntervalTotalMs = 0;
    let presentationIntervalWorstMs = 0;
    let previousPresentationFrameAt = null;
    const presentationIntervalHistogram = new Uint32Array(1_002);
    let settled = false;
    let braceActive = false;
    const visitedRegionKeys = [];
    const modesObserved = [];
    let timeoutTimer = null;

    const position = () => {
      const view = bridge.runtime.getRenderView();
      const navigation = bridge.runtime.getUIView().navigation;
      const origin = view.terrain.worldTileOrigin;
      const tileSize = view.terrain.tileSize;
      const player = view.player?.position;
      if (
        !origin || !navigation || !player || !Number.isFinite(tileSize) || tileSize <= 0
        || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)
        || !Number.isFinite(player.x) || !Number.isFinite(player.y)
      ) return null;
      const x = origin.x + player.x / tileSize;
      const y = origin.y + player.y / tileSize;
      return {
        x,
        y,
        localX: player.x,
        localY: player.y,
        tileSize,
        columns: view.terrain.columns,
        rows: view.terrain.rows,
        worldTileOrigin: { x: origin.x, y: origin.y },
        canonicalRegion: { x: navigation.regionX, y: navigation.regionY },
        canonicalGlobal: { x: navigation.globalX, y: navigation.globalY },
        projectionConsistent: Math.floor(x) === navigation.globalX
          && Math.floor(y) === navigation.globalY,
        mode: view.player.mode,
      };
    };

    const finish = (reason, finalPosition, failure = null) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer !== null) clearTimeout(timeoutTimer);
      if (braceActive) bridge.runtime.dispatchRenderer({ type: 'brace', active: false });
      bridge.runtime.stop();
      end = finalPosition ?? position();
      const percentileUpperBound = (quantile) => {
        if (presentationIntervalCount === 0) return null;
        const target = Math.ceil(presentationIntervalCount * quantile);
        let cumulative = 0;
        for (let bucket = 0; bucket < presentationIntervalHistogram.length; bucket += 1) {
          cumulative += presentationIntervalHistogram[bucket];
          if (cumulative < target) continue;
          return bucket === presentationIntervalHistogram.length - 1
            ? presentationIntervalWorstMs
            : bucket + 1;
        }
        return presentationIntervalWorstMs;
      };
      const averageIntervalMs = presentationIntervalCount === 0
        ? null
        : presentationIntervalTotalMs / presentationIntervalCount;
      const result = {
        schema: 'tideweft-resource-route-cycle/v2',
        ordinal,
        reason,
        failure,
        durationMs: performance.now() - startedAt,
        startTick,
        endTick: bridge.runtime.getRenderView().tick,
        start,
        turn,
        end,
        observedDistanceTiles,
        maxObservedStepTiles,
        projectionMismatchCount,
        discontinuityCount,
        targetsIssued,
        visitedRegionKeys,
        modesObserved,
        presentationCadence: {
          scope: 'requestAnimationFrame intervals observed by the ordinary route driver',
          frameCount: presentationFrameCount,
          intervalCount: presentationIntervalCount,
          averageIntervalMs,
          averageFps: averageIntervalMs === null || averageIntervalMs <= 0
            ? null
            : 1_000 / averageIntervalMs,
          p99IntervalUpperBoundMs: percentileUpperBound(0.99),
          worstIntervalMs: presentationIntervalCount === 0
            ? null
            : presentationIntervalWorstMs,
        },
      };
      bridge.renderer.setActive(false);
      bridge.ui.stop();
      resolve(result);
    };

    const observe = () => {
      const current = position();
      if (current === null) return null;
      if (start === null) start = current;
      if (!current.projectionConsistent) projectionMismatchCount += 1;
      if (!modesObserved.includes(current.mode)) modesObserved.push(current.mode);
      const key = current.canonicalRegion.x + ':' + current.canonicalRegion.y;
      if (visitedRegionKeys.at(-1) !== key) visitedRegionKeys.push(key);
      const shouldBrace = current.mode === 'wading' || current.mode === 'skiff';
      if (braceActive !== shouldBrace) {
        braceActive = shouldBrace;
        bridge.runtime.dispatchRenderer({ type: 'brace', active: shouldBrace });
      }
      if (previous !== null) {
        const step = Math.hypot(current.x - previous.x, current.y - previous.y);
        if (Number.isFinite(step)) {
          observedDistanceTiles += step;
          maxObservedStepTiles = Math.max(maxObservedStepTiles, step);
          if (step > maximumStep) discontinuityCount += 1;
        }
      }
      previous = current;
      return current;
    };

    const destination = () => phase === 'outbound'
      ? route.outboundGlobal
      : route.anchorGlobal;
    const atDestination = (current, target) => (
      Math.hypot(current.x - target.x, current.y - target.y) <= tolerance
    );
    const targetReached = (current) => issuedTarget === null
      || Math.hypot(current.x - issuedTarget.x, current.y - issuedTarget.y) <= tolerance;
    const issueTarget = (current, target) => {
      const deltaY = target.y - current.y;
      const direction = Math.sign(deltaY);
      let distanceTiles = 0;
      let targetLocalY = (target.y - current.worldTileOrigin.y) * current.tileSize;
      let targetGlobalY = target.y;
      if (Math.abs(deltaY) > tolerance) {
        const safeEdge = direction > 0
          ? (current.rows - 1.5) * current.tileSize
          : 1.5 * current.tileSize;
        const availableTiles = direction > 0
          ? Math.max(0, (safeEdge - current.localY) / current.tileSize)
          : Math.max(0, (current.localY - safeEdge) / current.tileSize);
        if (availableTiles < 0.5) {
          issuedTarget = null;
          return true;
        }
        distanceTiles = Math.min(Math.abs(deltaY), segmentTiles, availableTiles);
        targetLocalY = current.localY + direction * distanceTiles * current.tileSize;
        targetGlobalY = current.y + direction * distanceTiles;
      }
      const desiredLocalX = (target.x - current.worldTileOrigin.x) * current.tileSize;
      const minimumLocalX = 1.5 * current.tileSize;
      const maximumLocalX = (current.columns - 1.5) * current.tileSize;
      if (
        (distanceTiles > 0 && distanceTiles < 0.25)
        || !Number.isFinite(desiredLocalX)
        || desiredLocalX < minimumLocalX
        || desiredLocalX > maximumLocalX
        || !Number.isFinite(targetLocalY)
      ) return false;
      issuedTarget = { x: target.x, y: targetGlobalY };
      targetsIssued += 1;
      bridge.runtime.dispatchRenderer({
        type: 'move-target',
        point: { x: desiredLocalX, y: targetLocalY },
        additive: false,
      });
      return true;
    };

    const sample = (frameAt) => {
      if (settled) return;
      presentationFrameCount += 1;
      if (previousPresentationFrameAt !== null) {
        const interval = frameAt - previousPresentationFrameAt;
        if (Number.isFinite(interval) && interval >= 0) {
          presentationIntervalCount += 1;
          presentationIntervalTotalMs += interval;
          presentationIntervalWorstMs = Math.max(presentationIntervalWorstMs, interval);
          const bucket = interval >= presentationIntervalHistogram.length - 1
            ? presentationIntervalHistogram.length - 1
            : Math.floor(interval);
          presentationIntervalHistogram[bucket] += 1;
        }
      }
      previousPresentationFrameAt = frameAt;
      const current = observe();
      if (current === null) {
        finish('invalid-position', null, { phase });
        return;
      }
      if (!allowedModes.has(current.mode)) {
        finish('invalid-mode', current, { phase, mode: current.mode });
        return;
      }
      const target = destination();
      if (atDestination(current, target)) {
        if (phase === 'outbound') {
          turn = current;
          phase = 'return';
          issuedTarget = null;
        } else {
          finish('complete', current);
          return;
        }
      }
      if (targetReached(current) && !issueTarget(current, destination())) {
        finish('target-dispatch-failed', current, { phase });
        return;
      }
      requestAnimationFrame(sample);
    };

    bridge.renderer.setActive(true);
    bridge.ui.start();
    bridge.runtime.start();
    timeoutTimer = setTimeout(() => {
      finish('cycle-timeout', position(), {
        phase,
        targetOutstanding: issuedTarget !== null,
      });
    }, ${RESOURCE_SHAKEDOWN_CYCLE_TIMEOUT_MS});
    requestAnimationFrame(sample);
  })`, RESOURCE_SHAKEDOWN_CYCLE_TIMEOUT_MS + CDP_CALL_TIMEOUT_MS);
  assertResourceShakedownCycle(cycle, route, ordinal);
  return cycle;
}

async function forceRendererGarbageCollection(client, ordinal) {
  const startedAt = new Date().toISOString();
  const monotonicStart = performance.now();
  try {
    await client.call('HeapProfiler.collectGarbage');
  } catch {
    throw new Error(
      `Renderer forced-GC request ${ordinal} was unavailable; resource shakedown refuses unforced evidence`,
    );
  }
  return {
    ordinal,
    scope: 'CDP HeapProfiler.collectGarbage in the renderer V8 isolate only',
    startedAt,
    finishedAt: new Date().toISOString(),
    requestDurationMs: performance.now() - monotonicStart,
  };
}

function assertResourceSaveSample(sample, ordinal) {
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) {
    throw new RangeError('Resource save-sample ordinal must be a positive safe integer');
  }
  if (
    !Number.isSafeInteger(sample?.tick)
    || sample.tick < 0
    || !Number.isFinite(sample?.endToEndMs)
    || sample.endToEndMs < 0
    || !Number.isSafeInteger(sample?.serializedBytes)
    || sample.serializedBytes <= 0
    || !Number.isSafeInteger(sample?.saveSnapshotCountBefore)
    || sample.saveSnapshotCountBefore < 0
    || !Number.isSafeInteger(sample?.saveSnapshotCountAfter)
    || sample.saveSnapshotCountAfter !== sample.saveSnapshotCountBefore + 1
    || !Number.isSafeInteger(sample?.synchronousSnapshot?.totalCount)
    || sample.synchronousSnapshot.totalCount !== sample.saveSnapshotCountAfter
  ) {
    throw new Error(`Resource diagnostic did not produce save sample ${ordinal}: ${JSON.stringify(sample)}`);
  }
  return true;
}

async function captureResourceSaveSample(client, ordinal, kind, afterMeasuredCycle) {
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) {
    throw new RangeError('Resource save-sample ordinal must be a positive safe integer');
  }
  if (typeof kind !== 'string' || kind.length === 0) {
    throw new TypeError('Resource save-sample kind must be non-empty text');
  }
  if (!Number.isSafeInteger(afterMeasuredCycle) || afterMeasuredCycle < 0) {
    throw new RangeError('Resource save-sample cycle must be a non-negative safe integer');
  }
  const sample = await client.evaluate(`(async () => {
    const bridge = window.__TIDEWEFT__;
    const before = bridge.runtime.getPerformanceTelemetry().saveSnapshot.totalCount;
    const startedAt = performance.now();
    await bridge.runtime.save();
    const finishedAt = performance.now();
    const telemetry = bridge.runtime.getPerformanceTelemetry();
    const view = bridge.runtime.getRenderView();
    return {
      tick: view.tick,
      endToEndMs: finishedAt - startedAt,
      serializedBytes: telemetry.lastSerializedSaveBytes,
      saveSnapshotCountBefore: before,
      saveSnapshotCountAfter: telemetry.saveSnapshot.totalCount,
      synchronousSnapshot: telemetry.saveSnapshot,
    };
  })()`);
  assertResourceSaveSample(sample, ordinal);
  return {
    ordinal,
    kind,
    afterMeasuredCycle,
    ...sample,
  };
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0 || values.some((value) => (
    !Number.isFinite(value)
  ))) throw new TypeError('Median requires a non-empty finite-number array');
  const ordered = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[midpoint - 1] + ordered[midpoint]) / 2
    : ordered[midpoint];
}

function resourceSoakCadenceSummary(cycles) {
  if (!Array.isArray(cycles) || cycles.length < RESOURCE_SOAK_MINIMUM_CYCLES) {
    throw new RangeError('Resource-soak cadence requires the minimum measured cycles');
  }
  const windowSize = Math.max(3, Math.floor(cycles.length / 4));
  const summarize = (window) => ({
    cycleCount: window.length,
    medianAverageFps: median(window.map(({ presentationCadence }) => (
      presentationCadence.averageFps
    ))),
    medianAverageIntervalMs: median(window.map(({ presentationCadence }) => (
      presentationCadence.averageIntervalMs
    ))),
    medianP99IntervalUpperBoundMs: median(window.map(({ presentationCadence }) => (
      presentationCadence.p99IntervalUpperBoundMs
    ))),
    worstIntervalMs: Math.max(...window.map(({ presentationCadence }) => (
      presentationCadence.worstIntervalMs
    ))),
  });
  const opening = summarize(cycles.slice(0, windowSize));
  const closing = summarize(cycles.slice(-windowSize));
  const medianAverageFpsRatio = closing.medianAverageFps / opening.medianAverageFps;
  const medianP99IntervalRatio = closing.medianP99IntervalUpperBoundMs
    / opening.medianP99IntervalUpperBoundMs;
  if (
    medianAverageFpsRatio < RESOURCE_SOAK_CLOSING_FPS_RATIO_FLOOR
    || medianP99IntervalRatio > RESOURCE_SOAK_CLOSING_P99_RATIO_CEILING
  ) {
    throw new Error(
      `Resource-soak closing cadence degraded beyond its same-corridor budget: `
      + `fpsRatio=${medianAverageFpsRatio}, p99Ratio=${medianP99IntervalRatio}`,
    );
  }
  return {
    scope: 'first-versus-last measured-cycle requestAnimationFrame cadence; natural world conditions are not held constant',
    windowSize,
    opening,
    closing,
    budget: {
      minimumClosingMedianAverageFpsRatio: RESOURCE_SOAK_CLOSING_FPS_RATIO_FLOOR,
      maximumClosingMedianP99IntervalRatio: RESOURCE_SOAK_CLOSING_P99_RATIO_CEILING,
    },
    medianAverageFpsRatio,
    medianP99IntervalRatio,
  };
}

function resourceSoakSaveGrowthSummary(saveSamples, finalCycleCount) {
  if (!Array.isArray(saveSamples) || saveSamples.length < 2) {
    throw new RangeError('Resource-soak save growth requires at least two samples');
  }
  const expectedCycles = [0];
  for (
    let cycle = RESOURCE_SOAK_SAVE_INTERVAL_CYCLES;
    cycle < finalCycleCount;
    cycle += RESOURCE_SOAK_SAVE_INTERVAL_CYCLES
  ) expectedCycles.push(cycle);
  expectedCycles.push(finalCycleCount);
  expectedCycles.push(finalCycleCount);
  expectedCycles.push(finalCycleCount);
  if (
    saveSamples.length !== expectedCycles.length
    || saveSamples.some((sample, index) => (
      sample.ordinal !== index + 1
      || sample.afterMeasuredCycle !== expectedCycles[index]
      || (index > 0 && sample.tick < saveSamples[index - 1].tick)
    ))
  ) throw new Error('Resource-soak save samples do not match their deterministic cadence');
  const finalSample = saveSamples.at(-3);
  const stationaryRepeats = saveSamples.slice(-2);
  if (
    finalSample.kind !== 'final'
    || stationaryRepeats.length !== 2
    || stationaryRepeats.some((sample, index) => (
      sample.kind !== `stationary-repeat-${index + 1}`
      || sample.tick !== finalSample.tick
      || sample.serializedBytes !== finalSample.serializedBytes
    ))
  ) {
    throw new Error('Resource-soak stopped-world save tail changed tick or payload length');
  }
  const bytes = saveSamples.map(({ serializedBytes }) => serializedBytes);
  const minimumBytes = Math.min(...bytes);
  const maximumBytes = Math.max(...bytes);
  const rangeBytes = maximumBytes - minimumBytes;
  const deltaBytes = bytes.at(-1) - bytes[0];
  if (
    maximumBytes > RESOURCE_SOAK_SAVE_PAYLOAD_BUDGET_BYTES
    || rangeBytes > RESOURCE_SOAK_SAVE_GROWTH_BUDGET_BYTES
    || Math.abs(deltaBytes) > RESOURCE_SOAK_SAVE_GROWTH_BUDGET_BYTES
  ) {
    throw new Error(
      `Resource-soak save growth exceeded its bounded witness budget: `
      + `max=${maximumBytes}, range=${rangeBytes}, delta=${deltaBytes}`,
    );
  }
  return {
    scope: 'exact UTF-8 bytes of periodic serialized worldJson payloads; excludes storage-record and database overhead',
    sampleCount: saveSamples.length,
    budget: {
      maximumPayloadBytes: RESOURCE_SOAK_SAVE_PAYLOAD_BUDGET_BYTES,
      maximumRangeBytes: RESOURCE_SOAK_SAVE_GROWTH_BUDGET_BYTES,
      maximumAbsoluteEndpointDeltaBytes: RESOURCE_SOAK_SAVE_GROWTH_BUDGET_BYTES,
    },
    minimumBytes,
    maximumBytes,
    rangeBytes,
    initialBytes: bytes[0],
    finalBytes: bytes.at(-1),
    deltaBytes,
    stoppedWorldRepeat: {
      tick: finalSample.tick,
      sampleCount: 3,
      byteLengths: [
        finalSample.serializedBytes,
        ...stationaryRepeats.map(({ serializedBytes }) => serializedBytes),
      ],
      exactLengthMatch: true,
    },
  };
}

function assertResourceSoakMeasurement({
  route,
  warmupCycle,
  measuredCycles,
  measuredTravelDurationMs,
  saveSamples,
  checkpoints,
}) {
  if (!Array.isArray(measuredCycles) || measuredCycles.length < RESOURCE_SOAK_MINIMUM_CYCLES) {
    throw new Error('Resource-soak measurement did not complete its minimum cycle count');
  }
  assertResourceShakedownCycle(warmupCycle, route, 0);
  let summedTravelDurationMs = 0;
  let priorCycle = warmupCycle;
  for (let index = 0; index < measuredCycles.length; index += 1) {
    const cycle = measuredCycles[index];
    assertResourceShakedownCycle(cycle, route, index + 1);
    if (cycle.startTick !== priorCycle.endTick) {
      throw new Error(
        `Resource-soak cycle ${index + 1} did not continue from the prior authoritative tick`,
      );
    }
    summedTravelDurationMs += cycle.durationMs;
    priorCycle = cycle;
  }
  if (
    !Number.isFinite(measuredTravelDurationMs)
    || measuredTravelDurationMs < RESOURCE_SOAK_MINIMUM_TRAVEL_MS
    || Math.abs(measuredTravelDurationMs - summedTravelDurationMs) > 0.001
  ) throw new Error('Resource-soak measurement did not reconcile sixty active travel minutes');

  const progressionSamples = saveSamples.filter(({ kind }) => (
    !kind.startsWith('stationary-repeat-')
  ));
  if (progressionSamples[0]?.kind !== 'baseline') {
    throw new Error('Resource-soak save series did not begin from the warmed baseline');
  }
  for (let index = 0; index < progressionSamples.length; index += 1) {
    const sample = progressionSamples[index];
    const expectedTick = sample.afterMeasuredCycle === 0
      ? warmupCycle.endTick
      : measuredCycles[sample.afterMeasuredCycle - 1]?.endTick;
    if (
      sample.tick !== expectedTick
      || (index > 0 && sample.tick <= progressionSamples[index - 1].tick)
    ) throw new Error('Resource-soak progression-save ticks were missing or non-increasing');
  }
  assertResourceSoakCheckpointOrder(checkpoints, measuredCycles.length);
  for (const checkpoint of checkpoints) {
    assertNoResourceInputContamination(
      checkpoint?.renderer?.viewportAndInput,
      `resource-soak checkpoint ${checkpoint?.label ?? 'unknown'}`,
    );
  }
  return true;
}

function resourceSoakRetentionSummary(checkpoints) {
  const byLabel = new Map(checkpoints.map((checkpoint) => [checkpoint.label, checkpoint]));
  const baselineFirst = byLabel.get('soak-baseline-forced-gc-1');
  const baseline = byLabel.get('soak-baseline-forced-gc-2');
  const finalFirst = byLabel.get('soak-final-forced-gc-1');
  const final = byLabel.get('soak-final-forced-gc-2');
  if (
    baselineFirst === undefined
    || baseline === undefined
    || finalFirst === undefined
    || final === undefined
  ) {
    throw new Error('Resource-soak retention summary is missing forced-GC bookends');
  }
  const baselineFirstHeap = baselineFirst.renderer?.heap?.usedSize;
  const baselineHeap = baseline.renderer?.heap?.usedSize;
  const finalFirstHeap = finalFirst.renderer?.heap?.usedSize;
  const finalHeap = final.renderer?.heap?.usedSize;
  const baselineAttached = baseline.renderer?.dom?.attached?.elementCount;
  const finalAttached = final.renderer?.dom?.attached?.elementCount;
  const baselineNodes = baseline.renderer?.dom?.cdp?.nodes;
  const finalNodes = final.renderer?.dom?.cdp?.nodes;
  if (
    !Number.isFinite(baselineFirstHeap)
    || baselineFirstHeap < 0
    || !Number.isFinite(baselineHeap)
    || baselineHeap < 0
    || !Number.isFinite(finalFirstHeap)
    || finalFirstHeap < 0
    || !Number.isFinite(finalHeap)
    || finalHeap < 0
    || !Number.isSafeInteger(baselineAttached)
    || !Number.isSafeInteger(finalAttached)
    || !Number.isSafeInteger(baselineNodes)
    || !Number.isSafeInteger(finalNodes)
  ) throw new Error('Resource-soak retention bookends are malformed');
  const rendererHeapDeltaBytes = finalHeap - baselineHeap;
  const attachedDomDelta = finalAttached - baselineAttached;
  const cdpNodeDelta = finalNodes - baselineNodes;
  const rendererHeapGrowthBudgetBytes = Math.max(
    RESOURCE_SOAK_RENDERER_HEAP_GROWTH_FLOOR_BYTES,
    baselineHeap * RESOURCE_SOAK_RENDERER_HEAP_GROWTH_FRACTION,
  );
  const baselineGcConvergenceBudgetBytes = Math.max(
    RESOURCE_SOAK_GC_CONVERGENCE_FLOOR_BYTES,
    baselineFirstHeap * RESOURCE_SOAK_GC_CONVERGENCE_FRACTION,
  );
  const finalGcConvergenceBudgetBytes = Math.max(
    RESOURCE_SOAK_GC_CONVERGENCE_FLOOR_BYTES,
    finalFirstHeap * RESOURCE_SOAK_GC_CONVERGENCE_FRACTION,
  );
  const baselineGcConvergenceDeltaBytes = Math.abs(baselineHeap - baselineFirstHeap);
  const finalGcConvergenceDeltaBytes = Math.abs(finalHeap - finalFirstHeap);
  if (
    rendererHeapDeltaBytes > rendererHeapGrowthBudgetBytes
    || attachedDomDelta > RESOURCE_SOAK_ATTACHED_DOM_GROWTH_BUDGET
    || cdpNodeDelta > RESOURCE_SOAK_CDP_DOM_GROWTH_BUDGET
    || baselineGcConvergenceDeltaBytes > baselineGcConvergenceBudgetBytes
    || finalGcConvergenceDeltaBytes > finalGcConvergenceBudgetBytes
  ) {
    throw new Error(
      `Resource-soak forced-GC bookends exceeded their bounded growth budget: `
      + `heap=${rendererHeapDeltaBytes}/${rendererHeapGrowthBudgetBytes}, `
      + `attached=${attachedDomDelta}, nodes=${cdpNodeDelta}, `
      + `baselineGc=${baselineGcConvergenceDeltaBytes}/${baselineGcConvergenceBudgetBytes}, `
      + `finalGc=${finalGcConvergenceDeltaBytes}/${finalGcConvergenceBudgetBytes}`,
    );
  }
  return {
    scope: 'renderer-only forced-GC bookends after one warmup corridor cycle and after the measured soak; not process-wide leak proof',
    budget: {
      rendererHeapGrowthFloorBytes: RESOURCE_SOAK_RENDERER_HEAP_GROWTH_FLOOR_BYTES,
      rendererHeapGrowthFraction: RESOURCE_SOAK_RENDERER_HEAP_GROWTH_FRACTION,
      maximumRendererHeapGrowthBytes: rendererHeapGrowthBudgetBytes,
      gcConvergenceFloorBytes: RESOURCE_SOAK_GC_CONVERGENCE_FLOOR_BYTES,
      gcConvergenceFraction: RESOURCE_SOAK_GC_CONVERGENCE_FRACTION,
      maximumAttachedDomGrowth: RESOURCE_SOAK_ATTACHED_DOM_GROWTH_BUDGET,
      maximumCdpNodeGrowth: RESOURCE_SOAK_CDP_DOM_GROWTH_BUDGET,
    },
    baseline: {
      firstRendererHeapUsedBytes: baselineFirstHeap,
      rendererHeapUsedBytes: baselineHeap,
      gcConvergenceDeltaBytes: baselineGcConvergenceDeltaBytes,
      gcConvergenceBudgetBytes: baselineGcConvergenceBudgetBytes,
      attachedDomElements: baselineAttached,
      cdpNodes: baselineNodes,
      descendantProcessSummedRssBytes: baseline.processTree.summedRssBytes,
    },
    final: {
      firstRendererHeapUsedBytes: finalFirstHeap,
      rendererHeapUsedBytes: finalHeap,
      gcConvergenceDeltaBytes: finalGcConvergenceDeltaBytes,
      gcConvergenceBudgetBytes: finalGcConvergenceBudgetBytes,
      attachedDomElements: finalAttached,
      cdpNodes: finalNodes,
      descendantProcessSummedRssBytes: final.processTree.summedRssBytes,
    },
    delta: {
      rendererHeapUsedBytes: rendererHeapDeltaBytes,
      attachedDomElements: attachedDomDelta,
      cdpNodes: cdpNodeDelta,
      descendantProcessSummedRssBytes:
        final.processTree.summedRssBytes - baseline.processTree.summedRssBytes,
    },
  };
}

async function waitForResourcePendingDrain(client, label) {
  const startedAt = performance.now();
  let pollCount = 0;
  let latest = null;
  while (performance.now() - startedAt <= RESOURCE_SOAK_PENDING_DRAIN_TIMEOUT_MS) {
    pollCount += 1;
    latest = sanitizeRuntimeResourceCounts(await client.evaluate(`(() => (
      window.__TIDEWEFT__.runtime.getPerformanceTelemetry().resources
    ))()`));
    const pending = Object.entries(latest.pending).filter(([, value]) => value !== 0);
    if (pending.length === 0) {
      return {
        label,
        pollCount,
        durationMs: performance.now() - startedAt,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, RESOURCE_SOAK_PENDING_DRAIN_POLL_MS));
  }
  throw new Error(
    `Resource soak pending work did not drain for ${label}: `
    + Object.entries(latest?.pending ?? {}).map(([key, value]) => `${key}=${value}`).join(', '),
  );
}

async function measureResourceShakedown(client, scenario, rootPid, webAudioTracker) {
  await requirePerformanceInstrumentation(client, scenario);
  const controlledWarmupFrames = await warmTargetRenderer(client, scenario, true);
  await preparePerformanceInstrumentation(client, scenario);
  const route = await resourceRoutePlan(client);
  const checkpoints = [];
  const cycles = [];
  const forcedGarbageCollections = [];

  checkpoints.push(await resourceCheckpoint(
    client,
    rootPid,
    webAudioTracker,
    'pre',
    RESOURCE_CHECKPOINT_POLICY_ACTIVE_FULL,
  ));
  cycles.push(await runResourceTravelCycle(client, route, 1));
  checkpoints.push(await resourceCheckpoint(
    client,
    rootPid,
    webAudioTracker,
    'half',
    RESOURCE_CHECKPOINT_POLICY_ACTIVE_FULL,
  ));
  cycles.push(await runResourceTravelCycle(client, route, 2));
  checkpoints.push(await resourceCheckpoint(
    client,
    rootPid,
    webAudioTracker,
    'post',
    RESOURCE_CHECKPOINT_POLICY_ACTIVE_FULL,
  ));

  await new Promise((resolve) => setTimeout(resolve, RESOURCE_SHAKEDOWN_SETTLE_MS));
  checkpoints.push(await resourceCheckpoint(
    client,
    rootPid,
    webAudioTracker,
    'settled',
    RESOURCE_CHECKPOINT_POLICY_SETTLED_ACTIVE_FULL,
  ));

  try {
    await client.call('HeapProfiler.enable');
  } catch {
    throw new Error(
      'Renderer HeapProfiler domain was unavailable; resource shakedown refuses unforced evidence',
    );
  }
  try {
    forcedGarbageCollections.push(await forceRendererGarbageCollection(client, 1));
    await new Promise((resolve) => setTimeout(resolve, RESOURCE_SHAKEDOWN_GC_SETTLE_MS));
    checkpoints.push(await resourceCheckpoint(
      client,
      rootPid,
      webAudioTracker,
      'forced-gc-1',
      RESOURCE_CHECKPOINT_POLICY_COLLECTED_FULL,
    ));
    forcedGarbageCollections.push(await forceRendererGarbageCollection(client, 2));
    await new Promise((resolve) => setTimeout(resolve, RESOURCE_SHAKEDOWN_GC_SETTLE_MS));
    checkpoints.push(await resourceCheckpoint(
      client,
      rootPid,
      webAudioTracker,
      'forced-gc-2',
      RESOURCE_CHECKPOINT_POLICY_COLLECTED_FULL,
    ));
  } finally {
    await client.call('HeapProfiler.disable').catch(() => undefined);
  }

  const saveSample = await captureResourceSaveSample(
    client,
    1,
    'post-shakedown',
    RESOURCE_SHAKEDOWN_CYCLES,
  );
  checkpoints.push(await resourceCheckpoint(
    client,
    rootPid,
    webAudioTracker,
    'post-save',
    RESOURCE_CHECKPOINT_POLICY_COLLECTED_FULL,
  ));
  assertResourceCheckpointOrder(checkpoints);
  return {
    schema: 'tideweft-performance-resource-shakedown-measurement/v1',
    id: scenario.id,
    label: scenario.label,
    seed: scenario.seed,
    mode: scenario.mode,
    viewport: scenario.viewport,
    controlledWarmupFrames,
    route,
    cycles,
    settle: {
      durationMs: RESOURCE_SHAKEDOWN_SETTLE_MS,
      scope: 'runtime, renderer, and UI loops remained stopped',
    },
    forcedGarbageCollections,
    saveSample,
    checkpoints,
    interpretation: {
      scope: 'bounded two-cycle instrumentation shakedown, not a prolonged soak or leak-freedom proof',
      forcedGc: 'renderer V8 only; Electron browser, GPU, audio, and utility processes were not forced',
      rss: 'summed descendant RSS double-counts shared pages and is not unique physical memory',
      dom: 'CDP Nodes and attached element counts are independent observations; their difference is not called detached nodes',
      webAudio: 'CDP lifecycle observations are diagnostic and enabling the domain may add instrumentation overhead',
      runtimeResources: 'primitive counts cover selected exposed retained owners only; they are not an exhaustive inventory of process-wide retention',
      terrainRegistry: 'registered terrain-generator and job counts exclude generators or jobs retained solely by external closures and are not exhaustive process-wide terrain-retention evidence',
      saveBytes: 'UTF-8 byte length of the serialized world JSON payload, not total storage-record or on-disk bytes',
      pointInTimeNoise: 'DOM and heap checkpoint calls are concurrent diagnostic observations; the page-side attached-element inventory allocates temporary observation records',
    },
  };
}

async function measureResourceSoak(client, scenario, rootPid, webAudioTracker) {
  await requirePerformanceInstrumentation(client, scenario);
  const controlledWarmupFrames = await warmTargetRenderer(client, scenario, true);
  await preparePerformanceInstrumentation(client, scenario);
  const shakedownRoute = await resourceRoutePlan(client);
  const route = {
    ...shakedownRoute,
    scope: 'one warmup cycle followed by at least sixty aggregate active-travel minutes through the absolute 0:0 <-> 0:-1 corridor, with bounded stopped checkpoint/save intervals',
    cycles: {
      warmup: 1,
      measuredMinimum: RESOURCE_SOAK_MINIMUM_CYCLES,
      measuredMaximum: RESOURCE_SOAK_MAXIMUM_CYCLES,
      minimumMeasuredTravelMs: RESOURCE_SOAK_MINIMUM_TRAVEL_MS,
    },
  };
  const checkpoints = [];
  const measuredCycles = [];
  const saveSamples = [];
  const pendingDrainSamples = [];
  const forcedGarbageCollections = [];
  const measurementStartedAt = new Date().toISOString();
  const measurementMonotonicStart = performance.now();

  pendingDrainSamples.push(await waitForResourcePendingDrain(client, 'soak-pre'));
  checkpoints.push(await resourceCheckpoint(
    client,
    rootPid,
    webAudioTracker,
    'soak-pre',
    RESOURCE_CHECKPOINT_POLICY_ORDINARY_FULL,
  ));
  const warmupCycle = await runResourceTravelCycle(client, route, 0);
  process.stdout.write(
    `Resource soak warmup cycle complete in ${(warmupCycle.durationMs / 1_000).toFixed(1)} s\n`,
  );
  pendingDrainSamples.push(await waitForResourcePendingDrain(client, 'soak-warmup-post'));
  checkpoints.push(await resourceCheckpoint(
    client,
    rootPid,
    webAudioTracker,
    'soak-warmup-post',
    RESOURCE_CHECKPOINT_POLICY_ORDINARY_FULL,
  ));
  saveSamples.push(await captureResourceSaveSample(client, 1, 'baseline', 0));
  pendingDrainSamples.push(await waitForResourcePendingDrain(client, 'soak-baseline-save'));
  await new Promise((resolve) => setTimeout(resolve, RESOURCE_SHAKEDOWN_SETTLE_MS));
  pendingDrainSamples.push(await waitForResourcePendingDrain(client, 'soak-baseline-settled'));

  try {
    await client.call('HeapProfiler.enable');
  } catch {
    throw new Error(
      'Renderer HeapProfiler domain was unavailable; resource soak refuses unbookended evidence',
    );
  }
  try {
    forcedGarbageCollections.push(await forceRendererGarbageCollection(client, 1));
    await new Promise((resolve) => setTimeout(resolve, RESOURCE_SHAKEDOWN_GC_SETTLE_MS));
    checkpoints.push(await resourceCheckpoint(
      client,
      rootPid,
      webAudioTracker,
      'soak-baseline-forced-gc-1',
      RESOURCE_CHECKPOINT_POLICY_COLLECTED_FULL,
    ));
    forcedGarbageCollections.push(await forceRendererGarbageCollection(client, 2));
    await new Promise((resolve) => setTimeout(resolve, RESOURCE_SHAKEDOWN_GC_SETTLE_MS));
    checkpoints.push(await resourceCheckpoint(
      client,
      rootPid,
      webAudioTracker,
      'soak-baseline-forced-gc-2',
      RESOURCE_CHECKPOINT_POLICY_COLLECTED_FULL,
    ));
  } finally {
    await client.call('HeapProfiler.disable').catch(() => undefined);
  }

  let measuredTravelDurationMs = 0;
  while (
    measuredCycles.length < RESOURCE_SOAK_MINIMUM_CYCLES
    || measuredTravelDurationMs < RESOURCE_SOAK_MINIMUM_TRAVEL_MS
  ) {
    if (measuredCycles.length >= RESOURCE_SOAK_MAXIMUM_CYCLES) {
      throw new Error(
        `Resource soak reached ${RESOURCE_SOAK_MAXIMUM_CYCLES} cycles before its `
        + `${RESOURCE_SOAK_MINIMUM_TRAVEL_MS} ms active-travel minimum`,
      );
    }
    const ordinal = measuredCycles.length + 1;
    const cycle = await runResourceTravelCycle(client, route, ordinal);
    measuredCycles.push(cycle);
    measuredTravelDurationMs += cycle.durationMs;
    const complete = measuredCycles.length >= RESOURCE_SOAK_MINIMUM_CYCLES
      && measuredTravelDurationMs >= RESOURCE_SOAK_MINIMUM_TRAVEL_MS;
    if (!complete && ordinal % RESOURCE_SOAK_SAVE_INTERVAL_CYCLES === 0) {
      saveSamples.push(await captureResourceSaveSample(
        client,
        saveSamples.length + 1,
        'periodic',
        ordinal,
      ));
    }
    pendingDrainSamples.push(await waitForResourcePendingDrain(
      client,
      resourceSoakCycleCheckpointLabel(ordinal),
    ));
    checkpoints.push(await resourceCheckpoint(
      client,
      rootPid,
      webAudioTracker,
      resourceSoakCycleCheckpointLabel(ordinal),
      RESOURCE_CHECKPOINT_POLICY_ORDINARY_COARSE,
    ));
    process.stdout.write(
      `Resource soak measured cycle ${ordinal} complete; `
      + `${(measuredTravelDurationMs / 60_000).toFixed(2)} active travel minutes\n`,
    );
  }

  saveSamples.push(await captureResourceSaveSample(
    client,
    saveSamples.length + 1,
    'final',
    measuredCycles.length,
  ));
  pendingDrainSamples.push(await waitForResourcePendingDrain(client, 'soak-final-save'));
  for (let ordinal = 1; ordinal <= 2; ordinal += 1) {
    saveSamples.push(await captureResourceSaveSample(
      client,
      saveSamples.length + 1,
      `stationary-repeat-${ordinal}`,
      measuredCycles.length,
    ));
    pendingDrainSamples.push(await waitForResourcePendingDrain(
      client,
      `soak-stationary-repeat-${ordinal}`,
    ));
  }
  await new Promise((resolve) => setTimeout(resolve, RESOURCE_SHAKEDOWN_SETTLE_MS));
  pendingDrainSamples.push(await waitForResourcePendingDrain(client, 'soak-settled'));
  checkpoints.push(await resourceCheckpoint(
    client,
    rootPid,
    webAudioTracker,
    'soak-settled',
    RESOURCE_CHECKPOINT_POLICY_ORDINARY_FULL,
  ));
  try {
    await client.call('HeapProfiler.enable');
  } catch {
    throw new Error(
      'Renderer HeapProfiler domain was unavailable; resource soak refuses unbookended evidence',
    );
  }
  try {
    forcedGarbageCollections.push(await forceRendererGarbageCollection(client, 3));
    await new Promise((resolve) => setTimeout(resolve, RESOURCE_SHAKEDOWN_GC_SETTLE_MS));
    checkpoints.push(await resourceCheckpoint(
      client,
      rootPid,
      webAudioTracker,
      'soak-final-forced-gc-1',
      RESOURCE_CHECKPOINT_POLICY_COLLECTED_FULL,
    ));
    forcedGarbageCollections.push(await forceRendererGarbageCollection(client, 4));
    await new Promise((resolve) => setTimeout(resolve, RESOURCE_SHAKEDOWN_GC_SETTLE_MS));
    checkpoints.push(await resourceCheckpoint(
      client,
      rootPid,
      webAudioTracker,
      'soak-final-forced-gc-2',
      RESOURCE_CHECKPOINT_POLICY_COLLECTED_FULL,
    ));
  } finally {
    await client.call('HeapProfiler.disable').catch(() => undefined);
  }

  checkpoints.push(await resourceCheckpoint(
    client,
    rootPid,
    webAudioTracker,
    'soak-post-save',
    RESOURCE_CHECKPOINT_POLICY_COLLECTED_FULL,
  ));
  assertResourceSoakMeasurement({
    route,
    warmupCycle,
    measuredCycles,
    measuredTravelDurationMs,
    saveSamples,
    checkpoints,
  });
  const saveGrowth = resourceSoakSaveGrowthSummary(saveSamples, measuredCycles.length);
  const retention = resourceSoakRetentionSummary(checkpoints);
  const cadence = resourceSoakCadenceSummary(measuredCycles);
  return {
    schema: 'tideweft-performance-resource-soak-measurement/v1',
    id: scenario.id,
    label: scenario.label,
    seed: scenario.seed,
    mode: scenario.mode,
    viewport: scenario.viewport,
    controlledWarmupFrames,
    measurementStartedAt,
    measurementFinishedAt: new Date().toISOString(),
    elapsedHarnessMs: performance.now() - measurementMonotonicStart,
    route,
    warmupCycle,
    measuredCycles,
    measuredTravelDurationMs,
    saveSamples,
    saveGrowth,
    cadence,
    pendingDrainSamples,
    settle: {
      pendingDrainTimeoutMs: RESOURCE_SOAK_PENDING_DRAIN_TIMEOUT_MS,
      pendingDrainPollMs: RESOURCE_SOAK_PENDING_DRAIN_POLL_MS,
      baselineDurationMs: RESOURCE_SHAKEDOWN_SETTLE_MS,
      finalDurationMs: RESOURCE_SHAKEDOWN_SETTLE_MS,
      scope: 'runtime, renderer, and UI loops remained stopped while bounded polling proved selected pending work drained; symmetric baseline/final stopped settles preceded their forced-GC bookends',
    },
    forcedGarbageCollections,
    checkpoints,
    retention,
    interpretation: {
      scope: 'one warmed corridor plus at least sixty aggregate active-travel minutes of repeated ordinary packaged Relief travel, bounded stopped checkpoint/save intervals, and successful saves with exact UTF-8 payload byte lengths',
      cadence: 'first-versus-last route-driver requestAnimationFrame observations include changing weather, light, water, actors, and movement mode; they are trend evidence, not controlled scene equivalence',
      forcedGc: 'renderer V8 only at warmed baseline and final bookends; Electron browser, GPU, audio, and utility processes were not forced',
      ordinaryGc: 'intermediate cycle checkpoints are unforced observations, but forced-GC bookends mean this is not proof of an entirely untouched process lifecycle',
      rss: 'summed descendant RSS double-counts shared pages and is not unique physical memory',
      dom: 'CDP Nodes and attached element counts are independent observations; their difference is not called detached nodes',
      webAudio: 'CDP lifecycle observations are diagnostic and enabling the domain may add instrumentation overhead',
      runtimeResources: 'primitive counts cover selected exposed retained owners only; they are not an exhaustive inventory of process-wide retention',
      terrainRegistry: 'registered terrain-generator and job counts exclude generators or jobs retained solely by external closures and are not exhaustive process-wide terrain-retention evidence',
      saveBytes: 'UTF-8 byte lengths cover serialized worldJson payloads only; the stopped-world tail proves equal lengths, not payload-byte identity, and excludes total storage-record, database, or on-disk bytes',
      routeBreadth: 'the repeated signed two-region corridor audits accumulation and cleanup but not broad unique-region growth, other seeds, Chart, mobile, or other operating systems',
      pointInTimeNoise: 'DOM, heap, and process-tree checkpoints are concurrent diagnostic observations and page-side inventories allocate temporary observation records',
    },
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

async function warmTargetRenderer(client, scenario, viewportAlreadyPrepared = false) {
  if (!viewportAlreadyPrepared) await setViewport(client, scenario.viewport);
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

function assertMeasurementTelemetry(scenario, frameSample, traceHitches) {
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
    if (traceHitches === true) {
      const hitchTrace = frameSample.hitchTrace;
      if (
        hitchTrace?.schema !== 'tideweft-hitch-trace/v1'
        || hitchTrace.thresholdMs !== HITCH_TRACE_THRESHOLD_MS
        || hitchTrace.recordCapacity !== HITCH_TRACE_RECORD_CAPACITY
        || hitchTrace.telemetrySnapshotCapacity !== HITCH_TRACE_SNAPSHOT_CAPACITY
        || !Number.isSafeInteger(hitchTrace.observedOverThreshold)
        || hitchTrace.observedOverThreshold < 0
        || !Number.isFinite(hitchTrace.worstGapMs)
        || hitchTrace.worstGapMs < 0
        || !Number.isSafeInteger(hitchTrace.discarded)
        || hitchTrace.discarded < 0
        || !Array.isArray(hitchTrace.records)
        || hitchTrace.records.length > HITCH_TRACE_RECORD_CAPACITY
        || hitchTrace.discarded !== hitchTrace.observedOverThreshold - hitchTrace.records.length
        || !Array.isArray(hitchTrace.snapshots)
        || hitchTrace.snapshots.length > HITCH_TRACE_SNAPSHOT_CAPACITY
      ) {
        throw new Error(
          `Scenario ${scenario.id} returned an invalid bounded hitch trace: `
          + JSON.stringify(hitchTrace),
        );
      }
      const allowedSnapshotReasons = new Set([
        'canonical-region-change',
        'spatial-epoch-change',
        'new-worst-gap',
      ]);
      for (let index = 0; index < hitchTrace.records.length; index += 1) {
        const record = hitchTrace.records[index];
        let expectedDelta = null;
        try {
          expectedDelta = buildHitchDelta(record?.before, record?.after);
        } catch {
          expectedDelta = null;
        }
        const heap = record?.after?.heap;
        if (
          !Number.isFinite(record?.gapMs)
          || record.gapMs < HITCH_TRACE_THRESHOLD_MS
          || !Number.isFinite(record?.priorTelemetrySnapshotCaptureCostMs)
          || record.priorTelemetrySnapshotCaptureCostMs < 0
          || !Number.isFinite(record?.before?.elapsedMs)
          || !Number.isFinite(record?.after?.elapsedMs)
          || record.after.elapsedMs < record.before.elapsedMs
          || !Number.isSafeInteger(record?.before?.browserRafOrdinal)
          || !Number.isSafeInteger(record?.after?.browserRafOrdinal)
          || record.after.browserRafOrdinal <= record.before.browserRafOrdinal
          || !Number.isSafeInteger(record?.before?.tick)
          || !Number.isSafeInteger(record?.after?.tick)
          || record.after.tick < record.before.tick
          || !Number.isSafeInteger(record?.before?.rendererFrameCount)
          || !Number.isSafeInteger(record?.after?.rendererFrameCount)
          || record.after.rendererFrameCount < record.before.rendererFrameCount
          || expectedDelta === null
          || !Number.isFinite(record?.delta?.tick)
          || record.delta.tick !== expectedDelta.tick
          || !Number.isFinite(record?.delta?.rendererFrames)
          || record.delta.rendererFrames !== expectedDelta.rendererFrames
          || !Number.isFinite(record?.delta?.distanceTiles)
          || record.delta.distanceTiles < 0
          || record.delta.distanceTiles !== expectedDelta.distanceTiles
          || record?.delta?.regionChanged !== expectedDelta.regionChanged
          || record?.delta?.spatialEpochChanged !== expectedDelta.spatialEpochChanged
          || !(
            heap === null
            || (
              heap !== null
              && typeof heap === 'object'
              && Number.isFinite(heap.used)
              && heap.used >= 0
              && Number.isFinite(heap.total)
              && heap.total >= heap.used
            )
          )
          || (index > 0
            && hitchTrace.records[index - 1].after.elapsedMs > record.after.elapsedMs)
        ) {
          throw new Error(
            `Scenario ${scenario.id} returned a malformed hitch record: ${JSON.stringify(record)}`,
          );
        }
      }
      for (let index = 0; index < hitchTrace.snapshots.length; index += 1) {
        const snapshot = hitchTrace.snapshots[index];
        const reasons = Array.isArray(snapshot?.reasons) ? snapshot.reasons : [];
        const uniqueReasons = new Set(reasons);
        if (
          !Number.isFinite(snapshot?.elapsedMs)
          || !Number.isFinite(snapshot?.gapMs)
          || snapshot.gapMs < 0
          || !Number.isFinite(snapshot?.captureCostMs)
          || snapshot.captureCostMs < 0
          || !Array.isArray(snapshot?.reasons)
          || reasons.length === 0
          || uniqueReasons.size !== reasons.length
          || reasons.some((reason) => !allowedSnapshotReasons.has(reason))
          || snapshot?.runtime === null
          || typeof snapshot?.runtime !== 'object'
          || snapshot?.renderer === null
          || typeof snapshot?.renderer !== 'object'
          || snapshot?.ui === null
          || typeof snapshot?.ui !== 'object'
          || (index > 0
            && hitchTrace.snapshots[index - 1].elapsedMs > snapshot.elapsedMs)
        ) {
          throw new Error(
            `Scenario ${scenario.id} returned a malformed hitch snapshot: `
            + JSON.stringify(snapshot),
          );
        }
      }
      const retainedWorstSnapshot = hitchTrace.snapshots
        .filter(({ reasons }) => reasons.includes('new-worst-gap'))
        .sort((left, right) => right.gapMs - left.gapMs)[0];
      if (
        (hitchTrace.observedOverThreshold === 0 && hitchTrace.worstGapMs !== 0)
        || (
          hitchTrace.observedOverThreshold > 0
          && (
            hitchTrace.worstGapMs < HITCH_TRACE_THRESHOLD_MS
            || retainedWorstSnapshot?.gapMs !== hitchTrace.worstGapMs
          )
        )
      ) {
        throw new Error(
          `Scenario ${scenario.id} did not retain its worst hitch witness: `
          + JSON.stringify(hitchTrace),
        );
      }
    } else if (Object.hasOwn(frameSample, 'hitchTrace')) {
      throw new Error(`Scenario ${scenario.id} emitted an opt-in hitch trace while disabled`);
    }
  }
}

async function measureScenario(
  client,
  scenario,
  sampleMs,
  traceHitches,
  viewportAlreadyPrepared = false,
) {
  await requirePerformanceInstrumentation(client, scenario);
  const warmupFrames = await warmTargetRenderer(client, scenario, viewportAlreadyPrepared);
  await preparePerformanceInstrumentation(client, scenario);
  const browserBefore = await browserPointInTime(client);
  const performanceBefore = metricsRecord(await client.call('Performance.getMetrics'));
  const frameSample = await client.evaluate(`new Promise((resolve) => {
    const bridge = window.__TIDEWEFT__;
    const requestedMode = ${JSON.stringify(scenario.mode)};
    const travelConfig = ${JSON.stringify(scenario.travel ?? null)};
    const hitchTraceEnabled = ${JSON.stringify(traceHitches)} && travelConfig !== null;
    const retainBoundedHitchGap = ${retainBoundedHitchGap.toString()};
    const retainBoundedHitchSnapshot = ${retainBoundedHitchSnapshot.toString()};
    const buildHitchDelta = ${buildHitchDelta.toString()};
    const hitchSnapshotReasons = ${hitchSnapshotReasons.toString()};
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
    const hitchTrace = hitchTraceEnabled ? {
      thresholdMs: ${HITCH_TRACE_THRESHOLD_MS},
      recordCapacity: ${HITCH_TRACE_RECORD_CAPACITY},
      telemetrySnapshotCapacity: ${HITCH_TRACE_SNAPSHOT_CAPACITY},
      observedOverThreshold: 0,
      worstGapMs: 0,
      records: [],
      snapshots: [],
    } : null;
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
    let priorSnapshotCaptureCostMs = 0;
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
    if (hitchTraceEnabled && travel !== null) travel.spatialEpochTransitions = [];
    let previousTravelObservation = null;
    let previousTravelMode = null;
    const globalPlayer = (elapsedMs, rendererFrameCount, browserRafOrdinal) => {
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
      const result = {
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
      if (hitchTraceEnabled) {
        Object.assign(result, {
          elapsedMs,
          browserRafOrdinal,
          rendererFrameCount,
          tick: view.tick,
          windowOrigin: { x: origin.x, y: origin.y },
          windowPositionUnits: { x: playerPosition.x, y: playerPosition.y },
          floatingGlobalTiles: { x, y },
          canonical: {
            region: { x: navigation.regionX, y: navigation.regionY },
            local: { x: navigation.localX, y: navigation.localY },
            global: { x: navigation.globalX, y: navigation.globalY },
          },
        });
      }
      return result;
    };
    const observeTravel = (elapsedMs, rendererFrameCount, browserRafOrdinal) => {
      if (travel === null) return null;
      const position = globalPlayer(elapsedMs, rendererFrameCount, browserRafOrdinal);
      if (position === null) return null;
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
        if (
          hitchTrace !== null
          && previousTravelObservation.spatialEpoch !== position.spatialEpoch
        ) {
          travel.spatialEpochTransitions.push({
            elapsedMs,
            from: previousTravelObservation.spatialEpoch,
            to: position.spatialEpoch,
            global: { x: position.x, y: position.y },
            canonicalRegion: position.canonicalRegion,
          });
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
          return position;
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
          return position;
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
      return position;
    };
    observeTravel(0, initialRendererFrameCount, 0);
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
      if (hitchTrace !== null) {
        result.hitchTrace = {
          schema: 'tideweft-hitch-trace/v1',
          thresholdMs: hitchTrace.thresholdMs,
          recordCapacity: hitchTrace.recordCapacity,
          telemetrySnapshotCapacity: hitchTrace.telemetrySnapshotCapacity,
          observedOverThreshold: hitchTrace.observedOverThreshold,
          worstGapMs: hitchTrace.worstGapMs,
          discarded: hitchTrace.observedOverThreshold - hitchTrace.records.length,
          records: [...hitchTrace.records].sort(
            (left, right) => left.after.elapsedMs - right.after.elapsedMs,
          ),
          snapshots: [...hitchTrace.snapshots].sort(
            (left, right) => left.elapsedMs - right.elapsedMs,
          ),
        };
      }
      // Stop presentation only after taking its immutable end-of-window snapshot.
      bridge.renderer.setActive(false);
      bridge.ui.stop();
      resolve(result);
    };
    setTimeout(finish, expectedDurationMs);
    const sample = (now) => {
      if (settled) return;
      const gapMs = priorBrowserRafAt === null ? null : now - priorBrowserRafAt;
      if (gapMs !== null) browserRafGaps.push(gapMs);
      priorBrowserRafAt = now;
      browserRafCallbacks += 1;
      const rendererTelemetry = bridge.renderer.telemetry();
      const rendererFrameCount = rendererTelemetry.frameCount;
      const before = previousTravelObservation;
      const after = observeTravel(
        performance.now() - startedAt,
        rendererFrameCount,
        browserRafCallbacks,
      );
      const observerCostBeforeGapMs = priorSnapshotCaptureCostMs;
      priorSnapshotCaptureCostMs = 0;
      if (hitchTrace !== null && gapMs !== null && before !== null && after !== null) {
        const delta = buildHitchDelta(before, after);
        const reasons = hitchSnapshotReasons(
          gapMs,
          gapMs < hitchTrace.thresholdMs ? gapMs : hitchTrace.worstGapMs,
          delta,
        );
        if (gapMs >= hitchTrace.thresholdMs) {
          hitchTrace.observedOverThreshold += 1;
          const record = {
            gapMs,
            priorTelemetrySnapshotCaptureCostMs: observerCostBeforeGapMs,
            before,
            after,
            delta,
          };
          const retained = retainBoundedHitchGap(
            hitchTrace.records,
            record,
            hitchTrace.recordCapacity,
            hitchTrace.thresholdMs,
          );
          if (retained) {
            const memory = performance.memory;
            record.after = {
              ...after,
              heap: memory ? {
                used: memory.usedJSHeapSize,
                total: memory.totalJSHeapSize,
              } : null,
            };
          }
          hitchTrace.worstGapMs = Math.max(hitchTrace.worstGapMs, gapMs);
        }
        if (reasons.length > 0) {
          const snapshot = {
            reasons,
            elapsedMs: after.elapsedMs,
            gapMs,
          };
          const retained = retainBoundedHitchSnapshot(
            hitchTrace.snapshots,
            snapshot,
            hitchTrace.telemetrySnapshotCapacity,
          );
          if (retained) {
            const captureStartedAt = performance.now();
            Object.assign(snapshot, {
              runtime: bridge.runtime.getPerformanceTelemetry(),
              renderer: rendererTelemetry,
              ui: bridge.ui.getPerformanceTelemetry(),
            });
            snapshot.captureCostMs = performance.now() - captureStartedAt;
            priorSnapshotCaptureCostMs = snapshot.captureCostMs;
          }
        }
      }
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
  assertMeasurementTelemetry(scenario, frameSample, traceHitches);

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
  const viewportAndInput = traceHitches
    ? await captureInputGuardEvidence(client, `hitch trace ${scenario.id}`)
    : null;

  return {
    id: scenario.id,
    label: scenario.label,
    seed: scenario.seed,
    worldGroup: scenario.worldGroup,
    controlledWarmupFrames: warmupFrames,
    frameSample,
    saveSample,
    snapshot,
    ...(viewportAndInput === null ? {} : { viewportAndInput }),
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

async function waitForStablePackagedGameplayDocument(client) {
  return client.waitFor(`Boolean(
    location.protocol === 'app:'
    && location.hostname === 'bundle'
    && window.__TIDEWEFT__?.runtime
    && window.__TIDEWEFT__?.renderer
    && window.__TIDEWEFT__?.ui
    && document.querySelector('#game-ui .ui-layer')?.getAttribute('data-ready') === 'true'
  )`);
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

async function runIsolatedScenario(
  executable,
  scenario,
  sampleMs,
  traceHitches,
  resourceShakedown = false,
  resourceSoak = false,
) {
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
  let webAudioTracker = null;
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
    const strictInputGuard = resourceShakedown || resourceSoak || traceHitches;
    if (strictInputGuard) {
      // CDP discovery can observe the final app:// URL before its first
      // renderer document has finished initializing. Wait for that stable
      // gameplay document so the guard cannot be lost with the startup
      // execution context before controlled viewport setup or bootstrap.
      await waitForStablePackagedGameplayDocument(client);
      await client.waitFor(`document.visibilityState === 'visible'`);
      await installResourceInputGuard(client);
    }
    if (resourceShakedown || resourceSoak) {
      webAudioTracker = attachWebAudioLifecycleTracker(client);
      try {
        await client.call('WebAudio.enable');
      } catch {
        throw new Error(
          'CDP WebAudio lifecycle instrumentation was unavailable; resource diagnostic cannot continue',
        );
      }
    }
    if (strictInputGuard) {
      await setViewport(client, scenario.viewport);
      await rebaseResourceInputGuardAfterViewport(client, scenario.viewport);
    }
    const bootstrap = await bootstrapWorld(client, scenario.seed);
    const measurement = resourceSoak
      ? await measureResourceSoak(
        client,
        scenario,
        child.pid,
        webAudioTracker,
      )
      : resourceShakedown ? await measureResourceShakedown(
        client,
        scenario,
        child.pid,
        webAudioTracker,
      )
      : await measureScenario(
        client,
        scenario,
        scenario.minimumSampleMs === undefined
          ? sampleMs
          : Math.max(sampleMs, scenario.minimumSampleMs),
        traceHitches,
        traceHitches,
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
      if ((resourceShakedown || resourceSoak) && client !== null && !client.closed) {
        await client.call('WebAudio.disable').catch(() => undefined);
      }
      webAudioTracker?.detach();
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
  const resourceScenario = {
    id: 'repeated-region-resource-shakedown-relief',
    label: 'Two-cycle absolute 0:0 <-> 0:-1 resource shakedown — desktop Relief 3D',
    seed: RESOURCE_SHAKEDOWN_WORLD_SEED,
    worldGroup: 'repeated-region-resource-shakedown',
    mode: 'relief-3d',
    viewport: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
  };
  const resourceSoakScenario = {
    id: 'prolonged-repeated-region-resource-soak-relief',
    label: 'At least sixty active travel minutes across absolute 0:0 <-> 0:-1 — desktop Relief 3D',
    seed: RESOURCE_SHAKEDOWN_WORLD_SEED,
    worldGroup: 'prolonged-repeated-region-resource-soak',
    mode: 'relief-3d',
    viewport: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
  };
  const selectedScenarios = options.resourceSoak
    ? [resourceSoakScenario]
    : options.resourceShakedown ? [resourceScenario]
    : options.scenarioId.length === 0
      ? scenarios
      : scenarios.filter(({ id }) => id === options.scenarioId);
  if (selectedScenarios.length === 0) {
    throw new Error(
      `Unknown --scenario ${JSON.stringify(options.scenarioId)}. Expected one of: `
      + scenarios.map(({ id }) => id).join(', '),
    );
  }
  if (options.traceHitches && !selectedScenarios.some(({ travel }) => travel !== undefined)) {
    throw new Error('--trace-hitches requires a selected travel scenario');
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
    const isolated = await runIsolatedScenario(
      executable,
      scenario,
      options.sampleMs,
      options.traceHitches,
      options.resourceShakedown,
      options.resourceSoak,
    );
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

  const commonResult = {
    capturedAt: new Date().toISOString(),
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
  };
  const result = options.resourceSoak ? {
    schema: 'tideweft-performance-resource-soak/v1',
    ...commonResult,
    captureScope: {
      kind: 'resource-soak',
      complete: true,
      expectedScenarioIds: [resourceSoakScenario.id],
      selectedScenarioIds: [resourceSoakScenario.id],
    },
    instrumentation: {
      minimumActiveTravelMs: RESOURCE_SOAK_MINIMUM_TRAVEL_MS,
      minimumMeasuredCycles: RESOURCE_SOAK_MINIMUM_CYCLES,
      maximumMeasuredCycles: RESOURCE_SOAK_MAXIMUM_CYCLES,
      saveIntervalCycles: RESOURCE_SOAK_SAVE_INTERVAL_CYCLES,
      processMemory: 'best-effort point-in-time launched-Electron-root descendant-tree summed RSS grouped by role; shared pages are double-counted and process churn can race capture',
      trustedInputGuard: 'installed once the final packaged gameplay document is ready and before controlled viewport setup or world bootstrap; passive pointer movement is counted as hover evidence, while trusted presses/clicks, wheel, keys, touch, or subsequent viewport/DPR/visualViewport-scale drift fail the run',
      runtimeResources: 'selected exposed retained owners only; registered terrain counts exclude generators/jobs retained solely by external closures',
    },
    measurements,
  } : options.resourceShakedown ? {
    schema: 'tideweft-performance-resource-shakedown/v1',
    ...commonResult,
    captureScope: {
      kind: 'resource-shakedown',
      complete: true,
      expectedScenarioIds: [resourceScenario.id],
      selectedScenarioIds: [resourceScenario.id],
    },
    instrumentation: {
      checkpoints: RESOURCE_CHECKPOINT_LABELS,
      cycles: RESOURCE_SHAKEDOWN_CYCLES,
      processMemory: 'best-effort point-in-time launched-Electron-root descendant-tree summed RSS grouped by role; shared pages are double-counted and process churn can race capture',
      trustedInputGuard: 'installed once the final packaged gameplay document is ready and before controlled viewport setup or world bootstrap; passive pointer movement is counted as hover evidence, while trusted presses/clicks, wheel, keys, touch, or subsequent viewport/DPR/visualViewport-scale drift fail the run',
      runtimeResources: 'selected exposed retained owners only; registered terrain counts exclude generators/jobs retained solely by external closures',
    },
    measurements,
  } : {
    schema: 'tideweft-performance-baseline/v2',
    ...commonResult,
    captureScope: {
      kind: selectedScenarios.length === scenarios.length
        ? 'complete-baseline'
        : 'partial-diagnostic',
      complete: selectedScenarios.length === scenarios.length,
      expectedScenarioIds: scenarios.map(({ id }) => id),
      selectedScenarioIds: selectedScenarios.map(({ id }) => id),
    },
    requestedSampleWindowMs: options.sampleMs,
    measurements,
  };
  if (options.traceHitches) {
    result.hitchTraceEnabled = true;
    result.instrumentation = {
      trustedInputGuard: 'installed once the final packaged gameplay document is ready and before controlled viewport setup or world bootstrap; passive pointer movement is counted as hover evidence, while trusted presses/clicks, wheel, keys, touch, or subsequent viewport/DPR/visualViewport-scale drift fail the run',
      pageLifecycleGuard: 'requires a visible document throughout guarded measurement; hidden transitions, pagehide, or freeze invalidate evidence, while focus/blur is retained as context rather than treated as contamination',
      backgroundExecutionPolicy: {
        launchSwitches: [
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--disable-backgrounding-occluded-windows',
        ],
        limitation: 'ordinary operating-system window overlap is not directly observable; launch switches mitigate background and occlusion scheduling, while page lifecycle evidence rejects hidden, pagehide, or frozen documents',
      },
    };
  }
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  if (options.resourceSoak) {
    process.stdout.write(`Resource soak written to ${options.output}\n`);
    process.stdout.write(
      `${measurements[0].id}: ${measurements[0].measuredCycles.length} measured corridor cycles; `
      + `${(measurements[0].measuredTravelDurationMs / 60_000).toFixed(2)} active travel minutes; `
      + `${measurements[0].saveSamples.length} exact save samples\n`,
    );
  } else if (options.resourceShakedown) {
    process.stdout.write(`Resource shakedown written to ${options.output}\n`);
    process.stdout.write(
      `${measurements[0].id}: ${measurements[0].cycles.length} complete corridor cycles; `
      + `${measurements[0].checkpoints.length} resource checkpoints\n`,
    );
  } else {
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
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(
      `Performance baseline failed: ${error instanceof Error ? error.stack || error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}

module.exports = {
  CdpClient,
  ELECTRON_PROCESS_ROLES,
  HITCH_TRACE_RECORD_CAPACITY,
  HITCH_TRACE_SNAPSHOT_CAPACITY,
  HITCH_TRACE_THRESHOLD_MS,
  RESOURCE_CHECKPOINT_LABELS,
  RESOURCE_SOAK_MINIMUM_CYCLES,
  RESOURCE_SOAK_MINIMUM_TRAVEL_MS,
  RESOURCE_SOAK_SAVE_GROWTH_BUDGET_BYTES,
  RESOURCE_SOAK_SAVE_INTERVAL_CYCLES,
  RESOURCE_SOAK_SAVE_PAYLOAD_BUDGET_BYTES,
  RESOURCE_SHAKEDOWN_CYCLES,
  aggregateElectronProcessTree,
  assertNoResourceInputContamination,
  assertResourceCheckpointOrder,
  assertResourceSaveSample,
  assertResourceSoakCheckpointOrder,
  assertResourceSoakMeasurement,
  assertResourceShakedownCycle,
  assertSettledResourcePendingDrained,
  assertWebAudioLifecycleEvidence,
  buildHitchDelta,
  captureInputGuardEvidence,
  classifyElectronProcessRole,
  createWebAudioLifecycleTracker,
  forceRendererGarbageCollection,
  hitchSnapshotReasons,
  parseArguments,
  parsePosixProcessTable,
  parseWindowsProcessTable,
  resourceSoakCadenceSummary,
  resourceSoakCycleCheckpointLabel,
  resourceSoakRetentionSummary,
  resourceSoakSaveGrowthSummary,
  retainBoundedHitchGap,
  retainBoundedHitchSnapshot,
  sanitizeRuntimeResourceCounts,
};

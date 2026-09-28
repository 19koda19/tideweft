'use strict';

const { createHash } = require('node:crypto');
const { createReadStream } = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');

const {
  assertGuardedBaselineMeasurements,
  bootstrapWorldDocument,
  captureInputGuardEvidence,
  installResourceInputGuard,
  measureScenario,
  rebaseResourceInputGuardAfterViewport,
  repositoryAtCapture,
} = require('./performance-baseline.cjs');
const { createPagesServer, normalizeBasePath } = require('./pages-server.cjs');

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const artifactRoot = path.join(projectRoot, 'artifacts');
const DEFAULT_SAMPLE_MS = 30_000;
const MINIMUM_SAMPLE_MS = 5_000;
const CALL_TIMEOUT_MS = 45_000;
const BOOT_TIMEOUT_MS = 60_000;
const PROCESS_SHUTDOWN_TIMEOUT_MS = 10_000;
const MAX_PROCESS_OUTPUT_CHARACTERS = 64 * 1_024;
const BASE_PATH = '/tideweft/';
const WORLD_SEED = 'runtime baseline estuary';
const SCENARIO = Object.freeze({
  id: 'browser-estuary-desktop-relief',
  label: 'Production web browser — fixed estuary desktop Relief 3D',
  seed: WORLD_SEED,
  worldGroup: 'estuary',
  mode: 'relief-3d',
  viewport: Object.freeze({
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  }),
});
const DIAGNOSTIC_PROPERTY = '__TIDEWEFT_BROWSER_PERFORMANCE_DIAGNOSTICS__';
const HARNESS_FILES = Object.freeze({
  browserPerformance: __filename,
  performanceBaseline: require.resolve('./performance-baseline.cjs'),
  pagesServer: require.resolve('./pages-server.cjs'),
});

function parseWholeNumber(rawValue, label, minimum, maximum) {
  if (!/^\d+$/u.test(rawValue)) {
    throw new Error(`${label} must be a whole number from ${minimum} through ${maximum}`);
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be a whole number from ${minimum} through ${maximum}`);
  }
  return value;
}

function requiredArgumentValue(argv, index, label) {
  const value = argv[index + 1];
  if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
    throw new Error(`${label} requires a value`);
  }
  return value;
}

function artifactJsonPath(rawValue, label, defaultStem = null) {
  const resolved = rawValue
    ? path.resolve(rawValue)
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
    throw new Error(`${label} must name a .json file under the ignored artifacts/ directory`);
  }
  return resolved;
}

function pathIsWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

async function validateArtifactPath(rawValue, label, { mustExist = false } = {}) {
  const resolved = artifactJsonPath(rawValue, label);
  const rootMetadata = await fs.lstat(artifactRoot);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    throw new Error('artifacts/ must be a real directory, not a symbolic link');
  }
  const realRoot = await fs.realpath(artifactRoot);
  const relative = path.relative(artifactRoot, resolved);
  const components = relative.split(path.sep).filter(Boolean);
  let current = artifactRoot;
  let lastExisting = artifactRoot;
  let targetMetadata = null;
  let missing = false;
  for (let index = 0; index < components.length; index += 1) {
    current = path.join(current, components[index]);
    if (missing) continue;
    let metadata;
    try {
      metadata = await fs.lstat(current);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      missing = true;
      continue;
    }
    if (metadata.isSymbolicLink()) {
      throw new Error(`${label} must not traverse or name a symbolic link`);
    }
    if (index < components.length - 1 && !metadata.isDirectory()) {
      throw new Error(`${label} has a non-directory path component`);
    }
    lastExisting = current;
    if (index === components.length - 1) targetMetadata = metadata;
  }
  if (mustExist && missing) throw new Error(`${label} does not exist`);
  if (mustExist && !targetMetadata?.isFile()) throw new Error(`${label} must name a regular file`);
  if (!mustExist && targetMetadata !== null && !targetMetadata.isFile()) {
    throw new Error(`${label} must name a regular file or a new file location`);
  }
  const realExisting = await fs.realpath(mustExist ? resolved : lastExisting);
  if (!pathIsWithin(realRoot, realExisting)) {
    throw new Error(`${label} resolves outside the artifacts/ directory`);
  }
  return resolved;
}

async function existingPathsShareFileIdentity(left, right) {
  let leftReal;
  let rightReal;
  try {
    [leftReal, rightReal] = await Promise.all([fs.realpath(left), fs.realpath(right)]);
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
  if (leftReal === rightReal) return true;
  const [leftMetadata, rightMetadata] = await Promise.all([
    fs.stat(leftReal, { bigint: true }),
    fs.stat(rightReal, { bigint: true }),
  ]);
  return leftMetadata.ino !== 0n
    && leftMetadata.dev === rightMetadata.dev
    && leftMetadata.ino === rightMetadata.ino;
}

function parseArguments(argv) {
  let browserExecutable = process.env.TIDEWEFT_FIREFOX_EXECUTABLE || '';
  let packagedBaseline = '';
  let output = '';
  let sampleMs = DEFAULT_SAMPLE_MS;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--browser-executable') {
      browserExecutable = requiredArgumentValue(argv, index, '--browser-executable');
      index += 1;
    } else if (argument.startsWith('--browser-executable=')) {
      browserExecutable = argument.slice('--browser-executable='.length);
      if (browserExecutable.length === 0) throw new Error('--browser-executable requires a value');
    } else if (argument === '--packaged-baseline') {
      packagedBaseline = requiredArgumentValue(argv, index, '--packaged-baseline');
      index += 1;
    } else if (argument.startsWith('--packaged-baseline=')) {
      packagedBaseline = argument.slice('--packaged-baseline='.length);
      if (packagedBaseline.length === 0) throw new Error('--packaged-baseline requires a value');
    } else if (argument === '--output') {
      output = requiredArgumentValue(argv, index, '--output');
      index += 1;
    } else if (argument.startsWith('--output=')) {
      output = argument.slice('--output='.length);
      if (output.length === 0) throw new Error('--output requires a value');
    } else if (argument === '--sample-ms') {
      sampleMs = parseWholeNumber(
        requiredArgumentValue(argv, index, '--sample-ms'),
        '--sample-ms',
        MINIMUM_SAMPLE_MS,
        60_000,
      );
      index += 1;
    } else if (argument.startsWith('--sample-ms=')) {
      sampleMs = parseWholeNumber(
        argument.slice('--sample-ms='.length),
        '--sample-ms',
        MINIMUM_SAMPLE_MS,
        60_000,
      );
    } else {
      throw new Error(`Unknown browser-performance argument: ${argument}`);
    }
  }

  if (packagedBaseline.length === 0) {
    throw new Error('--packaged-baseline is required so browser truth is compared with packaged truth');
  }
  return {
    browserExecutable: browserExecutable ? path.resolve(browserExecutable) : '',
    packagedBaseline: artifactJsonPath(packagedBaseline, '--packaged-baseline'),
    output: artifactJsonPath(output, '--output', 'browser-performance'),
    sampleMs,
  };
}

function decodeRemoteValue(remote, references = new Map()) {
  if (remote === null || typeof remote !== 'object' || typeof remote.type !== 'string') {
    throw new TypeError('WebDriver BiDi returned a malformed remote value');
  }
  const prior = typeof remote.internalId === 'string'
    ? references.get(remote.internalId)
    : undefined;
  if (!Object.hasOwn(remote, 'value')) {
    if (prior !== undefined) return prior;
    if (['array', 'object', 'map', 'set'].includes(remote.type)) {
      throw new TypeError(
        `WebDriver BiDi returned an unknown shared-value reference: ${JSON.stringify(remote)}`,
      );
    }
  }
  switch (remote.type) {
    case 'undefined': return undefined;
    case 'null': return null;
    case 'string':
    case 'boolean': return remote.value;
    case 'number': {
      if (typeof remote.value === 'number') return remote.value;
      if (remote.value === 'NaN') return Number.NaN;
      if (remote.value === 'Infinity') return Number.POSITIVE_INFINITY;
      if (remote.value === '-Infinity') return Number.NEGATIVE_INFINITY;
      if (remote.value === '-0') return -0;
      throw new TypeError(`Unsupported WebDriver BiDi number ${JSON.stringify(remote.value)}`);
    }
    case 'bigint': return BigInt(remote.value);
    case 'array':
      if (!Array.isArray(remote.value)) {
        throw new TypeError(`WebDriver BiDi omitted an array value: ${JSON.stringify(remote)}`);
      }
      {
        const decoded = [];
        if (typeof remote.internalId === 'string') references.set(remote.internalId, decoded);
        decoded.push(...remote.value.map((entry) => decodeRemoteValue(entry, references)));
        return decoded;
      }
    case 'object':
      if (!Array.isArray(remote.value)) {
        throw new TypeError(`WebDriver BiDi omitted an object value: ${JSON.stringify(remote)}`);
      }
      {
        const decoded = {};
        if (typeof remote.internalId === 'string') references.set(remote.internalId, decoded);
        for (const [key, value] of remote.value) {
          decoded[key] = decodeRemoteValue(value, references);
        }
        return decoded;
      }
    case 'map':
      if (!Array.isArray(remote.value)) {
        throw new TypeError(`WebDriver BiDi omitted a map value: ${JSON.stringify(remote)}`);
      }
      {
        const decoded = new Map();
        if (typeof remote.internalId === 'string') references.set(remote.internalId, decoded);
        for (const [key, value] of remote.value) {
          decoded.set(
            decodeRemoteValue(key, references),
            decodeRemoteValue(value, references),
          );
        }
        return decoded;
      }
    case 'set':
      if (!Array.isArray(remote.value)) {
        throw new TypeError(`WebDriver BiDi omitted a set value: ${JSON.stringify(remote)}`);
      }
      {
        const decoded = new Set();
        if (typeof remote.internalId === 'string') references.set(remote.internalId, decoded);
        for (const entry of remote.value) decoded.add(decodeRemoteValue(entry, references));
        return decoded;
      }
    case 'date': return remote.value;
    case 'regexp': return { pattern: remote.value.pattern, flags: remote.value.flags };
    default:
      throw new TypeError(`Unsupported WebDriver BiDi remote value type ${remote.type}`);
  }
}

function parseBiDiEndpoint(output) {
  if (typeof output !== 'string') {
    throw new TypeError('Firefox process output must be a string');
  }
  const matches = [...output.matchAll(
    /^WebDriver BiDi listening on (ws:\/\/127\.0\.0\.1:(\d+))\r?$/gmu,
  )];
  if (matches.length === 0) return null;
  if (matches.length !== 1) {
    throw new Error('Firefox reported more than one WebDriver BiDi endpoint');
  }
  const port = Number(matches[0][2]);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Firefox reported an invalid WebDriver BiDi port');
  }
  const endpoint = new URL(matches[0][1]);
  if (
    endpoint.protocol !== 'ws:'
    || endpoint.hostname !== '127.0.0.1'
    || endpoint.port !== String(port)
    || endpoint.pathname !== '/'
    || endpoint.search !== ''
    || endpoint.hash !== ''
  ) {
    throw new Error('Firefox reported a non-loopback WebDriver BiDi endpoint');
  }
  return `${matches[0][1]}/session`;
}

function assertDiagnosticSnapshot(snapshot, label) {
  if (
    snapshot === null
    || typeof snapshot !== 'object'
    || ![
      'errors',
      'unhandledRejections',
      'securityPolicyViolations',
      'evalPolicyViolations',
      'inlinePolicyViolations',
      'otherPolicyViolations',
    ].every((field) => Number.isSafeInteger(snapshot[field]) && snapshot[field] >= 0)
    || snapshot.securityPolicyViolations !== (
      snapshot.evalPolicyViolations
      + snapshot.inlinePolicyViolations
      + snapshot.otherPolicyViolations
    )
  ) {
    throw new Error(`${label} returned invalid browser diagnostic evidence`);
  }
  return snapshot;
}

function assertNoGuardedDiagnosticIncrease(startup, final) {
  assertDiagnosticSnapshot(startup, 'browser startup');
  assertDiagnosticSnapshot(final, 'browser final');
  if (startup.errors !== 0 || startup.unhandledRejections !== 0) {
    throw new Error(
      `Browser startup raised ${startup.errors} error event(s) and `
      + `${startup.unhandledRejections} unhandled rejection(s)`,
    );
  }
  const changed = Object.keys(startup).filter((field) => final[field] !== startup[field]);
  if (changed.length > 0) {
    throw new Error(
      `Guarded browser diagnostics changed after stable startup: ${changed.join(', ')}`,
    );
  }
  return true;
}

function assertAdvancingWorldMeasurement(measurement) {
  const frameSample = measurement?.frameSample;
  const worldAdvanceCount = frameSample?.telemetry?.runtime?.worldAdvanceStep?.totalCount;
  if (
    frameSample?.reason !== 'sample-window-complete'
    || !Number.isSafeInteger(frameSample.startTick)
    || !Number.isSafeInteger(frameSample.endTick)
    || frameSample.endTick <= frameSample.startTick
    || !Number.isSafeInteger(worldAdvanceCount)
    || worldAdvanceCount < 1
  ) {
    throw new Error(
      'Browser witness did not observe a complete advancing-world sample: '
      + JSON.stringify({
        reason: frameSample?.reason ?? null,
        startTick: frameSample?.startTick ?? null,
        endTick: frameSample?.endTick ?? null,
        worldAdvanceCount: worldAdvanceCount ?? null,
      }),
    );
  }
  return measurement;
}

function normalizeBrowserGuardEvidence(evidence) {
  return {
    ...evidence,
    scope: 'count-only trusted browser input and viewport/zoom evidence from the stable browser gameplay document through bootstrap and guarded measurement',
  };
}

class BiDiClient {
  constructor(url) {
    if (typeof WebSocket !== 'function') {
      throw new Error('Browser profiling requires the WebSocket global provided by Node 22 or newer');
    }
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.listenerError = null;
    this.context = null;
    this.closed = false;
  }

  async open() {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out opening the WebDriver BiDi socket')), 10_000);
      const onOpen = () => {
        clearTimeout(timer);
        this.socket.removeEventListener('error', onError);
        resolve();
      };
      const onError = () => {
        clearTimeout(timer);
        this.socket.removeEventListener('open', onOpen);
        reject(new Error('Could not open the WebDriver BiDi socket'));
      };
      this.socket.addEventListener('open', onOpen, { once: true });
      this.socket.addEventListener('error', onError, { once: true });
    });
    this.socket.addEventListener('message', (event) => this.receive(event));
    this.socket.addEventListener('close', () => {
      this.closed = true;
      this.rejectPending(new Error('WebDriver BiDi socket closed before a command completed'));
    });
    this.socket.addEventListener('error', () => {
      this.rejectPending(new Error('WebDriver BiDi socket failed'));
    });
  }

  receive(event) {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      const error = new Error('WebDriver BiDi returned malformed JSON');
      this.listenerError ??= error;
      this.rejectPending(error);
      return;
    }
    if (message.type === 'event' && typeof message.method === 'string') {
      const listeners = this.listeners.get(message.method);
      if (listeners === undefined) return;
      for (const listener of listeners) {
        try {
          listener(message.params ?? {});
        } catch {
          this.listenerError ??= new Error(
            `WebDriver BiDi event handler failed for ${message.method}`,
          );
        }
      }
      return;
    }
    if (!Number.isSafeInteger(message.id)) {
      const error = new Error('WebDriver BiDi returned an unrecognized protocol message');
      this.listenerError ??= error;
      this.rejectPending(error);
      return;
    }
    const pending = this.pending.get(message.id);
    if (pending === undefined) {
      const error = new Error(`WebDriver BiDi returned an unknown command id ${message.id}`);
      this.listenerError ??= error;
      this.rejectPending(error);
      return;
    }
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.type === 'success') pending.resolve(message.result);
    else pending.reject(new Error(`WebDriver BiDi command failed: ${JSON.stringify(message)}`));
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  command(method, params = {}, timeoutMs = CALL_TIMEOUT_MS) {
    this.throwIfNotificationFailed();
    if (this.closed || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`Cannot call ${method}; WebDriver BiDi is not open`));
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`WebDriver BiDi ${method} timed out after ${timeoutMs} ms`));
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

  onEvent(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(method);
    };
  }

  throwIfNotificationFailed() {
    if (this.listenerError !== null) throw this.listenerError;
  }

  async evaluate(expression, timeoutMs = CALL_TIMEOUT_MS) {
    if (typeof this.context !== 'string') throw new Error('WebDriver BiDi has no target context');
    const response = await this.command('script.evaluate', {
      expression,
      target: { context: this.context },
      awaitPromise: true,
      resultOwnership: 'none',
      userActivation: true,
      serializationOptions: { maxObjectDepth: 100, maxDomDepth: 0 },
    }, timeoutMs);
    if (response?.type !== 'success') {
      throw new Error(
        response?.exceptionDetails?.text
        || response?.exceptionDetails?.exception?.value
        || 'Browser evaluation failed',
      );
    }
    return decodeRemoteValue(response.result);
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
    this.rejectPending(new Error('WebDriver BiDi client closed'));
    this.listeners.clear();
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 500);
      this.socket.addEventListener('close', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      try {
        this.socket.close(1000, 'browser performance complete');
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  }
}

async function fileIdentity(filename) {
  const metadata = await fs.stat(filename);
  if (!metadata.isFile()) throw new Error(`Expected a file: ${filename}`);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return { bytes: metadata.size, sha256: hash.digest('hex') };
}

async function runtimeHarnessIdentities() {
  return Object.fromEntries(await Promise.all(
    Object.entries(HARNESS_FILES).map(async ([key, filename]) => [
      key,
      {
        path: path.relative(projectRoot, filename).split(path.sep).join('/'),
        ...await fileIdentity(filename),
      },
    ]),
  ));
}

async function resolveBrowserExecutable(explicit) {
  const candidates = explicit ? [explicit] : [
    ...(process.platform === 'darwin'
      ? ['/Applications/Firefox.app/Contents/MacOS/firefox']
      : []),
    ...(process.platform === 'win32'
      ? [
        path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Mozilla Firefox', 'firefox.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Mozilla Firefox', 'firefox.exe'),
      ]
      : ['/usr/bin/firefox', '/usr/local/bin/firefox']),
  ];
  for (const candidate of candidates) {
    try {
      const metadata = await fs.stat(candidate);
      if (metadata.isFile()) return candidate;
    } catch {
      // Continue through the deterministic candidate list.
    }
  }
  throw new Error('Firefox was not found; pass --browser-executable with an installed Firefox binary');
}

function appendBoundedOutput(current, chunk) {
  const next = current + String(chunk);
  return next.length <= MAX_PROCESS_OUTPUT_CHARACTERS
    ? next
    : next.slice(-MAX_PROCESS_OUTPUT_CHARACTERS);
}

function childExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

async function waitForChildExit(child, timeoutMs) {
  if (childExited(child)) return true;
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
  });
}

async function terminateChild(child) {
  if (childExited(child)) return;
  child.kill('SIGTERM');
  if (await waitForChildExit(child, PROCESS_SHUTDOWN_TIMEOUT_MS)) return;
  child.kill('SIGKILL');
  await waitForChildExit(child, PROCESS_SHUTDOWN_TIMEOUT_MS);
}

async function waitForBiDiEndpoint(child, childState, outputState) {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (childState.spawnError !== null) throw childState.spawnError;
    if (childExited(child)) {
      throw new Error(
        `Firefox exited before WebDriver BiDi opened (code=${child.exitCode}, signal=${child.signalCode})`,
      );
    }
    const endpoint = parseBiDiEndpoint(outputState.text);
    if (endpoint !== null) return endpoint;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for the local Firefox WebDriver BiDi endpoint');
}

async function listDistFiles(directory = distRoot, relativeDirectory = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Production web artifact contains a symbolic link: ${relativePath}`);
    }
    if (entry.isDirectory()) files.push(...await listDistFiles(absolutePath, relativePath));
    else if (entry.isFile()) files.push({ relativePath, absolutePath });
  }
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function manifestIntegrity(files) {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file.path);
    hash.update('\0');
    hash.update(String(file.bytes));
    hash.update('\0');
    hash.update(file.sha256);
    hash.update('\n');
  }
  return hash.digest('hex');
}

async function webArtifactManifest() {
  const files = [];
  for (const file of await listDistFiles()) {
    files.push({ path: file.relativePath, ...await fileIdentity(file.absolutePath) });
  }
  if (files.length < 3 || !files.some((file) => file.path === 'index.html')) {
    throw new Error('dist is missing a complete production web artifact; run npm run build:web');
  }
  return { files, integrity: manifestIntegrity(files) };
}

function stableEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validatedShortString(value, label, pattern = /^[^\u0000-\u001f\u007f]{1,160}$/u) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error(`Packaged baseline has invalid ${label}`);
  }
  return value;
}

function validatedFileIdentity(value, label) {
  if (
    value === null
    || typeof value !== 'object'
    || !Number.isSafeInteger(value.bytes)
    || value.bytes < 0
    || typeof value.sha256 !== 'string'
    || !/^[0-9a-f]{64}$/u.test(value.sha256)
  ) throw new Error(`Packaged baseline has invalid ${label}`);
  return { bytes: value.bytes, sha256: value.sha256 };
}

function validatedScenarioIds(value, label) {
  if (
    !Array.isArray(value)
    || value.length > 64
    || !value.every((entry) => (
      typeof entry === 'string'
      && /^[a-z0-9][a-z0-9-]{0,127}$/u.test(entry)
    ))
    || new Set(value).size !== value.length
  ) throw new Error(`Packaged baseline has invalid ${label}`);
  return [...value];
}

function validatePackagedReference(source, bootstrap) {
  const world = source?.worlds?.estuary;
  const identity = source?.identity;
  const repository = source?.repositoryAtCapture;
  const captureScope = source?.captureScope;
  const executable = source?.packagedExecutable;
  if (
    source?.schema !== 'tideweft-performance-baseline/v2'
    || typeof world?.initialProjectionSha256 !== 'string'
    || world.initialProjectionSha256.length !== 64
    || !Number.isSafeInteger(world.startTick)
    || world.startTick < 0
    || world.seed !== WORLD_SEED
    || identity === null
    || typeof identity !== 'object'
    || repository === null
    || typeof repository !== 'object'
    || !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(repository.head)
    || typeof repository.dirty !== 'boolean'
    || !/^[0-9a-f]{64}$/u.test(repository.trackedDiffSha256)
    || captureScope === null
    || typeof captureScope !== 'object'
    || !['complete-baseline', 'partial-diagnostic'].includes(captureScope.kind)
    || typeof captureScope.complete !== 'boolean'
    || executable === null
    || typeof executable !== 'object'
  ) {
    throw new Error('Packaged baseline is incomplete or not a v2 estuary measurement');
  }
  const expectedScenarioIds = validatedScenarioIds(
    captureScope.expectedScenarioIds,
    'captureScope.expectedScenarioIds',
  );
  const selectedScenarioIds = validatedScenarioIds(
    captureScope.selectedScenarioIds,
    'captureScope.selectedScenarioIds',
  );
  if (
    expectedScenarioIds.length === 0
    || selectedScenarioIds.length === 0
    || !selectedScenarioIds.every((id) => expectedScenarioIds.includes(id))
    || (captureScope.kind === 'complete-baseline') !== captureScope.complete
    || (
      captureScope.complete
      && !stableEqual(selectedScenarioIds, expectedScenarioIds)
    )
  ) {
    throw new Error('Packaged baseline selected scenarios are outside its expected scenario set');
  }
  const gameplayContract = identity.gameplayContract;
  if (
    gameplayContract === null
    || typeof gameplayContract !== 'object'
    || !Number.isSafeInteger(gameplayContract.version)
    || gameplayContract.version < 0
  ) throw new Error('Packaged baseline has invalid identity.gameplayContract');
  const normalizedIdentity = {
    release: validatedShortString(identity.release, 'identity.release'),
    buildIdentity: validatedShortString(identity.buildIdentity, 'identity.buildIdentity'),
    gameplayContract: {
      id: validatedShortString(
        gameplayContract.id,
        'identity.gameplayContract.id',
        /^[a-z0-9][a-z0-9-]{0,79}$/u,
      ),
      name: validatedShortString(gameplayContract.name, 'identity.gameplayContract.name'),
      version: gameplayContract.version,
    },
  };
  const mismatchedIdentityFields = Object.keys(normalizedIdentity).filter(
    (field) => !stableEqual(normalizedIdentity[field], bootstrap.identity?.[field]),
  );
  if (
    world.initialProjectionSha256 !== bootstrap.fingerprint
    || world.startTick !== bootstrap.startTick
    || mismatchedIdentityFields.length > 0
  ) {
    throw new Error(
      'Browser world/build identity does not match the packaged baseline: '
      + JSON.stringify({
        fingerprintMatches: world.initialProjectionSha256 === bootstrap.fingerprint,
        startTickMatches: world.startTick === bootstrap.startTick,
        mismatchedIdentityFields,
      }),
    );
  }
  return {
    schema: source.schema,
    repositoryAtCapture: {
      head: repository.head,
      dirty: repository.dirty,
      trackedDiffSha256: repository.trackedDiffSha256,
    },
    captureScope: {
      kind: captureScope.kind,
      complete: captureScope.complete,
      expectedScenarioIds,
      selectedScenarioIds,
    },
    packagedExecutable: {
      binary: validatedFileIdentity(executable.binary, 'packagedExecutable.binary'),
      applicationArchive: validatedFileIdentity(
        executable.applicationArchive,
        'packagedExecutable.applicationArchive',
      ),
    },
    world: {
      seed: world.seed,
      startTick: world.startTick,
      initialProjectionSha256: world.initialProjectionSha256,
    },
    identity: normalizedIdentity,
  };
}

function sanitizeCapabilities(capabilities) {
  return {
    browserName: capabilities?.browserName ?? null,
    browserVersion: capabilities?.browserVersion ?? null,
    platformName: capabilities?.platformName ?? null,
    userAgent: capabilities?.userAgent ?? null,
    buildId: capabilities?.['moz:buildID'] ?? null,
    headless: capabilities?.['moz:headless'] ?? null,
  };
}

async function readPackagedReference(filename) {
  let source;
  try {
    source = JSON.parse(await fs.readFile(filename, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read packaged baseline JSON: ${error.message}`);
  }
  return source;
}

async function listenPagesServer(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address !== 'object') throw new Error('Pages server has no address');
  return address.port;
}

async function closePagesServer(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function installBrowserDiagnosticPreload(client, context) {
  const installed = await client.command('script.addPreloadScript', {
    contexts: [context],
    functionDeclaration: `() => {
      const state = {
        errors: 0,
        unhandledRejections: 0,
        securityPolicyViolations: 0,
        evalPolicyViolations: 0,
        inlinePolicyViolations: 0,
        otherPolicyViolations: 0,
      };
      addEventListener('error', () => { state.errors += 1; });
      addEventListener('unhandledrejection', () => { state.unhandledRejections += 1; });
      addEventListener('securitypolicyviolation', (event) => {
        state.securityPolicyViolations += 1;
        if (event.blockedURI === 'eval') state.evalPolicyViolations += 1;
        else if (event.blockedURI === 'inline') state.inlinePolicyViolations += 1;
        else state.otherPolicyViolations += 1;
      });
      Object.defineProperty(window, ${JSON.stringify(DIAGNOSTIC_PROPERTY)}, {
        configurable: false,
        enumerable: false,
        writable: false,
        value: state,
      });
    }`,
  });
  if (typeof installed?.script !== 'string' || installed.script.length === 0) {
    throw new Error('Firefox did not install the pre-navigation diagnostic tracker');
  }
  return installed.script;
}

async function captureBrowserDiagnostics(client, label) {
  const snapshot = await client.evaluate(`(() => {
    const state = window[${JSON.stringify(DIAGNOSTIC_PROPERTY)}];
    return state ? { ...state } : null;
  })()`);
  return assertDiagnosticSnapshot(snapshot, label);
}

async function waitForStableBrowserDiagnostics(client) {
  let previous = await captureBrowserDiagnostics(client, 'browser startup candidate');
  assertNoGuardedDiagnosticIncrease(previous, previous);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await client.evaluate(`new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    })`);
    const current = await captureBrowserDiagnostics(client, 'browser startup candidate');
    assertNoGuardedDiagnosticIncrease(current, current);
    if (stableEqual(previous, current)) return current;
    previous = current;
  }
  throw new Error('Browser diagnostics did not reach a stable startup baseline');
}

function isErrorLogEntry(event) {
  return event?.level === 'error';
}

function createBrowserEventMonitor(client, context, expectedUrl) {
  const evidence = {
    startupNavigations: 0,
    guardedNavigations: 0,
    guardedErrorLogs: 0,
    prompts: 0,
    contextDestroyed: 0,
  };
  let guarded = false;
  let completed = false;
  const relevantContext = (event) => event?.context === context
    || event?.source?.context === context;
  const off = [
    client.onEvent('browsingContext.navigationStarted', (event) => {
      if (!relevantContext(event) || completed) return;
      if (guarded) evidence.guardedNavigations += 1;
      else {
        evidence.startupNavigations += 1;
        if (evidence.startupNavigations !== 1 || event.url !== expectedUrl) {
          evidence.guardedNavigations += 1;
        }
      }
    }),
    client.onEvent('browsingContext.contextDestroyed', (event) => {
      if (relevantContext(event) && !completed) evidence.contextDestroyed += 1;
    }),
    client.onEvent('browsingContext.userPromptOpened', (event) => {
      if (relevantContext(event) && !completed) evidence.prompts += 1;
    }),
    client.onEvent('log.entryAdded', (event) => {
      if (
        relevantContext(event)
        && guarded
        && !completed
        && isErrorLogEntry(event)
      ) evidence.guardedErrorLogs += 1;
    }),
  ];
  return {
    beginGuarded() { guarded = true; },
    complete() { completed = true; },
    snapshot() { return { ...evidence }; },
    assertClean() {
      client.throwIfNotificationFailed();
      if (
        evidence.startupNavigations !== 1
        || evidence.guardedNavigations !== 0
        || evidence.guardedErrorLogs !== 0
        || evidence.prompts !== 0
        || evidence.contextDestroyed !== 0
      ) {
        throw new Error(`Browser lifecycle evidence is contaminated: ${JSON.stringify(evidence)}`);
      }
      return { ...evidence };
    },
    dispose() { off.splice(0).forEach((remove) => remove()); },
  };
}

function assertIdentityUnchanged(label, before, after) {
  if (!stableEqual(before, after)) {
    throw new Error(`${label} changed during the browser witness`);
  }
  return true;
}

async function runBrowserWitness(options) {
  options = {
    ...options,
    packagedBaseline: await validateArtifactPath(
      options.packagedBaseline,
      '--packaged-baseline',
      { mustExist: true },
    ),
    output: await validateArtifactPath(options.output, '--output'),
  };
  if (
    options.output === options.packagedBaseline
    || await existingPathsShareFileIdentity(options.output, options.packagedBaseline)
  ) {
    throw new Error('--output must not overwrite the packaged baseline');
  }
  await validateArtifactPath(options.output, '--output');
  await fs.rm(options.output, { force: true });
  const browserExecutable = await resolveBrowserExecutable(options.browserExecutable);
  const browserBinary = await fileIdentity(browserExecutable);
  const browserVersion = (await execFileAsync(browserExecutable, ['--version'])).stdout.trim();
  const webArtifact = await webArtifactManifest();
  const repository = await repositoryAtCapture();
  if (repository === null) throw new Error('Could not capture repository identity');
  const profilerHarness = await runtimeHarnessIdentities();
  await validateArtifactPath(options.packagedBaseline, '--packaged-baseline', { mustExist: true });
  const packagedReferenceIdentity = await fileIdentity(options.packagedBaseline);
  await validateArtifactPath(options.packagedBaseline, '--packaged-baseline', { mustExist: true });
  const packagedSource = await readPackagedReference(options.packagedBaseline);
  const basePath = normalizeBasePath(BASE_PATH);
  const server = createPagesServer(basePath);
  let profileDirectory = null;
  let child = null;
  let client = null;
  let eventMonitor = null;
  let preloadScript = null;
  let subscription = null;
  let completed = false;
  let browserClosedCleanly = false;
  let interruptedBy = null;
  let signalCount = 0;
  const outputState = { text: '' };
  const interrupt = (signal) => {
    interruptedBy ??= signal;
    signalCount += 1;
    if (signalCount === 1 && client !== null && !client.closed) {
      void client.command('browser.close', {}, 2_000).catch(() => client.close());
      return;
    }
    if (child === null || childExited(child)) return;
    child.kill(signalCount > 1 ? 'SIGKILL' : 'SIGTERM');
  };
  const interruptWithSigint = () => interrupt('SIGINT');
  const interruptWithSigterm = () => interrupt('SIGTERM');
  const assertNotInterrupted = (boundary) => {
    if (interruptedBy !== null) {
      throw new Error(`Browser performance evidence was interrupted by ${interruptedBy} ${boundary}`);
    }
  };
  process.on('SIGINT', interruptWithSigint);
  process.on('SIGTERM', interruptWithSigterm);

  try {
    const serverPort = await listenPagesServer(server);
    const entryUrl = `http://127.0.0.1:${serverPort}${basePath}?source=browser-performance`;
    profileDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'tideweft-browser-performance-'));
    await fs.writeFile(path.join(profileDirectory, 'user.js'), [
      'user_pref("browser.shell.checkDefaultBrowser", false);',
      'user_pref("browser.startup.page", 0);',
      'user_pref("ui.prefersReducedMotion", 0);',
      '',
    ].join('\n'), { mode: 0o600 });

    const childState = { spawnError: null };
    child = spawn(browserExecutable, [
      '--headless',
      '--no-remote',
      '--profile', profileDirectory,
      '--remote-debugging-host', '127.0.0.1',
      '--remote-debugging-port', '0',
      '--window-size', `${SCENARIO.viewport.width},${SCENARIO.viewport.height}`,
      'about:blank',
    ], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.once('error', (error) => { childState.spawnError = error; });
    const appendOutput = (chunk) => {
      outputState.text = appendBoundedOutput(outputState.text, chunk);
    };
    child.stdout?.on('data', appendOutput);
    child.stderr?.on('data', appendOutput);

    const endpoint = await waitForBiDiEndpoint(child, childState, outputState);
    assertNotInterrupted('during Firefox startup');
    client = new BiDiClient(endpoint);
    await client.open();
    const status = await client.command('session.status');
    if (status?.ready !== true) throw new Error('Firefox WebDriver BiDi is not ready');
    const session = await client.command('session.new', {
      capabilities: { alwaysMatch: { acceptInsecureCerts: false } },
    });
    const capabilities = sanitizeCapabilities(session.capabilities);
    if (capabilities.browserName !== 'firefox' || capabilities.headless !== true) {
      throw new Error(`Unexpected browser capabilities: ${JSON.stringify(capabilities)}`);
    }

    const created = await client.command('browsingContext.create', {
      type: 'tab',
      background: false,
    });
    if (typeof created?.context !== 'string') throw new Error('Firefox did not create a target tab');
    client.context = created.context;
    const tree = await client.command('browsingContext.getTree');
    for (const context of tree?.contexts ?? []) {
      if (context?.context !== client.context) {
        await client.command('browsingContext.close', {
          context: context.context,
          promptUnload: false,
        });
      }
    }
    await client.command('browsingContext.activate', { context: client.context });
    const isolatedTree = await client.command('browsingContext.getTree');
    if (
      !Array.isArray(isolatedTree?.contexts)
      || isolatedTree.contexts.length !== 1
      || isolatedTree.contexts[0]?.context !== client.context
    ) {
      throw new Error('Firefox did not isolate exactly one active target context');
    }
    eventMonitor = createBrowserEventMonitor(client, client.context, entryUrl);
    const subscribed = await client.command('session.subscribe', {
      events: [
        'log.entryAdded',
        'browsingContext.navigationStarted',
        'browsingContext.contextDestroyed',
        'browsingContext.userPromptOpened',
      ],
      contexts: [client.context],
    });
    if (typeof subscribed?.subscription !== 'string') {
      throw new Error('Firefox did not return a WebDriver BiDi subscription id');
    }
    subscription = subscribed.subscription;
    preloadScript = await installBrowserDiagnosticPreload(client, client.context);
    await client.command('browsingContext.navigate', {
      context: client.context,
      url: entryUrl,
      wait: 'complete',
    }, BOOT_TIMEOUT_MS);
    await client.command('script.removePreloadScript', { script: preloadScript });
    preloadScript = null;
    await client.waitFor(`Boolean(
      location.href === ${JSON.stringify(entryUrl)}
      && document.readyState === 'complete'
      && window.__TIDEWEFT__?.runtime
      && window.__TIDEWEFT__?.renderer
      && window.__TIDEWEFT__?.ui
      && document.querySelector('#game-ui .ui-layer')?.getAttribute('data-ready') === 'true'
    )`);
    const startupDiagnostics = await waitForStableBrowserDiagnostics(client);
    eventMonitor.beginGuarded();
    await installResourceInputGuard(client);
    await client.command('browsingContext.setViewport', {
      context: client.context,
      viewport: { width: SCENARIO.viewport.width, height: SCENARIO.viewport.height },
      devicePixelRatio: SCENARIO.viewport.deviceScaleFactor,
    });
    await client.waitFor(
      `innerWidth === ${SCENARIO.viewport.width} && innerHeight === ${SCENARIO.viewport.height} `
      + `&& Math.abs(devicePixelRatio - ${SCENARIO.viewport.deviceScaleFactor}) < 0.001`,
    );
    await rebaseResourceInputGuardAfterViewport(client, SCENARIO.viewport);

    const bootstrap = await bootstrapWorldDocument(client, SCENARIO.seed);
    if (bootstrap.graphics?.available !== true) {
      throw new Error(`Browser WebGL is unavailable: ${JSON.stringify(bootstrap.graphics)}`);
    }
    const packagedComparison = validatePackagedReference(packagedSource, bootstrap);
    const rawMeasurement = await measureScenario(
      client,
      SCENARIO,
      options.sampleMs,
      false,
      true,
      { captureCdpMetrics: false },
    );
    if (Object.hasOwn(rawMeasurement, 'browser')) {
      throw new Error('Browser witness unexpectedly retained Chromium-only diagnostics');
    }
    assertAdvancingWorldMeasurement(rawMeasurement);
    assertGuardedBaselineMeasurements([rawMeasurement], [SCENARIO.id]);
    const finalGuard = normalizeBrowserGuardEvidence(
      await captureInputGuardEvidence(client, 'browser performance witness'),
    );
    const documentStateWithLocation = await client.evaluate(`(() => ({
      visibility: document.visibilityState,
      hasFocus: document.hasFocus(),
      canvasCount: document.querySelectorAll('canvas').length,
      elementCount: document.getElementsByTagName('*').length,
      mode: window.__TIDEWEFT__?.renderer?.mode?.() ?? null,
      href: location.href,
    }))()`);
    if (documentStateWithLocation.href !== entryUrl) {
      throw new Error(
        `Browser witness navigated away from the production entry: ${documentStateWithLocation.href}`,
      );
    }
    if (
      documentStateWithLocation.visibility !== 'visible'
      || documentStateWithLocation.hasFocus !== true
    ) {
      throw new Error(
        `Browser witness document was not visible and focused: ${JSON.stringify({
          visibility: documentStateWithLocation.visibility,
          hasFocus: documentStateWithLocation.hasFocus,
        })}`,
      );
    }
    delete documentStateWithLocation.href;
    const documentState = documentStateWithLocation;
    const finalTree = await client.command('browsingContext.getTree');
    if (
      !Array.isArray(finalTree?.contexts)
      || finalTree.contexts.length !== 1
      || finalTree.contexts[0]?.context !== client.context
    ) throw new Error('Browser target-context isolation changed during measurement');
    const finalDiagnostics = await captureBrowserDiagnostics(client, 'browser final');
    assertNoGuardedDiagnosticIncrease(startupDiagnostics, finalDiagnostics);
    const lifecycleEvidence = eventMonitor.assertClean();
    eventMonitor.complete();
    const measurement = {
      ...rawMeasurement,
      viewportAndInput: normalizeBrowserGuardEvidence(rawMeasurement.viewportAndInput),
    };
    const relativeReference = path.relative(projectRoot, options.packagedBaseline).split(path.sep).join('/');
    const result = {
      schema: 'tideweft-browser-performance-witness/v1',
      capturedAt: new Date().toISOString(),
      repositoryAtCapture: repository,
      captureScope: {
        kind: 'real-browser-gameplay',
        complete: true,
        expectedScenarioIds: [SCENARIO.id],
        selectedScenarioIds: [SCENARIO.id],
      },
      profilerHarness,
      host: {
        platform: process.platform,
        architecture: process.arch,
        operatingSystem: { type: os.type(), release: os.release(), version: os.version() },
        cpu: { model: os.cpus()[0]?.model ?? null, logicalCores: os.cpus().length },
        totalSystemMemoryBytes: os.totalmem(),
        node: process.version,
      },
      browser: {
        executable: { path: path.basename(browserExecutable), ...browserBinary },
        versionOutput: browserVersion,
        capabilities,
        transport: 'Firefox WebDriver BiDi over loopback; no geckodriver or bundled browser',
      },
      productionWebArtifact: {
        basePath,
        serving: 'loopback HTTP using the same nested-path server as production web smoke; ephemeral port omitted',
        ...webArtifact,
      },
      packagedComparison: {
        sourceArtifact: relativeReference,
        sourceArtifactIdentity: packagedReferenceIdentity,
        ...packagedComparison,
        fingerprintMatches: true,
        startTickMatches: true,
        releaseBuildAndGameplayIdentityMatch: true,
      },
      bootstrap,
      scenario: SCENARIO,
      requestedSampleWindowMs: options.sampleMs,
      measurement,
      finalGuard,
      documentState,
      runtimeErrors: {
        startup: {
          errors: startupDiagnostics.errors,
          unhandledRejections: startupDiagnostics.unhandledRejections,
        },
        final: {
          errors: finalDiagnostics.errors,
          unhandledRejections: finalDiagnostics.unhandledRejections,
        },
        guardedDelta: {
          errors: finalDiagnostics.errors - startupDiagnostics.errors,
          unhandledRejections: (
            finalDiagnostics.unhandledRejections - startupDiagnostics.unhandledRejections
          ),
        },
        lifecycle: lifecycleEvidence,
        scope: 'Pre-navigation window error/rejection counts, guarded target-context error-level log entries, and WebDriver BiDi lifecycle events; messages and source paths are not retained',
      },
      contentSecurityPolicy: {
        startup: {
          total: startupDiagnostics.securityPolicyViolations,
          eval: startupDiagnostics.evalPolicyViolations,
          inline: startupDiagnostics.inlinePolicyViolations,
          other: startupDiagnostics.otherPolicyViolations,
        },
        final: {
          total: finalDiagnostics.securityPolicyViolations,
          eval: finalDiagnostics.evalPolicyViolations,
          inline: finalDiagnostics.inlinePolicyViolations,
          other: finalDiagnostics.otherPolicyViolations,
        },
        guardedDelta: {
          total: (
            finalDiagnostics.securityPolicyViolations
            - startupDiagnostics.securityPolicyViolations
          ),
          eval: finalDiagnostics.evalPolicyViolations - startupDiagnostics.evalPolicyViolations,
          inline: (
            finalDiagnostics.inlinePolicyViolations - startupDiagnostics.inlinePolicyViolations
          ),
          other: (
            finalDiagnostics.otherPolicyViolations - startupDiagnostics.otherPolicyViolations
          ),
        },
        policy: 'reported separately; any counter increase after the stable startup baseline invalidates the witness',
      },
      metricScope: {
        authoritative: 'the same browser-pure fixed-step/runtime, renderer, UI, save, scene-count, and requestAnimationFrame telemetry assertions used by the packaged harness',
        omitted: 'Chromium-only CDP process/task/heap metrics are deliberately discarded rather than relabeled as Firefox evidence',
        limitation: 'one representative desktop Relief scene in one installed Firefox build; packaged Chart/mobile/travel/resource/soak evidence remains separate',
      },
      privacy: 'no save payload, actor identity, cache key, browser profile path, ephemeral port, console message, or private planning path is retained',
    };
    assertNotInterrupted('before browser shutdown');
    await client.command('session.unsubscribe', { subscriptions: [subscription] });
    subscription = null;
    eventMonitor.dispose();
    eventMonitor = null;
    try {
      await client.command('browser.close', {}, 5_000);
    } catch {
      // The browser may close the socket before acknowledging browser.close.
    }
    browserClosedCleanly = await waitForChildExit(child, PROCESS_SHUTDOWN_TIMEOUT_MS)
      && child.exitCode === 0
      && child.signalCode === null;
    if (!browserClosedCleanly) throw new Error('Firefox did not exit cleanly after the witness');
    await client.close().catch(() => undefined);
    assertNotInterrupted('after browser shutdown');

    await validateArtifactPath(
      options.packagedBaseline,
      '--packaged-baseline',
      { mustExist: true },
    );
    const [repositoryAfter, webArtifactAfter, browserBinaryAfter, profilerHarnessAfter,
      packagedReferenceAfter] = await Promise.all([
      repositoryAtCapture(),
      webArtifactManifest(),
      fileIdentity(browserExecutable),
      runtimeHarnessIdentities(),
      fileIdentity(options.packagedBaseline),
    ]);
    assertNotInterrupted('during post-capture identity verification');
    assertIdentityUnchanged('Repository identity', repository, repositoryAfter);
    assertIdentityUnchanged('Production web artifact', webArtifact, webArtifactAfter);
    assertIdentityUnchanged('Firefox executable', browserBinary, browserBinaryAfter);
    assertIdentityUnchanged('Browser performance harness', profilerHarness, profilerHarnessAfter);
    assertIdentityUnchanged(
      'Packaged comparison artifact',
      packagedReferenceIdentity,
      packagedReferenceAfter,
    );
    await fs.mkdir(path.dirname(options.output), { recursive: true });
    await validateArtifactPath(options.output, '--output');
    assertNotInterrupted('before artifact publication');
    await fs.writeFile(options.output, `${JSON.stringify(result, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    assertNotInterrupted('during artifact publication');
    completed = true;
    return result;
  } catch (error) {
    if (interruptedBy !== null) {
      throw new Error(`Browser performance evidence interrupted by ${interruptedBy}; no result is valid`);
    }
    const failure = error instanceof Error ? error : new Error(String(error));
    const output = outputState.text.trim();
    if (output) failure.message += `\nFirefox output (tail):\n${output.slice(-4_000)}`;
    throw failure;
  } finally {
    eventMonitor?.complete();
    eventMonitor?.dispose();
    if (client !== null && !client.closed) {
      if (preloadScript !== null) {
        await client.command('script.removePreloadScript', { script: preloadScript }, 2_000)
          .catch(() => undefined);
      }
      if (subscription !== null) {
        await client.command('session.unsubscribe', { subscriptions: [subscription] }, 2_000)
          .catch(() => undefined);
      }
      if (!completed) await client.command('session.end', {}, 2_000).catch(() => undefined);
      await client.close().catch(() => undefined);
    }
    if (child !== null && !browserClosedCleanly) await terminateChild(child);
    await closePagesServer(server).catch(() => undefined);
    if (profileDirectory !== null) {
      await fs.rm(profileDirectory, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
    if (!completed) {
      await validateArtifactPath(options.output, '--output')
        .then(() => fs.rm(options.output, { force: true }))
        .catch(() => undefined);
    }
    process.removeListener('SIGINT', interruptWithSigint);
    process.removeListener('SIGTERM', interruptWithSigterm);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = await runBrowserWitness(options);
  process.stdout.write(`Browser performance witness written to ${options.output}\n`);
  process.stdout.write(
    `${result.scenario.id}: `
    + `${result.measurement.frameSample.rendererCadence.averageFps.toFixed(2)} renderer FPS average; `
    + `${result.measurement.frameSample.rendererCadence.p99IntervalEquivalentFps.toFixed(2)} FPS p99-gap equivalent; `
    + `${result.measurement.frameSample.rendererCadence.worstIntervalMs.toFixed(1)} ms worst renderer gap\n`,
  );
}

module.exports = {
  BASE_PATH,
  BiDiClient,
  SCENARIO,
  assertAdvancingWorldMeasurement,
  decodeRemoteValue,
  assertDiagnosticSnapshot,
  assertNoGuardedDiagnosticIncrease,
  existingPathsShareFileIdentity,
  isErrorLogEntry,
  manifestIntegrity,
  parseArguments,
  parseBiDiEndpoint,
  sanitizeCapabilities,
  validateArtifactPath,
  validatePackagedReference,
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(
      `Browser performance failed: ${error instanceof Error ? error.stack || error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}

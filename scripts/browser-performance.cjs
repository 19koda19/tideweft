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
const VOICE_PRESENTATION_VIEWPORTS = Object.freeze([
  { width: 1280, height: 720 }, { width: 390, height: 844 },
  { width: 320, height: 640 }, { width: 844, height: 390 },
]);
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
  let voicePresentation = false;
  let animalPresentation = false;
  let pairedGreetings = false;
  let observeVoice = false;
  let reducedMotion = false;
  let sampleMsSpecified = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--voice-presentation') {
      voicePresentation = true;
    } else if (argument === '--animal-presentation') {
      animalPresentation = true;
    } else if (argument === '--paired-greetings') {
      pairedGreetings = true;
    } else if (argument === '--observe-voice') {
      observeVoice = true;
    } else if (argument === '--reduced-motion') {
      reducedMotion = true;
    } else if (argument === '--browser-executable') {
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
      sampleMsSpecified = true;
      sampleMs = parseWholeNumber(
        requiredArgumentValue(argv, index, '--sample-ms'),
        '--sample-ms',
        MINIMUM_SAMPLE_MS,
        60_000,
      );
      index += 1;
    } else if (argument.startsWith('--sample-ms=')) {
      sampleMsSpecified = true;
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

  if (Number(voicePresentation) + Number(animalPresentation) + Number(pairedGreetings) > 1) {
    throw new Error('Choose one functional producer: --voice-presentation, --animal-presentation or --paired-greetings');
  }
  voicePresentation ||= animalPresentation || pairedGreetings;
  if (!voicePresentation && packagedBaseline.length === 0) {
    throw new Error('--packaged-baseline is required so browser truth is compared with packaged truth');
  }
  if (reducedMotion && !voicePresentation) {
    throw new Error('--reduced-motion requires --voice-presentation; performance conditions remain fixed');
  }
  if (voicePresentation && (packagedBaseline.length > 0 || sampleMsSpecified)) {
    throw new Error('--voice-presentation is a functional check, not a packaged performance comparison');
  }
  if (voicePresentation && observeVoice) {
    throw new Error('--observe-voice samples ordinary gameplay; do not combine it with frozen --voice-presentation');
  }
  return {
    browserExecutable: browserExecutable ? path.resolve(browserExecutable) : '',
    packagedBaseline: voicePresentation ? null : artifactJsonPath(packagedBaseline, '--packaged-baseline'),
    output: artifactJsonPath(output, '--output', voicePresentation ? 'browser-voice' : 'browser-performance'),
    sampleMs,
    voicePresentation,
    animalPresentation,
    pairedGreetings,
    observeVoice,
    reducedMotion,
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
    this.evaluationRealm = response.realm;
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

function normalizeExpiredVoiceAnnouncements(value) {
  if (value === null) return [];
  if (Array.isArray(value) && (value.length < 1 || value.length > 2)) {
    throw new Error('Voice replay tracking requires one or two bounded announcements');
  }
  const announcements = Array.isArray(value) ? [...value] : [value];
  if (announcements.length < 1 || announcements.length > 2
    || announcements.some((text) => typeof text !== 'string' || !text || text.length > 1024)) {
    throw new Error('Voice replay tracking requires one or two bounded announcements');
  }
  return announcements;
}

async function installBrowserDiagnosticPreload(client, context, expiredVoiceAnnouncement = null) {
  const expiredAnnouncements = normalizeExpiredVoiceAnnouncements(expiredVoiceAnnouncement);
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
      if (${expiredAnnouncements.length} > 0) {
        const expiredAnnouncements = ${JSON.stringify(expiredAnnouncements)};
        const probe = { repeats: 0, overflow: false, observer: null };
        const bindAnnouncer = () => {
          const node = document.querySelector('#announcer');
          if (!node) return;
          finder.disconnect();
          const record = () => {
            const text = node.textContent || '';
            if (text.length > 8192) probe.overflow = true;
            if (expiredAnnouncements.some((announcement) => text.includes(announcement))) {
              if (probe.repeats >= 32) probe.overflow = true;
              else probe.repeats += 1;
            }
          };
          probe.observer = new MutationObserver(record);
          probe.observer.observe(node, { childList: true, subtree: true, characterData: true });
          record();
        };
        const finder = new MutationObserver(bindAnnouncer);
        finder.observe(document, { childList: true, subtree: true });
        window.__TIDEWEFT_VOICE_RELOAD_PROBE__ = probe;
        bindAnnouncer();
      }
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

// The existing CSP intentionally denies p5's startup eval capability probe.
// Match complete bounded evidence, never a truncated or generic error string.
function startupEvalDenialSignature(event) {
  if (event?.type !== 'javascript' || typeof event.text !== 'string'
    || event.text.length > 1024 || !event.text.startsWith('Content-Security-Policy:')
    || !event.text.includes('blocked a JavaScript eval')
    || !event.text.includes("script-src 'self'") || !event.text.includes("Missing 'unsafe-eval'")) return null;
  const hasStackTrace = event.stackTrace !== undefined;
  if (hasStackTrace && (event.stackTrace === null || typeof event.stackTrace !== 'object'
    || !Array.isArray(event.stackTrace.callFrames))) return null;
  const frames = hasStackTrace ? event.stackTrace.callFrames : [];
  if (!Array.isArray(frames) || frames.length > 6 || frames.some((frame) =>
    typeof frame?.functionName !== 'string' || frame.functionName.length > 128
    || typeof frame.url !== 'string' || frame.url.length > 256
    || !Number.isSafeInteger(frame.lineNumber) || frame.lineNumber < 0
    || !Number.isSafeInteger(frame.columnNumber) || frame.columnNumber < 0)) return null;
  return JSON.stringify({ type: event.type, text: event.text, hasStackTrace,
    frames: frames.map(({ functionName, url, lineNumber, columnNumber }) => (
      { functionName, url, lineNumber, columnNumber })) });
}

function createBrowserEventMonitor(client, context, expectedUrl, { functionalReload = false } = {}) {
  const evidence = {
    startupNavigations: 0,
    guardedNavigations: 0,
    guardedErrorLogs: 0,
    prompts: 0,
    contextDestroyed: 0,
    ...(functionalReload ? { functionalReloads: 0, verifiedReloadStartupEvalDenials: 0 } : {}),
  };
  let guarded = false;
  let completed = false;
  let reloadArmed = false;
  let reloadConsumed = false;
  let reloadStartupOpen = false;
  let initialRealm;
  let initialDiagnostics;
  const initialProbeLogs = [];
  const reloadProbeLogs = [];
  const errorSamples = [];
  const probeLog = (event) => ({ signature: startupEvalDenialSignature(event), realm: event.source?.realm });
  const relevantContext = (event) => event?.context === context
    || event?.source?.context === context;
  const off = [
    client.onEvent('browsingContext.navigationStarted', (event) => {
      if (!relevantContext(event) || completed) return;
      if (guarded) {
        if (functionalReload && reloadArmed && !reloadConsumed && event.url === expectedUrl) {
          reloadArmed = false;
          reloadConsumed = true;
          reloadStartupOpen = true;
          evidence.functionalReloads += 1;
        } else evidence.guardedNavigations += 1;
      }
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
      if (functionalReload && relevantContext(event) && !guarded && !completed && isErrorLogEntry(event)) {
        // One extra sentinel proves overflow instead of dropping extra errors.
        if (initialProbeLogs.length <= 8) initialProbeLogs.push(probeLog(event));
      }
      if (
        relevantContext(event)
        && guarded
        && !completed
        && isErrorLogEntry(event)
      ) {
        evidence.guardedErrorLogs += 1;
        if (functionalReload && reloadStartupOpen && reloadProbeLogs.length <= initialProbeLogs.length) {
          reloadProbeLogs.push(probeLog(event));
        }
        if (functionalReload && errorSamples.length < 4) {
          errorSamples.push({
            type: event.type ?? null,
            text: String(event.text ?? '').slice(0, 512),
            frames: (Array.isArray(event.stackTrace?.callFrames) ? event.stackTrace.callFrames : []).slice(0, 6).map((frame) => ({
              functionName: String(frame?.functionName ?? '').slice(0, 128),
              url: String(frame?.url ?? '').slice(0, 256),
              line: frame?.lineNumber ?? null, column: frame?.columnNumber ?? null,
            })),
          });
        }
      }
    }),
  ];
  return {
    beginGuarded(diagnostics, realm) {
      if (functionalReload) {
        assertDiagnosticSnapshot(diagnostics, 'first document startup');
        if (typeof realm !== 'string' || !realm || initialProbeLogs.length > 8
          || initialProbeLogs.length !== diagnostics.evalPolicyViolations
          || initialProbeLogs.some((log) => log.signature === null || log.realm !== realm)) {
          throw new Error('Voice startup lacks an exact bounded CSP-probe baseline and document realm');
        }
        initialRealm = realm;
        initialDiagnostics = { ...diagnostics };
      }
      guarded = true;
    },
    allowOneFunctionalReload() {
      if (!functionalReload || !guarded || completed || reloadArmed || reloadConsumed) {
        throw new Error('A functional reload is unavailable or already used');
      }
      reloadArmed = true;
    },
    finishFunctionalReloadStartup(diagnostics, realm) {
      if (!functionalReload || !reloadStartupOpen || typeof realm !== 'string' || !realm || realm === initialRealm) {
        throw new Error('No distinct authorized reload startup realm');
      }
      assertNoGuardedDiagnosticIncrease(initialDiagnostics, diagnostics);
      const signatures = (logs) => logs.map((log) => log.signature).sort();
      if (reloadProbeLogs.some((log) => log.signature === null || log.realm !== realm)
        || !stableEqual(signatures(initialProbeLogs), signatures(reloadProbeLogs))) {
        throw new Error('Reload startup does not match its original CSP-probe baseline');
      }
      evidence.verifiedReloadStartupEvalDenials = reloadProbeLogs.length;
      reloadStartupOpen = false;
    },
    complete() { completed = true; },
    snapshot() { return { ...evidence }; },
    assertClean() {
      client.throwIfNotificationFailed();
      if (
        evidence.startupNavigations !== 1
        || evidence.guardedNavigations !== 0
        || evidence.guardedErrorLogs !== (evidence.verifiedReloadStartupEvalDenials ?? 0)
        || evidence.prompts !== 0
        || evidence.contextDestroyed !== 0
        || reloadArmed || reloadStartupOpen
      ) {
        throw new Error(`Browser lifecycle evidence is contaminated: ${JSON.stringify({
          ...evidence, ...(functionalReload ? { errorSamples } : {}),
        })}`);
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

// Actual DOM border boxes, not font estimates or a replacement label renderer.
// This deliberately does not claim glyph-ink, screen-reader speech or hardware proof.
function assertVoicePresentationSnapshot(snapshot, mode, { anonymousAnimal = false } = {}) {
  const finiteRect = (rect) => rect && ['x', 'y', 'width', 'height'].every(
    (key) => Number.isFinite(rect[key]),
  ) && rect.width > 0 && rect.height > 0;
  const inside = (rect) => finiteRect(rect) && rect.x >= -0.5 && rect.y >= -0.5
    && rect.x + rect.width <= snapshot.viewport.width + 0.5
    && rect.y + rect.height <= snapshot.viewport.height + 0.5;
  const caption = snapshot.caption;
  if (snapshot.mode !== mode || !inside(caption?.rect) || !caption?.matchesProjection
    || caption.horizontalOverflow || caption.verticalOverflow || !caption.ariaMatches
    || caption.announcementCount !== 1 || snapshot.liveRegionOverflow
    || snapshot.labelLayerAriaHidden !== 'true') {
    throw new Error(`Invalid Voice caption/accessibility presentation: ${JSON.stringify(snapshot)}`);
  }
  if (!Array.isArray(snapshot.labels) || snapshot.labels.length > 4
    || (mode === 'relief-3d' && !anonymousAnimal && snapshot.labels.length === 0)
    || (anonymousAnimal && (snapshot.labels.length !== 0 || snapshot.anonymousSourceUnanchored !== true))
    || (mode === 'chart-2d' && snapshot.labels.length !== 0)) {
    throw new Error('Voice functional probe did not observe the expected bounded active renderer');
  }
  const feedbackRects = [caption.rect, snapshot.feedback?.chronicle, snapshot.feedback?.dock];
  if (feedbackRects.some((rect) => !inside(rect))) {
    throw new Error('Voice feedback or journey controls are clipped or absent');
  }
  for (let left = 0; left < feedbackRects.length; left += 1) {
    for (let right = left + 1; right < feedbackRects.length; right += 1) {
      const a = feedbackRects[left];
      const b = feedbackRects[right];
      if (a.x < b.x + b.width && a.x + a.width > b.x
        && a.y < b.y + b.height && a.y + a.height > b.y) {
        throw new Error(`Voice feedback overlaps the chronicle or journey controls: ${JSON.stringify(feedbackRects)}`);
      }
    }
  }
  for (const label of snapshot.labels) {
    if (!inside(label.rect) || !label.matchesProjection || label.horizontalOverflow
      || label.verticalOverflow) throw new Error('Voice label is clipped or is not a current heard projection');
  }
  for (let left = 0; left < snapshot.labels.length; left += 1) {
    for (let right = left + 1; right < snapshot.labels.length; right += 1) {
      const a = snapshot.labels[left].rect;
      const b = snapshot.labels[right].rect;
      if (a.x < b.x + b.width && a.x + a.width > b.x
        && a.y < b.y + b.height && a.y + a.height > b.y) {
        throw new Error('Actual Voice DOM labels overlap');
      }
    }
  }
  return snapshot;
}

function assertPairedGreetingSnapshot(snapshot, mode) {
  assertVoicePresentationSnapshot(snapshot, mode);
  const pair = snapshot.pairedSpeech;
  if (!pair || pair.cueCount !== 2 || pair.sourceCount !== 2
    || pair.uniqueSignatureCount !== 2 || pair.captionFromPair !== true
    || pair.labelsMatchOneToOne !== true
    || !Number.isSafeInteger(pair.visibleLabelCount)
    || pair.visibleLabelCount < 0 || pair.visibleLabelCount > 2
    || pair.visibleLabelCount !== snapshot.labels.length
    || (mode === 'chart-2d' && pair.visibleLabelCount !== 0)
    || (mode === 'relief-3d' && snapshot.viewport.width === 1280
      && snapshot.viewport.height === 720 && pair.visibleLabelCount !== 2)) {
    throw new Error('Paired greeting lacks distinct current cues or the claimed native label witness');
  }
  if (mode === 'relief-3d' && (!Number.isSafeInteger(pair.ordinaryWorldLabelCount)
    || pair.ordinaryWorldLabelCount < 0 || pair.ordinaryWorldLabelCount > 64
    || pair.ordinaryWorldLabelOverlapCount !== 0)) {
    throw new Error('Paired greeting overlaps an ordinary Relief world label or lacks its bounded witness');
  }
  return snapshot;
}

function voiceScreenshotPath(output, width, mode) {
  return path.join(path.dirname(output), `${path.basename(output, '.json')}-${width}-${mode}.png`);
}

async function assertFreshVoicePresentationOutput(output) {
  const paths = [output];
  for (const { width } of VOICE_PRESENTATION_VIEWPORTS) {
    for (const mode of ['chart-2d', 'relief-3d']) paths.push(voiceScreenshotPath(output, width, mode));
  }
  for (const candidate of paths) {
    try {
      await fs.lstat(candidate);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    throw new Error('Voice evidence already exists; use a fresh --output stem or omit --output');
  }
  return output;
}

async function physicalBrowserClick(client, rect) {
  if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
    || rect.width <= 0 || rect.height <= 0) throw new Error('Voice input target has no physical rectangle');
  await client.command('input.performActions', {
    context: client.context,
    actions: [{ type: 'pointer', id: 'voice-mouse', parameters: { pointerType: 'mouse' }, actions: [
      { type: 'pointerMove', origin: 'viewport', x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2) },
      { type: 'pointerDown', button: 0 },
      { type: 'pointerUp', button: 0 },
    ] }],
  });
}

async function commitSecondBrowserGreeting(client, firstTarget, firstCommitted, rectangleOf) {
  const secondTarget = await client.evaluate(`(() => {
    const bridge = window.__TIDEWEFT__;
    const view = bridge.runtime.getRenderView();
    const candidates = view.porters.filter((porter) => String(porter.id) !== ${JSON.stringify(String(firstTarget.id))})
      .map((porter) => ({ porter, distance: Math.hypot(porter.position.x - view.player.position.x,
        porter.position.y - view.player.position.y) })).filter(({ distance }) => distance <= 70)
      .sort((a, b) => Number(a.porter.state !== 'waiting') - Number(b.porter.state !== 'waiting')
        || a.distance - b.distance || String(a.porter.id).localeCompare(String(b.porter.id)));
    const chosen = candidates[0];
    if (!chosen) return null;
    return { id: chosen.porter.id, actorId: chosen.porter.actorId };
  })()`);
  if (!secondTarget) throw new Error('No second actual nearby resident for paired greeting');
  // Ordinary simulation continues throughout both real actions. Do not freeze
  // the first utterance to manufacture a second simultaneous admission.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await client.evaluate(`(() => {
      const bridge = window.__TIDEWEFT__;
      const render = bridge.runtime.getRenderView();
      if (!render.acousticText.some((cue) => cue.id === ${JSON.stringify(firstCommitted.captionId)})) {
        throw new Error('First real greeting expired before the second could be reached');
      }
      const porter = render.porters.find((candidate) => String(candidate.id) === ${JSON.stringify(String(secondTarget.id))});
      if (!porter) throw new Error('Second resident left actual visibility before selection');
      bridge.renderer.focusWorld(porter.position, 1.65);
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  await physicalBrowserClick(client, await rectangleOf('#p5-mount canvas[data-renderer="chart-2d"]:not([hidden])'));
  await client.waitFor(`(() => {
    const selected = window.__TIDEWEFT__.runtime.getUIView().selectedResident;
    const greet = document.querySelector('.resident-about__greet');
    return selected?.id === ${JSON.stringify(String(secondTarget.id))}
      && selected.knowledgeLabel === 'Recognized' && greet && !greet.hidden && !greet.disabled;
  })()`);
  await physicalBrowserClick(client, await rectangleOf('.resident-about__greet'));
  const paired = await client.waitFor(`(() => {
    const bridge = window.__TIDEWEFT__;
    const view = bridge.runtime.getUIView();
    const render = bridge.runtime.getRenderView();
    if (view.selectedResident?.id !== ${JSON.stringify(String(secondTarget.id))}
      || view.selectedResident.knowledgeLabel !== 'Acquainted') return false;
    const first = render.acousticText.find((cue) => cue.id === ${JSON.stringify(firstCommitted.captionId)}
      && cue.sourceActorId === ${JSON.stringify(firstTarget.actorId)}
      && cue.sourceKind === 'human' && cue.acousticKind === 'speech');
    const second = render.acousticText.find((cue) => cue.sourceActorId === ${JSON.stringify(secondTarget.actorId)}
      && cue.sourceKind === 'human' && cue.acousticKind === 'speech');
    if (!first || !second || first.id === second.id || first.sourceActorId === second.sourceActorId) {
      throw new Error('Both physically earned greetings did not coexist lawfully');
    }
    if (first.text === second.text) throw new Error('Paired DOM signatures are ambiguous; no identity claim is possible');
    const caption = view.expressionCaption;
    if (!caption || ![first.id, second.id].includes(caption.id)) return false;
    bridge.runtime.stop();
    return { tick: render.tick, captionId: caption.id,
      announcement: caption.speakerLabel + ': ' + caption.text,
      cueIds: [first.id, second.id], sourceIds: [first.sourceActorId, second.sourceActorId],
      cueTexts: [first.text, second.text],
      announcements: [${JSON.stringify(firstCommitted.announcement)},
        view.selectedResident.heading + ': ' + second.text],
      secondHeading: view.selectedResident.heading, secondKnown: view.selectedResident.known };
  })()`);
  await physicalBrowserClick(client, await rectangleOf('.resident-about__close'));
  return { ...paired, secondTarget };
}

async function exerciseBrowserVoicePresentation(client, output, reducedMotion, reloadProductionPage,
  { pairedGreetings = false } = {}) {
  const target = await client.evaluate(`(() => {
    const bridge = window.__TIDEWEFT__;
    const view = bridge.runtime.getRenderView();
    const candidates = view.porters.map((porter) => ({ porter, distance: Math.hypot(
      porter.position.x - view.player.position.x, porter.position.y - view.player.position.y,
    ) })).filter(({ distance }) => distance <= 70).sort((a, b) =>
      Number(a.porter.state !== 'waiting') - Number(b.porter.state !== 'waiting')
      || a.distance - b.distance || String(a.porter.id).localeCompare(String(b.porter.id)));
    const chosen = candidates[0];
    if (!chosen) return null;
    bridge.renderer.setMode('chart-2d');
    bridge.renderer.focusWorld(chosen.porter.position, 1.65);
    bridge.runtime.start();
    return { id: chosen.porter.id, actorId: chosen.porter.actorId };
  })()`);
  if (!target) throw new Error('Voice probe has no actual nearby resident');
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await client.evaluate(`(() => {
      const bridge = window.__TIDEWEFT__;
      const porter = bridge.runtime.getRenderView().porters.find(
        (candidate) => String(candidate.id) === ${JSON.stringify(String(target.id))});
      if (!porter) throw new Error('Resident left actual visibility before selection');
      bridge.renderer.focusWorld(porter.position, 1.65);
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 220));
  }
  const rectangleOf = async (selector) => client.evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node || node.hidden || node.disabled) return null;
    const r = node.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  })()`);
  await physicalBrowserClick(client, await rectangleOf('#p5-mount canvas[data-renderer="chart-2d"]:not([hidden])'));
  await client.waitFor(`(() => {
    const selected = window.__TIDEWEFT__.runtime.getUIView().selectedResident;
    const greet = document.querySelector('.resident-about__greet');
    return selected?.id === ${JSON.stringify(String(target.id))}
      && selected.knowledgeLabel === 'Recognized' && greet && !greet.hidden && !greet.disabled;
  })()`);
  await client.evaluate(`(() => {
    const node = document.querySelector('#announcer');
    if (!node) throw new Error('No accessible live region');
    const entries = [];
    const state = { entries, overflow: false };
    const observer = new MutationObserver(() => {
      const text = node.textContent.trim();
      if (!text) return;
      if (entries.length >= 32 || text.length > 1024) state.overflow = true;
      else entries.push(text);
    });
    observer.observe(node, { childList: true, subtree: true, characterData: true });
    window.__TIDEWEFT_VOICE_PROBE__ = Object.assign(state, { observer });
  })()`);
  await physicalBrowserClick(client, await rectangleOf('.resident-about__greet'));
  let committed = await client.waitFor(`(() => {
    const bridge = window.__TIDEWEFT__;
    const view = bridge.runtime.getUIView();
    const caption = view.expressionCaption;
    if (view.selectedResident?.id !== ${JSON.stringify(String(target.id))}
      || view.selectedResident.knowledgeLabel !== 'Acquainted' || !caption
      || !bridge.runtime.getRenderView().acousticText.some((cue) => cue.id === caption.id
        && cue.sourceActorId === ${JSON.stringify(target.actorId)}
        && cue.sourceKind === 'human' && cue.acousticKind === 'speech')) return false;
    if (!${pairedGreetings}) bridge.runtime.stop();
    return { tick: bridge.runtime.getRenderView().tick, captionId: caption.id,
      announcement: caption.speakerLabel + ': ' + caption.text,
      heading: view.selectedResident.heading, known: view.selectedResident.known };
  })()`);
  await physicalBrowserClick(client, await rectangleOf('.resident-about__close'));
  const firstCommitTick = committed.tick;
  const pair = pairedGreetings
    ? await commitSecondBrowserGreeting(client, target, committed, rectangleOf) : null;
  if (pair !== null && pair.tick <= firstCommitTick) {
    throw new Error('Second physical greeting did not advance beyond the first commit');
  }
  if (pair !== null) committed = { ...committed, tick: pair.tick,
    captionId: pair.captionId, announcement: pair.announcement };
  const snapshots = [];
  await fs.mkdir(path.dirname(output), { recursive: true });
  for (const viewport of VOICE_PRESENTATION_VIEWPORTS) {
    await client.command('browsingContext.setViewport', {
      context: client.context, viewport, devicePixelRatio: 1,
    });
    await client.waitFor(`innerWidth === ${viewport.width} && innerHeight === ${viewport.height}`);
    for (const mode of ['chart-2d', 'relief-3d']) {
      await client.evaluate(`(() => {
        const bridge = window.__TIDEWEFT__;
        bridge.renderer.setMode(${JSON.stringify(mode)});
        const cue = bridge.runtime.getRenderView().acousticText.find(
          (item) => item.id === ${JSON.stringify(committed.captionId)});
        if (!cue) throw new Error('Committed greeting disappeared');
        const pairIds = ${JSON.stringify(pair?.cueIds ?? null)};
        const pairedCues = pairIds === null ? [] : bridge.runtime.getRenderView().acousticText
          .filter((item) => pairIds.includes(item.id));
        const anchor = pairedCues.length === 2 ? {
          x: (pairedCues[0].position.x + pairedCues[1].position.x) / 2,
          y: (pairedCues[0].position.y + pairedCues[1].position.y) / 2,
        } : cue.position;
        bridge.renderer.focusWorld(anchor, 1.65);
        for (let index = 0; index < 5; index += 1) bridge.ui.update(bridge.runtime.getUIView());
      })()`);
      await client.waitFor(`Boolean(document.querySelector(
        '#p5-mount canvas[data-renderer="${mode}"]:not([hidden])'))`);
      await client.evaluate('new Promise((resolve) => setTimeout(resolve, 400))');
      const snapshot = await client.evaluate(`(() => {
        const bridge = window.__TIDEWEFT__;
        const view = bridge.runtime.getUIView();
        const expected = view.expressionCaption;
        const cues = bridge.runtime.getRenderView().acousticText;
        const geometry = (node) => {
          const r = node.getBoundingClientRect();
          return { rect: { x: r.x, y: r.y, width: r.width, height: r.height },
            horizontalOverflow: node.scrollWidth > node.clientWidth + 1,
            verticalOverflow: node.scrollHeight > node.clientHeight + 1 };
        };
        const caption = document.querySelector('[data-ui="situated-expression-caption"]');
        const aria = caption?.getAttribute('aria-label');
        const pairIds = ${JSON.stringify(pair?.cueIds ?? null)};
        const pairedCues = pairIds === null ? [] : cues.filter((cue) => pairIds.includes(cue.id));
        const visibleLabels = [...document.querySelectorAll('.relief-world-label[data-acoustic-kind]')]
          .filter((node) => !node.hidden && node.getClientRects().length > 0);
        const pairedMatches = visibleLabels.map((node) => pairedCues.findIndex((cue) =>
          cue.text === node.textContent && cue.acousticKind === node.dataset.acousticKind
          && cue.sourceKind === node.dataset.sourceKind));
        // Diagnostic only: the shared acoustic arbiter does not yet reserve
        // ordinary world-label space. Do not mistake pair separation for that
        // wider integration proof. Bound this opt-in frozen DOM inspection.
        const ordinaryLabels = pairIds === null ? [] : [...document.querySelectorAll(
          '.relief-world-label:not([data-acoustic-kind])')]
          .filter((node) => !node.hidden && node.getClientRects().length > 0);
        if (ordinaryLabels.length > 64) throw new Error('Paired ordinary-label inspection exceeds its bound');
        const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x
          && a.y < b.y + b.height && a.y + a.height > b.y;
        const ordinaryOverlapCount = visibleLabels.reduce((count, node) => count + ordinaryLabels.filter(
          (ordinary) => intersects(geometry(node).rect, geometry(ordinary).rect)).length, 0);
        return {
          mode: bridge.renderer.mode(), viewport: { width: innerWidth, height: innerHeight },
          tick: bridge.runtime.getRenderView().tick,
          sameCommittedCaption: expected?.id === ${JSON.stringify(committed.captionId)},
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
          liveRegionOverflow: window.__TIDEWEFT_VOICE_PROBE__.overflow,
          labelLayerAriaHidden: document.querySelector('.relief-label-layer')?.getAttribute('aria-hidden'),
          feedback: {
            chronicle: geometry(document.querySelector('.chronicle-panel > .panel-summary')).rect,
            dock: geometry(document.querySelector('.action-dock')).rect,
          },
          caption: caption && !caption.hidden ? { ...geometry(caption),
            matchesProjection: caption.dataset.expressionId === expected?.id
              && caption.querySelector('.situated-expression-caption__text')?.textContent === expected?.text,
            ariaMatches: aria === expected?.speakerLabel + ': ' + expected?.text,
            announcementCount: window.__TIDEWEFT_VOICE_PROBE__.entries.filter((text) => text === aria).length,
          } : null,
          labels: visibleLabels.map((node) => ({ ...geometry(node), matchesProjection: cues.some((cue) =>
              cue.text === node.textContent && cue.acousticKind === node.dataset.acousticKind
              && cue.sourceKind === node.dataset.sourceKind) })),
          ...(pairIds === null ? {} : { pairedSpeech: {
            cueCount: pairedCues.length,
            sourceCount: new Set(pairedCues.map((cue) => cue.sourceActorId)).size,
            uniqueSignatureCount: new Set(pairedCues.map((cue) => JSON.stringify(
              [cue.text, cue.acousticKind, cue.sourceKind]))).size,
            captionFromPair: pairIds.includes(expected?.id),
            visibleLabelCount: pairedMatches.filter((index) => index >= 0).length,
            labelsMatchOneToOne: pairedMatches.every((index) => index >= 0)
              && new Set(pairedMatches).size === pairedMatches.length,
            ordinaryWorldLabelCount: ordinaryLabels.length,
            ordinaryWorldLabelOverlapCount: ordinaryOverlapCount,
          } }),
        };
      })()`);
      if (snapshot.tick !== committed.tick || !snapshot.sameCommittedCaption
        || snapshot.reducedMotion !== reducedMotion) throw new Error('Voice authority or motion preference changed');
      assertVoicePresentationSnapshot(snapshot, mode);
      if (pair !== null) assertPairedGreetingSnapshot(snapshot, mode);
      const screenshot = await client.command('browsingContext.captureScreenshot', { context: client.context });
      const screenshotPath = voiceScreenshotPath(output, viewport.width, mode);
      const filename = path.basename(screenshotPath);
      const bytes = Buffer.from(screenshot.data, 'base64');
      if (bytes.length < 1024) throw new Error('Voice screenshot is empty');
      await fs.writeFile(screenshotPath, bytes, { flag: 'wx', mode: 0o600 });
      snapshots.push({ ...snapshot, screenshot: { file: filename, bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex') } });
    }
  }
  await client.evaluate('window.__TIDEWEFT__.runtime.start()');
  const expired = await client.waitFor(`(() => {
    const bridge = window.__TIDEWEFT__;
    const render = bridge.runtime.getRenderView();
    if (render.tick < ${committed.tick + 6}
      || render.acousticText.some((cue) => ${JSON.stringify(pair?.cueIds ?? [committed.captionId])}.includes(cue.id))
      || ${JSON.stringify(pair?.cueIds ?? [committed.captionId])}.includes(
        bridge.runtime.getUIView().expressionCaption?.id)) return false;
    bridge.runtime.stop();
    const caption = document.querySelector('[data-ui="situated-expression-caption"]');
    const probe = window.__TIDEWEFT_VOICE_PROBE__;
    if (!caption || (!caption.hidden
        && ${JSON.stringify(pair?.cueIds ?? [committed.captionId])}.includes(caption.dataset.expressionId))
      || probe.overflow || probe.entries.filter((text) => text.includes(${JSON.stringify(committed.announcement)})).length !== 1) {
      throw new Error('Expired greeting remains visible or was announced again');
    }
    const pairedAnnouncements = ${JSON.stringify(pair?.announcements ?? null)};
    const countCopies = ${countAnimalAnnouncementCopies.toString()};
    const pairedAnnouncementCounts = pairedAnnouncements?.map((text) => countCopies(probe.entries, text));
    if (pairedAnnouncementCounts?.some((count) => count > 1)
      || (${pair !== null} && [...document.querySelectorAll('.relief-world-label[data-acoustic-kind]')]
        .some((node) => !node.hidden && node.getClientRects().length > 0
          && ${JSON.stringify(pair?.cueTexts ?? [])}.includes(node.textContent)))) {
      throw new Error('Expired paired greeting remains visible or repeats an announcement');
    }
    probe.observer.disconnect();
    return { tick: render.tick, expiredEventAbsent: true, originalAnnouncementCount: 1,
      ...(pairedAnnouncements === null ? {} : { pairedAnnouncementCounts, bothExpiredEventsAbsent: true }) };
  })()`);
  await client.evaluate('window.__TIDEWEFT__.runtime.save()');
  const reloadDiagnostics = await reloadProductionPage(pair?.announcements ?? committed.announcement);
  await client.command('browsingContext.setViewport', {
    context: client.context, viewport: VOICE_PRESENTATION_VIEWPORTS[0], devicePixelRatio: 1,
  });
  await client.waitFor('innerWidth === 1280 && innerHeight === 720');
  // Current loads resume directly. Exercise the real title/CONTINUE controls
  // instead of assuming a load creates title state or assigning it ourselves.
  await physicalBrowserClick(client, await rectangleOf('.title-menu-button'));
  await client.waitFor('window.__TIDEWEFT__.runtime.getUIView().title.visible === true');
  await physicalBrowserClick(client, await rectangleOf('.continue-card'));
  await client.waitFor('window.__TIDEWEFT__.runtime.getUIView().title.visible === false');
  const verifyLearnedResident = async (residentTarget, learned) => {
  await client.evaluate(`(() => {
    const bridge = window.__TIDEWEFT__;
    const porter = bridge.runtime.getRenderView().porters.find((candidate) =>
      String(candidate.id) === ${JSON.stringify(String(residentTarget.id))}
      && candidate.actorId === ${JSON.stringify(residentTarget.actorId)});
    if (!porter) throw new Error('Known resident is no longer lawfully visible after reload');
    bridge.renderer.setMode('chart-2d');
    bridge.renderer.focusWorld(porter.position, 1.65);
  })()`);
  await client.evaluate('new Promise((resolve) => setTimeout(resolve, 400))');
  await physicalBrowserClick(client, await rectangleOf('#p5-mount canvas[data-renderer="chart-2d"]:not([hidden])'));
  await client.waitFor(`window.__TIDEWEFT__.runtime.getUIView().selectedResident?.id === ${JSON.stringify(String(residentTarget.id))}`);
  // Selection commits before the independent UI frame paints ABOUT. Wait for
  // both lawful projection and its real DOM; do not manually force a UI paint.
  const knowledge = await client.waitFor(`(() => {
    const selected = window.__TIDEWEFT__.runtime.getUIView().selectedResident;
    const preserved = selected.knowledgeLabel === 'Acquainted'
      && selected.heading === ${JSON.stringify(learned.heading)}
      && JSON.stringify(selected.known) === ${JSON.stringify(JSON.stringify(learned.known))};
    if (!preserved) throw new Error('Reload lost learned resident facts in the current projection');
    const panel = document.querySelector('.resident-about');
    const domPreserved = panel && !panel.hidden
      && panel.textContent.includes(${JSON.stringify(learned.heading)})
      && ${JSON.stringify(learned.known)}.every((fact) => panel.textContent.includes(fact.value))
      && panel.querySelector('.resident-about__knowledge')?.textContent === 'Acquainted'
      && document.querySelector('.resident-about__greet')?.hidden === true;
    if (!domPreserved) return false;
    return { sameVisibleResident: true, acquainted: true, learnedFactsPreserved: true, aboutDOMMatches: true };
  })()`);
  await physicalBrowserClick(client, await rectangleOf('.resident-about__close'));
  return knowledge;
  };
  const knowledge = await verifyLearnedResident(target, committed);
  const secondKnowledge = pair === null ? null : await verifyLearnedResident(pair.secondTarget,
    { heading: pair.secondHeading, known: pair.secondKnown });
  const restoredTick = await client.evaluate('window.__TIDEWEFT__.runtime.getRenderView().tick');
  await client.evaluate('window.__TIDEWEFT__.runtime.start()');
  const continuedTick = await client.waitFor(`(() => {
    const bridge = window.__TIDEWEFT__;
    if (bridge.runtime.getRenderView().tick <= ${restoredTick}) return false;
    bridge.runtime.stop();
    return bridge.runtime.getRenderView().tick;
  })()`);
  const restoredSnapshots = [];
  for (const viewport of VOICE_PRESENTATION_VIEWPORTS) {
    await client.command('browsingContext.setViewport', {
      context: client.context, viewport, devicePixelRatio: 1,
    });
    await client.waitFor(`innerWidth === ${viewport.width} && innerHeight === ${viewport.height}`);
    for (const mode of ['chart-2d', 'relief-3d']) {
      await client.evaluate(`window.__TIDEWEFT__.renderer.setMode(${JSON.stringify(mode)})`);
      await client.evaluate('new Promise((resolve) => setTimeout(resolve, 200))');
      const restored = await client.evaluate(`(() => {
        const bridge = window.__TIDEWEFT__;
        const view = bridge.runtime.getUIView();
        const caption = document.querySelector('[data-ui="situated-expression-caption"]');
        const probe = window.__TIDEWEFT_VOICE_RELOAD_PROBE__;
        const expiredIds = ${JSON.stringify(pair?.cueIds ?? [committed.captionId])};
        const absent = !bridge.runtime.getRenderView().acousticText.some((cue) => expiredIds.includes(cue.id))
          && !expiredIds.includes(view.expressionCaption?.id)
          && Boolean(caption && (caption.hidden || !expiredIds.includes(caption.dataset.expressionId)));
        return { mode: bridge.renderer.mode(), viewport: { width: innerWidth, height: innerHeight },
          tick: bridge.runtime.getRenderView().tick, expiredEventAbsent: absent,
          oldGreetingAnnouncements: probe?.repeats ?? null, currentSaveAccepted: view.title.hasSave,
          observerPresent: Boolean(probe?.observer), observerOverflow: probe?.overflow ?? true };
      })()`);
      assertRestoredVoiceSnapshot(restored, mode, continuedTick);
      restoredSnapshots.push(restored);
    }
  }
  await client.evaluate('window.__TIDEWEFT_VOICE_RELOAD_PROBE__.observer.disconnect()');
  await client.evaluate('window.__TIDEWEFT__.runtime.save()');
  await client.command('input.releaseActions', { context: client.context });
  return { producer: pair === null ? 'native resident GREET via physical Chart selection and button input'
      : 'two native resident GREETs via back-to-back physical Chart selection and button input',
    committedTick: committed.tick, snapshots,
    lifecycle: { expired, restoredTick, continuedTick, knowledge, restoredSnapshots, reloadDiagnostics,
      ...(pair === null ? {} : { secondKnowledge }) },
    ...(pair === null ? {} : { pairedGreetings: { firstCommitTick,
      bothCommitTick: committed.tick, distinctSources: 2, distinctEvents: 2,
      worldContinuedBetweenGreetings: true } }),
    limitation: pair === null
      ? 'One natural introduction, frozen viewports, ordinary expiry and current-save browser reload; visible facts/DOM and bounded live-region observations, not exact all-root equivalence, audible audio/screen reader, mobile hardware, crowd/soak performance or desktop packaging. Old-document window counters end at pre-reload capture; guarded BiDi logs span teardown.'
      : 'Two actual introductions compete after ordinary simulation and physical controls; desktop Relief requires two distinct nonoverlapping native labels. Compact suppression and ordinary-world-label overlap are reported; the latter is diagnostic, not a passing all-label integration gate. Chart uses canvas and screenshots, not DOM glyph bounds. Expired events and learned ABOUT facts survive one current-save reload without old announcements. Not animal/physical coexistence, active-lease restore, all-root equality, audible audio/AT, mobile hardware, hours or crowd/performance closure.' };
}

function assertRestoredVoiceSnapshot(snapshot, mode, tick) {
  if (!snapshot || snapshot.mode !== mode || snapshot.tick !== tick
    || !Number.isSafeInteger(tick) || tick < 0
    || snapshot.expiredEventAbsent !== true || snapshot.currentSaveAccepted !== true
    || snapshot.observerPresent !== true || snapshot.observerOverflow !== false
    || snapshot.oldGreetingAnnouncements !== 0
    || !Number.isSafeInteger(snapshot.viewport?.width) || snapshot.viewport.width <= 0
    || !Number.isSafeInteger(snapshot.viewport?.height) || snapshot.viewport.height <= 0) {
    throw new Error('Restored voice presentation replays stale speech or lacks valid lifecycle evidence');
  }
  return snapshot;
}

// Deliberately limited to the three anonymous public call forms. These expected
// copies follow src/ui/situatedExpressionCaption.ts, not hidden producer facts.
function anonymousAnimalCaptionExpectation(caption) {
  const anonymousLabelMatches = caption?.animalCallKind === 'bird-call'
    ? caption.speakerLabel === 'A bird'
    : caption?.animalCallKind === 'chorus' ? caption.speakerLabel === 'Sound'
      : caption?.animalCallKind === 'animal-call' && ['Sound', 'An animal'].includes(caption.speakerLabel);
  if (!caption || caption.presentationKind !== 'animal-call' || !anonymousLabelMatches
    || typeof caption.id !== 'string' || !caption.id || typeof caption.text !== 'string'
    || !caption.text || !['east', 'south-east', 'south', 'south-west', 'west',
      'north-west', 'north', 'north-east', 'all around', 'direction unclear'].includes(caption.directionLabel)) {
    throw new Error(`Animal probe requires a genuine anonymous directional public caption: ${JSON.stringify({
      kind: caption?.animalCallKind, label: caption?.speakerLabel, direction: caption?.directionLabel,
    })}`);
  }
  const chorus = caption.animalCallKind === 'chorus';
  const sound = chorus ? 'A chorus sounds' : caption.animalCallKind === 'bird-call'
    ? 'A bird calls' : 'An animal calls';
  const direction = caption.directionLabel;
  const announcement = direction === 'all around'
    ? `[${sound}; the sound seems all around.]`
    : direction === 'direction unclear' ? `[${sound}; direction unclear.]`
      : `[${sound} somewhere ${direction}.]`;
  return { visibleText: `${caption.text} · ${direction}`, announcement };
}

// The live region batches messages. Count copies, not entries containing one.
function countAnimalAnnouncementCopies(entries, copy) {
  if (!Array.isArray(entries) || entries.length > 32 || typeof copy !== 'string' || !copy
    || entries.some((entry) => typeof entry !== 'string' || entry.length > 1024)) {
    throw new Error('Invalid bounded animal announcement history');
  }
  let count = 0;
  for (const entry of entries) {
    let from = 0;
    for (let at = entry.indexOf(copy, from); at !== -1; at = entry.indexOf(copy, from)) {
      count += 1;
      from = at + copy.length;
    }
  }
  return count;
}

async function exerciseBrowserAnimalPresentation(client, output, reducedMotion, reloadProductionPage) {
  // No state/event injection: an existing ordinary move-target adapter starts
  // the same first segment as the production travel witness. Quiet is failure.
  await client.evaluate(`(() => {
    const bridge = window.__TIDEWEFT__;
    const node = document.querySelector('#announcer');
    if (!node) throw new Error('No accessible live region');
    const state = { entries: [], overflow: false };
    const observer = new MutationObserver(() => {
      const text = node.textContent.trim();
      if (!text) return;
      if (state.entries.length >= 32 || text.length > 1024) state.overflow = true;
      else state.entries.push(text);
    });
    observer.observe(node, { childList: true, subtree: true, characterData: true });
    window.__TIDEWEFT_VOICE_PROBE__ = Object.assign(state, { observer });
    const view = bridge.runtime.getRenderView();
    const p = view.player.position;
    const size = view.terrain.tileSize;
    const distance = Math.min(26, p.y / size - 1.5);
    if (!Number.isFinite(distance) || distance < 0.5) throw new Error('No bounded ordinary travel target');
    bridge.renderer.setMode('relief-3d');
    bridge.renderer.setActive(true);
    bridge.ui.start();
    bridge.runtime.dispatchRenderer({ type: 'move-target',
      point: { x: p.x, y: p.y - distance * size }, additive: false });
    bridge.runtime.start();
  })()`);
  const committed = await client.waitFor(`(() => {
    const bridge = window.__TIDEWEFT__;
    const caption = bridge.runtime.getUIView().expressionCaption;
    if (caption?.presentationKind !== 'animal-call') return false;
    bridge.runtime.stop();
    return { tick: bridge.runtime.getRenderView().tick, caption };
  })()`, 30_000);
  const expected = anonymousAnimalCaptionExpectation(committed.caption);
  const eventId = committed.caption.id;
  const snapshots = [];
  await fs.mkdir(path.dirname(output), { recursive: true });
  for (const viewport of VOICE_PRESENTATION_VIEWPORTS) {
    await client.command('browsingContext.setViewport', {
      context: client.context, viewport, devicePixelRatio: 1,
    });
    await client.waitFor(`innerWidth === ${viewport.width} && innerHeight === ${viewport.height}`);
    for (const mode of ['chart-2d', 'relief-3d']) {
      await client.evaluate(`window.__TIDEWEFT__.renderer.setMode(${JSON.stringify(mode)})`);
      await client.waitFor(`Boolean(document.querySelector(
        '#p5-mount canvas[data-renderer="${mode}"]:not([hidden])'))`);
      await client.evaluate('new Promise((resolve) => setTimeout(resolve, 400))');
      const snapshot = await client.evaluate(`(() => {
        const bridge = window.__TIDEWEFT__;
        const view = bridge.runtime.getUIView();
        const cue = view.expressionCaption;
        const render = bridge.runtime.getRenderView();
        const geometry = (node) => {
          if (!node) return null;
          const r = node.getBoundingClientRect();
          return { rect: { x: r.x, y: r.y, width: r.width, height: r.height },
            horizontalOverflow: node.scrollWidth > node.clientWidth + 1,
            verticalOverflow: node.scrollHeight > node.clientHeight + 1 };
        };
        const caption = document.querySelector('[data-ui="situated-expression-caption"]');
        const labels = [...document.querySelectorAll('.relief-world-label[data-acoustic-kind]')]
          .filter((node) => !node.hidden && node.getClientRects().length > 0);
        return { mode: bridge.renderer.mode(), viewport: { width: innerWidth, height: innerHeight },
          tick: render.tick, sameCommittedCaption: cue?.id === ${JSON.stringify(eventId)},
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
          anonymousSourceUnanchored: render.acousticText.length === 0
            && render.expressions.length === 0,
          liveRegionOverflow: window.__TIDEWEFT_VOICE_PROBE__.overflow,
          labelLayerAriaHidden: document.querySelector('.relief-label-layer')?.getAttribute('aria-hidden'),
          feedback: {
            chronicle: geometry(document.querySelector('.chronicle-panel > .panel-summary'))?.rect,
            dock: geometry(document.querySelector('.action-dock'))?.rect,
          },
          caption: caption && !caption.hidden ? { ...geometry(caption),
            matchesProjection: caption.dataset.expressionId === cue?.id
              && caption.querySelector('.situated-expression-caption__text')?.textContent === ${JSON.stringify(expected.visibleText)}
              && caption.querySelector('.situated-expression-caption__speaker')?.textContent === '',
            ariaMatches: caption.getAttribute('aria-label') === ${JSON.stringify(expected.announcement)},
            announcementCount: (${countAnimalAnnouncementCopies.toString()})(
              window.__TIDEWEFT_VOICE_PROBE__.entries, ${JSON.stringify(expected.announcement)}),
          } : null,
          labels: labels.map((node) => geometry(node)),
        };
      })()`);
      if (snapshot.tick !== committed.tick || !snapshot.sameCommittedCaption
        || snapshot.reducedMotion !== reducedMotion) throw new Error('Animal presentation changed authority or motion preference');
      assertVoicePresentationSnapshot(snapshot, mode, { anonymousAnimal: true });
      const screenshot = await client.command('browsingContext.captureScreenshot', { context: client.context });
      const bytes = Buffer.from(screenshot.data, 'base64');
      if (bytes.length < 1024) throw new Error('Animal screenshot is empty');
      const screenshotPath = voiceScreenshotPath(output, viewport.width, mode);
      await fs.writeFile(screenshotPath, bytes, { flag: 'wx', mode: 0o600 });
      snapshots.push({ ...snapshot, screenshot: { file: path.basename(screenshotPath), bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex') } });
    }
  }
  await client.evaluate('window.__TIDEWEFT__.runtime.start()');
  const expiredTick = await client.waitFor(`(() => {
    const bridge = window.__TIDEWEFT__;
    const render = bridge.runtime.getRenderView();
    if (render.tick < ${committed.tick + 6}
      || bridge.runtime.getUIView().expressionCaption?.id === ${JSON.stringify(eventId)}
      || render.acousticText.some((cue) => cue.id === ${JSON.stringify(eventId)})) return false;
    const nativeCaption = document.querySelector('[data-ui="situated-expression-caption"]');
    if (!nativeCaption) throw new Error('Animal caption surface disappeared');
    if (!nativeCaption.hidden && nativeCaption.dataset.expressionId === ${JSON.stringify(eventId)}) return false;
    bridge.runtime.stop();
    const probe = window.__TIDEWEFT_VOICE_PROBE__;
    if (probe.overflow || (${countAnimalAnnouncementCopies.toString()})(
      probe.entries, ${JSON.stringify(expected.announcement)}) !== 1)
      throw new Error('Animal caption repeated or announcement history overflowed');
    probe.observer.disconnect();
    return render.tick;
  })()`);
  await client.evaluate('window.__TIDEWEFT__.runtime.save()');
  const reloadDiagnostics = await reloadProductionPage(expected.announcement);
  const restoredTick = await client.evaluate('window.__TIDEWEFT__.runtime.getRenderView().tick');
  await client.evaluate('window.__TIDEWEFT__.runtime.start()');
  const continuedTick = await client.waitFor(`(() => {
    const bridge = window.__TIDEWEFT__;
    if (bridge.runtime.getRenderView().tick <= ${restoredTick}) return false;
    bridge.runtime.stop();
    return bridge.runtime.getRenderView().tick;
  })()`);
  const restored = await client.evaluate(`(() => {
    const bridge = window.__TIDEWEFT__;
    const view = bridge.runtime.getUIView();
    const caption = document.querySelector('[data-ui="situated-expression-caption"]');
    const probe = window.__TIDEWEFT_VOICE_RELOAD_PROBE__;
    return { mode: bridge.renderer.mode(), tick: bridge.runtime.getRenderView().tick,
      viewport: { width: innerWidth, height: innerHeight }, currentSaveAccepted: view.title.hasSave,
      expiredEventAbsent: view.expressionCaption?.id !== ${JSON.stringify(eventId)}
        && !bridge.runtime.getRenderView().acousticText.some((cue) => cue.id === ${JSON.stringify(eventId)})
        && Boolean(caption && (caption.hidden || caption.dataset.expressionId !== ${JSON.stringify(eventId)})),
      oldGreetingAnnouncements: probe?.repeats ?? null, observerPresent: Boolean(probe?.observer),
      observerOverflow: probe?.overflow ?? true };
  })()`);
  assertRestoredVoiceSnapshot(restored, restored.mode, continuedTick);
  await client.evaluate('window.__TIDEWEFT_VOICE_RELOAD_PROBE__.observer.disconnect()');
  return { producer: 'ordinary move-target first segment; actual anonymous animal caption, no supplied source/event',
    committedTick: committed.tick, callKind: committed.caption.animalCallKind, snapshots,
    lifecycle: { expiredTick, expiredNativeCaptionAbsent: true,
      restoredTick, continuedTick, restored, reloadDiagnostics },
    limitation: 'One genuine anonymous call in a synthetic corridor world, frozen native DOM/viewports and live-region deduplication, natural expiry and current-save browser reload. No exact producer identity, animal translation, visible-source glyph, emitted/audio/AT hardware, all-root equivalence, crowd/soak or performance certification.' };
}

async function runBrowserWitness(options) {
  options = {
    ...options,
    packagedBaseline: options.voicePresentation ? null : await validateArtifactPath(
      options.packagedBaseline,
      '--packaged-baseline',
      { mustExist: true },
    ),
    output: await validateArtifactPath(options.output, '--output'),
  };
  if (
    options.packagedBaseline !== null && (options.output === options.packagedBaseline
    || await existingPathsShareFileIdentity(options.output, options.packagedBaseline))
  ) {
    throw new Error('--output must not overwrite the packaged baseline');
  }
  await validateArtifactPath(options.output, '--output');
  if (options.voicePresentation) await assertFreshVoicePresentationOutput(options.output);
  else await fs.rm(options.output, { force: true });
  const browserExecutable = await resolveBrowserExecutable(options.browserExecutable);
  const browserBinary = await fileIdentity(browserExecutable);
  const browserVersion = (await execFileAsync(browserExecutable, ['--version'])).stdout.trim();
  const webArtifact = await webArtifactManifest();
  const repository = await repositoryAtCapture();
  if (repository === null) throw new Error('Could not capture repository identity');
  const profilerHarness = await runtimeHarnessIdentities();
  if (!options.voicePresentation) await validateArtifactPath(options.packagedBaseline, '--packaged-baseline', { mustExist: true });
  const packagedReferenceIdentity = options.voicePresentation ? null : await fileIdentity(options.packagedBaseline);
  if (!options.voicePresentation) await validateArtifactPath(options.packagedBaseline, '--packaged-baseline', { mustExist: true });
  const packagedSource = options.voicePresentation ? null : await readPackagedReference(options.packagedBaseline);
  const basePath = normalizeBasePath(BASE_PATH);
  const server = createPagesServer(basePath);
  let profileDirectory = null;
  let child = null;
  let client = null;
  let eventMonitor = null;
  let preloadScript = null;
  let subscription = null;
  let completed = false;
  let publishedOutput = false;
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
      `user_pref("ui.prefersReducedMotion", ${options.reducedMotion ? 1 : 0});`,
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
    eventMonitor = createBrowserEventMonitor(client, client.context, entryUrl, {
      functionalReload: options.voicePresentation,
    });
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
    let startupDiagnostics = await waitForStableBrowserDiagnostics(client);
    eventMonitor.beginGuarded(startupDiagnostics, client.evaluationRealm);
    if (!options.voicePresentation) await installResourceInputGuard(client);
    await client.command('browsingContext.setViewport', {
      context: client.context,
      viewport: { width: SCENARIO.viewport.width, height: SCENARIO.viewport.height },
      devicePixelRatio: SCENARIO.viewport.deviceScaleFactor,
    });
    await client.waitFor(
      `innerWidth === ${SCENARIO.viewport.width} && innerHeight === ${SCENARIO.viewport.height} `
      + `&& Math.abs(devicePixelRatio - ${SCENARIO.viewport.deviceScaleFactor}) < 0.001`,
    );
    if (!options.voicePresentation) await rebaseResourceInputGuardAfterViewport(client, SCENARIO.viewport);

    const bootstrap = await bootstrapWorldDocument(client, options.animalPresentation
      ? 'breathing-room all-tide corridor 187' : options.voicePresentation ? 'phase ten glass ebb' : SCENARIO.seed);
    if (bootstrap.graphics?.available !== true) {
      throw new Error(`Browser WebGL is unavailable: ${JSON.stringify(bootstrap.graphics)}`);
    }
    const packagedComparison = options.voicePresentation ? null : validatePackagedReference(packagedSource, bootstrap);
    const reloadProductionPage = async (expiredVoiceAnnouncement) => {
      const oldFinal = await captureBrowserDiagnostics(client, 'pre-reload document');
      assertNoGuardedDiagnosticIncrease(startupDiagnostics, oldFinal);
      eventMonitor.assertClean();
      const oldStartup = startupDiagnostics;
      preloadScript = await installBrowserDiagnosticPreload(client, client.context, expiredVoiceAnnouncement);
      eventMonitor.allowOneFunctionalReload();
      await client.command('browsingContext.navigate', {
        context: client.context, url: entryUrl, wait: 'complete',
      }, BOOT_TIMEOUT_MS);
      await client.command('script.removePreloadScript', { script: preloadScript });
      preloadScript = null;
      const restored = await client.waitFor(`(() => {
        const bridge = window.__TIDEWEFT__;
        if (location.href !== ${JSON.stringify(entryUrl)} || document.readyState !== 'complete'
          || !bridge?.runtime || !bridge.renderer || !bridge.ui
          || document.querySelector('#game-ui .ui-layer')?.dataset.ready !== 'true') return false;
        bridge.runtime.stop();
        return bridge.runtime.getUIView().title.hasSave;
      })()`);
      if (!restored) throw new Error('Production reload did not accept its current save');
      startupDiagnostics = await waitForStableBrowserDiagnostics(client);
      eventMonitor.finishFunctionalReloadStartup(startupDiagnostics, client.evaluationRealm);
      return { firstDocument: { startup: oldStartup, preReload: oldFinal },
        reloadedDocumentStartup: startupDiagnostics };
    };
    const voicePresentation = options.voicePresentation
      ? await (options.animalPresentation ? exerciseBrowserAnimalPresentation : exerciseBrowserVoicePresentation)(
        client, options.output, options.reducedMotion, reloadProductionPage,
        { pairedGreetings: options.pairedGreetings }) : null;
    const rawMeasurement = options.voicePresentation ? null : await measureScenario(
      client,
      SCENARIO,
      options.sampleMs,
      false,
      true,
      { captureCdpMetrics: false, observeVoice: options.observeVoice },
    );
    if (rawMeasurement !== null && Object.hasOwn(rawMeasurement, 'browser')) {
      throw new Error('Browser witness unexpectedly retained Chromium-only diagnostics');
    }
    if (!options.voicePresentation) {
      assertAdvancingWorldMeasurement(rawMeasurement);
      assertGuardedBaselineMeasurements([rawMeasurement], [SCENARIO.id]);
    }
    const finalGuard = options.voicePresentation ? null : normalizeBrowserGuardEvidence(
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
    if (options.voicePresentation && lifecycleEvidence.functionalReloads !== 1) {
      throw new Error('Voice lifecycle did not consume exactly one authorized production reload');
    }
    eventMonitor.complete();
    const measurement = options.voicePresentation ? null : {
      ...rawMeasurement,
      viewportAndInput: normalizeBrowserGuardEvidence(rawMeasurement.viewportAndInput),
    };
    const relativeReference = options.voicePresentation ? null
      : path.relative(projectRoot, options.packagedBaseline).split(path.sep).join('/');
    const result = {
      schema: options.voicePresentation ? 'tideweft-browser-voice-presentation/v1' : 'tideweft-browser-performance-witness/v1',
      capturedAt: new Date().toISOString(),
      repositoryAtCapture: repository,
      captureScope: {
        kind: options.voicePresentation ? 'functional-voice-presentation' : 'real-browser-gameplay',
        complete: true,
        expectedScenarioIds: options.animalPresentation ? ['native-anonymous-animal']
          : options.pairedGreetings ? ['native-paired-greetings'] : options.voicePresentation ? ['native-greet'] : [SCENARIO.id],
        selectedScenarioIds: options.animalPresentation ? ['native-anonymous-animal']
          : options.pairedGreetings ? ['native-paired-greetings'] : options.voicePresentation ? ['native-greet'] : [SCENARIO.id],
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
      ...(options.voicePresentation ? { voicePresentation } : { packagedComparison: {
        sourceArtifact: relativeReference,
        sourceArtifactIdentity: packagedReferenceIdentity,
        ...packagedComparison,
        fingerprintMatches: true,
        startTickMatches: true,
        releaseBuildAndGameplayIdentityMatch: true,
      } }),
      bootstrap,
      ...(options.voicePresentation ? {} : { scenario: SCENARIO,
        requestedSampleWindowMs: options.sampleMs, measurement, finalGuard }),
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
      metricScope: options.voicePresentation ? {
        authoritative: options.animalPresentation
          ? 'Ordinary travel opportunity with actual anonymous animal caption; frozen native DOM/bounds/ARIA, no hidden anchor, natural expiry and current-save reload without old announcement replay'
          : options.pairedGreetings
            ? 'Two real physical GREETs with simultaneous source-distinct speech; native Relief labels, caption/ARIA, ordinary expiry, both learned ABOUT states and expired-event nonreplay after current-save reload'
          : 'Native selection/GREET, frozen presentation, ordinary expiry, current-save reload, real CONTINUE/reselection and learned-fact preservation; expired projected cue/caption absence across views/viewports',
        limitation: voicePresentation.limitation,
        omitted: 'No performance measurement, packaged comparison, glyph-ink or hardware certification',
      } : {
        authoritative: 'the same browser-pure fixed-step/runtime, renderer, UI, save, scene-count, and requestAnimationFrame telemetry assertions used by the packaged harness',
        omitted: 'Chromium-only CDP process/task/heap metrics are deliberately discarded rather than relabeled as Firefox evidence',
        limitation: 'one representative desktop Relief scene in one installed Firefox build; packaged Chart/mobile/travel/resource/soak evidence remains separate',
      },
      privacy: options.voicePresentation
        ? 'Local synthetic world only: JSON omits actor IDs/names and save payloads; screenshots retain legitimately visible game text and learned generated names. No real profile/save, private planning, personal data or telemetry service; artifacts remain ignored.'
        : 'no save payload, actor identity, cache key, browser profile path, ephemeral port, console message, or private planning path is retained',
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

    if (!options.voicePresentation) await validateArtifactPath(
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
      options.voicePresentation ? null : fileIdentity(options.packagedBaseline),
    ]);
    assertNotInterrupted('during post-capture identity verification');
    assertIdentityUnchanged('Repository identity', repository, repositoryAfter);
    assertIdentityUnchanged('Production web artifact', webArtifact, webArtifactAfter);
    assertIdentityUnchanged('Firefox executable', browserBinary, browserBinaryAfter);
    assertIdentityUnchanged('Browser performance harness', profilerHarness, profilerHarnessAfter);
    if (!options.voicePresentation) assertIdentityUnchanged(
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
    publishedOutput = true;
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
    if (!completed && (!options.voicePresentation || publishedOutput)) {
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
  if (options.voicePresentation) {
    process.stdout.write(`Browser Voice functional witness written to ${options.output}\n`);
    return;
  }
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
  createBrowserEventMonitor,
  SCENARIO,
  assertAdvancingWorldMeasurement,
  assertVoicePresentationSnapshot,
  assertPairedGreetingSnapshot,
  normalizeExpiredVoiceAnnouncements,
  anonymousAnimalCaptionExpectation,
  countAnimalAnnouncementCopies,
  assertRestoredVoiceSnapshot,
  assertFreshVoicePresentationOutput,
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

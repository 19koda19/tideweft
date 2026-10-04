'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const {
  BASE_PATH,
  SCENARIO,
  assertAdvancingWorldMeasurement,
  assertVoicePresentationSnapshot,
  assertFreshVoicePresentationOutput,
  assertDiagnosticSnapshot,
  assertNoGuardedDiagnosticIncrease,
  decodeRemoteValue,
  existingPathsShareFileIdentity,
  isErrorLogEntry,
  manifestIntegrity,
  parseArguments,
  parseBiDiEndpoint,
  sanitizeCapabilities,
  validateArtifactPath,
  validatePackagedReference,
} = require('./browser-performance.cjs');

assert.equal(BASE_PATH, '/tideweft/');
assert.equal(SCENARIO.mode, 'relief-3d');
assert.equal(SCENARIO.viewport.width, 1440);

assert.deepEqual(decodeRemoteValue({
  type: 'object',
  value: [
    ['answer', { type: 'number', value: 42 }],
    ['items', {
      type: 'array',
      value: [{ type: 'boolean', value: true }, { type: 'null' }],
    }],
    ['missing', { type: 'undefined' }],
  ],
}), { answer: 42, items: [true, null], missing: undefined });
assert.equal(Object.is(decodeRemoteValue({ type: 'number', value: '-0' }), -0), true);
assert.equal(Number.isNaN(decodeRemoteValue({ type: 'number', value: 'NaN' })), true);
assert.throws(() => decodeRemoteValue({ type: 'node' }), /Unsupported WebDriver BiDi/u);
const cyclicRemoteValue = decodeRemoteValue({
  type: 'object',
  internalId: 'shared-1',
  value: [['self', { type: 'object', internalId: 'shared-1' }]],
});
assert.equal(cyclicRemoteValue.self, cyclicRemoteValue);

assert.equal(
  parseBiDiEndpoint(
    'console noise\nWebDriver BiDi listening on ws://127.0.0.1:57565\nmore console noise\n',
  ),
  'ws://127.0.0.1:57565/session',
);
assert.equal(parseBiDiEndpoint('WebDriver BiDi is disabled\n'), null);
assert.throws(
  () => parseBiDiEndpoint(
    'WebDriver BiDi listening on ws://127.0.0.1:57565\n'
    + 'WebDriver BiDi listening on ws://127.0.0.1:57566\n',
  ),
  /more than one/u,
);
assert.equal(parseBiDiEndpoint('WebDriver BiDi listening on ws://localhost:57565\n'), null);
assert.equal(isErrorLogEntry({ level: 'error', type: 'javascript' }), true);
assert.equal(isErrorLogEntry({ level: 'error', type: 'console' }), true);
assert.equal(isErrorLogEntry({ level: 'warning', type: 'console' }), false);

const parsed = parseArguments([
  '--browser-executable', '/Applications/Firefox.app/Contents/MacOS/firefox',
  '--packaged-baseline', 'artifacts/performance/package.json',
  '--output', 'artifacts/performance/browser.json',
  '--sample-ms', '30000',
]);
assert.equal(parsed.sampleMs, 30_000);
assert.match(parsed.packagedBaseline, /artifacts[/\\]performance[/\\]package\.json$/u);
assert.throws(
  () => parseArguments(['--packaged-baseline', 'build/reference.json']),
  /ignored artifacts/u,
);
assert.throws(() => parseArguments([]), /--packaged-baseline is required/u);
const functional = parseArguments(['--voice-presentation', '--reduced-motion',
  '--output', 'artifacts/validation/voice.json']);
assert.equal(functional.voicePresentation, true);
assert.equal(functional.reducedMotion, true);
assert.equal(functional.packagedBaseline, null);
assert.equal(parsed.voicePresentation, false);
assert.throws(() => parseArguments(['--voice-presentation', '--sample-ms', '5000']), /functional check/u);
assert.throws(() => parseArguments(['--voice-presentation', '--packaged-baseline', 'artifacts/a.json']), /functional check/u);
assert.throws(() => parseArguments(['--voice-presentation', '--output', 'docs/voice.json']), /ignored artifacts/u);
assert.throws(() => parseArguments(['--reduced-motion', '--packaged-baseline', 'artifacts/a.json']), /requires --voice-presentation/u);

const voiceSnapshot = {
  mode: 'relief-3d', viewport: { width: 390, height: 844 }, labelLayerAriaHidden: 'true',
  caption: { rect: { x: 20, y: 600, width: 350, height: 80 }, matchesProjection: true,
    ariaMatches: true, announcementCount: 1, horizontalOverflow: false, verticalOverflow: false },
  feedback: { chronicle: { x: 20, y: 540, width: 350, height: 45 },
    dock: { x: 20, y: 710, width: 350, height: 95 } },
  labels: [{ rect: { x: 90, y: 230, width: 200, height: 40 }, matchesProjection: true,
    horizontalOverflow: false, verticalOverflow: false }],
};
assert.equal(assertVoicePresentationSnapshot(voiceSnapshot, 'relief-3d'), voiceSnapshot);
const chartSnapshot = { ...voiceSnapshot, mode: 'chart-2d', labels: [] };
assert.equal(assertVoicePresentationSnapshot(chartSnapshot, 'chart-2d'), chartSnapshot);
for (const caption of [null, { ...voiceSnapshot.caption, ariaMatches: false },
  { ...voiceSnapshot.caption, announcementCount: 2 },
  { ...voiceSnapshot.caption, matchesProjection: false },
  { ...voiceSnapshot.caption, rect: { x: 390, y: 1, width: 50, height: 50 } },
  { ...voiceSnapshot.caption, horizontalOverflow: true }]) {
  assert.throws(() => assertVoicePresentationSnapshot({ ...voiceSnapshot, caption }, 'relief-3d'), /caption/u);
}
assert.throws(() => assertVoicePresentationSnapshot({ ...voiceSnapshot, labels: [] }, 'relief-3d'), /active renderer/u);
assert.throws(() => assertVoicePresentationSnapshot(voiceSnapshot, 'chart-2d'), /caption/u);
assert.throws(() => assertVoicePresentationSnapshot({ ...voiceSnapshot,
  labels: [...voiceSnapshot.labels, { ...voiceSnapshot.labels[0] }] }, 'relief-3d'), /overlap/u);
assert.throws(() => assertVoicePresentationSnapshot({ ...voiceSnapshot,
  labels: [{ ...voiceSnapshot.labels[0], matchesProjection: false }] }, 'relief-3d'), /current heard projection/u);
assert.throws(() => assertVoicePresentationSnapshot({ ...voiceSnapshot,
  labels: [{ ...voiceSnapshot.labels[0], verticalOverflow: true }] }, 'relief-3d'), /clipped/u);
assert.throws(() => assertVoicePresentationSnapshot({ ...voiceSnapshot,
  labelLayerAriaHidden: 'false' }, 'relief-3d'), /accessibility/u);
assert.throws(() => assertVoicePresentationSnapshot({ ...voiceSnapshot,
  liveRegionOverflow: true }, 'relief-3d'), /accessibility/u);
assert.throws(() => assertVoicePresentationSnapshot({ ...voiceSnapshot,
  feedback: undefined }, 'relief-3d'), /clipped or absent/u);
assert.throws(() => assertVoicePresentationSnapshot({ ...voiceSnapshot,
  feedback: { ...voiceSnapshot.feedback, chronicle: { x: 20, y: 700, width: 350, height: 45 } } },
  'relief-3d'), /overlaps.*journey controls/u);
assert.throws(() => assertVoicePresentationSnapshot({ ...voiceSnapshot,
  feedback: { ...voiceSnapshot.feedback, chronicle: { x: 20, y: 590, width: 350, height: 45 } } },
  'relief-3d'), /overlaps.*journey controls/u);
assert.throws(
  () => parseArguments(['--packaged-baseline', 'artifacts/a.json', '--sample-ms', '4999']),
  /whole number/u,
);

const fingerprint = 'a'.repeat(64);
const bootstrap = {
  fingerprint,
  startTick: 420,
  identity: {
    release: 'Alpha',
    buildIdentity: 'build',
    gameplayContract: { id: 'challenging-hard', name: 'A CHALLENGING HARD', version: 1 },
  },
};
const packaged = {
  schema: 'tideweft-performance-baseline/v2',
  repositoryAtCapture: {
    head: 'a'.repeat(40),
    dirty: false,
    trackedDiffSha256: 'b'.repeat(64),
    ignoredMetadata: 'not copied',
  },
  captureScope: {
    kind: 'partial-diagnostic',
    complete: false,
    expectedScenarioIds: ['estuary-desktop-relief'],
    selectedScenarioIds: ['estuary-desktop-relief'],
    ignoredMetadata: 'not copied',
  },
  packagedExecutable: {
    path: '/not/copied',
    binary: { bytes: 10, sha256: 'c'.repeat(64), ignoredMetadata: true },
    applicationArchive: { bytes: 20, sha256: 'd'.repeat(64), ignoredMetadata: true },
    ignoredMetadata: 'not copied',
  },
  identity: {
    release: 'Alpha',
    buildIdentity: 'build',
    gameplayContract: {
      id: 'challenging-hard',
      name: 'A CHALLENGING HARD',
      version: 1,
      ignoredMetadata: 'not copied',
    },
    ignoredMetadata: 'not copied',
  },
  worlds: {
    estuary: {
      seed: 'runtime baseline estuary',
      startTick: 420,
      initialProjectionSha256: fingerprint,
    },
  },
};
const packagedComparison = validatePackagedReference(packaged, bootstrap);
assert.equal(packagedComparison.world.startTick, 420);
assert.deepEqual(Object.keys(packagedComparison.repositoryAtCapture), [
  'head',
  'dirty',
  'trackedDiffSha256',
]);
assert.deepEqual(Object.keys(packagedComparison.packagedExecutable), [
  'binary',
  'applicationArchive',
]);
assert.equal(Object.hasOwn(packagedComparison.packagedExecutable, 'path'), false);
assert.equal(Object.hasOwn(packagedComparison.identity, 'ignoredMetadata'), false);
assert.equal(
  Object.hasOwn(packagedComparison.identity.gameplayContract, 'ignoredMetadata'),
  false,
);
assert.throws(
  () => validatePackagedReference(packaged, { ...bootstrap, fingerprint: 'c'.repeat(64) }),
  /does not match/u,
);
assert.throws(
  () => validatePackagedReference(packaged, {
    ...bootstrap,
    identity: {
      ...bootstrap.identity,
      gameplayContract: { ...bootstrap.identity.gameplayContract, version: 2 },
    },
  }),
  /does not match/u,
);

assert.deepEqual(sanitizeCapabilities({
  browserName: 'firefox',
  browserVersion: '156.0.1',
  platformName: 'mac',
  userAgent: 'ua',
  'moz:buildID': 'build',
  'moz:headless': true,
  'moz:profile': '/tmp/browser-profile',
  'moz:processID': 123,
}), {
  browserName: 'firefox',
  browserVersion: '156.0.1',
  platformName: 'mac',
  userAgent: 'ua',
  buildId: 'build',
  headless: true,
});

const manifest = [
  { path: 'assets/a.js', bytes: 10, sha256: '1'.repeat(64) },
  { path: 'index.html', bytes: 20, sha256: '2'.repeat(64) },
];
assert.equal(manifestIntegrity(manifest), manifestIntegrity(structuredClone(manifest)));
assert.notEqual(
  manifestIntegrity(manifest),
  manifestIntegrity([{ ...manifest[0], bytes: 11 }, manifest[1]]),
);

const cleanDiagnostics = {
  errors: 0,
  unhandledRejections: 0,
  securityPolicyViolations: 1,
  evalPolicyViolations: 1,
  inlinePolicyViolations: 0,
  otherPolicyViolations: 0,
};
assert.equal(assertDiagnosticSnapshot(cleanDiagnostics, 'synthetic'), cleanDiagnostics);
assert.throws(
  () => assertNoGuardedDiagnosticIncrease(
    cleanDiagnostics,
    {
      ...cleanDiagnostics,
      securityPolicyViolations: 2,
      otherPolicyViolations: 1,
    },
  ),
  /diagnostics changed/u,
);
assert.equal(
  assertNoGuardedDiagnosticIncrease(cleanDiagnostics, { ...cleanDiagnostics }),
  true,
);
assert.throws(
  () => assertNoGuardedDiagnosticIncrease(
    cleanDiagnostics,
    { ...cleanDiagnostics, errors: 1 },
  ),
  /diagnostics changed/u,
);
assert.throws(
  () => assertDiagnosticSnapshot(
    { ...cleanDiagnostics, securityPolicyViolations: 2 },
    'synthetic',
  ),
  /invalid browser diagnostic evidence/u,
);

const advancingMeasurement = {
  frameSample: {
    reason: 'sample-window-complete',
    startTick: 420,
    endTick: 421,
    telemetry: { runtime: { worldAdvanceStep: { totalCount: 1 } } },
  },
};
assert.equal(assertAdvancingWorldMeasurement(advancingMeasurement), advancingMeasurement);
assert.throws(
  () => assertAdvancingWorldMeasurement({
    frameSample: {
      ...advancingMeasurement.frameSample,
      endTick: 420,
      telemetry: { runtime: { worldAdvanceStep: { totalCount: 0 } } },
    },
  }),
  /did not observe a complete advancing-world sample/u,
);

async function testArtifactPathBoundary() {
  const testDirectory = path.resolve(
    __dirname,
    '..',
    'artifacts',
    `browser-performance-selftest-${process.pid}`,
  );
  const reference = path.join(testDirectory, 'reference.json');
  const link = path.join(testDirectory, 'reference-link.json');
  const hardLink = path.join(testDirectory, 'reference-hard-link.json');
  const output = path.join(testDirectory, 'output.json');
  await fs.mkdir(testDirectory);
  try {
    await fs.writeFile(reference, '{}\n', { flag: 'wx', mode: 0o600 });
    assert.equal(
      await validateArtifactPath(reference, 'synthetic reference', { mustExist: true }),
      reference,
    );
    assert.equal(await validateArtifactPath(output, 'synthetic output'), output);
    assert.equal(await assertFreshVoicePresentationOutput(output), output);
    await assert.rejects(assertFreshVoicePresentationOutput(reference), /fresh --output stem/u);
    assert.equal(await fs.readFile(reference, 'utf8'), '{}\n');
    const screenshot = path.join(testDirectory, 'output-390-relief-3d.png');
    await fs.writeFile(screenshot, 'retained synthetic image', { flag: 'wx' });
    await assert.rejects(assertFreshVoicePresentationOutput(output), /fresh --output stem/u);
    assert.equal(await fs.readFile(screenshot, 'utf8'), 'retained synthetic image');
    await assert.rejects(fs.access(output), { code: 'ENOENT' });
    assert.equal(await existingPathsShareFileIdentity(reference, reference), true);
    assert.equal(await existingPathsShareFileIdentity(reference, output), false);
    await fs.link(reference, hardLink);
    assert.equal(await existingPathsShareFileIdentity(reference, hardLink), true);
    await fs.symlink('reference.json', link, 'file');
    await assert.rejects(
      validateArtifactPath(link, 'synthetic link', { mustExist: true }),
      /symbolic link/u,
    );
    await assert.rejects(
      validateArtifactPath(link, 'synthetic output link'),
      /symbolic link/u,
    );
  } finally {
    await fs.rm(testDirectory, { recursive: true });
  }
}

testArtifactPathBoundary()
  .then(() => process.stdout.write('browser performance self-test passed\n'))
  .catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });

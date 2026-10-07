'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const {
  BASE_PATH,
  SCENARIO,
  assertAdvancingWorldMeasurement,
  assertVoicePresentationSnapshot,
  assertPairedGreetingSnapshot,
  assertVoicePresentationMatrix,
  assertNativeCaptureContinuity,
  assertNativeCaptionLease,
  matchObservedSpeechCaption,
  observedGreetingCaptionEvidence,
  nativeControlRectangle,
  nativeCaptionLeaseEvidence,
  voicePresentationStates,
  normalizeExpiredVoiceAnnouncements,
  anonymousAnimalCaptionExpectation,
  countAnimalAnnouncementCopies,
  assertRestoredVoiceSnapshot,
  assertFreshVoicePresentationOutput,
  assertDiagnosticSnapshot,
  assertNoGuardedDiagnosticIncrease,
  decodeRemoteValue,
  createBrowserEventMonitor,
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

const controlRect = { x: 8.2, y: 5.6, width: 100, height: 24 };
const controlChild = {};
const controlNode = { hidden: false, disabled: false,
  getBoundingClientRect: () => controlRect,
  contains: (node) => node === controlChild };
let controlHit = controlNode;
let controlPresent = true;
let lastControlPoint;
const controlDocument = {
  defaultView: { innerWidth: 1280, innerHeight: 720 },
  querySelector: () => controlPresent ? controlNode : null,
  elementFromPoint: (x, y) => { lastControlPoint = [x, y]; return controlHit; },
};
assert.deepEqual(nativeControlRectangle(controlDocument, '.button'), controlRect);
assert.deepEqual(lastControlPoint, [58, 18]);
controlHit = controlChild;
assert.deepEqual(nativeControlRectangle(controlDocument, '.button'), controlRect);
for (const hit of [null, {}]) {
  controlHit = hit;
  assert.equal(nativeControlRectangle(controlDocument, '.button'), null);
}
controlHit = controlNode;
for (const flag of ['hidden', 'disabled']) {
  controlNode[flag] = true;
  assert.equal(nativeControlRectangle(controlDocument, '.button'), null);
  controlNode[flag] = false;
}
controlPresent = false;
assert.equal(nativeControlRectangle(controlDocument, '.button'), null);
controlPresent = true;
for (const rect of [
  { ...controlRect, width: 0 }, { ...controlRect, height: -1 },
  { ...controlRect, x: Number.NaN }, { ...controlRect, width: Number.POSITIVE_INFINITY },
  { ...controlRect, x: -51 }, { ...controlRect, y: -20 },
  { ...controlRect, x: 1230 }, { ...controlRect, y: 708 },
]) {
  controlNode.getBoundingClientRect = () => rect;
  assert.equal(nativeControlRectangle(controlDocument, '.button'), null);
}
controlNode.getBoundingClientRect = () => controlRect;
const viewport = controlDocument.defaultView;
for (const invalid of [null, {}, { innerWidth: Number.NaN, innerHeight: 720 }]) {
  controlDocument.defaultView = invalid;
  assert.equal(nativeControlRectangle(controlDocument, '.button'), null);
}
controlDocument.defaultView = viewport;
// The serialized helper must not depend on a Node closure when read in-page.
assert.deepEqual(new Function(`return (${nativeControlRectangle.toString()})`)()(
  controlDocument, '.button'), controlRect);

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
assert.equal(functional.pairedGreetings, false);
assert.equal(functional.reducedMotion, true);
assert.equal(functional.packagedBaseline, null);
assert.equal(parsed.voicePresentation, false);
assert.equal(parsed.animalPresentation, false);
assert.equal(parsed.pairedGreetings, false);
const animalFunctional = parseArguments(['--animal-presentation', '--reduced-motion']);
assert.equal(animalFunctional.voicePresentation, true);
assert.equal(animalFunctional.animalPresentation, true);
assert.equal(animalFunctional.pairedGreetings, false);
assert.equal(animalFunctional.packagedBaseline, null);
assert.equal(animalFunctional.reducedMotion, true);
assert.throws(() => parseArguments(['--animal-presentation', '--voice-presentation']), /Choose one/u);
assert.throws(() => parseArguments(['--animal-presentation', '--observe-voice']), /do not combine/u);
assert.throws(() => parseArguments(['--animal-presentation', '--sample-ms', '5000']), /functional check/u);
assert.throws(() => parseArguments(['--animal-presentation', '--packaged-baseline', 'artifacts/a.json']), /functional check/u);
const pairedFunctional = parseArguments(['--paired-greetings', '--reduced-motion',
  '--output', 'artifacts/validation/paired-greetings.json']);
assert.equal(pairedFunctional.voicePresentation, true);
assert.equal(pairedFunctional.pairedGreetings, true);
assert.equal(pairedFunctional.animalPresentation, false);
assert.equal(pairedFunctional.packagedBaseline, null);
assert.equal(pairedFunctional.reducedMotion, true);
assert.equal(pairedFunctional.observeVoice, false);
assert.equal(parseArguments(['--paired-greetings']).reducedMotion, false);
for (const conflict of [
  ['--voice-presentation'], ['--animal-presentation'], ['--observe-voice'],
  ['--sample-ms', '5000'], ['--sample-ms=5000'],
  ['--packaged-baseline', 'artifacts/a.json'], ['--packaged-baseline=artifacts/a.json'],
]) {
  assert.throws(() => parseArguments(['--paired-greetings', ...conflict]));
  assert.throws(() => parseArguments([...conflict, '--paired-greetings']));
}
const presentationStates = [
  { viewport: { width: 1280, height: 720 }, mode: 'chart-2d' },
  { viewport: { width: 1280, height: 720 }, mode: 'relief-3d' },
  { viewport: { width: 390, height: 844 }, mode: 'chart-2d' },
  { viewport: { width: 390, height: 844 }, mode: 'relief-3d' },
  { viewport: { width: 320, height: 640 }, mode: 'chart-2d' },
  { viewport: { width: 320, height: 640 }, mode: 'relief-3d' },
  { viewport: { width: 844, height: 390 }, mode: 'chart-2d' },
  { viewport: { width: 844, height: 390 }, mode: 'relief-3d' },
];
assert.deepEqual(voicePresentationStates(), presentationStates);
assert.deepEqual(voicePresentationStates(null), presentationStates);
assert.equal(functional.presentationState, null);
for (const producer of ['--voice-presentation', '--animal-presentation', '--paired-greetings']) {
  for (const state of presentationStates) {
    const selected = parseArguments([producer, '--presentation-width', String(state.viewport.width),
      '--presentation-mode', state.mode]);
    assert.deepEqual(selected.presentationState, state);
    assert.deepEqual(voicePresentationStates(selected.presentationState), [state]);
    assert.equal(selected.voicePresentation, true);
    assert.equal(selected.packagedBaseline, null);
  }
}
for (const arguments_ of [
  ['--presentation-width', '390'],
  ['--presentation-mode', 'chart-2d'],
  ['--presentation-width', '391', '--presentation-mode', 'chart-2d'],
  ['--presentation-width', '390', '--presentation-mode', 'relief'],
  ['--presentation-width', '390.5', '--presentation-mode', 'chart-2d'],
  ['--presentation-width', '0', '--presentation-mode', 'chart-2d'],
  ['--presentation-width', '1281', '--presentation-mode', 'chart-2d'],
  ['--presentation-width=390', '--presentation-mode', 'chart-2d'],
  ['--presentation-width', '390', '--presentation-mode=chart-2d'],
  ['--presentation-width'],
  ['--presentation-width', '390', '--presentation-mode'],
]) assert.throws(() => parseArguments(['--voice-presentation', ...arguments_]));
assert.throws(() => parseArguments(['--packaged-baseline', 'artifacts/performance/package.json',
  '--presentation-width', '390', '--presentation-mode', 'chart-2d']), /Functional/u);
for (const state of [{}, { viewport: { width: 390, height: 845 }, mode: 'chart-2d' },
  { viewport: { width: 391, height: 844 }, mode: 'chart-2d' },
  { viewport: { width: 390, height: 844 }, mode: 'relief' },
  { viewport: { width: '390', height: 844 }, mode: 'chart-2d' }]) {
  assert.throws(() => voicePresentationStates(state), /Unsupported/u);
}
assert.equal(parsed.observeVoice, false);
assert.equal(parseArguments(['--packaged-baseline', 'artifacts/performance/package.json',
  '--observe-voice']).observeVoice, true);
assert.equal(parseArguments(['--packaged-baseline', 'artifacts/performance/package.json',
  '--observe-voice']).pairedGreetings, false);
assert.throws(() => parseArguments(['--voice-presentation', '--observe-voice']), /do not combine/u);
assert.throws(() => parseArguments(['--observe-voice']), /--packaged-baseline is required/u);

assert.deepEqual(normalizeExpiredVoiceAnnouncements(null), []);
assert.deepEqual(normalizeExpiredVoiceAnnouncements('First: hello'), ['First: hello']);
const expiredPair = ['First: hello', 'Second: good day'];
assert.deepEqual(normalizeExpiredVoiceAnnouncements(expiredPair), expiredPair);
assert.notEqual(normalizeExpiredVoiceAnnouncements(expiredPair), expiredPair);
for (const invalid of [undefined, '', [], Array(1), ['first', ...Array(1)], [''], [null], ['x'.repeat(1025)],
  ['one', 'two', 'three'], Array(10000), 42, {}]) {
  assert.throws(() => normalizeExpiredVoiceAnnouncements(invalid), /bounded announcements/u);
}

const startupCounters = { errors: 0, unhandledRejections: 0, securityPolicyViolations: 0,
  evalPolicyViolations: 0, inlinePolicyViolations: 0, otherPolicyViolations: 0 };
const evalDenial = {
  level: 'error', type: 'javascript',
  text: "Content-Security-Policy: The page’s settings blocked a JavaScript eval (script-src) from being executed because it violates the following directive: “script-src 'self'” (Missing 'unsafe-eval')",
  source: { context: 'target', realm: 'initial-realm' }, stackTrace: { callFrames: [] },
};
const startupWithProbe = { ...startupCounters, securityPolicyViolations: 1, evalPolicyViolations: 1 };
function eventMonitorFixture(functionalReload = false, probes = []) {
  const listeners = new Map();
  const client = {
    onEvent(name, handler) { listeners.set(name, handler); return () => listeners.delete(name); },
    throwIfNotificationFailed() {},
  };
  const monitor = createBrowserEventMonitor(client, 'target', 'http://127.0.0.1/tideweft/', { functionalReload });
  const emit = (name, event) => listeners.get(name)?.({ context: 'target', ...event });
  emit('browsingContext.navigationStarted', { url: 'http://127.0.0.1/tideweft/' });
  probes.forEach((event) => emit('log.entryAdded', event));
  monitor.beginGuarded(probes.length ? startupWithProbe : startupCounters, 'initial-realm');
  return { monitor, emit };
}

const ordinaryMonitor = eventMonitorFixture();
assert.throws(() => ordinaryMonitor.monitor.allowOneFunctionalReload(), /unavailable/u);
ordinaryMonitor.emit('browsingContext.navigationStarted', { url: 'http://127.0.0.1/tideweft/' });
assert.throws(() => ordinaryMonitor.monitor.assertClean(), /contaminated/u);
const reloadMonitor = eventMonitorFixture(true);
reloadMonitor.monitor.allowOneFunctionalReload();
assert.throws(() => reloadMonitor.monitor.assertClean(), /contaminated/u);
reloadMonitor.emit('browsingContext.navigationStarted', { url: 'http://127.0.0.1/tideweft/' });
reloadMonitor.monitor.finishFunctionalReloadStartup(startupCounters, 'reloaded-realm');
assert.equal(reloadMonitor.monitor.assertClean().functionalReloads, 1);
assert.throws(() => reloadMonitor.monitor.allowOneFunctionalReload(), /already used/u);
reloadMonitor.emit('browsingContext.navigationStarted', { url: 'http://127.0.0.1/tideweft/' });
assert.throws(() => reloadMonitor.monitor.assertClean(), /contaminated/u);
const wrongReload = eventMonitorFixture(true);
wrongReload.monitor.allowOneFunctionalReload();
wrongReload.emit('browsingContext.navigationStarted', { url: 'http://127.0.0.1/other/' });
assert.throws(() => wrongReload.monitor.assertClean(), /contaminated/u);
for (const [name, event] of [
  ['log.entryAdded', { level: 'error' }],
  ['browsingContext.userPromptOpened', {}],
  ['browsingContext.contextDestroyed', {}],
]) {
  const guardedReload = eventMonitorFixture(true);
  guardedReload.monitor.allowOneFunctionalReload();
  guardedReload.emit('browsingContext.navigationStarted', { url: 'http://127.0.0.1/tideweft/' });
  guardedReload.emit(name, event);
  assert.throws(() => guardedReload.monitor.assertClean(), /contaminated/u);
}

function beginProbeReload() {
  const fixture = eventMonitorFixture(true, [evalDenial]);
  fixture.monitor.allowOneFunctionalReload();
  fixture.emit('browsingContext.navigationStarted', { url: 'http://127.0.0.1/tideweft/' });
  return fixture;
}
const expectedReload = beginProbeReload();
expectedReload.emit('log.entryAdded', { ...evalDenial, source: { context: 'target', realm: 'reloaded-realm' } });
expectedReload.monitor.finishFunctionalReloadStartup(startupWithProbe, 'reloaded-realm');
assert.equal(expectedReload.monitor.assertClean().verifiedReloadStartupEvalDenials, 1);
assert.equal(expectedReload.monitor.assertClean().guardedErrorLogs, 1);
// The same denial during resumed play remains a new guarded failure.
expectedReload.emit('log.entryAdded', { ...evalDenial, source: { context: 'target', realm: 'reloaded-realm' } });
assert.throws(() => expectedReload.monitor.assertClean(), /contaminated/u);
for (const changes of [
  { text: evalDenial.text + ' changed' }, { text: 'Unexpected application error' },
  { text: evalDenial.text + 'x'.repeat(1024) }, { type: 'console' },
  { source: { context: 'target', realm: 'initial-realm' } }, { source: { context: 'target' } },
  { stackTrace: { callFrames: [{ functionName: 'unexpected', url: 'test.js', lineNumber: 1, columnNumber: 0 }] } },
  { stackTrace: { callFrames: 'not-an-array' } },
  { stackTrace: null }, { stackTrace: 'not-a-record' }, { stackTrace: { callFrames: null } },
  { stackTrace: undefined },
]) {
  const fixture = beginProbeReload();
  fixture.emit('log.entryAdded', { ...evalDenial, source: { context: 'target', realm: 'reloaded-realm' }, ...changes });
  assert.throws(() => fixture.monitor.finishFunctionalReloadStartup(startupWithProbe, 'reloaded-realm'), /baseline/u);
}
for (const count of [0, 2]) {
  const fixture = beginProbeReload();
  for (let index = 0; index < count; index += 1) fixture.emit('log.entryAdded', {
    ...evalDenial, source: { context: 'target', realm: 'reloaded-realm' },
  });
  assert.throws(() => fixture.monitor.finishFunctionalReloadStartup(startupWithProbe, 'reloaded-realm'), /baseline/u);
}
for (const realm of [null, 'initial-realm', '']) {
  const fixture = beginProbeReload();
  assert.throws(() => fixture.monitor.finishFunctionalReloadStartup(startupWithProbe, realm), /realm/u);
}
for (const [name, event] of [
  ['log.entryAdded', { level: 'error', text: 'Unexpected application error' }],
  ['browsingContext.userPromptOpened', {}], ['browsingContext.contextDestroyed', {}],
]) {
  const fixture = beginProbeReload();
  fixture.emit('log.entryAdded', { ...evalDenial, source: { context: 'target', realm: 'reloaded-realm' } });
  fixture.emit(name, event);
  if (name === 'log.entryAdded') {
    assert.throws(() => fixture.monitor.finishFunctionalReloadStartup(startupWithProbe, 'reloaded-realm'), /baseline/u);
  } else {
    fixture.monitor.finishFunctionalReloadStartup(startupWithProbe, 'reloaded-realm');
    assert.throws(() => fixture.monitor.assertClean(), /contaminated/u);
  }
}
for (const armed of [false, true]) {
  const fixture = eventMonitorFixture(true, [evalDenial]);
  if (armed) fixture.monitor.allowOneFunctionalReload();
  fixture.emit('log.entryAdded', evalDenial);
  assert.throws(() => fixture.monitor.assertClean(), /contaminated/u);
}
for (const changes of [{ errors: 1 }, { unhandledRejections: 1 }, { securityPolicyViolations: 2,
  inlinePolicyViolations: 1 }, { securityPolicyViolations: 2, evalPolicyViolations: 2 }]) {
  const fixture = beginProbeReload();
  fixture.emit('log.entryAdded', { ...evalDenial, source: { context: 'target', realm: 'reloaded-realm' } });
  assert.throws(() => fixture.monitor.finishFunctionalReloadStartup({ ...startupWithProbe, ...changes }, 'reloaded-realm'), /diagnostics/u);
}

const restoredVoice = { mode: 'chart-2d', tick: 430, viewport: { width: 390, height: 844 },
  expiredEventAbsent: true, currentSaveAccepted: true, observerPresent: true,
  observerOverflow: false, oldGreetingAnnouncements: 0 };
assert.equal(assertRestoredVoiceSnapshot(restoredVoice, 'chart-2d', 430), restoredVoice);
for (const change of [
  { expiredEventAbsent: false }, { currentSaveAccepted: false }, { observerPresent: false },
  { observerOverflow: true }, { oldGreetingAnnouncements: 1 }, { oldGreetingAnnouncements: null },
  { mode: 'relief-3d' }, { tick: 429 }, { viewport: { width: 0, height: 844 } },
]) assert.throws(() => assertRestoredVoiceSnapshot({ ...restoredVoice, ...change }, 'chart-2d', 430), /stale speech/u);
assert.throws(() => parseArguments(['--voice-presentation', '--sample-ms', '5000']), /functional check/u);
assert.throws(() => parseArguments(['--voice-presentation', '--packaged-baseline', 'artifacts/a.json']), /functional check/u);
assert.throws(() => parseArguments(['--voice-presentation', '--output', 'docs/voice.json']), /ignored artifacts/u);
assert.throws(() => parseArguments(['--reduced-motion', '--packaged-baseline', 'artifacts/a.json']), /requires --voice-presentation/u);

// Supplied observations characterize the evidence validator, not native timing.
// UI reading expiry and authoritative projected-event expiry are separate gates.
const readingLease = Object.freeze({ visibleCodePoints: 16, firstVisibleMs: 100,
  observedAtMs: 600, expectedReadingMs: 1000, endedAtMs: null, endReason: null });
assert.equal(assertNativeCaptionLease(readingLease), readingLease);
for (const [visibleCodePoints, expectedReadingMs] of [
  [1, 1000], [16, 1000], [21, 1000], [22, 1048], [85, 4048], [1024, 48762],
]) {
  const lease = { ...readingLease, visibleCodePoints, expectedReadingMs };
  assert.equal(assertNativeCaptionLease(lease), lease);
  assert.throws(() => assertNativeCaptionLease({ ...lease, expectedReadingMs: expectedReadingMs + 1 }),
    /reading-lease/u);
}
// The 100 ms bound is observer delivery tolerance, not extra shipping lifetime.
const latestLiveObservation = { ...readingLease, observedAtMs: 1200 };
assert.equal(assertNativeCaptionLease(latestLiveObservation), latestLiveObservation);
assert.throws(() => assertNativeCaptionLease({ ...latestLiveObservation, observedAtMs: 1200.001 }),
  /expired or invalid/u);
const expiredReadingLease = Object.freeze({ ...readingLease, observedAtMs: 1200,
  endedAtMs: 1100, endReason: 'hidden' });
assert.equal(assertNativeCaptionLease(expiredReadingLease, { expired: true }), expiredReadingLease);
assert.throws(() => assertNativeCaptionLease(expiredReadingLease), /expired or invalid/u);
assert.throws(() => assertNativeCaptionLease(readingLease, { expired: true }), /reading-lease/u);
const earliestExpiryObservation = { ...expiredReadingLease, endedAtMs: 1000 };
assert.equal(assertNativeCaptionLease(earliestExpiryObservation, { expired: true }), earliestExpiryObservation);
const naturallyReplacedLease = { ...expiredReadingLease, endReason: 'replacement' };
assert.equal(assertNativeCaptionLease(naturallyReplacedLease, { expired: true }), naturallyReplacedLease);
assert.throws(() => assertNativeCaptionLease({ ...naturallyReplacedLease, endedAtMs: 999.999 },
  { expired: true }), /reading-lease/u);
for (const change of [
  { endedAtMs: 999.999 }, { endedAtMs: 1201 }, { endedAtMs: Number.NaN },
  { endedAtMs: Infinity }, { endReason: 'urgent-preemption' }, { endReason: null },
]) assert.throws(() => assertNativeCaptionLease({ ...expiredReadingLease, ...change }, { expired: true }),
  /reading-lease/u);
for (const change of [
  { visibleCodePoints: 0 }, { visibleCodePoints: 1025 }, { visibleCodePoints: 1.5 },
  { visibleCodePoints: '16' }, { visibleCodePoints: Number.NaN },
  { firstVisibleMs: -1 }, { firstVisibleMs: Number.NaN }, { firstVisibleMs: Infinity },
  { observedAtMs: 99 }, { observedAtMs: Number.NaN }, { observedAtMs: Infinity },
  { expectedReadingMs: 999 }, { endedAtMs: 1100 }, { endedAtMs: undefined },
]) assert.throws(() => assertNativeCaptionLease({ ...readingLease, ...change }), /reading-lease/u);
for (const lease of [null, undefined, {}, []]) {
  assert.throws(() => assertNativeCaptionLease(lease), /reading-lease/u);
}

const observedNativeLease = Object.freeze({ id: 'observed-a', visibleText: 'x'.repeat(16),
  firstVisibleMs: 100, expectedReadingMs: 1000, endedAtMs: null, endReason: null });
const nativeProbe = Object.freeze({ overflow: false, leases: Object.freeze([observedNativeLease]) });
const nativeEvidence = nativeCaptionLeaseEvidence(nativeProbe, 'observed-a', 600);
assert.deepEqual(nativeEvidence, readingLease);
assert.notEqual(nativeEvidence, observedNativeLease);
assert.equal(assertNativeCaptionLease(nativeEvidence), nativeEvidence);
assert.equal(nativeCaptionLeaseEvidence(nativeProbe, 'observed-a', 700).firstVisibleMs, 100);
const supplementaryProbe = { overflow: false, leases: [{ ...observedNativeLease,
  visibleText: '😀'.repeat(21) }] };
const supplementaryEvidence = nativeCaptionLeaseEvidence(supplementaryProbe, 'observed-a', 600);
assert.equal(supplementaryEvidence.visibleCodePoints, 21);
assert.equal(assertNativeCaptionLease(supplementaryEvidence), supplementaryEvidence);
const prefixedProbe = { overflow: false, leases: [{ ...observedNativeLease,
  visibleText: `A: ${'x'.repeat(19)}`, expectedReadingMs: 1048 }] };
assert.equal(nativeCaptionLeaseEvidence(prefixedProbe, 'observed-a', 600).visibleCodePoints, 22);
const endedProbe = { overflow: false, leases: [{ ...observedNativeLease,
  endedAtMs: 1100, endReason: 'hidden' }] };
const endedEvidence = nativeCaptionLeaseEvidence(endedProbe, 'observed-a', 1200);
assert.deepEqual(endedEvidence, expiredReadingLease);
assert.equal(assertNativeCaptionLease(endedEvidence, { expired: true }), endedEvidence);
assert.throws(() => assertNativeCaptionLease(endedEvidence), /reading-lease/u);
assert.throws(() => nativeCaptionLeaseEvidence(nativeProbe, 'foreign-id', 600), /missing/u);
assert.throws(() => nativeCaptionLeaseEvidence({ ...nativeProbe, overflow: true }, 'observed-a', 600), /overflowed/u);
assert.throws(() => nativeCaptionLeaseEvidence({ ...nativeProbe,
  leases: [observedNativeLease, { ...observedNativeLease, firstVisibleMs: 200 }] }, 'observed-a', 600), /repeated/u);
assert.throws(() => nativeCaptionLeaseEvidence({ ...nativeProbe, leases: [] }, 'observed-a', 600), /missing/u);
assert.throws(() => assertNativeCaptionLease(nativeCaptionLeaseEvidence(nativeProbe, 'observed-a', 1201)),
  /reading-lease/u);

// A routine newer UIView caption does not invalidate the older lawful DOM slot.
// Authentication uses the actual DOM ID and its exact observed speaker/text/ARIA.
const observedSpeechA = Object.freeze({ id: 'speech-a', speakerLabel: 'First resident', text: 'Hello there.' });
const observedSpeechB = Object.freeze({ id: 'speech-b', speakerLabel: 'Second resident', text: 'Good day.' });
const observedSpeechPair = Object.freeze([observedSpeechA, observedSpeechB]);
const observedCuePair = observedSpeechPair.map((caption) => ({ id: caption.id, text: caption.text,
  sourceKind: 'human', acousticKind: 'speech' }));
assert.deepEqual(observedGreetingCaptionEvidence(observedSpeechA, observedSpeechA, observedCuePair), {
  captions: [observedSpeechA], announcements: ['First resident: Hello there.'],
});
assert.deepEqual(observedGreetingCaptionEvidence(observedSpeechA, observedSpeechB, observedCuePair), {
  captions: [...observedSpeechPair], announcements: ['First resident: Hello there.', 'Second resident: Good day.'],
});
for (const [first, current, cues] of [
  [observedSpeechA, { ...observedSpeechA, speakerLabel: 'Changed heading' }, observedCuePair],
  [observedSpeechA, { ...observedSpeechB, id: 'foreign' }, observedCuePair],
  [observedSpeechA, { ...observedSpeechB, text: 'Invented caption' }, observedCuePair],
  [observedSpeechA, { ...observedSpeechB, speakerLabel: '' }, observedCuePair],
  [observedSpeechA, observedSpeechB, [observedCuePair[0], observedCuePair[0]]],
  [observedSpeechA, observedSpeechB, observedCuePair.map((cue) => ({ ...cue, sourceKind: 'animal' }))],
]) assert.throws(() => observedGreetingCaptionEvidence(first, current, cues), /greeting|caption/u);
assert.equal(matchObservedSpeechCaption('speech-a', 'First resident:', 'Hello there.',
  'First resident: Hello there.', observedSpeechPair), true);
assert.equal(matchObservedSpeechCaption('speech-b', 'Second resident:', 'Good day.',
  'Second resident: Good day.', observedSpeechPair), true);
assert.equal(matchObservedSpeechCaption('speech-a', 'First resident:', 'Hello there.',
  'First resident: Hello there.', [observedSpeechA]), true);
for (const [id, speaker, text, aria] of [
  ['foreign-id', 'First resident:', 'Hello there.', 'First resident: Hello there.'],
  ['speech-a', 'Second resident:', 'Good day.', 'Second resident: Good day.'],
  ['speech-a', 'First resident:', 'Good day.', 'First resident: Hello there.'],
  ['speech-a', 'First resident:', 'Hello there.', 'Second resident: Good day.'],
  ['speech-a', 'First resident', 'Hello there.', 'First resident: Hello there.'],
]) assert.equal(matchObservedSpeechCaption(id, speaker, text, aria, observedSpeechPair), false);
for (const captions of [null, undefined, [], {}, [observedSpeechA, observedSpeechB, observedSpeechA]]) {
  assert.throws(() => matchObservedSpeechCaption('speech-a', 'First resident:', 'Hello there.',
    'First resident: Hello there.', captions), /lawful observed speech/u);
}
for (const field of ['id', 'speakerLabel', 'text']) {
  for (const invalid of ['', undefined, null, 42, 'x'.repeat(1025)]) {
    assert.throws(() => matchObservedSpeechCaption('speech-a', 'First resident:', 'Hello there.',
      'First resident: Hello there.', [{ ...observedSpeechA, [field]: invalid }]), /lawful observed speech/u);
  }
}
for (const captions of [[null], Array(1), [observedSpeechA, { ...observedSpeechB, id: observedSpeechA.id }]]) {
  assert.throws(() => matchObservedSpeechCaption('speech-a', 'First resident:', 'Hello there.',
    'First resident: Hello there.', captions), /lawful observed speech/u);
}

const voiceSnapshot = {
  mode: 'relief-3d', viewport: { width: 390, height: 844 }, labelLayerAriaHidden: 'true',
  caption: { rect: { x: 20, y: 600, width: 350, height: 80 }, matchesProjection: true,
    ariaMatches: true, announcementCount: 1, horizontalOverflow: false, verticalOverflow: false,
    readingLease },
  feedback: { chronicle: { x: 20, y: 540, width: 350, height: 45 },
    dock: { x: 20, y: 710, width: 350, height: 95 } },
  labels: [{ rect: { x: 90, y: 230, width: 200, height: 40 }, matchesProjection: true,
    horizontalOverflow: false, verticalOverflow: false }],
};
// Supplied before/after observations characterize the screenshot race guard;
// they do not establish what an actual browser raster contains.
const captureBefore = { ...voiceSnapshot, tick: 420 };
const captureContinuity = { sameVisibleCaption: true, mode: captureBefore.mode,
  tick: captureBefore.tick, viewport: structuredClone(captureBefore.viewport),
  readingLease: { ...readingLease, observedAtMs: 700 } };
assert.equal(assertNativeCaptureContinuity(captureBefore, captureContinuity), captureContinuity);
const sameClockObservation = { ...captureContinuity, readingLease: { ...readingLease } };
assert.equal(assertNativeCaptureContinuity(captureBefore, sameClockObservation), sameClockObservation);
for (const after of [null, undefined, {},
  ...[false, 'true', 1, undefined].map((sameVisibleCaption) => ({ ...captureContinuity, sameVisibleCaption })),
  { ...captureContinuity, mode: 'chart-2d' },
  ...[421, '420', null, undefined, Number.NaN].map((tick) => ({ ...captureContinuity, tick })),
  { ...captureContinuity, viewport: { width: 390, height: 845 } },
  { ...captureContinuity, viewport: { width: '390', height: 844 } },
  { ...captureContinuity, viewport: undefined },
  { ...captureContinuity, readingLease: undefined },
  { ...captureContinuity, readingLease: { ...expiredReadingLease } },
  ...[{ firstVisibleMs: 101 }, { firstVisibleMs: '100' }, { visibleCodePoints: 17 },
    { visibleCodePoints: '16' }, { observedAtMs: 599 }, { observedAtMs: -1 },
    { observedAtMs: Number.NaN }, { observedAtMs: Infinity }, { observedAtMs: '700' },
    { observedAtMs: 1201 }, { expectedReadingMs: 1001 }].map((change) => ({
      ...captureContinuity, readingLease: { ...captureContinuity.readingLease, ...change },
    })),
]) assert.throws(() => assertNativeCaptureContinuity(captureBefore, after), /capture identity|reading-lease/u);
assert.equal(assertVoicePresentationSnapshot(voiceSnapshot, 'relief-3d'), voiceSnapshot);
const chartSnapshot = { ...voiceSnapshot, mode: 'chart-2d', labels: [] };
assert.equal(assertVoicePresentationSnapshot(chartSnapshot, 'chart-2d'), chartSnapshot);
const anonymousAnimal = { ...voiceSnapshot, labels: [], anonymousSourceUnanchored: true };
assert.equal(assertVoicePresentationSnapshot(anonymousAnimal, 'relief-3d', { anonymousAnimal: true }), anonymousAnimal);
assert.throws(() => assertVoicePresentationSnapshot({ ...anonymousAnimal, anonymousSourceUnanchored: false },
  'relief-3d', { anonymousAnimal: true }), /active renderer/u);
assert.throws(() => assertVoicePresentationSnapshot({ ...anonymousAnimal, labels: voiceSnapshot.labels },
  'relief-3d', { anonymousAnimal: true }), /active renderer/u);
const publicAnimalCaption = Object.freeze({ id: 'synthetic-call', speakerLabel: 'Sound',
  text: 'call', presentationKind: 'animal-call', animalCallKind: 'animal-call', directionLabel: 'east' });
assert.deepEqual(anonymousAnimalCaptionExpectation(publicAnimalCaption), {
  visibleText: 'call · east', announcement: '[An animal calls somewhere east.]',
});
assert.deepEqual(anonymousAnimalCaptionExpectation({ ...publicAnimalCaption,
  animalCallKind: 'chorus', text: 'chorus', directionLabel: 'all around' }), {
  visibleText: 'chorus · all around', announcement: '[A chorus sounds; the sound seems all around.]',
});
assert.equal(anonymousAnimalCaptionExpectation({ ...publicAnimalCaption, directionLabel: 'all around' })
  .announcement, '[An animal calls; the sound seems all around.]');
assert.equal(anonymousAnimalCaptionExpectation({ ...publicAnimalCaption, directionLabel: 'direction unclear' })
  .announcement, '[An animal calls; direction unclear.]');
assert.deepEqual(anonymousAnimalCaptionExpectation({ ...publicAnimalCaption,
  speakerLabel: 'A bird', animalCallKind: 'bird-call', text: 'CALL! CALL!', directionLabel: 'direction unclear' }), {
  visibleText: 'CALL! CALL! · direction unclear', announcement: '[A bird calls; direction unclear.]',
});
assert.equal(anonymousAnimalCaptionExpectation({ ...publicAnimalCaption, speakerLabel: 'An animal' })
  .announcement, '[An animal calls somewhere east.]');
for (const change of [{ speakerLabel: 'Secret caller' }, { animalCallKind: 'goat-call' },
  { speakerLabel: 'A bird' }, { directionLabel: 'exact hidden coordinates' },
  { presentationKind: 'physical' }, { directionLabel: undefined }, { id: '' }, { text: '' }]) {
  assert.throws(() => anonymousAnimalCaptionExpectation({ ...publicAnimalCaption, ...change }), /anonymous/u);
}
const animalCopy = '[A bird calls; direction unclear.]';
assert.equal(countAnimalAnnouncementCopies(Object.freeze([animalCopy]), animalCopy), 1);
assert.equal(countAnimalAnnouncementCopies([`${animalCopy} ${animalCopy}`], animalCopy), 2);
assert.equal(countAnimalAnnouncementCopies(['unrelated', `earlier ${animalCopy} later`, animalCopy], animalCopy), 2);
assert.equal(countAnimalAnnouncementCopies([], animalCopy), 0);
assert.throws(() => countAnimalAnnouncementCopies([animalCopy], ''), /bounded/u);
assert.throws(() => countAnimalAnnouncementCopies([null], animalCopy), /bounded/u);
assert.throws(() => countAnimalAnnouncementCopies(['x'.repeat(1025)], animalCopy), /bounded/u);
assert.throws(() => countAnimalAnnouncementCopies(Array(33).fill('x'), animalCopy), /bounded/u);
for (const caption of [null, { ...voiceSnapshot.caption, ariaMatches: false },
  { ...voiceSnapshot.caption, announcementCount: 2 },
  { ...voiceSnapshot.caption, matchesProjection: false },
  { ...voiceSnapshot.caption, rect: { x: 390, y: 1, width: 50, height: 50 } },
  { ...voiceSnapshot.caption, horizontalOverflow: true }]) {
  assert.throws(() => assertVoicePresentationSnapshot({ ...voiceSnapshot, caption }, 'relief-3d'), /caption/u);
}
for (const lease of [undefined, expiredReadingLease, { ...readingLease, observedAtMs: 1201 }]) {
  assert.throws(() => assertVoicePresentationSnapshot({ ...voiceSnapshot,
    caption: { ...voiceSnapshot.caption, readingLease: lease } }, 'relief-3d'), /reading-lease/u);
}
assert.throws(() => assertVoicePresentationSnapshot({ ...voiceSnapshot, labels: [] }, 'relief-3d'), /active renderer/u);
assert.throws(() => assertVoicePresentationSnapshot(voiceSnapshot, 'chart-2d'), /caption/u);
assert.throws(() => assertVoicePresentationSnapshot({ ...voiceSnapshot,
  labels: [...voiceSnapshot.labels, { ...voiceSnapshot.labels[0] }] }, 'relief-3d'), /overlap/u);
// Supplied DOM rectangles characterize the validator, not an actual native
// layout. Every feedback surface excludes labels, while touching is not overlap.
for (const feedbackRect of [voiceSnapshot.caption.rect,
  voiceSnapshot.feedback.chronicle, voiceSnapshot.feedback.dock]) {
  const intersecting = { ...voiceSnapshot,
    labels: [{ ...voiceSnapshot.labels[0], rect: {
      x: feedbackRect.x + 10, y: feedbackRect.y + 1, width: 200, height: 40,
    } }],
  };
  assert.throws(() => assertVoicePresentationSnapshot(intersecting, 'relief-3d'),
    /Voice DOM label overlaps field feedback/u);
  const touching = { ...voiceSnapshot,
    labels: [{ ...voiceSnapshot.labels[0], rect: {
      x: feedbackRect.x + feedbackRect.width, y: feedbackRect.y + 1, width: 20, height: 40,
    } }],
  };
  assert.equal(assertVoicePresentationSnapshot(touching, 'relief-3d'), touching);
}
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

// These supplied public-projection counts characterize the validator only;
// native acquisition of two lawful introductions is a separate functional proof.
const pairedSpeech = {
  cueCount: 2, sourceCount: 2, uniqueSignatureCount: 2,
  captionFromPair: true, labelsMatchOneToOne: true, visibleLabelCount: 2,
  ordinaryWorldLabelCount: 1, ordinaryWorldLabelOverlapCount: 0,
};
const pairedDesktop = {
  ...voiceSnapshot,
  viewport: { width: 1280, height: 720 },
  caption: { ...voiceSnapshot.caption, rect: { x: 20, y: 520, width: 350, height: 80 } },
  feedback: {
    chronicle: { x: 20, y: 455, width: 350, height: 45 },
    dock: { x: 20, y: 615, width: 350, height: 90 },
  },
  labels: [
    { ...voiceSnapshot.labels[0], rect: { x: 300, y: 150, width: 200, height: 40 } },
    { ...voiceSnapshot.labels[0], rect: { x: 520, y: 150, width: 200, height: 40 } },
  ],
  pairedSpeech,
};
assert.equal(assertPairedGreetingSnapshot(pairedDesktop, 'relief-3d'), pairedDesktop);
const pairedChart = { ...pairedDesktop, mode: 'chart-2d', labels: [],
  pairedSpeech: { ...pairedSpeech, visibleLabelCount: 0 } };
assert.equal(assertPairedGreetingSnapshot(pairedChart, 'chart-2d'), pairedChart);
const pairedCompactOne = { ...voiceSnapshot,
  pairedSpeech: { ...pairedSpeech, visibleLabelCount: 1 } };
assert.equal(assertPairedGreetingSnapshot(pairedCompactOne, 'relief-3d'), pairedCompactOne);
const pairedCompactTwo = { ...voiceSnapshot,
  labels: [...voiceSnapshot.labels,
    { ...voiceSnapshot.labels[0], rect: { x: 90, y: 300, width: 200, height: 40 } }],
  pairedSpeech };
assert.equal(assertPairedGreetingSnapshot(pairedCompactTwo, 'relief-3d'), pairedCompactTwo);
for (const ordinaryWorldLabelCount of [-1, 65, 0.5, '1', undefined, Number.NaN]) {
  assert.throws(() => assertPairedGreetingSnapshot({ ...pairedDesktop,
    pairedSpeech: { ...pairedSpeech, ordinaryWorldLabelCount } }, 'relief-3d'), /ordinary Relief/u);
}
for (const ordinaryWorldLabelOverlapCount of [1, '0', undefined, Number.NaN]) {
  assert.throws(() => assertPairedGreetingSnapshot({ ...pairedDesktop,
    pairedSpeech: { ...pairedSpeech, ordinaryWorldLabelOverlapCount } }, 'relief-3d'), /ordinary Relief/u);
}
assert.throws(() => assertPairedGreetingSnapshot({ ...pairedCompactTwo,
  labels: [...pairedCompactTwo.labels,
    { ...voiceSnapshot.labels[0], rect: { x: 90, y: 350, width: 200, height: 40 } }],
  pairedSpeech: { ...pairedSpeech, visibleLabelCount: 3 } }, 'relief-3d'));
// Compact layout may suppress one source, but the shared non-anonymous Relief
// assertion still refuses a wholly absent visible speech presentation.
assert.throws(() => assertPairedGreetingSnapshot({ ...pairedCompactOne, labels: [],
  pairedSpeech: { ...pairedSpeech, visibleLabelCount: 0 } }, 'relief-3d'), /active renderer/u);
assert.throws(() => assertPairedGreetingSnapshot({ ...pairedDesktop,
  labels: [pairedDesktop.labels[0]],
  pairedSpeech: { ...pairedSpeech, visibleLabelCount: 1 } }, 'relief-3d'));
assert.throws(() => assertPairedGreetingSnapshot({ ...pairedChart,
  pairedSpeech: { ...pairedSpeech, visibleLabelCount: 1 } }, 'chart-2d'));
assert.throws(() => assertPairedGreetingSnapshot({ ...pairedCompactOne,
  pairedSpeech: { ...pairedSpeech, visibleLabelCount: 2 } }, 'relief-3d'));
for (const field of ['cueCount', 'sourceCount', 'uniqueSignatureCount']) {
  for (const invalid of [0, 1, 3, 1.5, '2', undefined, Number.NaN]) {
    assert.throws(() => assertPairedGreetingSnapshot({ ...pairedDesktop,
      pairedSpeech: { ...pairedSpeech, [field]: invalid } }, 'relief-3d'));
  }
}
for (const field of ['captionFromPair', 'labelsMatchOneToOne']) {
  for (const invalid of [false, 'true', 1, undefined]) {
    assert.throws(() => assertPairedGreetingSnapshot({ ...pairedDesktop,
      pairedSpeech: { ...pairedSpeech, [field]: invalid } }, 'relief-3d'));
  }
}
for (const invalid of [-1, 0.5, 3, '2', null, undefined, Number.NaN, Infinity]) {
  assert.throws(() => assertPairedGreetingSnapshot({ ...pairedDesktop,
    pairedSpeech: { ...pairedSpeech, visibleLabelCount: invalid } }, 'relief-3d'));
}
for (const invalid of [null, undefined, []]) {
  assert.throws(() => assertPairedGreetingSnapshot({ ...pairedDesktop,
    pairedSpeech: invalid }, 'relief-3d'));
}
// Pair metadata never bypasses the established native geometry/ARIA checks.
assert.throws(() => assertPairedGreetingSnapshot({ ...pairedDesktop,
  labels: [pairedDesktop.labels[0], { ...pairedDesktop.labels[0] }] }, 'relief-3d'), /overlap/u);
assert.throws(() => assertPairedGreetingSnapshot({ ...pairedDesktop,
  labels: [{ ...pairedDesktop.labels[0], matchesProjection: false }, pairedDesktop.labels[1]] },
  'relief-3d'), /current heard projection/u);
assert.throws(() => assertPairedGreetingSnapshot({ ...pairedDesktop,
  labels: [pairedDesktop.labels[0], { ...pairedDesktop.labels[1],
    rect: { x: 1200, y: 150, width: 200, height: 40 } }] }, 'relief-3d'), /clipped/u);
assert.throws(() => assertPairedGreetingSnapshot({ ...pairedDesktop,
  caption: { ...pairedDesktop.caption, ariaMatches: false } }, 'relief-3d'), /caption/u);
assert.throws(() => assertPairedGreetingSnapshot({ ...pairedDesktop,
  feedback: { ...pairedDesktop.feedback, chronicle: { x: 20, y: 560, width: 350, height: 45 } } },
  'relief-3d'), /overlaps.*journey controls/u);

// Independent child clocks/causes are not one paused caption stretched through
// eight views. Each child needs its own live layout and natural DOM expiry.
const voiceMatrix = presentationStates.map((state) => {
  const { width, height } = state.viewport;
  return {
    repositoryAtCapture: { head: 'a'.repeat(40), dirty: false, trackedDiffSha256: 'b'.repeat(64) },
    productionWebArtifact: { manifestSha256: 'c'.repeat(64), files: [{ path: 'index.html', bytes: 20 }] },
    profilerHarness: { sha256: 'd'.repeat(64), bytes: 100 },
    browser: { executable: { sha256: 'e'.repeat(64), bytes: 200 }, versionOutput: 'Firefox synthetic' },
    captureScope: { kind: 'functional-voice-presentation', complete: false,
      selectedPresentationState: structuredClone(state), reducedMotion: false,
      expectedPresentationStates: structuredClone(presentationStates),
      expectedScenarioIds: ['native-greet'], selectedScenarioIds: ['native-greet'] },
    voicePresentation: {
      snapshots: [{ ...voiceSnapshot, mode: state.mode, viewport: structuredClone(state.viewport),
        tick: 420, reducedMotion: false,
        caption: { ...voiceSnapshot.caption, rect: { x: 10, y: height - 140, width: width - 20, height: 30 } },
        screenshot: { captionContinuity: { sameVisibleCaption: true, mode: state.mode,
          tick: 420, viewport: structuredClone(state.viewport),
          readingLease: { ...readingLease, observedAtMs: 700 } } },
        feedback: { chronicle: { x: 10, y: height - 190, width: width - 20, height: 30 },
          dock: { x: 10, y: height - 90, width: width - 20, height: 30 } },
        labels: state.mode === 'chart-2d' ? [] : [{ ...voiceSnapshot.labels[0],
          rect: { x: 10, y: 10, width: 100, height: 30 } }] }],
      lifecycle: { expired: { readingLeases: [{ ...expiredReadingLease }] } },
    },
  };
});
assert.equal(assertVoicePresentationMatrix(voiceMatrix), voiceMatrix);
const reorderedMatrix = structuredClone(voiceMatrix).reverse();
assert.equal(assertVoicePresentationMatrix(reorderedMatrix), reorderedMatrix);
const reducedMotionMatrix = structuredClone(voiceMatrix);
for (const child of reducedMotionMatrix) {
  child.captureScope.reducedMotion = true;
  child.voicePresentation.snapshots[0].reducedMotion = true;
}
assert.equal(assertVoicePresentationMatrix(reducedMotionMatrix), reducedMotionMatrix);
const animalMatrix = structuredClone(voiceMatrix);
for (const child of animalMatrix) {
  child.captureScope.expectedScenarioIds = ['native-anonymous-animal'];
  child.captureScope.selectedScenarioIds = ['native-anonymous-animal'];
  child.voicePresentation.snapshots[0].labels = [];
  child.voicePresentation.snapshots[0].anonymousSourceUnanchored = true;
  child.voicePresentation.lifecycle = { readingLeases: [{ ...expiredReadingLease }] };
}
assert.equal(assertVoicePresentationMatrix(animalMatrix), animalMatrix);
const pairedMatrix = structuredClone(voiceMatrix);
for (const child of pairedMatrix) {
  child.captureScope.expectedScenarioIds = ['native-paired-greetings'];
  child.captureScope.selectedScenarioIds = ['native-paired-greetings'];
  const snapshot = child.voicePresentation.snapshots[0];
  snapshot.labels = snapshot.mode === 'chart-2d' ? [] : [10, 130].map((x) => ({
    ...voiceSnapshot.labels[0], rect: { x, y: 10, width: 100, height: 30 },
  }));
  snapshot.pairedSpeech = { ...pairedSpeech, visibleLabelCount: snapshot.labels.length };
  child.voicePresentation.lifecycle.expired.readingLeases = [
    { ...naturallyReplacedLease }, { ...expiredReadingLease },
  ];
}
assert.equal(assertVoicePresentationMatrix(pairedMatrix), pairedMatrix);
for (const results of [null, undefined, {}, voiceMatrix.slice(0, 7), [...voiceMatrix, voiceMatrix[0]],
  [...voiceMatrix.slice(0, 7), voiceMatrix[0]]]) {
  assert.throws(() => assertVoicePresentationMatrix(results), /eight|duplicate/u);
}
function changedVoiceMatrixChild(change) {
  const results = structuredClone(voiceMatrix);
  change(results[1]);
  return results;
}
for (const change of [
  (child) => { child.captureScope.complete = true; },
  (child) => { child.captureScope.kind = 'real-browser-gameplay'; },
  (child) => { delete child.captureScope.selectedPresentationState; },
  (child) => { child.captureScope.expectedPresentationStates.pop(); },
  (child) => { child.captureScope.expectedScenarioIds = ['native-anonymous-animal']; },
  (child) => { child.captureScope.selectedScenarioIds = []; },
  (child) => { child.captureScope.selectedScenarioIds = ['native-greet', 'native-paired-greetings']; },
  (child) => { child.captureScope.expectedScenarioIds = child.captureScope.selectedScenarioIds = ['forged-producer']; },
  (child) => { child.captureScope.reducedMotion = 'false'; },
  (child) => { child.voicePresentation.snapshots = []; },
  (child) => { child.voicePresentation.snapshots.push(structuredClone(child.voicePresentation.snapshots[0])); },
  (child) => { child.voicePresentation.snapshots[0].mode = 'chart-2d'; },
  (child) => { child.voicePresentation.snapshots[0].viewport.height += 1; },
  (child) => { child.voicePresentation.snapshots[0].reducedMotion = true; },
  (child) => { child.voicePresentation.snapshots[0].caption = null; },
  (child) => { child.voicePresentation.snapshots[0].caption.readingLease = { ...expiredReadingLease }; },
  (child) => { child.voicePresentation.snapshots[0].caption.readingLease.observedAtMs = 1201; },
  (child) => { child.voicePresentation.snapshots[0].caption.ariaMatches = false; },
  (child) => { child.voicePresentation.snapshots[0].labels = []; },
  (child) => { delete child.voicePresentation.snapshots[0].screenshot; },
  (child) => { delete child.voicePresentation.snapshots[0].screenshot.captionContinuity; },
  (child) => { child.voicePresentation.snapshots[0].screenshot.captionContinuity.sameVisibleCaption = false; },
  (child) => { child.voicePresentation.snapshots[0].screenshot.captionContinuity.tick = 421; },
  (child) => { child.voicePresentation.snapshots[0].screenshot.captionContinuity.mode = 'chart-2d'; },
  (child) => { child.voicePresentation.snapshots[0].screenshot.captionContinuity.viewport.height += 1; },
  (child) => { child.voicePresentation.snapshots[0].screenshot.captionContinuity.readingLease = { ...expiredReadingLease }; },
  (child) => { child.voicePresentation.snapshots[0].screenshot.captionContinuity.readingLease.firstVisibleMs = 101; },
  (child) => { child.voicePresentation.snapshots[0].screenshot.captionContinuity.readingLease.visibleCodePoints = 17; },
  (child) => { child.voicePresentation.snapshots[0].screenshot.captionContinuity.readingLease.observedAtMs = 599; },
]) assert.throws(() => assertVoicePresentationMatrix(changedVoiceMatrixChild(change)));
for (const field of ['repositoryAtCapture', 'productionWebArtifact', 'profilerHarness', 'browser']) {
  assert.throws(() => assertVoicePresentationMatrix(changedVoiceMatrixChild((child) => {
    child[field] = { ...child[field], changed: true };
  })), /changed during/u);
  assert.throws(() => assertVoicePresentationMatrix(changedVoiceMatrixChild((child) => {
    delete child[field];
  })), /lacks/u);
}
assert.throws(() => assertVoicePresentationMatrix(changedVoiceMatrixChild((child) => {
  child.captureScope.reducedMotion = child.voicePresentation.snapshots[0].reducedMotion = true;
})), /mixes/u);
const mixedProducerMatrix = structuredClone(voiceMatrix);
mixedProducerMatrix[1] = structuredClone(animalMatrix[1]);
assert.throws(() => assertVoicePresentationMatrix(mixedProducerMatrix), /mixes/u);
for (const leases of [undefined, null, [], Array(1), [null], [readingLease],
  [{ ...expiredReadingLease, endedAtMs: 999 }],
  [expiredReadingLease, expiredReadingLease, expiredReadingLease]]) {
  assert.throws(() => assertVoicePresentationMatrix(changedVoiceMatrixChild((child) => {
    child.voicePresentation.lifecycle.expired.readingLeases = leases;
  })), /reading/u);
}
assert.throws(() => assertVoicePresentationMatrix(changedVoiceMatrixChild((child) => {
  delete child.voicePresentation.lifecycle;
})), /reading expiry/u);
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

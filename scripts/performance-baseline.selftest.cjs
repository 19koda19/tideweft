'use strict';

const assert = require('node:assert/strict');

const {
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
  WORLD_ADVANCE_PHASE_KEYS,
  aggregateElectronProcessTree,
  assertNoResourceInputContamination,
  assertPackagedAutosaveStorage,
  assertPackagedPersistenceWitness,
  assertWorldAdvancePhaseTelemetry,
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
  createV31PackagedPersistenceRecord,
  forceRendererGarbageCollection,
  hitchSnapshotReasons,
  parseArguments,
  parsePosixProcessTable,
  parseWindowsProcessTable,
  packagedPersistenceIntegrity,
  packagedSaveRecordFingerprint,
  packagedPersistenceSnapshot,
  resourceSoakCadenceSummary,
  resourceSoakCycleCheckpointLabel,
  resourceSoakRetentionSummary,
  resourceSoakSaveGrowthSummary,
  retainBoundedHitchGap,
  retainBoundedHitchSnapshot,
  sanitizeRuntimeResourceCounts,
} = require('./performance-baseline.cjs');

function runtimePerformanceSnapshot({
  capacity = 2_048,
  count = 12,
  totalCount = 12,
  meanMs = 1,
  p99Ms = meanMs,
  maxMs = meanMs,
} = {}) {
  return {
    enabled: true,
    capacity,
    count,
    totalCount,
    meanMs,
    p99Ms,
    maxMs,
  };
}

function worldAdvancePhaseTelemetryFixture() {
  return {
    worldAdvanceStep: runtimePerformanceSnapshot({ meanMs: 10, p99Ms: 12, maxMs: 14 }),
    worldAdvancePhases: Object.fromEntries(
      WORLD_ADVANCE_PHASE_KEYS.map((key) => [
        key,
        runtimePerformanceSnapshot({ meanMs: 1.5, p99Ms: 2, maxMs: 2.5 }),
      ]),
    ),
  };
}

function packagedPersistenceRecordFixture({
  version = 32,
  updatedAt = 100,
  timeAction = null,
} = {}) {
  const seed = 'packaged persistence witness fixture';
  const world = JSON.stringify({
    checksum: '0123456789abcdef',
    format: 'tideweft-world',
    world: { meta: { completedTick: 42, seedText: seed } },
  });
  const player = {
    activeContractId: 7,
    cargo: [{ contractId: 7, quantity: 1 }],
    craftingInventory: { gear: [], stacks: [] },
    ...(version === 32 ? { timeAction } : {}),
  };
  const envelope = {
    bio0Ecology: 'bio0',
    dogActorRoster: 'dogs',
    fieldResources: { nodes: [] },
    format: 'tideweft-session',
    integrity: '',
    livingActorPlayerChoice: { version: 1 },
    perceptionCarry: { version: 1 },
    physicalCargo: { carrier: 'fixture' },
    player,
    porterResponse: { version: 1 },
    promiseJourney: { contractId: 7 },
    regionalEcology: 'regional',
    regionalTravel: 'travel',
    session: {
      seed,
      pressureMode: 'wild',
      posture: 'gale',
      sessionShape: 'wander',
      paused: true,
      titleVisible: true,
      quietHourVisible: true,
      selectedSettlementId: 1,
      inspectedContractId: 7,
      trackedContractId: 7,
      sessionStartedTick: 17,
      sessionPlayMilliseconds: 8_000,
      sessionDistanceUnits: 12,
      sessionDeliveries: 2,
      sessionReportsDelivered: 1,
      sessionStrandsWoven: 3,
      sessionChoirsAwakened: 4,
      sessionDiscoveredAtStart: 9,
      sessionBaseline: {
        completedTick: 17,
        activeRoutes: 1,
        resilience: 2,
        averageStress: 3,
        averageTrust: 4,
        projectProgress: 5,
        fulfilledContracts: 6,
        awakenedChoirs: 7,
      },
      closureOffered: true,
      campaignCelebrated: true,
      sessionChanges: ['Fixture session change'],
      announcement: { id: 8, message: 'Fixture announcement', assertive: false },
      nextAnnouncementId: 9,
      tutorial: {
        stage: 'witness',
        scansUsed: 2,
        acceptedPromises: 1,
        witnessedChanges: 0,
        dismissed: false,
      },
      hasSave: true,
      continueSummary: 'Fixture continue summary',
      futureDurableMarker: 'must remain covered',
    },
    settlementEcology: 'settlement',
    settlementDomesticAnimalRecovery: 'recovery',
    settlementWorkingAnimals: 'working',
    traversalFeedback: { state: 'holding' },
    version,
    world,
  };
  envelope.integrity = packagedPersistenceIntegrity(envelope);
  return {
    slotId: 'autosave',
    label: 'Fixture estuary',
    seed,
    saveGenerationEra: 2,
    saveGeneration: 4,
    payloadVersion: version,
    updatedAt,
    playTicks: 42,
    settlementCount: 2,
    connectedCount: 1,
    worldJson: JSON.stringify(envelope),
    screenshot: 'data:image/png;base64,fixture',
  };
}

function currentRecordFromV31Fixture(v31, updatedAt) {
  const envelope = JSON.parse(v31.worldJson);
  envelope.version = 32;
  envelope.player.timeAction = null;
  envelope.session = {
    ...envelope.session,
    paused: false,
    titleVisible: false,
    quietHourVisible: false,
    sessionStartedTick: 42,
    sessionPlayMilliseconds: 0,
    sessionDistanceUnits: 0,
    sessionDeliveries: 0,
    sessionReportsDelivered: 0,
    sessionStrandsWoven: 0,
    sessionChoirsAwakened: 0,
    sessionDiscoveredAtStart: 11,
    sessionBaseline: {
      completedTick: 42,
      activeRoutes: 2,
      resilience: 3,
      averageStress: 4,
      averageTrust: 5,
      projectProgress: 6,
      fulfilledContracts: 7,
      awakenedChoirs: 8,
    },
    closureOffered: false,
    sessionChanges: [],
    announcement: { id: 9, message: 'Welcome back to the estuary.', assertive: false },
    nextAnnouncementId: 10,
    continueSummary: 'Cold-load continue summary',
  };
  envelope.integrity = packagedPersistenceIntegrity(envelope);
  return {
    ...structuredClone(v31),
    payloadVersion: 32,
    updatedAt,
    worldJson: JSON.stringify(envelope),
  };
}

function packagedPersistenceProcessFixture(tick = 42) {
  return {
    process: {
      cleanExit: true,
      exitCode: 0,
      signalCode: null,
      runtimeExceptionCount: 0,
      packageIdentityVerified: true,
      exceptionObservationScope:
        'registered before Runtime.enable through the pre-close phase assertions',
    },
    runtime: {
      titleVisible: false,
      hasSave: true,
      saveWarningVisible: false,
      renderTick: tick,
    },
  };
}

function packagedAutosaveStorageFixture(record) {
  return {
    record: structuredClone(record),
    primaryRecordCount: 1,
    fallbackRecordCount: 1,
    fallbackAutosaveCount: 1,
    fallbackPresent: true,
    fallbackMatchesPrimary: true,
    deletionRecordCount: 0,
    deletionPresent: false,
    fenceRecordCount: 1,
    fenceAutosaveCount: 1,
    fence: {
      saveGenerationEra: record.saveGenerationEra ?? 0,
      saveGeneration: record.saveGeneration ?? 0,
      updatedAt: record.updatedAt,
      playTicks: record.playTicks,
      recordFingerprint: packagedSaveRecordFingerprint(record),
    },
  };
}

function packagedStorageEvidenceFixture(record, version) {
  return assertPackagedAutosaveStorage(
    packagedAutosaveStorageFixture(record),
    version,
  ).evidence;
}

{
  const valid = worldAdvancePhaseTelemetryFixture();
  assert.equal(assertWorldAdvancePhaseTelemetry(valid, 'phase-fixture'), true);

  const missing = structuredClone(valid);
  delete missing.worldAdvancePhases.observedAftermath;
  assert.throws(
    () => assertWorldAdvancePhaseTelemetry(missing, 'phase-fixture'),
    /exactly the five world-advance phases/u,
  );

  const countMismatch = structuredClone(valid);
  countMismatch.worldAdvancePhases.regionalEcologyActors.totalCount -= 1;
  countMismatch.worldAdvancePhases.regionalEcologyActors.count -= 1;
  assert.throws(
    () => assertWorldAdvancePhaseTelemetry(countMismatch, 'phase-fixture'),
    /world-advance phase sample-window mismatch/u,
  );

  const capacityMismatch = structuredClone(valid);
  capacityMismatch.worldAdvancePhases.regionalEcologyAggregateCommit.capacity = 1_024;
  assert.throws(
    () => assertWorldAdvancePhaseTelemetry(capacityMismatch, 'phase-fixture'),
    /world-advance phase sample-window mismatch/u,
  );

  const impossibleMean = structuredClone(valid);
  impossibleMean.worldAdvancePhases.observedAftermath.meanMs = 5;
  impossibleMean.worldAdvancePhases.observedAftermath.p99Ms = 5;
  impossibleMean.worldAdvancePhases.observedAftermath.maxMs = 5;
  assert.throws(
    () => assertWorldAdvancePhaseTelemetry(impossibleMean, 'phase-fixture'),
    /impossible world-advance phase mean total/u,
  );
}

function witness({
  elapsedMs,
  tick,
  rendererFrameCount,
  globalX,
  globalY,
  regionX,
  regionY,
  spatialEpoch,
}) {
  return {
    elapsedMs,
    tick,
    rendererFrameCount,
    spatialEpoch,
    floatingGlobalTiles: { x: globalX, y: globalY },
    canonical: { region: { x: regionX, y: regionY } },
  };
}

{
  const records = [];
  const below = { gapMs: HITCH_TRACE_THRESHOLD_MS - 0.001, after: { elapsedMs: 1 } };
  assert.equal(
    retainBoundedHitchGap(records, below, HITCH_TRACE_RECORD_CAPACITY, HITCH_TRACE_THRESHOLD_MS),
    false,
  );
  assert.deepEqual(records, []);
  const exact = { gapMs: HITCH_TRACE_THRESHOLD_MS, after: { elapsedMs: 2 } };
  assert.equal(
    retainBoundedHitchGap(records, exact, HITCH_TRACE_RECORD_CAPACITY, HITCH_TRACE_THRESHOLD_MS),
    true,
  );
  assert.deepEqual(records, [exact]);
}

{
  const records = [];
  for (let index = 0; index < 40; index += 1) {
    retainBoundedHitchGap(
      records,
      { gapMs: 100 + index, after: { elapsedMs: index } },
      HITCH_TRACE_RECORD_CAPACITY,
      HITCH_TRACE_THRESHOLD_MS,
    );
  }
  assert.equal(records.length, HITCH_TRACE_RECORD_CAPACITY);
  assert.equal(records[0].gapMs, 139);
  assert.equal(records.at(-1).gapMs, 108);

  const ties = [];
  retainBoundedHitchGap(ties, { gapMs: 100, after: { elapsedMs: 9 } }, 2, 80);
  retainBoundedHitchGap(ties, { gapMs: 100, after: { elapsedMs: 3 } }, 2, 80);
  retainBoundedHitchGap(ties, { gapMs: 100, after: { elapsedMs: 6 } }, 2, 80);
  assert.deepEqual(ties.map(({ after }) => after.elapsedMs), [3, 6]);
}

{
  const before = witness({
    elapsedMs: 1,
    tick: 10,
    rendererFrameCount: 20,
    globalX: -61.25,
    globalY: -95.5,
    regionX: -1,
    regionY: -1,
    spatialEpoch: 4,
  });
  const after = witness({
    elapsedMs: 101,
    tick: 11,
    rendererFrameCount: 21,
    globalX: -61.25,
    globalY: -96.25,
    regionX: -1,
    regionY: -2,
    spatialEpoch: 5,
  });
  assert.deepEqual(buildHitchDelta(before, after), {
    tick: 1,
    rendererFrames: 1,
    distanceTiles: 0.75,
    regionChanged: true,
    spatialEpochChanged: true,
  });
  assert.deepEqual(hitchSnapshotReasons(100, 90, buildHitchDelta(before, after)), [
    'canonical-region-change',
    'spatial-epoch-change',
    'new-worst-gap',
  ]);
}

{
  const snapshots = [];
  for (let index = 0; index < HITCH_TRACE_SNAPSHOT_CAPACITY; index += 1) {
    retainBoundedHitchSnapshot(
      snapshots,
      { elapsedMs: index, gapMs: index, reasons: ['new-worst-gap'] },
      HITCH_TRACE_SNAPSHOT_CAPACITY,
    );
  }
  const transition = {
    elapsedMs: 999,
    gapMs: 1,
    reasons: ['spatial-epoch-change'],
  };
  assert.equal(
    retainBoundedHitchSnapshot(snapshots, transition, HITCH_TRACE_SNAPSHOT_CAPACITY),
    true,
  );
  assert.equal(snapshots.includes(transition), true);
  assert.equal(snapshots.length, HITCH_TRACE_SNAPSHOT_CAPACITY);
  assert.equal(snapshots.filter(({ reasons }) => reasons.includes('new-worst-gap')).length, 15);
  assert.equal(
    retainBoundedHitchSnapshot(
      snapshots,
      { elapsedMs: 1_000, gapMs: 0.5, reasons: ['new-worst-gap'] },
      HITCH_TRACE_SNAPSHOT_CAPACITY,
    ),
    false,
  );
}

{
  const transitions = [];
  for (let index = 0; index < HITCH_TRACE_SNAPSHOT_CAPACITY; index += 1) {
    retainBoundedHitchSnapshot(
      transitions,
      { elapsedMs: index, gapMs: 200 + index, reasons: ['spatial-epoch-change'] },
      HITCH_TRACE_SNAPSHOT_CAPACITY,
    );
  }
  const finalWorst = { elapsedMs: 999, gapMs: 999, reasons: ['new-worst-gap'] };
  assert.equal(
    retainBoundedHitchSnapshot(
      transitions,
      finalWorst,
      HITCH_TRACE_SNAPSHOT_CAPACITY,
    ),
    true,
  );
  assert.equal(transitions.includes(finalWorst), true);
  assert.equal(transitions.length, HITCH_TRACE_SNAPSHOT_CAPACITY);
}

assert.throws(
  () => retainBoundedHitchGap([], { gapMs: Number.NaN, after: { elapsedMs: 1 } }, 1, 80),
  TypeError,
);
assert.throws(
  () => retainBoundedHitchSnapshot([], { elapsedMs: 1, gapMs: 1, reasons: [] }, 1),
  TypeError,
);
assert.throws(() => buildHitchDelta({}, {}), TypeError);
assert.throws(() => hitchSnapshotReasons(Number.POSITIVE_INFINITY, 0, {}), TypeError);

{
  const normal = parseArguments([]);
  assert.equal(normal.resourceShakedown, false);
  assert.equal(normal.resourceSoak, false);
  assert.equal(normal.packagedPersistenceWitness, false);
  assert.match(normal.output, /runtime-baseline-[^/]+\.json$/u);
  const resource = parseArguments(['--resource-shakedown']);
  assert.equal(resource.resourceShakedown, true);
  assert.equal(resource.resourceSoak, false);
  assert.equal(resource.scenarioId, '');
  assert.equal(resource.traceHitches, false);
  assert.match(resource.output, /resource-shakedown-[^/]+\.json$/u);
  assert.throws(
    () => parseArguments(['--resource-shakedown', '--scenario=x']),
    /cannot be combined with --scenario/u,
  );
  assert.throws(
    () => parseArguments(['--resource-shakedown', '--trace-hitches']),
    /cannot be combined with --trace-hitches/u,
  );
  assert.throws(
    () => parseArguments(['--resource-shakedown', '--sample-ms=1000']),
    /cannot be combined with --sample-ms/u,
  );
  const soak = parseArguments(['--resource-soak']);
  assert.equal(soak.resourceShakedown, false);
  assert.equal(soak.resourceSoak, true);
  assert.equal(soak.packagedPersistenceWitness, false);
  assert.equal(soak.scenarioId, '');
  assert.equal(soak.traceHitches, false);
  assert.match(soak.output, /resource-soak-[^/]+\.json$/u);
  assert.throws(
    () => parseArguments(['--resource-soak', '--scenario=x']),
    /cannot be combined with --scenario/u,
  );
  assert.throws(
    () => parseArguments(['--resource-soak', '--trace-hitches']),
    /cannot be combined with --trace-hitches/u,
  );
  assert.throws(
    () => parseArguments(['--resource-soak', '--sample-ms=1000']),
    /cannot be combined with --sample-ms/u,
  );
  assert.throws(
    () => parseArguments(['--resource-soak', '--resource-shakedown']),
    /mutually exclusive/u,
  );
  const persistenceWitness = parseArguments([
    '--resource-soak',
    '--packaged-persistence-witness',
  ]);
  assert.equal(persistenceWitness.resourceSoak, true);
  assert.equal(persistenceWitness.packagedPersistenceWitness, true);
  assert.match(
    persistenceWitness.output,
    /resource-soak-persistence-witness-[^/]+\.json$/u,
  );
  const shakedownPersistenceWitness = parseArguments([
    '--resource-shakedown',
    '--packaged-persistence-witness',
  ]);
  assert.equal(shakedownPersistenceWitness.resourceShakedown, true);
  assert.equal(shakedownPersistenceWitness.packagedPersistenceWitness, true);
  assert.match(
    shakedownPersistenceWitness.output,
    /resource-shakedown-persistence-witness-[^/]+\.json$/u,
  );
  assert.throws(
    () => parseArguments(['--packaged-persistence-witness']),
    /requires --resource-shakedown or --resource-soak/u,
  );
  assert.throws(
    () => parseArguments([
      '--resource-shakedown',
      '--packaged-persistence-witness',
      '--scenario=x',
    ]),
    /cannot be combined with --scenario/u,
  );
  assert.throws(
    () => parseArguments([
      '--resource-soak',
      '--packaged-persistence-witness',
      '--trace-hitches',
    ]),
    /cannot be combined with --trace-hitches/u,
  );
}

{
  const sourceRecord = packagedPersistenceRecordFixture();
  const source = packagedPersistenceSnapshot(sourceRecord, 32);
  assert.equal(source.envelopeVersion, 32);
  assert.equal(source.timeAction, 'null');
  assert.equal(source.playTicks, 42);
  assert.equal(source.serializedBytes, Buffer.byteLength(sourceRecord.worldJson, 'utf8'));

  const v31Record = createV31PackagedPersistenceRecord(sourceRecord);
  const fixture = packagedPersistenceSnapshot(v31Record, 31);
  assert.equal(v31Record.payloadVersion, 31);
  assert.equal(v31Record.updatedAt, sourceRecord.updatedAt + 1);
  assert.equal(fixture.timeAction, 'absent');
  assert.equal(fixture.authoritySha256, source.authoritySha256);
  assert.equal(fixture.ecologySha256, source.ecologySha256);
  assert.equal(fixture.custodySha256, source.custodySha256);
  assert.equal(Object.hasOwn(JSON.parse(v31Record.worldJson).player, 'timeAction'), false);

  const migratedRecord = currentRecordFromV31Fixture(v31Record, v31Record.updatedAt + 1);
  const migrated = packagedPersistenceSnapshot(migratedRecord, 32);
  assert.notEqual(migrated.envelopeSha256, source.envelopeSha256);
  assert.equal(migrated.authoritySha256, source.authoritySha256);
  assert.equal(
    JSON.parse(migratedRecord.worldJson).session.futureDurableMarker,
    'must remain covered',
  );
  const idempotentRecord = {
    ...structuredClone(migratedRecord),
    updatedAt: migratedRecord.updatedAt + 1,
  };
  const idempotent = packagedPersistenceSnapshot(idempotentRecord, 32);
  const process = packagedPersistenceProcessFixture();
  const sourceStorage = packagedStorageEvidenceFixture(sourceRecord, 32);
  const fixtureStorage = packagedStorageEvidenceFixture(v31Record, 31);
  const migratedStorage = packagedStorageEvidenceFixture(migratedRecord, 32);
  const idempotentStorage = packagedStorageEvidenceFixture(idempotentRecord, 32);
  assert.equal(
    assertPackagedAutosaveStorage(packagedAutosaveStorageFixture(sourceRecord), 32)
      .parsed.envelope.version,
    32,
  );
  const missingFallback = packagedAutosaveStorageFixture(sourceRecord);
  missingFallback.fallbackPresent = false;
  assert.throws(
    () => assertPackagedAutosaveStorage(missingFallback, 32),
    /inconsistent v32 durable storage/u,
  );
  const wrongFallback = packagedAutosaveStorageFixture(sourceRecord);
  wrongFallback.fallbackMatchesPrimary = false;
  assert.throws(
    () => assertPackagedAutosaveStorage(wrongFallback, 32),
    /inconsistent v32 durable storage/u,
  );
  const duplicateFallback = packagedAutosaveStorageFixture(sourceRecord);
  duplicateFallback.fallbackRecordCount = 2;
  duplicateFallback.fallbackAutosaveCount = 2;
  assert.throws(
    () => assertPackagedAutosaveStorage(duplicateFallback, 32),
    /inconsistent v32 durable storage/u,
  );
  const duplicateFence = packagedAutosaveStorageFixture(sourceRecord);
  duplicateFence.fenceRecordCount = 2;
  duplicateFence.fenceAutosaveCount = 2;
  assert.throws(
    () => assertPackagedAutosaveStorage(duplicateFence, 32),
    /inconsistent v32 durable storage/u,
  );
  const wrongFenceFingerprint = packagedAutosaveStorageFixture(sourceRecord);
  wrongFenceFingerprint.fence.recordFingerprint = 'wrong-fingerprint';
  assert.throws(
    () => assertPackagedAutosaveStorage(wrongFenceFingerprint, 32),
    /inconsistent v32 durable storage/u,
  );
  const evidence = {
    schema: 'tideweft-packaged-persistence-witness/v1',
    source,
    sourceStorage,
    sourceRuntime: {
      titleVisible: true,
      hasSave: true,
      saveWarningVisible: false,
      renderTick: 42,
    },
    currentReload: { ...process, storage: sourceStorage, record: source },
    migration: {
      ...process,
      fixture,
      beforeStorage: fixtureStorage,
      afterStorage: migratedStorage,
      beforeSave: fixture,
      afterSave: migrated,
    },
    idempotentReload: {
      ...process,
      beforeStorage: migratedStorage,
      afterStorage: idempotentStorage,
      beforeSave: migrated,
      afterSave: idempotent,
    },
  };
  assert.equal(assertPackagedPersistenceWitness(evidence), true);
  const evidenceSnapshots = (candidate) => [
    candidate.source,
    candidate.currentReload.record,
    candidate.migration.fixture,
    candidate.migration.beforeSave,
    candidate.migration.afterSave,
    candidate.idempotentReload.beforeSave,
    candidate.idempotentReload.afterSave,
  ];
  const missingAuthorityProof = structuredClone(evidence);
  for (const snapshot of evidenceSnapshots(missingAuthorityProof)) {
    delete snapshot.authoritySha256;
  }
  assert.throws(
    () => assertPackagedPersistenceWitness(missingAuthorityProof),
    /snapshot evidence is incomplete/u,
  );
  const constantRecordMetadataProof = structuredClone(evidence);
  for (const snapshot of evidenceSnapshots(constantRecordMetadataProof)) {
    snapshot.recordMetadataSha256 = 'same-unverified-value';
  }
  assert.throws(
    () => assertPackagedPersistenceWitness(constantRecordMetadataProof),
    /snapshot evidence is incomplete/u,
  );
  const missingExactRecordProof = structuredClone(evidence);
  for (const snapshot of evidenceSnapshots(missingExactRecordProof)) {
    delete snapshot.recordSha256;
  }
  assert.throws(
    () => assertPackagedPersistenceWitness(missingExactRecordProof),
    /snapshot evidence is incomplete/u,
  );
  const missingGenerationProof = structuredClone(evidence);
  for (const snapshot of evidenceSnapshots(missingGenerationProof)) {
    delete snapshot.saveGenerationEra;
    delete snapshot.saveGeneration;
  }
  assert.throws(
    () => assertPackagedPersistenceWitness(missingGenerationProof),
    /snapshot evidence is incomplete/u,
  );

  const stableSessionDriftRecord = structuredClone(migratedRecord);
  const stableSessionDriftEnvelope = JSON.parse(stableSessionDriftRecord.worldJson);
  stableSessionDriftEnvelope.session.futureDurableMarker = 'changed after cold load';
  stableSessionDriftEnvelope.integrity = packagedPersistenceIntegrity(stableSessionDriftEnvelope);
  stableSessionDriftRecord.worldJson = JSON.stringify(stableSessionDriftEnvelope);
  const stableSessionDrift = packagedPersistenceSnapshot(stableSessionDriftRecord, 32);
  assert.notEqual(stableSessionDrift.authoritySha256, source.authoritySha256);
  const stableSessionDriftIdempotentRecord = {
    ...structuredClone(stableSessionDriftRecord),
    updatedAt: idempotentRecord.updatedAt,
  };
  const stableSessionDriftEvidence = structuredClone(evidence);
  stableSessionDriftEvidence.migration.afterSave = stableSessionDrift;
  stableSessionDriftEvidence.migration.afterStorage = packagedStorageEvidenceFixture(
    stableSessionDriftRecord,
    32,
  );
  stableSessionDriftEvidence.idempotentReload.beforeSave = stableSessionDrift;
  stableSessionDriftEvidence.idempotentReload.beforeStorage = packagedStorageEvidenceFixture(
    stableSessionDriftRecord,
    32,
  );
  stableSessionDriftEvidence.idempotentReload.afterSave = packagedPersistenceSnapshot(
    stableSessionDriftIdempotentRecord,
    32,
  );
  stableSessionDriftEvidence.idempotentReload.afterStorage = packagedStorageEvidenceFixture(
    stableSessionDriftIdempotentRecord,
    32,
  );
  assert.throws(
    () => assertPackagedPersistenceWitness(stableSessionDriftEvidence),
    /changed authoritySha256/u,
  );
  const crossSaveRecordMetadataDrift = structuredClone(evidence);
  for (const snapshot of [
    crossSaveRecordMetadataDrift.migration.afterSave,
    crossSaveRecordMetadataDrift.idempotentReload.beforeSave,
    crossSaveRecordMetadataDrift.idempotentReload.afterSave,
  ]) snapshot.recordMetadataSha256 = '0'.repeat(64);
  assert.throws(
    () => assertPackagedPersistenceWitness(crossSaveRecordMetadataDrift),
    /changed recordMetadataSha256/u,
  );

  const changedCustody = structuredClone(evidence);
  changedCustody.migration.afterSave.custodySha256 = '0'.repeat(64);
  assert.throws(
    () => assertPackagedPersistenceWitness(changedCustody),
    /changed custodySha256/u,
  );
  const warning = structuredClone(evidence);
  warning.idempotentReload.runtime.saveWarningVisible = true;
  assert.throws(
    () => assertPackagedPersistenceWitness(warning),
    /process evidence is incomplete/u,
  );
  const nonzeroExit = structuredClone(evidence);
  nonzeroExit.currentReload.process.exitCode = 1;
  assert.throws(
    () => assertPackagedPersistenceWitness(nonzeroExit),
    /process evidence is incomplete/u,
  );
  const signaledExit = structuredClone(evidence);
  signaledExit.currentReload.process.signalCode = 'SIGTERM';
  assert.throws(
    () => assertPackagedPersistenceWitness(signaledExit),
    /process evidence is incomplete/u,
  );
  const metadataDriftRecord = { ...structuredClone(sourceRecord), label: 'Changed label' };
  const metadataDrift = structuredClone(evidence);
  metadataDrift.currentReload.record = packagedPersistenceSnapshot(metadataDriftRecord, 32);
  metadataDrift.currentReload.storage = packagedStorageEvidenceFixture(metadataDriftRecord, 32);
  assert.throws(
    () => assertPackagedPersistenceWitness(metadataDrift),
    /changed the exact durable SaveRecord/u,
  );
  const generationDrift = structuredClone(evidence);
  generationDrift.idempotentReload.afterSave.saveGeneration += 1;
  assert.throws(
    () => assertPackagedPersistenceWitness(generationDrift),
    /changed ordinary save-generation authority/u,
  );
  const coldReloadTimestampDrift = structuredClone(evidence);
  coldReloadTimestampDrift.currentReload.record.updatedAt += 1;
  assert.throws(
    () => assertPackagedPersistenceWitness(coldReloadTimestampDrift),
    /unexplained durable timestamp transition/u,
  );
  const saveTimestampDidNotAdvance = structuredClone(evidence);
  saveTimestampDidNotAdvance.migration.afterSave.updatedAt =
    saveTimestampDidNotAdvance.migration.beforeSave.updatedAt;
  assert.throws(
    () => assertPackagedPersistenceWitness(saveTimestampDidNotAdvance),
    /unexplained durable timestamp transition/u,
  );
  const unlinkedFenceEvidence = structuredClone(evidence);
  unlinkedFenceEvidence.currentReload.storage.fenceFingerprintSha256 = '0'.repeat(64);
  assert.throws(
    () => assertPackagedPersistenceWitness(unlinkedFenceEvidence),
    /storage evidence is incomplete/u,
  );
  const badIntegrity = structuredClone(sourceRecord);
  const badEnvelope = JSON.parse(badIntegrity.worldJson);
  badEnvelope.integrity = '0'.repeat(16);
  badIntegrity.worldJson = JSON.stringify(badEnvelope);
  assert.throws(
    () => packagedPersistenceSnapshot(badIntegrity, 32),
    /noncanonical v32 envelope/u,
  );
  const activeRecovery = packagedPersistenceRecordFixture({
    timeAction: { kind: 'sleep' },
  });
  assert.throws(
    () => createV31PackagedPersistenceRecord(activeRecovery),
    /invalid v32 player recovery authority/u,
  );
}

{
  const client = Object.create(CdpClient.prototype);
  client.notificationListeners = new Map();
  client.notificationError = null;
  const observed = [];
  const remove = client.onNotification('WebAudio.contextCreated', (params) => {
    observed.push(params.count);
  });
  client.dispatchNotification('WebAudio.contextCreated', { count: 1 });
  remove();
  client.dispatchNotification('WebAudio.contextCreated', { count: 2 });
  assert.deepEqual(observed, [1]);
  assert.equal(client.notificationListeners.size, 0);
  assert.doesNotThrow(() => client.throwIfNotificationFailed());

  client.onNotification('WebAudio.contextCreated', () => {
    throw new Error('secret notification contents');
  });
  client.dispatchNotification('WebAudio.contextCreated', { secret: 'not retained' });
  assert.throws(
    () => client.throwIfNotificationFailed(),
    /CDP notification handler failed for WebAudio\.contextCreated/u,
  );
  assert.doesNotMatch(client.notificationError.message, /secret notification|not retained/u);
}

{
  const processSource = [
    '100 1 10000 /Applications/Tideweft.app/Contents/MacOS/Tideweft --private-root-argument',
    '101 100 20000 /private/renderer --type=renderer --secret=do-not-serialize',
    '102 100 30000 /private/gpu --type=gpu-process',
    '103 100 40000 /private/utility --type=utility --utility-sub-type=audio.mojom.AudioService',
    '104 100 50000 /private/utility --type=utility --utility-sub-type=network.mojom.NetworkService',
    '105 100 60000 /private/zygote --type=zygote',
    '106 101 70000 /private/other-child --type=renderer',
    '999 1 99999 /private/unrelated --type=renderer --secret=unrelated',
  ].join('\n');
  const aggregate = aggregateElectronProcessTree(
    parsePosixProcessTable(processSource),
    100,
    'self-test',
  );
  assert.equal(aggregate.processCount, 7);
  assert.equal(aggregate.summedRssBytes, 280_000 * 1_024);
  assert.deepEqual(aggregate.roles.map(({ role }) => role), ELECTRON_PROCESS_ROLES);
  assert.deepEqual(
    aggregate.roles.find(({ role }) => role === 'renderer'),
    { role: 'renderer', processCount: 2, summedRssBytes: 90_000 * 1_024 },
  );
  assert.deepEqual(
    aggregate.roles.find(({ role }) => role === 'audio-service'),
    { role: 'audio-service', processCount: 1, summedRssBytes: 40_000 * 1_024 },
  );
  const serialized = JSON.stringify(aggregate);
  assert.doesNotMatch(serialized, /Applications|private|--type|secret|do-not-serialize/u);
  assert.equal(classifyElectronProcessRole('--type=renderer'), 'renderer');
  assert.equal(
    classifyElectronProcessRole('--type=utility --utility-sub-type=audio.mojom.AudioService'),
    'audio-service',
  );
  assert.equal(classifyElectronProcessRole('--type=mystery'), 'other');

  let unsafeError;
  try {
    parsePosixProcessTable('101 100 -1 /private/secret-command');
  } catch (error) {
    unsafeError = error;
  }
  assert.ok(unsafeError instanceof Error);
  assert.doesNotMatch(unsafeError.message, /private|secret-command/u);
}

{
  const rows = parseWindowsProcessTable(JSON.stringify([
    {
      ProcessId: 200,
      ParentProcessId: 1,
      WorkingSetSize: 1_000,
      CommandLine: 'C:\\private\\Tideweft.exe --private-root-argument',
    },
    {
      ProcessId: 201,
      ParentProcessId: 200,
      WorkingSetSize: 2_000,
      CommandLine: 'C:\\private\\Tideweft.exe --type=renderer --secret=value',
    },
  ]));
  const aggregate = aggregateElectronProcessTree(rows, 200, 'windows-self-test');
  assert.equal(aggregate.processCount, 2);
  assert.equal(aggregate.summedRssBytes, 3_000);
  assert.doesNotMatch(JSON.stringify(aggregate), /private|Tideweft\.exe|--type|secret=value/u);
  assert.throws(
    () => parseWindowsProcessTable(JSON.stringify({
      ProcessId: 1,
      ParentProcessId: 0,
      WorkingSetSize: -1,
      CommandLine: 'C:\\private\\secret-command.exe',
    })),
    /Invalid Windows process table values at row 1/u,
  );
}

{
  const tracker = createWebAudioLifecycleTracker();
  tracker.handle('WebAudio.contextCreated', {
    context: {
      contextId: 'context-secret-id',
      contextType: 'realtime',
      contextState: 'suspended',
    },
  });
  tracker.handle('WebAudio.contextChanged', {
    context: {
      contextId: 'context-secret-id',
      contextType: 'realtime',
      contextState: 'running',
    },
  });
  tracker.handle('WebAudio.audioListenerCreated', {
    listener: { listenerId: 'listener-secret-id' },
  });
  tracker.handle('WebAudio.audioNodeCreated', {
    node: { nodeId: 'node-secret-id', nodeType: 'Gain' },
  });
  tracker.handle('WebAudio.audioNodeCreated', {
    node: { nodeId: 'node-secret-id', nodeType: 'Gain' },
  });
  tracker.handle('WebAudio.audioParamCreated', {
    param: { paramId: 'param-secret-id' },
  });
  tracker.handle('WebAudio.nodesConnected', {});
  tracker.handle('WebAudio.audioNodeWillBeDestroyed', { nodeId: 'unknown-id' });
  let snapshot = tracker.snapshot();
  assert.deepEqual(snapshot.live, {
    contexts: 1,
    listeners: 1,
    nodes: 1,
    params: 1,
    contextsByType: { realtime: 1 },
    contextsByState: { running: 1 },
    nodesByType: { Gain: 1 },
  });
  assert.equal(snapshot.eventTotals['WebAudio.audioNodeCreated'], 2);
  assert.equal(snapshot.eventTotals['WebAudio.nodesConnected'], 1);
  assert.equal(snapshot.unmatchedDestroyEvents, 1);
  assert.equal(snapshot.malformedLifecycleEvents, 0);
  assert.doesNotMatch(JSON.stringify(snapshot), /secret-id|unknown-id/u);
  assert.throws(
    () => assertWebAudioLifecycleEvidence(snapshot),
    /complete, internally consistent CDP WebAudio lifecycle witness/u,
  );

  tracker.handle('WebAudio.audioNodeWillBeDestroyed', { nodeId: 'node-secret-id' });
  tracker.handle('WebAudio.audioParamWillBeDestroyed', { paramId: 'param-secret-id' });
  tracker.handle('WebAudio.audioListenerWillBeDestroyed', { listenerId: 'listener-secret-id' });
  tracker.handle('WebAudio.contextWillBeDestroyed', { contextId: 'context-secret-id' });
  snapshot = tracker.snapshot();
  assert.equal(snapshot.live.contexts, 0);
  assert.equal(snapshot.live.listeners, 0);
  assert.equal(snapshot.live.nodes, 0);
  assert.equal(snapshot.live.params, 0);
  assert.throws(
    () => assertWebAudioLifecycleEvidence(snapshot),
    /complete, internally consistent CDP WebAudio lifecycle witness/u,
  );

  const healthy = createWebAudioLifecycleTracker();
  healthy.handle('WebAudio.contextCreated', {
    context: { contextId: 'healthy-context', contextType: 'realtime', contextState: 'running' },
  });
  healthy.handle('WebAudio.audioNodeCreated', {
    node: { nodeId: 'healthy-node', nodeType: 'Gain' },
  });
  assert.equal(assertWebAudioLifecycleEvidence(healthy.snapshot()), true);
  for (const label of [
    'forced-gc-1',
    'forced-gc-2',
    'post-save',
    'soak-baseline-forced-gc-1',
    'soak-final-forced-gc-2',
    'soak-post-save',
  ]) {
    assert.throws(
      () => assertWebAudioLifecycleEvidence(healthy.snapshot(), label, 'collected'),
      /complete, internally consistent CDP WebAudio lifecycle witness/u,
    );
  }

  const collected = createWebAudioLifecycleTracker();
  collected.handle('WebAudio.contextCreated', {
    context: { contextId: 'collected-context', contextType: 'realtime', contextState: 'running' },
  });
  collected.handle('WebAudio.audioNodeCreated', {
    node: { nodeId: 'collected-node', nodeType: 'Oscillator' },
  });
  collected.handle('WebAudio.audioParamCreated', {
    param: { paramId: 'collected-param' },
  });
  collected.handle('WebAudio.audioNodeWillBeDestroyed', { nodeId: 'collected-node' });
  collected.handle('WebAudio.audioParamWillBeDestroyed', { paramId: 'collected-param' });
  const collectedSnapshot = collected.snapshot();
  for (const label of [
    'resource checkpoint',
    'pre',
    'half',
    'post',
    'settled',
    'soak-pre',
    'soak-warmup-post',
    'soak-cycle-001',
    'soak-settled',
  ]) {
    assert.throws(
      () => assertWebAudioLifecycleEvidence(collectedSnapshot, label),
      /complete, internally consistent CDP WebAudio lifecycle witness/u,
    );
  }
  assert.equal(
    assertWebAudioLifecycleEvidence(collectedSnapshot, 'soak-cycle-001', 'ordinary'),
    true,
  );
  for (const label of [
    'forced-gc-1',
    'forced-gc-2',
    'post-save',
    'soak-baseline-forced-gc-1',
    'soak-baseline-forced-gc-2',
    'soak-final-forced-gc-1',
    'soak-final-forced-gc-2',
    'soak-post-save',
  ]) {
    assert.equal(assertWebAudioLifecycleEvidence(collectedSnapshot, label, 'collected'), true);
  }
  const malformed = createWebAudioLifecycleTracker();
  malformed.handle('WebAudio.contextCreated', { context: {} });
  malformed.handle('WebAudio.audioNodeCreated', { node: {} });
  const malformedSnapshot = malformed.snapshot();
  assert.equal(malformedSnapshot.malformedLifecycleEvents, 2);
  assert.throws(
    () => assertWebAudioLifecycleEvidence(malformedSnapshot),
    /complete, internally consistent CDP WebAudio lifecycle witness/u,
  );

  const invalidCollectedSnapshot = structuredClone(collectedSnapshot);
  invalidCollectedSnapshot.live.nodes = -1;
  assert.throws(
    () => assertWebAudioLifecycleEvidence(
      invalidCollectedSnapshot,
      'forced-gc-2',
      'collected',
    ),
    /complete, internally consistent CDP WebAudio lifecycle witness/u,
  );

  for (const mutate of [
    (candidate) => { delete candidate.eventTotals['WebAudio.audioNodeWillBeDestroyed']; },
    (candidate) => { delete candidate.eventTotals['WebAudio.audioParamWillBeDestroyed']; },
    (candidate) => {
      candidate.live.params = 1;
      delete candidate.eventTotals['WebAudio.audioParamWillBeDestroyed'];
    },
    (candidate) => { candidate.live.contexts = 0; candidate.live.contextsByType = {}; candidate.live.contextsByState = {}; },
    (candidate) => { candidate.unmatchedDestroyEvents = 1; },
    (candidate) => { candidate.malformedLifecycleEvents = 1; },
  ]) {
    const candidate = structuredClone(collectedSnapshot);
    mutate(candidate);
    assert.throws(
      () => assertWebAudioLifecycleEvidence(candidate, 'post-save', 'collected'),
      /complete, internally consistent CDP WebAudio lifecycle witness/u,
    );
  }

  const retainedListener = createWebAudioLifecycleTracker();
  retainedListener.handle('WebAudio.contextCreated', {
    context: { contextId: 'listener-context', contextType: 'realtime', contextState: 'running' },
  });
  retainedListener.handle('WebAudio.audioNodeCreated', {
    node: { nodeId: 'listener-node', nodeType: 'Gain' },
  });
  retainedListener.handle('WebAudio.audioListenerCreated', {
    listener: { listenerId: 'retained-listener' },
  });
  retainedListener.handle('WebAudio.audioNodeWillBeDestroyed', { nodeId: 'listener-node' });
  assert.throws(
    () => assertWebAudioLifecycleEvidence(
      retainedListener.snapshot(),
      'forced-gc-1',
      'collected',
    ),
    /complete, internally consistent CDP WebAudio lifecycle witness/u,
  );

  const recreatedContext = createWebAudioLifecycleTracker();
  recreatedContext.handle('WebAudio.contextCreated', {
    context: { contextId: 'old-context', contextType: 'realtime', contextState: 'running' },
  });
  recreatedContext.handle('WebAudio.contextWillBeDestroyed', { contextId: 'old-context' });
  recreatedContext.handle('WebAudio.contextCreated', {
    context: { contextId: 'new-context', contextType: 'realtime', contextState: 'running' },
  });
  recreatedContext.handle('WebAudio.audioNodeCreated', {
    node: { nodeId: 'new-node', nodeType: 'Gain' },
  });
  assert.throws(
    () => assertWebAudioLifecycleEvidence(recreatedContext.snapshot(), 'pre'),
    /complete, internally consistent CDP WebAudio lifecycle witness/u,
  );

  const duplicateNode = createWebAudioLifecycleTracker();
  duplicateNode.handle('WebAudio.contextCreated', {
    context: { contextId: 'duplicate-context', contextType: 'realtime', contextState: 'running' },
  });
  duplicateNode.handle('WebAudio.audioNodeCreated', {
    node: { nodeId: 'duplicate-node', nodeType: 'Gain' },
  });
  duplicateNode.handle('WebAudio.audioNodeCreated', {
    node: { nodeId: 'duplicate-node', nodeType: 'Gain' },
  });
  assert.throws(
    () => assertWebAudioLifecycleEvidence(duplicateNode.snapshot(), 'pre'),
    /complete, internally consistent CDP WebAudio lifecycle witness/u,
  );

  const unknownContextChange = createWebAudioLifecycleTracker();
  unknownContextChange.handle('WebAudio.contextCreated', {
    context: { contextId: 'known-context', contextType: 'realtime', contextState: 'running' },
  });
  unknownContextChange.handle('WebAudio.contextChanged', {
    context: { contextId: 'unknown-context', contextType: 'realtime', contextState: 'running' },
  });
  unknownContextChange.handle('WebAudio.audioNodeCreated', {
    node: { nodeId: 'known-node', nodeType: 'Gain' },
  });
  assert.throws(
    () => assertWebAudioLifecycleEvidence(unknownContextChange.snapshot(), 'pre'),
    /complete, internally consistent CDP WebAudio lifecycle witness/u,
  );
}

function resourceCountsFixture() {
  const regions = {
    loadedTerrainRegions: 9,
    activeEcologyRegions: 9,
    durableTerrainRegionRecords: 3,
    durableEcologyRegionRecords: 3,
    chartedRegionRecords: 3,
    inactiveCargoRegionWorlds: 1,
  };
  const caches = {
    regionTerrainValues: 9,
    registeredTerrainGeneratorSeeds: 2,
    registeredTerrainGeneratorRegions: 12,
    outdoorIlluminationFields: 3,
    regionalHabitats: 24,
    alpineHabitats: 24,
    polarShoreHabitats: 24,
    coldShoreHabitats: 24,
    polarConsumerHabitats: 24,
    breadthHabitats: 24,
    runtimeCompatibilityHabitats: 24,
    alpineRidgeAuthorities: 24,
    polarConsumerAuthorities: 24,
    activityAuthorityReceipts: 128,
    breadthPreparationSlots: 1,
  };
  const pending = {
    runtimeTerrainPrefetchJobs: 0,
    registeredTerrainPrefetchJobs: 0,
    queuedCommands: 0,
    queuedSaveSnapshots: 0,
    saveWaiters: 0,
    activeSaveWorkers: 0,
  };
  return {
    regions,
    caches,
    pending,
    limits: {
      regions: {
        loadedTerrainRegions: 9,
        activeEcologyRegions: 9,
        durableTerrainRegionRecords: 131_072,
        durableEcologyRegionRecords: 294_912,
        chartedRegionRecords: 131_072,
        inactiveCargoRegionWorlds: 131_071,
      },
      caches: {
        regionTerrainValues: 9,
        registeredTerrainGeneratorSeeds: 2,
        registeredTerrainGeneratorRegions: 24,
        outdoorIlluminationFields: 4,
        regionalHabitats: 128,
        alpineHabitats: 128,
        polarShoreHabitats: 128,
        coldShoreHabitats: 128,
        polarConsumerHabitats: 128,
        breadthHabitats: 128,
        runtimeCompatibilityHabitats: 264,
        alpineRidgeAuthorities: 64,
        polarConsumerAuthorities: 64,
        activityAuthorityReceipts: 128,
        breadthPreparationSlots: 1,
      },
      pending: {
        runtimeTerrainPrefetchJobs: 8,
        queuedSaveSnapshots: 1,
        activeSaveWorkers: 1,
      },
    },
  };
}

{
  const fixture = resourceCountsFixture();
  const sanitized = sanitizeRuntimeResourceCounts({ ...fixture, ignoredSecret: 'not retained' });
  assert.deepEqual(sanitized, fixture);
  assert.doesNotMatch(JSON.stringify(sanitized), /ignoredSecret/u);
  assert.equal(assertSettledResourcePendingDrained(sanitized, 'settled'), true);
  const pendingAtHalf = resourceCountsFixture();
  pendingAtHalf.pending.queuedCommands = 1;
  assert.equal(assertSettledResourcePendingDrained(pendingAtHalf, 'half', false), true);
  assert.throws(
    () => assertSettledResourcePendingDrained(pendingAtHalf, 'forced-gc-1'),
    /retained pending work: queuedCommands=1/u,
  );
  assert.throws(
    () => assertSettledResourcePendingDrained(pendingAtHalf, 'soak-cycle-001'),
    /retained pending work: queuedCommands=1/u,
  );
  const exceeded = resourceCountsFixture();
  exceeded.caches.regionTerrainValues = 10;
  assert.throws(
    () => sanitizeRuntimeResourceCounts(exceeded),
    /exceeded its declared limit/u,
  );
  const unexpectedLimit = resourceCountsFixture();
  unexpectedLimit.limits.pending.unboundedInventedLimit = 99;
  assert.throws(
    () => sanitizeRuntimeResourceCounts(unexpectedLimit),
    /malformed or unexpected pending limits/u,
  );
  const unexpectedCount = resourceCountsFixture();
  unexpectedCount.caches.untrackedOwner = 1;
  assert.throws(
    () => sanitizeRuntimeResourceCounts(unexpectedCount),
    /malformed or unexpected count group caches/u,
  );
}

function cleanInputEvidence() {
  const viewport = {
    layoutWidth: 1440,
    layoutHeight: 900,
    devicePixelRatio: 1,
    visualWidth: 1440,
    visualHeight: 900,
    visualScale: 1,
  };
  return {
    trustedInputs: {
      total: 0,
      blockingTotal: 0,
      wheel: 0,
      pointerDown: 0,
      pointerMove: 0,
      pointerUp: 0,
      key: 0,
      touch: 0,
    },
    viewportChangeEvents: 0,
    baselineViewport: { ...viewport },
    currentViewport: { ...viewport },
    pageLifecycle: {
      baselineVisibility: 'visible',
      currentVisibility: 'visible',
      visibilityChangeEvents: 0,
      hiddenTransitions: 0,
      hiddenDurationMs: 0,
      pageHideEvents: 0,
      freezeEvents: 0,
      baselineHasFocus: true,
      currentHasFocus: true,
      focusEvents: 0,
      blurEvents: 0,
    },
  };
}

{
  assert.equal(assertNoResourceInputContamination(cleanInputEvidence()), true);
  const trusted = cleanInputEvidence();
  trusted.trustedInputs.total = 1;
  trusted.trustedInputs.blockingTotal = 1;
  trusted.trustedInputs.wheel = 1;
  assert.throws(
    () => assertNoResourceInputContamination(trusted),
    /contaminated by trusted input/u,
  );
  const passiveHover = cleanInputEvidence();
  passiveHover.trustedInputs.total = 4;
  passiveHover.trustedInputs.pointerMove = 4;
  assert.equal(assertNoResourceInputContamination(passiveHover), true);
  const zoomed = cleanInputEvidence();
  zoomed.currentViewport.visualScale = 1.25;
  assert.throws(
    () => assertNoResourceInputContamination(zoomed),
    /viewport\/zoom drift/u,
  );
  const focusChanged = cleanInputEvidence();
  focusChanged.pageLifecycle.baselineHasFocus = true;
  focusChanged.pageLifecycle.currentHasFocus = false;
  focusChanged.pageLifecycle.blurEvents = 1;
  assert.equal(assertNoResourceInputContamination(focusChanged), true);
  for (const contaminated of [
    { currentVisibility: 'hidden', visibilityChangeEvents: 1, hiddenTransitions: 1 },
    { pageHideEvents: 1 },
    { freezeEvents: 1 },
  ]) {
    const lifecycle = cleanInputEvidence();
    Object.assign(lifecycle.pageLifecycle, contaminated);
    assert.throws(
      () => assertNoResourceInputContamination(lifecycle),
      /hidden\/frozen page lifecycle/u,
    );
  }
  const malformedLifecycle = cleanInputEvidence();
  delete malformedLifecycle.pageLifecycle.hiddenDurationMs;
  assert.throws(
    () => assertNoResourceInputContamination(malformedLifecycle),
    /invalid input-contamination evidence/u,
  );
}

{
  assert.equal(RESOURCE_SHAKEDOWN_CYCLES, 2);
  assert.deepEqual(RESOURCE_CHECKPOINT_LABELS, [
    'pre',
    'half',
    'post',
    'settled',
    'forced-gc-1',
    'forced-gc-2',
    'post-save',
  ]);
  assert.equal(
    assertResourceCheckpointOrder(RESOURCE_CHECKPOINT_LABELS.map((label) => ({ label }))),
    true,
  );
  assert.throws(
    () => assertResourceCheckpointOrder([
      ...RESOURCE_CHECKPOINT_LABELS.slice(0, 3).map((label) => ({ label })),
      { label: 'forced-gc-1' },
      { label: 'settled' },
      ...RESOURCE_CHECKPOINT_LABELS.slice(5).map((label) => ({ label })),
    ]),
    /Resource checkpoint order must be/u,
  );

  const route = {
    anchorGlobal: { x: 76.5, y: 27.5 },
    outboundGlobal: { x: 76.5, y: -8 },
  };
  const position = (x, y, regionY) => ({
    x,
    y,
    canonicalRegion: { x: 0, y: regionY },
    projectionConsistent: true,
  });
  const cycle = {
    schema: 'tideweft-resource-route-cycle/v2',
    ordinal: 1,
    reason: 'complete',
    failure: null,
    durationMs: 100_000,
    startTick: 10,
    endTick: 50,
    start: position(76.5, 27.5, 0),
    turn: position(76.5, -8, -1),
    end: position(76.5, 27.5, 0),
    observedDistanceTiles: 71,
    maxObservedStepTiles: 1,
    projectionMismatchCount: 0,
    discontinuityCount: 0,
    targetsIssued: 4,
    visitedRegionKeys: ['0:0', '0:-1', '0:0'],
    modesObserved: ['foot', 'wading'],
    presentationCadence: {
      scope: 'requestAnimationFrame intervals observed by the ordinary route driver',
      frameCount: 6_001,
      intervalCount: 6_000,
      averageIntervalMs: 16.667,
      averageFps: 59.9988,
      p99IntervalUpperBoundMs: 18,
      worstIntervalMs: 42,
    },
  };
  assert.equal(assertResourceShakedownCycle(cycle, route, 1), true);
  assert.throws(
    () => assertResourceShakedownCycle({
      ...cycle,
      visitedRegionKeys: ['0:0', '0:1', '0:0'],
    }, route, 1),
    /absolute 0:0 -> 0:-1 -> 0:0 corridor/u,
  );
  assert.throws(
    () => assertResourceShakedownCycle({ ...cycle, maxObservedStepTiles: 4.01 }, route, 1),
    /absolute 0:0 -> 0:-1 -> 0:0 corridor/u,
  );
}

{
  assert.equal(RESOURCE_SOAK_MINIMUM_TRAVEL_MS, 3_600_000);
  assert.equal(RESOURCE_SOAK_MINIMUM_CYCLES, 12);
  assert.equal(RESOURCE_SOAK_SAVE_INTERVAL_CYCLES, 4);
  assert.equal(RESOURCE_SOAK_SAVE_PAYLOAD_BUDGET_BYTES, 4 * 1_024 * 1_024);
  assert.equal(RESOURCE_SOAK_SAVE_GROWTH_BUDGET_BYTES, 512 * 1_024);
  assert.equal(resourceSoakCycleCheckpointLabel(1), 'soak-cycle-001');
  assert.equal(resourceSoakCycleCheckpointLabel(120), 'soak-cycle-120');
  assert.throws(() => resourceSoakCycleCheckpointLabel(0), RangeError);

  const soakCheckpoints = [
    'soak-pre',
    'soak-warmup-post',
    'soak-baseline-forced-gc-1',
    'soak-baseline-forced-gc-2',
    ...Array.from(
      { length: RESOURCE_SOAK_MINIMUM_CYCLES },
      (_, index) => resourceSoakCycleCheckpointLabel(index + 1),
    ),
    'soak-settled',
    'soak-final-forced-gc-1',
    'soak-final-forced-gc-2',
    'soak-post-save',
  ].map((label) => ({
    label,
    renderer: { viewportAndInput: cleanInputEvidence() },
  }));
  assert.equal(
    assertResourceSoakCheckpointOrder(soakCheckpoints, RESOURCE_SOAK_MINIMUM_CYCLES),
    true,
  );
  const swapped = structuredClone(soakCheckpoints);
  [swapped[5], swapped[6]] = [swapped[6], swapped[5]];
  assert.throws(
    () => assertResourceSoakCheckpointOrder(swapped, RESOURCE_SOAK_MINIMUM_CYCLES),
    /Resource-soak checkpoint order must be/u,
  );

  const cadenceCycles = Array.from({ length: RESOURCE_SOAK_MINIMUM_CYCLES }, (_, index) => ({
    presentationCadence: {
      averageFps: 60 - index * 0.1,
      averageIntervalMs: 1_000 / (60 - index * 0.1),
      p99IntervalUpperBoundMs: 20 + index * 0.1,
      worstIntervalMs: 40 + index,
    },
  }));
  const cadence = resourceSoakCadenceSummary(cadenceCycles);
  assert.equal(cadence.windowSize, 3);
  assert.equal(cadence.opening.cycleCount, 3);
  assert.equal(cadence.closing.cycleCount, 3);
  assert.equal(cadence.medianAverageFpsRatio < 1, true);
  const degradedFps = structuredClone(cadenceCycles);
  for (const cycle of degradedFps.slice(-3)) cycle.presentationCadence.averageFps = 47;
  assert.throws(
    () => resourceSoakCadenceSummary(degradedFps),
    /closing cadence degraded/u,
  );
  const degradedP99 = structuredClone(cadenceCycles);
  for (const cycle of degradedP99.slice(-3)) {
    cycle.presentationCadence.p99IntervalUpperBoundMs = 26;
  }
  assert.throws(
    () => resourceSoakCadenceSummary(degradedP99),
    /closing cadence degraded/u,
  );

  const saveSample = (
    ordinal,
    kind,
    afterMeasuredCycle,
    serializedBytes,
    tick,
    before,
  ) => ({
    ordinal,
    kind,
    afterMeasuredCycle,
    tick,
    endToEndMs: 20,
    serializedBytes,
    saveSnapshotCountBefore: before,
    saveSnapshotCountAfter: before + 1,
    synchronousSnapshot: { totalCount: before + 1 },
  });
  const saves = [
    saveSample(1, 'baseline', 0, 1_800_000, 10, 0),
    saveSample(2, 'periodic', 4, 1_800_100, 50, 3),
    saveSample(3, 'periodic', 8, 1_800_200, 90, 6),
    saveSample(4, 'final', 12, 1_800_300, 130, 9),
    saveSample(5, 'stationary-repeat-1', 12, 1_800_300, 130, 10),
    saveSample(6, 'stationary-repeat-2', 12, 1_800_300, 130, 11),
  ];
  assert.equal(assertResourceSaveSample(saves[1], 2), true);
  const autosaveAttributed = structuredClone(saves[1]);
  autosaveAttributed.saveSnapshotCountBefore = 12;
  autosaveAttributed.saveSnapshotCountAfter = 13;
  autosaveAttributed.synchronousSnapshot.totalCount = 13;
  assert.equal(assertResourceSaveSample(autosaveAttributed, 2), true);
  const missingExplicitSave = structuredClone(autosaveAttributed);
  missingExplicitSave.saveSnapshotCountAfter = 12;
  missingExplicitSave.synchronousSnapshot.totalCount = 12;
  assert.throws(
    () => assertResourceSaveSample(missingExplicitSave, 2),
    /did not produce save sample/u,
  );
  const growth = resourceSoakSaveGrowthSummary(saves, 12);
  assert.equal(growth.sampleCount, 6);
  assert.equal(growth.rangeBytes, 300);
  assert.equal(growth.deltaBytes, 300);
  const oversizedSaves = structuredClone(saves);
  oversizedSaves.at(-3).serializedBytes = 1_800_000
    + RESOURCE_SOAK_SAVE_GROWTH_BUDGET_BYTES + 1;
  oversizedSaves.at(-2).serializedBytes = oversizedSaves.at(-3).serializedBytes;
  oversizedSaves.at(-1).serializedBytes = oversizedSaves.at(-3).serializedBytes;
  assert.throws(
    () => resourceSoakSaveGrowthSummary(oversizedSaves, 12),
    /save growth exceeded/u,
  );
  const unequalRepeat = structuredClone(saves);
  unequalRepeat.at(-1).serializedBytes += 1;
  assert.throws(
    () => resourceSoakSaveGrowthSummary(unequalRepeat, 12),
    /save tail changed tick or payload length/u,
  );

  const retentionCheckpoint = (
    label,
    rendererHeapUsedBytes,
    attachedDomElements,
    cdpNodes,
    summedRssBytes,
  ) => ({
    label,
    processTree: { summedRssBytes },
    renderer: {
      heap: { usedSize: rendererHeapUsedBytes },
      dom: {
        attached: { elementCount: attachedDomElements },
        cdp: { nodes: cdpNodes },
      },
    },
  });
  const retentionCheckpoints = [
    retentionCheckpoint('soak-baseline-forced-gc-1', 80_500_000, 3_500, 6_000, 1_400_000_000),
    retentionCheckpoint('soak-baseline-forced-gc-2', 80_000_000, 3_500, 6_000, 1_400_000_000),
    retentionCheckpoint('soak-final-forced-gc-1', 85_400_000, 3_505, 6_020, 1_450_000_000),
    retentionCheckpoint('soak-final-forced-gc-2', 85_000_000, 3_505, 6_020, 1_450_000_000),
  ];
  const retention = resourceSoakRetentionSummary(retentionCheckpoints);
  assert.equal(retention.delta.rendererHeapUsedBytes, 5_000_000);
  assert.equal(retention.delta.attachedDomElements, 5);
  assert.equal(retention.delta.cdpNodes, 20);
  const retainedDom = structuredClone(retentionCheckpoints);
  retainedDom[3].renderer.dom.attached.elementCount = 3_565;
  assert.throws(
    () => resourceSoakRetentionSummary(retainedDom),
    /forced-GC bookends exceeded/u,
  );
  const divergentGc = structuredClone(retentionCheckpoints);
  divergentGc[3].renderer.heap.usedSize = 83_000_000;
  assert.throws(
    () => resourceSoakRetentionSummary(divergentGc),
    /forced-GC bookends exceeded/u,
  );

  const soakRoute = {
    anchorGlobal: { x: 76.5, y: 27.5 },
    outboundGlobal: { x: 76.5, y: -8 },
  };
  const soakPosition = (x, y, regionY) => ({
    x,
    y,
    canonicalRegion: { x: 0, y: regionY },
    projectionConsistent: true,
  });
  const soakCycle = (ordinal, startTick, endTick) => ({
    schema: 'tideweft-resource-route-cycle/v2',
    ordinal,
    reason: 'complete',
    failure: null,
    durationMs: 300_000,
    startTick,
    endTick,
    start: soakPosition(76.5, 27.5, 0),
    turn: soakPosition(76.5, -8, -1),
    end: soakPosition(76.5, 27.5, 0),
    observedDistanceTiles: 71,
    maxObservedStepTiles: 1,
    projectionMismatchCount: 0,
    discontinuityCount: 0,
    targetsIssued: 4,
    visitedRegionKeys: ['0:0', '0:-1', '0:0'],
    modesObserved: ['foot', 'wading'],
    presentationCadence: {
      scope: 'requestAnimationFrame intervals observed by the ordinary route driver',
      frameCount: 6_001,
      intervalCount: 6_000,
      averageIntervalMs: 16.667,
      averageFps: 59.9988,
      p99IntervalUpperBoundMs: 18,
      worstIntervalMs: 42,
    },
  });
  const warmupCycle = soakCycle(0, 0, 10);
  const measuredCycles = Array.from(
    { length: RESOURCE_SOAK_MINIMUM_CYCLES },
    (_, index) => soakCycle(index + 1, 10 + index * 10, 20 + index * 10),
  );
  const measurementFixture = {
    route: soakRoute,
    warmupCycle,
    measuredCycles,
    measuredTravelDurationMs: RESOURCE_SOAK_MINIMUM_TRAVEL_MS,
    saveSamples: saves,
    checkpoints: soakCheckpoints,
  };
  assert.equal(assertResourceSoakMeasurement(measurementFixture), true);
  assert.throws(
    () => assertResourceSoakMeasurement({
      ...measurementFixture,
      measuredTravelDurationMs: RESOURCE_SOAK_MINIMUM_TRAVEL_MS - 1,
    }),
    /did not reconcile sixty active travel minutes/u,
  );
  const discontinuousCycles = structuredClone(measuredCycles);
  discontinuousCycles[5].startTick += 1;
  assert.throws(
    () => assertResourceSoakMeasurement({
      ...measurementFixture,
      measuredCycles: discontinuousCycles,
    }),
    /did not continue from the prior authoritative tick/u,
  );
}

(async () => {
  const cleanGuard = cleanInputEvidence();
  assert.deepEqual(
    await captureInputGuardEvidence({
      evaluate: async () => cleanGuard,
    }, 'guarded hitch trace'),
    cleanGuard,
  );
  const contaminatedGuard = cleanInputEvidence();
  contaminatedGuard.trustedInputs.total = 1;
  contaminatedGuard.trustedInputs.blockingTotal = 1;
  contaminatedGuard.trustedInputs.key = 1;
  await assert.rejects(
    captureInputGuardEvidence({
      evaluate: async () => contaminatedGuard,
    }, 'guarded hitch trace'),
    /contaminated by trusted input/u,
  );
  const calls = [];
  const collected = await forceRendererGarbageCollection({
    call: async (method) => { calls.push(method); },
  }, 1);
  assert.deepEqual(calls, ['HeapProfiler.collectGarbage']);
  assert.equal(collected.ordinal, 1);
  assert.match(collected.scope, /renderer V8 isolate only/u);
  await assert.rejects(
    forceRendererGarbageCollection({
      call: async () => { throw new Error('unsupported'); },
    }, 2),
    /refuses unforced evidence/u,
  );
  process.stdout.write('performance baseline, resource shakedown, and resource soak self-test passed\n');
})().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});

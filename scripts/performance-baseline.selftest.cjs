'use strict';

const assert = require('node:assert/strict');

const {
  HITCH_TRACE_RECORD_CAPACITY,
  HITCH_TRACE_SNAPSHOT_CAPACITY,
  HITCH_TRACE_THRESHOLD_MS,
  buildHitchDelta,
  hitchSnapshotReasons,
  retainBoundedHitchGap,
  retainBoundedHitchSnapshot,
} = require('./performance-baseline.cjs');

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

process.stdout.write('performance baseline hitch tracing self-test passed\n');

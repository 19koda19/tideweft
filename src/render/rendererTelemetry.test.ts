import { describe, expect, it } from "vitest";

import {
  createRendererTelemetry,
  RENDERER_TELEMETRY_MAX_DRAW_COUNT,
  RENDERER_TELEMETRY_SAMPLE_CAPACITY,
  type RendererWorkCounts,
  type RendererTelemetrySnapshot,
} from "./rendererTelemetry";

function recordCadence(
  intervalMs: number,
  intervals: number,
): RendererTelemetrySnapshot {
  const tracker = createRendererTelemetry(120);
  tracker.recordFrame(0);
  for (let index = 1; index <= intervals; index += 1) {
    tracker.recordFrame(index * intervalMs);
  }
  return tracker.getSnapshot();
}

describe("renderer telemetry", () => {
  it("keeps detailed probes opt-in while preserving legacy HUD cadence", () => {
    const tracker = createRendererTelemetry(120, false);
    tracker.recordFrame(0, { terrainTiles: 99 }, 12);
    const legacy = tracker.recordFrame(20, { projectedEntityCandidates: 4 }, 8);

    expect(legacy).toMatchObject({
      fps: 50,
      frameTimeMs: 20,
      frameCount: 2,
      rawFrameIntervalSampleCount: 0,
      drawCpuSampleCount: 0,
    });
    expect(legacy).not.toHaveProperty("terrainTiles");
    expect(legacy).not.toHaveProperty("projectedEntityCandidates");

    tracker.setDetailedEnabled(true);
    expect(tracker.isDetailedEnabled()).toBe(true);
    tracker.recordFrame(100, { terrainTiles: 12 }, 3);
    const measured = tracker.recordFrame(116, { terrainTiles: 13 }, 4);
    expect(measured).toMatchObject({
      rawFrameIntervalSampleCount: 1,
      rawFrameIntervalMeanMs: 16,
      drawCpuSampleCount: 2,
      terrainTiles: 13,
    });
    expect(() => tracker.setDetailedEnabled(1 as unknown as boolean)).toThrow(TypeError);
  });

  it("reports actual 60 fps and 30 fps render cadences", () => {
    const sixtyFps = recordCadence(1_000 / 60, 120);
    const thirtyFps = recordCadence(1_000 / 30, 60);

    expect(sixtyFps.fps).toBeCloseTo(60, 10);
    expect(sixtyFps.frameTimeMs).toBeCloseTo(1_000 / 60, 10);
    expect(sixtyFps.frameCount).toBe(121);
    expect(sixtyFps.rawFrameIntervalSampleCount).toBe(120);
    expect(sixtyFps.rawFrameIntervalMeanMs).toBeCloseTo(1_000 / 60, 10);
    expect(sixtyFps.rawFrameIntervalP99Ms).toBeCloseTo(1_000 / 60, 10);
    expect(sixtyFps.rawFrameIntervalWorstMs).toBeCloseTo(1_000 / 60, 10);
    expect(thirtyFps.fps).toBeCloseTo(30, 10);
    expect(thirtyFps.frameTimeMs).toBeCloseTo(1_000 / 30, 10);
    expect(thirtyFps.frameCount).toBe(61);
    expect(thirtyFps.rawFrameIntervalSampleCount).toBe(60);
    expect(thirtyFps.rawFrameIntervalMeanMs).toBeCloseTo(1_000 / 30, 10);
  });

  it("retains truthful raw spikes while preserving the legacy cadence clamp", () => {
    const tracker = createRendererTelemetry(100);
    tracker.recordFrame(0);
    tracker.recordFrame(1_000 / 60);
    const beforePause = tracker.getSnapshot();
    const afterPause = tracker.recordFrame(60_000);

    expect(beforePause.fps).toBeCloseTo(60, 10);
    expect(afterPause.frameCount).toBe(3);
    expect(afterPause.frameTimeMs).toBeGreaterThan(beforePause.frameTimeMs);
    expect(afterPause.frameTimeMs).toBeLessThanOrEqual(250);
    expect(afterPause.fps).toBeGreaterThanOrEqual(4);
    expect(Number.isFinite(afterPause.fps)).toBe(true);
    expect(afterPause.rawFrameIntervalSampleCount).toBe(2);
    expect(afterPause.rawFrameIntervalMeanMs).toBeCloseTo(30_000, 10);
    expect(afterPause.rawFrameIntervalP99Ms).toBeCloseTo(60_000 - 1_000 / 60, 10);
    expect(afterPause.rawFrameIntervalWorstMs).toBeCloseTo(60_000 - 1_000 / 60, 10);
  });

  it("reports exact bounded-window mean, nearest-rank p99, worst, and draw CPU", () => {
    const tracker = createRendererTelemetry();
    let now = 0;
    tracker.recordFrame(now, undefined, 1);
    const intervals = Array.from({ length: 100 }, (_, index) => index + 1);
    for (const [index, interval] of intervals.entries()) {
      now += interval;
      tracker.recordFrame(now, undefined, index === intervals.length - 1 ? 25 : 2);
    }

    const snapshot = tracker.getSnapshot();
    expect(snapshot.rawFrameIntervalSampleCount).toBe(100);
    expect(snapshot.rawFrameIntervalMeanMs).toBe(50.5);
    expect(snapshot.rawFrameIntervalP99Ms).toBe(99);
    expect(snapshot.rawFrameIntervalWorstMs).toBe(100);
    expect(snapshot.drawCpuSampleCount).toBe(101);
    expect(snapshot.drawCpuMeanMs).toBeCloseTo(224 / 101, 12);
    expect(snapshot.drawCpuP99Ms).toBe(2);
    expect(snapshot.drawCpuWorstMs).toBe(25);
  });

  it("evicts the oldest timing samples at the fixed capacity", () => {
    const tracker = createRendererTelemetry();
    let now = 0;
    tracker.recordFrame(now, undefined, 1);
    for (let sample = 1; sample <= RENDERER_TELEMETRY_SAMPLE_CAPACITY + 5; sample += 1) {
      now += sample;
      tracker.recordFrame(now, undefined, sample);
    }

    const snapshot = tracker.getSnapshot();
    expect(snapshot.rawFrameIntervalSampleCount).toBe(RENDERER_TELEMETRY_SAMPLE_CAPACITY);
    expect(snapshot.rawFrameIntervalMeanMs).toBe(
      (6 + RENDERER_TELEMETRY_SAMPLE_CAPACITY + 5) / 2,
    );
    expect(snapshot.rawFrameIntervalWorstMs).toBe(RENDERER_TELEMETRY_SAMPLE_CAPACITY + 5);
    expect(snapshot.drawCpuSampleCount).toBe(RENDERER_TELEMETRY_SAMPLE_CAPACITY);
    expect(snapshot.drawCpuMeanMs).toBe(
      (6 + RENDERER_TELEMETRY_SAMPLE_CAPACITY + 5) / 2,
    );
  });

  it("stops hidden frames and restarts from a fresh render timestamp", () => {
    const tracker = createRendererTelemetry();
    tracker.recordFrame(0, { projectedEntityCandidates: 4 });
    tracker.recordFrame(16, { projectedEntityCandidates: 5 });
    const priorFrameCount = tracker.getSnapshot().frameCount;

    expect(tracker.setActive(false)).toEqual({
      fps: 0,
      frameTimeMs: 0,
      frameCount: priorFrameCount,
      active: false,
      detailedSampleCapacity: RENDERER_TELEMETRY_SAMPLE_CAPACITY,
      rawFrameIntervalSampleCount: 0,
      rawFrameIntervalMeanMs: 0,
      rawFrameIntervalP99Ms: 0,
      rawFrameIntervalWorstMs: 0,
      drawCpuSampleCount: 0,
      drawCpuMeanMs: 0,
      drawCpuP99Ms: 0,
      drawCpuWorstMs: 0,
    });
    const inactive = tracker.getSnapshot();
    expect(tracker.recordFrame(50_000, { projectedEntityCandidates: 999 })).toBe(inactive);

    expect(tracker.setActive(true)).toMatchObject({
      fps: 0,
      frameTimeMs: 0,
      frameCount: priorFrameCount,
      active: true,
    });
    expect(tracker.recordFrame(80_000).frameTimeMs).toBe(0);
    const restarted = tracker.recordFrame(80_000 + 1_000 / 30);
    expect(restarted.fps).toBeCloseTo(30, 10);
    expect(restarted.frameCount).toBe(priorFrameCount + 2);
  });

  it("rejects malformed and nonmonotonic timestamps without advancing", () => {
    const tracker = createRendererTelemetry();
    const initial = tracker.getSnapshot();

    expect(tracker.recordFrame(Number.NaN)).toBe(initial);
    expect(tracker.recordFrame(Number.POSITIVE_INFINITY)).toBe(initial);
    expect(tracker.recordFrame(-1)).toBe(initial);

    const first = tracker.recordFrame(100, { labels: 2 });
    for (const invalid of [100, 99, Number.NaN, Number.NEGATIVE_INFINITY]) {
      expect(tracker.recordFrame(invalid, { labels: 800 })).toBe(first);
    }
    expect(tracker.getSnapshot()).toEqual({
      fps: 0,
      frameTimeMs: 0,
      frameCount: 1,
      active: true,
      detailedSampleCapacity: RENDERER_TELEMETRY_SAMPLE_CAPACITY,
      rawFrameIntervalSampleCount: 0,
      rawFrameIntervalMeanMs: 0,
      rawFrameIntervalP99Ms: 0,
      rawFrameIntervalWorstMs: 0,
      drawCpuSampleCount: 0,
      drawCpuMeanMs: 0,
      drawCpuP99Ms: 0,
      drawCpuWorstMs: 0,
      labels: 2,
    });
  });

  it("ignores invalid draw durations without rejecting an otherwise valid frame", () => {
    const tracker = createRendererTelemetry();
    tracker.recordFrame(0, undefined, Number.NaN);
    tracker.recordFrame(16, undefined, -1);
    tracker.recordFrame(32, undefined, Number.POSITIVE_INFINITY);
    const snapshot = tracker.recordFrame(48, undefined, 4.5);

    expect(snapshot.frameCount).toBe(4);
    expect(snapshot.rawFrameIntervalSampleCount).toBe(3);
    expect(snapshot.drawCpuSampleCount).toBe(1);
    expect(snapshot.drawCpuMeanMs).toBe(4.5);
    expect(snapshot.drawCpuP99Ms).toBe(4.5);
    expect(snapshot.drawCpuWorstMs).toBe(4.5);
  });

  it("publishes frozen, per-frame renderer-work counts at finite integer bounds", () => {
    const tracker = createRendererTelemetry();
    const snapshot = tracker.recordFrame(0, {
      terrainTiles: 12.9,
      perceptionMaterialSubmissions: 4.9,
      perceptionMaterialSegments: 11.8,
      passiveFieldResourceHaloCount: 7.9,
      passiveFieldResourceHaloVertices: 91.8,
      projectedEntityCandidates: -3,
      labels: Number.MAX_SAFE_INTEGER,
      particles: 8,
    });

    expect(snapshot).toMatchObject({
      terrainTiles: 12,
      perceptionMaterialSubmissions: 4,
      perceptionMaterialSegments: 11,
      passiveFieldResourceHaloCount: 7,
      passiveFieldResourceHaloVertices: 91,
      projectedEntityCandidates: 0,
      labels: RENDERER_TELEMETRY_MAX_DRAW_COUNT,
      particles: 8,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);

    const malformedCounts = {
      terrainTiles: 9,
      perceptionMaterialSubmissions: Number.NaN,
      perceptionMaterialSegments: Number.POSITIVE_INFINITY,
      passiveFieldResourceHaloCount: Number.NaN,
      passiveFieldResourceHaloVertices: Number.POSITIVE_INFINITY,
      projectedEntityCandidates: Number.NaN,
      labels: Number.POSITIVE_INFINITY,
      particles: "many",
    } as unknown as RendererWorkCounts;
    expect(tracker.recordFrame(16, malformedCounts)).toMatchObject({ terrainTiles: 9 });
    expect(tracker.getSnapshot()).not.toHaveProperty("projectedEntityCandidates");
    expect(tracker.getSnapshot()).not.toHaveProperty("perceptionMaterialSubmissions");
    expect(tracker.getSnapshot()).not.toHaveProperty("perceptionMaterialSegments");
    expect(tracker.getSnapshot()).not.toHaveProperty("passiveFieldResourceHaloCount");
    expect(tracker.getSnapshot()).not.toHaveProperty("passiveFieldResourceHaloVertices");
    expect(tracker.getSnapshot()).not.toHaveProperty("labels");
    expect(tracker.getSnapshot()).not.toHaveProperty("particles");
  });

  it("replays the same render timestamps and lifecycle deterministically", () => {
    const replay = (): readonly RendererTelemetrySnapshot[] => {
      const tracker = createRendererTelemetry(175);
      const snapshots = [
        tracker.recordFrame(4, { terrainTiles: 40 }, 3),
        tracker.recordFrame(20, { projectedEntityCandidates: 3 }, 7),
        tracker.recordFrame(53, { labels: 2, particles: 7 }, 2),
        tracker.setActive(false),
        tracker.recordFrame(9_000, { projectedEntityCandidates: 700 }),
        tracker.setActive(true),
        tracker.recordFrame(9_100),
        tracker.recordFrame(9_120, { terrainTiles: 21 }),
      ];
      return snapshots.map((snapshot) => ({ ...snapshot }));
    };

    expect(replay()).toEqual(replay());
  });
});

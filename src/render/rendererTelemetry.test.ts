import { describe, expect, it } from "vitest";

import {
  createRendererTelemetry,
  RENDERER_TELEMETRY_MAX_DRAW_COUNT,
  type RendererDrawCounts,
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
  it("reports actual 60 fps and 30 fps render cadences", () => {
    const sixtyFps = recordCadence(1_000 / 60, 120);
    const thirtyFps = recordCadence(1_000 / 30, 60);

    expect(sixtyFps.fps).toBeCloseTo(60, 10);
    expect(sixtyFps.frameTimeMs).toBeCloseTo(1_000 / 60, 10);
    expect(sixtyFps.frameCount).toBe(121);
    expect(thirtyFps.fps).toBeCloseTo(30, 10);
    expect(thirtyFps.frameTimeMs).toBeCloseTo(1_000 / 30, 10);
    expect(thirtyFps.frameCount).toBe(61);
  });

  it("clamps a long render pause without retaining unbounded samples", () => {
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
  });

  it("stops hidden frames and restarts from a fresh render timestamp", () => {
    const tracker = createRendererTelemetry();
    tracker.recordFrame(0, { entities: 4 });
    tracker.recordFrame(16, { entities: 5 });
    const priorFrameCount = tracker.getSnapshot().frameCount;

    expect(tracker.setActive(false)).toEqual({
      fps: 0,
      frameTimeMs: 0,
      frameCount: priorFrameCount,
      active: false,
    });
    const inactive = tracker.getSnapshot();
    expect(tracker.recordFrame(50_000, { entities: 999 })).toBe(inactive);

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
      labels: 2,
    });
  });

  it("publishes frozen, per-frame draw counts at finite integer bounds", () => {
    const tracker = createRendererTelemetry();
    const snapshot = tracker.recordFrame(0, {
      terrainTiles: 12.9,
      entities: -3,
      labels: Number.MAX_SAFE_INTEGER,
      particles: 8,
    });

    expect(snapshot).toMatchObject({
      terrainTiles: 12,
      entities: 0,
      labels: RENDERER_TELEMETRY_MAX_DRAW_COUNT,
      particles: 8,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);

    const malformedCounts = {
      terrainTiles: 9,
      entities: Number.NaN,
      labels: Number.POSITIVE_INFINITY,
      particles: "many",
    } as unknown as RendererDrawCounts;
    expect(tracker.recordFrame(16, malformedCounts)).toMatchObject({ terrainTiles: 9 });
    expect(tracker.getSnapshot()).not.toHaveProperty("entities");
    expect(tracker.getSnapshot()).not.toHaveProperty("labels");
    expect(tracker.getSnapshot()).not.toHaveProperty("particles");
  });

  it("replays the same render timestamps and lifecycle deterministically", () => {
    const replay = (): readonly RendererTelemetrySnapshot[] => {
      const tracker = createRendererTelemetry(175);
      const snapshots = [
        tracker.recordFrame(4, { terrainTiles: 40 }),
        tracker.recordFrame(20, { entities: 3 }),
        tracker.recordFrame(53, { labels: 2, particles: 7 }),
        tracker.setActive(false),
        tracker.recordFrame(9_000, { entities: 700 }),
        tracker.setActive(true),
        tracker.recordFrame(9_100),
        tracker.recordFrame(9_120, { terrainTiles: 21 }),
      ];
      return snapshots.map((snapshot) => ({ ...snapshot }));
    };

    expect(replay()).toEqual(replay());
  });
});

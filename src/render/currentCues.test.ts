import { describe, expect, it } from "vitest";

import type { TerrainGridView, TerrainTileView } from "./types";
import { MAX_SURFACE_CURRENT_CUES, buildSurfaceCurrentCues } from "./currentCues";

const tile = (overrides: Partial<TerrainTileView> = {}): TerrainTileView => ({
  kind: "channel",
  elevation: 0.2,
  waterDepth: 0.2,
  discovered: 1,
  depthKnown: 0,
  ...overrides,
});

function grid(
  columns: number,
  rows: number,
  tiles: readonly TerrainTileView[],
): TerrainGridView {
  return {
    columns,
    rows,
    tileSize: 20,
    origin: { x: 10, y: 30 },
    tiles,
    revision: "current-cue-test",
  };
}

describe("surface current cue geometry", () => {
  it("uses one fixed-size arrow per wet 2x2 block and caps the overlay", () => {
    const terrain = grid(4, 4, Array.from({ length: 16 }, () => tile()));
    const cues = buildSurfaceCurrentCues(terrain, { x: -1, y: 1 }, {
      reducedMotion: true,
    });

    expect(cues).toHaveLength(4);
    expect(new Set(cues.map((cue) => `${Math.floor(cue.column / 2)},${Math.floor(cue.row / 2)}`)).size).toBe(4);
    expect(buildSurfaceCurrentCues(terrain, { x: -1, y: 1 }, { maxCues: 2 })).toHaveLength(2);

    const large = grid(80, 80, Array.from({ length: 6_400 }, () => tile()));
    expect(buildSurfaceCurrentCues(large, { x: 1, y: 0 }, { maxCues: 99_999 }))
      .toHaveLength(MAX_SURFACE_CURRENT_CUES);
  });

  it("shows only charted wet surface and never reads sounding confidence", () => {
    const unsounded = {
      kind: "channel",
      elevation: 0.1,
      waterDepth: 0.24,
      discovered: 1,
      get depthKnown(): number {
        throw new Error("surface-current cues must not inspect sounding confidence");
      },
    } satisfies TerrainTileView;
    const terrain = grid(2, 2, [
      unsounded,
      tile({ waterDepth: 0 }),
      tile({ discovered: 0 }),
      tile({ waterDepth: 0 }),
    ]);

    expect(() => buildSurfaceCurrentCues(terrain, { x: 1, y: 0 })).not.toThrow();
    expect(buildSurfaceCurrentCues(terrain, { x: 1, y: 0 }).map((cue) => cue.tileIndex)).toEqual([0]);
  });

  it("does not encode unknown depth magnitude in arrow placement or shape", () => {
    const shallow = grid(1, 1, [tile({ waterDepth: 0.08, depthKnown: 0 })]);
    const deep = grid(1, 1, [tile({ waterDepth: 0.92, depthKnown: 0 })]);
    const options = { reducedMotion: true, timeMs: 99_999 } as const;

    expect(buildSurfaceCurrentCues(shallow, { x: 1, y: -1 }, options))
      .toEqual(buildSurfaceCurrentCues(deep, { x: 1, y: -1 }, options));
  });

  it("normalizes heading, points the arrow downstream, and freezes reduced motion", () => {
    const terrain = grid(1, 1, [tile()]);
    const frozenEarly = buildSurfaceCurrentCues(terrain, { x: -8, y: 8 }, {
      timeMs: 0,
      reducedMotion: true,
    })[0];
    const frozenLate = buildSurfaceCurrentCues(terrain, { x: -8, y: 8 }, {
      timeMs: 50_000,
      reducedMotion: true,
    })[0];
    if (!frozenEarly || !frozenLate) throw new Error("wet fixture did not produce a cue");

    expect(frozenLate).toEqual(frozenEarly);
    expect(Math.hypot(frozenEarly.direction.x, frozenEarly.direction.y)).toBeCloseTo(1, 12);
    expect(frozenEarly.tip.x).toBeLessThan(frozenEarly.tail.x);
    expect(frozenEarly.tip.y).toBeGreaterThan(frozenEarly.tail.y);

    const movingEarly = buildSurfaceCurrentCues(terrain, { x: -1, y: 1 }, { timeMs: 0 })[0];
    const movingLate = buildSurfaceCurrentCues(terrain, { x: -1, y: 1 }, { timeMs: 1_000 })[0];
    expect(movingLate?.center).not.toEqual(movingEarly?.center);
  });

  it("returns no cue for a missing or zero-length current", () => {
    const terrain = grid(1, 1, [tile()]);
    expect(buildSurfaceCurrentCues(terrain, undefined)).toEqual([]);
    expect(buildSurfaceCurrentCues(terrain, { x: 0, y: 0 })).toEqual([]);
  });

  it("never leaks live current direction through hidden or peripheral tiles", () => {
    const terrain = grid(3, 1, [
      tile({ currentVisibility: 0 }),
      tile({ currentVisibility: 0.5 }),
      tile({ currentVisibility: 1 }),
    ]);
    expect(buildSurfaceCurrentCues(terrain, { x: 1, y: 0 }).map((cue) => cue.tileIndex))
      .toEqual([2]);
  });
});

import { describe, expect, it } from "vitest";

import { FIXED_POINT } from "../sim/types";
import { surfaceCurrentDirection } from "../game/currentDirection";
import type { TerrainGridView, TerrainTileView } from "./types";
import {
  MAX_SURFACE_CURRENT_CUES,
  MAX_WATER_VOICE_LABELS,
  buildSurfaceCurrentCues,
  buildWaterVoiceLabels,
} from "./currentCues";

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
      analytical: false,
      reducedMotion: true,
    });

    expect(cues).toHaveLength(4);
    expect(new Set(cues.map((cue) => `${Math.floor(cue.column / 2)},${Math.floor(cue.row / 2)}`)).size).toBe(4);
    expect(buildSurfaceCurrentCues(terrain, { x: -1, y: 1 }, {
      analytical: false,
      maxCues: 2,
    })).toHaveLength(2);

    const large = grid(80, 80, Array.from({ length: 6_400 }, () => tile()));
    expect(buildSurfaceCurrentCues(large, { x: 1, y: 0 }, {
      analytical: false,
      maxCues: 99_999,
    }))
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

    expect(() => buildSurfaceCurrentCues(terrain, { x: 1, y: 0 }, { analytical: false })).not.toThrow();
    expect(buildSurfaceCurrentCues(terrain, { x: 1, y: 0 }, { analytical: false })
      .map((cue) => cue.tileIndex)).toEqual([0]);
  });

  it("uses the shared profile so local depth and roughness change visible flow energy", () => {
    const shallow = grid(1, 1, [tile({ waterDepth: 0.08, depthKnown: 0 })]);
    const deep = grid(1, 1, [tile({ waterDepth: 0.92, roughness: 0.9, depthKnown: 0 })]);
    const options = { analytical: false, reducedMotion: true, timeMs: 99_999 } as const;

    const calm = buildSurfaceCurrentCues(shallow, { x: 1, y: -1 }, options)[0];
    const rough = buildSurfaceCurrentCues(deep, { x: 1, y: -1 }, options)[0];
    expect(rough?.strength).toBeGreaterThan(calm?.strength ?? 1);
    expect(rough?.turbulence).toBeGreaterThan(calm?.turbulence ?? 1);
    expect(rough?.foam.length).toBeGreaterThan(calm?.foam.length ?? 4);
  });

  it("normalizes heading, points the arrow downstream, and freezes reduced motion", () => {
    const terrain = grid(1, 1, [tile()]);
    const frozenEarly = buildSurfaceCurrentCues(terrain, { x: -8, y: 8 }, {
      analytical: false,
      timeMs: 0,
      reducedMotion: true,
    })[0];
    const frozenLate = buildSurfaceCurrentCues(terrain, { x: -8, y: 8 }, {
      analytical: false,
      timeMs: 50_000,
      reducedMotion: true,
    })[0];
    if (!frozenEarly || !frozenLate) throw new Error("wet fixture did not produce a cue");

    expect(frozenLate).toEqual(frozenEarly);
    expect(Math.hypot(frozenEarly.direction.x, frozenEarly.direction.y)).toBeCloseTo(1, 12);
    expect(frozenEarly.tip.x).toBeLessThan(frozenEarly.tail.x);
    expect(frozenEarly.tip.y).toBeGreaterThan(frozenEarly.tail.y);

    const movingEarly = buildSurfaceCurrentCues(terrain, { x: -1, y: 1 }, {
      analytical: false,
      timeMs: 0,
    })[0];
    const movingLate = buildSurfaceCurrentCues(terrain, { x: -1, y: 1 }, {
      analytical: false,
      timeMs: 1_000,
    })[0];
    expect(movingLate?.center).not.toEqual(movingEarly?.center);
  });

  it("normalizes the shared vector without turning a tiny crosswind diagonal", () => {
    const terrain = grid(1, 1, [tile()]);
    const cue = (windY: number) => buildSurfaceCurrentCues(
      terrain,
      surfaceCurrentDirection(-1, windY),
      { analytical: false, reducedMotion: true },
    )[0];
    const tiny = cue(1);
    const moderate = cue(240_000);
    const maximum = cue(FIXED_POINT);
    const mirrored = cue(-240_000);
    if (!tiny || !moderate || !maximum || !mirrored) throw new Error("wet fixture lost its cue");

    expect(tiny.direction.x).toBeGreaterThan(0.999_999);
    expect(tiny.direction.y).toBeGreaterThan(0);
    expect(Math.abs(tiny.direction.y)).toBeLessThan(Math.abs(moderate.direction.y));
    expect(Math.abs(moderate.direction.y)).toBeLessThan(Math.abs(maximum.direction.y));
    expect(maximum.direction.x).toBeCloseTo(maximum.direction.y, 12);
    expect(mirrored.direction.x).toBeCloseTo(moderate.direction.x, 12);
    expect(mirrored.direction.y).toBeCloseTo(-moderate.direction.y, 12);
  });

  it("returns no cue for a missing or zero-length current", () => {
    const terrain = grid(1, 1, [tile()]);
    expect(buildSurfaceCurrentCues(terrain, undefined, { analytical: false })).toEqual([]);
    expect(buildSurfaceCurrentCues(terrain, { x: 0, y: 0 }, { analytical: false })).toEqual([]);
  });

  it("never leaks live current direction through hidden or peripheral tiles", () => {
    const terrain = grid(3, 1, [
      tile({ currentVisibility: 1, currentDetailVisibility: 0 }),
      tile({ currentVisibility: 1, currentDetailVisibility: 0.5 }),
      tile({ currentVisibility: 1, currentDetailVisibility: 1 }),
    ]);
    expect(buildSurfaceCurrentCues(terrain, { x: 1, y: 0 }, { analytical: false })
      .map((cue) => cue.tileIndex))
      .toEqual([2]);
  });

  it("shows transient directly perceived water without charting or labeling its depth", () => {
    const terrain = grid(2, 1, [
      tile({ discovered: 0, currentVisibility: 1, currentDetailVisibility: 1 }),
      tile({ discovered: 0, currentVisibility: 1, currentDetailVisibility: 0 }),
    ]);
    const discoveryBefore = terrain.tiles.map(({ discovered }) => discovered);
    const visible = buildSurfaceCurrentCues(terrain, { x: 1, y: 0 }, {
      analytical: false,
      requireDetailDisclosure: true,
    });
    expect(visible.map(({ tileIndex }) => tileIndex)).toEqual([0]);
    expect(visible.every((cue) => !("depth" in cue))).toBe(true);
    expect(terrain.tiles.map(({ discovered }) => discovered)).toEqual(discoveryBefore);

    const turnedAway = {
      ...terrain,
      tiles: terrain.tiles.map((candidate) => ({
        ...candidate,
        currentDetailVisibility: 0 as const,
      })),
    };
    expect(buildSurfaceCurrentCues(turnedAway, { x: 1, y: 0 }, {
      analytical: false,
      requireDetailDisclosure: true,
    })).toEqual([]);
  });

  it("fails closed on a missing detail field in a perception-enabled view", () => {
    const malformed = grid(1, 1, [tile({ currentVisibility: 1 })]);
    expect(buildSurfaceCurrentCues(malformed, { x: 1, y: 0 }, {
      analytical: false,
      requireDetailDisclosure: true,
    })).toEqual([]);

    // Missing disclosure fields remain compatible only for explicit legacy
    // callers that have no perception snapshot.
    expect(buildSurfaceCurrentCues(malformed, { x: 1, y: 0 }, {
      analytical: false,
    })).toHaveLength(1);
    expect(buildSurfaceCurrentCues(
      grid(1, 1, [tile({ currentVisibility: 1, currentDetailVisibility: 1 })]),
      { x: 1, y: 0 },
      { analytical: false, requireDetailDisclosure: true },
    )).toHaveLength(1);
  });

  it("marks arrowheads analytical only and bounds sparse water syllables", () => {
    const terrain = grid(8, 8, Array.from({ length: 64 }, (_, index) => tile({
      roughness: index % 2 ? 0.05 : 0.95,
      waterDepth: index % 2 ? 0.12 : 0.9,
    })));
    const ordinary = buildSurfaceCurrentCues(terrain, { x: 1, y: 0 }, {
      analytical: false,
      timeMs: 0,
      reducedMotion: true,
    });
    const scanned = buildSurfaceCurrentCues(terrain, { x: 1, y: 0 }, {
      analytical: true,
      timeMs: 0,
      reducedMotion: true,
    });
    expect(ordinary.every((cue) => !cue.analytical)).toBe(true);
    expect(scanned.every((cue) => cue.analytical)).toBe(true);
    expect(ordinary.every((cue) =>
      cue.headLeft.x === cue.tip.x
      && cue.headLeft.y === cue.tip.y
      && cue.headRight.x === cue.tip.x
      && cue.headRight.y === cue.tip.y
    )).toBe(true);
    expect(scanned.every((cue) =>
      cue.headLeft.x !== cue.tip.x || cue.headLeft.y !== cue.tip.y
    )).toBe(true);
    expect(new Set(ordinary.map((cue) => cue.voice))).toEqual(new Set(["ohm", "whissh"]));

    const visible = buildWaterVoiceLabels(ordinary, 0, false, 99);
    expect(visible.length).toBeLessThanOrEqual(MAX_WATER_VOICE_LABELS);
    expect(visible.every(({ text }) => text === "ohm" || text === "whissh")).toBe(true);
    expect(buildWaterVoiceLabels(ordinary, 1_500, false)).toEqual([]);
  });
});

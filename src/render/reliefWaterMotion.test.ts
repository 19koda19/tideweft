import { describe, expect, it } from "vitest";

import { buildSurfaceCurrentCues, type SurfaceCurrentCue } from "./currentCues";
import { reliefWaterMotionFrame, type ReliefWaterMotionFrame } from "./reliefWaterMotion";
import type { TerrainGridView, TerrainTileView, WorldPoint } from "./types";

function grid(overrides: Partial<TerrainTileView> = {}): TerrainGridView {
  return {
    columns: 8, rows: 8, tileSize: 24, origin: { x: -12, y: 30 },
    worldTileOrigin: { x: -120, y: 240 }, revision: "water-motion-fixture",
    tiles: Array.from({ length: 64 }, () => ({
      kind: "channel", elevation: 0.2, waterDepth: 0.3, roughness: 0.2,
      discovered: 0, currentVisibility: 1, currentDetailVisibility: 1,
      ...overrides,
    })),
  };
}

function cues(terrain: TerrainGridView, tideLevel = 0.5, weatherIntensity = 0): readonly SurfaceCurrentCue[] {
  return buildSurfaceCurrentCues(terrain, { x: -3, y: 4 }, {
    analytical: false, tideLevel, weatherIntensity, reducedMotion: true,
    requireDetailDisclosure: true,
  });
}

/** Shader-reference phase only: no physical water or gameplay is simulated. */
function sample(frame: ReliefWaterMotionFrame, point: WorldPoint): readonly [number, number] {
  const x = (point.x - frame.origin[0]) / frame.tileSize;
  const y = (point.y - frame.origin[1]) / frame.tileSize;
  const [dx, dy] = frame.direction;
  return [Math.sin((x * dx + y * dy) * 1.4 + frame.phase[0]),
    Math.sin((-x * dy + y * dx) * 2.1 + frame.phase[1])];
}

describe("Relief water motion frame", () => {
  it("increases bounded amplitude and rate with genuine shared local flow", () => {
    const calmGrid = grid({ waterDepth: 0.08, roughness: 0.02 });
    const roughGrid = grid({ waterDepth: 0.9, roughness: 0.95 });
    const calmCues = cues(calmGrid, 0, 0), roughCues = cues(roughGrid, 0.9, 0.9);
    expect(calmCues.length).toBeGreaterThan(0);
    expect(roughCues[0]!.strength).toBeGreaterThan(calmCues[0]!.strength);
    const calm = reliefWaterMotionFrame(calmGrid, calmCues, { x: -3, y: 4 }, false);
    const rough = reliefWaterMotionFrame(roughGrid, roughCues, { x: -3, y: 4 }, false);
    expect(rough.amplitude).toBeGreaterThan(calm.amplitude);
    expect(rough.rate).toBeGreaterThan(calm.rate);
    expect(rough.amplitude).toBeLessThanOrEqual(0.65);
    expect(rough.amplitude).toBeLessThanOrEqual(rough.tileSize * 0.02);
    expect(rough.rate).toBeLessThanOrEqual(2.25);
  });

  it("uses no more than the first eight already lawful near-sorted cues", () => {
    const terrain = grid(), visible = cues(terrain);
    expect(visible.length).toBeGreaterThan(8);
    const first = visible.slice(0, 8), bounded = [...first];
    Object.defineProperty(bounded, 8, { get: () => {
      throw new Error("motion must not inspect later cues");
    } });
    const frame = reliefWaterMotionFrame(terrain, bounded, { x: -3, y: 4 }, false);
    expect(frame).toEqual(reliefWaterMotionFrame(terrain, first, { x: -3, y: 4 }, false));
    const strength = first.reduce((total, cue) => total + cue.strength, 0) / 8;
    const turbulence = first.reduce((total, cue) => total + cue.turbulence, 0) / 8;
    expect(frame.amplitude).toBeCloseTo(0.48 * (0.15 + strength * 0.85), 12);
    expect(frame.rate).toBeCloseTo(0.5 + strength * 1.5 + turbulence * 0.25, 12);
  });

  it("keeps heading length out of motion energy, including huge finite vectors", () => {
    const terrain = grid(), visible = cues(terrain);
    const baseline = reliefWaterMotionFrame(terrain, visible, { x: -3, y: 4 }, false);
    for (const magnitude of [0.000_001, 1_000_000, 1e307]) {
      const scaled = reliefWaterMotionFrame(terrain, visible, {
        x: -3 * magnitude, y: 4 * magnitude,
      }, false);
      expect(scaled).toEqual(baseline);
      const scaledCue = reliefWaterMotionFrame(terrain, visible.map((cue) => ({
        ...cue, direction: { x: -3 * magnitude, y: 4 * magnitude },
      })), undefined, false);
      expect(scaledCue.amplitude).toBe(baseline.amplitude);
      expect(scaledCue.rate).toBe(baseline.rate);
      scaledCue.direction.forEach((value, index) => expect(value).toBeCloseTo(baseline.direction[index]!, 12));
      scaledCue.phase.forEach((value, index) => expect(value).toBeCloseTo(baseline.phase[index]!, 10));
    }
    expect(Math.hypot(...baseline.direction)).toBeCloseTo(1, 12);
  });

  it("uses restrained ambient motion when no current is perceived, without raw tile reads", () => {
    const terrain = grid({ currentDetailVisibility: 0 });
    expect(cues(terrain)).toEqual([]);
    const metadata = { origin: terrain.origin, tileSize: terrain.tileSize,
      worldTileOrigin: terrain.worldTileOrigin!, get tiles(): never {
        throw new Error("motion must not recover hidden flow from terrain");
      } };
    const ambient = reliefWaterMotionFrame(metadata, [], undefined, false);
    expect(ambient.amplitude).toBeCloseTo(0.072, 12);
    expect(ambient.rate).toBe(0.5);
    expect(ambient.direction).toEqual([1, 0]);
    for (const direction of [{ x: 0, y: 0 }, { x: -3, y: 4 }, { x: 1e307, y: -1e307 }]) {
      expect(ambient).toEqual(reliefWaterMotionFrame(metadata, [], direction, false));
    }
  });

  it("sets zero displacement for reduced motion without changing source-derived context", () => {
    const terrain = grid(), visible = cues(terrain);
    const moving = reliefWaterMotionFrame(terrain, visible, { x: -3, y: 4 }, false);
    const reduced = reliefWaterMotionFrame(terrain, visible, { x: -3, y: 4 }, true);
    expect(reduced).toEqual({ ...moving, amplitude: 0 });
  });

  it.each([0.000_001, 0.25, 1, 24, 96, Number.MAX_VALUE])(
    "bounds lift by world units and tile fraction at tile size %s", (tileSize) => {
      const terrain = { ...grid(), tileSize }, source = cues(grid())[0]!;
      const frame = reliefWaterMotionFrame(terrain, [{ ...source, strength: 1, turbulence: 1 }], undefined, false);
      expect(frame.amplitude).toBeLessThanOrEqual(0.65);
      expect(frame.amplitude).toBeLessThanOrEqual(tileSize * 0.02);
      expect(frame.tileSize).toBe(tileSize);
      expect(frame.rate).toBe(2.25);
    });

  it("contains malformed nonfinite inputs without reading or changing authoritative state", () => {
    const source = cues(grid())[0]!;
    for (const tileSize of [0, -24, NaN, Infinity, Number.MIN_VALUE]) {
      const frame = reliefWaterMotionFrame({ tileSize, origin: { x: NaN, y: Infinity },
        worldTileOrigin: { x: -Infinity, y: NaN } },
      [{ ...source, strength: NaN, turbulence: Infinity, direction: { x: NaN, y: Infinity } }],
      { x: Infinity, y: 1 }, false);
      expect(frame).toEqual({ amplitude: 0.003, rate: 0.5, direction: [1, 0],
        phase: [0, 0], origin: [0, 0], tileSize: 1 });
    }
    const clamped = reliefWaterMotionFrame(grid(), [{ ...source, strength: 5, turbulence: -4 }], undefined, false);
    expect(clamped.amplitude).toBe(0.48);
    expect(clamped.rate).toBe(2);
  });

  it.each([NaN, Infinity, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.MAX_VALUE])(
    "neutralizes malformed global tile coordinates (%s)", (coordinate) => {
      const terrain = { ...grid(), worldTileOrigin: { x: coordinate, y: coordinate } };
      expect(reliefWaterMotionFrame(terrain, [], { x: -3, y: 4 }, false).phase).toEqual([0, 0]);
    });

  it.each([
    [-120, 240, 120, -120, 10],
    [120, -240, -120, 120, 10],
    [-2_147_483_648, 2_147_483_647, 120, -120, 10],
    [-9_007_199_254_740_000, 9_007_199_254_740_000, 120, -120, 10],
    [9_007_199_254_740_000, -9_007_199_254_740_000, -120, 120, 10],
  ] as const)("preserves signed-place phase through a frame rebase from %s:%s", (worldX, worldY, shiftX, shiftY, precision) => {
    const terrain = { ...grid(), worldTileOrigin: { x: worldX, y: worldY } };
    const direction = { x: -3, y: 4 }, point = { x: 88, y: 190 }, visible = cues(terrain);
    const before = reliefWaterMotionFrame(terrain, visible, direction, false);
    const origin = { x: 40, y: -30 };
    const shifted = { ...terrain, origin, worldTileOrigin: { x: worldX + shiftX, y: worldY + shiftY } };
    const shiftedPoint = {
      x: origin.x + point.x - terrain.origin.x - shiftX * terrain.tileSize,
      y: origin.y + point.y - terrain.origin.y - shiftY * terrain.tileSize,
    };
    const after = reliefWaterMotionFrame(shifted, visible, direction, false);
    const left = sample(before, point), right = sample(after, shiftedPoint);
    expect(right[0]).toBeCloseTo(left[0], precision);
    expect(right[1]).toBeCloseTo(left[1], precision);
    expect(after.phase.every((value) => Number.isFinite(value) && value >= 0 && value < Math.PI * 2)).toBe(true);
  });

  it("does not mutate source metadata or the existing lawful flow cues", () => {
    const terrain = grid(), visible = cues(terrain);
    const before = JSON.stringify({ terrain, visible });
    Object.freeze(terrain.origin); Object.freeze(terrain.worldTileOrigin); Object.freeze(terrain);
    visible.forEach(Object.freeze); Object.freeze(visible);
    const frame = reliefWaterMotionFrame(terrain, visible, { x: -3, y: 4 }, false);
    expect(JSON.stringify({ terrain, visible })).toBe(before);
    expect(reliefWaterMotionFrame(terrain, visible, { x: -3, y: 4 }, false)).toEqual(frame);
  });
});

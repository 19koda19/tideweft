import { describe, expect, it } from "vitest";

import { deriveBiomeProfile } from "./biomes";
import { seedFromText, type RootSeed } from "./rng";
import {
  REGION_COORD_LIMIT,
  stableRegionObjectId,
  type RegionCoord,
} from "./regions";
import {
  createRegionTerrainSampler,
  generateRegionTerrain,
  generateRegionTerrainBundle,
  parseRegionTerrainManifest,
  regionTerrainHash,
  serializeRegionTerrainManifest,
  validateRegionTerrainManifest,
  type GeneratedRegionTerrain,
} from "./regionTerrain";
import { generateTerrain, tideAtTick, waterDepthAt } from "./terrain";
import {
  FIXED_POINT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type TerrainKind,
  type TerrainState,
  type TerrainTile,
} from "./types";
import { hashCanonical, stableStringify } from "./util";

const TERRAIN_RANK: Readonly<Record<TerrainKind, number>> = {
  "deep-water": 0,
  "tidal-flat": 1,
  marsh: 2,
  meadow: 3,
  ridge: 4,
};

function tileAt(terrain: TerrainState, x: number, y: number): TerrainTile {
  const tile = terrain.tiles[y * terrain.width + x];
  if (!tile) throw new Error(`missing terrain tile ${x},${y}`);
  return tile;
}

function expectContinuousPair(left: TerrainTile, right: TerrainTile): void {
  expect(Math.abs(left.elevation - right.elevation)).toBeLessThanOrEqual(170_000);
  expect(Math.abs(left.moisture - right.moisture)).toBeLessThanOrEqual(210_000);
  expect(Math.abs(left.roughness - right.roughness)).toBeLessThanOrEqual(240_000);
  expect(Math.abs(TERRAIN_RANK[left.terrain] - TERRAIN_RANK[right.terrain]))
    .toBeLessThanOrEqual(1);
  expect(Math.abs(left.baseTravelCost - right.baseTravelCost)).toBeLessThanOrEqual(900);
  const highTide = tideAtTick(360);
  expect(Math.abs(waterDepthAt(left, highTide) - waterDepthAt(right, highTide)))
    .toBeLessThanOrEqual(170_000);
}

function compareEastWest(
  west: GeneratedRegionTerrain,
  east: GeneratedRegionTerrain,
): void {
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    expectContinuousPair(
      tileAt(west.terrain, WORLD_WIDTH - 1, y),
      tileAt(east.terrain, 0, y),
    );
  }
}

function compareNorthSouth(
  north: GeneratedRegionTerrain,
  south: GeneratedRegionTerrain,
): void {
  for (let x = 0; x < WORLD_WIDTH; x += 1) {
    expectContinuousPair(
      tileAt(north.terrain, x, WORLD_HEIGHT - 1),
      tileAt(south.terrain, x, 0),
    );
  }
}

function bundle(seed: RootSeed, x: number, y: number): GeneratedRegionTerrain {
  return generateRegionTerrainBundle(seed, { x, y });
}

describe("deterministic infinite-region terrain", () => {
  it("preserves compatibility region 0,0 exactly, including its canonical hash", () => {
    const seed = seedFromText("the first estuary remains itself");
    const legacy = generateTerrain(seed);
    const generated = bundle(seed, 0, 0);

    expect(generated.terrain).toEqual(legacy);
    expect(stableStringify(generated.terrain)).toBe(stableStringify(legacy));
    expect(generated.manifest).toMatchObject({
      version: 1,
      coord: { x: 0, y: 0 },
      key: "r:0:0",
      terrainHash: regionTerrainHash(legacy),
    });
  });

  it("samples exact compatibility, blended, negative, and distant tiles without a full neighbor", () => {
    const seed = seedFromText("one seam tile is still the whole world's truth");
    const sampler = createRegionTerrainSampler(seed);
    for (const [coord, localX, localY] of [
      [{ x: 0, y: 0 }, 0, 0],
      [{ x: 1, y: -1 }, WORLD_WIDTH - 1, WORLD_HEIGHT - 1],
      [{ x: -1, y: 0 }, 0, 37],
      [{ x: -98_765, y: 43_210 }, 61, 7],
    ] as const) {
      const sampled = sampler.sample(coord, localX, localY);
      const generated = generateRegionTerrain(seed, coord);
      expect(sampled).toEqual(tileAt(generated, localX, localY));
      expect(sampler.sample(coord, localX, localY)).toEqual(sampled);
    }
  });

  it("keeps sampler inputs canonical and immune to later seed-array mutation", () => {
    const sourceSeed = seedFromText("a sampler keeps its own root");
    const mutableSeed: [number, number, number, number] = [...sourceSeed];
    const sampler = createRegionTerrainSampler(mutableSeed);
    const expected = sampler.sample({ x: 14, y: -9 }, 12, 34);
    mutableSeed[0] = (mutableSeed[0] ^ 0xffff_ffff) >>> 0;
    expect(sampler.sample({ x: 14, y: -9 }, 12, 34)).toEqual(expected);

    expect(() => sampler.sample({ x: -0, y: 0 }, 0, 0)).toThrow(RangeError);
    expect(() => sampler.sample({ x: 0, y: 0 }, -1, 0)).toThrow(RangeError);
    expect(() => sampler.sample({ x: 0, y: 0 }, WORLD_WIDTH, 0)).toThrow(RangeError);
    expect(() => sampler.sample({ x: 0, y: 0 }, 0.5, 0)).toThrow(RangeError);
  });

  it("repeats after unload-style regeneration without retaining shared mutable state", () => {
    const seed = seedFromText("the western shoals return exactly");
    const coord = { x: -19, y: 27 } as const;
    const first = generateRegionTerrain(seed, coord);
    const fingerprints: string[] = [];
    for (let revisit = 0; revisit < 8; revisit += 1) {
      const regenerated = generateRegionTerrain(seed, coord);
      fingerprints.push(hashCanonical(regenerated));
      expect(regenerated).toEqual(first);
      expect(regenerated).not.toBe(first);
      expect(regenerated.tiles).not.toBe(first.tiles);
    }
    expect(new Set(fingerprints)).toEqual(new Set([hashCanonical(first)]));
  });

  it("changes neighboring regions, distant regions, and seeds without repeating a whole map", () => {
    const seed = seedFromText("no tiled wallpaper beyond the buoy");
    const coordinates: readonly RegionCoord[] = [
      { x: -2, y: -2 },
      { x: -1, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 2 },
      { x: -1_000_000, y: 1_000_000 },
      { x: 1_000_000, y: -1_000_000 },
    ];
    const hashes = coordinates.map((coord) =>
      generateRegionTerrainBundle(seed, coord).manifest.terrainHash);
    expect(new Set(hashes).size).toBe(hashes.length);
    expect(generateRegionTerrainBundle(seedFromText("another infinite delta"), coordinates[4]!)
      .manifest.terrainHash).not.toBe(hashes[4]);
  });

  it("is independent of generation order", () => {
    const seed = seedFromText("regions do not share a random cursor");
    const coordinates: readonly RegionCoord[] = [
      { x: 8, y: -11 },
      { x: -3, y: 5 },
      { x: 0, y: 0 },
      { x: 1_000_000, y: -1_000_000 },
    ];
    const forward = new Map(coordinates.map((coord) => [
      `${coord.x},${coord.y}`,
      generateRegionTerrainBundle(seed, coord).manifest.terrainHash,
    ]));
    const reverse = new Map([...coordinates].reverse().map((coord) => [
      `${coord.x},${coord.y}`,
      generateRegionTerrainBundle(seed, coord).manifest.terrainHash,
    ]));
    expect(reverse).toEqual(forward);
  });

  it("keeps every cardinal seam continuous around compatibility and distant regions", () => {
    const seed = seedFromText("four winds share the same shoreline");
    const eastWestPairs = [
      [bundle(seed, -1, 0), bundle(seed, 0, 0)],
      [bundle(seed, 0, 0), bundle(seed, 1, 0)],
      [bundle(seed, 41, -77), bundle(seed, 42, -77)],
      [bundle(seed, -1_000_000, 999_999), bundle(seed, -999_999, 999_999)],
    ] as const;
    const northSouthPairs = [
      [bundle(seed, 0, -1), bundle(seed, 0, 0)],
      [bundle(seed, 0, 0), bundle(seed, 0, 1)],
      [bundle(seed, 41, -77), bundle(seed, 41, -76)],
      [bundle(seed, 999_999, -1_000_000), bundle(seed, 999_999, -999_999)],
    ] as const;
    for (const [west, east] of eastWestPairs) compareEastWest(west, east);
    for (const [north, south] of northSouthPairs) compareNorthSouth(north, south);
  });

  it("keeps all four corner directions continuous without boundary aliases", () => {
    const seed = seedFromText("corners are still one estuary");
    const origin = bundle(seed, 0, 0);
    const diagonalPairs = [
      [bundle(seed, -1, -1), WORLD_WIDTH - 1, WORLD_HEIGHT - 1, origin, 0, 0],
      [bundle(seed, 1, -1), 0, WORLD_HEIGHT - 1, origin, WORLD_WIDTH - 1, 0],
      [bundle(seed, -1, 1), WORLD_WIDTH - 1, 0, origin, 0, WORLD_HEIGHT - 1],
      [bundle(seed, 1, 1), 0, 0, origin, WORLD_WIDTH - 1, WORLD_HEIGHT - 1],
      [bundle(seed, 72, -33), WORLD_WIDTH - 1, WORLD_HEIGHT - 1,
        bundle(seed, 73, -32), 0, 0],
    ] as const;
    for (const [left, leftX, leftY, right, rightX, rightY] of diagonalPairs) {
      expectContinuousPair(
        tileAt(left.terrain, leftX, leftY),
        tileAt(right.terrain, rightX, rightY),
      );
      expect(stableRegionObjectId(seed, left.manifest.coord, "terrain-tile", leftY * WORLD_WIDTH + leftX))
        .not.toBe(stableRegionObjectId(
          seed,
          right.manifest.coord,
          "terrain-tile",
          rightY * WORLD_WIDTH + rightX,
        ));
    }
  });

  it("holds the seam contract across a deterministic seed sample", () => {
    for (let seedIndex = 0; seedIndex < 6; seedIndex += 1) {
      const seed = seedFromText(`seam property sample ${seedIndex}`);
      const origin = bundle(seed, 0, 0);
      const east = bundle(seed, 1, 0);
      const south = bundle(seed, 0, 1);
      const southeast = bundle(seed, 1, 1);
      compareEastWest(origin, east);
      compareNorthSouth(origin, south);
      compareNorthSouth(east, southeast);
      compareEastWest(south, southeast);
      expectContinuousPair(
        tileAt(origin.terrain, WORLD_WIDTH - 1, WORLD_HEIGHT - 1),
        tileAt(southeast.terrain, 0, 0),
      );
    }
  });

  it("supports negative and million-scale global coordinates without aliases", () => {
    const seed = seedFromText("the chart has no favored quadrant");
    const coordinates: readonly RegionCoord[] = [
      { x: -1, y: -1 },
      { x: 1, y: 1 },
      { x: -1_000_000, y: 1_000_000 },
      { x: 1_000_000, y: -1_000_000 },
      { x: REGION_COORD_LIMIT, y: -REGION_COORD_LIMIT },
    ];
    const generated = coordinates.map((coord) => bundle(seed, coord.x, coord.y));
    expect(generated.every(({ terrain }) =>
      terrain.width === WORLD_WIDTH
      && terrain.height === WORLD_HEIGHT
      && terrain.tiles.length === WORLD_WIDTH * WORLD_HEIGHT)).toBe(true);
    expect(new Set(generated.map(({ manifest }) => manifest.regionId)).size)
      .toBe(coordinates.length);
    expect(new Set(generated.map(({ manifest }) => manifest.terrainHash)).size)
      .toBe(coordinates.length);
  });

  it("produces bounded gameplay terrain fields and recurring terrain families", () => {
    const seed = seedFromText("water meadow and stone continue outward");
    const terrainKinds = new Set<TerrainKind>();
    for (const coord of [
      { x: 0, y: 0 },
      { x: -7, y: 9 },
      { x: 2, y: -4 },
      { x: 88, y: 31 },
      { x: -510, y: -204 },
    ] as const) {
      const terrain = generateRegionTerrain(seed, coord);
      for (const tile of terrain.tiles) {
        terrainKinds.add(tile.terrain);
        expect(tile.index).toBe(tile.y * WORLD_WIDTH + tile.x);
        expect(tile.x).toBeGreaterThanOrEqual(0);
        expect(tile.x).toBeLessThan(WORLD_WIDTH);
        expect(tile.y).toBeGreaterThanOrEqual(0);
        expect(tile.y).toBeLessThan(WORLD_HEIGHT);
        expect(tile.elevation).toBeGreaterThanOrEqual(0);
        expect(tile.elevation).toBeLessThanOrEqual(FIXED_POINT);
        expect(tile.moisture).toBeGreaterThanOrEqual(0);
        expect(tile.moisture).toBeLessThanOrEqual(FIXED_POINT);
        expect(tile.roughness).toBeGreaterThanOrEqual(0);
        expect(tile.roughness).toBeLessThanOrEqual(FIXED_POINT);
        expect(tile.baseTravelCost).toBeGreaterThan(0);
        expect(tile.traceStrength).toBe(0);
      }
    }
    expect(terrainKinds).toEqual(new Set<TerrainKind>([
      "deep-water",
      "tidal-flat",
      "marsh",
      "meadow",
      "ridge",
    ]));
  });

  it("feeds current biome derivation deterministic bounded physical signals", () => {
    const seed = seedFromText("biomes can read the farther watershed");
    const terrain = generateRegionTerrain(seed, { x: -37, y: 22 });
    for (const tile of terrain.tiles.filter((_, index) => index % 311 === 0)) {
      const first = deriveBiomeProfile({ seed, tile, gridHeight: WORLD_HEIGHT });
      const second = deriveBiomeProfile({ seed, tile, gridHeight: WORLD_HEIGHT });
      expect(second).toEqual(first);
      for (const value of Object.values(first.climate)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(FIXED_POINT);
      }
    }
  });

  it("roundtrips a canonical persistent manifest and rejects tampering or aliases", () => {
    const seed = seedFromText("the manifest remembers what unloaded");
    const generated = bundle(seed, -91, 63);
    const serialized = serializeRegionTerrainManifest(generated.manifest);
    const parsed = parseRegionTerrainManifest(serialized);

    expect(parsed).toEqual(generated.manifest);
    expect(Object.isFrozen(generated.manifest)).toBe(true);
    expect(Object.isFrozen(generated.manifest.coord)).toBe(true);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.coord)).toBe(true);
    expect(serializeRegionTerrainManifest(parsed!)).toBe(serialized);
    expect(validateRegionTerrainManifest(seed, parsed!)).toBe(true);
    expect(parseRegionTerrainManifest(` ${serialized}`)).toBeNull();
    expect(parseRegionTerrainManifest(serialized.replace("r:-91:63", "r:-091:63"))).toBeNull();
    const tampered = {
      ...generated.manifest,
      terrainHash: "00000000000000000000000000000000",
    };
    expect(validateRegionTerrainManifest(seed, tampered)).toBe(false);
    expect(validateRegionTerrainManifest(seedFromText("wrong persisted world"), generated.manifest))
      .toBe(false);
    expect(() => serializeRegionTerrainManifest({
      ...generated.manifest,
      coord: { x: -91, y: 63, alias: 1 } as unknown as RegionCoord,
    })).toThrow(TypeError);
  });

  it("fails closed on malformed seeds and coordinates", () => {
    const seed = seedFromText("bounded coordinate gate");
    expect(() => generateRegionTerrain(seed, { x: REGION_COORD_LIMIT + 1, y: 0 }))
      .toThrow(RangeError);
    expect(() => generateRegionTerrain(seed, { x: 0.5, y: 0 })).toThrow(RangeError);
    expect(() => generateRegionTerrain(seed, { x: -0, y: 0 })).toThrow(RangeError);
    expect(() => generateRegionTerrain([1, 2, 3, 0x1_0000_0000], { x: 0, y: 0 }))
      .toThrow(TypeError);
    expect(() => generateRegionTerrain([1, 2, 3, -0], { x: 0, y: 0 }))
      .toThrow(TypeError);
    expect(parseRegionTerrainManifest("not-json")).toBeNull();
    expect(parseRegionTerrainManifest("{}")).toBeNull();
  });

  it("stays within a practical phone-oriented generation and allocation budget", () => {
    const seed = seedFromText("bounded mobile region budget");
    const started = performance.now();
    const generated = [
      bundle(seed, 0, 0),
      bundle(seed, 1, 0),
      bundle(seed, -73, 121),
    ];
    const elapsed = performance.now() - started;
    const largestSerializedRegion = Math.max(...generated.map(({ terrain }) =>
      JSON.stringify(terrain).length));

    // Wide enough for loaded CI while still catching accidental quadratic
    // work, giant halos, or a hidden all-world cache in a single-region call.
    expect(elapsed).toBeLessThan(4_000);
    expect(largestSerializedRegion).toBeLessThan(2_500_000);
    expect(generated.every(({ terrain }) => terrain.tiles.length === 6_912)).toBe(true);
  });
});

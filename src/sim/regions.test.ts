import { describe, expect, it } from "vitest";

import { seedFromText } from "./rng";
import {
  REGION_COORD_LIMIT,
  createRegionCoord,
  globalTileToRegion,
  isRegionCoord,
  parseRegionKey,
  regionKey,
  regionLocalToGlobalTile,
  stableRegionId,
  stableRegionObjectId,
  type RegionCoord,
} from "./regions";
import { WORLD_HEIGHT, WORLD_WIDTH } from "./types";

describe("canonical region coordinates", () => {
  it("roundtrips positive, negative, zero, and million-scale coordinates", () => {
    const coordinates = [
      createRegionCoord(0, 0),
      createRegionCoord(12, -34),
      createRegionCoord(-1_000_000, 1_000_000),
      createRegionCoord(REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
    ];

    for (const coordinate of coordinates) {
      const parsed = parseRegionKey(regionKey(coordinate));
      expect(parsed).toEqual(coordinate);
      expect(Object.isFrozen(parsed)).toBe(true);
    }
    expect(regionKey(coordinates[1]!)).toBe("r:12:-34");
  });

  it("rejects aliases, whitespace, unsafe values, and malformed keys", () => {
    const invalidKeys = [
      "",
      "r:0",
      "r:0:0:0",
      "r: 0:0",
      "r:0:0 ",
      " r:0:0",
      "r:+1:0",
      "r:-0:0",
      "r:0:-0",
      "r:00:0",
      "r:01:0",
      "r:-01:0",
      "r:1.0:0",
      "r:1e3:0",
      "r:Infinity:0",
      "r:NaN:0",
      `r:${REGION_COORD_LIMIT + 1}:0`,
      "r:9007199254740992:0",
      null,
      0,
      { x: 0, y: 0 },
    ];

    for (const key of invalidKeys) expect(parseRegionKey(key), String(key)).toBeNull();
    expect(isRegionCoord({ x: -0, y: 0 })).toBe(false);
    expect(isRegionCoord({ x: 0, y: Number.MAX_SAFE_INTEGER })).toBe(false);
    expect(isRegionCoord({ x: 0, y: 0, alias: true })).toBe(true);
    expect(isRegionCoord([0, 0])).toBe(false);
    expect(() => regionKey({ x: -0, y: 0 })).toThrow(RangeError);
    expect(() => createRegionCoord(REGION_COORD_LIMIT + 1, 0)).toThrow(RangeError);
  });

  it("normalizes arithmetic negative zero without accepting its text alias", () => {
    const coordinate = createRegionCoord(-0, -0);
    expect(Object.is(coordinate.x, -0)).toBe(false);
    expect(Object.is(coordinate.y, -0)).toBe(false);
    expect(regionKey(coordinate)).toBe("r:0:0");
    expect(parseRegionKey("r:-0:-0")).toBeNull();
  });
});

describe("global and local tile conversion", () => {
  it.each([
    [0, 0, 0, 0, 0, 0],
    [WORLD_WIDTH - 1, WORLD_HEIGHT - 1, 0, 0, WORLD_WIDTH - 1, WORLD_HEIGHT - 1],
    [WORLD_WIDTH, WORLD_HEIGHT, 1, 1, 0, 0],
    [-1, -1, -1, -1, WORLD_WIDTH - 1, WORLD_HEIGHT - 1],
    [-WORLD_WIDTH, -WORLD_HEIGHT, -1, -1, 0, 0],
    [-WORLD_WIDTH - 1, -WORLD_HEIGHT - 1, -2, -2, WORLD_WIDTH - 1, WORLD_HEIGHT - 1],
  ])(
    "maps global (%i,%i) to region (%i,%i) local (%i,%i)",
    (globalX, globalY, regionX, regionY, localX, localY) => {
      const address = globalTileToRegion(globalX, globalY);
      expect(address).toEqual({ region: { x: regionX, y: regionY }, localX, localY });
      expect(Object.isFrozen(address)).toBe(true);
      expect(Object.isFrozen(address.region)).toBe(true);
      expect(regionLocalToGlobalTile(address.region, address.localX, address.localY)).toEqual({
        x: globalX,
        y: globalY,
      });
    },
  );

  it("roundtrips boundary and distant regions in both directions", () => {
    const regions: readonly RegionCoord[] = [
      { x: -1_000_000, y: -1_000_000 },
      { x: -1, y: 1 },
      { x: 0, y: 0 },
      { x: 1, y: -1 },
      { x: 1_000_000, y: 1_000_000 },
      { x: REGION_COORD_LIMIT, y: -REGION_COORD_LIMIT },
    ];

    for (const region of regions) {
      for (const [localX, localY] of [
        [0, 0],
        [WORLD_WIDTH - 1, WORLD_HEIGHT - 1],
        [Math.floor(WORLD_WIDTH / 2), Math.floor(WORLD_HEIGHT / 2)],
      ] as const) {
        const global = regionLocalToGlobalTile(region, localX, localY);
        expect(globalTileToRegion(global.x, global.y)).toEqual({ region, localX, localY });
      }
    }
  });

  it("fails closed for unsafe globals, out-of-range regions, and invalid locals", () => {
    expect(() => globalTileToRegion(Number.MAX_SAFE_INTEGER, 0)).toThrow(RangeError);
    expect(() => globalTileToRegion(1.5, 0)).toThrow(RangeError);
    expect(() => globalTileToRegion(Number.NaN, 0)).toThrow(RangeError);
    expect(() =>
      globalTileToRegion(REGION_COORD_LIMIT * WORLD_WIDTH + WORLD_WIDTH, 0),
    ).toThrow(RangeError);
    expect(() =>
      regionLocalToGlobalTile({ x: REGION_COORD_LIMIT + 1, y: 0 }, 0, 0),
    ).toThrow(RangeError);
    expect(() => regionLocalToGlobalTile({ x: 0, y: 0 }, -1, 0)).toThrow(RangeError);
    expect(() => regionLocalToGlobalTile({ x: 0, y: 0 }, WORLD_WIDTH, 0)).toThrow(
      RangeError,
    );
    expect(() => regionLocalToGlobalTile({ x: 0, y: 0 }, 0, WORLD_HEIGHT)).toThrow(
      RangeError,
    );
    expect(() => regionLocalToGlobalTile({ x: 0, y: 0 }, 0.5, 0)).toThrow(RangeError);
  });
});

describe("stable region identities", () => {
  it("is stable across revisit and generation order while separating seeds and regions", () => {
    const seedA = seedFromText("far estuary");
    const seedB = seedFromText("far estuary changed");
    const coordinates = [
      createRegionCoord(0, 0),
      createRegionCoord(-7, 9),
      createRegionCoord(1_000_000, -1_000_000),
    ];
    const forward = new Map(
      coordinates.map((coordinate) => [regionKey(coordinate), stableRegionId(seedA, coordinate)]),
    );
    const reverse = new Map(
      [...coordinates]
        .reverse()
        .map((coordinate) => [regionKey(coordinate), stableRegionId(seedA, coordinate)]),
    );

    expect(reverse).toEqual(forward);
    expect(stableRegionId(seedA, coordinates[1]!)).toBe(stableRegionId(seedA, coordinates[1]!));
    expect(stableRegionId(seedA, coordinates[0]!)).not.toBe(stableRegionId(seedA, coordinates[1]!));
    expect(stableRegionId(seedA, coordinates[1]!)).not.toBe(stableRegionId(seedB, coordinates[1]!));
    expect(stableRegionId([1, 2, 3, 4], createRegionCoord(-7, 9)))
      .toBe("rg1:00000001000000020000000300000004:-7:9");
  });

  it("uses structured identity fields without concatenation or type aliases", () => {
    const seed = seedFromText("unambiguous objects");
    const region = createRegionCoord(-22, 41);
    const first = stableRegionObjectId(seed, region, "ab", "c");
    const second = stableRegionObjectId(seed, region, "a", "bc");

    expect(first).not.toBe(second);
    expect(stableRegionObjectId(seed, region, "cache", 1)).not.toBe(
      stableRegionObjectId(seed, region, "cache", "1"),
    );
    expect(stableRegionObjectId(seed, region, "cache", "wreck-7")).toBe(
      stableRegionObjectId(seed, region, "cache", "wreck-7"),
    );
    expect(stableRegionObjectId([1, 2, 3, 4], createRegionCoord(-7, 9), "cache", "1"))
      .toBe("ro1:00000001000000020000000300000004:-7:9:cache:s:0031");
    expect(stableRegionObjectId(seed, region, "cache", "a:b\u0000"))
      .not.toContain("a:b");
    expect(stableRegionObjectId(seedFromText("another seed"), region, "cache", "wreck-7")).not.toBe(
      stableRegionObjectId(seed, region, "cache", "wreck-7"),
    );
  });

  it("rejects noncanonical seeds, kinds, and local identities", () => {
    const seed = seedFromText("validation");
    const region = createRegionCoord(0, 0);
    expect(() => stableRegionId([1, 2, 3, 0x1_0000_0000], region)).toThrow(RangeError);
    expect(() => stableRegionObjectId(seed, region, "Bad Kind", "one")).toThrow(TypeError);
    expect(() => stableRegionObjectId(seed, region, "cache", "")).toThrow(TypeError);
    expect(() => stableRegionObjectId(seed, region, "cache", Number.MAX_SAFE_INTEGER + 1)).toThrow(
      RangeError,
    );
    expect(() => stableRegionObjectId(seed, region, "cache", -0)).toThrow(RangeError);
  });
});

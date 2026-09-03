import { describe, expect, it } from "vitest";

import {
  BIOME_IDS,
  applyWeatherToBiomeClimate,
  biomeInteractionAt,
  classifyBiome,
  deriveBaselineBiomeClimate,
  deriveBiomeProfile,
  deriveMagicalWaterInfluence,
  type BiomeClimate,
  type BiomeTerrainInput,
} from "./biomes";
import { seedFromText } from "./rng";
import { generateTerrain } from "./terrain";
import { FIXED_POINT, type TerrainKind, type WeatherKind } from "./types";

const calmClimate = (overrides: Partial<BiomeClimate> = {}): BiomeClimate => ({
  rainfall: 500_000,
  heat: 500_000,
  salinity: 500_000,
  exposure: 500_000,
  magicalWater: 0,
  ...overrides,
});

const terrainInput = (
  terrain: TerrainKind,
  overrides: Partial<BiomeTerrainInput> = {},
): BiomeTerrainInput => ({
  index: 0,
  x: 20,
  y: 20,
  elevation: 500_000,
  moisture: 500_000,
  roughness: 500_000,
  terrain,
  ...overrides,
});

const expectFixedClimate = (climate: BiomeClimate): void => {
  for (const value of Object.values(climate)) {
    expect(Number.isSafeInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(FIXED_POINT);
  }
};

describe("procedural biome climate", () => {
  it("keeps a small stable biome vocabulary", () => {
    expect(BIOME_IDS).toEqual([
      "tide-channel",
      "brine-flat",
      "reed-marsh",
      "rain-meadow",
      "sun-meadow",
      "wind-ridge",
      "glimmerfen",
    ]);
    expect(new Set(BIOME_IDS).size).toBe(BIOME_IDS.length);
  });

  it("matches a golden profile derived from the existing seeded Perlin terrain", () => {
    const seed = seedFromText("biomes remember rain on brass");
    const terrain = generateTerrain(seed);
    const tile = terrain.tiles[3_457];
    if (!tile) throw new Error("golden terrain tile is missing");

    const profile = deriveBiomeProfile({
      seed,
      tile,
      gridHeight: terrain.height,
      weather: {
        kind: "rain",
        intensity: 640_000,
        windX: -230_000,
        windY: 410_000,
      },
      magicalWaterInfluence: 375_000,
    });

    expect(profile).toEqual({
      id: "brine-flat",
      climate: {
        rainfall: FIXED_POINT,
        heat: 434_753,
        salinity: 538_950,
        exposure: 574_198,
        magicalWater: 375_000,
      },
      interaction: {
        rainRetention: 300_000,
        heatLoad: 373_887,
        saltStress: 26_947,
        magicalResonance: 232_500,
      },
    });
  });

  it("is independent of call order and changes with its addressed seed", () => {
    const tile = terrainInput("meadow", { index: 1_940, x: 20, y: 20 });
    const firstSeed = seedFromText("orderless summer");
    const secondSeed = seedFromText("orderless winter");
    const input = {
      seed: firstSeed,
      tile,
      gridHeight: 72,
      weather: { kind: "mist" as const, intensity: 300_000, windX: 40_000, windY: -90_000 },
    };
    const before = deriveBiomeProfile(input);

    for (let index = 0; index < 40; index += 1) {
      deriveBiomeProfile({
        ...input,
        tile: { ...tile, index, x: index, y: index % 17 },
      });
    }

    expect(deriveBiomeProfile(input)).toEqual(before);
    expect(deriveBiomeProfile({ ...input, seed: secondSeed }).climate).not.toEqual(before.climate);
  });

  it("derives a smooth, bounded magical water table without persisted state", () => {
    const seed = seedFromText("water dreams below the footpath");
    const westTile = terrainInput("marsh", { x: 25, y: 31, moisture: 810_000 });
    const eastTile = { ...westTile, index: 1, x: 26 };
    const west = deriveMagicalWaterInfluence(seed, westTile);
    const east = deriveMagicalWaterInfluence(seed, eastTile);

    expect(west).toBeGreaterThanOrEqual(0);
    expect(west).toBeLessThanOrEqual(FIXED_POINT);
    expect(east).toBeGreaterThanOrEqual(0);
    expect(east).toBeLessThanOrEqual(FIXED_POINT);
    expect(Math.abs(west - east)).toBeLessThan(80_000);
    expect(deriveMagicalWaterInfluence(seed, westTile)).toBe(west);
    expect(deriveMagicalWaterInfluence(seedFromText("another water table"), westTile))
      .not.toBe(west);
  });

  it("produces smooth nearby climate fields while retaining regional variation", () => {
    const seed = seedFromText("soft climate seams");
    const west = deriveBaselineBiomeClimate(seed, terrainInput("meadow", { x: 20 }), 72);
    const east = deriveBaselineBiomeClimate(seed, terrainInput("meadow", { x: 21 }), 72);
    const differences = (Object.keys(west) as Array<keyof BiomeClimate>)
      .map((key) => Math.abs(west[key] - east[key]));

    expect(differences.some((difference) => difference > 0)).toBe(true);
    expect(Math.max(...differences)).toBeLessThan(80_000);
  });

  it("bounds every climate and interaction channel across generated worlds and weather fronts", () => {
    const weatherKinds: readonly WeatherKind[] = ["clear", "mist", "rain", "storm"];
    for (let seedIndex = 0; seedIndex < 4; seedIndex += 1) {
      const seed = seedFromText(`bounded-biomes-${seedIndex}`);
      const terrain = generateTerrain(seed);
      for (let tileIndex = 0; tileIndex < terrain.tiles.length; tileIndex += 97) {
        const tile = terrain.tiles[tileIndex];
        if (!tile) throw new Error("sampled terrain tile is missing");
        for (const [weatherIndex, kind] of weatherKinds.entries()) {
          const profile = deriveBiomeProfile({
            seed,
            tile,
            gridHeight: terrain.height,
            weather: {
              kind,
              intensity: weatherIndex * 333_333,
              windX: weatherIndex % 2 === 0 ? -FIXED_POINT : FIXED_POINT,
              windY: FIXED_POINT - weatherIndex * 500_000,
            },
            magicalWaterInfluence: (tileIndex * 97_531) % (FIXED_POINT + 1),
          });
          expect(BIOME_IDS).toContain(profile.id);
          expectFixedClimate(profile.climate);
          for (const value of Object.values(profile.interaction)) {
            expect(Number.isSafeInteger(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(FIXED_POINT);
          }
        }
      }
    }
  });

  it("fails closed to bounded values for malformed numeric climate inputs without mutation", () => {
    const baseline: BiomeClimate = {
      rainfall: Number.POSITIVE_INFINITY,
      heat: -40,
      salinity: 9_000_000,
      exposure: Number.NaN,
      magicalWater: 1_100_000,
    };
    const snapshot = { ...baseline };
    const result = applyWeatherToBiomeClimate(baseline, {
      kind: "storm",
      intensity: Number.POSITIVE_INFINITY,
      windX: Number.NEGATIVE_INFINITY,
      windY: 4_000_000,
    });

    expectFixedClimate(result);
    expect(result).toEqual({
      rainfall: 0,
      heat: 0,
      salinity: FIXED_POINT,
      exposure: 333_332,
      magicalWater: FIXED_POINT,
    });
    expect(baseline).toEqual(snapshot);
  });

  it("bounds baseline output when legacy or corrupt numeric fields are unusable", () => {
    const climate = deriveBaselineBiomeClimate(
      seedFromText("bounded broken weather map"),
      terrainInput("marsh", {
        x: Number.MAX_SAFE_INTEGER,
        y: Number.NaN,
        elevation: Number.POSITIVE_INFINITY,
        moisture: -FIXED_POINT,
        roughness: 9 * FIXED_POINT,
      }),
      Number.NaN,
      Number.POSITIVE_INFINITY,
    );

    expectFixedClimate(climate);
    expect(climate.magicalWater).toBe(0);
  });

  it("preserves region-zero climate exactly when an explicit global address is supplied", () => {
    const seed = seedFromText("the first estuary keeps its weather");
    const tile = terrainInput("marsh", {
      index: 2_947,
      x: 67,
      y: 30,
      moisture: 723_456,
    });
    const globalTile = { x: tile.x, y: tile.y };
    const legacyMagic = deriveMagicalWaterInfluence(seed, tile);
    const addressedMagic = deriveMagicalWaterInfluence(seed, tile, globalTile);

    expect(addressedMagic).toBe(legacyMagic);
    expect(deriveBaselineBiomeClimate(seed, tile, 72, legacyMagic, globalTile)).toEqual(
      deriveBaselineBiomeClimate(seed, tile, 72, legacyMagic),
    );
  });

  it("uses the full signed safe global address independently of floating local coordinates", () => {
    const seed = seedFromText("climate beyond every remembered chart");
    const globalTile = {
      x: -8_000_000_000_000_000,
      y: 7_999_999_999_999_900,
    };
    const westLocal = terrainInput("deep-water", { x: 97, y: 24, moisture: 844_000 });
    const eastLocal = { ...westLocal, index: 1, x: 1 };
    const magic = deriveMagicalWaterInfluence(seed, westLocal, globalTile);
    const west = deriveBiomeProfile({
      seed,
      tile: westLocal,
      gridHeight: 72,
      globalTile,
      magicalWaterInfluence: magic,
    });
    const east = deriveBiomeProfile({
      seed,
      tile: eastLocal,
      gridHeight: 72,
      globalTile,
      magicalWaterInfluence: deriveMagicalWaterInfluence(seed, eastLocal, globalTile),
    });
    const adjacent = deriveBiomeProfile({
      seed,
      tile: eastLocal,
      gridHeight: 72,
      globalTile: { ...globalTile, x: globalTile.x + 1 },
      magicalWaterInfluence: deriveMagicalWaterInfluence(
        seed,
        eastLocal,
        { ...globalTile, x: globalTile.x + 1 },
      ),
    });

    expect(east).toEqual(west);
    expect(adjacent.climate).not.toEqual(west.climate);
    expectFixedClimate(west.climate);
    expectFixedClimate(adjacent.climate);
  });

  it("does not extend the legacy 4,096-wide climate packing into distant positive space", () => {
    const seed = seedFromText("the climate never folds into a diagonal copy");
    const tile = terrainInput("deep-water", { x: 0, y: 0, moisture: 800_000 });
    // Under the finite compatibility packing these two magic-noise lattice
    // addresses collapse to the same scalar key: (4097 * 4096) and
    // (4096 * 4096 + 4096). Globally addressed climate must keep them apart.
    const first = { x: 0, y: 4_097 * 18 };
    const second = { x: 4_096 * 18, y: 4_096 * 18 };

    expect(deriveMagicalWaterInfluence(seed, tile, first)).not.toBe(
      deriveMagicalWaterInfluence(seed, tile, second),
    );
  });
});

describe("biome classification boundaries", () => {
  it.each([
    ["deep-water", calmClimate(), "tide-channel"],
    ["tidal-flat", calmClimate({ salinity: 559_999 }), "reed-marsh"],
    ["tidal-flat", calmClimate({ salinity: 560_000 }), "brine-flat"],
    ["marsh", calmClimate({ salinity: 719_999, rainfall: 519_999 }), "reed-marsh"],
    ["marsh", calmClimate({ salinity: 720_000, rainfall: 519_999 }), "brine-flat"],
    ["marsh", calmClimate({ salinity: 720_000, rainfall: 520_000 }), "reed-marsh"],
    ["meadow", calmClimate({ rainfall: 599_999, heat: 200_000 }), "sun-meadow"],
    ["meadow", calmClimate({ rainfall: 600_000, heat: 779_999 }), "rain-meadow"],
    ["meadow", calmClimate({ rainfall: 600_000, heat: 780_000 }), "sun-meadow"],
    ["ridge", calmClimate({ rainfall: FIXED_POINT }), "wind-ridge"],
  ] as const)("classifies %s at an exact threshold", (terrain, climate, expected) => {
    expect(classifyBiome(terrain, climate)).toBe(expected);
  });

  it("requires enough magic and a genuinely wet context before making a glimmerfen", () => {
    expect(classifyBiome("marsh", calmClimate({ magicalWater: 799_999 }))).toBe("reed-marsh");
    expect(classifyBiome("marsh", calmClimate({ magicalWater: 800_000 }))).toBe("glimmerfen");
    expect(classifyBiome("meadow", calmClimate({
      magicalWater: FIXED_POINT,
      rainfall: 719_999,
    }))).toBe("rain-meadow");
    expect(classifyBiome("meadow", calmClimate({
      magicalWater: FIXED_POINT,
      rainfall: 720_000,
    }))).toBe("glimmerfen");
    expect(classifyBiome("ridge", calmClimate({
      magicalWater: FIXED_POINT,
      rainfall: FIXED_POINT,
    }))).toBe("glimmerfen");
  });
});

describe("weather and biome interactions", () => {
  it("keeps long-lived biome identity stable while a passing front changes current climate", () => {
    const seed = seedFromText("the meadow keeps its name");
    const tile = terrainInput("meadow", { moisture: 570_000 });
    const clear = deriveBiomeProfile({
      seed,
      tile,
      gridHeight: 72,
      weather: { kind: "clear", intensity: 900_000, windX: 0, windY: 0 },
    });
    const storm = deriveBiomeProfile({
      seed,
      tile,
      gridHeight: 72,
      weather: {
        kind: "storm",
        intensity: FIXED_POINT,
        windX: FIXED_POINT,
        windY: FIXED_POINT,
      },
    });

    expect(storm.id).toBe(clear.id);
    expect(storm.climate).not.toEqual(clear.climate);
    expect(storm.climate.rainfall).toBeGreaterThan(clear.climate.rainfall);
    expect(storm.climate.exposure).toBeGreaterThan(clear.climate.exposure);
  });

  it("applies rain, heat, salt dilution, wind exposure, and magic independently", () => {
    const baseline = calmClimate({ magicalWater: 444_000 });
    const clear = applyWeatherToBiomeClimate(baseline, {
      kind: "clear",
      intensity: 600_000,
      windX: 0,
      windY: 0,
    });
    const rain = applyWeatherToBiomeClimate(baseline, {
      kind: "rain",
      intensity: 600_000,
      windX: 100_000,
      windY: -200_000,
    });
    const storm = applyWeatherToBiomeClimate(baseline, {
      kind: "storm",
      intensity: 600_000,
      windX: 500_000,
      windY: 500_000,
    });

    expect(clear.rainfall).toBeLessThan(baseline.rainfall);
    expect(clear.heat).toBeGreaterThan(baseline.heat);
    expect(rain.rainfall).toBeGreaterThan(baseline.rainfall);
    expect(rain.heat).toBeLessThan(baseline.heat);
    expect(rain.salinity).toBeLessThan(baseline.salinity);
    expect(storm.exposure).toBeGreaterThan(rain.exposure);
    expect(clear.magicalWater).toBe(444_000);
    expect(rain.magicalWater).toBe(444_000);
    expect(storm.magicalWater).toBe(444_000);
    expect(baseline).toEqual(calmClimate({ magicalWater: 444_000 }));
  });

  it("maps climate into monotone, bounded response signals without minting state", () => {
    const low = calmClimate({ rainfall: 100_000, heat: 100_000, salinity: 100_000, magicalWater: 100_000 });
    const high = calmClimate({ rainfall: 900_000, heat: 900_000, salinity: 900_000, magicalWater: 900_000 });
    for (const biome of BIOME_IDS) {
      const lowInteraction = biomeInteractionAt(biome, low);
      const highInteraction = biomeInteractionAt(biome, high);
      for (const key of Object.keys(lowInteraction) as Array<keyof typeof lowInteraction>) {
        expect(lowInteraction[key]).toBeLessThanOrEqual(highInteraction[key]);
        expect(Number.isSafeInteger(highInteraction[key])).toBe(true);
        expect(highInteraction[key]).toBeLessThanOrEqual(FIXED_POINT);
      }
    }

    expect(biomeInteractionAt("reed-marsh", calmClimate({
      rainfall: 500_000,
      heat: 0,
      salinity: 0,
      magicalWater: 0,
    })).rainRetention).toBe(460_000);
    expect(biomeInteractionAt("glimmerfen", calmClimate({
      rainfall: 0,
      heat: 0,
      salinity: 0,
      magicalWater: 500_000,
    })).magicalResonance).toBe(500_000);
  });

  it("supports both legacy and current terrain heights without dimension state", () => {
    const seed = seedFromText("old shores new weather");
    const legacy = deriveBiomeProfile({
      seed,
      tile: terrainInput("tidal-flat", { index: 3_071, x: 63, y: 47 }),
      gridHeight: 48,
    });
    const current = deriveBiomeProfile({
      seed,
      tile: terrainInput("tidal-flat", { index: 6_911, x: 95, y: 71 }),
      gridHeight: 72,
    });

    expect(BIOME_IDS).toContain(legacy.id);
    expect(BIOME_IDS).toContain(current.id);
    expectFixedClimate(legacy.climate);
    expectFixedClimate(current.climate);
  });
});

import { describe, expect, it } from "vitest";

import {
  BOOTSTRAP_FIBER_MATERIALS,
  BOOTSTRAP_RIGID_MATERIALS,
  DEFAULT_BOOTSTRAP_RADIUS,
  FIELD_MATERIALS_BY_BIOME,
  FIELD_MATERIAL_IDS,
  FIELD_RESOURCE_DENSITY_PER_MILLION,
  FIELD_RESOURCE_LIVING_RESERVE_UNITS,
  FIELD_RESOURCE_WEATHER_MAX_PERMILLE,
  FIELD_RESOURCE_WEATHER_MIN_PERMILLE,
  advanceFieldResourceEcology,
  canonicalizeFieldResourceState,
  createFieldResourceEcologyState,
  evaluateHarborBootstrap,
  fieldResourceNodeId,
  fieldResourceStockUnits,
  fieldResourceWeatherMultiplierPermille,
  generateFieldResourceCatalog,
  harvestFieldResource,
  type FieldResourceCatalog,
  type FieldResourceEcologyState,
  type FieldResourceNode,
} from "./fieldResources";
import { seedFromText } from "./rng";
import { generateTerrain } from "./terrain";
import { FIXED_POINT, type TerrainState, type WeatherKind } from "./types";
import { createInitialWorld } from "./world";

const CLEAR_WEATHER = {
  kind: "clear" as const,
  intensity: 500_000,
  windX: 0,
  windY: 0,
};

function firstHarvestableNode(catalog: FieldResourceCatalog): FieldResourceNode {
  const node = catalog.nodes.find(
    (candidate) => candidate.capacityUnits > FIELD_RESOURCE_LIVING_RESERVE_UNITS,
  );
  if (node === undefined) throw new Error("test catalog should have a harvestable node");
  return node;
}

function stateWithMissing(
  node: FieldResourceNode,
  missingUnits: number,
  regenerationProgressFixed = 0,
  activeTick = 0,
): FieldResourceEcologyState {
  return {
    version: 1,
    activeTick,
    depletion: [{ nodeId: node.id, missingUnits, regenerationProgressFixed }],
  };
}

describe("deterministic field-resource catalog", () => {
  it("defines exactly nine materials and each biome's common, secondary, and rare native set", () => {
    expect(FIELD_MATERIAL_IDS).toHaveLength(9);
    expect(new Set(FIELD_MATERIAL_IDS).size).toBe(9);
    expect(Object.keys(FIELD_MATERIALS_BY_BIOME).sort()).toEqual([
      "brine-flat",
      "glimmerfen",
      "rain-meadow",
      "reed-marsh",
      "sun-meadow",
      "tide-channel",
      "wind-ridge",
    ]);
    for (const set of Object.values(FIELD_MATERIALS_BY_BIOME)) {
      expect(FIELD_MATERIAL_IDS).toContain(set.common);
      expect(FIELD_MATERIAL_IDS).toContain(set.secondary);
      expect(FIELD_MATERIAL_IDS).toContain(set.rare);
    }
  });

  it("is invariant to call order and input tile order but changes across world seeds", () => {
    const seed = seedFromText("cordreed remembers every careful hand");
    const terrain = generateTerrain(seed);
    const expected = generateFieldResourceCatalog(seed, terrain);

    for (let index = 0; index < 30; index += 1) {
      const unrelatedSeed = seedFromText(`unrelated ecology ${index}`);
      generateFieldResourceCatalog(unrelatedSeed, generateTerrain(unrelatedSeed));
    }

    const reversed = generateFieldResourceCatalog(seed, {
      ...terrain,
      tiles: [...terrain.tiles].reverse(),
    });
    const otherSeed = seedFromText("shellstone keeps another shore");
    const other = generateFieldResourceCatalog(otherSeed, generateTerrain(otherSeed));

    expect(reversed).toEqual(expected);
    expect(generateFieldResourceCatalog(seed, terrain)).toEqual(expected);
    expect(other.nodes.map((node) => node.id)).not.toEqual(expected.nodes.map((node) => node.id));
  });

  it("uses stable seed-coordinate-material IDs and never places two nodes on one tile", () => {
    const seed = seedFromText("one living node per square of weather");
    const terrain = generateTerrain(seed);
    const catalog = generateFieldResourceCatalog(seed, terrain);
    const tileIndices = catalog.nodes.map((node) => node.tileIndex);
    const ids = catalog.nodes.map((node) => node.id);

    expect(new Set(tileIndices).size).toBe(tileIndices.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(tileIndices).toEqual([...tileIndices].sort((left, right) => left - right));
    for (const node of catalog.nodes) {
      expect(node.id).toBe(fieldResourceNodeId(seed, node.x, node.y, node.material));
      expect(node.tileIndex).toBe(node.y * catalog.width + node.x);
      expect(FIELD_MATERIALS_BY_BIOME[node.biome][node.rarity]).toBe(node.material);
    }
  });

  it("keeps declared rarity chances and all generated integer quantities bounded", () => {
    const totalDensity = Object.values(FIELD_RESOURCE_DENSITY_PER_MILLION)
      .reduce((total, density) => total + density, 0);
    expect(totalDensity).toBeLessThan(300_000);
    expect(FIELD_RESOURCE_DENSITY_PER_MILLION.common)
      .toBeGreaterThan(FIELD_RESOURCE_DENSITY_PER_MILLION.secondary);
    expect(FIELD_RESOURCE_DENSITY_PER_MILLION.secondary)
      .toBeGreaterThan(FIELD_RESOURCE_DENSITY_PER_MILLION.rare);

    let tileCount = 0;
    let nodeCount = 0;
    const rarityCount = { common: 0, secondary: 0, rare: 0 };
    for (let seedIndex = 0; seedIndex < 12; seedIndex += 1) {
      const seed = seedFromText(`bounded gathering coast ${seedIndex}`);
      const terrain = generateTerrain(seed);
      const catalog = generateFieldResourceCatalog(seed, terrain);
      tileCount += terrain.tiles.length;
      nodeCount += catalog.nodes.length;
      for (const node of catalog.nodes) {
        rarityCount[node.rarity] += 1;
        expect(Number.isSafeInteger(node.capacityUnits)).toBe(true);
        expect(node.capacityUnits).toBeGreaterThanOrEqual(2);
        expect(node.capacityUnits).toBeLessThanOrEqual(9);
        expect(Number.isSafeInteger(node.unitLoadMilli)).toBe(true);
        expect(node.unitLoadMilli).toBeGreaterThan(0);
        expect(node.unitLoadMilli).toBeLessThanOrEqual(2_000);
        expect(Number.isSafeInteger(node.regenerationPerActiveTickFixed)).toBe(true);
        expect(node.regenerationPerActiveTickFixed).toBeGreaterThan(0);
        expect(node.regenerationPerActiveTickFixed).toBeLessThan(FIXED_POINT);
      }
    }

    const density = nodeCount / tileCount;
    expect(density).toBeGreaterThan(0.22);
    expect(density).toBeLessThan(0.27);
    expect(rarityCount.common).toBeGreaterThan(rarityCount.secondary);
    expect(rarityCount.secondary).toBeGreaterThan(rarityCount.rare);
    expect(rarityCount.rare).toBeGreaterThan(100);
  });

  it("rejects malformed or duplicate tiles deterministically", () => {
    const seed = seedFromText("the torn gathering chart");
    const terrain = generateTerrain(seed);
    const tile = terrain.tiles[0];
    if (tile === undefined) throw new Error("terrain should have a first tile");
    const malformed = {
      width: 2,
      height: 2,
      tiles: [
        { ...tile, index: 0, x: 0, y: 0 },
        { ...tile, index: 0, x: 0, y: 0, moisture: 10 },
        { ...tile, index: 9, x: 1, y: 1 },
        { ...tile, index: -1, x: -1, y: 0 },
      ],
    } satisfies TerrainState;

    const forward = generateFieldResourceCatalog(seed, malformed);
    const reverse = generateFieldResourceCatalog(seed, {
      ...malformed,
      tiles: [...malformed.tiles].reverse(),
    });
    expect(reverse).toEqual(forward);
    expect(forward.nodes.length).toBeLessThanOrEqual(1);
    expect(generateFieldResourceCatalog(seed, { width: Number.NaN, height: 4, tiles: [] }))
      .toEqual({ version: 1, width: 0, height: 4, nodes: [] });
  });
});

describe("harvest and active-tick regeneration", () => {
  it("harvests atomically and ordinary gathering always leaves one living unit", () => {
    const seed = seedFromText("leave a root beneath the rain");
    const catalog = generateFieldResourceCatalog(seed, generateTerrain(seed));
    const node = firstHarvestableNode(catalog);
    const initial = createFieldResourceEcologyState(12);
    const harvestable = node.capacityUnits - FIELD_RESOURCE_LIVING_RESERVE_UNITS;

    const tooMuch = harvestFieldResource(catalog, initial, node.id, harvestable + 1);
    expect(tooMuch).toMatchObject({ ok: false, reason: "living-reserve", harvestedUnits: 0 });
    expect(tooMuch.state).toEqual(initial);

    const gathered = harvestFieldResource(catalog, initial, node.id, harvestable);
    expect(gathered).toMatchObject({
      ok: true,
      reason: "harvested",
      material: node.material,
      harvestedUnits: harvestable,
      loadMilli: harvestable * node.unitLoadMilli,
    });
    expect(fieldResourceStockUnits(catalog, gathered.state, node.id))
      .toBe(FIELD_RESOURCE_LIVING_RESERVE_UNITS);

    const finalAttempt = harvestFieldResource(catalog, gathered.state, node.id, 1);
    expect(finalAttempt).toMatchObject({ ok: false, reason: "living-reserve" });
    expect(finalAttempt.state).toEqual(gathered.state);
    expect(harvestFieldResource(catalog, initial, node.id, 1.5))
      .toMatchObject({ ok: false, reason: "invalid-request" });
  });

  it("regenerates from fixed-point progress using active ticks only", () => {
    const seed = seedFromText("growth counts footsteps not sunsets");
    const catalog = generateFieldResourceCatalog(seed, generateTerrain(seed));
    const node = firstHarvestableNode(catalog);
    const depleted = stateWithMissing(node, 2, 0, 400);
    const multiplier = fieldResourceWeatherMultiplierPermille(node.material, CLEAR_WEATHER);
    const growthPerTick = Math.trunc(
      (node.regenerationPerActiveTickFixed * multiplier) / 1_000,
    );
    const ticksForOne = Math.ceil(FIXED_POINT / growthPerTick);

    const almost = advanceFieldResourceEcology(
      catalog,
      depleted,
      ticksForOne - 1,
      CLEAR_WEATHER,
    );
    expect(fieldResourceStockUnits(catalog, almost, node.id)).toBe(node.capacityUnits - 2);

    const restoredOne = advanceFieldResourceEcology(catalog, almost, 1, CLEAR_WEATHER);
    expect(fieldResourceStockUnits(catalog, restoredOne, node.id)).toBe(node.capacityUnits - 1);
    expect(restoredOne.activeTick).toBe(400 + ticksForOne);

    const fullyRestored = advanceFieldResourceEcology(catalog, restoredOne, 10_000, CLEAR_WEATHER);
    expect(fullyRestored.depletion).toEqual([]);
    expect(fieldResourceStockUnits(catalog, fullyRestored, node.id)).toBe(node.capacityUnits);
  });

  it("is stable through JSON saves and partitioned same-weather advances", () => {
    const seed = seedFromText("a sparse ledger under glass");
    const catalog = generateFieldResourceCatalog(seed, generateTerrain(seed));
    const [first, second] = catalog.nodes;
    if (first === undefined || second === undefined) throw new Error("catalog needs two nodes");
    const unsorted: FieldResourceEcologyState = {
      version: 1,
      activeTick: 99,
      depletion: [
        { nodeId: second.id, missingUnits: 2, regenerationProgressFixed: 111_111 },
        { nodeId: first.id, missingUnits: 3, regenerationProgressFixed: 222_222 },
      ],
    };
    const canonical = canonicalizeFieldResourceState(catalog, unsorted);
    const roundTrip = JSON.parse(JSON.stringify(canonical)) as FieldResourceEcologyState;
    const whole = advanceFieldResourceEcology(catalog, roundTrip, 137, CLEAR_WEATHER);
    const firstPart = advanceFieldResourceEcology(catalog, roundTrip, 41, CLEAR_WEATHER);
    const partitioned = advanceFieldResourceEcology(catalog, firstPart, 96, CLEAR_WEATHER);

    expect(roundTrip).toEqual(canonical);
    expect(partitioned).toEqual(whole);
    expect(whole.depletion.map((entry) => entry.nodeId))
      .toEqual([...whole.depletion.map((entry) => entry.nodeId)].sort());
    expect(Object.keys(whole).sort()).toEqual(["activeTick", "depletion", "version"]);
    expect(JSON.stringify(whole)).not.toMatch(/date|time|wall|offline/i);
  });

  it("canonicalizes sparse corrupt duplicates without input-order dependence", () => {
    const seed = seedFromText("the ledger refuses double shadows");
    const catalog = generateFieldResourceCatalog(seed, generateTerrain(seed));
    const node = firstHarvestableNode(catalog);
    const unknown = `${node.id}:unknown`;
    const state: FieldResourceEcologyState = {
      version: 1,
      activeTick: 8,
      depletion: [
        { nodeId: node.id, missingUnits: 2, regenerationProgressFixed: 900_000 },
        { nodeId: unknown, missingUnits: 5, regenerationProgressFixed: 0 },
        { nodeId: node.id, missingUnits: 3, regenerationProgressFixed: 400_000 },
      ],
    };
    const forward = canonicalizeFieldResourceState(catalog, state);
    const reverse = canonicalizeFieldResourceState(catalog, {
      ...state,
      depletion: [...state.depletion].reverse(),
    });

    expect(reverse).toEqual(forward);
    expect(forward.depletion).toEqual([{
      nodeId: node.id,
      missingUnits: Math.min(3, node.capacityUnits - 1),
      regenerationProgressFixed: 400_000,
    }]);
  });

  it("bounds all material weather responses from 0.6x through 1.6x", () => {
    const weatherKinds: readonly WeatherKind[] = ["clear", "mist", "rain", "storm"];
    const intensities = [-FIXED_POINT, 0, 333_333, FIXED_POINT, Number.POSITIVE_INFINITY];
    const winds = [-4 * FIXED_POINT, 0, 420_000, 4 * FIXED_POINT, Number.NaN];
    const observed = new Set<number>();

    for (const material of FIELD_MATERIAL_IDS) {
      for (const kind of weatherKinds) {
        for (const intensity of intensities) {
          for (const windX of winds) {
            const multiplier = fieldResourceWeatherMultiplierPermille(material, {
              kind,
              intensity,
              windX,
              windY: -windX,
            });
            expect(Number.isSafeInteger(multiplier)).toBe(true);
            expect(multiplier).toBeGreaterThanOrEqual(FIELD_RESOURCE_WEATHER_MIN_PERMILLE);
            expect(multiplier).toBeLessThanOrEqual(FIELD_RESOURCE_WEATHER_MAX_PERMILLE);
            observed.add(multiplier);
          }
        }
      }
    }
    expect(observed.has(FIELD_RESOURCE_WEATHER_MIN_PERMILLE)).toBe(true);
    expect(observed.has(FIELD_RESOURCE_WEATHER_MAX_PERMILLE)).toBe(true);
  });

  it("does not infer offline progress: zero explicit active ticks changes no stock", () => {
    const seed = seedFromText("the sleeping marsh does not secretly grow");
    const catalog = generateFieldResourceCatalog(seed, generateTerrain(seed));
    const node = firstHarvestableNode(catalog);
    const depleted = stateWithMissing(node, 2, 731_000, 5);
    const before = canonicalizeFieldResourceState(
      catalog,
      JSON.parse(JSON.stringify(depleted)) as FieldResourceEcologyState,
    );

    const after = advanceFieldResourceEcology(catalog, depleted, 0, {
      kind: "storm",
      intensity: FIXED_POINT,
      windX: FIXED_POINT,
      windY: FIXED_POINT,
    });

    expect(after).toEqual(before);
    expect(fieldResourceStockUnits(catalog, after, node.id))
      .toBe(fieldResourceStockUnits(catalog, before, node.id));
  });
});

describe("harbor bootstrap safety", () => {
  it("finds renewable starter fiber and rigid sources around generated harbors", () => {
    const fiberSet = new Set<string>(BOOTSTRAP_FIBER_MATERIALS);
    const rigidSet = new Set<string>(BOOTSTRAP_RIGID_MATERIALS);
    for (let seedIndex = 0; seedIndex < 20; seedIndex += 1) {
      const seedText = `bootstrap harbor matrix ${seedIndex}`;
      const world = createInitialWorld(seedText, "standard");
      const catalog = generateFieldResourceCatalog(world.meta.rootSeed, world.terrain);
      for (const settlement of world.settlements) {
        const evaluation = evaluateHarborBootstrap(catalog, settlement.tileIndex);
        expect(evaluation.safe, `${seedText} harbor ${settlement.tileIndex}: ${evaluation.reason}`)
          .toBe(true);
        expect(fiberSet.has(evaluation.fiber?.material ?? "")).toBe(true);
        expect(rigidSet.has(evaluation.rigid?.material ?? "")).toBe(true);
        expect(evaluation.fiber?.distance).toBeLessThanOrEqual(DEFAULT_BOOTSTRAP_RADIUS);
        expect(evaluation.rigid?.distance).toBeLessThanOrEqual(DEFAULT_BOOTSTRAP_RADIUS);
      }
    }
  });

  it("reports exact missing-source and invalid-harbor reasons without inventing nodes", () => {
    const catalog: FieldResourceCatalog = {
      version: 1,
      width: 4,
      height: 4,
      nodes: [],
    };
    expect(evaluateHarborBootstrap(catalog, 5, 3)).toEqual({
      harborTileIndex: 5,
      radius: 3,
      safe: false,
      reason: "fiber-and-rigid-sources-missing",
      fiber: null,
      rigid: null,
    });
    expect(evaluateHarborBootstrap(catalog, 99, 3)).toMatchObject({
      safe: false,
      reason: "invalid-harbor",
    });
  });
});

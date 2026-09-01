import { describe, expect, it } from "vitest";

import { createWorld, createWorldView, FIXED_POINT, type WorldView } from "../sim/public";
import { deriveBiomeProfile, deriveMagicalWaterInfluence } from "../sim/biomes";
import { createCraftingInventory } from "./crafting";
import {
  createLooseCargoCarrier,
  createLooseCargoWorld,
  deserializeLooseCargoCarrier,
  dropLooseCargo,
  serializeLooseCargoCarrier,
  upsertLooseCargoPromise,
  type LooseCargoWorldState,
} from "./looseCargo";
import {
  PLAYER_TO_LOOSE_CARGO_SCALE,
  looseCargoPositionAtPlayer,
  looseCargoPositionAtRegionalPlayer,
  playerPositionAtLooseCargo,
  playerPositionAtRegionalLooseCargo,
  projectLooseCargoCarrierToPlayer,
  sampleLooseCargoEnvironment,
  stepLooseCargoInCompatibilityWorld,
} from "./looseCargoRuntime";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView, regionalTileIndexInView } from "./regionalWorldView";

const OWNER = { kind: "player", id: "local-porter" } as const;

function worldView(seed = "cargo runtime weather estuary"): WorldView {
  return createWorldView(createWorld(seed, "wild"));
}

function oneParcelAtTile(
  view: WorldView,
  tileIndex: number,
): LooseCargoWorldState {
  const tile = view.terrain.tiles[tileIndex];
  if (!tile) throw new Error("parcel fixture tile missing");
  const carrier = createLooseCargoCarrier(
    OWNER,
    createCraftingInventory(18_000, { cordreed: 1 }),
  );
  const dropped = dropLooseCargo(
    createLooseCargoWorld(view.terrain.width, view.terrain.height),
    carrier,
    {
      lotId: "crafting-stack:cordreed",
      quantity: 1,
      x: tile.x * FIXED_POINT + FIXED_POINT / 2,
      y: tile.y * FIXED_POINT + FIXED_POINT / 2,
    },
  );
  if (!dropped.ok) throw new Error(dropped.message);
  return dropped.world;
}

describe("loose cargo runtime coordinates", () => {
  it("round-trips exact player grid coordinates into fixed-point tile space", () => {
    const position = looseCargoPositionAtPlayer(1_500, 72_500, { x: -7, y: 12 });
    expect(PLAYER_TO_LOOSE_CARGO_SCALE).toBe(1_000);
    expect(position).toEqual({ region: { x: -7, y: 12 }, x: 1_500_000, y: 72_500_000 });
    expect(playerPositionAtLooseCargo(position)).toEqual({ x: 1_500, y: 72_500 });
    expect(() => looseCargoPositionAtPlayer(Number.MAX_SAFE_INTEGER, 0)).toThrow(RangeError);
    expect(() => playerPositionAtLooseCargo({ x: Number.NaN, y: 0 })).toThrow(RangeError);
  });

  it("groups differently weathered Promise fragments with a quantity-weighted floor", () => {
    let carrier = createLooseCargoCarrier(OWNER, createCraftingInventory(18_000));
    const first = upsertLooseCargoPromise(carrier, {
      sourceLotId: "recovered:promise:44:a",
      contractId: 44,
      resource: "medicine",
      quantity: 1,
      property: "fragile",
      materialState: { condition: 300_001, contamination: 90_000, decay: 30_000 },
    });
    expect(first.ok).toBe(true);
    carrier = first.carrier;
    const second = upsertLooseCargoPromise(carrier, {
      sourceLotId: "recovered:promise:44:b",
      contractId: 44,
      resource: "medicine",
      quantity: 2,
      property: "fragile",
      materialState: { condition: 900_000, contamination: 30_000, decay: 0 },
    });
    expect(second.ok).toBe(true);
    const reloaded = deserializeLooseCargoCarrier(serializeLooseCargoCarrier(second.carrier));
    const projected = projectLooseCargoCarrierToPlayer(reloaded);
    expect(projected.cargo).toEqual([{
      contractId: 44,
      resource: "medicine",
      quantity: 3,
      condition: 700_000,
      property: "fragile",
    }]);
    expect(projected.transportCondition).toBe(700_000);
    expect(projected.contamination).toBe(50_000);
    expect(projected.decay).toBe(10_000);
    expect(projected.combinedLoadMilli).toBe(3_750);
    expect(reloaded.lots).toHaveLength(2);
  });
});

describe("compatibility-region parcel environment", () => {
  it("uses the same seed-stable magical-water field as terrain presentation", () => {
    const view = worldView("one magical field for parcels and terrain");
    const rootSeed = view.rootSeed;
    if (rootSeed === undefined) throw new Error("world view lost its root seed");
    const tile = [...view.terrain.tiles]
      .map((candidate) => ({
        tile: candidate,
        magic: deriveMagicalWaterInfluence(rootSeed, candidate),
      }))
      .filter(({ tile: candidate }) => candidate.waterDepth > 0)
      .sort((left, right) => right.magic - left.magic || left.tile.index - right.tile.index)[0];
    if (!tile || tile.magic <= 0) throw new Error("magical-water fixture missing");
    const cargo = oneParcelAtTile(view, tile.tile.index);
    const sample = sampleLooseCargoEnvironment(view, cargo)[0];
    const biome = deriveBiomeProfile({
      seed: rootSeed,
      tile: tile.tile,
      gridHeight: view.terrain.height,
      weather: view.weather,
      magicalWaterInfluence: tile.magic,
    });
    expect(sample?.environment.magicalWaterFlux).toBe(
      Math.trunc((tile.tile.waterDepth * biome.climate.magicalWater) / FIXED_POINT),
    );
    expect(sample?.environment.magicalWaterFlux).toBeGreaterThan(0);
  });

  it("samples every parcel exactly once and makes deep current physically move it", () => {
    const view = worldView();
    const deepest = [...view.terrain.tiles]
      .sort((left, right) => right.waterDepth - left.waterDepth || left.index - right.index)[0];
    if (!deepest || deepest.waterDepth <= 35_000) throw new Error("deep-water fixture missing");
    const cargo = oneParcelAtTile(view, deepest.index);
    const samples = sampleLooseCargoEnvironment(view, cargo);

    expect(samples).toHaveLength(cargo.entities.length);
    expect(samples.map(({ entityId }) => entityId)).toEqual(cargo.entities.map(({ id }) => id));
    expect(samples[0]?.waterDepth).toBe(deepest.waterDepth);
    expect(samples[0]?.environment.immersion).toBe(deepest.waterDepth);
    expect(Math.abs(samples[0]?.environment.currentX ?? 0)).toBeGreaterThan(0);

    const stepped = stepLooseCargoInCompatibilityWorld(view, cargo);
    expect(stepped.ok).toBe(true);
    expect(stepped.state.entities[0]?.motion).toBe("drifting");
    expect(stepped.events[0]?.moved).toBe(true);
  });

  it("combines live storm, biome magic, rock, mangrove, and bramble signals", () => {
    const base = worldView("glimmer parcel signals");
    const wettest = [...base.terrain.tiles]
      .sort((left, right) => right.waterDepth - left.waterDepth || left.index - right.index)[0];
    if (!wettest) throw new Error("wet tile fixture missing");
    const view: WorldView = {
      ...base,
      weather: {
        ...base.weather,
        kind: "storm",
        intensity: 820_000,
        windX: 500_000,
        windY: -400_000,
      },
    };
    const cargo = oneParcelAtTile(view, wettest.index);
    const sample = sampleLooseCargoEnvironment(view, cargo, {
      rockImpactAtTile: (index) => index === wettest.index ? 730_000 : 0,
      mangroveSnagAtTile: (index) => index === wettest.index ? 810_000 : 0,
      brambleSnagAtTile: (index) => index === wettest.index ? 230_000 : 0,
    })[0];

    expect(sample).toMatchObject({
      entityId: cargo.entities[0]?.id,
      tumbleImpact: 730_000,
      mangroveSnag: 810_000,
      brambleSnag: 230_000,
    });
    expect(sample?.environment.rain).toBe(820_000);
    expect(sample?.environment.currentY).toBeLessThan(0);
    expect(sample?.environment.magicalWaterFlux).toBeGreaterThanOrEqual(0);
  });

  it("derives a deterministic cardinal downhill force with a stable tie order", () => {
    const base = worldView("parcel downhill ordering");
    const width = base.terrain.width;
    const centerIndex = width + 1;
    const tiles = base.terrain.tiles.map((tile) => ({ ...tile }));
    const center = tiles[centerIndex];
    const north = tiles[centerIndex - width];
    const east = tiles[centerIndex + 1];
    if (!center || !north || !east) throw new Error("downhill fixture missing");
    center.elevation = 800_000;
    north.elevation = 300_000;
    east.elevation = 300_000;
    const view: WorldView = { ...base, terrain: { ...base.terrain, tiles } };
    const cargo = oneParcelAtTile(view, centerIndex);
    const sample = sampleLooseCargoEnvironment(view, cargo)[0];
    expect(sample?.downhillX).toBe(0);
    expect(sample?.downhillY).toBe(-FIXED_POINT);
  });

  it("fails closed when a cargo sidecar belongs to another loaded region", () => {
    const view = worldView();
    const cargo = createLooseCargoWorld(view.terrain.width, view.terrain.height, { x: -1, y: 0 });
    expect(() => sampleLooseCargoEnvironment(view, cargo)).toThrow(RangeError);
    expect(stepLooseCargoInCompatibilityWorld(view, cargo)).toEqual({
      ok: false,
      reason: "invalid-sample",
      state: cargo,
      events: [],
    });
  });

  it("does not turn roughness into repeated impact damage for a dry resting parcel", () => {
    const base = worldView("resting parcel is not a damage aura");
    const dry = [...base.terrain.tiles]
      .filter((tile) => tile.waterDepth === 0)
      .sort((left, right) => left.index - right.index)[0];
    if (!dry) throw new Error("dry parcel fixture missing");
    const tiles = base.terrain.tiles.map((tile) => ({
      ...tile,
      elevation: dry.elevation,
      waterDepth: 0,
    }));
    const view: WorldView = {
      ...base,
      weather: { ...base.weather, kind: "clear", intensity: 0, windX: 0, windY: 0 },
      terrain: { ...base.terrain, tiles },
    };
    let exposedToRockSignal = oneParcelAtTile(view, dry.index);
    let control = oneParcelAtTile(view, dry.index);
    for (let step = 0; step < 1_000; step += 1) {
      const result = stepLooseCargoInCompatibilityWorld(view, exposedToRockSignal, {
        rockImpactAtTile: () => 900_000,
      });
      const controlResult = stepLooseCargoInCompatibilityWorld(view, control);
      expect(result.ok).toBe(true);
      expect(controlResult.ok).toBe(true);
      exposedToRockSignal = result.state;
      control = controlResult.state;
    }
    expect(exposedToRockSignal.entities[0]?.materialState)
      .toEqual(control.entities[0]?.materialState);
    expect(exposedToRockSignal.entities[0]?.motion).toBe("resting");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, FIXED_POINT + 1, 0.5])(
    "rejects a non-canonical landscape signal %s instead of granting hazard immunity",
    (invalid) => {
      const view = worldView("invalid parcel landscape signal");
      const cargo = oneParcelAtTile(view, 0);
      const landscape = { rockImpactAtTile: () => invalid };
      expect(() => sampleLooseCargoEnvironment(view, cargo, landscape)).toThrow(RangeError);
      expect(stepLooseCargoInCompatibilityWorld(view, cargo, landscape)).toEqual({
        ok: false,
        reason: "invalid-sample",
        state: cargo,
        events: [],
      });
    },
  );

  it("rejects invalid living-cover signals rather than silently clamping them", () => {
    const view = worldView("invalid parcel snag signal");
    const cargo = oneParcelAtTile(view, 0);
    for (const landscape of [
      { mangroveSnagAtTile: () => -1 },
      { brambleSnagAtTile: () => Number.NaN },
    ]) {
      expect(stepLooseCargoInCompatibilityWorld(view, cargo, landscape)).toMatchObject({
        ok: false,
        reason: "invalid-sample",
        state: cargo,
      });
    }
  });
});

describe("signed-region parcel runtime", () => {
  it("roundtrips a floating player point through exact region-local cargo coordinates", () => {
    const world = createWorld("parcel crosses east", "wild");
    const compatibility = createWorldView(world);
    const stream = createTerrainRegionStreamingState({
      rootSeed: world.meta.rootSeed,
      center: { x: 1, y: 0 },
    });
    const window = createRegionalTerrainWindow(world.meta.rootSeed, stream);
    const view = createRegionalWorldView(
      compatibility,
      window,
      projectRegionalCartographyWindow(createRegionalCartography(world.meta.rootSeed), window),
    );
    const localTileIndex = 17 * 96 + 23;
    const viewIndex = regionalTileIndexInView(view, { x: 1, y: 0 }, localTileIndex);
    const tile = viewIndex === null ? undefined : view.terrain.tiles[viewIndex];
    if (!tile) throw new Error("regional player coordinate fixture missing");
    const playerPoint = { x: tile.x * 1_000 + 321, y: tile.y * 1_000 + 654 };
    const cargoPoint = looseCargoPositionAtRegionalPlayer(view, playerPoint.x, playerPoint.y);
    expect(cargoPoint).toEqual({
      region: { x: 1, y: 0 },
      x: 23_321_000,
      y: 17_654_000,
    });
    expect(playerPositionAtRegionalLooseCargo(view, cargoPoint)).toEqual(playerPoint);
    expect(playerPositionAtRegionalLooseCargo(view, { ...cargoPoint, region: { x: 9, y: 9 } })).toBeNull();
  });

  it("samples and steps the active nonzero region against its exact mapped terrain", () => {
    const world = createWorld("regional parcel weather", "wild");
    const compatibility = createWorldView(world);
    const region = { x: -3, y: 5 } as const;
    const stream = createTerrainRegionStreamingState({ rootSeed: world.meta.rootSeed, center: region });
    const window = createRegionalTerrainWindow(world.meta.rootSeed, stream);
    const view = createRegionalWorldView(
      compatibility,
      window,
      projectRegionalCartographyWindow(createRegionalCartography(world.meta.rootSeed), window),
    );
    const mapped = Array.from({ length: 96 * 72 }, (_, tileIndex) => ({
      tileIndex,
      viewIndex: regionalTileIndexInView(view, region, tileIndex),
    })).map(({ tileIndex, viewIndex }) => ({ tileIndex, tile: viewIndex === null ? undefined : view.terrain.tiles[viewIndex] }))
      .filter((entry): entry is { tileIndex: number; tile: NonNullable<typeof entry.tile> } => entry.tile !== undefined)
      .sort((left, right) => right.tile.waterDepth - left.tile.waterDepth || left.tileIndex - right.tileIndex)[0];
    if (!mapped) throw new Error("regional parcel terrain fixture missing");
    let carrier = createLooseCargoCarrier(OWNER, createCraftingInventory(18_000, { cordreed: 1 }));
    const dropped = dropLooseCargo(createLooseCargoWorld(96, 72, region), carrier, {
      lotId: "crafting-stack:cordreed",
      quantity: 1,
      x: (mapped.tileIndex % 96) * FIXED_POINT + FIXED_POINT / 2,
      y: Math.floor(mapped.tileIndex / 96) * FIXED_POINT + FIXED_POINT / 2,
    });
    if (!dropped.ok) throw new Error(dropped.message);
    carrier = dropped.carrier;
    expect(carrier.lots).toHaveLength(0);
    const sample = sampleLooseCargoEnvironment(view, dropped.world)[0];
    expect(sample?.waterDepth).toBe(mapped.tile.waterDepth);
    expect(stepLooseCargoInCompatibilityWorld(view, dropped.world).ok).toBe(true);
  });
});

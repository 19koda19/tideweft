import { describe, expect, it, vi } from "vitest";

const lineTransmissionProbe = vi.hoisted(() => ({ calls: 0 }));

vi.mock("./perception", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./perception")>();
  return {
    ...actual,
    evaluateLineTransmission(
      input: Parameters<typeof actual.evaluateLineTransmission>[0],
    ): ReturnType<typeof actual.evaluateLineTransmission> {
      lineTransmissionProbe.calls += 1;
      return actual.evaluateLineTransmission(input);
    },
  };
});

import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import { MAX_OUTDOOR_LOCAL_LIGHT_SOURCES } from "../sim/outdoorIllumination";
import { FIXED_POINT, type WorldView } from "../sim/types";
import {
  WORLD_DAWN_START_TICK,
  WORLD_DAY_START_TICK,
  WORLD_DUSK_START_TICK,
  WORLD_NIGHT_START_TICK,
} from "../sim/worldTime";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import {
  createRegionalWorldView,
  regionalAddressAt,
  regionalTileIndexInView,
} from "./regionalWorldView";
import {
  SETTLEMENT_LAMP_PEAK_INTENSITY,
  buildOutdoorIlluminationField,
  buildWorldPerceptionCells,
  deriveSettlementLampSources,
  outdoorIlluminationCacheKey,
  sampleOutdoorIlluminationAtTile,
  settlementLampIntensityAtTick,
} from "./outdoorIllumination";

function flatBeaconWorld(
  seed: string,
  tick: number,
  complete = true,
): WorldView {
  const state = createWorld(seed);
  state.meta.completedTick = tick;
  const beacon = state.settlements.find(({ project }) => project.kind === "beacon");
  if (!beacon) throw new Error("illumination fixture has no beacon project");
  beacon.project.status = complete ? "complete" : "building";
  const view = createWorldView(state);
  return {
    ...view,
    terrain: {
      ...view.terrain,
      tiles: view.terrain.tiles.map((tile) => ({
        ...tile,
        terrain: "meadow" as const,
        elevation: 0,
        roughness: 0,
        waterDepth: 0,
      })),
    },
  };
}

function beaconSettlement(world: WorldView) {
  const settlement = world.settlements.find(({ project }) => project.kind === "beacon");
  if (!settlement) throw new Error("illumination fixture lost its beacon");
  return settlement;
}

function tileFourStepsFrom(world: WorldView, sourceIndex: number): number {
  const x = sourceIndex % world.terrain.width;
  const direction = x + 4 < world.terrain.width ? 1 : -1;
  return sourceIndex + direction * 4;
}

describe("game outdoor illumination bridge", () => {
  it("centralizes the established settlement and terrain occlusion geometry", () => {
    const base = flatBeaconWorld("one shared geometry", WORLD_NIGHT_START_TICK);
    const settlement = beaconSettlement(base);
    const freeIndices = base.terrain.tiles
      .map(({ index }) => index)
      .filter((index) => !base.settlements.some(({ tileIndex }) => tileIndex === index));
    const ridgeIndex = freeIndices[0]!;
    const marshIndex = freeIndices[1]!;
    const roughIndex = freeIndices[2]!;
    const tiles = base.terrain.tiles.map((tile) => {
      if (tile.index === ridgeIndex) return { ...tile, terrain: "ridge" as const };
      if (tile.index === marshIndex) return { ...tile, terrain: "marsh" as const };
      if (tile.index === roughIndex) return { ...tile, roughness: 880_000 };
      return tile;
    });
    const world = { ...base, terrain: { ...base.terrain, tiles } };
    const cells = buildWorldPerceptionCells(world)!;

    expect(cells).toHaveLength(world.terrain.tiles.length);
    expect(cells[settlement.tileIndex]?.obstruction).toBe(0.72);
    expect(cells[ridgeIndex]?.obstruction).toBe(0.76);
    expect(cells[marshIndex]?.obstruction).toBe(0.34);
    expect(cells[roughIndex]?.obstruction).toBe(0.5);
    expect(buildWorldPerceptionCells(world)).toBe(cells);
    expect(Object.isFrozen(cells)).toBe(true);
    expect(Object.isFrozen(cells[0])).toBe(true);
  });

  it("ramps persisted beacon lamps through the shared dusk and dawn curve", () => {
    const earlyDusk = settlementLampIntensityAtTick(WORLD_DUSK_START_TICK + 1)!;
    const midDusk = settlementLampIntensityAtTick(WORLD_DUSK_START_TICK + 30)!;
    const midDawn = settlementLampIntensityAtTick(WORLD_DAWN_START_TICK + 30)!;

    expect(settlementLampIntensityAtTick(WORLD_DUSK_START_TICK)).toBe(0);
    expect(earlyDusk).toBeGreaterThan(0);
    expect(midDusk).toBeGreaterThan(earlyDusk);
    expect(midDusk).toBeLessThan(SETTLEMENT_LAMP_PEAK_INTENSITY);
    expect(settlementLampIntensityAtTick(WORLD_NIGHT_START_TICK))
      .toBe(SETTLEMENT_LAMP_PEAK_INTENSITY);
    expect(settlementLampIntensityAtTick(WORLD_DAWN_START_TICK))
      .toBe(SETTLEMENT_LAMP_PEAK_INTENSITY);
    expect(midDawn).toBeGreaterThan(0);
    expect(midDawn).toBeLessThan(SETTLEMENT_LAMP_PEAK_INTENSITY);
    expect(settlementLampIntensityAtTick(WORLD_DAY_START_TICK)).toBe(0);
    expect(settlementLampIntensityAtTick(-1)).toBeNull();
  });

  it("creates exactly one stable local source only for a completed beacon", () => {
    const building = flatBeaconWorld("a lamp is earned", WORLD_NIGHT_START_TICK, false);
    const complete = flatBeaconWorld("a lamp is earned", WORLD_NIGHT_START_TICK, true);
    const settlement = beaconSettlement(complete);
    const target = tileFourStepsFrom(complete, settlement.tileIndex);
    const before = structuredClone(complete);

    expect(deriveSettlementLampSources(building, target)).toEqual([]);
    const sources = deriveSettlementLampSources(complete, target)!;
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      kind: "settlement-lamp",
      intensity: SETTLEMENT_LAMP_PEAK_INTENSITY,
      lineTransmission: FIXED_POINT,
    });
    expect(sources[0]?.stableId).toMatch(/^sl1:[0-9a-f]{16}$/);
    expect(sources[0]?.position).toEqual(regionalAddressAt(complete, settlement.tileIndex));

    const renamed: WorldView = {
      ...complete,
      settlements: complete.settlements.map((candidate) => candidate.id === settlement.id
        ? { ...candidate, name: "A changed display name" }
        : candidate),
    };
    expect(deriveSettlementLampSources(renamed, target)?.[0]?.stableId)
      .toBe(sources[0]?.stableId);
    expect(complete).toEqual(before);
  });

  it("uses the shared terrain ray so an intervening ridge blocks lamp light", () => {
    const open = flatBeaconWorld("the ridge blocks light", WORLD_NIGHT_START_TICK);
    const source = beaconSettlement(open).tileIndex;
    const target = tileFourStepsFrom(open, source);
    const direction = Math.sign(target - source);
    const blocker = source + direction * 2;
    const openSample = sampleOutdoorIlluminationAtTile(open, target)!;
    const blocked: WorldView = {
      ...open,
      terrain: {
        ...open.terrain,
        tiles: open.terrain.tiles.map((tile) => tile.index === blocker
          ? { ...tile, terrain: "ridge" as const, elevation: FIXED_POINT }
          : tile),
      },
    };
    const blockedSample = sampleOutdoorIlluminationAtTile(blocked, target)!;

    expect(openSample.localSourcesContributing).toBe(1);
    expect(openSample.localIllumination).toBeGreaterThan(0);
    expect(blockedSample.localSourcesConsidered).toBe(1);
    expect(blockedSample.localSourcesContributing).toBe(0);
    expect(blockedSample.localIllumination).toBe(0);
    expect(blockedSample.physicalIllumination).toBe(blockedSample.ambientIllumination);
  });

  it("addresses the same lamp continuously inside the sliding regional frame", () => {
    const economy = flatBeaconWorld("light across storage seams", WORLD_NIGHT_START_TICK);
    const stream = createTerrainRegionStreamingState({ rootSeed: economy.rootSeed! });
    const window = createRegionalTerrainWindow(economy.rootSeed!, stream);
    const spatial = createRegionalWorldView(
      economy,
      window,
      projectRegionalCartographyWindow(createRegionalCartography(economy.rootSeed!), window),
      { immutable: true },
    );
    const settlement = beaconSettlement(economy);
    const sourceInView = regionalTileIndexInView(
      spatial,
      createRegionCoord(0, 0),
      settlement.tileIndex,
    );
    if (sourceInView === null) throw new Error("regional fixture did not include the beacon");
    const target = tileFourStepsFrom(spatial, sourceInView);
    const source = deriveSettlementLampSources(spatial, target)?.[0];

    expect(source).toBeDefined();
    expect(source?.position).toEqual(regionalAddressAt(spatial, sourceInView));
    expect(source?.stableId).toBe(
      deriveSettlementLampSources(economy, tileFourStepsFrom(economy, settlement.tileIndex))
        ?.[0]?.stableId,
    );

    const remoteStream = createTerrainRegionStreamingState({
      rootSeed: economy.rootSeed!,
      center: createRegionCoord(-8, 13),
    });
    const remoteWindow = createRegionalTerrainWindow(economy.rootSeed!, remoteStream);
    const remote = createRegionalWorldView(
      economy,
      remoteWindow,
      projectRegionalCartographyWindow(
        createRegionalCartography(economy.rootSeed!),
        remoteWindow,
      ),
    );
    expect(deriveSettlementLampSources(remote, 0)).toEqual([]);
    expect(sampleOutdoorIlluminationAtTile(remote, 0)?.localIllumination).toBe(0);
  });

  it("reuses one validated immutable regional geometry snapshot across consumers", () => {
    const economy = flatBeaconWorld("one bounded regional geometry scan", WORLD_NIGHT_START_TICK);
    const stream = createTerrainRegionStreamingState({ rootSeed: economy.rootSeed! });
    const window = createRegionalTerrainWindow(economy.rootSeed!, stream);
    const spatial = createRegionalWorldView(
      economy,
      window,
      projectRegionalCartographyWindow(createRegionalCartography(economy.rootSeed!), window),
      { immutable: true },
    );

    expect(Object.isFrozen(spatial.terrain)).toBe(true);
    expect(Object.isFrozen(spatial.terrain.tiles)).toBe(true);
    expect(Object.isFrozen(spatial.terrain.tiles[0])).toBe(true);
    expect(Object.isFrozen(spatial.settlements)).toBe(true);
    expect(Object.isFrozen(spatial.settlements[0])).toBe(true);
    expect(Object.isFrozen(spatial.settlements[0]?.project)).toBe(true);

    const cells = buildWorldPerceptionCells(spatial)!;
    expect(buildWorldPerceptionCells(spatial)).toBe(cells);
    expect(outdoorIlluminationCacheKey(spatial, cells)).not.toBeNull();
    expect(buildOutdoorIlluminationField(spatial, cells)).not.toBeNull();
  });

  it("caches the bounded full-view field by physical light state rather than raw tick", () => {
    const night = flatBeaconWorld("light field cache", WORLD_NIGHT_START_TICK);
    const laterNight = { ...night, completedTick: WORLD_NIGHT_START_TICK + 100 };
    const dawn = { ...night, completedTick: WORLD_DAWN_START_TICK + 20 };
    const rain: WorldView = {
      ...night,
      weather: { ...night.weather, kind: "rain", intensity: 700_000 },
    };
    const building: WorldView = {
      ...night,
      settlements: night.settlements.map((settlement) => settlement.project.kind === "beacon"
        ? { ...settlement, project: { ...settlement.project, status: "building" } }
        : settlement),
    };
    const key = outdoorIlluminationCacheKey(night);
    const field = buildOutdoorIlluminationField(night)!;
    const cached = buildOutdoorIlluminationField(laterNight)!;
    const source = beaconSettlement(night).tileIndex;
    const target = tileFourStepsFrom(night, source);

    expect(key).toMatch(/^outdoor-light-v1:[0-9a-f]{16}$/);
    expect(outdoorIlluminationCacheKey(laterNight)).toBe(key);
    expect(cached).toBe(field);
    expect(field.physicalIllumination).toHaveLength(
      field.columns * field.rows,
    );
    expect(field.localIllumination).toHaveLength(field.columns * field.rows);
    expect(field.localIllumination[target])
      .toBe(sampleOutdoorIlluminationAtTile(night, target)?.localIllumination);
    expect(field.physicalIllumination[target])
      .toBe(sampleOutdoorIlluminationAtTile(night, target)?.physicalIllumination);
    expect(Object.isFrozen(field)).toBe(true);
    expect(Object.isFrozen(field.localIllumination)).toBe(true);
    expect(Object.isFrozen(field.physicalIllumination)).toBe(true);
    expect(outdoorIlluminationCacheKey(dawn)).not.toBe(key);
    expect(outdoorIlluminationCacheKey(rain)).not.toBe(key);
    expect(outdoorIlluminationCacheKey(building)).not.toBe(key);
  });

  it("revalidates caller-owned cells instead of trusting mutable array identity", () => {
    const world = flatBeaconWorld("revalidated light geometry", WORLD_NIGHT_START_TICK);
    const cells = buildWorldPerceptionCells(world)!;
    let indexedReads = 0;
    const observedCells = new Proxy(cells, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/u.test(property)) indexedReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });

    const first = outdoorIlluminationCacheKey(world, observedCells);
    expect(first).not.toBeNull();
    expect(indexedReads).toBeGreaterThan(0);
    indexedReads = 0;
    expect(outdoorIlluminationCacheKey(world, observedCells)).toBe(first);
    expect(indexedReads).toBe(cells.length);
  });

  it("invalidates same-array terrain and settlement mutations and rejects stale geometry", () => {
    const world = flatBeaconWorld("mutable light inputs", WORLD_NIGHT_START_TICK);
    const source = beaconSettlement(world).tileIndex;
    const target = tileFourStepsFrom(world, source);
    const direction = Math.sign(target - source);
    const blocker = source + direction * 2;
    const originalCells = buildWorldPerceptionCells(world)!;
    const originalKey = outdoorIlluminationCacheKey(world, originalCells)!;
    const originalField = buildOutdoorIlluminationField(world, originalCells)!;
    expect(originalField.localIllumination[target]).toBeGreaterThan(0);

    const mutableTile = world.terrain.tiles[blocker] as {
      terrain: WorldView["terrain"]["tiles"][number]["terrain"];
      elevation: number;
      roughness: number;
    };
    mutableTile.terrain = "ridge";
    mutableTile.elevation = FIXED_POINT;

    expect(outdoorIlluminationCacheKey(world, originalCells)).toBeNull();
    const changedCells = buildWorldPerceptionCells(world)!;
    const changedKey = outdoorIlluminationCacheKey(world, changedCells)!;
    const changedField = buildOutdoorIlluminationField(world, changedCells)!;
    expect(changedCells).not.toBe(originalCells);
    expect(changedKey).not.toBe(originalKey);
    expect(changedField).not.toBe(originalField);
    expect(changedField.localIllumination[target]).toBe(0);

    const mutableProject = beaconSettlement(world).project as {
      status: "planned" | "building" | "complete";
    };
    mutableProject.status = "building";
    const buildingKey = outdoorIlluminationCacheKey(world, changedCells)!;
    const buildingField = buildOutdoorIlluminationField(world, changedCells)!;
    expect(buildingKey).not.toBe(changedKey);
    expect(buildingField.localIllumination.every((value) => value === 0)).toBe(true);

    mutableTile.roughness = Number.NaN;
    expect(buildWorldPerceptionCells(world)).toBeNull();
    expect(buildOutdoorIlluminationField(world)).toBeNull();
  });

  it("indexes dense completed lamps once and caps candidates before line-of-sight work", () => {
    const base = flatBeaconWorld("dense indexed lamps", WORLD_NIGHT_START_TICK);
    const template = beaconSettlement(base);
    const source = template.tileIndex;
    let projectReads = 0;
    const settlements = Array.from({ length: 64 }, (_, index) => new Proxy({
      ...template,
      id: 10_000 + index,
      originKey: `dense-lamp:${index}`,
      tileIndex: source,
      project: {
        ...template.project,
        id: 20_000 + index,
        kind: "beacon" as const,
        status: "complete" as const,
      },
    }, {
      get(target, property, receiver) {
        if (property === "project") projectReads += 1;
        return Reflect.get(target, property, receiver);
      },
    }));
    const dense: WorldView = { ...base, settlements };

    const field = buildOutdoorIlluminationField(dense)!;
    expect(projectReads).toBe(settlements.length);
    expect(field.localIllumination[source]).toBeGreaterThan(0);

    projectReads = 0;
    lineTransmissionProbe.calls = 0;
    const sources = deriveSettlementLampSources(dense, source)!;
    expect(projectReads).toBe(settlements.length);
    expect(lineTransmissionProbe.calls).toBe(MAX_OUTDOOR_LOCAL_LIGHT_SOURCES);
    expect(sources).toHaveLength(MAX_OUTDOOR_LOCAL_LIGHT_SOURCES);
    expect(new Set(sources.map(({ stableId }) => stableId)).size)
      .toBe(MAX_OUTDOOR_LOCAL_LIGHT_SOURCES);
  });

  it("fails malformed targets and geometry closed without mutating the world", () => {
    const world = flatBeaconWorld("bad light geometry", WORLD_NIGHT_START_TICK);
    const before = structuredClone(world);
    const malformed: WorldView = {
      ...world,
      terrain: {
        ...world.terrain,
        tiles: world.terrain.tiles.map((tile, index) => index === 2
          ? { ...tile, roughness: Number.NaN }
          : tile),
      },
    };

    expect(sampleOutdoorIlluminationAtTile(world, -1)).toBeNull();
    expect(deriveSettlementLampSources(world, 0, [])).toBeNull();
    expect(buildWorldPerceptionCells(malformed)).toBeNull();
    expect(buildOutdoorIlluminationField(malformed)).toBeNull();
    expect(outdoorIlluminationCacheKey({ ...world, completedTick: -1 })).toBeNull();
    expect(outdoorIlluminationCacheKey({
      ...world,
      weather: { ...world.weather, intensity: Number.NaN },
    })).toBeNull();
    expect(world).toEqual(before);
  });
});

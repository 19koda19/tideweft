import { describe, expect, it } from "vitest";

import {
  CORE_WILDLIFE_SPECIES,
  CORE_WILDLIFE_WAVE_G_SALTMARSH_SMALL_WORLDS_SPECIES_COUNT,
} from "../sim/coreWildlifeIdentity";
import { generateRegionTerrain } from "../sim/regionTerrain";
import { createRegionCoord, regionLocalToGlobalTile } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS,
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  CORE_ECOLOGY_MAX_POPULATIONS,
  createCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import {
  CORE_ECOLOGY_SALTMARSH_SMALL_WORLDS_COHORT_ID,
  clearCoreEcologyBreadthHabitatCache,
  deriveCoreEcologyBreadthHabitat,
} from "./coreEcologyBreadthHabitat";
import { deriveCoreEcologyRegionalPredatorHabitatAssemblage } from "./coreEcologyHabitat";
import { CORE_ECOLOGY_GROUP_MAX_GROUPS } from "./coreEcologyGroups";
import type { CoreEcologyRuntimeWindow } from "./coreEcologyRuntime";
import { createCoreEcologySettlementHomePatch } from "./coreEcologySettlementHome";
import { repositionCoreWildlifeActor } from "./coreWildlifeActor";
import {
  LIVING_SPECIES_CATALOG,
  LIVING_SPECIES_WAVE_G_SALTMARSH_SMALL_WORLDS_CATALOG_COUNT,
} from "./livingSpeciesCatalog";
import { LIVING_SPECIES_REGISTRY } from "./livingSpeciesRegistry";
import { createPristineRegionalEcologyRoot } from "./regionalEcology";
import {
  createRegionalEcologyState,
  regionalEcologyRegionalResidentsForActiveRegions,
} from "./regionalEcologyState";
import { createFreshRegionalEcologyStateV2 } from "./regionalEcologyStateV2";
import { createFreshRegionalEcologyStateV3 } from "./regionalEcologyStateV3";
import { createFreshRegionalEcologyStateV4 } from "./regionalEcologyStateV4";
import { createFreshRegionalEcologyStateV5 } from "./regionalEcologyStateV5";
import {
  REGIONAL_ECOLOGY_STATE_V6_MAX_SERIALIZED_BYTES,
  createFreshRegionalEcologyStateV6,
  deserializeRegionalEcologyStateV6,
  regionalEcologyStateV6ActiveSourcePatches,
  serializeRegionalEcologyStateV6,
} from "./regionalEcologyStateV6";
import {
  REGIONAL_BREADTH_ECOLOGY_MAX_SERIALIZED_BYTES,
  advanceRegionalBreadthEcologyRoot,
  createPristineRegionalBreadthEcologyRoot,
  deserializeRegionalBreadthEcologyRoot,
  putRegionalBreadthEcologyResidentDeviation,
  regionalBreadthEcologyResidentsForActiveRegions,
  serializeRegionalBreadthEcologyRoot,
} from "./regionalBreadthEcology";
import {
  createCoreEcologyBreadthResidentPatch,
  deriveCoreEcologyBreadthResidentSet,
} from "./regionalBreadthCohort";
import { setRegionalEcologyMaterializationForWindow } from "./regionalEcologyRuntime";
import { REGIONAL_TRAVEL_COLUMNS, REGIONAL_TRAVEL_ROWS } from "./regionalTravel";
import {
  REGION_WIDTH_UNITS,
  WORLD_POSITION_UNITS_PER_TILE,
  translateWorldPosition,
} from "./worldPosition";

export const WAVE_G_BIODIVERSITY_PERFORMANCE_OWNER_ID =
  "test:wave-g-biodiversity-performance:v1" as const;
export const WAVE_G_BIODIVERSITY_SEAMLESS_CROSSING_OWNER_ID =
  "test:wave-g-biodiversity-seamless-crossing:v1" as const;

const SEED = seedFromText("alpha37 estuary breadth shared properties");
const HOME_REGION = createRegionCoord(-5_179, -89_646);
const SALTMARSH_REGION = createRegionCoord(-126_625, -214_398);
const AWAY_REGION = createRegionCoord(-126_623, -214_396);
const TICK = 0;
const UTF8_ENCODER = new TextEncoder();

// Generous shared-runner regression ceilings, not packaged-device frame-rate
// claims. The structural counts below are the authoritative runtime bounds.
const COLD_BREADTH_DERIVATION_BUDGET_MS = 20_000;
const V6_CONSTRUCTION_BUDGET_MS = 30_000;
const GLOBAL_MATERIALIZATION_BUDGET_MS = 5_000;
const SAVE_ROUND_TRIP_BUDGET_MS = 30_000;
const CANDIDATE_V6_SAVE_BUDGET_BYTES = 8 * 1_024 * 1_024;

describe(`${WAVE_G_BIODIVERSITY_PERFORMANCE_OWNER_ID} representative shared budgets`, () => {
  it("bounds the complete 45-wildlife/47-living breadth catalog without pairwise work", () => {
    expect(CORE_WILDLIFE_SPECIES).toHaveLength(45);
    expect(CORE_WILDLIFE_WAVE_G_SALTMARSH_SMALL_WORLDS_SPECIES_COUNT).toBe(45);
    expect(LIVING_SPECIES_REGISTRY).toHaveLength(47);
    expect(LIVING_SPECIES_CATALOG.modules).toHaveLength(47);
    expect(LIVING_SPECIES_WAVE_G_SALTMARSH_SMALL_WORLDS_CATALOG_COUNT).toBe(47);

    clearCoreEcologyBreadthHabitatCache();
    const firstStarted = performance.now();
    const breadth = deriveCoreEcologyBreadthResidentSet({
      seed: SEED,
      regions: [SALTMARSH_REGION],
      tick: TICK,
    });
    const firstDerivationMs = performance.now() - firstStarted;

    clearCoreEcologyBreadthHabitatCache();
    const replayStarted = performance.now();
    const replay = deriveCoreEcologyBreadthResidentSet({
      seed: SEED,
      regions: [SALTMARSH_REGION],
      tick: TICK,
    });
    const replayDerivationMs = performance.now() - replayStarted;
    expect(stableStringify(replay)).toBe(stableStringify(breadth));
    expect(breadth.activeThroughEpoch).toBe(3);
    expect(breadth.residents.some(({ cohortId }) => (
      cohortId === CORE_ECOLOGY_SALTMARSH_SMALL_WORLDS_COHORT_ID
    ))).toBe(true);

    const v6Started = performance.now();
    const state = createFinalCatalogState();
    const v6ConstructionMs = performance.now() - v6Started;
    const sources = regionalEcologyStateV6ActiveSourcePatches(state);
    if (sources === null) throw new Error("Wave-G closure lost composite source custody");
    const window = runtimeWindowAtClosingActor(sources);
    const capPressureSources = [
      ...sources,
      ...createCapPressureSources(closingActorPosition(sources)),
    ];

    const materializationStarted = performance.now();
    const direct = setRegionalEcologyMaterializationForWindow(
      capPressureSources,
      window,
      state.updatedAtTick,
    );
    const reversed = setRegionalEcologyMaterializationForWindow(
      [...capPressureSources].reverse(),
      window,
      state.updatedAtTick,
    );
    const materializationMs = performance.now() - materializationStarted;
    if (direct === null || reversed === null) {
      throw new Error("Wave-G closure global materialization failed closed");
    }
    expect(stableStringify(reversed)).toBe(stableStringify(direct));

    const patches = direct.map(({ patch }) => patch);
    const materializedActors = patches.flatMap(({ populations }) => (
      populations.flatMap(({ members }) => members)
    )).filter(({ materialization }) => materialization === "materialized");
    const addressableActors = patches.reduce((sum, patch) => (
      sum + patch.populations.reduce(
        (populationSum, population) => populationSum + population.members.length,
        0,
      )
    ), 0);
    const aggregatePopulationCount = patches.reduce(
      (sum, patch) => sum + patch.aggregatePopulations.length,
      0,
    );
    const groupCount = patches.reduce(
      (sum, patch) => sum + patch.groups.groups.length,
      0,
    );
    expect(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS).toBe(24);
    expect(materializedActors).toHaveLength(24);
    expect(addressableActors).toBeGreaterThan(24);
    expect(aggregatePopulationCount).toBeGreaterThan(0);
    expect(groupCount).toBeGreaterThan(0);
    expect(aggregatePopulationCount).toBeLessThanOrEqual(
      patches.length * CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS,
    );
    expect(groupCount).toBeLessThanOrEqual(
      patches.length * CORE_ECOLOGY_GROUP_MAX_GROUPS,
    );
    for (const patch of patches) {
      expect(patch.populations.length).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_POPULATIONS);
      for (const group of patch.groups.groups) {
        const population = patch.populations.find(({ populationKey, species }) => (
          populationKey === group.identity.populationKey
          && species === group.identity.species
        ));
        const selected = population?.members.filter(({ populationOrdinal, materialization }) => (
          group.memberOrdinals.includes(populationOrdinal)
          && materialization === "materialized"
        )).length ?? 0;
        expect(selected === 0 || selected === group.memberOrdinals.length).toBe(true);
      }
    }
    const closingPatch = patches.find((patch) => (
      patch.aggregatePopulations.some(({ species }) => (
        species === "eastern-saltmarsh-mosquito"
      ))
    ));
    expect(closingPatch?.aggregatePopulations.map(({ species }) => species).sort())
      .toEqual(["eastern-saltmarsh-mosquito", "marsh-periwinkle"]);
    expect(closingPatch?.groups.groups.map(({ identity }) => identity.species))
      .toEqual(["seaside-sparrow"]);
    expect(closingPatch?.populations.find(({ species }) => (
      species === "diamondback-terrapin"
    ))?.members).toHaveLength(1);

    const saveStarted = performance.now();
    const serialized = serializeRegionalEcologyStateV6(state);
    const restored = deserializeRegionalEcologyStateV6(serialized);
    const saveRoundTripMs = performance.now() - saveStarted;
    const saveBytes = UTF8_ENCODER.encode(serialized).byteLength;
    expect(restored).not.toBeNull();
    expect(stableStringify(restored)).toBe(stableStringify(state));
    expect(saveBytes).toBeLessThan(CANDIDATE_V6_SAVE_BUDGET_BYTES);
    expect(saveBytes).toBeLessThan(REGIONAL_ECOLOGY_STATE_V6_MAX_SERIALIZED_BYTES);
    expect(firstDerivationMs).toBeLessThan(COLD_BREADTH_DERIVATION_BUDGET_MS);
    expect(replayDerivationMs).toBeLessThan(COLD_BREADTH_DERIVATION_BUDGET_MS);
    expect(v6ConstructionMs).toBeLessThan(V6_CONSTRUCTION_BUDGET_MS);
    expect(materializationMs).toBeLessThan(GLOBAL_MATERIALIZATION_BUDGET_MS);
    expect(saveRoundTripMs).toBeLessThan(SAVE_ROUND_TRIP_BUDGET_MS);

    console.info("[wave-g-biodiversity-performance]", JSON.stringify({
      ownerId: WAVE_G_BIODIVERSITY_PERFORMANCE_OWNER_ID,
      wildlifeProfiles: CORE_WILDLIFE_SPECIES.length,
      livingModules: LIVING_SPECIES_CATALOG.modules.length,
      breadthSources: breadth.residents.length,
      compositeSources: sources.length,
      capPressureSources: capPressureSources.length,
      addressableActors,
      materializedActors: materializedActors.length,
      aggregatePopulationCount,
      groupCount,
      firstDerivationMs: rounded(firstDerivationMs),
      replayDerivationMs: rounded(replayDerivationMs),
      v6ConstructionMs: rounded(v6ConstructionMs),
      materializationMs: rounded(materializationMs),
      saveRoundTripMs: rounded(saveRoundTripMs),
      saveBytes,
    }));
  }, 100_000);
});

describe(`${WAVE_G_BIODIVERSITY_SEAMLESS_CROSSING_OWNER_ID} representative shared persistence`, () => {
  it("keeps one final-cohort terrapin physical across an adjacent negative-region seam", () => {
    const habitat = deriveCoreEcologyBreadthHabitat({
      seed: SEED,
      region: SALTMARSH_REGION,
      cohortId: CORE_ECOLOGY_SALTMARSH_SMALL_WORLDS_COHORT_ID,
    });
    const patch = createCoreEcologyBreadthResidentPatch({
      seed: SEED,
      habitat,
      tick: TICK,
    });
    const terrapin = patch.populations.find(({ species }) => (
      species === "diamondback-terrapin"
    ))?.members[0]?.actor;
    if (terrapin === undefined) {
      throw new Error("Wave-G seamless fixture lost its final-cohort terrapin");
    }
    const crossedPosition = translateWorldPosition(
      terrapin.address.position,
      REGION_WIDTH_UNITS - terrapin.address.position.localX + 10,
      0,
    );
    const destination = createRegionCoord(SALTMARSH_REGION.x + 1, SALTMARSH_REGION.y);
    expect(crossedPosition).toMatchObject({
      region: destination,
      localX: 10,
      localY: terrapin.address.position.localY,
    });
    const crossed = repositionCoreWildlifeActor(terrapin, {
      atTick: TICK,
      position: crossedPosition,
      heading: terrapin.address.heading,
    });
    const movedPatch = replaceCoreEcologyAggregatePatchActor(patch, crossed);
    const root = createPristineRegionalBreadthEcologyRoot({
      rootSeed: SEED,
      completedTick: TICK,
    });
    const stored = putRegionalBreadthEcologyResidentDeviation(root, {
      rootSeed: SEED,
      patch: movedPatch,
    });
    expect(stored.regions).toHaveLength(1);
    expect(stored.regions[0]?.region).toEqual(SALTMARSH_REGION);
    expect(stored.regions[0]?.residentPatch.originRegion).toEqual(SALTMARSH_REGION);

    const saved = serializeRegionalBreadthEcologyRoot(stored);
    expect(UTF8_ENCODER.encode(saved).byteLength)
      .toBeLessThan(REGIONAL_BREADTH_ECOLOGY_MAX_SERIALIZED_BYTES);
    const restored = deserializeRegionalBreadthEcologyRoot(saved);
    if (restored === null) throw new Error("Wave-G seamless root did not reload");

    const atDestination = regionalBreadthEcologyResidentsForActiveRegions(
      restored,
      SEED,
      [destination],
    );
    if (atDestination === null) {
      throw new Error("Wave-G seamless destination projection failed closed");
    }
    expect(actorOccurrences(atDestination, crossed.identity.stableId)).toBe(1);
    expect(findActor(atDestination, crossed.identity.stableId)?.address.position)
      .toEqual(crossedPosition);

    // Leave the seam entirely, advance dormant world time, save while away,
    // then return. Physical residence—not the camera or origin owner—finds it.
    const whileAway = regionalBreadthEcologyResidentsForActiveRegions(
      restored,
      SEED,
      [AWAY_REGION],
    );
    if (whileAway === null) throw new Error("Wave-G seamless unload failed closed");
    expect(actorOccurrences(whileAway, crossed.identity.stableId)).toBe(0);
    const advanced = advanceRegionalBreadthEcologyRoot(restored, 77);
    const reloadedAway = deserializeRegionalBreadthEcologyRoot(
      serializeRegionalBreadthEcologyRoot(advanced),
    );
    if (reloadedAway === null) throw new Error("Wave-G seamless away-save did not reload");
    const returned = regionalBreadthEcologyResidentsForActiveRegions(
      reloadedAway,
      SEED,
      [destination],
    );
    if (returned === null) throw new Error("Wave-G seamless return failed closed");
    expect(actorOccurrences(returned, crossed.identity.stableId)).toBe(1);
    expect(findActor(returned, crossed.identity.stableId)).toMatchObject({
      identity: { stableId: crossed.identity.stableId, species: "diamondback-terrapin" },
      address: { position: crossedPosition },
    });

    const bothSides = regionalBreadthEcologyResidentsForActiveRegions(
      reloadedAway,
      SEED,
      [SALTMARSH_REGION, destination],
    );
    if (bothSides === null) throw new Error("Wave-G seamless two-region view failed closed");
    expect(actorOccurrences(bothSides, crossed.identity.stableId)).toBe(1);
    expect(reloadedAway.regions).toHaveLength(1);
    expect(reloadedAway.regions[0]?.residentPatch.populations.flatMap(
      ({ members }) => members,
    ).find(({ actor }) => actor.identity.stableId === crossed.identity.stableId)
      ?.actor.address.position).toEqual(crossedPosition);
  }, 30_000);
});

function createFinalCatalogState() {
  const terrain = generateRegionTerrain(SEED, HOME_REGION);
  const halfTile = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
  let homeHabitat: ReturnType<typeof deriveCoreEcologyRegionalPredatorHabitatAssemblage>
    | null = null;
  for (let y = 8; y < WORLD_HEIGHT - 8 && homeHabitat === null; y += 16) {
    for (let x = 8; x < WORLD_WIDTH - 8; x += 16) {
      try {
        homeHabitat = deriveCoreEcologyRegionalPredatorHabitatAssemblage({
          rootSeed: SEED,
          originRegion: HOME_REGION,
          terrain,
          domesticAnchor: {
            anchorId: `wave-g:closure:home:${HOME_REGION.x}:${HOME_REGION.y}`,
            species: "domestic-chicken",
            position: {
              region: HOME_REGION,
              localX: x * WORLD_POSITION_UNITS_PER_TILE + halfTile,
              localY: y * WORLD_POSITION_UNITS_PER_TILE + halfTile,
            },
            radiusTiles: 8,
          },
        });
        break;
      } catch {
        // Deterministically search valid terrain for the compatibility home.
      }
    }
  }
  if (homeHabitat === null) throw new Error("Wave-G closure could not place its home");
  const home = createCoreEcologySettlementHomePatch({
    seed: SEED,
    habitat: homeHabitat,
    tick: TICK,
  });
  const root = createPristineRegionalEcologyRoot({
    rootSeed: SEED,
    completedTick: TICK,
  });
  const regional = regionalEcologyRegionalResidentsForActiveRegions(
    root,
    SEED,
    [SALTMARSH_REGION],
  );
  if (regional === null) throw new Error("Wave-G closure base residents failed");
  const v1 = createRegionalEcologyState({
    root,
    settlementHome: { sourceKey: home.patchKey, patch: home },
    activeRegions: [SALTMARSH_REGION],
    activeResidents: regional,
  });
  const v4 = createFreshRegionalEcologyStateV4(
    createFreshRegionalEcologyStateV3(
      createFreshRegionalEcologyStateV2(v1, SEED),
      SEED,
    ),
    SEED,
  );
  return createFreshRegionalEcologyStateV6(
    createFreshRegionalEcologyStateV5(v4, SEED),
    SEED,
  );
}

function runtimeWindowAtClosingActor(
  sources: readonly Readonly<{ sourceKey: string; patch: CoreEcologyAggregatePatchState }>[],
): CoreEcologyRuntimeWindow {
  const position = closingActorPosition(sources);
  const tile = regionLocalToGlobalTile(
    position.region,
    Math.trunc(position.localX / WORLD_POSITION_UNITS_PER_TILE),
    Math.trunc(position.localY / WORLD_POSITION_UNITS_PER_TILE),
  );
  return Object.freeze({
    origin: Object.freeze({
      x: tile.x - Math.trunc(REGIONAL_TRAVEL_COLUMNS / 2),
      y: tile.y - Math.trunc(REGIONAL_TRAVEL_ROWS / 2),
    }),
    terrain: Object.freeze({
      width: REGIONAL_TRAVEL_COLUMNS,
      height: REGIONAL_TRAVEL_ROWS,
    }),
  });
}

function closingActorPosition(
  sources: readonly Readonly<{ sourceKey: string; patch: CoreEcologyAggregatePatchState }>[],
) {
  const actor = sources.flatMap(({ patch }) => (
    patch.populations.flatMap(({ members }) => members.map(({ actor }) => actor))
  )).find(({ identity }) => identity.species === "diamondback-terrapin");
  if (actor === undefined) throw new Error("Wave-G closure lost its window anchor");
  return actor.address.position;
}

/**
 * Generic cap pressure, not another species fixture: two ordinary shared
 * patches place 32 addressable bodies inside one runtime window so the
 * regional owner must exercise (rather than merely state) its global top-K.
 */
function createCapPressureSources(anchor: ReturnType<typeof closingActorPosition>) {
  return Object.freeze(Array.from({ length: 2 }, (_, sourceOrdinal) => {
    const patchKey = `wave-g:closure:cap-pressure:${sourceOrdinal}`;
    const patch = createCoreEcologyAggregatePatch({
      seed: SEED,
      patchKey,
      originRegion: SALTMARSH_REGION,
      tick: TICK,
      derivation: { kind: "bounded-input-v1" },
      populations: [{
        species: "deer",
        populationKey: `wave-g-cap-${sourceOrdinal}`,
        populationSize: 16,
        members: Array.from({ length: 16 }, (_, ordinal) => ({
          populationOrdinal: ordinal,
          representedUnits: 1,
          position: translateWorldPosition(
            anchor,
            (sourceOrdinal * 16 + ordinal + 1) * 100,
            (ordinal % 4) * 100,
          ),
          materialization: "coarse" as const,
        })),
      }],
    });
    return Object.freeze({ sourceKey: patchKey, patch });
  }));
}

type BreadthResidents = NonNullable<ReturnType<
  typeof regionalBreadthEcologyResidentsForActiveRegions
>>;

function actorOccurrences(residents: BreadthResidents, stableId: string): number {
  return residents.reduce((sum, { patch }) => (
    sum + patch.populations.reduce((populationSum, population) => (
      populationSum + population.members.filter(
        ({ actor }) => actor.identity.stableId === stableId,
      ).length
    ), 0)
  ), 0);
}

function findActor(residents: BreadthResidents, stableId: string) {
  return residents.flatMap(({ patch }) => (
    patch.populations.flatMap(({ members }) => members.map(({ actor }) => actor))
  )).find(({ identity }) => identity.stableId === stableId);
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

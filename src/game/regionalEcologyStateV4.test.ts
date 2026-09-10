import { describe, expect, it } from "vitest";

import { generateRegionTerrain } from "../sim/regionTerrain";
import {
  REGION_COORD_LIMIT,
  createRegionCoord,
  regionLocalToGlobalTile,
} from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { hashCanonical, stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  replaceCoreEcologyAggregatePatchActor,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import { deriveCoreEcologyColdShoreHabitat } from "./coreEcologyColdShoreHabitat";
import type { CoreEcologyRuntimeWindow } from "./coreEcologyRuntime";
import { deriveCoreEcologyRegionalPredatorHabitatAssemblage } from "./coreEcologyHabitat";
import { createCoreEcologySettlementHomePatch } from "./coreEcologySettlementHome";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  repositionCoreWildlifeActor,
} from "./coreWildlifeActor";
import {
  advanceRegionalEcologyRoot,
  createPristineRegionalEcologyRoot,
} from "./regionalEcology";
import {
  createRegionalEcologyState,
  regionalEcologyRegionalResidentsForActiveRegions,
} from "./regionalEcologyState";
import { createFreshRegionalEcologyStateV2 } from "./regionalEcologyStateV2";
import {
  REGIONAL_ECOLOGY_STATE_V3_MAX_SERIALIZED_BYTES,
  createFreshRegionalEcologyStateV3,
  type RegionalEcologyStateV3,
} from "./regionalEcologyStateV3";
import {
  REGIONAL_ECOLOGY_STATE_V4_MAX_SERIALIZED_BYTES,
  bindRegionalEcologyStateV4ActiveProjection,
  canonicalRegionalEcologyStateV4ForWorld,
  canonicalizeRegionalEcologyStateV4,
  commitRegionalEcologyStateV4ActiveProjection,
  createFreshRegionalEcologyStateV4,
  deserializeRegionalEcologyStateV4,
  migrateRegionalEcologyStateV3ToV4,
  projectRegionalEcologyStateV4ActiveState,
  regionalEcologyStateV4ActiveSourcePatches,
  regionalEcologyStateV4SourceOwnership,
  replaceRegionalEcologyStateV4ActiveState,
  serializeRegionalEcologyStateV4,
  type CommitRegionalEcologyStateV4ActiveProjectionInput,
  type RegionalEcologyStateV4,
  type RegionalEcologyStateV4ActiveProjection,
} from "./regionalEcologyStateV4";
import {
  REGIONAL_COLD_SHORE_ECOLOGY_MAX_SERIALIZED_BYTES,
} from "./regionalColdShoreEcology";
import { reconcileCoreEcologyPolarShoreResidentPatchAtTick } from "./regionalPolarShoreResidents";
import { setRegionalEcologyMaterializationForWindow } from "./regionalEcologyRuntime";
import { REGIONAL_TRAVEL_COLUMNS, REGIONAL_TRAVEL_ROWS } from "./regionalTravel";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  translateWorldPosition,
} from "./worldPosition";

export const ALPHA35_COLD_SHORE_COMPOSITE_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha35-cold-shore-composite-shared-invariants:v1" as const;
export const ALPHA35_COLD_SHORE_COMPOSITE_PERFORMANCE_OWNER_INTENT =
  "test:alpha35-cold-shore-composite-performance:v1" as const;

const SEED = seedFromText("polar habitat fuzz 29");
const COLD_REGION = createRegionCoord(-1_653, 664);
const TICK = 19;

function homeHabitatAt(region: ReturnType<typeof createRegionCoord>) {
  const terrain = generateRegionTerrain(SEED, region);
  const halfTile = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
  for (let y = 8; y < WORLD_HEIGHT - 8; y += 16) {
    for (let x = 8; x < WORLD_WIDTH - 8; x += 16) {
      const domesticAnchor = {
        anchorId: `wave-f:v4:home:${region.x}:${region.y}:${hashCanonical(SEED)}`,
        species: "domestic-chicken" as const,
        position: createWorldPosition(
          region,
          x * WORLD_POSITION_UNITS_PER_TILE + halfTile,
          y * WORLD_POSITION_UNITS_PER_TILE + halfTile,
        ),
        radiusTiles: 8,
      };
      try {
        return deriveCoreEcologyRegionalPredatorHabitatAssemblage({
          rootSeed: SEED,
          originRegion: region,
          terrain,
          domesticAnchor,
        });
      } catch {
        // Search stable terrain anchors until the shared home contract admits one.
      }
    }
  }
  throw new Error("Wave-F cold-shore composite fixture could not place a home");
}

type Fixture = Readonly<{
  readonly homeHabitat: ReturnType<typeof homeHabitatAt>;
  readonly v3: RegionalEcologyStateV3;
}>;

let cachedFixture: Fixture | null = null;

function fixture(): Fixture {
  if (cachedFixture !== null) return cachedFixture;
  const cold = deriveCoreEcologyColdShoreHabitat({
    seed: SEED,
    region: COLD_REGION,
  });
  if (cold.totalPopulationUnits !== 1) {
    throw new Error("Wave-F cold-shore fixture does not admit its solitary actor");
  }
  const homeHabitat = homeHabitatAt(COLD_REGION);
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
    [COLD_REGION],
  );
  if (regional === null) throw new Error("Wave-F cold-shore base residents failed");
  const v1 = createRegionalEcologyState({
    root,
    settlementHome: { sourceKey: home.patchKey, patch: home },
    activeRegions: [COLD_REGION],
    activeResidents: regional,
  });
  const v2 = createFreshRegionalEcologyStateV2(v1, SEED);
  const v3 = createFreshRegionalEcologyStateV3(v2, SEED);
  cachedFixture = Object.freeze({ homeHabitat, v3 });
  return cachedFixture;
}

function coldActor(state: RegionalEcologyStateV4) {
  const actor = state.coldShoreActiveResidents[0]
    ?.patch.populations[0]
    ?.members[0]
    ?.actor;
  if (actor === undefined) throw new Error("Cold-shore fixture lost its actor");
  return actor;
}

function windowAtColdActor(state: RegionalEcologyStateV4): CoreEcologyRuntimeWindow {
  const position = coldActor(state).address.position;
  const actorTile = regionLocalToGlobalTile(
    position.region,
    Math.trunc(position.localX / WORLD_POSITION_UNITS_PER_TILE),
    Math.trunc(position.localY / WORLD_POSITION_UNITS_PER_TILE),
  );
  return Object.freeze({
    origin: Object.freeze({
      x: actorTile.x - Math.trunc(REGIONAL_TRAVEL_COLUMNS / 2),
      y: actorTile.y - Math.trunc(REGIONAL_TRAVEL_ROWS / 2),
    }),
    terrain: Object.freeze({
      width: REGIONAL_TRAVEL_COLUMNS,
      height: REGIONAL_TRAVEL_ROWS,
    }),
  });
}

function projectionOf(
  state: RegionalEcologyStateV4,
): RegionalEcologyStateV4ActiveProjection {
  const projection = projectRegionalEcologyStateV4ActiveState(
    state,
    windowAtColdActor(state),
  );
  if (projection === null) throw new Error("Cold-shore composite projection failed");
  return projection;
}

function allProjectedPatches(
  projection: RegionalEcologyStateV4ActiveProjection,
): readonly CoreEcologyAggregatePatchState[] {
  return [
    ...projection.base.base.base.residents.map(({ patch }) => patch),
    ...projection.base.base.alpineResidents.map(({ patch }) => patch),
    ...projection.base.polarShoreResidents.map(({ patch }) => patch),
    ...projection.coldShoreResidents.map(({ patch }) => patch),
  ];
}

function materializedCount(
  patches: readonly CoreEcologyAggregatePatchState[],
): number {
  return patches.reduce((sum, patch) => sum + patch.populations.reduce(
    (populationSum, population) => populationSum + population.members.filter(
      ({ materialization }) => materialization === "materialized",
    ).length,
    0,
  ), 0);
}

function advanceProjectedPatchWithoutAction(
  patch: CoreEcologyAggregatePatchState,
  tick: number,
) {
  const result = stepCoreEcologyAggregatePatch(patch, {
    tick,
    actorSteps: patch.populations.flatMap(({ members }) => members
      .filter(({ materialization }) => materialization === "materialized")
      .map(({ actor }) => ({
        actorId: actor.identity.stableId,
        observations: [],
        foodOpportunities: [],
        accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      }))),
  });
  if (result === null) throw new Error("Cold-shore no-action step failed");
  return Object.freeze({ sourceKey: result.patch.patchKey, patch: result.patch });
}

function unchangedCommitInput(
  state: RegionalEcologyStateV4,
  projection: RegionalEcologyStateV4ActiveProjection,
): CommitRegionalEcologyStateV4ActiveProjectionInput {
  return {
    base: {
      base: {
        base: {
          root: state.base.base.base.root,
          rootSeed: SEED,
          settlementHome: null,
          residents: projection.base.base.base.residents.map(({ sourceKey, patch }) => ({
            sourceKey,
            patch,
          })),
        },
        alpineResidents: projection.base.base.alpineResidents.map(({ sourceKey, patch }) => ({
          sourceKey,
          patch,
        })),
      },
      polarShoreResidents: projection.base.polarShoreResidents.map(({ sourceKey, patch }) => ({
        sourceKey,
        patch,
      })),
    },
    coldShoreResidents: projection.coldShoreResidents.map(({ sourceKey, patch }) => ({
      sourceKey,
      patch,
    })),
  };
}

function advancedBaseWithStaleColdInput(
  state: RegionalEcologyStateV4,
  projection: RegionalEcologyStateV4ActiveProjection,
): CommitRegionalEcologyStateV4ActiveProjectionInput {
  const nextTick = state.updatedAtTick + 1;
  return {
    base: {
      base: {
        base: {
          root: advanceRegionalEcologyRoot(state.base.base.base.root, nextTick),
          rootSeed: SEED,
          settlementHome: null,
          residents: projection.base.base.base.residents.map(({ patch }) => (
            advanceProjectedPatchWithoutAction(patch, nextTick)
          )),
        },
        alpineResidents: projection.base.base.alpineResidents.map(({ patch }) => (
          advanceProjectedPatchWithoutAction(patch, nextTick)
        )),
      },
      polarShoreResidents: projection.base.polarShoreResidents.map(({ patch }) => {
        const next = reconcileCoreEcologyPolarShoreResidentPatchAtTick(patch, nextTick);
        if (next === null) throw new Error("Cold-shore fixture lost polar tide authority");
        return Object.freeze({ sourceKey: next.patchKey, patch: next });
      }),
    },
    // This is deliberately still at the old tick. V3 succeeds first; V4 must
    // reject the sibling without exposing the child's otherwise valid result.
    coldShoreResidents: projection.coldShoreResidents.map(({ sourceKey, patch }) => ({
      sourceKey,
      patch,
    })),
  };
}

function replaceActiveRegion(
  state: RegionalEcologyStateV4,
  region: ReturnType<typeof createRegionCoord>,
): RegionalEcologyStateV4 {
  const regional = regionalEcologyRegionalResidentsForActiveRegions(
    state.base.base.base.root,
    SEED,
    [region],
  );
  if (regional === null) throw new Error("Replacement regional residents failed");
  return replaceRegionalEcologyStateV4ActiveState(state, {
    expectedIntegrity: state.integrity,
    base: {
      expectedIntegrity: state.base.integrity,
      base: {
        expectedIntegrity: state.base.base.integrity,
        base: {
          expectedIntegrity: state.base.base.base.integrity,
          rootSeed: SEED,
          root: state.base.base.base.root,
          settlementHome: {
            sourceKey: state.base.base.base.settlementHome.sourceKey,
            patch: state.base.base.base.settlementHome.patch,
          },
          activeRegions: [region],
          activeResidents: regional,
        },
      },
    },
  });
}

describe(`${ALPHA35_COLD_SHORE_COMPOSITE_SHARED_INVARIANTS_OWNER_INTENT} regional ecology v4`, () => {
  it(`${ALPHA35_COLD_SHORE_COMPOSITE_PERFORMANCE_OWNER_INTENT} fixed/keyed wrapping preserves the exact v3 child and one bounded sparse sibling`, () => {
    const { homeHabitat, v3 } = fixture();
    const original = stableStringify(v3);
    const fresh = createFreshRegionalEcologyStateV4(v3, SEED);
    const sourceEnvelopeIntegrity = hashCanonical("authenticated outer v27 fixture");
    const migrated = migrateRegionalEcologyStateV3ToV4(v3, {
      rootSeed: SEED,
      sourceEnvelopeIntegrity,
    });
    const replay = migrateRegionalEcologyStateV3ToV4(v3, {
      rootSeed: SEED,
      sourceEnvelopeIntegrity,
    });
    const differentlyKeyedReceipt = migrateRegionalEcologyStateV3ToV4(v3, {
      rootSeed: SEED,
      sourceEnvelopeIntegrity: hashCanonical("another authenticated v27 envelope"),
    });

    expect(fresh.base).toBe(v3);
    expect(migrated.base).toBe(v3);
    expect(stableStringify(migrated.base)).toBe(original);
    expect(fresh.adoption).toBeNull();
    expect(migrated.adoption?.sourceOuterVersion).toBe(27);
    expect(migrated.adoption?.sourceEnvelopeIntegrity).toBe(sourceEnvelopeIntegrity);
    expect(migrated.adoption?.transactionId)
      .not.toBe(differentlyKeyedReceipt.adoption?.transactionId);
    expect(stableStringify(replay)).toBe(stableStringify(migrated));
    expect(migrated.coldShoreRoot.regions).toEqual([]);
    expect(migrated.coldShoreActiveResidents).toHaveLength(1);
    expect(migrated.coldShoreActiveResidents[0]?.patch.populations[0]?.species)
      .toBe("arctic-fox");
    expect(migrated.coldShoreActiveResidents[0]?.patch.populations[0]?.members)
      .toHaveLength(1);
    expect(Number.isSafeInteger(coldActor(migrated).address.position.localX)).toBe(true);
    expect(Number.isSafeInteger(coldActor(migrated).address.position.localY)).toBe(true);
    expect(canonicalRegionalEcologyStateV4ForWorld(migrated, {
      rootSeed: SEED,
      completedTick: TICK,
      settlementHomeHabitat: homeHabitat,
    })).toBe(migrated);

    const serialized = serializeRegionalEcologyStateV4(migrated);
    expect(new TextEncoder().encode(serialized).byteLength)
      .toBeLessThan(REGIONAL_ECOLOGY_STATE_V4_MAX_SERIALIZED_BYTES);
    expect(REGIONAL_ECOLOGY_STATE_V4_MAX_SERIALIZED_BYTES).toBeGreaterThan(
      REGIONAL_ECOLOGY_STATE_V3_MAX_SERIALIZED_BYTES
        + REGIONAL_COLD_SHORE_ECOLOGY_MAX_SERIALIZED_BYTES,
    );
    expect(stableStringify(deserializeRegionalEcologyStateV4(serialized)))
      .toBe(stableStringify(migrated));
    expect(() => createFreshRegionalEcologyStateV4(
      v3,
      seedFromText("foreign cold-shore world"),
    )).toThrow(/one clock/u);
  });

  it("uses one permutation-independent group-atomic global 24-actor plan", () => {
    const state = createFreshRegionalEcologyStateV4(fixture().v3, SEED);
    const sources = regionalEcologyStateV4ActiveSourcePatches(state);
    if (sources === null) throw new Error("Cold-shore active sources failed");
    const window = windowAtColdActor(state);
    const direct = setRegionalEcologyMaterializationForWindow(
      sources,
      window,
      state.updatedAtTick,
    );
    const reversed = setRegionalEcologyMaterializationForWindow(
      [...sources].reverse(),
      window,
      state.updatedAtTick,
    );
    if (direct === null || reversed === null) {
      throw new Error("Cold-shore global materialization failed");
    }
    const projection = projectionOf(state);
    const rebound = bindRegionalEcologyStateV4ActiveProjection(
      state,
      [...direct].reverse(),
    );
    const split = [
      ...projection.base.base.base.residents.map(({ sourceKey, patch }) => ({
        sourceKey,
        patch,
      })),
      ...projection.base.base.alpineResidents.map(({ sourceKey, patch }) => ({
        sourceKey,
        patch,
      })),
      ...projection.base.polarShoreResidents.map(({ sourceKey, patch }) => ({
        sourceKey,
        patch,
      })),
      ...projection.coldShoreResidents.map(({ sourceKey, patch }) => ({
        sourceKey,
        patch,
      })),
    ].sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));

    expect(stableStringify(reversed)).toBe(stableStringify(direct));
    expect(stableStringify(split)).toBe(stableStringify(direct));
    expect(stableStringify(rebound)).toBe(stableStringify(projection));
    expect(materializedCount(allProjectedPatches(projection)))
      .toBeLessThanOrEqual(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);
    expect(projection.coldShoreResidents).toHaveLength(1);
    expect(projection.coldShoreResidents[0]
      ?.patch.populations[0]
      ?.members[0]
      ?.materialization).toBe("materialized");
    for (const patch of allProjectedPatches(projection)) {
      for (const group of patch.groups.groups) {
        const population = patch.populations.find(({ populationKey, species }) => (
          populationKey === group.identity.populationKey
          && species === group.identity.species
        ));
        const selected = population?.members.filter(({
          populationOrdinal,
          materialization,
        }) => (
          group.memberOrdinals.includes(populationOrdinal)
          && materialization === "materialized"
        )).length ?? 0;
        expect(selected === 0 || selected === group.memberOrdinals.length).toBe(true);
      }
    }
  });

  it("commits movement as a sparse deviation and fails atomically after a valid child advance", () => {
    const state = migrateRegionalEcologyStateV3ToV4(fixture().v3, {
      rootSeed: SEED,
      sourceEnvelopeIntegrity: hashCanonical("v27 cold-shore atomic fixture"),
    });
    const projection = projectionOf(state);
    const before = stableStringify(state);
    expect(commitRegionalEcologyStateV4ActiveProjection(
      state,
      projection,
      advancedBaseWithStaleColdInput(state, projection),
    )).toBeNull();
    expect(stableStringify(state)).toBe(before);

    const source = projection.coldShoreResidents[0];
    const actor = source?.patch.populations[0]?.members[0]?.actor;
    if (source === undefined || actor === undefined) {
      throw new Error("Cold-shore projection lost its materialized actor");
    }
    const movedActor = repositionCoreWildlifeActor(actor, {
      atTick: projection.atTick,
      position: translateWorldPosition(actor.address.position, 1, 0),
      heading: actor.address.heading,
    });
    const movedPatch = replaceCoreEcologyAggregatePatchActor(
      source.patch,
      movedActor,
    );
    const input = unchangedCommitInput(state, projection);
    const committed = commitRegionalEcologyStateV4ActiveProjection(
      state,
      projection,
      {
        ...input,
        coldShoreResidents: [{ sourceKey: source.sourceKey, patch: movedPatch }],
      },
    );
    expect(committed).not.toBeNull();
    expect(committed?.coldShoreRoot.regions).toHaveLength(1);
    expect(coldActor(committed!).address.position).toEqual(movedActor.address.position);
    expect(committed?.adoption?.transactionId).toBe(state.adoption?.transactionId);

    const serialized = serializeRegionalEcologyStateV4(committed);
    const reloaded = deserializeRegionalEcologyStateV4(serialized);
    expect(stableStringify(reloaded)).toBe(stableStringify(committed));
    expect(canonicalRegionalEcologyStateV4ForWorld(reloaded, {
      rootSeed: SEED,
      completedTick: TICK,
      settlementHomeHabitat: fixture().homeHabitat,
    })).not.toBeNull();

    const departed = replaceActiveRegion(
      committed!,
      createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
    );
    const returned = replaceActiveRegion(departed, COLD_REGION);
    expect(coldActor(returned).address.position).toEqual(movedActor.address.position);
    expect(returned.coldShoreRoot.regions).toHaveLength(1);
  });

  it("rederives honest cold-shore snapshots across signed extreme-coordinate windows", () => {
    const state = createFreshRegionalEcologyStateV4(fixture().v3, SEED);
    for (const region of [
      createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
      createRegionCoord(REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
    ]) {
      const moved = replaceActiveRegion(state, region);
      const replay = replaceActiveRegion(state, region);
      expect(stableStringify(replay)).toBe(stableStringify(moved));
      expect(moved.base.base.base.activeRegions).toEqual([region]);
      expect(canonicalizeRegionalEcologyStateV4(moved)).toBe(moved);
      expect(moved.coldShoreActiveResidents.every(({ region: origin, patch }) => (
        origin.x === patch.originRegion.x && origin.y === patch.originRegion.y
      ))).toBe(true);
    }
  });

  it("rejects forged children, receipts, snapshots, projections, and ownership overlap", () => {
    const state = migrateRegionalEcologyStateV3ToV4(fixture().v3, {
      rootSeed: SEED,
      sourceEnvelopeIntegrity: hashCanonical("v27 cold-shore forgery fixture"),
    });
    const ownership = regionalEcologyStateV4SourceOwnership(state);
    if (ownership === null) throw new Error("Cold-shore ownership manifest failed");
    const allIds = ownership.flatMap((entry) => [
      entry.sourceKey,
      ...entry.populationKeys,
      ...entry.actorIds,
      ...entry.groupIds,
      ...entry.aggregateIds,
      ...entry.mortalityIds,
      ...entry.bodyIds,
    ]);
    expect(new Set(allIds).size).toBe(allIds.length);

    expect(canonicalizeRegionalEcologyStateV4({
      ...state,
      updatedAtTick: state.updatedAtTick + 1,
    })).toBeNull();
    expect(canonicalizeRegionalEcologyStateV4({
      ...state,
      adoption: state.adoption === null ? null : {
        ...state.adoption,
        sourceOuterVersion: 26,
      },
    })).toBeNull();
    const { integrity: _integrity, ...withoutIntegrity } = state;
    const missingSnapshotBase = {
      ...withoutIntegrity,
      coldShoreActiveResidents: [],
    };
    const missingSnapshot = {
      ...missingSnapshotBase,
      integrity: hashCanonical(missingSnapshotBase),
    };
    expect(canonicalRegionalEcologyStateV4ForWorld(missingSnapshot, {
      rootSeed: SEED,
      completedTick: TICK,
      settlementHomeHabitat: fixture().homeHabitat,
    })).toBeNull();

    const sources = regionalEcologyStateV4ActiveSourcePatches(state);
    if (sources === null) throw new Error("Cold-shore tamper sources failed");
    const cold = state.coldShoreActiveResidents[0];
    if (cold === undefined) throw new Error("Cold-shore tamper source absent");
    expect(bindRegionalEcologyStateV4ActiveProjection(
      state,
      sources.filter(({ sourceKey }) => sourceKey !== cold.sourceKey),
    )).toBeNull();
    expect(bindRegionalEcologyStateV4ActiveProjection(state, [
      ...sources,
      sources[0]!,
    ])).toBeNull();

    const projection = projectionOf(state);
    const input = unchangedCommitInput(state, projection);
    expect(commitRegionalEcologyStateV4ActiveProjection(state, {
      ...structuredClone(projection),
      stateIntegrity: hashCanonical("forged v4 projection fence"),
    }, input)).toBeNull();
    expect(deserializeRegionalEcologyStateV4(
      `${serializeRegionalEcologyStateV4(state)}\n`,
    )).toBeNull();
  });
});

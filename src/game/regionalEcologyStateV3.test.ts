import { describe, expect, it } from "vitest";

import { generateRegionTerrain } from "../sim/regionTerrain";
import { REGION_COORD_LIMIT, createRegionCoord, regionLocalToGlobalTile } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { hashCanonical, stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import type { CoreEcologyRuntimeWindow } from "./coreEcologyRuntime";
import { deriveCoreEcologyRegionalPredatorHabitatAssemblage } from "./coreEcologyHabitat";
import { createCoreEcologySettlementHomePatch } from "./coreEcologySettlementHome";
import { CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE } from "./coreWildlifeActor";
import { advanceRegionalEcologyRoot, createPristineRegionalEcologyRoot } from "./regionalEcology";
import {
  createRegionalEcologyState,
  regionalEcologyRegionalResidentsForActiveRegions,
} from "./regionalEcologyState";
import {
  REGIONAL_ECOLOGY_STATE_V2_MAX_SERIALIZED_BYTES,
  createFreshRegionalEcologyStateV2,
  type RegionalEcologyStateV2,
} from "./regionalEcologyStateV2";
import {
  REGIONAL_ECOLOGY_STATE_V3_MAX_SERIALIZED_BYTES,
  bindRegionalEcologyStateV3ActiveProjection,
  canonicalRegionalEcologyStateV3ForWorld,
  canonicalizeRegionalEcologyStateV3,
  commitRegionalEcologyStateV3ActiveProjection,
  createFreshRegionalEcologyStateV3,
  deserializeRegionalEcologyStateV3,
  migrateRegionalEcologyStateV2ToV3,
  projectRegionalEcologyStateV3ActiveState,
  regionalEcologyStateV3ActiveSourcePatches,
  regionalEcologyStateV3SourceOwnership,
  replaceRegionalEcologyStateV3ActiveState,
  serializeRegionalEcologyStateV3,
  type RegionalEcologyStateV3,
  type RegionalEcologyStateV3ActiveProjection,
} from "./regionalEcologyStateV3";
import {
  REGIONAL_POLAR_SHORE_ECOLOGY_MAX_SERIALIZED_BYTES,
} from "./regionalPolarShoreEcology";
import { reconcileCoreEcologyPolarShoreResidentPatchAtTick } from "./regionalPolarShoreResidents";
import { setRegionalEcologyMaterializationForWindow } from "./regionalEcologyRuntime";
import { WORLD_POSITION_UNITS_PER_TILE, createWorldPosition } from "./worldPosition";

export const ALPHA34_POLAR_COMPOSITE_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha34-polar-composite-shared-invariants:v1" as const;
export const ALPHA34_POLAR_COMPOSITE_PERFORMANCE_OWNER_INTENT =
  "test:alpha34-polar-composite-performance:v1" as const;

const SEED = seedFromText("polar habitat fuzz 29");
const POLAR_REGION = createRegionCoord(-1_653, 664);
const TICK = 19;

function homeHabitatAt(region: ReturnType<typeof createRegionCoord>) {
  const terrain = generateRegionTerrain(SEED, region);
  const halfTile = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
  for (let y = 8; y < WORLD_HEIGHT - 8; y += 16) {
    for (let x = 8; x < WORLD_WIDTH - 8; x += 16) {
      const domesticAnchor = {
        anchorId: `wave-f:v3:home:${region.x}:${region.y}:${hashCanonical(SEED)}`,
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
        // Continue through stable terrain anchors until one is lawful.
      }
    }
  }
  throw new Error("Wave-F polar composite fixture could not place a settlement home");
}

type Fixture = Readonly<{
  readonly homeHabitat: ReturnType<typeof homeHabitatAt>;
  readonly v2: RegionalEcologyStateV2;
}>;

let cachedFixture: Fixture | null = null;

function fixture(): Fixture {
  if (cachedFixture !== null) return cachedFixture;
  const homeHabitat = homeHabitatAt(POLAR_REGION);
  const home = createCoreEcologySettlementHomePatch({
    seed: SEED,
    habitat: homeHabitat,
    tick: TICK,
  });
  const root = createPristineRegionalEcologyRoot({ rootSeed: SEED, completedTick: TICK });
  const regional = regionalEcologyRegionalResidentsForActiveRegions(
    root,
    SEED,
    [POLAR_REGION],
  );
  if (regional === null) throw new Error("Wave-F polar base residents failed");
  const v1 = createRegionalEcologyState({
    root,
    settlementHome: { sourceKey: home.patchKey, patch: home },
    activeRegions: [POLAR_REGION],
    activeResidents: regional,
  });
  const v2 = createFreshRegionalEcologyStateV2(v1, SEED);
  cachedFixture = Object.freeze({ homeHabitat, v2 });
  return cachedFixture;
}

function windowAt(region: ReturnType<typeof createRegionCoord>): CoreEcologyRuntimeWindow {
  return Object.freeze({
    origin: regionLocalToGlobalTile(region, 0, 0),
    terrain: Object.freeze({ width: 120, height: 120 }),
  });
}

function projectionOf(state: RegionalEcologyStateV3): RegionalEcologyStateV3ActiveProjection {
  const projection = projectRegionalEcologyStateV3ActiveState(state, windowAt(POLAR_REGION));
  if (projection === null) throw new Error("Wave-F polar composite projection failed");
  return projection;
}

function v2ProjectionPatches(projection: RegionalEcologyStateV3ActiveProjection) {
  return [
    ...projection.base.base.residents.map(({ patch }) => patch),
    ...projection.base.alpineResidents.map(({ patch }) => patch),
  ];
}

function allProjectedPatches(projection: RegionalEcologyStateV3ActiveProjection) {
  return [
    ...v2ProjectionPatches(projection),
    ...projection.polarShoreResidents.map(({ patch }) => patch),
  ];
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
  if (result === null) throw new Error("Wave-F polar composite no-action step failed");
  return Object.freeze({ sourceKey: result.patch.patchKey, patch: result.patch });
}

function materializedCount(patches: readonly CoreEcologyAggregatePatchState[]): number {
  return patches.reduce((sum, patch) => sum + patch.populations.reduce(
    (populationSum, population) => populationSum + population.members.filter(
      ({ materialization }) => materialization === "materialized",
    ).length,
    0,
  ), 0);
}

describe(`${ALPHA34_POLAR_COMPOSITE_SHARED_INVARIANTS_OWNER_INTENT} regional ecology v3`, () => {
  it(`${ALPHA34_POLAR_COMPOSITE_PERFORMANCE_OWNER_INTENT} preserves the exact v2 child and deterministically wraps one bounded polar root`, () => {
    const { homeHabitat, v2 } = fixture();
    const original = stableStringify(v2);
    const fresh = createFreshRegionalEcologyStateV3(v2, SEED);
    const migrated = migrateRegionalEcologyStateV2ToV3(v2, {
      rootSeed: SEED,
      sourceEnvelopeIntegrity: hashCanonical("authenticated outer v26 fixture"),
    });
    const replay = migrateRegionalEcologyStateV2ToV3(v2, {
      rootSeed: SEED,
      sourceEnvelopeIntegrity: hashCanonical("authenticated outer v26 fixture"),
    });

    expect(stableStringify(fresh.base)).toBe(original);
    expect(stableStringify(migrated.base)).toBe(original);
    expect(fresh.adoption).toBeNull();
    expect(migrated.adoption).not.toBeNull();
    expect(migrated.adoption?.sourceOuterVersion).toBe(26);
    expect(stableStringify(replay)).toBe(stableStringify(migrated));
    expect(migrated.polarShoreRoot.regions).toEqual([]);
    expect(migrated.polarShoreActiveResidents).toHaveLength(1);
    expect(migrated.polarShoreActiveResidents[0]?.patch.populations).toEqual([]);
    expect(migrated.polarShoreActiveResidents[0]?.patch.aggregatePopulations[0]?.species)
      .toBe("atlantic-capelin");
    expect(canonicalRegionalEcologyStateV3ForWorld(migrated, {
      rootSeed: SEED,
      completedTick: TICK,
      settlementHomeHabitat: homeHabitat,
    })).toBe(migrated);

    const serialized = serializeRegionalEcologyStateV3(migrated);
    expect(new TextEncoder().encode(serialized).byteLength)
      .toBeLessThan(REGIONAL_ECOLOGY_STATE_V3_MAX_SERIALIZED_BYTES);
    expect(REGIONAL_ECOLOGY_STATE_V3_MAX_SERIALIZED_BYTES).toBeGreaterThan(
      REGIONAL_ECOLOGY_STATE_V2_MAX_SERIALIZED_BYTES
        + REGIONAL_POLAR_SHORE_ECOLOGY_MAX_SERIALIZED_BYTES,
    );
    expect(stableStringify(deserializeRegionalEcologyStateV3(serialized)))
      .toBe(stableStringify(migrated));
    expect(() => createFreshRegionalEcologyStateV3(
      v2,
      seedFromText("foreign polar composite world"),
    )).toThrow(/one clock/u);
  });

  it("uses one insertion-order-independent group-atomic materialization plan while capelin stay non-addressable", () => {
    const state = createFreshRegionalEcologyStateV3(fixture().v2, SEED);
    const sources = regionalEcologyStateV3ActiveSourcePatches(state);
    expect(sources).not.toBeNull();
    const window = windowAt(POLAR_REGION);
    const direct = setRegionalEcologyMaterializationForWindow(
      sources!,
      window,
      state.updatedAtTick,
    );
    const reversed = setRegionalEcologyMaterializationForWindow(
      [...sources!].reverse(),
      window,
      state.updatedAtTick,
    );
    const projection = projectionOf(state);
    const split = [
      ...projection.base.base.residents.map(({ sourceKey, patch }) => ({ sourceKey, patch })),
      ...projection.base.alpineResidents.map(({ sourceKey, patch }) => ({ sourceKey, patch })),
      ...projection.polarShoreResidents.map(({ sourceKey, patch }) => ({ sourceKey, patch })),
    ].sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));

    expect(stableStringify(reversed)).toBe(stableStringify(direct));
    expect(stableStringify(split)).toBe(stableStringify(direct));
    expect(materializedCount(allProjectedPatches(projection)))
      .toBeLessThanOrEqual(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);
    expect(projection.polarShoreResidents).toHaveLength(1);
    expect(projection.polarShoreResidents[0]?.patch.populations).toEqual([]);
    expect(projection.polarShoreResidents[0]?.patch.aggregatePopulations)
      .toEqual(state.polarShoreActiveResidents[0]?.patch.aggregatePopulations);

    for (const patch of allProjectedPatches(projection)) {
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
  });

  it("commits v2 and polar outputs atomically while conserving the aggregate and forbidding mortality", () => {
    const { homeHabitat, v2 } = fixture();
    const state = migrateRegionalEcologyStateV2ToV3(v2, {
      rootSeed: SEED,
      sourceEnvelopeIntegrity: hashCanonical("v26 polar atomic fixture"),
    });
    const projection = projectionOf(state);
    const nextTick = TICK + 1;
    const baseOutputs = projection.base.base.residents.map(({ patch }) => (
      advanceProjectedPatchWithoutAction(patch, nextTick)
    ));
    const alpineOutputs = projection.base.alpineResidents.map(({ patch }) => (
      advanceProjectedPatchWithoutAction(patch, nextTick)
    ));
    const polarOutputs = projection.polarShoreResidents.map(({ patch }) => {
      const next = reconcileCoreEcologyPolarShoreResidentPatchAtTick(patch, nextTick);
      if (next === null) throw new Error("Shared tidal policy rejected polar output");
      return Object.freeze({ sourceKey: next.patchKey, patch: next });
    });
    const before = state.polarShoreActiveResidents[0]!.patch.aggregatePopulations[0]!;
    const baseInput = {
      base: {
        root: advanceRegionalEcologyRoot(state.base.base.root, nextTick),
        rootSeed: SEED,
        settlementHome: null,
        residents: baseOutputs,
      },
      alpineResidents: alpineOutputs,
    };

    expect(commitRegionalEcologyStateV3ActiveProjection(state, projection, {
      base: baseInput,
      polarShoreResidents: [],
    })).toBeNull();
    expect(commitRegionalEcologyStateV3ActiveProjection(state, {
      ...projection,
      stateIntegrity: hashCanonical("stale projection"),
    }, {
      base: baseInput,
      polarShoreResidents: polarOutputs,
    })).toBeNull();

    const committed = commitRegionalEcologyStateV3ActiveProjection(state, projection, {
      base: baseInput,
      polarShoreResidents: polarOutputs,
    });
    expect(committed).not.toBeNull();
    const structuralReplay = commitRegionalEcologyStateV3ActiveProjection(
      state,
      structuredClone(projection),
      { base: baseInput, polarShoreResidents: polarOutputs },
    );
    expect(stableStringify(structuralReplay)).toBe(stableStringify(committed));
    expect(committed?.updatedAtTick).toBe(nextTick);
    expect(committed?.adoption?.transactionId).toBe(state.adoption?.transactionId);
    const after = committed?.polarShoreActiveResidents[0]?.patch.aggregatePopulations[0];
    expect(after?.aggregateId).toBe(before.aggregateId);
    expect(after?.populationSize).toBe(before.populationSize);
    expect(after?.anchors.reduce((sum, anchor) => sum + anchor.populationUnits, 0))
      .toBe(before.populationSize);
    for (const resident of committed?.polarShoreActiveResidents ?? []) {
      expect(resident.patch.populations).toEqual([]);
      expect(resident.patch.mortalityTransactions).toEqual([]);
      expect(resident.patch.carcasses).toEqual([]);
      expect(resident.patch.nextMortalityOrdinal).toBe(0);
    }
    expect(canonicalRegionalEcologyStateV3ForWorld(committed, {
      rootSeed: SEED,
      completedTick: nextTick,
      settlementHomeHabitat: homeHabitat,
    })).toBe(committed);
  });

  it("rederives the polar sibling from seamless signed and extreme-coordinate windows", () => {
    const state = createFreshRegionalEcologyStateV3(fixture().v2, SEED);
    for (const nextRegion of [
      createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
      createRegionCoord(REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
    ]) {
      const regional = regionalEcologyRegionalResidentsForActiveRegions(
        state.base.base.root,
        SEED,
        [nextRegion],
      );
      if (regional === null) throw new Error("Extreme regional residents failed");
      const moved = replaceRegionalEcologyStateV3ActiveState(state, {
        expectedIntegrity: state.integrity,
        base: {
          expectedIntegrity: state.base.integrity,
          base: {
            expectedIntegrity: state.base.base.integrity,
            rootSeed: SEED,
            root: state.base.base.root,
            settlementHome: {
              sourceKey: state.base.base.settlementHome.sourceKey,
              patch: state.base.base.settlementHome.patch,
            },
            activeRegions: [nextRegion],
            activeResidents: regional,
          },
        },
      });
      const replay = replaceRegionalEcologyStateV3ActiveState(state, {
        expectedIntegrity: state.integrity,
        base: {
          expectedIntegrity: state.base.integrity,
          base: {
            expectedIntegrity: state.base.base.integrity,
            rootSeed: SEED,
            root: state.base.base.root,
            settlementHome: {
              sourceKey: state.base.base.settlementHome.sourceKey,
              patch: state.base.base.settlementHome.patch,
            },
            activeRegions: [nextRegion],
            activeResidents: regional,
          },
        },
      });
      expect(stableStringify(replay)).toBe(stableStringify(moved));
      expect(moved.base.base.activeRegions).toEqual([nextRegion]);
      expect(canonicalizeRegionalEcologyStateV3(moved)).toBe(moved);
      expect(moved.polarShoreActiveResidents.every(({ region, patch }) => (
        region.x === patch.originRegion.x && region.y === patch.originRegion.y
      ))).toBe(true);
    }
    expect(() => replaceRegionalEcologyStateV3ActiveState(state, {
      expectedIntegrity: hashCanonical("stale v3 wrapper"),
      base: {
        expectedIntegrity: state.base.integrity,
        base: {
          expectedIntegrity: state.base.base.integrity,
          rootSeed: SEED,
          root: state.base.base.root,
          settlementHome: {
            sourceKey: state.base.base.settlementHome.sourceKey,
            patch: state.base.base.settlementHome.patch,
          },
          activeRegions: state.base.base.activeRegions,
          activeResidents: state.base.base.activeResidents.map(({ kind, sourceKey, patch }) => {
            if (kind === "settlement-home") throw new Error("Unexpected active home snapshot");
            return { kind, sourceKey, patch };
          }),
        },
      },
    })).toThrow(/stale or malformed/u);
  });

  it("keeps ownership unique and fails closed on child, receipt, snapshot, or projection tampering", () => {
    const state = migrateRegionalEcologyStateV2ToV3(fixture().v2, {
      rootSeed: SEED,
      sourceEnvelopeIntegrity: hashCanonical("v26 polar tamper fixture"),
    });
    const ownership = regionalEcologyStateV3SourceOwnership(state);
    expect(ownership).not.toBeNull();
    const allIds = ownership!.flatMap((entry) => [
      entry.sourceKey,
      ...entry.populationKeys,
      ...entry.actorIds,
      ...entry.groupIds,
      ...entry.aggregateIds,
      ...entry.mortalityIds,
      ...entry.bodyIds,
    ]);
    expect(new Set(allIds)).toHaveLength(allIds.length);

    expect(canonicalizeRegionalEcologyStateV3({
      ...state,
      updatedAtTick: state.updatedAtTick + 1,
    })).toBeNull();
    expect(canonicalizeRegionalEcologyStateV3({
      ...state,
      adoption: state.adoption === null ? null : {
        ...state.adoption,
        sourceOuterVersion: 25,
      },
    })).toBeNull();
    const { integrity: _integrity, ...withoutIntegrity } = state;
    const missingSnapshot = {
      ...withoutIntegrity,
      polarShoreActiveResidents: [],
    };
    const resealed = { ...missingSnapshot, integrity: hashCanonical(missingSnapshot) };
    expect(canonicalRegionalEcologyStateV3ForWorld(resealed, {
      rootSeed: SEED,
      completedTick: TICK,
      settlementHomeHabitat: fixture().homeHabitat,
    })).toBeNull();

    const projection = projectionOf(state);
    const sources = regionalEcologyStateV3ActiveSourcePatches(state);
    if (sources === null) throw new Error("Tamper sources absent");
    const polar = state.polarShoreActiveResidents[0];
    if (polar === undefined) throw new Error("Tamper polar source absent");
    expect(bindRegionalEcologyStateV3ActiveProjection(
      state,
      sources.filter(({ sourceKey }) => sourceKey !== polar.sourceKey),
    )).toBeNull();
    expect(bindRegionalEcologyStateV3ActiveProjection(state, [
      ...sources,
      sources[0]!,
    ])).toBeNull();
    expect(projectRegionalEcologyStateV3ActiveState(
      state,
      windowAt(POLAR_REGION),
    )?.integrity).toBe(projection.integrity);
  });
});

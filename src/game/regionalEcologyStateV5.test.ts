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
  setCoreEcologyAggregatePatchMaterializedActors,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import type { CoreEcologyRuntimeWindow } from "./coreEcologyRuntime";
import { deriveCoreEcologyRegionalPredatorHabitatAssemblage } from "./coreEcologyHabitat";
import { createCoreEcologySettlementHomePatch } from "./coreEcologySettlementHome";
import { repositionCoreWildlifeActor } from "./coreWildlifeActor";
import {
  createPristineRegionalEcologyRoot,
} from "./regionalEcology";
import {
  createRegionalEcologyState,
  regionalEcologyRegionalResidentsForActiveRegions,
} from "./regionalEcologyState";
import { createFreshRegionalEcologyStateV2 } from "./regionalEcologyStateV2";
import { createFreshRegionalEcologyStateV3 } from "./regionalEcologyStateV3";
import {
  createFreshRegionalEcologyStateV4,
  type CommitRegionalEcologyStateV4ActiveProjectionInput,
  type RegionalEcologyStateV4,
} from "./regionalEcologyStateV4";
import {
  REGIONAL_ECOLOGY_STATE_V5_ADOPTION_POLICY_ID,
  REGIONAL_ECOLOGY_STATE_V5_MAX_SERIALIZED_BYTES,
  bindRegionalEcologyStateV5ActiveProjection,
  canonicalRegionalEcologyStateV5ForWorld,
  canonicalizeRegionalEcologyStateV5,
  commitRegionalEcologyStateV5ActiveProjection,
  createFreshRegionalEcologyStateV5,
  deserializeRegionalEcologyStateV5,
  migrateRegionalEcologyStateV4ToV5,
  projectRegionalEcologyStateV5ActiveState,
  regionalEcologyStateV5ActiveSourcePatches,
  regionalEcologyStateV5SourceOwnership,
  replaceRegionalEcologyStateV5ActiveState,
  serializeRegionalEcologyStateV5,
  type CommitRegionalEcologyStateV5ActiveProjectionInput,
  type RegionalEcologyStateV5,
  type RegionalEcologyStateV5ActiveProjection,
} from "./regionalEcologyStateV5";
import { REGIONAL_POLAR_CONSUMER_ECOLOGY_MAX_SERIALIZED_BYTES } from "./regionalPolarConsumerEcology";
import { setRegionalEcologyMaterializationForWindow } from "./regionalEcologyRuntime";
import { REGIONAL_TRAVEL_COLUMNS, REGIONAL_TRAVEL_ROWS } from "./regionalTravel";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  translateWorldPosition,
} from "./worldPosition";

export const ALPHA36_POLAR_CONSUMER_COMPOSITE_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha36-polar-consumer-composite-shared-invariants:v1" as const;
export const ALPHA36_POLAR_CONSUMER_COMPOSITE_PERFORMANCE_OWNER_INTENT =
  "test:alpha36-polar-consumer-composite-performance:v1" as const;

const SEED = seedFromText("polar consumer origin");
const POLAR_REGION = createRegionCoord(0, 0);
const TICK = 19;

function homeHabitatAt(region: ReturnType<typeof createRegionCoord>) {
  const terrain = generateRegionTerrain(SEED, region);
  const halfTile = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
  for (let y = 8; y < WORLD_HEIGHT - 8; y += 16) {
    for (let x = 8; x < WORLD_WIDTH - 8; x += 16) {
      const domesticAnchor = {
        anchorId: `wave-f:v5:home:${region.x}:${region.y}:${hashCanonical(SEED)}`,
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
  throw new Error("Alpha36 composite fixture could not place a home");
}

type Fixture = Readonly<{
  readonly homeHabitat: ReturnType<typeof homeHabitatAt>;
  readonly v4: RegionalEcologyStateV4;
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
  const root = createPristineRegionalEcologyRoot({
    rootSeed: SEED,
    completedTick: TICK,
  });
  const regional = regionalEcologyRegionalResidentsForActiveRegions(
    root,
    SEED,
    [POLAR_REGION],
  );
  if (regional === null) throw new Error("Alpha36 composite base residents failed");
  const v1 = createRegionalEcologyState({
    root,
    settlementHome: { sourceKey: home.patchKey, patch: home },
    activeRegions: [POLAR_REGION],
    activeResidents: regional,
  });
  const v4 = createFreshRegionalEcologyStateV4(
    createFreshRegionalEcologyStateV3(
      createFreshRegionalEcologyStateV2(v1, SEED),
      SEED,
    ),
    SEED,
  );
  cachedFixture = Object.freeze({ homeHabitat, v4 });
  return cachedFixture;
}

function polarActor(state: RegionalEcologyStateV5, populationIndex = 0) {
  const actor = state.polarConsumerActiveResidents[0]
    ?.patch.populations[populationIndex]
    ?.members[0]
    ?.actor;
  if (actor === undefined) throw new Error("Alpha36 composite lost its polar actor");
  return actor;
}

function windowAtPolarActor(state: RegionalEcologyStateV5): CoreEcologyRuntimeWindow {
  const position = polarActor(state).address.position;
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

function projectionOf(state: RegionalEcologyStateV5): RegionalEcologyStateV5ActiveProjection {
  const projection = projectRegionalEcologyStateV5ActiveState(
    state,
    windowAtPolarActor(state),
  );
  if (projection === null) throw new Error("Alpha36 composite projection failed");
  return projection;
}

function allProjectedPatches(
  projection: RegionalEcologyStateV5ActiveProjection,
): readonly CoreEcologyAggregatePatchState[] {
  return [
    ...projection.base.base.base.base.residents.map(({ patch }) => patch),
    ...projection.base.base.base.alpineResidents.map(({ patch }) => patch),
    ...projection.base.base.polarShoreResidents.map(({ patch }) => patch),
    ...projection.base.coldShoreResidents.map(({ patch }) => patch),
    ...projection.polarConsumerResidents.map(({ patch }) => patch),
  ];
}

function materializedCount(patches: readonly CoreEcologyAggregatePatchState[]): number {
  return patches.reduce((sum, patch) => sum + patch.populations.reduce(
    (populationSum, population) => populationSum + population.members.filter(
      ({ materialization }) => materialization === "materialized",
    ).length,
    0,
  ), 0);
}

function unchangedV4CommitInput(
  state: RegionalEcologyStateV5,
  projection: RegionalEcologyStateV5ActiveProjection,
): CommitRegionalEcologyStateV4ActiveProjectionInput {
  return {
    base: {
      base: {
        base: {
          root: state.base.base.base.base.root,
          rootSeed: SEED,
          settlementHome: null,
          residents: projection.base.base.base.base.residents.map(({ sourceKey, patch }) => ({
            sourceKey,
            patch,
          })),
        },
        alpineResidents: projection.base.base.base.alpineResidents.map(({ sourceKey, patch }) => ({
          sourceKey,
          patch,
        })),
      },
      polarShoreResidents: projection.base.base.polarShoreResidents.map(({ sourceKey, patch }) => ({
        sourceKey,
        patch,
      })),
    },
    coldShoreResidents: projection.base.coldShoreResidents.map(({ sourceKey, patch }) => ({
      sourceKey,
      patch,
    })),
  };
}

function unchangedCommitInput(
  state: RegionalEcologyStateV5,
  projection: RegionalEcologyStateV5ActiveProjection,
): CommitRegionalEcologyStateV5ActiveProjectionInput {
  return {
    base: unchangedV4CommitInput(state, projection),
    polarConsumerResidents: projection.polarConsumerResidents.map(({ sourceKey, patch }) => ({
      sourceKey,
      patch,
    })),
  };
}

function replaceActiveRegion(
  state: RegionalEcologyStateV5,
  region: ReturnType<typeof createRegionCoord>,
): RegionalEcologyStateV5 {
  const regional = regionalEcologyRegionalResidentsForActiveRegions(
    state.base.base.base.base.root,
    SEED,
    [region],
  );
  if (regional === null) throw new Error("Alpha36 replacement residents failed");
  return replaceRegionalEcologyStateV5ActiveState(state, {
    expectedIntegrity: state.integrity,
    base: {
      expectedIntegrity: state.base.integrity,
      base: {
        expectedIntegrity: state.base.base.integrity,
        base: {
          expectedIntegrity: state.base.base.base.integrity,
          base: {
            expectedIntegrity: state.base.base.base.base.integrity,
            rootSeed: SEED,
            root: state.base.base.base.base.root,
            settlementHome: {
              sourceKey: state.base.base.base.base.settlementHome.sourceKey,
              patch: state.base.base.base.base.settlementHome.patch,
            },
            activeRegions: [region],
            activeResidents: regional,
          },
        },
      },
    },
  });
}

describe(`${ALPHA36_POLAR_CONSUMER_COMPOSITE_SHARED_INVARIANTS_OWNER_INTENT} regional ecology v5`, () => {
  it(`${ALPHA36_POLAR_CONSUMER_COMPOSITE_PERFORMANCE_OWNER_INTENT} wraps exact v4 custody once with one bounded sparse sibling`, () => {
    const { homeHabitat, v4 } = fixture();
    const original = stableStringify(v4);
    const fresh = createFreshRegionalEcologyStateV5(v4, SEED);
    const sourceEnvelopeIntegrity = hashCanonical("authenticated outer v28 fixture");
    const migrated = migrateRegionalEcologyStateV4ToV5(v4, {
      rootSeed: SEED,
      sourceEnvelopeIntegrity,
    });
    const replay = migrateRegionalEcologyStateV4ToV5(v4, {
      rootSeed: SEED,
      sourceEnvelopeIntegrity,
    });

    expect(fresh.base).toBe(v4);
    expect(migrated.base).toBe(v4);
    expect(stableStringify(migrated.base)).toBe(original);
    expect(fresh.adoption).toBeNull();
    expect(migrated.adoption).toMatchObject({
      policyId: REGIONAL_ECOLOGY_STATE_V5_ADOPTION_POLICY_ID,
      sourceOuterVersion: 28,
      sourceEnvelopeIntegrity,
    });
    expect(stableStringify(replay)).toBe(stableStringify(migrated));
    expect(migrated.polarConsumerRoot.regions).toEqual([]);
    expect(migrated.polarConsumerActiveResidents).toHaveLength(1);
    expect(migrated.polarConsumerActiveResidents[0]?.patch.populations.map(
      ({ species }) => species,
    )).toEqual(["harbor-seal", "polar-bear"]);
    for (const population of migrated.polarConsumerActiveResidents[0]!.patch.populations) {
      expect(population.members).toHaveLength(1);
      expect(population.populationSize).toBe(1);
      expect(population.members[0]?.materialization).toBe("coarse");
    }
    expect(canonicalRegionalEcologyStateV5ForWorld(migrated, {
      rootSeed: SEED,
      completedTick: TICK,
      settlementHomeHabitat: homeHabitat,
    })).toBe(migrated);

    const serialized = serializeRegionalEcologyStateV5(migrated);
    expect(new TextEncoder().encode(serialized).byteLength)
      .toBeLessThan(REGIONAL_ECOLOGY_STATE_V5_MAX_SERIALIZED_BYTES);
    expect(REGIONAL_ECOLOGY_STATE_V5_MAX_SERIALIZED_BYTES).toBeGreaterThan(
      REGIONAL_POLAR_CONSUMER_ECOLOGY_MAX_SERIALIZED_BYTES,
    );
    expect(stableStringify(deserializeRegionalEcologyStateV5(serialized)))
      .toBe(stableStringify(migrated));
    expect(() => createFreshRegionalEcologyStateV5(
      v4,
      seedFromText("foreign polar-consumer world"),
    )).toThrow(/one clock/u);
  });

  it("uses one permutation-independent group-atomic global 24-actor plan", () => {
    const state = createFreshRegionalEcologyStateV5(fixture().v4, SEED);
    const sources = regionalEcologyStateV5ActiveSourcePatches(state);
    if (sources === null) throw new Error("Alpha36 composite sources failed");
    const window = windowAtPolarActor(state);
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
      throw new Error("Alpha36 global materialization failed");
    }
    const projection = projectionOf(state);
    const rebound = bindRegionalEcologyStateV5ActiveProjection(
      state,
      [...direct].reverse(),
    );
    const split = [
      ...projection.base.base.base.base.residents,
      ...projection.base.base.base.alpineResidents,
      ...projection.base.base.polarShoreResidents,
      ...projection.base.coldShoreResidents,
      ...projection.polarConsumerResidents,
    ].map(({ sourceKey, patch }) => ({ sourceKey, patch }))
      .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));

    expect(stableStringify(reversed)).toBe(stableStringify(direct));
    expect(stableStringify(split)).toBe(stableStringify(direct));
    expect(stableStringify(rebound)).toBe(stableStringify(projection));
    expect(materializedCount(allProjectedPatches(projection)))
      .toBeLessThanOrEqual(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);
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

  it("commits one physical movement as a sparse deviation and fails atomically", () => {
    const state = migrateRegionalEcologyStateV4ToV5(fixture().v4, {
      rootSeed: SEED,
      sourceEnvelopeIntegrity: hashCanonical("v28 polar-consumer atomic fixture"),
    });
    const projection = projectionOf(state);
    const source = projection.polarConsumerResidents[0];
    const member = source?.patch.populations.flatMap(({ members }) => members)
      .find(({ materialization }) => materialization === "materialized");
    if (source === undefined || member === undefined) {
      throw new Error("Alpha36 projection lost its selected polar actor");
    }
    const movedActor = repositionCoreWildlifeActor(member.actor, {
      atTick: projection.atTick,
      position: translateWorldPosition(member.actor.address.position, 1, 0),
      heading: member.actor.address.heading,
    });
    const movedPatch = replaceCoreEcologyAggregatePatchActor(source.patch, movedActor);
    const input = unchangedCommitInput(state, projection);
    const committed = commitRegionalEcologyStateV5ActiveProjection(
      state,
      projection,
      {
        ...input,
        polarConsumerResidents: [{ sourceKey: source.sourceKey, patch: movedPatch }],
      },
    );
    expect(committed).not.toBeNull();
    expect(committed?.polarConsumerRoot.regions).toHaveLength(1);
    expect(committed?.adoption?.transactionId).toBe(state.adoption?.transactionId);
    const moved = committed?.polarConsumerActiveResidents[0]?.patch.populations
      .flatMap(({ members }) => members)
      .find(({ actor }) => actor.identity.stableId === movedActor.identity.stableId);
    expect(moved?.actor.address.position).toEqual(movedActor.address.position);

    const before = stableStringify(state);
    expect(commitRegionalEcologyStateV5ActiveProjection(state, projection, {
      ...input,
      polarConsumerResidents: [],
    })).toBeNull();
    const inheritedSource = projection.base.base.base.base.residents.find(
      ({ patch }) => patch.populations.some(({ members }) => members.some(
        ({ materialization }) => materialization === "materialized",
      )),
    );
    expect(inheritedSource).toBeDefined();
    const forgedInheritedPatch = setCoreEcologyAggregatePatchMaterializedActors(
      inheritedSource!.patch,
      { atTick: projection.atTick, actorIds: [] },
    );
    expect(commitRegionalEcologyStateV5ActiveProjection(state, projection, {
      ...input,
      base: {
        ...input.base,
        base: {
          ...input.base.base,
          base: {
            ...input.base.base.base,
            base: {
              ...input.base.base.base.base,
              residents: input.base.base.base.base.residents.map((resident) => (
                resident.sourceKey === inheritedSource!.sourceKey
                  ? { sourceKey: resident.sourceKey, patch: forgedInheritedPatch }
                  : resident
              )),
            },
          },
        },
      },
    })).toBeNull();
    expect(stableStringify(state)).toBe(before);

    const reloaded = deserializeRegionalEcologyStateV5(
      serializeRegionalEcologyStateV5(committed),
    );
    expect(stableStringify(reloaded)).toBe(stableStringify(committed));
    expect(canonicalRegionalEcologyStateV5ForWorld(reloaded, {
      rootSeed: SEED,
      completedTick: TICK,
      settlementHomeHabitat: fixture().homeHabitat,
    })).not.toBeNull();

    const departed = replaceActiveRegion(
      committed!,
      createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
    );
    const returned = replaceActiveRegion(departed, POLAR_REGION);
    const returnedActor = returned.polarConsumerActiveResidents[0]?.patch.populations
      .flatMap(({ members }) => members)
      .find(({ actor }) => actor.identity.stableId === movedActor.identity.stableId);
    expect(returnedActor?.actor.address.position).toEqual(movedActor.address.position);
    expect(returned.adoption?.transactionId).toBe(state.adoption?.transactionId);
    expect(returned.polarConsumerRoot.regions).toHaveLength(1);
  });

  it("rederives the exact v1 active window at signed extreme coordinates", () => {
    const state = createFreshRegionalEcologyStateV5(fixture().v4, SEED);
    for (const region of [
      createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
      createRegionCoord(REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
    ]) {
      const moved = replaceActiveRegion(state, region);
      const replay = replaceActiveRegion(state, region);
      expect(stableStringify(replay)).toBe(stableStringify(moved));
      expect(moved.base.base.base.base.activeRegions).toEqual([region]);
      expect(canonicalizeRegionalEcologyStateV5(moved)).toBe(moved);
      expect(moved.polarConsumerActiveResidents.every(({ region: origin, patch }) => (
        origin.x === patch.originRegion.x && origin.y === patch.originRegion.y
      ))).toBe(true);
    }
  });

  it("rejects forged custody, incomplete sources, stale projections, and ID overlap", () => {
    const state = migrateRegionalEcologyStateV4ToV5(fixture().v4, {
      rootSeed: SEED,
      sourceEnvelopeIntegrity: hashCanonical("v28 polar-consumer forgery fixture"),
    });
    const ownership = regionalEcologyStateV5SourceOwnership(state);
    if (ownership === null) throw new Error("Alpha36 ownership manifest failed");
    const ids = ownership.flatMap((entry) => [
      entry.sourceKey,
      ...entry.populationKeys,
      ...entry.actorIds,
      ...entry.groupIds,
      ...entry.aggregateIds,
      ...entry.mortalityIds,
      ...entry.bodyIds,
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    const polar = ownership.filter(({ layer }) => layer === "polar-consumer");
    expect(polar).toHaveLength(1);
    expect(polar[0]).toMatchObject({
      kind: "regional-polar-consumer-v1",
      groupIds: [],
      aggregateIds: [],
      mortalityIds: [],
      bodyIds: [],
    });

    expect(canonicalizeRegionalEcologyStateV5({
      ...state,
      updatedAtTick: state.updatedAtTick + 1,
    })).toBeNull();
    expect(canonicalizeRegionalEcologyStateV5({
      ...state,
      adoption: state.adoption === null ? null : {
        ...state.adoption,
        sourceOuterVersion: 27,
      },
    })).toBeNull();

    const { integrity: _integrity, ...withoutIntegrity } = state;
    const missingBase = { ...withoutIntegrity, polarConsumerActiveResidents: [] };
    const missing = { ...missingBase, integrity: hashCanonical(missingBase) };
    expect(canonicalRegionalEcologyStateV5ForWorld(missing, {
      rootSeed: SEED,
      completedTick: TICK,
      settlementHomeHabitat: fixture().homeHabitat,
    })).toBeNull();

    const sources = regionalEcologyStateV5ActiveSourcePatches(state);
    const polarSource = state.polarConsumerActiveResidents[0];
    if (sources === null || polarSource === undefined) {
      throw new Error("Alpha36 tamper sources failed");
    }
    expect(bindRegionalEcologyStateV5ActiveProjection(
      state,
      sources.filter(({ sourceKey }) => sourceKey !== polarSource.sourceKey),
    )).toBeNull();
    expect(bindRegionalEcologyStateV5ActiveProjection(state, [
      ...sources,
      sources[0]!,
    ])).toBeNull();

    const projection = projectionOf(state);
    expect(commitRegionalEcologyStateV5ActiveProjection(state, {
      ...structuredClone(projection),
      stateIntegrity: hashCanonical("forged v5 projection fence"),
    }, unchangedCommitInput(state, projection))).toBeNull();
    expect(deserializeRegionalEcologyStateV5(
      `${serializeRegionalEcologyStateV5(state)}\n`,
    )).toBeNull();
  });
});

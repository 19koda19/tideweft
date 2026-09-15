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
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import { deriveCoreEcologyRegionalPredatorHabitatAssemblage } from "./coreEcologyHabitat";
import { CORE_ECOLOGY_BREADTH_CURRENT_EPOCH } from "./coreEcologyBreadthHabitat";
import type { CoreEcologyRuntimeWindow } from "./coreEcologyRuntime";
import { createCoreEcologySettlementHomePatch } from "./coreEcologySettlementHome";
import { repositionCoreWildlifeActor } from "./coreWildlifeActor";
import { createPristineRegionalEcologyRoot } from "./regionalEcology";
import {
  createRegionalEcologyState,
  regionalEcologyRegionalResidentsForActiveRegions,
} from "./regionalEcologyState";
import { createFreshRegionalEcologyStateV2 } from "./regionalEcologyStateV2";
import { createFreshRegionalEcologyStateV3 } from "./regionalEcologyStateV3";
import { createFreshRegionalEcologyStateV4 } from "./regionalEcologyStateV4";
import {
  createFreshRegionalEcologyStateV5,
  type CommitRegionalEcologyStateV5ActiveProjectionInput,
  type RegionalEcologyStateV5,
} from "./regionalEcologyStateV5";
import {
  activateRegionalEcologyStateV6BreadthThroughEpoch,
  REGIONAL_ECOLOGY_STATE_V6_ADOPTION_POLICY_ID,
  REGIONAL_ECOLOGY_STATE_V6_MAX_SERIALIZED_BYTES,
  bindRegionalEcologyStateV6ActiveProjection,
  canonicalRegionalEcologyStateV6ForWorld,
  canonicalizeRegionalEcologyStateV6,
  commitRegionalEcologyStateV6ActiveProjection,
  createRegionalEcologyStateV6,
  createFreshRegionalEcologyStateV6,
  createLegacyBaselineRegionalEcologyStateV6,
  deserializeRegionalEcologyStateV6,
  migrateRegionalEcologyStateV5ToV6,
  projectRegionalEcologyStateV6ActiveState,
  regionalEcologyStateV6ActiveSourcePatches,
  regionalEcologyStateV6SourceOwnership,
  replaceRegionalEcologyStateV6ActiveState,
  serializeRegionalEcologyStateV6,
  type CommitRegionalEcologyStateV6ActiveProjectionInput,
  type RegionalEcologyStateV6,
  type RegionalEcologyStateV6ActiveProjection,
} from "./regionalEcologyStateV6";
import { setRegionalEcologyMaterializationForWindow } from "./regionalEcologyRuntime";
import {
  REGIONAL_BREADTH_ECOLOGY_BASELINE_POLICY_ID,
  REGIONAL_BREADTH_ECOLOGY_LEGACY_BASELINE_POLICY_ID,
  REGIONAL_BREADTH_ECOLOGY_MAX_SERIALIZED_BYTES,
  createPristineRegionalBreadthEcologyRoot,
  putRegionalBreadthEcologyResidentDeviation,
  regionalBreadthEcologyResidentsForActiveRegions,
  type RegionalBreadthEcologyRootV1,
} from "./regionalBreadthEcology";
import { REGIONAL_TRAVEL_COLUMNS, REGIONAL_TRAVEL_ROWS } from "./regionalTravel";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  translateWorldPosition,
} from "./worldPosition";

export const ALPHA37_ESTUARY_BREADTH_COMPOSITE_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha37-estuary-breadth-composite-shared-invariants:v1" as const;
export const ALPHA37_ESTUARY_BREADTH_COMPOSITE_PERFORMANCE_OWNER_INTENT =
  "test:alpha37-estuary-breadth-composite-performance:v1" as const;
export const ALPHA38_MARSH_CHANNEL_WEB_COMPOSITE_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha38-marsh-channel-web-composite-shared-invariants:v1" as const;

const SEED = seedFromText("alpha37 estuary breadth shared properties");
const ACTIVE_REGION = createRegionCoord(-5_179, -89_646);
const TICK = 23;

function homeHabitatAt(region: ReturnType<typeof createRegionCoord>) {
  const terrain = generateRegionTerrain(SEED, region);
  const halfTile = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
  for (let y = 8; y < WORLD_HEIGHT - 8; y += 16) {
    for (let x = 8; x < WORLD_WIDTH - 8; x += 16) {
      const domesticAnchor = {
        anchorId: `wave-g:v6:home:${region.x}:${region.y}:${hashCanonical(SEED)}`,
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
        // Search deterministic terrain anchors until the shared home admits one.
      }
    }
  }
  throw new Error("Alpha37 composite fixture could not place a home");
}

type Fixture = Readonly<{
  readonly homeHabitat: ReturnType<typeof homeHabitatAt>;
  readonly v5: RegionalEcologyStateV5;
}>;

let cachedFixture: Fixture | null = null;

function fixture(): Fixture {
  if (cachedFixture !== null) return cachedFixture;
  const homeHabitat = homeHabitatAt(ACTIVE_REGION);
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
    [ACTIVE_REGION],
  );
  if (regional === null) throw new Error("Alpha37 composite base residents failed");
  const v1 = createRegionalEcologyState({
    root,
    settlementHome: { sourceKey: home.patchKey, patch: home },
    activeRegions: [ACTIVE_REGION],
    activeResidents: regional,
  });
  const v4 = createFreshRegionalEcologyStateV4(
    createFreshRegionalEcologyStateV3(
      createFreshRegionalEcologyStateV2(v1, SEED),
      SEED,
    ),
    SEED,
  );
  cachedFixture = Object.freeze({
    homeHabitat,
    v5: createFreshRegionalEcologyStateV5(v4, SEED),
  });
  return cachedFixture;
}

function regionalEcologyV6AtBreadthEpoch(
  epoch: number,
  withAlpha37History = false,
): RegionalEcologyStateV6 {
  const { v5 } = fixture();
  let breadthRoot = createPristineRegionalBreadthEcologyRoot({
    rootSeed: SEED,
    completedTick: TICK,
  }, epoch);
  let breadthActiveResidents = regionalBreadthEcologyResidentsForActiveRegions(
    breadthRoot,
    SEED,
    [ACTIVE_REGION],
  );
  if (breadthActiveResidents === null) {
    throw new Error("Wave-G epoch fixture could not derive breadth residents");
  }
  if (withAlpha37History) {
    if (epoch !== 1) throw new Error("Alpha37 history fixture requires epoch one");
    const source = breadthActiveResidents.find(({ patch }) => (
      patch.populations.some(({ members }) => members.length > 0)
    ));
    const actor = source?.patch.populations.flatMap(({ members }) => members)[0]?.actor;
    if (source === undefined || actor === undefined) {
      throw new Error("Alpha37 history fixture lost its addressable resident");
    }
    const changed = replaceCoreEcologyAggregatePatchActor(
      source.patch,
      repositionCoreWildlifeActor(actor, {
        atTick: TICK,
        position: actor.address.position,
        heading: (actor.address.heading + 1) % 1_000_000,
      }),
    );
    breadthRoot = putRegionalBreadthEcologyResidentDeviation(breadthRoot, {
      rootSeed: SEED,
      patch: changed,
    });
    breadthActiveResidents = regionalBreadthEcologyResidentsForActiveRegions(
      breadthRoot,
      SEED,
      [ACTIVE_REGION],
    );
    if (breadthActiveResidents === null) {
      throw new Error("Alpha37 history fixture could not restore its deviation");
    }
  }
  return createRegionalEcologyStateV6({
    base: v5,
    breadthRoot,
    breadthActiveResidents: breadthActiveResidents.map(({ sourceKey, patch }) => ({
      sourceKey,
      patch,
    })),
    adoption: withAlpha37History
      ? alpha37AdoptionReceipt(v5, breadthRoot)
      : null,
  });
}

function alpha37AdoptionReceipt(
  base: RegionalEcologyStateV5,
  root: RegionalBreadthEcologyRootV1,
) {
  const sourceEnvelopeIntegrity = hashCanonical("authenticated alpha37 outer-v29 fixture");
  const current = migrateRegionalEcologyStateV5ToV6(base, {
    rootSeed: SEED,
    sourceEnvelopeIntegrity,
  });
  if (current.adoption === null) throw new Error("Current migration lost its receipt");
  const {
    integrity: _currentIntegrity,
    transactionId: _currentTransactionId,
    ...sharedReceipt
  } = current.adoption;
  const adoptedEpoch = 1;
  const resultBreadthActivationPrefixHash = hashCanonical({
    version: root.version,
    ownerId: root.ownerId,
    generationVersion: root.generationVersion,
    baselinePolicyId: root.baselinePolicyId,
    seedFingerprint: root.seedFingerprint,
    adoptedEpoch,
    activations: root.activations.map((activation) => ({
      version: activation.version,
      activationOrdinal: activation.activationOrdinal,
      cohortId: activation.cohortId,
      cohortEpoch: activation.cohortEpoch,
      cohortDefinitionHash: activation.cohortDefinitionHash,
      activatedAtTick: activation.activatedAtTick,
      stableId: activation.stableId,
      integrity: activation.integrity,
    })),
  });
  const receiptBase = {
    ...sharedReceipt,
    resultBreadthActivationEpoch: adoptedEpoch,
    resultBreadthActivationPrefixHash,
  };
  const transactionId = `regional-ecology-v29-wrapper:${hashCanonical(receiptBase)}`;
  const withTransaction = { ...receiptBase, transactionId };
  return Object.freeze({
    ...withTransaction,
    integrity: hashCanonical(withTransaction),
  });
}

function firstBreadthActor(state: RegionalEcologyStateV6) {
  const actor = state.breadthActiveResidents.flatMap(({ patch }) => (
    patch.populations.flatMap(({ members }) => members.map(({ actor }) => actor))
  ))[0];
  if (actor === undefined) throw new Error("Alpha37 fixture lost its addressable actor");
  return actor;
}

function windowAtBreadthActor(state: RegionalEcologyStateV6): CoreEcologyRuntimeWindow {
  const position = firstBreadthActor(state).address.position;
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

function projectionOf(state: RegionalEcologyStateV6): RegionalEcologyStateV6ActiveProjection {
  const projection = projectRegionalEcologyStateV6ActiveState(
    state,
    windowAtBreadthActor(state),
  );
  if (projection === null) throw new Error("Alpha37 composite projection failed");
  return projection;
}

function allProjectedPatches(
  projection: RegionalEcologyStateV6ActiveProjection,
): readonly CoreEcologyAggregatePatchState[] {
  return [
    ...projection.base.base.base.base.base.residents.map(({ patch }) => patch),
    ...projection.base.base.base.base.alpineResidents.map(({ patch }) => patch),
    ...projection.base.base.base.polarShoreResidents.map(({ patch }) => patch),
    ...projection.base.base.coldShoreResidents.map(({ patch }) => patch),
    ...projection.base.polarConsumerResidents.map(({ patch }) => patch),
    ...projection.breadthResidents.map(({ patch }) => patch),
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

function unchangedV5CommitInput(
  state: RegionalEcologyStateV6,
  projection: RegionalEcologyStateV6ActiveProjection,
): CommitRegionalEcologyStateV5ActiveProjectionInput {
  return {
    base: {
      base: {
        base: {
          base: {
            root: state.base.base.base.base.base.root,
            rootSeed: SEED,
            settlementHome: null,
            residents: projection.base.base.base.base.base.residents.map(
              ({ sourceKey, patch }) => ({ sourceKey, patch }),
            ),
          },
          alpineResidents: projection.base.base.base.base.alpineResidents.map(
            ({ sourceKey, patch }) => ({ sourceKey, patch }),
          ),
        },
        polarShoreResidents: projection.base.base.base.polarShoreResidents.map(
          ({ sourceKey, patch }) => ({ sourceKey, patch }),
        ),
      },
      coldShoreResidents: projection.base.base.coldShoreResidents.map(
        ({ sourceKey, patch }) => ({ sourceKey, patch }),
      ),
    },
    polarConsumerResidents: projection.base.polarConsumerResidents.map(
      ({ sourceKey, patch }) => ({ sourceKey, patch }),
    ),
  };
}

function unchangedCommitInput(
  state: RegionalEcologyStateV6,
  projection: RegionalEcologyStateV6ActiveProjection,
): CommitRegionalEcologyStateV6ActiveProjectionInput {
  return {
    base: unchangedV5CommitInput(state, projection),
    breadthResidents: projection.breadthResidents.map(({ sourceKey, patch }) => ({
      sourceKey,
      patch,
    })),
  };
}

function replaceActiveRegion(
  state: RegionalEcologyStateV6,
  region: ReturnType<typeof createRegionCoord>,
): RegionalEcologyStateV6 {
  const regional = regionalEcologyRegionalResidentsForActiveRegions(
    state.base.base.base.base.base.root,
    SEED,
    [region],
  );
  if (regional === null) throw new Error("Alpha37 replacement residents failed");
  return replaceRegionalEcologyStateV6ActiveState(state, {
    expectedIntegrity: state.integrity,
    base: {
      expectedIntegrity: state.base.integrity,
      base: {
        expectedIntegrity: state.base.base.integrity,
        base: {
          expectedIntegrity: state.base.base.base.integrity,
          base: {
            expectedIntegrity: state.base.base.base.base.integrity,
            base: {
              expectedIntegrity: state.base.base.base.base.base.integrity,
              rootSeed: SEED,
              root: state.base.base.base.base.base.root,
              settlementHome: {
                sourceKey: state.base.base.base.base.base.settlementHome.sourceKey,
                patch: state.base.base.base.base.base.settlementHome.patch,
              },
              activeRegions: [region],
              activeResidents: regional,
            },
          },
        },
      },
    },
  });
}

describe(`${ALPHA37_ESTUARY_BREADTH_COMPOSITE_SHARED_INVARIANTS_OWNER_INTENT} regional ecology v6`, () => {
  it("wraps exact v5 custody once and authenticates a future-epoch-stable activation prefix", () => {
    const { homeHabitat, v5 } = fixture();
    const original = stableStringify(v5);
    const fresh = createFreshRegionalEcologyStateV6(v5, SEED);
    const legacyBaseline = createLegacyBaselineRegionalEcologyStateV6(v5, SEED);
    const sourceEnvelopeIntegrity = hashCanonical("authenticated outer v29 fixture");
    const migrated = migrateRegionalEcologyStateV5ToV6(v5, {
      rootSeed: SEED,
      sourceEnvelopeIntegrity,
    });
    const replay = migrateRegionalEcologyStateV5ToV6(v5, {
      rootSeed: SEED,
      sourceEnvelopeIntegrity,
    });

    expect(fresh.base).toBe(v5);
    expect(migrated.base).toBe(v5);
    expect(stableStringify(migrated.base)).toBe(original);
    expect(fresh.breadthRoot.baselinePolicyId).toBe(
      REGIONAL_BREADTH_ECOLOGY_BASELINE_POLICY_ID,
    );
    expect(legacyBaseline.breadthRoot.baselinePolicyId).toBe(
      REGIONAL_BREADTH_ECOLOGY_LEGACY_BASELINE_POLICY_ID,
    );
    expect(migrated.breadthRoot.baselinePolicyId).toBe(
      REGIONAL_BREADTH_ECOLOGY_LEGACY_BASELINE_POLICY_ID,
    );
    expect(fresh.adoption).toBeNull();
    expect(migrated.adoption).toMatchObject({
      policyId: REGIONAL_ECOLOGY_STATE_V6_ADOPTION_POLICY_ID,
      sourceOuterVersion: 29,
      sourceEnvelopeIntegrity,
      resultBreadthActivationEpoch: CORE_ECOLOGY_BREADTH_CURRENT_EPOCH,
    });
    expect(stableStringify(replay)).toBe(stableStringify(migrated));
    expect(migrated.breadthRoot.regions).toEqual([]);
    expect(migrated.breadthActiveResidents.length).toBeGreaterThan(0);
    expect(migrated.breadthActiveResidents.flatMap(({ patch }) => [
      ...patch.populations.map(({ species }) => species),
      ...patch.aggregatePopulations.map(({ species }) => species),
    ])).toContain("common-tern");
    expect(canonicalRegionalEcologyStateV6ForWorld(migrated, {
      rootSeed: SEED,
      completedTick: TICK,
      settlementHomeHabitat: homeHabitat,
    })).toBe(migrated);

    const serialized = serializeRegionalEcologyStateV6(migrated);
    expect(new TextEncoder().encode(serialized).byteLength)
      .toBeLessThan(REGIONAL_ECOLOGY_STATE_V6_MAX_SERIALIZED_BYTES);
    expect(REGIONAL_ECOLOGY_STATE_V6_MAX_SERIALIZED_BYTES)
      .toBeGreaterThan(REGIONAL_BREADTH_ECOLOGY_MAX_SERIALIZED_BYTES);
    expect(stableStringify(deserializeRegionalEcologyStateV6(serialized)))
      .toBe(stableStringify(migrated));
    expect(() => createFreshRegionalEcologyStateV6(
      v5,
      seedFromText("foreign breadth composite world"),
    )).toThrow(/one clock/u);
  });

  it(`${ALPHA38_MARSH_CHANNEL_WEB_COMPOSITE_SHARED_INVARIANTS_OWNER_INTENT} adopts an older breadth epoch exactly once without replacing v6 custody`, () => {
    expect(CORE_ECOLOGY_BREADTH_CURRENT_EPOCH).toBeGreaterThan(1);
    const { homeHabitat } = fixture();
    const old = regionalEcologyV6AtBreadthEpoch(1, true);
    const oldBase = stableStringify(old.base);
    const oldActivation = stableStringify(old.breadthRoot.activations[0]);
    const oldRegions = stableStringify(old.breadthRoot.regions);
    const oldAdoption = stableStringify(old.adoption);
    expect(old.adoption).not.toBeNull();
    expect(old.breadthRoot.regions).toHaveLength(1);
    const input = Object.freeze({
      rootSeed: SEED,
      completedTick: TICK,
      settlementHomeHabitat: homeHabitat,
      expectedIntegrity: old.integrity,
      targetEpoch: CORE_ECOLOGY_BREADTH_CURRENT_EPOCH,
    });

    const adopted = activateRegionalEcologyStateV6BreadthThroughEpoch(old, input);
    const replay = activateRegionalEcologyStateV6BreadthThroughEpoch(adopted, {
      ...input,
      expectedIntegrity: adopted.integrity,
    });

    expect(adopted.version).toBe(6);
    expect(adopted.updatedAtTick).toBe(TICK);
    expect(adopted.breadthRoot.activeThroughEpoch).toBe(
      CORE_ECOLOGY_BREADTH_CURRENT_EPOCH,
    );
    expect(adopted.breadthRoot.activations).toHaveLength(
      CORE_ECOLOGY_BREADTH_CURRENT_EPOCH,
    );
    expect(stableStringify(adopted.breadthRoot.activations[0])).toBe(oldActivation);
    expect(stableStringify(adopted.breadthRoot.regions)).toBe(oldRegions);
    expect(stableStringify(adopted.base)).toBe(oldBase);
    expect(stableStringify(adopted.adoption)).toBe(oldAdoption);
    expect(replay).toBe(adopted);
    expect(stableStringify(
      deserializeRegionalEcologyStateV6(serializeRegionalEcologyStateV6(adopted)),
    )).toBe(stableStringify(adopted));
    expect(canonicalRegionalEcologyStateV6ForWorld(adopted, {
      rootSeed: SEED,
      completedTick: TICK,
      settlementHomeHabitat: homeHabitat,
    })).toBe(adopted);

    expect(() => activateRegionalEcologyStateV6BreadthThroughEpoch(old, {
      ...input,
      expectedIntegrity: hashCanonical("stale breadth state"),
    })).toThrow(/stale or foreign/u);
    expect(() => activateRegionalEcologyStateV6BreadthThroughEpoch(old, {
      ...input,
      targetEpoch: 0,
    })).toThrow(/cannot be removed or rewound/u);
    expect(() => activateRegionalEcologyStateV6BreadthThroughEpoch(old, {
      ...input,
      targetEpoch: CORE_ECOLOGY_BREADTH_CURRENT_EPOCH + 1,
    })).toThrow(/target is unavailable/u);
    expect(stableStringify(old.base)).toBe(oldBase);
    expect(old.breadthRoot.activeThroughEpoch).toBe(1);
  });

  it(`${ALPHA37_ESTUARY_BREADTH_COMPOSITE_PERFORMANCE_OWNER_INTENT} uses one permutation-independent group-atomic global 24-actor plan`, () => {
    const state = createFreshRegionalEcologyStateV6(fixture().v5, SEED);
    const sources = regionalEcologyStateV6ActiveSourcePatches(state);
    if (sources === null) throw new Error("Alpha37 composite sources failed");
    const window = windowAtBreadthActor(state);
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
      throw new Error("Alpha37 global materialization failed");
    }
    const projection = projectionOf(state);
    const rebound = bindRegionalEcologyStateV6ActiveProjection(
      state,
      [...direct].reverse(),
    );
    const split = allProjectedPatches(projection).map((patch) => ({
      sourceKey: patch.patchKey,
      patch,
    })).sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));

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

  it("commits one physical movement as a sparse delta without invalidating adoption", () => {
    const state = migrateRegionalEcologyStateV5ToV6(fixture().v5, {
      rootSeed: SEED,
      sourceEnvelopeIntegrity: hashCanonical("v29 breadth atomic fixture"),
    });
    const projection = projectionOf(state);
    const source = projection.breadthResidents.find(({ patch }) => (
      patch.populations.some(({ members }) => members.some(
        ({ materialization }) => materialization === "materialized",
      ))
    ));
    const member = source?.patch.populations.flatMap(({ members }) => members)
      .find(({ materialization }) => materialization === "materialized");
    if (source === undefined || member === undefined) {
      throw new Error("Alpha37 projection lost its selected breadth actor");
    }
    const movedActor = repositionCoreWildlifeActor(member.actor, {
      atTick: projection.atTick,
      position: translateWorldPosition(member.actor.address.position, 1, 0),
      heading: member.actor.address.heading,
    });
    const movedPatch = replaceCoreEcologyAggregatePatchActor(source.patch, movedActor);
    const input = unchangedCommitInput(state, projection);
    const committed = commitRegionalEcologyStateV6ActiveProjection(
      state,
      projection,
      {
        ...input,
        breadthResidents: input.breadthResidents.map((resident) => (
          resident.sourceKey === source.sourceKey
            ? { sourceKey: resident.sourceKey, patch: movedPatch }
            : resident
        )),
      },
    );
    expect(committed).not.toBeNull();
    expect(committed?.breadthRoot.regions).toHaveLength(1);
    expect(committed?.adoption?.transactionId).toBe(state.adoption?.transactionId);
    expect(canonicalizeRegionalEcologyStateV6(committed)).toBe(committed);
    const moved = committed?.breadthActiveResidents.flatMap(({ patch }) => (
      patch.populations.flatMap(({ members }) => members)
    )).find(({ actor }) => actor.identity.stableId === movedActor.identity.stableId);
    expect(moved?.actor.address.position).toEqual(movedActor.address.position);

    const reloaded = deserializeRegionalEcologyStateV6(
      serializeRegionalEcologyStateV6(committed),
    );
    expect(stableStringify(reloaded)).toBe(stableStringify(committed));
    expect(canonicalRegionalEcologyStateV6ForWorld(reloaded, {
      rootSeed: SEED,
      completedTick: TICK,
      settlementHomeHabitat: fixture().homeHabitat,
    })).not.toBeNull();
    if (committed === null || reloaded === null) {
      throw new Error("Alpha37 movement fixture did not survive serialization");
    }
    const away = replaceActiveRegion(reloaded, createRegionCoord(-1, -1));
    const awayReloaded = deserializeRegionalEcologyStateV6(
      serializeRegionalEcologyStateV6(away),
    );
    if (awayReloaded === null) {
      throw new Error("Alpha37 departing breadth state did not survive serialization");
    }
    const returned = replaceActiveRegion(awayReloaded, ACTIVE_REGION);
    const returnedMember = returned.breadthActiveResidents
      .flatMap(({ patch }) => patch.populations.flatMap(({ members }) => members))
      .find(({ actor }) => actor.identity.stableId === movedActor.identity.stableId);
    expect(returnedMember?.actor.address.position).toEqual(movedActor.address.position);
    expect(returned.breadthRoot.regions).toEqual(committed.breadthRoot.regions);
    expect(commitRegionalEcologyStateV6ActiveProjection(state, projection, {
      ...input,
      breadthResidents: [],
    })).toBeNull();
  });

  it("rederives signed/extreme windows and reports collision-free source ownership", () => {
    const state = createFreshRegionalEcologyStateV6(fixture().v5, SEED);
    const ownership = regionalEcologyStateV6SourceOwnership(state);
    if (ownership === null) throw new Error("Alpha37 ownership manifest failed");
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
    const breadth = ownership.filter(({ layer }) => layer === "breadth");
    expect(breadth.length).toBeGreaterThan(0);
    expect(breadth.every(({ kind, mortalityIds, bodyIds }) => (
      kind === "regional-breadth-v1"
      && mortalityIds.length === 0
      && bodyIds.length === 0
    ))).toBe(true);

    for (const region of [
      createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
      createRegionCoord(REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
    ]) {
      const moved = replaceActiveRegion(state, region);
      const replay = replaceActiveRegion(state, region);
      expect(stableStringify(replay)).toBe(stableStringify(moved));
      expect(moved.base.base.base.base.base.activeRegions).toEqual([region]);
      expect(canonicalizeRegionalEcologyStateV6(moved)).toBe(moved);
    }
  });

  it("rejects forged custody, incomplete sources, and stale projections", () => {
    const state = migrateRegionalEcologyStateV5ToV6(fixture().v5, {
      rootSeed: SEED,
      sourceEnvelopeIntegrity: hashCanonical("v29 breadth forgery fixture"),
    });
    expect(canonicalizeRegionalEcologyStateV6({
      ...state,
      updatedAtTick: state.updatedAtTick + 1,
    })).toBeNull();
    expect(canonicalizeRegionalEcologyStateV6({
      ...state,
      adoption: state.adoption === null ? null : {
        ...state.adoption,
        sourceOuterVersion: 28,
      },
    })).toBeNull();

    const sources = regionalEcologyStateV6ActiveSourcePatches(state);
    const breadthSource = state.breadthActiveResidents[0];
    if (sources === null || breadthSource === undefined) {
      throw new Error("Alpha37 tamper sources failed");
    }
    expect(bindRegionalEcologyStateV6ActiveProjection(
      state,
      sources.filter(({ sourceKey }) => sourceKey !== breadthSource.sourceKey),
    )).toBeNull();
    expect(bindRegionalEcologyStateV6ActiveProjection(state, [
      ...sources,
      sources[0]!,
    ])).toBeNull();

    const projection = projectionOf(state);
    expect(commitRegionalEcologyStateV6ActiveProjection(state, {
      ...structuredClone(projection),
      stateIntegrity: hashCanonical("forged v6 projection fence"),
    }, unchangedCommitInput(state, projection))).toBeNull();
    expect(deserializeRegionalEcologyStateV6(
      `${serializeRegionalEcologyStateV6(state)}\n`,
    )).toBeNull();
  });
});

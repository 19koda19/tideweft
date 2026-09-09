import { describe, expect, it } from "vitest";

import { REGION_COORD_LIMIT, createRegionCoord, regionLocalToGlobalTile } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { generateRegionTerrain } from "../sim/regionTerrain";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { hashCanonical, stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  createCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  setCoreEcologyAggregatePatchMaterializedActors,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import { deriveCoreEcologyAlpineHabitat } from "./coreEcologyAlpineHabitat";
import type { CoreEcologyRuntimeWindow } from "./coreEcologyRuntime";
import { deriveCoreEcologyRegionalPredatorHabitatAssemblage } from "./coreEcologyHabitat";
import { createCoreEcologySettlementHomePatch } from "./coreEcologySettlementHome";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  repositionCoreWildlifeActor,
} from "./coreWildlifeActor";
import {
  adoptRegionalEcologyFromV24,
  advanceRegionalEcologyRoot,
  createPristineRegionalEcologyRoot,
} from "./regionalEcology";
import {
  REGIONAL_ALPINE_ECOLOGY_MAX_SERIALIZED_BYTES,
  createPristineRegionalAlpineEcologyRoot,
} from "./regionalAlpineEcology";
import { projectRegionalEcologyLegacyCohort } from "./regionalEcologyLegacyCohort";
import { createCoreEcologyAlpineResidentPatch } from "./regionalAlpineResidents";
import {
  REGIONAL_ECOLOGY_STATE_MAX_SERIALIZED_BYTES,
  createRegionalEcologyState,
  regionalEcologyRegionalResidentsForActiveRegions,
} from "./regionalEcologyState";
import {
  setRegionalEcologyMaterializationForWindow,
} from "./regionalEcologyRuntime";
import {
  REGIONAL_ECOLOGY_STATE_V2_MAX_SERIALIZED_BYTES,
  canonicalRegionalEcologyStateV2ForWorld,
  canonicalizeRegionalEcologyStateV2,
  bindRegionalEcologyStateV2ActiveProjection,
  commitRegionalEcologyStateV2ActiveProjection,
  createFreshRegionalEcologyStateV2,
  deserializeRegionalEcologyStateV2,
  migrateRegionalEcologyStateV1ToV2,
  projectRegionalEcologyStateV2ActiveState,
  regionalEcologyStateV2ActiveSourcePatches,
  regionalEcologyStateV2SourceOwnership,
  replaceRegionalEcologyStateV2ActiveState,
  serializeRegionalEcologyStateV2,
  type RegionalEcologyStateV2,
} from "./regionalEcologyStateV2";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
} from "./worldPosition";

export const ALPHA33_ALPINE_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha33-alpine-shared-invariants:v1" as const;
export const ALPHA33_ALPINE_PERFORMANCE_OWNER_INTENT =
  "test:alpha33-alpine-performance:v1" as const;

const SEED = seedFromText("alpine resident property");
const GOAT_SEED = seedFromText("wave-f alpine origin");
const GOAT_REGION = createRegionCoord(0, -1);
const TICK = 19;
const REGION_CANDIDATES = Object.freeze([
  createRegionCoord(-1, 0),
  createRegionCoord(-37, 12),
  createRegionCoord(18, -27),
  createRegionCoord(-719, 304),
  createRegionCoord(0, 0),
  createRegionCoord(31, 47),
]);

function occupiedAlpineRegion() {
  for (const region of REGION_CANDIDATES) {
    const habitat = deriveCoreEcologyAlpineHabitat({ seed: SEED, region });
    if (habitat.populations.some(({ actorRepresentation, populationUnits }) => (
      actorRepresentation === "individual" && populationUnits > 0
    ))) {
      return region;
    }
  }
  throw new Error("Wave-F state fixture needs one individually occupied Alpine region");
}

function homeHabitatAt(
  region: ReturnType<typeof createRegionCoord>,
  seed = SEED,
) {
  const terrain = generateRegionTerrain(seed, region);
  const halfTile = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
  for (let y = 8; y < WORLD_HEIGHT - 8; y += 16) {
    for (let x = 8; x < WORLD_WIDTH - 8; x += 16) {
      const domesticAnchor = {
        anchorId: `wave-f:v2:home:${region.x}:${region.y}:${hashCanonical(seed)}`,
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
          rootSeed: seed,
          originRegion: region,
          terrain,
          domesticAnchor,
        });
      } catch {
        // Continue through deterministic terrain anchors until one is lawful.
      }
    }
  }
  throw new Error("Wave-F state fixture could not place a settlement home");
}

type StateFixture = Readonly<{
  activeRegion: ReturnType<typeof createRegionCoord>;
  homeHabitat: ReturnType<typeof homeHabitatAt>;
  base: ReturnType<typeof createRegionalEcologyState>;
}>;

let CACHED_FIXTURE: StateFixture | null = null;

function fixture(): StateFixture {
  if (CACHED_FIXTURE !== null) return CACHED_FIXTURE;
  const activeRegion = occupiedAlpineRegion();
  const homeHabitat = homeHabitatAt(activeRegion);
  const home = createCoreEcologySettlementHomePatch({
    seed: SEED,
    habitat: homeHabitat,
    tick: TICK,
  });
  const base = createRegionalEcologyState({
    root: createPristineRegionalEcologyRoot({ rootSeed: SEED, completedTick: TICK }),
    settlementHome: { sourceKey: home.patchKey, patch: home },
    activeRegions: [activeRegion],
    activeResidents: [],
  });
  CACHED_FIXTURE = Object.freeze({ activeRegion, homeHabitat, base });
  return CACHED_FIXTURE;
}

function windowAt(region: ReturnType<typeof createRegionCoord>): CoreEcologyRuntimeWindow {
  return Object.freeze({
    origin: regionLocalToGlobalTile(region, 0, 0),
    terrain: Object.freeze({ width: 120, height: 120 }),
  });
}

function projectionResidents(state: RegionalEcologyStateV2) {
  const projection = projectRegionalEcologyStateV2ActiveState(
    state,
    windowAt(state.base.activeRegions[0]!),
  );
  if (projection === null) throw new Error("Wave-F active projection failed");
  return projection;
}

function crowdedCompositeState(): RegionalEcologyStateV2 {
  const { activeRegion, base } = fixture();
  const legacyPatch = createCoreEcologyAggregatePatch({
    seed: SEED,
    patchKey: "wave-f:v2:legacy-pressure",
    originRegion: activeRegion,
    tick: TICK,
    derivation: { kind: "bounded-input-v1" },
    populations: [{
      species: "gull",
      populationKey: "wave-f:v2:legacy-pressure:gulls",
      populationSize: 24,
      members: Array.from({ length: 24 }, (_, ordinal) => ({
        populationOrdinal: ordinal,
        position: createWorldPosition(
          activeRegion,
          (48 + ordinal % 12) * WORLD_POSITION_UNITS_PER_TILE
            + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
          (38 + Math.floor(ordinal / 12)) * WORLD_POSITION_UNITS_PER_TILE
            + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
        ),
        materialization: "coarse" as const,
      })),
    }],
  });
  const root = adoptRegionalEcologyFromV24({
    rootSeed: SEED,
    completedTick: TICK,
    sourceEnvelopeIntegrity: hashCanonical("wave-f authenticated legacy pressure"),
    legacyPatch,
    protectedActorIds: legacyPatch.populations.flatMap(({ members }) => (
      members.map(({ actor }) => actor.identity.stableId)
    )),
    protectedAggregateIds: [],
  });
  const retainedLegacy = projectRegionalEcologyLegacyCohort({ rootSeed: SEED, root });
  const regional = regionalEcologyRegionalResidentsForActiveRegions(root, SEED, [activeRegion]);
  if (retainedLegacy === null || regional === null) {
    throw new Error("Wave-F crowded composite fixture failed");
  }
  const crowdedBase = createRegionalEcologyState({
    root,
    settlementHome: {
      sourceKey: base.settlementHome.sourceKey,
      patch: base.settlementHome.patch,
    },
    activeRegions: [activeRegion],
    activeResidents: [
      ...regional,
      { kind: "legacy-cohort", sourceKey: retainedLegacy.patchKey, patch: retainedLegacy },
    ],
  });
  return createFreshRegionalEcologyStateV2(crowdedBase, SEED);
}

function allProjectedPatches(
  projection: ReturnType<typeof projectionResidents>,
): readonly CoreEcologyAggregatePatchState[] {
  return [
    ...projection.base.residents.map(({ patch }) => patch),
    ...projection.alpineResidents.map(({ patch }) => patch),
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
  if (result === null) throw new Error("Wave-F projected no-action step failed");
  return Object.freeze({ sourceKey: result.patch.patchKey, patch: result.patch });
}

describe(`${ALPHA33_ALPINE_SHARED_INVARIANTS_OWNER_INTENT} Wave-F regional ecology v2 composite authority`, () => {
  it(`${ALPHA33_ALPINE_PERFORMANCE_OWNER_INTENT} preserves the authenticated v1 child byte-for-byte within the composite size budget and distinguishes fresh from migrated worlds`, () => {
    const { activeRegion, base, homeHabitat } = fixture();
    const original = stableStringify(base);
    const fresh = createFreshRegionalEcologyStateV2(base, SEED);
    const migrated = migrateRegionalEcologyStateV1ToV2(base, {
      rootSeed: SEED,
      sourceEnvelopeIntegrity: hashCanonical("authenticated outer v25 fixture"),
    });
    const replay = migrateRegionalEcologyStateV1ToV2(base, {
      rootSeed: SEED,
      sourceEnvelopeIntegrity: hashCanonical("authenticated outer v25 fixture"),
    });

    expect(stableStringify(fresh.base)).toBe(original);
    expect(stableStringify(migrated.base)).toBe(original);
    expect(fresh.adoption).toBeNull();
    expect(migrated.adoption).not.toBeNull();
    expect(stableStringify(replay)).toBe(stableStringify(migrated));
    expect(migrated.alpineRoot.regions).toEqual([]);
    expect(migrated.alpineActiveResidents.length).toBeGreaterThan(0);
    expect(canonicalRegionalEcologyStateV2ForWorld(migrated, {
      rootSeed: SEED,
      completedTick: TICK,
      settlementHomeHabitat: homeHabitat,
    })).toBe(migrated);

    const nextRegion = createRegionCoord(activeRegion.x + 1, activeRegion.y);
    const nextResidents = regionalEcologyRegionalResidentsForActiveRegions(
      migrated.base.root,
      SEED,
      [nextRegion],
    );
    if (nextResidents === null) throw new Error("Wave-F migration seam fixture failed");
    const movedWindow = replaceRegionalEcologyStateV2ActiveState(migrated, {
      expectedIntegrity: migrated.integrity,
      base: {
        expectedIntegrity: migrated.base.integrity,
        rootSeed: SEED,
        root: migrated.base.root,
        settlementHome: {
          sourceKey: migrated.base.settlementHome.sourceKey,
          patch: migrated.base.settlementHome.patch,
        },
        activeRegions: [nextRegion],
        activeResidents: nextResidents,
      },
    });
    expect(movedWindow.updatedAtTick).toBe(migrated.updatedAtTick);
    expect(movedWindow.base.activeRegions).toEqual([nextRegion]);
    expect(movedWindow.adoption?.transactionId).toBe(migrated.adoption?.transactionId);
    expect(movedWindow.adoption?.sourceBaseLineageHash)
      .toBe(migrated.adoption?.sourceBaseLineageHash);
    expect(canonicalRegionalEcologyStateV2ForWorld(movedWindow, {
      rootSeed: SEED,
      completedTick: TICK,
      settlementHomeHabitat: homeHabitat,
    })).toBe(movedWindow);

    const serialized = serializeRegionalEcologyStateV2(migrated);
    expect(new TextEncoder().encode(serialized).byteLength)
      .toBeLessThan(REGIONAL_ECOLOGY_STATE_V2_MAX_SERIALIZED_BYTES);
    expect(REGIONAL_ECOLOGY_STATE_V2_MAX_SERIALIZED_BYTES).toBeGreaterThan(
      REGIONAL_ECOLOGY_STATE_MAX_SERIALIZED_BYTES
        + REGIONAL_ALPINE_ECOLOGY_MAX_SERIALIZED_BYTES,
    );
    expect(stableStringify(deserializeRegionalEcologyStateV2(serialized)))
      .toBe(stableStringify(migrated));
    expect(() => createFreshRegionalEcologyStateV2(
      base,
      seedFromText("foreign Wave-F wrapper world"),
    )).toThrow(/one clock/u);
  });

  it(`${ALPHA33_ALPINE_PERFORMANCE_OWNER_INTENT} uses one group-atomic top-K plan across both child layers`, () => {
    const unpressured = projectionResidents(createFreshRegionalEcologyStateV2(
      fixture().base,
      SEED,
    ));
    expect(unpressured.alpineResidents.flatMap(({ patch }) => (
      patch.populations.flatMap(({ members }) => members.filter(
        ({ materialization }) => materialization === "materialized",
      ))
    )).length).toBeGreaterThan(0);

    const state = crowdedCompositeState();
    const sources = regionalEcologyStateV2ActiveSourcePatches(state);
    expect(sources).not.toBeNull();
    const direct = setRegionalEcologyMaterializationForWindow(
      sources!,
      windowAt(state.base.activeRegions[0]!),
      state.updatedAtTick,
    );
    expect(direct).not.toBeNull();
    const projection = projectRegionalEcologyStateV2ActiveState(
      state,
      windowAt(state.base.activeRegions[0]!),
    );
    expect(projection).not.toBeNull();
    if (projection === null) throw new Error("Wave-F global projection binding failed");
    const split = [
      ...projection.base.residents.map(({ sourceKey, patch }) => ({ sourceKey, patch })),
      ...projection.alpineResidents.map(({ sourceKey, patch }) => ({ sourceKey, patch })),
    ].sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));

    expect(stableStringify(split)).toBe(stableStringify(direct));
    const materialized = allProjectedPatches(projection).flatMap(({ populations }) => (
      populations.flatMap(({ members }) => members.filter(
        ({ materialization }) => materialization === "materialized",
      ))
    ));
    expect(materialized).toHaveLength(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);
    expect(projection.alpineResidents.flatMap(({ patch }) => (
      patch.populations.flatMap(({ members }) => members.filter(
        ({ materialization }) => materialization === "materialized",
      ))
    ))).toHaveLength(0);
    for (const patch of allProjectedPatches(projection)) {
      for (const group of patch.groups.groups) {
        const population = patch.populations.find(({ populationKey }) => (
          populationKey === group.identity.populationKey
        ));
        const materializedOrdinals = population?.members.filter(({ materialization }) => (
          materialization === "materialized"
        )).map(({ populationOrdinal }) => populationOrdinal) ?? [];
        const inGroup = group.memberOrdinals.filter((ordinal) => materializedOrdinals.includes(ordinal));
        expect(inGroup.length === 0 || inGroup.length === group.memberOrdinals.length).toBe(true);
      }
    }

  });

  it("commits both layers atomically, conserves Alpine lineages, and never creates mortality", () => {
    const { base, homeHabitat } = fixture();
    const state = migrateRegionalEcologyStateV1ToV2(base, {
      rootSeed: SEED,
      sourceEnvelopeIntegrity: hashCanonical("v25 atomic commit fixture"),
    });
    const projection = projectionResidents(state);
    const nextTick = TICK + 1;
    const baseOutputs = projection.base.residents.map(({ patch }) => (
      advanceProjectedPatchWithoutAction(patch, nextTick)
    ));
    const alpineOutputs = projection.alpineResidents.map(({ patch }) => (
      advanceProjectedPatchWithoutAction(patch, nextTick)
    ));
    const beforeAlpineIds = state.alpineActiveResidents.flatMap(({ patch }) => (
      patch.populations.flatMap(({ members }) => members.map(({ actor }) => actor.identity.stableId))
    ));
    const selectedBase = projection.base.residents.find(({ patch }) => (
      patch.populations.some(({ members }) => members.some(
        ({ materialization }) => materialization === "materialized",
      ))
    ));
    if (selectedBase === undefined) throw new Error("Wave-F atomic fixture needs one base actor");
    const skippedBaseStep = setCoreEcologyAggregatePatchMaterializedActors(
      selectedBase.patch,
      { atTick: TICK, actorIds: [] },
    );
    expect(commitRegionalEcologyStateV2ActiveProjection(state, projection, {
      base: {
        root: state.base.root,
        rootSeed: SEED,
        settlementHome: null,
        residents: projection.base.residents.map(({ sourceKey, patch }) => ({
          sourceKey,
          patch: sourceKey === selectedBase.sourceKey ? skippedBaseStep : patch,
        })),
      },
      alpineResidents: projection.alpineResidents.map(({ sourceKey, patch }) => ({
        sourceKey,
        patch,
      })),
    })).toBeNull();

    expect(commitRegionalEcologyStateV2ActiveProjection(state, projection, {
      base: {
        root: advanceRegionalEcologyRoot(state.base.root, nextTick),
        rootSeed: SEED,
        settlementHome: null,
        residents: baseOutputs,
      },
      alpineResidents: [],
    })).toBeNull();

    const committed = commitRegionalEcologyStateV2ActiveProjection(state, projection, {
      base: {
        root: advanceRegionalEcologyRoot(state.base.root, nextTick),
        rootSeed: SEED,
        settlementHome: null,
        residents: baseOutputs,
      },
      alpineResidents: alpineOutputs,
    });
    expect(committed).not.toBeNull();
    const structuralReplay = commitRegionalEcologyStateV2ActiveProjection(
      state,
      structuredClone(projection),
      {
        base: {
          root: advanceRegionalEcologyRoot(state.base.root, nextTick),
          rootSeed: SEED,
          settlementHome: null,
          residents: baseOutputs,
        },
        alpineResidents: alpineOutputs,
      },
    );
    expect(stableStringify(structuralReplay)).toBe(stableStringify(committed));
    expect(committed?.updatedAtTick).toBe(nextTick);
    expect(committed?.adoption?.transactionId).toBe(state.adoption?.transactionId);
    expect(committed?.alpineRoot.regions).toEqual([]);
    expect(committed?.alpineActiveResidents.flatMap(({ patch }) => (
      patch.populations.flatMap(({ members }) => members.map(({ actor }) => actor.identity.stableId))
    ))).toEqual(beforeAlpineIds);
    for (const resident of committed?.alpineActiveResidents ?? []) {
      expect(resident.patch.mortalityTransactions).toEqual([]);
      expect(resident.patch.carcasses).toEqual([]);
      expect(resident.patch.nextMortalityOrdinal).toBe(0);
    }
    expect(canonicalRegionalEcologyStateV2ForWorld(committed, {
      rootSeed: SEED,
      completedTick: nextTick,
      settlementHomeHabitat: homeHabitat,
    })).toBe(committed);
  });

  it("fails closed when the retained child throws on malformed off-window home output", () => {
    const { activeRegion, base } = fixture();
    const remoteRegion = createRegionCoord(activeRegion.x + 20, activeRegion.y + 20);
    const remoteResidents = regionalEcologyRegionalResidentsForActiveRegions(
      base.root,
      SEED,
      [remoteRegion],
    );
    if (remoteResidents === null) throw new Error("Wave-F remote window fixture failed");
    const remoteBase = createRegionalEcologyState({
      root: base.root,
      settlementHome: {
        sourceKey: base.settlementHome.sourceKey,
        patch: base.settlementHome.patch,
      },
      activeRegions: [remoteRegion],
      activeResidents: remoteResidents,
    });
    const state = createFreshRegionalEcologyStateV2(remoteBase, SEED);
    const projection = projectionResidents(state);
    let result: RegionalEcologyStateV2 | null | undefined;

    expect(() => {
      result = commitRegionalEcologyStateV2ActiveProjection(state, projection, {
        base: {
          root: state.base.root,
          rootSeed: SEED,
          settlementHome: {
            sourceKey: state.base.settlementHome.sourceKey,
            patch: {} as CoreEcologyAggregatePatchState,
          },
          residents: projection.base.residents.map(({ sourceKey, patch }) => ({
            sourceKey,
            patch,
          })),
        },
        alpineResidents: projection.alpineResidents.map(({ sourceKey, patch }) => ({
          sourceKey,
          patch,
        })),
      });
    }).not.toThrow();
    expect(result).toBeNull();
  });

  it("keeps child ownership and deterministic extreme-coordinate emptiness honest", () => {
    const { activeRegion, base } = fixture();
    const state = createFreshRegionalEcologyStateV2(base, SEED);
    const ownership = regionalEcologyStateV2SourceOwnership(state);
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

    const extreme = createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT);
    const extremeBase = createRegionalEcologyState({
      root: state.base.root,
      settlementHome: {
        sourceKey: state.base.settlementHome.sourceKey,
        patch: state.base.settlementHome.patch,
      },
      activeRegions: [extreme],
      activeResidents: [],
    });
    const first = createFreshRegionalEcologyStateV2(extremeBase, SEED);
    const replay = createFreshRegionalEcologyStateV2(extremeBase, SEED);
    expect(stableStringify(replay)).toBe(stableStringify(first));
    expect(canonicalizeRegionalEcologyStateV2(first)).toBe(first);
    expect(first.base.activeRegions).toEqual([extreme]);

    const alpinePatch = createCoreEcologyAlpineResidentPatch({
      seed: SEED,
      habitat: deriveCoreEcologyAlpineHabitat({ seed: SEED, region: activeRegion }),
      tick: TICK,
    });
    const alpineEagle = alpinePatch.populations.find(({ species }) => species === "golden-eagle");
    if (alpineEagle === undefined) throw new Error("Wave-F collision fixture needs an eagle");
    const collidingLegacy = createCoreEcologyAggregatePatch({
      seed: SEED,
      patchKey: "wave-f:v2:colliding-legacy",
      originRegion: activeRegion,
      tick: TICK,
      derivation: { kind: "bounded-input-v1" },
      populations: [{
        species: "golden-eagle",
        populationKey: alpineEagle.populationKey,
        populationSize: 1,
        members: [{
          populationOrdinal: 0,
          position: createWorldPosition(activeRegion, 20_000, 20_000),
          materialization: "coarse",
        }],
      }],
    });
    const collidingRoot = adoptRegionalEcologyFromV24({
      rootSeed: SEED,
      completedTick: TICK,
      sourceEnvelopeIntegrity: hashCanonical("wave-f cross-layer collision"),
      legacyPatch: collidingLegacy,
      protectedActorIds: collidingLegacy.populations.flatMap(({ members }) => (
        members.map(({ actor }) => actor.identity.stableId)
      )),
      protectedAggregateIds: [],
    });
    const retained = projectRegionalEcologyLegacyCohort({
      rootSeed: SEED,
      root: collidingRoot,
    });
    const collidingRegional = regionalEcologyRegionalResidentsForActiveRegions(
      collidingRoot,
      SEED,
      [activeRegion],
    );
    if (retained === null || collidingRegional === null) {
      throw new Error("Wave-F colliding legacy fixture failed");
    }
    const collidingBase = createRegionalEcologyState({
      root: collidingRoot,
      settlementHome: {
        sourceKey: base.settlementHome.sourceKey,
        patch: base.settlementHome.patch,
      },
      activeRegions: [activeRegion],
      activeResidents: [
        ...collidingRegional,
        { kind: "legacy-cohort", sourceKey: retained.patchKey, patch: retained },
      ],
    });
    expect(() => createFreshRegionalEcologyStateV2(collidingBase, SEED))
      .toThrow(/ownership overlaps/u);
  });

  it("keeps a moved Alpine lineage active across the base-owned seamless neighborhood", () => {
    const { activeRegion, base } = fixture();
    const state = createFreshRegionalEcologyStateV2(base, SEED);
    const projection = projectionResidents(state);
    const alpine = projection.alpineResidents[0];
    const eagle = alpine?.patch.populations.find(({ species }) => species === "golden-eagle")
      ?.members[0]?.actor;
    if (alpine === undefined || eagle === undefined) {
      throw new Error("Wave-F seamless fixture needs one projected golden eagle");
    }
    const nextRegion = createRegionCoord(activeRegion.x + 1, activeRegion.y);
    const movedPatch = replaceCoreEcologyAggregatePatchActor(
      alpine.patch,
      repositionCoreWildlifeActor(eagle, {
        atTick: TICK,
        position: createWorldPosition(nextRegion, 1_000, 2_000),
        heading: eagle.address.heading,
      }),
    );
    const committed = commitRegionalEcologyStateV2ActiveProjection(state, projection, {
      base: {
        root: state.base.root,
        rootSeed: SEED,
        settlementHome: null,
        residents: projection.base.residents.map(({ sourceKey, patch }) => ({ sourceKey, patch })),
      },
      alpineResidents: [{ sourceKey: alpine.sourceKey, patch: movedPatch }],
    });
    if (committed === null) throw new Error("Wave-F Alpine movement commit failed");
    expect(committed.alpineRoot.regions).toHaveLength(1);

    const movedProjection = projectionResidents(committed);
    const sameTickCoarse = commitRegionalEcologyStateV2ActiveProjection(
      committed,
      movedProjection,
      {
        base: {
          root: committed.base.root,
          rootSeed: SEED,
          settlementHome: null,
          residents: movedProjection.base.residents.map(({ sourceKey, patch }) => ({
            sourceKey,
            patch,
          })),
        },
        alpineResidents: movedProjection.alpineResidents.map(({ sourceKey, patch }) => ({
          sourceKey,
          patch: setCoreEcologyAggregatePatchMaterializedActors(patch, {
            atTick: TICK,
            actorIds: [],
          }),
        })),
      },
    );
    expect(sameTickCoarse).toBeNull();
    const sameTickProjected = commitRegionalEcologyStateV2ActiveProjection(
      committed,
      movedProjection,
      {
        base: {
          root: committed.base.root,
          rootSeed: SEED,
          settlementHome: null,
          residents: movedProjection.base.residents.map(({ sourceKey, patch }) => ({
            sourceKey,
            patch,
          })),
        },
        alpineResidents: movedProjection.alpineResidents.map(({ sourceKey, patch }) => ({
          sourceKey,
          patch,
        })),
      },
    );
    expect(sameTickProjected?.alpineRoot).toEqual(committed.alpineRoot);

    const visitTick = TICK + 1;
    const visitOnly = commitRegionalEcologyStateV2ActiveProjection(
      committed,
      movedProjection,
      {
        base: {
          root: advanceRegionalEcologyRoot(committed.base.root, visitTick),
          rootSeed: SEED,
          settlementHome: null,
          residents: movedProjection.base.residents.map(({ patch }) => (
            advanceProjectedPatchWithoutAction(patch, visitTick)
          )),
        },
        alpineResidents: movedProjection.alpineResidents.map(({ patch }) => (
          advanceProjectedPatchWithoutAction(patch, visitTick)
        )),
      },
    );
    expect(visitOnly?.alpineRoot.regions).toEqual(committed.alpineRoot.regions);
    expect(visitOnly?.alpineRoot.revision).toBe(committed.alpineRoot.revision);
    expect(visitOnly?.alpineRoot.lastEventOrdinal)
      .toBe(committed.alpineRoot.lastEventOrdinal);

    const activeResidents = regionalEcologyRegionalResidentsForActiveRegions(
      committed.base.root,
      SEED,
      [nextRegion],
    );
    expect(activeResidents).not.toBeNull();
    const moved = replaceRegionalEcologyStateV2ActiveState(committed, {
      expectedIntegrity: committed.integrity,
      base: {
        expectedIntegrity: committed.base.integrity,
        rootSeed: SEED,
        root: committed.base.root,
        settlementHome: {
          sourceKey: committed.base.settlementHome.sourceKey,
          patch: committed.base.settlementHome.patch,
        },
        activeRegions: [nextRegion],
        activeResidents: activeResidents!,
      },
    });

    expect(moved.base.activeRegions).toEqual([nextRegion]);
    expect(moved.alpineActiveResidents.every(({ region, patch }) => (
      region.x === patch.originRegion.x && region.y === patch.originRegion.y
    ))).toBe(true);
    const movedEagle = moved.alpineActiveResidents.flatMap(({ patch }) => (
      patch.populations.flatMap(({ members }) => members.map(({ actor }) => actor))
    )).find(({ identity }) => identity.stableId === eagle.identity.stableId);
    expect(movedEagle?.address.position).toEqual(createWorldPosition(nextRegion, 1_000, 2_000));
    expect(() => replaceRegionalEcologyStateV2ActiveState(committed, {
      expectedIntegrity: hashCanonical("stale wrapper"),
      base: {
        expectedIntegrity: committed.base.integrity,
        rootSeed: SEED,
        root: committed.base.root,
        settlementHome: {
          sourceKey: committed.base.settlementHome.sourceKey,
          patch: committed.base.settlementHome.patch,
        },
        activeRegions: [nextRegion],
        activeResidents: activeResidents!,
      },
    })).toThrow(/stale or malformed/u);
  });

  it("rejects a partial materialized Alpine social group at the projection boundary", () => {
    const habitat = homeHabitatAt(GOAT_REGION, GOAT_SEED);
    const home = createCoreEcologySettlementHomePatch({
      seed: GOAT_SEED,
      habitat,
      tick: TICK,
    });
    const base = createRegionalEcologyState({
      root: createPristineRegionalEcologyRoot({
        rootSeed: GOAT_SEED,
        completedTick: TICK,
      }),
      settlementHome: { sourceKey: home.patchKey, patch: home },
      activeRegions: [GOAT_REGION],
      activeResidents: [],
    });
    const state = createFreshRegionalEcologyStateV2(base, GOAT_SEED);
    const sources = regionalEcologyStateV2ActiveSourcePatches(state);
    const alpine = state.alpineActiveResidents[0];
    const goat = alpine?.patch.populations.find(({ species }) => species === "mountain-goat")
      ?.members[0]?.actor;
    if (sources === null || alpine === undefined || goat === undefined) {
      throw new Error("Wave-F partial-group fixture needs one Alpine goat herd");
    }
    const partial = setCoreEcologyAggregatePatchMaterializedActors(alpine.patch, {
      atTick: TICK,
      actorIds: [goat.identity.stableId],
    });
    const forged = sources.map((resident) => resident.sourceKey === alpine.sourceKey
      ? { sourceKey: resident.sourceKey, patch: partial }
      : resident);

    expect(bindRegionalEcologyStateV2ActiveProjection(state, forged)).toBeNull();
    const validProjection = projectionResidents(state);
    const projectedAlpine = validProjection.alpineResidents.find(({ sourceKey }) => (
      sourceKey === alpine.sourceKey
    ));
    if (projectedAlpine === undefined) throw new Error("Projected goat herd is absent");
    const projectedAllCoarse = setCoreEcologyAggregatePatchMaterializedActors(
      projectedAlpine.patch,
      { atTick: TICK, actorIds: [] },
    );
    expect(commitRegionalEcologyStateV2ActiveProjection(state, validProjection, {
      base: {
        root: state.base.root,
        rootSeed: GOAT_SEED,
        settlementHome: null,
        residents: validProjection.base.residents.map(({ sourceKey, patch }) => ({
          sourceKey,
          patch,
        })),
      },
      alpineResidents: [{ sourceKey: alpine.sourceKey, patch: partial }],
    })).toBeNull();
    const sameTick = commitRegionalEcologyStateV2ActiveProjection(state, validProjection, {
      base: {
        root: state.base.root,
        rootSeed: GOAT_SEED,
        settlementHome: null,
        residents: validProjection.base.residents.map(({ sourceKey, patch }) => ({
          sourceKey,
          patch,
        })),
      },
      alpineResidents: [{ sourceKey: alpine.sourceKey, patch: projectedAllCoarse }],
    });
    expect(sameTick).toBeNull();
    const sameTickProjected = commitRegionalEcologyStateV2ActiveProjection(
      state,
      validProjection,
      {
        base: {
          root: state.base.root,
          rootSeed: GOAT_SEED,
          settlementHome: null,
          residents: validProjection.base.residents.map(({ sourceKey, patch }) => ({
            sourceKey,
            patch,
          })),
        },
        alpineResidents: [{ sourceKey: alpine.sourceKey, patch: projectedAlpine.patch }],
      },
    );
    expect(sameTickProjected?.alpineRoot.integrity).toBe(state.alpineRoot.integrity);

    const nextTick = TICK + 1;
    const nextTickCommit = commitRegionalEcologyStateV2ActiveProjection(state, validProjection, {
      base: {
        root: advanceRegionalEcologyRoot(state.base.root, nextTick),
        rootSeed: GOAT_SEED,
        settlementHome: null,
        residents: validProjection.base.residents.map(({ patch }) => (
          advanceProjectedPatchWithoutAction(patch, nextTick)
        )),
      },
      alpineResidents: [advanceProjectedPatchWithoutAction(projectedAlpine.patch, nextTick)],
    });
    expect(nextTickCommit?.alpineRoot.regions).toEqual([]);
    expect(nextTickCommit?.alpineRoot.revision).toBe(state.alpineRoot.revision);
    expect(nextTickCommit?.alpineRoot.lastEventOrdinal).toBe(
      state.alpineRoot.lastEventOrdinal,
    );

    const forgedProjectionBase = {
      ...validProjection,
      alpineResidents: validProjection.alpineResidents.map((resident) => (
        resident.sourceKey === alpine.sourceKey
          ? { ...resident, projectedPatchHash: hashCanonical(partial), patch: partial }
          : resident
      )),
    };
    const { integrity: _projectionIntegrity, ...unsignedProjection } = forgedProjectionBase;
    const resealedProjection = {
      ...unsignedProjection,
      integrity: hashCanonical(unsignedProjection),
    };
    expect(commitRegionalEcologyStateV2ActiveProjection(state, resealedProjection, {
      base: {
        root: state.base.root,
        rootSeed: GOAT_SEED,
        settlementHome: null,
        residents: validProjection.base.residents.map(({ sourceKey, patch }) => ({
          sourceKey,
          patch,
        })),
      },
      alpineResidents: [{ sourceKey: alpine.sourceKey, patch: partial }],
    })).toBeNull();
  });

  it("fails closed on child, receipt, and hot-snapshot tampering", () => {
    const { activeRegion, base } = fixture();
    const state = migrateRegionalEcologyStateV1ToV2(base, {
      rootSeed: SEED,
      sourceEnvelopeIntegrity: hashCanonical("v25 tamper fixture"),
    });
    expect(canonicalizeRegionalEcologyStateV2({
      ...state,
      updatedAtTick: state.updatedAtTick + 1,
    })).toBeNull();
    expect(canonicalizeRegionalEcologyStateV2({
      ...state,
      adoption: state.adoption === null ? null : {
        ...state.adoption,
        sourceOuterVersion: 24,
      },
    })).toBeNull();
    expect(canonicalizeRegionalEcologyStateV2({
      ...state,
      alpineActiveResidents: state.alpineActiveResidents.slice(1),
    })).toBeNull();
    expect(() => replaceRegionalEcologyStateV2ActiveState(state, {
      expectedIntegrity: state.integrity,
      base: {
        expectedIntegrity: state.base.integrity,
        rootSeed: SEED,
        root: advanceRegionalEcologyRoot(state.base.root, TICK + 1),
        settlementHome: {
          sourceKey: state.base.settlementHome.sourceKey,
          patch: state.base.settlementHome.patch,
        },
        activeRegions: state.base.activeRegions,
        activeResidents: state.base.activeResidents.map(({ kind, sourceKey, patch }) => {
          if (kind === "settlement-home") throw new Error("Invalid active home snapshot");
          return { kind, sourceKey, patch };
        }),
      },
    })).toThrow(/breaks base lineage/u);
    const homeActor = state.base.settlementHome.patch.populations
      .flatMap(({ members }) => members)[0]?.actor;
    if (homeActor === undefined) throw new Error("Wave-F tamper fixture needs one home actor");
    const forgedHome = replaceCoreEcologyAggregatePatchActor(
      state.base.settlementHome.patch,
      repositionCoreWildlifeActor(homeActor, {
        atTick: TICK,
        position: createWorldPosition(activeRegion, 5_000, 6_000),
        heading: homeActor.address.heading,
      }),
    );
    expect(() => replaceRegionalEcologyStateV2ActiveState(state, {
      expectedIntegrity: state.integrity,
      base: {
        expectedIntegrity: state.base.integrity,
        rootSeed: SEED,
        root: state.base.root,
        settlementHome: { sourceKey: forgedHome.patchKey, patch: forgedHome },
        activeRegions: state.base.activeRegions,
        activeResidents: state.base.activeResidents.map(({ kind, sourceKey, patch }) => {
          if (kind === "settlement-home") throw new Error("Invalid active home snapshot");
          return { kind, sourceKey, patch };
        }),
      },
    })).toThrow(/breaks base lineage/u);
    const foreignRoot = createPristineRegionalAlpineEcologyRoot({
      rootSeed: seedFromText("foreign Alpine child"),
      completedTick: state.updatedAtTick,
    });
    const { integrity: _integrity, ...stateBase } = state;
    const foreignChildren = {
      ...stateBase,
      alpineRoot: foreignRoot,
    };
    const forged = {
      ...foreignChildren,
      integrity: hashCanonical(foreignChildren),
    };
    expect(canonicalizeRegionalEcologyStateV2(forged)).toBeNull();
    expect(deserializeRegionalEcologyStateV2(stableStringify(forged))).toBeNull();
  });
});

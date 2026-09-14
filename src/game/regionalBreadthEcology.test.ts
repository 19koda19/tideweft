import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { hashCanonical, stableStringify } from "../sim/util";
import { replaceCoreEcologyAggregatePatchActor } from "./coreEcology";
import {
  CORE_ECOLOGY_BREADTH_CURRENT_EPOCH,
  CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_COHORT_ID,
  deriveCoreEcologyBreadthHabitat,
} from "./coreEcologyBreadthHabitat";
import { repositionCoreWildlifeActor } from "./coreWildlifeActor";
import {
  REGIONAL_BREADTH_ECOLOGY_MAX_SERIALIZED_BYTES,
  REGIONAL_BREADTH_ECOLOGY_OWNER_ID,
  activateRegionalBreadthEcologyThroughEpoch,
  advanceRegionalBreadthEcologyRoot,
  canonicalRegionalBreadthEcologyRootForWorld,
  canonicalizeRegionalBreadthEcologyRoot,
  createPristineRegionalBreadthEcologyRoot,
  createRegionalBreadthEcologyRegionDelta,
  deserializeRegionalBreadthEcologyRoot,
  putRegionalBreadthEcologyResidentDeviation,
  regionalBreadthEcologyResidentPatchForRegion,
  regionalBreadthEcologyResidentsForActiveRegions,
  serializeRegionalBreadthEcologyRoot,
  type RegionalBreadthEcologyRootV1,
} from "./regionalBreadthEcology";
import { createCoreEcologyBreadthResidentPatch } from "./regionalBreadthCohort";
import { createWorldPosition } from "./worldPosition";

export const ALPHA37_ESTUARY_BREADTH_ROOT_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha37-estuary-breadth-root-shared-invariants:v1" as const;
export const ALPHA38_MARSH_CHANNEL_WEB_ROOT_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha38-marsh-channel-web-root-shared-invariants:v1" as const;

const SEED = seedFromText("alpha37 estuary breadth shared properties");
const FOREIGN_SEED = seedFromText("alpha37 foreign breadth root");
const COHORT = CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_COHORT_ID;
const HERON_REGION = createRegionCoord(1_050, 38_043);
const ABSENT_REGION = createRegionCoord(-1, -1);
const DESTINATION = createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT);

function heronHabitat() {
  const habitat = deriveCoreEcologyBreadthHabitat({
    seed: SEED,
    region: HERON_REGION,
    cohortId: COHORT,
  });
  expect(habitat.populations.find(({ species }) => (
    species === "great-blue-heron"
  ))?.populationUnits).toBe(1);
  return habitat;
}

function heronPatch() {
  return createCoreEcologyBreadthResidentPatch({
    seed: SEED,
    habitat: heronHabitat(),
    tick: 0,
  });
}

function movedHeronPatch() {
  const patch = heronPatch();
  const actor = patch.populations.find(
    ({ species }) => species === "great-blue-heron",
  )!.members[0]!.actor;
  return replaceCoreEcologyAggregatePatchActor(
    patch,
    repositionCoreWildlifeActor(actor, {
      atTick: 0,
      position: createWorldPosition(DESTINATION, 1_000, 2_000),
      heading: 875_000,
    }),
  );
}

function reseal<T extends Record<string, unknown>>(value: T) {
  const { integrity: _integrity, ...base } = value;
  return { ...base, integrity: hashCanonical(base) };
}

describe(`${ALPHA37_ESTUARY_BREADTH_ROOT_SHARED_INVARIANTS_OWNER_INTENT} ${ALPHA38_MARSH_CHANNEL_WEB_ROOT_SHARED_INVARIANTS_OWNER_INTENT} append-only sparse root`, () => {
  it("activates an append-only cohort epoch and round-trips one bounded world authority", () => {
    const empty = createPristineRegionalBreadthEcologyRoot({
      rootSeed: SEED,
      completedTick: 17,
    }, 0);
    expect(empty).toMatchObject({
      ownerId: REGIONAL_BREADTH_ECOLOGY_OWNER_ID,
      activeThroughEpoch: 0,
      activations: [],
      regions: [],
      revision: 0,
    });
    const active = activateRegionalBreadthEcologyThroughEpoch(
      empty,
      { rootSeed: SEED, completedTick: 17 },
      CORE_ECOLOGY_BREADTH_CURRENT_EPOCH,
    );
    expect(active.activeThroughEpoch).toBe(CORE_ECOLOGY_BREADTH_CURRENT_EPOCH);
    expect(active.activations).toHaveLength(CORE_ECOLOGY_BREADTH_CURRENT_EPOCH);
    expect(active.activations[0]).toMatchObject({
      activationOrdinal: 0,
      activatedAtTick: 17,
      cohortId: COHORT,
      cohortEpoch: 1,
    });
    expect(active.activations.at(-1)).toMatchObject({
      activationOrdinal: CORE_ECOLOGY_BREADTH_CURRENT_EPOCH - 1,
      activatedAtTick: 17,
      cohortEpoch: CORE_ECOLOGY_BREADTH_CURRENT_EPOCH,
    });
    const text = serializeRegionalBreadthEcologyRoot(active);
    expect(new TextEncoder().encode(text).byteLength).toBeLessThan(
      REGIONAL_BREADTH_ECOLOGY_MAX_SERIALIZED_BYTES,
    );
    const restored = deserializeRegionalBreadthEcologyRoot(text);
    expect(restored).toEqual(active);
    expect(canonicalRegionalBreadthEcologyRootForWorld(restored, {
      rootSeed: SEED,
      completedTick: 17,
    })).toBe(restored);
    expect(canonicalRegionalBreadthEcologyRootForWorld(restored, {
      rootSeed: FOREIGN_SEED,
      completedTick: 17,
    })).toBeNull();
  });

  it("rejects a fully resealed foreign activation identity at the world boundary", () => {
    const root = createPristineRegionalBreadthEcologyRoot({
      rootSeed: SEED,
      completedTick: 0,
    }, 1);
    const activation = root.activations[0]!;
    const forgedActivation = reseal({
      ...activation,
      stableId: `${activation.stableId}-foreign`,
    });
    const forged = reseal({
      ...root,
      activations: [forgedActivation],
    });
    expect(canonicalizeRegionalBreadthEcologyRoot(forged)).not.toBeNull();
    expect(canonicalRegionalBreadthEcologyRootForWorld(forged, {
      rootSeed: SEED,
      completedTick: 0,
    })).toBeNull();
  });

  it("rederives present and absent baselines without persisting mere visitation", () => {
    const root = createPristineRegionalBreadthEcologyRoot({
      rootSeed: SEED,
      completedTick: 0,
    });
    const present = regionalBreadthEcologyResidentPatchForRegion(
      root,
      SEED,
      COHORT,
      HERON_REGION,
    );
    expect(present).not.toBeNull();
    expect(regionalBreadthEcologyResidentPatchForRegion(
      root,
      SEED,
      COHORT,
      ABSENT_REGION,
    )).toBeNull();
    expect(putRegionalBreadthEcologyResidentDeviation(root, {
      rootSeed: SEED,
      patch: present!,
    })).toBe(root);
    expect(root.regions).toEqual([]);
    expect(() => createRegionalBreadthEcologyRegionDelta({
      rootSeed: SEED,
      cohortId: COHORT,
      region: HERON_REGION,
      baselineHash: heronHabitat().derivationHash,
      revision: 1,
      eventOrdinal: 1,
      residentPatch: heronPatch(),
    })).toThrow(/does not persist pristine baselines/u);
  });

  it("stores one coarse deviation, finds its extreme physical residence, and reloads without reroll", () => {
    const root = createPristineRegionalBreadthEcologyRoot({
      rootSeed: SEED,
      completedTick: 0,
    });
    const moved = movedHeronPatch();
    const stored = putRegionalBreadthEcologyResidentDeviation(root, {
      rootSeed: SEED,
      patch: moved,
    });
    expect(stored.regions).toHaveLength(1);
    expect(stored.regions[0]!.residentPatch.populations.flatMap(
      ({ members }) => members,
    ).every(({ materialization }) => materialization === "coarse")).toBe(true);
    const restored = deserializeRegionalBreadthEcologyRoot(
      serializeRegionalBreadthEcologyRoot(stored),
    );
    expect(restored).not.toBeNull();
    const later = advanceRegionalBreadthEcologyRoot(restored, 128);
    const active = regionalBreadthEcologyResidentsForActiveRegions(
      later,
      SEED,
      [DESTINATION],
    );
    expect(active).not.toBeNull();
    const movedSource = active!.find(({ sourceKey }) => (
      sourceKey === stored.regions[0]!.residentPatch.patchKey
    ));
    expect(movedSource).toBeDefined();
    expect(movedSource!.patch.originRegion).toEqual(HERON_REGION);
    expect(movedSource!.patch.updatedAtTick).toBe(128);
    expect(movedSource!.patch.populations.find(
      ({ species }) => species === "great-blue-heron",
    )!.members[0]!.actor.address.position.region).toEqual(DESTINATION);
    expect(movedSource!.patch.mortalityTransactions).toEqual([]);
    expect(movedSource!.patch.carcasses).toEqual([]);
    expect(stableStringify(regionalBreadthEcologyResidentsForActiveRegions(
      deserializeRegionalBreadthEcologyRoot(serializeRegionalBreadthEcologyRoot(later)),
      SEED,
      [DESTINATION],
    ))).toBe(stableStringify(active));
  });

  it("fails closed on excessive hot windows, malformed clocks, and unknown keys", () => {
    const root = createPristineRegionalBreadthEcologyRoot({
      rootSeed: SEED,
      completedTick: 0,
    });
    expect(regionalBreadthEcologyResidentsForActiveRegions(
      root,
      SEED,
      Array.from({ length: 10 }, (_, ordinal) => createRegionCoord(
        ordinal,
        -ordinal,
      )),
    )).toBeNull();
    expect(() => advanceRegionalBreadthEcologyRoot(root, -1)).toThrow(
      /cannot rewind/u,
    );
    expect(canonicalizeRegionalBreadthEcologyRoot({
      ...root,
      anotherBatchNeedsAnotherRoot: true,
    })).toBeNull();
  });
});

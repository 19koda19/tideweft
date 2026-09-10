import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { stableStringify } from "../sim/util";
import {
  replaceCoreEcologyAggregatePatchActor,
  setCoreEcologyAggregatePatchMaterializedActors,
} from "./coreEcology";
import {
  deriveCoreEcologyPolarConsumerHabitat,
  type CoreEcologyPolarConsumerHabitat,
} from "./coreEcologyPolarConsumerHabitat";
import { repositionCoreWildlifeActor } from "./coreWildlifeActor";
import {
  REGIONAL_POLAR_CONSUMER_ECOLOGY_MAX_SERIALIZED_BYTES,
  REGIONAL_POLAR_CONSUMER_ECOLOGY_OWNER_ID,
  advanceRegionalPolarConsumerEcologyRoot,
  canonicalRegionalPolarConsumerEcologyRootForWorld,
  canonicalizeRegionalPolarConsumerEcologyRoot,
  createPristineRegionalPolarConsumerEcologyRoot,
  createRegionalPolarConsumerEcologyRegionDelta,
  deserializeRegionalPolarConsumerEcologyRoot,
  putRegionalPolarConsumerEcologyResidentDeviation,
  regionalPolarConsumerEcologyResidentPatchForRegion,
  regionalPolarConsumerEcologyResidentsForActiveRegions,
  serializeRegionalPolarConsumerEcologyRoot,
  type RegionalPolarConsumerEcologyRootV1,
} from "./regionalPolarConsumerEcology";
import { createCoreEcologyPolarConsumerResidentPatch } from "./regionalPolarConsumerResidents";
import { createWorldPosition } from "./worldPosition";

export const ALPHA36_POLAR_CONSUMER_ROOT_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha36-polar-consumer-root-shared-invariants:v1" as const;

interface Fixture {
  readonly seed: ReturnType<typeof seedFromText>;
  readonly habitat: CoreEcologyPolarConsumerHabitat;
}

const ABSENT_REGION = createRegionCoord(4_033, -329);
const DESTINATION = createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT);
function fixture(): Fixture {
  const seed = seedFromText("polar consumer origin");
  const habitat = deriveCoreEcologyPolarConsumerHabitat({
    seed,
    region: createRegionCoord(0, 0),
  });
  if (habitat.totalPopulationUnits !== 2) {
    throw new Error(
      "Representative Alpha36 fixture lost its two-species chain",
    );
  }
  return Object.freeze({ seed, habitat });
}

function pristinePatch(tick = 0) {
  const { seed, habitat } = fixture();
  return createCoreEcologyPolarConsumerResidentPatch({ seed, habitat, tick });
}

function movedPatch(materialized = false) {
  const residentPatch = pristinePatch();
  const actor = residentPatch.populations[1]!.members[0]!.actor;
  const source = materialized
    ? setCoreEcologyAggregatePatchMaterializedActors(residentPatch, {
        atTick: 0,
        actorIds: [actor.identity.stableId],
      })
    : residentPatch;
  const current = source.populations[1]!.members[0]!.actor;
  return replaceCoreEcologyAggregatePatchActor(
    source,
    repositionCoreWildlifeActor(current, {
      atTick: 0,
      position: createWorldPosition(DESTINATION, 1_000, 2_000),
      heading: 875_000,
    }),
  );
}

describe(`${ALPHA36_POLAR_CONSUMER_ROOT_SHARED_INVARIANTS_OWNER_INTENT} sparse root`, () => {
  it("round-trips a bounded world root and rejects foreign or forged authority", () => {
    const { seed } = fixture();
    const root = createPristineRegionalPolarConsumerEcologyRoot({
      rootSeed: seed,
      completedTick: 0,
    });
    expect(root).toMatchObject({
      ownerId: REGIONAL_POLAR_CONSUMER_ECOLOGY_OWNER_ID,
      revision: 0,
      lastEventOrdinal: 0,
      regions: [],
    });
    const text = serializeRegionalPolarConsumerEcologyRoot(root);
    expect(new TextEncoder().encode(text).byteLength).toBeLessThan(
      REGIONAL_POLAR_CONSUMER_ECOLOGY_MAX_SERIALIZED_BYTES,
    );
    expect(deserializeRegionalPolarConsumerEcologyRoot(text)).toEqual(root);
    expect(
      canonicalRegionalPolarConsumerEcologyRootForWorld(root, {
        rootSeed: seed,
        completedTick: 0,
      }),
    ).toBe(root);
    expect(
      canonicalRegionalPolarConsumerEcologyRootForWorld(root, {
        rootSeed: seedFromText("foreign polar-consumer root"),
        completedTick: 0,
      }),
    ).toBeNull();
    const forged: RegionalPolarConsumerEcologyRootV1 = {
      ...root,
      revision: 1,
    };
    expect(canonicalizeRegionalPolarConsumerEcologyRoot(forged)).toBeNull();
  });

  it("rederives only viable habitat and never persists pristine visits", () => {
    const { seed, habitat } = fixture();
    const root = createPristineRegionalPolarConsumerEcologyRoot({
      rootSeed: seed,
      completedTick: 0,
    });
    const present = regionalPolarConsumerEcologyResidentPatchForRegion(
      root,
      seed,
      habitat.region,
    );
    expect(present).not.toBeNull();
    expect(
      regionalPolarConsumerEcologyResidentPatchForRegion(
        root,
        seed,
        ABSENT_REGION,
      ),
    ).toBeNull();
    expect(
      putRegionalPolarConsumerEcologyResidentDeviation(root, {
        rootSeed: seed,
        patch: present!,
      }),
    ).toBe(root);
    expect(root.regions).toEqual([]);
  });

  it("normalizes full state, reloads one conserved deviation, and catches it up dormant", () => {
    const { seed, habitat } = fixture();
    const root = createPristineRegionalPolarConsumerEcologyRoot({
      rootSeed: seed,
      completedTick: 0,
    });
    const moved = movedPatch(true);
    expect(moved.populations[1]!.members[0]!.materialization).toBe(
      "materialized",
    );
    const stored = putRegionalPolarConsumerEcologyResidentDeviation(root, {
      rootSeed: seed,
      patch: moved,
    });
    expect(stored.regions).toHaveLength(1);
    expect(
      stored.regions[0]!.residentPatch.populations[1]!.members[0]!
        .materialization,
    ).toBe("coarse");
    const restored = deserializeRegionalPolarConsumerEcologyRoot(
      serializeRegionalPolarConsumerEcologyRoot(stored),
    );
    expect(restored).not.toBeNull();
    const later = advanceRegionalPolarConsumerEcologyRoot(
      restored,
      1_000_000_000,
    );
    const active = regionalPolarConsumerEcologyResidentsForActiveRegions(
      later,
      seed,
      [DESTINATION, DESTINATION],
    );
    expect(active).toHaveLength(1);
    const residentPatch = active![0]!.patch;
    expect(residentPatch.updatedAtTick).toBe(1_000_000_000);
    expect(residentPatch.originRegion).toEqual(habitat.region);
    expect(
      residentPatch.populations.map(({ populationSize }) => populationSize),
    ).toEqual([1, 1]);
    expect(
      residentPatch.populations[1]!.members[0]!.actor.address.position.region,
    ).toEqual(DESTINATION);
    expect(residentPatch.aggregatePopulations).toEqual([]);
    expect(residentPatch.mortalityTransactions).toEqual([]);
    expect(residentPatch.carcasses).toEqual([]);
    expect(
      stableStringify(
        regionalPolarConsumerEcologyResidentsForActiveRegions(
          deserializeRegionalPolarConsumerEcologyRoot(
            serializeRegionalPolarConsumerEcologyRoot(later),
          ),
          seed,
          [DESTINATION],
        ),
      ),
    ).toBe(stableStringify(active));
  });

  it("fails closed on pristine deltas, excess hot regions, and malformed roots", () => {
    const { seed, habitat } = fixture();
    const residentPatch = pristinePatch();
    expect(() =>
      createRegionalPolarConsumerEcologyRegionDelta({
        rootSeed: seed,
        region: habitat.region,
        baselineHash: habitat.derivationHash,
        revision: 1,
        eventOrdinal: 1,
        residentPatch,
      }),
    ).toThrow(/does not persist pristine baselines/u);
    const root = createPristineRegionalPolarConsumerEcologyRoot({
      rootSeed: seed,
      completedTick: 0,
    });
    expect(
      regionalPolarConsumerEcologyResidentsForActiveRegions(
        root,
        seed,
        Array.from({ length: 10 }, (_, index) =>
          createRegionCoord(index, -index),
        ),
      ),
    ).toBeNull();
    expect(
      canonicalizeRegionalPolarConsumerEcologyRoot({
        ...root,
        hiddenPopulation: 1,
      }),
    ).toBeNull();
  });
});

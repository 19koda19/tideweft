import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { stableStringify } from "../sim/util";
import {
  replaceCoreEcologyAggregatePatchActor,
  setCoreEcologyAggregatePatchMaterializedActors,
} from "./coreEcology";
import { deriveCoreEcologyColdShoreHabitat } from "./coreEcologyColdShoreHabitat";
import {
  deriveCoreEcologyPolarShoreHabitat,
  deriveCoreEcologyPolarShoreTerritory,
} from "./coreEcologyPolarShoreHabitat";
import { repositionCoreWildlifeActor } from "./coreWildlifeActor";
import {
  REGIONAL_COLD_SHORE_ECOLOGY_MAX_SERIALIZED_BYTES,
  REGIONAL_COLD_SHORE_ECOLOGY_OWNER_ID,
  advanceRegionalColdShoreEcologyRoot,
  canonicalRegionalColdShoreEcologyRootForWorld,
  canonicalizeRegionalColdShoreEcologyRoot,
  createPristineRegionalColdShoreEcologyRoot,
  createRegionalColdShoreEcologyRegionDelta,
  deserializeRegionalColdShoreEcologyRoot,
  putRegionalColdShoreEcologyResidentDeviation,
  regionalColdShoreEcologyResidentPatchForRegion,
  regionalColdShoreEcologyResidentsForActiveRegions,
  serializeRegionalColdShoreEcologyRoot,
  type RegionalColdShoreEcologyRootV1,
} from "./regionalColdShoreEcology";
import { createCoreEcologyColdShoreResidentPatch } from "./regionalColdShoreResidents";
import { createWorldPosition } from "./worldPosition";

export const ALPHA35_COLD_SHORE_ROOT_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha35-cold-shore-root-shared-invariants:v1" as const;

const SEED = seedFromText("polar habitat fuzz 29");
const REGION = createRegionCoord(-1653, 664);
const ABSENT_REGION = createRegionCoord(4_033, -329);
const DESTINATION = createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT);

function habitat() {
  const result = deriveCoreEcologyColdShoreHabitat({
    seed: SEED,
    region: REGION,
  });
  expect(result.totalPopulationUnits).toBe(1);
  return result;
}

function pristinePatch(tick = 0) {
  return createCoreEcologyColdShoreResidentPatch({
    seed: SEED,
    habitat: habitat(),
    tick,
  });
}

function movedPatch(materialized = false) {
  const patch = pristinePatch();
  const actor = patch.populations[0]!.members[0]!.actor;
  const source = materialized
    ? setCoreEcologyAggregatePatchMaterializedActors(patch, {
        atTick: 0,
        actorIds: [actor.identity.stableId],
      })
    : patch;
  const current = source.populations[0]!.members[0]!.actor;
  return replaceCoreEcologyAggregatePatchActor(
    source,
    repositionCoreWildlifeActor(current, {
      atTick: 0,
      position: createWorldPosition(DESTINATION, 1_000, 2_000),
      heading: 875_000,
    }),
  );
}

describe(`${ALPHA35_COLD_SHORE_ROOT_SHARED_INVARIANTS_OWNER_INTENT} sparse root`, () => {
  it("round-trips a bounded world root and rejects foreign or forged authority", () => {
    const root = createPristineRegionalColdShoreEcologyRoot({
      rootSeed: SEED,
      completedTick: 0,
    });
    expect(root).toMatchObject({
      ownerId: REGIONAL_COLD_SHORE_ECOLOGY_OWNER_ID,
      revision: 0,
      lastEventOrdinal: 0,
      regions: [],
    });
    const text = serializeRegionalColdShoreEcologyRoot(root);
    expect(new TextEncoder().encode(text).byteLength).toBeLessThan(
      REGIONAL_COLD_SHORE_ECOLOGY_MAX_SERIALIZED_BYTES,
    );
    expect(deserializeRegionalColdShoreEcologyRoot(text)).toEqual(root);
    expect(
      canonicalRegionalColdShoreEcologyRootForWorld(root, {
        rootSeed: SEED,
        completedTick: 0,
      }),
    ).toBe(root);
    expect(
      canonicalRegionalColdShoreEcologyRootForWorld(root, {
        rootSeed: seedFromText("foreign cold-shore root"),
        completedTick: 0,
      }),
    ).toBeNull();
    const forged: RegionalColdShoreEcologyRootV1 = { ...root, revision: 1 };
    expect(canonicalizeRegionalColdShoreEcologyRoot(forged)).toBeNull();
  });

  it("rederives only viable habitat and never persists pristine visits", () => {
    const root = createPristineRegionalColdShoreEcologyRoot({
      rootSeed: SEED,
      completedTick: 0,
    });
    const polarBefore = stableStringify(
      deriveCoreEcologyPolarShoreHabitat({
        seed: SEED,
        region: REGION,
      }),
    );
    const present = regionalColdShoreEcologyResidentPatchForRegion(
      root,
      SEED,
      REGION,
    );
    expect(present).not.toBeNull();
    expect(
      regionalColdShoreEcologyResidentPatchForRegion(root, SEED, ABSENT_REGION),
    ).toBeNull();
    expect(
      putRegionalColdShoreEcologyResidentDeviation(root, {
        rootSeed: SEED,
        patch: present!,
      }),
    ).toBe(root);
    expect(root.regions).toEqual([]);
    expect(
      stableStringify(
        deriveCoreEcologyPolarShoreHabitat({
          seed: SEED,
          region: REGION,
        }),
      ),
    ).toBe(polarBefore);
  });

  it("normalizes full state, reloads one conserved deviation, and catches it up dormant", () => {
    const root = createPristineRegionalColdShoreEcologyRoot({
      rootSeed: SEED,
      completedTick: 0,
    });
    const moved = movedPatch(true);
    expect(moved.populations[0]!.members[0]!.materialization).toBe(
      "materialized",
    );
    const stored = putRegionalColdShoreEcologyResidentDeviation(root, {
      rootSeed: SEED,
      patch: moved,
    });
    expect(stored.regions).toHaveLength(1);
    expect(
      stored.regions[0]!.residentPatch.populations[0]!.members[0]!
        .materialization,
    ).toBe("coarse");
    const restored = deserializeRegionalColdShoreEcologyRoot(
      serializeRegionalColdShoreEcologyRoot(stored),
    );
    expect(restored).not.toBeNull();
    const later = advanceRegionalColdShoreEcologyRoot(restored, 1_000_000_000);
    const startedAt = performance.now();
    const active = regionalColdShoreEcologyResidentsForActiveRegions(
      later,
      SEED,
      [DESTINATION, DESTINATION],
    );
    expect(performance.now() - startedAt).toBeLessThan(2_000);
    expect(active).toHaveLength(1);
    const patch = active![0]!.patch;
    expect(patch.updatedAtTick).toBe(1_000_000_000);
    expect(patch.originRegion).toEqual(REGION);
    expect(patch.populations[0]!.populationSize).toBe(1);
    expect(
      patch.populations[0]!.members[0]!.actor.address.position.region,
    ).toEqual(DESTINATION);
    expect(patch.aggregatePopulations).toEqual([]);
    expect(patch.mortalityTransactions).toEqual([]);
    expect(patch.carcasses).toEqual([]);
    expect(
      stableStringify(
        regionalColdShoreEcologyResidentsForActiveRegions(
          deserializeRegionalColdShoreEcologyRoot(
            serializeRegionalColdShoreEcologyRoot(later),
          ),
          SEED,
          [DESTINATION],
        ),
      ),
    ).toBe(stableStringify(active));
  });

  it("fails closed on pristine deltas, excess hot regions, and malformed roots", () => {
    const patch = pristinePatch();
    expect(() =>
      createRegionalColdShoreEcologyRegionDelta({
        rootSeed: SEED,
        region: REGION,
        baselineHash: habitat().derivationHash,
        revision: 1,
        eventOrdinal: 1,
        residentPatch: patch,
      }),
    ).toThrow(/does not persist pristine baselines/u);
    const root = createPristineRegionalColdShoreEcologyRoot({
      rootSeed: SEED,
      completedTick: 0,
    });
    expect(
      regionalColdShoreEcologyResidentsForActiveRegions(
        root,
        SEED,
        Array.from({ length: 10 }, (_, index) =>
          createRegionCoord(index, -index),
        ),
      ),
    ).toBeNull();
    expect(
      canonicalizeRegionalColdShoreEcologyRoot({
        ...root,
        adoption: { version: 28 },
      }),
    ).toBeNull();
  });

  it("prefilters a broad non-host sample without growing or rewriting the root", () => {
    const root = createPristineRegionalColdShoreEcologyRoot({
      rootSeed: SEED,
      completedTick: 0,
    });
    const bytes = serializeRegionalColdShoreEcologyRoot(root);
    const nonHosts = Array.from({ length: 256 }, (_, ordinal) =>
      createRegionCoord(-50_000 + ordinal * 17, 40_000 - ordinal * 29),
    ).filter(
      (region) =>
        !deriveCoreEcologyPolarShoreTerritory(SEED, region).regionIsHost,
    );
    expect(nonHosts.length).toBeGreaterThan(100);
    const startedAt = performance.now();
    for (const region of nonHosts) {
      const result = regionalColdShoreEcologyResidentsForActiveRegions(
        root,
        SEED,
        [region],
      );
      expect(result === null || result.length <= 1).toBe(true);
    }
    expect(performance.now() - startedAt).toBeLessThan(1_000);
    expect(root.regions).toEqual([]);
    expect(serializeRegionalColdShoreEcologyRoot(root)).toBe(bytes);
  });
});

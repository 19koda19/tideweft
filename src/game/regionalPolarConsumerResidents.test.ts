import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { stableStringify } from "../sim/util";
import {
  replaceCoreEcologyAggregatePatchActor,
  setCoreEcologyAggregatePatchMaterializedActors,
  stepCoreEcologyAggregatePatch,
} from "./coreEcology";
import {
  deriveCoreEcologyPolarConsumerHabitat,
  type CoreEcologyPolarConsumerHabitat,
} from "./coreEcologyPolarConsumerHabitat";
import { repositionCoreWildlifeActor } from "./coreWildlifeActor";
import {
  CORE_ECOLOGY_POLAR_CONSUMER_RESIDENT_SET_OWNER_ID,
  canonicalCoreEcologyPolarConsumerResidentPatch,
  coreEcologyPolarConsumerResidentPatchResidenceRegions,
  coreEcologyPolarConsumerResidentSourceKey,
  createCoreEcologyPolarConsumerResidentPatch,
  deriveCoreEcologyPolarConsumerResidentSet,
  reconcileCoreEcologyPolarConsumerResidentPatchAtTick,
} from "./regionalPolarConsumerResidents";
import { createWorldPosition } from "./worldPosition";

export const ALPHA36_POLAR_CONSUMER_RESIDENT_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha36-polar-consumer-resident-shared-invariants:v1" as const;

interface Fixture {
  readonly seed: ReturnType<typeof seedFromText>;
  readonly habitat: CoreEcologyPolarConsumerHabitat;
}

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

function patch(tick = 0) {
  const { seed, habitat } = fixture();
  return createCoreEcologyPolarConsumerResidentPatch({ seed, habitat, tick });
}

function continuouslyStep(
  initial: ReturnType<typeof createCoreEcologyPolarConsumerResidentPatch>,
  targetTick: number,
) {
  let current = initial;
  for (let tick = current.updatedAtTick + 1; tick <= targetTick; tick += 1) {
    const stepped = stepCoreEcologyAggregatePatch(current, {
      tick,
      actorSteps: [],
    });
    if (stepped === null) throw new Error("Polar-consumer coarse clock failed");
    current = stepped.patch;
  }
  return current;
}

describe(`${ALPHA36_POLAR_CONSUMER_RESIDENT_SHARED_INVARIANTS_OWNER_INTENT} adapter`, () => {
  it("creates the exact seal then bear actors without copying the forage aggregate", () => {
    const { seed, habitat } = fixture();
    const residentPatch = patch();
    expect(residentPatch.populations.map(({ species }) => species)).toEqual([
      "harbor-seal",
      "polar-bear",
    ]);
    for (const [ordinal, population] of residentPatch.populations.entries()) {
      expect(population).toMatchObject({
        baselinePopulationSize: 1,
        populationSize: 1,
        reserveUnits: 0,
      });
      expect(population.members).toHaveLength(1);
      expect(population.members[0]).toMatchObject({
        populationOrdinal: 0,
        representedUnits: 1,
        materialization: "coarse",
      });
      const purpose = ordinal === 0 ? "dry-haulout" : "bear-land";
      expect(population.members[0]!.actor.address.position).toEqual(
        habitat.populations[ordinal]!.anchors.find(
          (anchor) => anchor.purpose === purpose,
        )!.position,
      );
    }
    expect(residentPatch.aggregatePopulations).toEqual([]);
    expect(
      residentPatch.populations.some(
        ({ species }) => species === "atlantic-capelin",
      ),
    ).toBe(false);
    expect(residentPatch.groups.groups).toEqual([]);
    expect(residentPatch.nextMortalityOrdinal).toBe(0);
    expect(residentPatch.mortalityTransactions).toEqual([]);
    expect(residentPatch.carcasses).toEqual([]);
    expect(
      canonicalCoreEcologyPolarConsumerResidentPatch(residentPatch, {
        seed,
        region: habitat.region,
        completedTick: 0,
      }),
    ).toBe(residentPatch);
  });

  it("deduplicates region inputs and keeps unsupported regions honestly absent", () => {
    const { seed, habitat } = fixture();
    const absent = createRegionCoord(4_033, -329);
    const set = deriveCoreEcologyPolarConsumerResidentSet({
      seed,
      regions: [absent, habitat.region, habitat.region, absent],
      tick: 64,
    });
    expect(set.ownerId).toBe(CORE_ECOLOGY_POLAR_CONSUMER_RESIDENT_SET_OWNER_ID);
    expect(set.residents).toHaveLength(1);
    expect(set.residents[0]!.sourceKey).toBe(
      coreEcologyPolarConsumerResidentSourceKey(set.residents[0]!.habitat),
    );
    expect(
      deriveCoreEcologyPolarConsumerResidentSet({
        seed,
        regions: [habitat.region, absent],
        tick: 64,
      }),
    ).toEqual(set);
  });

  it("preserves both exact identities through full, coarse, and dormant states", () => {
    const residentPatch = patch();
    const actorIds = residentPatch.populations.map(
      ({ members }) => members[0]!.actor.identity.stableId,
    );
    const materialized = setCoreEcologyAggregatePatchMaterializedActors(
      residentPatch,
      { atTick: 0, actorIds },
    );
    expect(
      materialized.populations.flatMap(({ members }) =>
        members.map(({ materialization }) => materialization),
      ),
    ).toEqual(["materialized", "materialized"]);
    const coarse = setCoreEcologyAggregatePatchMaterializedActors(
      materialized,
      { atTick: 0, actorIds: [] },
    );
    expect(
      coarse.populations.flatMap(({ members }) =>
        members.map(({ actor }) => actor.identity.stableId),
      ),
    ).toEqual(actorIds);

    const continuous = continuouslyStep(coarse, 128);
    const dormant = reconcileCoreEcologyPolarConsumerResidentPatchAtTick(
      coarse,
      128,
    );
    expect(dormant).not.toBeNull();
    expect(stableStringify(dormant)).toBe(stableStringify(continuous));
    expect(
      dormant!.populations.map(({ populationSize }) => populationSize),
    ).toEqual([1, 1]);

    const startedAt = performance.now();
    const distant = reconcileCoreEcologyPolarConsumerResidentPatchAtTick(
      coarse,
      1_000_000_000,
    );
    expect(distant).not.toBeNull();
    expect(performance.now() - startedAt).toBeLessThan(2_000);
    expect(
      distant!.populations.map(({ populationSize }) => populationSize),
    ).toEqual([1, 1]);
  });

  it("keeps stable origin authority when both actors cross signed extremes", () => {
    const { seed, habitat } = fixture();
    const destination = createRegionCoord(
      -REGION_COORD_LIMIT,
      REGION_COORD_LIMIT,
    );
    let moved = patch();
    for (const population of [...moved.populations]) {
      const actor = moved.populations.find(
        ({ populationKey }) => populationKey === population.populationKey,
      )!.members[0]!.actor;
      moved = replaceCoreEcologyAggregatePatchActor(
        moved,
        repositionCoreWildlifeActor(actor, {
          atTick: 0,
          position: createWorldPosition(destination, 1_000, 2_000),
          heading: 875_000,
        }),
      );
    }
    expect(
      canonicalCoreEcologyPolarConsumerResidentPatch(moved, {
        seed,
        region: habitat.region,
        completedTick: 0,
      }),
    ).toBe(moved);
    expect(
      coreEcologyPolarConsumerResidentPatchResidenceRegions(moved),
    ).toEqual([destination]);
    expect(
      canonicalCoreEcologyPolarConsumerResidentPatch(moved, {
        seed: seedFromText("foreign polar-consumer resident world"),
        region: habitat.region,
        completedTick: 0,
      }),
    ).toBeNull();
  });
});

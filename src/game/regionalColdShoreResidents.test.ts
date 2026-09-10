import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { stableStringify } from "../sim/util";
import {
  replaceCoreEcologyAggregatePatchActor,
  setCoreEcologyAggregatePatchMaterializedActors,
  stepCoreEcologyAggregatePatch,
} from "./coreEcology";
import { deriveCoreEcologyColdShoreHabitat } from "./coreEcologyColdShoreHabitat";
import { repositionCoreWildlifeActor } from "./coreWildlifeActor";
import {
  CORE_ECOLOGY_COLD_SHORE_RESIDENT_SET_OWNER_ID,
  canonicalCoreEcologyColdShoreResidentPatch,
  coreEcologyColdShoreResidentPatchResidenceRegions,
  coreEcologyColdShoreResidentSourceKey,
  createCoreEcologyColdShoreResidentPatch,
  deriveCoreEcologyColdShoreResidentSet,
  reconcileCoreEcologyColdShoreResidentPatchAtTick,
} from "./regionalColdShoreResidents";
import { createWorldPosition } from "./worldPosition";

export const ALPHA35_COLD_SHORE_RESIDENT_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha35-cold-shore-resident-shared-invariants:v1" as const;

const SEED = seedFromText("polar habitat fuzz 29");
const REGION = createRegionCoord(-1653, 664);
const ABSENT_REGION = createRegionCoord(4_033, -329);

function fixture(tick = 0) {
  const habitat = deriveCoreEcologyColdShoreHabitat({
    seed: SEED,
    region: REGION,
  });
  expect(habitat.totalPopulationUnits).toBe(1);
  return {
    habitat,
    patch: createCoreEcologyColdShoreResidentPatch({
      seed: SEED,
      habitat,
      tick,
    }),
  };
}

function continuouslyStep(
  initial: ReturnType<typeof createCoreEcologyColdShoreResidentPatch>,
  targetTick: number,
) {
  let patch = initial;
  for (let tick = patch.updatedAtTick + 1; tick <= targetTick; tick += 1) {
    const stepped = stepCoreEcologyAggregatePatch(patch, {
      tick,
      actorSteps: [],
    });
    if (stepped === null) throw new Error("Cold-shore coarse clock failed");
    patch = stepped.patch;
  }
  return patch;
}

describe(`${ALPHA35_COLD_SHORE_RESIDENT_SHARED_INVARIANTS_OWNER_INTENT} adapter`, () => {
  it("creates one conserved addressable actor without owning the forage aggregate", () => {
    const { habitat, patch } = fixture();
    expect(patch.populations).toHaveLength(1);
    expect(patch.populations[0]).toMatchObject({
      species: "arctic-fox",
      baselinePopulationSize: 1,
      populationSize: 1,
      reserveUnits: 0,
    });
    expect(patch.populations[0]!.members).toHaveLength(1);
    const member = patch.populations[0]!.members[0]!;
    expect(member.materialization).toBe("coarse");
    expect(member.representedUnits).toBe(1);
    expect(member.actor.address.position).toEqual(
      habitat.populations[0]!.anchors[0]!.position,
    );
    expect(patch.aggregatePopulations).toEqual([]);
    expect(
      patch.populations.some(({ species }) => species === "atlantic-capelin"),
    ).toBe(false);
    expect(patch.groups.groups).toEqual([]);
    expect(patch.nextMortalityOrdinal).toBe(0);
    expect(patch.mortalityTransactions).toEqual([]);
    expect(patch.carcasses).toEqual([]);
    expect(
      canonicalCoreEcologyColdShoreResidentPatch(patch, {
        seed: SEED,
        region: REGION,
        completedTick: 0,
      }),
    ).toBe(patch);
    expect(stableStringify(patch)).not.toMatch(
      /targetActor|capture|consumption|reproduction|voice|snow|ice|polar-bear/u,
    );
  });

  it("deduplicates caller regions and keeps unsupported shore honestly absent", () => {
    const set = deriveCoreEcologyColdShoreResidentSet({
      seed: SEED,
      regions: [ABSENT_REGION, REGION, REGION, ABSENT_REGION],
      tick: 64,
    });
    expect(set.ownerId).toBe(CORE_ECOLOGY_COLD_SHORE_RESIDENT_SET_OWNER_ID);
    expect(set.residents).toHaveLength(1);
    expect(set.residents[0]!.sourceKey).toBe(
      coreEcologyColdShoreResidentSourceKey(set.residents[0]!.habitat),
    );
    expect(
      deriveCoreEcologyColdShoreResidentSet({
        seed: SEED,
        regions: [REGION, ABSENT_REGION],
        tick: 64,
      }),
    ).toEqual(set);
  });

  it("preserves identity and population through full/coarse and dormant stepping", () => {
    const { patch } = fixture();
    const actorId = patch.populations[0]!.members[0]!.actor.identity.stableId;
    const materialized = setCoreEcologyAggregatePatchMaterializedActors(patch, {
      atTick: 0,
      actorIds: [actorId],
    });
    expect(materialized.populations[0]!.members[0]!.materialization).toBe(
      "materialized",
    );
    expect(
      canonicalCoreEcologyColdShoreResidentPatch(materialized, {
        seed: SEED,
        region: REGION,
        completedTick: 0,
      }),
    ).toBe(materialized);
    const coarse = setCoreEcologyAggregatePatchMaterializedActors(
      materialized,
      {
        atTick: 0,
        actorIds: [],
      },
    );
    expect(coarse.populations[0]!.populationSize).toBe(1);
    expect(coarse.populations[0]!.members[0]!.actor.identity.stableId).toBe(
      actorId,
    );

    const continuous = continuouslyStep(coarse, 128);
    const dormant = reconcileCoreEcologyColdShoreResidentPatchAtTick(
      coarse,
      128,
    );
    expect(dormant).not.toBeNull();
    expect(stableStringify(dormant)).toBe(stableStringify(continuous));
    expect(dormant!.populations[0]!.populationSize).toBe(1);
    expect(dormant!.mortalityTransactions).toEqual([]);
    expect(dormant!.carcasses).toEqual([]);

    const startedAt = performance.now();
    const distant = reconcileCoreEcologyColdShoreResidentPatchAtTick(
      coarse,
      1_000_000_000,
    );
    expect(distant).not.toBeNull();
    expect(performance.now() - startedAt).toBeLessThan(2_000);
    expect(distant!.populations[0]!.populationSize).toBe(1);
  });

  it("keeps stable origin authority when the actor crosses signed extremes", () => {
    const { patch } = fixture();
    const actor = patch.populations[0]!.members[0]!.actor;
    const destination = createRegionCoord(
      -REGION_COORD_LIMIT,
      REGION_COORD_LIMIT,
    );
    const moved = replaceCoreEcologyAggregatePatchActor(
      patch,
      repositionCoreWildlifeActor(actor, {
        atTick: 0,
        position: createWorldPosition(destination, 1_000, 2_000),
        heading: 875_000,
      }),
    );
    expect(
      canonicalCoreEcologyColdShoreResidentPatch(moved, {
        seed: SEED,
        region: REGION,
        completedTick: 0,
      }),
    ).toBe(moved);
    expect(coreEcologyColdShoreResidentPatchResidenceRegions(moved)).toEqual([
      destination,
    ]);
    expect(
      canonicalCoreEcologyColdShoreResidentPatch(moved, {
        seed: seedFromText("foreign cold-shore resident world"),
        region: REGION,
        completedTick: 0,
      }),
    ).toBeNull();
  });
});

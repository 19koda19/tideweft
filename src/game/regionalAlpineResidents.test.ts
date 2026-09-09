import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { stableStringify } from "../sim/util";
import {
  replaceCoreEcologyAggregatePatchActor,
} from "./coreEcology";
import { deriveCoreEcologyAlpineHabitat } from "./coreEcologyAlpineHabitat";
import { repositionCoreWildlifeActor } from "./coreWildlifeActor";
import {
  canonicalCoreEcologyAlpineResidentPatch,
  coreEcologyAlpineResidentPatchResidenceRegions,
  coreEcologyAlpineResidentSourceKey,
  createCoreEcologyAlpineResidentPatch,
  deriveCoreEcologyAlpineResidentSet,
} from "./regionalAlpineResidents";
import { createWorldPosition } from "./worldPosition";

export const ALPHA33_ALPINE_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha33-alpine-shared-invariants:v1" as const;

const GOAT_SEED = seedFromText("wave-f alpine origin");
const GOAT_REGION = createRegionCoord(0, -1);
const MIXED_SEED = seedFromText("alpine resident property");
const MIXED_REGION = createRegionCoord(-1, 0);

function patchFor(seed = MIXED_SEED, region = MIXED_REGION, tick = 0) {
  const habitat = deriveCoreEcologyAlpineHabitat({ seed, region });
  return {
    habitat,
    patch: createCoreEcologyAlpineResidentPatch({ seed, habitat, tick }),
  };
}

describe(`${ALPHA33_ALPINE_SHARED_INVARIANTS_OWNER_INTENT} Wave-F Alpine resident abstraction`, () => {
  it("maps one fixed roster into conserved individual, herd, and aggregate owners", () => {
    const fixtures = [
      patchFor(GOAT_SEED, GOAT_REGION),
      patchFor(MIXED_SEED, MIXED_REGION),
    ];
    for (const { habitat, patch } of fixtures) {
      const representedUnits = patch.populations.reduce((sum, population) => (
        sum + population.populationSize
      ), 0) + patch.aggregatePopulations.reduce((sum, population) => (
        sum + population.populationSize
      ), 0);
      expect(representedUnits).toBe(habitat.totalPopulationUnits);
      expect(patch.nextMortalityOrdinal).toBe(0);
      expect(patch.mortalityTransactions).toEqual([]);
      expect(patch.carcasses).toEqual([]);
      expect(patch.populations.flatMap(({ members }) => members)
        .every(({ materialization }) => materialization === "coarse")).toBe(true);
      expect(canonicalCoreEcologyAlpineResidentPatch(patch, {
        seed: habitat === fixtures[0]!.habitat ? GOAT_SEED : MIXED_SEED,
        region: habitat.region,
        completedTick: 0,
      })).toBe(patch);
    }

    const goat = fixtures[0]!;
    const goatPopulation = goat.patch.populations.find(({ species }) => species === "mountain-goat");
    expect(goatPopulation?.populationSize).toBeGreaterThanOrEqual(2);
    expect(goatPopulation?.populationSize).toBeLessThanOrEqual(5);
    expect(goat.patch.groups.groups).toHaveLength(1);
    expect(goat.patch.groups.groups[0]?.memberOrdinals).toEqual(
      goatPopulation?.members.map(({ populationOrdinal }) => populationOrdinal),
    );

    const mixed = fixtures[1]!;
    expect(mixed.patch.aggregatePopulations).toHaveLength(1);
    expect(mixed.patch.aggregatePopulations[0]).toMatchObject({ species: "american-pika" });
    expect(mixed.patch.populations.find(({ species }) => species === "golden-eagle")?.populationSize)
      .toBe(1);
    expect(stableStringify(mixed.patch)).not.toMatch(
      /targetActor|targetPopulation|mortalityTransactions":\[(?!\])|carcasses":\[(?!\])/u,
    );
  });

  it("is caller-order independent and omits honest empty regions from the source set", () => {
    const regions = [
      createRegionCoord(0, 0),
      MIXED_REGION,
      createRegionCoord(3, -4),
      MIXED_REGION,
    ];
    const forward = deriveCoreEcologyAlpineResidentSet({ seed: MIXED_SEED, regions });
    const replay = deriveCoreEcologyAlpineResidentSet({
      seed: MIXED_SEED,
      regions: [...regions].reverse(),
    });
    expect(stableStringify(replay)).toBe(stableStringify(forward));
    expect(new Set(forward.residents.map(({ sourceKey }) => sourceKey)).size)
      .toBe(forward.residents.length);
    for (const resident of forward.residents) {
      expect(resident.habitat.totalPopulationUnits).toBeGreaterThan(0);
      expect(resident.sourceKey).toBe(coreEcologyAlpineResidentSourceKey(resident.habitat));
      expect(resident.sourceKey).not.toBe(resident.habitat.sourceStableId);
    }
  });

  it("keeps origin-bound identity valid when one solitary resident crosses signed extreme regions", () => {
    const { patch } = patchFor();
    const eagle = patch.populations.find(({ species }) => species === "golden-eagle")
      ?.members[0]?.actor;
    if (eagle === undefined) throw new Error("Golden-eagle cross-region fixture is absent");
    const destination = createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT);
    const moved = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(eagle, {
      atTick: 0,
      position: createWorldPosition(destination, 1_000, 2_000),
      heading: 875_000,
    }));

    expect(canonicalCoreEcologyAlpineResidentPatch(moved, {
      seed: MIXED_SEED,
      region: MIXED_REGION,
      completedTick: 0,
    })).toBe(moved);
    expect(eagle.identity.originRegion).toEqual(MIXED_REGION);
    expect(coreEcologyAlpineResidentPatchResidenceRegions(moved)).toContainEqual(destination);
    expect(canonicalCoreEcologyAlpineResidentPatch(moved, {
      seed: seedFromText("foreign Alpine resident world"),
      region: MIXED_REGION,
      completedTick: 0,
    })).toBeNull();
  });
});

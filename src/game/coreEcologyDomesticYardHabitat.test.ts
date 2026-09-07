import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { createRegionCoord } from "../sim/regions";
import { WORLD_WIDTH } from "../sim/types";
import { stableStringify } from "../sim/util";
import {
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  deserializeCoreEcologyAggregatePatch,
  serializeCoreEcologyAggregatePatch,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_SPECIES,
  CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_VERSION,
  CORE_ECOLOGY_TIDAL_WEB_HABITAT_SPECIES,
  canonicalizeCoreEcologyDomesticYardHabitatAssemblage,
  deriveCoreEcologyDomesticYardHabitatAssemblage,
  deriveCoreEcologyTidalWebHabitatAssemblage,
  type CoreEcologyDomesticYardHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
} from "./worldPosition";

const rootSeed = seedFromText("domestic yard abstraction");
const originRegion = createRegionCoord(-17, 29);
const anchorTileX = 64;
const anchorTileY = 64;
const anchor = Object.freeze({
  anchorId: "settlement:start:storehouse-yard",
  species: "domestic-chicken" as const,
  position: createWorldPosition(
    originRegion,
    anchorTileX * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    anchorTileY * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
  ),
  radiusTiles: 8,
});

function individualInputs(
  habitat: CoreEcologyDomesticYardHabitatAssemblage,
): readonly CoreEcologyPopulationInput[] {
  return habitat.populations.flatMap((population) => (
    population.representation === "individual-representatives"
      && population.populationUnits > 0
      ? [{
          species: population.species,
          populationKey: population.populationKey,
          populationSize: population.populationUnits,
          members: population.allocations.map((allocation) => ({
            populationOrdinal: allocation.allocationOrdinal,
            representedUnits: allocation.representedUnits,
            position: allocation.position,
            materialization: "coarse" as const,
          })),
        }]
      : []
  ));
}

describe("core ecology domestic-yard habitat-v8", () => {
  it("appends one deterministic anchored flock after the exact habitat-v7 prefix", () => {
    const v7 = deriveCoreEcologyTidalWebHabitatAssemblage({ rootSeed, originRegion });
    const first = deriveCoreEcologyDomesticYardHabitatAssemblage({
      rootSeed,
      originRegion,
      domesticAnchor: anchor,
    });
    const replay = deriveCoreEcologyDomesticYardHabitatAssemblage({
      rootSeed,
      originRegion,
      domesticAnchor: anchor,
    });
    const chicken = first.populations.at(-1);

    expect(first).toEqual(replay);
    expect(first.generationVersion).toBe(CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_VERSION);
    expect(first.populations.map(({ species }) => species))
      .toEqual(CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_SPECIES);
    expect(stableStringify(
      first.populations.slice(0, CORE_ECOLOGY_TIDAL_WEB_HABITAT_SPECIES.length),
    )).toBe(stableStringify(v7.populations));
    expect(stableStringify(first.tidalAnchors)).toBe(stableStringify(v7.tidalAnchors));
    expect(chicken).toMatchObject({
      species: "domestic-chicken",
      representation: "individual-representatives",
      activitySignal: { activePeriod: "variable", kind: "foraging" },
    });
    expect(chicken?.populationUnits).toBeGreaterThanOrEqual(2);
    expect(chicken?.populationUnits).toBeLessThanOrEqual(3);
    expect(chicken?.allocations).toHaveLength(chicken?.populationUnits ?? 0);
    expect(chicken?.allocations.every(({ tileIndex }) => {
      const tileX = tileIndex % WORLD_WIDTH;
      const tileY = Math.trunc(tileIndex / WORLD_WIDTH);
      return Math.abs(tileX - anchorTileX) + Math.abs(tileY - anchorTileY)
        <= anchor.radiusTiles;
    })).toBe(true);
    expect(new Set(chicken?.allocations.map(({ tileIndex }) => tileIndex)).size)
      .toBe(chicken?.allocations.length);
    expect(first.populations.reduce((sum, population) => (
      sum + population.allocations.length
    ), 0)).toBeLessThanOrEqual(CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_MAX_ALLOCATIONS);
    expect(canonicalizeCoreEcologyDomesticYardHabitatAssemblage(first)).toEqual(first);
  });

  it("fails closed when the supplied home identity is altered", () => {
    const value = deriveCoreEcologyDomesticYardHabitatAssemblage({
      rootSeed,
      originRegion,
      domesticAnchor: anchor,
    });
    expect(canonicalizeCoreEcologyDomesticYardHabitatAssemblage({
      ...value,
      domesticAnchor: { ...value.domesticAnchor, anchorId: "not canonical space" },
    })).toBeNull();
  });

  it("authenticates the additive habitat-v8 aggregate derivation without special actor paths", () => {
    const habitat = deriveCoreEcologyDomesticYardHabitatAssemblage({
      rootSeed,
      originRegion,
      domesticAnchor: anchor,
    });
    const patch = createCoreEcologyAggregatePatch({
      seed: rootSeed,
      patchKey: "domestic-yard:current",
      originRegion,
      populations: individualInputs(habitat),
      derivation: { kind: "habitat-v8", habitat },
    });
    const chicken = patch.populations.find(({ species }) => species === "domestic-chicken");

    expect(patch.derivation.kind).toBe("habitat-v8");
    expect(chicken?.members).toHaveLength(chicken?.populationSize ?? 0);
    expect(chicken?.members.every(({ actor }) => (
      actor.identity.stableId.startsWith("CHICKEN-")
    ))).toBe(true);
    expect(new Set(chicken?.members.map(({ actor }) => actor.identity.stableId)).size)
      .toBe(chicken?.members.length);
    expect(canonicalizeCoreEcologyAggregatePatch(patch)).toEqual(patch);
    expect(deserializeCoreEcologyAggregatePatch(serializeCoreEcologyAggregatePatch(patch)))
      .toEqual(patch);
    expect(canonicalizeCoreEcologyAggregatePatch({
      ...patch,
      populations: patch.populations.filter(({ species }) => species !== "domestic-chicken"),
    })).toBeNull();
  });

  it("admits the same v8 extension beside a frozen legacy individual prefix", () => {
    const habitat = deriveCoreEcologyDomesticYardHabitatAssemblage({
      rootSeed,
      originRegion,
      domesticAnchor: anchor,
    });
    const extensionInputs = individualInputs(habitat).filter(({ species }) => (
      species !== "deer" && species !== "gull" && species !== "black-bear"
    ));
    const legacy = createCoreEcologyAggregatePatch({
      seed: rootSeed,
      patchKey: "domestic-yard:legacy",
      originRegion,
      populations: [
        ...extensionInputs,
        {
          species: "deer",
          populationKey: "legacy-fixed/deer",
          populationSize: 1,
          members: [{
            populationOrdinal: 17,
            representedUnits: 1,
            position: createWorldPosition(originRegion, 10_000, 10_000),
            materialization: "coarse",
          }],
        },
      ],
      derivation: { kind: "legacy-fixed-v1-with-habitat-v8", habitat },
    });

    expect(legacy.derivation.kind).toBe("legacy-fixed-v1-with-habitat-v8");
    expect(legacy.populations.find(({ species }) => species === "domestic-chicken"))
      .toBeDefined();
    expect(legacy.populations.find(({ species }) => species === "deer"))
      .toMatchObject({ populationKey: "legacy-fixed/deer", populationSize: 1 });
    expect(canonicalizeCoreEcologyAggregatePatch(legacy)).toEqual(legacy);
    expect(deserializeCoreEcologyAggregatePatch(serializeCoreEcologyAggregatePatch(legacy)))
      .toEqual(legacy);
  });
});

import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_AMERICAN_BLACK_DUCK_DABBLING_ANCHORS,
  CORE_ECOLOGY_AMERICAN_BLACK_DUCK_REFUGE_ANCHORS,
  CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES,
  CORE_ECOLOGY_WATERFOWL_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_WATERFOWL_HABITAT_SPECIES,
  CORE_ECOLOGY_WATERFOWL_HABITAT_SPECIES_EVALUATION_BUDGET,
  CORE_ECOLOGY_WATERFOWL_HABITAT_VERSION,
  CORE_ECOLOGY_WATERFOWL_MAX_ANCHOR_RECORDS,
  canonicalizeCoreEcologyWaterfowlHabitatAssemblage,
  deriveCoreEcologyTidalTableHabitatAssemblage,
  deriveCoreEcologyWaterfowlHabitatAssemblage,
} from "./coreEcologyHabitat";

describe("core ecology waterfowl habitat-v6", () => {
  it("appends one deterministic duck and its authenticated destinations to an exact v5 prefix", () => {
    const rootSeed = seedFromText("waterfowl habitat 1");
    const originRegion = createRegionCoord(0, 0);
    const v5 = deriveCoreEcologyTidalTableHabitatAssemblage({ rootSeed, originRegion });
    const v6 = deriveCoreEcologyWaterfowlHabitatAssemblage({ rootSeed, originRegion });
    const duck = v6.populations.at(-1);
    const duckAnchors = v6.tidalAnchors.slice(v5.tidalAnchors.length);

    expect(v6.generationVersion).toBe(CORE_ECOLOGY_WATERFOWL_HABITAT_VERSION);
    expect(v6.populations.map(({ species }) => species))
      .toEqual(CORE_ECOLOGY_WATERFOWL_HABITAT_SPECIES);
    expect(stableStringify(v6.populations.slice(0, v5.populations.length)))
      .toBe(stableStringify(v5.populations));
    expect(stableStringify(v6.tidalAnchors.slice(0, v5.tidalAnchors.length)))
      .toBe(stableStringify(v5.tidalAnchors));
    expect(duck).toMatchObject({
      species: "american-black-duck",
      representation: "individual-representatives",
      populationUnits: 1,
    });
    expect(duck?.allocations).toHaveLength(1);
    expect(duckAnchors.filter(({ purpose }) => purpose === "dabbling"))
      .toHaveLength(CORE_ECOLOGY_AMERICAN_BLACK_DUCK_DABBLING_ANCHORS);
    expect(duckAnchors.filter(({ purpose }) => purpose === "refuge"))
      .toHaveLength(CORE_ECOLOGY_AMERICAN_BLACK_DUCK_REFUGE_ANCHORS);
    expect(v6.speciesEvaluations)
      .toBeLessThanOrEqual(CORE_ECOLOGY_WATERFOWL_HABITAT_SPECIES_EVALUATION_BUDGET);
    expect(v6.populations.reduce((sum, population) => (
      sum + population.allocations.length
    ), 0)).toBeLessThanOrEqual(CORE_ECOLOGY_WATERFOWL_HABITAT_MAX_ALLOCATIONS);
    expect(v6.tidalAnchors.length).toBeLessThanOrEqual(
      CORE_ECOLOGY_WATERFOWL_MAX_ANCHOR_RECORDS,
    );
    expect(canonicalizeCoreEcologyWaterfowlHabitatAssemblage(v6)).toEqual(v6);
  });

  it.each([
    createRegionCoord(-17, 29),
    createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
  ])("is deterministic at signed segmented coordinate %o", (originRegion) => {
    const rootSeed = seedFromText("waterfowl signed habitat");
    const first = deriveCoreEcologyWaterfowlHabitatAssemblage({ rootSeed, originRegion });
    const replay = deriveCoreEcologyWaterfowlHabitatAssemblage({ rootSeed, originRegion });
    expect(replay).toEqual(first);
    expect(first.populations.slice(0, CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES.length)
      .map(({ species }) => species)).toEqual(CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES);
  });

  it("rejects reordered or forged duck destinations", () => {
    const habitat = deriveCoreEcologyWaterfowlHabitatAssemblage({
      rootSeed: seedFromText("waterfowl habitat 1"),
      originRegion: createRegionCoord(0, 0),
    });
    const firstDuckAnchor = habitat.tidalAnchors.findIndex(({ species }) => (
      species === "american-black-duck"
    ));
    expect(firstDuckAnchor).toBeGreaterThanOrEqual(0);
    const reorderedAnchors = [...habitat.tidalAnchors];
    [reorderedAnchors[firstDuckAnchor], reorderedAnchors[firstDuckAnchor + 1]] = [
      reorderedAnchors[firstDuckAnchor + 1]!,
      reorderedAnchors[firstDuckAnchor]!,
    ];
    const reordered = { ...habitat, tidalAnchors: reorderedAnchors };
    expect(canonicalizeCoreEcologyWaterfowlHabitatAssemblage(reordered)).toBeNull();

    const forged = {
      ...habitat,
      tidalAnchors: habitat.tidalAnchors.map((anchor, index) => index === firstDuckAnchor
        ? {
            ...anchor,
            position: { ...anchor.position, localX: anchor.position.localX + 1 },
          }
        : anchor),
    };
    expect(canonicalizeCoreEcologyWaterfowlHabitatAssemblage(forged)).toBeNull();
  });
});

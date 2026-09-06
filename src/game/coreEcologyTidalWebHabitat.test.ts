import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { MAX_TIDE_LEVEL, MIN_TIDE_LEVEL } from "../sim/terrain";
import { WORLD_WIDTH } from "../sim/types";
import { stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_RIVER_OTTER_MAXIMUM_FORAGING_DEPTH,
  CORE_ECOLOGY_RIVER_OTTER_MAXIMUM_HAULOUT_DISTANCE_TILES,
  CORE_ECOLOGY_RIVER_OTTER_MINIMUM_FORAGING_DEPTH,
  CORE_ECOLOGY_RIVER_OTTER_FORAGING_ANCHORS,
  CORE_ECOLOGY_RIVER_OTTER_HAULOUT_ANCHORS,
  CORE_ECOLOGY_TIDAL_WEB_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_TIDAL_WEB_HABITAT_SPECIES,
  CORE_ECOLOGY_TIDAL_WEB_HABITAT_SPECIES_EVALUATION_BUDGET,
  CORE_ECOLOGY_TIDAL_WEB_HABITAT_VERSION,
  CORE_ECOLOGY_TIDAL_WEB_MAX_ANCHOR_RECORDS,
  canonicalizeCoreEcologyTidalWebHabitatAssemblage,
  deriveCoreEcologyTidalWebHabitatAssemblage,
  deriveCoreEcologyWaterfowlHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
} from "./worldPosition";

function tileDistance(left: number, right: number): number {
  const leftX = left % WORLD_WIDTH;
  const leftY = Math.trunc(left / WORLD_WIDTH);
  const rightX = right % WORLD_WIDTH;
  const rightY = Math.trunc(right / WORLD_WIDTH);
  return Math.abs(leftX - rightX) + Math.abs(leftY - rightY);
}

describe("core ecology tidal-web habitat-v7", () => {
  it("appends one supported otter and two authenticated destinations after an exact v6 prefix", () => {
    const rootSeed = seedFromText("otter habitat 0");
    const originRegion = createRegionCoord(0, 0);
    const v6 = deriveCoreEcologyWaterfowlHabitatAssemblage({ rootSeed, originRegion });
    const v7 = deriveCoreEcologyTidalWebHabitatAssemblage({ rootSeed, originRegion });
    const otter = v7.populations.at(-1);
    const otterAnchors = v7.tidalAnchors.slice(v6.tidalAnchors.length);
    const foraging = otterAnchors.find(({ purpose }) => purpose === "foraging");
    const haulout = otterAnchors.find(({ purpose }) => purpose === "haulout");

    expect(v7.generationVersion).toBe(CORE_ECOLOGY_TIDAL_WEB_HABITAT_VERSION);
    expect(v7.populations.map(({ species }) => species))
      .toEqual(CORE_ECOLOGY_TIDAL_WEB_HABITAT_SPECIES);
    expect(stableStringify(v7.populations.slice(0, v6.populations.length)))
      .toBe(stableStringify(v6.populations));
    expect(stableStringify(v7.tidalAnchors.slice(0, v6.tidalAnchors.length)))
      .toBe(stableStringify(v6.tidalAnchors));
    expect(otter).toMatchObject({
      species: "north-american-river-otter",
      representation: "individual-representatives",
      populationUnits: 1,
      activitySignal: {
        activePeriod: "tide-responsive",
        kind: "aquatic-foraging",
      },
    });
    expect(otter?.allocations).toHaveLength(1);
    expect(v7.populations.find(({ species }) => species === "atlantic-silverside")
      ?.populationUnits).toBeGreaterThan(0);
    expect(v7.populations.find(({ species }) => species === "atlantic-marsh-fiddler-crab")
      ?.populationUnits).toBeGreaterThan(0);
    expect(otterAnchors.filter(({ purpose }) => purpose === "foraging"))
      .toHaveLength(CORE_ECOLOGY_RIVER_OTTER_FORAGING_ANCHORS);
    expect(otterAnchors.filter(({ purpose }) => purpose === "haulout"))
      .toHaveLength(CORE_ECOLOGY_RIVER_OTTER_HAULOUT_ANCHORS);
    expect(otterAnchors.map(({ purpose }) => purpose)).toEqual(["foraging", "haulout"]);
    expect(foraging?.terrain === "deep-water" || foraging?.terrain === "tidal-flat")
      .toBe(true);
    expect(MIN_TIDE_LEVEL - (foraging?.elevation ?? MIN_TIDE_LEVEL))
      .toBeGreaterThanOrEqual(CORE_ECOLOGY_RIVER_OTTER_MINIMUM_FORAGING_DEPTH);
    expect(MAX_TIDE_LEVEL - (foraging?.elevation ?? 0))
      .toBeLessThanOrEqual(CORE_ECOLOGY_RIVER_OTTER_MAXIMUM_FORAGING_DEPTH);
    expect(haulout?.elevation).toBeGreaterThanOrEqual(MAX_TIDE_LEVEL);
    expect(["meadow", "ridge"]).toContain(haulout?.terrain);
    expect(tileDistance(foraging?.tileIndex ?? 0, haulout?.tileIndex ?? 10_000))
      .toBeLessThanOrEqual(CORE_ECOLOGY_RIVER_OTTER_MAXIMUM_HAULOUT_DISTANCE_TILES);
    expect(foraging?.tileIndex).not.toBe(haulout?.tileIndex);
    expect(v7.speciesEvaluations)
      .toBeLessThanOrEqual(CORE_ECOLOGY_TIDAL_WEB_HABITAT_SPECIES_EVALUATION_BUDGET);
    expect(v7.populations.reduce((sum, population) => (
      sum + population.allocations.length
    ), 0)).toBeLessThanOrEqual(CORE_ECOLOGY_TIDAL_WEB_HABITAT_MAX_ALLOCATIONS);
    expect(v7.tidalAnchors.length).toBeLessThanOrEqual(
      CORE_ECOLOGY_TIDAL_WEB_MAX_ANCHOR_RECORDS,
    );
    expect(canonicalizeCoreEcologyTidalWebHabitatAssemblage(v7)).toEqual(v7);
  });

  it.each([
    createRegionCoord(-17, 29),
    createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
  ])("is canonical and cannot reroll at signed segmented coordinate %o", (originRegion) => {
    const rootSeed = seedFromText("otter signed habitat");
    const first = deriveCoreEcologyTidalWebHabitatAssemblage({ rootSeed, originRegion });
    const replay = deriveCoreEcologyTidalWebHabitatAssemblage({ rootSeed, originRegion });

    expect(replay).toEqual(first);
    expect(canonicalizeCoreEcologyTidalWebHabitatAssemblage(first)).toEqual(first);
  });

  it("keeps unsupported habitat honestly absent and rejects a malformed otter anchor", () => {
    const originRegion = createRegionCoord(0, 0);
    const absent = deriveCoreEcologyTidalWebHabitatAssemblage({
      rootSeed: seedFromText("otter honest absence"),
      originRegion,
      focus: {
        position: createWorldPosition(
          originRegion,
          4 * WORLD_POSITION_UNITS_PER_TILE
            + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
          4 * WORLD_POSITION_UNITS_PER_TILE
            + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
        ),
        radiusTiles: 3,
      },
    });
    expect(absent.populations.at(-1)).toMatchObject({
      species: "north-american-river-otter",
      populationUnits: 0,
      allocations: [],
    });
    expect(absent.tidalAnchors.some(({ species }) => (
      species === "north-american-river-otter"
    ))).toBe(false);
    expect(canonicalizeCoreEcologyTidalWebHabitatAssemblage(absent)).toEqual(absent);

    const present = deriveCoreEcologyTidalWebHabitatAssemblage({
      rootSeed: seedFromText("otter habitat 0"),
      originRegion,
    });
    const firstOtterAnchorIndex = present.tidalAnchors.findIndex(({ species }) => (
      species === "north-american-river-otter"
    ));
    expect(firstOtterAnchorIndex).toBeGreaterThanOrEqual(0);
    const malformed = {
      ...present,
      tidalAnchors: present.tidalAnchors.map((anchor, index) => (
        index === firstOtterAnchorIndex
          ? { ...anchor, purpose: "haulout" }
          : anchor
      )),
    };
    expect(canonicalizeCoreEcologyTidalWebHabitatAssemblage(malformed)).toBeNull();
  });
});

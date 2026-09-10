import { describe, expect, it } from "vitest";

import { generateRegionTerrain } from "../sim/regionTerrain";
import { keyedRandomInt, seedFromText } from "../sim/rng";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { MAX_TIDE_LEVEL, MIN_TIDE_LEVEL } from "../sim/terrain";
import { FIXED_POINT } from "../sim/types";
import { stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_POLAR_SHORE_DERIVATION_KIND,
  CORE_ECOLOGY_POLAR_SHORE_HABITAT_OWNER_ID,
  CORE_ECOLOGY_POLAR_SHORE_MAXIMUM_ANCHORS,
  CORE_ECOLOGY_POLAR_SHORE_MAXIMUM_POPULATION,
  CORE_ECOLOGY_POLAR_SHORE_MINIMUM_CAPELIN_DEPTH,
  CORE_ECOLOGY_POLAR_SHORE_TERRITORY_SPAN_REGIONS,
  canonicalCoreEcologyPolarShoreHabitatForWorld,
  canonicalizeCoreEcologyPolarShoreHabitat,
  clearCoreEcologyPolarShoreHabitatCache,
  deriveCoreEcologyPolarShoreHabitat,
  deriveCoreEcologyPolarShoreTerritory,
  type CoreEcologyPolarShoreHabitat,
} from "./coreEcologyPolarShoreHabitat";

export const ALPHA34_POLAR_SHORE_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha34-polar-shore-shared-invariants:v1" as const;

const SEED = seedFromText("alpha34 polar shore shared properties");

function corpus() {
  const fixed = [
    { seedText: "polar origin", x: 0, y: 0 },
    { seedText: "polar signed", x: -1, y: -1 },
    { seedText: "polar coast", x: -719, y: 304 },
    { seedText: "polar habitat fuzz 29", x: -1653, y: 664 },
    {
      seedText: "polar positive edge",
      x: REGION_COORD_LIMIT,
      y: REGION_COORD_LIMIT,
    },
    {
      seedText: "polar negative edge",
      x: -REGION_COORD_LIMIT,
      y: -REGION_COORD_LIMIT,
    },
  ];
  const generated = Array.from({ length: 12 }, (_, ordinal) => ({
    seedText: `polar habitat fuzz ${ordinal}`,
    x: keyedRandomInt(SEED, 0x5053_4858, ordinal, 1, 2, -4_096, 4_096),
    y: keyedRandomInt(SEED, 0x5053_4858, ordinal, 3, 4, -4_096, 4_096),
  }));
  return Object.freeze(
    [...fixed, ...generated].map((entry) => Object.freeze(entry)),
  );
}

function derive(
  entry: Readonly<{
    readonly seedText: string;
    readonly x: number;
    readonly y: number;
  }>,
) {
  const seed = seedFromText(entry.seedText);
  const region = createRegionCoord(entry.x, entry.y);
  return {
    seed,
    region,
    habitat: deriveCoreEcologyPolarShoreHabitat({ seed, region }),
  };
}

describe(`${ALPHA34_POLAR_SHORE_SHARED_INVARIANTS_OWNER_INTENT} habitat authority`, () => {
  it("is deterministic, caller-order independent, and bound to canonical terrain", () => {
    clearCoreEcologyPolarShoreHabitatCache();
    const region = createRegionCoord(-37, 12);
    const terrain = generateRegionTerrain(SEED, region);
    const first = deriveCoreEcologyPolarShoreHabitat({ seed: SEED, region });
    const replay = deriveCoreEcologyPolarShoreHabitat({
      seed: SEED,
      region,
      terrain: { ...terrain, tiles: [...terrain.tiles].reverse() },
    });
    expect(replay).toBe(first);
    expect(first).toMatchObject({
      ownerId: CORE_ECOLOGY_POLAR_SHORE_HABITAT_OWNER_ID,
      derivationKind: CORE_ECOLOGY_POLAR_SHORE_DERIVATION_KIND,
      evaluatedSpeciesCount: 1,
    });
    expect(first.populations).toHaveLength(1);
    expect(first.populations[0]?.species).toBe("atlantic-capelin");
    expect(canonicalizeCoreEcologyPolarShoreHabitat(first)).toBe(first);
    expect(
      canonicalCoreEcologyPolarShoreHabitatForWorld(first, SEED, region),
    ).toBe(first);
  });

  it("keeps absence honest and admits only cold saline shores with a refuge and tidal edge", () => {
    const habitats = corpus()
      .map(derive)
      .map(({ habitat }) => habitat);
    expect(
      habitats.some(({ totalPopulationUnits }) => totalPopulationUnits === 0),
    ).toBe(true);
    expect(
      habitats.some(({ totalPopulationUnits }) => totalPopulationUnits > 0),
      stableStringify(
        habitats.map((habitat) => ({
          summary: habitat.summary,
          population: habitat.populations[0],
        })),
      ),
    ).toBe(true);
    for (const habitat of habitats) {
      const population = habitat.populations[0];
      expect(population).toBeDefined();
      expect(population!.actorRepresentation).toBe("aggregate");
      expect(population!.populationUnits).toBeLessThanOrEqual(
        CORE_ECOLOGY_POLAR_SHORE_MAXIMUM_POPULATION,
      );
      expect(population!.anchors.length).toBeLessThanOrEqual(
        CORE_ECOLOGY_POLAR_SHORE_MAXIMUM_ANCHORS,
      );
      expect(
        population!.anchors.reduce(
          (sum, anchor) => sum + anchor.allocatedPopulation,
          0,
        ),
      ).toBe(population!.populationUnits);
      expect(habitat.tidalAnchors).toHaveLength(population!.anchors.length);
      if (population!.populationUnits > 0) {
        expect(
          population!.anchors.some(
            ({ purpose }) => purpose === "low-tide-refuge",
          ),
        ).toBe(true);
        expect(
          population!.anchors.some(({ purpose }) => purpose === "tidal-edge"),
        ).toBe(true);
        expect(
          population!.anchors.every(
            ({ heat, salinity, highTideDepth }) =>
              heat <= FIXED_POINT - 540_000 &&
              salinity >= 570_000 &&
              highTideDepth >= CORE_ECOLOGY_POLAR_SHORE_MINIMUM_CAPELIN_DEPTH,
          ),
        ).toBe(true);
      }
      for (const anchor of population!.anchors) {
        expect(anchor.lowTideDepth).toBe(
          Math.max(0, MIN_TIDE_LEVEL - anchor.elevation),
        );
        expect(anchor.highTideDepth).toBe(
          Math.max(0, MAX_TIDE_LEVEL - anchor.elevation),
        );
      }
      expect(stableStringify(habitat)).not.toMatch(
        /materializedActor|mortality|carcass|capture|reproduction|voice|snow|ice|polar-bear/u,
      );
    }
  });

  it("uses floor-correct one-host territory ownership across signed seams", () => {
    const territories = [
      createRegionCoord(-2, -2),
      createRegionCoord(-2, -1),
      createRegionCoord(-1, -2),
      createRegionCoord(-1, -1),
    ].map((region) => deriveCoreEcologyPolarShoreTerritory(SEED, region));
    expect(new Set(territories.map(({ stableId }) => stableId))).toHaveLength(
      1,
    );
    expect(
      new Set(territories.map(({ hostRegion }) => stableStringify(hostRegion))),
    ).toHaveLength(1);
    expect(territories.filter(({ regionIsHost }) => regionIsHost)).toHaveLength(
      1,
    );
  });

  it("keeps every signed coordinate-limit territory member under one claimable host", () => {
    const limit = REGION_COORD_LIMIT;
    const edgeRegions = [
      createRegionCoord(-limit, -limit),
      createRegionCoord(limit, limit),
      createRegionCoord(-limit, 0),
      createRegionCoord(limit, 0),
      createRegionCoord(0, -limit),
      createRegionCoord(0, limit),
    ];

    for (const edgeRegion of edgeRegions) {
      const edgeTerritory = deriveCoreEcologyPolarShoreTerritory(
        SEED,
        edgeRegion,
      );
      const span = CORE_ECOLOGY_POLAR_SHORE_TERRITORY_SPAN_REGIONS;
      expect(edgeTerritory.bounds).toEqual({
        minimum: {
          x: Math.max(-limit, edgeTerritory.address.x * span),
          y: Math.max(-limit, edgeTerritory.address.y * span),
        },
        maximum: {
          x: Math.min(limit, edgeTerritory.address.x * span + span - 1),
          y: Math.min(limit, edgeTerritory.address.y * span + span - 1),
        },
      });

      const members = [];
      for (
        let y = edgeTerritory.bounds.minimum.y;
        y <= edgeTerritory.bounds.maximum.y;
        y += 1
      ) {
        for (
          let x = edgeTerritory.bounds.minimum.x;
          x <= edgeTerritory.bounds.maximum.x;
          x += 1
        ) {
          members.push(
            deriveCoreEcologyPolarShoreTerritory(SEED, createRegionCoord(x, y)),
          );
        }
      }

      expect(new Set(members.map(({ stableId }) => stableId))).toHaveLength(1);
      expect(
        new Set(members.map(({ hostRegion }) => stableStringify(hostRegion))),
      ).toHaveLength(1);
      expect(
        members.every(
          ({ bounds }) =>
            stableStringify(bounds) === stableStringify(edgeTerritory.bounds),
        ),
      ).toBe(true);
      expect(members.filter(({ regionIsHost }) => regionIsHost)).toHaveLength(
        1,
      );
      expect(members.some(({ regionIsHost }) => regionIsHost)).toBe(true);
      expect(edgeTerritory.hostRegion.x).toBeGreaterThanOrEqual(
        edgeTerritory.bounds.minimum.x,
      );
      expect(edgeTerritory.hostRegion.x).toBeLessThanOrEqual(
        edgeTerritory.bounds.maximum.x,
      );
      expect(edgeTerritory.hostRegion.y).toBeGreaterThanOrEqual(
        edgeTerritory.bounds.minimum.y,
      );
      expect(edgeTerritory.hostRegion.y).toBeLessThanOrEqual(
        edgeTerritory.bounds.maximum.y,
      );
    }
  });

  it("replays at coordinate extremes and rejects foreign or forged authority", () => {
    for (const region of [
      createRegionCoord(REGION_COORD_LIMIT, REGION_COORD_LIMIT),
      createRegionCoord(-REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
    ]) {
      const first = deriveCoreEcologyPolarShoreHabitat({ seed: SEED, region });
      clearCoreEcologyPolarShoreHabitatCache();
      const replay = deriveCoreEcologyPolarShoreHabitat({ seed: SEED, region });
      expect(stableStringify(replay)).toBe(stableStringify(first));
      expect(
        canonicalCoreEcologyPolarShoreHabitatForWorld(replay, SEED, region),
      ).toBe(replay);
    }
    const region = createRegionCoord(18, -27);
    const habitat = deriveCoreEcologyPolarShoreHabitat({ seed: SEED, region });
    expect(
      canonicalCoreEcologyPolarShoreHabitatForWorld(
        habitat,
        seedFromText("foreign polar world"),
        region,
      ),
    ).toBeNull();
    const forged: CoreEcologyPolarShoreHabitat = {
      ...habitat,
      totalPopulationUnits: habitat.totalPopulationUnits + 1,
    };
    expect(canonicalizeCoreEcologyPolarShoreHabitat(forged)).toBeNull();
  });
});

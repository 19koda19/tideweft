import { describe, expect, it } from "vitest";

import { generateRegionTerrain } from "../sim/regionTerrain";
import { keyedRandomInt, seedFromText } from "../sim/rng";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { MAX_TIDE_LEVEL } from "../sim/terrain";
import { stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_COLD_SHORE_DERIVATION_KIND,
  CORE_ECOLOGY_COLD_SHORE_HABITAT_OWNER_ID,
  CORE_ECOLOGY_COLD_SHORE_MAXIMUM_FORAGE_DISTANCE_TILES,
  canonicalCoreEcologyColdShoreHabitatForWorld,
  canonicalizeCoreEcologyColdShoreHabitat,
  clearCoreEcologyColdShoreHabitatCache,
  deriveCoreEcologyColdShoreHabitat,
  type CoreEcologyColdShoreHabitat,
} from "./coreEcologyColdShoreHabitat";
import { deriveCoreEcologyPolarShoreHabitat } from "./coreEcologyPolarShoreHabitat";

export const ALPHA35_COLD_SHORE_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha35-cold-shore-shared-invariants:v1" as const;

const SEED = seedFromText("alpha35 cold shore shared properties");
const OCCUPIED_SEED = seedFromText("polar habitat fuzz 29");
const OCCUPIED_REGION = createRegionCoord(-1653, 664);

function corpus() {
  const fixed = [
    { seedText: "cold origin", x: 0, y: 0 },
    { seedText: "cold signed", x: -1, y: -1 },
    { seedText: "polar habitat fuzz 29", x: -1653, y: 664 },
    {
      seedText: "cold positive edge",
      x: REGION_COORD_LIMIT,
      y: REGION_COORD_LIMIT,
    },
    {
      seedText: "cold negative edge",
      x: -REGION_COORD_LIMIT,
      y: -REGION_COORD_LIMIT,
    },
  ];
  const generated = Array.from({ length: 8 }, (_, ordinal) => ({
    seedText: `cold shore fuzz ${ordinal}`,
    x: keyedRandomInt(SEED, 0x4353_4858, ordinal, 1, 2, -4_096, 4_096),
    y: keyedRandomInt(SEED, 0x4353_4858, ordinal, 3, 4, -4_096, 4_096),
  }));
  return Object.freeze([...fixed, ...generated]);
}

describe(`${ALPHA35_COLD_SHORE_SHARED_INVARIANTS_OWNER_INTENT} habitat`, () => {
  it("replays over canonical terrain and binds the one-species source", () => {
    clearCoreEcologyColdShoreHabitatCache();
    const terrain = generateRegionTerrain(OCCUPIED_SEED, OCCUPIED_REGION);
    const first = deriveCoreEcologyColdShoreHabitat({
      seed: OCCUPIED_SEED,
      region: OCCUPIED_REGION,
    });
    const replay = deriveCoreEcologyColdShoreHabitat({
      seed: OCCUPIED_SEED,
      region: OCCUPIED_REGION,
      terrain: { ...terrain, tiles: [...terrain.tiles].reverse() },
    });
    expect(replay).toBe(first);
    expect(first).toMatchObject({
      ownerId: CORE_ECOLOGY_COLD_SHORE_HABITAT_OWNER_ID,
      derivationKind: CORE_ECOLOGY_COLD_SHORE_DERIVATION_KIND,
      evaluatedSpeciesCount: 1,
    });
    expect(first.populations).toHaveLength(1);
    expect(first.populations[0]?.species).toBe("arctic-fox");
    expect(canonicalizeCoreEcologyColdShoreHabitat(first)).toBe(first);
    expect(
      canonicalCoreEcologyColdShoreHabitatForWorld(
        first,
        OCCUPIED_SEED,
        OCCUPIED_REGION,
      ),
    ).toBe(first);
  });

  it("admits at most one fox and only above an admitted capelin substrate", () => {
    const habitats = corpus().map(({ seedText, x, y }) => {
      const seed = seedFromText(seedText);
      const region = createRegionCoord(x, y);
      return {
        habitat: deriveCoreEcologyColdShoreHabitat({ seed, region }),
        polar: deriveCoreEcologyPolarShoreHabitat({ seed, region }),
      };
    });
    expect(
      habitats.some(({ habitat }) => habitat.totalPopulationUnits === 0),
    ).toBe(true);
    expect(
      habitats.some(({ habitat }) => habitat.totalPopulationUnits === 1),
      stableStringify(
        habitats.map(({ habitat }) => ({
          region: habitat.region,
          substrate: habitat.forageSubstrate,
          summary: habitat.summary,
          candidate: habitat.populations[0],
        })),
      ),
    ).toBe(true);
    for (const { habitat, polar } of habitats) {
      const candidate = habitat.populations[0]!;
      expect(candidate.populationUnits).toBeLessThanOrEqual(1);
      expect(candidate.anchors).toHaveLength(candidate.populationUnits);
      expect(habitat.totalPopulationUnits).toBe(candidate.populationUnits);
      expect(habitat.forageSubstrate).toMatchObject({
        polarShoreSourceStableId: polar.sourceStableId,
        polarShoreHabitatHash: polar.derivationHash,
        polarForagePopulationKey: polar.populations[0]!.populationKey,
        polarForagePopulationUnits: polar.totalPopulationUnits,
      });
      if (candidate.populationUnits === 1) {
        expect(polar.totalPopulationUnits).toBeGreaterThan(0);
        expect(habitat.forageSubstrate.viable).toBe(true);
        expect(candidate.preySupportUnits).toBe(polar.totalPopulationUnits);
        const anchor = candidate.anchors[0]!;
        expect(["meadow", "ridge"]).toContain(anchor.terrain);
        expect(anchor.elevation).toBeGreaterThanOrEqual(MAX_TIDE_LEVEL);
        expect(anchor.forageDistanceTiles).toBeLessThanOrEqual(
          CORE_ECOLOGY_COLD_SHORE_MAXIMUM_FORAGE_DISTANCE_TILES,
        );
        expect(anchor.allocatedPopulation).toBe(1);
      }
      expect(stableStringify(habitat)).not.toMatch(
        /targetActor|capture|mortality|carcass|consumption|reproduction|voice|snow|ice|polar-bear/u,
      );
    }
  });

  it("replays signed coordinate extremes and rejects foreign or forged authority", () => {
    for (const region of [
      createRegionCoord(REGION_COORD_LIMIT, REGION_COORD_LIMIT),
      createRegionCoord(-REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
    ]) {
      const first = deriveCoreEcologyColdShoreHabitat({ seed: SEED, region });
      clearCoreEcologyColdShoreHabitatCache();
      const replay = deriveCoreEcologyColdShoreHabitat({ seed: SEED, region });
      expect(stableStringify(replay)).toBe(stableStringify(first));
      expect(
        canonicalCoreEcologyColdShoreHabitatForWorld(replay, SEED, region),
      ).toBe(replay);
    }
    const habitat = deriveCoreEcologyColdShoreHabitat({
      seed: OCCUPIED_SEED,
      region: OCCUPIED_REGION,
    });
    expect(
      canonicalCoreEcologyColdShoreHabitatForWorld(
        habitat,
        seedFromText("foreign cold-shore world"),
        OCCUPIED_REGION,
      ),
    ).toBeNull();
    const forged: CoreEcologyColdShoreHabitat = {
      ...habitat,
      totalPopulationUnits: habitat.totalPopulationUnits === 0 ? 1 : 0,
    };
    expect(canonicalizeCoreEcologyColdShoreHabitat(forged)).toBeNull();
  });
});

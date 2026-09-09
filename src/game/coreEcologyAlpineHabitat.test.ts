import { describe, expect, it } from "vitest";

import { generateRegionTerrain } from "../sim/regionTerrain";
import { keyedRandomInt, seedFromText } from "../sim/rng";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { FIXED_POINT } from "../sim/types";
import { hashCanonical, stableStringify } from "../sim/util";
import { deriveCoreEcologyRegionalHabitat } from "./coreEcologyRegionalHabitat";
import {
  CORE_ECOLOGY_ALPINE_DERIVATION_KIND,
  CORE_ECOLOGY_ALPINE_HABITAT_OWNER_ID,
  CORE_ECOLOGY_ALPINE_SPECIES,
  canonicalCoreEcologyAlpineHabitatForWorld,
  canonicalizeCoreEcologyAlpineHabitat,
  clearCoreEcologyAlpineHabitatCache,
  deriveCoreEcologyAlpineHabitat,
  deriveCoreEcologyAlpineTerritory,
  type CoreEcologyAlpineHabitat,
} from "./coreEcologyAlpineHabitat";

export const ALPHA33_ALPINE_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha33-alpine-shared-invariants:v1" as const;
export const ALPHA33_ALPINE_PERFORMANCE_OWNER_INTENT =
  "test:alpha33-alpine-performance:v1" as const;

const SEED = seedFromText("wave-f alpine habitat shared properties");

function corpus(): readonly Readonly<{ readonly seedText: string; readonly x: number; readonly y: number }>[] {
  const fixed = [
    { seedText: "wave-f alpine origin", x: 0, y: 0 },
    { seedText: "wave-f alpine west", x: -1, y: 0 },
    { seedText: "wave-f alpine north", x: 0, y: -1 },
    { seedText: "wave-f alpine signed", x: -719, y: 304 },
    { seedText: "wave-f alpine positive edge", x: REGION_COORD_LIMIT, y: REGION_COORD_LIMIT },
    { seedText: "wave-f alpine negative edge", x: -REGION_COORD_LIMIT, y: -REGION_COORD_LIMIT },
  ];
  const generated = Array.from({ length: 18 }, (_, ordinal) => ({
    seedText: `wave-f alpine fuzz ${ordinal}`,
    x: keyedRandomInt(SEED, 0x414c_5046, ordinal, 1, 2, -2_048, 2_048),
    y: keyedRandomInt(SEED, 0x414c_5046, ordinal, 3, 4, -2_048, 2_048),
  }));
  return Object.freeze([...fixed, ...generated].map((entry) => Object.freeze(entry)));
}

function derive(entry: Readonly<{ readonly seedText: string; readonly x: number; readonly y: number }>) {
  const seed = seedFromText(entry.seedText);
  const region = createRegionCoord(entry.x, entry.y);
  return {
    seed,
    region,
    habitat: deriveCoreEcologyAlpineHabitat({ seed, region }),
  };
}

describe(`${ALPHA33_ALPINE_SHARED_INVARIANTS_OWNER_INTENT} Wave-F Alpine habitat authority`, () => {
  it("is append-owned, deterministic, caller-order independent, and bound to canonical Alpha-32 terrain facts", () => {
    clearCoreEcologyAlpineHabitatCache();
    const region = createRegionCoord(-37, 12);
    const terrain = generateRegionTerrain(SEED, region);
    const reversedTerrain = {
      ...terrain,
      tiles: [...terrain.tiles].reverse(),
    };
    const first = deriveCoreEcologyAlpineHabitat({ seed: SEED, region });
    const terrainReplay = deriveCoreEcologyAlpineHabitat({
      seed: SEED,
      region,
      terrain: reversedTerrain,
    });
    const speciesReplay = deriveCoreEcologyAlpineHabitat({
      seed: SEED,
      region,
      speciesOrder: [...CORE_ECOLOGY_ALPINE_SPECIES].reverse(),
    });
    const base = deriveCoreEcologyRegionalHabitat({ seed: SEED, region });

    expect(terrainReplay).toBe(first);
    expect(stableStringify(speciesReplay)).toBe(stableStringify(first));
    expect(first).toMatchObject({
      ownerId: CORE_ECOLOGY_ALPINE_HABITAT_OWNER_ID,
      derivationKind: CORE_ECOLOGY_ALPINE_DERIVATION_KIND,
      baseRegionalHabitatHash: base.derivationHash,
      baseRegionalSummaryHash: hashCanonical(base.summary),
      evaluatedSpeciesCount: 3,
    });
    expect(first.populations.map(({ species }) => species)).toEqual(CORE_ECOLOGY_ALPINE_SPECIES);
    expect(Object.isFrozen(first)).toBe(true);
    expect(canonicalizeCoreEcologyAlpineHabitat(first)).toBe(first);
    expect(canonicalCoreEcologyAlpineHabitatForWorld(first, SEED, region)).toBe(first);

    expect(() => deriveCoreEcologyAlpineHabitat({
      seed: SEED,
      region,
      speciesOrder: ["mountain-goat", "american-pika"],
    })).toThrow(/complete fixed species roster/u);
  });

  it("keeps lawful absence sparse while enforcing group, aggregate, solitary, habitat, and broad-support laws", () => {
    const habitats = corpus().map(derive).map(({ habitat }) => habitat);
    expect(habitats.some(({ totalPopulationUnits }) => totalPopulationUnits === 0)).toBe(true);
    expect(habitats.some(({ totalPopulationUnits }) => totalPopulationUnits > 0)).toBe(true);

    for (const habitat of habitats) {
      expect(habitat.summary.tileCount).toBe(96 * 72);
      expect(habitat.summary.highRidgeTileCount).toBeLessThanOrEqual(habitat.summary.ridgeTileCount);
      expect(habitat.summary.talusTileCount).toBeLessThanOrEqual(habitat.summary.ridgeTileCount);
      expect(habitat.totalPopulationUnits).toBeLessThanOrEqual(38);
      expect(habitat.admittedSpeciesCount).toBeLessThanOrEqual(3);
      expect(new Set(habitat.populations.flatMap(({ anchors }) => (
        anchors.map(({ localX, localY }) => `${localX}:${localY}`)
      ))).size).toBe(habitat.populations.flatMap(({ anchors }) => anchors).length);

      const goat = habitat.populations[0]!;
      const pika = habitat.populations[1]!;
      const eagle = habitat.populations[2]!;
      expect(goat.species).toBe("mountain-goat");
      expect(goat.actorRepresentation).toBe("individual");
      expect(goat.populationUnits === 0 || (goat.populationUnits >= 2 && goat.populationUnits <= 5))
        .toBe(true);
      expect(goat.populationUnits === 0 ? goat.anchors.length : goat.populationUnits)
        .toBe(goat.anchors.length);
      expect(pika.species).toBe("american-pika");
      expect(pika.actorRepresentation).toBe("aggregate");
      expect(pika.populationUnits === 0 || (pika.populationUnits >= 4 && pika.populationUnits <= 32))
        .toBe(true);
      expect(pika.anchors.length).toBeLessThanOrEqual(3);
      expect(eagle.species).toBe("golden-eagle");
      expect(eagle.actorRepresentation).toBe("individual");
      expect(eagle.populationUnits).toBeLessThanOrEqual(1);
      expect(eagle.populationUnits).toBeLessThanOrEqual(eagle.trophicCeiling);
      if (eagle.populationUnits > 0) expect(eagle.preySupportUnits).toBeGreaterThanOrEqual(4);

      for (const population of habitat.populations) {
        expect(population.populationUnits).toBeLessThanOrEqual(population.guildCeiling);
        expect(population.populationUnits).toBeLessThanOrEqual(population.habitatCapacity);
        expect(population.habitatScore).toBeGreaterThanOrEqual(0);
        expect(population.habitatScore).toBeLessThanOrEqual(FIXED_POINT);
        expect(population.anchors.reduce((sum, anchor) => sum + anchor.allocatedPopulation, 0))
          .toBe(population.populationUnits);
      }
      const serialized = stableStringify(habitat);
      expect(serialized).not.toMatch(/targetActor|targetPopulation|mortality|carcass|capture|reproduction/u);
    }
  });

  it("uses floor-correct stable territory ownership across signed seams and coordinate extremes", () => {
    const signedCell = [
      createRegionCoord(-2, -2),
      createRegionCoord(-2, -1),
      createRegionCoord(-1, -2),
      createRegionCoord(-1, -1),
    ].map((region) => deriveCoreEcologyAlpineTerritory(
      SEED,
      "mountain-goat",
      region,
    ));
    expect(new Set(signedCell.map(({ stableId }) => stableId))).toHaveLength(1);
    expect(new Set(signedCell.map(({ hostRegion }) => stableStringify(hostRegion))))
      .toHaveLength(1);
    expect(signedCell.filter(({ regionIsHost }) => regionIsHost)).toHaveLength(1);

    for (const region of [
      createRegionCoord(REGION_COORD_LIMIT, REGION_COORD_LIMIT),
      createRegionCoord(-REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
    ]) {
      const first = deriveCoreEcologyAlpineHabitat({ seed: SEED, region });
      clearCoreEcologyAlpineHabitatCache();
      const replay = deriveCoreEcologyAlpineHabitat({ seed: SEED, region });
      expect(stableStringify(replay)).toBe(stableStringify(first));
      expect(canonicalCoreEcologyAlpineHabitatForWorld(replay, SEED, region)).toBe(replay);
    }
  });

  it("rejects foreign terrain, foreign worlds, and self-inconsistent structural forgeries", () => {
    const region = createRegionCoord(18, -27);
    const habitat = deriveCoreEcologyAlpineHabitat({ seed: SEED, region });
    const terrain = generateRegionTerrain(SEED, region);
    const forgedTerrain = {
      ...terrain,
      tiles: terrain.tiles.map((tile, index) => index === 0
        ? { ...tile, roughness: Math.max(0, tile.roughness - 1) }
        : tile),
    };
    expect(() => deriveCoreEcologyAlpineHabitat({
      seed: SEED,
      region,
      terrain: forgedTerrain,
    })).toThrow(/canonical terrain multiset/u);
    expect(canonicalCoreEcologyAlpineHabitatForWorld(
      habitat,
      seedFromText("foreign alpine world"),
      region,
    )).toBeNull();

    const forged: CoreEcologyAlpineHabitat = {
      ...habitat,
      totalPopulationUnits: habitat.totalPopulationUnits + 1,
    };
    expect(canonicalizeCoreEcologyAlpineHabitat(forged)).toBeNull();
  });

  it(`${ALPHA33_ALPINE_PERFORMANCE_OWNER_INTENT} keeps a deterministic signed-region derivation corpus inside the bounded test budget`, () => {
    clearCoreEcologyAlpineHabitatCache();
    const started = performance.now();
    const habitats: CoreEcologyAlpineHabitat[] = [];
    for (const entry of corpus()) habitats.push(derive(entry).habitat);
    const elapsed = performance.now() - started;
    const replay = corpus().slice().reverse().map(derive).map(({ habitat }) => habitat);
    expect(replay.map(({ derivationHash }) => derivationHash).sort())
      .toEqual(habitats.map(({ derivationHash }) => derivationHash).sort());
    expect(elapsed).toBeLessThan(5_000);
  });
});

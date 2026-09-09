import { describe, expect, it } from "vitest";

import {
  CORE_WILDLIFE_ALPHA32_SPECIES,
  type CoreWildlifeSpecies,
} from "../sim/coreWildlifeIdentity";
import { seedFromText } from "../sim/rng";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { hashCanonical, stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_ALPHA32_DOMESTIC_SPECIES_HASH,
  CORE_ECOLOGY_ALPHA32_REGIONAL_WILD_SPECIES_HASH,
  CORE_ECOLOGY_DOMESTIC_SPECIES,
  CORE_ECOLOGY_REGIONAL_HABITAT_CATALOG_SPECIES_COUNT,
  CORE_ECOLOGY_REGIONAL_WILD_SPECIES,
  clearCoreEcologyRegionalHabitatCache,
  coreEcologyRegionalFloorDivide,
  deriveCoreEcologyRegionalCellIdentity,
  deriveCoreEcologyRegionalHabitat,
  deriveCoreEcologyRegionalTerritory,
  type CoreEcologyRegionalGuild,
} from "./coreEcologyRegionalHabitat";

const SEED = seedFromText("alpha32-regional-habitat-properties");
const LARGE_PREDATORS = ["black-bear", "brown-bear", "cougar", "gray-wolf"] as const;

describe("core ecology regional habitat", () => {
  it("uses mathematical signed cells and remains deterministic at the coordinate envelope", () => {
    clearCoreEcologyRegionalHabitatCache();
    expect(coreEcologyRegionalFloorDivide(-1, 2)).toBe(-1);
    expect(coreEcologyRegionalFloorDivide(-2, 2)).toBe(-1);
    expect(coreEcologyRegionalFloorDivide(-3, 2)).toBe(-2);
    expect(deriveCoreEcologyRegionalCellIdentity(SEED, createRegionCoord(-1, 0))).toMatchObject({
      address: { x: -1, y: 0 },
      bounds: { minimum: { x: -2, y: 0 }, maximum: { x: -1, y: 1 } },
    });
    const extreme = createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT);
    const first = deriveCoreEcologyRegionalHabitat({ seed: SEED, region: extreme });
    const second = deriveCoreEcologyRegionalHabitat({ seed: SEED, region: extreme });
    expect(second).toBe(first);
    expect(stableStringify(second)).toBe(stableStringify(first));
  });

  it("is species-order independent, excludes domestic actors, and permits honest absence", () => {
    const occupiedRegion = createRegionCoord(-3, 0);
    const canonical = deriveCoreEcologyRegionalHabitat({ seed: SEED, region: occupiedRegion });
    const reversed = deriveCoreEcologyRegionalHabitat({
      seed: SEED,
      region: occupiedRegion,
      speciesOrder: [...CORE_WILDLIFE_ALPHA32_SPECIES].reverse(),
    });
    expect(stableStringify(reversed)).toBe(stableStringify(canonical));
    expect(CORE_ECOLOGY_REGIONAL_WILD_SPECIES).toHaveLength(19);
    expect(hashCanonical(CORE_ECOLOGY_REGIONAL_WILD_SPECIES))
      .toBe(CORE_ECOLOGY_ALPHA32_REGIONAL_WILD_SPECIES_HASH);
    expect(hashCanonical(CORE_ECOLOGY_DOMESTIC_SPECIES))
      .toBe(CORE_ECOLOGY_ALPHA32_DOMESTIC_SPECIES_HASH);
    expect(canonical.catalogSpeciesCount)
      .toBe(CORE_ECOLOGY_REGIONAL_HABITAT_CATALOG_SPECIES_COUNT);
    expect(canonical.evaluatedWildSpeciesCount).toBe(CORE_ECOLOGY_REGIONAL_WILD_SPECIES.length);
    expect(canonical.populations.map(({ species }) => species)).not.toEqual(
      expect.arrayContaining([...CORE_ECOLOGY_DOMESTIC_SPECIES]),
    );

    const empty = deriveCoreEcologyRegionalHabitat({ seed: SEED, region: createRegionCoord(-2, 0) });
    expect(empty.density.regionalQuiet).toBe(true);
    expect(empty.totalPopulationUnits).toBe(0);
    expect(empty.admittedSpeciesCount).toBe(0);

    expect(() => deriveCoreEcologyRegionalHabitat({
      seed: SEED,
      region: occupiedRegion,
      speciesOrder: [
        ...CORE_WILDLIFE_ALPHA32_SPECIES,
        "mountain-goat" as CoreWildlifeSpecies,
      ],
    })).toThrow(/complete core wild-species catalog|Unsupported core wildlife species/u);
  });

  it("shares one radius-two large-predator owner field across seams", () => {
    const owners: Array<readonly [number, number]> = [];
    for (let y = -7; y <= 7; y += 1) {
      for (let x = -7; x <= 7; x += 1) {
        const region = createRegionCoord(x, y);
        const territories = LARGE_PREDATORS.map((species) =>
          deriveCoreEcologyRegionalTerritory(SEED, species, region),
        );
        expect(new Set(territories.map(({ stableId }) => stableId)).size).toBe(1);
        expect(new Set(territories.map(({ hostRegion }) => `${hostRegion.x}:${hostRegion.y}`)).size).toBe(1);
        const ownerCount = territories.filter(({ regionIsHost }) => regionIsHost).length;
        expect(ownerCount).toBeLessThanOrEqual(1);
        if (ownerCount === 1) owners.push([x, y]);
      }
    }
    expect(owners.length).toBeGreaterThan(1);
    for (const [index, left] of owners.entries()) {
      for (const right of owners.slice(index + 1)) {
        expect(Math.max(Math.abs(left[0] - right[0]), Math.abs(left[1] - right[1]))).toBeGreaterThan(2);
      }
    }
  });

  it("enforces guild ceilings and prey-bounded predator admission", () => {
    for (const region of [createRegionCoord(-3, 0), createRegionCoord(2, 0)]) {
      const habitat = deriveCoreEcologyRegionalHabitat({ seed: SEED, region });
      const guildTotals = new Map<CoreEcologyRegionalGuild, number>();
      for (const population of habitat.populations) {
        guildTotals.set(
          population.guild,
          (guildTotals.get(population.guild) ?? 0) + population.populationUnits,
        );
        if (population.preySupportUnits > 0 || population.admissionReason === "unsupported-predator") {
          expect(population.populationUnits).toBeLessThanOrEqual(population.trophicCeiling);
          if (population.preySupportUnits === 0) expect(population.populationUnits).toBe(0);
        }
      }
      for (const [guild, units] of guildTotals) {
        expect(units).toBeLessThanOrEqual(habitat.density.guildCeilings[guild]);
      }
    }
  });
});

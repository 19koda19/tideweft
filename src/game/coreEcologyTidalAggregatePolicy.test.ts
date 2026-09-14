import { describe, expect, it } from "vitest";
import {
  CORE_ECOLOGY_ALPHA36_TIDAL_AGGREGATE_SPECIES,
  CORE_ECOLOGY_SILVERSIDE_REDISTRIBUTION_CADENCE_TICKS,
  CORE_ECOLOGY_TIDAL_AGGREGATE_POLICIES,
  coreEcologyTidalAggregatePolicy,
  coreEcologyTidalAggregateUsesDurableRedistributionClock,
  coreEcologyTidalAnchorActivityUsable,
  coreEcologyTidalEvacuationDestinationOrdinal,
  coreEcologyTidalLawfulDestinationOrdinals,
  coreEcologyTidalRedistributionIsDue,
  isCoreEcologyTidalAggregateSpecies,
  resolveCoreEcologyTidalAggregateActivity,
  resolveCoreEcologyTidalRedistribution,
  type CoreEcologyTidalAnchorDepthLike,
} from "./coreEcologyTidalAggregatePolicy";

describe("core ecology tidal aggregate policy", () => {
  it("preserves the exact Alpha-36 child before the Wave-G append", () => {
    const species = CORE_ECOLOGY_TIDAL_AGGREGATE_POLICIES.map((policy) => policy.species);
    expect(CORE_ECOLOGY_ALPHA36_TIDAL_AGGREGATE_SPECIES).toEqual([
      "atlantic-silverside",
      "atlantic-marsh-fiddler-crab",
      "atlantic-capelin",
    ]);
    expect(species.slice(0, CORE_ECOLOGY_ALPHA36_TIDAL_AGGREGATE_SPECIES.length))
      .toEqual(CORE_ECOLOGY_ALPHA36_TIDAL_AGGREGATE_SPECIES);
    expect(species.slice(CORE_ECOLOGY_ALPHA36_TIDAL_AGGREGATE_SPECIES.length))
      .toEqual(["bay-anchovy", "atlantic-ghost-crab"]);
    expect(new Set(species).size).toBe(species.length);
    expect(Object.isFrozen(CORE_ECOLOGY_TIDAL_AGGREGATE_POLICIES)).toBe(true);
    expect(CORE_ECOLOGY_TIDAL_AGGREGATE_POLICIES.every(Object.isFrozen)).toBe(true);
    for (const tidalSpecies of species) {
      expect(isCoreEcologyTidalAggregateSpecies(tidalSpecies)).toBe(true);
      expect(coreEcologyTidalAggregatePolicy(tidalSpecies)?.species).toBe(tidalSpecies);
    }
    expect(isCoreEcologyTidalAggregateSpecies("brown-rat")).toBe(false);
    expect(coreEcologyTidalAggregatePolicy("brown-rat")).toBeNull();
  });

  it("shares exact school-submersion and crab-exposure boundaries", () => {
    for (const species of ["atlantic-silverside", "bay-anchovy"] as const) {
      expect(coreEcologyTidalAnchorActivityUsable(species, 19_999)).toBe(false);
      expect(coreEcologyTidalAnchorActivityUsable(species, 20_000)).toBe(true);
    }
    for (const species of [
      "atlantic-marsh-fiddler-crab",
      "atlantic-ghost-crab",
    ] as const) {
      expect(coreEcologyTidalAnchorActivityUsable(species, 119_999)).toBe(true);
      expect(coreEcologyTidalAnchorActivityUsable(species, 120_000)).toBe(false);
    }
    expect(coreEcologyTidalAnchorActivityUsable("brown-rat", 40_000)).toBe(false);
    expect(coreEcologyTidalAnchorActivityUsable("bay-anchovy", -1)).toBe(false);
    expect(coreEcologyTidalAnchorActivityUsable("atlantic-ghost-crab", 1.5)).toBe(false);
  });

  it("retains the published silverside cadence and durable operation clock", () => {
    expect(CORE_ECOLOGY_SILVERSIDE_REDISTRIBUTION_CADENCE_TICKS).toBe(4);
    expect(coreEcologyTidalAggregateUsesDurableRedistributionClock(
      "atlantic-silverside",
    )).toBe(true);
    expect(coreEcologyTidalAggregateUsesDurableRedistributionClock(
      "atlantic-marsh-fiddler-crab",
    )).toBe(false);
    expect(coreEcologyTidalAggregateUsesDurableRedistributionClock("bay-anchovy"))
      .toBe(true);
    expect(coreEcologyTidalAggregateUsesDurableRedistributionClock("atlantic-ghost-crab"))
      .toBe(false);
    expect(coreEcologyTidalRedistributionIsDue("atlantic-silverside", 0, null)).toBe(false);
    expect(coreEcologyTidalRedistributionIsDue("atlantic-silverside", 3, null)).toBe(false);
    expect(coreEcologyTidalRedistributionIsDue("atlantic-silverside", 4, null)).toBe(true);
    expect(coreEcologyTidalRedistributionIsDue("atlantic-silverside", 4, 4)).toBe(false);
    expect(coreEcologyTidalRedistributionIsDue("atlantic-silverside", 8, 4)).toBe(true);
    expect(coreEcologyTidalRedistributionIsDue(
      "atlantic-marsh-fiddler-crab",
      4,
      null,
    )).toBe(false);
  });

  it("selects the same deepest dry-anchor refuge and lawful small-world water", () => {
    const depths = depthFixture();
    expect(coreEcologyTidalEvacuationDestinationOrdinal(
      "atlantic-silverside",
      depths,
    )).toBe(2);
    expect(coreEcologyTidalLawfulDestinationOrdinals(
      "atlantic-silverside",
      depths,
    )).toEqual([0, 1, 2]);
    expect(coreEcologyTidalLawfulDestinationOrdinals("bay-anchovy", depths))
      .toEqual([0, 1, 2]);
    expect(coreEcologyTidalLawfulDestinationOrdinals(
      "atlantic-silverside",
      [{ ...depths[0]!, waterDepth: 19_999, activityUsable: false }],
    )).toEqual([]);
    expect(coreEcologyTidalLawfulDestinationOrdinals(
      "atlantic-marsh-fiddler-crab",
      depths,
    )).toBeNull();
    expect(coreEcologyTidalLawfulDestinationOrdinals("atlantic-ghost-crab", depths))
      .toBeNull();
    expect(coreEcologyTidalLawfulDestinationOrdinals("brown-rat", depths)).toBeNull();
  });

  it("retains exact rising and falling edge relocation choices", () => {
    const population = {
      aggregateId: "SILVERSIDE-SCHOOL-v1-test",
      lastTidalRedistributionTick: null,
      anchors: [
        { anchorOrdinal: 0, populationUnits: 2 },
        { anchorOrdinal: 1, populationUnits: 1 },
        { anchorOrdinal: 2, populationUnits: 0 },
      ],
    } as const;
    const depths = depthFixture();
    expect(resolveCoreEcologyTidalRedistribution(
      "atlantic-silverside",
      population,
      depths,
      1,
    )).toEqual({
      fromAnchorOrdinal: 1,
      toAnchorOrdinal: 0,
      populationUnits: 1,
      pressure: 350_000,
    });
    expect(resolveCoreEcologyTidalRedistribution(
      "atlantic-silverside",
      population,
      depths,
      -1,
    )).toEqual({
      fromAnchorOrdinal: 0,
      toAnchorOrdinal: 2,
      populationUnits: 1,
      pressure: 510_000,
    });
    expect(resolveCoreEcologyTidalRedistribution(
      "atlantic-marsh-fiddler-crab",
      population,
      depths,
      1,
    )).toBeNull();
    expect(resolveCoreEcologyTidalRedistribution(
      "atlantic-ghost-crab",
      population,
      depths,
      1,
    )).toBeNull();
  });

  it("retains exact schooling and exposed-flat activity arithmetic", () => {
    expect(resolveCoreEcologyTidalAggregateActivity(
      "atlantic-silverside",
      800_000,
      70_000,
      1,
      true,
    )).toBe(559_360);
    expect(resolveCoreEcologyTidalAggregateActivity(
      "atlantic-silverside",
      800_000,
      70_000,
      -1,
      true,
    )).toBe(509_440);
    expect(resolveCoreEcologyTidalAggregateActivity(
      "atlantic-silverside",
      800_000,
      70_000,
      1,
      false,
    )).toBe(0);
    expect(resolveCoreEcologyTidalAggregateActivity(
      "atlantic-marsh-fiddler-crab",
      800_000,
      30_000,
      1,
      true,
    )).toBe(590_880);
    expect(resolveCoreEcologyTidalAggregateActivity(
      "atlantic-marsh-fiddler-crab",
      800_000,
      30_000,
      -1,
      true,
    )).toBe(660_000);
    expect(resolveCoreEcologyTidalAggregateActivity(
      "atlantic-marsh-fiddler-crab",
      800_000,
      120_000,
      -1,
      false,
    )).toBe(0);
    expect(resolveCoreEcologyTidalAggregateActivity(
      "bay-anchovy",
      800_000,
      70_000,
      1,
      false,
    )).toBe(0);
    expect(resolveCoreEcologyTidalAggregateActivity(
      "bay-anchovy",
      800_000,
      70_000,
      1,
      true,
    )).toBe(559_360);
    expect(resolveCoreEcologyTidalAggregateActivity(
      "atlantic-ghost-crab",
      800_000,
      30_000,
      -1,
      true,
    )).toBe(660_000);
    expect(resolveCoreEcologyTidalAggregateActivity(
      "atlantic-ghost-crab",
      800_000,
      120_000,
      -1,
      false,
    )).toBe(0);
  });
});

function depthFixture(): readonly CoreEcologyTidalAnchorDepthLike[] {
  return Object.freeze([
    Object.freeze({
      aggregateId: "SILVERSIDE-SCHOOL-v1-test",
      anchorOrdinal: 0,
      waterDepth: 30_000,
      activityUsable: true,
    }),
    Object.freeze({
      aggregateId: "SILVERSIDE-SCHOOL-v1-test",
      anchorOrdinal: 1,
      waterDepth: 80_000,
      activityUsable: true,
    }),
    Object.freeze({
      aggregateId: "SILVERSIDE-SCHOOL-v1-test",
      anchorOrdinal: 2,
      waterDepth: 120_000,
      activityUsable: true,
    }),
  ]);
}

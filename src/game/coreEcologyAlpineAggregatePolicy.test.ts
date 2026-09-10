import { describe, expect, it } from "vitest";

import { isLivingSpeciesActorAddressable } from "./livingSpeciesRegistry";
import {
  CORE_ECOLOGY_AGGREGATE_SPECIES,
  coreEcologyAggregateDisturbanceEvidenceKind,
  coreEcologyAggregateSpeciesPolicy,
  isCoreEcologyAggregateSpecies,
  resolveCoreEcologyAggregateLivingResponse,
  resolveCoreEcologyAggregateDisturbanceActivity,
  type CoreEcologyAggregatePolicyDisturbanceCause,
} from "./coreEcologyAggregatePolicy";

export const ALPHA33_ALPINE_SHARED_ACTIVITY_OWNER_INTENT =
  "test:alpha33-alpine-shared-activity:v1" as const;

const ALPHA32_AGGREGATE_PREFIX = [
  "brown-rat",
  "southern-leopard-frog",
  "atlantic-silverside",
  "atlantic-marsh-fiddler-crab",
] as const;

const ALPHA33_AGGREGATE_PREFIX = [
  ...ALPHA32_AGGREGATE_PREFIX,
  "american-pika",
] as const;

const DISTURBANCE_CAUSES: readonly CoreEcologyAggregatePolicyDisturbanceCause[] = [
  "animal-disturbance",
  "food-attraction",
  "human-disturbance",
  "predator-pressure",
  "tide-pressure",
  "weather-pressure",
];

describe("Wave F aggregate policy composition", () => {
  it("appends pika without rewriting the Alpha 32 aggregate order", () => {
    expect(CORE_ECOLOGY_AGGREGATE_SPECIES.slice(0, ALPHA32_AGGREGATE_PREFIX.length))
      .toEqual(ALPHA32_AGGREGATE_PREFIX);
    expect(CORE_ECOLOGY_AGGREGATE_SPECIES.slice(0, ALPHA33_AGGREGATE_PREFIX.length))
      .toEqual(ALPHA33_AGGREGATE_PREFIX);
    expect(CORE_ECOLOGY_AGGREGATE_SPECIES.slice(ALPHA33_AGGREGATE_PREFIX.length))
      .toEqual(["atlantic-capelin"]);
    expect(isCoreEcologyAggregateSpecies("american-pika")).toBe(true);
    expect(isLivingSpeciesActorAddressable("american-pika")).toBe(false);
  });

  it("appends capelin as a conserved school aggregate with a distinct namespace", () => {
    expect(isCoreEcologyAggregateSpecies("atlantic-capelin")).toBe(true);
    expect(isLivingSpeciesActorAddressable("atlantic-capelin")).toBe(false);
    expect(coreEcologyAggregateSpeciesPolicy("atlantic-capelin")).toMatchObject({
      stableIdPrefix: "CAPELIN-SCHOOL-v1-",
      representation: "group-actor",
      maximumAnchors: 4,
      activity: {
        kind: "schooling-glint",
        activePeriod: "tide-responsive",
        baselineProjection: "preserve",
        perceivedPressureResponse: "preserve",
      },
      initialEvidenceKinds: ["surface-dimple"],
      exposedFoodAttraction: false,
      rainSensitive: false,
      tideResponse: "flood-active",
    });
  });

  it("keeps every disturbance-evidence selection inside the policy evidence vocabulary", () => {
    for (const species of CORE_ECOLOGY_AGGREGATE_SPECIES) {
      const policy = coreEcologyAggregateSpeciesPolicy(species);
      const configuredKinds = [
        policy.disturbanceEvidence.defaultKind,
        ...Object.values(policy.disturbanceEvidence.byCause),
      ];
      for (const evidenceKind of configuredKinds) {
        expect(policy.initialEvidenceKinds, `${species}:${evidenceKind}`)
          .toContain(evidenceKind);
      }
      for (const cause of DISTURBANCE_CAUSES) {
        expect(policy.initialEvidenceKinds, `${species}:${cause}`)
          .toContain(coreEcologyAggregateDisturbanceEvidenceKind(species, cause));
      }
    }
  });

  it("preserves legacy evidence mappings and routes capelin tide displacement generically", () => {
    expect(coreEcologyAggregateDisturbanceEvidenceKind("brown-rat", "weather-pressure"))
      .toBe("shelter-sign");
    expect(coreEcologyAggregateDisturbanceEvidenceKind("brown-rat", "human-disturbance"))
      .toBe("tracks");
    expect(coreEcologyAggregateDisturbanceEvidenceKind(
      "atlantic-marsh-fiddler-crab",
      "tide-pressure",
    )).toBe("feeding-scrape");
    expect(coreEcologyAggregateDisturbanceEvidenceKind(
      "atlantic-marsh-fiddler-crab",
      "predator-pressure",
    )).toBe("burrow-opening");
    expect(coreEcologyAggregateDisturbanceEvidenceKind("american-pika", "weather-pressure"))
      .toBe("talus-sign");
    expect(coreEcologyAggregateDisturbanceEvidenceKind("atlantic-capelin", "tide-pressure"))
      .toBe("surface-dimple");
  });

  it(`${ALPHA33_ALPINE_SHARED_ACTIVITY_OWNER_INTENT} expresses pika talus activity and broad pressure through shared policy`, () => {
    expect(coreEcologyAggregateSpeciesPolicy("american-pika")).toMatchObject({
      representation: "aggregate-area",
      maximumAnchors: 4,
      activity: {
        kind: "talus-foraging",
        activePeriod: "diurnal",
        baselineProjection: "preserve",
        perceivedPressureResponse: "quiet",
      },
      initialEvidenceKinds: ["haypile", "talus-sign"],
      exposedFoodAttraction: false,
      tideResponse: "neutral",
    });
    expect(resolveCoreEcologyAggregateLivingResponse("american-pika", "golden-eagle"))
      .toMatchObject({ response: "pressure", causeKind: "predator-pressure" });
    expect(resolveCoreEcologyAggregateLivingResponse("american-pika", "mountain-goat"))
      .toBeNull();
    expect(resolveCoreEcologyAggregateDisturbanceActivity(
      "american-pika",
      800_000,
      "predator-pressure",
      750_000,
    )).toBe(200_000);
  });
});

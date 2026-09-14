import { describe, expect, it } from "vitest";

import { isLivingSpeciesActorAddressable } from "./livingSpeciesRegistry";
import {
  CORE_ECOLOGY_ALPHA36_AGGREGATE_SPECIES,
  CORE_ECOLOGY_AGGREGATE_SPECIES,
  CORE_ECOLOGY_WAVE_G_ESTUARY_AGGREGATE_SPECIES,
  coreEcologyAggregateDisturbanceEvidenceKind,
  coreEcologyAggregateSpeciesPolicy,
  isCoreEcologyAggregateSpecies,
  resolveCoreEcologyAggregateLivingResponse,
  resolveCoreEcologyAggregateDisturbanceActivity,
  type CoreEcologyAggregatePolicyDisturbanceCause,
} from "./coreEcologyAggregatePolicy";
import { coreEcologySpeciesRuntimePolicy } from "./coreEcologySpeciesRuntimePolicy";

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

const ALPHA36_AGGREGATE_PREFIX = [
  ...ALPHA33_AGGREGATE_PREFIX,
  "atlantic-capelin",
] as const;

const WAVE_G_ESTUARY_AGGREGATES = Object.freeze([
  Object.freeze({
    species: "bay-anchovy" as const,
    stableIdPrefix: "BAYANCHOVY-SCHOOL-v1-" as const,
    representation: "group-actor" as const,
    activityKind: "schooling-glint" as const,
    evidenceKinds: Object.freeze(["surface-dimple"] as const),
    tideResponse: "flood-active" as const,
  }),
  Object.freeze({
    species: "atlantic-ghost-crab" as const,
    stableIdPrefix: "GHOSTCRAB-AREA-v1-" as const,
    representation: "aggregate-area" as const,
    activityKind: "burrow-foraging" as const,
    evidenceKinds: Object.freeze(["burrow-opening", "feeding-scrape"] as const),
    tideResponse: "ebb-active" as const,
  }),
] as const);

const WAVE_G_MARSH_CHANNEL_AGGREGATES = Object.freeze([
  Object.freeze({
    species: "atlantic-menhaden" as const,
    stableIdPrefix: "MENHADEN-SCHOOL-v1-" as const,
    representation: "group-actor" as const,
    activityKind: "schooling-glint" as const,
    evidenceKinds: Object.freeze(["surface-dimple"] as const),
    tideResponse: "flood-active" as const,
  }),
  Object.freeze({
    species: "mummichog" as const,
    stableIdPrefix: "MUMMICHOG-SCHOOL-v1-" as const,
    representation: "group-actor" as const,
    activityKind: "schooling-glint" as const,
    evidenceKinds: Object.freeze(["surface-dimple"] as const),
    tideResponse: "flood-active" as const,
  }),
  Object.freeze({
    species: "grass-shrimp" as const,
    stableIdPrefix: "GRASSSHRIMP-AREA-v1-" as const,
    representation: "aggregate-area" as const,
    activityKind: "schooling-glint" as const,
    evidenceKinds: Object.freeze(["surface-dimple"] as const),
    tideResponse: "flood-active" as const,
  }),
  Object.freeze({
    species: "blue-crab" as const,
    stableIdPrefix: "BLUECRAB-AREA-v1-" as const,
    representation: "aggregate-area" as const,
    activityKind: "burrow-foraging" as const,
    evidenceKinds: Object.freeze(["burrow-opening", "feeding-scrape"] as const),
    tideResponse: "ebb-active" as const,
  }),
] as const);

const DISTURBANCE_CAUSES: readonly CoreEcologyAggregatePolicyDisturbanceCause[] = [
  "animal-disturbance",
  "food-attraction",
  "human-disturbance",
  "predator-pressure",
  "tide-pressure",
  "weather-pressure",
];

describe("core ecology aggregate policy composition", () => {
  it("preserves every frozen aggregate prefix before appending Wave G", () => {
    expect(CORE_ECOLOGY_AGGREGATE_SPECIES.slice(0, ALPHA32_AGGREGATE_PREFIX.length))
      .toEqual(ALPHA32_AGGREGATE_PREFIX);
    expect(CORE_ECOLOGY_AGGREGATE_SPECIES.slice(0, ALPHA33_AGGREGATE_PREFIX.length))
      .toEqual(ALPHA33_AGGREGATE_PREFIX);
    expect(CORE_ECOLOGY_ALPHA36_AGGREGATE_SPECIES).toEqual(ALPHA36_AGGREGATE_PREFIX);
    expect(CORE_ECOLOGY_AGGREGATE_SPECIES.slice(0, ALPHA36_AGGREGATE_PREFIX.length))
      .toEqual(ALPHA36_AGGREGATE_PREFIX);
    expect(CORE_ECOLOGY_WAVE_G_ESTUARY_AGGREGATE_SPECIES.slice(
      ALPHA36_AGGREGATE_PREFIX.length,
    ))
      .toEqual(WAVE_G_ESTUARY_AGGREGATES.map(({ species }) => species));
    expect(CORE_ECOLOGY_AGGREGATE_SPECIES.slice(
      0,
      CORE_ECOLOGY_WAVE_G_ESTUARY_AGGREGATE_SPECIES.length,
    )).toEqual(CORE_ECOLOGY_WAVE_G_ESTUARY_AGGREGATE_SPECIES);
    expect(CORE_ECOLOGY_AGGREGATE_SPECIES.slice(
      CORE_ECOLOGY_WAVE_G_ESTUARY_AGGREGATE_SPECIES.length,
    )).toEqual(WAVE_G_MARSH_CHANNEL_AGGREGATES.map(({ species }) => species));
    expect(isCoreEcologyAggregateSpecies("american-pika")).toBe(true);
    expect(isLivingSpeciesActorAddressable("american-pika")).toBe(false);
  });

  it("composes both estuary aggregates through the same bounded policy invariants", () => {
    for (const expected of WAVE_G_ESTUARY_AGGREGATES) {
      expect(isCoreEcologyAggregateSpecies(expected.species)).toBe(true);
      expect(isLivingSpeciesActorAddressable(expected.species)).toBe(false);

      const aggregatePolicy = coreEcologyAggregateSpeciesPolicy(expected.species);
      const runtimePolicy = coreEcologySpeciesRuntimePolicy(expected.species);
      if (runtimePolicy === null) {
        throw new Error(`Missing runtime policy for ${expected.species}`);
      }
      expect(aggregatePolicy).toMatchObject({
        stableIdPrefix: expected.stableIdPrefix,
        representation: expected.representation,
        maximumAnchors: 4,
        activity: {
          kind: expected.activityKind,
          activePeriod: "tide-responsive",
          baselineProjection: "preserve",
          perceivedPressureResponse: "preserve",
        },
        initialEvidenceKinds: expected.evidenceKinds,
        exposedFoodAttraction: false,
        rainSensitive: false,
        tideResponse: expected.tideResponse,
      });
      expect(runtimePolicy.actorAddressable).toBe(false);
      expect(runtimePolicy.capabilities).toContain("aggregate-response");
      expect(runtimePolicy.aggregate?.maximumAnchors).toBe(aggregatePolicy.maximumAnchors);
      expect(runtimePolicy.evidenceKinds).toEqual(aggregatePolicy.initialEvidenceKinds);
    }
  });

  it("composes the marsh-channel aggregates through those same bounded invariants", () => {
    for (const expected of WAVE_G_MARSH_CHANNEL_AGGREGATES) {
      expect(isCoreEcologyAggregateSpecies(expected.species)).toBe(true);
      expect(isLivingSpeciesActorAddressable(expected.species)).toBe(false);

      const aggregatePolicy = coreEcologyAggregateSpeciesPolicy(expected.species);
      const runtimePolicy = coreEcologySpeciesRuntimePolicy(expected.species);
      expect(aggregatePolicy).toMatchObject({
        stableIdPrefix: expected.stableIdPrefix,
        representation: expected.representation,
        maximumAnchors: 4,
        activity: {
          kind: expected.activityKind,
          activePeriod: "tide-responsive",
          baselineProjection: "preserve",
        },
        initialEvidenceKinds: expected.evidenceKinds,
        exposedFoodAttraction: false,
        rainSensitive: false,
        tideResponse: expected.tideResponse,
      });
      expect(runtimePolicy).not.toBeNull();
      expect(runtimePolicy?.actorAddressable).toBe(false);
      expect(runtimePolicy?.capabilities).toContain("aggregate-response");
      expect(runtimePolicy?.aggregate?.maximumAnchors)
        .toBe(aggregatePolicy.maximumAnchors);
      expect(runtimePolicy?.evidenceKinds).toEqual(aggregatePolicy.initialEvidenceKinds);
    }
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

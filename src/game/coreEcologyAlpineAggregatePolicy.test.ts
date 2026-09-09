import { describe, expect, it } from "vitest";

import { isLivingSpeciesActorAddressable } from "./livingSpeciesRegistry";
import {
  CORE_ECOLOGY_AGGREGATE_SPECIES,
  coreEcologyAggregateSpeciesPolicy,
  isCoreEcologyAggregateSpecies,
  resolveCoreEcologyAggregateLivingResponse,
  resolveCoreEcologyAggregateDisturbanceActivity,
} from "./coreEcologyAggregatePolicy";

export const ALPHA33_ALPINE_SHARED_ACTIVITY_OWNER_INTENT =
  "test:alpha33-alpine-shared-activity:v1" as const;

const ALPHA32_AGGREGATE_PREFIX = [
  "brown-rat",
  "southern-leopard-frog",
  "atlantic-silverside",
  "atlantic-marsh-fiddler-crab",
] as const;

describe("Wave F aggregate policy composition", () => {
  it("appends pika without rewriting the Alpha 32 aggregate order", () => {
    expect(CORE_ECOLOGY_AGGREGATE_SPECIES.slice(0, ALPHA32_AGGREGATE_PREFIX.length))
      .toEqual(ALPHA32_AGGREGATE_PREFIX);
    expect(CORE_ECOLOGY_AGGREGATE_SPECIES.at(-1)).toBe("american-pika");
    expect(isCoreEcologyAggregateSpecies("american-pika")).toBe(true);
    expect(isLivingSpeciesActorAddressable("american-pika")).toBe(false);
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

import { FIXED_POINT } from "../sim/types";
import { coreEcologyTrophicPerceivedClass } from "./coreEcologyTrophic";
import { coreEcologySpeciesHasRuntimeCapability } from "./coreEcologySpeciesRuntimePolicy";
import {
  LIVING_ACTOR_SPECIES,
  isLivingActorSpecies,
  isLivingSpeciesActorAddressable,
  type LivingActorSpecies,
} from "./livingSpeciesRegistry";

export const CORE_ECOLOGY_AGGREGATE_SPECIES = Object.freeze([
  "brown-rat",
  "southern-leopard-frog",
  "atlantic-silverside",
  "atlantic-marsh-fiddler-crab",
  "american-pika",
] as const);

export type CoreEcologyAggregateSpecies =
  (typeof CORE_ECOLOGY_AGGREGATE_SPECIES)[number];

export type CoreEcologyAggregateActivityKind =
  | "burrow-foraging"
  | "talus-foraging"
  | "rain-chorus"
  | "rustle-scratch"
  | "schooling-glint";

export type CoreEcologyAggregateActivePeriod =
  | "diurnal"
  | "nocturnal"
  | "rain-responsive"
  | "tide-responsive";

export type CoreEcologyAggregateActivityBaselineProjection =
  | "preserve"
  | "rain-responsive";

export type CoreEcologyAggregatePerceivedPressureActivityResponse =
  | "preserve"
  | "quiet";

export type CoreEcologyAggregatePolicyEvidenceKind =
  | "burrow-opening"
  | "feeding-scrape"
  | "frog-track"
  | "gnaw-mark"
  | "haypile"
  | "shelter-sign"
  | "surface-dimple"
  | "talus-sign"
  | "tracks";

/**
 * `cat` and `dog` are frozen Alpha-16 stimulus/event spellings. New perception
 * input always carries a canonical living species; only the transient
 * aggregate-facing payload retains those aliases so its v2 compatibility shape
 * remains stable.
 */
export type CoreEcologyAggregateLivingSourceKind =
  | "cat"
  | "dog"
  | Exclude<
      LivingActorSpecies,
      "domestic-cat" | "domestic-dog" | CoreEcologyAggregateSpecies
    >;

export const CORE_ECOLOGY_AGGREGATE_LIVING_SOURCE_KINDS:
readonly CoreEcologyAggregateLivingSourceKind[] = Object.freeze(
  LIVING_ACTOR_SPECIES.flatMap((sourceSpecies): CoreEcologyAggregateLivingSourceKind[] => {
    if (!isLivingSpeciesActorAddressable(sourceSpecies)) return [];
    return [(sourceSpecies === "domestic-cat"
      ? "cat"
      : sourceSpecies === "domestic-dog"
        ? "dog"
        : sourceSpecies) as CoreEcologyAggregateLivingSourceKind];
  }),
);

export type CoreEcologyAggregateLivingResponseCause =
  | "animal-disturbance"
  | "human-disturbance"
  | "predator-pressure";

export interface CoreEcologyAggregateLivingResponse {
  readonly sourceSpecies: LivingActorSpecies;
  readonly sourceKind: CoreEcologyAggregateLivingSourceKind;
  readonly response: "pressure";
  readonly causeKind: CoreEcologyAggregateLivingResponseCause;
}

export interface CoreEcologyAggregateSpeciesPolicy {
  readonly species: CoreEcologyAggregateSpecies;
  /** Prefix only. The digest payload remains frozen for existing rat IDs. */
  readonly stableIdPrefix:
    | "FIDDLER-AREA-v1-"
    | "FROG-AREA-v1-"
    | "PIKA-TALUS-v1-"
    | "RAT-AREA-v1-"
    | "SILVERSIDE-SCHOOL-v1-";
  readonly representation: "aggregate-area" | "group-actor";
  readonly maximumAnchors: number;
  readonly anchorRadiusTiles: number;
  readonly activity: Readonly<{
    readonly kind: CoreEcologyAggregateActivityKind;
    readonly activePeriod: CoreEcologyAggregateActivePeriod;
    /** Runtime environmental baseline applied after an authorized frame. */
    readonly baselineProjection: CoreEcologyAggregateActivityBaselineProjection;
    /** Current activity response to non-weather pressure perceived at anchors. */
    readonly perceivedPressureResponse:
      CoreEcologyAggregatePerceivedPressureActivityResponse;
  }>;
  readonly initialEvidenceKinds: readonly CoreEcologyAggregatePolicyEvidenceKind[];
  readonly exposedFoodAttraction: boolean;
  readonly rainSensitive: boolean;
  readonly rainResponse: "attraction" | "pressure";
  readonly tideResponse: "ebb-active" | "flood-active" | "neutral";
}

const POLICIES: Readonly<
  Record<CoreEcologyAggregateSpecies, CoreEcologyAggregateSpeciesPolicy>
> = Object.freeze({
  "brown-rat": Object.freeze({
    species: "brown-rat",
    stableIdPrefix: "RAT-AREA-v1-",
    representation: "aggregate-area",
    maximumAnchors: 4,
    anchorRadiusTiles: 2,
    activity: Object.freeze({
      kind: "rustle-scratch",
      activePeriod: "nocturnal",
      baselineProjection: "preserve",
      perceivedPressureResponse: "preserve",
    }),
    initialEvidenceKinds: Object.freeze([
      "gnaw-mark",
      "tracks",
      "shelter-sign",
    ] as const),
    exposedFoodAttraction: true,
    rainSensitive: true,
    rainResponse: "pressure",
    tideResponse: "neutral",
  }),
  "southern-leopard-frog": Object.freeze({
    species: "southern-leopard-frog",
    stableIdPrefix: "FROG-AREA-v1-",
    representation: "aggregate-area",
    maximumAnchors: 3,
    anchorRadiusTiles: 3,
    activity: Object.freeze({
      kind: "rain-chorus",
      activePeriod: "rain-responsive",
      baselineProjection: "rain-responsive",
      perceivedPressureResponse: "quiet",
    }),
    initialEvidenceKinds: Object.freeze(["frog-track"] as const),
    exposedFoodAttraction: false,
    rainSensitive: true,
    rainResponse: "attraction",
    tideResponse: "neutral",
  }),
  "atlantic-silverside": Object.freeze({
    species: "atlantic-silverside",
    stableIdPrefix: "SILVERSIDE-SCHOOL-v1-",
    representation: "group-actor",
    maximumAnchors: 3,
    anchorRadiusTiles: 3,
    activity: Object.freeze({
      kind: "schooling-glint",
      activePeriod: "tide-responsive",
      baselineProjection: "preserve",
      perceivedPressureResponse: "preserve",
    }),
    initialEvidenceKinds: Object.freeze(["surface-dimple"] as const),
    exposedFoodAttraction: false,
    rainSensitive: false,
    rainResponse: "pressure",
    tideResponse: "flood-active",
  }),
  "atlantic-marsh-fiddler-crab": Object.freeze({
    species: "atlantic-marsh-fiddler-crab",
    stableIdPrefix: "FIDDLER-AREA-v1-",
    representation: "aggregate-area",
    maximumAnchors: 4,
    anchorRadiusTiles: 2,
    activity: Object.freeze({
      kind: "burrow-foraging",
      activePeriod: "tide-responsive",
      baselineProjection: "preserve",
      perceivedPressureResponse: "preserve",
    }),
    initialEvidenceKinds: Object.freeze([
      "burrow-opening",
      "feeding-scrape",
    ] as const),
    exposedFoodAttraction: false,
    rainSensitive: false,
    rainResponse: "pressure",
    tideResponse: "ebb-active",
  }),
  "american-pika": Object.freeze({
    species: "american-pika",
    stableIdPrefix: "PIKA-TALUS-v1-",
    representation: "aggregate-area",
    maximumAnchors: 4,
    anchorRadiusTiles: 2,
    activity: Object.freeze({
      kind: "talus-foraging",
      activePeriod: "diurnal",
      baselineProjection: "preserve",
      perceivedPressureResponse: "quiet",
    }),
    initialEvidenceKinds: Object.freeze([
      "haypile",
      "talus-sign",
    ] as const),
    exposedFoodAttraction: false,
    rainSensitive: false,
    rainResponse: "pressure",
    tideResponse: "neutral",
  }),
});

export function isCoreEcologyAggregateSpecies(
  value: unknown,
): value is CoreEcologyAggregateSpecies {
  return typeof value === "string"
    && (CORE_ECOLOGY_AGGREGATE_SPECIES as readonly string[]).includes(value);
}

export function coreEcologyAggregateSpeciesPolicy(
  species: CoreEcologyAggregateSpecies,
): CoreEcologyAggregateSpeciesPolicy {
  return POLICIES[species];
}

/** Frozen event spelling for one canonical materialized living source. */
export function coreEcologyAggregateLivingSourceKind(
  sourceSpecies: LivingActorSpecies,
): CoreEcologyAggregateLivingSourceKind | null {
  if (!isLivingSpeciesActorAddressable(sourceSpecies)) return null;
  return sourceSpecies === "domestic-cat"
    ? "cat"
    : sourceSpecies === "domestic-dog"
      ? "dog"
      : sourceSpecies as CoreEcologyAggregateLivingSourceKind;
}

/** Reverse only the compatibility spelling; unknown kinds fail closed. */
export function coreEcologyAggregateLivingSourceSpecies(
  sourceKind: unknown,
): LivingActorSpecies | null {
  if (sourceKind === "cat") return "domestic-cat";
  if (sourceKind === "dog") return "domestic-dog";
  if (
    !isLivingActorSpecies(sourceKind)
    || sourceKind === "domestic-cat"
    || sourceKind === "domestic-dog"
    || !isLivingSpeciesActorAddressable(sourceKind)
  ) return null;
  return sourceKind;
}

/**
 * Shared role/capability/trophic bridge for every materialized living actor.
 * Neutral co-presence intentionally has no response. A new species therefore
 * participates through its living registry and shared ecological declarations,
 * not by being appended to an aggregate pair allowlist.
 */
export function resolveCoreEcologyAggregateLivingResponse(
  targetSpecies: CoreEcologyAggregateSpecies,
  sourceSpecies: LivingActorSpecies,
): CoreEcologyAggregateLivingResponse | null {
  if (
    !coreEcologySpeciesHasRuntimeCapability(targetSpecies, "aggregate-response")
    || !isLivingSpeciesActorAddressable(sourceSpecies)
  ) return null;
  const sourceKind = coreEcologyAggregateLivingSourceKind(sourceSpecies);
  if (sourceKind === null) return null;
  if (sourceSpecies === "human") {
    return Object.freeze({
      sourceSpecies,
      sourceKind,
      response: "pressure",
      causeKind: "human-disturbance",
    });
  }

  const relationship = coreEcologyTrophicPerceivedClass(
    targetSpecies,
    sourceSpecies,
  );
  if (
    relationship === "predator"
    || relationship === "large-predator"
    || relationship === "aerial-predator"
    || relationship === "aquatic-foraging-pressure"
  ) {
    return Object.freeze({
      sourceSpecies,
      sourceKind,
      response: "pressure",
      causeKind: "predator-pressure",
    });
  }
  if (relationship === "food-competitor" || relationship === "mobbing-pressure") {
    return Object.freeze({
      sourceSpecies,
      sourceKind,
      response: "pressure",
      causeKind: "animal-disturbance",
    });
  }

  // Nearby aerial food investigators disturb a small aggregate after shared
  // LOS resolves. This preserves gull/crow disturbance through capabilities,
  // while neutral terrestrial prey such as rabbits remain neutral.
  if (
    coreEcologySpeciesHasRuntimeCapability(sourceSpecies, "aerial-locomotion")
    && coreEcologySpeciesHasRuntimeCapability(sourceSpecies, "food-investigation")
  ) {
    return Object.freeze({
      sourceSpecies,
      sourceKind,
      response: "pressure",
      causeKind: "animal-disturbance",
    });
  }
  return null;
}

/**
 * Presentation/activity projection only: weather changes what an extant area
 * is doing, never its ID, anchors, population size, or historical evidence.
 */
export function resolveCoreEcologyAggregateActivityIntensity(
  species: CoreEcologyAggregateSpecies,
  habitatIntensity: number,
  rainIntensity: number,
): number {
  if (!fixedPoint(habitatIntensity) || !fixedPoint(rainIntensity)) {
    throw new RangeError("Aggregate activity inputs must use fixed-point 0..1 values");
  }
  if (species === "brown-rat") {
    return habitatIntensity;
  }
  if (species !== "southern-leopard-frog") {
    return habitatIntensity;
  }
  return Math.min(
    FIXED_POINT,
    multiplyFixed(habitatIntensity, 150_000)
      + multiplyFixed(rainIntensity, 850_000),
  );
}

/** Species-aware activity consequence of one already-authorized relocation. */
export function resolveCoreEcologyAggregateDisturbanceActivity(
  species: CoreEcologyAggregateSpecies,
  currentIntensity: number,
  causeKind:
    | "animal-disturbance"
    | "food-attraction"
    | "human-disturbance"
    | "predator-pressure"
    | "tide-pressure"
    | "weather-pressure",
  pressure: number,
): number {
  if (!fixedPoint(currentIntensity) || !fixedPoint(pressure)) {
    throw new RangeError("Aggregate disturbance activity must use fixed-point 0..1 values");
  }
  if (
    species === "brown-rat"
    || species === "southern-leopard-frog" && causeKind === "weather-pressure"
  ) {
    // This is the frozen rat behavior. Rain activates frog redistribution and
    // chorus rather than borrowing the rat's shelter response.
    return Math.max(currentIntensity, pressure);
  }
  return multiplyFixed(currentIntensity, FIXED_POINT - pressure);
}

function multiplyFixed(left: number, right: number): number {
  return Math.trunc((left * right + Math.trunc(FIXED_POINT / 2)) / FIXED_POINT);
}

function fixedPoint(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= FIXED_POINT
    && !Object.is(value, -0);
}

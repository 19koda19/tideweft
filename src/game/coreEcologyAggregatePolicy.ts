import { FIXED_POINT } from "../sim/types";
import { coreEcologyTrophicPerceivedClass } from "./coreEcologyTrophic";
import { coreEcologySpeciesHasRuntimeCapability } from "./coreEcologySpeciesRuntimePolicy";
import {
  LIVING_ACTOR_SPECIES,
  isLivingActorSpecies,
  isLivingSpeciesActorAddressable,
  type LivingActorSpecies,
} from "./livingSpeciesRegistry";

/** Frozen aggregate-species prefix through the Alpha 36 polar-forage slice. */
export const CORE_ECOLOGY_ALPHA36_AGGREGATE_SPECIES = Object.freeze([
  "brown-rat",
  "southern-leopard-frog",
  "atlantic-silverside",
  "atlantic-marsh-fiddler-crab",
  "american-pika",
  "atlantic-capelin",
] as const);

/** Immutable aggregate registry through the first Wave-G estuary cluster. */
export const CORE_ECOLOGY_WAVE_G_ESTUARY_AGGREGATE_SPECIES = Object.freeze([
  ...CORE_ECOLOGY_ALPHA36_AGGREGATE_SPECIES,
  "bay-anchovy",
  "atlantic-ghost-crab",
] as const);

/** Append-only aggregate registry after the marsh-channel cohort. */
export const CORE_ECOLOGY_AGGREGATE_SPECIES = Object.freeze([
  ...CORE_ECOLOGY_WAVE_G_ESTUARY_AGGREGATE_SPECIES,
  "atlantic-menhaden",
  "mummichog",
  "grass-shrimp",
  "blue-crab",
  "eastern-saltmarsh-mosquito",
  "marsh-periwinkle",
] as const);

export type CoreEcologyAggregateSpecies =
  (typeof CORE_ECOLOGY_AGGREGATE_SPECIES)[number];

export type CoreEcologyAggregateActivityKind =
  | "burrow-foraging"
  | "talus-foraging"
  | "rain-chorus"
  | "rustle-scratch"
  | "schooling-glint"
  | "surface-crawling"
  | "swarming";

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
  | "grazing-trace"
  | "shell-cluster"
  | "shelter-sign"
  | "surface-dimple"
  | "swarm-haze"
  | "talus-sign"
  | "tracks";

export type CoreEcologyAggregatePolicyDisturbanceCause =
  | "animal-disturbance"
  | "food-attraction"
  | "human-disturbance"
  | "predator-pressure"
  | "tide-pressure"
  | "weather-pressure";

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
    | "SILVERSIDE-SCHOOL-v1-"
    | "CAPELIN-SCHOOL-v1-"
    | "BAYANCHOVY-SCHOOL-v1-"
    | "GHOSTCRAB-AREA-v1-"
    | "MENHADEN-SCHOOL-v1-"
    | "MUMMICHOG-SCHOOL-v1-"
    | "GRASSSHRIMP-AREA-v1-"
    | "BLUECRAB-AREA-v1-"
    | "MOSQUITO-AREA-v1-"
    | "PERIWINKLE-AREA-v1-";
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
  readonly disturbanceEvidence: Readonly<{
    readonly defaultKind: CoreEcologyAggregatePolicyEvidenceKind;
    readonly byCause: Readonly<Partial<Record<
      CoreEcologyAggregatePolicyDisturbanceCause,
      CoreEcologyAggregatePolicyEvidenceKind
    >>>;
  }>;
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
    disturbanceEvidence: Object.freeze({
      defaultKind: "tracks",
      byCause: Object.freeze({ "weather-pressure": "shelter-sign" }),
    }),
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
    disturbanceEvidence: Object.freeze({
      defaultKind: "frog-track",
      byCause: Object.freeze({}),
    }),
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
    disturbanceEvidence: Object.freeze({
      defaultKind: "surface-dimple",
      byCause: Object.freeze({}),
    }),
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
    disturbanceEvidence: Object.freeze({
      defaultKind: "burrow-opening",
      byCause: Object.freeze({ "tide-pressure": "feeding-scrape" }),
    }),
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
    disturbanceEvidence: Object.freeze({
      defaultKind: "talus-sign",
      byCause: Object.freeze({}),
    }),
    exposedFoodAttraction: false,
    rainSensitive: false,
    rainResponse: "pressure",
    tideResponse: "neutral",
  }),
  "atlantic-capelin": Object.freeze({
    species: "atlantic-capelin",
    stableIdPrefix: "CAPELIN-SCHOOL-v1-",
    representation: "group-actor",
    maximumAnchors: 4,
    anchorRadiusTiles: 4,
    activity: Object.freeze({
      kind: "schooling-glint",
      activePeriod: "tide-responsive",
      baselineProjection: "preserve",
      perceivedPressureResponse: "preserve",
    }),
    initialEvidenceKinds: Object.freeze(["surface-dimple"] as const),
    disturbanceEvidence: Object.freeze({
      defaultKind: "surface-dimple",
      byCause: Object.freeze({}),
    }),
    exposedFoodAttraction: false,
    rainSensitive: false,
    rainResponse: "pressure",
    tideResponse: "flood-active",
  }),
  "bay-anchovy": Object.freeze({
    species: "bay-anchovy",
    stableIdPrefix: "BAYANCHOVY-SCHOOL-v1-",
    representation: "group-actor",
    maximumAnchors: 4,
    anchorRadiusTiles: 3,
    activity: Object.freeze({
      kind: "schooling-glint",
      activePeriod: "tide-responsive",
      baselineProjection: "preserve",
      perceivedPressureResponse: "preserve",
    }),
    initialEvidenceKinds: Object.freeze(["surface-dimple"] as const),
    disturbanceEvidence: Object.freeze({
      defaultKind: "surface-dimple",
      byCause: Object.freeze({}),
    }),
    exposedFoodAttraction: false,
    rainSensitive: false,
    rainResponse: "pressure",
    tideResponse: "flood-active",
  }),
  "atlantic-ghost-crab": Object.freeze({
    species: "atlantic-ghost-crab",
    stableIdPrefix: "GHOSTCRAB-AREA-v1-",
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
    disturbanceEvidence: Object.freeze({
      defaultKind: "burrow-opening",
      byCause: Object.freeze({ "tide-pressure": "feeding-scrape" }),
    }),
    exposedFoodAttraction: false,
    rainSensitive: false,
    rainResponse: "pressure",
    tideResponse: "ebb-active",
  }),
  "atlantic-menhaden": Object.freeze({
    species: "atlantic-menhaden",
    stableIdPrefix: "MENHADEN-SCHOOL-v1-",
    representation: "group-actor",
    maximumAnchors: 4,
    anchorRadiusTiles: 4,
    activity: Object.freeze({
      kind: "schooling-glint",
      activePeriod: "tide-responsive",
      baselineProjection: "preserve",
      perceivedPressureResponse: "preserve",
    }),
    initialEvidenceKinds: Object.freeze(["surface-dimple"] as const),
    disturbanceEvidence: Object.freeze({
      defaultKind: "surface-dimple",
      byCause: Object.freeze({}),
    }),
    exposedFoodAttraction: false,
    rainSensitive: false,
    rainResponse: "pressure",
    tideResponse: "flood-active",
  }),
  mummichog: Object.freeze({
    species: "mummichog",
    stableIdPrefix: "MUMMICHOG-SCHOOL-v1-",
    representation: "group-actor",
    maximumAnchors: 4,
    anchorRadiusTiles: 3,
    activity: Object.freeze({
      kind: "schooling-glint",
      activePeriod: "tide-responsive",
      baselineProjection: "preserve",
      perceivedPressureResponse: "preserve",
    }),
    initialEvidenceKinds: Object.freeze(["surface-dimple"] as const),
    disturbanceEvidence: Object.freeze({
      defaultKind: "surface-dimple",
      byCause: Object.freeze({}),
    }),
    exposedFoodAttraction: false,
    rainSensitive: false,
    rainResponse: "pressure",
    tideResponse: "flood-active",
  }),
  "grass-shrimp": Object.freeze({
    species: "grass-shrimp",
    stableIdPrefix: "GRASSSHRIMP-AREA-v1-",
    representation: "aggregate-area",
    maximumAnchors: 4,
    anchorRadiusTiles: 2,
    activity: Object.freeze({
      kind: "schooling-glint",
      activePeriod: "tide-responsive",
      baselineProjection: "preserve",
      perceivedPressureResponse: "quiet",
    }),
    initialEvidenceKinds: Object.freeze(["surface-dimple"] as const),
    disturbanceEvidence: Object.freeze({
      defaultKind: "surface-dimple",
      byCause: Object.freeze({}),
    }),
    exposedFoodAttraction: false,
    rainSensitive: false,
    rainResponse: "pressure",
    tideResponse: "flood-active",
  }),
  "blue-crab": Object.freeze({
    species: "blue-crab",
    stableIdPrefix: "BLUECRAB-AREA-v1-",
    representation: "aggregate-area",
    maximumAnchors: 4,
    anchorRadiusTiles: 2,
    activity: Object.freeze({
      kind: "burrow-foraging",
      activePeriod: "tide-responsive",
      baselineProjection: "preserve",
      perceivedPressureResponse: "quiet",
    }),
    initialEvidenceKinds: Object.freeze([
      "burrow-opening",
      "feeding-scrape",
    ] as const),
    disturbanceEvidence: Object.freeze({
      defaultKind: "burrow-opening",
      byCause: Object.freeze({ "tide-pressure": "feeding-scrape" }),
    }),
    exposedFoodAttraction: false,
    rainSensitive: false,
    rainResponse: "pressure",
    tideResponse: "ebb-active",
  }),
  "eastern-saltmarsh-mosquito": Object.freeze({
    species: "eastern-saltmarsh-mosquito",
    stableIdPrefix: "MOSQUITO-AREA-v1-",
    representation: "aggregate-area",
    maximumAnchors: 2,
    anchorRadiusTiles: 3,
    activity: Object.freeze({
      kind: "swarming",
      activePeriod: "diurnal",
      baselineProjection: "preserve",
      perceivedPressureResponse: "quiet",
    }),
    initialEvidenceKinds: Object.freeze(["swarm-haze"] as const),
    disturbanceEvidence: Object.freeze({
      defaultKind: "swarm-haze",
      byCause: Object.freeze({ "weather-pressure": "swarm-haze" }),
    }),
    exposedFoodAttraction: false,
    rainSensitive: true,
    rainResponse: "pressure",
    tideResponse: "neutral",
  }),
  "marsh-periwinkle": Object.freeze({
    species: "marsh-periwinkle",
    stableIdPrefix: "PERIWINKLE-AREA-v1-",
    representation: "aggregate-area",
    maximumAnchors: 2,
    anchorRadiusTiles: 2,
    activity: Object.freeze({
      kind: "surface-crawling",
      activePeriod: "tide-responsive",
      baselineProjection: "preserve",
      perceivedPressureResponse: "quiet",
    }),
    initialEvidenceKinds: Object.freeze(["grazing-trace", "shell-cluster"] as const),
    disturbanceEvidence: Object.freeze({
      defaultKind: "shell-cluster",
      byCause: Object.freeze({ "tide-pressure": "grazing-trace" }),
    }),
    exposedFoodAttraction: false,
    rainSensitive: false,
    rainResponse: "pressure",
    tideResponse: "ebb-active",
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

export function coreEcologyAggregateDisturbanceEvidenceKind(
  species: CoreEcologyAggregateSpecies,
  cause: CoreEcologyAggregatePolicyDisturbanceCause,
): CoreEcologyAggregatePolicyEvidenceKind {
  const evidence = POLICIES[species].disturbanceEvidence;
  return evidence.byCause[cause] ?? evidence.defaultKind;
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

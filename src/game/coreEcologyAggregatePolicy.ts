import { FIXED_POINT } from "../sim/types";
import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";

export const CORE_ECOLOGY_AGGREGATE_SPECIES = Object.freeze([
  "brown-rat",
  "southern-leopard-frog",
] as const);

export type CoreEcologyAggregateSpecies =
  (typeof CORE_ECOLOGY_AGGREGATE_SPECIES)[number];

export type CoreEcologyAggregateActivityKind =
  | "rain-chorus"
  | "rustle-scratch";

export type CoreEcologyAggregateActivePeriod =
  | "nocturnal"
  | "rain-responsive";

export type CoreEcologyAggregatePolicyEvidenceKind =
  | "frog-track"
  | "gnaw-mark"
  | "shelter-sign"
  | "tracks";

export type CoreEcologyAggregatePolicyVisualSourceKind =
  | "cat"
  | "dog"
  | "fish-crow"
  | "gull"
  | "human"
  | "northern-harrier";

const AGGREGATE_VISUAL_SOURCE_BY_SPECIES: Readonly<
  Partial<Record<CoreWildlifeSpecies, CoreEcologyAggregatePolicyVisualSourceKind>>
> = Object.freeze({
  "domestic-cat": "cat",
  gull: "gull",
  "fish-crow": "fish-crow",
  "northern-harrier": "northern-harrier",
});

export interface CoreEcologyAggregateSpeciesPolicy {
  readonly species: CoreEcologyAggregateSpecies;
  /** Prefix only. The digest payload remains frozen for existing rat IDs. */
  readonly stableIdPrefix: "FROG-AREA-v1-" | "RAT-AREA-v1-";
  readonly maximumAnchors: number;
  readonly anchorRadiusTiles: number;
  readonly activity: Readonly<{
    readonly kind: CoreEcologyAggregateActivityKind;
    readonly activePeriod: CoreEcologyAggregateActivePeriod;
  }>;
  readonly initialEvidenceKinds: readonly CoreEcologyAggregatePolicyEvidenceKind[];
  readonly visualPressureSourceKinds:
    readonly CoreEcologyAggregatePolicyVisualSourceKind[];
  readonly exposedFoodAttraction: boolean;
  readonly rainResponse: "attraction" | "pressure";
}

const POLICIES: Readonly<
  Record<CoreEcologyAggregateSpecies, CoreEcologyAggregateSpeciesPolicy>
> = Object.freeze({
  "brown-rat": Object.freeze({
    species: "brown-rat",
    stableIdPrefix: "RAT-AREA-v1-",
    maximumAnchors: 4,
    anchorRadiusTiles: 2,
    activity: Object.freeze({
      kind: "rustle-scratch",
      activePeriod: "nocturnal",
    }),
    initialEvidenceKinds: Object.freeze([
      "gnaw-mark",
      "tracks",
      "shelter-sign",
    ] as const),
    visualPressureSourceKinds: Object.freeze([
      "cat",
      "dog",
      "human",
      "gull",
    ] as const),
    exposedFoodAttraction: true,
    rainResponse: "pressure",
  }),
  "southern-leopard-frog": Object.freeze({
    species: "southern-leopard-frog",
    stableIdPrefix: "FROG-AREA-v1-",
    maximumAnchors: 3,
    anchorRadiusTiles: 3,
    activity: Object.freeze({
      kind: "rain-chorus",
      activePeriod: "rain-responsive",
    }),
    initialEvidenceKinds: Object.freeze(["frog-track"] as const),
    visualPressureSourceKinds: Object.freeze([
      "cat",
      "dog",
      "human",
      "gull",
      "fish-crow",
      "northern-harrier",
    ] as const),
    exposedFoodAttraction: false,
    rainResponse: "attraction",
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

/**
 * Maps an individually simulated species into the shared aggregate sensory
 * vocabulary. Species without a declared aggregate interaction remain absent
 * instead of acquiring pressure through a runtime fallback.
 */
export function coreEcologyAggregateVisualSourceKind(
  species: CoreWildlifeSpecies,
): CoreEcologyAggregatePolicyVisualSourceKind | null {
  return AGGREGATE_VISUAL_SOURCE_BY_SPECIES[species] ?? null;
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
    | "weather-pressure",
  pressure: number,
): number {
  if (!fixedPoint(currentIntensity) || !fixedPoint(pressure)) {
    throw new RangeError("Aggregate disturbance activity must use fixed-point 0..1 values");
  }
  if (species === "brown-rat" || causeKind === "weather-pressure") {
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

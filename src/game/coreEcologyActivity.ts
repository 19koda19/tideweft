import type { ObservedArea } from "../sim/actorPerception";
import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import { tideAtTick } from "../sim/terrain";
import { hashCanonical } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_STEP_TICKS,
  canonicalizeCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationMemberState,
  type CoreEcologyPopulationState,
} from "./coreEcology";
import {
  CORE_ECOLOGY_AMERICAN_BLACK_DUCK_MINIMUM_DABBLING_DEPTH,
  CORE_ECOLOGY_SNOWY_EGRET_MAXIMUM_WADING_DEPTH,
  CORE_ECOLOGY_SNOWY_EGRET_MINIMUM_WADING_DEPTH,
  type CoreEcologyHabitatAllocation,
  type CoreEcologyTidalWebHabitatAnchor,
} from "./coreEcologyHabitat";
import type { CoreEcologySnowyEgretTidalTarget } from "./coreEcologyTidalTable";
import {
  isTrustedCoreEcologyActivityAuthority,
  type CoreEcologyActivityAuthorityV1,
} from "./coreEcologyActivityAuthority";
import {
  coreEcologySpeciesRuntimePolicy,
  CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES,
  type CoreEcologySpeciesRuntimePolicy,
} from "./coreEcologySpeciesRuntimePolicy";
import {
  CORE_ECOLOGY_ACTIVITY_AFFORDANCE_PROFILES,
  CORE_ECOLOGY_ACTIVITY_AFFORDANCE_SPECIES,
  coreEcologyActivityAffordanceProfile,
  validateCoreEcologyActivityAffordances,
  type CoreEcologyActivityAffordanceProfile,
  type CoreEcologyActivityAffordanceSpecies,
  type CoreEcologyActivityDestinationSemantic,
  type CoreEcologyActivityPresentationSignal,
} from "./coreEcologyActivityAffordance";
import {
  repositionCoreWildlifeActor,
  type CoreWildlifeActorState,
  type CoreWildlifeIntentKind,
} from "./coreWildlifeActor";
import type { CoreWildlifeTravelMedium } from "./coreWildlifeLocomotionProfile";
import { headingFromRadians } from "./livingActor";
import {
  resolveLivingActorLocomotion,
  type LivingActorTraversabilitySurface,
} from "./livingActorLocomotion";
import {
  REGION_HEIGHT_UNITS,
  REGION_WIDTH_UNITS,
  WORLD_POSITION_UNITS_PER_TILE,
  translateWorldPosition,
  worldPositionDelta,
  type WorldPosition,
} from "./worldPosition";

export const CORE_ECOLOGY_ACTIVITY_VERSION = 1 as const;
export const CORE_ECOLOGY_ACTIVITY_OWNER_ID = "game:core-ecology-activity:v1" as const;

/** The simulation's existing day convention: 1,440 ticks, with daylight 360..<1,200. */
export const CORE_ECOLOGY_DAY_LENGTH_TICKS = 1_440 as const;
export const CORE_ECOLOGY_DAYLIGHT_START_TICK = 360 as const;
export const CORE_ECOLOGY_DAYLIGHT_END_TICK = 1_200 as const;

/** Activity targets remain stable for four ticks to avoid one-frame flight jitter. */
export const CORE_ECOLOGY_ACTIVITY_CADENCE_TICKS = 4 as const;
export const CORE_ECOLOGY_ACTIVITY_SPECIES =
  CORE_ECOLOGY_ACTIVITY_AFFORDANCE_SPECIES;

export type CoreEcologyActivitySpecies = CoreEcologyActivityAffordanceSpecies;
export type CoreEcologyBoundedDayPhase = "daylight" | "rest-window";
export type CoreEcologyActivityState =
  | "active-watch"
  | "aquatic-foraging"
  | "dabbling"
  | "floating"
  | "hauling-out"
  | "low-quartering"
  | "perched"
  | "responding"
  | "resting"
  | "shore-resting"
  | "seeking-habitat-anchor"
  | "seeking-perch"
  | "seeking-tidal-refuge"
  | "seeking-dabbling-water"
  | "seeking-foraging-water"
  | "seeking-surface-opportunity"
  | "seeking-wading-ground"
  | "surface-circling"
  | "surface-diving"
  | "waiting-on-tide"
  | "water-scan"
  | "wading-scan"
  | "wading-search";

export interface CoreEcologyDayPhaseProjection {
  readonly dayTick: number;
  readonly phase: CoreEcologyBoundedDayPhase;
}

export type CoreEcologyActivityMotion =
  | Readonly<{ readonly kind: "defer-to-intent" }>
  | Readonly<{ readonly kind: "hold-position" }>
  | Readonly<{
      readonly kind: "target-area";
      readonly verb:
        | "quarter"
        | "seek-habitat-anchor"
        | "seek-perch"
        | "seek-surface-opportunity"
        | "seek-tidal-refuge"
        | "seek-wading-ground";
      readonly targetArea: ObservedArea;
    }>
  | Readonly<{
      readonly kind: "target-area";
      readonly verb:
        | "seek-dabbling-water"
        | "seek-otter-foraging-water"
        | "seek-otter-haulout"
        | "seek-waterfowl-refuge";
      readonly targetArea: ObservedArea;
      readonly travelMedium: CoreWildlifeTravelMedium;
    }>;

export interface CoreEcologyActivityProjection {
  readonly version: typeof CORE_ECOLOGY_ACTIVITY_VERSION;
  readonly ownerId: typeof CORE_ECOLOGY_ACTIVITY_OWNER_ID;
  /** This is deliberately narrower than the later universal circadian system. */
  readonly scheduleScope: "bounded-diurnal-window";
  readonly actorId: string;
  readonly species: CoreEcologyActivitySpecies;
  readonly atTick: number;
  readonly dayTick: number;
  readonly dayPhase: CoreEcologyBoundedDayPhase;
  readonly state: CoreEcologyActivityState;
  /** Immediate threat, food, alarm, and pursuit intents always outrank neutral activity. */
  readonly responsiveToImmediateIntent: boolean;
  /** Exact current anonymous observation authorizing surface response; null means no cue. */
  readonly sourceObservationId: string | null;
  readonly preferredNeutralIntent: Extract<CoreWildlifeIntentKind, "observe" | "rest"> | null;
  readonly presentationSignal: CoreEcologyActivityPresentationSignal | null;
  readonly perch: Readonly<{
    readonly availability: "not-applicable" | "available-at-anchor" | "available-here";
    readonly anchor: WorldPosition | null;
  }>;
  readonly motion: CoreEcologyActivityMotion;
}

export interface ProjectCoreEcologyActivityInput {
  readonly actorId: string;
  readonly atTick: number;
}

export interface StepCoreEcologyActivityMotionInput extends ProjectCoreEcologyActivityInput {
  readonly maximumStepUnits: number;
  /** Required when the projected target selects any explicit physical surface. */
  readonly surface?: LivingActorTraversabilitySurface;
}

export interface CoreEcologyActivityMotionStep {
  readonly patch: CoreEcologyAggregatePatchState;
  readonly projection: CoreEcologyActivityProjection;
  readonly resolution: "arrived" | "blocked" | "deferred" | "held" | "moved";
}

const ACTIVITY_SPECIES = new Set<CoreWildlifeSpecies>(CORE_ECOLOGY_ACTIVITY_SPECIES);
const IMMEDIATE_RESPONSE_INTENTS = new Set<CoreWildlifeIntentKind>([
  "alarm",
  "disengage",
  "flee",
  "forage",
  "guard",
  "pursue",
  "regroup",
  "retreat",
  "scavenge",
]);
const PERCH_ARRIVAL_RADIUS_UNITS = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
const HABITAT_ANCHOR_ARRIVAL_RADIUS_UNITS = Math.trunc(
  WORLD_POSITION_UNITS_PER_TILE / 2,
);
const QUARTERING_TARGET_RADIUS_UNITS = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
const SURFACE_OPPORTUNITY_ARRIVAL_RADIUS_UNITS = Math.trunc(
  WORLD_POSITION_UNITS_PER_TILE / 2,
);
const WADING_ARRIVAL_RADIUS_UNITS = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 3);
const DABBLING_ARRIVAL_RADIUS_UNITS = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 3);
const OTTER_ARRIVAL_RADIUS_UNITS = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 3);
const QUARTERING_OFFSETS = Object.freeze([
  Object.freeze({ x: -2_400, y: -1_100 }),
  Object.freeze({ x: -800, y: -2_200 }),
  Object.freeze({ x: 1_100, y: -1_600 }),
  Object.freeze({ x: 2_400, y: -500 }),
  Object.freeze({ x: 2_300, y: 1_000 }),
  Object.freeze({ x: 700, y: 2_100 }),
  Object.freeze({ x: -1_200, y: 1_500 }),
  Object.freeze({ x: -2_300, y: 500 }),
] as const);

/**
 * Projects the bounded daylight/rest window without claiming sleep, denning,
 * nocturnal routines, or a full circadian schedule.
 */
export function projectCoreEcologyDayPhase(
  atTick: unknown,
): CoreEcologyDayPhaseProjection | null {
  if (!nonnegativeSafeInteger(atTick)) return null;
  const dayTick = atTick % CORE_ECOLOGY_DAY_LENGTH_TICKS;
  return Object.freeze({
    dayTick,
    phase: dayTick >= CORE_ECOLOGY_DAYLIGHT_START_TICK
      && dayTick < CORE_ECOLOGY_DAYLIGHT_END_TICK
      ? "daylight"
      : "rest-window",
  });
}

/**
 * Resolves the movement medium without a species branch. Legacy target-area
 * verbs predate multimodal activity and retain their exact aerial projection
 * bytes; new motions carry the explicit choice on the motion itself.
 */
export function coreEcologyActivityTravelMedium(
  motion: CoreEcologyActivityMotion,
): CoreWildlifeTravelMedium | null {
  if (motion.kind !== "target-area") return null;
  return "travelMedium" in motion ? motion.travelMedium : "air";
}

/**
 * Maps an executable motion verb to the affordance it must have declared.
 * This is deliberately exhaustive: adding a new motion cannot silently bypass
 * destination-authority validation.
 */
export function coreEcologyActivityDestinationSemantic(
  motion: CoreEcologyActivityMotion,
): CoreEcologyActivityDestinationSemantic | null {
  if (motion.kind !== "target-area") return null;
  const verb = motion.verb;
  switch (verb) {
    case "quarter": return "deterministic-local-quartering-area";
    case "seek-habitat-anchor": return "authenticated-habitat-anchor";
    case "seek-perch": return "authenticated-habitat-perch";
    case "seek-surface-opportunity": return "observed-surface-opportunity";
    case "seek-tidal-refuge":
    case "seek-waterfowl-refuge":
      return "authenticated-tidal-refuge";
    case "seek-wading-ground":
      return "authenticated-depth-safe-wading-ground";
    case "seek-dabbling-water":
      return "authenticated-depth-safe-dabbling-water";
    case "seek-otter-foraging-water":
      return "authenticated-foraging-water";
    case "seek-otter-haulout":
      return "authenticated-dry-haulout";
  }
  const exhaustiveVerb: never = verb;
  return exhaustiveVerb;
}

/**
 * Runtime affordance firewall for one already-built projection. The registry
 * is authoritative not only for assignment, but for every signal, movement
 * medium, destination meaning, perch claim, and private observation reference
 * that escapes the activity owner.
 */
export function validateCoreEcologyActivityProjectionAffordance(
  profile: CoreEcologyActivityAffordanceProfile,
  actor: CoreWildlifeActorState,
  projection: CoreEcologyActivityProjection,
): readonly string[] {
  const errors: string[] = [];
  if (
    actor.identity.stableId !== projection.actorId
    || actor.identity.species !== projection.species
    || profile.speciesId !== projection.species
  ) errors.push("projection-actor-profile-mismatch");

  if (
    projection.presentationSignal !== null
    && !profile.presentationSignals.includes(projection.presentationSignal)
  ) errors.push("undeclared-presentation-signal");

  const perchDestination = profile.destinations.find(({ semantic }) => (
    semantic === "authenticated-habitat-perch"
  ));
  if (perchDestination === undefined) {
    if (
      projection.perch.availability !== "not-applicable"
      || projection.perch.anchor !== null
    ) errors.push("undeclared-perch-projection");
  } else if (
    projection.perch.availability === "not-applicable"
    || projection.perch.anchor === null
  ) errors.push("missing-perch-projection");

  const destinationSemantic = coreEcologyActivityDestinationSemantic(projection.motion);
  const travelMedium = coreEcologyActivityTravelMedium(projection.motion);
  const destination = destinationSemantic === null
    ? undefined
    : profile.destinations.find(({ semantic }) => semantic === destinationSemantic);
  if (destinationSemantic !== null && destination === undefined) {
    errors.push("undeclared-destination-semantic");
  }
  if (
    travelMedium !== null
    && !profile.allowedTravelMedia.includes(travelMedium)
  ) errors.push("undeclared-travel-medium");
  if (
    travelMedium !== null
    && destination !== undefined
    && !destination.allowedTravelMedia.includes(travelMedium)
  ) errors.push("destination-rejects-travel-medium");

  const sourceObservation = projection.sourceObservationId === null
    ? null
    : currentAquaticActivityObservation(
        actor,
        projection.atTick,
        projection.sourceObservationId,
      );
  if (projection.sourceObservationId !== null) {
    if (profile.observationAffordance.kind !== "current-anonymous-area") {
      errors.push("undeclared-observation-source");
    }
    if (sourceObservation === null) errors.push("invalid-or-stale-observation-source");
  }
  if (destination?.authority === "current-lawful-observation") {
    if (sourceObservation === null) {
      errors.push("observed-destination-without-current-source");
    } else if (
      projection.motion.kind !== "target-area"
      || !sameWorldPosition(
        projection.motion.targetArea.center,
        sourceObservation.area.center,
      )
    ) errors.push("observed-destination-source-mismatch");
  }

  return Object.freeze([...new Set(errors)].sort(compareText));
}

/**
 * Resolves an actionable bounded activity projection for a materialized actor.
 * Versioned habitat custody or a current anonymous line-of-sight observation
 * proves every destination; arbitrary caller positions cannot mint one.
 */
export function projectCoreEcologyActivity(
  patchValue: unknown,
  input: ProjectCoreEcologyActivityInput,
  authority?: CoreEcologyActivityAuthorityV1,
): CoreEcologyActivityProjection | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(patchValue);
  return patch === null
    ? null
    : projectCanonicalCoreEcologyActivity(patch, input, authority);
}

/**
 * Reports whether a canonical patch carries its activity destinations inline.
 * Sparse regional and legacy-cohort owners instead provide a transient,
 * root-authenticated authority receipt to the projection and movement calls.
 */
export function coreEcologyPatchHasBoundedActivityAuthority(
  patchValue: unknown,
): boolean {
  const patch = canonicalizeCoreEcologyAggregatePatch(patchValue);
  return patch !== null && isActivityHabitatDerivation(patch);
}

/**
 * Executes one authenticated schedule-owned movement as a transaction. Legacy
 * aerial motion retains its direct bounded step, while every explicit physical
 * surface medium goes through the shared traversability/path resolver. A
 * malformed or unrepresentable target fails closed and never becomes a neutral
 * chase target.
 */
export function stepCoreEcologyActivityMotion(
  patchValue: unknown,
  input: StepCoreEcologyActivityMotionInput,
  authority?: CoreEcologyActivityAuthorityV1,
): CoreEcologyActivityMotionStep | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(patchValue);
  const ordinaryKeys = ["actorId", "atTick", "maximumStepUnits"] as const;
  const withSurfaceKeys = [...ordinaryKeys, "surface"] as const;
  if (
    patch === null
    || !plainRecord(input)
    || (!exactKeys(input, ordinaryKeys) && !exactKeys(input, withSurfaceKeys))
    || typeof input.actorId !== "string"
    || input.actorId.length === 0
    || input.actorId.length > 256
    || !nonnegativeSafeInteger(input.atTick)
    || !positiveSafeInteger(input.maximumStepUnits)
  ) return null;
  const projection = projectCanonicalCoreEcologyActivity(patch, {
    actorId: input.actorId,
    atTick: input.atTick,
  }, authority);
  if (projection === null) return null;
  if (projection.motion.kind === "defer-to-intent") {
    return activityMotionStep(patch, projection, "deferred");
  }
  if (projection.motion.kind === "hold-position") {
    return activityMotionStep(patch, projection, "held");
  }

  const owned = findMaterializedActor(patch, input.actorId);
  if (owned === null) return null;
  const travelMedium = coreEcologyActivityTravelMedium(projection.motion);
  if (travelMedium !== null && travelMedium !== "air") {
    if (input.surface === undefined) return null;
    const resolution = resolveLivingActorLocomotion({
      requestId: `ecology-activity:${hashCanonical({
        actorId: input.actorId,
        atTick: input.atTick,
        targetArea: projection.motion.targetArea,
        travelMedium,
      })}`,
      tick: input.atTick,
      actor: owned.member.actor.address,
      targetArea: projection.motion.targetArea,
      maximumStepUnits: input.maximumStepUnits,
      surface: input.surface,
    });
    if (resolution.kind === "no-move") {
      return resolution.reason === "already-within-observed-area"
        ? activityMotionStep(patch, projection, "arrived")
        : activityMotionStep(patch, projection, "blocked");
    }
    try {
      const moved = repositionCoreWildlifeActor(owned.member.actor, {
        atTick: input.atTick,
        position: resolution.actor.position,
        heading: resolution.actor.heading,
      });
      return activityMotionStep(
        replaceCoreEcologyAggregatePatchActor(patch, moved),
        projection,
        "moved",
      );
    } catch {
      return null;
    }
  }
  let delta: Readonly<{ x: number; y: number }>;
  try {
    delta = worldPositionDelta(
      owned.member.actor.address.position,
      projection.motion.targetArea.center,
    );
  } catch {
    return null;
  }
  const magnitude = Math.hypot(delta.x, delta.y);
  if (!Number.isFinite(magnitude)) return null;
  if (magnitude <= projection.motion.targetArea.radiusUnits) {
    return activityMotionStep(patch, projection, "arrived");
  }
  const distance = Math.min(input.maximumStepUnits, magnitude);
  const moveX = Math.round(delta.x / magnitude * distance);
  const moveY = Math.round(delta.y / magnitude * distance);
  if (moveX === 0 && moveY === 0) return null;
  try {
    const moved = repositionCoreWildlifeActor(owned.member.actor, {
      atTick: input.atTick,
      position: translateWorldPosition(
        owned.member.actor.address.position,
        moveX,
        moveY,
      ),
      heading: headingFromRadians(Math.atan2(moveY, moveX)),
    });
    return activityMotionStep(
      replaceCoreEcologyAggregatePatchActor(patch, moved),
      projection,
      "moved",
    );
  } catch {
    return null;
  }
}

function projectCanonicalCoreEcologyActivity(
  patch: CoreEcologyAggregatePatchState,
  input: ProjectCoreEcologyActivityInput,
  suppliedAuthority?: CoreEcologyActivityAuthorityV1,
): CoreEcologyActivityProjection | null {
  if (
    !plainRecord(input)
    || !exactKeys(input, ["actorId", "atTick"])
    || typeof input.actorId !== "string"
    || input.actorId.length === 0
    || input.actorId.length > 256
    || !nonnegativeSafeInteger(input.atTick)
    || input.atTick < patch.updatedAtTick
    || input.atTick - patch.updatedAtTick > CORE_ECOLOGY_MAX_STEP_TICKS
  ) return null;
  const day = projectCoreEcologyDayPhase(input.atTick);
  const owned = findMaterializedActor(patch, input.actorId);
  if (day === null || owned === null) return null;
  const policy = coreEcologySpeciesRuntimePolicy(owned.species);
  const activityProfile = coreEcologyActivityAffordanceProfile(owned.species);
  if (activityProfile === null || !runtimePolicyOwnsActivity(policy, activityProfile)) {
    return null;
  }
  const authority = authenticatedActivityDestinations(
    patch,
    owned.population,
    owned.member,
    suppliedAuthority,
  );
  if (authority === null) return null;

  const responsive = IMMEDIATE_RESPONSE_INTENTS.has(owned.member.actor.intent.kind);
  if (responsive) {
    return activityProjection(owned, input.atTick, day, {
      state: "responding",
      responsiveToImmediateIntent: true,
      preferredNeutralIntent: null,
      presentationSignal: null,
      perch: profileUsesHabitatPerch(activityProfile)
        ? perchProjection(authority.homeAnchor, owned.member.actor.address.position)
        : noPerchProjection(),
      motion: Object.freeze({ kind: "defer-to-intent" }),
    });
  }

  const actorNeedsRest = owned.member.actor.intent.kind === "rest";
  const inRestWindow = day.phase === "rest-window";
  if (activityProfile.archetypeId === "perch-watch") {
    const perch = perchProjection(authority.homeAnchor, owned.member.actor.address.position);
    if (inRestWindow || actorNeedsRest) {
      const atPerch = perch.availability === "available-here";
      return activityProjection(owned, input.atTick, day, {
        state: atPerch ? "perched" : "seeking-perch",
        responsiveToImmediateIntent: false,
        // A physiological rest may continue briefly into daylight, but only
        // the actual rest window may request another schedule-owned rest.
        preferredNeutralIntent: inRestWindow && atPerch ? "rest" : "observe",
        presentationSignal: atPerch ? "perched" : null,
        perch,
        motion: atPerch
          ? Object.freeze({ kind: "hold-position" })
          : Object.freeze({
              kind: "target-area",
              verb: "seek-perch",
              targetArea: frozenArea(authority.homeAnchor, PERCH_ARRIVAL_RADIUS_UNITS),
            }),
      });
    }
    return activityProjection(owned, input.atTick, day, {
      state: "active-watch",
      responsiveToImmediateIntent: false,
      preferredNeutralIntent: "observe",
      presentationSignal: null,
      perch,
      motion: Object.freeze({ kind: "defer-to-intent" }),
    });
  }

  if (activityProfile.archetypeId === "dabbling-waterfowl") {
    const waterfowl = projectDabblingWaterfowlTidalActivity(
      input.atTick,
      input.actorId,
      activityProfile.speciesId,
      authority.tidalAnchors,
    );
    if (waterfowl === null) return null;
    const atRefuge = withinWorldRadius(
      owned.member.actor.address.position,
      waterfowl.refugeTarget.targetPosition,
      DABBLING_ARRIVAL_RADIUS_UNITS,
    );
    if (inRestWindow || actorNeedsRest) {
      return activityProjection(owned, input.atTick, day, {
        state: atRefuge ? "resting" : "seeking-tidal-refuge",
        responsiveToImmediateIntent: false,
        preferredNeutralIntent: inRestWindow && atRefuge ? "rest" : "observe",
        presentationSignal: atRefuge ? "resting" : "tidal-relocation-flight",
        perch: noPerchProjection(),
        motion: atRefuge
          ? Object.freeze({ kind: "hold-position" })
          : Object.freeze({
              kind: "target-area",
              verb: "seek-waterfowl-refuge",
              targetArea: frozenArea(
                waterfowl.refugeTarget.targetPosition,
                DABBLING_ARRIVAL_RADIUS_UNITS,
              ),
              travelMedium: "air",
            }),
      });
    }
    if (waterfowl.dabblingTargets.length === 0) {
      return activityProjection(owned, input.atTick, day, {
        state: atRefuge ? "waiting-on-tide" : "seeking-tidal-refuge",
        responsiveToImmediateIntent: false,
        preferredNeutralIntent: "observe",
        presentationSignal: atRefuge ? null : "tidal-relocation-flight",
        perch: noPerchProjection(),
        motion: atRefuge
          ? Object.freeze({ kind: "hold-position" })
          : Object.freeze({
              kind: "target-area",
              verb: "seek-waterfowl-refuge",
              targetArea: frozenArea(
                waterfowl.refugeTarget.targetPosition,
                DABBLING_ARRIVAL_RADIUS_UNITS,
              ),
              travelMedium: "air",
            }),
      });
    }
    const aquaticObservation = currentAquaticActivityObservation(
      owned.member.actor,
      input.atTick,
    );
    const observedTarget = aquaticObservation === null
      ? null
      : nearestDabblingTarget(
          aquaticObservation.area.center,
          waterfowl.dabblingTargets,
        );
    const currentTarget = waterfowl.dabblingTargets.find((target) => (
      withinWorldRadius(
        owned.member.actor.address.position,
        target.targetPosition,
        DABBLING_ARRIVAL_RADIUS_UNITS,
      )
    )) ?? null;
    const target = observedTarget
      ?? currentTarget
      ?? stableDabblingTarget(input.actorId, waterfowl.dabblingTargets);
    if (target === null) return null;
    const atDabblingWater = withinWorldRadius(
      owned.member.actor.address.position,
      target.targetPosition,
      DABBLING_ARRIVAL_RADIUS_UNITS,
    );
    if (atDabblingWater) {
      const dabbling = aquaticObservation !== null && observedTarget !== null;
      const scanning = !dabbling
        && Math.trunc(input.atTick / CORE_ECOLOGY_ACTIVITY_CADENCE_TICKS) % 2 === 1;
      return activityProjection(owned, input.atTick, day, {
        state: dabbling ? "dabbling" : scanning ? "water-scan" : "floating",
        responsiveToImmediateIntent: false,
        sourceObservationId: dabbling
          ? aquaticObservation.sourceObservationId
          : null,
        preferredNeutralIntent: "observe",
        presentationSignal: dabbling
          ? "dabbling-forage"
          : "surface-swimming",
        perch: noPerchProjection(),
        motion: Object.freeze({ kind: "hold-position" }),
      });
    }
    const travelMedium: CoreWildlifeTravelMedium = atRefuge
      ? "air"
      : "surface-water";
    return activityProjection(owned, input.atTick, day, {
      state: "seeking-dabbling-water",
      responsiveToImmediateIntent: false,
      sourceObservationId: aquaticObservation?.sourceObservationId ?? null,
      preferredNeutralIntent: "observe",
      presentationSignal: travelMedium === "air"
        ? "tidal-relocation-flight"
        : "surface-swimming",
      perch: noPerchProjection(),
      motion: Object.freeze({
        kind: "target-area",
        verb: "seek-dabbling-water",
        targetArea: frozenArea(target.targetPosition, DABBLING_ARRIVAL_RADIUS_UNITS),
        travelMedium,
      }),
    });
  }

  if (activityProfile.archetypeId === "shore-water-forager") {
    const tidalWeb = projectShoreWaterForagerActivity(
      input.actorId,
      activityProfile.speciesId,
      authority.tidalAnchors,
    );
    if (tidalWeb === null) return null;
    const atHaulout = withinWorldRadius(
      owned.member.actor.address.position,
      tidalWeb.hauloutTarget,
      OTTER_ARRIVAL_RADIUS_UNITS,
    );
    if (inRestWindow || actorNeedsRest) {
      return activityProjection(owned, input.atTick, day, {
        state: atHaulout ? "shore-resting" : "hauling-out",
        responsiveToImmediateIntent: false,
        preferredNeutralIntent: inRestWindow && atHaulout ? "rest" : "observe",
        presentationSignal: atHaulout ? "resting" : "shore-water-relocation",
        perch: noPerchProjection(),
        motion: atHaulout
          ? Object.freeze({ kind: "hold-position" })
          : Object.freeze({
              kind: "target-area",
              verb: "seek-otter-haulout",
              targetArea: frozenArea(tidalWeb.hauloutTarget, OTTER_ARRIVAL_RADIUS_UNITS),
              travelMedium: "amphibious",
            }),
      });
    }

    const aquaticObservation = currentAquaticActivityObservation(
      owned.member.actor,
      input.atTick,
    );
    const atForagingWater = withinWorldRadius(
      owned.member.actor.address.position,
      tidalWeb.foragingTarget,
      OTTER_ARRIVAL_RADIUS_UNITS,
    );
    if (!atForagingWater) {
      return activityProjection(owned, input.atTick, day, {
        state: "seeking-foraging-water",
        responsiveToImmediateIntent: false,
        sourceObservationId: aquaticObservation?.sourceObservationId ?? null,
        preferredNeutralIntent: "observe",
        presentationSignal: "shore-water-relocation",
        perch: noPerchProjection(),
        motion: Object.freeze({
          kind: "target-area",
          verb: "seek-otter-foraging-water",
          targetArea: frozenArea(tidalWeb.foragingTarget, OTTER_ARRIVAL_RADIUS_UNITS),
          travelMedium: "amphibious",
        }),
      });
    }
    const searching = Math.trunc(input.atTick / CORE_ECOLOGY_ACTIVITY_CADENCE_TICKS) % 2 === 1;
    return activityProjection(owned, input.atTick, day, {
      state: aquaticObservation !== null
        ? "aquatic-foraging"
        : searching ? "surface-diving" : "water-scan",
      responsiveToImmediateIntent: false,
      sourceObservationId: aquaticObservation?.sourceObservationId ?? null,
      preferredNeutralIntent: "observe",
      presentationSignal: aquaticObservation !== null
        ? "aquatic-foraging"
        : searching ? "surface-diving" : "surface-swimming",
      perch: noPerchProjection(),
      motion: Object.freeze({ kind: "hold-position" }),
    });
  }

  if (activityProfile.archetypeId === "tidal-wader") {
    const egret = projectSnowyEgretTidalActivity(
      input.atTick,
      input.actorId,
      authority.tidalAnchors,
    );
    if (egret === null) return null;
    if (inRestWindow || actorNeedsRest) {
      const atRefuge = withinWorldRadius(
        owned.member.actor.address.position,
        egret.refugeTarget.targetPosition,
        WADING_ARRIVAL_RADIUS_UNITS,
      );
      return activityProjection(owned, input.atTick, day, {
        state: atRefuge ? "resting" : "seeking-tidal-refuge",
        responsiveToImmediateIntent: false,
        preferredNeutralIntent: inRestWindow && atRefuge ? "rest" : "observe",
        presentationSignal: atRefuge ? "resting" : "tidal-relocation-flight",
        perch: noPerchProjection(),
        motion: atRefuge
          ? Object.freeze({ kind: "hold-position" })
          : Object.freeze({
              kind: "target-area",
              verb: "seek-tidal-refuge",
              targetArea: frozenArea(
                egret.refugeTarget.targetPosition,
                WADING_ARRIVAL_RADIUS_UNITS,
              ),
            }),
      });
    }
    if (egret.wadingTarget === null) {
      const atRefuge = withinWorldRadius(
        owned.member.actor.address.position,
        egret.refugeTarget.targetPosition,
        WADING_ARRIVAL_RADIUS_UNITS,
      );
      return activityProjection(owned, input.atTick, day, {
        state: atRefuge ? "waiting-on-tide" : "seeking-tidal-refuge",
        responsiveToImmediateIntent: false,
        preferredNeutralIntent: "observe",
        presentationSignal: atRefuge ? null : "tidal-relocation-flight",
        perch: noPerchProjection(),
        motion: atRefuge
          ? Object.freeze({ kind: "hold-position" })
          : Object.freeze({
              kind: "target-area",
              verb: "seek-tidal-refuge",
              targetArea: frozenArea(
                egret.refugeTarget.targetPosition,
                WADING_ARRIVAL_RADIUS_UNITS,
              ),
            }),
      });
    }
    const aquaticObservation = currentAquaticActivityObservation(
      owned.member.actor,
      input.atTick,
    );
    const observedTarget = aquaticObservation === null
      ? null
      : nearestWadingTarget(aquaticObservation.area.center, egret.wadingTargets);
    if (aquaticObservation === null || observedTarget === null) {
      const currentWadingTarget = egret.wadingTargets.find((target) => withinWorldRadius(
        owned.member.actor.address.position,
        target.targetPosition,
        WADING_ARRIVAL_RADIUS_UNITS,
      ));
      const atRefuge = withinWorldRadius(
        owned.member.actor.address.position,
        egret.refugeTarget.targetPosition,
        WADING_ARRIVAL_RADIUS_UNITS,
      );
      return activityProjection(owned, input.atTick, day, {
        state: currentWadingTarget !== undefined
          ? "wading-scan"
          : atRefuge ? "waiting-on-tide" : "seeking-tidal-refuge",
        responsiveToImmediateIntent: false,
        sourceObservationId: null,
        preferredNeutralIntent: "observe",
        presentationSignal: currentWadingTarget !== undefined
          ? "wading-scan"
          : atRefuge ? null : "tidal-relocation-flight",
        perch: noPerchProjection(),
        motion: currentWadingTarget !== undefined || atRefuge
          ? Object.freeze({ kind: "hold-position" })
          : Object.freeze({
              kind: "target-area",
              verb: "seek-tidal-refuge",
              targetArea: frozenArea(
                egret.refugeTarget.targetPosition,
                WADING_ARRIVAL_RADIUS_UNITS,
              ),
            }),
      });
    }
    const wadingTarget = observedTarget;
    const atWadingGround = withinWorldRadius(
      owned.member.actor.address.position,
      wadingTarget.targetPosition,
      WADING_ARRIVAL_RADIUS_UNITS,
    );
    return activityProjection(owned, input.atTick, day, {
      state: atWadingGround
        ? "wading-search"
        : "seeking-wading-ground",
      responsiveToImmediateIntent: false,
      sourceObservationId: aquaticObservation.sourceObservationId,
      preferredNeutralIntent: "observe",
      presentationSignal: atWadingGround
        ? "wading-search"
        : "tidal-relocation-flight",
      perch: noPerchProjection(),
      motion: atWadingGround
        ? Object.freeze({ kind: "hold-position" })
        : Object.freeze({
            kind: "target-area",
            verb: "seek-wading-ground",
            targetArea: frozenArea(
              wadingTarget.targetPosition,
              WADING_ARRIVAL_RADIUS_UNITS,
            ),
          }),
    });
  }

  if (activityProfile.archetypeId === "aerial-surface-opportunist") {
    const atHabitatAnchor = withinWorldRadius(
      owned.member.actor.address.position,
      authority.homeAnchor,
      HABITAT_ANCHOR_ARRIVAL_RADIUS_UNITS,
    );
    if (inRestWindow || actorNeedsRest) {
      return activityProjection(owned, input.atTick, day, {
        state: atHabitatAnchor ? "resting" : "seeking-habitat-anchor",
        responsiveToImmediateIntent: false,
        preferredNeutralIntent: inRestWindow && atHabitatAnchor ? "rest" : "observe",
        presentationSignal: atHabitatAnchor ? "resting" : "tidal-relocation-flight",
        perch: noPerchProjection(),
        motion: atHabitatAnchor
          ? Object.freeze({ kind: "hold-position" })
          : Object.freeze({
              kind: "target-area",
              verb: "seek-habitat-anchor",
              targetArea: frozenArea(
                authority.homeAnchor,
                HABITAT_ANCHOR_ARRIVAL_RADIUS_UNITS,
              ),
            }),
      });
    }
    const surfaceOpportunity = currentAquaticActivityObservation(
      owned.member.actor,
      input.atTick,
    );
    if (surfaceOpportunity === null) {
      return activityProjection(owned, input.atTick, day, {
        state: "active-watch",
        responsiveToImmediateIntent: false,
        preferredNeutralIntent: "observe",
        presentationSignal: null,
        perch: noPerchProjection(),
        motion: Object.freeze({ kind: "defer-to-intent" }),
      });
    }
    const atSurfaceOpportunity = withinWorldRadius(
      owned.member.actor.address.position,
      surfaceOpportunity.area.center,
      SURFACE_OPPORTUNITY_ARRIVAL_RADIUS_UNITS,
    );
    return activityProjection(owned, input.atTick, day, {
      state: atSurfaceOpportunity
        ? "surface-circling"
        : "seeking-surface-opportunity",
      responsiveToImmediateIntent: false,
      sourceObservationId: surfaceOpportunity.sourceObservationId,
      preferredNeutralIntent: "observe",
      presentationSignal: "surface-opportunity-flight",
      perch: noPerchProjection(),
      motion: atSurfaceOpportunity
        ? Object.freeze({ kind: "hold-position" })
        : Object.freeze({
            kind: "target-area",
            verb: "seek-surface-opportunity",
            targetArea: frozenArea(
              surfaceOpportunity.area.center,
              SURFACE_OPPORTUNITY_ARRIVAL_RADIUS_UNITS,
            ),
          }),
    });
  }

  if (activityProfile.archetypeId !== "low-quartering") return null;
  if (inRestWindow || actorNeedsRest) {
    return activityProjection(owned, input.atTick, day, {
      state: "resting",
      responsiveToImmediateIntent: false,
      preferredNeutralIntent: inRestWindow ? "rest" : "observe",
      presentationSignal: "resting",
      perch: noPerchProjection(),
      motion: Object.freeze({ kind: "hold-position" }),
    });
  }
  return activityProjection(owned, input.atTick, day, {
    state: "low-quartering",
    responsiveToImmediateIntent: false,
    preferredNeutralIntent: "observe",
    presentationSignal: "low-quartering-flight",
    perch: noPerchProjection(),
    motion: Object.freeze({
      kind: "target-area",
      verb: "quarter",
      targetArea: frozenArea(
        deterministicQuarteringTarget(
          authority.homeAnchor,
          owned.member.actor.identity.stableId,
          input.atTick,
        ),
        QUARTERING_TARGET_RADIUS_UNITS,
      ),
    }),
  });
}

function activityMotionStep(
  patch: CoreEcologyAggregatePatchState,
  projection: CoreEcologyActivityProjection,
  resolution: CoreEcologyActivityMotionStep["resolution"],
): CoreEcologyActivityMotionStep {
  return Object.freeze({ patch, projection, resolution });
}

/**
 * Build-gate diagnostics: every canonical diurnal capability must have a real
 * bounded projection owner. A future species cannot become "active" merely by
 * adding catalog metadata.
 */
export function validateCoreEcologyActivityPolicies(
  policies: readonly CoreEcologySpeciesRuntimePolicy[] =
    CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES,
): readonly string[] {
  return Object.freeze(validateCoreEcologyActivityAffordances(
    CORE_ECOLOGY_ACTIVITY_AFFORDANCE_PROFILES,
    policies,
  ).map((error) => (
    error.endsWith(":missing-runtime-policy")
      ? error.replace(":missing-runtime-policy", ":missing-policy")
      : error
  )));
}

export function assertCoreEcologyActivityPolicies(): void {
  const errors = validateCoreEcologyActivityPolicies();
  if (errors.length > 0) {
    throw new Error(`Core ecology activity policy is incoherent: ${errors.join(", ")}`);
  }
}

function activityProjection(
  owned: OwnedActivityActor,
  atTick: number,
  day: CoreEcologyDayPhaseProjection,
  activity: Pick<
    CoreEcologyActivityProjection,
    | "motion"
    | "perch"
    | "preferredNeutralIntent"
    | "presentationSignal"
    | "responsiveToImmediateIntent"
    | "state"
  > & Readonly<{ readonly sourceObservationId?: string | null }>,
): CoreEcologyActivityProjection | null {
  const profile = coreEcologyActivityAffordanceProfile(owned.species);
  if (profile === null) return null;
  const projection = deepFreeze({
    version: CORE_ECOLOGY_ACTIVITY_VERSION,
    ownerId: CORE_ECOLOGY_ACTIVITY_OWNER_ID,
    scheduleScope: "bounded-diurnal-window" as const,
    actorId: owned.member.actor.identity.stableId,
    species: owned.species,
    atTick,
    dayTick: day.dayTick,
    dayPhase: day.phase,
    ...activity,
    sourceObservationId: activity.sourceObservationId ?? null,
  });
  return validateCoreEcologyActivityProjectionAffordance(
    profile,
    owned.member.actor,
    projection,
  ).length === 0
    ? projection
    : null;
}

function currentAquaticActivityObservation(
  actor: OwnedActivityActor["member"]["actor"],
  atTick: number,
  sourceObservationId?: string,
) {
  return [...actor.perception.beliefs]
    .filter((belief) => (
      belief.channel === "vision"
      && belief.perceivedClass === "aquatic-activity"
      && belief.subjectId === null
      && belief.identification === "classified"
      && belief.area.radiusUnits === 0
      && belief.lastObservedTick === atTick
      && (
        sourceObservationId === undefined
        || belief.sourceObservationId === sourceObservationId
      )
    ))
    .sort((left, right) => (
      right.salience - left.salience
      || right.confidence - left.confidence
      || compareText(left.sourceObservationId, right.sourceObservationId)
    ))[0] ?? null;
}

function nearestWadingTarget(
  origin: WorldPosition,
  targets: readonly CoreEcologySnowyEgretTidalTarget[],
): CoreEcologySnowyEgretTidalTarget | null {
  return [...targets].sort((left, right) => {
    const leftDistance = worldDistanceSquared(origin, left.targetPosition);
    const rightDistance = worldDistanceSquared(origin, right.targetPosition);
    return leftDistance < rightDistance
      ? -1
      : leftDistance > rightDistance
        ? 1
        : left.targetAnchorOrdinal - right.targetAnchorOrdinal;
  })[0] ?? null;
}

interface CoreEcologyDabblingWaterfowlTidalTarget {
  readonly purpose: "dabbling" | "refuge";
  readonly targetAnchorOrdinal: number;
  readonly targetPosition: WorldPosition;
  readonly waterDepth: number;
}

interface CoreEcologyDabblingWaterfowlTidalActivity {
  readonly actorId: string;
  readonly dabblingTargets: readonly CoreEcologyDabblingWaterfowlTidalTarget[];
  readonly refugeTarget: CoreEcologyDabblingWaterfowlTidalTarget;
}

function projectSnowyEgretTidalActivity(
  atTick: number,
  actorId: string,
  anchors: readonly CoreEcologyTidalWebHabitatAnchor[],
): Readonly<{
  readonly actorId: string;
  readonly wadingTargets: readonly CoreEcologySnowyEgretTidalTarget[];
  readonly wadingTarget: CoreEcologySnowyEgretTidalTarget | null;
  readonly refugeTarget: CoreEcologySnowyEgretTidalTarget;
}> | null {
  const egretAnchors = anchors.filter(({ species }) => species === "snowy-egret");
  const wadingAnchors = egretAnchors.filter(({ purpose }) => purpose === "wading");
  const refugeAnchors = egretAnchors.filter(({ purpose }) => purpose === "refuge");
  if (wadingAnchors.length !== 4 || refugeAnchors.length !== 1) return null;
  const tide = tideAtTick(atTick);
  const refuge = refugeAnchors[0];
  if (refuge === undefined) return null;
  const refugeTarget: CoreEcologySnowyEgretTidalTarget = Object.freeze({
    purpose: "refuge",
    targetAnchorOrdinal: refuge.anchorOrdinal,
    targetPosition: refuge.position,
    waterDepth: Math.max(0, tide.level - refuge.elevation),
  });
  const wadingTargets = wadingAnchors
    .map((anchor): CoreEcologySnowyEgretTidalTarget => Object.freeze({
      purpose: "wading",
      targetAnchorOrdinal: anchor.anchorOrdinal,
      targetPosition: anchor.position,
      waterDepth: Math.max(0, tide.level - anchor.elevation),
    }))
    .filter(({ waterDepth }) => (
      waterDepth >= CORE_ECOLOGY_SNOWY_EGRET_MINIMUM_WADING_DEPTH
      && waterDepth <= CORE_ECOLOGY_SNOWY_EGRET_MAXIMUM_WADING_DEPTH
    ))
    .sort((left, right) => (
      Math.abs(left.waterDepth - 34_000) - Math.abs(right.waterDepth - 34_000)
      || left.targetAnchorOrdinal - right.targetAnchorOrdinal
    ));
  return Object.freeze({
    actorId,
    wadingTargets: Object.freeze(wadingTargets),
    wadingTarget: wadingTargets[0] ?? null,
    refugeTarget,
  });
}

function projectDabblingWaterfowlTidalActivity(
  atTick: number,
  actorId: string,
  speciesId: CoreEcologyActivitySpecies,
  anchors: readonly CoreEcologyTidalWebHabitatAnchor[],
): CoreEcologyDabblingWaterfowlTidalActivity | null {
  const speciesAnchors = anchors.filter(({ species }) => (
    species === speciesId
  ));
  const refugeAnchors = speciesAnchors.filter(({ purpose }) => purpose === "refuge");
  const dabblingAnchors = speciesAnchors.filter(({ purpose }) => purpose === "dabbling");
  if (refugeAnchors.length !== 1 || dabblingAnchors.length !== 2) return null;
  const tide = tideAtTick(atTick);
  const refuge = refugeAnchors[0];
  if (refuge === undefined) return null;
  const refugeTarget: CoreEcologyDabblingWaterfowlTidalTarget = Object.freeze({
    purpose: "refuge",
    targetAnchorOrdinal: refuge.anchorOrdinal,
    targetPosition: refuge.position,
    waterDepth: Math.max(0, tide.level - refuge.elevation),
  });
  const dabblingTargets = dabblingAnchors
    .map((anchor): CoreEcologyDabblingWaterfowlTidalTarget => Object.freeze({
      purpose: "dabbling",
      targetAnchorOrdinal: anchor.anchorOrdinal,
      targetPosition: anchor.position,
      waterDepth: Math.max(0, tide.level - anchor.elevation),
    }))
    .filter(({ waterDepth }) => (
      waterDepth >= CORE_ECOLOGY_AMERICAN_BLACK_DUCK_MINIMUM_DABBLING_DEPTH
    ))
    .sort((left, right) => (
      right.waterDepth - left.waterDepth
      || left.targetAnchorOrdinal - right.targetAnchorOrdinal
    ));
  return Object.freeze({
    actorId,
    dabblingTargets: Object.freeze(dabblingTargets),
    refugeTarget,
  });
}

function nearestDabblingTarget(
  origin: WorldPosition,
  targets: readonly CoreEcologyDabblingWaterfowlTidalTarget[],
): CoreEcologyDabblingWaterfowlTidalTarget | null {
  return [...targets].sort((left, right) => {
    const leftDistance = worldDistanceSquared(origin, left.targetPosition);
    const rightDistance = worldDistanceSquared(origin, right.targetPosition);
    return leftDistance < rightDistance
      ? -1
      : leftDistance > rightDistance
        ? 1
        : left.targetAnchorOrdinal - right.targetAnchorOrdinal;
  })[0] ?? null;
}

function stableDabblingTarget(
  actorId: string,
  targets: readonly CoreEcologyDabblingWaterfowlTidalTarget[],
): CoreEcologyDabblingWaterfowlTidalTarget | null {
  if (targets.length === 0) return null;
  const ordinal = Number.parseInt(
    hashCanonical([actorId, "dabbling-target-v1"]).slice(0, 8),
    16,
  ) % targets.length;
  return targets[ordinal] ?? null;
}

interface CoreEcologyShoreWaterForagerActivity {
  readonly actorId: string;
  readonly foragingTarget: WorldPosition;
  readonly hauloutTarget: WorldPosition;
}

function projectShoreWaterForagerActivity(
  actorId: string,
  speciesId: CoreEcologyActivitySpecies,
  anchors: readonly CoreEcologyTidalWebHabitatAnchor[],
): CoreEcologyShoreWaterForagerActivity | null {
  const speciesAnchors = anchors.filter(({ species }) => (
    species === speciesId
  ));
  const foraging = speciesAnchors.filter(({ purpose }) => purpose === "foraging");
  const haulout = speciesAnchors.filter(({ purpose }) => purpose === "haulout");
  if (foraging.length !== 1 || haulout.length !== 1) return null;
  const foragingTarget = foraging[0]?.position;
  const hauloutTarget = haulout[0]?.position;
  if (foragingTarget === undefined || hauloutTarget === undefined) return null;
  return Object.freeze({ actorId, foragingTarget, hauloutTarget });
}

function worldDistanceSquared(left: WorldPosition, right: WorldPosition): bigint {
  const deltaX = (BigInt(right.region.x) - BigInt(left.region.x))
    * BigInt(REGION_WIDTH_UNITS) + BigInt(right.localX - left.localX);
  const deltaY = (BigInt(right.region.y) - BigInt(left.region.y))
    * BigInt(REGION_HEIGHT_UNITS) + BigInt(right.localY - left.localY);
  return deltaX * deltaX + deltaY * deltaY;
}

interface OwnedActivityActor {
  readonly population: CoreEcologyPopulationState;
  readonly species: CoreEcologyActivitySpecies;
  readonly member: CoreEcologyPopulationMemberState;
}

function findMaterializedActor(
  patch: CoreEcologyAggregatePatchState,
  actorId: string,
): OwnedActivityActor | null {
  for (const population of patch.populations) {
    if (!isActivitySpecies(population.species)) continue;
    const member = population.members.find(({ actor }) =>
      actor.identity.stableId === actorId
    );
    if (member?.materialization === "materialized") {
      return Object.freeze({ population, species: population.species, member });
    }
  }
  return null;
}

interface AuthenticatedActivityDestinations {
  readonly homeAnchor: WorldPosition;
  readonly tidalAnchors: readonly CoreEcologyTidalWebHabitatAnchor[];
}

function authenticatedActivityDestinations(
  patch: CoreEcologyAggregatePatchState,
  population: CoreEcologyPopulationState,
  member: CoreEcologyPopulationMemberState,
  supplied: CoreEcologyActivityAuthorityV1 | undefined,
): AuthenticatedActivityDestinations | null {
  const embedded = authenticatedHabitatAllocation(patch, population, member);
  if (embedded !== null && isActivityHabitatDerivation(patch)) {
    const tidalAnchors = "tidalAnchors" in patch.derivation.habitat
      ? patch.derivation.habitat.tidalAnchors.filter(({ species }) => (
          species === population.species
        ))
      : [];
    return Object.freeze({
      homeAnchor: embedded.position,
      tidalAnchors: Object.freeze(tidalAnchors),
    });
  }
  if (
    supplied === undefined
    || !isTrustedCoreEcologyActivityAuthority(supplied)
    || supplied.sourceKey !== patch.patchKey
    || supplied.actorId !== member.actor.identity.stableId
    || supplied.species !== population.species
  ) return null;
  return Object.freeze({
    homeAnchor: supplied.homeAnchor,
    tidalAnchors: supplied.tidalAnchors,
  });
}

function authenticatedHabitatAllocation(
  patch: CoreEcologyAggregatePatchState,
  population: CoreEcologyPopulationState,
  member: CoreEcologyPopulationMemberState,
): CoreEcologyHabitatAllocation | null {
  if (!isActivityHabitatDerivation(patch)) return null;
  const analysis = patch.derivation.habitat.populations.find((candidate) => (
    candidate.species === population.species
    && candidate.populationKey === population.populationKey
    && candidate.representation === "individual-representatives"
  ));
  return analysis?.allocations.find(({ allocationOrdinal }) => (
    allocationOrdinal === member.populationOrdinal
  )) ?? null;
}

function isActivityHabitatDerivation(
  patch: CoreEcologyAggregatePatchState,
): patch is CoreEcologyAggregatePatchState & Readonly<{
  derivation: Extract<
    CoreEcologyAggregatePatchState["derivation"],
    { readonly kind:
      | "habitat-v4"
      | "legacy-fixed-v1-with-habitat-v4"
      | "habitat-v5"
      | "legacy-fixed-v1-with-habitat-v5"
      | "habitat-v6"
      | "legacy-fixed-v1-with-habitat-v6"
      | "habitat-v7"
      | "legacy-fixed-v1-with-habitat-v7"
      | "habitat-v8"
      | "legacy-fixed-v1-with-habitat-v8"
      | "habitat-v9"
      | "legacy-fixed-v1-with-habitat-v9"
      | "habitat-v10"
      | "legacy-fixed-v1-with-habitat-v10"
      | "habitat-v11"
      | "legacy-fixed-v1-with-habitat-v11"
      | "settlement-home-v1" }
  >;
}> {
  return patch.derivation.kind === "habitat-v4"
    || patch.derivation.kind === "legacy-fixed-v1-with-habitat-v4"
    || patch.derivation.kind === "habitat-v5"
    || patch.derivation.kind === "legacy-fixed-v1-with-habitat-v5"
    || patch.derivation.kind === "habitat-v6"
    || patch.derivation.kind === "legacy-fixed-v1-with-habitat-v6"
    || patch.derivation.kind === "habitat-v7"
    || patch.derivation.kind === "legacy-fixed-v1-with-habitat-v7"
    || patch.derivation.kind === "habitat-v8"
    || patch.derivation.kind === "legacy-fixed-v1-with-habitat-v8"
    || patch.derivation.kind === "habitat-v9"
    || patch.derivation.kind === "legacy-fixed-v1-with-habitat-v9"
    || patch.derivation.kind === "habitat-v10"
    || patch.derivation.kind === "legacy-fixed-v1-with-habitat-v10"
    || patch.derivation.kind === "habitat-v11"
    || patch.derivation.kind === "legacy-fixed-v1-with-habitat-v11"
    || patch.derivation.kind === "settlement-home-v1";
}

function runtimePolicyOwnsActivity(
  policy: CoreEcologySpeciesRuntimePolicy | null,
  profile: CoreEcologyActivityAffordanceProfile,
): boolean {
  return policy !== null
    && policy.speciesId === profile.speciesId
    && policy.actorAddressable
    && policy.identityForm === "individual"
    && policy.locomotionClass === profile.locomotionClass
    && profile.requiredCapabilities.every((capability) => (
      policy.capabilities.includes(capability)
    ));
}

function profileUsesHabitatPerch(
  profile: CoreEcologyActivityAffordanceProfile,
): boolean {
  return profile.destinations.some(({ semantic }) => (
    semantic === "authenticated-habitat-perch"
  ));
}

function perchProjection(
  anchor: WorldPosition,
  actorPosition: WorldPosition,
): CoreEcologyActivityProjection["perch"] {
  return Object.freeze({
    availability: withinWorldRadius(actorPosition, anchor, PERCH_ARRIVAL_RADIUS_UNITS)
      ? "available-here"
      : "available-at-anchor",
    anchor,
  });
}

function noPerchProjection(): CoreEcologyActivityProjection["perch"] {
  return Object.freeze({ availability: "not-applicable", anchor: null });
}

function frozenArea(center: WorldPosition, radiusUnits: number): ObservedArea {
  return Object.freeze({ center, radiusUnits });
}

function deterministicQuarteringTarget(
  anchor: WorldPosition,
  actorId: string,
  atTick: number,
): WorldPosition {
  const cadenceOrdinal = Math.trunc(atTick / CORE_ECOLOGY_ACTIVITY_CADENCE_TICKS);
  const phase = Number.parseInt(hashCanonical([actorId, "quartering-phase-v1"]).slice(0, 8), 16)
    % QUARTERING_OFFSETS.length;
  const offset = QUARTERING_OFFSETS[(cadenceOrdinal + phase) % QUARTERING_OFFSETS.length];
  if (offset === undefined) return anchor;
  return translateInsideWorld(anchor, offset.x, offset.y);
}

function translateInsideWorld(anchor: WorldPosition, deltaX: number, deltaY: number): WorldPosition {
  const candidates = [
    [deltaX, deltaY],
    [-deltaX, deltaY],
    [deltaX, -deltaY],
    [-deltaX, -deltaY],
    [Math.trunc(deltaX / 2), Math.trunc(deltaY / 2)],
    [-Math.trunc(deltaX / 2), -Math.trunc(deltaY / 2)],
  ] as const;
  for (const [x, y] of candidates) {
    try {
      return translateWorldPosition(anchor, x, y);
    } catch {
      // At signed coordinate limits, try the deterministic inward mirror.
    }
  }
  return anchor;
}

function withinWorldRadius(
  left: WorldPosition,
  right: WorldPosition,
  radiusUnits: number,
): boolean {
  const deltaX = (BigInt(right.region.x) - BigInt(left.region.x))
    * BigInt(REGION_WIDTH_UNITS) + BigInt(right.localX - left.localX);
  const deltaY = (BigInt(right.region.y) - BigInt(left.region.y))
    * BigInt(REGION_HEIGHT_UNITS) + BigInt(right.localY - left.localY);
  const radius = BigInt(radiusUnits);
  return deltaX * deltaX + deltaY * deltaY <= radius * radius;
}

function sameWorldPosition(left: WorldPosition, right: WorldPosition): boolean {
  return left.region.x === right.region.x
    && left.region.y === right.region.y
    && left.localX === right.localX
    && left.localY === right.localY;
}

export function coreEcologySpeciesHasBoundedActivityProjection(
  species: CoreWildlifeSpecies,
): species is CoreEcologyActivitySpecies {
  return ACTIVITY_SPECIES.has(species);
}

const isActivitySpecies = coreEcologySpeciesHasBoundedActivityProjection;

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort(compareText);
  const canonical = [...expected].sort(compareText);
  return keys.length === canonical.length
    && keys.every((key, index) => key === canonical[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

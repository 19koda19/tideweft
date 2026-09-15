import type { ObservedArea } from "../sim/actorPerception";
import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import { tideAtTick } from "../sim/terrain";
import {
  FIXED_POINT,
  type WeatherState,
} from "../sim/types";
import { hashCanonical } from "../sim/util";
import {
  WORLD_DAWN_START_TICK,
  WORLD_NIGHT_START_TICK,
  WORLD_TICKS_PER_DAY,
  projectWorldTime,
} from "../sim/worldTime";
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
  CORE_ECOLOGY_ANCHORED_WADER_MAXIMUM_DEPTH,
  CORE_ECOLOGY_ANCHORED_WADER_MINIMUM_DEPTH,
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
import { isTrustedCoreEcologyAlpineRidgeActivityAuthority } from "./coreEcologyAlpineRidgeActivity";
import { isTrustedCoreEcologyPolarConsumerActivityAuthority } from "./coreEcologyPolarConsumerActivity";
import {
  coreEcologyRidgeSoarAnchorAtCadence,
  type CoreEcologyRidgeActivityAuthorityV1,
} from "./coreEcologyRidgeActivityAuthority";
import {
  coreEcologySpeciesRuntimePolicy,
  CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES,
  type CoreEcologySpeciesRuntimePolicy,
} from "./coreEcologySpeciesRuntimePolicy";
import {
  CORE_ECOLOGY_ACTIVITY_AFFORDANCE_PROFILES,
  CORE_ECOLOGY_ACTIVITY_AFFORDANCE_SPECIES,
  coreEcologyActivityAffordanceProfile,
  coreEcologyShoreWaterMotionVocabulary,
  validateCoreEcologyActivityAffordances,
  type CoreEcologyActivityAffordanceProfile,
  type CoreEcologyActivityAffordanceSpecies,
  type CoreEcologyActivityDestinationSemantic,
  type CoreEcologyActivityPresentationSignal,
} from "./coreEcologyActivityAffordance";
import {
  CORE_WILDLIFE_REST_NEED_THRESHOLD,
  CORE_WILDLIFE_ROUTINE_REST_REFERENCE_ID,
  coreWildlifePerceivedClassCanWake,
  replaceCoreWildlifeActorCircadian,
  repositionCoreWildlifeActor,
  type CoreWildlifeActorState,
  type CoreWildlifeIntentKind,
} from "./coreWildlifeActor";
import {
  coreEcologyCircadianBindingForSpecies,
  coreEcologyCircadianPolicyForSpecies,
} from "./coreEcologyCircadianPolicy";
import type { CoreWildlifeTravelMedium } from "./coreWildlifeLocomotionProfile";
import { headingFromRadians } from "./livingActor";
import {
  resolveLivingActorLocomotion,
  type LivingActorTraversabilitySurface,
} from "./livingActorLocomotion";
import {
  livingCircadianPersistentStateFromProjection,
  livingCircadianProfile,
  projectLivingCircadian,
  type LivingCircadianDriverSignal,
  type LivingCircadianDisturbance,
  type LivingCircadianPosture,
  type LivingCircadianPriorityOverride,
  type LivingCircadianProjection,
} from "./livingCircadian";
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

/** Compatibility aliases for the released bounded activity contract. */
export const CORE_ECOLOGY_DAY_LENGTH_TICKS = WORLD_TICKS_PER_DAY;
export const CORE_ECOLOGY_DAYLIGHT_START_TICK = WORLD_DAWN_START_TICK;
export const CORE_ECOLOGY_DAYLIGHT_END_TICK = WORLD_NIGHT_START_TICK;

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
  | "ground-foraging"
  | "hauling-out"
  | "low-foraging"
  | "low-quartering"
  | "perched"
  | "ridge-soaring"
  | "responding"
  | "resting"
  | "shore-resting"
  | "seeking-habitat-anchor"
  | "seeking-perch"
  | "seeking-ridge-perch"
  | "seeking-tidal-refuge"
  | "seeking-dabbling-water"
  | "seeking-foraging-water"
  | "seeking-ground-foraging-area"
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
        | "forage-local"
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
        | "seek-shore-foraging-water"
        | "seek-dry-haulout"
        | "seek-ridge-perch"
        | "forage-ground-local"
        | "seek-ground-cover"
        | "seek-margin-habitat"
        | "soar-ridge-loop"
        | "seek-waterfowl-refuge";
      readonly targetArea: ObservedArea;
      readonly travelMedium: CoreWildlifeTravelMedium;
    }>;

export interface CoreEcologyActivityProjection {
  readonly version: typeof CORE_ECOLOGY_ACTIVITY_VERSION;
  readonly ownerId: typeof CORE_ECOLOGY_ACTIVITY_OWNER_ID;
  /** The activity affordance remains bounded; `routine` carries full circadian truth. */
  readonly scheduleScope: CoreEcologyActivityAffordanceProfile["scheduleScope"];
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
  /** Shared routine truth; null for archetypes not yet connected to the kernel. */
  readonly routine: LivingCircadianProjection | null;
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
  /** Canonical current environment; required by any binding with weather responses. */
  readonly weather?: Readonly<WeatherState>;
}

/** Transient destination custody accepted by the shared activity owner. */
export type CoreEcologyActivityAuthorityReceipt =
  | CoreEcologyActivityAuthorityV1
  | CoreEcologyRidgeActivityAuthorityV1;

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
const GROUND_FORAGING_TARGET_RADIUS_UNITS = Math.trunc(
  WORLD_POSITION_UNITS_PER_TILE / 2,
);
/** Ground actors retain one bounded destination long enough to physically reach it. */
const GROUND_FORAGING_CADENCE_TICKS = 40 as const;
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

/** Compatibility daylight label; the shared routine projection owns schedule truth. */
export function projectCoreEcologyDayPhase(
  atTick: unknown,
): CoreEcologyDayPhaseProjection | null {
  const time = projectWorldTime(atTick);
  if (time === null) return null;
  return Object.freeze({
    dayTick: time.dayTick,
    phase: time.establishedDaylight ? "daylight" : "rest-window",
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
    case "forage-local": return "deterministic-local-foraging-area";
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
    case "seek-shore-foraging-water":
      return "authenticated-foraging-water";
    case "seek-otter-haulout":
    case "seek-dry-haulout":
      return "authenticated-dry-haulout";
    case "seek-ridge-perch":
      return "authenticated-ridge-perch";
    case "forage-ground-local":
      return "deterministic-local-foraging-area";
    case "seek-ground-cover":
      return "authenticated-habitat-anchor";
    case "seek-margin-habitat":
      return "authenticated-habitat-anchor";
    case "soar-ridge-loop":
      return "authenticated-ridge-soar-loop";
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
  if (projection.scheduleScope !== profile.scheduleScope) {
    errors.push("projection-schedule-scope-mismatch");
  }

  const circadianPolicy = coreEcologyCircadianPolicyForSpecies(profile.speciesId);
  if (circadianPolicy === null) {
    if (projection.routine !== null) errors.push("undeclared-circadian-routine");
  } else if (projection.routine === null) {
    errors.push("missing-circadian-routine");
  } else if (
    projection.routine.subjectId !== actor.identity.stableId
    || projection.routine.atTick !== projection.atTick
    || hashCanonical(projection.routine.policy) !== hashCanonical(circadianPolicy)
  ) {
    errors.push("circadian-routine-binding-mismatch");
  }

  if (
    projection.presentationSignal !== null
    && !profile.presentationSignals.includes(projection.presentationSignal)
  ) errors.push("undeclared-presentation-signal");

  const perchDestination = profile.destinations.find(({ semantic }) => (
    semantic === "authenticated-habitat-perch"
    || semantic === "authenticated-ridge-perch"
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
  authority?: CoreEcologyActivityAuthorityReceipt,
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
  authority?: CoreEcologyActivityAuthorityReceipt,
): CoreEcologyActivityMotionStep | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(patchValue);
  const ordinaryKeys = ["actorId", "atTick", "maximumStepUnits"] as const;
  const inputRecord = plainRecord(input) ? input : null;
  const expectedKeys = [
    ...ordinaryKeys,
    ...(inputRecord !== null && Object.hasOwn(inputRecord, "surface") ? ["surface"] : []),
    ...(inputRecord !== null && Object.hasOwn(inputRecord, "weather") ? ["weather"] : []),
  ];
  if (
    patch === null
    || inputRecord === null
    || !exactKeys(inputRecord, expectedKeys)
    || typeof input.actorId !== "string"
    || input.actorId.length === 0
    || input.actorId.length > 256
    || !nonnegativeSafeInteger(input.atTick)
    || !positiveSafeInteger(input.maximumStepUnits)
    || (Object.hasOwn(inputRecord, "weather")
      && canonicalCoreEcologyCurrentWeather(input.weather, input.atTick) === null)
  ) return null;
  const projection = projectCanonicalCoreEcologyActivity(patch, {
    actorId: input.actorId,
    atTick: input.atTick,
    ...(input.weather === undefined ? {} : { weather: input.weather }),
  }, authority);
  if (projection === null) return null;
  if (projection.motion.kind === "defer-to-intent") {
    return activityMotionStep(patch, projection, "deferred", authority, input.weather);
  }
  if (projection.motion.kind === "hold-position") {
    return activityMotionStep(patch, projection, "held", authority, input.weather);
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
        ? activityMotionStep(patch, projection, "arrived", authority, input.weather)
        : activityMotionStep(patch, projection, "blocked", authority, input.weather);
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
        authority,
        input.weather,
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
    return activityMotionStep(patch, projection, "arrived", authority, input.weather);
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
      authority,
      input.weather,
    );
  } catch {
    return null;
  }
}

function projectCanonicalCoreEcologyActivity(
  patch: CoreEcologyAggregatePatchState,
  input: ProjectCoreEcologyActivityInput,
  suppliedAuthority?: CoreEcologyActivityAuthorityReceipt,
): CoreEcologyActivityProjection | null {
  if (
    !plainRecord(input)
    || !exactKeys(
      input,
      Object.hasOwn(input, "weather")
        ? ["actorId", "atTick", "weather"]
        : ["actorId", "atTick"],
    )
    || typeof input.actorId !== "string"
    || input.actorId.length === 0
    || input.actorId.length > 256
    || !nonnegativeSafeInteger(input.atTick)
    || input.atTick < patch.updatedAtTick
    || input.atTick - patch.updatedAtTick > CORE_ECOLOGY_MAX_STEP_TICKS
    || (Object.hasOwn(input, "weather")
      && canonicalCoreEcologyCurrentWeather(input.weather, input.atTick) === null)
  ) return null;
  const day = projectCoreEcologyDayPhase(input.atTick);
  const owned = findMaterializedActor(patch, input.actorId);
  if (day === null || owned === null) return null;
  const policy = coreEcologySpeciesRuntimePolicy(owned.species);
  const activityProfile = coreEcologyActivityAffordanceProfile(owned.species);
  if (activityProfile === null || !runtimePolicyOwnsActivity(policy, activityProfile)) {
    return null;
  }
  const circadianBinding = coreEcologyCircadianBindingForSpecies(owned.species);
  if (
    (circadianBinding?.weatherResponses.length ?? 0) > 0
    && !Object.hasOwn(input, "weather")
  ) return null;
  const authority = authenticatedActivityDestinations(
    patch,
    owned.population,
    owned.member,
    activityProfile,
    suppliedAuthority,
  );
  if (authority === null) return null;

  const responsive = IMMEDIATE_RESPONSE_INTENTS.has(owned.member.actor.intent.kind);
  const circadianPolicy = circadianBinding?.policy
    ?? coreEcologyCircadianPolicyForSpecies(owned.species);

  if (activityProfile.archetypeId === "perch-watch") {
    const perch = perchProjection(authority.homeAnchor, owned.member.actor.address.position);
    const atPerch = perch.availability === "available-here";
    const routine = projectPhysicalRestRoutine(
      owned,
      input.atTick,
      authority.homeAnchor,
      atPerch,
      responsive,
      "perch-watch-rest-destination-v1",
      "perch",
      [],
      input.weather,
    );
    if (routine === null) return null;
    if (responsive || routine.posture.state === "startled") {
      return activityProjection(owned, input.atTick, day, {
        state: "responding",
        responsiveToImmediateIntent: responsive,
        preferredNeutralIntent: responsive ? null : "observe",
        routine,
        presentationSignal: null,
        perch,
        motion: Object.freeze({ kind: "defer-to-intent" }),
      });
    }
    if (routine.effectivePreference === "rest") {
      return activityProjection(owned, input.atTick, day, {
        state: atPerch ? "perched" : "seeking-perch",
        responsiveToImmediateIntent: false,
        // Only physical arrival may request a rest intent. The intent's saved
        // entry tick then carries the continuous bout across save/load.
        preferredNeutralIntent: routine.effectivePreference === "rest" && atPerch
          ? "rest"
          : "observe",
        routine,
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
      routine,
      presentationSignal: null,
      perch,
      motion: Object.freeze({ kind: "defer-to-intent" }),
    });
  }

  if (activityProfile.archetypeId === "ground-cover-forager") {
    const atCover = withinWorldRadius(
      owned.member.actor.address.position,
      authority.homeAnchor,
      HABITAT_ANCHOR_ARRIVAL_RADIUS_UNITS,
    );
    const routine = projectPhysicalRestRoutine(
      owned,
      input.atTick,
      authority.homeAnchor,
      atCover,
      responsive,
      "ground-cover-rest-destination-v1",
      "cover",
      [],
      input.weather,
    );
    if (routine === null) return null;
    if (responsive || routine.posture.state === "startled") {
      return activityProjection(owned, input.atTick, day, {
        state: "responding",
        responsiveToImmediateIntent: responsive,
        preferredNeutralIntent: responsive ? null : "observe",
        routine,
        presentationSignal: null,
        perch: noPerchProjection(),
        motion: Object.freeze({ kind: "defer-to-intent" }),
      });
    }
    if (routine.effectivePreference === "rest") {
      return activityProjection(owned, input.atTick, day, {
        state: atCover ? "resting" : "seeking-habitat-anchor",
        responsiveToImmediateIntent: false,
        // A stale neutral REST intent cannot prolong a bout after the shared
        // clock returns to an active twilight window. Only the routine's
        // current effective preference and physical arrival own this choice.
        preferredNeutralIntent: atCover ? "rest" : "observe",
        routine,
        presentationSignal: atCover ? "resting" : "ground-relocation",
        perch: noPerchProjection(),
        motion: atCover
          ? Object.freeze({ kind: "hold-position" })
          : Object.freeze({
              kind: "target-area",
              verb: "seek-ground-cover",
              targetArea: frozenArea(
                authority.homeAnchor,
                HABITAT_ANCHOR_ARRIVAL_RADIUS_UNITS,
              ),
              travelMedium: "land",
            }),
      });
    }
    const target = deterministicGroundForagingTarget(
      authority.homeAnchor,
      owned.member.actor.identity.stableId,
      input.atTick,
    );
    const atForagingArea = withinWorldRadius(
      owned.member.actor.address.position,
      target,
      GROUND_FORAGING_TARGET_RADIUS_UNITS,
    );
    return activityProjection(owned, input.atTick, day, {
      state: atForagingArea ? "ground-foraging" : "seeking-ground-foraging-area",
      responsiveToImmediateIntent: false,
      preferredNeutralIntent: "observe",
      routine,
      presentationSignal: atForagingArea ? "ground-foraging" : "ground-relocation",
      perch: noPerchProjection(),
      motion: atForagingArea
        ? Object.freeze({ kind: "hold-position" })
        : Object.freeze({
            kind: "target-area",
            verb: "forage-ground-local",
            targetArea: frozenArea(target, GROUND_FORAGING_TARGET_RADIUS_UNITS),
            travelMedium: "land",
          }),
    });
  }

  // An unbound compatibility profile may still defer immediately. Every bound
  // profile first authenticates its physical rest destination so disturbance
  // can commit the shared STARTLED posture against the same body and place.
  if (responsive && circadianPolicy === null) {
    const responsivePerchAnchor = activityPerchAnchor(activityProfile, authority);
    return activityProjection(owned, input.atTick, day, {
      state: "responding",
      responsiveToImmediateIntent: true,
      preferredNeutralIntent: null,
      presentationSignal: null,
      perch: responsivePerchAnchor !== null
        ? perchProjection(
            responsivePerchAnchor,
            owned.member.actor.address.position,
          )
        : noPerchProjection(),
      motion: Object.freeze({ kind: "defer-to-intent" }),
    });
  }

  if (activityProfile.archetypeId === "ridge-soar-perch") {
    const ridgeAuthority = authority.ridgeAuthority;
    if (ridgeAuthority === null) return null;
    const perchAnchor = ridgeAuthority.perchAnchor.position;
    const perch = perchProjection(perchAnchor, owned.member.actor.address.position);
    const atPerch = perch.availability === "available-here";
    const routine = projectPhysicalRestRoutine(
      owned,
      input.atTick,
      perchAnchor,
      atPerch,
      responsive,
      "ridge-perch-rest-destination-v1",
      "ridge-perch",
      [],
      input.weather,
    );
    if (routine === null) return null;
    if (responsive || routine.posture.state === "startled") {
      return activityProjection(owned, input.atTick, day, {
        state: "responding",
        responsiveToImmediateIntent: responsive,
        preferredNeutralIntent: responsive ? null : "observe",
        routine,
        presentationSignal: null,
        perch,
        motion: Object.freeze({ kind: "defer-to-intent" }),
      });
    }
    if (routine.effectivePreference === "rest") {
      return activityProjection(owned, input.atTick, day, {
        state: atPerch ? "perched" : "seeking-ridge-perch",
        responsiveToImmediateIntent: false,
        preferredNeutralIntent: atPerch ? "rest" : "observe",
        routine,
        presentationSignal: atPerch ? "perched" : "ridge-soaring-flight",
        perch,
        motion: atPerch
          ? Object.freeze({ kind: "hold-position" })
          : Object.freeze({
              kind: "target-area",
              verb: "seek-ridge-perch",
              targetArea: frozenArea(perchAnchor, PERCH_ARRIVAL_RADIUS_UNITS),
              travelMedium: "air",
            }),
      });
    }
    const soarAnchor = coreEcologyRidgeSoarAnchorAtCadence(
      ridgeAuthority,
      Math.trunc(input.atTick / CORE_ECOLOGY_ACTIVITY_CADENCE_TICKS),
    );
    if (soarAnchor === null) return null;
    return activityProjection(owned, input.atTick, day, {
      state: "ridge-soaring",
      responsiveToImmediateIntent: false,
      preferredNeutralIntent: "observe",
      routine,
      presentationSignal: "ridge-soaring-flight",
      perch,
      motion: Object.freeze({
        kind: "target-area",
        verb: "soar-ridge-loop",
        targetArea: frozenArea(soarAnchor.position, PERCH_ARRIVAL_RADIUS_UNITS),
        travelMedium: "air",
      }),
    });
  }
  if (activityProfile.archetypeId === "perch-forage") {
    const perch = perchProjection(authority.homeAnchor, owned.member.actor.address.position);
    const atPerch = perch.availability === "available-here";
    const routine = projectPhysicalRestRoutine(
      owned,
      input.atTick,
      authority.homeAnchor,
      atPerch,
      responsive,
      "perch-forage-rest-destination-v1",
      "perch",
      [],
      input.weather,
    );
    if (routine === null) return null;
    if (responsive || routine.posture.state === "startled") {
      return activityProjection(owned, input.atTick, day, {
        state: "responding",
        responsiveToImmediateIntent: responsive,
        preferredNeutralIntent: responsive ? null : "observe",
        routine,
        presentationSignal: null,
        perch,
        motion: Object.freeze({ kind: "defer-to-intent" }),
      });
    }
    if (routine.effectivePreference === "rest") {
      return activityProjection(owned, input.atTick, day, {
        state: atPerch ? "perched" : "seeking-perch",
        responsiveToImmediateIntent: false,
        preferredNeutralIntent: atPerch ? "rest" : "observe",
        routine,
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
    const target = deterministicLocalForagingTarget(
      authority.homeAnchor,
      owned.member.actor.identity.stableId,
      input.atTick,
    );
    const atForagingArea = withinWorldRadius(
      owned.member.actor.address.position,
      target,
      QUARTERING_TARGET_RADIUS_UNITS,
    );
    return activityProjection(owned, input.atTick, day, {
      state: "low-foraging",
      responsiveToImmediateIntent: false,
      preferredNeutralIntent: "observe",
      routine,
      presentationSignal: atForagingArea ? null : "low-foraging-flight",
      perch,
      motion: atForagingArea
        ? Object.freeze({ kind: "hold-position" })
        : Object.freeze({
            kind: "target-area",
            verb: "forage-local",
            targetArea: frozenArea(target, QUARTERING_TARGET_RADIUS_UNITS),
          }),
    });
  }

  if (activityProfile.archetypeId === "amphibious-margin-forager") {
    if (authority.homeAnchorElevation === null) return null;
    const atHabitatAnchor = withinWorldRadius(
      owned.member.actor.address.position,
      authority.homeAnchor,
      HABITAT_ANCHOR_ARRIVAL_RADIUS_UNITS,
    );
    const waterDepth = Math.max(
      0,
      tideAtTick(input.atTick).level - authority.homeAnchorElevation,
    );
    const routine = projectPhysicalRestRoutine(
      owned,
      input.atTick,
      authority.homeAnchor,
      atHabitatAnchor,
      responsive,
      "amphibious-margin-rest-destination-v1",
      "margin",
      [],
      input.weather,
    );
    if (routine === null) return null;
    if (responsive || routine.posture.state === "startled") {
      return activityProjection(owned, input.atTick, day, {
        state: "responding",
        responsiveToImmediateIntent: responsive,
        preferredNeutralIntent: responsive ? null : "observe",
        routine,
        presentationSignal: null,
        perch: noPerchProjection(),
        motion: Object.freeze({ kind: "defer-to-intent" }),
      });
    }
    if (!atHabitatAnchor) {
      return activityProjection(owned, input.atTick, day, {
        state: "seeking-habitat-anchor",
        responsiveToImmediateIntent: false,
        preferredNeutralIntent: "observe",
        routine,
        presentationSignal: "shore-water-relocation",
        perch: noPerchProjection(),
        motion: Object.freeze({
          kind: "target-area",
          verb: "seek-margin-habitat",
          targetArea: frozenArea(
            authority.homeAnchor,
            HABITAT_ANCHOR_ARRIVAL_RADIUS_UNITS,
          ),
          travelMedium: "amphibious",
        }),
      });
    }
    const restsOnMargin = routine.effectivePreference === "rest";
    return activityProjection(owned, input.atTick, day, {
      state: restsOnMargin
        ? "shore-resting"
        : waterDepth === 0 ? "waiting-on-tide" : "aquatic-foraging",
      responsiveToImmediateIntent: false,
      preferredNeutralIntent: restsOnMargin ? "rest" : "observe",
      routine,
      presentationSignal: restsOnMargin
        ? "resting"
        : waterDepth === 0 ? null : "aquatic-foraging",
      perch: noPerchProjection(),
      motion: Object.freeze({ kind: "hold-position" }),
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
    const routine = projectPhysicalRestRoutine(
      owned,
      input.atTick,
      waterfowl.refugeTarget.targetPosition,
      atRefuge,
      responsive,
      "dabbling-refuge-rest-destination-v1",
      "waterfowl-refuge",
      [],
      input.weather,
    );
    if (routine === null) return null;
    if (responsive || routine.posture.state === "startled") {
      return activityProjection(owned, input.atTick, day, {
        state: "responding",
        responsiveToImmediateIntent: responsive,
        preferredNeutralIntent: responsive ? null : "observe",
        routine,
        presentationSignal: null,
        perch: noPerchProjection(),
        motion: Object.freeze({ kind: "defer-to-intent" }),
      });
    }
    if (routine.effectivePreference === "rest") {
      return activityProjection(owned, input.atTick, day, {
        state: atRefuge ? "resting" : "seeking-tidal-refuge",
        responsiveToImmediateIntent: false,
        preferredNeutralIntent: atRefuge ? "rest" : "observe",
        routine,
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
        routine,
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
        routine,
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
      routine,
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
    const motionVocabulary = coreEcologyShoreWaterMotionVocabulary(
      activityProfile.speciesId,
    );
    if (motionVocabulary === null) return null;
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
    const routine = projectPhysicalRestRoutine(
      owned,
      input.atTick,
      tidalWeb.hauloutTarget,
      atHaulout,
      responsive,
      "shore-water-haulout-rest-destination-v1",
      "haulout",
      [],
      input.weather,
    );
    if (routine === null) return null;
    if (responsive || routine.posture.state === "startled") {
      return activityProjection(owned, input.atTick, day, {
        state: "responding",
        responsiveToImmediateIntent: responsive,
        preferredNeutralIntent: responsive ? null : "observe",
        routine,
        presentationSignal: null,
        perch: noPerchProjection(),
        motion: Object.freeze({ kind: "defer-to-intent" }),
      });
    }
    const routinePrefersRest = routine.effectivePreference === "rest";
    if (routinePrefersRest) {
      return activityProjection(owned, input.atTick, day, {
        state: atHaulout ? "shore-resting" : "hauling-out",
        responsiveToImmediateIntent: false,
        preferredNeutralIntent: atHaulout ? "rest" : "observe",
        routine,
        presentationSignal: atHaulout ? "resting" : "shore-water-relocation",
        perch: noPerchProjection(),
        motion: atHaulout
          ? Object.freeze({ kind: "hold-position" })
          : Object.freeze({
              kind: "target-area",
              verb: motionVocabulary.seekHaulout,
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
        routine,
        presentationSignal: "shore-water-relocation",
        perch: noPerchProjection(),
        motion: Object.freeze({
          kind: "target-area",
          verb: motionVocabulary.seekForagingWater,
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
      routine,
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
    const actor = owned.member.actor;
    const atRefuge = withinWorldRadius(
      actor.address.position,
      egret.refugeTarget.targetPosition,
      WADING_ARRIVAL_RADIUS_UNITS,
    );
    const aquaticObservation = currentAquaticActivityObservation(actor, input.atTick);
    const driverSignals: LivingCircadianDriverSignal[] = [];
    if (egret.wadingTarget !== null) {
      const tideSignal = authoritativeTideDriverSignal(owned, input.atTick, {
        targetAnchorOrdinal: egret.wadingTarget.targetAnchorOrdinal,
        targetPosition: egret.wadingTarget.targetPosition,
        waterDepth: egret.wadingTarget.waterDepth,
      });
      if (tideSignal !== null) driverSignals.push(tideSignal);
    }
    if (aquaticObservation !== null) {
      driverSignals.push(Object.freeze({
        driver: "opportunity",
        source: "lawful-observation",
        referenceId: aquaticObservation.sourceObservationId,
        sampledAtTick: input.atTick,
      }));
    }
    const routine = projectPhysicalRestRoutine(
      owned,
      input.atTick,
      egret.refugeTarget.targetPosition,
      atRefuge,
      responsive,
      "tidal-wader-refuge-rest-destination-v1",
      "tidal-refuge",
      driverSignals,
      input.weather,
    );
    if (routine === null) return null;
    if (responsive || routine.posture.state === "startled") {
      return activityProjection(owned, input.atTick, day, {
        state: "responding",
        responsiveToImmediateIntent: responsive,
        preferredNeutralIntent: responsive ? null : "observe",
        routine,
        presentationSignal: null,
        perch: noPerchProjection(),
        motion: Object.freeze({ kind: "defer-to-intent" }),
      });
    }
    if (routine.effectivePreference === "rest") {
      return activityProjection(owned, input.atTick, day, {
        state: atRefuge ? "resting" : "seeking-tidal-refuge",
        responsiveToImmediateIntent: false,
        preferredNeutralIntent: routine.effectivePreference === "rest" && atRefuge
          ? "rest"
          : "observe",
        routine,
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
      return activityProjection(owned, input.atTick, day, {
        state: atRefuge ? "waiting-on-tide" : "seeking-tidal-refuge",
        responsiveToImmediateIntent: false,
        sourceObservationId: aquaticObservation?.sourceObservationId ?? null,
        preferredNeutralIntent: "observe",
        routine,
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
    const observedTarget = aquaticObservation === null
      ? null
      : nearestWadingTarget(aquaticObservation.area.center, egret.wadingTargets);
    if (aquaticObservation === null || observedTarget === null) {
      const currentWadingTarget = egret.wadingTargets.find((target) => withinWorldRadius(
        owned.member.actor.address.position,
        target.targetPosition,
        WADING_ARRIVAL_RADIUS_UNITS,
      ));
      return activityProjection(owned, input.atTick, day, {
        state: currentWadingTarget !== undefined
          ? "wading-scan"
          : atRefuge ? "waiting-on-tide" : "seeking-tidal-refuge",
        responsiveToImmediateIntent: false,
        sourceObservationId: null,
        preferredNeutralIntent: "observe",
        routine,
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
      routine,
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

  if (activityProfile.archetypeId === "anchored-wader") {
    if (authority.homeAnchorElevation === null) return null;
    const atWadingGround = withinWorldRadius(
      owned.member.actor.address.position,
      authority.homeAnchor,
      WADING_ARRIVAL_RADIUS_UNITS,
    );
    const waterDepth = Math.max(
      0,
      tideAtTick(input.atTick).level - authority.homeAnchorElevation,
    );
    // Authenticated habitat admission guarantees the upper bound. Fail closed
    // rather than presenting a bird standing or resting in unsupported depth.
    if (waterDepth > CORE_ECOLOGY_ANCHORED_WADER_MAXIMUM_DEPTH) return null;
    const routine = projectPhysicalRestRoutine(
      owned,
      input.atTick,
      authority.homeAnchor,
      atWadingGround,
      responsive,
      "anchored-wader-rest-destination-v1",
      "wading-anchor",
      [],
      input.weather,
    );
    if (routine === null) return null;
    if (responsive || routine.posture.state === "startled") {
      return activityProjection(owned, input.atTick, day, {
        state: "responding",
        responsiveToImmediateIntent: responsive,
        preferredNeutralIntent: responsive ? null : "observe",
        routine,
        presentationSignal: null,
        perch: noPerchProjection(),
        motion: Object.freeze({ kind: "defer-to-intent" }),
      });
    }
    const seekAuthenticatedWadingGround = () => activityProjection(
      owned,
      input.atTick,
      day,
      {
        state: "seeking-wading-ground",
        responsiveToImmediateIntent: false,
        preferredNeutralIntent: "observe",
        routine,
        presentationSignal: "tidal-relocation-flight",
        perch: noPerchProjection(),
        motion: Object.freeze({
          kind: "target-area" as const,
          verb: "seek-wading-ground" as const,
          targetArea: frozenArea(
            authority.homeAnchor,
            WADING_ARRIVAL_RADIUS_UNITS,
          ),
        }),
      },
    );
    if (routine.effectivePreference === "rest") {
      if (!atWadingGround) return seekAuthenticatedWadingGround();
      return activityProjection(owned, input.atTick, day, {
        state: "resting",
        responsiveToImmediateIntent: false,
        preferredNeutralIntent: "rest",
        routine,
        presentationSignal: "resting",
        perch: noPerchProjection(),
        motion: Object.freeze({ kind: "hold-position" }),
      });
    }
    if (waterDepth < CORE_ECOLOGY_ANCHORED_WADER_MINIMUM_DEPTH) {
      if (!atWadingGround) return seekAuthenticatedWadingGround();
      return activityProjection(owned, input.atTick, day, {
        state: "waiting-on-tide",
        responsiveToImmediateIntent: false,
        preferredNeutralIntent: "observe",
        routine,
        presentationSignal: null,
        perch: noPerchProjection(),
        motion: Object.freeze({ kind: "defer-to-intent" }),
      });
    }
    const aquaticObservation = currentAquaticActivityObservation(
      owned.member.actor,
      input.atTick,
    );
    if (!atWadingGround) {
      return seekAuthenticatedWadingGround();
    }
    const searching = aquaticObservation !== null
      || Math.trunc(input.atTick / CORE_ECOLOGY_ACTIVITY_CADENCE_TICKS) % 2 === 1;
    return activityProjection(owned, input.atTick, day, {
      state: searching ? "wading-search" : "wading-scan",
      responsiveToImmediateIntent: false,
      sourceObservationId: aquaticObservation?.sourceObservationId ?? null,
      preferredNeutralIntent: "observe",
      routine,
      presentationSignal: searching ? "wading-search" : "wading-scan",
      perch: noPerchProjection(),
      motion: Object.freeze({ kind: "hold-position" }),
    });
  }

  if (activityProfile.archetypeId === "diving-waterbird") {
    const atHabitatAnchor = withinWorldRadius(
      owned.member.actor.address.position,
      authority.homeAnchor,
      HABITAT_ANCHOR_ARRIVAL_RADIUS_UNITS,
    );
    const routine = projectPhysicalRestRoutine(
      owned,
      input.atTick,
      authority.homeAnchor,
      atHabitatAnchor,
      responsive,
      "diving-waterbird-rest-destination-v1",
      "habitat-anchor",
      [],
      input.weather,
    );
    if (routine === null) return null;
    if (responsive || routine.posture.state === "startled") {
      return activityProjection(owned, input.atTick, day, {
        state: "responding",
        responsiveToImmediateIntent: responsive,
        preferredNeutralIntent: responsive ? null : "observe",
        routine,
        presentationSignal: null,
        perch: noPerchProjection(),
        motion: Object.freeze({ kind: "defer-to-intent" }),
      });
    }
    if (routine.effectivePreference === "rest") {
      return activityProjection(owned, input.atTick, day, {
        state: atHabitatAnchor ? "resting" : "seeking-habitat-anchor",
        responsiveToImmediateIntent: false,
        preferredNeutralIntent: atHabitatAnchor ? "rest" : "observe",
        routine,
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
        routine,
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
        ? "surface-diving"
        : "seeking-surface-opportunity",
      responsiveToImmediateIntent: false,
      sourceObservationId: surfaceOpportunity.sourceObservationId,
      preferredNeutralIntent: "observe",
      routine,
      presentationSignal: atSurfaceOpportunity
        ? "surface-diving"
        : "surface-opportunity-flight",
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

  if (activityProfile.archetypeId === "aerial-surface-opportunist") {
    const atHabitatAnchor = withinWorldRadius(
      owned.member.actor.address.position,
      authority.homeAnchor,
      HABITAT_ANCHOR_ARRIVAL_RADIUS_UNITS,
    );
    const routine = projectPhysicalRestRoutine(
      owned,
      input.atTick,
      authority.homeAnchor,
      atHabitatAnchor,
      responsive,
      "aerial-surface-rest-destination-v1",
      "habitat-anchor",
      [],
      input.weather,
    );
    if (routine === null) return null;
    if (responsive || routine.posture.state === "startled") {
      return activityProjection(owned, input.atTick, day, {
        state: "responding",
        responsiveToImmediateIntent: responsive,
        preferredNeutralIntent: responsive ? null : "observe",
        routine,
        presentationSignal: null,
        perch: noPerchProjection(),
        motion: Object.freeze({ kind: "defer-to-intent" }),
      });
    }
    if (routine.effectivePreference === "rest") {
      return activityProjection(owned, input.atTick, day, {
        state: atHabitatAnchor ? "resting" : "seeking-habitat-anchor",
        responsiveToImmediateIntent: false,
        preferredNeutralIntent: atHabitatAnchor ? "rest" : "observe",
        routine,
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
        routine,
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
      routine,
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
  const atHabitatAnchor = withinWorldRadius(
    owned.member.actor.address.position,
    authority.homeAnchor,
    HABITAT_ANCHOR_ARRIVAL_RADIUS_UNITS,
  );
  const routine = projectPhysicalRestRoutine(
    owned,
    input.atTick,
    authority.homeAnchor,
    atHabitatAnchor,
    responsive,
    "low-quartering-rest-destination-v1",
    "habitat-anchor",
    [],
    input.weather,
  );
  if (routine === null) return null;
  if (responsive || routine.posture.state === "startled") {
    return activityProjection(owned, input.atTick, day, {
      state: "responding",
      responsiveToImmediateIntent: responsive,
      preferredNeutralIntent: responsive ? null : "observe",
      routine,
      presentationSignal: null,
      perch: noPerchProjection(),
      motion: Object.freeze({ kind: "defer-to-intent" }),
    });
  }
  if (routine.effectivePreference === "rest") {
    return activityProjection(owned, input.atTick, day, {
      state: atHabitatAnchor ? "resting" : "seeking-habitat-anchor",
      responsiveToImmediateIntent: false,
      preferredNeutralIntent: atHabitatAnchor ? "rest" : "observe",
      routine,
      presentationSignal: atHabitatAnchor ? "resting" : "low-quartering-flight",
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
  return activityProjection(owned, input.atTick, day, {
    state: "low-quartering",
    responsiveToImmediateIntent: false,
    preferredNeutralIntent: "observe",
    routine,
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
  authority?: CoreEcologyActivityAuthorityReceipt,
  weather?: Readonly<WeatherState>,
): CoreEcologyActivityMotionStep | null {
  if (projection.routine === null) {
    return Object.freeze({ patch, projection, resolution });
  }
  const actor = findMaterializedActor(patch, projection.actorId)?.member.actor;
  if (actor === undefined || actor.updatedAtTick !== projection.atTick) {
    return Object.freeze({ patch, projection, resolution });
  }
  const committedRoutine = resolution === "moved"
    ? projectCanonicalCoreEcologyActivity(patch, {
      actorId: projection.actorId,
      atTick: projection.atTick,
      ...(weather === undefined ? {} : { weather }),
    }, authority)?.routine ?? null
    : projection.routine;
  if (committedRoutine === null) return null;
  const withRoutine = replaceCoreWildlifeActorCircadian(actor, {
    atTick: projection.atTick,
    circadian: livingCircadianPersistentStateFromProjection(committedRoutine),
  });
  return Object.freeze({
    patch: replaceCoreEcologyAggregatePatchActor(patch, withRoutine),
    projection,
    resolution,
  });
}

/**
 * Build-gate diagnostics: every canonical bounded-activity capability must
 * have a real projection owner. A future species cannot become "active"
 * merely by adding catalog metadata.
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

function projectPhysicalRestRoutine(
  owned: OwnedActivityActor,
  atTick: number,
  restDestination: WorldPosition,
  arrived: boolean,
  responsive: boolean,
  destinationNamespace: string,
  destinationPrefix: string,
  driverSignals: readonly LivingCircadianDriverSignal[],
  weather: Readonly<WeatherState> | undefined,
): LivingCircadianProjection | null {
  const actor = owned.member.actor;
  const binding = coreEcologyCircadianBindingForSpecies(actor.identity.species);
  if (binding === null) return null;
  const weatherResponse = projectCircadianWeatherResponse(binding, atTick, weather);
  const destinationId = `${destinationPrefix}:${hashCanonical([
    destinationNamespace,
    actor.identity.stableId,
    restDestination,
  ])}`;
  return projectLivingCircadian({
    subjectId: actor.identity.stableId,
    atTick,
    mode: "full",
    policy: binding.policy,
    current: physicalRestPosture(actor, atTick, arrived, destinationId, binding.policy),
    restDestination: {
      destinationId,
      arrived,
    },
    driverSignals: Object.freeze([
      ...driverSignals,
      ...weatherResponse.driverSignals,
    ]),
    disturbance: currentRoutineDisturbance(actor, atTick),
    priorityOverride: routinePriorityOverride(actor, responsive)
      ?? weatherResponse.priorityOverride,
  });
}

function projectCircadianWeatherResponse(
  binding: NonNullable<ReturnType<typeof coreEcologyCircadianBindingForSpecies>>,
  atTick: number,
  weather: Readonly<WeatherState> | undefined,
): Readonly<{
  driverSignals: readonly LivingCircadianDriverSignal[];
  priorityOverride: LivingCircadianPriorityOverride | null;
}> {
  if (weather === undefined || binding.weatherResponses.length === 0) {
    return Object.freeze({
      driverSignals: Object.freeze([]),
      priorityOverride: null,
    });
  }
  const matching = binding.weatherResponses.filter((response) => (
    response.weatherKinds.includes(weather.kind)
    && weather.intensity >= response.minimumIntensity
  ));
  const activity = matching.find(({ effect }) => effect === "activity-driver");
  const dangerous = matching.find(({ effect }) => effect === "dangerous-weather-rest");
  const referenceIdFor = (responseId: string) => `weather:${responseId}:${hashCanonical({
    atTick,
    weather,
  })}`;
  return Object.freeze({
    driverSignals: activity === undefined
      ? Object.freeze([])
      : Object.freeze([Object.freeze({
          driver: "weather" as const,
          source: "authoritative-environment" as const,
          referenceId: referenceIdFor(activity.responseId),
          sampledAtTick: atTick,
        })]),
    priorityOverride: dangerous === undefined
      ? null
      : Object.freeze({
          kind: "dangerous-weather" as const,
          referenceId: referenceIdFor(dangerous.responseId),
          preference: "rest" as const,
        }),
  });
}

/**
 * Turns branch-owned ecological usability evidence into the one shared tide
 * driver shape. A branch must first prove useful depth/terrain; the tide's mere
 * existence never wakes an actor.
 */
function authoritativeTideDriverSignal(
  owned: OwnedActivityActor,
  atTick: number,
  usabilityEvidence: unknown,
): LivingCircadianDriverSignal | null {
  const binding = coreEcologyCircadianBindingForSpecies(owned.species);
  if (binding === null || !binding.policy.drivers.includes("tide")) return null;
  return Object.freeze({
    driver: "tide",
    source: "authoritative-environment",
    referenceId: `tide:usable:${hashCanonical({
      actorId: owned.member.actor.identity.stableId,
      atTick,
      usabilityEvidence,
    })}`,
    sampledAtTick: atTick,
  });
}

function physicalRestPosture(
  actor: CoreWildlifeActorState,
  atTick: number,
  arrived: boolean,
  destinationId: string,
  policy: NonNullable<ReturnType<typeof coreEcologyCircadianPolicyForSpecies>>,
): LivingCircadianPosture {
  if (actor.circadian !== undefined) {
    return actor.circadian.restDestinationId === destinationId
      ? actor.circadian.posture
      : Object.freeze({ state: "awake", enteredAtTick: atTick });
  }
  const enteredAtTick = actor.intent.enteredAtTick;
  const profile = livingCircadianProfile(policy.profileId);
  if (actor.intent.kind === "rest") {
    // Lazy v30 adoption may encounter one historical schedule-owned rest
    // intent before this sidecar exists. Only that exact bounded lease can
    // seed posture; need-driven travel can never become instant sleep.
    if (
      actor.intent.cause.kind !== "condition"
      || actor.intent.cause.referenceId !== CORE_WILDLIFE_ROUTINE_REST_REFERENCE_ID
      || actor.intent.expiresAtTick === null
      || atTick >= actor.intent.expiresAtTick
    ) return Object.freeze({ state: "awake", enteredAtTick: atTick });
    const settled = arrived && atTick - enteredAtTick >= profile.settleTicks;
    return Object.freeze({
      state: settled ? "asleep" : "resting",
      enteredAtTick: settled ? enteredAtTick + profile.settleTicks : enteredAtTick,
    });
  }
  return Object.freeze({ state: "awake", enteredAtTick });
}

function currentRoutineDisturbance(
  actor: CoreWildlifeActorState,
  atTick: number,
): LivingCircadianDisturbance | null {
  const candidates = actor.perception.beliefs.filter((candidate) => (
    candidate.lastObservedTick === atTick
    && candidate.strongInterrupt
    && coreWildlifePerceivedClassCanWake(candidate.perceivedClass)
  )).sort((left, right) => (
    right.salience - left.salience
    || (left.sourceObservationId < right.sourceObservationId ? -1 : 1)
  ));
  const belief = actor.intent.focusObservationId === null
    ? candidates[0]
    : candidates.find((candidate) => (
        candidate.sourceObservationId === actor.intent.focusObservationId
      )) ?? candidates[0];
  return belief === undefined
    ? null
    : Object.freeze({
        source: "lawful-perception",
        referenceId: belief.sourceObservationId,
        observedAtTick: atTick,
        intensity: belief.salience,
      });
}

function routinePriorityOverride(
  actor: CoreWildlifeActorState,
  responsive: boolean,
): LivingCircadianPriorityOverride | null {
  if (responsive) {
    const urgentNeed = actor.intent.kind === "forage"
      || actor.intent.kind === "scavenge"
      || actor.intent.cause.kind === "condition";
    return Object.freeze({
      kind: urgentNeed ? "urgent-need" : "active-commitment",
      referenceId: actor.intent.cause.referenceId,
      preference: "active",
    });
  }
  return actor.needs.rest >= CORE_WILDLIFE_REST_NEED_THRESHOLD
    ? Object.freeze({
        kind: "urgent-need" as const,
        referenceId: "need:rest",
        preference: "rest" as const,
      })
    : null;
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
  > & Readonly<{
    readonly routine?: LivingCircadianProjection | null;
    readonly sourceObservationId?: string | null;
  }>,
): CoreEcologyActivityProjection | null {
  const profile = coreEcologyActivityAffordanceProfile(owned.species);
  if (profile === null) return null;
  const projection = deepFreeze({
    version: CORE_ECOLOGY_ACTIVITY_VERSION,
    ownerId: CORE_ECOLOGY_ACTIVITY_OWNER_ID,
    scheduleScope: profile.scheduleScope,
    actorId: owned.member.actor.identity.stableId,
    species: owned.species,
    atTick,
    dayTick: day.dayTick,
    dayPhase: day.phase,
    ...activity,
    routine: activity.routine ?? null,
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
  readonly homeAnchorElevation: number | null;
  readonly tidalAnchors: readonly CoreEcologyTidalWebHabitatAnchor[];
  readonly ridgeAuthority: CoreEcologyRidgeActivityAuthorityV1 | null;
}

function authenticatedActivityDestinations(
  patch: CoreEcologyAggregatePatchState,
  population: CoreEcologyPopulationState,
  member: CoreEcologyPopulationMemberState,
  profile: CoreEcologyActivityAffordanceProfile,
  supplied: CoreEcologyActivityAuthorityReceipt | undefined,
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
      homeAnchorElevation: null,
      tidalAnchors: Object.freeze(tidalAnchors),
      ridgeAuthority: null,
    });
  }
  if (supplied === undefined) return null;
  if (profile.archetypeId === "ridge-soar-perch") {
    if (
      !isTrustedCoreEcologyAlpineRidgeActivityAuthority(supplied)
      || supplied.sourceKey !== patch.patchKey
      || supplied.actorId !== member.actor.identity.stableId
      || supplied.homeAnchor.region.x !== patch.originRegion.x
      || supplied.homeAnchor.region.y !== patch.originRegion.y
    ) return null;
    return Object.freeze({
      homeAnchor: supplied.homeAnchor,
      homeAnchorElevation: null,
      tidalAnchors: Object.freeze([]),
      ridgeAuthority: supplied,
    });
  }
  if (
    !isTrustedCoreEcologyActivityAuthority(supplied)
    || (population.species === "harbor-seal"
      && !isTrustedCoreEcologyPolarConsumerActivityAuthority(supplied))
    || supplied.sourceKey !== patch.patchKey
    || supplied.actorId !== member.actor.identity.stableId
    || supplied.species !== population.species
  ) return null;
  return Object.freeze({
    homeAnchor: supplied.homeAnchor,
    homeAnchorElevation: supplied.homeAnchorElevation,
    tidalAnchors: supplied.tidalAnchors,
    ridgeAuthority: null,
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

function activityPerchAnchor(
  profile: CoreEcologyActivityAffordanceProfile,
  authority: AuthenticatedActivityDestinations,
): WorldPosition | null {
  if (profile.destinations.some(({ semantic }) => (
    semantic === "authenticated-ridge-perch"
  ))) return authority.ridgeAuthority?.perchAnchor.position ?? null;
  return profile.destinations.some(({ semantic }) => (
    semantic === "authenticated-habitat-perch"
  )) ? authority.homeAnchor : null;
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
  return deterministicLocalActivityTarget(
    anchor,
    actorId,
    atTick,
    CORE_ECOLOGY_ACTIVITY_CADENCE_TICKS,
    "quartering-phase-v1",
  );
}

function deterministicLocalForagingTarget(
  anchor: WorldPosition,
  actorId: string,
  atTick: number,
): WorldPosition {
  return deterministicLocalActivityTarget(
    anchor,
    actorId,
    atTick,
    CORE_ECOLOGY_ACTIVITY_CADENCE_TICKS,
    "local-foraging-phase-v1",
  );
}

function deterministicGroundForagingTarget(
  anchor: WorldPosition,
  actorId: string,
  atTick: number,
): WorldPosition {
  return deterministicLocalActivityTarget(
    anchor,
    actorId,
    atTick,
    GROUND_FORAGING_CADENCE_TICKS,
    "ground-foraging-phase-v1",
  );
}

function deterministicLocalActivityTarget(
  anchor: WorldPosition,
  actorId: string,
  atTick: number,
  cadenceTicks: number,
  domain: string,
): WorldPosition {
  const cadenceOrdinal = Math.trunc(atTick / cadenceTicks);
  const phase = Number.parseInt(
    hashCanonical([actorId, domain]).slice(0, 8),
    16,
  ) % QUARTERING_OFFSETS.length;
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

/**
 * Canonical current weather accepted by ecology routine and presentation
 * boundaries. Optional callers must either omit weather or provide this exact
 * authoritative shape and remain valid beyond the projection tick; an
 * explicit undefined, expired snapshot, or caller-authored extension fails
 * closed.
 */
export function canonicalCoreEcologyCurrentWeather(
  value: unknown,
  atTick: number,
): Readonly<WeatherState> | null {
  if (
    !nonnegativeSafeInteger(atTick)
    || !plainRecord(value)
    || !exactKeys(value, ["intensity", "kind", "nextChangeTick", "windX", "windY"])
    || (
      value.kind !== "clear"
      && value.kind !== "mist"
      && value.kind !== "rain"
      && value.kind !== "storm"
    )
    || !nonnegativeSafeInteger(value.intensity)
    || value.intensity > FIXED_POINT
    || !signedFixedPoint(value.windX)
    || !signedFixedPoint(value.windY)
    || !nonnegativeSafeInteger(value.nextChangeTick)
    || value.nextChangeTick <= atTick
  ) return null;
  return Object.freeze({
    kind: value.kind,
    intensity: value.intensity,
    windX: value.windX,
    windY: value.windY,
    nextChangeTick: value.nextChangeTick,
  });
}

function signedFixedPoint(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && Math.abs(value) <= FIXED_POINT
    && !Object.is(value, -0);
}

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

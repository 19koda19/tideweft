import type { ObservedArea } from "../sim/actorPerception";
import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import { hashCanonical } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_STEP_TICKS,
  canonicalizeCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationMemberState,
  type CoreEcologyPopulationState,
} from "./coreEcology";
import type { CoreEcologyHabitatAllocation } from "./coreEcologyHabitat";
import {
  projectCoreEcologyTidalTable,
  type CoreEcologySnowyEgretTidalTarget,
} from "./coreEcologyTidalTable";
import {
  CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES,
  coreEcologySpeciesRuntimePolicy,
  isCoreEcologySpeciesRuntimePolicy,
  type CoreEcologySpeciesRuntimeCapability,
  type CoreEcologySpeciesRuntimePolicy,
} from "./coreEcologySpeciesRuntimePolicy";
import {
  repositionCoreWildlifeActor,
  type CoreWildlifeIntentKind,
} from "./coreWildlifeActor";
import { headingFromRadians } from "./livingActor";
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
export const CORE_ECOLOGY_ACTIVITY_SPECIES = Object.freeze([
  "fish-crow",
  "northern-harrier",
  "snowy-egret",
] as const);

export type CoreEcologyActivitySpecies =
  (typeof CORE_ECOLOGY_ACTIVITY_SPECIES)[number];
export type CoreEcologyBoundedDayPhase = "daylight" | "rest-window";
export type CoreEcologyActivityState =
  | "active-watch"
  | "low-quartering"
  | "perched"
  | "responding"
  | "resting"
  | "seeking-perch"
  | "seeking-tidal-refuge"
  | "seeking-wading-ground"
  | "waiting-on-tide"
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
        | "seek-perch"
        | "seek-tidal-refuge"
        | "seek-wading-ground";
      readonly targetArea: ObservedArea;
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
  /** Exact current observation authorizing a foraging claim; null means neutral scanning. */
  readonly sourceObservationId: string | null;
  readonly preferredNeutralIntent: Extract<CoreWildlifeIntentKind, "observe" | "rest"> | null;
  readonly presentationSignal:
    | "low-quartering-flight"
    | "perched"
    | "resting"
    | "tidal-relocation-flight"
    | "wading-scan"
    | "wading-search"
    | null;
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
}

export interface CoreEcologyActivityMotionStep {
  readonly patch: CoreEcologyAggregatePatchState;
  readonly projection: CoreEcologyActivityProjection;
  readonly resolution: "arrived" | "deferred" | "held" | "moved";
}

const ACTIVITY_SPECIES = new Set<CoreWildlifeSpecies>(CORE_ECOLOGY_ACTIVITY_SPECIES);
const IMMEDIATE_RESPONSE_INTENTS = new Set<CoreWildlifeIntentKind>([
  "alarm",
  "disengage",
  "flee",
  "forage",
  "guard",
  "pursue",
  "retreat",
  "scavenge",
]);
const REQUIRED_COMMON_CAPABILITIES = Object.freeze([
  "actor-address",
  "aerial-locomotion",
  "diurnal-activity",
] satisfies readonly CoreEcologySpeciesRuntimeCapability[]);
const PERCH_ARRIVAL_RADIUS_UNITS = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
const QUARTERING_TARGET_RADIUS_UNITS = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
const WADING_ARRIVAL_RADIUS_UNITS = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 3);
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
 * Resolves an actionable activity projection for a materialized Rain Chorus
 * bird. Habitat-v4 custody proves that a crow's allocation is a lawful perch;
 * arbitrary caller positions cannot mint one. Other species fail closed and
 * retain their byte-compatible existing behavior.
 */
export function projectCoreEcologyActivity(
  patchValue: unknown,
  input: ProjectCoreEcologyActivityInput,
): CoreEcologyActivityProjection | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(patchValue);
  return patch === null ? null : projectCanonicalCoreEcologyActivity(patch, input);
}

/**
 * Executes one authenticated schedule-owned aerial movement as a transaction.
 * A malformed, distant-imprecise, or unrepresentable target fails closed; it
 * never becomes an ordinary neutral intent for the runtime's chase/escape
 * refinement loop.
 */
export function stepCoreEcologyActivityMotion(
  patchValue: unknown,
  input: StepCoreEcologyActivityMotionInput,
): CoreEcologyActivityMotionStep | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(patchValue);
  if (
    patch === null
    || !plainRecord(input)
    || !exactKeys(input, ["actorId", "atTick", "maximumStepUnits"])
    || typeof input.actorId !== "string"
    || input.actorId.length === 0
    || input.actorId.length > 256
    || !nonnegativeSafeInteger(input.atTick)
    || !positiveSafeInteger(input.maximumStepUnits)
  ) return null;
  const projection = projectCanonicalCoreEcologyActivity(patch, {
    actorId: input.actorId,
    atTick: input.atTick,
  });
  if (projection === null) return null;
  if (projection.motion.kind === "defer-to-intent") {
    return activityMotionStep(patch, projection, "deferred");
  }
  if (projection.motion.kind === "hold-position") {
    return activityMotionStep(patch, projection, "held");
  }

  const owned = findMaterializedActor(patch, input.actorId);
  if (owned === null) return null;
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
  if (!runtimePolicyOwnsActivity(policy, owned.species)) return null;
  const allocation = authenticatedHabitatAllocation(patch, owned.population, owned.member);
  if (allocation === null) return null;

  const responsive = IMMEDIATE_RESPONSE_INTENTS.has(owned.member.actor.intent.kind);
  if (responsive) {
    return activityProjection(owned, input.atTick, day, {
      state: "responding",
      responsiveToImmediateIntent: true,
      preferredNeutralIntent: null,
      presentationSignal: null,
      perch: owned.species === "fish-crow"
        ? perchProjection(allocation.position, owned.member.actor.address.position)
        : noPerchProjection(),
      motion: Object.freeze({ kind: "defer-to-intent" }),
    });
  }

  const actorNeedsRest = owned.member.actor.intent.kind === "rest";
  const inRestWindow = day.phase === "rest-window";
  if (owned.species === "fish-crow") {
    const perch = perchProjection(allocation.position, owned.member.actor.address.position);
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
              targetArea: frozenArea(allocation.position, PERCH_ARRIVAL_RADIUS_UNITS),
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

  if (owned.species === "snowy-egret") {
    const tidal = projectCoreEcologyTidalTable(patch, input.atTick);
    const egret = tidal?.snowyEgret;
    if (egret === null || egret === undefined || egret.actorId !== input.actorId) return null;
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
          allocation.position,
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
  const errors: string[] = [];
  const bySpecies = new Map<CoreWildlifeSpecies, CoreEcologySpeciesRuntimePolicy>();
  for (const policy of policies) {
    if (!isCoreEcologySpeciesRuntimePolicy(policy)) {
      errors.push("noncanonical-policy");
      continue;
    }
    if (bySpecies.has(policy.speciesId)) {
      errors.push(`${policy.speciesId}:duplicate-policy`);
      continue;
    }
    bySpecies.set(policy.speciesId, policy);
    if (
      policy.capabilities.includes("diurnal-activity")
      && !ACTIVITY_SPECIES.has(policy.speciesId)
    ) errors.push(`${policy.speciesId}:diurnal-activity-has-no-runtime-projection`);
  }
  for (const species of CORE_ECOLOGY_ACTIVITY_SPECIES) {
    const policy = bySpecies.get(species);
    if (policy === undefined) {
      errors.push(`${species}:missing-policy`);
      continue;
    }
    for (const capability of REQUIRED_COMMON_CAPABILITIES) {
      if (!policy.capabilities.includes(capability)) {
        errors.push(`${species}:missing-${capability}`);
      }
    }
    if (policy.identityForm !== "individual" || !policy.actorAddressable) {
      errors.push(`${species}:activity-requires-addressable-individual`);
    }
    if (
      species !== "snowy-egret"
      && policy.locomotionClass !== "aerial"
    ) {
      errors.push(`${species}:activity-requires-aerial-locomotion-class`);
    }
    if (species === "snowy-egret" && policy.locomotionClass !== "amphibious") {
      errors.push("snowy-egret:activity-requires-amphibious-locomotion-class");
    }
  }
  const crow = bySpecies.get("fish-crow");
  if (crow !== undefined) {
    if (!crow.capabilities.includes("perch")) errors.push("fish-crow:missing-perch");
    if (!crow.capabilities.includes("group-coordination")) {
      errors.push("fish-crow:missing-group-coordination");
    }
    if (crow.groupStableIdNamespace !== "CROW-FLOCK") {
      errors.push("fish-crow:missing-crow-flock-namespace");
    }
    if (crow.capabilities.includes("aerial-predator")) {
      errors.push("fish-crow:must-not-own-aerial-predator");
    }
  }
  const harrier = bySpecies.get("northern-harrier");
  if (harrier !== undefined) {
    if (!harrier.capabilities.includes("aerial-predator")) {
      errors.push("northern-harrier:missing-aerial-predator");
    }
    if (!harrier.capabilities.includes("small-prey-pursuit")) {
      errors.push("northern-harrier:missing-small-prey-pursuit");
    }
    if (!harrier.activitySignals.includes("low-quartering-flight")) {
      errors.push("northern-harrier:missing-low-quartering-signal");
    }
  }
  const egret = bySpecies.get("snowy-egret");
  if (egret !== undefined) {
    for (const capability of [
      "tidal-activity",
      "wading",
      "water-depth-response",
    ] as const) {
      if (!egret.capabilities.includes(capability)) {
        errors.push(`snowy-egret:missing-${capability}`);
      }
    }
    if (!egret.activitySignals.includes("wading-forage")) {
      errors.push("snowy-egret:missing-wading-forage-signal");
    }
    if (egret.capabilities.includes("aerial-predator")) {
      errors.push("snowy-egret:must-not-own-aerial-predator");
    }
  }
  return Object.freeze(errors.sort(compareText));
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
): CoreEcologyActivityProjection {
  return deepFreeze({
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
}

function currentAquaticActivityObservation(
  actor: OwnedActivityActor["member"]["actor"],
  atTick: number,
) {
  return [...actor.perception.beliefs]
    .filter((belief) => (
      belief.channel === "vision"
      && belief.perceivedClass === "aquatic-activity"
      && belief.subjectId === null
      && belief.identification === "classified"
      && belief.area.radiusUnits === 0
      && belief.lastObservedTick === atTick
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

function authenticatedHabitatAllocation(
  patch: CoreEcologyAggregatePatchState,
  population: CoreEcologyPopulationState,
  member: CoreEcologyPopulationMemberState,
): CoreEcologyHabitatAllocation | null {
  if (
    patch.derivation.kind !== "habitat-v4"
    && patch.derivation.kind !== "legacy-fixed-v1-with-habitat-v4"
    && patch.derivation.kind !== "habitat-v5"
    && patch.derivation.kind !== "legacy-fixed-v1-with-habitat-v5"
  ) return null;
  const analysis = patch.derivation.habitat.populations.find((candidate) => (
    candidate.species === population.species
    && candidate.populationKey === population.populationKey
    && candidate.representation === "individual-representatives"
  ));
  return analysis?.allocations.find(({ allocationOrdinal }) => (
    allocationOrdinal === member.populationOrdinal
  )) ?? null;
}

function runtimePolicyOwnsActivity(
  policy: CoreEcologySpeciesRuntimePolicy | null,
  species: CoreEcologyActivitySpecies,
): boolean {
  if (policy === null || policy.speciesId !== species) return false;
  if (!REQUIRED_COMMON_CAPABILITIES.every((capability) => (
    policy.capabilities.includes(capability)
  ))) return false;
  return species === "fish-crow"
    ? policy.capabilities.includes("perch")
      && policy.groupStableIdNamespace === "CROW-FLOCK"
    : species === "snowy-egret"
      ? policy.capabilities.includes("tidal-activity")
        && policy.capabilities.includes("wading")
        && policy.capabilities.includes("water-depth-response")
        && policy.activitySignals.includes("wading-forage")
      : policy.capabilities.includes("aerial-predator")
      && policy.capabilities.includes("small-prey-pursuit")
      && policy.activitySignals.includes("low-quartering-flight");
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

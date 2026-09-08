import {
  ACTOR_PERCEPTION_SCALE,
  type ActorBelief,
} from "../sim/actorPerception";
import { hashCanonical } from "../sim/util";
import {
  canonicalizeCoreWildlifeActorState,
  replaceCoreWildlifeActorPhysiology,
  type CoreWildlifeActorState,
} from "./coreWildlifeActor";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  isWorldPosition,
  worldPositionDelta,
  type WorldPosition,
} from "./worldPosition";

/**
 * First species-neutral harmful-contact boundary. Population conservation,
 * carcasses, feeding, and presentation remain the responsibility of later
 * transactional owners; this kernel changes only one current actor's health.
 */
export const CORE_WILDLIFE_MORTALITY_VERSION = 1 as const;
export const CORE_WILDLIFE_MAX_CONTACT_RADIUS_UNITS =
  WORLD_POSITION_UNITS_PER_TILE;
export const CORE_WILDLIFE_MAX_CONTACT_DAMAGE_UNITS =
  ACTOR_PERCEPTION_SCALE;

export const CORE_WILDLIFE_MORTALITY_CAUSES = Object.freeze([
  "predator-contact",
] as const);

export type CoreWildlifeMortalityCause =
  (typeof CORE_WILDLIFE_MORTALITY_CAUSES)[number];
export type CoreWildlifeMortalityOutcome = "injured" | "death";

export interface ResolveCoreWildlifePredatorContactInput {
  /** Both actors must be canonical, materialized current-tick states. */
  readonly attacker: CoreWildlifeActorState;
  readonly target: CoreWildlifeActorState;
  readonly atTick: number;
  /** Collision owner's exact combined body reach, never a detection radius. */
  readonly contactRadiusUnits: number;
  /** Data-driven impact amount on the common fixed-point physiology scale. */
  readonly damageUnits: number;
  readonly cause: "predator-contact";
}

/** Immutable provenance for one applied health transition. */
export interface CoreWildlifeMortalityEvent {
  readonly version: typeof CORE_WILDLIFE_MORTALITY_VERSION;
  readonly eventId: string;
  readonly atTick: number;
  readonly cause: CoreWildlifeMortalityCause;
  readonly causeReferenceId: string;
  readonly observationId: string;
  readonly attackerId: string;
  readonly victimId: string;
  readonly attackerPosition: WorldPosition;
  readonly victimPosition: WorldPosition;
  readonly contactRadiusUnits: number;
  readonly contactDistanceSquaredUnits: number;
  readonly damageUnits: number;
  readonly healthBefore: number;
  readonly healthAfter: number;
  readonly outcome: CoreWildlifeMortalityOutcome;
}

export interface CoreWildlifeMortalityResult {
  /** Same persistent target identity with only authoritative physiology replaced. */
  readonly target: CoreWildlifeActorState;
  readonly event: CoreWildlifeMortalityEvent;
}

/** Strict save-boundary validator for an already-resolved named harm event. */
export function canonicalizeCoreWildlifeMortalityEvent(
  value: unknown,
): CoreWildlifeMortalityEvent | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "atTick",
    "attackerId",
    "attackerPosition",
    "cause",
    "causeReferenceId",
    "contactDistanceSquaredUnits",
    "contactRadiusUnits",
    "damageUnits",
    "eventId",
    "healthAfter",
    "healthBefore",
    "observationId",
    "outcome",
    "version",
    "victimId",
    "victimPosition",
  ])) return null;
  if (
    value.version !== CORE_WILDLIFE_MORTALITY_VERSION
    || !nonnegativeSafeInteger(value.atTick)
    || value.cause !== "predator-contact"
    || !validReference(value.causeReferenceId)
    || !validReference(value.observationId)
    || value.causeReferenceId !== value.observationId
    || !validReference(value.attackerId)
    || !validReference(value.victimId)
    || value.attackerId === value.victimId
    || !isWorldPosition(value.attackerPosition)
    || !isWorldPosition(value.victimPosition)
    || !positiveSafeInteger(value.contactRadiusUnits)
    || value.contactRadiusUnits > CORE_WILDLIFE_MAX_CONTACT_RADIUS_UNITS
    || !nonnegativeSafeInteger(value.contactDistanceSquaredUnits)
    || value.contactDistanceSquaredUnits
      > value.contactRadiusUnits * value.contactRadiusUnits
    || !positiveSafeInteger(value.damageUnits)
    || value.damageUnits > CORE_WILDLIFE_MAX_CONTACT_DAMAGE_UNITS
    || !positiveSafeInteger(value.healthBefore)
    || value.healthBefore > ACTOR_PERCEPTION_SCALE
    || !nonnegativeSafeInteger(value.healthAfter)
    || value.healthAfter > ACTOR_PERCEPTION_SCALE
    || value.healthAfter !== Math.max(0, value.healthBefore - value.damageUnits)
    || value.outcome !== (value.healthAfter === 0 ? "death" : "injured")
  ) return null;
  const exactDistance = exactContactDistanceSquared(
    value.attackerPosition,
    value.victimPosition,
    value.contactRadiusUnits,
  );
  if (exactDistance === null || exactDistance !== value.contactDistanceSquaredUnits) return null;
  const eventBody = deepFreeze({
    version: CORE_WILDLIFE_MORTALITY_VERSION,
    atTick: value.atTick,
    cause: "predator-contact" as const,
    causeReferenceId: value.causeReferenceId,
    observationId: value.observationId,
    attackerId: value.attackerId,
    victimId: value.victimId,
    attackerPosition: clonePosition(value.attackerPosition),
    victimPosition: clonePosition(value.victimPosition),
    contactRadiusUnits: value.contactRadiusUnits,
    contactDistanceSquaredUnits: value.contactDistanceSquaredUnits,
    damageUnits: value.damageUnits,
    healthBefore: value.healthBefore,
    healthAfter: value.healthAfter,
    outcome: value.healthAfter === 0 ? "death" as const : "injured" as const,
  });
  if (value.eventId !== `wildlife-harm:${hashCanonical(eventBody)}`) return null;
  return deepFreeze({ ...eventBody, eventId: value.eventId });
}

/**
 * Resolve one already-routed predator contact without detecting, pursuing, or
 * selecting prey on the caller's behalf. Every required world fact must agree:
 * current direct identified sight, current pursuit/resource custody, exact
 * target position, exact physical reach, and positive living physiology.
 * Invalid or stale claims fail closed and produce no partial transition.
 */
export function resolveCoreWildlifePredatorContact(
  value: unknown,
): CoreWildlifeMortalityResult | null {
  const input = canonicalInput(value);
  if (input === null) return null;

  const { attacker, target } = input;
  const intent = attacker.intent;
  const resource = intent.resourceReference;
  if (
    attacker.identity.stableId === target.identity.stableId
    || attacker.condition.health === 0
    || target.condition.health === 0
    || attacker.updatedAtTick !== input.atTick
    || target.updatedAtTick !== input.atTick
    || attacker.perception.tick !== input.atTick
    || intent.kind !== "pursue"
    || intent.cause.kind !== "perception"
    || intent.expiresAtTick === null
    || intent.expiresAtTick <= input.atTick
    || intent.focusObservationId === null
    || resource === null
    || resource.sourceKind !== "living-actor"
    || resource.foodClass !== "live-prey"
    || resource.resourceId !== target.identity.stableId
    || resource.observationId !== intent.focusObservationId
    || intent.cause.referenceId !== intent.focusObservationId
  ) return null;

  const direct = currentDirectTargetBelief(attacker, target);
  if (direct === null) return null;

  const contactDistanceSquaredUnits = exactContactDistanceSquared(
    attacker.address.position,
    target.address.position,
    input.contactRadiusUnits,
  );
  if (contactDistanceSquaredUnits === null) return null;

  const healthBefore = target.condition.health;
  const healthAfter = Math.max(0, healthBefore - input.damageUnits);
  const outcome: CoreWildlifeMortalityOutcome = healthAfter === 0 ? "death" : "injured";
  let revisedTarget: CoreWildlifeActorState;
  try {
    revisedTarget = replaceCoreWildlifeActorPhysiology(target, {
      atTick: input.atTick,
      needs: target.needs,
      condition: {
        ...target.condition,
        health: healthAfter,
      },
    });
  } catch {
    return null;
  }

  const eventBody = deepFreeze({
    version: CORE_WILDLIFE_MORTALITY_VERSION,
    atTick: input.atTick,
    cause: input.cause,
    causeReferenceId: intent.cause.referenceId,
    observationId: direct.sourceObservationId,
    attackerId: attacker.identity.stableId,
    victimId: target.identity.stableId,
    attackerPosition: clonePosition(attacker.address.position),
    victimPosition: clonePosition(target.address.position),
    contactRadiusUnits: input.contactRadiusUnits,
    contactDistanceSquaredUnits,
    damageUnits: input.damageUnits,
    healthBefore,
    healthAfter,
    outcome,
  });
  const event = deepFreeze({
    ...eventBody,
    eventId: `wildlife-harm:${hashCanonical(eventBody)}`,
  });
  return deepFreeze({ target: revisedTarget, event });
}

function canonicalInput(
  value: unknown,
): ResolveCoreWildlifePredatorContactInput | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "atTick",
    "attacker",
    "cause",
    "contactRadiusUnits",
    "damageUnits",
    "target",
  ])) return null;
  const attacker = canonicalizeCoreWildlifeActorState(value.attacker);
  const target = canonicalizeCoreWildlifeActorState(value.target);
  if (
    attacker === null
    || target === null
    || !nonnegativeSafeInteger(value.atTick)
    || !positiveSafeInteger(value.contactRadiusUnits)
    || value.contactRadiusUnits > CORE_WILDLIFE_MAX_CONTACT_RADIUS_UNITS
    || !positiveSafeInteger(value.damageUnits)
    || value.damageUnits > CORE_WILDLIFE_MAX_CONTACT_DAMAGE_UNITS
    || value.cause !== "predator-contact"
  ) return null;
  return Object.freeze({
    attacker,
    target,
    atTick: value.atTick,
    contactRadiusUnits: value.contactRadiusUnits,
    damageUnits: value.damageUnits,
    cause: value.cause,
  });
}

function currentDirectTargetBelief(
  attacker: CoreWildlifeActorState,
  target: CoreWildlifeActorState,
): ActorBelief | null {
  const observationId = attacker.intent.focusObservationId;
  if (observationId === null) return null;
  const belief = attacker.perception.beliefs.find(({ sourceObservationId }) => (
    sourceObservationId === observationId
  ));
  if (
    belief === undefined
    || belief.lastObservedTick !== attacker.updatedAtTick
    || belief.channel !== "vision"
    || belief.identification !== "identified"
    || belief.subjectId !== target.identity.stableId
    || belief.perceivedClass !== "live-prey"
    || belief.area.radiusUnits !== 0
    || belief.confidence === 0
    || !sameWorldPosition(belief.area.center, target.address.position)
  ) return null;
  return belief;
}

function exactContactDistanceSquared(
  attacker: WorldPosition,
  target: WorldPosition,
  radiusUnits: number,
): number | null {
  let delta;
  try {
    delta = worldPositionDelta(attacker, target);
  } catch {
    return null;
  }
  if (Math.abs(delta.x) > radiusUnits || Math.abs(delta.y) > radiusUnits) return null;
  const distanceSquared = delta.x * delta.x + delta.y * delta.y;
  return distanceSquared <= radiusUnits * radiusUnits ? distanceSquared : null;
}

function sameWorldPosition(left: WorldPosition, right: WorldPosition): boolean {
  return left.region.x === right.region.x
    && left.region.y === right.region.y
    && left.localX === right.localX
    && left.localY === right.localY;
}

function clonePosition(position: WorldPosition): WorldPosition {
  return deepFreeze({
    region: { x: position.region.x, y: position.region.y },
    localX: position.localX,
    localY: position.localY,
  });
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
}

function validReference(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 256
    && /^[A-Za-z0-9][A-Za-z0-9:._/-]*$/u.test(value);
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const canonicalExpected = [...expected].sort(compareText);
  return actual.length === canonicalExpected.length
    && actual.every((key, index) => key === canonicalExpected[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

import {
  ACTOR_PERCEPTION_SCALE,
  ACTOR_PERCEPTION_VERSION,
  canonicalizeActorObservations,
  canonicalizeActorPerceptionState,
  createActorPerceptionState,
  queryActorAttention,
  stepActorPerception,
  type ActorObservation,
  type ActorPerceptionState,
  type AgedActorBelief,
} from "../sim/actorPerception";
import {
  CORE_WILDLIFE_FOOD_CLASSES,
  CORE_WILDLIFE_SPECIES,
  canonicalizeCoreWildlifeIdentity,
  generateCoreWildlifeIdentity,
  getCoreWildlifeProfile,
  type CoreWildlifeFoodClass,
  type CoreWildlifeIdentity,
  type CoreWildlifeIdentityGenerationInput,
  type CoreWildlifeSpecies,
} from "../sim/coreWildlifeIdentity";
import { stableStringify } from "../sim/util";
import {
  createLivingActorAddress,
  isLivingActorAddress,
  type LivingActorAddress,
} from "./livingActor";
import { isWorldPosition, type WorldPosition } from "./worldPosition";

export const CORE_WILDLIFE_ACTOR_VERSION = 1 as const;
export const CORE_WILDLIFE_DECISION_VERSION = 1 as const;
export const CORE_WILDLIFE_EVENT_VERSION = 1 as const;
export const CORE_WILDLIFE_ENVIRONMENTAL_EVIDENCE_VERSION = 1 as const;
export const CORE_WILDLIFE_MEMORY_CAP = 16 as const;
export const CORE_WILDLIFE_MAX_FOOD_OPPORTUNITIES = 24 as const;
export const CORE_WILDLIFE_ACTOR_MAX_SERIALIZED_BYTES = 384 * 1_024;

/** Safety-first tie order; policy rules still decide whether an intent is eligible. */
export const CORE_WILDLIFE_INTENTS = Object.freeze([
  "disengage",
  "flee",
  "alarm",
  "retreat",
  "guard",
  "scavenge",
  "forage",
  "pursue",
  "rest",
  "observe",
] as const);

export type CoreWildlifeIntentKind = (typeof CORE_WILDLIFE_INTENTS)[number];
export type CoreWildlifeIntentCauseKind =
  | "perception"
  | "contact"
  | "need"
  | "condition"
  | "prior-intent";
export type CoreWildlifeMemoryKind =
  | "alarm"
  | "threat"
  | "food"
  | "pursuit"
  | "guard"
  | "disengagement"
  | "weather";
export type CoreWildlifeFoodSourceKind =
  | "natural-forage"
  | "physical-item"
  | "living-actor";

export interface CoreWildlifeNeeds {
  /** All needs are pressure from satisfied (0) to urgent (1,000,000). */
  readonly hunger: number;
  readonly safety: number;
  readonly rest: number;
}

export interface CoreWildlifeCondition {
  readonly health: number;
  readonly exhaustion: number;
  readonly stress: number;
}

export interface CoreWildlifeResourceReference {
  readonly resourceId: string;
  readonly observationId: string;
  readonly foodClass: CoreWildlifeFoodClass;
  readonly sourceKind: CoreWildlifeFoodSourceKind;
  /** Snapshot used for a request; this module never changes authoritative units. */
  readonly observedAvailableUnits: number;
}

export interface CoreWildlifeIntentCause {
  readonly kind: CoreWildlifeIntentCauseKind;
  /** Lawful observation, need, condition, contact, or prior-intent reference. */
  readonly referenceId: string;
}

export interface CoreWildlifeIntentState {
  readonly kind: CoreWildlifeIntentKind;
  readonly cause: CoreWildlifeIntentCause;
  readonly focusObservationId: string | null;
  readonly resourceReference: CoreWildlifeResourceReference | null;
  readonly enteredAtTick: number;
  readonly expiresAtTick: number | null;
}

export interface CoreWildlifeMemory {
  readonly eventId: string;
  readonly kind: CoreWildlifeMemoryKind;
  readonly referenceId: string;
  readonly observationId: string | null;
  readonly atTick: number;
  /**
   * A physical trace owned by this bounded record's lifecycle. Projection may
   * disclose the trace itself, never the animal's private memory or cause.
   */
  readonly environmentalEvidence?: CoreWildlifeEnvironmentalEvidence;
}

/** One bounded, saved physical sign produced by an individual wildlife actor. */
export interface CoreWildlifeEnvironmentalEvidence {
  readonly version: typeof CORE_WILDLIFE_ENVIRONMENTAL_EVIDENCE_VERSION;
  readonly evidenceId: string;
  readonly kind: "wet-tracks";
  readonly position: WorldPosition;
  readonly createdAtTick: number;
  readonly strength: number;
  readonly itemConsumption: "none";
  readonly disclosure: "direct-observation-required";
}

export interface CoreWildlifeActorState {
  readonly version: typeof CORE_WILDLIFE_ACTOR_VERSION;
  readonly updatedAtTick: number;
  readonly address: LivingActorAddress & {
    readonly species: CoreWildlifeSpecies;
    readonly persistence: "regional" | "promoted";
  };
  /** Immutable generation record; physiology and cognition never live inside it. */
  readonly identity: CoreWildlifeIdentity;
  readonly needs: CoreWildlifeNeeds;
  readonly condition: CoreWildlifeCondition;
  readonly perception: ActorPerceptionState;
  readonly intent: CoreWildlifeIntentState;
  readonly memories: readonly CoreWildlifeMemory[];
}

export interface CreateCoreWildlifeActorInput extends CoreWildlifeIdentityGenerationInput {
  readonly position: WorldPosition;
  readonly heading?: number;
  readonly tick?: number;
}

export interface CoreWildlifeFoodOpportunity {
  readonly resourceId: string;
  /** Must identify a belief actually accepted by this actor. */
  readonly observationId: string;
  readonly foodClass: CoreWildlifeFoodClass;
  readonly sourceKind: CoreWildlifeFoodSourceKind;
  readonly availableUnits: number;
  readonly nutrition: number;
  readonly effort: number;
  readonly risk: number;
  readonly competition: number;
  readonly directlyConfirmed: boolean;
  readonly accessible: boolean;
}

export type CoreWildlifeActionAccessibility = Readonly<
  Record<CoreWildlifeIntentKind, boolean>
>;

export const CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE: CoreWildlifeActionAccessibility =
  Object.freeze(Object.fromEntries(
    CORE_WILDLIFE_INTENTS.map((intent) => [intent, true]),
  ) as unknown as Record<CoreWildlifeIntentKind, boolean>);

export interface CoreWildlifeActorStepInput {
  readonly tick: number;
  readonly observations: readonly ActorObservation[];
  readonly foodOpportunities: readonly CoreWildlifeFoodOpportunity[];
  readonly accessibility: CoreWildlifeActionAccessibility;
}

export interface CoreWildlifeDecision {
  readonly version: typeof CORE_WILDLIFE_DECISION_VERSION;
  readonly tick: number;
  readonly intent: CoreWildlifeIntentKind;
  readonly cause: CoreWildlifeIntentCause;
  readonly focusObservationId: string | null;
  readonly resourceReference: CoreWildlifeResourceReference | null;
  readonly enteredAtTick: number;
  readonly expiresAtTick: number | null;
}

export interface CoreWildlifeCausalEvent {
  readonly version: typeof CORE_WILDLIFE_EVENT_VERSION;
  readonly eventId: string;
  readonly atTick: number;
  readonly actorId: string;
  readonly species: CoreWildlifeSpecies;
  readonly kind: CoreWildlifeIntentKind;
  readonly causeReferenceId: string;
  readonly observationId: string | null;
  readonly resourceReference: CoreWildlifeResourceReference | null;
  readonly position: WorldPosition;
}

/** Proposal only. The authoritative item/carcass/forage owner resolves it transactionally. */
export interface CoreWildlifeResourceClaim {
  readonly eventId: string;
  readonly actorId: string;
  readonly resourceId: string;
  readonly foodClass: CoreWildlifeFoodClass;
  readonly observedAvailableUnits: number;
  readonly requestedUnits: 1;
}

export interface CoreWildlifeActorStepResult {
  readonly actor: CoreWildlifeActorState;
  readonly decision: CoreWildlifeDecision;
  readonly event: CoreWildlifeCausalEvent;
  readonly resourceClaims: readonly CoreWildlifeResourceClaim[];
}

export interface ReplaceCoreWildlifePhysiologyInput {
  readonly atTick: number;
  readonly needs: CoreWildlifeNeeds;
  readonly condition: CoreWildlifeCondition;
}

export interface RepositionCoreWildlifeActorInput {
  readonly atTick: number;
  readonly position: WorldPosition;
  /** Fixed-point turn in [0, 1,000,000), validated by LivingActorAddress. */
  readonly heading: number;
}

export interface AdvanceCoreWildlifeActorCoarseInput {
  readonly atTick: number;
}

const UTF8_ENCODER = new TextEncoder();
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/u;
const THREAT_CLASSES = new Set([
  "threat",
  "predator",
  "large-predator",
  "hostile-human",
  "danger-sound",
]);
const HUMAN_CLASSES = new Set(["human", "porter", "unknown-human", "human-voice"]);
const ALARM_CLASSES = new Set(["alarm-call", "animal-alarm", "herd-alarm"]);
const COMPETITOR_CLASSES = new Set(["food-competitor", "competitor"]);
const RAIN_CLASSES = new Set(["rain-exposure"]);
const FOOD_SOURCES = new Set<string>(["natural-forage", "physical-item", "living-actor"]);
const INTENTS = new Set<string>(CORE_WILDLIFE_INTENTS);
const MEMORY_KINDS = new Set<string>([
  "alarm",
  "threat",
  "food",
  "pursuit",
  "guard",
  "disengagement",
  "weather",
]);
const CAUSE_KINDS = new Set<string>([
  "perception",
  "contact",
  "need",
  "condition",
  "prior-intent",
]);
const FOOD_CLASSES = new Set<string>(CORE_WILDLIFE_FOOD_CLASSES);
const TEMPORARY_INTENT_DURATION: Readonly<Record<CoreWildlifeIntentKind, number | null>> = {
  disengage: 3,
  flee: 4,
  alarm: 1,
  retreat: 4,
  guard: 5,
  scavenge: 3,
  forage: 3,
  pursue: null,
  rest: 5,
  observe: null,
};

export function createCoreWildlifeActorState(
  input: CreateCoreWildlifeActorInput,
): CoreWildlifeActorState {
  if (!plainRecord(input) || !isWorldPosition(input.position)) {
    throw new TypeError("Core wildlife creation requires a canonical segmented position");
  }
  const tick = input.tick ?? 0;
  if (!nonnegativeSafeInteger(tick) || tick > Number.MAX_SAFE_INTEGER - 64) {
    throw new RangeError("Core wildlife creation tick is outside the schedulable range");
  }
  const identity = generateCoreWildlifeIdentity(input);
  const state = {
    version: CORE_WILDLIFE_ACTOR_VERSION,
    updatedAtTick: tick,
    address: createLivingActorAddress({
      actorId: identity.stableId,
      species: identity.species,
      position: input.position,
      ...(input.heading === undefined ? {} : { heading: input.heading }),
      persistence: "regional",
    }),
    identity,
    needs: initialNeeds(identity),
    condition: {
      health: ACTOR_PERCEPTION_SCALE,
      exhaustion: 0,
      stress: 0,
    },
    perception: createActorPerceptionState(identity.stableId, tick),
    intent: {
      kind: "observe",
      cause: { kind: "condition", referenceId: "condition:neutral-watch" },
      focusObservationId: null,
      resourceReference: null,
      enteredAtTick: tick,
      expiresAtTick: null,
    },
    memories: [],
  };
  const canonical = canonicalizeCoreWildlifeActorState(state);
  if (canonical === null) throw new Error("Generated core wildlife actor failed validation");
  return canonical;
}

export function canonicalizeCoreWildlifeActorState(
  value: unknown,
): CoreWildlifeActorState | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "address",
    "condition",
    "identity",
    "intent",
    "memories",
    "needs",
    "perception",
    "updatedAtTick",
    "version",
  ])) return null;
  if (value.version !== CORE_WILDLIFE_ACTOR_VERSION || !nonnegativeSafeInteger(value.updatedAtTick)) {
    return null;
  }
  const identity = canonicalizeCoreWildlifeIdentity(value.identity);
  if (identity === null || !isLivingActorAddress(value.address)) return null;
  const rawAddress = value.address;
  if (
    rawAddress.actorId !== identity.stableId
    || rawAddress.species !== identity.species
    || (rawAddress.persistence !== "regional" && rawAddress.persistence !== "promoted")
  ) return null;
  const needs = canonicalNeeds(value.needs);
  const condition = canonicalCondition(value.condition);
  const perception = canonicalizeActorPerceptionState(value.perception);
  const intent = canonicalIntent(value.intent, value.updatedAtTick);
  const memories = canonicalMemories(
    value.memories,
    value.updatedAtTick,
    identity.species,
  );
  if (
    needs === null
    || condition === null
    || perception === null
    || perception.version !== ACTOR_PERCEPTION_VERSION
    || perception.actorId !== identity.stableId
    || perception.tick > value.updatedAtTick
    || intent === null
    || memories === null
  ) return null;
  return deepFreeze({
    version: CORE_WILDLIFE_ACTOR_VERSION,
    updatedAtTick: value.updatedAtTick,
    address: createLivingActorAddress(rawAddress) as CoreWildlifeActorState["address"],
    identity,
    needs,
    condition,
    perception,
    intent,
    memories,
  });
}

export function serializeCoreWildlifeActorState(value: unknown): string {
  const state = requireActor(value);
  const text = stableStringify(state);
  if (UTF8_ENCODER.encode(text).byteLength > CORE_WILDLIFE_ACTOR_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Core wildlife actor exceeds its save budget");
  }
  return text;
}

export function deserializeCoreWildlifeActorState(text: unknown): CoreWildlifeActorState | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || UTF8_ENCODER.encode(text).byteLength > CORE_WILDLIFE_ACTOR_MAX_SERIALIZED_BYTES
  ) return null;
  try {
    const state = canonicalizeCoreWildlifeActorState(JSON.parse(text) as unknown);
    return state !== null && stableStringify(state) === text ? state : null;
  } catch {
    return null;
  }
}

export function replaceCoreWildlifeActorPhysiology(
  value: unknown,
  replacement: ReplaceCoreWildlifePhysiologyInput,
): CoreWildlifeActorState {
  const state = requireActor(value);
  if (
    !plainRecord(replacement)
    || !exactKeys(replacement, ["atTick", "condition", "needs"])
    || !nonnegativeSafeInteger(replacement.atTick)
    || replacement.atTick < state.updatedAtTick
  ) throw new RangeError("Core wildlife physiology replacement is malformed or stale");
  const needs = canonicalNeeds(replacement.needs);
  const condition = canonicalCondition(replacement.condition);
  if (needs === null || condition === null) {
    throw new RangeError("Core wildlife physiology values must be fixed-point units");
  }
  return rebuildActor(state, {
    updatedAtTick: replacement.atTick,
    needs,
    condition,
  });
}

/**
 * Applies an already-resolved locomotion result. Callers own pathing and signed
 * region normalization; this boundary only accepts a canonical final address.
 */
export function repositionCoreWildlifeActor(
  value: unknown,
  move: RepositionCoreWildlifeActorInput,
): CoreWildlifeActorState {
  const state = requireActor(value);
  if (
    !plainRecord(move)
    || !exactKeys(move, ["atTick", "heading", "position"])
    || !nonnegativeSafeInteger(move.atTick)
    || move.atTick < state.updatedAtTick
    || !isWorldPosition(move.position)
  ) throw new RangeError("Core wildlife movement requires an ordered canonical segmented position");
  let address: CoreWildlifeActorState["address"];
  try {
    address = createLivingActorAddress({
      ...state.address,
      position: move.position,
      heading: move.heading,
    }) as CoreWildlifeActorState["address"];
  } catch {
    throw new RangeError("Core wildlife movement heading or address is malformed");
  }
  return rebuildActor(state, {
    updatedAtTick: move.atTick,
    address,
  });
}

/**
 * Advance an unloaded actor without inventing observations, targets, food, or
 * movement.  A temporary intent is charged only until its already-authoritative
 * expiry; the rest of the hidden interval uses neutral observation physiology.
 * This prevents rematerialization from retroactively applying a newly selected
 * full-simulation intent across the entire time the actor was absent.
 */
export function advanceCoreWildlifeActorCoarse(
  value: unknown,
  input: AdvanceCoreWildlifeActorCoarseInput,
): CoreWildlifeActorState {
  const state = requireActor(value);
  if (
    !plainRecord(input)
    || !exactKeys(input, ["atTick"])
    || !nonnegativeSafeInteger(input.atTick)
    || input.atTick <= state.updatedAtTick
    || input.atTick > Number.MAX_SAFE_INTEGER - 64
  ) throw new RangeError("Core wildlife coarse advance is malformed or stale");

  const elapsed = input.atTick - state.updatedAtTick;
  const expiresAt = state.intent.expiresAtTick;
  const intentElapsed = expiresAt === null
    ? elapsed
    : Math.max(0, Math.min(elapsed, expiresAt - state.updatedAtTick));
  const neutralElapsed = elapsed - intentElapsed;
  let needs = ageNeeds(state.needs, state.intent.kind, intentElapsed);
  let condition = ageCondition(state.condition, state.intent.kind, intentElapsed);
  if (neutralElapsed > 0) {
    needs = ageNeeds(needs, "observe", neutralElapsed);
    condition = ageCondition(condition, "observe", neutralElapsed);
  }
  const perception = stepActorPerception(state.perception, {
    tick: input.atTick,
    observations: [],
  });
  if (perception === null) {
    throw new Error("Core wildlife coarse cognition could not age to the requested tick");
  }
  const intent = expiresAt !== null && expiresAt <= input.atTick
    ? {
        kind: "observe" as const,
        cause: { kind: "condition" as const, referenceId: "condition:coarse-watch" },
        focusObservationId: null,
        resourceReference: null,
        enteredAtTick: input.atTick,
        expiresAtTick: null,
      }
    : state.intent;
  return rebuildActor(state, {
    updatedAtTick: input.atTick,
    perception,
    needs,
    condition,
    intent,
  });
}

/**
 * Pure cognition-and-policy step. All world facts arrive as accepted actor
 * observations or direct opportunity snapshots; no registry or scene is read.
 */
export function stepCoreWildlifeActor(
  value: unknown,
  stepValue: unknown,
): CoreWildlifeActorStepResult | null {
  const state = canonicalizeCoreWildlifeActorState(value);
  if (state === null) return null;
  const step = canonicalStepInput(stepValue, state);
  if (step === null) return null;
  const perception = stepActorPerception(state.perception, {
    tick: step.tick,
    observations: step.observations,
  });
  if (perception === null || perception.tick !== step.tick) return null;
  const opportunities = canonicalFoodOpportunities(step.foodOpportunities, perception);
  if (opportunities === null) return null;

  const decision = decide(state, perception, opportunities, step);
  const elapsed = step.tick - state.updatedAtTick;
  const needs = ageNeeds(state.needs, decision.intent, elapsed);
  const condition = ageCondition(state.condition, decision.intent, elapsed);
  const event = createEvent(state, decision);
  const memories = retainMemories([
    ...state.memories,
    ...memoryForEvent(state, event, perception),
  ]);
  const actor = rebuildActor(state, {
    updatedAtTick: step.tick,
    perception,
    needs,
    condition,
    intent: intentStateFromDecision(decision),
    memories,
  });
  const resourceClaims = createResourceClaims(event);
  return deepFreeze({ actor, decision, event, resourceClaims });
}

function decide(
  state: CoreWildlifeActorState,
  perception: ActorPerceptionState,
  opportunities: readonly CoreWildlifeFoodOpportunity[],
  step: CoreWildlifeActorStepInput,
): CoreWildlifeDecision {
  const profile = getCoreWildlifeProfile(state.identity.species);
  const attention = queryActorAttention(perception);
  const threat = strongestBelief(attention, THREAT_CLASSES);
  const human = strongestBelief(attention, HUMAN_CLASSES);
  const alarm = strongestBelief(attention, ALARM_CLASSES);
  const competitor = strongestBelief(attention, COMPETITOR_CLASSES);
  const rain = strongestBelief(attention, RAIN_CLASSES);
  const effectiveThreat = pressureFor(state, threat);
  const effectiveHuman = pressureFor(state, human);
  const effectiveAlarm = pressureFor(state, alarm);

  if (
    state.intent.kind === "pursue"
    && state.intent.expiresAtTick !== null
    && step.tick >= state.intent.expiresAtTick
  ) {
    return decisionFor(state, step.tick, "disengage", {
      kind: "prior-intent",
      referenceId: state.intent.resourceReference?.resourceId ?? "intent:pursue",
    }, state.intent.focusObservationId, state.intent.resourceReference);
  }

  const threatReference = threat?.sourceObservationId ?? null;
  const alarmReady = profile.roles.includes("alarm-source")
    && threat !== null
    && effectiveThreat >= profile.behavior.alarmThreshold
    && !recentMemory(state, "alarm", threat.sourceObservationId, step.tick, 4);
  if (alarmReady && step.accessibility.alarm) {
    return decisionFor(state, step.tick, "alarm", {
      kind: "perception",
      referenceId: threat.sourceObservationId,
    }, threat.sourceObservationId, null);
  }

  const strongestEscape = selectStronger(threat, alarm);
  if (
    strongestEscape !== null
    && Math.max(effectiveThreat, effectiveAlarm) >= profile.behavior.fleeThreshold
    && step.accessibility.flee
  ) {
    return decisionFor(state, step.tick, "flee", {
      kind: "perception",
      referenceId: strongestEscape.sourceObservationId,
    }, strongestEscape.sourceObservationId, null);
  }

  const conditionPressure = Math.max(state.needs.safety, state.condition.stress);
  const retreatBelief = selectStronger(threat, human);
  if (
    Math.max(conditionPressure, effectiveThreat, effectiveHuman) >= profile.behavior.retreatThreshold
    && step.accessibility.retreat
  ) {
    return decisionFor(state, step.tick, "retreat", retreatBelief === null
      ? { kind: "condition", referenceId: "condition:safety-pressure" }
      : { kind: "perception", referenceId: retreatBelief.sourceObservationId },
    retreatBelief?.sourceObservationId ?? null, null);
  }

  if (
    state.identity.species === "domestic-cat"
    && rain !== null
    && pressureFor(state, rain) >= profile.behavior.retreatThreshold
    && step.accessibility.retreat
  ) {
    return decisionFor(state, step.tick, "retreat", {
      kind: "perception",
      referenceId: rain.sourceObservationId,
    }, rain.sourceObservationId, null);
  }

  const selectedFood = selectFoodOpportunity(state, opportunities, step.tick);
  if (selectedFood !== null && state.needs.hunger >= profile.behavior.forageThreshold) {
    const reference = resourceReference(selectedFood);
    const competition = Math.max(selectedFood.competition, beliefStrength(competitor));
    if (
      competition >= profile.behavior.guardThreshold
      && profile.behavior.guardThreshold < ACTOR_PERCEPTION_SCALE
      && step.accessibility.guard
    ) {
      return decisionFor(state, step.tick, "guard", {
        kind: "contact",
        referenceId: selectedFood.resourceId,
      }, selectedFood.observationId, reference);
    }
    if (
      selectedFood.foodClass === "live-prey"
      && selectedFood.sourceKind === "living-actor"
      && profile.behavior.maximumPursuitTicks > 0
      && step.accessibility.pursue
    ) {
      return decisionFor(state, step.tick, "pursue", {
        kind: "perception",
        referenceId: selectedFood.observationId,
      }, selectedFood.observationId, reference);
    }
    const scavenging = (selectedFood.foodClass === "carrion"
      || selectedFood.foodClass === "exposed-food")
      && profile.roles.includes("scavenger");
    const intent: CoreWildlifeIntentKind = scavenging ? "scavenge" : "forage";
    if (step.accessibility[intent]) {
      return decisionFor(state, step.tick, intent, {
        kind: "contact",
        referenceId: selectedFood.resourceId,
      }, selectedFood.observationId, reference);
    }
  }

  if (state.needs.rest >= 420_000 && step.accessibility.rest) {
    return decisionFor(state, step.tick, "rest", {
      kind: "need",
      referenceId: "need:rest",
    }, null, null);
  }
  return decisionFor(state, step.tick, "observe", threatReference === null
    ? { kind: "condition", referenceId: "condition:neutral-watch" }
    : { kind: "perception", referenceId: threatReference }, threatReference, null);
}

function decisionFor(
  state: CoreWildlifeActorState,
  tick: number,
  intent: CoreWildlifeIntentKind,
  cause: CoreWildlifeIntentCause,
  focusObservationId: string | null,
  resource: CoreWildlifeResourceReference | null,
): CoreWildlifeDecision {
  const profile = getCoreWildlifeProfile(state.identity.species);
  const samePursuit = intent === "pursue"
    && state.intent.kind === "pursue"
    && state.intent.resourceReference?.resourceId === resource?.resourceId
    && state.intent.expiresAtTick !== null;
  const duration = intent === "pursue"
    ? profile.behavior.maximumPursuitTicks
    : TEMPORARY_INTENT_DURATION[intent];
  const enteredAtTick = samePursuit ? state.intent.enteredAtTick : tick;
  const expiresAtTick = samePursuit
    ? state.intent.expiresAtTick
    : duration === null ? null : safeFutureTick(tick, duration);
  return deepFreeze({
    version: CORE_WILDLIFE_DECISION_VERSION,
    tick,
    intent,
    cause,
    focusObservationId,
    resourceReference: resource,
    enteredAtTick,
    expiresAtTick,
  });
}

function intentStateFromDecision(decision: CoreWildlifeDecision): CoreWildlifeIntentState {
  return deepFreeze({
    kind: decision.intent,
    cause: decision.cause,
    focusObservationId: decision.focusObservationId,
    resourceReference: decision.resourceReference,
    enteredAtTick: decision.enteredAtTick,
    expiresAtTick: decision.expiresAtTick,
  });
}

function canonicalStepInput(
  value: unknown,
  state: CoreWildlifeActorState,
): CoreWildlifeActorStepInput | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "accessibility",
    "foodOpportunities",
    "observations",
    "tick",
  ])) return null;
  if (
    !nonnegativeSafeInteger(value.tick)
    || value.tick <= state.updatedAtTick
    || value.tick > Number.MAX_SAFE_INTEGER - 64
    || !Array.isArray(value.observations)
    || !Array.isArray(value.foodOpportunities)
  ) return null;
  const observations = canonicalizeActorObservations(value.observations);
  if (
    observations.length !== value.observations.length
    || observations.some(({ observerId, observedAtTick }) =>
      observerId !== state.identity.stableId || observedAtTick !== value.tick
    )
  ) return null;
  const accessibility = canonicalAccessibility(value.accessibility);
  if (accessibility === null || !accessibility.observe) return null;
  return {
    tick: value.tick,
    observations,
    foodOpportunities: value.foodOpportunities as readonly CoreWildlifeFoodOpportunity[],
    accessibility,
  };
}

function canonicalAccessibility(value: unknown): CoreWildlifeActionAccessibility | null {
  if (!plainRecord(value) || !exactKeys(value, CORE_WILDLIFE_INTENTS)) return null;
  for (const intent of CORE_WILDLIFE_INTENTS) {
    if (typeof value[intent] !== "boolean") return null;
  }
  return Object.freeze(Object.fromEntries(
    CORE_WILDLIFE_INTENTS.map((intent) => [intent, value[intent]]),
  ) as Record<CoreWildlifeIntentKind, boolean>);
}

function canonicalFoodOpportunities(
  value: unknown,
  perception: ActorPerceptionState,
): readonly CoreWildlifeFoodOpportunity[] | null {
  if (!Array.isArray(value) || value.length > CORE_WILDLIFE_MAX_FOOD_OPPORTUNITIES) return null;
  const acceptedObservations = new Set(perception.beliefs.map(({ sourceObservationId }) =>
    sourceObservationId
  ));
  const opportunities: CoreWildlifeFoodOpportunity[] = [];
  for (const raw of value) {
    if (!plainRecord(raw) || !exactKeys(raw, [
      "accessible",
      "availableUnits",
      "competition",
      "directlyConfirmed",
      "effort",
      "foodClass",
      "nutrition",
      "observationId",
      "resourceId",
      "risk",
      "sourceKind",
    ])) return null;
    if (
      !validId(raw.resourceId)
      || !validId(raw.observationId)
      || !FOOD_CLASSES.has(raw.foodClass as string)
      || !FOOD_SOURCES.has(raw.sourceKind as string)
      || !positiveSafeInteger(raw.availableUnits)
      || !scaledUnit(raw.nutrition)
      || !scaledUnit(raw.effort)
      || !scaledUnit(raw.risk)
      || !scaledUnit(raw.competition)
      || typeof raw.directlyConfirmed !== "boolean"
      || typeof raw.accessible !== "boolean"
      || !acceptedObservations.has(raw.observationId)
    ) return null;
    if (
      (raw.foodClass === "live-prey") !== (raw.sourceKind === "living-actor")
    ) return null;
    opportunities.push(Object.freeze({
      resourceId: raw.resourceId,
      observationId: raw.observationId,
      foodClass: raw.foodClass as CoreWildlifeFoodClass,
      sourceKind: raw.sourceKind as CoreWildlifeFoodSourceKind,
      availableUnits: raw.availableUnits,
      nutrition: raw.nutrition,
      effort: raw.effort,
      risk: raw.risk,
      competition: raw.competition,
      directlyConfirmed: raw.directlyConfirmed,
      accessible: raw.accessible,
    }));
  }
  opportunities.sort(compareOpportunity);
  for (let index = 1; index < opportunities.length; index += 1) {
    if (opportunities[index - 1]?.resourceId === opportunities[index]?.resourceId) return null;
  }
  return Object.freeze(opportunities);
}

function selectFoodOpportunity(
  state: CoreWildlifeActorState,
  opportunities: readonly CoreWildlifeFoodOpportunity[],
  tick: number,
): CoreWildlifeFoodOpportunity | null {
  const profile = getCoreWildlifeProfile(state.identity.species);
  const ranked = opportunities
    .filter((opportunity) => {
      if (!opportunity.directlyConfirmed || !opportunity.accessible) return false;
      if (profile.foodAffinities[opportunity.foodClass] === 0) return false;
      if (opportunity.foodClass === "live-prey" && profile.behavior.maximumPursuitTicks === 0) {
        return false;
      }
      return !recentMemory(state, "disengagement", opportunity.resourceId, tick, 8);
    })
    .map((opportunity) => ({
      opportunity,
      score: foodScore(profile.foodAffinities[opportunity.foodClass], opportunity),
    }))
    .sort((left, right) =>
      right.score - left.score || compareOpportunity(left.opportunity, right.opportunity)
    );
  return ranked[0]?.opportunity ?? null;
}

function foodScore(affinity: number, opportunity: CoreWildlifeFoodOpportunity): number {
  const ease = ACTOR_PERCEPTION_SCALE - opportunity.effort;
  const safety = ACTOR_PERCEPTION_SCALE - opportunity.risk;
  return Math.floor((
    affinity * 4
    + opportunity.nutrition * 2
    + ease * 3
    + safety
  ) / 10);
}

function strongestBelief(
  beliefs: readonly AgedActorBelief[],
  classes: ReadonlySet<string>,
): AgedActorBelief | null {
  return beliefs
    .filter(({ perceivedClass }) => classes.has(perceivedClass))
    .sort((left, right) =>
      beliefStrength(right) - beliefStrength(left)
      || compareText(left.sourceObservationId, right.sourceObservationId)
    )[0] ?? null;
}

function selectStronger(
  left: AgedActorBelief | null,
  right: AgedActorBelief | null,
): AgedActorBelief | null {
  if (left === null) return right;
  if (right === null) return left;
  const difference = beliefStrength(right) - beliefStrength(left);
  if (difference !== 0) return difference > 0 ? right : left;
  return left.sourceObservationId <= right.sourceObservationId ? left : right;
}

function beliefStrength(belief: AgedActorBelief | null): number {
  return belief === null ? 0 : Math.floor((belief.confidence + belief.salience) / 2);
}

function pressureFor(state: CoreWildlifeActorState, belief: AgedActorBelief | null): number {
  if (belief === null) return 0;
  const base = beliefStrength(belief);
  const vigilance = Math.floor(state.identity.traits.vigilance / 5);
  const boldness = Math.floor(state.identity.traits.boldness / 4);
  return clampScaled(base + vigilance - boldness);
}

function recentMemory(
  state: CoreWildlifeActorState,
  kind: CoreWildlifeMemoryKind,
  referenceId: string,
  tick: number,
  withinTicks: number,
): boolean {
  return state.memories.some((memory) =>
    memory.kind === kind
    && memory.referenceId === referenceId
    && memory.atTick <= tick
    && tick - memory.atTick <= withinTicks
  );
}

function createEvent(
  state: CoreWildlifeActorState,
  decision: CoreWildlifeDecision,
): CoreWildlifeCausalEvent {
  return deepFreeze({
    version: CORE_WILDLIFE_EVENT_VERSION,
    eventId: `${state.identity.stableId}:e:${decision.tick.toString(36)}:${decision.intent}`,
    atTick: decision.tick,
    actorId: state.identity.stableId,
    species: state.identity.species,
    kind: decision.intent,
    causeReferenceId: decision.cause.referenceId,
    observationId: decision.focusObservationId,
    resourceReference: decision.resourceReference,
    position: state.address.position,
  });
}

function memoryForEvent(
  state: CoreWildlifeActorState,
  event: CoreWildlifeCausalEvent,
  perception: ActorPerceptionState,
): readonly CoreWildlifeMemory[] {
  const rainBelief = event.observationId === null
    || event.kind !== "retreat"
    || event.species !== "domestic-cat"
    || event.causeReferenceId !== event.observationId
    ? null
    : perception.beliefs.find((belief) => (
        belief.sourceObservationId === event.observationId
        && belief.perceivedClass === "rain-exposure"
      )) ?? null;
  if (rainBelief !== null) {
    // One trace per short rain-response interval prevents a stationary cat
    // from filling the bounded memory/evidence budget every simulation tick.
    if (recentMemory(state, "weather", "weather:rain", event.atTick, 7)) {
      return Object.freeze([]);
    }
    return Object.freeze([deepFreeze({
      eventId: event.eventId,
      kind: "weather" as const,
      referenceId: "weather:rain",
      observationId: event.observationId,
      atTick: event.atTick,
      environmentalEvidence: {
        version: CORE_WILDLIFE_ENVIRONMENTAL_EVIDENCE_VERSION,
        evidenceId: `${event.eventId}:wet-tracks`,
        kind: "wet-tracks" as const,
        position: event.position,
        createdAtTick: event.atTick,
        strength: Math.floor((rainBelief.confidence + rainBelief.salience) / 2),
        itemConsumption: "none" as const,
        disclosure: "direct-observation-required" as const,
      },
    })]);
  }
  const kind = memoryKindForIntent(event.kind);
  if (kind === null) return Object.freeze([]);
  return Object.freeze([deepFreeze({
    eventId: event.eventId,
    kind,
    referenceId: event.resourceReference?.resourceId ?? event.causeReferenceId,
    observationId: event.observationId,
    atTick: event.atTick,
  })]);
}

function memoryKindForIntent(intent: CoreWildlifeIntentKind): CoreWildlifeMemoryKind | null {
  switch (intent) {
    case "alarm": return "alarm";
    case "flee":
    case "retreat": return "threat";
    case "forage":
    case "scavenge": return "food";
    case "pursue": return "pursuit";
    case "guard": return "guard";
    case "disengage": return "disengagement";
    case "rest":
    case "observe": return null;
  }
}

function createResourceClaims(
  event: CoreWildlifeCausalEvent,
): readonly CoreWildlifeResourceClaim[] {
  if (
    (event.kind !== "forage" && event.kind !== "scavenge")
    || event.resourceReference === null
  ) return Object.freeze([]);
  return Object.freeze([Object.freeze({
    eventId: event.eventId,
    actorId: event.actorId,
    resourceId: event.resourceReference.resourceId,
    foodClass: event.resourceReference.foodClass,
    observedAvailableUnits: event.resourceReference.observedAvailableUnits,
    requestedUnits: 1 as const,
  })]);
}

function resourceReference(
  opportunity: CoreWildlifeFoodOpportunity,
): CoreWildlifeResourceReference {
  return Object.freeze({
    resourceId: opportunity.resourceId,
    observationId: opportunity.observationId,
    foodClass: opportunity.foodClass,
    sourceKind: opportunity.sourceKind,
    observedAvailableUnits: opportunity.availableUnits,
  });
}

function initialNeeds(identity: CoreWildlifeIdentity): CoreWildlifeNeeds {
  return Object.freeze({
    hunger: 160_000 + stableHash(`${identity.stableId}:hunger`) % 260_001,
    safety: stableHash(`${identity.stableId}:safety`) % 120_001,
    rest: 90_000 + stableHash(`${identity.stableId}:rest`) % 260_001,
  });
}

function ageNeeds(
  needs: CoreWildlifeNeeds,
  intent: CoreWildlifeIntentKind,
  elapsed: number,
): CoreWildlifeNeeds {
  const hunger = saturatingAdd(needs.hunger, elapsed, 4_000);
  const rest = intent === "rest"
    ? saturatingSubtract(needs.rest, elapsed, 30_000)
    : saturatingAdd(needs.rest, elapsed, 3_000);
  const safety = intent === "flee" || intent === "retreat" || intent === "disengage"
    ? saturatingSubtract(needs.safety, elapsed, 22_000)
    : saturatingSubtract(needs.safety, elapsed, 8_000);
  return Object.freeze({ hunger, safety, rest });
}

function ageCondition(
  condition: CoreWildlifeCondition,
  intent: CoreWildlifeIntentKind,
  elapsed: number,
): CoreWildlifeCondition {
  const resting = intent === "rest";
  return Object.freeze({
    health: condition.health,
    exhaustion: resting
      ? saturatingSubtract(condition.exhaustion, elapsed, 28_000)
      : saturatingAdd(condition.exhaustion, elapsed, intent === "pursue" || intent === "flee" ? 9_000 : 2_000),
    stress: intent === "flee" || intent === "retreat"
      ? saturatingAdd(condition.stress, elapsed, 12_000)
      : saturatingSubtract(condition.stress, elapsed, 15_000),
  });
}

function canonicalNeeds(value: unknown): CoreWildlifeNeeds | null {
  if (!plainRecord(value) || !exactKeys(value, ["hunger", "rest", "safety"])) return null;
  if (!scaledUnit(value.hunger) || !scaledUnit(value.safety) || !scaledUnit(value.rest)) return null;
  return Object.freeze({ hunger: value.hunger, safety: value.safety, rest: value.rest });
}

function canonicalCondition(value: unknown): CoreWildlifeCondition | null {
  if (!plainRecord(value) || !exactKeys(value, ["exhaustion", "health", "stress"])) return null;
  if (!scaledUnit(value.health) || !scaledUnit(value.exhaustion) || !scaledUnit(value.stress)) {
    return null;
  }
  return Object.freeze({
    health: value.health,
    exhaustion: value.exhaustion,
    stress: value.stress,
  });
}

function canonicalIntent(value: unknown, maximumTick: number): CoreWildlifeIntentState | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "cause",
    "enteredAtTick",
    "expiresAtTick",
    "focusObservationId",
    "kind",
    "resourceReference",
  ])) return null;
  if (
    !INTENTS.has(value.kind as string)
    || !nonnegativeSafeInteger(value.enteredAtTick)
    || value.enteredAtTick > maximumTick
    || !(value.expiresAtTick === null || (
      nonnegativeSafeInteger(value.expiresAtTick)
      && value.expiresAtTick > value.enteredAtTick
      && value.expiresAtTick <= value.enteredAtTick + 64
    ))
    || !(value.focusObservationId === null || validId(value.focusObservationId))
  ) return null;
  const cause = canonicalCause(value.cause);
  const resource = value.resourceReference === null
    ? null
    : canonicalResourceReference(value.resourceReference);
  if (cause === null || (value.resourceReference !== null && resource === null)) return null;
  if (resource !== null && value.focusObservationId !== resource.observationId) return null;
  return deepFreeze({
    kind: value.kind as CoreWildlifeIntentKind,
    cause,
    focusObservationId: value.focusObservationId as string | null,
    resourceReference: resource,
    enteredAtTick: value.enteredAtTick,
    expiresAtTick: value.expiresAtTick as number | null,
  });
}

function canonicalCause(value: unknown): CoreWildlifeIntentCause | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["kind", "referenceId"])
    || !CAUSE_KINDS.has(value.kind as string)
    || !validId(value.referenceId)
  ) return null;
  return Object.freeze({
    kind: value.kind as CoreWildlifeIntentCauseKind,
    referenceId: value.referenceId,
  });
}

function canonicalResourceReference(value: unknown): CoreWildlifeResourceReference | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "foodClass",
    "observationId",
    "observedAvailableUnits",
    "resourceId",
    "sourceKind",
  ])) return null;
  if (
    !validId(value.resourceId)
    || !validId(value.observationId)
    || !FOOD_CLASSES.has(value.foodClass as string)
    || !FOOD_SOURCES.has(value.sourceKind as string)
    || !positiveSafeInteger(value.observedAvailableUnits)
    || ((value.foodClass === "live-prey") !== (value.sourceKind === "living-actor"))
  ) return null;
  return Object.freeze({
    resourceId: value.resourceId,
    observationId: value.observationId,
    foodClass: value.foodClass as CoreWildlifeFoodClass,
    sourceKind: value.sourceKind as CoreWildlifeFoodSourceKind,
    observedAvailableUnits: value.observedAvailableUnits,
  });
}

function canonicalMemories(
  value: unknown,
  maximumTick: number,
  species: CoreWildlifeSpecies,
): readonly CoreWildlifeMemory[] | null {
  if (!Array.isArray(value) || value.length > CORE_WILDLIFE_MEMORY_CAP) return null;
  const memories: CoreWildlifeMemory[] = [];
  for (const raw of value) {
    const hasEvidence = plainRecord(raw) && Object.hasOwn(raw, "environmentalEvidence");
    if (!plainRecord(raw) || !exactKeys(raw, [
      "atTick",
      ...(hasEvidence ? ["environmentalEvidence"] : []),
      "eventId",
      "kind",
      "observationId",
      "referenceId",
    ])) return null;
    if (
      !validId(raw.eventId)
      || !MEMORY_KINDS.has(raw.kind as string)
      || !validId(raw.referenceId)
      || !(raw.observationId === null || validId(raw.observationId))
      || !nonnegativeSafeInteger(raw.atTick)
      || raw.atTick > maximumTick
    ) return null;
    const environmentalEvidence = hasEvidence
      ? canonicalEnvironmentalEvidence(raw.environmentalEvidence, raw.atTick, raw.eventId)
      : null;
    if (
      (raw.kind === "weather") !== (environmentalEvidence !== null)
      || (environmentalEvidence !== null && species !== "domestic-cat")
    ) return null;
    memories.push(deepFreeze({
      eventId: raw.eventId,
      kind: raw.kind as CoreWildlifeMemoryKind,
      referenceId: raw.referenceId,
      observationId: raw.observationId as string | null,
      atTick: raw.atTick,
      ...(environmentalEvidence === null ? {} : { environmentalEvidence }),
    }));
  }
  memories.sort(compareMemory);
  for (let index = 1; index < memories.length; index += 1) {
    if (memories[index - 1]?.eventId === memories[index]?.eventId) return null;
  }
  return Object.freeze(memories);
}

function canonicalEnvironmentalEvidence(
  value: unknown,
  expectedTick: unknown,
  expectedEventId: unknown,
): CoreWildlifeEnvironmentalEvidence | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "createdAtTick",
    "disclosure",
    "evidenceId",
    "itemConsumption",
    "kind",
    "position",
    "strength",
    "version",
  ])) return null;
  if (
    value.version !== CORE_WILDLIFE_ENVIRONMENTAL_EVIDENCE_VERSION
    || !validId(value.evidenceId)
    || typeof expectedEventId !== "string"
    || value.evidenceId !== `${expectedEventId}:wet-tracks`
    || value.kind !== "wet-tracks"
    || !isWorldPosition(value.position)
    || value.createdAtTick !== expectedTick
    || !nonnegativeSafeInteger(value.createdAtTick)
    || !scaledUnit(value.strength)
    || value.strength === 0
    || value.itemConsumption !== "none"
    || value.disclosure !== "direct-observation-required"
  ) return null;
  return deepFreeze({
    version: CORE_WILDLIFE_ENVIRONMENTAL_EVIDENCE_VERSION,
    evidenceId: value.evidenceId,
    kind: "wet-tracks",
    position: value.position,
    createdAtTick: value.createdAtTick,
    strength: value.strength,
    itemConsumption: "none",
    disclosure: "direct-observation-required",
  });
}

function retainMemories(value: readonly CoreWildlifeMemory[]): readonly CoreWildlifeMemory[] {
  return Object.freeze([...value]
    .sort((left, right) => right.atTick - left.atTick || compareText(left.eventId, right.eventId))
    .slice(0, CORE_WILDLIFE_MEMORY_CAP)
    .sort(compareMemory));
}

function rebuildActor(
  state: CoreWildlifeActorState,
  changes: Partial<Pick<
    CoreWildlifeActorState,
    | "updatedAtTick"
    | "address"
    | "needs"
    | "condition"
    | "perception"
    | "intent"
    | "memories"
  >>,
): CoreWildlifeActorState {
  const candidate = canonicalizeCoreWildlifeActorState({ ...state, ...changes });
  if (candidate === null) throw new Error("Core wildlife transition broke actor invariants");
  return candidate;
}

function requireActor(value: unknown): CoreWildlifeActorState {
  const state = canonicalizeCoreWildlifeActorState(value);
  if (state === null) throw new TypeError("Core wildlife actor state is malformed");
  return state;
}

function compareOpportunity(
  left: Pick<CoreWildlifeFoodOpportunity, "resourceId" | "observationId">,
  right: Pick<CoreWildlifeFoodOpportunity, "resourceId" | "observationId">,
): number {
  return compareText(left.resourceId, right.resourceId)
    || compareText(left.observationId, right.observationId);
}

function compareMemory(left: CoreWildlifeMemory, right: CoreWildlifeMemory): number {
  return left.atTick - right.atTick || compareText(left.eventId, right.eventId);
}

function stableHash(value: string): number {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193) >>> 0;
  }
  return hash;
}

function safeFutureTick(tick: number, duration: number): number {
  const result = tick + duration;
  if (!Number.isSafeInteger(result)) throw new RangeError("Core wildlife intent exceeds tick range");
  return result;
}

function saturatingAdd(value: number, elapsed: number, rate: number): number {
  const maximumElapsed = Math.ceil(ACTOR_PERCEPTION_SCALE / rate);
  return Math.min(ACTOR_PERCEPTION_SCALE, value + Math.min(elapsed, maximumElapsed) * rate);
}

function saturatingSubtract(value: number, elapsed: number, rate: number): number {
  const maximumElapsed = Math.ceil(ACTOR_PERCEPTION_SCALE / rate);
  return Math.max(0, value - Math.min(elapsed, maximumElapsed) * rate);
}

function clampScaled(value: number): number {
  return Math.max(0, Math.min(ACTOR_PERCEPTION_SCALE, Math.trunc(value)));
}

function scaledUnit(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value <= ACTOR_PERCEPTION_SCALE;
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

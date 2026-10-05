import {
  canonicalizeActorPerceptionState,
  type ActorBelief,
} from "../sim/actorPerception";
import type { ResidentState, WorldView } from "../sim/types";
import { hashCanonical, stableStringify } from "../sim/util";
import { livingSpeciesActorIdMatchesNamespace } from "./livingSpeciesRegistry";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import {
  SITUATED_EXPRESSION_VERSION,
  canonicalizeSituatedExpressionState,
  createSituatedExpressionState,
  projectSituatedExpression,
  reduceSituatedExpression,
  situatedExpressionEventIdForTrigger,
  type SituatedExpressionEvent,
  type SituatedExpressionIntent,
  type SituatedExpressionKnowledgeBasis,
  type SituatedExpressionMemory,
} from "./situatedExpression";

export interface HumanDangerWarningExpressionInput {
  /** Exact current simulation projection that owns the resident and belief. */
  readonly world: WorldView;
  /** Exact resident root retained by `world`. */
  readonly resident: ResidentState;
}

export interface HumanDangerWarningExpressionCandidate {
  readonly intent: SituatedExpressionIntent;
  /** Exact fresh observation that gave this human reason to warn others. */
  readonly sourceObservationId: string;
}

interface HumanDangerWarningEvidence {
  readonly resident: ResidentState;
  readonly belief: ActorBelief;
  readonly knowledgeBasis: SituatedExpressionKnowledgeBasis;
  readonly position: SituatedExpressionIntent["position"];
}

const WARNING_CLASSES: ReadonlySet<string> = new Set([
  "animal-alarm",
  "large-predator",
]);

/** Critical human warnings outrank ordinary actor calls and physical contact. */
export const HUMAN_DANGER_WARNING_PRIORITY = 900_000 as const;

/** Bounded causal trigger derived from the full retained observation identity. */
export function humanDangerWarningTriggerEventId(
  sourceActorId: string,
  sourceObservationId: string,
): string | null {
  if (!validId(sourceActorId) || !validId(sourceObservationId)) return null;
  return `human-warning:${hashCanonical({ sourceActorId, sourceObservationId }).slice(0, 16)}`;
}

/**
 * Selects at most one deterministic human warning for this completed world
 * tick. A warning is caused by a fresh strong direct predator sighting or an
 * anonymous animal alarm. A heard human `danger-sound` can never recursively
 * create another warning.
 */
export function selectHumanDangerWarningExpression(
  world: WorldView,
  /** Optional development inspection of the already-selected canonical cause. */
  onSelectedBelief?: (belief: ActorBelief) => void,
): HumanDangerWarningExpressionCandidate | null {
  if (!plainRecord(world) || !Array.isArray(world.residents)) return null;
  const ownershipCounts = residentOwnershipCounts(world.residents);
  let selected: HumanDangerWarningExpressionCandidate | null = null;
  let selectedBelief: ActorBelief | null = null;
  for (const resident of world.residents) {
    if (residentOwnershipCount(ownershipCounts, resident) !== 1) continue;
    // This resident is the exact value obtained from the authoritative world
    // collection. Re-running the public detached-input ownership proof here
    // would scan and canonically serialize the collection once per resident.
    const evidence = humanDangerWarningEvidence(
      { world, resident },
      "resident-sourced-from-world",
    );
    if (evidence === null) continue;
    const candidate = candidateFromEvidence(evidence);
    if (
      candidate !== null
      && (selected === null || compareWarningCandidates(candidate, selected) < 0)
    ) {
      selected = candidate;
      if (import.meta.env.DEV && onSelectedBelief !== undefined) {
        selectedBelief = evidence.belief;
      }
    }
  }
  if (import.meta.env.DEV && selectedBelief !== null && onSelectedBelief !== undefined) {
    try {
      onSelectedBelief(selectedBelief);
    } catch {
      // Optional inspection cannot change the selected authoritative warning.
    }
  }
  return selected;
}

/** Adapts one source-honest fresh human danger belief into a warning intent. */
export function humanDangerWarningExpressionCandidate(
  inputValue: HumanDangerWarningExpressionInput,
): HumanDangerWarningExpressionCandidate | null {
  return humanDangerWarningExpressionCandidateWithOwnership(
    inputValue,
    "validate-detached-input",
  );
}

function humanDangerWarningExpressionCandidateWithOwnership(
  inputValue: HumanDangerWarningExpressionInput,
  ownership: "validate-detached-input" | "resident-sourced-from-world",
): HumanDangerWarningExpressionCandidate | null {
  const evidence = humanDangerWarningEvidence(inputValue, ownership);
  return evidence === null ? null : candidateFromEvidence(evidence);
}

function candidateFromEvidence(
  evidence: HumanDangerWarningEvidence,
): HumanDangerWarningExpressionCandidate | null {
  const { resident, belief, knowledgeBasis, position } = evidence;
  const triggerEventId = humanDangerWarningTriggerEventId(
    resident.identity.stableId,
    belief.sourceObservationId,
  );
  if (triggerEventId === null) return null;
  if (situatedExpressionEventIdForTrigger(
    resident.identity.stableId,
    triggerEventId,
  ) === null) return null;
  const variantSeed = Number.parseInt(hashCanonical({
    domain: "human-danger-warning-expression:v1",
    sourceActorId: resident.identity.stableId,
    triggerEventId,
    knowledgeBasis,
  }).slice(0, 8), 16) >>> 0;
  const intent = Object.freeze({
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: resident.identity.stableId,
    triggerEventId,
    position,
    meaning: "human-danger-warning" as const,
    family: "warning" as const,
    tone: "alarmed" as const,
    volume: "shout" as const,
    knowledgeBasis,
    priority: HUMAN_DANGER_WARNING_PRIORITY,
    salience: Math.max(620_000, Math.min(belief.confidence, belief.salience)),
    variantSeed,
    durationSteps: 6,
  });
  return Object.freeze({
    intent,
    sourceObservationId: belief.sourceObservationId,
  });
}

/** Reauthenticates one pending warning against the current resident belief. */
export function humanDangerWarningExpressionEventMatchesWorld(
  input: HumanDangerWarningExpressionInput,
  expression: SituatedExpressionEvent,
): boolean {
  if (projectSituatedExpression(expression) === null) return false;
  const derived = deriveHumanDangerWarningExpression(input, expression.triggerEventId);
  return derived !== null
    && stableStringify(immutableExpressionFields(expression))
      === stableStringify(immutableExpressionFields(derived.event));
}

/** Reauthenticates bounded warning cooldown memory from the same perception root. */
export function humanDangerWarningExpressionMemoryMatchesWorld(
  input: HumanDangerWarningExpressionInput,
  memory: SituatedExpressionMemory,
): boolean {
  const canonicalState = canonicalizeSituatedExpressionState({
    version: SITUATED_EXPRESSION_VERSION,
    completedSteps: 0,
    active: null,
    recent: [memory],
  });
  const canonicalMemory = canonicalState?.recent[0];
  if (canonicalMemory === undefined) return false;
  const derived = deriveHumanDangerWarningExpression(
    input,
    canonicalMemory.triggerEventId,
  );
  if (derived === null) return false;
  if (
    canonicalMemory.sourceActorId !== derived.memory.sourceActorId
    || canonicalMemory.triggerEventId !== derived.memory.triggerEventId
    || canonicalMemory.meaning !== derived.memory.meaning
    || canonicalMemory.family !== derived.memory.family
    || canonicalMemory.priority !== derived.memory.priority
  ) return false;
  const elapsedSteps = derived.memory.meaningCooldownRemainingSteps
    - canonicalMemory.meaningCooldownRemainingSteps;
  return nonnegativeSafeInteger(elapsedSteps)
    && (
      canonicalMemory.meaningCooldownRemainingSteps > 0
      || canonicalMemory.familyCooldownRemainingSteps > 0
    )
    && canonicalMemory.familyCooldownRemainingSteps === Math.max(
      0,
      derived.memory.familyCooldownRemainingSteps - elapsedSteps,
    );
}

/** Re-derives one exact human warning for save/trajectory authentication. */
export function humanDangerWarningExpressionEventForTrigger(
  input: HumanDangerWarningExpressionInput,
  triggerEventId: string,
): SituatedExpressionEvent | null {
  return deriveHumanDangerWarningExpression(input, triggerEventId)?.event ?? null;
}

function deriveHumanDangerWarningExpression(
  input: HumanDangerWarningExpressionInput,
  triggerEventId: string,
): Readonly<{
  event: SituatedExpressionEvent;
  memory: SituatedExpressionMemory;
}> | null {
  const candidate = humanDangerWarningExpressionCandidate(input);
  if (candidate === null || candidate.intent.triggerEventId !== triggerEventId) return null;
  const reduction = reduceSituatedExpression(
    createSituatedExpressionState(),
    candidate.intent,
  );
  const memory = reduction.state?.recent[0];
  if (!reduction.accepted || reduction.event === null || memory === undefined) return null;
  return Object.freeze({ event: reduction.event, memory });
}

function humanDangerWarningEvidence(
  inputValue: HumanDangerWarningExpressionInput,
  ownership: "validate-detached-input" | "resident-sourced-from-world",
): HumanDangerWarningEvidence | null {
  const raw: unknown = inputValue;
  if (!plainRecord(raw) || !exactKeys(raw, ["resident", "world"])) return null;
  const world = raw.world as WorldView;
  const resident = raw.resident as ResidentState;
  if (
    !plainRecord(world)
    || !Array.isArray(world.residents)
    || !nonnegativeSafeInteger(world.completedTick)
    || !plainRecord(resident)
    || !plainRecord(resident.identity)
    || resident.identity.species !== "human"
    || !livingSpeciesActorIdMatchesNamespace(resident.identity.stableId, "human")
  ) return null;
  if (ownership === "validate-detached-input") {
    const owned = world.residents.filter(({ id, identity }) => (
      id === resident.id && identity.stableId === resident.identity.stableId
    ));
    if (
      owned.length !== 1
      || owned[0] === undefined
      || stableStringify(owned[0]) !== stableStringify(resident)
    ) return null;
  }
  const perception = canonicalizeActorPerceptionState(resident.perception);
  if (
    perception === null
    || perception.actorId !== resident.identity.stableId
    || perception.tick !== world.completedTick
  ) return null;
  const eligible = perception.beliefs.filter((belief) => (
    belief.lastObservedTick === world.completedTick
    && belief.strongInterrupt
    && perception.attentionKeys.includes(belief.key)
    && WARNING_CLASSES.has(belief.perceivedClass)
    && (
      (belief.perceivedClass === "large-predator"
        && belief.channel === "vision"
        && belief.subjectId !== null
        && belief.identification === "identified"
        && belief.area.radiusUnits === 0)
      || (belief.perceivedClass === "animal-alarm"
        && belief.channel === "hearing"
        && belief.subjectId === null
        && belief.identification === "anonymous")
    )
  )).sort(compareWarningBeliefs);
  const belief = eligible[0];
  if (belief === undefined) return null;
  let placement: ReturnType<typeof resolveResidentWorldPlacement>;
  try {
    placement = resolveResidentWorldPlacement(world, resident);
  } catch {
    return null;
  }
  if (placement === null) return null;
  return Object.freeze({
    resident,
    belief,
    knowledgeBasis: belief.perceivedClass === "large-predator"
      ? "self-perceived-threat"
      : "self-heard-anonymous-alarm",
    position: placement.position,
  });
}

function compareWarningCandidates(
  left: HumanDangerWarningExpressionCandidate,
  right: HumanDangerWarningExpressionCandidate,
): number {
  return right.intent.priority - left.intent.priority
    || right.intent.salience - left.intent.salience
    || left.intent.sourceActorId.localeCompare(right.intent.sourceActorId)
    || left.sourceObservationId.localeCompare(right.sourceObservationId);
}

type ResidentOwnershipCounts = ReadonlyMap<number, ReadonlyMap<string, number>>;

function residentOwnershipCounts(
  residents: readonly ResidentState[],
): ResidentOwnershipCounts {
  const counts = new Map<number, Map<string, number>>();
  for (const resident of residents) {
    const identity = residentIdentityPair(resident);
    if (identity === null) continue;
    let byActorId = counts.get(identity.id);
    if (byActorId === undefined) {
      byActorId = new Map<string, number>();
      counts.set(identity.id, byActorId);
    }
    byActorId.set(identity.stableId, (byActorId.get(identity.stableId) ?? 0) + 1);
  }
  return counts;
}

function residentOwnershipCount(
  counts: ResidentOwnershipCounts,
  resident: ResidentState,
): number {
  const identity = residentIdentityPair(resident);
  return identity === null ? 0 : counts.get(identity.id)?.get(identity.stableId) ?? 0;
}

function residentIdentityPair(
  value: unknown,
): Readonly<{ id: number; stableId: string }> | null {
  if (!plainRecord(value) || !Number.isSafeInteger(value.id)) return null;
  const identity = value.identity;
  if (!plainRecord(identity) || !validId(identity.stableId)) return null;
  return { id: value.id as number, stableId: identity.stableId };
}

function compareWarningBeliefs(left: ActorBelief, right: ActorBelief): number {
  return right.salience - left.salience
    || right.confidence - left.confidence
    || left.sourceObservationId.localeCompare(right.sourceObservationId);
}

function immutableExpressionFields(event: SituatedExpressionEvent): Readonly<Record<string, unknown>> {
  return {
    version: event.version,
    catalogVersion: event.catalogVersion,
    eventId: event.eventId,
    sourceActorId: event.sourceActorId,
    triggerEventId: event.triggerEventId,
    position: event.position,
    meaning: event.meaning,
    family: event.family,
    tone: event.tone,
    volume: event.volume,
    knowledgeBasis: event.knowledgeBasis,
    vocalization: event.vocalization,
    priority: event.priority,
    salience: event.salience,
    variantSeed: event.variantSeed,
    realizationKey: event.realizationKey,
    durationSteps: event.durationSteps,
  };
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}

function validId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 256
    && value === value.trim();
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return actual.length === canonical.length
    && actual.every((key, index) => key === canonical[index]);
}

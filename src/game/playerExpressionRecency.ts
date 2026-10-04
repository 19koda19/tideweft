import type { RootSeed } from "../sim/rng";
import {
  canonicalizePlayerEffortRecencyState,
  createPlayerEffortRecencyState,
  type PlayerEffortRecencyClock,
  type PlayerEffortRecencyState,
} from "./playerEffortRecency";
import { playerFootingExpressionAdmissionPolicy } from "./playerExpressionAuthority";
import {
  canonicalizePlayerStepStateSample,
  type PlayerStepStateSample,
} from "./playerStepState";
import {
  canonicalizeSituatedExpressionAdmissionRecord,
  type PlayerTraversalExpressionAdmissionRecord,
} from "./situatedExpressionAdmissionLedger";
import {
  canonicalizeSituatedExpressionCausalAuthorityRecord,
  situatedExpressionAdmissionMatchesCausalAuthority,
  type SituatedExpressionCausalAuthorityRecord,
} from "./situatedExpressionCausalAuthority";
import { situatedExpressionCooldownSteps } from "./situatedExpression";

export const PLAYER_EXPRESSION_RECENCY_VERSION = 1 as const;
export const PLAYER_FOOTING_RECENCY_MAX_RECEIPTS = 2 as const;

/** Committed choice history, never a sound, channel, caption or active line. */
export interface PlayerFootingRecencyReceipt {
  readonly admission: PlayerTraversalExpressionAdmissionRecord;
  readonly authority: SituatedExpressionCausalAuthorityRecord;
  readonly step: PlayerStepStateSample;
}

/** Existing effort proof plus one latest origin per current footing meaning. */
export interface PlayerExpressionRecencyState {
  readonly version: typeof PLAYER_EXPRESSION_RECENCY_VERSION;
  readonly effort: PlayerEffortRecencyState;
  readonly footing: readonly PlayerFootingRecencyReceipt[];
}

export function createPlayerExpressionRecencyState(rootSeed: RootSeed): PlayerExpressionRecencyState {
  return freezeState(createPlayerEffortRecencyState(rootSeed), []);
}

/**
 * Consistency validation of bounded carried history, not secret attestation or
 * reconstruction of old weather/terrain. Pending facts require independent
 * agreement at the enclosing runtime boundary before adoption.
 */
export function canonicalizePlayerExpressionRecencyState(
  value: unknown,
  rootSeed: RootSeed,
  clock: PlayerEffortRecencyClock,
): PlayerExpressionRecencyState | null {
  if (!plainRecord(value) || !exactKeys(value, ["version", "effort", "footing"])
    || value.version !== PLAYER_EXPRESSION_RECENCY_VERSION
    || !validClock(clock)
    || !Array.isArray(value.footing)
    || value.footing.length > PLAYER_FOOTING_RECENCY_MAX_RECEIPTS
    || Object.keys(value.footing).length !== value.footing.length) return null;
  const effort = canonicalizePlayerEffortRecencyState(value.effort, rootSeed, clock);
  if (effort === null) return null;
  const footing: PlayerFootingRecencyReceipt[] = [];
  const accepted: { receipt: PlayerFootingRecencyReceipt; age: number }[] = [];
  const eventIds = new Set<string>();
  const physicalFrontiers = new Set<string>();
  let previousClass: string | null = null;
  for (let index = 0; index < value.footing.length; index += 1) {
    if (!(index in value.footing)) return null;
    const receipt = canonicalFootingReceipt(value.footing[index]);
    if (receipt === null
      || (previousClass !== null && receipt.admission.causalClass <= previousClass)) return null;
    const frontier = `${receipt.authority.committedWorldTick}:${receipt.step.sampleOrdinal}`;
    if (eventIds.has(receipt.admission.eventId) || physicalFrontiers.has(frontier)) return null;
    eventIds.add(receipt.admission.eventId);
    physicalFrontiers.add(frontier);
    previousClass = receipt.admission.causalClass;
    const age = playerFootingRecencyAge(receipt, clock);
    const policy = playerFootingExpressionAdmissionPolicy(receipt.admission);
    const cooldown = policy === null ? null : situatedExpressionCooldownSteps(policy.meaning);
    if (age === null || cooldown === null) return null;
    accepted.push({ receipt, age });
    if (age < Math.max(cooldown.meaning, cooldown.family)) footing.push(receipt);
  }
  if (accepted.length === 2) {
    const first = accepted[0]!;
    const second = accepted[1]!;
    const older = first.age > second.age ? first : second;
    const newer = first.age > second.age ? second : first;
    const priorPolicy = playerFootingExpressionAdmissionPolicy(older.receipt.admission)!;
    const nextPolicy = playerFootingExpressionAdmissionPolicy(newer.receipt.admission)!;
    const cooldown = situatedExpressionCooldownSteps(priorPolicy.meaning)!;
    // Two carried choices must also obey the family law at their original
    // acceptance frontiers, not merely be old enough at today's frontier.
    if (older.age - newer.age < cooldown.family
      && nextPolicy.priority <= priorPolicy.priority) return null;
  }
  return freezeState(effort, footing);
}

/** Applies existing meaning and priority-qualified family law, not a new timer. */
export function playerFootingRecencyAllowsExpression(
  value: unknown,
  rootSeed: RootSeed,
  clock: PlayerEffortRecencyClock,
  admissionValue: unknown,
): boolean | null {
  const state = canonicalizePlayerExpressionRecencyState(value, rootSeed, clock);
  const admission = canonicalizeSituatedExpressionAdmissionRecord(admissionValue);
  const candidate = playerFootingExpressionAdmissionPolicy(admission);
  if (state === null || admission?.kind !== "player-traversal" || candidate === null) return null;
  for (const receipt of state.footing) {
    const policy = playerFootingExpressionAdmissionPolicy(receipt.admission);
    const age = playerFootingRecencyAge(receipt, clock);
    const cooldown = policy === null ? null : situatedExpressionCooldownSteps(policy.meaning);
    if (policy === null || age === null || cooldown === null) return null;
    if (receipt.admission.triggerEventId === admission.triggerEventId
      || (candidate.meaning === policy.meaning && age < cooldown.meaning)
      || (age < cooldown.family && candidate.priority <= policy.priority)) return false;
  }
  return true;
}

/** Runtime calls this only after atomic expression admission has committed. */
export function recordAcceptedPlayerFootingExpression(
  value: unknown,
  rootSeed: RootSeed,
  clock: PlayerEffortRecencyClock,
  receiptValue: unknown,
): PlayerExpressionRecencyState | null {
  const state = canonicalizePlayerExpressionRecencyState(value, rootSeed, clock);
  const receipt = canonicalFootingReceipt(receiptValue);
  if (state === null || receipt === null || playerFootingRecencyAge(receipt, clock) !== 0
    || playerFootingRecencyAllowsExpression(state, rootSeed, clock, receipt.admission) !== true) return null;
  const footing = state.footing.filter((prior) => (
    prior.admission.causalClass !== receipt.admission.causalClass
  ));
  footing.push(receipt);
  footing.sort((left, right) => left.admission.causalClass < right.admission.causalClass ? -1 : 1);
  return freezeState(state.effort, footing);
}

/** The physical step ordinal, never the sound-ledger index or phase9 clamp. */
export function playerFootingRecencyAge(
  receipt: PlayerFootingRecencyReceipt,
  clock: PlayerEffortRecencyClock,
): number | null {
  if (!validClock(clock)) return null;
  const age = (clock.completedTick - receipt.authority.committedWorldTick) * 10
    + clock.playerStepPhase - receipt.step.sampleOrdinal - 1;
  return Number.isSafeInteger(age) && age >= 0 ? age : null;
}

function canonicalFootingReceipt(value: unknown): PlayerFootingRecencyReceipt | null {
  if (!plainRecord(value) || !exactKeys(value, ["admission", "authority", "step"])) return null;
  const admission = canonicalizeSituatedExpressionAdmissionRecord(value.admission);
  const authority = canonicalizeSituatedExpressionCausalAuthorityRecord(value.authority);
  const step = canonicalizePlayerStepStateSample(value.step);
  if (admission?.kind !== "player-traversal"
    || playerFootingExpressionAdmissionPolicy(admission) === null
    || authority === null || !situatedExpressionAdmissionMatchesCausalAuthority(admission, authority)
    || step === null || step.sampleOrdinal > 9 || step.traversalIncidentKind !== "stumble"
    || admission.admittedAtPlayerStepPhase !== Math.min(9, step.sampleOrdinal + 1)) return null;
  return Object.freeze({ admission, authority, step });
}

function freezeState(
  effort: PlayerEffortRecencyState,
  footing: readonly PlayerFootingRecencyReceipt[],
): PlayerExpressionRecencyState {
  return Object.freeze({ version: PLAYER_EXPRESSION_RECENCY_VERSION, effort, footing: Object.freeze([...footing]) });
}

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0)
    && value >= minimum && value <= maximum;
}

function validClock(value: unknown): value is PlayerEffortRecencyClock {
  return plainRecord(value) && exactKeys(value, ["completedTick", "playerStepPhase"])
    && integer(value.completedTick, 0, Number.MAX_SAFE_INTEGER)
    && integer(value.playerStepPhase, 0, 9);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function exactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

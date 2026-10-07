import type { RootSeed } from "../sim/rng";
import { stableStringify } from "../sim/util";
import {
  canonicalizePlayerEffortRecencyState,
  createPlayerEffortRecencyState,
  type PlayerEffortRecencyClock,
  type PlayerEffortRecencyState,
} from "./playerEffortRecency";
import { playerCargoExpressionAdmissionPolicy, playerFootingExpressionAdmissionPolicy } from "./playerExpressionAuthority";
import {
  canonicalizePlayerStepStateSample,
  type PlayerStepStateSample,
} from "./playerStepState";
import {
  canonicalizeSituatedExpressionAdmissionRecord,
  type PlayerFallRecoveryExpressionAdmissionRecord,
  type PlayerTraversalExpressionAdmissionRecord,
  type SituatedExpressionAdmissionRecord,
} from "./situatedExpressionAdmissionLedger";
import {
  canonicalizeSituatedExpressionCausalAuthorityRecord,
  situatedExpressionAdmissionMatchesCausalAuthority,
  type SituatedExpressionCausalAuthorityRecord,
} from "./situatedExpressionCausalAuthority";
import { situatedExpressionCooldownSteps } from "./situatedExpression";

export const PLAYER_EXPRESSION_RECENCY_VERSION = 2 as const;
export const PLAYER_FOOTING_RECENCY_MAX_RECEIPTS = 2 as const;
/** Earliest fresh same-meaning choice; never a timer that emits speech. */
export const PLAYER_FOOTING_REANNOUNCEMENT_STEPS = 600 as const;
export const PLAYER_CARGO_RECENCY_MAX_RECEIPTS = 3 as const;

/** Committed choice history, never a sound, channel, caption or active line. */
export interface PlayerFootingRecencyReceipt {
  readonly admission: PlayerTraversalExpressionAdmissionRecord;
  readonly authority: SituatedExpressionCausalAuthorityRecord;
  readonly step: PlayerStepStateSample;
}

/** A traversal commits after its physical step; pickup commits at its action frontier. */
export type PlayerCargoRecencyReceipt = Readonly<{
  admission: PlayerTraversalExpressionAdmissionRecord;
  authority: SituatedExpressionCausalAuthorityRecord;
  step: PlayerStepStateSample;
}> | Readonly<{
  admission: PlayerFallRecoveryExpressionAdmissionRecord;
  authority: SituatedExpressionCausalAuthorityRecord;
  step: null;
}>;

/** Existing effort proof plus one latest origin per current footing/cargo meaning. */
export interface PlayerExpressionRecencyState {
  readonly version: typeof PLAYER_EXPRESSION_RECENCY_VERSION;
  readonly effort: PlayerEffortRecencyState;
  readonly footing: readonly PlayerFootingRecencyReceipt[];
  readonly cargo: readonly PlayerCargoRecencyReceipt[];
}

export function createPlayerExpressionRecencyState(rootSeed: RootSeed): PlayerExpressionRecencyState {
  return freezeState(createPlayerEffortRecencyState(rootSeed), [], []);
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
  if (!plainRecord(value) || !exactKeys(value, ["version", "effort", "footing", "cargo"])
    || value.version !== PLAYER_EXPRESSION_RECENCY_VERSION
    || !validClock(clock)
    || !Array.isArray(value.footing)
    || value.footing.length > PLAYER_FOOTING_RECENCY_MAX_RECEIPTS
    || Object.keys(value.footing).length !== value.footing.length
    || !Array.isArray(value.cargo) || value.cargo.length > PLAYER_CARGO_RECENCY_MAX_RECEIPTS
    || Object.keys(value.cargo).length !== value.cargo.length) return null;
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
    if (age < Math.max(cooldown.meaning, cooldown.family, PLAYER_FOOTING_REANNOUNCEMENT_STEPS)) footing.push(receipt);
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
  const cargoOrigins: { receipt: PlayerCargoRecencyReceipt; age: number }[] = [];
  let previousMeaning: string | null = null;
  for (let index = 0; index < value.cargo.length; index += 1) {
    if (!(index in value.cargo)) return null;
    const receipt = canonicalCargoReceipt(value.cargo[index]);
    const policy = receipt === null ? null : playerCargoExpressionAdmissionPolicy(receipt.admission);
    const age = receipt === null ? null : playerCargoRecencyAge(receipt, clock);
    if (receipt === null || policy === null || age === null
      || (previousMeaning !== null && policy.meaning <= previousMeaning)
      || eventIds.has(receipt.admission.eventId)) return null;
    if (receipt.step !== null) {
      const frontier = `${receipt.authority.committedWorldTick}:${receipt.step.sampleOrdinal}`;
      if (physicalFrontiers.has(frontier)) return null;
      physicalFrontiers.add(frontier);
    }
    previousMeaning = policy.meaning;
    eventIds.add(receipt.admission.eventId);
    cargoOrigins.push({ receipt, age });
  }
  // Validate choices at their ORIGINAL frontiers. At an equal frontier a
  // physical loss precedes manual pickup; two traversal choices cannot share it.
  const chronological = [...cargoOrigins].sort((left, right) => right.age - left.age
    || Number(left.receipt.step === null) - Number(right.receipt.step === null));
  for (let index = 0; index < chronological.length; index += 1) {
    const current = chronological[index]!;
    const earlier = chronological.slice(0, index).map((prior) => ({
      receipt: prior.receipt, age: prior.age - current.age,
    })).filter(({ receipt, age }) => cargoHistoryIsLive(receipt, age));
    if (!cargoChoiceAllowed(earlier, current.receipt.admission)) return null;
  }
  return freezeState(effort, footing, cargoOrigins.filter(({ receipt, age }) => (
    cargoHistoryIsLive(receipt, age)
  )).map(({ receipt }) => receipt));
}

/** Sparse future choice eligibility plus the unchanged priority-qualified family law. */
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
      || (candidate.meaning === policy.meaning
        && age < Math.max(cooldown.meaning, PLAYER_FOOTING_REANNOUNCEMENT_STEPS))
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
  return freezeState(state.effort, footing, state.cargo);
}

/** Exact original shape only; enclosing load must reconcile its pending facts. */
export function upgradePlayerExpressionRecencyV1(
  value: unknown, rootSeed: RootSeed, clock: PlayerEffortRecencyClock,
): PlayerExpressionRecencyState | null {
  if (!plainRecord(value) || !exactKeys(value, ["version", "effort", "footing"])
    || value.version !== 1) return null;
  const state = canonicalizePlayerExpressionRecencyState({ ...value, version: 2, cargo: [] }, rootSeed, clock);
  // Deliberately supported v1 bytes used the original 12/16-step prune fence.
  // A longer CURRENT choice horizon cannot make expired legacy history valid.
  if (state === null || state.footing.some((receipt) => {
    const policy = playerFootingExpressionAdmissionPolicy(receipt.admission)!;
    const cooldown = situatedExpressionCooldownSteps(policy.meaning)!;
    return playerFootingRecencyAge(receipt, clock)! >= Math.max(cooldown.meaning, cooldown.family);
  })) return null;
  return stableStringify(value) === stableStringify({
    version: 1, effort: state.effort, footing: state.footing,
  }) ? state : null;
}

export function playerCargoRecencyAllowsExpression(
  value: unknown, rootSeed: RootSeed, clock: PlayerEffortRecencyClock, admissionValue: unknown,
): boolean | null {
  const state = canonicalizePlayerExpressionRecencyState(value, rootSeed, clock);
  const admission = canonicalizeSituatedExpressionAdmissionRecord(admissionValue);
  if (state === null || admission === null || playerCargoExpressionAdmissionPolicy(admission) === null) return null;
  return cargoChoiceAllowed(state.cargo.map((receipt) => ({
    receipt, age: playerCargoRecencyAge(receipt, clock)!,
  })), admission);
}

/** Admission/custody owners commit first; refused optional lines never mint history. */
export function recordAcceptedPlayerCargoExpression(
  value: unknown, rootSeed: RootSeed, clock: PlayerEffortRecencyClock, receiptValue: unknown,
): PlayerExpressionRecencyState | null {
  const state = canonicalizePlayerExpressionRecencyState(value, rootSeed, clock);
  const receipt = canonicalCargoReceipt(receiptValue);
  if (state === null || receipt === null || playerCargoRecencyAge(receipt, clock) !== 0
    || playerCargoRecencyAllowsExpression(state, rootSeed, clock, receipt.admission) !== true) return null;
  const meaning = playerCargoExpressionAdmissionPolicy(receipt.admission)!.meaning;
  const cargo = [...state.cargo.filter((prior) => (
    playerCargoExpressionAdmissionPolicy(prior.admission)!.meaning !== meaning
  )), receipt].sort((left, right) => {
    const leftMeaning = playerCargoExpressionAdmissionPolicy(left.admission)!.meaning;
    const rightMeaning = playerCargoExpressionAdmissionPolicy(right.admission)!.meaning;
    return leftMeaning < rightMeaning ? -1 : leftMeaning > rightMeaning ? 1 : 0;
  });
  return canonicalizePlayerExpressionRecencyState(freezeState(state.effort, state.footing, cargo), rootSeed, clock);
}

export function playerCargoRecencyAge(
  receipt: PlayerCargoRecencyReceipt, clock: PlayerEffortRecencyClock,
): number | null {
  if (!validClock(clock)) return null;
  const frontierPhase = receipt.step === null ? receipt.admission.admittedAtPlayerStepPhase
    : receipt.step.sampleOrdinal + 1;
  const age = (clock.completedTick - receipt.authority.committedWorldTick) * 10
    + clock.playerStepPhase - frontierPhase;
  return Number.isSafeInteger(age) && age >= 0 ? age : null;
}

function cargoHistoryIsLive(receipt: PlayerCargoRecencyReceipt, age: number): boolean {
  const cooldown = situatedExpressionCooldownSteps(playerCargoExpressionAdmissionPolicy(receipt.admission)!.meaning)!;
  return age < Math.max(cooldown.meaning, cooldown.family);
}

function cargoChoiceAllowed(
  prior: readonly { receipt: PlayerCargoRecencyReceipt; age: number }[],
  admission: SituatedExpressionAdmissionRecord,
): boolean {
  const candidate = playerCargoExpressionAdmissionPolicy(admission)!;
  const resolvesLoss = candidate.meaning === "relief-after-cargo-recovery" && prior.some(({ receipt }) => (
    playerCargoExpressionAdmissionPolicy(receipt.admission)!.meaning === "alarm-at-cargo-loss"
  ));
  for (const { receipt, age } of prior) {
    const policy = playerCargoExpressionAdmissionPolicy(receipt.admission)!;
    const cooldown = situatedExpressionCooldownSteps(policy.meaning)!;
    if (receipt.admission.triggerEventId === admission.triggerEventId
      || (candidate.meaning === policy.meaning && age < cooldown.meaning)
      || (!resolvesLoss && age < cooldown.family && candidate.priority <= policy.priority)) return false;
  }
  return true;
}

function canonicalCargoReceipt(value: unknown): PlayerCargoRecencyReceipt | null {
  if (!plainRecord(value) || !exactKeys(value, ["admission", "authority", "step"])) return null;
  const admission = canonicalizeSituatedExpressionAdmissionRecord(value.admission);
  const authority = canonicalizeSituatedExpressionCausalAuthorityRecord(value.authority);
  if (admission === null || playerCargoExpressionAdmissionPolicy(admission) === null
    || authority === null || !situatedExpressionAdmissionMatchesCausalAuthority(admission, authority)) return null;
  if (admission.kind === "player-fall-recovery") {
    return value.step === null ? Object.freeze({ admission, authority, step: null }) : null;
  }
  if (admission.kind !== "player-traversal") return null;
  const step = canonicalizePlayerStepStateSample(value.step);
  return step !== null && step.sampleOrdinal <= 9
    && step.traversalIncidentKind === admission.incidentKind
    && admission.admittedAtPlayerStepPhase === Math.min(9, step.sampleOrdinal + 1)
    ? Object.freeze({ admission, authority, step }) : null;
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
  cargo: readonly PlayerCargoRecencyReceipt[],
): PlayerExpressionRecencyState {
  return Object.freeze({ version: PLAYER_EXPRESSION_RECENCY_VERSION, effort,
    footing: Object.freeze([...footing]), cargo: Object.freeze([...cargo]) });
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

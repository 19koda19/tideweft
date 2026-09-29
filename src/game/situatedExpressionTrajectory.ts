import {
  createSupplementalSoundSample,
  type SupplementalSoundSample,
} from "./humanPerception";
import {
  situatedExpressionCooldownSteps,
  situatedExpressionEventIdForTrigger,
  type SituatedExpressionMemory,
} from "./situatedExpression";
import {
  SITUATED_EXPRESSION_ADMISSION_MAX_PLAYER_STEP_PHASE,
  canonicalizeSituatedExpressionAdmissionLedger,
  type SituatedExpressionAdmissionLedger,
  type SituatedExpressionAdmissionRecord,
} from "./situatedExpressionAdmissionLedger";
import {
  canonicalizeSituatedExpressionChannelBank,
  type SituatedExpressionChannelBank,
} from "./situatedExpressionChannelBank";
import { situatedExpressionSoundClass } from "./situatedExpressionAcoustics";

/** One reauthenticated pending expression interval, safe for a save owner to retain. */
export interface SituatedExpressionTrajectory {
  readonly bank: SituatedExpressionChannelBank;
  readonly admissionLedger: SituatedExpressionAdmissionLedger;
  readonly supplementalSoundSamples: readonly SupplementalSoundSample[];
}

/**
 * Reauthenticates the whole pending-expression trajectory rather than accepting
 * a structurally valid bank, ledger, and sound list independently.
 *
 * Every admission must still exist exactly once as newest-first source memory
 * and exactly once at its assigned sound-list index. The current player-step
 * phase must explain all elapsed cooldown, channel, and active-event time.
 */
export function canonicalizeSituatedExpressionTrajectory(
  bankValue: unknown,
  admissionLedgerValue: unknown,
  playerStepsSinceWorldTick: unknown,
  supplementalSoundSamplesValue: unknown,
): SituatedExpressionTrajectory | null {
  const bank = canonicalizeSituatedExpressionChannelBank(bankValue);
  const admissionLedger = canonicalizeSituatedExpressionAdmissionLedger(
    admissionLedgerValue,
  );
  if (
    bank === null
    || admissionLedger === null
    || !nonnegativeSafeInteger(playerStepsSinceWorldTick)
    || playerStepsSinceWorldTick > SITUATED_EXPRESSION_ADMISSION_MAX_PLAYER_STEP_PHASE
    || !Array.isArray(supplementalSoundSamplesValue)
    || supplementalSoundSamplesValue.length !== admissionLedger.records.length
  ) return null;

  const samples: SupplementalSoundSample[] = [];
  for (let index = 0; index < supplementalSoundSamplesValue.length; index += 1) {
    if (!(index in supplementalSoundSamplesValue)) return null;
    const sample = createSupplementalSoundSample(
      supplementalSoundSamplesValue[index] as SupplementalSoundSample,
    );
    const record = admissionLedger.records[index];
    if (
      sample === null
      || record === undefined
      || record.sampleOrdinal !== index
      || sample.expressionEventId !== record.eventId
      || sample.sourceActorId !== record.sourceActorId
      || sample.soundClass !== situatedExpressionSoundClass(
        admissionMeaning(record),
      )
    ) return null;
    samples.push(sample);
  }

  const recordsBySource = new Map<string, SituatedExpressionAdmissionRecord[]>();
  for (let index = 0; index < admissionLedger.records.length; index += 1) {
    const record = admissionLedger.records[index];
    if (record === undefined) return null;
    if (record.admittedAtPlayerStepPhase > playerStepsSinceWorldTick) return null;
    const prior = admissionLedger.records[index - 1];
    if (
      prior !== undefined
      && record.admittedAtPlayerStepPhase < prior.admittedAtPlayerStepPhase
    ) return null;
    const expectedEventId = situatedExpressionEventIdForTrigger(
      record.sourceActorId,
      record.triggerEventId,
    );
    if (expectedEventId === null || record.eventId !== expectedEventId) return null;
    const sourceRecords = recordsBySource.get(record.sourceActorId);
    if (sourceRecords === undefined) recordsBySource.set(record.sourceActorId, [record]);
    else sourceRecords.push(record);
  }

  if (bank.channels.length !== recordsBySource.size) return null;
  for (const channel of bank.channels) {
    const sourceRecords = recordsBySource.get(channel.sourceActorId);
    if (sourceRecords === undefined || sourceRecords.length !== channel.state.recent.length) {
      return null;
    }
    const newestFirst = [...sourceRecords].sort(compareAdmissionNewestFirst);
    for (let index = 0; index < newestFirst.length; index += 1) {
      const record = newestFirst[index];
      const memory = channel.state.recent[index];
      if (
        record === undefined
        || memory === undefined
        || !memoryMatchesAdmission(
          memory,
          record,
          playerStepsSinceWorldTick,
        )
      ) return null;
    }

    const earliestPhase = sourceRecords.reduce(
      (earliest, record) => Math.min(earliest, record.admittedAtPlayerStepPhase),
      Number.MAX_SAFE_INTEGER,
    );
    if (channel.state.completedSteps !== playerStepsSinceWorldTick - earliestPhase) {
      return null;
    }

    const active = channel.state.active;
    const latest = newestFirst[0];
    const latestMemory = channel.state.recent[0];
    if (latest === undefined || latestMemory === undefined) return null;
    const latestAge = playerStepsSinceWorldTick - latest.admittedAtPlayerStepPhase;
    const expectedLatestDuration = admissionDurationSteps(latest, latestMemory);
    if ((latestAge < expectedLatestDuration) !== (active !== null)) return null;
    if (active !== null) {
      if (
        active.eventId !== latest.eventId
        || active.sourceActorId !== latest.sourceActorId
        || active.triggerEventId !== latest.triggerEventId
        || !eventMeaningMatchesAdmission(active.meaning, latest)
        || active.durationSteps !== expectedLatestDuration
        || active.audioAcknowledged !== true
        || latestAge >= active.durationSteps
        || active.remainingSteps !== active.durationSteps - latestAge
      ) return null;
      if (
        latest.kind === "porter-heavy-departure"
        && (
          channel.reception?.kind !== "heard-visible"
          || channel.reception.receivedAtTick !== latest.receivedAtTick
          || channel.reception.certainty !== latest.hearingCertainty
        )
      ) return null;
      if (
        latest.kind === "guardian-dog-warning"
        && channel.reception !== null
        && (
          channel.reception.kind === "self"
          || channel.reception.receivedAtTick !== latest.acceptedAtTick
        )
      ) return null;
    }
  }

  return Object.freeze({
    bank,
    admissionLedger,
    supplementalSoundSamples: Object.freeze(samples),
  });
}

/** Boolean convenience for callers that do not need the canonical bundle. */
export function situatedExpressionTrajectoryIsCanonical(
  bankValue: unknown,
  admissionLedgerValue: unknown,
  playerStepsSinceWorldTick: unknown,
  supplementalSoundSamplesValue: unknown,
): boolean {
  return canonicalizeSituatedExpressionTrajectory(
    bankValue,
    admissionLedgerValue,
    playerStepsSinceWorldTick,
    supplementalSoundSamplesValue,
  ) !== null;
}

function memoryMatchesAdmission(
  memory: SituatedExpressionMemory,
  record: SituatedExpressionAdmissionRecord,
  currentPhase: number,
): boolean {
  if (
    memory.sourceActorId !== record.sourceActorId
    || memory.triggerEventId !== record.triggerEventId
    || !eventMeaningMatchesAdmission(memory.meaning, record)
  ) return false;
  const age = currentPhase - record.admittedAtPlayerStepPhase;
  if (!nonnegativeSafeInteger(age)) return false;
  const cooldowns = situatedExpressionCooldownSteps(memory.meaning);
  return cooldowns !== null
    && memory.meaningCooldownRemainingSteps === Math.max(0, cooldowns.meaning - age)
    && memory.familyCooldownRemainingSteps === Math.max(0, cooldowns.family - age);
}

function eventMeaningMatchesAdmission(
  meaning: SituatedExpressionMemory["meaning"],
  record: SituatedExpressionAdmissionRecord,
): boolean {
  switch (record.kind) {
    case "player-traversal":
      return meaning === traversalMeaning(record.causalClass);
    case "player-fall-recovery":
      return meaning === "relief-after-cargo-recovery";
    case "porter-heavy-departure":
      return meaning === "porter-heavy-load";
    case "guardian-dog-warning":
      return meaning === "guardian-dog-warning";
    case "legacy-v33-player":
      return true;
  }
}

function admissionDurationSteps(
  record: SituatedExpressionAdmissionRecord,
  memory: SituatedExpressionMemory,
): number {
  switch (record.kind) {
    case "player-traversal":
      switch (record.causalClass) {
        case "ordinary-stumble": return 7;
        case "serious-stumble": return 10;
        case "important-cargo-impact": return 12;
        case "cargo-separation": return 14;
      }
    case "player-fall-recovery": return 9;
    case "porter-heavy-departure": return 8;
    case "guardian-dog-warning": return 6;
    case "legacy-v33-player": return expressionDurationSteps(memory.meaning);
  }
}

function expressionDurationSteps(meaning: SituatedExpressionMemory["meaning"]): number {
  switch (meaning) {
    case "steady-after-stumble": return 7;
    case "relief-after-near-fall": return 10;
    case "protect-important-cargo": return 12;
    case "alarm-at-cargo-loss": return 14;
    case "relief-after-cargo-recovery": return 9;
    case "porter-heavy-load": return 8;
    case "guardian-dog-warning": return 6;
  }
}

function admissionMeaning(
  record: SituatedExpressionAdmissionRecord,
): SituatedExpressionMemory["meaning"] {
  switch (record.kind) {
    case "player-traversal": return traversalMeaning(record.causalClass);
    case "player-fall-recovery": return "relief-after-cargo-recovery";
    case "porter-heavy-departure": return "porter-heavy-load";
    case "guardian-dog-warning": return "guardian-dog-warning";
    case "legacy-v33-player": return "steady-after-stumble";
  }
}

function traversalMeaning(
  causalClass: Extract<
    SituatedExpressionAdmissionRecord,
    { readonly kind: "player-traversal" }
  >["causalClass"],
): SituatedExpressionMemory["meaning"] {
  switch (causalClass) {
    case "ordinary-stumble": return "steady-after-stumble";
    case "serious-stumble": return "relief-after-near-fall";
    case "important-cargo-impact": return "protect-important-cargo";
    case "cargo-separation": return "alarm-at-cargo-loss";
  }
}

function compareAdmissionNewestFirst(
  left: SituatedExpressionAdmissionRecord,
  right: SituatedExpressionAdmissionRecord,
): number {
  return right.admittedAtPlayerStepPhase - left.admittedAtPlayerStepPhase
    || right.sampleOrdinal - left.sampleOrdinal;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

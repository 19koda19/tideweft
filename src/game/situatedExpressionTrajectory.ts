import {
  createSupplementalSoundSample,
  type SupplementalSoundSample,
} from "./humanPerception";
import {
  situatedExpressionCooldownSteps,
  situatedExpressionEventIdForTrigger,
  type SituatedExpressionEvent,
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
import {
  situatedExpressionAcoustics,
  situatedExpressionSoundClass,
  situatedExpressionSoundInterrupt,
} from "./situatedExpressionAcoustics";
import { HUMAN_DANGER_WARNING_PRIORITY } from "./humanDangerWarningExpression";
import { coreWildlifeAlarmExpressionPriority } from "./coreWildlifeSignalExpression";
import { DOMESTIC_CAT_RAIN_DISTRESS_EXPRESSION_PRIORITY } from "./coreWildlifeWeatherDistressExpression";
import { MARSH_FOX_PURSUIT_YIP_EXPRESSION_PRIORITY } from "./coreWildlifePursuitExpression";

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
      || sample.soundClass !== situatedExpressionSoundClass(admissionMeaning(record))
      || !sampleAcousticsMatchAdmission(sample, record)
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
        || !eventMatchesAdmission(active, latest)
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
        (latest.kind === "guardian-dog-warning"
          || latest.kind === "guardian-dog-defensive-growl"
          || latest.kind === "guardian-dog-shelter-whine"
          || latest.kind === "core-wildlife-fish-crow-alarm"
          || latest.kind === "core-wildlife-alarm"
          || latest.kind === "core-wildlife-weather-distress"
          || latest.kind === "core-wildlife-pursuit-call"
          || latest.kind === "human-danger-warning")
        && channel.reception !== null
        && (
          channel.reception.kind === "self"
          || channel.reception.receivedAtTick !== latest.acceptedAtTick
        )
      ) return null;
      if (
        latest.kind === "settlement-keeper-store-response"
        && (latest.hearingCertainty === null
          ? channel.reception !== null
          : channel.reception?.kind !== "heard-visible"
            || channel.reception.receivedAtTick !== latest.respondedAtTick
            || channel.reception.certainty !== latest.hearingCertainty)
      ) return null;
      if (
        latest.kind === "resident-introduction"
        && (channel.reception?.kind !== "heard-visible"
          || channel.reception.receivedAtTick !== latest.introducedAtTick
          || channel.reception.certainty !== latest.hearingCertainty)
      ) return null;
      if (
        latest.kind === "resident-weather-hold"
        && (latest.receptionKind === null
          ? channel.reception !== null
          : channel.reception?.kind !== latest.receptionKind
            || channel.reception.receivedAtTick !== latest.shelteredAtTick
            || channel.reception.certainty !== latest.hearingCertainty)
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
    || (record.kind === "core-wildlife-fish-crow-alarm"
      && memory.priority !== coreWildlifeAlarmExpressionPriority("fish-crow"))
    || (record.kind === "core-wildlife-alarm"
      && memory.priority !== coreWildlifeAlarmExpressionPriority(record.sourceSpecies))
    || (record.kind === "core-wildlife-weather-distress"
      && memory.priority !== DOMESTIC_CAT_RAIN_DISTRESS_EXPRESSION_PRIORITY)
    || (record.kind === "core-wildlife-pursuit-call"
      && memory.priority !== MARSH_FOX_PURSUIT_YIP_EXPRESSION_PRIORITY)
    || (record.kind === "human-danger-warning"
      && memory.priority !== HUMAN_DANGER_WARNING_PRIORITY)
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
    case "player-exhaustion":
      return meaning === "need-rest-after-exertion";
    case "porter-heavy-departure":
      return meaning === "porter-heavy-load";
    case "guardian-dog-warning":
      return meaning === "guardian-dog-warning";
    case "guardian-dog-defensive-growl":
      return meaning === "guardian-dog-defensive-growl";
    case "guardian-dog-shelter-whine":
      return meaning === "guardian-dog-shelter-whine";
    case "core-wildlife-fish-crow-alarm":
      return meaning === "fish-crow-alarm-call";
    case "core-wildlife-alarm":
      return meaning === coreWildlifeAlarmMeaning(record.sourceSpecies);
    case "core-wildlife-weather-distress":
      return meaning === "domestic-cat-rain-distress-call";
    case "core-wildlife-pursuit-call":
      return meaning === "marsh-fox-pursuit-yip";
    case "human-danger-warning":
      return meaning === "human-danger-warning";
    case "settlement-keeper-store-response":
      return meaning === "keeper-secure-store-response";
    case "resident-introduction":
      return meaning === "resident-introduction";
    case "resident-weather-hold":
      return meaning === "resident-weather-hold";
    case "legacy-v33-player":
      return isLegacyV33PlayerMeaning(meaning);
  }
}

function eventMatchesAdmission(
  event: SituatedExpressionEvent,
  record: SituatedExpressionAdmissionRecord,
): boolean {
  if (!eventMeaningMatchesAdmission(event.meaning, record)) return false;
  if (record.kind === "player-exhaustion") {
    return event.family === "condition"
      && event.tone === "strained"
      && event.volume === "murmur"
      && event.knowledgeBasis === "self-felt-exhaustion"
      && event.priority === 260_000
      && event.salience === 440_000;
  }
  if (record.kind === "resident-introduction") {
    return event.family === "social"
      && event.tone === "restrained"
      && event.volume === "spoken"
      && event.knowledgeBasis === "self-committed-introduction"
      && event.priority === 650_000
      && event.salience === 780_000;
  }
  if (record.kind === "resident-weather-hold") {
    return event.family === "condition"
      && event.tone === "restrained"
      && event.volume === "spoken"
      && event.knowledgeBasis === "self-weather-distress"
      && event.priority === 300_000
      && event.salience === 520_000;
  }
  if (record.kind === "core-wildlife-fish-crow-alarm") {
    return event.priority === coreWildlifeAlarmExpressionPriority("fish-crow")
      && event.tone === "alarmed"
      && event.volume === "shout";
  }
  if (record.kind === "core-wildlife-alarm") {
    return event.priority === coreWildlifeAlarmExpressionPriority(record.sourceSpecies)
      && event.tone === "alarmed"
      && event.volume === coreWildlifeAlarmVolume(record.sourceSpecies);
  }
  if (record.kind === "core-wildlife-weather-distress") {
    return event.family === "animal-signal"
      && event.tone === "restrained"
      && event.volume === "murmur"
      && event.knowledgeBasis === "self-weather-distress"
      && event.priority === DOMESTIC_CAT_RAIN_DISTRESS_EXPRESSION_PRIORITY
      && event.salience >= 360_000;
  }
  if (record.kind === "core-wildlife-pursuit-call") {
    return event.family === "animal-signal"
      && event.tone === "restrained"
      && event.volume === "spoken"
      && event.knowledgeBasis === "self-perceived-prey"
      && event.priority === MARSH_FOX_PURSUIT_YIP_EXPRESSION_PRIORITY
      && event.salience >= 420_000;
  }
  if (record.kind === "human-danger-warning") {
    return event.priority === HUMAN_DANGER_WARNING_PRIORITY
      && event.tone === "alarmed"
      && event.volume === "shout";
  }
  return true;
}

function sampleAcousticsMatchAdmission(
  sample: SupplementalSoundSample,
  record: SituatedExpressionAdmissionRecord,
): boolean {
  if (record.kind === "player-exhaustion") {
    const acoustics = situatedExpressionAcoustics({
      meaning: "need-rest-after-exertion",
      volume: "murmur",
    });
    return sample.soundLoudness === acoustics.loudness
      && sample.soundRangeUnits === acoustics.rangeUnits
      && sample.soundInterrupt === "none";
  }
  if (record.kind === "resident-introduction") {
    const acoustics = situatedExpressionAcoustics({
      meaning: "resident-introduction",
      volume: "spoken",
    });
    return sample.soundLoudness === acoustics.loudness
      && sample.soundRangeUnits === acoustics.rangeUnits
      && sample.soundInterrupt === "none";
  }
  if (record.kind === "resident-weather-hold") {
    const acoustics = situatedExpressionAcoustics({
      meaning: "resident-weather-hold",
      volume: "spoken",
    });
    return sample.soundLoudness === acoustics.loudness
      && sample.soundRangeUnits === acoustics.rangeUnits
      && sample.soundInterrupt === "none";
  }
  if (record.kind === "core-wildlife-weather-distress") {
    const acoustics = situatedExpressionAcoustics({
      meaning: "domestic-cat-rain-distress-call",
      volume: "murmur",
    });
    return sample.soundLoudness === acoustics.loudness
      && sample.soundRangeUnits === acoustics.rangeUnits
      && sample.soundInterrupt === "none";
  }
  if (record.kind === "core-wildlife-pursuit-call") {
    const acoustics = situatedExpressionAcoustics({
      meaning: "marsh-fox-pursuit-yip",
      volume: "spoken",
    });
    return sample.soundLoudness === acoustics.loudness
      && sample.soundRangeUnits === acoustics.rangeUnits
      && sample.soundInterrupt === situatedExpressionSoundInterrupt({
        meaning: "marsh-fox-pursuit-yip",
        tone: "restrained",
        volume: "spoken",
      });
  }
  if (
    record.kind !== "core-wildlife-fish-crow-alarm"
    && record.kind !== "core-wildlife-alarm"
    && record.kind !== "human-danger-warning"
  ) return true;
  const meaning = record.kind === "core-wildlife-fish-crow-alarm"
    ? "fish-crow-alarm-call"
    : record.kind === "core-wildlife-alarm"
      ? coreWildlifeAlarmMeaning(record.sourceSpecies)
      : "human-danger-warning";
  const volume = record.kind === "core-wildlife-alarm"
    ? coreWildlifeAlarmVolume(record.sourceSpecies)
    : "shout";
  const acoustics = situatedExpressionAcoustics({ meaning, volume });
  return sample.soundLoudness === acoustics.loudness
    && sample.soundRangeUnits === acoustics.rangeUnits
    && sample.soundInterrupt === situatedExpressionSoundInterrupt({
      meaning,
      tone: "alarmed",
      volume,
    });
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
    case "player-exhaustion": return 8;
    case "porter-heavy-departure": return 8;
    case "guardian-dog-warning": return 6;
    case "guardian-dog-defensive-growl": return 8;
    case "guardian-dog-shelter-whine": return 8;
    case "core-wildlife-fish-crow-alarm": return 6;
    case "core-wildlife-alarm": return 6;
    case "core-wildlife-weather-distress": return 6;
    case "core-wildlife-pursuit-call": return 6;
    case "human-danger-warning": return 6;
    case "settlement-keeper-store-response": return 12;
    case "resident-introduction": return 56;
    case "resident-weather-hold": return 12;
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
    case "guardian-dog-defensive-growl": return 8;
    case "guardian-dog-shelter-whine": return 8;
    case "fish-crow-alarm-call": return 6;
    case "deer-alarm-call": return 6;
    case "gull-alarm-call": return 6;
    case "elk-alarm-call": return 6;
    case "wild-boar-alarm-call": return 6;
    case "marsh-rabbit-alarm-thump": return 6;
    case "domestic-cat-rain-distress-call": return 6;
    case "marsh-fox-pursuit-yip": return 6;
    case "human-danger-warning": return 6;
    case "keeper-secure-store-response": return 12;
    case "need-rest-after-exertion": return 8;
    case "resident-introduction": return 56;
    case "resident-weather-hold": return 12;
  }
}

function admissionMeaning(
  record: SituatedExpressionAdmissionRecord,
): SituatedExpressionMemory["meaning"] {
  switch (record.kind) {
    case "player-traversal": return traversalMeaning(record.causalClass);
    case "player-fall-recovery": return "relief-after-cargo-recovery";
    case "player-exhaustion": return "need-rest-after-exertion";
    case "porter-heavy-departure": return "porter-heavy-load";
    case "guardian-dog-warning": return "guardian-dog-warning";
    case "guardian-dog-defensive-growl": return "guardian-dog-defensive-growl";
    case "guardian-dog-shelter-whine": return "guardian-dog-shelter-whine";
    case "core-wildlife-fish-crow-alarm": return "fish-crow-alarm-call";
    case "core-wildlife-alarm": return coreWildlifeAlarmMeaning(record.sourceSpecies);
    case "core-wildlife-weather-distress": return "domestic-cat-rain-distress-call";
    case "core-wildlife-pursuit-call": return "marsh-fox-pursuit-yip";
    case "human-danger-warning": return "human-danger-warning";
    case "settlement-keeper-store-response": return "keeper-secure-store-response";
    case "resident-introduction": return "resident-introduction";
    case "resident-weather-hold": return "resident-weather-hold";
    case "legacy-v33-player": return "steady-after-stumble";
  }
}

function coreWildlifeAlarmMeaning(
  species: Extract<
    SituatedExpressionAdmissionRecord,
    { readonly kind: "core-wildlife-alarm" }
  >["sourceSpecies"],
): SituatedExpressionMemory["meaning"] {
  switch (species) {
    case "fish-crow": return "fish-crow-alarm-call";
    case "deer": return "deer-alarm-call";
    case "gull": return "gull-alarm-call";
    case "elk": return "elk-alarm-call";
    case "wild-boar": return "wild-boar-alarm-call";
    case "marsh-rabbit": return "marsh-rabbit-alarm-thump";
  }
}

function coreWildlifeAlarmVolume(
  species: Extract<
    SituatedExpressionAdmissionRecord,
    { readonly kind: "core-wildlife-alarm" }
  >["sourceSpecies"],
): "murmur" | "shout" {
  return species === "marsh-rabbit" ? "murmur" : "shout";
}

function isLegacyV33PlayerMeaning(
  meaning: SituatedExpressionMemory["meaning"],
): boolean {
  return meaning === "steady-after-stumble"
    || meaning === "relief-after-near-fall"
    || meaning === "protect-important-cargo"
    || meaning === "alarm-at-cargo-loss"
    || meaning === "relief-after-cargo-recovery";
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

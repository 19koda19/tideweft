import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import {
  createSupplementalSoundSample,
  type SupplementalSoundSample,
} from "./humanPerception";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import {
  acknowledgeSituatedExpression,
  advanceSituatedExpression,
  createSituatedExpressionState,
  reduceSituatedExpression,
  situatedExpressionEventIdForTrigger,
  type SituatedExpressionEvent,
  type SituatedExpressionIntent,
  type SituatedExpressionState,
} from "./situatedExpression";
import {
  canonicalizeSituatedExpressionAdmissionLedger,
  createCoreWildlifeFishCrowAlarmExpressionAdmissionRecord,
  createGuardianDogWarningExpressionAdmissionRecord,
  createHumanDangerWarningExpressionAdmissionRecord,
  createPlayerExhaustionExpressionAdmissionRecord,
  createPorterHeavyDepartureExpressionAdmissionRecord,
  createResidentIntroductionExpressionAdmissionRecord,
  createResidentWeatherHoldExpressionAdmissionRecord,
  type SituatedExpressionAdmissionLedger,
  type SituatedExpressionAdmissionRecord,
} from "./situatedExpressionAdmissionLedger";
import { playerEffortExpressionIntent } from "./playerEffortExpression";
import { HUMAN_DANGER_WARNING_PRIORITY } from "./humanDangerWarningExpression";
import {
  situatedExpressionAcoustics,
  situatedExpressionSoundClass,
} from "./situatedExpressionAcoustics";
import {
  canonicalizeSituatedExpressionChannelBank,
  type SituatedExpressionChannelBank,
} from "./situatedExpressionChannelBank";
import {
  createHeardVisibleSituatedExpressionReception,
  createHeardUnseenSituatedExpressionReception,
  createSelfSituatedExpressionReception,
  type SituatedExpressionReception,
} from "./situatedExpressionReception";
import {
  canonicalizeSituatedExpressionTrajectory,
  situatedExpressionTrajectoryIsCanonical,
} from "./situatedExpressionTrajectory";
import { createWorldPosition } from "./worldPosition";

const PLAYER_ID = LOCAL_PLAYER_LIVING_ACTOR_ID;
const PORTER_ID = "H-expression-trajectory-porter";
const GUARDIAN_DOG_ID = "D-expression-trajectory-guardian";
const FISH_CROW_ID = "C-expression-trajectory-fish-crow";
const WARNING_HUMAN_ID = "H-expression-trajectory-warning";
const INTRODUCING_RESIDENT_ID = "H-expression-trajectory-introduction";
const WEATHER_HOLD_RESIDENT_ID = "H-expression-trajectory-weather-hold";
const POSITION = createWorldPosition(createRegionCoord(3, -2), 17_000, 9_000);

interface Fixture {
  readonly bank: SituatedExpressionChannelBank;
  readonly ledger: SituatedExpressionAdmissionLedger;
  readonly phase: number;
  readonly samples: readonly SupplementalSoundSample[];
}

type Mutable<T> = T extends readonly (infer Element)[]
  ? Mutable<Element>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

function mutable<T>(value: T): Mutable<T> {
  return structuredClone(value) as Mutable<T>;
}

function intent(
  triggerEventId: string,
  priority = 180_000,
  durationSteps = 7,
): SituatedExpressionIntent {
  return {
    version: 1,
    sourceActorId: PLAYER_ID,
    triggerEventId,
    position: POSITION,
    meaning: "steady-after-stumble",
    family: "footing",
    tone: "restrained",
    volume: "murmur",
    knowledgeBasis: "self-felt-stumble",
    priority,
    salience: priority + 80_000,
    variantSeed: priority,
    durationSteps,
  };
}

function seriousIntent(triggerEventId: string): SituatedExpressionIntent {
  return {
    ...intent(triggerEventId, 420_000, 10),
    meaning: "relief-after-near-fall",
    tone: "relieved",
    volume: "spoken",
    knowledgeBasis: "self-felt-near-fall",
    salience: 650_000,
  };
}

function porterIntent(triggerEventId: string): SituatedExpressionIntent {
  return {
    version: 1,
    sourceActorId: PORTER_ID,
    triggerEventId,
    position: POSITION,
    meaning: "porter-heavy-load",
    family: "work",
    tone: "strained",
    volume: "spoken",
    knowledgeBasis: "self-handled-heavy-cargo",
    priority: 240_000,
    salience: 420_000,
    variantSeed: 71,
    durationSteps: 8,
  };
}

function guardianDogIntent(triggerEventId: string): SituatedExpressionIntent {
  return {
    version: 1,
    sourceActorId: GUARDIAN_DOG_ID,
    triggerEventId,
    position: POSITION,
    meaning: "guardian-dog-warning",
    family: "animal-signal",
    tone: "alarmed",
    volume: "shout",
    knowledgeBasis: "self-heard-anonymous-alarm",
    priority: 760_000,
    salience: 840_000,
    variantSeed: 109,
    durationSteps: 6,
  };
}

function fishCrowIntent(triggerEventId: string): SituatedExpressionIntent {
  return {
    version: 1,
    sourceActorId: FISH_CROW_ID,
    triggerEventId,
    position: POSITION,
    meaning: "fish-crow-alarm-call",
    family: "animal-signal",
    tone: "alarmed",
    volume: "shout",
    knowledgeBasis: "self-perceived-threat",
    priority: 760_000,
    salience: 840_000,
    variantSeed: 127,
    durationSteps: 6,
  };
}

function humanWarningIntent(triggerEventId: string): SituatedExpressionIntent {
  return {
    version: 1,
    sourceActorId: WARNING_HUMAN_ID,
    triggerEventId,
    position: POSITION,
    meaning: "human-danger-warning",
    family: "warning",
    tone: "alarmed",
    volume: "shout",
    knowledgeBasis: "self-perceived-threat",
    priority: HUMAN_DANGER_WARNING_PRIORITY,
    salience: 920_000,
    variantSeed: 149,
    durationSteps: 6,
  };
}

function residentIntroductionIntent(triggerEventId: string): SituatedExpressionIntent {
  return {
    version: 1,
    sourceActorId: INTRODUCING_RESIDENT_ID,
    triggerEventId,
    position: POSITION,
    meaning: "resident-introduction",
    family: "social",
    tone: "restrained",
    volume: "spoken",
    knowledgeBasis: "self-committed-introduction",
    priority: 650_000,
    salience: 780_000,
    variantSeed: 173,
    durationSteps: 56,
  };
}

function residentWeatherHoldIntent(triggerEventId: string): SituatedExpressionIntent {
  return {
    version: 1,
    sourceActorId: WEATHER_HOLD_RESIDENT_ID,
    triggerEventId,
    position: POSITION,
    meaning: "resident-weather-hold",
    family: "condition",
    tone: "restrained",
    volume: "spoken",
    knowledgeBasis: "self-weather-distress",
    priority: 300_000,
    salience: 520_000,
    variantSeed: 191,
    durationSteps: 12,
  };
}

function accept(
  state: SituatedExpressionState,
  candidate: SituatedExpressionIntent,
): Readonly<{ event: SituatedExpressionEvent; state: SituatedExpressionState }> {
  const reduction = reduceSituatedExpression(state, candidate);
  if (!reduction.accepted || reduction.event === null || reduction.state === null) {
    throw new Error(`fixture admission failed: ${reduction.reason}`);
  }
  const acknowledged = acknowledgeSituatedExpression(reduction.state);
  if (acknowledged.state === null || acknowledged.state.active === null) {
    throw new Error("fixture admission did not acknowledge");
  }
  return { event: acknowledged.state.active, state: acknowledged.state };
}

function traversalRecord(
  event: SituatedExpressionEvent,
  sampleOrdinal: number,
  admittedAtPlayerStepPhase: number,
): SituatedExpressionAdmissionRecord {
  const serious = event.meaning === "relief-after-near-fall";
  return {
    version: 1,
    kind: "player-traversal",
    eventId: event.eventId,
    sourceActorId: event.sourceActorId,
    triggerEventId: event.triggerEventId,
    sampleOrdinal,
    admittedAtPlayerStepPhase,
    causalClass: serious ? "serious-stumble" : "ordinary-stumble",
    incidentKind: "stumble",
    hazardSeverity: serious ? 700_000 : 200_000,
    cargoOutcome: "unchanged",
    selectedPayloadKind: null,
    cargoShock: 0,
    separatedEntityIds: [],
    separationEventId: null,
  };
}

function legacyRecord(
  event: SituatedExpressionEvent,
  sampleOrdinal: number,
  admittedAtPlayerStepPhase: number,
): SituatedExpressionAdmissionRecord {
  return {
    version: 1,
    kind: "legacy-v33-player",
    eventId: event.eventId,
    sourceActorId: event.sourceActorId,
    triggerEventId: event.triggerEventId,
    sampleOrdinal,
    admittedAtPlayerStepPhase,
  };
}

function ledger(records: readonly SituatedExpressionAdmissionRecord[]) {
  const canonical = canonicalizeSituatedExpressionAdmissionLedger({
    version: 1,
    records,
  });
  if (canonical === null) throw new Error("fixture ledger was not canonical");
  return canonical;
}

function sample(event: SituatedExpressionEvent, ordinal: number): SupplementalSoundSample {
  const result = createSupplementalSoundSample({
    id: `av-40-${ordinal}`,
    expressionEventId: event.eventId,
    position: event.position,
    soundLoudness: 360_000,
    soundRangeUnits: 8_000,
    soundClass: "human-vocalization",
    soundInterrupt: "none",
    sourceActorId: event.sourceActorId,
  });
  if (result === null) throw new Error("fixture sound was not canonical");
  return result;
}

function animalSample(
  event: SituatedExpressionEvent,
  ordinal: number,
): SupplementalSoundSample {
  const acoustics = situatedExpressionAcoustics({
    meaning: event.meaning,
    volume: event.volume,
  });
  const result = createSupplementalSoundSample({
    id: `av-40-${ordinal}`,
    expressionEventId: event.eventId,
    position: event.position,
    soundLoudness: acoustics.loudness,
    soundRangeUnits: acoustics.rangeUnits,
    soundClass: situatedExpressionSoundClass(event),
    soundInterrupt: "strong",
    sourceActorId: event.sourceActorId,
  });
  if (result === null) throw new Error("fixture dog sound was not canonical");
  return result;
}

function residentIntroductionSample(
  event: SituatedExpressionEvent,
  ordinal: number,
): SupplementalSoundSample {
  const acoustics = situatedExpressionAcoustics(event);
  const result = createSupplementalSoundSample({
    id: `av-40-${ordinal}`,
    expressionEventId: event.eventId,
    position: event.position,
    soundLoudness: acoustics.loudness,
    soundRangeUnits: acoustics.rangeUnits,
    soundClass: situatedExpressionSoundClass(event),
    soundInterrupt: "none",
    sourceActorId: event.sourceActorId,
  });
  if (result === null) throw new Error("fixture resident introduction sound was not canonical");
  return result;
}

function bank(state: SituatedExpressionState): SituatedExpressionChannelBank {
  const reception = state.active === null
    ? null
    : createSelfSituatedExpressionReception(state.active, 40);
  const canonical = canonicalizeSituatedExpressionChannelBank({
    version: 1,
    channels: [{ sourceActorId: PLAYER_ID, state, reception }],
  });
  if (canonical === null) throw new Error("fixture bank was not canonical");
  return canonical;
}

function porterFixture(): Fixture {
  const phase = 3;
  const receivedAtTick = 40;
  const hearingCertainty = 800_000;
  const admitted = accept(
    createSituatedExpressionState(),
    porterIntent("sim-event:contract-departed:12:7"),
  );
  const current = advanceSituatedExpression(admitted.state, phase);
  if (current === null || current.active === null) {
    throw new Error("fixture porter expression expired unexpectedly");
  }
  const reception = createHeardVisibleSituatedExpressionReception(
    current.active,
    receivedAtTick,
    hearingCertainty,
    true,
  );
  const canonicalBank = canonicalizeSituatedExpressionChannelBank({
    version: 1,
    channels: [{ sourceActorId: PORTER_ID, state: current, reception }],
  });
  const record = createPorterHeavyDepartureExpressionAdmissionRecord({
    sourceActorId: PORTER_ID,
    triggerEventId: admitted.event.triggerEventId,
    sampleOrdinal: 0,
    admittedAtPlayerStepPhase: 0,
    receivedAtTick,
    listenerPosition: POSITION,
    listenerFacingMilliRadians: 0,
    hearingCertainty,
  });
  if (canonicalBank === null || record === null) {
    throw new Error("fixture porter trajectory was not canonical");
  }
  return {
    bank: canonicalBank,
    ledger: ledger([record]),
    phase,
    samples: [sample(admitted.event, 0)],
  };
}

function guardianDogFixture(
  receptionKind: "none" | "heard-visible" | "heard-unseen",
): Fixture {
  const phase = 3;
  const acceptedAtTick = 40;
  const triggerEventId = "working-animal:activity:guardian-warning:trajectory";
  const admitted = accept(
    createSituatedExpressionState(),
    guardianDogIntent(triggerEventId),
  );
  const current = advanceSituatedExpression(admitted.state, phase);
  if (current === null || current.active === null) {
    throw new Error("fixture dog expression expired unexpectedly");
  }
  const reception: SituatedExpressionReception | null = receptionKind === "none"
    ? null
    : receptionKind === "heard-visible"
      ? createHeardVisibleSituatedExpressionReception(
          current.active,
          acceptedAtTick,
          760_000,
          true,
        )
      : createHeardUnseenSituatedExpressionReception(
          current.active,
          acceptedAtTick,
          {
            bearing: { centerRadians: 0.75, uncertaintyRadians: 0.2 },
            distanceBand: { minimum: 3, maximum: 7 },
            certainty: 0.76,
          },
        );
  if (receptionKind !== "none" && reception === null) {
    throw new Error("fixture dog reception was not canonical");
  }
  const canonicalBank = canonicalizeSituatedExpressionChannelBank({
    version: 1,
    channels: [{ sourceActorId: GUARDIAN_DOG_ID, state: current, reception }],
  });
  const record = createGuardianDogWarningExpressionAdmissionRecord({
    sourceActorId: GUARDIAN_DOG_ID,
    triggerEventId,
    sampleOrdinal: 0,
    admittedAtPlayerStepPhase: 0,
    assignmentId: "working-animal:assignment:guardian:trajectory",
    activityTransactionId: triggerEventId,
    sourceObservationId: "observation:anonymous-alarm:trajectory",
    acceptedAtTick,
  });
  if (canonicalBank === null || record === null) {
    throw new Error("fixture dog trajectory was not canonical");
  }
  return {
    bank: canonicalBank,
    ledger: ledger([record]),
    phase,
    samples: [animalSample(admitted.event, 0)],
  };
}

function fishCrowFixture(
  receptionKind: "none" | "heard-visible" | "heard-unseen",
): Fixture {
  const phase = 3;
  const acceptedAtTick = 40;
  const triggerEventId = "core-wildlife:alarm:fish-crow:trajectory";
  const admitted = accept(
    createSituatedExpressionState(),
    fishCrowIntent(triggerEventId),
  );
  const current = advanceSituatedExpression(admitted.state, phase);
  if (current === null || current.active === null) {
    throw new Error("fixture fish-crow expression expired unexpectedly");
  }
  const reception: SituatedExpressionReception | null = receptionKind === "none"
    ? null
    : receptionKind === "heard-visible"
      ? createHeardVisibleSituatedExpressionReception(
          current.active,
          acceptedAtTick,
          760_000,
          true,
        )
      : createHeardUnseenSituatedExpressionReception(
          current.active,
          acceptedAtTick,
          {
            bearing: { centerRadians: 0.75, uncertaintyRadians: 0.2 },
            distanceBand: { minimum: 3, maximum: 7 },
            certainty: 0.76,
          },
        );
  if (receptionKind !== "none" && reception === null) {
    throw new Error("fixture fish-crow reception was not canonical");
  }
  const canonicalBank = canonicalizeSituatedExpressionChannelBank({
    version: 1,
    channels: [{ sourceActorId: FISH_CROW_ID, state: current, reception }],
  });
  const record = createCoreWildlifeFishCrowAlarmExpressionAdmissionRecord({
    sourceActorId: FISH_CROW_ID,
    triggerEventId,
    sampleOrdinal: 0,
    admittedAtPlayerStepPhase: 0,
    sourceOwnerKey: "regional-ecology:trajectory-test",
    sourceObservationId: "observation:aerial-predator:trajectory-test",
    acceptedAtTick,
  });
  if (canonicalBank === null || record === null) {
    throw new Error("fixture fish-crow trajectory was not canonical");
  }
  return {
    bank: canonicalBank,
    ledger: ledger([record]),
    phase,
    samples: [animalSample(admitted.event, 0)],
  };
}

function humanWarningFixture(
  receptionKind: "none" | "heard-visible" | "heard-unseen",
): Fixture {
  const phase = 3;
  const acceptedAtTick = 40;
  const triggerEventId = "human-warning:0123456789abcdef";
  const admitted = accept(
    createSituatedExpressionState(),
    humanWarningIntent(triggerEventId),
  );
  const current = advanceSituatedExpression(admitted.state, phase);
  if (current === null || current.active === null) {
    throw new Error("fixture human warning expired unexpectedly");
  }
  const reception: SituatedExpressionReception | null = receptionKind === "none"
    ? null
    : receptionKind === "heard-visible"
      ? createHeardVisibleSituatedExpressionReception(
          current.active,
          acceptedAtTick,
          820_000,
          true,
        )
      : createHeardUnseenSituatedExpressionReception(
          current.active,
          acceptedAtTick,
          {
            bearing: { centerRadians: 0.75, uncertaintyRadians: 0.2 },
            distanceBand: { minimum: 3, maximum: 7 },
            certainty: 0.82,
          },
        );
  if (receptionKind !== "none" && reception === null) {
    throw new Error("fixture human warning reception was not canonical");
  }
  const canonicalBank = canonicalizeSituatedExpressionChannelBank({
    version: 1,
    channels: [{ sourceActorId: WARNING_HUMAN_ID, state: current, reception }],
  });
  const record = createHumanDangerWarningExpressionAdmissionRecord({
    sourceActorId: WARNING_HUMAN_ID,
    triggerEventId,
    sampleOrdinal: 0,
    admittedAtPlayerStepPhase: 0,
    sourceObservationId: "observation:large-predator:trajectory-test",
    acceptedAtTick,
  });
  if (canonicalBank === null || record === null) {
    throw new Error("fixture human warning trajectory was not canonical");
  }
  return {
    bank: canonicalBank,
    ledger: ledger([record]),
    phase,
    samples: [animalSample(admitted.event, 0)],
  };
}

function residentIntroductionFixture(): Fixture {
  const phase = 3;
  const introducedAtTick = 40;
  const hearingCertainty = 810_000;
  const triggerEventId = "sim-event:resident-introduced:17:4";
  const admitted = accept(
    createSituatedExpressionState(),
    residentIntroductionIntent(triggerEventId),
  );
  const current = advanceSituatedExpression(admitted.state, phase);
  if (current === null || current.active === null) {
    throw new Error("fixture resident introduction expired unexpectedly");
  }
  const reception = createHeardVisibleSituatedExpressionReception(
    current.active,
    introducedAtTick,
    hearingCertainty,
    true,
  );
  const canonicalBank = canonicalizeSituatedExpressionChannelBank({
    version: 1,
    channels: [{
      sourceActorId: INTRODUCING_RESIDENT_ID,
      state: current,
      reception,
    }],
  });
  const record = createResidentIntroductionExpressionAdmissionRecord({
    sourceActorId: INTRODUCING_RESIDENT_ID,
    triggerEventId,
    sampleOrdinal: 0,
    admittedAtPlayerStepPhase: 0,
    commandId: "greet-expression-trajectory-introduction",
    introducedAtTick,
    homeSettlementId: 3,
    listenerPosition: POSITION,
    listenerFacingMilliRadians: 0,
    hearingCertainty,
  });
  if (canonicalBank === null || reception === null || record === null) {
    throw new Error("fixture resident introduction trajectory was not canonical");
  }
  return {
    bank: canonicalBank,
    ledger: ledger([record]),
    phase,
    samples: [residentIntroductionSample(admitted.event, 0)],
  };
}

function residentWeatherHoldFixture(
  receptionKind: "none" | "heard-visible" | "heard-unseen",
): Fixture {
  const phase = 3;
  const shelteredAtTick = 40;
  const hearingCertainty = receptionKind === "none" ? null : 760_000;
  const triggerEventId = "sim-event:resident-sheltered:18:5";
  const admitted = accept(
    createSituatedExpressionState(),
    residentWeatherHoldIntent(triggerEventId),
  );
  const current = advanceSituatedExpression(admitted.state, phase);
  if (current === null || current.active === null) {
    throw new Error("fixture resident weather hold expired unexpectedly");
  }
  const reception: SituatedExpressionReception | null = receptionKind === "none"
    ? null
    : receptionKind === "heard-visible"
      ? createHeardVisibleSituatedExpressionReception(
          current.active,
          shelteredAtTick,
          hearingCertainty ?? 0,
          true,
        )
      : createHeardUnseenSituatedExpressionReception(
          current.active,
          shelteredAtTick,
          {
            bearing: { centerRadians: 0.75, uncertaintyRadians: 0.2 },
            distanceBand: { minimum: 3, maximum: 7 },
            certainty: (hearingCertainty ?? 0) / 1_000_000,
          },
        );
  if (receptionKind !== "none" && reception === null) {
    throw new Error("fixture resident weather-hold reception was not canonical");
  }
  const canonicalBank = canonicalizeSituatedExpressionChannelBank({
    version: 1,
    channels: [{
      sourceActorId: WEATHER_HOLD_RESIDENT_ID,
      state: current,
      reception,
    }],
  });
  const record = createResidentWeatherHoldExpressionAdmissionRecord({
    sourceActorId: WEATHER_HOLD_RESIDENT_ID,
    triggerEventId,
    sampleOrdinal: 0,
    admittedAtPlayerStepPhase: 0,
    contractId: 7,
    shelteredAtTick,
    eventRouteId: 4,
    eventRouteProgress: 450_000,
    listenerPosition: POSITION,
    listenerFacingMilliRadians: 0,
    listenerWasSleepingAtAdmission: false,
    receptionKind: receptionKind === "none" ? null : receptionKind,
    hearingCertainty,
  });
  if (canonicalBank === null || record === null) {
    throw new Error("fixture resident weather-hold trajectory was not canonical");
  }
  return {
    bank: canonicalBank,
    ledger: ledger([record]),
    phase,
    samples: [residentIntroductionSample(admitted.event, 0)],
  };
}

function oneAdmissionFixture(): Fixture {
  const admissionPhase = 2;
  const phase = 5;
  const admitted = accept(createSituatedExpressionState(), intent("incident:one"));
  const state = advanceSituatedExpression(admitted.state, phase - admissionPhase);
  if (state === null) throw new Error("fixture state did not advance");
  return {
    bank: bank(state),
    ledger: ledger([traversalRecord(admitted.event, 0, admissionPhase)]),
    phase,
    samples: [sample(admitted.event, 0)],
  };
}

function playerExhaustionFixture(): Fixture {
  const admissionPhase = 3;
  const phase = 6;
  const evidence = {
    committedWorldTick: 73,
    admittedAtPlayerStepPhase: admissionPhase,
    acceptedDistanceUnits: 105,
    resolution: "dry-exhaustion-camp" as const,
  };
  const candidate = playerEffortExpressionIntent({
    sourceActorId: PLAYER_ID,
    position: POSITION,
    ...evidence,
  });
  if (candidate === null) throw new Error("fixture effort intent was not canonical");
  const admitted = accept(createSituatedExpressionState(), candidate);
  const state = advanceSituatedExpression(admitted.state, phase - admissionPhase);
  const record = createPlayerExhaustionExpressionAdmissionRecord({
    sourceActorId: PLAYER_ID,
    triggerEventId: admitted.event.triggerEventId,
    sampleOrdinal: 0,
    ...evidence,
  });
  if (state === null || state.active === null || record === null) {
    throw new Error("fixture effort trajectory was not canonical");
  }
  return {
    bank: bank(state),
    ledger: ledger([record]),
    phase,
    samples: [sample(admitted.event, 0)],
  };
}

function legacyActiveFixture(): Fixture {
  const admissionPhase = 2;
  const phase = 5;
  const admitted = accept(
    createSituatedExpressionState(),
    intent("legacy:trajectory:active"),
  );
  const state = advanceSituatedExpression(admitted.state, phase - admissionPhase);
  if (state === null) throw new Error("legacy fixture state did not advance");
  return {
    bank: bank(state),
    ledger: ledger([legacyRecord(admitted.event, 0, admissionPhase)]),
    phase,
    samples: [sample(admitted.event, 0)],
  };
}

function interruptedFixture(): Fixture {
  const firstPhase = 1;
  const secondPhase = 3;
  const phase = 5;
  const first = accept(createSituatedExpressionState(), intent("incident:first"));
  const atSecondPhase = advanceSituatedExpression(first.state, secondPhase - firstPhase);
  if (atSecondPhase === null) throw new Error("fixture state did not reach interruption");
  const second = accept(atSecondPhase, seriousIntent("incident:second"));
  const current = advanceSituatedExpression(second.state, phase - secondPhase);
  if (current === null) throw new Error("fixture interrupted state did not advance");
  return {
    bank: bank(current),
    ledger: ledger([
      traversalRecord(first.event, 0, firstPhase),
      traversalRecord(second.event, 1, secondPhase),
    ]),
    phase,
    samples: [sample(first.event, 0), sample(second.event, 1)],
  };
}

function accepts(fixture: Fixture): boolean {
  return situatedExpressionTrajectoryIsCanonical(
    fixture.bank,
    fixture.ledger,
    fixture.phase,
    fixture.samples,
  );
}

describe("situated-expression admission trajectory", () => {
  it("canonicalizes a phase-aged admission as one frozen conserved bundle", () => {
    const fixture = oneAdmissionFixture();
    const canonical = canonicalizeSituatedExpressionTrajectory(
      fixture.bank,
      fixture.ledger,
      fixture.phase,
      fixture.samples,
    );

    expect(canonical).not.toBeNull();
    expect(canonical?.bank.channels[0]?.state).toMatchObject({
      completedSteps: 3,
      active: { audioAcknowledged: true, durationSteps: 7, remainingSteps: 4 },
      recent: [{
        meaningCooldownRemainingSteps: 9,
        familyCooldownRemainingSteps: 1,
      }],
    });
    expect(Object.isFrozen(canonical)).toBe(true);
    expect(Object.isFrozen(canonical?.supplementalSoundSamples)).toBe(true);
  });

  it("binds phase-aged dry exhaustion to its exact murmur, lifetime, and cooldowns", () => {
    const fixture = playerExhaustionFixture();
    const canonical = canonicalizeSituatedExpressionTrajectory(
      fixture.bank,
      fixture.ledger,
      fixture.phase,
      fixture.samples,
    );

    expect(canonical).not.toBeNull();
    expect(canonical?.bank.channels[0]).toMatchObject({
      sourceActorId: PLAYER_ID,
      reception: { kind: "self", certainty: 1_000_000 },
      state: {
        completedSteps: 3,
        active: {
          meaning: "need-rest-after-exertion",
          family: "condition",
          tone: "strained",
          volume: "murmur",
          knowledgeBasis: "self-felt-exhaustion",
          priority: 260_000,
          salience: 440_000,
          durationSteps: 8,
          remainingSteps: 5,
          audioAcknowledged: true,
        },
        recent: [{
          meaning: "need-rest-after-exertion",
          family: "condition",
          priority: 260_000,
          meaningCooldownRemainingSteps: 33,
          familyCooldownRemainingSteps: 9,
        }],
      },
    });
    expect(canonical?.supplementalSoundSamples[0]).toMatchObject({
      soundLoudness: 360_000,
      soundRangeUnits: 8_000,
      soundClass: "human-vocalization",
      soundInterrupt: "none",
      sourceActorId: PLAYER_ID,
    });
  });

  it("rejects tampered dry-exhaustion admission, event, acoustics, or phase", () => {
    const fixture = playerExhaustionFixture();

    const changedAdmission = mutable(fixture.ledger);
    const admission = changedAdmission.records[0];
    if (admission?.kind !== "player-exhaustion") {
      throw new Error("fixture lost effort admission");
    }
    admission.acceptedDistanceUnits += 1;

    const changedEvent = mutable(fixture.bank);
    changedEvent.channels[0]!.state.active!.priority -= 1;
    changedEvent.channels[0]!.state.recent[0]!.priority -= 1;
    expect(canonicalizeSituatedExpressionChannelBank(changedEvent)).not.toBeNull();

    const acousticMutations = [
      { soundLoudness: 360_001 },
      { soundRangeUnits: 8_001 },
      { soundInterrupt: "strong" as const },
    ];

    expect(situatedExpressionTrajectoryIsCanonical(
      fixture.bank,
      changedAdmission,
      fixture.phase,
      fixture.samples,
    )).toBe(false);
    expect(situatedExpressionTrajectoryIsCanonical(
      changedEvent,
      fixture.ledger,
      fixture.phase,
      fixture.samples,
    )).toBe(false);
    for (const mutation of acousticMutations) {
      expect(situatedExpressionTrajectoryIsCanonical(
        fixture.bank,
        fixture.ledger,
        fixture.phase,
        [{ ...fixture.samples[0]!, ...mutation }],
      )).toBe(false);
    }
    expect(situatedExpressionTrajectoryIsCanonical(
      fixture.bank,
      fixture.ledger,
      fixture.phase + 1,
      fixture.samples,
    )).toBe(false);
  });

  it("accepts exact newest-first chronology after a higher-priority interruption", () => {
    const fixture = interruptedFixture();

    expect(accepts(fixture)).toBe(true);
    expect(fixture.bank.channels[0]?.state.recent.map(({ triggerEventId }) => triggerEventId))
      .toEqual(["incident:second", "incident:first"]);
  });

  it("accepts an expired active event while retaining its exactly aged cooldown memory", () => {
    const admissionPhase = 2;
    const phase = 9;
    const admitted = accept(
      createSituatedExpressionState(),
      intent("incident:expired"),
    );
    const state = advanceSituatedExpression(admitted.state, phase - admissionPhase);
    if (state === null || state.active !== null) throw new Error("fixture event did not expire");
    const fixture: Fixture = {
      bank: bank(state),
      ledger: ledger([traversalRecord(admitted.event, 0, admissionPhase)]),
      phase,
      samples: [sample(admitted.event, 0)],
    };

    expect(accepts(fixture)).toBe(true);
  });

  it("binds an active porter's receipt tick and certainty to its admission", () => {
    const fixture = porterFixture();
    expect(accepts(fixture)).toBe(true);

    const changedTick = mutable(fixture.bank);
    if (changedTick.channels[0]!.reception?.kind !== "heard-visible") {
      throw new Error("fixture lost porter reception");
    }
    changedTick.channels[0]!.reception.receivedAtTick += 1;
    const changedCertainty = mutable(fixture.bank);
    if (changedCertainty.channels[0]!.reception?.kind !== "heard-visible") {
      throw new Error("fixture lost porter reception");
    }
    changedCertainty.channels[0]!.reception.certainty -= 1;

    expect(situatedExpressionTrajectoryIsCanonical(
      changedTick, fixture.ledger, fixture.phase, fixture.samples,
    )).toBe(false);
    expect(situatedExpressionTrajectoryIsCanonical(
      changedCertainty, fixture.ledger, fixture.phase, fixture.samples,
    )).toBe(false);
  });

  it("accepts world-only and lawfully received guardian calls with animal acoustics", () => {
    for (const receptionKind of ["none", "heard-visible", "heard-unseen"] as const) {
      const fixture = guardianDogFixture(receptionKind);
      expect(accepts(fixture), receptionKind).toBe(true);
      expect(fixture.samples[0]).toMatchObject({
        sourceActorId: GUARDIAN_DOG_ID,
        soundClass: "animal-alarm",
        soundInterrupt: "strong",
      });
      expect(fixture.bank.channels[0]?.reception?.kind ?? "none").toBe(receptionKind);
    }
  });

  it("rejects a guardian call with a human sound class or mistimed player receipt", () => {
    const worldOnly = guardianDogFixture("none");
    const humanClass = mutable(worldOnly.samples);
    humanClass[0]!.soundClass = "human-vocalization";
    expect(situatedExpressionTrajectoryIsCanonical(
      worldOnly.bank,
      worldOnly.ledger,
      worldOnly.phase,
      humanClass,
    )).toBe(false);

    const received = guardianDogFixture("heard-visible");
    const mistimed = mutable(received.bank);
    if (mistimed.channels[0]!.reception?.kind !== "heard-visible") {
      throw new Error("fixture lost guardian reception");
    }
    mistimed.channels[0]!.reception.receivedAtTick += 1;
    expect(situatedExpressionTrajectoryIsCanonical(
      mistimed,
      received.ledger,
      received.phase,
      received.samples,
    )).toBe(false);

    const selfReceipt = mutable(worldOnly.bank);
    const event = selfReceipt.channels[0]!.state.active;
    if (event === null) throw new Error("fixture lost guardian event");
    selfReceipt.channels[0]!.reception = {
      version: 1,
      eventId: event.eventId,
      sourceActorId: event.sourceActorId,
      receivedAtTick: 40,
      kind: "self",
      certainty: 1_000_000,
    };
    expect(situatedExpressionTrajectoryIsCanonical(
      selfReceipt,
      worldOnly.ledger,
      worldOnly.phase,
      worldOnly.samples,
    )).toBe(false);
  });

  it("binds fish-crow alarm policy and specialized acoustics to its admission", () => {
    const expectedAcoustics = situatedExpressionAcoustics({
      meaning: "fish-crow-alarm-call",
      volume: "shout",
    });
    for (const receptionKind of ["none", "heard-visible", "heard-unseen"] as const) {
      const fixture = fishCrowFixture(receptionKind);
      expect(accepts(fixture), receptionKind).toBe(true);
      expect(fixture.bank.channels[0]?.state.active).toMatchObject({
        meaning: "fish-crow-alarm-call",
        priority: 760_000,
        tone: "alarmed",
        volume: "shout",
        durationSteps: 6,
        remainingSteps: 3,
      });
      expect(fixture.samples[0]).toMatchObject({
        soundLoudness: expectedAcoustics.loudness,
        soundRangeUnits: expectedAcoustics.rangeUnits,
        soundClass: "animal-alarm",
        soundInterrupt: "strong",
      });
    }

    const exact = fishCrowFixture("none");
    const genericShout = mutable(exact.samples);
    const genericAcoustics = situatedExpressionAcoustics("shout");
    genericShout[0]!.soundLoudness = genericAcoustics.loudness;
    genericShout[0]!.soundRangeUnits = genericAcoustics.rangeUnits;
    expect(situatedExpressionTrajectoryIsCanonical(
      exact.bank, exact.ledger, exact.phase, genericShout,
    )).toBe(false);

    const rewrittenPriority = mutable(exact.bank);
    rewrittenPriority.channels[0]!.state.active!.priority -= 1;
    rewrittenPriority.channels[0]!.state.recent[0]!.priority -= 1;
    expect(canonicalizeSituatedExpressionChannelBank(rewrittenPriority)).not.toBeNull();
    expect(situatedExpressionTrajectoryIsCanonical(
      rewrittenPriority, exact.ledger, exact.phase, exact.samples,
    )).toBe(false);

    const resetDuration = mutable(exact.bank);
    resetDuration.channels[0]!.state.active!.durationSteps += 1;
    resetDuration.channels[0]!.state.active!.remainingSteps += 1;
    expect(canonicalizeSituatedExpressionChannelBank(resetDuration)).not.toBeNull();
    expect(situatedExpressionTrajectoryIsCanonical(
      resetDuration, exact.ledger, exact.phase, exact.samples,
    )).toBe(false);
  });

  it("binds human warnings to critical priority and non-recursive danger acoustics", () => {
    for (const receptionKind of ["none", "heard-visible", "heard-unseen"] as const) {
      const fixture = humanWarningFixture(receptionKind);
      expect(accepts(fixture), receptionKind).toBe(true);
      expect(fixture.bank.channels[0]?.state.active).toMatchObject({
        meaning: "human-danger-warning",
        priority: HUMAN_DANGER_WARNING_PRIORITY,
        tone: "alarmed",
        volume: "shout",
        remainingSteps: 3,
      });
      expect(fixture.samples[0]).toMatchObject({
        sourceActorId: WARNING_HUMAN_ID,
        soundClass: "danger-sound",
        soundInterrupt: "strong",
      });
    }

    const exact = humanWarningFixture("none");
    const wrongPriority = mutable(exact.bank);
    wrongPriority.channels[0]!.state.active!.priority -= 1;
    wrongPriority.channels[0]!.state.recent[0]!.priority -= 1;
    expect(canonicalizeSituatedExpressionChannelBank(wrongPriority)).not.toBeNull();
    expect(situatedExpressionTrajectoryIsCanonical(
      wrongPriority,
      exact.ledger,
      exact.phase,
      exact.samples,
    )).toBe(false);
  });

  it("binds a resident introduction to its exact receipt, spoken acoustics, semantics, and lifetime", () => {
    const fixture = residentIntroductionFixture();
    const canonical = canonicalizeSituatedExpressionTrajectory(
      fixture.bank,
      fixture.ledger,
      fixture.phase,
      fixture.samples,
    );

    expect(canonical).not.toBeNull();
    expect(canonical?.bank.channels[0]).toMatchObject({
      sourceActorId: INTRODUCING_RESIDENT_ID,
      reception: {
        kind: "heard-visible",
        receivedAtTick: 40,
        certainty: 810_000,
      },
      state: {
        completedSteps: 3,
        active: {
          meaning: "resident-introduction",
          family: "social",
          tone: "restrained",
          volume: "spoken",
          knowledgeBasis: "self-committed-introduction",
          priority: 650_000,
          salience: 780_000,
          durationSteps: 56,
          remainingSteps: 53,
          audioAcknowledged: true,
        },
        recent: [{
          meaning: "resident-introduction",
          family: "social",
          priority: 650_000,
          meaningCooldownRemainingSteps: 77,
          familyCooldownRemainingSteps: 21,
        }],
      },
    });
    expect(canonical?.supplementalSoundSamples[0]).toMatchObject({
      soundLoudness: 620_000,
      soundRangeUnits: 18_000,
      soundClass: "human-vocalization",
      soundInterrupt: "none",
      sourceActorId: INTRODUCING_RESIDENT_ID,
    });
  });

  it("rejects resident-introduction receipt, lifetime, acoustic, and semantic tampering", () => {
    const fixture = residentIntroductionFixture();

    const changedHearing = mutable(fixture.ledger);
    const admission = changedHearing.records[0];
    if (admission?.kind !== "resident-introduction") {
      throw new Error("fixture lost resident-introduction admission");
    }
    admission.hearingCertainty -= 1;
    expect(canonicalizeSituatedExpressionAdmissionLedger(changedHearing)).not.toBeNull();

    const resetDuration = mutable(fixture.bank);
    resetDuration.channels[0]!.state.active!.durationSteps += 1;
    resetDuration.channels[0]!.state.active!.remainingSteps += 1;
    expect(canonicalizeSituatedExpressionChannelBank(resetDuration)).not.toBeNull();

    const rewrittenSemantics = mutable(fixture.bank);
    rewrittenSemantics.channels[0]!.state.active!.priority -= 1;
    rewrittenSemantics.channels[0]!.state.recent[0]!.priority -= 1;
    expect(canonicalizeSituatedExpressionChannelBank(rewrittenSemantics)).not.toBeNull();

    const changedAcoustics = mutable(fixture.samples);
    changedAcoustics[0]!.soundLoudness -= 1;

    for (const [bankValue, ledgerValue, samplesValue] of [
      [fixture.bank, changedHearing, fixture.samples],
      [resetDuration, fixture.ledger, fixture.samples],
      [rewrittenSemantics, fixture.ledger, fixture.samples],
      [fixture.bank, fixture.ledger, changedAcoustics],
    ] as const) {
      expect(situatedExpressionTrajectoryIsCanonical(
        bankValue,
        ledgerValue,
        fixture.phase,
        samplesValue,
      )).toBe(false);
    }
  });

  it("binds resident weather holds to nullable event-time receipts and exact spoken semantics", () => {
    for (const receptionKind of ["none", "heard-visible", "heard-unseen"] as const) {
      const fixture = residentWeatherHoldFixture(receptionKind);
      const canonical = canonicalizeSituatedExpressionTrajectory(
        fixture.bank,
        fixture.ledger,
        fixture.phase,
        fixture.samples,
      );

      expect(canonical, receptionKind).not.toBeNull();
      expect(canonical?.bank.channels[0]).toMatchObject({
        sourceActorId: WEATHER_HOLD_RESIDENT_ID,
        reception: receptionKind === "none"
          ? null
          : {
              kind: receptionKind,
              receivedAtTick: 40,
              certainty: 760_000,
            },
        state: {
          completedSteps: 3,
          active: {
            meaning: "resident-weather-hold",
            family: "condition",
            tone: "restrained",
            volume: "spoken",
            knowledgeBasis: "self-weather-distress",
            priority: 300_000,
            salience: 520_000,
            durationSteps: 12,
            remainingSteps: 9,
            audioAcknowledged: true,
          },
          recent: [{
            meaning: "resident-weather-hold",
            family: "condition",
            priority: 300_000,
            meaningCooldownRemainingSteps: 33,
            familyCooldownRemainingSteps: 9,
          }],
        },
      });
      expect(canonical?.supplementalSoundSamples[0]).toMatchObject({
        soundLoudness: 620_000,
        soundRangeUnits: 18_000,
        soundClass: "human-vocalization",
        soundInterrupt: "none",
        sourceActorId: WEATHER_HOLD_RESIDENT_ID,
      });
    }
  });

  it("rejects weather-hold receipt, lifetime, acoustic, and semantic tampering", () => {
    const none = residentWeatherHoldFixture("none");
    const visible = residentWeatherHoldFixture("heard-visible");
    const unseen = residentWeatherHoldFixture("heard-unseen");

    expect(situatedExpressionTrajectoryIsCanonical(
      visible.bank, unseen.ledger, visible.phase, visible.samples,
    )).toBe(false);
    expect(situatedExpressionTrajectoryIsCanonical(
      unseen.bank, visible.ledger, unseen.phase, unseen.samples,
    )).toBe(false);
    expect(situatedExpressionTrajectoryIsCanonical(
      none.bank, visible.ledger, none.phase, none.samples,
    )).toBe(false);
    expect(situatedExpressionTrajectoryIsCanonical(
      visible.bank, none.ledger, visible.phase, visible.samples,
    )).toBe(false);

    const changedHearing = mutable(visible.ledger);
    const admission = changedHearing.records[0];
    if (admission?.kind !== "resident-weather-hold") {
      throw new Error("fixture lost resident-weather-hold admission");
    }
    if (admission.hearingCertainty === null) {
      throw new Error("visible fixture lost hearing certainty");
    }
    admission.hearingCertainty -= 1;
    expect(canonicalizeSituatedExpressionAdmissionLedger(changedHearing)).not.toBeNull();

    const resetDuration = mutable(visible.bank);
    resetDuration.channels[0]!.state.active!.durationSteps += 1;
    resetDuration.channels[0]!.state.active!.remainingSteps += 1;
    expect(canonicalizeSituatedExpressionChannelBank(resetDuration)).not.toBeNull();

    const rewrittenSemantics = mutable(visible.bank);
    rewrittenSemantics.channels[0]!.state.active!.salience -= 1;
    expect(canonicalizeSituatedExpressionChannelBank(rewrittenSemantics)).not.toBeNull();

    const changedAcoustics = mutable(visible.samples);
    changedAcoustics[0]!.soundRangeUnits -= 1;

    for (const [bankValue, ledgerValue, samplesValue] of [
      [visible.bank, changedHearing, visible.samples],
      [resetDuration, visible.ledger, visible.samples],
      [rewrittenSemantics, visible.ledger, visible.samples],
      [visible.bank, visible.ledger, changedAcoustics],
    ] as const) {
      expect(situatedExpressionTrajectoryIsCanonical(
        bankValue,
        ledgerValue,
        visible.phase,
        samplesValue,
      )).toBe(false);
    }
  });

  it("derives legacy-v33 lifetime from bound memory and rejects later erasure or reset", () => {
    const fixture = legacyActiveFixture();
    expect(accepts(fixture)).toBe(true);

    const erased = mutable(fixture.bank);
    erased.channels[0]!.state.active = null;
    erased.channels[0]!.reception = null;
    const reset = mutable(fixture.bank);
    reset.channels[0]!.state.active!.durationSteps += 1;
    reset.channels[0]!.state.active!.remainingSteps += 1;

    expect(situatedExpressionTrajectoryIsCanonical(
      erased, fixture.ledger, fixture.phase, fixture.samples,
    )).toBe(false);
    expect(situatedExpressionTrajectoryIsCanonical(
      reset, fixture.ledger, fixture.phase, fixture.samples,
    )).toBe(false);
  });

  it("accepts a legacy-v33 event only once its bound fixed lifetime has expired", () => {
    const admissionPhase = 2;
    const phase = 9;
    const admitted = accept(
      createSituatedExpressionState(),
      intent("legacy:trajectory:expired"),
    );
    const state = advanceSituatedExpression(admitted.state, phase - admissionPhase);
    if (state === null || state.active !== null) {
      throw new Error("legacy fixture event did not expire");
    }
    const fixture: Fixture = {
      bank: bank(state),
      ledger: ledger([legacyRecord(admitted.event, 0, admissionPhase)]),
      phase,
      samples: [sample(admitted.event, 0)],
    };

    expect(accepts(fixture)).toBe(true);
  });

  it("rejects fish-crow semantics smuggled through a legacy-v33 admission", () => {
    const admitted = accept(createSituatedExpressionState(), {
      ...fishCrowIntent("legacy:trajectory:fish-crow"),
      sourceActorId: PLAYER_ID,
    });
    const fixture: Fixture = {
      bank: bank(admitted.state),
      ledger: ledger([legacyRecord(admitted.event, 0, 0)]),
      phase: 0,
      // A forged human tuple must not let the post-v33 meaning cross the legacy boundary.
      samples: [sample(admitted.event, 0)],
    };

    expect(accepts(fixture)).toBe(false);
  });

  it("rejects a deleted, extra, reordered, or rebound pending sound", () => {
    const fixture = interruptedFixture();
    const rebound = mutable(fixture.samples);
    rebound[0] = { ...rebound[0]!, expressionEventId: rebound[1]!.expressionEventId };

    expect(situatedExpressionTrajectoryIsCanonical(
      fixture.bank, fixture.ledger, fixture.phase, fixture.samples.slice(1),
    )).toBe(false);
    expect(situatedExpressionTrajectoryIsCanonical(
      fixture.bank, fixture.ledger, fixture.phase, [...fixture.samples, fixture.samples[0]!],
    )).toBe(false);
    expect(situatedExpressionTrajectoryIsCanonical(
      fixture.bank, fixture.ledger, fixture.phase, [...fixture.samples].reverse(),
    )).toBe(false);
    expect(situatedExpressionTrajectoryIsCanonical(
      fixture.bank, fixture.ledger, fixture.phase, rebound,
    )).toBe(false);
  });

  it("rejects reordered or deleted recent memory and an orphan ledger admission", () => {
    const fixture = interruptedFixture();
    const reordered = mutable(fixture.bank);
    reordered.channels[0]!.state.recent.reverse();
    const missing = mutable(fixture.bank);
    missing.channels[0]!.state.recent.pop();
    const extraLedger = mutable(fixture.ledger);
    const orphanEventId = situatedExpressionEventIdForTrigger(PLAYER_ID, "incident:orphan");
    if (orphanEventId === null) throw new Error("fixture orphan identity failed");
    extraLedger.records.push({
      ...extraLedger.records[1]!,
      triggerEventId: "incident:orphan",
      eventId: orphanEventId,
      sampleOrdinal: 2,
    });

    expect(situatedExpressionTrajectoryIsCanonical(
      reordered, fixture.ledger, fixture.phase, fixture.samples,
    )).toBe(false);
    expect(situatedExpressionTrajectoryIsCanonical(
      missing, fixture.ledger, fixture.phase, fixture.samples,
    )).toBe(false);
    expect(situatedExpressionTrajectoryIsCanonical(
      fixture.bank, extraLedger, fixture.phase, fixture.samples,
    )).toBe(false);
  });

  it("rejects cooldown, completed-step, active-duration, and acknowledgement resets", () => {
    const fixture = oneAdmissionFixture();
    const cooldown = mutable(fixture.bank);
    cooldown.channels[0]!.state.recent[0]!.meaningCooldownRemainingSteps += 1;
    const completed = mutable(fixture.bank);
    completed.channels[0]!.state.completedSteps = 0;
    const duration = mutable(fixture.bank);
    duration.channels[0]!.state.active!.remainingSteps += 1;
    const durationReset = mutable(fixture.bank);
    durationReset.channels[0]!.state.active!.durationSteps += 1;
    durationReset.channels[0]!.state.active!.remainingSteps += 1;
    const unacknowledged = mutable(fixture.bank);
    unacknowledged.channels[0]!.state.active!.audioAcknowledged = false;
    const erasedActive = mutable(fixture.bank);
    erasedActive.channels[0]!.state.active = null;
    erasedActive.channels[0]!.reception = null;

    for (const candidate of [
      cooldown,
      completed,
      duration,
      durationReset,
      unacknowledged,
      erasedActive,
    ]) {
      expect(situatedExpressionTrajectoryIsCanonical(
        candidate, fixture.ledger, fixture.phase, fixture.samples,
      )).toBe(false);
    }
  });

  it("rejects a negative-age phase wrap and an older interrupted event restored active", () => {
    const single = oneAdmissionFixture();
    expect(situatedExpressionTrajectoryIsCanonical(
      single.bank, single.ledger, 1, single.samples,
    )).toBe(false);

    const interrupted = interruptedFixture();
    const restored = mutable(interrupted.bank);
    const oldIntent = intent("incident:first");
    const oldAtCurrentPhase = accept(createSituatedExpressionState(), oldIntent).state.active;
    if (oldAtCurrentPhase === null) throw new Error("fixture old event was absent");
    restored.channels[0]!.state.active = {
      ...oldAtCurrentPhase,
      remainingSteps: 3,
      audioAcknowledged: true,
    };
    restored.channels[0]!.reception = createSelfSituatedExpressionReception(
      restored.channels[0]!.state.active,
      40,
    );

    expect(situatedExpressionTrajectoryIsCanonical(
      restored, interrupted.ledger, interrupted.phase, interrupted.samples,
    )).toBe(false);
  });

  it("rejects chronological phase rollback and a canonical causal-class rewrite", () => {
    const interrupted = interruptedFixture();
    const rollback = mutable(interrupted.ledger);
    rollback.records[0]!.admittedAtPlayerStepPhase = 4;
    expect(canonicalizeSituatedExpressionAdmissionLedger(rollback)).not.toBeNull();
    expect(situatedExpressionTrajectoryIsCanonical(
      interrupted.bank, rollback, interrupted.phase, interrupted.samples,
    )).toBe(false);

    const single = oneAdmissionFixture();
    const rewritten = mutable(single.ledger);
    const record = rewritten.records[0];
    if (record?.kind !== "player-traversal") {
      throw new Error("fixture lost traversal admission");
    }
    record.causalClass = "serious-stumble";
    record.hazardSeverity = 700_000;
    expect(canonicalizeSituatedExpressionAdmissionLedger(rewritten)).not.toBeNull();
    expect(situatedExpressionTrajectoryIsCanonical(
      single.bank, rewritten, single.phase, single.samples,
    )).toBe(false);
  });

  it("rejects malformed phases and sparse sound arrays", () => {
    const fixture = oneAdmissionFixture();
    const sparse = Array<SupplementalSoundSample>(1);

    for (const phase of [-1, -0, 1.5, Number.MAX_SAFE_INTEGER + 1, "5"]) {
      expect(situatedExpressionTrajectoryIsCanonical(
        fixture.bank, fixture.ledger, phase, fixture.samples,
      )).toBe(false);
    }
    expect(situatedExpressionTrajectoryIsCanonical(
      fixture.bank, fixture.ledger, fixture.phase, sparse,
    )).toBe(false);
  });
});

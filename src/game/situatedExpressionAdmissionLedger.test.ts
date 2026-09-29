import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import { situatedExpressionEventIdForTrigger } from "./situatedExpression";
import { guardianDogShelterWhineTriggerEventId } from "./dogSignalExpression";
import {
  SITUATED_EXPRESSION_ADMISSION_LEDGER_MAX_RECORDS,
  SITUATED_EXPRESSION_ADMISSION_MAX_SEPARATED_ENTITY_IDS,
  appendSituatedExpressionAdmissionRecord,
  canonicalizeSituatedExpressionAdmissionLedger,
  canonicalizeSituatedExpressionAdmissionRecord,
  createCoreWildlifeFishCrowAlarmExpressionAdmissionRecord,
  createGuardianDogDefensiveGrowlExpressionAdmissionRecord,
  createGuardianDogShelterWhineExpressionAdmissionRecord,
  createGuardianDogWarningExpressionAdmissionRecord,
  createLegacyV33PlayerExpressionAdmissionRecord,
  createPlayerFallRecoveryExpressionAdmissionRecord,
  createPlayerTraversalExpressionAdmissionRecord,
  createPorterHeavyDepartureExpressionAdmissionRecord,
  createSituatedExpressionAdmissionLedger,
  type GuardianDogShelterWhineExpressionAdmissionInput,
  type PlayerTraversalExpressionAdmissionInput,
  type SituatedExpressionAdmissionLedger,
  type SituatedExpressionAdmissionRecord,
} from "./situatedExpressionAdmissionLedger";
import { createWorldPosition } from "./worldPosition";

const PLAYER_ID = LOCAL_PLAYER_LIVING_ACTOR_ID;
const PORTER_ID = "H-porter-admission";
const GUARDIAN_DOG_ID = "D-guardian-admission";
const POSITION = createWorldPosition(createRegionCoord(-4, 11), 17_000, 29_000);

function traversalInput(
  sampleOrdinal = 0,
  sourceActorId: string = PLAYER_ID,
  triggerEventId = `traversal:${sampleOrdinal}`,
): PlayerTraversalExpressionAdmissionInput {
  return {
    sourceActorId,
    triggerEventId,
    sampleOrdinal,
    admittedAtPlayerStepPhase: 0,
    causalClass: "ordinary-stumble",
    incidentKind: "stumble",
    hazardSeverity: 220_000,
    cargoOutcome: "unchanged",
    selectedPayloadKind: null,
    cargoShock: 80_000,
    separatedEntityIds: [],
    separationEventId: null,
  };
}

function traversalRecord(
  sampleOrdinal = 0,
  sourceActorId: string = PLAYER_ID,
  triggerEventId = `traversal:${sampleOrdinal}`,
): SituatedExpressionAdmissionRecord {
  const record = createPlayerTraversalExpressionAdmissionRecord(
    traversalInput(sampleOrdinal, sourceActorId, triggerEventId),
  );
  if (record === null) throw new Error("Expected canonical traversal admission");
  return record;
}

function porterRecord(
  sampleOrdinal: number,
  sourceActorId: string = PORTER_ID,
  triggerEventId = `departure:${sampleOrdinal}`,
): SituatedExpressionAdmissionRecord {
  const record = createPorterHeavyDepartureExpressionAdmissionRecord({
    sourceActorId,
    triggerEventId,
    sampleOrdinal,
    admittedAtPlayerStepPhase: 0,
    receivedAtTick: 912,
    listenerPosition: POSITION,
    listenerFacingMilliRadians: 0,
    hearingCertainty: 620_000,
  });
  if (record === null) throw new Error("Expected canonical porter admission");
  return record;
}

function rawLedger(records: readonly unknown[]): unknown {
  return { version: 1, records };
}

describe("situated-expression admission ledger", () => {
  it("constructs every admission kind with exact derived event identity", () => {
    const traversal = traversalRecord();
    const recovery = createPlayerFallRecoveryExpressionAdmissionRecord({
      sourceActorId: PLAYER_ID,
      triggerEventId: "recovery:event:1",
      sampleOrdinal: 1,
      admittedAtPlayerStepPhase: 4,
      recoveryEventId: "recovery:event:1",
      recoveredEntityId: "cargo:medicine:1",
    });
    const porter = createPorterHeavyDepartureExpressionAdmissionRecord({
      sourceActorId: PORTER_ID,
      triggerEventId: "departure:event:1",
      sampleOrdinal: 2,
      admittedAtPlayerStepPhase: 0,
      receivedAtTick: 912,
      listenerPosition: POSITION,
      listenerFacingMilliRadians: -1_571,
      hearingCertainty: 780_000,
    });
    const guardianDog = createGuardianDogWarningExpressionAdmissionRecord({
      sourceActorId: GUARDIAN_DOG_ID,
      triggerEventId: "working-animal:activity:guardian-warning:1",
      sampleOrdinal: 3,
      admittedAtPlayerStepPhase: 0,
      assignmentId: "working-animal:assignment:guardian:1",
      activityTransactionId: "working-animal:activity:guardian-warning:1",
      sourceObservationId: "observation:anonymous-alarm:1",
      acceptedAtTick: 912,
    });
    const guardianGrowl = createGuardianDogDefensiveGrowlExpressionAdmissionRecord({
      sourceActorId: GUARDIAN_DOG_ID,
      triggerEventId: "working-animal:activity:guardian-growl:1",
      sampleOrdinal: 4,
      admittedAtPlayerStepPhase: 0,
      assignmentId: "working-animal:assignment:guardian:1",
      activityTransactionId: "working-animal:activity:guardian-growl:1",
      sourceObservationId: "observation:threat:1",
      acceptedAtTick: 912,
      listenerWasSleepingAtAdmission: false,
    });
    const guardianWhineActivityId = "working-animal:activity:guardian-shelter-whine:1";
    const guardianWhineScore = 640_000;
    const guardianWhineTriggerId = guardianDogShelterWhineTriggerEventId(
      guardianWhineActivityId,
      guardianWhineScore,
    );
    if (guardianWhineTriggerId === null) throw new Error("Expected whine trigger fixture");
    const guardianWhine = createGuardianDogShelterWhineExpressionAdmissionRecord({
      sourceActorId: GUARDIAN_DOG_ID,
      triggerEventId: guardianWhineTriggerId,
      sampleOrdinal: 5,
      admittedAtPlayerStepPhase: 0,
      assignmentId: "working-animal:assignment:guardian:1",
      activityTransactionId: guardianWhineActivityId,
      acceptedAtTick: 912,
      shelterIntentScore: guardianWhineScore,
      listenerWasSleepingAtAdmission: false,
    });
    const crowAlarm = createCoreWildlifeFishCrowAlarmExpressionAdmissionRecord({
      sourceActorId: "B-fish-crow-admission",
      triggerEventId: "B-fish-crow-admission:e:pc:alarm",
      sampleOrdinal: 6,
      admittedAtPlayerStepPhase: 0,
      sourceOwnerKey: "regional-habitat:11:-4",
      sourceObservationId: "observation:aerial-predator:1",
      acceptedAtTick: 912,
    });
    const legacy = createLegacyV33PlayerExpressionAdmissionRecord({
      sourceActorId: PLAYER_ID,
      triggerEventId: "legacy:event:1",
      sampleOrdinal: 7,
      admittedAtPlayerStepPhase: 9,
    });

    expect([
      traversal,
      recovery,
      porter,
      guardianDog,
      guardianGrowl,
      guardianWhine,
      crowAlarm,
      legacy,
    ].map((record) => record?.kind))
      .toEqual([
      "player-traversal",
      "player-fall-recovery",
      "porter-heavy-departure",
      "guardian-dog-warning",
      "guardian-dog-defensive-growl",
      "guardian-dog-shelter-whine",
      "core-wildlife-fish-crow-alarm",
      "legacy-v33-player",
    ]);
    for (const record of [
      traversal,
      recovery,
      porter,
      guardianDog,
      guardianGrowl,
      guardianWhine,
      crowAlarm,
      legacy,
    ]) {
      expect(record?.eventId).toBe(situatedExpressionEventIdForTrigger(
        record?.sourceActorId,
        record?.triggerEventId,
      ));
      expect(Object.isFrozen(record)).toBe(true);
    }
    expect(Object.isFrozen(porter?.listenerPosition)).toBe(true);
    expect(Object.isFrozen(porter?.listenerPosition.region)).toBe(true);
  });

  it("binds a fish-crow alarm to one regional owner and direct observation", () => {
    const input = {
      sourceActorId: "B-fish-crow-admission",
      triggerEventId: "B-fish-crow-admission:e:pc:alarm",
      sampleOrdinal: 0,
      admittedAtPlayerStepPhase: 0,
      sourceOwnerKey: "regional-habitat:11:-4",
      sourceObservationId: "observation:aerial-predator:1",
      acceptedAtTick: 912,
    } as const;
    const canonical = createCoreWildlifeFishCrowAlarmExpressionAdmissionRecord(input);

    expect(canonical).toEqual({
      version: 1,
      eventId: situatedExpressionEventIdForTrigger(
        input.sourceActorId,
        input.triggerEventId,
      ),
      kind: "core-wildlife-fish-crow-alarm",
      ...input,
    });
    expect(canonicalizeSituatedExpressionAdmissionRecord(
      structuredClone(canonical),
    )).toEqual(canonical);
    expect(createCoreWildlifeFishCrowAlarmExpressionAdmissionRecord({
      ...input,
      sourceActorId: PLAYER_ID,
    })).toBeNull();
    expect(createCoreWildlifeFishCrowAlarmExpressionAdmissionRecord({
      ...input,
      admittedAtPlayerStepPhase: 1,
    })).toBeNull();
    expect(createCoreWildlifeFishCrowAlarmExpressionAdmissionRecord({
      ...input,
      sourceOwnerKey: " padded ",
    })).toBeNull();
    expect(createCoreWildlifeFishCrowAlarmExpressionAdmissionRecord({
      ...input,
      sourceObservationId: "",
    })).toBeNull();
    expect(createCoreWildlifeFishCrowAlarmExpressionAdmissionRecord({
      ...input,
      acceptedAtTick: -0,
    })).toBeNull();
    expect(canonicalizeSituatedExpressionAdmissionRecord({
      ...canonical,
      hiddenPredatorId: "HARRIER-secret",
    })).toBeNull();
  });

  it("binds shelter whines to one non-player phase-zero assignment transaction", () => {
    const activityTransactionId = "working-animal:activity:guardian-shelter-whine:2";
    const shelterIntentScore = 650_000;
    const triggerEventId = guardianDogShelterWhineTriggerEventId(
      activityTransactionId,
      shelterIntentScore,
    );
    if (triggerEventId === null) throw new Error("Expected whine trigger fixture");
    const input = {
      sourceActorId: GUARDIAN_DOG_ID,
      triggerEventId,
      sampleOrdinal: 0,
      admittedAtPlayerStepPhase: 0,
      assignmentId: "working-animal:assignment:guardian:1",
      activityTransactionId,
      acceptedAtTick: 915,
      shelterIntentScore,
      listenerWasSleepingAtAdmission: false,
    } as const;
    const canonical = createGuardianDogShelterWhineExpressionAdmissionRecord(input);

    expect(canonical).toEqual({
      version: 1,
      eventId: situatedExpressionEventIdForTrigger(
        GUARDIAN_DOG_ID,
        input.triggerEventId,
      ),
      kind: "guardian-dog-shelter-whine",
      ...input,
    });
    expect(Object.isFrozen(canonical)).toBe(true);
    expect(canonicalizeSituatedExpressionAdmissionRecord(
      structuredClone(canonical),
    )).toEqual(canonical);
    expect(createGuardianDogShelterWhineExpressionAdmissionRecord({
      ...input,
      sourceActorId: PLAYER_ID,
    })).toBeNull();
    expect(createGuardianDogShelterWhineExpressionAdmissionRecord({
      ...input,
      activityTransactionId: "working-animal:activity:different",
    })).toBeNull();
    expect(createGuardianDogShelterWhineExpressionAdmissionRecord({
      ...input,
      shelterIntentScore: shelterIntentScore + 1,
    })).toBeNull();
    expect(createGuardianDogShelterWhineExpressionAdmissionRecord({
      ...input,
      admittedAtPlayerStepPhase: 1,
    })).toBeNull();
    expect(createGuardianDogShelterWhineExpressionAdmissionRecord({
      ...input,
      listenerWasSleepingAtAdmission: "yes" as never,
    })).toBeNull();
    expect(createGuardianDogShelterWhineExpressionAdmissionRecord({
      ...input,
      acceptedAtTick: -0,
    })).toBeNull();

    for (const shelterIntentScore of [0, -0, -1, 1.5, 1_000_001, Number.NaN]) {
      expect(createGuardianDogShelterWhineExpressionAdmissionRecord({
        ...input,
        shelterIntentScore,
      })).toBeNull();
    }

    const missingInputScore = { ...input } as Record<string, unknown>;
    delete missingInputScore.shelterIntentScore;
    expect(createGuardianDogShelterWhineExpressionAdmissionRecord(
      missingInputScore as unknown as GuardianDogShelterWhineExpressionAdmissionInput,
    )).toBeNull();

    const missing = { ...canonical } as Record<string, unknown>;
    delete missing.shelterIntentScore;
    expect(canonicalizeSituatedExpressionAdmissionRecord(missing)).toBeNull();
    expect(canonicalizeSituatedExpressionAdmissionRecord({
      ...canonical,
      sourceObservationId: "not-part-of-shelter-whine-authority",
    })).toBeNull();
  });

  it("binds defensive growls to one non-player phase-zero retreat transaction", () => {
    const input = {
      sourceActorId: GUARDIAN_DOG_ID,
      triggerEventId: "working-animal:activity:guardian-growl:2",
      sampleOrdinal: 0,
      admittedAtPlayerStepPhase: 0,
      assignmentId: "working-animal:assignment:guardian:1",
      activityTransactionId: "working-animal:activity:guardian-growl:2",
      sourceObservationId: "observation:threat:2",
      acceptedAtTick: 914,
      listenerWasSleepingAtAdmission: false,
    } as const;
    const canonical = createGuardianDogDefensiveGrowlExpressionAdmissionRecord(input);

    expect(canonical).toEqual({
      version: 1,
      eventId: situatedExpressionEventIdForTrigger(
        GUARDIAN_DOG_ID,
        input.triggerEventId,
      ),
      kind: "guardian-dog-defensive-growl",
      ...input,
    });
    expect(canonicalizeSituatedExpressionAdmissionRecord(
      structuredClone(canonical),
    )).toEqual(canonical);
    expect(createGuardianDogDefensiveGrowlExpressionAdmissionRecord({
      ...input,
      sourceActorId: PLAYER_ID,
    })).toBeNull();
    expect(createGuardianDogDefensiveGrowlExpressionAdmissionRecord({
      ...input,
      activityTransactionId: "working-animal:activity:different",
    })).toBeNull();
    expect(createGuardianDogDefensiveGrowlExpressionAdmissionRecord({
      ...input,
      admittedAtPlayerStepPhase: 1,
    })).toBeNull();
    expect(createGuardianDogDefensiveGrowlExpressionAdmissionRecord({
      ...input,
      listenerWasSleepingAtAdmission: "yes" as never,
    })).toBeNull();
  });

  it("binds guardian warnings to one non-player phase-zero activity transaction", () => {
    const input = {
      sourceActorId: GUARDIAN_DOG_ID,
      triggerEventId: "working-animal:activity:guardian-warning:2",
      sampleOrdinal: 0,
      admittedAtPlayerStepPhase: 0,
      assignmentId: "working-animal:assignment:guardian:1",
      activityTransactionId: "working-animal:activity:guardian-warning:2",
      sourceObservationId: "observation:anonymous-alarm:2",
      acceptedAtTick: 913,
    } as const;
    const canonical = createGuardianDogWarningExpressionAdmissionRecord(input);

    expect(canonical).toEqual({
      version: 1,
      eventId: situatedExpressionEventIdForTrigger(
        GUARDIAN_DOG_ID,
        input.triggerEventId,
      ),
      kind: "guardian-dog-warning",
      ...input,
    });
    expect(Object.isFrozen(canonical)).toBe(true);
    expect(canonicalizeSituatedExpressionAdmissionRecord(
      structuredClone(canonical),
    )).toEqual(canonical);

    expect(createGuardianDogWarningExpressionAdmissionRecord({
      ...input,
      sourceActorId: PLAYER_ID,
    })).toBeNull();
    expect(createGuardianDogWarningExpressionAdmissionRecord({
      ...input,
      activityTransactionId: "working-animal:activity:different",
    })).toBeNull();
    expect(createGuardianDogWarningExpressionAdmissionRecord({
      ...input,
      admittedAtPlayerStepPhase: 1,
    })).toBeNull();
    expect(createGuardianDogWarningExpressionAdmissionRecord({
      ...input,
      acceptedAtTick: -0,
    })).toBeNull();
    expect(createGuardianDogWarningExpressionAdmissionRecord({
      ...input,
      sourceObservationId: " padded ",
    })).toBeNull();

    const missing = { ...canonical } as Record<string, unknown>;
    delete missing.assignmentId;
    expect(canonicalizeSituatedExpressionAdmissionRecord(missing)).toBeNull();
    expect(canonicalizeSituatedExpressionAdmissionRecord({
      ...canonical,
      unexpected: true,
    })).toBeNull();
  });

  it("appends only at the exact positional ordinal and deeply freezes the ledger", () => {
    const first = appendSituatedExpressionAdmissionRecord(
      createSituatedExpressionAdmissionLedger(),
      traversalRecord(0),
    );
    const second = appendSituatedExpressionAdmissionRecord(
      first,
      traversalRecord(1),
    );

    expect(second?.records.map(({ sampleOrdinal }) => sampleOrdinal)).toEqual([0, 1]);
    expect(Object.isFrozen(second)).toBe(true);
    expect(Object.isFrozen(second?.records)).toBe(true);
    expect(Object.isFrozen(second?.records[0])).toBe(true);
    expect(appendSituatedExpressionAdmissionRecord(first, traversalRecord(2))).toBeNull();
  });

  it("canonicalizes separated IDs into stable order without accepting duplicates", () => {
    const separated = createPlayerTraversalExpressionAdmissionRecord({
      ...traversalInput(),
      causalClass: "cargo-separation",
      incidentKind: "fall",
      cargoOutcome: "separated",
      selectedPayloadKind: "promise",
      separatedEntityIds: ["cargo:z", "cargo:a"],
      separationEventId: "separation:event:1",
    });

    expect(separated?.separatedEntityIds).toEqual(["cargo:a", "cargo:z"]);
    expect(Object.isFrozen(separated?.separatedEntityIds)).toBe(true);
    expect(createPlayerTraversalExpressionAdmissionRecord({
      ...traversalInput(),
      causalClass: "cargo-separation",
      incidentKind: "fall",
      cargoOutcome: "separated",
      selectedPayloadKind: "promise",
      separatedEntityIds: ["cargo:a", "cargo:a"],
      separationEventId: "separation:event:1",
    })).toBeNull();
  });

  it("rejects forged event identities and every missing or extra record field", () => {
    const valid = traversalRecord();
    expect(canonicalizeSituatedExpressionAdmissionRecord({
      ...valid,
      eventId: "situated-expression:event:v1:forged",
    })).toBeNull();
    expect(canonicalizeSituatedExpressionAdmissionRecord({ ...valid, unexpected: true })).toBeNull();
    const missing = { ...valid } as Record<string, unknown>;
    delete missing.cargoShock;
    expect(canonicalizeSituatedExpressionAdmissionRecord(missing)).toBeNull();
    expect(createPlayerTraversalExpressionAdmissionRecord({
      ...traversalInput(),
      unexpected: true,
    } as PlayerTraversalExpressionAdmissionInput)).toBeNull();
    expect(createLegacyV33PlayerExpressionAdmissionRecord({
      sourceActorId: PORTER_ID,
      triggerEventId: "legacy:not-player",
      sampleOrdinal: 0,
      admittedAtPlayerStepPhase: 0,
    })).toBeNull();
  });

  it("rejects noncanonical numeric bounds including signed zero", () => {
    for (const [field, value] of [
      ["sampleOrdinal", -0],
      ["sampleOrdinal", SITUATED_EXPRESSION_ADMISSION_LEDGER_MAX_RECORDS],
      ["admittedAtPlayerStepPhase", -0],
      ["admittedAtPlayerStepPhase", 10],
      ["hazardSeverity", -0],
      ["hazardSeverity", 1_000_001],
      ["cargoShock", -0],
      ["cargoShock", 1_000_001],
    ] as const) {
      expect(createPlayerTraversalExpressionAdmissionRecord({
        ...traversalInput(),
        [field]: value,
      })).toBeNull();
    }
    const porter = createPorterHeavyDepartureExpressionAdmissionRecord({
      sourceActorId: PORTER_ID,
      triggerEventId: "departure:numeric",
      sampleOrdinal: 0,
      admittedAtPlayerStepPhase: 0,
      receivedAtTick: 0,
      listenerPosition: POSITION,
      listenerFacingMilliRadians: -0,
      hearingCertainty: 1,
    });
    expect(porter).toBeNull();
    expect(createPorterHeavyDepartureExpressionAdmissionRecord({
      sourceActorId: PORTER_ID,
      triggerEventId: "departure:certainty",
      sampleOrdinal: 0,
      admittedAtPlayerStepPhase: 0,
      receivedAtTick: 0,
      listenerPosition: POSITION,
      listenerFacingMilliRadians: 0,
      hearingCertainty: 0,
    })).toBeNull();
  });

  it("rejects contradictory traversal cargo and causal evidence", () => {
    expect(createPlayerTraversalExpressionAdmissionRecord({
      ...traversalInput(),
      separationEventId: "not-separated",
    })).toBeNull();
    expect(createPlayerTraversalExpressionAdmissionRecord({
      ...traversalInput(),
      cargoOutcome: "separated",
      selectedPayloadKind: "promise",
      separatedEntityIds: ["cargo:1"],
      separationEventId: "separation:1",
    })).toBeNull();
    expect(createPlayerTraversalExpressionAdmissionRecord({
      ...traversalInput(),
      causalClass: "cargo-separation",
      incidentKind: "fall",
      cargoOutcome: "separated",
      selectedPayloadKind: "promise",
      separatedEntityIds: [],
      separationEventId: "separation:1",
    })).toBeNull();
    expect(createPlayerTraversalExpressionAdmissionRecord({
      ...traversalInput(),
      causalClass: "important-cargo-impact",
      incidentKind: "fall",
      cargoOutcome: "impacted-carried",
      selectedPayloadKind: "provision",
    })).toBeNull();
    expect(createPlayerTraversalExpressionAdmissionRecord({
      ...traversalInput(),
      causalClass: "serious-stumble",
      incidentKind: "fall",
    })).toBeNull();
    expect(createPlayerFallRecoveryExpressionAdmissionRecord({
      sourceActorId: PLAYER_ID,
      triggerEventId: "recovery:trigger",
      sampleOrdinal: 0,
      admittedAtPlayerStepPhase: 0,
      recoveryEventId: "recovery:different",
      recoveredEntityId: "cargo:1",
    })).toBeNull();
  });

  it("rejects oversized, sparse, and malformed separated-entity collections", () => {
    const oversized = Array.from(
      { length: SITUATED_EXPRESSION_ADMISSION_MAX_SEPARATED_ENTITY_IDS + 1 },
      (_, index) => `cargo:${index}`,
    );
    expect(createPlayerTraversalExpressionAdmissionRecord({
      ...traversalInput(),
      causalClass: "cargo-separation",
      incidentKind: "fall",
      cargoOutcome: "separated",
      selectedPayloadKind: "gear",
      separatedEntityIds: oversized,
      separationEventId: "separation:oversized",
    })).toBeNull();

    const sparse = ["cargo:0", "cargo:1"];
    delete sparse[0];
    expect(createPlayerTraversalExpressionAdmissionRecord({
      ...traversalInput(),
      causalClass: "cargo-separation",
      incidentKind: "fall",
      cargoOutcome: "separated",
      selectedPayloadKind: "gear",
      separatedEntityIds: sparse,
      separationEventId: "separation:sparse",
    })).toBeNull();
  });

  it("rejects reordered ordinals and repeated source-trigger identity", () => {
    expect(canonicalizeSituatedExpressionAdmissionLedger(rawLedger([
      traversalRecord(1),
      traversalRecord(0),
    ]))).toBeNull();
    expect(canonicalizeSituatedExpressionAdmissionLedger(rawLedger([
      traversalRecord(0),
      traversalRecord(1, PLAYER_ID, "traversal:0"),
    ]))).toBeNull();

    const sameTriggerDifferentSources = canonicalizeSituatedExpressionAdmissionLedger(rawLedger([
      traversalRecord(0, PLAYER_ID, "shared-trigger"),
      porterRecord(1, PORTER_ID, "shared-trigger"),
    ]));
    expect(sameTriggerDifferentSources?.records).toHaveLength(2);
  });

  it("admits porter departure receipts only at the phase-zero world boundary", () => {
    const canonical = porterRecord(0);
    if (canonical.kind !== "porter-heavy-departure") {
      throw new Error("porter fixture produced the wrong admission kind");
    }
    expect(createPorterHeavyDepartureExpressionAdmissionRecord({
      ...canonical,
      admittedAtPlayerStepPhase: 1,
    })).toBeNull();
  });

  it("rejects over-capacity, sparse, and inexact ledger envelopes", () => {
    const records = Array.from(
      { length: SITUATED_EXPRESSION_ADMISSION_LEDGER_MAX_RECORDS },
      (_, index) => traversalRecord(index),
    );
    const full = canonicalizeSituatedExpressionAdmissionLedger(rawLedger(records));
    expect(full?.records).toHaveLength(SITUATED_EXPRESSION_ADMISSION_LEDGER_MAX_RECORDS);
    expect(appendSituatedExpressionAdmissionRecord(full, porterRecord(0, "H-extra"))).toBeNull();

    const overCapacity = [...records, { ...records[0], sampleOrdinal: 0 }];
    expect(canonicalizeSituatedExpressionAdmissionLedger(rawLedger(overCapacity))).toBeNull();
    expect(canonicalizeSituatedExpressionAdmissionLedger({
      version: 1,
      records,
      extra: false,
    })).toBeNull();

    const sparse = [...records] as SituatedExpressionAdmissionRecord[];
    delete sparse[3];
    expect(canonicalizeSituatedExpressionAdmissionLedger(rawLedger(sparse))).toBeNull();
  });

  it("returns a stable immutable copy rather than retaining mutable input containers", () => {
    const record = traversalRecord();
    const records = [record];
    const ledger = canonicalizeSituatedExpressionAdmissionLedger(rawLedger(records));
    if (ledger === null) throw new Error("Expected canonical ledger");
    records.length = 0;

    expect(ledger.records).toEqual([record]);
    expect(Object.isFrozen(ledger)).toBe(true);
    expect(Object.isFrozen(ledger.records)).toBe(true);
    expect(canonicalizeSituatedExpressionAdmissionLedger(ledger)).toEqual(ledger);
  });
});

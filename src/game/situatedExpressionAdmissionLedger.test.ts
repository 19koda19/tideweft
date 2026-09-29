import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import { situatedExpressionEventIdForTrigger } from "./situatedExpression";
import {
  SITUATED_EXPRESSION_ADMISSION_LEDGER_MAX_RECORDS,
  SITUATED_EXPRESSION_ADMISSION_MAX_SEPARATED_ENTITY_IDS,
  appendSituatedExpressionAdmissionRecord,
  canonicalizeSituatedExpressionAdmissionLedger,
  canonicalizeSituatedExpressionAdmissionRecord,
  createLegacyV33PlayerExpressionAdmissionRecord,
  createPlayerFallRecoveryExpressionAdmissionRecord,
  createPlayerTraversalExpressionAdmissionRecord,
  createPorterHeavyDepartureExpressionAdmissionRecord,
  createSituatedExpressionAdmissionLedger,
  type PlayerTraversalExpressionAdmissionInput,
  type SituatedExpressionAdmissionLedger,
  type SituatedExpressionAdmissionRecord,
} from "./situatedExpressionAdmissionLedger";
import { createWorldPosition } from "./worldPosition";

const PLAYER_ID = LOCAL_PLAYER_LIVING_ACTOR_ID;
const PORTER_ID = "H-porter-admission";
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
    const legacy = createLegacyV33PlayerExpressionAdmissionRecord({
      sourceActorId: PLAYER_ID,
      triggerEventId: "legacy:event:1",
      sampleOrdinal: 3,
      admittedAtPlayerStepPhase: 9,
    });

    expect([traversal, recovery, porter, legacy].map((record) => record?.kind)).toEqual([
      "player-traversal",
      "player-fall-recovery",
      "porter-heavy-departure",
      "legacy-v33-player",
    ]);
    for (const record of [traversal, recovery, porter, legacy]) {
      expect(record?.eventId).toBe(situatedExpressionEventIdForTrigger(
        record?.sourceActorId,
        record?.triggerEventId,
      ));
      expect(Object.isFrozen(record)).toBe(true);
    }
    expect(Object.isFrozen(porter?.listenerPosition)).toBe(true);
    expect(Object.isFrozen(porter?.listenerPosition.region)).toBe(true);
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

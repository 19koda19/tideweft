import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import { hashCanonical } from "../sim/util";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import { playerEffortExpressionPolicy } from "./playerEffortExpression";
import {
  createLegacyV33PlayerExpressionAdmissionRecord,
  createPlayerExhaustionExpressionAdmissionRecord,
  createPlayerFallRecoveryExpressionAdmissionRecord,
  createPlayerTraversalExpressionAdmissionRecord,
  createPorterHeavyDepartureExpressionAdmissionRecord,
  type PlayerFallRecoveryExpressionAdmissionRecord,
  type PlayerExhaustionExpressionAdmissionRecord,
  type PlayerTraversalExpressionAdmissionRecord,
} from "./situatedExpressionAdmissionLedger";
import {
  SITUATED_EXPRESSION_CAUSAL_AUTHORITY_MAX_RECORDS,
  appendSituatedExpressionCausalAuthorityRecord,
  canonicalizeSituatedExpressionCausalAuthorityLedger,
  canonicalizeSituatedExpressionCausalAuthorityRecord,
  createSituatedExpressionCausalAuthorityLedger,
  createSituatedExpressionCausalAuthorityRecord,
  situatedExpressionAdmissionCausalDigest,
  situatedExpressionAdmissionMatchesCausalAuthority,
  type SituatedExpressionCausalAuthorityRecord,
} from "./situatedExpressionCausalAuthority";
import { createWorldPosition } from "./worldPosition";

const POSITION = createWorldPosition(createRegionCoord(-7, 12), 23_000, 41_000);
const OTHER_POSITION = createWorldPosition(createRegionCoord(-7, 12), 23_001, 41_000);
const WORLD_TICK = 918;

function traversal(
  sampleOrdinal = 0,
  phase = 2,
  triggerEventId = `traversal:authority:${sampleOrdinal}`,
): PlayerTraversalExpressionAdmissionRecord {
  const admission = createPlayerTraversalExpressionAdmissionRecord({
    sourceActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
    triggerEventId,
    sampleOrdinal,
    admittedAtPlayerStepPhase: phase,
    causalClass: "ordinary-stumble",
    incidentKind: "stumble",
    hazardSeverity: 210_000,
    cargoOutcome: "unchanged",
    selectedPayloadKind: null,
    cargoShock: 80_000,
    separatedEntityIds: [],
    separationEventId: null,
  });
  if (admission === null) throw new Error("Expected traversal admission fixture");
  return admission;
}

function recovery(
  sampleOrdinal = 1,
  phase = 5,
  triggerEventId = `recovery:authority:${sampleOrdinal}`,
): PlayerFallRecoveryExpressionAdmissionRecord {
  const admission = createPlayerFallRecoveryExpressionAdmissionRecord({
    sourceActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
    triggerEventId,
    sampleOrdinal,
    admittedAtPlayerStepPhase: phase,
    recoveryEventId: triggerEventId,
    recoveredEntityId: `cargo:medicine:${sampleOrdinal}`,
  });
  if (admission === null) throw new Error("Expected recovery admission fixture");
  return admission;
}

function exhaustion(
  sampleOrdinal = 2,
  phase = 7,
): PlayerExhaustionExpressionAdmissionRecord {
  const evidence = {
    committedWorldTick: WORLD_TICK,
    admittedAtPlayerStepPhase: phase,
    acceptedDistanceUnits: 105,
    resolution: "dry-exhaustion-camp" as const,
  };
  const policy = playerEffortExpressionPolicy(LOCAL_PLAYER_LIVING_ACTOR_ID, evidence);
  if (policy === null) throw new Error("Expected effort policy fixture");
  const admission = createPlayerExhaustionExpressionAdmissionRecord({
    sourceActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
    triggerEventId: policy.triggerEventId,
    sampleOrdinal,
    ...evidence,
  });
  if (admission === null) throw new Error("Expected exhaustion admission fixture");
  return admission;
}

function authority(
  admission: PlayerTraversalExpressionAdmissionRecord
    | PlayerFallRecoveryExpressionAdmissionRecord
    | PlayerExhaustionExpressionAdmissionRecord,
  position = POSITION,
  committedWorldTick = WORLD_TICK,
): SituatedExpressionCausalAuthorityRecord {
  const record = createSituatedExpressionCausalAuthorityRecord(
    admission,
    committedWorldTick,
    position,
  );
  if (record === null) throw new Error("Expected causal authority fixture");
  return record;
}

describe("situated-expression player causal authority", () => {
  it("derives the exact traversal causal digest and deeply freezes its record", () => {
    const admission = traversal();
    const record = authority(admission);

    expect(Object.keys(record)).toEqual([
      "version",
      "eventId",
      "sourceActorId",
      "triggerEventId",
      "sampleOrdinal",
      "committedWorldTick",
      "admittedAtPlayerStepPhase",
      "playerPosition",
      "causalDigest",
    ]);
    expect(record.causalDigest).toBe(hashCanonical({
      version: 1,
      kind: "player-traversal",
      causalClass: "ordinary-stumble",
      incidentKind: "stumble",
      hazardSeverity: 210_000,
      cargoOutcome: "unchanged",
      selectedPayloadKind: null,
      cargoShock: 80_000,
      separatedEntityIds: [],
      separationEventId: null,
    }));
    expect(situatedExpressionAdmissionMatchesCausalAuthority(admission, record)).toBe(true);
    expect(record.playerPosition).not.toBe(POSITION);
    expect(record.playerPosition).toEqual(POSITION);
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.playerPosition)).toBe(true);
    expect(Object.isFrozen(record.playerPosition.region)).toBe(true);
  });

  it("digests recovery facts independently and detects causal or base-field tampering", () => {
    const admission = recovery();
    const record = authority(admission);
    expect(record.causalDigest).toBe(hashCanonical({
      version: 1,
      kind: "player-fall-recovery",
      recoveryEventId: admission.recoveryEventId,
      recoveredEntityId: admission.recoveredEntityId,
    }));
    expect(situatedExpressionAdmissionMatchesCausalAuthority(admission, record)).toBe(true);

    const changedRecovery = recovery(1, 5, admission.triggerEventId);
    const changedEntity = {
      ...changedRecovery,
      recoveredEntityId: "cargo:medicine:different",
    };
    expect(situatedExpressionAdmissionMatchesCausalAuthority(changedEntity, record)).toBe(false);
    expect(situatedExpressionAdmissionMatchesCausalAuthority(admission, {
      ...record,
      causalDigest: "0000000000000000",
    })).toBe(false);
    expect(situatedExpressionAdmissionMatchesCausalAuthority(admission, {
      ...record,
      admittedAtPlayerStepPhase: 6,
    })).toBe(false);
  });

  it("binds exhaustion semantics while leaving physical proof to movement state", () => {
    const admission = exhaustion();
    const record = authority(admission);
    expect(record.causalDigest).toBe(hashCanonical({
      version: 1,
      kind: "player-exhaustion",
      committedWorldTick: WORLD_TICK,
      acceptedDistanceUnits: 105,
      resolution: "dry-exhaustion-camp",
    }));
    expect(Object.keys(record)).not.toContain("playerExhaustionTransition");
    expect(situatedExpressionAdmissionMatchesCausalAuthority(admission, record)).toBe(true);
    expect(createSituatedExpressionCausalAuthorityRecord(
      admission,
      WORLD_TICK + 1,
      POSITION,
    )).toBeNull();
    expect(situatedExpressionAdmissionMatchesCausalAuthority({
      ...admission,
      acceptedDistanceUnits: 104,
    }, record)).toBe(false);
  });

  it("refuses porter and legacy admissions instead of admitting parallel authority", () => {
    const porter = createPorterHeavyDepartureExpressionAdmissionRecord({
      sourceActorId: "porter:causal-authority",
      triggerEventId: "departure:authority:1",
      sampleOrdinal: 0,
      admittedAtPlayerStepPhase: 0,
      receivedAtTick: WORLD_TICK,
      listenerPosition: POSITION,
      listenerFacingMilliRadians: 0,
      hearingCertainty: 620_000,
    });
    const legacy = createLegacyV33PlayerExpressionAdmissionRecord({
      sourceActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
      triggerEventId: "legacy:authority:1",
      sampleOrdinal: 0,
      admittedAtPlayerStepPhase: 0,
    });

    for (const admission of [porter, legacy]) {
      expect(situatedExpressionAdmissionCausalDigest(admission)).toBeNull();
      expect(createSituatedExpressionCausalAuthorityRecord(
        admission,
        WORLD_TICK,
        POSITION,
      )).toBeNull();
      expect(situatedExpressionAdmissionMatchesCausalAuthority(
        admission,
        authority(traversal()),
      )).toBe(false);
    }
  });

  it("rejects every missing, extra, or forged authority field", () => {
    const record = authority(traversal());
    expect(canonicalizeSituatedExpressionCausalAuthorityRecord({
      ...record,
      unexpected: true,
    })).toBeNull();
    for (const key of Object.keys(record)) {
      const missing = { ...record } as Record<string, unknown>;
      delete missing[key];
      expect(canonicalizeSituatedExpressionCausalAuthorityRecord(missing)).toBeNull();
    }
    expect(canonicalizeSituatedExpressionCausalAuthorityRecord({
      ...record,
      eventId: "situated-expression:event:v1:forged",
    })).toBeNull();
    expect(canonicalizeSituatedExpressionCausalAuthorityRecord({
      ...record,
      sourceActorId: "porter:forged",
    })).toBeNull();
    expect(canonicalizeSituatedExpressionCausalAuthorityRecord({
      ...record,
      causalDigest: record.causalDigest.toUpperCase(),
    })).toBeNull();
  });

  it("rejects numeric bounds, signed zero, and noncanonical positions", () => {
    const record = authority(traversal());
    for (const [field, value] of [
      ["sampleOrdinal", -0],
      ["sampleOrdinal", SITUATED_EXPRESSION_CAUSAL_AUTHORITY_MAX_RECORDS],
      ["committedWorldTick", -0],
      ["committedWorldTick", -1],
      ["admittedAtPlayerStepPhase", -0],
      ["admittedAtPlayerStepPhase", 10],
    ] as const) {
      expect(canonicalizeSituatedExpressionCausalAuthorityRecord({
        ...record,
        [field]: value,
      })).toBeNull();
    }
    expect(canonicalizeSituatedExpressionCausalAuthorityRecord({
      ...record,
      playerPosition: {
        ...record.playerPosition,
        localX: -0,
      },
    })).toBeNull();
    expect(canonicalizeSituatedExpressionCausalAuthorityRecord({
      ...record,
      playerPosition: {
        ...record.playerPosition,
        region: { ...record.playerPosition.region, x: -0 },
      },
    })).toBeNull();
  });

  it("appends in exact admission-ordinal and phase order while allowing porter gaps", () => {
    const first = authority(traversal(0, 2));
    const second = authority(recovery(1, 5), OTHER_POSITION);
    const withFirst = appendSituatedExpressionCausalAuthorityRecord(
      createSituatedExpressionCausalAuthorityLedger(),
      first,
    );
    const complete = appendSituatedExpressionCausalAuthorityRecord(withFirst, second);

    expect(complete?.records).toHaveLength(2);
    expect(complete?.records.map(({ sampleOrdinal }) => sampleOrdinal)).toEqual([0, 1]);
    expect(Object.isFrozen(complete)).toBe(true);
    expect(Object.isFrozen(complete?.records)).toBe(true);
    expect(Object.isFrozen(complete?.records[1]?.playerPosition)).toBe(true);
    expect(appendSituatedExpressionCausalAuthorityRecord(
      withFirst,
      authority(recovery(2, 5)),
    )?.records.map(({ sampleOrdinal }) => sampleOrdinal)).toEqual([0, 2]);
    expect(appendSituatedExpressionCausalAuthorityRecord(
      withFirst,
      authority(recovery(1, 1)),
    )).toBeNull();
    expect(appendSituatedExpressionCausalAuthorityRecord(
      withFirst,
      authority(recovery(1, 5), POSITION, WORLD_TICK + 1),
    )).toBeNull();
  });

  it("rejects duplicate, reordered, sparse, over-capacity, and mixed-tick ledgers", () => {
    const first = authority(traversal(0, 2));
    const second = authority(recovery(1, 5));
    const valid = { version: 1, records: [first, second] };
    expect(canonicalizeSituatedExpressionCausalAuthorityLedger(valid)).not.toBeNull();
    expect(canonicalizeSituatedExpressionCausalAuthorityLedger({
      version: 1,
      records: [second, first],
    })).toBeNull();
    expect(canonicalizeSituatedExpressionCausalAuthorityLedger({
      version: 1,
      records: [first, { ...first, sampleOrdinal: 0 }],
    })).toBeNull();
    expect(canonicalizeSituatedExpressionCausalAuthorityLedger({
      version: 1,
      records: [first, { ...second, committedWorldTick: WORLD_TICK + 1 }],
    })).toBeNull();
    const sparse = new Array(1) as unknown[];
    expect(canonicalizeSituatedExpressionCausalAuthorityLedger({
      version: 1,
      records: sparse,
    })).toBeNull();
    expect(canonicalizeSituatedExpressionCausalAuthorityLedger({
      version: 1,
      records: Array.from(
        { length: SITUATED_EXPRESSION_CAUSAL_AUTHORITY_MAX_RECORDS + 1 },
        () => first,
      ),
    })).toBeNull();
  });

  it("keeps exact tick and player position as independently canonical evidence", () => {
    const admission = traversal();
    const record = authority(admission);
    const moved = canonicalizeSituatedExpressionCausalAuthorityRecord({
      ...record,
      playerPosition: OTHER_POSITION,
    });
    const laterTick = canonicalizeSituatedExpressionCausalAuthorityRecord({
      ...record,
      committedWorldTick: WORLD_TICK + 1,
    });

    expect(moved?.playerPosition).toEqual(OTHER_POSITION);
    expect(laterTick?.committedWorldTick).toBe(WORLD_TICK + 1);
    expect(situatedExpressionAdmissionMatchesCausalAuthority(admission, moved)).toBe(true);
    expect(situatedExpressionAdmissionMatchesCausalAuthority(admission, laterTick)).toBe(true);
  });
});

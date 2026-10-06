import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { playerEffortExpressionPolicy } from "./playerEffortExpression";
import {
  PLAYER_EFFORT_REANNOUNCEMENT_STEPS,
  canonicalizePlayerEffortRecencyState,
  recordAcceptedPlayerEffortExpression,
  type PlayerEffortRecencyClock,
} from "./playerEffortRecency";
import { playerFootingExpressionAdmissionPolicy } from "./playerExpressionAuthority";
import {
  PLAYER_FOOTING_RECENCY_MAX_RECEIPTS,
  canonicalizePlayerExpressionRecencyState,
  createPlayerExpressionRecencyState,
  playerFootingRecencyAge,
  playerFootingRecencyAllowsExpression,
  recordAcceptedPlayerFootingExpression,
  type PlayerExpressionRecencyState,
  type PlayerFootingRecencyReceipt,
} from "./playerExpressionRecency";
import { createPlayerStepStateAnchor, createPlayerStepStateSample } from "./playerStepState";
import { situatedExpressionCooldownSteps } from "./situatedExpression";
import {
  createPlayerExhaustionExpressionAdmissionRecord,
  createPlayerTraversalExpressionAdmissionRecord,
  type PlayerTraversalAdmissionPayloadKind,
} from "./situatedExpressionAdmissionLedger";
import { createSituatedExpressionCausalAuthorityRecord } from "./situatedExpressionCausalAuthority";
import { createWorldPosition, translateWorldPosition } from "./worldPosition";

const SEED = seedFromText("bounded current player choice contract");
const POSITION = createWorldPosition(createRegionCoord(-4, 7), 31_000, 18_000);
const INITIAL_TICK = 420;
type FootingClass = "ordinary-stumble" | "serious-stumble";

function clockAt(acceptedSteps: number): PlayerEffortRecencyClock {
  return {
    completedTick: INITIAL_TICK + Math.floor(acceptedSteps / 10),
    playerStepPhase: acceptedSteps % 10,
  };
}

/** Synthetic current-contract facts, not generated incidents or playable physics. */
function footing(
  causalClass: FootingClass = "ordinary-stumble",
  acceptedStep = 1,
  soundOrdinal = 6,
  triggerEventId = `contract:footing:${causalClass}:${acceptedStep}`,
): PlayerFootingRecencyReceipt {
  const physicalOrdinal = (acceptedStep - 1) % 10;
  const admission = createPlayerTraversalExpressionAdmissionRecord({
    sourceActorId: "player:local", triggerEventId, sampleOrdinal: soundOrdinal,
    admittedAtPlayerStepPhase: Math.min(9, physicalOrdinal + 1),
    causalClass, incidentKind: "stumble",
    hazardSeverity: causalClass === "ordinary-stumble" ? 210_000 : 650_000,
    cargoOutcome: "unchanged", selectedPayloadKind: null, cargoShock: 80_000,
    separatedEntityIds: [], separationEventId: null,
  });
  const authority = admission === null ? null : createSituatedExpressionCausalAuthorityRecord(
    admission, INITIAL_TICK + Math.floor((acceptedStep - 1) / 10), POSITION,
  );
  const step = createPlayerStepStateSample({
    sampleOrdinal: physicalOrdinal, staminaBefore: 800_000, staminaAfter: 780_000,
    modeBefore: "foot", modeAfter: "foot", acceptedDistanceUnits: 105, moved: true,
    exhausted: false, rescued: false, becameSwept: false, traversalIncidentKind: "stumble",
    startingWaterDepth: 0, endingWaterDepth: 0,
  });
  if (admission === null || authority === null || step === null) {
    throw new Error("Synthetic footing contract fixture failed its current owners");
  }
  return { admission, authority, step };
}

function accepted(
  state: PlayerExpressionRecencyState,
  receipt: PlayerFootingRecencyReceipt,
  acceptedStep: number,
): PlayerExpressionRecencyState {
  const next = recordAcceptedPlayerFootingExpression(state, SEED, clockAt(acceptedStep), receipt);
  if (next === null) throw new Error("Expected accepted footing history");
  return next;
}

function impactedCargo(
  receipt: PlayerFootingRecencyReceipt,
  selectedPayloadKind: PlayerTraversalAdmissionPayloadKind,
  cargoShock: number,
): PlayerFootingRecencyReceipt {
  const admission = createPlayerTraversalExpressionAdmissionRecord({
    sourceActorId: receipt.admission.sourceActorId,
    triggerEventId: receipt.admission.triggerEventId,
    sampleOrdinal: receipt.admission.sampleOrdinal,
    admittedAtPlayerStepPhase: receipt.admission.admittedAtPlayerStepPhase,
    causalClass: receipt.admission.causalClass,
    incidentKind: receipt.admission.incidentKind,
    hazardSeverity: receipt.admission.hazardSeverity,
    cargoOutcome: "impacted-carried", selectedPayloadKind, cargoShock,
    separatedEntityIds: receipt.admission.separatedEntityIds,
    separationEventId: receipt.admission.separationEventId,
  });
  const authority = admission === null ? null : createSituatedExpressionCausalAuthorityRecord(
    admission, receipt.authority.committedWorldTick, receipt.authority.playerPosition,
  );
  if (admission === null || authority === null) throw new Error("Invalid cargo contract fixture");
  return { admission, authority, step: receipt.step };
}

describe("bounded player-expression choice history contract", () => {
  it.each([
    ["ordinary-stumble", "steady-after-stumble", 12, 4],
    ["serious-stumble", "relief-after-near-fall", 16, 6],
  ] as const)("retains exact existing meaning/family law for %s", (causalClass, meaning, meaningSteps, familySteps) => {
    const origin = footing(causalClass);
    const policy = playerFootingExpressionAdmissionPolicy(origin.admission);
    expect(policy).toMatchObject({ meaning, family: "footing" });
    expect(situatedExpressionCooldownSteps(meaning)).toEqual({ meaning: meaningSteps, family: familySteps });
    const state = accepted(createPlayerExpressionRecencyState(SEED), origin, 1);
    for (let age = 0; age < meaningSteps; age += 1) {
      const fresh = footing(causalClass, 1 + age, 0, `contract:fresh:${causalClass}:${age}`);
      expect(playerFootingRecencyAllowsExpression(state, SEED, clockAt(1 + age), fresh.admission)).toBe(false);
      expect(recordAcceptedPlayerFootingExpression(state, SEED, clockAt(1 + age), fresh)).toBeNull();
    }
    const fresh = footing(causalClass, 1 + meaningSteps);
    expect(playerFootingRecencyAllowsExpression(state, SEED, clockAt(1 + meaningSteps), fresh.admission)).toBe(true);
    expect(canonicalizePlayerExpressionRecencyState(state, SEED, clockAt(1 + meaningSteps))?.footing).toEqual([]);
    expect(accepted(state, fresh, 1 + meaningSteps).footing).toEqual([fresh]);
  });

  it("preserves the 4/6-step family law with priority-qualified suppression", () => {
    const ordinary = accepted(createPlayerExpressionRecencyState(SEED), footing(), 1);
    const stronger = footing("serious-stumble", 2);
    // The higher-priority meaning may pass an ordinary family lock; its active
    // speech-channel interruption remains a separate existing owner.
    expect(playerFootingRecencyAllowsExpression(ordinary, SEED, clockAt(2), stronger.admission)).toBe(true);
    expect(accepted(ordinary, stronger, 2).footing).toHaveLength(2);

    const serious = accepted(createPlayerExpressionRecencyState(SEED), footing("serious-stumble"), 1);
    for (let age = 0; age < 6; age += 1) {
      expect(playerFootingRecencyAllowsExpression(
        serious, SEED, clockAt(1 + age), footing("ordinary-stumble", 1 + age).admission,
      )).toBe(false);
    }
    expect(playerFootingRecencyAllowsExpression(serious, SEED, clockAt(7), footing("ordinary-stumble", 7).admission)).toBe(true);
    // Equal-priority ordinary/serious candidates still obey their own longer
    // meaning lock after the 4/6-step family lock has ended.
    expect(playerFootingRecencyAllowsExpression(ordinary, SEED, clockAt(5), footing("ordinary-stumble", 5).admission)).toBe(false);
    expect(playerFootingRecencyAllowsExpression(serious, SEED, clockAt(7), footing("serious-stumble", 7).admission)).toBe(false);
  });

  it("rejects histories that could not pass the older meaning's priority-qualified family gate", () => {
    const empty = createPlayerExpressionRecencyState(SEED);
    const strongOrigin = footing("serious-stumble");
    for (let gap = 1; gap < 6; gap += 1) {
      const ordinary = footing("ordinary-stumble", 1 + gap);
      expect(canonicalizePlayerExpressionRecencyState({
        ...empty, footing: [ordinary, strongOrigin],
      }, SEED, clockAt(1 + gap))).toBeNull();
    }
    const atExpiry = footing("ordinary-stumble", 7);
    expect(canonicalizePlayerExpressionRecencyState({
      ...empty, footing: [atExpiry, strongOrigin],
    }, SEED, clockAt(7))?.footing).toEqual([atExpiry, strongOrigin]);
    const ordinaryOrigin = footing();
    const laterStrong = footing("serious-stumble", 2);
    expect(canonicalizePlayerExpressionRecencyState({
      ...empty, footing: [ordinaryOrigin, laterStrong],
    }, SEED, clockAt(2))?.footing).toEqual([ordinaryOrigin, laterStrong]);
  });

  it("does not relabel important cargo protection as an ordinary or serious footing choice", () => {
    const empty = createPlayerExpressionRecencyState(SEED);
    for (const causalClass of ["ordinary-stumble", "serious-stumble"] as const) {
      for (const payload of ["promise", "gear"] as const) {
        const belowThreshold = impactedCargo(footing(causalClass), payload, 259_999);
        expect(playerFootingExpressionAdmissionPolicy(belowThreshold.admission)).not.toBeNull();
        expect(accepted(empty, belowThreshold, 1).footing).toEqual([belowThreshold]);
        for (const shock of [260_000, 1_000_000]) {
          const cargo = impactedCargo(footing(causalClass), payload, shock);
          expect(playerFootingExpressionAdmissionPolicy(cargo.admission)).toBeNull();
          expect(canonicalizePlayerExpressionRecencyState({ ...empty, footing: [cargo] }, SEED, clockAt(1))).toBeNull();
          expect(recordAcceptedPlayerFootingExpression(empty, SEED, clockAt(1), cargo)).toBeNull();
        }
      }
      for (const payload of ["crafting", "provision"] as const) {
        const ordinaryCargo = impactedCargo(footing(causalClass), payload, 1_000_000);
        expect(playerFootingExpressionAdmissionPolicy(ordinaryCargo.admission)).not.toBeNull();
        expect(accepted(empty, ordinaryCargo, 1).footing).toEqual([ordinaryCargo]);
      }
    }
  });

  it("does not erase stronger still-live history when ordinary footing is accepted later", () => {
    const strongOrigin = footing("serious-stumble");
    const serious = accepted(createPlayerExpressionRecencyState(SEED), strongOrigin, 1);
    const ordinaryOrigin = footing("ordinary-stumble", 7);
    const mixed = accepted(serious, ordinaryOrigin, 7);
    expect(mixed.footing).toEqual([ordinaryOrigin, strongOrigin]);
    expect(mixed.footing).toHaveLength(PLAYER_FOOTING_RECENCY_MAX_RECEIPTS);
    for (let step = 8; step <= 16; step += 1) {
      expect(playerFootingRecencyAllowsExpression(mixed, SEED, clockAt(step), footing("serious-stumble", step).admission)).toBe(false);
    }
    expect(playerFootingRecencyAllowsExpression(mixed, SEED, clockAt(17), footing("serious-stumble", 17).admission)).toBe(true);
    expect(canonicalizePlayerExpressionRecencyState(mixed, SEED, clockAt(17))?.footing).toEqual([ordinaryOrigin]);
    expect(playerFootingRecencyAllowsExpression(mixed, SEED, clockAt(18), footing("ordinary-stumble", 18).admission)).toBe(false);
    expect(playerFootingRecencyAllowsExpression(mixed, SEED, clockAt(19), footing("ordinary-stumble", 19).admission)).toBe(true);
  });

  it("uses physical ordinal rather than sound index and normalizes the phase-ten clamp", () => {
    for (const soundOrdinal of [0, 7]) {
      const origin = footing("serious-stumble", 7, soundOrdinal);
      const state = accepted(createPlayerExpressionRecencyState(SEED), origin, 7);
      expect(origin.step.sampleOrdinal).toBe(6);
      expect(playerFootingRecencyAge(origin, clockAt(7))).toBe(0);
      expect(playerFootingRecencyAge(origin, clockAt(10))).toBe(3);
      expect(playerFootingRecencyAllowsExpression(state, SEED, clockAt(22), footing("serious-stumble", 22).admission)).toBe(false);
      expect(playerFootingRecencyAllowsExpression(state, SEED, clockAt(23), footing("serious-stumble", 23).admission)).toBe(true);
    }
    const tenth = footing("serious-stumble", 10, 0);
    expect(tenth.admission.admittedAtPlayerStepPhase).toBe(9);
    expect(tenth.step.sampleOrdinal).toBe(9);
    expect(recordAcceptedPlayerFootingExpression(createPlayerExpressionRecencyState(SEED), SEED, clockAt(9), tenth)).toBeNull();
    const state = accepted(createPlayerExpressionRecencyState(SEED), tenth, 10);
    expect(playerFootingRecencyAge(tenth, clockAt(10))).toBe(0);
    expect(playerFootingRecencyAllowsExpression(state, SEED, clockAt(25), footing("serious-stumble", 25).admission)).toBe(false);
    expect(playerFootingRecencyAllowsExpression(state, SEED, clockAt(26), footing("serious-stumble", 26).admission)).toBe(true);
    expect(recordAcceptedPlayerFootingExpression(createPlayerExpressionRecencyState(SEED), SEED, clockAt(11), tenth)).toBeNull();
  });

  it("roundtrips immutable bounded facts without any replayable presentation or audio fields", () => {
    const state = accepted(
      accepted(createPlayerExpressionRecencyState(SEED), footing("serious-stumble"), 1),
      footing("ordinary-stumble", 7), 7,
    );
    const restored = canonicalizePlayerExpressionRecencyState(JSON.parse(JSON.stringify(state)), SEED, clockAt(7));
    expect(restored).toEqual(state);
    expect(Object.isFrozen(restored)).toBe(true);
    expect(Object.isFrozen(restored?.footing)).toBe(true);
    expect(Object.keys(state)).toEqual(["version", "effort", "footing", "cargo"]);
    for (const receipt of restored?.footing ?? []) {
      expect(Object.isFrozen(receipt)).toBe(true);
      expect(Object.isFrozen(receipt.admission)).toBe(true);
      expect(Object.isFrozen(receipt.authority.playerPosition.region)).toBe(true);
      expect(Object.isFrozen(receipt.step)).toBe(true);
      expect(Object.keys(receipt)).toEqual(["admission", "authority", "step"]);
    }
    for (const replayableKey of ["active", "text", "caption", "reception", "audioAcknowledged", "remainingSteps"]) {
      expect(JSON.stringify(state)).not.toContain(`"${replayableKey}":`);
    }
  });

  it("rejects malformed, mismatched, future, duplicate, unordered and unbounded footing history", () => {
    const ordinary = footing();
    const serious = footing("serious-stumble");
    const empty = createPlayerExpressionRecencyState(SEED);
    const valid = { ...empty, footing: [ordinary] };
    const mismatchedPhase = {
      ...ordinary,
      admission: { ...ordinary.admission, admittedAtPlayerStepPhase: 2 },
      authority: { ...ordinary.authority, admittedAtPlayerStepPhase: 2 },
    };
    const invalidReceipts = [
      null,
      { ...ordinary, caption: "synthetic forbidden presentation" },
      { ...ordinary, authority: null },
      { ...ordinary, authority: { ...ordinary.authority, causalDigest: "0000000000000000" } },
      { ...ordinary, authority: { ...ordinary.authority, sampleOrdinal: 0 } },
      { ...ordinary, authority: { ...ordinary.authority, sourceActorId: "resident:1" } },
      { ...ordinary, admission: { ...ordinary.admission, hazardSeverity: 650_000 } },
      { ...ordinary, admission: { ...ordinary.admission, triggerEventId: "contract:forged" } },
      { ...ordinary, admission: { ...ordinary.admission, remainingSteps: 12 } },
      { ...ordinary, step: { ...ordinary.step, traversalIncidentKind: "fall" } },
      { ...ordinary, step: { ...ordinary.step, sampleOrdinal: 10 } },
      { ...ordinary, step: { ...ordinary.step, moved: false } },
      { ...ordinary, step: { ...ordinary.step, caption: "forbidden" } },
      mismatchedPhase,
    ];
    for (const receipt of invalidReceipts) {
      expect(canonicalizePlayerExpressionRecencyState({ ...empty, footing: [receipt] }, SEED, clockAt(1))).toBeNull();
      expect(recordAcceptedPlayerFootingExpression(empty, SEED, clockAt(1), receipt)).toBeNull();
    }
    for (const invalid of [
      { ...valid, version: 3 }, { ...valid, caption: "forbidden" },
      { ...valid, footing: null }, { ...valid, footing: [ordinary, ordinary] },
      { ...valid, footing: [serious, ordinary] },
      { ...valid, footing: [ordinary, serious, footing("ordinary-stumble", 2)] },
      { ...valid, footing: Array(1) },
    ]) expect(canonicalizePlayerExpressionRecencyState(invalid, SEED, clockAt(1))).toBeNull();
    expect(canonicalizePlayerExpressionRecencyState(valid, seedFromText("another world"), clockAt(1))).toBeNull();
    expect(canonicalizePlayerExpressionRecencyState(valid, SEED, clockAt(0))).toBeNull();
    expect(canonicalizePlayerExpressionRecencyState(valid, SEED, { completedTick: INITIAL_TICK, playerStepPhase: 10 })).toBeNull();
    for (const clock of [
      { completedTick: -1, playerStepPhase: 0 },
      { completedTick: INITIAL_TICK, playerStepPhase: -0 },
      { completedTick: INITIAL_TICK, playerStepPhase: 0.5 },
      { completedTick: INITIAL_TICK, playerStepPhase: 1, wallTime: 1 },
    ]) expect(canonicalizePlayerExpressionRecencyState(valid, SEED, clock)).toBeNull();
    expect(recordAcceptedPlayerFootingExpression(empty, SEED, clockAt(2), ordinary)).toBeNull();
    const recorded = accepted(empty, ordinary, 1);
    expect(recordAcceptedPlayerFootingExpression(recorded, SEED, clockAt(1), ordinary)).toBeNull();
  });

  it("rejects one incident presented as both independent footing meanings", () => {
    const trigger = "contract:one-physical-incident";
    const ordinary = footing("ordinary-stumble", 1, 0, trigger);
    const serious = footing("serious-stumble", 2, 0, trigger);
    expect(ordinary.admission.eventId).toBe(serious.admission.eventId);
    expect(canonicalizePlayerExpressionRecencyState({
      ...createPlayerExpressionRecencyState(SEED), footing: [ordinary, serious],
    }, SEED, clockAt(2))).toBeNull();
    // Different event IDs still cannot describe two choices from the same
    // physical frontier, even when their sound-ledger indexes differ.
    expect(canonicalizePlayerExpressionRecencyState({
      ...createPlayerExpressionRecencyState(SEED),
      footing: [footing("ordinary-stumble", 1, 0), footing("serious-stumble", 1, 7)],
    }, SEED, clockAt(1))).toBeNull();
  });

  it("delegates the effort-only600-step eligibility while leaving the pending-sound and footing laws unchanged", () => {
    expect(PLAYER_EFFORT_REANNOUNCEMENT_STEPS).toBe(600);
    expect(situatedExpressionCooldownSteps("need-rest-after-exertion")).toEqual({ meaning: 36, family: 12 });
    const evidence = {
      committedWorldTick: INITIAL_TICK, admittedAtPlayerStepPhase: 1,
      acceptedDistanceUnits: 105, resolution: "dry-exhaustion-camp" as const,
    };
    const policy = playerEffortExpressionPolicy("player:local", evidence);
    const admission = policy === null ? null : createPlayerExhaustionExpressionAdmissionRecord({
      ...evidence, sourceActorId: "player:local", triggerEventId: policy.triggerEventId, sampleOrdinal: 0,
    });
    const step = createPlayerStepStateSample({
      sampleOrdinal: 0, staminaBefore: 12_500, staminaAfter: 0,
      modeBefore: "foot", modeAfter: "camp", acceptedDistanceUnits: 105, moved: true,
      exhausted: true, rescued: false, becameSwept: false, traversalIncidentKind: null,
      startingWaterDepth: 0, endingWaterDepth: 0,
    });
    const predecessor = createPlayerStepStateAnchor(0, 12_500, "foot");
    if (admission === null || step === null || predecessor === null) throw new Error("Invalid effort fixture");
    const effort = recordAcceptedPlayerEffortExpression(SEED, {
      admission, step, predecessor, beforePosition: POSITION,
      afterPosition: translateWorldPosition(POSITION, 105, 0),
    });
    if (effort === null) throw new Error("Effort fixture lost existing validation");
    const combined = { ...createPlayerExpressionRecencyState(SEED), effort };
    for (let age = 0; age <= 600; age += 1) {
      const clock = clockAt(1 + age);
      const restored = canonicalizePlayerExpressionRecencyState(combined, SEED, clock);
      expect(restored?.effort).toEqual(canonicalizePlayerEffortRecencyState(effort, SEED, clock));
      expect(restored?.footing).toEqual([]);
      if (age < 600) expect(restored?.effort.lastAccepted).toEqual(effort.lastAccepted);
    }
    expect(canonicalizePlayerExpressionRecencyState(combined, SEED, clockAt(601)))
      .toEqual(createPlayerExpressionRecencyState(SEED));

    const withFooting = accepted(combined, footing("ordinary-stumble", 7), 7);
    const restored = canonicalizePlayerExpressionRecencyState(JSON.parse(JSON.stringify(withFooting)), SEED, clockAt(38));
    expect(restored).toEqual(combined);
    expect(restored?.effort.lastAccepted?.admission).toEqual(admission);
    expect(Object.keys(restored ?? {})).toEqual(["version", "effort", "footing", "cargo"]);
    expect(restored?.footing).toEqual([]);
    expect(Object.isFrozen(restored?.effort.lastAccepted)).toBe(true);
    for (const replayableKey of ["active", "text", "caption", "reception", "audioAcknowledged", "remainingSteps"]) {
      expect(JSON.stringify(restored)).not.toContain(`"${replayableKey}":`);
    }
  });
});

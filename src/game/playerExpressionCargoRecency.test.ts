import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { stableStringify } from "../sim/util";
import type { PlayerEffortRecencyClock } from "./playerEffortRecency";
import { playerCargoExpressionAdmissionPolicy } from "./playerExpressionAuthority";
import {
  PLAYER_CARGO_RECENCY_MAX_RECEIPTS,
  PLAYER_EXPRESSION_RECENCY_VERSION,
  canonicalizePlayerExpressionRecencyState,
  createPlayerExpressionRecencyState,
  playerCargoRecencyAge,
  playerCargoRecencyAllowsExpression,
  recordAcceptedPlayerCargoExpression,
  recordAcceptedPlayerFootingExpression,
  upgradePlayerExpressionRecencyV1,
  type PlayerCargoRecencyReceipt,
  type PlayerExpressionRecencyState,
  type PlayerFootingRecencyReceipt,
} from "./playerExpressionRecency";
import { createPlayerStepStateSample } from "./playerStepState";
import { situatedExpressionCooldownSteps } from "./situatedExpression";
import {
  createPlayerFallRecoveryExpressionAdmissionRecord,
  createPlayerTraversalExpressionAdmissionRecord,
} from "./situatedExpressionAdmissionLedger";
import { createSituatedExpressionCausalAuthorityRecord } from "./situatedExpressionCausalAuthority";
import { createWorldPosition } from "./worldPosition";

const SEED = seedFromText("bounded current cargo choice contract");
const POSITION = createWorldPosition(createRegionCoord(-4, 7), 31_000, 18_000);
const INITIAL_TICK = 420;
type CargoKind = "protection" | "loss" | "recovery";

function clockAt(acceptedSteps: number): PlayerEffortRecencyClock {
  return { completedTick: INITIAL_TICK + Math.floor(acceptedSteps / 10), playerStepPhase: acceptedSteps % 10 };
}

/** Synthetic source facts through genuine factories, not playable physics or custody proof. */
function traversal(kind: "protection" | "loss" | "footing", acceptedStep: number, soundOrdinal = 6): PlayerFootingRecencyReceipt {
  const physicalOrdinal = (acceptedStep - 1) % 10;
  const loss = kind === "loss";
  const ordinary = kind === "footing";
  const incidentKind = loss ? "fall" : "stumble";
  const admission = createPlayerTraversalExpressionAdmissionRecord({
    sourceActorId: "player:local", triggerEventId: `contract:${kind}:${acceptedStep}:${soundOrdinal}`,
    sampleOrdinal: soundOrdinal, admittedAtPlayerStepPhase: Math.min(9, physicalOrdinal + 1),
    causalClass: loss ? "cargo-separation" : ordinary ? "ordinary-stumble" : "important-cargo-impact",
    incidentKind, hazardSeverity: ordinary ? 210_000 : 650_000,
    cargoOutcome: loss ? "separated" : ordinary ? "unchanged" : "impacted-carried",
    selectedPayloadKind: ordinary ? null : "promise", cargoShock: ordinary ? 80_000 : 700_000,
    separatedEntityIds: loss ? [`contract:parcel:${acceptedStep}`] : [],
    separationEventId: loss ? `contract:scatter:${acceptedStep}` : null,
  });
  const authority = admission === null ? null : createSituatedExpressionCausalAuthorityRecord(
    admission, INITIAL_TICK + Math.floor((acceptedStep - 1) / 10), POSITION,
  );
  const step = createPlayerStepStateSample({
    sampleOrdinal: physicalOrdinal, staminaBefore: 800_000, staminaAfter: 780_000,
    modeBefore: "foot", modeAfter: "foot", acceptedDistanceUnits: 105, moved: true,
    exhausted: false, rescued: false, becameSwept: false, traversalIncidentKind: incidentKind,
    startingWaterDepth: 0, endingWaterDepth: 0,
  });
  if (admission === null || authority === null || step === null) throw new Error("Invalid current traversal contract fixture");
  return { admission, authority, step };
}

function cargo(kind: CargoKind, acceptedStep = 1, soundOrdinal = 6): PlayerCargoRecencyReceipt {
  if (kind !== "recovery") return traversal(kind, acceptedStep, soundOrdinal);
  const clock = clockAt(acceptedStep);
  const recoveryEventId = `contract:recovery:${acceptedStep}:${soundOrdinal}`;
  const admission = createPlayerFallRecoveryExpressionAdmissionRecord({
    sourceActorId: "player:local", triggerEventId: recoveryEventId, sampleOrdinal: soundOrdinal,
    admittedAtPlayerStepPhase: clock.playerStepPhase, recoveryEventId,
    recoveredEntityId: `contract:parcel:${acceptedStep}`,
  });
  const authority = admission === null ? null : createSituatedExpressionCausalAuthorityRecord(admission, clock.completedTick, POSITION);
  if (admission === null || authority === null) throw new Error("Invalid current recovery contract fixture");
  return { admission, authority, step: null };
}

function accepted(state: PlayerExpressionRecencyState, receipt: PlayerCargoRecencyReceipt, step: number): PlayerExpressionRecencyState {
  const next = recordAcceptedPlayerCargoExpression(state, SEED, clockAt(step), receipt);
  if (next === null) throw new Error("Expected accepted cargo choice history");
  return next;
}

describe("bounded accepted cargo choice history contract", () => {
  it.each([
    ["recovery", "relief-after-cargo-recovery", 14, 5],
    ["protection", "protect-important-cargo", 12, 4],
    ["loss", "alarm-at-cargo-loss", 20, 8],
  ] as const)("retains exact existing meaning/family law for %s", (kind, meaning, meaningSteps, familySteps) => {
    const origin = cargo(kind);
    expect(playerCargoExpressionAdmissionPolicy(origin.admission)).toMatchObject({ meaning, family: "cargo" });
    expect(situatedExpressionCooldownSteps(meaning)).toEqual({ meaning: meaningSteps, family: familySteps });
    const state = accepted(createPlayerExpressionRecencyState(SEED), origin, 1);
    for (let age = 0; age < meaningSteps; age += 1) {
      const fresh = cargo(kind, 1 + age, 0);
      expect(playerCargoRecencyAllowsExpression(state, SEED, clockAt(1 + age), fresh.admission)).toBe(false);
      expect(recordAcceptedPlayerCargoExpression(state, SEED, clockAt(1 + age), fresh)).toBeNull();
    }
    const fresh = cargo(kind, 1 + meaningSteps);
    expect(playerCargoRecencyAllowsExpression(state, SEED, clockAt(1 + meaningSteps), fresh.admission)).toBe(true);
    expect(canonicalizePlayerExpressionRecencyState(state, SEED, clockAt(1 + meaningSteps))?.cargo).toEqual([]);
    expect(accepted(state, fresh, 1 + meaningSteps).cargo).toEqual([fresh]);
  });

  it("keeps priority-qualified family locks while genuine loss permits a resolving recovery", () => {
    const empty = createPlayerExpressionRecencyState(SEED);
    const protection = accepted(empty, cargo("protection"), 1);
    for (let age = 0; age < 4; age += 1) {
      expect(playerCargoRecencyAllowsExpression(protection, SEED, clockAt(1 + age), cargo("recovery", 1 + age).admission)).toBe(false);
    }
    expect(playerCargoRecencyAllowsExpression(protection, SEED, clockAt(5), cargo("recovery", 5).admission)).toBe(true);
    expect(playerCargoRecencyAllowsExpression(protection, SEED, clockAt(2), cargo("loss", 2).admission)).toBe(true);
    const loss = accepted(empty, cargo("loss"), 1);
    for (let age = 0; age < 8; age += 1) {
      expect(playerCargoRecencyAllowsExpression(loss, SEED, clockAt(1 + age), cargo("protection", 1 + age).admission)).toBe(false);
    }
    expect(playerCargoRecencyAllowsExpression(loss, SEED, clockAt(9), cargo("protection", 9).admission)).toBe(true);
    const recovery = cargo("recovery", 1);
    expect(playerCargoRecencyAllowsExpression(loss, SEED, clockAt(1), recovery.admission)).toBe(true);
    expect(accepted(loss, recovery, 1).cargo).toHaveLength(2);
    const recovered = accepted(empty, cargo("recovery"), 1);
    expect(playerCargoRecencyAllowsExpression(recovered, SEED, clockAt(2), cargo("protection", 2).admission)).toBe(true);
  });

  it("does not let a later loss-resolution exception bypass a still-live recovery meaning", () => {
    const first = cargo("recovery");
    const recovered = accepted(createPlayerExpressionRecencyState(SEED), first, 1);
    const lostAgain = accepted(recovered, cargo("loss", 2), 2);
    for (let step = 2; step < 15; step += 1) {
      const next = cargo("recovery", step);
      expect(playerCargoRecencyAllowsExpression(lostAgain, SEED, clockAt(step), next.admission)).toBe(false);
      expect(recordAcceptedPlayerCargoExpression(lostAgain, SEED, clockAt(step), next)).toBeNull();
    }
    expect(playerCargoRecencyAllowsExpression(lostAgain, SEED, clockAt(15), cargo("recovery", 15).admission)).toBe(true);
    expect(accepted(lostAgain, cargo("recovery", 15), 15).cargo).toEqual([cargo("loss", 2), cargo("recovery", 15)]);
  });

  it("uses manual action phase9 but physical ordinal9 plus one at the world boundary", () => {
    const empty = createPlayerExpressionRecencyState(SEED);
    const pickup = cargo("recovery", 9);
    const recovered = accepted(empty, pickup, 9);
    expect(pickup.step).toBeNull();
    expect(playerCargoRecencyAge(pickup, clockAt(9))).toBe(0);
    expect(playerCargoRecencyAge(pickup, clockAt(10))).toBe(1);
    expect(playerCargoRecencyAllowsExpression(recovered, SEED, clockAt(10), cargo("recovery", 10).admission)).toBe(false);
    for (const soundOrdinal of [0, 7]) {
      const tenth = cargo("loss", 10, soundOrdinal);
      expect(tenth.admission.admittedAtPlayerStepPhase).toBe(9);
      expect(tenth.step?.sampleOrdinal).toBe(9);
      expect(playerCargoRecencyAge(tenth, clockAt(9))).toBeNull();
      expect(recordAcceptedPlayerCargoExpression(empty, SEED, clockAt(9), tenth)).toBeNull();
      const state = accepted(empty, tenth, 10);
      expect(playerCargoRecencyAge(tenth, clockAt(10))).toBe(0);
      expect(playerCargoRecencyAge(tenth, clockAt(11))).toBe(1);
      expect(playerCargoRecencyAllowsExpression(state, SEED, clockAt(29), cargo("loss", 29).admission)).toBe(false);
      expect(playerCargoRecencyAllowsExpression(state, SEED, clockAt(30), cargo("loss", 30).admission)).toBe(true);
      expect(recordAcceptedPlayerCargoExpression(empty, SEED, clockAt(11), tenth)).toBeNull();
    }
  });

  it("retains one latest origin per current cargo meaning without erasing other live locks", () => {
    const empty = createPlayerExpressionRecencyState(SEED);
    let state = accepted(accepted(accepted(empty, cargo("protection"), 1), cargo("loss", 2), 2), cargo("recovery", 2), 2);
    expect(PLAYER_CARGO_RECENCY_MAX_RECEIPTS).toBe(3);
    expect(state.cargo).toEqual([cargo("loss", 2), cargo("protection"), cargo("recovery", 2)]);
    state = accepted(state, cargo("protection", 13), 13);
    expect(state.cargo).toEqual([cargo("loss", 2), cargo("protection", 13), cargo("recovery", 2)]);
    expect(playerCargoRecencyAllowsExpression(state, SEED, clockAt(15), cargo("loss", 15).admission)).toBe(false);
    expect(playerCargoRecencyAllowsExpression(state, SEED, clockAt(15), cargo("protection", 15).admission)).toBe(false);
    for (let cycle = 1; cycle <= 8; cycle += 1) {
      const start = 1 + cycle * 25;
      state = accepted(state, cargo("protection", start), start);
      state = accepted(state, cargo("loss", start + 1), start + 1);
      state = accepted(state, cargo("recovery", start + 1), start + 1);
      expect(state.cargo).toHaveLength(PLAYER_CARGO_RECENCY_MAX_RECEIPTS);
    }
  });

  it("validates historical family choices at their original frontiers, not only today's ages", () => {
    const empty = createPlayerExpressionRecencyState(SEED);
    const protection = cargo("protection");
    const earlyRecovery = cargo("recovery", 2);
    expect(canonicalizePlayerExpressionRecencyState({ ...empty, cargo: [protection, earlyRecovery] }, SEED, clockAt(10))).toBeNull();
    const lawfulRecovery = cargo("recovery", 5);
    expect(canonicalizePlayerExpressionRecencyState({ ...empty, cargo: [protection, lawfulRecovery] }, SEED, clockAt(10))?.cargo)
      .toEqual([protection, lawfulRecovery]);
    const loss = cargo("loss", 2);
    const resolvingRecovery = cargo("recovery", 2);
    expect(canonicalizePlayerExpressionRecencyState({ ...empty, cargo: [loss, protection, resolvingRecovery] }, SEED, clockAt(10))?.cargo)
      .toEqual([loss, protection, resolvingRecovery]);
  });

  it("roundtrips exact immutable v2 history without presentation, replay or input mutation", () => {
    const state = accepted(accepted(createPlayerExpressionRecencyState(SEED), cargo("loss"), 1), cargo("recovery", 1), 1);
    const input: unknown = JSON.parse(JSON.stringify(state));
    const before = stableStringify(input);
    const restored = canonicalizePlayerExpressionRecencyState(input, SEED, clockAt(1));
    expect(PLAYER_EXPRESSION_RECENCY_VERSION).toBe(2);
    expect(restored).toEqual(state);
    expect(Object.keys(restored ?? {})).toEqual(["version", "effort", "footing", "cargo"]);
    expect(Object.isFrozen(restored)).toBe(true);
    expect(Object.isFrozen(restored?.cargo)).toBe(true);
    for (const receipt of restored?.cargo ?? []) {
      expect(Object.keys(receipt)).toEqual(["admission", "authority", "step"]);
      expect(Object.isFrozen(receipt)).toBe(true);
      expect(Object.isFrozen(receipt.admission)).toBe(true);
      expect(Object.isFrozen(receipt.authority.playerPosition.region)).toBe(true);
      if (receipt.step !== null) expect(Object.isFrozen(receipt.step)).toBe(true);
    }
    expect(stableStringify(input)).toBe(before);
    for (const key of ["active", "text", "caption", "reception", "audioAcknowledged", "remainingSteps"]) {
      expect(JSON.stringify(restored)).not.toContain(`"${key}":`);
    }
  });

  it("rejects malformed, mismatched, future, duplicate, unordered and over-cap cargo histories", () => {
    const empty = createPlayerExpressionRecencyState(SEED);
    const loss = cargo("loss");
    const recovery = cargo("recovery");
    const protection = cargo("protection");
    for (const receipt of [
      null, { ...loss, caption: "forbidden" }, { ...loss, step: null }, { ...recovery, step: loss.step },
      { ...loss, authority: null }, { ...loss, authority: { ...loss.authority, causalDigest: "0000000000000000" } },
      { ...loss, authority: { ...loss.authority, sourceActorId: "resident:1" } },
      { ...loss, admission: { ...loss.admission, triggerEventId: "contract:forged" } },
      { ...loss, admission: { ...loss.admission, cargoShock: 1 } },
      { ...loss, step: { ...loss.step, sampleOrdinal: 10 } },
      { ...loss, step: { ...loss.step, traversalIncidentKind: "stumble" } },
      { ...loss, step: { ...loss.step, caption: "forbidden" } },
      { ...loss, admission: { ...loss.admission, admittedAtPlayerStepPhase: 2 }, authority: { ...loss.authority, admittedAtPlayerStepPhase: 2 } },
    ]) {
      expect(canonicalizePlayerExpressionRecencyState({ ...empty, cargo: [receipt] }, SEED, clockAt(1))).toBeNull();
      expect(recordAcceptedPlayerCargoExpression(empty, SEED, clockAt(1), receipt)).toBeNull();
    }
    for (const invalid of [
      { ...empty, version: 1 }, { ...empty, cargo: undefined }, { ...empty, cargo: null },
      { ...empty, cargo: Array(1) }, { ...empty, cargo: [loss, loss] },
      { ...empty, cargo: [recovery, loss] }, { ...empty, cargo: [loss, protection, recovery, recovery] },
      { ...empty, cargo: [cargo("protection", 1), cargo("protection", 13)] },
      { ...empty, cargo: [loss, protection] }, // Different traversal events cannot share a physical frontier.
      { ...empty, cargo: [protection], footing: [traversal("footing", 1)] },
      { ...empty, cargo: [loss], audio: [] },
    ]) expect(canonicalizePlayerExpressionRecencyState(invalid, SEED, clockAt(13))).toBeNull();
    expect(canonicalizePlayerExpressionRecencyState({ ...empty, cargo: [loss] }, SEED, clockAt(0))).toBeNull();
    expect(canonicalizePlayerExpressionRecencyState({ ...empty, cargo: [loss] }, seedFromText("other world"), clockAt(1))).toBeNull();
    expect(playerCargoRecencyAge(loss, { completedTick: INITIAL_TICK, playerStepPhase: 10 })).toBeNull();
    expect(playerCargoRecencyAllowsExpression(empty, SEED, clockAt(1), traversal("footing", 1).admission)).toBeNull();
    expect(recordAcceptedPlayerCargoExpression(empty, SEED, clockAt(2), loss)).toBeNull();
  });

  it("upgrades only exact supported v1 and never guesses cargo history or pruned legacy facts", () => {
    const empty = createPlayerExpressionRecencyState(SEED);
    const footing = traversal("footing", 1);
    const state = recordAcceptedPlayerFootingExpression(empty, SEED, clockAt(1), footing);
    if (state === null) throw new Error("Invalid existing footing upgrade fixture");
    const legacy = { version: 1, effort: state.effort, footing: state.footing };
    expect(canonicalizePlayerExpressionRecencyState(legacy, SEED, clockAt(1))).toBeNull();
    const upgraded = upgradePlayerExpressionRecencyV1(JSON.parse(JSON.stringify(legacy)), SEED, clockAt(1));
    expect(upgraded).toEqual(state);
    expect(upgraded?.cargo).toEqual([]);
    expect(Object.isFrozen(upgraded)).toBe(true);
    expect(upgradePlayerExpressionRecencyV1(legacy, SEED, clockAt(13))).toBeNull();
    expect(upgradePlayerExpressionRecencyV1({ version: 1, effort: empty.effort, footing: [] }, SEED, clockAt(13))).toEqual(empty);
    for (const invalid of [
      state, { ...legacy, version: 0 }, { ...legacy, cargo: [] }, { ...legacy, caption: "forbidden" },
      { version: 1, effort: state.effort }, { ...legacy, footing: null },
    ]) expect(upgradePlayerExpressionRecencyV1(invalid, SEED, clockAt(1))).toBeNull();
    expect(upgradePlayerExpressionRecencyV1(legacy, seedFromText("other world"), clockAt(1))).toBeNull();
    expect(upgradePlayerExpressionRecencyV1(legacy, SEED, clockAt(0))).toBeNull();
  });
});

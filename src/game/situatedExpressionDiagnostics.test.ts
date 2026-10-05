import { afterEach, describe, expect, it, vi } from "vitest";

import { createRegionCoord } from "../sim/regions";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import { playerEffortExpressionIntent } from "./playerEffortExpression";
import * as traversalProducer from "./playerTraversalExpression";
import type { PlayerTraversalExpressionInput } from "./playerTraversalExpression";
import {
  createSituatedExpressionState,
  projectSituatedExpression,
  reduceSituatedExpression,
  type SituatedExpressionIntent,
} from "./situatedExpression";
import { createPlayerExhaustionExpressionAdmissionRecord } from "./situatedExpressionAdmissionLedger";
import {
  EXPRESSION_DIAGNOSTIC_CAPACITY,
  appendExpressionDiagnostic,
  createExpressionDiagnosticState,
  previewExpressionDiagnostic,
  replayExpressionDiagnosticProducer,
  selectExpressionDiagnostics,
  setExpressionDiagnosticEnabled,
  type ExpressionDiagnosticInput,
  type ExpressionDiagnosticProducerContext,
  type ExpressionDiagnosticReason,
  type ExpressionPreviewOverrides,
} from "./situatedExpressionDiagnostics";
import {
  createHeardVisibleSituatedExpressionReception,
  createSelfSituatedExpressionReception,
} from "./situatedExpressionReception";
import { createWorldPosition } from "./worldPosition";

afterEach(() => vi.restoreAllMocks());

// Tooling-only evidence: these constructors do not perform physical exhaustion,
// listener hearing, or gameplay admission. Runtime integration proves those.
function acceptedEvidence(completedTick = 28): ExpressionDiagnosticInput {
  const intent = playerEffortExpressionIntent({
    sourceActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
    position: createWorldPosition(createRegionCoord(-4, 7), 31_000, 18_000),
    committedWorldTick: completedTick,
    admittedAtPlayerStepPhase: 6,
    acceptedDistanceUnits: 105,
    resolution: "dry-exhaustion-camp",
  });
  if (intent === null) throw new Error("diagnostic fixture requires a valid effort intent");
  const priorState = createSituatedExpressionState();
  const reduction = reduceSituatedExpression(priorState, intent);
  if (reduction.event === null) throw new Error("diagnostic fixture requires a selected event");
  const admission = createPlayerExhaustionExpressionAdmissionRecord({
    sourceActorId: intent.sourceActorId,
    triggerEventId: intent.triggerEventId,
    sampleOrdinal: 0,
    admittedAtPlayerStepPhase: 6,
    committedWorldTick: completedTick,
    acceptedDistanceUnits: 105,
    resolution: "dry-exhaustion-camp",
  });
  const playerReception = createSelfSituatedExpressionReception(reduction.event, completedTick);
  if (admission === null || playerReception === null) {
    throw new Error("diagnostic fixture requires valid admission and reception evidence");
  }
  return {
    completedTick,
    playerStepPhase: 6,
    intent,
    priorState,
    reason: reduction.reason,
    event: reduction.event,
    admission,
    playerReception,
    sourceBelief: null,
    weather: "clear",
    contextualText: null,
  };
}

// Copied adapter-contract facts, not a generated fall, cargo transaction or
// independently authenticated player observation. Actual runtime capture is
// proved by the existing fall integration fixtures.
function traversalInput(
  overrides: Partial<PlayerTraversalExpressionInput> = {},
): PlayerTraversalExpressionInput {
  return {
    sourceActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
    position: createWorldPosition(createRegionCoord(-14, 23), 4_000, 18_000),
    incident: {
      id: "player:0:traversal:7",
      actorId: 0,
      traversalOrdinal: 7,
      kind: "stumble",
      primaryCause: "loose-rock",
      label: "oop · loose rock",
      detail: "Brace or choose a sounder line.",
      position: { x: 12, y: 14 },
      remainingSteps: 10,
      totalSteps: 10,
      variantSeed: 481,
      cue: "stumble",
    },
    evaluation: {
      version: 1,
      valid: true,
      evaluated: true,
      outcome: "stumbled",
      fell: false,
      stumbled: true,
      usedTraversalOrdinal: 7,
      nextTraversalOrdinal: 8,
      ordinalExhausted: false,
      roll: 540_000,
      feedbackEventId: 481,
      forecast: {
        chance: 400_000,
        stumbleChance: 280_000,
        band: "high",
        hazardSeverity: 390_000,
        seriousHazard: false,
        guaranteedByZeroStability: false,
        causes: [{
          code: "loose-rock",
          label: "Loose rock",
          intensity: 500_000,
          contribution: 220_000,
        }],
        primaryCause: "loose-rock",
        mitigation: { brace: 0, footwear: 0, fixture: 0, total: 0 },
      },
      consequenceQuote: {
        severity: "stumble",
        motion: "knockback",
        displacementSteps: 0,
        staminaShock: 80_000,
        stabilityShock: 140_000,
        cargoShock: 180_000,
        verticalExposure: 0,
      },
    },
    cargo: {
      outcome: "impacted-carried",
      selectedPayload: { kind: "stack", item: "sunfiber", quantity: 2 },
      separatedEntityIds: [],
      cargoShock: 180_000,
    },
    ...overrides,
  };
}

function traversalEvidence(
  input = traversalInput(),
  reason: ExpressionDiagnosticReason = "accepted",
): ExpressionDiagnosticInput {
  const intent = traversalProducer.playerTraversalExpressionIntent(input);
  if (intent === null) throw new Error("diagnostic fixture requires a supported traversal intent");
  const priorState = createSituatedExpressionState();
  const reduction = reduceSituatedExpression(priorState, intent);
  if (reduction.event === null) throw new Error("diagnostic fixture requires a selected traversal event");
  return {
    completedTick: 28,
    playerStepPhase: 6,
    intent,
    priorState,
    reason,
    event: reason === "accepted" ? reduction.event : null,
    admission: null,
    playerReception: reason === "accepted"
      ? createSelfSituatedExpressionReception(reduction.event, 28)
      : null,
    sourceBelief: null,
    weather: "storm",
    contextualText: null,
    producerContext: { kind: "player-traversal", input },
  };
}

function objectGraph(value: unknown, found = new Set<object>()): Set<object> {
  if (value !== null && typeof value === "object" && !found.has(value)) {
    found.add(value);
    for (const child of Object.values(value)) objectGraph(child, found);
  }
  return found;
}

describe("situated-expression development diagnostics", () => {
  it("does not read, clone, freeze, or allocate a replacement for disabled evidence", () => {
    const disabled = createExpressionDiagnosticState();
    const read = vi.fn(() => { throw new Error("disabled input must not be read"); });
    const hostileInput = new Proxy({}, { get: read, ownKeys: read }) as ExpressionDiagnosticInput;
    const producerRead = vi.fn(() => { throw new Error("disabled producer context must not be read"); });
    const contextAccessor = Object.defineProperty(acceptedEvidence(), "producerContext", {
      enumerable: true, get: producerRead,
    });
    const clone = vi.spyOn(globalThis, "structuredClone");
    const freeze = vi.spyOn(Object, "freeze");

    expect(appendExpressionDiagnostic(disabled, hostileInput)).toBe(disabled);
    expect(appendExpressionDiagnostic(disabled, contextAccessor)).toBe(disabled);
    expect(read).not.toHaveBeenCalled();
    expect(producerRead).not.toHaveBeenCalled();
    expect(clone).not.toHaveBeenCalled();
    expect(freeze).not.toHaveBeenCalled();
  });

  it("changes enable state without resetting evidence and rejects nonboolean configuration", () => {
    const disabled = createExpressionDiagnosticState();
    expect(setExpressionDiagnosticEnabled(disabled, false)).toBe(disabled);
    const enabled = setExpressionDiagnosticEnabled(disabled, true);
    expect(enabled.enabled).toBe(true);
    expect(enabled.records).toBe(disabled.records);
    const recorded = appendExpressionDiagnostic(enabled, acceptedEvidence());
    const paused = setExpressionDiagnosticEnabled(recorded, false);
    expect(paused.records).toBe(recorded.records);
    expect(paused.totalCount).toBe(1);
    expect(appendExpressionDiagnostic(paused, acceptedEvidence(29))).toBe(paused);
    expect(() => createExpressionDiagnosticState(1 as unknown as boolean)).toThrow(TypeError);
    expect(() => setExpressionDiagnosticEnabled(enabled, "true" as unknown as boolean)).toThrow(TypeError);
  });

  it("copies exact accepted evidence and realization without retaining or freezing source objects", () => {
    const source = structuredClone(acceptedEvidence());
    const before = JSON.stringify(source);
    const snapshot = appendExpressionDiagnostic(createExpressionDiagnosticState(true), source);
    const record = snapshot.records[0];
    if (record === undefined) throw new Error("expected retained diagnostic");
    expect(record).toEqual({
      ...source,
      sequence: 1,
      realization: projectSituatedExpression(source.event),
      producerContext: null,
    });
    expect(JSON.stringify(source)).toBe(before);
    const sourceObjects = objectGraph(source);
    for (const object of objectGraph(record)) {
      expect(sourceObjects.has(object)).toBe(false);
      expect(Object.isFrozen(object)).toBe(true);
    }
    for (const object of sourceObjects) expect(Object.isFrozen(object)).toBe(false);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.records)).toBe(true);
    Reflect.set(source.intent.position, "localX", 17);
    Reflect.set(source.admission!, "acceptedDistanceUnits", 1);
    expect(record.intent.position.localX).toBe(31_000);
    expect(record.admission).toEqual(acceptedEvidence().admission);
    expect(Reflect.set(record.intent.position, "localX", 18)).toBe(false);
    expect(Reflect.set(record, "weather", "storm")).toBe(false);
  });

  it("retains the actual suppression and prior cooldown state with no selected realization", () => {
    const input = acceptedEvidence();
    const admitted = reduceSituatedExpression(input.priorState, input.intent);
    if (admitted.state === null) throw new Error("expected prior admitted kernel state");
    const refusal = reduceSituatedExpression(admitted.state, input.intent);
    expect(refusal.reason).toBe("duplicate-trigger");
    const evidence: ExpressionDiagnosticInput = {
      ...input,
      priorState: admitted.state,
      reason: refusal.reason,
      event: null,
      admission: null,
      playerReception: null,
    };
    const record = appendExpressionDiagnostic(createExpressionDiagnosticState(true), evidence).records[0];
    expect(record).toEqual({ ...evidence, sequence: 1, realization: null, producerContext: null });
    expect(record?.priorState.recent).toEqual(admitted.state.recent);
    expect(record?.priorState.recent).not.toBe(admitted.state.recent);
  });

  it("separates supplied contextual wording from catalog realization and leaves absent context unknown", () => {
    const input = acceptedEvidence();
    const contextualText = "Authenticated contextual fixture, not a gameplay producer.";
    const recorded = appendExpressionDiagnostic(createExpressionDiagnosticState(true), {
      ...input, contextualText,
    }).records[0];
    expect(recorded?.contextualText).toBe(contextualText);
    expect(recorded?.realization).toEqual(projectSituatedExpression(input.event));
    const { contextualText: _context, ...withoutContext } = input;
    expect(appendExpressionDiagnostic(createExpressionDiagnosticState(true), withoutContext)
      .records[0]?.contextualText).toBeNull();
    expect(recorded?.producerContext).toBeNull();
  });

  it("bounds retention to 64 records while preserving exact sequence and eviction counts", () => {
    let state = createExpressionDiagnosticState(true);
    for (let index = 0; index < EXPRESSION_DIAGNOSTIC_CAPACITY + 3; index += 1) {
      state = appendExpressionDiagnostic(state, acceptedEvidence(28 + index));
    }
    expect(state.capacity).toBe(64);
    expect(state.records).toHaveLength(64);
    expect(state.totalCount).toBe(67);
    expect(state.evictedCount).toBe(3);
    expect(state.records.map(({ sequence }) => sequence)).toEqual(
      Array.from({ length: 64 }, (_, index) => index + 4),
    );
    expect(previewExpressionDiagnostic(state, 1)).toBeNull();
    expect(previewExpressionDiagnostic(state, 67)).not.toBeNull();
  });

  it("combines exact filters without changing global retention counters or the source snapshot", () => {
    const accepted = acceptedEvidence();
    const humanIntent: SituatedExpressionIntent = { ...accepted.intent, sourceActorId: "H-diagnostic-only" };
    const human = reduceSituatedExpression(accepted.priorState, humanIntent);
    if (human.event === null) throw new Error("expected tooling-only human kernel event");
    let state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), accepted);
    state = appendExpressionDiagnostic(state, {
      ...acceptedEvidence(29), reason: "sound-budget", event: null, admission: null, playerReception: null,
    });
    state = appendExpressionDiagnostic(state, {
      ...accepted,
      intent: humanIntent,
      event: human.event,
      admission: null,
      playerReception: createHeardVisibleSituatedExpressionReception(human.event, 28, 700_000, true),
    });
    const before = JSON.stringify(state);
    const filtered = selectExpressionDiagnostics(state, {
      sourceActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
      triggerEventId: accepted.intent.triggerEventId,
      meaning: accepted.intent.meaning,
      reason: "accepted",
    });
    expect(filtered.records.map(({ sequence }) => sequence)).toEqual([1]);
    expect(filtered.totalCount).toBe(3);
    expect(filtered.evictedCount).toBe(0);
    expect(filtered.records[0]).toBe(state.records[0]);
    expect(Object.isFrozen(filtered.records)).toBe(true);
    expect(selectExpressionDiagnostics(state, { reason: "sound-budget" }).records).toHaveLength(1);
    expect(selectExpressionDiagnostics(state, { sourceActorId: "H-diagnostic-only" }).records).toHaveLength(1);
    expect(selectExpressionDiagnostics(state, { meaning: "steady-after-stumble" }).records).toEqual([]);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("labels a successful kernel preview separately from the actual physical-recency refusal", () => {
    const source: ExpressionDiagnosticInput = {
      ...acceptedEvidence(), reason: "effort-recency", event: null, admission: null, playerReception: null,
    };
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), source);
    const before = JSON.stringify(state);
    const preview = previewExpressionDiagnostic(state, 1);
    expect(preview).toMatchObject({
      scope: "kernel-only-preview",
      actualRuntimeReason: "effort-recency",
      accepted: true,
      reason: "accepted",
    });
    expect(preview?.realization).not.toBeNull();
    expect(preview?.notEvaluated).toEqual([
      "domain-cause", "physical-recency", "sample/channel-capacity", "listener-hearing",
      "causal-admission", "presentation", "personality", "relationships", "full-emotional-state",
      "contextual-realization",
    ]);
    expect(JSON.stringify(state)).toBe(before);
    expect(previewExpressionDiagnostic(state, 1)).toEqual(preview);
    expect(previewExpressionDiagnostic(state, 0)).toBeNull();
    expect(previewExpressionDiagnostic(state, Number.NaN)).toBeNull();
  });

  it("supports pure authored-variant previews, including invalid semantic combinations, without mutation", () => {
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), acceptedEvidence());
    const overrides = { variantSeed: 43 };
    const before = JSON.stringify(state);
    const preview = previewExpressionDiagnostic(state, 1, overrides);
    expect(preview?.candidate.variantSeed).toBe(43);
    expect(preview?.accepted).toBe(true);
    for (const object of objectGraph(preview)) expect(Object.isFrozen(object)).toBe(true);
    expect(preview?.candidate).not.toBe(state.records[0]?.intent);
    expect(preview?.candidate.position).not.toBe(state.records[0]?.intent.position);
    expect(Object.isFrozen(overrides)).toBe(false);
    expect(previewExpressionDiagnostic(state, 1, { family: "cargo" })).toMatchObject({
      accepted: false, reason: "invalid-intent", realization: null,
    });
    expect(JSON.stringify(state)).toBe(before);
  });

  it.each([
    { sourceActorId: "other" },
    { triggerEventId: "other" },
    { position: { localX: 0 } },
    { version: 2 },
    { personality: "invented" },
    { relationship: "invented" },
  ])("rejects unsupported own override fields: %j", (unsupported) => {
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), acceptedEvidence());
    expect(previewExpressionDiagnostic(state, 1, unsupported as unknown as ExpressionPreviewOverrides)).toBeNull();
  });

  it("rejects inherited, array, symbol, hidden and accessor overrides without evaluating getters", () => {
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), acceptedEvidence());
    const inherited = Object.create({ sourceActorId: "forged", triggerEventId: "forged" }) as ExpressionPreviewOverrides;
    const getter = vi.fn(() => { throw new Error("preview must not evaluate an accessor"); });
    const accessor = Object.defineProperty({}, "variantSeed", { enumerable: true, get: getter });
    const hidden = Object.defineProperty({}, "variantSeed", { value: 43, enumerable: false });
    const symbol = { [Symbol("unsupported")]: 43 };
    const throwingProxy = new Proxy({}, {
      getPrototypeOf() { throw new Error("unsupported diagnostic proxy"); },
    });
    for (const unsupported of [inherited, [], symbol, hidden, accessor, throwingProxy, null, 1]) {
      expect(previewExpressionDiagnostic(state, 1, unsupported as ExpressionPreviewOverrides)).toBeNull();
    }
    expect(getter).not.toHaveBeenCalled();
    expect(state.records[0]?.intent.sourceActorId).toBe(LOCAL_PLAYER_LIVING_ACTOR_ID);
    const nullPrototype = Object.assign(Object.create(null), { variantSeed: 43 }) as ExpressionPreviewOverrides;
    expect(previewExpressionDiagnostic(state, 1, nullPrototype)?.candidate.variantSeed).toBe(43);
  });

  it("allows a transaction to restore its exact retained root without leaking a staged attempt", () => {
    const committed = appendExpressionDiagnostic(createExpressionDiagnosticState(true), acceptedEvidence());
    let current = appendExpressionDiagnostic(committed, acceptedEvidence(29));
    expect(current.totalCount).toBe(2);
    current = committed;
    expect(current).toBe(committed);
    expect(current.records).toHaveLength(1);
    expect(previewExpressionDiagnostic(current, 2)).toBeNull();
    const next = appendExpressionDiagnostic(current, acceptedEvidence(30));
    expect(next.records[1]?.sequence).toBe(2);
    expect(next.records[1]?.completedTick).toBe(30);
    expect(committed.totalCount).toBe(1);
  });

  it("leaves the retained root untouched when cloning fails or the sequence counter is exhausted", () => {
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), acceptedEvidence());
    const input = acceptedEvidence(29);
    const clone = vi.spyOn(globalThis, "structuredClone").mockImplementation(() => {
      throw new Error("diagnostic clone unavailable");
    });
    expect(appendExpressionDiagnostic(state, input)).toBe(state);
    expect(clone).toHaveBeenCalledTimes(1);
    expect(previewExpressionDiagnostic(state, 1)).toBeNull();
    expect(clone).toHaveBeenCalledTimes(2);
    clone.mockClear();
    const exhausted = Object.freeze({ ...state, totalCount: Number.MAX_SAFE_INTEGER });
    expect(appendExpressionDiagnostic(exhausted, input)).toBe(exhausted);
    expect(clone).not.toHaveBeenCalled();
  });
});

describe("captured traversal producer replay", () => {
  const ordinary = traversalInput();
  const serious = traversalInput({
    evaluation: {
      ...ordinary.evaluation,
      forecast: { ...ordinary.evaluation.forecast, hazardSeverity: 760_000, seriousHazard: true },
    },
  });
  const importantCargo = traversalInput({
    evaluation: {
      ...serious.evaluation,
      consequenceQuote: { ...serious.evaluation.consequenceQuote!, cargoShock: 520_000 },
    },
    cargo: {
      ...ordinary.cargo,
      selectedPayload: { kind: "promise", contractId: 44, resource: "medicine", quantity: 1, property: "fragile" },
      cargoShock: 520_000,
    },
  });
  const cargoLoss = traversalInput({
    incident: { ...ordinary.incident, kind: "fall", cue: "impact" },
    evaluation: {
      ...ordinary.evaluation,
      outcome: "fell",
      fell: true,
      stumbled: false,
      consequenceQuote: {
        ...ordinary.evaluation.consequenceQuote!, severity: "fall", motion: "impact", cargoShock: 880_000,
      },
    },
    cargo: {
      outcome: "separated",
      selectedPayload: { kind: "provision", lotId: "provision:7", provision: "trail-ration", quantity: 1 },
      separatedEntityIds: ["cargo:r-14:23:18"],
      cargoShock: 880_000,
    },
  });

  it.each([
    { name: "ordinary stumble", input: ordinary, meaning: "steady-after-stumble", tone: "restrained", volume: "murmur" },
    { name: "serious stumble", input: serious, meaning: "relief-after-near-fall", tone: "relieved", volume: "spoken" },
    { name: "important cargo before near-fall relief", input: importantCargo, meaning: "protect-important-cargo", tone: "strained", volume: "spoken" },
    { name: "separated cargo before other reactions", input: cargoLoss, meaning: "alarm-at-cargo-loss", tone: "alarmed", volume: "shout" },
  ])("replays the existing policy for $name", ({ input, meaning, tone, volume }) => {
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), traversalEvidence(input));
    const before = JSON.stringify(state);
    const replay = replayExpressionDiagnosticProducer(state, 1);
    expect(replay).toMatchObject({
      scope: "captured-producer-and-kernel-replay",
      producerKind: "player-traversal",
      actualRuntimeReason: "accepted",
      candidate: { meaning, tone, volume, triggerEventId: input.incident.id },
      accepted: true,
      reason: "accepted",
    });
    expect(replay?.candidate).toEqual(state.records[0]?.intent);
    expect(replay?.realization).toEqual(projectSituatedExpression(state.records[0]?.event));
    expect(JSON.stringify(state)).toBe(before);
  });

  it("detaches and freezes both captured input and replay output without freezing source facts", () => {
    const source = structuredClone(traversalEvidence(importantCargo));
    const beforeSource = JSON.stringify(source);
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), source);
    const record = state.records[0]!;
    const beforeState = JSON.stringify(state);
    const sourceObjects = objectGraph(source);
    for (const object of objectGraph(record)) {
      expect(sourceObjects.has(object)).toBe(false);
      expect(Object.isFrozen(object)).toBe(true);
    }
    for (const object of sourceObjects) expect(Object.isFrozen(object)).toBe(false);
    expect(record.producerContext).toEqual(source.producerContext);
    const replay = replayExpressionDiagnosticProducer(state, 1)!;
    expect(replay).not.toBeNull();
    const recordObjects = objectGraph(record);
    for (const object of objectGraph(replay)) {
      expect(recordObjects.has(object)).toBe(false);
      expect(sourceObjects.has(object)).toBe(false);
      expect(Object.isFrozen(object)).toBe(true);
    }
    expect(JSON.stringify(source)).toBe(beforeSource);
    Reflect.set(source.producerContext!.input.cargo, "cargoShock", 0);
    Reflect.set(source.producerContext!.input.incident, "id", "player:0:traversal:8");
    expect(record.producerContext?.input.cargo.cargoShock).toBe(520_000);
    expect(replay.candidate.triggerEventId).toBe("player:0:traversal:7");
    expect(Reflect.set(record.producerContext!.input.cargo, "cargoShock", 0)).toBe(false);
    expect(Reflect.set(replay.candidate.position, "localX", 0)).toBe(false);
    expect(JSON.stringify(state)).toBe(beforeState);
  });

  it.each(["footing-recency", "sound-budget"] as const)(
    "keeps actual %s refusal distinct from hypothetical producer/kernel acceptance",
    (reason) => {
      const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), traversalEvidence(ordinary, reason));
      const replay = replayExpressionDiagnosticProducer(state, 1);
      expect(replay).toMatchObject({ actualRuntimeReason: reason, accepted: true, reason: "accepted" });
      expect(replay?.realization).not.toBeNull();
      expect(replay?.notEvaluated).toEqual([
        "physical-transaction", "physical-recency", "sample/channel-capacity", "listener-hearing",
        "causal-admission", "presentation", "personality", "relationships", "full-emotional-state",
        "contextual-realization",
      ]);
      expect(state.records[0]).toMatchObject({ reason, event: null, admission: null, playerReception: null });
    },
  );

  it("uses captured prior kernel state rather than an empty state or the current world", () => {
    const evidence = traversalEvidence();
    const accepted = reduceSituatedExpression(evidence.priorState, evidence.intent);
    if (accepted.state === null) throw new Error("expected source-local prior kernel state");
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), {
      ...evidence, priorState: accepted.state, reason: "duplicate-trigger", event: null, playerReception: null,
    });
    expect(replayExpressionDiagnosticProducer(state, 1)).toMatchObject({
      actualRuntimeReason: "duplicate-trigger", accepted: false, reason: "duplicate-trigger", realization: null,
    });
  });

  it("leaves missing, null and unsupported producer contexts unavailable without cloning or invoking a producer", () => {
    let state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), acceptedEvidence());
    state = appendExpressionDiagnostic(state, { ...traversalEvidence(), producerContext: null });
    state = appendExpressionDiagnostic(state, {
      ...traversalEvidence(),
      producerContext: { kind: "unsupported-producer", input: ordinary } as unknown as ExpressionDiagnosticProducerContext,
    });
    expect(state.records[0]?.producerContext).toBeNull();
    expect(state.records[1]?.producerContext).toBeNull();
    const clone = vi.spyOn(globalThis, "structuredClone");
    const producer = vi.spyOn(traversalProducer, "playerTraversalExpressionIntent");
    for (const sequence of [0, 1, 2, 3, 4, Number.NaN]) {
      expect(replayExpressionDiagnosticProducer(state, sequence)).toBeNull();
    }
    expect(clone).not.toHaveBeenCalled();
    expect(producer).not.toHaveBeenCalled();
  });

  it.each([
    null,
    undefined,
    {},
    { ...ordinary, evaluation: null },
    { ...ordinary, cargo: null },
    { ...ordinary, evaluation: { ...ordinary.evaluation, usedTraversalOrdinal: 8 } },
    { ...ordinary, cargo: { ...ordinary.cargo, outcome: "rejected" } },
  ])("returns no replay for malformed or contradictory copied input: %j", (input) => {
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), {
      ...traversalEvidence(),
      producerContext: { kind: "player-traversal", input } as unknown as ExpressionDiagnosticProducerContext,
    });
    const before = JSON.stringify(state);
    expect(replayExpressionDiagnosticProducer(state, 1)).toBeNull();
    expect(JSON.stringify(state)).toBe(before);
  });

  it.each([
    { variantSeed: 482 },
    { triggerEventId: "player:0:traversal:8" },
    { tone: "alarmed" },
    { priority: 950_000 },
    { position: createWorldPosition(createRegionCoord(-14, 23), 4_001, 18_000) },
  ])("rejects disagreement between copied input and recorded intent: %j", (mismatch) => {
    const evidence = traversalEvidence();
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), {
      ...evidence, intent: { ...evidence.intent, ...mismatch } as SituatedExpressionIntent,
    });
    const before = JSON.stringify(state);
    expect(replayExpressionDiagnosticProducer(state, 1)).toBeNull();
    expect(JSON.stringify(state)).toBe(before);
  });

  it("isolates cloning and producer exceptions without changing retained evidence", () => {
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), traversalEvidence());
    const before = JSON.stringify(state);
    const clone = vi.spyOn(globalThis, "structuredClone").mockImplementation(() => {
      throw new Error("diagnostic copy failed");
    });
    expect(replayExpressionDiagnosticProducer(state, 1)).toBeNull();
    clone.mockRestore();
    vi.spyOn(traversalProducer, "playerTraversalExpressionIntent").mockImplementation(() => {
      throw new Error("diagnostic producer replay failed");
    });
    expect(replayExpressionDiagnosticProducer(state, 1)).toBeNull();
    expect(JSON.stringify(state)).toBe(before);
  });

  it("uses only the current retained buffer through eviction, reset and discarded staged roots", () => {
    const first = appendExpressionDiagnostic(createExpressionDiagnosticState(true), traversalEvidence());
    let full = first;
    for (let index = 1; index <= EXPRESSION_DIAGNOSTIC_CAPACITY; index += 1) {
      full = appendExpressionDiagnostic(full, traversalEvidence());
    }
    expect(full.records).toHaveLength(64);
    expect(full.totalCount).toBe(65);
    expect(full.evictedCount).toBe(1);
    expect(replayExpressionDiagnosticProducer(full, 1)).toBeNull();
    expect(replayExpressionDiagnosticProducer(full, 65)?.candidate).toEqual(first.records[0]?.intent);
    expect(replayExpressionDiagnosticProducer(first, 2)).toBeNull();
    expect(replayExpressionDiagnosticProducer(first, 1)).not.toBeNull();
    const reset = createExpressionDiagnosticState(true);
    expect(replayExpressionDiagnosticProducer(reset, 1)).toBeNull();
    const restarted = appendExpressionDiagnostic(reset, traversalEvidence(serious));
    expect(restarted.records[0]?.sequence).toBe(1);
    expect(replayExpressionDiagnosticProducer(restarted, 1)?.candidate.meaning).toBe("relief-after-near-fall");
    expect(replayExpressionDiagnosticProducer(first, 1)?.candidate.meaning).toBe("steady-after-stumble");
  });
});

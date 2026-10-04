import { afterEach, describe, expect, it, vi } from "vitest";

import { createRegionCoord } from "../sim/regions";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import { playerEffortExpressionIntent } from "./playerEffortExpression";
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
  selectExpressionDiagnostics,
  setExpressionDiagnosticEnabled,
  type ExpressionDiagnosticInput,
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
    const clone = vi.spyOn(globalThis, "structuredClone");
    const freeze = vi.spyOn(Object, "freeze");

    expect(appendExpressionDiagnostic(disabled, hostileInput)).toBe(disabled);
    expect(read).not.toHaveBeenCalled();
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
    expect(record).toEqual({ ...evidence, sequence: 1, realization: null });
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

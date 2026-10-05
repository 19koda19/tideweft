import { afterEach, describe, expect, it, vi } from "vitest";

import { createRegionCoord } from "../sim/regions";
import { playerEffortExpressionIntent } from "./playerEffortExpression";
import { createSituatedExpressionState, projectSituatedExpression, reduceSituatedExpression } from "./situatedExpression";
import { createPlayerExhaustionExpressionAdmissionRecord } from "./situatedExpressionAdmissionLedger";
import {
  advanceExpressionDiagnosticExposure, appendExpressionDiagnostic,
  auditExpressionDiagnosticKnowledge, createExpressionDiagnosticState,
  previewExpressionDiagnostic, replayExpressionDiagnosticProducer,
  reportExpressionDiagnosticRepetition, selectExpressionDiagnostics,
  setExpressionDiagnosticEnabled, type ExpressionDiagnosticInput,
} from "./situatedExpressionDiagnostics";
import { createWorldPosition } from "./worldPosition";

afterEach(() => vi.restoreAllMocks());

// Synthetic tooling decisions built from existing mapper/kernel constructors.
// Repeated logging and source/text variants are not authenticated world events,
// producer frequency, committed audio, caption placement or actual hearing.
function decision(tick = 28, sourceActorId = "player:local"): ExpressionDiagnosticInput {
  const mapped = playerEffortExpressionIntent({
    sourceActorId: "player:local",
    position: createWorldPosition(createRegionCoord(-4, 7), 31_000, 18_000),
    committedWorldTick: tick, admittedAtPlayerStepPhase: 6,
    acceptedDistanceUnits: 105, resolution: "dry-exhaustion-camp",
  });
  if (mapped === null) throw new Error("Synthetic repetition fixture needs an effort intent");
  const intent = { ...mapped, sourceActorId };
  const priorState = createSituatedExpressionState();
  const reduced = reduceSituatedExpression(priorState, intent);
  const admission = createPlayerExhaustionExpressionAdmissionRecord({
    sourceActorId: "player:local", triggerEventId: mapped.triggerEventId,
    sampleOrdinal: 0, admittedAtPlayerStepPhase: 6, committedWorldTick: tick,
    acceptedDistanceUnits: 105, resolution: "dry-exhaustion-camp",
  });
  if (reduced.event === null || admission === null) throw new Error("Synthetic repetition fixture needs selected evidence");
  return {
    completedTick: tick, playerStepPhase: 6, intent, priorState,
    reason: reduced.reason, event: reduced.event,
    admission: { ...admission, sourceActorId }, playerReception: null,
    sourceBelief: null, weather: "clear", contextualText: null,
  };
}

function objectGraph(value: unknown, found = new Set<object>()): Set<object> {
  if (value !== null && typeof value === "object" && !found.has(value)) {
    found.add(value);
    for (const child of Object.values(value)) objectGraph(child, found);
  }
  return found;
}

describe("captured expression repetition (synthetic tooling evidence)", () => {
  it("counts quiet accepted exposure even without a decision and keeps zero-denominator rates unavailable", () => {
    const empty = createExpressionDiagnosticState(true);
    expect(reportExpressionDiagnosticRepetition(empty)).toMatchObject({
      scope: "captured-expression-repetition", totalCount: 0, retainedCount: 0,
      acceptedFixedSteps: 0, acceptedSimulationMs: 0,
      admittedDecisions: 0, unadmittedDecisions: 0, saturated: false,
    });
    const spoken = appendExpressionDiagnostic(empty, decision());
    expect(reportExpressionDiagnosticRepetition(spoken).actors.entries[0]?.perAcceptedSimulationMinute).toBeNull();
    let quiet = spoken;
    for (let step = 0; step < 600; step += 1) quiet = advanceExpressionDiagnosticExposure(quiet, 100);
    const report = reportExpressionDiagnosticRepetition(quiet);
    expect(report).toMatchObject({ acceptedFixedSteps: 600, acceptedSimulationMs: 60_000, totalCount: 1 });
    expect(report.actors.entries[0]).toMatchObject({ count: 1, perAcceptedSimulationMinute: 1 });
    expect(quiet.records).toEqual(spoken.records);
    expect(empty.totalCount).toBe(0);
  });

  it("aggregates thousands of synthetic decisions before the 64-record ring evicts them", () => {
    let state = createExpressionDiagnosticState(true);
    const evidence = decision();
    for (let index = 0; index < 2_000; index += 1) state = appendExpressionDiagnostic(state, evidence);
    state = advanceExpressionDiagnosticExposure(state, 60_000);
    const report = reportExpressionDiagnosticRepetition(state);
    expect(state.records).toHaveLength(64);
    expect(report).toMatchObject({ totalCount: 2_000, evictedCount: 1_936, retainedCount: 64,
      admittedDecisions: 2_000, unadmittedDecisions: 0, unrealizedAdmittedDecisions: 0 });
    for (const group of [report.families, report.actors, report.lines, report.reasons]) {
      expect(group.entries).toHaveLength(1);
      expect(group.entries[0]).toMatchObject({ count: 2_000, perAcceptedSimulationMinute: 2_000 });
      expect(group.untrackedCount).toBe(0);
    }
    expect(report.notEvaluated).toEqual(expect.arrayContaining([
      "uncaptured-producers-and-physical-sounds", "unique-world-events",
      "committed-audio-and-caption-counts", "wall-time-and-civil-time-rates",
      "settlement-density", "profanity-classification", "failed-diagnostic-copies", "annoyance-and-hours-soak",
    ]));
  });

  it("requires both event and admission, without pretending the census reauthenticates either", () => {
    const admitted = decision();
    let state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), admitted);
    state = appendExpressionDiagnostic(state, { ...admitted, admission: null });
    state = appendExpressionDiagnostic(state, { ...admitted, event: null });
    state = appendExpressionDiagnostic(state, { ...admitted, event: null, admission: null, reason: "sound-budget" });
    const report = reportExpressionDiagnosticRepetition(state);
    expect(report).toMatchObject({ totalCount: 4, admittedDecisions: 1, unadmittedDecisions: 3 });
    expect(report.actors.entries[0]?.count).toBe(1);
    expect(report.families.entries[0]?.count).toBe(1);
    expect(report.lines.entries[0]?.count).toBe(1);
    expect(report.reasons.entries.map(({ key, count }) => [key, count])).toEqual([["accepted", 3], ["sound-budget", 1]]);
  });

  it("uses contextual wording including empty text, and explicitly counts unavailable realization", () => {
    const evidence = decision();
    const text = projectSituatedExpression(evidence.event)?.text;
    if (text === undefined || evidence.event === null) throw new Error("Fixture needs catalog text");
    let state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), evidence);
    state = appendExpressionDiagnostic(state, { ...evidence, contextualText: "Mara, the store is secured." });
    state = appendExpressionDiagnostic(state, { ...evidence, contextualText: "" });
    state = appendExpressionDiagnostic(state, { ...evidence,
      event: { ...evidence.event, realizationKey: "synthetic-unavailable-catalog-key" } });
    const report = reportExpressionDiagnosticRepetition(state);
    expect(report).toMatchObject({ admittedDecisions: 4, unrealizedAdmittedDecisions: 1 });
    expect(report.lines.entries.map(({ key }) => key)).toEqual(["", "Mara, the store is secured.", text].sort());
    expect(report.lines.entries.every(({ count }) => count === 1)).toBe(true);
  });

  it("retains first-seen bounded keys, counts tracked repeats and reports overflow decisions honestly", () => {
    let state = createExpressionDiagnosticState(true);
    for (let index = 0; index < 70; index += 1) state = appendExpressionDiagnostic(state, {
      ...decision(28, `H-synthetic-${index}`), contextualText: `synthetic line ${index}`,
    });
    state = appendExpressionDiagnostic(state, { ...decision(28, "H-synthetic-0"), contextualText: "synthetic line 0" });
    state = appendExpressionDiagnostic(state, { ...decision(28, "H-synthetic-69"), contextualText: "synthetic line 69" });
    const report = reportExpressionDiagnosticRepetition(state);
    for (const group of [report.actors, report.lines]) {
      expect(group.entries).toHaveLength(64);
      expect(group.entries[0]?.count).toBe(2);
      expect(group.untrackedCount).toBe(7);
      expect(group.entries.reduce((sum, entry) => sum + entry.count, group.untrackedCount)).toBe(72);
      expect(group.entries.some(({ key }) => key.endsWith("69"))).toBe(false);
    }
  });

  it("ranks by count then lexical key independent of insertion order", () => {
    const inputs = ["z", "a", "z", "m"].map((key) => ({
      ...decision(28, `H-synthetic-${key}`), contextualText: key,
    }));
    const collect = (values: typeof inputs) => values.reduce(appendExpressionDiagnostic, createExpressionDiagnosticState(true));
    const forward = reportExpressionDiagnosticRepetition(collect(inputs));
    const reverse = reportExpressionDiagnosticRepetition(collect([...inputs].reverse()));
    expect(forward.lines.entries.map(({ key, count }) => [key, count])).toEqual([["z", 2], ["a", 1], ["m", 1]]);
    expect(reverse).toEqual(forward);
  });

  it("does not read disabled input or advance invalid exposure; a fresh reset clears all census state", () => {
    const enabled = appendExpressionDiagnostic(createExpressionDiagnosticState(true), decision());
    const disabled = setExpressionDiagnosticEnabled(enabled, false);
    const hostile = new Proxy({} as ExpressionDiagnosticInput, { get: () => { throw new Error("disabled input read"); } });
    expect(appendExpressionDiagnostic(disabled, hostile)).toBe(disabled);
    expect(advanceExpressionDiagnosticExposure(disabled, 100)).toBe(disabled);
    for (const invalid of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(advanceExpressionDiagnosticExposure(enabled, invalid)).toBe(enabled);
    }
    expect(reportExpressionDiagnosticRepetition(createExpressionDiagnosticState(true))).toMatchObject({
      totalCount: 0, acceptedFixedSteps: 0, acceptedSimulationMs: 0, admittedDecisions: 0,
      actors: { entries: [], untrackedCount: 0 },
    });
  });

  it("keeps query denominators global and all reports detached/frozen; inspection cannot count decisions", () => {
    let state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), decision());
    state = advanceExpressionDiagnosticExposure(state, 60_000);
    const before = JSON.stringify(state);
    const filtered = selectExpressionDiagnostics(state, { sourceActorId: "missing" });
    const report = reportExpressionDiagnosticRepetition(state);
    const filteredReport = reportExpressionDiagnosticRepetition(filtered);
    expect(filteredReport).toMatchObject({ totalCount: 1, retainedCount: 0, acceptedSimulationMs: 60_000 });
    expect(filteredReport.actors).toEqual(report.actors);
    previewExpressionDiagnostic(state, 1);
    replayExpressionDiagnosticProducer(state, 1);
    auditExpressionDiagnosticKnowledge(state);
    expect(JSON.stringify(state)).toBe(before);
    const originals = objectGraph(state);
    for (const value of objectGraph(report)) {
      expect(Object.isFrozen(value)).toBe(true);
      expect(originals.has(value)).toBe(false);
    }
  });

  it("leaves clone failure wholly untouched and exposes arithmetic saturation without finite rates", () => {
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), decision());
    vi.spyOn(globalThis, "structuredClone").mockImplementationOnce(() => { throw new Error("synthetic clone failure"); });
    expect(appendExpressionDiagnostic(state, decision())).toBe(state);
    const nearLimit = advanceExpressionDiagnosticExposure(state, Number.MAX_SAFE_INTEGER);
    const saturated = advanceExpressionDiagnosticExposure(nearLimit, 1);
    expect(reportExpressionDiagnosticRepetition(saturated)).toMatchObject({
      saturated: true, acceptedFixedSteps: 1, acceptedSimulationMs: Number.MAX_SAFE_INTEGER,
    });
    expect(reportExpressionDiagnosticRepetition(saturated).actors.entries[0]?.perAcceptedSimulationMinute).toBeNull();
    const exhausted = { ...state, totalCount: Number.MAX_SAFE_INTEGER };
    expect(appendExpressionDiagnostic(exhausted, decision())).toBe(exhausted);
    expect(reportExpressionDiagnosticRepetition(exhausted).saturated).toBe(true);
    expect(reportExpressionDiagnosticRepetition(exhausted).actors.entries[0]?.perAcceptedSimulationMinute).toBeNull();
  });
});

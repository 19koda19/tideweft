import { afterEach, describe, expect, it, vi } from "vitest";

import { createActorObservation, stepActorPerception } from "../sim/actorPerception";
import { createWorld } from "../sim/public";
import type { ResidentState } from "../sim/types";
import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { createDogActorState, replaceDogActorPerception, setDogActorIntent } from "./dogActor";
import * as dogSignalProducer from "./dogSignalExpression";
import type { GuardianDogShelterWhineExpressionInput } from "./dogSignalExpression";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import { HUMAN_PERCEPTION_MAX_RESIDENTS, HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES,
  type HumanSupplementalListeningReceipt } from "./humanPerception";
import { evaluateAudibleContact, type AudibleContactInput } from "./perception";
import { playerEffortExpressionIntent } from "./playerEffortExpression";
import { SERIOUS_FALL_HAZARD } from "./fallRisk";
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
  auditExpressionDiagnosticKnowledge,
  captureExpressionDiagnosticHumanAudience,
  createExpressionDiagnosticState,
  finalizeExpressionDiagnosticHumanAudience,
  previewExpressionDiagnostic,
  previewExpressionDiagnosticListening,
  previewExpressionDiagnosticProducer,
  replayExpressionDiagnosticProducer,
  selectExpressionDiagnostics,
  setExpressionDiagnosticEnabled,
  type ExpressionDiagnosticInput,
  type ExpressionDiagnosticListeningContext,
  type ExpressionDiagnosticProducerContext,
  type ExpressionDiagnosticReason,
  type ExpressionPreviewOverrides,
  type ExpressionListeningPreviewOverrides,
} from "./situatedExpressionDiagnostics";
import { situatedExpressionSemanticFactForEvent } from "./situatedExpressionAcoustics";
import {
  createHeardVisibleSituatedExpressionReception,
  createSelfSituatedExpressionReception,
} from "./situatedExpressionReception";
import {
  createSettlementWorkingAnimalState,
  resolveSettlementWorkingAnimalActivity,
  stageSettlementWorkingAnimalActivity,
} from "./settlementWorkingAnimals";
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

// The same dog/work constructors as dogSignalExpression.test.ts commit the
// condition-owned intent and work deference. This is mapper evidence, not an
// ordinary weather encounter, kennel/custody proof or audible observation.
function shelterWhineInput(): GuardianDogShelterWhineExpressionInput {
  const region = createRegionCoord(0, 0);
  const position = createWorldPosition(region, 24_000, 24_000);
  const originalDog = createDogActorState({
    seed: seedFromText("guardian dog signal expression test"),
    originRegion: region, originNamespace: "regional", habitatClass: "settlement-edge",
    habitatKey: "guardian-signal-test-worksite", populationKey: "guardian-signal-test-dogs",
    populationOrdinal: 0, position: createWorldPosition(region, 23_000, 24_000), heading: 0, tick: 0,
  });
  const perception = stepActorPerception(originalDog.perception, { tick: 1, observations: [] });
  if (perception === null) throw new Error("whine fixture requires a current perception tick");
  const dog = setDogActorIntent(replaceDogActorPerception(originalDog, perception), {
    kind: "seek-shelter", cause: { kind: "condition", referenceId: "condition:weather-exposure" },
    enteredAtTick: 1, nextThinkTick: 3,
  });
  const initial = createSettlementWorkingAnimalState({
    settlementId: 11,
    assignments: [{
      assignmentOrdinal: 0, workerActorId: dog.identity.stableId, workerSpecies: "domestic-dog",
      handlerActorId: "H-dog-warning-test-handler",
      workerCustodyRelationshipId: "DOMESTIC-REL-0000000000000011",
      protectedCustodyRelationshipId: "DOMESTIC-REL-0000000000000012",
      protectedGroupId: "GOAT-HERD-dog-warning-test", role: "guardian",
      worksiteId: "DOMESTIC-PEN-dog-warning-test", dutyArea: { center: position, radiusUnits: 6_000 },
      createdAtTick: 0,
    }],
  });
  const staged = stageSettlementWorkingAnimalActivity(initial, {
    assignmentId: initial.assignments[0]!.assignmentId, tick: 1, perception,
    welfare: { injuryPressure: 0, coldPressure: 0, heatPressure: 0, exhaustionPressure: 0, hungerPressure: 0, thirstPressure: 0 },
    accessibility: { watch: true, investigate: true, return: true },
    actorDisposition: { kind: "defer-to-actor", referenceId: "actor-intent:seek-shelter" },
    workerInsideDutyArea: true,
  });
  if (staged === null || staged.transaction === null) throw new Error("whine fixture requires staged work deference");
  const resolved = resolveSettlementWorkingAnimalActivity(staged.state, staged.transaction);
  if (resolved === null) throw new Error("whine fixture requires committed work deference");
  return { dog, workingAnimals: resolved.state, completedTick: 1, shelterIntentScore: 650_000 };
}

function shelterWhineEvidence(
  input = shelterWhineInput(),
  reason: ExpressionDiagnosticReason = "accepted",
): ExpressionDiagnosticInput {
  const intent = dogSignalProducer.guardianDogShelterWhineExpressionIntent(input);
  if (intent === null) throw new Error("whine fixture requires a valid existing producer intent");
  const priorState = createSituatedExpressionState();
  const reduction = reduceSituatedExpression(priorState, intent);
  if (reduction.event === null) throw new Error("whine fixture requires a selected kernel event");
  return {
    completedTick: 1, playerStepPhase: 0, intent, priorState, reason,
    event: reason === "accepted" ? reduction.event : null,
    admission: null, playerReception: null, sourceBelief: null, weather: "rain", contextualText: null,
    producerContext: { kind: "guardian-dog-shelter-whine", input },
  };
}

// Diagnostic-contract inputs only: computing this contact and constructing a
// receipt does not prove runtime hearing, visibility or causal admission.
function listeningCapture(input: AudibleContactInput = {
  listener: { x: -2, y: 4 },
  source: { x: 4, y: 4 },
  baseRange: 20,
  ambientNoise: 0.2,
  sourceLoudness: 0.9,
  wind: { x: 0, y: -0.6 },
}): ExpressionDiagnosticListeningContext {
  return { input, contact: evaluateAudibleContact(input) };
}

function listeningEvidence(
  listeningContext = listeningCapture(),
): ExpressionDiagnosticInput {
  const evidence = shelterWhineEvidence();
  if (evidence.event === null) throw new Error("listening fixture requires a selected kernel event");
  const playerReception = listeningContext.contact === null
    ? null
    : createHeardVisibleSituatedExpressionReception(
        evidence.event, evidence.completedTick,
        Math.max(1, Math.round(listeningContext.contact.certainty * 1_000_000)), true,
      );
  if (listeningContext.contact !== null && playerReception === null) {
    throw new Error("listening fixture requires a valid diagnostic receipt");
  }
  return { ...evidence, listeningContext, playerReception };
}

function objectGraph(value: unknown, found = new Set<object>()): Set<object> {
  if (value !== null && typeof value === "object" && !found.has(value)) {
    found.add(value);
    for (const child of Object.values(value)) objectGraph(child, found);
  }
  return found;
}

// Synthetic diagnostic joins only. A validated-shaped verdict here is not an
// event-time source authentication; the source-owner and runtime tests prove that.
function syntheticKnowledgeEvidence(): ExpressionDiagnosticInput {
  const original = acceptedEvidence();
  const intent: SituatedExpressionIntent = { ...original.intent,
    sourceActorId: "RES-synthetic-speaker", meaning: "keeper-secure-store-response",
    family: "work", tone: "restrained", volume: "spoken",
    knowledgeBasis: "self-committed-store-closure", durationSteps: 12 };
  const reduction = reduceSituatedExpression(original.priorState, intent);
  const event = reduction.event;
  if (event === null) throw new Error("synthetic audit fixture needs a canonical event");
  return { ...original, intent, event, admission: null,
    playerReception: createHeardVisibleSituatedExpressionReception(event, original.completedTick, 700_000, true),
    knowledgeSource: { eventId: event.eventId, sourceActorId: event.sourceActorId,
      triggerEventId: event.triggerEventId, checkedAtTick: original.completedTick,
      owner: "settlementKeeperStoreResponseExpression", validated: true } };
}

function syntheticKnowledgeAudience(evidence = syntheticKnowledgeEvidence()) {
  const resident = createWorld("diagnostic joins, not ordinary hearing", "standard").residents[0];
  if (resident === undefined || evidence.event === null) throw new Error("audit fixture needs a resident and event");
  const observedAtTick = resident.perception.tick + 1;
  const observation = createActorObservation({
    id: "synthetic-audit-hearing", observerId: resident.identity.stableId, observedAtTick,
    channel: "hearing", perceivedClass: "store-secured-report", subjectId: null,
    area: { center: evidence.event.position, radiusUnits: 2_500 }, confidence: 700_000,
    salience: 700_000, identification: "anonymous", interrupt: "none",
  });
  if (observation === null) throw new Error("audit fixture needs a canonical hearing observation");
  const receipt: HumanSupplementalListeningReceipt = {
    expressionEventId: evidence.event.eventId, sourceActorId: evidence.event.sourceActorId,
    sampleId: "synthetic-audit-sample", residentId: resident.id,
    observerId: resident.identity.stableId, observedAtTick, outcome: "heard",
    contact: { certainty: 0.7, bearing: { centerRadians: 0, uncertaintyRadians: 0.4 },
      distanceBand: { minimum: 1, maximum: 3 } },
    semanticFact: situatedExpressionSemanticFactForEvent(evidence.event), observation,
  };
  return { resident, receipt, evidence, observedAtTick };
}

describe("captured factual diagnostic audit", () => {
  it("keeps uncaptured source/listeners explicit and does not infer understanding from prose or knowledgeBasis", () => {
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), acceptedEvidence());
    const audit = auditExpressionDiagnosticKnowledge(state);
    expect(audit.records[0]).toMatchObject({ sourceStatus: "uncaptured", sourceCheck: null,
      playerReceiptStatus: "matching-retained-receipt", humanListeners: null, issues: [] });
    expect(audit.notEvaluated).toEqual(expect.arrayContaining([
      "player-comprehension", "listeners-outside-selected-human-frame", "portable-source-attestation",
    ]));
    expect(auditExpressionDiagnosticKnowledge(createExpressionDiagnosticState()).records).toEqual([]);
  });

  it("reports mismatched/rejected captured verdicts and player receipts without changing retained evidence", () => {
    const evidence = syntheticKnowledgeEvidence();
    let state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), evidence);
    state = appendExpressionDiagnostic(state, { ...evidence,
      knowledgeSource: { ...evidence.knowledgeSource!, validated: false } });
    state = appendExpressionDiagnostic(state, { ...evidence,
      knowledgeSource: { ...evidence.knowledgeSource!, triggerEventId: "wrong-trigger" },
      playerReception: { ...evidence.playerReception!, eventId: "se-wrong-event" } });
    const before = JSON.stringify(state);
    const report = auditExpressionDiagnosticKnowledge(state, { meaning: "keeper-secure-store-response" });
    expect(report.records.map(({ sourceStatus }) => sourceStatus)).toEqual(["validated", "rejected", "rejected"]);
    expect(report.records[2]?.issues).toEqual(["source-validation-rejected", "player-receipt-mismatch"]);
    expect(report.totalCount).toBe(3);
    expect(JSON.stringify(state)).toBe(before);
    expect(auditExpressionDiagnosticKnowledge(state, { sourceActorId: "missing" }).records).toEqual([]);
    const stateObjects = objectGraph(state);
    for (const object of objectGraph(report)) {
      expect(Object.isFrozen(object)).toBe(true);
      expect(stateObjects.has(object)).toBe(false);
    }
  });

  it("captures only an explicit retained event join and detaches every audience object without changing counters", () => {
    const { evidence, receipt } = syntheticKnowledgeAudience();
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), evidence);
    const before = JSON.stringify([state, receipt]);
    const captured = captureExpressionDiagnosticHumanAudience(state, [receipt]);
    expect(captured.records[0]?.humanListeners).toEqual([{ receipt, retainedBelief: null }]);
    expect([captured.totalCount, captured.evictedCount]).toEqual([1, 0]);
    expect(JSON.stringify([state, receipt])).toBe(before);
    expect(state.records[0]?.humanListeners).toBeNull();
    const originalObjects = objectGraph(receipt);
    for (const object of objectGraph(captured.records[0]?.humanListeners)) {
      expect(Object.isFrozen(object)).toBe(true);
      expect(originalObjects.has(object)).toBe(false);
    }
    expect(captureExpressionDiagnosticHumanAudience(state, [{ ...receipt, expressionEventId: "se-unknown" }])
      .records[0]).toBe(state.records[0]);
    expect(captureExpressionDiagnosticHumanAudience(createExpressionDiagnosticState(true), [receipt]).records).toEqual([]);
    const unsupported = appendExpressionDiagnostic(createExpressionDiagnosticState(true), acceptedEvidence());
    expect(captureExpressionDiagnosticHumanAudience(unsupported, [{ ...receipt,
      expressionEventId: unsupported.records[0]!.event!.eventId }]).records[0]?.humanListeners).toBeNull();
  });

  it("leaves disabled, excessive, evicted and uncopyable audience input untouched", () => {
    const { evidence, receipt } = syntheticKnowledgeAudience();
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), evidence);
    const disabled = setExpressionDiagnosticEnabled(state, false);
    const hostile = new Proxy([], { get: () => { throw new Error("disabled receipt input must not be read"); } });
    expect(captureExpressionDiagnosticHumanAudience(disabled, hostile)).toBe(disabled);
    const tooMany = Array.from({ length: HUMAN_PERCEPTION_MAX_RESIDENTS * HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES + 1 }, () => receipt);
    expect(captureExpressionDiagnosticHumanAudience(state, tooMany)).toBe(state);
    const sourceOverflow = Array.from({ length: HUMAN_PERCEPTION_MAX_RESIDENTS + 1 }, () => receipt);
    expect(captureExpressionDiagnosticHumanAudience(state, sourceOverflow).records[0]).toBe(state.records[0]);
    const uncopyable = Object.defineProperty({ ...receipt }, "observation", { enumerable: true,
      get: () => { throw new Error("diagnostic copy cannot veto world"); } });
    expect(captureExpressionDiagnosticHumanAudience(state, [uncopyable])).toBe(state);
    let full = state;
    for (let index = 0; index < EXPRESSION_DIAGNOSTIC_CAPACITY; index += 1) {
      full = appendExpressionDiagnostic(full, acceptedEvidence(30 + index));
    }
    expect(captureExpressionDiagnosticHumanAudience(full, [receipt]).records.every(({ humanListeners }) => humanListeners === null)).toBe(true);
    expect(auditExpressionDiagnosticKnowledge(full).evictedCount).toBe(1);
  });

  it("distinguishes actual receipt from retained belief and finalizes only the exact completed tick/listener/observation", () => {
    const { evidence, receipt, resident, observedAtTick } = syntheticKnowledgeAudience();
    const captured = captureExpressionDiagnosticHumanAudience(
      appendExpressionDiagnostic(createExpressionDiagnosticState(true), evidence), [receipt]);
    const perception = stepActorPerception(resident.perception, { tick: observedAtTick, observations: [receipt.observation!] });
    if (perception === null) throw new Error("audit fixture needs accepted cognition");
    const retained: ResidentState = { ...resident, perception };
    expect(finalizeExpressionDiagnosticHumanAudience(captured, observedAtTick - 1, [retained])
      .records[0]?.humanListeners?.[0]?.retainedBelief).toBeNull();
    const final = finalizeExpressionDiagnosticHumanAudience(captured, observedAtTick, [retained]);
    expect(final.records[0]?.humanListeners?.[0]?.retainedBelief).toBe(true);
    for (const changed of [resident, { ...retained, id: retained.id + 100 },
      { ...retained, identity: { ...retained.identity, stableId: "RES-wrong-listener" } },
      { ...retained, perception: { ...perception, beliefs: [] } },
      { ...retained, perception: { ...perception, beliefs: perception.beliefs.map((belief) => ({ ...belief, sourceObservationId: "another-observation" })) } }]) {
      expect(finalizeExpressionDiagnosticHumanAudience(captured, observedAtTick, [changed])
        .records[0]?.humanListeners?.[0]?.retainedBelief).toBe(false);
    }
    expect(auditExpressionDiagnosticKnowledge(final).records[0]?.issues).toEqual([]);
    expect(auditExpressionDiagnosticKnowledge(captured).records[0]?.humanListeners?.[0]?.retainedBelief).toBeNull();
    expect(finalizeExpressionDiagnosticHumanAudience(final, observedAtTick + 1, []).records[0]?.humanListeners)
      .toEqual(final.records[0]?.humanListeners);
  });

  it("flags unsupported heard understanding while not-heard/source-excluded/unavailable never become retained knowledge", () => {
    const { evidence, receipt, observedAtTick, resident } = syntheticKnowledgeAudience();
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), evidence);
    const heardWithoutMeaning = { ...receipt, semanticFact: null };
    const captured = captureExpressionDiagnosticHumanAudience(state, [heardWithoutMeaning]);
    expect(auditExpressionDiagnosticKnowledge(captured).records[0]?.issues)
      .toContain(`${receipt.observerId}:unsupported-understanding`);
    for (const outcome of ["not-heard", "unavailable", "source-excluded"] as const) {
      const noObservation = { ...receipt, outcome, contact: null, observation: null,
        observerId: outcome === "source-excluded" ? receipt.sourceActorId : receipt.observerId };
      const final = finalizeExpressionDiagnosticHumanAudience(captureExpressionDiagnosticHumanAudience(state, [noObservation]), observedAtTick, [resident]);
      expect(final.records[0]?.humanListeners?.[0]?.retainedBelief).toBe(false);
      expect(auditExpressionDiagnosticKnowledge(final).records[0]?.issues).toEqual([]);
    }
  });
});

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
      listeningContext: null,
      knowledgeSource: null,
      humanListeners: null,
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
    expect(record).toEqual({
      ...evidence, sequence: 1, realization: null, producerContext: null, listeningContext: null,
      knowledgeSource: null, humanListeners: null,
    });
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
    const sourceContext = source.producerContext;
    const recordContext = record.producerContext;
    if (sourceContext?.kind !== "player-traversal" || recordContext?.kind !== "player-traversal") {
      throw new Error("expected copied traversal context");
    }
    const replay = replayExpressionDiagnosticProducer(state, 1)!;
    expect(replay).not.toBeNull();
    const recordObjects = objectGraph(record);
    for (const object of objectGraph(replay)) {
      expect(recordObjects.has(object)).toBe(false);
      expect(sourceObjects.has(object)).toBe(false);
      expect(Object.isFrozen(object)).toBe(true);
    }
    expect(JSON.stringify(source)).toBe(beforeSource);
    Reflect.set(sourceContext.input.cargo, "cargoShock", 0);
    Reflect.set(sourceContext.input.incident, "id", "player:0:traversal:8");
    expect(recordContext.input.cargo.cargoShock).toBe(520_000);
    expect(replay.candidate.triggerEventId).toBe("player:0:traversal:7");
    expect(Reflect.set(recordContext.input.cargo, "cargoShock", 0)).toBe(false);
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

describe("hypothetical captured traversal producer preview", () => {
  const ordinary = traversalInput();
  const importantCargo = traversalInput({
    cargo: {
      ...ordinary.cargo,
      selectedPayload: { kind: "promise", contractId: 44, resource: "medicine", quantity: 1, property: "fragile" },
    },
  });
  type Selection = Parameters<typeof previewExpressionDiagnosticProducer>[2];
  const selection = (value: unknown) => value as Selection;

  it("returns the exact kind-only baseline, detached and frozen, without changing evidence or counters", () => {
    const source = structuredClone(traversalEvidence());
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), source);
    const before = JSON.stringify({ source, state });
    const preview = previewExpressionDiagnosticProducer(state, 1, { kind: "player-traversal" });
    expect(preview).toMatchObject({
      scope: "hypothetical-producer-and-kernel-preview", producerKind: "player-traversal",
      actualRuntimeReason: "accepted", hypotheticalInput: ordinary,
      candidate: state.records[0]!.intent, accepted: true, reason: "accepted",
      realization: projectSituatedExpression(state.records[0]!.event!),
      notEvaluated: expect.arrayContaining(["physical-forecast-and-transaction", "physical-recency", "listener-hearing", "causal-admission", "audio/presentation"]),
    });
    expect(previewExpressionDiagnosticProducer(state, 1, { kind: "player-traversal" })).toEqual(preview);
    const originals = new Set([...objectGraph(source), ...objectGraph(state)]);
    for (const object of objectGraph(preview)) {
      expect(originals.has(object)).toBe(false);
      expect(Object.isFrozen(object)).toBe(true);
    }
    expect(JSON.stringify({ source, state })).toBe(before);
  });

  it.each([
    [0, "steady-after-stumble"],
    [SERIOUS_FALL_HAZARD - 1, "steady-after-stumble"],
    [SERIOUS_FALL_HAZARD, "relief-after-near-fall"],
    [1_000_000, "relief-after-near-fall"],
  ] as const)("maps hypothetical severity %i through the existing serious threshold", (hazardSeverity, meaning) => {
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), traversalEvidence());
    const preview = previewExpressionDiagnosticProducer(state, 1, { kind: "player-traversal", hazardSeverity });
    expect(preview?.candidate).toMatchObject({
      meaning, sourceActorId: ordinary.sourceActorId, triggerEventId: ordinary.incident.id,
      position: ordinary.position, variantSeed: ordinary.incident.variantSeed,
    });
    expect(preview?.hypotheticalInput).toEqual({
      ...ordinary,
      evaluation: { ...ordinary.evaluation, forecast: {
        ...ordinary.evaluation.forecast, hazardSeverity, seriousHazard: hazardSeverity >= SERIOUS_FALL_HAZARD,
      } },
    });
    expect(state.records[0]!.producerContext?.input).toEqual(ordinary);
  });

  it("clears the captured serious flag when a lower hypothetical severity is selected", () => {
    const serious = traversalInput({ evaluation: {
      ...ordinary.evaluation,
      forecast: { ...ordinary.evaluation.forecast, hazardSeverity: 760_000, seriousHazard: true },
    } });
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), traversalEvidence(serious));
    expect(previewExpressionDiagnosticProducer(state, 1, {
      kind: "player-traversal", hazardSeverity: SERIOUS_FALL_HAZARD - 1,
    })).toMatchObject({
      candidate: { meaning: "steady-after-stumble" },
      hypotheticalInput: { evaluation: { forecast: { seriousHazard: false } } },
    });
    expect(state.records[0]!.producerContext?.input).toEqual(serious);
  });

  it.each([[259_999, "relief-after-near-fall"], [260_000, "protect-important-cargo"]] as const)(
    "retains existing cargo precedence at hypothetical shock %i", (cargoShock, meaning) => {
      const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), traversalEvidence(importantCargo));
      const preview = previewExpressionDiagnosticProducer(state, 1, {
        kind: "player-traversal", hazardSeverity: SERIOUS_FALL_HAZARD, cargoShock,
      });
      expect(preview?.candidate.meaning).toBe(meaning);
      expect(preview?.hypotheticalInput.cargo).toEqual({ ...importantCargo.cargo, cargoShock });
      expect(preview?.hypotheticalInput.evaluation.consequenceQuote).toEqual(ordinary.evaluation.consequenceQuote);
      expect(preview?.hypotheticalInput.incident).toEqual(ordinary.incident);
      expect(preview?.hypotheticalInput.evaluation.usedTraversalOrdinal).toBe(ordinary.evaluation.usedTraversalOrdinal);
      expect(state.records[0]!.producerContext?.input).toEqual(importantCargo);
    },
  );

  it("keeps actual separated cargo ahead of hypothetical severity and shock without inventing custody", () => {
    const separated = traversalInput({ cargo: {
      ...importantCargo.cargo, outcome: "separated", separatedEntityIds: ["cargo:r-14:23:18"],
    } });
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), traversalEvidence(separated));
    const preview = previewExpressionDiagnosticProducer(state, 1, {
      kind: "player-traversal", hazardSeverity: 0, cargoShock: 0,
    });
    expect(preview?.candidate.meaning).toBe("alarm-at-cargo-loss");
    expect(preview?.hypotheticalInput.cargo).toEqual({ ...separated.cargo, cargoShock: 0 });
    expect(preview?.hypotheticalInput.incident).toEqual(separated.incident);
    expect(state.records[0]!.producerContext?.input).toEqual(separated);
  });

  it("preserves actual refusal and the captured prior kernel rather than admitting a preview", () => {
    const refused = appendExpressionDiagnostic(createExpressionDiagnosticState(true), traversalEvidence(ordinary, "sound-budget"));
    expect(previewExpressionDiagnosticProducer(refused, 1, { kind: "player-traversal", hazardSeverity: 500_000 }))
      .toMatchObject({ actualRuntimeReason: "sound-budget", accepted: true, reason: "accepted" });
    const evidence = traversalEvidence();
    const accepted = reduceSituatedExpression(evidence.priorState, evidence.intent);
    if (accepted.state === null) throw new Error("expected captured accepted kernel");
    const duplicate = appendExpressionDiagnostic(createExpressionDiagnosticState(true), {
      ...evidence, priorState: accepted.state, reason: "duplicate-trigger", event: null, playerReception: null,
    });
    expect(previewExpressionDiagnosticProducer(duplicate, 1, { kind: "player-traversal", hazardSeverity: 500_000 }))
      .toMatchObject({ actualRuntimeReason: "duplicate-trigger", accepted: false, reason: "duplicate-trigger", realization: null });
    expect(refused.records[0]).toMatchObject({ event: null, admission: null, playerReception: null });
  });

  it("rejects unsupported selection shapes and protected fields without evaluating accessors", () => {
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), traversalEvidence());
    const getter = vi.fn(() => { throw new Error("selection accessor must not run"); });
    const malformed: unknown[] = [
      null, undefined, [], {}, { kind: "guardian-dog-shelter-whine" },
      Object.create({ kind: "player-traversal" }),
      Object.defineProperty({}, "kind", { enumerable: true, get: getter }),
      Object.defineProperty({ kind: "player-traversal" }, "hazardSeverity", { enumerable: true, get: getter }),
      Object.defineProperty({ kind: "player-traversal" }, "cargoShock", { value: 0, enumerable: false }),
      { kind: "player-traversal", [Symbol("hidden")]: 1 },
      new Proxy({}, { getPrototypeOf() { throw new Error("unsupported proxy"); } }),
      ...["sourceActorId", "position", "incident", "evaluation", "cargo", "priorState", "shelterIntentScore"]
        .map((key) => ({ kind: "player-traversal", [key]: 0 })),
    ];
    const before = JSON.stringify(state);
    for (const value of malformed) expect(previewExpressionDiagnosticProducer(state, 1, selection(value))).toBeNull();
    expect(getter).not.toHaveBeenCalled();
    expect(JSON.stringify(state)).toBe(before);
  });

  it("rejects noninteger, nonfinite and out-of-range controls while accepting own null-prototype data", () => {
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), traversalEvidence());
    for (const key of ["hazardSeverity", "cargoShock"]) {
      for (const value of [-1, 1_000_001, 0.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, undefined, null, "0", true]) {
        expect(previewExpressionDiagnosticProducer(state, 1, selection({ kind: "player-traversal", [key]: value }))).toBeNull();
      }
    }
    const ownData = Object.assign(Object.create(null), { kind: "player-traversal", hazardSeverity: 0, cargoShock: 1_000_000 });
    expect(previewExpressionDiagnosticProducer(state, 1, selection(ownData))?.hypotheticalInput.cargo.cargoShock).toBe(1_000_000);
  });

  it("leaves uncaptured and guardian contexts unavailable, and validates the baseline before overrides", () => {
    let state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), acceptedEvidence());
    state = appendExpressionDiagnostic(state, shelterWhineEvidence());
    const evidence = traversalEvidence();
    state = appendExpressionDiagnostic(state, {
      ...evidence, intent: { ...evidence.intent, meaning: "relief-after-near-fall", tone: "relieved" },
    });
    const before = JSON.stringify(state);
    for (const sequence of [0, 1, 2, 3, 4, Number.NaN]) {
      expect(previewExpressionDiagnosticProducer(state, sequence, { kind: "player-traversal", hazardSeverity: 500_000 })).toBeNull();
    }
    expect(JSON.stringify(state)).toBe(before);
  });

  it("isolates copying, baseline and hypothetical mapper failure without changing retained evidence", () => {
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), traversalEvidence());
    const before = JSON.stringify(state);
    const clone = vi.spyOn(globalThis, "structuredClone").mockImplementation(() => { throw new Error("preview copy failed"); });
    expect(previewExpressionDiagnosticProducer(state, 1, { kind: "player-traversal" })).toBeNull();
    clone.mockRestore();
    const original = traversalProducer.playerTraversalExpressionIntent;
    const mapper = vi.spyOn(traversalProducer, "playerTraversalExpressionIntent");
    mapper.mockImplementation(() => { throw new Error("baseline mapper failed"); });
    expect(previewExpressionDiagnosticProducer(state, 1, { kind: "player-traversal" })).toBeNull();
    mapper.mockImplementation((input) => input.evaluation.forecast.hazardSeverity === 500_000 ? null : original(input));
    expect(previewExpressionDiagnosticProducer(state, 1, { kind: "player-traversal", hazardSeverity: 500_000 })).toBeNull();
    mapper.mockImplementation((input) => {
      if (input.evaluation.forecast.hazardSeverity === 500_000) throw new Error("hypothetical mapper failed");
      return original(input);
    });
    expect(previewExpressionDiagnosticProducer(state, 1, { kind: "player-traversal", hazardSeverity: 500_000 })).toBeNull();
    expect(JSON.stringify(state)).toBe(before);
  });

  it("uses only retained records through eviction, reset and discarded provisional roots", () => {
    const first = appendExpressionDiagnostic(createExpressionDiagnosticState(true), traversalEvidence());
    let full = first;
    for (let index = 1; index <= EXPRESSION_DIAGNOSTIC_CAPACITY; index += 1) {
      full = appendExpressionDiagnostic(full, traversalEvidence());
    }
    const options = { kind: "player-traversal" as const, hazardSeverity: 500_000 };
    const before = JSON.stringify(full);
    expect(previewExpressionDiagnosticProducer(full, 1, options)).toBeNull();
    expect(previewExpressionDiagnosticProducer(full, 65, options)?.candidate.meaning).toBe("relief-after-near-fall");
    expect(previewExpressionDiagnosticProducer(first, 2, options)).toBeNull();
    expect(previewExpressionDiagnosticProducer(first, 1, options)).not.toBeNull();
    expect(previewExpressionDiagnosticProducer(createExpressionDiagnosticState(true), 1, options)).toBeNull();
    expect(JSON.stringify(full)).toBe(before);
  });
});

describe("captured guardian shelter-whine producer replay", () => {
  it("replays exact fresh condition/work causes deterministically with detached frozen evidence", () => {
    const source = structuredClone(shelterWhineEvidence());
    const sourceBefore = JSON.stringify(source);
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), source);
    const before = JSON.stringify(state);
    const record = state.records[0]!;
    const sourceContext = source.producerContext;
    const context = record.producerContext;
    if (sourceContext?.kind !== "guardian-dog-shelter-whine" || context?.kind !== "guardian-dog-shelter-whine") {
      throw new Error("expected copied guardian shelter context");
    }
    expect(context.input.dog.intent).toMatchObject({
      kind: "seek-shelter", cause: { kind: "condition", referenceId: "condition:weather-exposure" }, enteredAtTick: 1,
    });
    expect(context.input.workingAnimals.assignments[0]?.currentActivity).toMatchObject({
      activity: "defer-to-actor", acceptedAtTick: 1,
      cause: { kind: "actor-disposition", referenceId: "actor-intent:seek-shelter" },
    });
    const replay = replayExpressionDiagnosticProducer(state, 1)!;
    expect(replay).toMatchObject({
      scope: "captured-producer-and-kernel-replay", producerKind: "guardian-dog-shelter-whine",
      actualRuntimeReason: "accepted", accepted: true, reason: "accepted",
      candidate: { meaning: "guardian-dog-shelter-whine", volume: "murmur", knowledgeBasis: "self-weather-distress" },
      realization: { text: "WHINE...", vocalization: "dog-shelter-whine" },
    });
    expect(replay.candidate).toEqual(record.intent);
    expect(replayExpressionDiagnosticProducer(state, 1)).toEqual(replay);
    const sourceObjects = objectGraph(source);
    const recordObjects = objectGraph(record);
    for (const object of recordObjects) {
      expect(sourceObjects.has(object)).toBe(false);
      expect(Object.isFrozen(object)).toBe(true);
    }
    for (const object of objectGraph(replay)) {
      expect(recordObjects.has(object)).toBe(false);
      expect(sourceObjects.has(object)).toBe(false);
      expect(Object.isFrozen(object)).toBe(true);
    }
    for (const object of sourceObjects) expect(Object.isFrozen(object)).toBe(false);
    expect(JSON.stringify(source)).toBe(sourceBefore);
    Reflect.set(sourceContext.input, "shelterIntentScore", 1);
    Reflect.set(sourceContext.input.dog.intent, "enteredAtTick", 0);
    expect(context.input.shelterIntentScore).toBe(650_000);
    expect(context.input.dog.intent.enteredAtTick).toBe(1);
    expect(Reflect.set(context.input, "shelterIntentScore", 1)).toBe(false);
    expect(Reflect.set(replay.candidate.position, "localX", 0)).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("keeps a recorded sound-budget refusal separate from hypothetical whine replay", () => {
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), shelterWhineEvidence(undefined, "sound-budget"));
    expect(state.records[0]).toMatchObject({ reason: "sound-budget", event: null, admission: null, playerReception: null });
    const replay = replayExpressionDiagnosticProducer(state, 1);
    expect(replay).toMatchObject({
      producerKind: "guardian-dog-shelter-whine", actualRuntimeReason: "sound-budget", accepted: true, reason: "accepted",
    });
    expect(replay?.notEvaluated).toEqual(expect.arrayContaining([
      "physical-transaction", "physical-recency", "sample/channel-capacity", "listener-hearing", "causal-admission",
    ]));
  });

  it("makes malformed, continued, wrong-work and mismatched shelter-score contexts unavailable", () => {
    const evidence = shelterWhineEvidence();
    const context = evidence.producerContext;
    if (context?.kind !== "guardian-dog-shelter-whine") throw new Error("expected guardian fixture context");
    const input = context.input;
    const assignment = input.workingAnimals.assignments[0]!;
    for (const invalid of [
      null,
      { ...input, dog: null },
      { ...input, shelterIntentScore: 0 },
      { ...input, dog: { ...input.dog, intent: { ...input.dog.intent, enteredAtTick: 0 } } },
      { ...input, workingAnimals: { ...input.workingAnimals, assignments: [{
        ...assignment, currentActivity: { ...assignment.currentActivity,
          cause: { kind: "actor-disposition", referenceId: "actor-intent:retreat" } },
      }] } },
      { ...input, shelterIntentScore: input.shelterIntentScore + 1 },
    ]) {
      const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), {
        ...evidence,
        producerContext: { kind: "guardian-dog-shelter-whine", input: invalid } as unknown as ExpressionDiagnosticProducerContext,
      });
      const before = JSON.stringify(state);
      expect(replayExpressionDiagnosticProducer(state, 1)).toBeNull();
      expect(JSON.stringify(state)).toBe(before);
    }
  });

  it("isolates dog-mapper and cloning exceptions without changing retained causes", () => {
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), shelterWhineEvidence());
    const before = JSON.stringify(state);
    const clone = vi.spyOn(globalThis, "structuredClone").mockImplementation(() => { throw new Error("whine copy failed"); });
    expect(replayExpressionDiagnosticProducer(state, 1)).toBeNull();
    clone.mockRestore();
    vi.spyOn(dogSignalProducer, "guardianDogShelterWhineExpressionIntent").mockImplementation(() => {
      throw new Error("whine mapper failed");
    });
    expect(replayExpressionDiagnosticProducer(state, 1)).toBeNull();
    expect(JSON.stringify(state)).toBe(before);
  });

  it("retires evicted/reset whines while preserving traversal dispatch and discarded-root isolation", () => {
    const evidence = shelterWhineEvidence();
    const committed = appendExpressionDiagnostic(createExpressionDiagnosticState(true), evidence);
    let current = committed;
    const traversal = traversalEvidence();
    for (let index = 0; index < EXPRESSION_DIAGNOSTIC_CAPACITY; index += 1) {
      current = appendExpressionDiagnostic(current, traversal);
    }
    expect(current.records).toHaveLength(64);
    expect(current.evictedCount).toBe(1);
    expect(replayExpressionDiagnosticProducer(current, 1)).toBeNull();
    expect(replayExpressionDiagnosticProducer(current, 65)?.producerKind).toBe("player-traversal");
    expect(replayExpressionDiagnosticProducer(committed, 2)).toBeNull();
    expect(replayExpressionDiagnosticProducer(committed, 1)?.producerKind).toBe("guardian-dog-shelter-whine");
    const reset = createExpressionDiagnosticState(true);
    expect(replayExpressionDiagnosticProducer(reset, 1)).toBeNull();
    expect(replayExpressionDiagnosticProducer(appendExpressionDiagnostic(reset, evidence), 1)?.producerKind)
      .toBe("guardian-dog-shelter-whine");
  });
});

describe("captured player-listening preview", () => {
  it("normalizes uncaptured context to null without treating it as inaudibility", () => {
    const evidence = acceptedEvidence();
    const omitted = appendExpressionDiagnostic(createExpressionDiagnosticState(true), evidence);
    const explicit = appendExpressionDiagnostic(createExpressionDiagnosticState(true), {
      ...evidence, listeningContext: null,
    });
    expect(omitted.records[0]?.listeningContext).toBeNull();
    expect(explicit).toEqual(omitted);
    expect(previewExpressionDiagnosticListening(omitted, 1)).toBeNull();
    expect(previewExpressionDiagnosticListening(explicit, 1, { ambientNoise: 0 })).toBeNull();
  });

  it("detaches immutable captured evidence and exactly replays its unchanged contact", () => {
    const source = structuredClone(listeningEvidence());
    const beforeSource = JSON.stringify(source);
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), source);
    const record = state.records[0]!;
    const before = JSON.stringify(state);
    const context = record.listeningContext;
    const sourceContext = source.listeningContext;
    if (context === null || sourceContext === null || sourceContext === undefined) {
      throw new Error("expected copied listening capture");
    }
    expect(context.contact).not.toBeNull();
    expect(context).toEqual(sourceContext);
    const sourceObjects = objectGraph(source);
    const recordObjects = objectGraph(record);
    for (const object of recordObjects) {
      expect(sourceObjects.has(object)).toBe(false);
      expect(Object.isFrozen(object)).toBe(true);
    }
    for (const object of sourceObjects) expect(Object.isFrozen(object)).toBe(false);
    const preview = previewExpressionDiagnosticListening(state, 1);
    if (preview === null) throw new Error("expected an available captured contact preview");
    expect(preview).toEqual({
      scope: "captured-player-listening-preview",
      actualRuntimeReason: record.reason,
      actualContact: context.contact,
      actualPlayerReception: record.playerReception,
      candidateInput: context.input,
      hypotheticalContact: context.contact,
      notEvaluated: [
        "physical-environment-change", "terrain/structure/foliage-transmission",
        "sleep-policy", "visibility/identification", "comprehension", "npc-reception",
        "causal-admission", "audio/presentation",
      ],
    });
    for (const object of objectGraph(preview)) {
      expect(recordObjects.has(object)).toBe(false);
      expect(sourceObjects.has(object)).toBe(false);
      expect(Object.isFrozen(object)).toBe(true);
    }
    expect(previewExpressionDiagnosticListening(state, 1)).toEqual(preview);
    expect(JSON.stringify(source)).toBe(beforeSource);
    Reflect.set(sourceContext.input, "ambientNoise", 1);
    Reflect.set(sourceContext.input.source, "x", 900);
    expect(context.input.ambientNoise).toBe(0.2);
    expect(context.input.source.x).toBe(4);
    expect(Reflect.set(context.input, "ambientNoise", 1)).toBe(false);
    expect(Reflect.set(preview.candidateInput.source, "x", 900)).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("returns a valid fully masked preview without erasing the actual contact or receipt", () => {
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), listeningEvidence());
    const record = state.records[0]!;
    const before = JSON.stringify(state);
    const overrides = { ambientNoise: 1 };
    const preview = previewExpressionDiagnosticListening(state, 1, overrides);
    expect(preview).not.toBeNull();
    expect(preview?.hypotheticalContact).toBeNull();
    expect(preview?.actualContact).toEqual(record.listeningContext?.contact);
    expect(preview?.actualContact).not.toBeNull();
    expect(preview?.actualPlayerReception).toEqual(record.playerReception);
    expect(preview?.actualPlayerReception?.kind).toBe("heard-visible");
    expect(preview?.candidateInput).toEqual({ ...record.listeningContext?.input, ambientNoise: 1 });
    expect(Object.isFrozen(overrides)).toBe(false);
    overrides.ambientNoise = 0;
    expect(preview?.candidateInput.ambientNoise).toBe(1);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("keeps synthetic whine producer replay and its recorded receipt unchanged by listening previews", () => {
    // Combine the existing mapper/contact fixtures, not a real animal encounter.
    const source = structuredClone(listeningEvidence());
    const beforeSource = JSON.stringify(source);
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), source);
    const record = state.records[0]!;
    const before = JSON.stringify(state);
    const replay = replayExpressionDiagnosticProducer(state, record.sequence);
    expect(replay).toMatchObject({
      producerKind: "guardian-dog-shelter-whine", actualRuntimeReason: "accepted",
      candidate: record.intent, accepted: true, reason: "accepted",
    });
    const baseline = previewExpressionDiagnosticListening(state, record.sequence);
    const masked = previewExpressionDiagnosticListening(state, record.sequence, { ambientNoise: 1 });
    expect(baseline).not.toBeNull();
    expect(masked).not.toBeNull();
    expect(baseline?.actualContact).not.toBeNull();
    expect(baseline?.actualContact).toEqual(record.listeningContext?.contact);
    expect(baseline?.hypotheticalContact).toEqual(record.listeningContext?.contact);
    expect(baseline?.candidateInput).toEqual(record.listeningContext?.input);
    for (const preview of [baseline, masked]) {
      expect(preview?.actualRuntimeReason).toBe(record.reason);
      expect(preview?.actualContact).toEqual(record.listeningContext?.contact);
      expect(preview?.actualPlayerReception).toEqual(record.playerReception);
      expect(preview?.actualPlayerReception?.kind).toBe("heard-visible");
    }
    expect(masked?.candidateInput).toEqual({ ...record.listeningContext?.input, ambientNoise: 1 });
    expect(masked?.hypotheticalContact).toBeNull();
    const sourceObjects = objectGraph(source);
    const recordObjects = objectGraph(record);
    for (const result of [replay, baseline, masked]) {
      for (const object of objectGraph(result)) {
        expect(sourceObjects.has(object)).toBe(false);
        expect(recordObjects.has(object)).toBe(false);
        expect(Object.isFrozen(object)).toBe(true);
      }
    }
    expect(replayExpressionDiagnosticProducer(state, record.sequence)).toEqual(replay);
    expect(previewExpressionDiagnosticListening(state, record.sequence)).toEqual(baseline);
    expect(JSON.stringify(state)).toBe(before);
    expect(JSON.stringify(source)).toBe(beforeSource);
  });

  it("keeps a valid captured null contact distinct from missing or unsupported context", () => {
    const input = { ...listeningCapture().input, ambientNoise: 1 };
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), listeningEvidence(listeningCapture(input)));
    const before = JSON.stringify(state);
    expect(state.records[0]?.listeningContext).toEqual({ input, contact: null });
    expect(previewExpressionDiagnosticListening(state, 1)).toMatchObject({
      actualContact: null, actualPlayerReception: null, hypotheticalContact: null,
    });
    const unmasked = previewExpressionDiagnosticListening(state, 1, { ambientNoise: 0 });
    expect(unmasked?.actualContact).toBeNull();
    expect(unmasked?.actualPlayerReception).toBeNull();
    expect(unmasked?.hypotheticalContact).not.toBeNull();
    expect(JSON.stringify(state)).toBe(before);
  });

  it("preserves an actual runtime refusal despite hypothetical acoustic contact", () => {
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), {
      ...listeningEvidence(), reason: "sound-budget", event: null, admission: null, playerReception: null,
    });
    const before = JSON.stringify(state);
    const preview = previewExpressionDiagnosticListening(state, 1, { ambientNoise: 0 });
    expect(preview?.actualRuntimeReason).toBe("sound-budget");
    expect(preview?.actualPlayerReception).toBeNull();
    expect(preview?.hypotheticalContact).not.toBeNull();
    expect(state.records[0]).toMatchObject({ reason: "sound-budget", event: null, admission: null, playerReception: null });
    expect(JSON.stringify(state)).toBe(before);
  });

  it("accepts the masking endpoints and saturates valid diagonal wind through the existing calculator", () => {
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), listeningEvidence());
    const input = state.records[0]!.listeningContext!.input;
    const before = JSON.stringify(state);
    for (const overrides of [
      { ambientNoise: 0 }, { ambientNoise: 1 },
      { wind: { x: 1, y: 1 } }, { wind: { x: -1, y: -1 } },
      { ambientNoise: 0.5, wind: { x: 0, y: 0 } },
    ]) {
      const preview = previewExpressionDiagnosticListening(state, 1, overrides);
      expect(preview).not.toBeNull();
      expect(preview?.candidateInput).toEqual({ ...input, ...overrides });
      expect(preview?.hypotheticalContact).toEqual(evaluateAudibleContact({ ...input, ...overrides }));
    }
    const overrides = Object.assign(Object.create(null), {
      ambientNoise: 0,
      wind: Object.assign(Object.create(null), { x: 1, y: -1 }),
    }) as ExpressionListeningPreviewOverrides;
    expect(previewExpressionDiagnosticListening(state, 1, overrides)).not.toBeNull();
    expect(JSON.stringify(state)).toBe(before);
  });

  it("accepts a finite zero range as captured inaudibility", () => {
    const context = listeningCapture({ ...listeningCapture().input, baseRange: 0 });
    expect(context.contact).toBeNull();
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), listeningEvidence(context));
    expect(previewExpressionDiagnosticListening(state, 1)).toMatchObject({
      candidateInput: { baseRange: 0 }, actualContact: null, hypotheticalContact: null,
    });
  });

  it("rejects malformed captured metadata even when its calculator result would be null", () => {
    const evidence = listeningEvidence();
    const input = evidence.listeningContext!.input;
    const malformed = [
      null, {}, { ...input, listener: null }, { ...input, source: {} },
      { ...input, listener: { x: Number.NaN, y: 4 } },
      { ...input, source: { x: Number.POSITIVE_INFINITY, y: 4 } },
      { ...input, wind: { x: 0, y: Number.NEGATIVE_INFINITY } },
      { ...input, baseRange: -1 }, { ...input, baseRange: Number.NaN },
      { ...input, baseRange: Number.POSITIVE_INFINITY },
      { ...input, ambientNoise: -0.01 }, { ...input, ambientNoise: 1.01 },
      { ...input, sourceLoudness: -0.01 }, { ...input, sourceLoudness: 1.01 },
      { ...input, sourceLoudness: Number.NaN },
      { ...input, listener: { x: -Number.MAX_VALUE, y: 0 }, source: { x: Number.MAX_VALUE, y: 0 } },
      { ...input, wind: { x: Number.MAX_VALUE, y: Number.MAX_VALUE } },
    ];
    for (const invalid of malformed) {
      const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), {
        ...evidence, listeningContext: { input: invalid, contact: null } as unknown as ExpressionDiagnosticListeningContext,
      });
      const before = JSON.stringify(state);
      expect(previewExpressionDiagnosticListening(state, 1)).toBeNull();
      expect(JSON.stringify(state)).toBe(before);
    }
  });

  it("requires exact captured contact agreement before applying any masking override", () => {
    const evidence = listeningEvidence();
    const context = evidence.listeningContext!;
    const contact = context.contact;
    if (contact === null) throw new Error("expected an audible diagnostic fixture");
    for (const invalid of [
      { input: context.input, contact: null },
      { input: context.input, contact: { ...contact, certainty: contact.certainty + 0.001 } },
      { input: context.input, contact: { ...contact, bearing: { ...contact.bearing, centerRadians: contact.bearing.centerRadians + 0.001 } } },
      { input: context.input, contact: { ...contact, distanceBand: { ...contact.distanceBand, maximum: contact.distanceBand.maximum + 0.001 } } },
      { input: { ...context.input, ambientNoise: 1 }, contact },
      { input: context.input, contact: { ...contact, certainty: Number.NaN } },
      { input: context.input, contact: "not a contact" },
    ]) {
      const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), {
        ...evidence, listeningContext: invalid as unknown as ExpressionDiagnosticListeningContext,
      });
      const before = JSON.stringify(state);
      expect(previewExpressionDiagnosticListening(state, 1, { ambientNoise: 1 })).toBeNull();
      expect(JSON.stringify(state)).toBe(before);
    }
  });

  it("rejects unknown top-level overrides rather than changing source or listener authority", () => {
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), listeningEvidence());
    for (const invalid of [
      { listener: { x: 0, y: 0 } }, { source: { x: 0, y: 0 } },
      { baseRange: 999 }, { sourceLoudness: 1 }, { weather: "clear" },
      { sourceActorId: "invented" }, { playerReception: { kind: "heard-visible" } },
      { ambientNoise: 0, meaning: "guardian-dog-warning" },
    ]) {
      expect(previewExpressionDiagnosticListening(state, 1, invalid as ExpressionListeningPreviewOverrides)).toBeNull();
    }
  });

  it("rejects inherited, hidden, symbolic and accessor overrides without evaluating getters", () => {
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), listeningEvidence());
    const getter = vi.fn(() => { throw new Error("listening preview must not evaluate override getters"); });
    const accessor = Object.defineProperty({}, "ambientNoise", { enumerable: true, get: getter });
    const hidden = Object.defineProperty({}, "ambientNoise", { value: 0, enumerable: false });
    const inherited = Object.assign(Object.create({ ambientNoise: 1 }), { wind: { x: 0, y: 0 } });
    const proxy = new Proxy({}, { getPrototypeOf() { throw new Error("hostile override prototype"); } });
    const before = JSON.stringify(state);
    for (const invalid of [accessor, hidden, inherited, { [Symbol("mask")]: 0 }, [], null, 1, proxy]) {
      expect(previewExpressionDiagnosticListening(state, 1, invalid as ExpressionListeningPreviewOverrides)).toBeNull();
    }
    expect(getter).not.toHaveBeenCalled();
    expect(JSON.stringify(state)).toBe(before);
  });

  it("validates nested wind own data fields without evaluating nested getters", () => {
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), listeningEvidence());
    const getter = vi.fn(() => { throw new Error("listening preview must not evaluate wind getters"); });
    const accessor = Object.defineProperty({ y: 0 }, "x", { enumerable: true, get: getter });
    const hidden = Object.defineProperty({ y: 0 }, "x", { value: 0, enumerable: false });
    const inherited = Object.assign(Object.create({ x: 0 }), { y: 0 });
    const proxy = new Proxy({}, { getPrototypeOf() { throw new Error("hostile wind prototype"); } });
    const before = JSON.stringify(state);
    for (const wind of [
      accessor, hidden, inherited, { x: 0, y: 0, [Symbol("wind")]: 0 },
      { x: 0, y: 0, z: 0 }, {}, { x: 0 }, { y: 0 }, [], null, 1, proxy,
      { x: 1.01, y: 0 }, { x: 0, y: -1.01 }, { x: Number.NaN, y: 0 },
      { x: 0, y: Number.POSITIVE_INFINITY }, { x: "0", y: 0 },
    ]) {
      expect(previewExpressionDiagnosticListening(state, 1, { wind } as ExpressionListeningPreviewOverrides)).toBeNull();
    }
    expect(getter).not.toHaveBeenCalled();
    expect(JSON.stringify(state)).toBe(before);
  });

  it("rejects non-unit masking and explicitly undefined supplied controls", () => {
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), listeningEvidence());
    for (const ambientNoise of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY, "0", null, undefined]) {
      expect(previewExpressionDiagnosticListening(state, 1, { ambientNoise } as ExpressionListeningPreviewOverrides)).toBeNull();
    }
    expect(previewExpressionDiagnosticListening(state, 1, { wind: undefined } as unknown as ExpressionListeningPreviewOverrides)).toBeNull();
  });

  it("uses only the retained buffer through eviction, reset and discarded staged roots", () => {
    const evidence = listeningEvidence();
    const first = appendExpressionDiagnostic(createExpressionDiagnosticState(true), evidence);
    const before = JSON.stringify(first);
    const staged = appendExpressionDiagnostic(first, { ...evidence, reason: "sound-budget", playerReception: null });
    expect(previewExpressionDiagnosticListening(staged, 2)?.actualRuntimeReason).toBe("sound-budget");
    expect(previewExpressionDiagnosticListening(first, 2)).toBeNull();
    let full = first;
    for (let index = 0; index < EXPRESSION_DIAGNOSTIC_CAPACITY; index += 1) {
      full = appendExpressionDiagnostic(full, evidence);
    }
    expect(full.records).toHaveLength(64);
    expect(full.evictedCount).toBe(1);
    expect(previewExpressionDiagnosticListening(full, 1)).toBeNull();
    expect(previewExpressionDiagnosticListening(full, 65)).not.toBeNull();
    const reset = createExpressionDiagnosticState(true);
    expect(previewExpressionDiagnosticListening(reset, 1)).toBeNull();
    const restarted = appendExpressionDiagnostic(reset, {
      ...evidence, listeningContext: listeningCapture({ ...evidence.listeningContext!.input, ambientNoise: 1 }),
      playerReception: null,
    });
    expect(restarted.records[0]?.sequence).toBe(1);
    expect(previewExpressionDiagnosticListening(restarted, 1)?.actualContact).toBeNull();
    expect(previewExpressionDiagnosticListening(first, 1)?.actualContact).not.toBeNull();
    for (const sequence of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5, 66]) {
      expect(previewExpressionDiagnosticListening(full, sequence)).toBeNull();
    }
    expect(JSON.stringify(first)).toBe(before);
  });

  it("isolates copying failure without modifying retained contact or actual receipt", () => {
    const state = appendExpressionDiagnostic(createExpressionDiagnosticState(true), listeningEvidence());
    const before = JSON.stringify(state);
    vi.spyOn(globalThis, "structuredClone").mockImplementation(() => { throw new Error("listening preview copy failed"); });
    expect(previewExpressionDiagnosticListening(state, 1)).toBeNull();
    expect(JSON.stringify(state)).toBe(before);
  });
});

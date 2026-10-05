import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveRecord, SaveRepository } from "../platform/persistence";
import { deserializeWorld } from "../sim/public";
import * as humanPerception from "./humanPerception";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import { SITUATED_EXPRESSION_SEMANTIC_FACT_MIN_CONFIDENCE } from "./situatedExpressionAcoustics";
import * as expressionChannels from "./situatedExpressionChannelBank";
import * as diagnostics from "./situatedExpressionDiagnostics";

const play = vi.hoisted(() => vi.fn());
vi.mock("../audio/soundscape", () => ({
  spatialPanForBearing: () => 0,
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(...args: unknown[]): void { play(...args); }
    updateAmbience(): void {}
    destroy(): void {}
  },
}));

class MemoryRepository implements SaveRepository {
  private record: SaveRecord | undefined;
  async list() { return []; }
  async load(slotId: string) {
    return slotId === "autosave" && this.record ? structuredClone(this.record) : undefined;
  }
  async save(record: SaveRecord) { this.record = structuredClone(record); }
  async remove() { this.record = undefined; }
  snapshot(): SaveRecord {
    if (!this.record) throw new Error("Expression fixture has no current save");
    return structuredClone(this.record);
  }
}

let frame: ((now: number) => void) | undefined;
beforeEach(() => {
  frame = undefined;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: (now: number) => void) => {
    frame = callback;
    return 1;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function steps(runtime: TideweftRuntime, count: number): void {
  runtime.start();
  for (let index = 0; index <= count; index += 1) {
    const callback = frame;
    if (callback === undefined) throw new Error("Expression fixture lost its frame");
    frame = undefined;
    callback(100 + index * 100);
  }
  runtime.stop();
}

function objectGraph(value: unknown, found = new Set<object>()): Set<object> {
  if (value !== null && typeof value === "object" && !found.has(value)) {
    found.add(value);
    for (const child of Object.values(value)) objectGraph(child, found);
  }
  return found;
}

async function keeperRun(enabled: boolean) {
  const repository = new MemoryRepository();
  const runtime = await createTideweftRuntime(repository);
  const hearing = vi.spyOn(humanPerception, "collectExistingHumanObservations");
  try {
    runtime.dispatchUI({
      type: "new-world", seed: "phase ten glass ebb", posture: "journey", sessionShape: "wander",
    });
    const inspector = runtime.expressionDiagnostics;
    if (inspector === undefined) throw new Error("Development inspector is unavailable");
    expect(inspector.getSnapshot()).toMatchObject({ enabled: false, totalCount: 0, records: [] });
    inspector.setEnabled(enabled);
    play.mockClear();
    expect(runtime.getUIView().controls?.interactLabel).toBe("Warn the store keeper");
    runtime.dispatchUI({ type: "interact" });
    const decisions = inspector.getSnapshot();
    const caption = runtime.getUIView().expressionCaption;
    await runtime.save();
    const pending = repository.snapshot();
    const beforePreview = {
      decisions: structuredClone(decisions),
      view: structuredClone(runtime.getRenderView()),
      ui: structuredClone(runtime.getUIView()),
      audio: structuredClone(play.mock.calls),
    };
    const sequence = decisions.records[0]?.sequence ?? 1;
    const initialAudit = inspector.auditKnowledge();
    const baseline = inspector.previewListening(sequence);
    const masked = inspector.previewListening(sequence, { ambientNoise: 1 });
    expect(inspector.getSnapshot()).toEqual(beforePreview.decisions);
    expect(runtime.getRenderView()).toEqual(beforePreview.view);
    expect(runtime.getUIView()).toEqual(beforePreview.ui);
    expect(play.mock.calls).toEqual(beforePreview.audio);
    expect(repository.snapshot()).toEqual(pending);
    await runtime.save();
    expect(repository.snapshot().worldJson).toBe(pending.worldJson);
    steps(runtime, 10);
    await runtime.save();
    const final = repository.snapshot();
    const view = structuredClone(runtime.getRenderView());
    const ui = structuredClone(runtime.getUIView());
    const audio = structuredClone(play.mock.calls);
    const audienceDecisions = inspector.getSnapshot();
    const audienceAudit = inspector.auditKnowledge();
    const filteredAudienceAudit = inspector.auditKnowledge({ meaning: "keeper-secure-store-response" });
    expect(inspector.getSnapshot()).toEqual(audienceDecisions);
    expect(runtime.getRenderView()).toEqual(view);
    expect(runtime.getUIView()).toEqual(ui);
    expect(play.mock.calls).toEqual(audio);
    expect(repository.snapshot()).toEqual(final);
    const saved = JSON.parse(final.worldJson) as { world: string };
    const completedTick = deserializeWorld(saved.world).meta.completedTick;
    const hearingCall = hearing.mock.calls.findIndex(([input]) => input.targetTick === completedTick);
    const hearingResult = hearing.mock.results[hearingCall];
    if (hearingResult?.type !== "return") throw new Error("Keeper fixture lost its actual selected human frame");
    const selectedHumans = structuredClone(hearingResult.value) as ReturnType<typeof humanPerception.collectExistingHumanObservations>;
    expect(inspector.reset()).toMatchObject({
      enabled, totalCount: 0, evictedCount: 0, records: [],
    });
    expect(inspector.previewListening(sequence)).toBeNull();
    expect(inspector.auditKnowledge()).toMatchObject({
      scope: "captured-factual-knowledge-audit", enabled, totalCount: 0, records: [],
    });
    expect(runtime.getRenderView()).toEqual(view);
    expect(runtime.getUIView()).toEqual(ui);
    expect(play.mock.calls).toEqual(audio);
    expect(repository.snapshot()).toEqual(final);
    await runtime.save();
    expect(repository.snapshot().worldJson).toBe(final.worldJson);
    return {
      repository, pending, final: repository.snapshot(), decisions, caption,
      baseline, masked, audio, view, ui, initialAudit, audienceDecisions,
      audienceAudit, filteredAudienceAudit, selectedHumans,
    };
  } finally { hearing.mockRestore(); runtime.destroy(); }
}

describe("development situated-expression inspector", () => {
  it("records a committed keeper cause and previews its exact listening without changing state, events, saves or audio", async () => {
    const control = await keeperRun(false);
    const observed = await keeperRun(true);
    expect(control.decisions.records).toEqual([]);
    expect(control.baseline).toBeNull();
    expect(control.masked).toBeNull();
    expect(control.initialAudit.records).toEqual([]);
    expect(control.audienceAudit.records).toEqual([]);
    expect(observed.decisions.records).toHaveLength(1);
    const decision = observed.decisions.records[0]!;
    expect(decision).toMatchObject({
      reason: "accepted", completedTick: 420, playerStepPhase: 0,
      intent: { meaning: "keeper-secure-store-response", knowledgeBasis: "self-committed-store-closure" },
      priorState: { active: null, recent: [] },
      admission: { kind: "settlement-keeper-store-response" },
      playerReception: { kind: "heard-visible" },
      sourceBelief: null,
      producerContext: null,
      realization: { text: observed.caption?.text },
    });
    expect(decision.event?.eventId).toBe(observed.caption?.id);
    expect(observed.initialAudit).toMatchObject({
      scope: "captured-factual-knowledge-audit", enabled: true, totalCount: 1,
      records: [{
        sequence: decision.sequence, meaning: "keeper-secure-store-response", sourceStatus: "validated",
        sourceCheck: {
          eventId: decision.event?.eventId, sourceActorId: decision.intent.sourceActorId,
          triggerEventId: decision.intent.triggerEventId, checkedAtTick: decision.completedTick,
          owner: "settlementKeeperStoreResponseExpression", validated: true,
        },
        playerReceiptStatus: "matching-retained-receipt", humanListeners: null, issues: [],
      }],
    });
    const audited = observed.audienceAudit.records.find(({ sequence }) => sequence === decision.sequence);
    if (audited?.humanListeners === null || audited?.humanListeners === undefined) {
      throw new Error("Committed keeper report lost its captured human audience");
    }
    expect(audited).toMatchObject({
      sourceStatus: "validated", sourceCheck: observed.initialAudit.records[0]?.sourceCheck,
      playerReceiptStatus: "matching-retained-receipt", issues: [],
    });
    expect(observed.filteredAudienceAudit.records).toEqual([audited]);
    expect(observed.audienceAudit.notEvaluated).toEqual([
      "uncaptured-source-provenance", "listeners-outside-selected-human-frame",
      "player-comprehension", "unsupported-npc-semantic-transfer", "portable-source-attestation",
    ]);
    const audience = audited.humanListeners;
    expect(audience.length).toBeGreaterThan(0);
    expect(audience.length).toBeLessThanOrEqual(humanPerception.HUMAN_PERCEPTION_MAX_RESIDENTS);
    expect(audience.map(({ receipt }) => receipt.observerId)).toEqual(
      observed.selectedHumans.map(({ observerId }) => observerId),
    );
    expect(new Set(audience.map(({ receipt }) => receipt.observerId)).size).toBe(audience.length);
    const pending = JSON.parse(observed.pending.worldJson) as {
      perceptionCarry: { actorVocalizationSamples: humanPerception.SupplementalSoundSample[] };
    };
    const sample = pending.perceptionCarry.actorVocalizationSamples.find(({ expressionEventId }) => (
      expressionEventId === decision.event?.eventId
    ));
    if (sample === undefined) throw new Error("Keeper report lost its actual pending acoustic sample");
    const saved = JSON.parse(observed.final.worldJson) as { world: string };
    const world = deserializeWorld(saved.world);
    expect(world.meta.completedTick).toBe(decision.completedTick + 1);
    let retainedReports = 0;
    for (const listener of audience) {
      const { receipt } = listener;
      expect(receipt).toMatchObject({
        expressionEventId: decision.event?.eventId, sourceActorId: decision.intent.sourceActorId,
        sampleId: sample.id, observedAtTick: world.meta.completedTick,
        semanticFact: {
          expressionEventId: decision.event?.eventId, sourceActorId: decision.intent.sourceActorId,
          perceivedClass: "store-secured-report", minimumHearingConfidence: SITUATED_EXPRESSION_SEMANTIC_FACT_MIN_CONFIDENCE,
        },
      });
      const resident = world.residents.find(({ id }) => id === receipt.residentId);
      if (resident === undefined) throw new Error("Captured keeper listener has no saved resident");
      expect(resident.identity.stableId).toBe(receipt.observerId);
      const belief = resident.perception.beliefs.find(({ sourceObservationId, lastObservedTick }) => (
        sourceObservationId === receipt.observation?.id && lastObservedTick === receipt.observedAtTick
      ));
      expect(listener.retainedBelief).toBe(belief !== undefined);
      if (receipt.outcome !== "heard") {
        expect(receipt.contact).toBeNull();
        expect(receipt.observation).toBeNull();
        expect(listener.retainedBelief).toBe(false);
        continue;
      }
      if (receipt.contact === null || receipt.observation === null) throw new Error("Heard keeper receipt lost its exact contact/observation");
      const confidence = Math.round(receipt.contact.certainty * 1_000_000);
      const perceivedClass = confidence >= SITUATED_EXPRESSION_SEMANTIC_FACT_MIN_CONFIDENCE
        ? "store-secured-report" : "human-vocalization";
      expect(receipt.observation).toMatchObject({
        observerId: receipt.observerId, observedAtTick: world.meta.completedTick,
        channel: "hearing", perceivedClass, confidence, subjectId: null, identification: "anonymous",
      });
      expect(observed.selectedHumans.find(({ observerId }) => observerId === receipt.observerId)?.observations)
        .toContainEqual(receipt.observation);
      if (belief !== undefined) {
        expect(resident.perception).toMatchObject({ actorId: receipt.observerId, tick: world.meta.completedTick });
        expect(belief).toMatchObject({
          sourceObservationId: receipt.observation.id, firstObservedTick: world.meta.completedTick,
          lastObservedTick: world.meta.completedTick, channel: "hearing", perceivedClass,
          confidence, salience: receipt.observation.salience, area: receipt.observation.area,
          subjectId: null, identification: "anonymous",
        });
        if (perceivedClass === "store-secured-report") retainedReports += 1;
      }
      for (const field of ["text", "words", "quantity", "storeId", "closureTransactionId"]) {
        expect(receipt.observation).not.toHaveProperty(field);
      }
    }
    expect(retainedReports).toBeGreaterThan(0);
    expect(audience.filter(({ receipt }) => receipt.outcome === "source-excluded")).toEqual([
      expect.objectContaining({ receipt: expect.objectContaining({ observerId: decision.intent.sourceActorId }), retainedBelief: false }),
    ]);
    const diagnosticObjects = objectGraph([observed.decisions, observed.audienceDecisions]);
    for (const audit of [observed.initialAudit, observed.audienceAudit, observed.filteredAudienceAudit]) {
      for (const object of objectGraph(audit)) {
        expect(Object.isFrozen(object)).toBe(true);
        expect(diagnosticObjects.has(object)).toBe(false);
      }
    }
    const listening = decision.listeningContext;
    if (listening === null || observed.baseline === null || observed.masked === null) {
      throw new Error("Committed keeper response lost its captured listening preview");
    }
    expect(listening.contact).not.toBeNull();
    expect(observed.baseline).toMatchObject({
      scope: "captured-player-listening-preview",
      actualRuntimeReason: decision.reason,
      actualContact: listening.contact,
      actualPlayerReception: decision.playerReception,
      candidateInput: listening.input,
      hypotheticalContact: listening.contact,
    });
    expect(observed.baseline.actualContact).toEqual(listening.contact);
    expect(observed.baseline.actualPlayerReception).toEqual(decision.playerReception);
    expect(observed.baseline.actualPlayerReception).toMatchObject({ kind: "heard-visible" });
    expect(observed.baseline.candidateInput).toEqual(listening.input);
    expect(observed.baseline.hypotheticalContact).toEqual(listening.contact);
    expect(observed.masked).toMatchObject({
      scope: "captured-player-listening-preview",
      actualRuntimeReason: decision.reason,
      actualContact: listening.contact,
      actualPlayerReception: decision.playerReception,
      hypotheticalContact: null,
    });
    expect(observed.masked.actualContact).toEqual(listening.contact);
    expect(observed.masked.actualPlayerReception).toEqual(decision.playerReception);
    expect(observed.masked.candidateInput).toEqual({ ...listening.input, ambientNoise: 1 });
    expect(observed.baseline.notEvaluated).toEqual([
      "physical-environment-change", "terrain/structure/foliage-transmission",
      "sleep-policy", "visibility/identification", "comprehension", "npc-reception",
      "causal-admission", "audio/presentation",
    ]);
    expect(observed.masked.notEvaluated).toEqual(observed.baseline.notEvaluated);
    expect(observed.pending.worldJson).toBe(control.pending.worldJson);
    expect(observed.final.worldJson).toBe(control.final.worldJson);
    expect(observed.view).toEqual(control.view);
    expect(observed.ui).toEqual(control.ui);
    expect(observed.audio).toEqual(control.audio);
    for (const record of [observed.pending, observed.final]) {
      for (const marker of [
        "expressionDiagnostics", "producerContext", "listeningContext", "candidateInput",
        "captured-player-listening-preview", "previewListening",
        "knowledgeSource", "humanListeners", "retainedBelief", "captured-factual-knowledge-audit", "auditKnowledge",
      ]) expect(record.worldJson).not.toContain(marker);
    }
    const restored = await createTideweftRuntime(observed.repository);
    try {
      expect(restored.getUIView().saveWarning).toBeUndefined();
      expect(restored.expressionDiagnostics?.getSnapshot()).toMatchObject({
        enabled: false, totalCount: 0, records: [],
      });
      expect(restored.expressionDiagnostics?.previewListening(decision.sequence)).toBeNull();
      expect(restored.expressionDiagnostics?.auditKnowledge().records).toEqual([]);
      restored.expressionDiagnostics?.setEnabled(true);
      expect(restored.expressionDiagnostics?.previewListening(decision.sequence)).toBeNull();
      expect(restored.expressionDiagnostics?.auditKnowledge().records).toEqual([]);
    } finally { restored.destroy(); }
  });

  it("isolates a diagnostic failure instead of vetoing the physical closure or its sound", async () => {
    const control = await keeperRun(false);
    vi.spyOn(diagnostics, "appendExpressionDiagnostic").mockImplementation(() => {
      throw new Error("developer observer failed");
    });
    const observed = await keeperRun(true);
    expect(observed.decisions.records).toEqual([]);
    expect(observed.baseline).toBeNull();
    expect(observed.masked).toBeNull();
    expect(observed.pending.worldJson).toBe(control.pending.worldJson);
    expect(observed.final.worldJson).toBe(control.final.worldJson);
    expect(observed.audio).toEqual(control.audio);
  });

  it("keeps the committed keeper source record but discards provisional human audience after a late closure failure", async () => {
    const repository = new MemoryRepository();
    const runtime = await createTideweftRuntime(repository);
    try {
      runtime.dispatchUI({
        type: "new-world", seed: "phase ten glass ebb", posture: "journey", sessionShape: "wander",
      });
      const inspector = runtime.expressionDiagnostics;
      if (inspector === undefined) throw new Error("Development inspector is unavailable");
      inspector.setEnabled(true);
      play.mockClear();
      expect(runtime.getUIView().controls?.interactLabel).toBe("Warn the store keeper");
      runtime.dispatchUI({ type: "interact" });
      const committed = inspector.getSnapshot();
      const committedAudit = inspector.auditKnowledge();
      expect(committed.records).toHaveLength(1);
      expect(committedAudit.records[0]).toMatchObject({
        sourceStatus: "validated", playerReceiptStatus: "matching-retained-receipt", humanListeners: null, issues: [],
      });
      steps(runtime, 9);
      await runtime.save();
      const beforeFailureRecord = repository.snapshot();
      const beforeFailure = JSON.parse(beforeFailureRecord.worldJson) as Record<string, unknown>;
      const audio = structuredClone(play.mock.calls);
      const capture = vi.spyOn(diagnostics, "captureExpressionDiagnosticHumanAudience");
      const close = vi.spyOn(expressionChannels, "closeSituatedExpressionChannelBankInterval").mockReturnValueOnce(null);
      try {
        steps(runtime, 1);
        expect(close).toHaveBeenCalledTimes(1);
        expect(capture.mock.results.some((result) => result.type === "return"
          && (result.value as diagnostics.ExpressionDiagnosticSnapshot).records.some((record) => (
            record.sequence === committed.records[0]?.sequence && (record.humanListeners?.length ?? 0) > 0
          )))).toBe(true);
        expect(runtime.getUIView().announcement?.message).toContain("INTEGRITY HALT");
        expect(inspector.getSnapshot()).toEqual(committed);
        expect(inspector.auditKnowledge()).toEqual(committedAudit);
        expect(repository.snapshot()).toEqual(beforeFailureRecord);
        expect(play.mock.calls.filter(([cue]) => cue !== "warning")).toEqual(audio.filter(([cue]) => cue !== "warning"));
        await runtime.save();
        const rolledBack = JSON.parse(repository.snapshot().worldJson) as Record<string, unknown>;
        for (const key of [
          "world", "physicalCargo", "regionalEcology", "settlementEcology", "dogActorRoster",
          "settlementWorkingAnimals", "perceptionCarry", "regionalTravel", "promiseJourney", "playerExpressionRecency",
        ]) expect(rolledBack[key], key).toEqual(beforeFailure[key]);
        expect(deserializeWorld(String(rolledBack.world)).meta.completedTick)
          .toBe(deserializeWorld(String(beforeFailure.world)).meta.completedTick);
      } finally { capture.mockRestore(); close.mockRestore(); }
    } finally { runtime.destroy(); }
  });

  it("does not expose hidden expression inspection in a production environment", async () => {
    vi.stubEnv("DEV", false);
    const runtime = await createTideweftRuntime(new MemoryRepository());
    try {
      expect(runtime).not.toHaveProperty("expressionDiagnostics");
    } finally { runtime.destroy(); }
  });
});

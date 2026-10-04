import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveRecord, SaveRepository } from "../platform/persistence";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
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

async function keeperRun(enabled: boolean) {
  const repository = new MemoryRepository();
  const runtime = await createTideweftRuntime(repository);
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
    steps(runtime, 10);
    await runtime.save();
    return {
      repository, pending, final: repository.snapshot(), decisions, caption,
      audio: structuredClone(play.mock.calls), view: runtime.getRenderView(),
    };
  } finally { runtime.destroy(); }
}

describe("development situated-expression inspector", () => {
  it("records a committed keeper cause and exact receipt without changing state, events, saves or audio", async () => {
    const control = await keeperRun(false);
    const observed = await keeperRun(true);
    expect(control.decisions.records).toEqual([]);
    expect(observed.decisions.records).toHaveLength(1);
    const decision = observed.decisions.records[0]!;
    expect(decision).toMatchObject({
      reason: "accepted", completedTick: 420, playerStepPhase: 0,
      intent: { meaning: "keeper-secure-store-response", knowledgeBasis: "self-committed-store-closure" },
      priorState: { active: null, recent: [] },
      admission: { kind: "settlement-keeper-store-response" },
      playerReception: { kind: "heard-visible" },
      sourceBelief: null,
      realization: { text: observed.caption?.text },
    });
    expect(decision.event?.eventId).toBe(observed.caption?.id);
    expect(observed.pending.worldJson).toBe(control.pending.worldJson);
    expect(observed.final.worldJson).toBe(control.final.worldJson);
    expect(observed.view).toEqual(control.view);
    expect(observed.audio).toEqual(control.audio);
    expect(observed.final.worldJson).not.toContain("expressionDiagnostics");
    const restored = await createTideweftRuntime(observed.repository);
    try {
      expect(restored.getUIView().saveWarning).toBeUndefined();
      expect(restored.expressionDiagnostics?.getSnapshot()).toMatchObject({
        enabled: false, totalCount: 0, records: [],
      });
    } finally { restored.destroy(); }
  });

  it("isolates a diagnostic failure instead of vetoing the physical closure or its sound", async () => {
    const control = await keeperRun(false);
    vi.spyOn(diagnostics, "appendExpressionDiagnostic").mockImplementation(() => {
      throw new Error("developer observer failed");
    });
    const observed = await keeperRun(true);
    expect(observed.decisions.records).toEqual([]);
    expect(observed.pending.worldJson).toBe(control.pending.worldJson);
    expect(observed.final.worldJson).toBe(control.final.worldJson);
    expect(observed.audio).toEqual(control.audio);
  });

  it("does not expose hidden expression inspection in a production environment", async () => {
    vi.stubEnv("DEV", false);
    const runtime = await createTideweftRuntime(new MemoryRepository());
    try {
      expect(runtime).not.toHaveProperty("expressionDiagnostics");
    } finally { runtime.destroy(); }
  });
});

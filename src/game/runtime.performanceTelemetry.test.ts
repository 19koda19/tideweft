import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";

vi.setConfig({ testTimeout: 120_000 });

const TELEMETRY_WORLD_SEED = "breathing room—é🌊 runtime telemetry";

vi.mock("../audio/soundscape", () => ({
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(): void {}
    updateAmbience(): void {}
    destroy(): void {}
  },
}));

class MemoryRepository implements SaveRepository {
  private record: SaveRecord | undefined;

  async list() {
    return [];
  }

  async load(slotId: string): Promise<SaveRecord | undefined> {
    return slotId === "autosave" && this.record !== undefined
      ? structuredClone(this.record)
      : undefined;
  }

  async save(record: SaveRecord): Promise<void> {
    this.record = structuredClone(record);
  }

  async remove(): Promise<void> {
    this.record = undefined;
  }

  snapshot(): SaveRecord {
    if (this.record === undefined) throw new Error("telemetry fixture has no autosave");
    return structuredClone(this.record);
  }
}

let scheduledFrame: ((now: number) => void) | undefined;

beforeEach(() => {
  scheduledFrame = undefined;
  let monotonicNow = 0;
  vi.spyOn(performance, "now").mockImplementation(() => {
    monotonicNow += 0.25;
    return monotonicNow;
  });
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: (now: number) => void) => {
    scheduledFrame = callback;
    return 1;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function advancePlayerSteps(runtime: TideweftRuntime, count: number): void {
  runtime.start();
  let now = 100;
  for (let frame = 0; frame <= count; frame += 1) {
    const callback = scheduledFrame;
    if (callback === undefined) throw new Error("runtime did not schedule its next frame");
    scheduledFrame = undefined;
    callback(now);
    now += 100;
  }
  runtime.stop();
}

function beginFreshWorld(runtime: TideweftRuntime, seed: string): void {
  runtime.dispatchUI({
    type: "new-world",
    seed,
    posture: "journey",
    sessionShape: "wander",
  });
}

function takeScheduledFrame(message: string): (now: number) => void {
  const callback = scheduledFrame as ((now: number) => void) | undefined;
  if (callback === undefined) throw new Error(message);
  scheduledFrame = undefined;
  return callback;
}

describe("runtime performance telemetry", () => {
  it("starts a replacement world on a fresh fixed-step phase", async () => {
    const runtime = await createTideweftRuntime(new MemoryRepository());
    runtime.start();
    takeScheduledFrame("runtime did not schedule its title frame")(100);
    takeScheduledFrame("runtime lost its title frame loop")(175);

    beginFreshWorld(runtime, "fresh fixed step phase");
    runtime.setPerformanceTelemetryEnabled(true);
    takeScheduledFrame("new world lost its scheduled frame")(200);
    expect(runtime.getPerformanceTelemetry().fixedStep.count).toBe(0);
    expect(runtime.getPerformanceTelemetry().fixedStep.totalCount).toBe(0);

    takeScheduledFrame("new world lost its second frame")(300);
    expect(runtime.getPerformanceTelemetry().fixedStep.count).toBe(1);
    expect(runtime.getPerformanceTelemetry().fixedStep.totalCount).toBe(1);
    runtime.destroy();
  });

  it("records bounded stage timings and live actor counts without entering save authority", async () => {
    const repository = new MemoryRepository();
    const runtime = await createTideweftRuntime(repository);
    beginFreshWorld(runtime, TELEMETRY_WORLD_SEED);

    const before = runtime.getPerformanceTelemetry();
    expect(Object.isFrozen(before)).toBe(true);
    expect(Object.isFrozen(before.counts)).toBe(true);
    expect(Object.isFrozen(before.fixedStep)).toBe(true);
    expect(before.fixedStep.enabled).toBe(false);
    expect(before.worldAdvanceStep.enabled).toBe(false);
    expect(before.viewProjection.enabled).toBe(false);
    expect(before.audioProjection.enabled).toBe(false);
    expect(before.saveSnapshot.enabled).toBe(false);
    expect(before.lastSerializedSaveBytes).toBe(0);
    expect(before.counts).toEqual({
      actorsTotal: 0,
      actorsMaterialized: 0,
      actorsVisible: 0,
      humans: 0,
      humansVisible: 0,
      dogs: 0,
      dogsVisible: 0,
      wildlifeActorRecords: 0,
      wildlifePopulationUnits: 0,
      wildlifeAggregatePopulationUnits: 0,
      wildlifeMaterialized: 0,
      wildlifeVisible: 0,
    });

    const enabled = runtime.setPerformanceTelemetryEnabled(true);
    expect(enabled.fixedStep.enabled).toBe(true);
    expect(enabled.worldAdvanceStep.enabled).toBe(true);
    expect(enabled.viewProjection.enabled).toBe(true);
    expect(enabled.audioProjection.enabled).toBe(true);
    expect(enabled.saveSnapshot.enabled).toBe(true);

    advancePlayerSteps(runtime, 10);
    const afterSteps = runtime.getPerformanceTelemetry();
    expect(afterSteps.fixedStep.count - before.fixedStep.count).toBe(10);
    expect(afterSteps.fixedStep.totalCount - before.fixedStep.totalCount).toBe(10);
    expect(afterSteps.worldAdvanceStep.count - before.worldAdvanceStep.count).toBe(1);
    expect(afterSteps.worldAdvanceStep.totalCount - before.worldAdvanceStep.totalCount).toBe(1);
    expect(afterSteps.viewProjection.count - before.viewProjection.count).toBe(10);
    expect(afterSteps.viewProjection.totalCount - before.viewProjection.totalCount).toBe(10);
    expect(afterSteps.audioProjection.count - before.audioProjection.count).toBe(10);
    expect(afterSteps.audioProjection.totalCount - before.audioProjection.totalCount).toBe(10);
    expect(afterSteps.fixedStep.meanMs).toBeGreaterThan(0);
    expect(afterSteps.worldAdvanceStep.maxMs).toBeGreaterThan(0);
    expect(afterSteps.viewProjection.p99Ms).toBeGreaterThan(0);
    expect(afterSteps.audioProjection.p99Ms).toBeGreaterThan(0);
    expect(afterSteps.counts.humans).toBeGreaterThan(0);
    expect(afterSteps.counts.dogs).toBeGreaterThan(0);
    expect(afterSteps.counts.wildlifeActorRecords).toBeGreaterThanOrEqual(
      afterSteps.counts.wildlifeMaterialized,
    );
    expect(afterSteps.counts.wildlifePopulationUnits).toBeGreaterThanOrEqual(
      afterSteps.counts.wildlifeActorRecords,
    );
    expect(afterSteps.counts.wildlifeMaterialized).toBeGreaterThanOrEqual(
      afterSteps.counts.wildlifeVisible,
    );
    expect(afterSteps.counts.actorsTotal).toBe(
      afterSteps.counts.humans
      + afterSteps.counts.dogs
      + afterSteps.counts.wildlifeActorRecords,
    );
    expect(afterSteps.counts.actorsMaterialized).toBe(
      afterSteps.counts.humans
      + afterSteps.counts.dogs
      + afterSteps.counts.wildlifeMaterialized,
    );
    expect(afterSteps.counts.actorsVisible).toBe(
      afterSteps.counts.humansVisible
      + afterSteps.counts.dogsVisible
      + afterSteps.counts.wildlifeVisible,
    );

    runtime.dispatchUI({ type: "settlement", action: "close" });
    const afterCommandProjection = runtime.getPerformanceTelemetry();
    expect(afterCommandProjection.viewProjection.count).toBe(
      afterSteps.viewProjection.count + 1,
    );
    expect(afterCommandProjection.viewProjection.totalCount).toBe(
      afterSteps.viewProjection.totalCount + 1,
    );
    expect(afterCommandProjection.audioProjection.count).toBe(
      afterSteps.audioProjection.count,
    );
    expect(afterCommandProjection.audioProjection.totalCount).toBe(
      afterSteps.audioProjection.totalCount,
    );

    const savesBefore = afterCommandProjection.saveSnapshot.count;
    await runtime.save();
    const afterSave = runtime.getPerformanceTelemetry();
    const saved = repository.snapshot();
    const envelope = JSON.parse(saved.worldJson) as Readonly<Record<string, unknown>>;
    expect(afterSave.saveSnapshot.count - savesBefore).toBe(1);
    expect(afterSave.saveSnapshot.totalCount).toBe(
      afterCommandProjection.saveSnapshot.totalCount + 1,
    );
    expect(afterSave.lastSerializedSaveBytes).toBe(
      new TextEncoder().encode(saved.worldJson).byteLength,
    );
    expect(envelope).not.toHaveProperty("performanceTelemetry");
    expect(envelope).not.toHaveProperty("telemetry");
    expect(saved.worldJson).not.toContain('"lastSerializedSaveBytes"');

    const reset = runtime.resetPerformanceTelemetry();
    expect(Object.isFrozen(reset)).toBe(true);
    expect(reset.fixedStep.count).toBe(0);
    expect(reset.fixedStep.totalCount).toBe(0);
    expect(reset.fixedStep.enabled).toBe(true);
    expect(reset.worldAdvanceStep.count).toBe(0);
    expect(reset.worldAdvanceStep.totalCount).toBe(0);
    expect(reset.viewProjection.count).toBe(0);
    expect(reset.viewProjection.totalCount).toBe(0);
    expect(reset.audioProjection.count).toBe(0);
    expect(reset.audioProjection.totalCount).toBe(0);
    expect(reset.saveSnapshot.count).toBe(0);
    expect(reset.saveSnapshot.totalCount).toBe(0);
    expect(reset.counts).toEqual(afterSave.counts);
    expect(reset.lastSerializedSaveBytes).toBe(0);
    await runtime.save();
    expect(repository.snapshot().worldJson).toBe(saved.worldJson);
    runtime.destroy();

    const controlRepository = new MemoryRepository();
    const control = await createTideweftRuntime(controlRepository);
    beginFreshWorld(control, TELEMETRY_WORLD_SEED);
    advancePlayerSteps(control, 10);
    await control.save();
    expect(controlRepository.snapshot().worldJson).toBe(saved.worldJson);
    control.destroy();
  });
});

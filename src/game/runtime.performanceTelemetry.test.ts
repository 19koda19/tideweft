import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import { deserializeWorld } from "../sim/public";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import * as canonicalUtil from "../sim/util";
import { CORE_ECOLOGY_BREADTH_HABITAT_OWNER_ID } from "./coreEcologyBreadthHabitat";
import { gameSaveEnvelopeIntegrity } from "./physicalCargoState";
import { createPlayerAnimalCallKnowledge } from "./playerAnimalCallKnowledge";
import { createPlayerExpressionRecencyState } from "./playerExpressionRecency";

vi.setConfig({ testTimeout: 120_000 });

const TELEMETRY_WORLD_SEED = "breathing room—é🌊 runtime telemetry";
const WORLD_ADVANCE_PHASE_KEYS = [
  "failClosedCheckpoint",
  "observedAftermath",
  "regionalEcologyActors",
  "regionalEcologyAggregateCommit",
  "worldAndLocalActors",
] as const;

vi.mock("../audio/soundscape", () => ({
  spatialPanForBearing: () => 0,
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
  it.each(["runtime baseline estuary", "breathing room regional density 8"])(
    "characterizes equal accepted work and repeated habitat encodes: %s",
    async (seed) => {
      const repository = new MemoryRepository();
      const runtime = await createTideweftRuntime(repository);
      let worldJson: string;
      try {
        beginFreshWorld(runtime, seed);
        runtime.setPerformanceTelemetryEnabled(true);
        runtime.resetPerformanceTelemetry();
        const originalEncoder = canonicalUtil.stableStringify;
        const inputs = new Map<object, number>();
        let encodedCodeUnits = 0;
        let durableSignalEncodes = 0;
        let durableSignalCodeUnits = 0;
        let durableDerivationCodeUnits = 0;
        const durableHabitats = new Map<object, number>();
        const encoder = vi.spyOn(canonicalUtil, "stableStringify").mockImplementation((value) => {
          const encoded = originalEncoder(value);
          if (typeof value === "object" && value !== null && "ownerId" in value
            && value.ownerId === CORE_ECOLOGY_BREADTH_HABITAT_OWNER_ID) {
            inputs.set(value, (inputs.get(value) ?? 0) + 1);
            encodedCodeUnits += encoded.length;
          }
          if (typeof value === "object" && value !== null && "patchKey" in value
            && "derivation" in value && "groups" in value && Array.isArray(value.groups)) {
            durableSignalEncodes += 1;
            durableSignalCodeUnits += encoded.length;
            const derivation = value.derivation as Readonly<Record<string, unknown>> | null;
            durableDerivationCodeUnits += originalEncoder(derivation).length;
            if (derivation !== null && typeof derivation.habitat === "object"
              && derivation.habitat !== null) {
              durableHabitats.set(derivation.habitat, (durableHabitats.get(derivation.habitat) ?? 0) + 1);
            }
          }
          return encoded;
        });
        try {
          advancePlayerSteps(runtime, 30);
        } finally {
          encoder.mockRestore();
        }
        const telemetry = runtime.getPerformanceTelemetry();
        expect(telemetry.fixedStep.totalCount).toBe(30);
        expect(telemetry.worldAdvanceStep.totalCount).toBe(3);
        await runtime.save();
        worldJson = repository.snapshot().worldJson;
        const digest = createHash("sha256").update(worldJson).digest("hex");
        if (process.env.TIDEWEFT_WORLD_ADVANCE_DIAGNOSTICS === "1") process.stdout.write(`world-advance-characterization ${JSON.stringify({
          seed, acceptedSteps: 30, advances: 3, saveBytes: Buffer.byteLength(worldJson), digest,
          habitatEncodes: [...inputs.values()].reduce((sum, count) => sum + count, 0),
          uniqueHabitatInputs: inputs.size, encodedCodeUnits,
          perInputEncodes: [...inputs.values()].sort((left, right) => left - right),
          durableSignalEncodes, durableSignalCodeUnits, durableDerivationCodeUnits,
          uniqueDurableHabitats: durableHabitats.size,
          perDurableHabitatEncodes: [...durableHabitats.values()].sort((left, right) => left - right),
        })}\n`);
        const envelope = JSON.parse(worldJson) as Record<string, unknown>;
        expect(envelope.version).toBe(50);
        expect(envelope.playerExpressionRecency).toEqual(createPlayerExpressionRecencyState(
          deserializeWorld(envelope.world as string).meta.rootSeed,
        ));
        const player = envelope.player as Record<string, unknown>;
        expect(player.animalCallKnowledge).toEqual(createPlayerAnimalCallKnowledge());
        expect(Object.hasOwn(envelope, "playerEffortRecency")).toBe(false);
        expect(envelope.integrity).toBe(gameSaveEnvelopeIntegrity(envelope));
        // These stationary inputs create no effort, footing or learned-call history.
        // Preserve the exact 6215116, 30-step oracle for every older root after
        // removing only the later combined recency root and additive player call
        // knowledge, restoring the outer version, and recomputing its seal.
        const { playerExpressionRecency: _recency, integrity: _integrity, ...v47Base } = envelope;
        const { animalCallKnowledge: _callKnowledge, ...v47Player } = player;
        v47Base.player = v47Player;
        v47Base.version = 47;
        const v47Json = JSON.stringify({ ...v47Base, integrity: gameSaveEnvelopeIntegrity(v47Base) });
        const v47Digest = createHash("sha256").update(v47Json).digest("hex");
        const baselineDigests: Readonly<Record<string, string>> = {
          "runtime baseline estuary": "6962f074f4c66d2c27ba23dfa7e49ad2cbf30d2782fa0b230f95107a6c3e96b7",
          "breathing room regional density 8": "e8fb77bbf910afd1066049afecda4ae3d588665634c0ffc1011bb10985827f1e",
        };
        expect(v47Digest).toBe(baselineDigests[seed]);
      } finally {
        runtime.destroy();
      }

      const controlRepository = new MemoryRepository();
      const control = await createTideweftRuntime(controlRepository);
      try {
        beginFreshWorld(control, seed);
        expect(control.getPerformanceTelemetry().fixedStep.enabled).toBe(false);
        expect(control.getPerformanceTelemetry().worldAdvanceStep.enabled).toBe(false);
        advancePlayerSteps(control, 30);
        await control.save();
        expect(controlRepository.snapshot().worldJson).toBe(worldJson);
      } finally {
        control.destroy();
      }
    },
  );

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
    expect(Object.isFrozen(before.resources)).toBe(true);
    expect(Object.isFrozen(before.resources.regions)).toBe(true);
    expect(Object.isFrozen(before.resources.caches)).toBe(true);
    expect(Object.isFrozen(before.resources.pending)).toBe(true);
    expect(Object.isFrozen(before.resources.limits)).toBe(true);
    expect(Object.isFrozen(before.resources.limits.regions)).toBe(true);
    expect(Object.isFrozen(before.resources.limits.caches)).toBe(true);
    expect(Object.isFrozen(before.resources.limits.pending)).toBe(true);
    expect(Object.isFrozen(before.fixedStep)).toBe(true);
    expect(Object.isFrozen(before.worldAdvancePhases)).toBe(true);
    expect(Object.keys(before.worldAdvancePhases).sort()).toEqual(WORLD_ADVANCE_PHASE_KEYS);
    for (const phase of Object.values(before.worldAdvancePhases)) {
      expect(Object.isFrozen(phase)).toBe(true);
      expect(phase.enabled).toBe(false);
      expect(phase.count).toBe(0);
      expect(phase.totalCount).toBe(0);
    }
    expect(before.fixedStep.enabled).toBe(false);
    expect(before.worldAdvanceStep.enabled).toBe(false);
    expect(before.viewProjection.enabled).toBe(false);
    expect(before.audioProjection.enabled).toBe(false);
    expect(before.saveSnapshot.enabled).toBe(false);
    expect(before.lastSerializedSaveBytes).toBe(0);
    expect(Object.keys(before.resources).sort()).toEqual([
      "caches",
      "limits",
      "pending",
      "regions",
    ]);
    expect(Object.keys(before.resources.regions).sort()).toEqual([
      "activeEcologyRegions",
      "chartedRegionRecords",
      "durableEcologyRegionRecords",
      "durableTerrainRegionRecords",
      "inactiveCargoRegionWorlds",
      "loadedTerrainRegions",
    ]);
    expect(Object.keys(before.resources.caches).sort()).toEqual([
      "activityAuthorityReceipts",
      "alpineHabitats",
      "alpineRidgeAuthorities",
      "breadthHabitats",
      "breadthPreparationSlots",
      "coldShoreHabitats",
      "outdoorIlluminationFields",
      "polarConsumerAuthorities",
      "polarConsumerHabitats",
      "polarShoreHabitats",
      "regionTerrainValues",
      "regionalHabitats",
      "registeredTerrainGeneratorRegions",
      "registeredTerrainGeneratorSeeds",
      "runtimeCompatibilityHabitats",
    ]);
    expect(Object.keys(before.resources.pending).sort()).toEqual([
      "activeSaveWorkers",
      "queuedCommands",
      "queuedSaveSnapshots",
      "registeredTerrainPrefetchJobs",
      "runtimeTerrainPrefetchJobs",
      "saveWaiters",
    ]);
    expect(Object.keys(before.resources.limits.regions).sort())
      .toEqual(Object.keys(before.resources.regions).sort());
    expect(Object.keys(before.resources.limits.caches).sort())
      .toEqual(Object.keys(before.resources.caches).sort());
    expect(Object.keys(before.resources.limits.pending).sort()).toEqual([
      "activeSaveWorkers",
      "queuedSaveSnapshots",
      "runtimeTerrainPrefetchJobs",
    ]);
    for (const count of [
      ...Object.values(before.resources.regions),
      ...Object.values(before.resources.caches),
      ...Object.values(before.resources.pending),
      ...Object.values(before.resources.limits.regions),
      ...Object.values(before.resources.limits.caches),
      ...Object.values(before.resources.limits.pending),
    ]) {
      expect(Number.isSafeInteger(count)).toBe(true);
      expect(count).toBeGreaterThanOrEqual(0);
    }
    for (const name of Object.keys(before.resources.regions) as Array<
      keyof typeof before.resources.regions
    >) {
      expect(before.resources.regions[name])
        .toBeLessThanOrEqual(before.resources.limits.regions[name]);
    }
    for (const name of Object.keys(before.resources.caches) as Array<
      keyof typeof before.resources.caches
    >) {
      expect(before.resources.caches[name])
        .toBeLessThanOrEqual(before.resources.limits.caches[name]);
    }
    expect(before.resources.pending.runtimeTerrainPrefetchJobs)
      .toBeLessThanOrEqual(before.resources.limits.pending.runtimeTerrainPrefetchJobs);
    expect(before.resources.pending.queuedSaveSnapshots)
      .toBeLessThanOrEqual(before.resources.limits.pending.queuedSaveSnapshots);
    expect(before.resources.pending.activeSaveWorkers)
      .toBeLessThanOrEqual(before.resources.limits.pending.activeSaveWorkers);
    expect(before.resources.limits.regions.loadedTerrainRegions).toBe(5);
    expect(before.resources.limits.regions.activeEcologyRegions).toBe(9);
    expect(before.resources.limits.regions.chartedRegionRecords).toBe(131_072);
    expect(before.resources.limits.regions.inactiveCargoRegionWorlds).toBe(131_071);
    expect(before.resources.limits.caches.regionTerrainValues).toBe(9);
    expect(before.resources.limits.caches.registeredTerrainGeneratorSeeds).toBe(2);
    expect(before.resources.limits.caches.registeredTerrainGeneratorRegions).toBe(24);
    expect(before.resources.limits.caches.outdoorIlluminationFields).toBe(4);
    expect(before.resources.limits.caches.regionalHabitats).toBe(128);
    expect(before.resources.limits.caches.runtimeCompatibilityHabitats).toBe(264);
    expect(before.resources.limits.caches.alpineRidgeAuthorities).toBe(64);
    expect(before.resources.limits.caches.polarConsumerAuthorities).toBe(64);
    expect(before.resources.limits.caches.activityAuthorityReceipts).toBe(128);
    expect(before.resources.limits.caches.breadthPreparationSlots).toBe(1);
    expect(before.resources.limits.pending.runtimeTerrainPrefetchJobs).toBe(9);
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
    for (const phase of Object.values(enabled.worldAdvancePhases)) {
      expect(phase.enabled).toBe(true);
    }
    expect(enabled.viewProjection.enabled).toBe(true);
    expect(enabled.audioProjection.enabled).toBe(true);
    expect(enabled.saveSnapshot.enabled).toBe(true);

    advancePlayerSteps(runtime, 10);
    const afterSteps = runtime.getPerformanceTelemetry();
    expect(afterSteps.fixedStep.count - before.fixedStep.count).toBe(10);
    expect(afterSteps.fixedStep.totalCount - before.fixedStep.totalCount).toBe(10);
    expect(afterSteps.worldAdvanceStep.count - before.worldAdvanceStep.count).toBe(1);
    expect(afterSteps.worldAdvanceStep.totalCount - before.worldAdvanceStep.totalCount).toBe(1);
    for (const phase of Object.values(afterSteps.worldAdvancePhases)) {
      expect(phase.count).toBe(afterSteps.worldAdvanceStep.count);
      expect(phase.totalCount).toBe(afterSteps.worldAdvanceStep.totalCount);
      expect(phase.meanMs).toBeGreaterThan(0);
    }
    const attributedWorldAdvanceMeanMs = Object.values(afterSteps.worldAdvancePhases)
      .reduce((total, phase) => total + phase.meanMs, 0);
    expect(attributedWorldAdvanceMeanMs).toBeLessThanOrEqual(
      afterSteps.worldAdvanceStep.meanMs,
    );
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
    expect(envelope).not.toHaveProperty("resources");
    expect(saved.worldJson).not.toContain('"lastSerializedSaveBytes"');

    const reset = runtime.resetPerformanceTelemetry();
    expect(Object.isFrozen(reset)).toBe(true);
    expect(reset.fixedStep.count).toBe(0);
    expect(reset.fixedStep.totalCount).toBe(0);
    expect(reset.fixedStep.enabled).toBe(true);
    expect(reset.worldAdvanceStep.count).toBe(0);
    expect(reset.worldAdvanceStep.totalCount).toBe(0);
    for (const phase of Object.values(reset.worldAdvancePhases)) {
      expect(phase.enabled).toBe(true);
      expect(phase.count).toBe(0);
      expect(phase.totalCount).toBe(0);
    }
    expect(reset.viewProjection.count).toBe(0);
    expect(reset.viewProjection.totalCount).toBe(0);
    expect(reset.audioProjection.count).toBe(0);
    expect(reset.audioProjection.totalCount).toBe(0);
    expect(reset.saveSnapshot.count).toBe(0);
    expect(reset.saveSnapshot.totalCount).toBe(0);
    expect(reset.counts).toEqual(afterSave.counts);
    expect(reset.resources).toEqual(afterSave.resources);
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

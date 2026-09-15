import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 120_000 });

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import { deserializeWorld } from "../sim/public";
import type { TideweftUIView } from "../ui/types";
import { gameSaveEnvelopeIntegrity } from "./physicalCargoState";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import type { GameSessionState } from "./sessionTypes";

vi.mock("../audio/soundscape", () => ({
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(): void {}
    updateAmbience(): void {}
    destroy(): void {}
  },
}));

interface CurrentGameSaveEnvelope extends Readonly<Record<string, unknown>> {
  readonly format: "tideweft-session";
  readonly version: 31;
  readonly world: string;
  readonly session: GameSessionState;
  readonly perceptionCarry: {
    readonly version: number;
    readonly playerStepsSinceWorldTick: number;
    readonly playerSenseSamples: readonly unknown[];
    readonly nextPlayerSenseSampleOrdinal: number;
  };
  readonly integrity: string;
}

const CURRENT_ENVELOPE_KEYS = [
  "bio0Ecology",
  "dogActorRoster",
  "fieldResources",
  "format",
  "integrity",
  "livingActorPlayerChoice",
  "perceptionCarry",
  "physicalCargo",
  "player",
  "porterResponse",
  "promiseJourney",
  "regionalEcology",
  "regionalTravel",
  "session",
  "settlementDomesticAnimalRecovery",
  "settlementEcology",
  "settlementWorkingAnimals",
  "traversalFeedback",
  "version",
  "world",
] as const;

class MemoryRepository implements SaveRepository {
  constructor(private record?: SaveRecord) {
    this.record = record ? structuredClone(record) : undefined;
  }

  async list() {
    return [];
  }

  async load(slotId: string): Promise<SaveRecord | undefined> {
    return slotId === "autosave" && this.record
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
    if (!this.record) throw new Error("WAIT runtime fixture has no autosave");
    return structuredClone(this.record);
  }
}

let scheduledFrame: ((now: number) => void) | undefined;
let nextFrameTime: number;

beforeEach(() => {
  scheduledFrame = undefined;
  nextFrameTime = 100;
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

function invokeScheduledFrame(): void {
  const callback = scheduledFrame;
  if (!callback) throw new Error("runtime did not schedule its next animation frame");
  scheduledFrame = undefined;
  callback(nextFrameTime);
  nextFrameTime += 100;
}

/** Ordinary play needs one presentation frame to establish its frame clock. */
function advanceOrdinaryFixedSteps(runtime: TideweftRuntime, count: number): void {
  runtime.start();
  invokeScheduledFrame();
  for (let step = 0; step < count; step += 1) invokeScheduledFrame();
  runtime.stop();
}

/** Active WAIT accepts exactly one ordinary fixed step from each RAF callback. */
function advanceWaitFrames(runtime: TideweftRuntime, count: number): void {
  runtime.start();
  for (let frame = 0; frame < count; frame += 1) invokeScheduledFrame();
  runtime.stop();
}

function decodeCurrent(record: SaveRecord): CurrentGameSaveEnvelope {
  const envelope = JSON.parse(record.worldJson) as CurrentGameSaveEnvelope;
  expect(record.payloadVersion).toBe(31);
  expect(envelope.format).toBe("tideweft-session");
  expect(envelope.version).toBe(31);
  expect(Object.keys(envelope).sort()).toEqual(CURRENT_ENVELOPE_KEYS);
  const { integrity, ...unsealed } = envelope;
  expect(integrity).toBe(gameSaveEnvelopeIntegrity(unsealed));
  return envelope;
}

function completedTick(envelope: CurrentGameSaveEnvelope): number {
  return deserializeWorld(envelope.world).meta.completedTick;
}

function playerStepPhase(envelope: CurrentGameSaveEnvelope): number {
  return envelope.perceptionCarry.playerStepsSinceWorldTick;
}

function waitControls(runtime: TideweftRuntime): NonNullable<TideweftUIView["controls"]> {
  const controls = runtime.getUIView().controls;
  if (!controls) throw new Error("runtime did not project its field controls");
  return controls;
}

/**
 * WAIT has one player-facing completion receipt. Remove only that receipt's
 * presentation fields; every persisted root that can affect future play stays
 * in the equality comparison.
 */
function authoritativeSaveRoots(envelope: CurrentGameSaveEnvelope): unknown {
  const {
    format: _format,
    version: _version,
    integrity: _integrity,
    session,
    ...roots
  } = envelope;
  const {
    announcement: _announcement,
    nextAnnouncementId: _nextAnnouncementId,
    sessionChanges: _sessionChanges,
    ...sessionAuthority
  } = session;
  return { ...roots, session: sessionAuthority };
}

async function beginFreshWorld(
  repository: MemoryRepository,
  seed: string,
): Promise<TideweftRuntime> {
  const runtime = await createTideweftRuntime(repository);
  runtime.dispatchUI({
    type: "new-world",
    seed,
    posture: "hearth",
    sessionShape: "wander",
  });
  expect(runtime.getUIView().title.visible).toBe(false);
  expect(waitControls(runtime)).toMatchObject({
    canWait: true,
    waitActive: false,
    waitLabel: "Wait 10 min",
  });
  return runtime;
}

describe("bounded runtime WAIT", () => {
  it("commits exactly 100 RAF-driven fixed steps, ignores a duplicate begin, and matches ordinary neutral play", async () => {
    const baselineRepository = new MemoryRepository();
    const setup = await beginFreshWorld(
      baselineRepository,
      "bounded wait ordinary authority",
    );

    // Begin from a non-zero persisted phase so +10 ticks alone cannot hide a
    // lost or rounded partial fixed-step interval.
    advanceOrdinaryFixedSteps(setup, 3);
    await setup.save();
    const baselineRecord = baselineRepository.snapshot();
    const baseline = decodeCurrent(baselineRecord);
    const baselineTick = completedTick(baseline);
    expect(playerStepPhase(baseline)).toBe(3);
    setup.destroy();

    // Both paths resume from the exact same durable candidate so load/session
    // normalization cannot masquerade as a WAIT-versus-ordinary difference.
    const waitRepository = new MemoryRepository(baselineRecord);
    const waiting = await createTideweftRuntime(waitRepository);
    expect(waitControls(waiting)).toMatchObject({
      canWait: true,
      waitActive: false,
      waitLabel: "Wait 10 min",
    });

    waiting.dispatchUI({ type: "wait", action: "begin" });
    advanceWaitFrames(waiting, 7);
    expect(waitControls(waiting).waitActive).toBe(true);

    // A second begin after real progress must neither restart nor extend the
    // existing bounded transaction.
    waiting.dispatchUI({ type: "wait", action: "begin" });
    advanceWaitFrames(waiting, 92);
    expect(waitControls(waiting).waitActive).toBe(true);
    advanceWaitFrames(waiting, 1);
    expect(waitControls(waiting)).toMatchObject({
      canWait: true,
      waitActive: false,
      waitLabel: "Wait 10 min",
    });

    await waiting.save();
    const waited = decodeCurrent(waitRepository.snapshot());
    expect(completedTick(waited)).toBe(baselineTick + 10);
    expect(playerStepPhase(waited)).toBe(3);
    waiting.destroy();

    const ordinaryRepository = new MemoryRepository(baselineRecord);
    const ordinary = await createTideweftRuntime(ordinaryRepository);
    advanceOrdinaryFixedSteps(ordinary, 100);
    await ordinary.save();
    const ordinarilyAdvanced = decodeCurrent(ordinaryRepository.snapshot());
    ordinary.destroy();

    expect(completedTick(ordinarilyAdvanced)).toBe(baselineTick + 10);
    expect(playerStepPhase(ordinarilyAdvanced)).toBe(3);
    expect(authoritativeSaveRoots(waited)).toEqual(
      authoritativeSaveRoots(ordinarilyAdvanced),
    );
  });

  it("preserves partial progress on cancel and reloads v31 idle without auto-resuming", async () => {
    const repository = new MemoryRepository();
    const runtime = await beginFreshWorld(
      repository,
      "bounded wait interruption continuity",
    );
    await runtime.save();
    const baseline = decodeCurrent(repository.snapshot());
    const baselineTick = completedTick(baseline);
    expect(playerStepPhase(baseline)).toBe(0);

    runtime.dispatchUI({ type: "wait", action: "begin" });
    advanceWaitFrames(runtime, 17);
    expect(waitControls(runtime).waitActive).toBe(true);
    await runtime.save();
    const activeRecord = repository.snapshot();
    const activeSave = decodeCurrent(activeRecord);
    expect(completedTick(activeSave)).toBe(baselineTick + 1);
    expect(playerStepPhase(activeSave)).toBe(7);
    expect(Object.hasOwn(activeSave, "pendingPlayerWait")).toBe(false);

    // Chart and Relief both map Escape/right-click to the same renderer cancel
    // command, so this proves the shared field interruption owner rather than a
    // separate view-specific timer.
    runtime.dispatchRenderer({ type: "cancel" });
    runtime.dispatchRenderer({ type: "cancel" });
    expect(waitControls(runtime)).toMatchObject({
      canWait: true,
      waitActive: false,
      waitLabel: "Wait 10 min",
    });
    runtime.dispatchUI({ type: "wait", action: "begin" });
    runtime.dispatchUI({ type: "wait", action: "cancel" });
    await runtime.save();
    const cancelledSave = decodeCurrent(repository.snapshot());
    expect(completedTick(cancelledSave)).toBe(baselineTick + 1);
    expect(playerStepPhase(cancelledSave)).toBe(7);
    expect(authoritativeSaveRoots(cancelledSave)).toEqual(
      authoritativeSaveRoots(activeSave),
    );
    runtime.destroy();

    // Reload the snapshot taken while WAIT was visibly active. The transient
    // receipt must be absent, and even the first RAF callback must use ordinary
    // idle framing instead of silently accepting another elapsed step.
    const reloadRepository = new MemoryRepository(activeRecord);
    const reloaded = await createTideweftRuntime(reloadRepository);
    expect(waitControls(reloaded)).toMatchObject({
      canWait: true,
      waitActive: false,
      waitLabel: "Wait 10 min",
    });
    reloaded.start();
    invokeScheduledFrame();
    reloaded.stop();
    expect(waitControls(reloaded).waitActive).toBe(false);
    await reloaded.save();
    const afterIdleFrame = decodeCurrent(reloadRepository.snapshot());
    expect(completedTick(afterIdleFrame)).toBe(baselineTick + 1);
    expect(playerStepPhase(afterIdleFrame)).toBe(7);
    reloaded.destroy();
  });
});

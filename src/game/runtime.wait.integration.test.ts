import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 120_000 });

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import { deserializeWorld } from "../sim/public";
import type { TideweftUIView } from "../ui/types";
import { gameSaveEnvelopeIntegrity } from "./physicalCargoState";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import type { GameSessionState } from "./sessionTypes";
import * as situatedExpressionChannelBank from "./situatedExpressionChannelBank";

const soundscapePlay = vi.hoisted(() => vi.fn());

vi.mock("../audio/soundscape", () => ({
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(...args: unknown[]): void { soundscapePlay(...args); }
    updateAmbience(): void {}
    destroy(): void {}
  },
}));

interface CurrentGameSaveEnvelope extends Readonly<Record<string, unknown>> {
  readonly format: "tideweft-session";
  readonly version: 49;
  readonly world: string;
  readonly session: GameSessionState;
  readonly perceptionCarry: {
    readonly version: 14;
    readonly intervalStartPosition: unknown;
    readonly intervalStartFacingMilliRadians: number;
    readonly intervalStartWasSleeping: boolean;
    readonly playerStepsSinceWorldTick: number;
    readonly playerSenseSamples: readonly unknown[];
    readonly actorVocalizationSamples: readonly unknown[];
    readonly animalContactAcousticCarry: unknown;
    readonly situatedExpressionChannels: unknown;
    readonly situatedExpressionAdmissions: unknown;
    readonly situatedExpressionCausalAuthority: unknown;
    readonly nextPlayerSenseSampleOrdinal: number;
  };
  readonly playerExpressionRecency: unknown;
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
  "playerExpressionRecency",
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
  soundscapePlay.mockReset();
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

function invokeScheduledFrame(frameDeltaMs = 100): void {
  const callback = scheduledFrame;
  if (!callback) throw new Error("runtime did not schedule its next animation frame");
  scheduledFrame = undefined;
  callback(nextFrameTime);
  nextFrameTime += frameDeltaMs;
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

/** Advances the same elapsed presentation time at one exact render cadence. */
function advanceOrdinaryElapsedTime(
  runtime: TideweftRuntime,
  elapsedMs: number,
  frameDeltaMs: number,
): void {
  if (elapsedMs % frameDeltaMs !== 0) {
    throw new Error("frame cadence fixture requires an exact elapsed-time division");
  }
  runtime.start();
  invokeScheduledFrame(frameDeltaMs);
  for (let elapsed = 0; elapsed < elapsedMs; elapsed += frameDeltaMs) {
    invokeScheduledFrame(frameDeltaMs);
  }
  runtime.stop();
}

function decodeCurrent(record: SaveRecord): CurrentGameSaveEnvelope {
  const envelope = JSON.parse(record.worldJson) as CurrentGameSaveEnvelope;
  expect(record.payloadVersion).toBe(49);
  expect(envelope.format).toBe("tideweft-session");
  expect(envelope.version).toBe(49);
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
  it.each([false, true])("releases WAIT completion audio only after its final interval commits (reject=%s)", async (reject) => {
    const repository = new MemoryRepository();
    const runtime = await beginFreshWorld(repository, "bounded wait ordinary authority");
    await runtime.save();
    const baselineTick = completedTick(decodeCurrent(repository.snapshot()));
    runtime.dispatchUI({ type: "wait", action: "begin" });
    // Beginning the action is already an immediate accepted input. Only its
    // later fixed-step completion belongs to the enclosing tick transaction.
    expect(soundscapePlay.mock.calls).toContainEqual(["rest", 0.42]);
    advanceWaitFrames(runtime, 99);
    expect(waitControls(runtime).waitActive).toBe(true);
    await runtime.save();
    const beforeRecord = repository.snapshot();
    const before = decodeCurrent(beforeRecord);
    expect(completedTick(before)).toBe(baselineTick + 9);
    expect(playerStepPhase(before)).toBe(9);
    const completionChanges = (session: GameSessionState) => session.sessionChanges
      .filter((change) => change.startsWith("Waited ten minutes;"));
    expect(completionChanges(before.session)).toEqual([]);

    const close = situatedExpressionChannelBank.closeSituatedExpressionChannelBankInterval;
    let closureCalls = 0;
    let closureCommitted = false;
    let completionAudioInsideClosure = false;
    let completionWasPresented = false;
    const releaseCommitStates: boolean[] = [];
    const completionAudio = () => soundscapePlay.mock.calls.filter(([cue]) => cue === "rest");
    soundscapePlay.mockReset();
    soundscapePlay.mockImplementation((cue: string) => {
      if (cue === "rest") releaseCommitStates.push(closureCommitted);
    });
    vi.spyOn(
      situatedExpressionChannelBank,
      "closeSituatedExpressionChannelBankInterval",
    ).mockImplementation((...args) => {
      closureCalls += 1;
      completionWasPresented ||= waitControls(runtime).waitActive === false
        && (runtime.getUIView().announcement?.message.startsWith("Ten minutes pass.") ?? false);
      completionAudioInsideClosure ||= completionAudio().length > 0;
      if (reject) return null;
      const closed = close(...args);
      closureCommitted = closed !== null;
      return closed;
    });
    // Keep this live receipt: reloading the 99-step save deliberately drops
    // transient WAIT and would not exercise the real completion producer.
    advanceWaitFrames(runtime, 1);
    await Promise.resolve();
    expect(closureCalls).toBe(1);
    expect(completionWasPresented).toBe(true);
    expect(completionAudioInsideClosure).toBe(false);
    expect(completionAudio()).toEqual(reject ? [] : [["rest", 0.7, 0, undefined]]);
    expect(releaseCommitStates).toEqual(reject ? [] : [true]);
    expect(waitControls(runtime).waitActive).toBe(false);
    if (reject) {
      expect(runtime.getUIView().announcement?.message).toContain("INTEGRITY HALT");
      expect(waitControls(runtime).canWait).toBe(false);
      expect(soundscapePlay.mock.calls).toContainEqual(["warning", 1]);
      expect(repository.snapshot()).toEqual(beforeRecord);
    }
    await runtime.save();
    const after = decodeCurrent(repository.snapshot());
    expect(completedTick(after)).toBe(baselineTick + (reject ? 9 : 10));
    expect(playerStepPhase(after)).toBe(reject ? 9 : 0);
    expect(completionChanges(after.session)).toHaveLength(reject ? 0 : 1);
    if (reject) {
      const { session: _beforeSession, integrity: _beforeIntegrity, ...beforeRoots } = before;
      const { session: _afterSession, integrity: _afterIntegrity, ...afterRoots } = after;
      expect(afterRoots).toEqual(beforeRoots);
      // Only the explicit integrity halt may change session presentation.
      // Keep sessionChanges in the comparison so rejected completion cannot
      // leave a false ten-minute receipt behind.
      const { paused: _beforePaused, announcement: _beforeAnnouncement, nextAnnouncementId: _beforeAnnouncementId, ...beforeSession } = before.session;
      const { paused: _afterPaused, announcement: _afterAnnouncement, nextAnnouncementId: _afterAnnouncementId, ...afterSession } = after.session;
      expect(afterSession).toEqual(beforeSession);
    }
    runtime.destroy();
    soundscapePlay.mockReset();
    const reloaded = await createTideweftRuntime(repository);
    expect(reloaded.getUIView().title.hasSave).toBe(true);
    expect(waitControls(reloaded).waitActive).toBe(false);
    expect(completionAudio()).toEqual([]);
    await reloaded.save();
    const restored = decodeCurrent(repository.snapshot());
    expect(restored.world).toBe(after.world);
    expect(restored.physicalCargo).toEqual(after.physicalCargo);
    expect(completedTick(restored)).toBe(completedTick(after));
    expect(playerStepPhase(restored)).toBe(playerStepPhase(after));
    // Reload deliberately starts a new session recap, not another WAIT. The
    // completed world/phase survives; its transient summary is not replayed.
    expect(restored.session.sessionChanges).toEqual([]);
    expect(restored.session.sessionPlayMilliseconds).toBe(0);
    reloaded.destroy();
  });

  it("produces identical authoritative state across two ordinary render cadences", async () => {
    const setupRepository = new MemoryRepository();
    const setup = await beginFreshWorld(
      setupRepository,
      "turning day frame cadence equality",
    );
    await setup.save();
    const baselineRecord = setupRepository.snapshot();
    const baselineTick = completedTick(decodeCurrent(baselineRecord));
    setup.destroy();

    const slowRepository = new MemoryRepository(baselineRecord);
    const slow = await createTideweftRuntime(slowRepository);
    advanceOrdinaryElapsedTime(slow, 1_000, 100);
    await slow.save();
    const slowState = decodeCurrent(slowRepository.snapshot());
    slow.destroy();

    // Reset only the presentation clock; both runtimes start from the same
    // exact durable world and receive the same 1,000 ms of neutral play.
    scheduledFrame = undefined;
    nextFrameTime = 100;
    const fastRepository = new MemoryRepository(baselineRecord);
    const fast = await createTideweftRuntime(fastRepository);
    advanceOrdinaryElapsedTime(fast, 1_000, 20);
    await fast.save();
    const fastState = decodeCurrent(fastRepository.snapshot());
    fast.destroy();

    expect(completedTick(slowState)).toBe(baselineTick + 1);
    expect(completedTick(fastState)).toBe(baselineTick + 1);
    expect(playerStepPhase(slowState)).toBe(0);
    expect(playerStepPhase(fastState)).toBe(0);
    expect(authoritativeSaveRoots(fastState)).toEqual(authoritativeSaveRoots(slowState));
  });

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

  it("preserves partial progress on cancel and reloads current saves idle without auto-resuming", async () => {
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

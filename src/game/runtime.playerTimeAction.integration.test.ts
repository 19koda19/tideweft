import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 120_000 });

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import {
  WORLD_DAWN_START_TICK,
  WORLD_TICKS_PER_DAY,
  assertWorldInvariants,
  createWorld,
  createWorldView,
  deserializeWorld,
  runTicks,
  serializeWorld,
} from "../sim/public";
import type { TideweftUIView } from "../ui/types";
import { gameSaveEnvelopeIntegrity } from "./physicalCargoState";
import { createPlayer, type PlayerState } from "./player";
import * as playerTimeAction from "./playerTimeAction";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import { createSessionState, type GameSessionState } from "./sessionTypes";
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
  readonly version: 48;
  readonly world: string;
  readonly player: PlayerState;
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
  readonly playerEffortRecency: unknown;
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
  "playerEffortRecency",
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
    if (!this.record) throw new Error("player-time-action fixture has no autosave");
    return structuredClone(this.record);
  }
}

let scheduledFrame: ((now: number) => void) | undefined;
let nextFrameTime: number;

beforeEach(() => {
  soundscapePlay.mockReset();
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

/** Active recovery accepts one bounded ten-step batch from each RAF callback. */
function advanceRecoveryFrames(runtime: TideweftRuntime, count: number): void {
  runtime.start();
  for (let frame = 0; frame < count; frame += 1) invokeScheduledFrame();
  runtime.stop();
}

function decodeCurrent(record: SaveRecord): CurrentGameSaveEnvelope {
  const envelope = JSON.parse(record.worldJson) as CurrentGameSaveEnvelope;
  expect(record.payloadVersion).toBe(48);
  expect(envelope.format).toBe("tideweft-session");
  expect(envelope.version).toBe(48);
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

function recoveryControls(runtime: TideweftRuntime): NonNullable<TideweftUIView["controls"]> {
  const controls = runtime.getUIView().controls;
  if (!controls) throw new Error("runtime did not project its field controls");
  return controls;
}

function reseal(
  source: SaveRecord,
  transform: (envelope: Record<string, unknown>) => void,
): SaveRecord {
  const decoded = JSON.parse(source.worldJson) as Record<string, unknown>;
  delete decoded.integrity;
  transform(decoded);
  const integrity = gameSaveEnvelopeIntegrity(decoded);
  const version = decoded.version;
  if (!Number.isSafeInteger(version)) throw new Error("fixture produced no save version");
  return {
    ...structuredClone(source),
    payloadVersion: version as number,
    worldJson: JSON.stringify({ ...decoded, integrity }),
  };
}

/**
 * REST owns only its durable receipt and player-facing announcement. Remove
 * those surfaces while retaining every world, actor, cargo, and timing root.
 */
function authorityWithoutRecoveryReceipt(envelope: CurrentGameSaveEnvelope): unknown {
  const {
    format: _format,
    version: _version,
    integrity: _integrity,
    player,
    session,
    ...roots
  } = envelope;
  const {
    announcement: _announcement,
    nextAnnouncementId: _nextAnnouncementId,
    sessionChanges: _sessionChanges,
    ...sessionAuthority
  } = session;
  return {
    ...roots,
    player: { ...player, timeAction: null },
    session: sessionAuthority,
  };
}

async function freshSavedWorld(seed: string): Promise<SaveRecord> {
  const repository = new MemoryRepository();
  const runtime = await createTideweftRuntime(repository);
  runtime.dispatchUI({
    type: "new-world",
    seed,
    posture: "hearth",
    sessionShape: "wander",
  });
  expect(runtime.getUIView().title.visible).toBe(false);
  await runtime.save();
  const record = repository.snapshot();
  runtime.destroy();
  return record;
}

/**
 * Advance an ordinary legacy world to two minutes before its second dawn,
 * then let the production loader derive every modern sidecar at that exact
 * tick. No clock, weather, ecology, or player receipt is forged.
 */
function nightSettlementLegacyRecord(seed: string): SaveRecord {
  const world = createWorld(seed, "wild");
  const startingTick = WORLD_TICKS_PER_DAY + WORLD_DAWN_START_TICK - 2;
  runTicks(world, startingTick - world.meta.completedTick);
  assertWorldInvariants(world);
  const fullPlayer = createPlayer(createWorldView(world));
  const { timeAction: _futureTimeAction, ...legacyPlayer } = fullPlayer;
  const session = createSessionState(seed, "gale", "wander");
  session.paused = false;
  session.titleVisible = false;
  return {
    slotId: "autosave",
    label: "Player sleep dawn authority",
    seed,
    updatedAt: 1,
    playTicks: world.meta.completedTick,
    settlementCount: world.settlements.length,
    connectedCount: world.routes.filter((route) => route.traceStrength >= 120_000).length,
    worldJson: JSON.stringify({
      format: "tideweft-session",
      version: 1,
      world: serializeWorld(world),
      player: legacyPlayer,
      session,
    }),
  };
}

describe("runtime player REST/SLEEP authority", () => {
  it.each([false, true])("releases real SLEEP completion audio only after its final interval commits (reject=%s)", async (reject) => {
    const repository = new MemoryRepository(nightSettlementLegacyRecord("player sleep dawn authority"));
    let runtime: TideweftRuntime | null = await createTideweftRuntime(repository);
    try {
      // Real ordinary steps establish phase nine; the unchanged recovery
      // authority therefore needs eleven steps to reach actual dawn.
      advanceOrdinaryFixedSteps(runtime, 9);
      runtime.dispatchUI({ type: "recover", action: "begin" });
      expect(soundscapePlay.mock.calls).toContainEqual(["rest", 0.5]);
      expect(recoveryControls(runtime)).toMatchObject({ recoveryActive: true, recoveryKind: "sleep" });
      advanceRecoveryFrames(runtime, 1);
      await runtime.save();
      const partial = decodeCurrent(repository.snapshot());
      expect(completedTick(partial)).toBe(WORLD_TICKS_PER_DAY + WORLD_DAWN_START_TICK - 1);
      expect(playerStepPhase(partial)).toBe(9);
      expect(partial.player.timeAction).toMatchObject({
        kind: "sleep", startedAtPlayerStepPhase: 9, totalSteps: 11, completedSteps: 10,
      });
      expect(partial.perceptionCarry).toMatchObject({ version: 14, intervalStartWasSleeping: true });
      runtime.destroy();
      runtime = null;
      scheduledFrame = undefined;
      soundscapePlay.mockReset();
      runtime = await createTideweftRuntime(repository);
      expect(runtime.getUIView().saveWarning).toBeUndefined();
      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "rest")).toEqual([]);
      await runtime.save();
      const beforeRecord = repository.snapshot();
      const before = decodeCurrent(beforeRecord);
      expect(before.perceptionCarry).toMatchObject({ version: 14, intervalStartWasSleeping: true });
      const completionChanges = (session: GameSessionState) => session.sessionChanges
        .filter((change) => change.startsWith("Slept at "));
      expect(completionChanges(before.session)).toEqual([]);

      const advance = playerTimeAction.advancePlayerTimeActionOneStep;
      let realCompletions = 0;
      vi.spyOn(playerTimeAction, "advancePlayerTimeActionOneStep").mockImplementation((...args) => {
        const result = advance(...args);
        if (result?.status === "complete") {
          expect(args[0]).toEqual(before.player.timeAction);
          realCompletions += 1;
        }
        return result;
      });
      const close = situatedExpressionChannelBank.closeSituatedExpressionChannelBankInterval;
      let closureCalls = 0;
      let closureCommitted = false;
      let completionAudioInsideClosure = false;
      const releaseCommitStates: boolean[] = [];
      const completionAudio = () => soundscapePlay.mock.calls.filter(
        ([cue, volume]) => cue === "rest" && volume === 0.82,
      );
      soundscapePlay.mockReset();
      soundscapePlay.mockImplementation((cue: string, volume: number) => {
        if (cue === "rest" && volume === 0.82) releaseCommitStates.push(closureCommitted);
      });
      vi.spyOn(situatedExpressionChannelBank, "closeSituatedExpressionChannelBankInterval")
        .mockImplementation((...args) => {
          closureCalls += 1;
          expect(realCompletions).toBe(1);
          completionAudioInsideClosure ||= completionAudio().length > 0;
          if (reject) return null;
          const closed = close(...args);
          closureCommitted = closed !== null;
          return closed;
        });
      const automaticWrite = vi.spyOn(repository, "save");
      advanceRecoveryFrames(runtime, 1);
      await Promise.resolve();
      expect(realCompletions).toBe(1);
      expect(closureCalls).toBe(1);
      expect(completionAudioInsideClosure).toBe(false);
      expect(completionAudio()).toEqual(reject ? [] : [["rest", 0.82, 0, undefined]]);
      expect(releaseCommitStates).toEqual(reject ? [] : [true]);
      expect(recoveryControls(runtime).recoveryActive).toBe(false);

      // Recovery's existing automatic save records either committed dawn or
      // restored halt/cancellation, never a rejected completion transaction.
      expect(automaticWrite).toHaveBeenCalledTimes(1);
      const after = decodeCurrent(repository.snapshot());
      expect(after.perceptionCarry).toMatchObject({ version: 14, intervalStartWasSleeping: true });
      expect(completedTick(after)).toBe(completedTick(before) + (reject ? 0 : 1));
      expect(playerStepPhase(after)).toBe(reject ? 9 : 0);
      expect(after.player.timeAction).toBeNull();
      expect(completionChanges(after.session)).toHaveLength(reject ? 0 : 1);
      if (reject) {
        expect(runtime.getUIView().announcement?.message).toContain("INTEGRITY HALT");
        expect(soundscapePlay.mock.calls).toContainEqual(["warning", 1]);
        const { session: _beforeSession, integrity: _beforeIntegrity, ...beforeRoots } = before;
        const { session: _afterSession, integrity: _afterIntegrity, ...afterRoots } = after;
        expect(afterRoots).toEqual({ ...beforeRoots, player: { ...before.player, timeAction: null } });
        const { paused: _beforePaused, announcement: _beforeAnnouncement, nextAnnouncementId: _beforeId, ...beforeSession } = before.session;
        const { paused: _afterPaused, announcement: _afterAnnouncement, nextAnnouncementId: _afterId, ...afterSession } = after.session;
        expect(afterSession).toEqual(beforeSession);
      } else {
        expect(runtime.getUIView().clock.timeLabel).toBe("06:00 · Dawn");
        expect(runtime.getUIView().announcement?.message).toContain("Dawn reaches the settlement at 06:00");
      }
      runtime.destroy();
      runtime = null;
      scheduledFrame = undefined;
      soundscapePlay.mockReset();
      runtime = await createTideweftRuntime(repository);
      expect(runtime.getUIView().saveWarning).toBeUndefined();
      expect(completionAudio()).toEqual([]);
      await runtime.save();
      const restored = decodeCurrent(repository.snapshot());
      expect(restored.perceptionCarry).toMatchObject({ version: 14, intervalStartWasSleeping: true });
      const { session: _afterSession, integrity: _afterIntegrity, ...afterRoots } = after;
      const { session: _restoredSession, integrity: _restoredIntegrity, ...restoredRoots } = restored;
      expect(restoredRoots).toEqual(afterRoots);
      expect(restored.session.sessionChanges).toEqual([]);
      if (!reject) {
        advanceOrdinaryFixedSteps(runtime, 1);
        await runtime.save();
        expect(playerStepPhase(decodeCurrent(repository.snapshot()))).toBe(1);
        expect(completionAudio()).toEqual([]);
      }
    } finally {
      runtime?.destroy();
      scheduledFrame = undefined;
    }
  });

  it("advances REST through ordinary fixed steps, persists exact partial progress, resumes, and cancels", async () => {
    const fresh = await freshSavedWorld("player rest ordinary authority");
    const tiredRecord = reseal(fresh, (envelope) => {
      const player = envelope.player as Record<string, unknown>;
      player.stamina = 800_000;
    });

    // Begin from a non-zero phase so persistence cannot conceal rounded or
    // skipped partial fixed-step time.
    const setupRepository = new MemoryRepository(tiredRecord);
    const setup = await createTideweftRuntime(setupRepository);
    advanceOrdinaryFixedSteps(setup, 3);
    await setup.save();
    const baselineRecord = setupRepository.snapshot();
    const baseline = decodeCurrent(baselineRecord);
    const baselineTick = completedTick(baseline);
    expect(playerStepPhase(baseline)).toBe(3);
    setup.destroy();

    const restingRepository = new MemoryRepository(baselineRecord);
    const resting = await createTideweftRuntime(restingRepository);
    expect(recoveryControls(resting)).toMatchObject({
      canRecover: true,
      recoveryActive: false,
      recoveryKind: "rest",
      recoveryLabel: "REST 30 MIN",
    });
    resting.dispatchUI({ type: "recover", action: "begin" });
    expect(recoveryControls(resting)).toMatchObject({
      canRecover: true,
      recoveryActive: true,
      recoveryKind: "rest",
    });
    expect(resting.getRenderView().player.recoveryKind).toBe("rest");
    advanceRecoveryFrames(resting, 1);
    await resting.save();
    const partialRecord = restingRepository.snapshot();
    const partial = decodeCurrent(partialRecord);
    expect(completedTick(partial)).toBe(baselineTick + 1);
    expect(playerStepPhase(partial)).toBe(3);
    expect(partial.player.timeAction).toMatchObject({
      kind: "rest",
      startedAtWorldTick: baselineTick,
      startedAtPlayerStepPhase: 3,
      completedSteps: 10,
      totalSteps: 300,
    });
    resting.destroy();

    // Ten ordinary stationary steps from the same save must yield every same
    // authoritative consequence once the action receipt itself is ignored.
    const ordinaryRepository = new MemoryRepository(baselineRecord);
    const ordinary = await createTideweftRuntime(ordinaryRepository);
    advanceOrdinaryFixedSteps(ordinary, 10);
    await ordinary.save();
    const ordinaryResult = decodeCurrent(ordinaryRepository.snapshot());
    ordinary.destroy();
    expect(authorityWithoutRecoveryReceipt(partial)).toEqual(
      authorityWithoutRecoveryReceipt(ordinaryResult),
    );

    // Loading performs no offline advancement and retains the exact active
    // receipt. The next presented batch resumes from, rather than restarts,
    // the same fixed-step phase.
    const reloadRepository = new MemoryRepository(partialRecord);
    const reloaded = await createTideweftRuntime(reloadRepository);
    expect(recoveryControls(reloaded)).toMatchObject({
      canRecover: true,
      recoveryActive: true,
      recoveryKind: "rest",
    });
    await reloaded.save();
    const beforeResume = decodeCurrent(reloadRepository.snapshot());
    expect(completedTick(beforeResume)).toBe(baselineTick + 1);
    expect(playerStepPhase(beforeResume)).toBe(3);
    expect(beforeResume.player.timeAction?.completedSteps).toBe(10);

    reloaded.dispatchUI({ type: "recover", action: "suspend" });
    advanceRecoveryFrames(reloaded, 1);
    await reloaded.save();
    const suspended = decodeCurrent(reloadRepository.snapshot());
    expect(completedTick(suspended)).toBe(baselineTick + 1);
    expect(playerStepPhase(suspended)).toBe(3);
    expect(suspended.player.timeAction?.completedSteps).toBe(10);

    reloaded.dispatchUI({ type: "recover", action: "resume" });
    advanceRecoveryFrames(reloaded, 1);
    await reloaded.save();
    const resumed = decodeCurrent(reloadRepository.snapshot());
    expect(completedTick(resumed)).toBe(baselineTick + 2);
    expect(playerStepPhase(resumed)).toBe(3);
    expect(resumed.player.timeAction?.completedSteps).toBe(20);

    reloaded.dispatchUI({ type: "recover", action: "cancel" });
    expect(recoveryControls(reloaded)).toMatchObject({
      recoveryActive: false,
      recoveryKind: "rest",
      recoveryLabel: "REST 30 MIN",
    });
    await reloaded.save();
    expect(decodeCurrent(reloadRepository.snapshot()).player.timeAction).toBeNull();
    reloaded.destroy();
  });

  it("migrates an exact v31 player to explicit null recovery authority", async () => {
    const current = await freshSavedWorld("player recovery v31 migration");
    const legacy = reseal(current, (envelope) => {
      envelope.version = 31;
      delete envelope.playerEffortRecency;
      const player = envelope.player as Record<string, unknown>;
      delete player.timeAction;
      const carry = envelope.perceptionCarry as Record<string, unknown>;
      carry.version = 1;
      delete carry.animalContactAcousticCarry;
      delete carry.actorVocalizationSamples;
      delete carry.intervalStartFacingMilliRadians;
      delete carry.intervalStartPosition;
      delete carry.intervalStartWasSleeping;
      delete carry.playerStepStateSamples;
      delete carry.playerStepStateAnchor;
      delete carry.situatedExpressionAdmissions;
      delete carry.situatedExpressionCausalAuthority;
      delete carry.situatedExpressionChannels;
    });
    expect(legacy.payloadVersion).toBe(31);

    const repository = new MemoryRepository(legacy);
    const migrated = await createTideweftRuntime(repository);
    expect(migrated.getUIView().saveWarning).toBeUndefined();
    await migrated.save();
    const saved = decodeCurrent(repository.snapshot());
    expect(saved.player.timeAction).toBeNull();
    migrated.destroy();
  });

  it("does not accelerate a queued resident observation into knowledge while resting", async () => {
    const fresh = await freshSavedWorld("player recovery waits for perception receipts");
    const tiredRecord = reseal(fresh, (envelope) => {
      const player = envelope.player as Record<string, unknown>;
      player.stamina = 800_000;
    });
    const runtime = await createTideweftRuntime(new MemoryRepository(tiredRecord));
    const porter = runtime.getRenderView().porters[0];
    if (!porter) throw new Error("recovery receipt fixture has no directly visible porter");

    runtime.dispatchRenderer({
      type: "select",
      entity: "porter",
      id: porter.id,
      point: porter.position,
    });
    expect(runtime.getUIView().selectedResident?.knowledgeLabel).toBe("Unfamiliar");

    runtime.dispatchUI({ type: "recover", action: "begin" });
    expect(recoveryControls(runtime)).toMatchObject({
      recoveryActive: false,
      recoveryKind: "rest",
    });
    expect(runtime.getUIView().announcement?.message).toBe(
      "Let the current interaction settle before recovering.",
    );
    runtime.destroy();
  });

  it("saves a real settlement SLEEP mid-action and resumes to exact dawn", async () => {
    const seed = "player sleep dawn authority";
    const repository = new MemoryRepository(nightSettlementLegacyRecord(seed));
    const sleeping = await createTideweftRuntime(repository);
    expect(sleeping.getUIView().clock).toMatchObject({
      day: 2,
      timeLabel: "05:58 · Night",
      phase: "night",
    });
    expect(recoveryControls(sleeping)).toMatchObject({
      canRecover: true,
      recoveryActive: false,
      recoveryKind: "sleep",
      recoveryLabel: "SLEEP TO DAWN",
    });

    sleeping.dispatchUI({ type: "recover", action: "begin" });
    expect(sleeping.getRenderView().player.recoveryKind).toBe("sleep");
    expect(recoveryControls(sleeping)).toMatchObject({
      canInteract: false,
      interactLabel: "Wake to interact",
    });
    advanceRecoveryFrames(sleeping, 1);
    await sleeping.save();
    const partialRecord = repository.snapshot();
    const partial = decodeCurrent(partialRecord);
    expect(completedTick(partial)).toBe(WORLD_TICKS_PER_DAY + WORLD_DAWN_START_TICK - 1);
    expect(playerStepPhase(partial)).toBe(0);
    expect(partial.player.timeAction).toMatchObject({
      kind: "sleep",
      startedAtWorldTick: WORLD_TICKS_PER_DAY + WORLD_DAWN_START_TICK - 2,
      startedAtPlayerStepPhase: 0,
      targetWorldTick: WORLD_TICKS_PER_DAY + WORLD_DAWN_START_TICK,
      totalSteps: 20,
      completedSteps: 10,
    });
    expect(partial.perceptionCarry.intervalStartWasSleeping).toBe(true);
    sleeping.destroy();

    const reloadedRepository = new MemoryRepository(partialRecord);
    const reloaded = await createTideweftRuntime(reloadedRepository);
    expect(reloaded.getUIView().clock.timeLabel).toBe("05:59 · Night");
    expect(recoveryControls(reloaded)).toMatchObject({
      recoveryActive: true,
      recoveryKind: "sleep",
      canInteract: false,
      interactLabel: "Wake to interact",
    });
    await reloaded.save();
    const unchangedSleep = decodeCurrent(reloadedRepository.snapshot());
    expect(unchangedSleep.player.timeAction).toEqual(partial.player.timeAction);
    expect(unchangedSleep.perceptionCarry.intervalStartWasSleeping).toBe(true);

    advanceRecoveryFrames(reloaded, 1);
    expect(reloaded.getUIView().clock).toMatchObject({
      day: 2,
      timeLabel: "06:00 · Dawn",
      phase: "dawn",
    });
    expect(reloaded.getRenderView().player.recoveryKind).toBeUndefined();
    expect(recoveryControls(reloaded)).toMatchObject({
      recoveryActive: false,
      recoveryKind: "rest",
    });
    expect(reloaded.getUIView().announcement?.message).toContain(
      "Dawn reaches the settlement at 06:00",
    );
    await reloaded.save();
    const dawn = decodeCurrent(reloadedRepository.snapshot());
    expect(completedTick(dawn)).toBe(WORLD_TICKS_PER_DAY + WORLD_DAWN_START_TICK);
    expect(playerStepPhase(dawn)).toBe(0);
    expect(dawn.player.timeAction).toBeNull();
    expect(dawn.perceptionCarry.intervalStartWasSleeping).toBe(true);
    reloaded.destroy();
  });
});

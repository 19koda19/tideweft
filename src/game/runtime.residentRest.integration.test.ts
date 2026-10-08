import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import { assertWorldInvariants, createWorldView, deserializeWorld, FIXED_POINT, serializeWorld, type ResidentState } from "../sim/public";
import {
  RESIDENT_ACTIVITY_OWNER_ID,
  RESIDENT_ACTIVITY_VERSION,
  RESIDENT_REST_APPROACH_STEP_UNITS,
  RESIDENT_INSPECTION_ACTIVITY_VERSION,
  RESIDENT_SERVICE_ACTIVITY_OWNER_ID,
  RESIDENT_SERVICE_ACTIVITY_VERSION,
} from "../sim/residentActivity";
import { residentRestTargetHasDrySupport, residentSettlementRestTarget } from "../sim/residentActivityWorld";
import { queryResidentAttentionState } from "../sim/residentAttention";
import { stableStringify } from "../sim/util";
import { deserializeBio0Ecology } from "./bio0Ecology";
import { livingActorAddressForResident } from "./livingActor";
import { gameSaveEnvelopeIntegrity } from "./physicalCargoState";
import type { PlayerState } from "./player";
import { restorePlayerRegionalTravel } from "./regionalPlayerTravel";
import * as residentActivityExecution from "./residentActivityExecution";
import * as simulation from "../sim/public";
import * as situatedExpressionChannelBank from "./situatedExpressionChannelBank";
import * as residentIntroductionAuthority from "./residentIntroductionAdmissionAuthority";
import { observableResidentRationUse, RESIDENT_CONVERSATION_RANGE_TILES } from "./projection";
import { pressureMultiplier } from "../sim/world";
import { playerWorldPositionInRegionalWindow, resolveResidentWorldPlacement } from "./residentSpatial";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import {
  CURRENT_GAME_SAVE_VERSION,
  FIRST_RESIDENT_ACTIVITY_GAME_SAVE_VERSION,
  FIRST_RESIDENT_INSPECTION_GAME_SAVE_VERSION,
  FIRST_RESIDENT_SERVICE_GAME_SAVE_VERSION,
  RELEASED_LIVING_VOICE_GAME_SAVE_VERSION,
} from "./saveCompatibilityPolicy";
import { WORLD_POSITION_UNITS_PER_TILE, worldPositionDelta, type WorldPosition } from "./worldPosition";

const soundscapePlay = vi.hoisted(() => vi.fn());

vi.mock("../audio/soundscape", () => ({
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(...args: unknown[]): void { soundscapePlay(...args); }
    updateAmbience(): void {}
    destroy(): void {}
  },
}));

interface Envelope extends Record<string, unknown> {
  format: "tideweft-session";
  version: number;
  world: string;
  player: PlayerState;
  regionalTravel: string;
  perceptionCarry: {
    version: number;
    playerStepsSinceWorldTick: number;
    playerSenseSamples: readonly unknown[];
    actorVocalizationSamples: readonly unknown[];
  };
  settlementEcology: string;
  integrity: string;
}

class MemoryRepository implements SaveRepository {
  constructor(private record?: SaveRecord) {
    this.record = record === undefined ? undefined : structuredClone(record);
  }
  async list() { return []; }
  async load(slotId: string) {
    return slotId === "autosave" && this.record !== undefined ? structuredClone(this.record) : undefined;
  }
  async save(record: SaveRecord) { this.record = structuredClone(record); }
  async remove() { this.record = undefined; }
  snapshot(): SaveRecord {
    if (this.record === undefined) throw new Error("resident rest fixture has no committed save");
    return structuredClone(this.record);
  }
}

let scheduledFrame: ((now: number) => void) | undefined;
let nextFrameTime = 100;
const runtimes = new Set<TideweftRuntime>();

beforeEach(() => {
  scheduledFrame = undefined;
  nextFrameTime = 100;
  soundscapePlay.mockClear();
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: (now: number) => void) => {
    scheduledFrame = callback;
    return 1;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  for (const runtime of runtimes) runtime.destroy();
  runtimes.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function open(repository: MemoryRepository): Promise<TideweftRuntime> {
  const runtime = await createTideweftRuntime(repository);
  runtimes.add(runtime);
  expect(runtime.getUIView().saveWarning).toBeUndefined();
  return runtime;
}

function close(runtime: TideweftRuntime): void {
  runtime.destroy();
  runtimes.delete(runtime);
  scheduledFrame = undefined;
}

/** Normal play has one clock-establishing RAF, then one accepted step per100ms. */
function advanceOrdinaryFixedSteps(runtime: TideweftRuntime, count: number): void {
  advanceOrdinaryFixedStepsForExpectedFailure(runtime, count);
  expect(runtime.getUIView().announcement?.message).not.toContain("INTEGRITY HALT");
}

function advanceOrdinaryFixedStepsForExpectedFailure(runtime: TideweftRuntime, count: number): void {
  runtime.start();
  for (let frame = 0; frame <= count; frame += 1) {
    const callback = scheduledFrame;
    if (callback === undefined) throw new Error("resident rest runtime stopped scheduling ordinary play");
    scheduledFrame = undefined;
    callback(nextFrameTime);
    nextFrameTime += 100;
  }
  runtime.stop();
}

function decode(record: SaveRecord): Envelope {
  const envelope = JSON.parse(record.worldJson) as Envelope;
  expect(envelope.format).toBe("tideweft-session");
  expect(envelope.version).toBe(CURRENT_GAME_SAVE_VERSION);
  expect(record.payloadVersion).toBe(CURRENT_GAME_SAVE_VERSION);
  expect(envelope.integrity).toBe(gameSaveEnvelopeIntegrity(envelope));
  return envelope;
}

function recordWith(record: SaveRecord, envelope: Envelope): SaveRecord {
  envelope.integrity = gameSaveEnvelopeIntegrity(envelope);
  return { ...record, payloadVersion: envelope.version, worldJson: JSON.stringify(envelope) };
}

function resident(envelope: Envelope, actorId: string): ResidentState {
  const result = deserializeWorld(envelope.world).residents.find(({ identity }) => identity.stableId === actorId);
  if (result === undefined) throw new Error("native rest actor disappeared");
  return result;
}

/** Session recaps/presentation restart on reload; compare every other saved root. */
function authoritativeRoots(envelope: Envelope): unknown {
  const { integrity: _integrity, session: _session, ...roots } = envelope;
  return roots;
}

/**
 * Native source/custody roots with explicitly controlled short-fixture pressure.
 * No body, task, arrival, posture or decision result is assigned. Ordinary play
 * must select and execute the task through the actual runtime routine owner.
 * This is not a claim that a fresh daytime seed spontaneously needs urgent rest.
 */
async function restFixture(
  selection: "dry" | "wet-source" | "keeper" | "nearby" = "dry",
  seed = "resident activity executable rest approach",
) {
  const repository = new MemoryRepository();
  const setup = await open(repository);
  setup.dispatchUI({ type: "new-world", seed, posture: "gale", sessionShape: "wander" });
  await setup.save();
  const record = repository.snapshot();
  const envelope = decode(record);
  const world = deserializeWorld(envelope.world);
  expect(world.residents.every((human) => !Object.hasOwn(human, "activity"))).toBe(true);
  const keeperId = (JSON.parse(envelope.settlementEcology) as { identity: { keeperActorId: string } }).identity.keeperActorId;
  const travel = restorePlayerRegionalTravel(world.meta.rootSeed, envelope.player, envelope.regionalTravel);
  const playerPosition = travel === null ? null : playerWorldPositionInRegionalWindow(travel.window, envelope.player);
  if (playerPosition === null) throw new Error("native rest fixture lost its player position");
  const candidates = world.residents.flatMap((human) => {
    const source = resolveResidentWorldPlacement(world, human)?.position;
    const target = residentSettlementRestTarget(world, human);
    const isKeeper = human.identity.stableId === keeperId;
    if ((selection === "keeper" ? !isKeeper : isKeeper) || human.activeContractId !== null
      || source === undefined || target === null || !residentRestTargetHasDrySupport(world, target)) return [];
    const sourceIsDry = residentRestTargetHasDrySupport(world, source);
    if (selection === "wet-source" ? sourceIsDry : !sourceIsDry) return [];
    const delta = worldPositionDelta(source, target);
    const approachDistance = Math.abs(delta.x) + Math.abs(delta.y);
    if (selection === "nearby" ? approachDistance !== 2 * WORLD_POSITION_UNITS_PER_TILE
      : selection !== "wet-source" && approachDistance !== WORLD_POSITION_UNITS_PER_TILE) return [];
    const playerDelta = worldPositionDelta(playerPosition, source);
    const distance = playerDelta.x * playerDelta.x + playerDelta.y * playerDelta.y;
    if (selection === "nearby" && distance > (4 * WORLD_POSITION_UNITS_PER_TILE) ** 2) return [];
    return [{ human, source, target, distance }];
  }).sort((left, right) => (selection === "nearby" ? left.distance - right.distance : right.distance - left.distance)
    || left.human.id - right.human.id);
  const selected = candidates[0];
  if (selected === undefined) {
    close(setup);
    throw new Error(`native seed lacks ${selection} rest source: ${seed}`);
  }
  world.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: world.meta.completedTick + 1_000 };
  for (const human of world.residents) {
    human.needs = { food: 100_000, rest: 100_000, belonging: 100_000 };
    human.condition.exhaustion = 100_000;
  }
  selected.human.needs.rest = 900_000;
  selected.human.condition.exhaustion = 300_000;
  for (const contract of world.contracts) {
    contract.playerExclusiveUntilTick = world.meta.completedTick + 1_000;
    contract.dueTick = world.meta.completedTick + 2_000;
  }
  assertWorldInvariants(world);
  envelope.world = serializeWorld(world);
  const prepared = recordWith(record, envelope);
  close(setup);
  return { record: prepared, actorId: selected.human.identity.stableId, source: selected.source, target: selected.target,
    tick: world.meta.completedTick, exhaustion: selected.human.condition.exhaustion };
}

async function firstNativeFixture(selection: "wet-source" | "keeper" | "nearby") {
  for (const seed of ["resident activity executable rest approach", "a", "settlement keeper home night continuity"]) {
    try {
      return await restFixture(selection, seed);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith(`native seed lacks ${selection} rest source:`)) throw error;
    }
  }
  throw new Error(`bounded three-seed survey found no native ${selection} fixture; no terrain/task was injected`);
}

function expectBoundedMotion(source: WorldPosition, poses: readonly { position: WorldPosition }[]): void {
  expect(poses[0]?.position).toEqual(source);
  for (let phase = 1; phase < poses.length; phase += 1) {
    const delta = worldPositionDelta(poses[phase - 1]!.position, poses[phase]!.position);
    expect(Math.hypot(delta.x, delta.y)).toBeLessThanOrEqual(RESIDENT_REST_APPROACH_STEP_UNITS);
  }
}

describe("ordinary runtime resident rest execution", () => {
  it.each([4, 9])("selects and executes real rest, preserving equal work across a phase%s cold continuation", async (phase) => {
    expect(CURRENT_GAME_SAVE_VERSION).toBe(FIRST_RESIDENT_INSPECTION_GAME_SAVE_VERSION);
    expect(FIRST_RESIDENT_ACTIVITY_GAME_SAVE_VERSION).toBeLessThan(CURRENT_GAME_SAVE_VERSION);
    const fixture = await restFixture();
    const repository = new MemoryRepository(fixture.record);
    const runtime = await open(repository);
    // Load/save alone does not invent physical history or consume a step.
    await runtime.save();
    expect(deserializeWorld(decode(repository.snapshot()).world).residents.every((human) => !Object.hasOwn(human, "activity"))).toBe(true);
    advanceOrdinaryFixedSteps(runtime, phase);
    await runtime.save();
    const middleRecord = repository.snapshot();
    const middle = decode(middleRecord);
    const middleWorld = deserializeWorld(middle.world);
    expect(middle.perceptionCarry.playerStepsSinceWorldTick).toBe(phase);
    expect(middleWorld.meta.completedTick).toBe(fixture.tick);
    expect(middleWorld.residents.every((human) => human.activity?.poses.length === phase + 1)).toBe(true);
    const moving = resident(middle, fixture.actorId);
    expect(moving.activity?.restTask).toMatchObject({ cause: "urgent-rest", origin: "selected", phase: "approaching", target: fixture.target });
    expect(moving.activity?.poses.at(-1)?.position).not.toEqual(fixture.source);
    expect(moving.condition.exhaustion).toBe(fixture.exhaustion);
    expect(moving.circadian).toMatchObject({ restDestinationArrived: false, posture: { state: "awake" } });
    expectBoundedMotion(fixture.source, moving.activity!.poses);

    advanceOrdinaryFixedSteps(runtime, 10 - phase);
    await runtime.save();
    const uninterrupted = decode(repository.snapshot());
    const arrived = resident(uninterrupted, fixture.actorId);
    expect(uninterrupted.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expect(deserializeWorld(uninterrupted.world).meta.completedTick).toBe(fixture.tick + 1);
    expect(arrived.activity?.poses).toHaveLength(1);
    expect(arrived.activity?.poses[0]?.position).toEqual(fixture.target);
    expect(arrived.activity?.restTask?.phase).toBe("arrived");
    expect(arrived.circadian).toMatchObject({ restDestinationArrived: true, posture: { state: "resting" } });
    expect(arrived.condition.exhaustion).toBeLessThan(fixture.exhaustion);
    close(runtime);

    const coldRepository = new MemoryRepository(middleRecord);
    const cold = await open(coldRepository);
    await cold.save();
    const restored = decode(coldRepository.snapshot());
    expect(authoritativeRoots(restored)).toEqual(authoritativeRoots(middle));
    advanceOrdinaryFixedSteps(cold, 10 - phase);
    await cold.save();
    expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(uninterrupted));
  }, 60_000);

  it("keeps actual nearby player recognition from denying rest motion, arrival and cold continuation", async () => {
    const fixture = await firstNativeFixture("nearby");
    const repository = new MemoryRepository(fixture.record);
    const runtime = await open(repository);
    const initial = resident(decode(fixture.record), fixture.actorId);
    expect(initial.perception.beliefs.some(({ subjectId }) => subjectId === "player:local")).toBe(false);
    advanceOrdinaryFixedSteps(runtime, 10);
    await runtime.save();
    const recognized = decode(repository.snapshot());
    const approaching = resident(recognized, fixture.actorId);
    expect(deserializeWorld(recognized.world).meta.completedTick).toBe(fixture.tick + 1);
    expect(approaching.perception.suspicion).toBe("identified");
    expect(queryResidentAttentionState(approaching.perception)).toBe("glance");
    expect(approaching.activity?.restTask).toMatchObject({ cause: "urgent-rest", phase: "approaching", target: fixture.target });
    expect(approaching.circadian).toMatchObject({ restDestinationArrived: false, posture: { state: "awake" } });
    const firstBelief = approaching.perception.beliefs.find(({ subjectId }) => subjectId === "player:local");
    expect(firstBelief).toMatchObject({ identification: "identified", firstObservedTick: fixture.tick + 1 });

    // The native diagonal is shorter than its two-tile Manhattan distance;
    // capture its first recognized moving phase rather than guessing arrival.
    runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
    advanceOrdinaryFixedSteps(runtime, 1);
    runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    await runtime.save();
    const middleRecord = repository.snapshot();
    const middle = decode(middleRecord);
    const moving = resident(middle, fixture.actorId);
    expect(middle.perceptionCarry.playerStepsSinceWorldTick).toBe(1);
    expect({ x: middle.player.x, y: middle.player.y }).not.toEqual({ x: recognized.player.x, y: recognized.player.y });
    expect(moving.activity?.restTask?.phase).toBe("approaching");
    expect(moving.activity?.poses.at(-1)?.position).not.toEqual(approaching.activity?.poses[0]?.position);
    expect(queryResidentAttentionState(moving.perception)).toBe("glance");
    expect(moving.condition.exhaustion).toBeGreaterThanOrEqual(fixture.exhaustion);
    const visible = runtime.getRenderView().porters.find(({ actorId }) => actorId === fixture.actorId);
    expect(visible).toBeDefined();
    expect(visible?.facing).toBe(moving.activity!.poses.at(-1)!.heading / FIXED_POINT * Math.PI * 2);

    advanceOrdinaryFixedSteps(runtime, 9);
    await runtime.save();
    const arrival = decode(repository.snapshot());
    const arrived = resident(arrival, fixture.actorId);
    expect(deserializeWorld(arrival.world).meta.completedTick).toBe(fixture.tick + 2);
    expect(arrived.activity?.poses[0]?.position).toEqual(fixture.target);
    expect(arrived.activity?.restTask?.phase).toBe("arrived");
    expect(arrived.circadian).toMatchObject({ restDestinationArrived: true, posture: { state: "resting" } });
    expect(arrived.condition.exhaustion).toBeLessThan(fixture.exhaustion);
    expect(arrived.perception.beliefs.find(({ subjectId }) => subjectId === "player:local"))
      .toMatchObject({ identification: "identified", firstObservedTick: firstBelief!.firstObservedTick });

    advanceOrdinaryFixedSteps(runtime, 20);
    await runtime.save();
    const uninterrupted = decode(repository.snapshot());
    const finalWorld = deserializeWorld(uninterrupted.world);
    const continuingRest = resident(uninterrupted, fixture.actorId);
    expect(finalWorld.meta.completedTick).toBe(fixture.tick + 4);
    expect(continuingRest.activity?.poses[0]?.position).toEqual(fixture.target);
    expect(continuingRest.activity?.restTask?.phase).toBe("arrived");
    expect(continuingRest.circadian).toMatchObject({ restDestinationArrived: true, posture: { state: "resting" } });
    expect(continuingRest.condition.exhaustion).toBeLessThan(arrived.condition.exhaustion);
    expect(continuingRest.perception.beliefs.find(({ subjectId }) => subjectId === "player:local"))
      .toMatchObject({
        identification: "identified", firstObservedTick: firstBelief!.firstObservedTick,
        lastObservedTick: finalWorld.meta.completedTick,
      });
    expect(queryResidentAttentionState(continuingRest.perception)).toBe("none");
    expect(finalWorld.events.filter(({ type }) => type === "resident-introduced")).toEqual(
      deserializeWorld(decode(fixture.record).world).events.filter(({ type }) => type === "resident-introduced"),
    );
    close(runtime);

    const coldRepository = new MemoryRepository(middleRecord);
    const cold = await open(coldRepository);
    await cold.save();
    const restored = decode(coldRepository.snapshot());
    expect(authoritativeRoots(restored)).toEqual(authoritativeRoots(middle));
    expect(queryResidentAttentionState(resident(restored, fixture.actorId).perception)).toBe("glance");
    advanceOrdinaryFixedSteps(cold, 29);
    await cold.save();
    expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(uninterrupted));
  }, 60_000);

  it("uses a real ration after ordinary approach, preserves a phase9 cold pulse, and rolls back a late failed use", async () => {
    const fixture = await restFixture();
    const initial = decode(fixture.record);
    const initialWorld = deserializeWorld(initial.world);
    const chosen = initialWorld.residents.find(({ identity }) => identity.stableId === fixture.actorId)!;
    // Cause-only pressure controls. No task, body, arrival or benefit is assigned.
    chosen.needs = { food: 900_000, rest: 100_000, belonging: 100_000 };
    chosen.condition.exhaustion = 100_000;
    initial.world = serializeWorld(initialWorld);
    const repository = new MemoryRepository(recordWith(fixture.record, initial));
    const runtime = await open(repository);
    advanceOrdinaryFixedSteps(runtime, 599);
    await runtime.save();
    const beforeRecord = repository.snapshot();
    const before = decode(beforeRecord);
    const beforeWorld = deserializeWorld(before.world);
    const ready = resident(before, fixture.actorId);
    expect(beforeWorld.meta.completedTick).toBe(fixture.tick + 59);
    expect(before.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    expect(ready.activity?.rationTask).toMatchObject({ phase: "arrived", usedAtTick: null });
    expect(ready.activity?.restTask).toBeNull();
    expect(ready.needs.food).toBe(900_000);
    expect(observableResidentRationUse(ready)).toBe(false);

    advanceOrdinaryFixedSteps(runtime, 1);
    await runtime.save();
    const after = decode(repository.snapshot());
    const afterWorld = deserializeWorld(after.world);
    const used = resident(after, fixture.actorId);
    const growth = Math.trunc(34_000 * pressureMultiplier(afterWorld.meta.pressureMode) / FIXED_POINT);
    expect(afterWorld.meta.completedTick).toBe(fixture.tick + 60);
    expect(used.activity?.rationTask).toMatchObject({
      phase: "used", usedAtTick: fixture.tick + 60, foodUsed: true, waterUsed: true,
    });
    expect(used.needs.food).toBe(900_000 + growth - 76_000);
    expect(used.circadian).toMatchObject({ restDestinationArrived: false, posture: { state: "awake" } });
    expect(observableResidentRationUse(used)).toBe(true);
    expect(afterWorld.ledger.consumed.food - beforeWorld.ledger.consumed.food).toBe(1);
    expect(afterWorld.ledger.consumed.freshWater - beforeWorld.ledger.consumed.freshWater).toBe(1);
    assertWorldInvariants(afterWorld);
    close(runtime);

    soundscapePlay.mockClear();
    const coldRepository = new MemoryRepository(beforeRecord);
    const cold = await open(coldRepository);
    await cold.save();
    expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(before));
    expect(soundscapePlay).not.toHaveBeenCalled();
    advanceOrdinaryFixedSteps(cold, 1);
    await cold.save();
    expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(after));
    const consumedRecord = coldRepository.snapshot();
    close(cold);

    const failedRepository = new MemoryRepository(beforeRecord);
    const failed = await open(failedRepository);
    const originalStep = simulation.stepWorld;
    let attemptedUse = false;
    const stepSpy = vi.spyOn(simulation, "stepWorld").mockImplementation((...args) => {
      const result = originalStep(...args);
      const actor = result.residents.find(({ identity }) => identity.stableId === fixture.actorId)!;
      expect(actor.activity?.rationTask?.phase).toBe("used");
      expect(result.ledger.consumed.food - beforeWorld.ledger.consumed.food).toBe(1);
      attemptedUse = true;
      return result;
    });
    const closure = vi.spyOn(situatedExpressionChannelBank, "closeSituatedExpressionChannelBankInterval")
      .mockReturnValueOnce(null);
    soundscapePlay.mockClear();
    advanceOrdinaryFixedStepsForExpectedFailure(failed, 1);
    expect(attemptedUse).toBe(true);
    expect(closure).toHaveBeenCalled();
    expect(failed.getUIView().announcement?.message).toContain("INTEGRITY HALT");
    await failed.save();
    expect(authoritativeRoots(decode(failedRepository.snapshot()))).toEqual(authoritativeRoots(before));
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-steady")).toHaveLength(0);
    stepSpy.mockRestore();
    closure.mockRestore();
    close(failed);

    for (const reception of ["heard", "refused"] as const) {
      const greetingRepository = new MemoryRepository(beforeRecord);
      const greeting = await open(greetingRepository);
      const view = greeting.getRenderView();
      const nearby = view.porters.find(({ position, quickLabel }) => quickLabel !== undefined
        && Math.hypot(position.x - view.player.position.x, position.y - view.player.position.y)
          <= view.terrain.tileSize * RESIDENT_CONVERSATION_RANGE_TILES);
      if (nearby === undefined) throw new Error("hourly ration fixture needs a real nearby GREET source");
      greeting.dispatchRenderer({ type: "select", entity: "porter", id: nearby.id, point: nearby.position });
      expect(greeting.getUIView().selectedResident).toMatchObject({ actionLabel: "GREET", actionDisabled: false });
      const refusal = reception === "refused" ? vi.spyOn(
        residentIntroductionAuthority, "prepareResidentIntroductionEventTimeReceipt",
      ).mockReturnValue(null) : null;
      const admissions: unknown[] = [];
      const greetedStep = vi.spyOn(simulation, "stepWorld").mockImplementation((...args) => {
        admissions.push(args[3]);
        const result = originalStep(...args);
        expect(result.residents.find(({ identity }) => identity.stableId === fixture.actorId)!.activity?.rationTask?.phase)
          .toBe("used");
        expect(result.ledger.consumed.food - beforeWorld.ledger.consumed.food).toBe(1);
        return result;
      });
      greeting.dispatchUI({ type: "resident", action: "greet", residentId: nearby.id });
      advanceOrdinaryFixedSteps(greeting, 1);
      await greeting.save();
      const greetedWorld = deserializeWorld(decode(greetingRepository.snapshot()).world);
      const introductions = greetedWorld.events.filter(({ type }) => type === "resident-introduced");
      expect(introductions).toHaveLength(reception === "heard" ? 1 : 0);
      expect(admissions).toHaveLength(reception === "heard" ? 1 : 2);
      expect(admissions.every((admission) => admission !== undefined)).toBe(true);
      expect(new Set(admissions).size).toBe(admissions.length);
      expect(greetedWorld.ledger.consumed.food - beforeWorld.ledger.consumed.food).toBe(1);
      expect(greetedWorld.residents.find(({ identity }) => identity.stableId === fixture.actorId)!.needs.food).toBe(used.needs.food);
      assertWorldInvariants(greetedWorld);
      greetedStep.mockRestore();
      refusal?.mockRestore();
      close(greeting);
    }

    const consumedRepository = new MemoryRepository(consumedRecord);
    const consumed = await open(consumedRepository);
    await consumed.save();
    expect(authoritativeRoots(decode(consumedRepository.snapshot()))).toEqual(authoritativeRoots(after));
    advanceOrdinaryFixedSteps(consumed, 10);
    await consumed.save();
    const next = deserializeWorld(decode(consumedRepository.snapshot()).world);
    expect(next.ledger.consumed).toEqual(afterWorld.ledger.consumed);
    expect(next.residents.find(({ identity }) => identity.stableId === fixture.actorId)!.needs.food).toBe(used.needs.food);
    assertWorldInvariants(next);
  }, 180_000);

  it("uses real civic material after ordinary approach, preserves the closing cold pulse and rolls back a late failed contribution", async () => {
    const fixture = await restFixture();
    const initial = decode(fixture.record);
    const world = deserializeWorld(initial.world);
    for (const human of world.residents) {
      human.needs = { food: 100_000, rest: 900_000, belonging: 100_000 };
      human.condition.exhaustion = 100_000;
    }
    const chosen = world.residents.find(({ identity }) => identity.stableId === fixture.actorId)!;
    chosen.needs = { food: 0, rest: 0, belonging: 400_000 };
    chosen.intention = "work";
    if (chosen.location.kind !== "settlement") throw new Error("Native civic fixture lost its settlement");
    const settlementId = chosen.location.settlementId;
    const settlement = world.settlements.find(({ id }) => id === settlementId)!;
    const projectId = settlement.project.id;
    const resource = settlement.project.resource;
    const initialProgress = settlement.project.progress;
    for (const site of world.settlements) {
      for (const recipe of site.recipes) recipe.nextRunTick = fixture.tick + 1_000;
    }
    initial.world = serializeWorld(world);
    const repository = new MemoryRepository(recordWith(fixture.record, initial));
    const runtime = await open(repository);
    advanceOrdinaryFixedSteps(runtime, 4);
    await runtime.save();
    const moving = resident(decode(repository.snapshot()), fixture.actorId);
    expect(moving.activity?.materialTask).toMatchObject({ kind: "settlement-material", phase: "approaching", projectId, resource });
    expect(moving.activity?.poses.at(-1)?.position).not.toEqual(fixture.source);
    expectBoundedMotion(fixture.source, moving.activity!.poses);
    advanceOrdinaryFixedSteps(runtime, 595);
    await runtime.save();
    const beforeRecord = repository.snapshot();
    const before = decode(beforeRecord);
    const beforeWorld = deserializeWorld(before.world);
    expect(before.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    expect(resident(before, fixture.actorId).activity?.materialTask).toMatchObject({ phase: "arrived", usedAtTick: null });
    expect(beforeWorld.settlements.find(({ id }) => id === settlementId)!.project.progress).toBe(initialProgress);
    advanceOrdinaryFixedSteps(runtime, 1);
    await runtime.save();
    const after = decode(repository.snapshot());
    const afterWorld = deserializeWorld(after.world);
    const completed = afterWorld.settlements.find(({ id }) => id === settlementId)!;
    expect(completed.project.progress).toBe(initialProgress + 1);
    expect(completed.inventory[resource]).toBe(beforeWorld.settlements.find(({ id }) => id === settlementId)!.inventory[resource] - 1);
    expect(afterWorld.ledger.consumed[resource]).toBe(beforeWorld.ledger.consumed[resource] + 1);
    expect(resident(after, fixture.actorId).activity?.materialTask).toMatchObject({ phase: "used", usedAtTick: fixture.tick + 60 });
    assertWorldInvariants(afterWorld);
    close(runtime);

    const coldRepository = new MemoryRepository(beforeRecord);
    const cold = await open(coldRepository);
    await cold.save();
    expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(before));
    advanceOrdinaryFixedSteps(cold, 1);
    await cold.save();
    expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(after));
    const usedRecord = coldRepository.snapshot();
    close(cold);

    const failedRepository = new MemoryRepository(beforeRecord);
    const failed = await open(failedRepository);
    const originalStep = simulation.stepWorld;
    let attemptedUse = false;
    const stepSpy = vi.spyOn(simulation, "stepWorld").mockImplementation((...args) => {
      const result = originalStep(...args);
      expect(result.residents.find(({ identity }) => identity.stableId === fixture.actorId)!.activity?.materialTask?.phase).toBe("used");
      expect(result.settlements.find(({ id }) => id === settlementId)!.project.progress).toBe(initialProgress + 1);
      attemptedUse = true;
      return result;
    });
    const closure = vi.spyOn(situatedExpressionChannelBank, "closeSituatedExpressionChannelBankInterval").mockReturnValueOnce(null);
    soundscapePlay.mockClear();
    advanceOrdinaryFixedStepsForExpectedFailure(failed, 1);
    expect(attemptedUse).toBe(true);
    expect(failed.getUIView().announcement?.message).toContain("INTEGRITY HALT");
    await failed.save();
    expect(authoritativeRoots(decode(failedRepository.snapshot()))).toEqual(authoritativeRoots(before));
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-steady")).toHaveLength(0);
    stepSpy.mockRestore();
    closure.mockRestore();
    close(failed);

    const usedRepository = new MemoryRepository(usedRecord);
    const used = await open(usedRepository);
    await used.save();
    expect(authoritativeRoots(decode(usedRepository.snapshot()))).toEqual(authoritativeRoots(after));
    advanceOrdinaryFixedSteps(used, 10);
    await used.save();
    const next = deserializeWorld(decode(usedRepository.snapshot()).world);
    expect(next.ledger.consumed).toEqual(afterWorld.ledger.consumed);
    expect(next.settlements.find(({ id }) => id === settlementId)!.project.progress).toBe(initialProgress + 1);
  }, 180_000);

  it("retains supported51 phase4 body history and upgrades services only at the next genuine phase0", async () => {
    const fixture = await restFixture();
    const stagingRepository = new MemoryRepository(fixture.record);
    const staging = await open(stagingRepository);
    advanceOrdinaryFixedSteps(staging, 4);
    await staging.save();
    const record = stagingRepository.snapshot();
    const legacy = decode(record);
    const world = deserializeWorld(legacy.world);
    // Reconstruct the deliberately supported rest-only protocol from actual
    // accepted poses, not a fabricated movement/arrival or old released save.
    for (const human of world.residents) {
      const activity = human.activity;
      if (activity === undefined || activity.rationTask !== null) throw new Error("native rest fixture gained ration use");
      expect(activity.inspectionTask).toBeNull();
      const { rationTask: _rationTask, materialTask: _materialTask, inspectionTask: _inspectionTask, ...body } = activity;
      human.activity = { ...body, version: RESIDENT_ACTIVITY_VERSION, ownerId: RESIDENT_ACTIVITY_OWNER_ID };
    }
    assertWorldInvariants(world);
    legacy.world = serializeWorld(world);
    legacy.version = FIRST_RESIDENT_ACTIVITY_GAME_SAVE_VERSION;
    close(staging);

    const repository = new MemoryRepository(recordWith(record, legacy));
    const runtime = await open(repository);
    await runtime.save();
    const loaded = decode(repository.snapshot());
    expect(loaded.world).toBe(legacy.world);
    expect(loaded.perceptionCarry).toEqual(legacy.perceptionCarry);
    advanceOrdinaryFixedSteps(runtime, 5);
    await runtime.save();
    const phase9 = decode(repository.snapshot());
    expect(phase9.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    expect(deserializeWorld(phase9.world).residents.every((human) => (
      human.activity?.version === RESIDENT_ACTIVITY_VERSION && human.activity.poses.length === 10
      && !Object.hasOwn(human.activity, "rationTask")
    ))).toBe(true);
    advanceOrdinaryFixedSteps(runtime, 1);
    await runtime.save();
    const boundary = decode(repository.snapshot());
    expect(boundary.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expect(deserializeWorld(boundary.world).meta.completedTick).toBe(fixture.tick + 1);
    expect(deserializeWorld(boundary.world).residents.every((human) => (
      // Closure itself invokes the existing phase-zero routine owner. There
      // is no extra accepted step or invented pre-boundary history to await.
      human.activity?.version === RESIDENT_INSPECTION_ACTIVITY_VERSION && human.activity.poses.length === 1
      && human.activity.rationTask === null
    ))).toBe(true);
    advanceOrdinaryFixedSteps(runtime, 1);
    await runtime.save();
    const next = decode(repository.snapshot());
    expect(next.perceptionCarry.playerStepsSinceWorldTick).toBe(1);
    expect(deserializeWorld(next.world).residents.every((human) => (
      human.activity?.version === RESIDENT_INSPECTION_ACTIVITY_VERSION && human.activity.poses.length === 2
      && human.activity.rationTask === null
    ))).toBe(true);
    expect(resident(next, fixture.actorId).activity?.poses.at(-1)?.position).not.toEqual(fixture.source);
    expect(stableStringify(next.physicalCargo)).toBe(stableStringify(loaded.physicalCargo));
  }, 60_000);

  it("retains supported52 phase4 ration history until the next genuine phase0 service upgrade", async () => {
    const fixture = await restFixture();
    const initial = decode(fixture.record);
    const initialWorld = deserializeWorld(initial.world);
    for (const human of initialWorld.residents) {
      if (human.identity.stableId === fixture.actorId) {
        human.needs = { food: 900_000, rest: 100_000, belonging: 100_000 };
        human.condition.exhaustion = 100_000;
      } else {
        // Suppress unrelated civic work by an actual priority input, without
        // assigning a task, posture, body result or hidden keeper duty.
        human.needs.belonging = 900_000;
      }
    }
    assertWorldInvariants(initialWorld);
    initial.world = serializeWorld(initialWorld);
    const stagingRepository = new MemoryRepository(recordWith(fixture.record, initial));
    const staging = await open(stagingRepository);
    advanceOrdinaryFixedSteps(staging, 4);
    await staging.save();
    const record = stagingRepository.snapshot();
    const legacy = decode(record);
    const world = deserializeWorld(legacy.world);
    const actual = world.residents.find(({ identity }) => identity.stableId === fixture.actorId)!;
    expect(world.meta.completedTick).toBe(fixture.tick);
    expect(legacy.perceptionCarry.playerStepsSinceWorldTick).toBe(4);
    expect(actual.activity?.rationTask).toMatchObject({ phase: "approaching", usedAtTick: null });
    expect(actual.activity?.restTask).toBeNull();
    expect(actual.activity?.poses.at(-1)?.position).not.toEqual(fixture.source);
    expectBoundedMotion(fixture.source, actual.activity!.poses);
    // Explicit supported-format reconstruction from genuinely accepted poses.
    // Preserve complete ration/body content and carry; remove only the absent
    // civic capability, not successful activity or already-consumed history.
    for (const human of world.residents) {
      const activity = human.activity;
      if (activity?.version !== RESIDENT_INSPECTION_ACTIVITY_VERSION || activity.materialTask !== null || activity.inspectionTask !== null) {
        throw new Error("supported52 fixture requires a genuine civic-free body prefix");
      }
      const { materialTask: _materialTask, inspectionTask: _inspectionTask, ...body } = activity;
      human.activity = { ...body, version: RESIDENT_SERVICE_ACTIVITY_VERSION, ownerId: RESIDENT_SERVICE_ACTIVITY_OWNER_ID };
      const { version: _version, ownerId: _ownerId, ...retained } = human.activity;
      const { version: _originalVersion, ownerId: _originalOwnerId, ...original } = body;
      expect(retained).toEqual(original);
    }
    assertWorldInvariants(world);
    legacy.world = serializeWorld(world);
    legacy.version = FIRST_RESIDENT_SERVICE_GAME_SAVE_VERSION;
    close(staging);

    const repository = new MemoryRepository(recordWith(record, legacy));
    const runtime = await open(repository);
    await runtime.save();
    const loaded = decode(repository.snapshot());
    expect(loaded.world).toBe(legacy.world);
    expect(loaded.perceptionCarry).toEqual(legacy.perceptionCarry);
    expect(resident(loaded, fixture.actorId).activity?.rationTask).toEqual(actual.activity?.rationTask);
    advanceOrdinaryFixedSteps(runtime, 5);
    await runtime.save();
    const phase9 = decode(repository.snapshot());
    expect(phase9.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    expect(deserializeWorld(phase9.world).residents.every((human) => (
      human.activity?.version === RESIDENT_SERVICE_ACTIVITY_VERSION && human.activity.poses.length === 10
      && !Object.hasOwn(human.activity, "materialTask")
    ))).toBe(true);
    const ration9 = resident(phase9, fixture.actorId).activity!;
    expect(ration9.poses.slice(0, 5)).toEqual(actual.activity?.poses);
    expect(ration9.rationTask).toMatchObject({ phase: "approaching", selectedAtTick: fixture.tick, usedAtTick: null });
    advanceOrdinaryFixedSteps(runtime, 1);
    await runtime.save();
    const boundary = decode(repository.snapshot());
    const boundaryWorld = deserializeWorld(boundary.world);
    expect(boundary.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expect(boundaryWorld.meta.completedTick).toBe(fixture.tick + 1);
    expect(boundaryWorld.residents.every((human) => human.activity?.version === RESIDENT_INSPECTION_ACTIVITY_VERSION
      && human.activity.poses.length === 1 && human.activity.materialTask === null)).toBe(true);
    expect(resident(boundary, fixture.actorId).activity?.rationTask).toMatchObject({
      phase: "arrived", selectedAtTick: fixture.tick, usedAtTick: null,
    });
    expect(resident(boundary, fixture.actorId).activity?.poses[0]?.position).toEqual(fixture.target);
    expect(stableStringify(boundary.physicalCargo)).toBe(stableStringify(loaded.physicalCargo));
  }, 60_000);

  it("retains released50 phase4 body absence until the next genuine phase0", async () => {
    const fixture = await restFixture();
    const initial = decode(fixture.record);
    const initialWorld = deserializeWorld(initial.world);
    // Reconstruct a pre-body prefix without unrelated current civic approach.
    // Urgent belonging suppresses ordinary material work without requesting
    // another physical rest/ration task. Keep the selected real rest cause.
    for (const human of initialWorld.residents) {
      if (human.identity.stableId !== fixture.actorId) human.needs.belonging = 900_000;
    }
    const initialBio0 = deserializeBio0Ecology(initial.bio0Ecology);
    if (initialBio0 === null) throw new Error("released50 fixture lost its native BIO0 root");
    const initialKeeper = initialWorld.residents.find(({ identity }) => identity.stableId === initialBio0.porterAddress.actorId)!;
    expect(initialBio0.porterAddress).toEqual(livingActorAddressForResident(createWorldView(initialWorld), initialKeeper));
    assertWorldInvariants(initialWorld);
    initial.world = serializeWorld(initialWorld);
    const stagingRepository = new MemoryRepository(recordWith(fixture.record, initial));
    const staging = await open(stagingRepository);
    advanceOrdinaryFixedSteps(staging, 4);
    await staging.save();
    const record = stagingRepository.snapshot();
    const legacy = decode(record);
    const world = deserializeWorld(legacy.world);
    // Four actual current player samples reconstruct the released pre-body
    // prefix; no world tick or human event has occurred. Remove only the new
    // optional human roots, not accepted player history or any physical stock.
    expect(world.meta.completedTick).toBe(fixture.tick);
    expect(legacy.perceptionCarry.actorVocalizationSamples).toEqual([]);
    const currentBio0 = deserializeBio0Ecology(legacy.bio0Ecology);
    const currentKeeper = world.residents.find(({ identity }) => identity.stableId === initialBio0.porterAddress.actorId)!;
    expect(currentBio0?.porterAddress).toEqual(initialBio0.porterAddress);
    expect(currentKeeper.activity?.poses).toHaveLength(5);
    for (const pose of currentKeeper.activity!.poses) {
      expect(pose.position).toEqual(initialBio0.porterAddress.position);
      expect(pose.heading).toBe(initialBio0.porterAddress.heading);
    }
    for (const human of world.residents) {
      delete human.activity;
      delete human.circadian;
    }
    expect(livingActorAddressForResident(createWorldView(world), currentKeeper)).toEqual(initialBio0.porterAddress);
    assertWorldInvariants(world);
    legacy.world = serializeWorld(world);
    legacy.version = RELEASED_LIVING_VOICE_GAME_SAVE_VERSION;
    const legacyRecord = recordWith(record, legacy);
    close(staging);

    const repository = new MemoryRepository(legacyRecord);
    const runtime = await open(repository);
    await runtime.save();
    const loaded = decode(repository.snapshot());
    expect(loaded.world).toBe(legacy.world);
    expect(loaded.perceptionCarry).toEqual(legacy.perceptionCarry);
    expect(loaded.perceptionCarry.playerStepsSinceWorldTick).toBe(4);
    advanceOrdinaryFixedSteps(runtime, 5);
    await runtime.save();
    const beforeBoundary = decode(repository.snapshot());
    expect(beforeBoundary.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    expect(deserializeWorld(beforeBoundary.world).residents.every((human) => !Object.hasOwn(human, "activity"))).toBe(true);
    advanceOrdinaryFixedSteps(runtime, 1);
    await runtime.save();
    const boundary = decode(repository.snapshot());
    const boundaryWorld = deserializeWorld(boundary.world);
    expect(boundary.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expect(boundaryWorld.meta.completedTick).toBe(fixture.tick + 1);
    expect(boundaryWorld.residents.every((human) => human.activity?.tick === fixture.tick + 1 && human.activity.poses.length === 1)).toBe(true);
    advanceOrdinaryFixedSteps(runtime, 1);
    await runtime.save();
    const next = decode(repository.snapshot());
    expect(next.perceptionCarry.playerStepsSinceWorldTick).toBe(1);
    expect(deserializeWorld(next.world).residents.every((human) => human.activity?.poses.length === 2)).toBe(true);
    expect(resident(next, fixture.actorId).activity?.poses.at(-1)?.position).not.toEqual(fixture.source);
    expect(stableStringify(next.physicalCargo)).toBe(stableStringify(loaded.physicalCargo));
  }, 60_000);

  it("rolls back actual phase5 resident motion and cold restores the accepted phase4 without replay", async () => {
    const fixture = await restFixture();
    const repository = new MemoryRepository(fixture.record);
    const runtime = await open(repository);
    advanceOrdinaryFixedSteps(runtime, 4);
    await runtime.save();
    const beforeRecord = repository.snapshot();
    const before = decode(beforeRecord);
    const movingBefore = resident(before, fixture.actorId);
    expect(before.perceptionCarry.playerStepsSinceWorldTick).toBe(4);
    expect(movingBefore.activity?.restTask?.phase).toBe("approaching");
    expect(movingBefore.activity?.poses.at(-1)?.position).not.toEqual(fixture.source);
    const advance = residentActivityExecution.advanceResidentRestActivities;
    const motion = vi.spyOn(residentActivityExecution, "advanceResidentRestActivities")
      .mockImplementationOnce((world, phase) => {
        expect(phase).toBe(5);
        expect(advance(world, phase)).not.toBeNull();
        const moved = world.residents.find(({ identity }) => identity.stableId === fixture.actorId)!;
        expect(moved.activity?.poses).toHaveLength(6);
        expect(moved.activity?.poses.at(-1)?.position).not.toEqual(movingBefore.activity?.poses.at(-1)?.position);
        // Reject after genuine motion and immutable roster replacement, not
        // before the adapter has changed the authoritative body.
        return null;
      });
    soundscapePlay.mockClear();
    runtime.start();
    for (let frame = 0; frame <= 1; frame += 1) {
      const callback = scheduledFrame;
      if (callback === undefined) throw new Error("rollback fixture stopped before its accepted step");
      scheduledFrame = undefined;
      callback(nextFrameTime);
      nextFrameTime += 100;
    }
    runtime.stop();
    expect(motion).toHaveBeenCalledTimes(1);
    expect(runtime.getUIView().announcement?.message).toContain("INTEGRITY HALT");
    // The halt warning is not committed vocal/contact/movement audio.
    expect(soundscapePlay.mock.calls).toEqual([["warning", 1]]);
    await runtime.save();
    const rolledBackRecord = repository.snapshot();
    const rolledBack = decode(rolledBackRecord);
    expect(authoritativeRoots(rolledBack)).toEqual(authoritativeRoots(before));
    expect(resident(rolledBack, fixture.actorId).activity?.poses).toHaveLength(5);
    motion.mockRestore();
    close(runtime);

    soundscapePlay.mockClear();
    const coldRepository = new MemoryRepository(rolledBackRecord);
    const cold = await open(coldRepository);
    await cold.save();
    const restored = decode(coldRepository.snapshot());
    expect(authoritativeRoots(restored)).toEqual(authoritativeRoots(before));
    expect(restored.perceptionCarry.playerStepsSinceWorldTick).toBe(4);
    expect(soundscapePlay).not.toHaveBeenCalled();
  }, 60_000);

  it("waits on an actual native wet source without phantom arrival or recovery, including a cold continuation", async () => {
    const fixture = await firstNativeFixture("wet-source");
    const repository = new MemoryRepository(fixture.record);
    const runtime = await open(repository);
    const original = deserializeWorld(decode(fixture.record).world);
    expect(residentRestTargetHasDrySupport(original, fixture.source)).toBe(false);
    expect(residentRestTargetHasDrySupport(original, fixture.target)).toBe(true);
    const originalTerrain = stableStringify(original.terrain);
    advanceOrdinaryFixedSteps(runtime, 4);
    await runtime.save();
    const middleRecord = repository.snapshot();
    const middle = decode(middleRecord);
    const waiting = resident(middle, fixture.actorId);
    expect(waiting.activity?.restTask).toMatchObject({
      cause: "urgent-rest", origin: "selected", phase: "waiting", target: fixture.target,
      waitReason: "no-traversable-route", nextReassessmentAtTick: fixture.tick + 1,
    });
    expect(waiting.activity?.poses.every(({ position }) => stableStringify(position) === stableStringify(fixture.source))).toBe(true);
    expect(waiting.condition.exhaustion).toBe(fixture.exhaustion);
    expect(waiting.circadian).toMatchObject({ restDestinationArrived: false, posture: { state: "awake" } });
    expect(stableStringify(deserializeWorld(middle.world).terrain)).toBe(originalTerrain);
    advanceOrdinaryFixedSteps(runtime, 6);
    await runtime.save();
    const uninterrupted = decode(repository.snapshot());
    const afterWorld = resident(uninterrupted, fixture.actorId);
    expect(afterWorld.activity?.poses[0]?.position).toEqual(fixture.source);
    expect(afterWorld.condition.exhaustion).toBe(fixture.exhaustion);
    expect(afterWorld.circadian?.restDestinationArrived).toBe(false);
    expect(deserializeWorld(uninterrupted.world).meta.completedTick).toBe(fixture.tick + 1);
    close(runtime);

    const coldRepository = new MemoryRepository(middleRecord);
    const cold = await open(coldRepository);
    await cold.save();
    expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(middle));
    advanceOrdinaryFixedSteps(cold, 6);
    await cold.save();
    expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(uninterrupted));
  }, 60_000);

  it("publishes a genuinely neutral keeper's moving body into the same BIO0 address and current cold save", async () => {
    const fixture = await firstNativeFixture("keeper");
    const initial = decode(fixture.record);
    expect(initial.porterResponse).toMatchObject({ actorId: fixture.actorId, intent: "wait-observe" });
    const originalBio0 = deserializeBio0Ecology(initial.bio0Ecology);
    if (originalBio0 === null) throw new Error("native keeper fixture omitted BIO0 custody");
    const repository = new MemoryRepository(fixture.record);
    const runtime = await open(repository);
    advanceOrdinaryFixedSteps(runtime, 4);
    await runtime.save();
    const record = repository.snapshot();
    const moved = decode(record);
    const world = deserializeWorld(moved.world);
    const keeper = world.residents.find(({ identity }) => identity.stableId === fixture.actorId)!;
    const bio0 = deserializeBio0Ecology(moved.bio0Ecology);
    expect(keeper.activity?.restTask).toMatchObject({ cause: "urgent-rest", origin: "selected", phase: "approaching" });
    expect(keeper.activity?.poses.at(-1)?.position).not.toEqual(fixture.source);
    expect(moved.porterResponse).toEqual(initial.porterResponse);
    expect(bio0).not.toBeNull();
    expect(bio0?.porterAddress).toEqual(livingActorAddressForResident(createWorldView(world), keeper));
    expect(bio0?.porterAddress.position).toEqual(keeper.activity?.poses.at(-1)?.position);
    expect(bio0?.porterAddress).not.toEqual(originalBio0.porterAddress);
    const { porterAddress: _oldAddress, ...originalOtherRoots } = originalBio0;
    const { porterAddress: _newAddress, ...currentOtherRoots } = bio0!;
    expect(currentOtherRoots).toEqual(originalOtherRoots);
    close(runtime);

    const coldRepository = new MemoryRepository(record);
    const cold = await open(coldRepository);
    await cold.save();
    expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(moved));
    advanceOrdinaryFixedSteps(cold, 1);
    await cold.save();
    const continued = decode(coldRepository.snapshot());
    const continuedWorld = deserializeWorld(continued.world);
    const continuedKeeper = continuedWorld.residents.find(({ identity }) => identity.stableId === fixture.actorId)!;
    expect(continuedKeeper.activity?.poses).toHaveLength(6);
    expect(continuedKeeper.activity?.poses.at(-1)?.position).not.toEqual(keeper.activity?.poses.at(-1)?.position);
    expect(deserializeBio0Ecology(continued.bio0Ecology)?.porterAddress)
      .toEqual(livingActorAddressForResident(createWorldView(continuedWorld), continuedKeeper));
  }, 60_000);
});

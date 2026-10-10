import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import { assertWorldInvariants, createWorldView, deserializeWorld, FIXED_POINT, serializeWorld, type ResidentState } from "../sim/public";
import {
  RESIDENT_ACTIVITY_OWNER_ID,
  RESIDENT_ACTIVITY_VERSION,
  RESIDENT_REST_APPROACH_STEP_UNITS,
  RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION,
  RESIDENT_SERVICE_ACTIVITY_OWNER_ID,
  RESIDENT_SERVICE_ACTIVITY_VERSION,
} from "../sim/residentActivity";
import { residentRestTargetHasDrySupport, residentSettlementRestTarget } from "../sim/residentActivityWorld";
import { queryResidentAttentionState } from "../sim/residentAttention";
import { stableStringify } from "../sim/util";
import { deserializeBio0Ecology } from "./bio0Ecology";
import { livingActorAddressForResident } from "./livingActor";
import { gameSaveEnvelopeIntegrity } from "./physicalCargoState";
import { PLAYER_FOOT_MAX_WATER_DEPTH, type PlayerState } from "./player";
import { restorePlayerRegionalTravel } from "./regionalPlayerTravel";
import * as residentActivityExecution from "./residentActivityExecution";
import * as humanPerception from "./humanPerception";
import * as residentContactAcoustics from "./residentContactAcoustics";
import { residentRestSurfaceObservationId, residentRestSurfaceKnowledge } from "../sim/residentSurfaceKnowledge";
import * as simulation from "../sim/public";
import * as situatedExpressionChannelBank from "./situatedExpressionChannelBank";
import * as residentIntroductionAuthority from "./residentIntroductionAdmissionAuthority";
import { observableResidentRationUse, RESIDENT_CONVERSATION_RANGE_TILES } from "./projection";
import { pressureMultiplier } from "../sim/world";
import { tideAtTick, waterDepthAt } from "../sim/terrain";
import { playerWorldPositionInRegionalWindow, resolveResidentWorldPlacement } from "./residentSpatial";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import {
  CURRENT_GAME_SAVE_VERSION,
  FIRST_RESIDENT_ACTIVITY_GAME_SAVE_VERSION,
  FIRST_RESIDENT_TRAVEL_ENVIRONMENT_GAME_SAVE_VERSION,
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
  selection: "dry" | "wet-source" | "wet-target" | "keeper" | "nearby" | "nearby-contact" = "dry",
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
      || source === undefined || target === null) return [];
    const targetIsDry = residentRestTargetHasDrySupport(world, target);
    if (selection === "wet-target" ? targetIsDry : !targetIsDry) return [];
    // A surveyed native witness, not an assigned body, destination or tide.
    if (selection === "wet-target" && human.identity.stableId !== (seed === "marsh wait 41"
      ? "H-v1-p0p0-m0i8t-2-0o03jwb" : "H-v1-p0p0-19z0ujg-2-106voth")) return [];
    const sourceIsDry = residentRestTargetHasDrySupport(world, source);
    if (selection === "wet-source" ? sourceIsDry : !sourceIsDry) return [];
    const delta = worldPositionDelta(source, target);
    const approachDistance = Math.abs(delta.x) + Math.abs(delta.y);
    if (selection === "nearby" ? approachDistance !== 2 * WORLD_POSITION_UNITS_PER_TILE
      : selection !== "wet-source" && approachDistance !== WORLD_POSITION_UNITS_PER_TILE) return [];
    const playerDelta = worldPositionDelta(playerPosition, source);
    const distance = playerDelta.x * playerDelta.x + playerDelta.y * playerDelta.y;
    if ((selection === "nearby" || selection === "nearby-contact") && distance > (4 * WORLD_POSITION_UNITS_PER_TILE) ** 2) return [];
    return [{ human, source, target, distance }];
  }).sort((left, right) => (selection === "nearby-contact" ? left.human.identity.stableId.localeCompare(right.human.identity.stableId)
    : selection === "nearby" ? left.distance - right.distance : right.distance - left.distance)
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
    // The contact witness isolates one real approach using pressure, not
    // assigned tasks/bodies or guaranteed acoustic admission. Other fixtures
    // keep their original pressure and competing service behavior unchanged.
    if (selection === "nearby-contact" && human.id !== selected.human.id) human.needs.belonging = 900_000;
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

async function firstNativeFixture(selection: "wet-source" | "keeper" | "nearby" | "nearby-contact") {
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
    expect(CURRENT_GAME_SAVE_VERSION).toBe(FIRST_RESIDENT_TRAVEL_ENVIRONMENT_GAME_SAVE_VERSION);
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

  it("hears real sparse rest-approach contact anonymously without captions, replay or failed-closing side effects", async () => {
    // Native nearby geometry and body adoption; explicit rest/belonging,
    // weather/offer pressure isolates one real approach. No sound, body,
    // listening result, task or destination is assigned by this test.
    const fixture = await firstNativeFixture("nearby-contact");
    const derivations: { phase: number; facts: readonly residentContactAcoustics.ResidentContactAcousticFact[] }[] = [];
    const hearingFrames: {
      tick: number;
      samples: readonly humanPerception.PhysicalSoundSample[];
      phases: readonly humanPerception.HumanSoundSamplePhase[];
      batches: readonly Pick<humanPerception.HumanObservationBatch, "residentId" | "observerId" | "observations">[];
    }[] = [];
    const derive = residentContactAcoustics.deriveResidentContactAcoustics;
    vi.spyOn(residentContactAcoustics, "deriveResidentContactAcoustics").mockImplementation((...args) => {
      const facts = derive(...args);
      if (facts !== null) derivations.push({ phase: args[2], facts });
      return facts;
    });
    const collect = humanPerception.collectExistingHumanObservations;
    vi.spyOn(humanPerception, "collectExistingHumanObservations").mockImplementation((...args) => {
      const batches = collect(...args);
      const input = args[0];
      hearingFrames.push(structuredClone({
        tick: input.targetTick,
        samples: input.physicalSoundSamples ?? [],
        phases: input.soundSamplePhases ?? [],
        batches: batches.map(({ residentId, observerId, observations }) => ({ residentId, observerId, observations })),
      }));
      return batches;
    });

    const repository = new MemoryRepository(fixture.record);
    const runtime = await open(repository);
    soundscapePlay.mockClear();
    advanceOrdinaryFixedSteps(runtime, 4);
    await runtime.save();
    const phase4Record = repository.snapshot();
    const phase4 = decode(phase4Record);
    expect(phase4.perceptionCarry.playerStepsSinceWorldTick).toBe(4);
    advanceOrdinaryFixedSteps(runtime, 5);
    await runtime.save();
    const phase9Record = repository.snapshot();
    const phase9 = decode(phase9Record);
    expect(phase9.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    const source = resident(phase9, fixture.actorId);
    expect(source.activity?.restTask).toMatchObject({ cause: "urgent-rest", phase: "approaching", target: fixture.target });
    const fact = [...derivations].reverse().find(({ phase }) => phase === 9)?.facts
      .find(({ event }) => event.sourceId === fixture.actorId);
    if (fact === undefined) throw new Error("native nearby rest approach produced no bounded dry contact by phase9");
    expect(fact.phase).toBeGreaterThan(0);
    expect(fact.phase).toBeLessThanOrEqual(9);
    expect(fact.event).toMatchObject({ sourceCategory: "human", textualEligibility: "audio-only", accessibilityRelevance: "routine" });
    expect(fact.event.sourcePosition).toEqual(source.activity!.poses[fact.phase]!.position);
    const cell = ({ localX, localY }: WorldPosition) => [
      Math.floor(localX / WORLD_POSITION_UNITS_PER_TILE), Math.floor(localY / WORLD_POSITION_UNITS_PER_TILE),
    ];
    expect(cell(source.activity!.poses[fact.phase]!.position))
      .not.toEqual(cell(source.activity!.poses[fact.phase - 1]!.position));
    for (let phase = 1; phase < fact.phase; phase += 1) {
      expect(cell(source.activity!.poses[phase]!.position)).toEqual(cell(source.activity!.poses[phase - 1]!.position));
    }
    const ownAudio = () => soundscapePlay.mock.calls.filter(([, , seed]) => seed === fact.event.presentationVariantSeed);
    expect(ownAudio()).toHaveLength(1);
    expect(["step", "stumble", "impact"]).toContain(ownAudio()[0]![0]);
    expect(ownAudio()[0]![1]).toBeGreaterThan(0);
    expect(ownAudio()[0]![1]).toBeLessThanOrEqual(1);
    expect(Number.isFinite(ownAudio()[0]![3])).toBe(true);
    expect((runtime.getRenderView().acousticText ?? []).some(({ id }) => id === fact.event.eventId)).toBe(false);
    expect(runtime.getUIView().expressionCaption?.id).not.toBe(fact.event.eventId);

    hearingFrames.length = 0;
    advanceOrdinaryFixedSteps(runtime, 1);
    await runtime.save();
    const closedRecord = repository.snapshot();
    const closed = decode(closedRecord);
    expect(deserializeWorld(closed.world).meta.completedTick).toBe(fixture.tick + 1);
    expect(closed.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expect(ownAudio()).toHaveLength(1); // retained prefix is hearing, not another playback queue
    const closing = hearingFrames.find(({ samples }) => samples.some(({ id }) => id === fact.sample.id));
    if (closing === undefined) throw new Error("native rest contact did not enter the real closing hearing frame");
    expect(closing.tick).toBe(fixture.tick + 1);
    expect(closing.samples.filter(({ id }) => id === fact.sample.id)).toEqual([fact.sample]);
    expect(closing.phases.filter(({ sampleId }) => sampleId === fact.sample.id))
      .toEqual([{ sampleId: fact.sample.id, phase: fact.phase }]);
    const receipts = closing.batches.flatMap(({ residentId, observerId, observations }) => observations
      .filter(({ id }) => id === `hp-h-${closing.tick}-${residentId}-${fact.sample.id}`)
      .map((observation) => ({ observerId, observation })));
    expect(receipts.length).toBeGreaterThan(0);
    for (const { observerId, observation } of receipts) {
      expect(observerId).not.toBe(fixture.actorId);
      expect(observation).toMatchObject({ channel: "hearing", perceivedClass: fact.sample.soundClass,
        subjectId: null, identification: "anonymous", observedAtTick: fixture.tick + 1 });
      expect(observation.area.radiusUnits).toBeGreaterThanOrEqual(250);
    }
    close(runtime);

    for (const [prefixRecord, prefix] of [[phase4Record, phase4], [phase9Record, phase9]] as const) {
      const coldRepository = new MemoryRepository(prefixRecord);
      soundscapePlay.mockClear();
      const cold = await open(coldRepository);
      await cold.save();
      expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(prefix));
      expect(soundscapePlay).not.toHaveBeenCalled();
      hearingFrames.length = 0;
      advanceOrdinaryFixedSteps(cold, 10 - prefix.perceptionCarry.playerStepsSinceWorldTick);
      await cold.save();
      expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(closed));
      expect(ownAudio()).toHaveLength(fact.phase > prefix.perceptionCarry.playerStepsSinceWorldTick ? 1 : 0);
      expect(hearingFrames.find(({ samples }) => samples.some(({ id }) => id === fact.sample.id)))
        .toEqual(closing);
      close(cold);
    }

    // Hearing has genuinely run before this late rejection. Both its source
    // body prefix and every perception/save root must return to exact phase9.
    const failedRepository = new MemoryRepository(phase9Record);
    const failed = await open(failedRepository);
    const closure = vi.spyOn(situatedExpressionChannelBank, "closeSituatedExpressionChannelBankInterval")
      .mockReturnValueOnce(null);
    hearingFrames.length = 0;
    soundscapePlay.mockClear();
    advanceOrdinaryFixedStepsForExpectedFailure(failed, 1);
    expect(hearingFrames.find(({ samples }) => samples.some(({ id }) => id === fact.sample.id)))
      .toEqual(closing);
    expect(closure).toHaveBeenCalledTimes(1);
    expect(failed.getUIView().announcement?.message).toContain("INTEGRITY HALT");
    expect(soundscapePlay.mock.calls).toEqual([["warning", 1]]);
    await failed.save();
    const rolledBackRecord = failedRepository.snapshot();
    expect(authoritativeRoots(decode(rolledBackRecord))).toEqual(authoritativeRoots(phase9));
    closure.mockRestore();
    close(failed);
    const retryRepository = new MemoryRepository(rolledBackRecord);
    soundscapePlay.mockClear();
    const retry = await open(retryRepository);
    expect(soundscapePlay).not.toHaveBeenCalled();
    advanceOrdinaryFixedSteps(retry, 1);
    await retry.save();
    expect(authoritativeRoots(decode(retryRepository.snapshot()))).toEqual(authoritativeRoots(closed));
    expect(ownAudio()).toHaveLength(0);
    close(retry);

    const consumedRepository = new MemoryRepository(closedRecord);
    soundscapePlay.mockClear();
    const consumed = await open(consumedRepository);
    await consumed.save();
    expect(authoritativeRoots(decode(consumedRepository.snapshot()))).toEqual(authoritativeRoots(closed));
    expect(soundscapePlay).not.toHaveBeenCalled();
    // Once this actual one-tile approach arrives, further routine admission
    // must not manufacture another body tile entry for the stationary actor.
    advanceOrdinaryFixedSteps(consumed, 10);
    await consumed.save();
    expect(resident(decode(consumedRepository.snapshot()), fixture.actorId).activity?.restTask?.phase).toBe("arrived");
    derivations.length = 0;
    hearingFrames.length = 0;
    soundscapePlay.mockClear();
    advanceOrdinaryFixedSteps(consumed, 10);
    await consumed.save();
    expect(derivations.every(({ facts }) => facts.every(({ event }) => event.sourceId !== fixture.actorId))).toBe(true);
    expect(hearingFrames.every(({ samples }) => samples.every(({ id }) => id !== fact.sample.id))).toBe(true);
    expect(ownAudio()).toHaveLength(0);
    expect(resident(decode(consumedRepository.snapshot()), fixture.actorId).activity?.restTask?.phase).toBe("arrived");
  }, 180_000);

  it("leaves native foot-shallow ground for dry ration service without premature use, preserving cold egress and the real hourly transaction", async () => {
    const fixture = await firstNativeFixture("wet-source");
    const initial = decode(fixture.record);
    const initialWorld = deserializeWorld(initial.world);
    const chosen = initialWorld.residents.find(({ identity }) => identity.stableId === fixture.actorId)!;
    // Cause-only food pressure. Native terrain/tide, body, service, task and
    // arrival are not assigned; the existing runtime selects and executes.
    chosen.needs = { food: 900_000, rest: 100_000, belonging: 100_000 };
    chosen.condition.exhaustion = 100_000;
    for (const site of initialWorld.settlements) {
      for (const recipe of site.recipes) recipe.nextRunTick = fixture.tick + 1_000;
    }
    if (chosen.location.kind !== "settlement") throw new Error("Native shallow ration source lost its settlement");
    const settlementId = chosen.location.settlementId;
    const sourceTile = initialWorld.terrain.tiles[Math.floor(fixture.source.localY / 1_000)
      * initialWorld.terrain.width + Math.floor(fixture.source.localX / 1_000)]!;
    expect(waterDepthAt(sourceTile, initialWorld.tide)).toBeGreaterThan(0);
    expect(waterDepthAt(sourceTile, initialWorld.tide)).toBeLessThanOrEqual(PLAYER_FOOT_MAX_WATER_DEPTH);
    expect(residentRestTargetHasDrySupport(initialWorld, fixture.target)).toBe(true);
    assertWorldInvariants(initialWorld);
    initial.world = serializeWorld(initialWorld);
    const repository = new MemoryRepository(recordWith(fixture.record, initial));
    const runtime = await open(repository);
    const prefixes: Array<Readonly<{ record: SaveRecord; envelope: Envelope }>> = [];
    for (const steps of [4, 5]) {
      advanceOrdinaryFixedSteps(runtime, steps);
      await runtime.save();
      const record = repository.snapshot();
      const envelope = decode(record);
      const world = deserializeWorld(envelope.world);
      const moving = resident(envelope, fixture.actorId);
      expect(moving.activity?.version).toBe(RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION);
      expect(moving.activity?.rationTask).toMatchObject({ phase: "approaching", target: fixture.target, usedAtTick: null });
      expect(moving.activity?.restTask).toBeNull();
      expect(moving.activity!.poses.at(-1)!.position).not.toEqual(fixture.source);
      expectBoundedMotion(fixture.source, moving.activity!.poses);
      expect(world.meta.completedTick).toBe(fixture.tick);
      expect(waterDepthAt(sourceTile, world.tide)).toBeGreaterThan(0);
      expect(moving.needs.food).toBe(900_000);
      expect(moving.circadian).toMatchObject({ restDestinationArrived: false, posture: { state: "awake" } });
      expect(world.settlements.map(({ inventory }) => inventory)).toEqual(initialWorld.settlements.map(({ inventory }) => inventory));
      expect(world.ledger).toEqual(initialWorld.ledger);
      for (const { position } of moving.activity!.poses) {
        const tile = world.terrain.tiles[Math.floor(position.localY / 1_000)
          * world.terrain.width + Math.floor(position.localX / 1_000)]!;
        if (waterDepthAt(tile, world.tide) > 0) expect(tile.index).toBe(sourceTile.index);
      }
      prefixes.push({ record, envelope });
    }
    advanceOrdinaryFixedSteps(runtime, 1);
    await runtime.save();
    const closed = decode(repository.snapshot());
    expect(deserializeWorld(closed.world).meta.completedTick).toBe(fixture.tick + 1);
    expect(resident(closed, fixture.actorId).needs.food).toBe(900_000);
    advanceOrdinaryFixedSteps(runtime, 10);
    await runtime.save();
    const arrived = resident(decode(repository.snapshot()), fixture.actorId);
    expect(arrived.activity?.rationTask).toMatchObject({ phase: "arrived", usedAtTick: null });
    expect(arrived.activity?.poses[0]?.position).toEqual(fixture.target);
    expect(arrived.needs.food).toBe(900_000);
    expect(arrived.circadian).toMatchObject({ restDestinationArrived: false, posture: { state: "awake" } });
    // Existing hourly service remains the only finite stock/benefit owner.
    advanceOrdinaryFixedSteps(runtime, 579);
    await runtime.save();
    const beforeRecord = repository.snapshot();
    const before = decode(beforeRecord);
    const beforeWorld = deserializeWorld(before.world);
    expect(beforeWorld.meta.completedTick).toBe(fixture.tick + 59);
    expect(before.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    expect(resident(before, fixture.actorId).activity?.rationTask).toMatchObject({ phase: "arrived", usedAtTick: null });
    expect(resident(before, fixture.actorId).needs.food).toBe(900_000);
    advanceOrdinaryFixedSteps(runtime, 1);
    await runtime.save();
    const after = decode(repository.snapshot());
    const afterWorld = deserializeWorld(after.world);
    const used = resident(after, fixture.actorId);
    expect(used.activity?.rationTask).toMatchObject({ phase: "used", usedAtTick: fixture.tick + 60, foodUsed: true, waterUsed: true });
    const growth = Math.trunc(34_000 * pressureMultiplier(afterWorld.meta.pressureMode) / FIXED_POINT);
    expect(used.needs.food).toBe(900_000 + growth - 76_000);
    const stockBefore = beforeWorld.settlements.find(({ id }) => id === settlementId)!.inventory;
    const stockAfter = afterWorld.settlements.find(({ id }) => id === settlementId)!.inventory;
    expect(stockAfter.food).toBe(stockBefore.food - 1);
    expect(stockAfter.freshWater).toBe(stockBefore.freshWater - 1);
    expect(afterWorld.ledger.consumed.food).toBe(beforeWorld.ledger.consumed.food + 1);
    expect(afterWorld.ledger.consumed.freshWater).toBe(beforeWorld.ledger.consumed.freshWater + 1);
    assertWorldInvariants(afterWorld);
    close(runtime);

    for (const { record, envelope } of prefixes) {
      const coldRepository = new MemoryRepository(record);
      soundscapePlay.mockClear();
      const cold = await open(coldRepository);
      await cold.save();
      expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(envelope));
      expect(soundscapePlay).not.toHaveBeenCalled();
      advanceOrdinaryFixedSteps(cold, 10 - envelope.perceptionCarry.playerStepsSinceWorldTick);
      await cold.save();
      expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(closed));
      close(cold);
    }
    const coldRepository = new MemoryRepository(beforeRecord);
    const cold = await open(coldRepository);
    advanceOrdinaryFixedSteps(cold, 1);
    await cold.save();
    expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(after));
    const usedRecord = coldRepository.snapshot();
    close(cold);

    const failedRepository = new MemoryRepository(beforeRecord);
    const failed = await open(failedRepository);
    const actualStep = simulation.stepWorld;
    let attemptedUse = false;
    const stepSpy = vi.spyOn(simulation, "stepWorld").mockImplementation((...args) => {
      const result = actualStep(...args);
      expect(result.residents.find(({ identity }) => identity.stableId === fixture.actorId)!.activity?.rationTask?.phase).toBe("used");
      expect(result.ledger.consumed.food).toBe(beforeWorld.ledger.consumed.food + 1);
      attemptedUse = true;
      return result;
    });
    const closure = vi.spyOn(situatedExpressionChannelBank, "closeSituatedExpressionChannelBankInterval").mockReturnValueOnce(null);
    soundscapePlay.mockClear();
    advanceOrdinaryFixedStepsForExpectedFailure(failed, 1);
    expect(attemptedUse).toBe(true);
    expect(failed.getUIView().announcement?.message).toContain("INTEGRITY HALT");
    await failed.save();
    const rolledBackRecord = failedRepository.snapshot();
    expect(authoritativeRoots(decode(rolledBackRecord))).toEqual(authoritativeRoots(before));
    expect(soundscapePlay.mock.calls).toEqual([["warning", 1]]);
    stepSpy.mockRestore();
    closure.mockRestore();
    close(failed);

    const retryRepository = new MemoryRepository(rolledBackRecord);
    const retry = await open(retryRepository);
    advanceOrdinaryFixedSteps(retry, 1);
    await retry.save();
    expect(authoritativeRoots(decode(retryRepository.snapshot()))).toEqual(authoritativeRoots(after));
    close(retry);
    const consumedRepository = new MemoryRepository(usedRecord);
    soundscapePlay.mockClear();
    const consumed = await open(consumedRepository);
    await consumed.save();
    expect(authoritativeRoots(decode(consumedRepository.snapshot()))).toEqual(authoritativeRoots(after));
    expect(soundscapePlay).not.toHaveBeenCalled();
    advanceOrdinaryFixedSteps(consumed, 10);
    await consumed.save();
    expect(deserializeWorld(decode(consumedRepository.snapshot()).world).ledger.consumed).toEqual(afterWorld.ledger.consumed);
  }, 180_000);

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

  it("completes native shallow-origin civic approach through real hourly stock and project work, preserving cold use and rollback", async () => {
    const fixture = await firstNativeFixture("wet-source");
    const initial = decode(fixture.record);
    const initialWorld = deserializeWorld(initial.world);
    for (const human of initialWorld.residents) {
      human.needs = { food: 100_000, rest: 900_000, belonging: 100_000 };
      human.condition.exhaustion = 100_000;
    }
    const chosen = initialWorld.residents.find(({ identity }) => identity.stableId === fixture.actorId)!;
    // Native work disposition, stock and project are retained. The existing
    // fixture controls weather and offer timing; this case also controls
    // competing need pressure and recipes. No task/result/pose or tide is
    // assigned. This is not untouched population autonomy.
    expect(chosen.intention).toBe("work");
    chosen.needs = { food: 0, rest: 0, belonging: 400_000 };
    if (chosen.location.kind !== "settlement") throw new Error("Native wet civic source lost its settlement");
    const settlementId = chosen.location.settlementId;
    const site = initialWorld.settlements.find(({ id }) => id === settlementId)!;
    const projectId = site.project.id;
    const resource = site.project.resource;
    const initialProgress = site.project.progress;
    const sourceTile = initialWorld.terrain.tiles[Math.floor(fixture.source.localY / 1_000)
      * initialWorld.terrain.width + Math.floor(fixture.source.localX / 1_000)]!;
    expect(waterDepthAt(sourceTile, initialWorld.tide)).toBeGreaterThan(0);
    expect(waterDepthAt(sourceTile, initialWorld.tide)).toBeLessThanOrEqual(PLAYER_FOOT_MAX_WATER_DEPTH);
    expect(residentRestTargetHasDrySupport(initialWorld, fixture.target)).toBe(true);
    for (const settlement of initialWorld.settlements) {
      for (const recipe of settlement.recipes) recipe.nextRunTick = fixture.tick + 1_000;
    }
    assertWorldInvariants(initialWorld);
    initial.world = serializeWorld(initialWorld);
    const repository = new MemoryRepository(recordWith(fixture.record, initial));
    const runtime = await open(repository);
    const prefixes: Array<Readonly<{ record: SaveRecord; envelope: Envelope }>> = [];
    for (const steps of [4, 5]) {
      advanceOrdinaryFixedSteps(runtime, steps);
      await runtime.save();
      const record = repository.snapshot();
      const envelope = decode(record);
      const world = deserializeWorld(envelope.world);
      const moving = resident(envelope, fixture.actorId);
      expect(moving.activity?.version).toBe(RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION);
      expect(moving.activity?.materialTask).toMatchObject({ phase: "approaching", projectId, resource, usedAtTick: null });
      expect(moving.activity?.restTask).toBeNull();
      expect(moving.activity?.rationTask).toBeNull();
      expect(moving.activity!.poses.at(-1)!.position).not.toEqual(fixture.source);
      expectBoundedMotion(fixture.source, moving.activity!.poses);
      expect(world.meta.completedTick).toBe(fixture.tick);
      expect(waterDepthAt(sourceTile, world.tide)).toBeGreaterThan(0);
      expect(world.settlements.map(({ inventory, project }) => ({ inventory, project })))
        .toEqual(initialWorld.settlements.map(({ inventory, project }) => ({ inventory, project })));
      expect(world.ledger).toEqual(initialWorld.ledger);
      for (const { position } of moving.activity!.poses) {
        const tile = world.terrain.tiles[Math.floor(position.localY / 1_000)
          * world.terrain.width + Math.floor(position.localX / 1_000)]!;
        if (waterDepthAt(tile, world.tide) > 0) expect(tile.index).toBe(sourceTile.index);
      }
      prefixes.push({ record, envelope });
    }
    advanceOrdinaryFixedSteps(runtime, 1);
    await runtime.save();
    const closed = decode(repository.snapshot());
    expect(deserializeWorld(closed.world).meta.completedTick).toBe(fixture.tick + 1);
    advanceOrdinaryFixedSteps(runtime, 10);
    await runtime.save();
    const arrived = resident(decode(repository.snapshot()), fixture.actorId);
    expect(arrived.activity?.materialTask).toMatchObject({ phase: "arrived", usedAtTick: null });
    expect(arrived.activity?.poses[0]?.position).toEqual(fixture.target);
    advanceOrdinaryFixedSteps(runtime, 579);
    await runtime.save();
    const beforeRecord = repository.snapshot();
    const before = decode(beforeRecord);
    const beforeWorld = deserializeWorld(before.world);
    expect(beforeWorld.meta.completedTick).toBe(fixture.tick + 59);
    expect(before.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    expect(resident(before, fixture.actorId).activity?.materialTask).toMatchObject({ phase: "arrived", usedAtTick: null });
    expect(beforeWorld.settlements.find(({ id }) => id === settlementId)!.project.progress).toBe(initialProgress);
    advanceOrdinaryFixedSteps(runtime, 1);
    await runtime.save();
    const after = decode(repository.snapshot());
    const afterWorld = deserializeWorld(after.world);
    const contributed = afterWorld.settlements.find(({ id }) => id === settlementId)!;
    expect(resident(after, fixture.actorId).activity?.materialTask).toMatchObject({ phase: "used", usedAtTick: fixture.tick + 60 });
    expect(contributed.project.progress).toBe(initialProgress + 1);
    expect(contributed.inventory[resource]).toBe(beforeWorld.settlements.find(({ id }) => id === settlementId)!.inventory[resource] - 1);
    expect(afterWorld.ledger.consumed[resource]).toBe(beforeWorld.ledger.consumed[resource] + 1);
    assertWorldInvariants(afterWorld);
    close(runtime);

    for (const { record, envelope } of prefixes) {
      const coldRepository = new MemoryRepository(record);
      soundscapePlay.mockClear();
      const cold = await open(coldRepository);
      await cold.save();
      expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(envelope));
      expect(soundscapePlay).not.toHaveBeenCalled();
      advanceOrdinaryFixedSteps(cold, 10 - envelope.perceptionCarry.playerStepsSinceWorldTick);
      await cold.save();
      expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(closed));
      close(cold);
    }
    const coldRepository = new MemoryRepository(beforeRecord);
    const cold = await open(coldRepository);
    advanceOrdinaryFixedSteps(cold, 1);
    await cold.save();
    expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(after));
    const usedRecord = coldRepository.snapshot();
    close(cold);

    const failedRepository = new MemoryRepository(beforeRecord);
    const failed = await open(failedRepository);
    const actualStep = simulation.stepWorld;
    let attemptedUse = false;
    const stepSpy = vi.spyOn(simulation, "stepWorld").mockImplementation((...args) => {
      const result = actualStep(...args);
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
    const rolledBackRecord = failedRepository.snapshot();
    expect(authoritativeRoots(decode(rolledBackRecord))).toEqual(authoritativeRoots(before));
    expect(soundscapePlay.mock.calls).toEqual([["warning", 1]]);
    stepSpy.mockRestore();
    closure.mockRestore();
    close(failed);
    const retryRepository = new MemoryRepository(rolledBackRecord);
    const retry = await open(retryRepository);
    advanceOrdinaryFixedSteps(retry, 1);
    await retry.save();
    expect(authoritativeRoots(decode(retryRepository.snapshot()))).toEqual(authoritativeRoots(after));
    close(retry);

    const consumedRepository = new MemoryRepository(usedRecord);
    soundscapePlay.mockClear();
    const consumed = await open(consumedRepository);
    await consumed.save();
    expect(authoritativeRoots(decode(consumedRepository.snapshot()))).toEqual(authoritativeRoots(after));
    expect(soundscapePlay).not.toHaveBeenCalled();
    advanceOrdinaryFixedSteps(consumed, 10);
    await consumed.save();
    const next = deserializeWorld(decode(consumedRepository.snapshot()).world);
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
      expect(activity.pickupTask).toBeNull();
      expect(activity.travelTask).toBeNull();
      const { rationTask: _rationTask, materialTask: _materialTask, inspectionTask: _inspectionTask,
        pickupTask: _pickupTask, travelTask: _travelTask, ...body } = activity;
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
      human.activity?.version === RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION && human.activity.poses.length === 1
      && human.activity.rationTask === null
    ))).toBe(true);
    advanceOrdinaryFixedSteps(runtime, 1);
    await runtime.save();
    const next = decode(repository.snapshot());
    expect(next.perceptionCarry.playerStepsSinceWorldTick).toBe(1);
    expect(deserializeWorld(next.world).residents.every((human) => (
      human.activity?.version === RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION && human.activity.poses.length === 2
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
      if (activity?.version !== RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION || activity.materialTask !== null
        || activity.inspectionTask !== null || activity.pickupTask !== null || activity.travelTask !== null) {
        throw new Error("supported52 fixture requires a genuine civic-free body prefix");
      }
      const { materialTask: _materialTask, inspectionTask: _inspectionTask, pickupTask: _pickupTask,
        travelTask: _travelTask, ...body } = activity;
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
    expect(boundaryWorld.residents.every((human) => human.activity?.version === RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION
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

  it("leaves an actual native foot-shallow source for a dry refuge without phantom recovery, preserving cold work and rollback", async () => {
    const fixture = await firstNativeFixture("wet-source");
    const repository = new MemoryRepository(fixture.record);
    const runtime = await open(repository);
    const original = deserializeWorld(decode(fixture.record).world);
    expect(residentRestTargetHasDrySupport(original, fixture.source)).toBe(false);
    expect(residentRestTargetHasDrySupport(original, fixture.target)).toBe(true);
    const sourceTile = original.terrain.tiles[Math.floor(fixture.source.localY / WORLD_POSITION_UNITS_PER_TILE)
      * original.terrain.width + Math.floor(fixture.source.localX / WORLD_POSITION_UNITS_PER_TILE)]!;
    expect(waterDepthAt(sourceTile, original.tide)).toBeGreaterThan(0);
    expect(waterDepthAt(sourceTile, original.tide)).toBeLessThanOrEqual(PLAYER_FOOT_MAX_WATER_DEPTH);
    const originalTerrain = stableStringify(original.terrain);
    advanceOrdinaryFixedSteps(runtime, 4);
    await runtime.save();
    const middleRecord = repository.snapshot();
    const middle = decode(middleRecord);
    const approaching = resident(middle, fixture.actorId);
    expect(approaching.activity?.version).toBe(RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION);
    expect(approaching.activeContractId).toBeNull();
    expect(approaching.activity?.restTask).toMatchObject({
      cause: "urgent-rest", origin: "selected", phase: "approaching", target: fixture.target,
      waitReason: null,
    });
    expect(approaching.activity!.poses.at(-1)!.position).not.toEqual(fixture.source);
    for (let phase = 1; phase <= 4; phase += 1) {
      const delta = worldPositionDelta(approaching.activity!.poses[phase - 1]!.position,
        approaching.activity!.poses[phase]!.position);
      expect(Math.hypot(delta.x, delta.y)).toBeLessThanOrEqual(RESIDENT_REST_APPROACH_STEP_UNITS);
    }
    // The genuine420 tide is still wet. This is egress, not waiting for423 drying.
    expect(deserializeWorld(middle.world).meta.completedTick).toBe(fixture.tick);
    expect(waterDepthAt(sourceTile, deserializeWorld(middle.world).tide)).toBeGreaterThan(0);
    expect(approaching.condition.exhaustion).toBe(fixture.exhaustion);
    expect(approaching.circadian).toMatchObject({ restDestinationArrived: false, posture: { state: "awake" } });
    expect(stableStringify(deserializeWorld(middle.world).terrain)).toBe(originalTerrain);
    advanceOrdinaryFixedSteps(runtime, 5);
    await runtime.save();
    const phase9Record = repository.snapshot();
    const phase9 = decode(phase9Record);
    expect(phase9.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    const egressPrefix = resident(phase9, fixture.actorId).activity!.poses;
    expect(egressPrefix).toHaveLength(10);
    for (const { position } of egressPrefix) {
      const x = Math.floor(position.localX / WORLD_POSITION_UNITS_PER_TILE);
      const y = Math.floor(position.localY / WORLD_POSITION_UNITS_PER_TILE);
      const tile = original.terrain.tiles[y * original.terrain.width + x]!;
      const depth = waterDepthAt(tile, original.tide);
      if (depth > 0) {
        expect(tile.index).toBe(sourceTile.index);
        expect(depth).toBeLessThanOrEqual(PLAYER_FOOT_MAX_WATER_DEPTH);
      }
    }
    advanceOrdinaryFixedSteps(runtime, 1);
    await runtime.save();
    const uninterrupted = decode(repository.snapshot());
    const afterWorld = resident(uninterrupted, fixture.actorId);
    expect(afterWorld.activity?.poses[0]?.position).not.toEqual(fixture.source);
    expect(afterWorld.activity?.restTask?.phase).toBe("approaching");
    expect(afterWorld.condition.exhaustion).toBe(fixture.exhaustion);
    expect(afterWorld.circadian?.restDestinationArrived).toBe(false);
    expect(deserializeWorld(uninterrupted.world).meta.completedTick).toBe(fixture.tick + 1);
    advanceOrdinaryFixedSteps(runtime, 9);
    await runtime.save();
    const beforeArrivalRecord = repository.snapshot();
    const beforeArrival = decode(beforeArrivalRecord);
    expect(deserializeWorld(beforeArrival.world).meta.completedTick).toBe(fixture.tick + 1);
    expect(beforeArrival.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    expect(resident(beforeArrival, fixture.actorId).condition.exhaustion).toBe(fixture.exhaustion);
    advanceOrdinaryFixedSteps(runtime, 1);
    await runtime.save();
    const arrived = decode(repository.snapshot());
    expect(deserializeWorld(arrived.world).meta.completedTick).toBe(fixture.tick + 2);
    const rested = resident(arrived, fixture.actorId);
    expect(rested.activity?.poses[0]?.position).toEqual(fixture.target);
    expect(rested.activity?.restTask?.phase).toBe("arrived");
    expect(rested.circadian).toMatchObject({ restDestinationArrived: true, posture: { state: "resting" } });
    expect(rested.condition.exhaustion).toBeLessThan(fixture.exhaustion);
    expect(stableStringify(deserializeWorld(arrived.world).terrain)).toBe(originalTerrain);
    assertWorldInvariants(deserializeWorld(arrived.world));
    close(runtime);

    for (const [prefixRecord, prefix] of [[middleRecord, middle], [phase9Record, phase9]] as const) {
      const coldRepository = new MemoryRepository(prefixRecord);
      soundscapePlay.mockClear();
      const cold = await open(coldRepository);
      await cold.save();
      expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(prefix));
      expect(soundscapePlay).not.toHaveBeenCalled();
      advanceOrdinaryFixedSteps(cold, 10 - prefix.perceptionCarry.playerStepsSinceWorldTick);
      await cold.save();
      expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(uninterrupted));
      advanceOrdinaryFixedSteps(cold, 10);
      await cold.save();
      expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(arrived));
      close(cold);
    }

    // Reject after the genuine dry arrival/recovery attempted at422. Neither
    // that result nor acoustic playback may escape the failed transaction.
    const failedRepository = new MemoryRepository(beforeArrivalRecord);
    const failed = await open(failedRepository);
    const attemptedRecovery: Array<Readonly<{ position: WorldPosition; exhaustion: number; phase: string | undefined }>> = [];
    const actualStepWorld = simulation.stepWorld;
    const worldStep = vi.spyOn(simulation, "stepWorld").mockImplementation((...args) => {
      const result = actualStepWorld(...args);
      if (args[0].meta.completedTick === fixture.tick + 2) {
        const human = args[0].residents.find(({ identity }) => identity.stableId === fixture.actorId);
        if (human?.activity !== undefined) attemptedRecovery.push({
          position: human.activity.poses[0]!.position, exhaustion: human.condition.exhaustion,
          phase: human.activity.restTask?.phase,
        });
      }
      return result;
    });
    const closure = vi.spyOn(situatedExpressionChannelBank, "closeSituatedExpressionChannelBankInterval")
      .mockReturnValueOnce(null);
    soundscapePlay.mockClear();
    advanceOrdinaryFixedStepsForExpectedFailure(failed, 1);
    expect(closure).toHaveBeenCalledTimes(1);
    expect(attemptedRecovery.some(({ position, exhaustion, phase }) => phase === "arrived"
      && stableStringify(position) === stableStringify(fixture.target) && exhaustion < fixture.exhaustion)).toBe(true);
    expect(failed.getUIView().announcement?.message).toContain("INTEGRITY HALT");
    expect(soundscapePlay.mock.calls).toEqual([["warning", 1]]);
    await failed.save();
    const rolledBackRecord = failedRepository.snapshot();
    expect(authoritativeRoots(decode(rolledBackRecord))).toEqual(authoritativeRoots(beforeArrival));
    closure.mockRestore();
    worldStep.mockRestore();
    close(failed);
    const retryRepository = new MemoryRepository(rolledBackRecord);
    soundscapePlay.mockClear();
    const retry = await open(retryRepository);
    expect(soundscapePlay).not.toHaveBeenCalled();
    advanceOrdinaryFixedSteps(retry, 1);
    await retry.save();
    expect(authoritativeRoots(decode(retryRepository.snapshot()))).toEqual(authoritativeRoots(arrived));
    close(retry);
  }, 120_000);

  it.each([
    { seed: "marsh wait", observed: false },
    { seed: "marsh wait 41", observed: true },
    { seed: "marsh wait 41", observed: false },
  ])("waits at a native tidal target ($seed, observed-water hold=$observed) with equal cold continuation", async ({ seed, observed }) => {
    const fixture = await restFixture("wet-target", seed);
    expect(fixture.actorId).toBe(seed === "marsh wait" ? "H-v1-p0p0-19z0ujg-2-106voth" : "H-v1-p0p0-m0i8t-2-0o03jwb");
    expect(fixture.tick).toBe(420);
    expect(fixture.source).toEqual(seed === "marsh wait"
      ? { region: { x: 0, y: 0 }, localX: 87_500, localY: 28_500 }
      : { region: { x: 0, y: 0 }, localX: 81_500, localY: 29_500 });
    expect(fixture.target).toEqual(seed === "marsh wait"
      ? { region: { x: 0, y: 0 }, localX: 88_500, localY: 28_500 }
      : { region: { x: 0, y: 0 }, localX: 82_500, localY: 29_500 });
    const original = deserializeWorld(decode(fixture.record).world);
    expect(residentRestTargetHasDrySupport(original, fixture.source)).toBe(true);
    expect(residentRestTargetHasDrySupport(original, fixture.target)).toBe(false);
    expect(residentRestTargetHasDrySupport({ ...original, tide: tideAtTick(fixture.tick + 1) }, fixture.target)).toBe(false);
    expect(residentRestTargetHasDrySupport({ ...original, tide: tideAtTick(fixture.tick + 2) }, fixture.target)).toBe(true);
    const originalTerrain = stableStringify(original.terrain);
    if (!observed) {
      // Honest missing-observation counterfactual. Keep every other production
      // observation, actual tide/body/task and accepted step unchanged.
      const collect = humanPerception.collectExistingHumanObservations;
      const id = residentRestSurfaceObservationId(fixture.actorId, fixture.target);
      vi.spyOn(humanPerception, "collectExistingHumanObservations").mockImplementation((...args) => {
        const batches = collect(...args);
        if (humanPerception.humanObservationCollectionRejected(batches)) return batches;
        return batches.map((batch) => batch.observerId === fixture.actorId
          ? { ...batch, observations: batch.observations.filter((observation) => observation.id !== id) } : batch);
      });
    }
    const repository = new MemoryRepository(fixture.record);
    const runtime = await open(repository);
    let acceptedSteps = 0;
    const advanceTo = async (steps: number): Promise<SaveRecord> => {
      advanceOrdinaryFixedSteps(runtime, steps - acceptedSteps);
      acceptedSteps = steps;
      await runtime.save();
      const record = repository.snapshot();
      const envelope = decode(record);
      const world = deserializeWorld(envelope.world);
      expect(envelope.perceptionCarry.playerStepsSinceWorldTick).toBe(steps % 10);
      expect(world.meta.completedTick).toBe(fixture.tick + Math.floor(steps / 10));
      expect(world.tide).toEqual(tideAtTick(world.meta.completedTick));
      expect(stableStringify(world.terrain)).toBe(originalTerrain);
      expect(residentRestTargetHasDrySupport(world, fixture.source)).toBe(true);
      assertWorldInvariants(world);
      return record;
    };

    for (const steps of [4, 14]) {
      const waiting = resident(decode(await advanceTo(steps)), fixture.actorId);
      expect(waiting.activity?.restTask).toMatchObject({
        cause: "urgent-rest", origin: "selected", phase: "waiting", target: fixture.target,
        selectedAtTick: fixture.tick, lastProgressAtTick: fixture.tick,
        waitReason: observed && steps >= 10 ? "observed-water" : "no-traversable-route",
        nextReassessmentAtTick: fixture.tick + Math.floor(steps / 10) + 1,
      });
      expect(waiting.activity?.poses.every(({ position }) => stableStringify(position) === stableStringify(fixture.source))).toBe(true);
      expect(waiting.condition.exhaustion).toBe(fixture.exhaustion);
      expect(waiting.circadian).toMatchObject({ restDestinationArrived: false, posture: { state: "awake" } });
    }
    const waitingRecord = await advanceTo(observed ? 29 : 19);
    const waiting = decode(waitingRecord);
    expect(resident(waiting, fixture.actorId).activity?.restTask).toMatchObject({
      phase: "waiting", waitReason: observed ? "observed-water" : "no-traversable-route",
      nextReassessmentAtTick: fixture.tick + (observed ? 3 : 2),
    });
    expect(residentRestTargetHasDrySupport(deserializeWorld(waiting.world), fixture.target)).toBe(observed);
    if (observed) {
      // Sight of physical421 was admitted422 before the new tide: it still
      // says wet. Dry physics alone must not erase the committed known hold.
      expect(residentRestSurfaceKnowledge(resident(waiting, fixture.actorId).perception, fixture.target, 422)).toBe("wet");
      expect(resident(waiting, fixture.actorId).activity?.poses.every(({ position }) => stableStringify(position) === stableStringify(fixture.source))).toBe(true);
    }

    // The real world boundary advances tide and retries. It cannot move the
    // body or grant recovery before subsequent accepted physical steps.
    const dryBoundary = decode(await advanceTo(observed ? 30 : 20));
    const retrying = resident(dryBoundary, fixture.actorId);
    expect(residentRestTargetHasDrySupport(deserializeWorld(dryBoundary.world), fixture.target)).toBe(true);
    expect(retrying.activity?.restTask).toMatchObject({ phase: "approaching", waitReason: null, selectedAtTick: fixture.tick });
    expect(retrying.activity?.poses[0]?.position).toEqual(fixture.source);
    expect(retrying.condition.exhaustion).toBe(fixture.exhaustion);
    expect(retrying.circadian?.restDestinationArrived).toBe(false);
    if (observed) expect(residentRestSurfaceKnowledge(retrying.perception, fixture.target, 423)).toBe("dry");

    const moving = resident(decode(await advanceTo(observed ? 34 : 24)), fixture.actorId);
    expect(moving.activity?.restTask?.phase).toBe("approaching");
    expect(moving.activity?.poses.at(-1)?.position).not.toEqual(fixture.source);
    expect(moving.condition.exhaustion).toBe(fixture.exhaustion);
    expectBoundedMotion(fixture.source, moving.activity!.poses);
    const final = decode(await advanceTo(observed ? 40 : 30));
    const arrived = resident(final, fixture.actorId);
    expect(arrived.activity?.restTask).toMatchObject({ phase: "arrived", selectedAtTick: fixture.tick });
    expect(arrived.activity?.poses[0]?.position).toEqual(fixture.target);
    expect(arrived.circadian).toMatchObject({ restDestinationArrived: true, posture: { state: "resting" } });
    expect(arrived.condition.exhaustion).toBeLessThan(fixture.exhaustion);
    close(runtime);

    soundscapePlay.mockClear();
    const coldRepository = new MemoryRepository(waitingRecord);
    const cold = await open(coldRepository);
    await cold.save();
    expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(waiting));
    expect(soundscapePlay).not.toHaveBeenCalled();
    advanceOrdinaryFixedSteps(cold, 11);
    await cold.save();
    expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(final));
    if (observed) {
      // Later failure must restore the original wet belief and held task even
      // after the real dry receipt/reassessment was prepared in this step.
      close(cold);
      const failedRepository = new MemoryRepository(waitingRecord);
      const failed = await open(failedRepository);
      const closure = vi.spyOn(situatedExpressionChannelBank, "closeSituatedExpressionChannelBankInterval")
        .mockReturnValueOnce(null);
      soundscapePlay.mockClear();
      advanceOrdinaryFixedStepsForExpectedFailure(failed, 1);
      expect(closure).toHaveBeenCalled();
      expect(failed.getUIView().announcement?.message).toContain("INTEGRITY HALT");
      await failed.save();
      expect(authoritativeRoots(decode(failedRepository.snapshot()))).toEqual(authoritativeRoots(waiting));
      // The integrity notification is not committed world audio. No pending
      // vocal, contact or movement cue may escape the rejected interval.
      expect(soundscapePlay.mock.calls).toEqual([["warning", 1]]);
      closure.mockRestore();
    }
    // The no-observation branch retains physical retry, not informed safety.
    // Neither branch establishes wider crossing knowledge or route choice.
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

  it("uses native first-hour civic material without authored pressure and preserves exact cold closing work", async () => {
    // Unlike the controlled service fixtures above, this is untouched new-world
    // eligibility. No need, weather, recipe, offer, stock, position or task is
    // assigned, and no particular resident is declared the successful worker.
    const repository = new MemoryRepository();
    const runtime = await open(repository);
    runtime.dispatchUI({ type: "new-world", seed: "runtime baseline estuary", posture: "journey", sessionShape: "wander" });
    await runtime.save();
    const initial = decode(repository.snapshot());
    const initialWorld = deserializeWorld(initial.world);
    expect(initialWorld.meta.completedTick).toBe(420);
    expect(initial.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expect(initialWorld.residents.every((human) => !Object.hasOwn(human, "activity"))).toBe(true);
    const cohort = initialWorld.residents.map(({ id, identity }) => ({ id, identity }));
    assertWorldInvariants(initialWorld);

    advanceOrdinaryFixedSteps(runtime, 599);
    await runtime.save();
    const beforeRecord = repository.snapshot();
    const before = decode(beforeRecord);
    const beforeWorld = deserializeWorld(before.world);
    expect(beforeWorld.meta.completedTick).toBe(479);
    expect(before.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    expect(beforeWorld.residents.map(({ id, identity }) => ({ id, identity }))).toEqual(cohort);
    expect(beforeWorld.settlements.map(({ id, project }) => ({ id, project })))
      .toEqual(initialWorld.settlements.map(({ id, project }) => ({ id, project })));
    expect(beforeWorld.residents.some(({ activity }) => activity?.materialTask?.phase === "arrived")).toBe(true);
    assertWorldInvariants(beforeWorld);

    // Read-only observation of the single real closing call: capture its final
    // phase10 body and aggregate accounting, not a second execution/simulator.
    const capture = (world: ReturnType<typeof deserializeWorld>) => structuredClone({
      tick: world.meta.completedTick,
      residents: world.residents.map(({ id, identity, location, activity }) => ({
        id, actorId: identity.stableId, location,
        materialTask: activity?.materialTask ?? null,
        rationTask: activity?.rationTask ?? null,
        pose: activity?.poses.at(-1) ?? null,
      })),
      settlements: world.settlements.map(({ id, inventory, project, recipes }) => ({ id, inventory, project, recipes })),
      ledger: world.ledger,
    });
    let closingInput: ReturnType<typeof capture> | undefined;
    let closingOutput: ReturnType<typeof capture> | undefined;
    const originalStep = simulation.stepWorld;
    const observer = vi.spyOn(simulation, "stepWorld").mockImplementation((...args) => {
      expect(args[0].meta.completedTick).toBe(479);
      expect(closingInput).toBeUndefined();
      closingInput = capture(args[0]);
      const result = originalStep(...args);
      closingOutput = capture(result);
      return result;
    });
    try {
      advanceOrdinaryFixedSteps(runtime, 1);
    } finally {
      observer.mockRestore();
    }
    expect(closingInput).toBeDefined();
    expect(closingOutput).toBeDefined();
    const source = closingInput!;
    const committed = closingOutput!;
    expect(source.tick).toBe(479);
    expect(committed.tick).toBe(480);
    await runtime.save();
    const afterRecord = repository.snapshot();
    const after = decode(afterRecord);
    const afterWorld = deserializeWorld(after.world);
    expect(afterWorld.meta.completedTick).toBe(480);
    expect(after.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expect(afterWorld.residents.map(({ id, identity }) => ({ id, identity }))).toEqual(cohort);
    expect(capture(afterWorld).settlements).toEqual(committed.settlements);
    expect(afterWorld.ledger).toEqual(committed.ledger);
    expect(afterWorld.events.filter(({ type }) => type === "contract-fulfilled"))
      .toEqual(initialWorld.events.filter(({ type }) => type === "contract-fulfilled"));
    expect(afterWorld.contracts.every(({ cargoQuantity }) => cargoQuantity === 0)).toBe(true);

    const users = committed.residents.filter(({ materialTask }) => materialTask?.phase === "used"
      && materialTask.usedAtTick === committed.tick);
    expect(users.length).toBeGreaterThan(0);
    // Default food baselines do not establish an urgent ration before480.
    expect(committed.residents.some(({ rationTask }) => rationTask?.phase === "used")).toBe(false);
    for (const user of users) {
      const task = user.materialTask!;
      const prior = source.residents.find(({ actorId }) => actorId === user.actorId)!;
      expect(prior.materialTask).toMatchObject({
        kind: "settlement-material", phase: "arrived", usedAtTick: null,
        projectId: task.projectId, settlementId: task.settlementId, resource: task.resource, target: task.target,
      });
      expect(task.selectedAtTick).toBeLessThan(committed.tick);
      expect(prior.pose?.position).toEqual(task.target);
      expect(user.pose?.position).toEqual(task.target);
      expect(user.location).toEqual({ kind: "settlement", settlementId: task.settlementId });
      expect(residentRestTargetHasDrySupport(afterWorld, task.target)).toBe(true);
      expect(resident(after, user.actorId).activity?.materialTask).toMatchObject({
        phase: "used", projectId: task.projectId, resource: task.resource, usedAtTick: committed.tick,
      });
    }

    const productionConsumed = { ...source.ledger.consumed };
    const productionProduced = { ...productionConsumed };
    const materialConsumed = { ...productionConsumed };
    for (const resource of simulation.RESOURCE_KINDS) {
      productionConsumed[resource] = 0;
      productionProduced[resource] = 0;
      materialConsumed[resource] = 0;
    }
    for (const site of source.settlements) {
      const next = committed.settlements.find(({ id }) => id === site.id)!;
      const siteUsers = users.filter(({ materialTask }) => materialTask!.settlementId === site.id);
      const contribution = next.project.progress - site.project.progress;
      expect([0, 1]).toContain(contribution);
      expect(siteUsers).toHaveLength(contribution);
      expect(next.project.id).toBe(site.project.id);
      const stock = { ...site.inventory };
      // Native scheduled production remains enabled. Account each actual due
      // recipe's declared inputs/outputs before checking the physical debit.
      for (const recipe of site.recipes) {
        if (recipe.nextRunTick > committed.tick) continue;
        if (recipe.inputs.every(({ resource, amount }) => stock[resource] >= amount)) {
          for (const { resource, amount } of recipe.inputs) {
            stock[resource] -= amount;
            productionConsumed[resource] += amount;
          }
          for (const { resource, amount } of recipe.outputs) {
            stock[resource] += amount;
            productionProduced[resource] += amount;
          }
        }
        expect(next.recipes.find(({ id }) => id === recipe.id)?.nextRunTick)
          .toBe(recipe.nextRunTick + recipe.intervalTicks);
      }
      if (contribution === 1) {
        expect(siteUsers[0]!.materialTask!.projectId).toBe(site.project.id);
        expect(siteUsers[0]!.materialTask!.resource).toBe(site.project.resource);
        expect(stock[site.project.resource]).toBeGreaterThanOrEqual(1);
        stock[site.project.resource] -= 1;
        materialConsumed[site.project.resource] += 1;
      }
      expect(next.inventory).toEqual(stock);
    }
    for (const resource of simulation.RESOURCE_KINDS) {
      expect(committed.ledger.produced[resource] - source.ledger.produced[resource]).toBe(productionProduced[resource]);
      expect(committed.ledger.consumed[resource] - source.ledger.consumed[resource])
        .toBe(productionConsumed[resource] + materialConsumed[resource]);
    }
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
    close(cold);

    soundscapePlay.mockClear();
    const usedRepository = new MemoryRepository(afterRecord);
    const used = await open(usedRepository);
    await used.save();
    expect(authoritativeRoots(decode(usedRepository.snapshot()))).toEqual(authoritativeRoots(after));
    expect(soundscapePlay).not.toHaveBeenCalled();
    advanceOrdinaryFixedSteps(used, 10);
    await used.save();
    const continued = deserializeWorld(decode(usedRepository.snapshot()).world);
    expect(continued.meta.completedTick).toBe(481);
    expect(continued.ledger).toEqual(afterWorld.ledger);
    expect(continued.settlements.map(({ id, inventory, project }) => ({ id, inventory, project })))
      .toEqual(afterWorld.settlements.map(({ id, inventory, project }) => ({ id, inventory, project })));
    assertWorldInvariants(continued);
    // Mocked-clock runtime correctness, not rendered play or performance proof.
  }, 180_000);

  it("uses native second-hour rations without authored pressure and preserves exact cold closing work", async () => {
    // One untouched seed, not a survey or an assigned successful service. Native
    // needs, weather, recipes, contracts, stock, terrain, bodies and tasks stay live.
    const repository = new MemoryRepository();
    const runtime = await open(repository);
    runtime.dispatchUI({ type: "new-world", seed: "runtime baseline estuary", posture: "journey", sessionShape: "wander" });
    await runtime.save();
    const initial = decode(repository.snapshot());
    const initialWorld = deserializeWorld(initial.world);
    expect(initial.version).toBe(FIRST_RESIDENT_TRAVEL_ENVIRONMENT_GAME_SAVE_VERSION);
    expect(initialWorld.meta.completedTick).toBe(420);
    expect(initial.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expect(initialWorld.residents.every((human) => !Object.hasOwn(human, "activity"))).toBe(true);
    const cohort = initialWorld.residents.map(({ id, identity }) => ({ id, identity }));
    assertWorldInvariants(initialWorld);

    advanceOrdinaryFixedSteps(runtime, 1_199);
    await runtime.save();
    const beforeRecord = repository.snapshot();
    const before = decode(beforeRecord);
    const beforeWorld = deserializeWorld(before.world);
    expect(beforeWorld.meta.completedTick).toBe(539);
    expect(before.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    expect(beforeWorld.residents.map(({ id, identity }) => ({ id, identity }))).toEqual(cohort);
    expect(beforeWorld.residents.every(({ activity }) => activity?.version === RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION))
      .toBe(true);
    expect(beforeWorld.residents.some(({ activity }) => activity?.rationTask?.phase === "arrived"
      && activity.rationTask.usedAtTick === null)).toBe(true);
    assertWorldInvariants(beforeWorld);

    // Observe only the original closing call. Its input contains the accepted
    // phase10 poses; output contains the actual recipe, ration and civic commits.
    const capture = (world: ReturnType<typeof deserializeWorld>) => structuredClone({
      tick: world.meta.completedTick,
      residents: world.residents.map(({ id, identity, location, needs, activity }) => ({
        id, actorId: identity.stableId, location, needs,
        materialTask: activity?.materialTask ?? null,
        rationTask: activity?.rationTask ?? null,
        pose: activity?.poses.at(-1) ?? null,
      })),
      settlements: world.settlements.map(({ id, inventory, project, recipes }) => ({ id, inventory, project, recipes })),
      ledger: world.ledger,
    });
    let closingInput: ReturnType<typeof capture> | undefined;
    let closingOutput: ReturnType<typeof capture> | undefined;
    const originalStep = simulation.stepWorld;
    const observer = vi.spyOn(simulation, "stepWorld").mockImplementation((...args) => {
      expect(args[0].meta.completedTick).toBe(539);
      expect(closingInput).toBeUndefined();
      closingInput = capture(args[0]);
      const result = originalStep(...args);
      closingOutput = capture(result);
      return result;
    });
    try {
      advanceOrdinaryFixedSteps(runtime, 1);
    } finally {
      observer.mockRestore();
    }
    expect(closingInput).toBeDefined();
    expect(closingOutput).toBeDefined();
    const source = closingInput!;
    const committed = closingOutput!;
    expect(source.tick).toBe(539);
    expect(committed.tick).toBe(540);
    await runtime.save();
    const afterRecord = repository.snapshot();
    const after = decode(afterRecord);
    const afterWorld = deserializeWorld(after.world);
    expect(afterWorld.meta.completedTick).toBe(540);
    expect(after.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expect(afterWorld.residents.map(({ id, identity }) => ({ id, identity }))).toEqual(cohort);
    expect(capture(afterWorld).settlements).toEqual(committed.settlements);
    expect(afterWorld.ledger).toEqual(committed.ledger);
    expect(afterWorld.events.filter(({ type }) => type === "contract-fulfilled"))
      .toEqual(initialWorld.events.filter(({ type }) => type === "contract-fulfilled"));
    expect(afterWorld.contracts.every(({ cargoQuantity }) => cargoQuantity === 0)).toBe(true);
    expect(committed.residents.map(({ id, actorId, location }) => ({ id, actorId, location })))
      .toEqual(source.residents.map(({ id, actorId, location }) => ({ id, actorId, location })));

    const users = committed.residents.filter(({ rationTask }) => rationTask?.phase === "used"
      && rationTask.usedAtTick === committed.tick);
    expect(users.length).toBeGreaterThan(0);
    for (const user of users) {
      const task = user.rationTask!;
      const prior = source.residents.find(({ actorId }) => actorId === user.actorId)!;
      expect(prior.rationTask).toMatchObject({
        kind: "settlement-ration", phase: "arrived", usedAtTick: null,
        selectedAtTick: task.selectedAtTick, settlementId: task.settlementId, target: task.target,
        foodUsed: false, waterUsed: false,
      });
      expect(task.selectedAtTick).toBeLessThan(committed.tick);
      expect(prior.pose?.position).toEqual(task.target);
      expect(user.pose?.position).toEqual(task.target);
      expect(user.location).toEqual({ kind: "settlement", settlementId: task.settlementId });
      expect(residentRestTargetHasDrySupport(afterWorld, task.target)).toBe(true);
      expect(resident(after, user.actorId).activity?.rationTask).toEqual(task);
      expect(observableResidentRationUse(resident(after, user.actorId))).toBe(true);
    }

    const materialUsers = committed.residents.filter(({ materialTask }) => materialTask?.phase === "used"
      && materialTask.usedAtTick === committed.tick);
    const productionConsumed = { ...source.ledger.consumed };
    const productionProduced = { ...productionConsumed };
    const serviceConsumed = { ...productionConsumed };
    for (const resource of simulation.RESOURCE_KINDS) {
      productionConsumed[resource] = 0;
      productionProduced[resource] = 0;
      serviceConsumed[resource] = 0;
    }
    const growth = Math.trunc(34_000 * pressureMultiplier(afterWorld.meta.pressureMode) / FIXED_POINT);
    for (const site of source.settlements) {
      const next = committed.settlements.find(({ id }) => id === site.id)!;
      const stock = { ...site.inventory };
      // Production precedes needs and civic work; preserve its real source costs.
      for (const recipe of site.recipes) {
        if (recipe.nextRunTick > committed.tick) continue;
        if (recipe.inputs.every(({ resource, amount }) => stock[resource] >= amount)) {
          for (const { resource, amount } of recipe.inputs) {
            stock[resource] -= amount;
            productionConsumed[resource] += amount;
          }
          for (const { resource, amount } of recipe.outputs) {
            stock[resource] += amount;
            productionProduced[resource] += amount;
          }
        }
        expect(next.recipes.find(({ id }) => id === recipe.id)?.nextRunTick)
          .toBe(recipe.nextRunTick + recipe.intervalTicks);
      }

      const present = source.residents.filter(({ location }) => location.kind === "settlement"
        && location.settlementId === site.id)
        .sort((left, right) => left.actorId < right.actorId ? -1 : left.actorId > right.actorId ? 1 : 0);
      const siteUsers = users.filter(({ rationTask }) => rationTask!.settlementId === site.id);
      const usedIds = new Set(siteUsers.map(({ actorId }) => actorId));
      const budget = Math.ceil(present.length / 3);
      const foodAvailable = budget > 0 && stock.food >= budget;
      const waterAvailable = budget > 0 && stock.freshWater >= budget;
      let groupsUsed = 0;
      for (let start = 0; start < present.length; start += 3) {
        if (present.slice(start, start + 3).some(({ actorId }) => usedIds.has(actorId))) groupsUsed += 1;
      }
      const foodConsumed = foodAvailable ? groupsUsed : 0;
      const waterConsumed = waterAvailable ? groupsUsed : 0;
      stock.food -= foodConsumed;
      stock.freshWater -= waterConsumed;
      serviceConsumed.food += foodConsumed;
      serviceConsumed.freshWater += waterConsumed;
      for (const prior of present) {
        const nextResident = committed.residents.find(({ actorId }) => actorId === prior.actorId)!;
        const used = usedIds.has(prior.actorId);
        const relief = used ? (foodAvailable ? 68_000 : 0) + (waterAvailable ? 8_000 : 0) : 0;
        expect(nextResident.needs.food).toBe(Math.max(0, Math.min(FIXED_POINT, prior.needs.food + growth - relief)));
        if (used) {
          expect(nextResident.rationTask).toMatchObject({ foodUsed: foodAvailable, waterUsed: waterAvailable });
          expect(foodAvailable || waterAvailable).toBe(true);
        }
      }

      const workers = materialUsers.filter(({ materialTask }) => materialTask!.settlementId === site.id);
      const contribution = next.project.progress - site.project.progress;
      expect([0, 1]).toContain(contribution);
      expect(workers).toHaveLength(contribution);
      expect(next.project.id).toBe(site.project.id);
      if (contribution === 1) {
        const task = workers[0]!.materialTask!;
        const prior = source.residents.find(({ actorId }) => actorId === workers[0]!.actorId)!;
        expect(prior.materialTask).toMatchObject({ phase: "arrived", usedAtTick: null, target: task.target });
        expect(prior.pose?.position).toEqual(task.target);
        expect(task.projectId).toBe(site.project.id);
        expect(task.resource).toBe(site.project.resource);
        expect(stock[task.resource]).toBeGreaterThanOrEqual(1);
        stock[task.resource] -= 1;
        serviceConsumed[task.resource] += 1;
      }
      expect(next.inventory).toEqual(stock);
    }
    expect(source.residents.every(({ location }) => location.kind === "settlement")).toBe(true);
    expect(committed.ledger.initial).toEqual(source.ledger.initial);
    for (const resource of simulation.RESOURCE_KINDS) {
      expect(committed.ledger.produced[resource] - source.ledger.produced[resource]).toBe(productionProduced[resource]);
      expect(committed.ledger.consumed[resource] - source.ledger.consumed[resource])
        .toBe(productionConsumed[resource] + serviceConsumed[resource]);
    }
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
    close(cold);

    soundscapePlay.mockClear();
    const usedRepository = new MemoryRepository(afterRecord);
    const used = await open(usedRepository);
    await used.save();
    expect(authoritativeRoots(decode(usedRepository.snapshot()))).toEqual(authoritativeRoots(after));
    expect(soundscapePlay).not.toHaveBeenCalled();
    advanceOrdinaryFixedSteps(used, 10);
    await used.save();
    const continued = deserializeWorld(decode(usedRepository.snapshot()).world);
    expect(continued.meta.completedTick).toBe(541);
    expect(continued.ledger).toEqual(afterWorld.ledger);
    expect(continued.settlements.map(({ id, inventory, project }) => ({ id, inventory, project })))
      .toEqual(afterWorld.settlements.map(({ id, inventory, project }) => ({ id, inventory, project })));
    for (const user of users) {
      expect(continued.residents.find(({ identity }) => identity.stableId === user.actorId)!.needs.food).toBe(user.needs.food);
    }
    assertWorldInvariants(continued);
    // One native meal pulse and deterministic restore, not a general fairness,
    // rendered-play, performance or long-session closure certificate.
  }, 180_000);
});

describe("native skill-qualified occupied-source water egress", () => {
  it("selects real native service, waits, and leaves bounded moving water through ordinary fixed steps", async () => {
    const { ORDINARY_FOOT_MAX_WATER_DEPTH, waterContactPressure } = await import("./footing");
    const { deriveWaterFlowProfile } = await import("./waterFlow");
    const { surfaceCurrentDirection } = await import("./currentDirection");
    const originalAdvance = residentActivityExecution.advanceResidentRestActivities;
    type NativeWorld = ReturnType<typeof deserializeWorld>;
    const taskFor = (human: ResidentState) => human.activity?.restTask
      ?? human.activity?.rationTask ?? human.activity?.materialTask ?? human.activity?.inspectionTask ?? null;
    const nativeSources = new Map<string, WorldPosition>();
    const waits = new Map<string, { tick: number; phase: number; depth: number; position: WorldPosition; target: WorldPosition }>();
    const summaries: unknown[] = [];
    const contactFrames: Array<{
      tick: number; phase: number;
      window: Parameters<typeof residentContactAcoustics.deriveResidentContactAcoustics>[1];
      facts: readonly residentContactAcoustics.ResidentContactAcousticFact[];
    }> = [];
    const originalContacts = residentContactAcoustics.deriveResidentContactAcoustics;
    vi.spyOn(residentContactAcoustics, "deriveResidentContactAcoustics").mockImplementation((...args) => {
      const facts = originalContacts(...args);
      if (facts !== null && args[2] === 1) contactFrames.push(structuredClone({
        tick: args[0].meta.completedTick, phase: args[2],
        window: { origin: args[1].origin, terrain: { width: args[1].terrain.width, height: args[1].terrain.height } },
        facts,
      }));
      return facts;
    });
    let seed = "";
    let motionIntervalStartRecord: SaveRecord | undefined;
    let motionIntervalClosedRecord: SaveRecord | undefined;
    let opportunity: {
      seed: string; tick: number; phase: number; actorId: string; source: WorldPosition;
      position: WorldPosition; target: WorldPosition; kind: string; depth: number;
      aptitude: number; reserve: number; capacity: number; pressure: number;
      movement: { x: number; y: number }; current: { x: number; y: number };
      profile: ReturnType<typeof deriveWaterFlowProfile>; tide: NativeWorld["tide"];
      weather: NativeWorld["weather"]; needs: ResidentState["needs"];
      condition: ResidentState["condition"]; targetDry: boolean; nativeSource: WorldPosition | undefined;
      priorWait: ReturnType<typeof waits.get>;
    } | undefined;
    const observer = vi.spyOn(residentActivityExecution, "advanceResidentRestActivities").mockImplementation((...args) => {
      const [world, phase] = args;
      const pending = world.residents.flatMap((human) => {
        const activity = human.activity;
        const task = taskFor(human);
        const source = activity?.poses.at(-1)?.position;
        if (activity?.version !== RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION || source === undefined
          || task === null || human.activeContractId !== null
          || (task.kind === "settlement-rest" && task.origin !== "selected")) return [];
        const x = Math.floor(source.localX / WORLD_POSITION_UNITS_PER_TILE);
        const y = Math.floor(source.localY / WORLD_POSITION_UNITS_PER_TILE);
        const tile = world.terrain.tiles[y * world.terrain.width + x];
        if (tile === undefined || tile.terrain === "deep-water") return [];
        const depth = waterDepthAt(tile, world.tide);
        if (depth <= ORDINARY_FOOT_MAX_WATER_DEPTH) return [];
        return [{ actorId: human.identity.stableId, source, task, tile, depth,
          targetDry: residentRestTargetHasDrySupport(world, task.target),
          aptitude: human.identity.skills.find(({ kind }) => kind === "swimming")?.aptitude ?? 0,
          needs: structuredClone(human.needs), condition: structuredClone(human.condition) }];
      });
      // Observe the single original production call; never execute a parallel
      // movement pipeline, provision a source, or author a body/task/result.
      const result = originalAdvance(...args);
      if (result === null) return result;
      for (const before of pending) {
        const human = world.residents.find(({ identity }) => identity.stableId === before.actorId)!;
        const position = human.activity!.poses.at(-1)!.position;
        const task = taskFor(human);
        const movement = worldPositionDelta(before.source, position);
        if (movement.x === 0 && movement.y === 0) {
          if (task?.phase === "waiting" && !waits.has(before.actorId)) {
            waits.set(before.actorId, { tick: world.meta.completedTick, phase, depth: before.depth,
              position: before.source, target: before.task.target });
          }
          continue;
        }
        if (opportunity !== undefined) continue;
        const reserve = FIXED_POINT - Math.max(before.needs.rest, before.condition.exhaustion);
        const capacity = Math.floor(ORDINARY_FOOT_MAX_WATER_DEPTH
          * Math.floor(before.aptitude * reserve / FIXED_POINT) / FIXED_POINT);
        const profile = deriveWaterFlowProfile({ waterDepth: before.depth, bedRoughness: before.tile.roughness,
          tideLevel: world.tide.level, weatherIntensity: world.weather.intensity });
        const direction = surfaceCurrentDirection(world.tide.direction, world.weather.windY);
        const current = { x: Math.trunc(direction.x * profile.strength / FIXED_POINT),
          y: Math.trunc(direction.y * profile.strength / FIXED_POINT) };
        const pressure = waterContactPressure({ moving: true, movement, current,
          waterDepth: before.depth, roughness: before.tile.roughness, surface: "water" });
        const priorWait = waits.get(before.actorId);
        opportunity = { seed, tick: world.meta.completedTick, phase, actorId: before.actorId,
          source: before.source, position, target: before.task.target, kind: before.task.kind,
          depth: before.depth, aptitude: before.aptitude, reserve, capacity, pressure, movement, current, profile,
          tide: { ...world.tide }, weather: { ...world.weather }, needs: before.needs, condition: before.condition,
          targetDry: before.targetDry, nativeSource: nativeSources.get(before.actorId), priorWait };
      }
      return result;
    });
    try {
      // Existing native seeds only. Stop at the first real action; no arbitrary
      // seed scan, pressure/clock/terrain/skill override or deadline stretching.
      for (seed of ["settlement keeper home night continuity", "runtime baseline estuary",
        "resident activity executable rest approach"]) {
        const repository = new MemoryRepository();
        const runtime = await open(repository);
        runtime.dispatchUI({ type: "new-world", seed, posture: "gale", sessionShape: "wander" });
        await runtime.save();
        const initial = deserializeWorld(decode(repository.snapshot()).world);
        expect(initial.meta.completedTick).toBe(420);
        expect(initial.residents.every((human) => !Object.hasOwn(human, "activity"))).toBe(true);
        const terrain = stableStringify(initial.terrain);
        nativeSources.clear();
        waits.clear();
        for (const human of initial.residents) {
          const source = resolveResidentWorldPlacement(initial, human)?.position;
          if (source !== undefined) nativeSources.set(human.identity.stableId, source);
        }
        let latest = initial;
        for (let interval = 0; interval < 60 && opportunity === undefined; interval += 1) {
          const intervalStartRecord = repository.snapshot();
          advanceOrdinaryFixedSteps(runtime, 10);
          await runtime.save();
          const intervalClosedRecord = repository.snapshot();
          latest = deserializeWorld(decode(intervalClosedRecord).world);
          assertWorldInvariants(latest);
          expect(latest.meta.completedTick).toBe(421 + interval);
          expect(latest.tide).toEqual(tideAtTick(latest.meta.completedTick));
          expect(stableStringify(latest.terrain)).toBe(terrain);
          if (opportunity !== undefined) {
            motionIntervalStartRecord = intervalStartRecord;
            motionIntervalClosedRecord = intervalClosedRecord;
          }
        }
        summaries.push({ seed, tick: latest.meta.completedTick,
          waiting: [...waits].slice(0, 4), found: opportunity !== undefined });
        close(runtime);
        if (opportunity !== undefined) break;
      }
    } finally {
      observer.mockRestore();
    }
    if (opportunity === undefined) {
      throw new Error(`No actual current-v8 skill-qualified source egress in bounded native play: ${JSON.stringify(summaries)}`);
    }
    const action = opportunity;
    expect(opportunity.targetDry).toBe(true);
    expect(opportunity.source).toEqual(opportunity.nativeSource);
    expect(opportunity.aptitude).toBeGreaterThan(0);
    expect(opportunity.depth).toBeLessThanOrEqual(ORDINARY_FOOT_MAX_WATER_DEPTH + opportunity.capacity);
    expect(opportunity.pressure).toBeLessThanOrEqual(opportunity.capacity);
    expect(Math.hypot(opportunity.movement.x, opportunity.movement.y)).toBeLessThanOrEqual(RESIDENT_REST_APPROACH_STEP_UNITS);
    expect(opportunity.priorWait).toBeDefined();
    expect(opportunity.priorWait!.position).toEqual(opportunity.source);
    expect(opportunity.priorWait!.target).toEqual(opportunity.target);
    expect(opportunity.tick).toBeGreaterThan(opportunity.priorWait!.tick);
    console.info("Native source-egress action evidence", JSON.stringify(opportunity));
    expect(opportunity.phase).toBe(1);
    const nativeFirstContact = contactFrames.find(({ tick, phase }) => tick === action.tick && phase === action.phase);
    expect(nativeFirstContact).toBeDefined();
    const { residentTravelBodyIsLocal, residentTravelInteractionFrame } = await import("../sim/residentTravelRoute");
    const nativeFrame = residentTravelInteractionFrame(nativeFirstContact!.window);
    expect(nativeFrame).not.toBeNull();
    expect(residentTravelBodyIsLocal(nativeFrame!, action.source)).toBe(false);
    expect(nativeFirstContact!.facts.some(({ event }) => event.sourceId === action.actorId)).toBe(false);
    console.info("Native water acoustic admission evidence", JSON.stringify({
      tick: action.tick, actorId: action.actorId, window: nativeFirstContact!.window,
      firstPhaseSources: nativeFirstContact!.facts.map(({ event }) => event.sourceId),
      ownContact: nativeFirstContact!.facts.find(({ event }) => event.sourceId === action.actorId) ?? null,
    }));
    expect(motionIntervalStartRecord).toBeDefined();
    expect(motionIntervalClosedRecord).toBeDefined();
    const before = decode(motionIntervalStartRecord!);
    const closed = decode(motionIntervalClosedRecord!);
    const sourceWorld = deserializeWorld(before.world);
    expect(sourceWorld.meta.completedTick).toBe(opportunity.tick);
    expect(before.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expect(resident(before, opportunity.actorId).activity!.poses[0]!.position).toEqual(opportunity.source);

    // Replay only the discovered real interval. Retain its native action prefix
    // and all other roots; no mid-step save search, authored task or clock patch.
    soundscapePlay.mockClear();
    const prefixRepository = new MemoryRepository(motionIntervalStartRecord);
    const prefixRuntime = await open(prefixRepository);
    await prefixRuntime.save();
    expect(authoritativeRoots(decode(prefixRepository.snapshot()))).toEqual(authoritativeRoots(before));
    expect(soundscapePlay).not.toHaveBeenCalled();
    advanceOrdinaryFixedSteps(prefixRuntime, 4);
    await prefixRuntime.save();
    const phase4Record = prefixRepository.snapshot();
    const phase4 = decode(phase4Record);
    expect(phase4.perceptionCarry.playerStepsSinceWorldTick).toBe(4);
    const firstPrefix = resident(phase4, opportunity.actorId);
    expect(firstPrefix.activity!.poses).toHaveLength(5);
    expect(worldPositionDelta(opportunity.source, firstPrefix.activity!.poses.at(-1)!.position))
      .toEqual({ x: opportunity.movement.x * 4, y: opportunity.movement.y * 4 });
    expect(taskFor(firstPrefix)).toMatchObject({ kind: opportunity.kind, phase: "approaching", target: opportunity.target });
    expect(firstPrefix.condition).toEqual(opportunity.condition);
    const sourceTile = sourceWorld.terrain.tiles[Math.floor(opportunity.source.localY / WORLD_POSITION_UNITS_PER_TILE)
      * sourceWorld.terrain.width + Math.floor(opportunity.source.localX / WORLD_POSITION_UNITS_PER_TILE)]!;
    expect(waterDepthAt(sourceTile, deserializeWorld(phase4.world).tide)).toBe(opportunity.depth);
    expect(deserializeWorld(phase4.world).meta.completedTick).toBe(opportunity.tick);
    for (const { position } of firstPrefix.activity!.poses) {
      expect(Math.floor(position.localX / WORLD_POSITION_UNITS_PER_TILE))
        .toBe(Math.floor(opportunity.source.localX / WORLD_POSITION_UNITS_PER_TILE));
      expect(Math.floor(position.localY / WORLD_POSITION_UNITS_PER_TILE))
        .toBe(Math.floor(opportunity.source.localY / WORLD_POSITION_UNITS_PER_TILE));
    }
    advanceOrdinaryFixedSteps(prefixRuntime, 5);
    await prefixRuntime.save();
    const phase9Record = prefixRepository.snapshot();
    const phase9 = decode(phase9Record);
    const terminalPrefix = resident(phase9, opportunity.actorId);
    expect(phase9.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    expect(terminalPrefix.activity!.poses).toHaveLength(10);
    expect(taskFor(terminalPrefix)).toMatchObject({ kind: opportunity.kind, phase: "approaching", target: opportunity.target });
    for (let phase = 1; phase <= 9; phase += 1) {
      const delta = worldPositionDelta(terminalPrefix.activity!.poses[phase - 1]!.position,
        terminalPrefix.activity!.poses[phase]!.position);
      expect(Math.hypot(delta.x, delta.y)).toBeLessThanOrEqual(RESIDENT_REST_APPROACH_STEP_UNITS);
    }
    for (const prefix of [phase4, phase9]) {
      const world = deserializeWorld(prefix.world);
      expect(world.terrain).toEqual(sourceWorld.terrain);
      expect(world.ledger).toEqual(sourceWorld.ledger);
      expect(world.settlements.map(({ id, inventory, project }) => ({ id, inventory, project })))
        .toEqual(sourceWorld.settlements.map(({ id, inventory, project }) => ({ id, inventory, project })));
      assertWorldInvariants(world);
    }
    advanceOrdinaryFixedSteps(prefixRuntime, 1);
    await prefixRuntime.save();
    expect(authoritativeRoots(decode(prefixRepository.snapshot()))).toEqual(authoritativeRoots(closed));
    expect(resident(closed, opportunity.actorId).activity!.poses[0]!.position).toEqual(opportunity.target);
    expect(taskFor(resident(closed, opportunity.actorId))).toMatchObject({ kind: opportunity.kind, phase: "arrived" });
    assertWorldInvariants(deserializeWorld(closed.world));
    close(prefixRuntime);

    // An economical cold chain: phase4 joins exact phase9; detached phase9 then
    // joins the actual uninterrupted closure, comparing every saved root.
    for (const [record, prefix, steps, expected] of [
      [phase4Record, phase4, 5, phase9], [phase9Record, phase9, 1, closed],
    ] as const) {
      soundscapePlay.mockClear();
      const coldRepository = new MemoryRepository(record);
      const cold = await open(coldRepository);
      await cold.save();
      expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(prefix));
      expect(soundscapePlay).not.toHaveBeenCalled();
      advanceOrdinaryFixedSteps(cold, steps);
      await cold.save();
      expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(expected));
      close(cold);
    }

    const failedRepository = new MemoryRepository(phase9Record);
    const failed = await open(failedRepository);
    const attemptedArrival: Array<{ position: WorldPosition; phase: string | undefined }> = [];
    const arrival = vi.spyOn(residentActivityExecution, "advanceResidentRestActivities").mockImplementation((...args) => {
      const result = originalAdvance(...args);
      if (result !== null && args[0].meta.completedTick === action.tick && args[1] === 10) {
        const human = args[0].residents.find(({ identity }) => identity.stableId === action.actorId)!;
        attemptedArrival.push({ position: human.activity!.poses.at(-1)!.position, phase: taskFor(human)?.phase });
      }
      return result;
    });
    const closure = vi.spyOn(situatedExpressionChannelBank, "closeSituatedExpressionChannelBankInterval")
      .mockReturnValueOnce(null);
    soundscapePlay.mockClear();
    advanceOrdinaryFixedStepsForExpectedFailure(failed, 1);
    expect(attemptedArrival).toContainEqual({ position: opportunity.target, phase: "arrived" });
    expect(closure).toHaveBeenCalledTimes(1);
    expect(failed.getUIView().announcement?.message).toContain("INTEGRITY HALT");
    expect(soundscapePlay.mock.calls).toEqual([["warning", 1]]);
    await failed.save();
    const rolledBackRecord = failedRepository.snapshot();
    expect(authoritativeRoots(decode(rolledBackRecord))).toEqual(authoritativeRoots(phase9));
    closure.mockRestore();
    arrival.mockRestore();
    close(failed);
    soundscapePlay.mockClear();
    const retryRepository = new MemoryRepository(rolledBackRecord);
    const retry = await open(retryRepository);
    expect(soundscapePlay).not.toHaveBeenCalled();
    advanceOrdinaryFixedSteps(retry, 1);
    await retry.save();
    expect(authoritativeRoots(decode(retryRepository.snapshot()))).toEqual(authoritativeRoots(closed));
    close(retry);
    // Bounded native action/cold/rollback evidence only. No wet destination,
    // general crossing, loaded transit, gear, injury, manual visual acceptance,
    // long-session liveness or performance claim is implied.
  }, 180_000);
});

describe("ordinary native resident occupied-water acoustic carry", () => {
  it("hears the real estuary wet approach at its original phase without captions, cold replay or failed-closing knowledge", async () => {
    const actorId = "H-v1-p0p0-tg9mg3-4-1xgcisc";
    const derivations: Array<{ tick: number; phase: number; facts: readonly residentContactAcoustics.ResidentContactAcousticFact[] }> = [];
    const hearingFrames: Array<{
      tick: number; samples: readonly humanPerception.PhysicalSoundSample[];
      phases: readonly humanPerception.HumanSoundSamplePhase[];
      batches: readonly Pick<humanPerception.HumanObservationBatch, "residentId" | "observerId" | "observations">[];
    }> = [];
    const derive = residentContactAcoustics.deriveResidentContactAcoustics;
    vi.spyOn(residentContactAcoustics, "deriveResidentContactAcoustics").mockImplementation((...args) => {
      const facts = derive(...args);
      if (facts !== null) derivations.push({ tick: args[0].meta.completedTick, phase: args[2], facts });
      return facts;
    });
    const collect = humanPerception.collectExistingHumanObservations;
    vi.spyOn(humanPerception, "collectExistingHumanObservations").mockImplementation((...args) => {
      const batches = collect(...args);
      const input = args[0];
      hearingFrames.push(structuredClone({ tick: input.targetTick, samples: input.physicalSoundSamples ?? [],
        phases: input.soundSamplePhases ?? [],
        batches: batches.map(({ residentId, observerId, observations }) => ({ residentId, observerId, observations })),
      }));
      return batches;
    });
    const repository = new MemoryRepository();
    const runtime = await open(repository);
    runtime.dispatchUI({ type: "new-world", seed: "runtime baseline estuary", posture: "journey", sessionShape: "wander" });
    await runtime.save();
    const initial = decode(repository.snapshot());
    const initialWorld = deserializeWorld(initial.world);
    const source = resolveResidentWorldPlacement(initialWorld, resident(initial, actorId))!.position;
    expect(source).toMatchObject({ localX: 87_500, localY: 26_500 });
    expect(initialWorld.residents.every((human) => !Object.hasOwn(human, "activity"))).toBe(true);
    // Ordinary native waiting and falling tide open the actual north cell.
    // No terrain, clock, task, need, body, window, listener or result is assigned.
    advanceOrdinaryFixedSteps(runtime, 50);
    await runtime.save();
    const beforeRecord = repository.snapshot();
    const before = decode(beforeRecord);
    const beforeWorld = deserializeWorld(before.world);
    expect(beforeWorld.meta.completedTick).toBe(425);
    expect(resident(before, actorId).activity!.poses[0]!.position).toEqual(source);
    expect(resident(before, actorId).activity!.materialTask).toMatchObject({ phase: "approaching", projectId: 15, resource: "medicine" });
    expect(waterDepthAt(beforeWorld.terrain.tiles[26 * beforeWorld.terrain.width + 87]!, beforeWorld.tide)).toBeGreaterThan(0);
    expect(beforeWorld.terrain).toEqual(initialWorld.terrain);
    soundscapePlay.mockClear();
    advanceOrdinaryFixedSteps(runtime, 4);
    await runtime.save();
    const phase4Record = repository.snapshot();
    const phase4 = decode(phase4Record);
    const fact = [...derivations].reverse().find(({ tick, phase }) => tick === 425 && phase === 4)?.facts
      .find(({ event }) => event.sourceId === actorId);
    if (fact === undefined) throw new Error("Ordinary native estuary water motion produced no in-frame contact");
    expect(fact).toMatchObject({ phase: 1, event: { sourcePosition: source, surfaceMaterial: "water",
      semanticFamily: "slosh", interrupt: "none", textualEligibility: "audio-only" } });
    expect(resident(phase4, actorId).activity!.poses[1]!.position).not.toEqual(source);
    advanceOrdinaryFixedSteps(runtime, 5);
    await runtime.save();
    const phase9Record = repository.snapshot();
    const phase9 = decode(phase9Record);
    expect([...derivations].reverse().find(({ tick, phase }) => tick === 425 && phase === 9)?.facts
      .find(({ event }) => event.sourceId === actorId)).toEqual(fact);
    const ownAudio = () => soundscapePlay.mock.calls.filter(([, , seed]) => seed === fact.event.presentationVariantSeed);
    // The actual player is distant; local independent actor hearing is not a
    // claim that this routine contact plays globally for the player.
    expect(ownAudio()).toHaveLength(0);
    expect((runtime.getRenderView().acousticText ?? []).some(({ id }) => id === fact.event.eventId)).toBe(false);
    expect(runtime.getUIView().expressionCaption?.id).not.toBe(fact.event.eventId);
    hearingFrames.length = 0;
    advanceOrdinaryFixedSteps(runtime, 1);
    await runtime.save();
    const closedRecord = repository.snapshot();
    const closed = decode(closedRecord);
    const closing = hearingFrames.find(({ samples }) => samples.some(({ id }) => id === fact.sample.id));
    if (closing === undefined) throw new Error("Native estuary slosh never entered actual closing hearing");
    expect(closing.tick).toBe(426);
    expect(closing.samples.filter(({ id }) => id === fact.sample.id)).toEqual([fact.sample]);
    expect(closing.phases.filter(({ sampleId }) => sampleId === fact.sample.id)).toEqual([{ sampleId: fact.sample.id, phase: 1 }]);
    const receipts = closing.batches.flatMap(({ observerId, residentId, observations }) => observations
      .filter(({ id }) => id === `hp-h-426-${residentId}-${fact.sample.id}`).map((observation) => ({ observerId, observation })));
    expect(receipts.length).toBeGreaterThan(0);
    for (const { observerId, observation } of receipts) {
      expect(observerId).not.toBe(actorId);
      expect(observation).toMatchObject({ channel: "hearing", perceivedClass: "physical-slosh", subjectId: null,
        identification: "anonymous", observedAtTick: 426 });
      expect(observation.area.radiusUnits).toBeGreaterThanOrEqual(250);
    }
    const closedWorld = deserializeWorld(closed.world);
    const savedHearing = receipts.flatMap(({ observerId, observation }) => {
      const listener = closedWorld.residents.find(({ identity }) => identity.stableId === observerId);
      const belief = listener?.perception.beliefs.find(({ sourceObservationId }) => sourceObservationId === observation.id);
      return belief === undefined ? [] : [{ observerId, observation, belief }];
    });
    // Bounded perception need not retain every computed observation, but the
    // consumer must commit a real anonymous consequence, not just a sidecar.
    expect(savedHearing.length).toBeGreaterThan(0);
    for (const { observation, belief } of savedHearing) {
      expect(belief).toMatchObject({ sourceObservationId: observation.id, channel: "hearing",
        perceivedClass: "physical-slosh", identification: "anonymous", subjectId: null,
        area: observation.area, lastObservedTick: 426, strongInterrupt: false });
    }
    expect(closed.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expect(ownAudio()).toHaveLength(0);
    assertWorldInvariants(closedWorld);
    close(runtime);

    for (const [record, prefix, steps, expected] of [
      [phase4Record, phase4, 5, phase9], [phase9Record, phase9, 1, closed],
    ] as const) {
      const coldRepository = new MemoryRepository(record);
      soundscapePlay.mockClear();
      const cold = await open(coldRepository);
      await cold.save();
      expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(prefix));
      expect(soundscapePlay).not.toHaveBeenCalled();
      hearingFrames.length = 0;
      advanceOrdinaryFixedSteps(cold, steps);
      await cold.save();
      expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(expected));
      expect(ownAudio()).toHaveLength(0);
      if (steps === 1) expect(hearingFrames.find(({ samples }) => samples.some(({ id }) => id === fact.sample.id))).toEqual(closing);
      close(cold);
    }

    const failedRepository = new MemoryRepository(phase9Record);
    const failed = await open(failedRepository);
    const closure = vi.spyOn(situatedExpressionChannelBank, "closeSituatedExpressionChannelBankInterval").mockReturnValueOnce(null);
    hearingFrames.length = 0;
    soundscapePlay.mockClear();
    advanceOrdinaryFixedStepsForExpectedFailure(failed, 1);
    expect(hearingFrames.find(({ samples }) => samples.some(({ id }) => id === fact.sample.id))).toEqual(closing);
    expect(closure).toHaveBeenCalledTimes(1);
    expect(failed.getUIView().announcement?.message).toContain("INTEGRITY HALT");
    expect(soundscapePlay.mock.calls).toEqual([["warning", 1]]);
    await failed.save();
    const rolledBackRecord = failedRepository.snapshot();
    expect(authoritativeRoots(decode(rolledBackRecord))).toEqual(authoritativeRoots(phase9));
    closure.mockRestore();
    close(failed);
    const retryRepository = new MemoryRepository(rolledBackRecord);
    soundscapePlay.mockClear();
    const retry = await open(retryRepository);
    advanceOrdinaryFixedSteps(retry, 1);
    await retry.save();
    expect(authoritativeRoots(decode(retryRepository.snapshot()))).toEqual(authoritativeRoots(closed));
    expect(ownAudio()).toHaveLength(0);
    close(retry);
    const consumedRepository = new MemoryRepository(closedRecord);
    soundscapePlay.mockClear();
    const consumed = await open(consumedRepository);
    await consumed.save();
    expect(authoritativeRoots(decode(consumedRepository.snapshot()))).toEqual(authoritativeRoots(closed));
    expect(soundscapePlay).not.toHaveBeenCalled();
    console.info("Native estuary water-contact hearing evidence", JSON.stringify({ tick: 425, phase: fact.phase,
      actorId, source, eventId: fact.event.eventId, listeners: receipts.map(({ observerId }) => observerId),
      savedListeners: savedHearing.map(({ observerId }) => observerId) }));
    // One genuine native listener loop, not player playback, normal visual
    // acceptance, equipment, broad crossings, actor fairness or performance.
  }, 90_000);
});

describe("runtime source-anchor transaction foundation", () => {
  it("commits only newly helped contact wear, cold restores it and rolls body plus aid back after publication failure", async () => {
    const { ORDINARY_FOOT_MAX_WATER_DEPTH, waterContactPressure } = await import("./footing");
    const { deriveWaterFlowProfile } = await import("./waterFlow");
    const { surfaceCurrentDirection } = await import("./currentDirection");
    const { wayknotContextAt } = await import("./player");
    const { placeWayknot } = await import("./wayknots");
    const regionalWorldView = await import("./regionalWorldView");
    const actorId = "H-v1-p0p0-1d9rhmy-2-1kt45xu";
    const repository = new MemoryRepository();
    const runtime = await open(repository);
    runtime.dispatchUI({ type: "new-world", seed: "settlement keeper home night continuity", posture: "gale", sessionShape: "wander" });
    // Genuine ordinary task/body history. The later placement and wind
    // contrast are explicitly arranged foundations, NOT player deployment.
    advanceOrdinaryFixedSteps(runtime, 220);
    await runtime.save();
    const placementEnvelope = decode(repository.snapshot());
    const placementWorld = deserializeWorld(placementEnvelope.world);
    expect(placementWorld.meta.completedTick).toBe(442);
    const context = wayknotContextAt(createWorldView(placementWorld), 45 * placementWorld.terrain.width + 88)!;
    expect(context).toMatchObject({ occupied: false });
    expect(context.waterDepth).toBeGreaterThanOrEqual(120_000);
    const placement = placeWayknot(placementEnvelope.player.wayknots, "tide-anchor", context, 442);
    expect(placement.ok).toBe(true);
    expect(placement.wayknot).toMatchObject({ id: 3, condition: 920_000, readyTick: 445 });
    advanceOrdinaryFixedSteps(runtime, 30);
    await runtime.save();
    const originalRecord = repository.snapshot();
    const before = decode(originalRecord);
    close(runtime);
    const world = deserializeWorld(before.world);
    expect(world.meta.completedTick).toBe(445);
    expect(before.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    const human = world.residents.find(({ identity }) => identity.stableId === actorId)!;
    const source = human.activity!.poses[0]!.position;
    expect(source).toMatchObject({ localX: 88_500, localY: 47_500 });
    expect(human.activity!.materialTask).toMatchObject({ kind: "settlement-material", phase: "approaching", usedAtTick: null });
    const capacity = Math.floor(ORDINARY_FOOT_MAX_WATER_DEPTH * Math.floor(
      human.identity.skills.find(({ kind }) => kind === "swimming")!.aptitude
      * (FIXED_POINT - Math.max(human.needs.rest, human.condition.exhaustion)) / FIXED_POINT,
    ) / FIXED_POINT);
    expect(capacity).toBe(8_023);
    const tile = world.terrain.tiles[47 * world.terrain.width + 88]!;
    const depth = waterDepthAt(tile, world.tide);
    expect(depth).toBe(41_474);
    const flow = deriveWaterFlowProfile({ waterDepth: depth, bedRoughness: tile.roughness,
      tideLevel: world.tide.level, weatherIntensity: world.weather.intensity });
    const pressureAt = (windY: number) => {
      const direction = surfaceCurrentDirection(world.tide.direction, windY);
      return waterContactPressure({ moving: true, movement: { x: 105, y: 0 }, waterDepth: depth,
        roughness: tile.roughness, surface: "water", current: {
          x: Math.trunc(direction.x * flow.strength / FIXED_POINT),
          y: Math.trunc(direction.y * flow.strength / FIXED_POINT),
        } });
    };
    let low = 0;
    let high = FIXED_POINT;
    expect(pressureAt(low)).toBeLessThanOrEqual(capacity);
    expect(pressureAt(high)).toBeGreaterThan(capacity);
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (pressureAt(middle) > capacity) high = middle;
      else low = middle + 1;
    }
    world.weather.windY = low; // Physical counterfactual, not a task or belief.
    assertWorldInvariants(world);
    before.world = serializeWorld(world);
    const bareRecord = recordWith(originalRecord, structuredClone(before));
    const bareRepository = new MemoryRepository(bareRecord);
    const bare = await open(bareRepository);
    advanceOrdinaryFixedSteps(bare, 1);
    await bare.save();
    const blocked = decode(bareRepository.snapshot());
    expect(resident(blocked, actorId).activity!.poses[1]!.position).toEqual(source);
    expect(resident(blocked, actorId).activity!.materialTask).toMatchObject({ phase: "waiting", usedAtTick: null });
    expect(blocked.player.wayknots).toEqual(before.player.wayknots);
    close(bare);

    const staged = structuredClone(before);
    staged.player.wayknots = placement.state;
    const stagedRecord = recordWith(originalRecord, staged);
    const aidedRepository = new MemoryRepository(stagedRecord);
    const aided = await open(aidedRepository);
    await aided.save();
    expect(authoritativeRoots(decode(aidedRepository.snapshot()))).toEqual(authoritativeRoots(staged));
    const piece = (envelope: Envelope) => envelope.player.wayknots.wayknots.find(({ id }) => id === 3)!;
    advanceOrdinaryFixedSteps(aided, 4);
    await aided.save();
    const phase4Record = aidedRepository.snapshot();
    const phase4 = decode(phase4Record);
    expect(resident(phase4, actorId).activity!.poses[4]!.position).toEqual({ ...source, localX: 88_920 });
    expect(piece(phase4)).toMatchObject({ condition: 913_280, serviceWearRemainder: 0 });
    advanceOrdinaryFixedSteps(aided, 1);
    await aided.save();
    const phase5 = decode(aidedRepository.snapshot());
    expect(resident(phase5, actorId).activity!.poses[5]!.position).toEqual({ ...source, localX: 89_025 });
    //105×4+80 wet units; the25-unit dry tail is not another aid service.
    expect(piece(phase5)).toMatchObject({ condition: 912_000, serviceWearRemainder: 0 });
    advanceOrdinaryFixedSteps(aided, 4);
    await aided.save();
    const phase9Record = aidedRepository.snapshot();
    const phase9 = decode(phase9Record);
    expect(piece(phase9)).toEqual(piece(phase5));
    advanceOrdinaryFixedSteps(aided, 1);
    await aided.save();
    const closed = decode(aidedRepository.snapshot());
    expect(resident(closed, actorId).activity!.materialTask).toMatchObject({ phase: "arrived", usedAtTick: null });
    expect(piece(closed)).toEqual(piece(phase5));
    close(aided);

    for (const [record, prefix, count, expected] of [
      [phase4Record, phase4, 5, phase9], [phase9Record, phase9, 1, closed],
    ] as const) {
      soundscapePlay.mockClear();
      const coldRepository = new MemoryRepository(record);
      const cold = await open(coldRepository);
      await cold.save();
      expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(prefix));
      expect(soundscapePlay).not.toHaveBeenCalled();
      advanceOrdinaryFixedSteps(cold, count);
      await cold.save();
      expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(expected));
      close(cold);
    }

    const failedRepository = new MemoryRepository(phase4Record);
    const failed = await open(failedRepository);
    const originalAdvance = residentActivityExecution.advanceResidentRestActivities;
    let attempted: unknown;
    const motion = vi.spyOn(residentActivityExecution, "advanceResidentRestActivities").mockImplementation((...args) => {
      const result = originalAdvance(...args);
      if (result !== null && args[1] === 5) attempted = {
        pose: structuredClone(args[0].residents.find(({ identity }) => identity.stableId === actorId)!.activity!.poses[5]),
        wayknots: structuredClone(result.wayknots),
      };
      return result;
    });
    const originalPublication = regionalWorldView.replaceRegionalWorldViewResidents;
    const publication = vi.spyOn(regionalWorldView, "replaceRegionalWorldViewResidents").mockImplementationOnce((...args) => {
      originalPublication(...args);
      throw new Error("controlled post-water-support publication failure");
    });
    soundscapePlay.mockClear();
    advanceOrdinaryFixedStepsForExpectedFailure(failed, 1);
    expect(attempted).toEqual({ pose: resident(phase5, actorId).activity!.poses[5], wayknots: phase5.player.wayknots });
    expect(publication).toHaveBeenCalledTimes(1);
    expect(failed.getUIView().announcement?.message).toContain("INTEGRITY HALT");
    expect(soundscapePlay.mock.calls).toEqual([["warning", 1]]);
    await failed.save();
    const rollback = failedRepository.snapshot();
    expect(authoritativeRoots(decode(rollback))).toEqual(authoritativeRoots(phase4));
    publication.mockRestore();
    motion.mockRestore();
    close(failed);
    soundscapePlay.mockClear();
    const retryRepository = new MemoryRepository(rollback);
    const retry = await open(retryRepository);
    expect(soundscapePlay).not.toHaveBeenCalled();
    advanceOrdinaryFixedSteps(retry, 1);
    await retry.save();
    expect(authoritativeRoots(decode(retryRepository.snapshot()))).toEqual(authoritativeRoots(phase5));
    close(retry);
  }, 180_000);
});

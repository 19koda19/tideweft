import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import { assertWorldInvariants, deserializeWorld, serializeWorld, type WorldState } from "../sim/public";
import {
  canonicalizeResidentActivity,
  RESIDENT_TRAVEL_ACTIVITY_OWNER_ID,
  RESIDENT_TRAVEL_ACTIVITY_VERSION,
  RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION,
  type ResidentPhysicalTravelTask,
} from "../sim/residentActivity";
import { residentTravelLocation, residentTravelSegment, residentTravelSegmentPose } from "../sim/residentTravelRoute";
import { FIXED_POINT } from "../sim/types";
import { deserializeBio0Ecology } from "./bio0Ecology";
import { gameSaveEnvelopeIntegrity } from "./physicalCargoState";
import { residentActivitySaveExtensionsValid } from "./residentActivitySaveBoundary";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import { CURRENT_GAME_SAVE_VERSION, FIRST_RESIDENT_TRAVEL_GAME_SAVE_VERSION } from "./saveCompatibilityPolicy";

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
  bio0Ecology: string;
  perceptionCarry: {
    playerStepsSinceWorldTick: number;
    actorVocalizationSamples: readonly { sourceActorId: string }[];
  };
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
    if (this.record === undefined) throw new Error("Compatibility fixture has no retained save");
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
  return runtime;
}

function close(runtime: TideweftRuntime): void {
  runtime.destroy();
  runtimes.delete(runtime);
  scheduledFrame = undefined;
}

/** One clock-establishing callback, followed by exactly count accepted steps. */
function advance(runtime: TideweftRuntime, count: number): void {
  runtime.start();
  for (let frame = 0; frame <= count; frame += 1) {
    const callback = scheduledFrame;
    if (callback === undefined) throw new Error("Compatibility runtime lost its ordinary frame");
    scheduledFrame = undefined;
    callback(nextFrameTime);
    nextFrameTime += 100;
  }
  runtime.stop();
  expect(runtime.getUIView().announcement?.message).not.toContain("INTEGRITY HALT");
  expect(runtime.getUIView().saveWarning).toBeUndefined();
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

function authoritativeRoots(envelope: Envelope): unknown {
  // Restart recaps may differ. No other authoritative root or event is omitted.
  const { integrity: _integrity, session: _session, ...roots } = envelope;
  return roots;
}

function actor(world: WorldState, actorId: string) {
  const resident = world.residents.find(({ identity }) => identity.stableId === actorId);
  if (resident === undefined) throw new Error("Compatibility traveler identity disappeared");
  return resident;
}

/**
 * Capture a real current phase4/carry under declared quiet pressure. Then
 * explicitly arrange one conserved native-offer transit on its existing first
 * edge, stationary behind an inactive route, and encode the entire roster as
 * supported v7/outer57. This is a synthetic compatibility fixture, NOT a save
 * emitted by an old executable or evidence of autonomous acceptance/travel.
 * No event, knowledge, pending sound or prior source tuple is removed.
 */
async function compatibilityFixture() {
  const bootstrapRepository = new MemoryRepository();
  const bootstrap = await open(bootstrapRepository);
  bootstrap.dispatchUI({ type: "new-world", seed: "runtime baseline estuary",
    posture: "gale", sessionShape: "wander" });
  await bootstrap.save();
  const originalRecord = bootstrapRepository.snapshot();
  const prepared = decode(originalRecord);
  const initial = deserializeWorld(prepared.world);
  initial.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0,
    nextChangeTick: initial.meta.completedTick + 1_000 };
  for (const resident of initial.residents) {
    resident.needs = { food: 100_000, rest: 100_000, belonging: 900_000 };
    resident.condition.exhaustion = 100_000;
  }
  for (const contract of initial.contracts) {
    contract.playerExclusiveUntilTick = initial.meta.completedTick + 1_000;
    contract.dueTick = initial.meta.completedTick + 2_000;
  }
  assertWorldInvariants(initial);
  prepared.world = serializeWorld(initial);
  close(bootstrap);

  const currentRepository = new MemoryRepository(recordWith(originalRecord, prepared));
  const current = await open(currentRepository);
  expect(current.getUIView().saveWarning).toBeUndefined();
  advance(current, 14);
  await current.save();
  const currentRecord = currentRepository.snapshot();
  const legacy = decode(currentRecord);
  const world = deserializeWorld(legacy.world);
  const tick = world.meta.completedTick;
  expect(tick).toBe(initial.meta.completedTick + 1);
  expect(legacy.perceptionCarry.playerStepsSinceWorldTick).toBe(4);
  expect(world.residents.every((resident) => resident.activeContractId === null)).toBe(true);
  const bio0 = deserializeBio0Ecology(legacy.bio0Ecology);
  if (bio0 === null) throw new Error("Compatibility fixture lost native BIO0 identity");
  const contract = world.contracts.find(({ id, status }) => id === 127 && status === "offered");
  if (contract === undefined) throw new Error("Compatibility fixture needs the native estuary offer127");
  const resident = world.residents.find((candidate) => candidate.location.kind === "settlement"
    && candidate.location.settlementId === contract.originSettlementId
    && candidate.identity.stableId !== bio0.porterAddress.actorId
    && !world.events.some((event) => event.subjectId === candidate.id || event.data.residentId === candidate.id)
    && !legacy.perceptionCarry.actorVocalizationSamples.some(({ sourceActorId }) => sourceActorId === candidate.identity.stableId));
  if (resident === undefined) throw new Error("No source-free native origin resident for synthetic compatibility transit");
  const origin = world.settlements.find(({ id }) => id === contract.originSettlementId)!;
  const destination = world.settlements.find(({ id }) => id === contract.destinationSettlementId)!;
  const route = world.routes.find(({ id }) => id === contract.routeId)!;
  expect(origin.inventory[contract.resource]).toBeGreaterThanOrEqual(contract.quantity);
  const ledger = structuredClone(world.ledger);
  const events = structuredClone(world.events);
  const carry = structuredClone(legacy.perceptionCarry);
  origin.inventory[contract.resource] -= contract.quantity;
  contract.status = "in-transit";
  contract.carrierKind = "resident";
  contract.assignedResidentId = resident.id;
  contract.acceptedTick = tick - 1;
  contract.departedTick = tick;
  contract.arrivalTick = tick + 10;
  contract.playerExclusiveUntilTick = contract.createdTick;
  contract.porterRouteIds = [route.id];
  contract.porterSettlementIds = [contract.originSettlementId, contract.destinationSettlementId];
  contract.cargoQuantity = contract.quantity;
  resident.activeContractId = contract.id;
  resident.location = { kind: "route", routeId: route.id,
    progress: route.fromSettlementId === contract.originSettlementId ? 0 : FIXED_POINT };
  route.condition = 0;
  const task: ResidentPhysicalTravelTask = {
    kind: "contract-travel", mode: "physical", contractId: contract.id,
    legIndex: 0, waypointIndex: 1, selectedAtTick: tick, lastProgressAtTick: tick,
    nextReassessmentAtTick: tick + 1, phase: "waiting", waitReason: "no-active-route",
  };
  const segment = residentTravelSegment(world, contract, task);
  if (segment === null) throw new Error("Native route has no exact first edge for compatibility binding");
  const pose = residentTravelSegmentPose(segment, 0);
  const location = residentTravelLocation(segment, task, pose.position);
  if (location === null) throw new Error("Synthetic compatibility cursor is unbound");
  resident.location = location;
  world.residents = world.residents.map((human) => {
    const activity = human.activity;
    if (activity?.version !== RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION
      || activity.travelTask !== null || activity.poses.length !== 5) {
      throw new Error("Cannot construct frozen v7 by erasing existing journey work");
    }
    const value = human.id === resident.id ? { ...activity,
      poses: activity.poses.map(() => structuredClone(pose)), restTask: null,
      rationTask: null, materialTask: null, inspectionTask: null, pickupTask: null, travelTask: task,
    } : activity;
    const frozen = canonicalizeResidentActivity({ ...value,
      version: RESIDENT_TRAVEL_ACTIVITY_VERSION, ownerId: RESIDENT_TRAVEL_ACTIVITY_OWNER_ID,
    }, { actorId: human.identity.stableId, tick, phase: 4 });
    if (frozen === null) throw new Error("Synthetic frozen-v7 prefix is malformed");
    return { ...human, activity: frozen };
  });
  expect(world.events).toEqual(events);
  expect(world.ledger).toEqual(ledger);
  expect(legacy.perceptionCarry).toEqual(carry);
  assertWorldInvariants(world);
  legacy.world = serializeWorld(world);
  legacy.version = FIRST_RESIDENT_TRAVEL_GAME_SAVE_VERSION;
  const record = recordWith(currentRecord, legacy);
  close(current);
  return { record, currentRecord, tick, actorId: resident.identity.stableId, contractId: contract.id,
    task, pose, quantity: contract.quantity, resource: contract.resource, originId: origin.id,
    destinationId: destination.id, originStock: origin.inventory[contract.resource],
    destinationStock: destination.inventory[contract.resource], ledger, world: legacy.world, carry };
}

describe("supported resident-travel environment compatibility", () => {
  it("preserves a synthetic v7/outer57 phase4→9 prefix and upgrades only at the genuine boundary with equal cold work", async () => {
    const fixture = await compatibilityFixture();
    const originalRecord = structuredClone(fixture.record);
    const referenceRepository = new MemoryRepository(fixture.record);
    const reference = await open(referenceRepository);
    expect(reference.getUIView().saveWarning).toBeUndefined();
    soundscapePlay.mockClear();
    await reference.save();
    const loaded = decode(referenceRepository.snapshot());
    expect(loaded.world).toBe(fixture.world);
    expect(loaded.perceptionCarry).toEqual(fixture.carry);
    expect(soundscapePlay).not.toHaveBeenCalled();
    advance(reference, 6);
    await reference.save();
    const uninterrupted = decode(referenceRepository.snapshot());
    close(reference);

    const repository = new MemoryRepository(fixture.record);
    const runtime = await open(repository);
    expect(runtime.getUIView().saveWarning).toBeUndefined();
    advance(runtime, 5);
    await runtime.save();
    const phase9Record = repository.snapshot();
    const phase9 = decode(phase9Record);
    const phase9World = deserializeWorld(phase9.world);
    const waiting = actor(phase9World, fixture.actorId);
    expect(phase9.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    expect(phase9World.meta.completedTick).toBe(fixture.tick);
    expect(phase9World.residents.every(({ activity }) => activity?.version === RESIDENT_TRAVEL_ACTIVITY_VERSION
      && activity.poses.length === 10)).toBe(true);
    expect(waiting.activity?.travelTask).toEqual(fixture.task);
    expect(waiting.activity?.poses).toEqual(Array.from({ length: 10 }, () => fixture.pose));
    expect(phase9World.contracts.find(({ id }) => id === fixture.contractId))
      .toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity });
    expect(phase9World.ledger).toEqual(fixture.ledger);
    close(runtime);

    const boundaryRepository = new MemoryRepository(phase9Record);
    const boundaryRuntime = await open(boundaryRepository);
    expect(boundaryRuntime.getUIView().saveWarning).toBeUndefined();
    soundscapePlay.mockClear();
    await boundaryRuntime.save();
    expect(authoritativeRoots(decode(boundaryRepository.snapshot()))).toEqual(authoritativeRoots(phase9));
    expect(soundscapePlay).not.toHaveBeenCalled();
    advance(boundaryRuntime, 1);
    await boundaryRuntime.save();
    const boundary = decode(boundaryRepository.snapshot());
    const boundaryWorld = deserializeWorld(boundary.world);
    const carried = actor(boundaryWorld, fixture.actorId);
    expect(boundary.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expect(boundaryWorld.meta.completedTick).toBe(fixture.tick + 1);
    expect(boundaryWorld.residents.every(({ activity }) => activity?.version === RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION
      && activity.poses.length === 1)).toBe(true);
    expect(carried.activity?.poses).toEqual([fixture.pose]);
    expect(carried.activity?.travelTask).toEqual({ ...fixture.task, nextReassessmentAtTick: fixture.tick + 2 });
    expect(boundaryWorld.contracts.find(({ id }) => id === fixture.contractId))
      .toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity, departedTick: fixture.tick });
    expect(boundaryWorld.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource]).toBe(fixture.originStock);
    expect(boundaryWorld.settlements.find(({ id }) => id === fixture.destinationId)!.inventory[fixture.resource]).toBe(fixture.destinationStock);
    expect(boundaryWorld.ledger).toEqual(fixture.ledger);
    expect(authoritativeRoots(boundary)).toEqual(authoritativeRoots(uninterrupted));
    assertWorldInvariants(boundaryWorld);
    expect(fixture.record).toEqual(originalRecord);
  }, 90_000);

  it("rejects an outer57 record carrying all-null v8 authority without replacing its original bytes", async () => {
    const fixture = await compatibilityFixture();
    const envelope = decode(fixture.currentRecord);
    const world = deserializeWorld(envelope.world);
    expect(world.residents.every(({ activeContractId }) => activeContractId === null)).toBe(true);
    world.residents = world.residents.map((resident) => ({ ...resident, activity: canonicalizeResidentActivity({
      ...resident.activity, restTask: null, rationTask: null, materialTask: null,
      inspectionTask: null, pickupTask: null, travelTask: null,
    }, { actorId: resident.identity.stableId, tick: world.meta.completedTick, phase: 4 })! }));
    expect(world.residents.every(({ activity }) => activity?.version === RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION
      && Object.entries(activity).filter(([key]) => key.endsWith("Task")).every(([, task]) => task === null))).toBe(true);
    assertWorldInvariants(world);
    expect(residentActivitySaveExtensionsValid(world, true, true, true, true, true, true, true)).toBe(false);
    expect(residentActivitySaveExtensionsValid(world, true, true, true, true, true, true, true, true)).toBe(true);
    envelope.world = serializeWorld(world);
    envelope.version = FIRST_RESIDENT_TRAVEL_GAME_SAVE_VERSION;
    const original = recordWith(fixture.currentRecord, envelope);
    const unchanged = structuredClone(original);
    const repository = new MemoryRepository(original);
    const writes = vi.spyOn(repository, "save");
    const removes = vi.spyOn(repository, "remove");
    const rejected = await open(repository);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    expect(rejected.getUIView().title).toMatchObject({ visible: true, hasSave: false });
    await expect(rejected.save()).rejects.toThrow();
    expect(writes).not.toHaveBeenCalled();
    expect(removes).not.toHaveBeenCalled();
    expect(repository.snapshot()).toEqual(unchanged);
    expect(original).toEqual(unchanged);
  }, 90_000);
});

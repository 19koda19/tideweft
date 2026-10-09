import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import {
  assertWorldInvariants,
  deserializeWorld,
  serializeWorld,
  type ResidentState,
  type WorldState,
} from "../sim/public";
import * as simulation from "../sim/public";
import {
  RESIDENT_ENVIRONMENT_ACTIVITY_OWNER_ID,
  RESIDENT_ENVIRONMENT_ACTIVITY_VERSION,
  RESIDENT_PICKUP_ACTIVITY_OWNER_ID,
  RESIDENT_PICKUP_ACTIVITY_VERSION,
  RESIDENT_REST_APPROACH_STEP_UNITS,
  RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION,
} from "../sim/residentActivity";
import { residentRestTargetHasDrySupport, residentSettlementRestTarget } from "../sim/residentActivityWorld";
import { prepareResidentTravelAdvance, revokeResidentTravelAdvance } from "../sim/residentTravelAdvance";
import { findAutonomousRoutePlan } from "../sim/network";
import type { SimCommand } from "../sim/types";
import { gameSaveEnvelopeIntegrity } from "./physicalCargoState";
import type { SupplementalSoundSample } from "./humanPerception";
import { advanceResidentRestActivities } from "./residentActivityExecution";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import {
  CURRENT_GAME_SAVE_VERSION,
  FIRST_RESIDENT_ENVIRONMENT_GAME_SAVE_VERSION,
  FIRST_RESIDENT_PICKUP_GAME_SAVE_VERSION,
} from "./saveCompatibilityPolicy";
import * as situatedExpressionChannelBank from "./situatedExpressionChannelBank";
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
  perceptionCarry: {
    playerStepsSinceWorldTick: number;
    actorVocalizationSamples: readonly SupplementalSoundSample[];
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
    if (this.record === undefined) throw new Error("native pickup fixture has no committed save");
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

/** One clock-establishing RAF, then ordinary accepted 100ms fixed steps. */
function advance(runtime: TideweftRuntime, count: number, expectSuccess = true): void {
  runtime.start();
  for (let frame = 0; frame <= count; frame += 1) {
    const callback = scheduledFrame;
    if (callback === undefined) throw new Error("pickup runtime stopped scheduling ordinary play");
    scheduledFrame = undefined;
    callback(nextFrameTime);
    nextFrameTime += 100;
  }
  runtime.stop();
  if (expectSuccess) expect(runtime.getUIView().announcement?.message).not.toContain("INTEGRITY HALT");
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
  // Session recaps/presentation restart; every other persisted root must match.
  const { integrity: _integrity, session: _session, ...roots } = envelope;
  return roots;
}

function actor(world: WorldState, actorId: string): ResidentState {
  const human = world.residents.find(({ identity }) => identity.stableId === actorId);
  if (human === undefined) throw new Error("native pickup courier disappeared");
  return human;
}

function departedEvents(world: WorldState, contractId: number) {
  return world.events.filter((event) => event.type === "contract-departed" && event.subjectId === contractId);
}

function expectBoundedMotion(source: WorldPosition, poses: readonly { position: WorldPosition }[]): void {
  expect(poses[0]?.position).toEqual(source);
  for (let phase = 1; phase < poses.length; phase += 1) {
    const delta = worldPositionDelta(poses[phase - 1]!.position, poses[phase]!.position);
    expect(Math.hypot(delta.x, delta.y)).toBeLessThanOrEqual(RESIDENT_REST_APPROACH_STEP_UNITS);
  }
}

/**
 * Native offer, assignment, source stock, geometry and body placement. Only the
 * offer's player-exclusive window and short-fixture weather/need pressure are
 * controlled. Belonging urgency prevents preaccept material-service centering;
 * the simulation's actual assigned Promise then supplies its existing priority.
 * No pickup task, accepted/departed result, body pose or arrival is authored.
 */
async function acceptedFixture() {
  const bootstrapRepository = new MemoryRepository();
  const bootstrap = await open(bootstrapRepository);
  bootstrap.dispatchUI({ type: "new-world", seed: "runtime baseline estuary", posture: "gale", sessionShape: "wander" });
  await bootstrap.save();
  const originalRecord = bootstrapRepository.snapshot();
  const envelope = decode(originalRecord);
  const world = deserializeWorld(envelope.world);
  expect(world.meta.completedTick).toBe(420);
  expect(world.residents.every((human) => !Object.hasOwn(human, "activity"))).toBe(true);
  const contract = world.contracts.find(({ id }) => id === 127);
  if (contract === undefined) throw new Error("native estuary offer127 is absent");
  expect(contract).toMatchObject({ status: "offered", originSettlementId: 5, destinationSettlementId: 1,
    resource: "parts", quantity: 8, cargoQuantity: 0, assignedResidentId: null, carrierKind: null });
  const origin = world.settlements.find(({ id }) => id === contract.originSettlementId)!;
  const stock = origin.inventory[contract.resource];
  expect(stock).toBeGreaterThanOrEqual(contract.quantity);
  const sources = new Map(world.residents.filter((human) => human.location.kind === "settlement"
    && human.location.settlementId === contract.originSettlementId).map((human) => {
    const source = resolveResidentWorldPlacement(world, human)?.position;
    const target = residentSettlementRestTarget(world, human);
    if (source === undefined || target === null) throw new Error("native courier source has no physical placement");
    return [human.id, { actorId: human.identity.stableId, source, target }] as const;
  }));
  const nativeTerrain = world.terrain;
  const nativeRoutes = structuredClone(world.routes);
  const nativeStocks = world.settlements.map(({ id, inventory }) => ({ id, inventory: structuredClone(inventory) }));
  world.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: world.meta.completedTick + 1_000 };
  for (const human of world.residents) {
    human.needs = { food: 100_000, rest: 100_000, belonging: 900_000 };
    human.condition.exhaustion = 100_000;
  }
  contract.playerExclusiveUntilTick = world.meta.completedTick;
  expect(world.terrain).toBe(nativeTerrain);
  expect(world.routes).toEqual(nativeRoutes);
  expect(world.settlements.map(({ id, inventory }) => ({ id, inventory }))).toEqual(nativeStocks);
  assertWorldInvariants(world);
  envelope.world = serializeWorld(world);
  envelope.integrity = gameSaveEnvelopeIntegrity(envelope);
  const prepared = { ...originalRecord, payloadVersion: envelope.version, worldJson: JSON.stringify(envelope) };
  close(bootstrap);

  const repository = new MemoryRepository(prepared);
  const runtime = await open(repository);
  advance(runtime, 10);
  await runtime.save();
  const acceptedRecord = repository.snapshot();
  const accepted = decode(acceptedRecord);
  const acceptedWorld = deserializeWorld(accepted.world);
  const assignedContract = acceptedWorld.contracts.find(({ id }) => id === contract.id)!;
  expect(acceptedWorld.meta.completedTick).toBe(world.meta.completedTick + 1);
  expect(accepted.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
  expect(assignedContract).toMatchObject({ status: "accepted", acceptedTick: 421, cargoQuantity: 0,
    departedTick: null, carrierKind: "resident" });
  const source = assignedContract.assignedResidentId === null ? undefined : sources.get(assignedContract.assignedResidentId);
  if (source === undefined) throw new Error("actual automatic winner is not a native origin resident");
  const assigned = actor(acceptedWorld, source.actorId);
  expect(assigned.activeContractId).toBe(contract.id);
  expect(assigned.activity?.version).toBe(RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION);
  expect(assigned.activity?.poses).toHaveLength(1);
  expect(assigned.activity?.poses[0]?.position).toEqual(source.source);
  const sourceDelta = worldPositionDelta(source.source, source.target);
  expect(Math.hypot(sourceDelta.x, sourceDelta.y)).toBe(WORLD_POSITION_UNITS_PER_TILE);
  expect(residentRestTargetHasDrySupport(acceptedWorld, source.source)).toBe(true);
  expect(residentRestTargetHasDrySupport(acceptedWorld, source.target)).toBe(true);
  expect(assigned.activity?.pickupTask).toMatchObject({ kind: "contract-pickup", contractId: contract.id,
    target: source.target, phase: "approaching" });
  expect(acceptedWorld.settlements.find(({ id }) => id === origin.id)!.inventory[contract.resource]).toBe(stock);
  expect(departedEvents(acceptedWorld, contract.id)).toHaveLength(0);
  expect(acceptedWorld.events.filter((event) => event.type === "contract-accepted" && event.subjectId === contract.id)).toHaveLength(1);
  assertWorldInvariants(acceptedWorld);
  return { repository, runtime, accepted, acceptedRecord, actorId: source.actorId,
    source: source.source, target: source.target, contractId: contract.id, originId: origin.id,
    resource: contract.resource, quantity: contract.quantity, stock };
}

// Pickup evidence only. Full physical route execution/destination handoff has
// its separate runtime.residentTravel.integration.test.ts owner; a grandfathered
// old journey below is deliberately not represented as physical route work.
describe("ordinary runtime resident origin pickup", () => {
  it.each([4, 9])("executes a native automatic offer through real approach and equal phase%s cold work", async (phase) => {
    const fixture = await acceptedFixture();
    const { runtime, repository } = fixture;
    advance(runtime, phase);
    await runtime.save();
    const middleRecord = repository.snapshot();
    const middle = decode(middleRecord);
    const middleWorld = deserializeWorld(middle.world);
    const moving = actor(middleWorld, fixture.actorId);
    expect(middle.perceptionCarry.playerStepsSinceWorldTick).toBe(phase);
    expect(middleWorld.meta.completedTick).toBe(421);
    expect(moving.activity?.pickupTask).toMatchObject({ contractId: fixture.contractId, target: fixture.target, phase: "approaching" });
    expect(moving.activity?.poses.at(-1)?.position).not.toEqual(fixture.source);
    expect(moving.activity?.poses.at(-1)?.position).not.toEqual(fixture.target);
    expectBoundedMotion(fixture.source, moving.activity!.poses);
    expect(middleWorld.contracts.find(({ id }) => id === fixture.contractId)).toMatchObject({ status: "accepted", cargoQuantity: 0 });
    expect(middleWorld.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource]).toBe(fixture.stock);

    advance(runtime, 10 - phase);
    await runtime.save();
    const picked = decode(repository.snapshot());
    const pickedWorld = deserializeWorld(picked.world);
    const carrying = actor(pickedWorld, fixture.actorId);
    const contract = pickedWorld.contracts.find(({ id }) => id === fixture.contractId)!;
    expect(pickedWorld.meta.completedTick).toBe(422);
    expect(picked.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expect(carrying.activity?.poses[0]?.position).toEqual(fixture.target);
    expect(carrying.activity?.pickupTask).toBeNull();
    expect(contract).toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity, departedTick: 422 });
    expect(contract.arrivalTick).toBeGreaterThan(423);
    expect(pickedWorld.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource])
      .toBe(fixture.stock - fixture.quantity);
    expect(pickedWorld.ledger).toEqual(deserializeWorld(fixture.accepted.world).ledger);
    expect(departedEvents(pickedWorld, fixture.contractId)).toHaveLength(1);
    assertWorldInvariants(pickedWorld);

    advance(runtime, 10);
    await runtime.save();
    const uninterrupted = decode(repository.snapshot());
    const nextWorld = deserializeWorld(uninterrupted.world);
    expect(nextWorld.meta.completedTick).toBe(423);
    expect(nextWorld.contracts.find(({ id }) => id === fixture.contractId))
      .toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity, departedTick: 422 });
    expect(nextWorld.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource])
      .toBe(fixture.stock - fixture.quantity);
    expect(departedEvents(nextWorld, fixture.contractId)).toHaveLength(1);
    assertWorldInvariants(nextWorld);
    close(runtime);

    const coldRepository = new MemoryRepository(middleRecord);
    const cold = await open(coldRepository);
    await cold.save();
    expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(middle));
    advance(cold, 10 - phase);
    await cold.save();
    expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(picked));
    advance(cold, 10);
    await cold.save();
    expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(uninterrupted));
  }, 90_000);

  it.each([4, 9])("keeps the real heavy departure sound at its source through moving phase%s cold work", async (phase) => {
    const fixture = await acceptedFixture();
    const { runtime, repository } = fixture;
    advance(runtime, 10);
    await runtime.save();
    const departure = decode(repository.snapshot());
    const samples = departure.perceptionCarry.actorVocalizationSamples.filter(({ sourceActorId }) => sourceActorId === fixture.actorId);
    expect(samples).toHaveLength(1);
    expect(samples[0]?.position).toEqual(fixture.target);
    const strainedCount = () => soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-strained").length;
    const released = strainedCount();
    expect(released).toBeGreaterThan(0);

    advance(runtime, phase);
    await runtime.save();
    const middleRecord = repository.snapshot();
    const middle = decode(middleRecord);
    const world = deserializeWorld(middle.world);
    expect(middle.perceptionCarry.playerStepsSinceWorldTick).toBe(phase);
    expect(actor(world, fixture.actorId).activity?.travelTask).toMatchObject({ mode: "physical", contractId: fixture.contractId });
    expect(actor(world, fixture.actorId).activity?.poses.at(-1)?.position).not.toEqual(fixture.target);
    expect(middle.perceptionCarry.actorVocalizationSamples.filter(({ sourceActorId }) => sourceActorId === fixture.actorId)).toEqual(samples);
    expect(strainedCount()).toBe(released);
    advance(runtime, 10 - phase);
    await runtime.save();
    const uninterrupted = decode(repository.snapshot());
    close(runtime);

    const beforeCold = strainedCount();
    const coldRepository = new MemoryRepository(middleRecord);
    const cold = await open(coldRepository);
    await cold.save();
    expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(middle));
    expect(strainedCount()).toBe(beforeCold);
    advance(cold, 10 - phase);
    await cold.save();
    expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(uninterrupted));
    expect(strainedCount()).toBe(beforeCold);
  }, 90_000);

  it("rolls back the actual stock-to-cargo pickup when later interval closure fails", async () => {
    const fixture = await acceptedFixture();
    const { runtime, repository } = fixture;
    advance(runtime, 9);
    await runtime.save();
    const beforeRecord = repository.snapshot();
    const before = decode(beforeRecord);
    expect(actor(deserializeWorld(before.world), fixture.actorId).activity?.pickupTask?.phase).toBe("approaching");
    const originalStep = simulation.stepWorld;
    let attemptedPickup = false;
    const step = vi.spyOn(simulation, "stepWorld").mockImplementation((...args) => {
      const result = originalStep(...args);
      expect(result.contracts.find(({ id }) => id === fixture.contractId))
        .toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity, departedTick: 422 });
      expect(result.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource])
        .toBe(fixture.stock - fixture.quantity);
      expect(departedEvents(result, fixture.contractId)).toHaveLength(1);
      attemptedPickup = true;
      return result;
    });
    const closure = vi.spyOn(situatedExpressionChannelBank, "closeSituatedExpressionChannelBankInterval").mockReturnValueOnce(null);
    soundscapePlay.mockClear();
    advance(runtime, 1, false);
    expect(attemptedPickup).toBe(true);
    expect(closure).toHaveBeenCalled();
    expect(runtime.getUIView().announcement?.message).toContain("INTEGRITY HALT");
    expect(soundscapePlay.mock.calls).toEqual([["warning", 1]]);
    await runtime.save();
    const rolledBackRecord = repository.snapshot();
    expect(authoritativeRoots(decode(rolledBackRecord))).toEqual(authoritativeRoots(before));
    step.mockRestore();
    closure.mockRestore();
    close(runtime);

    const coldRepository = new MemoryRepository(rolledBackRecord);
    const cold = await open(coldRepository);
    await cold.save();
    expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(before));
    advance(cold, 1);
    await cold.save();
    const recovered = deserializeWorld(decode(coldRepository.snapshot()).world);
    expect(recovered.contracts.find(({ id }) => id === fixture.contractId))
      .toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity, departedTick: 422 });
    expect(recovered.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource])
      .toBe(fixture.stock - fixture.quantity);
    expect(departedEvents(recovered, fixture.contractId)).toHaveLength(1);
    assertWorldInvariants(recovered);
  }, 90_000);

  it.each(["stock", "route"] as const)("waits at actual arrival when the current %s cause is unavailable", async (missing) => {
    const fixture = await acceptedFixture();
    close(fixture.runtime);
    const controlled = decode(fixture.acceptedRecord);
    const world = deserializeWorld(controlled.world);
    const origin = world.settlements.find(({ id }) => id === fixture.originId)!;
    const contract = world.contracts.find(({ id }) => id === fixture.contractId)!;
    const ledgerBefore = structuredClone(world.ledger);
    const nativeRouteTraces = new Map(world.routes.map(({ id, traceStrength }) => [id, traceStrength]));
    if (missing === "stock") {
      // Explicit conserved scarcity input, not a claimed player transaction:
      // consume exactly this native aggregate source through its ledger. No
      // cargo, task, body, assignment or successful use result is introduced.
      const consumed = origin.inventory[fixture.resource];
      origin.inventory[fixture.resource] = 0;
      world.ledger.consumed[fixture.resource] += consumed;
      expect(world.ledger.consumed[fixture.resource]).toBe(ledgerBefore.consumed[fixture.resource] + consumed);
    } else {
      // Only existing network eligibility changes; native terrain/path/stock
      // remain intact. All incident edges must close to prevent another native
      // route from legitimately satisfying the same accepted commitment.
      for (const route of world.routes) {
        if (route.fromSettlementId === fixture.originId || route.toSettlementId === fixture.originId) route.traceStrength = 0;
      }
      expect(findAutonomousRoutePlan(world, contract.originSettlementId, contract.destinationSettlementId)).toBeUndefined();
      expect(world.ledger).toEqual(ledgerBefore);
    }
    const controlledLedger = structuredClone(world.ledger);
    const availableStock = origin.inventory[fixture.resource];
    assertWorldInvariants(world);
    controlled.world = serializeWorld(world);
    const repository = new MemoryRepository(recordWith(fixture.acceptedRecord, controlled));
    const runtime = await open(repository);
    advance(runtime, 10);
    await runtime.save();
    const waiting = deserializeWorld(decode(repository.snapshot()).world);
    const courier = actor(waiting, fixture.actorId);
    expect(courier.activity?.poses[0]?.position).toEqual(fixture.target);
    expect(courier.activity?.pickupTask).toMatchObject({ contractId: fixture.contractId,
      phase: "waiting", target: fixture.target, waitReason: missing === "stock" ? "no-stock" : "no-active-route" });
    expect(waiting.contracts.find(({ id }) => id === fixture.contractId)).toMatchObject({
      status: "accepted", cargoQuantity: 0, departedTick: null, assignedResidentId: courier.id,
    });
    expect(waiting.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource]).toBe(availableStock);
    expect(waiting.ledger).toEqual(controlledLedger);
    expect(departedEvents(waiting, fixture.contractId)).toHaveLength(0);
    assertWorldInvariants(waiting);

    advance(runtime, 10);
    await runtime.save();
    const continuingRecord = repository.snapshot();
    const continuingEnvelope = decode(continuingRecord);
    const continuing = deserializeWorld(continuingEnvelope.world);
    expect(continuing.meta.completedTick).toBe(423);
    expect(continuing.contracts.find(({ id }) => id === fixture.contractId))
      .toMatchObject({ status: "accepted", cargoQuantity: 0, departedTick: null });
    expect(continuing.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource]).toBe(availableStock);
    expect(continuing.ledger).toEqual(controlledLedger);
    expect(departedEvents(continuing, fixture.contractId)).toHaveLength(0);
    assertWorldInvariants(continuing);

    const waitingBody = structuredClone(actor(continuing, fixture.actorId).activity!);
    expect(waitingBody.pickupTask).toMatchObject({ phase: "approaching", selectedAtTick: 421 });
    expect(waitingBody.poses[0]?.position).toEqual(fixture.target);
    const replenishedOrigin = continuing.settlements.find(({ id }) => id === fixture.originId)!;
    let donor: { id: number; remaining: number } | null = null;
    if (missing === "stock") {
      // Controlled aggregate availability, not a new player transfer API. The
      // consumed source stays consumed: move exact existing native stock from
      // another settlement, never mint stock or undo the earlier consumption.
      const source = continuing.settlements.find(({ id, inventory }) => id !== fixture.originId
        && inventory[fixture.resource] >= fixture.quantity);
      if (source === undefined) throw new Error("native scarcity witness has no conserved replenishment source");
      const totalBefore = continuing.settlements.reduce((sum, settlement) => sum + settlement.inventory[fixture.resource], 0);
      source.inventory[fixture.resource] -= fixture.quantity;
      replenishedOrigin.inventory[fixture.resource] += fixture.quantity;
      donor = { id: source.id, remaining: source.inventory[fixture.resource] };
      expect(continuing.settlements.reduce((sum, settlement) => sum + settlement.inventory[fixture.resource], 0)).toBe(totalBefore);
    } else {
      for (const route of continuing.routes) {
        if (route.fromSettlementId === fixture.originId || route.toSettlementId === fixture.originId) {
          const nativeTrace = nativeRouteTraces.get(route.id);
          if (nativeTrace === undefined) throw new Error("native incident route lost its original eligibility");
          route.traceStrength = nativeTrace;
        }
      }
      expect(findAutonomousRoutePlan(continuing, contract.originSettlementId, contract.destinationSettlementId)).toBeDefined();
    }
    expect(actor(continuing, fixture.actorId).activity).toEqual(waitingBody);
    expect(continuing.ledger).toEqual(controlledLedger);
    assertWorldInvariants(continuing);
    const replenishedStock = replenishedOrigin.inventory[fixture.resource];
    continuingEnvelope.world = serializeWorld(continuing);
    close(runtime);

    const recoveryRepository = new MemoryRepository(recordWith(continuingRecord, continuingEnvelope));
    const recovery = await open(recoveryRepository);
    await recovery.save();
    const restored = decode(recoveryRepository.snapshot());
    expect(restored.world).toBe(continuingEnvelope.world);
    expect(restored.perceptionCarry).toEqual(continuingEnvelope.perceptionCarry);
    expect(departedEvents(deserializeWorld(restored.world), fixture.contractId)).toHaveLength(0);
    // The real phase-zero retry is already due at423. A genuine fine step
    // reaffirms arrival, but neither cold load nor that arrival debits stock.
    advance(recovery, 1);
    await recovery.save();
    const arrived = deserializeWorld(decode(recoveryRepository.snapshot()).world);
    expect(arrived.meta.completedTick).toBe(423);
    expect(actor(arrived, fixture.actorId).activity?.pickupTask)
      .toMatchObject({ phase: "arrived", selectedAtTick: 421, target: fixture.target });
    expect(arrived.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource]).toBe(replenishedStock);
    expect(arrived.contracts.find(({ id }) => id === fixture.contractId))
      .toMatchObject({ status: "accepted", cargoQuantity: 0, departedTick: null });
    advance(recovery, 9);
    await recovery.save();
    const picked = deserializeWorld(decode(recoveryRepository.snapshot()).world);
    expect(picked.meta.completedTick).toBe(424);
    expect(picked.contracts.find(({ id }) => id === fixture.contractId))
      .toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity, departedTick: 424 });
    expect(picked.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource])
      .toBe(replenishedStock - fixture.quantity);
    if (donor !== null) expect(picked.settlements.find(({ id }) => id === donor.id)!.inventory[fixture.resource]).toBe(donor.remaining);
    expect(picked.ledger).toEqual(controlledLedger);
    expect(departedEvents(picked, fixture.contractId)).toHaveLength(1);
    assertWorldInvariants(picked);
    advance(recovery, 10);
    await recovery.save();
    const next = deserializeWorld(decode(recoveryRepository.snapshot()).world);
    expect(next.meta.completedTick).toBe(425);
    expect(next.contracts.find(({ id }) => id === fixture.contractId))
      .toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity, departedTick: 424 });
    expect(next.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource])
      .toBe(replenishedStock - fixture.quantity);
    expect(next.ledger).toEqual(controlledLedger);
    expect(departedEvents(next, fixture.contractId)).toHaveLength(1);
    assertWorldInvariants(next);
  }, 90_000);

  it.each(["cancelled", "expired"] as const)("releases %s work at its real partial approach pose without a source snap", async (terminal) => {
    const fixture = await acceptedFixture();
    close(fixture.runtime);
    const world = deserializeWorld(fixture.accepted.world);
    // Lower-owner command/closure evidence, not a public UI for cancelling
    // another courier. A controlled physical obstruction stops the actual
    // approach after four steps; the remaining accepted steps must really wait.
    for (let phase = 1; phase <= 4; phase += 1) expect(advanceResidentRestActivities(world, phase)).not.toBeNull();
    const moving = actor(world, fixture.actorId);
    const poseBefore = structuredClone(moving.activity!.poses.at(-1)!);
    expect(poseBefore.position).not.toEqual(fixture.source);
    expect(poseBefore.position).not.toEqual(fixture.target);
    expectBoundedMotion(fixture.source, moving.activity!.poses);
    const contract = world.contracts.find(({ id }) => id === fixture.contractId)!;
    const ledgerBefore = structuredClone(world.ledger);
    const stockBefore = world.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource];
    const targetTile = world.terrain.tiles[world.settlements.find(({ id }) => id === fixture.originId)!.tileIndex]!;
    targetTile.terrain = "deep-water";
    expect(residentRestTargetHasDrySupport(world, fixture.target)).toBe(false);
    for (let phase = 5; phase <= 10; phase += 1) {
      expect(advanceResidentRestActivities(world, phase)).not.toBeNull();
      expect(actor(world, fixture.actorId).activity?.poses.at(-1)).toEqual(poseBefore);
    }
    expect(actor(world, fixture.actorId).activity?.pickupTask)
      .toMatchObject({ phase: "waiting", waitReason: "no-traversable-route" });
    expect(world.residents.every(({ activity }) => activity?.poses.length === 11)).toBe(true);
    const commands: readonly SimCommand[] = terminal === "cancelled"
      ? [{ id: "native-pickup-cancel", type: "cancel-contract", contractId: fixture.contractId }]
      : [];
    if (terminal === "expired") contract.dueTick = world.meta.completedTick;
    assertWorldInvariants(world);
    const admission = prepareResidentTravelAdvance(world, null);
    expect(admission).not.toBeNull();
    try {
      simulation.stepWorld(world, commands, undefined, undefined, admission!);
    } finally {
      revokeResidentTravelAdvance(admission!);
    }
    const released = actor(world, fixture.actorId);
    expect(world.contracts.find(({ id }) => id === fixture.contractId))
      .toMatchObject({ status: terminal, cargoQuantity: 0, departedTick: null, completedTick: 422 });
    expect(released.activeContractId).toBeNull();
    expect(released.location).toEqual({ kind: "settlement", settlementId: fixture.originId });
    expect(released.activity?.poses).toEqual([poseBefore]);
    expect(released.activity?.pickupTask).toBeNull();
    expect(world.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource]).toBe(stockBefore);
    expect(world.ledger).toEqual(ledgerBefore);
    expect(departedEvents(world, fixture.contractId)).toHaveLength(0);
    expect(world.events.filter((event) => event.type === `contract-${terminal}` && event.subjectId === fixture.contractId)).toHaveLength(1);
    assertWorldInvariants(world);
  }, 90_000);

  it("retains supported55 pickup/travel-free phase4 bodies and upgrades only at genuine phasezero", async () => {
    const bootstrapRepository = new MemoryRepository();
    const bootstrap = await open(bootstrapRepository);
    bootstrap.dispatchUI({ type: "new-world", seed: "runtime baseline estuary", posture: "gale", sessionShape: "wander" });
    await bootstrap.save();
    const originalRecord = bootstrapRepository.snapshot();
    const prepared = decode(originalRecord);
    const sourceWorld = deserializeWorld(prepared.world);
    expect(sourceWorld.residents.every((human) => !Object.hasOwn(human, "activity"))).toBe(true);
    // Explicit short-fixture offer deferral leaves native stock, terrain and
    // body placement intact, without introducing an accepted commitment.
    for (const contract of sourceWorld.contracts) {
      contract.playerExclusiveUntilTick = sourceWorld.meta.completedTick + 1_000;
      contract.dueTick = sourceWorld.meta.completedTick + 2_000;
    }
    assertWorldInvariants(sourceWorld);
    prepared.world = serializeWorld(sourceWorld);
    close(bootstrap);
    const currentRepository = new MemoryRepository(recordWith(originalRecord, prepared));
    const current = await open(currentRepository);
    advance(current, 14);
    await current.save();
    const phase4Record = currentRepository.snapshot();
    const legacy = decode(phase4Record);
    const world = deserializeWorld(legacy.world);
    expect(world.meta.completedTick).toBe(421);
    expect(legacy.perceptionCarry.playerStepsSinceWorldTick).toBe(4);
    expect(world.residents.every(({ activeContractId }) => activeContractId === null)).toBe(true);
    for (const human of world.residents) {
      const activity = human.activity;
      if (activity === undefined || activity.pickupTask !== null || activity.travelTask !== null) {
        throw new Error("cannot reconstruct v5 while current pickup or travel work exists");
      }
      expect(activity.version).toBe(RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION);
      expect(activity.poses).toHaveLength(5);
      // Only null successor fields may be removed from this task-free native
      // prefix. A current physical traveler cannot be downcast into a legacy journey:
      // its real cursor and motion history are authoritative, not disposable.
      const { pickupTask: _pickupTask, travelTask: _travelTask, ...body } = activity;
      human.activity = { ...body, version: RESIDENT_ENVIRONMENT_ACTIVITY_VERSION, ownerId: RESIDENT_ENVIRONMENT_ACTIVITY_OWNER_ID };
    }
    assertWorldInvariants(world);
    legacy.world = serializeWorld(world);
    legacy.version = FIRST_RESIDENT_ENVIRONMENT_GAME_SAVE_VERSION;
    const legacyRecord = recordWith(phase4Record, legacy);

    advance(current, 6);
    await current.save();
    const uninterrupted = decode(currentRepository.snapshot());
    close(current);

    const repository = new MemoryRepository(legacyRecord);
    const runtime = await open(repository);
    await runtime.save();
    const loaded = decode(repository.snapshot());
    expect(loaded.world).toBe(legacy.world);
    expect(loaded.perceptionCarry).toEqual(legacy.perceptionCarry);
    advance(runtime, 5);
    await runtime.save();
    const phase9 = decode(repository.snapshot());
    expect(phase9.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    expect(deserializeWorld(phase9.world).residents.every((human) => human.activity?.version === RESIDENT_ENVIRONMENT_ACTIVITY_VERSION
      && human.activity.poses.length === 10 && !Object.hasOwn(human.activity, "pickupTask")
      && !Object.hasOwn(human.activity, "travelTask"))).toBe(true);
    advance(runtime, 1);
    await runtime.save();
    const boundary = decode(repository.snapshot());
    const boundaryWorld = deserializeWorld(boundary.world);
    expect(boundary.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expect(boundaryWorld.meta.completedTick).toBe(422);
    expect(boundaryWorld.residents.every((human) => human.activity?.version === RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION
      && human.activity.poses.length === 1 && human.activity.pickupTask === null && human.activity.travelTask === null)).toBe(true);
    expect(authoritativeRoots(boundary)).toEqual(authoritativeRoots(uninterrupted));
    assertWorldInvariants(boundaryWorld);
  }, 90_000);

  it("continues a supported56 real pickup prefix into an explicit legacy journey without inventing physical travel", async () => {
    const fixture = await acceptedFixture();
    advance(fixture.runtime, 4);
    await fixture.runtime.save();
    const phase4Record = fixture.repository.snapshot();
    const legacy = decode(phase4Record);
    const world = deserializeWorld(legacy.world);
    expect(world.meta.completedTick).toBe(421);
    expect(legacy.perceptionCarry.playerStepsSinceWorldTick).toBe(4);
    const moving = actor(world, fixture.actorId);
    expect(moving.activity?.pickupTask).toMatchObject({ contractId: fixture.contractId, phase: "approaching", target: fixture.target });
    expectBoundedMotion(fixture.source, moving.activity!.poses);
    const pickupBefore = structuredClone(moving.activity!.pickupTask);
    const posesBefore = structuredClone(moving.activity!.poses);
    for (const human of world.residents) {
      const activity = human.activity;
      if (activity === undefined || activity.travelTask !== null) {
        throw new Error("cannot reconstruct v6 while a current journey exists");
      }
      expect(activity.version).toBe(RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION);
      expect(activity.poses).toHaveLength(5);
      // The genuine pickup task and every accepted pose remain unchanged.
      // This older protocol has not departed yet; removing a null travel field
      // does not fabricate or erase any physical journey.
      const { travelTask: _travelTask, ...body } = activity;
      human.activity = { ...body, version: RESIDENT_PICKUP_ACTIVITY_VERSION, ownerId: RESIDENT_PICKUP_ACTIVITY_OWNER_ID };
    }
    expect(actor(world, fixture.actorId).activity?.pickupTask).toEqual(pickupBefore);
    expect(actor(world, fixture.actorId).activity?.poses).toEqual(posesBefore);
    assertWorldInvariants(world);
    legacy.world = serializeWorld(world);
    legacy.version = FIRST_RESIDENT_PICKUP_GAME_SAVE_VERSION;
    const legacyRecord = recordWith(phase4Record, legacy);
    close(fixture.runtime);

    // Both continuations start from the identical frozen-v6 phase4 prefix.
    // Do not compare this old coarse departure with a current physical one.
    const uninterruptedRepository = new MemoryRepository(legacyRecord);
    const uninterruptedRuntime = await open(uninterruptedRepository);
    await uninterruptedRuntime.save();
    expect(decode(uninterruptedRepository.snapshot()).world).toBe(legacy.world);
    advance(uninterruptedRuntime, 6);
    await uninterruptedRuntime.save();
    const uninterrupted = decode(uninterruptedRepository.snapshot());
    close(uninterruptedRuntime);

    const repository = new MemoryRepository(legacyRecord);
    const runtime = await open(repository);
    await runtime.save();
    const loaded = decode(repository.snapshot());
    expect(loaded.world).toBe(legacy.world);
    expect(loaded.perceptionCarry).toEqual(legacy.perceptionCarry);
    advance(runtime, 5);
    await runtime.save();
    const phase9Record = repository.snapshot();
    const phase9 = decode(phase9Record);
    const phase9World = deserializeWorld(phase9.world);
    expect(phase9.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    expect(phase9World.residents.every((human) => human.activity?.version === RESIDENT_PICKUP_ACTIVITY_VERSION
      && human.activity.poses.length === 10 && !Object.hasOwn(human.activity, "travelTask"))).toBe(true);
    expect(actor(phase9World, fixture.actorId).activity?.pickupTask).toMatchObject({ contractId: fixture.contractId });
    expect(phase9World.contracts.find(({ id }) => id === fixture.contractId))
      .toMatchObject({ status: "accepted", cargoQuantity: 0, departedTick: null });
    expect(phase9World.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource]).toBe(fixture.stock);
    expect(departedEvents(phase9World, fixture.contractId)).toHaveLength(0);
    close(runtime);

    const boundaryRepository = new MemoryRepository(phase9Record);
    const boundaryRuntime = await open(boundaryRepository);
    await boundaryRuntime.save();
    const restoredPhase9 = decode(boundaryRepository.snapshot());
    expect(restoredPhase9.world).toBe(phase9.world);
    expect(restoredPhase9.perceptionCarry).toEqual(phase9.perceptionCarry);
    advance(boundaryRuntime, 1);
    await boundaryRuntime.save();
    const boundary = decode(boundaryRepository.snapshot());
    const boundaryWorld = deserializeWorld(boundary.world);
    const carrying = actor(boundaryWorld, fixture.actorId);
    expect(boundary.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expect(boundaryWorld.meta.completedTick).toBe(422);
    expect(boundaryWorld.residents.every((human) => human.activity?.version === RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION
      && human.activity.poses.length === 1)).toBe(true);
    expect(carrying.activity?.pickupTask).toBeNull();
    expect(carrying.activity?.travelTask).toEqual({
      kind: "contract-travel", mode: "legacy-coarse", contractId: fixture.contractId, adoptedAtTick: 422,
    });
    expect(boundaryWorld.contracts.find(({ id }) => id === fixture.contractId))
      .toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity, departedTick: 422 });
    expect(boundaryWorld.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource])
      .toBe(fixture.stock - fixture.quantity);
    expect(boundaryWorld.ledger).toEqual(deserializeWorld(fixture.accepted.world).ledger);
    expect(departedEvents(boundaryWorld, fixture.contractId)).toHaveLength(1);
    expect(authoritativeRoots(boundary)).toEqual(authoritativeRoots(uninterrupted));
    assertWorldInvariants(boundaryWorld);
  }, 90_000);
});

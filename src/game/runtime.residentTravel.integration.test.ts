import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import { routeIsActive } from "../sim/network";
import {
  assertWorldInvariants,
  deserializeWorld,
  serializeWorld,
  type ContractState,
  type ResidentState,
  type WorldState,
} from "../sim/public";
import * as simulation from "../sim/public";
import {
  RESIDENT_REST_APPROACH_STEP_UNITS,
  RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION,
} from "../sim/residentActivity";
import { residentRestTargetHasDrySupport, residentSettlementRestTarget } from "../sim/residentActivityWorld";
import {
  residentTravelBodyIsLocal,
  residentTravelInteractionFrame,
  residentTravelSegment,
  residentTravelSegmentOffset,
} from "../sim/residentTravelRoute";
import { gameSaveEnvelopeIntegrity } from "./physicalCargoState";
import { REGIONAL_TRAVEL_COLUMNS, REGIONAL_TRAVEL_ROWS } from "./regionalTravel";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import { CURRENT_GAME_SAVE_VERSION } from "./saveCompatibilityPolicy";
import * as situatedExpressionChannelBank from "./situatedExpressionChannelBank";
import {
  createWorldPosition,
  worldPositionDelta,
  type WorldPosition,
} from "./worldPosition";

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
  regionalTravel: string;
  perceptionCarry: { playerStepsSinceWorldTick: number };
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
    if (this.record === undefined) throw new Error("native travel fixture has no committed save");
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

/** Establish the RAF clock, then process exactly count ordinary fixed steps. */
function advance(runtime: TideweftRuntime, count: number, expectSuccess = true): void {
  runtime.start();
  for (let frame = 0; frame <= count; frame += 1) {
    const callback = scheduledFrame;
    if (callback === undefined) throw new Error("traveler runtime stopped scheduling ordinary play");
    scheduledFrame = undefined;
    callback(nextFrameTime);
    nextFrameTime += 100;
  }
  runtime.stop();
  if (expectSuccess) {
    expect(runtime.getUIView().announcement?.message).not.toContain("INTEGRITY HALT");
    expect(runtime.getUIView().saveWarning).toBeUndefined();
  } else {
    expect(runtime.getUIView().saveWarning).toMatchObject({
      id: "runtime-integrity-halt",
      message: "SIMULATION PAUSED SAFELY",
      tone: "danger",
    });
  }
}

function decode(record: SaveRecord): Envelope {
  const envelope = JSON.parse(record.worldJson) as Envelope;
  expect(envelope.format).toBe("tideweft-session");
  expect(envelope.version).toBe(CURRENT_GAME_SAVE_VERSION);
  expect(record.payloadVersion).toBe(CURRENT_GAME_SAVE_VERSION);
  expect(envelope.integrity).toBe(gameSaveEnvelopeIntegrity(envelope));
  return envelope;
}

function authoritativeRoots(envelope: Envelope): unknown {
  // Only session recap/presentation restart. World, event history, bodies,
  // perception, custody, ecology, player and every other saved root must agree.
  const { integrity: _integrity, session: _session, ...roots } = envelope;
  return roots;
}

function recordWith(record: SaveRecord, envelope: Envelope): SaveRecord {
  envelope.integrity = gameSaveEnvelopeIntegrity(envelope);
  return { ...record, payloadVersion: envelope.version, worldJson: JSON.stringify(envelope) };
}

function contract(world: WorldState, id: number): ContractState {
  const result = world.contracts.find((candidate) => candidate.id === id);
  if (result === undefined) throw new Error("native traveler contract disappeared");
  return result;
}

function actor(world: WorldState, actorId: string): ResidentState {
  const result = world.residents.find(({ identity }) => identity.stableId === actorId);
  if (result === undefined) throw new Error("native traveler identity disappeared");
  return result;
}

function routeDistance(world: WorldState, commitment: ContractState, human: ResidentState): number {
  const task = human.activity?.travelTask;
  if (task?.mode !== "physical") throw new Error("new traveler lost its explicit physical cursor");
  const segment = residentTravelSegment(world, commitment, task);
  const pose = human.activity!.poses.at(-1)!;
  const offset = segment === null ? null : residentTravelSegmentOffset(segment, pose.position);
  if (offset === null) throw new Error("native traveler body is not on its own exact route edge");
  const earlierLegs = commitment.porterRouteIds.slice(0, task.legIndex).reduce((total, id) => {
    const route = world.routes.find((candidate) => candidate.id === id);
    if (route === undefined) throw new Error("native itinerary lost a prior route");
    return total + (route.path.length - 1) * 1_000;
  }, 0);
  return earlierLegs + (task.waypointIndex - 1) * 1_000 + offset;
}

function boundedFineWork(human: ResidentState): number {
  const poses = human.activity!.poses;
  let distance = 0;
  for (let index = 1; index < poses.length; index += 1) {
    const delta = worldPositionDelta(poses[index - 1]!.position, poses[index]!.position);
    const units = Math.ceil(Math.hypot(delta.x, delta.y));
    expect(units).toBeLessThanOrEqual(RESIDENT_REST_APPROACH_STEP_UNITS);
    distance += units;
  }
  return distance;
}

/**
 * Native seed/offer/stock/routes and ordinary automatic selection. Only this
 * offer's exclusivity, quiet weather and declared need pressure are controlled.
 * Belonging urgency prevents unrelated service centering before acceptance;
 * the actual accepted Promise supplies its existing priority afterward.
 * No body, task, winner, terrain, route, stock, cargo or arrival is assigned.
 * The standard-pressure survey is only a candidate: runtime's actual wild
 * world must independently contain this offer and demonstrate the whole loop.
 */
async function nativeFixture() {
  const bootstrapRepository = new MemoryRepository();
  const bootstrap = await open(bootstrapRepository);
  bootstrap.dispatchUI({ type: "new-world", seed: "breathing room regional density 8",
    posture: "gale", sessionShape: "wander" });
  await bootstrap.save();
  const originalRecord = bootstrapRepository.snapshot();
  const envelope = decode(originalRecord);
  const world = deserializeWorld(envelope.world);
  expect(world.meta).toMatchObject({ seedText: "breathing room regional density 8", pressureMode: "wild", completedTick: 420 });
  expect(world.residents.every((human) => !Object.hasOwn(human, "activity"))).toBe(true);
  const commitment = world.contracts.find((candidate) => candidate.status === "offered"
    && candidate.originSettlementId === 6 && candidate.destinationSettlementId === 7 && candidate.resource === "food");
  if (commitment === undefined) throw new Error("Actual runtime wild seed has no native 6→7 food offer; do not fabricate one");
  expect(commitment).toMatchObject({ id: 133, quantity: 14, cargoQuantity: 0,
    carrierKind: null, assignedResidentId: null, acceptedTick: null, departedTick: null });
  const origin = world.settlements.find(({ id }) => id === commitment.originSettlementId)!;
  const destination = world.settlements.find(({ id }) => id === commitment.destinationSettlementId)!;
  const route = world.routes.find(({ id }) => id === commitment.routeId)!;
  expect(route).toMatchObject({ id: 126, fromSettlementId: 6, toSettlementId: 7 });
  expect(route.path).toHaveLength(64);
  const destinationTile = world.terrain.tiles[destination.tileIndex]!;
  const destinationPosition = createWorldPosition({ x: 0, y: 0 }, destinationTile.x * 1_000 + 500, destinationTile.y * 1_000 + 500);
  const savedTravel = JSON.parse(envelope.regionalTravel) as { origin: { x: number; y: number } };
  expect(savedTravel.origin).toEqual({ x: 18, y: -1 });
  expect(bootstrap.getRenderView().terrain).toMatchObject({ columns: REGIONAL_TRAVEL_COLUMNS,
    rows: REGIONAL_TRAVEL_ROWS, worldTileOrigin: savedTravel.origin });
  const frame = residentTravelInteractionFrame({ origin: savedTravel.origin,
    terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS } });
  if (frame === null) throw new Error("native runtime has no current physical interaction frame");
  expect(residentTravelBodyIsLocal(frame, destinationPosition)).toBe(false);
  const sources = new Map(world.residents.filter((human) => human.location.kind === "settlement"
    && human.location.settlementId === origin.id).map((human) => {
    const source = resolveResidentWorldPlacement(world, human)?.position;
    const target = residentSettlementRestTarget(world, human);
    if (source === undefined || target === null) throw new Error("native origin resident lost its source geometry");
    return [human.id, { actorId: human.identity.stableId, source, target }] as const;
  }));
  const native = { terrain: structuredClone(world.terrain), routes: structuredClone(world.routes),
    stocks: world.settlements.map(({ id, inventory }) => ({ id, inventory: structuredClone(inventory) })),
    ledger: structuredClone(world.ledger) };
  const sourceStock = origin.inventory.food;
  expect(sourceStock).toBeGreaterThanOrEqual(commitment.quantity);
  world.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: 1_420 };
  for (const human of world.residents) human.needs = { food: 100_000, rest: 100_000, belonging: 900_000 };
  commitment.playerExclusiveUntilTick = world.meta.completedTick;
  expect(world.terrain).toEqual(native.terrain);
  expect(world.routes).toEqual(native.routes);
  expect(world.settlements.map(({ id, inventory }) => ({ id, inventory }))).toEqual(native.stocks);
  expect(world.ledger).toEqual(native.ledger);
  assertWorldInvariants(world);
  envelope.world = serializeWorld(world);
  envelope.integrity = gameSaveEnvelopeIntegrity(envelope);
  const prepared = { ...originalRecord, payloadVersion: envelope.version, worldJson: JSON.stringify(envelope) };
  close(bootstrap);
  const repository = new MemoryRepository(prepared);
  const runtime = await open(repository);
  return { runtime, repository, contractId: commitment.id, originId: origin.id, destinationId: destination.id,
    quantity: commitment.quantity, sourceStock, sources, destinationPosition, frame,
    totalDistance: (route.path.length - 1) * 1_000, initialTick: world.meta.completedTick };
}

describe("ordinary runtime conserved resident travel", () => {
  it("automatically picks up a native offer, walks its local route, continues outside the window and hands off once with equal cold work", async () => {
    const fixture = await nativeFixture();
    const { runtime, repository } = fixture;
    const originalStep = simulation.stepWorld;
    const departures = new Set<number>();
    const fulfillments = new Set<number>();
    const primaryTrace: { tick: number; distance: number; local: boolean; macroUnits: number }[] = [];
    let actorId: string | null = null;
    let primary = true;
    let attemptingMacroRollback = false;
    let attemptedMacroRollback = false;
    const observed: { completedTick: number | null; lastStatus: ContractState["status"] } = {
      completedTick: null, lastStatus: "offered",
    };
    const step = vi.spyOn(simulation, "stepWorld").mockImplementation((...args) => {
      const world = args[0];
      const before = contract(world, fixture.contractId);
      const beforeStatus = before.status;
      const beforeCargo = before.cargoQuantity;
      const beforeOriginStock = world.settlements.find(({ id }) => id === fixture.originId)!.inventory.food;
      const beforeDestinationStock = world.settlements.find(({ id }) => id === fixture.destinationId)!.inventory.food;
      const beforeTrust = world.settlements.find(({ id }) => id === fixture.originId)!.trust
        .find(({ settlementId }) => settlementId === fixture.destinationId)!.value;
      const beforeHuman = actorId === null ? undefined : actor(world, actorId);
      const beforeDistance = beforeStatus === "in-transit" && beforeHuman !== undefined
        ? routeDistance(world, before, beforeHuman) : null;
      const fineUnits = beforeDistance === null ? 0 : boundedFineWork(beforeHuman!);
      const result = originalStep(...args);
      const after = contract(result, fixture.contractId);
      if (attemptingMacroRollback) {
        expect(beforeStatus).toBe("in-transit");
        expect(after.status).toBe("in-transit");
        expect(beforeDistance).not.toBeNull();
        expect(routeDistance(result, after, actor(result, actorId!))).toBeGreaterThan(beforeDistance!);
        attemptedMacroRollback = true;
      }
      if (!primary) return result;
      observed.lastStatus = after.status;
      for (const event of result.events) {
        if (event.subjectId !== fixture.contractId) continue;
        if (event.type === "contract-departed") departures.add(event.sequence);
        if (event.type === "contract-fulfilled") fulfillments.add(event.sequence);
      }
      if (beforeStatus === "accepted" && after.status === "in-transit") {
        expect(after.cargoQuantity).toBe(fixture.quantity);
        expect(result.settlements.find(({ id }) => id === fixture.originId)!.inventory.food)
          .toBe(beforeOriginStock - fixture.quantity);
      }
      if (after.status === "in-transit" || (beforeStatus === "in-transit" && after.status === "fulfilled")) {
        if (actorId === null) throw new Error("native departure has no actual observed automatic winner");
        const human = actor(result, actorId);
        const pose = human.activity!.poses.at(-1)!;
        const distance = after.status === "fulfilled" ? fixture.totalDistance : routeDistance(result, after, human);
        const macroUnits = beforeDistance === null ? 0 : distance - beforeDistance;
        expect(macroUnits).toBeGreaterThanOrEqual(0);
        expect(macroUnits + fineUnits).toBeLessThanOrEqual(10 * RESIDENT_REST_APPROACH_STEP_UNITS);
        if (after.status === "in-transit") expect(human.activity?.travelTask?.mode).toBe("physical");
        const previous = primaryTrace.at(-1);
        if (previous !== undefined) {
          expect(distance).toBeGreaterThanOrEqual(previous.distance);
          expect(distance - previous.distance).toBeLessThanOrEqual(10 * RESIDENT_REST_APPROACH_STEP_UNITS);
        }
        primaryTrace.push({ tick: result.meta.completedTick, distance,
          local: residentTravelBodyIsLocal(fixture.frame, pose.position), macroUnits });
        if (after.status === "fulfilled") {
          observed.completedTick = result.meta.completedTick;
          expect(beforeCargo).toBe(fixture.quantity);
          expect(after.cargoQuantity).toBe(0);
          expect(result.settlements.find(({ id }) => id === fixture.destinationId)!.inventory.food)
            .toBe(beforeDestinationStock + fixture.quantity);
          expect(result.settlements.find(({ id }) => id === fixture.originId)!.trust
            .find(({ settlementId }) => settlementId === fixture.destinationId)!.value).toBeGreaterThan(beforeTrust);
          expect(after.deliveryTraceCost).toBeGreaterThan(0);
          expect(human.activeContractId).toBeNull();
          expect(human.location).toEqual({ kind: "settlement", settlementId: fixture.destinationId });
          expect(human.activity?.travelTask).toBeNull();
          expect(pose.position).toEqual(fixture.destinationPosition);
        }
      }
      assertWorldInvariants(result);
      return result;
    });

    advance(runtime, 10);
    await runtime.save();
    const accepted = decode(repository.snapshot());
    const acceptedWorld = deserializeWorld(accepted.world);
    const acceptedContract = contract(acceptedWorld, fixture.contractId);
    expect(acceptedContract).toMatchObject({ status: "accepted", cargoQuantity: 0, departedTick: null,
      carrierKind: "resident", acceptedTick: fixture.initialTick + 1 });
    const source = acceptedContract.assignedResidentId === null ? undefined : fixture.sources.get(acceptedContract.assignedResidentId);
    if (source === undefined) throw new Error("actual automatic winner is not an existing native origin resident");
    actorId = source.actorId;
    const acceptedHuman = actor(acceptedWorld, actorId);
    expect(acceptedHuman.activity?.version).toBe(RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION);
    expect(acceptedHuman.activity?.poses[0]?.position).toEqual(source.source);
    expect(acceptedHuman.activity?.pickupTask).toMatchObject({ contractId: fixture.contractId, phase: "approaching", target: source.target });
    expect(acceptedHuman.activity?.travelTask).toBeNull();
    expect(worldPositionDelta(source.source, source.target)).not.toEqual({ x: 0, y: 0 });
    expect(residentRestTargetHasDrySupport(acceptedWorld, source.source)).toBe(true);
    expect(residentRestTargetHasDrySupport(acceptedWorld, source.target)).toBe(true);
    expect(acceptedWorld.settlements.find(({ id }) => id === fixture.originId)!.inventory.food).toBe(fixture.sourceStock);
    expect(departures.size).toBe(0);

    let picked: Envelope | null = null;
    for (let interval = 0; interval < 4; interval += 1) {
      advance(runtime, 10);
      await runtime.save();
      const candidate = decode(repository.snapshot());
      const candidateWorld = deserializeWorld(candidate.world);
      if (contract(candidateWorld, fixture.contractId).status === "in-transit") {
        picked = candidate;
        break;
      }
      expect(contract(candidateWorld, fixture.contractId)).toMatchObject({ status: "accepted", cargoQuantity: 0, departedTick: null });
      expect(candidateWorld.settlements.find(({ id }) => id === fixture.originId)!.inventory.food).toBe(fixture.sourceStock);
    }
    if (picked === null) throw new Error("native automatic winner did not genuinely reach and pick up its source within four intervals");
    const pickedWorld = deserializeWorld(picked.world);
    const pickedContract = contract(pickedWorld, fixture.contractId);
    const pickedHuman = actor(pickedWorld, actorId);
    expect(pickedContract).toMatchObject({ cargoQuantity: fixture.quantity,
      porterRouteIds: [126], porterSettlementIds: [6, 7] });
    expect(pickedHuman.activity?.poses[0]?.position).toEqual(source.target);
    expect(pickedHuman.activity?.pickupTask).toBeNull();
    expect(pickedHuman.activity?.travelTask).toMatchObject({ mode: "physical", kind: "contract-travel",
      contractId: fixture.contractId, legIndex: 0, waypointIndex: 1, phase: "approaching" });
    expect(routeDistance(pickedWorld, pickedContract, pickedHuman)).toBe(0);
    expect(departures.size).toBe(1);
    expect(fulfillments.size).toBe(0);

    const coldRecords = new Map<number, SaveRecord>();
    const partials = new Map<number, Envelope>();
    for (const [phase, steps] of [[4, 4], [9, 5]] as const) {
      advance(runtime, steps);
      await runtime.save();
      const record = repository.snapshot();
      const middle = decode(record);
      const world = deserializeWorld(middle.world);
      const human = actor(world, actorId);
      expect(middle.perceptionCarry.playerStepsSinceWorldTick).toBe(phase);
      expect(world.meta.completedTick).toBe(pickedWorld.meta.completedTick);
      expect(human.activity?.poses).toHaveLength(phase + 1);
      expect(human.activity?.poses[0]?.position).toEqual(source.target);
      expect(human.activity?.poses.at(-1)?.position).not.toEqual(source.target);
      expect(human.activity?.travelTask).toMatchObject({ mode: "physical", legIndex: 0, waypointIndex: 1 });
      expect(routeDistance(world, contract(world, fixture.contractId), human)).toBeGreaterThan(0);
      expect(boundedFineWork(human)).toBeLessThanOrEqual(phase * RESIDENT_REST_APPROACH_STEP_UNITS);
      expect(contract(world, fixture.contractId)).toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity });
      coldRecords.set(phase, record);
      partials.set(phase, middle);
    }

    let macroRecord: SaveRecord | null = null;
    let macroReference: Envelope | null = null;
    advance(runtime, 1);
    const finalLimit = pickedWorld.meta.completedTick + 120;
    while (observed.lastStatus !== "fulfilled" && runtime.getRenderView().tick < finalLimit) {
      if (macroRecord === null && primaryTrace.at(-1)?.local === false) {
        // Retain a real off-window phase9 prefix before its next macro commit.
        // Neither a task/body nor a successful transport result is injected.
        advance(runtime, 9);
        await runtime.save();
        macroRecord = repository.snapshot();
        expect(decode(macroRecord).perceptionCarry.playerStepsSinceWorldTick).toBe(9);
        advance(runtime, 1);
        await runtime.save();
        macroReference = decode(repository.snapshot());
      } else advance(runtime, 10);
    }
    if (observed.completedTick === null) throw new Error(`Native journey did not hand off by tick${finalLimit}; retained status is ${observed.lastStatus}`);
    const completedTick = observed.completedTick;
    expect(completedTick).toBeGreaterThan(pickedContract.arrivalTick!);
    expect(primaryTrace.some(({ tick, distance }) => tick >= pickedContract.arrivalTick! && distance < fixture.totalDistance)).toBe(true);
    expect(primaryTrace.some(({ local, distance }) => local && distance > 0)).toBe(true);
    expect(primaryTrace.some(({ local, macroUnits }) => !local && macroUnits > 0)).toBe(true);
    expect(primaryTrace.at(-1)?.distance).toBe(fixture.totalDistance);
    expect(departures.size).toBe(1);
    expect(fulfillments.size).toBe(1);
    advance(runtime, 10);
    await runtime.save();
    const terminal = decode(repository.snapshot());
    const terminalWorld = deserializeWorld(terminal.world);
    expect(terminalWorld.meta.completedTick).toBe(completedTick + 1);
    expect(contract(terminalWorld, fixture.contractId)).toMatchObject({ status: "fulfilled", cargoQuantity: 0, completedTick });
    expect(actor(terminalWorld, actorId).activeContractId).toBeNull();
    expect(actor(terminalWorld, actorId).activity?.travelTask).toBeNull();
    expect(actor(terminalWorld, actorId).activity?.poses[0]?.position).toEqual(fixture.destinationPosition);
    expect(JSON.parse(terminal.regionalTravel).origin).toEqual(JSON.parse(picked.regionalTravel).origin);
    expect(runtime.getRenderView().terrain).toMatchObject({ columns: REGIONAL_TRAVEL_COLUMNS,
      rows: REGIONAL_TRAVEL_ROWS });
    expect(departures.size).toBe(1);
    expect(fulfillments.size).toBe(1);
    assertWorldInvariants(terminalWorld);
    close(runtime);
    primary = false;

    // Economical exact-work chain: cold phase4 joins the exact phase9 roots;
    // that detached phase9 then reaches the same complete terminal roots.
    const phase4Repository = new MemoryRepository(coldRecords.get(4)!);
    const phase4 = await open(phase4Repository);
    await phase4.save();
    expect(authoritativeRoots(decode(phase4Repository.snapshot()))).toEqual(authoritativeRoots(partials.get(4)!));
    advance(phase4, 5);
    await phase4.save();
    expect(authoritativeRoots(decode(phase4Repository.snapshot()))).toEqual(authoritativeRoots(partials.get(9)!));
    close(phase4);

    const phase9Repository = new MemoryRepository(coldRecords.get(9)!);
    const phase9 = await open(phase9Repository);
    await phase9.save();
    expect(authoritativeRoots(decode(phase9Repository.snapshot()))).toEqual(authoritativeRoots(partials.get(9)!));
    const remainingSteps = (terminalWorld.meta.completedTick - pickedWorld.meta.completedTick) * 10 - 9;
    advance(phase9, remainingSteps);
    await phase9.save();
    expect(authoritativeRoots(decode(phase9Repository.snapshot()))).toEqual(authoritativeRoots(terminal));
    close(phase9);

    if (macroRecord === null || macroReference === null) throw new Error("Native route never supplied its actual macro rollback boundary");
    const macroBefore = decode(macroRecord);
    const failedRepository = new MemoryRepository(macroRecord);
    const failed = await open(failedRepository);
    await failed.save();
    expect(authoritativeRoots(decode(failedRepository.snapshot()))).toEqual(authoritativeRoots(macroBefore));
    const closure = vi.spyOn(situatedExpressionChannelBank, "closeSituatedExpressionChannelBankInterval")
      .mockReturnValueOnce(null);
    soundscapePlay.mockClear();
    attemptingMacroRollback = true;
    advance(failed, 1, false);
    attemptingMacroRollback = false;
    expect(attemptedMacroRollback).toBe(true);
    expect(closure).toHaveBeenCalled();
    expect(failed.getUIView().announcement?.message).toContain("INTEGRITY HALT");
    expect(soundscapePlay.mock.calls).toEqual([["warning", 1]]);
    await failed.save();
    const rollbackRecord = failedRepository.snapshot();
    expect(authoritativeRoots(decode(rollbackRecord))).toEqual(authoritativeRoots(macroBefore));
    closure.mockRestore();
    close(failed);

    // Failed candidate custody is not reusable. Cold recovery must obtain a
    // fresh closing admission and equal the independently accepted reference.
    const retryRepository = new MemoryRepository(rollbackRecord);
    const retry = await open(retryRepository);
    await retry.save();
    expect(authoritativeRoots(decode(retryRepository.snapshot()))).toEqual(authoritativeRoots(macroBefore));
    advance(retry, 1);
    await retry.save();
    expect(authoritativeRoots(decode(retryRepository.snapshot()))).toEqual(authoritativeRoots(macroReference));
    step.mockRestore();
  }, 180_000);

  it("holds the same native cargo and body past ETA, reenters through ordinary player motion and retries with equal cold work", async () => {
    const fixture = await nativeFixture();
    const { runtime, repository } = fixture;
    advance(runtime, 10);
    await runtime.save();
    const accepted = deserializeWorld(decode(repository.snapshot()).world);
    const acceptedContract = contract(accepted, fixture.contractId);
    expect(acceptedContract).toMatchObject({ status: "accepted", cargoQuantity: 0, departedTick: null });
    if (acceptedContract.assignedResidentId === null) throw new Error("Native acceptance did not choose a courier");
    const residentId = acceptedContract.assignedResidentId;
    const source = fixture.sources.get(residentId);
    if (source === undefined) throw new Error("Automatic winner is not a native source resident");
    // Follow the production selector's native winner, not the earlier route
    // survey's candidate; no resident assignment is controlled by this test.
    const actorId = source.actorId;
    const originalStep = simulation.stepWorld;
    const observed = { offWindow: false };
    const step = vi.spyOn(simulation, "stepWorld").mockImplementation((...args) => {
      const result = originalStep(...args);
      const commitment = contract(result, fixture.contractId);
      const human = actor(result, actorId);
      if (commitment.status === "in-transit"
        && !residentTravelBodyIsLocal(fixture.frame, human.activity!.poses.at(-1)!.position)) {
        observed.offWindow = true;
      }
      return result;
    });
    // Reproduce only the native prefix needed by this independent witness.
    // The original test above owns full journey/handoff and rollback coverage.
    for (let interval = 0; interval < 120 && !observed.offWindow; interval += 1) advance(runtime, 10);
    expect(observed.offWindow).toBe(true);
    await runtime.save();
    const offWindowRecord = repository.snapshot();
    const offWindowEnvelope = decode(offWindowRecord);
    const offWindow = deserializeWorld(offWindowEnvelope.world);
    expect(offWindowEnvelope.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    const traveling = contract(offWindow, fixture.contractId);
    const nativeHuman = actor(offWindow, actorId);
    expect(traveling).toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity,
      carrierKind: "resident", assignedResidentId: residentId, porterRouteIds: [126] });
    expect(nativeHuman.activity?.travelTask).toMatchObject({ mode: "physical", phase: "approaching" });
    const heldPose = nativeHuman.activity!.poses[0]!;
    const originalBody = structuredClone(nativeHuman.activity);
    const heldLocation = structuredClone(nativeHuman.location);
    const heldDistance = routeDistance(offWindow, traveling, nativeHuman);
    const heldTask = nativeHuman.activity!.travelTask;
    if (heldTask?.mode !== "physical") throw new Error("Native journey has no physical cursor");
    expect(residentTravelBodyIsLocal(fixture.frame, heldPose.position)).toBe(false);
    expect(heldDistance).toBeGreaterThan(0);
    const nativeRoute = offWindow.routes.find(({ id }) => id === 126)!;
    expect(routeIsActive(nativeRoute)).toBe(true);
    const originalTrace = nativeRoute.traceStrength;
    close(runtime);
    step.mockRestore();

    // Explicit environment-availability input, not a player repair operation.
    // Keep native path, terrain, stock, identity, custody, body and task intact.
    nativeRoute.traceStrength = 0;
    expect(routeIsActive(nativeRoute)).toBe(false);
    expect(actor(offWindow, actorId).activity).toEqual(originalBody);
    assertWorldInvariants(offWindow);
    offWindowEnvelope.world = serializeWorld(offWindow);
    const blockedInput = recordWith(offWindowRecord, offWindowEnvelope);
    const blockedRepository = new MemoryRepository(blockedInput);
    const blocked = await open(blockedRepository);
    await blocked.save();
    expect(authoritativeRoots(decode(blockedRepository.snapshot()))).toEqual(authoritativeRoots(offWindowEnvelope));

    const expectHeld = (world: WorldState): void => {
      const commitment = contract(world, fixture.contractId);
      const human = actor(world, actorId);
      expect(commitment).toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity,
        carrierKind: "resident", assignedResidentId: residentId, departedTick: traveling.departedTick,
        arrivalTick: traveling.arrivalTick, completedTick: null });
      expect(human.activeContractId).toBe(fixture.contractId);
      expect(human.identity.stableId).toBe(actorId);
      expect(human.activity?.poses.length).toBeGreaterThan(0);
      for (const pose of human.activity!.poses) expect(pose).toEqual(heldPose);
      expect(human.location).toEqual(heldLocation);
      expect(routeDistance(world, commitment, human)).toBe(heldDistance);
      expect(human.activity?.travelTask).toMatchObject({ mode: "physical", contractId: fixture.contractId,
        legIndex: heldTask.legIndex, waypointIndex: heldTask.waypointIndex,
        selectedAtTick: heldTask.selectedAtTick, lastProgressAtTick: heldTask.lastProgressAtTick,
        phase: "waiting", waitReason: "no-active-route" });
      expect(world.events.filter(({ type, subjectId }) => type === "contract-departed" && subjectId === fixture.contractId)).toHaveLength(1);
      expect(world.events.filter(({ type, subjectId }) => type === "contract-fulfilled" && subjectId === fixture.contractId)).toHaveLength(0);
      assertWorldInvariants(world);
    };

    advance(blocked, 10);
    await blocked.save();
    const held = deserializeWorld(decode(blockedRepository.snapshot()).world);
    expectHeld(held);
    expect(held.meta.completedTick).toBeGreaterThan(traveling.arrivalTick!);
    const startView = blocked.getRenderView();
    const startOrigin = startView.terrain.worldTileOrigin;
    if (startOrigin === undefined) throw new Error("Native player has no regional frame");
    const initialPlayerX = startOrigin.x + startView.player.position.x / startView.terrain.tileSize;
    const initialPlayerY = startOrigin.y + startView.player.position.y / startView.terrain.tileSize;
    expect(startOrigin).toEqual({ x: 18, y: -1 });
    expect(Math.floor(initialPlayerX)).toBe(78);
    expect(Math.floor(initialPlayerY)).toBe(59);
    blocked.dispatchRenderer({ type: "movement", vector: { x: -1, y: 0 } });
    let movingSteps = 0;
    while (blocked.getRenderView().terrain.worldTileOrigin?.x === 18 && movingSteps < 200) {
      advance(blocked, 1);
      movingSteps += 1;
    }
    blocked.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    expect(movingSteps).toBeGreaterThan(0);
    expect(movingSteps).toBeLessThan(200);
    const movedView = blocked.getRenderView();
    const movedOrigin = movedView.terrain.worldTileOrigin;
    expect(movedOrigin).toEqual({ x: 2, y: -1 });
    expect(movedView.terrain).toMatchObject({ columns: 120, rows: 120 });
    expect(movedOrigin!.x + movedView.player.position.x / movedView.terrain.tileSize).toBeLessThan(70);
    expect(movedOrigin!.y + movedView.player.position.y / movedView.terrain.tileSize).toBe(initialPlayerY);
    await blocked.save();
    const rebased = decode(blockedRepository.snapshot());
    expectHeld(deserializeWorld(rebased.world));
    expect(JSON.parse(rebased.regionalTravel).origin).toEqual(movedOrigin);
    const actualFrame = residentTravelInteractionFrame({ origin: movedOrigin!,
      terrain: { width: movedView.terrain.columns, height: movedView.terrain.rows } });
    if (actualFrame === null) throw new Error("Ordinary player motion did not supply a physical frame");
    expect(residentTravelBodyIsLocal(actualFrame, heldPose.position)).toBe(true);
    // Physical admission is not direct sight; the test grants no observation,
    // actor identification or player knowledge for this distant traveler.
    const remaining = (10 - rebased.perceptionCarry.playerStepsSinceWorldTick) % 10;
    if (remaining > 0) advance(blocked, remaining);
    await blocked.save();
    const readyRecord = blockedRepository.snapshot();
    const ready = decode(readyRecord);
    const readyWorld = deserializeWorld(ready.world);
    expect(ready.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expectHeld(readyWorld);
    expect(readyWorld.routes.find(({ id }) => id === 126)?.traceStrength).toBe(0);
    close(blocked);

    // Restore only the saved native availability, never the task, body, clock,
    // successful work or an imagined physical repair receipt.
    const readyBody = structuredClone(actor(readyWorld, actorId).activity);
    readyWorld.routes.find(({ id }) => id === 126)!.traceStrength = originalTrace;
    expect(routeIsActive(readyWorld.routes.find(({ id }) => id === 126)!)).toBe(true);
    expect(actor(readyWorld, actorId).activity).toEqual(readyBody);
    assertWorldInvariants(readyWorld);
    ready.world = serializeWorld(readyWorld);
    const retryRepository = new MemoryRepository(recordWith(readyRecord, ready));
    const retry = await open(retryRepository);
    await retry.save();
    expect(authoritativeRoots(decode(retryRepository.snapshot()))).toEqual(authoritativeRoots(ready));
    advance(retry, 9);
    await retry.save();
    const duePrefix = decode(retryRepository.snapshot());
    expect(duePrefix.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    expectHeld(deserializeWorld(duePrefix.world));
    advance(retry, 1);
    await retry.save();
    const reassessed = deserializeWorld(decode(retryRepository.snapshot()).world);
    expect(reassessed.meta.completedTick).toBe(readyWorld.meta.completedTick + 1);
    const reassessedHuman = actor(reassessed, actorId);
    expect(reassessedHuman.activity?.poses[0]).toEqual(heldPose);
    expect(reassessedHuman.location).toEqual(heldLocation);
    expect(reassessedHuman.activity?.travelTask).toMatchObject({ mode: "physical", phase: "approaching",
      waitReason: null, selectedAtTick: heldTask.selectedAtTick,
      legIndex: heldTask.legIndex, waypointIndex: heldTask.waypointIndex });
    expect(contract(reassessed, fixture.contractId).cargoQuantity).toBe(fixture.quantity);

    const coldRecords = new Map<number, SaveRecord>();
    const partials = new Map<number, Envelope>();
    for (const [phase, count] of [[4, 4], [9, 5]] as const) {
      advance(retry, count);
      await retry.save();
      const record = retryRepository.snapshot();
      const envelope = decode(record);
      const world = deserializeWorld(envelope.world);
      const human = actor(world, actorId);
      expect(envelope.perceptionCarry.playerStepsSinceWorldTick).toBe(phase);
      expect(human.activity?.poses).toHaveLength(phase + 1);
      expect(human.activity?.poses[0]).toEqual(heldPose);
      expect(human.activity?.poses.at(-1)?.position).not.toEqual(heldPose.position);
      expect(residentTravelBodyIsLocal(actualFrame, human.activity!.poses.at(-1)!.position)).toBe(true);
      expect(boundedFineWork(human)).toBeGreaterThan(0);
      expect(routeDistance(world, contract(world, fixture.contractId), human)).toBeGreaterThan(heldDistance);
      expect(routeDistance(world, contract(world, fixture.contractId), human) - heldDistance)
        .toBeLessThanOrEqual(phase * RESIDENT_REST_APPROACH_STEP_UNITS);
      expect(human.activity?.travelTask).toMatchObject({ mode: "physical", selectedAtTick: heldTask.selectedAtTick });
      expect(contract(world, fixture.contractId)).toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity });
      expect(world.events.filter(({ type, subjectId }) => type === "contract-departed" && subjectId === fixture.contractId)).toHaveLength(1);
      expect(world.events.filter(({ type, subjectId }) => type === "contract-fulfilled" && subjectId === fixture.contractId)).toHaveLength(0);
      assertWorldInvariants(world);
      coldRecords.set(phase, record);
      partials.set(phase, envelope);
    }
    advance(retry, 1);
    await retry.save();
    const reference = decode(retryRepository.snapshot());
    close(retry);

    const phase4Repository = new MemoryRepository(coldRecords.get(4)!);
    const phase4 = await open(phase4Repository);
    await phase4.save();
    expect(authoritativeRoots(decode(phase4Repository.snapshot()))).toEqual(authoritativeRoots(partials.get(4)!));
    advance(phase4, 5);
    await phase4.save();
    expect(authoritativeRoots(decode(phase4Repository.snapshot()))).toEqual(authoritativeRoots(partials.get(9)!));
    close(phase4);
    const phase9Repository = new MemoryRepository(coldRecords.get(9)!);
    const phase9 = await open(phase9Repository);
    await phase9.save();
    expect(authoritativeRoots(decode(phase9Repository.snapshot()))).toEqual(authoritativeRoots(partials.get(9)!));
    advance(phase9, 1);
    await phase9.save();
    expect(authoritativeRoots(decode(phase9Repository.snapshot()))).toEqual(authoritativeRoots(reference));
  }, 180_000);
});

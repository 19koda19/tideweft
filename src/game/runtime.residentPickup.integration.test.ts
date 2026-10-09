import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import {
  assertWorldInvariants,
  createWorldView,
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
import { residentRestSurfaceKnowledge, residentRestSurfaceObservationId } from "../sim/residentSurfaceKnowledge";
import {
  residentTravelBodyIsLocal, residentTravelInteractionFrame, residentTravelSegment,
  residentTravelSegmentOffset, residentTravelSegmentPose, residentTravelWindowInterval,
} from "../sim/residentTravelRoute";
import { MIN_TIDE_LEVEL, tideAtTick } from "../sim/terrain";
import { stableStringify } from "../sim/util";
import { prepareResidentTravelAdvance, residentTravelIntervalWorkUsed, residentTravelStepUnits, revokeResidentTravelAdvance } from "../sim/residentTravelAdvance";
import { findAutonomousRoutePlan } from "../sim/network";
import { WORLD_HEIGHT, WORLD_WIDTH, type SimCommand } from "../sim/types";
import { gameSaveEnvelopeIntegrity } from "./physicalCargoState";
import { TERRAIN_DRAG_PERMILLE } from "./footing";
import type { SupplementalSoundSample } from "./humanPerception";
import * as humanPerception from "./humanPerception";
import { advanceResidentRestActivities } from "./residentActivityExecution";
import * as residentActivityExecution from "./residentActivityExecution";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import type { PlayerState } from "./player";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import {
  CURRENT_GAME_SAVE_VERSION,
  FIRST_RESIDENT_ENVIRONMENT_GAME_SAVE_VERSION,
  FIRST_RESIDENT_PICKUP_GAME_SAVE_VERSION,
} from "./saveCompatibilityPolicy";
import * as situatedExpressionChannelBank from "./situatedExpressionChannelBank";
import { regionalWayknotContextAt } from "./regionalWayknots";
import * as regionalWorldView from "./regionalWorldView";
import {
  applyWayknotServiceWear, placeWayknot, queryWayknotEffects,
  WAYKNOT_FULL_STRENGTH, WAYKNOT_PLACEMENT_CONDITION_COST,
  WAYKNOT_SETTING_STRENGTH, WAYKNOT_SETTING_TICKS,
} from "./wayknots";
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
  expect(sourceDelta).toEqual({ x: -WORLD_POSITION_UNITS_PER_TILE, y: 0 });
  const sourceTile = acceptedWorld.terrain.tiles[Math.floor(source.source.localY / WORLD_POSITION_UNITS_PER_TILE)
    * acceptedWorld.terrain.width + Math.floor(source.source.localX / WORLD_POSITION_UNITS_PER_TILE)]!;
  expect(sourceTile).toMatchObject({ x: 38, y: 55, terrain: "meadow" });
  expect(acceptedWorld.terrain.tiles[origin.tileIndex]).toMatchObject({ x: 37, y: 55, terrain: "meadow" });
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

/**
 * The native unladen meadow approach spends 97 of its 105-unit ceiling per step.
 * Eleven actual fine steps reach the origin; only the second world closure can
 * debit stock. No task, position, arrival, assignment or source is introduced.
 */
async function completeNativeOriginApproach(
  fixture: Awaited<ReturnType<typeof acceptedFixture>>,
  acceptedPrefixPhase = 0,
) {
  expect(Number.isSafeInteger(acceptedPrefixPhase) && acceptedPrefixPhase >= 0 && acceptedPrefixPhase <= 9).toBe(true);
  const acceptedWorld = deserializeWorld(fixture.accepted.world);
  const acceptedTick = acceptedWorld.meta.completedTick;
  const terrain = stableStringify(acceptedWorld.terrain);
  // Counterfactual callers may have lawfully removed source stock or route
  // availability. Compare against their actual retained input, not the original
  // fixture quantity, without granting an arrival or successful transaction.
  const initialWorld = deserializeWorld(decode(fixture.repository.snapshot()).world);
  const initialStock = initialWorld.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource];
  let completed: { record: SaveRecord; envelope: Envelope; world: WorldState; human: ResidentState } | null = null;
  for (let interval = 0; interval < 2; interval += 1) {
    advance(fixture.runtime, interval === 0 ? 10 - acceptedPrefixPhase : 10);
    await fixture.runtime.save();
    const record = fixture.repository.snapshot();
    const envelope = decode(record);
    const world = deserializeWorld(envelope.world);
    const human = actor(world, fixture.actorId);
    expect(world.meta.completedTick).toBe(acceptedTick + interval + 1);
    expect(world.tide).toEqual(tideAtTick(world.meta.completedTick));
    expect(stableStringify(world.terrain)).toBe(terrain);
    expect(envelope.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    if (interval === 0) {
      const contactUnits = Math.floor(RESIDENT_REST_APPROACH_STEP_UNITS * TERRAIN_DRAG_PERMILLE.meadow / 1_000);
      expect(contactUnits).toBe(97);
      expect(worldPositionDelta(fixture.source, human.activity!.poses[0]!.position))
        .toEqual({ x: -10 * contactUnits, y: 0 });
      expect(human.activity?.pickupTask).toMatchObject({ phase: "approaching", target: fixture.target });
      expect(world.contracts.find(({ id }) => id === fixture.contractId))
        .toMatchObject({ status: "accepted", cargoQuantity: 0, departedTick: null });
      expect(world.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource]).toBe(initialStock);
      expect(world.ledger).toEqual(initialWorld.ledger);
      expect(departedEvents(world, fixture.contractId)).toHaveLength(0);
    } else {
      expect(human.activity?.poses[0]?.position).toEqual(fixture.target);
    }
    assertWorldInvariants(world);
    completed = { record, envelope, world, human };
  }
  if (completed === null) throw new Error("Native approach did not execute its bounded two intervals");
  return completed;
}


describe("ordinary runtime native traveler water response", () => {
  it.each([true, false])("waits at a native tidal endpoint with observed-water=%s, then cold continues equal work", async (observed) => {
    const fixture = await acceptedFixture();
    const { runtime, repository } = fixture;
    const endpoint: WorldPosition = { region: { x: 0, y: 0 }, localX: 43_500, localY: 47_500 };
    const bank: WorldPosition = { region: { x: 0, y: 0 }, localX: 43_500, localY: 48_500 };
    const original = deserializeWorld(fixture.accepted.world);
    const terrain = stableStringify(original.terrain);
    expect(residentRestTargetHasDrySupport(original, bank)).toBe(true);
    expect(residentRestTargetHasDrySupport(original, endpoint)).toBe(false);
    expect(residentRestTargetHasDrySupport({ ...original, tide: tideAtTick(449) }, endpoint)).toBe(false);
    expect(residentRestTargetHasDrySupport({ ...original, tide: tideAtTick(450) }, endpoint)).toBe(true);
    const observationId = residentRestSurfaceObservationId(fixture.actorId, endpoint);
    let removedSight = 0;
    if (!observed) {
      // Remove only this actor+locus information receipt. Geometry, native
      // tide, task/body/cargo, all other observations and hearing stay real.
      const collect = humanPerception.collectExistingHumanObservations;
      vi.spyOn(humanPerception, "collectExistingHumanObservations").mockImplementation((...args) => {
        const batches = collect(...args);
        if (humanPerception.humanObservationCollectionRejected(batches)) return batches;
        return batches.map((batch) => batch.observerId !== fixture.actorId ? batch : {
          ...batch,
          observations: batch.observations.filter((observation) => {
            if (observation.id !== observationId) return true;
            removedSight += 1;
            return false;
          }),
        });
      });
    }
    const save = async () => {
      await runtime.save();
      const record = repository.snapshot();
      const envelope = decode(record);
      const world = deserializeWorld(envelope.world);
      assertWorldInvariants(world);
      expect(world.tide).toEqual(tideAtTick(world.meta.completedTick));
      expect(stableStringify(world.terrain)).toBe(terrain);
      return { record, envelope, world, human: actor(world, fixture.actorId) };
    };
    let current = await completeNativeOriginApproach(fixture);
    const departedTick = current.world.meta.completedTick;
    expect(current.world.contracts.find(({ id }) => id === fixture.contractId))
      .toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity, departedTick });
    expect(current.human.activity?.poses[0]?.position).toEqual(fixture.target);
    const departure = current.human.activity!.poses[0]!.position;
    let firstBankTick: number | null = null;
    while (current.world.meta.completedTick < 449) {
      advance(runtime, 10);
      current = await save();
      const task = current.human.activity?.travelTask;
      if (firstBankTick === null && task?.mode === "physical" && task.waypointIndex === 14) {
        const contract = current.world.contracts.find(({ id }) => id === fixture.contractId)!;
        const segment = residentTravelSegment(current.world, contract, task);
        expect(segment?.route.id).toBe(121);
        expect(segment?.end).toEqual(endpoint);
        expect(current.human.activity?.poses[0]?.position).toEqual(bank);
        expect(task.phase).toBe(observed ? "waiting" : "approaching");
        expect(task.waitReason).toBe(observed ? "observed-water" : null);
        firstBankTick = current.world.meta.completedTick;
      }
      if (firstBankTick !== null) {
        // The uninformed physical retry is legitimately due at phase0; its
        // no-traversable-route wait is asserted during fine steps below.
        expect(current.human.activity?.travelTask).toMatchObject({ mode: "physical",
          phase: observed ? "waiting" : "approaching",
          waitReason: observed ? "observed-water" : null, legIndex: 0, waypointIndex: 14 });
        expect(current.human.activity?.poses[0]?.position).toEqual(bank);
        expect(current.world.contracts.find(({ id }) => id === fixture.contractId))
          .toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity });
      }
    }
    expect(firstBankTick).not.toBeNull();
    expect(firstBankTick).toBeLessThan(449);
    expect(departure).not.toEqual(bank);
    expect(residentRestSurfaceKnowledge(current.human.perception, endpoint, 449)).toBe(observed ? "wet" : "unknown");

    advance(runtime, 4);
    const phase4 = await save();
    expect(phase4.envelope.perceptionCarry.playerStepsSinceWorldTick).toBe(4);
    expect(phase4.human.activity?.travelTask).toMatchObject({ phase: "waiting",
      waitReason: observed ? "observed-water" : "no-traversable-route" });
    expect(phase4.human.activity?.poses.every(({ position }) => stableStringify(position) === stableStringify(bank))).toBe(true);
    advance(runtime, 5);
    const phase9 = await save();
    expect(phase9.envelope.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    advance(runtime, 1);
    const dryBoundary = await save();
    expect(dryBoundary.world.meta.completedTick).toBe(450);
    expect(residentRestTargetHasDrySupport(dryBoundary.world, endpoint)).toBe(true);
    expect(dryBoundary.human.activity?.poses[0]?.position).toEqual(bank);
    expect(dryBoundary.human.activity?.travelTask).toMatchObject({
      phase: observed ? "waiting" : "approaching", waitReason: observed ? "observed-water" : null,
    });
    if (observed) {
      // Boundary450 admitted sight of physical449: now-dry terrain is not
      // fresh dry knowledge. Neither loading nor ordinary fine steps erase it.
      expect(residentRestSurfaceKnowledge(dryBoundary.human.perception, endpoint, 450)).toBe("wet");
    } else expect(removedSight).toBeGreaterThan(0);
    advance(runtime, 4);
    const afterDryPhysics = await save();
    const delta = worldPositionDelta(bank, afterDryPhysics.human.activity!.poses.at(-1)!.position);
    const carried = dryBoundary.world.contracts.find(({ id }) => id === fixture.contractId)!;
    expect(carried).toMatchObject({ resource: "parts", cargoQuantity: 8 });
    const travelStepUnits = residentTravelStepUnits(dryBoundary.human.activity!, carried);
    expect(travelStepUnits).toBe(89);
    const bankTile = dryBoundary.world.terrain.tiles[Math.floor(bank.localY / 1_000)
      * dryBoundary.world.terrain.width + Math.floor(bank.localX / 1_000)]!;
    expect(bankTile).toMatchObject({ x: 43, y: 48 });
    const contactStepUnits = Math.floor(travelStepUnits! * TERRAIN_DRAG_PERMILLE[bankTile.terrain] / 1_000);
    // These four steps remain on the native bank half-edge. The89 cargo
    // ceiling is further constrained by actual ground, not exact-depth belief.
    expect(4 * contactStepUnits).toBeLessThan(500);
    expect(Math.hypot(delta.x, delta.y)).toBe(observed ? 0 : 4 * contactStepUnits);
    advance(runtime, 5);
    const freshPhase9 = await save();
    expect(freshPhase9.envelope.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    advance(runtime, 1);
    const freshBoundary = await save();
    expect(freshBoundary.world.meta.completedTick).toBe(451);
    if (observed) {
      expect(residentRestSurfaceKnowledge(freshBoundary.human.perception, endpoint, 451)).toBe("dry");
      expect(freshBoundary.human.activity?.travelTask).toMatchObject({ phase: "approaching", waitReason: null });
      expect(freshBoundary.human.activity?.poses[0]?.position).toEqual(bank);
    }
    advance(runtime, 4);
    const final = await save();
    if (observed) {
      expectBoundedMotion(bank, final.human.activity!.poses);
      expect(final.human.activity?.poses.at(-1)?.position).not.toEqual(bank);
    }
    expect(final.world.contracts.find(({ id }) => id === fixture.contractId))
      .toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity, departedTick });
    expect(final.world.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource])
      .toBe(fixture.stock - fixture.quantity);
    expect(departedEvents(final.world, fixture.contractId)).toHaveLength(1);
    expect(final.world.events.filter((event) => event.type === "contract-fulfilled" && event.subjectId === fixture.contractId)).toHaveLength(0);
    close(runtime);

    for (const prefix of [phase4, phase9]) {
      soundscapePlay.mockClear();
      const coldRepository = new MemoryRepository(prefix.record);
      const cold = await open(coldRepository);
      await cold.save();
      expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(prefix.envelope));
      expect(soundscapePlay).not.toHaveBeenCalled();
      advance(cold, 24 - prefix.envelope.perceptionCarry.playerStepsSinceWorldTick);
      await cold.save();
      expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(final.envelope));
      close(cold);
    }

    if (observed) {
      // Counterfactual starts AFTER genuine wet knowledge is already held.
      // Remove only its now-dry endpoint receipt; ordinary physical drying,
      // closing work and every other observation still occur on schedule.
      const collect = humanPerception.collectExistingHumanObservations;
      const removed: { perceivedClass: string; tick: number }[] = [];
      const missingDry = vi.spyOn(humanPerception, "collectExistingHumanObservations").mockImplementation((...args) => {
        const batches = collect(...args);
        if (humanPerception.humanObservationCollectionRejected(batches)) return batches;
        return batches.map((batch) => batch.observerId !== fixture.actorId ? batch : {
          ...batch,
          observations: batch.observations.filter((observation) => {
            if (observation.id !== observationId) return true;
            removed.push({ perceivedClass: observation.perceivedClass, tick: observation.observedAtTick });
            return false;
          }),
        });
      });
      const missingRepository = new MemoryRepository(freshPhase9.record);
      const missing = await open(missingRepository);
      advance(missing, 1);
      await missing.save();
      const missingBoundary = decode(missingRepository.snapshot());
      const missingWorld = deserializeWorld(missingBoundary.world);
      const missingHuman = actor(missingWorld, fixture.actorId);
      const heldTask = freshPhase9.human.activity?.travelTask;
      if (heldTask?.mode !== "physical") throw new Error("Native held prefix lost physical travel authority");
      expect(removed).toEqual([{ perceivedClass: "dry-ground", tick: 451 }]);
      expect(residentRestTargetHasDrySupport(missingWorld, endpoint)).toBe(true);
      expect(residentRestSurfaceKnowledge(missingHuman.perception, endpoint, 451)).toBe("unknown");
      expect(missingHuman.activity?.travelTask).toMatchObject({ phase: "waiting", waitReason: "observed-water",
        selectedAtTick: heldTask.selectedAtTick, legIndex: 0, waypointIndex: 14 });
      expect(missingWorld.contracts.find(({ id }) => id === fixture.contractId))
        .toEqual(freshBoundary.world.contracts.find(({ id }) => id === fixture.contractId));
      advance(missing, 4);
      await missing.save();
      const missingAfter = actor(deserializeWorld(decode(missingRepository.snapshot()).world), fixture.actorId);
      expect(missingAfter.activity?.poses.every(({ position }) => stableStringify(position) === stableStringify(bank))).toBe(true);
      close(missing);
      missingDry.mockRestore();

      const rollbackRepository = new MemoryRepository(freshPhase9.record);
      const rollback = await open(rollbackRepository);
      const prepare = residentActivityExecution.prepareResidentRestActivities;
      let attemptedRelease: unknown = null;
      const preparation = vi.spyOn(residentActivityExecution, "prepareResidentRestActivities").mockImplementation((...args) => {
        const result = prepare(...args);
        if (result && args[0].meta.completedTick === 451) {
          const human = actor(args[0], fixture.actorId);
          attemptedRelease = { knowledge: residentRestSurfaceKnowledge(human.perception, endpoint, 451),
            task: human.activity?.travelTask, position: human.activity?.poses[0]?.position };
        }
        return result;
      });
      const closure = vi.spyOn(situatedExpressionChannelBank, "closeSituatedExpressionChannelBankInterval").mockReturnValueOnce(null);
      soundscapePlay.mockClear();
      advance(rollback, 1, false);
      expect(attemptedRelease).toMatchObject({ knowledge: "dry", position: bank,
        task: { phase: "approaching", waitReason: null, legIndex: 0, waypointIndex: 14 } });
      expect(closure).toHaveBeenCalled();
      expect(rollback.getUIView().announcement?.message).toContain("INTEGRITY HALT");
      expect(soundscapePlay.mock.calls).toEqual([["warning", 1]]);
      await rollback.save();
      const rolledBack = rollbackRepository.snapshot();
      expect(authoritativeRoots(decode(rolledBack))).toEqual(authoritativeRoots(freshPhase9.envelope));
      preparation.mockRestore();
      closure.mockRestore();
      close(rollback);
      soundscapePlay.mockClear();
      const retryRepository = new MemoryRepository(rolledBack);
      const retry = await open(retryRepository);
      expect(soundscapePlay).not.toHaveBeenCalled();
      advance(retry, 1);
      await retry.save();
      expect(authoritativeRoots(decode(retryRepository.snapshot()))).toEqual(authoritativeRoots(freshBoundary.envelope));
      advance(retry, 4);
      await retry.save();
      expect(authoritativeRoots(decode(retryRepository.snapshot()))).toEqual(authoritativeRoots(final.envelope));
    }
  }, 180_000);
});


// Full delivery has its runtime.residentTravel.integration.test.ts owner.
// These native pickup and first-endpoint water witnesses do not replace it;
// a grandfathered journey below is explicitly not physical-route evidence.
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

    const approach = await completeNativeOriginApproach(fixture, phase);
    const picked = approach.envelope;
    const pickedWorld = approach.world;
    const carrying = actor(pickedWorld, fixture.actorId);
    const contract = pickedWorld.contracts.find(({ id }) => id === fixture.contractId)!;
    const departedTick = pickedWorld.meta.completedTick;
    const pickupAcceptedSteps = 10 * (departedTick - middleWorld.meta.completedTick);
    expect(pickupAcceptedSteps).toBe(20);
    expect(picked.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expect(carrying.activity?.poses[0]?.position).toEqual(fixture.target);
    expect(carrying.activity?.pickupTask).toBeNull();
    expect(contract).toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity, departedTick });
    expect(contract.arrivalTick).toBeGreaterThan(departedTick + 1);
    expect(pickedWorld.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource])
      .toBe(fixture.stock - fixture.quantity);
    expect(pickedWorld.ledger).toEqual(deserializeWorld(fixture.accepted.world).ledger);
    expect(departedEvents(pickedWorld, fixture.contractId)).toHaveLength(1);
    assertWorldInvariants(pickedWorld);

    advance(runtime, 10);
    await runtime.save();
    const uninterrupted = decode(repository.snapshot());
    const nextWorld = deserializeWorld(uninterrupted.world);
    expect(nextWorld.meta.completedTick).toBe(departedTick + 1);
    expect(nextWorld.contracts.find(({ id }) => id === fixture.contractId))
      .toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity, departedTick });
    expect(nextWorld.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource])
      .toBe(fixture.stock - fixture.quantity);
    expect(departedEvents(nextWorld, fixture.contractId)).toHaveLength(1);
    assertWorldInvariants(nextWorld);
    close(runtime);

    const coldRepository = new MemoryRepository(middleRecord);
    const cold = await open(coldRepository);
    await cold.save();
    expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(middle));
    advance(cold, pickupAcceptedSteps - phase);
    await cold.save();
    expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(picked));
    advance(cold, 10);
    await cold.save();
    expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(uninterrupted));
  }, 90_000);

  it.each([4, 9])("keeps the real heavy departure sound at its source through moving phase%s cold work", async (phase) => {
    const fixture = await acceptedFixture();
    const { runtime, repository } = fixture;
    const departure = (await completeNativeOriginApproach(fixture)).envelope;
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
    // The real eleven-step approach has arrived in the second interval. Its
    // phase9 prefix still holds no cargo until the next world closure commits.
    advance(runtime, 19);
    await runtime.save();
    const beforeRecord = repository.snapshot();
    const before = decode(beforeRecord);
    const beforeWorld = deserializeWorld(before.world);
    const departedTick = beforeWorld.meta.completedTick + 1;
    expect(before.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    expect(actor(beforeWorld, fixture.actorId).activity?.pickupTask?.phase).toBe("arrived");
    expect(actor(beforeWorld, fixture.actorId).activity?.poses.at(-1)?.position).toEqual(fixture.target);
    expect(beforeWorld.contracts.find(({ id }) => id === fixture.contractId))
      .toMatchObject({ status: "accepted", cargoQuantity: 0, departedTick: null });
    expect(beforeWorld.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource]).toBe(fixture.stock);
    const originalStep = simulation.stepWorld;
    let attemptedPickup = false;
    const step = vi.spyOn(simulation, "stepWorld").mockImplementation((...args) => {
      const result = originalStep(...args);
      expect(result.contracts.find(({ id }) => id === fixture.contractId))
        .toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity, departedTick });
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
      .toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity, departedTick });
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
    const waiting = (await completeNativeOriginApproach({ ...fixture, runtime, repository })).world;
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
    const continuingTick = continuing.meta.completedTick;
    expect(continuingTick).toBe(waiting.meta.completedTick + 1);
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
    // The real phase-zero retry is already due at this continuing boundary.
    // A genuine fine step reaffirms arrival; neither cold load nor arrival debits stock.
    advance(recovery, 1);
    await recovery.save();
    const arrived = deserializeWorld(decode(recoveryRepository.snapshot()).world);
    expect(arrived.meta.completedTick).toBe(continuingTick);
    expect(actor(arrived, fixture.actorId).activity?.pickupTask)
      .toMatchObject({ phase: "arrived", selectedAtTick: 421, target: fixture.target });
    expect(arrived.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource]).toBe(replenishedStock);
    expect(arrived.contracts.find(({ id }) => id === fixture.contractId))
      .toMatchObject({ status: "accepted", cargoQuantity: 0, departedTick: null });
    advance(recovery, 9);
    await recovery.save();
    const picked = deserializeWorld(decode(recoveryRepository.snapshot()).world);
    const departedTick = continuingTick + 1;
    expect(picked.meta.completedTick).toBe(departedTick);
    expect(picked.contracts.find(({ id }) => id === fixture.contractId))
      .toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity, departedTick });
    expect(picked.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource])
      .toBe(replenishedStock - fixture.quantity);
    if (donor !== null) expect(picked.settlements.find(({ id }) => id === donor.id)!.inventory[fixture.resource]).toBe(donor.remaining);
    expect(picked.ledger).toEqual(controlledLedger);
    expect(departedEvents(picked, fixture.contractId)).toHaveLength(1);
    assertWorldInvariants(picked);
    advance(recovery, 10);
    await recovery.save();
    const next = deserializeWorld(decode(recoveryRepository.snapshot()).world);
    expect(next.meta.completedTick).toBe(departedTick + 1);
    expect(next.contracts.find(({ id }) => id === fixture.contractId))
      .toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity, departedTick });
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

    // Inner-world continuation of this lower-owner release, not an outer58
    // relaunch or a public cancellation control. The old outer fixture still
    // belongs to tick421 and must not receive this tick422 world alone.
    const releasedBytes = serializeWorld(world);
    const releasedTick = world.meta.completedTick;
    const terminalContract = structuredClone(world.contracts.find(({ id }) => id === fixture.contractId)!);
    const continuations = [world, deserializeWorld(releasedBytes), structuredClone(world)];
    let continuedBytes: string | undefined;
    for (const current of continuations) {
      expect(serializeWorld(current)).toBe(releasedBytes);
      expect(actor(current, fixture.actorId).perception.tick).toBe(releasedTick);
      expect(residentActivityExecution.prepareResidentRestActivities(current)).toBe(true);
      const prepared = actor(current, fixture.actorId);
      // Retained urgent belonging lawfully prefers awake ordinary activity;
      // do not manufacture a ration/material task or successful future work.
      expect(prepared.intention).toBe("work");
      expect(prepared.circadian?.posture.state).toBe("awake");
      expect(prepared.activity?.poses).toEqual([poseBefore]);
      expect(prepared.activity?.pickupTask).toBeNull();
      expect(prepared.activity?.travelTask).toBeNull();
      for (let phase = 1; phase <= 10; phase += 1) {
        expect(advanceResidentRestActivities(current, phase)).not.toBeNull();
        const continuing = actor(current, fixture.actorId);
        expect(continuing.activeContractId).toBeNull();
        expect(continuing.activity?.pickupTask).toBeNull();
        expect(continuing.activity?.travelTask).toBeNull();
        expect(continuing.activity?.poses.at(-1)).toEqual(poseBefore);
        expectBoundedMotion(poseBefore.position, continuing.activity!.poses);
      }
      const continuationAdmission = prepareResidentTravelAdvance(current, null);
      expect(continuationAdmission).not.toBeNull();
      try {
        simulation.stepWorld(current, [], undefined, undefined, continuationAdmission!);
      } finally {
        revokeResidentTravelAdvance(continuationAdmission!);
      }
      expect(current.meta.completedTick).toBe(releasedTick + 1);
      expect(residentActivityExecution.prepareResidentRestActivities(current)).toBe(true);
      const continued = actor(current, fixture.actorId);
      expect(continued.perception.tick).toBe(releasedTick + 1);
      expect(continued.activeContractId).toBeNull();
      expect(continued.location).toEqual({ kind: "settlement", settlementId: fixture.originId });
      expect(continued.activity?.poses).toEqual([poseBefore]);
      expect(continued.activity?.pickupTask).toBeNull();
      expect(continued.activity?.travelTask).toBeNull();
      expect(current.contracts.find(({ id }) => id === fixture.contractId)).toEqual(terminalContract);
      expect(current.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource]).toBe(stockBefore);
      expect(current.ledger).toEqual(ledgerBefore);
      expect(departedEvents(current, fixture.contractId)).toHaveLength(0);
      expect(current.events.filter((event) => event.type === "contract-fulfilled" && event.subjectId === fixture.contractId)).toHaveLength(0);
      expect(current.events.filter((event) => event.type === `contract-${terminal}` && event.subjectId === fixture.contractId)).toHaveLength(1);
      assertWorldInvariants(current);
      const actualBytes = serializeWorld(current);
      if (continuedBytes === undefined) continuedBytes = actualBytes;
      else expect(actualBytes).toBe(continuedBytes);
    }
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

describe("runtime resident source-mat service", () => {
  it("commits real helped entry and finite mat wear, cold restores it, and rolls both back on later publication failure", async () => {
    const fixture = await acceptedFixture();
    const { runtime, repository } = fixture;
    const picked = (await completeNativeOriginApproach(fixture)).world;
    const departedTick = picked.meta.completedTick;
    const commitment = picked.contracts.find(({ id }) => id === fixture.contractId)!;
    expect(commitment).toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity, departedTick });
    expect(picked.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource])
      .toBe(fixture.stock - fixture.quantity);
    const route = picked.routes.find(({ id }) => id === commitment.porterRouteIds[0])!;
    const orderedPath = route.fromSettlementId === commitment.originSettlementId ? route.path : [...route.path].reverse();
    const cargoAllowance = residentTravelStepUnits(actor(picked, fixture.actorId).activity!, commitment)!;
    expect(cargoAllowance).toBe(89);
    // Initially dry land cannot host a native mat at this high tide: marsh
    // elevations are below470k. Find an actual nonharbor mat source whose
    // incoming route and next endpoint can all expose on the ensuing ebb.
    let sourcePrefix: readonly number[] | null = null;
    for (let index = 1; index < orderedPath.length - 1; index += 1) {
      const source = picked.terrain.tiles[orderedPath[index]!]!;
      if ((source.terrain !== "marsh" && source.terrain !== "tidal-flat")
        || picked.settlements.some(({ tileIndex }) => tileIndex === source.index)) continue;
      const prefix = orderedPath.slice(0, index + 2);
      if (prefix.some((tileIndex) => picked.terrain.tiles[tileIndex]!.terrain === "deep-water"
        || picked.terrain.tiles[tileIndex]!.elevation < MIN_TIDE_LEVEL)) continue;
      sourcePrefix = prefix;
      break;
    }
    if (sourcePrefix === null) throw new Error("Native route has no reachable ebb-exposed nonharbor mat source; do not reshape it");
    const nativePrefix = sourcePrefix;
    const minimumElevation = Math.min(...nativePrefix.map((tileIndex) => picked.terrain.tiles[tileIndex]!.elevation));
    let exposureTick: number | null = null;
    for (let tick = picked.meta.completedTick; tick <= commitment.dueTick; tick += 1) {
      const tide = tideAtTick(tick);
      if (tide.direction < 0 && tide.level <= minimumElevation) { exposureTick = tick; break; }
    }
    if (exposureTick === null) throw new Error("Actual native mat prefix has no ebb exposure by this Promise's finite dueTick");
    const contactStepBound = nativePrefix.slice(1).reduce((steps, tileIndex, index) => {
      const speed = (id: number) => Math.floor(cargoAllowance * TERRAIN_DRAG_PERMILLE[picked.terrain.tiles[id]!.terrain] / 1_000);
      return steps + Math.ceil(1_000 / Math.min(speed(nativePrefix[index]!), speed(tileIndex)));
    }, 0);
    // Geometry bounds every edge at the slower real endpoint contact speed;
    // two more intervals cover fresh pre-world sight and closing-phase alignment.
    // Only ordinary accepted steps below advance time or the actual body.
    const deadline = exposureTick + Math.ceil(contactStepBound / 10) + 2;
    const intervalBound = deadline - picked.meta.completedTick + 1;
    const rejectionCounts: Record<string, number> = {};
    const lastCandidates: Record<string, unknown>[] = [];
    const candidateFor = (world: WorldState, phase: number,
      window: Parameters<typeof advanceResidentRestActivities>[2],
      wayknots: Parameters<typeof advanceResidentRestActivities>[3]) => {
      const human = actor(world, fixture.actorId);
      const task = human.activity?.travelTask;
      const carried = world.contracts.find(({ id }) => id === fixture.contractId)!;
      const latestPose = human.activity?.poses.at(-1);
      const latestSource = latestPose === undefined ? undefined : world.terrain.tiles[
        Math.floor(latestPose.position.localY / 1_000) * world.terrain.width
          + Math.floor(latestPose.position.localX / 1_000)];
      // Fixture-only bounded diagnostics. Do not change a task, body, input,
      // deadline or authority root to obtain a qualifying service event.
      const candidate: Record<string, unknown> = {
        tick: world.meta.completedTick, nextAcceptedPhase: phase,
        taskMode: task?.mode ?? null, taskPhase: task?.mode === "physical" ? task.phase : null,
        waitReason: task?.mode === "physical" ? task.waitReason : null,
        nextReassessmentAtTick: task?.mode === "physical" ? task.nextReassessmentAtTick : null,
        contractStatus: carried.status, intention: human.intention, sheltering: human.condition.sheltering,
        pose: latestPose ?? null, sourceKind: latestSource?.terrain ?? null,
        sourceDry: latestPose === undefined ? null : residentRestTargetHasDrySupport(world, latestPose.position),
        endpointDry: null, local: null,
        window: window ?? null,
        offset: null, bare: null, aided: null, entered: null,
      };
      const reject = (reason: string): null => {
        rejectionCounts[reason] = (rejectionCounts[reason] ?? 0) + 1;
        lastCandidates.push({ ...candidate, rejection: reason });
        if (lastCandidates.length > 8) lastCandidates.shift();
        return null;
      };
      if (task?.mode !== "physical" || task.phase !== "approaching" || carried.status !== "in-transit") {
        return reject("not-physical-approaching-in-transit");
      }
      if (window === undefined || wayknots === undefined) return reject("missing-actual-window-or-aid-root");
      const segment = residentTravelSegment(world, carried, task);
      const pose = human.activity!.poses.at(-1)!;
      const offset = segment === null ? null : residentTravelSegmentOffset(segment, pose.position);
      const frame = residentTravelInteractionFrame(window);
      candidate.offset = offset;
      candidate.local = frame === null ? null : residentTravelBodyIsLocal(frame, pose.position);
      candidate.endpointDry = segment === null ? null : residentRestTargetHasDrySupport(world, segment.end);
      if (segment === null || offset === null || frame === null) return reject("invalid-segment-offset-frame");
      if (!residentTravelBodyIsLocal(frame, pose.position)) return reject("body-outside-window");
      if (!residentRestTargetHasDrySupport(world, pose.position)) return reject("source-not-dry");
      if (!residentRestTargetHasDrySupport(world, segment.end)) return reject("endpoint-not-dry");
      const span = residentTravelWindowInterval(frame, segment);
      const sourceX = Math.floor(pose.position.localX / 1_000);
      const sourceY = Math.floor(pose.position.localY / 1_000);
      const sourceTile = world.terrain.tiles[sourceY * world.terrain.width + sourceX]!;
      const resolved = regionalWayknotContextAt(createWorldView(world), sourceTile.index);
      if (resolved === undefined) return reject("no-wayknot-context");
      if (resolved.context.occupied) return reject("occupied-source");
      if (sourceTile.terrain !== "marsh" && sourceTile.terrain !== "tidal-flat") return reject("source-not-mat-compatible");
      if (span === null) return reject("segment-outside-window");
      // FOUNDATION-ONLY deployment at this real reachable dry source. Preserve
      // the finite saved starter, its placement debit and actual setup delay;
      // this is not evidence of ordinary player movement/F acquisition.
      const context = { ...resolved.context, tileIndex: sourceY * WORLD_WIDTH + sourceX };
      const placement = placeWayknot(wayknots, "reed-mat", context, world.meta.completedTick, pose.position.region);
      if (!placement.ok || placement.wayknot === null) return reject(`placement-${placement.reason}`);
      const effects = queryWayknotEffects(placement.state, context, { width: WORLD_WIDTH, height: WORLD_HEIGHT },
        world.meta.completedTick, pose.position.region);
      const used = residentTravelIntervalWorkUsed(human.activity!.poses)!;
      const remaining = Math.max(0, cargoAllowance * 10 - used);
      const targetOffset = Math.min(1_000, span.last);
      const bare = Math.min(cargoAllowance, remaining,
        Math.floor(cargoAllowance * TERRAIN_DRAG_PERMILLE[sourceTile.terrain] / 1_000), targetOffset - offset);
      const aided = Math.min(cargoAllowance, remaining, Math.floor(cargoAllowance * Math.min(1_000,
        TERRAIN_DRAG_PERMILLE[sourceTile.terrain] + 1_000 - effects.movementCostPermille) / 1_000), targetOffset - offset);
      candidate.bare = bare;
      candidate.aided = aided;
      if (aided <= bare || aided <= 0) return reject("no-positive-helped-displacement");
      const expectedPose = residentTravelSegmentPose(segment, offset + aided);
      const entered = Math.floor(expectedPose.position.localX / 1_000) !== sourceX
        || Math.floor(expectedPose.position.localY / 1_000) !== sourceY;
      candidate.entered = entered;
      if (!entered) return reject("helped-step-does-not-enter-tile");
      const service = applyWayknotServiceWear(placement.state, placement.wayknot.id, world.meta.completedTick,
        WAYKNOT_FULL_STRENGTH, pose.position.region);
      if (!service.ok) throw new Error("Actual source placement cannot lawfully receive its first service");
      return { world, human, pose, placement, service, expectedPose,
        barePose: residentTravelSegmentPose(segment, offset + bare), bare, aided };
    };
    const discoveryState: { found: {
      phase: number; world: string; pose: ReturnType<typeof residentTravelSegmentPose>;
      window: NonNullable<Parameters<typeof advanceResidentRestActivities>[2]>;
      wayknots: PlayerState["wayknots"];
    } | null } = { found: null };
    const originalAdvance = residentActivityExecution.advanceResidentRestActivities;
    // Observe actual inputs without changing native movement. Save once per
    // interval, then cold replay only the discovered fine prefix below.
    const discovery = vi.spyOn(residentActivityExecution, "advanceResidentRestActivities").mockImplementation((...args) => {
      if (discoveryState.found === null) {
        const candidate = candidateFor(...args);
        if (candidate !== null) discoveryState.found = {
          phase: args[1], world: serializeWorld(args[0]), pose: structuredClone(candidate.pose),
          window: structuredClone(args[2]!), wayknots: structuredClone(args[3]!),
        };
      }
      return originalAdvance(...args);
    });
    let intervalStartRecord: SaveRecord | null = null;
    for (let interval = 0; interval < intervalBound; interval += 1) {
      await runtime.save();
      const record = repository.snapshot();
      const envelope = decode(record);
      expect(envelope.perceptionCarry).toMatchObject({ version: 14, playerStepsSinceWorldTick: 0 });
      advance(runtime, 10);
      if (discoveryState.found !== null) { intervalStartRecord = record; break; }
    }
    discovery.mockRestore();
    const found = discoveryState.found;
    if (found === null || intervalStartRecord === null) {
      throw new Error(`No real dry source-mat entry at any accepted phase in ${intervalBound} native-prefix intervals; do not fabricate a body. ${JSON.stringify({ exposureTick, deadline, rejectionCounts, lastCandidates })}`);
    }
    close(runtime);
    const prefixRepository = new MemoryRepository(intervalStartRecord);
    const prefixRuntime = await open(prefixRepository);
    await prefixRuntime.save();
    expect(authoritativeRoots(decode(prefixRepository.snapshot()))).toEqual(authoritativeRoots(decode(intervalStartRecord)));
    advance(prefixRuntime, found.phase - 1);
    await prefixRuntime.save();
    const readyRecord = prefixRepository.snapshot();
    const readyEnvelope = decode(readyRecord);
    expect(readyEnvelope.perceptionCarry).toMatchObject({ version: 14, playerStepsSinceWorldTick: found.phase - 1 });
    expect(readyEnvelope.world).toBe(found.world);
    const readyWorld = deserializeWorld(readyEnvelope.world);
    expect(actor(readyWorld, fixture.actorId).activity?.poses.at(-1)).toEqual(found.pose);
    expect((readyEnvelope.player as PlayerState).wayknots).toEqual(found.wayknots);
    const replayWindow = JSON.parse(readyEnvelope.regionalTravel as string) as { origin: { x: number; y: number } };
    const replayTerrain = prefixRuntime.getRenderView().terrain;
    expect({ origin: replayWindow.origin, terrain: { width: replayTerrain.columns, height: replayTerrain.rows } }).toEqual({
      origin: found.window.origin,
      terrain: { width: found.window.terrain.width, height: found.window.terrain.height },
    });
    const ready = candidateFor(readyWorld, found.phase, found.window, found.wayknots);
    if (ready === null) throw new Error("The exact cold replay no longer admits the observed native source-mat entry");
    close(prefixRuntime);
    const mat = ready.placement.wayknot!;
    const starter = (readyEnvelope.player as PlayerState).wayknots.wayknots.find(({ id }) => id === mat.id)!;
    expect(starter).toMatchObject({ kind: "reed-mat", region: null, tileIndex: null });
    expect(mat).toMatchObject({ id: starter.id, condition: starter.condition - WAYKNOT_PLACEMENT_CONDITION_COST,
      readyTick: ready.world.meta.completedTick + WAYKNOT_SETTING_TICKS, serviceWearRemainder: starter.serviceWearRemainder });
    expect(ready.service.appliedBenefit).toBe(WAYKNOT_SETTING_STRENGTH);
    expect(ready.service.conditionSpent).toBeGreaterThan(0);
    expect(ready.aided).toBeGreaterThan(ready.bare);
    expect(ready.aided).toBeLessThanOrEqual(cargoAllowance);
    // Remove the cause only: the identical actual fine prefix with its mat
    // still carried executes the smaller same-budget bare displacement.
    const bareRepository = new MemoryRepository(readyRecord);
    const bareRuntime = await open(bareRepository);
    advance(bareRuntime, 1);
    await bareRuntime.save();
    const bareEnvelope = decode(bareRepository.snapshot());
    const bareWorld = deserializeWorld(bareEnvelope.world);
    expect(actor(bareWorld, fixture.actorId).activity?.poses.at(-1)).toEqual(ready.barePose);
    expect((bareEnvelope.player as PlayerState).wayknots).toEqual((readyEnvelope.player as PlayerState).wayknots);
    close(bareRuntime);

    const staged = structuredClone(readyEnvelope);
    (staged.player as PlayerState).wayknots = ready.placement.state;
    expect(staged.world).toBe(readyEnvelope.world);
    expect(staged.perceptionCarry).toEqual(readyEnvelope.perceptionCarry);
    const stagedRecord = recordWith(readyRecord, staged);
    const aidedRepository = new MemoryRepository(stagedRecord);
    const aidedRuntime = await open(aidedRepository);
    await aidedRuntime.save();
    expect(authoritativeRoots(decode(aidedRepository.snapshot()))).toEqual(authoritativeRoots(staged));
    advance(aidedRuntime, 1);
    await aidedRuntime.save();
    const serviced = decode(aidedRepository.snapshot());
    const servicedWorld = deserializeWorld(serviced.world);
    const servicedPhase = found.phase === 10 ? 0 : found.phase;
    expect(servicedWorld.meta.completedTick).toBe(ready.world.meta.completedTick + (found.phase === 10 ? 1 : 0));
    expect(serviced.perceptionCarry).toMatchObject({ version: 14, playerStepsSinceWorldTick: servicedPhase });
    expect(actor(servicedWorld, fixture.actorId).activity?.poses.at(-1)).toEqual(ready.expectedPose);
    expect((serviced.player as PlayerState).wayknots).toEqual(ready.service.state);
    expect(servicedWorld.contracts.find(({ id }) => id === fixture.contractId))
      .toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity, departedTick });
    // Native production and other lawful stock work continue during the ebb
    // wait. Aid service must conserve the same stock/ledger as equal-work bare
    // play, not freeze those owners at their initial pickup quantities.
    expect(servicedWorld.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource])
      .toBe(bareWorld.settlements.find(({ id }) => id === fixture.originId)!.inventory[fixture.resource]);
    expect(servicedWorld.ledger).toEqual(bareWorld.ledger);
    expect(departedEvents(servicedWorld, fixture.contractId)).toHaveLength(1);
    assertWorldInvariants(servicedWorld);
    // Finish the actual service interval before taking the next interval's
    // phase4/9 cuts. A useful native entry need not occur at phase10.
    if (servicedPhase !== 0) advance(aidedRuntime, 10 - servicedPhase);
    const coldPrefixes: { record: SaveRecord; envelope: Envelope }[] = [];
    for (const count of [4, 5]) {
      advance(aidedRuntime, count);
      await aidedRuntime.save();
      const record = aidedRepository.snapshot();
      const envelope = decode(record);
      expect(envelope.perceptionCarry).toMatchObject({ version: 14, playerStepsSinceWorldTick: count === 4 ? 4 : 9 });
      expect((envelope.player as PlayerState).wayknots).toEqual(ready.service.state);
      coldPrefixes.push({ record, envelope });
    }
    advance(aidedRuntime, 1);
    await aidedRuntime.save();
    const following = decode(aidedRepository.snapshot());
    close(aidedRuntime);
    for (const prefix of coldPrefixes) {
      soundscapePlay.mockClear();
      const coldRepository = new MemoryRepository(prefix.record);
      const cold = await open(coldRepository);
      await cold.save();
      expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(prefix.envelope));
      expect(soundscapePlay).not.toHaveBeenCalled();
      advance(cold, 10 - prefix.envelope.perceptionCarry.playerStepsSinceWorldTick);
      await cold.save();
      expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(following));
      close(cold);
    }

    const failedRepository = new MemoryRepository(stagedRecord);
    const failed = await open(failedRepository);
    let attempted: unknown = null;
    const motion = vi.spyOn(residentActivityExecution, "advanceResidentRestActivities").mockImplementation((...args) => {
      const result = originalAdvance(...args);
      if (result !== null && args[1] === found.phase) attempted = {
        pose: structuredClone(actor(args[0], fixture.actorId).activity!.poses.at(-1)), wayknots: structuredClone(result.wayknots),
      };
      return result;
    });
    const originalPublication = regionalWorldView.replaceRegionalWorldViewResidents;
    let publishedPose: unknown = null;
    // Runtime assigns the staged aid/body pair before this external owner.
    // Complete its real immutable replacement, then fail later publication.
    // The separately maintained Voice late-closure witness covers phase10.
    const publication = vi.spyOn(regionalWorldView, "replaceRegionalWorldViewResidents").mockImplementationOnce((...args) => {
      const result = originalPublication(...args);
      const published = result.residents.find(({ identity }) => identity.stableId === fixture.actorId);
      publishedPose = structuredClone(published?.activity?.poses.at(-1));
      throw new Error("controlled post-resident publication failure");
    });
    soundscapePlay.mockClear();
    advance(failed, 1, false);
    expect(attempted).toEqual({ pose: ready.expectedPose, wayknots: ready.service.state });
    expect(publishedPose).toEqual(ready.expectedPose);
    expect(publication).toHaveBeenCalledTimes(1);
    expect(failed.getUIView().announcement?.message).toContain("INTEGRITY HALT");
    expect(soundscapePlay.mock.calls).toEqual([["warning", 1]]);
    await failed.save();
    const rollbackRecord = failedRepository.snapshot();
    expect(authoritativeRoots(decode(rollbackRecord))).toEqual(authoritativeRoots(staged));
    motion.mockRestore();
    publication.mockRestore();
    close(failed);
    soundscapePlay.mockClear();
    const retryRepository = new MemoryRepository(rollbackRecord);
    const retry = await open(retryRepository);
    expect(soundscapePlay).not.toHaveBeenCalled();
    advance(retry, 1);
    await retry.save();
    expect(authoritativeRoots(decode(retryRepository.snapshot()))).toEqual(authoritativeRoots(serviced));
  }, 180_000);
});

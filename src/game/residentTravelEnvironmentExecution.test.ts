import { describe, expect, it } from "vitest";

import { createActorObservation, createActorPerceptionState, stepActorPerception, type ActorObservation } from "../sim/actorPerception";
import { assertWorldInvariants, createWorld, createWorldView, deserializeWorld, serializeWorld, stepWorld } from "../sim/public";
import {
  replaceResidentActivity,
  RESIDENT_TRAVEL_ACTIVITY_OWNER_ID,
  RESIDENT_TRAVEL_ACTIVITY_VERSION,
  RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_OWNER_ID,
  RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION,
  type ResidentPhysicalTravelTask,
} from "../sim/residentActivity";
import { canonicalResidentActivityForWorld, residentRestTargetHasDrySupport } from "../sim/residentActivityWorld";
import { residentRestSurfaceObservationId } from "../sim/residentSurfaceKnowledge";
import { advanceResidentMacroTravel, consumeResidentTravelAdvance, prepareResidentTravelAdvance, residentTravelStepUnits, revokeResidentTravelAdvance } from "../sim/residentTravelAdvance";
import { residentTravelLocation, residentTravelSegment, residentTravelSegmentPose } from "../sim/residentTravelRoute";
import { MAX_TIDE_LEVEL, tideAtTick } from "../sim/terrain";
import { FIXED_POINT, LEGACY_WORLD_HEIGHT, LEGACY_WORLD_WIDTH, WORLD_WIDTH, type ResourceKind, type TerrainKind, type WorldState } from "../sim/types";
import { stableStringify } from "../sim/util";
import { collectExistingHumanObservations, humanObservationCollectionRejected } from "./humanPerception";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import { adoptResidentActivities, advanceResidentRestActivities, prepareResidentRestActivities } from "./residentActivityExecution";
import { createWayknotState, normalizeWayknotState, placeWayknot, reclaimWayknot, type WayknotState } from "./wayknots";

const BASE = createWorld("resident informed route execution foundation", "standard");
const WINDOW = { origin: { x: -10, y: -10 }, terrain: { width: 120, height: 120 } };

/**
 * Synthetic adapter foundations: the initial transit/body and sensory inputs
 * are arranged, not native acceptance, sight or autonomous gameplay evidence.
 * Generated route geometry/identities and conserved origin-stock cargo are kept;
 * later motion, re-anchoring and observation admission use the actual owners.
 */
function fixture(
  version: typeof RESIDENT_TRAVEL_ACTIVITY_VERSION | typeof RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION = RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION,
  { resource = "food", quantity = 1 }: Readonly<{ resource?: ResourceKind; quantity?: number }> = {},
  sourceBase: WorldState = BASE,
) {
  const world = structuredClone(sourceBase);
  const tick = world.meta.completedTick;
  world.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: tick + 1_000 };
  for (const tile of world.terrain.tiles) Object.assign(tile, { terrain: "meadow", elevation: MAX_TIDE_LEVEL + 1, roughness: 0, baseTravelCost: 1_000 });
  for (const resident of world.residents) {
    resident.needs = { food: 100_000, rest: 100_000, belonging: 900_000 };
    resident.condition.exhaustion = 100_000;
  }
  for (const contract of world.contracts) {
    contract.playerExclusiveUntilTick = tick + 1_000;
    contract.dueTick = tick + 2_000;
  }
  expect(adoptResidentActivities(world)).toBe(true);
  const selected = [...world.residents].sort((left, right) => left.identity.stableId.localeCompare(right.identity.stableId))
    .find((resident) => {
      if (resident.location.kind !== "settlement") return false;
      const settlementId = resident.location.settlementId;
      return world.settlements.find(({ id }) => id === settlementId)!.inventory[resource] >= quantity;
    });
  if (selected === undefined) throw new Error("Synthetic transit requires enough existing origin stock");
  if (selected.location.kind !== "settlement") throw new Error("Expected generated settlement resident");
  const originId = selected.location.settlementId;
  const route = world.routes.find((candidate) => candidate.fromSettlementId === originId || candidate.toSettlementId === originId)!;
  route.traceStrength = FIXED_POINT;
  const destinationId = route.fromSettlementId === originId ? route.toSettlementId : route.fromSettlementId;
  const contract = { ...world.contracts[0]!, originSettlementId: originId, destinationSettlementId: destinationId,
    requesterResidentId: world.settlements.find(({ id }) => id === destinationId)!.residentIds[0]!,
    status: "in-transit" as const, carrierKind: "resident" as const, assignedResidentId: selected.id,
    resource, quantity, cargoQuantity: quantity, createdTick: tick - 3,
    playerExclusiveUntilTick: tick - 3, acceptedTick: tick - 2, departedTick: tick - 1,
    arrivalTick: tick + 100, dueTick: tick + 600, completedTick: null, routeId: route.id,
    porterRouteIds: [route.id], porterSettlementIds: [originId, destinationId] };
  world.contracts[0] = contract;
  const stock = world.settlements.find(({ id }) => id === originId)!.inventory;
  expect(stock[resource]).toBeGreaterThanOrEqual(quantity);
  // The same finite origin stock becomes this aggregate contract's cargo.
  // Resource/quantity are chosen before staging; no later cargo reassignment.
  stock[resource] -= quantity;
  const task: ResidentPhysicalTravelTask = { kind: "contract-travel", contractId: contract.id, mode: "physical",
    legIndex: 0, waypointIndex: 1, selectedAtTick: contract.departedTick, lastProgressAtTick: tick,
    nextReassessmentAtTick: tick, phase: "approaching", waitReason: null };
  const segment = residentTravelSegment(world, contract, task)!;
  const pose = residentTravelSegmentPose(segment, 0);
  world.residents = world.residents.map((resident) => replaceResidentActivity(resident, {
    ...resident.activity!, version, ownerId: version === 8 ? RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_OWNER_ID : RESIDENT_TRAVEL_ACTIVITY_OWNER_ID,
    inspectionTask: null, pickupTask: null, travelTask: null,
  }));
  const actorId = selected.identity.stableId;
  const get = () => world.residents.find(({ identity }) => identity.stableId === actorId)!;
  get().activeContractId = contract.id;
  get().location = residentTravelLocation(segment, task, pose.position)!;
  get().activity = { ...get().activity!, poses: [pose], travelTask: task };
  expect(world.residents.every((resident) => canonicalResidentActivityForWorld(world, resident) !== null)).toBe(true);
  assertWorldInvariants(world);
  const target = segment.end;
  const setPhysicalSupport = (dry: boolean) => Object.assign(world.terrain.tiles[
    Math.floor(target.localY / 1_000) * world.terrain.width + Math.floor(target.localX / 1_000)]!,
  { terrain: dry ? "meadow" : "deep-water", elevation: dry ? MAX_TIDE_LEVEL + 1 : world.tide.level - 10_000 });
  const see = (surface: "wet" | "dry", kind: "valid" | "foreign" | "wrong-target" = "valid", disturbed = false) => {
    const atTick = world.meta.completedTick;
    const areaTarget = kind === "wrong-target" ? segment.start : target;
    const observation = createActorObservation({ id: residentRestSurfaceObservationId(kind === "foreign" ? "foreign-observer" : actorId, areaTarget),
      observerId: actorId, observedAtTick: atTick, channel: "vision", identification: "classified", subjectId: null,
      perceivedClass: surface === "wet" ? "water-covered-ground" : "dry-ground",
      area: { center: areaTarget, radiusUnits: 0 }, confidence: 800_000, salience: 300_000, interrupt: "information" });
    if (!observation) throw new Error("Synthetic qualitative observation must be canonical");
    const observations: ActorObservation[] = [observation];
    if (disturbed) {
      const warning = createActorObservation({ id: `travel-disturbance-${atTick}`, observerId: actorId, observedAtTick: atTick,
        channel: "hearing", perceivedClass: "movement-sound", identification: "anonymous", subjectId: null,
        area: { center: segment.start, radiusUnits: 2_000 }, confidence: 950_000, salience: 980_000, interrupt: "strong" });
      if (!warning) throw new Error("Synthetic warning must be canonical");
      observations.push(warning);
    }
    const perception = stepActorPerception(createActorPerceptionState(actorId, atTick - 1), { tick: atTick, observations });
    if (!perception) throw new Error("Synthetic observations were not admitted");
    get().perception = perception;
  };
  const nextTick = () => {
    for (let phase = 1; phase <= 10; phase += 1) expect(advanceResidentRestActivities(world, phase, WINDOW)).not.toBeNull();
    const admission = prepareResidentTravelAdvance(world, WINDOW);
    expect(admission).not.toBeNull();
    stepWorld(world, [], undefined, undefined, admission!);
  };
  const hold = () => {
    see("wet");
    expect(prepareResidentRestActivities(world)).toBe(true);
    expect(get().activity?.travelTask).toMatchObject({ phase: "waiting", waitReason: "observed-water" });
  };
  return { world, get, actorId, target, route, contract, segment, setPhysicalSupport, see, nextTick, hold };
}

function finishInterval(world: WorldState, completedPhase: number): void {
  for (let phase = completedPhase + 1; phase <= 10; phase += 1) {
    expect(advanceResidentRestActivities(world, phase, WINDOW)).not.toBeNull();
  }
  const admission = prepareResidentTravelAdvance(world, WINDOW);
  expect(admission).not.toBeNull();
  try {
    stepWorld(world, [], undefined, undefined, admission!);
  } finally {
    revokeResidentTravelAdvance(admission!);
  }
  assertWorldInvariants(world);
}

/** Explicit pre-change v8 history, not movement produced by today's allowance. */
function stageRetainedPrefix(current: ReturnType<typeof fixture>, distances: readonly number[]): void {
  let offset = 0;
  const poses = [current.get().activity!.poses[0]!];
  for (const distance of distances) {
    offset += distance;
    poses.push(residentTravelSegmentPose(current.segment, offset));
  }
  const selectedTask = current.get().activity!.travelTask!;
  if (selectedTask.mode !== "physical") throw new Error("Retained prefix requires physical travel");
  current.world.residents = current.world.residents.map((resident) => {
    const activity = resident.activity!;
    const selected = resident.identity.stableId === current.actorId;
    const location = selected ? residentTravelLocation(current.segment, selectedTask, poses.at(-1)!.position) : resident.location;
    if (location === null) throw new Error("Retained prefix left its real ordered edge");
    return replaceResidentActivity({ ...resident, location }, {
      ...activity,
      poses: selected ? poses : Array.from({ length: poses.length }, () => activity.poses[0]!),
    });
  });
  assertWorldInvariants(current.world);
}

describe("informed next-segment water hold execution foundations", () => {
  it("admits pre-world wet sight through the real closing frame before freshly seeing dry support", () => {
    const current = fixture();
    const tick = current.world.meta.completedTick;
    const targetTile = current.world.terrain.tiles[
      Math.floor(current.target.localY / 1_000) * current.world.terrain.width + Math.floor(current.target.localX / 1_000)]!;
    // Controlled elevation, not a native ford: actual tide makes this meadow
    // wet at420 and dry at421. The fixture arranged initial transit/task;
    // this case assigns no water belief, held result or successful arrival.
    const fallingLevel = tideAtTick(tick + 1).level;
    expect(fallingLevel).toBeLessThan(current.world.tide.level);
    targetTile.elevation = fallingLevel;
    expect(residentRestTargetHasDrySupport(current.world, current.target)).toBe(false);
    const originalPose = current.get().activity!.poses[0]!;
    const commitObservedInterval = (surface: "water-covered-ground" | "dry-ground") => {
      for (let phase = 1; phase <= 10; phase += 1) expect(advanceResidentRestActivities(current.world, phase, WINDOW)).not.toBeNull();
      const window = createRegionalTerrainWindow(current.world.meta.rootSeed,
        createTerrainRegionStreamingState({ rootSeed: current.world.meta.rootSeed }), WINDOW.origin);
      const worldView = createRegionalWorldView(createWorldView(current.world), window,
        projectRegionalCartographyWindow(createRegionalCartography(current.world.meta.rootSeed), window));
      const nextTick = current.world.meta.completedTick + 1;
      const batches = collectExistingHumanObservations({ world: worldView, window, targetTick: nextTick, playerSamples: [] });
      expect(humanObservationCollectionRejected(batches)).toBe(false);
      const batch = batches.find(({ observerId }) => observerId === current.actorId);
      expect(batch?.observations).toContainEqual(expect.objectContaining({
        id: residentRestSurfaceObservationId(current.actorId, current.target), observedAtTick: nextTick,
        perceivedClass: surface, interrupt: "information", area: { center: current.target, radiusUnits: 0 },
      }));
      const byResident = new Map(batches.map((entry) => [entry.residentId, entry.observations]));
      const frame = { tick: nextTick, residents: current.world.residents.map((resident) => ({
        residentId: resident.id, actorId: resident.identity.stableId, observations: byResident.get(resident.id) ?? [],
      })) };
      const admission = prepareResidentTravelAdvance(current.world, WINDOW);
      expect(admission).not.toBeNull();
      stepWorld(current.world, [], frame, undefined, admission!);
      expect(prepareResidentRestActivities(current.world)).toBe(true);
    };
    commitObservedInterval("water-covered-ground");
    expect(current.world.meta.completedTick).toBe(tick + 1);
    expect(residentRestTargetHasDrySupport(current.world, current.target)).toBe(true);
    expect(current.get().activity?.travelTask).toMatchObject({ phase: "waiting", waitReason: "observed-water" });
    expect(current.get().activity?.poses).toEqual([originalPose]);
    expect(current.get().perception).toMatchObject({ suspicionPressure: 0, search: null });
    commitObservedInterval("dry-ground");
    expect(current.world.meta.completedTick).toBe(tick + 2);
    expect(current.get().activity?.travelTask).toMatchObject({ phase: "approaching", waitReason: null });
    expect(current.get().activity?.poses).toEqual([originalPose]);
    expect(advanceResidentRestActivities(current.world, 1, WINDOW)?.movedActorIds).toContain(current.actorId);
    // Cargo retains its104-unit ceiling; actual meadow contact gives96.
    expect(current.get().activity!.poses.at(-1)!.position).toEqual(residentTravelSegmentPose(current.segment, 96).position);
    expect(current.contract).toMatchObject({ status: "in-transit", cargoQuantity: 1, assignedResidentId: current.get().id });
  });

  it.each(["stale", "evicted", "foreign", "wrong-target"] as const)("retains an observed hold with %s knowledge even when physical support is dry", (kind) => {
    const current = fixture();
    current.hold();
    const pose = current.get().activity!.poses[0]!;
    const initialTask = current.get().activity!.travelTask!;
    if (initialTask.mode !== "physical") throw new Error("Expected physical travel task");
    const selectedAtTick = initialTask.selectedAtTick;
    const custody = stableStringify(current.contract);
    current.nextTick();
    if (kind === "evicted") current.get().perception = createActorPerceptionState(current.actorId, current.world.meta.completedTick);
    if (kind === "foreign" || kind === "wrong-target") current.see("dry", kind);
    expect(residentRestTargetHasDrySupport(current.world, current.target)).toBe(true);
    expect(prepareResidentRestActivities(current.world)).toBe(true);
    expect(current.get().activity?.travelTask).toMatchObject({ phase: "waiting", waitReason: "observed-water",
      selectedAtTick, nextReassessmentAtTick: current.world.meta.completedTick + 1 });
    expect(current.get().activity?.poses).toEqual([pose]);
    const before = stableStringify(current.world);
    const cold = structuredClone(current.world);
    expect(cold.residents.every((resident) => canonicalResidentActivityForWorld(cold, resident) !== null)).toBe(true);
    expect(prepareResidentRestActivities(cold)).toBe(true);
    expect(stableStringify(cold)).toBe(before);
    expect(stableStringify(current.contract)).toBe(custody);
  });

  it.each([false, true])("requires independent dry support=%s before fresh-dry sight can resume actual fine motion", (drySupport) => {
    const current = fixture();
    current.hold();
    current.nextTick();
    current.setPhysicalSupport(drySupport);
    current.see("dry");
    expect(prepareResidentRestActivities(current.world)).toBe(true);
    expect(current.get().activity?.travelTask).toMatchObject(drySupport
      ? { phase: "approaching", waitReason: null } : { phase: "waiting", waitReason: "observed-water" });
    const pose = current.get().activity!.poses[0]!;
    const step = advanceResidentRestActivities(current.world, 1, WINDOW);
    expect(step).not.toBeNull();
    expect(step?.movedActorIds.includes(current.actorId)).toBe(drySupport);
    expect(current.get().activity!.poses.at(-1)!.position).toEqual(drySupport
      ? residentTravelSegmentPose(current.segment, 96).position : pose.position);
    expect(current.contract).toMatchObject({ status: "in-transit", cargoQuantity: 1, assignedResidentId: current.get().id });
  });

  it.each(["route", "weather", "disturbance"] as const)("does not let temporary %s priority erase an informed hold", (blocker) => {
    const current = fixture();
    current.hold();
    current.nextTick();
    current.see("dry", "valid", blocker === "disturbance");
    if (blocker === "route") current.route.traceStrength = 0;
    if (blocker === "weather") {
      current.world.weather = { ...current.world.weather, kind: "storm", intensity: FIXED_POINT };
      current.get().condition.sheltering = true;
    }
    const pose = current.get().activity!.poses[0]!;
    expect(prepareResidentRestActivities(current.world)).toBe(true);
    expect(current.get().activity?.travelTask).toMatchObject({ phase: "waiting", waitReason: "observed-water",
      nextReassessmentAtTick: current.world.meta.completedTick + 1 });
    expect(current.get().activity?.poses).toEqual([pose]);
    // The same route failure must not replace the knowledge gate in macro
    // continuation either; this pure call creates no offscreen perception.
    current.route.traceStrength = 0;
    const task = current.get().activity!.travelTask!;
    if (task.mode !== "physical") throw new Error("Expected physical hold");
    const before = stableStringify(current.world);
    const macro = advanceResidentMacroTravel(current.world, current.contract, task, pose, null, 1_050, current.world.meta.completedTick + 1);
    expect(macro).toMatchObject({ pose, task, advancedUnits: 0 });
    expect(stableStringify(current.world)).toBe(before);
  });

  it("does not clear fresh safe knowledge before the task's due reassessment", () => {
    const current = fixture();
    current.hold();
    current.see("dry");
    const before = stableStringify(current.get().activity);
    expect(prepareResidentRestActivities(current.world)).toBe(true);
    expect(stableStringify(current.get().activity)).toBe(before);
  });

  it("preserves uninformed v7 physical retry instead of inventing an observed hold", () => {
    const current = fixture(RESIDENT_TRAVEL_ACTIVITY_VERSION);
    current.see("wet");
    expect(prepareResidentRestActivities(current.world)).toBe(true);
    expect(current.get().activity?.travelTask).toMatchObject({ phase: "approaching", waitReason: null });
    current.setPhysicalSupport(false);
    const blocked = advanceResidentRestActivities(current.world, 1, WINDOW);
    expect(blocked).not.toBeNull();
    expect(blocked?.movedActorIds.includes(current.actorId)).toBe(false);
    expect(current.get().activity?.travelTask).toMatchObject({ phase: "waiting", waitReason: "no-traversable-route" });
    for (let phase = 2; phase <= 10; phase += 1) expect(advanceResidentRestActivities(current.world, phase, WINDOW)).not.toBeNull();
    const admission = prepareResidentTravelAdvance(current.world, WINDOW);
    expect(admission).not.toBeNull();
    stepWorld(current.world, [], undefined, undefined, admission!);
    current.setPhysicalSupport(true);
    current.get().perception = createActorPerceptionState(current.actorId, current.world.meta.completedTick);
    expect(prepareResidentRestActivities(current.world)).toBe(true);
    expect(current.get().activity?.travelTask).toMatchObject({ phase: "approaching", waitReason: null });
    expect(advanceResidentRestActivities(current.world, 1, WINDOW)?.movedActorIds).toContain(current.actorId);
    expect(current.get().activity?.version).toBe(RESIDENT_TRAVEL_ACTIVITY_VERSION);
  });
});

describe("conserved load-aware fine travel execution foundations", () => {
  it.each([
    ["food", 1, 104, 96], ["food", 14, 91, 84], ["parts", 14, 77, 71],
  ] as const)("moves actual %s quantity %s cargo beneath its %s-unit quota without changing custody", (resource, quantity, quota, stepUnits) => {
    const current = fixture(RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION, { resource, quantity });
    expect(residentTravelStepUnits(current.get().activity!, current.contract)).toBe(quota);
    const { residents: _residents, ...originalRoots } = current.world;
    const rootsBefore = stableStringify(originalRoots);
    const step = advanceResidentRestActivities(current.world, 1, WINDOW);
    expect(step).not.toBeNull();
    expect(step?.movedActorIds).toContain(current.actorId);
    expect(step?.maximumSurfaceCells).toBeLessThanOrEqual(2);
    expect(current.get().activity!.poses.at(-1))
      .toEqual(residentTravelSegmentPose(current.segment, stepUnits));
    expect(current.get().activity?.travelTask).toMatchObject({ phase: "approaching", waitReason: null });
    expect(current.contract).toMatchObject({ resource, quantity, cargoQuantity: quantity, status: "in-transit" });
    const { residents: _nextResidents, ...nextRoots } = current.world;
    expect(stableStringify(nextRoots)).toBe(rootsBefore);
    assertWorldInvariants(current.world);
  });

  it.each([
    ["tidal-flat", 55], ["marsh", 62], ["meadow", 84], ["ridge", 51],
  ] as const)("lets actual dry %s contact change the same conserved load's step to%s", (terrain, stepUnits) => {
    const current = fixture(RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION, { resource: "food", quantity: 14 });
    const source = current.segment.start;
    const sourceTile = current.world.terrain.tiles[Math.floor(source.localY / 1_000)
      * current.world.terrain.width + Math.floor(source.localX / 1_000)]!;
    // Synthetic physical contrast, not an acquired capability or belief.
    // The target stays meadow: its better ground cannot help before contact.
    sourceTile.terrain = terrain;
    expect(residentTravelStepUnits(current.get().activity!, current.contract)).toBe(91);
    const { residents: _residents, ...originalRoots } = current.world;
    const rootsBefore = stableStringify(originalRoots);
    expect(advanceResidentRestActivities(current.world, 1, WINDOW)?.movedActorIds).toContain(current.actorId);
    expect(current.get().activity!.poses.at(-1)).toEqual(residentTravelSegmentPose(current.segment, stepUnits));
    expect(current.get().activity?.travelTask).toMatchObject({ phase: "approaching", waitReason: null });
    const { residents: _nextResidents, ...nextRoots } = current.world;
    expect(stableStringify(nextRoots)).toBe(rootsBefore);
    expect(current.contract).toMatchObject({ resource: "food", quantity: 14, cargoQuantity: 14, status: "in-transit" });
    assertWorldInvariants(current.world);
  });

  it("caps a dry-contact step by the remaining quota without scaling that remainder twice", () => {
    const current = fixture(RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION, { resource: "food", quantity: 14 });
    stageRetainedPrefix(current, [...Array.from({ length: 8 }, () => 105), 30]);
    const accepted = structuredClone(current.get().activity!.poses);
    const contact = accepted.at(-1)!.position;
    current.world.terrain.tiles[Math.floor(contact.localY / 1_000)
      * current.world.terrain.width + Math.floor(contact.localX / 1_000)]!.terrain = "ridge";
    // Historical870 leaves40. Today's ridge contact permits51, not a second
    // 57% charge on the40-unit remainder. The exact accepted prefix survives.
    expect(advanceResidentRestActivities(current.world, 10, WINDOW)?.movedActorIds).toContain(current.actorId);
    expect(current.get().activity!.poses.slice(0, accepted.length)).toEqual(accepted);
    expect(current.get().activity!.poses.at(-1)).toEqual(residentTravelSegmentPose(current.segment, 910));
    assertWorldInvariants(current.world);
  });

  it.each([
    ["below", 0, 840, 910], ["equal", 70, 910, 910], ["above", 105, 945, 945],
  ] as const)("preserves accepted 105-unit v8 work %s the new 910-unit quota", (_relation, ninthDistance, acceptedUnits, finalUnits) => {
    const current = fixture(RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION, { resource: "food", quantity: 14 });
    // Arrange a supported phase9 historical prefix with the former 105-unit
    // ceiling. Today's consumer must retain that already-paid work, not claim
    // it would newly generate the same prefix under the 91-unit allowance.
    stageRetainedPrefix(current, [...Array.from({ length: 8 }, () => 105), ninthDistance]);
    const accepted = structuredClone(current.get().activity!.poses);
    const taskBefore = structuredClone(current.get().activity!.travelTask);
    expect(accepted).toHaveLength(10);
    expect(accepted.at(-1)!.position).toEqual(residentTravelSegmentPose(current.segment, acceptedUnits).position);
    const cold = deserializeWorld(serializeWorld(current.world));
    expect(serializeWorld(cold)).toBe(serializeWorld(current.world));
    const step = advanceResidentRestActivities(current.world, 10, WINDOW);
    expect(step).not.toBeNull();
    expect(step?.movedActorIds.includes(current.actorId)).toBe(finalUnits > acceptedUnits);
    expect(step?.waitingActorIds).not.toContain(current.actorId);
    expect(current.get().activity!.poses.slice(0, accepted.length)).toEqual(accepted);
    expect(current.get().activity!.poses.at(-1)!.position).toEqual(residentTravelSegmentPose(current.segment, finalUnits).position);
    expect(current.get().activity?.travelTask).toEqual(taskBefore);
    if (finalUnits === acceptedUnits) expect(current.get().activity!.poses.at(-1)).toEqual(accepted.at(-1));
    // Fine work exhausted or exceeded the new allowance: macro must not grant
    // more distance, and zero work is not a no-traversable-route outcome.
    const admission = prepareResidentTravelAdvance(current.world, WINDOW);
    expect(admission).not.toBeNull();
    const prepared = consumeResidentTravelAdvance(current.world, admission!);
    expect(prepared.remainingUnitsByActor.get(current.actorId)).toBe(0);
    const completedPose = structuredClone(current.get().activity!.poses.at(-1));
    finishInterval(current.world, 10);
    finishInterval(cold, 9);
    expect(serializeWorld(cold)).toBe(serializeWorld(current.world));
    expect(current.get().activity?.poses).toEqual([completedPose]);
    expect(current.get().activity?.travelTask).toEqual(taskBefore);
    expect(current.contract).toMatchObject({ resource: "food", quantity: 14, cargoQuantity: 14, status: "in-transit" });
  });

  it("retains moving frozen-v7 partial work and 105-unit allowance through genuine closure", () => {
    const current = fixture(RESIDENT_TRAVEL_ACTIVITY_VERSION, { resource: "parts", quantity: 14 });
    for (let phase = 1; phase <= 4; phase += 1) {
      expect(advanceResidentRestActivities(current.world, phase, WINDOW)?.movedActorIds).toContain(current.actorId);
    }
    expect(current.get().activity!.poses.at(-1)!.position).toEqual(residentTravelSegmentPose(current.segment, 420).position);
    const phase4Text = serializeWorld(current.world);
    const cold = deserializeWorld(phase4Text);
    expect(serializeWorld(cold)).toBe(phase4Text);
    for (const world of [current.world, cold]) {
      for (let phase = 5; phase <= 9; phase += 1) expect(advanceResidentRestActivities(world, phase, WINDOW)).not.toBeNull();
      const retained = world.residents.find(({ identity }) => identity.stableId === current.actorId)!;
      expect(retained.activity?.version).toBe(RESIDENT_TRAVEL_ACTIVITY_VERSION);
      expect(retained.activity!.poses.at(-1)!.position).toEqual(residentTravelSegmentPose(current.segment, 945).position);
      finishInterval(world, 9);
      expect(world.residents.every(({ activity }) => activity?.version === RESIDENT_TRAVEL_ACTIVITY_VERSION)).toBe(true);
    }
    expect(serializeWorld(cold)).toBe(serializeWorld(current.world));
    expect(current.world.meta.completedTick).toBe(BASE.meta.completedTick + 1);
    expect(current.get().activity?.poses).toHaveLength(1);
    expect(current.contract).toMatchObject({ resource: "parts", quantity: 14, cargoQuantity: 14, status: "in-transit" });
    // Authentic runtime v7→v8 adoption needs its actual settlement roots and is
    // outside this adapter fixture; no metadata/store authority is invented.
  });

  it("continues born-v8 phase4 and phase9 serialized/clone cuts with equal authoritative work", () => {
    const current = fixture(RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION, { resource: "food", quantity: 14 });
    for (let phase = 1; phase <= 4; phase += 1) expect(advanceResidentRestActivities(current.world, phase, WINDOW)).not.toBeNull();
    expect(current.get().activity!.poses.at(-1)!.position).toEqual(residentTravelSegmentPose(current.segment, 336).position);
    const phase4 = serializeWorld(current.world);
    const phase4Cuts = [deserializeWorld(phase4), structuredClone(current.world)];
    for (const world of [current.world, ...phase4Cuts]) {
      for (let phase = 5; phase <= 9; phase += 1) expect(advanceResidentRestActivities(world, phase, WINDOW)).not.toBeNull();
    }
    const phase9 = serializeWorld(current.world);
    expect(current.get().activity!.poses.at(-1)!.position).toEqual(residentTravelSegmentPose(current.segment, 756).position);
    for (const world of phase4Cuts) expect(serializeWorld(world)).toBe(phase9);
    const phase9Cuts = [deserializeWorld(phase9), structuredClone(current.world)];
    for (const world of [current.world, ...phase4Cuts, ...phase9Cuts]) finishInterval(world, 9);
    const terminal = serializeWorld(current.world);
    for (const world of [...phase4Cuts, ...phase9Cuts]) expect(serializeWorld(world)).toBe(terminal);
    expect(current.get().activity?.poses).toEqual([residentTravelSegmentPose(current.segment, 840)]);
    expect(current.get().activity?.travelTask).toMatchObject({ phase: "approaching", waitReason: null });
    expect(current.contract).toMatchObject({ resource: "food", quantity: 14, cargoQuantity: 14, status: "in-transit" });
  });
});

/**
 * Controlled source-contact foundation, not native tool acquisition or a
 * player-authored route. The existing conserved cargo and generated edge stay
 * bound; the phase-zero body anchor represents previously paid travel.
 */
function matFixture(
  version: typeof RESIDENT_TRAVEL_ACTIVITY_VERSION | typeof RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION = RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION,
  offset = 450,
  terrain: TerrainKind = "marsh",
  sourceBase: WorldState = BASE,
) {
  const current = fixture(version, { resource: "food", quantity: 14 }, sourceBase);
  const activity = current.get().activity!;
  const task = activity.travelTask!;
  if (task.mode !== "physical") throw new Error("Mat foundation requires a physical traveler");
  const pose = residentTravelSegmentPose(current.segment, offset);
  const location = residentTravelLocation(current.segment, task, pose.position);
  if (location === null) throw new Error("Controlled anchor left its generated edge");
  current.world.residents = current.world.residents.map((resident) => resident.identity.stableId === current.actorId
    ? replaceResidentActivity({ ...resident, location }, { ...activity, poses: [pose] }) : resident);
  const sourceX = Math.floor(pose.position.localX / 1_000);
  const sourceY = Math.floor(pose.position.localY / 1_000);
  const sourceTile = current.world.terrain.tiles[sourceY * current.world.terrain.width + sourceX]!;
  sourceTile.terrain = terrain;
  // Wayknot addresses use the persistent regional grid even in supported
  // worlds whose simulation terrain has a different storage stride.
  const sourceContext = { tileIndex: sourceY * WORLD_WIDTH + sourceX, terrain, waterDepth: 0, windExposed: false };
  assertWorldInvariants(current.world);
  return { ...current, sourceTile, sourceContext, offset };
}

function placeMat(current: ReturnType<typeof matFixture>, setting = false, target = false) {
  const position = target ? current.target : current.get().activity!.poses.at(-1)!.position;
  const x = Math.floor(position.localX / 1_000);
  const y = Math.floor(position.localY / 1_000);
  const tile = current.world.terrain.tiles[y * current.world.terrain.width + x]!;
  const placement = placeWayknot(createWayknotState(), "reed-mat", {
    tileIndex: y * WORLD_WIDTH + x, terrain: tile.terrain, waterDepth: 0, windExposed: false,
  }, current.world.meta.completedTick - (setting ? 0 : 3), position.region);
  expect(placement.ok).toBe(true);
  if (!placement.ok || placement.wayknot === null) throw new Error("Controlled mat placement failed");
  expect(placement.state.wayknots.map(({ id }) => id)).toEqual([1, 2, 3, 4, 5, 6]);
  return { state: placement.state, id: placement.wayknot.id };
}

function advanceWithMat(world: WorldState, phase: number, wayknots: WayknotState, window = WINDOW): WayknotState {
  const result = advanceResidentRestActivities(world, phase, window, wayknots);
  expect(result).not.toBeNull();
  if (result?.wayknots === undefined) throw new Error("Supplied aid root needs an explicit staged successor");
  return result.wayknots;
}

function matCondition(state: WayknotState, id: number): number {
  const mat = state.wayknots.find((piece) => piece.id === id);
  if (mat === undefined) throw new Error("Finite mat identity disappeared");
  return mat.condition;
}

/** Existing controlled seven-harbor legacy layout, before body adoption. */
function legacyMatFoundationBase(): WorldState {
  const legacy = structuredClone(BASE);
  const template = legacy.terrain.tiles[0]!;
  legacy.terrain = { width: LEGACY_WORLD_WIDTH, height: LEGACY_WORLD_HEIGHT,
    tiles: Array.from({ length: LEGACY_WORLD_WIDTH * LEGACY_WORLD_HEIGHT }, (_, index) => ({
      ...template, index, x: index % LEGACY_WORLD_WIDTH, y: Math.floor(index / LEGACY_WORLD_WIDTH), traceStrength: 0,
    })) };
  const coordinates = [[4, 4], [24, 4], [44, 4], [59, 12], [54, 32], [32, 42], [8, 38]] as const;
  for (let index = 0; index < legacy.settlements.length; index += 1) {
    const settlement = legacy.settlements[index]!;
    const coordinate = coordinates[index];
    if (coordinate === undefined) throw new Error("Missing controlled legacy harbor");
    settlement.tileIndex = coordinate[1] * LEGACY_WORLD_WIDTH + coordinate[0];
  }
  for (const route of legacy.routes) {
    const from = legacy.settlements.find(({ id }) => id === route.fromSettlementId)!;
    const to = legacy.settlements.find(({ id }) => id === route.toSettlementId)!;
    const start = legacy.terrain.tiles[from.tileIndex]!;
    const end = legacy.terrain.tiles[to.tileIndex]!;
    const path = [start.index];
    let x = start.x;
    let y = start.y;
    while (x !== end.x) {
      x += Math.sign(end.x - x);
      path.push(y * LEGACY_WORLD_WIDTH + x);
    }
    while (y !== end.y) {
      y += Math.sign(end.y - y);
      path.push(y * LEGACY_WORLD_WIDTH + x);
    }
    route.path = path;
    route.baseTravelTicks = Math.max(12, path.length - 1);
  }
  const created = legacy.events.find(({ type }) => type === "world-created");
  if (created !== undefined) {
    created.data.width = LEGACY_WORLD_WIDTH;
    created.data.height = LEGACY_WORLD_HEIGHT;
  }
  // No activities, stock, ledger, identities, contracts or clocks are reset.
  assertWorldInvariants(legacy);
  return legacy;
}

describe("source-conserving reed-mat resident service foundations", () => {
  it.each(["persistent96", "old64-alias"] as const)("resolves %s coordinates independently of supported legacy terrain storage stride", (address) => {
    // Controlled dimension/address foundation, not native64 UI acquisition,
    // a historical-save oracle or a new compatibility-reader claim.
    const current = matFixture(RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION, 450, "marsh", legacyMatFoundationBase());
    expect(current.sourceTile.y).toBeGreaterThan(0);
    expect(current.sourceTile.index).toBe(current.sourceTile.y * LEGACY_WORLD_WIDTH + current.sourceTile.x);
    expect(current.sourceContext.tileIndex).not.toBe(current.sourceTile.index);
    const mat = placeMat(current);
    const aid = address === "persistent96" ? mat.state : normalizeWayknotState({ ...mat.state,
      wayknots: mat.state.wayknots.map((piece) => piece.id === mat.id ? { ...piece, tileIndex: current.sourceTile.index } : piece) });
    const aidBefore = stableStringify(aid);
    const successor = advanceWithMat(current.world, 1, aid);
    const distance = address === "persistent96" ? 91 : 62;
    expect(current.get().activity!.poses.at(-1)!.position).toEqual(residentTravelSegmentPose(current.segment, 450 + distance).position);
    if (address === "persistent96") expect(matCondition(successor, mat.id)).toBe(matCondition(aid, mat.id) - 12_000);
    else expect(successor).toBe(aid);
    expect(stableStringify(aid)).toBe(aidBefore);
    assertWorldInvariants(current.world);
    const save = serializeWorld(current.world);
    expect(serializeWorld(deserializeWorld(save))).toBe(save);
    expect(current.world.terrain).toMatchObject({ width: LEGACY_WORLD_WIDTH, height: LEGACY_WORLD_HEIGHT });
    expect(current.contract).toMatchObject({ resource: "food", quantity: 14, cargoQuantity: 14, status: "in-transit" });
  });

  it.each([
    [false, 91, 12_000], [true, 82, 6_000],
  ] as const)("uses setting=%s strength once and spends exactly%s distance/%s condition on an aided entry", (setting, distance, wear) => {
    const current = matFixture();
    const mat = placeMat(current, setting);
    const bare = structuredClone(current.world);
    const aidBefore = stableStringify(mat.state);
    const { residents: _residents, ...roots } = current.world;
    const rootsBefore = stableStringify(roots);
    expect(advanceResidentRestActivities(bare, 1, WINDOW)).not.toBeNull();
    const first = advanceWithMat(current.world, 1, mat.state);
    const aidedPosition = current.get().activity!.poses.at(-1)!.position;
    expect(aidedPosition).toEqual(residentTravelSegmentPose(current.segment, current.offset + distance).position);
    expect(bare.residents.find(({ identity }) => identity.stableId === current.actorId)!.activity!.poses.at(-1)!.position)
      .toEqual(residentTravelSegmentPose(current.segment, current.offset + 62).position);
    expect(Math.floor(aidedPosition.localX / 1_000) !== current.sourceTile.x
      || Math.floor(aidedPosition.localY / 1_000) !== current.sourceTile.y).toBe(true);
    expect(matCondition(first, mat.id)).toBe(matCondition(mat.state, mat.id) - wear);
    expect(first.wayknots.find(({ id }) => id === mat.id)).toMatchObject({ serviceWearRemainder: 0 });
    expect(first.wayknots.filter(({ id }) => id !== mat.id)).toEqual(mat.state.wayknots.filter(({ id }) => id !== mat.id));
    expect(stableStringify(mat.state)).toBe(aidBefore);
    // The next contact belongs to the entered meadow, not the old radius-zero
    // mat. This is one entry service, not wear on every 100ms movement sample.
    const second = advanceWithMat(current.world, 2, first);
    expect(second).toBe(first);
    expect(matCondition(second, mat.id)).toBe(matCondition(mat.state, mat.id) - wear);
    const { residents: _nextResidents, ...nextRoots } = current.world;
    expect(stableStringify(nextRoots)).toBe(rootsBefore);
    expect(current.contract).toMatchObject({ resource: "food", quantity: 14, cargoQuantity: 14, status: "in-transit" });
    assertWorldInvariants(current.world);
  });

  it("does not give a radius-zero destination mat to a traveler before actual contact", () => {
    const current = matFixture();
    current.world.terrain.tiles[Math.floor(current.target.localY / 1_000) * current.world.terrain.width
      + Math.floor(current.target.localX / 1_000)]!.terrain = "marsh";
    const mat = placeMat(current, false, true);
    expect(mat.state.wayknots.find(({ id }) => id === mat.id)!.tileIndex).not.toBe(current.sourceContext.tileIndex);
    expect(advanceWithMat(current.world, 1, mat.state)).toBe(mat.state);
    expect(current.get().activity!.poses.at(-1)!.position).toEqual(residentTravelSegmentPose(current.segment, 512).position);
  });

  it.each(["carried", "broken", "other-region", "reclaimed", "removed"] as const)("invalidates the same physical aid when %s without caching its former benefit", (kind) => {
    const current = matFixture();
    const mat = placeMat(current);
    let state = mat.state;
    if (kind === "carried") state = createWayknotState();
    if (kind === "broken") state = normalizeWayknotState({ ...state, wayknots: state.wayknots.map((piece) => piece.id === mat.id
      ? { ...piece, condition: 0 } : piece) });
    if (kind === "other-region") state = normalizeWayknotState({ ...state, wayknots: state.wayknots.map((piece) => piece.id === mat.id
      ? { ...piece, region: { x: 1, y: 0 } } : piece) });
    if (kind === "reclaimed") {
      const reclaim = reclaimWayknot(state, mat.id);
      expect(reclaim.ok).toBe(true);
      state = reclaim.state;
      expect(state.wayknots.find(({ id }) => id === mat.id)).toMatchObject({ region: null, tileIndex: null,
        condition: matCondition(mat.state, mat.id) - 40_000 });
    }
    // Explicit source-removal counterfactual, not a claimed live destruction
    // action. The strict decoder does not refill an explicitly missing piece.
    if (kind === "removed") state = normalizeWayknotState({ ...state, wayknots: state.wayknots.filter(({ id }) => id !== mat.id) });
    const bare = structuredClone(current.world);
    expect(advanceResidentRestActivities(bare, 1, WINDOW)).not.toBeNull();
    expect(advanceWithMat(current.world, 1, state)).toBe(state);
    expect(serializeWorld(current.world)).toBe(serializeWorld(bare));
    expect(current.get().activity!.poses.at(-1)!.position).toEqual(residentTravelSegmentPose(current.segment, 512).position);
  });

  it.each(["no-entry", "waypoint", "local-window", "exhausted-quota"] as const)("charges no service for %s work", (kind) => {
    const current = matFixture(RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION, kind === "no-entry" ? 0 : kind === "waypoint" ? 960 : 450);
    const phase = 1;
    let window = WINDOW;
    if (kind === "exhausted-quota") {
      // This is a supported historical prefix, not newly produced movement.
      const retained = fixture(RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION, { resource: "food", quantity: 14 });
      stageRetainedPrefix(retained, [...Array.from({ length: 8 }, () => 105), 70]);
      const contact = retained.get().activity!.poses.at(-1)!.position;
      retained.world.terrain.tiles[Math.floor(contact.localY / 1_000) * retained.world.terrain.width
        + Math.floor(contact.localX / 1_000)]!.terrain = "marsh";
      const context = { ...retained, sourceContext: current.sourceContext, sourceTile: current.sourceTile, offset: 910 };
      const mat = placeMat(context);
      const before = structuredClone(retained.get().activity!.poses);
      expect(advanceWithMat(retained.world, 10, mat.state)).toBe(mat.state);
      expect(retained.get().activity!.poses).toEqual([...before, before.at(-1)]);
      return;
    }
    if (kind === "local-window") window = { origin: { x: current.sourceTile.x, y: current.sourceTile.y }, terrain: { width: 1, height: 1 } };
    const mat = placeMat(current);
    const bare = structuredClone(current.world);
    expect(advanceResidentRestActivities(bare, phase, window)).not.toBeNull();
    const successor = advanceWithMat(current.world, phase, mat.state, window);
    expect(successor).toBe(mat.state);
    if (kind !== "no-entry") expect(serializeWorld(current.world)).toBe(serializeWorld(bare));
    else expect(current.get().activity!.poses.at(-1)!.position).toEqual(residentTravelSegmentPose(current.segment, 91).position);
    assertWorldInvariants(current.world);
  });

  it("applies a final useful crossing before its physical mat breaks", () => {
    const current = matFixture();
    const mat = placeMat(current);
    // Controlled existing-piece condition; no repair, new identity or recipe
    // is fabricated. Resolve the crossing with pre-service positive condition.
    const worn = normalizeWayknotState({ ...mat.state, wayknots: mat.state.wayknots.map((piece) => piece.id === mat.id
      ? { ...piece, condition: 6_000 } : piece) });
    const successor = advanceWithMat(current.world, 1, worn);
    expect(current.get().activity!.poses.at(-1)!.position).toEqual(residentTravelSegmentPose(current.segment, 541).position);
    expect(successor.wayknots.find(({ id }) => id === mat.id)).toMatchObject({ condition: 0,
      tileIndex: current.sourceContext.tileIndex, region: { x: 0, y: 0 }, serviceWearRemainder: 0 });
    const newCrossing = matFixture();
    expect(advanceWithMat(newCrossing.world, 1, successor)).toBe(successor);
    expect(newCrossing.get().activity!.poses.at(-1)!.position).toEqual(residentTravelSegmentPose(newCrossing.segment, 512).position);
    expect(matCondition(worn, mat.id)).toBe(6_000);
  });

  it("does not grant a dry mat permission to move through actual wet source ground", () => {
    const current = matFixture();
    const mat = placeMat(current);
    current.sourceTile.elevation = current.world.tide.level - 1;
    const pose = structuredClone(current.get().activity!.poses[0]!);
    const result = advanceResidentRestActivities(current.world, 1, WINDOW, mat.state);
    expect(result).not.toBeNull();
    expect(result?.wayknots).toBe(mat.state);
    expect(result?.movedActorIds).not.toContain(current.actorId);
    expect(current.get().activity!.poses.at(-1)).toEqual(pose);
    expect(current.get().activity?.travelTask).toMatchObject({ phase: "waiting", waitReason: "no-traversable-route" });
  });

  it("preserves frozen-v7 motion and omits the optional successor without supplied aid state", () => {
    const current = matFixture(RESIDENT_TRAVEL_ACTIVITY_VERSION);
    const mat = placeMat(current);
    const bare = structuredClone(current.world);
    const plain = advanceResidentRestActivities(bare, 1, WINDOW);
    const supplied = advanceResidentRestActivities(current.world, 1, WINDOW, mat.state);
    expect(plain).not.toBeNull();
    expect(plain).not.toHaveProperty("wayknots");
    expect(supplied?.wayknots).toBe(mat.state);
    expect(serializeWorld(current.world)).toBe(serializeWorld(bare));
    expect(current.get().activity?.version).toBe(RESIDENT_TRAVEL_ACTIVITY_VERSION);
    expect(current.get().activity!.poses.at(-1)!.position).toEqual(residentTravelSegmentPose(current.segment, 555).position);
  });

  it("continues current phase4/9 cold cuts with equal body, cargo and exact aid wear", () => {
    const current = matFixture();
    const mat = placeMat(current);
    let state = mat.state;
    for (let phase = 1; phase <= 4; phase += 1) state = advanceWithMat(current.world, phase, state);
    expect(matCondition(state, mat.id)).toBe(matCondition(mat.state, mat.id) - 12_000);
    const phase4 = serializeWorld(current.world);
    const aid4 = stableStringify(state);
    const continuations = [
      { world: current.world, state },
      { world: deserializeWorld(phase4), state: normalizeWayknotState(JSON.parse(aid4)) },
      { world: structuredClone(current.world), state: structuredClone(state) },
    ];
    for (const cut of continuations) {
      expect(serializeWorld(cut.world)).toBe(phase4);
      expect(stableStringify(cut.state)).toBe(aid4);
      for (let phase = 5; phase <= 9; phase += 1) cut.state = advanceWithMat(cut.world, phase, cut.state);
    }
    const phase9 = serializeWorld(continuations[0]!.world);
    const aid9 = stableStringify(continuations[0]!.state);
    for (const cut of continuations) {
      expect(serializeWorld(cut.world)).toBe(phase9);
      expect(stableStringify(cut.state)).toBe(aid9);
    }
    continuations.push({ world: deserializeWorld(phase9), state: normalizeWayknotState(JSON.parse(aid9)) });
    for (const cut of continuations) {
      cut.state = advanceWithMat(cut.world, 10, cut.state);
      const admission = prepareResidentTravelAdvance(cut.world, WINDOW);
      expect(admission).not.toBeNull();
      try { stepWorld(cut.world, [], undefined, undefined, admission!); }
      finally { revokeResidentTravelAdvance(admission!); }
      assertWorldInvariants(cut.world);
    }
    const terminal = serializeWorld(continuations[0]!.world);
    const terminalAid = stableStringify(continuations[0]!.state);
    for (const cut of continuations) {
      expect(serializeWorld(cut.world)).toBe(terminal);
      expect(stableStringify(cut.state)).toBe(terminalAid);
      expect(matCondition(cut.state, mat.id)).toBe(matCondition(mat.state, mat.id) - 12_000);
    }
    expect(current.contract).toMatchObject({ resource: "food", quantity: 14, cargoQuantity: 14, status: "in-transit" });
    expect(matCondition(mat.state, mat.id)).toBe(920_000);
  });

  it("publishes neither earlier aided movement nor wear when a later roster actor is invalid", () => {
    const current = matFixture();
    const mat = placeMat(current);
    const control = structuredClone(current.world);
    const controlAid = advanceWithMat(control, 1, mat.state);
    expect(matCondition(controlAid, mat.id)).toBe(matCondition(mat.state, mat.id) - 12_000);
    const selectedIndex = current.world.residents.findIndex(({ identity }) => identity.stableId === current.actorId);
    const later = current.world.residents.at(-1)!;
    expect(selectedIndex).toBeLessThan(current.world.residents.length - 1);
    later.activity = { ...later.activity!, tick: current.world.meta.completedTick + 1 };
    const before = stableStringify(current.world);
    const aidBefore = stableStringify(mat.state);
    const roster = current.world.residents;
    expect(advanceResidentRestActivities(current.world, 1, WINDOW, mat.state)).toBeNull();
    expect(current.world.residents).toBe(roster);
    expect(stableStringify(current.world)).toBe(before);
    expect(stableStringify(mat.state)).toBe(aidBefore);
  });

  it("rejects an internally unbounded aid root before publishing any body step", () => {
    const current = matFixture();
    const malformed = { ...createWayknotState(), capacity: 7 };
    const before = stableStringify(current.world);
    const aidBefore = stableStringify(malformed);
    expect(advanceResidentRestActivities(current.world, 1, WINDOW, malformed)).toBeNull();
    expect(stableStringify(current.world)).toBe(before);
    expect(stableStringify(malformed)).toBe(aidBefore);
  });
});

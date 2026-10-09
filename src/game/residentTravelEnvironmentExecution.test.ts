import { describe, expect, it } from "vitest";

import { createActorObservation, createActorPerceptionState, stepActorPerception, type ActorObservation } from "../sim/actorPerception";
import { createWorld, createWorldView, stepWorld } from "../sim/public";
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
import { advanceResidentMacroTravel, prepareResidentTravelAdvance } from "../sim/residentTravelAdvance";
import { residentTravelLocation, residentTravelSegment, residentTravelSegmentPose } from "../sim/residentTravelRoute";
import { MAX_TIDE_LEVEL, tideAtTick } from "../sim/terrain";
import { FIXED_POINT } from "../sim/types";
import { stableStringify } from "../sim/util";
import { collectExistingHumanObservations, humanObservationCollectionRejected } from "./humanPerception";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import { adoptResidentActivities, advanceResidentRestActivities, prepareResidentRestActivities } from "./residentActivityExecution";

const BASE = createWorld("resident informed route execution foundation", "standard");
const WINDOW = { origin: { x: -10, y: -10 }, terrain: { width: 120, height: 120 } };

/**
 * Synthetic adapter foundations: the initial transit/body and sensory inputs
 * are arranged, not native acceptance, sight or autonomous gameplay evidence.
 * Generated route geometry/identities and conserved one-unit cargo are kept;
 * later motion, re-anchoring and observation admission use the actual owners.
 */
function fixture(version: typeof RESIDENT_TRAVEL_ACTIVITY_VERSION | typeof RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION = RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION) {
  const world = structuredClone(BASE);
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
  const selected = [...world.residents].sort((left, right) => left.identity.stableId.localeCompare(right.identity.stableId))[0]!;
  if (selected.location.kind !== "settlement") throw new Error("Expected generated settlement resident");
  const originId = selected.location.settlementId;
  const route = world.routes.find((candidate) => candidate.fromSettlementId === originId || candidate.toSettlementId === originId)!;
  route.traceStrength = FIXED_POINT;
  const destinationId = route.fromSettlementId === originId ? route.toSettlementId : route.fromSettlementId;
  const contract = { ...world.contracts[0]!, originSettlementId: originId, destinationSettlementId: destinationId,
    requesterResidentId: world.settlements.find(({ id }) => id === destinationId)!.residentIds[0]!,
    status: "in-transit" as const, carrierKind: "resident" as const, assignedResidentId: selected.id,
    resource: "food" as const, quantity: 1, cargoQuantity: 1, createdTick: tick - 3,
    playerExclusiveUntilTick: tick - 3, acceptedTick: tick - 2, departedTick: tick - 1,
    arrivalTick: tick + 100, dueTick: tick + 600, completedTick: null, routeId: route.id,
    porterRouteIds: [route.id], porterSettlementIds: [originId, destinationId] };
  world.contracts[0] = contract;
  const stock = world.settlements.find(({ id }) => id === originId)!.inventory;
  expect(stock.food).toBeGreaterThan(0);
  stock.food -= 1;
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
    expect(current.get().activity!.poses.at(-1)!.position).toEqual(residentTravelSegmentPose(current.segment, 105).position);
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
      ? residentTravelSegmentPose(current.segment, 105).position : pose.position);
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

import { describe, expect, it } from "vitest";

import { headingFromRadians } from "../game/livingActor";
import {
  createSpatialFrame,
  createWorldPosition,
  translateWorldPosition,
  worldPositionDelta,
  type WorldPosition,
} from "../game/worldPosition";
import {
  RESIDENT_TRAVEL_ACTIVITY_OWNER_ID,
  RESIDENT_TRAVEL_ACTIVITY_VERSION,
  type ResidentPhysicalTravelTask,
} from "./residentActivity";
import { canonicalResidentActivityForWorld } from "./residentActivityWorld";
import {
  advanceResidentMacroTravel,
  consumeResidentTravelAdvance,
  prepareResidentTravelAdvance,
  revokeResidentTravelAdvance,
} from "./residentTravelAdvance";
import { residentTravelLocation, residentTravelSegment } from "./residentTravelRoute";
import { createWorld } from "./public";
import { FIXED_POINT, type ContractState, type WorldState } from "./types";
import { stableStringify } from "./util";

const MODEL_WORLD = createWorld("resident macro distance custody foundation", "standard");

// These fixtures explicitly arrange protocol-valid bodies and commitments.
// They exercise the route/custody kernels, not native acceptance, autonomous
// play, local sensing, dry-foot admission, source stock or destination handoff.
function preparedFixture(stepUnits = 0) {
  const world = structuredClone(MODEL_WORLD);
  const route = world.routes.find((candidate) => {
    const [first, second, third] = candidate.path.slice(0, 3).map((index) => world.terrain.tiles[index]);
    return first !== undefined && second !== undefined && third !== undefined
      && second.x - first.x === third.x - second.x
      && second.y - first.y === third.y - second.y;
  });
  if (route === undefined) throw new Error("Prepared fixture needs three straight native route tiles");
  const resident = world.residents.find((candidate) => candidate.location.kind === "settlement"
    && candidate.location.settlementId === route.fromSettlementId)!;
  const tick = world.meta.completedTick;
  const contract: ContractState = {
    ...world.contracts[0]!, originSettlementId: route.fromSettlementId,
    destinationSettlementId: route.toSettlementId,
    status: "in-transit", carrierKind: "resident", assignedResidentId: resident.id,
    quantity: 1, cargoQuantity: 1, createdTick: tick - 3,
    playerExclusiveUntilTick: tick - 3, acceptedTick: tick - 2,
    departedTick: tick - 1, arrivalTick: tick + 100, dueTick: tick + 600,
    completedTick: null, routeId: route.id,
    porterRouteIds: [route.id], porterSettlementIds: [route.fromSettlementId, route.toSettlementId],
  };
  world.contracts[0] = contract;
  const first = world.terrain.tiles[route.path[0]!]!;
  const second = world.terrain.tiles[route.path[1]!]!;
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const heading = headingFromRadians(Math.atan2(dy, dx));
  // Full 105-unit steps must stop on the vertex rather than jump across it.
  // An earlier interval may already have paid this 55-unit initial anchor.
  const initialOffset = stepUnits === 105 ? 55 : 0;
  const start = translateWorldPosition(center(world, route.path[0]!), initialOffset * dx, initialOffset * dy);
  for (const candidate of world.residents) {
    const settlement = world.settlements.find(({ id }) => id === candidate.homeSettlementId)!;
    const position = candidate === resident ? start : center(world, settlement.tileIndex);
    candidate.activity = {
      version: RESIDENT_TRAVEL_ACTIVITY_VERSION, ownerId: RESIDENT_TRAVEL_ACTIVITY_OWNER_ID,
      actorId: candidate.identity.stableId, tick,
      poses: Array.from({ length: 11 }, (_, phase) => ({
        position: translateWorldPosition(position,
          candidate === resident ? phase * stepUnits * dx : 0,
          candidate === resident ? phase * stepUnits * dy : 0),
        heading: candidate === resident ? heading : 0,
      })),
      restTask: null, rationTask: null, materialTask: null,
      inspectionTask: null, pickupTask: null, travelTask: null,
    };
  }
  const task: ResidentPhysicalTravelTask = {
    kind: "contract-travel", contractId: contract.id, mode: "physical",
    legIndex: 0, waypointIndex: Math.floor((initialOffset + stepUnits * 10) / 1_000) + 1,
    selectedAtTick: contract.departedTick!, lastProgressAtTick: tick,
    nextReassessmentAtTick: tick, phase: "approaching", waitReason: null,
  };
  resident.activeContractId = contract.id;
  resident.activity = { ...resident.activity!, travelTask: task };
  const segment = residentTravelSegment(world, contract, task)!;
  resident.location = residentTravelLocation(segment, task, resident.activity.poses.at(-1)!.position)!;
  return { world, resident, contract, task, start, dx, dy, tick };
}

// The short right-angle paths are intentionally synthetic geometry. They keep
// every indexed tile/cardinal edge valid without representing a generated
// world itinerary or making a full-world invariant/stock conservation claim.
function macroFixture(reverse = false, multiLeg = false) {
  const world = structuredClone(MODEL_WORLD);
  const settlements = world.settlements.slice(0, multiLeg ? 3 : 2);
  const tile = (x: number, y: number) => y * world.terrain.width + x;
  const firstRoute = world.routes.find((route) => route.fromSettlementId === settlements[0]!.id
    && route.toSettlementId === settlements[1]!.id)!;
  firstRoute.path = [tile(20, 20), tile(21, 20), tile(22, 20)];
  if (multiLeg) {
    const secondRoute = world.routes.find((route) => route.fromSettlementId === settlements[1]!.id
      && route.toSettlementId === settlements[2]!.id)!;
    secondRoute.path = [tile(22, 20), tile(22, 21), tile(22, 22)];
  }
  if (reverse) settlements.reverse();
  const routeIds = settlements.slice(1).map((settlement, index) => world.routes.find((route) =>
    route.fromSettlementId === Math.min(settlements[index]!.id, settlement.id)
    && route.toSettlementId === Math.max(settlements[index]!.id, settlement.id))!.id);
  const contract: ContractState = {
    ...world.contracts[0]!, originSettlementId: settlements[0]!.id,
    destinationSettlementId: settlements.at(-1)!.id,
    porterRouteIds: routeIds, porterSettlementIds: settlements.map(({ id }) => id),
  };
  const tick = world.meta.completedTick;
  const task: ResidentPhysicalTravelTask = {
    kind: "contract-travel", contractId: contract.id, mode: "physical",
    legIndex: 0, waypointIndex: 1, selectedAtTick: tick - 1,
    lastProgressAtTick: tick - 1, nextReassessmentAtTick: tick,
    phase: "approaching", waitReason: null,
  };
  const first = world.routes.find(({ id }) => id === routeIds[0])!;
  const firstIndex = reverse ? first.path.at(-1)! : first.path[0]!;
  return { world, contract, task, tick, start: center(world, firstIndex) };
}

function center(world: WorldState, index: number): WorldPosition {
  const tile = world.terrain.tiles[index]!;
  return createWorldPosition({ x: 0, y: 0 }, tile.x * 1_000 + 500, tile.y * 1_000 + 500);
}

describe("one-shot resident closing travel budget", () => {
  it.each([0, 50, 105])("subtracts ten retained %s-unit steps from the single 1050-unit budget", (stepUnits) => {
    const { world, resident, tick } = preparedFixture(stepUnits);
    expect(world.residents.every((candidate) => canonicalResidentActivityForWorld(world, candidate) !== null)).toBe(true);
    const before = stableStringify(world);
    const prepared = prepareResidentTravelAdvance(world, null);
    expect(prepared).toEqual({ sourceTick: tick, targetTick: tick + 1 });
    expect(Object.isFrozen(prepared)).toBe(true);
    const admission = consumeResidentTravelAdvance(world, prepared!);
    expect(admission.frame).toBeNull();
    expect(admission.remainingUnitsByActor.get(resident.identity.stableId)).toBe(1_050 - stepUnits * 10);
    expect(admission.remainingUnitsByActor.size).toBe(world.residents.length);
    expect(stableStringify(world)).toBe(before);
  });

  it("spends only the remainder after actual retained fine displacement", () => {
    const { world, resident, contract, task, start, dx, dy, tick } = preparedFixture(50);
    const prepared = prepareResidentTravelAdvance(world, null)!;
    const admission = consumeResidentTravelAdvance(world, prepared);
    const remaining = admission.remainingUnitsByActor.get(resident.identity.stableId)!;
    const before = stableStringify(world);
    const result = advanceResidentMacroTravel(world, contract, task,
      resident.activity!.poses.at(-1)!, admission.frame, remaining, tick + 1);
    expect(result?.advancedUnits).toBe(550);
    expect(result?.pose.position).toEqual(translateWorldPosition(start, dx * 1_050, dy * 1_050));
    expect(result?.task).toMatchObject({ legIndex: 0, waypointIndex: 2, phase: "approaching" });
    expect(stableStringify(world)).toBe(before);
  });

  it("captures the physical tile window and rejects invalid or incomplete closing input", () => {
    const { world } = preparedFixture();
    const prepared = prepareResidentTravelAdvance(world, {
      origin: { x: -1, y: -1 }, terrain: { width: 120, height: 120 },
    })!;
    expect(consumeResidentTravelAdvance(world, prepared).frame).toEqual({
      origin: { region: { x: -1, y: -1 }, localX: 95_000, localY: 71_000 },
      width: 120_000, height: 120_000,
    });
    expect(prepareResidentTravelAdvance(world, { origin: { x: 0, y: 0 }, terrain: { width: 0, height: 120 } })).toBeNull();
    world.residents[0]!.activity = { ...world.residents[0]!.activity!,
      poses: world.residents[0]!.activity!.poses.slice(0, 10),
    };
    expect(prepareResidentTravelAdvance(world, null)).toBeNull();
  });

  it.each(["backward", "off-route"] as const)("rejects %s retained history despite an unchanged valid final body", (change) => {
    const { world, resident, dx, dy } = preparedFixture(50);
    const cold = structuredClone(world);
    const retained = cold.residents.find(({ id }) => id === resident.id)!;
    expect(canonicalResidentActivityForWorld(cold, retained)).not.toBeNull();
    const poses = [...retained.activity!.poses];
    const pose = poses[4]!;
    poses[4] = { ...pose, position: change === "backward"
      ? translateWorldPosition(pose.position, dx * 55, dy * 55)
      : translateWorldPosition(pose.position, -dy, dx) };
    retained.activity = { ...retained.activity!, poses };
    expect(retained.activity.poses.at(-1)).toEqual(resident.activity!.poses.at(-1));
    const before = stableStringify(cold);
    expect(canonicalResidentActivityForWorld(cold, retained)).toBeNull();
    expect(prepareResidentTravelAdvance(cold, null)).toBeNull();
    expect(stableStringify(cold)).toBe(before);
  });

  it("rejects a cold final-body anchor that exceeds the elapsed departure budget", () => {
    const { world, resident, contract, task, tick } = preparedFixture(50);
    const finalPose = resident.activity!.poses.at(-1)!;
    resident.activity = { ...resident.activity!, poses: Array.from({ length: 11 }, () => finalPose) };
    // The same exact 500-unit anchor is possible after the retained prior
    // interval, but not at phase zero of the departure tick itself.
    expect(canonicalResidentActivityForWorld(world, resident)).not.toBeNull();
    const cold = structuredClone(world);
    const retained = cold.residents.find(({ id }) => id === resident.id)!;
    const retainedContract = cold.contracts.find(({ id }) => id === contract.id)!;
    retainedContract.departedTick = tick;
    retained.activity = { ...retained.activity!, travelTask: { ...task, selectedAtTick: tick } };
    const before = stableStringify(cold);
    expect(canonicalResidentActivityForWorld(cold, retained)).toBeNull();
    expect(prepareResidentTravelAdvance(cold, null)).toBeNull();
    expect(stableStringify(cold)).toBe(before);
  });

  it("rejects an overlapping U-turn shortcut while retaining a real two-phase vertex crossing", () => {
    const { world, resident, contract, task, start, dx, dy } = preparedFixture();
    const route = world.routes.find(({ id }) => id === contract.porterRouteIds[0])!;
    // A synthetic immediate U-turn makes adjacent edges overlap in space.
    // Positions alone must not turn backward travel into a paid vertex visit.
    route.path = [route.path[0]!, route.path[1]!, route.path[0]!];
    const prior = { position: translateWorldPosition(start, dx * 950, dy * 950),
      heading: headingFromRadians(Math.atan2(dy, dx)) };
    const vertex = { ...prior, position: translateWorldPosition(start, dx * 1_000, dy * 1_000) };
    const final = { position: translateWorldPosition(start, dx * 975, dy * 975),
      heading: headingFromRadians(Math.atan2(-dy, -dx)) };
    const closing = { ...task, waypointIndex: 2 };
    resident.activity = { ...resident.activity!, travelTask: closing,
      poses: Array.from({ length: 11 }, (_, phase) => phase < 9 ? prior : phase === 9 ? vertex : final) };
    const segment = residentTravelSegment(world, contract, closing)!;
    resident.location = residentTravelLocation(segment, closing, final.position)!;
    expect(canonicalResidentActivityForWorld(world, resident)).not.toBeNull();
    const cold = structuredClone(world);
    const retained = cold.residents.find(({ id }) => id === resident.id)!;
    const poses = [...retained.activity!.poses];
    poses[9] = poses[8]!;
    retained.activity = { ...retained.activity!, poses };
    expect(retained.activity.poses.at(-1)).toEqual(final);
    const before = stableStringify(cold);
    expect(canonicalResidentActivityForWorld(cold, retained)).toBeNull();
    expect(prepareResidentTravelAdvance(cold, null)).toBeNull();
    expect(stableStringify(cold)).toBe(before);
  });

  it.each(["consumed", "revoked", "copied", "foreign", "stale-tick", "roster", "slot", "activity"] as const)("rejects %s source custody without falling back to a fresh budget", (change) => {
    const { world, resident } = preparedFixture();
    const prepared = prepareResidentTravelAdvance(world, null)!;
    if (change === "consumed") consumeResidentTravelAdvance(world, prepared);
    else if (change === "revoked") revokeResidentTravelAdvance(prepared);
    else if (change === "copied") {
      expect(() => consumeResidentTravelAdvance(world, { ...prepared })).toThrow(RangeError);
      expect(() => consumeResidentTravelAdvance(world, prepared)).not.toThrow();
      return;
    } else if (change === "foreign") {
      expect(() => consumeResidentTravelAdvance(structuredClone(world), prepared)).toThrow(RangeError);
    } else if (change === "stale-tick") world.meta.completedTick += 1;
    else if (change === "roster") world.residents = [...world.residents];
    else if (change === "slot") {
      const index = world.residents.indexOf(resident);
      world.residents[index] = structuredClone(resident);
    } else if (change === "activity") resident.activity = structuredClone(resident.activity!);
    expect(() => consumeResidentTravelAdvance(world, prepared)).toThrow(RangeError);
    // Even a failed attempted consumption revokes the original capability.
    expect(() => consumeResidentTravelAdvance(world, prepared)).toThrow(RangeError);
  });
});

describe("bounded ordered resident macro continuation", () => {
  it.each([false, true])("pays actual ordered distance and keeps reverse=%s direction", (reverse) => {
    const { world, contract, task, start, tick } = macroFixture(reverse);
    const heading = reverse ? 500_000 : 0;
    const before = stableStringify({ world, contract, task });
    const result = advanceResidentMacroTravel(world, contract, task, { position: start, heading }, null, 1_050, tick + 1);
    expect(result?.advancedUnits).toBe(1_050);
    expect(result?.pose).toEqual({ position: translateWorldPosition(start, reverse ? -1_050 : 1_050, 0), heading });
    expect(result?.task).toMatchObject({ legIndex: 0, waypointIndex: 2, phase: "approaching", waitReason: null });
    expect(result?.location).toEqual({ kind: "route", routeId: contract.porterRouteIds[0]!, progress: reverse ? 475_000 : 525_000 });
    expect(stableStringify({ world, contract, task })).toBe(before);
  });

  it.each([false, true])("stops at the first included point even when both edge endpoints are outside, reverse=%s", (reverse) => {
    const { world, contract, task, start, tick } = macroFixture(reverse);
    // A deliberately sub-tile synthetic frame isolates outside→outside
    // clipping; actual interaction-window construction is tested separately.
    const origin = translateWorldPosition(start, reverse ? -850 : 250, -50);
    const frame = createSpatialFrame(origin, 100, 100);
    const before = stableStringify({ world, contract, task });
    const result = advanceResidentMacroTravel(world, contract, task,
      { position: start, heading: reverse ? 500_000 : 0 }, frame, 1_050, tick + 1);
    const distance = reverse ? 751 : 250;
    expect(result?.advancedUnits).toBe(distance);
    expect(result?.pose.position).toEqual(translateWorldPosition(start, reverse ? -distance : distance, 0));
    expect(result?.task.waypointIndex).toBe(1);
    expect(stableStringify({ world, contract, task })).toBe(before);
  });

  it("pays exactly one unit to exit the half-open local boundary", () => {
    const { world, contract, task, start, tick } = macroFixture();
    const frame = createSpatialFrame(translateWorldPosition(start, -500, -500), 1_000, 1_000);
    const lastLocal = { position: translateWorldPosition(start, 499, 0), heading: 0 };
    const stopped = advanceResidentMacroTravel(world, contract, task, lastLocal, frame, 0, tick + 1);
    expect(stopped?.advancedUnits).toBe(0);
    expect(stopped?.pose).toBe(lastLocal);
    const exited = advanceResidentMacroTravel(world, contract, task, lastLocal, frame, 1, tick + 1);
    expect(exited?.advancedUnits).toBe(1);
    expect(exited?.pose.position).toEqual(translateWorldPosition(start, 500, 0));
    const stillLocal = { position: translateWorldPosition(start, 498, 0), heading: 0 };
    expect(advanceResidentMacroTravel(world, contract, task, stillLocal, frame, 1_050, tick + 1))
      .toMatchObject({ pose: stillLocal, advancedUnits: 0 });
  });

  it.each([false, true])("crosses a real shared waypoint without charging or teleporting the multileg join, reverse=%s", (reverse) => {
    const { world, contract, task, tick } = macroFixture(reverse, true);
    const closing = { ...task, waypointIndex: 2 };
    const position = reverse
      ? createWorldPosition({ x: 0, y: 0 }, 22_500, 20_550)
      : createWorldPosition({ x: 0, y: 0 }, 22_450, 20_500);
    const result = advanceResidentMacroTravel(world, contract, closing,
      { position, heading: reverse ? 750_000 : 0 }, null, 1_050, tick + 1);
    expect(result?.advancedUnits).toBe(1_050);
    expect(result?.task).toMatchObject({ legIndex: 1, waypointIndex: 2, phase: "approaching" });
    expect(result?.pose).toEqual({
      position: createWorldPosition({ x: 0, y: 0 }, reverse ? 21_500 : 22_500, reverse ? 20_500 : 21_500),
      heading: reverse ? 500_000 : 250_000,
    });
    expect(result?.location).toEqual({ kind: "route", routeId: contract.porterRouteIds[1]!, progress: FIXED_POINT / 2 });
    expect(worldPositionDelta(position, result!.pose.position)).toEqual(reverse ? { x: -1_000, y: -50 } : { x: 50, y: 1_000 });
  });

  it.each([false, true])("stops at the shared waypoint when the next itinerary leg is inactive, reverse=%s", (reverse) => {
    const { world, contract, task, tick } = macroFixture(reverse, true);
    const closing = { ...task, waypointIndex: 2 };
    const position = reverse
      ? createWorldPosition({ x: 0, y: 0 }, 22_500, 20_550)
      : createWorldPosition({ x: 0, y: 0 }, 22_450, 20_500);
    const pose = { position, heading: reverse ? 750_000 : 0 };
    expect(advanceResidentMacroTravel(world, contract, closing, pose, null, 1_050, tick + 1))
      .toMatchObject({ advancedUnits: 1_050, task: { legIndex: 1, waypointIndex: 2, phase: "approaching" } });
    world.routes.find(({ id }) => id === contract.porterRouteIds[1])!.condition = 0;
    const before = stableStringify({ world, contract, task: closing });
    const result = advanceResidentMacroTravel(world, contract, closing, pose, null, 1_050, tick + 1);
    expect(result?.advancedUnits).toBe(50);
    expect(result?.pose.position).toEqual(createWorldPosition({ x: 0, y: 0 }, 22_500, 20_500));
    expect(result?.task).toMatchObject({
      legIndex: 1, waypointIndex: 1, phase: "waiting", waitReason: "no-active-route",
    });
    expect(result?.location).toEqual({
      kind: "route", routeId: contract.porterRouteIds[1]!, progress: reverse ? FIXED_POINT : 0,
    });
    expect(worldPositionDelta(position, result!.pose.position)).toEqual(reverse ? { x: 0, y: -50 } : { x: 50, y: 0 });
    expect(stableStringify({ world, contract, task: closing })).toBe(before);
  });

  it("stops at exact final arrival without spending surplus or performing delivery", () => {
    const { world, contract, task, tick } = macroFixture();
    const closing = { ...task, waypointIndex: 2 };
    const position = createWorldPosition({ x: 0, y: 0 }, 22_400, 20_500);
    const before = stableStringify({ world, contract });
    const result = advanceResidentMacroTravel(world, contract, closing, { position, heading: 0 }, null, 1_050, tick + 1);
    expect(result?.advancedUnits).toBe(100);
    expect(result?.pose.position).toEqual(createWorldPosition({ x: 0, y: 0 }, 22_500, 20_500));
    expect(result?.task).toMatchObject({ phase: "arrived", nextReassessmentAtTick: tick + 2 });
    expect(result?.location).toEqual({ kind: "route", routeId: contract.porterRouteIds[0]!, progress: FIXED_POINT });
    expect(stableStringify({ world, contract })).toBe(before);
  });

  it.each(["no-traversable-route", "no-active-route", "weather-hold", "disturbed"] as const)("does not move or clear actual %s waiting authority", (waitReason) => {
    const { world, contract, task, start, tick } = macroFixture();
    const waiting = { ...task, phase: "waiting" as const, waitReason };
    const pose = { position: start, heading: 0 };
    const result = advanceResidentMacroTravel(world, contract, waiting, pose, null, 1_050, tick + 1);
    expect(result?.advancedUnits).toBe(0);
    expect(result?.pose).toBe(pose);
    expect(result?.task).toBe(waiting);
  });

  it("can resume only the explicit outside-local-corridor handoff", () => {
    const { world, contract, task, start, tick } = macroFixture();
    const waiting = { ...task, phase: "waiting" as const, waitReason: "outside-local-corridor" as const };
    expect(advanceResidentMacroTravel(world, contract, waiting, { position: start, heading: 0 }, null, 10, tick + 1))
      .toMatchObject({ advancedUnits: 10, task: { phase: "approaching", waitReason: null } });
  });

  it.each([-1, 0.5, 1_051, NaN, Infinity])("rejects invalid movement budget %s", (maximumUnits) => {
    const { world, contract, task, start, tick } = macroFixture();
    expect(advanceResidentMacroTravel(world, contract, task, { position: start, heading: 0 }, null, maximumUnits, tick + 1)).toBeNull();
  });

  it("rejects off-route bodies and unnormalized intermediate endpoints instead of rounding progress", () => {
    const { world, contract, task, start, tick } = macroFixture();
    expect(advanceResidentMacroTravel(world, contract, task,
      { position: translateWorldPosition(start, 1, 1), heading: 0 }, null, 1_050, tick + 1)).toBeNull();
    expect(advanceResidentMacroTravel(world, contract, task,
      { position: translateWorldPosition(start, 1_000, 0), heading: 0 }, null, 1_050, tick + 1)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import {
  createSpatialFrame,
  createWorldPosition,
  globalFixedToWorldPosition,
  translateWorldPosition,
  worldPositionDelta,
  worldPositionToGlobalFixed,
  type SpatialFrame,
  type WorldPosition,
} from "../game/worldPosition";
import type { LivingActorInteractionWindow } from "../game/livingActorSimulation";
import { createWorld } from "./public";
import { REGION_COORD_LIMIT } from "./regions";
import type { ResidentPhysicalTravelTask } from "./residentActivity";
import {
  advanceResidentTravelWaypoint,
  residentTravelBodyIsLocal,
  residentTravelInteractionFrame,
  residentTravelLocation,
  residentTravelSegment,
  residentTravelSegmentOffset,
  residentTravelSegmentPose,
  residentTravelWindowInterval,
  type ResidentTravelSegment,
} from "./residentTravelRoute";
import { FIXED_POINT, type ContractState, type WorldState } from "./types";
import { stableStringify } from "./util";

const MODEL_WORLD = createWorld("resident directed route foundation", "standard");

// These are geometry/cursor foundations, not enacted journeys. Clipping uses
// explicitly synthetic cardinal edges. Itinerary fixtures arrange a contract
// over genuine generated routes; they do not assert acceptance, full-world
// contract authentication, locomotion, custody, normal play or a handoff.
function segmentAt(
  start: WorldPosition,
  directionX: -1 | 0 | 1,
  directionY: -1 | 0 | 1,
): ResidentTravelSegment {
  return Object.freeze({
    route: MODEL_WORLD.routes[0]!, start,
    end: translateWorldPosition(start, directionX * 1_000, directionY * 1_000),
    directionX, directionY, reversed: false,
  });
}

function itinerary(reverse = false, multiLeg = false) {
  const world = structuredClone(MODEL_WORLD);
  const settlements = world.settlements.slice(0, multiLeg ? 3 : 2);
  if (reverse) settlements.reverse();
  const routes = settlements.slice(1).map((settlement, index) => {
    const from = settlements[index]!.id;
    const route = world.routes.find((candidate) =>
      candidate.fromSettlementId === Math.min(from, settlement.id)
      && candidate.toSettlementId === Math.max(from, settlement.id));
    if (route === undefined || route.path.length < 3) throw new Error("Native route fixture is unavailable");
    return route;
  });
  const contract: ContractState = {
    ...world.contracts[0]!,
    originSettlementId: settlements[0]!.id,
    destinationSettlementId: settlements.at(-1)!.id,
    porterRouteIds: routes.map(({ id }) => id),
    porterSettlementIds: settlements.map(({ id }) => id),
  };
  const task: ResidentPhysicalTravelTask = {
    kind: "contract-travel", contractId: contract.id, mode: "physical",
    legIndex: 0, waypointIndex: 1, selectedAtTick: world.meta.completedTick,
    lastProgressAtTick: world.meta.completedTick,
    nextReassessmentAtTick: world.meta.completedTick + 1,
    phase: "approaching", waitReason: null,
  };
  return { world, contract, task, routes };
}

function center(world: WorldState, index: number): WorldPosition {
  const tile = world.terrain.tiles[index]!;
  return globalFixedToWorldPosition(tile.x * 1_000 + 500, tile.y * 1_000 + 500);
}

describe("resident route physical interaction frame", () => {
  it("converts signed tile origins without confusing regions and view cones", () => {
    const frame = residentTravelInteractionFrame({
      origin: { x: -1, y: -1 }, terrain: { width: 120, height: 120 },
    });
    expect(frame).toEqual({
      origin: { region: { x: -1, y: -1 }, localX: 95_000, localY: 71_000 },
      width: 120_000, height: 120_000,
    });
    expect(Object.isFrozen(frame)).toBe(true);
    expect(Object.isFrozen(frame?.origin)).toBe(true);
    expect(Object.isFrozen(frame?.origin.region)).toBe(true);
  });

  it("rejects absent, fractional, empty and over-budget window dimensions", () => {
    const valid = { origin: { x: 0, y: 0 }, terrain: { width: 120, height: 120 } };
    for (const extent of [0, -1, 1.5, 257, NaN, Infinity]) {
      expect(residentTravelInteractionFrame({ ...valid, terrain: { ...valid.terrain, width: extent } })).toBeNull();
      expect(residentTravelInteractionFrame({ ...valid, terrain: { ...valid.terrain, height: extent } })).toBeNull();
    }
    expect(residentTravelInteractionFrame({ ...valid, origin: { x: 0.5, y: 0 } })).toBeNull();
    expect(residentTravelInteractionFrame({ origin: valid.origin } as LivingActorInteractionWindow)).toBeNull();
    expect(residentTravelInteractionFrame(null as unknown as LivingActorInteractionWindow)).toBeNull();
    expect(residentTravelInteractionFrame({ ...valid, terrain: { width: 256, height: 256 } })).not.toBeNull();
  });
});

describe("integer directed route clipping", () => {
  const frame = createSpatialFrame(globalFixedToWorldPosition(0, 0), 100, 100);

  it.each([
    { name: "east", x: -50, y: 50, dx: 1, dy: 0, first: 50, last: 149 },
    { name: "west", x: 950, y: 50, dx: -1, dy: 0, first: 851, last: 950 },
    { name: "south", x: 50, y: -50, dx: 0, dy: 1, first: 50, last: 149 },
    { name: "north", x: 50, y: 950, dx: 0, dy: -1, first: 851, last: 950 },
  ] as const)("includes the exact $name crossing when both endpoints are outside", ({ x, y, dx, dy, first, last }) => {
    const segment = segmentAt(globalFixedToWorldPosition(x, y), dx, dy);
    expect(residentTravelBodyIsLocal(frame, segment.start)).toBe(false);
    expect(residentTravelBodyIsLocal(frame, segment.end)).toBe(false);
    const interval = residentTravelWindowInterval(frame, segment);
    expect(interval).toEqual({ first, last });
    expect(Object.isFrozen(interval)).toBe(true);
    expect(residentTravelBodyIsLocal(frame, residentTravelSegmentPose(segment, first).position)).toBe(true);
    expect(residentTravelBodyIsLocal(frame, residentTravelSegmentPose(segment, last).position)).toBe(true);
    expect(residentTravelBodyIsLocal(frame, residentTravelSegmentPose(segment, first - 1).position)).toBe(false);
    expect(residentTravelBodyIsLocal(frame, residentTravelSegmentPose(segment, last + 1).position)).toBe(false);
  });

  it("includes the origin and final included unit, but not the far half-open edges", () => {
    const touchesOrigin = segmentAt(globalFixedToWorldPosition(-1_000, 0), 1, 0);
    expect(residentTravelWindowInterval(frame, touchesOrigin)).toEqual({ first: 1_000, last: 1_000 });
    expect(residentTravelWindowInterval(frame, segmentAt(globalFixedToWorldPosition(99, 0), 1, 0)))
      .toEqual({ first: 0, last: 0 });
    expect(residentTravelWindowInterval(frame, segmentAt(globalFixedToWorldPosition(100, 0), 1, 0))).toBeNull();
    expect(residentTravelWindowInterval(frame, segmentAt(globalFixedToWorldPosition(-50, 100), 1, 0))).toBeNull();
    expect(residentTravelWindowInterval(frame, segmentAt(globalFixedToWorldPosition(100, -50), 0, 1))).toBeNull();
    expect(residentTravelWindowInterval(frame, segmentAt(globalFixedToWorldPosition(-50, -1), 1, 0))).toBeNull();
  });

  it("retains a whole contained edge and reverses the included distances exactly", () => {
    const wide = createSpatialFrame(globalFixedToWorldPosition(-500, -500), 2_000, 2_000);
    const forward = segmentAt(globalFixedToWorldPosition(0, 0), 1, 0);
    const reverse = segmentAt(forward.end, -1, 0);
    expect(residentTravelWindowInterval(wide, forward)).toEqual({ first: 0, last: 1_000 });
    expect(residentTravelWindowInterval(wide, reverse)).toEqual({ first: 0, last: 1_000 });
    const smaller = createSpatialFrame(globalFixedToWorldPosition(200, -50), 301, 100);
    expect(residentTravelWindowInterval(smaller, forward)).toEqual({ first: 200, last: 500 });
    expect(residentTravelWindowInterval(smaller, reverse)).toEqual({ first: 500, last: 800 });
  });

  it.each([-1, 1])("does not flatten extreme signed region %s into an unsafe number", (sign) => {
    const origin = createWorldPosition({ x: sign * (REGION_COORD_LIMIT - 2), y: sign * (REGION_COORD_LIMIT - 2) }, 10_000, 10_000);
    expect(() => worldPositionToGlobalFixed(origin)).toThrow(RangeError);
    const distantFrame = createSpatialFrame(origin, 100, 100);
    const crossing = segmentAt(translateWorldPosition(origin, -50, 50), 1, 0);
    expect(residentTravelWindowInterval(distantFrame, crossing)).toEqual({ first: 50, last: 149 });
    expect(residentTravelBodyIsLocal(distantFrame, translateWorldPosition(origin, 99, 99))).toBe(true);
    expect(residentTravelBodyIsLocal(distantFrame, translateWorldPosition(origin, 100, 99))).toBe(false);
    const farSegment = segmentAt(createWorldPosition({ x: -sign * (REGION_COORD_LIMIT - 2), y: 0 }, 10_000, 10_000), 1, 0);
    expect(() => worldPositionDelta(distantFrame.origin, farSegment.start)).toThrow(RangeError);
    expect(residentTravelWindowInterval(distantFrame, farSegment)).toBeNull();
    expect(residentTravelBodyIsLocal(distantFrame, farSegment.start)).toBe(false);
  });

  it("rejects malformed frames and non-cardinal or zero-length edges rather than reporting unloaded space", () => {
    const segment = segmentAt(globalFixedToWorldPosition(0, 0), 1, 0);
    for (const width of [0, -1, 0.5, NaN, Infinity]) {
      expect(() => residentTravelWindowInterval({ ...frame, width }, segment)).toThrow(RangeError);
    }
    expect(() => residentTravelWindowInterval({ ...frame, debug: true } as SpatialFrame, segment)).toThrow(RangeError);
    expect(() => residentTravelWindowInterval({ ...frame, origin: { ...frame.origin, localX: -0 } }, segment)).toThrow(RangeError);
    expect(() => residentTravelWindowInterval(frame, { ...segment, end: segment.start })).toThrow(RangeError);
    expect(() => residentTravelWindowInterval(frame, {
      ...segment, end: translateWorldPosition(segment.start, 1_000, 1_000),
    })).toThrow(RangeError);
  });
});

describe("directed resident itinerary cursor foundations", () => {
  it.each([false, true])("binds exact generated route endpoints and progress in reverse=%s", (reverse) => {
    const { world, contract, task, routes } = itinerary(reverse);
    const before = stableStringify({ world, contract, task });
    const route = routes[0]!;
    const segment = residentTravelSegment(world, contract, task)!;
    expect(segment).not.toBeNull();
    expect(Object.isFrozen(segment)).toBe(true);
    expect(segment.route).toBe(route);
    expect(segment.reversed).toBe(reverse);
    expect(segment.start).toEqual(center(world, route.path[reverse ? route.path.length - 1 : 0]!));
    expect(segment.end).toEqual(center(world, route.path[reverse ? route.path.length - 2 : 1]!));
    for (const offset of [0, 105, 999, 1_000]) {
      const body = residentTravelSegmentPose(segment, offset).position;
      expect(residentTravelSegmentOffset(segment, body)).toBe(offset);
      const directed = Math.trunc(offset * FIXED_POINT / ((route.path.length - 1) * 1_000));
      expect(residentTravelLocation(segment, task, body)).toEqual({
        kind: "route", routeId: route.id, progress: reverse ? FIXED_POINT - directed : directed,
      });
    }
    const cold = structuredClone({ world, contract, task });
    const coldSegment = residentTravelSegment(cold.world, cold.contract, cold.task)!;
    expect(coldSegment).toEqual(segment);
    expect(coldSegment.route).not.toBe(segment.route);
    expect(residentTravelLocation(coldSegment, cold.task, residentTravelSegmentPose(coldSegment, 105).position))
      .toEqual(residentTravelLocation(segment, task, residentTravelSegmentPose(segment, 105).position));
    expect(stableStringify({ world, contract, task })).toBe(before);
  });

  it.each([
    [1, 0, 0], [0, 1, 250_000], [-1, 0, 500_000], [0, -1, 750_000],
  ] as const)("projects cardinal heading (%s,%s) as %s without a renderer", (dx, dy, heading) => {
    const segment = segmentAt(globalFixedToWorldPosition(5_000, 5_000), dx, dy);
    const pose = residentTravelSegmentPose(segment, 105);
    expect(pose).toEqual({ position: translateWorldPosition(segment.start, dx * 105, dy * 105), heading });
    expect(Object.isFrozen(pose)).toBe(true);
    expect(Object.isFrozen(pose.position)).toBe(true);
  });

  it("rejects off-edge bodies and invalid offsets instead of rounding them to a route", () => {
    const { world, contract, task } = itinerary();
    const segment = residentTravelSegment(world, contract, task)!;
    const offEdge = translateWorldPosition(segment.start, segment.directionY, segment.directionX);
    for (const body of [offEdge,
      translateWorldPosition(segment.start, -segment.directionX, -segment.directionY),
      translateWorldPosition(segment.end, segment.directionX, segment.directionY),
      { ...segment.start, localX: NaN }]) {
      expect(residentTravelSegmentOffset(segment, body)).toBeNull();
      expect(residentTravelLocation(segment, task, body)).toBeNull();
      expect(advanceResidentTravelWaypoint(world, contract, task, body, task.selectedAtTick)).toBeNull();
    }
    for (const offset of [-1, 0.5, 1_001, NaN, Infinity]) {
      expect(() => residentTravelSegmentPose(segment, offset)).toThrow(RangeError);
    }
  });

  it("rejects mismatched cursor and route references at segment preparation", () => {
    const { world, contract, task, routes } = itinerary();
    for (const patch of [
      { contractId: contract.id + 1 }, { legIndex: -1 }, { legIndex: 0.5 },
      { legIndex: 1 }, { waypointIndex: 0 }, { waypointIndex: 0.5 },
      { waypointIndex: routes[0]!.path.length },
    ]) expect(residentTravelSegment(world, contract, { ...task, ...patch })).toBeNull();
    for (const patch of [
      { porterRouteIds: [-1] }, { porterSettlementIds: [contract.originSettlementId] },
      { porterSettlementIds: [contract.originSettlementId, contract.originSettlementId] },
      { porterSettlementIds: [contract.originSettlementId, world.settlements[2]!.id] },
    ]) expect(residentTravelSegment(world, { ...contract, ...patch }, task)).toBeNull();
  });

  it("rejects disconnected, diagonal and malformed terrain edges without repairing the path", () => {
    for (const [dx, dy] of [[0, 0], [2, 0], [1, 1]] as const) {
      const { world, contract, task, routes } = itinerary();
      const route = routes[0]!;
      const first = world.terrain.tiles[route.path[0]!]!;
      const secondIndex = (first.y + dy) * world.terrain.width + first.x + dx;
      route.path[1] = secondIndex;
      expect(residentTravelSegment(world, contract, task)).toBeNull();
    }
    const { world, contract, task, routes } = itinerary();
    const index = routes[0]!.path[0]!;
    world.terrain.tiles[index] = { ...world.terrain.tiles[index]!, index: index + 1 };
    expect(residentTravelSegment(world, contract, task)).toBeNull();
  });

  it.each([false, true])("advances only exact waypoints, then retains the final body in reverse=%s", (reverse) => {
    const { world, contract, task, routes } = itinerary(reverse);
    const tick = task.selectedAtTick + 1;
    const segment = residentTravelSegment(world, contract, task)!;
    const before = stableStringify({ world, contract, task });
    const partial = residentTravelSegmentPose(segment, 999).position;
    expect(advanceResidentTravelWaypoint(world, contract, task, partial, tick)).toBe(task);
    expect(advanceResidentTravelWaypoint(world, contract, { ...task, phase: "arrived" }, partial, tick)).toBeNull();
    const next = advanceResidentTravelWaypoint(world, contract, task, segment.end, tick)!;
    expect(next).toEqual({ ...task, waypointIndex: 2, lastProgressAtTick: tick, nextReassessmentAtTick: tick });
    const nextSegment = residentTravelSegment(world, contract, next)!;
    expect(nextSegment.start).toEqual(segment.end);
    expect(residentTravelLocation(nextSegment, next, segment.end))
      .toEqual(residentTravelLocation(segment, task, segment.end));
    const finalTask = { ...task, waypointIndex: routes[0]!.path.length - 1 };
    const finalSegment = residentTravelSegment(world, contract, finalTask)!;
    const arrived = advanceResidentTravelWaypoint(world, contract, finalTask, finalSegment.end, tick)!;
    expect(arrived).toEqual({ ...finalTask, phase: "arrived", lastProgressAtTick: tick, nextReassessmentAtTick: tick + 1 });
    expect(residentTravelLocation(finalSegment, arrived, finalSegment.end)).toEqual({
      kind: "route", routeId: routes[0]!.id, progress: reverse ? 0 : FIXED_POINT,
    });
    expect(residentTravelSegment(world, contract, arrived)?.end).toEqual(finalSegment.end);
    expect(stableStringify({ world, contract, task })).toBe(before);
  });

  it.each([false, true])("crosses a connected multileg boundary exactly once in reverse=%s", (reverse) => {
    const { world, contract, task, routes } = itinerary(reverse, true);
    const firstLegEnd = { ...task, waypointIndex: routes[0]!.path.length - 1,
      phase: "waiting" as const, waitReason: "outside-local-corridor" as const };
    const segment = residentTravelSegment(world, contract, firstLegEnd)!;
    const before = stableStringify({ world, contract, task: firstLegEnd });
    const tick = task.selectedAtTick + 1;
    const next = advanceResidentTravelWaypoint(world, contract, firstLegEnd, segment.end, tick)!;
    expect(next).toEqual({ ...firstLegEnd, legIndex: 1, waypointIndex: 1,
      phase: "approaching", waitReason: null, lastProgressAtTick: tick, nextReassessmentAtTick: tick });
    const nextSegment = residentTravelSegment(world, contract, next)!;
    expect(nextSegment.start).toEqual(segment.end);
    expect(residentTravelSegmentOffset(nextSegment, segment.end)).toBe(0);
    expect(residentTravelLocation(nextSegment, next, segment.end)).toEqual({
      kind: "route", routeId: routes[1]!.id, progress: nextSegment.reversed ? FIXED_POINT : 0,
    });
    expect(advanceResidentTravelWaypoint(world, contract, next, segment.end, tick)).toBe(next);
    expect(stableStringify({ world, contract, task: firstLegEnd })).toBe(before);
  });

  it("rejects a multileg join whose current next edge does not share the reached endpoint", () => {
    const { world, contract, task, routes } = itinerary(false, true);
    const final = { ...task, waypointIndex: routes[0]!.path.length - 1 };
    const segment = residentTravelSegment(world, contract, final)!;
    const second = routes[1]!;
    // Explicit malformed-route counterfactual, not an authored successful trip.
    second.path = second.path.slice(1);
    expect(advanceResidentTravelWaypoint(world, contract, final, segment.end, task.selectedAtTick + 1)).toBeNull();
  });
});

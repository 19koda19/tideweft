import { describe, expect, it } from "vitest";

import { adoptResidentActivities } from "../game/residentActivityExecution";
import { createActorObservation, createActorPerceptionState, stepActorPerception } from "./actorPerception";
import { describeAutonomousRoutePlan, findAutonomousRoutePlan } from "./network";
import { createWorld } from "./public";
import {
  replaceResidentActivity,
  RESIDENT_TRAVEL_ACTIVITY_OWNER_ID,
  RESIDENT_TRAVEL_ACTIVITY_VERSION,
  RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_OWNER_ID,
  RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION,
} from "./residentActivity";
import { canonicalResidentActivityForWorld, residentRestTargetHasDrySupport } from "./residentActivityWorld";
import { residentFamiliarDeparturePaths, residentObservedDepartureAlternative } from "./residentKnownRoutes";
import { residentRestSurfaceObservationId } from "./residentSurfaceKnowledge";
import { residentTravelSegment, residentTravelSegmentPose } from "./residentTravelRoute";
import type { ContractState } from "./types";
import { stableStringify } from "./util";

const BASE = createWorld("runtime baseline estuary", "wild");
const DEFAULT_ROUTES = [121, 117, 112, 106];
const DEFAULT_SETTLEMENTS = [5, 4, 3, 2, 1];
const FAMILIAR_ROUTES = [124, 119, 112, 106];
const FAMILIAR_SETTLEMENTS = [5, 6, 3, 2, 1];

/**
 * Explicit synthetic history/codec foundations over generated geography.
 * A fulfilled record and an arrived pickup pose below are arranged protocol
 * inputs, NOT enacted delivery, native automatic acceptance or physical arrival.
 * Plain-data cold clones do not prove a complete outer-session save/relaunch.
 */
function fixture() {
  const world = structuredClone(BASE);
  const tick = world.meta.completedTick;
  const contract = world.contracts.find(({ id }) => id === 127)!;
  expect(contract).toMatchObject({ originSettlementId: 5, destinationSettlementId: 1 });
  const selected = world.residents.find(({ location }) => location.kind === "settlement"
    && location.settlementId === contract.originSettlementId)!;
  Object.assign(contract, {
    status: "accepted", carrierKind: "resident", assignedResidentId: selected.id,
    createdTick: tick - 4, acceptedTick: tick - 2, cargoQuantity: 0,
    porterRouteIds: [...DEFAULT_ROUTES], porterSettlementIds: [...DEFAULT_SETTLEMENTS],
  });
  selected.activeContractId = contract.id;
  selected.intention = "carry";
  expect(adoptResidentActivities(world)).toBe(true);
  const defaultPlan = describeAutonomousRoutePlan(world, DEFAULT_ROUTES, DEFAULT_SETTLEMENTS);
  const segment = residentTravelSegment(world, contract, { contractId: contract.id, legIndex: 0, waypointIndex: 1 })!;
  const target = segment.start;
  expect(residentRestTargetHasDrySupport(world, target)).toBe(true);
  world.residents = world.residents.map((resident) => replaceResidentActivity(resident, {
    ...resident.activity!, version: RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION,
    ownerId: RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_OWNER_ID,
    inspectionTask: null, pickupTask: resident.id === selected.id ? {
      kind: "contract-pickup", contractId: contract.id, settlementId: contract.originSettlementId,
      target, selectedAtTick: tick - 1, lastProgressAtTick: tick,
      nextReassessmentAtTick: tick, phase: "arrived", waitReason: null,
    } : null,
    travelTask: null,
    poses: resident.id === selected.id ? [residentTravelSegmentPose(segment, 0)] : resident.activity!.poses,
  }));
  const resident = world.residents.find(({ id }) => id === selected.id)!;
  const history: ContractState = {
    ...contract, id: 100_000, status: "fulfilled", createdTick: tick - 20,
    acceptedTick: tick - 19, departedTick: tick - 18, arrivalTick: tick - 5,
    completedTick: tick - 4, deliveryCondition: 800_000, deliveryGrade: "weathered",
    porterRouteIds: [...FAMILIAR_ROUTES], porterSettlementIds: [...FAMILIAR_SETTLEMENTS],
  };
  world.contracts.push(history);
  expect(canonicalResidentActivityForWorld(world, resident)).not.toBeNull();
  const alternative = residentTravelSegment(world, { ...contract,
    porterRouteIds: [...FAMILIAR_ROUTES], porterSettlementIds: [...FAMILIAR_SETTLEMENTS],
  }, { contractId: contract.id, legIndex: 0, waypointIndex: 1 })!;
  expect(alternative.start).toEqual(segment.start);
  expect(alternative.end).not.toEqual(segment.end);
  return { world, resident, contract, history, defaultPlan, segment, alternative, tick };
}

type Fixture = ReturnType<typeof fixture>;

function inform(current: Fixture, facts: "both" | "wet-only" | "dry-only" | "stale" = "both") {
  const observedTick = current.tick - (facts === "stale" ? 1 : 0);
  const observations = [
    ...(facts === "dry-only" ? [] : [{ target: current.segment.end, perceivedClass: "water-covered-ground" }]),
    ...(facts === "wet-only" ? [] : [{ target: current.alternative.end, perceivedClass: "dry-ground" }]),
  ].map(({ target, perceivedClass }) => {
    const observation = createActorObservation({
      id: residentRestSurfaceObservationId(current.resident.identity.stableId, target),
      observerId: current.resident.identity.stableId, observedAtTick: observedTick,
      channel: "vision", perceivedClass, subjectId: null, identification: "classified",
      area: { center: target, radiusUnits: 0 }, confidence: 800_000, salience: 200_000,
      interrupt: "information",
    });
    if (observation === null) throw new Error("Synthetic surface input was rejected");
    return observation;
  });
  let perception = stepActorPerception(createActorPerceptionState(current.resident.identity.stableId, observedTick - 1), {
    tick: observedTick, observations,
  });
  if (facts === "stale" && perception !== null) perception = stepActorPerception(perception, { tick: current.tick, observations: [] });
  if (perception === null) throw new Error("Synthetic surface cognition was rejected");
  current.resident.perception = perception;
}

function choose(current: Fixture) {
  return residentObservedDepartureAlternative(current.world, current.resident, current.contract, current.defaultPlan, current.tick);
}

describe("own retained courier topology foundations", () => {
  it.each([false, true])("derives the exact whole itinerary reverse=%s without changing history or world", (reverse) => {
    const current = fixture();
    if (reverse) Object.assign(current.history, {
      originSettlementId: 1, destinationSettlementId: 5,
      porterRouteIds: [...FAMILIAR_ROUTES].reverse(), porterSettlementIds: [...FAMILIAR_SETTLEMENTS].reverse(),
    });
    const before = stableStringify(current.world);
    const paths = residentFamiliarDeparturePaths(current.world, current.resident, current.contract, current.tick);
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatchObject({ historyContractId: current.history.id,
      routeIds: FAMILIAR_ROUTES, settlementIds: FAMILIAR_SETTLEMENTS,
      firstSegment: { start: current.segment.start, end: current.alternative.end, directionX: -1, directionY: 0 } });
    expect(Object.isFrozen(paths)).toBe(true);
    expect(Object.isFrozen(paths[0])).toBe(true);
    expect(Object.isFrozen(paths[0]!.routeIds)).toBe(true);
    expect(Object.isFrozen(paths[0]!.settlementIds)).toBe(true);
    expect(stableStringify(current.world)).toBe(before);
  });

  it.each([
    ["another courier", (history: ContractState) => { history.assignedResidentId! += 1; }],
    ["player work", (history: ContractState) => { history.carrierKind = "player"; }],
    ["unfinished work", (history: ContractState) => { history.status = "in-transit"; }],
    ["retained cargo", (history: ContractState) => { history.cargoQuantity = 1; }],
    ["not yet completed", (history: ContractState, current: Fixture) => { history.completedTick = current.tick; }],
    ["missing departure", (history: ContractState) => { history.departedTick = null; }],
    ["impossible timing", (history: ContractState) => { history.acceptedTick = history.departedTick; }],
    ["zero-duration work", (history: ContractState) => { history.completedTick = history.departedTick; }],
    ["acceptance before creation", (history: ContractState) => { history.createdTick = history.acceptedTick! + 1; }],
    ["different destination", (history: ContractState) => { history.destinationSettlementId = 2; }],
    ["disconnected itinerary", (history: ContractState) => { history.porterRouteIds[1] = 121; }],
    ["repeated route", (history: ContractState) => { history.porterRouteIds[1] = history.porterRouteIds[0]!; }],
    ["missing route", (history: ContractState) => { history.porterRouteIds[0] = 999_999; }],
  ] as const)("does not invent familiarity from %s", (_label, alter) => {
    const current = fixture();
    alter(current.history, current);
    const before = stableStringify(current.world);
    expect(residentFamiliarDeparturePaths(current.world, current.resident, current.contract, current.tick)).toEqual([]);
    expect(stableStringify(current.world)).toBe(before);
  });

  it("orders newest own completion then ID, deduplicates first supports and forgets pruned evidence", () => {
    const current = fixture();
    const newer = { ...current.history, id: current.history.id + 2, completedTick: current.tick - 1 };
    const equalEarlierId = { ...newer, id: newer.id - 1 };
    const distinct = { ...newer, id: newer.id + 1,
      porterRouteIds: [...DEFAULT_ROUTES], porterSettlementIds: [...DEFAULT_SETTLEMENTS] };
    current.world.contracts.push(newer, distinct, equalEarlierId);
    const paths = residentFamiliarDeparturePaths(current.world, current.resident, current.contract, current.tick);
    expect(paths.map(({ historyContractId }) => historyContractId)).toEqual([equalEarlierId.id, distinct.id]);
    expect(paths.length).toBeLessThanOrEqual(4);
    const clone = structuredClone(current.world);
    expect(residentFamiliarDeparturePaths(clone, clone.residents.find(({ id }) => id === current.resident.id)!,
      clone.contracts.find(({ id }) => id === current.contract.id)!, current.tick)).toEqual(paths);
    current.world.contracts = current.world.contracts.filter(({ status }) => status !== "fulfilled");
    expect(residentFamiliarDeparturePaths(current.world, current.resident, current.contract, current.tick)).toEqual([]);
  });

  it("requires the current accepted zero-cargo commitment at its origin", () => {
    for (const alter of [
      (current: Fixture) => { current.contract.status = "in-transit"; },
      (current: Fixture) => { current.contract.cargoQuantity = 1; },
      (current: Fixture) => { current.resident.activeContractId = null; },
      (current: Fixture) => { current.resident.location = { kind: "settlement", settlementId: 4 }; },
    ]) {
      const current = fixture();
      alter(current);
      expect(residentFamiliarDeparturePaths(current.world, current.resident, current.contract, current.tick)).toEqual([]);
    }
  });
});

describe("origin-only informed choice foundations", () => {
  it("chooses own familiar topology only with fresh wet-default and dry-alternative facts", () => {
    const current = fixture();
    inform(current);
    expect(residentRestTargetHasDrySupport(current.world, current.alternative.end)).toBe(true);
    const before = stableStringify(current.world);
    expect(choose(current)).toMatchObject({ historyContractId: current.history.id,
      routeIds: FAMILIAR_ROUTES, settlementIds: FAMILIAR_SETTLEMENTS });
    const cold = structuredClone(current.world);
    expect(residentObservedDepartureAlternative(cold, cold.residents.find(({ id }) => id === current.resident.id)!,
      cold.contracts.find(({ id }) => id === current.contract.id)!, structuredClone(current.defaultPlan), current.tick))
      .toEqual(choose(current));
    expect(stableStringify(current.world)).toBe(before);
  });

  it.each(["none", "wet-only", "dry-only", "stale"] as const)("leaves choice unknown without complete fresh %s knowledge", (facts) => {
    const current = fixture();
    if (facts !== "none") inform(current, facts);
    expect(choose(current)).toBeNull();
  });

  it("rebinds the wet fact to the actual commit plan rather than the earlier sampled route", () => {
    const current = fixture();
    inform(current);
    const changedPlan = describeAutonomousRoutePlan(current.world, FAMILIAR_ROUTES, FAMILIAR_SETTLEMENTS);
    expect(residentObservedDepartureAlternative(current.world, current.resident, current.contract, changedPlan, current.tick)).toBeNull();
  });

  it.each(["wet support", "inactive first route", "storm-closed first route", "pruned history"] as const)("does not mistake familiarity for %s permission", (cause) => {
    const current = fixture();
    inform(current);
    if (cause === "wet support") {
      const index = Math.floor(current.alternative.end.localY / 1_000) * current.world.terrain.width
        + Math.floor(current.alternative.end.localX / 1_000);
      current.world.terrain.tiles[index]!.elevation = current.world.tide.level - 1;
    } else if (cause === "inactive first route") current.alternative.route.traceStrength = 0;
    else if (cause === "storm-closed first route") {
      current.world.weather = { ...current.world.weather, kind: "storm", intensity: 900_000 };
      current.alternative.route.condition = 500_000;
      current.alternative.route.reliability = 200_000;
    }
    else current.world.contracts = current.world.contracts.filter(({ id }) => id !== current.history.id);
    expect(choose(current)).toBeNull();
  });

  it("retains unknown remote safety rather than requiring or inventing it from history", () => {
    const current = fixture();
    inform(current);
    const remoteRoute = current.world.routes.find(({ id }) => id === FAMILIAR_ROUTES[1])!;
    remoteRoute.traceStrength = 0;
    expect(choose(current)?.routeIds).toEqual(FAMILIAR_ROUTES);
    expect(current.resident.perception.beliefs).toHaveLength(2);
    expect(current.resident.perception.beliefs.every(({ area }) => (
      stableStringify(area.center) === stableStringify(current.segment.end)
      || stableStringify(area.center) === stableStringify(current.alternative.end)
    ))).toBe(true);
  });

  it.each(["v7", "partial interval", "unarrived", "foreign perception", "malformed body"] as const)("rejects %s without mutating route or custody", (kind) => {
    const current = fixture();
    inform(current);
    const activity = current.resident.activity!;
    if (kind === "v7") current.resident.activity = { ...activity,
      version: RESIDENT_TRAVEL_ACTIVITY_VERSION, ownerId: RESIDENT_TRAVEL_ACTIVITY_OWNER_ID };
    if (kind === "partial interval") current.resident.activity = { ...activity, poses: [activity.poses[0]!, activity.poses[0]!] };
    if (kind === "unarrived") current.resident.activity = { ...activity,
      pickupTask: { ...activity.pickupTask!, phase: "approaching" } };
    if (kind === "foreign perception") current.resident.perception = createActorPerceptionState("human:foreign-route-reader", current.tick);
    if (kind === "malformed body") current.resident.activity = { ...activity, actorId: "human:foreign-route-body" };
    const before = stableStringify(current.world);
    expect(choose(current)).toBeNull();
    expect(stableStringify(current.world)).toBe(before);
  });
});

describe("chosen itinerary estimates", () => {
  it("reuses actual network costs after selection and rejects disconnected plans without mutating authority", () => {
    const current = fixture();
    const plan = findAutonomousRoutePlan(current.world, 5, 1)!;
    const before = stableStringify(current.world);
    expect(describeAutonomousRoutePlan(current.world, plan.routeIds, plan.settlementIds)).toEqual(plan);
    for (const [routes, settlements] of [
      [[], [5]], [[999_999], [5, 1]], [[121, 121], [5, 4, 5]],
      [[121, 119], [5, 4, 3]], [[121], [5, 4, 3]],
    ]) expect(() => describeAutonomousRoutePlan(current.world, routes!, settlements!)).toThrow("Selected porter itinerary is unavailable");
    expect(stableStringify(current.world)).toBe(before);
  });
});

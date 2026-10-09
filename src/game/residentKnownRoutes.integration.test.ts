import { describe, expect, it } from "vitest";
import { assertWorldInvariants, createWorld, createWorldView, deserializeWorld, serializeWorld, stepWorld } from "../sim/public";
import { findAutonomousRoutePlan } from "../sim/network";
import { replaceResidentActivity, RESIDENT_TRAVEL_ACTIVITY_OWNER_ID, RESIDENT_TRAVEL_ACTIVITY_VERSION, RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_OWNER_ID, RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION } from "../sim/residentActivity";
import { residentAcceptedPickupBinding } from "../sim/residentActivityWorld";
import { prepareResidentTravelAdvance, revokeResidentTravelAdvance } from "../sim/residentTravelAdvance";
import { residentTravelSegment } from "../sim/residentTravelRoute";
import { MAX_TIDE_LEVEL } from "../sim/terrain";
import { FIXED_POINT, type WorldState } from "../sim/types";
import { stableStringify } from "../sim/util";
import { collectExistingHumanObservations, humanObservationCollectionRejected } from "./humanPerception";
import { headingFromRadians } from "./livingActor";
import { adoptResidentActivities } from "./residentActivityExecution";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import { workingPeopleExpressionIntent } from "./workingPeopleExpression";

const WINDOW = { origin: { x: -10, y: -10 }, terrain: { width: 120, height: 120 } };

// Adapter foundations, not native autonomous trips or normal controls. Native
// identities/route geometry and finite stock are kept; accepted pickup, past
// fulfilled experience, body/gaze and contrasting surfaces are arranged. The
// source query, knowledge admission, chosen departure and Voice are production.
function fixture() {
  const world = createWorld("runtime baseline estuary", "standard");
  const tick = world.meta.completedTick;
  world.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: tick + 1_000 };
  for (const tile of world.terrain.tiles) Object.assign(tile, {
    terrain: "meadow", elevation: MAX_TIDE_LEVEL + 1, roughness: 0,
  });
  for (const resident of world.residents) {
    resident.needs = { food: 100_000, rest: 100_000, belonging: 100_000 };
    resident.condition.exhaustion = 100_000;
  }
  for (const contract of world.contracts) {
    contract.playerExclusiveUntilTick = tick + 1_000;
    contract.dueTick = tick + 2_000;
  }
  const route = (a: number, b: number) => world.routes.find((candidate) =>
    candidate.fromSettlementId === Math.min(a, b) && candidate.toSettlementId === Math.max(a, b))!;
  // An arranged active chord is not an earned player reinforcement witness.
  route(1, 3).traceStrength = FIXED_POINT;
  const selected = world.residents.find((resident) => resident.location.kind === "settlement"
    && resident.location.settlementId === 2)!;
  const contract = world.contracts[0]!;
  Object.assign(contract, { originSettlementId: 2, destinationSettlementId: 1,
    requesterResidentId: world.settlements.find(({ id }) => id === 1)!.residentIds[0]!,
    routeId: route(1, 2).id, resource: "parts", quantity: 1,
    status: "accepted", carrierKind: "resident", assignedResidentId: selected.id,
    createdTick: tick - 3, playerExclusiveUntilTick: tick - 3, acceptedTick: tick - 1,
    porterRouteIds: [route(1, 2).id], porterSettlementIds: [2, 1],
  });
  selected.activeContractId = contract.id;
  selected.intention = "carry";
  const history = world.contracts[1]!;
  Object.assign(history, { ...contract, id: history.id, status: "fulfilled",
    acceptedTick: tick - 3, departedTick: tick - 2, arrivalTick: tick - 1, completedTick: tick - 1,
    deliveryCondition: FIXED_POINT, deliveryGrade: "pristine", deliveryTraceCost: 0,
    porterRouteIds: [route(2, 3).id, route(1, 3).id], porterSettlementIds: [2, 3, 1],
  });
  expect(adoptResidentActivities(world)).toBe(true);
  const binding = residentAcceptedPickupBinding(world, selected)!;
  const pose = { position: binding.target, heading: headingFromRadians(3 * Math.PI / 4) };
  world.residents = world.residents.map((resident) => replaceResidentActivity(resident, {
    ...resident.activity!, version: RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION, ownerId: RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_OWNER_ID,
    restTask: null, rationTask: null, materialTask: null, inspectionTask: null, travelTask: null,
    poses: Array.from({ length: 11 }, () => resident.id === selected.id ? pose : resident.activity!.poses[0]!),
    pickupTask: resident.id === selected.id ? { kind: "contract-pickup", contractId: contract.id,
      settlementId: 2, target: binding.target, selectedAtTick: tick, lastProgressAtTick: tick,
      nextReassessmentAtTick: tick, phase: "arrived", waitReason: null } : null,
  }));
  const primary = residentTravelSegment(world, contract, { contractId: contract.id, legIndex: 0, waypointIndex: 1 })!;
  const familiar = residentTravelSegment(world, { ...contract,
    porterRouteIds: history.porterRouteIds, porterSettlementIds: history.porterSettlementIds,
  }, { contractId: contract.id, legIndex: 0, waypointIndex: 1 })!;
  expect(primary.end).not.toEqual(familiar.end);
  const primaryIndex = Math.floor(primary.end.localY / 1_000) * world.terrain.width + Math.floor(primary.end.localX / 1_000);
  Object.assign(world.terrain.tiles[primaryIndex]!, { terrain: "deep-water", elevation: 0 });
  assertWorldInvariants(world);
  return { world, actorId: selected.identity.stableId, contractId: contract.id, historyId: history.id, primary, familiar, pose };
}

function source(world: WorldState) {
  const window = createRegionalTerrainWindow(world.meta.rootSeed,
    createTerrainRegionStreamingState({ rootSeed: world.meta.rootSeed }), WINDOW.origin);
  const view = createRegionalWorldView(createWorldView(world), window,
    projectRegionalCartographyWindow(createRegionalCartography(world.meta.rootSeed), window));
  const before = stableStringify(world);
  const targetTick = world.meta.completedTick + 1;
  const batches = collectExistingHumanObservations({ world: view, window, targetTick, playerSamples: [] });
  expect(stableStringify(world)).toBe(before);
  return { batches, targetTick };
}

function closing(world: WorldState, actorId: string) {
  const { batches, targetTick } = source(world);
  expect(humanObservationCollectionRejected(batches)).toBe(false);
  const observations = batches.find(({ observerId }) => observerId === actorId)!.observations;
  const admission = prepareResidentTravelAdvance(world, WINDOW);
  expect(admission).not.toBeNull();
  try {
    stepWorld(world, [], { tick: targetTick, residents: batches.map((batch) => ({
      residentId: batch.residentId, actorId: batch.observerId, observations: batch.observations,
    })) }, undefined, admission!);
  } finally { revokeResidentTravelAdvance(admission!); }
  assertWorldInvariants(world);
  return observations;
}

describe("source-bound familiar predeparture adapter integration", () => {
  it.each(["wrong-settlement", "pre-acceptance-selection"] as const)("rejects %s pickup facts without source correction", (cause) => {
    const current = fixture();
    current.world.residents = current.world.residents.map((resident) => {
      if (resident.identity.stableId !== current.actorId) return resident;
      const activity = resident.activity!;
      const pickup = activity.pickupTask!;
      // Hostile plain input deliberately bypasses the trusted replacement
      // factory, which already refuses inconsistent settlement membership.
      return { ...resident, activity: { ...activity, pickupTask: { ...pickup,
        ...(cause === "wrong-settlement" ? { settlementId: 3 } : { selectedAtTick: pickup.selectedAtTick - 2 }),
      } } };
    });
    expect(humanObservationCollectionRejected(source(current.world).batches)).toBe(true);
  });

  it("sees two lawful entrances and chooses before the one conserved, Voice-bound departure with exact cold work", () => {
    const current = fixture();
    const saved = serializeWorld(current.world);
    const cold = deserializeWorld(saved);
    const defaultPlan = findAutonomousRoutePlan(current.world, 2, 1)!;
    expect(defaultPlan.routeIds).toEqual([current.primary.route.id]);
    const origin = current.world.settlements.find(({ id }) => id === 2)!;
    const stock = origin.inventory.parts;
    const observations = closing(current.world, current.actorId);
    expect(observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ perceivedClass: "water-covered-ground", interrupt: "information",
        area: { center: current.primary.end, radiusUnits: 0 } }),
      expect.objectContaining({ perceivedClass: "dry-ground", interrupt: "information",
        area: { center: current.familiar.end, radiusUnits: 0 } }),
    ]));
    const contract = current.world.contracts.find(({ id }) => id === current.contractId)!;
    const history = current.world.contracts.find(({ id }) => id === current.historyId)!;
    expect(contract).toMatchObject({ status: "in-transit", cargoQuantity: 1,
      porterRouteIds: history.porterRouteIds, porterSettlementIds: history.porterSettlementIds });
    expect(origin.inventory.parts).toBe(stock - 1);
    const resident = current.world.residents.find(({ identity }) => identity.stableId === current.actorId)!;
    expect(resident.activity?.poses[0]?.position).toEqual(current.pose.position);
    expect(resident.activity?.travelTask).toMatchObject({ mode: "physical", legIndex: 0, waypointIndex: 1 });
    const event = current.world.events.find(({ type, subjectId }) => type === "contract-departed" && subjectId === current.contractId)!;
    expect(event.data.routeHops).toBe(history.porterRouteIds.length);
    expect(workingPeopleExpressionIntent({ world: createWorldView(current.world), event })).not.toBeNull();
    expect(current.world.events.filter(({ type, subjectId }) => type === "contract-departed" && subjectId === current.contractId)).toHaveLength(1);
    expect(closing(cold, current.actorId)).toEqual(observations);
    expect(serializeWorld(cold)).toBe(serializeWorld(current.world));
    const consumed = deserializeWorld(serializeWorld(current.world));
    expect(serializeWorld(consumed)).toBe(serializeWorld(current.world));
  });

  it.each(["forgotten", "unseen", "changed-support", "frozen-v7"] as const)("does not invent an alternative for %s evidence", (cause) => {
    const current = fixture();
    if (cause === "forgotten") current.world.contracts = current.world.contracts.filter(({ id }) => id !== current.historyId);
    if (cause === "unseen") current.world.residents = current.world.residents.map((resident) => resident.identity.stableId === current.actorId
      ? replaceResidentActivity(resident, { ...resident.activity!, poses: resident.activity!.poses.map((pose) => ({ ...pose, heading: 0 })) })
      : resident);
    if (cause === "changed-support") {
      const end = current.familiar.end;
      const index = Math.floor(end.localY / 1_000) * current.world.terrain.width + Math.floor(end.localX / 1_000);
      Object.assign(current.world.terrain.tiles[index]!, { terrain: "deep-water", elevation: 0 });
    }
    if (cause === "frozen-v7") current.world.residents = current.world.residents.map((resident) => replaceResidentActivity(resident, {
      ...resident.activity!, version: RESIDENT_TRAVEL_ACTIVITY_VERSION, ownerId: RESIDENT_TRAVEL_ACTIVITY_OWNER_ID,
    }));
    const observations = closing(current.world, current.actorId);
    if (cause === "forgotten" || cause === "unseen" || cause === "frozen-v7") expect(observations).toHaveLength(0);
    expect(current.world.contracts.find(({ id }) => id === current.contractId)!.porterRouteIds).toEqual([current.primary.route.id]);
  });
});

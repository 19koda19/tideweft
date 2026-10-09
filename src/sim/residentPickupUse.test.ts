import { describe, expect, it, vi } from "vitest";

import { createCoreEcologyAggregatePatch } from "../game/coreEcology";
import { deriveCoreEcologyHarborEdgeHabitatAssemblage } from "../game/coreEcologyHabitat";
import {
  adoptResidentActivities,
  advanceResidentRestActivities,
  prepareResidentRestActivities,
} from "../game/residentActivityExecution";
import { resolveResidentWorldPlacement } from "../game/residentSpatial";
import { createSettlementEcologyState } from "../game/settlementEcology";
import { worldPositionDelta } from "../game/worldPosition";
import type { LivingActorInteractionWindow } from "../game/livingActorSimulation";
import { createActorObservation, type ActorObservation } from "./actorPerception";
import {
  assertWorldInvariants,
  createWorld,
  deserializeWorld,
  serializeWorld,
  stepWorld,
  type ResidentPerceptionFrame,
} from "./public";
import { createRegionCoord } from "./regions";
import {
  RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION,
  replaceResidentActivity,
  type ResidentActivity,
} from "./residentActivity";
import { residentAcceptedPickupBinding, residentRestTargetHasDrySupport, residentSettlementRestTarget } from "./residentActivityWorld";
import { prepareResidentRationUse, revokeResidentRationUse } from "./residentRationUse";
import { prepareResidentTravelAdvance, residentTravelStepUnits, revokeResidentTravelAdvance } from "./residentTravelAdvance";
import { residentTravelLocation, residentTravelSegment, residentTravelSegmentOffset, residentTravelSegmentPose } from "./residentTravelRoute";
import * as residentTravelRoute from "./residentTravelRoute";
import { FIXED_POINT, RESOURCE_KINDS, type ResidentState, type ResourceKind, type WorldState } from "./types";
import { stableStringify } from "./util";
import { currentInventoryTotals } from "./world";

// Lower-engine/production-adapter integration only, not runtime autonomy or an
// acoustic producer witness. Native stock, offer, automatic assignment, terrain,
// body, approach and arrival are preserved. The sensory contrasts below are
// explicit trusted lower-frame fixtures; they do not establish real audibility.
const BASE = createWorld("runtime baseline estuary", "wild");
const habitat = deriveCoreEcologyHarborEdgeHabitatAssemblage({
  rootSeed: BASE.meta.rootSeed, originRegion: createRegionCoord(0, 0),
});
const PATCH = createCoreEcologyAggregatePatch({
  seed: BASE.meta.rootSeed, patchKey: "resident-pickup-use:v1", originRegion: createRegionCoord(0, 0),
  tick: BASE.meta.completedTick,
  populations: habitat.populations.flatMap((population) => (
    population.representation !== "individual-representatives" || population.populationUnits === 0
      ? []
      : [{
          species: population.species, populationKey: population.populationKey,
          populationSize: population.populationUnits,
          members: population.allocations.map((allocation) => ({
            populationOrdinal: allocation.allocationOrdinal, representedUnits: allocation.representedUnits,
            position: allocation.position, materialization: "coarse" as const,
          })),
        }]
  )),
  derivation: { kind: "habitat-v2", habitat },
});

function residentAt(world: WorldState, actorId: string): ResidentState {
  const resident = world.residents.find(({ identity }) => identity.stableId === actorId);
  if (resident === undefined) throw new Error("Native pickup use fixture lost its resident");
  return resident;
}

function arrivedFixture() {
  const world = structuredClone(BASE);
  const initialTick = world.meta.completedTick;
  world.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: initialTick + 1_000 };
  for (const resident of world.residents) {
    // Keep ordinary civic work from first moving the courier to the center.
    // The actual accepted Promise then supplies the existing active priority.
    resident.needs = { food: 100_000, rest: 100_000, belonging: 900_000 };
    resident.condition.exhaustion = 100_000;
  }
  const contract = world.contracts.find(({ id }) => id === 127);
  if (contract === undefined) throw new Error("Native estuary offer127 is absent");
  expect(contract).toMatchObject({ status: "offered", carrierKind: null, assignedResidentId: null,
    originSettlementId: 5, destinationSettlementId: 1, resource: "parts", quantity: 8, cargoQuantity: 0 });
  contract.playerExclusiveUntilTick = initialTick;
  const origin = world.settlements.find(({ id }) => id === contract.originSettlementId)!;
  const stock = origin.inventory[contract.resource];
  expect(stock).toBeGreaterThanOrEqual(contract.quantity);
  assertWorldInvariants(world);

  stepWorld(world);
  expect(contract).toMatchObject({ status: "accepted", acceptedTick: initialTick + 1,
    carrierKind: "resident", cargoQuantity: 0, departedTick: null });
  if (contract.assignedResidentId === null) throw new Error("Native engine did not assign the offered Promise");
  const chosen = world.residents.find(({ id }) => id === contract.assignedResidentId)!;
  const actorId = chosen.identity.stableId;
  const source = resolveResidentWorldPlacement(world, chosen)?.position;
  const binding = residentAcceptedPickupBinding(world, chosen);
  if (source === undefined || binding === null) throw new Error("Native accepted courier lacks origin geometry");
  expect(residentRestTargetHasDrySupport(world, source)).toBe(true);
  expect(residentRestTargetHasDrySupport(world, binding.target)).toBe(true);
  expect(worldPositionDelta(source, binding.target)).not.toEqual({ x: 0, y: 0 });

  // A real separately owned store is only the current phase-zero capability
  // input. Empty keeper knowledge creates no inspection cause or arrival.
  const store = createSettlementEcologyState({
    rootSeed: world.meta.rootSeed, settlementId: chosen.homeSettlementId,
    keeperActorId: actorId, position: binding.target, aggregatePatch: PATCH,
  });
  expect(adoptResidentActivities(world)).toBe(true);
  expect(prepareResidentRestActivities(world, [], store)).toBe(true);
  expect(residentAt(world, actorId).activity).toMatchObject({ version: RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION,
    pickupTask: { contractId: contract.id, phase: "approaching", target: binding.target } });
  let moved = false;
  for (let phase = 1; phase <= 10; phase += 1) {
    const result = advanceResidentRestActivities(world, phase);
    expect(result).not.toBeNull();
    moved ||= result?.movedActorIds.includes(actorId) ?? false;
    expect(origin.inventory[contract.resource]).toBe(stock);
    expect(contract.cargoQuantity).toBe(0);
  }
  const arrived = residentAt(world, actorId);
  expect(moved).toBe(true);
  expect(arrived.activity?.pickupTask).toMatchObject({ contractId: contract.id, phase: "arrived" });
  expect(arrived.activity?.poses).toHaveLength(11);
  expect(arrived.activity?.poses.at(-1)?.position).toEqual(binding.target);
  expect(arrived.circadian?.posture.state).toBe("awake");
  assertWorldInvariants(world);
  return { world, actorId, contract, origin, stock, target: binding.target, store };
}

function sensoryFrame(
  world: WorldState,
  actorId: string,
  interrupt: "strong" | "none",
  salience: number,
): { frame: ResidentPerceptionFrame; observation: ActorObservation } {
  const resident = residentAt(world, actorId);
  const targetTick = world.meta.completedTick + 1;
  const position = resident.activity!.poses.at(-1)!.position;
  const observation = createActorObservation({
    id: `pickup-use:${actorId}:${targetTick}:${interrupt}:${salience}`,
    observerId: actorId, observedAtTick: targetTick,
    channel: "hearing", perceivedClass: "physical-thud", subjectId: null,
    area: { center: position, radiusUnits: 1_000 },
    confidence: 1_000_000, salience, identification: "anonymous", interrupt,
  });
  if (observation === null) throw new Error("Pickup sensory contract fixture is malformed");
  return {
    observation,
    frame: {
      tick: targetTick,
      residents: world.residents.map((candidate) => ({
        residentId: candidate.id, actorId: candidate.identity.stableId,
        observations: candidate.identity.stableId === actorId ? [observation] : [],
      })),
    },
  };
}

function closeCurrentInterval(world: WorldState, frame?: ResidentPerceptionFrame): WorldState {
  const admission = prepareResidentTravelAdvance(world, null);
  expect(admission).not.toBeNull();
  try {
    return stepWorld(world, [], frame, undefined, admission!);
  } finally {
    revokeResidentTravelAdvance(admission!);
  }
}

describe("resident origin pickup commit-time eligibility", () => {
  it("admits fresh strong perception before debit and preserves the arrived body without creating cargo", () => {
    const current = arrivedFixture();
    const { world, actorId, contract, origin, stock, target, store } = current;
    const sensitivity = residentAt(world, actorId).circadian!.policy.wakeSensitivity;
    const { frame, observation } = sensoryFrame(world, actorId, "strong", sensitivity);
    const targetTick = world.meta.completedTick + 1;
    closeCurrentInterval(world, frame);
    const observed = residentAt(world, actorId);
    expect(observed.perception.beliefs).toEqual(expect.arrayContaining([expect.objectContaining({
      sourceObservationId: observation.id, lastObservedTick: targetTick,
      strongInterrupt: true, salience: sensitivity, subjectId: null,
    })]));
    expect(contract).toMatchObject({ status: "accepted", cargoQuantity: 0, departedTick: null, arrivalTick: null });
    expect(origin.inventory[contract.resource]).toBe(stock);
    expect(observed.activity?.poses.at(-1)?.position).toEqual(target);
    expect(world.events.filter(({ type, subjectId }) => type === "contract-departed" && subjectId === contract.id)).toHaveLength(0);
    // The actual routine owner subsequently interrupts the selected action;
    // the lower commit must not have spent its stock first.
    expect(prepareResidentRestActivities(world, [], store)).toBe(true);
    expect(residentAt(world, actorId).circadian?.posture.state).toBe("startled");
    expect(residentAt(world, actorId).activity?.pickupTask).toBeNull();
    assertWorldInvariants(world);
  });

  it.each(["weak-strong", "neutral"] as const)("retains admitted %s perception and performs exactly the existing stock-to-cargo transfer", (kind) => {
    const { world, actorId, contract, origin, stock } = arrivedFixture();
    const sensitivity = residentAt(world, actorId).circadian!.policy.wakeSensitivity;
    const { frame, observation } = sensoryFrame(world, actorId,
      kind === "weak-strong" ? "strong" : "none", kind === "weak-strong" ? sensitivity - 1 : sensitivity);
    const ledger = structuredClone(world.ledger);
    closeCurrentInterval(world, frame);
    expect(residentAt(world, actorId).perception.beliefs.some(({ sourceObservationId }) => sourceObservationId === observation.id)).toBe(true);
    expect(contract).toMatchObject({ status: "in-transit", cargoQuantity: contract.quantity,
      departedTick: world.meta.completedTick });
    expect(origin.inventory[contract.resource]).toBe(stock - contract.quantity);
    expect(world.ledger).toEqual(ledger);
    expect(residentAt(world, actorId).activity?.pickupTask).toBeNull();
    expect(world.events.filter(({ type, subjectId }) => type === "contract-departed" && subjectId === contract.id)).toHaveLength(1);
    assertWorldInvariants(world);
  });

  it("does not timer-pick up a current-capability contract after its actual task is explicitly revoked", () => {
    const { world, actorId, contract, origin, stock, target } = arrivedFixture();
    const index = world.residents.findIndex(({ identity }) => identity.stableId === actorId);
    const resident = world.residents[index]!;
    world.residents[index] = replaceResidentActivity(resident, { ...resident.activity!, pickupTask: null });
    closeCurrentInterval(world);
    expect(contract).toMatchObject({ status: "accepted", cargoQuantity: 0, departedTick: null });
    expect(origin.inventory[contract.resource]).toBe(stock);
    expect(residentAt(world, actorId).activity?.poses.at(-1)?.position).toEqual(target);
    expect(world.events.filter(({ type, subjectId }) => type === "contract-departed" && subjectId === contract.id)).toHaveLength(0);
    assertWorldInvariants(world);
  });

  it("rejects a missing required pickup field before any world or stock mutation", () => {
    const { world, actorId, contract, origin, stock } = arrivedFixture();
    const resident = residentAt(world, actorId);
    const { pickupTask: _removed, ...malformed } = resident.activity!;
    // Deliberate malformed cold-shape contrast, never a successful action fixture.
    resident.activity = malformed as ResidentActivity;
    const before = stableStringify(world);
    // The malformed source cannot acquire the current closing capability at all;
    // calling the engine without it must fail before any command or debit.
    expect(prepareResidentTravelAdvance(world, null)).toBeNull();
    expect(() => stepWorld(world)).toThrow(/exact closing travel admission/u);
    expect(stableStringify(world)).toBe(before);
    expect(origin.inventory[contract.resource]).toBe(stock);
    expect(contract.cargoQuantity).toBe(0);
  });
});

describe("native conserved multi-leg coarse logistics foundation", () => {
  it("continues one native four-leg pickup through three exact joins and handoff with equal cloned and saved work", () => {
    const { world, actorId, contract, origin, stock, target, store } = arrivedFixture();
    closeCurrentInterval(world);
    expect(contract).toMatchObject({ status: "in-transit", cargoQuantity: 8, departedTick: 422,
      porterRouteIds: [121, 117, 112, 106], porterSettlementIds: [5, 4, 3, 2, 1] });
    expect(origin.inventory.parts).toBe(stock - 8);
    expect(residentAt(world, actorId).activity?.poses[0]?.position).toEqual(target);
    expect(world.events.filter(({ type, subjectId }) => type === "contract-departed" && subjectId === contract.id)).toHaveLength(1);

    const paths = contract.porterRouteIds.map((id, legIndex) => {
      const route = world.routes.find((candidate) => candidate.id === id)!;
      const from = contract.porterSettlementIds[legIndex]!;
      const to = contract.porterSettlementIds[legIndex + 1]!;
      expect([route.fromSettlementId, route.toSettlementId]).toEqual([Math.min(from, to), Math.max(from, to)]);
      const path = route.fromSettlementId === from ? [...route.path] : [...route.path].reverse();
      expect(path[0]).toBe(world.settlements.find((settlement) => settlement.id === from)!.tileIndex);
      expect(path.at(-1)).toBe(world.settlements.find((settlement) => settlement.id === to)!.tileIndex);
      return path;
    });
    for (let leg = 1; leg < paths.length; leg += 1) expect(paths[leg - 1]!.at(-1)).toBe(paths[leg]![0]);
    const lengths = paths.map((path) => (path.length - 1) * 1_000);
    const totalDistance = lengths.reduce((sum, length) => sum + length, 0);
    const allowance = residentTravelStepUnits(residentAt(world, actorId).activity!, contract);
    expect(allowance).toBe(89);
    const budget = allowance! * 10;
    const intervalBound = Math.ceil(totalDistance / budget) + 1;
    const dueTick = contract.dueTick;
    // Keep this native deadline unchanged. This witness proves actual paid
    // work and handoff; it does not arrange a separate overdue scenario.

    // FOUNDATION-ONLY admission: all existing humans have explicit neutral
    // duties; ten real fine samples precede an authenticated no-local-window
    // macro allowance. No runtime residency, surface receipt, gear, task,
    // arrival, stock, route or winner is authored to make this journey work.
    const closeServices = (current: WorldState, window: LivingActorInteractionWindow | null = null) => {
      const service = prepareResidentRationUse(current, current.residents.map(({ identity }) => ({
        actorId: identity.stableId, duty: null,
      })));
      const travel = prepareResidentTravelAdvance(current, window);
      expect(service).not.toBeNull();
      expect(travel).not.toBeNull();
      try { stepWorld(current, [], undefined, service!, travel!); }
      finally { revokeResidentRationUse(service!); revokeResidentTravelAdvance(travel!); }
    };
    const prepare = (current: WorldState) => expect(prepareResidentRestActivities(current, [], store)).toBe(true);
    const conserved = (current: WorldState) => {
      assertWorldInvariants(current);
      const totals = currentInventoryTotals(current);
      for (const resource of RESOURCE_KINDS) expect(totals[resource]).toBe(
        current.ledger.initial[resource] + current.ledger.produced[resource] - current.ledger.consumed[resource]);
    };
    const distance = (current: WorldState) => {
      const human = residentAt(current, actorId);
      const task = human.activity?.travelTask;
      if (task?.mode !== "physical") throw new Error("Native in-transit courier lost its physical cursor");
      const segment = residentTravelSegment(current, contract, task);
      const pose = human.activity!.poses.at(-1)!;
      const offset = segment === null ? null : residentTravelSegmentOffset(segment, pose.position);
      if (segment === null || offset === null) throw new Error("Native directed body is not on its actual itinerary edge");
      expect(human.location).toEqual(residentTravelLocation(segment, task, pose.position));
      return lengths.slice(0, task.legIndex).reduce((sum, length) => sum + length, 0)
        + (task.waypointIndex - 1) * 1_000 + offset;
    };
    const joins: { from: number; to: number; reversed: boolean }[] = [];
    let latestPaidPose: ReturnType<typeof residentTravelSegmentPose> | null = null;
    const originalWaypoint = residentTravelRoute.advanceResidentTravelWaypoint;
    const waypoint = vi.spyOn(residentTravelRoute, "advanceResidentTravelWaypoint").mockImplementation((...args) => {
      const next = originalWaypoint(...args);
      if (args[1].id === contract.id && next !== null) {
        const segment = residentTravelSegment(args[0], args[1], args[2]);
        const offset = segment === null ? null : residentTravelSegmentOffset(segment, args[3]);
        if (segment === null || offset === null) throw new Error("Actual macro work lost its source segment");
        latestPaidPose = residentTravelSegmentPose(segment, offset);
        if (next.legIndex !== args[2].legIndex) {
          const following = residentTravelSegment(args[0], args[1], next);
          expect(args[3]).toEqual(segment.end);
          expect(following?.start).toEqual(args[3]);
          joins.push({ from: args[2].legIndex, to: next.legIndex, reversed: segment.reversed });
        }
      }
      return next;
    });
    let phase4: string | null = null;
    let clone4: WorldState | null = null;
    let phase9: string | null = null;
    let suffixIntervals = 0;
    let terminalTick: number | null = null;
    prepare(world);
    try {
      for (let interval = 0; interval < intervalBound && terminalTick === null; interval += 1) {
        const beforeDistance = distance(world);
        const beforePose = structuredClone(residentAt(world, actorId).activity!.poses[0]!);
        const currentTask = residentAt(world, actorId).activity!.travelTask;
        const capture = phase9 === null && currentTask?.mode === "physical" && currentTask.legIndex === 1;
        for (let phase = 1; phase <= 10; phase += 1) {
          expect(advanceResidentRestActivities(world, phase)).not.toBeNull();
          expect(residentAt(world, actorId).activity?.poses.at(-1)).toEqual(beforePose);
          if (capture && phase === 4) {
            phase4 = serializeWorld(world);
            clone4 = structuredClone(world);
            expect(serializeWorld(clone4)).toBe(phase4);
            expect(serializeWorld(deserializeWorld(phase4))).toBe(phase4);
          }
          if (capture && phase === 9) {
            phase9 = serializeWorld(world);
            if (phase4 === null || clone4 === null) throw new Error("Native phase4 prefix was not retained");
            for (const cold of [clone4, deserializeWorld(phase4)]) {
              for (let phase = 5; phase <= 9; phase += 1) expect(advanceResidentRestActivities(cold, phase)).not.toBeNull();
              expect(serializeWorld(cold)).toBe(phase9);
            }
            expect(serializeWorld(structuredClone(world))).toBe(phase9);
            expect(serializeWorld(deserializeWorld(phase9))).toBe(phase9);
          }
        }
        // Clone only a potentially final closing input, not every fine step.
        const finalInput = totalDistance - beforeDistance <= budget ? structuredClone(world) : null;
        latestPaidPose = null;
        closeServices(world);
        if (phase9 !== null) suffixIntervals += 1;
        const afterDistance = contract.status === "fulfilled" ? totalDistance : distance(world);
        expect(afterDistance - beforeDistance).toBe(Math.min(budget, totalDistance - beforeDistance));
        expect(residentAt(world, actorId).activity?.poses[0]).toEqual(latestPaidPose);
        expect(residentAt(world, actorId).activity?.version).toBe(RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION);
        expect(world.events.filter(({ type, subjectId }) => type === "contract-departed" && subjectId === contract.id)).toHaveLength(1);
        conserved(world);
        if (contract.status !== "fulfilled") {
          expect(contract.cargoQuantity).toBe(8);
          expect(residentAt(world, actorId).activeContractId).toBe(contract.id);
          if (world.meta.completedTick > dueTick) {
            expect(contract.status).toBe("in-transit");
            expect(world.events.some(({ type, subjectId }) => subjectId === contract.id
              && (type === "contract-expired" || type === "contract-cancelled"))).toBe(false);
          }
          prepare(world);
          continue;
        }

        if (finalInput === null) throw new Error("Native handoff exceeded its actual paid final allowance");
        terminalTick = world.meta.completedTick;
        const firstSequence = finalInput.meta.nextEventSequence;
        const courierSource = residentAt(finalInput, actorId).activity!.poses.at(-1)!.position;
        // Same accepted closing input, but the genuine source is admitted
        // locally. Without fine movement it has no second macro permission.
        const control = structuredClone(finalInput);
        closeServices(control, { origin: { x: Math.floor(courierSource.localX / 1_000) - 1,
          y: Math.floor(courierSource.localY / 1_000) - 1 }, terrain: { width: 3, height: 3 } });
        expect(control.contracts.find(({ id }) => id === contract.id)).toMatchObject({ status: "in-transit", cargoQuantity: 8 });
        const receipts = (current: WorldState) => current.events.filter((event) => event.sequence >= firstSequence);
        const completed = world.events.filter(({ type, subjectId }) => type === "contract-fulfilled" && subjectId === contract.id);
        expect(completed).toHaveLength(1);
        const receipt = completed[0]!;
        expect(receipt.data).toMatchObject({ quantity: 8, resource: "parts", routeHops: 4,
          reinforcedRouteCount: 4, reinforcedRouteIds: "106,112,117,121", routeEvidence: "resident-route" });
        const credits = (current: WorldState, resource: ResourceKind, settlementId?: number) => receipts(current)
          .filter((event) => event.type === "contract-fulfilled" && event.data.resource === resource
            && (settlementId === undefined || event.data.destinationSettlementId === settlementId))
          .reduce((sum, event) => sum + Number(event.data.projectContribution), 0);
        const transfer = (current: WorldState, settlementId = 1, afterSequence = firstSequence - 1) => receipts(current).reduce((sum, event) => {
          if (event.sequence <= afterSequence) return sum;
          const lot = current.contracts.find(({ id }) => id === event.subjectId);
          if (lot?.resource !== "parts") return sum;
          if (event.type === "contract-fulfilled" && lot.destinationSettlementId === settlementId) return sum + lot.quantity - Number(event.data.projectContribution);
          if (event.type === "contract-departed" && lot.originSettlementId === settlementId) return sum - lot.quantity;
          return sum;
        }, 0);
        const destination = world.settlements.find(({ id }) => id === 1)!;
        const controlDestination = control.settlements.find(({ id }) => id === 1)!;
        expect(destination.inventory.parts - controlDestination.inventory.parts).toBe(transfer(world) - transfer(control));
        expect(destination.project.progress - controlDestination.project.progress).toBe(credits(world, "parts", 1) - credits(control, "parts", 1));
        expect(world.ledger.initial).toEqual(control.ledger.initial);
        expect(world.ledger.produced).toEqual(control.ledger.produced);
        for (const resource of RESOURCE_KINDS) expect(world.ledger.consumed[resource] - control.ledger.consumed[resource])
          .toBe(credits(world, resource) - credits(control, resource));
        const priorProject = finalInput.settlements.find(({ id }) => id === 1)!.project;
        const contribution = Number(receipt.data.projectContribution);
        expect(contribution).toBeGreaterThanOrEqual(0);
        expect(contribution).toBeLessThanOrEqual(Math.max(1, Math.trunc(8 * Number(receipt.data.condition) / (FIXED_POINT * 2))));
        if (priorProject.status === "complete" || priorProject.resource !== "parts") expect(contribution).toBe(0);
        else if (contribution === 0) expect(controlDestination.project.status).toBe("complete");
        const initialTrust = Math.min(...[[5, 1], [1, 5]].map(([observer, subject]) => finalInput.settlements
          .find(({ id }) => id === observer)!.trust.find(({ settlementId }) => settlementId === subject)!.value));
        for (const current of [world, control]) {
          const gains = receipts(current).filter((event) => event.type === "contract-fulfilled"
            && [[5, 1], [1, 5]].some(([from, to]) => event.data.originSettlementId === from && event.data.destinationSettlementId === to))
            .reduce((sum, event) => sum + 6_000 + Math.trunc(Number(event.data.condition) / 50), 0);
          for (const [observer, subject] of [[5, 1], [1, 5]]) expect(current.settlements.find(({ id }) => id === observer)!
            .trust.find(({ settlementId }) => settlementId === subject)!.value).toBe(Math.min(FIXED_POINT, initialTrust + gains));
        }
        // refreshKnowledge precedes this delivery's project debit. Undo only
        // later real lot transfers, then add that own debit where applicable.
        // Native generation need not contain both directional resource reports.
        for (const [observer, subject] of [[5, 1], [1, 5]]) {
          const prior = finalInput.settlements.find(({ id }) => id === observer)!.knowledge
            .find((record) => record.subjectSettlementId === subject && record.resource === "parts");
          const known = world.settlements.find(({ id }) => id === observer)!.knowledge
            .find((record) => record.subjectSettlementId === subject && record.resource === "parts");
          if (prior === undefined) { expect(known).toBeUndefined(); continue; }
          const refresh = receipts(world).filter((event) => event.type === "contract-fulfilled" && event.data.resource === "parts"
            && ((event.data.originSettlementId === observer && event.data.destinationSettlementId === subject)
              || (event.data.originSettlementId === subject && event.data.destinationSettlementId === observer))).at(-1)!;
          const subjectStock = world.settlements.find(({ id }) => id === subject)!.inventory.parts;
          expect(known).toMatchObject({ id: prior.id, ageTicks: 0, confidence: FIXED_POINT, verified: true,
            reportedQuantity: subjectStock - transfer(world, subject, refresh.sequence)
              + (subject === refresh.data.destinationSettlementId ? Number(refresh.data.projectContribution) : 0) });
        }
        for (const id of contract.porterRouteIds) {
          const before = finalInput.routes.find((route) => route.id === id)!;
          const after = world.routes.find((route) => route.id === id)!;
          expect(after.traceStrength).toBeGreaterThanOrEqual(Math.min(FIXED_POINT, before.traceStrength + 2_000 + Math.trunc(Number(receipt.data.condition) / 220)));
          expect(after.reliability).toBeGreaterThanOrEqual(Math.min(FIXED_POINT, before.reliability + 1_500 + Math.trunc(Number(receipt.data.condition) / 300)));
          expect(after.lastUsedTick).toBe(terminalTick);
        }
        expect(contract).toMatchObject({ status: "fulfilled", cargoQuantity: 0, completedTick: terminalTick });
        expect(residentAt(world, actorId)).toMatchObject({ activeContractId: null, location: { kind: "settlement", settlementId: 1 } });
        expect(residentAt(world, actorId).activity?.travelTask).toBeNull();
        expect(residentAt(world, actorId).activity?.poses[0]?.position).toEqual(residentSettlementRestTarget(world, residentAt(world, actorId)));
        prepare(world);
      }
    } finally { waypoint.mockRestore(); }
    if (terminalTick === null || phase9 === null || phase4 === null) throw new Error("Native finite multi-leg journey did not establish its handoff and partial cold cuts");
    expect(joins).toEqual([{ from: 0, to: 1, reversed: true }, { from: 1, to: 2, reversed: true }, { from: 2, to: 3, reversed: true }]);
    expect(world.meta.completedTick).toBeLessThanOrEqual(422 + intervalBound);
    expect(contract.dueTick).toBe(dueTick);
    const completedContract = structuredClone(contract);
    for (let phase = 1; phase <= 10; phase += 1) expect(advanceResidentRestActivities(world, phase)).not.toBeNull();
    closeServices(world);
    suffixIntervals += 1;
    prepare(world);
    expect(contract).toEqual(completedContract);
    expect(residentAt(world, actorId).activeContractId).not.toBe(contract.id);
    expect(world.events.filter(({ type, subjectId }) => type === "contract-fulfilled" && subjectId === contract.id)).toHaveLength(1);
    conserved(world);

    // One detached phase9 suffix proves the complete remaining world/save/event
    // history; phase4 already converged to that exact prefix above. This is
    // inner current-world persistence, not an outer58/runtime relaunch claim.
    const cold = deserializeWorld(phase9);
    expect(serializeWorld(cold)).toBe(phase9);
    expect(advanceResidentRestActivities(cold, 10)).not.toBeNull();
    closeServices(cold);
    prepare(cold);
    for (let interval = 1; interval < suffixIntervals; interval += 1) {
      for (let phase = 1; phase <= 10; phase += 1) expect(advanceResidentRestActivities(cold, phase)).not.toBeNull();
      closeServices(cold);
      prepare(cold);
    }
    expect(serializeWorld(cold)).toBe(serializeWorld(world));
    expect(cold.events).toEqual(world.events);
    conserved(cold);
  }, 180_000);
});

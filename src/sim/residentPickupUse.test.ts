import { describe, expect, it } from "vitest";

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
import { createActorObservation, type ActorObservation } from "./actorPerception";
import {
  assertWorldInvariants,
  createWorld,
  stepWorld,
  type ResidentPerceptionFrame,
} from "./public";
import { createRegionCoord } from "./regions";
import {
  RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION,
  replaceResidentActivity,
  type ResidentActivity,
} from "./residentActivity";
import { residentAcceptedPickupBinding, residentRestTargetHasDrySupport } from "./residentActivityWorld";
import { prepareResidentTravelAdvance, revokeResidentTravelAdvance } from "./residentTravelAdvance";
import type { ResidentState, WorldState } from "./types";
import { stableStringify } from "./util";

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

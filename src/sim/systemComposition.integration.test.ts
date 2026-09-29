import { describe, expect, it } from "vitest";

import { generateDemandContracts } from "./engine";
import {
  FIXED_POINT,
  RESOURCE_KINDS,
  assertWorldInvariants,
  createWorld,
  deserializeWorld,
  serializeWorld,
  stepWorld,
  type Inventory,
  type RouteState,
  type WorldState,
} from "./public";

function routeBetween(world: WorldState, leftId: number, rightId: number): RouteState {
  const low = Math.min(leftId, rightId);
  const high = Math.max(leftId, rightId);
  const route = world.routes.find(
    (candidate) => candidate.fromSettlementId === low && candidate.toSettlementId === high,
  );
  if (route === undefined) throw new Error(`missing route ${leftId}-${rightId}`);
  return route;
}

function orientedRoutePath(world: WorldState, fromId: number, toId: number): number[] {
  const route = routeBetween(world, fromId, toId);
  return route.fromSettlementId === fromId ? [...route.path] : [...route.path].reverse();
}

function currentResourceTotals(world: WorldState): Inventory {
  const totals = Object.fromEntries(RESOURCE_KINDS.map((resource) => [resource, 0])) as Inventory;
  for (const settlement of world.settlements) {
    for (const resource of RESOURCE_KINDS) totals[resource] += settlement.inventory[resource];
  }
  for (const contract of world.contracts) totals[contract.resource] += contract.cargoQuantity;
  return totals;
}

describe("live system composition", () => {
  it("turns credible donor-supply knowledge into conserved cargo and persistent downstream change", () => {
    const world = createWorld("composition closes the loop");
    const origin = world.settlements[0];
    const destination = world.settlements[1];
    if (origin === undefined || destination === undefined) throw new Error("fixture needs two settlements");
    expect(origin.specialization).toBe("food");

    world.contracts = [];
    for (const settlement of world.settlements) {
      for (const resource of RESOURCE_KINDS) settlement.inventory[resource] = 46;
      for (const recipe of settlement.recipes) recipe.nextRunTick = world.meta.completedTick + 10_000;
    }
    origin.inventory.food = 80;
    destination.inventory.food = 0;
    world.ledger.initial = currentResourceTotals(world);
    world.ledger.produced = Object.fromEntries(RESOURCE_KINDS.map((resource) => [resource, 0])) as Inventory;
    world.ledger.consumed = Object.fromEntries(RESOURCE_KINDS.map((resource) => [resource, 0])) as Inventory;

    const donorReport = destination.knowledge.find(
      (record) => record.subjectSettlementId === origin.id && record.resource === "food",
    );
    if (donorReport === undefined) throw new Error("fixture needs destination knowledge of its donor");
    donorReport.reportedQuantity = origin.inventory.food;
    donorReport.ageTicks = 0;
    donorReport.confidence = 0;
    donorReport.verified = false;

    generateDemandContracts(world, world.meta.completedTick);
    expect(world.contracts).toEqual([]);

    donorReport.confidence = FIXED_POINT;
    donorReport.verified = true;
    generateDemandContracts(world, world.meta.completedTick);

    const contract = world.contracts.find(
      (candidate) => candidate.destinationSettlementId === destination.id && candidate.resource === "food",
    );
    if (contract === undefined) throw new Error("credible donor-supply knowledge did not create a Promise");
    expect(contract.reason).toBe("shortage");

    const route = routeBetween(world, origin.id, destination.id);
    const trustBefore = origin.trust.find(({ settlementId }) => settlementId === destination.id)?.value;
    const beneficiary = world.residents.find(({ id }) => id === contract.requesterResidentId);
    if (trustBefore === undefined || beneficiary === undefined) throw new Error("fixture lost downstream owners");
    const beneficiaryFoodNeedBefore = beneficiary.needs.food;
    const routeBefore = {
      traceStrength: route.traceStrength,
      reliability: route.reliability,
      traffic: route.traffic,
    };
    const totalsBefore = currentResourceTotals(world);

    stepWorld(world, [{
      id: "composition-accept",
      type: "accept-contract",
      carrier: "player",
      contractId: contract.id,
    }]);
    stepWorld(world, [{
      id: "composition-pickup",
      type: "pickup-contract",
      contractId: contract.id,
      originSettlementId: origin.id,
    }]);

    expect(contract.status).toBe("in-transit");
    expect(origin.inventory.food).toBe(80 - contract.quantity);
    expect(contract.cargoQuantity).toBe(contract.quantity);
    expect(currentResourceTotals(world)).toEqual(totalsBefore);

    stepWorld(world, [{
      id: "composition-deliver",
      type: "deliver-contract",
      contractId: contract.id,
      destinationSettlementId: destination.id,
      condition: 800_000,
      trace: orientedRoutePath(world, origin.id, destination.id),
    }]);

    expect(contract.status).toBe("fulfilled");
    expect(contract.cargoQuantity).toBe(0);
    expect(destination.inventory.food).toBe(contract.quantity);
    expect(currentResourceTotals(world)).toEqual(totalsBefore);
    expect(origin.trust.find(({ settlementId }) => settlementId === destination.id)?.value)
      .toBeGreaterThan(trustBefore);
    expect(beneficiary.needs.food).toBeLessThan(beneficiaryFoodNeedBefore);
    expect(route.traceStrength).toBeGreaterThan(routeBefore.traceStrength);
    expect(route.reliability).toBeGreaterThan(routeBefore.reliability);
    expect(route.traffic).toBe(routeBefore.traffic + 1);

    assertWorldInvariants(world);
    const restored = deserializeWorld(serializeWorld(world));
    const restoredContract = restored.contracts.find(({ id }) => id === contract.id);
    const restoredOrigin = restored.settlements.find(({ id }) => id === origin.id);
    const restoredDestination = restored.settlements.find(({ id }) => id === destination.id);
    const restoredBeneficiary = restored.residents.find(({ id }) => id === beneficiary.id);
    const restoredRoute = routeBetween(restored, origin.id, destination.id);
    expect(restoredContract?.status).toBe("fulfilled");
    expect(restoredDestination?.inventory.food).toBe(contract.quantity);
    expect(restoredOrigin?.trust.find(({ settlementId }) => settlementId === destination.id)?.value)
      .toBe(origin.trust.find(({ settlementId }) => settlementId === destination.id)?.value);
    expect(restoredBeneficiary?.needs.food).toBe(beneficiary.needs.food);
    expect(restoredRoute.traceStrength).toBe(route.traceStrength);
    expect(restoredRoute.reliability).toBe(route.reliability);
    expect(restoredRoute.traffic).toBe(route.traffic);
    expect(currentResourceTotals(restored)).toEqual(totalsBefore);
  });
});

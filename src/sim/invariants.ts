import { tideAtTick } from "./terrain";
import {
  FIXED_POINT,
  RESOURCE_KINDS,
  RULES_VERSION,
  SAVE_FORMAT_VERSION,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type ContractState,
  type WorldState,
} from "./types";
import { currentInventoryTotals } from "./world";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`World invariant failed: ${message}`);
}

function assertSafeIntegers(value: unknown, path: string): void {
  if (typeof value === "number") {
    invariant(Number.isSafeInteger(value), `${path} must be a safe integer`);
    invariant(!Object.is(value, -0), `${path} must not be negative zero`);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSafeIntegers(entry, `${path}[${index}]`));
    return;
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    assertSafeIntegers((value as Record<string, unknown>)[key], `${path}.${key}`);
  }
}

function assertFixed(value: number, path: string): void {
  invariant(value >= 0 && value <= FIXED_POINT, `${path} must be fixed-point 0..1,000,000`);
}

function assertSortedIds(values: readonly { id: number }[], path: string): void {
  for (let index = 1; index < values.length; index += 1) {
    invariant((values[index - 1]?.id ?? 0) < (values[index]?.id ?? 0), `${path} must be sorted by unique ID`);
  }
}

function assertContractLifecycle(contract: ContractState): void {
  invariant(contract.quantity > 0, `contract ${contract.id} quantity must be positive`);
  invariant(contract.playerExclusiveUntilTick >= contract.createdTick, `contract ${contract.id} exclusivity is invalid`);
  invariant(contract.dueTick > contract.playerExclusiveUntilTick, `contract ${contract.id} is due before porter release`);
  invariant(contract.cargoQuantity >= 0 && contract.cargoQuantity <= contract.quantity, `contract ${contract.id} cargo is invalid`);
  invariant(contract.originSettlementId !== contract.destinationSettlementId, `contract ${contract.id} must cross settlements`);
  switch (contract.status) {
    case "offered":
      invariant(contract.carrierKind === null, `offered contract ${contract.id} cannot have a carrier`);
      invariant(contract.assignedResidentId === null, `offered contract ${contract.id} cannot have a resident`);
      invariant(contract.acceptedTick === null && contract.departedTick === null && contract.completedTick === null, `offered contract ${contract.id} has lifecycle timestamps`);
      invariant(contract.cargoQuantity === 0, `offered contract ${contract.id} has cargo`);
      break;
    case "accepted":
      invariant(contract.carrierKind !== null, `accepted contract ${contract.id} needs a carrier`);
      invariant(contract.acceptedTick !== null, `accepted contract ${contract.id} needs acceptedTick`);
      invariant(contract.departedTick === null && contract.completedTick === null, `accepted contract ${contract.id} has later timestamps`);
      invariant(contract.cargoQuantity === 0, `accepted contract ${contract.id} has cargo before pickup`);
      break;
    case "in-transit":
      invariant(contract.carrierKind !== null, `in-transit contract ${contract.id} needs a carrier`);
      invariant(contract.acceptedTick !== null && contract.departedTick !== null, `in-transit contract ${contract.id} lacks timestamps`);
      invariant(contract.completedTick === null, `in-transit contract ${contract.id} is already completed`);
      invariant(contract.cargoQuantity === contract.quantity, `in-transit contract ${contract.id} must hold all cargo`);
      if (contract.carrierKind === "resident") {
        invariant(contract.arrivalTick !== null, `porter contract ${contract.id} needs an arrival tick`);
      } else {
        invariant(contract.arrivalTick === null, `player contract ${contract.id} cannot auto-arrive`);
      }
      break;
    case "fulfilled":
      invariant(contract.completedTick !== null, `fulfilled contract ${contract.id} lacks completedTick`);
      invariant(contract.cargoQuantity === 0, `fulfilled contract ${contract.id} retains cargo`);
      invariant(contract.deliveryCondition !== null && contract.deliveryGrade !== null, `fulfilled contract ${contract.id} lacks a grade`);
      invariant(contract.deliveryTraceCost !== null && contract.deliveryTraceCost > 0, `fulfilled contract ${contract.id} lacks trace cost`);
      break;
    case "expired":
    case "cancelled":
      invariant(contract.completedTick !== null, `${contract.status} contract ${contract.id} lacks completedTick`);
      invariant(contract.cargoQuantity === 0, `${contract.status} contract ${contract.id} retains cargo`);
      break;
    default: {
      const impossible: never = contract.status;
      throw new Error(`World invariant failed: unknown contract status ${String(impossible)}`);
    }
  }
  if (contract.carrierKind === "resident") {
    invariant(contract.assignedResidentId !== null, `resident contract ${contract.id} lacks resident ID`);
  }
  if (contract.carrierKind === "player") {
    invariant(contract.assignedResidentId === null, `player contract ${contract.id} has a resident ID`);
  }
  if (contract.deliveryCondition !== null) assertFixed(contract.deliveryCondition, `contract ${contract.id}.deliveryCondition`);
  if (contract.status !== "fulfilled") invariant(contract.deliveryTraceCost === null, `unfinished contract ${contract.id} has trace cost`);
}

export function assertWorldInvariants(world: WorldState): void {
  assertSafeIntegers(world, "world");
  invariant(world.meta.saveFormatVersion === SAVE_FORMAT_VERSION, "save format version is unsupported");
  invariant(world.meta.rulesVersion === RULES_VERSION, "rules version is unsupported");
  invariant(world.meta.completedTick >= 0, "completed tick cannot be negative");
  invariant(
    world.meta.pressureMode === "calm" || world.meta.pressureMode === "standard" || world.meta.pressureMode === "wild",
    "pressure mode is invalid",
  );
  invariant(world.meta.rootSeed.length === 4, "root seed must contain four words");
  for (const word of world.meta.rootSeed) invariant(word >= 0 && word <= 0xffff_ffff, "root seed word is outside uint32");

  invariant(world.terrain.width === WORLD_WIDTH && world.terrain.height === WORLD_HEIGHT, "terrain dimensions changed");
  invariant(world.terrain.tiles.length === WORLD_WIDTH * WORLD_HEIGHT, "terrain tile count is wrong");
  for (let index = 0; index < world.terrain.tiles.length; index += 1) {
    const tile = world.terrain.tiles[index];
    invariant(tile !== undefined && tile.index === index, `terrain tile ${index} has the wrong index`);
    invariant(tile.x === index % WORLD_WIDTH && tile.y === Math.floor(index / WORLD_WIDTH), `terrain tile ${index} has wrong coordinates`);
    assertFixed(tile.elevation, `tile ${index}.elevation`);
    assertFixed(tile.moisture, `tile ${index}.moisture`);
    assertFixed(tile.roughness, `tile ${index}.roughness`);
    assertFixed(tile.traceStrength, `tile ${index}.traceStrength`);
    invariant(tile.baseTravelCost > 0, `tile ${index} travel cost must be positive`);
  }

  const expectedTide = tideAtTick(world.meta.completedTick);
  invariant(
    world.tide.phase === expectedTide.phase &&
      world.tide.level === expectedTide.level &&
      world.tide.direction === expectedTide.direction,
    "tide does not match completed tick",
  );
  assertFixed(world.weather.intensity, "weather.intensity");
  invariant(world.weather.nextChangeTick > world.meta.completedTick, "weather transition must be in the future");
  invariant(world.weather.windX >= -FIXED_POINT && world.weather.windX <= FIXED_POINT, "weather.windX is invalid");
  invariant(world.weather.windY >= -FIXED_POINT && world.weather.windY <= FIXED_POINT, "weather.windY is invalid");

  invariant(world.settlements.length === 7, "world must have seven settlements");
  invariant(world.residents.length === 42, "world must have forty-two named residents");
  assertSortedIds(world.settlements, "settlements");
  assertSortedIds(world.residents, "residents");
  assertSortedIds(world.routes, "routes");
  assertSortedIds(world.contracts, "contracts");

  const entityIds = new Set<number>();
  const claimId = (id: number, path: string) => {
    invariant(id > 0, `${path} ID must be positive`);
    invariant(!entityIds.has(id), `${path} duplicates entity ID ${id}`);
    entityIds.add(id);
  };
  for (const settlement of world.settlements) {
    claimId(settlement.id, `settlement ${settlement.id}`);
    invariant(world.terrain.tiles[settlement.tileIndex] !== undefined, `settlement ${settlement.id} tile is invalid`);
    for (const resource of RESOURCE_KINDS) {
      invariant(settlement.inventory[resource] >= 0, `settlement ${settlement.id} has negative ${resource}`);
    }
    claimId(settlement.project.id, `settlement ${settlement.id} project`);
    invariant(settlement.project.progress >= 0 && settlement.project.progress <= settlement.project.target, `settlement ${settlement.id} project progress is invalid`);
    assertFixed(settlement.stress, `settlement ${settlement.id}.stress`);
    for (const recipe of settlement.recipes) {
      claimId(recipe.id, `settlement ${settlement.id} recipe`);
      invariant(recipe.intervalTicks > 0 && recipe.nextRunTick > world.meta.completedTick, `recipe ${recipe.id} schedule is invalid`);
    }
    const trustIds = new Set<number>();
    for (const trust of settlement.trust) {
      invariant(!trustIds.has(trust.settlementId), `settlement ${settlement.id} has duplicate trust target`);
      trustIds.add(trust.settlementId);
      invariant(trust.settlementId !== settlement.id, `settlement ${settlement.id} trusts itself`);
      assertFixed(trust.value, `settlement ${settlement.id}.trust`);
    }
    for (const knowledge of settlement.knowledge) {
      claimId(knowledge.id, `knowledge ${knowledge.id}`);
      invariant(knowledge.ageTicks >= 0, `knowledge ${knowledge.id} has negative age`);
      invariant(knowledge.reportedQuantity >= 0, `knowledge ${knowledge.id} has negative quantity`);
      assertFixed(knowledge.confidence, `knowledge ${knowledge.id}.confidence`);
    }
  }

  const settlementIds = new Set(world.settlements.map((settlement) => settlement.id));
  const residentIds = new Set(world.residents.map((resident) => resident.id));
  const routeIds = new Set(world.routes.map((route) => route.id));
  for (const settlement of world.settlements) {
    invariant(settlement.residentIds.length === 6, `settlement ${settlement.id} must have six residents`);
    for (const residentId of settlement.residentIds) invariant(residentIds.has(residentId), `settlement ${settlement.id} references unknown resident`);
    for (const trust of settlement.trust) {
      invariant(settlementIds.has(trust.settlementId), `settlement ${settlement.id} trust target is invalid`);
      const reciprocal = world.settlements
        .find((candidate) => candidate.id === trust.settlementId)
        ?.trust.find((candidate) => candidate.settlementId === settlement.id);
      invariant(reciprocal?.value === trust.value, `settlement ${settlement.id} trust is not reciprocal`);
    }
    for (const knowledge of settlement.knowledge) {
      invariant(settlementIds.has(knowledge.subjectSettlementId), `knowledge ${knowledge.id} subject is invalid`);
    }
  }

  for (const resident of world.residents) {
    claimId(resident.id, `resident ${resident.id}`);
    invariant(resident.name.length > 0, `resident ${resident.id} is unnamed`);
    invariant(settlementIds.has(resident.homeSettlementId), `resident ${resident.id} home is invalid`);
    assertFixed(resident.traits.resolve, `resident ${resident.id}.resolve`);
    assertFixed(resident.traits.empathy, `resident ${resident.id}.empathy`);
    assertFixed(resident.traits.curiosity, `resident ${resident.id}.curiosity`);
    assertFixed(resident.needs.food, `resident ${resident.id}.food`);
    assertFixed(resident.needs.rest, `resident ${resident.id}.rest`);
    assertFixed(resident.needs.belonging, `resident ${resident.id}.belonging`);
    if (resident.location.kind === "settlement") {
      invariant(settlementIds.has(resident.location.settlementId), `resident ${resident.id} location is invalid`);
    } else {
      invariant(routeIds.has(resident.location.routeId), `resident ${resident.id} route is invalid`);
      assertFixed(resident.location.progress, `resident ${resident.id}.progress`);
    }
    const relationshipIds = new Set<number>();
    for (const relationship of resident.relationships) {
      invariant(residentIds.has(relationship.residentId), `resident ${resident.id} relationship is invalid`);
      invariant(relationship.residentId !== resident.id, `resident ${resident.id} relates to self`);
      invariant(!relationshipIds.has(relationship.residentId), `resident ${resident.id} has duplicate relationship`);
      relationshipIds.add(relationship.residentId);
      assertFixed(relationship.trust, `resident ${resident.id}.relationship trust`);
    }
  }

  for (const route of world.routes) {
    claimId(route.id, `route ${route.id}`);
    invariant(settlementIds.has(route.fromSettlementId) && settlementIds.has(route.toSettlementId), `route ${route.id} endpoint is invalid`);
    invariant(route.fromSettlementId < route.toSettlementId, `route ${route.id} endpoint order is unstable`);
    invariant(route.path.length >= 2, `route ${route.id} path is too short`);
    const from = world.settlements.find((settlement) => settlement.id === route.fromSettlementId);
    const to = world.settlements.find((settlement) => settlement.id === route.toSettlementId);
    invariant(route.path[0] === from?.tileIndex && route.path[route.path.length - 1] === to?.tileIndex, `route ${route.id} path endpoints are wrong`);
    for (let index = 1; index < route.path.length; index += 1) {
      const previous = world.terrain.tiles[route.path[index - 1] ?? -1];
      const tile = world.terrain.tiles[route.path[index] ?? -1];
      invariant(previous !== undefined && tile !== undefined, `route ${route.id} path tile is invalid`);
      invariant(Math.abs(previous.x - tile.x) + Math.abs(previous.y - tile.y) === 1, `route ${route.id} path is disconnected`);
    }
    assertFixed(route.traceStrength, `route ${route.id}.traceStrength`);
    assertFixed(route.condition, `route ${route.id}.condition`);
    assertFixed(route.reliability, `route ${route.id}.reliability`);
    invariant(route.baseTravelTicks > 0 && route.traffic >= 0, `route ${route.id} timing or traffic is invalid`);
  }

  for (const contract of world.contracts) {
    claimId(contract.id, `contract ${contract.id}`);
    assertContractLifecycle(contract);
    invariant(settlementIds.has(contract.originSettlementId) && settlementIds.has(contract.destinationSettlementId), `contract ${contract.id} settlement is invalid`);
    const requester = world.residents.find((resident) => resident.id === contract.requesterResidentId);
    invariant(requester !== undefined, `contract ${contract.id} requester is invalid`);
    invariant(requester.homeSettlementId === contract.destinationSettlementId, `contract ${contract.id} requester is not at its destination`);
    invariant(routeIds.has(contract.routeId), `contract ${contract.id} route is invalid`);
    for (const routeId of contract.porterRouteIds) {
      invariant(routeIds.has(routeId), `contract ${contract.id} porter route is invalid`);
    }
    if (contract.carrierKind === "resident") {
      invariant(contract.porterRouteIds.length > 0, `resident contract ${contract.id} needs a route plan`);
      invariant(
        contract.porterSettlementIds.length === contract.porterRouteIds.length + 1,
        `resident contract ${contract.id} route plan shape is invalid`,
      );
      invariant(
        contract.porterSettlementIds[0] === contract.originSettlementId
          && contract.porterSettlementIds.at(-1) === contract.destinationSettlementId,
        `resident contract ${contract.id} route plan endpoints are invalid`,
      );
    } else {
      invariant(contract.porterRouteIds.length === 0, `non-resident contract ${contract.id} has a porter route plan`);
      invariant(contract.porterSettlementIds.length === 0, `non-resident contract ${contract.id} has porter settlements`);
    }
    if (contract.assignedResidentId !== null) invariant(residentIds.has(contract.assignedResidentId), `contract ${contract.id} resident is invalid`);
  }

  const contractIds = new Set(world.contracts.map((contract) => contract.id));
  for (const resident of world.residents) {
    if (resident.activeContractId === null) continue;
    invariant(contractIds.has(resident.activeContractId), `resident ${resident.id} active contract is invalid`);
    const contract = world.contracts.find((candidate) => candidate.id === resident.activeContractId);
    invariant(contract?.assignedResidentId === resident.id, `resident ${resident.id} contract assignment disagrees`);
    invariant(contract.status === "accepted" || contract.status === "in-transit", `resident ${resident.id} has terminal contract`);
  }

  invariant(world.meta.nextEntityId > Math.max(0, ...entityIds), "next entity ID is not ahead of allocated IDs");
  invariant(new Set(world.processedCommandIds).size === world.processedCommandIds.length, "processed command IDs are duplicated");
  for (let index = 1; index < world.events.length; index += 1) {
    invariant((world.events[index - 1]?.sequence ?? 0) < (world.events[index]?.sequence ?? 0), "events are not strictly ordered");
  }
  const lastEvent = world.events[world.events.length - 1];
  invariant(lastEvent === undefined || world.meta.nextEventSequence > lastEvent.sequence, "next event sequence is stale");

  const current = currentInventoryTotals(world);
  for (const resource of RESOURCE_KINDS) {
    invariant(world.ledger.initial[resource] >= 0, `ledger initial ${resource} is negative`);
    invariant(world.ledger.produced[resource] >= 0, `ledger produced ${resource} is negative`);
    invariant(world.ledger.consumed[resource] >= 0, `ledger consumed ${resource} is negative`);
    const expected = world.ledger.initial[resource] + world.ledger.produced[resource] - world.ledger.consumed[resource];
    invariant(current[resource] === expected, `${resource} conservation expected ${expected}, found ${current[resource]}`);
  }
}

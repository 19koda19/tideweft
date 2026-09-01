import { keyedRandomInt } from "./rng";
import { tideAtTick } from "./terrain";
import {
  FIXED_POINT,
  RESOURCE_KINDS,
  type CommandsByTick,
  type ContractState,
  type ContractStatus,
  type DeliveryGrade,
  type PressureMode,
  type ResidentState,
  type ResourceKind,
  type SimCommand,
  type SimEventDatum,
  type SimEventType,
  type SettlementState,
  type WorldState,
} from "./types";
import { clampInteger, compareText } from "./util";
import { createInitialWorld, findRouteBetween, pressureMultiplier } from "./world";
import { findAutonomousRoutePlan } from "./network";

const WEATHER_DOMAIN = 0x5745_4154;
const MAX_EVENT_HISTORY = 512;
const CONTRACT_TARGET_STOCK = 46;
const CONTRACT_DONOR_RESERVE = 54;
const CONTRACT_OFFER_LIMIT = 18;
const MAX_TERMINAL_CONTRACT_HISTORY = 256;

function playerCarryLimit(resource: ResourceKind): number {
  switch (resource) {
    case "freshWater":
    case "parts":
      return 8;
    case "medicine":
      return 12;
    case "food":
    case "reed":
      return 14;
  }
}

function emitEvent(
  world: WorldState,
  tick: number,
  type: SimEventType,
  subjectId: number | null,
  data: Record<string, SimEventDatum>,
): void {
  world.events.push({
    tick,
    sequence: world.meta.nextEventSequence,
    type,
    subjectId,
    data,
  });
  world.meta.nextEventSequence += 1;
}

function rejectCommand(world: WorldState, tick: number, command: SimCommand, reason: string): void {
  emitEvent(world, tick, "command-rejected", null, { commandId: command.id, reason });
}

function canonicalCommands(commands: readonly SimCommand[]): SimCommand[] {
  return [...commands].sort((left, right) => {
    const leftTarget = left.targetTick ?? 0;
    const rightTarget = right.targetTick ?? 0;
    return (
      leftTarget - rightTarget ||
      (left.sourceId ?? 0) - (right.sourceId ?? 0) ||
      (left.sequence ?? 0) - (right.sequence ?? 0) ||
      compareText(left.id, right.id)
    );
  });
}

function settlementById(world: WorldState, id: number) {
  return world.settlements.find((settlement) => settlement.id === id);
}

function residentById(world: WorldState, id: number) {
  return world.residents.find((resident) => resident.id === id);
}

function contractById(world: WorldState, id: number) {
  return world.contracts.find((contract) => contract.id === id);
}

function releaseResident(world: WorldState, contract: ContractState): void {
  if (contract.assignedResidentId === null) return;
  const resident = residentById(world, contract.assignedResidentId);
  if (resident !== undefined) {
    resident.activeContractId = null;
    resident.intention = "work";
    if (resident.location.kind === "route") {
      resident.location = { kind: "settlement", settlementId: contract.originSettlementId };
    }
  }
}

function acceptContract(
  world: WorldState,
  contract: ContractState,
  resident: ResidentState,
  tick: number,
): string | null {
  if (contract.status !== "offered") return "contract is not offered";
  if (tick > contract.dueTick) return "contract is past its due tick";
  if (resident.activeContractId !== null) return "resident is already carrying a promise";
  if (resident.location.kind !== "settlement" || resident.location.settlementId !== contract.originSettlementId) {
    return "resident is not at the origin";
  }
  const routePlan = findAutonomousRoutePlan(world, contract.originSettlementId, contract.destinationSettlementId);
  if (routePlan === undefined || routePlan.routeIds.length === 0) return "no active porter path connects the promise";
  contract.status = "accepted";
  contract.acceptedTick = tick;
  contract.carrierKind = "resident";
  contract.assignedResidentId = resident.id;
  contract.porterRouteIds = [...routePlan.routeIds];
  contract.porterSettlementIds = [...routePlan.settlementIds];
  resident.activeContractId = contract.id;
  resident.intention = "carry";
  emitEvent(world, tick, "contract-accepted", contract.id, {
    residentId: resident.id,
    carrier: "resident",
    originSettlementId: contract.originSettlementId,
    destinationSettlementId: contract.destinationSettlementId,
  });
  return null;
}

function acceptPlayerContract(world: WorldState, contract: ContractState, tick: number): string | null {
  if (contract.status !== "offered") return "contract is not offered";
  if (tick > contract.dueTick) return "contract is past its due tick";
  if (
    world.contracts.some(
      (candidate) =>
        candidate.id !== contract.id &&
        candidate.carrierKind === "player" &&
        (candidate.status === "accepted" || candidate.status === "in-transit"),
    )
  ) {
    return "player is already carrying a promise";
  }
  contract.status = "accepted";
  contract.acceptedTick = tick;
  contract.carrierKind = "player";
  contract.assignedResidentId = null;
  contract.porterRouteIds = [];
  contract.porterSettlementIds = [];
  emitEvent(world, tick, "contract-accepted", contract.id, {
    residentId: null,
    carrier: "player",
    originSettlementId: contract.originSettlementId,
    destinationSettlementId: contract.destinationSettlementId,
  });
  return null;
}

function pickupPlayerContract(world: WorldState, contract: ContractState, originId: number, tick: number): string | null {
  if (contract.status !== "accepted" || contract.carrierKind !== "player") {
    return "contract is not accepted by the player";
  }
  if (tick > contract.dueTick) return "contract is past its due tick";
  if (originId !== contract.originSettlementId) return "pickup is at the wrong settlement";
  const origin = settlementById(world, originId);
  if (origin === undefined) return "origin settlement does not exist";
  if (origin.inventory[contract.resource] < contract.quantity) return "origin no longer has the promised cargo";

  origin.inventory[contract.resource] -= contract.quantity;
  contract.cargoQuantity = contract.quantity;
  contract.status = "in-transit";
  contract.departedTick = tick;
  contract.arrivalTick = null;
  emitEvent(world, tick, "contract-picked-up", contract.id, {
    originSettlementId: origin.id,
    quantity: contract.quantity,
    resource: contract.resource,
  });
  return null;
}

function deliveryGrade(condition: number): DeliveryGrade {
  if (condition >= 850_000) return "pristine";
  if (condition >= 600_000) return "weathered";
  if (condition >= 300_000) return "improvised";
  return "rescued";
}

function validateTrace(world: WorldState, contract: ContractState, trace: readonly number[]): string | null {
  if (trace.length < 2 || trace.length > world.terrain.tiles.length * 2) return "trace length is invalid";
  const origin = settlementById(world, contract.originSettlementId);
  const destination = settlementById(world, contract.destinationSettlementId);
  if (origin === undefined || destination === undefined) return "contract settlement does not exist";
  if (trace[0] !== origin.tileIndex || trace[trace.length - 1] !== destination.tileIndex) {
    return "trace must connect the contract settlements";
  }
  for (let index = 0; index < trace.length; index += 1) {
    const tileIndex = trace[index];
    if (!Number.isSafeInteger(tileIndex) || tileIndex === undefined || world.terrain.tiles[tileIndex] === undefined) {
      return "trace references an invalid tile";
    }
    if (index === 0) continue;
    const previousIndex = trace[index - 1];
    const tile = world.terrain.tiles[tileIndex];
    const previous = previousIndex === undefined ? undefined : world.terrain.tiles[previousIndex];
    if (
      tile === undefined ||
      previous === undefined ||
      Math.max(Math.abs(tile.x - previous.x), Math.abs(tile.y - previous.y)) !== 1
    ) {
      return "trace contains a disconnected step";
    }
  }
  return null;
}

function reinforceRoute(world: WorldState, command: Extract<SimCommand, { type: "reinforce-route" }>, tick: number): string | null {
  const route = world.routes.find((candidate) => candidate.id === command.routeId);
  const settlement = settlementById(world, command.settlementId);
  if (route === undefined) return "route does not exist";
  if (settlement === undefined) return "settlement does not exist";
  if (!Number.isSafeInteger(command.parts) || command.parts <= 0 || command.parts > 20) {
    return "parts must be an integer from 1 to 20";
  }
  if (route.fromSettlementId !== settlement.id && route.toSettlementId !== settlement.id) {
    return "settlement is not an endpoint of the route";
  }
  if (settlement.inventory.parts < command.parts) return "settlement lacks the requested parts";

  settlement.inventory.parts -= command.parts;
  world.ledger.consumed.parts += command.parts;
  route.traceStrength = clampInteger(route.traceStrength + command.parts * 18_000);
  route.condition = clampInteger(route.condition + command.parts * 12_000);
  for (const tileIndex of route.path) {
    const tile = world.terrain.tiles[tileIndex];
    if (tile !== undefined) tile.traceStrength = clampInteger(tile.traceStrength + command.parts * 320);
  }
  emitEvent(world, tick, "route-reinforced", route.id, {
    commandId: command.id,
    settlementId: settlement.id,
    parts: command.parts,
    traceStrength: route.traceStrength,
    condition: route.condition,
  });
  return null;
}

function shareKnowledge(world: WorldState, command: Extract<SimCommand, { type: "share-knowledge" }>, tick: number): string | null {
  const source = settlementById(world, command.fromSettlementId);
  const target = settlementById(world, command.toSettlementId);
  const subject = settlementById(world, command.subjectSettlementId);
  if (source === undefined || target === undefined || subject === undefined) return "settlement does not exist";
  const sourceRecord = source.knowledge.find(
    (record) => record.subjectSettlementId === subject.id && record.resource === command.resource,
  );
  const sourceIsSubject = source.id === subject.id;
  if (sourceRecord === undefined && !sourceIsSubject) return "source does not know that fact";
  if (command.reportedQuantity !== undefined && (!Number.isSafeInteger(command.reportedQuantity) || command.reportedQuantity < 0)) {
    return "reported quantity must be a non-negative integer";
  }
  if (command.observedTick !== undefined && (!Number.isSafeInteger(command.observedTick) || command.observedTick < 0 || command.observedTick > tick)) {
    return "report observation tick is invalid";
  }
  if (command.confidence !== undefined && (!Number.isSafeInteger(command.confidence) || command.confidence < 0 || command.confidence > FIXED_POINT)) {
    return "report confidence is invalid";
  }
  const transportedAge = command.observedTick === undefined ? 0 : tick - command.observedTick;
  const reportedQuantity = sourceIsSubject
    ? command.reportedQuantity ?? subject.inventory[command.resource]
    : sourceRecord?.reportedQuantity ?? 0;
  const ageTicks = sourceIsSubject ? transportedAge : sourceRecord?.ageTicks ?? 0;
  const sourceConfidence = sourceIsSubject
    ? Math.max(0, (command.confidence ?? FIXED_POINT) - transportedAge * 450)
    : sourceRecord?.confidence ?? 0;
  let targetRecord = target.knowledge.find(
    (record) => record.subjectSettlementId === subject.id && record.resource === command.resource,
  );
  if (targetRecord === undefined) {
    targetRecord = {
      id: world.meta.nextEntityId,
      subjectSettlementId: subject.id,
      resource: command.resource,
      reportedQuantity,
      ageTicks,
      confidence: Math.max(0, sourceConfidence - 25_000),
      verified: false,
    };
    world.meta.nextEntityId += 1;
    target.knowledge.push(targetRecord);
    target.knowledge.sort((left, right) => left.subjectSettlementId - right.subjectSettlementId || compareText(left.resource, right.resource));
  } else {
    targetRecord.reportedQuantity = reportedQuantity;
    targetRecord.ageTicks = ageTicks;
    targetRecord.confidence = Math.max(targetRecord.confidence, sourceConfidence - 25_000);
    targetRecord.verified = false;
  }
  emitEvent(world, tick, "knowledge-shared", targetRecord.id, {
    commandId: command.id,
    fromSettlementId: source.id,
    toSettlementId: target.id,
    subjectSettlementId: subject.id,
    resource: command.resource,
    reportedQuantity,
    ageTicks,
    confidence: Math.max(0, sourceConfidence - 25_000),
  });
  return null;
}

function applyCommands(world: WorldState, commands: readonly SimCommand[], tick: number): void {
  for (const command of canonicalCommands(commands)) {
    if (typeof command.id !== "string" || command.id.length === 0) {
      rejectCommand(world, tick, command, "command ID is required");
      continue;
    }
    if (world.processedCommandIds.includes(command.id)) continue;
    world.processedCommandIds.push(command.id);

    if (command.targetTick !== undefined && command.targetTick !== tick) {
      rejectCommand(world, tick, command, "command targeted a different tick");
      continue;
    }

    let error: string | null = null;
    switch (command.type) {
      case "accept-contract": {
        const contract = contractById(world, command.contractId);
        if (contract === undefined) {
          error = "contract does not exist";
        } else if (command.carrier === "player") {
          error = acceptPlayerContract(world, contract, tick);
        } else {
          const resident = residentById(world, command.residentId);
          if (resident === undefined) error = "resident does not exist";
          else error = acceptContract(world, contract, resident, tick);
        }
        break;
      }
      case "pickup-contract": {
        const contract = contractById(world, command.contractId);
        error =
          contract === undefined
            ? "contract does not exist"
            : pickupPlayerContract(world, contract, command.originSettlementId, tick);
        break;
      }
      case "deliver-contract": {
        const contract = contractById(world, command.contractId);
        if (contract === undefined) {
          error = "contract does not exist";
        } else if (contract.status !== "in-transit" || contract.carrierKind !== "player") {
          error = "contract is not being carried by the player";
        } else if (command.destinationSettlementId !== contract.destinationSettlementId) {
          error = "delivery is at the wrong settlement";
        } else if (!Number.isSafeInteger(command.condition) || command.condition < 0 || command.condition > FIXED_POINT) {
          error = "delivery condition must be an integer from 0 to 1,000,000";
        } else if (command.trace !== undefined && validateTrace(world, contract, command.trace) !== null) {
          error = validateTrace(world, contract, command.trace);
        } else {
          completeContract(world, contract, tick, command.condition, command.trace);
        }
        break;
      }
      case "cancel-contract": {
        const contract = contractById(world, command.contractId);
        if (contract === undefined) {
          error = "contract does not exist";
        } else if (contract.status === "in-transit" && contract.carrierKind === "player") {
          const returnSettlement = command.returnSettlementId === undefined
            ? undefined
            : settlementById(world, command.returnSettlementId);
          if (returnSettlement === undefined) {
            error = "carried cargo can only be handed off at a settlement";
          } else {
            returnSettlement.inventory[contract.resource] += contract.cargoQuantity;
            contract.cargoQuantity = 0;
            contract.status = "cancelled";
            contract.completedTick = tick;
            emitEvent(world, tick, "contract-cancelled", contract.id, {
              commandId: command.id,
              returnSettlementId: returnSettlement.id,
              resource: contract.resource,
              quantity: contract.quantity,
            });
          }
        } else if (contract.status !== "offered" && contract.status !== "accepted") {
          error = "contract can no longer be released";
        } else {
          releaseResident(world, contract);
          contract.status = "cancelled";
          contract.completedTick = tick;
          emitEvent(world, tick, "contract-cancelled", contract.id, { commandId: command.id });
        }
        break;
      }
      case "reinforce-route":
        error = reinforceRoute(world, command, tick);
        break;
      case "share-knowledge":
        error = shareKnowledge(world, command, tick);
        break;
    }
    if (error !== null) rejectCommand(world, tick, command, error);
  }
}

function updateWeather(world: WorldState, tick: number): void {
  if (tick < world.weather.nextChangeTick) return;
  const mode = world.meta.pressureMode;
  const epoch = Math.floor(tick / 180);
  const roll = keyedRandomInt(world.meta.rootSeed, WEATHER_DOMAIN, epoch, 0, 1, 0, 999);
  const kind =
    mode === "calm"
      ? roll < 600
        ? "clear"
        : roll < 850
          ? "mist"
          : "rain"
      : mode === "wild"
        ? roll < 250
          ? "clear"
          : roll < 450
            ? "mist"
            : roll < 720
              ? "rain"
              : "storm"
        : roll < 430
          ? "clear"
          : roll < 650
            ? "mist"
            : roll < 900
              ? "rain"
              : "storm";
  const maximumIntensity = kind === "storm" ? 960_000 : kind === "rain" ? 680_000 : kind === "mist" ? 420_000 : 250_000;
  const minimumIntensity = kind === "clear" ? 30_000 : 160_000;
  world.weather = {
    kind,
    intensity: keyedRandomInt(world.meta.rootSeed, WEATHER_DOMAIN, epoch, 0, 2, minimumIntensity, maximumIntensity),
    windX: keyedRandomInt(world.meta.rootSeed, WEATHER_DOMAIN, epoch, 0, 3, -500_000, 500_000),
    windY: keyedRandomInt(world.meta.rootSeed, WEATHER_DOMAIN, epoch, 0, 4, -500_000, 500_000),
    nextChangeTick: tick + 180,
  };
  emitEvent(world, tick, "weather-changed", null, { kind, intensity: world.weather.intensity });
}

function canRunRecipe(world: WorldState, settlementId: number, inputs: readonly { resource: ResourceKind; amount: number }[]): boolean {
  const settlement = settlementById(world, settlementId);
  return settlement !== undefined && inputs.every((input) => settlement.inventory[input.resource] >= input.amount);
}

function runProduction(world: WorldState, tick: number): void {
  for (const settlement of world.settlements) {
    for (const recipe of settlement.recipes) {
      if (tick < recipe.nextRunTick) continue;
      if (canRunRecipe(world, settlement.id, recipe.inputs)) {
        for (const input of recipe.inputs) {
          settlement.inventory[input.resource] -= input.amount;
          world.ledger.consumed[input.resource] += input.amount;
        }
        for (const output of recipe.outputs) {
          settlement.inventory[output.resource] += output.amount;
          world.ledger.produced[output.resource] += output.amount;
        }
      }
      recipe.nextRunTick += recipe.intervalTicks;
    }
  }
}

function updateResidentNeeds(world: WorldState, tick: number): void {
  if (tick % 60 !== 0) return;
  const pressure = pressureMultiplier(world.meta.pressureMode);
  const dayPhase = tick % 1_440;
  const isRestPeriod = dayPhase < 360 || dayPhase >= 1_200;

  for (const settlement of world.settlements) {
    const residents = settlement.residentIds
      .map((id) => residentById(world, id))
      .filter((resident): resident is ResidentState => resident !== undefined);
    const ration = Math.max(1, Math.ceil(residents.length / 3));
    const foodServed = settlement.inventory.food >= ration;
    const waterServed = settlement.inventory.freshWater >= ration;
    if (foodServed) {
      settlement.inventory.food -= ration;
      world.ledger.consumed.food += ration;
    }
    if (waterServed) {
      settlement.inventory.freshWater -= ration;
      world.ledger.consumed.freshWater += ration;
    }

    let totalNeed = 0;
    for (const resident of residents) {
      const hungerGrowth = Math.trunc((34_000 * pressure) / FIXED_POINT);
      resident.needs.food = clampInteger(resident.needs.food + hungerGrowth - (foodServed ? 68_000 : 0) - (waterServed ? 8_000 : 0));
      resident.needs.rest = clampInteger(resident.needs.rest + (isRestPeriod ? -52_000 : 24_000));
      const relationshipTrust = resident.relationships.reduce((sum, relationship) => sum + relationship.trust, 0);
      const averageTrust = resident.relationships.length === 0 ? 0 : Math.trunc(relationshipTrust / resident.relationships.length);
      resident.needs.belonging = clampInteger(resident.needs.belonging + 18_000 - Math.trunc(averageTrust / 18));
      if (resident.activeContractId !== null) resident.intention = "carry";
      else if (resident.needs.food >= resident.needs.rest && resident.needs.food >= resident.needs.belonging) resident.intention = "eat";
      else if (resident.needs.rest >= resident.needs.belonging) resident.intention = "rest";
      else if (resident.needs.belonging > 520_000) resident.intention = "connect";
      else resident.intention = "work";
      resident.nextThinkTick = tick + 15 + (resident.id % 31);
      totalNeed += resident.needs.food + resident.needs.rest + resident.needs.belonging;
    }
    const needStress = residents.length === 0 ? 0 : Math.trunc(totalNeed / (residents.length * 3));
    const shortageKinds = RESOURCE_KINDS.filter((resource) => settlement.inventory[resource] < 20).length;
    settlement.stress = clampInteger(Math.trunc(needStress / 2) + shortageKinds * 85_000);
  }
}

function completeProject(world: WorldState, settlement: SettlementState, tick: number): void {
  const project = settlement.project;
  project.progress = project.target;
  project.status = "complete";
  const incidentRoutes = world.routes.filter(
    (route) => route.fromSettlementId === settlement.id || route.toSettlementId === settlement.id,
  );
  let effect: string;
  switch (project.kind) {
    case "beacon":
      effect = "storm forecast and signal coverage improved";
      for (const route of incidentRoutes) route.reliability = clampInteger(route.reliability + 90_000);
      for (const knowledge of settlement.knowledge) {
        knowledge.confidence = clampInteger(knowledge.confidence + 120_000);
      }
      break;
    case "cache":
      effect = "rest and cargo recovery became faster at this harbor";
      for (const route of incidentRoutes) route.condition = clampInteger(route.condition + 45_000);
      break;
    case "crossing":
      effect = "incident land routes became faster and more weatherworthy";
      for (const route of incidentRoutes) {
        route.condition = clampInteger(route.condition + 150_000);
        route.baseTravelTicks = Math.max(6, Math.trunc((route.baseTravelTicks * 82) / 100));
      }
      break;
    case "clinic":
      effect = "connected-route rescue and local recovery came online";
      settlement.stress = Math.max(0, settlement.stress - 220_000);
      for (const residentId of settlement.residentIds) {
        const resident = residentById(world, residentId);
        if (!resident) continue;
        resident.needs.rest = Math.max(0, resident.needs.rest - 90_000);
        resident.needs.belonging = Math.max(0, resident.needs.belonging - 70_000);
      }
      break;
    case "ferry":
      effect = "porter capacity increased and water crossings became faster";
      for (const route of incidentRoutes) {
        route.baseTravelTicks = Math.max(6, Math.trunc((route.baseTravelTicks * 86) / 100));
        route.reliability = clampInteger(route.reliability + 55_000);
      }
      break;
  }
  emitEvent(world, tick, "project-completed", project.id, {
    settlementId: settlement.id,
    kind: project.kind,
    effect,
  });
}

function updateProjects(world: WorldState, tick: number): void {
  if (tick % 60 !== 0) return;
  for (const settlement of world.settlements) {
    const project = settlement.project;
    if (project.status === "complete" || settlement.inventory[project.resource] < 1) continue;
    settlement.inventory[project.resource] -= 1;
    world.ledger.consumed[project.resource] += 1;
    project.progress += 1;
    if (project.progress >= project.target) {
      completeProject(world, settlement, tick);
    }
  }
}

function ageKnowledge(world: WorldState, tick: number): void {
  for (const settlement of world.settlements) {
    for (const knowledge of settlement.knowledge) {
      knowledge.ageTicks += 1;
      if (tick % 60 === 0) {
        knowledge.confidence = Math.max(0, knowledge.confidence - 1_000 - Math.trunc(knowledge.ageTicks / 120));
        knowledge.verified = knowledge.ageTicks === 0;
      }
    }
  }
}

function hasOpenContract(world: WorldState, destinationId: number, resource: ResourceKind): boolean {
  return world.contracts.some(
    (contract) =>
      contract.destinationSettlementId === destinationId &&
      contract.resource === resource &&
      (contract.status === "offered" || contract.status === "accepted" || contract.status === "in-transit"),
  );
}

export function generateDemandContracts(world: WorldState, tick: number): void {
  const openCount = world.contracts.filter(
    (contract) => contract.status === "offered" || contract.status === "accepted" || contract.status === "in-transit",
  ).length;
  let remainingSlots = Math.max(0, CONTRACT_OFFER_LIMIT - openCount);
  if (remainingSlots === 0) return;

  for (const destination of world.settlements) {
    if (remainingSlots === 0) break;
    const wanted = RESOURCE_KINDS
      .filter((resource) => destination.inventory[resource] < CONTRACT_TARGET_STOCK && !hasOpenContract(world, destination.id, resource))
      .sort((left, right) => destination.inventory[left] - destination.inventory[right] || compareText(left, right));
    const resource = wanted[0];
    if (resource === undefined) continue;
    const donors = world.settlements
      .filter(
        (settlement) => {
          if (settlement.id === destination.id || settlement.inventory[resource] <= CONTRACT_DONOR_RESERVE) return false;
          const report = destination.knowledge.find(
            (knowledge) => knowledge.subjectSettlementId === settlement.id && knowledge.resource === resource,
          );
          return report !== undefined
            && report.confidence >= 180_000
            && report.reportedQuantity > CONTRACT_DONOR_RESERVE;
        },
      )
      .sort(
        (left, right) => {
          const leftReport = destination.knowledge.find(
            (knowledge) => knowledge.subjectSettlementId === left.id && knowledge.resource === resource,
          );
          const rightReport = destination.knowledge.find(
            (knowledge) => knowledge.subjectSettlementId === right.id && knowledge.resource === resource,
          );
          return (rightReport?.reportedQuantity ?? 0) - (leftReport?.reportedQuantity ?? 0)
            || right.inventory[resource] - left.inventory[resource]
            || left.id - right.id;
        },
      );
    const origin = donors[0];
    if (origin === undefined) continue;
    const route = findRouteBetween(world, origin.id, destination.id);
    if (route === undefined) continue;
    const quantity = Math.min(
      playerCarryLimit(resource),
      CONTRACT_TARGET_STOCK - destination.inventory[resource],
      origin.inventory[resource] - CONTRACT_DONOR_RESERVE,
    );
    if (quantity <= 0) continue;
    const requester = beneficiaryForDelivery(world, destination.id, resource);
    if (requester === undefined) continue;

    const contract: ContractState = {
      id: world.meta.nextEntityId,
      requesterResidentId: requester.id,
      originSettlementId: origin.id,
      destinationSettlementId: destination.id,
      resource,
      quantity,
      cargoQuantity: 0,
      status: "offered",
      reason: "shortage",
      createdTick: tick,
      playerExclusiveUntilTick: tick + 300,
      dueTick: tick + 720,
      acceptedTick: null,
      departedTick: null,
      arrivalTick: null,
      completedTick: null,
      carrierKind: null,
      assignedResidentId: null,
      routeId: route.id,
      porterRouteIds: [],
      porterSettlementIds: [],
      deliveryCondition: null,
      deliveryGrade: null,
      deliveryTraceCost: null,
    };
    world.meta.nextEntityId += 1;
    world.contracts.push(contract);
    emitEvent(world, tick, "contract-offered", contract.id, {
      originSettlementId: origin.id,
      destinationSettlementId: destination.id,
      resource,
      quantity,
    });
    remainingSlots -= 1;
  }
}

function chooseCourier(world: WorldState, contract: ContractState): ResidentState | undefined {
  if (findAutonomousRoutePlan(world, contract.originSettlementId, contract.destinationSettlementId) === undefined) {
    return undefined;
  }
  return world.residents
    .filter(
      (resident) =>
        resident.activeContractId === null &&
        resident.location.kind === "settlement" &&
        resident.location.settlementId === contract.originSettlementId,
    )
    .sort((left, right) => (left.role === "navigator" ? -1 : 0) - (right.role === "navigator" ? -1 : 0) || left.id - right.id)[0];
}

function changeSettlementTrust(world: WorldState, leftId: number, rightId: number, amount: number): void {
  const left = settlementById(world, leftId);
  const right = settlementById(world, rightId);
  const leftTrust = left?.trust.find((trust) => trust.settlementId === rightId);
  const rightTrust = right?.trust.find((trust) => trust.settlementId === leftId);
  if (leftTrust !== undefined && rightTrust !== undefined) {
    const value = clampInteger(Math.min(leftTrust.value, rightTrust.value) + amount);
    leftTrust.value = value;
    rightTrust.value = value;
  }
}

function refreshKnowledge(world: WorldState, observerId: number, subjectId: number, resource: ResourceKind): void {
  const observer = settlementById(world, observerId);
  const subject = settlementById(world, subjectId);
  if (observer === undefined || subject === undefined) return;
  const record = observer.knowledge.find(
    (knowledge) => knowledge.subjectSettlementId === subjectId && knowledge.resource === resource,
  );
  if (record !== undefined) {
    record.reportedQuantity = subject.inventory[resource];
    record.ageTicks = 0;
    record.confidence = FIXED_POINT;
    record.verified = true;
  }
}

function beneficiaryForDelivery(
  world: WorldState,
  settlementId: number,
  resource: ResourceKind,
): ResidentState | undefined {
  const settlement = settlementById(world, settlementId);
  if (settlement === undefined) return undefined;
  const preferredRole: ResidentState["role"] = resource === "medicine"
    ? "medic"
    : resource === "parts"
      ? "mechanic"
      : resource === "reed"
        ? "harvester"
        : resource === "freshWater"
          ? "steward"
          : "fisher";
  const residents = settlement.residentIds
    .map((id) => residentById(world, id))
    .filter((resident): resident is ResidentState => resident !== undefined)
    .sort((left, right) => {
      const leftPreferred = left.role === preferredRole ? 0 : 1;
      const rightPreferred = right.role === preferredRole ? 0 : 1;
      return leftPreferred - rightPreferred || right.needs.belonging - left.needs.belonging || left.id - right.id;
    });
  return residents[0];
}

function routeConditionForContract(world: WorldState, contract: ContractState): number {
  const routeIds = contract.carrierKind === "resident" && contract.porterRouteIds.length > 0
    ? contract.porterRouteIds
    : [contract.routeId];
  const conditions = routeIds.map((routeId) => {
    const route = world.routes.find((candidate) => candidate.id === routeId);
    return route === undefined ? 500_000 : Math.trunc((route.condition + route.reliability) / 2);
  });
  return Math.min(...conditions);
}

function porterTrace(world: WorldState, contract: ContractState): number[] {
  const trace: number[] = [];
  for (let index = 0; index < contract.porterRouteIds.length; index += 1) {
    const route = world.routes.find((candidate) => candidate.id === contract.porterRouteIds[index]);
    const fromSettlementId = contract.porterSettlementIds[index];
    if (!route || fromSettlementId === undefined) continue;
    const path = route.fromSettlementId === fromSettlementId ? route.path : [...route.path].reverse();
    trace.push(...(trace.length === 0 ? path : path.slice(1)));
  }
  return trace;
}

function updatePorterLocation(world: WorldState, contract: ContractState, tick: number, resident: ResidentState): void {
  if (contract.departedTick === null || contract.arrivalTick === null || contract.porterRouteIds.length === 0) return;
  const routes = contract.porterRouteIds
    .map((routeId) => world.routes.find((route) => route.id === routeId))
    .filter((route): route is NonNullable<typeof route> => route !== undefined);
  if (routes.length === 0) return;
  const weights = routes.map((route) => Math.max(1, route.baseTravelTicks));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const duration = Math.max(1, contract.arrivalTick - contract.departedTick);
  const elapsedWeight = Math.min(totalWeight, Math.max(0, ((tick - contract.departedTick) * totalWeight) / duration));
  let accumulated = 0;
  let legIndex = routes.length - 1;
  for (let index = 0; index < weights.length; index += 1) {
    const weight = weights[index] ?? 1;
    if (elapsedWeight <= accumulated + weight) {
      legIndex = index;
      break;
    }
    accumulated += weight;
  }
  const route = routes[legIndex];
  const weight = weights[legIndex] ?? 1;
  const fromSettlementId = contract.porterSettlementIds[legIndex];
  if (!route || fromSettlementId === undefined) return;
  const legProgress = clampInteger(Math.trunc(((elapsedWeight - accumulated) * FIXED_POINT) / weight));
  const orientedProgress = route.fromSettlementId === fromSettlementId ? legProgress : FIXED_POINT - legProgress;
  resident.location = { kind: "route", routeId: route.id, progress: orientedProgress };
}

function traceTravelCost(world: WorldState, trace: readonly number[]): number {
  let cost = 0;
  for (let index = 1; index < trace.length; index += 1) {
    const previous = world.terrain.tiles[trace[index - 1] ?? -1];
    const tile = world.terrain.tiles[trace[index] ?? -1];
    if (previous === undefined || tile === undefined) throw new Error("Validated trace became invalid");
    const diagonal = previous.x !== tile.x && previous.y !== tile.y;
    cost += Math.trunc((tile.baseTravelCost * (diagonal ? 1_414 : 1_000)) / 1_000);
  }
  return cost;
}

function contributeDeliveryToProject(
  world: WorldState,
  contract: ContractState,
  condition: number,
  tick: number,
): number {
  const settlement = settlementById(world, contract.destinationSettlementId);
  if (settlement === undefined || settlement.project.status === "complete" || settlement.project.resource !== contract.resource) {
    return 0;
  }
  const proposed = Math.max(1, Math.trunc((contract.quantity * condition) / (FIXED_POINT * 2)));
  const remaining = settlement.project.target - settlement.project.progress;
  const contribution = Math.min(proposed, remaining, settlement.inventory[contract.resource]);
  if (contribution <= 0) return 0;
  settlement.inventory[contract.resource] -= contribution;
  world.ledger.consumed[contract.resource] += contribution;
  settlement.project.progress += contribution;
  if (settlement.project.progress >= settlement.project.target) {
    completeProject(world, settlement, tick);
  }
  return contribution;
}

function completeContract(
  world: WorldState,
  contract: ContractState,
  tick: number,
  condition: number,
  playerTrace?: readonly number[],
): void {
  const destination = settlementById(world, contract.destinationSettlementId);
  const route = world.routes.find((candidate) => candidate.id === contract.routeId);
  const resident = contract.assignedResidentId === null ? undefined : residentById(world, contract.assignedResidentId);
  if (destination === undefined || route === undefined || (contract.carrierKind === "resident" && resident === undefined)) {
    throw new Error(`Contract ${contract.id} lost an authoritative reference`);
  }
  destination.inventory[contract.resource] += contract.cargoQuantity;
  contract.cargoQuantity = 0;
  contract.status = "fulfilled";
  contract.completedTick = tick;
  contract.deliveryCondition = condition;
  contract.deliveryGrade = deliveryGrade(condition);
  if (resident !== undefined) {
    resident.location = { kind: "settlement", settlementId: destination.id };
    resident.activeContractId = null;
    resident.intention = "work";
    resident.needs.belonging = clampInteger(resident.needs.belonging - 45_000);
  }
  const usedRoutes = contract.carrierKind === "resident" && contract.porterRouteIds.length > 0
    ? contract.porterRouteIds
        .map((routeId) => world.routes.find((candidate) => candidate.id === routeId))
        .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined)
    : [route];
  for (const usedRoute of usedRoutes) {
    const playerCarried = contract.carrierKind === "player";
    usedRoute.traceStrength = clampInteger(
      usedRoute.traceStrength + (playerCarried ? 8_000 + Math.trunc(condition / 55) : 2_000 + Math.trunc(condition / 220)),
    );
    usedRoute.reliability = clampInteger(
      usedRoute.reliability + (playerCarried ? 5_000 + Math.trunc(condition / 90) : 1_500 + Math.trunc(condition / 300)),
    );
    usedRoute.traffic += 1;
    usedRoute.lastUsedTick = tick;
  }
  const tracedTiles = playerTrace ?? porterTrace(world, contract);
  contract.deliveryTraceCost = traceTravelCost(world, tracedTiles);
  for (const tileIndex of tracedTiles) {
    const tile = world.terrain.tiles[tileIndex];
    if (tile !== undefined) tile.traceStrength = clampInteger(tile.traceStrength + 300 + Math.trunc(condition / 1_000));
  }
  changeSettlementTrust(
    world,
    contract.originSettlementId,
    contract.destinationSettlementId,
    6_000 + Math.trunc(condition / 50),
  );
  refreshKnowledge(world, contract.originSettlementId, contract.destinationSettlementId, contract.resource);
  refreshKnowledge(world, contract.destinationSettlementId, contract.originSettlementId, contract.resource);
  const beneficiary = residentById(world, contract.requesterResidentId)
    ?? beneficiaryForDelivery(world, contract.destinationSettlementId, contract.resource);
  if (beneficiary !== undefined) {
    beneficiary.needs.belonging = Math.max(0, beneficiary.needs.belonging - 24_000);
    if (contract.resource === "food" || contract.resource === "freshWater") {
      beneficiary.needs.food = Math.max(0, beneficiary.needs.food - 32_000);
    }
    if (contract.resource === "medicine") {
      beneficiary.needs.rest = Math.max(0, beneficiary.needs.rest - 20_000);
    }
  }
  const projectContribution = contributeDeliveryToProject(world, contract, condition, tick);
  emitEvent(world, tick, "contract-fulfilled", contract.id, {
    residentId: resident?.id ?? null,
    carrier: contract.carrierKind,
    quantity: contract.quantity,
    resource: contract.resource,
    condition,
    grade: contract.deliveryGrade,
    traceCost: contract.deliveryTraceCost,
    projectContribution,
    originSettlementId: contract.originSettlementId,
    destinationSettlementId: contract.destinationSettlementId,
    routeId: route.id,
    routeHops: usedRoutes.length,
    beneficiaryResidentId: beneficiary?.id ?? null,
  });
}

function advanceContracts(world: WorldState, tick: number): void {
  for (const contract of [...world.contracts].sort((left, right) => left.id - right.id)) {
    if ((contract.status === "offered" || contract.status === "accepted") && tick > contract.dueTick) {
      contract.status = "expired";
      contract.completedTick = tick;
      releaseResident(world, contract);
      emitEvent(world, tick, "contract-expired", contract.id, {});
      continue;
    }

    if (contract.status === "offered" && tick >= contract.playerExclusiveUntilTick) {
      const courier = chooseCourier(world, contract);
      if (courier !== undefined) acceptContract(world, contract, courier, tick);
    }

    if (
      contract.status === "accepted" &&
      contract.carrierKind === "resident" &&
      contract.acceptedTick !== null &&
      tick > contract.acceptedTick
    ) {
      const origin = settlementById(world, contract.originSettlementId);
      const resident = contract.assignedResidentId === null ? undefined : residentById(world, contract.assignedResidentId);
      const routePlan = findAutonomousRoutePlan(world, contract.originSettlementId, contract.destinationSettlementId);
      const firstRoute = routePlan === undefined
        ? undefined
        : world.routes.find((candidate) => candidate.id === routePlan.routeIds[0]);
      if (origin !== undefined && resident !== undefined && routePlan !== undefined && firstRoute !== undefined && origin.inventory[contract.resource] >= contract.quantity) {
        contract.porterRouteIds = [...routePlan.routeIds];
        contract.porterSettlementIds = [...routePlan.settlementIds];
        origin.inventory[contract.resource] -= contract.quantity;
        contract.cargoQuantity = contract.quantity;
        contract.status = "in-transit";
        contract.departedTick = tick;
        const tidePenalty = world.tide.level > 470_000 ? Math.trunc(routePlan.travelTicks / 5) : 0;
        contract.arrivalTick = tick + routePlan.travelTicks + tidePenalty;
        resident.location = {
          kind: "route",
          routeId: firstRoute.id,
          progress: firstRoute.fromSettlementId === contract.originSettlementId ? 0 : FIXED_POINT,
        };
        emitEvent(world, tick, "contract-departed", contract.id, {
          residentId: resident.id,
          arrivalTick: contract.arrivalTick,
          routeHops: routePlan.routeIds.length,
          bottleneckReliability: routePlan.bottleneckReliability,
        });
      }
    }

    if (contract.status === "in-transit" && contract.departedTick !== null && contract.arrivalTick !== null) {
      const resident = contract.assignedResidentId === null ? undefined : residentById(world, contract.assignedResidentId);
      if (resident !== undefined && resident.location.kind === "route") {
        updatePorterLocation(world, contract, tick, resident);
      }
      if (tick >= contract.arrivalTick && contract.carrierKind === "resident") {
        const deliveredCondition = clampInteger(
          routeConditionForContract(world, contract) - Math.trunc(world.weather.intensity / 8),
          180_000,
          FIXED_POINT,
        );
        completeContract(world, contract, tick, deliveredCondition);
      }
    }
  }
}

function decayRoutes(world: WorldState, tick: number): void {
  if (tick % 60 !== 0) return;
  for (const route of world.routes) {
    route.traffic = Math.max(0, route.traffic - 1);
    if (tick - route.lastUsedTick > 360) route.traceStrength = Math.max(0, route.traceStrength - 180);
    if (world.weather.kind === "storm") {
      route.condition = Math.max(180_000, route.condition - Math.trunc(world.weather.intensity / 420));
    }
  }
}

function trimEventHistory(world: WorldState): void {
  if (world.events.length > MAX_EVENT_HISTORY) {
    world.events.splice(0, world.events.length - MAX_EVENT_HISTORY);
  }
}

function pruneTerminalContracts(world: WorldState): void {
  const terminal = world.contracts.filter(
    (contract) => contract.status === "fulfilled" || contract.status === "expired" || contract.status === "cancelled",
  );
  if (terminal.length <= MAX_TERMINAL_CONTRACT_HISTORY) return;
  const retainedTerminalIds = new Set(
    terminal
      .sort((left, right) => right.id - left.id)
      .slice(0, MAX_TERMINAL_CONTRACT_HISTORY)
      .map((contract) => contract.id),
  );
  world.contracts = world.contracts.filter(
    (contract) =>
      contract.status === "offered" ||
      contract.status === "accepted" ||
      contract.status === "in-transit" ||
      retainedTerminalIds.has(contract.id),
  );
  world.contracts.sort((left, right) => left.id - right.id);
}

export function createWorld(seedText: string, pressureMode: PressureMode = "standard"): WorldState {
  if (pressureMode !== "calm" && pressureMode !== "standard" && pressureMode !== "wild") {
    throw new RangeError("Pressure mode must be calm, standard, or wild");
  }
  const world = createInitialWorld(seedText, pressureMode);
  generateDemandContracts(world, 0);
  return world;
}

export function stepWorld(world: WorldState, commands: readonly SimCommand[] = []): WorldState {
  const tick = world.meta.completedTick + 1;
  applyCommands(world, commands, tick);
  world.tide = tideAtTick(tick);
  updateWeather(world, tick);
  ageKnowledge(world, tick);
  runProduction(world, tick);
  updateResidentNeeds(world, tick);
  updateProjects(world, tick);
  if (tick % 60 === 0) generateDemandContracts(world, tick);
  advanceContracts(world, tick);
  decayRoutes(world, tick);
  pruneTerminalContracts(world);
  world.meta.completedTick = tick;
  trimEventHistory(world);
  return world;
}

function commandsAt(commandsByTick: CommandsByTick | undefined, tick: number): readonly SimCommand[] {
  if (commandsByTick === undefined) return [];
  if (commandsByTick instanceof Map) return commandsByTick.get(tick) ?? [];
  return (commandsByTick as Readonly<Record<number, readonly SimCommand[]>>)[tick] ?? [];
}

export function runTicks(
  world: WorldState,
  count: number,
  commandsByTick?: CommandsByTick,
): WorldState {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError("Tick count must be a non-negative safe integer");
  }
  for (let index = 0; index < count; index += 1) {
    const targetTick = world.meta.completedTick + 1;
    stepWorld(world, commandsAt(commandsByTick, targetTick));
  }
  return world;
}

export const LEGAL_CONTRACT_STATUSES: readonly ContractStatus[] = [
  "offered",
  "accepted",
  "in-transit",
  "fulfilled",
  "expired",
  "cancelled",
];

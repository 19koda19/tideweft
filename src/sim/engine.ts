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
  type ResidentMemory,
  type ResidentState,
  type ResourceKind,
  type RouteState,
  type SimCommand,
  type SimEventDatum,
  type SimEventType,
  type SettlementState,
  type WorldState,
} from "./types";
import { clampInteger, compareText } from "./util";
import { createInitialWorld, findRouteBetween, pressureMultiplier } from "./world";
import { findAutonomousRoutePlan } from "./network";
import {
  MAX_RESIDENT_MEMORIES,
  residentRainProtection,
  residentSkillAptitude,
} from "./npcIdentity";

const WEATHER_DOMAIN = 0x5745_4154;
const MAX_EVENT_HISTORY = 512;
const CONTRACT_TARGET_STOCK = 46;
const CONTRACT_DONOR_RESERVE = 54;
const CONTRACT_OFFER_LIMIT = 18;
const MAX_TERMINAL_CONTRACT_HISTORY = 256;

/** A traced corridor must be substantially followed before traffic can strengthen it. */
export const MIN_ROUTE_REINFORCEMENT_COVERAGE = 700_000;
export const TIDE_CHOIR_CONDITION_BONUS = 30_000;
export const TIDE_CHOIR_RELIABILITY_BONUS = 40_000;

export interface RouteTraceCoverage {
  routeId: number;
  coverage: number;
}

type RouteCoverageWorld = {
  readonly terrain: {
    readonly tiles: readonly { readonly x: number; readonly y: number }[];
  };
};

type RouteCoveragePath = Pick<RouteState, "path">;

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

function appendResidentMemory(resident: ResidentState, memory: ResidentMemory): void {
  if (resident.memories.some(({ id }) => id === memory.id)) return;
  resident.memories.push(memory);
  resident.memories.sort((left, right) => left.tick - right.tick || compareText(left.id, right.id));
  if (resident.memories.length > MAX_RESIDENT_MEMORIES) {
    resident.memories.splice(0, resident.memories.length - MAX_RESIDENT_MEMORIES);
  }
}

function observeResident(
  world: WorldState,
  residentId: number,
  tick: number,
  commandId: string,
): string | null {
  const resident = residentById(world, residentId);
  if (!resident) return "resident does not exist";
  if (resident.playerKnowledge.firstObservedTick === null) {
    resident.playerKnowledge.firstObservedTick = tick;
    resident.playerKnowledge.level = "recognized";
    emitEvent(world, tick, "resident-observed", resident.id, {
      commandId,
      knowledgeLevel: resident.playerKnowledge.level,
    });
  }
  return null;
}

function greetResident(
  world: WorldState,
  residentId: number,
  tick: number,
  commandId: string,
  observedTick: number,
): string | null {
  const resident = residentById(world, residentId);
  if (!resident) return "resident does not exist";
  if (resident.playerKnowledge.firstObservedTick === null) return "resident has not been observed";
  if (resident.playerKnowledge.firstObservedTick !== observedTick) return "resident observation proof is stale";
  if (resident.playerKnowledge.introducedTick === null) {
    resident.playerKnowledge.level = "acquainted";
    resident.playerKnowledge.introducedTick = tick;
    resident.playerKnowledge.facts = ["name", "occupation", "home"];
    appendResidentMemory(resident, {
      id: `${resident.identity.stableId}:met-player`,
      kind: "met-player",
      tick,
      cause: "PLAYER_GREETING",
    });
    emitEvent(world, tick, "resident-introduced", resident.id, {
      commandId,
      knowledgeLevel: resident.playerKnowledge.level,
      homeSettlementId: resident.homeSettlementId,
    });
  }
  return null;
}

function releaseResident(world: WorldState, contract: ContractState): void {
  if (contract.assignedResidentId === null) return;
  const resident = residentById(world, contract.assignedResidentId);
  if (resident !== undefined) {
    resident.activeContractId = null;
    resident.intention = "work";
    resident.condition.sheltering = false;
    resident.condition.emotion = "content";
    resident.condition.emotionCause = "ROUTINE_SAFE";
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
  resident.condition.sheltering = false;
  resident.condition.routeDelayTicks = 0;
  resident.condition.emotion = "focused";
  resident.condition.emotionCause = "PROMISE_IN_PROGRESS";
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

function tileIndicesAreAdjacent(
  world: RouteCoverageWorld,
  leftIndex: number,
  rightIndex: number,
): boolean {
  const left = world.terrain.tiles[leftIndex];
  const right = world.terrain.tiles[rightIndex];
  return left !== undefined
    && right !== undefined
    && Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y)) <= 1;
}

function corridorCoverageInRange(
  world: RouteCoverageWorld,
  route: RouteCoveragePath,
  trace: readonly number[],
  firstTraceIndex: number,
  lastTraceIndex: number,
): number {
  const tileIsCovered = (routeTileIndex: number): boolean => {
    for (let traceIndex = firstTraceIndex; traceIndex <= lastTraceIndex; traceIndex += 1) {
      const traceTileIndex = trace[traceIndex];
      if (traceTileIndex !== undefined && tileIndicesAreAdjacent(world, routeTileIndex, traceTileIndex)) {
        return true;
      }
    }
    return false;
  };

  let longestCoveredRun = 0;
  let coveredRun = 0;
  for (let routeIndex = 1; routeIndex < route.path.length; routeIndex += 1) {
    const previousRouteTile = route.path[routeIndex - 1];
    const routeTile = route.path[routeIndex];
    if (
      previousRouteTile !== undefined
      && routeTile !== undefined
      && tileIsCovered(previousRouteTile)
      && tileIsCovered(routeTile)
    ) {
      coveredRun += 1;
      longestCoveredRun = Math.max(longestCoveredRun, coveredRun);
    } else {
      coveredRun = 0;
    }
  }
  return Math.trunc((longestCoveredRun * FIXED_POINT) / (route.path.length - 1));
}

/**
 * Measures how much of a harbor-to-harbor route corridor a tile trace actually
 * followed. Both route endpoints must be reached (their eight neighboring
 * tiles count), and only the trace section between those endpoint visits is
 * measured. This keeps a remote detour from strengthening a nominal shortcut
 * while allowing a natural diagonal crossing beside an orthogonal route path.
 */
export function calculateRouteTraceCoverage(
  world: RouteCoverageWorld,
  route: RouteCoveragePath,
  trace: readonly number[],
): number {
  if (route.path.length < 2 || trace.length < 2) return 0;
  for (const tileIndex of route.path) {
    if (!Number.isSafeInteger(tileIndex) || world.terrain.tiles[tileIndex] === undefined) return 0;
  }
  for (const tileIndex of trace) {
    if (!Number.isSafeInteger(tileIndex) || world.terrain.tiles[tileIndex] === undefined) return 0;
  }

  const firstRouteTile = route.path[0];
  const lastRouteTile = route.path[route.path.length - 1];
  if (firstRouteTile === undefined || lastRouteTile === undefined) return 0;

  const firstEndpointHits: number[] = [];
  const lastEndpointHits: number[] = [];
  for (let index = 0; index < trace.length; index += 1) {
    const traceTile = trace[index];
    if (traceTile === undefined) continue;
    if (tileIndicesAreAdjacent(world, firstRouteTile, traceTile)) firstEndpointHits.push(index);
    if (tileIndicesAreAdjacent(world, lastRouteTile, traceTile)) lastEndpointHits.push(index);
  }

  let bestCoverage = 0;
  const measureOrientation = (starts: readonly number[], ends: readonly number[]): void => {
    const first = starts[0];
    const last = ends[ends.length - 1];
    if (first === undefined || last === undefined || first >= last) return;
    bestCoverage = Math.max(
      bestCoverage,
      corridorCoverageInRange(world, route, trace, first, last),
    );
  };
  measureOrientation(firstEndpointHits, lastEndpointHits);
  measureOrientation(lastEndpointHits, firstEndpointHits);
  return bestCoverage;
}

/** Returns only substantially traversed routes, in stable route-ID order. */
export function findTraceReinforcedRoutes(
  world: RouteCoverageWorld & {
    readonly settlements: readonly { readonly id: number; readonly tileIndex: number }[];
    readonly routes: readonly RouteState[];
  },
  trace: readonly number[],
): RouteTraceCoverage[] {
  const settlementByTile = new Map(
    world.settlements.map((settlement) => [settlement.tileIndex, settlement.id] as const),
  );
  const checkpoints: { settlementId: number; traceIndex: number }[] = [];
  for (let traceIndex = 0; traceIndex < trace.length; traceIndex += 1) {
    const tileIndex = trace[traceIndex];
    const settlementId = tileIndex === undefined ? undefined : settlementByTile.get(tileIndex);
    if (settlementId === undefined) continue;
    const previous = checkpoints[checkpoints.length - 1];
    if (previous?.settlementId === settlementId) previous.traceIndex = traceIndex;
    else checkpoints.push({ settlementId, traceIndex });
  }

  const coverageByRouteId = new Map<number, number>();
  for (let checkpointIndex = 1; checkpointIndex < checkpoints.length; checkpointIndex += 1) {
    const from = checkpoints[checkpointIndex - 1];
    const to = checkpoints[checkpointIndex];
    if (from === undefined || to === undefined || from.settlementId === to.settlementId) continue;
    const low = Math.min(from.settlementId, to.settlementId);
    const high = Math.max(from.settlementId, to.settlementId);
    const route = world.routes.find(
      (candidate) => candidate.fromSettlementId === low && candidate.toSettlementId === high,
    );
    if (route === undefined) continue;
    const coverage = calculateRouteTraceCoverage(
      world,
      route,
      trace.slice(from.traceIndex, to.traceIndex + 1),
    );
    if (coverage < MIN_ROUTE_REINFORCEMENT_COVERAGE) continue;
    coverageByRouteId.set(route.id, Math.max(coverageByRouteId.get(route.id) ?? 0, coverage));
  }

  return [...coverageByRouteId]
    .map(([routeId, coverage]) => ({ routeId, coverage }))
    .sort((left, right) => left.routeId - right.routeId);
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

function awakenTideChoir(
  world: WorldState,
  command: Extract<SimCommand, { type: "awaken-tide-choir" }>,
  tick: number,
): string | null {
  if (!Array.isArray(command.routeIds) || command.routeIds.length < 3 || command.routeIds.length > 7) {
    return "a tide choir must contain 3 to 7 routes";
  }
  if (command.routeIds.some((routeId) => !Number.isSafeInteger(routeId) || routeId <= 0)) {
    return "tide choir route IDs must be positive safe integers";
  }
  const routeIds = [...command.routeIds].sort((left, right) => left - right);
  if (new Set(routeIds).size !== routeIds.length) return "a tide choir cannot repeat a route";
  const routes = routeIds.map((routeId) => world.routes.find((route) => route.id === routeId));
  if (routes.some((route) => route === undefined)) return "tide choir route does not exist";

  const degreeBySettlement = new Map<number, number>();
  const neighborsBySettlement = new Map<number, number[]>();
  for (const route of routes) {
    if (route === undefined) continue;
    degreeBySettlement.set(route.fromSettlementId, (degreeBySettlement.get(route.fromSettlementId) ?? 0) + 1);
    degreeBySettlement.set(route.toSettlementId, (degreeBySettlement.get(route.toSettlementId) ?? 0) + 1);
    const fromNeighbors = neighborsBySettlement.get(route.fromSettlementId) ?? [];
    fromNeighbors.push(route.toSettlementId);
    neighborsBySettlement.set(route.fromSettlementId, fromNeighbors);
    const toNeighbors = neighborsBySettlement.get(route.toSettlementId) ?? [];
    toNeighbors.push(route.fromSettlementId);
    neighborsBySettlement.set(route.toSettlementId, toNeighbors);
  }
  const settlementIds = [...degreeBySettlement.keys()].sort((left, right) => left - right);
  if (
    settlementIds.length !== routeIds.length
    || settlementIds.some((settlementId) => degreeBySettlement.get(settlementId) !== 2)
  ) {
    return "tide choir routes must form one simple cycle";
  }
  const visited = new Set<number>();
  const pending = settlementIds[0] === undefined ? [] : [settlementIds[0]];
  while (pending.length > 0) {
    const settlementId = pending.pop();
    if (settlementId === undefined || visited.has(settlementId)) continue;
    visited.add(settlementId);
    for (const neighbor of neighborsBySettlement.get(settlementId) ?? []) {
      if (!visited.has(neighbor)) pending.push(neighbor);
    }
  }
  if (visited.size !== settlementIds.length) return "tide choir routes must form one connected cycle";

  const signature = routeIds.join(",");
  if (world.choirs.some((choir) => choir.routeIds.join(",") === signature)) {
    return "that tide choir is already awake";
  }

  const choir = {
    id: world.meta.nextEntityId,
    routeIds,
    settlementIds,
    awakenedTick: tick,
  };
  world.meta.nextEntityId += 1;
  world.choirs.push(choir);
  for (const route of routes) {
    if (route === undefined) continue;
    route.condition = clampInteger(route.condition + TIDE_CHOIR_CONDITION_BONUS);
    route.reliability = clampInteger(route.reliability + TIDE_CHOIR_RELIABILITY_BONUS);
  }
  emitEvent(world, tick, "tide-choir-awakened", choir.id, {
    commandId: command.id,
    choirId: choir.id,
    routeCount: routeIds.length,
    routeIds: signature,
    settlementCount: settlementIds.length,
    settlementIds: settlementIds.join(","),
    conditionBonus: TIDE_CHOIR_CONDITION_BONUS,
    reliabilityBonus: TIDE_CHOIR_RELIABILITY_BONUS,
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
        } else if (command.trace === undefined) {
          error = "player delivery requires a traveled trace";
        } else if (command.routeEvidence === "regional-detour") {
          if (command.trace.length !== 0) {
            error = "regional detour delivery cannot claim compatibility route tiles";
          } else {
            completeContract(world, contract, tick, command.condition, command.trace);
          }
        } else if (
          command.routeEvidence !== undefined
          && command.routeEvidence !== "compatibility-trace"
        ) {
          error = "delivery route evidence kind is invalid";
        } else {
          const traceError = validateTrace(world, contract, command.trace);
          if (traceError !== null) error = traceError;
          else completeContract(world, contract, tick, command.condition, command.trace);
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
      case "awaken-tide-choir":
        error = awakenTideChoir(world, command, tick);
        break;
      case "share-knowledge":
        error = shareKnowledge(world, command, tick);
        break;
      case "observe-resident":
        error = observeResident(world, command.residentId, tick, command.id);
        break;
      case "greet-resident":
        error = greetResident(world, command.residentId, tick, command.id, command.observedTick);
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

function activeContractForResident(world: WorldState, resident: ResidentState): ContractState | undefined {
  if (resident.activeContractId === null) return undefined;
  return world.contracts.find((contract) =>
    contract.id === resident.activeContractId
    && contract.assignedResidentId === resident.id
    && (contract.status === "accepted" || contract.status === "in-transit")
  );
}

function residentRouteEventLocus(resident: ResidentState): Record<string, SimEventDatum> {
  return resident.location.kind === "route"
    ? {
        eventRouteId: resident.location.routeId,
        eventRouteProgress: resident.location.progress,
      }
    : {};
}

function residentShelterThreshold(resident: ResidentState): number {
  let threshold = 610_000;
  if (resident.identity.temperament.includes("cautious")) threshold -= 90_000;
  if (resident.identity.temperament.includes("nervous")) threshold -= 55_000;
  if (resident.identity.temperament.includes("bold")) threshold += 75_000;
  if (resident.identity.temperament.includes("stubborn")) threshold += 45_000;
  // Weather knowledge makes a courier act on legible warning signs sooner.
  threshold -= Math.trunc(residentSkillAptitude(resident.identity, "weather-knowledge") / 12);
  return clampInteger(threshold, 360_000, 760_000);
}

function updateResidentConditions(world: WorldState, tick: number): void {
  const raining = world.weather.kind === "rain" || world.weather.kind === "storm";
  const stormBonus = world.weather.kind === "storm" ? 180_000 : 0;
  const windPressure = Math.trunc((Math.abs(world.weather.windX) + Math.abs(world.weather.windY)) / 2);

  for (const resident of world.residents) {
    const condition = resident.condition;
    const contract = activeContractForResident(world, resident);
    const onRoute = resident.location.kind === "route";

    if (condition.sheltering && contract?.status === "in-transit" && onRoute) {
      const weatherStillUnsafe = raining
        && (world.weather.intensity + stormBonus + windPressure / 2 >= 360_000);
      if (weatherStillUnsafe) {
        const exposure = Math.max(0, FIXED_POINT - residentRainProtection(resident.identity));
        condition.wetness = clampInteger(
          condition.wetness + Math.max(200, Math.trunc((world.weather.intensity * exposure) / FIXED_POINT / 72)),
        );
        condition.coldStress = clampInteger(
          condition.coldStress + Math.max(100, Math.trunc((windPressure * exposure) / FIXED_POINT / 90)),
        );
        condition.exhaustion = Math.max(0, condition.exhaustion - 1_000);
      } else {
        condition.wetness = Math.max(0, condition.wetness - 22_000);
        condition.coldStress = Math.max(0, condition.coldStress - 16_000);
        condition.exhaustion = Math.max(0, condition.exhaustion - 5_000);
      }
      if (!weatherStillUnsafe && condition.coldStress < 320_000) {
        condition.sheltering = false;
        condition.emotion = "relieved";
        condition.emotionCause = "SHELTER_REACHED";
        emitEvent(world, tick, "resident-resumed", resident.id, {
          contractId: contract.id,
          routeDelayTicks: condition.routeDelayTicks,
          ...residentRouteEventLocus(resident),
        });
      } else {
        condition.routeDelayTicks += 1;
        if (contract.arrivalTick !== null) contract.arrivalTick += 1;
      }
      continue;
    }

    if (condition.sheltering) condition.sheltering = false;
    if (raining && onRoute) {
      const protection = residentRainProtection(resident.identity);
      const exposure = Math.max(0, FIXED_POINT - protection);
      const precipitation = Math.min(FIXED_POINT, world.weather.intensity + stormBonus);
      const wetGain = Math.max(500, Math.trunc((precipitation * exposure) / FIXED_POINT / 18));
      condition.wetness = clampInteger(condition.wetness + wetGain);
      const coldInput = Math.trunc(
        (condition.wetness + precipitation + windPressure) / 3,
      );
      const coldGain = Math.max(250, Math.trunc((coldInput * exposure) / FIXED_POINT / 28));
      condition.coldStress = clampInteger(condition.coldStress + coldGain);
      const navigation = residentSkillAptitude(resident.identity, "navigation");
      condition.exhaustion = clampInteger(
        condition.exhaustion + Math.max(400, 2_800 - Math.trunc(navigation / 500)),
      );
      const dangerPressure = Math.min(
        FIXED_POINT,
        precipitation + Math.trunc(condition.wetness / 3) + Math.trunc(condition.coldStress / 2),
      );
      condition.emotion = dangerPressure >= 760_000 ? "afraid" : "worried";
      condition.emotionCause = "WEATHER_EXPOSURE";

      if (
        contract?.status === "in-transit"
        && dangerPressure >= residentShelterThreshold(resident)
      ) {
        condition.sheltering = true;
        condition.routeDelayTicks += 1;
        if (contract.arrivalTick !== null) contract.arrivalTick += 1;
        const memory: ResidentMemory = {
          id: `${resident.identity.stableId}:weather-shelter:${tick}`,
          kind: "weather-shelter",
          tick,
          cause: "SEVERE_WEATHER",
        };
        appendResidentMemory(resident, memory);
        emitEvent(world, tick, "resident-sheltered", resident.id, {
          contractId: contract.id,
          weather: world.weather.kind,
          intensity: world.weather.intensity,
          routeDelayTicks: condition.routeDelayTicks,
          ...residentRouteEventLocus(resident),
        });
      }
      continue;
    }

    if (onRoute) {
      const protection = residentRainProtection(resident.identity);
      const exposure = Math.max(0, FIXED_POINT - protection);
      const windChillInput = Math.max(0, windPressure - 260_000)
        + Math.trunc(condition.wetness / 4);
      condition.wetness = Math.max(0, condition.wetness - 7_000);
      condition.coldStress = windChillInput > 0
        ? clampInteger(
            condition.coldStress
              + Math.max(100, Math.trunc((windChillInput * exposure) / FIXED_POINT / 75)),
          )
        : Math.max(0, condition.coldStress - 3_000);
      const navigation = residentSkillAptitude(resident.identity, "navigation");
      condition.exhaustion = clampInteger(
        condition.exhaustion + Math.max(350, 1_900 - Math.trunc(navigation / 700)),
      );
    } else {
      condition.wetness = Math.max(0, condition.wetness - 28_000);
      condition.coldStress = Math.max(0, condition.coldStress - 20_000);
      condition.exhaustion = Math.max(0, condition.exhaustion - 2_500);
    }
    if (condition.exhaustion >= 720_000) {
      condition.emotion = "tired";
      condition.emotionCause = "NEED_REST";
    } else if (contract !== undefined) {
      condition.emotion = "focused";
      condition.emotionCause = "PROMISE_IN_PROGRESS";
    } else {
      condition.emotion = "content";
      condition.emotionCause = "ROUTINE_SAFE";
    }
  }
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
    // Presence, not home ownership, determines who can eat, rest, and think at
    // this settlement. Delivered porters remain independent visitors rather
    // than vanishing from the needs simulation at their destination.
    const residents = world.residents
      .filter((resident) =>
        resident.location.kind === "settlement"
        && resident.location.settlementId === settlement.id
      )
      .sort((left, right) => left.identity.stableId < right.identity.stableId
        ? -1
        : left.identity.stableId > right.identity.stableId
          ? 1
          : 0);
    const ration = residents.length === 0 ? 0 : Math.max(1, Math.ceil(residents.length / 3));
    const foodServed = ration > 0 && settlement.inventory.food >= ration;
    const waterServed = ration > 0 && settlement.inventory.freshWater >= ration;
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

  for (const resident of world.residents) {
    if (resident.location.kind !== "route") continue;
    resident.needs.food = clampInteger(
      resident.needs.food + Math.trunc((34_000 * pressure) / FIXED_POINT),
    );
    resident.needs.rest = clampInteger(resident.needs.rest + (isRestPeriod ? -18_000 : 24_000));
    resident.intention = resident.activeContractId !== null ? "carry" : "work";
    resident.nextThinkTick = tick + 15 + (resident.identity.originActorOrdinal % 31);
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
    const requester = beneficiaryForDelivery(world, destination.id, resource, true);
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
    .sort((left, right) => {
      const suitability = (resident: ResidentState): number => {
        const navigation = residentSkillAptitude(resident.identity, "navigation");
        const weather = residentSkillAptitude(resident.identity, "weather-knowledge");
        const practical = resident.identity.temperament.includes("practical") ? 90_000 : 0;
        const patient = resident.identity.temperament.includes("patient") ? 55_000 : 0;
        const weatherFit = world.weather.kind === "rain" || world.weather.kind === "storm"
          ? weather + Math.trunc(residentRainProtection(resident.identity) / 2)
          : 0;
        return navigation + Math.trunc(weather / 3) + practical + patient + weatherFit
          - Math.trunc(resident.condition.exhaustion / 2);
      };
      return suitability(right) - suitability(left) || left.id - right.id;
    })[0];
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
  localOnly = false,
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
  const residents = world.residents
    .filter((resident) =>
      resident.location.kind === "settlement"
      && resident.location.settlementId === settlement.id
      && (!localOnly || resident.homeSettlementId === settlement.id)
    )
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
  const delay = Math.max(0, resident.condition.routeDelayTicks);
  const duration = Math.max(1, contract.arrivalTick - contract.departedTick - delay);
  const effectiveElapsedTicks = Math.max(0, tick - contract.departedTick - delay);
  const elapsedWeight = Math.min(totalWeight, (effectiveElapsedTicks * totalWeight) / duration);
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
    resident.condition.sheltering = false;
    resident.condition.emotion = "relieved";
    resident.condition.emotionCause = "PROMISE_DELIVERED";
    resident.needs.belonging = clampInteger(resident.needs.belonging - 45_000);
  }
  const tracedTiles = playerTrace ?? porterTrace(world, contract);
  const routeCoverages: RouteTraceCoverage[] = contract.carrierKind === "player"
    ? findTraceReinforcedRoutes(world, tracedTiles)
    : [...new Set(contract.porterRouteIds)]
        .sort((left, right) => left - right)
        .map((routeId) => ({ routeId, coverage: FIXED_POINT }));
  const primaryRouteCoverage = contract.carrierKind === "player"
    ? calculateRouteTraceCoverage(world, route, tracedTiles)
    : routeCoverages.some((entry) => entry.routeId === route.id)
      ? FIXED_POINT
      : 0;
  for (const entry of routeCoverages) {
    const usedRoute = world.routes.find((candidate) => candidate.id === entry.routeId);
    if (usedRoute === undefined) continue;
    const playerCarried = contract.carrierKind === "player";
    const fullTraceGain = playerCarried ? 8_000 + Math.trunc(condition / 55) : 2_000 + Math.trunc(condition / 220);
    const fullReliabilityGain = playerCarried ? 5_000 + Math.trunc(condition / 90) : 1_500 + Math.trunc(condition / 300);
    usedRoute.traceStrength = clampInteger(
      usedRoute.traceStrength + Math.trunc((fullTraceGain * entry.coverage) / FIXED_POINT),
    );
    usedRoute.reliability = clampInteger(
      usedRoute.reliability + Math.trunc((fullReliabilityGain * entry.coverage) / FIXED_POINT),
    );
    usedRoute.traffic += 1;
    usedRoute.lastUsedTick = tick;
  }
  contract.deliveryTraceCost = traceTravelCost(world, tracedTiles);
  for (const tileIndex of new Set(tracedTiles)) {
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
  const requester = residentById(world, contract.requesterResidentId);
  const beneficiary = requester?.location.kind === "settlement"
    && requester.location.settlementId === contract.destinationSettlementId
    ? requester
    : beneficiaryForDelivery(world, contract.destinationSettlementId, contract.resource);
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
    routeHops: routeCoverages.length,
    primaryRouteCoverage,
    reinforcedRouteCount: routeCoverages.length,
    reinforcedRouteIds: routeCoverages.map((entry) => entry.routeId).join(","),
    routeEvidence: contract.carrierKind === "player" && tracedTiles.length === 0
      ? "regional-detour-no-credit"
      : contract.carrierKind === "player"
        ? "compatibility-trace"
        : "resident-route",
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
        resident.condition.routeDelayTicks = 0;
        resident.condition.sheltering = false;
        resident.condition.emotion = "focused";
        resident.condition.emotionCause = "PROMISE_IN_PROGRESS";
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
  updateResidentConditions(world, tick);
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

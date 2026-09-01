import {
  FIXED_POINT,
  STRAND_AUTOMATION_THRESHOLD,
  type RouteState,
  type WorldState,
  type WeatherState,
} from "./types";

export interface AutonomousRoutePlan {
  routeIds: number[];
  settlementIds: number[];
  travelTicks: number;
  bottleneckReliability: number;
}

export interface NetworkMetrics {
  activeRouteCount: number;
  connectedSettlementCount: number;
  totalSettlementCount: number;
  componentCount: number;
  bridgeCount: number;
  cycleRank: number;
  resilientSettlementCount: number;
  serviceCoverage: number;
  resilience: number;
  resolved: boolean;
}

export function routeCapacity(world: Pick<WorldState, "settlements">, route: RouteState): number {
  const ferryBonus = world.settlements.some(
    (settlement) =>
      (settlement.id === route.fromSettlementId || settlement.id === route.toSettlementId)
      && settlement.project.kind === "ferry"
      && settlement.project.status === "complete",
  ) ? 1 : 0;
  return 1 + Math.floor(route.traceStrength / 250_000) + ferryBonus;
}

export function routeIsActive(route: RouteState): boolean {
  return route.traceStrength >= STRAND_AUTOMATION_THRESHOLD && route.condition >= 180_000;
}

function routeOpenInWeather(
  world: Pick<WorldState, "settlements">,
  route: RouteState,
  weather: WeatherState,
): boolean {
  if (!routeIsActive(route)) return false;
  if (weather.kind !== "storm" || weather.intensity < 620_000) return true;
  const beaconCoverage = world.settlements.some(
    (settlement) =>
      (settlement.id === route.fromSettlementId || settlement.id === route.toSettlementId)
      && settlement.project.kind === "beacon"
      && settlement.project.status === "complete",
  );
  return route.reliability >= (beaconCoverage ? 580_000 : 640_000) || route.condition >= 900_000;
}

function activePorterLoad(world: Pick<WorldState, "contracts">, routeId: number): number {
  return world.contracts.filter(
    (contract) =>
      contract.status === "in-transit"
      && contract.carrierKind === "resident"
      && contract.porterRouteIds.includes(routeId),
  ).length;
}

function routeCost(world: WorldState, route: RouteState): number {
  const conditionPenalty = Math.trunc((route.baseTravelTicks * (FIXED_POINT - route.condition)) / (FIXED_POINT * 2));
  const reliabilityPenalty = Math.trunc((route.baseTravelTicks * (FIXED_POINT - route.reliability)) / (FIXED_POINT * 2));
  const weatherPenalty = Math.trunc((route.baseTravelTicks * world.weather.intensity) / (FIXED_POINT * 2));
  const load = activePorterLoad(world, route.id);
  const congestionPenalty = load * 12 + route.traffic * 2;
  const overCapacityPenalty = load >= routeCapacity(world, route) ? route.baseTravelTicks * 4 : 0;
  return Math.max(1, route.baseTravelTicks + conditionPenalty + reliabilityPenalty + weatherPenalty + congestionPenalty + overCapacityPenalty);
}

export function findAutonomousRoutePlan(
  world: WorldState,
  originSettlementId: number,
  destinationSettlementId: number,
): AutonomousRoutePlan | undefined {
  if (originSettlementId === destinationSettlementId) {
    return { routeIds: [], settlementIds: [originSettlementId], travelTicks: 0, bottleneckReliability: FIXED_POINT };
  }
  const settlementIds = world.settlements.map((settlement) => settlement.id).sort((left, right) => left - right);
  const distances = new Map<number, number>(settlementIds.map((id) => [id, Number.POSITIVE_INFINITY]));
  const previous = new Map<number, { settlementId: number; routeId: number }>();
  const unvisited = new Set(settlementIds);
  distances.set(originSettlementId, 0);

  while (unvisited.size > 0) {
    let current: number | undefined;
    let currentDistance = Number.POSITIVE_INFINITY;
    for (const candidate of [...unvisited].sort((left, right) => left - right)) {
      const distance = distances.get(candidate) ?? Number.POSITIVE_INFINITY;
      if (distance < currentDistance) {
        current = candidate;
        currentDistance = distance;
      }
    }
    if (current === undefined || !Number.isFinite(currentDistance)) break;
    unvisited.delete(current);
    if (current === destinationSettlementId) break;

    const incident = world.routes
      .filter(
        (route) =>
          routeOpenInWeather(world, route, world.weather)
          && (route.fromSettlementId === current || route.toSettlementId === current),
      )
      .sort((left, right) => left.id - right.id);
    for (const route of incident) {
      const neighbor = route.fromSettlementId === current ? route.toSettlementId : route.fromSettlementId;
      if (!unvisited.has(neighbor)) continue;
      const proposed = currentDistance + routeCost(world, route);
      const known = distances.get(neighbor) ?? Number.POSITIVE_INFINITY;
      const knownPrevious = previous.get(neighbor);
      if (proposed < known || (proposed === known && route.id < (knownPrevious?.routeId ?? Number.MAX_SAFE_INTEGER))) {
        distances.set(neighbor, proposed);
        previous.set(neighbor, { settlementId: current, routeId: route.id });
      }
    }
  }

  const total = distances.get(destinationSettlementId) ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(total)) return undefined;
  const reversedRouteIds: number[] = [];
  const reversedSettlementIds = [destinationSettlementId];
  let cursor = destinationSettlementId;
  while (cursor !== originSettlementId) {
    const step = previous.get(cursor);
    if (step === undefined) return undefined;
    reversedRouteIds.push(step.routeId);
    cursor = step.settlementId;
    reversedSettlementIds.push(cursor);
  }
  const routeIds = reversedRouteIds.reverse();
  const planSettlementIds = reversedSettlementIds.reverse();
  const reliabilities = routeIds.map(
    (routeId) => world.routes.find((route) => route.id === routeId)?.reliability ?? 0,
  );
  return {
    routeIds,
    settlementIds: planSettlementIds,
    travelTicks: Math.max(1, Math.trunc(total)),
    bottleneckReliability: Math.min(...reliabilities),
  };
}

export function calculateNetworkMetrics(world: Pick<WorldState, "settlements" | "routes">): NetworkMetrics {
  const settlementIds = world.settlements.map((settlement) => settlement.id).sort((left, right) => left - right);
  const activeRoutes = world.routes.filter(routeIsActive).sort((left, right) => left.id - right.id);
  const adjacency = new Map<number, Array<{ neighbor: number; routeId: number }>>(
    settlementIds.map((id) => [id, []]),
  );
  for (const route of activeRoutes) {
    adjacency.get(route.fromSettlementId)?.push({ neighbor: route.toSettlementId, routeId: route.id });
    adjacency.get(route.toSettlementId)?.push({ neighbor: route.fromSettlementId, routeId: route.id });
  }
  for (const edges of adjacency.values()) edges.sort((left, right) => left.routeId - right.routeId);

  const visited = new Set<number>();
  let componentCount = 0;
  let largestComponent = 0;
  for (const start of settlementIds) {
    if (visited.has(start)) continue;
    componentCount += 1;
    const queue = [start];
    visited.add(start);
    let size = 0;
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      size += 1;
      for (const edge of adjacency.get(current) ?? []) {
        if (!visited.has(edge.neighbor)) {
          visited.add(edge.neighbor);
          queue.push(edge.neighbor);
        }
      }
    }
    largestComponent = Math.max(largestComponent, size);
  }

  let time = 0;
  const discovery = new Map<number, number>();
  const low = new Map<number, number>();
  const bridges = new Set<number>();
  const visit = (current: number, parentRouteId: number | null): void => {
    time += 1;
    discovery.set(current, time);
    low.set(current, time);
    for (const edge of adjacency.get(current) ?? []) {
      if (edge.routeId === parentRouteId) continue;
      if (!discovery.has(edge.neighbor)) {
        visit(edge.neighbor, edge.routeId);
        low.set(current, Math.min(low.get(current) ?? time, low.get(edge.neighbor) ?? time));
        if ((low.get(edge.neighbor) ?? 0) > (discovery.get(current) ?? 0)) bridges.add(edge.routeId);
      } else {
        low.set(current, Math.min(low.get(current) ?? time, discovery.get(edge.neighbor) ?? time));
      }
    }
  };
  for (const settlementId of settlementIds) {
    if (!discovery.has(settlementId)) visit(settlementId, null);
  }

  const resilientSettlementCount = settlementIds.filter((id) => (adjacency.get(id)?.length ?? 0) >= 2).length;
  const cycleRank = Math.max(0, activeRoutes.length - settlementIds.length + componentCount);
  const serviceCoverage = settlementIds.length === 0 ? 0 : largestComponent / settlementIds.length;
  const degreeResilience = settlementIds.length === 0 ? 0 : resilientSettlementCount / settlementIds.length;
  const bridgeResilience = activeRoutes.length === 0 ? 0 : 1 - bridges.size / activeRoutes.length;
  const resilience = Math.max(0, Math.min(1, degreeResilience * 0.55 + bridgeResilience * 0.45));
  return {
    activeRouteCount: activeRoutes.length,
    connectedSettlementCount: largestComponent,
    totalSettlementCount: settlementIds.length,
    componentCount,
    bridgeCount: bridges.size,
    cycleRank,
    resilientSettlementCount,
    serviceCoverage,
    resilience,
    resolved: serviceCoverage === 1 && cycleRank >= 2 && bridges.size <= 2 && resilientSettlementCount >= settlementIds.length - 1,
  };
}

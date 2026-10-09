import { canonicalResidentActivityForWorld, residentRestTargetHasDrySupport } from "./residentActivityWorld";
import { residentActivitySupportsTravelEnvironment } from "./residentActivity";
import { routeOpenInWeather, type AutonomousRoutePlan } from "./network";
import { residentRestSurfaceKnowledge } from "./residentSurfaceKnowledge";
import { residentTravelSegment, residentTravelSegmentOffset, type ResidentTravelSegment } from "./residentTravelRoute";
import type { ContractState, ResidentState, RouteState, WorldState } from "./types";

interface RouteExperienceWorld {
  readonly routes: readonly RouteState[];
  readonly contracts: readonly ContractState[];
  readonly settlements: readonly { readonly id: number; readonly tileIndex: number }[];
  readonly terrain: Readonly<{ width: number; tiles: readonly { index: number; x: number; y: number }[] }>;
}

/** Derived topology, NOT current route safety, personal inventory or save authority. */
export interface ResidentFamiliarDeparturePath {
  readonly historyContractId: number;
  readonly routeIds: readonly number[];
  readonly settlementIds: readonly number[];
  readonly firstSegment: ResidentTravelSegment;
}

/**
 * Retained completed courier work is a bounded source of route familiarity.
 * Whole past itineraries (or their exact reverses) only: no unseen connecting
 * graph search. Pruning a source means forgetting, not a second permanent log.
 * Legitimate old coarse work proves topology, never physical/dry experience.
 */
export function residentFamiliarDeparturePaths(
  world: RouteExperienceWorld, resident: ResidentState, contract: ContractState, atTick: number,
): readonly ResidentFamiliarDeparturePath[] {
  if (!Number.isSafeInteger(atTick) || atTick < 0 || contract.status !== "accepted"
    || contract.carrierKind !== "resident" || contract.assignedResidentId !== resident.id
    || contract.cargoQuantity !== 0 || resident.activeContractId !== contract.id
    || resident.location.kind !== "settlement"
    || resident.location.settlementId !== contract.originSettlementId) return [];
  const history = world.contracts.filter((prior) => prior.id !== contract.id
    && prior.status === "fulfilled" && prior.carrierKind === "resident"
    && prior.assignedResidentId === resident.id && prior.cargoQuantity === 0
    && Number.isSafeInteger(prior.createdTick) && prior.createdTick >= 0
    && Number.isSafeInteger(prior.acceptedTick) && Number.isSafeInteger(prior.departedTick)
    && Number.isSafeInteger(prior.arrivalTick) && Number.isSafeInteger(prior.completedTick)
    && prior.acceptedTick !== null && prior.departedTick !== null
    && prior.arrivalTick !== null && prior.completedTick !== null
    && prior.createdTick <= prior.acceptedTick && prior.acceptedTick < prior.departedTick
    && prior.arrivalTick > prior.departedTick && prior.completedTick > prior.departedTick
    && prior.completedTick < atTick
    && ((prior.originSettlementId === contract.originSettlementId
      && prior.destinationSettlementId === contract.destinationSettlementId)
      || (prior.destinationSettlementId === contract.originSettlementId
        && prior.originSettlementId === contract.destinationSettlementId)))
    .sort((left, right) => right.completedTick! - left.completedTick! || left.id - right.id);
  const result: ResidentFamiliarDeparturePath[] = [];
  const firstEnds = new Set<string>();
  for (const prior of history) {
    const reverse = prior.originSettlementId !== contract.originSettlementId;
    const routeIds = reverse ? [...prior.porterRouteIds].reverse() : [...prior.porterRouteIds];
    const settlementIds = reverse ? [...prior.porterSettlementIds].reverse() : [...prior.porterSettlementIds];
    if (routeIds.length === 0 || settlementIds.length !== routeIds.length + 1
      || new Set(routeIds).size !== routeIds.length || new Set(settlementIds).size !== settlementIds.length
      || settlementIds[0] !== contract.originSettlementId
      || settlementIds.at(-1) !== contract.destinationSettlementId) continue;
    const connected = routeIds.every((routeId, leg) => {
      const route = world.routes.find(({ id }) => id === routeId);
      const from = world.settlements.find(({ id }) => id === settlementIds[leg]);
      const to = world.settlements.find(({ id }) => id === settlementIds[leg + 1]);
      return route !== undefined && from !== undefined && to !== undefined
        && route.fromSettlementId === Math.min(from.id, to.id)
        && route.toSettlementId === Math.max(from.id, to.id) && route.path.length >= 2
        && route.path[0] === (route.fromSettlementId === from.id ? from.tileIndex : to.tileIndex)
        && route.path.at(-1) === (route.toSettlementId === to.id ? to.tileIndex : from.tileIndex);
    });
    if (!connected) continue;
    const firstSegment = residentTravelSegment(world, {
      ...contract, porterRouteIds: routeIds, porterSettlementIds: settlementIds,
    }, { contractId: contract.id, legIndex: 0, waypointIndex: 1 });
    if (firstSegment === null) continue;
    const end = firstSegment.end;
    const key = `${end.region.x},${end.region.y}:${end.localX},${end.localY}`;
    if (firstEnds.has(key)) continue;
    firstEnds.add(key);
    result.push(Object.freeze({ historyContractId: prior.id,
      routeIds: Object.freeze(routeIds), settlementIds: Object.freeze(settlementIds), firstSegment }));
    // Cardinal contiguous routes have at most four distinct first endpoints.
    if (result.length === 4) break;
  }
  return Object.freeze(result);
}

/**
 * One origin-only choice before the existing conserved pickup/departure.
 * Rebind sight to the ACTUAL commit plan, which may differ from the earlier
 * sampled plan. No evidence/missing source means no informed alternative.
 */
export function residentObservedDepartureAlternative(
  world: WorldState, resident: ResidentState, contract: ContractState,
  defaultPlan: AutonomousRoutePlan, atTick: number,
): ResidentFamiliarDeparturePath | null {
  const activity = canonicalResidentActivityForWorld(world, resident, atTick);
  if (activity === null || !residentActivitySupportsTravelEnvironment(activity)
    || activity.pickupTask?.phase !== "arrived" || activity.pickupTask.contractId !== contract.id
    || activity.poses.length !== 1) return null;
  const selected = residentTravelSegment(world, { ...contract,
    porterRouteIds: defaultPlan.routeIds, porterSettlementIds: defaultPlan.settlementIds,
  }, { contractId: contract.id, legIndex: 0, waypointIndex: 1 });
  const body = activity.poses[0]!.position;
  if (selected === null || residentTravelSegmentOffset(selected, body) !== 0
    || residentRestSurfaceKnowledge(resident.perception, selected.end, atTick) !== "wet") return null;
  for (const candidate of residentFamiliarDeparturePaths(world, resident, contract, atTick)) {
    if (residentTravelSegmentOffset(candidate.firstSegment, body) === 0
      && residentRestSurfaceKnowledge(resident.perception, candidate.firstSegment.end, atTick) === "dry"
      && routeOpenInWeather(world, candidate.firstSegment.route, world.weather)
      && residentRestTargetHasDrySupport(world, candidate.firstSegment.end)) return candidate;
  }
  return null;
}

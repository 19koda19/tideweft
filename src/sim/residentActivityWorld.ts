import {
  resolveResidentWorldPlacementAtEventLocation,
  type ResidentSpatialWorld,
} from "../game/residentSpatial";
import {
  createWorldPosition,
  WORLD_POSITION_UNITS_PER_TILE,
  type WorldPosition,
} from "../game/worldPosition";
import { canonicalizeLivingCircadianPersistentState } from "./livingCircadian";
import { canonicalizeResidentActivity, residentActivitySupportsEnvironment, residentActivitySupportsInspection, residentActivitySupportsMaterials, residentActivitySupportsPickup, type ResidentActivity } from "./residentActivity";
import { waterDepthAt } from "./terrain";
import type { ResidentState, TideState, WorldState } from "./types";
import { RESOURCE_KINDS } from "./types";

/** Civic mode is whole-roster authority; old v1/v2 mixtures remain supported. */
export function residentCivicActivityCohortIsUniform(residents: readonly ResidentState[]): boolean {
  let civic = 0;
  let inspection = 0;
  let environment = 0;
  let pickup = 0;
  for (const resident of residents) {
    const activity = Object.getOwnPropertyDescriptor(resident, "activity");
    const version = activity !== undefined && Object.hasOwn(activity, "value")
      && activity.value !== null && typeof activity.value === "object"
      ? Object.getOwnPropertyDescriptor(activity.value, "version") : undefined;
    if (version !== undefined && Object.hasOwn(version, "value")
      && residentActivitySupportsMaterials({ version: version.value })) civic += 1;
    if (version !== undefined && Object.hasOwn(version, "value")
      && residentActivitySupportsInspection({ version: version.value })) inspection += 1;
    if (version !== undefined && Object.hasOwn(version, "value")
      && residentActivitySupportsEnvironment({ version: version.value })) environment += 1;
    if (version !== undefined && Object.hasOwn(version, "value")
      && residentActivitySupportsPickup({ version: version.value })) pickup += 1;
  }
  // This checks mode only. The existing shape/world validators remain binding.
  return (civic === 0 || civic === residents.length)
    && (inspection === 0 || inspection === residents.length)
    && (environment === 0 || environment === residents.length)
    && (pickup === 0 || pickup === residents.length);
}

/** A rest point belongs to the existing settlement; this creates no house/bed. */
export function residentSettlementRestTarget(
  world: ResidentSpatialWorld,
  resident: ResidentState,
  legacySettlementOrdinal: number | null = null,
): WorldPosition | null {
  if (resident.location.kind !== "settlement" || resident.activeContractId !== null) return null;
  const settlementId = resident.location.settlementId;
  const settlement = world.settlements.find(({ id }) => id === settlementId);
  if (settlement === undefined) return null;
  if (legacySettlementOrdinal !== null) {
    if (!Number.isSafeInteger(legacySettlementOrdinal) || legacySettlementOrdinal < 0
      || legacySettlementOrdinal >= world.residents.length || Object.is(legacySettlementOrdinal, -0)
    ) return null;
    // Explicit event-locus reconstruction deliberately bypasses current body
    // placement. It proves the captured bounded slot, not the historical roster.
    return resolveResidentWorldPlacementAtEventLocation(world, resident, {
      kind: "settlement", settlementId: settlement.id,
    }, legacySettlementOrdinal)?.position ?? null;
  }
  return settlementCenter(world, settlementId);
}

function settlementCenter(world: ResidentSpatialWorld, settlementId: number): WorldPosition | null {
  const settlement = world.settlements.find(({ id }) => id === settlementId);
  if (settlement === undefined) return null;
  const tile = world.terrain.tiles[settlement.tileIndex];
  if (tile === undefined || tile.index !== settlement.tileIndex
    || tile.x !== settlement.tileIndex % world.terrain.width
    || tile.y !== Math.floor(settlement.tileIndex / world.terrain.width)
  ) return null;
  return createWorldPosition({ x: 0, y: 0 },
    tile.x * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2,
    tile.y * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2);
}

/** Binding only: stock, network readiness and expiry are transaction inputs. */
export function residentAcceptedPickupBinding(world: WorldState, resident: ResidentState) {
  if (resident.activeContractId === null || resident.location.kind !== "settlement") return null;
  const candidates = world.contracts.filter((contract) => contract.id === resident.activeContractId
    || (contract.carrierKind === "resident" && contract.assignedResidentId === resident.id
      && (contract.status === "accepted" || contract.status === "in-transit")));
  if (candidates.length !== 1) return null;
  const contract = candidates[0]!;
  if (contract.id !== resident.activeContractId || contract.status !== "accepted"
    || contract.carrierKind !== "resident" || contract.assignedResidentId !== resident.id
    || contract.originSettlementId !== resident.location.settlementId || contract.cargoQuantity !== 0
    || contract.acceptedTick === null || !Number.isSafeInteger(contract.acceptedTick)
    || contract.acceptedTick < 0 || Object.is(contract.acceptedTick, -0)) return null;
  const target = settlementCenter(world, contract.originSettlementId);
  return target === null ? null : Object.freeze({ contract, target });
}

/** New physical rest requires dry support, not merely a locomotion no-move. */
export function residentRestTargetHasDrySupport(
  world: ResidentSpatialWorld & Readonly<{ tide: TideState }>,
  target: WorldPosition,
): boolean {
  if (target.region.x !== 0 || target.region.y !== 0) return false;
  const x = Math.floor(target.localX / WORLD_POSITION_UNITS_PER_TILE);
  const y = Math.floor(target.localY / WORLD_POSITION_UNITS_PER_TILE);
  if (x < 0 || y < 0 || x >= world.terrain.width || y >= world.terrain.height) return false;
  const tile = world.terrain.tiles[y * world.terrain.width + x];
  return tile !== undefined && tile.index === y * world.terrain.width + x
    && tile.x === x && tile.y === y && tile.terrain !== "deep-water"
    && waterDepthAt(tile, world.tide) === 0;
}

/** Aggregate settlement service geometry, NOT the separate physical store lot. */
export function residentSettlementRationTarget(
  world: ResidentSpatialWorld,
  resident: ResidentState,
): WorldPosition | null {
  return residentSettlementRestTarget(world, resident);
}

/** One existing finite project; no fabricated building/worksite or profession. */
export function residentSettlementMaterialProject(world: WorldState, resident: ResidentState) {
  if (resident.location.kind !== "settlement" || resident.activeContractId !== null) return null;
  const settlement = world.settlements.find(({ id }) => resident.location.kind === "settlement"
    && id === resident.location.settlementId);
  const project = settlement?.project;
  if (settlement === undefined || project === undefined || !Number.isSafeInteger(project.id) || project.id <= 0
    || !["beacon", "cache", "crossing", "clinic", "ferry"].includes(project.kind)
    || !["building", "complete"].includes(project.status) || !RESOURCE_KINDS.includes(project.resource)
    || !Number.isSafeInteger(project.target) || project.target <= 0
    || !Number.isSafeInteger(project.progress) || project.progress < 0 || Object.is(project.progress, -0)
    || project.progress > project.target
    || (project.status === "complete") !== (project.progress === project.target)) return null;
  return settlement;
}

/**
 * Cold/world boundary: authenticate physical source and membership separately
 * from the generic immutable activity shape. Construction custody alone is
 * not permission to claim an arbitrary refuge or a different settlement.
 */
export function canonicalResidentActivityForWorld(
  world: WorldState,
  resident: ResidentState,
  atTick: number = world.meta.completedTick,
): ResidentActivity | null {
  const activity = canonicalizeResidentActivity(resident.activity, {
    actorId: resident.identity.stableId, tick: atTick,
  });
  if (activity === null || resident.perception.tick !== atTick
    || !world.residents.some(({ id, identity }) => (
      id === resident.id && identity.stableId === resident.identity.stableId
    ))
  ) return null;
  const task = activity.restTask ?? activity.rationTask ?? activity.materialTask ?? activity.inspectionTask ?? activity.pickupTask ?? null;
  if (task === null) return activity;
  if (task.kind === "contract-pickup") {
    const binding = residentAcceptedPickupBinding(world, resident);
    if (binding === null || binding.contract.id !== task.contractId
      || binding.contract.originSettlementId !== task.settlementId
      || task.selectedAtTick < binding.contract.acceptedTick!
      || !samePosition(binding.target, task.target)) return null;
    return task.phase === "arrived" && !residentRestTargetHasDrySupport(world, task.target) ? null : activity;
  }
  if (resident.location.kind !== "settlement"
    || resident.location.settlementId !== task.settlementId || resident.activeContractId !== null
  ) return null;
  if (task.kind === "settlement-inspection" && task.settlementId !== resident.homeSettlementId) return null;
  const target = task.kind === "settlement-rest"
    ? residentSettlementRestTarget(world, resident, task.legacySettlementOrdinal)
    : residentSettlementRationTarget(world, resident);
  if (target === null || !samePosition(target, task.target)) return null;
  if (task.kind === "settlement-material") {
    const settlement = residentSettlementMaterialProject(world, resident);
    if (settlement === null || settlement.project.id !== task.projectId || settlement.project.resource !== task.resource
      || (task.phase !== "used" && settlement.project.status !== "building")) return null;
  }
  if (task.kind === "settlement-rest" && task.origin === "continued-admitted-rest") {
    const receipt = canonicalizeLivingCircadianPersistentState(resident.circadian);
    if (receipt === null || !receipt.restDestinationArrived
      || (receipt.posture.state !== "resting" && receipt.posture.state !== "asleep")
    ) return null;
    // This single old admitted episode retains its abstract refuge, not a
    // reusable water/shelter exemption for newly selected physical tasks.
    return activity;
  }
  return (task.phase === "arrived" || task.phase === "used") && !residentRestTargetHasDrySupport(world, target)
    ? null : activity;
}

function samePosition(left: WorldPosition, right: WorldPosition): boolean {
  return left.region.x === right.region.x && left.region.y === right.region.y
    && left.localX === right.localX && left.localY === right.localY;
}

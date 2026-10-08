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
import { canonicalizeResidentActivity, type ResidentActivity } from "./residentActivity";
import { waterDepthAt } from "./terrain";
import type { ResidentState, TideState, WorldState } from "./types";

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
  const tile = world.terrain.tiles[settlement.tileIndex];
  if (tile === undefined || tile.index !== settlement.tileIndex
    || tile.x !== settlement.tileIndex % world.terrain.width
    || tile.y !== Math.floor(settlement.tileIndex / world.terrain.width)
  ) return null;
  return createWorldPosition({ x: 0, y: 0 },
    tile.x * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2,
    tile.y * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2);
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
  const task = activity.restTask;
  if (task === null) return activity;
  if (resident.location.kind !== "settlement"
    || resident.location.settlementId !== task.settlementId || resident.activeContractId !== null
  ) return null;
  const target = residentSettlementRestTarget(world, resident, task.legacySettlementOrdinal);
  if (target === null || !samePosition(target, task.target)) return null;
  if (task.origin === "continued-admitted-rest") {
    const receipt = canonicalizeLivingCircadianPersistentState(resident.circadian);
    if (receipt === null || !receipt.restDestinationArrived
      || (receipt.posture.state !== "resting" && receipt.posture.state !== "asleep")
    ) return null;
    // This single old admitted episode retains its abstract refuge, not a
    // reusable water/shelter exemption for newly selected physical tasks.
    return activity;
  }
  return task.phase === "arrived" && !residentRestTargetHasDrySupport(world, target)
    ? null : activity;
}

function samePosition(left: WorldPosition, right: WorldPosition): boolean {
  return left.region.x === right.region.x && left.region.y === right.region.y
    && left.localX === right.localX && left.localY === right.localY;
}

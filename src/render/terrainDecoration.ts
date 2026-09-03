import type { TerrainGridView, WorldPoint } from "./types";

const UINT32_SIZE = 0x1_0000_0000;
const INT32_MIN = -0x8000_0000;
const INT32_MAX = 0x7fff_ffff;

/**
 * Stable infinite-world coordinate for one projected terrain cell. Legacy
 * finite views omit worldTileOrigin and intentionally keep local coordinates.
 */
export function terrainTileGlobalCoordinate(
  grid: Pick<TerrainGridView, "worldTileOrigin">,
  column: number,
  row: number,
): WorldPoint {
  const localColumn = Number.isSafeInteger(column) ? column : 0;
  const localRow = Number.isSafeInteger(row) ? row : 0;
  const origin = grid.worldTileOrigin;
  if (!origin || !Number.isSafeInteger(origin.x) || !Number.isSafeInteger(origin.y)) {
    return { x: localColumn, y: localRow };
  }
  const x = origin.x + localColumn;
  const y = origin.y + localRow;
  return Number.isSafeInteger(x) && Number.isSafeInteger(y)
    ? { x, y }
    : { x: localColumn, y: localRow };
}

/** Chart's established texture hash, addressed by stable global tile. */
export function chartTerrainDecorationHash01(
  grid: Pick<TerrainGridView, "worldTileOrigin">,
  column: number,
  row: number,
  salt = 0,
): number {
  const coordinate = terrainTileGlobalCoordinate(grid, column, row);
  let value = Math.imul(coordinateWord(coordinate.x) ^ 0x45d9_f3b, 0x45d9_f3b);
  value ^= Math.imul(coordinateWord(coordinate.y) ^ (salt | 0), 0x27d4_eb2d);
  value ^= value >>> 15;
  return (value >>> 0) / 4_294_967_295;
}

/** Relief's established biome-detail hash, addressed by stable global tile. */
export function reliefTerrainDecorationHash01(
  grid: Pick<TerrainGridView, "worldTileOrigin">,
  column: number,
  row: number,
  salt: number,
): number {
  const coordinate = terrainTileGlobalCoordinate(grid, column, row);
  let value = Math.imul(coordinateWord(coordinate.x) ^ (salt | 0), 0x45d9_f3b);
  value ^= Math.imul(coordinateWord(coordinate.y) ^ 0x27d4_eb2d, 0x119d_e1f3);
  value ^= value >>> 15;
  return (value >>> 0) / 4_294_967_295;
}

function coordinateWord(value: number): number {
  if (!Number.isSafeInteger(value)) return 0;
  if (value >= INT32_MIN && value <= INT32_MAX) return value | 0;
  const low = value >>> 0;
  const high = Math.floor(value / UINT32_SIZE);
  return (low ^ mixWord(high)) | 0;
}

function mixWord(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb_352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846c_a68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

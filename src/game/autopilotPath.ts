/** Exact-target capture band retained from the original interaction contract. */
export const AUTOPILOT_AXIS_DEADZONE = 85;
export const AUTOPILOT_MAX_LOOKAHEAD_TILES = 32;

export interface AutopilotPathTile {
  readonly baseTravelCost: number;
  readonly elevation: number;
}

export interface AutopilotPathGrid {
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly (AutopilotPathTile | undefined)[];
}

export interface AutopilotSmoothingOptions {
  /** An authoritative blocked edge always rejects a proposed shortcut. */
  readonly edgePassable?: (fromTileIndex: number, toTileIndex: number) => boolean;
  /** Hazardous tiles already on the A* route must remain on the smoothed trace. */
  readonly hazardousTile?: (tileIndex: number) => boolean;
  /** Hazardous edge contacts likewise cannot be introduced or removed. */
  readonly hazardousEdge?: (fromTileIndex: number, toTileIndex: number) => boolean;
  readonly maxLookaheadTiles?: number;
}

export interface AutopilotSteeringControl {
  readonly moveX: -1 | 0 | 1;
  readonly moveY: -1 | 0 | 1;
  readonly arrived: boolean;
}

function cardinalDistance(left: number, right: number, width: number): number {
  const leftX = left % width;
  const leftY = Math.floor(left / width);
  const rightX = right % width;
  const rightY = Math.floor(right / width);
  return Math.abs(leftX - rightX) + Math.abs(leftY - rightY);
}

/**
 * Exact tile trace produced by the runtime's sign-safe eight-way steering.
 * Both active axes advance together; an exact diagonal corner resolves X
 * before Y just like the authoritative fixed-step fallback edge order.
 */
export function traceAutopilotGridSegment(
  width: number,
  height: number,
  fromTileIndex: number,
  toTileIndex: number,
): number[] {
  const tileCount = width * height;
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width <= 0
    || height <= 0
    || !Number.isSafeInteger(tileCount)
    || !Number.isSafeInteger(fromTileIndex)
    || !Number.isSafeInteger(toTileIndex)
    || fromTileIndex < 0
    || toTileIndex < 0
    || fromTileIndex >= tileCount
    || toTileIndex >= tileCount
  ) return [];
  if (fromTileIndex === toTileIndex) return [fromTileIndex];

  let x = fromTileIndex % width;
  let y = Math.floor(fromTileIndex / width);
  const targetX = toTileIndex % width;
  const targetY = Math.floor(toTileIndex / width);
  const directionX = Math.sign(targetX - x);
  const directionY = Math.sign(targetY - y);
  const result = [fromTileIndex];

  while (x !== targetX || y !== targetY) {
    if (x !== targetX) {
      x += directionX;
      result.push(y * width + x);
    }
    if (y !== targetY) {
      y += directionY;
      result.push(y * width + x);
    }
  }
  return result;
}

function transitionCost(
  grid: AutopilotPathGrid,
  fromTileIndex: number,
  toTileIndex: number,
): number {
  const from = grid.tiles[fromTileIndex];
  const to = grid.tiles[toTileIndex];
  if (!from || !to || cardinalDistance(fromTileIndex, toTileIndex, grid.width) !== 1) {
    return Number.MAX_SAFE_INTEGER;
  }
  if (
    !Number.isSafeInteger(from.elevation)
    || !Number.isSafeInteger(to.elevation)
    || !Number.isSafeInteger(to.baseTravelCost)
    || to.baseTravelCost < 0
  ) return Number.MAX_SAFE_INTEGER;
  return to.baseTravelCost + Math.trunc(Math.abs(to.elevation - from.elevation) / 4_000);
}

function pathCost(grid: AutopilotPathGrid, path: readonly number[]): number {
  let total = 0;
  for (let index = 1; index < path.length; index += 1) {
    const cost = transitionCost(grid, path[index - 1] ?? -1, path[index] ?? -1);
    if (cost === Number.MAX_SAFE_INTEGER || total > Number.MAX_SAFE_INTEGER - cost) {
      return Number.MAX_SAFE_INTEGER;
    }
    total += cost;
  }
  return total;
}

function edgeKey(fromTileIndex: number, toTileIndex: number): string {
  return `${fromTileIndex}>${toTileIndex}`;
}

function preservesHazards(
  original: readonly number[],
  direct: readonly number[],
  hazardousTile: ((tileIndex: number) => boolean) | undefined,
  hazardousEdge: ((fromTileIndex: number, toTileIndex: number) => boolean) | undefined,
): boolean {
  const originalTiles = new Set(original);
  const directTiles = new Set(direct);
  if (hazardousTile) {
    for (const tileIndex of original) {
      if (hazardousTile(tileIndex) && !directTiles.has(tileIndex)) return false;
    }
    for (const tileIndex of direct) {
      if (hazardousTile(tileIndex) && !originalTiles.has(tileIndex)) return false;
    }
  }
  if (hazardousEdge) {
    const originalHazards = new Set<string>();
    const directHazards = new Set<string>();
    for (let index = 1; index < original.length; index += 1) {
      const from = original[index - 1] ?? -1;
      const to = original[index] ?? -1;
      if (hazardousEdge(from, to)) originalHazards.add(edgeKey(from, to));
    }
    for (let index = 1; index < direct.length; index += 1) {
      const from = direct[index - 1] ?? -1;
      const to = direct[index] ?? -1;
      if (hazardousEdge(from, to)) directHazards.add(edgeKey(from, to));
    }
    if (originalHazards.size !== directHazards.size) return false;
    for (const key of originalHazards) if (!directHazards.has(key)) return false;
  }
  return true;
}

/**
 * Greedy deterministic string-pulling over an authoritative cardinal A* path.
 * A waypoint is removed only when the exact direct grid trace is no costlier,
 * every edge is permitted, and named hazard contacts remain byte-identical.
 */
export function smoothAutopilotPath(
  grid: AutopilotPathGrid,
  path: readonly number[],
  options: AutopilotSmoothingOptions = {},
): number[] {
  const tileCount = grid.width * grid.height;
  if (
    !Number.isSafeInteger(grid.width)
    || !Number.isSafeInteger(grid.height)
    || grid.width <= 0
    || grid.height <= 0
    || !Number.isSafeInteger(tileCount)
    || tileCount > grid.tiles.length
    || path.length <= 2
  ) return [...path];
  for (let index = 0; index < path.length; index += 1) {
    const tileIndex = path[index];
    if (
      tileIndex === undefined
      || !Number.isSafeInteger(tileIndex)
      || tileIndex < 0
      || tileIndex >= tileCount
      || !grid.tiles[tileIndex]
    ) return [...path];
    if (
      index > 0
      && cardinalDistance(path[index - 1] ?? -1, tileIndex, grid.width) !== 1
    ) return [...path];
  }

  const requestedLookahead = options.maxLookaheadTiles ?? AUTOPILOT_MAX_LOOKAHEAD_TILES;
  const lookahead = Math.max(2, Math.min(
    64,
    Number.isSafeInteger(requestedLookahead) ? requestedLookahead : AUTOPILOT_MAX_LOOKAHEAD_TILES,
  ));
  const smoothed = [path[0] as number];
  let anchor = 0;
  while (anchor < path.length - 1) {
    let chosen = anchor + 1;
    const furthest = Math.min(path.length - 1, anchor + lookahead);
    for (let candidate = furthest; candidate >= anchor + 2; candidate -= 1) {
      const direct = traceAutopilotGridSegment(
        grid.width,
        grid.height,
        path[anchor] as number,
        path[candidate] as number,
      );
      if (direct.length < 2) continue;
      if (options.edgePassable) {
        let passable = true;
        for (let index = 1; index < direct.length; index += 1) {
          if (!options.edgePassable(direct[index - 1] as number, direct[index] as number)) {
            passable = false;
            break;
          }
        }
        if (!passable) continue;
      }
      const original = path.slice(anchor, candidate + 1);
      if (!preservesHazards(
        original,
        direct,
        options.hazardousTile,
        options.hazardousEdge,
      )) continue;
      if (pathCost(grid, direct) > pathCost(grid, original)) continue;
      chosen = candidate;
      break;
    }
    smoothed.push(path[chosen] as number);
    anchor = chosen;
  }
  return smoothed;
}

/** Per-axis capture prevents an aligned axis from reversing while its peer travels. */
export function steerAutopilotToPoint(
  deltaX: number,
  deltaY: number,
  deadzone = AUTOPILOT_AXIS_DEADZONE,
): AutopilotSteeringControl {
  const safeDeadzone = Number.isSafeInteger(deadzone) && deadzone >= 0
    ? deadzone
    : AUTOPILOT_AXIS_DEADZONE;
  const direction = (delta: number): -1 | 0 | 1 => {
    if (!Number.isSafeInteger(delta) || Math.abs(delta) <= safeDeadzone) return 0;
    return delta < 0 ? -1 : 1;
  };
  const moveX = direction(deltaX);
  const moveY = direction(deltaY);
  return { moveX, moveY, arrived: moveX === 0 && moveY === 0 };
}

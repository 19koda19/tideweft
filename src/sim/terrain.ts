import { keyedRandomInt, keyedRandomU32, type RootSeed } from "./rng";
import {
  FIXED_POINT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type TerrainKind,
  type TerrainState,
  type TerrainTile,
  type TideState,
} from "./types";
import { clampInteger } from "./util";

const TERRAIN_DOMAIN = 0x5445_5252;
const TIDE_PERIOD_TICKS = 720;

function lerpInteger(left: number, right: number, numerator: number, denominator: number): number {
  return left + Math.trunc(((right - left) * numerator) / denominator);
}

function latticeValue(seed: RootSeed, gridX: number, gridY: number, domain: number): number {
  const entity = gridY * 4096 + gridX;
  return keyedRandomU32(seed, TERRAIN_DOMAIN, domain, entity, 0) % (FIXED_POINT + 1);
}

function valueNoise(seed: RootSeed, x: number, y: number, scale: number, domain: number): number {
  const gridX = Math.floor(x / scale);
  const gridY = Math.floor(y / scale);
  const offsetX = x % scale;
  const offsetY = y % scale;
  const northWest = latticeValue(seed, gridX, gridY, domain);
  const northEast = latticeValue(seed, gridX + 1, gridY, domain);
  const southWest = latticeValue(seed, gridX, gridY + 1, domain);
  const southEast = latticeValue(seed, gridX + 1, gridY + 1, domain);
  const north = lerpInteger(northWest, northEast, offsetX, scale);
  const south = lerpInteger(southWest, southEast, offsetX, scale);
  return lerpInteger(north, south, offsetY, scale);
}

function channelCenter(seed: RootSeed, x: number): number {
  const broad = valueNoise(seed, x, 0, 12, 41);
  return Math.floor(WORLD_HEIGHT / 2) + Math.trunc((broad - 500_000) / 62_500);
}

function terrainKind(elevation: number): TerrainKind {
  if (elevation < 180_000) return "deep-water";
  if (elevation < 330_000) return "tidal-flat";
  if (elevation < 470_000) return "marsh";
  if (elevation < 760_000) return "meadow";
  return "ridge";
}

function travelCost(kind: TerrainKind, roughness: number): number {
  const roughnessCost = Math.trunc(roughness / 5_000);
  switch (kind) {
    case "deep-water":
      return 1_100 + roughnessCost;
    case "tidal-flat":
      return 360 + roughnessCost;
    case "marsh":
      return 270 + roughnessCost;
    case "meadow":
      return 120 + roughnessCost;
    case "ridge":
      return 440 + roughnessCost;
  }
}

export function generateTerrain(seed: RootSeed): TerrainState {
  const tiles: TerrainTile[] = [];
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      const broad = valueNoise(seed, x, y, 16, 1);
      const medium = valueNoise(seed, x, y, 8, 2);
      const detail = valueNoise(seed, x, y, 4, 3);
      const center = channelCenter(seed, x);
      const channelDistance = Math.abs(y - center);
      const channelCut = Math.max(0, 390_000 - channelDistance * 50_000);
      const edgeRise = Math.trunc((Math.abs(y - WORLD_HEIGHT / 2) * 85_000) / WORLD_HEIGHT);
      const elevation = clampInteger(
        230_000 +
          Math.trunc((broad * 42) / 100) +
          Math.trunc((medium * 18) / 100) +
          Math.trunc((detail * 10) / 100) +
          edgeRise -
          channelCut,
      );
      const moistureNoise = valueNoise(seed, x, y, 9, 4);
      const moisture = clampInteger(
        760_000 - channelDistance * 24_000 + Math.trunc((moistureNoise - 500_000) / 3),
      );
      const roughNoise = valueNoise(seed, x, y, 3, 5);
      const roughness = clampInteger(
        Math.trunc(Math.abs(detail - medium) / 2) + Math.trunc(roughNoise / 3),
      );
      const terrain = terrainKind(elevation);
      const index = y * WORLD_WIDTH + x;
      tiles.push({
        index,
        x,
        y,
        elevation,
        moisture,
        roughness,
        terrain,
        baseTravelCost: travelCost(terrain, roughness),
        traceStrength: 0,
      });
    }
  }
  return { width: WORLD_WIDTH, height: WORLD_HEIGHT, tiles };
}

export function tideAtTick(tick: number): TideState {
  const phase = tick % TIDE_PERIOD_TICKS;
  const half = TIDE_PERIOD_TICKS / 2;
  const rising = phase < half;
  const triangle = rising ? phase : TIDE_PERIOD_TICKS - phase;
  const level = 230_000 + Math.trunc((triangle * 330_000) / half);
  return { phase, level, direction: rising ? 1 : -1 };
}

export function waterDepthAt(tile: TerrainTile, tide: TideState): number {
  return Math.max(0, tide.level - tile.elevation);
}

interface OpenNode {
  tileIndex: number;
  g: number;
  f: number;
}

function compareOpen(left: OpenNode, right: OpenNode): number {
  return left.f - right.f || left.g - right.g || left.tileIndex - right.tileIndex;
}

class StableMinHeap {
  private readonly values: OpenNode[] = [];

  get size(): number {
    return this.values.length;
  }

  push(value: OpenNode): void {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      const parentValue = this.values[parent];
      if (parentValue === undefined || compareOpen(parentValue, value) <= 0) break;
      this.values[index] = parentValue;
      index = parent;
    }
    this.values[index] = value;
  }

  pop(): OpenNode | undefined {
    const first = this.values[0];
    const last = this.values.pop();
    if (first === undefined || last === undefined || this.values.length === 0) return first;
    let index = 0;
    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;
      if (leftIndex >= this.values.length) break;
      let childIndex = leftIndex;
      const left = this.values[leftIndex];
      const right = this.values[rightIndex];
      if (left === undefined) break;
      if (right !== undefined && compareOpen(right, left) < 0) childIndex = rightIndex;
      const child = this.values[childIndex];
      if (child === undefined || compareOpen(last, child) <= 0) break;
      this.values[index] = child;
      index = childIndex;
    }
    this.values[index] = last;
    return first;
  }
}

function heuristic(terrain: TerrainState, from: number, to: number): number {
  const fromTile = terrain.tiles[from];
  const toTile = terrain.tiles[to];
  if (fromTile === undefined || toTile === undefined) return 0;
  return (Math.abs(fromTile.x - toTile.x) + Math.abs(fromTile.y - toTile.y)) * 120;
}

function neighbors(terrain: TerrainState, tileIndex: number): number[] {
  const tile = terrain.tiles[tileIndex];
  if (tile === undefined) return [];
  const result: number[] = [];
  if (tile.y > 0) result.push(tileIndex - terrain.width);
  if (tile.x > 0) result.push(tileIndex - 1);
  if (tile.x + 1 < terrain.width) result.push(tileIndex + 1);
  if (tile.y + 1 < terrain.height) result.push(tileIndex + terrain.width);
  result.sort((left, right) => left - right);
  return result;
}

export function findTilePath(terrain: TerrainState, start: number, goal: number): number[] {
  if (terrain.tiles[start] === undefined || terrain.tiles[goal] === undefined) {
    throw new RangeError("Path endpoint is outside the terrain");
  }
  if (start === goal) return [start];

  const scores = new Array<number>(terrain.tiles.length).fill(Number.MAX_SAFE_INTEGER);
  const previous = new Int32Array(terrain.tiles.length);
  previous.fill(-1);
  const closed = new Uint8Array(terrain.tiles.length);
  const open = new StableMinHeap();
  scores[start] = 0;
  open.push({ tileIndex: start, g: 0, f: heuristic(terrain, start, goal) });

  while (open.size > 0) {
    const current = open.pop();
    if (current === undefined) break;
    if (closed[current.tileIndex] === 1) continue;
    if (current.tileIndex === goal) break;
    closed[current.tileIndex] = 1;
    const currentTile = terrain.tiles[current.tileIndex];
    if (currentTile === undefined) continue;

    for (const neighborIndex of neighbors(terrain, current.tileIndex)) {
      if (closed[neighborIndex] === 1) continue;
      const neighbor = terrain.tiles[neighborIndex];
      if (neighbor === undefined) continue;
      const slope = Math.trunc(Math.abs(neighbor.elevation - currentTile.elevation) / 4_000);
      const tentative = current.g + neighbor.baseTravelCost + slope;
      const known = scores[neighborIndex] ?? Number.MAX_SAFE_INTEGER;
      const knownPrevious = previous[neighborIndex] ?? -1;
      if (tentative < known || (tentative === known && current.tileIndex < knownPrevious)) {
        scores[neighborIndex] = tentative;
        previous[neighborIndex] = current.tileIndex;
        open.push({
          tileIndex: neighborIndex,
          g: tentative,
          f: tentative + heuristic(terrain, neighborIndex, goal),
        });
      }
    }
  }

  if ((previous[goal] ?? -1) < 0) throw new Error("Generated terrain unexpectedly has no route");
  const reversed = [goal];
  let cursor = goal;
  while (cursor !== start) {
    cursor = previous[cursor] ?? -1;
    if (cursor < 0) throw new Error("Broken path predecessor chain");
    reversed.push(cursor);
  }
  reversed.reverse();
  return reversed;
}

export function pathTravelCost(terrain: TerrainState, path: readonly number[]): number {
  let cost = 0;
  for (let index = 1; index < path.length; index += 1) {
    const previous = terrain.tiles[path[index - 1] ?? -1];
    const tile = terrain.tiles[path[index] ?? -1];
    if (previous === undefined || tile === undefined) throw new Error("Path references an invalid tile");
    cost += tile.baseTravelCost + Math.trunc(Math.abs(tile.elevation - previous.elevation) / 4_000);
  }
  return cost;
}

export function settlementCandidateScore(seed: RootSeed, tile: TerrainTile, ordinal: number): number {
  const suitability =
    (tile.terrain === "meadow" ? 500_000 : tile.terrain === "marsh" ? 330_000 : 120_000) +
    Math.trunc(tile.moisture / 5) -
    Math.trunc(tile.roughness / 6);
  return suitability + keyedRandomInt(seed, TERRAIN_DOMAIN, 0, tile.index, 91, 0, 250_000, ordinal);
}

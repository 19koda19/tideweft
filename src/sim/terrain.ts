import { keyedRandomInt, keyedRandomU32, type RootSeed } from "./rng";
import {
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
const MIN_TIDE_LEVEL = 230_000;
export const MAX_TIDE_LEVEL = 560_000;

const GRADIENTS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2],
] as const;

function fade(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function lerp(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

type GradientCache = Map<number, number>;

function gradientAt(
  seed: RootSeed,
  latticeX: number,
  latticeY: number,
  domain: number,
  cache: GradientCache,
) {
  const cacheKey = domain * 1_000_000 + latticeY * 1_000 + latticeX;
  let gradientIndex = cache.get(cacheKey);
  if (gradientIndex === undefined) {
    const entity = latticeY * 4096 + latticeX;
    gradientIndex = keyedRandomU32(seed, TERRAIN_DOMAIN, domain, entity, 0) % GRADIENTS.length;
    cache.set(cacheKey, gradientIndex);
  }
  const gradient = GRADIENTS[gradientIndex];
  if (gradient === undefined) throw new Error("Perlin gradient table is incomplete");
  return gradient;
}

/** Seeded two-dimensional gradient Perlin noise, normalized to approximately -1..1. */
function perlinNoise(
  seed: RootSeed,
  x: number,
  y: number,
  scale: number,
  domain: number,
  cache: GradientCache,
): number {
  const sampleX = x / scale;
  const sampleY = y / scale;
  const west = Math.floor(sampleX);
  const north = Math.floor(sampleY);
  const offsetX = sampleX - west;
  const offsetY = sampleY - north;
  const east = west + 1;
  const south = north + 1;

  const dot = (latticeX: number, latticeY: number): number => {
    const gradient = gradientAt(seed, latticeX, latticeY, domain, cache);
    return gradient[0] * (sampleX - latticeX) + gradient[1] * (sampleY - latticeY);
  };
  const amountX = fade(offsetX);
  const amountY = fade(offsetY);
  const northBlend = lerp(dot(west, north), dot(east, north), amountX);
  const southBlend = lerp(dot(west, south), dot(east, south), amountX);
  return Math.max(-1, Math.min(1, lerp(northBlend, southBlend, amountY) * Math.SQRT2));
}

/** Fractal Brownian motion composed from independently seeded Perlin octaves. */
function fractalNoise(
  seed: RootSeed,
  x: number,
  y: number,
  baseScale: number,
  octaves: number,
  domain: number,
  cache: GradientCache,
  persistence = 0.52,
): number {
  let total = 0;
  let totalAmplitude = 0;
  let amplitude = 1;
  let scale = baseScale;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += perlinNoise(seed, x, y, scale, domain + octave * 977, cache) * amplitude;
    totalAmplitude += amplitude;
    amplitude *= persistence;
    scale /= 2;
  }
  return totalAmplitude === 0 ? 0 : total / totalAmplitude;
}

function channelCenter(seed: RootSeed, x: number, cache: GradientCache): number {
  const broadMeander = fractalNoise(seed, x, 11.5, 52, 3, 41, cache, 0.58);
  const braidedMeander = fractalNoise(seed, x, 29.25, 19, 2, 53, cache, 0.46);
  return Math.floor(WORLD_HEIGHT / 2) + Math.trunc(broadMeander * 15 + braidedMeander * 4);
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
  const gradientCache: GradientCache = new Map();
  const channelCenters = Array.from(
    { length: WORLD_WIDTH },
    (_, x) => channelCenter(seed, x, gradientCache),
  );
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      const broad = fractalNoise(seed, x, y, 48, 4, 1, gradientCache, 0.54);
      const detail = fractalNoise(seed, x, y, 11, 3, 13, gradientCache, 0.46);
      const center = channelCenters[x] ?? Math.floor(WORLD_HEIGHT / 2);
      const channelDistance = Math.abs(y - center);
      const channelCut = Math.max(0, 455_000 - channelDistance * 47_000 + Math.trunc(detail * 38_000));
      const edgeRise = Math.trunc(
        (Math.abs(y - WORLD_HEIGHT / 2) * 480_000) / WORLD_HEIGHT,
      );
      const elevation = clampInteger(
        500_000 +
          Math.trunc(broad * 285_000) +
          Math.trunc(detail * 85_000) +
          edgeRise -
          channelCut,
      );
      const moistureNoise = fractalNoise(seed, x, y, 29, 3, 71, gradientCache, 0.55);
      const moisture = clampInteger(
        730_000
          - channelDistance * 13_000
          - Math.trunc(Math.max(0, elevation - 620_000) / 4)
          + Math.trunc(moistureNoise * 190_000)
          + Math.trunc(detail * 55_000),
      );
      const roughness = clampInteger(
        85_000
          + Math.trunc(Math.abs(broad - detail) * 220_000)
          + Math.trunc(Math.abs(detail) * 310_000)
          + Math.trunc(Math.abs(detail * 0.65 + broad * 0.35) * 90_000),
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
  const level = MIN_TIDE_LEVEL
    + Math.trunc((triangle * (MAX_TIDE_LEVEL - MIN_TIDE_LEVEL)) / half);
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

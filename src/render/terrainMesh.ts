import type {
  TerrainGridView,
  TerrainKind,
  TerrainTileView,
  WorldPoint,
} from "./types";

const DEFAULT_CHUNK_SIZE = 16;
const MAX_CHUNK_SIZE = 256;
const MAX_TERRAIN_CELLS = 1_000_000;
const WATER_EPSILON = 1e-6;

const TERRAIN_KINDS: ReadonlySet<string> = new Set<TerrainKind>([
  "deep-water",
  "channel",
  "shallows",
  "mudflat",
  "sandbar",
  "salt-marsh",
  "meadow",
  "scrub",
  "ridge",
  "built",
]);

export interface TerrainMeshOptions {
  /** Number of source tiles along either side of a chunk. Defaults to 16. */
  readonly chunkSize?: number;
  /** World-space height represented by a normalized elevation of 1. */
  readonly verticalScale?: number;
}

export type TerrainMeshElevationReader = (
  tile: TerrainTileView | undefined,
  tileIndex: number,
) => number | undefined;

export interface MeshVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface TerrainMeshVertex extends MeshVector3 {
  /** Normalized coordinates across the complete terrain grid. */
  readonly u: number;
  readonly v: number;
  /** Integer source-grid corner, useful for seam matching and picking. */
  readonly column: number;
  readonly row: number;
  /** A globally calculated normal, shared exactly by duplicated seam vertices. */
  readonly normal: MeshVector3;
}

export interface TerrainMeshBounds {
  readonly min: MeshVector3;
  readonly max: MeshVector3;
}

export interface TerrainMeshGridBounds {
  readonly startColumn: number;
  readonly startRow: number;
  /** Exclusive source-tile boundary. */
  readonly endColumn: number;
  /** Exclusive source-tile boundary. */
  readonly endRow: number;
}

export interface TerrainMeshTile {
  readonly column: number;
  readonly row: number;
  readonly kind: TerrainKind;
  readonly waterDepth: number;
  /** Offset of this tile's first triangle in the chunk's index array. */
  readonly indexOffset: number;
}

export interface TerrainMeshChunk {
  readonly id: string;
  readonly chunkColumn: number;
  readonly chunkRow: number;
  readonly gridBounds: TerrainMeshGridBounds;
  readonly bounds: TerrainMeshBounds;
  readonly vertices: readonly TerrainMeshVertex[];
  /** Two counter-clockwise, upward-facing triangles per source tile. */
  readonly indices: readonly number[];
  /** Row-major material and water references for the chunk's source tiles. */
  readonly tiles: readonly TerrainMeshTile[];
}

export interface TerrainWaterPlane {
  /** Mean elevation + depth of all wet source tiles, before vertical scaling. */
  readonly normalizedLevel: number;
  readonly level: number;
  readonly wetTileCount: number;
  readonly maxDepth: number;
  readonly minSurfaceLevel: number;
  readonly maxSurfaceLevel: number;
  readonly gridBounds: TerrainMeshGridBounds;
  readonly bounds: TerrainMeshBounds;
  readonly vertices: readonly MeshVector3[];
  readonly indices: readonly number[];
  /** Complete row-major depth field; dry and missing tiles are zero. */
  readonly depths: readonly number[];
}

export interface TerrainMesh {
  readonly sourceRevision: number | string;
  readonly columns: number;
  readonly rows: number;
  readonly tileSize: number;
  readonly chunkSize: number;
  readonly verticalScale: number;
  readonly bounds: TerrainMeshBounds | null;
  readonly chunks: readonly TerrainMeshChunk[];
  readonly waterPlane: TerrainWaterPlane | null;
}

interface SanitizedTile {
  readonly elevation: number;
  readonly waterDepth: number;
  readonly kind: TerrainKind;
}

interface MutableNormal {
  x: number;
  y: number;
  z: number;
}

/**
 * Converts renderer terrain cells into a deterministic, chunked height field.
 *
 * Source elevations live at tile centers. Mesh corner heights are the mean of
 * the one to four neighboring cells, which gives the world complete edge
 * coverage without inventing samples beyond the grid. Chunk seams duplicate
 * positions but copy normals from one global normal field, so independently
 * rendered chunks meet without lighting discontinuities.
 */
export function buildTerrainMesh(
  grid: TerrainGridView,
  options: TerrainMeshOptions = {},
): TerrainMesh {
  const columns = finiteInteger(grid?.columns, 0);
  const rows = finiteInteger(grid?.rows, 0);
  const tileSize = positiveFinite(grid?.tileSize, 1);
  const sourceRevision = grid?.revision ?? 0;
  const chunkSize = boundedInteger(options.chunkSize, DEFAULT_CHUNK_SIZE, 1, MAX_CHUNK_SIZE);
  const verticalScale = nonNegativeFinite(options.verticalScale, tileSize * 2);
  const sourceTiles = Array.isArray(grid?.tiles) ? grid.tiles : [];

  if (
    columns < 1
    || rows < 1
    || sourceTiles.length === 0
    || columns * rows > MAX_TERRAIN_CELLS
  ) {
    return {
      sourceRevision,
      columns: Math.max(0, columns),
      rows: Math.max(0, rows),
      tileSize,
      chunkSize,
      verticalScale,
      bounds: null,
      chunks: [],
      waterPlane: null,
    };
  }

  const originX = finiteNumber(grid.origin?.x, 0);
  const originY = finiteNumber(grid.origin?.y, 0);
  const tiles = sanitizeTiles(sourceTiles, columns * rows);
  const cornerElevations = buildCornerElevations(tiles, columns, rows);
  const positions = buildPositions(
    cornerElevations,
    columns,
    rows,
    originX,
    originY,
    tileSize,
    verticalScale,
  );
  const normals = buildNormals(positions, columns, rows);
  const chunks = buildChunks({
    columns,
    rows,
    tileSize,
    chunkSize,
    originX,
    originY,
    positions,
    normals,
    tiles,
  });
  const bounds = boundsFromPositions(positions);
  const waterPlane = buildWaterPlane({
    columns,
    rows,
    tileSize,
    originX,
    originY,
    verticalScale,
    tiles,
  });

  return {
    sourceRevision,
    columns,
    rows,
    tileSize,
    chunkSize,
    verticalScale,
    bounds,
    chunks,
    waterPlane,
  };
}

/**
 * Samples the exact piecewise-planar land surface emitted by buildTerrainMesh.
 * Callers that mask source elevation may supply the same masked elevation
 * reader without allocating a complete shadow grid for each query.
 */
export function sampleTerrainMeshLandHeightAt(
  grid: TerrainGridView,
  point: WorldPoint,
  verticalScale: number,
  elevationReader: TerrainMeshElevationReader = (tile) => tile?.elevation,
): number {
  const columns = finiteInteger(grid?.columns, 0);
  const rows = finiteInteger(grid?.rows, 0);
  const sourceTiles = Array.isArray(grid?.tiles) ? grid.tiles : [];
  if (
    columns < 1
    || rows < 1
    || sourceTiles.length === 0
    || columns * rows > MAX_TERRAIN_CELLS
  ) {
    return 0;
  }

  const tileSize = positiveFinite(grid?.tileSize, 1);
  const scale = nonNegativeFinite(verticalScale, 0);
  const originX = finiteNumber(grid.origin?.x, 0);
  const originY = finiteNumber(grid.origin?.y, 0);
  const normalizedX = clamp(
    (finiteNumber(point?.x, originX) - originX) / tileSize,
    0,
    columns,
  );
  const normalizedY = clamp(
    (finiteNumber(point?.y, originY) - originY) / tileSize,
    0,
    rows,
  );
  const column = Math.min(columns - 1, Math.floor(normalizedX));
  const row = Math.min(rows - 1, Math.floor(normalizedY));
  const localX = clamp(normalizedX - column, 0, 1);
  const localY = clamp(normalizedY - row, 0, 1);
  const elevationAt = (index: number): number =>
    unit(elevationReader(sourceTiles[index], index));
  const topLeft = averageCornerElevation(
    columns,
    rows,
    column,
    row,
    elevationAt,
  );
  const topRight = averageCornerElevation(
    columns,
    rows,
    column + 1,
    row,
    elevationAt,
  );
  const bottomLeft = averageCornerElevation(
    columns,
    rows,
    column,
    row + 1,
    elevationAt,
  );
  const bottomRight = averageCornerElevation(
    columns,
    rows,
    column + 1,
    row + 1,
    elevationAt,
  );

  // buildChunks splits every tile from top-left to bottom-right. Interpolate
  // on that same diagonal so anchors match either emitted triangle exactly.
  const normalizedHeight = localX >= localY
    ? topLeft
      + localX * (topRight - topLeft)
      + localY * (bottomRight - topRight)
    : topLeft
      + localX * (bottomRight - bottomLeft)
      + localY * (bottomLeft - topLeft);
  return normalizedHeight * scale;
}

function sanitizeTiles(
  sourceTiles: readonly TerrainTileView[],
  expectedCount: number,
): readonly SanitizedTile[] {
  return Array.from({ length: expectedCount }, (_, index): SanitizedTile => {
    const tile = sourceTiles[index];
    return {
      elevation: unit(tile?.elevation),
      waterDepth: unit(tile?.waterDepth),
      kind: terrainKind(tile?.kind),
    };
  });
}

function buildCornerElevations(
  tiles: readonly SanitizedTile[],
  columns: number,
  rows: number,
): readonly number[] {
  const stride = columns + 1;
  const elevations = new Array<number>((columns + 1) * (rows + 1));
  const elevationAt = (index: number): number => tiles[index]?.elevation ?? 0;

  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      elevations[row * stride + column] = averageCornerElevation(
        columns,
        rows,
        column,
        row,
        elevationAt,
      );
    }
  }

  return elevations;
}

function averageCornerElevation(
  columns: number,
  rows: number,
  cornerColumn: number,
  cornerRow: number,
  elevationAt: (tileIndex: number) => number,
): number {
  let total = 0;
  let count = 0;
  for (let tileRow = cornerRow - 1; tileRow <= cornerRow; tileRow += 1) {
    if (tileRow < 0 || tileRow >= rows) continue;
    for (let tileColumn = cornerColumn - 1; tileColumn <= cornerColumn; tileColumn += 1) {
      if (tileColumn < 0 || tileColumn >= columns) continue;
      total += elevationAt(tileRow * columns + tileColumn);
      count += 1;
    }
  }
  return count > 0 ? total / count : 0;
}

function buildPositions(
  elevations: readonly number[],
  columns: number,
  rows: number,
  originX: number,
  originY: number,
  tileSize: number,
  verticalScale: number,
): readonly MeshVector3[] {
  const stride = columns + 1;
  return elevations.map((elevation, index): MeshVector3 => {
    const column = index % stride;
    const row = Math.floor(index / stride);
    return {
      x: originX + column * tileSize,
      y: originY + row * tileSize,
      z: elevation * verticalScale,
    };
  });
}

function buildNormals(
  positions: readonly MeshVector3[],
  columns: number,
  rows: number,
): readonly MeshVector3[] {
  const stride = columns + 1;
  const normals: MutableNormal[] = Array.from(
    { length: positions.length },
    (): MutableNormal => ({ x: 0, y: 0, z: 0 }),
  );

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const topLeft = row * stride + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + stride;
      const bottomRight = bottomLeft + 1;
      accumulateFaceNormal(normals, positions, topLeft, topRight, bottomRight);
      accumulateFaceNormal(normals, positions, topLeft, bottomRight, bottomLeft);
    }
  }

  return normals.map((normal): MeshVector3 => normalizedUpward(normal));
}

function accumulateFaceNormal(
  normals: MutableNormal[],
  positions: readonly MeshVector3[],
  first: number,
  second: number,
  third: number,
): void {
  const a = positions[first];
  const b = positions[second];
  const c = positions[third];
  if (!a || !b || !c) return;

  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const abZ = b.z - a.z;
  const acX = c.x - a.x;
  const acY = c.y - a.y;
  const acZ = c.z - a.z;
  const x = abY * acZ - abZ * acY;
  const y = abZ * acX - abX * acZ;
  const z = abX * acY - abY * acX;

  for (const index of [first, second, third]) {
    const normal = normals[index];
    if (!normal) continue;
    normal.x += x;
    normal.y += y;
    normal.z += z;
  }
}

function normalizedUpward(normal: MutableNormal): MeshVector3 {
  const length = Math.hypot(normal.x, normal.y, normal.z);
  if (!Number.isFinite(length) || length <= Number.EPSILON) {
    return { x: 0, y: 0, z: 1 };
  }

  const sign = normal.z < 0 ? -1 : 1;
  return {
    x: (normal.x / length) * sign,
    y: (normal.y / length) * sign,
    z: (normal.z / length) * sign,
  };
}

function buildChunks(input: {
  readonly columns: number;
  readonly rows: number;
  readonly tileSize: number;
  readonly chunkSize: number;
  readonly originX: number;
  readonly originY: number;
  readonly positions: readonly MeshVector3[];
  readonly normals: readonly MeshVector3[];
  readonly tiles: readonly SanitizedTile[];
}): readonly TerrainMeshChunk[] {
  const chunks: TerrainMeshChunk[] = [];
  const globalStride = input.columns + 1;
  const chunkColumns = Math.ceil(input.columns / input.chunkSize);
  const chunkRows = Math.ceil(input.rows / input.chunkSize);

  for (let chunkRow = 0; chunkRow < chunkRows; chunkRow += 1) {
    const startRow = chunkRow * input.chunkSize;
    const endRow = Math.min(input.rows, startRow + input.chunkSize);
    for (let chunkColumn = 0; chunkColumn < chunkColumns; chunkColumn += 1) {
      const startColumn = chunkColumn * input.chunkSize;
      const endColumn = Math.min(input.columns, startColumn + input.chunkSize);
      const localColumns = endColumn - startColumn;
      const localRows = endRow - startRow;
      const localStride = localColumns + 1;
      const vertices: TerrainMeshVertex[] = [];
      const indices: number[] = [];
      const tiles: TerrainMeshTile[] = [];

      for (let row = startRow; row <= endRow; row += 1) {
        for (let column = startColumn; column <= endColumn; column += 1) {
          const globalIndex = row * globalStride + column;
          const position = input.positions[globalIndex] ?? { x: 0, y: 0, z: 0 };
          const normal = input.normals[globalIndex] ?? { x: 0, y: 0, z: 1 };
          vertices.push({
            ...position,
            u: column / input.columns,
            v: row / input.rows,
            column,
            row,
            normal,
          });
        }
      }

      for (let row = 0; row < localRows; row += 1) {
        for (let column = 0; column < localColumns; column += 1) {
          const topLeft = row * localStride + column;
          const topRight = topLeft + 1;
          const bottomLeft = topLeft + localStride;
          const bottomRight = bottomLeft + 1;
          const indexOffset = indices.length;
          indices.push(topLeft, topRight, bottomRight, topLeft, bottomRight, bottomLeft);

          const sourceColumn = startColumn + column;
          const sourceRow = startRow + row;
          const tile = input.tiles[sourceRow * input.columns + sourceColumn]
            ?? { elevation: 0, waterDepth: 0, kind: "deep-water" };
          tiles.push({
            column: sourceColumn,
            row: sourceRow,
            kind: tile.kind,
            waterDepth: tile.waterDepth,
            indexOffset,
          });
        }
      }

      chunks.push({
        id: `terrain-${chunkColumn}-${chunkRow}`,
        chunkColumn,
        chunkRow,
        gridBounds: { startColumn, startRow, endColumn, endRow },
        bounds: boundsFromPositions(vertices) ?? {
          min: { x: input.originX, y: input.originY, z: 0 },
          max: { x: input.originX, y: input.originY, z: 0 },
        },
        vertices,
        indices,
        tiles,
      });
    }
  }

  return chunks;
}

function buildWaterPlane(input: {
  readonly columns: number;
  readonly rows: number;
  readonly tileSize: number;
  readonly originX: number;
  readonly originY: number;
  readonly verticalScale: number;
  readonly tiles: readonly SanitizedTile[];
}): TerrainWaterPlane | null {
  const depths = input.tiles.map((tile) => tile.waterDepth);
  let wetTileCount = 0;
  let maxDepth = 0;
  let surfaceTotal = 0;
  let minSurfaceLevel = Number.POSITIVE_INFINITY;
  let maxSurfaceLevel = Number.NEGATIVE_INFINITY;
  let startColumn = input.columns;
  let startRow = input.rows;
  let endColumn = 0;
  let endRow = 0;

  for (let row = 0; row < input.rows; row += 1) {
    for (let column = 0; column < input.columns; column += 1) {
      const tile = input.tiles[row * input.columns + column];
      if (!tile || tile.waterDepth <= WATER_EPSILON) continue;
      const surfaceLevel = tile.elevation + tile.waterDepth;
      wetTileCount += 1;
      maxDepth = Math.max(maxDepth, tile.waterDepth);
      surfaceTotal += surfaceLevel;
      minSurfaceLevel = Math.min(minSurfaceLevel, surfaceLevel);
      maxSurfaceLevel = Math.max(maxSurfaceLevel, surfaceLevel);
      startColumn = Math.min(startColumn, column);
      startRow = Math.min(startRow, row);
      endColumn = Math.max(endColumn, column + 1);
      endRow = Math.max(endRow, row + 1);
    }
  }

  if (wetTileCount === 0) return null;

  const normalizedLevel = surfaceTotal / wetTileCount;
  const level = normalizedLevel * input.verticalScale;
  const minX = input.originX + startColumn * input.tileSize;
  const minY = input.originY + startRow * input.tileSize;
  const maxX = input.originX + endColumn * input.tileSize;
  const maxY = input.originY + endRow * input.tileSize;
  const vertices: readonly MeshVector3[] = [
    { x: minX, y: minY, z: level },
    { x: maxX, y: minY, z: level },
    { x: maxX, y: maxY, z: level },
    { x: minX, y: maxY, z: level },
  ];

  return {
    normalizedLevel,
    level,
    wetTileCount,
    maxDepth,
    minSurfaceLevel,
    maxSurfaceLevel,
    gridBounds: { startColumn, startRow, endColumn, endRow },
    bounds: {
      min: { x: minX, y: minY, z: level },
      max: { x: maxX, y: maxY, z: level },
    },
    vertices,
    indices: [0, 1, 2, 0, 2, 3],
    depths,
  };
}

function boundsFromPositions(positions: readonly MeshVector3[]): TerrainMeshBounds | null {
  if (positions.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const position of positions) {
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    minZ = Math.min(minZ, position.z);
    maxX = Math.max(maxX, position.x);
    maxY = Math.max(maxY, position.y);
    maxZ = Math.max(maxZ, position.z);
  }

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}

function terrainKind(value: unknown): TerrainKind {
  return typeof value === "string" && TERRAIN_KINDS.has(value)
    ? value as TerrainKind
    : "deep-water";
}

function unit(value: unknown): number {
  return Math.min(1, Math.max(0, finiteNumber(value, 0)));
}

function finiteInteger(value: unknown, fallback: number): number {
  const number = finiteNumber(value, fallback);
  return Math.floor(number);
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const number = finiteInteger(value, fallback);
  return number < minimum ? fallback : Math.min(maximum, number);
}

function positiveFinite(value: unknown, fallback: number): number {
  const number = finiteNumber(value, fallback);
  return number > 0 ? number : fallback;
}

function nonNegativeFinite(value: unknown, fallback: number): number {
  const number = finiteNumber(value, fallback);
  return number >= 0 ? number : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

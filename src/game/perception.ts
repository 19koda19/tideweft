/**
 * Pure, renderer-independent perception queries.
 *
 * Grid coordinates are row-major, with +x moving across columns and +y moving
 * across rows. Elevation, obstruction, and weather visibility are normalized
 * floating-point values in the inclusive 0..1 range.
 */

export const PERCEPTION_VERSION = 1 as const;
export const MAX_PERCEPTION_GRID_CELLS = 1_048_576;

export const VISIBILITY_HIDDEN = 0 as const;
export const VISIBILITY_PERIPHERAL = 1 as const;
export const VISIBILITY_DIRECT = 2 as const;

export type VisibilityGrade =
  | typeof VISIBILITY_HIDDEN
  | typeof VISIBILITY_PERIPHERAL
  | typeof VISIBILITY_DIRECT;

export interface PerceptionCell {
  readonly elevation: number;
  readonly obstruction: number;
}

export interface PerceptionRanges {
  /** Radius of 360-degree close awareness, measured in tile-center units. */
  readonly closePeripheralRange: number;
  /** Longer visual radius available only inside the forward cone. */
  readonly directSightRange: number;
  /** Full angular width of the forward cone, in radians. */
  readonly forwardConeRadians: number;
}

export interface PerceptionRangeOverrides {
  readonly closePeripheralRange?: number;
  readonly directSightRange?: number;
  readonly forwardConeRadians?: number;
}

export const DEFAULT_PERCEPTION_RANGES: Readonly<PerceptionRanges> = Object.freeze({
  closePeripheralRange: 2,
  directSightRange: 8,
  forwardConeRadians: (2 * Math.PI) / 3,
});

export interface PerceptionInput {
  readonly columns: number;
  readonly rows: number;
  readonly cells: readonly PerceptionCell[];
  readonly playerTileIndex: number;
  readonly facingRadians: number;
  readonly weatherVisibility: number;
  readonly rangeOverrides?: PerceptionRangeOverrides;
}

export interface PerceptionResult {
  readonly version: typeof PERCEPTION_VERSION;
  /** False means every visibility grade and index list has failed closed. */
  readonly valid: boolean;
  /** Row-major visibility grades: 0 hidden, 1 peripheral, and 2 direct. */
  readonly visibilityGrades: Uint8Array;
  readonly visibleTileIndices: readonly number[];
  readonly directTileIndices: readonly number[];
  readonly peripheralTileIndices: readonly number[];
  /** -1 only when no valid in-bounds player index was supplied. */
  readonly playerTileIndex: number;
  /** Stable digest of disclosed result data only; hidden cell data is excluded. */
  readonly signature: string;
}

export interface WorldPoint {
  readonly x: number;
  readonly y: number;
}

export interface AudibleContactInput {
  readonly listener: WorldPoint;
  readonly source: WorldPoint;
  readonly baseRange: number;
  /** Normalized masking pressure in the inclusive 0..1 range. */
  readonly ambientNoise: number;
  /** Normalized source volume in the inclusive 0..1 range. */
  readonly sourceLoudness: number;
  /** Finite world-space wind vector; magnitude is saturated at one. */
  readonly wind: WorldPoint;
}

export interface AudibleBearingBand {
  /** Estimated listener-to-source direction, normalized to 0 (inclusive)..2pi (exclusive). */
  readonly centerRadians: number;
  /** Symmetric half-width around centerRadians. Always positive for a contact. */
  readonly uncertaintyRadians: number;
}

export interface AudibleDistanceBand {
  readonly minimum: number;
  readonly maximum: number;
}

/**
 * Deliberately contains no source coordinate, actor identifier, label, or exact
 * distance. Callers may render a contact but cannot use it as entity knowledge.
 */
export interface AudibleContact {
  readonly bearing: AudibleBearingBand;
  readonly distanceBand: AudibleDistanceBand;
  /** Normalized confidence in the inclusive 0..1 range. */
  readonly certainty: number;
}

interface ValidatedGrid {
  readonly columns: number;
  readonly rows: number;
  readonly cells: readonly PerceptionCell[];
}

const TAU = 2 * Math.PI;
const OBSTRUCTION_BLOCKING_THRESHOLD = 0.5;
const OBSERVER_EYE_HEIGHT = 0.125;
const LINE_OF_SIGHT_EPSILON = 1e-12;
const RESULT_SIGNATURE_PREFIX = `perception-v${PERCEPTION_VERSION}`;
const FNV_OFFSET_BASIS = 0x811c_9dc5;
const FNV_PRIME = 0x0100_0193;
const OUTPUT_PRECISION = 1_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUnit(value: unknown): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= 0
    && value <= 1;
}

function isFiniteNonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalizeAngle(radians: number): number {
  const wrapped = radians % TAU;
  const normalized = wrapped < 0 ? wrapped + TAU : wrapped;
  return Object.is(normalized, -0) || normalized === TAU ? 0 : normalized;
}

function angleDistance(left: number, right: number): number {
  const delta = normalizeAngle(left) - normalizeAngle(right);
  return Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)));
}

function quantize(value: number): number {
  const result = Math.round(value * OUTPUT_PRECISION) / OUTPUT_PRECISION;
  return Object.is(result, -0) ? 0 : result;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function validatedDimensions(
  columnsValue: unknown,
  rowsValue: unknown,
): { readonly columns: number; readonly rows: number; readonly count: number } | null {
  if (
    !Number.isSafeInteger(columnsValue)
    || !Number.isSafeInteger(rowsValue)
    || (columnsValue as number) <= 0
    || (rowsValue as number) <= 0
  ) return null;

  const columns = columnsValue as number;
  const rows = rowsValue as number;
  const count = columns * rows;
  if (!Number.isSafeInteger(count) || count > MAX_PERCEPTION_GRID_CELLS) return null;
  return { columns, rows, count };
}

function validateGrid(
  record: Record<string, unknown>,
  dimensions: { readonly columns: number; readonly rows: number; readonly count: number },
): ValidatedGrid | null {
  const rawCells = record.cells;
  if (!Array.isArray(rawCells) || rawCells.length !== dimensions.count) return null;

  const cells: PerceptionCell[] = [];
  for (const rawCell of rawCells) {
    if (!isRecord(rawCell)) return null;
    const elevation = rawCell.elevation;
    const obstruction = rawCell.obstruction;
    if (!isUnit(elevation) || !isUnit(obstruction)) return null;
    cells.push({ elevation, obstruction });
  }
  return {
    columns: dimensions.columns,
    rows: dimensions.rows,
    cells,
  };
}

function validateRanges(raw: unknown): PerceptionRanges | null {
  if (raw !== undefined && !isRecord(raw)) return null;
  const overrides = raw as Record<string, unknown> | undefined;
  const rawCloseRange = overrides?.closePeripheralRange;
  const rawDirectRange = overrides?.directSightRange;
  const rawCone = overrides?.forwardConeRadians;
  const closePeripheralRange = rawCloseRange === undefined
    ? DEFAULT_PERCEPTION_RANGES.closePeripheralRange
    : rawCloseRange;
  const directSightRange = rawDirectRange === undefined
    ? DEFAULT_PERCEPTION_RANGES.directSightRange
    : rawDirectRange;
  const forwardConeRadians = rawCone === undefined
    ? DEFAULT_PERCEPTION_RANGES.forwardConeRadians
    : rawCone;

  if (
    !isFiniteNonnegative(closePeripheralRange)
    || !isFiniteNonnegative(directSightRange)
    || !isFiniteNonnegative(forwardConeRadians)
    || directSightRange < closePeripheralRange
    || forwardConeRadians > TAU
  ) return null;
  return { closePeripheralRange, directSightRange, forwardConeRadians };
}

function appendUint32(hash: number, value: number): number {
  let result = hash;
  const normalized = value >>> 0;
  for (let shift = 0; shift < 32; shift += 8) {
    result = Math.imul(result ^ ((normalized >>> shift) & 0xff), FNV_PRIME) >>> 0;
  }
  return result;
}

function visibilitySignature(
  valid: boolean,
  columns: number,
  rows: number,
  playerTileIndex: number,
  visibility: Uint8Array,
): string {
  let hash = FNV_OFFSET_BASIS;
  hash = appendUint32(hash, PERCEPTION_VERSION);
  hash = appendUint32(hash, valid ? 1 : 0);
  hash = appendUint32(hash, columns);
  hash = appendUint32(hash, rows);
  hash = appendUint32(hash, playerTileIndex);
  hash = appendUint32(hash, visibility.length);
  for (const grade of visibility) {
    hash = Math.imul(hash ^ grade, FNV_PRIME) >>> 0;
  }
  return `${RESULT_SIGNATURE_PREFIX}:${hash.toString(16).padStart(8, "0")}`;
}

function createResult(
  valid: boolean,
  columns: number,
  rows: number,
  playerTileIndex: number,
  visibility: Uint8Array,
): PerceptionResult {
  const visibleTileIndices: number[] = [];
  const directTileIndices: number[] = [];
  const peripheralTileIndices: number[] = [];
  for (let index = 0; index < visibility.length; index += 1) {
    const grade = visibility[index];
    if (grade === VISIBILITY_PERIPHERAL) {
      visibleTileIndices.push(index);
      peripheralTileIndices.push(index);
    } else if (grade === VISIBILITY_DIRECT) {
      visibleTileIndices.push(index);
      directTileIndices.push(index);
    }
  }
  return {
    version: PERCEPTION_VERSION,
    valid,
    visibilityGrades: visibility,
    visibleTileIndices,
    directTileIndices,
    peripheralTileIndices,
    playerTileIndex,
    signature: visibilitySignature(valid, columns, rows, playerTileIndex, visibility),
  };
}

function failedResult(
  columns: number,
  rows: number,
  count: number,
  playerTileIndex: number,
): PerceptionResult {
  return createResult(false, columns, rows, playerTileIndex, new Uint8Array(count));
}

/**
 * Checks intermediate cells on a deterministic Bresenham path. The target cell
 * itself remains visible (for example, a wall face is seen), while that cell
 * can occlude tiles beyond it on their own queries.
 */
function hasLineOfSight(
  grid: ValidatedGrid,
  fromIndex: number,
  toIndex: number,
): boolean {
  const fromX = fromIndex % grid.columns;
  const fromY = Math.floor(fromIndex / grid.columns);
  const toX = toIndex % grid.columns;
  const toY = Math.floor(toIndex / grid.columns);
  const totalDistance = Math.hypot(toX - fromX, toY - fromY);
  if (totalDistance === 0) return true;

  const origin = grid.cells[fromIndex];
  const target = grid.cells[toIndex];
  if (!origin || !target) return false;
  const originEye = origin.elevation + OBSERVER_EYE_HEIGHT;
  const targetEye = target.elevation + OBSERVER_EYE_HEIGHT;

  let x = fromX;
  let y = fromY;
  const deltaX = Math.abs(toX - fromX);
  const stepX = fromX < toX ? 1 : -1;
  const deltaY = -Math.abs(toY - fromY);
  const stepY = fromY < toY ? 1 : -1;
  let error = deltaX + deltaY;

  while (x !== toX || y !== toY) {
    const doubledError = 2 * error;
    if (doubledError >= deltaY) {
      error += deltaY;
      x += stepX;
    }
    if (doubledError <= deltaX) {
      error += deltaX;
      y += stepY;
    }
    if (x === toX && y === toY) return true;

    const cell = grid.cells[y * grid.columns + x];
    if (!cell || cell.obstruction >= OBSTRUCTION_BLOCKING_THRESHOLD) return false;
    const traveled = Math.hypot(x - fromX, y - fromY);
    const rayHeight = originEye + (targetEye - originEye) * (traveled / totalDistance);
    if (cell.elevation >= rayHeight - LINE_OF_SIGHT_EPSILON) return false;
  }
  return true;
}

/**
 * Computes one immutable-by-convention visibility snapshot. All malformed
 * inputs return a zero-filled result and empty index lists; no partial terrain
 * validation can disclose part of the map.
 */
export function evaluatePerception(input: PerceptionInput): PerceptionResult {
  const rawInput: unknown = input;
  if (!isRecord(rawInput)) return failedResult(0, 0, 0, -1);

  const dimensions = validatedDimensions(rawInput.columns, rawInput.rows);
  if (!dimensions) return failedResult(0, 0, 0, -1);
  const rawPlayerIndex = rawInput.playerTileIndex;
  const playerTileIndex = Number.isSafeInteger(rawPlayerIndex)
    && (rawPlayerIndex as number) >= 0
    && (rawPlayerIndex as number) < dimensions.count
    ? rawPlayerIndex as number
    : -1;

  const grid = validateGrid(rawInput, dimensions);
  const ranges = validateRanges(rawInput.rangeOverrides);
  const facingRadians = rawInput.facingRadians;
  const weatherVisibility = rawInput.weatherVisibility;
  if (
    !grid
    || playerTileIndex < 0
    || typeof facingRadians !== "number"
    || !Number.isFinite(facingRadians)
    || !isUnit(weatherVisibility)
    || !ranges
  ) {
    return failedResult(
      dimensions.columns,
      dimensions.rows,
      dimensions.count,
      playerTileIndex,
    );
  }

  const visibility = new Uint8Array(dimensions.count);
  visibility[playerTileIndex] = VISIBILITY_DIRECT;
  const playerX = playerTileIndex % dimensions.columns;
  const playerY = Math.floor(playerTileIndex / dimensions.columns);
  const maximumGridDistance = Math.hypot(dimensions.columns - 1, dimensions.rows - 1);
  const peripheralRange = Math.min(
    maximumGridDistance,
    ranges.closePeripheralRange * weatherVisibility,
  );
  const directRange = Math.min(
    maximumGridDistance,
    ranges.directSightRange * weatherVisibility,
  );
  const halfCone = ranges.forwardConeRadians / 2;
  const normalizedFacing = normalizeAngle(facingRadians);

  for (let index = 0; index < dimensions.count; index += 1) {
    if (index === playerTileIndex) continue;
    const x = index % dimensions.columns;
    const y = Math.floor(index / dimensions.columns);
    const deltaX = x - playerX;
    const deltaY = y - playerY;
    const distance = Math.hypot(deltaX, deltaY);
    const inPeripheralRange = distance <= peripheralRange;
    const inDirectRange = distance <= directRange;
    if (!inPeripheralRange && !inDirectRange) continue;

    const bearing = Math.atan2(deltaY, deltaX);
    const inForwardCone = angleDistance(bearing, normalizedFacing)
      <= halfCone + LINE_OF_SIGHT_EPSILON;
    const direct = inDirectRange && inForwardCone;
    if (!direct && !inPeripheralRange) continue;
    if (!hasLineOfSight(grid, playerTileIndex, index)) continue;
    visibility[index] = direct ? VISIBILITY_DIRECT : VISIBILITY_PERIPHERAL;
  }

  return createResult(
    true,
    dimensions.columns,
    dimensions.rows,
    playerTileIndex,
    visibility,
  );
}

function readPoint(value: unknown): WorldPoint | null {
  if (!isRecord(value)) return null;
  const x = value.x;
  const y = value.y;
  return typeof x === "number"
    && typeof y === "number"
    && Number.isFinite(x)
    && Number.isFinite(y)
    ? { x, y }
    : null;
}

/**
 * Evaluates an anonymous directional sound contact. Wind aligned with travel
 * from source to listener extends reach; crosswind broadens uncertainty. The
 * result intentionally gives bands rather than an entity or exact location.
 */
export function evaluateAudibleContact(input: AudibleContactInput): AudibleContact | null {
  const rawInput: unknown = input;
  if (!isRecord(rawInput)) return null;
  const listener = readPoint(rawInput.listener);
  const source = readPoint(rawInput.source);
  const wind = readPoint(rawInput.wind);
  const baseRange = rawInput.baseRange;
  const ambientNoise = rawInput.ambientNoise;
  const sourceLoudness = rawInput.sourceLoudness;
  if (
    !listener
    || !source
    || !wind
    || !isFiniteNonnegative(baseRange)
    || !isUnit(ambientNoise)
    || !isUnit(sourceLoudness)
  ) return null;

  const deltaX = source.x - listener.x;
  const deltaY = source.y - listener.y;
  const distance = Math.hypot(deltaX, deltaY);
  const windMagnitude = Math.hypot(wind.x, wind.y);
  if (!Number.isFinite(distance) || !Number.isFinite(windMagnitude)) return null;

  const audibility = sourceLoudness * (1 - ambientNoise);
  if (audibility <= 0) return null;
  const windScale = windMagnitude > 1 ? 1 / windMagnitude : 1;
  const windX = wind.x * windScale;
  const windY = wind.y * windScale;
  const directionX = distance === 0 ? 0 : deltaX / distance;
  const directionY = distance === 0 ? 0 : deltaY / distance;
  // Sound propagates opposite the listener-to-source direction.
  const alongPropagation = -(windX * directionX + windY * directionY);
  const crosswind = directionX * windY - directionY * windX;
  const effectiveRange = baseRange * audibility * (1 + 0.25 * alongPropagation);
  if (!Number.isFinite(effectiveRange) || distance > effectiveRange) return null;

  const rangeFraction = effectiveRange === 0 ? 0 : clampUnit(distance / effectiveRange);
  const proximity = 1 - rangeFraction;
  const rawCertainty = clampUnit(
    audibility * (0.2 + 0.8 * proximity) * (1 - 0.2 * Math.abs(crosswind)),
  );
  const certainty = quantize(rawCertainty);
  if (certainty <= 0) return null;

  const minimumUncertainty = Math.PI / 90;
  const maximumUncertainty = (3 * Math.PI) / 4;
  const uncertainty = distance === 0
    ? Math.PI
    : minimumUncertainty
      + (maximumUncertainty - minimumUncertainty) * (1 - rawCertainty);
  const exactBearing = distance === 0 ? 0 : Math.atan2(deltaY, deltaX);
  const estimatedBearing = normalizeAngle(exactBearing + crosswind * uncertainty * 0.2);

  const relativeDistanceError = 0.08 + 0.72 * (1 - rawCertainty);
  const absoluteDistanceError = effectiveRange * (1 - rawCertainty) * 0.025;
  const minimumDistance = Math.max(
    0,
    distance * (1 - relativeDistanceError) - absoluteDistanceError,
  );
  const maximumDistance = Math.min(
    effectiveRange,
    distance * (1 + relativeDistanceError) + absoluteDistanceError,
  );
  const quantizedMinimum = quantize(minimumDistance);
  const quantizedMaximum = Math.max(quantizedMinimum, quantize(maximumDistance));

  return {
    bearing: {
      centerRadians: quantize(estimatedBearing),
      uncertaintyRadians: quantize(uncertainty),
    },
    distanceBand: {
      minimum: quantizedMinimum,
      maximum: quantizedMaximum,
    },
    certainty,
  };
}

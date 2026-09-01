import type { RootSeed } from "./rng";
import { WORLD_HEIGHT, WORLD_WIDTH } from "./types";

/**
 * The largest symmetric region envelope for which every local tile remains a
 * safe integer on both axes. This is a representation limit derived from the
 * numeric platform, not an authored world boundary.
 */
export const REGION_COORD_LIMIT = Math.min(
  Math.floor((Number.MAX_SAFE_INTEGER - (WORLD_WIDTH - 1)) / WORLD_WIDTH),
  Math.floor((Number.MAX_SAFE_INTEGER - (WORLD_HEIGHT - 1)) / WORLD_HEIGHT),
);

const UINT32_MAX = 0xffff_ffff;
const REGION_KEY_PATTERN = /^r:(0|-?[1-9]\d*):(0|-?[1-9]\d*)$/;
const OBJECT_KIND_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

export interface RegionCoord {
  readonly x: number;
  readonly y: number;
}

export interface RegionTileAddress {
  readonly region: RegionCoord;
  readonly localX: number;
  readonly localY: number;
}

export interface GlobalTileCoord {
  readonly x: number;
  readonly y: number;
}

export type RegionObjectLocalIdentity = string | number;

function normalizeArithmeticZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function isCanonicalRegionAxis(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    !Object.is(value, -0) &&
    Math.abs(value) <= REGION_COORD_LIMIT
  );
}

function assertSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer`);
  }
  return normalizeArithmeticZero(value);
}

function assertRegionCoord(coord: RegionCoord): void {
  if (!isRegionCoord(coord)) {
    throw new RangeError(
      `Region coordinates must be canonical safe integers within +/-${REGION_COORD_LIMIT}`,
    );
  }
}

function assertRootSeed(rootSeed: RootSeed): void {
  if (
    rootSeed.length !== 4 ||
    rootSeed.some(
      (word) => !Number.isSafeInteger(word) || word < 0 || word > UINT32_MAX || Object.is(word, -0),
    )
  ) {
    throw new RangeError("Root seed must contain exactly four canonical uint32 words");
  }
}

function assertObjectKind(kind: string): void {
  if (!OBJECT_KIND_PATTERN.test(kind)) {
    throw new TypeError("Region object kind must be a canonical lowercase identifier");
  }
}

function assertLocalIdentity(identity: RegionObjectLocalIdentity): void {
  if (typeof identity === "number") {
    if (!Number.isSafeInteger(identity) || Object.is(identity, -0)) {
      throw new RangeError("Numeric region object identity must be a canonical safe integer");
    }
    return;
  }
  if (typeof identity !== "string" || identity.length === 0 || identity.length > 256) {
    throw new TypeError("String region object identity must contain 1 to 256 UTF-16 code units");
  }
}

function seedIdentity(rootSeed: RootSeed): string {
  return rootSeed.map((word) => word.toString(16).padStart(8, "0")).join("");
}

function encodedLocalIdentity(identity: RegionObjectLocalIdentity): string {
  if (typeof identity === "number") return `n:${identity}`;
  let encoded = "";
  for (let index = 0; index < identity.length; index += 1) {
    encoded += identity.charCodeAt(index).toString(16).padStart(4, "0");
  }
  return `s:${encoded}`;
}

/** Creates a frozen canonical coordinate from arithmetic values. */
export function createRegionCoord(x: number, y: number): RegionCoord {
  const canonicalX = assertSafeInteger(x, "Region x");
  const canonicalY = assertSafeInteger(y, "Region y");
  if (Math.abs(canonicalX) > REGION_COORD_LIMIT || Math.abs(canonicalY) > REGION_COORD_LIMIT) {
    throw new RangeError(`Region coordinates must be within +/-${REGION_COORD_LIMIT}`);
  }
  return Object.freeze({ x: canonicalX, y: canonicalY });
}

/** Checks both shape and canonical numeric representation, including rejecting -0. */
export function isRegionCoord(value: unknown): value is RegionCoord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<RegionCoord>;
  return isCanonicalRegionAxis(candidate.x) && isCanonicalRegionAxis(candidate.y);
}

/** Returns the one accepted persistent spelling for a region coordinate. */
export function regionKey(coord: RegionCoord): string {
  assertRegionCoord(coord);
  return `r:${coord.x}:${coord.y}`;
}

/**
 * Parses only canonical persistent keys. Malformed or out-of-range data fails
 * closed with null rather than being silently normalized into another region.
 */
export function parseRegionKey(value: unknown): RegionCoord | null {
  if (typeof value !== "string") return null;
  const match = REGION_KEY_PATTERN.exec(value);
  if (match === null) return null;
  const xText = match[1];
  const yText = match[2];
  if (xText === undefined || yText === undefined) return null;
  const x = Number(xText);
  const y = Number(yText);
  if (!isCanonicalRegionAxis(x) || !isCanonicalRegionAxis(y)) return null;
  return Object.freeze({ x, y });
}

/** Maps signed global tile coordinates with mathematical-floor semantics. */
export function globalTileToRegion(globalX: number, globalY: number): RegionTileAddress {
  const x = assertSafeInteger(globalX, "Global tile x");
  const y = assertSafeInteger(globalY, "Global tile y");
  const regionX = Math.floor(x / WORLD_WIDTH);
  const regionY = Math.floor(y / WORLD_HEIGHT);
  const region = createRegionCoord(regionX, regionY);
  const localX = normalizeArithmeticZero(x - region.x * WORLD_WIDTH);
  const localY = normalizeArithmeticZero(y - region.y * WORLD_HEIGHT);

  if (
    !Number.isSafeInteger(localX) ||
    !Number.isSafeInteger(localY) ||
    localX < 0 ||
    localX >= WORLD_WIDTH ||
    localY < 0 ||
    localY >= WORLD_HEIGHT
  ) {
    throw new RangeError("Global tile coordinate could not be represented canonically");
  }

  return Object.freeze({ region, localX, localY });
}

/** Maps a canonical region and in-region tile coordinate back to global space. */
export function regionLocalToGlobalTile(
  region: RegionCoord,
  localX: number,
  localY: number,
): GlobalTileCoord {
  assertRegionCoord(region);
  const xInRegion = assertSafeInteger(localX, "Local tile x");
  const yInRegion = assertSafeInteger(localY, "Local tile y");
  if (xInRegion < 0 || xInRegion >= WORLD_WIDTH) {
    throw new RangeError(`Local tile x must be between 0 and ${WORLD_WIDTH - 1}`);
  }
  if (yInRegion < 0 || yInRegion >= WORLD_HEIGHT) {
    throw new RangeError(`Local tile y must be between 0 and ${WORLD_HEIGHT - 1}`);
  }

  const x = region.x * WORLD_WIDTH + xInRegion;
  const y = region.y * WORLD_HEIGHT + yInRegion;
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
    throw new RangeError("Region/local tile arithmetic exceeded the safe-integer range");
  }
  return Object.freeze({ x: normalizeArithmeticZero(x), y: normalizeArithmeticZero(y) });
}

/** Stable identity for one region under one persisted root seed. */
export function stableRegionId(rootSeed: RootSeed, coord: RegionCoord): string {
  assertRootSeed(rootSeed);
  assertRegionCoord(coord);
  // Full seed words plus canonical signed coordinates make this identity
  // injective over the supported input space rather than collision-prone.
  return `rg1:${seedIdentity(rootSeed)}:${coord.x}:${coord.y}`;
}

/**
 * Stable identity for a causally generated object inside a region. Typed,
 * fixed-width encoding prevents delimiter/concatenation aliases between fields.
 */
export function stableRegionObjectId(
  rootSeed: RootSeed,
  coord: RegionCoord,
  kind: string,
  localIdentity: RegionObjectLocalIdentity,
): string {
  assertRootSeed(rootSeed);
  assertRegionCoord(coord);
  assertObjectKind(kind);
  assertLocalIdentity(localIdentity);
  // String identities use fixed-width UTF-16 code units; the type marker
  // keeps numeric 1 distinct from string "1" without delimiter ambiguity.
  return `ro1:${seedIdentity(rootSeed)}:${coord.x}:${coord.y}:${kind}:${encodedLocalIdentity(localIdentity)}`;
}

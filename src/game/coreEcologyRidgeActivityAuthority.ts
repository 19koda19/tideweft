import type { TerrainKind } from "../sim/types";
import { hashCanonical } from "../sim/util";
import {
  REGION_HEIGHT_UNITS,
  REGION_WIDTH_UNITS,
  createWorldPosition,
  isWorldPosition,
  type WorldPosition,
} from "./worldPosition";

export const CORE_ECOLOGY_RIDGE_ACTIVITY_AUTHORITY_VERSION = 1 as const;
export const CORE_ECOLOGY_RIDGE_ACTIVITY_AUTHORITY_OWNER_ID =
  "game:core-ecology-ridge-activity-authority:v1" as const;
export const MAX_CORE_ECOLOGY_RIDGE_ACTIVITY_CANDIDATES = 512 as const;
export const MAX_CORE_ECOLOGY_RIDGE_SOAR_ANCHORS = 4 as const;

export interface CoreEcologyRidgeActivityCandidate {
  /** Stable terrain-owner identity, never an array ordinal. */
  readonly sourceTileKey: string;
  readonly position: WorldPosition;
  readonly terrain: TerrainKind;
  readonly elevation: number;
  readonly roughness: number;
}

export interface CoreEcologyRidgeActivityAnchor {
  readonly purpose: "perch" | "soar";
  readonly anchorOrdinal: number;
  readonly sourceTileKey: string;
  readonly position: WorldPosition;
  readonly elevation: number;
  readonly roughness: number;
}

/**
 * Transient receipt derived from a habitat owner's exact ridge candidates.
 * It is not save data and structural clones are deliberately untrusted.
 */
export interface CoreEcologyRidgeActivityAuthorityV1 {
  readonly version: typeof CORE_ECOLOGY_RIDGE_ACTIVITY_AUTHORITY_VERSION;
  readonly ownerId: typeof CORE_ECOLOGY_RIDGE_ACTIVITY_AUTHORITY_OWNER_ID;
  readonly authorityId: string;
  readonly sourceKey: string;
  readonly actorId: string;
  readonly homeAnchor: WorldPosition;
  readonly perchAnchor: CoreEcologyRidgeActivityAnchor;
  readonly soarAnchors: readonly CoreEcologyRidgeActivityAnchor[];
}

export interface DeriveCoreEcologyRidgeActivityAuthorityInput {
  readonly sourceKey: string;
  readonly actorId: string;
  readonly homeAnchor: WorldPosition;
  /** Exact bounded terrain candidates supplied by the habitat authority. */
  readonly candidates: readonly CoreEcologyRidgeActivityCandidate[];
}

const AUTHENTIC_AUTHORITIES = new WeakSet<object>();
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,255}$/u;

/**
 * Select a high perch and a bounded ridge-soar loop without species branches.
 * Candidate input order cannot change the receipt or cadence sequence.
 */
export function deriveCoreEcologyRidgeActivityAuthority(
  value: unknown,
): CoreEcologyRidgeActivityAuthorityV1 | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["actorId", "candidates", "homeAnchor", "sourceKey"])
    || !validId(value.sourceKey)
    || !validId(value.actorId)
    || !isWorldPosition(value.homeAnchor)
    || !plainDataArray(value.candidates)
    || value.candidates.length === 0
    || value.candidates.length > MAX_CORE_ECOLOGY_RIDGE_ACTIVITY_CANDIDATES
  ) return null;
  const sourceKey = value.sourceKey;
  const actorId = value.actorId;
  const homeAnchor = value.homeAnchor;

  const candidates: CoreEcologyRidgeActivityCandidate[] = [];
  const tileKeys = new Set<string>();
  const positions = new Set<string>();
  for (const raw of value.candidates as readonly unknown[]) {
    const candidate = canonicalCandidate(raw, homeAnchor);
    if (candidate === null) return null;
    const positionKey = `${candidate.position.localX}:${candidate.position.localY}`;
    if (tileKeys.has(candidate.sourceTileKey) || positions.has(positionKey)) return null;
    tileKeys.add(candidate.sourceTileKey);
    positions.add(positionKey);
    candidates.push(candidate);
  }

  const orderedBySiteQuality = [...candidates].sort((left, right) => (
    right.elevation - left.elevation
    || right.roughness - left.roughness
    || compareDistanceToHome(left, right, homeAnchor)
    || compareText(left.sourceTileKey, right.sourceTileKey)
  ));
  const perchSite = orderedBySiteQuality[0];
  if (perchSite === undefined) return null;
  const soarSites = orderedBySiteQuality
    .slice(0, MAX_CORE_ECOLOGY_RIDGE_SOAR_ANCHORS)
    .sort((left, right) => (
      stableSoarRank(actorId, sourceKey, left)
        - stableSoarRank(actorId, sourceKey, right)
      || compareText(left.sourceTileKey, right.sourceTileKey)
    ));
  const perchAnchor = activityAnchor("perch", 0, perchSite);
  const soarAnchors = Object.freeze(soarSites.map((site, anchorOrdinal) => (
    activityAnchor("soar", anchorOrdinal, site)
  )));
  const authorityData = {
    sourceKey,
    actorId,
    homeAnchor: copyPosition(homeAnchor),
    perchAnchor,
    soarAnchors,
  };
  const authority = deepFreeze({
    version: CORE_ECOLOGY_RIDGE_ACTIVITY_AUTHORITY_VERSION,
    ownerId: CORE_ECOLOGY_RIDGE_ACTIVITY_AUTHORITY_OWNER_ID,
    authorityId: `ridge-activity:${hashCanonical(authorityData)}`,
    ...authorityData,
  });
  AUTHENTIC_AUTHORITIES.add(authority);
  return authority;
}

/** Only an in-process derivation product may authorize ridge activity. */
export function isTrustedCoreEcologyRidgeActivityAuthority(
  value: unknown,
): value is CoreEcologyRidgeActivityAuthorityV1 {
  return typeof value === "object"
    && value !== null
    && AUTHENTIC_AUTHORITIES.has(value);
}

/**
 * Select one stable soar destination for an activity cadence. This consumes no
 * hidden prey position and never mutates the authority receipt.
 */
export function coreEcologyRidgeSoarAnchorAtCadence(
  authority: unknown,
  cadenceOrdinal: unknown,
): CoreEcologyRidgeActivityAnchor | null {
  if (
    !isTrustedCoreEcologyRidgeActivityAuthority(authority)
    || !nonnegativeSafeInteger(cadenceOrdinal)
    || authority.soarAnchors.length === 0
  ) return null;
  const phase = Number.parseInt(
    hashCanonical([authority.authorityId, "ridge-soar-phase-v1"]).slice(0, 8),
    16,
  ) % authority.soarAnchors.length;
  return authority.soarAnchors[
    (cadenceOrdinal + phase) % authority.soarAnchors.length
  ] ?? null;
}

function canonicalCandidate(
  value: unknown,
  homeAnchor: WorldPosition,
): CoreEcologyRidgeActivityCandidate | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "elevation",
      "position",
      "roughness",
      "sourceTileKey",
      "terrain",
    ])
    || !validId(value.sourceTileKey)
    || value.terrain !== "ridge"
    || !unitInteger(value.elevation)
    || !unitInteger(value.roughness)
    || !isWorldPosition(value.position)
    || value.position.region.x !== homeAnchor.region.x
    || value.position.region.y !== homeAnchor.region.y
  ) return null;
  return Object.freeze({
    sourceTileKey: value.sourceTileKey,
    position: copyPosition(value.position),
    terrain: value.terrain,
    elevation: value.elevation,
    roughness: value.roughness,
  });
}

function activityAnchor(
  purpose: CoreEcologyRidgeActivityAnchor["purpose"],
  anchorOrdinal: number,
  site: CoreEcologyRidgeActivityCandidate,
): CoreEcologyRidgeActivityAnchor {
  return Object.freeze({
    purpose,
    anchorOrdinal,
    sourceTileKey: site.sourceTileKey,
    position: copyPosition(site.position),
    elevation: site.elevation,
    roughness: site.roughness,
  });
}

function compareDistanceToHome(
  left: CoreEcologyRidgeActivityCandidate,
  right: CoreEcologyRidgeActivityCandidate,
  home: WorldPosition,
): number {
  const leftDistance = distanceSquared(home, left.position);
  const rightDistance = distanceSquared(home, right.position);
  return leftDistance < rightDistance ? -1 : leftDistance > rightDistance ? 1 : 0;
}

function distanceSquared(left: WorldPosition, right: WorldPosition): bigint {
  const x = (BigInt(right.region.x) - BigInt(left.region.x))
    * BigInt(REGION_WIDTH_UNITS) + BigInt(right.localX - left.localX);
  const y = (BigInt(right.region.y) - BigInt(left.region.y))
    * BigInt(REGION_HEIGHT_UNITS) + BigInt(right.localY - left.localY);
  return x * x + y * y;
}

function stableSoarRank(
  actorId: string,
  sourceKey: string,
  site: CoreEcologyRidgeActivityCandidate,
): number {
  return Number.parseInt(
    hashCanonical([actorId, sourceKey, site.sourceTileKey, "ridge-soar-rank-v1"])
      .slice(0, 8),
    16,
  );
}

function copyPosition(position: WorldPosition): WorldPosition {
  return createWorldPosition(position.region, position.localX, position.localY);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function unitInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value <= 1_000_000;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== "string")) return false;
  const keys = (actual as string[]).sort(compareText);
  const wanted = [...expected].sort(compareText);
  return keys.length === wanted.length
    && keys.every((key, index) => key === wanted[index]);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function plainDataArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  const actualKeys = Reflect.ownKeys(value);
  const expectedKeys = [
    ...Array.from({ length: value.length }, (_, index) => String(index)),
    "length",
  ];
  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
  ) return false;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      return false;
    }
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  return lengthDescriptor !== undefined
    && "value" in lengthDescriptor
    && !lengthDescriptor.enumerable;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

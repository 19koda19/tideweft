import type { ResidentState, WorldView } from "../sim/types";
import { globalTileToRegion, type GlobalTileCoord } from "../sim/regions";
import { ACTOR_ID_MAX_LENGTH } from "../sim/actorPerception";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import {
  LIVING_ACTOR_SPECIES,
  isLivingActorSpecies,
  livingSpeciesActorIdMatchesNamespace,
  type LivingActorSpecies,
} from "./livingSpeciesRegistry";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createSpatialFrame,
  createWorldPosition,
  isWorldPosition,
  worldPositionDelta,
  worldPositionToSpatialFrame,
  type SpatialFramePoint,
  type WorldPosition,
} from "./worldPosition";

/**
 * Versioned boundary shared by every physical living actor. Human economy
 * records remain intact while wildlife can use the same segmented address and
 * selection identity without pretending to be a numeric ResidentState.
 */
export const LIVING_ACTOR_ADDRESS_VERSION = 1 as const;
export const LIVING_ACTOR_ID_MAX_LENGTH = ACTOR_ID_MAX_LENGTH;

/**
 * Species with an implemented stable-identity owner. This is a physical actor
 * boundary, not a bestiary: each entry must use the same segmented address,
 * perception, locomotion, persistence, and inspection contracts.
 */
export { LIVING_ACTOR_SPECIES };
export type { LivingActorSpecies };

export type LivingActorPersistenceTier = "ephemeral" | "regional" | "promoted";

export interface LivingActorAddress {
  readonly version: typeof LIVING_ACTOR_ADDRESS_VERSION;
  /** Globally stable semantic identity; never an array index or render ID. */
  readonly actorId: string;
  readonly species: LivingActorSpecies;
  readonly position: WorldPosition;
  /** Fixed-point turn, clockwise in screen/world coordinates; 0 points east. */
  readonly heading: number;
  readonly persistence: LivingActorPersistenceTier;
}

export interface LivingActorFramePlacement {
  readonly actorId: string;
  readonly species: LivingActorSpecies;
  readonly point: SpatialFramePoint;
  readonly tileIndex: number;
  readonly heading: number;
}

export interface LivingActorAddressInput {
  readonly actorId: string;
  readonly species: LivingActorSpecies;
  readonly position: WorldPosition;
  readonly heading?: number;
  readonly persistence: LivingActorPersistenceTier;
}

const PERSISTENCE = new Set<string>(["ephemeral", "regional", "promoted"]);

/** Create one canonical, immutable address. */
export function createLivingActorAddress(input: LivingActorAddressInput): LivingActorAddress {
  if (!isLivingActorId(input.actorId)) {
    throw new TypeError("Living actor IDs must be bounded, trimmed, printable strings");
  }
  if (!isLivingActorSpecies(input.species)) {
    throw new TypeError(`Unsupported living actor species ${String(input.species)}`);
  }
  if (!livingSpeciesActorIdMatchesNamespace(input.actorId, input.species)) {
    throw new TypeError("Living actor ID namespace does not match its species");
  }
  if (!isWorldPosition(input.position)) {
    throw new TypeError("Living actor position must be a canonical segmented world position");
  }
  if (!PERSISTENCE.has(input.persistence)) {
    throw new TypeError(`Unsupported living actor persistence ${String(input.persistence)}`);
  }
  const heading = input.heading ?? 0;
  if (!isHeading(heading)) {
    throw new RangeError("Living actor heading must be an integer turn in [0, 1,000,000)");
  }
  return deepFreeze({
    version: LIVING_ACTOR_ADDRESS_VERSION,
    actorId: input.actorId,
    species: input.species,
    position: input.position,
    heading,
    persistence: input.persistence,
  });
}

/** Strict persisted-shape check: aliases and debug fields fail closed. */
export function isLivingActorAddress(value: unknown): value is LivingActorAddress {
  if (!plainRecord(value) || !exactKeys(value, [
    "actorId",
    "heading",
    "persistence",
    "position",
    "species",
    "version",
  ])) return false;
  return value.version === LIVING_ACTOR_ADDRESS_VERSION
    && isLivingActorId(value.actorId)
    && isLivingActorSpecies(value.species)
    && livingSpeciesActorIdMatchesNamespace(value.actorId, value.species)
    && isWorldPosition(value.position)
    && isHeading(value.heading)
    && PERSISTENCE.has(value.persistence as string);
}

/**
 * Existing compatibility humans cross the shared boundary through an adapter;
 * their authoritative economy identity and route/home location are not copied
 * into a second simulation record.
 */
export function livingActorAddressForResident(
  economy: WorldView,
  resident: ResidentState,
): LivingActorAddress | null {
  const authoritativeResident = economy.residents.find((candidate) =>
    candidate.id === resident.id
    && candidate.identity.stableId === resident.identity.stableId
  );
  if (
    resident.identity.species !== "human"
    || resident.perception.actorId !== resident.identity.stableId
    || authoritativeResident === undefined
    || !sameResidentLocation(authoritativeResident.location, resident.location)
  ) return null;
  const placement = resolveResidentWorldPlacement(economy, authoritativeResident);
  if (placement === null) return null;
  return createLivingActorAddress({
    actorId: resident.identity.stableId,
    species: "human",
    position: placement.position,
    heading: headingFromRadians(placement.facing),
    // The 42 compatibility humans are already permanently stored in WorldState.
    persistence: "promoted",
  });
}

/** Sort and validate an active set while rejecting cross-species ID aliases. */
export function canonicalLivingActorAddresses(
  values: readonly LivingActorAddress[],
  maximum = 512,
): readonly LivingActorAddress[] {
  if (!Array.isArray(values) || !Number.isSafeInteger(maximum) || maximum < 0 || values.length > maximum) {
    throw new RangeError("Living actor address set exceeds its bounded active budget");
  }
  const result = values.map((value) => {
    if (!isLivingActorAddress(value)) throw new TypeError("Invalid living actor address");
    return createLivingActorAddress(value);
  }).sort(compareLivingActorAddress);
  for (let index = 1; index < result.length; index += 1) {
    if (result[index - 1]?.actorId === result[index]?.actorId) {
      throw new RangeError(`Duplicate living actor identity ${result[index]?.actorId ?? "unknown"}`);
    }
  }
  return Object.freeze(result);
}

export function compareLivingActorAddress(
  left: Pick<LivingActorAddress, "actorId">,
  right: Pick<LivingActorAddress, "actorId">,
): number {
  return left.actorId < right.actorId ? -1 : left.actorId > right.actorId ? 1 : 0;
}

/** Project an authoritative address into the currently loaded bounded window. */
export function livingActorAddressInRegionalWindow(
  address: LivingActorAddress,
  window: Readonly<{
    origin: GlobalTileCoord;
    terrain: Readonly<{ width: number; height: number }>;
  }>,
): LivingActorFramePlacement | null {
  if (!isLivingActorAddress(address)) return null;
  if (
    !Number.isSafeInteger(window.origin.x)
    || !Number.isSafeInteger(window.origin.y)
    || !Number.isSafeInteger(window.terrain.width)
    || !Number.isSafeInteger(window.terrain.height)
    || window.terrain.width <= 0
    || window.terrain.height <= 0
  ) return null;
  let frame;
  try {
    const origin = globalTileToRegion(window.origin.x, window.origin.y);
    frame = createSpatialFrame(
      createWorldPosition(
        origin.region,
        origin.localX * WORLD_POSITION_UNITS_PER_TILE,
        origin.localY * WORLD_POSITION_UNITS_PER_TILE,
      ),
      window.terrain.width * WORLD_POSITION_UNITS_PER_TILE,
      window.terrain.height * WORLD_POSITION_UNITS_PER_TILE,
    );
  } catch {
    return null;
  }
  const point = worldPositionToSpatialFrame(frame, address.position);
  if (point === null) return null;
  const tileX = Math.floor(point.x / WORLD_POSITION_UNITS_PER_TILE);
  const tileY = Math.floor(point.y / WORLD_POSITION_UNITS_PER_TILE);
  return Object.freeze({
    actorId: address.actorId,
    species: address.species,
    point,
    tileIndex: tileY * window.terrain.width + tileX,
    heading: address.heading,
  });
}

/** Exact local displacement; distant points that cannot flatten return null. */
export function livingActorDisplacement(
  from: LivingActorAddress,
  to: LivingActorAddress,
): Readonly<{ x: number; y: number }> | null {
  if (!isLivingActorAddress(from) || !isLivingActorAddress(to)) return null;
  try {
    return worldPositionDelta(from.position, to.position);
  } catch {
    return null;
  }
}

export function headingFromRadians(radians: number): number {
  if (!Number.isFinite(radians)) throw new RangeError("Actor facing must be finite");
  const turns = radians / (Math.PI * 2);
  const normalized = turns - Math.floor(turns);
  const rounded = Math.round(normalized * 1_000_000) % 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function headingToRadians(heading: number): number {
  if (!isHeading(heading)) throw new RangeError("Actor heading is invalid");
  return heading / 1_000_000 * Math.PI * 2;
}

function isLivingActorId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= LIVING_ACTOR_ID_MAX_LENGTH
    && /^[A-Za-z0-9][A-Za-z0-9:._/-]*$/u.test(value);
}

function sameResidentLocation(
  left: ResidentState["location"],
  right: ResidentState["location"],
): boolean {
  if (left.kind !== right.kind) return false;
  return left.kind === "settlement"
    ? right.kind === "settlement" && left.settlementId === right.settlementId
    : right.kind === "route"
      && left.routeId === right.routeId
      && left.progress === right.progress;
}

function isHeading(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) >= 0
    && (value as number) < 1_000_000
    && !Object.is(value, -0);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

import { compareText, stableStringify } from "../sim/util";
import {
  canonicalizeDogActorState,
  type DogActorState,
} from "./dogActor";

/** Bounded persistence owner for dogs outside the original BIO0 scene. */
export const DOG_ACTOR_ROSTER_VERSION = 1 as const;
export const DOG_ACTOR_ROSTER_MAX_ACTORS = 8 as const;
export const DOG_ACTOR_ROSTER_MAX_SERIALIZED_BYTES = 4 * 1024 * 1024;

const UTF8_ENCODER = new TextEncoder();

export interface DogActorRosterState {
  readonly version: typeof DOG_ACTOR_ROSTER_VERSION;
  readonly actors: readonly DogActorState[];
}

/**
 * Creates the collection from existing authoritative dog bodies. It does not
 * generate an identity, infer ownership, or turn the original BIO0 dog into a
 * settlement animal.
 */
export function createDogActorRoster(
  actors: readonly DogActorState[] = Object.freeze([]),
): DogActorRosterState {
  const ordered = [...actors].sort((left, right) => compareText(
    left.identity.stableId,
    right.identity.stableId,
  ));
  const roster = canonicalizeDogActorRoster({
    version: DOG_ACTOR_ROSTER_VERSION,
    actors: ordered,
  });
  if (roster === null) throw new RangeError("Dog actor roster is malformed");
  return roster;
}

/** Strict order, identity, and size boundary for a future plural dog world. */
export function canonicalizeDogActorRoster(value: unknown): DogActorRosterState | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["actors", "version"])
    || value.version !== DOG_ACTOR_ROSTER_VERSION
    || !Array.isArray(value.actors)
    || value.actors.length > DOG_ACTOR_ROSTER_MAX_ACTORS
  ) return null;

  const actors: DogActorState[] = [];
  const actorIds = new Set<string>();
  for (const candidate of value.actors) {
    const actor = canonicalizeDogActorState(candidate);
    if (actor === null || actorIds.has(actor.identity.stableId)) return null;
    actorIds.add(actor.identity.stableId);
    actors.push(actor);
  }
  const ordered = [...actors].sort((left, right) => compareText(
    left.identity.stableId,
    right.identity.stableId,
  ));
  if (stableStringify(actors) !== stableStringify(ordered)) return null;
  return deepFreeze({
    version: DOG_ACTOR_ROSTER_VERSION,
    actors: ordered,
  });
}

/** Replace exactly one body without changing roster membership or order. */
export function replaceDogActorInRoster(
  value: unknown,
  actorValue: unknown,
): DogActorRosterState | null {
  const state = canonicalizeDogActorRoster(value);
  const actor = canonicalizeDogActorState(actorValue);
  if (state === null || actor === null) return null;
  const index = state.actors.findIndex(({ identity }) => (
    identity.stableId === actor.identity.stableId
  ));
  if (index < 0) return null;
  if (stableStringify(state.actors[index]) === stableStringify(actor)) return state;
  const actors = [...state.actors];
  actors[index] = actor;
  return canonicalizeDogActorRoster({
    version: DOG_ACTOR_ROSTER_VERSION,
    actors,
  });
}

export function dogActorRosterActor(
  value: unknown,
  actorId: unknown,
): DogActorState | null {
  const state = canonicalizeDogActorRoster(value);
  if (state === null || typeof actorId !== "string") return null;
  return state.actors.find(({ identity }) => identity.stableId === actorId) ?? null;
}

export function serializeDogActorRoster(value: unknown): string {
  const state = canonicalizeDogActorRoster(value);
  if (state === null) throw new RangeError("Dog actor roster is malformed");
  const encoded = stableStringify(state);
  if (UTF8_ENCODER.encode(encoded).byteLength > DOG_ACTOR_ROSTER_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Dog actor roster exceeds its serialized save budget");
  }
  return encoded;
}

export function deserializeDogActorRoster(value: unknown): DogActorRosterState | null {
  if (
    typeof value !== "string"
    || value.length === 0
    || UTF8_ENCODER.encode(value).byteLength > DOG_ACTOR_ROSTER_MAX_SERIALIZED_BYTES
  ) return null;
  try {
    const state = canonicalizeDogActorRoster(JSON.parse(value) as unknown);
    return state !== null && stableStringify(state) === value ? state : null;
  } catch {
    return null;
  }
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort(compareText);
  const canonical = [...expected].sort(compareText);
  return keys.length === canonical.length
    && keys.every((key, index) => key === canonical[index]);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.getOwnPropertySymbols(value).length === 0;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

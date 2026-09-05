import type { GlobalTileCoord } from "../sim/regions";
import {
  canonicalLivingActorAddresses,
  livingActorAddressInRegionalWindow,
  type LivingActorAddress,
} from "./livingActor";

export const LIVING_ACTOR_SIMULATION_POLICY_VERSION = 1 as const;
export const LIVING_ACTOR_ACTIVE_SET_LIMIT = 512 as const;
export const LIVING_ACTOR_INTERACTION_WINDOW_MAX_TILES = 256 as const;

export type LivingActorSimulationMode = "full" | "coarse";

/**
 * The authoritative bounded world window whose contents are available to a
 * high-fidelity actor step. Callers must supply every participant/source the
 * web could query; an actor omitted from this set cannot be perceived by this
 * policy.
 */
export interface LivingActorInteractionWindow {
  readonly origin: GlobalTileCoord;
  readonly terrain: Readonly<{
    readonly width: number;
    readonly height: number;
  }>;
}

export interface LivingActorSimulationPolicyInput {
  readonly participants: readonly LivingActorAddress[];
  /** Null means the interaction neighborhood is not loaded. */
  readonly loadedWindow: LivingActorInteractionWindow | null;
}

export interface LivingActorSimulationPolicy {
  readonly version: typeof LIVING_ACTOR_SIMULATION_POLICY_VERSION;
  readonly mode: LivingActorSimulationMode;
  readonly reason: "all-participants-loaded" | "participant-unloaded" | "window-unloaded";
  readonly participantIds: readonly string[];
  readonly loadedParticipantIds: readonly string[];
  readonly unloadedParticipantIds: readonly string[];
  /** New observations and direct physical interactions are forbidden offscreen. */
  readonly allowNewObservations: boolean;
  readonly allowPhysicalInteractions: boolean;
  /** Coarse steps may still age cognition and advance bounded physiology/time. */
  readonly allowPhysiologyAdvance: true;
  /** No coarse policy is allowed to move a physical actor at hidden coordinates. */
  readonly allowPhysicalMovement: boolean;
}

/**
 * Species-neutral active/coarse boundary. The result is wholly derived from
 * canonical segmented addresses and the current loaded window, so save/reload
 * cannot reroll it and negative or extreme region coordinates never need to be
 * flattened into an unsafe global Number.
 */
export function resolveLivingActorSimulationPolicy(
  input: LivingActorSimulationPolicyInput,
): LivingActorSimulationPolicy | null {
  const raw: unknown = input;
  if (!plainRecord(raw) || !exactKeys(raw, ["loadedWindow", "participants"])) return null;
  if (!Array.isArray(raw.participants) || raw.participants.length === 0) return null;

  let participants: readonly LivingActorAddress[];
  try {
    participants = canonicalLivingActorAddresses(
      raw.participants as readonly LivingActorAddress[],
      LIVING_ACTOR_ACTIVE_SET_LIMIT,
    );
  } catch {
    return null;
  }

  const participantIds = Object.freeze(participants.map(({ actorId }) => actorId));
  if (raw.loadedWindow === null) {
    return freezePolicy({
      mode: "coarse",
      reason: "window-unloaded",
      participantIds,
      loadedParticipantIds: [],
      unloadedParticipantIds: participantIds,
    });
  }
  const window = canonicalWindow(raw.loadedWindow);
  if (window === null) return null;

  const loadedParticipantIds: string[] = [];
  const unloadedParticipantIds: string[] = [];
  for (const participant of participants) {
    if (livingActorAddressInRegionalWindow(participant, window) === null) {
      unloadedParticipantIds.push(participant.actorId);
    } else {
      loadedParticipantIds.push(participant.actorId);
    }
  }
  const mode = unloadedParticipantIds.length === 0 ? "full" : "coarse";
  return freezePolicy({
    mode,
    reason: mode === "full" ? "all-participants-loaded" : "participant-unloaded",
    participantIds,
    loadedParticipantIds,
    unloadedParticipantIds,
  });
}

function freezePolicy(input: Readonly<{
  mode: LivingActorSimulationMode;
  reason: LivingActorSimulationPolicy["reason"];
  participantIds: readonly string[];
  loadedParticipantIds: readonly string[];
  unloadedParticipantIds: readonly string[];
}>): LivingActorSimulationPolicy {
  const active = input.mode === "full";
  return Object.freeze({
    version: LIVING_ACTOR_SIMULATION_POLICY_VERSION,
    mode: input.mode,
    reason: input.reason,
    participantIds: Object.freeze([...input.participantIds]),
    loadedParticipantIds: Object.freeze([...input.loadedParticipantIds]),
    unloadedParticipantIds: Object.freeze([...input.unloadedParticipantIds]),
    allowNewObservations: active,
    allowPhysicalInteractions: active,
    allowPhysiologyAdvance: true,
    allowPhysicalMovement: active,
  });
}

function canonicalWindow(value: unknown): LivingActorInteractionWindow | null {
  if (!plainRecord(value) || !exactKeys(value, ["origin", "terrain"])) return null;
  if (
    !plainRecord(value.origin)
    || !exactKeys(value.origin, ["x", "y"])
    || !Number.isSafeInteger(value.origin.x)
    || !Number.isSafeInteger(value.origin.y)
    || !plainRecord(value.terrain)
    || !exactKeys(value.terrain, ["height", "width"])
    || !positiveSafeInteger(value.terrain.width)
    || !positiveSafeInteger(value.terrain.height)
    || value.terrain.width > LIVING_ACTOR_INTERACTION_WINDOW_MAX_TILES
    || value.terrain.height > LIVING_ACTOR_INTERACTION_WINDOW_MAX_TILES
  ) return null;
  return Object.freeze({
    origin: Object.freeze({ x: value.origin.x as number, y: value.origin.y as number }),
    terrain: Object.freeze({
      width: value.terrain.width as number,
      height: value.terrain.height as number,
    }),
  });
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && !Object.is(value, -0);
}

function exactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  let ownKeys: readonly PropertyKey[];
  try {
    ownKeys = Reflect.ownKeys(value);
  } catch {
    return false;
  }
  if (ownKeys.some((key) => typeof key !== "string")) return false;
  const actual = [...ownKeys as readonly string[]].sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
    && actual.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
    });
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

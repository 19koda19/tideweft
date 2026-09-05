import {
  canonicalLivingActorAddresses,
  livingActorAddressInRegionalWindow,
  type LivingActorAddress,
} from "../game/livingActor";
import {
  LIVING_ACTOR_PLAYER_CHOICE_MAX_DISTANCE_UNITS,
  type LivingActorPlayerChoiceObservation,
} from "../game/livingActorPlayerChoice";
import {
  VISIBILITY_DIRECT,
  hasValidPerceptionSignature,
} from "../game/perception";
import { WORLD_POSITION_UNITS_PER_TILE } from "../game/worldPosition";
import type {
  LivingActorInteractionUIView,
  LivingActorTargetUIView,
} from "./types";
import {
  isLivingActorSpecies,
  livingSpeciesActorIdMatchesNamespace,
} from "../game/livingSpeciesRegistry";

/**
 * Presentation-only inputs for one living-actor choice surface. The request
 * recipient is an actor the player may address, not an actor that has agreed
 * to help. Cargo is deliberately absent from this contract.
 */
export interface LivingActorInteractionProjectionInput {
  readonly target: LivingActorTargetUIView;
  readonly requestRecipientActorId: string | null;
  readonly actors: readonly LivingActorAddress[];
  readonly observation: LivingActorPlayerChoiceObservation;
}

const APPROACH_HINT = "Move closer while keeping them in clear view.";

/**
 * Derive a compact, cargo-blind choice surface from current direct detail
 * perception. The returned choices are proposals only. A runtime must still
 * revalidate the current sensory snapshot, physical custody, actor decision,
 * and world transaction when the player selects one.
 *
 * Invalid or no-longer-visible targets fail closed as null. A recipient that
 * exists but is not directly observable contributes no UI, preventing this
 * projection from revealing an offscreen actor.
 */
export function projectLivingActorInteractionChoices(
  inputValue: unknown,
): readonly LivingActorInteractionUIView[] | null {
  const input = canonicalInput(inputValue);
  if (input === null) return null;

  const focus = directlyObservedActor(
    input.actors,
    input.target.actorId,
    input.observation,
  );
  if (focus === null || focus.actor.species !== input.target.species) return null;

  const focusInRange = focus.distanceUnits <= LIVING_ACTOR_PLAYER_CHOICE_MAX_DISTANCE_UNITS;
  const recipient = input.requestRecipientActorId === null
    ? null
    : directlyObservedActor(
        input.actors,
        input.requestRecipientActorId,
        input.observation,
      );
  const recipientInRange = recipient !== null
    && recipient.distanceUnits <= LIVING_ACTOR_PLAYER_CHOICE_MAX_DISTANCE_UNITS;
  const requestInRange = focusInRange && recipientInRange;

  const choices: LivingActorInteractionUIView[] = [];
  if (recipient !== null) {
    choices.push(
      choice(
        "help",
        "ASK FOR HELP",
        !requestInRange,
        requestInRange
          ? "A request only; the other actor decides whether to respond."
          : APPROACH_HINT,
      ),
      choice(
        "secure-food",
        "SUGGEST SECURING BELONGINGS",
        !requestInRange,
        requestInRange
          ? "The other actor decides whether anything needs securing."
          : APPROACH_HINT,
      ),
    );
  }
  choices.push(
    choice(
      "wait",
      "WAIT AND WATCH",
      !focusInRange,
      focusInRange ? "Stay nearby and see what happens." : APPROACH_HINT,
    ),
    choice(
      "reroute",
      "ROUTE AROUND THIS SPOT",
      !focusInRange,
      focusInRange
        ? "Uses only the actor's current observed position."
        : APPROACH_HINT,
    ),
    choice("leave", "LEAVE", false),
  );
  return Object.freeze(choices);
}

interface CanonicalProjectionInput {
  readonly target: LivingActorTargetUIView;
  readonly requestRecipientActorId: string | null;
  readonly actors: readonly LivingActorAddress[];
  readonly observation: LivingActorPlayerChoiceObservation;
}

interface DirectlyObservedActor {
  readonly actor: LivingActorAddress;
  readonly distanceUnits: number;
}

function canonicalInput(value: unknown): CanonicalProjectionInput | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "actors",
    "observation",
    "requestRecipientActorId",
    "target",
  ])) return null;
  if (!validTarget(value.target) || !validNullableActorId(value.requestRecipientActorId)) {
    return null;
  }
  if (
    value.requestRecipientActorId !== null
    && value.requestRecipientActorId === value.target.actorId
  ) return null;
  const target = value.target;
  const requestRecipientActorId = value.requestRecipientActorId;
  if (!Array.isArray(value.actors)) return null;

  let actors: readonly LivingActorAddress[];
  try {
    actors = canonicalLivingActorAddresses(value.actors as readonly LivingActorAddress[]);
  } catch {
    return null;
  }
  if (!actors.some(({ actorId }) => actorId === target.actorId)) return null;
  if (
    requestRecipientActorId !== null
    && !actors.some(({ actorId }) => actorId === requestRecipientActorId)
  ) return null;
  const observation = canonicalObservation(value.observation);
  if (observation === null) return null;
  return Object.freeze({
    target: Object.freeze({ ...target }),
    requestRecipientActorId,
    actors,
    observation,
  });
}

function canonicalObservation(value: unknown): LivingActorPlayerChoiceObservation | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["perception", "window"])
    || !plainRecord(value.window)
    || !exactKeys(value.window, ["origin", "terrain"])
    || !plainRecord(value.window.origin)
    || !exactKeys(value.window.origin, ["x", "y"])
    || !safeInteger(value.window.origin.x)
    || !safeInteger(value.window.origin.y)
    || !plainRecord(value.window.terrain)
    || !exactKeys(value.window.terrain, ["height", "width"])
    || !positiveSafeInteger(value.window.terrain.width)
    || !positiveSafeInteger(value.window.terrain.height)
    || !plainRecord(value.perception)
  ) return null;
  const observation = value as unknown as LivingActorPlayerChoiceObservation;
  const count = observation.window.terrain.width * observation.window.terrain.height;
  if (
    !Number.isSafeInteger(count)
    || observation.perception.valid !== true
    || !hasValidPerceptionSignature(
      observation.perception,
      observation.window.terrain.width,
      observation.window.terrain.height,
    )
    || !nonnegativeSafeInteger(observation.perception.playerTileIndex)
    || observation.perception.playerTileIndex >= count
  ) return null;
  return Object.freeze({
    window: Object.freeze({
      origin: Object.freeze({ ...observation.window.origin }),
      terrain: Object.freeze({ ...observation.window.terrain }),
    }),
    perception: observation.perception,
  });
}

function directlyObservedActor(
  actors: readonly LivingActorAddress[],
  actorId: string,
  observation: LivingActorPlayerChoiceObservation,
): DirectlyObservedActor | null {
  const actor = actors.find((candidate) => candidate.actorId === actorId);
  if (actor === undefined) return null;
  const placement = livingActorAddressInRegionalWindow(actor, observation.window);
  if (
    placement === null
    || observation.perception.detailVisibilityGrades[placement.tileIndex] !== VISIBILITY_DIRECT
  ) return null;
  const { width } = observation.window.terrain;
  const playerTile = observation.perception.playerTileIndex;
  const playerX = (playerTile % width) * WORLD_POSITION_UNITS_PER_TILE
    + WORLD_POSITION_UNITS_PER_TILE / 2;
  const playerY = Math.floor(playerTile / width) * WORLD_POSITION_UNITS_PER_TILE
    + WORLD_POSITION_UNITS_PER_TILE / 2;
  const distanceUnits = Math.round(Math.hypot(
    placement.point.x - playerX,
    placement.point.y - playerY,
  ));
  return nonnegativeSafeInteger(distanceUnits)
    ? Object.freeze({ actor, distanceUnits })
    : null;
}

function choice(
  id: LivingActorInteractionUIView["id"],
  label: string,
  disabled: boolean,
  hint?: string,
): LivingActorInteractionUIView {
  return Object.freeze({
    id,
    label,
    ...(disabled ? { disabled: true } : {}),
    ...(hint === undefined ? {} : { hint }),
  });
}

function validTarget(value: unknown): value is LivingActorTargetUIView {
  return plainRecord(value)
    && exactKeys(value, ["actorId", "species"])
    && validActorId(value.actorId)
    && isLivingActorSpecies(value.species)
    && livingSpeciesActorIdMatchesNamespace(value.actorId, value.species);
}

function validNullableActorId(value: unknown): value is string | null {
  return value === null || validActorId(value);
}

function validActorId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 192
    && /^[A-Za-z0-9][A-Za-z0-9:._/-]*$/u.test(value);
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
}

function safeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && !Object.is(value, -0);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

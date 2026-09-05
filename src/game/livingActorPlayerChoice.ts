import { ACTOR_ID_MAX_LENGTH, type ObservedArea } from "../sim/actorPerception";
import { hashCanonical } from "../sim/util";
import {
  validateActorCargoState,
  type ActorCargoContainer,
  type ActorCargoState,
} from "./actorCargo";
import {
  canonicalLivingActorAddresses,
  livingActorAddressInRegionalWindow,
  type LivingActorAddress,
} from "./livingActor";
import {
  VISIBILITY_DIRECT,
  hasValidPerceptionSignature,
  type PerceptionResult,
} from "./perception";
import { WORLD_POSITION_UNITS_PER_TILE, isWorldPosition } from "./worldPosition";

export const LIVING_ACTOR_PLAYER_CHOICE_VERSION = 1 as const;
export const LIVING_ACTOR_PLAYER_CHOICE_MAX_RETAINED_EVENTS = 64 as const;
export const LIVING_ACTOR_PLAYER_CHOICE_MAX_DISTANCE_UNITS = 12_000 as const;
export const LIVING_ACTOR_PLAYER_CHOICE_MAX_WAIT_TICKS = 60 as const;

const INITIAL_ARCHIVE_HASH = "0000000000000000";
const HASH_PATTERN = /^[0-9a-f]{16}$/u;
const ACTOR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]*$/u;
const MAX_CONTAINER_ID_LENGTH = 160;

export type LivingActorPlayerChoiceKind =
  | "ask-offer-provision"
  | "ask-secure-provisions"
  | "wait-observe"
  | "reroute"
  | "leave";

interface LivingActorPlayerChoiceActionBase {
  readonly version: typeof LIVING_ACTOR_PLAYER_CHOICE_VERSION;
  readonly id: string;
  readonly ordinal: number;
  readonly playerId: string;
  readonly issuedAtTick: number;
  readonly kind: LivingActorPlayerChoiceKind;
}

export interface AskOfferProvisionChoice extends LivingActorPlayerChoiceActionBase {
  readonly kind: "ask-offer-provision";
  readonly custodianActorId: string;
  readonly beneficiaryActorId: string;
  readonly containerId: string;
}

export interface AskSecureProvisionsChoice extends LivingActorPlayerChoiceActionBase {
  readonly kind: "ask-secure-provisions";
  readonly custodianActorId: string;
  readonly containerId: string;
}

export interface WaitObserveChoice extends LivingActorPlayerChoiceActionBase {
  readonly kind: "wait-observe";
  readonly focusActorId: string | null;
  readonly durationTicks: number;
}

export interface RerouteChoice extends LivingActorPlayerChoiceActionBase {
  readonly kind: "reroute";
  readonly focusActorId: string;
}

export interface LeaveChoice extends LivingActorPlayerChoiceActionBase {
  readonly kind: "leave";
  readonly focusActorId: string | null;
}

export type LivingActorPlayerChoiceAction =
  | AskOfferProvisionChoice
  | AskSecureProvisionsChoice
  | WaitObserveChoice
  | RerouteChoice
  | LeaveChoice;

export type LivingActorPlayerChoiceSpec =
  | Omit<AskOfferProvisionChoice, "version" | "id" | "ordinal" | "playerId">
  | Omit<AskSecureProvisionsChoice, "version" | "id" | "ordinal" | "playerId">
  | Omit<WaitObserveChoice, "version" | "id" | "ordinal" | "playerId">
  | Omit<RerouteChoice, "version" | "id" | "ordinal" | "playerId">
  | Omit<LeaveChoice, "version" | "id" | "ordinal" | "playerId">;

export interface RequestProvisionOfferEffect {
  readonly kind: "request-provision-offer";
  /** Idempotent request identity; it is not proof that the custodian agreed. */
  readonly requestId: string;
  readonly custodianActorId: string;
  readonly beneficiaryActorId: string;
  readonly containerId: string;
}

export interface RequestSecureProvisionsEffect {
  readonly kind: "request-secure-provisions";
  /** The custodian still owns the closure decision. */
  readonly requestId: string;
  readonly custodianActorId: string;
  readonly containerId: string;
}

export interface WaitObserveEffect {
  readonly kind: "wait-observe";
  readonly focusActorId: string | null;
  readonly untilTick: number;
}

export interface RerouteEffect {
  readonly kind: "request-reroute";
  readonly focusActorId: string;
  /** Current directly observed area to avoid, not a predicted actor route. */
  readonly avoidArea: ObservedArea;
}

export interface LeaveEffect {
  readonly kind: "leave-interaction";
  readonly focusActorId: string | null;
}

export type LivingActorPlayerChoiceEffect =
  | RequestProvisionOfferEffect
  | RequestSecureProvisionsEffect
  | WaitObserveEffect
  | RerouteEffect
  | LeaveEffect;

export interface LivingActorPlayerChoiceEvent {
  readonly id: string;
  readonly ordinal: number;
  readonly actionId: string;
  readonly actionHash: string;
  readonly tick: number;
  readonly kind: LivingActorPlayerChoiceKind;
  readonly effect: LivingActorPlayerChoiceEffect;
}

export interface LivingActorPlayerChoiceState {
  readonly version: typeof LIVING_ACTOR_PLAYER_CHOICE_VERSION;
  readonly playerId: string;
  readonly revision: number;
  readonly historyBaseOrdinal: number;
  readonly historyArchiveHash: string;
  readonly events: readonly LivingActorPlayerChoiceEvent[];
}

export interface LivingActorPlayerChoiceObservation {
  readonly window: Readonly<{
    readonly origin: Readonly<{ x: number; y: number }>;
    readonly terrain: Readonly<{ width: number; height: number }>;
  }>;
  readonly perception: PerceptionResult;
}

export interface LivingActorPlayerChoiceContext {
  readonly actors: readonly LivingActorAddress[];
  readonly cargo: ActorCargoState;
  readonly observation: LivingActorPlayerChoiceObservation;
}

export type LivingActorPlayerChoiceReason =
  | "applied"
  | "already-applied"
  | "already-satisfied"
  | "invalid-state"
  | "invalid-action"
  | "invalid-context"
  | "out-of-order"
  | "identity-conflict"
  | "not-observed"
  | "not-plausible"
  | "ordinal-space-exhausted";

export interface LivingActorPlayerChoiceResult {
  readonly ok: boolean;
  readonly reason: LivingActorPlayerChoiceReason;
  readonly state: LivingActorPlayerChoiceState;
  readonly event: LivingActorPlayerChoiceEvent | null;
  /** Null on replay so an integration cannot execute the request twice. */
  readonly effect: LivingActorPlayerChoiceEffect | null;
}

interface CanonicalChoiceContext {
  readonly actors: readonly LivingActorAddress[];
  readonly cargo: ActorCargoState;
  readonly observation: LivingActorPlayerChoiceObservation;
}

export function createLivingActorPlayerChoiceState(
  playerId: string,
): LivingActorPlayerChoiceState {
  if (!validActorId(playerId)) throw new TypeError("Player identity is invalid");
  return deepFreeze({
    version: LIVING_ACTOR_PLAYER_CHOICE_VERSION,
    playerId,
    revision: 0,
    historyBaseOrdinal: 0,
    historyArchiveHash: INITIAL_ARCHIVE_HASH,
    events: [],
  });
}

export function canonicalizeLivingActorPlayerChoiceState(
  value: unknown,
): LivingActorPlayerChoiceState | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "events",
    "historyArchiveHash",
    "historyBaseOrdinal",
    "playerId",
    "revision",
    "version",
  ])) return null;
  if (
    value.version !== LIVING_ACTOR_PLAYER_CHOICE_VERSION
    || !validActorId(value.playerId)
    || !nonnegativeSafeInteger(value.revision)
    || !nonnegativeSafeInteger(value.historyBaseOrdinal)
    || value.historyBaseOrdinal > value.revision
    || typeof value.historyArchiveHash !== "string"
    || !HASH_PATTERN.test(value.historyArchiveHash)
    || !Array.isArray(value.events)
    || value.events.length > LIVING_ACTOR_PLAYER_CHOICE_MAX_RETAINED_EVENTS
    || value.historyBaseOrdinal + value.events.length !== value.revision
  ) return null;

  const events: LivingActorPlayerChoiceEvent[] = [];
  let priorTick = -1;
  for (let index = 0; index < value.events.length; index += 1) {
    const event = canonicalEvent(value.events[index]);
    if (
      event === null
      || event.ordinal !== value.historyBaseOrdinal + index + 1
      || event.tick < priorTick
    ) return null;
    priorTick = event.tick;
    events.push(event);
  }
  return deepFreeze({
    version: LIVING_ACTOR_PLAYER_CHOICE_VERSION,
    playerId: value.playerId,
    revision: value.revision,
    historyBaseOrdinal: value.historyBaseOrdinal,
    historyArchiveHash: value.historyArchiveHash,
    events,
  });
}

/** Creates the only canonical next action, including its replay identity. */
export function createLivingActorPlayerChoiceAction(
  stateValue: unknown,
  specValue: unknown,
): LivingActorPlayerChoiceAction {
  const state = canonicalizeLivingActorPlayerChoiceState(stateValue);
  const spec = canonicalSpec(specValue);
  if (state === null || spec === null) {
    throw new TypeError("Player choice state or specification is invalid");
  }
  if (state.revision >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Player choice ordinal space is exhausted");
  }
  const ordinal = state.revision + 1;
  const base = {
    version: LIVING_ACTOR_PLAYER_CHOICE_VERSION,
    ordinal,
    playerId: state.playerId,
    ...spec,
  } as Omit<LivingActorPlayerChoiceAction, "id">;
  return deepFreeze({
    ...base,
    id: choiceActionId(base),
  }) as LivingActorPlayerChoiceAction;
}

/**
 * Reduces one player decision into a bounded causal event. Communication
 * effects remain requests; only the addressed actor's later decision may
 * authorize a physical handoff or closure mutation.
 */
export function reduceLivingActorPlayerChoice(
  stateValue: LivingActorPlayerChoiceState,
  actionValue: unknown,
  contextValue: unknown,
): LivingActorPlayerChoiceResult {
  const state = canonicalizeLivingActorPlayerChoiceState(stateValue);
  if (state === null) return failed("invalid-state", stateValue);
  const action = canonicalAction(actionValue);
  if (action === null || action.playerId !== state.playerId) {
    return failed("invalid-action", state);
  }

  const actionHash = hashAction(action);
  const retained = state.events.find(({ ordinal }) => ordinal === action.ordinal);
  if (retained !== undefined) {
    if (retained.actionId !== action.id || retained.actionHash !== actionHash) {
      return failed("identity-conflict", state);
    }
    return deepFreeze({
      ok: true,
      reason: "already-applied",
      state,
      event: retained,
      effect: null,
    });
  }
  if (action.ordinal <= state.historyBaseOrdinal) {
    return deepFreeze({
      ok: true,
      reason: "already-applied",
      state,
      event: null,
      effect: null,
    });
  }
  if (action.ordinal !== state.revision + 1) {
    return failed(action.ordinal <= state.revision ? "identity-conflict" : "out-of-order", state);
  }
  if (state.revision >= Number.MAX_SAFE_INTEGER) {
    return failed("ordinal-space-exhausted", state);
  }
  const lastTick = state.events.at(-1)?.tick;
  if (lastTick !== undefined && action.issuedAtTick < lastTick) {
    return failed("invalid-action", state);
  }

  const context = canonicalContext(contextValue);
  if (context === null) return failed("invalid-context", state);
  const resolved = resolveEffect(action, context);
  if (resolved.effect === null) {
    return failed(resolved.reason as Exclude<typeof resolved.reason, "applied">, state);
  }

  const event = freezeEvent({
    id: "",
    ordinal: action.ordinal,
    actionId: action.id,
    actionHash,
    tick: action.issuedAtTick,
    kind: action.kind,
    effect: resolved.effect,
  });
  const identifiedEvent = freezeEvent({
    ...event,
    id: choiceEventId(event),
  });
  const appended = [...state.events, identifiedEvent];
  let historyBaseOrdinal = state.historyBaseOrdinal;
  let historyArchiveHash = state.historyArchiveHash;
  while (appended.length > LIVING_ACTOR_PLAYER_CHOICE_MAX_RETAINED_EVENTS) {
    const archived = appended.shift();
    if (archived === undefined) return failed("invalid-state", state);
    historyArchiveHash = hashCanonical({ previous: historyArchiveHash, event: archived });
    historyBaseOrdinal = archived.ordinal;
  }
  const nextState = deepFreeze({
    version: LIVING_ACTOR_PLAYER_CHOICE_VERSION,
    playerId: state.playerId,
    revision: action.ordinal,
    historyBaseOrdinal,
    historyArchiveHash,
    events: appended,
  });
  if (canonicalizeLivingActorPlayerChoiceState(nextState) === null) {
    return failed("invalid-state", state);
  }
  return deepFreeze({
    ok: true,
    reason: "applied",
    state: nextState,
    event: identifiedEvent,
    effect: identifiedEvent.effect,
  });
}

function resolveEffect(
  action: LivingActorPlayerChoiceAction,
  context: CanonicalChoiceContext,
): Readonly<{
  reason: "applied" | "already-satisfied" | "not-observed" | "not-plausible";
  effect: LivingActorPlayerChoiceEffect | null;
}> {
  switch (action.kind) {
    case "ask-offer-provision": {
      if (
        action.custodianActorId === action.beneficiaryActorId
        || !observedActor(context, action.custodianActorId)
        || !observedActor(context, action.beneficiaryActorId)
      ) return noEffect("not-observed");
      const container = ownedContainer(context.cargo, action.containerId, action.custodianActorId);
      if (container === null || !containsProvision(container)) return noEffect("not-plausible");
      return effect({
        kind: "request-provision-offer",
        requestId: action.id,
        custodianActorId: action.custodianActorId,
        beneficiaryActorId: action.beneficiaryActorId,
        containerId: action.containerId,
      });
    }
    case "ask-secure-provisions": {
      if (!observedActor(context, action.custodianActorId)) return noEffect("not-observed");
      const container = ownedContainer(context.cargo, action.containerId, action.custodianActorId);
      if (container === null || !containsProvision(container)) return noEffect("not-plausible");
      if (container.closure === "secured") return noEffect("already-satisfied");
      return effect({
        kind: "request-secure-provisions",
        requestId: action.id,
        custodianActorId: action.custodianActorId,
        containerId: action.containerId,
      });
    }
    case "wait-observe": {
      if (action.focusActorId !== null && !observedActor(context, action.focusActorId)) {
        return noEffect("not-observed");
      }
      return effect({
        kind: "wait-observe",
        focusActorId: action.focusActorId,
        untilTick: action.issuedAtTick + action.durationTicks,
      });
    }
    case "reroute": {
      const focus = observedActor(context, action.focusActorId);
      if (focus === null) return noEffect("not-observed");
      return effect({
        kind: "request-reroute",
        focusActorId: focus.actorId,
        avoidArea: deepFreeze({
          center: focus.position,
          radiusUnits: WORLD_POSITION_UNITS_PER_TILE,
        }),
      });
    }
    case "leave": {
      if (action.focusActorId !== null && !observedActor(context, action.focusActorId)) {
        return noEffect("not-observed");
      }
      return effect({ kind: "leave-interaction", focusActorId: action.focusActorId });
    }
  }
}

function canonicalContext(value: unknown): CanonicalChoiceContext | null {
  if (!plainRecord(value) || !exactKeys(value, ["actors", "cargo", "observation"])) return null;
  if (!Array.isArray(value.actors)) return null;
  let actors: readonly LivingActorAddress[];
  try {
    actors = canonicalLivingActorAddresses(value.actors as readonly LivingActorAddress[]);
  } catch {
    return null;
  }
  const cargo = validateActorCargoState(value.cargo);
  const observation = canonicalObservation(value.observation);
  if (!cargo.valid || cargo.state === null || observation === null) return null;
  return Object.freeze({ actors, cargo: cargo.state, observation });
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
  const window = value.window as unknown as LivingActorPlayerChoiceObservation["window"];
  const perception = value.perception as unknown as PerceptionResult;
  const count = window.terrain.width * window.terrain.height;
  if (
    !Number.isSafeInteger(count)
    || perception.valid !== true
    || !hasValidPerceptionSignature(perception, window.terrain.width, window.terrain.height)
    || !nonnegativeSafeInteger(perception.playerTileIndex)
    || perception.playerTileIndex >= count
  ) return null;
  return Object.freeze({ window, perception });
}

function observedActor(
  context: CanonicalChoiceContext,
  actorId: string,
): LivingActorAddress | null {
  const actor = context.actors.find((candidate) => candidate.actorId === actorId);
  if (actor === undefined) return null;
  const placement = livingActorAddressInRegionalWindow(actor, context.observation.window);
  if (
    placement === null
    || context.observation.perception.detailVisibilityGrades[placement.tileIndex] !== VISIBILITY_DIRECT
  ) return null;
  const { width } = context.observation.window.terrain;
  const playerTile = context.observation.perception.playerTileIndex;
  const playerX = (playerTile % width) * WORLD_POSITION_UNITS_PER_TILE
    + WORLD_POSITION_UNITS_PER_TILE / 2;
  const playerY = Math.floor(playerTile / width) * WORLD_POSITION_UNITS_PER_TILE
    + WORLD_POSITION_UNITS_PER_TILE / 2;
  const distance = Math.round(Math.hypot(
    placement.point.x - playerX,
    placement.point.y - playerY,
  ));
  return nonnegativeSafeInteger(distance)
    && distance <= LIVING_ACTOR_PLAYER_CHOICE_MAX_DISTANCE_UNITS
    ? actor
    : null;
}

function ownedContainer(
  cargo: ActorCargoState,
  containerId: string,
  custodianActorId: string,
): ActorCargoContainer | null {
  return cargo.containers.find((candidate) =>
    candidate.id === containerId && candidate.custodianActorId === custodianActorId
  ) ?? null;
}

function containsProvision(container: ActorCargoContainer): boolean {
  return container.carrier.lots.some(({ payload }) =>
    payload.kind === "provision" && payload.quantity > 0
  );
}

function canonicalSpec(value: unknown): LivingActorPlayerChoiceSpec | null {
  if (!plainRecord(value) || !validChoiceKind(value.kind)) return null;
  if (!nonnegativeSafeInteger(value.issuedAtTick)) return null;
  switch (value.kind) {
    case "ask-offer-provision":
      return exactKeys(value, [
        "beneficiaryActorId",
        "containerId",
        "custodianActorId",
        "issuedAtTick",
        "kind",
      ])
        && validActorId(value.custodianActorId)
        && validActorId(value.beneficiaryActorId)
        && value.custodianActorId !== value.beneficiaryActorId
        && validContainerId(value.containerId)
        ? deepFreeze({
          kind: value.kind,
          issuedAtTick: value.issuedAtTick,
          custodianActorId: value.custodianActorId,
          beneficiaryActorId: value.beneficiaryActorId,
          containerId: value.containerId,
        })
        : null;
    case "ask-secure-provisions":
      return exactKeys(value, ["containerId", "custodianActorId", "issuedAtTick", "kind"])
        && validActorId(value.custodianActorId)
        && validContainerId(value.containerId)
        ? deepFreeze({
          kind: value.kind,
          issuedAtTick: value.issuedAtTick,
          custodianActorId: value.custodianActorId,
          containerId: value.containerId,
        })
        : null;
    case "wait-observe":
      return exactKeys(value, ["durationTicks", "focusActorId", "issuedAtTick", "kind"])
        && validNullableActorId(value.focusActorId)
        && positiveSafeInteger(value.durationTicks)
        && value.durationTicks <= LIVING_ACTOR_PLAYER_CHOICE_MAX_WAIT_TICKS
        && value.issuedAtTick <= Number.MAX_SAFE_INTEGER - value.durationTicks
        ? deepFreeze({
          kind: value.kind,
          issuedAtTick: value.issuedAtTick,
          focusActorId: value.focusActorId,
          durationTicks: value.durationTicks,
        })
        : null;
    case "reroute":
      return exactKeys(value, ["focusActorId", "issuedAtTick", "kind"])
        && validActorId(value.focusActorId)
        ? deepFreeze({
          kind: value.kind,
          issuedAtTick: value.issuedAtTick,
          focusActorId: value.focusActorId,
        })
        : null;
    case "leave":
      return exactKeys(value, ["focusActorId", "issuedAtTick", "kind"])
        && validNullableActorId(value.focusActorId)
        ? deepFreeze({
          kind: value.kind,
          issuedAtTick: value.issuedAtTick,
          focusActorId: value.focusActorId,
        })
        : null;
  }
}

function canonicalAction(value: unknown): LivingActorPlayerChoiceAction | null {
  if (!plainRecord(value) || !validChoiceKind(value.kind)) return null;
  const common = ["id", "issuedAtTick", "kind", "ordinal", "playerId", "version"];
  const specific = value.kind === "ask-offer-provision"
    ? ["beneficiaryActorId", "containerId", "custodianActorId"]
    : value.kind === "ask-secure-provisions"
      ? ["containerId", "custodianActorId"]
      : value.kind === "wait-observe"
        ? ["durationTicks", "focusActorId"]
        : ["focusActorId"];
  if (
    !exactKeys(value, [...common, ...specific])
    || value.version !== LIVING_ACTOR_PLAYER_CHOICE_VERSION
    || !validActorId(value.playerId)
    || !positiveSafeInteger(value.ordinal)
    || !validId(value.id)
  ) return null;
  const specInput = { ...value };
  delete specInput.id;
  delete specInput.ordinal;
  delete specInput.playerId;
  delete specInput.version;
  const spec = canonicalSpec(specInput);
  if (spec === null) return null;
  const base = {
    version: LIVING_ACTOR_PLAYER_CHOICE_VERSION,
    ordinal: value.ordinal,
    playerId: value.playerId,
    ...spec,
  } as Omit<LivingActorPlayerChoiceAction, "id">;
  if (value.id !== choiceActionId(base)) return null;
  return deepFreeze({ ...base, id: value.id }) as LivingActorPlayerChoiceAction;
}

function canonicalEvent(value: unknown): LivingActorPlayerChoiceEvent | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "actionHash",
    "actionId",
    "effect",
    "id",
    "kind",
    "ordinal",
    "tick",
  ])) return null;
  if (
    !validId(value.id)
    || !positiveSafeInteger(value.ordinal)
    || !validId(value.actionId)
    || typeof value.actionHash !== "string"
    || !HASH_PATTERN.test(value.actionHash)
    || !nonnegativeSafeInteger(value.tick)
    || !validChoiceKind(value.kind)
  ) return null;
  const event = freezeEvent({
    id: value.id,
    ordinal: value.ordinal,
    actionId: value.actionId,
    actionHash: value.actionHash,
    tick: value.tick,
    kind: value.kind,
    effect: value.effect as LivingActorPlayerChoiceEffect,
  });
  if (!effectMatchesChoice(event.effect, event.kind) || event.id !== choiceEventId(event)) {
    return null;
  }
  return event;
}

function effectMatchesChoice(
  effectValue: unknown,
  kind: LivingActorPlayerChoiceKind,
): effectValue is LivingActorPlayerChoiceEffect {
  if (!plainRecord(effectValue) || typeof effectValue.kind !== "string") return false;
  switch (kind) {
    case "ask-offer-provision":
      return exactKeys(effectValue, [
        "beneficiaryActorId",
        "containerId",
        "custodianActorId",
        "kind",
        "requestId",
      ])
        && effectValue.kind === "request-provision-offer"
        && validId(effectValue.requestId)
        && validActorId(effectValue.custodianActorId)
        && validActorId(effectValue.beneficiaryActorId)
        && effectValue.custodianActorId !== effectValue.beneficiaryActorId
        && validContainerId(effectValue.containerId);
    case "ask-secure-provisions":
      return exactKeys(effectValue, ["containerId", "custodianActorId", "kind", "requestId"])
        && effectValue.kind === "request-secure-provisions"
        && validId(effectValue.requestId)
        && validActorId(effectValue.custodianActorId)
        && validContainerId(effectValue.containerId);
    case "wait-observe":
      return exactKeys(effectValue, ["focusActorId", "kind", "untilTick"])
        && effectValue.kind === "wait-observe"
        && validNullableActorId(effectValue.focusActorId)
        && nonnegativeSafeInteger(effectValue.untilTick);
    case "reroute":
      return exactKeys(effectValue, ["avoidArea", "focusActorId", "kind"])
        && effectValue.kind === "request-reroute"
        && validActorId(effectValue.focusActorId)
        && validObservedArea(effectValue.avoidArea);
    case "leave":
      return exactKeys(effectValue, ["focusActorId", "kind"])
        && effectValue.kind === "leave-interaction"
        && validNullableActorId(effectValue.focusActorId);
  }
}

function freezeEvent(value: LivingActorPlayerChoiceEvent): LivingActorPlayerChoiceEvent {
  return deepFreeze({ ...value, effect: { ...value.effect } });
}

function hashAction(action: LivingActorPlayerChoiceAction): string {
  const { id: _id, ...body } = action;
  return hashCanonical(body);
}

function choiceActionId(body: Omit<LivingActorPlayerChoiceAction, "id">): string {
  return `living-choice:${body.ordinal}:${hashCanonical(body)}`;
}

function choiceEventId(event: LivingActorPlayerChoiceEvent | Omit<LivingActorPlayerChoiceEvent, "id">): string {
  const body = "id" in event
    ? (({ id: _id, ...withoutId }) => withoutId)(event)
    : event;
  return `living-choice-event:${event.ordinal}:${hashCanonical(body)}`;
}

function effect<T extends LivingActorPlayerChoiceEffect>(value: T) {
  return Object.freeze({ reason: "applied" as const, effect: deepFreeze(value) });
}

function noEffect(reason: "already-satisfied" | "not-observed" | "not-plausible") {
  return Object.freeze({ reason, effect: null });
}

function failed(
  reason: Exclude<LivingActorPlayerChoiceReason, "applied" | "already-applied">,
  state: LivingActorPlayerChoiceState,
): LivingActorPlayerChoiceResult {
  return deepFreeze({ ok: false, reason, state, event: null, effect: null });
}

function validChoiceKind(value: unknown): value is LivingActorPlayerChoiceKind {
  return value === "ask-offer-provision"
    || value === "ask-secure-provisions"
    || value === "wait-observe"
    || value === "reroute"
    || value === "leave";
}

function validObservedArea(value: unknown): value is ObservedArea {
  return plainRecord(value)
    && exactKeys(value, ["center", "radiusUnits"])
    && isWorldPosition(value.center)
    && nonnegativeSafeInteger(value.radiusUnits)
    && value.radiusUnits <= 10_000_000;
}

function validActorId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= ACTOR_ID_MAX_LENGTH
    && ACTOR_ID_PATTERN.test(value);
}

function validNullableActorId(value: unknown): value is string | null {
  return value === null || validActorId(value);
}

function validContainerId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= MAX_CONTAINER_ID_LENGTH
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= ACTOR_ID_MAX_LENGTH
    && ACTOR_ID_PATTERN.test(value);
}

function safeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && !Object.is(value, -0);
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return safeInteger(value) && (value as number) >= 0;
}

function positiveSafeInteger(value: unknown): value is number {
  return safeInteger(value) && (value as number) > 0;
}

function plainRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  let ownKeys: readonly PropertyKey[];
  try {
    ownKeys = Reflect.ownKeys(value);
  } catch {
    return false;
  }
  if (ownKeys.some((key) => typeof key !== "string")) return false;
  const actual = [...ownKeys as readonly string[]].sort();
  const canonical = [...expected].sort();
  if (actual.length !== canonical.length || !actual.every((key, index) => key === canonical[index])) {
    return false;
  }
  return actual.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
  });
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

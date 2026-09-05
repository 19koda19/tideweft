import type { CargoEnvironmentState } from "../sim/cargoEnvironment";
import { ACTOR_ID_MAX_LENGTH } from "../sim/actorPerception";
import { FIXED_POINT } from "../sim/types";
import { hashCanonical, stableStringify } from "../sim/util";
import { createCraftingInventory } from "./crafting";
import {
  LOOSE_CARGO_MAX_ORDINAL,
  addLooseCargoProvision,
  consumeLooseCargoProvisionLot,
  createLooseCargoCarrier,
  inspectLooseCargoMultiCarrierConservation,
  proveLooseCargoMultiCarrierConservation,
  validateLooseCargoCarrier,
  type CarriedCargoLot,
  type LooseCargoCarrierState,
  type LooseCargoCarrierMutationReason,
  type LooseCargoConservationProof,
} from "./looseCargo";
import {
  PROVISION_DEFINITIONS,
  PROVISION_KINDS,
  type ProvisionKind,
} from "./provisions";

/**
 * Species-neutral carried-container sidecar. It is intentionally additive:
 * existing physical-cargo v2 saves continue embedding their v1 player carrier,
 * while a future outer-save migration can initialize this optional v1 sidecar from
 * generated actor packs without rewriting those saves.
 */
export const ACTOR_CARGO_VERSION = 1 as const;
export const ACTOR_CARGO_MAX_CONTAINERS = 512;
export const ACTOR_CARGO_MAX_EVENTS = 4_096;

const MAX_ID_LENGTH = 160;
const PROVISION_KIND_SET: ReadonlySet<string> = new Set(PROVISION_KINDS);

export type ActorCargoContainerClosure = "open" | "secured";
export type ActorCargoEventKind =
  | "provision-added"
  | "provision-transferred"
  | "provision-consumed"
  | "closure-changed";

export interface ActorCargoContainer {
  /** Stable physical pack identity, independent from its custodian. */
  readonly id: string;
  readonly kind: "field-pack";
  readonly custodianActorId: string;
  readonly closure: ActorCargoContainerClosure;
  /** Physical container condition in fixed-point 0..1 units. */
  readonly condition: number;
  /** Maximum secured rain protection at full condition. */
  readonly rainProtection: number;
  /** Maximum secured scent containment at full condition. */
  readonly scentContainment: number;
  readonly carrier: LooseCargoCarrierState;
}

export interface ActorCargoEvent {
  readonly id: string;
  readonly ordinal: number;
  readonly transactionId: string;
  readonly transactionHash: string;
  readonly kind: ActorCargoEventKind;
  readonly actorId: string;
  readonly sourceContainerId: string | null;
  readonly destinationContainerId: string | null;
  readonly sourceLotId: string | null;
  readonly resultLotId: string | null;
  readonly provision: ProvisionKind | null;
  readonly quantity: number;
  readonly materialState: CargoEnvironmentState | null;
  /** True only when consumption exhausted and retired the exact source lot. */
  readonly tombstoned: boolean;
}

export interface ActorCargoState {
  readonly version: typeof ACTOR_CARGO_VERSION;
  readonly revision: number;
  readonly lastEventOrdinal: number;
  /** Canonical ascending container-ID order. */
  readonly containers: readonly ActorCargoContainer[];
  /** Bounded append-only causal evidence. */
  readonly events: readonly ActorCargoEvent[];
}

export interface ActorCargoContainerConfig {
  readonly id: string;
  readonly custodianActorId: string;
  readonly capacityMilliLoad: number;
  readonly closure?: ActorCargoContainerClosure;
  readonly condition?: number;
  readonly rainProtection?: number;
  readonly scentContainment?: number;
}

export interface ActorCargoAddProvisionRequest {
  readonly transactionId: string;
  readonly containerId: string;
  readonly lotId: string;
  readonly provision: ProvisionKind;
  readonly quantity: number;
  readonly materialState?: CargoEnvironmentState;
}

export interface ActorCargoTransferProvisionRequest {
  readonly transactionId: string;
  readonly sourceContainerId: string;
  readonly destinationContainerId: string;
  readonly lotId: string;
  readonly quantity: number;
}

export interface ActorCargoConsumeProvisionRequest {
  readonly transactionId: string;
  readonly containerId: string;
  readonly lotId: string;
  readonly quantity: number;
}

export interface ActorCargoSetClosureRequest {
  readonly transactionId: string;
  readonly containerId: string;
  readonly closure: ActorCargoContainerClosure;
}

export type ActorCargoMutationReason =
  | "applied"
  | "already-applied"
  | "invalid-state"
  | "invalid-request"
  | "container-not-found"
  | "lot-not-found"
  | "quantity-unavailable"
  | "capacity-exceeded"
  | "identity-conflict"
  | "event-capacity-exceeded"
  | "ordinal-space-exhausted"
  | "conservation-failed";

export interface ActorCargoMutationResult {
  readonly ok: boolean;
  readonly reason: ActorCargoMutationReason;
  readonly state: ActorCargoState;
  readonly event: ActorCargoEvent | null;
  readonly affectedLot: CarriedCargoLot | null;
  readonly conservation: LooseCargoConservationProof | null;
}

export interface ActorCargoValidation {
  readonly valid: boolean;
  readonly reason:
    | "valid"
    | "not-an-object"
    | "invalid-version"
    | "invalid-revision"
    | "invalid-container"
    | "too-many-containers"
    | "duplicate-container"
    | "duplicate-custodian"
    | "noncanonical-order"
    | "invalid-event"
    | "too-many-events"
    | "duplicate-transaction"
    | "invalid-custody";
  readonly state: ActorCargoState | null;
}

export interface ActorCargoContainerExposure {
  readonly closure: ActorCargoContainerClosure;
  readonly effectiveRainProtection: number;
  readonly rainIngress: number;
  readonly effectiveScentContainment: number;
  readonly uncontainedProvisionScent: number;
  readonly provisionScentLeak: number;
}

export function createActorCargoContainer(config: ActorCargoContainerConfig): ActorCargoContainer {
  if (
    !isRecord(config)
    || !validId(config.id)
    || !validActorId(config.custodianActorId)
    || !Number.isSafeInteger(config.capacityMilliLoad)
    || config.capacityMilliLoad < 0
    || Object.is(config.capacityMilliLoad, -0)
  ) throw new RangeError("Actor cargo container configuration is invalid");
  const closure = config.closure ?? "secured";
  const condition = config.condition ?? FIXED_POINT;
  const rainProtection = config.rainProtection ?? 720_000;
  const scentContainment = config.scentContainment ?? 620_000;
  if (!validClosure(closure) || !validUnit(condition) || !validUnit(rainProtection) || !validUnit(scentContainment)) {
    throw new RangeError("Actor cargo container protection must be bounded fixed-point state");
  }
  return deepFreeze({
    id: config.id,
    kind: "field-pack",
    custodianActorId: config.custodianActorId,
    closure,
    condition,
    rainProtection,
    scentContainment,
    carrier: createLooseCargoCarrier(
      { kind: "actor", id: config.custodianActorId },
      createCraftingInventory(config.capacityMilliLoad),
    ),
  });
}

export function createActorCargoState(
  containers: readonly ActorCargoContainer[] = [],
): ActorCargoState {
  const validation = validateActorCargoState({
    version: ACTOR_CARGO_VERSION,
    revision: 0,
    lastEventOrdinal: 0,
    containers: [...containers].sort(compareContainer),
    events: [],
  });
  if (!validation.valid || validation.state === null) {
    throw new RangeError(`Cannot create actor cargo state: ${validation.reason}`);
  }
  return validation.state;
}

export function validateActorCargoState(value: unknown): ActorCargoValidation {
  if (!isRecord(value)) return invalidValidation("not-an-object");
  if (!hasExactKeys(value, ["version", "revision", "lastEventOrdinal", "containers", "events"])) {
    return invalidValidation("not-an-object");
  }
  if (value.version !== ACTOR_CARGO_VERSION) return invalidValidation("invalid-version");
  if (!validCounter(value.revision) || !validCounter(value.lastEventOrdinal)) {
    return invalidValidation("invalid-revision");
  }
  if (value.revision !== value.lastEventOrdinal) return invalidValidation("invalid-revision");
  if (!Array.isArray(value.containers) || value.containers.length > ACTOR_CARGO_MAX_CONTAINERS) {
    return invalidValidation("too-many-containers");
  }
  const containers: ActorCargoContainer[] = [];
  const containerIds = new Set<string>();
  const custodians = new Set<string>();
  let priorContainerId: string | null = null;
  for (const raw of value.containers as readonly unknown[]) {
    const container = canonicalContainer(raw);
    if (container === null) return invalidValidation("invalid-container");
    if (containerIds.has(container.id)) return invalidValidation("duplicate-container");
    if (custodians.has(container.custodianActorId)) return invalidValidation("duplicate-custodian");
    if (priorContainerId !== null && container.id <= priorContainerId) {
      return invalidValidation("noncanonical-order");
    }
    containerIds.add(container.id);
    custodians.add(container.custodianActorId);
    priorContainerId = container.id;
    containers.push(container);
  }
  if (!Array.isArray(value.events) || value.events.length > ACTOR_CARGO_MAX_EVENTS) {
    return invalidValidation("too-many-events");
  }
  const events: ActorCargoEvent[] = [];
  const transactions = new Set<string>();
  let priorOrdinal = 0;
  for (const raw of value.events as readonly unknown[]) {
    const event = canonicalEvent(raw);
    if (event === null || event.ordinal !== priorOrdinal + 1) {
      return invalidValidation("invalid-event");
    }
    if (!eventMatchesContainers(event, containers)) return invalidValidation("invalid-event");
    if (transactions.has(event.transactionId)) return invalidValidation("duplicate-transaction");
    transactions.add(event.transactionId);
    priorOrdinal = event.ordinal;
    events.push(event);
  }
  if (priorOrdinal !== value.lastEventOrdinal) return invalidValidation("invalid-event");
  for (const event of events) {
    if (!event.tombstoned || event.sourceContainerId === null || event.sourceLotId === null) continue;
    const container = containers.find(({ id }) => id === event.sourceContainerId);
    if (container === undefined || !container.carrier.retiredLotIds.includes(event.sourceLotId)) {
      return invalidValidation("invalid-event");
    }
  }
  if (containers.length > 0) {
    const custody = inspectLooseCargoMultiCarrierConservation(
      [],
      containers.map(({ carrier }) => carrier),
    );
    if (!custody.valid) return invalidValidation("invalid-custody");
  }
  const canonicalState: ActorCargoState = {
    version: ACTOR_CARGO_VERSION,
    revision: value.revision,
    lastEventOrdinal: value.lastEventOrdinal,
    containers,
    events,
  };
  deepFreeze(canonicalState);
  return {
    valid: true,
    reason: "valid",
    state: canonicalState,
  };
}

export function serializeActorCargoState(state: ActorCargoState): string {
  const validation = validateActorCargoState(state);
  if (!validation.valid || validation.state === null) {
    throw new RangeError(`Cannot serialize actor cargo state: ${validation.reason}`);
  }
  return stableStringify(validation.state);
}

export function deserializeActorCargoState(text: string): ActorCargoState {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`Actor cargo save is not valid JSON: ${error instanceof Error ? error.message : "parse failed"}`);
  }
  const validation = validateActorCargoState(decoded);
  if (!validation.valid || validation.state === null) {
    throw new Error(`Actor cargo save is invalid: ${validation.reason}`);
  }
  return validation.state;
}

export function addActorCargoProvision(
  state: ActorCargoState,
  request: ActorCargoAddProvisionRequest,
): ActorCargoMutationResult {
  const context = mutationContext(
    state,
    "provision-added",
    request,
    validAddProvisionRequest(request),
  );
  if (context.result !== null) return context.result;
  const container = context.state.containers.find(({ id }) => id === request.containerId);
  if (container === undefined) return failedMutation("container-not-found", state);
  if (lotIdentityKnown(context.state, request.lotId)) {
    return failedMutation("identity-conflict", state);
  }
  const mutation = addLooseCargoProvision(container.carrier, {
    sourceLotId: request.lotId,
    provision: request.provision,
    quantity: request.quantity,
    ...(request.materialState === undefined ? {} : { materialState: request.materialState }),
  });
  if (!mutation.ok) return failedMutation(mapCarrierReason(mutation.reason), state);
  const affected = mutation.carrier.lots.find(({ id }) => id === request.lotId) ?? null;
  if (affected === null) return failedMutation("identity-conflict", state);
  return commitMutation(context.state, context.transactionHash, request.transactionId, {
    kind: "provision-added",
    actorId: container.custodianActorId,
    sourceContainerId: null,
    destinationContainerId: container.id,
    sourceLotId: null,
    resultLotId: affected.id,
    provision: request.provision,
    quantity: request.quantity,
    materialState: affected.materialState,
    tombstoned: false,
  }, replaceContainer(context.state.containers, { ...container, carrier: mutation.carrier }), affected, null);
}

export function transferActorCargoProvision(
  state: ActorCargoState,
  request: ActorCargoTransferProvisionRequest,
): ActorCargoMutationResult {
  const context = mutationContext(
    state,
    "provision-transferred",
    request,
    validTransferProvisionRequest(request),
  );
  if (context.result !== null) return context.result;
  const source = context.state.containers.find(({ id }) => id === request.sourceContainerId);
  const destination = context.state.containers.find(({ id }) => id === request.destinationContainerId);
  if (source === undefined || destination === undefined) {
    return failedMutation("container-not-found", state);
  }
  const lot = source.carrier.lots.find(({ id }) => id === request.lotId);
  if (lot === undefined || lot.payload.kind !== "provision") {
    return failedMutation("lot-not-found", state);
  }
  if (request.quantity > lot.payload.quantity) {
    return failedMutation("quantity-unavailable", state);
  }
  const provisionPayload = lot.payload;
  const fullTransfer = request.quantity === provisionPayload.quantity;
  const resultLotId = fullTransfer
    ? lot.id
    : actorCargoFragmentLotId(lot.id, request.transactionId);
  if (
    (!fullTransfer && lotIdentityKnown(context.state, resultLotId))
    || destination.carrier.lots.some(({ id }) => id === resultLotId)
    || destination.carrier.retiredLotIds.includes(resultLotId)
  ) return failedMutation("identity-conflict", state);
  const movedLot: CarriedCargoLot = {
    ...lot,
    id: resultLotId,
    payload: {
      ...provisionPayload,
      lotId: resultLotId,
      quantity: request.quantity,
    },
  };
  const sourceLots = fullTransfer
    ? source.carrier.lots.filter(({ id }) => id !== lot.id)
    : source.carrier.lots.map((candidate) => candidate.id === lot.id
      ? {
          ...candidate,
          payload: {
            ...provisionPayload,
            quantity: provisionPayload.quantity - request.quantity,
          },
        }
      : candidate);
  const sourceCarrier = validateLooseCargoCarrier({
    ...source.carrier,
    revision: source.carrier.revision + 1,
    lots: sourceLots,
  });
  const destinationCarrier = validateLooseCargoCarrier({
    ...destination.carrier,
    revision: destination.carrier.revision + 1,
    lots: [...destination.carrier.lots, movedLot],
  });
  if (!sourceCarrier.valid || sourceCarrier.carrier === null) {
    return failedMutation("identity-conflict", state);
  }
  if (!destinationCarrier.valid || destinationCarrier.carrier === null) {
    return failedMutation(
      destinationCarrier.reason === "over-capacity" ? "capacity-exceeded" : "identity-conflict",
      state,
    );
  }
  const nextContainers = replaceContainer(
    replaceContainer(context.state.containers, { ...source, carrier: sourceCarrier.carrier }),
    { ...destination, carrier: destinationCarrier.carrier },
  );
  const conservation = proveLooseCargoMultiCarrierConservation(
    [],
    context.state.containers.map(({ carrier }) => carrier),
    [],
    nextContainers.map(({ carrier }) => carrier),
  );
  if (!conservation.conserved) return failedMutation("conservation-failed", state, conservation);
  return commitMutation(context.state, context.transactionHash, request.transactionId, {
    kind: "provision-transferred",
    actorId: destination.custodianActorId,
    sourceContainerId: source.id,
    destinationContainerId: destination.id,
    sourceLotId: lot.id,
    resultLotId,
    provision: provisionPayload.provision,
    quantity: request.quantity,
    materialState: lot.materialState,
    tombstoned: false,
  }, nextContainers, movedLot, conservation);
}

export function consumeActorCargoProvision(
  state: ActorCargoState,
  request: ActorCargoConsumeProvisionRequest,
): ActorCargoMutationResult {
  const context = mutationContext(
    state,
    "provision-consumed",
    request,
    validConsumeProvisionRequest(request),
  );
  if (context.result !== null) return context.result;
  const container = context.state.containers.find(({ id }) => id === request.containerId);
  if (container === undefined) return failedMutation("container-not-found", state);
  const lot = container.carrier.lots.find(({ id }) => id === request.lotId);
  if (lot === undefined || lot.payload.kind !== "provision") {
    return failedMutation("lot-not-found", state);
  }
  if (request.quantity > lot.payload.quantity) {
    return failedMutation("quantity-unavailable", state);
  }
  const mutation = consumeLooseCargoProvisionLot(container.carrier, {
    lotId: lot.id,
    quantity: request.quantity,
  });
  if (!mutation.ok || mutation.removed.length !== 1) {
    return failedMutation(mapCarrierReason(mutation.reason), state);
  }
  const tombstoned = mutation.carrier.retiredLotIds.includes(lot.id);
  const consumed = mutation.removed[0]!;
  return commitMutation(context.state, context.transactionHash, request.transactionId, {
    kind: "provision-consumed",
    actorId: container.custodianActorId,
    sourceContainerId: container.id,
    destinationContainerId: null,
    sourceLotId: lot.id,
    resultLotId: tombstoned ? null : lot.id,
    provision: lot.payload.provision,
    quantity: request.quantity,
    materialState: consumed.materialState,
    tombstoned,
  }, replaceContainer(context.state.containers, { ...container, carrier: mutation.carrier }), consumed, null);
}

export function setActorCargoContainerClosure(
  state: ActorCargoState,
  request: ActorCargoSetClosureRequest,
): ActorCargoMutationResult {
  const context = mutationContext(
    state,
    "closure-changed",
    request,
    validSetClosureRequest(request),
  );
  if (context.result !== null) return context.result;
  const container = context.state.containers.find(({ id }) => id === request.containerId);
  if (container === undefined) return failedMutation("container-not-found", state);
  return commitMutation(context.state, context.transactionHash, request.transactionId, {
    kind: "closure-changed",
    actorId: container.custodianActorId,
    sourceContainerId: container.id,
    destinationContainerId: container.id,
    sourceLotId: null,
    resultLotId: null,
    provision: null,
    quantity: 0,
    materialState: null,
    tombstoned: false,
  }, replaceContainer(context.state.containers, { ...container, closure: request.closure }), null, null);
}

/**
 * Honest bounded signals for the later weather and scent consumers. Securing a
 * damaged pack helps, but never grants perfect protection or zero scent unless
 * its authored containment actually reaches that value.
 */
export function inspectActorCargoContainerExposure(
  container: ActorCargoContainer,
  rain: number,
): ActorCargoContainerExposure {
  const canonical = canonicalContainer(container);
  if (canonical === null || !validUnit(rain)) {
    throw new RangeError("Container exposure requires valid physical state and bounded rain");
  }
  const secured = canonical.closure === "secured";
  const effectiveRainProtection = secured
    ? multiplyUnit(canonical.rainProtection, canonical.condition)
    : 0;
  const effectiveScentContainment = secured
    ? multiplyUnit(canonical.scentContainment, canonical.condition)
    : 0;
  let uncontainedProvisionScent = 0;
  for (const lot of canonical.carrier.lots) {
    if (lot.payload.kind !== "provision") continue;
    const definition = PROVISION_DEFINITIONS[lot.payload.provision];
    const materialAmplifier = FIXED_POINT + Math.trunc(lot.materialState.decay / 2);
    const perLot = Math.min(
      FIXED_POINT,
      Math.trunc((definition.scentStrength * materialAmplifier) / FIXED_POINT)
        * lot.payload.quantity,
    );
    uncontainedProvisionScent = unionUnit(uncontainedProvisionScent, perLot);
  }
  return {
    closure: canonical.closure,
    effectiveRainProtection,
    rainIngress: multiplyUnit(rain, FIXED_POINT - effectiveRainProtection),
    effectiveScentContainment,
    uncontainedProvisionScent,
    provisionScentLeak: multiplyUnit(
      uncontainedProvisionScent,
      FIXED_POINT - effectiveScentContainment,
    ),
  };
}

export function actorCargoEventId(ordinal: number): string {
  if (!Number.isSafeInteger(ordinal) || ordinal <= 0) {
    throw new RangeError("Actor cargo event identity requires a positive safe ordinal");
  }
  return `actor-cargo:event:${ordinal}`;
}

export function actorCargoFragmentLotId(sourceLotId: string, transactionId: string): string {
  if (!validId(sourceLotId) || !validId(transactionId)) {
    throw new RangeError("Actor cargo fragment identity requires valid source and transaction IDs");
  }
  return `actor-provision-fragment:${hashCanonical({ sourceLotId, transactionId })}`;
}

function mutationContext(
  state: ActorCargoState,
  kind: ActorCargoEventKind,
  request: unknown,
  requestAdmitted: boolean,
): {
  readonly state: ActorCargoState;
  readonly transactionHash: string;
  readonly result: ActorCargoMutationResult | null;
} {
  const validation = validateActorCargoState(state);
  if (!validation.valid || validation.state === null) {
    return { state, transactionHash: "", result: failedMutation("invalid-state", state) };
  }
  if (!requestAdmitted || !isRecord(request) || !validId(request.transactionId)) {
    return {
      state: validation.state,
      transactionHash: "",
      result: failedMutation("invalid-request", state),
    };
  }
  let transactionHash: string;
  try {
    transactionHash = hashCanonical({ kind, request });
  } catch {
    return {
      state: validation.state,
      transactionHash: "",
      result: failedMutation("invalid-request", state),
    };
  }
  const prior = validation.state.events.find(({ transactionId }) => transactionId === request.transactionId);
  if (prior !== undefined) {
    return {
      state: validation.state,
      transactionHash,
      result: prior.transactionHash === transactionHash
        ? {
            ok: true,
            reason: "already-applied",
            state: validation.state,
            event: prior,
            affectedLot: null,
            conservation: null,
          }
        : failedMutation("identity-conflict", state),
    };
  }
  return { state: validation.state, transactionHash, result: null };
}

function commitMutation(
  state: ActorCargoState,
  transactionHash: string,
  transactionId: string,
  record: Omit<ActorCargoEvent, "id" | "ordinal" | "transactionId" | "transactionHash">,
  containers: readonly ActorCargoContainer[],
  affectedLot: CarriedCargoLot | null,
  conservation: LooseCargoConservationProof | null,
): ActorCargoMutationResult {
  if (state.events.length >= ACTOR_CARGO_MAX_EVENTS) {
    return failedMutation("event-capacity-exceeded", state, conservation);
  }
  if (state.revision >= LOOSE_CARGO_MAX_ORDINAL || state.lastEventOrdinal >= LOOSE_CARGO_MAX_ORDINAL) {
    return failedMutation("ordinal-space-exhausted", state, conservation);
  }
  const ordinal = state.lastEventOrdinal + 1;
  const event: ActorCargoEvent = {
    id: actorCargoEventId(ordinal),
    ordinal,
    transactionId,
    transactionHash,
    ...record,
  };
  const validation = validateActorCargoState({
    ...state,
    revision: state.revision + 1,
    lastEventOrdinal: ordinal,
    containers,
    events: [...state.events, event],
  });
  if (!validation.valid || validation.state === null) {
    return failedMutation("identity-conflict", state, conservation);
  }
  if (affectedLot !== null) deepFreeze(affectedLot);
  const committedEvent = validation.state.events[validation.state.events.length - 1] ?? null;
  return {
    ok: true,
    reason: "applied",
    state: validation.state,
    event: committedEvent,
    affectedLot,
    conservation,
  };
}

function failedMutation(
  reason: Exclude<ActorCargoMutationReason, "applied" | "already-applied">,
  state: ActorCargoState,
  conservation: LooseCargoConservationProof | null = null,
): ActorCargoMutationResult {
  return { ok: false, reason, state, event: null, affectedLot: null, conservation };
}

function canonicalContainer(value: unknown): ActorCargoContainer | null {
  if (
    !isRecord(value)
    || !hasExactKeys(value, [
      "id",
      "kind",
      "custodianActorId",
      "closure",
      "condition",
      "rainProtection",
      "scentContainment",
      "carrier",
    ])
    || !validId(value.id)
    || value.kind !== "field-pack"
    || !validActorId(value.custodianActorId)
    || !validClosure(value.closure)
    || !validUnit(value.condition)
    || !validUnit(value.rainProtection)
    || !validUnit(value.scentContainment)
  ) return null;
  const validation = validateLooseCargoCarrier(value.carrier);
  if (
    !validation.valid
    || validation.carrier === null
    || containsNegativeZero(value.carrier)
    || !sameCanonicalShape(value.carrier, validation.carrier)
    || validation.carrier.owner.kind !== "actor"
    || validation.carrier.owner.id !== value.custodianActorId
  ) return null;
  return {
    id: value.id,
    kind: "field-pack",
    custodianActorId: value.custodianActorId,
    closure: value.closure,
    condition: value.condition,
    rainProtection: value.rainProtection,
    scentContainment: value.scentContainment,
    carrier: validation.carrier,
  };
}

function canonicalEvent(value: unknown): ActorCargoEvent | null {
  if (
    !isRecord(value)
    || !hasExactKeys(value, [
      "id",
      "ordinal",
      "transactionId",
      "transactionHash",
      "kind",
      "actorId",
      "sourceContainerId",
      "destinationContainerId",
      "sourceLotId",
      "resultLotId",
      "provision",
      "quantity",
      "materialState",
      "tombstoned",
    ])
    || !validPositiveCounter(value.ordinal)
    || value.id !== actorCargoEventId(value.ordinal)
    || !validId(value.transactionId)
    || typeof value.transactionHash !== "string"
    || !/^[0-9a-f]{16}$/.test(value.transactionHash)
    || !validEventKind(value.kind)
    || !validActorId(value.actorId)
    || !validNullableId(value.sourceContainerId)
    || !validNullableId(value.destinationContainerId)
    || !validNullableId(value.sourceLotId)
    || !validNullableId(value.resultLotId)
    || (value.provision !== null && !PROVISION_KIND_SET.has(value.provision as string))
    || typeof value.quantity !== "number"
    || !Number.isSafeInteger(value.quantity)
    || value.quantity < 0
    || Object.is(value.quantity, -0)
    || typeof value.tombstoned !== "boolean"
  ) return null;
  const materialState = value.materialState === null
    ? null
    : canonicalMaterialState(value.materialState);
  if (value.materialState !== null && materialState === null) return null;
  if (!coherentEvent(value, materialState)) return null;
  return {
    id: value.id,
    ordinal: value.ordinal,
    transactionId: value.transactionId,
    transactionHash: value.transactionHash,
    kind: value.kind,
    actorId: value.actorId,
    sourceContainerId: value.sourceContainerId,
    destinationContainerId: value.destinationContainerId,
    sourceLotId: value.sourceLotId,
    resultLotId: value.resultLotId,
    provision: value.provision as ProvisionKind | null,
    quantity: value.quantity,
    materialState,
    tombstoned: value.tombstoned,
  };
}

function coherentEvent(
  value: Record<string, any>,
  materialState: CargoEnvironmentState | null,
): boolean {
  const positiveQuantity = validQuantity(value.quantity);
  const provision = typeof value.provision === "string"
    && PROVISION_KIND_SET.has(value.provision);
  switch (value.kind as ActorCargoEventKind) {
    case "provision-added":
      return value.sourceContainerId === null
        && typeof value.destinationContainerId === "string"
        && value.sourceLotId === null
        && typeof value.resultLotId === "string"
        && provision
        && positiveQuantity
        && materialState !== null
        && value.tombstoned === false;
    case "provision-transferred":
      return typeof value.sourceContainerId === "string"
        && typeof value.destinationContainerId === "string"
        && value.sourceContainerId !== value.destinationContainerId
        && typeof value.sourceLotId === "string"
        && typeof value.resultLotId === "string"
        && (
          value.resultLotId === value.sourceLotId
          || value.resultLotId === actorCargoFragmentLotId(value.sourceLotId, value.transactionId)
        )
        && provision
        && positiveQuantity
        && materialState !== null
        && value.tombstoned === false;
    case "provision-consumed":
      return typeof value.sourceContainerId === "string"
        && value.destinationContainerId === null
        && typeof value.sourceLotId === "string"
        && (value.tombstoned
          ? value.resultLotId === null
          : value.resultLotId === value.sourceLotId)
        && provision
        && positiveQuantity
        && materialState !== null;
    case "closure-changed":
      return typeof value.sourceContainerId === "string"
        && value.destinationContainerId === value.sourceContainerId
        && value.sourceLotId === null
        && value.resultLotId === null
        && value.provision === null
        && value.quantity === 0
        && materialState === null
        && value.tombstoned === false;
  }
}

function eventMatchesContainers(
  event: ActorCargoEvent,
  containers: readonly ActorCargoContainer[],
): boolean {
  const source = event.sourceContainerId === null
    ? null
    : containers.find(({ id }) => id === event.sourceContainerId);
  const destination = event.destinationContainerId === null
    ? null
    : containers.find(({ id }) => id === event.destinationContainerId);
  if (event.sourceContainerId !== null && source === undefined) return false;
  if (event.destinationContainerId !== null && destination === undefined) return false;
  switch (event.kind) {
    case "provision-added": return destination?.custodianActorId === event.actorId;
    case "provision-transferred": return destination?.custodianActorId === event.actorId;
    case "provision-consumed": return source?.custodianActorId === event.actorId;
    case "closure-changed": return source?.custodianActorId === event.actorId;
  }
}

function canonicalMaterialState(value: unknown): CargoEnvironmentState | null {
  if (
    !isRecord(value)
    || !hasExactKeys(value, ["condition", "contamination", "decay"])
    || !validUnit(value.condition)
    || !validUnit(value.contamination)
    || !validUnit(value.decay)
  ) return null;
  return {
    condition: value.condition,
    contamination: value.contamination,
    decay: value.decay,
  };
}

function lotIdentityKnown(state: ActorCargoState, lotId: string): boolean {
  return state.containers.some(({ carrier }) =>
    carrier.lots.some(({ id }) => id === lotId) || carrier.retiredLotIds.includes(lotId));
}

function replaceContainer(
  containers: readonly ActorCargoContainer[],
  replacement: ActorCargoContainer,
): readonly ActorCargoContainer[] {
  return containers
    .map((container) => container.id === replacement.id ? replacement : container)
    .sort(compareContainer);
}

function compareContainer(left: ActorCargoContainer, right: ActorCargoContainer): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function mapCarrierReason(
  reason: LooseCargoCarrierMutationReason,
): Exclude<ActorCargoMutationReason, "applied" | "already-applied"> {
  switch (reason) {
    case "capacity-exceeded": return "capacity-exceeded";
    case "quantity-unavailable": return "quantity-unavailable";
    case "lot-not-found": return "lot-not-found";
    case "retirement-space-exhausted": return "event-capacity-exceeded";
    case "revision-space-exhausted": return "ordinal-space-exhausted";
    default: return "identity-conflict";
  }
}

function multiplyUnit(left: number, right: number): number {
  return Math.trunc((left * right) / FIXED_POINT);
}

function unionUnit(left: number, right: number): number {
  return FIXED_POINT - multiplyUnit(FIXED_POINT - left, FIXED_POINT - right);
}

/**
 * Transaction hashes encode enumerable string-keyed data. Request admission
 * therefore rejects symbols, accessors, and non-enumerable aliases as well as
 * ordinary surplus/missing fields before hashing.
 */
function hasExactRequestKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  let ownKeys: readonly PropertyKey[];
  try {
    ownKeys = Reflect.ownKeys(value);
  } catch {
    return false;
  }
  if (ownKeys.some((key) => typeof key !== "string")) return false;
  const actual = [...ownKeys as readonly string[]].sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length
    || !actual.every((key, index) => key === expected[index])
  ) return false;
  return actual.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
  });
}

function validAddProvisionRequest(value: unknown): value is ActorCargoAddProvisionRequest {
  if (!isRecord(value)) return false;
  const withoutMaterial = hasExactRequestKeys(value, [
    "transactionId",
    "containerId",
    "lotId",
    "provision",
    "quantity",
  ]);
  const withMaterial = hasExactRequestKeys(value, [
    "transactionId",
    "containerId",
    "lotId",
    "provision",
    "quantity",
    "materialState",
  ]);
  return (withoutMaterial || withMaterial)
    && validId(value.transactionId)
    && validId(value.containerId)
    && validId(value.lotId)
    && PROVISION_KIND_SET.has(value.provision as string)
    && validQuantity(value.quantity)
    && (!withMaterial || canonicalMaterialState(value.materialState) !== null);
}

function validTransferProvisionRequest(value: unknown): value is ActorCargoTransferProvisionRequest {
  return isRecord(value)
    && hasExactRequestKeys(value, [
      "transactionId",
      "sourceContainerId",
      "destinationContainerId",
      "lotId",
      "quantity",
    ])
    && validId(value.transactionId)
    && validId(value.sourceContainerId)
    && validId(value.destinationContainerId)
    && value.sourceContainerId !== value.destinationContainerId
    && validId(value.lotId)
    && validQuantity(value.quantity);
}

function validConsumeProvisionRequest(value: unknown): value is ActorCargoConsumeProvisionRequest {
  return isRecord(value)
    && hasExactRequestKeys(value, ["transactionId", "containerId", "lotId", "quantity"])
    && validId(value.transactionId)
    && validId(value.containerId)
    && validId(value.lotId)
    && validQuantity(value.quantity);
}

function validSetClosureRequest(value: unknown): value is ActorCargoSetClosureRequest {
  return isRecord(value)
    && hasExactRequestKeys(value, ["transactionId", "containerId", "closure"])
    && validId(value.transactionId)
    && validId(value.containerId)
    && validClosure(value.closure);
}

function validEventKind(value: unknown): value is ActorCargoEventKind {
  return value === "provision-added"
    || value === "provision-transferred"
    || value === "provision-consumed"
    || value === "closure-changed";
}

function validClosure(value: unknown): value is ActorCargoContainerClosure {
  return value === "open" || value === "secured";
}

function validActorId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= ACTOR_ID_MAX_LENGTH
    && /^[A-Za-z0-9][A-Za-z0-9:._/-]*$/.test(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= MAX_ID_LENGTH
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function validNullableId(value: unknown): value is string | null {
  return value === null || validId(value);
}

function validUnit(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= FIXED_POINT
    && !Object.is(value, -0);
}

function validQuantity(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value > 0
    && value <= 1_000_000
    && !Object.is(value, -0);
}

function validCounter(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= LOOSE_CARGO_MAX_ORDINAL
    && !Object.is(value, -0);
}

function validPositiveCounter(value: unknown): value is number {
  return validCounter(value) && value > 0;
}

function hasExactKeys(value: Record<string, any>, expected: readonly string[]): boolean {
  let ownKeys: readonly PropertyKey[];
  try {
    ownKeys = Reflect.ownKeys(value);
  } catch {
    return false;
  }
  if (ownKeys.some((key) => typeof key !== "string")) return false;
  const actual = [...ownKeys as readonly string[]].sort();
  const canonical = [...expected].sort();
  if (
    actual.length !== canonical.length
    || !actual.every((key, index) => key === canonical[index])
  ) return false;
  return actual.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
  });
}

/** Reject fields, array reordering, and negative zero that a nested canonicalizer
 * would otherwise silently normalize out of a persisted sidecar. */
function sameCanonicalShape(value: unknown, canonical: unknown): boolean {
  if (Array.isArray(value) || Array.isArray(canonical)) {
    if (!Array.isArray(value) || !Array.isArray(canonical) || value.length !== canonical.length) {
      return false;
    }
    const valueKeys = Reflect.ownKeys(value);
    const canonicalKeys = Reflect.ownKeys(canonical);
    if (
      valueKeys.length !== canonicalKeys.length
      || valueKeys.some((key, index) => key !== canonicalKeys[index])
    ) return false;
    return value.every((entry, index) => sameCanonicalShape(entry, canonical[index]));
  }
  if (isRecord(value) || isRecord(canonical)) {
    if (!isRecord(value) || !isRecord(canonical)) return false;
    const valueKeys = Reflect.ownKeys(value).sort(comparePropertyKey);
    const canonicalKeys = Reflect.ownKeys(canonical).sort(comparePropertyKey);
    if (
      valueKeys.length !== canonicalKeys.length
      || valueKeys.some((key, index) => key !== canonicalKeys[index])
    ) return false;
    return valueKeys.every((key) => {
      if (typeof key !== "string") return false;
      const valueDescriptor = Object.getOwnPropertyDescriptor(value, key);
      const canonicalDescriptor = Object.getOwnPropertyDescriptor(canonical, key);
      return valueDescriptor !== undefined
        && canonicalDescriptor !== undefined
        && valueDescriptor.enumerable === canonicalDescriptor.enumerable
        && "value" in valueDescriptor
        && "value" in canonicalDescriptor
        && sameCanonicalShape(valueDescriptor.value, canonicalDescriptor.value);
    });
  }
  return Object.is(value, canonical);
}

function comparePropertyKey(left: PropertyKey, right: PropertyKey): number {
  const leftText = typeof left === "symbol" ? `symbol:${String(left.description)}` : `string:${left}`;
  const rightText = typeof right === "symbol" ? `symbol:${String(right.description)}` : `string:${right}`;
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}

function containsNegativeZero(value: unknown): boolean {
  if (typeof value === "number") return Object.is(value, -0);
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).some(containsNegativeZero);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  Object.freeze(value);
  return value;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidValidation(
  reason: Exclude<ActorCargoValidation["reason"], "valid">,
): ActorCargoValidation {
  return { valid: false, reason, state: null };
}

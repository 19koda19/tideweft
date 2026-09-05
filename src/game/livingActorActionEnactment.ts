import { hashCanonical } from "../sim/util";
import {
  setActorCargoContainerClosure,
  transferActorCargoProvision,
  validateActorCargoState,
  type ActorCargoEvent,
  type ActorCargoState,
} from "./actorCargo";
import {
  canonicalizeLivingActorPlayerChoiceState,
  type LivingActorPlayerChoiceEvent,
  type LivingActorPlayerChoiceState,
  type RequestProvisionOfferEffect,
  type RequestSecureProvisionsEffect,
} from "./livingActorPlayerChoice";
import {
  PORTER_RESPONSE_VERSION,
  applyPorterResponseDecision,
  canonicalizePorterResponseState,
  decidePorterResponse,
  decidePorterResponseForRequest,
  type PorterResponseDecision,
  type PorterResponseInput,
  type PorterResponseState,
} from "./porterResponse";
import { PROVISION_KINDS, type ProvisionKind } from "./provisions";

/**
 * Species-neutral authoritative boundary between a player's communication,
 * another actor's decision, and physical cargo. It deliberately knows no dog,
 * bear, porter-NPC pair, or BIO0 ecology rules.
 */
export const LIVING_ACTOR_ACTION_ENACTMENT_VERSION = 1 as const;
/** A spoken request remains pending for this many authoritative world ticks. */
export const LIVING_ACTOR_ACTION_ENACTMENT_MAX_REQUEST_AGE_TICKS = 12 as const;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/u;
const PROVISION_SET: ReadonlySet<string> = new Set(PROVISION_KINDS);

export interface OfferedProvisionContact {
  readonly version: typeof LIVING_ACTOR_ACTION_ENACTMENT_VERSION;
  readonly id: string;
  readonly kind: "offered-provision-contact";
  readonly tick: number;
  readonly requestId: string;
  readonly decisionId: string;
  readonly providerActorId: string;
  readonly beneficiaryActorId: string;
  readonly providerContainerId: string;
  readonly receiverContainerId: string;
  /** The exact lot selected while it was still in provider custody. */
  readonly sourceLotId: string;
  /** The exact one-unit lot now in beneficiary custody. */
  readonly resultLotId: string;
  readonly provision: ProvisionKind;
  readonly quantity: 1;
  readonly transferCargoEventId: string;
}

export interface LivingActorActionEnactmentInput {
  readonly version: typeof LIVING_ACTOR_ACTION_ENACTMENT_VERSION;
  readonly requestId: string;
  readonly choiceState: LivingActorPlayerChoiceState;
  /** The addressed actor's current lawful cognition, body needs, and cargo. */
  readonly porter: PorterResponseInput;
  /** Required only for a provision offer; it remains physical world authority. */
  readonly receiverContainerId: string | null;
}

export type LivingActorActionEnactmentReason =
  | "applied"
  | "already-applied"
  | "decision-only"
  | "invalid-input"
  | "request-not-retained"
  | "request-expired"
  | "identity-conflict"
  | "cargo-mutation-failed";

export interface LivingActorActionEnactmentResult {
  readonly ok: boolean;
  readonly reason: LivingActorActionEnactmentReason;
  readonly cargo: ActorCargoState | null;
  readonly porterState: PorterResponseState | null;
  readonly decision: PorterResponseDecision | null;
  readonly cargoEvent: ActorCargoEvent | null;
  /**
   * A replay may recover this same contact while its transferred lot is still
   * waiting in receiver custody. It never creates a second transfer.
   */
  readonly contact: OfferedProvisionContact | null;
}

/**
 * Integration contract:
 * - `decision-only` proves no cargo or closure outcome. A caller may retry the
 *   same retained request on a later world tick with fresh perception and the
 *   returned porter state, until `request-expired`.
 * - offer enactment must run on the exact next ecology tick and its contact be
 *   consumed by that same accepted tick.
 * - `already-applied` never mutates cargo; during an interrupted same-tick
 *   retry it can recover the identical still-pending contact.
 */

type ActionableRequest = RequestProvisionOfferEffect | RequestSecureProvisionsEffect;

interface CanonicalInput {
  readonly requestId: string;
  readonly requestEvent: LivingActorPlayerChoiceEvent & { readonly effect: ActionableRequest };
  readonly cargo: ActorCargoState;
  readonly porter: PorterResponseInput;
  readonly porterState: PorterResponseState;
  readonly receiverContainerId: string | null;
}

/**
 * Enacts only a response which agrees with the retained player request. The
 * player cannot transfer another actor's property, and a bare request is never
 * treated as the custodian's consent.
 */
export function enactLivingActorAction(value: unknown): LivingActorActionEnactmentResult {
  const input = canonicalInput(value);
  if (input === null) {
    return requestIsAbsentFromOtherwiseCanonicalInput(value)
      ? failed("request-not-retained")
      : failed("invalid-input");
  }
  const transactionPrefix = enactmentTransactionPrefix(input.requestId);
  const prior = input.cargo.events.filter(({ transactionId }) =>
    transactionId.startsWith(transactionPrefix)
  );
  if (prior.length > 1) return failedWith("identity-conflict", input);
  if (prior.length === 1) {
    const replayContact = recoveredPendingContact(prior[0]!, input, transactionPrefix);
    return priorEventMatchesRequest(prior[0]!, input, transactionPrefix)
      ? frozenResult({
        ok: true,
        reason: "already-applied",
        cargo: input.cargo,
        porterState: input.porterState,
        decision: null,
        cargoEvent: prior[0]!,
        contact: replayContact,
      })
      : failedWith("identity-conflict", input);
  }
  if (
    input.porter.tick
      > input.requestEvent.tick + LIVING_ACTOR_ACTION_ENACTMENT_MAX_REQUEST_AGE_TICKS
  ) return failedWith("request-expired", input);

  const decision = decidePorterResponseForRequest(input.porter, {
    version: PORTER_RESPONSE_VERSION,
    requestId: input.requestId,
    kind: input.requestEvent.effect.kind === "request-provision-offer"
      ? "offer-provision"
      : "secure-provisions",
    subjectId: input.requestEvent.effect.kind === "request-provision-offer"
      ? input.requestEvent.effect.beneficiaryActorId
      : null,
  });
  if (decision === null) return failedWith("invalid-input", input);
  const response = applyPorterResponseDecision(input.porterState, decision);
  if (!response.ok || response.state === null) {
    return failedWith("identity-conflict", input, decision);
  }

  const request = input.requestEvent.effect;
  const transactionId = enactmentTransactionId(
    input.requestId,
    decision.tick,
    decision.decisionId,
  );

  // This is the porter's own pack, so securing it is a lawful response even
  // to HELP. Runtime may claim it happened only when this mutation succeeds.
  if (
    decision.intent === "secure-food"
    && decision.actorId === request.custodianActorId
    && decision.packContainerId === request.containerId
  ) {
    const mutation = setActorCargoContainerClosure(input.cargo, {
      transactionId,
      containerId: request.containerId,
      closure: "secured",
    });
    if (
      !mutation.ok
      || mutation.reason !== "applied"
      || mutation.event?.kind !== "closure-changed"
      || mutation.event.actorId !== request.custodianActorId
    ) return failedWith("cargo-mutation-failed", input, decision);
    return frozenResult({
      ok: true,
      reason: "applied",
      cargo: mutation.state,
      porterState: response.state,
      decision,
      cargoEvent: mutation.event,
      contact: null,
    });
  }

  if (!decisionAgreesWithOfferRequest(decision, request)) {
    return frozenResult({
      ok: true,
      reason: "decision-only",
      cargo: input.cargo,
      porterState: response.state,
      decision,
      cargoEvent: null,
      contact: null,
    });
  }

  const receiver = input.cargo.containers.find(({ id }) => id === input.receiverContainerId);
  if (
    receiver === undefined
    || request.kind !== "request-provision-offer"
    || receiver.custodianActorId !== request.beneficiaryActorId
    || decision.foodLotId === null
  ) return failedWith("identity-conflict", input, decision);
  const mutation = transferActorCargoProvision(input.cargo, {
    transactionId,
    sourceContainerId: request.containerId,
    destinationContainerId: receiver.id,
    lotId: decision.foodLotId,
    quantity: 1,
  });
  if (
    !mutation.ok
    || mutation.reason !== "applied"
    || mutation.event?.kind !== "provision-transferred"
    || mutation.event.sourceLotId === null
    || mutation.event.resultLotId === null
    || mutation.event.provision === null
    || mutation.event.actorId !== request.beneficiaryActorId
    || mutation.affectedLot?.payload.kind !== "provision"
    || mutation.affectedLot.payload.quantity !== 1
    || mutation.conservation?.conserved !== true
  ) return failedWith("cargo-mutation-failed", input, decision);

  const contact = createOfferedProvisionContact({
    tick: decision.tick,
    requestId: input.requestId,
    decisionId: decision.decisionId,
    providerActorId: request.custodianActorId,
    beneficiaryActorId: request.beneficiaryActorId,
    providerContainerId: request.containerId,
    receiverContainerId: receiver.id,
    sourceLotId: mutation.event.sourceLotId,
    resultLotId: mutation.event.resultLotId,
    provision: mutation.event.provision,
    transferCargoEventId: mutation.event.id,
  });
  return frozenResult({
    ok: true,
    reason: "applied",
    cargo: mutation.state,
    porterState: response.state,
    decision,
    cargoEvent: mutation.event,
    contact,
  });
}

/** Strict consumer-side validation for ecology adapters. */
export function canonicalizeOfferedProvisionContact(value: unknown): OfferedProvisionContact | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "beneficiaryActorId",
    "decisionId",
    "id",
    "kind",
    "providerActorId",
    "providerContainerId",
    "provision",
    "quantity",
    "receiverContainerId",
    "requestId",
    "resultLotId",
    "sourceLotId",
    "tick",
    "transferCargoEventId",
    "version",
  ])) return null;
  if (
    value.version !== LIVING_ACTOR_ACTION_ENACTMENT_VERSION
    || value.kind !== "offered-provision-contact"
    || !validId(value.id)
    || !nonnegativeSafeInteger(value.tick)
    || !validId(value.requestId)
    || !validId(value.decisionId)
    || !validId(value.providerActorId)
    || !validId(value.beneficiaryActorId)
    || value.providerActorId === value.beneficiaryActorId
    || !validId(value.providerContainerId)
    || !validId(value.receiverContainerId)
    || value.providerContainerId === value.receiverContainerId
    || !validId(value.sourceLotId)
    || !validId(value.resultLotId)
    || typeof value.provision !== "string"
    || !PROVISION_SET.has(value.provision)
    || value.quantity !== 1
    || !validId(value.transferCargoEventId)
  ) return null;
  const body = contactBody({
    tick: value.tick,
    requestId: value.requestId,
    decisionId: value.decisionId,
    providerActorId: value.providerActorId,
    beneficiaryActorId: value.beneficiaryActorId,
    providerContainerId: value.providerContainerId,
    receiverContainerId: value.receiverContainerId,
    sourceLotId: value.sourceLotId,
    resultLotId: value.resultLotId,
    provision: value.provision as ProvisionKind,
    transferCargoEventId: value.transferCargoEventId,
  });
  if (value.id !== offeredProvisionContactId(body)) return null;
  return deepFreeze({
    version: LIVING_ACTOR_ACTION_ENACTMENT_VERSION,
    id: value.id,
    ...body,
  });
}

function canonicalInput(value: unknown): CanonicalInput | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "choiceState",
    "porter",
    "receiverContainerId",
    "requestId",
    "version",
  ])) return null;
  if (
    value.version !== LIVING_ACTOR_ACTION_ENACTMENT_VERSION
    || !validId(value.requestId)
    || !(value.receiverContainerId === null || validId(value.receiverContainerId))
    || !plainRecord(value.porter)
  ) return null;
  const choiceState = canonicalizeLivingActorPlayerChoiceState(value.choiceState);
  const cargoValidation = validateActorCargoState(value.porter.cargo);
  const porterState = canonicalizePorterResponseState(value.porter.current);
  if (
    choiceState === null
    || !cargoValidation.valid
    || cargoValidation.state === null
    || porterState === null
    || decidePorterResponse(value.porter) === null
  ) return null;
  const requestEvents = choiceState.events.filter(({ actionId }) => actionId === value.requestId);
  if (requestEvents.length !== 1) return null;
  const requestEvent = actionableRequestEvent(requestEvents[0]);
  if (
    requestEvent === null
    || requestEvent.effect.requestId !== value.requestId
    || requestEvent.effect.custodianActorId !== porterState.actorId
    || requestEvent.effect.containerId !== value.porter.packContainerId
    || !nonnegativeSafeInteger(value.porter.tick)
    || value.porter.tick < requestEvent.tick
    || (requestEvent.effect.kind === "request-provision-offer"
      ? value.receiverContainerId === null
      : value.receiverContainerId !== null)
  ) return null;
  return Object.freeze({
    requestId: value.requestId,
    requestEvent,
    cargo: cargoValidation.state,
    porter: value.porter as unknown as PorterResponseInput,
    porterState,
    receiverContainerId: value.receiverContainerId,
  });
}

function actionableRequestEvent(
  event: LivingActorPlayerChoiceEvent | undefined,
): (LivingActorPlayerChoiceEvent & { readonly effect: ActionableRequest }) | null {
  if (
    event === undefined
    || (event.effect.kind !== "request-provision-offer"
      && event.effect.kind !== "request-secure-provisions")
  ) return null;
  return event as LivingActorPlayerChoiceEvent & { readonly effect: ActionableRequest };
}

function decisionAgreesWithOfferRequest(
  decision: PorterResponseDecision,
  request: ActionableRequest,
): boolean {
  if (
    decision.actorId !== request.custodianActorId
    || decision.packContainerId !== request.containerId
  ) return false;
  return request.kind === "request-provision-offer"
    && decision.intent === "offer-food"
    && decision.subjectId === request.beneficiaryActorId
    && decision.foodLotId !== null;
}

function priorEventMatchesRequest(
  event: ActorCargoEvent,
  input: CanonicalInput,
  transactionPrefix: string,
): boolean {
  const transaction = parseEnactmentTransaction(event.transactionId, transactionPrefix);
  if (
    transaction === null
    || transaction.tick < input.requestEvent.tick
    || transaction.tick
      > input.requestEvent.tick + LIVING_ACTOR_ACTION_ENACTMENT_MAX_REQUEST_AGE_TICKS
  ) return false;
  const request = input.requestEvent.effect;
  if (event.kind === "closure-changed") {
    return event.kind === "closure-changed"
      && event.actorId === request.custodianActorId
      && event.sourceContainerId === request.containerId
      && event.destinationContainerId === request.containerId;
  }
  if (request.kind !== "request-provision-offer") return false;
  const receiver = input.cargo.containers.find(({ id }) => id === input.receiverContainerId);
  return receiver !== undefined
    && receiver.custodianActorId === request.beneficiaryActorId
    && event.kind === "provision-transferred"
    && event.actorId === request.beneficiaryActorId
    && event.sourceContainerId === request.containerId
    && event.destinationContainerId === receiver.id
    && event.sourceLotId !== null
    && event.resultLotId !== null
    && event.quantity === 1;
}

function recoveredPendingContact(
  event: ActorCargoEvent,
  input: CanonicalInput,
  transactionPrefix: string,
): OfferedProvisionContact | null {
  const request = input.requestEvent.effect;
  const transaction = parseEnactmentTransaction(event.transactionId, transactionPrefix);
  if (
    request.kind !== "request-provision-offer"
    || event.kind !== "provision-transferred"
    || event.sourceLotId === null
    || event.resultLotId === null
    || event.provision === null
    || transaction === null
    || transaction.tick !== input.porter.tick
  ) return null;
  const receiver = input.cargo.containers.find(({ id }) => id === event.destinationContainerId);
  const live = receiver?.carrier.lots.find(({ id }) => id === event.resultLotId);
  if (
    receiver === undefined
    || receiver.id !== input.receiverContainerId
    || receiver.custodianActorId !== request.beneficiaryActorId
    || live?.payload.kind !== "provision"
    || live.payload.provision !== event.provision
    || live.payload.quantity !== 1
  ) return null;
  return createOfferedProvisionContact({
    tick: transaction.tick,
    requestId: input.requestId,
    decisionId: transaction.decisionId,
    providerActorId: request.custodianActorId,
    beneficiaryActorId: request.beneficiaryActorId,
    providerContainerId: request.containerId,
    receiverContainerId: receiver.id,
    sourceLotId: event.sourceLotId,
    resultLotId: event.resultLotId,
    provision: event.provision,
    transferCargoEventId: event.id,
  });
}

function createOfferedProvisionContact(
  value: Omit<OfferedProvisionContact, "version" | "id" | "kind" | "quantity">,
): OfferedProvisionContact {
  const body = contactBody(value);
  return deepFreeze({
    version: LIVING_ACTOR_ACTION_ENACTMENT_VERSION,
    id: offeredProvisionContactId(body),
    ...body,
  });
}

function contactBody(
  value: Omit<OfferedProvisionContact, "version" | "id" | "kind" | "quantity">,
): Omit<OfferedProvisionContact, "version" | "id"> {
  return {
    kind: "offered-provision-contact",
    tick: value.tick,
    requestId: value.requestId,
    decisionId: value.decisionId,
    providerActorId: value.providerActorId,
    beneficiaryActorId: value.beneficiaryActorId,
    providerContainerId: value.providerContainerId,
    receiverContainerId: value.receiverContainerId,
    sourceLotId: value.sourceLotId,
    resultLotId: value.resultLotId,
    provision: value.provision,
    quantity: 1,
    transferCargoEventId: value.transferCargoEventId,
  };
}

function offeredProvisionContactId(
  body: Omit<OfferedProvisionContact, "version" | "id">,
): string {
  return `offered-provision-contact:${hashCanonical(body)}`;
}

function enactmentTransactionPrefix(requestId: string): string {
  return `living-enact:${hashCanonical({ requestId })}:`;
}

function enactmentTransactionId(requestId: string, tick: number, decisionId: string): string {
  return `${enactmentTransactionPrefix(requestId)}${tick}:${decisionId}`;
}

function parseEnactmentTransaction(
  transactionId: string,
  expectedPrefix: string,
): Readonly<{ tick: number; decisionId: string }> | null {
  if (!transactionId.startsWith(expectedPrefix)) return null;
  const suffix = transactionId.slice(expectedPrefix.length);
  const separator = suffix.indexOf(":");
  if (separator <= 0) return null;
  const tickText = suffix.slice(0, separator);
  const decisionId = suffix.slice(separator + 1);
  if (
    !/^(0|[1-9][0-9]*)$/u.test(tickText)
    || !/^porter-response:[0-9a-f]{16}$/u.test(decisionId)
  ) return null;
  const tick = Number(tickText);
  return nonnegativeSafeInteger(tick) ? Object.freeze({ tick, decisionId }) : null;
}

function requestIsAbsentFromOtherwiseCanonicalInput(value: unknown): boolean {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "choiceState",
      "porter",
      "receiverContainerId",
      "requestId",
      "version",
    ])
    || value.version !== LIVING_ACTOR_ACTION_ENACTMENT_VERSION
    || !validId(value.requestId)
  ) return false;
  const state = canonicalizeLivingActorPlayerChoiceState(value.choiceState);
  return state !== null && !state.events.some(({ actionId }) => actionId === value.requestId);
}

function failed(reason: LivingActorActionEnactmentReason): LivingActorActionEnactmentResult {
  return frozenResult({
    ok: false,
    reason,
    cargo: null,
    porterState: null,
    decision: null,
    cargoEvent: null,
    contact: null,
  });
}

function failedWith(
  reason: LivingActorActionEnactmentReason,
  input: CanonicalInput,
  decision: PorterResponseDecision | null = null,
): LivingActorActionEnactmentResult {
  return frozenResult({
    ok: false,
    reason,
    cargo: input.cargo,
    porterState: input.porterState,
    decision,
    cargoEvent: null,
    contact: null,
  });
}

function frozenResult(value: LivingActorActionEnactmentResult): LivingActorActionEnactmentResult {
  return Object.freeze({ ...value });
}

function validId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
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

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

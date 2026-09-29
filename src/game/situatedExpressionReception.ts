import type { SituatedExpressionEvent } from "./situatedExpression";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";

/** Versioned evidence that the player lawfully received one active expression. */
export const SITUATED_EXPRESSION_RECEPTION_VERSION = 1 as const;
/** Integer fixed-point scale used by `certainty`. */
export const SITUATED_EXPRESSION_RECEPTION_CERTAINTY_SCALE = 1_000_000 as const;

const MAX_EXPRESSION_ID_LENGTH = 180;

interface SituatedExpressionReceptionBase {
  readonly version: typeof SITUATED_EXPRESSION_RECEPTION_VERSION;
  readonly eventId: string;
  readonly sourceActorId: string;
  readonly receivedAtTick: number;
  /** Positive fixed-point certainty in 0..1,000,000 units. */
  readonly certainty: number;
}

/** The player is the expression source and therefore receives their own exact words. */
export interface SelfSituatedExpressionReception extends SituatedExpressionReceptionBase {
  readonly kind: "self";
  readonly certainty: typeof SITUATED_EXPRESSION_RECEPTION_CERTAINTY_SCALE;
}

/**
 * The player heard the expression while directly seeing its source. The true
 * source position remains owned by `SituatedExpressionEvent`; this receipt
 * deliberately carries neither a position nor presentation prose.
 */
export interface HeardVisibleSituatedExpressionReception
  extends SituatedExpressionReceptionBase {
  readonly kind: "heard-visible";
  readonly directVisualReceipt: true;
}

export type SituatedExpressionReception =
  | SelfSituatedExpressionReception
  | HeardVisibleSituatedExpressionReception;

type ExpressionIdentity = Pick<SituatedExpressionEvent, "eventId" | "sourceActorId">;

/** Creates full-certainty evidence for the player's own active expression. */
export function createSelfSituatedExpressionReception(
  event: ExpressionIdentity,
  receivedAtTick: number,
): SelfSituatedExpressionReception | null {
  return canonicalizeSituatedExpressionReception({
    version: SITUATED_EXPRESSION_RECEPTION_VERSION,
    eventId: event?.eventId,
    sourceActorId: event?.sourceActorId,
    receivedAtTick,
    kind: "self",
    certainty: SITUATED_EXPRESSION_RECEPTION_CERTAINTY_SCALE,
  }) as SelfSituatedExpressionReception | null;
}

/**
 * Creates evidence for exact words heard from a directly visible source.
 * `directVisualReceipt` must be explicitly true; unseen hearing is not an
 * exact-anchor mode in this schema.
 */
export function createHeardVisibleSituatedExpressionReception(
  event: ExpressionIdentity,
  receivedAtTick: number,
  certainty: number,
  directVisualReceipt: boolean,
): HeardVisibleSituatedExpressionReception | null {
  return canonicalizeSituatedExpressionReception({
    version: SITUATED_EXPRESSION_RECEPTION_VERSION,
    eventId: event?.eventId,
    sourceActorId: event?.sourceActorId,
    receivedAtTick,
    kind: "heard-visible",
    certainty,
    directVisualReceipt,
  }) as HeardVisibleSituatedExpressionReception | null;
}

/**
 * Reauthenticates an immutable reception receipt. Unknown versions, unknown
 * modes, extra fields, malformed IDs, zero hearing certainty, and unbounded
 * integers all fail closed.
 */
export function canonicalizeSituatedExpressionReception(
  value: unknown,
): SituatedExpressionReception | null {
  if (!plainRecord(value)) return null;
  if (value.kind === "self") {
    if (!exactKeys(value, [
      "certainty",
      "eventId",
      "kind",
      "receivedAtTick",
      "sourceActorId",
      "version",
    ])) return null;
    if (
      !validCommonFields(value)
      || value.certainty !== SITUATED_EXPRESSION_RECEPTION_CERTAINTY_SCALE
    ) return null;
    return Object.freeze({
      version: SITUATED_EXPRESSION_RECEPTION_VERSION,
      eventId: value.eventId,
      sourceActorId: value.sourceActorId,
      receivedAtTick: value.receivedAtTick,
      kind: "self",
      certainty: SITUATED_EXPRESSION_RECEPTION_CERTAINTY_SCALE,
    });
  }
  if (value.kind === "heard-visible") {
    if (!exactKeys(value, [
      "certainty",
      "directVisualReceipt",
      "eventId",
      "kind",
      "receivedAtTick",
      "sourceActorId",
      "version",
    ])) return null;
    if (!validCommonFields(value) || value.directVisualReceipt !== true) return null;
    return Object.freeze({
      version: SITUATED_EXPRESSION_RECEPTION_VERSION,
      eventId: value.eventId,
      sourceActorId: value.sourceActorId,
      receivedAtTick: value.receivedAtTick,
      kind: "heard-visible",
      certainty: value.certainty,
      directVisualReceipt: true,
    });
  }
  return null;
}

/**
 * Verifies that canonical reception evidence names the exact active event and
 * source. A structural twin with either identity changed is not authority.
 */
export function situatedExpressionReceptionMatchesActiveEvent(
  receipt: unknown,
  activeEvent: SituatedExpressionEvent | null,
): boolean {
  if (activeEvent === null) return false;
  const canonical = canonicalizeSituatedExpressionReception(receipt);
  return canonical !== null
    && canonical.eventId === activeEvent.eventId
    && canonical.sourceActorId === activeEvent.sourceActorId
    && (activeEvent.sourceActorId === LOCAL_PLAYER_LIVING_ACTOR_ID
      ? canonical.kind === "self"
      : canonical.kind === "heard-visible" && canonical.directVisualReceipt === true);
}

function validCommonFields(
  value: Readonly<Record<string, unknown>>,
): value is Readonly<Record<string, unknown>> & {
  readonly version: typeof SITUATED_EXPRESSION_RECEPTION_VERSION;
  readonly eventId: string;
  readonly sourceActorId: string;
  readonly receivedAtTick: number;
  readonly certainty: number;
} {
  return value.version === SITUATED_EXPRESSION_RECEPTION_VERSION
    && validId(value.eventId)
    && validId(value.sourceActorId)
    && nonnegativeSafeInteger(value.receivedAtTick)
    && positiveScaledUnit(value.certainty);
}

function validId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= MAX_EXPRESSION_ID_LENGTH
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function positiveScaledUnit(value: unknown): value is number {
  return nonnegativeSafeInteger(value)
    && value > 0
    && value <= SITUATED_EXPRESSION_RECEPTION_CERTAINTY_SCALE;
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

import { hashCanonical } from "../sim/util";
import {
  canonicalizeCoreWildlifeActorState,
  type CoreWildlifeActorState,
} from "./coreWildlifeActor";
import {
  canonicalizeCoreWildlifeMortalityEvent,
  type CoreWildlifeMortalityEvent,
} from "./coreWildlifeMortality";

export const CORE_ECOLOGY_MORTALITY_TRANSACTION_VERSION = 1 as const;

/**
 * One committed population/body retirement. The terminal actor is retained as
 * an immutable tombstone so its identity, physical signs, and exact death
 * state cannot be regenerated when the living patch rematerializes.
 */
export interface CoreEcologyMortalityTransaction {
  readonly version: typeof CORE_ECOLOGY_MORTALITY_TRANSACTION_VERSION;
  readonly mortalityId: string;
  readonly mortalityOrdinal: number;
  readonly event: CoreWildlifeMortalityEvent;
  readonly retiredActor: CoreWildlifeActorState;
  readonly representedUnitsBefore: number;
  readonly removedPopulationUnits: 1;
  readonly carcassId: string;
}

export interface CreateCoreEcologyMortalityTransactionInput {
  readonly mortalityOrdinal: number;
  readonly event: CoreWildlifeMortalityEvent;
  readonly retiredActor: CoreWildlifeActorState;
  readonly representedUnitsBefore: number;
  readonly carcassId: string;
}

export function createCoreEcologyMortalityTransaction(
  input: CreateCoreEcologyMortalityTransactionInput,
): CoreEcologyMortalityTransaction {
  if (!plainRecord(input) || !exactKeys(input, [
    "carcassId",
    "event",
    "mortalityOrdinal",
    "representedUnitsBefore",
    "retiredActor",
  ])) throw new RangeError("Core ecology mortality transaction input is malformed");
  const event = canonicalizeCoreWildlifeMortalityEvent(input.event);
  const retiredActor = canonicalizeCoreWildlifeActorState(input.retiredActor);
  if (
    event === null
    || retiredActor === null
    || !nonnegativeSafeInteger(input.mortalityOrdinal)
    || !positiveSafeInteger(input.representedUnitsBefore)
    || !validCarcassId(input.carcassId)
    || !terminalActorMatchesEvent(retiredActor, event)
  ) throw new RangeError("Core ecology mortality transaction is incoherent");
  const body = deepFreeze({
    version: CORE_ECOLOGY_MORTALITY_TRANSACTION_VERSION,
    mortalityOrdinal: input.mortalityOrdinal,
    event,
    retiredActor,
    representedUnitsBefore: input.representedUnitsBefore,
    removedPopulationUnits: 1 as const,
    carcassId: input.carcassId,
  });
  return deepFreeze({
    ...body,
    mortalityId: `ecology-mortality:${hashCanonical(body)}`,
  });
}

export function canonicalizeCoreEcologyMortalityTransaction(
  value: unknown,
): CoreEcologyMortalityTransaction | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "carcassId",
    "event",
    "mortalityId",
    "mortalityOrdinal",
    "removedPopulationUnits",
    "representedUnitsBefore",
    "retiredActor",
    "version",
  ])) return null;
  if (
    value.version !== CORE_ECOLOGY_MORTALITY_TRANSACTION_VERSION
    || value.removedPopulationUnits !== 1
  ) return null;
  try {
    const canonical = createCoreEcologyMortalityTransaction({
      mortalityOrdinal: value.mortalityOrdinal as number,
      event: value.event as CoreWildlifeMortalityEvent,
      retiredActor: value.retiredActor as CoreWildlifeActorState,
      representedUnitsBefore: value.representedUnitsBefore as number,
      carcassId: value.carcassId as string,
    });
    return canonical.mortalityId === value.mortalityId ? canonical : null;
  } catch {
    return null;
  }
}

function terminalActorMatchesEvent(
  actor: CoreWildlifeActorState,
  event: CoreWildlifeMortalityEvent,
): boolean {
  return event.outcome === "death"
    && event.healthAfter === 0
    && actor.condition.health === 0
    && actor.updatedAtTick === event.atTick
    && actor.identity.stableId === event.victimId
    && samePosition(actor.address.position, event.victimPosition);
}

function samePosition(
  left: CoreWildlifeActorState["address"]["position"],
  right: CoreWildlifeActorState["address"]["position"],
): boolean {
  return left.region.x === right.region.x
    && left.region.y === right.region.y
    && left.localX === right.localX
    && left.localY === right.localY;
}

function validCarcassId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 256
    && /^[A-Za-z0-9][A-Za-z0-9:._/-]*$/u.test(value);
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
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
  const actual = Object.keys(value).sort(compareText);
  const canonicalExpected = [...expected].sort(compareText);
  return actual.length === canonicalExpected.length
    && actual.every((key, index) => key === canonicalExpected[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

import { ACTOR_PERCEPTION_SCALE } from "../sim/actorPerception";
import {
  CORE_WILDLIFE_SPECIES,
  type CoreWildlifeSpecies,
} from "../sim/coreWildlifeIdentity";
import { hashCanonical, stableStringify } from "../sim/util";
import {
  canonicalizeCoreWildlifeMortalityEvent,
  type CoreWildlifeMortalityEvent,
} from "./coreWildlifeMortality";
import {
  isLivingSpeciesActorAddressable,
  livingSpeciesActorIdMatchesNamespace,
} from "./livingSpeciesRegistry";
import {
  createWorldPosition,
  isWorldPosition,
  type WorldPosition,
} from "./worldPosition";

/**
 * Species-neutral physical aftermath for one authenticated wildlife death.
 * Movement, harvesting, presentation, scent, and population accounting remain
 * outside this deliberately small resource owner.
 */
export const CORE_WILDLIFE_CARCASS_VERSION = 1 as const;
export const CORE_WILDLIFE_CARCASS_CONDITION_SCALE = ACTOR_PERCEPTION_SCALE;
export const CORE_WILDLIFE_CARCASS_MAX_BODY_SIZE_UNITS = 1_000_000 as const;
export const CORE_WILDLIFE_CARCASS_MAX_RESOURCE_UNITS = 1_000_000 as const;
export const CORE_WILDLIFE_CARCASS_MAX_SERIALIZED_BYTES = 8 * 1_024;
export const CORE_WILDLIFE_CARCASS_DISCLOSURE =
  "direct-observation-required" as const;

const UTF8_ENCODER = new TextEncoder();
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/u;
const MORTALITY_EVENT_ID_PATTERN = /^wildlife-harm:[0-9a-f]{16}$/u;
const CARCASS_ID_PATTERN = /^wildlife-carcass:[0-9a-f]{16}$/u;

export interface CoreWildlifeCarcassCondition {
  /** Normalized fixed-point thermal condition supplied by the environment owner. */
  readonly temperature: number;
  /** Irreversible decomposition progress in [0, 1,000,000]. */
  readonly decay: number;
  /** Independent clock: custody operations must never erase elapsed decay time. */
  readonly updatedAtTick: number;
}

/**
 * One persistent body and its finite resource balance. Zero remaining units is
 * an explicit tombstone, never a request to delete or respawn the body.
 */
export interface CoreWildlifeCarcass {
  readonly version: typeof CORE_WILDLIFE_CARCASS_VERSION;
  readonly carcassId: string;
  readonly sourceMortalityEventId: string;
  readonly sourceActorId: string;
  readonly sourceSpecies: CoreWildlifeSpecies;
  readonly deathPosition: WorldPosition;
  readonly deathAtTick: number;
  /** Caller-owned physical scale; the kernel never derives it by species. */
  readonly bodySizeUnits: number;
  readonly originalResourceUnits: number;
  readonly remainingResourceUnits: number;
  readonly consumedResourceUnits: number;
  readonly decayedResourceUnits: number;
  readonly condition: CoreWildlifeCarcassCondition;
  readonly currentClaimantActorId: string | null;
  readonly claimProvenanceId: string | null;
  readonly claimedAtTick: number | null;
  readonly retiredAtTick: number | null;
  readonly updatedAtTick: number;
  readonly disclosure: typeof CORE_WILDLIFE_CARCASS_DISCLOSURE;
}

/** Compatibility name for roots that store the record as an explicit state. */
export type CoreWildlifeCarcassState = CoreWildlifeCarcass;

export interface CreateCoreWildlifeCarcassInput {
  /** Exact named death event emitted by the shared mortality kernel. */
  readonly mortalityEvent: CoreWildlifeMortalityEvent;
  readonly sourceSpecies: CoreWildlifeSpecies;
  readonly bodySizeUnits: number;
  readonly resourceUnits: number;
  readonly temperature: number;
}

export interface ClaimCoreWildlifeCarcassInput {
  readonly actorId: string;
  readonly provenanceId: string;
  readonly atTick: number;
}

export interface ReleaseCoreWildlifeCarcassInput {
  readonly actorId: string;
  readonly atTick: number;
}

export interface ConsumeCoreWildlifeCarcassInput {
  readonly actorId: string;
  readonly units: number;
  readonly atTick: number;
}

export interface AdvanceCoreWildlifeCarcassDecayInput {
  readonly atTick: number;
  readonly temperature: number;
  /** Fixed-point decay progress applied once per elapsed simulation tick. */
  readonly decayUnitsPerTick: number;
}

/**
 * Derive the one carcass namespace from the immutable death identity. Resource,
 * size, temperature, claimant, and call order deliberately do not mint bodies.
 */
export function stableCoreWildlifeCarcassId(
  sourceMortalityEventId: unknown,
  sourceActorId: unknown,
): string | null {
  if (
    typeof sourceMortalityEventId !== "string"
    || !MORTALITY_EVENT_ID_PATTERN.test(sourceMortalityEventId)
    || !canonicalActorId(sourceActorId)
  ) return null;
  return `wildlife-carcass:${hashCanonical({
    sourceActorId,
    sourceMortalityEventId,
  })}`;
}

/** Create one fresh, physical body from one exact authenticated death. */
export function createCoreWildlifeCarcass(
  value: unknown,
): CoreWildlifeCarcass | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "bodySizeUnits",
    "mortalityEvent",
    "resourceUnits",
    "sourceSpecies",
    "temperature",
  ])) return null;
  const mortalityEvent = canonicalDeathEvent(value.mortalityEvent);
  if (
    mortalityEvent === null
    || !coreWildlifeSpecies(value.sourceSpecies)
    || !isLivingSpeciesActorAddressable(value.sourceSpecies)
    || !livingSpeciesActorIdMatchesNamespace(mortalityEvent.victimId, value.sourceSpecies)
    || !positiveBoundedInteger(value.bodySizeUnits, CORE_WILDLIFE_CARCASS_MAX_BODY_SIZE_UNITS)
    || !positiveBoundedInteger(value.resourceUnits, CORE_WILDLIFE_CARCASS_MAX_RESOURCE_UNITS)
    || !scaledUnit(value.temperature)
  ) return null;
  const carcassId = stableCoreWildlifeCarcassId(
    mortalityEvent.eventId,
    mortalityEvent.victimId,
  );
  if (carcassId === null) return null;
  return canonicalizeCoreWildlifeCarcass({
    version: CORE_WILDLIFE_CARCASS_VERSION,
    carcassId,
    sourceMortalityEventId: mortalityEvent.eventId,
    sourceActorId: mortalityEvent.victimId,
    sourceSpecies: value.sourceSpecies,
    deathPosition: mortalityEvent.victimPosition,
    deathAtTick: mortalityEvent.atTick,
    bodySizeUnits: value.bodySizeUnits,
    originalResourceUnits: value.resourceUnits,
    remainingResourceUnits: value.resourceUnits,
    consumedResourceUnits: 0,
    decayedResourceUnits: 0,
    condition: {
      temperature: value.temperature,
      decay: 0,
      updatedAtTick: mortalityEvent.atTick,
    },
    currentClaimantActorId: null,
    claimProvenanceId: null,
    claimedAtTick: null,
    retiredAtTick: null,
    updatedAtTick: mortalityEvent.atTick,
    disclosure: CORE_WILDLIFE_CARCASS_DISCLOSURE,
  });
}

/** Strict save-boundary canonicalization. Unknown or incoherent fields fail closed. */
export function canonicalizeCoreWildlifeCarcass(
  value: unknown,
): CoreWildlifeCarcass | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "bodySizeUnits",
    "carcassId",
    "claimProvenanceId",
    "claimedAtTick",
    "condition",
    "consumedResourceUnits",
    "currentClaimantActorId",
    "deathAtTick",
    "deathPosition",
    "decayedResourceUnits",
    "disclosure",
    "originalResourceUnits",
    "remainingResourceUnits",
    "retiredAtTick",
    "sourceActorId",
    "sourceMortalityEventId",
    "sourceSpecies",
    "updatedAtTick",
    "version",
  ])) return null;
  const condition = canonicalCondition(value.condition);
  if (
    value.version !== CORE_WILDLIFE_CARCASS_VERSION
    || typeof value.carcassId !== "string"
    || !CARCASS_ID_PATTERN.test(value.carcassId)
    || typeof value.sourceMortalityEventId !== "string"
    || !MORTALITY_EVENT_ID_PATTERN.test(value.sourceMortalityEventId)
    || !canonicalActorId(value.sourceActorId)
    || !coreWildlifeSpecies(value.sourceSpecies)
    || !isLivingSpeciesActorAddressable(value.sourceSpecies)
    || !livingSpeciesActorIdMatchesNamespace(value.sourceActorId, value.sourceSpecies)
    || !isWorldPosition(value.deathPosition)
    || !nonnegativeSafeInteger(value.deathAtTick)
    || !positiveBoundedInteger(value.bodySizeUnits, CORE_WILDLIFE_CARCASS_MAX_BODY_SIZE_UNITS)
    || !positiveBoundedInteger(value.originalResourceUnits, CORE_WILDLIFE_CARCASS_MAX_RESOURCE_UNITS)
    || !boundedResourcePart(value.remainingResourceUnits, value.originalResourceUnits)
    || !boundedResourcePart(value.consumedResourceUnits, value.originalResourceUnits)
    || !boundedResourcePart(value.decayedResourceUnits, value.originalResourceUnits)
    || condition === null
    || !nonnegativeSafeInteger(value.updatedAtTick)
    || value.updatedAtTick < value.deathAtTick
    || condition.updatedAtTick < value.deathAtTick
    || condition.updatedAtTick > value.updatedAtTick
    || value.disclosure !== CORE_WILDLIFE_CARCASS_DISCLOSURE
  ) return null;
  const expectedId = stableCoreWildlifeCarcassId(
    value.sourceMortalityEventId,
    value.sourceActorId,
  );
  if (expectedId === null || value.carcassId !== expectedId) return null;

  const remaining = value.remainingResourceUnits;
  const consumed = value.consumedResourceUnits;
  const decayed = value.decayedResourceUnits;
  if (remaining + consumed + decayed !== value.originalResourceUnits) return null;
  const unavailableAtDecay = unavailableResourceUnits(
    value.originalResourceUnits,
    condition.decay,
  );
  if (decayed > unavailableAtDecay || consumed + decayed < unavailableAtDecay) return null;

  const claimantIsNull = value.currentClaimantActorId === null;
  const provenanceIsNull = value.claimProvenanceId === null;
  const claimedTickIsNull = value.claimedAtTick === null;
  if (
    claimantIsNull !== provenanceIsNull
    || claimantIsNull !== claimedTickIsNull
    || (!claimantIsNull && (
      !canonicalActorId(value.currentClaimantActorId)
      || value.currentClaimantActorId === value.sourceActorId
      || !canonicalId(value.claimProvenanceId)
      || !nonnegativeSafeInteger(value.claimedAtTick)
      || value.claimedAtTick < value.deathAtTick
      || value.claimedAtTick > value.updatedAtTick
    ))
  ) return null;

  const retired = value.retiredAtTick;
  if (
    (remaining === 0) !== (retired !== null)
    || (retired !== null && (
      !nonnegativeSafeInteger(retired)
      || retired < value.deathAtTick
      || retired > value.updatedAtTick
      || !claimantIsNull
    ))
  ) return null;

  return deepFreeze({
    version: CORE_WILDLIFE_CARCASS_VERSION,
    carcassId: value.carcassId,
    sourceMortalityEventId: value.sourceMortalityEventId,
    sourceActorId: value.sourceActorId,
    sourceSpecies: value.sourceSpecies,
    deathPosition: clonePosition(value.deathPosition),
    deathAtTick: value.deathAtTick,
    bodySizeUnits: value.bodySizeUnits,
    originalResourceUnits: value.originalResourceUnits,
    remainingResourceUnits: remaining,
    consumedResourceUnits: consumed,
    decayedResourceUnits: decayed,
    condition,
    currentClaimantActorId: claimantIsNull
      ? null
      : value.currentClaimantActorId as string,
    claimProvenanceId: provenanceIsNull ? null : value.claimProvenanceId as string,
    claimedAtTick: claimedTickIsNull ? null : value.claimedAtTick as number,
    retiredAtTick: retired,
    updatedAtTick: value.updatedAtTick,
    disclosure: CORE_WILDLIFE_CARCASS_DISCLOSURE,
  });
}

export function canonicalizeCoreWildlifeCarcassState(
  value: unknown,
): CoreWildlifeCarcassState | null {
  return canonicalizeCoreWildlifeCarcass(value);
}

export function serializeCoreWildlifeCarcass(value: unknown): string {
  const carcass = canonicalizeCoreWildlifeCarcass(value);
  if (carcass === null) throw new TypeError("Core wildlife carcass is malformed or incoherent");
  const encoded = stableStringify(carcass);
  if (UTF8_ENCODER.encode(encoded).byteLength > CORE_WILDLIFE_CARCASS_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Core wildlife carcass exceeds its save budget");
  }
  return encoded;
}

export function deserializeCoreWildlifeCarcass(text: unknown): CoreWildlifeCarcass | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || UTF8_ENCODER.encode(text).byteLength > CORE_WILDLIFE_CARCASS_MAX_SERIALIZED_BYTES
  ) return null;
  try {
    const carcass = canonicalizeCoreWildlifeCarcass(JSON.parse(text) as unknown);
    return carcass !== null && stableStringify(carcass) === text ? carcass : null;
  } catch {
    return null;
  }
}

/** Acquire currently unclaimed, non-retired resource custody. */
export function claimCoreWildlifeCarcass(
  value: unknown,
  requestValue: unknown,
): CoreWildlifeCarcass | null {
  const carcass = canonicalizeCoreWildlifeCarcass(value);
  const request = canonicalClaimInput(requestValue);
  if (
    carcass === null
    || request === null
    || request.atTick < carcass.updatedAtTick
    || request.actorId === carcass.sourceActorId
    || carcass.remainingResourceUnits === 0
  ) return null;
  if (carcass.currentClaimantActorId !== null) {
    return carcass.currentClaimantActorId === request.actorId
      && carcass.claimProvenanceId === request.provenanceId
      && carcass.claimedAtTick === request.atTick
      ? carcass
      : null;
  }
  return rebuildCarcass({
    ...carcass,
    currentClaimantActorId: request.actorId,
    claimProvenanceId: request.provenanceId,
    claimedAtTick: request.atTick,
    updatedAtTick: request.atTick,
  });
}

/** Only the current claimant may release custody; competitors cannot evict it. */
export function releaseCoreWildlifeCarcass(
  value: unknown,
  requestValue: unknown,
): CoreWildlifeCarcass | null {
  const carcass = canonicalizeCoreWildlifeCarcass(value);
  const request = canonicalReleaseInput(requestValue);
  if (
    carcass === null
    || request === null
    || request.atTick < carcass.updatedAtTick
    || carcass.currentClaimantActorId !== request.actorId
  ) return null;
  return rebuildCarcass({
    ...carcass,
    currentClaimantActorId: null,
    claimProvenanceId: null,
    claimedAtTick: null,
    updatedAtTick: request.atTick,
  });
}

/**
 * Consume exact whole units from the finite balance. Requests never clamp: an
 * overdraw or a non-claimant fails without a partial result.
 */
export function consumeCoreWildlifeCarcass(
  value: unknown,
  requestValue: unknown,
): CoreWildlifeCarcass | null {
  const carcass = canonicalizeCoreWildlifeCarcass(value);
  const request = canonicalConsumeInput(requestValue);
  if (
    carcass === null
    || request === null
    || request.atTick < carcass.updatedAtTick
    || carcass.currentClaimantActorId !== request.actorId
    || request.units > carcass.remainingResourceUnits
  ) return null;
  const remainingResourceUnits = carcass.remainingResourceUnits - request.units;
  const retired = remainingResourceUnits === 0;
  return rebuildCarcass({
    ...carcass,
    remainingResourceUnits,
    consumedResourceUnits: carcass.consumedResourceUnits + request.units,
    currentClaimantActorId: retired ? null : carcass.currentClaimantActorId,
    claimProvenanceId: retired ? null : carcass.claimProvenanceId,
    claimedAtTick: retired ? null : carcass.claimedAtTick,
    retiredAtTick: retired ? request.atTick : null,
    updatedAtTick: request.atTick,
  });
}

/**
 * Advance irreversible decay from the condition clock. Resource loss derives
 * from total decay progress, making one long step equivalent to equal-rate
 * shorter steps and preventing save cadence from creating biomass.
 */
export function advanceCoreWildlifeCarcassDecay(
  value: unknown,
  requestValue: unknown,
): CoreWildlifeCarcass | null {
  const carcass = canonicalizeCoreWildlifeCarcass(value);
  const request = canonicalDecayInput(requestValue);
  if (
    carcass === null
    || request === null
    || request.atTick < carcass.updatedAtTick
  ) return null;
  const elapsedTicks = request.atTick - carcass.condition.updatedAtTick;
  const decayGain = boundedProduct(
    elapsedTicks,
    request.decayUnitsPerTick,
    CORE_WILDLIFE_CARCASS_CONDITION_SCALE - carcass.condition.decay,
  );
  const decay = carcass.condition.decay + decayGain;
  const unavailable = unavailableResourceUnits(carcass.originalResourceUnits, decay);
  const requiredDecayLoss = Math.max(0, unavailable - carcass.consumedResourceUnits);
  const decayedResourceUnits = Math.max(
    carcass.decayedResourceUnits,
    requiredDecayLoss,
  );
  const remainingResourceUnits = carcass.originalResourceUnits
    - carcass.consumedResourceUnits
    - decayedResourceUnits;
  const newlyRetired = remainingResourceUnits === 0 && carcass.retiredAtTick === null;
  const retired = remainingResourceUnits === 0;
  return rebuildCarcass({
    ...carcass,
    remainingResourceUnits,
    decayedResourceUnits,
    condition: {
      temperature: request.temperature,
      decay,
      updatedAtTick: request.atTick,
    },
    currentClaimantActorId: retired ? null : carcass.currentClaimantActorId,
    claimProvenanceId: retired ? null : carcass.claimProvenanceId,
    claimedAtTick: retired ? null : carcass.claimedAtTick,
    retiredAtTick: newlyRetired ? request.atTick : carcass.retiredAtTick,
    updatedAtTick: request.atTick,
  });
}

/** Short verb retained for callers that treat decay as the transition name. */
export const decayCoreWildlifeCarcass = advanceCoreWildlifeCarcassDecay;

function canonicalDeathEvent(value: unknown): CoreWildlifeMortalityEvent | null {
  const event = canonicalizeCoreWildlifeMortalityEvent(value);
  return event !== null && event.outcome === "death" && event.healthAfter === 0
    ? event
    : null;
}

function canonicalCondition(value: unknown): CoreWildlifeCarcassCondition | null {
  if (!plainRecord(value) || !exactKeys(value, ["decay", "temperature", "updatedAtTick"])) {
    return null;
  }
  if (
    !scaledUnit(value.decay)
    || !scaledUnit(value.temperature)
    || !nonnegativeSafeInteger(value.updatedAtTick)
  ) return null;
  return Object.freeze({
    temperature: value.temperature,
    decay: value.decay,
    updatedAtTick: value.updatedAtTick,
  });
}

function canonicalClaimInput(value: unknown): ClaimCoreWildlifeCarcassInput | null {
  if (!plainRecord(value) || !exactKeys(value, ["actorId", "atTick", "provenanceId"])) {
    return null;
  }
  if (
    !canonicalActorId(value.actorId)
    || !canonicalId(value.provenanceId)
    || !nonnegativeSafeInteger(value.atTick)
  ) return null;
  return Object.freeze({
    actorId: value.actorId,
    provenanceId: value.provenanceId,
    atTick: value.atTick,
  });
}

function canonicalReleaseInput(value: unknown): ReleaseCoreWildlifeCarcassInput | null {
  if (!plainRecord(value) || !exactKeys(value, ["actorId", "atTick"])) return null;
  if (!canonicalActorId(value.actorId) || !nonnegativeSafeInteger(value.atTick)) return null;
  return Object.freeze({ actorId: value.actorId, atTick: value.atTick });
}

function canonicalConsumeInput(value: unknown): ConsumeCoreWildlifeCarcassInput | null {
  if (!plainRecord(value) || !exactKeys(value, ["actorId", "atTick", "units"])) return null;
  if (
    !canonicalActorId(value.actorId)
    || !nonnegativeSafeInteger(value.atTick)
    || !positiveBoundedInteger(value.units, CORE_WILDLIFE_CARCASS_MAX_RESOURCE_UNITS)
  ) return null;
  return Object.freeze({
    actorId: value.actorId,
    units: value.units,
    atTick: value.atTick,
  });
}

function canonicalDecayInput(
  value: unknown,
): AdvanceCoreWildlifeCarcassDecayInput | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "atTick",
    "decayUnitsPerTick",
    "temperature",
  ])) return null;
  if (
    !nonnegativeSafeInteger(value.atTick)
    || !scaledUnit(value.temperature)
    || !scaledUnit(value.decayUnitsPerTick)
  ) return null;
  return Object.freeze({
    atTick: value.atTick,
    temperature: value.temperature,
    decayUnitsPerTick: value.decayUnitsPerTick,
  });
}

function rebuildCarcass(value: unknown): CoreWildlifeCarcass {
  const carcass = canonicalizeCoreWildlifeCarcass(value);
  if (carcass === null) throw new Error("Internal carcass transition violated conservation");
  return carcass;
}

function unavailableResourceUnits(original: number, decay: number): number {
  return Number(
    BigInt(original) * BigInt(decay) / BigInt(CORE_WILDLIFE_CARCASS_CONDITION_SCALE),
  );
}

function boundedProduct(left: number, right: number, maximum: number): number {
  const product = BigInt(left) * BigInt(right);
  return Number(product > BigInt(maximum) ? BigInt(maximum) : product);
}

function clonePosition(position: WorldPosition): WorldPosition {
  return createWorldPosition(
    { x: position.region.x, y: position.region.y },
    position.localX,
    position.localY,
  );
}

function coreWildlifeSpecies(value: unknown): value is CoreWildlifeSpecies {
  return CORE_WILDLIFE_SPECIES.includes(value as CoreWildlifeSpecies);
}

function canonicalActorId(value: unknown): value is string {
  return canonicalId(value);
}

function canonicalId(value: unknown): value is string {
  return typeof value === "string"
    && value === value.normalize("NFC")
    && ID_PATTERN.test(value);
}

function boundedResourcePart(value: unknown, original: number): value is number {
  return nonnegativeSafeInteger(value) && value <= original;
}

function scaledUnit(value: unknown): value is number {
  return nonnegativeSafeInteger(value)
    && value <= CORE_WILDLIFE_CARCASS_CONDITION_SCALE;
}

function positiveBoundedInteger(value: unknown, maximum: number): value is number {
  return nonnegativeSafeInteger(value) && value > 0 && value <= maximum;
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

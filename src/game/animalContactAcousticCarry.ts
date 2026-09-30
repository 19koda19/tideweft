import { hashCanonical } from "../sim/util";
import type { DogSize } from "../sim/dogIdentity";
import { MAX_LIVING_ACTOR_LOCOMOTION_STEP_UNITS } from "./livingActorLocomotion";
import {
  HUMAN_PERCEPTION_MAX_PHYSICAL_SOUND_SAMPLES,
  createPhysicalSoundSample,
  type PhysicalSoundSample,
} from "./humanPerception";
import {
  ACOUSTIC_MATERIAL_CLASSES,
  animalContactAcousticEvent,
  type WorldAcousticEvent,
} from "./worldAcoustics";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  isWorldPosition,
  worldPositionDelta,
  type WorldPosition,
} from "./worldPosition";

/**
 * Event-time causal carry for committed animal/body contact sounds.
 *
 * Version one deliberately supports only the currently live dog bodies.
 * Future body classes should extend the causal producer contract instead of
 * smuggling different semantics through this record.
 */
export const ANIMAL_CONTACT_ACOUSTIC_CARRY_VERSION = 1 as const;
export const ANIMAL_CONTACT_ACOUSTIC_CARRY_MAX_RECORDS =
  HUMAN_PERCEPTION_MAX_PHYSICAL_SOUND_SAMPLES;

const RECORD_KEYS = Object.freeze([
  "beforePosition",
  "event",
  "version",
] as const);
const CARRY_KEYS = Object.freeze(["records", "version"] as const);
const ACOUSTIC_MATERIAL_CLASS_SET = new Set<unknown>(ACOUSTIC_MATERIAL_CLASSES);
const ANIMAL_CONTACT_SURFACE_MATERIALS = new Set<unknown>([
  "foliage",
  "sand",
  "soil",
  "stone",
  "water",
] as const);
const ANIMAL_CONTACT_BODY_SIZES = Object.freeze([
  "small",
  "medium",
  "large",
] as const);
const SOURCE_ACTOR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/;
const EVENT_KEYS = Object.freeze([
  "accessibilityRelevance",
  "action",
  "domain",
  "durationSteps",
  "eventId",
  "force",
  "intensity",
  "interrupt",
  "occurredAtTick",
  "presentationVariantSeed",
  "priority",
  "rangeUnits",
  "repetitionKey",
  "salience",
  "semanticFamily",
  "soundClass",
  "sourceCategory",
  "sourceId",
  "sourceMaterial",
  "sourcePosition",
  "surfaceMaterial",
  "textualEligibility",
  "triggerEventId",
  "version",
] as const satisfies readonly (keyof WorldAcousticEvent)[]);

export interface AnimalContactAcousticCarryRecord {
  readonly version: typeof ANIMAL_CONTACT_ACOUSTIC_CARRY_VERSION;
  /** Recorded position immediately before the committed contact-producing move. */
  readonly beforePosition: WorldPosition;
  /** Exact structured acoustic fact derived at the event tick. */
  readonly event: WorldAcousticEvent;
}

export interface AnimalContactAcousticCarry {
  readonly version: typeof ANIMAL_CONTACT_ACOUSTIC_CARRY_VERSION;
  readonly records: readonly AnimalContactAcousticCarryRecord[];
}

export interface AnimalContactAcousticCarryRecordInput {
  readonly beforePosition: WorldPosition;
  readonly event: WorldAcousticEvent;
}

export type AnimalContactAcousticBodySize =
  (typeof ANIMAL_CONTACT_BODY_SIZES)[number];

/** Bounded dog morphology projection shared by production and save replay. */
export function animalContactAcousticBodySizeForDogSize(
  size: DogSize,
): AnimalContactAcousticBodySize {
  return size === "tiny" || size === "small"
    ? "small"
    : size === "medium"
      ? "medium"
      : "large";
}

/**
 * Shared bounded gait semantics for contact-producing movement distance.
 * Current dogs can reach the slow/ordinary bands; faster future bodies reuse
 * the same threshold instead of inventing producer-local labels.
 */
export function animalContactMovementForDistance(
  movementDistance: number,
): "slow" | "ordinary" | "fast" | null {
  if (
    !Number.isFinite(movementDistance)
    || movementDistance <= 0
    || movementDistance > MAX_LIVING_ACTOR_LOCOMOTION_STEP_UNITS
  ) return null;
  return movementDistance <= WORLD_POSITION_UNITS_PER_TILE / 2
    ? "slow"
    : movementDistance <= WORLD_POSITION_UNITS_PER_TILE
      ? "ordinary"
      : "fast";
}

/**
 * Stable causal trigger owned by the committed before/after movement fact.
 * Runtime producers and save reauthentication use this same derivation.
 */
export function animalContactAcousticTriggerEventId(input: Readonly<{
  readonly sourceId: string;
  readonly beforePosition: WorldPosition;
  readonly afterPosition: WorldPosition;
  readonly occurredAtTick: number;
}>): string | null {
  if (
    !validSourceActorId(input?.sourceId)
    || !isWorldPosition(input?.beforePosition)
    || !isWorldPosition(input?.afterPosition)
    || !nonnegativeSafeInteger(input?.occurredAtTick)
  ) return null;
  let delta: ReturnType<typeof worldPositionDelta>;
  try {
    delta = worldPositionDelta(input.beforePosition, input.afterPosition);
  } catch {
    return null;
  }
  const movementDistance = Math.hypot(delta.x, delta.y);
  if (
    !Number.isFinite(movementDistance)
    || movementDistance <= 0
    || movementDistance > MAX_LIVING_ACTOR_LOCOMOTION_STEP_UNITS
  ) return null;
  return `animal-contact:${input.occurredAtTick}:${hashCanonical({
    actorId: input.sourceId,
    from: input.beforePosition,
    to: input.afterPosition,
  })}`;
}

/** Creates one deeply canonical record or rejects forged/partial authority. */
export function createAnimalContactAcousticCarryRecord(
  input: AnimalContactAcousticCarryRecordInput,
): AnimalContactAcousticCarryRecord | null {
  return canonicalizeAnimalContactAcousticCarryRecord({
    version: ANIMAL_CONTACT_ACOUSTIC_CARRY_VERSION,
    beforePosition: input?.beforePosition,
    event: input?.event,
  });
}

/**
 * Re-derives the complete acoustic event from carried event-time movement evidence.
 * A structurally plausible event is insufficient: every semantic and acoustic
 * field must match one supported body-size contact derivation exactly. Runtime
 * save admission separately binds the record to current dog authority.
 */
export function canonicalizeAnimalContactAcousticCarryRecord(
  value: unknown,
): AnimalContactAcousticCarryRecord | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, RECORD_KEYS)
    || value.version !== ANIMAL_CONTACT_ACOUSTIC_CARRY_VERSION
    || !isWorldPosition(value.beforePosition)
    || !plainRecord(value.event)
    || !exactKeys(value.event, EVENT_KEYS)
  ) return null;
  const rawEvent = value.event;
  if (
    !validSourceActorId(rawEvent.sourceId)
    || !validId(rawEvent.triggerEventId)
    || !isWorldPosition(rawEvent.sourcePosition)
    || !nonnegativeSafeInteger(rawEvent.occurredAtTick)
    || !isAcousticMaterialClass(rawEvent.surfaceMaterial)
    || !ANIMAL_CONTACT_SURFACE_MATERIALS.has(rawEvent.surfaceMaterial)
  ) return null;

  const triggerEventId = animalContactAcousticTriggerEventId({
    sourceId: rawEvent.sourceId,
    beforePosition: value.beforePosition,
    afterPosition: rawEvent.sourcePosition,
    occurredAtTick: rawEvent.occurredAtTick,
  });
  if (triggerEventId === null || rawEvent.triggerEventId !== triggerEventId) return null;

  let delta: ReturnType<typeof worldPositionDelta>;
  try {
    delta = worldPositionDelta(value.beforePosition, rawEvent.sourcePosition);
  } catch {
    return null;
  }
  const movementDistance = Math.hypot(delta.x, delta.y);
  const movement = animalContactMovementForDistance(movementDistance);
  if (movement === null) return null;
  const sourceId = rawEvent.sourceId;
  const sourcePosition = rawEvent.sourcePosition;
  const occurredAtTick = rawEvent.occurredAtTick;
  const surfaceMaterial = rawEvent.surfaceMaterial;
  const matchingEvents = ANIMAL_CONTACT_BODY_SIZES.flatMap((bodySize) => {
    const candidate = animalContactAcousticEvent({
      triggerEventId,
      sourceId,
      sourcePosition,
      occurredAtTick,
      bodySize,
      movement,
      surfaceMaterial,
    });
    return candidate !== null && exactWorldAcousticEvent(rawEvent, candidate)
      ? [candidate]
      : [];
  });
  const expected = matchingEvents[0];
  if (matchingEvents.length !== 1 || expected === undefined) return null;

  return Object.freeze({
    version: ANIMAL_CONTACT_ACOUSTIC_CARRY_VERSION,
    beforePosition: copyPosition(value.beforePosition),
    event: expected,
  });
}

/** Sole canonical empty pending-contact carry. */
export function createAnimalContactAcousticCarry(): AnimalContactAcousticCarry {
  return freezeCarry([]);
}

/**
 * Reauthenticates a bounded current-tick carry in deterministic source order.
 * It never sorts or repairs external input: noncanonical order fails closed.
 */
export function canonicalizeAnimalContactAcousticCarry(
  value: unknown,
): AnimalContactAcousticCarry | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, CARRY_KEYS)
    || value.version !== ANIMAL_CONTACT_ACOUSTIC_CARRY_VERSION
    || !Array.isArray(value.records)
    || value.records.length > ANIMAL_CONTACT_ACOUSTIC_CARRY_MAX_RECORDS
  ) return null;
  const records: AnimalContactAcousticCarryRecord[] = [];
  const eventIds = new Set<string>();
  const triggerEventIds = new Set<string>();
  const sourceIds = new Set<string>();
  let eventTick: number | null = null;
  for (let index = 0; index < value.records.length; index += 1) {
    if (!(index in value.records)) return null;
    const record = canonicalizeAnimalContactAcousticCarryRecord(value.records[index]);
    const prior = records[index - 1];
    if (
      record === null
      || eventIds.has(record.event.eventId)
      || triggerEventIds.has(record.event.triggerEventId)
      || sourceIds.has(record.event.sourceId)
      || (eventTick !== null && record.event.occurredAtTick !== eventTick)
      || (prior !== undefined && compareRecords(prior, record) >= 0)
    ) return null;
    eventTick ??= record.event.occurredAtTick;
    eventIds.add(record.event.eventId);
    triggerEventIds.add(record.event.triggerEventId);
    sourceIds.add(record.event.sourceId);
    records.push(record);
  }
  return freezeCarry(records);
}

/** Appends without reordering; producers must already follow canonical order. */
export function appendAnimalContactAcousticCarryRecord(
  carryValue: unknown,
  recordValue: unknown,
): AnimalContactAcousticCarry | null {
  const carry = canonicalizeAnimalContactAcousticCarry(carryValue);
  const record = canonicalizeAnimalContactAcousticCarryRecord(recordValue);
  const prior = carry?.records.at(-1);
  if (
    carry === null
    || record === null
    || carry.records.length >= ANIMAL_CONTACT_ACOUSTIC_CARRY_MAX_RECORDS
    || carry.records.some(({ event }) => event.sourceId === record.event.sourceId)
    || (prior !== undefined && (
      record.event.occurredAtTick !== prior.event.occurredAtTick
      || compareRecords(prior, record) >= 0
    ))
  ) return null;
  return freezeCarry([...carry.records, record]);
}

/** Projects one authenticated contact into the generic human-hearing API. */
export function physicalSoundSampleForAnimalContact(
  recordValue: unknown,
): PhysicalSoundSample | null {
  const record = canonicalizeAnimalContactAcousticCarryRecord(recordValue);
  if (record === null) return null;
  return createPhysicalSoundSample({
    acousticEventId: record.event.eventId,
    id: `pac-${hashCanonical({
      acousticEventId: record.event.eventId,
      version: ANIMAL_CONTACT_ACOUSTIC_CARRY_VERSION,
    })}`,
    position: record.event.sourcePosition,
    soundClass: record.event.soundClass,
    soundInterrupt: record.event.interrupt,
    soundLoudness: record.event.intensity,
    soundRangeUnits: record.event.rangeUnits,
    sourceActorId: record.event.sourceId,
  });
}

/** Projects an exact carry without changing identity, ordering, or authority. */
export function physicalSoundSamplesForAnimalContactCarry(
  carryValue: unknown,
): readonly PhysicalSoundSample[] | null {
  const carry = canonicalizeAnimalContactAcousticCarry(carryValue);
  if (carry === null) return null;
  const samples: PhysicalSoundSample[] = [];
  for (const record of carry.records) {
    const sample = physicalSoundSampleForAnimalContact(record);
    if (sample === null) return null;
    samples.push(sample);
  }
  return Object.freeze(samples);
}

function freezeCarry(
  records: readonly AnimalContactAcousticCarryRecord[],
): AnimalContactAcousticCarry {
  return Object.freeze({
    version: ANIMAL_CONTACT_ACOUSTIC_CARRY_VERSION,
    records: Object.freeze([...records]),
  });
}

function copyPosition(position: WorldPosition): WorldPosition {
  return createWorldPosition(position.region, position.localX, position.localY);
}

function compareRecords(
  left: AnimalContactAcousticCarryRecord,
  right: AnimalContactAcousticCarryRecord,
): number {
  return left.event.occurredAtTick - right.event.occurredAtTick
    || compareText(left.event.sourceId, right.event.sourceId)
    || compareText(left.event.eventId, right.event.eventId);
}

function exactWorldAcousticEvent(
  value: Readonly<Record<string, unknown>>,
  expected: WorldAcousticEvent,
): boolean {
  for (const key of EVENT_KEYS) {
    if (key === "sourcePosition") {
      if (!samePosition(value.sourcePosition, expected.sourcePosition)) return false;
    } else if (!Object.is(value[key], expected[key])) return false;
  }
  return true;
}

function samePosition(value: unknown, expected: WorldPosition): boolean {
  return isWorldPosition(value)
    && value.region.x === expected.region.x
    && value.region.y === expected.region.y
    && value.localX === expected.localX
    && value.localY === expected.localY;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort(compareText);
  const wanted = [...expected].sort(compareText);
  return keys.length === wanted.length
    && keys.every((key, index) => key === wanted[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) >= 0
    && !Object.is(value, -0);
}

function isAcousticMaterialClass(
  value: unknown,
): value is (typeof ACOUSTIC_MATERIAL_CLASSES)[number] {
  return ACOUSTIC_MATERIAL_CLASS_SET.has(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 192
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function validSourceActorId(value: unknown): value is string {
  return typeof value === "string" && SOURCE_ACTOR_ID_PATTERN.test(value);
}

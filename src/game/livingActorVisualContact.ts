import {
  ACTOR_PERCEPTION_SCALE,
  canonicalizeActorObservations,
  createActorObservation,
  type ActorObservation,
} from "../sim/actorPerception";
import { hashCanonical } from "../sim/util";
import {
  isLivingActorAddress,
  type LivingActorAddress,
} from "./livingActor";

/**
 * Species-neutral bridge from an authoritative line-of-sight evaluation into
 * actor cognition. This module never performs detection: callers must supply
 * the bounded evidence produced by geometry, light, weather, and salience.
 */
export const LIVING_ACTOR_VISUAL_CONTACT_VERSION = 1 as const;
export const MAX_LIVING_ACTOR_VISUAL_CONTACTS_PER_FRAME = 128 as const;

export type LivingActorLineOfSight = "blocked" | "partial" | "clear";

export interface LivingActorVisualContactEvidence {
  readonly version: typeof LIVING_ACTOR_VISUAL_CONTACT_VERSION;
  /** Stable evidence identity, not a renderer index. */
  readonly evidenceId: string;
  /** The perceived class already established by the sensory evaluation. */
  readonly perceivedClass: string;
  readonly subject: LivingActorAddress;
  readonly lineOfSight: LivingActorLineOfSight;
  /** Final fixed-point visibility confidence after all occlusion/weather laws. */
  readonly confidence: number;
  /** Fixed-point attentional salience of this contact. */
  readonly salience: number;
  /** True only when the supplied visual evidence supports stable identity. */
  readonly identityEligible: boolean;
}

export interface LivingActorVisualContactFrame {
  readonly version: typeof LIVING_ACTOR_VISUAL_CONTACT_VERSION;
  readonly observer: LivingActorAddress;
  readonly tick: number;
  readonly contacts: readonly LivingActorVisualContactEvidence[];
}

const EVIDENCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/u;
const PERCEIVED_CLASS_PATTERN = /^[a-z][a-z0-9-]{0,63}$/u;
const EMPTY_OBSERVATIONS: readonly ActorObservation[] = Object.freeze([]);

/**
 * Converts explicit visual-contact evidence into the common cognition model.
 * It does not derive LOS from actor positions and does not infer class or
 * identity from the subject's species. Malformed frames fail closed as null.
 */
export function collectLivingActorVisualContactObservations(
  value: unknown,
): readonly ActorObservation[] | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "contacts",
    "observer",
    "tick",
    "version",
  ])) return null;
  if (
    value.version !== LIVING_ACTOR_VISUAL_CONTACT_VERSION
    || !isLivingActorAddress(value.observer)
    || !nonnegativeSafeInteger(value.tick)
    || !Array.isArray(value.contacts)
    || value.contacts.length > MAX_LIVING_ACTOR_VISUAL_CONTACTS_PER_FRAME
  ) return null;

  const observer = value.observer;
  const evidenceIds = new Set<string>();
  const subjectIds = new Set<string>();
  const observations: ActorObservation[] = [];

  for (const raw of value.contacts as readonly unknown[]) {
    const contact = canonicalContact(raw);
    if (
      contact === null
      || contact.subject.actorId === observer.actorId
      || evidenceIds.has(contact.evidenceId)
      || subjectIds.has(contact.subject.actorId)
    ) return null;
    evidenceIds.add(contact.evidenceId);
    subjectIds.add(contact.subject.actorId);

    if (contact.lineOfSight === "blocked" || contact.confidence === 0) continue;
    const identified = contact.identityEligible;
    const observation = createActorObservation({
      id: visualObservationId(observer.actorId, contact.evidenceId, value.tick),
      observerId: observer.actorId,
      observedAtTick: value.tick,
      channel: "vision",
      perceivedClass: contact.perceivedClass,
      subjectId: identified ? contact.subject.actorId : null,
      area: { center: contact.subject.position, radiusUnits: 0 },
      confidence: contact.confidence,
      salience: contact.salience,
      identification: identified ? "identified" : "classified",
      interrupt: "none",
    });
    if (observation === null) return null;
    observations.push(observation);
  }

  if (observations.length === 0) return EMPTY_OBSERVATIONS;
  const canonical = canonicalizeActorObservations(observations);
  return canonical.length === observations.length ? canonical : null;
}

function canonicalContact(value: unknown): LivingActorVisualContactEvidence | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "confidence",
    "evidenceId",
    "identityEligible",
    "lineOfSight",
    "perceivedClass",
    "salience",
    "subject",
    "version",
  ])) return null;
  if (
    value.version !== LIVING_ACTOR_VISUAL_CONTACT_VERSION
    || typeof value.evidenceId !== "string"
    || !EVIDENCE_ID_PATTERN.test(value.evidenceId)
    || typeof value.perceivedClass !== "string"
    || !PERCEIVED_CLASS_PATTERN.test(value.perceivedClass)
    || !isLivingActorAddress(value.subject)
    || !isLineOfSight(value.lineOfSight)
    || !scaledUnit(value.confidence)
    || !scaledUnit(value.salience)
    || typeof value.identityEligible !== "boolean"
  ) return null;
  // An occluded/nonexistent contact cannot lawfully assert confidence or ID.
  if (value.lineOfSight === "blocked" && (
    value.confidence !== 0
    || value.salience !== 0
    || value.identityEligible
  )) return null;
  // Partial silhouettes can be classified, but cannot expose persistent ID.
  if (value.lineOfSight !== "clear" && value.identityEligible) return null;
  // Stable identity may not be asserted by a zero-confidence contact.
  if (value.identityEligible && value.confidence === 0) return null;

  return Object.freeze({
    version: LIVING_ACTOR_VISUAL_CONTACT_VERSION,
    evidenceId: value.evidenceId,
    perceivedClass: value.perceivedClass,
    subject: value.subject,
    lineOfSight: value.lineOfSight,
    confidence: value.confidence,
    salience: value.salience,
    identityEligible: value.identityEligible,
  });
}

function visualObservationId(observerId: string, evidenceId: string, tick: number): string {
  return `living-vision:${hashCanonical({ evidenceId, observerId, tick })}`;
}

function isLineOfSight(value: unknown): value is LivingActorLineOfSight {
  return value === "blocked" || value === "partial" || value === "clear";
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function scaledUnit(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value <= ACTOR_PERCEPTION_SCALE;
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

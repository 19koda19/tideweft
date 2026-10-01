import { mixUint32 } from "../sim/rng";
import { FIXED_POINT } from "../sim/types";
import { hashCanonical } from "../sim/util";
import {
  FALL_RISK_CAUSE_ORDER,
  type FallRiskCauseCode,
} from "./fallRisk";
import type { TraversalIncident } from "./traversalFeedback";
import { GEAR_SERVICE_WEAR } from "./gearEffects";
import type { GearServiceWearReceipt } from "./player";
import {
  createWorldPosition,
  isWorldPosition,
  WORLD_POSITION_UNITS_PER_TILE,
  type WorldPosition,
} from "./worldPosition";

/** Renderer-neutral structured sound emitted by a committed world event. */
export const WORLD_ACOUSTIC_EVENT_VERSION = 1 as const;

export const WORLD_ACOUSTIC_DOMAINS = Object.freeze([
  "traversal",
  "actor-vocalization",
  "animal-contact",
  "object-contact",
  "tool-material",
  "violence",
  "vehicle",
] as const);
export type WorldAcousticDomain = (typeof WORLD_ACOUSTIC_DOMAINS)[number];

export const ACOUSTIC_SOURCE_CATEGORIES = Object.freeze([
  "human",
  "animal",
  "supernatural",
  "object",
  "tool",
  "vehicle",
  "world",
] as const);
export type AcousticSourceCategory = (typeof ACOUSTIC_SOURCE_CATEGORIES)[number];

export const ACOUSTIC_ACTIONS = Object.freeze([
  "foot-contact",
  "stumble",
  "slide",
  "slip",
  "sweep",
  "land",
  "brush",
  "collision",
  "cargo-shift",
  "tool-contact",
  "strain",
  "break",
  "vocalize",
] as const);
export type AcousticAction = (typeof ACOUSTIC_ACTIONS)[number];

export const ACOUSTIC_MATERIAL_CLASSES = Object.freeze([
  "body",
  "stone",
  "water",
  "foliage",
  "wood",
  "metal",
  "soil",
  "sand",
  "snow",
  "rope",
  "cargo",
  "mixed",
  "unknown",
] as const);
export type AcousticMaterialClass = (typeof ACOUSTIC_MATERIAL_CLASSES)[number];

export const ACOUSTIC_SEMANTIC_FAMILIES = Object.freeze([
  "scrape",
  "splash",
  "slosh",
  "rustle",
  "thud",
  "clatter",
  "creak",
  "crack",
  "skitter",
  "chorus",
  "vocalization",
  "other",
] as const);
export type AcousticSemanticFamily = (typeof ACOUSTIC_SEMANTIC_FAMILIES)[number];

export type AcousticForceBand = "light" | "moderate" | "heavy";
export type AcousticTextEligibility = "audio-only" | "salience-gated";
export type AcousticAccessibilityRelevance = "routine" | "informative" | "urgent";
export type AcousticInterrupt = "none" | "strong";
export type PhysicalSoundClass = `physical-${AcousticSemanticFamily}`;
export type WorldAcousticSoundClass = PhysicalSoundClass | "animal-call";

/** Closed world-acoustic vocabulary shared by producers and hearing consumers. */
export const WORLD_ACOUSTIC_SOUND_CLASSES: readonly WorldAcousticSoundClass[] = Object.freeze([
  ...ACOUSTIC_SEMANTIC_FAMILIES.map(
    (family): PhysicalSoundClass => `physical-${family}`,
  ),
  "animal-call",
]);
const WORLD_ACOUSTIC_SOUND_CLASS_SET = new Set<unknown>(WORLD_ACOUSTIC_SOUND_CLASSES);

export function isWorldAcousticSoundClass(
  value: unknown,
): value is WorldAcousticSoundClass {
  return WORLD_ACOUSTIC_SOUND_CLASS_SET.has(value);
}

/**
 * One immutable source event. It contains no prose and makes no layout choice;
 * audio, hearing, captions, and actor attention can consume the same fact.
 */
export interface WorldAcousticEvent {
  readonly version: typeof WORLD_ACOUSTIC_EVENT_VERSION;
  readonly eventId: string;
  readonly triggerEventId: string;
  readonly domain: WorldAcousticDomain;
  readonly sourceId: string;
  readonly sourceCategory: AcousticSourceCategory;
  readonly sourcePosition: WorldPosition;
  readonly occurredAtTick: number;
  readonly action: AcousticAction;
  readonly sourceMaterial: AcousticMaterialClass;
  readonly surfaceMaterial: AcousticMaterialClass;
  readonly semanticFamily: AcousticSemanticFamily;
  /** Fixed-point 0..1 physical acoustic intensity. */
  readonly intensity: number;
  readonly force: AcousticForceBand;
  readonly rangeUnits: number;
  readonly durationSteps: number;
  readonly soundClass: WorldAcousticSoundClass;
  readonly interrupt: AcousticInterrupt;
  readonly priority: number;
  readonly salience: number;
  readonly repetitionKey: string;
  readonly textualEligibility: AcousticTextEligibility;
  readonly accessibilityRelevance: AcousticAccessibilityRelevance;
  /** Stable presentation variation only; never event identity. */
  readonly presentationVariantSeed: number;
}

export interface WorldAcousticEventInput {
  readonly triggerEventId: string;
  readonly domain: WorldAcousticDomain;
  readonly sourceId: string;
  readonly sourceCategory: AcousticSourceCategory;
  readonly sourcePosition: WorldPosition;
  readonly occurredAtTick: number;
  readonly action: AcousticAction;
  readonly sourceMaterial: AcousticMaterialClass;
  readonly surfaceMaterial: AcousticMaterialClass;
  readonly semanticFamily: AcousticSemanticFamily;
  /** Optional perception class override for non-contact acoustic semantics. */
  readonly soundClass?: WorldAcousticSoundClass;
  /** Optional semantic interrupt policy; loudness remains independent authority. */
  readonly interrupt?: AcousticInterrupt;
  readonly intensity: number;
  readonly rangeUnits: number;
  readonly durationSteps: number;
  readonly priority: number;
  readonly salience: number;
  readonly repetitionKey: string;
  readonly textualEligibility: AcousticTextEligibility;
  readonly accessibilityRelevance: AcousticAccessibilityRelevance;
  readonly variantSeed: number;
}

export interface TraversalAcousticEventInput {
  readonly incident: TraversalIncident;
  readonly sourceId: string;
  readonly sourcePosition: WorldPosition;
  readonly occurredAtTick: number;
}

export interface CargoImpactAcousticEventInput {
  /** The committed cargo mutation/separation event, never a presentation ID. */
  readonly triggerEventId: string;
  readonly sourceId: string;
  readonly sourcePosition: WorldPosition;
  readonly occurredAtTick: number;
  readonly cargoShock: number;
  readonly cargoKind: "gear" | "other";
  readonly surfaceMaterial: AcousticMaterialClass;
}

export interface AnimalContactAcousticEventInput {
  readonly triggerEventId: string;
  readonly sourceId: string;
  readonly sourcePosition: WorldPosition;
  readonly occurredAtTick: number;
  readonly bodySize: "small" | "medium" | "large";
  readonly movement: "slow" | "ordinary" | "fast";
  readonly surfaceMaterial: AcousticMaterialClass;
}

export interface CarriedGearBreakAcousticEventInput {
  readonly receipt: GearServiceWearReceipt;
  readonly sourcePosition: WorldPosition;
  readonly occurredAtTick: number;
}

interface TraversalAcousticSemantics {
  readonly action: AcousticAction;
  readonly surfaceMaterial: AcousticMaterialClass;
  readonly semanticFamily: AcousticSemanticFamily;
  readonly intensity: number;
  readonly rangeTiles: number;
  readonly durationSteps: number;
  readonly priority: number;
  readonly salience: number;
  readonly accessibilityRelevance: AcousticAccessibilityRelevance;
}

const FALL_RISK_CAUSES = new Set<unknown>(FALL_RISK_CAUSE_ORDER);
const TRAVERSAL_KINDS = new Set<unknown>([
  "stumble",
  "fall",
  "sweep",
  "cargo-impact",
  "recovery",
]);
const TRAVERSAL_CUES = new Set<unknown>([
  "stumble",
  "fall",
  "impact",
  "sweep",
  "recover",
]);

/**
 * Creates one validated acoustic event. Identity excludes prose, position,
 * timing, and presentation variation: the committed trigger and source own it.
 */
export function createWorldAcousticEvent(
  input: WorldAcousticEventInput,
): WorldAcousticEvent | null {
  if (
    !validId(input.triggerEventId, 192)
    || !WORLD_ACOUSTIC_DOMAINS.includes(input.domain)
    || !validId(input.sourceId, 192)
    || !ACOUSTIC_SOURCE_CATEGORIES.includes(input.sourceCategory)
    || !isWorldPosition(input.sourcePosition)
    || !nonnegativeSafeInteger(input.occurredAtTick)
    || !ACOUSTIC_ACTIONS.includes(input.action)
    || !ACOUSTIC_MATERIAL_CLASSES.includes(input.sourceMaterial)
    || !ACOUSTIC_MATERIAL_CLASSES.includes(input.surfaceMaterial)
    || !ACOUSTIC_SEMANTIC_FAMILIES.includes(input.semanticFamily)
    || (input.soundClass !== undefined && !isWorldAcousticSoundClass(input.soundClass))
    || !soundClassMatchesSemantics(input)
    || (input.interrupt !== undefined
      && input.interrupt !== "none"
      && input.interrupt !== "strong")
    || !fixedUnit(input.intensity)
    || !positiveSafeInteger(input.rangeUnits)
    || !positiveSafeInteger(input.durationSteps)
    || input.durationSteps > 120
    || !fixedUnit(input.priority)
    || !fixedUnit(input.salience)
    || !validId(input.repetitionKey, 192)
    || (input.textualEligibility !== "audio-only"
      && input.textualEligibility !== "salience-gated")
    || (input.accessibilityRelevance !== "routine"
      && input.accessibilityRelevance !== "informative"
      && input.accessibilityRelevance !== "urgent")
    || !uint32(input.variantSeed)
  ) return null;

  const identityHash = hashCanonical({
    domain: input.domain,
    sourceId: input.sourceId,
    triggerEventId: input.triggerEventId,
    version: WORLD_ACOUSTIC_EVENT_VERSION,
  });
  const eventId = `acoustic:${input.domain}:${identityHash}`;
  const familyHash = Number.parseInt(
    hashCanonical(input.semanticFamily).slice(0, 8),
    16,
  ) >>> 0;
  const presentationVariantSeed = mixUint32(input.variantSeed ^ familyHash);
  const position = createWorldPosition(
    input.sourcePosition.region,
    input.sourcePosition.localX,
    input.sourcePosition.localY,
  );
  return Object.freeze({
    version: WORLD_ACOUSTIC_EVENT_VERSION,
    eventId,
    triggerEventId: input.triggerEventId,
    domain: input.domain,
    sourceId: input.sourceId,
    sourceCategory: input.sourceCategory,
    sourcePosition: position,
    occurredAtTick: input.occurredAtTick,
    action: input.action,
    sourceMaterial: input.sourceMaterial,
    surfaceMaterial: input.surfaceMaterial,
    semanticFamily: input.semanticFamily,
    intensity: input.intensity,
    force: forceBand(input.intensity),
    rangeUnits: input.rangeUnits,
    durationSteps: input.durationSteps,
    soundClass: input.soundClass ?? `physical-${input.semanticFamily}`,
    interrupt: input.interrupt ?? (input.intensity >= 700_000 ? "strong" : "none"),
    priority: input.priority,
    salience: input.salience,
    repetitionKey: input.repetitionKey,
    textualEligibility: input.textualEligibility,
    accessibilityRelevance: input.accessibilityRelevance,
    presentationVariantSeed,
  });
}

function soundClassMatchesSemantics(input: WorldAcousticEventInput): boolean {
  if (input.semanticFamily === "chorus") {
    return input.soundClass === "animal-call"
      && input.domain === "actor-vocalization"
      && input.sourceCategory === "animal"
      && input.action === "vocalize";
  }
  if (input.soundClass === undefined) return true;
  if (input.soundClass === "animal-call") {
    return input.domain === "actor-vocalization"
      && input.sourceCategory === "animal"
      && input.action === "vocalize"
      && input.semanticFamily === "vocalization";
  }
  return input.soundClass === `physical-${input.semanticFamily}`;
}

/**
 * Bridges the existing persistent traversal incident into shared acoustics.
 * `incident.label` is intentionally never inspected: it is legacy display
 * prose, not causal or semantic authority.
 */
export function traversalIncidentAcousticEvent(
  input: TraversalAcousticEventInput,
): WorldAcousticEvent | null {
  if (!validTraversalIncidentAuthority(input.incident)) return null;
  const semantics = traversalSemantics(
    input.incident.primaryCause,
    input.incident.cue,
  );
  const repetitionKey = `acoustic-repeat:${hashCanonical({
    semanticFamily: semantics.semanticFamily,
    sourceId: input.sourceId,
    surfaceMaterial: semantics.surfaceMaterial,
  })}`;
  return createWorldAcousticEvent({
    triggerEventId: input.incident.id,
    domain: "traversal",
    sourceId: input.sourceId,
    sourceCategory: "human",
    sourcePosition: input.sourcePosition,
    occurredAtTick: input.occurredAtTick,
    action: semantics.action,
    sourceMaterial: "body",
    surfaceMaterial: semantics.surfaceMaterial,
    semanticFamily: semantics.semanticFamily,
    intensity: semantics.intensity,
    rangeUnits: semantics.rangeTiles * WORLD_POSITION_UNITS_PER_TILE,
    durationSteps: semantics.durationSteps,
    priority: semantics.priority,
    salience: semantics.salience,
    repetitionKey,
    textualEligibility: "salience-gated",
    accessibilityRelevance: semantics.accessibilityRelevance,
    variantSeed: input.incident.variantSeed,
  });
}

/**
 * Bridges a committed physical-cargo impact into the same audible world as the
 * body impact that caused it. Cargo identity and shock come from the conserved
 * transaction; no renderer or animation fabricates the contact.
 */
export function cargoImpactAcousticEvent(
  input: CargoImpactAcousticEventInput,
): WorldAcousticEvent | null {
  if (!fixedUnit(input.cargoShock) || input.cargoShock <= 0) return null;
  const semanticFamily: AcousticSemanticFamily = input.surfaceMaterial === "water"
    ? "splash"
    : input.cargoKind === "gear"
      ? "clatter"
      : "thud";
  const intensity = Math.min(900_000, Math.max(420_000, input.cargoShock));
  const priority = Math.min(740_000, 420_000 + Math.trunc(input.cargoShock / 3));
  const salience = Math.min(880_000, 480_000 + Math.trunc(input.cargoShock / 2));
  const variantSeed = Number.parseInt(hashCanonical({
    sourceId: input.sourceId,
    triggerEventId: input.triggerEventId,
  }).slice(0, 8), 16) >>> 0;
  return createWorldAcousticEvent({
    triggerEventId: input.triggerEventId,
    domain: "object-contact",
    sourceId: input.sourceId,
    sourceCategory: "object",
    sourcePosition: input.sourcePosition,
    occurredAtTick: input.occurredAtTick,
    action: "cargo-shift",
    sourceMaterial: "cargo",
    surfaceMaterial: input.surfaceMaterial,
    semanticFamily,
    intensity,
    rangeUnits: Math.min(
      22,
      12 + Math.round(input.cargoShock / 100_000),
    ) * WORLD_POSITION_UNITS_PER_TILE,
    durationSteps: 3,
    priority,
    salience,
    repetitionKey: `cargo-contact:${input.sourceId}:${input.surfaceMaterial}:${semanticFamily}`,
    textualEligibility: "salience-gated",
    accessibilityRelevance: input.cargoShock >= 700_000 ? "urgent" : "informative",
    variantSeed,
  });
}

/** Shared body/surface semantics for a committed animal movement contact. */
export function animalContactAcousticEvent(
  input: AnimalContactAcousticEventInput,
): WorldAcousticEvent | null {
  if (
    !(["small", "medium", "large"] as const).includes(input.bodySize)
    || !(["slow", "ordinary", "fast"] as const).includes(input.movement)
  ) return null;
  const semanticFamily: AcousticSemanticFamily = input.surfaceMaterial === "water"
    ? input.movement === "slow" ? "slosh" : "splash"
    : input.surfaceMaterial === "foliage"
      ? "rustle"
      : input.bodySize === "small"
        ? "skitter"
        : input.bodySize === "large"
          ? "thud"
          : "scrape";
  const bodyIntensity = input.bodySize === "large"
    ? 580_000
    : input.bodySize === "medium"
      ? 380_000
      : 220_000;
  const movementIntensity = input.movement === "fast"
    ? 180_000
    : input.movement === "ordinary"
      ? 70_000
      : 0;
  const surfaceIntensity = input.surfaceMaterial === "water"
    ? 90_000
    : input.surfaceMaterial === "foliage"
      ? 40_000
      : 0;
  const intensity = Math.min(
    900_000,
    bodyIntensity + movementIntensity + surfaceIntensity,
  );
  const salientSurface = input.surfaceMaterial === "water"
    || input.surfaceMaterial === "foliage";
  const visibleText = salientSurface
    || input.movement === "fast"
    || input.bodySize === "large";
  const variantSeed = Number.parseInt(hashCanonical({
    sourceId: input.sourceId,
    triggerEventId: input.triggerEventId,
  }).slice(0, 8), 16) >>> 0;
  return createWorldAcousticEvent({
    triggerEventId: input.triggerEventId,
    domain: "animal-contact",
    sourceId: input.sourceId,
    sourceCategory: "animal",
    sourcePosition: input.sourcePosition,
    occurredAtTick: input.occurredAtTick,
    action: input.surfaceMaterial === "foliage" ? "brush" : "foot-contact",
    sourceMaterial: "body",
    surfaceMaterial: input.surfaceMaterial,
    semanticFamily,
    intensity,
    rangeUnits: (input.bodySize === "large" ? 20 : input.bodySize === "medium" ? 14 : 8)
      * WORLD_POSITION_UNITS_PER_TILE,
    durationSteps: salientSurface ? 5 : 3,
    priority: Math.min(650_000, 300_000 + Math.trunc(intensity / 2)),
    salience: visibleText ? Math.min(780_000, 360_000 + intensity) : 300_000,
    repetitionKey: `animal-contact:${input.sourceId}:${input.surfaceMaterial}:${semanticFamily}`,
    textualEligibility: visibleText ? "salience-gated" : "audio-only",
    accessibilityRelevance: visibleText ? "informative" : "routine",
    variantSeed,
  });
}

/**
 * Representative live tool/material bridge for a ridge cleat that actually
 * reaches zero condition while supplying ridge grip. Ordinary wear remains
 * quiet; the committed gear transaction, not animation, owns this event.
 */
export function carriedGearBreakAcousticEvent(
  input: CarriedGearBreakAcousticEventInput,
): WorldAcousticEvent | null {
  const { receipt } = input;
  if (
    !receipt
    || !positiveSafeInteger(receipt.gearId)
    || receipt.kind !== "ridge-cleats"
    || receipt.benefit !== "ridge-grip"
    || !positiveSafeInteger(receipt.conditionBefore)
    || receipt.conditionBefore > GEAR_SERVICE_WEAR["ridge-cleats"]
    || receipt.conditionAfter !== 0
    || receipt.conditionSpent !== receipt.conditionBefore
  ) return null;
  const triggerEventId = `gear-service-break:${hashCanonical({
    benefit: receipt.benefit,
    conditionBefore: receipt.conditionBefore,
    gearId: receipt.gearId,
    kind: receipt.kind,
    occurredAtTick: input.occurredAtTick,
  })}`;
  const variantSeed = Number.parseInt(
    hashCanonical({ source: `gear:${receipt.gearId}`, triggerEventId }).slice(0, 8),
    16,
  ) >>> 0;
  return createWorldAcousticEvent({
    triggerEventId,
    domain: "tool-material",
    sourceId: `gear:${receipt.gearId}`,
    sourceCategory: "tool",
    sourcePosition: input.sourcePosition,
    occurredAtTick: input.occurredAtTick,
    action: "break",
    sourceMaterial: "mixed",
    surfaceMaterial: "stone",
    semanticFamily: "crack",
    intensity: 620_000,
    rangeUnits: 16 * WORLD_POSITION_UNITS_PER_TILE,
    durationSteps: 3,
    priority: 600_000,
    salience: 760_000,
    repetitionKey: `gear-break:${receipt.gearId}`,
    textualEligibility: "salience-gated",
    accessibilityRelevance: "informative",
    variantSeed,
  });
}

/** Stable bounded variant selection for later authored semantic text/audio pools. */
export function acousticVariantIndex(
  event: Pick<WorldAcousticEvent, "presentationVariantSeed">,
  variantCount: number,
): number | null {
  return uint32(event.presentationVariantSeed)
    && positiveSafeInteger(variantCount)
    && variantCount <= 0x1_0000_0000
    ? event.presentationVariantSeed % variantCount
    : null;
}

function traversalSemantics(
  cause: FallRiskCauseCode,
  cue: TraversalIncident["cue"],
): TraversalAcousticSemantics {
  const surfaceMaterial = traversalSurface(cause);

  if (surfaceMaterial === "water") {
    const forcefulEntry = cue === "sweep" || cue === "impact" || cue === "fall";
    return {
      action: cue === "sweep" ? "sweep" : "slip",
      surfaceMaterial,
      semanticFamily: forcefulEntry ? "splash" : "slosh",
      intensity: forcefulEntry ? 760_000 : 460_000,
      rangeTiles: forcefulEntry ? 24 : 18,
      durationSteps: forcefulEntry ? 4 : 5,
      priority: forcefulEntry ? 720_000 : 500_000,
      salience: forcefulEntry ? 860_000 : 650_000,
      accessibilityRelevance: forcefulEntry ? "urgent" : "informative",
    };
  }

  if (cue === "impact" || cue === "fall") {
    return {
      action: "land",
      surfaceMaterial,
      semanticFamily: "thud",
      intensity: cue === "impact" ? 900_000 : 780_000,
      rangeTiles: cue === "impact" ? 28 : 24,
      durationSteps: 3,
      priority: 760_000,
      salience: 900_000,
      accessibilityRelevance: "urgent",
    };
  }

  if (cue === "sweep") {
    return {
      action: "sweep",
      surfaceMaterial: "water",
      semanticFamily: "splash",
      intensity: 760_000,
      rangeTiles: 24,
      durationSteps: 4,
      priority: 720_000,
      salience: 860_000,
      accessibilityRelevance: "urgent",
    };
  }

  if (surfaceMaterial === "foliage") {
    return {
      action: "brush",
      surfaceMaterial,
      semanticFamily: "rustle",
      intensity: 320_000,
      rangeTiles: 12,
      durationSteps: 6,
      priority: 360_000,
      salience: 450_000,
      accessibilityRelevance: "routine",
    };
  }

  return {
    action: cue === "recover" ? "foot-contact" : "slide",
    surfaceMaterial,
    semanticFamily: "scrape",
    intensity: cue === "recover" ? 300_000 : 520_000,
    rangeTiles: cue === "recover" ? 10 : 18,
    durationSteps: cue === "recover" ? 4 : 6,
    priority: cue === "recover" ? 280_000 : 540_000,
    salience: cue === "recover" ? 340_000 : 680_000,
    accessibilityRelevance: cue === "recover" ? "routine" : "informative",
  };
}

function traversalSurface(cause: FallRiskCauseCode): AcousticMaterialClass {
  if (cause === "loose-rock") return "stone";
  if (cause === "strong-current" || cause === "deep-water") return "water";
  if (cause === "bramble-vines") return "foliage";
  return cause === "invalid-input" ? "unknown" : "soil";
}

function validTraversalIncidentAuthority(incident: TraversalIncident): boolean {
  return validId(incident?.id, 192)
    && nonnegativeSafeInteger(incident.actorId)
    && nonnegativeSafeInteger(incident.traversalOrdinal)
    && TRAVERSAL_KINDS.has(incident.kind)
    && FALL_RISK_CAUSES.has(incident.primaryCause)
    && TRAVERSAL_CUES.has(incident.cue)
    && positiveSafeInteger(incident.remainingSteps)
    && positiveSafeInteger(incident.totalSteps)
    && incident.remainingSteps <= incident.totalSteps
    && uint32(incident.variantSeed);
}

function forceBand(intensity: number): AcousticForceBand {
  if (intensity >= 700_000) return "heavy";
  if (intensity >= 350_000) return "moderate";
  return "light";
}

function fixedUnit(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) >= 0
    && (value as number) <= FIXED_POINT;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function uint32(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) >= 0
    && (value as number) <= 0xffff_ffff;
}

function validId(value: unknown, maximumLength: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximumLength
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

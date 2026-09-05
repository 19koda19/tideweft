import type { DogCoatColor, DogCoatLength, DogCoatPattern, DogSize } from "../sim/dogIdentity";
import { VISIBILITY_DIRECT, type VisibilityGrade } from "./perception";
import { canonicalizeDogActorState, type DogActorState, type DogActorIntent } from "./dogActor";
import {
  headingToRadians,
  livingActorAddressInRegionalWindow,
} from "./livingActor";
import { WORLD_POSITION_UNITS_PER_TILE } from "./worldPosition";

export const DOG_PRESENTATION_VERSION = 1 as const;

/**
 * Renderer-neutral dog data. It contains only directly observable qualities;
 * needs, temperament, familiarity, memories, and hidden targets remain in the
 * simulation even though the stable actor ID is retained for input routing.
 */
export interface DogPresentation {
  readonly version: typeof DOG_PRESENTATION_VERSION;
  readonly actorId: string;
  readonly quickLabel: "Unknown dog" | "Familiar dog";
  readonly position: Readonly<{ x: number; y: number }>;
  readonly facing: number;
  readonly size: DogSize;
  readonly sizeScale: number;
  readonly coat: Readonly<{
    readonly primary: DogCoatColor;
    readonly secondary: DogCoatColor | null;
    readonly pattern: DogCoatPattern;
    readonly length: DogCoatLength;
  }>;
  readonly wetness: number;
  readonly conditionLabels: readonly string[];
  readonly behavior: DogActorIntent;
  readonly selected: boolean;
}

export interface DogPresentationInput {
  readonly actor: unknown;
  readonly window: Readonly<{
    readonly origin: Readonly<{ x: number; y: number }>;
    readonly terrain: Readonly<{ width: number; height: number }>;
  }>;
  readonly tileSize: number;
  readonly detailVisibilityGrades: readonly VisibilityGrade[] | Uint8Array;
  readonly selected?: boolean;
}

/**
 * Projects one dog only while its exact tile is directly detail-visible.
 * Peripheral terrain sight is deliberately insufficient to reveal an actor.
 */
export function projectDogPresentation(input: DogPresentationInput): DogPresentation | null {
  if (!plainRecord(input) || !allowedInputKeys(input as unknown as Record<string, unknown>)) return null;
  const actor = canonicalizeDogActorState(input.actor);
  if (
    actor === null
    || !validWindow(input.window)
    || !Number.isFinite(input.tileSize)
    || input.tileSize <= 0
    || input.tileSize > 4_096
    || !(
      Array.isArray(input.detailVisibilityGrades)
      || input.detailVisibilityGrades instanceof Uint8Array
    )
    || input.detailVisibilityGrades.length !== input.window.terrain.width * input.window.terrain.height
    || input.detailVisibilityGrades.some((grade) => grade !== 0 && grade !== 1 && grade !== 2)
    || (input.selected !== undefined && typeof input.selected !== "boolean")
  ) return null;
  const placement = livingActorAddressInRegionalWindow(actor.address, input.window);
  if (
    placement === null
    || input.detailVisibilityGrades[placement.tileIndex] !== VISIBILITY_DIRECT
  ) return null;
  const recognizable = actor.playerKnowledge.facts.some(
    ({ fact }) => fact === "recognizable-individual",
  );

  return deepFreeze({
    version: DOG_PRESENTATION_VERSION,
    actorId: actor.identity.stableId,
    quickLabel: recognizable ? "Familiar dog" : "Unknown dog",
    position: {
      x: placement.point.x * input.tileSize / WORLD_POSITION_UNITS_PER_TILE,
      y: placement.point.y * input.tileSize / WORLD_POSITION_UNITS_PER_TILE,
    },
    facing: headingToRadians(placement.heading),
    size: actor.identity.body.size,
    sizeScale: dogSizeScale(actor.identity.body.size),
    coat: {
      primary: actor.identity.coat.primaryColor,
      secondary: actor.identity.coat.secondaryColor,
      pattern: actor.identity.coat.pattern,
      length: actor.identity.coat.length,
    },
    wetness: actor.condition.wetness,
    conditionLabels: observableConditionLabels(actor),
    behavior: actor.intent.kind,
    selected: input.selected ?? false,
  });
}

function observableConditionLabels(actor: DogActorState): readonly string[] {
  const labels: string[] = [];
  if (actor.condition.injuries.length > 0) labels.push("INJURED");
  if (actor.condition.wetness >= 580_000) labels.push("SOAKED");
  else if (actor.condition.wetness >= 220_000) labels.push("WET");
  if (actor.condition.coldStress >= 580_000) labels.push("VERY COLD");
  else if (actor.condition.coldStress >= 240_000) labels.push("COLD");
  if (actor.condition.heatStress >= 580_000) labels.push("OVERHEATED");
  if (actor.condition.exhaustion >= 620_000) labels.push("EXHAUSTED");
  else if (actor.condition.exhaustion >= 280_000) labels.push("TIRED");
  return Object.freeze(labels);
}

function dogSizeScale(size: DogSize): number {
  switch (size) {
    case "tiny": return 0.58;
    case "small": return 0.74;
    case "medium": return 0.9;
    case "large": return 1.08;
    case "very-large": return 1.24;
  }
}

function validWindow(value: unknown): value is DogPresentationInput["window"] {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["origin", "terrain"])
    || !plainRecord(value.origin)
    || !exactKeys(value.origin, ["x", "y"])
    || !safeInteger(value.origin.x)
    || !safeInteger(value.origin.y)
    || !plainRecord(value.terrain)
    || !exactKeys(value.terrain, ["height", "width"])
    || !positiveSafeInteger(value.terrain.width)
    || !positiveSafeInteger(value.terrain.height)
  ) return false;
  const cells = value.terrain.width * value.terrain.height;
  return Number.isSafeInteger(cells) && cells > 0 && cells <= 1_048_576;
}

function allowedInputKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value).sort();
  const expected = value.selected === undefined
    ? ["actor", "detailVisibilityGrades", "tileSize", "window"]
    : ["actor", "detailVisibilityGrades", "selected", "tileSize", "window"];
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function safeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && !Object.is(value, -0);
}

function positiveSafeInteger(value: unknown): value is number {
  return safeInteger(value) && (value as number) > 0;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return keys.length === canonical.length && keys.every((key, index) => key === canonical[index]);
}

function plainRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

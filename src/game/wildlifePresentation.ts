import { ACTOR_PERCEPTION_SCALE } from "../sim/actorPerception";
import {
  getCoreWildlifeProfile,
  type CoreWildlifeLifeStage,
  type CoreWildlifeSpecies,
} from "../sim/coreWildlifeIdentity";
import {
  canonicalizeCoreWildlifeActorState,
  type CoreWildlifeActorState,
  type CoreWildlifeIntentKind,
} from "./coreWildlifeActor";
import {
  VISIBILITY_DIRECT,
  hasValidPerceptionSignature,
  type PerceptionResult,
} from "./perception";
import {
  headingToRadians,
  livingActorAddressInRegionalWindow,
} from "./livingActor";
import { livingSpeciesRegistryEntry } from "./livingSpeciesRegistry";
import { WORLD_POSITION_UNITS_PER_TILE } from "./worldPosition";

export const WILDLIFE_PRESENTATION_VERSION = 1 as const;
export const WILDLIFE_DIRECT_DETAIL_MAX_DISTANCE_UNITS = 96_000 as const;

export type WildlifePresentationBehavior =
  | "watch"
  | "alarm"
  | "flee"
  | "scavenge"
  | "forage"
  | "pursue"
  | "guard"
  | "retreat"
  | "rest";

/** Signed current player perception plus an optional count of visible gull representatives. */
export interface WildlifeDirectObservation {
  readonly window: Readonly<{
    readonly origin: Readonly<{ x: number; y: number }>;
    readonly terrain: Readonly<{ width: number; height: number }>;
  }>;
  readonly perception: PerceptionResult;
  /** Visible representatives only; this is never total or hidden flock membership. */
  readonly visibleAggregateCount?: number;
}

/** Renderer-neutral, directly observable wildlife data. */
export interface WildlifePresentation {
  readonly version: typeof WILDLIFE_PRESENTATION_VERSION;
  /** Stable routing identity; labels below remain observation-limited. */
  readonly actorId: string;
  readonly species: CoreWildlifeSpecies;
  readonly quickLabel: string;
  readonly identityLabel: string;
  readonly speciesIdentified: boolean;
  readonly position: Readonly<{ x: number; y: number }>;
  readonly facing: number;
  readonly sizeScale: number;
  readonly behavior: WildlifePresentationBehavior;
  readonly behaviorLabel: string;
  readonly conditionLabels: readonly string[];
  readonly appearanceLabel?: string;
  readonly lifeStageLabel?: string;
  /** Coarse visible bucket for a gull aggregate; absent for individuals or unknown count. */
  readonly groupSize?: number;
  readonly distanceUnits: number;
  readonly selected: boolean;
}

export interface WildlifePresentationInput {
  readonly actor: unknown;
  readonly observation: WildlifeDirectObservation;
  readonly tileSize: number;
  readonly selected?: boolean;
}

interface DirectDetail {
  readonly point: Readonly<{ x: number; y: number }>;
  readonly heading: number;
  readonly distanceUnits: number;
  readonly visualClarity: number;
  readonly groupSize: number | undefined;
}

const IDENTIFICATION_CLARITY: Readonly<Record<CoreWildlifeSpecies, number>> = Object.freeze({
  deer: 300_000,
  gull: 220_000,
  "black-bear": 420_000,
});
const BEHAVIOR_CLARITY = 180_000;
const CONDITION_CLARITY = 260_000;
const APPEARANCE_CLARITY = 620_000;
const LIFE_STAGE_CLARITY = 760_000;

/**
 * Projects no animal at all unless the signed detail field directly contains
 * its current tile. Terrain visibility or a caller-authored boolean is never
 * enough to disclose an actor.
 */
export function projectWildlifePresentation(
  input: WildlifePresentationInput,
): WildlifePresentation | null {
  if (
    !plainRecord(input)
    || !allowedInputKeys(input as unknown as Record<string, unknown>)
    || !Number.isFinite(input.tileSize)
    || input.tileSize <= 0
    || input.tileSize > 4_096
    || (input.selected !== undefined && typeof input.selected !== "boolean")
  ) return null;
  const actor = canonicalizeCoreWildlifeActorState(input.actor);
  if (actor === null) return null;
  const detail = directDetail(actor, input.observation);
  if (detail === null) return null;

  const speciesIdentified = detail.visualClarity >= IDENTIFICATION_CLARITY[actor.identity.species];
  const behavior = presentationBehavior(actor.intent.kind);
  const behaviorLabel = detail.visualClarity >= BEHAVIOR_CLARITY
    ? observableBehavior(actor.intent.kind)
    : coarseMotion(actor.intent.kind);
  const conditionLabels = detail.visualClarity >= CONDITION_CLARITY
    ? observableConditionLabels(actor)
    : Object.freeze([]);
  const appearanceLabel = detail.visualClarity >= APPEARANCE_CLARITY
    ? observableAppearance(actor)
    : undefined;
  const lifeStageLabel = actor.identity.species !== "gull"
    && detail.visualClarity >= LIFE_STAGE_CLARITY
    ? displayToken(actor.identity.lifeStage)
    : undefined;

  return deepFreeze({
    version: WILDLIFE_PRESENTATION_VERSION,
    actorId: actor.identity.stableId,
    species: actor.identity.species,
    quickLabel: quickLabel(actor.identity.species, speciesIdentified),
    identityLabel: identityLabel(actor.identity.species, speciesIdentified),
    speciesIdentified,
    position: {
      x: detail.point.x * input.tileSize / WORLD_POSITION_UNITS_PER_TILE,
      y: detail.point.y * input.tileSize / WORLD_POSITION_UNITS_PER_TILE,
    },
    facing: headingToRadians(detail.heading),
    sizeScale: sizeScale(actor.identity.species, actor.identity.lifeStage),
    behavior,
    behaviorLabel,
    conditionLabels,
    ...(appearanceLabel === undefined ? {} : { appearanceLabel }),
    ...(lifeStageLabel === undefined ? {} : { lifeStageLabel }),
    ...(detail.groupSize === undefined ? {} : { groupSize: detail.groupSize }),
    distanceUnits: detail.distanceUnits,
    selected: input.selected ?? false,
  });
}

function directDetail(
  actor: CoreWildlifeActorState,
  value: unknown,
): DirectDetail | null {
  if (!plainRecord(value)) return null;
  const expected = value.visibleAggregateCount === undefined
    ? ["perception", "window"]
    : ["perception", "visibleAggregateCount", "window"];
  if (!exactKeys(value, expected) || !validWindow(value.window) || !plainRecord(value.perception)) {
    return null;
  }
  const window = value.window as unknown as WildlifeDirectObservation["window"];
  const perception = value.perception as unknown as PerceptionResult;
  if (
    perception.valid !== true
    || !hasValidPerceptionSignature(perception, window.terrain.width, window.terrain.height)
    || !nonnegativeSafeInteger(perception.playerTileIndex)
    || perception.playerTileIndex >= window.terrain.width * window.terrain.height
  ) return null;
  const placement = livingActorAddressInRegionalWindow(actor.address, window);
  if (
    placement === null
    || perception.detailVisibilityGrades[placement.tileIndex] !== VISIBILITY_DIRECT
  ) return null;

  let groupSize: number | undefined;
  if (value.visibleAggregateCount !== undefined) {
    const maximum = getCoreWildlifeProfile(actor.identity.species).maximumPatchPopulation;
    if (
      actor.identity.species !== "gull"
      || !positiveSafeInteger(value.visibleAggregateCount)
      || value.visibleAggregateCount > maximum
    ) return null;
    groupSize = approximateVisibleGroupSize(value.visibleAggregateCount);
  }

  const playerX = (perception.playerTileIndex % window.terrain.width)
    * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2;
  const playerY = Math.floor(perception.playerTileIndex / window.terrain.width)
    * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2;
  const distanceUnits = Math.round(Math.hypot(
    placement.point.x - playerX,
    placement.point.y - playerY,
  ));
  if (
    !nonnegativeSafeInteger(distanceUnits)
    || distanceUnits > WILDLIFE_DIRECT_DETAIL_MAX_DISTANCE_UNITS
  ) return null;
  const terrainStrength = perception.terrainVisibilityStrengths[placement.tileIndex];
  if (terrainStrength === undefined) return null;
  const distanceClarity = Math.max(0, ACTOR_PERCEPTION_SCALE - Math.round(
    distanceUnits * ACTOR_PERCEPTION_SCALE / WILDLIFE_DIRECT_DETAIL_MAX_DISTANCE_UNITS,
  ));
  const terrainClarity = Math.round(terrainStrength * ACTOR_PERCEPTION_SCALE / 255);
  return Object.freeze({
    point: placement.point,
    heading: placement.heading,
    distanceUnits,
    visualClarity: Math.min(distanceClarity, terrainClarity),
    groupSize,
  });
}

function approximateVisibleGroupSize(count: number): number | undefined {
  if (count <= 1) return undefined;
  if (count <= 3) return 2;
  if (count <= 7) return 5;
  if (count <= 12) return 10;
  if (count <= 18) return 15;
  return 20;
}

function quickLabel(species: CoreWildlifeSpecies, identified: boolean): string {
  if (!identified) {
    if (species === "gull") return "Unknown birds";
    return species === "black-bear" ? "Large animal" : "Unknown animal";
  }
  const noun = livingSpeciesRegistryEntry(species)?.aboutNoun;
  if (noun === undefined) return "Unknown animal";
  return species === "gull" ? `${displayToken(noun)}s` : displayToken(noun);
}

function identityLabel(species: CoreWildlifeSpecies, identified: boolean): string {
  if (!identified) return species === "gull" ? "Unidentified birds" : "Unidentified animal";
  const noun = livingSpeciesRegistryEntry(species)?.aboutNoun;
  if (noun === undefined) return "Unidentified animal";
  return species === "gull" ? `${displayToken(noun)} flock` : displayToken(noun);
}

function observableAppearance(actor: CoreWildlifeActorState): string {
  const appearance = displayToken(actor.identity.morph);
  return actor.identity.species === "gull" ? `Predominantly ${appearance.toLowerCase()}` : appearance;
}

function observableConditionLabels(actor: CoreWildlifeActorState): readonly string[] {
  const labels: string[] = [];
  if (actor.identity.species !== "gull") {
    if (actor.condition.health <= 260_000) labels.push("MOVING POORLY");
    else if (actor.condition.health <= 580_000) labels.push("HURT");
    if (actor.condition.exhaustion >= 680_000) labels.push("EXHAUSTED");
    else if (actor.condition.exhaustion >= 340_000) labels.push("TIRED");
    if (actor.condition.stress >= 720_000) labels.push("DISTRESSED");
    else if (actor.condition.stress >= 380_000) labels.push("TENSE");
  } else if (actor.condition.stress >= 500_000) {
    labels.push("RESTLESS");
  }
  return Object.freeze(labels);
}

function presentationBehavior(intent: CoreWildlifeIntentKind): WildlifePresentationBehavior {
  switch (intent) {
    case "observe": return "watch";
    case "disengage":
    case "retreat": return "retreat";
    case "flee": return "flee";
    case "alarm": return "alarm";
    case "guard": return "guard";
    case "scavenge": return "scavenge";
    case "forage": return "forage";
    case "pursue": return "pursue";
    case "rest": return "rest";
  }
}

function observableBehavior(intent: CoreWildlifeIntentKind): string {
  switch (intent) {
    case "observe": return "Watching";
    case "disengage": return "Moving away";
    case "flee": return "Fleeing";
    case "alarm": return "Calling and alert";
    case "retreat": return "Backing away";
    case "guard": return "Holding ground";
    case "scavenge": return "Scavenging";
    case "forage": return "Foraging";
    case "pursue": return "Moving with focus";
    case "rest": return "Resting";
  }
}

function coarseMotion(intent: CoreWildlifeIntentKind): string {
  return intent === "observe" || intent === "guard" || intent === "rest"
    ? "Still"
    : "Moving";
}

function sizeScale(species: CoreWildlifeSpecies, lifeStage: CoreWildlifeLifeStage): number {
  const speciesScale = species === "black-bear" ? 1.34 : species === "deer" ? 1 : 0.64;
  if (species === "gull") return speciesScale;
  const ageScale = lifeStage === "juvenile" ? 0.76 : lifeStage === "older" ? 0.96 : 1;
  return Math.round(speciesScale * ageScale * 1_000) / 1_000;
}

function displayToken(value: string): string {
  const label = value.replaceAll("-", " ");
  return label.length === 0 ? label : label[0]!.toUpperCase() + label.slice(1);
}

function validWindow(value: unknown): value is WildlifeDirectObservation["window"] {
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
  const expected = value.selected === undefined
    ? ["actor", "observation", "tileSize"]
    : ["actor", "observation", "selected", "tileSize"];
  return exactKeys(value, expected);
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

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return keys.length === canonical.length && keys.every((key, index) => key === canonical[index]);
}

function plainRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

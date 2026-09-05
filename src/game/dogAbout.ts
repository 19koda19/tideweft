import { ACTOR_PERCEPTION_SCALE } from "../sim/actorPerception";
import type {
  DogActorState,
  DogPlayerKnowledgeFactKind,
} from "./dogActor";
import { canonicalizeDogActorState } from "./dogActor";
import {
  VISIBILITY_DIRECT,
  hasValidPerceptionSignature,
  type PerceptionResult,
} from "./perception";
import { livingActorAddressInRegionalWindow } from "./livingActor";
import { WORLD_POSITION_UNITS_PER_TILE } from "./worldPosition";

export const DOG_ABOUT_VERSION = 1 as const;
export const DOG_ABOUT_MAX_DISTANCE_UNITS = 96_000 as const;

/**
 * ABOUT consumes a signed player-perception snapshot, never a caller-authored
 * `visible` bit. The actor tile and observer distance are derived internally.
 */
export interface DogAboutObservation {
  readonly window: Readonly<{
    readonly origin: Readonly<{ x: number; y: number }>;
    readonly terrain: Readonly<{ width: number; height: number }>;
  }>;
  readonly perception: PerceptionResult;
}

interface CanonicalDogAboutObservation {
  readonly distanceUnits: number;
  readonly visualClarity: number;
}

export interface DogAboutFact {
  readonly label: string;
  readonly value: string;
}

export interface DogQuickInspect {
  readonly version: typeof DOG_ABOUT_VERSION;
  readonly actorId: string;
  readonly heading: "UNKNOWN DOG" | "FAMILIAR DOG";
  readonly summary: string;
  readonly distanceUnits: number;
}

export interface DogAboutView {
  readonly version: typeof DOG_ABOUT_VERSION;
  readonly actorId: string;
  readonly heading: "UNKNOWN DOG" | "FAMILIAR DOG";
  readonly identity: string;
  readonly knowledge: "Unfamiliar" | "Recognized" | "Known individual";
  readonly observed: readonly DogAboutFact[];
  readonly known: readonly DogAboutFact[];
}

/**
 * A quick contact summary derived only from current sight. It deliberately has
 * no name, owner, relationship, exact need, health number, or hidden target.
 */
export function projectDogQuickInspect(
  actorValue: unknown,
  observationValue: unknown,
): DogQuickInspect | null {
  const actor = canonicalizeDogActorState(actorValue);
  if (actor === null) return null;
  const observation = canonicalObservation(actor, observationValue);
  if (observation === null) return null;
  const recognizable = actor.playerKnowledge.facts.some(
    ({ fact }) => fact === "recognizable-individual",
  );
  const size = observation.visualClarity >= 120_000
    ? displayToken(actor.identity.body.size)
    : "Dog";
  const condition = observation.visualClarity >= 180_000
    ? primaryObservableCondition(actor)
    : "Distant";
  return deepFreeze({
    version: DOG_ABOUT_VERSION,
    actorId: actor.identity.stableId,
    heading: recognizable ? "FAMILIAR DOG" : "UNKNOWN DOG",
    summary: `${size} · ${condition}`,
    distanceUnits: observation.distanceUnits,
  });
}

/**
 * Knowledge-honest dog ABOUT projection. Current visibility is mandatory;
 * persisted knowledge can enrich KNOWN but can never keep remote ABOUT open.
 */
export function projectDogAbout(
  actorValue: unknown,
  observationValue: unknown,
): DogAboutView | null {
  const actor = canonicalizeDogActorState(actorValue);
  if (actor === null) return null;
  const observation = canonicalObservation(actor, observationValue);
  if (observation === null) return null;

  const known = new Set(actor.playerKnowledge.facts.map(({ fact }) => fact));
  const observed: DogAboutFact[] = [
    fact("Species", "Dog"),
  ];

  if (observation.visualClarity >= 120_000) {
    observed.push(fact("Size", approximateSize(actor.identity.body.size)));
  }
  if (observation.visualClarity >= 180_000) {
    observed.push(fact("Condition", observableCondition(actor)));
  }
  if (observation.visualClarity >= 240_000) {
    observed.push(fact("Behavior", observableBehavior(actor.intent.kind)));
  }

  if (observation.visualClarity >= 360_000) {
    observed.push(fact("Coat", observableCoat(actor)));
  }
  if (
    observation.visualClarity >= 620_000
    && actor.identity.coat.distinguishingMark !== "none"
  ) {
    observed.push(fact("Mark", displayToken(actor.identity.coat.distinguishingMark)));
  }
  if (observation.visualClarity >= 720_000) {
    observed.push(fact("Age", displayToken(actor.identity.age)));
  }

  const knownFacts: DogAboutFact[] = [];
  if (known.has("human-familiarity")) {
    knownFacts.push(fact("Around people", familiarityDescription(actor.humanFamiliarity.level)));
  }
  if (known.has("temperament")) {
    knownFacts.push(fact(
      "Temperament",
      actor.identity.temperament.map(displayToken).join(" · "),
    ));
  }
  if (known.has("significant-history")) {
    const history = knownHistoryDescriptions(actor);
    if (history.length > 0) {
      knownFacts.push(fact(
        "Known history",
        history.join(" · "),
      ));
    }
  }

  return deepFreeze({
    version: DOG_ABOUT_VERSION,
    actorId: actor.identity.stableId,
    heading: known.has("recognizable-individual") ? "FAMILIAR DOG" : "UNKNOWN DOG",
    identity: observation.visualClarity >= 720_000
      ? `${displayToken(actor.identity.age)} dog`
      : "Dog",
    knowledge: knowledgeDescription(known),
    observed,
    known: knownFacts,
  });
}

/**
 * One physically offered meal creates paired human/contact and food memories.
 * Present that causal pair as one readable fact without revealing hidden item
 * or porter identity.
 */
function knownHistoryDescriptions(actor: DogActorState): readonly string[] {
  const byId = new Map(actor.memories.map((memory) => [memory.eventId, memory]));
  const represented = new Set<string>();
  const descriptions: string[] = [];
  for (const memory of actor.memories) {
    if (represented.has(memory.eventId) || memory.kind === "identity-learning") continue;
    const pairedFoodId = `${memory.eventId}:food`;
    const mealBaseId = memory.kind === "food" && memory.eventId.endsWith(":food")
      ? memory.eventId.slice(0, -":food".length)
      : null;
    if (
      (memory.kind === "human-interaction" && byId.get(pairedFoodId)?.kind === "food")
      || (mealBaseId !== null && byId.get(mealBaseId)?.kind === "human-interaction")
    ) {
      represented.add(mealBaseId ?? memory.eventId);
      represented.add(mealBaseId === null ? pairedFoodId : memory.eventId);
      if (!descriptions.includes("Accepted food from a porter")) {
        descriptions.push("Accepted food from a porter");
      }
    } else {
      represented.add(memory.eventId);
      const description = historyDescription(memory.kind);
      if (!descriptions.includes(description)) descriptions.push(description);
    }
    if (descriptions.length >= 3) break;
  }
  return Object.freeze(descriptions);
}

function canonicalObservation(
  actor: DogActorState,
  value: unknown,
): CanonicalDogAboutObservation | null {
  if (
    !plainRecord(value)
    || Object.keys(value).sort().join(",") !== "perception,window"
    || !plainRecord(value.window)
    || Object.keys(value.window).sort().join(",") !== "origin,terrain"
    || !plainRecord(value.window.origin)
    || Object.keys(value.window.origin).sort().join(",") !== "x,y"
    || !safeInteger(value.window.origin.x)
    || !safeInteger(value.window.origin.y)
    || !plainRecord(value.window.terrain)
    || Object.keys(value.window.terrain).sort().join(",") !== "height,width"
    || !positiveSafeInteger(value.window.terrain.width)
    || !positiveSafeInteger(value.window.terrain.height)
    || !plainRecord(value.perception)
  ) return null;
  const window = value.window as unknown as DogAboutObservation["window"];
  const perception = value.perception as unknown as PerceptionResult;
  if (
    perception.valid !== true
    || !hasValidPerceptionSignature(
      perception,
      window.terrain.width,
      window.terrain.height,
    )
    || !nonnegativeSafeInteger(perception.playerTileIndex)
    || perception.playerTileIndex >= window.terrain.width * window.terrain.height
  ) return null;
  const placement = livingActorAddressInRegionalWindow(actor.address, window);
  if (
    placement === null
    || perception.detailVisibilityGrades[placement.tileIndex] !== VISIBILITY_DIRECT
  ) return null;
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
    || distanceUnits > DOG_ABOUT_MAX_DISTANCE_UNITS
  ) return null;
  const distanceClarity = Math.max(0, ACTOR_PERCEPTION_SCALE - Math.round(
    distanceUnits * ACTOR_PERCEPTION_SCALE / DOG_ABOUT_MAX_DISTANCE_UNITS,
  ));
  const terrainStrength = perception.terrainVisibilityStrengths[placement.tileIndex];
  if (terrainStrength === undefined) return null;
  const terrainClarity = Math.round(terrainStrength * ACTOR_PERCEPTION_SCALE / 255);
  const visualClarity = Math.min(distanceClarity, terrainClarity);
  return Object.freeze({
    distanceUnits,
    visualClarity,
  });
}

function observableCoat(actor: DogActorState): string {
  const { coat } = actor.identity;
  const color = coat.secondaryColor === null
    ? displayToken(coat.primaryColor)
    : `${displayToken(coat.primaryColor)} / ${displayToken(coat.secondaryColor)}`;
  return `${color} · ${displayToken(coat.length)}`;
}

function observableCondition(actor: DogActorState): string {
  const values: string[] = [];
  if (actor.condition.injuries.length > 0) values.push("Appears injured");
  if (actor.condition.wetness >= 580_000) values.push("Soaked");
  else if (actor.condition.wetness >= 220_000) values.push("Wet");
  if (actor.condition.coldStress >= 580_000) values.push("Very cold");
  else if (actor.condition.coldStress >= 240_000) values.push("Cold");
  if (actor.condition.heatStress >= 580_000) values.push("Overheated");
  else if (actor.condition.heatStress >= 240_000) values.push("Warm");
  if (actor.condition.exhaustion >= 620_000) values.push("Exhausted");
  else if (actor.condition.exhaustion >= 280_000) values.push("Tired");
  return values.length === 0 ? "Appears healthy" : values.join(" · ");
}

function primaryObservableCondition(actor: DogActorState): string {
  return observableCondition(actor).split(" · ")[0] ?? "Appears healthy";
}

function observableBehavior(intent: DogActorState["intent"]["kind"]): string {
  switch (intent) {
    case "approach-food": return "Following a food scent";
    case "eat": return "Eating";
    case "avoid-human": return "Keeping distance";
    case "seek-shelter": return "Seeking shelter";
    case "retreat": return "Retreating";
    case "rest": return "Resting";
    case "observe": return "Watching";
  }
}

function familiarityDescription(level: DogActorState["humanFamiliarity"]["level"]): string {
  switch (level) {
    case "feral": return "Avoids people";
    case "wary": return "Wary of people";
    case "habituated": return "Used to nearby people";
    case "socialized": return "Comfortable around people";
  }
}

function historyDescription(kind: DogActorState["memories"][number]["kind"]): string {
  switch (kind) {
    case "food": return "A food encounter";
    case "safety": return "A danger or refuge";
    case "human-interaction": return "An encounter with a person";
    case "relationship": return "A changed relationship";
    case "custody": return "A physical item changed hands";
    case "ledger-event": return "A significant incident";
    case "identity-learning": return "Its identity was learned";
  }
}

function knowledgeDescription(
  known: ReadonlySet<DogPlayerKnowledgeFactKind>,
): DogAboutView["knowledge"] {
  if (known.has("recognizable-individual")) return "Known individual";
  return known.size > 0 ? "Recognized" : "Unfamiliar";
}

function approximateSize(size: DogActorState["identity"]["body"]["size"]): string {
  return size === "very-large" ? "Very large" : displayToken(size);
}

function displayToken(value: string): string {
  const label = value.replaceAll("-", " ");
  return label.length === 0 ? label : label[0]!.toUpperCase() + label.slice(1);
}

function fact(label: string, value: string): DogAboutFact {
  return Object.freeze({ label, value });
}

function safeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && !Object.is(value, -0);
}

function positiveSafeInteger(value: unknown): value is number {
  return safeInteger(value) && value > 0;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
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

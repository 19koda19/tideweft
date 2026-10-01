import type { PhysicalAcousticTextView } from "../render/types";
import type { WorldView } from "../sim/types";
import { globalTileToRegion } from "../sim/regions";
import { regionalWindowForWorld } from "./regionalWorldView";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import type { AudibleContact } from "./perception";
import {
  acousticVariantIndex,
  WORLD_ACOUSTIC_EVENT_VERSION,
  type AcousticSemanticFamily,
  type WorldAcousticEvent,
} from "./worldAcoustics";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createSpatialFrame,
  createWorldPosition,
  isWorldPosition,
  worldPositionToSpatialFrame,
} from "./worldPosition";

/** A receipt is required before sound semantics cross into presentation. */
export const WORLD_ACOUSTIC_PRESENTATION_RECEPTION_VERSION = 1 as const;

interface WorldAcousticPresentationReceptionBase {
  readonly version: typeof WORLD_ACOUSTIC_PRESENTATION_RECEPTION_VERSION;
  readonly eventId: string;
  readonly sourceId: string;
}

export interface SelfWorldAcousticPresentationReception
  extends WorldAcousticPresentationReceptionBase {
  readonly kind: "self";
}

export interface HeardVisibleWorldAcousticPresentationReception
  extends WorldAcousticPresentationReceptionBase {
  readonly kind: "heard-visible";
  readonly directVisualReceipt: true;
}

/** Exact localization through the listener's own physical contact, not sight. */
export interface DirectContactWorldAcousticPresentationReception
  extends WorldAcousticPresentationReceptionBase {
  readonly kind: "direct-contact";
  readonly directContactReceipt: true;
}

export interface HeardUnseenWorldAcousticPresentationReception
  extends WorldAcousticPresentationReceptionBase {
  readonly kind: "heard-unseen";
  readonly directVisualReceipt: false;
  /** Anonymous directional hearing; deliberately carries no source position. */
  readonly contact: AudibleContact;
}

export type WorldAcousticPresentationReception =
  | SelfWorldAcousticPresentationReception
  | HeardVisibleWorldAcousticPresentationReception
  | DirectContactWorldAcousticPresentationReception
  | HeardUnseenWorldAcousticPresentationReception;

export interface WorldAcousticPresentationInput {
  readonly world: WorldView;
  readonly event: WorldAcousticEvent;
  readonly reception: WorldAcousticPresentationReception | null;
  readonly remainingSteps: number;
  readonly tileSize: number;
}

export interface WorldAcousticTextRealization {
  readonly text: string;
  readonly tone: PhysicalAcousticTextView["tone"];
  readonly priority: number;
  readonly salience: number;
  readonly semanticFamily: AcousticSemanticFamily;
}

const TEXT_POOLS: Readonly<Record<AcousticSemanticFamily, readonly string[]>> = Object.freeze({
  scrape: Object.freeze(["scrape", "scritch"]),
  splash: Object.freeze(["splash"]),
  slosh: Object.freeze(["slosh"]),
  rustle: Object.freeze(["rustle"]),
  thud: Object.freeze(["thud", "whump"]),
  clatter: Object.freeze(["clatter", "clack"]),
  creak: Object.freeze(["creak"]),
  crack: Object.freeze(["crack"]),
  skitter: Object.freeze(["skitter", "scritch"]),
  chorus: Object.freeze(["chorus"]),
  vocalization: Object.freeze(["call"]),
  other: Object.freeze(["sound"]),
});

/** Full-certainty self receipt; only the canonical local player may use it. */
export function createSelfWorldAcousticReception(
  event: Pick<WorldAcousticEvent, "eventId" | "sourceId">,
): SelfWorldAcousticPresentationReception | null {
  if (event.sourceId !== LOCAL_PLAYER_LIVING_ACTOR_ID) return null;
  return Object.freeze({
    version: WORLD_ACOUSTIC_PRESENTATION_RECEPTION_VERSION,
    eventId: event.eventId,
    sourceId: event.sourceId,
    kind: "self",
  });
}

/** Event-bound proof that the player both heard and directly saw the source. */
export function createHeardVisibleWorldAcousticReception(
  event: Pick<WorldAcousticEvent, "eventId" | "sourceId">,
): HeardVisibleWorldAcousticPresentationReception {
  return Object.freeze({
    version: WORLD_ACOUSTIC_PRESENTATION_RECEPTION_VERSION,
    eventId: event.eventId,
    sourceId: event.sourceId,
    kind: "heard-visible",
    directVisualReceipt: true,
  });
}

/** Event-bound proof that the player directly felt/heard this exact contact. */
export function createDirectContactWorldAcousticReception(
  event: Pick<WorldAcousticEvent, "eventId" | "sourceId">,
): DirectContactWorldAcousticPresentationReception {
  return Object.freeze({
    version: WORLD_ACOUSTIC_PRESENTATION_RECEPTION_VERSION,
    eventId: event.eventId,
    sourceId: event.sourceId,
    kind: "direct-contact",
    directContactReceipt: true,
  });
}

/** Event-bound hearing proof that deliberately carries no exact source fix. */
export function createHeardUnseenWorldAcousticReception(
  event: Pick<WorldAcousticEvent, "eventId" | "sourceId">,
  contact: AudibleContact,
): HeardUnseenWorldAcousticPresentationReception | null {
  if (!validAudibleContact(contact)) return null;
  return Object.freeze({
    version: WORLD_ACOUSTIC_PRESENTATION_RECEPTION_VERSION,
    eventId: event.eventId,
    sourceId: event.sourceId,
    kind: "heard-unseen",
    directVisualReceipt: false,
    contact: Object.freeze({
      bearing: Object.freeze({ ...contact.bearing }),
      distanceBand: Object.freeze({ ...contact.distanceBand }),
      certainty: contact.certainty,
    }),
  });
}

export function worldAcousticReceptionAudibleContact(
  reception: WorldAcousticPresentationReception | null,
): AudibleContact | null {
  return reception?.kind === "heard-unseen" && validAudibleContact(reception.contact)
    ? reception.contact
    : null;
}

/**
 * Projects one lawfully received physical event into restrained world text.
 * Anonymous/uncertain hearing deliberately receives no exact world anchor;
 * directional accessibility copy belongs to its listener receipt instead.
 */
export function projectWorldAcousticText(
  input: WorldAcousticPresentationInput,
): PhysicalAcousticTextView | null {
  const { event, reception } = input;
  if (
    !worldAcousticPresentationReceptionMatchesEvent(reception, event)
    || reception.kind === "heard-unseen"
    || !Number.isFinite(input.tileSize)
    || input.tileSize <= 0
  ) return null;
  const realization = realizeWorldAcousticText(event, input.remainingSteps);
  // An aggregate chorus has no addressable visible actor to anchor in world
  // space. Its lawful heard-unseen receipt is presented through the shared
  // caption surface instead of being fabricated as a physical source label.
  if (realization === null || realization.semanticFamily === "chorus") return null;
  const { text } = realization;
  const window = regionalWindowForWorld(input.world);
  if (window === null) return null;
  try {
    const origin = globalTileToRegion(window.origin.x, window.origin.y);
    const frame = createSpatialFrame(
      createWorldPosition(
        origin.region,
        origin.localX * WORLD_POSITION_UNITS_PER_TILE,
        origin.localY * WORLD_POSITION_UNITS_PER_TILE,
      ),
      input.world.terrain.width * WORLD_POSITION_UNITS_PER_TILE,
      input.world.terrain.height * WORLD_POSITION_UNITS_PER_TILE,
    );
    const point = worldPositionToSpatialFrame(frame, event.sourcePosition);
    if (point === null) return null;
    return Object.freeze({
      acousticKind: "physical",
      id: event.eventId,
      sourceId: event.sourceId,
      sourceKind: event.sourceId === LOCAL_PLAYER_LIVING_ACTOR_ID
        ? "player"
        : sourceKind(event.sourceCategory),
      text,
      position: Object.freeze({
        x: point.x / WORLD_POSITION_UNITS_PER_TILE * input.tileSize,
        y: point.y / WORLD_POSITION_UNITS_PER_TILE * input.tileSize,
      }),
      progress: 1 - input.remainingSteps / Math.max(1, event.durationSteps),
      priority: realization.priority,
      salience: realization.salience,
      tone: realization.tone,
      variantSeed: event.presentationVariantSeed,
      semanticFamily: realization.semanticFamily,
    });
  } catch {
    return null;
  }
}

/**
 * Derives only what the sound itself conveys. Callers still need a lawful
 * receipt; this helper carries no source position or identity presentation.
 */
export function realizeWorldAcousticText(
  event: WorldAcousticEvent,
  remainingSteps: number,
): WorldAcousticTextRealization | null {
  if (
    !validEventForPresentation(event)
    || event.textualEligibility === "audio-only"
    || !Number.isSafeInteger(remainingSteps)
    || remainingSteps <= 0
    || remainingSteps > event.durationSteps
  ) return null;
  // Routine contact faces the highest threshold; urgent events remain eligible
  // at lower raw salience without becoming automatically visible.
  const minimumSalience = event.accessibilityRelevance === "routine"
    ? 600_000
    : event.accessibilityRelevance === "informative"
      ? 450_000
      : 250_000;
  if (event.salience < minimumSalience) return null;
  const pool = TEXT_POOLS[event.semanticFamily];
  const index = acousticVariantIndex(event, pool.length);
  const text = index === null ? null : pool[index];
  if (text === null || text === undefined) return null;
  return Object.freeze({
    text,
    tone: event.accessibilityRelevance === "urgent" ? "alarmed" : "restrained",
    priority: event.priority,
    salience: event.salience,
    semanticFamily: event.semanticFamily,
  });
}

export function worldAcousticPresentationReceptionMatchesEvent(
  reception: WorldAcousticPresentationReception | null,
  event: WorldAcousticEvent,
): reception is WorldAcousticPresentationReception {
  if (
    reception === null
    || reception.version !== WORLD_ACOUSTIC_PRESENTATION_RECEPTION_VERSION
    || reception.eventId !== event.eventId
    || reception.sourceId !== event.sourceId
  ) return false;
  if (reception.kind === "self") {
    return event.sourceId === LOCAL_PLAYER_LIVING_ACTOR_ID;
  }
  if (reception.kind === "heard-visible") {
    return reception.directVisualReceipt === true;
  }
  if (reception.kind === "direct-contact") {
    return reception.directContactReceipt === true;
  }
  return reception.kind === "heard-unseen"
    && reception.directVisualReceipt === false
    && validAudibleContact(reception.contact);
}

function validAudibleContact(contact: AudibleContact | null | undefined): contact is AudibleContact {
  return contact !== null
    && contact !== undefined
    && Number.isFinite(contact.bearing?.centerRadians)
    && Number.isFinite(contact.bearing?.uncertaintyRadians)
    && contact.bearing.uncertaintyRadians >= 0
    && contact.bearing.uncertaintyRadians <= Math.PI
    && Number.isFinite(contact.distanceBand?.minimum)
    && contact.distanceBand.minimum >= 0
    && Number.isFinite(contact.distanceBand?.maximum)
    && contact.distanceBand.maximum >= contact.distanceBand.minimum
    && Number.isFinite(contact.certainty)
    && contact.certainty > 0
    && contact.certainty <= 1;
}

function validEventForPresentation(event: WorldAcousticEvent): boolean {
  return event.version === WORLD_ACOUSTIC_EVENT_VERSION
    && typeof event.eventId === "string"
    && event.eventId.length > 0
    && typeof event.sourceId === "string"
    && event.sourceId.length > 0
    && isWorldPosition(event.sourcePosition)
    && Object.prototype.hasOwnProperty.call(TEXT_POOLS, event.semanticFamily)
    && Number.isSafeInteger(event.durationSteps)
    && event.durationSteps > 0
    && Number.isSafeInteger(event.priority)
    && event.priority >= 0
    && event.priority <= 1_000_000
    && Number.isSafeInteger(event.salience)
    && event.salience >= 0
    && event.salience <= 1_000_000;
}

function sourceKind(
  source: WorldAcousticEvent["sourceCategory"],
): PhysicalAcousticTextView["sourceKind"] {
  switch (source) {
    case "human": return "human";
    case "animal": return "animal";
    case "supernatural": return "supernatural";
    case "object": return "object";
    case "tool": return "tool";
    case "vehicle": return "vehicle";
    case "world": return "world";
  }
}

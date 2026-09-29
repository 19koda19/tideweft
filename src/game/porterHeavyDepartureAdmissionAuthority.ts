import { FIXED_POINT, type WorldView } from "../sim/types";
import { stableStringify } from "../sim/util";
import { globalTileToRegion } from "../sim/regions";
import { ambientNoiseAt } from "./humanPerception";
import {
  livingActorAddressForResident,
  livingActorAddressInRegionalWindow,
} from "./livingActor";
import { evaluateAudibleContact, VISIBILITY_DIRECT } from "./perception";
import { playerTileIndex, type PlayerState } from "./player";
import { projectPerception } from "./projection";
import type { RegionalTerrainWindow } from "./regionalTravel";
import {
  regionalCompatibilityWorldForWorld,
  regionalWindowForWorld,
} from "./regionalWorldView";
import { playerWorldPositionInRegionalWindow } from "./residentSpatial";
import {
  projectSituatedExpression,
  type SituatedExpressionEvent,
} from "./situatedExpression";
import { situatedExpressionAcoustics } from "./situatedExpressionAcoustics";
import {
  canonicalizeSituatedExpressionAdmissionRecord,
  type PorterHeavyDepartureExpressionAdmissionRecord,
} from "./situatedExpressionAdmissionLedger";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createSpatialFrame,
  createWorldPosition,
  worldPositionDelta,
  worldPositionToSpatialFrame,
} from "./worldPosition";
import { workingPeopleExpressionEventMatchesWorld } from "./workingPeopleExpression";

export interface PorterHeavyDepartureAdmissionAuthorityInput {
  /** Full compatibility economy which owns the resident and departure event. */
  readonly economyWorld: WorldView;
  /** Regional projection used when the expression was admitted. */
  readonly spatialWorld: WorldView;
  readonly window: RegionalTerrainWindow;
  /** Current save's player shape; position/facing are replaced by event-time evidence. */
  readonly playerTemplate: PlayerState;
  readonly event: SituatedExpressionEvent;
  readonly admission: PorterHeavyDepartureExpressionAdmissionRecord;
  readonly completedTick: number;
}

/**
 * Replays only the bounded event-time sensory decision retained by a porter
 * admission. It neither advances simulation nor trusts present player pose.
 */
export function porterHeavyDepartureAdmissionMatchesEventTimePerception(
  inputValue: PorterHeavyDepartureAdmissionAuthorityInput,
): boolean {
  const input: unknown = inputValue;
  if (!plainRecord(input) || !exactKeys(input, [
    "admission",
    "completedTick",
    "economyWorld",
    "event",
    "playerTemplate",
    "spatialWorld",
    "window",
  ])) return false;
  const {
    economyWorld,
    spatialWorld,
    window,
    playerTemplate,
    event,
    completedTick,
  } = inputValue;
  if (
    !nonnegativeSafeInteger(completedTick)
    || economyWorld.completedTick !== completedTick
    || spatialWorld.completedTick !== completedTick
    || regionalWindowForWorld(spatialWorld) !== window
    || regionalCompatibilityWorldForWorld(spatialWorld) !== economyWorld
    || window.terrain.width !== spatialWorld.terrain.width
    || window.terrain.height !== spatialWorld.terrain.height
    || window.terrain.tiles.length !== spatialWorld.terrain.tiles.length
  ) return false;

  const canonicalAdmission = canonicalizeSituatedExpressionAdmissionRecord(inputValue.admission);
  if (
    canonicalAdmission === null
    || canonicalAdmission.kind !== "porter-heavy-departure"
    || canonicalAdmission.receivedAtTick !== completedTick
    || canonicalAdmission.eventId !== event.eventId
    || canonicalAdmission.sourceActorId !== event.sourceActorId
    || canonicalAdmission.triggerEventId !== event.triggerEventId
    || event.meaning !== "porter-heavy-load"
    || projectSituatedExpression(event) === null
    || !workingPeopleExpressionEventMatchesWorld(economyWorld, event)
  ) return false;

  const sourceResidents = economyWorld.residents.filter(
    ({ identity }) => identity.stableId === event.sourceActorId,
  );
  if (sourceResidents.length !== 1) return false;
  const sourceResident = sourceResidents[0];
  if (sourceResident === undefined) return false;
  let sourceAddress: ReturnType<typeof livingActorAddressForResident>;
  try {
    sourceAddress = livingActorAddressForResident(economyWorld, sourceResident);
  } catch {
    return false;
  }
  if (
    sourceAddress === null
    || stableStringify(sourceAddress.position) !== stableStringify(event.position)
  ) return false;
  const sourcePlacement = livingActorAddressInRegionalWindow(sourceAddress, window);
  const listenerPoint = listenerPointInWindow(window, canonicalAdmission.listenerPosition);
  if (sourcePlacement === null || listenerPoint === null) return false;

  const eventTimePlayer: PlayerState = {
    ...playerTemplate,
    worldWidth: window.terrain.width,
    worldHeight: window.terrain.height,
    x: listenerPoint.x,
    y: listenerPoint.y,
    previousX: listenerPoint.x,
    previousY: listenerPoint.y,
    velocityX: 0,
    velocityY: 0,
    facingMilliRadians: canonicalAdmission.listenerFacingMilliRadians,
  };
  const reconstructedListener = playerWorldPositionInRegionalWindow(window, eventTimePlayer);
  if (
    reconstructedListener === null
    || stableStringify(reconstructedListener)
      !== stableStringify(canonicalAdmission.listenerPosition)
  ) return false;

  const perception = projectPerception(spatialWorld, eventTimePlayer);
  if (perception.detailVisibilityGrades[sourcePlacement.tileIndex] !== VISIBILITY_DIRECT) {
    return false;
  }

  const masking = ambientNoiseAt(spatialWorld, playerTileIndex(eventTimePlayer));
  if (masking === null) return false;
  let delta: ReturnType<typeof worldPositionDelta>;
  try {
    delta = worldPositionDelta(canonicalAdmission.listenerPosition, event.position);
  } catch {
    return false;
  }
  const acoustics = situatedExpressionAcoustics(event.volume);
  const heard = evaluateAudibleContact({
    listener: { x: 0, y: 0 },
    source: { x: delta.x, y: delta.y },
    baseRange: acoustics.rangeUnits,
    ambientNoise: masking,
    sourceLoudness: acoustics.loudness / FIXED_POINT,
    wind: {
      x: spatialWorld.weather.windX / FIXED_POINT,
      y: spatialWorld.weather.windY / FIXED_POINT,
    },
  });
  const certainty = heard === null
    ? null
    : Math.max(1, Math.round(heard.certainty * FIXED_POINT));
  return certainty === canonicalAdmission.hearingCertainty;
}

function listenerPointInWindow(
  window: RegionalTerrainWindow,
  position: PorterHeavyDepartureExpressionAdmissionRecord["listenerPosition"],
): Readonly<{ x: number; y: number }> | null {
  try {
    const originAddress = globalTileToRegion(window.origin.x, window.origin.y);
    const frame = createSpatialFrame(
      createWorldPosition(
        originAddress.region,
        originAddress.localX * WORLD_POSITION_UNITS_PER_TILE,
        originAddress.localY * WORLD_POSITION_UNITS_PER_TILE,
      ),
      window.terrain.width * WORLD_POSITION_UNITS_PER_TILE,
      window.terrain.height * WORLD_POSITION_UNITS_PER_TILE,
    );
    return worldPositionToSpatialFrame(frame, position);
  } catch {
    return null;
  }
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const sortedExpected = [...expected].sort(compareText);
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

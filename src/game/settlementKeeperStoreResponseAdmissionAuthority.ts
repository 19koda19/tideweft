import { FIXED_POINT, type WorldView } from "../sim/types";
import { globalTileToRegion } from "../sim/regions";
import { stableStringify } from "../sim/util";
import { ambientNoiseAt } from "./physicalAcousticPerception";
import {
  livingActorAddressForResident,
  livingActorAddressInRegionalWindow,
} from "./livingActor";
import { evaluateAudibleContact, VISIBILITY_DIRECT } from "./perception";
import { playerTileIndex, type PlayerState } from "./player";
import { projectPerception, RESIDENT_CONVERSATION_RANGE_TILES } from "./projection";
import type { RegionalTerrainWindow } from "./regionalTravel";
import {
  regionalCompatibilityWorldForWorld,
  regionalWindowForWorld,
} from "./regionalWorldView";
import { playerWorldPositionInRegionalWindow } from "./residentSpatial";
import {
  projectSettlementKeeperStoreClosureAuthority,
  type SettlementEcologyState,
} from "./settlementEcology";
import {
  settlementKeeperStoreResponseExpressionEventMatchesWorld,
} from "./settlementKeeperStoreResponseExpression";
import type { SituatedExpressionEvent } from "./situatedExpression";
import { situatedExpressionAcoustics } from "./situatedExpressionAcoustics";
import {
  canonicalizeSituatedExpressionAdmissionRecord,
  type SettlementKeeperStoreResponseExpressionAdmissionRecord,
} from "./situatedExpressionAdmissionLedger";
import {
  createHeardVisibleSituatedExpressionReception,
  type SituatedExpressionReception,
} from "./situatedExpressionReception";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createSpatialFrame,
  createWorldPosition,
  worldPositionDelta,
  worldPositionToSpatialFrame,
} from "./worldPosition";

export interface SettlementKeeperStoreResponseAdmissionAuthorityInput {
  readonly economyWorld: WorldView;
  readonly spatialWorld: WorldView;
  readonly window: RegionalTerrainWindow;
  readonly playerTemplate: PlayerState;
  readonly settlement: SettlementEcologyState;
  readonly event: SituatedExpressionEvent;
  readonly admission: SettlementKeeperStoreResponseExpressionAdmissionRecord;
}

export interface SettlementKeeperStoreResponseReceptionAuthorityInput
  extends SettlementKeeperStoreResponseAdmissionAuthorityInput {
  readonly reception: SituatedExpressionReception | null;
}

/**
 * Replays the recorded event-time in-person receipt. Present player pose
 * cannot rewrite whether the committed keeper reply was visible or audible.
 */
export function settlementKeeperStoreResponseReceptionMatchesEventTime(
  inputValue: SettlementKeeperStoreResponseReceptionAuthorityInput,
): boolean {
  const expected = settlementKeeperStoreResponseReceptionAtEventTime(inputValue);
  return expected !== undefined
    && stableStringify(expected) === stableStringify(inputValue.reception);
}

/** Reauthenticates the transaction, speaker, contact gate, and stored certainty. */
export function settlementKeeperStoreResponseAdmissionMatchesWorld(
  inputValue: SettlementKeeperStoreResponseAdmissionAuthorityInput,
): boolean {
  return settlementKeeperStoreResponseReceptionAtEventTime(inputValue) !== undefined;
}

function settlementKeeperStoreResponseReceptionAtEventTime(
  inputValue: SettlementKeeperStoreResponseAdmissionAuthorityInput,
): SituatedExpressionReception | null | undefined {
  const input: unknown = inputValue;
  if (!plainRecord(input) || !exactKeys(input, [
    "admission",
    "economyWorld",
    "event",
    "playerTemplate",
    "settlement",
    "spatialWorld",
    "window",
  ], ["reception"])) return undefined;
  const {
    economyWorld,
    spatialWorld,
    window,
    playerTemplate,
    settlement,
    event,
  } = inputValue;
  if (
    economyWorld.completedTick !== spatialWorld.completedTick
    || regionalWindowForWorld(spatialWorld) !== window
    || regionalCompatibilityWorldForWorld(spatialWorld) !== economyWorld
    || window.terrain.width !== spatialWorld.terrain.width
    || window.terrain.height !== spatialWorld.terrain.height
    || window.terrain.tiles.length !== spatialWorld.terrain.tiles.length
  ) return undefined;

  const admission = canonicalizeSituatedExpressionAdmissionRecord(inputValue.admission);
  if (
    admission === null
    || admission.kind !== "settlement-keeper-store-response"
    || admission.respondedAtTick !== economyWorld.completedTick
    || admission.eventId !== event.eventId
    || admission.sourceActorId !== event.sourceActorId
    || admission.triggerEventId !== event.triggerEventId
    || event.meaning !== "keeper-secure-store-response"
    || !settlementKeeperStoreResponseExpressionEventMatchesWorld(
      { world: economyWorld, settlement },
      event,
    )
  ) return undefined;
  const closure = projectSettlementKeeperStoreClosureAuthority(settlement);
  if (
    closure === null
    || closure.transactionId !== admission.closureTransactionId
    || closure.transactionId !== admission.triggerEventId
    || closure.keeperActorId !== admission.sourceActorId
    || closure.storeId !== admission.storeId
    || closure.sourceEvidenceId !== admission.sourceEvidenceId
    || closure.sourceEvidenceAtTick !== admission.respondedAtTick
    || closure.source !== "player-report"
  ) return undefined;

  const keepers = economyWorld.residents.filter(({ identity }) => (
    identity.stableId === admission.sourceActorId
  ));
  const keeper = keepers[0];
  if (keepers.length !== 1 || keeper === undefined) return undefined;
  let sourceAddress: ReturnType<typeof livingActorAddressForResident>;
  try {
    sourceAddress = livingActorAddressForResident(economyWorld, keeper);
  } catch {
    return undefined;
  }
  if (
    sourceAddress === null
    || stableStringify(sourceAddress.position) !== stableStringify(event.position)
  ) return undefined;
  const sourcePlacement = livingActorAddressInRegionalWindow(sourceAddress, window);
  const listenerPoint = listenerPointInWindow(window, admission.listenerPosition);
  if (sourcePlacement === null || listenerPoint === null) return undefined;

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
    facingMilliRadians: admission.listenerFacingMilliRadians,
    timeAction: null,
  };
  const reconstructed = playerWorldPositionInRegionalWindow(window, eventTimePlayer);
  if (
    reconstructed === null
    || stableStringify(reconstructed) !== stableStringify(admission.listenerPosition)
    || projectPerception(spatialWorld, eventTimePlayer)
      .detailVisibilityGrades[sourcePlacement.tileIndex] !== VISIBILITY_DIRECT
  ) return undefined;
  let delta: ReturnType<typeof worldPositionDelta>;
  try {
    delta = worldPositionDelta(admission.listenerPosition, event.position);
  } catch {
    return undefined;
  }
  const maximumDistance = RESIDENT_CONVERSATION_RANGE_TILES
    * WORLD_POSITION_UNITS_PER_TILE;
  if (delta.x * delta.x + delta.y * delta.y > maximumDistance * maximumDistance) {
    return undefined;
  }
  const masking = ambientNoiseAt(spatialWorld, playerTileIndex(eventTimePlayer));
  if (masking === null) return undefined;
  const acoustics = situatedExpressionAcoustics(event);
  const contact = evaluateAudibleContact({
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
  if (contact === null) {
    return admission.hearingCertainty === null ? null : undefined;
  }
  const certainty = Math.max(1, Math.round(contact.certainty * FIXED_POINT));
  if (admission.hearingCertainty !== certainty) return undefined;
  return createHeardVisibleSituatedExpressionReception(
    event,
    admission.respondedAtTick,
    certainty,
    true,
  ) ?? undefined;
}

function listenerPointInWindow(
  window: RegionalTerrainWindow,
  position: SettlementKeeperStoreResponseExpressionAdmissionRecord["listenerPosition"],
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

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => allowed.has(key));
}

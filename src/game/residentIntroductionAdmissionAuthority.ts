import { globalTileToRegion } from "../sim/regions";
import { FIXED_POINT, type WorldView } from "../sim/types";
import { stableStringify } from "../sim/util";
import { ambientNoiseAt } from "./physicalAcousticPerception";
import { evaluateAudibleContact, VISIBILITY_DIRECT } from "./perception";
import { playerTileIndex, type PlayerState } from "./player";
import { projectPerception, RESIDENT_CONVERSATION_RANGE_TILES } from "./projection";
import type { RegionalTerrainWindow } from "./regionalTravel";
import {
  regionalCompatibilityWorldForWorld,
  regionalWindowForWorld,
} from "./regionalWorldView";
import {
  residentIntroductionExpressionEventMatchesWorld,
  residentIntroductionTriggerEventId,
  resumeResidentIntroductionPresentationEvent,
} from "./residentIntroductionExpression";
import { playerWorldPositionInRegionalWindow } from "./residentSpatial";
import {
  situatedExpressionEventIdForTrigger,
  type SituatedExpressionEvent,
  type SituatedExpressionMemory,
} from "./situatedExpression";
import type {
  ActiveSituatedExpressionChannelPair,
  SituatedExpressionChannelBank,
} from "./situatedExpressionChannelBank";
import { situatedExpressionAcoustics } from "./situatedExpressionAcoustics";
import {
  createResidentIntroductionExpressionAdmissionRecord,
  SITUATED_EXPRESSION_ADMISSION_LEDGER_MAX_RECORDS,
  SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
  SITUATED_EXPRESSION_ADMISSION_MAX_PLAYER_STEP_PHASE,
  type ResidentIntroductionExpressionAdmissionRecord,
  type SituatedExpressionAdmissionLedger,
} from "./situatedExpressionAdmissionLedger";
import {
  createSituatedExpressionPresentationLeases,
  putSituatedExpressionPresentationLease,
  type SituatedExpressionPresentationLeases,
} from "./situatedExpressionPresentationLease";
import {
  createHeardVisibleSituatedExpressionReception,
  type SituatedExpressionReception,
} from "./situatedExpressionReception";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createSpatialFrame,
  createWorldPosition,
  isWorldPosition,
  worldPositionDelta,
  worldPositionToSpatialFrame,
  type WorldPosition,
} from "./worldPosition";

/**
 * Structural evidence expected from the bounded admission ledger. The ledger
 * remains the schema owner; keeping this authority structurally typed lets the
 * transaction be implemented without creating a second persistence schema.
 */
export interface ResidentIntroductionExpressionAdmissionEvidence {
  readonly version: typeof SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION;
  readonly eventId: string;
  readonly sourceActorId: string;
  readonly triggerEventId: string;
  readonly sampleOrdinal: number;
  readonly admittedAtPlayerStepPhase: number;
  readonly kind: "resident-introduction";
  readonly introducedAtTick: number;
  readonly commandId: string;
  readonly homeSettlementId: number;
  readonly listenerPosition: WorldPosition;
  readonly listenerFacingMilliRadians: number;
  /** A committed acquaintance always has a heard-and-visible player receipt. */
  readonly hearingCertainty: number;
}

export interface PreparedResidentIntroductionEventTimeReceipt {
  readonly admission: ResidentIntroductionExpressionAdmissionRecord;
  readonly reception: SituatedExpressionReception;
}

export interface ResidentIntroductionAdmissionAuthorityInput {
  readonly economyWorld: WorldView;
  readonly spatialWorld: WorldView;
  readonly window: RegionalTerrainWindow;
  /** Current player shape; event-time position and facing come from evidence. */
  readonly playerTemplate: PlayerState;
  readonly event: SituatedExpressionEvent;
  readonly admission: ResidentIntroductionExpressionAdmissionEvidence;
}

export interface ResidentIntroductionReceptionAuthorityInput
  extends ResidentIntroductionAdmissionAuthorityInput {
  readonly reception: SituatedExpressionReception | null;
}

export interface ResidentIntroductionPresentationRecoveryInput {
  readonly economyWorld: WorldView;
  readonly spatialWorld: WorldView;
  readonly window: RegionalTerrainWindow;
  readonly playerTemplate: PlayerState;
  readonly memory: SituatedExpressionMemory;
  readonly admission: ResidentIntroductionExpressionAdmissionEvidence;
}

export interface ResidentIntroductionPresentationCarryRecoveryInput {
  readonly economyWorld: WorldView;
  readonly spatialWorld: WorldView;
  readonly window: RegionalTerrainWindow;
  readonly playerTemplate: PlayerState;
  readonly intervalStartPosition: WorldPosition;
  readonly intervalStartFacingMilliRadians: number;
  readonly channels: SituatedExpressionChannelBank;
  readonly admissions: SituatedExpressionAdmissionLedger;
}

/** Reauthenticates the exact simulation event, resident state, and player receipt. */
export function residentIntroductionAdmissionMatchesWorld(
  inputValue: ResidentIntroductionAdmissionAuthorityInput,
): boolean {
  return residentIntroductionReceptionAtEventTime(inputValue) !== undefined;
}

/**
 * Replays the event-time reception without trusting present player pose. The
 * output is acoustic evidence only: no introduced name, occupation, or home
 * fact is returned for this or any third-party listener to inherit.
 */
export function residentIntroductionReceptionMatchesEventTime(
  inputValue: ResidentIntroductionReceptionAuthorityInput,
): boolean {
  const expected = residentIntroductionReceptionAtEventTime(inputValue);
  return expected !== undefined
    && stableStringify(expected) === stableStringify(inputValue.reception);
}

/**
 * Re-derives the already-committed player receipt for presentation recovery.
 * This never admits a new event: exact world, admission, event-time player
 * pose, visibility, and acoustics must all still authenticate first.
 */
export function residentIntroductionReceptionForEventTime(
  inputValue: ResidentIntroductionAdmissionAuthorityInput,
): SituatedExpressionReception | null {
  return residentIntroductionReceptionAtEventTime(inputValue) ?? null;
}

/**
 * Recovers one presentation-only pair from current-schema semantic carry.
 * Sound and hearing remain consumed: the resumed event is acknowledged and
 * this pair never re-enters the authoritative channel or sound-sample lists.
 */
export function resumeResidentIntroductionPresentationPair(
  inputValue: ResidentIntroductionPresentationRecoveryInput,
): ActiveSituatedExpressionChannelPair | null {
  const event = resumeResidentIntroductionPresentationEvent(
    inputValue.economyWorld,
    inputValue.memory,
  );
  if (
    event === null
    || event.eventId !== inputValue.admission.eventId
    || event.sourceActorId !== inputValue.admission.sourceActorId
    || event.triggerEventId !== inputValue.admission.triggerEventId
  ) return null;
  const reception = residentIntroductionReceptionForEventTime({
    economyWorld: inputValue.economyWorld,
    spatialWorld: inputValue.spatialWorld,
    window: inputValue.window,
    playerTemplate: inputValue.playerTemplate,
    event,
    admission: inputValue.admission,
  });
  return reception === null
    ? null
    : Object.freeze({ sourceActorId: event.sourceActorId, event, reception });
}

/**
 * Rebuilds protected introduction readability for a loaded current interval.
 * Active introductions receive the lease too: the live source lane hides the
 * duplicate, while a later higher-priority same-source expression cannot erase
 * the guaranteed first line.
 */
export function restoreResidentIntroductionPresentationLeasesFromCarry(
  inputValue: ResidentIntroductionPresentationCarryRecoveryInput,
): SituatedExpressionPresentationLeases | null {
  let restored = createSituatedExpressionPresentationLeases();
  for (const channel of inputValue.channels.channels) {
    for (const memory of channel.state.recent) {
      if (memory.meaning !== "resident-introduction") continue;
      const admissions = inputValue.admissions.records.filter(
        (candidate): candidate is ResidentIntroductionExpressionAdmissionRecord => (
          candidate.kind === "resident-introduction"
          && candidate.sourceActorId === memory.sourceActorId
          && candidate.triggerEventId === memory.triggerEventId
        ),
      );
      const admission = admissions[0];
      if (
        admissions.length !== 1
        || admission === undefined
        || stableStringify(admission.listenerPosition)
          !== stableStringify(inputValue.intervalStartPosition)
        || admission.listenerFacingMilliRadians
          !== inputValue.intervalStartFacingMilliRadians
      ) return null;
      const pair = resumeResidentIntroductionPresentationPair({
        economyWorld: inputValue.economyWorld,
        spatialWorld: inputValue.spatialWorld,
        window: inputValue.window,
        playerTemplate: inputValue.playerTemplate,
        memory,
        admission,
      });
      if (pair === null) return null;
      restored = putSituatedExpressionPresentationLease(restored, pair);
    }
  }
  return restored;
}

/**
 * Derives the player receipt for a candidate introduction from world truth.
 *
 * This is intentionally not a caller-authored `heard` flag. The exact
 * simulation event, source position, player pose, direct sight, range,
 * weather masking, and spoken acoustics must all agree before acquaintance
 * can be adopted by the runtime's cross-root transaction.
 */
export function prepareResidentIntroductionEventTimeReceipt(
  inputValue: Readonly<{
    economyWorld: WorldView;
    spatialWorld: WorldView;
    window: RegionalTerrainWindow;
    playerTemplate: PlayerState;
    event: SituatedExpressionEvent;
    sampleOrdinal: number;
  }>,
): PreparedResidentIntroductionEventTimeReceipt | null {
  const input: unknown = inputValue;
  if (!plainRecord(input) || !exactKeys(input, [
    "economyWorld",
    "event",
    "playerTemplate",
    "sampleOrdinal",
    "spatialWorld",
    "window",
  ])) return null;
  const {
    economyWorld,
    spatialWorld,
    window,
    playerTemplate,
    event,
    sampleOrdinal,
  } = inputValue;
  if (
    !boundedInteger(
      sampleOrdinal,
      0,
      SITUATED_EXPRESSION_ADMISSION_LEDGER_MAX_RECORDS - 1,
    )
    || !residentIntroductionExpressionEventMatchesWorld(economyWorld, event)
  ) return null;

  const triggers = economyWorld.events.filter((candidate) => (
    candidate.type === "resident-introduced"
    && residentIntroductionTriggerEventId(candidate) === event.triggerEventId
  ));
  const trigger = triggers[0];
  const commandId = trigger?.data.commandId;
  const homeSettlementId = trigger?.data.homeSettlementId;
  if (
    triggers.length !== 1
    || trigger === undefined
    || typeof commandId !== "string"
    || !validId(commandId)
    || !nonnegativeSafeInteger(homeSettlementId)
  ) return null;

  const listenerPosition = playerWorldPositionInRegionalWindow(window, playerTemplate);
  if (listenerPosition === null) return null;
  let delta: ReturnType<typeof worldPositionDelta>;
  try {
    delta = worldPositionDelta(listenerPosition, event.position);
  } catch {
    return null;
  }
  const masking = ambientNoiseAt(spatialWorld, playerTileIndex(playerTemplate));
  if (masking === null) return null;
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
  if (contact === null) return null;
  const hearingCertainty = Math.max(1, Math.round(contact.certainty * FIXED_POINT));
  const admission = createResidentIntroductionExpressionAdmissionRecord({
    sourceActorId: event.sourceActorId,
    triggerEventId: event.triggerEventId,
    sampleOrdinal,
    admittedAtPlayerStepPhase: 0,
    commandId,
    introducedAtTick: trigger.tick,
    homeSettlementId,
    listenerPosition,
    listenerFacingMilliRadians: playerTemplate.facingMilliRadians,
    hearingCertainty,
  });
  const reception = createHeardVisibleSituatedExpressionReception(
    event,
    trigger.tick,
    hearingCertainty,
    true,
  );
  if (admission === null || reception === null) return null;
  const authority = {
    economyWorld,
    spatialWorld,
    window,
    playerTemplate,
    event,
    admission,
  } as const;
  return residentIntroductionAdmissionMatchesWorld(authority)
    && residentIntroductionReceptionMatchesEventTime({ ...authority, reception })
    ? Object.freeze({ admission, reception })
    : null;
}

function residentIntroductionReceptionAtEventTime(
  inputValue: ResidentIntroductionAdmissionAuthorityInput,
): SituatedExpressionReception | null | undefined {
  const input: unknown = inputValue;
  if (!plainRecord(input) || !exactKeys(input, [
    "admission",
    "economyWorld",
    "event",
    "playerTemplate",
    "spatialWorld",
    "window",
  ], ["reception"])) return undefined;
  const {
    economyWorld,
    spatialWorld,
    window,
    playerTemplate,
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

  const admission = canonicalAdmissionEvidence(inputValue.admission);
  if (
    admission === null
    || admission.admittedAtPlayerStepPhase !== 0
    || admission.introducedAtTick !== economyWorld.completedTick
    || admission.eventId !== event.eventId
    || admission.sourceActorId !== event.sourceActorId
    || admission.triggerEventId !== event.triggerEventId
    || event.meaning !== "resident-introduction"
    || !residentIntroductionExpressionEventMatchesWorld(economyWorld, event)
  ) return undefined;

  const triggers = economyWorld.events.filter((candidate) => (
    candidate.type === "resident-introduced"
    && residentIntroductionTriggerEventId(candidate) === admission.triggerEventId
  ));
  const trigger = triggers[0];
  if (
    triggers.length !== 1
    || trigger === undefined
    || trigger.type !== "resident-introduced"
    || trigger.tick !== admission.introducedAtTick
    || trigger.data.commandId !== admission.commandId
    || trigger.data.homeSettlementId !== admission.homeSettlementId
    || trigger.data.knowledgeLevel !== "acquainted"
    || trigger.subjectId === null
  ) return undefined;

  const residents = economyWorld.residents.filter(({ identity }) => (
    identity.stableId === admission.sourceActorId
  ));
  const resident = residents[0];
  if (
    residents.length !== 1
    || resident === undefined
    || resident.id !== trigger.subjectId
    || resident.homeSettlementId !== admission.homeSettlementId
    || resident.playerKnowledge.level !== "acquainted"
    || resident.playerKnowledge.introducedTick !== admission.introducedAtTick
    || stableStringify(resident.playerKnowledge.facts)
      !== stableStringify(["name", "occupation", "home"])
  ) return undefined;

  const sourcePoint = pointInWindow(window, event.position);
  const listenerPoint = listenerPointInWindow(window, admission.listenerPosition);
  if (sourcePoint === null || listenerPoint === null) return undefined;
  const sourceTileX = Math.floor(sourcePoint.x / WORLD_POSITION_UNITS_PER_TILE);
  const sourceTileY = Math.floor(sourcePoint.y / WORLD_POSITION_UNITS_PER_TILE);
  if (
    sourceTileX < 0
    || sourceTileY < 0
    || sourceTileX >= window.terrain.width
    || sourceTileY >= window.terrain.height
  ) return undefined;
  const sourceTileIndex = sourceTileY * window.terrain.width + sourceTileX;

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
      .detailVisibilityGrades[sourceTileIndex] !== VISIBILITY_DIRECT
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
  if (contact === null) return undefined;
  const certainty = Math.max(1, Math.round(contact.certainty * FIXED_POINT));
  if (admission.hearingCertainty !== certainty) return undefined;
  return createHeardVisibleSituatedExpressionReception(
    event,
    admission.introducedAtTick,
    certainty,
    true,
  ) ?? undefined;
}

function canonicalAdmissionEvidence(
  value: unknown,
): ResidentIntroductionExpressionAdmissionEvidence | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "admittedAtPlayerStepPhase",
    "commandId",
    "eventId",
    "hearingCertainty",
    "homeSettlementId",
    "introducedAtTick",
    "kind",
    "listenerFacingMilliRadians",
    "listenerPosition",
    "sampleOrdinal",
    "sourceActorId",
    "triggerEventId",
    "version",
  ])) return null;
  const expectedEventId = situatedExpressionEventIdForTrigger(
    value.sourceActorId,
    value.triggerEventId,
  );
  if (
    value.version !== SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION
    || value.kind !== "resident-introduction"
    || expectedEventId === null
    || value.eventId !== expectedEventId
    || !boundedInteger(
      value.sampleOrdinal,
      0,
      SITUATED_EXPRESSION_ADMISSION_LEDGER_MAX_RECORDS - 1,
    )
    || !boundedInteger(
      value.admittedAtPlayerStepPhase,
      0,
      SITUATED_EXPRESSION_ADMISSION_MAX_PLAYER_STEP_PHASE,
    )
    || !nonnegativeSafeInteger(value.introducedAtTick)
    || !validId(value.commandId)
    || !nonnegativeSafeInteger(value.homeSettlementId)
    || !isWorldPosition(value.listenerPosition)
    || !canonicalSafeInteger(value.listenerFacingMilliRadians)
    || !positiveBoundedUnit(value.hearingCertainty)
  ) return null;
  return Object.freeze({
    version: SITUATED_EXPRESSION_ADMISSION_LEDGER_VERSION,
    eventId: value.eventId,
    sourceActorId: value.sourceActorId as string,
    triggerEventId: value.triggerEventId as string,
    sampleOrdinal: value.sampleOrdinal,
    admittedAtPlayerStepPhase: value.admittedAtPlayerStepPhase,
    kind: "resident-introduction",
    introducedAtTick: value.introducedAtTick,
    commandId: value.commandId,
    homeSettlementId: value.homeSettlementId,
    listenerPosition: createWorldPosition(
      value.listenerPosition.region,
      value.listenerPosition.localX,
      value.listenerPosition.localY,
    ),
    listenerFacingMilliRadians: value.listenerFacingMilliRadians,
    hearingCertainty: value.hearingCertainty,
  });
}

function listenerPointInWindow(
  window: RegionalTerrainWindow,
  position: WorldPosition,
): Readonly<{ x: number; y: number }> | null {
  return pointInWindow(window, position);
}

function pointInWindow(
  window: RegionalTerrainWindow,
  position: WorldPosition,
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

function validId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 180
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function canonicalSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0);
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return canonicalSafeInteger(value) && value >= 0;
}

function boundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return canonicalSafeInteger(value) && value >= minimum && value <= maximum;
}

function positiveBoundedUnit(value: unknown): value is number {
  return boundedInteger(value, 1, FIXED_POINT);
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

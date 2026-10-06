import { globalTileToRegion } from "../sim/regions";
import { FIXED_POINT, type WorldView } from "../sim/types";
import { stableStringify } from "../sim/util";
import { ambientNoiseAt } from "./physicalAcousticPerception";
import { evaluateAudibleContact, VISIBILITY_DIRECT } from "./perception";
import { playerTileIndex, type PlayerState } from "./player";
import { projectLegacyPlayerPerception, projectPerception } from "./projection";
import type { RegionalTerrainWindow } from "./regionalTravel";
import {
  regionalCompatibilityWorldForWorld,
  regionalWindowForWorld,
} from "./regionalWorldView";
import {
  residentWeatherHoldExpressionEventMatchesWorld,
  residentWeatherHoldTriggerEventId,
} from "./residentWeatherHoldExpression";
import { playerWorldPositionInRegionalWindow } from "./residentSpatial";
import type { SituatedExpressionEvent } from "./situatedExpression";
import { situatedExpressionAcoustics } from "./situatedExpressionAcoustics";
import {
  SITUATED_EXPRESSION_ADMISSION_LEDGER_MAX_RECORDS,
  canonicalizeSituatedExpressionAdmissionRecord,
  createResidentWeatherHoldExpressionAdmissionRecord,
  type ResidentWeatherHoldExpressionAdmissionRecord as LedgerResidentWeatherHoldExpressionAdmissionRecord,
  type ResidentWeatherHoldReceptionKind as LedgerResidentWeatherHoldReceptionKind,
} from "./situatedExpressionAdmissionLedger";
import {
  createHeardUnseenSituatedExpressionReception,
  createHeardVisibleSituatedExpressionReception,
  type SituatedExpressionReception,
} from "./situatedExpressionReception";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createSpatialFrame,
  createWorldPosition,
  worldPositionDelta,
  worldPositionToSpatialFrame,
  type WorldPosition,
} from "./worldPosition";

export type ResidentWeatherHoldReceptionKind = LedgerResidentWeatherHoldReceptionKind;
export type ResidentWeatherHoldExpressionAdmissionEvidence =
  LedgerResidentWeatherHoldExpressionAdmissionRecord;

export interface PreparedResidentWeatherHoldEventTimeReceipt {
  readonly admission: ResidentWeatherHoldExpressionAdmissionEvidence;
  readonly reception: SituatedExpressionReception | null;
}

export interface ResidentWeatherHoldAdmissionAuthorityInput {
  readonly economyWorld: WorldView;
  readonly spatialWorld: WorldView;
  readonly window: RegionalTerrainWindow;
  /** Current player shape; event-time position and facing come from evidence. */
  readonly playerTemplate: PlayerState;
  /** Independent phase-zero carry evidence; current recovery state may be later. */
  readonly listenerWasSleepingAtIntervalStart: boolean;
  readonly event: SituatedExpressionEvent;
  readonly admission: ResidentWeatherHoldExpressionAdmissionEvidence;
}

export interface ResidentWeatherHoldReceptionAuthorityInput
  extends ResidentWeatherHoldAdmissionAuthorityInput {
  readonly reception: SituatedExpressionReception | null;
}

/** Reauthenticates the exact weather hold, route locus, and event-time receipt. */
export function residentWeatherHoldAdmissionMatchesWorld(
  inputValue: ResidentWeatherHoldAdmissionAuthorityInput,
): boolean {
  return residentWeatherHoldReceptionAtEventTime(inputValue) !== undefined;
}

/**
 * Replays the event-time sensory decision without trusting present player pose
 * or the resident's later route progress. A null reception is a lawful result.
 */
export function residentWeatherHoldReceptionMatchesEventTime(
  inputValue: ResidentWeatherHoldReceptionAuthorityInput,
): boolean {
  const expected = residentWeatherHoldReceptionAtEventTime(inputValue);
  return expected !== undefined
    && stableStringify(expected) === stableStringify(inputValue.reception);
}

/**
 * Derives one current-tick player receipt from authoritative world acoustics.
 * Unheard speech is still admitted with a null receipt so other actors may hear
 * the same world event; this function never turns player hearing into authority
 * for whether the resident spoke.
 */
export function prepareResidentWeatherHoldEventTimeReceipt(
  inputValue: Readonly<{
    economyWorld: WorldView;
    spatialWorld: WorldView;
    window: RegionalTerrainWindow;
    playerTemplate: PlayerState;
    listenerWasSleepingAtIntervalStart: boolean;
    event: SituatedExpressionEvent;
    sampleOrdinal: number;
  }>,
): PreparedResidentWeatherHoldEventTimeReceipt | null {
  const input: unknown = inputValue;
  if (!plainRecord(input) || !exactKeys(input, [
    "economyWorld",
    "event",
    "listenerWasSleepingAtIntervalStart",
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
    listenerWasSleepingAtIntervalStart,
    event,
    sampleOrdinal,
  } = inputValue;
  if (
    !boundedInteger(
      sampleOrdinal,
      0,
      SITUATED_EXPRESSION_ADMISSION_LEDGER_MAX_RECORDS - 1,
    )
    || !residentWeatherHoldExpressionEventMatchesWorld(economyWorld, event)
  ) return null;

  const triggers = economyWorld.events.filter((candidate) => (
    candidate.type === "resident-sheltered"
    && residentWeatherHoldTriggerEventId(candidate) === event.triggerEventId
  ));
  const trigger = triggers[0];
  const contractId = trigger?.data.contractId;
  const eventRouteId = trigger?.data.eventRouteId;
  const eventRouteProgress = trigger?.data.eventRouteProgress;
  if (
    triggers.length !== 1
    || trigger === undefined
    || !positiveSafeInteger(contractId)
    || !positiveSafeInteger(eventRouteId)
    || !boundedInteger(eventRouteProgress, 0, FIXED_POINT)
  ) return null;

  const listenerPosition = playerWorldPositionInRegionalWindow(window, playerTemplate);
  if (listenerPosition === null) return null;
  if (
    typeof listenerWasSleepingAtIntervalStart !== "boolean"
    || (playerTemplate.timeAction?.kind === "sleep")
      !== listenerWasSleepingAtIntervalStart
  ) return null;
  const listenerWasSleepingAtAdmission = listenerWasSleepingAtIntervalStart;
  const sensory = eventTimeSensoryReceipt({
    spatialWorld,
    window,
    playerTemplate,
    listenerPosition,
    listenerFacingMilliRadians: playerTemplate.facingMilliRadians,
    event,
    listenerWasSleepingAtAdmission,
  });
  if (sensory === null) return null;
  const admission = createResidentWeatherHoldExpressionAdmissionRecord({
    sourceActorId: event.sourceActorId,
    triggerEventId: event.triggerEventId,
    sampleOrdinal,
    admittedAtPlayerStepPhase: 0,
    contractId,
    shelteredAtTick: trigger.tick,
    eventRouteId,
    eventRouteProgress,
    listenerPosition,
    listenerFacingMilliRadians: playerTemplate.facingMilliRadians,
    listenerWasSleepingAtAdmission,
    receptionKind: sensory.receptionKind,
    hearingCertainty: sensory.hearingCertainty,
  });
  if (admission === null) return null;
  const authority = {
    economyWorld,
    spatialWorld,
    window,
    playerTemplate,
    listenerWasSleepingAtIntervalStart,
    event,
    admission,
  } as const;
  return residentWeatherHoldAdmissionMatchesWorld(authority)
    && residentWeatherHoldReceptionMatchesEventTime({
      ...authority,
      reception: sensory.reception,
    })
    ? Object.freeze({ admission, reception: sensory.reception })
    : null;
}

function residentWeatherHoldReceptionAtEventTime(
  inputValue: ResidentWeatherHoldAdmissionAuthorityInput,
): SituatedExpressionReception | null | undefined {
  const input: unknown = inputValue;
  if (!plainRecord(input) || !exactKeys(input, [
    "admission",
    "economyWorld",
    "event",
    "listenerWasSleepingAtIntervalStart",
    "playerTemplate",
    "spatialWorld",
    "window",
  ], ["reception"])) return undefined;
  const {
    economyWorld,
    spatialWorld,
    window,
    playerTemplate,
    listenerWasSleepingAtIntervalStart,
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

  const canonicalAdmission = canonicalizeSituatedExpressionAdmissionRecord(
    inputValue.admission,
  );
  const admission = canonicalAdmission?.kind === "resident-weather-hold"
    ? canonicalAdmission
    : null;
  if (
    admission === null
    || admission.admittedAtPlayerStepPhase !== 0
    || admission.shelteredAtTick !== economyWorld.completedTick
    || admission.eventId !== event.eventId
    || admission.sourceActorId !== event.sourceActorId
    || admission.triggerEventId !== event.triggerEventId
    || event.meaning !== "resident-weather-hold"
    || !residentWeatherHoldExpressionEventMatchesWorld(economyWorld, event)
    || admission.listenerWasSleepingAtAdmission
      !== listenerWasSleepingAtIntervalStart
  ) return undefined;

  const triggers = economyWorld.events.filter((candidate) => (
    candidate.type === "resident-sheltered"
    && residentWeatherHoldTriggerEventId(candidate) === admission.triggerEventId
  ));
  const trigger = triggers[0];
  if (
    triggers.length !== 1
    || trigger === undefined
    || trigger.tick !== admission.shelteredAtTick
    || trigger.data.contractId !== admission.contractId
    || trigger.data.eventRouteId !== admission.eventRouteId
    || trigger.data.eventRouteProgress !== admission.eventRouteProgress
    || trigger.data.weather !== economyWorld.weather.kind
    || trigger.data.weather !== spatialWorld.weather.kind
    || trigger.data.intensity !== economyWorld.weather.intensity
    || trigger.data.intensity !== spatialWorld.weather.intensity
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
  ) return undefined;
  const contracts = economyWorld.contracts.filter(({ id }) => id === admission.contractId);
  const contract = contracts[0];
  if (
    contracts.length !== 1
    || contract === undefined
    || contract.status !== "in-transit"
    || contract.carrierKind !== "resident"
    || contract.assignedResidentId !== resident.id
    || resident.activeContractId !== contract.id
  ) return undefined;

  // The carry is event-time authority. A still-active recovery action that
  // genuinely predates the admission remains independent contradictory
  // evidence; later or already-completed actions cannot rewrite the receipt.
  const activeRecovery = playerTemplate.timeAction;
  const activeRecoveryPredatesAdmission = activeRecovery !== null && (
    activeRecovery.startedAtWorldTick < admission.shelteredAtTick
    || (
      activeRecovery.startedAtWorldTick === admission.shelteredAtTick
      && activeRecovery.startedAtPlayerStepPhase < admission.admittedAtPlayerStepPhase
    )
  );
  if (
    activeRecoveryPredatesAdmission
    && (activeRecovery.kind === "sleep") !== listenerWasSleepingAtIntervalStart
  ) return undefined;

  let sensory = eventTimeSensoryReceipt({
    spatialWorld,
    window,
    playerTemplate,
    listenerPosition: admission.listenerPosition,
    listenerFacingMilliRadians: admission.listenerFacingMilliRadians,
    event,
    listenerWasSleepingAtAdmission: admission.listenerWasSleepingAtAdmission,
  });
  // A wider view cannot promote an earlier anonymous report or invalidate
  // its save. Only the exact former anonymous receipt may survive replay;
  // committed action, source, listener pose, light and hearing stay required.
  if (sensory?.receptionKind === "heard-visible"
    && admission.receptionKind === "heard-unseen") {
    sensory = eventTimeSensoryReceipt({
      spatialWorld, window, playerTemplate,
      listenerPosition: admission.listenerPosition,
      listenerFacingMilliRadians: admission.listenerFacingMilliRadians,
      event,
      listenerWasSleepingAtAdmission: admission.listenerWasSleepingAtAdmission,
    }, projectLegacyPlayerPerception);
  }
  if (
    sensory === null
    || sensory.receptionKind !== admission.receptionKind
    || sensory.hearingCertainty !== admission.hearingCertainty
  ) return undefined;
  return sensory.reception;
}

interface EventTimeSensoryReceiptInput {
  readonly spatialWorld: WorldView;
  readonly window: RegionalTerrainWindow;
  readonly playerTemplate: PlayerState;
  readonly listenerPosition: WorldPosition;
  readonly listenerFacingMilliRadians: number;
  readonly event: SituatedExpressionEvent;
  readonly listenerWasSleepingAtAdmission: boolean;
}

interface EventTimeSensoryReceipt {
  readonly receptionKind: ResidentWeatherHoldReceptionKind;
  readonly hearingCertainty: number | null;
  readonly reception: SituatedExpressionReception | null;
}

function eventTimeSensoryReceipt(
  input: EventTimeSensoryReceiptInput,
  perceptionForReceipt = projectPerception,
): EventTimeSensoryReceipt | null {
  const sourcePoint = pointInWindow(input.window, input.event.position);
  const listenerPoint = pointInWindow(input.window, input.listenerPosition);
  if (sourcePoint === null || listenerPoint === null) return null;
  const sourceTileX = Math.floor(sourcePoint.x / WORLD_POSITION_UNITS_PER_TILE);
  const sourceTileY = Math.floor(sourcePoint.y / WORLD_POSITION_UNITS_PER_TILE);
  if (
    sourceTileX < 0
    || sourceTileY < 0
    || sourceTileX >= input.window.terrain.width
    || sourceTileY >= input.window.terrain.height
  ) return null;
  const sourceTileIndex = sourceTileY * input.window.terrain.width + sourceTileX;
  const eventTimePlayer: PlayerState = {
    ...input.playerTemplate,
    worldWidth: input.window.terrain.width,
    worldHeight: input.window.terrain.height,
    x: listenerPoint.x,
    y: listenerPoint.y,
    previousX: listenerPoint.x,
    previousY: listenerPoint.y,
    velocityX: 0,
    velocityY: 0,
    facingMilliRadians: input.listenerFacingMilliRadians,
    // Event-time sleep is retained explicitly above. A later action must not
    // alter historical visibility or masking when this receipt is replayed.
    timeAction: null,
  };
  const reconstructed = playerWorldPositionInRegionalWindow(input.window, eventTimePlayer);
  if (
    reconstructed === null
    || stableStringify(reconstructed) !== stableStringify(input.listenerPosition)
  ) return null;
  if (input.listenerWasSleepingAtAdmission) {
    return Object.freeze({
      receptionKind: null,
      hearingCertainty: null,
      reception: null,
    });
  }

  let delta: ReturnType<typeof worldPositionDelta>;
  try {
    delta = worldPositionDelta(input.listenerPosition, input.event.position);
  } catch {
    return null;
  }
  const masking = ambientNoiseAt(input.spatialWorld, playerTileIndex(eventTimePlayer));
  if (masking === null) return null;
  const acoustics = situatedExpressionAcoustics(input.event);
  const contact = evaluateAudibleContact({
    listener: { x: 0, y: 0 },
    source: { x: delta.x, y: delta.y },
    baseRange: acoustics.rangeUnits,
    ambientNoise: masking,
    sourceLoudness: acoustics.loudness / FIXED_POINT,
    wind: {
      x: input.spatialWorld.weather.windX / FIXED_POINT,
      y: input.spatialWorld.weather.windY / FIXED_POINT,
    },
  });
  if (contact === null) {
    return Object.freeze({
      receptionKind: null,
      hearingCertainty: null,
      reception: null,
    });
  }
  const hearingCertainty = Math.max(1, Math.round(contact.certainty * FIXED_POINT));
  const directlyVisible = perceptionForReceipt(input.spatialWorld, eventTimePlayer)
    .detailVisibilityGrades[sourceTileIndex] === VISIBILITY_DIRECT;
  if (directlyVisible) {
    const reception = createHeardVisibleSituatedExpressionReception(
      input.event,
      input.spatialWorld.completedTick,
      hearingCertainty,
      true,
    );
    return reception === null ? null : Object.freeze({
      receptionKind: "heard-visible",
      hearingCertainty,
      reception,
    });
  }
  const reception = createHeardUnseenSituatedExpressionReception(
    input.event,
    input.spatialWorld.completedTick,
    contact,
  );
  return reception === null ? null : Object.freeze({
    receptionKind: "heard-unseen",
    hearingCertainty,
    reception,
  });
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

function canonicalSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0);
}

function positiveSafeInteger(value: unknown): value is number {
  return canonicalSafeInteger(value) && value > 0;
}

function boundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return canonicalSafeInteger(value) && value >= minimum && value <= maximum;
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

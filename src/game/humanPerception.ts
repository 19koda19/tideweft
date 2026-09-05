import {
  ACTOR_PERCEPTION_SCALE,
  MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS,
  canonicalizeActorObservations,
  canonicalizeActorPerceptionState,
  createActorObservation,
  queryActorAttention,
  queryActorSearch,
  type ActorObservation,
  type ActorPerceptionState,
  type ObservationInterrupt,
  type ObservedArea,
} from "../sim/actorPerception";
import { globalTileToRegion } from "../sim/regions";
import { FIXED_POINT, type TerrainTileView, type WorldView } from "../sim/types";
import {
  calculateAmbientNoise,
  evaluateAudibleContact,
  evaluateVisualContact,
  type AudibleContact,
  type PerceptionCell,
} from "./perception";
import type { RegionalTerrainWindow } from "./regionalTravel";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import {
  regionalCompatibilityWorldForWorld,
  regionalWindowForWorld,
} from "./regionalWorldView";
import {
  residentPlacementInRegionalWindow,
  resolveResidentWorldPlacement,
  type ResidentWorldPlacement,
} from "./residentSpatial";
import { deriveWaterFlowProfile } from "./waterFlow";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createSpatialFrame,
  createWorldPosition,
  isWorldPosition,
  translateWorldPosition,
  worldPositionDelta,
  worldPositionToSpatialFrame,
  type SpatialFrame,
  type WorldPosition,
} from "./worldPosition";

export const PLAYER_SENSE_SAMPLE_VERSION = 1 as const;
export const LOCAL_PLAYER_SUBJECT_ID = LOCAL_PLAYER_LIVING_ACTOR_ID;
export const HUMAN_PERCEPTION_MAX_RESIDENTS = 64 as const;
export const HUMAN_PERCEPTION_MAX_PLAYER_SAMPLES = 16 as const;
export const HUMAN_PERCEPTION_MAX_OBSERVATIONS_PER_RESIDENT =
  HUMAN_PERCEPTION_MAX_PLAYER_SAMPLES * 2;
export const HUMAN_HEARING_MAX_RANGE_UNITS = 64 * WORLD_POSITION_UNITS_PER_TILE;

const HEARING_AREA_MAX_RADIUS_UNITS = 10_000_000;
const LOCAL_WATER_MASK_RADIUS_TILES = 2;
const SAMPLE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,47}$/;
const SOUND_CLASS_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const EMPTY_BATCHES: readonly HumanObservationBatch[] = Object.freeze([]);

/** One bounded, explicit player-originated stimulus at a canonical world point. */
export interface PlayerSenseSample {
  readonly version: typeof PLAYER_SENSE_SAMPLE_VERSION;
  readonly id: string;
  /** Monotonic position inside the bounded player-step window. */
  readonly sampleOrdinal: number;
  readonly position: WorldPosition;
  /** Fixed-point 0..1 movement visibility. */
  readonly movementSalience: number;
  /** Fixed-point 0..1 light falling on the player. */
  readonly lightVisibility: number;
  /** Fixed-point 0..1 source loudness; zero means no sound. */
  readonly soundLoudness: number;
  readonly soundRangeUnits: number;
  readonly soundClass: string;
  readonly soundInterrupt: ObservationInterrupt;
}

export interface PlayerSenseSampleInput extends Omit<PlayerSenseSample, "version"> {}

export interface HumanPerceptionInput {
  /** The current regional WorldView registered to `window`. */
  readonly world: WorldView;
  readonly window: RegionalTerrainWindow;
  readonly targetTick: number;
  readonly playerSamples: readonly PlayerSenseSample[];
}

export interface HumanObservationBatch {
  readonly residentId: number;
  readonly observerId: string;
  readonly priorState: ActorPerceptionState;
  readonly observations: readonly ActorObservation[];
}

/** Creates one fully validated immutable stimulus, or null without repair. */
export function createPlayerSenseSample(input: PlayerSenseSampleInput): PlayerSenseSample | null {
  const value: unknown = input;
  if (!plainRecord(value) || !exactKeys(value, [
    "id",
    "lightVisibility",
    "movementSalience",
    "position",
    "sampleOrdinal",
    "soundClass",
    "soundInterrupt",
    "soundLoudness",
    "soundRangeUnits",
  ])) return null;
  const soundRangeUnits = value.soundRangeUnits;
  if (
    typeof value.id !== "string"
    || !SAMPLE_ID_PATTERN.test(value.id)
    || !Number.isSafeInteger(value.sampleOrdinal)
    || (value.sampleOrdinal as number) < 0
    || (value.sampleOrdinal as number) >= HUMAN_PERCEPTION_MAX_PLAYER_SAMPLES
    || !isWorldPosition(value.position)
    || !fixedUnit(value.movementSalience)
    || !fixedUnit(value.lightVisibility)
    || !fixedUnit(value.soundLoudness)
    || typeof soundRangeUnits !== "number"
    || !Number.isSafeInteger(soundRangeUnits)
    || soundRangeUnits < 0
    || soundRangeUnits > HUMAN_HEARING_MAX_RANGE_UNITS
    || typeof value.soundClass !== "string"
    || !SOUND_CLASS_PATTERN.test(value.soundClass)
    || !(value.soundInterrupt === "none" || value.soundInterrupt === "strong")
  ) return null;
  return Object.freeze({
    version: PLAYER_SENSE_SAMPLE_VERSION,
    id: value.id,
    sampleOrdinal: value.sampleOrdinal as number,
    position: createWorldPosition(
      value.position.region,
      value.position.localX,
      value.position.localY,
    ),
    movementSalience: value.movementSalience,
    lightVisibility: value.lightVisibility,
    soundLoudness: value.soundLoudness,
    soundRangeUnits,
    soundClass: value.soundClass,
    soundInterrupt: value.soundInterrupt,
  });
}

/**
 * Produces deterministic F0 observation batches for current-frame existing
 * humans. It does not mutate or advance cognition; the simulation remains the
 * sole owner of applying these batches to each supplied prior state.
 */
export function collectExistingHumanObservations(
  input: HumanPerceptionInput,
): readonly HumanObservationBatch[] {
  const value: unknown = input;
  if (!plainRecord(value) || !exactKeys(value, [
    "playerSamples",
    "targetTick",
    "window",
    "world",
  ])) return EMPTY_BATCHES;
  const { world, window, targetTick } = input;
  if (
    regionalWindowForWorld(world) !== window
    || !Number.isSafeInteger(targetTick)
    || targetTick < 0
    || !Array.isArray(input.playerSamples)
    || input.playerSamples.length > HUMAN_PERCEPTION_MAX_PLAYER_SAMPLES
    || !validRegionalWorld(world, window)
    || !validWeather(world)
  ) return EMPTY_BATCHES;
  const economy = regionalCompatibilityWorldForWorld(world);
  if (economy === null) return EMPTY_BATCHES;
  const frame = spatialFrameForWindow(window);
  if (frame === null) return EMPTY_BATCHES;
  const samples = canonicalSamples(input.playerSamples);
  if (samples === null) return EMPTY_BATCHES;
  const cells = lazyPerceptionCells(world);

  const positioned = world.residents.flatMap((resident) => {
    const placement = resolveResidentWorldPlacement(economy, resident);
    if (placement === null || residentPlacementInRegionalWindow(placement, window) === null) {
      return [];
    }
    return [{ resident, placement }];
  }).sort((left, right) => compareText(
    left.resident.identity.stableId,
    right.resident.identity.stableId,
  ) || left.resident.id - right.resident.id);
  const selected = positioned.slice(0, HUMAN_PERCEPTION_MAX_RESIDENTS);
  if (!uniqueResidents(selected)) return EMPTY_BATCHES;

  const batches: HumanObservationBatch[] = [];
  for (const { resident, placement } of selected) {
    const priorState = canonicalizeActorPerceptionState(resident.perception);
    if (
      priorState === null
      || priorState.actorId !== resident.identity.stableId
      || priorState.tick >= targetTick
    ) return EMPTY_BATCHES;
    const projectedResident = residentPlacementInRegionalWindow(placement, window);
    if (projectedResident === null) return EMPTY_BATCHES;
    const ambientNoise = ambientNoiseAt(world, projectedResident.tileIndex);
    if (ambientNoise === null) return EMPTY_BATCHES;
    const facing = lawfulResidentFacing(priorState, placement);
    const observations: ActorObservation[] = [];
    let latestIdentifiedVisual: {
      readonly sampleOrdinal: number;
      readonly observation: ActorObservation;
    } | null = null;

    for (const sample of samples) {
      const targetPoint = worldPositionToSpatialFrame(frame, sample.position);
      if (targetPoint === null) continue;
      const targetX = Math.floor(targetPoint.x / WORLD_POSITION_UNITS_PER_TILE);
      const targetY = Math.floor(targetPoint.y / WORLD_POSITION_UNITS_PER_TILE);
      if (
        targetX < 0
        || targetY < 0
        || targetX >= world.terrain.width
        || targetY >= world.terrain.height
      ) continue;
      const targetTileIndex = targetY * world.terrain.width + targetX;
      const sight = evaluateVisualContact({
        columns: world.terrain.width,
        rows: world.terrain.height,
        cells,
        observerTileIndex: projectedResident.tileIndex,
        targetTileIndex,
        observerFacingRadians: facing,
        weatherVisibility: weatherVisibility(world),
        targetMovementSalience: sample.movementSalience / FIXED_POINT,
        targetLightVisibility: sample.lightVisibility / FIXED_POINT,
      });
      if (sight !== null) {
        const identified = sight.identityEligible;
        const observation = createActorObservation({
          id: observationId("v", targetTick, resident.id, sample.id),
          observerId: priorState.actorId,
          observedAtTick: targetTick,
          channel: "vision",
          perceivedClass: "human",
          subjectId: identified ? LOCAL_PLAYER_SUBJECT_ID : null,
          area: { center: sample.position, radiusUnits: 0 },
          confidence: scaleContact(sight.confidence),
          salience: visualSalience(sight.confidence, sample, identified),
          identification: identified ? "identified" : "classified",
          interrupt: "none",
        });
        if (observation === null) return EMPTY_BATCHES;
        if (!identified) {
          observations.push(observation);
        } else if (
          latestIdentifiedVisual === null
          || sample.sampleOrdinal > latestIdentifiedVisual.sampleOrdinal
        ) {
          // A world tick may contain several fixed player steps. Preserve the
          // latest lawful identified sighting as the actor's last-known point,
          // never an earlier but equally strong frame from the same interval.
          latestIdentifiedVisual = {
            sampleOrdinal: sample.sampleOrdinal,
            observation,
          };
        }
      }

      if (sample.soundLoudness > 0 && sample.soundRangeUnits > 0) {
        const heard = evaluateAudibleContact({
          listener: projectedResident.position,
          source: targetPoint,
          baseRange: sample.soundRangeUnits,
          ambientNoise,
          sourceLoudness: sample.soundLoudness / FIXED_POINT,
          wind: {
            x: world.weather.windX / FIXED_POINT,
            y: world.weather.windY / FIXED_POINT,
          },
        });
        if (heard !== null) {
          const area = inferredHearingArea(placement.position, sample.position, heard);
          if (area === null) return EMPTY_BATCHES;
          const observation = createActorObservation({
            id: observationId("h", targetTick, resident.id, sample.id),
            observerId: priorState.actorId,
            observedAtTick: targetTick,
            channel: "hearing",
            perceivedClass: sample.soundClass,
            subjectId: null,
            area,
            confidence: scaleContact(heard.certainty),
            salience: hearingSalience(heard.certainty, sample.soundLoudness),
            identification: "anonymous",
            interrupt: sample.soundInterrupt,
          });
          if (observation === null) return EMPTY_BATCHES;
          observations.push(observation);
        }
      }
    }
    if (latestIdentifiedVisual !== null) {
      observations.push(latestIdentifiedVisual.observation);
    }

    const canonical = canonicalizeActorObservations(observations);
    if (canonical.length > HUMAN_PERCEPTION_MAX_OBSERVATIONS_PER_RESIDENT) {
      return EMPTY_BATCHES;
    }
    batches.push(Object.freeze({
      residentId: resident.id,
      observerId: priorState.actorId,
      priorState,
      observations: canonical,
    }));
  }
  return Object.freeze(batches);
}

function canonicalSamples(value: readonly PlayerSenseSample[]): readonly PlayerSenseSample[] | null {
  const samples: PlayerSenseSample[] = [];
  const ids = new Set<string>();
  const ordinals = new Set<number>();
  for (const raw of value) {
    if (!plainRecord(raw) || !exactKeys(raw, [
      "id",
      "lightVisibility",
      "movementSalience",
      "position",
      "sampleOrdinal",
      "soundClass",
      "soundInterrupt",
      "soundLoudness",
      "soundRangeUnits",
      "version",
    ]) || raw.version !== PLAYER_SENSE_SAMPLE_VERSION) return null;
    const sample = createPlayerSenseSample({
      id: raw.id,
      sampleOrdinal: raw.sampleOrdinal,
      position: raw.position,
      movementSalience: raw.movementSalience,
      lightVisibility: raw.lightVisibility,
      soundLoudness: raw.soundLoudness,
      soundRangeUnits: raw.soundRangeUnits,
      soundClass: raw.soundClass,
      soundInterrupt: raw.soundInterrupt,
    } as PlayerSenseSampleInput);
    if (sample === null || ids.has(sample.id) || ordinals.has(sample.sampleOrdinal)) return null;
    ids.add(sample.id);
    ordinals.add(sample.sampleOrdinal);
    samples.push(sample);
  }
  samples.sort((left, right) => (
    left.sampleOrdinal - right.sampleOrdinal || compareText(left.id, right.id)
  ));
  return Object.freeze(samples);
}

function lawfulResidentFacing(
  priorState: ActorPerceptionState,
  placement: ResidentWorldPlacement,
): number {
  const search = queryActorSearch(priorState);
  if (search !== null) {
    return facingTowardSavedPoint(placement, search.nextProbe);
  }
  const attention = queryActorAttention(priorState)[0];
  if (attention !== undefined) {
    return facingTowardSavedPoint(placement, attention.area.center);
  }
  return placement.facing;
}

function facingTowardSavedPoint(
  placement: ResidentWorldPlacement,
  point: WorldPosition,
): number {
  try {
    const delta = worldPositionDelta(placement.position, point);
    return delta.x === 0 && delta.y === 0
      ? placement.facing
      : Math.atan2(delta.y, delta.x);
  } catch {
    return placement.facing;
  }
}

function inferredHearingArea(
  listener: WorldPosition,
  source: WorldPosition,
  heard: AudibleContact,
): ObservedArea | null {
  const minimum = Math.max(0, Math.round(heard.distanceBand.minimum));
  const maximum = Math.max(minimum, Math.round(heard.distanceBand.maximum));
  const estimatedDistance = Math.round((minimum * 2 + maximum) / 3);
  const deltaX = Math.round(Math.cos(heard.bearing.centerRadians) * estimatedDistance);
  const deltaY = Math.round(Math.sin(heard.bearing.centerRadians) * estimatedDistance);
  let center = translatedOrNull(listener, deltaX, deltaY);
  if (center === null) return null;
  const radialUncertainty = Math.ceil((maximum - minimum) / 2);
  const angularUncertainty = Math.ceil(
    maximum * Math.sin(Math.min(Math.PI / 2, heard.bearing.uncertaintyRadians)),
  );
  const radiusUnits = Math.min(
    HEARING_AREA_MAX_RADIUS_UNITS,
    Math.max(
      MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS,
      radialUncertainty + angularUncertainty,
    ),
  );
  if (sameWorldPosition(center, source)) {
    const offsetX = Math.round(Math.cos(heard.bearing.centerRadians + Math.PI / 2)
      * MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS);
    const offsetY = Math.round(Math.sin(heard.bearing.centerRadians + Math.PI / 2)
      * MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS);
    center = translatedOrNull(center, offsetX, offsetY)
      ?? translatedOrNull(center, -offsetX, -offsetY);
    if (center === null || sameWorldPosition(center, source)) return null;
  }
  return Object.freeze({ center, radiusUnits });
}

function translatedOrNull(
  position: WorldPosition,
  deltaX: number,
  deltaY: number,
): WorldPosition | null {
  try {
    return translateWorldPosition(position, deltaX, deltaY);
  } catch {
    return null;
  }
}

function ambientNoiseAt(world: WorldView, listenerTileIndex: number): number | null {
  const listener = world.terrain.tiles[listenerTileIndex];
  if (!validTerrainTile(listener, listenerTileIndex, world.terrain.width)) return null;
  let waterTurbulence = 0;
  for (let offsetY = -LOCAL_WATER_MASK_RADIUS_TILES; offsetY <= LOCAL_WATER_MASK_RADIUS_TILES; offsetY += 1) {
    for (let offsetX = -LOCAL_WATER_MASK_RADIUS_TILES; offsetX <= LOCAL_WATER_MASK_RADIUS_TILES; offsetX += 1) {
      const x = listener.x + offsetX;
      const y = listener.y + offsetY;
      if (x < 0 || y < 0 || x >= world.terrain.width || y >= world.terrain.height) continue;
      const index = y * world.terrain.width + x;
      const tile = world.terrain.tiles[index];
      if (!validTerrainTile(tile, index, world.terrain.width)) return null;
      const profile = deriveWaterFlowProfile({
        waterDepth: tile.waterDepth,
        bedRoughness: tile.roughness,
        tideLevel: world.tide.level,
        weatherIntensity: world.weather.intensity,
      });
      const distance = Math.hypot(offsetX, offsetY);
      const attenuation = 1 / (1 + distance * 0.8);
      waterTurbulence = Math.max(
        waterTurbulence,
        profile.turbulence / FIXED_POINT * attenuation,
      );
    }
  }
  const raining = world.weather.kind === "rain" || world.weather.kind === "storm";
  return calculateAmbientNoise({
    rainIntensity: raining ? world.weather.intensity / FIXED_POINT : 0,
    localWaterTurbulence: Math.max(0, Math.min(1, waterTurbulence)),
  });
}

function lazyPerceptionCells(world: WorldView): readonly PerceptionCell[] {
  const settlementTiles = new Set(world.settlements.map(({ tileIndex }) => tileIndex));
  return new Proxy(world.terrain.tiles as unknown as PerceptionCell[], {
    get(target, property, receiver) {
      if (typeof property !== "string" || !/^(0|[1-9]\d*)$/u.test(property)) {
        return Reflect.get(target, property, receiver);
      }
      const index = Number(property);
      const tile = world.terrain.tiles[index];
      if (!validTerrainTile(tile, index, world.terrain.width)) {
        return { elevation: Number.NaN, obstruction: Number.NaN };
      }
      return {
        elevation: tile.elevation / FIXED_POINT,
        obstruction: perceptionObstruction(tile, settlementTiles.has(index)),
      } satisfies PerceptionCell;
    },
  });
}

function perceptionObstruction(tile: TerrainTileView, occupied: boolean): number {
  if (occupied) return 0.72;
  if (tile.terrain === "ridge") return 0.76;
  if (tile.terrain === "marsh") return 0.34;
  if (tile.terrain === "meadow" && tile.roughness >= 880_000) return 0.5;
  return 0;
}

function validTerrainTile(
  tile: TerrainTileView | undefined,
  expectedIndex: number,
  width: number,
): tile is TerrainTileView {
  return tile !== undefined
    && tile.index === expectedIndex
    && tile.x === expectedIndex % width
    && tile.y === Math.floor(expectedIndex / width)
    && fixedUnit(tile.elevation)
    && fixedUnit(tile.roughness)
    && fixedUnit(tile.waterDepth);
}

function spatialFrameForWindow(window: RegionalTerrainWindow): SpatialFrame | null {
  try {
    const address = globalTileToRegion(window.origin.x, window.origin.y);
    return createSpatialFrame(
      createWorldPosition(
        address.region,
        address.localX * WORLD_POSITION_UNITS_PER_TILE,
        address.localY * WORLD_POSITION_UNITS_PER_TILE,
      ),
      window.terrain.width * WORLD_POSITION_UNITS_PER_TILE,
      window.terrain.height * WORLD_POSITION_UNITS_PER_TILE,
    );
  } catch {
    return null;
  }
}

function validRegionalWorld(world: WorldView, window: RegionalTerrainWindow): boolean {
  return world.terrain.width === window.terrain.width
    && world.terrain.height === window.terrain.height
    && world.terrain.tiles.length === world.terrain.width * world.terrain.height
    && window.addresses.length === world.terrain.tiles.length;
}

function validWeather(world: WorldView): boolean {
  return fixedUnit(world.weather.intensity)
    && signedFixedUnit(world.weather.windX)
    && signedFixedUnit(world.weather.windY)
    && fixedUnit(world.tide.level);
}

function uniqueResidents(
  values: readonly { readonly resident: WorldView["residents"][number] }[],
): boolean {
  const ids = new Set<number>();
  const stableIds = new Set<string>();
  for (const { resident } of values) {
    if (ids.has(resident.id) || stableIds.has(resident.identity.stableId)) return false;
    ids.add(resident.id);
    stableIds.add(resident.identity.stableId);
  }
  return true;
}

function observationId(
  channel: "v" | "h",
  tick: number,
  residentId: number,
  sampleId: string,
): string {
  return `hp-${channel}-${tick}-${residentId}-${sampleId}`;
}

function visualSalience(
  confidence: number,
  sample: PlayerSenseSample,
  identified: boolean,
): number {
  return Math.max(
    scaleContact(confidence),
    Math.round(sample.movementSalience * 0.85),
    identified ? 650_000 : 0,
  );
}

function hearingSalience(certainty: number, loudness: number): number {
  return Math.min(
    ACTOR_PERCEPTION_SCALE,
    Math.round(certainty * ACTOR_PERCEPTION_SCALE * 0.7 + loudness * 0.3),
  );
}

function scaleContact(value: number): number {
  return Math.max(0, Math.min(ACTOR_PERCEPTION_SCALE, Math.round(
    value * ACTOR_PERCEPTION_SCALE,
  )));
}

function weatherVisibility(world: WorldView): number {
  return Math.max(0, Math.min(1, 1 - world.weather.intensity / FIXED_POINT * 0.52));
}

function fixedUnit(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= FIXED_POINT;
}

function signedFixedUnit(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= -FIXED_POINT
    && value <= FIXED_POINT;
}

function sameWorldPosition(left: WorldPosition, right: WorldPosition): boolean {
  return left.region.x === right.region.x
    && left.region.y === right.region.y
    && left.localX === right.localX
    && left.localY === right.localY;
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

import {
  ACTOR_PERCEPTION_SCALE,
  MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS,
  canonicalizeActorObservations,
  type ActorObservation,
} from "../sim/actorPerception";
import { CORE_WILDLIFE_SPECIES } from "../sim/coreWildlifeIdentity";
import { FIXED_POINT, type TerrainTileView, type WorldView } from "../sim/types";
import { hashCanonical } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  createCoreEcologyAlarmObservation,
} from "./coreEcology";
import {
  canonicalizeCoreWildlifeActorState,
  type CoreWildlifeActorState,
  type CoreWildlifeCausalEvent,
} from "./coreWildlifeActor";
import {
  createLivingActorAddress,
  headingToRadians,
  isLivingActorAddress,
  livingActorAddressInRegionalWindow,
  type LivingActorAddress,
} from "./livingActor";
import {
  LIVING_ACTOR_VISUAL_CONTACT_VERSION,
  collectLivingActorVisualContactObservations,
} from "./livingActorVisualContact";
import { livingActorSenseProfile } from "./livingActorSenses";
import type { LivingActorSpecies } from "./livingSpeciesRegistry";
import {
  VISIBILITY_DIRECT,
  calculateAmbientNoise,
  evaluateAudibleContact,
  evaluateVisualContact,
  type PerceptionCell,
} from "./perception";
import type { RegionalTerrainWindow } from "./regionalTravel";
import { regionalWindowForWorld } from "./regionalWorldView";
import {
  isWorldPosition,
  type SpatialFramePoint,
  type WorldPosition,
} from "./worldPosition";

export const CORE_ECOLOGY_ALARM_MAX_RANGE_UNITS = 14_000 as const;
export const CORE_ECOLOGY_PERCEPTION_MAX_OBSERVERS =
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS + 3;

export interface CoreEcologyPerceptionFrameInput {
  /** The exact current materialized wildlife set; coarse actors do not enter this bridge. */
  readonly actors: readonly CoreWildlifeActorState[];
  readonly dogAddress?: LivingActorAddress | null;
  readonly porterAddress?: LivingActorAddress | null;
  readonly playerAddress?: LivingActorAddress | null;
  /** Registered current regional projection. Weather and wind are read from this authority. */
  readonly world: WorldView;
  readonly window: RegionalTerrainWindow;
  /** Observation tick, strictly later than every supplied wildlife actor revision. */
  readonly tick: number;
}

export interface CoreEcologyObservationBatch {
  readonly observerId: string;
  readonly observations: readonly ActorObservation[];
}

interface CanonicalPerceptionFrame {
  readonly actors: readonly CoreWildlifeActorState[];
  readonly actorIds: ReadonlySet<string>;
  readonly observers: readonly LivingActorAddress[];
  readonly placements: ReadonlyMap<string, Readonly<{
    readonly point: SpatialFramePoint;
    readonly tileIndex: number;
  }>>;
  readonly cells: readonly PerceptionCell[];
  readonly world: WorldView;
  readonly window: RegionalTerrainWindow;
  readonly tick: number;
}

const EMPTY_OBSERVATIONS: readonly ActorObservation[] = Object.freeze([]);
const CORE_SPECIES = new Set<string>(CORE_WILDLIFE_SPECIES);

/**
 * Builds pairwise visual facts for the exact current wildlife materialization.
 * Optional dog, porter, and player addresses observe wildlife and may be
 * observed by wildlife, but this bridge deliberately does not duplicate
 * contacts among those non-core actors.
 */
export function collectCoreEcologyVisualObservationBatches(
  value: unknown,
): readonly CoreEcologyObservationBatch[] | null {
  const frame = canonicalPerceptionFrame(value);
  if (frame === null) return null;
  const batches: CoreEcologyObservationBatch[] = [];

  for (const observer of frame.observers) {
    const observerPlacement = frame.placements.get(observer.actorId);
    if (observerPlacement === undefined) return null;
    const observerIsCore = frame.actorIds.has(observer.actorId);
    const contacts = [];
    for (const subject of frame.observers) {
      if (
        subject.actorId === observer.actorId
        || (!observerIsCore && !frame.actorIds.has(subject.actorId))
      ) continue;
      const subjectPlacement = frame.placements.get(subject.actorId);
      if (subjectPlacement === undefined) return null;
      const targetTile = frame.world.terrain.tiles[subjectPlacement.tileIndex];
      if (targetTile === undefined) return null;
      const sight = evaluateVisualContact({
        columns: frame.world.terrain.width,
        rows: frame.world.terrain.height,
        cells: frame.cells,
        observerTileIndex: observerPlacement.tileIndex,
        targetTileIndex: subjectPlacement.tileIndex,
        observerFacingRadians: headingToRadians(observer.heading),
        weatherVisibility: weatherVisibility(frame.world),
        // This bridge has no velocity evidence and never infers motion from intent.
        targetMovementSalience: 0,
        targetLightVisibility: targetLightVisibility(targetTile),
      });
      if (sight === null) continue;
      const direct = sight.grade === VISIBILITY_DIRECT;
      const confidence = scaleContact(sight.confidence);
      contacts.push(Object.freeze({
        version: LIVING_ACTOR_VISUAL_CONTACT_VERSION,
        evidenceId: `ecology-visual:${hashCanonical({
          observerId: observer.actorId,
          subjectId: subject.actorId,
          tick: frame.tick,
        })}`,
        perceivedClass: direct
          ? perceivedVisualClass(observer.species, subject.species)
          : "animal-silhouette",
        subject,
        lineOfSight: direct ? "clear" as const : "partial" as const,
        confidence,
        salience: confidence,
        identityEligible: direct && sight.identityEligible,
      }));
    }
    const observations = collectLivingActorVisualContactObservations({
      version: LIVING_ACTOR_VISUAL_CONTACT_VERSION,
      observer,
      tick: frame.tick,
      contacts,
    });
    if (observations === null) return null;
    batches.push(Object.freeze({ observerId: observer.actorId, observations }));
  }

  return Object.freeze(batches);
}

/**
 * Propagates one explicitly supplied alarm event through bounded hearing.
 * Calling the visual bridge alone never creates an alarm or shares cognition.
 */
export function propagateCoreEcologyAlarmObservationBatches(
  eventValue: unknown,
  frameValue: unknown,
): readonly CoreEcologyObservationBatch[] | null {
  const frame = canonicalPerceptionFrame(frameValue);
  const event = canonicalAlarmEvent(eventValue, frame);
  if (frame === null || event === null) return null;
  const emitterPlacement = frame.placements.get(event.actorId);
  if (emitterPlacement === undefined) return null;
  const raining = frame.world.weather.kind === "rain" || frame.world.weather.kind === "storm";
  const ambientNoise = calculateAmbientNoise({
    rainIntensity: raining ? frame.world.weather.intensity / FIXED_POINT : 0,
    // Water masking is owned by the broader acoustic field; this bounded alarm
    // slice names only the current weather pressure instead of fabricating it.
    localWaterTurbulence: 0,
  });
  if (ambientNoise === null) return null;
  const batches: CoreEcologyObservationBatch[] = [];

  for (const observer of frame.observers) {
    let observations = EMPTY_OBSERVATIONS;
    if (observer.actorId !== event.actorId) {
      const listenerPlacement = frame.placements.get(observer.actorId);
      if (listenerPlacement === undefined) return null;
      const hearing = livingActorSenseProfile(observer.species).hearingSensitivity;
      const heard = evaluateAudibleContact({
        listener: listenerPlacement.point,
        source: emitterPlacement.point,
        baseRange: Math.floor(
          CORE_ECOLOGY_ALARM_MAX_RANGE_UNITS * hearing / ACTOR_PERCEPTION_SCALE,
        ),
        ambientNoise,
        sourceLoudness: 1,
        wind: {
          x: frame.world.weather.windX / FIXED_POINT,
          y: frame.world.weather.windY / FIXED_POINT,
        },
      });
      if (heard !== null) {
        const observation = createCoreEcologyAlarmObservation(event, {
          observerId: observer.actorId,
          observedAtTick: frame.tick,
          radiusUnits: alarmUncertaintyRadius(heard.distanceBand),
          confidence: scaleContact(heard.certainty),
          salience: scaleContact(heard.certainty),
        });
        if (observation === null) return null;
        const canonical = canonicalizeActorObservations([observation]);
        if (canonical.length !== 1) return null;
        observations = canonical;
      }
    }
    batches.push(Object.freeze({ observerId: observer.actorId, observations }));
  }

  return Object.freeze(batches);
}

function canonicalPerceptionFrame(value: unknown): CanonicalPerceptionFrame | null {
  if (!plainRecord(value) || !allowedFrameKeys(value)) return null;
  if (
    !Array.isArray(value.actors)
    || value.actors.length > CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS
    || !nonnegativeSafeInteger(value.tick)
    || !plainRecord(value.world)
    || !plainRecord(value.window)
  ) return null;
  const world = value.world as unknown as WorldView;
  const window = value.window as unknown as RegionalTerrainWindow;
  if (!validRegionalWorld(world, window) || !validWeather(world)) return null;
  const tick = value.tick;
  const actors: CoreWildlifeActorState[] = [];
  const coreIds = new Set<string>();
  for (const raw of value.actors as readonly unknown[]) {
    const actor = canonicalizeCoreWildlifeActorState(raw);
    if (
      actor === null
      || actor.updatedAtTick >= tick
      || coreIds.has(actor.identity.stableId)
      || livingActorAddressInRegionalWindow(actor.address, window) === null
    ) return null;
    coreIds.add(actor.identity.stableId);
    actors.push(actor);
  }
  actors.sort((left, right) => compareText(
    left.identity.stableId,
    right.identity.stableId,
  ));

  const observers: LivingActorAddress[] = actors.map(({ address }) => address);
  const dog = canonicalOptionalAddress(value, "dogAddress", "domestic-dog");
  const porter = canonicalOptionalAddress(value, "porterAddress", "human");
  const player = canonicalOptionalAddress(value, "playerAddress", "human");
  if (dog === false || porter === false || player === false) return null;
  for (const optional of [dog, porter, player]) {
    if (optional === null) continue;
    if (coreIds.has(optional.actorId) || observers.some(({ actorId }) => actorId === optional.actorId)) {
      return null;
    }
    if (livingActorAddressInRegionalWindow(optional, window) !== null) observers.push(optional);
  }
  observers.sort((left, right) => compareText(left.actorId, right.actorId));
  if (observers.length > CORE_ECOLOGY_PERCEPTION_MAX_OBSERVERS) return null;

  const placements = new Map<string, Readonly<{
    readonly point: SpatialFramePoint;
    readonly tileIndex: number;
  }>>();
  for (const observer of observers) {
    const placement = livingActorAddressInRegionalWindow(observer, window);
    if (placement === null || placements.has(observer.actorId)) return null;
    placements.set(observer.actorId, Object.freeze({
      point: placement.point,
      tileIndex: placement.tileIndex,
    }));
  }
  const cells = perceptionCells(world);
  if (cells === null) return null;
  return Object.freeze({
    actors: Object.freeze(actors),
    actorIds: coreIds,
    observers: Object.freeze(observers),
    placements,
    cells,
    world,
    window,
    tick,
  });
}

function canonicalAlarmEvent(
  value: unknown,
  frame: CanonicalPerceptionFrame | null,
): CoreWildlifeCausalEvent | null {
  if (frame === null || !plainRecord(value)) return null;
  const actorId = value.actorId;
  const species = value.species;
  const position = value.position;
  if (
    typeof actorId !== "string"
    || !CORE_SPECIES.has(species as string)
    || !isWorldPosition(position)
  ) return null;
  const emitter = frame.actors.find(({ identity }) => identity.stableId === actorId);
  if (
    emitter === undefined
    || emitter.identity.species !== species
    || !sameWorldPosition(emitter.address.position, position)
  ) return null;
  const candidate = value as unknown as CoreWildlifeCausalEvent;
  // Reuse the authoritative event bridge as the strict event-shape validator.
  const proof = createCoreEcologyAlarmObservation(candidate, {
    observerId: actorId,
    observedAtTick: frame.tick,
    radiusUnits: MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS,
    confidence: ACTOR_PERCEPTION_SCALE,
    salience: ACTOR_PERCEPTION_SCALE,
  });
  return proof === null ? null : candidate;
}

function canonicalOptionalAddress(
  owner: Readonly<Record<string, unknown>>,
  key: "dogAddress" | "porterAddress" | "playerAddress",
  species: "domestic-dog" | "human",
): LivingActorAddress | null | false {
  if (!Object.hasOwn(owner, key) || owner[key] === null) return null;
  const value = owner[key];
  if (!isLivingActorAddress(value) || value.species !== species) return false;
  return createLivingActorAddress(value);
}

function perceivedVisualClass(
  observer: LivingActorSpecies,
  subject: LivingActorSpecies,
): string {
  if (
    subject === "black-bear"
    && (observer === "deer"
      || observer === "gull"
      || observer === "domestic-dog"
      || observer === "human")
  ) return "large-predator";
  if (subject === "deer" && observer === "black-bear") return "live-prey";
  return subject;
}

function perceptionCells(world: WorldView): readonly PerceptionCell[] | null {
  const occupied = new Set<number>();
  for (const settlement of world.settlements) {
    if (
      !plainRecord(settlement)
      || !nonnegativeSafeInteger(settlement.tileIndex)
      || settlement.tileIndex >= world.terrain.tiles.length
    ) return null;
    occupied.add(settlement.tileIndex);
  }
  const cells: PerceptionCell[] = [];
  for (let index = 0; index < world.terrain.tiles.length; index += 1) {
    const tile = world.terrain.tiles[index];
    if (!validTerrainTile(tile, index, world.terrain.width)) return null;
    cells.push(Object.freeze({
      elevation: tile.elevation / FIXED_POINT,
      obstruction: occupied.has(index)
        ? 0.72
        : tile.terrain === "ridge"
          ? 0.76
          : tile.terrain === "marsh"
            ? 0.34
            : tile.terrain === "meadow" && tile.roughness >= 880_000
              ? 0.5
              : 0,
    }));
  }
  return Object.freeze(cells);
}

function validRegionalWorld(world: WorldView, window: RegionalTerrainWindow): boolean {
  return regionalWindowForWorld(world) === window
    && plainRecord(world.terrain)
    && plainRecord(window.terrain)
    && plainRecord(window.origin)
    && positiveSafeInteger(world.terrain.width)
    && positiveSafeInteger(world.terrain.height)
    && positiveSafeInteger(window.terrain.width)
    && positiveSafeInteger(window.terrain.height)
    && Number.isSafeInteger(window.origin.x)
    && Number.isSafeInteger(window.origin.y)
    && !Object.is(window.origin.x, -0)
    && !Object.is(window.origin.y, -0)
    && world.terrain.width === window.terrain.width
    && world.terrain.height === window.terrain.height
    && Array.isArray(world.terrain.tiles)
    && world.terrain.tiles.length === world.terrain.width * world.terrain.height
    && Array.isArray(world.settlements)
    && Array.isArray(window.addresses)
    && window.addresses.length === world.terrain.tiles.length;
}

function validWeather(world: WorldView): boolean {
  return plainRecord(world.weather)
    && (world.weather.kind === "clear"
      || world.weather.kind === "mist"
      || world.weather.kind === "rain"
      || world.weather.kind === "storm")
    && fixedUnit(world.weather.intensity)
    && signedFixedUnit(world.weather.windX)
    && signedFixedUnit(world.weather.windY)
    && nonnegativeSafeInteger(world.weather.nextChangeTick);
}

function validTerrainTile(
  tile: TerrainTileView | undefined,
  expectedIndex: number,
  width: number,
): tile is TerrainTileView {
  return plainRecord(tile)
    && tile.index === expectedIndex
    && tile.x === expectedIndex % width
    && tile.y === Math.floor(expectedIndex / width)
    && (tile.terrain === "deep-water"
      || tile.terrain === "tidal-flat"
      || tile.terrain === "marsh"
      || tile.terrain === "meadow"
      || tile.terrain === "ridge")
    && fixedUnit(tile.elevation)
    && fixedUnit(tile.roughness)
    && fixedUnit(tile.waterDepth);
}

function targetLightVisibility(tile: TerrainTileView): number {
  return tile.terrain === "marsh"
    ? 0.55
    : tile.terrain === "ridge" || tile.terrain === "deep-water"
      ? 0.9
      : 0.72;
}

function weatherVisibility(world: WorldView): number {
  return Math.max(0, Math.min(1, 1 - world.weather.intensity / FIXED_POINT * 0.52));
}

function alarmUncertaintyRadius(
  distanceBand: Readonly<{ readonly minimum: number; readonly maximum: number }>,
): number {
  return Math.min(
    CORE_ECOLOGY_ALARM_MAX_RANGE_UNITS,
    Math.max(
      MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS,
      Math.ceil(distanceBand.maximum - distanceBand.minimum),
    ),
  );
}

function scaleContact(value: number): number {
  return Math.max(0, Math.min(ACTOR_PERCEPTION_SCALE, Math.round(
    value * ACTOR_PERCEPTION_SCALE,
  )));
}

function sameWorldPosition(left: WorldPosition, right: WorldPosition): boolean {
  return left.region.x === right.region.x
    && left.region.y === right.region.y
    && left.localX === right.localX
    && left.localY === right.localY;
}

function allowedFrameKeys(value: Readonly<Record<string, unknown>>): boolean {
  const expected = ["actors", "tick", "window", "world"];
  if (Object.hasOwn(value, "dogAddress")) expected.push("dogAddress");
  if (Object.hasOwn(value, "porterAddress")) expected.push("porterAddress");
  if (Object.hasOwn(value, "playerAddress")) expected.push("playerAddress");
  return exactKeys(value, expected);
}

function fixedUnit(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value <= FIXED_POINT;
}

function signedFixedUnit(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && !Object.is(value, -0)
    && Math.abs(value as number) <= FIXED_POINT;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
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

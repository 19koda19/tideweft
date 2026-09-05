import { ACTOR_PERCEPTION_SCALE } from "../sim/actorPerception";
import { createActorScentObservation } from "../sim/scentPerception";
import { FIXED_POINT, type TerrainTileView, type WorldView } from "../sim/types";
import { hashCanonical } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS,
  canonicalizeCoreEcologyAggregatePatch,
  type CoreEcologyAggregateAreaAnchor,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import {
  coreEcologyPerceptionCells,
  coreEcologyTargetLightVisibility,
  coreEcologyWeatherVisibility,
} from "./coreEcologyPerception";
import {
  CORE_ECOLOGY_SETTLEMENT_SHADOWS_MAX_STIMULI,
  CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION,
  canonicalizeCoreEcologySettlementShadowsStimulusFrame,
  type CoreEcologySettlementShadowsAnchorInfluence,
  type CoreEcologySettlementShadowsSourceKind,
  type CoreEcologySettlementShadowsStimulus,
  type CoreEcologySettlementShadowsStimulusFrame,
} from "./coreEcologySmallWorld";
import { livingActorSenseProfile } from "./livingActorSenses";
import { evaluateVisualContact } from "./perception";
import type { RegionalTerrainWindow } from "./regionalTravel";
import { regionalAddressAt, regionalWindowForWorld } from "./regionalWorldView";
import {
  REGION_HEIGHT_UNITS,
  REGION_WIDTH_UNITS,
  WORLD_POSITION_UNITS_PER_TILE,
  createSpatialFrame,
  createWorldPosition,
  isWorldPosition,
  worldPositionToSpatialFrame,
  type SpatialFrame,
  type WorldPosition,
} from "./worldPosition";

export const CORE_ECOLOGY_AGGREGATE_PERCEPTION_MAX_VISUAL_SOURCES = 32 as const;
export const CORE_ECOLOGY_AGGREGATE_PERCEPTION_MAX_FOOD_SOURCES = 128 as const;
export const CORE_ECOLOGY_AGGREGATE_PERCEPTION_MAX_FOOD_CANDIDATES = 1_024 as const;

export const CORE_ECOLOGY_AGGREGATE_VISUAL_SOURCE_KINDS = [
  "cat",
  "dog",
  "human",
  "gull",
] as const;

export type CoreEcologyAggregateVisualSourceKind =
  (typeof CORE_ECOLOGY_AGGREGATE_VISUAL_SOURCE_KINDS)[number];

/** One materialized individual supplied by the runtime's active-window owner. */
export interface CoreEcologyAggregateVisualSource {
  readonly sourceReferenceId: string;
  readonly sourceKind: CoreEcologyAggregateVisualSourceKind;
  readonly position: WorldPosition;
  /** Fixed-point 0..1 target movement salience; this is not inferred from intent. */
  readonly movementSalience: number;
}

/** One physically present provision supplied after authoritative cargo custody. */
export interface CoreEcologyAggregateExposedFoodSource {
  readonly sourceReferenceId: string;
  readonly position: WorldPosition;
  /** Fixed-point 0..1 provision scent strength. */
  readonly sourceStrength: number;
  /** Fixed-point 0..1 container leakage; zero is sealed. */
  readonly packagingLeakage: number;
}

export interface CoreEcologyAggregatePerceptionFrameInput {
  readonly patch: CoreEcologyAggregatePatchState;
  readonly world: WorldView;
  readonly window: RegionalTerrainWindow;
  readonly tick: number;
  readonly visualSources: readonly CoreEcologyAggregateVisualSource[];
  readonly exposedFoodSources: readonly CoreEcologyAggregateExposedFoodSource[];
}

/**
 * Bound a dense physical-food projection before the sensory cross product.
 * Nearest means exact squared world distance to any rat-area anchor, with the
 * persistent source ID as the deterministic tie-break. No source is consumed,
 * cloned, or re-authored here.
 */
export function selectCoreEcologyAggregateExposedFoodSources(
  patchValue: unknown,
  sourcesValue: unknown,
): readonly CoreEcologyAggregateExposedFoodSource[] | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(patchValue);
  if (
    patch === null
    || !Array.isArray(sourcesValue)
    || sourcesValue.length > CORE_ECOLOGY_AGGREGATE_PERCEPTION_MAX_FOOD_CANDIDATES
  ) return null;
  const sources = canonicalFoodSources(sourcesValue);
  if (sources === null) return null;
  const anchors = patch.aggregatePopulations.flatMap((population) => population.anchors);
  if (anchors.length === 0) return Object.freeze([]);
  const ranked = sources.map((source) => Object.freeze({
    source,
    distanceSquared: anchors.reduce<bigint | null>((nearest, anchor) => {
      const distance = exactWorldDistanceSquared(anchor.position, source.position);
      return nearest === null || distance < nearest ? distance : nearest;
    }, null) ?? 0n,
  }));
  ranked.sort((left, right) => (
    left.distanceSquared < right.distanceSquared
      ? -1
      : left.distanceSquared > right.distanceSquared
        ? 1
        : compareText(left.source.sourceReferenceId, right.source.sourceReferenceId)
  ));
  return Object.freeze(ranked
    .slice(0, CORE_ECOLOGY_AGGREGATE_PERCEPTION_MAX_FOOD_SOURCES)
    .map(({ source }) => source));
}

interface CanonicalAggregatePerceptionFrame {
  readonly patch: CoreEcologyAggregatePatchState;
  readonly world: WorldView;
  readonly window: RegionalTerrainWindow;
  readonly tick: number;
  readonly visualSources: readonly CoreEcologyAggregateVisualSource[];
  readonly exposedFoodSources: readonly CoreEcologyAggregateExposedFoodSource[];
  readonly frame: SpatialFrame;
  readonly cells: ReturnType<typeof coreEcologyPerceptionCells>;
}

interface StimulusCandidate {
  readonly sourceReferenceId: string;
  readonly sourceKind: CoreEcologySettlementShadowsSourceKind;
  readonly response: "pressure" | "attraction";
  readonly channels: readonly ("vision" | "scent" | "touch" | "evidence")[];
  readonly anchorInfluences: readonly CoreEcologySettlementShadowsAnchorInfluence[];
}

const VISUAL_SOURCE_KIND_SET = new Set<string>(
  CORE_ECOLOGY_AGGREGATE_VISUAL_SOURCE_KINDS,
);
const STABLE_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/u;
const COLLECTIVE_VISUAL_CLOSE_RANGE_TILES = 2;
const COLLECTIVE_VISUAL_DIRECT_RANGE_TILES = 10;
const FULL_CIRCLE_RADIANS = Math.PI * 2;

/**
 * Resolves world truth into the bounded aggregate stimulus contract. This is
 * the only bridge in the Settlement Shadows slice that may turn current
 * materialized actors, physical food, or weather into rat-area pressure.
 * It creates no rat actor/address, cognition, player knowledge, or custody
 * mutation; scent observations are transient and disclose no source identity.
 */
export function deriveCoreEcologySettlementShadowsStimulusFrame(
  value: unknown,
): CoreEcologySettlementShadowsStimulusFrame | null {
  const input = canonicalInput(value);
  if (input === null || input.cells === null) return null;
  const profile = livingActorSenseProfile("brown-rat");
  const stimuli: CoreEcologySettlementShadowsStimulus[] = [];
  const populations = [...input.patch.aggregatePopulations].sort((left, right) => (
    compareText(left.aggregateId, right.aggregateId)
  ));

  for (const population of populations) {
    const bestVisual = new Map<CoreEcologyAggregateVisualSourceKind, StimulusCandidate>();
    for (const source of input.visualSources) {
      const candidate = visualCandidate(input, population.aggregateId, population.anchors, source);
      if (candidate === null) continue;
      const previous = bestVisual.get(source.sourceKind);
      if (previous === undefined || compareCandidateStrength(candidate, previous) < 0) {
        bestVisual.set(source.sourceKind, candidate);
      }
    }
    for (const sourceKind of CORE_ECOLOGY_AGGREGATE_VISUAL_SOURCE_KINDS) {
      const candidate = bestVisual.get(sourceKind);
      if (candidate !== undefined) stimuli.push(toStimulus(input.tick, population.aggregateId, candidate));
    }

    let bestFood: StimulusCandidate | null = null;
    for (const source of input.exposedFoodSources) {
      const candidate = foodCandidate(
        input,
        population.aggregateId,
        population.anchors,
        source,
        profile.scentSensitivity,
        profile.scentBaseRangeUnits,
      );
      if (candidate === null) continue;
      if (bestFood === null || compareCandidateStrength(candidate, bestFood) < 0) {
        bestFood = candidate;
      }
    }
    if (bestFood !== null) stimuli.push(toStimulus(input.tick, population.aggregateId, bestFood));

    const rain = rainCandidate(input, population.aggregateId, population.anchors);
    if (rain !== null) stimuli.push(toStimulus(input.tick, population.aggregateId, rain));
  }

  if (stimuli.length > CORE_ECOLOGY_SETTLEMENT_SHADOWS_MAX_STIMULI) return null;
  return canonicalizeCoreEcologySettlementShadowsStimulusFrame({
    version: CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION,
    atTick: input.tick,
    stimuli,
  });
}

function visualCandidate(
  input: CanonicalAggregatePerceptionFrame,
  aggregateId: string,
  anchors: readonly CoreEcologyAggregateAreaAnchor[],
  source: CoreEcologyAggregateVisualSource,
): StimulusCandidate | null {
  const sourceTileIndex = tileIndexInFrame(input.frame, input.world, source.position);
  if (sourceTileIndex === null) return null;
  const sourceTile = input.world.terrain.tiles[sourceTileIndex];
  if (sourceTile === undefined) return null;
  const profile = livingActorSenseProfile("brown-rat");
  const acuity = profile.visionAcuity / FIXED_POINT;
  const anchorInfluences = anchors.map((anchor) => {
    const observerTileIndex = tileIndexInFrame(input.frame, input.world, anchor.position);
    if (observerTileIndex === null) return influence(anchor.anchorOrdinal, 0);
    const sight = evaluateVisualContact({
      columns: input.world.terrain.width,
      rows: input.world.terrain.height,
      cells: input.cells ?? [],
      observerTileIndex,
      targetTileIndex: sourceTileIndex,
      // Aggregate-area anchors represent a bounded local population rather
      // than one body with one facing. Their close collective awareness is 360°.
      observerFacingRadians: 0,
      weatherVisibility: coreEcologyWeatherVisibility(input.world),
      detailRangeOverrides: {
        closePeripheralRange: COLLECTIVE_VISUAL_CLOSE_RANGE_TILES * acuity,
        directSightRange: COLLECTIVE_VISUAL_DIRECT_RANGE_TILES * acuity,
        forwardConeRadians: FULL_CIRCLE_RADIANS,
      },
      targetMovementSalience: source.movementSalience / FIXED_POINT,
      targetLightVisibility: coreEcologyTargetLightVisibility(sourceTile),
    });
    return influence(anchor.anchorOrdinal, sight === null ? 0 : scaleUnit(sight.confidence));
  });
  if (!hasPositiveInfluence(anchorInfluences)) return null;
  return Object.freeze({
    sourceReferenceId: source.sourceReferenceId,
    sourceKind: source.sourceKind,
    response: "pressure",
    channels: Object.freeze(["vision"] as const),
    anchorInfluences: Object.freeze(anchorInfluences),
  });
}

function foodCandidate(
  input: CanonicalAggregatePerceptionFrame,
  aggregateId: string,
  anchors: readonly CoreEcologyAggregateAreaAnchor[],
  source: CoreEcologyAggregateExposedFoodSource,
  scentSensitivity: number,
  scentBaseRangeUnits: number,
): StimulusCandidate | null {
  const sensedStrength = multiplyFixed(source.sourceStrength, scentSensitivity);
  const rainIntensity = precipitationIntensity(input.world);
  const anchorInfluences = anchors.map((anchor) => {
    const observation = createActorScentObservation({
      id: `aggregate-scent:${hashCanonical({
        aggregateId,
        anchorOrdinal: anchor.anchorOrdinal,
        sourceReferenceId: source.sourceReferenceId,
        tick: input.tick,
      })}`,
      observerId: aggregateId,
      observedAtTick: input.tick,
      perceivedClass: "food-scent",
      observerPosition: anchor.position,
      sourcePosition: source.position,
      baseRangeUnits: scentBaseRangeUnits,
      sourceStrength: sensedStrength,
      packagingLeakage: source.packagingLeakage,
      wind: {
        x: input.world.weather.windX,
        y: input.world.weather.windY,
      },
      rainIntensity,
    });
    return influence(anchor.anchorOrdinal, observation?.salience ?? 0);
  });
  if (!hasPositiveInfluence(anchorInfluences)) return null;
  return Object.freeze({
    sourceReferenceId: source.sourceReferenceId,
    sourceKind: "exposed-food",
    response: "attraction",
    channels: Object.freeze(["scent"] as const),
    anchorInfluences: Object.freeze(anchorInfluences),
  });
}

function rainCandidate(
  input: CanonicalAggregatePerceptionFrame,
  aggregateId: string,
  anchors: readonly CoreEcologyAggregateAreaAnchor[],
): StimulusCandidate | null {
  const precipitation = precipitationIntensity(input.world);
  if (precipitation === 0) return null;
  const anchorInfluences: CoreEcologySettlementShadowsAnchorInfluence[] = [];
  for (const anchor of anchors) {
    const tileIndex = tileIndexInFrame(input.frame, input.world, anchor.position);
    // Rain is regional world truth. An off-window anchor is unknown here, not
    // magically sheltered, so incomplete terrain produces no rain stimulus.
    if (tileIndex === null) return null;
    const tile = input.world.terrain.tiles[tileIndex];
    if (tile === undefined) return null;
    anchorInfluences.push(influence(
      anchor.anchorOrdinal,
      multiplyFixed(precipitation, rainExposureForTerrain(tile)),
    ));
  }
  if (!hasPositiveInfluence(anchorInfluences)) return null;
  return Object.freeze({
    sourceReferenceId: `weather:rain:${input.tick.toString(36)}`,
    sourceKind: "rain",
    response: "pressure",
    channels: Object.freeze(["touch", "evidence"] as const),
    anchorInfluences: Object.freeze(anchorInfluences),
  });
}

function canonicalInput(value: unknown): CanonicalAggregatePerceptionFrame | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "exposedFoodSources",
    "patch",
    "tick",
    "visualSources",
    "window",
    "world",
  ])) return null;
  const patch = canonicalizeCoreEcologyAggregatePatch(value.patch);
  if (
    patch === null
    || patch.aggregatePopulations.length > CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS
    || !nonnegativeSafeInteger(value.tick)
    || patch.updatedAtTick !== value.tick
    || !plainRecord(value.world)
    || !plainRecord(value.window)
    || !Array.isArray(value.visualSources)
    || value.visualSources.length > CORE_ECOLOGY_AGGREGATE_PERCEPTION_MAX_VISUAL_SOURCES
    || !Array.isArray(value.exposedFoodSources)
    || value.exposedFoodSources.length > CORE_ECOLOGY_AGGREGATE_PERCEPTION_MAX_FOOD_SOURCES
  ) return null;
  const world = value.world as unknown as WorldView;
  const window = value.window as unknown as RegionalTerrainWindow;
  if (
    regionalWindowForWorld(world) !== window
    || world.completedTick !== value.tick
    || !validRegionalWorld(world, window)
    || !validWeather(world)
  ) return null;
  const visualSources = canonicalVisualSources(value.visualSources);
  const exposedFoodSources = canonicalFoodSources(value.exposedFoodSources);
  if (visualSources === null || exposedFoodSources === null) return null;
  const frame = spatialFrameForWorld(world);
  const cells = coreEcologyPerceptionCells(world);
  if (frame === null || cells === null) return null;
  return Object.freeze({
    patch,
    world,
    window,
    tick: value.tick,
    visualSources,
    exposedFoodSources,
    frame,
    cells,
  });
}

function canonicalVisualSources(value: readonly unknown[]): readonly CoreEcologyAggregateVisualSource[] | null {
  const sources: CoreEcologyAggregateVisualSource[] = [];
  const references = new Set<string>();
  for (const source of value) {
    if (
      !plainRecord(source)
      || !exactKeys(source, ["movementSalience", "position", "sourceKind", "sourceReferenceId"])
      || !stableReference(source.sourceReferenceId)
      || !VISUAL_SOURCE_KIND_SET.has(source.sourceKind as string)
      || !isWorldPosition(source.position)
      || !fixedPoint(source.movementSalience)
      || references.has(source.sourceReferenceId)
    ) return null;
    references.add(source.sourceReferenceId);
    sources.push(Object.freeze({
      sourceReferenceId: source.sourceReferenceId,
      sourceKind: source.sourceKind as CoreEcologyAggregateVisualSourceKind,
      position: createWorldPosition(
        source.position.region,
        source.position.localX,
        source.position.localY,
      ),
      movementSalience: source.movementSalience,
    }));
  }
  sources.sort((left, right) => (
    CORE_ECOLOGY_AGGREGATE_VISUAL_SOURCE_KINDS.indexOf(left.sourceKind)
      - CORE_ECOLOGY_AGGREGATE_VISUAL_SOURCE_KINDS.indexOf(right.sourceKind)
    || compareText(left.sourceReferenceId, right.sourceReferenceId)
  ));
  return Object.freeze(sources);
}

function canonicalFoodSources(value: readonly unknown[]): readonly CoreEcologyAggregateExposedFoodSource[] | null {
  const sources: CoreEcologyAggregateExposedFoodSource[] = [];
  const references = new Set<string>();
  for (const source of value) {
    if (
      !plainRecord(source)
      || !exactKeys(source, ["packagingLeakage", "position", "sourceReferenceId", "sourceStrength"])
      || !stableReference(source.sourceReferenceId)
      || !isWorldPosition(source.position)
      || !fixedPoint(source.sourceStrength)
      || !fixedPoint(source.packagingLeakage)
      || references.has(source.sourceReferenceId)
    ) return null;
    references.add(source.sourceReferenceId);
    sources.push(Object.freeze({
      sourceReferenceId: source.sourceReferenceId,
      position: createWorldPosition(
        source.position.region,
        source.position.localX,
        source.position.localY,
      ),
      sourceStrength: source.sourceStrength,
      packagingLeakage: source.packagingLeakage,
    }));
  }
  sources.sort((left, right) => compareText(left.sourceReferenceId, right.sourceReferenceId));
  return Object.freeze(sources);
}

function toStimulus(
  tick: number,
  targetAggregateId: string,
  candidate: StimulusCandidate,
): CoreEcologySettlementShadowsStimulus {
  return Object.freeze({
    version: CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION,
    stimulusId: `aggregate-stimulus:${hashCanonical({
      sourceKind: candidate.sourceKind,
      sourceReferenceId: candidate.sourceReferenceId,
      targetAggregateId,
      tick,
    })}`,
    sourceReferenceId: candidate.sourceReferenceId,
    sourceKind: candidate.sourceKind,
    response: candidate.response,
    targetAggregateId,
    channels: candidate.channels,
    anchorInfluences: candidate.anchorInfluences,
  });
}

function compareCandidateStrength(left: StimulusCandidate, right: StimulusCandidate): number {
  const leftRange = influenceRange(left.anchorInfluences);
  const rightRange = influenceRange(right.anchorInfluences);
  return rightRange.gradient - leftRange.gradient
    || rightRange.peak - leftRange.peak
    || compareText(left.sourceReferenceId, right.sourceReferenceId);
}

function influenceRange(
  values: readonly CoreEcologySettlementShadowsAnchorInfluence[],
): Readonly<{ readonly gradient: number; readonly peak: number }> {
  let minimum = FIXED_POINT;
  let maximum = 0;
  for (const { intensity } of values) {
    minimum = Math.min(minimum, intensity);
    maximum = Math.max(maximum, intensity);
  }
  return Object.freeze({ gradient: maximum - minimum, peak: maximum });
}

function tileIndexInFrame(
  frame: SpatialFrame,
  world: WorldView,
  position: WorldPosition,
): number | null {
  const point = worldPositionToSpatialFrame(frame, position);
  if (point === null) return null;
  const x = Math.floor(point.x / WORLD_POSITION_UNITS_PER_TILE);
  const y = Math.floor(point.y / WORLD_POSITION_UNITS_PER_TILE);
  if (x < 0 || y < 0 || x >= world.terrain.width || y >= world.terrain.height) return null;
  return y * world.terrain.width + x;
}

function spatialFrameForWorld(world: WorldView): SpatialFrame | null {
  const origin = regionalAddressAt(world, 0);
  if (origin === null) return null;
  try {
    return createSpatialFrame(
      createWorldPosition(
        origin.region,
        origin.localX * WORLD_POSITION_UNITS_PER_TILE,
        origin.localY * WORLD_POSITION_UNITS_PER_TILE,
      ),
      world.terrain.width * WORLD_POSITION_UNITS_PER_TILE,
      world.terrain.height * WORLD_POSITION_UNITS_PER_TILE,
    );
  } catch {
    return null;
  }
}

function rainExposureForTerrain(tile: TerrainTileView): number {
  const terrainExposure = tile.terrain === "deep-water"
    ? FIXED_POINT
    : tile.terrain === "tidal-flat"
      ? 900_000
      : tile.terrain === "ridge"
        ? 850_000
        : tile.terrain === "meadow"
          ? 550_000
          : 300_000;
  const elevationPressure = Math.trunc(tile.elevation / 10);
  const roughShelter = tile.terrain === "marsh"
    ? Math.trunc(tile.roughness / 8)
    : 0;
  return clampFixed(terrainExposure + elevationPressure - roughShelter);
}

function precipitationIntensity(world: WorldView): number {
  if (world.weather.kind !== "rain" && world.weather.kind !== "storm") return 0;
  return world.weather.kind === "storm"
    ? clampFixed(world.weather.intensity + Math.trunc(world.weather.intensity / 3))
    : world.weather.intensity;
}

function influence(
  anchorOrdinal: number,
  intensity: number,
): CoreEcologySettlementShadowsAnchorInfluence {
  return Object.freeze({ anchorOrdinal, intensity: clampFixed(intensity) });
}

function hasPositiveInfluence(
  values: readonly CoreEcologySettlementShadowsAnchorInfluence[],
): boolean {
  return values.some(({ intensity }) => intensity > 0);
}

function multiplyFixed(left: number, right: number): number {
  return Number(BigInt(left) * BigInt(right) / BigInt(FIXED_POINT));
}

function exactWorldDistanceSquared(left: WorldPosition, right: WorldPosition): bigint {
  const deltaX = (BigInt(right.region.x) - BigInt(left.region.x)) * BigInt(REGION_WIDTH_UNITS)
    + BigInt(right.localX) - BigInt(left.localX);
  const deltaY = (BigInt(right.region.y) - BigInt(left.region.y)) * BigInt(REGION_HEIGHT_UNITS)
    + BigInt(right.localY) - BigInt(left.localY);
  return deltaX * deltaX + deltaY * deltaY;
}

function scaleUnit(value: number): number {
  return clampFixed(Math.round(value * FIXED_POINT));
}

function clampFixed(value: number): number {
  return Math.max(0, Math.min(FIXED_POINT, Math.trunc(value)));
}

function validRegionalWorld(world: WorldView, window: RegionalTerrainWindow): boolean {
  return plainRecord(world.terrain)
    && plainRecord(window.terrain)
    && plainRecord(window.origin)
    && positiveSafeInteger(world.terrain.width)
    && positiveSafeInteger(world.terrain.height)
    && world.terrain.width === window.terrain.width
    && world.terrain.height === window.terrain.height
    && Array.isArray(world.terrain.tiles)
    && world.terrain.tiles.length === world.terrain.width * world.terrain.height
    && Array.isArray(window.addresses)
    && window.addresses.length === world.terrain.tiles.length;
}

function validWeather(world: WorldView): boolean {
  return plainRecord(world.weather)
    && (world.weather.kind === "clear"
      || world.weather.kind === "mist"
      || world.weather.kind === "rain"
      || world.weather.kind === "storm")
    && fixedPoint(world.weather.intensity)
    && signedFixedPoint(world.weather.windX)
    && signedFixedPoint(world.weather.windY)
    && nonnegativeSafeInteger(world.weather.nextChangeTick);
}

function fixedPoint(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value <= ACTOR_PERCEPTION_SCALE;
}

function signedFixedPoint(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && !Object.is(value, -0)
    && Math.abs(value) <= ACTOR_PERCEPTION_SCALE;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
}

function stableReference(value: unknown): value is string {
  return typeof value === "string" && STABLE_REFERENCE_PATTERN.test(value);
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const sortedExpected = [...expected].sort(compareText);
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function plainRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

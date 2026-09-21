import { ACTOR_PERCEPTION_SCALE } from "../sim/actorPerception";
import { createActorScentObservation } from "../sim/scentPerception";
import { FIXED_POINT, type TerrainTileView, type WorldView } from "../sim/types";
import { hashCanonical } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS,
  canonicalizeCoreEcologyAggregatePatch,
  type CoreEcologyAggregateAreaAnchor,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyAggregateSpecies,
} from "./coreEcology";
import {
  coreEcologyAggregateSpeciesPolicy,
  resolveCoreEcologyAggregateLivingResponse,
} from "./coreEcologyAggregatePolicy";
import {
  coreEcologyPerceptionCells,
  coreEcologyWeatherVisibility,
} from "./coreEcologyPerception";
import {
  buildOutdoorIlluminationField,
  type OutdoorIlluminationField,
} from "./outdoorIllumination";
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
import {
  LIVING_ACTOR_SPECIES,
  isLivingActorSpecies,
  isLivingSpeciesActorAddressable,
  livingSpeciesActorIdMatchesNamespace,
  type LivingActorSpecies,
} from "./livingSpeciesRegistry";
import { evaluateVisualContact } from "./perception";
import {
  isImmutableRegionalTerrainWindow,
  type RegionalTerrainWindow,
} from "./regionalTravel";
import {
  isImmutableRegionalWorldView,
  regionalAddressAt,
  regionalCompatibilityWorldForWorld,
  regionalWindowForWorld,
} from "./regionalWorldView";
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
export const CORE_ECOLOGY_AGGREGATE_PERCEPTION_MAX_VISUAL_CANDIDATES = 4_096 as const;
export const CORE_ECOLOGY_AGGREGATE_PERCEPTION_MAX_FOOD_SOURCES = 128 as const;
export const CORE_ECOLOGY_AGGREGATE_PERCEPTION_MAX_FOOD_CANDIDATES = 1_024 as const;
const CORE_ECOLOGY_AGGREGATE_RESERVED_NONVISUAL_STIMULI_PER_POPULATION = 2;
export const CORE_ECOLOGY_AGGREGATE_MIN_VISUAL_STIMULI_PER_POPULATION = Math.floor(
  CORE_ECOLOGY_SETTLEMENT_SHADOWS_MAX_STIMULI
    / CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS,
) - CORE_ECOLOGY_AGGREGATE_RESERVED_NONVISUAL_STIMULI_PER_POPULATION;

/**
 * Share the fixed frame budget across only the aggregate populations that are
 * actually present. Two reserved slots per population cover its strongest
 * food and rain candidates even when a species does not use both. This keeps
 * today's two-population web from discarding lawful species while the maximum
 * four-population patch remains bounded by construction.
 */
export function coreEcologyAggregateVisualStimulusBudget(
  aggregatePopulationCount: number,
): number {
  if (
    !Number.isSafeInteger(aggregatePopulationCount)
    || aggregatePopulationCount < 1
    || aggregatePopulationCount > CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS
  ) return 0;
  return Math.max(0, Math.floor(
    (CORE_ECOLOGY_SETTLEMENT_SHADOWS_MAX_STIMULI
      - aggregatePopulationCount
        * CORE_ECOLOGY_AGGREGATE_RESERVED_NONVISUAL_STIMULI_PER_POPULATION)
      / aggregatePopulationCount,
  ));
}

/** One materialized individual supplied by the runtime's active-window owner. */
export interface CoreEcologyAggregateVisualSource {
  readonly sourceReferenceId: string;
  readonly sourceSpecies: LivingActorSpecies;
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
 * Bound a dense living-actor projection before the aggregate sensory cross
 * product. Selection is an exact world-space top-K against every extant
 * aggregate anchor, then favors a currently moving source at equal distance
 * and uses canonical species/ID order as the final deterministic tie-break.
 * Array order and the current camera never participate.
 */
export function selectCoreEcologyAggregateVisualSources(
  patchValue: unknown,
  sourcesValue: unknown,
): readonly CoreEcologyAggregateVisualSource[] | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(patchValue);
  if (
    patch === null
    || !Array.isArray(sourcesValue)
    || sourcesValue.length > CORE_ECOLOGY_AGGREGATE_PERCEPTION_MAX_VISUAL_CANDIDATES
  ) return null;
  const sources = canonicalVisualSources(sourcesValue);
  if (sources === null) return null;
  const anchors = patch.aggregatePopulations.flatMap(({ anchors: populationAnchors }) => (
    populationAnchors
  ));
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
        : right.source.movementSalience - left.source.movementSalience
          || LIVING_ACTOR_SPECIES.indexOf(left.source.sourceSpecies)
            - LIVING_ACTOR_SPECIES.indexOf(right.source.sourceSpecies)
          || compareText(left.source.sourceReferenceId, right.source.sourceReferenceId)
  ));
  return Object.freeze(ranked
    .slice(0, CORE_ECOLOGY_AGGREGATE_PERCEPTION_MAX_VISUAL_SOURCES)
    .map(({ source }) => source));
}

/**
 * Bound a dense physical-food projection before the sensory cross product.
 * Nearest means exact squared world distance to any food-responsive aggregate
 * anchor, with the
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
  const anchors = patch.aggregatePopulations.flatMap((population) => (
    coreEcologyAggregateSpeciesPolicy(population.species).exposedFoodAttraction
      ? population.anchors
      : []
  ));
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
  readonly illumination: OutdoorIlluminationField;
}

interface PreparedAggregatePerceptionWorld {
  readonly world: WorldView;
  readonly window: RegionalTerrainWindow;
  readonly tick: number;
  readonly frame: SpatialFrame;
  readonly cells: NonNullable<ReturnType<typeof coreEcologyPerceptionCells>>;
  readonly illumination: OutdoorIlluminationField;
  readonly weather: WorldView["weather"];
  readonly weatherKind: WorldView["weather"]["kind"];
  readonly weatherIntensity: number;
  readonly weatherWindX: number;
  readonly weatherWindY: number;
  readonly weatherNextChangeTick: number;
  readonly weatherPrototype: object | null;
  readonly weatherKeys: readonly string[];
  readonly compatibilityWorld: WorldView;
  readonly compatibilitySettlements: WorldView["settlements"];
  readonly settlementLampInputs: readonly PreparedSettlementLampInput[];
}

interface PreparedSettlementLampInput {
  readonly settlement: WorldView["settlements"][number];
  readonly project: WorldView["settlements"][number]["project"];
  readonly originKey: unknown;
  readonly tileIndex: unknown;
  readonly projectId: unknown;
  readonly projectKind: unknown;
  readonly projectStatus: unknown;
  readonly settlementPrototype: object | null;
  readonly settlementKeys: readonly string[];
  readonly projectPrototype: object | null;
  readonly projectKeys: readonly string[];
}

interface StimulusCandidate {
  readonly sourceReferenceId: string;
  readonly sourceKind: CoreEcologySettlementShadowsSourceKind;
  readonly response: "pressure" | "attraction";
  readonly channels: readonly ("vision" | "scent" | "touch" | "evidence")[];
  readonly anchorInfluences: readonly CoreEcologySettlementShadowsAnchorInfluence[];
}

const STABLE_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/u;
const COLLECTIVE_VISUAL_CLOSE_RANGE_TILES = 2;
const COLLECTIVE_VISUAL_DIRECT_RANGE_TILES = 10;
const FULL_CIRCLE_RADIANS = Math.PI * 2;

/**
 * Resolves world truth into the bounded aggregate stimulus contract. This is
 * the only bridge in the Settlement Shadows slice that may turn current
 * materialized actors, physical food, or weather into species-authorized
 * aggregate pressure/activity. It creates no synthetic actor/address,
 * cognition, player knowledge, or custody
 * mutation; scent observations are transient and disclose no source identity.
 */
export function deriveCoreEcologySettlementShadowsStimulusFrame(
  value: unknown,
): CoreEcologySettlementShadowsStimulusFrame | null {
  return deriveCoreEcologySettlementShadowsStimulusFrameWithPreparedWorld(value, null);
}

/**
 * @internal Prepare one exact immutable regional world for a bounded,
 * synchronous group of aggregate-patch derivations. The supplied derive
 * closure is revoked as soon as `run` returns or throws, so the prepared
 * geometry cannot become a cache or an alternate source of world truth.
 */
export function withPreparedCoreEcologyAggregatePerceptionWorld<Result>(
  value: unknown,
  run: (
    derive: typeof deriveCoreEcologySettlementShadowsStimulusFrame,
  ) => Result,
): Result | null {
  if (typeof run !== "function") return null;
  const prepared = prepareAggregatePerceptionWorld(value);
  if (prepared === null) return null;
  let active = true;
  const derive = (inputValue: unknown): CoreEcologySettlementShadowsStimulusFrame | null => {
    if (!active) return null;
    try {
      return deriveCoreEcologySettlementShadowsStimulusFrameWithPreparedWorld(
        inputValue,
        prepared,
      );
    } catch {
      return null;
    }
  };
  try {
    const result = run(derive);
    active = false;
    return preparedAggregatePerceptionWorldStillCurrent(prepared)
      ? result
      : null;
  } finally {
    active = false;
  }
}

function deriveCoreEcologySettlementShadowsStimulusFrameWithPreparedWorld(
  value: unknown,
  prepared: PreparedAggregatePerceptionWorld | null,
): CoreEcologySettlementShadowsStimulusFrame | null {
  const input = canonicalInput(value, prepared);
  if (input === null || input.cells === null) return null;
  const stimuli: CoreEcologySettlementShadowsStimulus[] = [];
  const populations = [...input.patch.aggregatePopulations].sort((left, right) => (
    compareText(left.aggregateId, right.aggregateId)
  ));
  const visualStimulusBudget = coreEcologyAggregateVisualStimulusBudget(populations.length);

  for (const population of populations) {
    const policy = coreEcologyAggregateSpeciesPolicy(population.species);
    const profile = livingActorSenseProfile(population.species);
    const bestVisual = new Map<LivingActorSpecies, StimulusCandidate>();
    for (const source of input.visualSources) {
      const response = resolveCoreEcologyAggregateLivingResponse(
        population.species,
        source.sourceSpecies,
      );
      if (response === null) continue;
      const candidate = visualCandidate(
        input,
        population.species,
        population.aggregateId,
        population.anchors,
        source,
        response.sourceKind,
      );
      if (candidate === null) continue;
      const previous = bestVisual.get(source.sourceSpecies);
      if (previous === undefined || compareCandidateStrength(candidate, previous) < 0) {
        bestVisual.set(source.sourceSpecies, candidate);
      }
    }
    const selectedVisual = [...bestVisual.entries()].sort((left, right) => (
      compareCandidateStrength(left[1], right[1])
      || LIVING_ACTOR_SPECIES.indexOf(left[0]) - LIVING_ACTOR_SPECIES.indexOf(right[0])
    )).slice(0, visualStimulusBudget);
    for (const [, candidate] of selectedVisual) {
      stimuli.push(toStimulus(input.tick, population.aggregateId, candidate));
    }

    if (policy.exposedFoodAttraction) {
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
    }

    if (policy.rainSensitive) {
      const rain = rainCandidate(
        input,
        population.aggregateId,
        population.anchors,
        policy.rainResponse,
      );
      if (rain !== null) stimuli.push(toStimulus(input.tick, population.aggregateId, rain));
    }
  }

  if (stimuli.length > CORE_ECOLOGY_SETTLEMENT_SHADOWS_MAX_STIMULI) return null;
  return canonicalizeCoreEcologySettlementShadowsStimulusFrame({
    version: CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION,
    atTick: input.tick,
    stimuli,
  });
}

/** Species-neutral name for new callers; the historical export stays stable. */
export const deriveCoreEcologyAggregateStimulusFrame =
  deriveCoreEcologySettlementShadowsStimulusFrame;

function visualCandidate(
  input: CanonicalAggregatePerceptionFrame,
  species: CoreEcologyAggregateSpecies,
  aggregateId: string,
  anchors: readonly CoreEcologyAggregateAreaAnchor[],
  source: CoreEcologyAggregateVisualSource,
  sourceKind: CoreEcologySettlementShadowsSourceKind,
): StimulusCandidate | null {
  const sourceTileIndex = tileIndexInFrame(input.frame, input.world, source.position);
  if (sourceTileIndex === null) return null;
  const sourceTile = input.world.terrain.tiles[sourceTileIndex];
  if (sourceTile === undefined) return null;
  const targetLightVisibility = physicalLightVisibility(
    input.illumination,
    sourceTileIndex,
  );
  if (targetLightVisibility === null) return null;
  const profile = livingActorSenseProfile(species);
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
      targetLightVisibility,
    });
    return influence(anchor.anchorOrdinal, sight === null ? 0 : scaleUnit(sight.confidence));
  });
  if (!hasPositiveInfluence(anchorInfluences)) return null;
  return Object.freeze({
    sourceReferenceId: source.sourceReferenceId,
    sourceKind,
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
  response: "attraction" | "pressure",
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
    response,
    channels: Object.freeze(["touch", "evidence"] as const),
    anchorInfluences: Object.freeze(anchorInfluences),
  });
}

function canonicalInput(
  value: unknown,
  prepared: PreparedAggregatePerceptionWorld | null,
): CanonicalAggregatePerceptionFrame | null {
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
  if (prepared !== null) {
    if (
      world !== prepared.world
      || window !== prepared.window
      || value.tick !== prepared.tick
    ) return null;
    const visualSources = canonicalVisualSources(value.visualSources);
    const exposedFoodSources = canonicalFoodSources(value.exposedFoodSources);
    if (
      visualSources === null
      || exposedFoodSources === null
      || !preparedAggregatePerceptionWorldStillCurrent(prepared)
    ) return null;
    return Object.freeze({
      patch,
      world,
      window,
      tick: value.tick,
      visualSources,
      exposedFoodSources,
      frame: prepared.frame,
      cells: prepared.cells,
      illumination: prepared.illumination,
    });
  }
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
  const illumination = cells === null
    ? null
    : buildOutdoorIlluminationField(world, cells);
  if (frame === null || cells === null || illumination === null) return null;
  return Object.freeze({
    patch,
    world,
    window,
    tick: value.tick,
    visualSources,
    exposedFoodSources,
    frame,
    cells,
    illumination,
  });
}

function prepareAggregatePerceptionWorld(
  value: unknown,
): PreparedAggregatePerceptionWorld | null {
  try {
    if (!plainRecord(value) || !exactKeys(value, ["tick", "window", "world"])) return null;
    if (
      !nonnegativeSafeInteger(value.tick)
      || !plainRecord(value.world)
      || !plainRecord(value.window)
    ) return null;
    const world = value.world as unknown as WorldView;
    const window = value.window as unknown as RegionalTerrainWindow;
    if (
      !isImmutableRegionalWorldView(world)
      || regionalWindowForWorld(world) !== window
      || world.completedTick !== value.tick
      || !isImmutableRegionalTerrainWindow(window)
      || !validRegionalWorld(world, window)
      || !validWeather(world)
    ) return null;
    const frame = spatialFrameForWorld(world);
    const cells = coreEcologyPerceptionCells(world);
    const illumination = cells === null
      ? null
      : buildOutdoorIlluminationField(world, cells);
    if (frame === null || cells === null || illumination === null) return null;
    const compatibilityWorld = regionalCompatibilityWorldForWorld(world) ?? world;
    if (!Array.isArray(compatibilityWorld.settlements)) return null;
    const settlementLampInputs: PreparedSettlementLampInput[] = [];
    for (const settlementValue of compatibilityWorld.settlements) {
      if (!plainRecord(settlementValue) || !plainRecord(settlementValue.project)) return null;
      const settlement = settlementValue as WorldView["settlements"][number];
      const captured: PreparedSettlementLampInput = Object.freeze({
        settlement,
        project: settlement.project,
        originKey: settlement.originKey,
        tileIndex: settlement.tileIndex,
        projectId: settlement.project.id,
        projectKind: settlement.project.kind,
        projectStatus: settlement.project.status,
        settlementPrototype: Object.getPrototypeOf(settlement),
        settlementKeys: Object.freeze(Object.keys(settlement).sort(compareText)),
        projectPrototype: Object.getPrototypeOf(settlement.project),
        projectKeys: Object.freeze(Object.keys(settlement.project).sort(compareText)),
      });
      settlementLampInputs.push(captured);
    }
    return Object.freeze({
      world,
      window,
      tick: value.tick,
      frame,
      cells,
      illumination,
      weather: world.weather,
      weatherKind: world.weather.kind,
      weatherIntensity: world.weather.intensity,
      weatherWindX: world.weather.windX,
      weatherWindY: world.weather.windY,
      weatherNextChangeTick: world.weather.nextChangeTick,
      weatherPrototype: Object.getPrototypeOf(world.weather),
      weatherKeys: Object.freeze(Object.keys(world.weather).sort(compareText)),
      compatibilityWorld,
      compatibilitySettlements: compatibilityWorld.settlements,
      settlementLampInputs: Object.freeze(settlementLampInputs),
    });
  } catch {
    return null;
  }
}

function preparedAggregatePerceptionWorldStillCurrent(
  prepared: PreparedAggregatePerceptionWorld,
): boolean {
  try {
    const world = prepared.world;
    const weather = world.weather;
    if (
      !isImmutableRegionalWorldView(world)
      || regionalWindowForWorld(world) !== prepared.window
      || !isImmutableRegionalTerrainWindow(prepared.window)
      || world.completedTick !== prepared.tick
      || weather !== prepared.weather
      || !validWeather(world)
      || Object.getPrototypeOf(weather) !== prepared.weatherPrototype
      || !exactKeys(weather, prepared.weatherKeys)
      || weather.kind !== prepared.weatherKind
      || !Object.is(weather.intensity, prepared.weatherIntensity)
      || !Object.is(weather.windX, prepared.weatherWindX)
      || !Object.is(weather.windY, prepared.weatherWindY)
      || !Object.is(weather.nextChangeTick, prepared.weatherNextChangeTick)
    ) return false;
    const compatibilityWorld = regionalCompatibilityWorldForWorld(world) ?? world;
    if (
      compatibilityWorld !== prepared.compatibilityWorld
      || compatibilityWorld.settlements !== prepared.compatibilitySettlements
      || compatibilityWorld.settlements.length !== prepared.settlementLampInputs.length
    ) return false;
    for (let index = 0; index < prepared.settlementLampInputs.length; index += 1) {
      const captured = prepared.settlementLampInputs[index];
      const settlement = compatibilityWorld.settlements[index];
      if (
        captured === undefined
        || settlement !== captured.settlement
        || !plainRecord(settlement)
        || Object.getPrototypeOf(settlement) !== captured.settlementPrototype
        || !exactKeys(
          settlement as unknown as Readonly<Record<string, unknown>>,
          captured.settlementKeys,
        )
        || !plainRecord(settlement.project)
        || settlement.project !== captured.project
        || Object.getPrototypeOf(settlement.project) !== captured.projectPrototype
        || !exactKeys(
          settlement.project as unknown as Readonly<Record<string, unknown>>,
          captured.projectKeys,
        )
        || settlement.originKey !== captured.originKey
        || !Object.is(settlement.tileIndex, captured.tileIndex)
        || !Object.is(settlement.project.id, captured.projectId)
        || settlement.project.kind !== captured.projectKind
        || settlement.project.status !== captured.projectStatus
      ) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function physicalLightVisibility(
  field: OutdoorIlluminationField,
  tileIndex: number,
): number | null {
  const value = field.physicalIllumination[tileIndex];
  return fixedPoint(value) ? value / FIXED_POINT : null;
}

function canonicalVisualSources(value: readonly unknown[]): readonly CoreEcologyAggregateVisualSource[] | null {
  const sources: CoreEcologyAggregateVisualSource[] = [];
  const references = new Set<string>();
  for (const source of value) {
    if (
      !plainRecord(source)
      || !exactKeys(source, ["movementSalience", "position", "sourceReferenceId", "sourceSpecies"])
      || !stableReference(source.sourceReferenceId)
      || !isLivingActorSpecies(source.sourceSpecies)
      || !isLivingSpeciesActorAddressable(source.sourceSpecies)
      || !livingSpeciesActorIdMatchesNamespace(
        source.sourceReferenceId,
        source.sourceSpecies,
      )
      || !isWorldPosition(source.position)
      || !fixedPoint(source.movementSalience)
      || references.has(source.sourceReferenceId)
    ) return null;
    references.add(source.sourceReferenceId);
    sources.push(Object.freeze({
      sourceReferenceId: source.sourceReferenceId,
      sourceSpecies: source.sourceSpecies,
      position: createWorldPosition(
        source.position.region,
        source.position.localX,
        source.position.localY,
      ),
      movementSalience: source.movementSalience,
    }));
  }
  sources.sort((left, right) => (
    LIVING_ACTOR_SPECIES.indexOf(left.sourceSpecies)
      - LIVING_ACTOR_SPECIES.indexOf(right.sourceSpecies)
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

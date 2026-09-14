import { FIXED_POINT } from "../sim/types";
import { CORE_ECOLOGY_TIDAL_MINIMUM_FISH_DEPTH } from "./coreEcologyHabitat";
import { CORE_ECOLOGY_POLAR_SHORE_MINIMUM_CAPELIN_DEPTH } from "./coreEcologyPolarShoreHabitat";

/** Published Alpha-19 cadence; retained verbatim for save-history adoption. */
export const CORE_ECOLOGY_SILVERSIDE_REDISTRIBUTION_CADENCE_TICKS = 4 as const;

const SCHOOL_DEPTH_REFERENCE = 140_000;
const CAPELIN_SCHOOL_DEPTH_REFERENCE = 180_000;
const CRAB_INUNDATION_REFERENCE = 120_000;
const MARSH_CHANNEL_MINIMUM_WATER_DEPTH = 1;
const BLUE_CRAB_MINIMUM_WATER_DEPTH = 20_000;

/** Exact tidal-aggregate roster through the Alpha-36 polar-forage slice. */
export const CORE_ECOLOGY_ALPHA36_TIDAL_AGGREGATE_SPECIES = Object.freeze([
  "atlantic-silverside",
  "atlantic-marsh-fiddler-crab",
  "atlantic-capelin",
] as const);

/** Immutable tidal-aggregate registry through the first Wave-G estuary cluster. */
export const CORE_ECOLOGY_WAVE_G_ESTUARY_TIDAL_AGGREGATE_SPECIES = Object.freeze([
  ...CORE_ECOLOGY_ALPHA36_TIDAL_AGGREGATE_SPECIES,
  "bay-anchovy",
  "atlantic-ghost-crab",
] as const);

/** Append-only current roster; new species consume shared policy records. */
export const CORE_ECOLOGY_TIDAL_AGGREGATE_SPECIES = Object.freeze([
  ...CORE_ECOLOGY_WAVE_G_ESTUARY_TIDAL_AGGREGATE_SPECIES,
  "atlantic-menhaden",
  "mummichog",
  "grass-shrimp",
  "blue-crab",
  "marsh-periwinkle",
] as const);

export type CoreEcologyTidalAggregateSpecies =
  (typeof CORE_ECOLOGY_TIDAL_AGGREGATE_SPECIES)[number];

export interface CoreEcologyTidalAnchorDepthLike {
  readonly aggregateId: string;
  readonly anchorOrdinal: number;
  readonly waterDepth: number;
  readonly activityUsable: boolean;
}

export interface CoreEcologyTidalPopulationLike {
  readonly aggregateId: string;
  readonly lastTidalRedistributionTick: number | null;
  readonly anchors: readonly Readonly<{
    readonly anchorOrdinal: number;
    readonly populationUnits: number;
  }>[];
}

export interface CoreEcologyTidalRedistribution {
  readonly fromAnchorOrdinal: number;
  readonly toAnchorOrdinal: number;
  readonly populationUnits: number;
  readonly pressure: number;
}

interface CoreEcologyTidalDepthWindow {
  readonly minimumInclusive: number;
  readonly maximumExclusive: number | null;
}

export interface CoreEcologyTidalRedistributionPolicy {
  readonly cadenceTicks: number;
  readonly populationUnitsPerCadence: 1;
  readonly durableOperationClock: true;
  readonly evacuateUnusableAnchors: true;
  readonly evacuationDestination: "deepest-usable";
  readonly smallWorldDestinations: "activity-usable";
  readonly risingDestination: "shallowest-usable";
  readonly fallingDestination: "deepest-usable";
  readonly evacuationPressure: typeof FIXED_POINT;
  readonly relocationPressureBase: number;
  readonly relocationPressurePerDepthUnit: number;
}

export interface CoreEcologyTidalAggregatePolicy {
  readonly species: CoreEcologyTidalAggregateSpecies;
  readonly activityDepthWindow: CoreEcologyTidalDepthWindow;
  readonly activityProjection:
    | Readonly<{
        readonly kind: "submerged-schooling";
        readonly depthReference: number;
        readonly baseSupport: number;
        readonly depthSupportWeight: number;
        readonly risingSupport: number;
        readonly fallingSupport: number;
        readonly directionalSupportWeight: number;
      }>
    | Readonly<{
        readonly kind: "exposed-flat-foraging";
        readonly inundationReference: number;
        readonly baseSupport: number;
        readonly exposureSupportWeight: number;
        readonly risingSupport: number;
        readonly fallingSupport: number;
        readonly directionalSupportWeight: number;
      }>;
  readonly redistribution: CoreEcologyTidalRedistributionPolicy | null;
}

const SILVERSIDE_POLICY: CoreEcologyTidalAggregatePolicy = Object.freeze({
  species: "atlantic-silverside",
  activityDepthWindow: Object.freeze({
    minimumInclusive: CORE_ECOLOGY_TIDAL_MINIMUM_FISH_DEPTH,
    maximumExclusive: null,
  }),
  activityProjection: Object.freeze({
    kind: "submerged-schooling",
    depthReference: SCHOOL_DEPTH_REFERENCE,
    baseSupport: 180_000,
    depthSupportWeight: 560_000,
    risingSupport: 920_000,
    fallingSupport: 680_000,
    directionalSupportWeight: 260_000,
  }),
  redistribution: Object.freeze({
    cadenceTicks: CORE_ECOLOGY_SILVERSIDE_REDISTRIBUTION_CADENCE_TICKS,
    populationUnitsPerCadence: 1,
    durableOperationClock: true,
    evacuateUnusableAnchors: true,
    evacuationDestination: "deepest-usable",
    smallWorldDestinations: "activity-usable",
    risingDestination: "shallowest-usable",
    fallingDestination: "deepest-usable",
    evacuationPressure: FIXED_POINT,
    relocationPressureBase: 150_000,
    relocationPressurePerDepthUnit: 4,
  }),
});

const FIDDLER_CRAB_POLICY: CoreEcologyTidalAggregatePolicy = Object.freeze({
  species: "atlantic-marsh-fiddler-crab",
  activityDepthWindow: Object.freeze({
    minimumInclusive: 0,
    maximumExclusive: CRAB_INUNDATION_REFERENCE,
  }),
  activityProjection: Object.freeze({
    kind: "exposed-flat-foraging",
    inundationReference: CRAB_INUNDATION_REFERENCE,
    baseSupport: 120_000,
    exposureSupportWeight: 700_000,
    risingSupport: 520_000,
    fallingSupport: FIXED_POINT,
    directionalSupportWeight: 180_000,
  }),
  redistribution: null,
});

const ATLANTIC_CAPELIN_POLICY: CoreEcologyTidalAggregatePolicy = Object.freeze({
  species: "atlantic-capelin",
  activityDepthWindow: Object.freeze({
    minimumInclusive: CORE_ECOLOGY_POLAR_SHORE_MINIMUM_CAPELIN_DEPTH,
    maximumExclusive: null,
  }),
  activityProjection: Object.freeze({
    kind: "submerged-schooling",
    depthReference: CAPELIN_SCHOOL_DEPTH_REFERENCE,
    baseSupport: 190_000,
    depthSupportWeight: 550_000,
    risingSupport: 940_000,
    fallingSupport: 640_000,
    directionalSupportWeight: 280_000,
  }),
  redistribution: Object.freeze({
    cadenceTicks: CORE_ECOLOGY_SILVERSIDE_REDISTRIBUTION_CADENCE_TICKS,
    populationUnitsPerCadence: 1,
    durableOperationClock: true,
    evacuateUnusableAnchors: true,
    evacuationDestination: "deepest-usable",
    smallWorldDestinations: "activity-usable",
    risingDestination: "shallowest-usable",
    fallingDestination: "deepest-usable",
    evacuationPressure: FIXED_POINT,
    relocationPressureBase: 170_000,
    relocationPressurePerDepthUnit: 3,
  }),
});

/**
 * Estuary breadth consumes the same submerged-schooling law as silversides.
 * The separate species record preserves identity without creating a controller.
 */
const BAY_ANCHOVY_POLICY: CoreEcologyTidalAggregatePolicy = Object.freeze({
  species: "bay-anchovy",
  activityDepthWindow: SILVERSIDE_POLICY.activityDepthWindow,
  activityProjection: SILVERSIDE_POLICY.activityProjection,
  redistribution: SILVERSIDE_POLICY.redistribution,
});

/** Ghost-crab surface activity follows the same exposed-flat tide law. */
const ATLANTIC_GHOST_CRAB_POLICY: CoreEcologyTidalAggregatePolicy = Object.freeze({
  species: "atlantic-ghost-crab",
  activityDepthWindow: FIDDLER_CRAB_POLICY.activityDepthWindow,
  activityProjection: FIDDLER_CRAB_POLICY.activityProjection,
  redistribution: FIDDLER_CRAB_POLICY.redistribution,
});

const SHALLOW_SUBMERGED_ACTIVITY_PROJECTION = Object.freeze({
  kind: "submerged-schooling" as const,
  depthReference: SCHOOL_DEPTH_REFERENCE,
  baseSupport: 180_000,
  depthSupportWeight: 560_000,
  risingSupport: 920_000,
  fallingSupport: 680_000,
  directionalSupportWeight: 260_000,
});

const EBB_BENTHIC_ACTIVITY_PROJECTION = Object.freeze({
  kind: "submerged-schooling" as const,
  depthReference: SCHOOL_DEPTH_REFERENCE,
  baseSupport: 180_000,
  depthSupportWeight: 520_000,
  risingSupport: 640_000,
  fallingSupport: 940_000,
  directionalSupportWeight: 300_000,
});

function marshChannelRedistribution(
  cadenceTicks: number,
): CoreEcologyTidalRedistributionPolicy {
  return Object.freeze({
    cadenceTicks,
    populationUnitsPerCadence: 1,
    durableOperationClock: true,
    evacuateUnusableAnchors: true,
    evacuationDestination: "deepest-usable",
    smallWorldDestinations: "activity-usable",
    risingDestination: "shallowest-usable",
    fallingDestination: "deepest-usable",
    evacuationPressure: FIXED_POINT,
    relocationPressureBase: 150_000,
    relocationPressurePerDepthUnit: 4,
  });
}

/** Menhaden consume the established depth-safe school law unchanged. */
const ATLANTIC_MENHADEN_POLICY: CoreEcologyTidalAggregatePolicy = Object.freeze({
  species: "atlantic-menhaden",
  activityDepthWindow: SILVERSIDE_POLICY.activityDepthWindow,
  activityProjection: SILVERSIDE_POLICY.activityProjection,
  redistribution: SILVERSIDE_POLICY.redistribution,
});

/** Mummichog remain valid in the cohort's authenticated shallow-water refuge. */
const MUMMICHOG_POLICY: CoreEcologyTidalAggregatePolicy = Object.freeze({
  species: "mummichog",
  activityDepthWindow: Object.freeze({
    minimumInclusive: MARSH_CHANNEL_MINIMUM_WATER_DEPTH,
    maximumExclusive: null,
  }),
  activityProjection: SHALLOW_SUBMERGED_ACTIVITY_PROJECTION,
  redistribution: marshChannelRedistribution(4),
});

/** Shrimp use the same submerged projection with their slower shared cadence. */
const GRASS_SHRIMP_POLICY: CoreEcologyTidalAggregatePolicy = Object.freeze({
  species: "grass-shrimp",
  activityDepthWindow: Object.freeze({
    minimumInclusive: MARSH_CHANNEL_MINIMUM_WATER_DEPTH,
    maximumExclusive: null,
  }),
  activityProjection: SHALLOW_SUBMERGED_ACTIVITY_PROJECTION,
  redistribution: marshChannelRedistribution(6),
});

/** Blue-crab benthic activity favors ebb while retaining a submerged refuge. */
const BLUE_CRAB_POLICY: CoreEcologyTidalAggregatePolicy = Object.freeze({
  species: "blue-crab",
  activityDepthWindow: Object.freeze({
    minimumInclusive: BLUE_CRAB_MINIMUM_WATER_DEPTH,
    maximumExclusive: null,
  }),
  activityProjection: EBB_BENTHIC_ACTIVITY_PROJECTION,
  redistribution: marshChannelRedistribution(8),
});

/** Periwinkles remain conserved in place while tide reveals or covers their activity. */
const MARSH_PERIWINKLE_POLICY: CoreEcologyTidalAggregatePolicy = Object.freeze({
  species: "marsh-periwinkle",
  activityDepthWindow: FIDDLER_CRAB_POLICY.activityDepthWindow,
  activityProjection: FIDDLER_CRAB_POLICY.activityProjection,
  redistribution: null,
});

/**
 * Ordered adapter registry for aggregates governed by live tide. Appending a
 * species policy extends the shared table without adding a new species branch
 * to its projection, cadence, evacuation, or small-world routing owners.
 */
export const CORE_ECOLOGY_TIDAL_AGGREGATE_POLICIES:
readonly CoreEcologyTidalAggregatePolicy[] = Object.freeze([
  SILVERSIDE_POLICY,
  FIDDLER_CRAB_POLICY,
  ATLANTIC_CAPELIN_POLICY,
  BAY_ANCHOVY_POLICY,
  ATLANTIC_GHOST_CRAB_POLICY,
  ATLANTIC_MENHADEN_POLICY,
  MUMMICHOG_POLICY,
  GRASS_SHRIMP_POLICY,
  BLUE_CRAB_POLICY,
  MARSH_PERIWINKLE_POLICY,
]);

if (
  CORE_ECOLOGY_TIDAL_AGGREGATE_POLICIES.length
    !== CORE_ECOLOGY_TIDAL_AGGREGATE_SPECIES.length
  || CORE_ECOLOGY_TIDAL_AGGREGATE_POLICIES.some((policy, index) => (
    policy.species !== CORE_ECOLOGY_TIDAL_AGGREGATE_SPECIES[index]
  ))
) throw new Error("Core ecology tidal aggregate policy registry is inconsistent");

const POLICIES = new Map<CoreEcologyTidalAggregateSpecies, CoreEcologyTidalAggregatePolicy>(
  CORE_ECOLOGY_TIDAL_AGGREGATE_POLICIES.map((policy) => [policy.species, policy]),
);

export function isCoreEcologyTidalAggregateSpecies(
  value: unknown,
): value is CoreEcologyTidalAggregateSpecies {
  return typeof value === "string" && POLICIES.has(value as CoreEcologyTidalAggregateSpecies);
}

export function coreEcologyTidalAggregatePolicy(
  species: unknown,
): CoreEcologyTidalAggregatePolicy | null {
  return isCoreEcologyTidalAggregateSpecies(species) ? POLICIES.get(species) ?? null : null;
}

export function coreEcologyTidalAggregateUsesDurableRedistributionClock(
  species: unknown,
): boolean {
  return coreEcologyTidalAggregatePolicy(species)?.redistribution?.durableOperationClock === true;
}

export function coreEcologyTidalAnchorActivityUsable(
  species: unknown,
  waterDepth: unknown,
): boolean {
  const policy = coreEcologyTidalAggregatePolicy(species);
  if (policy === null || !nonnegativeSafeInteger(waterDepth)) return false;
  return waterDepth >= policy.activityDepthWindow.minimumInclusive
    && (
      policy.activityDepthWindow.maximumExclusive === null
      || waterDepth < policy.activityDepthWindow.maximumExclusive
    );
}

/**
 * Null means tidal depth places no additional constraint on general aggregate
 * displacement. An empty list means this policy requires water-safe anchors,
 * but the current projection authenticates none.
 */
export function coreEcologyTidalLawfulDestinationOrdinals(
  species: unknown,
  depths: readonly CoreEcologyTidalAnchorDepthLike[],
): readonly number[] | null {
  const policy = coreEcologyTidalAggregatePolicy(species);
  if (policy?.redistribution?.smallWorldDestinations !== "activity-usable") return null;
  return Object.freeze(depths
    .filter(({ waterDepth }) => coreEcologyTidalAnchorActivityUsable(species, waterDepth))
    .map(({ anchorOrdinal }) => anchorOrdinal)
    .sort((left, right) => left - right));
}

export function coreEcologyTidalEvacuationDestinationOrdinal(
  species: unknown,
  depths: readonly CoreEcologyTidalAnchorDepthLike[],
): number | null {
  const policy = coreEcologyTidalAggregatePolicy(species);
  if (
    policy?.redistribution?.evacuateUnusableAnchors !== true
    || policy.redistribution.evacuationDestination !== "deepest-usable"
  ) return null;
  const destination = depths
    .filter(({ waterDepth }) => coreEcologyTidalAnchorActivityUsable(species, waterDepth))
    .sort((left, right) => (
      right.waterDepth - left.waterDepth || left.anchorOrdinal - right.anchorOrdinal
    ))[0];
  return destination?.anchorOrdinal ?? null;
}

export function coreEcologyTidalRedistributionIsDue(
  species: unknown,
  atTick: unknown,
  lastTidalRedistributionTick: unknown,
): boolean {
  const redistribution = coreEcologyTidalAggregatePolicy(species)?.redistribution;
  if (
    redistribution === null
    || redistribution === undefined
    || !nonnegativeSafeInteger(atTick)
    || (lastTidalRedistributionTick !== null
      && !nonnegativeSafeInteger(lastTidalRedistributionTick))
  ) return false;
  return atTick > 0
    && atTick % redistribution.cadenceTicks === 0
    && lastTidalRedistributionTick !== atTick;
}

export function resolveCoreEcologyTidalRedistribution(
  species: unknown,
  population: CoreEcologyTidalPopulationLike,
  depths: readonly CoreEcologyTidalAnchorDepthLike[],
  tideDirection: -1 | 1,
): CoreEcologyTidalRedistribution | null {
  const policy = coreEcologyTidalAggregatePolicy(species);
  const redistribution = policy?.redistribution;
  if (redistribution === null || redistribution === undefined) return null;
  const usable = depths.filter(({ aggregateId, waterDepth }) => (
    aggregateId === population.aggregateId
    && coreEcologyTidalAnchorActivityUsable(species, waterDepth)
  )).sort((left, right) => (
    left.waterDepth - right.waterDepth || left.anchorOrdinal - right.anchorOrdinal
  ));
  if (usable.length < 2) return null;
  const destination = tideDirection > 0
    ? redistribution.risingDestination === "shallowest-usable" ? usable[0] : usable.at(-1)
    : redistribution.fallingDestination === "deepest-usable" ? usable.at(-1) : usable[0];
  if (destination === undefined) return null;
  const sources = usable.filter(({ anchorOrdinal }) => (
    anchorOrdinal !== destination.anchorOrdinal
    && (population.anchors[anchorOrdinal]?.populationUnits ?? 0) > 0
  ));
  sources.sort((left, right) => tideDirection > 0
    ? right.waterDepth - left.waterDepth || left.anchorOrdinal - right.anchorOrdinal
    : left.waterDepth - right.waterDepth || left.anchorOrdinal - right.anchorOrdinal);
  const source = sources[0];
  if (source === undefined || source.waterDepth === destination.waterDepth) return null;
  return Object.freeze({
    fromAnchorOrdinal: source.anchorOrdinal,
    toAnchorOrdinal: destination.anchorOrdinal,
    populationUnits: redistribution.populationUnitsPerCadence,
    pressure: Math.max(
      1,
      Math.min(
        FIXED_POINT,
        redistribution.relocationPressureBase
          + Math.abs(source.waterDepth - destination.waterDepth)
            * redistribution.relocationPressurePerDepthUnit,
      ),
    ),
  });
}

export function resolveCoreEcologyTidalAggregateActivity(
  species: unknown,
  habitatIntensity: unknown,
  averageDepth: unknown,
  tideDirection: -1 | 1,
  hasOccupiedUsableAnchor: boolean,
): number | null {
  const policy = coreEcologyTidalAggregatePolicy(species);
  if (
    policy === null
    || !fixedInteger(habitatIntensity)
    || !nonnegativeSafeInteger(averageDepth)
  ) return null;
  const projection = policy.activityProjection;
  if (projection.kind === "submerged-schooling") {
    if (!hasOccupiedUsableAnchor) return 0;
    const depthSupport = ratioFixed(averageDepth, projection.depthReference);
    const directionalSupport = tideDirection > 0
      ? projection.risingSupport
      : projection.fallingSupport;
    const tidalSupport = Math.min(
      FIXED_POINT,
      projection.baseSupport
        + multiplyFixed(depthSupport, projection.depthSupportWeight)
        + multiplyFixed(directionalSupport, projection.directionalSupportWeight),
    );
    return Math.max(1, multiplyFixed(habitatIntensity, tidalSupport));
  }
  if (averageDepth >= projection.inundationReference) return 0;
  const inundation = ratioFixed(averageDepth, projection.inundationReference);
  const exposure = FIXED_POINT - inundation;
  const directionalSupport = tideDirection > 0
    ? projection.risingSupport
    : projection.fallingSupport;
  const tidalSupport = Math.min(
    FIXED_POINT,
    projection.baseSupport
      + multiplyFixed(exposure, projection.exposureSupportWeight)
      + multiplyFixed(directionalSupport, projection.directionalSupportWeight),
  );
  return Math.max(1, multiplyFixed(habitatIntensity, tidalSupport));
}

function ratioFixed(value: number, reference: number): number {
  if (value <= 0) return 0;
  if (value >= reference) return FIXED_POINT;
  return Math.trunc(value * FIXED_POINT / reference);
}

function multiplyFixed(left: number, right: number): number {
  return Math.trunc((left * right + Math.trunc(FIXED_POINT / 2)) / FIXED_POINT);
}

function fixedInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value <= FIXED_POINT;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

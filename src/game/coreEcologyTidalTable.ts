import { tideAtTick } from "../sim/terrain";
import { FIXED_POINT } from "../sim/types";
import {
  CORE_ECOLOGY_MAX_STEP_TICKS,
  CORE_ECOLOGY_SILVERSIDE_REDISTRIBUTION_CADENCE_TICKS,
  canonicalizeCoreEcologyAggregatePatch,
  displaceCoreEcologyAggregatePopulation,
  markCoreEcologyAggregateTidalRedistribution,
  setCoreEcologyAggregateActivityIntensity,
  type CoreEcologyAggregateDisturbance,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyAggregatePopulationState,
} from "./coreEcology";
import {
  CORE_ECOLOGY_SNOWY_EGRET_MAXIMUM_WADING_DEPTH,
  CORE_ECOLOGY_SNOWY_EGRET_MINIMUM_WADING_DEPTH,
  CORE_ECOLOGY_TIDAL_MINIMUM_FISH_DEPTH,
} from "./coreEcologyHabitat";
import type { WorldPosition } from "./worldPosition";

export const CORE_ECOLOGY_TIDAL_TABLE_VERSION = 1 as const;
export const CORE_ECOLOGY_TIDAL_TABLE_OWNER_ID =
  "game:core-ecology-tidal-table:v1" as const;
export const CORE_ECOLOGY_TIDAL_TABLE_MAX_DEPTH_RECORDS = 7 as const;
const SCHOOL_DEPTH_REFERENCE = 140_000;
const CRAB_INUNDATION_REFERENCE = 120_000;
const EGRET_PREFERRED_WADING_DEPTH = 34_000;

export type CoreEcologyTidalAggregateSpecies =
  | "atlantic-silverside"
  | "atlantic-marsh-fiddler-crab";

/** A local depth derived from saved baseline elevation plus authoritative tide. */
export interface CoreEcologyTidalAnchorDepth {
  readonly aggregateId: string;
  readonly species: CoreEcologyTidalAggregateSpecies;
  readonly anchorOrdinal: number;
  readonly position: WorldPosition;
  readonly elevation: number;
  readonly waterDepth: number;
  readonly activityUsable: boolean;
}

export interface CoreEcologySnowyEgretTidalTarget {
  readonly purpose: "wading" | "refuge";
  readonly targetAnchorOrdinal: number;
  readonly targetPosition: WorldPosition;
  readonly waterDepth: number;
}

export interface CoreEcologySnowyEgretTidalActivity {
  readonly actorId: string;
  /** Every currently depth-safe, authenticated wading anchor in stable preference order. */
  readonly wadingTargets: readonly CoreEcologySnowyEgretTidalTarget[];
  /** Null means the current tide exposes no depth-safe feeding edge. */
  readonly wadingTarget: CoreEcologySnowyEgretTidalTarget | null;
  /** Every extant egret owns one authenticated, dry high-tide refuge. */
  readonly refugeTarget: CoreEcologySnowyEgretTidalTarget;
}

export interface CoreEcologyTidalAggregateActivity {
  readonly aggregateId: string;
  readonly species: CoreEcologyTidalAggregateSpecies;
  /** Target-tick activity derived from live tide, never the prior saved signal. */
  readonly intensity: number;
}

export interface CoreEcologyTidalTableProjection {
  readonly version: typeof CORE_ECOLOGY_TIDAL_TABLE_VERSION;
  readonly ownerId: typeof CORE_ECOLOGY_TIDAL_TABLE_OWNER_ID;
  readonly atTick: number;
  readonly tide: Readonly<{
    readonly phase: number;
    readonly level: number;
    readonly direction: -1 | 1;
  }>;
  readonly anchorDepths: readonly CoreEcologyTidalAnchorDepth[];
  readonly aggregateActivities: readonly CoreEcologyTidalAggregateActivity[];
  readonly snowyEgret: CoreEcologySnowyEgretTidalActivity | null;
}

export interface StepCoreEcologyTidalTableInput {
  /** Must equal the patch clock; no caller-supplied depth or tide is accepted. */
  readonly atTick: number;
}

export interface CoreEcologyTidalTableStepResult {
  readonly version: typeof CORE_ECOLOGY_TIDAL_TABLE_VERSION;
  readonly ownerId: typeof CORE_ECOLOGY_TIDAL_TABLE_OWNER_ID;
  readonly patch: CoreEcologyAggregatePatchState;
  readonly projection: CoreEcologyTidalTableProjection;
  readonly redistributions: readonly CoreEcologyAggregateDisturbance[];
  readonly mortality: "none";
  readonly cargoInteraction: false;
  readonly itemConsumption: "none";
}

/**
 * Projects current local depths from canonical habitat-v5 elevation metadata.
 * Camera, player position, reported knowledge, and caller-authored water values
 * never participate. The same projection drives simulation and presentation.
 */
export function projectCoreEcologyTidalTable(
  patchValue: unknown,
  atTickValue: unknown,
): CoreEcologyTidalTableProjection | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(patchValue);
  if (
    patch === null
    || !isTidalHabitatDerivation(patch)
    || !nonnegativeSafeInteger(atTickValue)
    || atTickValue < patch.updatedAtTick
    || atTickValue - patch.updatedAtTick > CORE_ECOLOGY_MAX_STEP_TICKS
  ) return null;
  const tide = tideAtTick(atTickValue);
  const habitat = patch.derivation.habitat;
  const anchorDepths: CoreEcologyTidalAnchorDepth[] = [];
  for (const species of [
    "atlantic-silverside",
    "atlantic-marsh-fiddler-crab",
  ] as const) {
    const population = patch.aggregatePopulations.find((candidate) => (
      candidate.species === species
    ));
    const metadata = habitat.tidalAnchors.filter((anchor) => (
      anchor.species === species && anchor.purpose === "population"
    ));
    if (population === undefined) {
      if (metadata.length !== 0) return null;
      continue;
    }
    if (metadata.length !== population.anchors.length) return null;
    for (const anchor of population.anchors) {
      const saved = metadata[anchor.anchorOrdinal];
      if (
        saved === undefined
        || saved.anchorOrdinal !== anchor.anchorOrdinal
        || !samePosition(saved.position, anchor.position)
      ) return null;
      const waterDepth = Math.max(0, tide.level - saved.elevation);
      anchorDepths.push(Object.freeze({
        aggregateId: population.aggregateId,
        species,
        anchorOrdinal: anchor.anchorOrdinal,
        position: saved.position,
        elevation: saved.elevation,
        waterDepth,
        activityUsable: species === "atlantic-silverside"
          ? waterDepth >= CORE_ECOLOGY_TIDAL_MINIMUM_FISH_DEPTH
          : waterDepth < CRAB_INUNDATION_REFERENCE,
      }));
    }
  }
  if (anchorDepths.length > CORE_ECOLOGY_TIDAL_TABLE_MAX_DEPTH_RECORDS) return null;
  anchorDepths.sort(compareDepthAddress);
  const aggregateActivities = projectAggregateActivities(
    patch,
    anchorDepths,
    tide.direction,
  );
  if (aggregateActivities === null) return null;
  const snowyEgret = projectSnowyEgretTidalActivity(patch, tide.level);
  if (snowyEgret === undefined) return null;
  return deepFreeze({
    version: CORE_ECOLOGY_TIDAL_TABLE_VERSION,
    ownerId: CORE_ECOLOGY_TIDAL_TABLE_OWNER_ID,
    atTick: atTickValue,
    tide,
    anchorDepths,
    aggregateActivities,
    snowyEgret,
  });
}

/**
 * Applies live tide to stable population identity. Dry fish anchors evacuate
 * immediately; ordinary ebb/flood redistribution remains gradual and bounded.
 * The transaction can move only extant units among saved anchors and cannot
 * create actors, deaths, items, or cargo effects.
 */
export function stepCoreEcologyTidalTable(
  patchValue: unknown,
  inputValue: unknown,
): CoreEcologyTidalTableStepResult | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(patchValue);
  if (
    patch === null
    || !plainRecord(inputValue)
    || !exactKeys(inputValue, ["atTick"])
    || !nonnegativeSafeInteger(inputValue.atTick)
    || inputValue.atTick !== patch.updatedAtTick
  ) return null;
  const projection = projectCoreEcologyTidalTable(patch, inputValue.atTick);
  if (projection === null) return null;
  const tideReference = `tidal-table:v1:${projection.tide.phase.toString(36)}:${
    projection.tide.direction > 0 ? "rising" : "falling"
  }`;
  let nextPatch = patch;
  const redistributions: CoreEcologyAggregateDisturbance[] = [];

  const initialSchool = nextPatch.aggregatePopulations.find(({ species }) => (
    species === "atlantic-silverside"
  ));
  if (initialSchool !== undefined) {
    const schoolDepths = projection.anchorDepths.filter(({ aggregateId }) => (
      aggregateId === initialSchool.aggregateId
    ));
    const refuge = [...schoolDepths]
      .filter(({ activityUsable }) => activityUsable)
      .sort((left, right) => (
        right.waterDepth - left.waterDepth || left.anchorOrdinal - right.anchorOrdinal
      ))[0];
    if (refuge === undefined) return null;
    const drySources = schoolDepths.filter(({ activityUsable, anchorOrdinal }) => (
      !activityUsable
      && (initialSchool.anchors[anchorOrdinal]?.populationUnits ?? 0) > 0
    )).sort((left, right) => left.anchorOrdinal - right.anchorOrdinal);
    for (const source of drySources) {
      const current = nextPatch.aggregatePopulations.find(({ aggregateId }) => (
        aggregateId === initialSchool.aggregateId
      ));
      const units = current?.anchors[source.anchorOrdinal]?.populationUnits ?? 0;
      if (units === 0) continue;
      const displaced = displaceCoreEcologyAggregatePopulation(nextPatch, {
        aggregateId: initialSchool.aggregateId,
        atTick: inputValue.atTick,
        causeKind: "tide-pressure",
        causeReferenceId: `${tideReference}:evacuate-${source.anchorOrdinal.toString(36)}`,
        fromAnchorOrdinal: source.anchorOrdinal,
        toAnchorOrdinal: refuge.anchorOrdinal,
        populationUnits: units,
        pressure: FIXED_POINT,
      });
      if (displaced === null) return null;
      nextPatch = displaced.patch;
      redistributions.push(displaced.disturbance);
    }

    const currentSchool = nextPatch.aggregatePopulations.find(({ aggregateId }) => (
      aggregateId === initialSchool.aggregateId
    ));
    const edgeReference = `${tideReference}:edge`;
    if (
      currentSchool !== undefined
      && inputValue.atTick > 0
      && inputValue.atTick % CORE_ECOLOGY_SILVERSIDE_REDISTRIBUTION_CADENCE_TICKS === 0
      && currentSchool.lastTidalRedistributionTick !== inputValue.atTick
    ) {
      const relocation = silversideRelocation(
        currentSchool,
        schoolDepths,
        projection.tide.direction,
      );
      if (relocation !== null) {
        const displaced = displaceCoreEcologyAggregatePopulation(nextPatch, {
          aggregateId: currentSchool.aggregateId,
          atTick: inputValue.atTick,
          causeKind: "tide-pressure",
          causeReferenceId: edgeReference,
          fromAnchorOrdinal: relocation.fromAnchorOrdinal,
          toAnchorOrdinal: relocation.toAnchorOrdinal,
          populationUnits: 1,
          pressure: relocation.pressure,
        });
        if (displaced === null) return null;
        nextPatch = displaced.patch;
        redistributions.push(displaced.disturbance);
      }
      const marked = markCoreEcologyAggregateTidalRedistribution(nextPatch, {
        aggregateId: currentSchool.aggregateId,
        atTick: inputValue.atTick,
      });
      if (marked === null) return null;
      nextPatch = marked;
    }
  }

  for (const species of [
    "atlantic-silverside",
    "atlantic-marsh-fiddler-crab",
  ] as const) {
    const population = nextPatch.aggregatePopulations.find((candidate) => (
      candidate.species === species
    ));
    if (population === undefined) continue;
    if (
      !isTidalHabitatDerivation(patch)
    ) return null;
    const habitat = patch.derivation.habitat.populations.find((analysis) => (
      analysis.species === species
      && analysis.populationKey === population.populationKey
    ));
    if (habitat === undefined || habitat.populationUnits === 0) return null;
    const depths = projection.anchorDepths.filter(({ aggregateId }) => (
      aggregateId === population.aggregateId
    ));
    const averageDepth = populationWeightedDepth(population, depths);
    if (averageDepth === null) return null;
    const intensity = species === "atlantic-silverside"
      ? depths.some(({ activityUsable, anchorOrdinal }) => (
          activityUsable && (population.anchors[anchorOrdinal]?.populationUnits ?? 0) > 0
        ))
        ? silversideActivity(habitat.activitySignal.intensity, averageDepth, projection.tide.direction)
        : 0
      : fiddlerActivity(habitat.activitySignal.intensity, averageDepth, projection.tide.direction);
    const updated = setCoreEcologyAggregateActivityIntensity(nextPatch, {
      aggregateId: population.aggregateId,
      atTick: inputValue.atTick,
      intensity,
    });
    if (updated === null) return null;
    nextPatch = updated;
  }

  // The step result is an atomic view of the state it returns. Redistribution
  // can change the population-weighted depth used by activity, so the initial
  // projection is only suitable for making this tick's decisions. Reproject
  // the committed patch before exposing it to runtime or presentation.
  const committedProjection = projectCoreEcologyTidalTable(
    nextPatch,
    inputValue.atTick,
  );
  if (committedProjection === null) return null;

  return Object.freeze({
    version: CORE_ECOLOGY_TIDAL_TABLE_VERSION,
    ownerId: CORE_ECOLOGY_TIDAL_TABLE_OWNER_ID,
    patch: nextPatch,
    projection: committedProjection,
    redistributions: Object.freeze(redistributions),
    mortality: "none",
    cargoInteraction: false,
    itemConsumption: "none",
  });
}

function projectSnowyEgretTidalActivity(
  patch: CoreEcologyAggregatePatchState,
  tideLevel: number,
): CoreEcologySnowyEgretTidalActivity | null | undefined {
  if (
    !isTidalHabitatDerivation(patch)
  ) return undefined;
  const population = patch.populations.find(({ species }) => species === "snowy-egret");
  const habitatPopulation = patch.derivation.habitat.populations.find(({ species }) => (
    species === "snowy-egret"
  ));
  const anchors = patch.derivation.habitat.tidalAnchors.filter(({ species }) => (
    species === "snowy-egret"
  ));
  if (population === undefined) {
    return habitatPopulation?.populationUnits === 0 && anchors.length === 0 ? null : undefined;
  }
  const actor = population.members[0]?.actor;
  if (
    habitatPopulation === undefined
    || habitatPopulation.populationUnits !== 1
    || population.populationSize !== 1
    || population.members.length !== 1
    || actor === undefined
  ) return undefined;
  const wadingTargets = anchors
    .filter((anchor) => anchor.purpose === "wading")
    .map((anchor) => ({ anchor, waterDepth: Math.max(0, tideLevel - anchor.elevation) }))
    .filter(({ waterDepth }) => (
      waterDepth >= CORE_ECOLOGY_SNOWY_EGRET_MINIMUM_WADING_DEPTH
      && waterDepth <= CORE_ECOLOGY_SNOWY_EGRET_MAXIMUM_WADING_DEPTH
    ))
    .sort((left, right) => (
      Math.abs(left.waterDepth - EGRET_PREFERRED_WADING_DEPTH)
        - Math.abs(right.waterDepth - EGRET_PREFERRED_WADING_DEPTH)
      || left.anchor.anchorOrdinal - right.anchor.anchorOrdinal
    ))
    .map(({ anchor, waterDepth }) => Object.freeze({
      purpose: "wading" as const,
      targetAnchorOrdinal: anchor.anchorOrdinal,
      targetPosition: anchor.position,
      waterDepth,
    }));
  const refuge = anchors.find((anchor) => anchor.purpose === "refuge");
  if (refuge === undefined) return undefined;
  const refugeDepth = Math.max(0, tideLevel - refuge.elevation);
  if (refugeDepth !== 0) return undefined;
  return Object.freeze({
    actorId: actor.identity.stableId,
    wadingTargets: Object.freeze(wadingTargets),
    wadingTarget: wadingTargets[0] ?? null,
    refugeTarget: Object.freeze({
      purpose: "refuge" as const,
      targetAnchorOrdinal: refuge.anchorOrdinal,
      targetPosition: refuge.position,
      waterDepth: 0,
    }),
  });
}

function projectAggregateActivities(
  patch: CoreEcologyAggregatePatchState,
  depths: readonly CoreEcologyTidalAnchorDepth[],
  tideDirection: -1 | 1,
): readonly CoreEcologyTidalAggregateActivity[] | null {
  if (
    !isTidalHabitatDerivation(patch)
  ) return null;
  const activities: CoreEcologyTidalAggregateActivity[] = [];
  for (const species of [
    "atlantic-silverside",
    "atlantic-marsh-fiddler-crab",
  ] as const) {
    const population = patch.aggregatePopulations.find((candidate) => (
      candidate.species === species
    ));
    if (population === undefined) continue;
    const habitat = patch.derivation.habitat.populations.find((analysis) => (
      analysis.species === species
      && analysis.populationKey === population.populationKey
    ));
    if (habitat === undefined || habitat.populationUnits === 0) return null;
    const populationDepths = depths.filter(({ aggregateId }) => (
      aggregateId === population.aggregateId
    ));
    const averageDepth = populationWeightedDepth(population, populationDepths);
    if (averageDepth === null) return null;
    const intensity = species === "atlantic-silverside"
      ? populationDepths.some(({ activityUsable, anchorOrdinal }) => (
          activityUsable && (population.anchors[anchorOrdinal]?.populationUnits ?? 0) > 0
        ))
        ? silversideActivity(habitat.activitySignal.intensity, averageDepth, tideDirection)
        : 0
      : fiddlerActivity(habitat.activitySignal.intensity, averageDepth, tideDirection);
    activities.push(Object.freeze({
      aggregateId: population.aggregateId,
      species,
      intensity,
    }));
  }
  activities.sort((left, right) => compareText(left.aggregateId, right.aggregateId));
  return Object.freeze(activities);
}

function silversideRelocation(
  population: CoreEcologyAggregatePopulationState,
  depths: readonly CoreEcologyTidalAnchorDepth[],
  tideDirection: -1 | 1,
): Readonly<{
  fromAnchorOrdinal: number;
  toAnchorOrdinal: number;
  pressure: number;
}> | null {
  const usable = depths.filter(({ aggregateId, activityUsable }) => (
    aggregateId === population.aggregateId && activityUsable
  )).sort((left, right) => (
    left.waterDepth - right.waterDepth || left.anchorOrdinal - right.anchorOrdinal
  ));
  if (usable.length < 2) return null;
  const destination = tideDirection > 0 ? usable[0] : usable.at(-1);
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
    pressure: Math.max(
      1,
      Math.min(FIXED_POINT, 150_000 + Math.abs(source.waterDepth - destination.waterDepth) * 4),
    ),
  });
}

function populationWeightedDepth(
  population: CoreEcologyAggregatePopulationState,
  depths: readonly CoreEcologyTidalAnchorDepth[],
): number | null {
  let weighted = 0;
  let units = 0;
  for (const depth of depths) {
    const populationUnits = population.anchors[depth.anchorOrdinal]?.populationUnits;
    if (populationUnits === undefined) return null;
    weighted += depth.waterDepth * populationUnits;
    units += populationUnits;
  }
  return units === population.populationSize && units > 0
    ? Math.trunc(weighted / units)
    : null;
}

function silversideActivity(
  habitatIntensity: number,
  averageDepth: number,
  tideDirection: -1 | 1,
): number {
  const depthSupport = ratioFixed(averageDepth, SCHOOL_DEPTH_REFERENCE);
  const directionalSupport = tideDirection > 0 ? 920_000 : 680_000;
  const tidalSupport = Math.min(
    FIXED_POINT,
    180_000
      + multiplyFixed(depthSupport, 560_000)
      + multiplyFixed(directionalSupport, 260_000),
  );
  return Math.max(1, multiplyFixed(habitatIntensity, tidalSupport));
}

function fiddlerActivity(
  habitatIntensity: number,
  averageDepth: number,
  tideDirection: -1 | 1,
): number {
  if (averageDepth >= CRAB_INUNDATION_REFERENCE) return 0;
  const inundation = ratioFixed(averageDepth, CRAB_INUNDATION_REFERENCE);
  const exposure = FIXED_POINT - inundation;
  const ebbSupport = tideDirection < 0 ? FIXED_POINT : 520_000;
  const tidalSupport = Math.min(
    FIXED_POINT,
    120_000
      + multiplyFixed(exposure, 700_000)
      + multiplyFixed(ebbSupport, 180_000),
  );
  return Math.max(1, multiplyFixed(habitatIntensity, tidalSupport));
}

function compareDepthAddress(
  left: Pick<CoreEcologyTidalAnchorDepth, "aggregateId" | "anchorOrdinal">,
  right: Pick<CoreEcologyTidalAnchorDepth, "aggregateId" | "anchorOrdinal">,
): number {
  return left.aggregateId < right.aggregateId
    ? -1
    : left.aggregateId > right.aggregateId
      ? 1
      : left.anchorOrdinal - right.anchorOrdinal;
}

function isTidalHabitatDerivation(
  patch: CoreEcologyAggregatePatchState,
): patch is CoreEcologyAggregatePatchState & Readonly<{
  derivation: Extract<
    CoreEcologyAggregatePatchState["derivation"],
    { readonly kind:
      | "habitat-v5"
      | "legacy-fixed-v1-with-habitat-v5"
      | "habitat-v6"
      | "legacy-fixed-v1-with-habitat-v6"
      | "habitat-v7"
      | "legacy-fixed-v1-with-habitat-v7"
      | "habitat-v8"
      | "legacy-fixed-v1-with-habitat-v8"
      | "habitat-v9"
      | "legacy-fixed-v1-with-habitat-v9"
      | "habitat-v10"
      | "legacy-fixed-v1-with-habitat-v10"
      | "habitat-v11"
      | "legacy-fixed-v1-with-habitat-v11" }
  >;
}> {
  return patch.derivation.kind === "habitat-v5"
    || patch.derivation.kind === "legacy-fixed-v1-with-habitat-v5"
    || patch.derivation.kind === "habitat-v6"
    || patch.derivation.kind === "legacy-fixed-v1-with-habitat-v6"
    || patch.derivation.kind === "habitat-v7"
    || patch.derivation.kind === "legacy-fixed-v1-with-habitat-v7"
    || patch.derivation.kind === "habitat-v8"
    || patch.derivation.kind === "legacy-fixed-v1-with-habitat-v8"
    || patch.derivation.kind === "habitat-v9"
    || patch.derivation.kind === "legacy-fixed-v1-with-habitat-v9"
    || patch.derivation.kind === "habitat-v10"
    || patch.derivation.kind === "legacy-fixed-v1-with-habitat-v10"
    || patch.derivation.kind === "habitat-v11"
    || patch.derivation.kind === "legacy-fixed-v1-with-habitat-v11";
}

function samePosition(left: WorldPosition, right: WorldPosition): boolean {
  return left.region.x === right.region.x
    && left.region.y === right.region.y
    && left.localX === right.localX
    && left.localY === right.localY;
}

function ratioFixed(value: number, reference: number): number {
  if (value <= 0) return 0;
  if (value >= reference) return FIXED_POINT;
  return Math.trunc(value * FIXED_POINT / reference);
}

function multiplyFixed(left: number, right: number): number {
  return Math.trunc((left * right + Math.trunc(FIXED_POINT / 2)) / FIXED_POINT);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

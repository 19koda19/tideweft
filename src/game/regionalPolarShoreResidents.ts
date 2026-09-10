import { tideAtTick } from "../sim/terrain";
import type { RootSeed } from "../sim/rng";
import {
  createRegionCoord,
  isRegionCoord,
  type RegionCoord,
} from "../sim/regions";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS,
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  stableCoreEcologyAggregatePopulationId,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import {
  CORE_ECOLOGY_POLAR_SHORE_DERIVATION_KIND,
  canonicalCoreEcologyPolarShoreHabitatForWorld,
  deriveCoreEcologyPolarShoreHabitat,
  deriveCoreEcologyPolarShoreTerritory,
  type CoreEcologyPolarShoreHabitat,
} from "./coreEcologyPolarShoreHabitat";
import {
  coreEcologyPatchHasTidalTableAuthority,
  projectCoreEcologyTidalTable,
  stepCoreEcologyTidalTable,
} from "./coreEcologyTidalTable";
import { advanceCoreEcologyDormantAggregateAutonomy } from "./coreEcologyDormantAggregateAutonomy";

export const CORE_ECOLOGY_POLAR_SHORE_RESIDENT_SET_VERSION = 1 as const;
export const CORE_ECOLOGY_POLAR_SHORE_RESIDENT_SET_OWNER_ID =
  "game:regional-polar-shore-residents:v1" as const;

export interface CreateCoreEcologyPolarShoreResidentPatchInput {
  readonly seed: RootSeed;
  readonly habitat: CoreEcologyPolarShoreHabitat;
  readonly tick?: number;
}

export interface CanonicalCoreEcologyPolarShoreResidentBinding {
  readonly seed: RootSeed;
  readonly region: RegionCoord;
  readonly completedTick: number;
}

export interface CoreEcologyPolarShoreResidentSource {
  readonly sourceKey: string;
  readonly region: RegionCoord;
  readonly habitat: CoreEcologyPolarShoreHabitat;
  readonly patch: CoreEcologyAggregatePatchState;
}

export interface CoreEcologyPolarShoreResidentSet {
  readonly version: typeof CORE_ECOLOGY_POLAR_SHORE_RESIDENT_SET_VERSION;
  readonly ownerId: typeof CORE_ECOLOGY_POLAR_SHORE_RESIDENT_SET_OWNER_ID;
  readonly updatedAtTick: number;
  readonly residents: readonly CoreEcologyPolarShoreResidentSource[];
  readonly derivationHash: string;
}

export interface DeriveCoreEcologyPolarShoreResidentSetInput {
  readonly seed: RootSeed;
  readonly regions: readonly RegionCoord[];
  readonly tick?: number;
}

/**
 * Converts one authenticated baseline into the shared aggregate patch at the
 * canonical world epoch, then advances the same tide+density autonomy used by
 * a continuously resident school. Observation time therefore cannot rewrite
 * initial evidence timestamps or invent a durable save deviation.
 */
export function createCoreEcologyPolarShoreResidentPatch(
  input: CreateCoreEcologyPolarShoreResidentPatchInput,
): CoreEcologyAggregatePatchState {
  if (
    !plainRecord(input) ||
    !rootSeed(input.seed) ||
    !plainRecord(input.habitat)
  ) {
    throw new TypeError("Polar-shore resident patch input is malformed");
  }
  const habitat = canonicalCoreEcologyPolarShoreHabitatForWorld(
    input.habitat,
    input.seed,
    input.habitat.region,
  );
  if (habitat === null)
    throw new RangeError("Polar-shore habitat belongs to another world");
  const tick = input.tick ?? 0;
  requireTick(tick);
  const epochPatch = createCoreEcologyAggregatePatch({
    seed: input.seed,
    patchKey: coreEcologyPolarShoreResidentSourceKey(habitat),
    originRegion: habitat.region,
    tick: 0,
    derivation: {
      kind: CORE_ECOLOGY_POLAR_SHORE_DERIVATION_KIND,
      habitat,
    },
    populations: [],
  });
  if (!coreEcologyPatchHasTidalTableAuthority(epochPatch)) {
    throw new Error(
      "Shared tidal-table owner does not recognize the polar-shore derivation",
    );
  }
  if (projectCoreEcologyTidalTable(epochPatch, 0) === null) {
    throw new Error(
      "Shared tidal-table cannot project the polar-shore baseline",
    );
  }
  const reconciled = stepCoreEcologyTidalTable(epochPatch, { atTick: 0 });
  if (reconciled === null)
    throw new Error("Shared tidal-table rejected polar-shore baseline");
  if (tick === 0) return reconciled.patch;
  const advanced = advanceCoreEcologyDormantAggregateAutonomy(
    reconciled.patch,
    { atTick: tick },
  );
  if (advanced === null) {
    throw new Error("Shared aggregate autonomy rejected polar-shore baseline");
  }
  return advanced;
}

/**
 * Replays the shared policy cadence and exact anchor-safety transitions rather
 * than projecting only the final tide. The shared owner may compact a proven
 * periodic history, so elapsed dormant time cannot change the result or make
 * re-entry proportional to the raw tick gap.
 */
export function reconcileCoreEcologyPolarShoreResidentPatchAtTick(
  value: unknown,
  atTick: number,
): CoreEcologyAggregatePatchState | null {
  let patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    patch === null ||
    !nonnegativeSafeInteger(atTick) ||
    atTick < patch.updatedAtTick ||
    !isPolarDerivation(patch)
  )
    return null;
  if (!coreEcologyPatchHasTidalTableAuthority(patch)) return null;
  return advanceCoreEcologyDormantAggregateAutonomy(patch, { atTick });
}

export function canonicalCoreEcologyPolarShoreResidentPatch(
  value: unknown,
  binding: CanonicalCoreEcologyPolarShoreResidentBinding,
): CoreEcologyAggregatePatchState | null {
  if (
    !plainRecord(binding) ||
    !rootSeed(binding.seed) ||
    !isRegionCoord(binding.region) ||
    !nonnegativeSafeInteger(binding.completedTick)
  )
    return null;
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    patch === null ||
    stableStringify(patch) !== stableStringify(value) ||
    patch.updatedAtTick !== binding.completedTick ||
    patch.originRegion.x !== binding.region.x ||
    patch.originRegion.y !== binding.region.y ||
    !isPolarDerivation(patch)
  )
    return null;
  const habitat = canonicalCoreEcologyPolarShoreHabitatForWorld(
    patch.derivation.habitat,
    binding.seed,
    binding.region,
  );
  if (
    habitat === null ||
    patch.patchKey !== coreEcologyPolarShoreResidentSourceKey(habitat) ||
    patch.populations.length !== 0 ||
    patch.groups.groups.length !== 0 ||
    patch.nextMortalityOrdinal !== 0 ||
    patch.mortalityTransactions.length !== 0 ||
    patch.carcasses.length !== 0 ||
    patch.aggregatePopulations.length > CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS
  )
    return null;
  const candidate = habitat.populations[0];
  const expectedCount = candidate.populationUnits > 0 ? 1 : 0;
  if (patch.aggregatePopulations.length !== expectedCount) return null;
  if (expectedCount === 0) {
    return projectCoreEcologyTidalTable(patch, binding.completedTick) === null
      ? null
      : patch;
  }
  const aggregate = patch.aggregatePopulations[0];
  if (
    aggregate === undefined ||
    aggregate.species !== "atlantic-capelin" ||
    aggregate.populationKey !== candidate.populationKey ||
    aggregate.populationSize !== candidate.populationUnits ||
    aggregate.habitatCapacity !== candidate.habitatCapacity ||
    aggregate.aggregateId !==
      stableCoreEcologyAggregatePopulationId({
        seed: binding.seed,
        originRegion: binding.region,
        populationKey: candidate.populationKey,
        species: "atlantic-capelin",
      }) ||
    aggregate.anchors.length !== candidate.anchors.length ||
    aggregate.anchors.reduce(
      (sum, anchor) => sum + anchor.populationUnits,
      0,
    ) !== candidate.populationUnits
  )
    return null;
  for (const anchor of aggregate.anchors) {
    const saved = habitat.tidalAnchors[anchor.anchorOrdinal];
    if (
      saved === undefined ||
      anchor.position.region.x !== binding.region.x ||
      anchor.position.region.y !== binding.region.y ||
      stableStringify(anchor.position) !== stableStringify(saved.position)
    )
      return null;
  }
  const projection = projectCoreEcologyTidalTable(patch, binding.completedTick);
  if (
    projection === null ||
    projection.tide.level !== tideAtTick(binding.completedTick).level
  ) {
    return null;
  }
  const depths = projection.anchorDepths.filter(
    ({ aggregateId }) => aggregateId === aggregate.aggregateId,
  );
  if (
    depths.length !== aggregate.anchors.length ||
    depths.some(
      ({ anchorOrdinal, activityUsable }) =>
        (aggregate.anchors[anchorOrdinal]?.populationUnits ?? 0) > 0 &&
        !activityUsable,
    )
  )
    return null;
  return patch;
}

export function coreEcologyPolarShoreResidentPatchResidenceRegions(
  value: unknown,
): readonly RegionCoord[] | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (patch === null || !isPolarDerivation(patch)) return null;
  const regions: RegionCoord[] = [];
  for (const population of patch.aggregatePopulations) {
    for (const anchor of population.anchors)
      regions.push(anchor.position.region);
  }
  return canonicalRegions(regions);
}

export function deriveCoreEcologyPolarShoreResidentSet(
  input: DeriveCoreEcologyPolarShoreResidentSetInput,
): CoreEcologyPolarShoreResidentSet {
  if (
    !plainRecord(input) ||
    !rootSeed(input.seed) ||
    !Array.isArray(input.regions)
  ) {
    throw new TypeError("Polar-shore resident-set input is malformed");
  }
  const tick = input.tick ?? 0;
  requireTick(tick);
  const residents = canonicalRegions(input.regions)
    .flatMap((region): CoreEcologyPolarShoreResidentSource[] => {
      if (
        !deriveCoreEcologyPolarShoreTerritory(input.seed, region).regionIsHost
      ) {
        return [];
      }
      const habitat = deriveCoreEcologyPolarShoreHabitat({
        seed: input.seed,
        region,
      });
      if (habitat.totalPopulationUnits === 0) return [];
      const patch = createCoreEcologyPolarShoreResidentPatch({
        seed: input.seed,
        habitat,
        tick,
      });
      return [
        deepFreeze({ sourceKey: patch.patchKey, region, habitat, patch }),
      ];
    })
    .sort((left, right) => compareText(left.sourceKey, right.sourceKey));
  const base = {
    version: CORE_ECOLOGY_POLAR_SHORE_RESIDENT_SET_VERSION,
    ownerId: CORE_ECOLOGY_POLAR_SHORE_RESIDENT_SET_OWNER_ID,
    updatedAtTick: tick,
    residents: Object.freeze(residents),
  } as const;
  return deepFreeze({ ...base, derivationHash: hashCanonical(base) });
}

export function coreEcologyPolarShoreResidentSourceKey(
  habitat: Pick<CoreEcologyPolarShoreHabitat, "sourceStableId">,
): string {
  if (!plainRecord(habitat) || typeof habitat.sourceStableId !== "string") {
    throw new TypeError(
      "Polar-shore resident source requires a stable habitat source",
    );
  }
  return `${CORE_ECOLOGY_POLAR_SHORE_DERIVATION_KIND}:${hashCanonical({
    ownerId: CORE_ECOLOGY_POLAR_SHORE_RESIDENT_SET_OWNER_ID,
    sourceStableId: habitat.sourceStableId,
  })}`;
}

function isPolarDerivation(
  patch: CoreEcologyAggregatePatchState,
): patch is CoreEcologyAggregatePatchState &
  Readonly<{
    readonly derivation: Readonly<{
      readonly kind: typeof CORE_ECOLOGY_POLAR_SHORE_DERIVATION_KIND;
      readonly habitat: CoreEcologyPolarShoreHabitat;
    }>;
  }> {
  return patch.derivation.kind === CORE_ECOLOGY_POLAR_SHORE_DERIVATION_KIND;
}

function canonicalRegions(
  value: readonly RegionCoord[],
): readonly RegionCoord[] {
  const byKey = new Map<string, RegionCoord>();
  for (const region of value) {
    if (!isRegionCoord(region))
      throw new RangeError("Polar-shore resident region is malformed");
    const canonical = createRegionCoord(region.x, region.y);
    byKey.set(`${canonical.x}:${canonical.y}`, canonical);
  }
  return Object.freeze(
    [...byKey.values()].sort(
      (left, right) => left.x - right.x || left.y - right.y,
    ),
  );
}

function rootSeed(value: unknown): value is RootSeed {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every(
      (word) =>
        Number.isSafeInteger(word) &&
        word >= 0 &&
        word <= 0xffff_ffff &&
        !Object.is(word, -0),
    )
  );
}

function requireTick(value: unknown): asserts value is number {
  if (!nonnegativeSafeInteger(value) || value > Number.MAX_SAFE_INTEGER - 64) {
    throw new RangeError(
      "Polar-shore resident tick is outside the schedulable range",
    );
  }
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    !Object.is(value, -0)
  );
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

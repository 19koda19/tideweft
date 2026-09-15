import { generateCoreWildlifeIdentity } from "../sim/coreWildlifeIdentity";
import type { RootSeed } from "../sim/rng";
import {
  createRegionCoord,
  isRegionCoord,
  regionKey,
  type RegionCoord,
} from "../sim/regions";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS,
  CORE_ECOLOGY_MAX_MEMBERS,
  CORE_ECOLOGY_MAX_POPULATIONS,
  CORE_ECOLOGY_MAX_STEP_TICKS,
  advanceCoreEcologyDormantAggregatePatch,
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  stableCoreEcologyAggregatePopulationId,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import { advanceCoreEcologyDormantAggregateAutonomy } from "./coreEcologyDormantAggregateAutonomy";
import {
  createCoreEcologyGroup,
  createCoreEcologyGroupSet,
} from "./coreEcologyGroups";
import {
  CORE_ECOLOGY_BREADTH_DERIVATION_KIND,
  CORE_ECOLOGY_BREADTH_CURRENT_EPOCH,
  canonicalCoreEcologyBreadthHabitatForWorld,
  coreEcologyBreadthCohortsThroughEpoch,
  deriveCoreEcologyBreadthHabitat,
  type CoreEcologyBreadthHabitat,
  type CoreEcologyBreadthPopulationCandidate,
} from "./coreEcologyBreadthHabitat";
import {
  coreEcologyPatchHasTidalTableAuthority,
  projectCoreEcologyTidalTable,
  stepCoreEcologyTidalTable,
} from "./coreEcologyTidalTable";

export const REGIONAL_BREADTH_COHORT_VERSION = 1 as const;
export const REGIONAL_BREADTH_COHORT_OWNER_ID =
  "game:regional-breadth-cohort:v1" as const;
export const REGIONAL_BREADTH_COHORT_MAX_ACTIVE_REGIONS = 9 as const;

export interface CreateCoreEcologyBreadthResidentPatchInput {
  readonly seed: RootSeed;
  readonly habitat: CoreEcologyBreadthHabitat;
  readonly tick?: number;
  /**
   * First authoritative tick at which this append-only cohort existed.
   * Omitted legacy callers retain the released tick-zero baseline exactly.
   */
  readonly baselineTick?: number;
}

export interface CanonicalCoreEcologyBreadthResidentBinding {
  readonly seed: RootSeed;
  readonly region: RegionCoord;
  readonly completedTick: number;
}

export interface CoreEcologyBreadthResidentSource {
  readonly cohortId: CoreEcologyBreadthHabitat["cohortId"];
  readonly cohortEpoch: number;
  readonly sourceKey: string;
  readonly region: RegionCoord;
  readonly habitat: CoreEcologyBreadthHabitat;
  readonly patch: CoreEcologyAggregatePatchState;
}

export interface CoreEcologyBreadthResidentSet {
  readonly version: typeof REGIONAL_BREADTH_COHORT_VERSION;
  readonly ownerId: typeof REGIONAL_BREADTH_COHORT_OWNER_ID;
  readonly activeThroughEpoch: number;
  readonly updatedAtTick: number;
  readonly residents: readonly CoreEcologyBreadthResidentSource[];
  readonly derivationHash: string;
}

export interface DeriveCoreEcologyBreadthResidentSetInput {
  readonly seed: RootSeed;
  readonly regions: readonly RegionCoord[];
  readonly tick?: number;
  readonly activeThroughEpoch?: number;
}

/**
 * Generic cohort adapter. New Wave-G batches append one habitat declaration;
 * this function materializes them without a cohort-specific constructor.
 */
export function createCoreEcologyBreadthResidentPatch(
  input: CreateCoreEcologyBreadthResidentPatchInput,
): CoreEcologyAggregatePatchState {
  if (!plainRecord(input) || !rootSeed(input.seed) || !plainRecord(input.habitat)) {
    throw new TypeError("Breadth resident input is malformed");
  }
  const habitat = canonicalCoreEcologyBreadthHabitatForWorld(
    input.habitat,
    input.seed,
    input.habitat.region,
  );
  if (habitat === null) {
    throw new RangeError("Breadth resident habitat belongs to another world");
  }
  const tick = input.tick ?? 0;
  const baselineTick = input.baselineTick ?? 0;
  requireTick(tick);
  requireTick(baselineTick);
  if (baselineTick > tick) {
    throw new RangeError("Breadth cohort baseline cannot begin after its current tick");
  }
  const populations = habitat.populations.flatMap(individualPopulation);
  const aggregateCount = habitat.populations.filter(
    ({ actorRepresentation, populationUnits }) => (
      actorRepresentation === "aggregate" && populationUnits > 0
    ),
  ).length;
  const memberCount = populations.reduce(
    (sum, population) => sum + population.members.length,
    0,
  );
  if (
    populations.length > CORE_ECOLOGY_MAX_POPULATIONS
    || aggregateCount > CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS
    || memberCount > CORE_ECOLOGY_MAX_MEMBERS
  ) throw new RangeError("Breadth cohort exceeds the shared ecology patch budget");

  const groups = createCoreEcologyGroupSet(populations.flatMap((population) => {
    const candidate = habitat.populations.find(
      ({ species, populationKey }) => (
        species === population.species && populationKey === population.populationKey
      ),
    );
    if (
      candidate?.groupOrganization !== "flock"
      || population.members.length < 2
    ) return [];
    return [createCoreEcologyGroup({
      seed: input.seed,
      species: population.species,
      originRegion: habitat.region,
      populationKey: population.populationKey,
      groupOrdinal: 0,
      memberOrdinals: population.members.map(({ populationOrdinal }) => populationOrdinal),
      anchor: candidate.anchors[0]!.position,
      tick: baselineTick,
    })];
  }));

  const derivation = {
    kind: CORE_ECOLOGY_BREADTH_DERIVATION_KIND,
    habitat,
  } as const;
  const epochPatch = createCoreEcologyAggregatePatch({
    seed: input.seed,
    patchKey: coreEcologyBreadthResidentSourceKey(habitat),
    originRegion: habitat.region,
    tick: baselineTick,
    derivation,
    groups,
    populations,
  });
  const ownsTidalTable = coreEcologyPatchHasTidalTableAuthority(epochPatch);
  const reconciled = ownsTidalTable
    ? stepCoreEcologyTidalTable(epochPatch, { atTick: baselineTick })?.patch ?? null
    : epochPatch;
  if (
    reconciled === null
    || (ownsTidalTable
      && projectCoreEcologyTidalTable(epochPatch, baselineTick) === null)
  ) {
    throw new Error("Shared tidal-table rejected the breadth epoch baseline");
  }
  if (tick === baselineTick) return reconciled;
  const advanced = ownsTidalTable
    ? advanceCoreEcologyDormantAggregateAutonomy(reconciled, { atTick: tick })
    : advanceCoreEcologyDormantAggregatePatch(reconciled, { atTick: tick });
  if (advanced === null) {
    throw new Error("Shared aggregate autonomy rejected the breadth baseline");
  }
  return advanced;
}

/**
 * World-bound lineage validator. Movement, condition, cognition, grouping,
 * and bounded evidence may evolve; population units, identities, and the
 * no-mortality boundary may not.
 */
export function canonicalCoreEcologyBreadthResidentPatch(
  value: unknown,
  binding: CanonicalCoreEcologyBreadthResidentBinding,
): CoreEcologyAggregatePatchState | null {
  if (
    !plainRecord(binding)
    || !rootSeed(binding.seed)
    || !isRegionCoord(binding.region)
    || !nonnegativeSafeInteger(binding.completedTick)
  ) return null;
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  const derivation = patch?.derivation;
  if (
    patch === null
    || stableStringify(patch) !== stableStringify(value)
    || patch.updatedAtTick !== binding.completedTick
    || patch.originRegion.x !== binding.region.x
    || patch.originRegion.y !== binding.region.y
    || derivation?.kind !== CORE_ECOLOGY_BREADTH_DERIVATION_KIND
  ) return null;
  const habitat = canonicalCoreEcologyBreadthHabitatForWorld(
    derivation.habitat,
    binding.seed,
    binding.region,
  );
  if (
    habitat === null
    || patch.patchKey !== coreEcologyBreadthResidentSourceKey(habitat)
    || patch.nextMortalityOrdinal !== 0
    || patch.mortalityTransactions.length !== 0
    || patch.carcasses.length !== 0
  ) return null;

  const expectedIndividuals = habitat.populations.filter(
    ({ actorRepresentation, populationUnits }) => (
      actorRepresentation === "individual" && populationUnits > 0
    ),
  );
  if (patch.populations.length !== expectedIndividuals.length) return null;
  for (const expected of expectedIndividuals) {
    const population = patch.populations.find(
      ({ populationKey }) => populationKey === expected.populationKey,
    );
    if (
      population === undefined
      || population.species !== expected.species
      || population.baselinePopulationSize !== expected.populationUnits
      || population.populationSize !== expected.populationUnits
      || population.reserveUnits !== 0
      || population.members.length !== expected.populationUnits
    ) return null;
    const ordinals = new Set<number>();
    for (const member of population.members) {
      if (
        member.populationOrdinal < 0
        || member.populationOrdinal >= expected.populationUnits
        || member.representedUnits !== 1
        || ordinals.has(member.populationOrdinal)
      ) return null;
      const identity = generateCoreWildlifeIdentity({
        seed: binding.seed,
        species: expected.species,
        originRegion: binding.region,
        populationKey: expected.populationKey,
        populationOrdinal: member.populationOrdinal,
      });
      if (stableStringify(member.actor.identity) !== stableStringify(identity)) return null;
      ordinals.add(member.populationOrdinal);
    }
  }

  const expectedAggregates = habitat.populations.filter(
    ({ actorRepresentation, populationUnits }) => (
      actorRepresentation === "aggregate" && populationUnits > 0
    ),
  );
  if (patch.aggregatePopulations.length !== expectedAggregates.length) return null;
  for (const expected of expectedAggregates) {
    const aggregate = patch.aggregatePopulations.find(
      ({ populationKey }) => populationKey === expected.populationKey,
    );
    if (
      aggregate === undefined
      || aggregate.species !== expected.species
      || aggregate.aggregateId !== stableCoreEcologyAggregatePopulationId({
        seed: binding.seed,
        originRegion: binding.region,
        populationKey: expected.populationKey,
        species: expected.species,
      })
      || aggregate.habitatCapacity !== expected.habitatCapacity
      || aggregate.populationSize !== expected.populationUnits
      || aggregate.anchors.reduce(
        (sum, anchor) => sum + anchor.populationUnits,
        0,
      ) !== expected.populationUnits
    ) return null;
  }

  const expectedGroups = expectedIndividuals.filter(
    ({ groupOrganization }) => groupOrganization === "flock",
  );
  if (patch.groups.groups.length !== expectedGroups.length) return null;
  for (const expected of expectedGroups) {
    const group = patch.groups.groups.find(
      ({ identity }) => identity.populationKey === expected.populationKey,
    );
    if (group === undefined || expected.anchors[0] === undefined) return null;
    const authoritative = createCoreEcologyGroup({
      seed: binding.seed,
      species: expected.species,
      originRegion: binding.region,
      populationKey: expected.populationKey,
      groupOrdinal: 0,
      memberOrdinals: Array.from(
        { length: expected.populationUnits },
        (_, ordinal) => ordinal,
      ),
      anchor: expected.anchors[0].position,
      tick: 0,
    });
    if (stableStringify({
      identity: group.identity,
      memberOrdinals: group.memberOrdinals,
    }) !== stableStringify({
      identity: authoritative.identity,
      memberOrdinals: authoritative.memberOrdinals,
    })) return null;
  }
  return patch;
}

export function coreEcologyBreadthResidentPatchIsAllCoarse(
  value: unknown,
): boolean {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  return patch !== null && patch.populations.every(({ members }) => (
    members.every(({ materialization }) => materialization === "coarse")
  ));
}

export function reconcileCoreEcologyBreadthResidentPatchAtTick(
  value: unknown,
  atTick: number,
): CoreEcologyAggregatePatchState | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  const derivation = patch?.derivation;
  if (
    patch === null
    || derivation?.kind !== CORE_ECOLOGY_BREADTH_DERIVATION_KIND
    || !nonnegativeSafeInteger(atTick)
    || atTick < patch.updatedAtTick
    || atTick > Number.MAX_SAFE_INTEGER - CORE_ECOLOGY_MAX_STEP_TICKS
    || !coreEcologyBreadthResidentPatchIsAllCoarse(patch)
  ) return null;
  return coreEcologyPatchHasTidalTableAuthority(patch)
    ? advanceCoreEcologyDormantAggregateAutonomy(patch, { atTick })
    : advanceCoreEcologyDormantAggregatePatch(patch, { atTick });
}

/** Physical residence index; origin identity ownership never teleports. */
export function coreEcologyBreadthResidentPatchResidenceRegions(
  value: unknown,
): readonly RegionCoord[] | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  const derivation = patch?.derivation;
  if (patch === null || derivation?.kind !== CORE_ECOLOGY_BREADTH_DERIVATION_KIND) {
    return null;
  }
  const regions = new Map<string, RegionCoord>();
  const add = (region: RegionCoord): void => {
    regions.set(regionKey(region), createRegionCoord(region.x, region.y));
  };
  for (const population of patch.populations) {
    for (const member of population.members) add(member.actor.address.position.region);
  }
  for (const population of patch.aggregatePopulations) {
    for (const anchor of population.anchors) add(anchor.position.region);
  }
  for (const group of patch.groups.groups) {
    add(group.rendezvousAnchor.region);
    for (const component of group.components) add(component.anchor.region);
  }
  return Object.freeze([...regions.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([, region]) => region));
}

export function deriveCoreEcologyBreadthResidentSet(
  input: DeriveCoreEcologyBreadthResidentSetInput,
): CoreEcologyBreadthResidentSet {
  if (
    !plainRecord(input)
    || !rootSeed(input.seed)
    || !Array.isArray(input.regions)
    || input.regions.length > REGIONAL_BREADTH_COHORT_MAX_ACTIVE_REGIONS
  ) throw new RangeError("Breadth resident-set input is malformed or unbounded");
  const tick = input.tick ?? 0;
  const activeThroughEpoch = input.activeThroughEpoch
    ?? CORE_ECOLOGY_BREADTH_CURRENT_EPOCH;
  requireTick(tick);
  if (
    !nonnegativeSafeInteger(activeThroughEpoch)
    || activeThroughEpoch > CORE_ECOLOGY_BREADTH_CURRENT_EPOCH
  ) throw new RangeError("Breadth resident set references an unavailable epoch");
  const regions = canonicalRegions(input.regions);
  const cohorts = coreEcologyBreadthCohortsThroughEpoch(activeThroughEpoch);
  const residents = regions.flatMap((region) => cohorts.flatMap((cohort) => {
    const habitat = deriveCoreEcologyBreadthHabitat({
      seed: input.seed,
      region,
      cohortId: cohort.cohortId,
    });
    if (habitat.totalPopulationUnits === 0) return [];
    return [deepFreeze({
      cohortId: cohort.cohortId,
      cohortEpoch: cohort.introducedInEpoch,
      sourceKey: coreEcologyBreadthResidentSourceKey(habitat),
      region,
      habitat,
      patch: createCoreEcologyBreadthResidentPatch({
        seed: input.seed,
        habitat,
        tick,
      }),
    })];
  })).sort(compareSource);
  const base = {
    version: REGIONAL_BREADTH_COHORT_VERSION,
    ownerId: REGIONAL_BREADTH_COHORT_OWNER_ID,
    activeThroughEpoch,
    updatedAtTick: tick,
    residents: Object.freeze(residents),
  } as const;
  return deepFreeze({ ...base, derivationHash: hashCanonical(base) });
}

export function coreEcologyBreadthResidentSourceKey(
  habitat: Pick<
    CoreEcologyBreadthHabitat,
    "cohortId" | "cohortEpoch" | "regionId" | "derivationHash"
  >,
): string {
  return `breadth:${habitat.cohortEpoch}:${habitat.cohortId}:${hashCanonical([
    habitat.regionId,
    habitat.derivationHash,
  ])}`;
}

function individualPopulation(
  candidate: CoreEcologyBreadthPopulationCandidate,
): readonly CoreEcologyPopulationInput[] {
  if (candidate.actorRepresentation !== "individual" || candidate.populationUnits === 0) {
    return [];
  }
  if (candidate.anchors.length !== candidate.populationUnits) {
    throw new Error("Breadth individual candidate has no one-to-one actor anchors");
  }
  return [Object.freeze({
    species: candidate.species,
    populationKey: candidate.populationKey,
    populationSize: candidate.populationUnits,
    members: Object.freeze(candidate.anchors.map((anchor, populationOrdinal) => (
      Object.freeze({
        populationOrdinal,
        representedUnits: 1,
        position: anchor.position,
        materialization: "coarse" as const,
      })
    ))),
  })];
}

function compareSource(
  left: CoreEcologyBreadthResidentSource,
  right: CoreEcologyBreadthResidentSource,
): number {
  return left.cohortEpoch - right.cohortEpoch
    || compareText(left.cohortId, right.cohortId)
    || compareText(regionKey(left.region), regionKey(right.region));
}

function canonicalRegions(values: readonly RegionCoord[]): readonly RegionCoord[] {
  const regions = new Map<string, RegionCoord>();
  for (const region of values) {
    if (!isRegionCoord(region)) throw new RangeError("Breadth residents require regions");
    regions.set(regionKey(region), createRegionCoord(region.x, region.y));
  }
  return Object.freeze([...regions.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([, region]) => region));
}

function requireTick(value: number): void {
  if (
    !nonnegativeSafeInteger(value)
    || value > Number.MAX_SAFE_INTEGER - CORE_ECOLOGY_MAX_STEP_TICKS
  ) throw new RangeError("Breadth cohort tick is outside the schedulable range");
}

function rootSeed(value: unknown): value is RootSeed {
  return Array.isArray(value)
    && value.length === 4
    && value.every((word) => (
      Number.isSafeInteger(word) && word >= 0 && word <= 0xffff_ffff
    ));
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function plainRecord(value: unknown): value is Record<string, any> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

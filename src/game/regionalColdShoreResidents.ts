import {
  generateCoreWildlifeIdentity,
  type CoreWildlifeSpecies,
} from "../sim/coreWildlifeIdentity";
import type { RootSeed } from "../sim/rng";
import {
  createRegionCoord,
  isRegionCoord,
  type RegionCoord,
} from "../sim/regions";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_INDIVIDUAL_SPECIES,
  CORE_ECOLOGY_MAX_MEMBERS,
  CORE_ECOLOGY_MAX_POPULATIONS,
  CORE_ECOLOGY_MAX_STEP_TICKS,
  advanceCoreEcologyDormantAggregatePatch,
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  CORE_ECOLOGY_COLD_SHORE_DERIVATION_KIND,
  canonicalCoreEcologyColdShoreHabitatForWorld,
  deriveCoreEcologyColdShoreHabitat,
  type CoreEcologyColdShoreHabitat,
  type CoreEcologyColdShorePopulationCandidate,
} from "./coreEcologyColdShoreHabitat";
import { deriveCoreEcologyPolarShoreTerritory } from "./coreEcologyPolarShoreHabitat";

export const CORE_ECOLOGY_COLD_SHORE_RESIDENT_SET_VERSION = 1 as const;
export const CORE_ECOLOGY_COLD_SHORE_RESIDENT_SET_OWNER_ID =
  "game:regional-cold-shore-residents:v1" as const;

export interface CreateCoreEcologyColdShoreResidentPatchInput {
  readonly seed: RootSeed;
  readonly habitat: CoreEcologyColdShoreHabitat;
  readonly tick?: number;
}

export interface CanonicalCoreEcologyColdShoreResidentBinding {
  readonly seed: RootSeed;
  readonly region: RegionCoord;
  readonly completedTick: number;
}

export interface CoreEcologyColdShoreResidentSource {
  readonly sourceKey: string;
  readonly region: RegionCoord;
  readonly habitat: CoreEcologyColdShoreHabitat;
  readonly patch: CoreEcologyAggregatePatchState;
}

export interface CoreEcologyColdShoreResidentSet {
  readonly version: typeof CORE_ECOLOGY_COLD_SHORE_RESIDENT_SET_VERSION;
  readonly ownerId: typeof CORE_ECOLOGY_COLD_SHORE_RESIDENT_SET_OWNER_ID;
  readonly updatedAtTick: number;
  readonly residents: readonly CoreEcologyColdShoreResidentSource[];
  readonly derivationHash: string;
}

export interface DeriveCoreEcologyColdShoreResidentSetInput {
  readonly seed: RootSeed;
  readonly regions: readonly RegionCoord[];
  readonly tick?: number;
}

/** Converts one authenticated habitat into the shared persistent actor patch. */
export function createCoreEcologyColdShoreResidentPatch(
  input: CreateCoreEcologyColdShoreResidentPatchInput,
): CoreEcologyAggregatePatchState {
  if (
    !plainRecord(input) ||
    !rootSeed(input.seed) ||
    !plainRecord(input.habitat)
  ) {
    throw new TypeError("Cold-shore resident patch input is malformed");
  }
  const habitat = canonicalCoreEcologyColdShoreHabitatForWorld(
    input.habitat,
    input.seed,
    input.habitat.region,
  );
  if (habitat === null) {
    throw new RangeError(
      "Cold-shore resident habitat belongs to another world",
    );
  }
  const tick = input.tick ?? 0;
  requireTick(tick);
  const populations = habitat.populations.flatMap((candidate) =>
    individualPopulation(candidate),
  );
  if (
    populations.length > CORE_ECOLOGY_MAX_POPULATIONS ||
    populations.reduce(
      (sum, population) => sum + population.members.length,
      0,
    ) > CORE_ECOLOGY_MAX_MEMBERS
  )
    throw new RangeError(
      "Cold-shore habitat exceeds the shared resident budget",
    );
  return createCoreEcologyAggregatePatch({
    seed: input.seed,
    patchKey: coreEcologyColdShoreResidentSourceKey(habitat),
    originRegion: habitat.region,
    tick,
    derivation: {
      kind: CORE_ECOLOGY_COLD_SHORE_DERIVATION_KIND,
      habitat,
    },
    populations,
  });
}

/**
 * World-bound validation permits shared actor cognition, condition, evidence,
 * and movement while forbidding population loss, aggregates, groups, or bodies.
 */
export function canonicalCoreEcologyColdShoreResidentPatch(
  value: unknown,
  binding: CanonicalCoreEcologyColdShoreResidentBinding,
): CoreEcologyAggregatePatchState | null {
  if (
    !plainRecord(binding) ||
    !rootSeed(binding.seed) ||
    !isRegionCoord(binding.region) ||
    !nonnegativeSafeInteger(binding.completedTick)
  )
    return null;
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  const derivation = patch?.derivation as unknown as
    | Readonly<{
        readonly kind?: unknown;
        readonly habitat?: unknown;
      }>
    | undefined;
  if (
    patch === null ||
    stableStringify(patch) !== stableStringify(value) ||
    patch.updatedAtTick !== binding.completedTick ||
    patch.originRegion.x !== binding.region.x ||
    patch.originRegion.y !== binding.region.y ||
    derivation?.kind !== CORE_ECOLOGY_COLD_SHORE_DERIVATION_KIND
  )
    return null;
  const habitat = canonicalCoreEcologyColdShoreHabitatForWorld(
    derivation.habitat,
    binding.seed,
    binding.region,
  );
  if (
    habitat === null ||
    patch.patchKey !== coreEcologyColdShoreResidentSourceKey(habitat) ||
    patch.groups.groups.length !== 0 ||
    patch.aggregatePopulations.length !== 0 ||
    patch.nextMortalityOrdinal !== 0 ||
    patch.mortalityTransactions.length !== 0 ||
    patch.carcasses.length !== 0
  )
    return null;

  const candidate = habitat.populations[0];
  const expectedPopulationCount = candidate.populationUnits;
  if (patch.populations.length !== expectedPopulationCount) return null;
  if (expectedPopulationCount === 0) return patch;
  const population = patch.populations[0];
  const member = population?.members[0];
  if (
    population === undefined ||
    population.species !== "arctic-fox" ||
    population.populationKey !== candidate.populationKey ||
    population.baselinePopulationSize !== 1 ||
    population.populationSize !== 1 ||
    population.reserveUnits !== 0 ||
    population.members.length !== 1 ||
    member === undefined ||
    member.populationOrdinal !== 0 ||
    member.representedUnits !== 1 ||
    member.actor.identity.originRegion.x !== binding.region.x ||
    member.actor.identity.originRegion.y !== binding.region.y
  )
    return null;
  const identity = generateCoreWildlifeIdentity({
    seed: binding.seed,
    species: "arctic-fox" as CoreWildlifeSpecies,
    originRegion: binding.region,
    populationKey: candidate.populationKey,
    populationOrdinal: 0,
  });
  return stableStringify(member.actor.identity) === stableStringify(identity)
    ? patch
    : null;
}

export function coreEcologyColdShoreResidentPatchIsAllCoarse(
  patch: CoreEcologyAggregatePatchState,
): boolean {
  return patch.populations.every(({ members }) =>
    members.every(({ materialization }) => materialization === "coarse"),
  );
}

/** Shared exact dormant bridge, with bounded cadence fallback. */
export function reconcileCoreEcologyColdShoreResidentPatchAtTick(
  value: unknown,
  atTick: number,
): CoreEcologyAggregatePatchState | null {
  let patch = canonicalizeCoreEcologyAggregatePatch(value);
  const derivation = patch?.derivation as unknown as
    | Readonly<{
        readonly kind?: unknown;
      }>
    | undefined;
  if (
    patch === null ||
    derivation?.kind !== CORE_ECOLOGY_COLD_SHORE_DERIVATION_KIND ||
    !nonnegativeSafeInteger(atTick) ||
    atTick < patch.updatedAtTick ||
    atTick > Number.MAX_SAFE_INTEGER - CORE_ECOLOGY_MAX_STEP_TICKS ||
    !coreEcologyColdShoreResidentPatchIsAllCoarse(patch)
  )
    return null;
  while (patch.updatedAtTick < atTick) {
    const accelerated = advanceCoreEcologyDormantAggregatePatch(patch, {
      atTick,
    });
    if (accelerated !== null) return accelerated;
    const nextTick = Math.min(
      atTick,
      patch.updatedAtTick + CORE_ECOLOGY_MAX_STEP_TICKS,
    );
    const stepped = stepCoreEcologyAggregatePatch(patch, {
      tick: nextTick,
      actorSteps: [],
    });
    if (stepped === null) return null;
    patch = stepped.patch;
  }
  return patch;
}

/** Current physical residence; stable origin ownership never transfers. */
export function coreEcologyColdShoreResidentPatchResidenceRegions(
  value: unknown,
): readonly RegionCoord[] | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  const derivation = patch?.derivation as unknown as
    | Readonly<{
        readonly kind?: unknown;
      }>
    | undefined;
  if (
    patch === null ||
    derivation?.kind !== CORE_ECOLOGY_COLD_SHORE_DERIVATION_KIND
  ) {
    return null;
  }
  return canonicalRegions(
    patch.populations.flatMap(({ members }) =>
      members.map(({ actor }) => actor.address.position.region),
    ),
  );
}

export function deriveCoreEcologyColdShoreResidentSet(
  input: DeriveCoreEcologyColdShoreResidentSetInput,
): CoreEcologyColdShoreResidentSet {
  if (
    !plainRecord(input) ||
    !rootSeed(input.seed) ||
    !Array.isArray(input.regions)
  ) {
    throw new TypeError("Cold-shore resident-set input is malformed");
  }
  const tick = input.tick ?? 0;
  requireTick(tick);
  const residents = canonicalRegions(input.regions)
    .flatMap((region): CoreEcologyColdShoreResidentSource[] => {
      if (
        !deriveCoreEcologyPolarShoreTerritory(input.seed, region).regionIsHost
      ) {
        return [];
      }
      const habitat = deriveCoreEcologyColdShoreHabitat({
        seed: input.seed,
        region,
      });
      if (habitat.totalPopulationUnits === 0) return [];
      const patch = createCoreEcologyColdShoreResidentPatch({
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
    version: CORE_ECOLOGY_COLD_SHORE_RESIDENT_SET_VERSION,
    ownerId: CORE_ECOLOGY_COLD_SHORE_RESIDENT_SET_OWNER_ID,
    updatedAtTick: tick,
    residents: Object.freeze(residents),
  } as const;
  return deepFreeze({ ...base, derivationHash: hashCanonical(base) });
}

export function coreEcologyColdShoreResidentSourceKey(
  habitat: Pick<CoreEcologyColdShoreHabitat, "sourceStableId">,
): string {
  if (!plainRecord(habitat) || typeof habitat.sourceStableId !== "string") {
    throw new TypeError("Cold-shore resident source requires a stable habitat");
  }
  return `${CORE_ECOLOGY_COLD_SHORE_DERIVATION_KIND}:${hashCanonical({
    ownerId: CORE_ECOLOGY_COLD_SHORE_RESIDENT_SET_OWNER_ID,
    sourceStableId: habitat.sourceStableId,
  })}`;
}

function individualPopulation(
  candidate: CoreEcologyColdShorePopulationCandidate,
): readonly CoreEcologyPopulationInput[] {
  if (candidate.populationUnits === 0) return Object.freeze([]);
  if (
    !(CORE_ECOLOGY_INDIVIDUAL_SPECIES as readonly string[]).includes(
      candidate.species,
    )
  ) {
    throw new RangeError("Arctic fox lacks shared individual representation");
  }
  const anchor = candidate.anchors[0];
  if (anchor === undefined)
    throw new Error("Admitted Arctic fox lacks its dry anchor");
  return Object.freeze([
    Object.freeze({
      species: candidate.species as CoreWildlifeSpecies,
      populationKey: candidate.populationKey,
      populationSize: 1,
      members: Object.freeze([
        Object.freeze({
          populationOrdinal: 0,
          representedUnits: 1,
          position: anchor.position,
          materialization: "coarse" as const,
        }),
      ]),
    }),
  ]);
}

function canonicalRegions(
  value: readonly RegionCoord[],
): readonly RegionCoord[] {
  const byKey = new Map<string, RegionCoord>();
  for (const region of value) {
    if (!isRegionCoord(region))
      throw new RangeError("Cold-shore resident region is malformed");
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
  if (
    !nonnegativeSafeInteger(value) ||
    value > Number.MAX_SAFE_INTEGER - CORE_ECOLOGY_MAX_STEP_TICKS
  )
    throw new RangeError(
      "Cold-shore resident tick is outside the schedulable range",
    );
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

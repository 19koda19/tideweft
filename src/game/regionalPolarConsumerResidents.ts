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
  CORE_ECOLOGY_MAX_STEP_TICKS,
  advanceCoreEcologyDormantAggregatePatch,
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchDerivation,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND,
  canonicalCoreEcologyPolarConsumerHabitatForWorld,
  deriveCoreEcologyPolarConsumerHabitat,
  type CoreEcologyPolarConsumerHabitat,
  type CoreEcologyPolarConsumerPopulationCandidate,
} from "./coreEcologyPolarConsumerHabitat";
import { deriveCoreEcologyPolarShoreTerritory } from "./coreEcologyPolarShoreHabitat";

export const CORE_ECOLOGY_POLAR_CONSUMER_RESIDENT_SET_VERSION = 1 as const;
export const CORE_ECOLOGY_POLAR_CONSUMER_RESIDENT_SET_OWNER_ID =
  "game:regional-polar-consumer-residents:v1" as const;

export interface CreateCoreEcologyPolarConsumerResidentPatchInput {
  readonly seed: RootSeed;
  readonly habitat: CoreEcologyPolarConsumerHabitat;
  readonly tick?: number;
}

export interface CanonicalCoreEcologyPolarConsumerResidentBinding {
  readonly seed: RootSeed;
  readonly region: RegionCoord;
  readonly completedTick: number;
}

export interface CoreEcologyPolarConsumerResidentSource {
  readonly sourceKey: string;
  readonly region: RegionCoord;
  readonly habitat: CoreEcologyPolarConsumerHabitat;
  readonly patch: CoreEcologyAggregatePatchState;
}

export interface CoreEcologyPolarConsumerResidentSet {
  readonly version: typeof CORE_ECOLOGY_POLAR_CONSUMER_RESIDENT_SET_VERSION;
  readonly ownerId: typeof CORE_ECOLOGY_POLAR_CONSUMER_RESIDENT_SET_OWNER_ID;
  readonly updatedAtTick: number;
  readonly residents: readonly CoreEcologyPolarConsumerResidentSource[];
  readonly derivationHash: string;
}

export interface DeriveCoreEcologyPolarConsumerResidentSetInput {
  readonly seed: RootSeed;
  readonly regions: readonly RegionCoord[];
  readonly tick?: number;
}

/** Converts one authenticated two-step habitat into shared individual actors. */
export function createCoreEcologyPolarConsumerResidentPatch(
  input: CreateCoreEcologyPolarConsumerResidentPatchInput,
): CoreEcologyAggregatePatchState {
  if (
    !plainRecord(input) ||
    !rootSeed(input.seed) ||
    !plainRecord(input.habitat)
  ) {
    throw new TypeError("Polar-consumer resident patch input is malformed");
  }
  const habitat = canonicalCoreEcologyPolarConsumerHabitatForWorld(
    input.habitat,
    input.seed,
    input.habitat.region,
  );
  if (habitat === null) {
    throw new RangeError(
      "Polar-consumer resident habitat belongs to another world",
    );
  }
  const tick = input.tick ?? 0;
  requireTick(tick);
  const populations = habitat.populations.flatMap((candidate) =>
    individualPopulation(candidate),
  );
  return createCoreEcologyAggregatePatch({
    seed: input.seed,
    patchKey: coreEcologyPolarConsumerResidentSourceKey(habitat),
    originRegion: habitat.region,
    tick,
    derivation: {
      kind: CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND,
      habitat,
    } as unknown as CoreEcologyAggregatePatchDerivation,
    populations,
  });
}

/**
 * Validates exact lineage while allowing shared cognition, condition, evidence,
 * materialization, and physical movement to evolve.
 */
export function canonicalCoreEcologyPolarConsumerResidentPatch(
  value: unknown,
  binding: CanonicalCoreEcologyPolarConsumerResidentBinding,
): CoreEcologyAggregatePatchState | null {
  if (
    !plainRecord(binding) ||
    !rootSeed(binding.seed) ||
    !isRegionCoord(binding.region) ||
    !nonnegativeSafeInteger(binding.completedTick)
  ) {
    return null;
  }
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  const derivation = patch?.derivation as unknown as
    | Readonly<{ readonly kind?: unknown; readonly habitat?: unknown }>
    | undefined;
  if (
    patch === null ||
    stableStringify(patch) !== stableStringify(value) ||
    patch.updatedAtTick !== binding.completedTick ||
    patch.originRegion.x !== binding.region.x ||
    patch.originRegion.y !== binding.region.y ||
    derivation?.kind !== CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND
  ) {
    return null;
  }
  const habitat = canonicalCoreEcologyPolarConsumerHabitatForWorld(
    derivation.habitat,
    binding.seed,
    binding.region,
  );
  if (
    habitat === null ||
    patch.patchKey !== coreEcologyPolarConsumerResidentSourceKey(habitat) ||
    patch.groups.groups.length !== 0 ||
    patch.aggregatePopulations.length !== 0 ||
    patch.nextMortalityOrdinal !== 0 ||
    patch.mortalityTransactions.length !== 0 ||
    patch.carcasses.length !== 0
  ) {
    return null;
  }
  const expected = habitat.populations.filter(
    ({ populationUnits }) => populationUnits === 1,
  );
  if (patch.populations.length !== expected.length) return null;
  for (const candidate of expected) {
    const population = patch.populations.find(
      ({ populationKey }) => populationKey === candidate.populationKey,
    );
    const member = population?.members[0];
    if (
      population === undefined ||
      population.species !== candidate.species ||
      population.baselinePopulationSize !== 1 ||
      population.populationSize !== 1 ||
      population.reserveUnits !== 0 ||
      population.members.length !== 1 ||
      member === undefined ||
      member.populationOrdinal !== 0 ||
      member.representedUnits !== 1 ||
      member.actor.identity.originRegion.x !== binding.region.x ||
      member.actor.identity.originRegion.y !== binding.region.y
    ) {
      return null;
    }
    const identity = generateCoreWildlifeIdentity({
      seed: binding.seed,
      species: candidate.species as CoreWildlifeSpecies,
      originRegion: binding.region,
      populationKey: candidate.populationKey,
      populationOrdinal: 0,
    });
    if (stableStringify(member.actor.identity) !== stableStringify(identity)) {
      return null;
    }
  }
  return patch;
}

export function coreEcologyPolarConsumerResidentPatchIsAllCoarse(
  patch: CoreEcologyAggregatePatchState,
): boolean {
  return patch.populations.every(({ members }) =>
    members.every(({ materialization }) => materialization === "coarse"),
  );
}

/** Shared exact dormant bridge, with the ordinary bounded cadence fallback. */
export function reconcileCoreEcologyPolarConsumerResidentPatchAtTick(
  value: unknown,
  atTick: number,
): CoreEcologyAggregatePatchState | null {
  let patch = canonicalizeCoreEcologyAggregatePatch(value);
  const derivation = patch?.derivation as unknown as
    Readonly<{ readonly kind?: unknown }> | undefined;
  if (
    patch === null ||
    derivation?.kind !== CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND ||
    !nonnegativeSafeInteger(atTick) ||
    atTick < patch.updatedAtTick ||
    atTick > Number.MAX_SAFE_INTEGER - CORE_ECOLOGY_MAX_STEP_TICKS ||
    !coreEcologyPolarConsumerResidentPatchIsAllCoarse(patch)
  ) {
    return null;
  }
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
export function coreEcologyPolarConsumerResidentPatchResidenceRegions(
  value: unknown,
): readonly RegionCoord[] | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  const derivation = patch?.derivation as unknown as
    Readonly<{ readonly kind?: unknown }> | undefined;
  if (
    patch === null ||
    derivation?.kind !== CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND
  ) {
    return null;
  }
  return canonicalRegions(
    patch.populations.flatMap(({ members }) =>
      members.map(({ actor }) => actor.address.position.region),
    ),
  );
}

export function deriveCoreEcologyPolarConsumerResidentSet(
  input: DeriveCoreEcologyPolarConsumerResidentSetInput,
): CoreEcologyPolarConsumerResidentSet {
  if (
    !plainRecord(input) ||
    !rootSeed(input.seed) ||
    !Array.isArray(input.regions)
  ) {
    throw new TypeError("Polar-consumer resident-set input is malformed");
  }
  const tick = input.tick ?? 0;
  requireTick(tick);
  const residents = canonicalRegions(input.regions)
    .flatMap((region): CoreEcologyPolarConsumerResidentSource[] => {
      if (
        !deriveCoreEcologyPolarShoreTerritory(input.seed, region).regionIsHost
      ) {
        return [];
      }
      const habitat = deriveCoreEcologyPolarConsumerHabitat({
        seed: input.seed,
        region,
      });
      if (habitat.totalPopulationUnits === 0) return [];
      const patch = createCoreEcologyPolarConsumerResidentPatch({
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
    version: CORE_ECOLOGY_POLAR_CONSUMER_RESIDENT_SET_VERSION,
    ownerId: CORE_ECOLOGY_POLAR_CONSUMER_RESIDENT_SET_OWNER_ID,
    updatedAtTick: tick,
    residents: Object.freeze(residents),
  } as const;
  return deepFreeze({ ...base, derivationHash: hashCanonical(base) });
}

export function coreEcologyPolarConsumerResidentSourceKey(
  habitat: Pick<CoreEcologyPolarConsumerHabitat, "sourceStableId">,
): string {
  if (!plainRecord(habitat) || typeof habitat.sourceStableId !== "string") {
    throw new TypeError(
      "Polar-consumer resident source requires a stable habitat",
    );
  }
  return `${CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND}:${hashCanonical({
    ownerId: CORE_ECOLOGY_POLAR_CONSUMER_RESIDENT_SET_OWNER_ID,
    sourceStableId: habitat.sourceStableId,
  })}`;
}

function individualPopulation(
  candidate: CoreEcologyPolarConsumerPopulationCandidate,
): readonly CoreEcologyPopulationInput[] {
  if (candidate.populationUnits === 0) return Object.freeze([]);
  if (
    !(CORE_ECOLOGY_INDIVIDUAL_SPECIES as readonly string[]).includes(
      candidate.species,
    )
  ) {
    throw new RangeError(
      `${candidate.species} lacks shared individual representation`,
    );
  }
  const purpose =
    candidate.species === "harbor-seal" ? "dry-haulout" : "bear-land";
  const anchor = candidate.anchors.find((entry) => entry.purpose === purpose);
  if (anchor === undefined) {
    throw new Error(`Admitted ${candidate.species} lacks its home anchor`);
  }
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
    if (!isRegionCoord(region)) {
      throw new RangeError("Polar-consumer resident region is malformed");
    }
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
  ) {
    throw new RangeError(
      "Polar-consumer resident tick is outside the schedulable range",
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
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

import {
  generateCoreWildlifeIdentity,
} from "../sim/coreWildlifeIdentity";
import type { RootSeed } from "../sim/rng";
import { stableRegionId } from "../sim/regions";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_DOMESTIC_SPECIES,
} from "./coreEcologyRegionalHabitat";
import {
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  stableCoreEcologyAggregatePopulationId,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import type { CoreEcologyRegionalPredatorHabitatAssemblage } from "./coreEcologyHabitat";
import {
  createCoreEcologyGroup,
  createCoreEcologyGroupSet,
  type CoreEcologyGroupState,
} from "./coreEcologyGroups";
import {
  coreEcologySpeciesHasRuntimeCapability,
  coreEcologySpeciesRuntimePolicy,
} from "./coreEcologySpeciesRuntimePolicy";

export const CORE_ECOLOGY_SETTLEMENT_HOME_VERSION = 1 as const;
export const CORE_ECOLOGY_SETTLEMENT_HOME_OWNER_ID =
  "game:core-ecology-settlement-home:v1" as const;

const CORE_ECOLOGY_REQUIRED_SETTLEMENT_HOME_SPECIES = Object.freeze([
  "domestic-chicken",
  "domestic-goat",
] as const);

export interface CreateCoreEcologySettlementHomeInput {
  readonly seed: RootSeed;
  readonly habitat: CoreEcologyRegionalPredatorHabitatAssemblage;
  readonly tick?: number;
}

export interface CanonicalCoreEcologySettlementHomeBinding {
  readonly seed: RootSeed;
  readonly habitat: CoreEcologyRegionalPredatorHabitatAssemblage;
  readonly completedTick: number;
}

export interface AdoptCoreEcologySettlementHomeFromV24Input
  extends CanonicalCoreEcologySettlementHomeBinding {
  /** The already-authenticated v24 whole-home compatibility patch. */
  readonly sourcePatch: CoreEcologyAggregatePatchState;
}

/**
 * Derive only settlement-custody animals from the frozen v11 home facts.
 * Wild populations are owned by signed regional habitats; carrying the full
 * compatibility habitat here preserves exact domestic/rat lineage without
 * making its wild candidates authoritative residents.
 */
export function createCoreEcologySettlementHomePatch(
  input: CreateCoreEcologySettlementHomeInput,
): CoreEcologyAggregatePatchState {
  requireSeed(input.seed);
  if (!settlementHomeHabitatMatchesSeed(input.seed, input.habitat)) {
    throw new RangeError("Settlement home habitat does not belong to the root seed");
  }
  const tick = input.tick ?? 0;
  requireTick(tick);
  const populations = settlementHomePopulationInputs(input.habitat);
  const species = new Set(populations.map((population) => population.species));
  if (CORE_ECOLOGY_REQUIRED_SETTLEMENT_HOME_SPECIES.some((entry) => !species.has(entry))) {
    throw new RangeError("Settlement home habitat is missing a required anchored population");
  }
  return createCoreEcologyAggregatePatch({
    seed: input.seed,
    patchKey: coreEcologySettlementHomeSourceKey(input.seed, input.habitat),
    originRegion: input.habitat.originRegion,
    tick,
    derivation: { kind: "settlement-home-v1", habitat: input.habitat },
    groups: settlementHomeGroups(input.seed, input.habitat, populations, tick),
    populations,
  });
}

/**
 * Moves the settlement-owned slice of an authenticated v24 whole-home patch
 * into its v25 owner without regenerating living history. The legacy cohort
 * remains the sole authority for every pre-adoption mortality/body record;
 * this owner starts a fresh post-adoption mortality ledger.
 */
export function adoptCoreEcologySettlementHomeFromV24(
  input: AdoptCoreEcologySettlementHomeFromV24Input,
): CoreEcologyAggregatePatchState | null {
  if (!adoptionInputShape(input)) return null;
  try {
    requireSeed(input.seed);
    requireTick(input.completedTick);
  } catch {
    return null;
  }
  const source = canonicalizeCoreEcologyAggregatePatch(input.sourcePatch);
  if (
    source === null
    || stableStringify(source) !== stableStringify(input.sourcePatch)
    || source.updatedAtTick !== input.completedTick
    || !settlementHomeHabitatMatchesSeed(input.seed, input.habitat)
    || source.originRegion.x !== input.habitat.originRegion.x
    || source.originRegion.y !== input.habitat.originRegion.y
    || !v24DerivationMatchesHome(source, input.habitat)
    || !v24PatchLineageMatchesWorld(source, input.seed)
  ) return null;

  const domesticMortality = source.mortalityTransactions.filter(({ retiredActor }) => (
    CORE_ECOLOGY_DOMESTIC_SPECIES.includes(retiredActor.identity.species)
  ));
  const retiredPopulationKeys = new Set(domesticMortality.map(({ retiredActor }) => (
    `${retiredActor.identity.species}:${retiredActor.identity.populationKey}`
  )));
  const populations = source.populations.filter(({ species, populationSize }) => (
    CORE_ECOLOGY_DOMESTIC_SPECIES.includes(species) && populationSize > 0
  )).map((population) => (
    retiredPopulationKeys.has(`${population.species}:${population.populationKey}`)
      ? Object.freeze({
          ...population,
          baselinePopulationSize: population.populationSize,
        })
      : population
  ));
  const populationKeys = new Set(populations.map(({ species, populationKey }) => (
    `${species}:${populationKey}`
  )));
  const groups = createCoreEcologyGroupSet(source.groups.groups.filter(({ identity }) => (
    CORE_ECOLOGY_DOMESTIC_SPECIES.includes(identity.species)
    && populationKeys.has(`${identity.species}:${identity.populationKey}`)
  )));
  const rats = source.aggregatePopulations.filter(({ species }) => species === "brown-rat");
  if (rats.length !== 1) return null;

  const legacySuppression = domesticMortality.length === 0
    ? undefined
    : Object.freeze({
        version: 1 as const,
        sourcePatchHash: hashCanonical(source),
        retirements: Object.freeze(domesticMortality.map(({ retiredActor, representedUnitsBefore }) => (
          Object.freeze({
            legacyActorId: retiredActor.identity.stableId,
            species: retiredActor.identity.species,
            populationKey: retiredActor.identity.populationKey,
            populationOrdinal: retiredActor.identity.populationOrdinal,
            representedUnitsBefore,
          })
        )).sort((left, right) => compareText(left.legacyActorId, right.legacyActorId))),
      });

  const candidate = canonicalizeCoreEcologyAggregatePatch({
    ...source,
    patchKey: coreEcologySettlementHomeSourceKey(input.seed, input.habitat),
    derivation: {
      kind: "settlement-home-v1",
      habitat: input.habitat,
      ...(legacySuppression === undefined ? {} : { legacySuppression }),
    },
    groups,
    populations,
    aggregatePopulations: rats,
    nextMortalityOrdinal: 0,
    mortalityTransactions: [],
    carcasses: [],
  });
  if (candidate === null) return null;
  const adopted = canonicalCoreEcologySettlementHomePatch(candidate, input);
  if (
    adopted === null
    || stableStringify(adopted.populations) !== stableStringify(populations)
    || stableStringify(adopted.groups) !== stableStringify(groups)
    || stableStringify(adopted.aggregatePopulations) !== stableStringify(rats)
    || adopted.nextMortalityOrdinal !== 0
    || adopted.mortalityTransactions.length !== 0
    || adopted.carcasses.length !== 0
  ) return null;
  return adopted;
}

export function canonicalCoreEcologySettlementHomePatch(
  value: unknown,
  binding: CanonicalCoreEcologySettlementHomeBinding,
): CoreEcologyAggregatePatchState | null {
  try {
    requireSeed(binding.seed);
    requireTick(binding.completedTick);
  } catch {
    return null;
  }
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    patch === null
    || !settlementHomeHabitatMatchesSeed(binding.seed, binding.habitat)
    || patch.updatedAtTick !== binding.completedTick
    || patch.derivation.kind !== "settlement-home-v1"
    || patch.patchKey !== coreEcologySettlementHomeSourceKey(binding.seed, binding.habitat)
    || stableStringify(patch.derivation.habitat) !== stableStringify(binding.habitat)
    || patch.populations.some(({ species }) => (
      !CORE_ECOLOGY_DOMESTIC_SPECIES.includes(species)
    ))
    || patch.aggregatePopulations.length !== 1
    || patch.aggregatePopulations[0]?.species !== "brown-rat"
  ) return null;

  for (const actor of [
    ...patch.populations.flatMap(({ members }) => members.map(({ actor }) => actor)),
    ...patch.mortalityTransactions.map(({ retiredActor }) => retiredActor),
  ]) {
    const expected = generateCoreWildlifeIdentity({
      seed: binding.seed,
      species: actor.identity.species,
      originRegion: patch.originRegion,
      populationKey: actor.identity.populationKey,
      populationOrdinal: actor.identity.populationOrdinal,
    });
    if (stableStringify(actor.identity) !== stableStringify(expected)) return null;
  }
  for (const retirement of patch.derivation.legacySuppression?.retirements ?? []) {
    const expected = generateCoreWildlifeIdentity({
      seed: binding.seed,
      species: retirement.species,
      originRegion: patch.originRegion,
      populationKey: retirement.populationKey,
      populationOrdinal: retirement.populationOrdinal,
    });
    const allocation = binding.habitat.populations.find(({ species, populationKey }) => (
      species === retirement.species && populationKey === retirement.populationKey
    ))?.allocations.find(({ allocationOrdinal }) => (
      allocationOrdinal === retirement.populationOrdinal
    ));
    if (
      retirement.legacyActorId !== expected.stableId
      || allocation === undefined
      || retirement.representedUnitsBefore !== allocation.representedUnits
    ) return null;
  }
  const rat = patch.aggregatePopulations[0]!;
  if (rat.aggregateId !== stableCoreEcologyAggregatePopulationId({
    seed: binding.seed,
    originRegion: patch.originRegion,
    populationKey: rat.populationKey,
    species: rat.species,
  })) return null;

  const expectedGroups = settlementHomeGroups(
    binding.seed,
    binding.habitat,
    currentSettlementHomePopulationInputs(patch),
    0,
  );
  if (
    patch.groups.groups.length !== expectedGroups.groups.length
    || patch.groups.groups.some((group) => {
      const expected = expectedGroups.groups.find(({ identity }) => (
        identity.stableId === group.identity.stableId
      ));
      return expected === undefined
        || stableStringify(group.identity) !== stableStringify(expected.identity)
        || stableStringify(group.memberOrdinals) !== stableStringify(expected.memberOrdinals);
    })
  ) return null;
  return patch;
}

function v24DerivationMatchesHome(
  patch: CoreEcologyAggregatePatchState,
  habitat: CoreEcologyRegionalPredatorHabitatAssemblage,
): boolean {
  return (
    patch.derivation.kind === "habitat-v11"
    || patch.derivation.kind === "legacy-fixed-v1-with-habitat-v11"
  ) && stableStringify(patch.derivation.habitat) === stableStringify(habitat);
}

function v24PatchLineageMatchesWorld(
  patch: CoreEcologyAggregatePatchState,
  seed: RootSeed,
): boolean {
  for (const actor of [
    ...patch.populations.flatMap(({ members }) => members.map(({ actor }) => actor)),
    ...patch.mortalityTransactions.map(({ retiredActor }) => retiredActor),
  ]) {
    const expected = generateCoreWildlifeIdentity({
      seed,
      species: actor.identity.species,
      originRegion: patch.originRegion,
      populationKey: actor.identity.populationKey,
      populationOrdinal: actor.identity.populationOrdinal,
    });
    if (stableStringify(actor.identity) !== stableStringify(expected)) return false;
  }
  for (const group of patch.groups.groups) {
    const expected = createCoreEcologyGroup({
      seed,
      species: group.identity.species,
      originRegion: patch.originRegion,
      populationKey: group.identity.populationKey,
      groupOrdinal: group.identity.groupOrdinal,
      memberOrdinals: group.memberOrdinals,
      anchor: group.rendezvousAnchor,
      tick: 0,
    });
    if (stableStringify(group.identity) !== stableStringify(expected.identity)) return false;
  }
  return patch.aggregatePopulations.every((population) => (
    population.aggregateId === stableCoreEcologyAggregatePopulationId({
      seed,
      originRegion: patch.originRegion,
      populationKey: population.populationKey,
      species: population.species,
    })
  ));
}

function settlementHomeHabitatMatchesSeed(
  seed: RootSeed,
  habitat: CoreEcologyRegionalPredatorHabitatAssemblage,
): boolean {
  try {
    return habitat.regionId === stableRegionId(seed, habitat.originRegion)
      && habitat.regionalHabitat.regionId
        === stableRegionId(seed, habitat.regionalHabitat.originRegion);
  } catch {
    return false;
  }
}

export function coreEcologySettlementHomeSourceKey(
  seed: RootSeed,
  habitat: CoreEcologyRegionalPredatorHabitatAssemblage,
): string {
  requireSeed(seed);
  return `settlement-home-v1:${hashCanonical({
    ownerId: CORE_ECOLOGY_SETTLEMENT_HOME_OWNER_ID,
    rootSeed: seed,
    originRegion: habitat.originRegion,
    domesticAnchorId: habitat.domesticAnchor.anchorId,
    domesticPenAnchorId: habitat.domesticPenAnchor.anchorId,
  })}`;
}

function settlementHomePopulationInputs(
  habitat: CoreEcologyRegionalPredatorHabitatAssemblage,
): readonly CoreEcologyPopulationInput[] {
  return Object.freeze(habitat.populations.flatMap((population) => (
    !CORE_ECOLOGY_DOMESTIC_SPECIES.includes(population.species)
      || population.representation !== "individual-representatives"
      || population.populationUnits === 0
      ? []
      : [Object.freeze({
          species: population.species,
          populationKey: population.populationKey,
          populationSize: population.populationUnits,
          members: Object.freeze(population.allocations.map((allocation) => Object.freeze({
            populationOrdinal: allocation.allocationOrdinal,
            representedUnits: allocation.representedUnits,
            position: allocation.position,
            materialization: "coarse" as const,
          }))),
        })]
  )));
}

function currentSettlementHomePopulationInputs(
  patch: CoreEcologyAggregatePatchState,
): readonly CoreEcologyPopulationInput[] {
  return Object.freeze(patch.populations.map((population) => Object.freeze({
    species: population.species,
    populationKey: population.populationKey,
    populationSize: population.baselinePopulationSize,
    members: Object.freeze(population.members.map((member) => Object.freeze({
      populationOrdinal: member.populationOrdinal,
      representedUnits: member.representedUnits,
      position: member.actor.address.position,
      materialization: member.materialization,
    }))),
  })));
}

function settlementHomeGroups(
  seed: RootSeed,
  habitat: CoreEcologyRegionalPredatorHabitatAssemblage,
  populations: readonly CoreEcologyPopulationInput[],
  tick: number,
) {
  const groups: CoreEcologyGroupState[] = [];
  for (const population of populations) {
    const policy = coreEcologySpeciesRuntimePolicy(population.species);
    const anchor = population.members[0]?.position;
    if (
      policy === null
      || policy.groupOrganization === null
      || policy.groupStableIdNamespace === null
      || !coreEcologySpeciesHasRuntimeCapability(population.species, "group-coordination")
      || population.members.length < 2
      || anchor === undefined
    ) continue;
    groups.push(createCoreEcologyGroup({
      seed,
      species: population.species,
      originRegion: habitat.originRegion,
      populationKey: population.populationKey,
      groupOrdinal: 0,
      memberOrdinals: population.members.map(({ populationOrdinal }) => populationOrdinal),
      anchor,
      tick,
    }));
  }
  return createCoreEcologyGroupSet(groups);
}

function requireSeed(value: unknown): asserts value is RootSeed {
  if (
    !Array.isArray(value)
    || value.length !== 4
    || !value.every((word) => (
      Number.isSafeInteger(word)
      && word >= 0
      && word <= 0xffff_ffff
      && !Object.is(word, -0)
    ))
  ) throw new TypeError("Settlement home requires a canonical root seed");
}

function requireTick(value: unknown): asserts value is number {
  if (
    !Number.isSafeInteger(value)
    || (value as number) < 0
    || (value as number) > Number.MAX_SAFE_INTEGER - 64
    || Object.is(value, -0)
  ) throw new RangeError("Settlement home tick is outside the schedulable range");
}

function adoptionInputShape(
  value: unknown,
): value is AdoptCoreEcologySettlementHomeFromV24Input {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) return false;
  return stableStringify(Object.keys(value).sort())
    === stableStringify(["completedTick", "habitat", "seed", "sourcePatch"]);
}

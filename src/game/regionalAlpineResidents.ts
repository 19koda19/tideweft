import {
  generateCoreWildlifeIdentity,
  type CoreWildlifeSpecies,
} from "../sim/coreWildlifeIdentity";
import type { RootSeed } from "../sim/rng";
import { createRegionCoord, isRegionCoord, type RegionCoord } from "../sim/regions";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_INDIVIDUAL_SPECIES,
  CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS,
  CORE_ECOLOGY_MAX_MEMBERS,
  CORE_ECOLOGY_MAX_POPULATIONS,
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  stableCoreEcologyAggregatePopulationId,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  createCoreEcologyGroup,
  createCoreEcologyGroupSet,
} from "./coreEcologyGroups";
import {
  CORE_ECOLOGY_ALPINE_DERIVATION_KIND,
  canonicalCoreEcologyAlpineHabitatForWorld,
  deriveCoreEcologyAlpineHabitat,
  type CoreEcologyAlpineHabitat,
  type CoreEcologyAlpinePopulationCandidate,
} from "./coreEcologyAlpineHabitat";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
} from "./worldPosition";

export const CORE_ECOLOGY_ALPINE_RESIDENT_SET_VERSION = 1 as const;
export const CORE_ECOLOGY_ALPINE_RESIDENT_SET_OWNER_ID =
  "game:regional-alpine-residents:v1" as const;

export interface CreateCoreEcologyAlpineResidentPatchInput {
  readonly seed: RootSeed;
  readonly habitat: CoreEcologyAlpineHabitat;
  readonly tick?: number;
}

export interface CanonicalCoreEcologyAlpineResidentBinding {
  readonly seed: RootSeed;
  readonly region: RegionCoord;
  readonly completedTick: number;
}

export interface CoreEcologyAlpineResidentSource {
  readonly sourceKey: string;
  readonly region: RegionCoord;
  readonly habitat: CoreEcologyAlpineHabitat;
  readonly patch: CoreEcologyAggregatePatchState;
}

export interface CoreEcologyAlpineResidentSet {
  readonly version: typeof CORE_ECOLOGY_ALPINE_RESIDENT_SET_VERSION;
  readonly ownerId: typeof CORE_ECOLOGY_ALPINE_RESIDENT_SET_OWNER_ID;
  readonly updatedAtTick: number;
  readonly residents: readonly CoreEcologyAlpineResidentSource[];
  readonly derivationHash: string;
}

export interface DeriveCoreEcologyAlpineResidentSetInput {
  readonly seed: RootSeed;
  readonly regions: readonly RegionCoord[];
  readonly tick?: number;
}

/**
 * Converts one authenticated Alpine baseline into the shared ecology patch
 * shape. Every exact animal starts coarse; pika remains one non-addressable
 * aggregate and the global materialization owner alone chooses visible bodies.
 */
export function createCoreEcologyAlpineResidentPatch(
  input: CreateCoreEcologyAlpineResidentPatchInput,
): CoreEcologyAggregatePatchState {
  if (!plainRecord(input) || !rootSeed(input.seed) || !plainRecord(input.habitat)) {
    throw new TypeError("Alpine resident patch input is malformed");
  }
  const expectedHabitat = canonicalCoreEcologyAlpineHabitatForWorld(
    input.habitat,
    input.seed,
    input.habitat.region,
  );
  if (expectedHabitat === null) {
    throw new RangeError("Alpine resident habitat does not belong to the root seed");
  }
  const tick = input.tick ?? 0;
  requireTick(tick);
  const populations = expectedHabitat.populations.flatMap((candidate) => (
    individualPopulation(candidate, expectedHabitat.region)
  ));
  const aggregateCount = expectedHabitat.populations.filter(({ actorRepresentation, populationUnits }) => (
    actorRepresentation === "aggregate" && populationUnits > 0
  )).length;
  if (
    populations.length > CORE_ECOLOGY_MAX_POPULATIONS
    || aggregateCount > CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS
    || populations.reduce((sum, population) => sum + population.members.length, 0)
      > CORE_ECOLOGY_MAX_MEMBERS
  ) throw new RangeError("Alpine habitat exceeds the shared resident-patch budget");
  const goatPopulation = populations.find(({ species }) => species === "mountain-goat");
  const groups = goatPopulation === undefined
    ? createCoreEcologyGroupSet()
    : createCoreEcologyGroupSet([createCoreEcologyGroup({
        seed: input.seed,
        species: "mountain-goat",
        originRegion: expectedHabitat.region,
        populationKey: goatPopulation.populationKey,
        groupOrdinal: 0,
        memberOrdinals: goatPopulation.members.map(({ populationOrdinal }) => populationOrdinal),
        anchor: goatPopulation.members[0]!.position,
        tick,
      })]);
  return createCoreEcologyAggregatePatch({
    seed: input.seed,
    patchKey: coreEcologyAlpineResidentSourceKey(expectedHabitat),
    originRegion: expectedHabitat.region,
    tick,
    derivation: {
      kind: CORE_ECOLOGY_ALPINE_DERIVATION_KIND,
      habitat: expectedHabitat,
    },
    groups,
    populations,
  });
}

/**
 * World-bound validator for both active and all-coarse Alpine patches. It
 * permits movement/activity history but no Wave-F mortality, reproduction, or
 * loss of population units.
 */
export function canonicalCoreEcologyAlpineResidentPatch(
  value: unknown,
  binding: CanonicalCoreEcologyAlpineResidentBinding,
): CoreEcologyAggregatePatchState | null {
  if (
    !plainRecord(binding)
    || !rootSeed(binding.seed)
    || !isRegionCoord(binding.region)
    || !nonnegativeSafeInteger(binding.completedTick)
  ) return null;
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  const derivation = patch === null
    ? null
    : patch.derivation as unknown as Readonly<{ readonly kind: string; readonly habitat?: unknown }>;
  if (
    patch === null
    || derivation === null
    || stableStringify(patch) !== stableStringify(value)
    || patch.updatedAtTick !== binding.completedTick
    || patch.originRegion.x !== binding.region.x
    || patch.originRegion.y !== binding.region.y
    || derivation.kind !== CORE_ECOLOGY_ALPINE_DERIVATION_KIND
  ) return null;
  const habitat = canonicalCoreEcologyAlpineHabitatForWorld(
    derivation.habitat,
    binding.seed,
    binding.region,
  );
  if (
    habitat === null
    || patch.patchKey !== coreEcologyAlpineResidentSourceKey(habitat)
    || patch.nextMortalityOrdinal !== 0
    || patch.mortalityTransactions.length !== 0
    || patch.carcasses.length !== 0
  ) return null;

  const expectedIndividuals = habitat.populations.filter(({ actorRepresentation, populationUnits }) => (
    actorRepresentation === "individual" && populationUnits > 0
  ));
  if (patch.populations.length !== expectedIndividuals.length) return null;
  for (const expected of expectedIndividuals) {
    const population = patch.populations.find(({ species }) => species === expected.species);
    if (
      population === undefined
      || population.populationKey !== expected.populationKey
      || population.baselinePopulationSize !== expected.populationUnits
      || population.populationSize !== expected.populationUnits
      || population.reserveUnits !== 0
      || population.members.length !== expected.anchors.length
    ) return null;
    const ordinals = new Set<number>();
    for (const member of population.members) {
      const anchor = expected.anchors[member.populationOrdinal];
      if (
        anchor === undefined
        || member.representedUnits !== anchor.allocatedPopulation
        || member.actor.identity.originRegion.x !== binding.region.x
        || member.actor.identity.originRegion.y !== binding.region.y
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

  const expectedAggregates = habitat.populations.filter(({ actorRepresentation, populationUnits }) => (
    actorRepresentation === "aggregate" && populationUnits > 0
  ));
  if (patch.aggregatePopulations.length !== expectedAggregates.length) return null;
  for (const expected of expectedAggregates) {
    if (expected.species !== "american-pika") return null;
    const aggregate = patch.aggregatePopulations.find(({ species }) => species === expected.species);
    if (
      aggregate === undefined
      || aggregate.populationKey !== expected.populationKey
      || aggregate.populationSize !== expected.populationUnits
      || aggregate.habitatCapacity !== expected.habitatCapacity
      || aggregate.aggregateId !== stableCoreEcologyAggregatePopulationId({
        seed: binding.seed,
        originRegion: binding.region,
        populationKey: expected.populationKey,
        species: expected.species,
      })
      || aggregate.anchors.some(({ position }) => (
        position.region.x !== binding.region.x || position.region.y !== binding.region.y
      ))
      || aggregate.anchors.reduce((sum, anchor) => sum + anchor.populationUnits, 0)
        !== expected.populationUnits
    ) return null;
  }

  const expectedGroups = baselineGroupAuthority(binding.seed, habitat);
  const actualGroups = patch.groups.groups.map(({ identity, memberOrdinals }) => ({
    identity,
    memberOrdinals,
  }));
  if (stableStringify(actualGroups) !== stableStringify(expectedGroups)) return null;
  return patch;
}

export function coreEcologyAlpineResidentPatchIsAllCoarse(
  patch: CoreEcologyAggregatePatchState,
): boolean {
  return patch.populations.every(({ members }) => members.every(
    ({ materialization }) => materialization === "coarse",
  ));
}

/**
 * Current physical residence of an Alpine lineage owner. Birth/origin is not
 * included: seamless travel may move an individual beyond the region that
 * continues to own its stable identity.
 */
export function coreEcologyAlpineResidentPatchResidenceRegions(
  value: unknown,
): readonly RegionCoord[] | null {
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  const derivation = patch?.derivation as unknown as Readonly<{
    readonly kind?: unknown;
  }> | undefined;
  if (patch === null || derivation?.kind !== CORE_ECOLOGY_ALPINE_DERIVATION_KIND) return null;
  const regions: RegionCoord[] = [];
  for (const population of patch.populations) {
    for (const member of population.members) {
      regions.push(member.actor.address.position.region);
    }
  }
  for (const group of patch.groups.groups) {
    regions.push(group.rendezvousAnchor.region);
    for (const component of group.components) regions.push(component.anchor.region);
  }
  for (const population of patch.aggregatePopulations) {
    for (const anchor of population.anchors) regions.push(anchor.position.region);
  }
  return canonicalRegions(regions);
}

export function deriveCoreEcologyAlpineResidentSet(
  input: DeriveCoreEcologyAlpineResidentSetInput,
): CoreEcologyAlpineResidentSet {
  if (!plainRecord(input) || !rootSeed(input.seed) || !Array.isArray(input.regions)) {
    throw new TypeError("Alpine resident-set input is malformed");
  }
  const tick = input.tick ?? 0;
  requireTick(tick);
  const residents = canonicalRegions(input.regions).flatMap((region): CoreEcologyAlpineResidentSource[] => {
    const habitat = deriveCoreEcologyAlpineHabitat({ seed: input.seed, region });
    if (habitat.totalPopulationUnits === 0) return [];
    const patch = createCoreEcologyAlpineResidentPatch({ seed: input.seed, habitat, tick });
    return [deepFreeze({
      sourceKey: patch.patchKey,
      region,
      habitat,
      patch,
    })];
  }).sort((left, right) => compareText(left.sourceKey, right.sourceKey));
  const base = {
    version: CORE_ECOLOGY_ALPINE_RESIDENT_SET_VERSION,
    ownerId: CORE_ECOLOGY_ALPINE_RESIDENT_SET_OWNER_ID,
    updatedAtTick: tick,
    residents: Object.freeze(residents),
  } as const;
  return deepFreeze({ ...base, derivationHash: hashCanonical(base) });
}

export function coreEcologyAlpineResidentSourceKey(
  habitat: Pick<CoreEcologyAlpineHabitat, "sourceStableId">,
): string {
  if (!plainRecord(habitat) || typeof habitat.sourceStableId !== "string") {
    throw new TypeError("Alpine resident source requires a stable habitat source");
  }
  return `${CORE_ECOLOGY_ALPINE_DERIVATION_KIND}:${hashCanonical({
    ownerId: CORE_ECOLOGY_ALPINE_RESIDENT_SET_OWNER_ID,
    sourceStableId: habitat.sourceStableId,
  })}`;
}

function individualPopulation(
  candidate: CoreEcologyAlpinePopulationCandidate,
  region: RegionCoord,
): readonly CoreEcologyPopulationInput[] {
  if (candidate.populationUnits === 0 || candidate.actorRepresentation !== "individual") {
    return Object.freeze([]);
  }
  if (!(CORE_ECOLOGY_INDIVIDUAL_SPECIES as readonly CoreWildlifeSpecies[]).includes(
    candidate.species,
  )) throw new RangeError(`Alpine species ${candidate.species} has no individual representation`);
  const members = candidate.anchors.map((anchor, populationOrdinal) => Object.freeze({
    populationOrdinal,
    representedUnits: anchor.allocatedPopulation,
    position: createWorldPosition(
      region,
      anchor.localX * WORLD_POSITION_UNITS_PER_TILE
        + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
      anchor.localY * WORLD_POSITION_UNITS_PER_TILE
        + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    ),
    materialization: "coarse" as const,
  }));
  return Object.freeze([Object.freeze({
    species: candidate.species,
    populationKey: candidate.populationKey,
    populationSize: candidate.populationUnits,
    members: Object.freeze(members),
  })]);
}

function baselineGroupAuthority(seed: RootSeed, habitat: CoreEcologyAlpineHabitat) {
  const goat = habitat.populations.find(({ species, populationUnits }) => (
    species === "mountain-goat" && populationUnits > 0
  ));
  if (goat === undefined) return Object.freeze([]);
  const anchor = goat.anchors[0];
  if (anchor === undefined) return Object.freeze([]);
  const group = createCoreEcologyGroup({
    seed,
    species: "mountain-goat",
    originRegion: habitat.region,
    populationKey: goat.populationKey,
    groupOrdinal: 0,
    memberOrdinals: goat.anchors.map((_entry, ordinal) => ordinal),
    anchor: createWorldPosition(
      habitat.region,
      anchor.localX * WORLD_POSITION_UNITS_PER_TILE
        + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
      anchor.localY * WORLD_POSITION_UNITS_PER_TILE
        + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    ),
    tick: 0,
  });
  return Object.freeze([Object.freeze({
    identity: group.identity,
    memberOrdinals: group.memberOrdinals,
  })]);
}

function canonicalRegions(value: readonly RegionCoord[]): readonly RegionCoord[] {
  const byKey = new Map<string, RegionCoord>();
  for (const region of value) {
    if (!isRegionCoord(region)) throw new RangeError("Alpine resident region is malformed");
    const canonical = createRegionCoord(region.x, region.y);
    byKey.set(`${canonical.x}:${canonical.y}`, canonical);
  }
  return Object.freeze([...byKey.values()].sort((left, right) => (
    left.x - right.x || left.y - right.y
  )));
}

function rootSeed(value: unknown): value is RootSeed {
  return Array.isArray(value)
    && value.length === 4
    && value.every((word) => (
      Number.isSafeInteger(word)
      && word >= 0
      && word <= 0xffff_ffff
      && !Object.is(word, -0)
    ));
}

function requireTick(value: unknown): asserts value is number {
  if (
    !nonnegativeSafeInteger(value)
    || value > Number.MAX_SAFE_INTEGER - 64
  ) throw new RangeError("Alpine resident tick is outside the schedulable range");
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

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
  CORE_ECOLOGY_REGIONAL_ADOPTION_SUPPRESSION_VERSION,
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  stableCoreEcologyAggregatePopulationId,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
  type CoreEcologyRegionalAdoptionSuppressionManifestV1,
} from "./coreEcology";
import {
  CORE_ECOLOGY_GROUP_SPECIES,
  createCoreEcologyGroup,
  createCoreEcologyGroupSet,
  type CoreEcologyGroupState,
} from "./coreEcologyGroups";
import { isCoreEcologyAggregateSpecies } from "./coreEcologyAggregatePolicy";
import {
  deriveCoreEcologyRegionalHabitat,
  type CoreEcologyRegionalHabitat,
  type CoreEcologyRegionalPopulationAnchor,
  type CoreEcologyRegionalPopulationCandidate,
} from "./coreEcologyRegionalHabitat";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
} from "./worldPosition";
import {
  canonicalRegionalEcologyRootForWorld,
  type RegionalEcologyRootV1,
} from "./regionalEcology";

export const CORE_ECOLOGY_REGIONAL_RESIDENT_SET_VERSION = 1 as const;
export const CORE_ECOLOGY_REGIONAL_RESIDENT_SET_OWNER_ID =
  "game:core-ecology-regional-residents:v1" as const;

export interface CreateCoreEcologyRegionalResidentPatchInput {
  readonly seed: RootSeed;
  readonly habitat: CoreEcologyRegionalHabitat;
  readonly tick?: number;
}

export interface DeriveCoreEcologyRegionalResidentSetInput {
  readonly seed: RootSeed;
  readonly regions: readonly RegionCoord[];
  readonly tick?: number;
}

export interface CanonicalCoreEcologyRegionalResidentBinding {
  readonly seed: RootSeed;
  readonly region: RegionCoord;
  readonly completedTick: number;
}

export interface CreateCoreEcologyRegionalResidentPatchForRootInput {
  readonly seed: RootSeed;
  readonly root: RegionalEcologyRootV1;
  readonly region: RegionCoord;
}

export interface CanonicalCoreEcologyRegionalResidentForRootBinding
  extends CreateCoreEcologyRegionalResidentPatchForRootInput {
  readonly completedTick: number;
}

export interface CoreEcologyRegionalResidentSource {
  readonly sourceKey: string;
  readonly region: RegionCoord;
  readonly habitat: CoreEcologyRegionalHabitat;
  readonly patch: CoreEcologyAggregatePatchState;
}

/**
 * Pure derived view over occupied regional baselines. A lawful empty region
 * has no source entry and requires no persisted placeholder.
 */
export interface CoreEcologyRegionalResidentSet {
  readonly version: typeof CORE_ECOLOGY_REGIONAL_RESIDENT_SET_VERSION;
  readonly ownerId: typeof CORE_ECOLOGY_REGIONAL_RESIDENT_SET_OWNER_ID;
  readonly updatedAtTick: number;
  readonly residents: readonly CoreEcologyRegionalResidentSource[];
  readonly derivationHash: string;
}

/**
 * Converts one authenticated regional habitat record into its exact resident
 * patch. Every representative starts coarse; the global active-window owner
 * alone decides which whole groups become materialized.
 */
export function createCoreEcologyRegionalResidentPatch(
  input: CreateCoreEcologyRegionalResidentPatchInput,
): CoreEcologyAggregatePatchState {
  if (
    !plainRecord(input)
    || !rootSeed(input.seed)
    || !plainRecord(input.habitat)
    || !isRegionCoord(input.habitat.region)
    || !Array.isArray(input.habitat.populations)
  ) {
    throw new TypeError("Regional resident patch input is malformed");
  }
  const expectedHabitat = deriveCoreEcologyRegionalHabitat({
    seed: input.seed,
    region: input.habitat.region,
  });
  if (stableStringify(expectedHabitat) !== stableStringify(input.habitat)) {
    throw new RangeError("Regional resident habitat does not belong to the root seed");
  }
  const tick = input.tick ?? 0;
  requireTick(tick);
  const habitat = input.habitat;
  const individualPopulations = habitat.populations.flatMap((candidate) =>
    individualPopulation(candidate, habitat.region));
  const aggregateCount = habitat.populations.filter((candidate) =>
    candidate.populationUnits > 0 && isCoreEcologyAggregateSpecies(candidate.species)
  ).length;
  if (
    individualPopulations.length > CORE_ECOLOGY_MAX_POPULATIONS
    || aggregateCount > CORE_ECOLOGY_MAX_AGGREGATE_POPULATIONS
    || individualPopulations.reduce((sum, population) => sum + population.members.length, 0)
      > CORE_ECOLOGY_MAX_MEMBERS
  ) {
    throw new RangeError("Regional habitat exceeds the bounded resident-patch budget");
  }
  const sourceKey = coreEcologyRegionalResidentSourceKey(habitat);
  const groups = regionalGroups(
    input.seed,
    habitat,
    individualPopulations,
    tick,
  );
  return createCoreEcologyAggregatePatch({
    seed: input.seed,
    patchKey: sourceKey,
    originRegion: habitat.region,
    tick,
    derivation: { kind: "regional-habitat-v1", habitat },
    populations: individualPopulations,
    groups,
  });
}

/**
 * Derives the directly stepable baseline for one world-bound regional root.
 * A v24 adoption receipt replaces only its reserved unit intervals; every
 * other baseline unit keeps the ordinary regional identity and ordinal.
 */
export function createCoreEcologyRegionalResidentPatchForRoot(
  input: CreateCoreEcologyRegionalResidentPatchForRootInput,
): CoreEcologyAggregatePatchState | null {
  if (
    !plainRecord(input)
    || !exactKeys(input, ["region", "root", "seed"])
    || !rootSeed(input.seed)
    || !plainRecord(input.root)
    || !isRegionCoord(input.region)
  ) return null;
  const root = canonicalRegionalEcologyRootForWorld(input.root, {
    rootSeed: input.seed,
    completedTick: input.root.updatedAtTick,
  });
  if (root === null) return null;
  const habitat = deriveCoreEcologyRegionalHabitat({
    seed: input.seed,
    region: input.region,
  });
  const suppression = regionalAdoptionSuppression(root, habitat);
  if (suppression === false) return null;
  if (suppression === null) {
    return habitat.totalPopulationUnits === 0
      ? null
      : createCoreEcologyRegionalResidentPatch({
          seed: input.seed,
          habitat,
          tick: root.updatedAtTick,
        });
  }
  const individualPopulations = habitat.populations.flatMap((candidate) => (
    individualPopulation(candidate, habitat.region, suppression)
  ));
  const patch = createCoreEcologyAggregatePatch({
    seed: input.seed,
    patchKey: coreEcologyRegionalResidentSourceKey(habitat),
    originRegion: habitat.region,
    tick: root.updatedAtTick,
    derivation: {
      kind: "regional-habitat-v1-with-adoption-suppression",
      habitat,
      suppression,
    },
    groups: regionalGroups(input.seed, habitat, individualPopulations, root.updatedAtTick),
    populations: individualPopulations,
  });
  return patch.populations.length === 0 && patch.aggregatePopulations.length === 0
    ? null
    : patch;
}

/** Strict root/seed/tick validator for pristine or adoption-suppressed residents. */
export function canonicalCoreEcologyRegionalResidentPatchForRoot(
  value: unknown,
  binding: CanonicalCoreEcologyRegionalResidentForRootBinding,
): CoreEcologyAggregatePatchState | null {
  if (
    !plainRecord(binding)
    || !exactKeys(binding, ["completedTick", "region", "root", "seed"])
    || !rootSeed(binding.seed)
    || !plainRecord(binding.root)
    || !isRegionCoord(binding.region)
    || !Number.isSafeInteger(binding.completedTick)
    || binding.completedTick < 0
    || binding.root.updatedAtTick !== binding.completedTick
  ) return null;
  const root = canonicalRegionalEcologyRootForWorld(binding.root, {
    rootSeed: binding.seed,
    completedTick: binding.completedTick,
  });
  if (root === null) return null;
  const habitat = deriveCoreEcologyRegionalHabitat({ seed: binding.seed, region: binding.region });
  const suppression = regionalAdoptionSuppression(root, habitat);
  if (suppression === false) return null;
  if (suppression === null) {
    return canonicalCoreEcologyRegionalResidentPatch(value, binding);
  }
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    patch === null
    || stableStringify(patch) !== stableStringify(value)
    || patch.updatedAtTick !== binding.completedTick
    || patch.originRegion.x !== binding.region.x
    || patch.originRegion.y !== binding.region.y
    || patch.patchKey !== coreEcologyRegionalResidentSourceKey(habitat)
    || patch.derivation.kind !== "regional-habitat-v1-with-adoption-suppression"
    || stableStringify(patch.derivation.habitat) !== stableStringify(habitat)
    || stableStringify(patch.derivation.suppression) !== stableStringify(suppression)
  ) return null;
  if (!regionalResidentLineageMatchesWorld(patch, binding.seed, binding.region)) return null;
  const expectedInputs = habitat.populations.flatMap((candidate) => (
    individualPopulation(candidate, habitat.region, suppression)
  ));
  const expectedGroupAuthority = regionalGroups(
    binding.seed,
    habitat,
    expectedInputs,
    0,
  ).groups.map(({ identity, memberOrdinals }) => ({ identity, memberOrdinals }));
  const actualGroupAuthority = patch.groups.groups.map(({ identity, memberOrdinals }) => ({
    identity,
    memberOrdinals,
  }));
  return stableStringify(actualGroupAuthority) === stableStringify(expectedGroupAuthority)
    ? patch
    : null;
}

/**
 * Runtime/save boundary for one derived resident source. Generic patch
 * validity is insufficient here: the embedded habitat and every persistent
 * identity must belong to this exact world seed and signed region.
 */
export function canonicalCoreEcologyRegionalResidentPatch(
  value: unknown,
  binding: CanonicalCoreEcologyRegionalResidentBinding,
): CoreEcologyAggregatePatchState | null {
  if (
    !plainRecord(binding)
    || !rootSeed(binding.seed)
    || !isRegionCoord(binding.region)
    || !Number.isSafeInteger(binding.completedTick)
    || binding.completedTick < 0
  ) return null;
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    patch === null
    || patch.updatedAtTick !== binding.completedTick
    || (
      patch.derivation.kind !== "regional-habitat-v1"
      && patch.derivation.kind !== "regional-habitat-v1-with-adoption-suppression"
    )
    || patch.originRegion.x !== binding.region.x
    || patch.originRegion.y !== binding.region.y
  ) return null;
  const habitat = deriveCoreEcologyRegionalHabitat({
    seed: binding.seed,
    region: binding.region,
  });
  if (
    stableStringify(patch.derivation.habitat) !== stableStringify(habitat)
    || patch.patchKey !== coreEcologyRegionalResidentSourceKey(habitat)
  ) return null;
  for (const actor of [
    ...patch.populations.flatMap(({ members }) => members.map(({ actor }) => actor)),
    ...patch.mortalityTransactions.map(({ retiredActor }) => retiredActor),
  ]) {
    const expected = generateCoreWildlifeIdentity({
      seed: binding.seed,
      species: actor.identity.species,
      originRegion: binding.region,
      populationKey: actor.identity.populationKey,
      populationOrdinal: actor.identity.populationOrdinal,
    });
    if (stableStringify(actor.identity) !== stableStringify(expected)) return null;
  }
  for (const aggregate of patch.aggregatePopulations) {
    if (aggregate.aggregateId !== stableCoreEcologyAggregatePopulationId({
      seed: binding.seed,
      originRegion: binding.region,
      populationKey: aggregate.populationKey,
      species: aggregate.species,
    })) return null;
  }
  const seedFingerprint = regionalRootSeedFingerprint(binding.seed);
  if (patch.groups.groups.some(({ identity }) => (
    identity.seedFingerprint !== seedFingerprint
    || identity.originRegion.x !== binding.region.x
    || identity.originRegion.y !== binding.region.y
  ))) return null;
  const expectedGroupAuthority = regionalGroups(
    binding.seed,
    habitat,
    habitat.populations.flatMap((candidate) => individualPopulation(
      candidate,
      habitat.region,
      patch.derivation.kind === "regional-habitat-v1-with-adoption-suppression"
        ? patch.derivation.suppression
        : null,
    )),
    0,
  ).groups.map(({ identity, memberOrdinals }) => ({ identity, memberOrdinals }));
  const actualGroupAuthority = patch.groups.groups.map(({ identity, memberOrdinals }) => ({
    identity,
    memberOrdinals,
  }));
  if (stableStringify(actualGroupAuthority) !== stableStringify(expectedGroupAuthority)) return null;
  return patch;
}

/**
 * Derives a source-key-sorted, duplicate-free set from signed region
 * addresses. Region order, duplicate requests, player position, and camera
 * order cannot affect the result.
 */
export function deriveCoreEcologyRegionalResidentSet(
  input: DeriveCoreEcologyRegionalResidentSetInput,
): CoreEcologyRegionalResidentSet {
  if (
    !plainRecord(input)
    || !rootSeed(input.seed)
    || !Array.isArray(input.regions)
  ) throw new TypeError("Regional resident-set input is malformed");
  const tick = input.tick ?? 0;
  requireTick(tick);
  const regions = canonicalRegions(input.regions);
  const residents = regions.flatMap((region): CoreEcologyRegionalResidentSource[] => {
    const habitat = deriveCoreEcologyRegionalHabitat({ seed: input.seed, region });
    if (habitat.totalPopulationUnits === 0) return [];
    const patch = createCoreEcologyRegionalResidentPatch({
      seed: input.seed,
      habitat,
      tick,
    });
    return [deepFreeze({
      sourceKey: patch.patchKey,
      region: createRegionCoord(region.x, region.y),
      habitat,
      patch,
    })];
  }).sort((left, right) => compareText(left.sourceKey, right.sourceKey));
  const base = {
    version: CORE_ECOLOGY_REGIONAL_RESIDENT_SET_VERSION,
    ownerId: CORE_ECOLOGY_REGIONAL_RESIDENT_SET_OWNER_ID,
    updatedAtTick: tick,
    residents: Object.freeze(residents),
  };
  return deepFreeze({ ...base, derivationHash: hashCanonical(base) });
}

function regionalAdoptionSuppression(
  root: RegionalEcologyRootV1,
  habitat: CoreEcologyRegionalHabitat,
): CoreEcologyRegionalAdoptionSuppressionManifestV1 | null | false {
  const delta = root.regions.find(({ region }) => (
    region.x === habitat.region.x && region.y === habitat.region.y
  ));
  if (delta === undefined) return null;
  if (delta.baselineHash !== habitat.derivationHash) return false;
  if (
    delta.legacyPlacements.length === 0
    && delta.legacyAggregatePlacements.length === 0
  ) return null;
  if (
    root.adoption === null
    || root.legacyCohort === null
    || root.adoption.sourceCoreEcologyHash !== root.legacyCohort.sourcePatchHash
  ) return false;
  const actorSlots = delta.legacyPlacements.map((placement) => Object.freeze({
    baselineActorId: placement.baselineActorId,
    baselinePopulationId: placement.baselinePopulationId,
    baselineUnitOffset: placement.baselineUnitOffset,
    legacyActorId: placement.legacyActorId,
    species: placement.species as CoreWildlifeSpecies,
    suppressedBaselineUnits: placement.suppressedBaselineUnits,
  })).sort((left, right) => (
    compareText(left.baselinePopulationId, right.baselinePopulationId)
      || left.baselineUnitOffset - right.baselineUnitOffset
      || compareText(left.legacyActorId, right.legacyActorId)
  ));
  const aggregateSlots = delta.legacyAggregatePlacements.map((placement) => Object.freeze({
    baselinePopulationId: placement.baselinePopulationId,
    legacyAggregateId: placement.legacyAggregateId,
    species: placement.species as CoreWildlifeSpecies,
    suppressedBaselineUnits: placement.suppressedBaselineUnits,
  })).sort((left, right) => (
    compareText(left.baselinePopulationId, right.baselinePopulationId)
      || compareText(left.legacyAggregateId, right.legacyAggregateId)
  ));
  return deepFreeze({
    version: CORE_ECOLOGY_REGIONAL_ADOPTION_SUPPRESSION_VERSION,
    adoptionTransactionId: root.adoption.transactionId,
    sourcePatchHash: root.adoption.sourceCoreEcologyHash,
    baselineHash: habitat.derivationHash,
    actorSlots,
    aggregateSlots,
  });
}

function regionalResidentLineageMatchesWorld(
  patch: CoreEcologyAggregatePatchState,
  seed: RootSeed,
  region: RegionCoord,
): boolean {
  for (const actor of [
    ...patch.populations.flatMap(({ members }) => members.map(({ actor }) => actor)),
    ...patch.mortalityTransactions.map(({ retiredActor }) => retiredActor),
  ]) {
    const expected = generateCoreWildlifeIdentity({
      seed,
      species: actor.identity.species,
      originRegion: region,
      populationKey: actor.identity.populationKey,
      populationOrdinal: actor.identity.populationOrdinal,
    });
    if (stableStringify(actor.identity) !== stableStringify(expected)) return false;
  }
  for (const aggregate of patch.aggregatePopulations) {
    if (aggregate.aggregateId !== stableCoreEcologyAggregatePopulationId({
      seed,
      originRegion: region,
      populationKey: aggregate.populationKey,
      species: aggregate.species,
    })) return false;
  }
  const seedFingerprint = regionalRootSeedFingerprint(seed);
  return patch.groups.groups.every(({ identity }) => (
    identity.seedFingerprint === seedFingerprint
    && identity.originRegion.x === region.x
    && identity.originRegion.y === region.y
  ));
}

export function coreEcologyRegionalResidentSourceKey(
  habitat: Pick<CoreEcologyRegionalHabitat, "regionId">,
): string {
  if (
    !plainRecord(habitat)
    || typeof habitat.regionId !== "string"
    || habitat.regionId.length === 0
  ) throw new TypeError("Regional resident source requires a stable region identity");
  return `regional-habitat-v1:${hashCanonical({
    ownerId: CORE_ECOLOGY_REGIONAL_RESIDENT_SET_OWNER_ID,
    regionId: habitat.regionId,
  })}`;
}

function individualPopulation(
  candidate: CoreEcologyRegionalPopulationCandidate,
  region: RegionCoord,
  suppression: CoreEcologyRegionalAdoptionSuppressionManifestV1 | null = null,
): readonly CoreEcologyPopulationInput[] {
  if (candidate.populationUnits === 0 || isCoreEcologyAggregateSpecies(candidate.species)) {
    return Object.freeze([]);
  }
  if (!(CORE_ECOLOGY_INDIVIDUAL_SPECIES as readonly CoreWildlifeSpecies[]).includes(
    candidate.species,
  )) {
    throw new RangeError(
      `Regional species ${candidate.species} has no lawful resident representation`,
    );
  }
  if (candidate.anchors.length === 0) {
    throw new RangeError(`Regional species ${candidate.species} has no admitted anchors`);
  }
  const slots = suppression?.actorSlots.filter(({ baselinePopulationId }) => (
    baselinePopulationId === candidate.stableId
  )) ?? [];
  let anchorStart = 0;
  const members = candidate.anchors.flatMap((anchor, populationOrdinal) => {
    const anchorEnd = anchorStart + anchor.allocatedPopulation;
    let suppressedUnits = 0;
    for (const slot of slots) {
      const slotEnd = slot.baselineUnitOffset + slot.suppressedBaselineUnits;
      suppressedUnits += Math.max(
        0,
        Math.min(anchorEnd, slotEnd) - Math.max(anchorStart, slot.baselineUnitOffset),
      );
    }
    anchorStart = anchorEnd;
    const representedUnits = anchor.allocatedPopulation - suppressedUnits;
    return representedUnits === 0 ? [] : [Object.freeze({
      populationOrdinal,
      representedUnits,
      position: regionalAnchorPosition(region, anchor),
      materialization: "coarse" as const,
    })];
  });
  const populationSize = members.reduce((sum, member) => sum + member.representedUnits, 0);
  if (populationSize === 0) return Object.freeze([]);
  return Object.freeze([Object.freeze({
    species: candidate.species,
    populationKey: candidate.populationKey,
    populationSize,
    members: Object.freeze(members),
  })]);
}

function regionalGroups(
  seed: RootSeed,
  habitat: CoreEcologyRegionalHabitat,
  populations: readonly CoreEcologyPopulationInput[],
  tick: number,
) {
  const groups: CoreEcologyGroupState[] = [];
  for (const population of populations) {
    if (
      !(CORE_ECOLOGY_GROUP_SPECIES as readonly CoreWildlifeSpecies[]).includes(population.species)
      || population.members.length < 2
    ) continue;
    const anchor = population.members[0]?.position;
    if (anchor === undefined) continue;
    groups.push(createCoreEcologyGroup({
      seed,
      species: population.species,
      originRegion: habitat.region,
      populationKey: population.populationKey,
      groupOrdinal: 0,
      memberOrdinals: population.members.map(({ populationOrdinal }) => populationOrdinal),
      anchor,
      tick,
    }));
  }
  return createCoreEcologyGroupSet(groups);
}

function regionalAnchorPosition(
  region: RegionCoord,
  anchor: CoreEcologyRegionalPopulationAnchor,
) {
  return createWorldPosition(
    region,
    anchor.localX * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    anchor.localY * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
  );
}

function canonicalRegions(value: readonly RegionCoord[]): readonly RegionCoord[] {
  const byAddress = new Map<string, RegionCoord>();
  for (const region of value) {
    if (!isRegionCoord(region)) throw new RangeError("Regional resident address is invalid");
    const canonical = createRegionCoord(region.x, region.y);
    byAddress.set(`${canonical.x}:${canonical.y}`, canonical);
  }
  return Object.freeze([...byAddress.values()].sort((left, right) =>
    left.x - right.x || left.y - right.y));
}

function rootSeed(value: unknown): value is RootSeed {
  return Array.isArray(value)
    && value.length === 4
    && value.every((word) =>
      Number.isSafeInteger(word)
      && word >= 0
      && word <= 0xffff_ffff
      && !Object.is(word, -0));
}

function requireTick(value: unknown): asserts value is number {
  if (
    !Number.isSafeInteger(value)
    || (value as number) < 0
    || (value as number) > Number.MAX_SAFE_INTEGER - 64
    || Object.is(value, -0)
  ) throw new RangeError("Regional resident tick is outside the schedulable range");
}

function regionalRootSeedFingerprint(seed: RootSeed): string {
  return seed.map((word) => word.toString(36).padStart(7, "0")).join(".");
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

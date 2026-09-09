import {
  REGION_COORD_LIMIT,
  createRegionCoord,
  isRegionCoord,
  regionKey,
  stableRegionId,
  type RegionCoord,
} from "../sim/regions";
import type { RootSeed } from "../sim/rng";
import { hashCanonical, stableStringify } from "../sim/util";
import {
  generateCoreWildlifeIdentity,
  type CoreWildlifeSpecies,
} from "../sim/coreWildlifeIdentity";
import {
  canonicalizeCoreEcologyAggregatePatch,
  setCoreEcologyAggregatePatchMaterializedActors,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationState,
} from "./coreEcology";
import type { CoreWildlifeActorState } from "./coreWildlifeActor";
import {
  CORE_ECOLOGY_DOMESTIC_SPECIES,
  deriveCoreEcologyRegionalHabitat,
  type CoreEcologyRegionalHabitat,
  type CoreEcologyRegionalPopulationCandidate,
} from "./coreEcologyRegionalHabitat";
import {
  canonicalCoreEcologyRegionalResidentPatch,
  canonicalCoreEcologyRegionalResidentPatchForRoot,
  createCoreEcologyRegionalResidentPatch,
  createCoreEcologyRegionalResidentPatchForRoot,
} from "./regionalEcologyResidents";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  isWorldPosition,
  type WorldPosition,
} from "./worldPosition";

export const REGIONAL_ECOLOGY_ROOT_VERSION = 1 as const;
export const REGIONAL_ECOLOGY_ADOPTION_VERSION = 1 as const;
export const REGIONAL_ECOLOGY_LEGACY_COHORT_VERSION = 1 as const;
export const REGIONAL_ECOLOGY_REGION_DELTA_VERSION = 1 as const;
export const REGIONAL_ECOLOGY_RETIREMENT_VERSION = 1 as const;
export const REGIONAL_ECOLOGY_BASELINE_POLICY_ID = "open-country-ledger:v1" as const;
export const REGIONAL_ECOLOGY_ADOPTION_POLICY_ID = "v24-open-country-adoption:v1" as const;
export const REGIONAL_ECOLOGY_MAX_REGIONS = 131_072 as const;
export const REGIONAL_ECOLOGY_MAX_LEGACY_PLACEMENTS_PER_REGION = 48 as const;
export const REGIONAL_ECOLOGY_MAX_SERIALIZED_BYTES = 19 * 1_024 * 1_024;
export const REGIONAL_ECOLOGY_ADOPTION_SEARCH_RADIUS = 2 as const;

const UINT32_MAX = 0xffff_ffff;
const HASH_PATTERN = /^[0-9a-f]{16}$/u;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/+\-]{0,255}$/u;
const REGIONAL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/+\-]{0,511}$/u;
const TRANSACTION_ID_PATTERN = /^regional-ecology-adoption:[0-9a-f]{16}$/u;
const UTF8_ENCODER = new TextEncoder();
const TRUSTED_ROOTS = new WeakSet<object>();

export type RegionalEcologyDisposition = "retained" | "redistributed" | "retired";

export interface RegionalEcologyPopulationAccountingV1 {
  readonly species: string;
  readonly populationKey: string;
  readonly baselinePopulationSize: number;
  readonly sourcePopulationSize: number;
  readonly sourceReserveUnits: number;
  readonly sourceMemberUnits: number;
  readonly existingMortalityUnits: number;
  readonly adoptionRetiredUnits: number;
  readonly postAdoptionPopulationSize: number;
}

export interface RegionalEcologyActorDispositionV1 {
  readonly actorId: string;
  readonly species: string;
  readonly populationKey: string;
  readonly populationOrdinal: number;
  readonly representedUnits: number;
  readonly disposition: RegionalEcologyDisposition;
  readonly reason: "protected-authority-retained" | "v24-authority-retained" | "regional-capacity-placement" | "compatibility-retirement";
  readonly sourceStateHash: string;
  readonly sourcePosition: WorldPosition;
  readonly destinationPosition: WorldPosition | null;
  readonly suppressedBaselineUnits: number;
}

export interface RegionalEcologyGroupDispositionV1 {
  readonly groupId: string;
  readonly memberActorIds: readonly string[];
  readonly disposition: RegionalEcologyDisposition;
  readonly reason: "protected-authority-retained" | "v24-authority-retained" | "regional-capacity-placement" | "compatibility-retirement";
  readonly sourceStateHash: string;
  readonly destinationRegion: RegionCoord | null;
  readonly suppressedBaselineUnits: number;
}

export interface RegionalEcologyAggregateDispositionV1 {
  readonly aggregateId: string;
  readonly species: string;
  readonly populationKey: string;
  readonly sourcePopulationSize: number;
  readonly postAdoptionPopulationSize: number;
  readonly disposition: RegionalEcologyDisposition;
  readonly reason: "protected-authority-retained" | "v24-authority-retained" | "regional-capacity-placement" | "compatibility-retirement";
  readonly sourceStateHash: string;
  readonly destinationRegion: RegionCoord | null;
  readonly suppressedBaselineUnits: number;
}

/** A compatibility retirement is not mortality and never owns a physical body. */
export interface RegionalEcologyRetirementTombstoneV1 {
  readonly version: typeof REGIONAL_ECOLOGY_RETIREMENT_VERSION;
  readonly actorId: string;
  readonly species: string;
  readonly populationKey: string;
  readonly populationOrdinal: number;
  readonly representedUnits: number;
  readonly retiredAtTick: number;
  readonly reason: "compatibility-retirement";
  readonly mortalityEventId: null;
  readonly carcassId: null;
}

export interface RegionalEcologyAggregateRetirementTombstoneV1 {
  readonly version: typeof REGIONAL_ECOLOGY_RETIREMENT_VERSION;
  readonly aggregateId: string;
  readonly species: string;
  readonly populationKey: string;
  readonly representedUnits: number;
  readonly retiredAtTick: number;
  readonly reason: "compatibility-retirement";
  readonly mortalityEventId: null;
  readonly carcassId: null;
}

/**
 * The exact authenticated v24 patch remains a finite migration authority.
 * Future regional baselines never append members to this cohort.
 */
export interface RegionalEcologyLegacyCohortV1 {
  readonly version: typeof REGIONAL_ECOLOGY_LEGACY_COHORT_VERSION;
  readonly sourcePatchHash: string;
  readonly sourcePatch: CoreEcologyAggregatePatchState;
  readonly retirements: readonly RegionalEcologyRetirementTombstoneV1[];
  readonly aggregateRetirements: readonly RegionalEcologyAggregateRetirementTombstoneV1[];
}

/**
 * A later distribution pass can replace one derived baseline representative
 * with one preserved legacy identity without creating a second animal.
 */
export interface RegionalEcologyLegacyPlacementV1 {
  readonly baselineActorId: string;
  readonly baselinePopulationId: string;
  readonly baselineUnitOffset: number;
  readonly legacyActorId: string;
  readonly species: string;
  readonly populationKey: string;
  readonly destinationPosition: WorldPosition;
  readonly suppressedBaselineUnits: number;
}

export interface RegionalEcologyLegacyAggregatePlacementV1 {
  readonly baselinePopulationId: string;
  readonly legacyAggregateId: string;
  readonly species: string;
  readonly populationKey: string;
  readonly destinationRegion: RegionCoord;
  readonly suppressedBaselineUnits: number;
}

/** Sparse index: a pristine or honestly empty region has no record at all. */
export interface RegionalEcologyRegionDeltaV1 {
  readonly version: typeof REGIONAL_ECOLOGY_REGION_DELTA_VERSION;
  readonly region: RegionCoord;
  readonly key: string;
  readonly regionId: string;
  readonly baselineHash: string;
  readonly revision: number;
  readonly eventOrdinal: number;
  readonly legacyPlacements: readonly RegionalEcologyLegacyPlacementV1[];
  readonly legacyAggregatePlacements: readonly RegionalEcologyLegacyAggregatePlacementV1[];
  readonly baselineSuppressedUnits: number;
  readonly residentPatch: CoreEcologyAggregatePatchState | null;
  readonly residentPatchHash: string | null;
  readonly integrity: string;
}

export interface RegionalEcologyAdoptionReceiptV1 {
  readonly version: typeof REGIONAL_ECOLOGY_ADOPTION_VERSION;
  readonly status: "committed";
  readonly transactionId: string;
  readonly policyId: typeof REGIONAL_ECOLOGY_ADOPTION_POLICY_ID;
  readonly sourceOuterVersion: 24;
  readonly sourceEnvelopeIntegrity: string;
  readonly sourceCoreEcologyHash: string;
  readonly rootSeedFingerprint: string;
  readonly sourceCompletedTick: number;
  readonly protectedActorIds: readonly string[];
  readonly protectedAggregateIds: readonly string[];
  readonly populationAccounting: readonly RegionalEcologyPopulationAccountingV1[];
  readonly actorDispositions: readonly RegionalEcologyActorDispositionV1[];
  readonly groupDispositions: readonly RegionalEcologyGroupDispositionV1[];
  readonly aggregateDispositions: readonly RegionalEcologyAggregateDispositionV1[];
  readonly sourceGroupsHash: string;
  readonly sourceMortalityHash: string;
  readonly sourceBodiesHash: string;
  readonly resultEcologyStateHash: string;
  readonly integrity: string;
}

export interface RegionalEcologyRootV1 {
  readonly version: typeof REGIONAL_ECOLOGY_ROOT_VERSION;
  readonly ownerId: "regional-ecology-root:v1";
  readonly generationVersion: 1;
  readonly baselinePolicyId: typeof REGIONAL_ECOLOGY_BASELINE_POLICY_ID;
  readonly seedFingerprint: string;
  readonly updatedAtTick: number;
  readonly revision: number;
  readonly lastEventOrdinal: number;
  readonly adoption: RegionalEcologyAdoptionReceiptV1 | null;
  readonly legacyCohort: RegionalEcologyLegacyCohortV1 | null;
  readonly regions: readonly RegionalEcologyRegionDeltaV1[];
  readonly integrity: string;
}

export interface RegionalEcologyWorldBinding {
  readonly rootSeed: RootSeed;
  readonly completedTick: number;
}

export interface AdoptRegionalEcologyV24Input extends RegionalEcologyWorldBinding {
  readonly sourceEnvelopeIntegrity: string;
  /** The caller must already have authenticated this through the frozen v24 runtime owner. */
  readonly legacyPatch: CoreEcologyAggregatePatchState;
  /** Sorted/unique after validation; every referenced ID must belong to the patch. */
  readonly protectedActorIds?: readonly string[];
  readonly protectedAggregateIds?: readonly string[];
}

export interface CreateRegionalEcologyRegionDeltaInput {
  readonly rootSeed: RootSeed;
  readonly region: RegionCoord;
  readonly baselineHash: string;
  readonly revision: number;
  readonly eventOrdinal: number;
  readonly legacyPlacements: readonly RegionalEcologyLegacyPlacementV1[];
  readonly legacyAggregatePlacements?: readonly RegionalEcologyLegacyAggregatePlacementV1[];
  readonly residentPatch?: CoreEcologyAggregatePatchState | null;
}

export interface PutRegionalEcologyResidentDeviationInput {
  readonly rootSeed: RootSeed;
  readonly patch: CoreEcologyAggregatePatchState;
}

/**
 * A pristine root is a sparse overlay, not an empty wildlife roster. Runtime
 * derives the policy's regional-habitat-v1 wild baseline from stable
 * world/region/terrain inputs. Settlement owners derive their separately
 * authenticated domestic homes; domestic actors never enter the wild regional
 * generator. Only divergence belongs here, so a fresh save stores neither a
 * fabricated v24 adoption nor a copy of either reproducible baseline.
 */
export function createPristineRegionalEcologyRoot(
  binding: RegionalEcologyWorldBinding,
): RegionalEcologyRootV1 {
  requireBinding(binding);
  return sealRoot({
    version: REGIONAL_ECOLOGY_ROOT_VERSION,
    ownerId: "regional-ecology-root:v1",
    generationVersion: 1,
    baselinePolicyId: REGIONAL_ECOLOGY_BASELINE_POLICY_ID,
    seedFingerprint: seedFingerprint(binding.rootSeed),
    updatedAtTick: binding.completedTick,
    revision: 0,
    lastEventOrdinal: 0,
    adoption: null,
    legacyCohort: null,
    regions: [],
  });
}

/** Exact-once, group-atomic adoption of the authenticated v24 ecology owner. */
export function adoptRegionalEcologyFromV24(
  input: AdoptRegionalEcologyV24Input,
): RegionalEcologyRootV1 {
  requireBinding(input);
  if (!validHash(input.sourceEnvelopeIntegrity)) {
    throw new TypeError("Regional ecology adoption requires the authenticated v24 envelope seal");
  }
  const patch = canonicalizeCoreEcologyAggregatePatch(input.legacyPatch);
  if (
    patch === null
    || stableStringify(patch) !== stableStringify(input.legacyPatch)
    || patch.updatedAtTick !== input.completedTick
    || !legacyPatchMatchesSeed(patch, input.rootSeed)
  ) throw new TypeError("Regional ecology adoption requires an exact canonical v24 patch");

  const sourcePatchHash = hashCanonical(patch);
  const protectedActorIds = canonicalOwnedIds(
    input.protectedActorIds ?? [],
    new Set(patch.populations.flatMap((population) => (
      population.members.map(({ actor }) => actor.identity.stableId)
    ))),
    "actor",
  );
  const protectedAggregateIds = canonicalOwnedIds(
    input.protectedAggregateIds ?? [],
    new Set(patch.aggregatePopulations.map(({ aggregateId }) => aggregateId)),
    "aggregate",
  );
  const plan = deriveV24AdoptionPlan(
    patch,
    input.rootSeed,
    new Set(protectedActorIds),
    new Set(protectedAggregateIds),
  );
  const cohort: RegionalEcologyLegacyCohortV1 = deepFreeze({
    version: REGIONAL_ECOLOGY_LEGACY_COHORT_VERSION,
    sourcePatchHash,
    sourcePatch: patch,
    retirements: plan.retirements,
    aggregateRetirements: plan.aggregateRetirements,
  });
  const populationAccountingRecords = patch.populations.map((population) => (
    populationAccounting(population, plan.retirements
      .filter(({ populationKey }) => populationKey === population.populationKey)
      .reduce((sum, entry) => sum + entry.representedUnits, 0))
  ));
  const resultEcologyStateHash = adoptionResultHash(cohort, plan.regions);
  const receiptBase: Omit<RegionalEcologyAdoptionReceiptV1, "integrity"> = {
    version: REGIONAL_ECOLOGY_ADOPTION_VERSION,
    status: "committed",
    transactionId: `regional-ecology-adoption:${hashCanonical({
      completedTick: input.completedTick,
      policyId: REGIONAL_ECOLOGY_ADOPTION_POLICY_ID,
      rootSeedFingerprint: seedFingerprint(input.rootSeed),
      sourceCoreEcologyHash: sourcePatchHash,
      sourceEnvelopeIntegrity: input.sourceEnvelopeIntegrity,
      protectedActorIds,
      protectedAggregateIds,
    })}`,
    policyId: REGIONAL_ECOLOGY_ADOPTION_POLICY_ID,
    sourceOuterVersion: 24,
    sourceEnvelopeIntegrity: input.sourceEnvelopeIntegrity,
    sourceCoreEcologyHash: sourcePatchHash,
    rootSeedFingerprint: seedFingerprint(input.rootSeed),
    sourceCompletedTick: input.completedTick,
    protectedActorIds,
    protectedAggregateIds,
    populationAccounting: populationAccountingRecords,
    actorDispositions: plan.actorDispositions,
    groupDispositions: plan.groupDispositions,
    aggregateDispositions: plan.aggregateDispositions,
    sourceGroupsHash: hashCanonical(patch.groups),
    sourceMortalityHash: hashCanonical({
      nextMortalityOrdinal: patch.nextMortalityOrdinal,
      mortalityTransactions: patch.mortalityTransactions,
    }),
    sourceBodiesHash: hashCanonical(patch.carcasses),
    resultEcologyStateHash,
  };
  const adoption = deepFreeze({
    ...receiptBase,
    integrity: hashCanonical(receiptBase),
  });
  return sealRoot({
    version: REGIONAL_ECOLOGY_ROOT_VERSION,
    ownerId: "regional-ecology-root:v1",
    generationVersion: 1,
    baselinePolicyId: REGIONAL_ECOLOGY_BASELINE_POLICY_ID,
    seedFingerprint: seedFingerprint(input.rootSeed),
    updatedAtTick: input.completedTick,
    revision: 1,
    lastEventOrdinal: 1,
    adoption,
    legacyCohort: cohort,
    regions: plan.regions,
  });
}

interface RegionalCapacityReservation {
  readonly region: RegionCoord;
  readonly habitat: CoreEcologyRegionalHabitat;
  readonly population: CoreEcologyRegionalPopulationCandidate;
  readonly startUnit: number;
  readonly units: number;
}

interface RegionalDeltaDraft {
  readonly habitat: CoreEcologyRegionalHabitat;
  readonly actorPlacements: RegionalEcologyLegacyPlacementV1[];
  readonly aggregatePlacements: RegionalEcologyLegacyAggregatePlacementV1[];
}

interface RegionalAdoptionPlan {
  readonly actorDispositions: readonly RegionalEcologyActorDispositionV1[];
  readonly groupDispositions: readonly RegionalEcologyGroupDispositionV1[];
  readonly aggregateDispositions: readonly RegionalEcologyAggregateDispositionV1[];
  readonly retirements: readonly RegionalEcologyRetirementTombstoneV1[];
  readonly aggregateRetirements: readonly RegionalEcologyAggregateRetirementTombstoneV1[];
  readonly regions: readonly RegionalEcologyRegionDeltaV1[];
}

function deriveV24AdoptionPlan(
  patch: CoreEcologyAggregatePatchState,
  rootSeed: RootSeed,
  externallyProtectedActors: ReadonlySet<string>,
  externallyProtectedAggregates: ReadonlySet<string>,
): RegionalAdoptionPlan {
  const habitatCache = new Map<string, CoreEcologyRegionalHabitat>();
  const consumedCapacity = new Map<string, number>();
  const deltaDrafts = new Map<string, RegionalDeltaDraft>();
  const actors: RegionalEcologyActorDispositionV1[] = [];
  const groups: RegionalEcologyGroupDispositionV1[] = [];
  const aggregates: RegionalEcologyAggregateDispositionV1[] = [];
  const retirements: RegionalEcologyRetirementTombstoneV1[] = [];
  const aggregateRetirements: RegionalEcologyAggregateRetirementTombstoneV1[] = [];
  const groupedActorIds = new Set<string>();
  const actorByOrdinal = legacyActorByPopulationOrdinal(patch);
  const actorOwner = new Map(patch.populations.flatMap((population) => (
    population.members.map((member) => [member.actor.identity.stableId, {
      population,
      member,
    }] as const)
  )));
  const claimedActorIds = new Set(patch.carcasses.flatMap((carcass) => (
    carcass.currentClaimantActorId === null ? [] : [carcass.currentClaimantActorId]
  )));
  const mortalityActorIds = new Set(patch.mortalityTransactions.flatMap(({ event }) => (
    [event.attackerId, event.victimId]
  )));

  const habitatFor = (region: RegionCoord): CoreEcologyRegionalHabitat => {
    const key = regionKey(region);
    const existing = habitatCache.get(key);
    if (existing !== undefined) return existing;
    const habitat = deriveCoreEcologyRegionalHabitat({ seed: rootSeed, region });
    habitatCache.set(key, habitat);
    return habitat;
  };
  const reserveAt = (
    species: CoreWildlifeSpecies,
    representation: "aggregate" | "individual",
    region: RegionCoord,
    requestedUnits: number,
    allowPartial: boolean,
  ): RegionalCapacityReservation | null => {
    if (CORE_ECOLOGY_DOMESTIC_SPECIES.includes(species)) return null;
    const habitat = habitatFor(region);
    const population = habitat.populations.find((candidate) => (
      candidate.species === species && candidate.actorRepresentation === representation
    ));
    if (population === undefined || population.populationUnits === 0) return null;
    const capacityKey = `${habitat.regionId.length}:${habitat.regionId}:${species}`;
    const startUnit = consumedCapacity.get(capacityKey) ?? 0;
    const available = population.populationUnits - startUnit;
    const units = allowPartial ? Math.min(requestedUnits, available) : requestedUnits;
    if (units <= 0 || available < units) return null;
    consumedCapacity.set(capacityKey, startUnit + units);
    return { region: copyRegion(region), habitat, population, startUnit, units };
  };
  const reserve = (
    species: CoreWildlifeSpecies,
    representation: "aggregate" | "individual",
    units: number,
    sourceRegion: RegionCoord,
    decisionKey: string,
    protectedAuthority: boolean,
  ): Readonly<{ reservation: RegionalCapacityReservation | null; disposition: RegionalEcologyDisposition }> => {
    const source = reserveAt(species, representation, sourceRegion, units, protectedAuthority);
    if (protectedAuthority) return { reservation: source, disposition: "retained" };
    if (source?.units === units) return { reservation: source, disposition: "retained" };
    for (const region of adoptionSearchRegions(sourceRegion, decisionKey)) {
      if (regionKey(region) === regionKey(sourceRegion)) continue;
      const destination = reserveAt(species, representation, region, units, false);
      if (destination !== null) return { reservation: destination, disposition: "redistributed" };
    }
    return { reservation: null, disposition: "retired" };
  };
  const addActorPlacement = (
    reservation: RegionalCapacityReservation,
    actorId: string,
    species: string,
    populationKey: string,
    unitOffset: number,
    units: number,
    destinationPosition: WorldPosition,
  ): void => {
    if (units === 0) return;
    const key = regionKey(reservation.region);
    const draft = deltaDrafts.get(key) ?? {
      habitat: reservation.habitat,
      actorPlacements: [],
      aggregatePlacements: [],
    };
    draft.actorPlacements.push(deepFreeze({
      baselineActorId: regionalEcologyBaselineSlotId(
        reservation.population.stableId,
        unitOffset,
        units,
      ),
      baselinePopulationId: reservation.population.stableId,
      baselineUnitOffset: unitOffset,
      legacyActorId: actorId,
      species,
      populationKey,
      destinationPosition: copyPosition(destinationPosition),
      suppressedBaselineUnits: units,
    }));
    deltaDrafts.set(key, draft);
  };
  const addAggregatePlacement = (
    reservation: RegionalCapacityReservation,
    aggregateId: string,
    species: string,
    populationKey: string,
  ): void => {
    if (reservation.units === 0) return;
    const key = regionKey(reservation.region);
    const draft = deltaDrafts.get(key) ?? {
      habitat: reservation.habitat,
      actorPlacements: [],
      aggregatePlacements: [],
    };
    draft.aggregatePlacements.push(deepFreeze({
      baselinePopulationId: reservation.population.stableId,
      legacyAggregateId: aggregateId,
      species,
      populationKey,
      destinationRegion: copyRegion(reservation.region),
      suppressedBaselineUnits: reservation.units,
    }));
    deltaDrafts.set(key, draft);
  };
  const actorProtected = (actor: CoreWildlifeActorState): boolean => (
    externallyProtectedActors.has(actor.identity.stableId)
    || CORE_ECOLOGY_DOMESTIC_SPECIES.includes(actor.identity.species)
    || actor.address.persistence === "promoted"
    || actor.memories.length > 0
    || actor.perception.beliefs.length > 0
    || actor.perception.attentionKeys.length > 0
    || actor.perception.salientMemory.length > 0
    || actor.perception.search !== null
    || actor.perception.suspicion !== "unaware"
    || actor.perception.suspicionPressure > 0
    || actor.intent.cause.kind !== "condition"
    || actor.intent.focusObservationId !== null
    || actor.intent.resourceReference !== null
    || actor.condition.health < 1_000_000
    || actor.condition.exhaustion > 0
    || actor.condition.stress > 0
    || claimedActorIds.has(actor.identity.stableId)
    || mortalityActorIds.has(actor.identity.stableId)
  );

  for (const group of [...patch.groups.groups].sort((left, right) => (
    compareText(left.identity.stableId, right.identity.stableId)
  ))) {
    const owned = group.memberOrdinals.map((ordinal) => actorByOrdinal.get(
      populationOrdinalKey(group.identity.populationKey, ordinal),
    ));
    if (owned.some((actor) => actor === undefined)) {
      throw new Error("Canonical v24 group lost a member during regional adoption");
    }
    const members = owned as readonly CoreWildlifeActorState[];
    for (const actor of members) groupedActorIds.add(actor.identity.stableId);
    const units = members.reduce((sum, actor) => (
      sum + (actorOwner.get(actor.identity.stableId)?.member.representedUnits ?? 0)
    ), 0);
    const memberRegions = new Map(members.map(({ address }) => (
      [regionKey(address.position.region), address.position.region] as const
    )));
    const protectedAuthority = groupIsProtected(group)
      || members.some(actorProtected)
      || memberRegions.size !== 1;
    const sourceRegion = memberRegions.size === 1
      ? copyRegion(memberRegions.values().next().value as RegionCoord)
      : group.identity.originRegion;
    const choice = memberRegions.size !== 1
      ? { reservation: null, disposition: "retained" as const }
      : reserve(
          group.identity.species,
          "individual",
          units,
          sourceRegion,
          group.identity.stableId,
          protectedAuthority,
        );
    let reservationOffset = 0;
    for (const actor of members) {
      const owner = actorOwner.get(actor.identity.stableId)!;
      const suppressible = choice.reservation === null ? 0 : Math.min(
        owner.member.representedUnits,
        choice.reservation.units - reservationOffset,
      );
      const destination = choice.disposition === "retired"
        ? null
        : choice.disposition === "redistributed" && choice.reservation !== null
          ? reservationPosition(choice.reservation, reservationOffset)
          : actor.address.position;
      if (choice.reservation !== null && suppressible > 0 && destination !== null) {
        addActorPlacement(
          choice.reservation,
          actor.identity.stableId,
          owner.population.species,
          owner.population.populationKey,
          choice.reservation.startUnit + reservationOffset,
          suppressible,
          destination,
        );
      }
      actors.push(actorDisposition(
        owner.population,
        owner.member,
        choice.disposition,
        protectedAuthority,
        destination,
        suppressible,
      ));
      if (choice.disposition === "retired") {
        retirements.push(actorRetirement(owner.population, owner.member, patch.updatedAtTick));
      }
      reservationOffset += suppressible;
    }
    groups.push(deepFreeze({
      groupId: group.identity.stableId,
      memberActorIds: members.map(({ identity }) => identity.stableId).sort(compareText),
      disposition: choice.disposition,
      reason: dispositionReason(choice.disposition, protectedAuthority),
      sourceStateHash: hashCanonical(group),
      destinationRegion: choice.disposition === "retired"
        ? null
        : copyRegion(choice.reservation?.region ?? sourceRegion),
      suppressedBaselineUnits: choice.reservation?.units ?? 0,
    }));
  }

  const ungrouped = [...actorOwner.values()].filter(({ member }) => (
    !groupedActorIds.has(member.actor.identity.stableId)
  )).sort((left, right) => compareText(
    left.member.actor.identity.stableId,
    right.member.actor.identity.stableId,
  ));
  for (const { population, member } of ungrouped) {
    const actor = member.actor;
    const protectedAuthority = actorProtected(actor);
    const choice = reserve(
      population.species,
      "individual",
      member.representedUnits,
      actor.address.position.region,
      actor.identity.stableId,
      protectedAuthority,
    );
    const suppressed = choice.reservation?.units ?? 0;
    const destination = choice.disposition === "retired"
      ? null
      : choice.disposition === "redistributed" && choice.reservation !== null
        ? reservationPosition(choice.reservation, 0)
        : actor.address.position;
    if (choice.reservation !== null && destination !== null) {
      addActorPlacement(
        choice.reservation,
        actor.identity.stableId,
        population.species,
        population.populationKey,
        choice.reservation.startUnit,
        suppressed,
        destination,
      );
    }
    actors.push(actorDisposition(
      population,
      member,
      choice.disposition,
      protectedAuthority,
      destination,
      suppressed,
    ));
    if (choice.disposition === "retired") {
      retirements.push(actorRetirement(population, member, patch.updatedAtTick));
    }
  }

  for (const aggregate of [...patch.aggregatePopulations].sort(compareAggregateDispositionSource)) {
    const protectedAuthority = externallyProtectedAggregates.has(aggregate.aggregateId)
      || aggregate.revision > 0
      || aggregate.evidence.length > 0
      || aggregate.disturbances.length > 0;
    const sourceRegion = aggregate.anchors[0]?.position.region ?? patch.originRegion;
    const choice = reserve(
      aggregate.species,
      "aggregate",
      aggregate.populationSize,
      sourceRegion,
      aggregate.aggregateId,
      protectedAuthority,
    );
    const suppressed = choice.reservation?.units ?? 0;
    if (choice.reservation !== null) {
      addAggregatePlacement(
        choice.reservation,
        aggregate.aggregateId,
        aggregate.species,
        aggregate.populationKey,
      );
    }
    aggregates.push(deepFreeze({
      aggregateId: aggregate.aggregateId,
      species: aggregate.species,
      populationKey: aggregate.populationKey,
      sourcePopulationSize: aggregate.populationSize,
      postAdoptionPopulationSize: choice.disposition === "retired" ? 0 : aggregate.populationSize,
      disposition: choice.disposition,
      reason: dispositionReason(choice.disposition, protectedAuthority),
      sourceStateHash: hashCanonical(aggregate),
      destinationRegion: choice.disposition === "retired"
        ? null
        : copyRegion(choice.reservation?.region ?? sourceRegion),
      suppressedBaselineUnits: suppressed,
    }));
    if (choice.disposition === "retired") {
      aggregateRetirements.push(deepFreeze({
        version: REGIONAL_ECOLOGY_RETIREMENT_VERSION,
        aggregateId: aggregate.aggregateId,
        species: aggregate.species,
        populationKey: aggregate.populationKey,
        representedUnits: aggregate.populationSize,
        retiredAtTick: patch.updatedAtTick,
        reason: "compatibility-retirement",
        mortalityEventId: null,
        carcassId: null,
      }));
    }
  }

  const regions = [...deltaDrafts.values()].map((draft) => createRegionalEcologyRegionDelta({
    rootSeed,
    region: draft.habitat.region,
    baselineHash: draft.habitat.derivationHash,
    revision: 1,
    eventOrdinal: 1,
    legacyPlacements: draft.actorPlacements,
    legacyAggregatePlacements: draft.aggregatePlacements,
  })).sort((left, right) => compareText(left.key, right.key));
  return deepFreeze({
    actorDispositions: actors.sort(compareActorDisposition),
    groupDispositions: groups.sort(compareGroupDisposition),
    aggregateDispositions: aggregates.sort(compareAggregateDisposition),
    retirements: retirements.sort((left, right) => compareText(left.actorId, right.actorId)),
    aggregateRetirements: aggregateRetirements.sort((left, right) => (
      compareText(left.aggregateId, right.aggregateId)
    )),
    regions,
  });
}

function adoptionSearchRegions(source: RegionCoord, decisionKey: string): readonly RegionCoord[] {
  const candidates: RegionCoord[] = [];
  for (let y = -REGIONAL_ECOLOGY_ADOPTION_SEARCH_RADIUS; y <= REGIONAL_ECOLOGY_ADOPTION_SEARCH_RADIUS; y += 1) {
    for (let x = -REGIONAL_ECOLOGY_ADOPTION_SEARCH_RADIUS; x <= REGIONAL_ECOLOGY_ADOPTION_SEARCH_RADIUS; x += 1) {
      const candidateX = source.x + x;
      const candidateY = source.y + y;
      if (
        candidateX < -REGION_COORD_LIMIT || candidateX > REGION_COORD_LIMIT
        || candidateY < -REGION_COORD_LIMIT || candidateY > REGION_COORD_LIMIT
      ) continue;
      candidates.push(createRegionCoord(candidateX, candidateY));
    }
  }
  return Object.freeze(candidates.sort((left, right) => {
    const leftDistance = Math.abs(left.x - source.x) + Math.abs(left.y - source.y);
    const rightDistance = Math.abs(right.x - source.x) + Math.abs(right.y - source.y);
    return leftDistance - rightDistance
      || compareText(hashCanonical([decisionKey, left]), hashCanonical([decisionKey, right]))
      || left.x - right.x
      || left.y - right.y;
  }));
}

function reservationPosition(
  reservation: RegionalCapacityReservation,
  relativeUnit: number,
): WorldPosition {
  let unit = reservation.startUnit + relativeUnit;
  for (const anchor of reservation.population.anchors) {
    if (unit < anchor.allocatedPopulation) {
      return createWorldPosition(
        reservation.region,
        anchor.localX * WORLD_POSITION_UNITS_PER_TILE + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
        anchor.localY * WORLD_POSITION_UNITS_PER_TILE + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
      );
    }
    unit -= anchor.allocatedPopulation;
  }
  throw new Error("Regional capacity reservation lost its canonical anchor");
}

export function regionalEcologyBaselineSlotId(
  populationId: string,
  startUnit: number,
  units: number,
): string {
  if (!validRegionalId(populationId) || !nonnegativeSafeInteger(startUnit) || !positiveSafeInteger(units)) {
    throw new RangeError("Regional ecology baseline slot address is malformed");
  }
  return `regional-baseline-slot:${hashCanonical([populationId, startUnit, units])}`;
}

function dispositionReason(
  disposition: RegionalEcologyDisposition,
  protectedAuthority: boolean,
): RegionalEcologyActorDispositionV1["reason"] {
  if (disposition === "retired") return "compatibility-retirement";
  if (disposition === "redistributed") return "regional-capacity-placement";
  return protectedAuthority ? "protected-authority-retained" : "v24-authority-retained";
}

function actorDisposition(
  population: CoreEcologyPopulationState,
  member: CoreEcologyPopulationState["members"][number],
  disposition: RegionalEcologyDisposition,
  protectedAuthority: boolean,
  destinationPosition: WorldPosition | null,
  suppressedBaselineUnits: number,
): RegionalEcologyActorDispositionV1 {
  return deepFreeze({
    actorId: member.actor.identity.stableId,
    species: population.species,
    populationKey: population.populationKey,
    populationOrdinal: member.populationOrdinal,
    representedUnits: member.representedUnits,
    disposition,
    reason: dispositionReason(disposition, protectedAuthority),
    sourceStateHash: hashCanonical(member.actor),
    sourcePosition: copyPosition(member.actor.address.position),
    destinationPosition: destinationPosition === null ? null : copyPosition(destinationPosition),
    suppressedBaselineUnits,
  });
}

function actorRetirement(
  population: CoreEcologyPopulationState,
  member: CoreEcologyPopulationState["members"][number],
  tick: number,
): RegionalEcologyRetirementTombstoneV1 {
  return deepFreeze({
    version: REGIONAL_ECOLOGY_RETIREMENT_VERSION,
    actorId: member.actor.identity.stableId,
    species: population.species,
    populationKey: population.populationKey,
    populationOrdinal: member.populationOrdinal,
    representedUnits: member.representedUnits,
    retiredAtTick: tick,
    reason: "compatibility-retirement",
    mortalityEventId: null,
    carcassId: null,
  });
}

function groupIsProtected(group: CoreEcologyAggregatePatchState["groups"]["groups"][number]): boolean {
  return group.revision > 0
    || group.phase !== "cohesive"
    || group.signals.length > 0
    || group.aftermath.length > 0
    || group.lineage.length > 1;
}

function canonicalOwnedIds(
  values: readonly string[],
  owned: ReadonlySet<string>,
  label: string,
): readonly string[] {
  if (!Array.isArray(values)) throw new TypeError(`Protected ${label} IDs must be an array`);
  const result = [...values].sort(compareText);
  if (result.some((id) => !validId(id) || !owned.has(id)) || !uniqueOrdered(result, compareText)) {
    throw new TypeError(`Protected ${label} IDs must be unique owned IDs`);
  }
  return Object.freeze(result);
}

function compareAggregateDispositionSource(
  left: CoreEcologyAggregatePatchState["aggregatePopulations"][number],
  right: CoreEcologyAggregatePatchState["aggregatePopulations"][number],
): number {
  return compareText(left.aggregateId, right.aggregateId);
}

export function createRegionalEcologyRegionDelta(
  input: CreateRegionalEcologyRegionDeltaInput,
): RegionalEcologyRegionDeltaV1 {
  requireRootSeed(input.rootSeed);
  if (
    !isRegionCoord(input.region)
    || !validHash(input.baselineHash)
    || !positiveSafeInteger(input.revision)
    || !positiveSafeInteger(input.eventOrdinal)
    || !Array.isArray(input.legacyPlacements)
  ) throw new RangeError("Regional ecology refuses a malformed or no-op region delta");
  const aggregateInput = input.legacyAggregatePlacements ?? [];
  const residentPatch = canonicalResidentDeviationForWorld(
    input.residentPatch ?? null,
    input.rootSeed,
    input.region,
    input.baselineHash,
  );
  if (input.residentPatch !== undefined && input.residentPatch !== null && residentPatch === null) {
    throw new RangeError("Regional ecology resident deviation is malformed");
  }
  if (
    !Array.isArray(aggregateInput)
    || (
      input.legacyPlacements.length + aggregateInput.length === 0
      && residentPatch === null
    )
    || input.legacyPlacements.length + aggregateInput.length
      > REGIONAL_ECOLOGY_MAX_LEGACY_PLACEMENTS_PER_REGION
  ) throw new RangeError("Regional ecology refuses a malformed or no-op region delta");
  const placements = canonicalPlacements(input.legacyPlacements, input.region);
  const aggregatePlacements = canonicalAggregatePlacements(aggregateInput, input.region);
  if (placements === null || aggregatePlacements === null) {
    throw new RangeError("Regional ecology placement delta is malformed");
  }
  const habitat = deriveCoreEcologyRegionalHabitat({ seed: input.rootSeed, region: input.region });
  if (
    input.baselineHash !== habitat.derivationHash
    || !regionalPlacementsMatchBaseline(habitat, placements, aggregatePlacements)
  ) throw new RangeError("Regional ecology placement does not match its regional baseline");
  const baselineSuppressedUnits = [...placements, ...aggregatePlacements].reduce(
    (sum, placement) => sum + placement.suppressedBaselineUnits,
    0,
  );
  const base = {
    version: REGIONAL_ECOLOGY_REGION_DELTA_VERSION,
    region: copyRegion(input.region),
    key: regionKey(input.region),
    regionId: stableRegionId(input.rootSeed, input.region),
    baselineHash: input.baselineHash,
    revision: input.revision,
    eventOrdinal: input.eventOrdinal,
    legacyPlacements: placements,
    legacyAggregatePlacements: aggregatePlacements,
    baselineSuppressedUnits,
    residentPatch,
    residentPatchHash: residentPatch === null ? null : hashCanonical(residentPatch),
  } as const;
  return deepFreeze({ ...base, integrity: hashCanonical(base) });
}

export function canonicalizeRegionalEcologyRegionDelta(
  value: unknown,
  rootSeed?: RootSeed,
): RegionalEcologyRegionDeltaV1 | null {
  const regions = canonicalRegions([value]);
  const region = regions?.[0] ?? null;
  if (region === null || rootSeed === undefined) return region;
  try {
    requireRootSeed(rootSeed);
  } catch {
    return null;
  }
  if (region.regionId !== stableRegionId(rootSeed, region.region)) return null;
  try {
    const habitat = deriveCoreEcologyRegionalHabitat({ seed: rootSeed, region: region.region });
    if (
      region.baselineHash !== habitat.derivationHash
      || !regionalPlacementsMatchBaseline(
        habitat,
        region.legacyPlacements,
        region.legacyAggregatePlacements,
      )
    ) return null;
    if (region.residentPatch !== null) {
      const resident = canonicalResidentDeviationForWorld(
        region.residentPatch,
        rootSeed,
        region.region,
        region.baselineHash,
      );
      if (
        resident === null
        || stableStringify(resident) !== stableStringify(region.residentPatch)
        || region.residentPatchHash !== hashCanonical(resident)
      ) return null;
    }
    return region;
  } catch {
    return null;
  }
}

function canonicalResidentDeviation(
  value: unknown,
  region: RegionCoord,
  baselineHash: string,
): CoreEcologyAggregatePatchState | null {
  if (value === null) return null;
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    patch === null
    || stableStringify(patch) !== stableStringify(value)
    || (
      patch.derivation.kind !== "regional-habitat-v1"
      && patch.derivation.kind !== "regional-habitat-v1-with-adoption-suppression"
    )
    || patch.originRegion.x !== region.x
    || patch.originRegion.y !== region.y
    || patch.derivation.habitat.derivationHash !== baselineHash
    || patch.populations.some(({ members }) => members.some(
      ({ materialization }) => materialization !== "coarse",
    ))
  ) return null;
  return patch;
}

function canonicalResidentDeviationForWorld(
  value: unknown,
  rootSeed: RootSeed,
  region: RegionCoord,
  baselineHash: string,
): CoreEcologyAggregatePatchState | null {
  if (value === null) return null;
  const patch = canonicalizeCoreEcologyAggregatePatch(value);
  if (patch === null) return null;
  let normalized: CoreEcologyAggregatePatchState;
  try {
    normalized = setCoreEcologyAggregatePatchMaterializedActors(patch, {
      atTick: patch.updatedAtTick,
      actorIds: [],
    });
  } catch {
    return null;
  }
  if (
    (
      normalized.derivation.kind !== "regional-habitat-v1"
      && normalized.derivation.kind !== "regional-habitat-v1-with-adoption-suppression"
    )
    || normalized.derivation.habitat.derivationHash !== baselineHash
  ) return null;
  return canonicalCoreEcologyRegionalResidentPatch(normalized, {
    seed: rootSeed,
    region,
    completedTick: normalized.updatedAtTick,
  });
}

/** Binds a suppressed resident derivation to this root's exact adoption receipt. */
function residentSuppressionMatchesRootAuthority(
  root: RegionalEcologyRootV1,
  region: RegionalEcologyRegionDeltaV1,
  patch: CoreEcologyAggregatePatchState,
): boolean {
  const hasReservedUnits = region.legacyPlacements.length > 0
    || region.legacyAggregatePlacements.length > 0;
  if (patch.derivation.kind === "regional-habitat-v1") return !hasReservedUnits;
  if (
    patch.derivation.kind !== "regional-habitat-v1-with-adoption-suppression"
    || !hasReservedUnits
    || root.adoption === null
    || root.legacyCohort === null
    || root.adoption.sourceCoreEcologyHash !== root.legacyCohort.sourcePatchHash
  ) return false;
  const actorSlots = region.legacyPlacements.map((placement) => ({
    baselineActorId: placement.baselineActorId,
    baselinePopulationId: placement.baselinePopulationId,
    baselineUnitOffset: placement.baselineUnitOffset,
    legacyActorId: placement.legacyActorId,
    species: placement.species,
    suppressedBaselineUnits: placement.suppressedBaselineUnits,
  })).sort((left, right) => (
    compareText(left.baselinePopulationId, right.baselinePopulationId)
      || left.baselineUnitOffset - right.baselineUnitOffset
      || compareText(left.legacyActorId, right.legacyActorId)
  ));
  const aggregateSlots = region.legacyAggregatePlacements.map((placement) => ({
    baselinePopulationId: placement.baselinePopulationId,
    legacyAggregateId: placement.legacyAggregateId,
    species: placement.species,
    suppressedBaselineUnits: placement.suppressedBaselineUnits,
  })).sort((left, right) => (
    compareText(left.baselinePopulationId, right.baselinePopulationId)
      || compareText(left.legacyAggregateId, right.legacyAggregateId)
  ));
  return stableStringify(patch.derivation.suppression) === stableStringify({
    version: 1,
    adoptionTransactionId: root.adoption.transactionId,
    sourcePatchHash: root.adoption.sourceCoreEcologyHash,
    baselineHash: region.baselineHash,
    actorSlots,
    aggregateSlots,
  });
}

export function canonicalizeRegionalEcologyRoot(
  value: unknown,
): RegionalEcologyRootV1 | null {
  if (typeof value === "object" && value !== null && TRUSTED_ROOTS.has(value)) {
    return value as RegionalEcologyRootV1;
  }
  if (!plainRecord(value) || !exactKeys(value, [
    "adoption",
    "baselinePolicyId",
    "generationVersion",
    "integrity",
    "lastEventOrdinal",
    "legacyCohort",
    "ownerId",
    "regions",
    "revision",
    "seedFingerprint",
    "updatedAtTick",
    "version",
  ])) return null;
  if (
    value.version !== REGIONAL_ECOLOGY_ROOT_VERSION
    || value.ownerId !== "regional-ecology-root:v1"
    || value.generationVersion !== 1
    || value.baselinePolicyId !== REGIONAL_ECOLOGY_BASELINE_POLICY_ID
    || !validHash(value.seedFingerprint)
    || !nonnegativeSafeInteger(value.updatedAtTick)
    || !nonnegativeSafeInteger(value.revision)
    || !nonnegativeSafeInteger(value.lastEventOrdinal)
    || !Array.isArray(value.regions)
    || value.regions.length > REGIONAL_ECOLOGY_MAX_REGIONS
    || !validHash(value.integrity)
  ) return null;
  const cohort = canonicalLegacyCohort(value.legacyCohort);
  const regions = canonicalRegions(value.regions);
  if (regions === null || (value.legacyCohort !== null && cohort === null)) return null;
  const placementActorIds = new Set<string>();
  const placementAggregateIds = new Set<string>();
  const placementBaselineIds = new Set<string>();
  for (const region of regions) {
    for (const placement of region.legacyPlacements) {
      if (
        placementActorIds.has(placement.legacyActorId)
        || placementBaselineIds.has(placement.baselineActorId)
      ) return null;
      placementActorIds.add(placement.legacyActorId);
      placementBaselineIds.add(placement.baselineActorId);
    }
    for (const placement of region.legacyAggregatePlacements) {
      if (
        placementAggregateIds.has(placement.legacyAggregateId)
        || placementBaselineIds.has(placement.baselinePopulationId)
      ) return null;
      placementAggregateIds.add(placement.legacyAggregateId);
      placementBaselineIds.add(placement.baselinePopulationId);
    }
  }
  const adoption = canonicalAdoption(value.adoption, cohort, regions, value.seedFingerprint);
  if (value.adoption === null) {
    const hasLegacyPlacement = regions.some((region) => (
      region.legacyPlacements.length > 0 || region.legacyAggregatePlacements.length > 0
    ));
    if (
      cohort !== null
      || hasLegacyPlacement
      || (regions.length > 0 && (value.revision < 1 || value.lastEventOrdinal < 1))
      || ((value.revision === 0) !== (value.lastEventOrdinal === 0))
    ) return null;
  } else if (
    adoption === null
    || cohort === null
    || value.revision < 1
    || value.lastEventOrdinal < 1
  ) return null;
  if (cohort !== null && cohort.sourcePatch.updatedAtTick > value.updatedAtTick) return null;
  for (const region of regions) {
    if (
      region.eventOrdinal > value.lastEventOrdinal
      || region.revision > value.revision
      || (region.residentPatch !== null
        && region.residentPatch.updatedAtTick > value.updatedAtTick)
    ) return null;
  }
  const base = {
    version: REGIONAL_ECOLOGY_ROOT_VERSION,
    ownerId: "regional-ecology-root:v1" as const,
    generationVersion: 1 as const,
    baselinePolicyId: REGIONAL_ECOLOGY_BASELINE_POLICY_ID,
    seedFingerprint: value.seedFingerprint,
    updatedAtTick: value.updatedAtTick,
    revision: value.revision,
    lastEventOrdinal: value.lastEventOrdinal,
    adoption,
    legacyCohort: cohort,
    regions,
  };
  if (hashCanonical(base) !== value.integrity) return null;
  const root = deepFreeze({ ...base, integrity: value.integrity });
  if (serializedBytes(root) > REGIONAL_ECOLOGY_MAX_SERIALIZED_BYTES) return null;
  TRUSTED_ROOTS.add(root);
  return root;
}

export function canonicalRegionalEcologyRootForWorld(
  value: unknown,
  binding: RegionalEcologyWorldBinding,
): RegionalEcologyRootV1 | null {
  try {
    requireBinding(binding);
  } catch {
    return null;
  }
  const root = canonicalizeRegionalEcologyRoot(value);
  if (
    root === null
    || root.seedFingerprint !== seedFingerprint(binding.rootSeed)
    || root.updatedAtTick !== binding.completedTick
  ) return null;
  for (const region of root.regions) {
    const boundRegion = canonicalizeRegionalEcologyRegionDelta(region, binding.rootSeed);
    if (
      boundRegion === null
      || stableStringify(boundRegion) !== stableStringify(region)
    ) return null;
  }
  if (
    root.legacyCohort !== null
    && !legacyPatchMatchesSeed(root.legacyCohort.sourcePatch, binding.rootSeed)
  ) return null;
  if (root.adoption !== null && root.legacyCohort !== null) {
    let expected: RegionalEcologyRootV1;
    try {
      expected = adoptRegionalEcologyFromV24({
        rootSeed: binding.rootSeed,
        completedTick: root.adoption.sourceCompletedTick,
        sourceEnvelopeIntegrity: root.adoption.sourceEnvelopeIntegrity,
        legacyPatch: root.legacyCohort.sourcePatch,
        protectedActorIds: root.adoption.protectedActorIds,
        protectedAggregateIds: root.adoption.protectedAggregateIds,
      });
    } catch {
      return null;
    }
    if (
      stableStringify(expected.adoption) !== stableStringify(root.adoption)
      || stableStringify(expected.legacyCohort) !== stableStringify(root.legacyCohort)
      || stableStringify(adoptionRegionAuthority(expected.regions))
        !== stableStringify(adoptionRegionAuthority(root.regions))
    ) return null;
  }
  for (const region of root.regions) {
    if (
      region.residentPatch !== null
      && !residentSuppressionMatchesRootAuthority(root, region, region.residentPatch)
    ) return null;
  }
  return root;
}

/** Advances only the owner clock; adoption evidence and event ordinals remain immutable. */
export function advanceRegionalEcologyRoot(
  value: unknown,
  completedTick: number,
): RegionalEcologyRootV1 {
  const root = canonicalizeRegionalEcologyRoot(value);
  if (
    root === null
    || !nonnegativeSafeInteger(completedTick)
    || completedTick < root.updatedAtTick
  ) throw new RangeError("Regional ecology clock cannot rewind or advance malformed authority");
  if (completedTick === root.updatedAtTick) return root;
  const { integrity: _integrity, ...base } = root;
  return sealRoot({ ...base, updatedAtTick: completedTick });
}

/**
 * Persist one changed regional owner transactionally. An exact pristine
 * baseline is omitted; removing the final non-legacy deviation removes the
 * region record entirely rather than turning visitation into save growth.
 */
export function putRegionalEcologyResidentDeviation(
  value: unknown,
  input: PutRegionalEcologyResidentDeviationInput,
): RegionalEcologyRootV1 {
  const structural = canonicalizeRegionalEcologyRoot(value);
  if (structural === null) throw new TypeError("Regional ecology root is malformed");
  const root = canonicalRegionalEcologyRootForWorld(structural, {
    rootSeed: input.rootSeed,
    completedTick: structural.updatedAtTick,
  });
  if (root === null) throw new RangeError("Regional ecology root does not belong to this world");
  const patch = canonicalCoreEcologyRegionalResidentPatchForRoot(input.patch, {
    seed: input.rootSeed,
    root,
    region: input.patch.originRegion,
    completedTick: root.updatedAtTick,
  });
  if (patch === null) throw new RangeError("Regional ecology deviation is not a bound resident patch");
  const normalized = setCoreEcologyAggregatePatchMaterializedActors(patch, {
    atTick: root.updatedAtTick,
    actorIds: [],
  });
  const habitat = deriveCoreEcologyRegionalHabitat({
    seed: input.rootSeed,
    region: normalized.originRegion,
  });
  const pristine = createCoreEcologyRegionalResidentPatchForRoot({
    seed: input.rootSeed,
    root,
    region: habitat.region,
  });
  const isPristine = pristine !== null
    && stableStringify(normalized) === stableStringify(pristine);
  const key = regionKey(normalized.originRegion);
  const existing = root.regions.find((region) => region.key === key);
  if (isPristine && (existing === undefined || existing.residentPatch === null)) return root;

  const eventOrdinal = root.lastEventOrdinal + 1;
  const revision = root.revision + 1;
  if (!Number.isSafeInteger(eventOrdinal) || !Number.isSafeInteger(revision)) {
    throw new RangeError("Regional ecology deviation ordinal exhausted");
  }
  const regions = root.regions.filter((region) => region.key !== key);
  const legacyPlacements = existing?.legacyPlacements ?? [];
  const legacyAggregatePlacements = existing?.legacyAggregatePlacements ?? [];
  if (!isPristine || legacyPlacements.length > 0 || legacyAggregatePlacements.length > 0) {
    const delta = createRegionalEcologyRegionDelta({
      rootSeed: input.rootSeed,
      region: normalized.originRegion,
      baselineHash: habitat.derivationHash,
      revision: (existing?.revision ?? 0) + 1,
      eventOrdinal,
      legacyPlacements,
      legacyAggregatePlacements,
      residentPatch: isPristine ? null : normalized,
    });
    if (canonicalizeRegionalEcologyRegionDelta(delta, input.rootSeed) === null) {
      throw new Error("Generated regional ecology deviation failed world validation");
    }
    regions.push(delta);
  }
  regions.sort((left, right) => compareText(left.key, right.key));
  const { integrity: _integrity, ...base } = root;
  return sealRoot({
    ...base,
    revision,
    lastEventOrdinal: eventOrdinal,
    regions: Object.freeze(regions),
  });
}

export function regionalEcologyResidentDeviation(
  value: unknown,
  rootSeed: RootSeed,
  region: RegionCoord,
): CoreEcologyAggregatePatchState | null {
  const root = canonicalizeRegionalEcologyRoot(value);
  if (root === null) return null;
  const bound = canonicalRegionalEcologyRootForWorld(root, {
    rootSeed,
    completedTick: root.updatedAtTick,
  });
  if (bound === null) return null;
  return bound.regions.find((candidate) => candidate.key === regionKey(region))
    ?.residentPatch ?? null;
}

export function serializeRegionalEcologyRoot(value: unknown): string {
  const root = canonicalizeRegionalEcologyRoot(value);
  if (root === null) throw new TypeError("Regional ecology root is malformed");
  const text = stableStringify(root);
  if (UTF8_ENCODER.encode(text).byteLength > REGIONAL_ECOLOGY_MAX_SERIALIZED_BYTES) {
    throw new RangeError("Regional ecology root exceeds its save budget");
  }
  return text;
}

export function deserializeRegionalEcologyRoot(text: unknown): RegionalEcologyRootV1 | null {
  if (
    typeof text !== "string"
    || text.length === 0
    || UTF8_ENCODER.encode(text).byteLength > REGIONAL_ECOLOGY_MAX_SERIALIZED_BYTES
  ) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    const root = canonicalizeRegionalEcologyRoot(parsed);
    return root !== null && stableStringify(root) === text ? root : null;
  } catch {
    return null;
  }
}

function canonicalLegacyCohort(value: unknown): RegionalEcologyLegacyCohortV1 | null {
  if (value === null) return null;
  if (!plainRecord(value) || !exactKeys(value, [
    "aggregateRetirements",
    "retirements",
    "sourcePatch",
    "sourcePatchHash",
    "version",
  ])) return null;
  const patch = canonicalizeCoreEcologyAggregatePatch(value.sourcePatch);
  if (
    value.version !== REGIONAL_ECOLOGY_LEGACY_COHORT_VERSION
    || patch === null
    || stableStringify(patch) !== stableStringify(value.sourcePatch)
    || value.sourcePatchHash !== hashCanonical(patch)
    || !Array.isArray(value.retirements)
    || !Array.isArray(value.aggregateRetirements)
  ) return null;
  const retirements = canonicalRetirements(value.retirements, patch, patch.updatedAtTick);
  const aggregateRetirements = canonicalAggregateRetirements(
    value.aggregateRetirements,
    patch,
    patch.updatedAtTick,
  );
  return retirements === null || aggregateRetirements === null ? null : deepFreeze({
    version: REGIONAL_ECOLOGY_LEGACY_COHORT_VERSION,
    sourcePatchHash: value.sourcePatchHash,
    sourcePatch: patch,
    retirements,
    aggregateRetirements,
  });
}

function canonicalAdoption(
  value: unknown,
  cohort: RegionalEcologyLegacyCohortV1 | null,
  regions: readonly RegionalEcologyRegionDeltaV1[],
  rootSeedFingerprint: string,
): RegionalEcologyAdoptionReceiptV1 | null {
  if (value === null) return null;
  if (cohort === null || !plainRecord(value) || !exactKeys(value, [
    "actorDispositions",
    "aggregateDispositions",
    "groupDispositions",
    "integrity",
    "policyId",
    "populationAccounting",
    "protectedActorIds",
    "protectedAggregateIds",
    "resultEcologyStateHash",
    "rootSeedFingerprint",
    "sourceBodiesHash",
    "sourceCompletedTick",
    "sourceCoreEcologyHash",
    "sourceEnvelopeIntegrity",
    "sourceGroupsHash",
    "sourceMortalityHash",
    "sourceOuterVersion",
    "status",
    "transactionId",
    "version",
  ])) return null;
  if (
    value.version !== REGIONAL_ECOLOGY_ADOPTION_VERSION
    || value.status !== "committed"
    || value.policyId !== REGIONAL_ECOLOGY_ADOPTION_POLICY_ID
    || value.sourceOuterVersion !== 24
    || !validHash(value.sourceEnvelopeIntegrity)
    || value.sourceCoreEcologyHash !== cohort.sourcePatchHash
    || value.rootSeedFingerprint !== rootSeedFingerprint
    || value.sourceCompletedTick !== cohort.sourcePatch.updatedAtTick
    || typeof value.transactionId !== "string"
    || !TRANSACTION_ID_PATTERN.test(value.transactionId)
    || !validHash(value.sourceGroupsHash)
    || !validHash(value.sourceMortalityHash)
    || !validHash(value.sourceBodiesHash)
    || !validHash(value.resultEcologyStateHash)
    || !validHash(value.integrity)
    || !Array.isArray(value.populationAccounting)
    || !Array.isArray(value.protectedActorIds)
    || !Array.isArray(value.protectedAggregateIds)
    || !Array.isArray(value.actorDispositions)
    || !Array.isArray(value.groupDispositions)
    || !Array.isArray(value.aggregateDispositions)
  ) return null;
  const expectedTransactionId = `regional-ecology-adoption:${hashCanonical({
    completedTick: value.sourceCompletedTick,
    policyId: REGIONAL_ECOLOGY_ADOPTION_POLICY_ID,
    rootSeedFingerprint,
    sourceCoreEcologyHash: cohort.sourcePatchHash,
    sourceEnvelopeIntegrity: value.sourceEnvelopeIntegrity,
    protectedActorIds: value.protectedActorIds,
    protectedAggregateIds: value.protectedAggregateIds,
  })}`;
  if (
    value.transactionId !== expectedTransactionId
    || value.sourceGroupsHash !== hashCanonical(cohort.sourcePatch.groups)
    || value.sourceMortalityHash !== hashCanonical({
      nextMortalityOrdinal: cohort.sourcePatch.nextMortalityOrdinal,
      mortalityTransactions: cohort.sourcePatch.mortalityTransactions,
    })
    || value.sourceBodiesHash !== hashCanonical(cohort.sourcePatch.carcasses)
    || value.resultEcologyStateHash !== adoptionResultHash(cohort, regions)
  ) return null;
  const accounting = canonicalPopulationAccounting(value.populationAccounting, cohort);
  const actors = canonicalActorDispositions(value.actorDispositions, cohort, regions);
  if (accounting === null || actors === null) return null;
  const protectedActorIds = canonicalStringIds(value.protectedActorIds);
  const protectedAggregateIds = canonicalStringIds(value.protectedAggregateIds);
  if (
    protectedActorIds === null
    || protectedAggregateIds === null
    || protectedActorIds.some((id) => !actors.some(({ actorId }) => actorId === id))
    || protectedAggregateIds.some((id) => !cohort.sourcePatch.aggregatePopulations.some(
      ({ aggregateId }) => aggregateId === id,
    ))
  ) return null;
  const groups = canonicalGroupDispositions(value.groupDispositions, cohort, actors);
  const aggregates = canonicalAggregateDispositions(value.aggregateDispositions, cohort, regions);
  if (groups === null || aggregates === null) return null;
  const base = {
    version: REGIONAL_ECOLOGY_ADOPTION_VERSION,
    status: "committed" as const,
    transactionId: value.transactionId,
    policyId: REGIONAL_ECOLOGY_ADOPTION_POLICY_ID,
    sourceOuterVersion: 24 as const,
    sourceEnvelopeIntegrity: value.sourceEnvelopeIntegrity,
    sourceCoreEcologyHash: value.sourceCoreEcologyHash,
    rootSeedFingerprint: value.rootSeedFingerprint,
    sourceCompletedTick: value.sourceCompletedTick,
    protectedActorIds,
    protectedAggregateIds,
    populationAccounting: accounting,
    actorDispositions: actors,
    groupDispositions: groups,
    aggregateDispositions: aggregates,
    sourceGroupsHash: value.sourceGroupsHash,
    sourceMortalityHash: value.sourceMortalityHash,
    sourceBodiesHash: value.sourceBodiesHash,
    resultEcologyStateHash: value.resultEcologyStateHash,
  };
  return hashCanonical(base) === value.integrity
    ? deepFreeze({ ...base, integrity: value.integrity })
    : null;
}

function canonicalPopulationAccounting(
  values: readonly unknown[],
  cohort: RegionalEcologyLegacyCohortV1,
): readonly RegionalEcologyPopulationAccountingV1[] | null {
  if (values.length !== cohort.sourcePatch.populations.length) return null;
  const result: RegionalEcologyPopulationAccountingV1[] = [];
  for (const value of values) {
    if (!plainRecord(value) || !exactKeys(value, [
      "adoptionRetiredUnits",
      "baselinePopulationSize",
      "existingMortalityUnits",
      "populationKey",
      "postAdoptionPopulationSize",
      "sourceMemberUnits",
      "sourcePopulationSize",
      "sourceReserveUnits",
      "species",
    ])) return null;
    const population = cohort.sourcePatch.populations.find(({ species, populationKey }) => (
      species === value.species && populationKey === value.populationKey
    ));
    if (population === undefined) return null;
    const retiredUnits = cohort.retirements
      .filter(({ species, populationKey }) => (
        species === population.species && populationKey === population.populationKey
      ))
      .reduce((sum, retirement) => sum + retirement.representedUnits, 0);
    const expected = populationAccounting(population, retiredUnits);
    if (stableStringify(value) !== stableStringify(expected)) return null;
    result.push(expected);
  }
  result.sort(comparePopulationAccounting);
  return uniqueOrdered(result, comparePopulationAccounting) ? deepFreeze(result) : null;
}

function canonicalActorDispositions(
  values: readonly unknown[],
  cohort: RegionalEcologyLegacyCohortV1,
  regions: readonly RegionalEcologyRegionDeltaV1[],
): readonly RegionalEcologyActorDispositionV1[] | null {
  const members = cohort.sourcePatch.populations.flatMap((population) =>
    population.members.map((member) => ({ population, member })),
  );
  if (values.length !== members.length) return null;
  const placementByActor = new Map(regions.flatMap(({ legacyPlacements }) =>
    legacyPlacements.map((placement) => [placement.legacyActorId, placement] as const)));
  const retirementByActor = new Map(cohort.retirements.map((entry) => [entry.actorId, entry]));
  const result: RegionalEcologyActorDispositionV1[] = [];
  for (const value of values) {
    if (!plainRecord(value) || !exactKeys(value, [
      "actorId",
      "destinationPosition",
      "disposition",
      "populationKey",
      "populationOrdinal",
      "reason",
      "representedUnits",
      "sourcePosition",
      "sourceStateHash",
      "species",
      "suppressedBaselineUnits",
    ])) return null;
    const owned = members.find(({ member }) => member.actor.identity.stableId === value.actorId);
    if (owned === undefined || !isWorldPosition(value.sourcePosition)) return null;
    const { actor, populationOrdinal, representedUnits } = owned.member;
    if (
      value.species !== owned.population.species
      || value.populationKey !== owned.population.populationKey
      || value.populationOrdinal !== populationOrdinal
      || value.representedUnits !== representedUnits
      || value.sourceStateHash !== hashCanonical(actor)
      || stableStringify(value.sourcePosition) !== stableStringify(actor.address.position)
      || !nonnegativeSafeInteger(value.suppressedBaselineUnits)
      || value.suppressedBaselineUnits > representedUnits
    ) return null;
    const placement = placementByActor.get(value.actorId);
    if ((placement?.suppressedBaselineUnits ?? 0) !== value.suppressedBaselineUnits) return null;
    let destination: WorldPosition | null = null;
    if (value.disposition === "retained") {
      if (
        (value.reason !== "v24-authority-retained" && value.reason !== "protected-authority-retained")
        || !isWorldPosition(value.destinationPosition)
      ) return null;
      destination = copyPosition(value.destinationPosition);
      if (
        stableStringify(destination) !== stableStringify(actor.address.position)
        || retirementByActor.has(value.actorId)
        || (placement !== undefined
          && stableStringify(placement.destinationPosition) !== stableStringify(destination))
      ) return null;
    } else if (value.disposition === "redistributed") {
      if (
        value.reason !== "regional-capacity-placement"
        || !isWorldPosition(value.destinationPosition)
        || placement === undefined
        || stableStringify(value.destinationPosition) !== stableStringify(placement.destinationPosition)
        || stableStringify(value.destinationPosition) === stableStringify(actor.address.position)
        || value.suppressedBaselineUnits !== representedUnits
        || retirementByActor.has(value.actorId)
      ) return null;
      destination = copyPosition(value.destinationPosition);
    } else if (value.disposition === "retired") {
      if (
        value.reason !== "compatibility-retirement"
        || value.destinationPosition !== null
        || value.suppressedBaselineUnits !== 0
        || !retirementByActor.has(value.actorId)
        || placementByActor.has(value.actorId)
      ) return null;
    } else return null;
    result.push(deepFreeze({
      actorId: value.actorId,
      species: value.species,
      populationKey: value.populationKey,
      populationOrdinal: value.populationOrdinal,
      representedUnits: value.representedUnits,
      disposition: value.disposition,
      reason: value.reason,
      sourceStateHash: value.sourceStateHash,
      sourcePosition: copyPosition(value.sourcePosition),
      destinationPosition: destination,
      suppressedBaselineUnits: value.suppressedBaselineUnits,
    }) as RegionalEcologyActorDispositionV1);
  }
  result.sort(compareActorDisposition);
  return uniqueOrdered(result, compareActorDisposition) ? deepFreeze(result) : null;
}

function canonicalGroupDispositions(
  values: readonly unknown[],
  cohort: RegionalEcologyLegacyCohortV1,
  actors: readonly RegionalEcologyActorDispositionV1[],
): readonly RegionalEcologyGroupDispositionV1[] | null {
  if (values.length !== cohort.sourcePatch.groups.groups.length) return null;
  const actorByOrdinal = legacyActorByPopulationOrdinal(cohort.sourcePatch);
  const actorDisposition = new Map(actors.map((entry) => [entry.actorId, entry]));
  const result: RegionalEcologyGroupDispositionV1[] = [];
  for (const value of values) {
    if (!plainRecord(value) || !exactKeys(value, [
      "destinationRegion",
      "disposition",
      "groupId",
      "memberActorIds",
      "reason",
      "sourceStateHash",
      "suppressedBaselineUnits",
    ]) || !Array.isArray(value.memberActorIds)) return null;
    const group = cohort.sourcePatch.groups.groups.find(
      ({ identity }) => identity.stableId === value.groupId,
    );
    if (
      group === undefined
      || value.sourceStateHash !== hashCanonical(group)
      || !nonnegativeSafeInteger(value.suppressedBaselineUnits)
    ) return null;
    const expectedMembers = group.memberOrdinals.map((ordinal) => actorByOrdinal.get(
      populationOrdinalKey(group.identity.populationKey, ordinal),
    )?.identity.stableId ?? "").sort(compareText);
    if (
      expectedMembers.some((id) => id.length === 0)
      || stableStringify(value.memberActorIds) !== stableStringify(expectedMembers)
    ) return null;
    const memberDispositions = expectedMembers.map((id) => actorDisposition.get(id));
    if (memberDispositions.some((entry) => entry === undefined)) return null;
    const action = memberDispositions[0]!.disposition;
    const suppressedBaselineUnits = memberDispositions.reduce(
      (sum, entry) => sum + (entry?.suppressedBaselineUnits ?? 0),
      0,
    );
    if (value.disposition !== action || memberDispositions.some((entry) => entry!.disposition !== action)) {
      return null;
    }
    if (value.suppressedBaselineUnits !== suppressedBaselineUnits) return null;
    let destinationRegion: RegionCoord | null = null;
    if (action === "retained") {
      if (
        (value.reason !== "v24-authority-retained" && value.reason !== "protected-authority-retained")
        || !isRegionCoord(value.destinationRegion)
      ) return null;
      destinationRegion = copyRegion(value.destinationRegion);
      const activeMemberRegionKeys = new Set(memberDispositions.flatMap((entry) => (
        entry?.destinationPosition === null || entry?.destinationPosition === undefined
          ? []
          : [regionKey(entry.destinationPosition.region)]
      )));
      if (
        (activeMemberRegionKeys.size === 1
          && !activeMemberRegionKeys.has(regionKey(destinationRegion)))
        || (activeMemberRegionKeys.size > 1
          && (value.reason !== "protected-authority-retained"
            || regionKey(destinationRegion) !== regionKey(group.identity.originRegion)))
      ) return null;
    } else if (action === "redistributed") {
      if (value.reason !== "regional-capacity-placement" || !isRegionCoord(value.destinationRegion)) return null;
      destinationRegion = copyRegion(value.destinationRegion);
      if (memberDispositions.some((entry) => (
        entry === undefined
        || entry.destinationPosition === null
        || regionKey(entry.destinationPosition.region) !== regionKey(destinationRegion!)
      ))) return null;
    } else if (value.reason !== "compatibility-retirement" || value.destinationRegion !== null) {
      return null;
    }
    result.push(deepFreeze({
      groupId: value.groupId,
      memberActorIds: expectedMembers,
      disposition: action,
      reason: value.reason,
      sourceStateHash: value.sourceStateHash,
      destinationRegion,
      suppressedBaselineUnits,
    }) as RegionalEcologyGroupDispositionV1);
  }
  result.sort(compareGroupDisposition);
  return uniqueOrdered(result, compareGroupDisposition) ? deepFreeze(result) : null;
}

function canonicalAggregateDispositions(
  values: readonly unknown[],
  cohort: RegionalEcologyLegacyCohortV1,
  regions: readonly RegionalEcologyRegionDeltaV1[],
): readonly RegionalEcologyAggregateDispositionV1[] | null {
  const placementByAggregate = new Map(regions.flatMap(({ legacyAggregatePlacements }) => (
    legacyAggregatePlacements.map((placement) => [placement.legacyAggregateId, placement] as const)
  )));
  const retirementByAggregate = new Map(cohort.aggregateRetirements.map((entry) => (
    [entry.aggregateId, entry] as const
  )));
  if (values.length !== cohort.sourcePatch.aggregatePopulations.length) return null;
  const result: RegionalEcologyAggregateDispositionV1[] = [];
  for (const value of values) {
    if (!plainRecord(value) || !exactKeys(value, [
      "aggregateId",
      "destinationRegion",
      "disposition",
      "populationKey",
      "postAdoptionPopulationSize",
      "reason",
      "sourcePopulationSize",
      "sourceStateHash",
      "species",
      "suppressedBaselineUnits",
    ])) return null;
    const aggregate = cohort.sourcePatch.aggregatePopulations.find(
      ({ aggregateId }) => aggregateId === value.aggregateId,
    );
    if (
      aggregate === undefined
      || value.species !== aggregate.species
      || value.populationKey !== aggregate.populationKey
      || value.sourcePopulationSize !== aggregate.populationSize
      || value.sourceStateHash !== hashCanonical(aggregate)
      || !nonnegativeSafeInteger(value.suppressedBaselineUnits)
      || value.suppressedBaselineUnits > aggregate.populationSize
    ) return null;
    const placement = placementByAggregate.get(value.aggregateId);
    if ((placement?.suppressedBaselineUnits ?? 0) !== value.suppressedBaselineUnits) return null;
    if (value.disposition === "retained") {
      if (
        (value.reason !== "v24-authority-retained" && value.reason !== "protected-authority-retained")
        || value.postAdoptionPopulationSize !== aggregate.populationSize
        || !isRegionCoord(value.destinationRegion)
        || retirementByAggregate.has(value.aggregateId)
        || (placement !== undefined
          && regionKey(placement.destinationRegion) !== regionKey(value.destinationRegion))
      ) return null;
    } else if (value.disposition === "redistributed") {
      if (
        value.reason !== "regional-capacity-placement"
        || value.postAdoptionPopulationSize !== aggregate.populationSize
        || !isRegionCoord(value.destinationRegion)
        || placement === undefined
        || regionKey(placement.destinationRegion) !== regionKey(value.destinationRegion)
        || value.suppressedBaselineUnits !== aggregate.populationSize
        || retirementByAggregate.has(value.aggregateId)
      ) return null;
    } else if (
      value.disposition !== "retired"
      || value.reason !== "compatibility-retirement"
      || value.postAdoptionPopulationSize !== 0
      || value.destinationRegion !== null
      || value.suppressedBaselineUnits !== 0
      || !retirementByAggregate.has(value.aggregateId)
      || placement !== undefined
    ) return null;
    result.push(deepFreeze({
      aggregateId: value.aggregateId,
      species: value.species,
      populationKey: value.populationKey,
      sourcePopulationSize: value.sourcePopulationSize,
      postAdoptionPopulationSize: value.postAdoptionPopulationSize,
      disposition: value.disposition,
      reason: value.reason,
      sourceStateHash: value.sourceStateHash,
      destinationRegion: value.destinationRegion === null ? null : copyRegion(value.destinationRegion),
      suppressedBaselineUnits: value.suppressedBaselineUnits,
    }) as RegionalEcologyAggregateDispositionV1);
  }
  result.sort(compareAggregateDisposition);
  return uniqueOrdered(result, compareAggregateDisposition) ? deepFreeze(result) : null;
}

function canonicalRetirements(
  values: readonly unknown[],
  patch: CoreEcologyAggregatePatchState,
  tick: number,
): readonly RegionalEcologyRetirementTombstoneV1[] | null {
  const result: RegionalEcologyRetirementTombstoneV1[] = [];
  for (const value of values) {
    if (!plainRecord(value) || !exactKeys(value, [
      "actorId",
      "carcassId",
      "mortalityEventId",
      "populationKey",
      "populationOrdinal",
      "reason",
      "representedUnits",
      "retiredAtTick",
      "species",
      "version",
    ])) return null;
    const owned = patch.populations.flatMap((population) => population.members.map((member) => ({
      population,
      member,
    }))).find(({ member }) => member.actor.identity.stableId === value.actorId);
    if (
      owned === undefined
      || value.version !== REGIONAL_ECOLOGY_RETIREMENT_VERSION
      || value.species !== owned.population.species
      || value.populationKey !== owned.population.populationKey
      || value.populationOrdinal !== owned.member.populationOrdinal
      || value.representedUnits !== owned.member.representedUnits
      || value.retiredAtTick !== tick
      || value.reason !== "compatibility-retirement"
      || value.mortalityEventId !== null
      || value.carcassId !== null
    ) return null;
    result.push(deepFreeze({ ...value }) as unknown as RegionalEcologyRetirementTombstoneV1);
  }
  result.sort((left, right) => compareText(left.actorId, right.actorId));
  return uniqueOrdered(result, (left, right) => compareText(left.actorId, right.actorId))
    ? deepFreeze(result)
    : null;
}

function canonicalAggregateRetirements(
  values: readonly unknown[],
  patch: CoreEcologyAggregatePatchState,
  tick: number,
): readonly RegionalEcologyAggregateRetirementTombstoneV1[] | null {
  const result: RegionalEcologyAggregateRetirementTombstoneV1[] = [];
  for (const value of values) {
    if (!plainRecord(value) || !exactKeys(value, [
      "aggregateId",
      "carcassId",
      "mortalityEventId",
      "populationKey",
      "reason",
      "representedUnits",
      "retiredAtTick",
      "species",
      "version",
    ])) return null;
    const aggregate = patch.aggregatePopulations.find(
      ({ aggregateId }) => aggregateId === value.aggregateId,
    );
    if (
      aggregate === undefined
      || value.version !== REGIONAL_ECOLOGY_RETIREMENT_VERSION
      || value.species !== aggregate.species
      || value.populationKey !== aggregate.populationKey
      || value.representedUnits !== aggregate.populationSize
      || value.retiredAtTick !== tick
      || value.reason !== "compatibility-retirement"
      || value.mortalityEventId !== null
      || value.carcassId !== null
    ) return null;
    result.push(deepFreeze({ ...value }) as unknown as RegionalEcologyAggregateRetirementTombstoneV1);
  }
  result.sort((left, right) => compareText(left.aggregateId, right.aggregateId));
  return uniqueOrdered(result, (left, right) => compareText(left.aggregateId, right.aggregateId))
    ? deepFreeze(result)
    : null;
}

function canonicalRegions(values: readonly unknown[]): readonly RegionalEcologyRegionDeltaV1[] | null {
  const result: RegionalEcologyRegionDeltaV1[] = [];
  for (const value of values) {
    if (!plainRecord(value) || !exactKeys(value, [
      "baselineSuppressedUnits",
      "baselineHash",
      "eventOrdinal",
      "integrity",
      "key",
      "legacyAggregatePlacements",
      "legacyPlacements",
      "region",
      "regionId",
      "residentPatch",
      "residentPatchHash",
      "revision",
      "version",
    ])) return null;
    if (
      value.version !== REGIONAL_ECOLOGY_REGION_DELTA_VERSION
      || !isRegionCoord(value.region)
      || value.key !== regionKey(value.region)
      || !validId(value.regionId)
      || !validHash(value.baselineHash)
      || !positiveSafeInteger(value.revision)
      || !positiveSafeInteger(value.eventOrdinal)
      || !Array.isArray(value.legacyPlacements)
      || !Array.isArray(value.legacyAggregatePlacements)
      || (value.residentPatchHash !== null && !validHash(value.residentPatchHash))
      || value.legacyPlacements.length + value.legacyAggregatePlacements.length
        > REGIONAL_ECOLOGY_MAX_LEGACY_PLACEMENTS_PER_REGION
      || !nonnegativeSafeInteger(value.baselineSuppressedUnits)
      || !validHash(value.integrity)
    ) return null;
    const placements = canonicalPlacements(value.legacyPlacements, value.region);
    const aggregatePlacements = canonicalAggregatePlacements(
      value.legacyAggregatePlacements,
      value.region,
    );
    if (placements === null || aggregatePlacements === null) return null;
    const baselineSuppressedUnits = [...placements, ...aggregatePlacements].reduce(
      (sum, placement) => sum + placement.suppressedBaselineUnits,
      0,
    );
    const residentPatch = canonicalResidentDeviation(
      value.residentPatch,
      value.region,
      value.baselineHash,
    );
    if (
      baselineSuppressedUnits !== value.baselineSuppressedUnits
      || (residentPatch === null) !== (value.residentPatchHash === null)
      || (residentPatch !== null && value.residentPatchHash !== hashCanonical(residentPatch))
      || (placements.length + aggregatePlacements.length === 0 && residentPatch === null)
    ) return null;
    const base = {
      version: REGIONAL_ECOLOGY_REGION_DELTA_VERSION,
      region: copyRegion(value.region),
      key: value.key,
      regionId: value.regionId,
      baselineHash: value.baselineHash,
      revision: value.revision,
      eventOrdinal: value.eventOrdinal,
      legacyPlacements: placements,
      legacyAggregatePlacements: aggregatePlacements,
      baselineSuppressedUnits,
      residentPatch,
      residentPatchHash: value.residentPatchHash,
    };
    if (hashCanonical(base) !== value.integrity) return null;
    result.push(deepFreeze({ ...base, integrity: value.integrity }));
  }
  result.sort((left, right) => compareText(left.key, right.key));
  return uniqueOrdered(result, (left, right) => compareText(left.key, right.key))
    ? deepFreeze(result)
    : null;
}

function canonicalPlacements(
  values: readonly unknown[],
  region: RegionCoord,
): readonly RegionalEcologyLegacyPlacementV1[] | null {
  const result: RegionalEcologyLegacyPlacementV1[] = [];
  const baselineIds = new Set<string>();
  for (const value of values) {
    if (!plainRecord(value) || !exactKeys(value, [
      "baselineActorId",
      "baselinePopulationId",
      "baselineUnitOffset",
      "destinationPosition",
      "legacyActorId",
      "populationKey",
      "species",
      "suppressedBaselineUnits",
    ]) || !validId(value.baselineActorId) || !validRegionalId(value.baselinePopulationId)
      || !nonnegativeSafeInteger(value.baselineUnitOffset) || !validId(value.legacyActorId)
      || value.baselineActorId === value.legacyActorId || !validId(value.populationKey)
      || !validId(value.species) || !isWorldPosition(value.destinationPosition)
      || regionKey(value.destinationPosition.region) !== regionKey(region)
      || !positiveSafeInteger(value.suppressedBaselineUnits)
      || value.baselineActorId !== regionalEcologyBaselineSlotId(
        value.baselinePopulationId,
        value.baselineUnitOffset,
        value.suppressedBaselineUnits,
      )
      || baselineIds.has(value.baselineActorId)) return null;
    baselineIds.add(value.baselineActorId);
    result.push(deepFreeze({
      baselineActorId: value.baselineActorId,
      baselinePopulationId: value.baselinePopulationId,
      baselineUnitOffset: value.baselineUnitOffset,
      legacyActorId: value.legacyActorId,
      species: value.species,
      populationKey: value.populationKey,
      destinationPosition: copyPosition(value.destinationPosition),
      suppressedBaselineUnits: value.suppressedBaselineUnits,
    }));
  }
  result.sort((left, right) => compareText(left.legacyActorId, right.legacyActorId));
  return uniqueOrdered(result, (left, right) => compareText(left.legacyActorId, right.legacyActorId))
    ? deepFreeze(result)
    : null;
}

function canonicalAggregatePlacements(
  values: readonly unknown[],
  region: RegionCoord,
): readonly RegionalEcologyLegacyAggregatePlacementV1[] | null {
  const result: RegionalEcologyLegacyAggregatePlacementV1[] = [];
  const baselineIds = new Set<string>();
  for (const value of values) {
    if (!plainRecord(value) || !exactKeys(value, [
      "baselinePopulationId",
      "destinationRegion",
      "legacyAggregateId",
      "populationKey",
      "species",
      "suppressedBaselineUnits",
    ]) || !validRegionalId(value.baselinePopulationId) || !validId(value.legacyAggregateId)
      || value.baselinePopulationId === value.legacyAggregateId || !validId(value.populationKey)
      || !validId(value.species) || !isRegionCoord(value.destinationRegion)
      || regionKey(value.destinationRegion) !== regionKey(region)
      || !positiveSafeInteger(value.suppressedBaselineUnits)
      || baselineIds.has(value.baselinePopulationId)) return null;
    baselineIds.add(value.baselinePopulationId);
    result.push(deepFreeze({
      baselinePopulationId: value.baselinePopulationId,
      legacyAggregateId: value.legacyAggregateId,
      species: value.species,
      populationKey: value.populationKey,
      destinationRegion: copyRegion(value.destinationRegion),
      suppressedBaselineUnits: value.suppressedBaselineUnits,
    }));
  }
  result.sort((left, right) => compareText(left.legacyAggregateId, right.legacyAggregateId));
  return uniqueOrdered(result, (left, right) => (
    compareText(left.legacyAggregateId, right.legacyAggregateId)
  )) ? deepFreeze(result) : null;
}

function regionalPlacementsMatchBaseline(
  habitat: CoreEcologyRegionalHabitat,
  actors: readonly RegionalEcologyLegacyPlacementV1[],
  aggregates: readonly RegionalEcologyLegacyAggregatePlacementV1[],
): boolean {
  const rangesByPopulation = new Map<string, Array<readonly [number, number]>>();
  for (const placement of actors) {
    const population = habitat.populations.find(({ stableId }) => (
      stableId === placement.baselinePopulationId
    ));
    if (
      population === undefined
      || population.species !== placement.species
      || population.actorRepresentation !== "individual"
      || placement.baselineUnitOffset + placement.suppressedBaselineUnits
        > population.populationUnits
    ) return false;
    const ranges = rangesByPopulation.get(population.stableId) ?? [];
    ranges.push(Object.freeze([
      placement.baselineUnitOffset,
      placement.baselineUnitOffset + placement.suppressedBaselineUnits,
    ]));
    rangesByPopulation.set(population.stableId, ranges);
  }
  for (const ranges of rangesByPopulation.values()) {
    ranges.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
    if (ranges.some((range, index) => index > 0 && range[0] < ranges[index - 1]![1])) return false;
  }
  for (const placement of aggregates) {
    const population = habitat.populations.find(({ stableId }) => (
      stableId === placement.baselinePopulationId
    ));
    if (
      population === undefined
      || population.species !== placement.species
      || population.actorRepresentation !== "aggregate"
      || placement.suppressedBaselineUnits > population.populationUnits
      || rangesByPopulation.has(population.stableId)
    ) return false;
  }
  return true;
}

function populationAccounting(
  population: CoreEcologyPopulationState,
  adoptionRetiredUnits = 0,
): RegionalEcologyPopulationAccountingV1 {
  const sourceMemberUnits = population.members.reduce(
    (sum, member) => sum + member.representedUnits,
    0,
  );
  return deepFreeze({
    species: population.species,
    populationKey: population.populationKey,
    baselinePopulationSize: population.baselinePopulationSize,
    sourcePopulationSize: population.populationSize,
    sourceReserveUnits: population.reserveUnits,
    sourceMemberUnits,
    existingMortalityUnits: population.baselinePopulationSize - population.populationSize,
    adoptionRetiredUnits,
    postAdoptionPopulationSize: population.populationSize - adoptionRetiredUnits,
  });
}

function adoptionResultHash(
  cohort: RegionalEcologyLegacyCohortV1,
  regions: readonly RegionalEcologyRegionDeltaV1[],
): string {
  return hashCanonical({
    legacyCohort: cohort,
    regions: adoptionRegionAuthority(regions),
  });
}

function adoptionRegionAuthority(
  regions: readonly RegionalEcologyRegionDeltaV1[],
): readonly unknown[] {
  return Object.freeze(regions.flatMap((region) => (
    region.legacyPlacements.length === 0 && region.legacyAggregatePlacements.length === 0
      ? []
      : [Object.freeze({
          version: region.version,
          region: region.region,
          key: region.key,
          regionId: region.regionId,
          baselineHash: region.baselineHash,
          legacyPlacements: region.legacyPlacements,
          legacyAggregatePlacements: region.legacyAggregatePlacements,
          baselineSuppressedUnits: region.baselineSuppressedUnits,
        })]
  )));
}

function legacyPatchMatchesSeed(patch: CoreEcologyAggregatePatchState, seed: RootSeed): boolean {
  const fingerprint = seed.map((word) => word.toString(36).padStart(7, "0")).join(".");
  return patch.populations.every((population) => population.members.every(
    ({ actor }) => stableStringify(actor.identity) === stableStringify(generateCoreWildlifeIdentity({
      seed,
      species: actor.identity.species,
      originRegion: actor.identity.originRegion,
      populationKey: actor.identity.populationKey,
      populationOrdinal: actor.identity.populationOrdinal,
    })),
  )) && patch.groups.groups.every(({ identity }) => identity.seedFingerprint === fingerprint)
    && patch.aggregatePopulations.every(({ seedFingerprint: value }) => value === fingerprint);
}

function legacyActorByPopulationOrdinal(
  patch: CoreEcologyAggregatePatchState,
): ReadonlyMap<string, CoreWildlifeActorState> {
  const result = new Map<string, CoreWildlifeActorState>();
  for (const population of patch.populations) {
    for (const member of population.members) {
      result.set(populationOrdinalKey(population.populationKey, member.populationOrdinal), member.actor);
    }
  }
  return result;
}

function populationOrdinalKey(populationKey: string, ordinal: number): string {
  return `${populationKey.length}:${populationKey}:${ordinal}`;
}

function sealRoot(value: Omit<RegionalEcologyRootV1, "integrity">): RegionalEcologyRootV1 {
  const candidate = { ...value, integrity: hashCanonical(value) };
  const root = canonicalizeRegionalEcologyRoot(candidate);
  if (root === null) throw new Error("Generated regional ecology root failed validation");
  return root;
}

function seedFingerprint(seed: RootSeed): string {
  requireRootSeed(seed);
  return hashCanonical([...seed]);
}

function requireBinding(binding: RegionalEcologyWorldBinding): void {
  if (!plainRecord(binding) || !Object.hasOwn(binding, "rootSeed")
    || !Object.hasOwn(binding, "completedTick")) {
    throw new TypeError("Regional ecology requires a world binding");
  }
  requireRootSeed(binding.rootSeed);
  if (!nonnegativeSafeInteger(binding.completedTick)) {
    throw new RangeError("Regional ecology tick must be a nonnegative safe integer");
  }
}

function requireRootSeed(seed: RootSeed): void {
  if (!Array.isArray(seed) || seed.length !== 4 || seed.some((word) => (
    !Number.isSafeInteger(word) || word < 0 || word > UINT32_MAX || Object.is(word, -0)
  ))) throw new RangeError("Regional ecology seed must contain four canonical uint32 words");
}

function copyRegion(region: RegionCoord): RegionCoord {
  return Object.freeze({ x: region.x, y: region.y });
}

function copyPosition(position: WorldPosition): WorldPosition {
  return createWorldPosition(position.region, position.localX, position.localY);
}

function comparePopulationAccounting(
  left: RegionalEcologyPopulationAccountingV1,
  right: RegionalEcologyPopulationAccountingV1,
): number {
  return compareText(left.species, right.species) || compareText(left.populationKey, right.populationKey);
}

function compareActorDisposition(
  left: RegionalEcologyActorDispositionV1,
  right: RegionalEcologyActorDispositionV1,
): number {
  return compareText(left.actorId, right.actorId);
}

function compareGroupDisposition(
  left: RegionalEcologyGroupDispositionV1,
  right: RegionalEcologyGroupDispositionV1,
): number {
  return compareText(left.groupId, right.groupId);
}

function compareAggregateDisposition(
  left: RegionalEcologyAggregateDispositionV1,
  right: RegionalEcologyAggregateDispositionV1,
): number {
  return compareText(left.aggregateId, right.aggregateId);
}

function uniqueOrdered<T>(values: readonly T[], compare: (left: T, right: T) => number): boolean {
  for (let index = 1; index < values.length; index += 1) {
    if (compare(values[index - 1]!, values[index]!) === 0) return false;
  }
  return true;
}

function serializedBytes(value: unknown): number {
  return UTF8_ENCODER.encode(stableStringify(value)).byteLength;
}

function validHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function validRegionalId(value: unknown): value is string {
  return typeof value === "string" && REGIONAL_ID_PATTERN.test(value);
}

function canonicalStringIds(values: readonly unknown[]): readonly string[] | null {
  if (values.some((value) => !validId(value))) return null;
  const result = (values as readonly string[]).slice().sort(compareText);
  return uniqueOrdered(result, compareText) ? Object.freeze(result) : null;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function plainRecord(value: unknown): value is Record<string, any> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

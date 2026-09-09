import { describe, expect, it } from "vitest";

import {
  ACTOR_PERCEPTION_SCALE,
  createActorObservation,
} from "../sim/actorPerception";
import { seedFromText, type RootSeed } from "../sim/rng";
import {
  REGION_COORD_LIMIT,
  createRegionCoord,
  type RegionCoord,
} from "../sim/regions";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { hashCanonical, stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_INDIVIDUAL_SPECIES,
  applyCoreEcologyCrossOwnerWildlifeMortality,
  applyCoreEcologyWildlifeMortality,
  canonicalizeCoreEcologyAggregatePatch,
  coreEcologyAggregatePatchActor,
  createCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  replaceCoreEcologyAggregatePatchCarcass,
  setCoreEcologyAggregatePatchMaterializedActors,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  deriveCoreEcologyMarshEdgeHabitatAssemblage,
  deriveCoreEcologyRainChorusHabitatAssemblage,
  deriveCoreEcologyRegionalPredatorHabitatAssemblage,
} from "./coreEcologyHabitat";
import { createCoreEcologyGroup, createCoreEcologyGroupSet } from "./coreEcologyGroups";
import {
  CORE_ECOLOGY_DOMESTIC_SPECIES,
  deriveCoreEcologyRegionalHabitat,
} from "./coreEcologyRegionalHabitat";
import { createCoreEcologySettlementHomePatch } from "./coreEcologySettlementHome";
import { coreEcologySpeciesPredatorContact } from "./coreEcologySpeciesRuntimePolicy";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  replaceCoreWildlifeActorPhysiology,
  repositionCoreWildlifeActor,
  stepCoreWildlifeActor,
  type CoreWildlifeActorState,
} from "./coreWildlifeActor";
import { claimCoreWildlifeCarcass } from "./coreWildlifeCarcass";
import { resolveCoreWildlifePredatorContact } from "./coreWildlifeMortality";
import {
  adoptRegionalEcologyFromV24,
  advanceRegionalEcologyRoot,
  deserializeRegionalEcologyRoot,
  serializeRegionalEcologyRoot,
} from "./regionalEcology";
import {
  canonicalRegionalEcologyLegacyCohortInitialProjection,
  canonicalRegionalEcologyLegacyCohortPatchForWorld,
  canonicalRegionalEcologyLegacyCohortTransition,
  projectRegionalEcologyLegacyCohort,
  regionalEcologyLegacyCohortResidentRegions,
} from "./regionalEcologyLegacyCohort";
import {
  REGION_WIDTH_UNITS,
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
} from "./worldPosition";

const SEED = seedFromText("alpha32 receipt-bound legacy cohort");
const OTHER_SEED = seedFromText("alpha32 receipt-bound legacy cohort wrong world");
const AGGREGATE_SEED = seedFromText("alpha seventeen rain chorus shadow overhead");
const ORIGIN = createRegionCoord(-7, 11);
const AGGREGATE_ORIGIN = createRegionCoord(0, 0);
const TICK = 19;
const ENVELOPE_INTEGRITY = hashCanonical("alpha32 authenticated v24 envelope");

describe("regional ecology legacy-cohort v1", () => {
  it("projects only active receipt authority with exact unit conservation and stable lineage", () => {
    const source = mixedWildSourcePatch();
    const gulls = source.populations.find(({ species }) => species === "gull")!
      .members.map(({ actor }) => actor.identity.stableId);
    const rabbit = actorOf(source, "marsh-rabbit").identity.stableId;
    const firstRoot = adopt(source, [rabbit, ...gulls]);
    const reorderedRoot = adopt(source, [...gulls].reverse().concat(rabbit));
    expect(reorderedRoot).toEqual(firstRoot);

    const projected = projectRegionalEcologyLegacyCohort({
      rootSeed: SEED,
      root: firstRoot,
    });
    expect(projected).not.toBeNull();
    if (projected === null || firstRoot.adoption === null) return;
    expect(projected.derivation).toMatchObject({
      kind: "legacy-cohort-v1",
      adoptionTransactionId: firstRoot.adoption.transactionId,
      sourcePatchHash: firstRoot.adoption.sourceCoreEcologyHash,
    });
    expect(projected.originRegion).toEqual(source.originRegion);
    expect(projected.populations.flatMap(({ members }) => members)
      .every(({ materialization }) => materialization === "coarse")).toBe(true);

    const retired = new Set(firstRoot.adoption.actorDispositions
      .filter(({ disposition }) => disposition === "retired")
      .map(({ actorId }) => actorId));
    expect(retired.size).toBeGreaterThan(0);
    const projectedIds = new Set(projected.populations.flatMap(({ members }) => (
      members.map(({ actor }) => actor.identity.stableId)
    )));
    expect([...retired].every((actorId) => !projectedIds.has(actorId))).toBe(true);
    for (const disposition of firstRoot.adoption.actorDispositions) {
      if (disposition.disposition === "retired") continue;
      const actor = projected.populations.flatMap(({ members }) => members)
        .find(({ actor: candidate }) => candidate.identity.stableId === disposition.actorId)?.actor;
      expect(actor?.address.position).toEqual(disposition.destinationPosition);
      expect(actor?.identity.originRegion).toEqual(source.originRegion);
    }
    for (const population of source.populations) {
      const retiredUnits = firstRoot.adoption.actorDispositions
        .filter(({ species, populationKey, disposition }) => (
          species === population.species
          && populationKey === population.populationKey
          && disposition === "retired"
        ))
        .reduce((sum, entry) => sum + entry.representedUnits, 0);
      const actual = projected.populations.find(({ species, populationKey }) => (
        species === population.species && populationKey === population.populationKey
      ));
      const expectedBaseline = population.baselinePopulationSize - retiredUnits;
      if (expectedBaseline === 0) {
        expect(actual).toBeUndefined();
      } else {
        expect(actual?.baselinePopulationSize).toBe(expectedBaseline);
        expect(actual?.populationSize).toBe(population.populationSize - retiredUnits);
        expect(actual?.reserveUnits).toBe(population.reserveUnits);
      }
    }
    expect(projected.groups.groups).toHaveLength(1);
    expect(projected.groups.groups[0]?.memberOrdinals).toEqual([0, 1]);
    expect(canonicalRegionalEcologyLegacyCohortInitialProjection(projected, {
      rootSeed: SEED,
      root: firstRoot,
      completedTick: TICK,
    })).toBe(projected);
    expect(canonicalRegionalEcologyLegacyCohortPatchForWorld(projected, {
      rootSeed: SEED,
      root: firstRoot,
      completedTick: TICK,
    })).toBe(projected);
    expect(canonicalRegionalEcologyLegacyCohortTransition(projected, projected, {
      rootSeed: SEED,
      root: firstRoot,
      completedTick: TICK,
    })).toBe(projected);

    const stepped = stepCoreEcologyAggregatePatch(projected, {
      tick: TICK + 1,
      actorSteps: [],
    });
    const advancedRoot = advanceRegionalEcologyRoot(firstRoot, TICK + 1);
    expect(projectRegionalEcologyLegacyCohort({
      rootSeed: SEED,
      root: advancedRoot,
    })).toBeNull();
    expect(stepped).not.toBeNull();
    expect(canonicalRegionalEcologyLegacyCohortInitialProjection(stepped?.patch, {
      rootSeed: SEED,
      root: advancedRoot,
      completedTick: TICK + 1,
    })).toBeNull();
    expect(canonicalRegionalEcologyLegacyCohortPatchForWorld(stepped?.patch, {
      rootSeed: SEED,
      root: advancedRoot,
      completedTick: TICK + 1,
    })).toBe(stepped?.patch);
    expect(canonicalRegionalEcologyLegacyCohortTransition(projected, stepped?.patch, {
      rootSeed: SEED,
      root: advancedRoot,
      completedTick: TICK + 1,
    })).toBe(stepped?.patch);
  });

  it("keeps settlement-home domestics and storehouse rats out of open-country authority", () => {
    const home = settlementHomeSource();
    const root = adopt(home.patch, [] , home.seed);
    const projected = projectRegionalEcologyLegacyCohort({ rootSeed: home.seed, root });
    expect(projected).not.toBeNull();
    expect(projected?.populations.flatMap(({ members }) => members)).toEqual([]);
    expect(projected?.groups.groups).toEqual([]);
    expect(projected?.aggregatePopulations.some(({ species }) => species === "brown-rat"))
      .toBe(false);
    expect(projected?.populations.some(({ species, members }) => (
      CORE_ECOLOGY_DOMESTIC_SPECIES.includes(species) && members.length > 0
    ))).toBe(false);
    expect(regionalEcologyLegacyCohortResidentRegions(projected)).toEqual([]);
    if (projected === null) return;
    const duplicatedHomeAuthority = JSON.parse(stableStringify(projected)) as any;
    duplicatedHomeAuthority.populations.push(home.patch.populations[0]);
    duplicatedHomeAuthority.aggregatePopulations.push(home.patch.aggregatePopulations[0]);
    expect(canonicalizeCoreEcologyAggregatePatch(duplicatedHomeAuthority)).not.toBeNull();
    expect(canonicalRegionalEcologyLegacyCohortPatchForWorld(duplicatedHomeAuthority, {
      rootSeed: home.seed,
      root,
      completedTick: TICK,
    })).toBeNull();
  });

  it("preserves one active wild aggregate at its receipt-owned residence", () => {
    const source = aggregateWildSourcePatch();
    const sourceFrogs = source.aggregatePopulations.find(({ species }) => (
      species === "southern-leopard-frog"
    ));
    expect(sourceFrogs).toBeDefined();
    if (sourceFrogs === undefined) return;
    const root = adoptRegionalEcologyFromV24({
      rootSeed: AGGREGATE_SEED,
      completedTick: source.updatedAtTick,
      sourceEnvelopeIntegrity: ENVELOPE_INTEGRITY,
      legacyPatch: source,
      protectedAggregateIds: [sourceFrogs.aggregateId],
    });
    const disposition = root.adoption?.aggregateDispositions.find(({ aggregateId }) => (
      aggregateId === sourceFrogs.aggregateId
    ));
    expect(disposition?.disposition).not.toBe("retired");
    expect(disposition?.destinationRegion).not.toBeNull();

    const projected = projectRegionalEcologyLegacyCohort({
      rootSeed: AGGREGATE_SEED,
      root,
    });
    const projectedFrogs = projected?.aggregatePopulations.find(({ aggregateId }) => (
      aggregateId === sourceFrogs.aggregateId
    ));
    expect(projectedFrogs).toBeDefined();
    if (
      projected === null
      || projectedFrogs === undefined
      || disposition?.destinationRegion === null
      || disposition?.destinationRegion === undefined
    ) return;
    const { anchors: sourceAnchors, ...sourceState } = sourceFrogs;
    const { anchors: projectedAnchors, ...projectedState } = projectedFrogs;
    expect(projectedState).toEqual(sourceState);
    expect(projectedAnchors.map(({ position }) => position.region))
      .toEqual(sourceAnchors.map(() => disposition.destinationRegion));
    expect(projectedAnchors.map(({ position }) => [position.localX, position.localY]))
      .toEqual(sourceAnchors.map(({ position }) => [position.localX, position.localY]));
    expect(regionalEcologyLegacyCohortResidentRegions(projected))
      .toContainEqual(disposition.destinationRegion);
    expect(canonicalRegionalEcologyLegacyCohortInitialProjection(projected, {
      rootSeed: AGGREGATE_SEED,
      root,
      completedTick: TICK,
    })).toBe(projected);

    const droppedAuthority = JSON.parse(stableStringify(projected)) as any;
    droppedAuthority.aggregatePopulations = droppedAuthority.aggregatePopulations.filter(
      ({ aggregateId }: { aggregateId: string }) => aggregateId !== sourceFrogs.aggregateId,
    );
    expect(canonicalizeCoreEcologyAggregatePatch(droppedAuthority)).not.toBeNull();
    expect(canonicalRegionalEcologyLegacyCohortPatchForWorld(droppedAuthority, {
      rootSeed: AGGREGATE_SEED,
      root,
      completedTick: TICK,
    })).toBeNull();
  });

  it("round-trips deterministically and rejects seed, lineage, and retired-unit tamper", () => {
    const source = mixedWildSourcePatch();
    const rabbit = actorOf(source, "marsh-rabbit").identity.stableId;
    const root = adopt(source, [rabbit]);
    const reloaded = deserializeRegionalEcologyRoot(serializeRegionalEcologyRoot(root));
    expect(reloaded).not.toBeNull();
    if (reloaded === null || reloaded.adoption === null) return;
    const projected = projectRegionalEcologyLegacyCohort({ rootSeed: SEED, root: reloaded });
    expect(projected).not.toBeNull();
    if (projected === null) return;
    expect(projectRegionalEcologyLegacyCohort({ rootSeed: SEED, root: reloaded }))
      .toEqual(projected);
    expect(projectRegionalEcologyLegacyCohort({ rootSeed: OTHER_SEED, root: reloaded }))
      .toBeNull();

    const renamed = JSON.parse(stableStringify(projected)) as any;
    renamed.patchKey = "legacy-cohort-v1:0000000000000000";
    expect(canonicalizeCoreEcologyAggregatePatch(renamed)).not.toBeNull();
    expect(canonicalRegionalEcologyLegacyCohortPatchForWorld(renamed, {
      rootSeed: SEED,
      root: reloaded,
      completedTick: TICK,
    })).toBeNull();

    const retiredId = reloaded.adoption.actorDispositions.find(({ disposition }) => (
      disposition === "retired"
    ))?.actorId;
    const retiredMember = source.populations.flatMap((population) => (
      population.members.map((member) => ({ population, member }))
    )).find(({ member }) => member.actor.identity.stableId === retiredId);
    expect(retiredMember).toBeDefined();
    if (retiredMember === undefined) return;
    const reactivated = JSON.parse(stableStringify(projected)) as any;
    reactivated.populations.push({
      species: retiredMember.population.species,
      populationKey: retiredMember.population.populationKey,
      baselinePopulationSize: retiredMember.member.representedUnits,
      populationSize: retiredMember.member.representedUnits,
      reserveUnits: 0,
      members: [{
        populationOrdinal: retiredMember.member.populationOrdinal,
        representedUnits: retiredMember.member.representedUnits,
        materialization: "coarse",
        actor: retiredMember.member.actor,
      }],
    });
    expect(canonicalizeCoreEcologyAggregatePatch(reactivated)).not.toBeNull();
    expect(canonicalRegionalEcologyLegacyCohortPatchForWorld(reactivated, {
      rootSeed: SEED,
      root: reloaded,
      completedTick: TICK,
    })).toBeNull();
  });

  it("preserves committed mortality, one body, and its exact claimant", () => {
    const source = claimedBodySourcePatch();
    const root = adopt(source);
    const projected = projectRegionalEcologyLegacyCohort({ rootSeed: SEED, root });
    expect(projected).not.toBeNull();
    expect(projected?.nextMortalityOrdinal).toBe(source.nextMortalityOrdinal);
    expect(projected?.mortalityTransactions).toEqual(source.mortalityTransactions);
    expect(projected?.carcasses).toEqual(source.carcasses);
    expect(projected?.carcasses[0]?.currentClaimantActorId)
      .toBe(source.carcasses[0]?.currentClaimantActorId);
    expect(canonicalRegionalEcologyLegacyCohortInitialProjection(projected, {
      rootSeed: SEED,
      root,
      completedTick: source.updatedAtTick,
    })).toBe(projected);
  });

  it("accepts one root-resolved external-attacker death of a live legacy victim", () => {
    const source = mixedWildSourcePatch();
    const rabbitId = actorOf(source, "marsh-rabbit").identity.stableId;
    const root = adopt(source, [rabbitId]);
    const projected = projectRegionalEcologyLegacyCohort({ rootSeed: SEED, root });
    expect(projected).not.toBeNull();
    if (projected === null) return;

    const completedTick = TICK + 1;
    const steppedRoot = advanceRegionalEcologyRoot(root, completedTick);
    const staged = stageExternalFoxAgainstLegacyVictim(
      projected,
      rabbitId,
      completedTick,
    );
    const attackerBefore = stableStringify(staged.attacker);
    const liveUnitsBefore = staged.victim.populations.reduce(
      (sum, population) => sum + population.populationSize,
      0,
    );
    const committed = applyCoreEcologyCrossOwnerWildlifeMortality(staged.victim, {
      attackerPatch: staged.attacker,
      result: staged.result,
      temperature: 500_000,
    });
    expect(committed?.transaction).not.toBeNull();
    expect(committed?.carcass).not.toBeNull();
    expect(stableStringify(staged.attacker)).toBe(attackerBefore);
    expect(committed?.patch.populations.reduce(
      (sum, population) => sum + population.populationSize,
      0,
    )).toBe(liveUnitsBefore - 1);
    expect(committed?.patch.mortalityTransactions).toHaveLength(
      staged.victim.mortalityTransactions.length + 1,
    );
    expect(committed?.patch.carcasses).toHaveLength(staged.victim.carcasses.length + 1);
    expect(committed?.transaction?.event).toMatchObject({
      attackerId: staged.result.event.attackerId,
      victimId: rabbitId,
      outcome: "death",
    });
    expect(canonicalRegionalEcologyLegacyCohortTransition(
      staged.victim,
      committed?.patch,
      { rootSeed: SEED, root: steppedRoot, completedTick },
    )).toBe(committed?.patch);
  });

  it("retains exact lineage and residence at extreme signed region coordinates", () => {
    const extreme = createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT);
    const source = createCoreEcologyAggregatePatch({
      seed: SEED,
      patchKey: "alpha32:extreme-v24-source",
      originRegion: extreme,
      tick: TICK,
      derivation: { kind: "bounded-input-v1" },
      populations: [{
        species: "marsh-rabbit",
        populationKey: "alpha32/extreme-rabbit",
        members: [{
          populationOrdinal: 0,
          representedUnits: 1,
          position: createWorldPosition(extreme, REGION_WIDTH_UNITS - 1, 0),
          materialization: "materialized",
        }],
      }],
    });
    const actorId = actorOf(source, "marsh-rabbit").identity.stableId;
    const root = adopt(source, [actorId]);
    const projected = projectRegionalEcologyLegacyCohort({ rootSeed: SEED, root });
    expect(projected?.originRegion).toEqual(extreme);
    expect(projected?.populations[0]?.members[0]?.actor.identity.originRegion).toEqual(extreme);
    expect(projected?.populations[0]?.members[0]?.actor.address.position.region).toEqual(extreme);
    expect(regionalEcologyLegacyCohortResidentRegions(projected)).toEqual([extreme]);
  });
});

function mixedWildSourcePatch(): CoreEcologyAggregatePatchState {
  const firstGull = createWorldPosition(ORIGIN, 21_000, 20_000);
  const secondGull = createWorldPosition(ORIGIN, 22_000, 20_000);
  const absentSpecies = wildSpeciesWithoutNearbyCapacity(SEED, ORIGIN);
  const group = createCoreEcologyGroup({
    seed: SEED,
    species: "gull",
    originRegion: ORIGIN,
    populationKey: "alpha32/gull",
    groupOrdinal: 0,
    memberOrdinals: [0, 1],
    anchor: firstGull,
    tick: TICK,
  });
  return createCoreEcologyAggregatePatch({
    seed: SEED,
    patchKey: "alpha32:legacy-cohort-source",
    originRegion: ORIGIN,
    tick: TICK,
    derivation: { kind: "bounded-input-v1" },
    groups: createCoreEcologyGroupSet([group]),
    populations: [{
      species: "gull",
      populationKey: "alpha32/gull",
      populationSize: 2,
      members: [firstGull, secondGull].map((position, populationOrdinal) => ({
        populationOrdinal,
        position,
        materialization: "materialized" as const,
      })),
    }, {
      species: "marsh-rabbit",
      populationKey: "alpha32/marsh-rabbit",
      populationSize: 4,
      members: [{
        populationOrdinal: 0,
        representedUnits: 4,
        position: createWorldPosition(ORIGIN, 23_000, 20_000),
        materialization: "materialized",
      }],
    }, {
      species: absentSpecies,
      populationKey: `alpha32/no-capacity/${absentSpecies}`,
      members: [{
        populationOrdinal: 0,
        position: createWorldPosition(ORIGIN, 24_000, 20_000),
        materialization: "materialized",
      }],
    }],
  });
}

function wildSpeciesWithoutNearbyCapacity(seed: RootSeed, origin: RegionCoord) {
  const candidates = CORE_ECOLOGY_INDIVIDUAL_SPECIES.filter((species) => (
    !CORE_ECOLOGY_DOMESTIC_SPECIES.includes(species)
    && species !== "gull"
    && species !== "marsh-rabbit"
  ));
  const species = candidates.find((candidate) => {
    for (let y = -2; y <= 2; y += 1) {
      for (let x = -2; x <= 2; x += 1) {
        const habitat = deriveCoreEcologyRegionalHabitat({
          seed,
          region: createRegionCoord(origin.x + x, origin.y + y),
        });
        if (habitat.populations.some(({ species: found, populationUnits }) => (
          found === candidate && populationUnits > 0
        ))) return false;
      }
    }
    return true;
  });
  if (species === undefined) throw new Error("Fixture lacks a locally absent wild species");
  return species;
}

function settlementHomeSource() {
  const seed = seedFromText("alpha32 legacy domestic ownership split");
  const originRegion = createRegionCoord(0, 0);
  const halfTile = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
  for (let y = 8; y < WORLD_HEIGHT - 8; y += 16) {
    for (let x = 8; x < WORLD_WIDTH - 8; x += 16) {
      try {
        const habitat = deriveCoreEcologyRegionalPredatorHabitatAssemblage({
          rootSeed: seed,
          originRegion,
          domesticAnchor: {
            anchorId: `alpha32:legacy-home:${x}:${y}`,
            species: "domestic-chicken",
            position: createWorldPosition(
              originRegion,
              x * WORLD_POSITION_UNITS_PER_TILE + halfTile,
              y * WORLD_POSITION_UNITS_PER_TILE + halfTile,
            ),
            radiusTiles: 8,
          },
        });
        return Object.freeze({
          seed,
          patch: createCoreEcologySettlementHomePatch({ seed, habitat, tick: TICK }),
        });
      } catch {
        // Continue to the next deterministic lawful home anchor.
      }
    }
  }
  throw new Error("Fixture lacks a lawful settlement home");
}

function mortalitySourcePatch(): CoreEcologyAggregatePatchState {
  const focus = createWorldPosition(
    ORIGIN,
    Math.trunc(WORLD_WIDTH / 2) * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    Math.trunc(WORLD_HEIGHT / 2) * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
  );
  const habitat = deriveCoreEcologyMarshEdgeHabitatAssemblage({
    rootSeed: SEED,
    originRegion: ORIGIN,
    focus: { position: focus, radiusTiles: 32 },
  });
  const populations: readonly CoreEcologyPopulationInput[] = habitat.populations.flatMap(
    (population) => population.representation !== "individual-representatives"
        || population.populationUnits === 0
      ? []
      : [{
          species: population.species,
          populationKey: population.populationKey,
          populationSize: population.populationUnits,
          members: population.allocations.map((allocation, index) => ({
            populationOrdinal: allocation.allocationOrdinal,
            representedUnits: allocation.representedUnits,
            position: allocation.position,
            materialization: index === 0
                && (population.species === "marsh-rabbit" || population.species === "marsh-fox")
              ? "materialized" as const
              : "coarse" as const,
          })),
        }],
  );
  return createCoreEcologyAggregatePatch({
    seed: SEED,
    patchKey: "alpha32:legacy-mortality-source",
    originRegion: ORIGIN,
    derivation: { kind: "habitat-v3", habitat },
    populations,
  });
}

function aggregateWildSourcePatch(): CoreEcologyAggregatePatchState {
  const focus = createWorldPosition(
    AGGREGATE_ORIGIN,
    Math.trunc(WORLD_WIDTH / 2) * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    Math.trunc(WORLD_HEIGHT / 2) * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
  );
  const habitat = deriveCoreEcologyRainChorusHabitatAssemblage({
    rootSeed: AGGREGATE_SEED,
    originRegion: AGGREGATE_ORIGIN,
    focus: { position: focus, radiusTiles: 32 },
  });
  const populations: readonly CoreEcologyPopulationInput[] = habitat.populations.flatMap(
    (population) => population.representation !== "individual-representatives"
        || population.populationUnits === 0
      ? []
      : [{
          species: population.species,
          populationKey: population.populationKey,
          populationSize: population.populationUnits,
          members: population.allocations.map((allocation) => ({
            populationOrdinal: allocation.allocationOrdinal,
            representedUnits: allocation.representedUnits,
            position: allocation.position,
            materialization: "coarse" as const,
          })),
        }],
  );
  return createCoreEcologyAggregatePatch({
    seed: AGGREGATE_SEED,
    patchKey: "alpha32:legacy-wild-aggregate-source",
    originRegion: AGGREGATE_ORIGIN,
    tick: TICK,
    derivation: { kind: "habitat-v4", habitat },
    populations,
  });
}

function claimedBodySourcePatch(): CoreEcologyAggregatePatchState {
  const first = stageContact(mortalitySourcePatch(), 1);
  const injury = applyCoreEcologyWildlifeMortality(first.patch, {
    result: first.result,
    temperature: 500_000,
  });
  if (injury === null) throw new Error("Mortality fixture injury was rejected");
  const second = stageContact(injury.patch, 2);
  const death = applyCoreEcologyWildlifeMortality(second.patch, {
    result: second.result,
    temperature: 500_000,
  });
  if (death === null || death.carcass === null) {
    throw new Error("Mortality fixture death was rejected");
  }
  const fox = actorOf(death.patch, "marsh-fox");
  const claimed = claimCoreWildlifeCarcass(death.carcass, {
    actorId: fox.identity.stableId,
    provenanceId: "alpha32-legacy-claim",
    atTick: death.patch.updatedAtTick,
  });
  if (claimed === null) throw new Error("Mortality fixture claim was rejected");
  const patch = replaceCoreEcologyAggregatePatchCarcass(death.patch, claimed);
  if (patch === null) throw new Error("Mortality fixture body replacement was rejected");
  return patch;
}

function stageContact(patch: CoreEcologyAggregatePatchState, tick: number) {
  const initialRabbit = actorOf(patch, "marsh-rabbit");
  const rabbit = repositionCoreWildlifeActor(initialRabbit, {
    atTick: tick,
    position: createWorldPosition(ORIGIN, 30_000, 24_000),
    heading: 500_000,
  });
  const initialFox = actorOf(patch, "marsh-fox");
  const fedFox = replaceCoreWildlifeActorPhysiology(initialFox, {
    atTick: initialFox.updatedAtTick,
    needs: { ...initialFox.needs, hunger: ACTOR_PERCEPTION_SCALE },
    condition: initialFox.condition,
  });
  let fox = repositionCoreWildlifeActor(fedFox, {
    atTick: initialFox.updatedAtTick,
    position: createWorldPosition(ORIGIN, 29_700, 24_000),
    heading: 0,
  });
  const observation = createActorObservation({
    id: `alpha32-legacy-contact-${tick}`,
    observerId: fox.identity.stableId,
    observedAtTick: tick,
    channel: "vision",
    perceivedClass: "live-prey",
    subjectId: rabbit.identity.stableId,
    area: { center: rabbit.address.position, radiusUnits: 0 },
    confidence: ACTOR_PERCEPTION_SCALE,
    salience: 900_000,
    identification: "identified",
  });
  if (observation === null) throw new Error("Mortality observation fixture was rejected");
  const stepped = stepCoreWildlifeActor(fox, {
    tick,
    observations: [observation],
    foodOpportunities: [{
      resourceId: rabbit.identity.stableId,
      observationId: observation.id,
      foodClass: "live-prey",
      sourceKind: "living-actor",
      availableUnits: 1,
      nutrition: 900_000,
      effort: 10_000,
      risk: 0,
      competition: 0,
      directlyConfirmed: true,
      accessible: true,
    }],
    accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  });
  if (stepped === null || stepped.decision.intent !== "pursue") {
    throw new Error("Mortality fixture predator did not pursue");
  }
  fox = stepped.actor;
  const policy = coreEcologySpeciesPredatorContact("marsh-fox");
  if (policy === null) throw new Error("Missing marsh-fox contact policy");
  const result = resolveCoreWildlifePredatorContact({
    attacker: fox,
    target: rabbit,
    atTick: tick,
    contactRadiusUnits: policy.reachUnits,
    damageUnits: policy.damageUnits,
    cause: policy.cause,
  });
  if (result === null) throw new Error("Mortality fixture contact was rejected");
  return Object.freeze({
    patch: replaceCoreEcologyAggregatePatchActor(
      replaceCoreEcologyAggregatePatchActor(patch, rabbit),
      fox,
    ),
    result,
  });
}

function stageExternalFoxAgainstLegacyVictim(
  legacyPatch: CoreEcologyAggregatePatchState,
  rabbitId: string,
  tick: number,
) {
  const materializedVictim = setCoreEcologyAggregatePatchMaterializedActors(legacyPatch, {
    atTick: tick,
    actorIds: [rabbitId],
  });
  const initialRabbit = coreEcologyAggregatePatchActor(materializedVictim, rabbitId);
  if (initialRabbit === null) throw new Error("Legacy victim fixture disappeared");
  const contact = createWorldPosition(ORIGIN, 30_000, 24_000);
  const weakenedRabbit = replaceCoreWildlifeActorPhysiology(initialRabbit, {
    atTick: tick,
    needs: initialRabbit.needs,
    condition: { ...initialRabbit.condition, health: 500_000 },
  });
  const rabbit = repositionCoreWildlifeActor(weakenedRabbit, {
    atTick: tick,
    position: contact,
    heading: 500_000,
  });
  const victim = replaceCoreEcologyAggregatePatchActor(materializedVictim, rabbit);

  let attacker = createCoreEcologyAggregatePatch({
    seed: SEED,
    patchKey: "alpha32:external-legacy-attacker",
    originRegion: ORIGIN,
    tick: TICK,
    derivation: { kind: "bounded-input-v1" },
    populations: [{
      species: "marsh-fox",
      populationKey: "alpha32/external-legacy-fox",
      members: [{
        populationOrdinal: 0,
        position: contact,
        materialization: "materialized",
      }],
    }],
  });
  const initialFox = actorOf(attacker, "marsh-fox");
  const hungryFox = replaceCoreWildlifeActorPhysiology(initialFox, {
    atTick: TICK,
    needs: { ...initialFox.needs, hunger: ACTOR_PERCEPTION_SCALE },
    condition: initialFox.condition,
  });
  const positionedFox = repositionCoreWildlifeActor(hungryFox, {
    atTick: TICK,
    position: contact,
    heading: 0,
  });
  const observation = createActorObservation({
    id: "alpha32-external-legacy-contact",
    observerId: positionedFox.identity.stableId,
    observedAtTick: tick,
    channel: "vision",
    perceivedClass: "live-prey",
    subjectId: rabbit.identity.stableId,
    area: { center: contact, radiusUnits: 0 },
    confidence: ACTOR_PERCEPTION_SCALE,
    salience: ACTOR_PERCEPTION_SCALE,
    identification: "identified",
  });
  if (observation === null) throw new Error("External legacy observation was rejected");
  const pursuit = stepCoreWildlifeActor(positionedFox, {
    tick,
    observations: [observation],
    foodOpportunities: [{
      resourceId: rabbit.identity.stableId,
      observationId: observation.id,
      foodClass: "live-prey",
      sourceKind: "living-actor",
      availableUnits: 1,
      nutrition: 900_000,
      effort: 10_000,
      risk: 0,
      competition: 0,
      directlyConfirmed: true,
      accessible: true,
    }],
    accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  });
  if (pursuit === null || pursuit.decision.intent !== "pursue") {
    throw new Error("External legacy attacker did not pursue");
  }
  attacker = replaceCoreEcologyAggregatePatchActor(attacker, pursuit.actor);
  const policy = coreEcologySpeciesPredatorContact("marsh-fox");
  if (policy === null) throw new Error("External legacy contact policy is missing");
  const result = resolveCoreWildlifePredatorContact({
    attacker: pursuit.actor,
    target: rabbit,
    atTick: tick,
    contactRadiusUnits: policy.reachUnits,
    damageUnits: policy.damageUnits,
    cause: policy.cause,
  });
  if (result === null || result.event.outcome !== "death") {
    throw new Error("External legacy contact did not resolve a death");
  }
  return Object.freeze({ attacker, victim, result });
}

function adopt(
  patch: CoreEcologyAggregatePatchState,
  protectedActorIds: readonly string[] = [],
  rootSeed: RootSeed = SEED,
) {
  return adoptRegionalEcologyFromV24({
    rootSeed,
    completedTick: patch.updatedAtTick,
    sourceEnvelopeIntegrity: ENVELOPE_INTEGRITY,
    legacyPatch: patch,
    protectedActorIds,
  });
}

function actorOf(
  patch: CoreEcologyAggregatePatchState,
  species: "marsh-fox" | "marsh-rabbit",
): CoreWildlifeActorState {
  const actor = patch.populations.find((population) => population.species === species)
    ?.members[0]?.actor;
  if (actor === undefined) throw new Error(`Missing ${species} fixture`);
  return actor;
}

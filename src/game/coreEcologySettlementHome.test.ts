import { describe, expect, it } from "vitest";
import { createWorld } from "../sim/engine";
import { generateRegionTerrain } from "../sim/regionTerrain";
import { seedFromText, type RootSeed } from "../sim/rng";
import { createRegionCoord } from "../sim/regions";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { hashCanonical, stableStringify } from "../sim/util";
import { createWorldView } from "../sim/view";
import {
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  setCoreEcologyAggregateActivityIntensity,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import { createCoreEcologyMortalityTransaction } from "./coreEcologyMortality";
import {
  deriveCoreEcologyRegionalPredatorHabitatAssemblage,
  type CoreEcologyRegionalPredatorHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  CORE_ECOLOGY_DOMESTIC_SPECIES,
} from "./coreEcologyRegionalHabitat";
import {
  createCoreEcologyGroup,
  createCoreEcologyGroupSet,
  emitCoreEcologyGroupSignal,
  type CoreEcologyGroupState,
} from "./coreEcologyGroups";
import {
  adoptCoreEcologySettlementHomeFromV24,
  canonicalCoreEcologySettlementHomePatch,
  createCoreEcologySettlementHomePatch,
} from "./coreEcologySettlementHome";
import {
  coreEcologySpeciesHasRuntimeCapability,
  coreEcologySpeciesRuntimePolicy,
} from "./coreEcologySpeciesRuntimePolicy";
import { replaceCoreWildlifeActorPhysiology } from "./coreWildlifeActor";
import { createCoreWildlifeCarcass } from "./coreWildlifeCarcass";
import { livingActorAddressForResident } from "./livingActor";
import {
  REGION_WIDTH_UNITS,
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
} from "./worldPosition";

describe("settlement-owned home ecology", () => {
  it("retains only canonical domestic actors and the physical storehouse-rat aggregate", () => {
    const { habitat, seed } = fixture("alpha32 home owner");
    const first = createCoreEcologySettlementHomePatch({ seed, habitat, tick: 14 });
    const replay = createCoreEcologySettlementHomePatch({ seed, habitat, tick: 14 });

    expect(replay).toEqual(first);
    expect(first.derivation.kind).toBe("settlement-home-v1");
    expect(first.populations.map(({ species }) => species).sort())
      .toEqual([...CORE_ECOLOGY_DOMESTIC_SPECIES].sort());
    expect(first.aggregatePopulations.map(({ species }) => species)).toEqual(["brown-rat"]);
    expect(first.groups.groups.map(({ identity }) => identity.species).sort())
      .toEqual(["domestic-chicken", "domestic-goat"]);
    expect(canonicalCoreEcologySettlementHomePatch(first, {
      seed,
      habitat,
      completedTick: 14,
    })).toBe(first);
  });

  it("keeps a lawful zero-cat habitat while retaining both anchored livestock populations", () => {
    const { habitat, seed } = runtimeLikeFixture("alpha30 new world stress groups");
    const cat = habitat.populations.find(({ species }) => species === "domestic-cat");
    expect(cat?.populationUnits).toBe(0);

    const home = createCoreEcologySettlementHomePatch({ seed, habitat, tick: 17 });
    expect(home.populations.map(({ species }) => species).sort()).toEqual([
      "domestic-chicken",
      "domestic-goat",
    ]);
    expect(home.groups.groups.map(({ identity }) => identity.species).sort()).toEqual([
      "domestic-chicken",
      "domestic-goat",
    ]);
    expect(canonicalCoreEcologySettlementHomePatch(home, {
      seed,
      habitat,
      completedTick: 17,
    })).toBe(home);

    const adopted = adoptCoreEcologySettlementHomeFromV24({
      seed,
      habitat,
      completedTick: 17,
      sourcePatch: v24Patch(seed, habitat, 17),
    });
    expect(adopted).not.toBeNull();
    expect(adopted?.populations.map(({ species }) => species).sort()).toEqual([
      "domestic-chicken",
      "domestic-goat",
    ]);
    expect(adopted?.populations).toEqual(home.populations);
  });

  it("adopts exact v24 domestic, group, and rat state without retaining wild authority", () => {
    const { habitat, seed } = fixture("alpha32 home lineage");
    let legacy = v24Patch(seed, habitat, 14);
    const cat = legacy.populations.find(({ species }) => species === "domestic-cat")
      ?.members[0]?.actor;
    const rat = legacy.aggregatePopulations.find(({ species }) => species === "brown-rat");
    const group = legacy.groups.groups.find(({ identity }) => (
      CORE_ECOLOGY_DOMESTIC_SPECIES.includes(identity.species)
    ));
    if (cat === undefined || rat === undefined || group === undefined) {
      throw new Error("v24 settlement adoption fixture is incomplete");
    }
    legacy = replaceCoreEcologyAggregatePatchActor(legacy, replaceCoreWildlifeActorPhysiology(cat, {
      atTick: 14,
      needs: { ...cat.needs, hunger: Math.min(1_000_000, cat.needs.hunger + 123_456) },
      condition: cat.condition,
    }));
    const withRatActivity = setCoreEcologyAggregateActivityIntensity(legacy, {
      aggregateId: rat.aggregateId,
      atTick: 14,
      intensity: rat.activitySignal.intensity === 654_321 ? 654_320 : 654_321,
    });
    if (withRatActivity === null) throw new Error("Rat activity fixture failed");
    legacy = withRatActivity;
    const signaled = emitCoreEcologyGroupSignal(group, {
      atTick: 14,
      kind: "alarm",
      causeReferenceId: "alpha32:home-adoption",
      sourceMemberOrdinal: group.memberOrdinals[0]!,
      pressure: 600_000,
      movementHeading: 250_000,
    });
    if (signaled === null) throw new Error("Domestic group signal fixture failed");
    const revised = canonicalizeCoreEcologyAggregatePatch({
      ...legacy,
      groups: createCoreEcologyGroupSet(legacy.groups.groups.map((candidate) => (
        candidate.identity.stableId === signaled.identity.stableId ? signaled : candidate
      ))),
    });
    if (revised === null) throw new Error("Dynamic v24 fixture failed canonicalization");
    legacy = revised;

    const first = adoptCoreEcologySettlementHomeFromV24({
      seed,
      habitat,
      completedTick: 14,
      sourcePatch: legacy,
    });
    const replay = adoptCoreEcologySettlementHomeFromV24({
      seed,
      habitat,
      completedTick: 14,
      sourcePatch: legacy,
    });
    expect(first).not.toBeNull();
    expect(replay).toEqual(first);
    if (first === null) return;
    expect(first.derivation.kind).toBe("settlement-home-v1");
    expect(first.populations).toEqual(legacy.populations.filter(({ species }) => (
      CORE_ECOLOGY_DOMESTIC_SPECIES.includes(species)
    )));
    expect(first.groups.groups).toEqual(legacy.groups.groups.filter(({ identity }) => (
      CORE_ECOLOGY_DOMESTIC_SPECIES.includes(identity.species)
    )));
    expect(first.aggregatePopulations).toEqual([ratWithState(legacy)]);
    expect(first.populations.some(({ species }) => (
      !CORE_ECOLOGY_DOMESTIC_SPECIES.includes(species)
    ))).toBe(false);
    expect(first.groups.groups.some(({ identity }) => (
      !CORE_ECOLOGY_DOMESTIC_SPECIES.includes(identity.species)
    ))).toBe(false);
    expect(first.aggregatePopulations.some(({ species }) => species !== "brown-rat")).toBe(false);
    expect(first.nextMortalityOrdinal).toBe(0);
    expect(first.mortalityTransactions).toEqual([]);
    expect(first.carcasses).toEqual([]);
    expect(new Set(first.populations.flatMap(({ members }) => (
      members.map(({ actor }) => actor.identity.stableId)
    ))).size).toBe(first.populations.flatMap(({ members }) => members).length);
    expect(canonicalCoreEcologySettlementHomePatch(first, {
      seed,
      habitat,
      completedTick: 14,
    })).toBe(first);
  });

  it("leaves every v24 mortality and body record solely in the legacy owner", () => {
    const { habitat, seed } = fixture("alpha32 home mortality ownership");
    const source = withHistoricalMortality(v24Patch(seed, habitat, 14));
    const sourceBefore = stableStringify(source);
    expect(source.mortalityTransactions).toHaveLength(1);
    expect(source.carcasses).toHaveLength(1);

    const adopted = adoptCoreEcologySettlementHomeFromV24({
      seed,
      habitat,
      completedTick: 14,
      sourcePatch: source,
    });
    expect(adopted).not.toBeNull();
    expect(adopted?.nextMortalityOrdinal).toBe(0);
    expect(adopted?.mortalityTransactions).toEqual([]);
    expect(adopted?.carcasses).toEqual([]);
    expect(stableStringify(source)).toBe(sourceBefore);
  });

  it("fails closed against another seed or habitat authority", () => {
    const first = fixture("alpha32 home binding a");
    const second = fixture("alpha32 home binding b");
    const home = createCoreEcologySettlementHomePatch({
      seed: first.seed,
      habitat: first.habitat,
      tick: 9,
    });
    expect(canonicalCoreEcologySettlementHomePatch(home, {
      seed: second.seed,
      habitat: first.habitat,
      completedTick: 9,
    })).toBeNull();
    expect(() => createCoreEcologySettlementHomePatch({
      seed: second.seed,
      habitat: first.habitat,
      tick: 9,
    })).toThrow(/root seed/u);
    expect(canonicalCoreEcologySettlementHomePatch(home, {
      seed: first.seed,
      habitat: second.habitat,
      completedTick: 9,
    })).toBeNull();
  });

  it("rejects v24 seed, clock, derivation, and group-atomicity tamper", () => {
    const first = fixture("alpha32 home adoption binding");
    const second = fixture("alpha32 home adoption foreign binding");
    const source = v24Patch(first.seed, first.habitat, 21);
    const adopt = (sourcePatch: CoreEcologyAggregatePatchState, overrides: Partial<{
      seed: RootSeed;
      habitat: CoreEcologyRegionalPredatorHabitatAssemblage;
      completedTick: number;
    }> = {}) => adoptCoreEcologySettlementHomeFromV24({
      seed: overrides.seed ?? first.seed,
      habitat: overrides.habitat ?? first.habitat,
      completedTick: overrides.completedTick ?? 21,
      sourcePatch,
    });

    expect(adopt(source)).not.toBeNull();
    expect(adopt(source, { completedTick: 20 })).toBeNull();
    expect(adopt(source, { seed: second.seed })).toBeNull();
    expect(adopt(source, { habitat: second.habitat })).toBeNull();
    expect(adopt(createCoreEcologySettlementHomePatch({
      seed: first.seed,
      habitat: first.habitat,
      tick: 21,
    }))).toBeNull();

    const foreignLineage = v24Patch(second.seed, first.habitat, 21);
    expect(adopt(foreignLineage)).toBeNull();

    const legacyCompatible = canonicalizeCoreEcologyAggregatePatch({
      ...source,
      derivation: {
        kind: "legacy-fixed-v1-with-habitat-v11",
        habitat: first.habitat,
      },
    });
    expect(legacyCompatible).not.toBeNull();
    if (legacyCompatible !== null) expect(adopt(legacyCompatible)).not.toBeNull();

    const missingDomesticGroup = canonicalizeCoreEcologyAggregatePatch({
      ...source,
      groups: createCoreEcologyGroupSet(source.groups.groups.filter(({ identity }) => (
        identity.species !== "domestic-chicken"
      ))),
    });
    expect(missingDomesticGroup).not.toBeNull();
    if (missingDomesticGroup !== null) expect(adopt(missingDomesticGroup)).toBeNull();

    const serializedClone = JSON.parse(stableStringify(source)) as CoreEcologyAggregatePatchState;
    expect(adopt(serializedClone)).not.toBeNull();
  });
});

function fixture(seedText: string) {
  const seed = seedFromText(seedText);
  const originRegion = createRegionCoord(0, 0);
  const terrain = generateRegionTerrain(seed, originRegion);
  const halfTile = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
  for (let y = 8; y < WORLD_HEIGHT - 8; y += 16) {
    for (let x = 8; x < WORLD_WIDTH - 8; x += 16) {
      const domesticAnchor = {
        anchorId: `alpha32:home:${x}:${y}`,
        species: "domestic-chicken" as const,
        position: createWorldPosition(
          originRegion,
          x * WORLD_POSITION_UNITS_PER_TILE + halfTile,
          y * WORLD_POSITION_UNITS_PER_TILE + halfTile,
        ),
        radiusTiles: 8,
      } as const;
      try {
        const habitat = deriveCoreEcologyRegionalPredatorHabitatAssemblage({
          rootSeed: seed,
          originRegion,
          terrain,
          domesticAnchor,
        });
        return { seed, habitat };
      } catch {
        // Continue to the next deterministic lawful settlement-home anchor.
      }
    }
  }
  throw new Error(`${seedText}: no lawful settlement-home anchor`);
}

function runtimeLikeFixture(seedText: string) {
  const world = createWorld(seedText, "wild");
  const economy = createWorldView(world);
  const offeredOrigin = economy.contracts.find(({ status }) => status === "offered")
    ?.originSettlementId ?? economy.settlements[0]?.id;
  const originResidents = offeredOrigin === undefined
    ? []
    : economy.residents.filter(({ location }) => (
        location.kind === "settlement" && location.settlementId === offeredOrigin
      ));
  const resident = [...(originResidents.length > 0 ? originResidents : economy.residents)]
    .sort((left, right) => (
      left.identity.stableId < right.identity.stableId
        ? -1
        : left.identity.stableId > right.identity.stableId
          ? 1
          : left.id - right.id
    ))
    .find((candidate) => livingActorAddressForResident(economy, candidate)?.species === "human");
  if (resident === undefined) throw new Error(`${seedText}: no starting porter`);
  const porter = livingActorAddressForResident(economy, resident);
  if (porter?.species !== "human") throw new Error(`${seedText}: porter address is missing`);
  const settlement = economy.settlements.find(({ id }) => (
    id === resident.homeSettlementId
  )) ?? economy.settlements[0];
  const tile = settlement === undefined ? undefined : economy.terrain.tiles[settlement.tileIndex];
  if (settlement === undefined || tile === undefined) {
    throw new Error(`${seedText}: starting settlement is missing`);
  }
  const halfTile = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
  const focus = createWorldPosition(
    porter.position.region,
    Math.min(
      REGION_WIDTH_UNITS - 1,
      (tile.x + 6) * WORLD_POSITION_UNITS_PER_TILE + halfTile,
    ),
    tile.y * WORLD_POSITION_UNITS_PER_TILE + halfTile,
  );
  const domesticPosition = createWorldPosition(
    createRegionCoord(0, 0),
    tile.x * WORLD_POSITION_UNITS_PER_TILE + halfTile,
    tile.y * WORLD_POSITION_UNITS_PER_TILE + halfTile,
  );
  return {
    seed: world.meta.rootSeed,
    habitat: deriveCoreEcologyRegionalPredatorHabitatAssemblage({
      rootSeed: world.meta.rootSeed,
      originRegion: focus.region,
      focus: {
        position: focus,
        radiusTiles: 32,
        excludedTileIndices: economy.settlements.map(({ tileIndex }) => tileIndex),
      },
      domesticAnchor: {
        anchorId: `SETTLEMENT-DOMESTIC-YARD-${settlement.id}`,
        species: "domestic-chicken",
        position: domesticPosition,
        radiusTiles: 4,
      },
    }),
  };
}

function individualInputs(
  habitat: CoreEcologyRegionalPredatorHabitatAssemblage,
): readonly CoreEcologyPopulationInput[] {
  return habitat.populations.flatMap((population) => (
    population.representation !== "individual-representatives"
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
        }]
  ));
}

function v24Patch(
  seed: RootSeed,
  habitat: CoreEcologyRegionalPredatorHabitatAssemblage,
  tick: number,
): CoreEcologyAggregatePatchState {
  const populations = individualInputs(habitat);
  return createCoreEcologyAggregatePatch({
    seed,
    patchKey: "alpha32:test:v24-full-home",
    originRegion: habitat.originRegion,
    tick,
    derivation: { kind: "habitat-v11", habitat },
    groups: allV24Groups(seed, habitat, populations, tick),
    populations,
  });
}

function withHistoricalMortality(
  patch: CoreEcologyAggregatePatchState,
): CoreEcologyAggregatePatchState {
  const victimPopulation = patch.populations.find(({ species }) => species === "marsh-rabbit");
  const victim = victimPopulation?.members[0];
  const attacker = patch.populations.flatMap(({ members }) => members).find(({ actor }) => (
    actor.identity.stableId !== victim?.actor.identity.stableId
  ));
  if (victimPopulation === undefined || victim === undefined || attacker === undefined) {
    throw new Error("Mortality ownership fixture lacks live actors");
  }
  const terminalActor = replaceCoreWildlifeActorPhysiology(victim.actor, {
    atTick: patch.updatedAtTick,
    needs: victim.actor.needs,
    condition: { ...victim.actor.condition, health: 0 },
  });
  const eventBody = {
    version: 1 as const,
    atTick: patch.updatedAtTick,
    cause: "predator-contact" as const,
    causeReferenceId: "obs:alpha32-home-historical-mortality",
    observationId: "obs:alpha32-home-historical-mortality",
    attackerId: attacker.actor.identity.stableId,
    victimId: terminalActor.identity.stableId,
    attackerPosition: terminalActor.address.position,
    victimPosition: terminalActor.address.position,
    contactRadiusUnits: WORLD_POSITION_UNITS_PER_TILE,
    contactDistanceSquaredUnits: 0,
    damageUnits: victim.actor.condition.health,
    healthBefore: victim.actor.condition.health,
    healthAfter: 0,
    outcome: "death" as const,
  };
  const event = Object.freeze({
    ...eventBody,
    eventId: `wildlife-harm:${hashCanonical(eventBody)}`,
  });
  const carcass = createCoreWildlifeCarcass({
    mortalityEvent: event,
    sourceSpecies: terminalActor.identity.species,
    bodySizeUnits: 1,
    resourceUnits: 1,
    temperature: 500_000,
  });
  if (carcass === null) throw new Error("Mortality ownership fixture body failed");
  const transaction = createCoreEcologyMortalityTransaction({
    mortalityOrdinal: 0,
    event,
    retiredActor: terminalActor,
    representedUnitsBefore: victim.representedUnits,
    carcassId: carcass.carcassId,
  });
  const result = canonicalizeCoreEcologyAggregatePatch({
    ...patch,
    populations: patch.populations.map((population) => (
      population !== victimPopulation
        ? population
        : {
            ...population,
            populationSize: population.populationSize - 1,
            reserveUnits: population.reserveUnits + victim.representedUnits - 1,
            members: population.members.filter(({ populationOrdinal }) => (
              populationOrdinal !== victim.populationOrdinal
            )),
          }
    )),
    nextMortalityOrdinal: 1,
    mortalityTransactions: [transaction],
    carcasses: [carcass],
  });
  if (result === null) throw new Error("Mortality ownership fixture patch failed");
  return result;
}

function allV24Groups(
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

function ratWithState(patch: CoreEcologyAggregatePatchState) {
  const rat = patch.aggregatePopulations.find(({ species }) => species === "brown-rat");
  if (rat === undefined) throw new Error("Expected storehouse-rat aggregate");
  return rat;
}

import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import { seedFromText, type RootSeed } from "../sim/rng";
import {
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES,
  createCoreEcologyPatch,
  deserializeCoreEcologyPatch,
  serializeCoreEcologyPatch,
  setCoreEcologyMaterializedActors,
  stepCoreEcologyPatch,
  type CoreEcologyPatchState,
} from "./coreEcology";
import {
  CORE_ECOLOGY_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_HABITAT_SPECIES_EVALUATION_BUDGET,
  CORE_ECOLOGY_HABITAT_TILE_BUDGET,
  deriveCoreEcologyHabitatAssemblage,
  type CoreEcologyHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  CORE_ECOLOGY_GROUP_MAX_GROUPS,
  CORE_ECOLOGY_GROUP_MAX_SERIALIZED_BYTES,
  createCoreEcologyGroup,
  createCoreEcologyGroupSet,
  serializeCoreEcologyGroupSet,
} from "./coreEcologyGroups";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  worldPositionDelta,
} from "./worldPosition";

const UTF8_ENCODER = new TextEncoder();

function habitatPatch(seed: RootSeed, habitat: CoreEcologyHabitatAssemblage) {
  const groups = habitat.populations.flatMap((population) => {
    const anchor = population.allocations[0]?.position;
    if (population.species === "black-bear" || population.allocations.length < 2 || !anchor) {
      return [];
    }
    return [createCoreEcologyGroup({
      seed,
      species: population.species,
      originRegion: habitat.originRegion,
      populationKey: population.populationKey,
      groupOrdinal: 0,
      memberOrdinals: population.allocations.map(({ allocationOrdinal }) => allocationOrdinal),
      anchor,
    })];
  });
  return createCoreEcologyPatch({
    seed,
    patchKey: "audit:wave-a-habitat-group",
    originRegion: habitat.originRegion,
    derivation: { kind: "habitat-v1", habitat },
    groups: createCoreEcologyGroupSet(groups),
    populations: habitat.populations
      .filter(({ populationUnits }) => populationUnits > 0)
      .map((population) => ({
        species: population.species,
        populationKey: population.populationKey,
        populationSize: population.populationUnits,
        members: population.allocations.map((allocation) => ({
          populationOrdinal: allocation.allocationOrdinal,
          representedUnits: allocation.representedUnits,
          position: allocation.position,
          materialization: "coarse" as const,
        })),
      })),
  });
}

function actorIds(state: CoreEcologyPatchState): readonly string[] {
  return state.populations.flatMap(({ members }) =>
    members.map(({ actor }) => actor.identity.stableId));
}

describe("Wave-A representative ecology audit", () => {
  it("persists a nonlethal player-absent group aftermath and rematerializes the same members", () => {
    const seed = seedFromText("wave a player absent group aftermath");
    const habitat = deriveCoreEcologyHabitatAssemblage({
      rootSeed: seed,
      originRegion: createRegionCoord(-37, 19),
    });
    const initial = habitatPatch(seed, habitat);
    expect(initial.groups.groups.length).toBeGreaterThan(0);
    expect(initial.populations.flatMap(({ members }) => members)
      .every(({ materialization }) => materialization === "coarse")).toBe(true);

    const advanced = stepCoreEcologyPatch(initial, { tick: 64, actorSteps: [] });
    if (advanced === null) throw new Error("bounded coarse Wave-A step failed");
    const aftermath = advanced.patch.groups.groups.flatMap((group) => group.aftermath);
    expect(aftermath.length).toBeGreaterThan(0);
    expect(aftermath.every((event) => (
      event.playerAbsent
      && event.harm === "none"
      && !event.cargoInteraction
      && event.disclosure === "direct-observation-required"
    ))).toBe(true);
    expect(advanced.events).toEqual([]);
    expect(advanced.resourceClaims).toEqual([]);
    expect(actorIds(advanced.patch)).toEqual(actorIds(initial));

    const rematerialized = setCoreEcologyMaterializedActors(advanced.patch, {
      atTick: advanced.patch.updatedAtTick,
      actorIds: actorIds(advanced.patch),
    });
    expect(actorIds(rematerialized)).toEqual(actorIds(initial));
    for (const group of rematerialized.groups.groups) {
      const population = rematerialized.populations.find(({ species, populationKey }) => (
        species === group.identity.species
        && populationKey === group.identity.populationKey
      ));
      if (!population) throw new Error("rematerialized group lost its population");
      for (const component of group.components) {
        for (const ordinal of component.memberOrdinals) {
          const member = population.members.find(({ populationOrdinal }) => (
            populationOrdinal === ordinal
          ));
          if (!member) throw new Error("rematerialized group lost a member");
          const delta = worldPositionDelta(component.anchor, member.actor.address.position);
          expect(member.materialization).toBe("materialized");
          expect(member.actor.address.position.region).toEqual(component.anchor.region);
          expect(Math.abs(delta.x)).toBeLessThan(WORLD_POSITION_UNITS_PER_TILE);
          expect(Math.abs(delta.y)).toBeLessThan(WORLD_POSITION_UNITS_PER_TILE);
        }
      }
    }

    const encoded = serializeCoreEcologyPatch(rematerialized);
    expect(deserializeCoreEcologyPatch(encoded)).toEqual(rematerialized);
  });

  it("bounds spatial work and persisted representatives instead of scaling with population units", () => {
    const fixtures = [
      ["bounded occupied ecology", 0, 0],
      ["bounded quiet ecology", -91, 37],
      ["bounded negative frontier", -810_000, -420_000],
      ["bounded positive frontier", 700_000, 900_000],
    ] as const;
    let sawAggregatedRepresentative = false;

    for (const [seedText, x, y] of fixtures) {
      const seed = seedFromText(seedText);
      const habitat = deriveCoreEcologyHabitatAssemblage({
        rootSeed: seed,
        originRegion: createRegionCoord(x, y),
      });
      const patch = habitatPatch(seed, habitat);
      const representatives = patch.populations.flatMap(({ members }) => members);
      const representedUnits = patch.populations.reduce(
        (total, population) => total + population.populationSize,
        0,
      );

      expect(habitat.evaluatedTiles).toBeLessThanOrEqual(CORE_ECOLOGY_HABITAT_TILE_BUDGET);
      expect(habitat.speciesEvaluations)
        .toBeLessThanOrEqual(CORE_ECOLOGY_HABITAT_SPECIES_EVALUATION_BUDGET);
      expect(representatives.length).toBeLessThanOrEqual(CORE_ECOLOGY_HABITAT_MAX_ALLOCATIONS);
      expect(representatives.length).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);
      expect(representatives.reduce(
        (total, member) => total + member.representedUnits,
        0,
      )).toBe(representedUnits);
      sawAggregatedRepresentative ||= representatives.some(({ representedUnits }) => (
        representedUnits > 1
      ));
      expect(patch.groups.groups.length).toBeLessThanOrEqual(CORE_ECOLOGY_GROUP_MAX_GROUPS);
      expect(UTF8_ENCODER.encode(serializeCoreEcologyPatch(patch)).byteLength)
        .toBeLessThanOrEqual(CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES);
      expect(UTF8_ENCODER.encode(serializeCoreEcologyGroupSet(patch.groups)).byteLength)
        .toBeLessThanOrEqual(CORE_ECOLOGY_GROUP_MAX_SERIALIZED_BYTES);
    }
    expect(sawAggregatedRepresentative).toBe(true);
  });
});

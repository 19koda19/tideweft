import { describe, expect, it } from "vitest";

import {
  REGION_COORD_LIMIT,
  createRegionCoord,
  type RegionCoord,
} from "../sim/regions";
import { seedFromText, type RootSeed } from "../sim/rng";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { stableStringify } from "../sim/util";
import {
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  deserializeCoreEcologyAggregatePatch,
  serializeCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_SPECIES,
  CORE_ECOLOGY_TIDAL_WEB_HABITAT_SPECIES,
  canonicalizeCoreEcologyDomesticYardHabitatAssemblage,
  deriveCoreEcologyDomesticYardHabitatAssemblage,
  deriveCoreEcologyTidalWebHabitatAssemblage,
  type CoreEcologyDomesticHabitatAnchorInput,
  type CoreEcologyDomesticYardHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  createCoreEcologyGroup,
  createCoreEcologyGroupSet,
} from "./coreEcologyGroups";
import {
  SETTLEMENT_DOMESTIC_FOOD_USE_VERSION,
  createSettlementEcologyState,
  deserializeSettlementEcologyState,
  establishSettlementDomesticAnimalCustody,
  resolveSettlementDomesticFoodUse,
  serializeSettlementEcologyState,
  stageSettlementDomesticFoodUse,
  type SettlementEcologyState,
} from "./settlementEcology";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
} from "./worldPosition";

export const OWNER_INTENT =
  "test:alpha24-domestic-chicken-shared-invariants:v1" as const;

const SAMPLES = Object.freeze([
  Object.freeze({ label: "origin", region: createRegionCoord(0, 0) }),
  Object.freeze({ label: "signed", region: createRegionCoord(-17, 29) }),
  Object.freeze({ label: "distant", region: createRegionCoord(-9_000_001, 7_000_003) }),
  Object.freeze({
    label: "coordinate-edge",
    region: createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
  }),
]);

interface DomesticCandidate {
  readonly habitat: CoreEcologyDomesticYardHabitatAssemblage;
  readonly patch: CoreEcologyAggregatePatchState;
  readonly groupId: string;
}

describe("Alpha-24 domestic-yard shared invariants", () => {
  it("preserves the v7 prefix and binds one conserved physical flock across signed regions", () => {
    for (const [sampleOrdinal, sample] of SAMPLES.entries()) {
      const seed = seedFromText(`alpha24 shared domestic flock ${sample.label}`);
      const anchor = domesticAnchor(sample.region, sampleOrdinal);
      const first = createCandidate(seed, sample.region, anchor, sampleOrdinal);
      const replay = createCandidate(seed, sample.region, anchor, sampleOrdinal);
      const tidalWeb = deriveCoreEcologyTidalWebHabitatAssemblage({
        rootSeed: seed,
        originRegion: sample.region,
      });
      const chickenHabitat = first.habitat.populations.at(-1);
      const chickenPopulation = first.patch.populations.find(
        ({ species }) => species === "domestic-chicken",
      );
      const chickenGroup = first.patch.groups.groups.find(
        ({ identity }) => identity.species === "domestic-chicken",
      );

      expect(first).toEqual(replay);
      expect(first.habitat.populations.map(({ species }) => species))
        .toEqual(CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_SPECIES);
      expect(stableStringify(first.habitat.populations.slice(
        0,
        CORE_ECOLOGY_TIDAL_WEB_HABITAT_SPECIES.length,
      ))).toBe(stableStringify(tidalWeb.populations));
      expect(stableStringify(first.habitat.tidalAnchors))
        .toBe(stableStringify(tidalWeb.tidalAnchors));
      expect(chickenHabitat).toMatchObject({
        species: "domestic-chicken",
        representation: "individual-representatives",
      });
      expect(chickenHabitat?.populationUnits).toBeGreaterThanOrEqual(2);
      expect(chickenHabitat?.populationUnits).toBeLessThanOrEqual(3);
      expect(chickenHabitat?.allocations.every(({ position }) => {
        const tileX = Math.trunc(position.localX / WORLD_POSITION_UNITS_PER_TILE);
        const tileY = Math.trunc(position.localY / WORLD_POSITION_UNITS_PER_TILE);
        return position.region.x === anchor.position.region.x
          && position.region.y === anchor.position.region.y
          && Math.abs(tileX - Math.trunc(WORLD_WIDTH / 2))
            + Math.abs(tileY - Math.trunc(WORLD_HEIGHT / 2)) <= anchor.radiusTiles;
      })).toBe(true);
      expect(chickenPopulation?.members).toHaveLength(chickenHabitat?.populationUnits ?? 0);
      expect(chickenPopulation?.members.map(({ populationOrdinal }) => populationOrdinal))
        .toEqual(chickenGroup?.memberOrdinals);
      expect(chickenPopulation?.members.map(({ actor }) => actor.identity.stableId).sort())
        .toEqual([...new Set(
          chickenPopulation?.members.map(({ actor }) => actor.identity.stableId),
        )].sort());
      expect(chickenPopulation?.members.every(({ actor }) => (
        actor.identity.stableId.startsWith("CHICKEN-")
      ))).toBe(true);
      expect(chickenGroup).toMatchObject({
        identity: {
          stableId: first.groupId,
          species: "domestic-chicken",
          organization: "flock",
        },
      });
      expect(first.groupId).toMatch(/^CHICKEN-FLOCK-v1-/u);
      expect(canonicalizeCoreEcologyDomesticYardHabitatAssemblage(first.habitat))
        .toEqual(first.habitat);
      expect(canonicalizeCoreEcologyAggregatePatch(first.patch)).toEqual(first.patch);
      expect(deserializeCoreEcologyAggregatePatch(
        serializeCoreEcologyAggregatePatch(first.patch),
      )).toEqual(first.patch);

      if (chickenPopulation === undefined || chickenGroup === undefined) {
        throw new Error("shared domestic candidate omitted its bounded flock");
      }
      const store = createSettlementEcologyState({
        rootSeed: seed,
        settlementId: sampleOrdinal + 1,
        keeperActorId: `H-v1-alpha24-shared-keeper-${sampleOrdinal}`,
        position: anchor.position,
        aggregatePatch: first.patch,
      });
      const foodBefore = foodQuantity(store);
      expect(foodBefore).toBeGreaterThan(0);
      const withCustody = establishSettlementDomesticAnimalCustody(store, {
        custodyOrdinal: 0,
        owner: { kind: "settlement", id: store.identity.settlementId },
        caretakerActorId: store.identity.keeperActorId,
        species: "domestic-chicken",
        memberActorIds: chickenPopulation.members
          .map(({ actor }) => actor.identity.stableId)
          .reverse(),
        memberGroupId: chickenGroup.identity.stableId,
        homePosition: anchor.position,
        homeRadiusUnits: anchor.radiusTiles * WORLD_POSITION_UNITS_PER_TILE,
      });
      if (withCustody?.domesticCustody === null || withCustody === null) {
        throw new Error("shared domestic candidate could not establish physical custody");
      }
      expect(withCustody.domesticCustody.memberActorIds).toEqual(
        chickenPopulation.members.map(({ actor }) => actor.identity.stableId).sort(),
      );
      expect(withCustody.domesticCustody.memberGroupId).toBe(chickenGroup.identity.stableId);
      expect(foodQuantity(withCustody)).toBe(foodBefore);
      expect(establishSettlementDomesticAnimalCustody(withCustody, {
        custodyOrdinal: 0,
        owner: { kind: "settlement", id: store.identity.settlementId },
        caretakerActorId: store.identity.keeperActorId,
        species: "domestic-chicken",
        memberActorIds: chickenPopulation.members.map(({ actor }) => actor.identity.stableId),
        memberGroupId: chickenGroup.identity.stableId,
        homePosition: anchor.position,
        homeRadiusUnits: anchor.radiusTiles * WORLD_POSITION_UNITS_PER_TILE,
      })).toEqual(withCustody);

      const memberActorId = withCustody.domesticCustody.memberActorIds[0];
      if (memberActorId === undefined) throw new Error("domestic custody has no member");
      const request = {
        version: SETTLEMENT_DOMESTIC_FOOD_USE_VERSION,
        storeId: withCustody.identity.storeId,
        foodLotId: withCustody.identity.foodLotId,
        relationshipId: withCustody.domesticCustody.relationshipId,
        memberActorId,
        requestedQuantity: 1 as const,
        causeEventId: `alpha24:shared-food:${sampleOrdinal}`,
        causeEventTick: 1,
      };
      const staged = stageSettlementDomesticFoodUse(withCustody, request);
      if (staged === null) throw new Error("domestic food use did not stage");
      expect(foodQuantity(staged.state)).toBe(foodBefore);
      expect(stageSettlementDomesticFoodUse(staged.state, request)?.reusedPendingTransaction)
        .toBe(true);
      const resolved = resolveSettlementDomesticFoodUse(staged.state, staged.transaction);
      if (resolved === null) throw new Error("domestic food use did not resolve");
      const removedQuantity = resolved.removed.reduce((sum, lot) => (
        sum + (lot.payload.kind === "provision" ? lot.payload.quantity : 0)
      ), 0);
      expect(resolved.applied).toBe(true);
      expect(foodQuantity(resolved.state) + removedQuantity).toBe(foodBefore);
      expect(resolveSettlementDomesticFoodUse(resolved.state, staged.transaction)).toEqual({
        state: resolved.state,
        applied: false,
        removed: [],
      });
      expect(deserializeSettlementEcologyState(
        serializeSettlementEcologyState(resolved.state),
      )).toEqual(resolved.state);
    }
  });
});

function createCandidate(
  seed: RootSeed,
  region: RegionCoord,
  anchor: CoreEcologyDomesticHabitatAnchorInput,
  ordinal: number,
): DomesticCandidate {
  const habitat = deriveCoreEcologyDomesticYardHabitatAssemblage({
    rootSeed: seed,
    originRegion: region,
    domesticAnchor: anchor,
  });
  const chicken = habitat.populations.at(-1);
  const firstAllocation = chicken?.allocations[0];
  if (
    chicken?.species !== "domestic-chicken"
    || chicken.allocations.length < 2
    || firstAllocation === undefined
  ) throw new Error("domestic habitat omitted its bounded chicken allocation");
  const group = createCoreEcologyGroup({
    seed,
    species: chicken.species,
    originRegion: region,
    populationKey: chicken.populationKey,
    groupOrdinal: 0,
    memberOrdinals: chicken.allocations.map(({ allocationOrdinal }) => allocationOrdinal),
    anchor: firstAllocation.position,
  });
  const patch = createCoreEcologyAggregatePatch({
    seed,
    patchKey: `alpha24:shared-invariants:${ordinal}`,
    originRegion: region,
    populations: individualInputs(habitat),
    groups: createCoreEcologyGroupSet([group]),
    derivation: { kind: "habitat-v8", habitat },
  });
  return Object.freeze({ habitat, patch, groupId: group.identity.stableId });
}

function domesticAnchor(
  region: RegionCoord,
  ordinal: number,
): CoreEcologyDomesticHabitatAnchorInput {
  return Object.freeze({
    anchorId: `alpha24:shared-domestic-yard:${ordinal}`,
    species: "domestic-chicken",
    position: createWorldPosition(
      region,
      Math.trunc(WORLD_WIDTH / 2) * WORLD_POSITION_UNITS_PER_TILE
        + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
      Math.trunc(WORLD_HEIGHT / 2) * WORLD_POSITION_UNITS_PER_TILE
        + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    ),
    radiusTiles: 8,
  });
}

function individualInputs(
  habitat: CoreEcologyDomesticYardHabitatAssemblage,
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

function foodQuantity(state: SettlementEcologyState): number {
  const lot = state.carrier.lots.find(({ id }) => id === state.identity.foodLotId);
  return lot?.payload.kind === "provision" ? lot.payload.quantity : 0;
}

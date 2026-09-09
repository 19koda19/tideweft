import { describe, expect, it } from "vitest";

import { generateRegionTerrain } from "../sim/regionTerrain";
import { seedFromText } from "../sim/rng";
import { createRegionCoord } from "../sim/regions";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import {
  createCoreEcologyAggregatePatch,
  serializeCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  CORE_ECOLOGY_ACTIVITY_SPECIES,
  coreEcologyPatchHasBoundedActivityAuthority,
} from "./coreEcologyActivity";
import {
  deriveCoreEcologyRegionalPredatorHabitatAssemblage,
  type CoreEcologyRegionalPredatorHabitatAssemblage,
} from "./coreEcologyHabitat";
import { deriveCoreEcologyRegionalHabitat } from "./coreEcologyRegionalHabitat";
import {
  coreEcologyPatchHasTidalTableAuthority,
  stepCoreEcologyTidalTable,
} from "./coreEcologyTidalTable";
import { createCoreEcologySettlementHomePatch } from "./coreEcologySettlementHome";
import { createCoreEcologyRegionalResidentPatch } from "./regionalEcologyResidents";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
} from "./worldPosition";

const SEED = seedFromText("alpha32 shared derivation capability gate");
const ORIGIN = createRegionCoord(0, 0);

describe("core ecology derivation capability guards", () => {
  it("preserves compact regional, settlement-home, and receipt-bound patches when shared owners do not apply", () => {
    const habitat = settlementHabitat();
    const legacyHabitatPatch = createCoreEcologyAggregatePatch({
      seed: SEED,
      patchKey: "capability:legacy-habitat",
      originRegion: ORIGIN,
      tick: 14,
      derivation: { kind: "habitat-v11", habitat },
      populations: individualInputs(habitat),
    });
    const settlementHome = createCoreEcologySettlementHomePatch({
      seed: SEED,
      habitat,
      tick: 14,
    });
    const regional = regionalActivityWitness();
    const legacyCohort = createCoreEcologyAggregatePatch({
      seed: SEED,
      patchKey: "capability:legacy-cohort",
      originRegion: ORIGIN,
      tick: 14,
      derivation: {
        kind: "legacy-cohort-v1",
        adoptionTransactionId: "regional-ecology-adoption:0000000000000001",
        rootSeedFingerprint: "0000000000000002",
        sourcePatchHash: "0000000000000003",
      },
      populations: [],
    });

    expect(coreEcologyPatchHasBoundedActivityAuthority(legacyHabitatPatch)).toBe(true);
    expect(coreEcologyPatchHasTidalTableAuthority(legacyHabitatPatch)).toBe(true);

    // The home patch wraps v11 allocation facts, but owns no wild tidal table.
    expect(coreEcologyPatchHasBoundedActivityAuthority(settlementHome)).toBe(true);
    expect(coreEcologyPatchHasTidalTableAuthority(settlementHome)).toBe(false);

    // Compact regional authority and opaque compatibility receipts must be
    // left to their own owners rather than projected through legacy metadata.
    for (const patch of [regional, legacyCohort]) {
      expect(coreEcologyPatchHasBoundedActivityAuthority(patch)).toBe(false);
      expect(coreEcologyPatchHasTidalTableAuthority(patch)).toBe(false);
    }

    for (const patch of [regional, settlementHome, legacyCohort]) {
      const before = serializeCoreEcologyAggregatePatch(patch);
      const after = stepTideWhenOwned(patch);
      expect(after).toBe(patch);
      expect(serializeCoreEcologyAggregatePatch(after)).toBe(before);
    }

    const steppedLegacy = stepTideWhenOwned(legacyHabitatPatch);
    expect(steppedLegacy).not.toBeNull();
    expect(steppedLegacy?.updatedAtTick).toBe(14);
  });

  it("does not let a malformed lookalike claim either shared authority", () => {
    expect(coreEcologyPatchHasBoundedActivityAuthority(null)).toBe(false);
    expect(coreEcologyPatchHasTidalTableAuthority(null)).toBe(false);
    expect(coreEcologyPatchHasBoundedActivityAuthority({
      derivation: { kind: "habitat-v11", habitat: {} },
    })).toBe(false);
    expect(coreEcologyPatchHasTidalTableAuthority({
      derivation: { kind: "habitat-v11", habitat: {} },
    })).toBe(false);
  });
});

function stepTideWhenOwned(
  patch: CoreEcologyAggregatePatchState,
): CoreEcologyAggregatePatchState | null {
  if (!coreEcologyPatchHasTidalTableAuthority(patch)) return patch;
  return stepCoreEcologyTidalTable(patch, { atTick: patch.updatedAtTick })?.patch ?? null;
}

function regionalActivityWitness(): CoreEcologyAggregatePatchState {
  const activitySpecies = new Set<string>(CORE_ECOLOGY_ACTIVITY_SPECIES);
  for (let radius = 0; radius <= 6; radius += 1) {
    for (let y = -radius; y <= radius; y += 1) {
      for (let x = -radius; x <= radius; x += 1) {
        if (Math.max(Math.abs(x), Math.abs(y)) !== radius) continue;
        const habitat = deriveCoreEcologyRegionalHabitat({
          seed: SEED,
          region: createRegionCoord(x, y),
        });
        if (!habitat.populations.some(({ populationUnits, species }) => (
          populationUnits > 0 && activitySpecies.has(species)
        ))) continue;
        return createCoreEcologyRegionalResidentPatch({ seed: SEED, habitat, tick: 14 });
      }
    }
  }
  throw new Error("Fixed regional corpus lacks a bounded-activity species witness");
}

function settlementHabitat(): CoreEcologyRegionalPredatorHabitatAssemblage {
  const terrain = generateRegionTerrain(SEED, ORIGIN);
  const halfTile = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
  for (let y = 8; y < WORLD_HEIGHT - 8; y += 16) {
    for (let x = 8; x < WORLD_WIDTH - 8; x += 16) {
      try {
        return deriveCoreEcologyRegionalPredatorHabitatAssemblage({
          rootSeed: SEED,
          originRegion: ORIGIN,
          terrain,
          domesticAnchor: {
            anchorId: `alpha32:capability-home:${x}:${y}`,
            species: "domestic-chicken",
            position: createWorldPosition(
              ORIGIN,
              x * WORLD_POSITION_UNITS_PER_TILE + halfTile,
              y * WORLD_POSITION_UNITS_PER_TILE + halfTile,
            ),
            radiusTiles: 8,
          },
        });
      } catch {
        // Continue through the fixed grid until a canonical home anchor exists.
      }
    }
  }
  throw new Error("Fixed capability fixture lacks a lawful settlement-home anchor");
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

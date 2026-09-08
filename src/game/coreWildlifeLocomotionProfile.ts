import type { TerrainTileView } from "../sim/types";
import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import type { CoreWildlifeIntentKind } from "./coreWildlifeActor";
import type { LivingActorTraversabilityCell } from "./livingActorLocomotion";
import { ADRIFT_STAND_DEPTH } from "./adrift";
import {
  coreEcologySpeciesHasRuntimeCapability,
  coreEcologySpeciesRuntimePolicy,
} from "./coreEcologySpeciesRuntimePolicy";
import { WORLD_POSITION_UNITS_PER_TILE } from "./worldPosition";

const LOCOMOTION_FACTOR_SCALE = 1_000_000;
export const CORE_WILDLIFE_LOCOMOTION_PROFILE_VERSION = 1 as const;

/**
 * A materialized bird may have more than one lawful movement medium. The
 * caller selects the medium for the current activity; the shared surface and
 * locomotion resolver still own the route.
 */
export type CoreWildlifeTravelMedium =
  | "air"
  | "amphibious"
  | "surface-water";

interface DampCoverPreference {
  readonly terrain: "meadow";
  readonly minimumMoisture: number;
  readonly minimumRoughness: number;
  readonly match: "either";
  readonly multiplier: number;
}

export interface CoreWildlifeLocomotionProfile {
  readonly mode: "terrestrial" | "aerial";
  /** Aerial travel does not inherit the surface tile's ground impedance. */
  readonly aerialTravelCost: number | null;
  /** Surface swimming is restricted to genuinely wet cells. */
  readonly surfaceWaterTravelCost: number | null;
  readonly baseTerrainMultiplier: number;
  readonly terrainMultipliers: Readonly<Partial<Record<TerrainTileView["terrain"], number>>>;
  readonly dampCoverPreference: DampCoverPreference | null;
  readonly baseStepFactor: number;
  readonly intentStepFactors: Readonly<Partial<Record<CoreWildlifeIntentKind, number>>>;
}

const DEFAULT_LOCOMOTION_PROFILE: CoreWildlifeLocomotionProfile = Object.freeze({
  mode: "terrestrial",
  aerialTravelCost: null,
  surfaceWaterTravelCost: null,
  baseTerrainMultiplier: LOCOMOTION_FACTOR_SCALE,
  terrainMultipliers: Object.freeze({}),
  dampCoverPreference: null,
  baseStepFactor: 750_000,
  intentStepFactors: Object.freeze({}),
});

/**
 * Authored locomotion values are data; the shared path solver and cost
 * evaluator remain species-agnostic. New terrestrial profiles can select the
 * same terrain/gait abstractions without adding another movement branch.
 */
const LOCOMOTION_PROFILES: Readonly<Partial<Record<
  CoreWildlifeSpecies,
  CoreWildlifeLocomotionProfile
>>> = Object.freeze({
  gull: Object.freeze({
    mode: "aerial",
    aerialTravelCost: 260_000,
    surfaceWaterTravelCost: null,
    baseTerrainMultiplier: LOCOMOTION_FACTOR_SCALE,
    terrainMultipliers: Object.freeze({}),
    dampCoverPreference: null,
    baseStepFactor: 750_000,
    intentStepFactors: Object.freeze({}),
  }),
  "marsh-rabbit": Object.freeze({
    mode: "terrestrial",
    aerialTravelCost: null,
    surfaceWaterTravelCost: null,
    baseTerrainMultiplier: 920_000,
    terrainMultipliers: Object.freeze({
      marsh: 720_000,
      ridge: 1_420_000,
      "tidal-flat": 1_260_000,
    }),
    dampCoverPreference: Object.freeze({
      terrain: "meadow",
      minimumMoisture: 560_000,
      minimumRoughness: 560_000,
      match: "either",
      multiplier: 720_000,
    }),
    baseStepFactor: 650_000,
    intentStepFactors: Object.freeze({
      disengage: 800_000,
      flee: 900_000,
      retreat: 800_000,
    }),
  }),
  "marsh-fox": Object.freeze({
    mode: "terrestrial",
    aerialTravelCost: null,
    surfaceWaterTravelCost: null,
    baseTerrainMultiplier: 880_000,
    terrainMultipliers: Object.freeze({
      marsh: 1_180_000,
      ridge: 930_000,
      "tidal-flat": 1_300_000,
    }),
    dampCoverPreference: null,
    baseStepFactor: 700_000,
    intentStepFactors: Object.freeze({
      flee: 850_000,
      pursue: 800_000,
    }),
  }),
  "domestic-goat": Object.freeze({
    mode: "terrestrial",
    aerialTravelCost: null,
    surfaceWaterTravelCost: null,
    baseTerrainMultiplier: 900_000,
    terrainMultipliers: Object.freeze({
      marsh: 1_250_000,
      ridge: 700_000,
      "tidal-flat": 1_400_000,
    }),
    dampCoverPreference: null,
    baseStepFactor: 700_000,
    intentStepFactors: Object.freeze({
      flee: 900_000,
      retreat: 820_000,
    }),
  }),
  "fish-crow": Object.freeze({
    mode: "aerial",
    aerialTravelCost: 240_000,
    surfaceWaterTravelCost: null,
    baseTerrainMultiplier: LOCOMOTION_FACTOR_SCALE,
    terrainMultipliers: Object.freeze({}),
    dampCoverPreference: null,
    baseStepFactor: 760_000,
    intentStepFactors: Object.freeze({
      alarm: 820_000,
      flee: 900_000,
      retreat: 840_000,
    }),
  }),
  "northern-harrier": Object.freeze({
    mode: "aerial",
    aerialTravelCost: 220_000,
    surfaceWaterTravelCost: null,
    baseTerrainMultiplier: LOCOMOTION_FACTOR_SCALE,
    terrainMultipliers: Object.freeze({}),
    dampCoverPreference: null,
    baseStepFactor: 820_000,
    intentStepFactors: Object.freeze({
      disengage: 860_000,
      pursue: 960_000,
      retreat: 900_000,
    }),
  }),
  "snowy-egret": Object.freeze({
    // The egret stands and probes at authenticated tidal anchors, but travels
    // between those anchors in flight through the shared aerial path surface.
    mode: "aerial",
    aerialTravelCost: 250_000,
    surfaceWaterTravelCost: null,
    baseTerrainMultiplier: LOCOMOTION_FACTOR_SCALE,
    terrainMultipliers: Object.freeze({}),
    dampCoverPreference: null,
    baseStepFactor: 740_000,
    intentStepFactors: Object.freeze({
      flee: 900_000,
      retreat: 840_000,
    }),
  }),
  "american-black-duck": Object.freeze({
    // A flush is real aerial travel; ordinary dabbling relocations instead
    // select the shared surface-water medium explicitly.
    mode: "aerial",
    aerialTravelCost: 245_000,
    surfaceWaterTravelCost: 300_000,
    baseTerrainMultiplier: LOCOMOTION_FACTOR_SCALE,
    terrainMultipliers: Object.freeze({}),
    dampCoverPreference: null,
    baseStepFactor: 720_000,
    intentStepFactors: Object.freeze({
      alarm: 840_000,
      flee: 920_000,
      retreat: 860_000,
    }),
  }),
  "north-american-river-otter": Object.freeze({
    // One shared amphibious profile owns both bankside travel and swimming.
    // Activity selects the medium; the ordinary traversability resolver still
    // decides whether a physical route exists at the current water depth.
    mode: "terrestrial",
    aerialTravelCost: null,
    surfaceWaterTravelCost: 230_000,
    baseTerrainMultiplier: 940_000,
    terrainMultipliers: Object.freeze({
      marsh: 720_000,
      meadow: 920_000,
      ridge: 1_280_000,
      "tidal-flat": 800_000,
    }),
    dampCoverPreference: null,
    baseStepFactor: 780_000,
    intentStepFactors: Object.freeze({
      disengage: 860_000,
      flee: 920_000,
      pursue: 940_000,
      retreat: 880_000,
    }),
  }),
  "wild-boar": Object.freeze({
    mode: "terrestrial",
    aerialTravelCost: null,
    surfaceWaterTravelCost: null,
    baseTerrainMultiplier: 900_000,
    terrainMultipliers: Object.freeze({
      marsh: 1_180_000,
      meadow: 880_000,
      ridge: 780_000,
      "tidal-flat": 1_320_000,
    }),
    dampCoverPreference: null,
    baseStepFactor: 720_000,
    intentStepFactors: Object.freeze({
      flee: 900_000,
      retreat: 840_000,
    }),
  }),
  elk: Object.freeze({
    mode: "terrestrial",
    aerialTravelCost: null,
    surfaceWaterTravelCost: null,
    baseTerrainMultiplier: 920_000,
    terrainMultipliers: Object.freeze({
      marsh: 1_260_000,
      meadow: 720_000,
      ridge: 840_000,
      "tidal-flat": 1_380_000,
    }),
    dampCoverPreference: null,
    baseStepFactor: 820_000,
    intentStepFactors: Object.freeze({
      flee: 980_000,
      retreat: 900_000,
    }),
  }),
  "gray-wolf": Object.freeze({
    mode: "terrestrial",
    aerialTravelCost: null,
    surfaceWaterTravelCost: null,
    baseTerrainMultiplier: 880_000,
    terrainMultipliers: Object.freeze({
      marsh: 1_140_000,
      meadow: 820_000,
      ridge: 700_000,
      "tidal-flat": 1_240_000,
    }),
    dampCoverPreference: null,
    baseStepFactor: 820_000,
    intentStepFactors: Object.freeze({
      disengage: 900_000,
      flee: 920_000,
      pursue: 980_000,
      retreat: 880_000,
    }),
  }),
});

export const CORE_WILDLIFE_BASE_MOVE_STEP_UNITS = stepUnits(
  DEFAULT_LOCOMOTION_PROFILE.baseStepFactor,
);

/**
 * Actor-specific interpretation of one shared terrain surface. Existing
 * species retain their exact Alpha-15 costs; new profiles express different
 * routes without owning private maps or bypassing the common path solver.
 */
export function coreWildlifeTraversabilityCell(
  species: CoreWildlifeSpecies,
  tile: TerrainTileView,
  travelMedium?: CoreWildlifeTravelMedium,
): LivingActorTraversabilityCell {
  const profile = coreWildlifeLocomotionProfile(species);
  const medium = travelMedium ?? (
    coreEcologySpeciesHasRuntimeCapability(species, "aerial-locomotion")
      ? "air"
      : null
  );
  if (medium === "air") {
    if (profile.mode !== "aerial" || profile.aerialTravelCost === null) {
      throw new Error(`Aerial species ${species} lacks an aerial locomotion profile`);
    }
    return Object.freeze({ access: "open", travelCost: profile.aerialTravelCost });
  }
  if (medium === "surface-water") {
    if (
      profile.surfaceWaterTravelCost === null
      || !coreEcologySpeciesHasRuntimeCapability(species, "aquatic-locomotion")
    ) {
      throw new Error(`Species ${species} lacks a surface-water locomotion profile`);
    }
    return tile.terrain === "deep-water" || tile.waterDepth > 0
      ? Object.freeze({ access: "open", travelCost: profile.surfaceWaterTravelCost })
      : Object.freeze({ access: "blocked", travelCost: 0 });
  }
  if (medium === "amphibious") {
    if (
      profile.surfaceWaterTravelCost === null
      || !coreEcologySpeciesHasRuntimeCapability(species, "amphibious-locomotion")
      || !coreEcologySpeciesHasRuntimeCapability(species, "aquatic-locomotion")
      || !coreEcologySpeciesHasRuntimeCapability(species, "shore-water-activity")
    ) {
      throw new Error(`Species ${species} lacks an amphibious locomotion profile`);
    }
    if (tile.terrain === "deep-water" || tile.waterDepth > ADRIFT_STAND_DEPTH) {
      return Object.freeze({ access: "open", travelCost: profile.surfaceWaterTravelCost });
    }
  }
  if (tile.terrain === "deep-water" || tile.waterDepth > ADRIFT_STAND_DEPTH) {
    return Object.freeze({ access: "deep-water", travelCost: 0 });
  }
  const base = clamp(tile.baseTravelCost, 1, 1_000_000);
  const preference = profile.dampCoverPreference;
  const preferredCover = preference !== null
    && tile.terrain === preference.terrain
    && (tile.moisture >= preference.minimumMoisture
      || tile.roughness >= preference.minimumRoughness);
  const multiplier = preferredCover
    ? preference.multiplier
    : profile.terrainMultipliers[tile.terrain] ?? profile.baseTerrainMultiplier;
  return Object.freeze({ access: "open", travelCost: scaledCost(base, multiplier) });
}

/** Distinct gait distance, still bounded below one shared terrain tile. */
export function coreWildlifeMaximumStepUnits(
  species: CoreWildlifeSpecies,
  intent: CoreWildlifeIntentKind,
): number {
  const profile = coreWildlifeLocomotionProfile(species);
  return stepUnits(profile.intentStepFactors[intent] ?? profile.baseStepFactor);
}

/** Complete fail-closed lookup for shared actor locomotion consumers. */
export function coreWildlifeLocomotionProfile(
  species: CoreWildlifeSpecies,
): CoreWildlifeLocomotionProfile {
  if (coreEcologySpeciesRuntimePolicy(species) === null) {
    throw new Error(`Unknown core wildlife species ${String(species)}`);
  }
  const profile = LOCOMOTION_PROFILES[species] ?? DEFAULT_LOCOMOTION_PROFILE;
  const aerial = coreEcologySpeciesHasRuntimeCapability(species, "aerial-locomotion");
  if (aerial !== (profile.mode === "aerial") || aerial !== (profile.aerialTravelCost !== null)) {
    throw new Error(`Core wildlife locomotion policy mismatch for ${species}`);
  }
  const surfaceWater = coreEcologySpeciesHasRuntimeCapability(species, "actor-address")
    && coreEcologySpeciesHasRuntimeCapability(species, "aquatic-locomotion");
  if (surfaceWater !== (profile.surfaceWaterTravelCost !== null)) {
    throw new Error(`Core wildlife surface-water locomotion policy mismatch for ${species}`);
  }
  return profile;
}

function scaledCost(base: number, multiplier: number): number {
  return clamp(Math.round(base * multiplier / LOCOMOTION_FACTOR_SCALE), 1, 1_000_000);
}

function stepUnits(factor: number): number {
  return Math.trunc(WORLD_POSITION_UNITS_PER_TILE * factor / LOCOMOTION_FACTOR_SCALE);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

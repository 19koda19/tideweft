import type { TerrainTileView } from "../sim/types";
import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import type { CoreWildlifeIntentKind } from "./coreWildlifeActor";
import type { LivingActorTraversabilityCell } from "./livingActorLocomotion";
import { ADRIFT_STAND_DEPTH } from "./adrift";
import { WORLD_POSITION_UNITS_PER_TILE } from "./worldPosition";

const LOCOMOTION_FACTOR_SCALE = 1_000_000;

interface DampCoverPreference {
  readonly terrain: "meadow";
  readonly minimumMoisture: number;
  readonly minimumRoughness: number;
  readonly match: "either";
  readonly multiplier: number;
}

interface CoreWildlifeLocomotionProfile {
  readonly baseTerrainMultiplier: number;
  readonly terrainMultipliers: Readonly<Partial<Record<TerrainTileView["terrain"], number>>>;
  readonly dampCoverPreference: DampCoverPreference | null;
  readonly baseStepFactor: number;
  readonly intentStepFactors: Readonly<Partial<Record<CoreWildlifeIntentKind, number>>>;
}

const DEFAULT_LOCOMOTION_PROFILE: CoreWildlifeLocomotionProfile = Object.freeze({
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
  "marsh-rabbit": Object.freeze({
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
): LivingActorTraversabilityCell {
  if (tile.terrain === "deep-water" || tile.waterDepth > ADRIFT_STAND_DEPTH) {
    return Object.freeze({ access: "deep-water", travelCost: 0 });
  }
  const base = clamp(tile.baseTravelCost, 1, 1_000_000);
  const profile = LOCOMOTION_PROFILES[species] ?? DEFAULT_LOCOMOTION_PROFILE;
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
  const profile = LOCOMOTION_PROFILES[species] ?? DEFAULT_LOCOMOTION_PROFILE;
  return stepUnits(profile.intentStepFactors[intent] ?? profile.baseStepFactor);
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

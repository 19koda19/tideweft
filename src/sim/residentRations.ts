import { clampInteger } from "./util";

export interface ResidentRationsInput {
  readonly foodStock: number;
  readonly freshWaterStock: number;
  /** Caller-owned, already eligible and ordered settlement cohort. */
  readonly foodNeeds: readonly number[];
  readonly hungerGrowth: number;
}

export interface ResidentRationsResult {
  readonly foodConsumed: number;
  readonly freshWaterConsumed: number;
  readonly nextFoodNeeds: readonly number[];
}

export interface ResidentRationPulseInput extends ResidentRationsInput {
  /** Authenticated uses, aligned with the ONE complete stable-order cohort. */
  readonly uses: readonly boolean[];
}

/** Partial service shares the legacy whole-cohort budget; it creates no stock. */
export function calculateResidentRationPulse(input: ResidentRationPulseInput): ResidentRationsResult {
  if (input.uses.length !== input.foodNeeds.length) {
    throw new RangeError("Ration uses must match the complete settlement cohort");
  }
  const budget = Math.ceil(input.foodNeeds.length / 3);
  const foodAvailable = budget > 0 && input.foodStock >= budget;
  const waterAvailable = budget > 0 && input.freshWaterStock >= budget;
  let groupsUsed = 0;
  for (let start = 0; start < input.uses.length; start += 3) {
    if (input.uses.slice(start, start + 3).some(Boolean)) groupsUsed += 1;
  }
  return {
    foodConsumed: foodAvailable ? groupsUsed : 0,
    freshWaterConsumed: waterAvailable ? groupsUsed : 0,
    nextFoodNeeds: input.foodNeeds.map((need, index) => clampInteger(need + input.hungerGrowth
      - (input.uses[index] && foodAvailable ? 68_000 : 0)
      - (input.uses[index] && waterAvailable ? 8_000 : 0))),
  };
}

/**
 * Existing aggregate ration arithmetic, not proof of physical meal/service use.
 * The authoritative caller owns cadence, eligibility, stock and ledger commits.
 * Food and water each require the whole cohort batch; neither spends the other.
 */
export function calculateResidentRations(input: ResidentRationsInput): ResidentRationsResult {
  const ration = Math.ceil(input.foodNeeds.length / 3);
  const foodConsumed = ration > 0 && input.foodStock >= ration ? ration : 0;
  const freshWaterConsumed = ration > 0 && input.freshWaterStock >= ration ? ration : 0;
  const relief = (foodConsumed > 0 ? 68_000 : 0) + (freshWaterConsumed > 0 ? 8_000 : 0);
  return {
    foodConsumed,
    freshWaterConsumed,
    // Clamp only the final result: clamping growth first changes near-full needs.
    nextFoodNeeds: input.foodNeeds.map((need) => clampInteger(need + input.hungerGrowth - relief)),
  };
}

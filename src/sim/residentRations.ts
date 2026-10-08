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

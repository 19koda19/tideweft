import { describe, expect, it } from "vitest";

import { calculateResidentRations } from "./residentRations";
import { FIXED_POINT } from "./types";
import { pressureMultiplier } from "./world";

describe("existing aggregate resident ration arithmetic", () => {
  it.each([
    [0, 0], [1, 1], [3, 1], [4, 2], [6, 2], [7, 3],
  ])("consumes the whole batch for %i eligible residents", (count, ration) => {
    const foodNeeds = Object.freeze(Array.from({ length: count }, () => 300_000));
    const result = calculateResidentRations({
      foodStock: 20, freshWaterStock: 20, foodNeeds, hungerGrowth: 34_000,
    });
    expect(result).toEqual({
      foodConsumed: ration,
      freshWaterConsumed: ration,
      nextFoodNeeds: Array.from({ length: count }, () => 258_000),
    });
    expect(foodNeeds).toEqual(Array.from({ length: count }, () => 300_000));
  });

  it.each([
    { food: 2, water: 2, foodConsumed: 2, waterConsumed: 2, need: 258_000 },
    { food: 2, water: 1, foodConsumed: 2, waterConsumed: 0, need: 266_000 },
    { food: 1, water: 2, foodConsumed: 0, waterConsumed: 2, need: 326_000 },
    { food: 1, water: 1, foodConsumed: 0, waterConsumed: 0, need: 334_000 },
    { food: 0, water: 0, foodConsumed: 0, waterConsumed: 0, need: 334_000 },
  ])("uses independent all-or-none stocks: $food food, $water water", ({
    food, water, foodConsumed, waterConsumed, need,
  }) => {
    const input = Object.freeze({
      foodStock: food,
      freshWaterStock: water,
      foodNeeds: Object.freeze([300_000, 300_000, 300_000, 300_000]),
      hungerGrowth: 34_000,
    });
    expect(calculateResidentRations(input)).toEqual({
      foodConsumed,
      freshWaterConsumed: waterConsumed,
      nextFoodNeeds: [need, need, need, need],
    });
    expect(input.foodStock).toBe(food);
    expect(input.freshWaterStock).toBe(water);
  });

  it.each([
    ["calm", 25_500], ["standard", 34_000], ["wild", 44_200],
  ] as const)("retains exact %s growth without stock", (mode, growth) => {
    const hungerGrowth = Math.trunc(34_000 * pressureMultiplier(mode) / FIXED_POINT);
    expect(hungerGrowth).toBe(growth);
    expect(calculateResidentRations({
      foodStock: 0, freshWaterStock: 0, foodNeeds: [100_000], hungerGrowth,
    }).nextFoodNeeds).toEqual([100_000 + growth]);
  });

  it("preserves cohort alignment and clamps only after all growth and relief", () => {
    const foodNeeds = Object.freeze([990_000, 0, 1_000_000, 500_000]);
    expect(calculateResidentRations({
      foodStock: 2, freshWaterStock: 2, foodNeeds, hungerGrowth: 44_200,
    })).toEqual({
      foodConsumed: 2,
      freshWaterConsumed: 2,
      nextFoodNeeds: [958_200, 0, 968_200, 468_200],
    });
    expect(foodNeeds).toEqual([990_000, 0, 1_000_000, 500_000]);
    expect(calculateResidentRations({
      foodStock: 0, freshWaterStock: 1, foodNeeds: [980_000], hungerGrowth: 44_200,
    }).nextFoodNeeds).toEqual([1_000_000]);
  });
});

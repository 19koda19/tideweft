import { describe, expect, it } from "vitest";

import { calculateResidentRationPulse, calculateResidentRations } from "./residentRations";

// A caller-supplied use mask is arithmetic input, not evidence of physical
// approach, authenticated arrival, service completion or an inventory commit.
describe("full-cohort resident ration pulse arithmetic", () => {
  it.each([0, 1, 3, 4, 6, 7])("matches the existing full-use batch for %i residents", (count) => {
    const input = {
      foodStock: 20,
      freshWaterStock: 20,
      foodNeeds: Array.from({ length: count }, () => 300_000),
      hungerGrowth: 34_000,
    };
    const result = calculateResidentRationPulse({ ...input, uses: Array.from({ length: count }, () => true) });
    expect(result).toEqual(calculateResidentRations(input));
    expect(result).toEqual({
      foodConsumed: Math.ceil(count / 3),
      freshWaterConsumed: Math.ceil(count / 3),
      nextFoodNeeds: Array.from({ length: count }, () => 258_000),
    });
  });

  it.each([
    {
      uses: [true, true, true, false, false, false, false],
      groups: 1,
      next: [258_000, 258_000, 258_000, 334_000, 334_000, 334_000, 334_000],
    },
    {
      uses: [true, false, false, true, false, false, true],
      groups: 3,
      next: [258_000, 334_000, 334_000, 258_000, 334_000, 334_000, 258_000],
    },
    {
      uses: [false, false, true, true, false, false, false],
      groups: 2,
      next: [334_000, 334_000, 258_000, 258_000, 334_000, 334_000, 334_000],
    },
  ])("charges each occupied cohort group once: $groups groups", ({ uses, groups, next }) => {
    expect(calculateResidentRationPulse({
      foodStock: 3,
      freshWaterStock: 3,
      foodNeeds: Array.from({ length: 7 }, () => 300_000),
      hungerGrowth: 34_000,
      uses,
    })).toEqual({
      foodConsumed: groups,
      freshWaterConsumed: groups,
      nextFoodNeeds: next,
    });
  });

  it.each([
    { food: 3, water: 3, foodConsumed: 1, waterConsumed: 1, userNeed: 258_000 },
    { food: 3, water: 2, foodConsumed: 1, waterConsumed: 0, userNeed: 266_000 },
    { food: 2, water: 3, foodConsumed: 0, waterConsumed: 1, userNeed: 326_000 },
    { food: 2, water: 2, foodConsumed: 0, waterConsumed: 0, userNeed: 334_000 },
  ])("requires independent full-cohort affordability: $food food, $water water", ({
    food, water, foodConsumed, waterConsumed, userNeed,
  }) => {
    // One used group is not permission to discount the seven-person budget
    // from three units to one for either resource.
    expect(calculateResidentRationPulse({
      foodStock: food,
      freshWaterStock: water,
      foodNeeds: Array.from({ length: 7 }, () => 300_000),
      hungerGrowth: 34_000,
      uses: [false, false, false, true, false, false, false],
    })).toEqual({
      foodConsumed,
      freshWaterConsumed: waterConsumed,
      nextFoodNeeds: [334_000, 334_000, 334_000, userNeed, 334_000, 334_000, 334_000],
    });
  });

  it.each([0, 20])("grants only growth and consumes nothing with no users and %i stock", (stock) => {
    expect(calculateResidentRationPulse({
      foodStock: stock,
      freshWaterStock: stock,
      foodNeeds: [300_000, 980_000, 0, 500_000],
      hungerGrowth: 34_000,
      uses: [false, false, false, false],
    })).toEqual({
      foodConsumed: 0,
      freshWaterConsumed: 0,
      nextFoodNeeds: [334_000, 1_000_000, 34_000, 534_000],
    });
  });

  it("clamps only after growth and applicable user relief, preserving cohort alignment", () => {
    expect(calculateResidentRationPulse({
      foodStock: 2,
      freshWaterStock: 2,
      foodNeeds: [990_000, 0, 1_000_000, 980_000],
      hungerGrowth: 44_200,
      uses: [true, true, true, false],
    })).toEqual({
      foodConsumed: 1,
      freshWaterConsumed: 1,
      nextFoodNeeds: [958_200, 0, 968_200, 1_000_000],
    });
  });

  it("does not mutate frozen inputs or reuse the caller's needs array", () => {
    const foodNeeds = Object.freeze([300_000, 300_000, 300_000, 300_000]);
    const uses = Object.freeze([true, false, false, true]);
    const input = Object.freeze({
      foodStock: 2,
      freshWaterStock: 2,
      foodNeeds,
      hungerGrowth: 34_000,
      uses,
    });
    const result = calculateResidentRationPulse(input);
    expect(result).toEqual({
      foodConsumed: 2,
      freshWaterConsumed: 2,
      nextFoodNeeds: [258_000, 334_000, 334_000, 258_000],
    });
    expect(result.nextFoodNeeds).not.toBe(foodNeeds);
    expect(input).toEqual({
      foodStock: 2,
      freshWaterStock: 2,
      foodNeeds: [300_000, 300_000, 300_000, 300_000],
      hungerGrowth: 34_000,
      uses: [true, false, false, true],
    });
  });

  it.each([{ uses: [true] }, { uses: [true, false, true] }])("rejects a misaligned use mask $uses without changing inputs", ({ uses }) => {
    const input = Object.freeze({
      foodStock: 2,
      freshWaterStock: 2,
      foodNeeds: Object.freeze([300_000, 300_000]),
      hungerGrowth: 34_000,
      uses: Object.freeze(uses),
    });
    expect(() => calculateResidentRationPulse(input)).toThrow(RangeError);
    expect(input.foodNeeds).toEqual([300_000, 300_000]);
    expect(input.uses).toEqual(uses);
  });
});

import { describe, expect, it } from "vitest";

import {
  GEAR_BENEFIT_DEFINITIONS,
  GEAR_SERVICE_WEAR,
  applyGearServiceWear,
  queryCarriedGearEffects,
  resolveCarriedGearBenefit,
  validateGearEffectDefinitions,
  type GearEffectContext,
} from "./gearEffects";
import {
  CRAFTING_CONDITION_MAX,
  createCraftingInventory,
  type CraftedGearItem,
  type CraftingInventory,
} from "./crafting";

const ALL_HAZARDS: GearEffectContext = {
  marsh: true,
  wet: true,
  rock: true,
  exposure: true,
  gust: true,
  cargoWetting: true,
  magicContamination: true,
};

function inventory(
  gear: readonly CraftedGearItem[],
  capacityMilliLoad = 100_000,
): CraftingInventory {
  return createCraftingInventory(capacityMilliLoad, {}, gear);
}

describe("carried gear effect resolution", () => {
  it("publishes the exact canonical channels and passes definition invariants", () => {
    expect(validateGearEffectDefinitions()).toEqual([]);
    expect(GEAR_SERVICE_WEAR).toEqual({
      "cargo-rain-shroud": 8_000,
      "float-sash": 10_000,
      "glimmer-liner": 8_000,
      "marsh-wraps": 8_000,
      pannier: 5_000,
      "ridge-cleats": 12_000,
      "weather-cape": 6_000,
    });

    const gear = [
      { id: 7, kind: "marsh-wraps", condition: CRAFTING_CONDITION_MAX },
      { id: 8, kind: "float-sash", condition: CRAFTING_CONDITION_MAX },
      { id: 9, kind: "ridge-cleats", condition: CRAFTING_CONDITION_MAX },
      { id: 10, kind: "weather-cape", condition: CRAFTING_CONDITION_MAX },
      { id: 11, kind: "cargo-rain-shroud", condition: CRAFTING_CONDITION_MAX },
      { id: 12, kind: "glimmer-liner", condition: CRAFTING_CONDITION_MAX },
      { id: 13, kind: "pannier", condition: CRAFTING_CONDITION_MAX },
    ] as const;
    const effects = queryCarriedGearEffects(inventory(gear), ALL_HAZARDS);

    expect(effects).toMatchObject({
      valid: true,
      reason: "ready",
      marshMovementCostPermille: 800,
      marshStabilityLossPermille: 700,
      wetStaminaCostPermille: 800,
      currentForcePermille: 850,
      rockTravelCostPermille: 750,
      fallRiskPermille: 600,
      exposureCostPermille: 650,
      gustStabilityLossPermille: 750,
      cargoWettingPermille: 500,
      magicContaminationPermille: 400,
      capacityBonusMilli: 6_000,
    });
    expect(effects.resolutions).toHaveLength(11);
    expect(Object.isFrozen(effects)).toBe(true);
    expect(Object.isFrozen(effects.resolutions)).toBe(true);
  });

  it("uses the lowest stable sound ID, never stacks duplicates, and falls back past broken gear", () => {
    const pack = inventory([
      { id: 9, kind: "marsh-wraps", condition: 800_000 },
      { id: 2, kind: "marsh-wraps", condition: 0 },
      { id: 5, kind: "marsh-wraps", condition: 1 },
      { id: 3, kind: "wind-knot", condition: CRAFTING_CONDITION_MAX },
    ]);
    const forward = queryCarriedGearEffects(pack, { marsh: true });
    const reversed = queryCarriedGearEffects({ ...pack, gear: [...pack.gear].reverse() }, { marsh: true });

    expect(reversed).toEqual(forward);
    expect(forward.marshMovementCostPermille).toBe(800);
    expect(forward.marshStabilityLossPermille).toBe(700);
    expect(forward.resolutions).toEqual([
      {
        channel: "marsh-movement",
        benefit: "marsh-footing",
        gearId: 5,
        kind: "marsh-wraps",
        mode: "cost-permille",
        value: 800,
      },
      {
        channel: "marsh-stability",
        benefit: "marsh-footing",
        gearId: 5,
        kind: "marsh-wraps",
        mode: "cost-permille",
        value: 700,
      },
    ]);
  });

  it("gates each modifier by its named terrain/exposure signal", () => {
    const pack = inventory([
      { id: 1, kind: "marsh-wraps", condition: 500_000 },
      { id: 2, kind: "float-sash", condition: 500_000 },
      { id: 3, kind: "ridge-cleats", condition: 500_000 },
      { id: 4, kind: "weather-cape", condition: 500_000 },
      { id: 5, kind: "cargo-rain-shroud", condition: 500_000 },
      { id: 6, kind: "glimmer-liner", condition: 500_000 },
    ]);

    expect(queryCarriedGearEffects(pack, {})).toMatchObject({
      marshMovementCostPermille: 1_000,
      wetStaminaCostPermille: 1_000,
      rockTravelCostPermille: 1_000,
      exposureCostPermille: 1_000,
      cargoWettingPermille: 1_000,
      magicContaminationPermille: 1_000,
      capacityBonusMilli: 0,
      resolutions: [],
    });
    expect(queryCarriedGearEffects(pack, { gust: true })).toMatchObject({
      exposureCostPermille: 1_000,
      gustStabilityLossPermille: 750,
    });
    expect(resolveCarriedGearBenefit(pack, { wet: true }, "wet-buoyancy"))
      .toHaveLength(2);
  });

  it("adds exactly one 6000 milli-load pannier bonus while its winning copy is sound", () => {
    const pack = inventory([
      { id: 8, kind: "pannier", condition: CRAFTING_CONDITION_MAX },
      { id: 4, kind: "pannier", condition: 1 },
      { id: 2, kind: "pannier", condition: 0 },
    ]);
    const effects = queryCarriedGearEffects(pack);

    expect(effects.capacityBonusMilli).toBe(6_000);
    expect(effects.resolutions).toEqual([{
      channel: "pannier-capacity",
      benefit: "pannier-capacity",
      gearId: 4,
      kind: "pannier",
      mode: "capacity-milli",
      value: 6_000,
    }]);
  });
});

describe("post-benefit service wear", () => {
  it("breaks the winning item after the event without deleting or renumbering it", () => {
    const pack = inventory([
      { id: 3, kind: "marsh-wraps", condition: 7_500 },
      { id: 8, kind: "marsh-wraps", condition: 600_000 },
    ]);
    const before = structuredClone(pack);
    const result = applyGearServiceWear(pack, { marsh: true }, "marsh-footing");

    expect(result).toMatchObject({
      ok: true,
      reason: "worn",
      benefit: "marsh-footing",
      conditionSpent: 7_500,
      gear: { id: 3, kind: "marsh-wraps", condition: 0 },
    });
    expect(result.inventory.gear).toEqual([
      { id: 3, kind: "marsh-wraps", condition: 0 },
      { id: 8, kind: "marsh-wraps", condition: 600_000 },
    ]);
    expect(queryCarriedGearEffects(result.inventory, { marsh: true }).resolutions)
      .toEqual([
        expect.objectContaining({ channel: "marsh-movement", gearId: 8 }),
        expect.objectContaining({ channel: "marsh-stability", gearId: 8 }),
      ]);
    expect(pack).toEqual(before);
    expect(Object.isFrozen(result.inventory)).toBe(true);
    expect(Object.isFrozen(result.inventory.gear)).toBe(true);
  });

  it("charges one event per named benefit, not once for every channel it supplied", () => {
    const pack = inventory([
      { id: 1, kind: "ridge-cleats", condition: 20_000 },
      { id: 2, kind: "weather-cape", condition: 20_000 },
    ]);
    const gripped = applyGearServiceWear(pack, { rock: true }, "ridge-grip");
    expect(gripped).toMatchObject({ conditionSpent: 12_000, gear: { condition: 8_000 } });
    expect(resolveCarriedGearBenefit(pack, { rock: true }, "ridge-grip")).toHaveLength(2);

    const sheltered = applyGearServiceWear(
      gripped.inventory,
      { exposure: true, gust: true },
      "weather-shelter",
    );
    expect(sheltered).toMatchObject({ conditionSpent: 6_000, gear: { condition: 14_000 } });
  });

  it("never spends wear when the named benefit is absent, inapplicable, or broken", () => {
    const healthy = inventory([
      { id: 1, kind: "float-sash", condition: 50_000 },
    ]);
    const wrongTerrain = applyGearServiceWear(healthy, {}, "wet-buoyancy");
    expect(wrongTerrain).toMatchObject({
      ok: false,
      reason: "benefit-not-applicable",
      conditionSpent: 0,
    });
    expect(wrongTerrain.inventory).toBe(healthy);

    const absent = applyGearServiceWear(healthy, { rock: true }, "ridge-grip");
    expect(absent).toMatchObject({ ok: false, reason: "gear-not-found", conditionSpent: 0 });
    expect(absent.inventory).toBe(healthy);

    const broken = inventory([
      { id: 2, kind: "glimmer-liner", condition: 0 },
    ]);
    const inactive = applyGearServiceWear(
      broken,
      { magicContamination: true },
      "magic-lining",
    );
    expect(inactive).toMatchObject({ ok: false, reason: "gear-broken", conditionSpent: 0 });
    expect(inactive.inventory).toBe(broken);
  });

  it("spends pannier wear only after its capacity benefit is named and removes bonus on break", () => {
    const pack = inventory([
      { id: 4, kind: "pannier", condition: 4_000 },
    ]);
    expect(queryCarriedGearEffects(pack).capacityBonusMilli).toBe(6_000);

    const result = applyGearServiceWear(pack, {}, "pannier-capacity");
    expect(result).toMatchObject({
      ok: true,
      conditionSpent: 4_000,
      gear: { id: 4, kind: "pannier", condition: 0 },
    });
    expect(queryCarriedGearEffects(result.inventory).capacityBonusMilli).toBe(0);
  });

  it("keeps benefit metadata and wear values in one deterministic catalog", () => {
    expect(GEAR_BENEFIT_DEFINITIONS["marsh-footing"]).toMatchObject({
      kind: "marsh-wraps",
      serviceWear: 8_000,
    });
    expect(GEAR_BENEFIT_DEFINITIONS["wet-buoyancy"]).toMatchObject({
      kind: "float-sash",
      serviceWear: 10_000,
    });
    expect(GEAR_BENEFIT_DEFINITIONS["ridge-grip"]).toMatchObject({
      kind: "ridge-cleats",
      serviceWear: 12_000,
    });
  });

  it("fails invalid inventories closed without touching caller-owned gear", () => {
    const valid = inventory([
      { id: 1, kind: "pannier", condition: CRAFTING_CONDITION_MAX },
    ]);
    const invalid = {
      ...valid,
      gear: [valid.gear[0]!, { ...valid.gear[0]! }],
    };

    expect(queryCarriedGearEffects(invalid)).toMatchObject({
      valid: false,
      reason: "invalid-inventory",
      capacityBonusMilli: 0,
      resolutions: [],
    });
    const result = applyGearServiceWear(invalid, {}, "pannier-capacity");
    expect(result).toMatchObject({
      ok: false,
      reason: "invalid-inventory",
      conditionSpent: 0,
    });
    expect(result.inventory).toBe(invalid);
  });
});

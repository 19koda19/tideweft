import { describe, expect, it } from "vitest";

import {
  CRAFTED_GEAR_DEFINITIONS,
  CRAFTED_GEAR_KINDS,
  CRAFTING_CONDITION_MAX,
  CRAFTING_RECIPES,
  RAW_MATERIAL_IDS,
  calculateRecipeRawCost,
  craft,
  createCraftingInventory,
  dismantle,
  expandStacksToRaw,
  inventoryLoadMilli,
  previewCraft,
  previewDismantle,
  previewRepair,
  quoteLadderRepairCost,
  quoteLadderServiceWear,
  quoteWayknotRepairCost,
  quoteWayknotServiceWear,
  repair,
  salvageForGear,
  validateCraftingCatalog,
  validateDefaultSalvageLosses,
  type CraftingRecipe,
  type RawMaterialTotals,
  type StackAmount,
} from "./crafting";

function sumRaw(totals: RawMaterialTotals): number {
  return RAW_MATERIAL_IDS.reduce((sum, id) => sum + totals[id], 0);
}

function expectComponentwiseBelow(
  actual: RawMaterialTotals,
  ceiling: RawMaterialTotals,
): void {
  let strict = false;
  for (const id of RAW_MATERIAL_IDS) {
    expect(actual[id], id).toBeLessThanOrEqual(ceiling[id]);
    if (actual[id] < ceiling[id]) strict = true;
  }
  expect(strict).toBe(true);
}

describe("data-driven crafting catalog", () => {
  it("is acyclic, dependency-first, and gives every recipe positive raw cost", () => {
    const validation = validateCraftingCatalog(CRAFTING_RECIPES);

    expect(validation).toEqual({
      ok: true,
      issues: [],
      topologicalRecipeIds: [
        "component/braided-cord",
        "component/float-cell",
        "component/glimmer-seal",
        "component/pitchcloth",
        "component/stone-fitting",
        "component/stormweave",
        "gear/cargo-rain-shroud",
        "gear/float-sash",
        "gear/glimmer-liner",
        "gear/ladder",
        "gear/marsh-wraps",
        "gear/pannier",
        "gear/reed-mat",
        "gear/ridge-cleats",
        "gear/tide-anchor",
        "gear/weather-cape",
        "gear/wind-knot",
      ],
    });
    for (const recipe of CRAFTING_RECIPES) {
      const rawCost = calculateRecipeRawCost(recipe.id);
      expect(rawCost, recipe.id).not.toBeNull();
      expect(sumRaw(rawCost ?? Object.fromEntries(RAW_MATERIAL_IDS.map((id) => [id, 0])) as unknown as RawMaterialTotals), recipe.id)
        .toBeGreaterThan(0);
    }
  });

  it("rejects a component cycle explicitly, independent of recipe order", () => {
    const cycle: readonly CraftingRecipe[] = [
      {
        id: "cycle/a",
        label: "Bad braid",
        inputs: [{ item: "pitchcloth", quantity: 1 }],
        output: { type: "stack", item: "braided-cord", quantity: 1 },
      },
      {
        id: "cycle/b",
        label: "Bad cloth",
        inputs: [{ item: "braided-cord", quantity: 1 }],
        output: { type: "stack", item: "pitchcloth", quantity: 1 },
      },
    ];

    const forward = validateCraftingCatalog(cycle);
    const reversed = validateCraftingCatalog([...cycle].reverse());

    expect(forward).toEqual(reversed);
    expect(forward.ok).toBe(false);
    expect(forward.topologicalRecipeIds).toEqual([]);
    expect(forward.issues.filter(({ code }) => code === "cyclic-recipe").map(({ recipeId }) => recipeId))
      .toEqual(["cycle/a", "cycle/b"]);
    expect(calculateRecipeRawCost("cycle/a", cycle)).toBeNull();
  });

  it("rejects recipes that would create a component without a positive raw cost", () => {
    const freeComponent: readonly CraftingRecipe[] = [{
      id: "free/braid",
      label: "Conjure braid",
      inputs: [],
      output: { type: "stack", item: "braided-cord", quantity: 1 },
    }];

    expect(validateCraftingCatalog(freeComponent)).toMatchObject({
      ok: false,
      issues: [{
        code: "no-positive-raw-cost",
        recipeId: "free/braid",
        itemId: null,
      }],
    });
  });

  it("calculates deterministic raw totals regardless of catalog and input order", () => {
    const expected = {
      bladderkelp: 1,
      cordreed: 2,
      driftwood: 0,
      "glimmer-spore": 0,
      hookstone: 4,
      pitchmoss: 0,
      shellstone: 2,
      stormlichen: 0,
      sunfiber: 1,
    };
    expect(calculateRecipeRawCost("gear/tide-anchor")).toEqual(expected);
    expect(calculateRecipeRawCost("gear/tide-anchor", [...CRAFTING_RECIPES].reverse()))
      .toEqual(expected);

    const stacks: readonly StackAmount[] = [
      { item: "stone-fitting", quantity: 2 },
      { item: "bladderkelp", quantity: 1 },
      { item: "braided-cord", quantity: 1 },
    ];
    expect(expandStacksToRaw(stacks)).toEqual(expected);
    expect(expandStacksToRaw([...stacks].reverse())).toEqual(expected);
  });
});

describe("atomic inventory transactions", () => {
  it("conserves the exact raw cost when material becomes a component", () => {
    const inventory = createCraftingInventory(20_000, {
      cordreed: 3,
      sunfiber: 2,
      driftwood: 1,
    });
    const before = structuredClone(inventory);
    const result = craft(inventory, { recipeId: "component/braided-cord" });

    expect(result.ok).toBe(true);
    expect(result.inventory.stacks).toMatchObject({
      cordreed: 1,
      sunfiber: 1,
      driftwood: 1,
      "braided-cord": 1,
    });
    expect(inventory).toEqual(before);
    expect(expandStacksToRaw([
      { item: "cordreed", quantity: 2 },
      { item: "sunfiber", quantity: 1 },
    ])).toEqual(expandStacksToRaw([{ item: "braided-cord", quantity: 1 }]));
    expect(result.loadAfterMilli).toBe(result.loadBeforeMilli - 800);
  });

  it("fails a bulky craft atomically when its exact projected load exceeds capacity", () => {
    const inventory = createCraftingInventory(4_600, {
      "braided-cord": 2,
      driftwood: 1,
      pitchcloth: 1,
    });
    const before = structuredClone(inventory);
    const preview = previewCraft(inventory, { recipeId: "gear/reed-mat", gearId: 41 });
    const result = craft(inventory, { recipeId: "gear/reed-mat", gearId: 41 });

    expect(inventoryLoadMilli(inventory)).toBe(4_200);
    expect(preview).toMatchObject({
      ok: false,
      reason: "capacity-exceeded",
      loadBeforeMilli: 4_200,
      loadAfterMilli: 5_200,
    });
    expect(result.ok).toBe(false);
    expect(result.inventory).toBe(inventory);
    expect(result.inventory).toEqual(before);
    expect(result.craftedGear).toBeNull();
  });

  it("reports exact missing materials and stable gear-ID failures", () => {
    const empty = createCraftingInventory(20_000);
    expect(previewCraft(empty, { recipeId: "gear/ladder" })).toMatchObject({
      reason: "gear-id-required",
      message: "Durable gear needs a positive stable item ID.",
    });
    expect(previewCraft(empty, { recipeId: "gear/ladder", gearId: 8 })).toMatchObject({
      reason: "missing-material",
      missing: [
        { item: "braided-cord", quantity: 2 },
        { item: "driftwood", quantity: 3 },
        { item: "stone-fitting", quantity: 1 },
      ],
    });

    const occupied = createCraftingInventory(20_000, {}, [
      { id: 8, kind: "wind-knot", condition: CRAFTING_CONDITION_MAX },
    ]);
    expect(previewCraft(occupied, { recipeId: "gear/ladder", gearId: 8 }).reason)
      .toBe("gear-id-taken");
  });
});

describe("bounded durability, repair, and service wear", () => {
  it("clamps repair to the real deficit without consuming for the oversized request", () => {
    const gear = { id: 17, kind: "ladder" as const, condition: 920_000 };
    const inventory = createCraftingInventory(30_000, {
      driftwood: 4,
      "braided-cord": 3,
    }, [gear]);
    const before = structuredClone(inventory);
    const preview = previewRepair(inventory, gear.id, 900_000);
    const result = repair(inventory, gear.id, 900_000);

    expect(preview.quote).toEqual({
      kind: "ladder",
      conditionBefore: 920_000,
      conditionAfter: CRAFTING_CONDITION_MAX,
      conditionRestored: 80_000,
      ingredients: [
        { item: "braided-cord", quantity: 1 },
        { item: "driftwood", quantity: 1 },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.inventory.gear[0]?.condition).toBe(CRAFTING_CONDITION_MAX);
    expect(result.inventory.stacks).toMatchObject({ driftwood: 3, "braided-cord": 2 });
    expect(inventory).toEqual(before);

    expect(quoteLadderRepairCost(920_000, 80_000))
      .toEqual(quoteLadderRepairCost(920_000, 900_000));
    expect(quoteWayknotRepairCost("tide-anchor", 999_999, CRAFTING_CONDITION_MAX))
      .toMatchObject({ conditionAfter: CRAFTING_CONDITION_MAX, conditionRestored: 1 });
  });

  it("does not consume anything when a repair is blocked or already pristine", () => {
    const worn = createCraftingInventory(10_000, {}, [
      { id: 1, kind: "wind-knot", condition: 400_000 },
    ]);
    const blocked = repair(worn, 1, 200_000);
    expect(blocked).toMatchObject({ ok: false, reason: "missing-material" });
    expect(blocked.inventory).toBe(worn);

    const pristine = createCraftingInventory(10_000, { cordreed: 3, stormlichen: 3 }, [
      { id: 2, kind: "wind-knot", condition: CRAFTING_CONDITION_MAX },
    ]);
    const result = repair(pristine, 2, 200_000);
    expect(result).toMatchObject({ ok: false, reason: "already-pristine" });
    expect(result.inventory).toBe(pristine);
  });

  it("rejects out-of-range durable condition at the inventory boundary", () => {
    expect(() => createCraftingInventory(10_000, {}, [
      { id: 1, kind: "ladder", condition: CRAFTING_CONDITION_MAX + 1 },
    ])).toThrow("invalid-gear");
    expect(() => createCraftingInventory(10_000, {}, [
      { id: 1, kind: "ladder", condition: -1 },
    ])).toThrow("invalid-gear");
    expect(quoteLadderRepairCost(-1, 50_000)).toBeNull();
  });

  it("quotes placement, reclaim, and only explicitly assisted-use wear without runtime mutation", () => {
    expect(quoteWayknotServiceWear("reed-mat", 500_000, "placement")).toEqual({
      allowed: true,
      reason: "ready",
      action: "placement",
      conditionBefore: 500_000,
      conditionAfter: 420_000,
      conditionSpent: 80_000,
      services: 1,
    });
    expect(quoteWayknotServiceWear("tide-anchor", 140_000, "placement"))
      .toMatchObject({ allowed: false, reason: "condition-too-low", conditionSpent: 0 });
    expect(quoteWayknotServiceWear("wind-knot", 50_000, "assisted-use", 0))
      .toMatchObject({ allowed: true, conditionSpent: 0, conditionAfter: 50_000 });
    expect(quoteWayknotServiceWear("wind-knot", 500_000, "placement", 0))
      .toMatchObject({ allowed: false, reason: "invalid-service-count", conditionSpent: 0 });
    expect(quoteLadderServiceWear(300_000, "assisted-use", 3))
      .toMatchObject({ conditionSpent: 54_000, conditionAfter: 246_000 });
    expect(quoteLadderServiceWear(100_000, "reclaim"))
      .toMatchObject({ allowed: true, conditionSpent: 30_000, conditionAfter: 70_000 });
  });
});

describe("lossy dismantling", () => {
  it("keeps every pristine salvage vector strictly below construction cost", () => {
    expect(validateDefaultSalvageLosses()).toEqual([]);

    for (const kind of CRAFTED_GEAR_KINDS) {
      const gear = { id: 1, kind, condition: CRAFTING_CONDITION_MAX };
      const salvageRaw = expandStacksToRaw(salvageForGear(gear));
      const constructionRaw = calculateRecipeRawCost(`gear/${kind}`);
      expect(salvageRaw, kind).not.toBeNull();
      expect(constructionRaw, kind).not.toBeNull();
      if (salvageRaw && constructionRaw) {
        expectComponentwiseBelow(salvageRaw, constructionRaw);
        expect(sumRaw(salvageRaw), kind).toBeLessThan(sumRaw(constructionRaw));
      }
    }
  });

  it("reduces worn salvage and prevents a craft-dismantle round trip from paying back inputs", () => {
    const pristine = salvageForGear({ id: 7, kind: "ladder", condition: CRAFTING_CONDITION_MAX });
    const worn = salvageForGear({ id: 7, kind: "ladder", condition: 499_999 });
    expect(pristine).toEqual([
      { item: "braided-cord", quantity: 1 },
      { item: "driftwood", quantity: 1 },
    ]);
    expect(worn).toEqual([]);

    const inventory = createCraftingInventory(20_000, {
      "braided-cord": 2,
      driftwood: 3,
      "stone-fitting": 1,
    });
    const made = craft(inventory, { recipeId: "gear/ladder", gearId: 90 });
    expect(made.ok).toBe(true);
    const recovered = dismantle(made.inventory, 90);
    expect(recovered.ok).toBe(true);
    expect(recovered.inventory.stacks).toMatchObject({
      "braided-cord": 1,
      driftwood: 1,
      "stone-fitting": 0,
    });
    expect(recovered.inventory.gear).toEqual([]);
  });

  it("makes salvage capacity checks atomic when recovered parts are bulkier than folded gear", () => {
    const gear = { id: 33, kind: "wind-knot" as const, condition: CRAFTING_CONDITION_MAX };
    const inventory = createCraftingInventory(1_375, { sunfiber: 2 }, [gear]);
    const before = structuredClone(inventory);
    expect(inventoryLoadMilli(inventory)).toBe(1_350);

    const preview = previewDismantle(inventory, gear.id);
    const result = dismantle(inventory, gear.id);
    expect(CRAFTED_GEAR_DEFINITIONS["wind-knot"].loadMilli).toBe(350);
    expect(preview).toMatchObject({
      ok: false,
      reason: "capacity-exceeded",
      loadBeforeMilli: 1_350,
      loadAfterMilli: 1_400,
      salvage: [{ item: "stormweave", quantity: 1 }],
    });
    expect(result.inventory).toBe(inventory);
    expect(result.inventory).toEqual(before);
  });
});

import { FIXED_POINT } from "../sim/types";
import {
  FIELD_MATERIAL_IDS,
  FIELD_MATERIAL_UNIT_LOAD_MILLI,
  type FieldMaterialId,
} from "../sim/fieldResources";

/**
 * Pure field-crafting foundation.
 *
 * This module deliberately does not import the player, runtime, save, or UI
 * models. It owns a small structural inventory that those layers can adapt to
 * later. Every quantity and load is an integer; there are no clocks, random
 * rolls, hidden station inventories, or partial mutations.
 */

export const CRAFTING_FOUNDATION_VERSION = 1 as const;
export const CRAFTING_CONDITION_MAX = FIXED_POINT;

/** Shared verbatim with the deterministic field-resource ecology. */
export const RAW_MATERIAL_IDS = FIELD_MATERIAL_IDS;

export type RawMaterialId = FieldMaterialId;

/** Shallow, reusable intermediates: raw material -> component -> field gear. */
export const CRAFTING_COMPONENT_IDS = [
  "braided-cord",
  "float-cell",
  "glimmer-seal",
  "pitchcloth",
  "stone-fitting",
  "stormweave",
] as const;

export type CraftingComponentId = (typeof CRAFTING_COMPONENT_IDS)[number];

export const CRAFTING_STACK_IDS = [
  ...RAW_MATERIAL_IDS,
  ...CRAFTING_COMPONENT_IDS,
] as const;

export type CraftingStackId = RawMaterialId | CraftingComponentId;

export const CRAFTED_GEAR_KINDS = [
  "cargo-rain-shroud",
  "float-sash",
  "glimmer-liner",
  "ladder",
  "marsh-wraps",
  "pannier",
  "reed-mat",
  "ridge-cleats",
  "tide-anchor",
  "weather-cape",
  "wind-knot",
] as const;

export type CraftedGearKind = (typeof CRAFTED_GEAR_KINDS)[number];
export type CraftableWayknotKind = "reed-mat" | "tide-anchor" | "wind-knot";

export interface CraftingStackDefinition {
  readonly id: CraftingStackId;
  readonly label: string;
  /** Encumbrance in exact thousandths of one player load unit. */
  readonly loadMilli: number;
  readonly tier: "raw" | "component";
}

export interface StackAmount {
  readonly item: CraftingStackId;
  readonly quantity: number;
}

export interface CraftedGearDefinition {
  readonly kind: CraftedGearKind;
  readonly label: string;
  readonly loadMilli: number;
  readonly repairIngredients: readonly StackAmount[];
  /** Fixed salvage at pristine condition; worn gear yields proportionally less. */
  readonly salvageAtFullCondition: readonly StackAmount[];
}

export interface StackRecipeOutput {
  readonly type: "stack";
  readonly item: CraftingComponentId;
  /** Component recipes intentionally produce one canonical unit per batch. */
  readonly quantity: 1;
}

export interface GearRecipeOutput {
  readonly type: "gear";
  readonly kind: CraftedGearKind;
}

export interface CraftingRecipe {
  readonly id: string;
  readonly label: string;
  readonly inputs: readonly StackAmount[];
  readonly output: StackRecipeOutput | GearRecipeOutput;
}

export type CraftingStacks = Readonly<Record<CraftingStackId, number>>;

export interface CraftedGearItem {
  /** Supplied by the integrating save/runtime layer; never generated here. */
  readonly id: number;
  readonly kind: CraftedGearKind;
  /** Fixed-point durability in the inclusive range 0..1,000,000. */
  readonly condition: number;
}

export interface CraftingInventory {
  readonly version: typeof CRAFTING_FOUNDATION_VERSION;
  readonly capacityMilliLoad: number;
  readonly stacks: CraftingStacks;
  readonly gear: readonly CraftedGearItem[];
}

export const CRAFTING_STACK_DEFINITIONS: Readonly<Record<CraftingStackId, CraftingStackDefinition>> = {
  bladderkelp: { id: "bladderkelp", label: "Bladderkelp", loadMilli: FIELD_MATERIAL_UNIT_LOAD_MILLI.bladderkelp, tier: "raw" },
  cordreed: { id: "cordreed", label: "Cordreed", loadMilli: FIELD_MATERIAL_UNIT_LOAD_MILLI.cordreed, tier: "raw" },
  driftwood: { id: "driftwood", label: "Driftwood", loadMilli: FIELD_MATERIAL_UNIT_LOAD_MILLI.driftwood, tier: "raw" },
  "glimmer-spore": { id: "glimmer-spore", label: "Glimmer spore", loadMilli: FIELD_MATERIAL_UNIT_LOAD_MILLI["glimmer-spore"], tier: "raw" },
  hookstone: { id: "hookstone", label: "Hookstone", loadMilli: FIELD_MATERIAL_UNIT_LOAD_MILLI.hookstone, tier: "raw" },
  pitchmoss: { id: "pitchmoss", label: "Pitchmoss", loadMilli: FIELD_MATERIAL_UNIT_LOAD_MILLI.pitchmoss, tier: "raw" },
  shellstone: { id: "shellstone", label: "Shellstone", loadMilli: FIELD_MATERIAL_UNIT_LOAD_MILLI.shellstone, tier: "raw" },
  stormlichen: { id: "stormlichen", label: "Stormlichen", loadMilli: FIELD_MATERIAL_UNIT_LOAD_MILLI.stormlichen, tier: "raw" },
  sunfiber: { id: "sunfiber", label: "Sunfiber", loadMilli: FIELD_MATERIAL_UNIT_LOAD_MILLI.sunfiber, tier: "raw" },
  "braided-cord": { id: "braided-cord", label: "Braided cord", loadMilli: 900, tier: "component" },
  "float-cell": { id: "float-cell", label: "Float cell", loadMilli: 1_400, tier: "component" },
  "glimmer-seal": { id: "glimmer-seal", label: "Glimmer seal", loadMilli: 1_150, tier: "component" },
  pitchcloth: { id: "pitchcloth", label: "Pitchcloth", loadMilli: 600, tier: "component" },
  "stone-fitting": { id: "stone-fitting", label: "Stone fitting", loadMilli: 2_400, tier: "component" },
  stormweave: { id: "stormweave", label: "Stormweave", loadMilli: 400, tier: "component" },
};

export const CRAFTED_GEAR_DEFINITIONS: Readonly<Record<CraftedGearKind, CraftedGearDefinition>> = {
  "cargo-rain-shroud": {
    kind: "cargo-rain-shroud",
    label: "Cargo rain shroud",
    loadMilli: 1_100,
    repairIngredients: amounts(["pitchcloth", 2], ["glimmer-spore", 1]),
    salvageAtFullCondition: amounts(["pitchcloth", 1]),
  },
  "float-sash": {
    kind: "float-sash",
    label: "Float sash",
    loadMilli: 1_500,
    repairIngredients: amounts(["bladderkelp", 2], ["cordreed", 1]),
    salvageAtFullCondition: amounts(["float-cell", 1]),
  },
  "glimmer-liner": {
    kind: "glimmer-liner",
    label: "Glimmer liner",
    loadMilli: 900,
    repairIngredients: amounts(["glimmer-spore", 2], ["pitchmoss", 1]),
    salvageAtFullCondition: amounts(["glimmer-seal", 1]),
  },
  ladder: {
    kind: "ladder",
    label: "Field ladder",
    loadMilli: 6_000,
    repairIngredients: amounts(["driftwood", 2], ["braided-cord", 1]),
    salvageAtFullCondition: amounts(["braided-cord", 1], ["driftwood", 1]),
  },
  "marsh-wraps": {
    kind: "marsh-wraps",
    label: "Marsh wraps",
    loadMilli: 1_000,
    repairIngredients: amounts(["cordreed", 1], ["pitchmoss", 1]),
    salvageAtFullCondition: amounts(["pitchcloth", 1]),
  },
  pannier: {
    kind: "pannier",
    label: "Trail pannier",
    loadMilli: 3_200,
    repairIngredients: amounts(["driftwood", 1], ["cordreed", 2]),
    salvageAtFullCondition: amounts(["braided-cord", 1], ["driftwood", 1]),
  },
  "reed-mat": {
    kind: "reed-mat",
    label: "Reed mat",
    loadMilli: 5_200,
    repairIngredients: amounts(["cordreed", 2], ["pitchmoss", 1]),
    salvageAtFullCondition: amounts(["braided-cord", 1], ["driftwood", 1]),
  },
  "ridge-cleats": {
    kind: "ridge-cleats",
    label: "Ridge cleats",
    loadMilli: 2_200,
    repairIngredients: amounts(["hookstone", 2], ["braided-cord", 1]),
    salvageAtFullCondition: amounts(["stone-fitting", 1]),
  },
  "tide-anchor": {
    kind: "tide-anchor",
    label: "Tide anchor",
    loadMilli: 5_000,
    repairIngredients: amounts(["shellstone", 2], ["braided-cord", 1]),
    salvageAtFullCondition: amounts(["braided-cord", 1], ["stone-fitting", 1]),
  },
  "weather-cape": {
    kind: "weather-cape",
    label: "Weather cape",
    loadMilli: 1_300,
    repairIngredients: amounts(["stormlichen", 2], ["pitchmoss", 1]),
    salvageAtFullCondition: amounts(["pitchcloth", 1], ["stormweave", 1]),
  },
  "wind-knot": {
    kind: "wind-knot",
    label: "Wind knot",
    loadMilli: 350,
    repairIngredients: amounts(["stormlichen", 2], ["cordreed", 1]),
    salvageAtFullCondition: amounts(["stormweave", 1]),
  },
};

export const CRAFTING_RECIPES: readonly CraftingRecipe[] = [
  componentRecipe("component/braided-cord", "Braid cord", "braided-cord", amounts(["cordreed", 2], ["sunfiber", 1])),
  componentRecipe("component/float-cell", "Bind float cell", "float-cell", amounts(["bladderkelp", 2], ["cordreed", 1])),
  componentRecipe("component/glimmer-seal", "Press glimmer seal", "glimmer-seal", amounts(["glimmer-spore", 1], ["pitchmoss", 1], ["shellstone", 1])),
  componentRecipe("component/pitchcloth", "Wax pitchcloth", "pitchcloth", amounts(["pitchmoss", 1], ["sunfiber", 1])),
  componentRecipe("component/stone-fitting", "Knuckle stone fitting", "stone-fitting", amounts(["hookstone", 2], ["shellstone", 1])),
  componentRecipe("component/stormweave", "Twist stormweave", "stormweave", amounts(["stormlichen", 1], ["sunfiber", 1])),
  gearRecipe("gear/cargo-rain-shroud", "Make cargo rain shroud", "cargo-rain-shroud", amounts(["glimmer-seal", 1], ["pitchcloth", 2])),
  gearRecipe("gear/float-sash", "Make float sash", "float-sash", amounts(["braided-cord", 1], ["float-cell", 2])),
  gearRecipe("gear/glimmer-liner", "Make glimmer liner", "glimmer-liner", amounts(["glimmer-seal", 2], ["pitchcloth", 1])),
  gearRecipe("gear/ladder", "Make field ladder", "ladder", amounts(["braided-cord", 2], ["driftwood", 3], ["stone-fitting", 1])),
  gearRecipe("gear/marsh-wraps", "Make marsh wraps", "marsh-wraps", amounts(["braided-cord", 1], ["pitchcloth", 1])),
  gearRecipe("gear/pannier", "Make trail pannier", "pannier", amounts(["braided-cord", 2], ["driftwood", 2], ["pitchcloth", 1])),
  gearRecipe("gear/reed-mat", "Make reed mat", "reed-mat", amounts(["braided-cord", 2], ["driftwood", 1], ["pitchcloth", 1])),
  gearRecipe("gear/ridge-cleats", "Make ridge cleats", "ridge-cleats", amounts(["braided-cord", 1], ["stone-fitting", 2])),
  gearRecipe("gear/tide-anchor", "Make tide anchor", "tide-anchor", amounts(["bladderkelp", 1], ["braided-cord", 1], ["stone-fitting", 2])),
  gearRecipe("gear/weather-cape", "Make weather cape", "weather-cape", amounts(["pitchcloth", 2], ["stormweave", 2])),
  gearRecipe("gear/wind-knot", "Make wind knot", "wind-knot", amounts(["braided-cord", 1], ["stormweave", 2])),
];

export type CatalogIssueCode =
  | "duplicate-recipe"
  | "duplicate-output"
  | "invalid-recipe-id"
  | "invalid-ingredient"
  | "duplicate-ingredient"
  | "invalid-output"
  | "missing-component-recipe"
  | "cyclic-recipe"
  | "no-positive-raw-cost";

export interface CatalogIssue {
  readonly code: CatalogIssueCode;
  readonly recipeId: string | null;
  readonly itemId: string | null;
  readonly message: string;
}

export interface CraftingCatalogValidation {
  readonly ok: boolean;
  readonly issues: readonly CatalogIssue[];
  /** Dependency-first, stable across input array ordering. */
  readonly topologicalRecipeIds: readonly string[];
}

export type CraftBlockReason =
  | "ready"
  | "recipe-not-found"
  | "catalog-invalid"
  | "invalid-inventory"
  | "missing-material"
  | "gear-id-required"
  | "gear-id-taken"
  | "capacity-exceeded";

export interface CraftRequest {
  readonly recipeId: string;
  /** Required only when the recipe emits durable gear. */
  readonly gearId?: number;
}

export interface CraftPreview {
  readonly ok: boolean;
  readonly reason: CraftBlockReason;
  readonly message: string;
  readonly recipe: CraftingRecipe | null;
  readonly missing: readonly StackAmount[];
  readonly loadBeforeMilli: number;
  readonly loadAfterMilli: number;
}

export interface CraftResult extends CraftPreview {
  readonly inventory: CraftingInventory;
  readonly craftedGear: CraftedGearItem | null;
}

export type RepairBlockReason =
  | "ready"
  | "invalid-inventory"
  | "gear-not-found"
  | "invalid-repair-amount"
  | "already-pristine"
  | "missing-material";

export interface RepairCostQuote {
  readonly kind: CraftedGearKind;
  readonly conditionBefore: number;
  readonly conditionAfter: number;
  readonly conditionRestored: number;
  readonly ingredients: readonly StackAmount[];
}

export interface RepairPreview {
  readonly ok: boolean;
  readonly reason: RepairBlockReason;
  readonly message: string;
  readonly gear: CraftedGearItem | null;
  readonly quote: RepairCostQuote | null;
  readonly missing: readonly StackAmount[];
}

export interface RepairResult extends RepairPreview {
  readonly inventory: CraftingInventory;
}

export type DismantleBlockReason =
  | "ready"
  | "invalid-inventory"
  | "gear-not-found"
  | "capacity-exceeded";

export interface DismantlePreview {
  readonly ok: boolean;
  readonly reason: DismantleBlockReason;
  readonly message: string;
  readonly gear: CraftedGearItem | null;
  readonly salvage: readonly StackAmount[];
  readonly loadBeforeMilli: number;
  readonly loadAfterMilli: number;
}

export interface DismantleResult extends DismantlePreview {
  readonly inventory: CraftingInventory;
}

export interface InventoryInspection {
  readonly valid: boolean;
  readonly reason: "ready" | "invalid-capacity" | "invalid-stack" | "invalid-gear" | "over-capacity";
  readonly loadMilli: number;
  readonly freeMilli: number;
}

export interface RawMaterialTotals extends Readonly<Record<RawMaterialId, number>> {}

export type ServiceWearAction = "placement" | "reclaim" | "assisted-use";
export type ServiceWearReason = "ready" | "condition-too-low" | "invalid-service-count";

export interface ServiceWearQuote {
  readonly allowed: boolean;
  readonly reason: ServiceWearReason;
  readonly action: ServiceWearAction;
  readonly conditionBefore: number;
  readonly conditionAfter: number;
  readonly conditionSpent: number;
  readonly services: number;
}

export const WAYKNOT_MIN_PLACEMENT_CONDITION = 150_000;
export const LADDER_MIN_PLACEMENT_CONDITION = 250_000;

const STACK_ID_SET: ReadonlySet<string> = new Set(CRAFTING_STACK_IDS);
const RAW_ID_SET: ReadonlySet<string> = new Set(RAW_MATERIAL_IDS);
const COMPONENT_ID_SET: ReadonlySet<string> = new Set(CRAFTING_COMPONENT_IDS);
const GEAR_KIND_SET: ReadonlySet<string> = new Set(CRAFTED_GEAR_KINDS);
const MAX_STACK_QUANTITY = 1_000_000;
const MAX_GEAR_ITEMS = 4_096;
const MAX_CAPACITY_MILLI = 9_000_000_000_000;

const WAYKNOT_SERVICE_WEAR: Readonly<Record<CraftableWayknotKind, Readonly<Record<ServiceWearAction, number>>>> = {
  "reed-mat": { placement: 80_000, reclaim: 40_000, "assisted-use": 12_000 },
  "tide-anchor": { placement: 80_000, reclaim: 40_000, "assisted-use": 16_000 },
  "wind-knot": { placement: 80_000, reclaim: 40_000, "assisted-use": 10_000 },
};

const LADDER_SERVICE_WEAR: Readonly<Record<ServiceWearAction, number>> = {
  placement: 60_000,
  reclaim: 30_000,
  "assisted-use": 18_000,
};

function amounts(...entries: readonly (readonly [CraftingStackId, number])[]): readonly StackAmount[] {
  return entries
    .map(([item, quantity]) => ({ item, quantity }))
    .sort(compareStackAmount);
}

function componentRecipe(
  id: string,
  label: string,
  item: CraftingComponentId,
  inputs: readonly StackAmount[],
): CraftingRecipe {
  return { id, label, inputs, output: { type: "stack", item, quantity: 1 } };
}

function gearRecipe(
  id: string,
  label: string,
  kind: CraftedGearKind,
  inputs: readonly StackAmount[],
): CraftingRecipe {
  return { id, label, inputs, output: { type: "gear", kind } };
}

function compareStackAmount(left: StackAmount, right: StackAmount): number {
  return left.item < right.item ? -1 : left.item > right.item ? 1 : 0;
}

export function createEmptyCraftingStacks(): Record<CraftingStackId, number> {
  return {
    bladderkelp: 0,
    cordreed: 0,
    driftwood: 0,
    "glimmer-spore": 0,
    hookstone: 0,
    pitchmoss: 0,
    shellstone: 0,
    stormlichen: 0,
    sunfiber: 0,
    "braided-cord": 0,
    "float-cell": 0,
    "glimmer-seal": 0,
    pitchcloth: 0,
    "stone-fitting": 0,
    stormweave: 0,
  };
}

export function createCraftingInventory(
  capacityMilliLoad: number,
  stacks: Partial<Readonly<Record<CraftingStackId, number>>> = {},
  gear: readonly CraftedGearItem[] = [],
): CraftingInventory {
  const canonicalStacks = createEmptyCraftingStacks();
  for (const item of CRAFTING_STACK_IDS) canonicalStacks[item] = stacks[item] ?? 0;
  const inventory: CraftingInventory = {
    version: CRAFTING_FOUNDATION_VERSION,
    capacityMilliLoad,
    stacks: canonicalStacks,
    gear: [...gear].sort((left, right) => left.id - right.id),
  };
  const inspection = inspectCraftingInventory(inventory);
  if (!inspection.valid) throw new RangeError(`Invalid crafting inventory: ${inspection.reason}`);
  return inventory;
}

export function inspectCraftingInventory(inventory: CraftingInventory): InventoryInspection {
  if (
    !Number.isSafeInteger(inventory.capacityMilliLoad)
    || inventory.capacityMilliLoad < 0
    || inventory.capacityMilliLoad > MAX_CAPACITY_MILLI
  ) {
    return { valid: false, reason: "invalid-capacity", loadMilli: 0, freeMilli: 0 };
  }
  let loadMilli = 0;
  for (const item of CRAFTING_STACK_IDS) {
    const quantity = inventory.stacks[item];
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > MAX_STACK_QUANTITY) {
      return { valid: false, reason: "invalid-stack", loadMilli: 0, freeMilli: 0 };
    }
    loadMilli += quantity * CRAFTING_STACK_DEFINITIONS[item].loadMilli;
  }
  if (!Array.isArray(inventory.gear) || inventory.gear.length > MAX_GEAR_ITEMS) {
    return { valid: false, reason: "invalid-gear", loadMilli: 0, freeMilli: 0 };
  }
  const ids = new Set<number>();
  for (const gear of inventory.gear) {
    const typedGear = gear as CraftedGearItem;
    if (
      !Number.isSafeInteger(typedGear.id)
      || typedGear.id <= 0
      || ids.has(typedGear.id)
      || !GEAR_KIND_SET.has(typedGear.kind)
      || !Number.isSafeInteger(typedGear.condition)
      || typedGear.condition < 0
      || typedGear.condition > CRAFTING_CONDITION_MAX
    ) {
      return { valid: false, reason: "invalid-gear", loadMilli: 0, freeMilli: 0 };
    }
    ids.add(typedGear.id);
    loadMilli += CRAFTED_GEAR_DEFINITIONS[typedGear.kind].loadMilli;
  }
  if (!Number.isSafeInteger(loadMilli)) {
    return { valid: false, reason: "invalid-stack", loadMilli: 0, freeMilli: 0 };
  }
  if (loadMilli > inventory.capacityMilliLoad) {
    return { valid: false, reason: "over-capacity", loadMilli, freeMilli: 0 };
  }
  return {
    valid: true,
    reason: "ready",
    loadMilli,
    freeMilli: inventory.capacityMilliLoad - loadMilli,
  };
}

export function inventoryLoadMilli(inventory: CraftingInventory): number {
  return inspectCraftingInventory(inventory).loadMilli;
}

export function validateCraftingCatalog(
  recipes: readonly CraftingRecipe[],
): CraftingCatalogValidation {
  const issues: CatalogIssue[] = [];
  const byId = new Map<string, CraftingRecipe>();
  const producerByComponent = new Map<CraftingComponentId, CraftingRecipe>();
  const producerByGear = new Map<CraftedGearKind, CraftingRecipe>();

  for (const recipe of [...recipes].sort((left, right) => left.id.localeCompare(right.id))) {
    if (recipe.id.trim().length === 0) {
      issues.push(issue("invalid-recipe-id", recipe.id, null, "Recipe IDs must be non-empty."));
      continue;
    }
    if (byId.has(recipe.id)) {
      issues.push(issue("duplicate-recipe", recipe.id, null, `Recipe ${recipe.id} is duplicated.`));
      continue;
    }
    byId.set(recipe.id, recipe);

    const seenInputs = new Set<string>();
    for (const input of recipe.inputs) {
      if (
        !STACK_ID_SET.has(input.item)
        || !Number.isSafeInteger(input.quantity)
        || input.quantity <= 0
        || input.quantity > MAX_STACK_QUANTITY
      ) {
        issues.push(issue("invalid-ingredient", recipe.id, input.item, `Recipe ${recipe.id} has an invalid ingredient.`));
      } else if (seenInputs.has(input.item)) {
        issues.push(issue("duplicate-ingredient", recipe.id, input.item, `Recipe ${recipe.id} repeats ${input.item}.`));
      }
      seenInputs.add(input.item);
    }

    if (recipe.output.type === "stack") {
      if (!COMPONENT_ID_SET.has(recipe.output.item) || recipe.output.quantity !== 1) {
        issues.push(issue("invalid-output", recipe.id, recipe.output.item, `Recipe ${recipe.id} has an invalid component output.`));
      } else if (producerByComponent.has(recipe.output.item)) {
        issues.push(issue("duplicate-output", recipe.id, recipe.output.item, `${recipe.output.item} has more than one producer.`));
      } else {
        producerByComponent.set(recipe.output.item, recipe);
      }
    } else if (!GEAR_KIND_SET.has(recipe.output.kind)) {
      issues.push(issue("invalid-output", recipe.id, recipe.output.kind, `Recipe ${recipe.id} has an invalid gear output.`));
    } else if (producerByGear.has(recipe.output.kind)) {
      issues.push(issue("duplicate-output", recipe.id, recipe.output.kind, `${recipe.output.kind} has more than one producer.`));
    } else {
      producerByGear.set(recipe.output.kind, recipe);
    }
  }

  for (const recipe of byId.values()) {
    for (const input of recipe.inputs) {
      if (COMPONENT_ID_SET.has(input.item) && !producerByComponent.has(input.item as CraftingComponentId)) {
        issues.push(issue(
          "missing-component-recipe",
          recipe.id,
          input.item,
          `${recipe.id} requires ${input.item}, but the catalog cannot make it.`,
        ));
      }
    }
  }

  const visitState = new Map<string, "visiting" | "visited">();
  const topologicalRecipeIds: string[] = [];
  const cyclicRecipeIds = new Set<string>();
  const visit = (recipe: CraftingRecipe, path: readonly string[]): void => {
    const state = visitState.get(recipe.id);
    if (state === "visited") return;
    if (state === "visiting") {
      const cycleStart = path.indexOf(recipe.id);
      for (const id of path.slice(Math.max(0, cycleStart))) cyclicRecipeIds.add(id);
      cyclicRecipeIds.add(recipe.id);
      return;
    }
    visitState.set(recipe.id, "visiting");
    const dependencies = recipe.inputs
      .map((input) => producerByComponent.get(input.item as CraftingComponentId))
      .filter((candidate): candidate is CraftingRecipe => candidate !== undefined)
      .sort((left, right) => left.id.localeCompare(right.id));
    for (const dependency of dependencies) visit(dependency, [...path, recipe.id]);
    visitState.set(recipe.id, "visited");
    topologicalRecipeIds.push(recipe.id);
  };
  for (const recipe of [...byId.values()].sort((left, right) => left.id.localeCompare(right.id))) {
    visit(recipe, []);
  }
  for (const recipeId of [...cyclicRecipeIds].sort()) {
    issues.push(issue("cyclic-recipe", recipeId, null, `Recipe ${recipeId} participates in a cycle.`));
  }

  if (cyclicRecipeIds.size === 0) {
    for (const recipe of [...byId.values()].sort((left, right) => left.id.localeCompare(right.id))) {
      const rawCost = calculateRecipeRawCostUnchecked(recipe, producerByComponent, new Set());
      if (sumRawTotals(rawCost) <= 0) {
        issues.push(issue("no-positive-raw-cost", recipe.id, null, `${recipe.id} has no positive raw-material cost.`));
      }
    }
  }

  issues.sort(compareCatalogIssue);
  return {
    ok: issues.length === 0,
    issues,
    topologicalRecipeIds: cyclicRecipeIds.size === 0 ? topologicalRecipeIds : [],
  };
}

export function calculateRecipeRawCost(
  recipeId: string,
  recipes: readonly CraftingRecipe[] = CRAFTING_RECIPES,
): RawMaterialTotals | null {
  const validation = validateCraftingCatalog(recipes);
  if (!validation.ok) return null;
  const recipe = recipes.find((candidate) => candidate.id === recipeId);
  if (!recipe) return null;
  const producerByComponent = new Map<CraftingComponentId, CraftingRecipe>();
  for (const candidate of recipes) {
    if (candidate.output.type === "stack") producerByComponent.set(candidate.output.item, candidate);
  }
  return calculateRecipeRawCostUnchecked(recipe, producerByComponent, new Set());
}

/** Expand arbitrary raw/component stacks into their exact raw construction cost. */
export function expandStacksToRaw(
  stacks: readonly StackAmount[],
  recipes: readonly CraftingRecipe[] = CRAFTING_RECIPES,
): RawMaterialTotals | null {
  const validation = validateCraftingCatalog(recipes);
  if (!validation.ok) return null;
  const producerByComponent = new Map<CraftingComponentId, CraftingRecipe>();
  for (const recipe of recipes) {
    if (recipe.output.type === "stack") producerByComponent.set(recipe.output.item, recipe);
  }
  const totals = createEmptyRawTotals();
  for (const stack of stacks) {
    if (!Number.isSafeInteger(stack.quantity) || stack.quantity < 0 || !STACK_ID_SET.has(stack.item)) return null;
    if (RAW_ID_SET.has(stack.item)) {
      totals[stack.item as RawMaterialId] += stack.quantity;
      continue;
    }
    const producer = producerByComponent.get(stack.item as CraftingComponentId);
    if (!producer) return null;
    const raw = calculateRecipeRawCostUnchecked(producer, producerByComponent, new Set());
    addRawTotals(totals, raw, stack.quantity);
  }
  return totals;
}

export function previewCraft(
  inventory: CraftingInventory,
  request: CraftRequest,
  recipes: readonly CraftingRecipe[] = CRAFTING_RECIPES,
): CraftPreview {
  const inspection = inspectCraftingInventory(inventory);
  if (!inspection.valid) {
    return craftPreview(false, "invalid-inventory", `Pack is invalid: ${inspection.reason}.`, null, [], 0, 0);
  }
  const validation = validateCraftingCatalog(recipes);
  if (!validation.ok) {
    return craftPreview(false, "catalog-invalid", "Crafting recipes failed validation.", null, [], inspection.loadMilli, inspection.loadMilli);
  }
  const recipe = recipes.find((candidate) => candidate.id === request.recipeId) ?? null;
  if (!recipe) {
    return craftPreview(false, "recipe-not-found", `No recipe named ${request.recipeId}.`, null, [], inspection.loadMilli, inspection.loadMilli);
  }
  if (recipe.output.type === "gear") {
    if (!Number.isSafeInteger(request.gearId) || (request.gearId ?? 0) <= 0) {
      return craftPreview(false, "gear-id-required", "Durable gear needs a positive stable item ID.", recipe, [], inspection.loadMilli, inspection.loadMilli);
    }
    if (inventory.gear.some((gear) => gear.id === request.gearId)) {
      return craftPreview(false, "gear-id-taken", `Gear ID ${request.gearId} is already in the kit.`, recipe, [], inspection.loadMilli, inspection.loadMilli);
    }
  }
  const missing = missingIngredients(inventory.stacks, recipe.inputs);
  if (missing.length > 0) {
    return craftPreview(false, "missing-material", missingMessage(missing), recipe, missing, inspection.loadMilli, inspection.loadMilli);
  }
  const next = applyRecipeUnchecked(inventory, recipe, request.gearId);
  const nextInspection = inspectCraftingInventory(next);
  if (!nextInspection.valid) {
    const loadAfter = calculateUncheckedLoad(next);
    return craftPreview(
      false,
      "capacity-exceeded",
      `Need ${Math.max(0, loadAfter - inventory.capacityMilliLoad)} more milli-load of pack space.`,
      recipe,
      [],
      inspection.loadMilli,
      loadAfter,
    );
  }
  return craftPreview(true, "ready", `Ready to ${recipe.label.toLocaleLowerCase()}.`, recipe, [], inspection.loadMilli, nextInspection.loadMilli);
}

export function craft(
  inventory: CraftingInventory,
  request: CraftRequest,
  recipes: readonly CraftingRecipe[] = CRAFTING_RECIPES,
): CraftResult {
  const preview = previewCraft(inventory, request, recipes);
  if (!preview.ok || !preview.recipe) {
    return { ...preview, inventory, craftedGear: null };
  }
  const next = applyRecipeUnchecked(inventory, preview.recipe, request.gearId);
  const craftedGear = preview.recipe.output.type === "gear"
    ? next.gear.find((gear) => gear.id === request.gearId) ?? null
    : null;
  return { ...preview, inventory: next, craftedGear };
}

export function quoteGearRepair(
  kind: CraftedGearKind,
  condition: number,
  requestedConditionGain: number,
): RepairCostQuote | null {
  if (
    !GEAR_KIND_SET.has(kind)
    || !Number.isSafeInteger(condition)
    || condition < 0
    || condition > CRAFTING_CONDITION_MAX
    || !Number.isSafeInteger(requestedConditionGain)
    || requestedConditionGain <= 0
  ) return null;
  const conditionRestored = Math.min(requestedConditionGain, CRAFTING_CONDITION_MAX - condition);
  const definition = CRAFTED_GEAR_DEFINITIONS[kind];
  const ingredients = conditionRestored === 0
    ? []
    : definition.repairIngredients.map(({ item, quantity }) => ({
        item,
        quantity: Math.ceil((quantity * conditionRestored) / CRAFTING_CONDITION_MAX),
      }));
  return {
    kind,
    conditionBefore: condition,
    conditionAfter: condition + conditionRestored,
    conditionRestored,
    ingredients,
  };
}

export function quoteWayknotRepairCost(
  kind: CraftableWayknotKind,
  condition: number,
  requestedConditionGain: number,
): RepairCostQuote | null {
  return quoteGearRepair(kind, condition, requestedConditionGain);
}

export function quoteLadderRepairCost(
  condition: number,
  requestedConditionGain: number,
): RepairCostQuote | null {
  return quoteGearRepair("ladder", condition, requestedConditionGain);
}

export function previewRepair(
  inventory: CraftingInventory,
  gearId: number,
  requestedConditionGain: number,
): RepairPreview {
  const inspection = inspectCraftingInventory(inventory);
  if (!inspection.valid) return repairPreview(false, "invalid-inventory", `Pack is invalid: ${inspection.reason}.`, null, null, []);
  const gear = inventory.gear.find((candidate) => candidate.id === gearId) ?? null;
  if (!gear) return repairPreview(false, "gear-not-found", `No gear has ID ${gearId}.`, null, null, []);
  if (!Number.isSafeInteger(requestedConditionGain) || requestedConditionGain <= 0) {
    return repairPreview(false, "invalid-repair-amount", "Repair amount must be a positive fixed-point integer.", gear, null, []);
  }
  if (gear.condition >= CRAFTING_CONDITION_MAX) {
    return repairPreview(false, "already-pristine", `${CRAFTED_GEAR_DEFINITIONS[gear.kind].label} is already pristine.`, gear, null, []);
  }
  const quote = quoteGearRepair(gear.kind, gear.condition, requestedConditionGain);
  if (!quote) return repairPreview(false, "invalid-repair-amount", "Repair request could not be quoted.", gear, null, []);
  const missing = missingIngredients(inventory.stacks, quote.ingredients);
  if (missing.length > 0) return repairPreview(false, "missing-material", missingMessage(missing), gear, quote, missing);
  return repairPreview(true, "ready", `Restore ${quote.conditionRestored} condition.`, gear, quote, []);
}

export function repair(
  inventory: CraftingInventory,
  gearId: number,
  requestedConditionGain: number,
): RepairResult {
  const preview = previewRepair(inventory, gearId, requestedConditionGain);
  if (!preview.ok || !preview.gear || !preview.quote) return { ...preview, inventory };
  const stacks = copyStacks(inventory.stacks);
  consumeIngredients(stacks, preview.quote.ingredients);
  const gear = inventory.gear.map((item) => item.id === gearId
    ? { ...item, condition: preview.quote?.conditionAfter ?? item.condition }
    : { ...item });
  return { ...preview, inventory: { ...inventory, stacks, gear } };
}

export function salvageForGear(gear: CraftedGearItem): readonly StackAmount[] {
  const definition = CRAFTED_GEAR_DEFINITIONS[gear.kind];
  const condition = clampCondition(gear.condition);
  return definition.salvageAtFullCondition
    .map(({ item, quantity }) => ({
      item,
      quantity: Math.floor((quantity * condition) / CRAFTING_CONDITION_MAX),
    }))
    .filter(({ quantity }) => quantity > 0)
    .sort(compareStackAmount);
}

export function previewDismantle(inventory: CraftingInventory, gearId: number): DismantlePreview {
  const inspection = inspectCraftingInventory(inventory);
  if (!inspection.valid) return dismantlePreview(false, "invalid-inventory", `Pack is invalid: ${inspection.reason}.`, null, [], 0, 0);
  const gear = inventory.gear.find((candidate) => candidate.id === gearId) ?? null;
  if (!gear) return dismantlePreview(false, "gear-not-found", `No gear has ID ${gearId}.`, null, [], inspection.loadMilli, inspection.loadMilli);
  const salvage = salvageForGear(gear);
  const next = applyDismantleUnchecked(inventory, gear.id, salvage);
  const loadAfter = calculateUncheckedLoad(next);
  if (loadAfter > inventory.capacityMilliLoad) {
    return dismantlePreview(
      false,
      "capacity-exceeded",
      `Recovered parts need ${loadAfter - inventory.capacityMilliLoad} more milli-load of pack space.`,
      gear,
      salvage,
      inspection.loadMilli,
      loadAfter,
    );
  }
  return dismantlePreview(true, "ready", `Recover ${salvage.length} material stack${salvage.length === 1 ? "" : "s"}.`, gear, salvage, inspection.loadMilli, loadAfter);
}

export function dismantle(inventory: CraftingInventory, gearId: number): DismantleResult {
  const preview = previewDismantle(inventory, gearId);
  if (!preview.ok || !preview.gear) return { ...preview, inventory };
  return {
    ...preview,
    inventory: applyDismantleUnchecked(inventory, preview.gear.id, preview.salvage),
  };
}

/** Placement/reclaim/use wear quote for v2 Wayknots; it never mutates a v1 knot. */
export function quoteWayknotServiceWear(
  kind: CraftableWayknotKind,
  condition: number,
  action: ServiceWearAction,
  services = 1,
): ServiceWearQuote {
  return quoteServiceWear(
    condition,
    action,
    services,
    WAYKNOT_SERVICE_WEAR[kind][action],
    WAYKNOT_MIN_PLACEMENT_CONDITION,
  );
}

/** Placement/reclaim/crossing wear quote for the existing structural ladder model. */
export function quoteLadderServiceWear(
  condition: number,
  action: ServiceWearAction,
  services = 1,
): ServiceWearQuote {
  return quoteServiceWear(
    condition,
    action,
    services,
    LADDER_SERVICE_WEAR[action],
    LADDER_MIN_PLACEMENT_CONDITION,
  );
}

/** Default-catalog invariant: dismantling is componentwise lossy after expansion to raw finds. */
export function validateDefaultSalvageLosses(): readonly CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  for (const kind of CRAFTED_GEAR_KINDS) {
    const recipe = CRAFTING_RECIPES.find((candidate) => candidate.output.type === "gear" && candidate.output.kind === kind);
    const construction = recipe ? calculateRecipeRawCost(recipe.id) : null;
    const salvage = expandStacksToRaw(CRAFTED_GEAR_DEFINITIONS[kind].salvageAtFullCondition);
    if (!recipe || !construction || !salvage || !isStrictComponentwiseLoss(salvage, construction)) {
      issues.push(issue("no-positive-raw-cost", recipe?.id ?? null, kind, `${kind} salvage is not strictly below construction cost.`));
    }
  }
  return issues;
}

function issue(code: CatalogIssueCode, recipeId: string | null, itemId: string | null, message: string): CatalogIssue {
  return { code, recipeId, itemId, message };
}

function compareCatalogIssue(left: CatalogIssue, right: CatalogIssue): number {
  return left.code.localeCompare(right.code)
    || (left.recipeId ?? "").localeCompare(right.recipeId ?? "")
    || (left.itemId ?? "").localeCompare(right.itemId ?? "")
    || left.message.localeCompare(right.message);
}

function createEmptyRawTotals(): Record<RawMaterialId, number> {
  return {
    bladderkelp: 0,
    cordreed: 0,
    driftwood: 0,
    "glimmer-spore": 0,
    hookstone: 0,
    pitchmoss: 0,
    shellstone: 0,
    stormlichen: 0,
    sunfiber: 0,
  };
}

function calculateRecipeRawCostUnchecked(
  recipe: CraftingRecipe,
  producerByComponent: ReadonlyMap<CraftingComponentId, CraftingRecipe>,
  visiting: ReadonlySet<string>,
): Record<RawMaterialId, number> {
  if (visiting.has(recipe.id)) return createEmptyRawTotals();
  const nextVisiting = new Set(visiting).add(recipe.id);
  const total = createEmptyRawTotals();
  for (const input of recipe.inputs) {
    if (RAW_ID_SET.has(input.item)) {
      total[input.item as RawMaterialId] += input.quantity;
      continue;
    }
    const producer = producerByComponent.get(input.item as CraftingComponentId);
    if (!producer) continue;
    addRawTotals(total, calculateRecipeRawCostUnchecked(producer, producerByComponent, nextVisiting), input.quantity);
  }
  return total;
}

function addRawTotals(target: Record<RawMaterialId, number>, source: RawMaterialTotals, multiplier: number): void {
  for (const raw of RAW_MATERIAL_IDS) target[raw] += source[raw] * multiplier;
}

function sumRawTotals(totals: RawMaterialTotals): number {
  return RAW_MATERIAL_IDS.reduce((sum, raw) => sum + totals[raw], 0);
}

function isStrictComponentwiseLoss(salvage: RawMaterialTotals, construction: RawMaterialTotals): boolean {
  let strictlyLess = false;
  for (const raw of RAW_MATERIAL_IDS) {
    if (salvage[raw] > construction[raw]) return false;
    if (salvage[raw] < construction[raw]) strictlyLess = true;
  }
  return strictlyLess && sumRawTotals(salvage) > 0;
}

function craftPreview(
  ok: boolean,
  reason: CraftBlockReason,
  message: string,
  recipe: CraftingRecipe | null,
  missing: readonly StackAmount[],
  loadBeforeMilli: number,
  loadAfterMilli: number,
): CraftPreview {
  return { ok, reason, message, recipe, missing, loadBeforeMilli, loadAfterMilli };
}

function repairPreview(
  ok: boolean,
  reason: RepairBlockReason,
  message: string,
  gear: CraftedGearItem | null,
  quote: RepairCostQuote | null,
  missing: readonly StackAmount[],
): RepairPreview {
  return { ok, reason, message, gear, quote, missing };
}

function dismantlePreview(
  ok: boolean,
  reason: DismantleBlockReason,
  message: string,
  gear: CraftedGearItem | null,
  salvage: readonly StackAmount[],
  loadBeforeMilli: number,
  loadAfterMilli: number,
): DismantlePreview {
  return { ok, reason, message, gear, salvage, loadBeforeMilli, loadAfterMilli };
}

function missingIngredients(stacks: CraftingStacks, ingredients: readonly StackAmount[]): readonly StackAmount[] {
  return ingredients
    .flatMap(({ item, quantity }) => {
      const missing = quantity - stacks[item];
      return missing > 0 ? [{ item, quantity: missing }] : [];
    })
    .sort(compareStackAmount);
}

function missingMessage(missing: readonly StackAmount[]): string {
  return `Missing ${missing.map(({ item, quantity }) => `${quantity} ${CRAFTING_STACK_DEFINITIONS[item].label}`).join(", ")}.`;
}

function copyStacks(stacks: CraftingStacks): Record<CraftingStackId, number> {
  const copy = createEmptyCraftingStacks();
  for (const item of CRAFTING_STACK_IDS) copy[item] = stacks[item];
  return copy;
}

function consumeIngredients(stacks: Record<CraftingStackId, number>, ingredients: readonly StackAmount[]): void {
  for (const { item, quantity } of ingredients) stacks[item] -= quantity;
}

function applyRecipeUnchecked(
  inventory: CraftingInventory,
  recipe: CraftingRecipe,
  gearId: number | undefined,
): CraftingInventory {
  const stacks = copyStacks(inventory.stacks);
  consumeIngredients(stacks, recipe.inputs);
  const gear = inventory.gear.map((item) => ({ ...item }));
  if (recipe.output.type === "stack") {
    stacks[recipe.output.item] += recipe.output.quantity;
  } else {
    gear.push({ id: gearId ?? 0, kind: recipe.output.kind, condition: CRAFTING_CONDITION_MAX });
    gear.sort((left, right) => left.id - right.id);
  }
  return { ...inventory, stacks, gear };
}

function applyDismantleUnchecked(
  inventory: CraftingInventory,
  gearId: number,
  salvage: readonly StackAmount[],
): CraftingInventory {
  const stacks = copyStacks(inventory.stacks);
  for (const { item, quantity } of salvage) stacks[item] += quantity;
  return {
    ...inventory,
    stacks,
    gear: inventory.gear.filter((gear) => gear.id !== gearId).map((gear) => ({ ...gear })),
  };
}

function calculateUncheckedLoad(inventory: CraftingInventory): number {
  let total = 0;
  for (const item of CRAFTING_STACK_IDS) total += inventory.stacks[item] * CRAFTING_STACK_DEFINITIONS[item].loadMilli;
  for (const gear of inventory.gear) total += CRAFTED_GEAR_DEFINITIONS[gear.kind].loadMilli;
  return total;
}

function clampCondition(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= CRAFTING_CONDITION_MAX) return CRAFTING_CONDITION_MAX;
  return Math.trunc(value);
}

function quoteServiceWear(
  condition: number,
  action: ServiceWearAction,
  services: number,
  wearPerService: number,
  placementMinimum: number,
): ServiceWearQuote {
  const conditionBefore = clampCondition(condition);
  if (!Number.isSafeInteger(services) || services < 0) {
    return {
      allowed: false,
      reason: "invalid-service-count",
      action,
      conditionBefore,
      conditionAfter: conditionBefore,
      conditionSpent: 0,
      services: 0,
    };
  }
  if (services === 0 && action !== "assisted-use") {
    return {
      allowed: false,
      reason: "invalid-service-count",
      action,
      conditionBefore,
      conditionAfter: conditionBefore,
      conditionSpent: 0,
      services,
    };
  }
  if (action === "placement" && conditionBefore < placementMinimum) {
    return {
      allowed: false,
      reason: "condition-too-low",
      action,
      conditionBefore,
      conditionAfter: conditionBefore,
      conditionSpent: 0,
      services,
    };
  }
  const requestedWear = Math.min(CRAFTING_CONDITION_MAX, wearPerService * services);
  const conditionSpent = Math.min(conditionBefore, requestedWear);
  return {
    allowed: true,
    reason: "ready",
    action,
    conditionBefore,
    conditionAfter: conditionBefore - conditionSpent,
    conditionSpent,
    services,
  };
}

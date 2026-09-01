import { describe, expect, it } from "vitest";

import {
  KIT_DIALOG_ID,
  KIT_DIALOG_PANEL_ID,
  KIT_DIALOG_SCROLL_REGION_ID,
  KIT_MINIMUM_TARGET_CSS_PIXELS,
  KIT_TABS,
  formatKitMilliLoad,
  kitViewSignature,
  nextKitTab,
} from "./kitDialog";
import {
  KIT_REPAIR_CONDITION_GAIN,
  type KitUIView,
  type TideweftUICommand,
} from "./types";

const view = (disabledReason = "Need 1 Braided cord"): KitUIView => ({
  revision: 7,
  combinedLoadMilli: 8_350,
  capacityMilli: 16_000,
  transportLoadMilli: 4_000,
  locationLabel: "Hushreed locker in reach",
  hint: "World continues.",
  transportRows: [{
    id: "promise:1",
    kind: "promise-cargo",
    label: "Medicine for Lowglass",
    detail: "Fragile · DELIVER LOWGLASS",
    loadMilli: 4_000,
    condition: 0.82,
  }],
  stackRows: [{
    id: "cordreed:pack",
    tier: "raw",
    label: "Cordreed",
    quantity: 3,
    unitLoadMilli: 600,
    totalLoadMilli: 1_800,
    location: "pack",
    locationLabel: "Carried",
  }],
  gearRows: [{
    id: "gear:reed-mat:1",
    kind: "reed-mat",
    label: "Reed mat R1",
    detail: "Improves soft footing",
    location: "carried",
    locationLabel: "Carried",
    loadMilli: 5_200,
    condition: 0.75,
    conditionLabel: "Worn · 75%",
    repairCostLabel: "1 Braided cord",
    salvageLabel: "1 Cordreed",
    canRepair: true,
    canDismantle: true,
  }],
  recipes: [{
    id: "gear/reed-mat",
    label: "Reed mat",
    resultLabel: "Reed mat",
    resultDetail: "Durable soft-ground adaptation",
    resultLoadMilli: 5_200,
    ingredientCopy: "2 Braided cord + 1 Driftwood + 1 Pitchcloth",
    ingredients: [{
      id: "component/braided-cord",
      label: "Braided cord",
      required: 2,
      available: 1,
      sufficient: false,
    }],
    canCraft: false,
    disabledReason,
  }],
});

describe("KIT dialog presentation contract", () => {
  it("keeps one ordered PACK / MAKE / MEND tablist with stable ARIA targets", () => {
    expect(KIT_TABS.map((tab) => tab.id)).toEqual(["pack", "make", "mend"]);
    expect(KIT_TABS.map((tab) => tab.label)).toEqual(["PACK", "MAKE", "MEND"]);
    expect(KIT_DIALOG_ID).toBe("tideweft-kit");
    expect(KIT_DIALOG_PANEL_ID).toBe("tideweft-kit-panel");
    expect(KIT_DIALOG_SCROLL_REGION_ID).toBe("tideweft-kit-scroll-region");
    expect(KIT_MINIMUM_TARGET_CSS_PIXELS).toBe(44);
  });

  it("moves through tabs with wrapping arrows and Home / End", () => {
    expect(nextKitTab("pack", "ArrowLeft")).toBe("mend");
    expect(nextKitTab("pack", "ArrowRight")).toBe("make");
    expect(nextKitTab("mend", "ArrowRight")).toBe("pack");
    expect(nextKitTab("mend", "Home")).toBe("pack");
    expect(nextKitTab("pack", "End")).toBe("mend");
  });

  it("renders integer milli-loads exactly without floating point shorthand", () => {
    expect(formatKitMilliLoad(0)).toBe("0.000 load");
    expect(formatKitMilliLoad(250)).toBe("0.250 load");
    expect(formatKitMilliLoad(16_000)).toBe("16.000 load");
    expect(formatKitMilliLoad(Number.NaN)).toBe("0.000 load");
  });

  it("refreshes for every visible or actionable blocker without depending on identity", () => {
    expect(kitViewSignature(undefined)).toBe("kit-unavailable");
    expect(kitViewSignature(view())).toBe(kitViewSignature(view()));
    expect(kitViewSignature(view("Pack needs 0.550 more load")))
      .not.toBe(kitViewSignature(view()));
    expect(kitViewSignature({ ...view(), combinedLoadMilli: 8_351 }))
      .not.toBe(kitViewSignature(view()));
  });

  it("pins the public repair command to one quarter-condition step", () => {
    const commands: readonly TideweftUICommand[] = [
      { type: "kit", action: "craft", recipeId: "component/braided-cord" },
      {
        type: "kit",
        action: "repair",
        gearId: "gear:reed-mat:1",
        conditionGain: KIT_REPAIR_CONDITION_GAIN,
      },
      { type: "kit", action: "dismantle", gearId: "gear:reed-mat:1" },
    ];
    expect(KIT_REPAIR_CONDITION_GAIN).toBe(250_000);
    expect(commands.map((command) => command.type === "kit" ? command.action : command.type))
      .toEqual(["craft", "repair", "dismantle"]);
  });
});

import { describe, expect, it } from "vitest";

import {
  EMPTY_KIT_POINTER_SEQUENCE,
  KIT_DIALOG_ID,
  KIT_DIALOG_PANEL_ID,
  KIT_DIALOG_SCROLL_REGION_ID,
  KIT_FALLBACK_CAPACITY_MILLI,
  KIT_MINIMUM_TARGET_CSS_PIXELS,
  KIT_TABS,
  beginKitPointerSequence,
  endKitPointerSequence,
  formatKitMilliLoad,
  kitPointerSequenceAllowsAction,
  kitPointerSequenceAllowsClick,
  kitViewSignature,
  nextKitTab,
  resetKitPointerSequence,
} from "./kitDialog";
import {
  KIT_REPAIR_CONDITION_GAIN,
  type ControlAvailabilityUIView,
  type KitUIView,
  type TideweftUICommand,
} from "./types";

import type { RendererCommand } from "../render/types";

const view = (disabledReason = "Need 1 Braided cord"): KitUIView => ({
  revision: 7,
  combinedLoadMilli: 8_350,
  capacityMilli: 16_000,
  transportLoadMilli: 4_000,
  locationLabel: "Hushreed locker in reach",
  hint: "World continues.",
  transportRows: [{
    id: "promise:1",
    lotId: "lot/promise/1",
    kind: "promise-cargo",
    label: "Medicine for Lowglass",
    detail: "Fragile · DELIVER LOWGLASS",
    loadMilli: 4_000,
    condition: 0.82,
    dropQuantity: 2,
    canDrop: true,
  }],
  stackRows: [{
    id: "cordreed:pack",
    itemId: "cordreed",
    lotId: "lot/find/cordreed/7",
    tier: "raw",
    label: "Cordreed",
    quantity: 3,
    unitLoadMilli: 600,
    totalLoadMilli: 1_800,
    location: "pack",
    locationLabel: "Carried",
    canDrop: true,
  }],
  gearRows: [{
    id: "gear:reed-mat:1",
    lotId: "lot/gear/reed-mat/1",
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
    canDrop: true,
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
    expect(KIT_FALLBACK_CAPACITY_MILLI).toBe(18_000);
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
      { type: "kit", action: "drop", lotId: "lot/find/cordreed/7", quantity: 1 },
    ];
    expect(KIT_REPAIR_CONDITION_GAIN).toBe(250_000);
    expect(commands.map((command) => command.type === "kit" ? command.action : command.type))
      .toEqual(["craft", "repair", "dismantle", "drop"]);
  });

  it("refreshes an exact-lot drop row when its authority or blocker changes", () => {
    const current = view();
    expect(kitViewSignature({
      ...current,
      stackRows: current.stackRows.map((row) => ({ ...row, canDrop: false, dropDisabledReason: "Recover your footing first." })),
    })).not.toBe(kitViewSignature(current));
    expect(kitViewSignature({
      ...current,
      stackRows: current.stackRows.map((row) => ({ ...row, lotId: "lot/find/cordreed/8" })),
    })).not.toBe(kitViewSignature(current));
  });

  it("has no manual pace mutation command or availability surface", () => {
    const noUICommand: Extract<TideweftUICommand, { type: "set-pace" }> extends never
      ? true : false = true;
    const noRendererCommand: Extract<RendererCommand, { type: "pace-step" }> extends never
      ? true : false = true;
    const noAvailabilityFlag: "canChangePace" extends keyof ControlAvailabilityUIView
      ? false : true = true;
    expect([noUICommand, noRendererCommand, noAvailabilityFlag]).toEqual([true, true, true]);
  });

  it("allows one pointer to activate a 44px KIT action", () => {
    let sequence = beginKitPointerSequence(EMPTY_KIT_POINTER_SEQUENCE, 41);
    expect(sequence.activePointerIds).toEqual([41]);
    expect(kitPointerSequenceAllowsAction(sequence)).toBe(true);
    sequence = endKitPointerSequence(sequence, 41);
    expect(sequence.activePointerIds).toEqual([]);
    expect(kitPointerSequenceAllowsAction(sequence)).toBe(true);
    expect(KIT_MINIMUM_TARGET_CSS_PIXELS).toBe(44);
  });

  it("latches suppression after a second pointer until the complete sequence ends", () => {
    let sequence = beginKitPointerSequence(EMPTY_KIT_POINTER_SEQUENCE, 7);
    sequence = beginKitPointerSequence(sequence, 9);
    expect(kitPointerSequenceAllowsAction(sequence)).toBe(false);

    sequence = endKitPointerSequence(sequence, 7);
    expect(sequence.activePointerIds).toEqual([9]);
    expect(kitPointerSequenceAllowsAction(sequence)).toBe(false);

    sequence = endKitPointerSequence(sequence, 9);
    expect(sequence.activePointerIds).toEqual([]);
    expect(kitPointerSequenceAllowsAction(sequence)).toBe(false);
    expect(kitPointerSequenceAllowsClick(sequence, 1)).toBe(false);
    expect(kitPointerSequenceAllowsClick(sequence, 0)).toBe(true);
  });

  it("does not dispatch DROP during multi-touch and resets on cancellation or focus loss", () => {
    let sequence = beginKitPointerSequence(EMPTY_KIT_POINTER_SEQUENCE, 2);
    sequence = beginKitPointerSequence(sequence, 5);
    const commands: TideweftUICommand[] = [];
    if (kitPointerSequenceAllowsAction(sequence)) {
      commands.push({ type: "kit", action: "drop", lotId: "lot/find/cordreed/7", quantity: 1 });
    }
    expect(commands).toEqual([]);

    sequence = resetKitPointerSequence();
    expect(sequence).toBe(EMPTY_KIT_POINTER_SEQUENCE);
    expect(kitPointerSequenceAllowsAction(sequence)).toBe(true);
  });

  it("handles rapid pointer ID reuse without retaining a stale suppression latch", () => {
    let sequence = beginKitPointerSequence(EMPTY_KIT_POINTER_SEQUENCE, 12);
    sequence = endKitPointerSequence(sequence, 12);
    sequence = resetKitPointerSequence();
    sequence = beginKitPointerSequence(sequence, 12);
    expect(sequence.activePointerIds).toEqual([12]);
    expect(kitPointerSequenceAllowsAction(sequence)).toBe(true);
  });
});

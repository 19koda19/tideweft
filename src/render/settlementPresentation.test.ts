import { describe, expect, it } from "vitest";

import { visibleSettlementFoodStore } from "./settlementPresentation";
import type { SettlementView } from "./types";

const settlement = (foodStore: SettlementView["foodStore"]): SettlementView => ({
  id: "settlement:glasswater",
  name: "Glasswater",
  position: { x: -48_000_024, y: 93_000_072 },
  population: 18,
  status: "watchful",
  glyph: "harbor",
  connection: 0.7,
  stress: 0.3,
  discovered: true,
  currentVisibility: 1,
  ...(foodStore ? { foodStore } : {}),
});

describe("settlement food-store presentation", () => {
  it("reveals only the stable identity and observable open-door geometry at direct range", () => {
    const visible = visibleSettlementFoodStore(
      settlement({ id: "store:glasswater:food", closure: "open" }),
      true,
    );

    expect(visible).toEqual({
      id: "store:glasswater:food",
      closure: "open",
      doorAngle: Math.PI * 0.34,
      hasCrossbar: false,
    });
    expect(Object.keys(visible ?? {})).toEqual(["id", "closure", "doorAngle", "hasCrossbar"]);
  });

  it("uses barred geometry for a secured door without exposing stock or causes", () => {
    expect(visibleSettlementFoodStore(
      settlement({ id: "store:glasswater:food", closure: "secured" }),
      true,
    )).toEqual({
      id: "store:glasswater:food",
      closure: "secured",
      doorAngle: 0,
      hasCrossbar: true,
    });
  });

  it("fails closed for remote memory and for settlements without a projected store", () => {
    expect(visibleSettlementFoodStore(
      settlement({ id: "store:glasswater:food", closure: "open" }),
      false,
    )).toBeNull();
    expect(visibleSettlementFoodStore(settlement(undefined), true)).toBeNull();
  });
});

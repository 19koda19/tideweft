import { describe, expect, it } from "vitest";

import {
  ACCESSIBILITY_RULES_POLICY,
  GAMEPLAY_CONTRACT,
  GAMEPLAY_CONTRACT_ID,
  GAMEPLAY_CONTRACT_NAME,
  GAMEPLAY_CONTRACT_VERSION,
} from "./gameplayContract";

describe("the authoritative TIDEWEFT gameplay contract", () => {
  it("exposes exactly one officially named difficulty", () => {
    expect(GAMEPLAY_CONTRACT_ID).toBe("challenging-hard");
    expect(GAMEPLAY_CONTRACT_NAME).toBe("A CHALLENGING HARD");
    expect(GAMEPLAY_CONTRACT.difficultyCount).toBe(1);
    expect(GAMEPLAY_CONTRACT_VERSION).toBe(18);
  });

  it("keeps accessibility out of simulation and reward semantics", () => {
    expect(ACCESSIBILITY_RULES_POLICY).toBe("presentation-input-only");
  });

  it("declares every required player-facing review domain", () => {
    expect(new Set(GAMEPLAY_CONTRACT.reviewSurface)).toEqual(new Set([
      "movement",
      "brace",
      "pace",
      "stamina",
      "capacity",
      "cargo",
      "promises",
      "rewards",
      "items",
      "crafting",
      "health",
      "survival",
      "tides",
      "weather",
      "combat",
      "wildlife",
      "npcs",
      "identity",
      "inspection",
      "knowledge",
      "region-travel",
      "saving",
      "routes",
      "failure",
      "recovery",
      "desktop-controls",
      "mobile-controls",
    ]));
    expect(GAMEPLAY_CONTRACT.minimumTutorialVersion).toBeGreaterThanOrEqual(GAMEPLAY_CONTRACT_VERSION);
  });
});

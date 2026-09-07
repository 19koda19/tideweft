import { describe, expect, it } from "vitest";

import {
  DOMESTIC_GOAT_APPEARANCE_PALETTES,
  domesticGoatAppearancePalette,
} from "./wildlifeAppearance";

describe("shared wildlife appearance projection", () => {
  it("resolves one authenticated goat morph to one immutable renderer-neutral palette", () => {
    const pied = domesticGoatAppearancePalette("pied-coated");

    expect(pied).toBe(DOMESTIC_GOAT_APPEARANCE_PALETTES["pied-coated"]);
    expect(pied).toEqual({
      primary: "#e2d6bc",
      secondary: "#55463b",
      dark: "#211c19",
      accent: "#b99d72",
    });
    expect(Object.isFrozen(pied)).toBe(true);
  });
});

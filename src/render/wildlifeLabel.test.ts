import { describe, expect, it } from "vitest";

import { visibleWildlifeGroupSuffix } from "./wildlifeLabel";

describe("shared wildlife world-label copy", () => {
  it("shows only lawful, finite visible-flock estimates", () => {
    expect(visibleWildlifeGroupSuffix({ species: "gull", groupSize: 5 }))
      .toBe(" · ~5 visible");
    expect(visibleWildlifeGroupSuffix({ species: "fish-crow", groupSize: 3 }))
      .toBe(" · ~3 visible");
    expect(visibleWildlifeGroupSuffix({ species: "deer", groupSize: 5 })).toBe("");
    expect(visibleWildlifeGroupSuffix({ species: "snowy-egret", groupSize: 5 })).toBe("");
    expect(visibleWildlifeGroupSuffix({ species: "gull", groupSize: 1 })).toBe("");
    expect(visibleWildlifeGroupSuffix({ species: "gull", groupSize: 2.5 })).toBe("");
  });
});

import { describe, expect, it } from "vitest";

import { FIELD_RESOURCE_PRESENTATION } from "./resourcePresentation";

describe("field resource presentation", () => {
  it("gives all nine materials a unique non-color silhouette", () => {
    const entries = Object.entries(FIELD_RESOURCE_PRESENTATION);
    expect(entries).toHaveLength(9);
    expect(new Set(entries.map(([, presentation]) => presentation.motif)).size).toBe(9);
    for (const [, presentation] of entries) {
      expect(presentation.label.length).toBeGreaterThan(2);
      expect(presentation.chartColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(presentation.reliefColor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});


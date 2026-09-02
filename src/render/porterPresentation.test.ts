import { describe, expect, it } from "vitest";

import {
  PORTER_APPEARANCE_PALETTE,
  clampPorterSpeechPlacement,
  porterAppearancePresentation,
  porterQuickLabel,
  wrapPorterSpeech,
} from "./porterPresentation";

describe("porter presentation", () => {
  it("uses only observable quick copy for selected and hovered labels", () => {
    const porter = { name: "SECRET DURABLE NAME", quickLabel: "Broad porter · soaked" };
    expect(porterQuickLabel(porter, false)).toBeUndefined();
    expect(porterQuickLabel(porter, true)).toBe("Broad porter · soaked");
    expect(porterQuickLabel({}, true)).toBeUndefined();
    expect(porterQuickLabel(porter, true)).not.toContain(porter.name);
  });

  it("makes height, build, palette, and wetness contractually visible", () => {
    const slight = porterAppearancePresentation({
      appearance: { heightScale: 0.8, build: "slight", palette: "reed", wetness: 0.1 },
    });
    const stocky = porterAppearancePresentation({
      appearance: { heightScale: 1.25, build: "stocky", palette: "ember", wetness: 0.9 },
    });
    expect(stocky.heightScale).toBeGreaterThan(slight.heightScale);
    expect(stocky.widthScale).toBeGreaterThan(slight.widthScale);
    expect(slight.color).toBe(PORTER_APPEARANCE_PALETTE.reed);
    expect(stocky.color).toBe(PORTER_APPEARANCE_PALETTE.ember);
    expect(stocky.wetness).toBeGreaterThan(slight.wetness);
  });

  it("wraps all speech without clipping or ellipsis and clamps every edge", () => {
    const speech = "The eastern shoal is turning quickly, keep to the reedward marker";
    const lines = wrapPorterSpeech(speech, 18);
    expect(lines.join(" ")).toBe(speech);
    expect(lines.every((line) => line.length <= 18)).toBe(true);
    expect(lines.join(" ")).not.toContain("…");

    const box = { width: 144, height: lines.length * 14 + 12 };
    const viewport = { width: 320, height: 240 };
    const topLeft = clampPorterSpeechPlacement({ x: 0, y: 0 }, box, viewport);
    const bottomRight = clampPorterSpeechPlacement({ x: 320, y: 240 }, box, viewport);
    for (const placement of [topLeft, bottomRight]) {
      expect(placement.x).toBeGreaterThanOrEqual(8);
      expect(placement.y).toBeGreaterThanOrEqual(8);
      expect(placement.x + box.width).toBeLessThanOrEqual(viewport.width - 8);
      expect(placement.y + box.height).toBeLessThanOrEqual(viewport.height - 8);
    }
  });
});

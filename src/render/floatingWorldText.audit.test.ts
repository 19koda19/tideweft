import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chartSource = readFileSync(new URL("./p5Sketch.ts", import.meta.url), "utf8");

describe("pane-free Chart world text", () => {
  it("wraps and clamps witnessed event copy instead of drawing a clipping pane", () => {
    const drawEvents = chartSource.slice(
      chartSource.indexOf("const drawEvents"),
      chartSource.indexOf("const drawPointerTarget"),
    );

    expect(drawEvents).toContain("wrapPorterSpeech(event.label, charactersPerLine)");
    expect(drawEvents).toContain("clampPorterSpeechPlacement(");
    expect(drawEvents).toContain("{ width: p.width, height: p.height }");
    expect(drawEvents).toContain("for (let index = 0; index < lines.length; index += 1)");
    expect(drawEvents).not.toContain("p.rect(");
    expect(drawEvents).not.toContain("p.text(event.label");
  });

  it("keeps a standalone emotion mark inside the horizontal and vertical viewport", () => {
    const drawPorters = chartSource.slice(
      chartSource.indexOf("const drawPorters"),
      chartSource.indexOf("const drawDestination"),
    );

    expect(drawPorters).toContain(
      "const emotionX = clamp(screen.x, 8, Math.max(8, p.width - 8))",
    );
    expect(drawPorters).toContain(
      "const emotionY = clamp(screen.y - 20, 10, Math.max(10, p.height - 10))",
    );
    expect(drawPorters).toContain("p.text(porter.emotionMark, emotionX, emotionY)");
    expect(drawPorters).not.toContain("p.text(porter.emotionMark, screen.x, emotionY)");
  });
});

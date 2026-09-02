import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const uiSource = readFileSync(new URL("./createTideweftUI.ts", import.meta.url), "utf8");

describe("observed event-feed public copy", () => {
  it("uses a plain event label and describes the perception boundary", () => {
    const retiredHeading = ["The", "water", "remembers"].join(" ");
    expect(uiSource).not.toContain(retiredHeading);
    expect(uiSource).toContain('"EVENTS"');
    expect(uiSource).toContain('"Events the courier saw, heard, or directly caused"');
    expect(uiSource).toContain('"Nothing seen or heard yet."');
  });
});

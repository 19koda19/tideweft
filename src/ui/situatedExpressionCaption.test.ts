import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { situatedExpressionCaptionCopy } from "./createTideweftUI";
import type { SituatedExpressionCaptionUIView } from "./types";

const uiSource = readFileSync(new URL("./createTideweftUI.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

describe("situated expression caption", () => {
  const caption: SituatedExpressionCaptionUIView = {
    id: "expression:human:7",
    speakerLabel: "Nearby courier",
    text: "Keep off the flooded boards.",
    tone: "alarmed",
    assertive: true,
  };

  it("shares exact speaker and expression wording with the live announcement", () => {
    expect(situatedExpressionCaptionCopy(caption))
      .toBe("Nearby courier: Keep off the flooded boards.");
  });

  it("keeps one pointer-transparent visible caption above the compact controls", () => {
    expect(uiSource).toContain('createElement("p", "situated-expression-caption")');
    expect(uiSource).toContain("expressionCaption.hidden = true");
    expect(uiSource).not.toContain("expression-transcript");
    const captionRule = styles.match(/\.situated-expression-caption \{([\s\S]*?)\n\}/u)?.[1] ?? "";
    expect(captionRule).toContain("pointer-events: none");
    const compactRule = styles.match(
      /@media \(max-width: 58rem\) \{[\s\S]*?#game-ui \.situated-expression-caption \{([\s\S]*?)\n  \}/u,
    )?.[1] ?? "";
    expect(compactRule).toContain(
      "bottom: calc(max(0.35rem, env(safe-area-inset-bottom)) + 6.65rem)",
    );
  });

  it("deduplicates by a caption-only ID and never infers urgency from tone", () => {
    expect(uiSource).toContain('let lastExpressionAnnouncementId = ""');
    expect(uiSource).toContain("caption.id === lastExpressionAnnouncementId");
    expect(uiSource).toContain("announce(copy, caption.assertive === true)");
    expect(uiSource).not.toContain('caption.tone === "alarmed"');
  });

  it("tears down the shared live-region queue with the rest of the UI", () => {
    expect(uiSource).toContain("liveRegionAnnouncements.destroy()");
  });
});

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

  it("renders animal calls as sounds rather than quoted human speech", () => {
    const unknownDog: SituatedExpressionCaptionUIView = {
      id: "expression:dog:warning",
      speakerLabel: "Unknown dog",
      text: "BARK!",
      tone: "alarmed",
      presentationKind: "animal-call",
      animalCallKind: "bark",
      assertive: true,
    };
    const familiarDog: SituatedExpressionCaptionUIView = {
      ...unknownDog,
      speakerLabel: "Familiar dog",
    };

    expect(situatedExpressionCaptionCopy(unknownDog)).toBe("[A dog barks sharply.]");
    expect(situatedExpressionCaptionCopy(familiarDog))
      .toBe("[The familiar dog barks sharply.]");
    expect(situatedExpressionCaptionCopy(unknownDog)).not.toContain(":");
    expect(situatedExpressionCaptionCopy(unknownDog)).not.toContain('"');
  });

  it("describes only the coarse direction justified by unseen hearing", () => {
    const unseen: SituatedExpressionCaptionUIView = {
      id: "expression:dog:hidden-warning",
      speakerLabel: "A dog",
      text: "BARK!",
      tone: "alarmed",
      presentationKind: "animal-call",
      animalCallKind: "bark",
      directionLabel: "east",
      assertive: true,
    };

    expect(situatedExpressionCaptionCopy(unseen)).toBe("[A dog barks somewhere east.]");
    expect(situatedExpressionCaptionCopy({
      ...unseen,
      directionLabel: "direction unclear",
    })).toBe("[A dog barks; direction unclear.]");
    expect(situatedExpressionCaptionCopy({
      ...unseen,
      directionLabel: "all around",
    })).toBe("[A dog barks; the sound seems all around.]");
  });

  it("describes growls from explicit semantics without translating a hidden cause", () => {
    const visible: SituatedExpressionCaptionUIView = {
      id: "expression:dog:defensive-growl",
      speakerLabel: "Familiar dog",
      text: "GRRRR.",
      tone: "restrained",
      presentationKind: "animal-call",
      animalCallKind: "growl",
      assertive: false,
    };
    expect(situatedExpressionCaptionCopy(visible))
      .toBe("[The familiar dog growls softly.]");

    const unseen: SituatedExpressionCaptionUIView = {
      ...visible,
      speakerLabel: "A dog",
      directionLabel: "north-west",
    };
    expect(situatedExpressionCaptionCopy(unseen))
      .toBe("[A dog growls somewhere north-west.]");
    expect(situatedExpressionCaptionCopy(unseen)).not.toContain("threat");
    expect(situatedExpressionCaptionCopy(unseen)).not.toContain("retreat");
  });

  it("does not infer an animal call kind from authored prose", () => {
    const unclassified: SituatedExpressionCaptionUIView = {
      id: "expression:animal:unclassified",
      speakerLabel: "A dog",
      text: "GRRRR.",
      tone: "restrained",
      presentationKind: "animal-call",
      assertive: false,
    };
    expect(situatedExpressionCaptionCopy(unclassified)).toBe("[A dog calls.]");
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

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ACOUSTIC_CAPTION_ANNOUNCEMENT_HISTORY_LIMIT,
  createAcousticCaptionAnnouncementLedger,
  shouldResetAcousticCaptionAnnouncementLedger,
  situatedExpressionCaptionCopy,
  situatedExpressionCaptionVisibleText,
} from "./situatedExpressionCaption";
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

  it("does not replay a still-active caption after a temporary higher-priority cue", () => {
    const ledger = createAcousticCaptionAnnouncementLedger();
    expect(ledger.admit("warning:w")).toBe(true);
    expect(ledger.admit("physical:p")).toBe(true);
    expect(ledger.admit("warning:w")).toBe(false);
  });

  it("bounds announcement memory while admitting genuinely later event identities", () => {
    const ledger = createAcousticCaptionAnnouncementLedger();
    for (let index = 0; index <= ACOUSTIC_CAPTION_ANNOUNCEMENT_HISTORY_LIMIT; index += 1) {
      expect(ledger.admit(`caption:${index}`)).toBe(true);
    }
    expect(ledger.admit("caption:0")).toBe(true);
    expect(ledger.admit(`caption:${ACOUSTIC_CAPTION_ANNOUNCEMENT_HISTORY_LIMIT}`)).toBe(false);
  });

  it("admits a reused deterministic event ID after an accepted world replacement", () => {
    const ledger = createAcousticCaptionAnnouncementLedger();
    expect(ledger.admit("acoustic:traversal:reused-id")).toBe(true);
    expect(ledger.admit("acoustic:traversal:reused-id")).toBe(false);
    ledger.reset();
    expect(ledger.admit("acoustic:traversal:reused-id")).toBe(true);
  });

  it("requires both a replacement request and authoritative title closure before reset", () => {
    expect(shouldResetAcousticCaptionAnnouncementLedger(false, false)).toBe(false);
    expect(shouldResetAcousticCaptionAnnouncementLedger(true, true)).toBe(false);
    expect(shouldResetAcousticCaptionAnnouncementLedger(true, false)).toBe(true);
  });

  it("shares exact speaker and expression wording with the live announcement", () => {
    expect(situatedExpressionCaptionCopy(caption))
      .toBe("Nearby courier: Keep off the flooded boards.");
    expect(situatedExpressionCaptionVisibleText(caption))
      .toBe("Keep off the flooded boards.");
  });

  it("keeps a heard-unseen human warning generic while exposing only coarse direction", () => {
    const warning: SituatedExpressionCaptionUIView = {
      id: "expression:human:hidden-warning",
      speakerLabel: "Someone",
      text: "Watch out!",
      tone: "alarmed",
      presentationKind: "speech",
      directionLabel: "east",
      assertive: true,
    };

    expect(situatedExpressionCaptionCopy(warning))
      .toBe("Someone, somewhere east: Watch out!");
    expect(situatedExpressionCaptionVisibleText(warning))
      .toBe("Watch out! · east");
    expect(situatedExpressionCaptionCopy({
      ...warning,
      directionLabel: "direction unclear",
    })).toBe("Someone, direction unclear: Watch out!");
    expect(situatedExpressionCaptionCopy({
      ...warning,
      directionLabel: "all around",
    })).toBe("Someone, the voice seeming all around: Watch out!");
    expect(JSON.stringify(warning)).not.toContain("Mara");
    expect(JSON.stringify(warning)).not.toContain("sourceActorId");
    expect(JSON.stringify(warning)).not.toContain("position");
  });

  it("presents physical acoustics as restrained semantics without inventing a speaker", () => {
    const physical: SituatedExpressionCaptionUIView = {
      id: "acoustic:traversal:scrape",
      speakerLabel: "Sound",
      text: "scrape",
      tone: "restrained",
      presentationKind: "physical",
      physicalSoundKind: "scrape",
      assertive: false,
    };

    expect(situatedExpressionCaptionCopy(physical)).toBe("[scrape]");
    expect(situatedExpressionCaptionVisibleText(physical)).toBe("[scrape]");
    expect(situatedExpressionCaptionCopy({
      ...physical,
      directionLabel: "east",
    })).toBe("[scrape somewhere east.]");
    expect(situatedExpressionCaptionVisibleText({
      ...physical,
      directionLabel: "east",
    })).toBe("[scrape · east]");
    const { physicalSoundKind: _omitted, ...unclassifiedPhysical } = physical;
    expect(situatedExpressionCaptionCopy(unclassifiedPhysical)).toBe("[sound]");
    expect(situatedExpressionCaptionCopy(physical)).not.toContain("Sound");
    expect(situatedExpressionCaptionCopy(physical)).not.toContain(":");
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

  it("describes a shelter whine without translating its hidden weather cause", () => {
    const visible: SituatedExpressionCaptionUIView = {
      id: "expression:dog:shelter-whine",
      speakerLabel: "Familiar dog",
      text: "WHINE...",
      tone: "restrained",
      presentationKind: "animal-call",
      animalCallKind: "whine",
      assertive: false,
    };
    expect(situatedExpressionCaptionCopy(visible))
      .toBe("[The familiar dog whines softly.]");

    const unseen: SituatedExpressionCaptionUIView = {
      ...visible,
      speakerLabel: "A dog",
      directionLabel: "south-east",
    };
    expect(situatedExpressionCaptionCopy(unseen))
      .toBe("[A dog whines somewhere south-east.]");
    expect(situatedExpressionCaptionCopy(unseen)).not.toContain("weather");
    expect(situatedExpressionCaptionCopy(unseen)).not.toContain("shelter");
    expect(situatedExpressionCaptionCopy(unseen)).not.toContain("storm");
  });

  it("presents a fish-crow call as sound and keeps unseen hearing anonymous", () => {
    const visible: SituatedExpressionCaptionUIView = {
      id: "expression:fish-crow:alarm",
      speakerLabel: "Fish crow",
      text: "KRAA! KRAA!",
      tone: "alarmed",
      presentationKind: "animal-call",
      animalCallKind: "fish-crow-call",
      assertive: true,
    };
    expect(situatedExpressionCaptionCopy(visible))
      .toBe("[A fish crow calls sharply.]");

    const unseen: SituatedExpressionCaptionUIView = {
      ...visible,
      id: "expression:bird:hidden-call",
      speakerLabel: "A bird",
      text: "CALL! CALL!",
      animalCallKind: "bird-call",
      directionLabel: "north-east",
    };
    expect(situatedExpressionCaptionCopy(unseen))
      .toBe("[A bird calls somewhere north-east.]");
    expect(situatedExpressionCaptionCopy(unseen)).not.toContain("alarm");
    expect(situatedExpressionCaptionCopy(unseen)).not.toContain("crow");
    expect(JSON.stringify(unseen)).not.toContain("fish-crow");
    expect(JSON.stringify(unseen)).not.toContain("KRAA");
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
    expect(uiSource).toContain("situatedExpressionCaptionVisibleText(caption)");
    expect(uiSource).toContain('caption.presentationKind !== "physical"');
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

  it("deduplicates through the bounded caption-ID ledger and never infers urgency from tone", () => {
    expect(uiSource).toContain("createAcousticCaptionAnnouncementLedger()");
    expect(uiSource).toContain("expressionAnnouncementLedger.admit(caption.id)");
    expect(uiSource).toContain("expressionAnnouncementLedger.reset()");
    expect(uiSource).toContain("acousticCaptionWorldReplacementDispatched");
    expect(uiSource).toContain("announce(copy, caption.assertive === true)");
    expect(uiSource).not.toContain('caption.tone === "alarmed"');
  });

  it("tears down the shared live-region queue with the rest of the UI", () => {
    expect(uiSource).toContain("liveRegionAnnouncements.destroy()");
  });
});

import type { SituatedExpressionCaptionUIView } from "./types";

type Caption = NonNullable<SituatedExpressionCaptionUIView>;

/** Keeps short-lived priority preemption from replaying an older live caption. */
export const ACOUSTIC_CAPTION_ANNOUNCEMENT_HISTORY_LIMIT = 32;

export interface AcousticCaptionAnnouncementLedger {
  /** Returns true exactly once while an ID remains in the bounded history. */
  admit(id: string): boolean;
  /** Starts a new authoritative world/session announcement namespace. */
  reset(): void;
}

export function createAcousticCaptionAnnouncementLedger(): AcousticCaptionAnnouncementLedger {
  const order: string[] = [];
  const seen = new Set<string>();
  return Object.freeze({
    admit(id: string): boolean {
      if (seen.has(id)) return false;
      seen.add(id);
      order.push(id);
      while (order.length > ACOUSTIC_CAPTION_ANNOUNCEMENT_HISTORY_LIMIT) {
        const expired = order.shift();
        if (expired !== undefined) seen.delete(expired);
      }
      return true;
    },
    reset(): void {
      order.length = 0;
      seen.clear();
    },
  });
}

/** Resets only after a requested replacement is confirmed by the field view. */
export function shouldResetAcousticCaptionAnnouncementLedger(
  replacementDispatched: boolean,
  titleVisible: boolean,
): boolean {
  return replacementDispatched && !titleVisible;
}

/** Shared visible wording for the bounded expression-caption surface. */
export function situatedExpressionCaptionVisibleText(caption: Caption): string {
  if (
    caption.presentationKind === "physical"
    || caption.presentationKind === "embodied-signal"
  ) {
    const sound = caption.presentationKind === "embodied-signal"
      ? caption.text
      : caption.physicalSoundKind === undefined ? "sound" : caption.text;
    return caption.directionLabel === undefined
      ? `[${sound}]`
      : `[${sound} · ${caption.directionLabel}]`;
  }
  return caption.directionLabel === undefined
    ? caption.text
    : `${caption.text} · ${caption.directionLabel}`;
}

/** Shared visible and live-region wording for one situated expression. */
export function situatedExpressionCaptionCopy(caption: Caption): string {
  if (
    caption.presentationKind === "physical"
    || caption.presentationKind === "embodied-signal"
  ) {
    const sound = caption.presentationKind === "embodied-signal"
      ? caption.text
      : caption.physicalSoundKind === undefined ? "sound" : caption.text;
    if (caption.directionLabel === undefined) return `[${sound}]`;
    if (caption.directionLabel === "all around") return `[${sound}; all around.]`;
    if (caption.directionLabel === "direction unclear") return `[${sound}; direction unclear.]`;
    return `[${sound} somewhere ${caption.directionLabel}.]`;
  }
  if (caption.presentationKind === "animal-call") {
    if (caption.animalCallKind === "chorus") {
      if (caption.directionLabel === undefined) return "[A chorus sounds.]";
      if (caption.directionLabel === "all around") {
        return "[A chorus sounds; the sound seems all around.]";
      }
      if (caption.directionLabel === "direction unclear") {
        return "[A chorus sounds; direction unclear.]";
      }
      return `[A chorus sounds somewhere ${caption.directionLabel}.]`;
    }
    const subject = caption.animalCallKind === "fish-crow-call"
      ? "A fish crow"
      : caption.animalCallKind === "gull-call"
        ? "A gull"
      : caption.animalCallKind === "bird-call"
        ? "A bird"
        : caption.animalCallKind === "deer-call"
          ? "A deer"
          : caption.animalCallKind === "elk-call"
            ? "An elk"
          : caption.animalCallKind === "boar-call"
            ? "A wild boar"
          : caption.animalCallKind === "chicken-call"
            ? "A chicken"
          : caption.animalCallKind === "marsh-fox-call"
            ? "A marsh fox"
          : caption.animalCallKind === "cat-call"
            ? caption.directionLabel === undefined ? "A cat" : "An animal"
          : caption.animalCallKind === "animal-call"
            ? "An animal"
            : caption.speakerLabel === "Familiar dog"
              ? "The familiar dog"
              : "A dog";
    const call = caption.animalCallKind === "whine"
      ? { visible: "whines softly", directional: "whines" }
      : caption.animalCallKind === "growl"
      ? { visible: "growls softly", directional: "growls" }
      : caption.animalCallKind === "bark"
        ? { visible: "barks sharply", directional: "barks" }
        : caption.animalCallKind === "fish-crow-call"
          ? { visible: "calls sharply", directional: "calls" }
          : caption.animalCallKind === "gull-call"
            ? { visible: "cries sharply", directional: "cries" }
          : caption.animalCallKind === "cat-call"
            ? { visible: "calls plaintively", directional: "calls" }
          : caption.animalCallKind === "deer-call"
            ? { visible: "snorts sharply", directional: "snorts" }
          : caption.animalCallKind === "elk-call"
            ? { visible: "barks sharply", directional: "barks" }
          : caption.animalCallKind === "boar-call"
            ? { visible: "grunts sharply", directional: "grunts" }
          : caption.animalCallKind === "chicken-call"
            ? { visible: "squawks", directional: "calls" }
          : caption.animalCallKind === "marsh-fox-call"
            ? { visible: "yips sharply", directional: "yips" }
          : caption.animalCallKind === "animal-call"
            ? { visible: "calls", directional: "calls" }
            : { visible: "calls", directional: "calls" };
    if (caption.directionLabel === undefined) return `[${subject} ${call.visible}.]`;
    if (caption.directionLabel === "all around") {
      return `[${subject} ${call.directional}; the sound seems all around.]`;
    }
    if (caption.directionLabel === "direction unclear") {
      return `[${subject} ${call.directional}; direction unclear.]`;
    }
    return `[${subject} ${call.directional} somewhere ${caption.directionLabel}.]`;
  }

  if (caption.directionLabel === undefined) {
    return `${caption.speakerLabel}: ${caption.text}`;
  }
  if (caption.directionLabel === "all around") {
    return `${caption.speakerLabel}, the voice seeming all around: ${caption.text}`;
  }
  if (caption.directionLabel === "direction unclear") {
    return `${caption.speakerLabel}, direction unclear: ${caption.text}`;
  }
  return `${caption.speakerLabel}, somewhere ${caption.directionLabel}: ${caption.text}`;
}

import type { SituatedExpressionCaptionUIView } from "./types";

type Caption = NonNullable<SituatedExpressionCaptionUIView>;

export const ACOUSTIC_CAPTION_CHARACTERS_PER_SECOND = 21;
export const ACOUSTIC_CAPTION_MINIMUM_READING_MS = 1_000;

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

/** Reading time for the actual visible copy, not the expanded ARIA description. */
export function situatedExpressionCaptionReadingTimeMs(caption: Caption): number {
  const showSpeaker = caption.presentationKind !== "animal-call"
    && caption.presentationKind !== "embodied-signal"
    && caption.presentationKind !== "indistinct-voice"
    && caption.presentationKind !== "physical";
  const visible = `${showSpeaker ? `${caption.speakerLabel}: ` : ""}${situatedExpressionCaptionVisibleText(caption)}`;
  // Count Unicode code points rather than UTF-16 surrogate halves. Combining
  // marks count separately, conservatively allowing a little more reading time.
  return Math.max(
    ACOUSTIC_CAPTION_MINIMUM_READING_MS,
    Math.ceil(Array.from(visible).length * 1_000 / ACOUSTIC_CAPTION_CHARACTERS_PER_SECOND),
  );
}

export interface AcousticCaptionReadingLease {
  /** UI wall-clock only: never extends sound, hearing, or world-source labels. */
  update(caption: Caption | undefined, nowMs: number): Caption | undefined;
  /** Hide immediately without replaying this world's previously displayed IDs. */
  clear(): void;
  /** Only a confirmed world replacement starts a new presentation namespace. */
  reset(): void;
}

/** One reading slot, no subtitle backlog, and bounded replay suppression. */
export function createAcousticCaptionReadingLease(): AcousticCaptionReadingLease {
  const displayed = createAcousticCaptionAnnouncementLedger();
  let active: { readonly caption: Caption; readonly expiresAt: number } | undefined;
  return Object.freeze({
    update(caption: Caption | undefined, nowMs: number): Caption | undefined {
      if (!Number.isFinite(nowMs)) {
        active = undefined;
        return undefined;
      }
      if (active !== undefined && nowMs >= active.expiresAt) active = undefined;
      if (caption === undefined || caption.id === active?.caption.id) return active?.caption;
      // Ordinary updates cannot cut a line's reading time short. An explicitly
      // urgent cue can interrupt, but a lower-priority warning cannot displace
      // an urgent higher-priority line. Tone and wording never infer urgency.
      if (active !== undefined && (
        caption.assertive !== true
        || (active.caption.assertive === true
          && (caption.priority ?? 0) < (active.caption.priority ?? 0))
      )) return active.caption;
      if (!displayed.admit(caption.id)) return active?.caption;
      active = {
        caption: Object.freeze({ ...caption }),
        expiresAt: nowMs + situatedExpressionCaptionReadingTimeMs(caption),
      };
      return active.caption;
    },
    clear(): void {
      active = undefined;
    },
    reset(): void {
      active = undefined;
      displayed.reset();
    },
  });
}

/** Shared visible wording for the bounded expression-caption surface. */
export function situatedExpressionCaptionVisibleText(caption: Caption): string {
  if (caption.presentationKind === "animal-call" && caption.recognizedAnimalCall !== undefined) {
    const text = `${caption.recognizedAnimalCall.toLowerCase()} call`;
    return caption.directionLabel === undefined ? text : `${text} · ${caption.directionLabel}`;
  }
  if (
    caption.presentationKind === "physical"
    || caption.presentationKind === "embodied-signal"
    || caption.presentationKind === "indistinct-voice"
  ) {
    const sound = caption.presentationKind === "indistinct-voice"
      ? "indistinct voice"
      : caption.presentationKind === "embodied-signal"
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
    || caption.presentationKind === "indistinct-voice"
  ) {
    const sound = caption.presentationKind === "indistinct-voice"
      ? "indistinct voice"
      : caption.presentationKind === "embodied-signal"
        ? caption.text
        : caption.physicalSoundKind === undefined ? "sound" : caption.text;
    if (caption.directionLabel === undefined) return `[${sound}]`;
    if (caption.directionLabel === "all around") return `[${sound}; all around.]`;
    if (caption.directionLabel === "direction unclear") return `[${sound}; direction unclear.]`;
    return `[${sound} somewhere ${caption.directionLabel}.]`;
  }
  if (caption.presentationKind === "animal-call") {
    if (caption.recognizedAnimalCall !== undefined) {
      return situatedExpressionCaptionVisibleText(caption);
    }
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
          : caption.animalCallKind === "duck-call"
            ? "A duck"
          : caption.animalCallKind === "goat-call"
            ? "A goat"
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
          : caption.animalCallKind === "duck-call"
            ? { visible: "quacks", directional: "calls" }
          : caption.animalCallKind === "goat-call"
            ? { visible: "bleats", directional: "calls" }
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

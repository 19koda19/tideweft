import type { PorterView, WorldPoint } from "./types";

export const PORTER_APPEARANCE_PALETTE = {
  silt: "#b69a78",
  reed: "#91a96d",
  tide: "#69c9d5",
  ember: "#e58b62",
  lichen: "#9dbf8b",
  storm: "#8f9bb8",
} as const satisfies Record<NonNullable<PorterView["appearance"]>["palette"], string>;

const BUILD_WIDTH = {
  slight: 0.78,
  lean: 0.88,
  average: 1,
  broad: 1.16,
  stocky: 1.28,
} as const satisfies Record<NonNullable<PorterView["appearance"]>["build"], number>;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

export interface PorterAppearancePresentation {
  readonly heightScale: number;
  readonly widthScale: number;
  readonly color: string;
  readonly wetness: number;
}

/** Stable rendering defaults keep older projections compatible without inventing identity. */
export function porterAppearancePresentation(
  porter: Pick<PorterView, "appearance">,
): PorterAppearancePresentation {
  const appearance = porter.appearance;
  return {
    heightScale: clamp(appearance?.heightScale ?? 1, 0.72, 1.35),
    widthScale: appearance ? BUILD_WIDTH[appearance.build] : 1,
    color: appearance ? PORTER_APPEARANCE_PALETTE[appearance.palette] : "#edf8ed",
    wetness: clamp(appearance?.wetness ?? 0, 0, 1),
  };
}

/** A map hover may reveal only projected, observable copy—never a durable name. */
export function porterQuickLabel(
  porter: Pick<PorterView, "quickLabel">,
  highlighted: boolean,
): string | undefined {
  if (!highlighted) return undefined;
  const label = porter.quickLabel?.trim();
  return label ? label : undefined;
}

const splitLongWord = (word: string, maximum: number): string[] => {
  const chunks: string[] = [];
  for (let offset = 0; offset < word.length; offset += maximum) {
    chunks.push(word.slice(offset, offset + maximum));
  }
  return chunks;
};

/** Wraps every syllable of witnessed speech; it deliberately never ellipsizes. */
export function wrapPorterSpeech(text: string, maximumCharacters = 28): readonly string[] {
  const maximum = Math.max(8, Math.floor(maximumCharacters));
  const words = text.trim().split(/\s+/u).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  const flush = (): void => {
    if (line) lines.push(line);
    line = "";
  };
  for (const word of words) {
    for (const part of word.length > maximum ? splitLongWord(word, maximum) : [word]) {
      if (!line) {
        line = part;
      } else if (`${line} ${part}`.length <= maximum) {
        line += ` ${part}`;
      } else {
        flush();
        line = part;
      }
    }
  }
  flush();
  return lines;
}

export interface PorterSpeechPlacement {
  readonly x: number;
  readonly y: number;
}

/** Returns the callout's top-left corner wholly inside the live canvas. */
export function clampPorterSpeechPlacement(
  anchor: WorldPoint,
  box: { readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number },
  gap = 16,
  margin = 8,
): PorterSpeechPlacement {
  const usableWidth = Math.max(0, viewport.width - margin * 2);
  const usableHeight = Math.max(0, viewport.height - margin * 2);
  const width = Math.min(Math.max(0, box.width), usableWidth);
  const height = Math.min(Math.max(0, box.height), usableHeight);
  const x = clamp(anchor.x - width / 2, margin, Math.max(margin, viewport.width - margin - width));
  const preferredAbove = anchor.y - gap - height;
  const preferredBelow = anchor.y + gap;
  const y = preferredAbove >= margin
    ? preferredAbove
    : clamp(preferredBelow, margin, Math.max(margin, viewport.height - margin - height));
  return { x, y };
}

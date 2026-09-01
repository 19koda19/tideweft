export type ReliefDepthBand = "shoal" | "mid" | "deep";

export interface ReliefSoundingStyle {
  /** A compact 1–9 reading shared with the Chart 2D sounding marks. */
  readonly depthRank: number;
  readonly band: ReliefDepthBand;
  /** Marker height as a multiple of one terrain tile. */
  readonly needleScale: number;
  /** Crossbars make the depth ordering legible without relying on color. */
  readonly rungCount: number;
}

/**
 * Converts normalized live depth into a redundant Relief 3D visual code.
 * Height and rung count are monotone, so the reading survives color-vision
 * differences and the oblique camera angle.
 */
export function reliefSoundingStyle(depth: number): ReliefSoundingStyle {
  const normalized = Math.max(0, Math.min(1, Number.isFinite(depth) ? depth : 0));
  return {
    depthRank: Math.max(1, Math.min(9, Math.round(normalized * 9))),
    band: normalized < 0.28 ? "shoal" : normalized < 0.62 ? "mid" : "deep",
    needleScale: 0.14 + normalized * 0.34,
    rungCount: 1 + Math.floor(normalized * 3),
  };
}

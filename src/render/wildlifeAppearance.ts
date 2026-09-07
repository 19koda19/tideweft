export interface WildlifeAppearancePalette {
  readonly primary: string;
  readonly secondary: string;
  readonly dark: string;
  readonly accent: string;
}

const palette = (
  primary: string,
  secondary: string,
  dark: string,
  accent: string,
): WildlifeAppearancePalette => Object.freeze({ primary, secondary, dark, accent });

/**
 * One renderer-neutral mapping from authenticated goat morphology to visible
 * color. Chart and Relief consume this same record so a persistent individual
 * cannot change coat merely because the player changes view.
 */
export const DOMESTIC_GOAT_APPEARANCE_PALETTES = Object.freeze({
  "black-coated": palette("#3b3935", "#82786a", "#161514", "#c4b28f"),
  "brown-coated": palette("#8f7150", "#d8c9aa", "#30271f", "#b99d72"),
  "cream-coated": palette("#d8c9aa", "#f0e4c8", "#66533e", "#b99d72"),
  "pied-coated": palette("#e2d6bc", "#55463b", "#211c19", "#b99d72"),
} as const);

/** Fails safely to the established brown coat for legacy or malformed views. */
export function domesticGoatAppearancePalette(
  appearanceKey: string,
): WildlifeAppearancePalette {
  if (Object.prototype.hasOwnProperty.call(DOMESTIC_GOAT_APPEARANCE_PALETTES, appearanceKey)) {
    return DOMESTIC_GOAT_APPEARANCE_PALETTES[
      appearanceKey as keyof typeof DOMESTIC_GOAT_APPEARANCE_PALETTES
    ];
  }
  return DOMESTIC_GOAT_APPEARANCE_PALETTES["brown-coated"];
}

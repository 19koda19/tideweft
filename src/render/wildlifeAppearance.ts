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

export const ALPHA30_WILDLIFE_APPEARANCE_SPECIES = [
  "wild-boar",
  "elk",
  "gray-wolf",
] as const;

export type Alpha30WildlifeAppearanceSpecies =
  (typeof ALPHA30_WILDLIFE_APPEARANCE_SPECIES)[number];

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

const ALPHA30_WILDLIFE_APPEARANCE_FALLBACK = Object.freeze({
  "wild-boar": "dark-brown",
  elk: "golden-brown",
  "gray-wolf": "grizzled-gray",
} as const satisfies Readonly<Record<Alpha30WildlifeAppearanceSpecies, string>>);

/** One authenticated coat source shared by Chart and Relief for Alpha 30. */
export const ALPHA30_WILDLIFE_APPEARANCE_PALETTES = Object.freeze({
  "wild-boar": Object.freeze({
    "bristled-black": palette("#30312d", "#665e50", "#121412", "#c7ae86"),
    "dark-brown": palette("#614735", "#927257", "#251c17", "#c7ae86"),
    grizzled: palette("#6d6960", "#aaa08d", "#282825", "#cfb992"),
    "rufous-brown": palette("#7e4b31", "#b37954", "#2d2019", "#d0ad82"),
  }),
  elk: Object.freeze({
    "dark-maned": palette("#78563d", "#bd9567", "#29231f", "#ddd0b1"),
    "golden-brown": palette("#9b6f43", "#caa477", "#33271d", "#e1d1b0"),
    "pale-rumped": palette("#8c6b4c", "#d3bd98", "#30261f", "#eadcbc"),
    "winter-gray": palette("#74736d", "#aaa496", "#292a29", "#ddd8c8"),
  }),
  "gray-wolf": Object.freeze({
    "charcoal-gray": palette("#4d5352", "#808680", "#1d2221", "#c5c7bd"),
    "grizzled-gray": palette("#727875", "#a9aaa1", "#292e2d", "#ded8c8"),
    "pale-gray": palette("#a5aaa4", "#d6d6ca", "#424847", "#eee9dc"),
    "tawny-gray": palette("#7c6b5a", "#b09a7e", "#302925", "#ded0b8"),
  }),
} as const);

/** Resolves an authenticated Alpha 30 morph, with a species-safe legacy fallback. */
export function alpha30WildlifeAppearancePalette(
  species: Alpha30WildlifeAppearanceSpecies,
  appearanceKey: string,
): WildlifeAppearancePalette {
  const palettes = ALPHA30_WILDLIFE_APPEARANCE_PALETTES[species] as Readonly<
    Record<string, WildlifeAppearancePalette>
  >;
  if (Object.prototype.hasOwnProperty.call(palettes, appearanceKey)) {
    return palettes[appearanceKey] as WildlifeAppearancePalette;
  }
  return palettes[ALPHA30_WILDLIFE_APPEARANCE_FALLBACK[species]] as WildlifeAppearancePalette;
}

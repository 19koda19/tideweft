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

/**
 * Shared regional-upland palette roster. The Alpha 30 export above remains a
 * frozen release prefix; later species append here without rewriting it.
 */
export const REGIONAL_UPLAND_WILDLIFE_APPEARANCE_SPECIES = [
  ...ALPHA30_WILDLIFE_APPEARANCE_SPECIES,
  "cougar",
  "brown-bear",
] as const;

export type RegionalUplandWildlifeAppearanceSpecies =
  (typeof REGIONAL_UPLAND_WILDLIFE_APPEARANCE_SPECIES)[number];

/** Addressable alpine actors; pika remains population evidence, never a palette-backed body. */
export const ALPINE_WILDLIFE_APPEARANCE_SPECIES = Object.freeze([
  "mountain-goat",
  "golden-eagle",
] as const);

export type AlpineWildlifeAppearanceSpecies =
  (typeof ALPINE_WILDLIFE_APPEARANCE_SPECIES)[number];

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

const ALPHA31_PREDATOR_APPEARANCE_FALLBACK = Object.freeze({
  cougar: "warm-tawny",
  "brown-bear": "dark-brown",
} as const);

export const ALPHA31_PREDATOR_APPEARANCE_PALETTES = Object.freeze({
  cougar: Object.freeze({
    "gray-tawny": palette("#8d8372", "#c5b69b", "#3f3b35", "#e4d4b7"),
    "pale-tawny": palette("#b89d76", "#dec9a4", "#4d4338", "#efe0c3"),
    "reddish-tawny": palette("#a66e4a", "#d6a878", "#462e25", "#ead0aa"),
    "warm-tawny": palette("#aa8258", "#d2b184", "#44382d", "#ead7b5"),
  }),
  "brown-bear": Object.freeze({
    "dark-brown": palette("#4c372b", "#7d6651", "#211914", "#b89e78"),
    "golden-brown": palette("#806141", "#ad8d62", "#34271e", "#d0b78e"),
    "grizzled-brown": palette("#665d50", "#9f927d", "#2c2924", "#cbb995"),
    "reddish-brown": palette("#70452f", "#a66d4d", "#2d211b", "#c9a47d"),
  }),
} as const);

/** One species-safe palette owner for every animal in the remote upland source. */
export function regionalUplandWildlifeAppearancePalette(
  species: RegionalUplandWildlifeAppearanceSpecies,
  appearanceKey: string,
): WildlifeAppearancePalette {
  if ((ALPHA30_WILDLIFE_APPEARANCE_SPECIES as readonly string[]).includes(species)) {
    return alpha30WildlifeAppearancePalette(
      species as Alpha30WildlifeAppearanceSpecies,
      appearanceKey,
    );
  }
  const predatorSpecies = species as keyof typeof ALPHA31_PREDATOR_APPEARANCE_PALETTES;
  const palettes = ALPHA31_PREDATOR_APPEARANCE_PALETTES[predatorSpecies] as Readonly<
    Record<string, WildlifeAppearancePalette>
  >;
  if (Object.prototype.hasOwnProperty.call(palettes, appearanceKey)) {
    return palettes[appearanceKey] as WildlifeAppearancePalette;
  }
  return palettes[
    ALPHA31_PREDATOR_APPEARANCE_FALLBACK[predatorSpecies]
  ] as WildlifeAppearancePalette;
}

const ALPINE_WILDLIFE_APPEARANCE_FALLBACK = Object.freeze({
  "mountain-goat": "cream-white",
  "golden-eagle": "golden-naped",
} as const satisfies Readonly<Record<AlpineWildlifeAppearanceSpecies, string>>);

/** Shared Chart/Relief colors for the two individually addressable Wave-F forms. */
export const ALPINE_WILDLIFE_APPEARANCE_PALETTES = Object.freeze({
  "mountain-goat": Object.freeze({
    "bright-white": palette("#e8e5d8", "#fffbed", "#393b38", "#b5ab91"),
    "cream-white": palette("#d8d1bd", "#f1ead5", "#403d36", "#ad9f82"),
    "gray-white": palette("#bfc2bc", "#e6e5dc", "#3b403f", "#a59e8c"),
    "winter-white": palette("#f0f0e8", "#fffdf3", "#424643", "#bcb7a5"),
  }),
  "golden-eagle": Object.freeze({
    "dark-gold": palette("#493826", "#947044", "#1d1813", "#c79a55"),
    "golden-naped": palette("#4c3928", "#b4864b", "#1c1713", "#d4ad68"),
    "mottled-brown": palette("#604936", "#967657", "#241c17", "#c29a63"),
    "pale-gold": palette("#796044", "#c09b67", "#2b221a", "#dec087"),
  }),
} as const);

/** Species-safe alpine morph lookup; malformed legacy keys never cross species. */
export function alpineWildlifeAppearancePalette(
  species: AlpineWildlifeAppearanceSpecies,
  appearanceKey: string,
): WildlifeAppearancePalette {
  const palettes = ALPINE_WILDLIFE_APPEARANCE_PALETTES[species] as Readonly<
    Record<string, WildlifeAppearancePalette>
  >;
  if (Object.prototype.hasOwnProperty.call(palettes, appearanceKey)) {
    return palettes[appearanceKey] as WildlifeAppearancePalette;
  }
  return palettes[
    ALPINE_WILDLIFE_APPEARANCE_FALLBACK[species]
  ] as WildlifeAppearancePalette;
}

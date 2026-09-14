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

/** Addressable cold-shore bodies; capelin remains anonymous population evidence. */
export const COLD_SHORE_WILDLIFE_APPEARANCE_SPECIES = Object.freeze([
  "arctic-fox",
] as const);

export type ColdShoreWildlifeAppearanceSpecies =
  (typeof COLD_SHORE_WILDLIFE_APPEARANCE_SPECIES)[number];

/** Addressable polar-shore bodies; capelin remains anonymous population evidence. */
export const POLAR_MARINE_WILDLIFE_APPEARANCE_SPECIES = Object.freeze([
  "harbor-seal",
  "polar-bear",
] as const);

export type PolarMarineWildlifeAppearanceSpecies =
  (typeof POLAR_MARINE_WILDLIFE_APPEARANCE_SPECIES)[number];

/**
 * Individually addressable estuary-surface actors. The two anonymous
 * population-area species in the same release cluster deliberately have no
 * body palette: renderers receive only their directly observed evidence.
 */
export const ESTUARY_SURFACE_WILDLIFE_APPEARANCE_SPECIES = Object.freeze([
  "great-blue-heron",
  "common-tern",
  "osprey",
] as const);

export type EstuarySurfaceWildlifeAppearanceSpecies =
  (typeof ESTUARY_SURFACE_WILDLIFE_APPEARANCE_SPECIES)[number];

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

const COLD_SHORE_WILDLIFE_APPEARANCE_FALLBACK = Object.freeze({
  "arctic-fox": "white",
} as const satisfies Readonly<Record<ColdShoreWildlifeAppearanceSpecies, string>>);

/** Shared Chart/Relief colors for addressable cold-shore wildlife. */
export const COLD_SHORE_WILDLIFE_APPEARANCE_PALETTES = Object.freeze({
  "arctic-fox": Object.freeze({
    "blue-gray": palette("#89999b", "#d9ded9", "#344043", "#eef3eb"),
    "brown-gray": palette("#80756a", "#c9c0b2", "#352f2b", "#e7dfcf"),
    "pale-cream": palette("#d9d2bf", "#f2eddf", "#555149", "#fffaf0"),
    white: palette("#e7e9e4", "#fffdf3", "#4a5353", "#c5d4d1"),
  }),
} as const);

/** Species-safe cold-shore morph lookup; malformed keys cannot cross species. */
export function coldShoreWildlifeAppearancePalette(
  species: ColdShoreWildlifeAppearanceSpecies,
  appearanceKey: string,
): WildlifeAppearancePalette {
  const palettes = COLD_SHORE_WILDLIFE_APPEARANCE_PALETTES[species] as Readonly<
    Record<string, WildlifeAppearancePalette>
  >;
  if (Object.prototype.hasOwnProperty.call(palettes, appearanceKey)) {
    return palettes[appearanceKey] as WildlifeAppearancePalette;
  }
  return palettes[
    COLD_SHORE_WILDLIFE_APPEARANCE_FALLBACK[species]
  ] as WildlifeAppearancePalette;
}

const POLAR_MARINE_WILDLIFE_APPEARANCE_FALLBACK = Object.freeze({
  "harbor-seal": "mottled-gray",
  "polar-bear": "cream-ivory",
} as const satisfies Readonly<Record<PolarMarineWildlifeAppearanceSpecies, string>>);

/**
 * Shared Chart/Relief colors for polar-shore actors. Polar-bear features use a
 * deliberately dark structural color so its ivory body remains readable over
 * any pale terrain without depending on hue perception.
 */
export const POLAR_MARINE_WILDLIFE_APPEARANCE_PALETTES = Object.freeze({
  "harbor-seal": Object.freeze({
    "dark-slate": palette("#3f5058", "#81939a", "#141d22", "#c8d8d8"),
    "mottled-gray": palette("#687579", "#a9b2b0", "#222b2d", "#dce5df"),
    "pale-silver": palette("#9aa7a7", "#d4dcda", "#303a3c", "#eef3ed"),
    "warm-brown": palette("#716357", "#a99985", "#28231f", "#dfd1b8"),
  }),
  "polar-bear": Object.freeze({
    "cream-ivory": palette("#e5dfc9", "#fff9e7", "#202a2d", "#6f8587"),
    "pale-ivory": palette("#efecdf", "#fffdf3", "#1c2528", "#71878b"),
    "weathered-white": palette("#d4d2c8", "#f2f0e8", "#222b2d", "#7a8d8e"),
    "yellowed-ivory": palette("#d8cca9", "#f1e7cc", "#272d2d", "#778788"),
  }),
} as const);

/** Species-safe polar-shore morph lookup; malformed keys cannot cross species. */
export function polarMarineWildlifeAppearancePalette(
  species: PolarMarineWildlifeAppearanceSpecies,
  appearanceKey: string,
): WildlifeAppearancePalette {
  const palettes = POLAR_MARINE_WILDLIFE_APPEARANCE_PALETTES[species] as Readonly<
    Record<string, WildlifeAppearancePalette>
  >;
  if (Object.prototype.hasOwnProperty.call(palettes, appearanceKey)) {
    return palettes[appearanceKey] as WildlifeAppearancePalette;
  }
  return palettes[
    POLAR_MARINE_WILDLIFE_APPEARANCE_FALLBACK[species]
  ] as WildlifeAppearancePalette;
}

const ESTUARY_SURFACE_WILDLIFE_APPEARANCE_FALLBACK = Object.freeze({
  "great-blue-heron": "blue-gray",
  "common-tern": "black-capped-gray",
  osprey: "pale-headed",
} as const satisfies Readonly<Record<EstuarySurfaceWildlifeAppearanceSpecies, string>>);

/**
 * Shared Chart/Relief palettes for the addressable estuary-surface forms.
 * Dark structural colors remain deliberately separated from the body colors:
 * silhouette, cap, eye-line, and wing structure stay legible without hue.
 */
export const ESTUARY_SURFACE_WILDLIFE_APPEARANCE_PALETTES = Object.freeze({
  "great-blue-heron": Object.freeze({
    "blue-gray": palette("#667a82", "#a9b3ae", "#202a2e", "#c8aa62"),
    "gray-blue": palette("#77858a", "#b8beb8", "#242d30", "#cfb26b"),
    "pale-gray": palette("#a0aaa9", "#d5d7cd", "#2b3335", "#d5b970"),
    "slate-blue": palette("#536b76", "#98a6a7", "#1c272c", "#c4a45d"),
  }),
  "common-tern": Object.freeze({
    "black-capped-gray": palette("#dce1de", "#859294", "#141c1f", "#c85e43"),
    "pale-gray": palette("#e5e7e0", "#a0aaaa", "#182023", "#ca6549"),
    "silver-gray": palette("#c7d0cf", "#78898d", "#121a1d", "#c45b42"),
    "warm-gray": palette("#d5d0c4", "#948f84", "#181d1e", "#c86a4b"),
  }),
  osprey: Object.freeze({
    "dark-backed": palette("#4a3b30", "#e0d9c8", "#171515", "#b2a27e"),
    "pale-headed": palette("#5a493a", "#eee7d5", "#1a1817", "#c2b18c"),
    "rust-bibbed": palette("#62493a", "#d9c6ab", "#201a17", "#b77955"),
    "white-breasted": palette("#514238", "#f0e9d9", "#181716", "#b9a985"),
  }),
} as const);

/** Species-safe estuary morph lookup; malformed keys never cross species. */
export function estuarySurfaceWildlifeAppearancePalette(
  species: EstuarySurfaceWildlifeAppearanceSpecies,
  appearanceKey: string,
): WildlifeAppearancePalette {
  const palettes = ESTUARY_SURFACE_WILDLIFE_APPEARANCE_PALETTES[species] as Readonly<
    Record<string, WildlifeAppearancePalette>
  >;
  if (Object.prototype.hasOwnProperty.call(palettes, appearanceKey)) {
    return palettes[appearanceKey] as WildlifeAppearancePalette;
  }
  return palettes[
    ESTUARY_SURFACE_WILDLIFE_APPEARANCE_FALLBACK[species]
  ] as WildlifeAppearancePalette;
}

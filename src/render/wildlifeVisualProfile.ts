import type { WildlifeView } from "./types";
import {
  ALPINE_WILDLIFE_APPEARANCE_PALETTES,
  ALPHA30_WILDLIFE_APPEARANCE_PALETTES,
  ALPHA31_PREDATOR_APPEARANCE_PALETTES,
  COLD_SHORE_WILDLIFE_APPEARANCE_PALETTES,
  ESTUARY_SURFACE_WILDLIFE_APPEARANCE_PALETTES,
  MARSH_CHANNEL_WILDLIFE_APPEARANCE_PALETTES,
  POLAR_MARINE_WILDLIFE_APPEARANCE_PALETTES,
  SALTMARSH_SMALL_WORLDS_WILDLIFE_APPEARANCE_PALETTES,
  alpineWildlifeAppearancePalette,
  coldShoreWildlifeAppearancePalette,
  domesticGoatAppearancePalette,
  estuarySurfaceWildlifeAppearancePalette,
  marshChannelWildlifeAppearancePalette,
  polarMarineWildlifeAppearancePalette,
  regionalUplandWildlifeAppearancePalette,
  saltmarshSmallWorldsWildlifeAppearancePalette,
  type WildlifeAppearancePalette,
} from "./wildlifeAppearance";

/** Aggregate-only species never cross the renderer's actor-view boundary. */
export type WildlifeVisualSpecies = WildlifeView["species"];

/**
 * Renderer-neutral low-cost geometry families. Shared forms are intentional:
 * morphology parameters and palettes vary the body without cloning an entire
 * species switch into both Chart and Relief.
 */
export type WildlifeVisualForm =
  | "deer"
  | "shorebird-flock"
  | "corvid-flock"
  | "low-quartering-raptor"
  | "long-necked-wader"
  | "dabbling-duck"
  | "ground-fowl"
  | "domestic-goat"
  | "river-otter"
  | "upland-mammal"
  | "black-bear"
  | "domestic-cat"
  | "marsh-rabbit"
  | "small-fox"
  | "harbor-seal"
  | "polar-bear"
  | "mountain-goat"
  | "broad-winged-raptor"
  | "low-shelled-reptile";

type WildlifePaletteFamily =
  | "static"
  | "domestic-goat"
  | "regional-upland"
  | "alpine"
  | "cold-shore"
  | "polar-marine"
  | "estuary-surface"
  | "marsh-channel"
  | "saltmarsh-small-worlds";

export interface WildlifeVisualProfile {
  readonly form: WildlifeVisualForm;
  readonly geometryVariant?:
    | "gull"
    | "tern"
    | "sparrow"
    | "egret"
    | "heron"
    | "eagle"
    | "osprey";
  /** Optional fixed details for the shared aquatic-bird form; omitted colors use the live palette. */
  readonly waterbirdDetails?: Readonly<{
    readonly wingColor?: string;
    readonly billColor?: string;
    readonly showWingAccent: boolean;
  }>;
  readonly colors: WildlifeAppearancePalette;
  readonly paletteFamily: WildlifePaletteFamily;
  readonly hitRadiusScale: number;
  readonly ringRadiusScale: number;
  readonly labelLift: number;
}

const staticPalette = (
  primary: string,
  secondary: string,
  dark: string,
  accent = secondary,
): WildlifeAppearancePalette => Object.freeze({ primary, secondary, dark, accent });

/**
 * One exhaustive body/profile table shared by Chart, Relief, hit testing, and
 * label placement. Population evidence is intentionally owned elsewhere.
 */
export const WILDLIFE_VISUAL_PROFILES = Object.freeze({
  deer: {
    form: "deer",
    colors: staticPalette("#9d744f", "#d3ae78", "#3c2d25"),
    paletteFamily: "static",
    hitRadiusScale: 0.48,
    ringRadiusScale: 0.4,
    labelLift: 0.78,
  },
  gull: {
    form: "shorebird-flock",
    geometryVariant: "gull",
    colors: staticPalette("#e2e8df", "#879496", "#253438", "#d5a44d"),
    paletteFamily: "static",
    hitRadiusScale: 0.44,
    ringRadiusScale: 0.34,
    labelLift: 1.16,
  },
  "fish-crow": {
    form: "corvid-flock",
    colors: staticPalette("#17262a", "#31545b", "#050a0b"),
    paletteFamily: "static",
    hitRadiusScale: 0.46,
    ringRadiusScale: 0.36,
    labelLift: 1.08,
  },
  "northern-harrier": {
    form: "low-quartering-raptor",
    colors: staticPalette("#88715d", "#ddd5c3", "#302a26"),
    paletteFamily: "static",
    hitRadiusScale: 0.52,
    ringRadiusScale: 0.42,
    labelLift: 1.18,
  },
  "snowy-egret": {
    form: "long-necked-wader",
    geometryVariant: "egret",
    colors: staticPalette("#f4f1df", "#d3ad4f", "#1d2525"),
    paletteFamily: "static",
    hitRadiusScale: 0.48,
    ringRadiusScale: 0.38,
    labelLift: 0.98,
  },
  "american-black-duck": {
    form: "dabbling-duck",
    waterbirdDetails: Object.freeze({
      wingColor: "#5d4939",
      billColor: "#a59655",
      showWingAccent: true,
    }),
    colors: staticPalette("#4b382e", "#76604a", "#211a16", "#4a5f8f"),
    paletteFamily: "static",
    hitRadiusScale: 0.48,
    ringRadiusScale: 0.39,
    labelLift: 0.74,
  },
  "domestic-chicken": {
    form: "ground-fowl",
    colors: staticPalette("#a66a3f", "#d6b37e", "#34241d", "#b34735"),
    paletteFamily: "static",
    hitRadiusScale: 0.44,
    ringRadiusScale: 0.35,
    labelLift: 0.7,
  },
  "domestic-goat": {
    form: "domestic-goat",
    colors: domesticGoatAppearancePalette("brown-coated"),
    paletteFamily: "domestic-goat",
    hitRadiusScale: 0.54,
    ringRadiusScale: 0.44,
    labelLift: 0.86,
  },
  "north-american-river-otter": {
    form: "river-otter",
    colors: staticPalette("#5b402e", "#9b7957", "#241b17", "#d6c3a0"),
    paletteFamily: "static",
    hitRadiusScale: 0.52,
    ringRadiusScale: 0.43,
    labelLift: 0.72,
  },
  "black-bear": {
    form: "black-bear",
    colors: staticPalette("#202827", "#5b5145", "#0a1112"),
    paletteFamily: "static",
    hitRadiusScale: 0.62,
    ringRadiusScale: 0.52,
    labelLift: 0.78,
  },
  "domestic-cat": {
    form: "domestic-cat",
    colors: staticPalette("#746153", "#b28f69", "#292522"),
    paletteFamily: "static",
    hitRadiusScale: 0.44,
    ringRadiusScale: 0.36,
    labelLift: 0.68,
  },
  "marsh-rabbit": {
    form: "marsh-rabbit",
    colors: staticPalette("#806c52", "#b49770", "#2d2923"),
    paletteFamily: "static",
    hitRadiusScale: 0.44,
    ringRadiusScale: 0.34,
    labelLift: 0.7,
  },
  "marsh-fox": {
    form: "small-fox",
    colors: staticPalette("#995138", "#d1b691", "#35271f"),
    paletteFamily: "static",
    hitRadiusScale: 0.48,
    ringRadiusScale: 0.4,
    labelLift: 0.72,
  },
  "arctic-fox": {
    form: "small-fox",
    colors: COLD_SHORE_WILDLIFE_APPEARANCE_PALETTES["arctic-fox"].white,
    paletteFamily: "cold-shore",
    hitRadiusScale: 0.48,
    ringRadiusScale: 0.4,
    labelLift: 0.72,
  },
  "harbor-seal": {
    form: "harbor-seal",
    colors: POLAR_MARINE_WILDLIFE_APPEARANCE_PALETTES["harbor-seal"]["mottled-gray"],
    paletteFamily: "polar-marine",
    hitRadiusScale: 0.57,
    ringRadiusScale: 0.47,
    labelLift: 0.68,
  },
  "polar-bear": {
    form: "polar-bear",
    colors: POLAR_MARINE_WILDLIFE_APPEARANCE_PALETTES["polar-bear"]["cream-ivory"],
    paletteFamily: "polar-marine",
    hitRadiusScale: 0.74,
    ringRadiusScale: 0.63,
    labelLift: 0.96,
  },
  "wild-boar": {
    form: "upland-mammal",
    colors: ALPHA30_WILDLIFE_APPEARANCE_PALETTES["wild-boar"]["dark-brown"],
    paletteFamily: "regional-upland",
    hitRadiusScale: 0.58,
    ringRadiusScale: 0.48,
    labelLift: 0.75,
  },
  elk: {
    form: "upland-mammal",
    colors: ALPHA30_WILDLIFE_APPEARANCE_PALETTES.elk["golden-brown"],
    paletteFamily: "regional-upland",
    hitRadiusScale: 0.64,
    ringRadiusScale: 0.54,
    labelLift: 1.08,
  },
  "gray-wolf": {
    form: "upland-mammal",
    colors: ALPHA30_WILDLIFE_APPEARANCE_PALETTES["gray-wolf"]["grizzled-gray"],
    paletteFamily: "regional-upland",
    hitRadiusScale: 0.54,
    ringRadiusScale: 0.44,
    labelLift: 0.78,
  },
  cougar: {
    form: "upland-mammal",
    colors: ALPHA31_PREDATOR_APPEARANCE_PALETTES.cougar["warm-tawny"],
    paletteFamily: "regional-upland",
    hitRadiusScale: 0.56,
    ringRadiusScale: 0.46,
    labelLift: 0.76,
  },
  "brown-bear": {
    form: "upland-mammal",
    colors: ALPHA31_PREDATOR_APPEARANCE_PALETTES["brown-bear"]["dark-brown"],
    paletteFamily: "regional-upland",
    hitRadiusScale: 0.68,
    ringRadiusScale: 0.58,
    labelLift: 0.88,
  },
  "mountain-goat": {
    form: "mountain-goat",
    colors: ALPINE_WILDLIFE_APPEARANCE_PALETTES["mountain-goat"]["cream-white"],
    paletteFamily: "alpine",
    hitRadiusScale: 0.56,
    ringRadiusScale: 0.46,
    labelLift: 0.92,
  },
  "golden-eagle": {
    form: "broad-winged-raptor",
    geometryVariant: "eagle",
    colors: ALPINE_WILDLIFE_APPEARANCE_PALETTES["golden-eagle"]["golden-naped"],
    paletteFamily: "alpine",
    hitRadiusScale: 0.6,
    ringRadiusScale: 0.48,
    labelLift: 1.32,
  },
  "great-blue-heron": {
    form: "long-necked-wader",
    geometryVariant: "heron",
    colors: ESTUARY_SURFACE_WILDLIFE_APPEARANCE_PALETTES["great-blue-heron"]["blue-gray"],
    paletteFamily: "estuary-surface",
    hitRadiusScale: 0.56,
    ringRadiusScale: 0.45,
    labelLift: 1.18,
  },
  "common-tern": {
    form: "shorebird-flock",
    geometryVariant: "tern",
    colors: ESTUARY_SURFACE_WILDLIFE_APPEARANCE_PALETTES["common-tern"]["black-capped-gray"],
    paletteFamily: "estuary-surface",
    hitRadiusScale: 0.45,
    ringRadiusScale: 0.35,
    labelLift: 1.14,
  },
  osprey: {
    form: "broad-winged-raptor",
    geometryVariant: "osprey",
    colors: ESTUARY_SURFACE_WILDLIFE_APPEARANCE_PALETTES.osprey["pale-headed"],
    paletteFamily: "estuary-surface",
    hitRadiusScale: 0.58,
    ringRadiusScale: 0.47,
    labelLift: 1.28,
  },
  "greater-yellowlegs": {
    form: "long-necked-wader",
    geometryVariant: "egret",
    colors: MARSH_CHANNEL_WILDLIFE_APPEARANCE_PALETTES["greater-yellowlegs"]["gray-backed"],
    paletteFamily: "marsh-channel",
    hitRadiusScale: 0.46,
    ringRadiusScale: 0.37,
    labelLift: 0.94,
  },
  "belted-kingfisher": {
    // The shared small-bird silhouette is one body per actor; a missing group
    // count keeps this solitary species from acquiring a synthetic flock.
    form: "shorebird-flock",
    geometryVariant: "gull",
    colors: MARSH_CHANNEL_WILDLIFE_APPEARANCE_PALETTES["belted-kingfisher"]["blue-gray"],
    paletteFamily: "marsh-channel",
    hitRadiusScale: 0.43,
    ringRadiusScale: 0.34,
    labelLift: 0.86,
  },
  "double-crested-cormorant": {
    // The shared aquatic-bird form preserves swimming/diving/flying posture;
    // identity and plumage remain species-owned by the profile and palette.
    form: "dabbling-duck",
    waterbirdDetails: Object.freeze({ showWingAccent: false }),
    colors: MARSH_CHANNEL_WILDLIFE_APPEARANCE_PALETTES["double-crested-cormorant"]["bronze-black"],
    paletteFamily: "marsh-channel",
    hitRadiusScale: 0.5,
    ringRadiusScale: 0.4,
    labelLift: 0.82,
  },
  "seaside-sparrow": {
    // One addressable flock actor is rendered as a compact perching-bird form;
    // visible group count remains projection-owned rather than drawn as a census.
    form: "shorebird-flock",
    geometryVariant: "sparrow",
    colors: SALTMARSH_SMALL_WORLDS_WILDLIFE_APPEARANCE_PALETTES["seaside-sparrow"]["salt-gray"],
    paletteFamily: "saltmarsh-small-worlds",
    hitRadiusScale: 0.4,
    ringRadiusScale: 0.32,
    labelLift: 0.76,
  },
  "diamondback-terrapin": {
    form: "low-shelled-reptile",
    colors: SALTMARSH_SMALL_WORLDS_WILDLIFE_APPEARANCE_PALETTES["diamondback-terrapin"]["warm-olive"],
    paletteFamily: "saltmarsh-small-worlds",
    hitRadiusScale: 0.53,
    ringRadiusScale: 0.43,
    labelLift: 0.58,
  },
} as const satisfies Readonly<Record<WildlifeVisualSpecies, WildlifeVisualProfile>>);

export function isWildlifeVisualSpecies(
  species: unknown,
): species is WildlifeVisualSpecies {
  return typeof species === "string"
    && Object.prototype.hasOwnProperty.call(WILDLIFE_VISUAL_PROFILES, species);
}

export function wildlifeVisualProfile(
  species: WildlifeVisualSpecies,
): WildlifeVisualProfile {
  return WILDLIFE_VISUAL_PROFILES[species];
}

/** One morph-sensitive palette resolver shared by both render modes. */
export function wildlifeVisualPalette(
  species: WildlifeVisualSpecies,
  appearanceKey: string,
): WildlifeAppearancePalette {
  const profile = wildlifeVisualProfile(species);
  switch (profile.paletteFamily) {
    case "domestic-goat":
      return domesticGoatAppearancePalette(appearanceKey);
    case "regional-upland":
      return regionalUplandWildlifeAppearancePalette(species as Parameters<
        typeof regionalUplandWildlifeAppearancePalette
      >[0], appearanceKey);
    case "alpine":
      return alpineWildlifeAppearancePalette(species as Parameters<
        typeof alpineWildlifeAppearancePalette
      >[0], appearanceKey);
    case "cold-shore":
      return coldShoreWildlifeAppearancePalette(species as Parameters<
        typeof coldShoreWildlifeAppearancePalette
      >[0], appearanceKey);
    case "polar-marine":
      return polarMarineWildlifeAppearancePalette(species as Parameters<
        typeof polarMarineWildlifeAppearancePalette
      >[0], appearanceKey);
    case "estuary-surface":
      return estuarySurfaceWildlifeAppearancePalette(species as Parameters<
        typeof estuarySurfaceWildlifeAppearancePalette
      >[0], appearanceKey);
    case "marsh-channel":
      return marshChannelWildlifeAppearancePalette(species as Parameters<
        typeof marshChannelWildlifeAppearancePalette
      >[0], appearanceKey);
    case "saltmarsh-small-worlds":
      return saltmarshSmallWorldsWildlifeAppearancePalette(species as Parameters<
        typeof saltmarshSmallWorldsWildlifeAppearancePalette
      >[0], appearanceKey);
    case "static":
      return profile.colors;
  }
}

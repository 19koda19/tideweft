import type { BiomeId, TerrainTileView } from "./types";

export type BiomeMotif =
  | "ripple"
  | "salt-crystal"
  | "reeds"
  | "rain-stem"
  | "sunburst"
  | "wind-stroke"
  | "glimmer";

export interface BiomePresentation {
  readonly id: BiomeId;
  readonly chartColor: string;
  readonly reliefColor: string;
  readonly accentColor: string;
  readonly motif: BiomeMotif;
}

/** Restrained, redundant color-and-shape language shared by Chart and Relief. */
export const BIOME_PRESENTATION: Readonly<Record<BiomeId, BiomePresentation>> = {
  "tide-channel": {
    id: "tide-channel",
    chartColor: "#15363c",
    reliefColor: "#1b444a",
    accentColor: "#a8d8d1",
    motif: "ripple",
  },
  "brine-flat": {
    id: "brine-flat",
    chartColor: "#666156",
    reliefColor: "#7a7364",
    accentColor: "#ded3b9",
    motif: "salt-crystal",
  },
  "reed-marsh": {
    id: "reed-marsh",
    chartColor: "#3b5546",
    reliefColor: "#496653",
    accentColor: "#bed1ad",
    motif: "reeds",
  },
  "rain-meadow": {
    id: "rain-meadow",
    chartColor: "#4b6256",
    reliefColor: "#587468",
    accentColor: "#c5ded6",
    motif: "rain-stem",
  },
  "sun-meadow": {
    id: "sun-meadow",
    chartColor: "#646049",
    reliefColor: "#777156",
    accentColor: "#e0d59f",
    motif: "sunburst",
  },
  "wind-ridge": {
    id: "wind-ridge",
    chartColor: "#5d6462",
    reliefColor: "#707876",
    accentColor: "#d5ddda",
    motif: "wind-stroke",
  },
  glimmerfen: {
    id: "glimmerfen",
    chartColor: "#355958",
    reliefColor: "#426d69",
    accentColor: "#c9c3df",
    motif: "glimmer",
  },
};

/** Hidden cells deliberately return no biome presentation. */
export function visibleBiomePresentation(
  tile: TerrainTileView | undefined,
): BiomePresentation | undefined {
  if (!tile?.biome || discovery(tile) <= 0) return undefined;
  return BIOME_PRESENTATION[tile.biome];
}

/** Selects the climate channel that most strongly articulates this biome. */
export function biomeEnvironmentalEmphasis(tile: TerrainTileView | undefined): number {
  const biome = visibleBiomePresentation(tile)?.id;
  const climate = tile?.climate;
  if (!biome || !climate) return 0.5;
  switch (biome) {
    case "tide-channel": return unit(climate.magicalWater * 0.65 + climate.salinity * 0.35);
    case "brine-flat": return unit(climate.salinity);
    case "reed-marsh": return unit(climate.rainfall);
    case "rain-meadow": return unit(climate.rainfall);
    case "sun-meadow": return unit(climate.heat);
    case "wind-ridge": return unit(climate.exposure);
    case "glimmerfen": return unit(climate.magicalWater);
  }
}

function discovery(tile: TerrainTileView): number {
  return tile.discovered === undefined ? 1 : unit(tile.discovered);
}

function unit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

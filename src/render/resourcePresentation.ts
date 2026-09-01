import type { FieldMaterialView } from "./types";

export type FieldResourceMotif =
  | "kelp-bladders"
  | "crossed-driftwood"
  | "glimmer-cap"
  | "shell-spiral"
  | "sunburst-fiber"
  | "hooked-stone"
  | "bound-reeds"
  | "moss-cushion"
  | "forked-lichen";

export interface FieldResourcePresentation {
  readonly label: string;
  /** Restrained chart ink, chosen to remain legible over the native biome. */
  readonly chartColor: string;
  /** Low-poly material used by Relief 3D. */
  readonly reliefColor: string;
  /** A structural silhouette cue; color is never the only identifier. */
  readonly motif: FieldResourceMotif;
}

export const FIELD_RESOURCE_PRESENTATION: Readonly<
  Record<FieldMaterialView, FieldResourcePresentation>
> = {
  bladderkelp: {
    label: "Bladderkelp",
    chartColor: "#72bfc0",
    reliefColor: "#629fa0",
    motif: "kelp-bladders",
  },
  driftwood: {
    label: "Driftwood",
    chartColor: "#b19773",
    reliefColor: "#806b52",
    motif: "crossed-driftwood",
  },
  "glimmer-spore": {
    label: "Glimmer spore",
    chartColor: "#c8b7dc",
    reliefColor: "#a995c6",
    motif: "glimmer-cap",
  },
  shellstone: {
    label: "Shellstone",
    chartColor: "#d0c7aa",
    reliefColor: "#a69e85",
    motif: "shell-spiral",
  },
  sunfiber: {
    label: "Sunfiber",
    chartColor: "#d3bd7b",
    reliefColor: "#aa955d",
    motif: "sunburst-fiber",
  },
  hookstone: {
    label: "Hookstone",
    chartColor: "#a9b1ad",
    reliefColor: "#7f8b87",
    motif: "hooked-stone",
  },
  cordreed: {
    label: "Cordreed",
    chartColor: "#91b58d",
    reliefColor: "#718e6b",
    motif: "bound-reeds",
  },
  pitchmoss: {
    label: "Pitchmoss",
    chartColor: "#78967c",
    reliefColor: "#536e5b",
    motif: "moss-cushion",
  },
  stormlichen: {
    label: "Stormlichen",
    chartColor: "#9fa8c2",
    reliefColor: "#7c849f",
    motif: "forked-lichen",
  },
};


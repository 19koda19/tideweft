import { BIOME_PRESENTATION } from "./biomePresentation";
import type { BiomeId, TerrainKind } from "./types";

/** Authored Relief albedo. Water stays blue; dry ground is deliberately earthy. */
export const RELIEF_TERRAIN_ALBEDO: Readonly<Record<TerrainKind, string>> = {
  "deep-water": "#082832",
  channel: "#0e4149",
  shallows: "#28666a",
  mudflat: "#74543b",
  sandbar: "#ad824b",
  "salt-marsh": "#435d38",
  meadow: "#526f45",
  scrub: "#4d593e",
  ridge: "#716c60",
  built: "#92785d",
};

export interface ReliefSurfaceMaterialInput {
  readonly kind: TerrainKind;
  readonly biome?: BiomeId;
  readonly environment: number;
  readonly visibility: number;
  readonly fog: number;
  readonly memoryOnly?: boolean;
  readonly currentVisibility?: number;
}

/**
 * Pure authored RGB before WebGL lighting. Keeping this out of p5 makes color
 * identity testable and prevents renderer state from silently choosing cyan.
 */
export function reliefSurfaceMaterialColor(input: ReliefSurfaceMaterialInput): string {
  const biome = input.kind === "built" || input.biome === undefined
    ? undefined
    : BIOME_PRESENTATION[input.biome];
  const base = biome?.reliefColor ?? RELIEF_TERRAIN_ALBEDO[input.kind];
  const conditioned = mixHex(
    base,
    biome?.accentColor ?? "#ddfff1",
    biome ? clamp(0.07 + unit(input.environment) * 0.15, 0.07, 0.22) : 0.04,
  );
  const revealed = mixHex("#061416", conditioned, Math.pow(unit(input.visibility), 0.72));
  const atmospheric = mixHex(
    revealed,
    "#102e35",
    clamp(unit(input.fog) * 0.5, 0, 0.58),
  );
  if (input.memoryOnly) return mixHex("#061416", atmospheric, 0.13);
  const current = unit(input.currentVisibility ?? 1);
  return current < 1
    ? mixHex("#061416", atmospheric, Math.pow(current, 1.15))
    : atmospheric;
}

export function reliefTerrainKindIsWater(kind: TerrainKind): boolean {
  return kind === "deep-water" || kind === "channel" || kind === "shallows";
}

function mixHex(left: string, right: string, amount: number): string {
  const first = parseHex(left);
  const second = parseHex(right);
  const blend = unit(amount);
  const channel = (index: number): string => Math.round(
    (first[index] ?? 0) + ((second[index] ?? 0) - (first[index] ?? 0)) * blend,
  ).toString(16).padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

function parseHex(value: string): readonly number[] {
  const hex = /^#[0-9a-f]{6}$/iu.test(value) ? value.slice(1) : "000000";
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, Number.isFinite(value) ? value : low));
}

function unit(value: number): number {
  return clamp(value, 0, 1);
}

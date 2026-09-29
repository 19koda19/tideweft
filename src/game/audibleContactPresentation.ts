import type { AudibleContact } from "./perception";

export type AudibleContactCardinalDirection =
  | "east"
  | "south-east"
  | "south"
  | "south-west"
  | "west"
  | "north-west"
  | "north"
  | "north-east";

export type AudibleContactDirection =
  | AudibleContactCardinalDirection
  | "all around"
  | "direction unclear";

const CARDINAL_DIRECTIONS: readonly AudibleContactCardinalDirection[] = Object.freeze([
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
  "north",
  "north-east",
]);

/** Returns only the coarse direction an uncertainty band can honestly support. */
export function audibleContactDirection(contact: AudibleContact): AudibleContactDirection {
  const uncertainty = contact.bearing.uncertaintyRadians;
  if (uncertainty >= Math.PI - 1e-6) return "all around";
  const bearing = normalizeRadians(contact.bearing.centerRadians);
  const octant = Math.round(bearing / (Math.PI / 4)) % 8;
  const center = octant * (Math.PI / 4);
  if (uncertainty + angularDistance(bearing, center) >= Math.PI / 8) {
    return "direction unclear";
  }
  return CARDINAL_DIRECTIONS[octant] ?? "direction unclear";
}

/** Stereo position weakened by the same anonymous directional uncertainty. */
export function audibleContactPan(contact: AudibleContact): number {
  const maximumDirectionalUncertainty = (3 * Math.PI) / 4;
  const directionWeight = clampUnit(
    1 - contact.bearing.uncertaintyRadians / maximumDirectionalUncertainty,
  );
  return clampPan(Math.cos(contact.bearing.centerRadians) * directionWeight);
}

function normalizeRadians(value: number): number {
  const fullTurn = Math.PI * 2;
  return ((value % fullTurn) + fullTurn) % fullTurn;
}

function angularDistance(left: number, right: number): number {
  const difference = Math.abs(normalizeRadians(left) - normalizeRadians(right));
  return Math.min(difference, Math.PI * 2 - difference);
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function clampPan(value: number): number {
  return Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
}

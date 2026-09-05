import type { CargoEnvironmentProperty } from "../sim/cargoEnvironment";

/**
 * Ordinary provisions are physical supplies, not crafting ingredients and not
 * Promise cargo. Definitions stay deliberately small until a provision has a
 * real consumer in the simulation.
 */
export const PROVISION_KINDS = [
  "trail-ration",
  "dried-fish",
  "fresh-produce",
] as const;

export type ProvisionKind = (typeof PROVISION_KINDS)[number];

export interface ProvisionDefinition {
  readonly label: string;
  readonly need: "food";
  /** Species-neutral nourishment per consumed unit, fixed-point 0..1. */
  readonly nutrition: number;
  readonly loadMilli: number;
  readonly property: CargoEnvironmentProperty;
  /** Uncontained scent contribution in fixed-point 0..1 units. */
  readonly scentStrength: number;
}

export const PROVISION_DEFINITIONS: Readonly<Record<ProvisionKind, ProvisionDefinition>> =
Object.freeze({
  "trail-ration": Object.freeze({
    label: "trail ration",
    need: "food",
    nutrition: 720_000,
    loadMilli: 700,
    property: "perishable",
    scentStrength: 180_000,
  }),
  "dried-fish": Object.freeze({
    label: "dried fish",
    need: "food",
    nutrition: 810_000,
    loadMilli: 650,
    property: "perishable",
    scentStrength: 820_000,
  }),
  "fresh-produce": Object.freeze({
    label: "fresh produce",
    need: "food",
    nutrition: 460_000,
    loadMilli: 900,
    property: "perishable",
    scentStrength: 460_000,
  }),
});

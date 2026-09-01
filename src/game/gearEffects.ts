import {
  CRAFTING_CONDITION_MAX,
  inspectCraftingInventory,
  type CraftedGearItem,
  type CraftedGearKind,
  type CraftingInventory,
} from "./crafting";

/**
 * Pure carried-gear resolver.
 *
 * Positive-condition gear is auto-equipped. Queries never mutate or spend
 * durability; callers explicitly apply one named service event only after its
 * benefit was actually used by authoritative gameplay.
 */

export const PASSIVE_GEAR_KINDS = [
  "cargo-rain-shroud",
  "float-sash",
  "glimmer-liner",
  "marsh-wraps",
  "pannier",
  "ridge-cleats",
  "weather-cape",
] as const satisfies readonly CraftedGearKind[];

export type PassiveGearKind = (typeof PASSIVE_GEAR_KINDS)[number];

export const GEAR_BENEFIT_IDS = [
  "cargo-rain-cover",
  "magic-lining",
  "marsh-footing",
  "pannier-capacity",
  "ridge-grip",
  "weather-shelter",
  "wet-buoyancy",
] as const;

export type GearBenefitId = (typeof GEAR_BENEFIT_IDS)[number];

export const GEAR_EFFECT_CHANNELS = [
  "cargo-wetting",
  "current-force",
  "exposure",
  "fall-risk",
  "gust-stability",
  "magic-contamination",
  "marsh-movement",
  "marsh-stability",
  "pannier-capacity",
  "rock-travel",
  "wet-stamina",
] as const;

export type GearEffectChannel = (typeof GEAR_EFFECT_CHANNELS)[number];

export type GearContextSignal =
  | "marsh"
  | "wet"
  | "rock"
  | "exposure"
  | "gust"
  | "cargo-wetting"
  | "magic-contamination"
  | "always";

export interface GearEffectContext {
  readonly marsh?: boolean;
  readonly wet?: boolean;
  readonly rock?: boolean;
  readonly exposure?: boolean;
  readonly gust?: boolean;
  readonly cargoWetting?: boolean;
  readonly magicContamination?: boolean;
}

export interface GearChannelDefinition {
  readonly channel: GearEffectChannel;
  readonly signal: GearContextSignal;
  readonly mode: "cost-permille" | "capacity-milli";
  readonly value: number;
}

export interface GearBenefitDefinition {
  readonly id: GearBenefitId;
  readonly kind: PassiveGearKind;
  readonly label: string;
  readonly serviceWear: number;
  readonly channels: readonly GearChannelDefinition[];
}

export const GEAR_BENEFIT_DEFINITIONS: Readonly<
  Record<GearBenefitId, GearBenefitDefinition>
> = {
  "cargo-rain-cover": {
    id: "cargo-rain-cover",
    kind: "cargo-rain-shroud",
    label: "Cargo rain cover",
    serviceWear: 8_000,
    channels: [channel("cargo-wetting", "cargo-wetting", "cost-permille", 500)],
  },
  "magic-lining": {
    id: "magic-lining",
    kind: "glimmer-liner",
    label: "Magic-water lining",
    serviceWear: 8_000,
    channels: [channel("magic-contamination", "magic-contamination", "cost-permille", 400)],
  },
  "marsh-footing": {
    id: "marsh-footing",
    kind: "marsh-wraps",
    label: "Marsh footing",
    serviceWear: 8_000,
    channels: [
      channel("marsh-movement", "marsh", "cost-permille", 800),
      channel("marsh-stability", "marsh", "cost-permille", 700),
    ],
  },
  "pannier-capacity": {
    id: "pannier-capacity",
    kind: "pannier",
    label: "Pannier capacity",
    serviceWear: 5_000,
    channels: [channel("pannier-capacity", "always", "capacity-milli", 6_000)],
  },
  "ridge-grip": {
    id: "ridge-grip",
    kind: "ridge-cleats",
    label: "Ridge grip",
    serviceWear: 12_000,
    channels: [
      channel("rock-travel", "rock", "cost-permille", 750),
      channel("fall-risk", "rock", "cost-permille", 600),
    ],
  },
  "weather-shelter": {
    id: "weather-shelter",
    kind: "weather-cape",
    label: "Weather shelter",
    serviceWear: 6_000,
    channels: [
      channel("exposure", "exposure", "cost-permille", 650),
      channel("gust-stability", "gust", "cost-permille", 750),
    ],
  },
  "wet-buoyancy": {
    id: "wet-buoyancy",
    kind: "float-sash",
    label: "Wet buoyancy",
    serviceWear: 10_000,
    channels: [
      channel("wet-stamina", "wet", "cost-permille", 800),
      channel("current-force", "wet", "cost-permille", 850),
    ],
  },
};

export const GEAR_SERVICE_WEAR: Readonly<Record<PassiveGearKind, number>> = {
  "cargo-rain-shroud": 8_000,
  "float-sash": 10_000,
  "glimmer-liner": 8_000,
  "marsh-wraps": 8_000,
  pannier: 5_000,
  "ridge-cleats": 12_000,
  "weather-cape": 6_000,
};

export interface GearEffectResolution {
  readonly channel: GearEffectChannel;
  readonly benefit: GearBenefitId;
  readonly gearId: number;
  readonly kind: PassiveGearKind;
  readonly mode: GearChannelDefinition["mode"];
  readonly value: number;
}

export type GearQueryReason = "ready" | "invalid-inventory";

export interface CarriedGearEffects {
  readonly valid: boolean;
  readonly reason: GearQueryReason;
  readonly marshMovementCostPermille: number;
  readonly marshStabilityLossPermille: number;
  readonly wetStaminaCostPermille: number;
  readonly currentForcePermille: number;
  readonly rockTravelCostPermille: number;
  readonly fallRiskPermille: number;
  readonly exposureCostPermille: number;
  readonly gustStabilityLossPermille: number;
  readonly cargoWettingPermille: number;
  readonly magicContaminationPermille: number;
  readonly capacityBonusMilli: number;
  readonly resolutions: readonly GearEffectResolution[];
}

export type GearServiceReason =
  | "worn"
  | "invalid-inventory"
  | "benefit-not-applicable"
  | "gear-not-found"
  | "gear-broken";

export interface GearServiceWearResult {
  readonly ok: boolean;
  readonly reason: GearServiceReason;
  readonly benefit: GearBenefitId;
  readonly inventory: CraftingInventory;
  readonly gear: CraftedGearItem | null;
  readonly conditionSpent: number;
}

const NEUTRAL_PERMILLE = 1_000;

function channel(
  effectChannel: GearEffectChannel,
  signal: GearContextSignal,
  mode: GearChannelDefinition["mode"],
  value: number,
): GearChannelDefinition {
  return Object.freeze({ channel: effectChannel, signal, mode, value });
}

/** Resolve all currently applicable passive effects without spending wear. */
export function queryCarriedGearEffects(
  inventory: CraftingInventory,
  context: GearEffectContext = {},
): CarriedGearEffects {
  if (!inspectCraftingInventory(inventory).valid) return neutralEffects("invalid-inventory");

  const winners = new Map<GearEffectChannel, GearEffectResolution>();
  for (const definition of Object.values(GEAR_BENEFIT_DEFINITIONS)) {
    const soundGear = inventory.gear
      .filter((gear): gear is CraftedGearItem & { readonly kind: PassiveGearKind } =>
        gear.kind === definition.kind && gear.condition > 0)
      .sort((left, right) => left.id - right.id);
    for (const gear of soundGear) {
      for (const effect of definition.channels) {
        if (!signalApplies(effect.signal, context)) continue;
        const candidate: GearEffectResolution = Object.freeze({
          channel: effect.channel,
          benefit: definition.id,
          gearId: gear.id,
          kind: definition.kind,
          mode: effect.mode,
          value: effect.value,
        });
        const existing = winners.get(effect.channel);
        if (!existing || stronger(candidate, existing)) winners.set(effect.channel, candidate);
      }
    }
  }

  const resolutions = GEAR_EFFECT_CHANNELS
    .flatMap((effectChannel) => {
      const resolution = winners.get(effectChannel);
      return resolution ? [resolution] : [];
    });
  const value = (effectChannel: GearEffectChannel, fallback: number): number =>
    winners.get(effectChannel)?.value ?? fallback;

  return Object.freeze({
    valid: true,
    reason: "ready",
    marshMovementCostPermille: value("marsh-movement", NEUTRAL_PERMILLE),
    marshStabilityLossPermille: value("marsh-stability", NEUTRAL_PERMILLE),
    wetStaminaCostPermille: value("wet-stamina", NEUTRAL_PERMILLE),
    currentForcePermille: value("current-force", NEUTRAL_PERMILLE),
    rockTravelCostPermille: value("rock-travel", NEUTRAL_PERMILLE),
    fallRiskPermille: value("fall-risk", NEUTRAL_PERMILLE),
    exposureCostPermille: value("exposure", NEUTRAL_PERMILLE),
    gustStabilityLossPermille: value("gust-stability", NEUTRAL_PERMILLE),
    cargoWettingPermille: value("cargo-wetting", NEUTRAL_PERMILLE),
    magicContaminationPermille: value("magic-contamination", NEUTRAL_PERMILLE),
    capacityBonusMilli: value("pannier-capacity", 0),
    resolutions: Object.freeze(resolutions),
  });
}

/** Query one named benefit and its stable winning gear item. */
export function resolveCarriedGearBenefit(
  inventory: CraftingInventory,
  context: GearEffectContext,
  benefit: GearBenefitId,
): readonly GearEffectResolution[] {
  const effects = queryCarriedGearEffects(inventory, context);
  if (!effects.valid) return Object.freeze([]);
  return Object.freeze(effects.resolutions.filter((resolution) => resolution.benefit === benefit));
}

/**
 * Spend one service event after authoritative gameplay used `benefit`.
 * Re-resolution prevents a stale/duplicate ID from charging the wrong copy.
 */
export function applyGearServiceWear(
  inventory: CraftingInventory,
  context: GearEffectContext,
  benefit: GearBenefitId,
): GearServiceWearResult {
  if (!inspectCraftingInventory(inventory).valid) {
    return failedWear("invalid-inventory", benefit, inventory);
  }
  const definition = GEAR_BENEFIT_DEFINITIONS[benefit];
  if (!definition.channels.some((effect) => signalApplies(effect.signal, context))) {
    return failedWear("benefit-not-applicable", benefit, inventory);
  }
  const matching = [...inventory.gear]
    .filter((gear) => gear.kind === definition.kind)
    .sort((left, right) => left.id - right.id);
  if (matching.length === 0) return failedWear("gear-not-found", benefit, inventory);

  const resolved = resolveCarriedGearBenefit(inventory, context, benefit);
  const winnerId = resolved.reduce<number | null>(
    (lowest, resolution) => lowest === null || resolution.gearId < lowest
      ? resolution.gearId
      : lowest,
    null,
  );
  if (winnerId === null) return failedWear("gear-broken", benefit, inventory);
  const winner = matching.find((gear) => gear.id === winnerId);
  if (!winner || winner.condition <= 0) return failedWear("gear-broken", benefit, inventory);

  const conditionSpent = Math.min(winner.condition, definition.serviceWear);
  const serviced: CraftedGearItem = Object.freeze({
    ...winner,
    condition: winner.condition - conditionSpent,
  });
  const gear = inventory.gear
    .map((item) => item.id === winner.id ? serviced : Object.freeze({ ...item }))
    .sort((left, right) => left.id - right.id);
  const nextInventory: CraftingInventory = Object.freeze({
    ...inventory,
    stacks: Object.freeze({ ...inventory.stacks }),
    gear: Object.freeze(gear),
  });
  return Object.freeze({
    ok: true,
    reason: "worn",
    benefit,
    inventory: nextInventory,
    gear: serviced,
    conditionSpent,
  });
}

function stronger(candidate: GearEffectResolution, existing: GearEffectResolution): boolean {
  if (candidate.mode === "capacity-milli") {
    return candidate.value > existing.value
      || (candidate.value === existing.value && candidate.gearId < existing.gearId);
  }
  return candidate.value < existing.value
    || (candidate.value === existing.value && candidate.gearId < existing.gearId);
}

function signalApplies(signal: GearContextSignal, context: GearEffectContext): boolean {
  switch (signal) {
    case "always": return true;
    case "marsh": return context.marsh === true;
    case "wet": return context.wet === true;
    case "rock": return context.rock === true;
    case "exposure": return context.exposure === true;
    case "gust": return context.gust === true;
    case "cargo-wetting": return context.cargoWetting === true;
    case "magic-contamination": return context.magicContamination === true;
  }
}

function neutralEffects(reason: GearQueryReason): CarriedGearEffects {
  return Object.freeze({
    valid: reason === "ready",
    reason,
    marshMovementCostPermille: NEUTRAL_PERMILLE,
    marshStabilityLossPermille: NEUTRAL_PERMILLE,
    wetStaminaCostPermille: NEUTRAL_PERMILLE,
    currentForcePermille: NEUTRAL_PERMILLE,
    rockTravelCostPermille: NEUTRAL_PERMILLE,
    fallRiskPermille: NEUTRAL_PERMILLE,
    exposureCostPermille: NEUTRAL_PERMILLE,
    gustStabilityLossPermille: NEUTRAL_PERMILLE,
    cargoWettingPermille: NEUTRAL_PERMILLE,
    magicContaminationPermille: NEUTRAL_PERMILLE,
    capacityBonusMilli: 0,
    resolutions: Object.freeze([]),
  });
}

function failedWear(
  reason: Exclude<GearServiceReason, "worn">,
  benefit: GearBenefitId,
  inventory: CraftingInventory,
): GearServiceWearResult {
  return Object.freeze({
    ok: false,
    reason,
    benefit,
    inventory,
    gear: null,
    conditionSpent: 0,
  });
}

/** Defensive invariant used by tests and future catalog diagnostics. */
export function validateGearEffectDefinitions(): readonly string[] {
  const issues: string[] = [];
  const channelOwners = new Set<string>();
  for (const benefit of GEAR_BENEFIT_IDS) {
    const definition = GEAR_BENEFIT_DEFINITIONS[benefit];
    if (definition.id !== benefit) issues.push(`${benefit}: mismatched ID`);
    if (GEAR_SERVICE_WEAR[definition.kind] !== definition.serviceWear) {
      issues.push(`${benefit}: mismatched service wear`);
    }
    if (!Number.isSafeInteger(definition.serviceWear) || definition.serviceWear <= 0) {
      issues.push(`${benefit}: invalid service wear`);
    }
    for (const effect of definition.channels) {
      const ownerKey = `${effect.channel}:${definition.kind}`;
      if (channelOwners.has(ownerKey)) issues.push(`${benefit}: duplicate channel ${effect.channel}`);
      channelOwners.add(ownerKey);
      if (!Number.isSafeInteger(effect.value) || effect.value <= 0) {
        issues.push(`${benefit}: invalid value for ${effect.channel}`);
      }
      if (effect.mode === "cost-permille" && effect.value > NEUTRAL_PERMILLE) {
        issues.push(`${benefit}: cost modifier above neutral for ${effect.channel}`);
      }
    }
  }
  return Object.freeze(issues.sort());
}

export function gearIsSound(gear: CraftedGearItem): boolean {
  return Number.isSafeInteger(gear.condition)
    && gear.condition > 0
    && gear.condition <= CRAFTING_CONDITION_MAX;
}

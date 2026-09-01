import { FIXED_POINT } from "./types";

/**
 * Cargo categories already used by the player layer. This module deliberately
 * owns a structural copy of that vocabulary so the simulation does not need to
 * import UI or runtime state while it is still an unintegrated foundation.
 */
export const CARGO_ENVIRONMENT_PROPERTIES = [
  "ordinary",
  "heavy",
  "fragile",
  "perishable",
  "confidential",
] as const;

export type CargoEnvironmentProperty = (typeof CARGO_ENVIRONMENT_PROPERTIES)[number];

/** All unsigned material channels are fixed-point integers in the 0..1 range. */
export interface CargoMaterialTraits {
  readonly waterResistance: number;
  readonly heatResistance: number;
  readonly coldResistance: number;
  readonly magicResistance: number;
  readonly contaminationResistance: number;
  readonly spoilageResistance: number;
  /** Resistance to falls, tumbles, and abrupt loose-cargo collisions. */
  readonly impactResistance: number;
  /** How strongly a loose stack follows horizontal water velocity. */
  readonly currentCoupling: number;
  /** 0 sinks, 0.5 is neutral, and 1 floats strongly. */
  readonly buoyancy: number;
}

export type CargoMaterialTraitOverrides = Partial<CargoMaterialTraits>;

/**
 * A local, already-derived environmental sample for one fixed simulation step.
 * Unsigned fields use 0..1 fixed point; current components use -1..1.
 */
export interface CargoEnvironmentSample {
  readonly rain: number;
  readonly heat: number;
  readonly cold: number;
  readonly immersion: number;
  readonly currentX: number;
  readonly currentY: number;
  readonly magicalWaterFlux: number;
  /** Optional one-step drop/collision shock, from 0 (none) to 1 (severe). */
  readonly impact?: number;
}

export interface CargoEnvironmentStateInput {
  readonly condition: number;
  readonly contamination?: number;
  readonly decay?: number;
}

export interface CargoEnvironmentState {
  readonly condition: number;
  readonly contamination: number;
  readonly decay: number;
}

export type CargoEnvironmentCauseCode =
  | "rain-soak"
  | "heat-stress"
  | "cold-stress"
  | "impact-shock"
  | "water-immersion"
  | "magic-water"
  | "current-drift";

/** Canonical presentation order; evaluation never depends on object key order. */
export const CARGO_ENVIRONMENT_CAUSE_ORDER: readonly CargoEnvironmentCauseCode[] = [
  "rain-soak",
  "heat-stress",
  "cold-stress",
  "impact-shock",
  "water-immersion",
  "magic-water",
  "current-drift",
];

export interface CargoEnvironmentCause {
  readonly code: CargoEnvironmentCauseCode;
  readonly label: string;
  /** Raw per-step pressure before an already-depleted state clamps the change. */
  readonly conditionPressure: number;
  readonly contaminationPressure: number;
  readonly decayPressure: number;
  /** Fixed-point 0..1 strength used for warnings and HUD emphasis. */
  readonly magnitude: number;
  readonly preview: string;
}

export interface CargoEnvironmentChange {
  readonly conditionLoss: number;
  readonly contaminationGain: number;
  readonly decayGain: number;
}

/** Signed fixed-point force on loose cargo; positive lift means upward/afloat. */
export interface CargoEnvironmentForce {
  readonly x: number;
  readonly y: number;
  readonly lift: number;
  readonly magnitude: number;
}

export interface CargoEnvironmentEvaluationInput {
  readonly property: CargoEnvironmentProperty;
  readonly state: CargoEnvironmentStateInput;
  readonly environment: CargoEnvironmentSample;
  readonly traits?: CargoMaterialTraitOverrides;
}

export interface CargoEnvironmentEvaluation {
  readonly property: CargoEnvironmentProperty;
  readonly traits: CargoMaterialTraits;
  readonly environment: CargoEnvironmentSample;
  readonly nextState: CargoEnvironmentState;
  readonly change: CargoEnvironmentChange;
  readonly force: CargoEnvironmentForce;
  readonly causes: readonly CargoEnvironmentCause[];
}

const DEFAULT_MATERIAL_TRAITS: Readonly<Record<CargoEnvironmentProperty, CargoMaterialTraits>> = {
  ordinary: {
    waterResistance: 500_000,
    heatResistance: 500_000,
    coldResistance: 550_000,
    magicResistance: 300_000,
    contaminationResistance: 450_000,
    spoilageResistance: 800_000,
    impactResistance: 520_000,
    currentCoupling: 580_000,
    buoyancy: 500_000,
  },
  heavy: {
    waterResistance: 650_000,
    heatResistance: 720_000,
    coldResistance: 700_000,
    magicResistance: 320_000,
    contaminationResistance: 600_000,
    spoilageResistance: 900_000,
    impactResistance: 720_000,
    currentCoupling: 220_000,
    buoyancy: 150_000,
  },
  fragile: {
    waterResistance: 320_000,
    heatResistance: 380_000,
    coldResistance: 280_000,
    magicResistance: 260_000,
    contaminationResistance: 350_000,
    spoilageResistance: 700_000,
    impactResistance: 120_000,
    currentCoupling: 700_000,
    buoyancy: 650_000,
  },
  perishable: {
    waterResistance: 260_000,
    heatResistance: 150_000,
    coldResistance: 450_000,
    magicResistance: 200_000,
    contaminationResistance: 200_000,
    spoilageResistance: 150_000,
    impactResistance: 380_000,
    currentCoupling: 550_000,
    buoyancy: 520_000,
  },
  confidential: {
    waterResistance: 780_000,
    heatResistance: 580_000,
    coldResistance: 620_000,
    // Salt-magic can still rewrite even well-sealed paper and data capsules.
    magicResistance: 120_000,
    contaminationResistance: 650_000,
    spoilageResistance: 920_000,
    impactResistance: 450_000,
    currentCoupling: 420_000,
    buoyancy: 450_000,
  },
};

interface CausePressure {
  readonly code: Exclude<CargoEnvironmentCauseCode, "current-drift">;
  readonly magnitude: number;
  readonly conditionPressure: number;
  readonly contaminationPressure: number;
  readonly decayPressure: number;
}

const CAUSE_LABELS: Readonly<Record<CargoEnvironmentCauseCode, string>> = {
  "rain-soak": "Rain soak",
  "heat-stress": "Heat stress",
  "cold-stress": "Cold stress",
  "impact-shock": "Impact shock",
  "water-immersion": "Water immersion",
  "magic-water": "Magic-water flux",
  "current-drift": "Current drift",
};

const CONDITION_RATE = {
  rain: 180,
  heat: 260,
  cold: 220,
  immersion: 520,
  magic: 360,
  impact: 900,
} as const;

const CONTAMINATION_RATE = {
  rain: 180,
  immersion: 560,
  magic: 420,
} as const;

const DECAY_RATE = {
  rain: 240,
  heat: 720,
  immersion: 420,
  magic: 300,
} as const;

export function resolveCargoMaterialTraits(
  property: CargoEnvironmentProperty,
  overrides: CargoMaterialTraitOverrides = {},
): CargoMaterialTraits {
  const base = DEFAULT_MATERIAL_TRAITS[property];
  return {
    waterResistance: unit(overrides.waterResistance ?? base.waterResistance),
    heatResistance: unit(overrides.heatResistance ?? base.heatResistance),
    coldResistance: unit(overrides.coldResistance ?? base.coldResistance),
    magicResistance: unit(overrides.magicResistance ?? base.magicResistance),
    contaminationResistance: unit(
      overrides.contaminationResistance ?? base.contaminationResistance,
    ),
    spoilageResistance: unit(overrides.spoilageResistance ?? base.spoilageResistance),
    impactResistance: unit(overrides.impactResistance ?? base.impactResistance),
    currentCoupling: unit(overrides.currentCoupling ?? base.currentCoupling),
    buoyancy: unit(overrides.buoyancy ?? base.buoyancy),
  };
}

/**
 * Evaluate one fixed simulation step without mutation, clocks, randomness, or
 * hidden world reads. The deliberately small rates make the result safe to
 * layer beside existing handling damage during a later integration phase.
 */
export function evaluateCargoEnvironment(
  input: CargoEnvironmentEvaluationInput,
): CargoEnvironmentEvaluation {
  const traits = resolveCargoMaterialTraits(input.property, input.traits);
  const environment = normalizeEnvironment(input.environment);
  const state: CargoEnvironmentState = {
    condition: unit(input.state.condition),
    contamination: unit(input.state.contamination ?? 0),
    decay: unit(input.state.decay ?? 0),
  };

  const waterVulnerability = FIXED_POINT - traits.waterResistance;
  const heatVulnerability = FIXED_POINT - traits.heatResistance;
  const coldVulnerability = FIXED_POINT - traits.coldResistance;
  const magicVulnerability = FIXED_POINT - traits.magicResistance;
  const impactVulnerability = FIXED_POINT - traits.impactResistance;
  const contaminationVulnerability = FIXED_POINT - traits.contaminationResistance;
  const spoilageVulnerability = FIXED_POINT - traits.spoilageResistance;

  const rainWetness = multiplyUnit(environment.rain, waterVulnerability);
  const immersionWetness = multiplyUnit(environment.immersion, waterVulnerability);
  const heatStress = multiplyUnit(environment.heat, heatVulnerability);
  const coldStress = multiplyUnit(environment.cold, coldVulnerability);
  const magicStress = multiplyUnit(environment.magicalWaterFlux, magicVulnerability);
  const impactStress = multiplyUnit(environment.impact ?? 0, impactVulnerability);

  const pressures: CausePressure[] = [
    {
      code: "rain-soak",
      magnitude: environment.rain,
      conditionPressure: applyRate(rainWetness, CONDITION_RATE.rain),
      contaminationPressure: applyRate(
        multiplyUnit(environment.rain, contaminationVulnerability),
        CONTAMINATION_RATE.rain,
      ),
      decayPressure: applyRate(
        multiplyUnit(rainWetness, spoilageVulnerability),
        DECAY_RATE.rain,
      ),
    },
    {
      code: "heat-stress",
      magnitude: environment.heat,
      conditionPressure: applyRate(heatStress, CONDITION_RATE.heat),
      contaminationPressure: 0,
      decayPressure: applyRate(
        multiplyUnit(environment.heat, spoilageVulnerability),
        DECAY_RATE.heat,
      ),
    },
    {
      code: "cold-stress",
      magnitude: environment.cold,
      conditionPressure: applyRate(coldStress, CONDITION_RATE.cold),
      contaminationPressure: 0,
      // Cold can make a load brittle, but does not secretly accelerate spoilage.
      decayPressure: 0,
    },
    {
      code: "impact-shock",
      magnitude: environment.impact ?? 0,
      conditionPressure: applyRate(impactStress, CONDITION_RATE.impact),
      contaminationPressure: 0,
      decayPressure: 0,
    },
    {
      code: "water-immersion",
      magnitude: environment.immersion,
      conditionPressure: applyRate(immersionWetness, CONDITION_RATE.immersion),
      contaminationPressure: applyRate(
        multiplyUnit(environment.immersion, contaminationVulnerability),
        CONTAMINATION_RATE.immersion,
      ),
      decayPressure: applyRate(
        multiplyUnit(immersionWetness, spoilageVulnerability),
        DECAY_RATE.immersion,
      ),
    },
    {
      code: "magic-water",
      magnitude: environment.magicalWaterFlux,
      conditionPressure: applyRate(magicStress, CONDITION_RATE.magic),
      contaminationPressure: applyRate(
        multiplyUnit(magicStress, contaminationVulnerability),
        CONTAMINATION_RATE.magic,
      ),
      decayPressure: applyRate(
        multiplyUnit(magicStress, spoilageVulnerability),
        DECAY_RATE.magic,
      ),
    },
  ];

  const conditionPressure = sumPressure(pressures, "conditionPressure");
  const contaminationPressure = sumPressure(pressures, "contaminationPressure");
  const decayPressure = sumPressure(pressures, "decayPressure");
  const change: CargoEnvironmentChange = {
    conditionLoss: Math.min(state.condition, conditionPressure),
    contaminationGain: Math.min(FIXED_POINT - state.contamination, contaminationPressure),
    decayGain: Math.min(FIXED_POINT - state.decay, decayPressure),
  };

  const force = deriveForce(environment, traits, magicVulnerability);
  const causes: CargoEnvironmentCause[] = pressures
    .filter(hasPressure)
    .map((pressure) => describePressure(pressure, input.property));
  if (force.x !== 0 || force.y !== 0) {
    causes.push({
      code: "current-drift",
      label: CAUSE_LABELS["current-drift"],
      conditionPressure: 0,
      contaminationPressure: 0,
      decayPressure: 0,
      magnitude: force.magnitude,
      preview: `Current is pulling loose cargo ${cardinalDirection(force.x, force.y)}; immersion and material weight set the force.`,
    });
  }

  return {
    property: input.property,
    traits,
    environment,
    nextState: {
      condition: state.condition - change.conditionLoss,
      contamination: state.contamination + change.contaminationGain,
      decay: state.decay + change.decayGain,
    },
    change,
    force,
    causes,
  };
}

function normalizeEnvironment(environment: CargoEnvironmentSample): CargoEnvironmentSample {
  return {
    rain: unit(environment.rain),
    heat: unit(environment.heat),
    cold: unit(environment.cold),
    immersion: unit(environment.immersion),
    currentX: signedUnit(environment.currentX),
    currentY: signedUnit(environment.currentY),
    magicalWaterFlux: unit(environment.magicalWaterFlux),
    impact: unit(environment.impact ?? 0),
  };
}

function deriveForce(
  environment: CargoEnvironmentSample,
  traits: CargoMaterialTraits,
  magicVulnerability: number,
): CargoEnvironmentForce {
  const magicCoupling = Math.trunc(
    multiplyUnit(environment.magicalWaterFlux, magicVulnerability) / 4,
  );
  const coupling = unit(traits.currentCoupling + magicCoupling);
  const submergedCoupling = multiplyUnit(environment.immersion, coupling);
  const x = multiplySignedUnit(environment.currentX, submergedCoupling);
  const y = multiplySignedUnit(environment.currentY, submergedCoupling);
  const buoyancyBias = traits.buoyancy * 2 - FIXED_POINT;
  const waterLift = multiplySignedUnit(buoyancyBias, environment.immersion);
  const magicLift = Math.trunc(
    multiplyUnit(environment.magicalWaterFlux, magicVulnerability) / 4,
  );
  const lift = signedUnit(waterLift + magicLift);

  return {
    x,
    y,
    lift,
    magnitude: unit(Math.trunc(Math.hypot(x, y))),
  };
}

function describePressure(
  pressure: CausePressure,
  property: CargoEnvironmentProperty,
): CargoEnvironmentCause {
  return {
    ...pressure,
    label: CAUSE_LABELS[pressure.code],
    preview: causePreview(pressure.code, pressure.magnitude, property),
  };
}

function causePreview(
  code: CausePressure["code"],
  magnitude: number,
  property: CargoEnvironmentProperty,
): string {
  const strength = magnitude < 250_000 ? "Light" : magnitude < 650_000 ? "Steady" : "Severe";
  switch (code) {
    case "rain-soak":
      return `${strength} rain is wetting this ${property} load; covers and water resistance limit the harm.`;
    case "heat-stress":
      return `${strength} heat is stressing this ${property} load; perishables build decay fastest.`;
    case "cold-stress":
      return `${strength} cold is making this ${property} load brittle, but is not adding spoilage.`;
    case "impact-shock":
      return `${strength} impact is jolting this ${property} load; fragile materials lose condition fastest.`;
    case "water-immersion":
      return `${strength} immersion is waterlogging this ${property} load and can contaminate it.`;
    case "magic-water":
      return `${strength} magic-water flux is rewriting this ${property} load's material memory.`;
  }
}

function cardinalDirection(x: number, y: number): string {
  if (Math.abs(x) >= Math.abs(y)) return x >= 0 ? "east" : "west";
  return y >= 0 ? "south" : "north";
}

function hasPressure(pressure: CausePressure): boolean {
  return pressure.conditionPressure > 0
    || pressure.contaminationPressure > 0
    || pressure.decayPressure > 0;
}

function sumPressure(
  pressures: readonly CausePressure[],
  key: "conditionPressure" | "contaminationPressure" | "decayPressure",
): number {
  return pressures.reduce((total, pressure) => total + pressure[key], 0);
}

function applyRate(signal: number, rate: number): number {
  return Math.trunc((signal * rate) / FIXED_POINT);
}

function multiplyUnit(first: number, second: number): number {
  return Math.trunc((unit(first) * unit(second)) / FIXED_POINT);
}

function multiplySignedUnit(signed: number, unsigned: number): number {
  return Math.trunc((signedUnit(signed) * unit(unsigned)) / FIXED_POINT);
}

function unit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(FIXED_POINT, Math.trunc(value)));
}

function signedUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-FIXED_POINT, Math.min(FIXED_POINT, Math.trunc(value)));
}

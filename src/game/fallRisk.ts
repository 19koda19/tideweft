import { keyedRandomInt, mixUint32, type RootSeed } from "../sim/rng";
import { FIXED_POINT } from "../sim/types";

/**
 * Pure, entry-scoped fall forecasting.
 *
 * The runtime should call `evaluateFallRiskOnEntry` once when a traversal
 * crosses into a hazardous tile or edge. It must persist `nextTraversalOrdinal`
 * together with any accepted outcome. Re-evaluating the same saved input is
 * intentionally identical, so save/reload cannot reroll a bad crossing.
 *
 * All pressures, mitigations, chances, and quoted shocks are integer fixed
 * point values in the inclusive 0..1,000,000 range unless noted otherwise.
 * The evaluator never changes the player, cargo, terrain, or its input object.
 */

export const FALL_RISK_VERSION = 1 as const;
export const FALL_RISK_DOMAIN = 0x4641_4c4c;
export const SERIOUS_FALL_HAZARD = 500_000;
export const MAX_FALL_LOAD_RATIO = 2 * FIXED_POINT;

export const FALL_RISK_CAUSE_ORDER = [
  "invalid-input",
  "unsupported-gap",
  "elevation-drop",
  "loose-rock",
  "steep-grade",
  "slippery-surface",
  "strong-current",
  "deep-water",
  "bramble-vines",
  "high-wind",
  "sharp-turn",
  "low-stability",
  "heavy-load",
  "travel-pace",
] as const;

export type FallRiskCauseCode = (typeof FALL_RISK_CAUSE_ORDER)[number];
export type FallRiskBand = "none" | "low" | "guarded" | "high" | "severe" | "critical" | "certain";
export type FallEntryKind = "safe" | "hazardous-tile" | "hazardous-edge";
export type FallTravelPace = "rest" | "steady" | "swift";
export type FallMotion = "knockback" | "swept" | "impact";
export type FallRiskOutcome =
  | "not-evaluated"
  | "held"
  | "stumbled"
  | "fell"
  | "invalid-input"
  | "ordinal-exhausted";

export interface FallRiskEntry {
  readonly kind: FallEntryKind;
  readonly fromTileId: number;
  readonly toTileId: number;
}

/**
 * Local pressure sampled for the entered tile/edge. The final three channels
 * are the shared seam for future glacier, ravine, ladder, and rope systems:
 * glaciers contribute `surfaceSlip`, ravines contribute `unsupportedGap` and
 * `elevationDrop`, while secured ladders/ropes contribute fixture support.
 */
export interface FallHazardPressure {
  readonly grade: number;
  readonly rock: number;
  readonly current: number;
  readonly depth: number;
  readonly brambleVines: number;
  readonly elevationDrop?: number;
  readonly unsupportedGap?: number;
  readonly surfaceSlip?: number;
}

export interface FallRiskPorter {
  readonly stability: number;
  /** 1,000,000 means the currently available carrying capacity is full. */
  readonly loadRatio: number;
  readonly pace: FallTravelPace;
  /** Absolute local wind pressure, already normalized to fixed point. */
  readonly wind: number;
  /** Heading-change pressure for this entry: straight 0, reversal 1,000,000. */
  readonly turnPressure?: number;
  readonly brace: boolean;
  /** Grip supplied by shoes/cleats, fixed point 0..1. */
  readonly footwearGrip: number;
  /** Support supplied by a mat, ladder, anchored rope, or other fixture. */
  readonly fixtureSupport: number;
}

export interface FallRiskEvaluationInput {
  readonly seed: RootSeed;
  readonly actorId: number;
  readonly traversalOrdinal: number;
  readonly entry: FallRiskEntry;
  readonly hazards: FallHazardPressure;
  readonly porter: FallRiskPorter;
}

export interface FallRiskCause {
  readonly code: FallRiskCauseCode;
  readonly label: string;
  /** Normalized source intensity before weighting. */
  readonly intensity: number;
  /** Fixed-point contribution to the unmitigated fall chance. */
  readonly contribution: number;
}

export interface FallRiskMitigation {
  readonly brace: number;
  readonly footwear: number;
  readonly fixture: number;
  readonly total: number;
}

export interface FallRiskForecast {
  /** Chance of falling on this entry, fixed point 0..1. */
  readonly chance: number;
  /**
   * Width of the near-miss interval immediately above `chance`. The shared
   * roll falls below `chance`, stumbles below `chance + stumbleChance`, and
   * otherwise holds, so a reload cannot independently reroll either outcome.
   */
  readonly stumbleChance: number;
  readonly band: FallRiskBand;
  /** Compound environmental severity, fixed point 0..1. */
  readonly hazardSeverity: number;
  readonly seriousHazard: boolean;
  readonly guaranteedByZeroStability: boolean;
  readonly causes: readonly FallRiskCause[];
  readonly primaryCause: FallRiskCauseCode | null;
  readonly mitigation: FallRiskMitigation;
}

/**
 * A deterministic quote for what should be applied if `outcome` is `fell`.
 * Cargo shock is an impact input, not direct condition loss; cargo material
 * resistance remains the responsibility of the cargo-environment system.
 */
export interface FallConsequenceQuote {
  readonly severity: "stumble" | "fall";
  readonly motion: FallMotion;
  readonly displacementSteps: number;
  readonly staminaShock: number;
  readonly stabilityShock: number;
  readonly cargoShock: number;
  /** Vertical exposure available to future injury/ravine resolution. */
  readonly verticalExposure: number;
}

export interface FallRiskEvaluation {
  readonly version: typeof FALL_RISK_VERSION;
  /** False means the caller must reject the hazardous entry without mutation. */
  readonly valid: boolean;
  readonly evaluated: boolean;
  readonly outcome: FallRiskOutcome;
  readonly fell: boolean;
  readonly stumbled: boolean;
  /** Null for a safe entry, otherwise the exact ordinal used for this roll. */
  readonly usedTraversalOrdinal: number | null;
  /** Persist this with an accepted hazardous-entry result. */
  readonly nextTraversalOrdinal: number;
  /**
   * The maximum safe ordinal is a terminal sentinel, never a roll address.
   * A hazardous entry with this flag must remain blocked until a future save
   * migration introduces a fresh counter era.
   */
  readonly ordinalExhausted: boolean;
  /** Fixed-point roll 0..999,999, or null when no hazardous entry occurred. */
  readonly roll: number | null;
  /** Stable seed for one exactly-once sound/text/color event after a mishap. */
  readonly feedbackEventId: number | null;
  readonly forecast: FallRiskForecast;
  /** Null for safe, invalid, or exhausted entries. Apply only when `fell` is true. */
  readonly consequenceQuote: FallConsequenceQuote | null;
}

interface NormalizedHazards {
  readonly grade: number;
  readonly rock: number;
  readonly current: number;
  readonly depth: number;
  readonly brambleVines: number;
  readonly elevationDrop: number;
  readonly unsupportedGap: number;
  readonly surfaceSlip: number;
}

interface NormalizedPorter {
  readonly stability: number;
  readonly loadRatio: number;
  readonly pace: FallTravelPace;
  readonly wind: number;
  readonly turnPressure: number;
  readonly brace: boolean;
  readonly footwearGrip: number;
  readonly fixtureSupport: number;
}

interface CauseCandidate {
  readonly code: FallRiskCauseCode;
  readonly label: string;
  readonly intensity: number;
  readonly weight: number;
}

const CAUSE_PRIORITY = new Map<FallRiskCauseCode, number>(
  FALL_RISK_CAUSE_ORDER.map((code, index) => [code, index]),
);

const EMPTY_MITIGATION: FallRiskMitigation = {
  brace: 0,
  footwear: 0,
  fixture: 0,
  total: 0,
};

const EMPTY_FORECAST: FallRiskForecast = {
  chance: 0,
  stumbleChance: 0,
  band: "none",
  hazardSeverity: 0,
  seriousHazard: false,
  guaranteedByZeroStability: false,
  causes: [],
  primaryCause: null,
  mitigation: EMPTY_MITIGATION,
};

const INVALID_FORECAST: FallRiskForecast = {
  chance: FIXED_POINT,
  stumbleChance: 0,
  band: "certain",
  hazardSeverity: FIXED_POINT,
  seriousHazard: true,
  guaranteedByZeroStability: false,
  causes: [{
    code: "invalid-input",
    label: "Untrusted traversal input",
    intensity: FIXED_POINT,
    contribution: FIXED_POINT,
  }],
  primaryCause: "invalid-input",
  mitigation: EMPTY_MITIGATION,
};

const ROLL_PURPOSE = 1;
const STAMINA_SHOCK_PURPOSE = 2;
const STABILITY_SHOCK_PURPOSE = 3;
const CARGO_SHOCK_PURPOSE = 4;
const DISPLACEMENT_PURPOSE = 5;
const FEEDBACK_EVENT_PURPOSE = 6;

function clampUnit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= FIXED_POINT) return FIXED_POINT;
  return Math.trunc(value);
}

function clampLoadRatio(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= MAX_FALL_LOAD_RATIO) return MAX_FALL_LOAD_RATIO;
  return Math.trunc(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUnitInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= FIXED_POINT;
}

function isLoadRatioInteger(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) >= 0
    && (value as number) <= MAX_FALL_LOAD_RATIO;
}

function isSafeAddress(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

function isRootSeed(value: unknown): value is RootSeed {
  return Array.isArray(value)
    && value.length === 4
    && value.every((word) => Number.isSafeInteger(word) && word >= 0 && word <= 0xffff_ffff);
}

function optionalUnitInteger(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  return value === undefined || isUnitInteger(value);
}

function isFallRiskInput(value: unknown): value is FallRiskEvaluationInput {
  if (!isRecord(value)) return false;
  const entry = value.entry;
  const hazards = value.hazards;
  const porter = value.porter;
  if (!isRootSeed(value.seed)
    || !isSafeAddress(value.actorId)
    || !Number.isSafeInteger(value.traversalOrdinal)
    || (value.traversalOrdinal as number) < 0
    || !isRecord(entry)
    || (entry.kind !== "safe"
      && entry.kind !== "hazardous-tile"
      && entry.kind !== "hazardous-edge")
    || !isSafeAddress(entry.fromTileId)
    || !isSafeAddress(entry.toTileId)
    || !isRecord(hazards)
    || !isUnitInteger(hazards.grade)
    || !isUnitInteger(hazards.rock)
    || !isUnitInteger(hazards.current)
    || !isUnitInteger(hazards.depth)
    || !isUnitInteger(hazards.brambleVines)
    || !optionalUnitInteger(hazards, "elevationDrop")
    || !optionalUnitInteger(hazards, "unsupportedGap")
    || !optionalUnitInteger(hazards, "surfaceSlip")
    || !isRecord(porter)
    || !isUnitInteger(porter.stability)
    || !isLoadRatioInteger(porter.loadRatio)
    || (porter.pace !== "rest" && porter.pace !== "steady" && porter.pace !== "swift")
    || !isUnitInteger(porter.wind)
    || !optionalUnitInteger(porter, "turnPressure")
    || typeof porter.brace !== "boolean"
    || !isUnitInteger(porter.footwearGrip)
    || !isUnitInteger(porter.fixtureSupport)) {
    return false;
  }
  return true;
}

function retainedOrdinal(value: unknown): number {
  if (!isRecord(value)
    || !Number.isSafeInteger(value.traversalOrdinal)
    || (value.traversalOrdinal as number) < 0) {
    return Number.MAX_SAFE_INTEGER;
  }
  return value.traversalOrdinal as number;
}

function invalidEvaluation(input: unknown): FallRiskEvaluation {
  const ordinal = retainedOrdinal(input);
  return {
    version: FALL_RISK_VERSION,
    valid: false,
    evaluated: false,
    outcome: "invalid-input",
    fell: false,
    stumbled: false,
    usedTraversalOrdinal: null,
    nextTraversalOrdinal: ordinal,
    ordinalExhausted: ordinal === Number.MAX_SAFE_INTEGER,
    roll: null,
    feedbackEventId: null,
    forecast: INVALID_FORECAST,
    consequenceQuote: null,
  };
}

function multiplyUnit(left: number, right: number): number {
  return Math.trunc((clampUnit(left) * clampUnit(right)) / FIXED_POINT);
}

function weightedRatio(ratio: number, weight: number): number {
  return Math.trunc((clampLoadRatio(ratio) * clampUnit(weight)) / FIXED_POINT);
}

function foldSafeInteger(value: number): number {
  const low = value >>> 0;
  const high = Math.floor(value / 0x1_0000_0000) >>> 0;
  return mixUint32(low ^ Math.imul(high, 0x9e37_79b1));
}

function normalizeHazards(hazards: FallHazardPressure): NormalizedHazards {
  return {
    grade: clampUnit(hazards.grade),
    rock: clampUnit(hazards.rock),
    current: clampUnit(hazards.current),
    depth: clampUnit(hazards.depth),
    brambleVines: clampUnit(hazards.brambleVines),
    elevationDrop: clampUnit(hazards.elevationDrop ?? 0),
    unsupportedGap: clampUnit(hazards.unsupportedGap ?? 0),
    surfaceSlip: clampUnit(hazards.surfaceSlip ?? 0),
  };
}

function normalizePorter(porter: FallRiskPorter): NormalizedPorter {
  const pace: FallTravelPace = porter.pace === "rest" || porter.pace === "swift"
    ? porter.pace
    : "steady";
  return {
    stability: clampUnit(porter.stability),
    loadRatio: clampLoadRatio(porter.loadRatio),
    pace,
    wind: clampUnit(porter.wind),
    turnPressure: clampUnit(porter.turnPressure ?? 0),
    brace: porter.brace === true,
    footwearGrip: clampUnit(porter.footwearGrip),
    fixtureSupport: clampUnit(porter.fixtureSupport),
  };
}

function paceContribution(pace: FallTravelPace): number {
  switch (pace) {
    case "rest":
      return 0;
    case "steady":
      return 0;
    case "swift":
      return 135_000;
  }
}

function paceIntensity(pace: FallTravelPace): number {
  switch (pace) {
    case "rest":
      return 0;
    case "steady":
      return 0;
    case "swift":
      return FIXED_POINT;
  }
}

function buildCauses(
  hazards: NormalizedHazards,
  porter: NormalizedPorter,
  hazardSeverity: number,
): FallRiskCause[] {
  const stabilityDeficit = FIXED_POINT - porter.stability;
  const loadPressure = Math.max(0, porter.loadRatio - 350_000);
  const contextualStability = multiplyUnit(stabilityDeficit, hazardSeverity);
  const contextualLoad = Math.trunc((loadPressure * hazardSeverity) / FIXED_POINT);
  const contextualPace = multiplyUnit(paceIntensity(porter.pace), hazardSeverity);
  const turnContext = clampUnit(250_000 + hazardSeverity);
  const contextualTurn = multiplyUnit(porter.turnPressure, turnContext);
  const candidates: readonly CauseCandidate[] = [
    { code: "unsupported-gap", label: "Unsupported gap", intensity: hazards.unsupportedGap, weight: 600_000 },
    { code: "elevation-drop", label: "Exposed drop", intensity: hazards.elevationDrop, weight: 330_000 },
    { code: "loose-rock", label: "Loose rock", intensity: hazards.rock, weight: 220_000 },
    { code: "steep-grade", label: "Steep grade", intensity: hazards.grade, weight: 230_000 },
    { code: "slippery-surface", label: "Slippery surface", intensity: hazards.surfaceSlip, weight: 190_000 },
    { code: "strong-current", label: "Strong current", intensity: hazards.current, weight: 170_000 },
    { code: "deep-water", label: "Deep water", intensity: hazards.depth, weight: 150_000 },
    { code: "bramble-vines", label: "Grabbing bramble and vines", intensity: hazards.brambleVines, weight: 110_000 },
    { code: "high-wind", label: "High wind", intensity: porter.wind, weight: 90_000 },
    { code: "sharp-turn", label: "Sharp turn", intensity: contextualTurn, weight: 120_000 },
    { code: "low-stability", label: "Low stability on difficult footing", intensity: contextualStability, weight: 360_000 },
    { code: "heavy-load", label: "Heavy load on difficult footing", intensity: Math.min(FIXED_POINT, contextualLoad), weight: 150_000 },
    { code: "travel-pace", label: "Swift pace on difficult footing", intensity: contextualPace, weight: 0 },
  ];

  const causes = candidates.flatMap((candidate): FallRiskCause[] => {
    const contribution = candidate.code === "heavy-load"
      ? weightedRatio(contextualLoad, candidate.weight)
      : candidate.code === "travel-pace"
        ? multiplyUnit(paceContribution(porter.pace), hazardSeverity)
        : multiplyUnit(candidate.intensity, candidate.weight);
    if (candidate.intensity <= 0 || contribution <= 0) return [];
    return [{
      code: candidate.code,
      label: candidate.label,
      intensity: candidate.intensity,
      contribution,
    }];
  });

  causes.sort((left, right) => right.contribution - left.contribution
    || (CAUSE_PRIORITY.get(left.code) ?? 0) - (CAUSE_PRIORITY.get(right.code) ?? 0));
  return causes;
}

function compoundHazardSeverity(hazards: NormalizedHazards, wind: number): number {
  const ordered = [
    hazards.grade,
    hazards.rock,
    hazards.current,
    hazards.depth,
    hazards.brambleVines,
    hazards.elevationDrop,
    hazards.unsupportedGap,
    hazards.surfaceSlip,
    wind,
  ].sort((left, right) => right - left);
  return clampUnit(
    (ordered[0] ?? 0)
      + Math.trunc((ordered[1] ?? 0) / 2)
      + Math.trunc((ordered[2] ?? 0) / 4),
  );
}

function riskBand(chance: number): FallRiskBand {
  if (chance <= 0) return "none";
  if (chance < 100_000) return "low";
  if (chance < 250_000) return "guarded";
  if (chance < 500_000) return "high";
  if (chance < 750_000) return "severe";
  if (chance < FIXED_POINT) return "critical";
  return "certain";
}

function buildForecast(hazards: NormalizedHazards, porter: NormalizedPorter): FallRiskForecast {
  const hazardSeverity = compoundHazardSeverity(hazards, porter.wind);
  const causes = buildCauses(hazards, porter, hazardSeverity);
  const unmitigated = causes.reduce((sum, cause) => sum + cause.contribution, 0);
  const mitigation: FallRiskMitigation = {
    brace: porter.brace ? 180_000 : 0,
    footwear: multiplyUnit(porter.footwearGrip, 160_000),
    fixture: multiplyUnit(porter.fixtureSupport, 340_000),
    total: 0,
  };
  const totalMitigation = clampUnit(mitigation.brace + mitigation.footwear + mitigation.fixture);
  const resolvedMitigation: FallRiskMitigation = { ...mitigation, total: totalMitigation };
  const seriousHazard = hazardSeverity >= SERIOUS_FALL_HAZARD;
  const guaranteedByZeroStability = seriousHazard && porter.stability === 0;
  const chance = guaranteedByZeroStability
    ? FIXED_POINT
    : clampUnit(unmitigated - totalMitigation);
  const residualFooting = Math.max(0, hazardSeverity - totalMitigation);
  const stumbleChance = Math.min(
    FIXED_POINT - chance,
    multiplyUnit(residualFooting, 180_000),
  );

  return {
    chance,
    stumbleChance,
    band: riskBand(chance),
    hazardSeverity,
    seriousHazard,
    guaranteedByZeroStability,
    causes,
    primaryCause: causes[0]?.code ?? null,
    mitigation: resolvedMitigation,
  };
}

function edgeEntity(input: FallRiskEvaluationInput): number {
  const actor = foldSafeInteger(input.actorId);
  const from = foldSafeInteger(input.entry.fromTileId);
  const to = foldSafeInteger(input.entry.toTileId);
  return mixUint32(
    actor
      ^ Math.imul(from, 0x9e37_79b1)
      ^ Math.imul(to, 0x85eb_ca6b),
  );
}

function quoteMotion(hazards: NormalizedHazards): FallMotion {
  const water = hazards.current + hazards.depth;
  const vertical = hazards.unsupportedGap * 2 + hazards.elevationDrop * 2
    + hazards.rock + hazards.surfaceSlip;
  if (hazards.current >= 250_000 && water > vertical) return "swept";
  if (hazards.unsupportedGap >= 150_000
    || hazards.elevationDrop >= 200_000
    || hazards.rock >= 550_000) return "impact";
  return "knockback";
}

function quoteConsequence(
  input: FallRiskEvaluationInput,
  ordinal: number,
  hazards: NormalizedHazards,
  porter: NormalizedPorter,
  forecast: FallRiskForecast,
  severity: "stumble" | "fall",
): FallConsequenceQuote {
  const entity = edgeEntity(input);
  const motion = quoteMotion(hazards);
  const staminaJitter = keyedRandomInt(
    input.seed,
    FALL_RISK_DOMAIN,
    ordinal,
    entity,
    STAMINA_SHOCK_PURPOSE,
    0,
    35_000,
  );
  const stabilityJitter = keyedRandomInt(
    input.seed,
    FALL_RISK_DOMAIN,
    ordinal,
    entity,
    STABILITY_SHOCK_PURPOSE,
    0,
    40_000,
  );
  const cargoJitter = keyedRandomInt(
    input.seed,
    FALL_RISK_DOMAIN,
    ordinal,
    entity,
    CARGO_SHOCK_PURPOSE,
    0,
    45_000,
  );
  const displacementJitter = keyedRandomInt(
    input.seed,
    FALL_RISK_DOMAIN,
    ordinal,
    entity,
    DISPLACEMENT_PURPOSE,
    0,
    2,
  );
  const motionStamina = motion === "impact" ? 120_000 : motion === "swept" ? 90_000 : 60_000;
  const motionStability = motion === "impact" ? 220_000 : motion === "swept" ? 180_000 : 140_000;
  const motionCargo = motion === "impact" ? 260_000 : motion === "swept" ? 170_000 : 110_000;
  const loadShock = weightedRatio(porter.loadRatio, 90_000);
  const verticalExposure = clampUnit(
    hazards.elevationDrop + Math.trunc(hazards.unsupportedGap / 2),
  );
  const displacementSteps = motion === "impact"
    ? (verticalExposure >= 500_000 ? 1 : 0)
    : motion === "swept"
      ? Math.min(4, 1 + displacementJitter + (hazards.current >= 750_000 ? 1 : 0))
      : Math.min(2, 1 + (forecast.hazardSeverity >= 750_000 && displacementJitter > 0 ? 1 : 0));

  const fallQuote: FallConsequenceQuote = {
    severity: "fall",
    motion,
    displacementSteps,
    staminaShock: clampUnit(
      motionStamina + multiplyUnit(forecast.hazardSeverity, 250_000) + staminaJitter,
    ),
    stabilityShock: clampUnit(
      motionStability + multiplyUnit(forecast.hazardSeverity, 400_000) + stabilityJitter,
    ),
    cargoShock: clampUnit(
      motionCargo + multiplyUnit(forecast.hazardSeverity, 360_000) + loadShock + cargoJitter,
    ),
    verticalExposure,
  };
  if (severity === "fall") return fallQuote;
  return {
    severity: "stumble",
    motion,
    displacementSteps: 0,
    staminaShock: multiplyUnit(fallQuote.staminaShock, 350_000),
    stabilityShock: multiplyUnit(fallQuote.stabilityShock, 500_000),
    cargoShock: multiplyUnit(fallQuote.cargoShock, 250_000),
    verticalExposure: 0,
  };
}

/**
 * Resolve exactly one traversal-entry risk without mutating any state.
 * `safe` entries are deliberate no-ops and do not consume the ordinal.
 */
export function evaluateFallRiskOnEntry(
  input: FallRiskEvaluationInput,
): FallRiskEvaluation {
  const candidate: unknown = input;
  if (!isFallRiskInput(candidate)) return invalidEvaluation(candidate);
  const ordinal = candidate.traversalOrdinal;
  if (input.entry.kind === "safe") {
    return {
      version: FALL_RISK_VERSION,
      valid: true,
      evaluated: false,
      outcome: "not-evaluated",
      fell: false,
      stumbled: false,
      usedTraversalOrdinal: null,
      nextTraversalOrdinal: ordinal,
      ordinalExhausted: ordinal === Number.MAX_SAFE_INTEGER,
      roll: null,
      feedbackEventId: null,
      forecast: EMPTY_FORECAST,
      consequenceQuote: null,
    };
  }

  const hazards = normalizeHazards(input.hazards);
  const porter = normalizePorter(input.porter);
  const forecast = buildForecast(hazards, porter);
  if (ordinal === Number.MAX_SAFE_INTEGER) {
    return {
      version: FALL_RISK_VERSION,
      valid: false,
      evaluated: false,
      outcome: "ordinal-exhausted",
      fell: false,
      stumbled: false,
      usedTraversalOrdinal: null,
      nextTraversalOrdinal: Number.MAX_SAFE_INTEGER,
      ordinalExhausted: true,
      roll: null,
      feedbackEventId: null,
      forecast,
      consequenceQuote: null,
    };
  }
  const entity = edgeEntity(input);
  const roll = keyedRandomInt(
    input.seed,
    FALL_RISK_DOMAIN,
    ordinal,
    entity,
    ROLL_PURPOSE,
    0,
    FIXED_POINT - 1,
  );
  const fell = forecast.guaranteedByZeroStability || roll < forecast.chance;
  const stumbled = !fell && roll < forecast.chance + forecast.stumbleChance;
  const outcome: FallRiskOutcome = fell ? "fell" : stumbled ? "stumbled" : "held";
  const feedbackEventId = fell || stumbled
    ? keyedRandomInt(
      input.seed,
      FALL_RISK_DOMAIN,
      ordinal,
      entity,
      FEEDBACK_EVENT_PURPOSE,
      1,
      0xffff_ffff,
    )
    : null;

  return {
    version: FALL_RISK_VERSION,
    valid: true,
    evaluated: true,
    outcome,
    fell,
    stumbled,
    usedTraversalOrdinal: ordinal,
    nextTraversalOrdinal: ordinal + 1,
    ordinalExhausted: ordinal + 1 === Number.MAX_SAFE_INTEGER,
    roll,
    feedbackEventId,
    forecast,
    consequenceQuote: fell || stumbled
      ? quoteConsequence(input, ordinal, hazards, porter, forecast, fell ? "fall" : "stumble")
      : null,
  };
}

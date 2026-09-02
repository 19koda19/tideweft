import { FIXED_POINT } from "../sim/types";

export const FOOTING_VERSION = 1 as const;
export const MAX_FOOTING_LOSS_PER_STEP = 120_000;

export const FOOTING_CAUSE_ORDER = [
  "unsupported-edge",
  "downhill-acceleration",
  "steep-grade",
  "loose-rock",
  "mud-shear",
  "cross-current",
  "deep-water",
  "crosswind",
  "sharp-turn",
  "load-shift",
  "heavy-load",
  "swift-motion",
] as const;

export type FootingCauseCode = (typeof FOOTING_CAUSE_ORDER)[number];
export type FootingSurface = "firm" | "soft" | "rock" | "water";
export type FootingPace = "rest" | "steady" | "swift";
export type FootingTrend = "recovering" | "steady" | "falling";

export interface FootingVector {
  /** Signed fixed-point component in -1..1. */
  readonly x: number;
  /** Signed fixed-point component in -1..1. */
  readonly y: number;
}

export interface FootingInput {
  readonly stability: number;
  readonly moving: boolean;
  readonly surface: FootingSurface;
  /** Destination elevation minus origin elevation, signed fixed point. */
  readonly elevationDelta: number;
  readonly roughness: number;
  readonly moisture: number;
  readonly waterDepth: number;
  readonly movement: FootingVector;
  readonly current: FootingVector;
  readonly wind: FootingVector;
  readonly weatherIntensity: number;
  /** Normalized change of travel heading/speed during this fixed step. */
  readonly turnPressure: number;
  /** 1.0 means the shared pack is at its rated capacity. */
  readonly loadRatio: number;
  /** A discrete load-shift impulse supplied by cargo/fall integration. */
  readonly cargoShift: number;
  readonly pace: FootingPace;
  readonly brace: boolean;
  readonly footwearGrip: number;
  readonly fixtureSupport: number;
  /** Harbor deck, camp floor, or another explicitly dependable surface. */
  readonly reliableGround: boolean;
  /** Explicit civic/camp recovery supplied only while resting on reliable ground. */
  readonly recoveryBonus?: number;
  /** Gap/drop pressure supplied by the shared rock/elevation edge query. */
  readonly unsupportedEdge: number;
}

export interface FootingCause {
  readonly code: FootingCauseCode;
  readonly label: string;
  /** Fixed-point source pressure before weighting. */
  readonly pressure: number;
  /** Stability points charged before mitigation. */
  readonly contribution: number;
}

export interface FootingMitigation {
  readonly brace: number;
  readonly footwear: number;
  readonly fixture: number;
  /** Union of the three mitigation channels, fixed point 0..1. */
  readonly total: number;
}

export interface FootingEvaluation {
  readonly version: typeof FOOTING_VERSION;
  readonly stabilityBefore: number;
  readonly stabilityAfter: number;
  /** Signed stability change. Negative is loss; positive is recovery. */
  readonly delta: number;
  readonly trend: FootingTrend;
  readonly causes: readonly FootingCause[];
  readonly primaryCause: FootingCauseCode | null;
  readonly mitigation: FootingMitigation;
  /** Compound contact-force pressure for fall forecasting, fixed point 0..1. */
  readonly hazardPressure: number;
}

interface Candidate {
  readonly code: FootingCauseCode;
  readonly label: string;
  readonly pressure: number;
  /** Maximum stability loss contributed in one 100ms fixed step. */
  readonly weight: number;
  readonly surfaceMitigated?: boolean;
}

const PRIORITY = new Map<FootingCauseCode, number>(
  FOOTING_CAUSE_ORDER.map((code, index) => [code, index]),
);

function clampUnit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= FIXED_POINT) return FIXED_POINT;
  return Math.trunc(value);
}

function clampSigned(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-FIXED_POINT, Math.min(FIXED_POINT, Math.trunc(value)));
}

function multiplyFixed(left: number, right: number): number {
  return Math.trunc((clampUnit(left) * clampUnit(right)) / FIXED_POINT);
}

function unionFixed(left: number, right: number): number {
  return FIXED_POINT - multiplyFixed(FIXED_POINT - clampUnit(left), FIXED_POINT - clampUnit(right));
}

function pacePressure(pace: FootingPace): number {
  if (pace === "swift") return FIXED_POINT;
  return 0;
}

function vectorMagnitude(vector: FootingVector): number {
  return Math.min(
    FIXED_POINT,
    Math.trunc((Math.abs(clampSigned(vector.x)) + Math.abs(clampSigned(vector.y))) / 2),
  );
}

/**
 * Measures force that is lateral to or opposed to travel. Following a current
 * is steadier than crossing it; standing in moving water still receives force.
 */
function transverseForce(force: FootingVector, movement: FootingVector, moving: boolean): number {
  const forceX = clampSigned(force.x);
  const forceY = clampSigned(force.y);
  const magnitude = vectorMagnitude({ x: forceX, y: forceY });
  if (!moving) return magnitude;
  const moveMagnitude = Math.max(1, Math.max(
    Math.abs(clampSigned(movement.x)),
    Math.abs(clampSigned(movement.y)),
  ));
  const moveX = Math.trunc((clampSigned(movement.x) * FIXED_POINT) / moveMagnitude);
  const moveY = Math.trunc((clampSigned(movement.y) * FIXED_POINT) / moveMagnitude);
  const cross = Math.min(
    FIXED_POINT,
    Math.trunc(Math.abs(forceX * moveY - forceY * moveX) / FIXED_POINT),
  );
  const dot = Math.trunc((forceX * moveX + forceY * moveY) / FIXED_POINT);
  const opposition = Math.max(0, -dot);
  return Math.min(FIXED_POINT, Math.max(magnitude / 4, cross, opposition));
}

function surface(value: FootingInput["surface"]): FootingSurface {
  return value === "soft" || value === "rock" || value === "water" ? value : "firm";
}

function pace(value: FootingInput["pace"]): FootingPace {
  return value === "rest" || value === "swift" ? value : "steady";
}

function recoveryPerStep(input: FootingInput, environmentalPressure: number): number {
  if (environmentalPressure > 120_000) return 0;
  if (!input.moving) {
    if (input.reliableGround) return Math.min(
      MAX_FOOTING_LOSS_PER_STEP,
      18_000 + clampUnit(input.recoveryBonus ?? 0),
    );
    return input.brace ? 10_000 : 6_000;
  }
  if (surface(input.surface) === "firm" && pace(input.pace) === "steady") return 1_800;
  return 0;
}

/**
 * Resolves physical balance for one fixed movement/contact step. Stamina is
 * deliberately absent: exertion and footing are separate authoritative axes.
 */
export function evaluateFooting(input: FootingInput): FootingEvaluation {
  const stabilityBefore = clampUnit(input.stability);
  const moving = input.moving === true;
  const footingSurface = surface(input.surface);
  const elevationDelta = clampSigned(input.elevationDelta);
  const grade = Math.min(FIXED_POINT, Math.abs(elevationDelta));
  const downhill = Math.max(0, -elevationDelta);
  const roughness = clampUnit(input.roughness);
  const moisture = clampUnit(input.moisture);
  const depth = clampUnit(input.waterDepth);
  const currentPressure = multiplyFixed(
    transverseForce(input.current, input.movement, moving),
    depth,
  );
  const windPressure = multiplyFixed(
    transverseForce(input.wind, input.movement, moving),
    clampUnit(input.weatherIntensity),
  );
  const loadPressure = Math.max(0, clampUnit(input.loadRatio) - 320_000);
  const candidates: readonly Candidate[] = [
    {
      code: "unsupported-edge",
      label: "unsupported edge",
      pressure: clampUnit(input.unsupportedEdge),
      weight: 115_000,
      surfaceMitigated: true,
    },
    {
      code: "downhill-acceleration",
      label: "downhill acceleration",
      pressure: moving ? downhill : 0,
      weight: 42_000,
      surfaceMitigated: true,
    },
    {
      code: "steep-grade",
      label: "steep grade",
      pressure: moving ? grade : 0,
      weight: 34_000,
      surfaceMitigated: true,
    },
    {
      code: "loose-rock",
      label: "loose rock",
      pressure: moving && footingSurface === "rock" ? roughness : 0,
      weight: 30_000,
      surfaceMitigated: true,
    },
    {
      code: "mud-shear",
      label: "mud shear",
      pressure: moving && footingSurface === "soft" ? multiplyFixed(moisture, 850_000) : 0,
      weight: 24_000,
      surfaceMitigated: true,
    },
    {
      code: "cross-current",
      label: "cross-current",
      pressure: currentPressure,
      weight: 46_000,
    },
    {
      code: "deep-water",
      label: "deep water",
      pressure: depth > 35_000 ? depth - 35_000 : 0,
      weight: 32_000,
    },
    {
      code: "crosswind",
      label: "crosswind",
      pressure: windPressure,
      weight: 24_000,
    },
    {
      code: "sharp-turn",
      label: "sharp turn",
      pressure: moving ? clampUnit(input.turnPressure) : 0,
      weight: 28_000,
    },
    {
      code: "load-shift",
      label: "load shift",
      pressure: clampUnit(input.cargoShift),
      weight: 52_000,
    },
    {
      code: "heavy-load",
      label: "high load",
      pressure: moving ? loadPressure : 0,
      weight: 26_000,
    },
    {
      code: "swift-motion",
      label: "swift motion",
      pressure: moving ? pacePressure(pace(input.pace)) : 0,
      weight: 22_000,
    },
  ];

  const footwearGrip = clampUnit(input.footwearGrip);
  const causes = candidates.flatMap((candidate): FootingCause[] => {
    if (candidate.pressure <= 0) return [];
    const raw = multiplyFixed(candidate.pressure, candidate.weight);
    const contribution = candidate.surfaceMitigated
      ? multiplyFixed(raw, FIXED_POINT - multiplyFixed(footwearGrip, 650_000))
      : raw;
    return contribution <= 0 ? [] : [{
      code: candidate.code,
      label: candidate.label,
      pressure: clampUnit(candidate.pressure),
      contribution,
    }];
  }).sort((left, right) =>
    right.contribution - left.contribution
      || (PRIORITY.get(left.code) ?? Number.MAX_SAFE_INTEGER)
        - (PRIORITY.get(right.code) ?? Number.MAX_SAFE_INTEGER),
  );

  const rawStress = causes.reduce((sum, cause) => Math.min(FIXED_POINT, sum + cause.contribution), 0);
  // BRACE must buy meaningful *distance* through a hazard, not merely make
  // the same inevitable collapse happen a fraction later. Movement already
  // slows to 62% while braced, so a 62% pressure reduction makes the planted
  // stance clearly useful without erasing deep water, unsupported edges, or
  // the separate deterministic fall evaluation.
  const braceMitigation = input.brace ? 620_000 : 0;
  const footwearMitigation = multiplyFixed(footwearGrip, 180_000);
  const fixtureMitigation = multiplyFixed(clampUnit(input.fixtureSupport), 560_000);
  const mitigationTotal = unionFixed(
    braceMitigation,
    unionFixed(footwearMitigation, fixtureMitigation),
  );
  const tolerance = moving && footingSurface === "firm" ? 3_000 : 1_000;
  const loss = Math.min(
    MAX_FOOTING_LOSS_PER_STEP,
    multiplyFixed(Math.max(0, rawStress - tolerance), FIXED_POINT - mitigationTotal),
  );
  // Balance is not a second stamina bar. On dry support the porter keeps
  // making small corrective movements while resisting a gust, so recovery
  // and pressure can coexist and the stronger one determines the trend.
  // Water and unsupported edges deliberately remain pure-loss contacts.
  const canCorrectFooting = footingSurface !== "water"
    && clampUnit(input.unsupportedEdge) === 0;
  const recovery = canCorrectFooting || loss === 0
    ? recoveryPerStep(input, rawStress)
    : 0;
  const stabilityAfter = Math.max(0, Math.min(FIXED_POINT, stabilityBefore - loss + recovery));
  const delta = stabilityAfter - stabilityBefore;
  return {
    version: FOOTING_VERSION,
    stabilityBefore,
    stabilityAfter,
    delta,
    trend: delta > 0 ? "recovering" : delta < 0 ? "falling" : "steady",
    causes,
    primaryCause: causes[0]?.code ?? null,
    mitigation: {
      brace: braceMitigation,
      footwear: footwearMitigation,
      fixture: fixtureMitigation,
      total: mitigationTotal,
    },
    hazardPressure: clampUnit(Math.trunc(rawStress * 7)),
  };
}

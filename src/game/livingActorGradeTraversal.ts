export const LIVING_ACTOR_GRADE_TRAVERSAL_VERSION = 1 as const;
export const LIVING_ACTOR_GRADE_FACTOR_SCALE = 1_000_000 as const;
export const MAX_LIVING_ACTOR_GRADE_COST_MULTIPLIER = 8_000_000 as const;

export interface LivingActorGradeTraversalBand {
  /** Grade at or below this value retains the ordinary edge cost. */
  readonly comfortableGrade: number;
  /** A steeper directed edge is impassable for this locomotion profile. */
  readonly maximumGrade: number;
  /** Cost multiplier reached at maximumGrade, in millionths. */
  readonly costMultiplierAtMaximum: number;
}

/**
 * A species-neutral directed grade response. A caller selects the policy from
 * an actor's declared locomotion capabilities; the common pathfinder owns the
 * resulting route. Elevation and grade use the terrain fixed-point scale.
 */
export interface LivingActorGradeTraversalPolicy {
  readonly version: typeof LIVING_ACTOR_GRADE_TRAVERSAL_VERSION;
  readonly ascent: LivingActorGradeTraversalBand;
  readonly descent: LivingActorGradeTraversalBand;
}

export interface LivingActorGradeTraversalPolicyInput {
  readonly ascent: LivingActorGradeTraversalBand;
  readonly descent: LivingActorGradeTraversalBand;
}

export type LivingActorTraversalEdgeDirection = "ascent" | "descent" | "level";

export type LivingActorTraversalEdgeCost =
  | Readonly<{
      readonly kind: "blocked";
      readonly direction: Exclude<LivingActorTraversalEdgeDirection, "level">;
      readonly grade: number;
      readonly reason: "grade-limit";
    }>
  | Readonly<{
      readonly kind: "open";
      readonly direction: LivingActorTraversalEdgeDirection;
      readonly grade: number;
      readonly costMultiplier: number;
      readonly transitionCost: number;
    }>;

export interface ResolveLivingActorTraversalEdgeCostInput {
  readonly fromElevation: number;
  readonly toElevation: number;
  /** Cardinal edges use 1,000; diagonal edges use their longer integer length. */
  readonly horizontalDistanceUnits: number;
  readonly destinationTravelCost: number;
  readonly policy: LivingActorGradeTraversalPolicy;
}

/** Create one strict immutable policy for an actor locomotion profile. */
export function createLivingActorGradeTraversalPolicy(
  input: LivingActorGradeTraversalPolicyInput,
): LivingActorGradeTraversalPolicy {
  const policy = canonicalLivingActorGradeTraversalPolicy({
    version: LIVING_ACTOR_GRADE_TRAVERSAL_VERSION,
    ...input,
  });
  if (policy === null) throw new TypeError("Living actor grade traversal policy is invalid");
  return policy;
}

/** Strict canonicalization used by transient traversability surfaces. */
export function canonicalLivingActorGradeTraversalPolicy(
  value: unknown,
): LivingActorGradeTraversalPolicy | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["ascent", "descent", "version"])
    || value.version !== LIVING_ACTOR_GRADE_TRAVERSAL_VERSION
  ) return null;
  const ascent = canonicalBand(value.ascent);
  const descent = canonicalBand(value.descent);
  return ascent === null || descent === null
    ? null
    : Object.freeze({
        version: LIVING_ACTOR_GRADE_TRAVERSAL_VERSION,
        ascent,
        descent,
      });
}

/**
 * Resolve the cost of one directed edge. It never discounts the ordinary
 * terrain cost, so the existing minimum-cell heuristic remains admissible.
 */
export function resolveLivingActorTraversalEdgeCost(
  value: unknown,
): LivingActorTraversalEdgeCost | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "destinationTravelCost",
      "fromElevation",
      "horizontalDistanceUnits",
      "policy",
      "toElevation",
    ])
    || !unitInteger(value.fromElevation)
    || !unitInteger(value.toElevation)
    || !positiveSafeInteger(value.horizontalDistanceUnits)
    || !positiveSafeInteger(value.destinationTravelCost)
  ) return null;
  const policy = canonicalLivingActorGradeTraversalPolicy(value.policy);
  if (policy === null) return null;

  const elevationDelta = value.toElevation - value.fromElevation;
  const direction: LivingActorTraversalEdgeDirection = elevationDelta > 0
    ? "ascent"
    : elevationDelta < 0 ? "descent" : "level";
  const grade = Math.min(
    LIVING_ACTOR_GRADE_FACTOR_SCALE,
    Math.trunc(
      Math.abs(elevationDelta) * 1_000 / value.horizontalDistanceUnits,
    ),
  );
  if (direction === "level") {
    const transitionCost = scaledTransitionCost(
      value.horizontalDistanceUnits,
      value.destinationTravelCost,
      LIVING_ACTOR_GRADE_FACTOR_SCALE,
    );
    if (transitionCost === null) return null;
    return Object.freeze({
      kind: "open",
      direction,
      grade,
      costMultiplier: LIVING_ACTOR_GRADE_FACTOR_SCALE,
      transitionCost,
    });
  }

  const band = direction === "ascent" ? policy.ascent : policy.descent;
  if (grade > band.maximumGrade) {
    return Object.freeze({ kind: "blocked", direction, grade, reason: "grade-limit" });
  }
  const costMultiplier = gradeMultiplier(grade, band);
  const transitionCost = scaledTransitionCost(
    value.horizontalDistanceUnits,
    value.destinationTravelCost,
    costMultiplier,
  );
  if (transitionCost === null) return null;
  return Object.freeze({
    kind: "open",
    direction,
    grade,
    costMultiplier,
    transitionCost,
  });
}

/** Exact half-up fixed-point multiplication without unsafe Number intermediates. */
function scaledTransitionCost(
  horizontalDistanceUnits: number,
  destinationTravelCost: number,
  costMultiplier: number,
): number | null {
  const scale = BigInt(LIVING_ACTOR_GRADE_FACTOR_SCALE);
  const numerator = BigInt(horizontalDistanceUnits)
    * BigInt(destinationTravelCost)
    * BigInt(costMultiplier);
  const rounded = (numerator + scale / 2n) / scale;
  return rounded <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rounded) : null;
}

function canonicalBand(value: unknown): LivingActorGradeTraversalBand | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "comfortableGrade",
      "costMultiplierAtMaximum",
      "maximumGrade",
    ])
    || !unitInteger(value.comfortableGrade)
    || !unitInteger(value.maximumGrade)
    || value.comfortableGrade > value.maximumGrade
    || !positiveSafeInteger(value.costMultiplierAtMaximum)
    || value.costMultiplierAtMaximum < LIVING_ACTOR_GRADE_FACTOR_SCALE
    || value.costMultiplierAtMaximum > MAX_LIVING_ACTOR_GRADE_COST_MULTIPLIER
  ) return null;
  return Object.freeze({
    comfortableGrade: value.comfortableGrade,
    maximumGrade: value.maximumGrade,
    costMultiplierAtMaximum: value.costMultiplierAtMaximum,
  });
}

function gradeMultiplier(
  grade: number,
  band: LivingActorGradeTraversalBand,
): number {
  if (grade <= band.comfortableGrade || band.maximumGrade === band.comfortableGrade) {
    return LIVING_ACTOR_GRADE_FACTOR_SCALE;
  }
  const progress = grade - band.comfortableGrade;
  const range = band.maximumGrade - band.comfortableGrade;
  return LIVING_ACTOR_GRADE_FACTOR_SCALE + Math.trunc(
    progress * (band.costMultiplierAtMaximum - LIVING_ACTOR_GRADE_FACTOR_SCALE)
      / range,
  );
}

function unitInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value <= LIVING_ACTOR_GRADE_FACTOR_SCALE;
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== "string")) return false;
  const keys = (actual as string[]).sort(compareText);
  const wanted = [...expected].sort(compareText);
  return keys.length === wanted.length
    && keys.every((key, index) => key === wanted[index]);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

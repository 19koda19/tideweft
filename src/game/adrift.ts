import { FIXED_POINT } from "../sim/types";

/**
 * Pure 100 ms ADRIFT movement quote.
 *
 * The evaluator has no world access and mutates nothing. Callers remain
 * responsible for collision, region transitions, applying `staminaDelta`, and
 * changing the player's posture after `canStand` becomes true. All inputs are
 * integer-friendly scalar values; all authoritative outputs are integers.
 */

/** Water at or below this depth can support a tired porter getting upright. */
export const ADRIFT_STAND_DEPTH = 55_000 as const;
/** Standing from moving water requires a meaningful reserve, not one stamina point. */
export const ADRIFT_STAND_STAMINA = 100_000 as const;
/** Below this reserve, an attempted stroke becomes a breath-catching float. */
export const ADRIFT_MIN_STROKE_STAMINA = 16_000 as const;
/** Maximum resultant motion in player world units during one 100 ms tick. */
export const ADRIFT_MAX_VELOCITY = 180 as const;

const PERMILLE = 1_000;
const BASE_FLOW_SPEED = 34;
const DEPTH_FLOW_SPEED = 76;
const BASE_PADDLE_SPEED = 66;
const IDLE_RECOVERY = 2_800;
const EXHAUSTED_RECOVERY = 1_800;
const MIN_STROKE_COST = 3_000;
const MAX_CURRENT_MITIGATION = 700;
const MIN_CURRENT_REMAINDER = 250;
const FERRY_CURRENT_MITIGATION = 100;
const FERRY_PADDLE_ASSIST = 200;
/** Direct opposition may nearly hold position, but never reverse live flow. */
const MIN_DOWNSTREAM_DRIFT = 1;

export interface AdriftVector {
  readonly x: number;
  readonly y: number;
}

export interface AdriftControl {
  readonly x: number;
  readonly y: number;
}

export interface AdriftMotionInput {
  /**
   * Physical surface-current vector. Overall magnitude is normalized, while
   * the fixed-point ratio between its tide and cross-current components is
   * retained exactly.
   */
  readonly current: AdriftVector;
  /**
   * Optional obstacle-safe downstream guide supplied by the world resolver.
   * It influences one quarter of the flow heading and can never replace a
   * valid physical current wholesale.
   */
  readonly guideDirection?: AdriftVector;
  /** Desired paddle direction. Its magnitude is ignored. */
  readonly control: AdriftControl;
  /** Fixed point 0..1 stamina. */
  readonly stamina: number;
  /** Fixed point 0..1 local water depth. */
  readonly waterDepth: number;
  /** Fixed point 0..1 share of rated carrying capacity. */
  readonly loadRatioFixed: number;
  /** 0..1,000 requested reduction in current force; authority is capped. */
  readonly currentMitigationPermille: number;
  /** 0..1,000 assistance above ordinary paddling strength. */
  readonly paddleAssistPermille: number;
  /** A real ferry connection can help, but never relocates the player. */
  readonly support: "ferry" | null;
}

export interface AdriftMotionResult {
  /** Final bounded displacement to apply during this 100 ms tick. */
  readonly velocity: AdriftVector;
  /** Exact signed change; callers clamp the resulting stamina to fixed point. */
  readonly staminaDelta: number;
  readonly paddling: boolean;
  readonly catchingBreath: boolean;
  /** True only when end-of-tick stamina and physical water depth permit it. */
  readonly canStand: boolean;
  /** Actual post-cap current share; sums with paddleContribution to velocity. */
  readonly flowContribution: AdriftVector;
  /** Actual post-cap player share; sums with flowContribution to velocity. */
  readonly paddleContribution: AdriftVector;
}

const ZERO_VECTOR: AdriftVector = Object.freeze({ x: 0, y: 0 });

/**
 * Quote one deterministic ADRIFT movement beat.
 *
 * A normal stroke bends the course but opposing the current is deliberately
 * less efficient. A full pack weakens only the player's stroke. Anchors and
 * other world support enter as current mitigation; ferry infrastructure also
 * supplies modest physical assistance. Even maximum assistance leaves a
 * quarter of the water's force authoritative.
 */
export function evaluateAdriftMotion(input: AdriftMotionInput): AdriftMotionResult {
  const stamina = safeUnit(input?.stamina, 0);
  const waterDepth = safeUnit(input?.waterDepth, FIXED_POINT);
  const loadRatio = safeUnit(input?.loadRatioFixed, FIXED_POINT);
  const requestedMitigation = safePermille(input?.currentMitigationPermille, 0);
  const paddleAssist = safePermille(input?.paddleAssistPermille, 0);
  const support = input?.support === "ferry" ? "ferry" : null;

  const currentDirection = normalizeDirection(input?.current);
  const guideDirection = normalizeDirection(input?.guideDirection);
  const flowDirection = guidedFlowDirection(currentDirection, guideDirection);
  const resistingDirection = currentDirection.x !== 0 || currentDirection.y !== 0
    ? currentDirection
    : flowDirection;
  const controlDirection = normalizeDirection(input?.control);
  const hasControl = controlDirection.x !== 0 || controlDirection.y !== 0;
  const paddling = hasControl && stamina >= ADRIFT_MIN_STROKE_STAMINA;
  const catchingBreath = !paddling && stamina < FIXED_POINT;

  const flowContribution = quoteFlow(
    flowDirection,
    waterDepth,
    requestedMitigation,
    support,
  );
  const paddleContribution = paddling
    ? quotePaddle(
        controlDirection,
        resistingDirection,
        flowContribution,
        loadRatio,
        paddleAssist,
        support,
      )
    : ZERO_VECTOR;
  const bounded = boundContributions(flowContribution, paddleContribution);

  const staminaDelta = paddling
    ? -strokeCost(waterDepth, loadRatio, paddleAssist, support)
    : stamina >= FIXED_POINT
      ? 0
      : hasControl
        ? Math.min(EXHAUSTED_RECOVERY, FIXED_POINT - stamina)
        : Math.min(IDLE_RECOVERY, FIXED_POINT - stamina);
  const endStamina = clamp(stamina + staminaDelta, 0, FIXED_POINT);

  return {
    velocity: bounded.velocity,
    staminaDelta,
    paddling,
    catchingBreath,
    canStand: waterDepth <= ADRIFT_STAND_DEPTH
      && endStamina >= ADRIFT_STAND_STAMINA,
    flowContribution: bounded.flow,
    paddleContribution: bounded.paddle,
  };
}

function quoteFlow(
  direction: AdriftVector,
  waterDepth: number,
  requestedMitigation: number,
  support: "ferry" | null,
): AdriftVector {
  if ((direction.x === 0 && direction.y === 0) || waterDepth <= 0) return ZERO_VECTOR;
  const baseMagnitude = BASE_FLOW_SPEED
    + Math.trunc((waterDepth * DEPTH_FLOW_SPEED) / FIXED_POINT);
  const mitigation = Math.min(MAX_CURRENT_MITIGATION, requestedMitigation)
    + (support === "ferry" ? FERRY_CURRENT_MITIGATION : 0);
  const remainingPermille = Math.max(MIN_CURRENT_REMAINDER, PERMILLE - mitigation);
  const magnitude = Math.max(1, Math.trunc((baseMagnitude * remainingPermille) / PERMILLE));
  return scaleDirection(direction, magnitude);
}

function quotePaddle(
  control: AdriftVector,
  resistingDirection: AdriftVector,
  flowContribution: AdriftVector,
  loadRatio: number,
  paddleAssist: number,
  support: "ferry" | null,
): AdriftVector {
  // A rated-full pack retains 55% of an ordinary stroke. It never weakens the
  // current contribution, which is computed independently above.
  const loadPermille = PERMILLE - Math.trunc((loadRatio * 450) / FIXED_POINT);
  const assistPermille = PERMILLE
    + Math.trunc(paddleAssist / 2)
    + (support === "ferry" ? FERRY_PADDLE_ASSIST : 0);
  const alignment = dotFixed(control, resistingDirection);
  // Directly fighting upstream can retain at most 70% of the same stroke.
  const oppositionPermille = alignment < 0
    ? PERMILLE - Math.trunc((Math.min(FIXED_POINT, -alignment) * 300) / FIXED_POINT)
    : PERMILLE;
  const unconstrainedMagnitude = Math.max(1, Math.trunc(
    (BASE_PADDLE_SPEED * loadPermille * assistPermille * oppositionPermille)
      / 1_000_000_000,
  ));
  // Gear and infrastructure can make a stroke efficient, but the remaining
  // physical current stays authoritative. Cap only the upstream projection;
  // oblique strokes retain their useful lateral course change. Measuring both
  // contributions against the normalized physical-current heading leaves one
  // world unit of downstream projection, preventing accumulated upstream
  // escape without injecting position correction or hidden randomness.
  const downstreamProjection = Math.max(
    0,
    dotFixed(flowContribution, resistingDirection),
  );
  const maximumOpposingMagnitude = alignment < 0 && downstreamProjection > 0
    ? Math.trunc(
        (Math.max(0, downstreamProjection - MIN_DOWNSTREAM_DRIFT) * FIXED_POINT)
          / Math.max(1, -alignment),
      )
    : unconstrainedMagnitude;
  const magnitude = Math.min(unconstrainedMagnitude, maximumOpposingMagnitude);
  if (magnitude <= 0) return ZERO_VECTOR;
  return scaleDirection(control, magnitude);
}

function strokeCost(
  waterDepth: number,
  loadRatio: number,
  paddleAssist: number,
  support: "ferry" | null,
): number {
  const base = 4_800
    + Math.trunc((waterDepth * 1_600) / FIXED_POINT)
    + Math.trunc((loadRatio * 2_000) / FIXED_POINT);
  const assisted = Math.trunc(
    (base * (PERMILLE - Math.trunc(paddleAssist / 5))) / PERMILLE,
  );
  const supported = support === "ferry" ? assisted - 1_000 : assisted;
  return Math.max(MIN_STROKE_COST, supported);
}

function guidedFlowDirection(current: AdriftVector, guide: AdriftVector): AdriftVector {
  if (current.x === 0 && current.y === 0) return guide;
  if (guide.x === 0 && guide.y === 0) return current;
  // Preserve the physical current as three quarters of the heading. The guide
  // is a collision-aware downstream hint, not an autopilot or teleport.
  return normalizeDirection({
    x: Math.trunc((current.x * 3 + guide.x) / 4),
    y: Math.trunc((current.y * 3 + guide.y) / 4),
  });
}

function boundContributions(
  flow: AdriftVector,
  paddle: AdriftVector,
): {
  readonly velocity: AdriftVector;
  readonly flow: AdriftVector;
  readonly paddle: AdriftVector;
} {
  const summed = { x: flow.x + paddle.x, y: flow.y + paddle.y };
  const magnitude = integerMagnitude(summed.x, summed.y);
  if (magnitude <= ADRIFT_MAX_VELOCITY) {
    return { velocity: summed, flow, paddle };
  }
  const boundedFlow = scaleVector(flow, ADRIFT_MAX_VELOCITY, magnitude);
  const boundedPaddle = scaleVector(paddle, ADRIFT_MAX_VELOCITY, magnitude);
  return {
    velocity: {
      x: boundedFlow.x + boundedPaddle.x,
      y: boundedFlow.y + boundedPaddle.y,
    },
    flow: boundedFlow,
    paddle: boundedPaddle,
  };
}

function normalizeDirection(vector: AdriftVector | undefined): AdriftVector {
  if (!vector || !Number.isFinite(vector.x) || !Number.isFinite(vector.y)) return ZERO_VECTOR;
  const x = clamp(Math.trunc(vector.x), -FIXED_POINT, FIXED_POINT);
  const y = clamp(Math.trunc(vector.y), -FIXED_POINT, FIXED_POINT);
  const largestComponent = Math.max(Math.abs(x), Math.abs(y));
  if (largestComponent <= 0) return ZERO_VECTOR;
  // Controls commonly arrive as -1/0/1. Lift that ratio into fixed-point
  // before measuring it so integer sqrt truncation cannot grant (1,1) a
  // square-speed advantage over (1,0).
  const scaledX = Math.trunc((x * FIXED_POINT) / largestComponent);
  const scaledY = Math.trunc((y * FIXED_POINT) / largestComponent);
  const magnitude = integerMagnitude(scaledX, scaledY);
  if (magnitude <= 0) return ZERO_VECTOR;
  return {
    x: Math.trunc((scaledX * FIXED_POINT) / magnitude),
    y: Math.trunc((scaledY * FIXED_POINT) / magnitude),
  };
}

function scaleDirection(direction: AdriftVector, magnitude: number): AdriftVector {
  return {
    x: Math.trunc((direction.x * magnitude) / FIXED_POINT),
    y: Math.trunc((direction.y * magnitude) / FIXED_POINT),
  };
}

function scaleVector(vector: AdriftVector, numerator: number, denominator: number): AdriftVector {
  if (denominator <= 0) return ZERO_VECTOR;
  return {
    x: Math.trunc((vector.x * numerator) / denominator),
    y: Math.trunc((vector.y * numerator) / denominator),
  };
}

function dotFixed(left: AdriftVector, right: AdriftVector): number {
  return clamp(
    Math.trunc((left.x * right.x + left.y * right.y) / FIXED_POINT),
    -FIXED_POINT,
    FIXED_POINT,
  );
}

function integerMagnitude(x: number, y: number): number {
  // Inputs are clamped well below Number's exact-integer multiplication limit.
  return Math.trunc(Math.sqrt(x * x + y * y));
}

function safeUnit(value: number | undefined, fallback: number): number {
  return Number.isFinite(value)
    ? clamp(Math.trunc(value ?? fallback), 0, FIXED_POINT)
    : fallback;
}

function safePermille(value: number | undefined, fallback: number): number {
  return Number.isFinite(value)
    ? clamp(Math.trunc(value ?? fallback), 0, PERMILLE)
    : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

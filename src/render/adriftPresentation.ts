import type { WorldPoint } from "./types";

export type AdriftPresentationState =
  | "floating"
  | "paddling"
  | "catching-breath"
  | "reaching"
  | "ready-to-rise";

export type AdriftPose = "float" | "stroke" | "reach" | "rise";
export type AdriftSoundSyllable = "WHHSH" | "OHM" | "HUP";

/**
 * Authoritative ADRIFT facts projected into the renderer. Values are treated
 * as untrusted because an older save or interrupted projection can briefly
 * supply malformed numbers during recovery.
 */
export interface AdriftPresentationInput {
  readonly modeActive: boolean;
  readonly paddling: boolean;
  readonly catchingBreath: boolean;
  readonly canStand: boolean;
  /** Normalized authoritative stamina, from empty (0) to full (1). */
  readonly stamina: number;
  /** Current player motion in either Chart or Relief world units. */
  readonly velocity: WorldPoint;
  /** Direction only; magnitude is deliberately ignored. */
  readonly currentDirection: WorldPoint;
  /**
   * Optional current-course hint. Steering can invalidate it, so absence means
   * unknown and it must never be presented as an ETA.
   */
  readonly shoreProgress?: number;
  /** Optional current-course distance in terrain-tile units, never an ETA. */
  readonly shoreDistance?: number;
}

/**
 * One no-panel visual and textual language shared by Chart and Relief.
 * `state`, `label`, `instruction`, and `pose` carry the complete meaning, so
 * none of the gameplay communication depends upon color or animation.
 */
export interface AdriftPresentation {
  readonly state: AdriftPresentationState;
  readonly label: string;
  readonly instruction: string;
  readonly pose: AdriftPose;
  readonly bodyColor: string;
  readonly edgeColor: string;
  readonly bobIntensity: number;
  readonly leanIntensity: number;
  readonly wakeIntensity: number;
  readonly soundSyllable?: AdriftSoundSyllable;
}

interface AdriftCopyAndColor {
  readonly label: string;
  readonly instruction: string;
  readonly pose: AdriftPose;
  readonly bodyColor: string;
  readonly edgeColor: string;
}

const STATE_PRESENTATION: Readonly<Record<AdriftPresentationState, AdriftCopyAndColor>> = {
  floating: {
    label: "ADRIFT",
    instruction: "STEER ACROSS THE CURRENT",
    pose: "float",
    bodyColor: "#55c7dc",
    edgeColor: "#e5fbff",
  },
  paddling: {
    label: "PADDLING",
    instruction: "PADDLE TOWARD SHALLOW WATER",
    pose: "stroke",
    bodyColor: "#61e6d2",
    edgeColor: "#edfff9",
  },
  "catching-breath": {
    label: "CATCHING BREATH",
    instruction: "FLOAT · LET STAMINA RETURN",
    pose: "float",
    bodyColor: "#ffc071",
    edgeColor: "#fff1c7",
  },
  reaching: {
    label: "SHORE WITHIN REACH",
    instruction: "REACH FOR SHALLOW WATER",
    pose: "reach",
    bodyColor: "#79d8ca",
    edgeColor: "#effff8",
  },
  "ready-to-rise": {
    label: "SHALLOW · READY TO RISE",
    instruction: "RISE WITH STEADY FOOTING",
    pose: "rise",
    bodyColor: "#bea9ff",
    edgeColor: "#f4eeff",
  },
};

/**
 * Maps live ADRIFT facts to restrained floating copy, pose, and motion cues.
 * Inactive movement has no ADRIFT presentation at all. While active, this
 * mapper deliberately never claims the courier is ashore: only the simulation
 * may end the movement mode.
 */
export function adriftPresentation(
  input: AdriftPresentationInput,
): AdriftPresentation | undefined {
  if (input.modeActive !== true) return undefined;

  const stamina = unit(input.stamina);
  const shoreProgress = unit(input.shoreProgress ?? 0);
  const shoreDistance = finiteClamp(input.shoreDistance ?? 1_000_000, 0, 1_000_000, 1_000_000);
  const velocity = safeVector(input.velocity);
  const currentDirection = safeVector(input.currentDirection);
  const speed = Math.hypot(velocity.x, velocity.y);
  const motion = unit(speed / (speed + 1));
  const direction = directionalEffort(velocity, currentDirection);
  const nearShore = shoreProgress >= 0.78 || shoreDistance <= 1.5;

  const state: AdriftPresentationState = input.canStand === true
    ? "ready-to-rise"
    : input.catchingBreath === true
      ? "catching-breath"
      : input.paddling === true
        ? "paddling"
        : nearShore
          ? "reaching"
          : "floating";
  const style = STATE_PRESENTATION[state];
  const intensities = motionIntensities(state, motion, stamina, direction);
  const soundSyllable = motionSyllable(state, motion, stamina);

  return {
    state,
    ...style,
    ...intensities,
    ...(soundSyllable ? { soundSyllable } : {}),
  };
}

interface DirectionalEffort {
  readonly across: number;
  readonly against: number;
}

function directionalEffort(
  velocity: WorldPoint,
  currentDirection: WorldPoint,
): DirectionalEffort {
  const speed = Math.hypot(velocity.x, velocity.y);
  const currentMagnitude = Math.hypot(currentDirection.x, currentDirection.y);
  if (speed <= Number.EPSILON || currentMagnitude <= Number.EPSILON) {
    return { across: 0, against: 0 };
  }
  const velocityX = velocity.x / speed;
  const velocityY = velocity.y / speed;
  const currentX = currentDirection.x / currentMagnitude;
  const currentY = currentDirection.y / currentMagnitude;
  const alignment = finiteClamp(
    velocityX * currentX + velocityY * currentY,
    -1,
    1,
    0,
  );
  return {
    across: unit(Math.abs(velocityX * currentY - velocityY * currentX)),
    against: unit((1 - alignment) / 2),
  };
}

function motionIntensities(
  state: AdriftPresentationState,
  motion: number,
  stamina: number,
  direction: DirectionalEffort,
): Pick<AdriftPresentation, "bobIntensity" | "leanIntensity" | "wakeIntensity"> {
  const fatigue = 1 - stamina;
  switch (state) {
    case "ready-to-rise":
      return boundedMotion(0.08 + motion * 0.12, 0.12 + fatigue * 0.08, 0.04 + motion * 0.12);
    case "catching-breath":
      return boundedMotion(
        0.2 + motion * 0.28,
        0.08 + motion * 0.12 + fatigue * 0.08,
        0.08 + motion * 0.3,
      );
    case "paddling":
      return boundedMotion(
        0.28 + motion * 0.42,
        0.34 + direction.against * 0.34 + fatigue * 0.2,
        0.34 + motion * 0.66,
      );
    case "reaching":
      return boundedMotion(
        0.16 + motion * 0.3,
        0.2 + direction.against * 0.2,
        0.16 + motion * 0.5,
      );
    case "floating":
      return boundedMotion(
        0.24 + motion * 0.38,
        0.1 + direction.across * 0.28 + direction.against * 0.12,
        0.1 + motion * 0.44,
      );
  }
}

function motionSyllable(
  state: AdriftPresentationState,
  motion: number,
  stamina: number,
): AdriftSoundSyllable | undefined {
  if (state === "ready-to-rise") return stamina >= 0.12 ? "HUP" : undefined;
  if (state === "paddling") return motion >= 0.06 ? "WHHSH" : undefined;
  if (state === "reaching") return motion >= 0.14 ? "WHHSH" : undefined;
  return motion >= 0.1 ? "OHM" : undefined;
}

function boundedMotion(
  bobIntensity: number,
  leanIntensity: number,
  wakeIntensity: number,
): Pick<AdriftPresentation, "bobIntensity" | "leanIntensity" | "wakeIntensity"> {
  return {
    bobIntensity: roundedUnit(bobIntensity),
    leanIntensity: roundedUnit(leanIntensity),
    wakeIntensity: roundedUnit(wakeIntensity),
  };
}

function safeVector(value: WorldPoint): WorldPoint {
  return {
    x: finiteClamp(value?.x, -1_000_000, 1_000_000, 0),
    y: finiteClamp(value?.y, -1_000_000, 1_000_000, 0),
  };
}

function roundedUnit(value: number): number {
  return Math.round(unit(value) * 1_000) / 1_000;
}

function unit(value: number): number {
  return finiteClamp(value, 0, 1, 0);
}

function finiteClamp(
  value: number,
  low: number,
  high: number,
  fallback: number,
): number {
  const finite = Number.isFinite(value) ? value : fallback;
  return Math.max(low, Math.min(high, finite));
}

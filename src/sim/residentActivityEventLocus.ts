import { createWorldPosition, type WorldPosition } from "../game/worldPosition";
import { canonicalizeResidentActivity, RESIDENT_ACTIVITY_MAX_PHASE } from "./residentActivity";
import type { ResidentState, SimEventDatum } from "./types";

export const RESIDENT_ACTIVITY_EVENT_LOCUS_VERSION = 1 as const;
export const RESIDENT_ACTIVITY_EVENT_LOCUS_DATA_KEYS = Object.freeze([
  "eventBodyVersion", "eventBodyTick", "eventBodyPhase", "eventBodyRegionX",
  "eventBodyRegionY", "eventBodyLocalX", "eventBodyLocalY", "eventBodyHeading",
] as const);

export interface ResidentActivityEventLocus {
  readonly tick: number;
  readonly phase: number;
  readonly position: WorldPosition;
  readonly heading: number;
}

/**
 * Capture the cause's existing body, never a later render/current placement.
 * Absence retains the legacy event schema; malformed presence is an error,
 * not permission to reconstruct a different source from macro membership.
 */
export function captureResidentActivityEventLocus(
  resident: ResidentState,
  atTick: number,
): Readonly<Record<string, SimEventDatum>> | null {
  if (!Object.hasOwn(resident, "activity")) return null;
  const activity = canonicalizeResidentActivity(resident.activity, {
    actorId: resident.identity.stableId, tick: atTick,
  });
  if (activity === null) throw new RangeError("Sound cause lost its resident body authority");
  const phase = activity.poses.length - 1;
  const pose = activity.poses[phase]!;
  return Object.freeze({
    eventBodyVersion: RESIDENT_ACTIVITY_EVENT_LOCUS_VERSION,
    eventBodyTick: activity.tick,
    eventBodyPhase: phase,
    eventBodyRegionX: pose.position.region.x,
    eventBodyRegionY: pose.position.region.y,
    eventBodyLocalX: pose.position.localX,
    eventBodyLocalY: pose.position.localY,
    eventBodyHeading: pose.heading,
  });
}

/** Any partial explicit locus must fail closed rather than use legacy geometry. */
export function hasResidentActivityEventLocus(data: object): boolean {
  return RESIDENT_ACTIVITY_EVENT_LOCUS_DATA_KEYS.some((key) => Object.hasOwn(data, key));
}

/**
 * Read only the scalar body extension. The domain still authenticates the
 * complete event schema, cause/subject, retained commitment and lawful timing.
 * Captured poses outlive the eleven-pose interval; current body movement must
 * not relocate an already committed sound or replay it on load.
 */
export function readResidentActivityEventLocus(data: unknown): ResidentActivityEventLocus | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)
    || (Object.getPrototypeOf(data) !== Object.prototype && Object.getPrototypeOf(data) !== null)
    || Object.getOwnPropertySymbols(data).length !== 0
  ) return null;
  const values: Record<string, unknown> = {};
  for (const key of RESIDENT_ACTIVITY_EVENT_LOCUS_DATA_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(data, key);
    if (descriptor === undefined || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) return null;
    values[key] = descriptor.value;
  }
  if (values.eventBodyVersion !== RESIDENT_ACTIVITY_EVENT_LOCUS_VERSION
    || !boundedInteger(values.eventBodyTick, 0, Number.MAX_SAFE_INTEGER)
    || !boundedInteger(values.eventBodyPhase, 0, RESIDENT_ACTIVITY_MAX_PHASE)
    || !boundedInteger(values.eventBodyHeading, 0, 999_999)
  ) return null;
  try {
    const position = createWorldPosition(
      { x: values.eventBodyRegionX as number, y: values.eventBodyRegionY as number },
      values.eventBodyLocalX as number,
      values.eventBodyLocalY as number,
    );
    // Constructors normalize negative zero. Stored event coordinates must
    // already be canonical so clone/load cannot silently change their bytes.
    if (Object.is(values.eventBodyRegionX, -0) || Object.is(values.eventBodyRegionY, -0)
      || Object.is(values.eventBodyLocalX, -0) || Object.is(values.eventBodyLocalY, -0)
    ) return null;
    return Object.freeze({ tick: values.eventBodyTick, phase: values.eventBodyPhase,
      position, heading: values.eventBodyHeading });
  } catch {
    return null;
  }
}

function boundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value)
    && !Object.is(value, -0) && value >= minimum && value <= maximum;
}

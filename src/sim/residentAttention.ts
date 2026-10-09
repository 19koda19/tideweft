import {
  canonicalizeActorPerceptionState,
  type ActorBelief,
  type ActorPerceptionState,
  type ActorSuspicionState,
} from "./actorPerception";
import { isResidentRestSurfaceBelief } from "./residentSurfaceKnowledge";

/** Two accepted civil ticks, not two renders or a continually renewed timer. */
export const RESIDENT_NEUTRAL_GLANCE_TICKS = 2 as const;
export type ResidentAttentionState = ActorSuspicionState | "glance" | "none";

/** The same bounded, already-canonical focus for human appraisal and sensory gaze. */
export function residentAttentionFocus(perception: ActorPerceptionState): ActorBelief | undefined {
  for (const key of perception.attentionKeys) {
    const belief = perception.beliefs.find((candidate) => candidate.key === key);
    if (belief !== undefined && !isResidentRestSurfaceBelief(perception.actorId, belief)) return belief;
  }
  return undefined;
}

/**
 * Human appraisal, not a mutation of the shared perception/recognition kernel.
 * Recognizing a person or ordinary domestic dog is not watch duty. The saved belief's first
 * observation owns a brief glance; further sight does not restart it. Strong
 * signals and searches for genuinely uncertain contacts retain their existing
 * attention law. Null means malformed input, never permission to ignore it.
 */
export function queryResidentAttentionState(value: unknown): ResidentAttentionState | null {
  const perception = canonicalizeActorPerceptionState(value);
  if (perception === null) return null;
  const focus = residentAttentionFocus(perception);
  // Learning support at one's actual task target does not establish watch duty.
  // Genuine pressure can outlive its evicted/aged source belief. Do not erase
  // that existing history merely because ground is the only remaining focus.
  if (focus === undefined && perception.attentionKeys.length > 0
    && perception.search === null && perception.suspicionPressure === 0) return "none";
  if (perception.suspicion !== "identified" && perception.suspicion !== "searching") {
    return perception.suspicion;
  }
  // The canonical owner already orders/bounds attention. Do not parse and
  // copy the same belief store again just to locate its first key.
  const searched = perception.search === null ? undefined : perception.beliefs.find(
    ({ key }) => key === perception.search?.beliefKey,
  );
  const belief = perception.suspicion === "searching" ? searched : focus;
  // A known finite food source is task information, not a person or threat to
  // keep watching. Retain its exact shared belief/search without pinning the
  // human's routine after inspection or the source disappears from view.
  if (belief?.channel === "vision" && belief.perceivedClass === "exposed-food"
    && belief.subjectId !== null && belief.identification === "identified"
    && !(belief.strongInterrupt && belief.lastObservedTick === perception.tick)) return "none";
  if (belief === undefined
    || belief.channel !== "vision"
    || (belief.perceivedClass !== "human" && belief.perceivedClass !== "domestic-dog")
    || belief.subjectId === null
    || belief.identification !== "identified"
    || (belief.strongInterrupt && belief.lastObservedTick === perception.tick)) {
    return perception.suspicion;
  }
  return perception.suspicion === "identified"
    && belief.lastObservedTick === perception.tick
    && perception.tick - belief.firstObservedTick < RESIDENT_NEUTRAL_GLANCE_TICKS
    ? "glance"
    : "none";
}

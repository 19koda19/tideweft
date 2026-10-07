import {
  canonicalizeActorPerceptionState,
  type ActorSuspicionState,
} from "./actorPerception";

/** Two accepted civil ticks, not two renders or a continually renewed timer. */
export const RESIDENT_NEUTRAL_GLANCE_TICKS = 2 as const;
export type ResidentAttentionState = ActorSuspicionState | "glance" | "none";

/**
 * Human appraisal, not a mutation of the shared perception/recognition kernel.
 * Recognizing a person is not watch duty. The saved belief's first
 * observation owns a brief glance; further sight does not restart it. Strong
 * signals and searches for genuinely uncertain contacts retain their existing
 * attention law. Null means malformed input, never permission to ignore it.
 */
export function queryResidentAttentionState(value: unknown): ResidentAttentionState | null {
  const perception = canonicalizeActorPerceptionState(value);
  if (perception === null) return null;
  if (perception.suspicion !== "identified" && perception.suspicion !== "searching") {
    return perception.suspicion;
  }
  // The canonical owner already orders/bounds attention. Do not parse and
  // copy the same belief store again just to locate its first key.
  const focus = perception.beliefs.find(({ key }) => key === perception.attentionKeys[0]);
  const searched = perception.search === null ? undefined : perception.beliefs.find(
    ({ key }) => key === perception.search?.beliefKey,
  );
  const belief = perception.suspicion === "searching" ? searched : focus;
  if (belief === undefined
    || belief.channel !== "vision"
    || belief.perceivedClass !== "human"
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

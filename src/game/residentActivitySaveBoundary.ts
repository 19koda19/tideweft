import { canonicalizeResidentActivity, RESIDENT_ACTIVITY_MAX_PHASE } from "../sim/residentActivity";
import { hasResidentActivityEventLocus } from "../sim/residentActivityEventLocus";
import type { ResidentState, WorldState } from "../sim/types";

/**
 * Currently supported outer formats predate resident bodies and source-pose
 * extensions. The inner-world codec intentionally supports those foundations;
 * that does not authorize smuggling them through an older session envelope.
 * Presence, including partial/malformed presence, matters here, not decoding.
 */
export function residentActivitySaveExtensionsAbsent(
  world: Pick<WorldState, "residents" | "events">,
): boolean {
  return world.residents.every((resident) => !Object.hasOwn(resident, "activity"))
    && world.events.every((event) => !hasResidentActivityEventLocus(event.data));
}

/**
 * A retained body cohort belongs to one accepted player interval. Genuine
 * whole-roster absence remains legacy; never invent its prior body history.
 * World/task provenance stays with the existing world invariant owner.
 */
export function residentActivitiesMatchPerceptionInterval(
  residents: readonly ResidentState[],
  completedTick: number,
  acceptedPhase: number,
): boolean {
  if (!Number.isSafeInteger(completedTick) || completedTick < 0 || Object.is(completedTick, -0)
    || !Number.isSafeInteger(acceptedPhase) || acceptedPhase < 0 || Object.is(acceptedPhase, -0)
    || acceptedPhase >= RESIDENT_ACTIVITY_MAX_PHASE
  ) return false;
  let present = 0;
  for (const resident of residents) {
    const descriptor = Object.getOwnPropertyDescriptor(resident, "activity");
    if (descriptor === undefined) continue;
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")
      || canonicalizeResidentActivity(descriptor.value, {
        actorId: resident.identity.stableId, tick: completedTick, phase: acceptedPhase,
      }) === null
    ) return false;
    present += 1;
  }
  return present === 0 || present === residents.length;
}

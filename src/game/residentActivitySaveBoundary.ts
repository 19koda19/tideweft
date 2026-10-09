import { canonicalizeResidentActivity, RESIDENT_ACTIVITY_MAX_PHASE, residentActivitySupportsEnvironment, residentActivitySupportsInspection, residentActivitySupportsMaterials, residentActivitySupportsRations, residentActivitySupportsPickup, residentActivitySupportsTravel, residentActivitySupportsTravelEnvironment } from "../sim/residentActivity";
import { hasResidentActivityEventLocus } from "../sim/residentActivityEventLocus";
import { canonicalResidentActivityForWorld, residentCivicActivityCohortIsUniform } from "../sim/residentActivityWorld";
import { canonicalizeResidentCircadianState, residentAtSettlementRestDestination } from "../sim/livingCircadian";
import type { ResidentState, WorldState } from "../sim/types";
import { residentIntroductionEventSchemaValid } from "./residentIntroductionExpression";
import { residentWeatherHoldEventSchemaValid } from "./residentWeatherHoldExpression";
import { workingPeopleDepartureEventSchemaValid } from "./workingPeopleExpression";

/**
 * Historical supported outer formats predate resident bodies and source-pose
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
 * Explicit outer capability, shared by capture and cold load. The complete
 * inner-world and perception-carry validators still own their other invariants.
 * Consumed event loci outlive tasks/memories/contracts: validate their original
 * domain schema, subject and timing, not a later live expression intent.
 */
export function residentActivitySaveExtensionsValid(
  world: WorldState,
  supportsBodies: boolean,
  supportsServices = false,
  supportsCivicService = false,
  supportsInspection = false,
  supportsEnvironment = false,
  supportsPickup = false,
  supportsTravel = false,
  supportsTravelEnvironment = false,
): boolean {
  if (!supportsBodies) return residentActivitySaveExtensionsAbsent(world);
  try {
    const present = world.residents.filter((resident) => Object.hasOwn(resident, "activity"));
    if (present.length === 0) return residentActivitySaveExtensionsAbsent(world);
    if (present.length !== world.residents.length) return false;
    if (!residentCivicActivityCohortIsUniform(world.residents)) return false;
    for (const resident of present) {
      const descriptor = Object.getOwnPropertyDescriptor(resident, "activity");
      const circadian = Object.getOwnPropertyDescriptor(resident, "circadian");
      if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, "value")
        || circadian?.enumerable !== true || !Object.hasOwn(circadian, "value")
        || canonicalResidentActivityForWorld(world, resident) === null
        || canonicalizeResidentCircadianState(circadian.value, {
          residentStableId: resident.identity.stableId,
          homeSettlementId: resident.homeSettlementId,
          atTick: world.meta.completedTick,
          arrivedAtSettlementRest: residentAtSettlementRestDestination(resident),
        }) === null
      ) return false;
      const activity = canonicalResidentActivityForWorld(world, resident);
      if (!supportsServices && residentActivitySupportsRations(activity)) return false;
      if (!supportsCivicService && residentActivitySupportsMaterials(activity)) return false;
      if (!supportsInspection && residentActivitySupportsInspection(activity)) return false;
      if (!supportsEnvironment && residentActivitySupportsEnvironment(activity)) return false;
      if (!supportsPickup && residentActivitySupportsPickup(activity)) return false;
      if (!supportsTravel && residentActivitySupportsTravel(activity)) return false;
      if (!supportsTravelEnvironment && residentActivitySupportsTravelEnvironment(activity)) return false;
    }
    const residentIds = new Set(world.residents.map(({ id }) => id));
    for (const event of world.events) {
      const data = Object.getOwnPropertyDescriptor(event, "data");
      if (data?.enumerable !== true || !Object.hasOwn(data, "value")) return false;
      if (!hasResidentActivityEventLocus(data.value)) continue;
      if (Reflect.ownKeys(data.value).some((key) => {
        const field = Object.getOwnPropertyDescriptor(data.value, key);
        return typeof key !== "string" || field?.enumerable !== true || !Object.hasOwn(field, "value");
      }) || event.tick > world.meta.completedTick) return false;
      switch (event.type) {
        case "resident-introduced":
          if (!residentIds.has(event.subjectId!) || !residentIntroductionEventSchemaValid(event)) return false;
          break;
        case "resident-sheltered":
          if (!residentIds.has(event.subjectId!) || !residentWeatherHoldEventSchemaValid(event)) return false;
          break;
        case "contract-departed":
          if (!residentIds.has(event.data.residentId as number) || !workingPeopleDepartureEventSchemaValid(event)) return false;
          break;
        default:
          return false;
      }
    }
    return true;
  } catch {
    return false;
  }
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

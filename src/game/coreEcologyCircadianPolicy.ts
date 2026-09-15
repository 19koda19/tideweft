import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import { coreEcologyActivityAffordanceProfile } from "./coreEcologyActivityAffordance";
import {
  createLivingCircadianPolicy,
  type LivingCircadianPolicy,
} from "./livingCircadian";

/**
 * Circadian bindings are attached to reusable activity archetypes rather than
 * species switches.  Later catalog breadth can therefore select a proven
 * activity composition without gaining a bespoke scheduler.
 */
const PERCH_WATCH_POLICY = createLivingCircadianPolicy({
  profileId: "day-active",
  drivers: ["clock"],
});

if (PERCH_WATCH_POLICY === null) {
  throw new Error("The canonical perch-watch circadian policy is malformed");
}

export function coreEcologyCircadianPolicyForSpecies(
  species: CoreWildlifeSpecies,
): LivingCircadianPolicy | null {
  const activity = coreEcologyActivityAffordanceProfile(species);
  return activity?.archetypeId === "perch-watch" ? PERCH_WATCH_POLICY : null;
}

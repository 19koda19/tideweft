import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import {
  coreEcologyActivityAffordanceProfile,
  type CoreEcologyActivityArchetypeId,
} from "./coreEcologyActivityAffordance";
import {
  createLivingCircadianPolicy,
  type LivingCircadianDriver,
  type LivingCircadianPolicy,
  type LivingCircadianProfileId,
} from "./livingCircadian";

/**
 * Circadian bindings compose an existing species activity profile with one of
 * four shared routine profiles. Later catalog breadth can therefore select a
 * proven activity composition without gaining a bespoke scheduler.
 */
export interface CoreEcologyCircadianBinding {
  readonly speciesId: CoreWildlifeSpecies;
  readonly activityArchetypeId: CoreEcologyActivityArchetypeId;
  readonly policy: LivingCircadianPolicy;
}

function binding(input: Readonly<{
  speciesId: CoreWildlifeSpecies;
  activityArchetypeId: CoreEcologyActivityArchetypeId;
  profileId: LivingCircadianProfileId;
  drivers: readonly LivingCircadianDriver[];
}>): CoreEcologyCircadianBinding {
  const activity = coreEcologyActivityAffordanceProfile(input.speciesId);
  const policy = createLivingCircadianPolicy({
    profileId: input.profileId,
    drivers: input.drivers,
  });
  if (activity?.archetypeId !== input.activityArchetypeId || policy === null) {
    throw new Error(`Malformed circadian activity binding for ${input.speciesId}`);
  }
  return Object.freeze({
    speciesId: input.speciesId,
    activityArchetypeId: input.activityArchetypeId,
    policy,
  });
}

export const CORE_ECOLOGY_CIRCADIAN_BINDINGS: readonly CoreEcologyCircadianBinding[] =
  Object.freeze([
    binding({
      speciesId: "fish-crow",
      activityArchetypeId: "perch-watch",
      profileId: "day-active",
      drivers: ["clock"],
    }),
    binding({
      speciesId: "north-american-river-otter",
      activityArchetypeId: "shore-water-forager",
      profileId: "night-active",
      drivers: ["clock"],
    }),
  ]);

if (new Set(CORE_ECOLOGY_CIRCADIAN_BINDINGS.map(({ speciesId }) => speciesId)).size
  !== CORE_ECOLOGY_CIRCADIAN_BINDINGS.length) {
  throw new Error("Circadian activity bindings contain a duplicate species");
}

const BINDING_BY_SPECIES = new Map(
  CORE_ECOLOGY_CIRCADIAN_BINDINGS.map((entry) => [entry.speciesId, entry]),
);

export function coreEcologyCircadianPolicyForSpecies(
  species: CoreWildlifeSpecies,
): LivingCircadianPolicy | null {
  const activity = coreEcologyActivityAffordanceProfile(species);
  const authored = BINDING_BY_SPECIES.get(species);
  return activity !== null
    && authored !== undefined
    && activity.archetypeId === authored.activityArchetypeId
    ? authored.policy
    : null;
}

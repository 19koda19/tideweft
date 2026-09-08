import {
  CORE_WILDLIFE_SPECIES,
  getCoreWildlifeProfile,
  type CoreWildlifeEcologicalRole,
  type CoreWildlifeSpecies,
} from "../sim/coreWildlifeIdentity";
import {
  isLivingSpeciesActorAddressable,
  livingSpeciesRegistryEntry,
  type LivingActorSpecies,
} from "./livingSpeciesRegistry";
import {
  coreEcologySpeciesHasRuntimeCapability,
  coreEcologySpeciesPhysicalBodyResourceUnits,
  coreEcologySpeciesPredatorContact,
} from "./coreEcologySpeciesRuntimePolicy";

/**
 * The deliberately small set of relationship classes cognition understands.
 * This is a role/capability resolver, not an authored species-pair outcome
 * table: actual behavior still depends on perception, condition, pathing and
 * the actor policy.
 */
export type CoreEcologyTrophicPerceivedClass =
  | "aerial-predator"
  | "aquatic-foraging-pressure"
  | "food-competitor"
  | "large-predator"
  | "live-prey"
  | "mobbing-pressure"
  | "predator";

/**
 * Optional directly observed behavior. It never promotes neutral co-presence
 * into pressure: the subject must also own the matching runtime capability.
 */
export interface CoreEcologyTrophicObservationContext {
  readonly subjectActivity?: "mobbing";
}

const CORE_SPECIES = new Set<string>(CORE_WILDLIFE_SPECIES);

/**
 * Resolve only an ecologically actionable relationship. `null` means ordinary
 * visual identity should be retained. New species participate by declaring
 * broad roles in the core profile; no `foxDetectRabbit()` branch exists.
 */
export function coreEcologyTrophicPerceivedClass(
  observer: LivingActorSpecies,
  subject: LivingActorSpecies,
  context: CoreEcologyTrophicObservationContext = {},
): CoreEcologyTrophicPerceivedClass | null {
  if (
    context.subjectActivity === "mobbing"
    && coreEcologySpeciesHasRuntimeCapability(observer, "aerial-predator")
    && coreEcologySpeciesHasRuntimeCapability(subject, "mobbing")
  ) return "mobbing-pressure";

  if (observer === subject) {
    return hasRole(observer, "small-predator") ? "food-competitor" : null;
  }

  // Mobbing is an interaction capability, not prey identity. A mobbing-capable
  // observer can therefore recognize an aerial predator without becoming a
  // lawful live-prey target in the reverse direction.
  if (
    coreEcologySpeciesHasRuntimeCapability(observer, "mobbing")
    && coreEcologySpeciesHasRuntimeCapability(subject, "aerial-predator")
  ) return "aerial-predator";

  const observerIsSmallPrey = hasRole(observer, "small-prey");
  const observerIsPrey = observerIsSmallPrey || hasRole(observer, "prey");
  const observerIsSmallPredator = hasRole(observer, "small-predator");
  const observerIsPredator = observerIsSmallPredator || hasRole(observer, "predator");
  const subjectIsSmallPrey = hasRole(subject, "small-prey");
  const subjectIsPrey = subjectIsSmallPrey || hasRole(subject, "prey");
  const subjectIsSmallPredator = hasRole(subject, "small-predator");
  const subjectIsPredator = subjectIsSmallPredator || hasRole(subject, "predator");
  const subjectIsAddressable = isLivingSpeciesActorAddressable(subject);
  const observerCanPursue = canPursueLivePreyRole(observer);
  const subjectCanBePursued = canBeLivePreySubject(subject);

  // Aquatic foraging is a reusable observed-role relationship rather than a
  // declaration that every wader is a general predator. Small aquatic or
  // amphibious prey can recognize pressure from any addressable actor that
  // owns this capability. The reverse direction remains non-pursuit because
  // aggregate prey has no actor address and this resolver creates no capture,
  // consumption, mortality, or custody outcome.
  if (
    observerIsSmallPrey
    && (
      coreEcologySpeciesHasRuntimeCapability(observer, "aquatic-locomotion")
      || coreEcologySpeciesHasRuntimeCapability(observer, "amphibious-locomotion")
    )
    && subjectIsAddressable
    && coreEcologySpeciesHasRuntimeCapability(subject, "aquatic-foraging")
  ) return "aquatic-foraging-pressure";

  // A broad predator is currently the large-predator capability. It pressures
  // smaller predators, prey, domestic dogs and humans without implying combat.
  if (subjectIsPredator && !subjectIsSmallPredator) return "large-predator";

  // The current domestic dog has no wildlife trophic profile. Its already-live
  // physical scale and canid behavior make it a plausible pressure source for
  // small prey/predators, without changing established deer behavior.
  if (subject === "domestic-dog" && (observerIsSmallPrey || observerIsSmallPredator)) {
    return "predator";
  }

  // The food web distinguishes small predators from broad predators, while
  // the capability and victim witness below prevent a role alone from
  // activating pursuit or routing a grouped body into solitary mortality.
  if (
    observerCanPursue
    && observerIsSmallPredator
    && subjectIsSmallPrey
    && subjectCanBePursued
  ) return "live-prey";
  if (
    observerCanPursue
    && observerIsPredator
    && !observerIsSmallPredator
    && subjectIsPrey
    && subjectCanBePursued
  ) return "live-prey";

  if (observerIsSmallPrey && subjectIsPredator) return "predator";
  if (observerIsPrey && subjectIsPredator && !subjectIsSmallPredator) {
    return "large-predator";
  }
  if (observerIsSmallPredator && subjectIsSmallPredator) return "food-competitor";

  return null;
}

/** True only when the same trophic declaration makes the subject live prey. */
export function coreEcologyCanPursueLivingActor(
  observer: LivingActorSpecies,
  subject: LivingActorSpecies,
): boolean {
  return canPursueLivePreyRole(observer)
    && canBeLivePreySubject(subject)
    && coreEcologyTrophicPerceivedClass(observer, subject) === "live-prey";
}

/**
 * Mortality is deliberately narrower than trophic pursuit. Group members may
 * be perceived and chased through their ordinary actor addresses, but the
 * current body owner can retire only a solitary exact actor. Keeping this
 * witness separate preserves nonlethal predator pressure without inventing a
 * partial group-member injury, death, or carcass transaction.
 */
export function coreEcologyCanResolveMortalityTarget(
  attacker: LivingActorSpecies,
  victim: LivingActorSpecies,
): boolean {
  return coreEcologyCanPursueLivingActor(attacker, victim)
    && coreEcologySpeciesPredatorContact(attacker) !== null
    && livingSpeciesRegistryEntry(victim)?.groupOrganization === null
    && coreEcologySpeciesPhysicalBodyResourceUnits(victim) > 0;
}

/**
 * A pursuit is an authored predator ability backed by an actual food-web
 * affinity. Merely adding a predator-looking role or a positive affinity can
 * never activate it on its own.
 */
function canPursueLivePreyRole(species: LivingActorSpecies): boolean {
  if (!CORE_SPECIES.has(species)) return false;
  const profile = getCoreWildlifeProfile(species as CoreWildlifeSpecies);
  return coreEcologySpeciesHasRuntimeCapability(species, "live-prey-pursuit")
    && (profile.roles.includes("predator") || profile.roles.includes("small-predator"))
    && profile.foodAffinities["live-prey"] > 0
    && profile.behavior.maximumPursuitTicks > 0;
}

/**
 * Pursuit is an attention and locomotion contract, not a promise that the
 * current mortality owner can injure or retire the target. Any addressable
 * authored prey may therefore create pressure, including a grouped member.
 */
function canBeLivePreySubject(species: LivingActorSpecies): boolean {
  if (!CORE_SPECIES.has(species)) return false;
  const profile = getCoreWildlifeProfile(species as CoreWildlifeSpecies);
  return isLivingSpeciesActorAddressable(species)
    && (profile.roles.includes("prey") || profile.roles.includes("small-prey"));
}

function hasRole(
  species: LivingActorSpecies,
  role: CoreWildlifeEcologicalRole,
): boolean {
  if (!CORE_SPECIES.has(species)) return false;
  return getCoreWildlifeProfile(species as CoreWildlifeSpecies).roles.includes(role);
}

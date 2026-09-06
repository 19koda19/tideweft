import {
  CORE_WILDLIFE_SPECIES,
  getCoreWildlifeProfile,
  type CoreWildlifeEcologicalRole,
  type CoreWildlifeSpecies,
} from "../sim/coreWildlifeIdentity";
import {
  isLivingSpeciesActorAddressable,
  type LivingActorSpecies,
} from "./livingSpeciesRegistry";
import {
  coreEcologySpeciesHasRuntimeCapability,
} from "./coreEcologySpeciesRuntimePolicy";

/**
 * The deliberately small set of relationship classes cognition understands.
 * This is a role/capability resolver, not an authored species-pair outcome
 * table: actual behavior still depends on perception, condition, pathing and
 * the actor policy.
 */
export type CoreEcologyTrophicPerceivedClass =
  | "aerial-predator"
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

  // A broad predator is currently the large-predator capability. It pressures
  // smaller predators, prey, domestic dogs and humans without implying combat.
  if (subjectIsPredator && !subjectIsSmallPredator) return "large-predator";

  // The current domestic dog has no wildlife trophic profile. Its already-live
  // physical scale and canid behavior make it a plausible pressure source for
  // small prey/predators, without changing established deer behavior.
  if (subject === "domestic-dog" && (observerIsSmallPrey || observerIsSmallPredator)) {
    return "predator";
  }

  // Small predators can pursue only prey that explicitly declares SMALL_PREY;
  // this prevents a fox-sized profile from silently treating deer as food.
  if (observerIsSmallPredator && subjectIsSmallPrey && subjectIsAddressable) return "live-prey";
  if (
    observerIsPredator
    && !observerIsSmallPredator
    && subjectIsPrey
    && subjectIsAddressable
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
  return isLivingSpeciesActorAddressable(subject)
    && coreEcologySpeciesHasRuntimeCapability(observer, "small-prey-pursuit")
    && coreEcologyTrophicPerceivedClass(observer, subject) === "live-prey";
}

function hasRole(
  species: LivingActorSpecies,
  role: CoreWildlifeEcologicalRole,
): boolean {
  if (!CORE_SPECIES.has(species)) return false;
  return getCoreWildlifeProfile(species as CoreWildlifeSpecies).roles.includes(role);
}

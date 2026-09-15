import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import {
  FIXED_POINT,
  type WeatherKind,
} from "../sim/types";
import {
  CORE_ECOLOGY_ACTIVITY_AFFORDANCE_SPECIES,
  coreEcologyActivityAffordanceProfile,
  type CoreEcologyActivityArchetypeId,
} from "./coreEcologyActivityAffordance";
import {
  createLivingCircadianPolicy,
  type LivingCircadianDriver,
  type LivingCircadianPolicy,
  type LivingCircadianProfileId,
} from "./livingCircadian";

/** Ordinary rain must be established before it can extend waterfowl activity. */
export const CORE_ECOLOGY_ORDINARY_RAIN_ACTIVITY_MINIMUM_INTENSITY = 250_000 as const;

export interface CoreEcologyCircadianWeatherResponse {
  /** Stable response identity used in deterministic routine provenance. */
  readonly responseId: string;
  readonly weatherKinds: readonly WeatherKind[];
  readonly minimumIntensity: number;
  readonly effect: "activity-driver" | "dangerous-weather-rest";
}

/**
 * Circadian bindings compose an existing species activity profile with one of
 * four shared routine profiles. Later catalog breadth can therefore select a
 * proven activity composition without gaining a bespoke scheduler.
 */
export interface CoreEcologyCircadianBinding {
  readonly speciesId: CoreWildlifeSpecies;
  readonly activityArchetypeId: CoreEcologyActivityArchetypeId;
  readonly policy: LivingCircadianPolicy;
  /** Data-declared weather composition; an empty list means no authored weather response. */
  readonly weatherResponses: readonly CoreEcologyCircadianWeatherResponse[];
}

function binding(input: Readonly<{
  speciesId: CoreWildlifeSpecies;
  activityArchetypeId: CoreEcologyActivityArchetypeId;
  profileId: LivingCircadianProfileId;
  drivers: readonly LivingCircadianDriver[];
  weatherResponses?: readonly CoreEcologyCircadianWeatherResponse[];
}>): CoreEcologyCircadianBinding {
  const activity = coreEcologyActivityAffordanceProfile(input.speciesId);
  const policy = createLivingCircadianPolicy({
    profileId: input.profileId,
    drivers: input.drivers,
  });
  const weatherResponses = input.weatherResponses ?? [];
  if (
    activity?.archetypeId !== input.activityArchetypeId
    || policy === null
    || !validWeatherResponses(weatherResponses)
    || policy.drivers.includes("weather") !== (weatherResponses.length > 0)
  ) {
    throw new Error(`Malformed circadian activity binding for ${input.speciesId}`);
  }
  return deepFreeze({
    speciesId: input.speciesId,
    activityArchetypeId: input.activityArchetypeId,
    policy,
    weatherResponses: weatherResponses.map((response) => ({
      ...response,
      weatherKinds: [...response.weatherKinds],
    })),
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
      speciesId: "northern-harrier",
      activityArchetypeId: "low-quartering",
      profileId: "day-active",
      drivers: ["clock"],
    }),
    binding({
      speciesId: "snowy-egret",
      activityArchetypeId: "tidal-wader",
      profileId: "adaptive-active",
      drivers: ["clock", "tide", "opportunity"],
    }),
    binding({
      speciesId: "american-black-duck",
      activityArchetypeId: "dabbling-waterfowl",
      profileId: "day-active",
      drivers: ["clock", "weather"],
      weatherResponses: [
        {
          responseId: "ordinary-rain-activity",
          weatherKinds: ["rain"],
          minimumIntensity: CORE_ECOLOGY_ORDINARY_RAIN_ACTIVITY_MINIMUM_INTENSITY,
          effect: "activity-driver",
        },
        {
          responseId: "storm-refuge",
          weatherKinds: ["storm"],
          minimumIntensity: 0,
          effect: "dangerous-weather-rest",
        },
      ],
    }),
    binding({
      speciesId: "north-american-river-otter",
      activityArchetypeId: "shore-water-forager",
      profileId: "night-active",
      drivers: ["clock"],
    }),
    binding({
      speciesId: "gull",
      activityArchetypeId: "aerial-surface-opportunist",
      profileId: "day-active",
      drivers: ["clock"],
    }),
    binding({
      speciesId: "golden-eagle",
      activityArchetypeId: "ridge-soar-perch",
      profileId: "day-active",
      drivers: ["clock"],
    }),
    binding({
      speciesId: "harbor-seal",
      activityArchetypeId: "shore-water-forager",
      profileId: "day-active",
      drivers: ["clock"],
    }),
    binding({
      speciesId: "great-blue-heron",
      activityArchetypeId: "anchored-wader",
      profileId: "day-active",
      drivers: ["clock"],
    }),
    binding({
      speciesId: "common-tern",
      activityArchetypeId: "aerial-surface-opportunist",
      profileId: "day-active",
      drivers: ["clock"],
    }),
    binding({
      speciesId: "osprey",
      activityArchetypeId: "aerial-surface-opportunist",
      profileId: "day-active",
      drivers: ["clock"],
    }),
    binding({
      speciesId: "greater-yellowlegs",
      activityArchetypeId: "anchored-wader",
      profileId: "day-active",
      drivers: ["clock"],
    }),
    binding({
      speciesId: "belted-kingfisher",
      activityArchetypeId: "aerial-surface-opportunist",
      profileId: "day-active",
      drivers: ["clock"],
    }),
    binding({
      speciesId: "double-crested-cormorant",
      activityArchetypeId: "diving-waterbird",
      profileId: "day-active",
      drivers: ["clock"],
    }),
    binding({
      speciesId: "seaside-sparrow",
      activityArchetypeId: "perch-forage",
      profileId: "day-active",
      drivers: ["clock"],
    }),
    binding({
      speciesId: "diamondback-terrapin",
      activityArchetypeId: "amphibious-margin-forager",
      profileId: "day-active",
      drivers: ["clock"],
    }),
    binding({
      speciesId: "marsh-rabbit",
      activityArchetypeId: "ground-cover-forager",
      profileId: "twilight-active",
      drivers: ["clock"],
    }),
  ]);

if (new Set(CORE_ECOLOGY_CIRCADIAN_BINDINGS.map(({ speciesId }) => speciesId)).size
  !== CORE_ECOLOGY_CIRCADIAN_BINDINGS.length) {
  throw new Error("Circadian activity bindings contain a duplicate species");
}
if (
  CORE_ECOLOGY_CIRCADIAN_BINDINGS.length
    !== CORE_ECOLOGY_ACTIVITY_AFFORDANCE_SPECIES.length
  || CORE_ECOLOGY_CIRCADIAN_BINDINGS.some(({ speciesId }, index) => (
    speciesId !== CORE_ECOLOGY_ACTIVITY_AFFORDANCE_SPECIES[index]
  ))
) {
  throw new Error("Circadian activity bindings do not exactly cover the activity roster");
}

const BINDING_BY_SPECIES = new Map(
  CORE_ECOLOGY_CIRCADIAN_BINDINGS.map((entry) => [entry.speciesId, entry]),
);

export function coreEcologyCircadianPolicyForSpecies(
  species: CoreWildlifeSpecies,
): LivingCircadianPolicy | null {
  return coreEcologyCircadianBindingForSpecies(species)?.policy ?? null;
}

export function coreEcologyCircadianBindingForSpecies(
  species: CoreWildlifeSpecies,
): CoreEcologyCircadianBinding | null {
  const activity = coreEcologyActivityAffordanceProfile(species);
  const authored = BINDING_BY_SPECIES.get(species);
  return activity !== null
    && authored !== undefined
    && activity.archetypeId === authored.activityArchetypeId
    ? authored
    : null;
}

function validWeatherResponses(
  responses: readonly CoreEcologyCircadianWeatherResponse[],
): boolean {
  if (!Array.isArray(responses)) return false;
  const responseIds = new Set<string>();
  for (const response of responses) {
    if (
      typeof response !== "object"
      || response === null
      || Array.isArray(response)
      || typeof response.responseId !== "string"
      || response.responseId.length === 0
      || response.responseId.length > 128
      || responseIds.has(response.responseId)
      || !Array.isArray(response.weatherKinds)
      || response.weatherKinds.length === 0
      || new Set(response.weatherKinds).size !== response.weatherKinds.length
      || response.weatherKinds.some((kind: WeatherKind) => (
        kind !== "clear" && kind !== "mist" && kind !== "rain" && kind !== "storm"
      ))
      || !Number.isSafeInteger(response.minimumIntensity)
      || response.minimumIntensity < 0
      || response.minimumIntensity > FIXED_POINT
      || (
        response.effect !== "activity-driver"
        && response.effect !== "dangerous-weather-rest"
      )
    ) return false;
    responseIds.add(response.responseId);
  }
  return true;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

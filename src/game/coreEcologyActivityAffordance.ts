import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import type { CoreWildlifeTravelMedium } from "./coreWildlifeLocomotionProfile";
import {
  CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES,
  isCoreEcologySpeciesRuntimeCapability,
  isCoreEcologySpeciesRuntimePolicy,
  type CoreEcologySpeciesRuntimeCapability,
  type CoreEcologySpeciesRuntimePolicy,
} from "./coreEcologySpeciesRuntimePolicy";
import type { LivingSpeciesLocomotionClass } from "./livingSpeciesRegistry";

export const CORE_ECOLOGY_ACTIVITY_AFFORDANCE_VERSION = 1 as const;
export const CORE_ECOLOGY_ACTIVITY_AFFORDANCE_OWNER_ID =
  "game:core-ecology-activity-affordance:v1" as const;

/**
 * Reusable neutral-activity compositions. They describe what an activity owner
 * may ask shared perception, habitat, and locomotion owners to do; they do not
 * implement another species decision tree.
 */
export const CORE_ECOLOGY_ACTIVITY_ARCHETYPE_IDS = Object.freeze([
  "perch-watch",
  "low-quartering",
  "tidal-wader",
  "dabbling-waterfowl",
  "shore-water-forager",
  "aerial-surface-opportunist",
] as const);

export type CoreEcologyActivityArchetypeId =
  (typeof CORE_ECOLOGY_ACTIVITY_ARCHETYPE_IDS)[number];

export const CORE_ECOLOGY_ACTIVITY_DESTINATION_SEMANTICS = Object.freeze([
  "authenticated-habitat-anchor",
  "authenticated-habitat-perch",
  "deterministic-local-quartering-area",
  "authenticated-tidal-refuge",
  "authenticated-depth-safe-wading-ground",
  "authenticated-depth-safe-dabbling-water",
  "authenticated-foraging-water",
  "authenticated-dry-haulout",
  "observed-surface-opportunity",
] as const);

export type CoreEcologyActivityDestinationSemantic =
  (typeof CORE_ECOLOGY_ACTIVITY_DESTINATION_SEMANTICS)[number];

export type CoreEcologyActivityDestinationAuthority =
  | "current-lawful-observation"
  | "deterministic-local-area"
  | "habitat-allocation"
  | "tidal-habitat";

export const CORE_ECOLOGY_ACTIVITY_PRESENTATION_SIGNALS = Object.freeze([
  "aquatic-foraging",
  "dabbling-forage",
  "low-quartering-flight",
  "perched",
  "resting",
  "shore-water-relocation",
  "surface-diving",
  "surface-opportunity-flight",
  "surface-swimming",
  "tidal-relocation-flight",
  "wading-scan",
  "wading-search",
] as const);

export type CoreEcologyActivityPresentationSignal =
  (typeof CORE_ECOLOGY_ACTIVITY_PRESENTATION_SIGNALS)[number];

export type CoreEcologyActivityScheduleScope = "bounded-diurnal-window";

export interface CoreEcologyActivityDestinationAffordance {
  readonly semantic: CoreEcologyActivityDestinationSemantic;
  /** The owner that must authenticate a destination before movement begins. */
  readonly authority: CoreEcologyActivityDestinationAuthority;
  readonly allowedTravelMedia: readonly CoreWildlifeTravelMedium[];
}

export type CoreEcologyActivityObservationAffordance =
  | Readonly<{ readonly kind: "none" }>
  | Readonly<{
      readonly kind: "current-anonymous-area";
      readonly channel: "vision";
      readonly perceivedClass: "aquatic-activity";
      readonly subjectIdentity: "anonymous";
      readonly freshness: "same-tick";
      readonly requiresLineOfSight: true;
    }>;

export interface CoreEcologyActivityArchetype {
  readonly version: typeof CORE_ECOLOGY_ACTIVITY_AFFORDANCE_VERSION;
  readonly ownerId: typeof CORE_ECOLOGY_ACTIVITY_AFFORDANCE_OWNER_ID;
  readonly archetypeId: CoreEcologyActivityArchetypeId;
  readonly requiredCapabilities: readonly CoreEcologySpeciesRuntimeCapability[];
  readonly locomotionClass: LivingSpeciesLocomotionClass;
  readonly allowedTravelMedia: readonly CoreWildlifeTravelMedium[];
  readonly destinations: readonly CoreEcologyActivityDestinationAffordance[];
  readonly observationAffordance: CoreEcologyActivityObservationAffordance;
  readonly presentationSignals: readonly CoreEcologyActivityPresentationSignal[];
  /** This remains narrower than a future sleep or circadian-life owner. */
  readonly scheduleScope: CoreEcologyActivityScheduleScope;
}

export const CORE_ECOLOGY_ACTIVITY_AFFORDANCE_SPECIES = Object.freeze([
  "fish-crow",
  "northern-harrier",
  "snowy-egret",
  "american-black-duck",
  "north-american-river-otter",
  "gull",
] as const satisfies readonly CoreWildlifeSpecies[]);

export type CoreEcologyActivityAffordanceSpecies =
  (typeof CORE_ECOLOGY_ACTIVITY_AFFORDANCE_SPECIES)[number];

export interface CoreEcologyActivityAffordanceProfile
  extends CoreEcologyActivityArchetype {
  readonly profileId: string;
  readonly speciesId: CoreEcologyActivityAffordanceSpecies;
}

const NONE_OBSERVATION = Object.freeze({ kind: "none" as const });
const CURRENT_AQUATIC_ACTIVITY_OBSERVATION = Object.freeze({
  kind: "current-anonymous-area" as const,
  channel: "vision" as const,
  perceivedClass: "aquatic-activity" as const,
  subjectIdentity: "anonymous" as const,
  freshness: "same-tick" as const,
  requiresLineOfSight: true as const,
});

function destination(
  semantic: CoreEcologyActivityDestinationSemantic,
  authority: CoreEcologyActivityDestinationAuthority,
  allowedTravelMedia: readonly CoreWildlifeTravelMedium[],
): CoreEcologyActivityDestinationAffordance {
  return Object.freeze({
    semantic,
    authority,
    allowedTravelMedia: Object.freeze([...allowedTravelMedia]),
  });
}

function archetype(
  value: Omit<
    CoreEcologyActivityArchetype,
    "ownerId" | "scheduleScope" | "version"
  >,
): CoreEcologyActivityArchetype {
  return deepFreeze({
    version: CORE_ECOLOGY_ACTIVITY_AFFORDANCE_VERSION,
    ownerId: CORE_ECOLOGY_ACTIVITY_AFFORDANCE_OWNER_ID,
    scheduleScope: "bounded-diurnal-window" as const,
    ...value,
  });
}

/**
 * Ordered independently of the species catalog. New species reuse one of
 * these contracts (or append a new coherent archetype) instead of introducing
 * a species-name switch or a pairwise interaction row.
 */
export const CORE_ECOLOGY_ACTIVITY_ARCHETYPES: readonly CoreEcologyActivityArchetype[] =
  Object.freeze([
    archetype({
      archetypeId: "perch-watch",
      requiredCapabilities: [
        "actor-address",
        "aerial-locomotion",
        "diurnal-activity",
        "perch",
      ],
      locomotionClass: "aerial",
      allowedTravelMedia: ["air"],
      destinations: [
        destination("authenticated-habitat-perch", "habitat-allocation", ["air"]),
      ],
      observationAffordance: NONE_OBSERVATION,
      presentationSignals: ["perched", "resting"],
    }),
    archetype({
      archetypeId: "low-quartering",
      requiredCapabilities: [
        "actor-address",
        "aerial-locomotion",
        "aerial-predator",
        "diurnal-activity",
        "live-prey-pursuit",
      ],
      locomotionClass: "aerial",
      allowedTravelMedia: ["air"],
      destinations: [
        destination(
          "deterministic-local-quartering-area",
          "deterministic-local-area",
          ["air"],
        ),
      ],
      observationAffordance: NONE_OBSERVATION,
      presentationSignals: ["low-quartering-flight", "resting"],
    }),
    archetype({
      archetypeId: "tidal-wader",
      requiredCapabilities: [
        "actor-address",
        "aerial-locomotion",
        "amphibious-locomotion",
        "aquatic-foraging",
        "diurnal-activity",
        "movement-memory",
        "surface-opportunity",
        "tidal-activity",
        "wading",
        "water-depth-response",
      ],
      locomotionClass: "amphibious",
      allowedTravelMedia: ["air"],
      destinations: [
        destination("authenticated-tidal-refuge", "tidal-habitat", ["air"]),
        destination(
          "authenticated-depth-safe-wading-ground",
          "tidal-habitat",
          ["air"],
        ),
      ],
      observationAffordance: CURRENT_AQUATIC_ACTIVITY_OBSERVATION,
      presentationSignals: [
        "resting",
        "tidal-relocation-flight",
        "wading-scan",
        "wading-search",
      ],
    }),
    archetype({
      archetypeId: "dabbling-waterfowl",
      requiredCapabilities: [
        "actor-address",
        "aerial-locomotion",
        "amphibious-locomotion",
        "aquatic-foraging",
        "aquatic-locomotion",
        "diurnal-activity",
        "movement-memory",
        "surface-opportunity",
        "tidal-activity",
        "water-depth-response",
      ],
      locomotionClass: "amphibious",
      allowedTravelMedia: ["air", "surface-water"],
      destinations: [
        destination("authenticated-tidal-refuge", "tidal-habitat", ["air"]),
        destination(
          "authenticated-depth-safe-dabbling-water",
          "tidal-habitat",
          ["air", "surface-water"],
        ),
      ],
      observationAffordance: CURRENT_AQUATIC_ACTIVITY_OBSERVATION,
      presentationSignals: [
        "dabbling-forage",
        "resting",
        "surface-swimming",
        "tidal-relocation-flight",
      ],
    }),
    archetype({
      archetypeId: "shore-water-forager",
      requiredCapabilities: [
        "actor-address",
        "amphibious-locomotion",
        "aquatic-foraging",
        "aquatic-locomotion",
        "diurnal-activity",
        "movement-memory",
        "shore-water-activity",
        "surface-opportunity",
        "tidal-activity",
        "water-depth-response",
      ],
      locomotionClass: "amphibious",
      allowedTravelMedia: ["amphibious"],
      destinations: [
        destination("authenticated-foraging-water", "tidal-habitat", ["amphibious"]),
        destination("authenticated-dry-haulout", "tidal-habitat", ["amphibious"]),
      ],
      observationAffordance: CURRENT_AQUATIC_ACTIVITY_OBSERVATION,
      presentationSignals: [
        "aquatic-foraging",
        "resting",
        "shore-water-relocation",
        "surface-diving",
        "surface-swimming",
      ],
    }),
    archetype({
      archetypeId: "aerial-surface-opportunist",
      requiredCapabilities: [
        "actor-address",
        "aerial-locomotion",
        "diurnal-activity",
        "surface-opportunity",
        "tidal-activity",
      ],
      locomotionClass: "aerial",
      allowedTravelMedia: ["air"],
      destinations: [
        destination("authenticated-habitat-anchor", "habitat-allocation", ["air"]),
        destination(
          "observed-surface-opportunity",
          "current-lawful-observation",
          ["air"],
        ),
      ],
      observationAffordance: CURRENT_AQUATIC_ACTIVITY_OBSERVATION,
      presentationSignals: [
        "resting",
        "surface-opportunity-flight",
        "tidal-relocation-flight",
      ],
    }),
  ]);

const ARCHETYPE_BY_ID = new Map<CoreEcologyActivityArchetypeId, CoreEcologyActivityArchetype>(
  CORE_ECOLOGY_ACTIVITY_ARCHETYPES.map((entry) => [entry.archetypeId, entry]),
);

const ARCHETYPE_ASSIGNMENTS: Readonly<
  Record<CoreEcologyActivityAffordanceSpecies, CoreEcologyActivityArchetypeId>
> = Object.freeze({
  "fish-crow": "perch-watch",
  "northern-harrier": "low-quartering",
  "snowy-egret": "tidal-wader",
  "american-black-duck": "dabbling-waterfowl",
  "north-american-river-otter": "shore-water-forager",
  gull: "aerial-surface-opportunist",
});

function composeProfile(
  speciesId: CoreEcologyActivityAffordanceSpecies,
): CoreEcologyActivityAffordanceProfile {
  const archetypeId = ARCHETYPE_ASSIGNMENTS[speciesId];
  const activityArchetype = ARCHETYPE_BY_ID.get(archetypeId);
  if (activityArchetype === undefined) {
    throw new Error(`Missing core ecology activity archetype ${archetypeId}`);
  }
  return deepFreeze({
    ...activityArchetype,
    profileId: `core-ecology-activity:${speciesId}:v${CORE_ECOLOGY_ACTIVITY_AFFORDANCE_VERSION}`,
    speciesId,
  });
}

export const CORE_ECOLOGY_ACTIVITY_AFFORDANCE_PROFILES:
readonly CoreEcologyActivityAffordanceProfile[] = Object.freeze(
  CORE_ECOLOGY_ACTIVITY_AFFORDANCE_SPECIES.map(composeProfile),
);

const PROFILE_BY_SPECIES = new Map<
  CoreEcologyActivityAffordanceSpecies,
  CoreEcologyActivityAffordanceProfile
>(CORE_ECOLOGY_ACTIVITY_AFFORDANCE_PROFILES.map((profile) => [profile.speciesId, profile]));
const ACTIVITY_SPECIES_SET = new Set<string>(CORE_ECOLOGY_ACTIVITY_AFFORDANCE_SPECIES);
const ARCHETYPE_ID_SET = new Set<string>(CORE_ECOLOGY_ACTIVITY_ARCHETYPE_IDS);
const DESTINATION_SEMANTIC_SET = new Set<string>(
  CORE_ECOLOGY_ACTIVITY_DESTINATION_SEMANTICS,
);
const PRESENTATION_SIGNAL_SET = new Set<string>(CORE_ECOLOGY_ACTIVITY_PRESENTATION_SIGNALS);
const TRAVEL_MEDIUM_SET = new Set<string>(["air", "amphibious", "surface-water"]);
const LOCOMOTION_CLASS_SET = new Set<string>([
  "aerial",
  "amphibious",
  "aquatic",
  "terrestrial",
]);
const DESTINATION_AUTHORITY_SET = new Set<string>([
  "current-lawful-observation",
  "deterministic-local-area",
  "habitat-allocation",
  "tidal-habitat",
]);

export function coreEcologyActivityArchetype(
  archetypeId: unknown,
): CoreEcologyActivityArchetype | null {
  return typeof archetypeId === "string"
    ? ARCHETYPE_BY_ID.get(archetypeId as CoreEcologyActivityArchetypeId) ?? null
    : null;
}

/** Unknown or unowned species never inherit a default activity. */
export function coreEcologyActivityAffordanceProfile(
  speciesId: unknown,
): CoreEcologyActivityAffordanceProfile | null {
  return typeof speciesId === "string"
    ? PROFILE_BY_SPECIES.get(speciesId as CoreEcologyActivityAffordanceSpecies) ?? null
    : null;
}

/** Strict guard for trusted canonical profile-shaped data. */
export function isCoreEcologyActivityAffordanceProfile(
  value: unknown,
): value is CoreEcologyActivityAffordanceProfile {
  if (!plainRecord(value) || typeof value.speciesId !== "string") return false;
  const canonical = coreEcologyActivityAffordanceProfile(value.speciesId);
  return canonical !== null && sameData(canonical, value);
}

/**
 * Stable fail-closed diagnostics for the activity registry and its canonical
 * runtime-policy dependencies. Inputs are injectable only for build-gate and
 * migration tests; gameplay callers use the frozen defaults.
 */
export function validateCoreEcologyActivityAffordances(
  profiles: readonly unknown[] = CORE_ECOLOGY_ACTIVITY_AFFORDANCE_PROFILES,
  policies: readonly unknown[] = CORE_ECOLOGY_SPECIES_RUNTIME_POLICIES,
): readonly string[] {
  const errors = [...validateArchetypes(CORE_ECOLOGY_ACTIVITY_ARCHETYPES)];
  const policyBySpecies = new Map<CoreWildlifeSpecies, CoreEcologySpeciesRuntimePolicy>();
  for (const [index, value] of policies.entries()) {
    if (!plainRecord(value) || typeof value.speciesId !== "string") {
      errors.push(`runtime-policy[${index}]:invalid-policy`);
      continue;
    }
    const speciesId = value.speciesId as CoreWildlifeSpecies;
    if (!isCoreEcologySpeciesRuntimePolicy(value)) {
      errors.push(`${value.speciesId}:noncanonical-runtime-policy`);
      continue;
    }
    if (policyBySpecies.has(speciesId)) {
      errors.push(`${speciesId}:duplicate-runtime-policy`);
      continue;
    }
    policyBySpecies.set(speciesId, value);
  }

  const profileBySpecies = new Map<
    CoreEcologyActivityAffordanceSpecies,
    CoreEcologyActivityAffordanceProfile
  >();
  const profileIds = new Set<string>();
  for (const [index, value] of profiles.entries()) {
    if (!isActivityAffordanceProfileShape(value)) {
      errors.push(`activity-profile[${index}]:invalid-profile`);
      continue;
    }
    if (!ACTIVITY_SPECIES_SET.has(value.speciesId)) {
      errors.push(`${value.speciesId}:unsupported-activity-profile`);
      continue;
    }
    const speciesId = value.speciesId as CoreEcologyActivityAffordanceSpecies;
    if (profileBySpecies.has(speciesId)) {
      errors.push(`${speciesId}:duplicate-activity-profile`);
      continue;
    }
    profileBySpecies.set(speciesId, value as CoreEcologyActivityAffordanceProfile);
    if (profileIds.has(value.profileId)) {
      errors.push(`${value.profileId}:duplicate-profile-id`);
    }
    profileIds.add(value.profileId);

    const expectedIndex = CORE_ECOLOGY_ACTIVITY_AFFORDANCE_SPECIES.indexOf(speciesId);
    if (index !== expectedIndex) errors.push(`${speciesId}:registry-order-mismatch`);
    const expectedProfileId =
      `core-ecology-activity:${speciesId}:v${CORE_ECOLOGY_ACTIVITY_AFFORDANCE_VERSION}`;
    if (value.profileId !== expectedProfileId) {
      errors.push(`${speciesId}:profile-id-mismatch`);
    }
    const expectedArchetypeId = ARCHETYPE_ASSIGNMENTS[speciesId];
    if (value.archetypeId !== expectedArchetypeId) {
      errors.push(`${speciesId}:archetype-assignment-mismatch`);
    }
    const expectedArchetype = ARCHETYPE_BY_ID.get(expectedArchetypeId);
    if (expectedArchetype === undefined || !profileComposesArchetype(value, expectedArchetype)) {
      errors.push(`${speciesId}:archetype-data-mismatch`);
    }
  }

  for (const speciesId of CORE_ECOLOGY_ACTIVITY_AFFORDANCE_SPECIES) {
    const profile = profileBySpecies.get(speciesId);
    if (profile === undefined) {
      errors.push(`${speciesId}:missing-activity-profile`);
      continue;
    }
    const policy = policyBySpecies.get(speciesId);
    if (policy === undefined) {
      errors.push(`${speciesId}:missing-runtime-policy`);
      continue;
    }
    if (
      !policy.actorAddressable
      || policy.identityForm !== "individual"
      || !policy.capabilities.includes("actor-address")
    ) errors.push(`${speciesId}:activity-requires-addressable-individual`);
    if (profile.locomotionClass !== policy.locomotionClass) {
      errors.push(`${speciesId}:locomotion-class-policy-mismatch`);
    }
    for (const capability of profile.requiredCapabilities) {
      if (!policy.capabilities.includes(capability)) {
        errors.push(`${speciesId}:missing-${capability}`);
      }
    }
    for (const medium of profile.allowedTravelMedia) {
      if (!policySupportsTravelMedium(policy, medium)) {
        errors.push(`${speciesId}:unsupported-${medium}-travel-medium`);
      }
    }
  }

  for (const policy of policyBySpecies.values()) {
    if (
      policy.capabilities.includes("diurnal-activity")
      && !profileBySpecies.has(policy.speciesId as CoreEcologyActivityAffordanceSpecies)
    ) errors.push(`${policy.speciesId}:diurnal-activity-has-no-affordance-profile`);
  }

  return Object.freeze([...new Set(errors)].sort(compareText));
}

export function assertCoreEcologyActivityAffordances(): void {
  const errors = validateCoreEcologyActivityAffordances();
  if (errors.length > 0) {
    throw new Error(`Core ecology activity affordances are incoherent: ${errors.join(", ")}`);
  }
}

function validateArchetypes(
  archetypes: readonly unknown[],
): readonly string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const [index, value] of archetypes.entries()) {
    if (!isActivityArchetypeShape(value)) {
      errors.push(`activity-archetype[${index}]:invalid-archetype`);
      continue;
    }
    if (seen.has(value.archetypeId)) {
      errors.push(`${value.archetypeId}:duplicate-activity-archetype`);
      continue;
    }
    seen.add(value.archetypeId);
    if (index !== CORE_ECOLOGY_ACTIVITY_ARCHETYPE_IDS.indexOf(value.archetypeId)) {
      errors.push(`${value.archetypeId}:archetype-order-mismatch`);
    }
    if (!uniqueStrings(value.requiredCapabilities)) {
      errors.push(`${value.archetypeId}:duplicate-required-capability`);
    }
    if (!uniqueStrings(value.allowedTravelMedia)) {
      errors.push(`${value.archetypeId}:duplicate-travel-medium`);
    }
    if (!uniqueStrings(value.presentationSignals)) {
      errors.push(`${value.archetypeId}:duplicate-presentation-signal`);
    }
    if (!value.requiredCapabilities.includes("actor-address")) {
      errors.push(`${value.archetypeId}:missing-actor-address`);
    }
    if (!value.requiredCapabilities.includes("diurnal-activity")) {
      errors.push(`${value.archetypeId}:missing-diurnal-activity`);
    }
    const destinationSemantics = value.destinations.map(({ semantic }) => semantic);
    if (!uniqueStrings(destinationSemantics)) {
      errors.push(`${value.archetypeId}:duplicate-destination-semantic`);
    }
    for (const destinationAffordance of value.destinations) {
      for (const medium of destinationAffordance.allowedTravelMedia) {
        if (!value.allowedTravelMedia.includes(medium)) {
          errors.push(`${value.archetypeId}:${destinationAffordance.semantic}:undeclared-medium`);
        }
      }
    }
    for (const medium of value.allowedTravelMedia) {
      if (!classCanUseTravelMedium(value.locomotionClass, medium)) {
        errors.push(`${value.archetypeId}:incompatible-${medium}-travel-medium`);
      }
    }
    if (
      value.observationAffordance.kind === "current-anonymous-area"
      && !value.requiredCapabilities.includes("surface-opportunity")
    ) errors.push(`${value.archetypeId}:observation-has-no-response-capability`);
  }
  for (const archetypeId of CORE_ECOLOGY_ACTIVITY_ARCHETYPE_IDS) {
    if (!seen.has(archetypeId)) errors.push(`${archetypeId}:missing-activity-archetype`);
  }
  return Object.freeze(errors.sort(compareText));
}

function policySupportsTravelMedium(
  policy: CoreEcologySpeciesRuntimePolicy,
  medium: CoreWildlifeTravelMedium,
): boolean {
  if (medium === "air") {
    return policy.capabilities.includes("aerial-locomotion")
      && (policy.locomotionClass === "aerial" || policy.locomotionClass === "amphibious");
  }
  if (medium === "surface-water") {
    return policy.capabilities.includes("aquatic-locomotion")
      && (policy.locomotionClass === "aquatic" || policy.locomotionClass === "amphibious");
  }
  return policy.locomotionClass === "amphibious"
    && policy.capabilities.includes("amphibious-locomotion")
    && policy.capabilities.includes("aquatic-locomotion")
    && policy.capabilities.includes("shore-water-activity");
}

function classCanUseTravelMedium(
  locomotionClass: LivingSpeciesLocomotionClass,
  medium: CoreWildlifeTravelMedium,
): boolean {
  if (medium === "air") {
    return locomotionClass === "aerial" || locomotionClass === "amphibious";
  }
  if (medium === "surface-water") {
    return locomotionClass === "aquatic" || locomotionClass === "amphibious";
  }
  return locomotionClass === "amphibious";
}

function isActivityAffordanceProfileShape(
  value: unknown,
): value is CoreEcologyActivityAffordanceProfile {
  return plainRecord(value)
    && isActivityArchetypeShape(value)
    && exactKeys(value, [
      "allowedTravelMedia",
      "archetypeId",
      "destinations",
      "locomotionClass",
      "observationAffordance",
      "ownerId",
      "presentationSignals",
      "profileId",
      "requiredCapabilities",
      "scheduleScope",
      "speciesId",
      "version",
    ])
    && typeof value.profileId === "string"
    && value.profileId.length > 0
    && value.profileId.length <= 256
    && typeof value.speciesId === "string";
}

function isActivityArchetypeShape(
  value: unknown,
): value is CoreEcologyActivityArchetype & Record<string, unknown> {
  if (
    !plainRecord(value)
    || value.version !== CORE_ECOLOGY_ACTIVITY_AFFORDANCE_VERSION
    || value.ownerId !== CORE_ECOLOGY_ACTIVITY_AFFORDANCE_OWNER_ID
    || value.scheduleScope !== "bounded-diurnal-window"
    || typeof value.archetypeId !== "string"
    || !ARCHETYPE_ID_SET.has(value.archetypeId)
    || !LOCOMOTION_CLASS_SET.has(String(value.locomotionClass))
    || !plainDataArray(value.requiredCapabilities)
    || !value.requiredCapabilities.every(isCoreEcologySpeciesRuntimeCapability)
    || !plainDataArray(value.allowedTravelMedia)
    || !value.allowedTravelMedia.every((entry) => (
      typeof entry === "string" && TRAVEL_MEDIUM_SET.has(entry)
    ))
    || !plainDataArray(value.destinations)
    || !value.destinations.every(isDestinationAffordance)
    || !isObservationAffordance(value.observationAffordance)
    || !plainDataArray(value.presentationSignals)
    || !value.presentationSignals.every((entry) => (
      typeof entry === "string" && PRESENTATION_SIGNAL_SET.has(entry)
    ))
  ) return false;
  const baseKeys = [
    "allowedTravelMedia",
    "archetypeId",
    "destinations",
    "locomotionClass",
    "observationAffordance",
    "ownerId",
    "presentationSignals",
    "requiredCapabilities",
    "scheduleScope",
    "version",
  ] as const;
  return exactKeys(value, baseKeys)
    || exactKeys(value, [...baseKeys, "profileId", "speciesId"]);
}

function isDestinationAffordance(
  value: unknown,
): value is CoreEcologyActivityDestinationAffordance {
  return plainRecord(value)
    && exactKeys(value, ["allowedTravelMedia", "authority", "semantic"])
    && typeof value.semantic === "string"
    && DESTINATION_SEMANTIC_SET.has(value.semantic)
    && typeof value.authority === "string"
    && DESTINATION_AUTHORITY_SET.has(value.authority)
    && plainDataArray(value.allowedTravelMedia)
    && value.allowedTravelMedia.length > 0
    && value.allowedTravelMedia.every((entry) => (
      typeof entry === "string" && TRAVEL_MEDIUM_SET.has(entry)
    ));
}

function isObservationAffordance(
  value: unknown,
): value is CoreEcologyActivityObservationAffordance {
  if (!plainRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "none") return exactKeys(value, ["kind"]);
  return value.kind === "current-anonymous-area"
    && exactKeys(value, [
      "channel",
      "freshness",
      "kind",
      "perceivedClass",
      "requiresLineOfSight",
      "subjectIdentity",
    ])
    && value.channel === "vision"
    && value.perceivedClass === "aquatic-activity"
    && value.subjectIdentity === "anonymous"
    && value.freshness === "same-tick"
    && value.requiresLineOfSight === true;
}

function profileComposesArchetype(
  profile: CoreEcologyActivityAffordanceProfile,
  activityArchetype: CoreEcologyActivityArchetype,
): boolean {
  return sameData(
    {
      allowedTravelMedia: profile.allowedTravelMedia,
      archetypeId: profile.archetypeId,
      destinations: profile.destinations,
      locomotionClass: profile.locomotionClass,
      observationAffordance: profile.observationAffordance,
      ownerId: profile.ownerId,
      presentationSignals: profile.presentationSignals,
      requiredCapabilities: profile.requiredCapabilities,
      scheduleScope: profile.scheduleScope,
      version: profile.version,
    },
    activityArchetype,
  );
}

function uniqueStrings(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  const actual = ownEnumerableDataKeys(value);
  if (actual === null) return false;
  const wanted = [...expected].sort(compareText);
  return actual.length === wanted.length
    && actual.every((entry, index) => entry === wanted[index]);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function plainDataArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  const actualKeys = Reflect.ownKeys(value);
  const expectedKeys = [
    ...Array.from({ length: value.length }, (_, index) => String(index)),
    "length",
  ];
  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
  ) return false;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      return false;
    }
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  return lengthDescriptor !== undefined
    && "value" in lengthDescriptor
    && !lengthDescriptor.enumerable;
}

function ownEnumerableDataKeys(value: object): string[] | null {
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) return null;
  const names = keys as string[];
  for (const key of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      return null;
    }
  }
  return [...names].sort(compareText);
}

function sameData(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (plainDataArray(left)) {
    return plainDataArray(right)
      && left.length === right.length
      && left.every((entry, index) => sameData(entry, right[index]));
  }
  if (plainRecord(left)) {
    if (!plainRecord(right)) return false;
    const leftKeys = ownEnumerableDataKeys(left);
    const rightKeys = ownEnumerableDataKeys(right);
    if (leftKeys === null || rightKeys === null) return false;
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key, index) => (
        key === rightKeys[index] && sameData(left[key], right[key])
      ));
  }
  return false;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

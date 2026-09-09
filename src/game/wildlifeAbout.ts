import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import {
  projectWildlifePopulationEvidencePresentations,
  projectWildlifePresentation,
  type AggregateWildlifeSpecies,
  type WildlifeDirectObservation,
  type IndividualWildlifeSpecies,
  type WildlifePopulationEvidenceObservation,
  type WildlifePopulationEvidencePresentation,
  type WildlifePresentation,
  type WildlifePresentationInput,
} from "./wildlifePresentation";

export const WILDLIFE_ABOUT_VERSION = 1 as const;

export type WildlifeAboutObservation = WildlifeDirectObservation;
export type WildlifeAboutActivityContext = NonNullable<WildlifePresentationInput["activity"]>;
export type WildlifePopulationEvidenceAboutObservation = WildlifePopulationEvidenceObservation;
type AggregatePopulationEvidencePresentation = Extract<
  WildlifePopulationEvidencePresentation,
  { readonly representation: "population-evidence" }
>;

export interface WildlifeAboutFact {
  readonly label: string;
  readonly value: string;
}

export interface WildlifeQuickInspect {
  readonly version: typeof WILDLIFE_ABOUT_VERSION;
  readonly actorId: string;
  readonly species: IndividualWildlifeSpecies;
  readonly heading: string;
  readonly summary: string;
  readonly distanceUnits: number;
}

export interface WildlifeAboutView {
  readonly version: typeof WILDLIFE_ABOUT_VERSION;
  readonly actorId: string;
  readonly species: IndividualWildlifeSpecies;
  readonly heading: string;
  readonly identity: string;
  readonly knowledge: "Unfamiliar" | "Recognized";
  readonly observed: readonly WildlifeAboutFact[];
  readonly known: readonly WildlifeAboutFact[];
}

export interface WildlifePopulationEvidenceQuickInspect {
  readonly version: typeof WILDLIFE_ABOUT_VERSION;
  readonly aggregateId: string;
  readonly evidenceId: string;
  readonly species: AggregateWildlifeSpecies;
  readonly heading: string;
  readonly summary: string;
  readonly distanceUnits: number;
}

export interface WildlifePopulationEvidenceAboutView {
  readonly version: typeof WILDLIFE_ABOUT_VERSION;
  readonly aggregateId: string;
  readonly evidenceId: string;
  readonly species: AggregateWildlifeSpecies;
  readonly heading: string;
  readonly identity: string;
  readonly knowledge: "Unfamiliar" | "Recognized";
  readonly observed: readonly WildlifeAboutFact[];
  readonly known: readonly WildlifeAboutFact[];
}

interface WildlifeAboutSpeciesDescriptor {
  readonly identifiedName: string;
  readonly identifiedHeading: string;
  readonly unidentifiedHeading: string;
  readonly representation: "individual" | "visible-flock" | "population-area";
}

/** Exhaustive wording prevents a new species from inheriting deer, gull, or bear copy. */
const ABOUT_BY_SPECIES: Readonly<
  Record<CoreWildlifeSpecies, WildlifeAboutSpeciesDescriptor>
> = deepFreeze({
  deer: {
    identifiedName: "Deer",
    identifiedHeading: "DEER",
    unidentifiedHeading: "UNKNOWN ANIMAL",
    representation: "individual",
  },
  gull: {
    identifiedName: "Gull",
    identifiedHeading: "GULL FLOCK",
    unidentifiedHeading: "UNKNOWN BIRDS",
    representation: "visible-flock",
  },
  "black-bear": {
    identifiedName: "Black bear",
    identifiedHeading: "BLACK BEAR",
    unidentifiedHeading: "LARGE ANIMAL",
    representation: "individual",
  },
  "brown-rat": {
    identifiedName: "Brown rat",
    identifiedHeading: "BROWN RAT SIGNS",
    unidentifiedHeading: "SMALL-ANIMAL SIGNS",
    representation: "population-area",
  },
  "domestic-cat": {
    identifiedName: "Domestic cat",
    identifiedHeading: "DOMESTIC CAT",
    unidentifiedHeading: "UNKNOWN ANIMAL",
    representation: "individual",
  },
  "marsh-rabbit": {
    identifiedName: "Marsh rabbit",
    identifiedHeading: "MARSH RABBIT",
    unidentifiedHeading: "SMALL ANIMAL",
    representation: "individual",
  },
  "marsh-fox": {
    identifiedName: "Marsh fox",
    identifiedHeading: "MARSH FOX",
    unidentifiedHeading: "UNKNOWN CANID",
    representation: "individual",
  },
  "fish-crow": {
    identifiedName: "Fish crow",
    identifiedHeading: "FISH CROW FLOCK",
    unidentifiedHeading: "UNKNOWN BIRDS",
    representation: "visible-flock",
  },
  "northern-harrier": {
    identifiedName: "Northern harrier",
    identifiedHeading: "NORTHERN HARRIER",
    unidentifiedHeading: "UNKNOWN RAPTOR",
    representation: "individual",
  },
  "southern-leopard-frog": {
    identifiedName: "Southern leopard frog",
    identifiedHeading: "SOUTHERN LEOPARD FROG SIGNS",
    unidentifiedHeading: "WETLAND-ANIMAL SIGNS",
    representation: "population-area",
  },
  "atlantic-silverside": {
    identifiedName: "Atlantic silverside",
    identifiedHeading: "ATLANTIC SILVERSIDE SCHOOL SIGNS",
    unidentifiedHeading: "WATER-SURFACE ACTIVITY",
    representation: "population-area",
  },
  "atlantic-marsh-fiddler-crab": {
    identifiedName: "Atlantic marsh fiddler crab",
    identifiedHeading: "ATLANTIC MARSH FIDDLER CRAB SIGNS",
    unidentifiedHeading: "MUDFLAT ACTIVITY",
    representation: "population-area",
  },
  "snowy-egret": {
    identifiedName: "Snowy egret",
    identifiedHeading: "SNOWY EGRET",
    unidentifiedHeading: "UNKNOWN WADER",
    representation: "individual",
  },
  "american-black-duck": {
    identifiedName: "American black duck",
    identifiedHeading: "AMERICAN BLACK DUCK",
    unidentifiedHeading: "UNKNOWN DUCK",
    representation: "individual",
  },
  "domestic-chicken": {
    identifiedName: "Domestic chicken",
    identifiedHeading: "DOMESTIC CHICKEN",
    unidentifiedHeading: "UNKNOWN BIRD",
    representation: "individual",
  },
  "domestic-goat": {
    identifiedName: "Domestic goat",
    identifiedHeading: "DOMESTIC GOAT",
    unidentifiedHeading: "UNKNOWN LIVESTOCK",
    representation: "individual",
  },
  "north-american-river-otter": {
    identifiedName: "North American river otter",
    identifiedHeading: "NORTH AMERICAN RIVER OTTER",
    unidentifiedHeading: "UNKNOWN AQUATIC MAMMAL",
    representation: "individual",
  },
  "wild-boar": {
    identifiedName: "Wild boar",
    identifiedHeading: "WILD BOAR",
    unidentifiedHeading: "LARGE ANIMAL",
    representation: "individual",
  },
  elk: {
    identifiedName: "Elk",
    identifiedHeading: "ELK",
    unidentifiedHeading: "LARGE HOOFED ANIMAL",
    representation: "individual",
  },
  "gray-wolf": {
    identifiedName: "Gray wolf",
    identifiedHeading: "GRAY WOLF",
    unidentifiedHeading: "UNKNOWN CANID",
    representation: "individual",
  },
  cougar: {
    identifiedName: "Cougar",
    identifiedHeading: "COUGAR",
    unidentifiedHeading: "UNKNOWN LARGE CAT",
    representation: "individual",
  },
  "brown-bear": {
    identifiedName: "Brown bear",
    identifiedHeading: "BROWN BEAR",
    unidentifiedHeading: "LARGE BEAR",
    representation: "individual",
  },
  "mountain-goat": {
    identifiedName: "Mountain goat",
    identifiedHeading: "MOUNTAIN GOAT",
    unidentifiedHeading: "UNKNOWN MOUNTAIN ANIMAL",
    representation: "individual",
  },
  "american-pika": {
    identifiedName: "American pika",
    identifiedHeading: "AMERICAN PIKA SIGNS",
    unidentifiedHeading: "TALUS-ANIMAL SIGNS",
    representation: "population-area",
  },
  "golden-eagle": {
    identifiedName: "Golden eagle",
    identifiedHeading: "GOLDEN EAGLE",
    unidentifiedHeading: "UNKNOWN LARGE RAPTOR",
    representation: "individual",
  },
});

/**
 * Compact current-sight summary; stable identity is retained only for routing.
 * Optional activity custody is authenticated by the shared presentation projector.
 */
export function projectWildlifeQuickInspect(
  actor: unknown,
  observation: unknown,
  activity?: WildlifeAboutActivityContext,
): WildlifeQuickInspect | null {
  const presentation = observe(actor, observation, activity);
  if (presentation === null) return null;
  const details: string[] = [];
  if (presentation.groupSize !== undefined) {
    details.push(`About ${presentation.groupSize} visible`);
  }
  details.push(presentation.behaviorLabel);
  const primaryCondition = presentation.conditionLabels[0];
  if (primaryCondition !== undefined) details.push(displayToken(primaryCondition));
  return deepFreeze({
    version: WILDLIFE_ABOUT_VERSION,
    actorId: presentation.actorId,
    species: presentation.species,
    heading: heading(presentation),
    summary: details.join(" · "),
    distanceUnits: presentation.distanceUnits,
  });
}

/**
 * Full ABOUT remains a direct-observation projection. Core needs, meters,
 * causes, targets, memories, population truth, and generation keys never enter
 * this record. When supplied, bounded activity custody is authenticated before
 * its directly observable posture can enter ABOUT.
 */
export function projectWildlifeAbout(
  actor: unknown,
  observation: unknown,
  activity?: WildlifeAboutActivityContext,
): WildlifeAboutView | null {
  const presentation = observe(actor, observation, activity);
  if (presentation === null) return null;
  const observed: WildlifeAboutFact[] = [];
  if (presentation.speciesIdentified) {
    observed.push(fact("Species", identifiedSpecies(presentation.species)));
  }
  if (presentation.groupSize !== undefined) {
    observed.push(fact("Visible group", `About ${presentation.groupSize}`));
  }
  if (presentation.conditionLabels.length > 0) {
    observed.push(fact(
      "Condition",
      presentation.conditionLabels.map(displayToken).join(" · "),
    ));
  }
  observed.push(fact("Behavior", presentation.behaviorLabel));
  if (presentation.formLabel !== undefined) {
    observed.push(fact("Form", presentation.formLabel));
  }
  if (presentation.appearanceLabel !== undefined) {
    observed.push(fact("Appearance", presentation.appearanceLabel));
  }
  if (presentation.lifeStageLabel !== undefined) {
    observed.push(fact("Life stage", presentation.lifeStageLabel));
  }
  return deepFreeze({
    version: WILDLIFE_ABOUT_VERSION,
    actorId: presentation.actorId,
    species: presentation.species,
    heading: heading(presentation),
    identity: presentation.identityLabel,
    knowledge: presentation.speciesIdentified ? "Recognized" : "Unfamiliar",
    observed,
    known: [],
  });
}

/** Compact ABOUT route for one physical sign; no individual rat is synthesized. */
export function projectWildlifePopulationEvidenceQuickInspect(
  patch: unknown,
  evidenceId: unknown,
  observation: unknown,
): WildlifePopulationEvidenceQuickInspect | null {
  const presentation = observePopulationEvidence(patch, evidenceId, observation);
  if (presentation === null) return null;
  return deepFreeze({
    version: WILDLIFE_ABOUT_VERSION,
    aggregateId: presentation.aggregateId,
    evidenceId: presentation.evidenceId,
    species: presentation.species,
    heading: populationEvidenceHeading(presentation),
    summary: presentation.evidenceLabel,
    distanceUnits: presentation.distanceUnits,
  });
}

/**
 * Evidence ABOUT says only what the directly visible sign supports. Aggregate
 * size, pressure, anchors, causes, activity state, sex, and life stage remain hidden.
 */
export function projectWildlifePopulationEvidenceAbout(
  patch: unknown,
  evidenceId: unknown,
  observation: unknown,
): WildlifePopulationEvidenceAboutView | null {
  const presentation = observePopulationEvidence(patch, evidenceId, observation);
  if (presentation === null) return null;
  const observed: WildlifeAboutFact[] = [];
  if (presentation.speciesIdentified) {
    observed.push(fact(
      "Species",
      ABOUT_BY_SPECIES[presentation.species].identifiedName,
    ));
  }
  observed.push(fact("Evidence", presentation.evidenceLabel));
  observed.push(fact("Scale", "Population-level signs"));
  return deepFreeze({
    version: WILDLIFE_ABOUT_VERSION,
    aggregateId: presentation.aggregateId,
    evidenceId: presentation.evidenceId,
    species: presentation.species,
    heading: populationEvidenceHeading(presentation),
    identity: presentation.identityLabel,
    knowledge: presentation.speciesIdentified ? "Recognized" : "Unfamiliar",
    observed,
    known: [],
  });
}

function observe(
  actor: unknown,
  observation: unknown,
  activity?: WildlifeAboutActivityContext,
): WildlifePresentation | null {
  return projectWildlifePresentation({
    actor,
    observation: observation as WildlifeDirectObservation,
    // Geometry is discarded here; this keeps the shared projector authoritative.
    tileSize: 1,
    ...(activity === undefined ? {} : { activity }),
  });
}

function observePopulationEvidence(
  patch: unknown,
  evidenceId: unknown,
  observation: unknown,
): AggregatePopulationEvidencePresentation | null {
  if (typeof evidenceId !== "string" || evidenceId.length === 0 || evidenceId.length > 256) {
    return null;
  }
  const presentations = projectWildlifePopulationEvidencePresentations({
    patch,
    observation: observation as WildlifePopulationEvidenceObservation,
    tileSize: 1,
    selectedEvidenceId: evidenceId,
  });
  const presentation = presentations?.find((candidate) => candidate.evidenceId === evidenceId);
  // Individual movement signs intentionally have no selectable/ABOUT contract
  // in this slice. Do not route them through the rat population-sign surface.
  return presentation?.representation === "population-evidence" ? presentation : null;
}

function populationEvidenceHeading(
  presentation: WildlifePopulationEvidencePresentation,
): string {
  const descriptor = ABOUT_BY_SPECIES[presentation.species];
  return presentation.speciesIdentified
    ? descriptor.identifiedHeading
    : descriptor.unidentifiedHeading;
}

function heading(presentation: WildlifePresentation): string {
  const descriptor = ABOUT_BY_SPECIES[presentation.species];
  return presentation.speciesIdentified
    ? descriptor.identifiedHeading
    : descriptor.unidentifiedHeading;
}

function identifiedSpecies(species: IndividualWildlifeSpecies): string {
  return ABOUT_BY_SPECIES[species].identifiedName;
}

function displayToken(value: string): string {
  const label = value.toLocaleLowerCase("en-US").replaceAll("-", " ");
  return label.length === 0 ? label : label[0]!.toLocaleUpperCase("en-US") + label.slice(1);
}

function fact(label: string, value: string): WildlifeAboutFact {
  return Object.freeze({ label, value });
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

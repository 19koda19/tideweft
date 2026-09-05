import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import {
  projectWildlifePopulationEvidencePresentations,
  projectWildlifePresentation,
  type WildlifeDirectObservation,
  type IndividualWildlifeSpecies,
  type WildlifePopulationEvidenceObservation,
  type WildlifePopulationEvidencePresentation,
  type WildlifePresentation,
} from "./wildlifePresentation";

export const WILDLIFE_ABOUT_VERSION = 1 as const;

export type WildlifeAboutObservation = WildlifeDirectObservation;
export type WildlifePopulationEvidenceAboutObservation = WildlifePopulationEvidenceObservation;

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
  readonly species: "brown-rat";
  readonly heading: string;
  readonly summary: string;
  readonly distanceUnits: number;
}

export interface WildlifePopulationEvidenceAboutView {
  readonly version: typeof WILDLIFE_ABOUT_VERSION;
  readonly aggregateId: string;
  readonly evidenceId: string;
  readonly species: "brown-rat";
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
});

/** Compact current-sight summary; stable identity is retained only for routing. */
export function projectWildlifeQuickInspect(
  actor: unknown,
  observation: unknown,
): WildlifeQuickInspect | null {
  const presentation = observe(actor, observation);
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
 * this record.
 */
export function projectWildlifeAbout(
  actor: unknown,
  observation: unknown,
): WildlifeAboutView | null {
  const presentation = observe(actor, observation);
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
    species: "brown-rat",
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
    observed.push(fact("Species", "Brown rat"));
  }
  observed.push(fact("Evidence", presentation.evidenceLabel));
  observed.push(fact("Scale", "Population-level signs"));
  return deepFreeze({
    version: WILDLIFE_ABOUT_VERSION,
    aggregateId: presentation.aggregateId,
    evidenceId: presentation.evidenceId,
    species: "brown-rat",
    heading: populationEvidenceHeading(presentation),
    identity: presentation.identityLabel,
    knowledge: presentation.speciesIdentified ? "Recognized" : "Unfamiliar",
    observed,
    known: [],
  });
}

function observe(actor: unknown, observation: unknown): WildlifePresentation | null {
  return projectWildlifePresentation({
    actor,
    observation: observation as WildlifeDirectObservation,
    // Geometry is discarded here; this keeps the shared projector authoritative.
    tileSize: 1,
  });
}

function observePopulationEvidence(
  patch: unknown,
  evidenceId: unknown,
  observation: unknown,
): WildlifePopulationEvidencePresentation | null {
  if (typeof evidenceId !== "string" || evidenceId.length === 0 || evidenceId.length > 256) {
    return null;
  }
  const presentations = projectWildlifePopulationEvidencePresentations({
    patch,
    observation: observation as WildlifePopulationEvidenceObservation,
    tileSize: 1,
    selectedEvidenceId: evidenceId,
  });
  return presentations?.find((candidate) => candidate.evidenceId === evidenceId) ?? null;
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

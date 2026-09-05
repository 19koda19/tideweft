import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import {
  projectWildlifePresentation,
  type WildlifeDirectObservation,
  type WildlifePresentation,
} from "./wildlifePresentation";

export const WILDLIFE_ABOUT_VERSION = 1 as const;

export type WildlifeAboutObservation = WildlifeDirectObservation;

export interface WildlifeAboutFact {
  readonly label: string;
  readonly value: string;
}

export interface WildlifeQuickInspect {
  readonly version: typeof WILDLIFE_ABOUT_VERSION;
  readonly actorId: string;
  readonly species: CoreWildlifeSpecies;
  readonly heading: string;
  readonly summary: string;
  readonly distanceUnits: number;
}

export interface WildlifeAboutView {
  readonly version: typeof WILDLIFE_ABOUT_VERSION;
  readonly actorId: string;
  readonly species: CoreWildlifeSpecies;
  readonly heading: string;
  readonly identity: string;
  readonly knowledge: "Unfamiliar" | "Recognized";
  readonly observed: readonly WildlifeAboutFact[];
  readonly known: readonly WildlifeAboutFact[];
}

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

function observe(actor: unknown, observation: unknown): WildlifePresentation | null {
  return projectWildlifePresentation({
    actor,
    observation: observation as WildlifeDirectObservation,
    // Geometry is discarded here; this keeps the shared projector authoritative.
    tileSize: 1,
  });
}

function heading(presentation: WildlifePresentation): string {
  if (!presentation.speciesIdentified) {
    if (presentation.species === "gull") return "UNKNOWN BIRDS";
    return presentation.species === "black-bear" ? "LARGE ANIMAL" : "UNKNOWN ANIMAL";
  }
  if (presentation.species === "gull") return "GULL FLOCK";
  return identifiedSpecies(presentation.species).toLocaleUpperCase("en-US");
}

function identifiedSpecies(species: CoreWildlifeSpecies): string {
  switch (species) {
    case "deer": return "Deer";
    case "gull": return "Gull";
    case "black-bear": return "Black bear";
  }
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

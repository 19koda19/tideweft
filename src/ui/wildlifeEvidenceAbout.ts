import {
  projectWildlifePopulationEvidenceAbout,
  projectWildlifePopulationEvidenceQuickInspect,
  type WildlifePopulationEvidenceAboutObservation,
} from "../game/wildlifeAbout";
import type {
  ResidentAboutFactUIView,
  TideweftUIView,
  WildlifeEvidenceAboutProjection,
  WildlifeEvidenceTargetUIView,
} from "./types";

export type WildlifeEvidenceAboutCloseCommand = {
  readonly type: "aggregate-wildlife-evidence";
  readonly action: "close";
  readonly target: WildlifeEvidenceTargetUIView;
};

/** Flattened, close-only surface consumed by the shared non-modal ABOUT card. */
export interface ResolvedWildlifeEvidenceAboutSurface {
  readonly selectionKey: string;
  readonly species: "brown-rat";
  readonly representation: "population-evidence";
  readonly heading: string;
  readonly identityLine: string;
  readonly quickSummary: string;
  readonly knowledgeLabel: "Unfamiliar" | "Recognized";
  readonly observed: readonly ResidentAboutFactUIView[];
  readonly known: readonly ResidentAboutFactUIView[];
  readonly closeCommand: WildlifeEvidenceAboutCloseCommand;
}

/**
 * Adapt the authoritative direct-detail game projection without synthesizing a
 * rat actor. Both stable IDs and the species tag must still match the selected
 * render target after the game projector revalidates current perception.
 */
export function projectWildlifeEvidenceAboutProjection(
  patch: unknown,
  selectedTarget: unknown,
  currentObservation: WildlifePopulationEvidenceAboutObservation,
): WildlifeEvidenceAboutProjection | null {
  if (!validTarget(selectedTarget)) return null;
  const quick = projectWildlifePopulationEvidenceQuickInspect(
    patch,
    selectedTarget.evidenceId,
    currentObservation,
  );
  const about = projectWildlifePopulationEvidenceAbout(
    patch,
    selectedTarget.evidenceId,
    currentObservation,
  );
  if (
    quick === null
    || about === null
    || !sameSourceTarget(selectedTarget, quick)
    || !sameSourceTarget(selectedTarget, about)
    || quick.aggregateId !== about.aggregateId
    || quick.evidenceId !== about.evidenceId
    || quick.species !== about.species
  ) return null;

  const target = Object.freeze({ ...selectedTarget });
  return deepFreeze({
    target,
    quick: {
      target,
      heading: quick.heading,
      summary: quick.summary,
      distanceUnits: quick.distanceUnits,
    },
    about: {
      target,
      heading: about.heading,
      identityLine: about.identity,
      knowledgeLabel: about.knowledge,
      observed: about.observed.map(({ label, value }) => ({ label, value })),
      known: about.known.map(({ label, value }) => ({ label, value })),
    },
  });
}

/** Prefer a present evidence selection and fail closed if its records diverge. */
export function resolveWildlifeEvidenceAboutSurface(
  view: Pick<TideweftUIView, "selectedWildlifeEvidence">,
): ResolvedWildlifeEvidenceAboutSurface | undefined {
  const selected = view.selectedWildlifeEvidence;
  if (selected === undefined || !hasCoherentWildlifeEvidenceAboutProjection(selected)) {
    return undefined;
  }
  return {
    selectionKey: evidenceSelectionKey(selected.target),
    species: "brown-rat",
    representation: "population-evidence",
    heading: selected.about.heading,
    identityLine: selected.about.identityLine,
    quickSummary: selected.quick.summary,
    knowledgeLabel: selected.about.knowledgeLabel,
    observed: selected.about.observed,
    known: selected.about.known,
    closeCommand: {
      type: "aggregate-wildlife-evidence",
      action: "close",
      target: selected.target,
    },
  };
}

/** Reject mixed-sign, actor-shaped, or action-bearing ABOUT data at the UI edge. */
export function hasCoherentWildlifeEvidenceAboutProjection(
  value: WildlifeEvidenceAboutProjection,
): boolean {
  return plainRecordWithKeys(value, ["about", "quick", "target"])
    && validTarget(value.target)
    && validQuick(value.quick)
    && validAbout(value.about)
    && sameTarget(value.target, value.quick.target)
    && sameTarget(value.target, value.about.target);
}

export function sameWildlifeEvidenceTarget(
  left: WildlifeEvidenceTargetUIView,
  right: WildlifeEvidenceTargetUIView,
): boolean {
  return validTarget(left) && validTarget(right) && sameTarget(left, right);
}

function validQuick(value: unknown): value is WildlifeEvidenceAboutProjection["quick"] {
  return plainRecordWithKeys(value, ["distanceUnits", "heading", "summary", "target"])
    && validTarget(value.target)
    && validCopy(value.heading, 96)
    && validCopy(value.summary, 240)
    && typeof value.distanceUnits === "number"
    && Number.isSafeInteger(value.distanceUnits)
    && value.distanceUnits >= 0;
}

function validAbout(value: unknown): value is WildlifeEvidenceAboutProjection["about"] {
  return plainRecordWithKeys(value, [
    "heading",
    "identityLine",
    "knowledgeLabel",
    "known",
    "observed",
    "target",
  ])
    && validTarget(value.target)
    && validCopy(value.heading, 96)
    && validCopy(value.identityLine, 240)
    && (value.knowledgeLabel === "Unfamiliar" || value.knowledgeLabel === "Recognized")
    && validFacts(value.observed)
    && validFacts(value.known);
}

function validFacts(value: unknown): value is readonly ResidentAboutFactUIView[] {
  if (!Array.isArray(value) || value.length > 16) return false;
  return value.every((fact) => {
    if (!plainRecord(fact)) return false;
    const expected = fact.tone === undefined
      ? ["label", "value"]
      : ["label", "tone", "value"];
    return exactKeys(fact, expected)
      && validCopy(fact.label, 64)
      && validCopy(fact.value, 240)
      && (
        fact.tone === undefined
        || fact.tone === "neutral"
        || fact.tone === "warning"
        || fact.tone === "danger"
        || fact.tone === "good"
      );
  });
}

function validTarget(value: unknown): value is WildlifeEvidenceTargetUIView {
  return plainRecordWithKeys(value, ["aggregateId", "evidenceId", "species"])
    && value.species === "brown-rat"
    && validStableId(value.aggregateId)
    && validStableId(value.evidenceId);
}

function sameSourceTarget(
  expected: WildlifeEvidenceTargetUIView,
  actual: Readonly<{ aggregateId: string; evidenceId: string; species: string }>,
): boolean {
  return expected.species === actual.species
    && expected.aggregateId === actual.aggregateId
    && expected.evidenceId === actual.evidenceId;
}

function sameTarget(left: unknown, right: unknown): boolean {
  return validTarget(left)
    && validTarget(right)
    && left.species === right.species
    && left.aggregateId === right.aggregateId
    && left.evidenceId === right.evidenceId;
}

function evidenceSelectionKey(target: WildlifeEvidenceTargetUIView): string {
  return `${target.species}:${target.aggregateId}:${target.evidenceId}`;
}

function validStableId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 256
    && /^[A-Za-z0-9][A-Za-z0-9:._/-]*$/u.test(value);
}

function validCopy(value: unknown, maxLength: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && value.trim() === value;
}

function plainRecordWithKeys(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return plainRecord(value) && exactKeys(value, keys);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length
    && actual.every((key, index) => key === keys[index]);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

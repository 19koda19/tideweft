import type { AggregateWildlifeEvidenceView } from "../render/types";
import type {
  WildlifeEvidenceAboutProjection,
  WildlifeEvidenceTargetUIView,
} from "../ui/types";
import { projectWildlifeEvidenceAboutProjection } from "../ui/wildlifeEvidenceAbout";
import {
  canonicalizeCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import type { CoreEcologyRuntimeWindow } from "./coreEcologyRuntime";
import type { PerceptionResult } from "./perception";
import {
  projectWildlifePopulationEvidencePresentations,
  type WildlifePopulationEvidenceObservation,
} from "./wildlifePresentation";

/** Runtime selection identity for one physical sign; never an individual actor target. */
export type CoreEcologyAggregateEvidenceTarget = WildlifeEvidenceTargetUIView;

export interface ProjectCoreEcologyAggregateEvidenceInput {
  readonly patch: unknown;
  readonly window: CoreEcologyRuntimeWindow;
  readonly perception: PerceptionResult;
  readonly tileSize: number;
  readonly selectedTarget?: CoreEcologyAggregateEvidenceTarget | null;
}

/**
 * One coherent release-frame projection for both renderers and the non-pausing
 * ABOUT surface. A stale but well-formed selection yields `selectedAbout: null`;
 * malformed authority fails the complete projection closed.
 */
export interface CoreEcologyAggregateEvidenceRuntimeProjection {
  readonly renderEvidence: readonly AggregateWildlifeEvidenceView[];
  readonly selectedAbout: WildlifeEvidenceAboutProjection | null;
}

/**
 * Bind aggregate evidence to the current signed frame exactly once. This is
 * deliberately separate from living-actor projection: no rat actor ID, hidden
 * population count, activity signal, disturbance cause, or remote memory can
 * cross this boundary.
 */
export function projectCoreEcologyAggregateEvidence(
  input: ProjectCoreEcologyAggregateEvidenceInput,
): CoreEcologyAggregateEvidenceRuntimeProjection | null {
  if (
    !plainRecord(input)
    || !allowedInputKeys(input as unknown as Record<string, unknown>)
  ) return null;
  const patch = canonicalizeCoreEcologyAggregatePatch(input.patch);
  if (patch === null) return null;

  let selectedTarget: CoreEcologyAggregateEvidenceTarget | null = null;
  if (input.selectedTarget !== undefined && input.selectedTarget !== null) {
    selectedTarget = canonicalizeCoreEcologyAggregateEvidenceTarget(input.selectedTarget);
    if (selectedTarget === null) return null;
  }

  // A selection is presentation state, not saved ecology. A well-formed target
  // can therefore go stale without invalidating the world; do not mark a sign
  // selected unless both aggregate and evidence identity still exist together.
  const targetExists = selectedTarget !== null
    && aggregateEvidenceTargetExists(patch, selectedTarget);
  const observation: WildlifePopulationEvidenceObservation = {
    window: input.window,
    perception: input.perception,
  };
  const presentations = projectWildlifePopulationEvidencePresentations({
    patch,
    observation,
    tileSize: input.tileSize,
    ...(targetExists && selectedTarget !== null
      ? { selectedEvidenceId: selectedTarget.evidenceId }
      : {}),
  });
  if (presentations === null) return null;

  const renderEvidence: readonly AggregateWildlifeEvidenceView[] = presentations;
  if (!targetExists || selectedTarget === null) {
    if (renderEvidence.some(({ selected }) => selected)) return null;
    return Object.freeze({ renderEvidence, selectedAbout: null });
  }

  const selectedRenderEvidence = renderEvidence.filter((candidate) =>
    evidenceTargetMatchesView(selectedTarget, candidate)
  );
  if (selectedRenderEvidence.length === 0) {
    // The physical sign still exists, but current direct-detail perception no
    // longer supports it. The host should clear its ephemeral selection.
    if (renderEvidence.some(({ selected }) => selected)) return null;
    return Object.freeze({ renderEvidence, selectedAbout: null });
  }
  if (
    selectedRenderEvidence.length !== 1
    || selectedRenderEvidence[0]?.selected !== true
    || renderEvidence.filter(({ selected }) => selected).length !== 1
  ) return null;

  const selectedAbout = projectWildlifeEvidenceAboutProjection(
    patch,
    selectedTarget,
    observation,
  );
  if (
    selectedAbout === null
    || !sameCoreEcologyAggregateEvidenceTarget(selectedAbout.target, selectedTarget)
  ) return null;
  return Object.freeze({ renderEvidence, selectedAbout });
}

/** Strict target admission for renderer/UI commands and runtime rollback state. */
export function canonicalizeCoreEcologyAggregateEvidenceTarget(
  value: unknown,
): CoreEcologyAggregateEvidenceTarget | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, ["aggregateId", "evidenceId", "species"])
    || value.species !== "brown-rat"
    || !stableId(value.aggregateId)
    || !stableId(value.evidenceId)
  ) return null;
  return Object.freeze({
    species: "brown-rat",
    aggregateId: value.aggregateId,
    evidenceId: value.evidenceId,
  });
}

export function sameCoreEcologyAggregateEvidenceTarget(
  left: unknown,
  right: unknown,
): boolean {
  const canonicalLeft = canonicalizeCoreEcologyAggregateEvidenceTarget(left);
  const canonicalRight = canonicalizeCoreEcologyAggregateEvidenceTarget(right);
  return canonicalLeft !== null
    && canonicalRight !== null
    && canonicalLeft.aggregateId === canonicalRight.aggregateId
    && canonicalLeft.evidenceId === canonicalRight.evidenceId;
}

function aggregateEvidenceTargetExists(
  patch: CoreEcologyAggregatePatchState,
  target: CoreEcologyAggregateEvidenceTarget,
): boolean {
  const populations = patch.aggregatePopulations.filter((population) =>
    population.species === target.species
    && population.aggregateId === target.aggregateId
    && population.evidence.some(({ evidenceId }) => evidenceId === target.evidenceId)
  );
  return populations.length === 1;
}

function evidenceTargetMatchesView(
  target: CoreEcologyAggregateEvidenceTarget,
  view: AggregateWildlifeEvidenceView,
): boolean {
  return view.species === target.species
    && view.aggregateId === target.aggregateId
    && view.evidenceId === target.evidenceId;
}

function allowedInputKeys(value: Record<string, unknown>): boolean {
  const expected = Object.hasOwn(value, "selectedTarget")
    ? ["patch", "perception", "selectedTarget", "tileSize", "window"]
    : ["patch", "perception", "tileSize", "window"];
  return exactKeys(value, expected);
}

function stableId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 256
    && /^[A-Za-z0-9][A-Za-z0-9:._/-]*$/u.test(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function plainRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

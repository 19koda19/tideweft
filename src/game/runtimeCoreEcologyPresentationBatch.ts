import type { WildlifeCarcassView, AggregateWildlifeEvidenceView } from "../render/types";
import type { WeatherState } from "../sim/types";
import type { WildlifeEvidenceAboutProjection } from "../ui/types";
import {
  projectCoreEcologyAggregateEvidenceInObservationFrame,
  type CoreEcologyAggregateEvidenceTarget,
} from "./coreEcologyEvidenceRuntime";
import type { CoreEcologyActivityAuthorityReceipt } from "./coreEcologyActivity";
import {
  canonicalizeCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import {
  projectCoreEcologyWildlifeInObservationFrame,
  type CoreEcologyRuntimeWindow,
  type CoreWildlifeSelectionTarget,
} from "./coreEcologyRuntime";
import type { PerceptionResult } from "./perception";
import {
  projectCoreEcologyWildlifeCarcassesInObservationFrame,
} from "./wildlifeCarcassPresentation";
import type { WildlifePresentation } from "./wildlifePresentation";
import {
  createWildlifeObservationFrame,
  releaseWildlifeObservationFrame,
} from "./wildlifeObservationFrame";

export interface RuntimeCoreEcologyPresentationSource {
  readonly sourceKey: string;
  readonly patch: unknown;
  readonly activityAuthorities: readonly CoreEcologyActivityAuthorityReceipt[];
}

export interface RuntimeCoreEcologyPresentationBatchInput {
  readonly sources: readonly RuntimeCoreEcologyPresentationSource[];
  readonly window: CoreEcologyRuntimeWindow;
  readonly perception: PerceptionResult;
  readonly tileSize: number;
  readonly weather: Readonly<WeatherState>;
  readonly selectedWildlifeTarget: CoreWildlifeSelectionTarget | null;
  readonly selectedEvidenceTarget: CoreEcologyAggregateEvidenceTarget | null;
}

export interface RuntimeCoreEcologyPresentationBatch {
  readonly wildlife: readonly WildlifePresentation[];
  readonly carcasses: readonly WildlifeCarcassView[];
  readonly aggregateEvidence: readonly AggregateWildlifeEvidenceView[];
  readonly selectedEvidenceAbout: WildlifeEvidenceAboutProjection | null;
}

/**
 * One closed synchronous presentation batch over one signed perception
 * snapshot. No frame, mask, cache, or authority receipt crosses the return
 * boundary; all ordinary actor/evidence/carcass disclosure rules remain in the
 * shared projectors below it.
 */
export function projectRuntimeCoreEcologyPresentationBatch(
  input: RuntimeCoreEcologyPresentationBatchInput,
): RuntimeCoreEcologyPresentationBatch | null {
  if (
    !plainRecord(input)
    || !exactKeys(input as unknown as Record<string, unknown>, [
      "perception",
      "selectedEvidenceTarget",
      "selectedWildlifeTarget",
      "sources",
      "tileSize",
      "weather",
      "window",
    ])
    || !Array.isArray(input.sources)
    || input.sources.length === 0
    || !Number.isFinite(input.tileSize)
    || input.tileSize <= 0
    || input.tileSize > 4_096
  ) return null;
  const sourceKeys = new Set<string>();
  const sources: Array<Readonly<{
    sourceKey: string;
    patch: CoreEcologyAggregatePatchState;
    activityAuthorities: readonly CoreEcologyActivityAuthorityReceipt[];
  }>> = [];
  for (const source of input.sources) {
    if (
      !plainRecord(source)
      || !exactKeys(source, ["activityAuthorities", "patch", "sourceKey"])
      || typeof source.sourceKey !== "string"
      || source.sourceKey.length === 0
      || source.sourceKey.length > 512
      || sourceKeys.has(source.sourceKey)
      || !Array.isArray(source.activityAuthorities)
    ) return null;
    const patch = canonicalizeCoreEcologyAggregatePatch(source.patch);
    if (patch === null || patch.patchKey !== source.sourceKey) return null;
    sourceKeys.add(source.sourceKey);
    sources.push(Object.freeze({
      sourceKey: source.sourceKey,
      patch,
      activityAuthorities: source.activityAuthorities,
    }));
  }

  const observationFrame = createWildlifeObservationFrame({
    window: input.window,
    perception: input.perception,
  });
  if (observationFrame === null) return null;
  try {
    const wildlife: WildlifePresentation[] = [];
    const carcasses: WildlifeCarcassView[] = [];
    const aggregateEvidence: AggregateWildlifeEvidenceView[] = [];
    const selectedEvidence: WildlifeEvidenceAboutProjection[] = [];

    for (const source of sources) {
      const projectedWildlife = projectCoreEcologyWildlifeInObservationFrame({
        patch: source.patch,
        observationFrame,
        tileSize: input.tileSize,
        weather: input.weather,
        selectedTarget: input.selectedWildlifeTarget,
        ...(source.activityAuthorities.length === 0
          ? {}
          : { activityAuthorities: source.activityAuthorities }),
      });
      if (projectedWildlife === null) return null;
      wildlife.push(...projectedWildlife);

      const projectedCarcasses = projectCoreEcologyWildlifeCarcassesInObservationFrame({
        patch: source.patch,
        observationFrame,
        tileSize: input.tileSize,
      });
      if (projectedCarcasses === null) return null;
      carcasses.push(...projectedCarcasses);

      const projectedEvidence = projectCoreEcologyAggregateEvidenceInObservationFrame({
        patch: source.patch,
        observationFrame,
        tileSize: input.tileSize,
        selectedTarget: input.selectedEvidenceTarget,
      });
      if (projectedEvidence === null) return null;
      aggregateEvidence.push(...projectedEvidence.renderEvidence);
      if (projectedEvidence.selectedAbout !== null) {
        selectedEvidence.push(projectedEvidence.selectedAbout);
      }
    }
    if (selectedEvidence.length > 1) return null;
    return Object.freeze({
      wildlife: Object.freeze(wildlife),
      carcasses: Object.freeze(carcasses),
      aggregateEvidence: Object.freeze(aggregateEvidence),
      selectedEvidenceAbout: selectedEvidence[0] ?? null,
    });
  } finally {
    releaseWildlifeObservationFrame(observationFrame);
  }
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return actual.length === canonical.length
    && actual.every((key, index) => key === canonical[index]);
}

function plainRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

import { ACTOR_PERCEPTION_SCALE } from "../sim/actorPerception";
import type { WildlifeCarcassView } from "../render/types";
import {
  canonicalizeCoreEcologyAggregatePatch,
} from "./coreEcology";
import type { CoreEcologyRuntimeWindow } from "./coreEcologyRuntime";
import { livingSpeciesRegistryEntry } from "./livingSpeciesRegistry";
import {
  hasValidPerceptionSignature,
  type PerceptionResult,
} from "./perception";
import {
  WORLD_POSITION_UNITS_PER_TILE,
} from "./worldPosition";
import {
  wildlifeWorldPositionDirectDetail,
  type WildlifePopulationEvidenceObservation,
} from "./wildlifePresentation";

export const WILDLIFE_CARCASS_PRESENTATION_VERSION = 1 as const;
export const WILDLIFE_CARCASS_IDENTIFICATION_CLARITY = 600_000 as const;

export interface ProjectCoreEcologyWildlifeCarcassesInput {
  readonly patch: unknown;
  readonly window: CoreEcologyRuntimeWindow;
  readonly perception: PerceptionResult;
  readonly tileSize: number;
}

/**
 * Projects only bodies inside the current signed direct-detail field. No
 * mortality cause, attacker, resource balance, claimant, or off-screen body
 * location crosses this presentation boundary.
 */
export function projectCoreEcologyWildlifeCarcasses(
  input: unknown,
): readonly WildlifeCarcassView[] | null {
  if (
    !plainRecord(input)
    || !exactKeys(input, ["patch", "perception", "tileSize", "window"])
    || !Number.isFinite(input.tileSize)
    || input.tileSize <= 0
    || input.tileSize > 4_096
    || !validObservation(input.window, input.perception)
  ) return null;
  const patch = canonicalizeCoreEcologyAggregatePatch(input.patch);
  if (patch === null) return null;
  const observation: WildlifePopulationEvidenceObservation = {
    window: input.window as CoreEcologyRuntimeWindow,
    perception: input.perception as PerceptionResult,
  };
  const views: WildlifeCarcassView[] = [];
  for (const carcass of patch.carcasses) {
    const detail = wildlifeWorldPositionDirectDetail(
      carcass.deathPosition,
      observation,
    );
    if (detail === null) continue;
    const registry = livingSpeciesRegistryEntry(carcass.sourceSpecies);
    if (registry === null) return null;
    const speciesIdentified = detail.visualClarity
      >= WILDLIFE_CARCASS_IDENTIFICATION_CLARITY;
    const form = carcass.remainingResourceUnits === 0
      ? "depleted-remains" as const
      : "body" as const;
    const knownNoun = capitalize(registry.aboutNoun);
    views.push(deepFreeze({
      version: WILDLIFE_CARCASS_PRESENTATION_VERSION,
      carcassId: carcass.carcassId,
      position: {
        x: detail.point.x * input.tileSize / WORLD_POSITION_UNITS_PER_TILE,
        y: detail.point.y * input.tileSize / WORLD_POSITION_UNITS_PER_TILE,
      },
      form,
      quickLabel: speciesIdentified
        ? `${knownNoun} ${form === "body" ? "body" : "remains"}`
        : form === "body" ? "Animal body" : "Animal remains",
      speciesIdentified,
      sizeScale: bodySizeScale(carcass.bodySizeUnits),
      orientation: stableOrientation(carcass.carcassId),
      distanceUnits: detail.distanceUnits,
    }));
  }
  views.sort((left, right) => compareText(left.carcassId, right.carcassId));
  return Object.freeze(views);
}

function bodySizeScale(bodySizeUnits: number): number {
  const scale = 0.7 + Math.log2(bodySizeUnits + 1) * 0.14;
  return Math.round(clamp(scale, 0.7, 2.2) * 1_000) / 1_000;
}

function stableOrientation(carcassId: string): number {
  const suffix = carcassId.slice(-8);
  const unit = Number.parseInt(suffix, 16) / 0xffff_ffff;
  return Math.round(unit * Math.PI * 2 * ACTOR_PERCEPTION_SCALE)
    / ACTOR_PERCEPTION_SCALE;
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validObservation(window: unknown, perception: unknown): boolean {
  if (
    !plainRecord(window)
    || !exactKeys(window, ["origin", "terrain"])
    || !plainRecord(window.origin)
    || !exactKeys(window.origin, ["x", "y"])
    || !safeInteger(window.origin.x)
    || !safeInteger(window.origin.y)
    || !plainRecord(window.terrain)
    || !exactKeys(window.terrain, ["height", "width"])
    || !positiveSafeInteger(window.terrain.width)
    || !positiveSafeInteger(window.terrain.height)
    || !plainRecord(perception)
  ) return false;
  const cells = window.terrain.width * window.terrain.height;
  return Number.isSafeInteger(cells)
    && cells > 0
    && cells <= 1_048_576
    && perception.valid === true
    && hasValidPerceptionSignature(
      perception as PerceptionResult,
      window.terrain.width,
      window.terrain.height,
    )
    && nonnegativeSafeInteger(perception.playerTileIndex)
    && perception.playerTileIndex < cells;
}

function safeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && !Object.is(value, -0);
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return safeInteger(value) && (value as number) >= 0;
}

function positiveSafeInteger(value: unknown): value is number {
  return safeInteger(value) && (value as number) > 0;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return keys.length === canonical.length
    && keys.every((key, index) => key === canonical[index]);
}

function plainRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

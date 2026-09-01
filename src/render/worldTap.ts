import type {
  RendererCommand,
  TideweftView,
  WorldPoint,
} from "./types";

export interface WorldTapTarget {
  readonly entity: "settlement" | "porter" | "route";
  readonly id: string;
}

export function usesCoarseWorldPointer(
  pointerType: string,
  coarseMediaMatches: boolean,
): boolean {
  return pointerType === "touch" || coarseMediaMatches;
}

/**
 * Coarse settlement taps are travel intents. This prevents the inspector from
 * covering the playfield before a mobile courier reaches the harbor; the
 * contextual Interact control remains responsible for actions on arrival.
 */
export function commandForWorldTap(
  view: TideweftView,
  target: WorldTapTarget | null,
  tappedPoint: WorldPoint,
  coarsePointer: boolean,
  additive = false,
): RendererCommand {
  if (coarsePointer && target?.entity === "settlement") {
    const settlement = view.settlements.find((candidate) => candidate.id === target.id);
    if (settlement && settlement.discovered !== false) {
      return {
        type: "move-target",
        point: { ...settlement.position },
        additive: false,
      };
    }
  }
  if (target) {
    return {
      type: "select",
      entity: target.entity,
      id: target.id,
      point: { ...tappedPoint },
    };
  }
  return {
    type: "move-target",
    point: { ...tappedPoint },
    additive,
  };
}

import type {
  RendererCommand,
  TideweftView,
  WorldPoint,
} from "./types";

export interface WorldTapTarget {
  readonly entity: "settlement" | "porter" | "route" | "resource";
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
  if (target?.entity === "resource") {
    const node = view.fieldResources.find((candidate) => candidate.id === target.id);
    if (node) {
      return {
        type: "resource-target",
        nodeId: node.id,
        point: { ...node.position },
        gatherOnArrival: coarsePointer,
      };
    }
  }
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
  if (target && target.entity !== "resource") {
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

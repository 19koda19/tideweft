import type {
  FieldResourceNodeView,
  LooseCargoView,
  PorterView,
  RendererCommand,
  SettlementView,
  TideweftView,
  WorldPoint,
} from "./types";
import {
  currentSettlementVisibility,
  isDirectlyPerceived,
} from "./perceptionPresentation";

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

const finitePoint = (point: WorldPoint | undefined): point is WorldPoint =>
  Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));

const directlyPerceivedPoint = (view: TideweftView, point: WorldPoint): boolean =>
  view.perception === undefined
    || (
      view.perception.valid === true
      && isDirectlyPerceived(view.terrain, point, true)
    );

const directlyPerceivedSettlement = (
  view: TideweftView,
  settlement: SettlementView,
): boolean => view.perception === undefined || (
  view.perception.valid === true
  && currentSettlementVisibility(settlement, true) >= 1
  && isDirectlyPerceived(view.terrain, settlement.position, true)
);

const directlyPerceivedResource = (
  view: TideweftView,
  node: FieldResourceNodeView,
): boolean => view.perception === undefined || (
  view.perception.valid === true
  && node.currentVisibility === 1
  && isDirectlyPerceived(view.terrain, node.position, true)
);

const directlyPerceivedPorter = (
  view: TideweftView,
  porter: PorterView,
): boolean => directlyPerceivedPoint(view, porter.position);

const directlyPerceivedParcel = (
  view: TideweftView,
  parcel: LooseCargoView,
): boolean => directlyPerceivedPoint(view, parcel.position);

/**
 * Last command-line defense for exact entity interactions. Renderers normally
 * remove obscured hit targets before this point, but perception can change
 * between pointer-down and pointer-up. Re-resolving the stable ID against the
 * release-frame view prevents a stale target from crossing that boundary.
 */
export function validatePerceivedEntityCommand(
  view: TideweftView,
  command: RendererCommand,
): RendererCommand | null {
  switch (command.type) {
    case "resource-target": {
      const node = view.fieldResources.find((candidate) => candidate.id === command.nodeId);
      if (!node || !directlyPerceivedResource(view, node)) return null;
      return {
        ...command,
        // Navigation follows the release-frame entity, never a stale press point.
        point: { ...node.position },
      };
    }
    case "parcel-target": {
      const parcel = view.looseCargo?.find((candidate) => candidate.id === command.parcelId);
      return parcel?.recoverable && directlyPerceivedParcel(view, parcel)
        ? command
        : null;
    }
    case "select": {
      if (command.entity === "world") return command;
      if (!command.id) return null;
      if (command.entity === "route") {
        return view.routes.some((route) => route.id === command.id) ? command : null;
      }
      if (command.entity === "settlement") {
        const settlement = view.settlements.find((candidate) => candidate.id === command.id);
        return settlement && directlyPerceivedSettlement(view, settlement) ? command : null;
      }
      const porter = view.porters.find((candidate) => candidate.id === command.id);
      return porter && directlyPerceivedPorter(view, porter) ? command : null;
    }
    default:
      return command;
  }
}

function isActiveDestinationSettlement(
  view: TideweftView,
  settlement: SettlementView,
): boolean {
  const destination = view.player.destination;
  if (!finitePoint(destination)) return false;
  const tolerance = Math.max(1e-6, view.terrain.tileSize * 0.25);
  return Math.hypot(
    destination.x - settlement.position.x,
    destination.y - settlement.position.y,
  ) <= tolerance;
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
  const moveToTap: RendererCommand = {
    type: "move-target",
    point: { ...tappedPoint },
    additive,
  };
  if (target?.entity === "resource") {
    const node = view.fieldResources.find((candidate) => candidate.id === target.id);
    if (node) {
      const command = validatePerceivedEntityCommand(view, {
        type: "resource-target",
        nodeId: node.id,
        point: { ...node.position },
        gatherOnArrival: coarsePointer,
      });
      if (command) return command;
    }
  }
  if (coarsePointer && target?.entity === "settlement") {
    const settlement = view.settlements.find((candidate) => candidate.id === target.id);
    if (
      settlement
      && settlement.discovered !== false
      && (
        directlyPerceivedSettlement(view, settlement)
        // A tracked Promise destination remains a coarse navigation affordance,
        // never an inspection/selection shortcut through the fog.
        || isActiveDestinationSettlement(view, settlement)
      )
    ) {
      return {
        type: "move-target",
        point: { ...settlement.position },
        additive: false,
      };
    }
  }
  if (target && target.entity !== "resource") {
    const command = validatePerceivedEntityCommand(view, {
      type: "select",
      entity: target.entity,
      id: target.id,
      point: { ...tappedPoint },
    });
    if (command) return command;
  }
  return moveToTap;
}

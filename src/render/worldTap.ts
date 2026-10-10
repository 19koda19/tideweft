import type {
  AggregateWildlifeEvidenceSpecies,
  AggregateWildlifeEvidenceView,
  FieldResourceNodeView,
  LooseCargoView,
  LivingActorViewSpecies,
  PorterView,
  RendererCommand,
  SettlementView,
  TideweftView,
  WorldPoint,
} from "./types";
import {
  currentSettlementVisibility,
  isDirectlyDetailPerceived,
  isWithinPlayerPickupRange,
  isWithinPlayerRecognitionRange,
} from "./perceptionPresentation";
import {
  isLivingActorSpecies,
  livingSpeciesActorIdMatchesNamespace,
} from "../game/livingSpeciesRegistry";
import { isCoreEcologyAggregateSpecies } from "../game/coreEcologyAggregatePolicy";

export type WorldTapTarget =
  | {
      readonly entity: "settlement" | "porter" | "route" | "resource";
      readonly id: string;
    }
  | {
      readonly entity: "living-actor";
      readonly species: LivingActorViewSpecies;
      readonly id: string;
    }
  | {
      readonly entity: "aggregate-wildlife-evidence";
      readonly species: AggregateWildlifeEvidenceSpecies;
      readonly aggregateId: string;
      readonly evidenceId: string;
    };

export type WorldPointerHitTarget = WorldTapTarget
  | { readonly entity: "wildlife-carcass" | "parcel"; readonly id: string };

// Humans must remain reachable when standing on a harbor marker. The other
// families retain the old renderer precedence; IDs break exact ties without
// depending on array order, localized names, or locale-specific collation.
const POINTER_HIT_ORDER: Readonly<Record<WorldPointerHitTarget["entity"], number>> = {
  porter: 0,
  settlement: 1,
  resource: 2,
  "living-actor": 3,
  "wildlife-carcass": 4,
  "aggregate-wildlife-evidence": 5,
  route: 6,
  parcel: 7,
};

const pointerHitKey = (target: WorldPointerHitTarget): string => JSON.stringify(
  target.entity === "aggregate-wildlife-evidence"
    ? [target.entity, target.species, target.aggregateId, target.evidenceId]
    : target.entity === "living-actor"
      ? [target.entity, target.species, target.id]
      : [target.entity, target.id],
);

/**
 * Resolves only the already eligible, exactly nearest public pointer hits.
 * Each query retains at most its tied hits; only a committed pointer release
 * advances the small presentation cursor. Hovering cannot consume a turn.
 * No positions, knowledge, or world state are changed or retained here.
 */
export function createWorldPointerHitCycle<T extends WorldPointerHitTarget>() {
  let previousGroup: string | null = null;
  let previousKey: string | null = null;
  const reset = (): void => { previousGroup = previousKey = null; };
  return {
    reset,
    begin: () => {
      let nearestDistance = Infinity;
      const targets = new Map<string, T>();
      return {
        consider: (target: T, distanceSquared: number): void => {
          if (!Number.isFinite(distanceSquared) || distanceSquared < 0) return;
          if (distanceSquared < nearestDistance) {
            nearestDistance = distanceSquared;
            targets.clear();
          }
          if (distanceSquared === nearestDistance) targets.set(pointerHitKey(target), target);
        },
        resolve: (advance = false): T | null => {
          const entries = [...targets.entries()].sort(([aKey, a], [bKey, b]) => (
            POINTER_HIT_ORDER[a.entity] - POINTER_HIT_ORDER[b.entity]
            || (aKey < bKey ? -1 : aKey > bKey ? 1 : 0)
          ));
          if (entries.length <= 1) {
            if (advance) reset();
            return entries[0]?.[1] ?? null;
          }
          const group = JSON.stringify(entries.map(([key]) => key));
          const previousIndex = group === previousGroup
            ? entries.findIndex(([key]) => key === previousKey)
            : -1;
          const [key, target] = entries[(previousIndex + 1) % entries.length]!;
          if (advance) {
            previousGroup = group;
            previousKey = key;
          }
          return target;
        },
      };
    },
  };
}

export function usesCoarseWorldPointer(
  pointerType: string,
  coarseMediaMatches: boolean,
): boolean {
  return pointerType === "touch" || coarseMediaMatches;
}

const finitePoint = (point: WorldPoint | undefined): point is WorldPoint =>
  Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));

const stableAggregateEvidenceId = (value: unknown): value is string =>
  typeof value === "string"
  && value.length > 0
  && value.length <= 256
  && /^[A-Za-z0-9][A-Za-z0-9:._/-]*$/u.test(value);

const directlyPerceivedPoint = (view: TideweftView, point: WorldPoint): boolean =>
  view.perception === undefined
    || (
      view.perception.valid === true
      && isDirectlyDetailPerceived(view.terrain, point, true)
    );

/**
 * Remembered route geometry remains useful beyond immediate sight, but it is
 * not an exact pointer target there. Keeping this check shared by both
 * renderers and the release-frame validator prevents a stale hover/click from
 * selecting a route after the short detail field moves away.
 */
export function routePointerTargetIsDirectlyPerceived(
  view: TideweftView,
  point: WorldPoint,
): boolean {
  return finitePoint(point) && directlyPerceivedPoint(view, point);
}

const directlyPerceivedSettlement = (
  view: TideweftView,
  settlement: SettlementView,
): boolean => view.perception === undefined || (
  view.perception.valid === true
  && currentSettlementVisibility(settlement, true) >= 1
  && isDirectlyDetailPerceived(view.terrain, settlement.position, true)
);

const directlyPerceivedResource = (
  view: TideweftView,
  node: FieldResourceNodeView,
): boolean => (view.perception === undefined || node.currentVisibility === 1)
  && isWithinPlayerPickupRange(view, node.position);

const directlyPerceivedPorter = (
  view: TideweftView,
  porter: PorterView,
): boolean => isWithinPlayerRecognitionRange(view, porter.position);

const directlyPerceivedParcel = (
  view: TideweftView,
  parcel: LooseCargoView,
): boolean => isWithinPlayerPickupRange(view, parcel.position);

const directlyPerceivedLivingActor = (
  view: TideweftView,
  species: LivingActorViewSpecies,
  actorId: string,
): Readonly<{ readonly position: WorldPoint }> | null => {
  if (
    !isLivingActorSpecies(species)
    || !livingSpeciesActorIdMatchesNamespace(actorId, species)
  ) return null;
  const matches = species === "domestic-dog"
    ? (view.dogs ?? []).filter((dog) => dog.actorId === actorId)
    : (view.wildlife ?? []).filter((actor) => (
        actor.species === species && actor.actorId === actorId
      ));
  if (matches.length !== 1) return null;
  const actor = matches[0];
  return finitePoint(actor?.position) && isWithinPlayerRecognitionRange(view, actor.position)
    ? actor
    : null;
};

const directlyPerceivedAggregateWildlifeEvidence = (
  view: TideweftView,
  species: AggregateWildlifeEvidenceSpecies,
  aggregateId: string,
  evidenceId: string,
): AggregateWildlifeEvidenceView | null => {
  if (
    !isCoreEcologyAggregateSpecies(species)
    || view.perception === undefined
    || !stableAggregateEvidenceId(aggregateId)
    || !stableAggregateEvidenceId(evidenceId)
  ) return null;
  const matches = (view.aggregateWildlifeEvidence ?? []).filter((evidence) => (
    evidence.representation === "population-evidence"
    && evidence.species === species
    && evidence.aggregateId === aggregateId
    && evidence.evidenceId === evidenceId
  ));
  if (matches.length !== 1) return null;
  const evidence = matches[0];
  return finitePoint(evidence?.position)
    && isWithinPlayerRecognitionRange(view, evidence.position)
    ? evidence
    : null;
};

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
      if (command.entity === "aggregate-wildlife-evidence") {
        const evidence = directlyPerceivedAggregateWildlifeEvidence(
          view,
          command.species,
          command.aggregateId,
          command.evidenceId,
        );
        return evidence
          ? {
              ...command,
              // Evidence can be reprojected between press and release. Bind
              // selection to the current authoritative physical sign point.
              point: { ...evidence.position },
            }
          : null;
      }
      if (command.entity === "world") return command;
      if (!command.id) return null;
      if (command.entity === "living-actor") {
        const actor = directlyPerceivedLivingActor(view, command.species, command.id);
        return actor
          ? { ...command, point: { ...actor.position } }
          : null;
      }
      if (command.entity === "route") {
        return finitePoint(command.point)
          && routePointerTargetIsDirectlyPerceived(view, command.point)
          && view.routes.some((route) => route.id === command.id)
          ? command
          : null;
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
    const command = validatePerceivedEntityCommand(
      view,
      target.entity === "living-actor"
        ? {
            type: "select",
            entity: "living-actor",
            species: target.species,
            id: target.id,
            point: { ...tappedPoint },
          }
        : target.entity === "aggregate-wildlife-evidence"
          ? {
              type: "select",
              entity: "aggregate-wildlife-evidence",
              species: target.species,
              aggregateId: target.aggregateId,
              evidenceId: target.evidenceId,
              point: { ...tappedPoint },
            }
          : {
              type: "select",
              entity: target.entity,
              id: target.id,
              point: { ...tappedPoint },
            },
    );
    if (command) return command;
  }
  return moveToTap;
}

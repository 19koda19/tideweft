import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import type { WorldView } from "../sim/types";
import {
  coreWildlifeTraversabilityCells,
  coreWildlifeTraversabilityLawIdentity,
  type CoreWildlifeTravelMedium,
  type CoreWildlifeTraversabilityLawIdentity,
} from "./coreWildlifeLocomotionProfile";
import type { LivingActorTraversabilityCell } from "./livingActorLocomotion";
import { isImmutableRegionalWorldView } from "./regionalWorldView";

interface RuntimeCoreTraversabilityCellBatchEntry {
  readonly sampledAtTick: number;
  readonly terrainTiles: WorldView["terrain"]["tiles"];
  readonly cells: readonly LivingActorTraversabilityCell[];
}

const RUNTIME_CORE_TRAVERSABILITY_CELL_BATCHES = new WeakMap<
  WorldView,
  Map<CoreWildlifeTraversabilityLawIdentity, RuntimeCoreTraversabilityCellBatchEntry>
>();

/**
 * Reuse only a module-minted immutable cell batch under exact world, tick,
 * terrain-array, and validated tile-law identity. Actor-bound surface fields
 * and grade/elevation authority deliberately remain outside this cache.
 */
export function runtimeCoreTraversabilityCellBatch(
  world: WorldView,
  sampledAtTick: number,
  species: CoreWildlifeSpecies,
  travelMedium?: CoreWildlifeTravelMedium,
): readonly LivingActorTraversabilityCell[] {
  if (!isImmutableRegionalWorldView(world)) {
    return coreWildlifeTraversabilityCells(species, world.terrain.tiles, travelMedium);
  }

  const lawIdentity = coreWildlifeTraversabilityLawIdentity(species, travelMedium);
  let worldBatches = RUNTIME_CORE_TRAVERSABILITY_CELL_BATCHES.get(world);
  const cached = worldBatches?.get(lawIdentity);
  if (
    cached?.sampledAtTick === sampledAtTick
    && cached.terrainTiles === world.terrain.tiles
  ) return cached.cells;

  const cells = coreWildlifeTraversabilityCells(
    species,
    world.terrain.tiles,
    travelMedium,
  );
  if (worldBatches === undefined) {
    worldBatches = new Map();
    RUNTIME_CORE_TRAVERSABILITY_CELL_BATCHES.set(world, worldBatches);
  }
  worldBatches.set(lawIdentity, Object.freeze({
    sampledAtTick,
    terrainTiles: world.terrain.tiles,
    cells,
  }));
  return cells;
}

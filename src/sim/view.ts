import { waterDepthAt } from "./terrain";
import { FIXED_POINT, type WorldState, type WorldView } from "./types";
import { copyInventory } from "./util";
import { currentInventoryTotals } from "./world";
import { calculateNetworkMetrics } from "./network";

export function createWorldView(world: WorldState): WorldView {
  return {
    completedTick: world.meta.completedTick,
    seedText: world.meta.seedText,
    rootSeed: [...world.meta.rootSeed],
    pressureMode: world.meta.pressureMode,
    terrain: {
      width: world.terrain.width,
      height: world.terrain.height,
      tiles: world.terrain.tiles.map((tile) => ({
        ...tile,
        waterDepth: waterDepthAt(tile, world.tide),
      })),
    },
    tide: { ...world.tide },
    weather: { ...world.weather },
    settlements: world.settlements.map((settlement) => ({
      ...settlement,
      residentIds: [...settlement.residentIds],
      inventory: copyInventory(settlement.inventory),
      recipes: settlement.recipes.map((recipe) => ({
        ...recipe,
        inputs: recipe.inputs.map((input) => ({ ...input })),
        outputs: recipe.outputs.map((output) => ({ ...output })),
      })),
      project: { ...settlement.project },
      trust: settlement.trust.map((trust) => ({ ...trust })),
      knowledge: settlement.knowledge.map((knowledge) => ({
        ...knowledge,
        freshness: Math.max(0, Math.min(FIXED_POINT, knowledge.confidence - knowledge.ageTicks * 200)),
      })),
    })),
    residents: world.residents.map((resident) => ({
      ...resident,
      identity: {
        ...resident.identity,
        originRegion: { ...resident.identity.originRegion },
        appearance: { ...resident.identity.appearance },
        temperament: [...resident.identity.temperament],
        skills: resident.identity.skills.map((skill) => ({ ...skill })),
        visibleGear: [...resident.identity.visibleGear],
        history: resident.identity.history.map((event) => ({ ...event })),
      },
      condition: { ...resident.condition },
      playerKnowledge: {
        ...resident.playerKnowledge,
        facts: [...resident.playerKnowledge.facts],
      },
      memories: resident.memories.map((memory) => ({ ...memory })),
      traits: { ...resident.traits },
      needs: { ...resident.needs },
      relationships: resident.relationships.map((relationship) => ({ ...relationship })),
      location: { ...resident.location },
    })),
    routes: world.routes.map((route) => ({ ...route, path: [...route.path] })),
    choirs: world.choirs.map((choir) => ({
      ...choir,
      routeIds: [...choir.routeIds],
      settlementIds: [...choir.settlementIds],
    })),
    contracts: world.contracts.map((contract) => ({
      ...contract,
      porterRouteIds: [...contract.porterRouteIds],
      porterSettlementIds: [...contract.porterSettlementIds],
    })),
    events: world.events.map((event) => ({ ...event, data: { ...event.data } })),
    totals: currentInventoryTotals(world),
    network: calculateNetworkMetrics(world),
  };
}

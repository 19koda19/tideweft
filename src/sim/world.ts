import { keyedRandomInt, keyedRandomU32, seedFromText, type RootSeed } from "./rng";
import {
  findTilePath,
  generateTerrain,
  pathTravelCost,
  settlementCandidateScore,
  tideAtTick,
} from "./terrain";
import {
  FIXED_POINT,
  MIN_SETTLEMENT_MANHATTAN_DISTANCE,
  RESOURCE_KINDS,
  RULES_VERSION,
  SAVE_FORMAT_VERSION,
  type CivicProject,
  type Inventory,
  type PressureMode,
  type ProjectKind,
  type Recipe,
  type ResidentRole,
  type ResidentState,
  type ResourceKind,
  type RouteState,
  type SettlementState,
  STRAND_AUTOMATION_THRESHOLD,
  type TerrainState,
  type WorldState,
} from "./types";
import { clampInteger, copyInventory, createEmptyInventory, sumInventories } from "./util";
import { stableRegionObjectId } from "./regions";
import {
  createResidentCondition,
  createResidentPlayerKnowledge,
  generateResidentDisplayName,
  generateResidentIdentity,
  generateResidentNeeds,
  generateResidentTraits,
  residentRelationshipTrust,
} from "./npcIdentity";
import { createActorPerceptionState } from "./actorPerception";

const SETTLEMENT_NAMES = [
  "Latchmere",
  "Morrow Fen",
  "Bellwake",
  "Siltgarden",
  "North Loom",
  "Reedspire",
  "Low Lantern",
];
const ROLES: readonly ResidentRole[] = [
  "fisher",
  "harvester",
  "medic",
  "mechanic",
  "navigator",
  "steward",
];
const PROJECTS: readonly ProjectKind[] = ["beacon", "cache", "crossing", "clinic", "ferry"];
const PROJECT_RESOURCES: readonly ResourceKind[] = ["parts", "reed", "parts", "medicine", "parts"];
const GENERATION_DOMAIN = 0x574f_524c;

interface IdAllocator {
  next: number;
}

function allocateId(allocator: IdAllocator): number {
  const id = allocator.next;
  allocator.next += 1;
  return id;
}

function makeInventory(seed: RootSeed, settlementIndex: number, specialization: ResourceKind): Inventory {
  const inventory = createEmptyInventory();
  for (let resourceIndex = 0; resourceIndex < RESOURCE_KINDS.length; resourceIndex += 1) {
    const resource = RESOURCE_KINDS[resourceIndex];
    if (resource === undefined) continue;
    inventory[resource] =
      resource === specialization
        ? keyedRandomInt(seed, GENERATION_DOMAIN, 0, settlementIndex, resourceIndex, 95, 125)
        : keyedRandomInt(seed, GENERATION_DOMAIN, 0, settlementIndex, resourceIndex, 8, 24, 10);
  }
  return inventory;
}

function makeRecipe(id: number, specialization: ResourceKind, settlementIndex: number): Recipe {
  const common = {
    id,
    intervalTicks: 60,
    nextRunTick: 60 + settlementIndex * 7,
  };
  switch (specialization) {
    case "food":
      return { ...common, name: "tidal garden harvest", inputs: [], outputs: [{ resource: "food", amount: 8 }] };
    case "freshWater":
      return {
        ...common,
        name: "rain-cistern draw",
        inputs: [],
        outputs: [{ resource: "freshWater", amount: 9 }],
      };
    case "reed":
      return { ...common, name: "reed cutting", inputs: [], outputs: [{ resource: "reed", amount: 7 }] };
    case "medicine":
      return {
        ...common,
        name: "marsh remedy",
        inputs: [
          { resource: "reed", amount: 2 },
          { resource: "freshWater", amount: 1 },
        ],
        outputs: [{ resource: "medicine", amount: 5 }],
      };
    case "parts":
      return {
        ...common,
        name: "ferry fittings",
        inputs: [{ resource: "reed", amount: 3 }],
        outputs: [{ resource: "parts", amount: 4 }],
      };
  }
}

function chooseSettlementTiles(seed: RootSeed, terrain: TerrainState): number[] {
  const candidates = terrain.tiles.filter(
    (tile) =>
      tile.x >= 3 &&
      tile.y >= 3 &&
      tile.x < terrain.width - 3 &&
      tile.y < terrain.height - 3 &&
      (tile.terrain === "meadow" || tile.terrain === "marsh" || tile.terrain === "tidal-flat"),
  );
  const selected: number[] = [];

  for (let ordinal = 0; ordinal < SETTLEMENT_NAMES.length; ordinal += 1) {
    let bestIndex = -1;
    let bestScore = Number.MIN_SAFE_INTEGER;
    for (const tile of candidates) {
      if (selected.includes(tile.index)) continue;
      let minimumDistance = terrain.width + terrain.height;
      for (const selectedIndex of selected) {
        const other = terrain.tiles[selectedIndex];
        if (other === undefined) continue;
        minimumDistance = Math.min(minimumDistance, Math.abs(tile.x - other.x) + Math.abs(tile.y - other.y));
      }
      if (selected.length > 0 && minimumDistance < MIN_SETTLEMENT_MANHATTAN_DISTANCE) continue;
      const spacing = selected.length === 0 ? 0 : Math.min(minimumDistance, 36) * 45_000;
      const score = settlementCandidateScore(seed, tile, ordinal) + spacing;
      if (score > bestScore || (score === bestScore && tile.index < bestIndex)) {
        bestScore = score;
        bestIndex = tile.index;
      }
    }
    if (bestIndex < 0) {
      throw new Error(
        `Terrain did not provide seven settlement sites at least ${MIN_SETTLEMENT_MANHATTAN_DISTANCE} tiles apart`,
      );
    }
    selected.push(bestIndex);
  }
  return selected;
}

function pairTrust(seed: RootSeed, leftId: number, rightId: number, purpose: number): number {
  const low = Math.min(leftId, rightId);
  const high = Math.max(leftId, rightId);
  return keyedRandomInt(seed, GENERATION_DOMAIN, low, high, purpose, 280_000, 620_000);
}

function makeProject(
  allocator: IdAllocator,
  settlementIndex: number,
): CivicProject {
  const kind = PROJECTS[settlementIndex % PROJECTS.length];
  const resource = PROJECT_RESOURCES[settlementIndex % PROJECT_RESOURCES.length];
  if (kind === undefined || resource === undefined) throw new Error("Missing project template");
  return {
    id: allocateId(allocator),
    kind,
    status: "building",
    resource,
    progress: 0,
    target: 24 + settlementIndex * 4,
  };
}

function addSettlementKnowledge(
  allocator: IdAllocator,
  seed: RootSeed,
  settlements: SettlementState[],
): void {
  for (const observer of settlements) {
    for (const subject of settlements) {
      if (subject.id === observer.id) continue;
      const resource = subject.specialization;
      observer.knowledge.push({
        id: allocateId(allocator),
        subjectSettlementId: subject.id,
        resource,
        reportedQuantity: subject.inventory[resource],
        ageTicks: keyedRandomInt(seed, GENERATION_DOMAIN, 0, observer.id, subject.id, 0, 180),
        confidence: keyedRandomInt(seed, GENERATION_DOMAIN, 0, observer.id, subject.id, 520_000, 860_000, 1),
        verified: false,
      });
    }
    observer.knowledge.sort((left, right) => left.subjectSettlementId - right.subjectSettlementId);
  }
}

function makeResidents(
  allocator: IdAllocator,
  seed: RootSeed,
  settlements: SettlementState[],
): ResidentState[] {
  const residents: ResidentState[] = [];
  for (let settlementIndex = 0; settlementIndex < settlements.length; settlementIndex += 1) {
    const settlement = settlements[settlementIndex];
    if (settlement === undefined) continue;
    for (let localIndex = 0; localIndex < 6; localIndex += 1) {
      const id = allocateId(allocator);
      const role = ROLES[(localIndex + settlementIndex) % ROLES.length];
      if (role === undefined) {
        throw new Error("Missing resident generation template");
      }
      const identityInput = {
        seed,
        originSettlementId: settlement.id,
        originSettlementKey: settlement.originKey,
        originActorOrdinal: localIndex,
        role,
        originRegion: { x: 0, y: 0 },
      } as const;
      const identity = generateResidentIdentity(identityInput);
      const resident: ResidentState = {
        id,
        name: generateResidentDisplayName(identityInput),
        homeSettlementId: settlement.id,
        role,
        identity,
        perception: createActorPerceptionState(identity.stableId),
        condition: createResidentCondition(identityInput),
        playerKnowledge: createResidentPlayerKnowledge(),
        memories: [],
        traits: generateResidentTraits(identityInput),
        needs: generateResidentNeeds(identityInput),
        relationships: [],
        intention: "work",
        location: { kind: "settlement", settlementId: settlement.id },
        activeContractId: null,
        nextThinkTick: 10 + (id % 17),
      };
      residents.push(resident);
      settlement.residentIds.push(id);
    }
  }

  for (const settlement of settlements) {
    const ids = settlement.residentIds;
    for (let index = 0; index < ids.length; index += 1) {
      const resident = residents.find((candidate) => candidate.id === ids[index]);
      const previousId = ids[(index + ids.length - 1) % ids.length];
      const nextId = ids[(index + 1) % ids.length];
      if (resident === undefined || previousId === undefined || nextId === undefined) continue;
      const relatedIds = previousId === nextId ? [previousId] : [previousId, nextId];
      resident.relationships = relatedIds
        .map((residentId) => {
          const related = residents.find((candidate) => candidate.id === residentId);
          if (related === undefined) throw new Error("Missing resident relationship target");
          return {
            residentId,
            trust: residentRelationshipTrust(
              seed,
              resident.identity.stableId,
              related.identity.stableId,
            ),
          };
        })
        .sort((left, right) => left.residentId - right.residentId);
    }
  }
  return residents;
}

function makeRoutes(
  allocator: IdAllocator,
  seed: RootSeed,
  terrain: TerrainState,
  settlements: readonly SettlementState[],
): RouteState[] {
  const routes: RouteState[] = [];
  for (let fromIndex = 0; fromIndex < settlements.length; fromIndex += 1) {
    for (let toIndex = fromIndex + 1; toIndex < settlements.length; toIndex += 1) {
      const from = settlements[fromIndex];
      const to = settlements[toIndex];
      if (from === undefined || to === undefined) continue;
      const path = findTilePath(terrain, from.tileIndex, to.tileIndex);
      const cost = pathTravelCost(terrain, path);
      const route: RouteState = {
        id: allocateId(allocator),
        fromSettlementId: from.id,
        toSettlementId: to.id,
        path,
        baseTravelTicks: Math.max(12, Math.trunc(cost / 360)),
        traceStrength: toIndex === fromIndex + 1
          ? keyedRandomInt(
              seed,
              GENERATION_DOMAIN,
              0,
              from.id,
              to.id,
              STRAND_AUTOMATION_THRESHOLD + 24_000,
              STRAND_AUTOMATION_THRESHOLD + 72_000,
            )
          : keyedRandomInt(seed, GENERATION_DOMAIN, 0, from.id, to.id, 8_000, 22_000),
        condition: keyedRandomInt(seed, GENERATION_DOMAIN, 0, from.id, to.id, 720_000, 930_000, 1),
        reliability: keyedRandomInt(seed, GENERATION_DOMAIN, 0, from.id, to.id, 580_000, 850_000, 2),
        traffic: 0,
        lastUsedTick: 0,
      };
      routes.push(route);
      for (const tileIndex of path) {
        const tile = terrain.tiles[tileIndex];
        if (tile !== undefined) tile.traceStrength = clampInteger(tile.traceStrength + 700);
      }
    }
  }
  return routes.sort((left, right) => left.id - right.id);
}

export function createInitialWorld(seedText: string, pressureMode: PressureMode): WorldState {
  const rootSeed = seedFromText(seedText);
  const terrain = generateTerrain(rootSeed);
  const allocator: IdAllocator = { next: 1 };
  const tileIndices = chooseSettlementTiles(rootSeed, terrain);
  const settlementIds = SETTLEMENT_NAMES.map(() => allocateId(allocator));
  const settlements: SettlementState[] = [];

  for (let index = 0; index < SETTLEMENT_NAMES.length; index += 1) {
    const id = settlementIds[index];
    const name = SETTLEMENT_NAMES[index];
    const tileIndex = tileIndices[index];
    const specialization = RESOURCE_KINDS[index % RESOURCE_KINDS.length];
    if (id === undefined || name === undefined || tileIndex === undefined || specialization === undefined) {
      throw new Error("Missing settlement generation template");
    }
    const recipe = makeRecipe(allocateId(allocator), specialization, index);
    settlements.push({
      id,
      originKey: stableRegionObjectId(rootSeed, { x: 0, y: 0 }, "settlement", index),
      name,
      tileIndex,
      specialization,
      residentIds: [],
      inventory: makeInventory(rootSeed, index, specialization),
      recipes: [recipe],
      project: makeProject(allocator, index),
      trust: [],
      knowledge: [],
      stress: 0,
    });
  }

  for (const settlement of settlements) {
    settlement.trust = settlements
      .filter((other) => other.id !== settlement.id)
      .map((other) => ({ settlementId: other.id, value: pairTrust(rootSeed, settlement.id, other.id, 55) }))
      .sort((left, right) => left.settlementId - right.settlementId);
  }
  addSettlementKnowledge(allocator, rootSeed, settlements);
  const residents = makeResidents(allocator, rootSeed, settlements);
  const routes = makeRoutes(allocator, rootSeed, terrain, settlements);
  const initial = sumInventories(settlements.map((settlement) => settlement.inventory));

  return {
    meta: {
      completedTick: 0,
      rootSeed: [...rootSeed],
      seedText,
      pressureMode,
      saveFormatVersion: SAVE_FORMAT_VERSION,
      rulesVersion: RULES_VERSION,
      nextEntityId: allocator.next,
      nextEventSequence: 2,
    },
    terrain,
    tide: tideAtTick(0),
    weather: {
      kind: keyedRandomU32(rootSeed, GENERATION_DOMAIN, 0, 0, 71) % 3 === 0 ? "mist" : "clear",
      intensity: keyedRandomInt(rootSeed, GENERATION_DOMAIN, 0, 0, 72, 80_000, 260_000),
      windX: keyedRandomInt(rootSeed, GENERATION_DOMAIN, 0, 0, 73, -120_000, 120_000),
      windY: keyedRandomInt(rootSeed, GENERATION_DOMAIN, 0, 0, 74, -120_000, 120_000),
      nextChangeTick: 180,
    },
    settlements,
    residents,
    routes,
    choirs: [],
    contracts: [],
    ledger: {
      initial: copyInventory(initial),
      produced: createEmptyInventory(),
      consumed: createEmptyInventory(),
    },
    processedCommandIds: [],
    events: [
      {
        tick: 0,
        sequence: 1,
        type: "world-created",
        subjectId: null,
        data: {
          settlements: settlements.length,
          residents: residents.length,
          width: terrain.width,
          height: terrain.height,
        },
      },
    ],
  };
}

export function findRouteBetween(
  world: Pick<WorldState, "routes">,
  leftSettlementId: number,
  rightSettlementId: number,
): RouteState | undefined {
  const low = Math.min(leftSettlementId, rightSettlementId);
  const high = Math.max(leftSettlementId, rightSettlementId);
  return world.routes.find(
    (route) => route.fromSettlementId === low && route.toSettlementId === high,
  );
}

export function currentInventoryTotals(world: WorldState): Inventory {
  const inventories = world.settlements.map((settlement) => settlement.inventory);
  const totals = sumInventories(inventories);
  for (const contract of world.contracts) {
    totals[contract.resource] += contract.cargoQuantity;
  }
  return totals;
}

export function pressureMultiplier(mode: PressureMode): number {
  switch (mode) {
    case "calm":
      return 750_000;
    case "standard":
      return FIXED_POINT;
    case "wild":
      return 1_300_000;
  }
}

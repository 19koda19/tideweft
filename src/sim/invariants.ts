import { tideAtTick } from "./terrain";
import {
  FIXED_POINT,
  LEGACY_WORLD_HEIGHT,
  LEGACY_WORLD_WIDTH,
  RESOURCE_KINDS,
  RULES_VERSION,
  SAVE_FORMAT_VERSION,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type ContractState,
  type WorldState,
} from "./types";
import { currentInventoryTotals } from "./world";
import {
  MAX_RESIDENT_MEMORIES,
  stableResidentIdForGeneration,
} from "./npcIdentity";
import { stableRegionObjectId } from "./regions";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`World invariant failed: ${message}`);
}

function assertSafeIntegers(value: unknown, path: string): void {
  if (typeof value === "number") {
    invariant(Number.isSafeInteger(value), `${path} must be a safe integer`);
    invariant(!Object.is(value, -0), `${path} must not be negative zero`);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSafeIntegers(entry, `${path}[${index}]`));
    return;
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    assertSafeIntegers((value as Record<string, unknown>)[key], `${path}.${key}`);
  }
}

function assertFixed(value: number, path: string): void {
  invariant(value >= 0 && value <= FIXED_POINT, `${path} must be fixed-point 0..1,000,000`);
}

function assertSortedIds(values: readonly { id: number }[], path: string): void {
  for (let index = 1; index < values.length; index += 1) {
    invariant((values[index - 1]?.id ?? 0) < (values[index]?.id ?? 0), `${path} must be sorted by unique ID`);
  }
}

function assertContractLifecycle(contract: ContractState): void {
  invariant(contract.quantity > 0, `contract ${contract.id} quantity must be positive`);
  invariant(contract.playerExclusiveUntilTick >= contract.createdTick, `contract ${contract.id} exclusivity is invalid`);
  invariant(contract.dueTick > contract.playerExclusiveUntilTick, `contract ${contract.id} is due before porter release`);
  invariant(contract.cargoQuantity >= 0 && contract.cargoQuantity <= contract.quantity, `contract ${contract.id} cargo is invalid`);
  invariant(contract.originSettlementId !== contract.destinationSettlementId, `contract ${contract.id} must cross settlements`);
  switch (contract.status) {
    case "offered":
      invariant(contract.carrierKind === null, `offered contract ${contract.id} cannot have a carrier`);
      invariant(contract.assignedResidentId === null, `offered contract ${contract.id} cannot have a resident`);
      invariant(contract.acceptedTick === null && contract.departedTick === null && contract.completedTick === null, `offered contract ${contract.id} has lifecycle timestamps`);
      invariant(contract.cargoQuantity === 0, `offered contract ${contract.id} has cargo`);
      break;
    case "accepted":
      invariant(contract.carrierKind !== null, `accepted contract ${contract.id} needs a carrier`);
      invariant(contract.acceptedTick !== null, `accepted contract ${contract.id} needs acceptedTick`);
      invariant(contract.departedTick === null && contract.completedTick === null, `accepted contract ${contract.id} has later timestamps`);
      invariant(contract.cargoQuantity === 0, `accepted contract ${contract.id} has cargo before pickup`);
      break;
    case "in-transit":
      invariant(contract.carrierKind !== null, `in-transit contract ${contract.id} needs a carrier`);
      invariant(contract.acceptedTick !== null && contract.departedTick !== null, `in-transit contract ${contract.id} lacks timestamps`);
      invariant(contract.completedTick === null, `in-transit contract ${contract.id} is already completed`);
      invariant(contract.cargoQuantity === contract.quantity, `in-transit contract ${contract.id} must hold all cargo`);
      if (contract.carrierKind === "resident") {
        invariant(contract.arrivalTick !== null, `porter contract ${contract.id} needs an arrival tick`);
      } else {
        invariant(contract.arrivalTick === null, `player contract ${contract.id} cannot auto-arrive`);
      }
      break;
    case "fulfilled":
      invariant(contract.completedTick !== null, `fulfilled contract ${contract.id} lacks completedTick`);
      invariant(contract.cargoQuantity === 0, `fulfilled contract ${contract.id} retains cargo`);
      invariant(contract.deliveryCondition !== null && contract.deliveryGrade !== null, `fulfilled contract ${contract.id} lacks a grade`);
      invariant(contract.deliveryTraceCost !== null && contract.deliveryTraceCost >= 0, `fulfilled contract ${contract.id} lacks trace cost`);
      break;
    case "expired":
    case "cancelled":
      invariant(contract.completedTick !== null, `${contract.status} contract ${contract.id} lacks completedTick`);
      invariant(contract.cargoQuantity === 0, `${contract.status} contract ${contract.id} retains cargo`);
      break;
    default: {
      const impossible: never = contract.status;
      throw new Error(`World invariant failed: unknown contract status ${String(impossible)}`);
    }
  }
  if (contract.carrierKind === "resident") {
    invariant(contract.assignedResidentId !== null, `resident contract ${contract.id} lacks resident ID`);
  }
  if (contract.carrierKind === "player") {
    invariant(contract.assignedResidentId === null, `player contract ${contract.id} has a resident ID`);
  }
  if (contract.deliveryCondition !== null) assertFixed(contract.deliveryCondition, `contract ${contract.id}.deliveryCondition`);
  if (contract.status !== "fulfilled") invariant(contract.deliveryTraceCost === null, `unfinished contract ${contract.id} has trace cost`);
}

export function assertWorldInvariants(world: WorldState): void {
  assertSafeIntegers(world, "world");
  invariant(world.meta.saveFormatVersion === SAVE_FORMAT_VERSION, "save format version is unsupported");
  invariant(world.meta.rulesVersion === RULES_VERSION, "rules version is unsupported");
  invariant(world.meta.completedTick >= 0, "completed tick cannot be negative");
  invariant(
    world.meta.pressureMode === "calm" || world.meta.pressureMode === "standard" || world.meta.pressureMode === "wild",
    "pressure mode is invalid",
  );
  invariant(world.meta.rootSeed.length === 4, "root seed must contain four words");
  for (const word of world.meta.rootSeed) invariant(word >= 0 && word <= 0xffff_ffff, "root seed word is outside uint32");

  const hasCurrentDimensions = world.terrain.width === WORLD_WIDTH && world.terrain.height === WORLD_HEIGHT;
  const hasLegacyDimensions =
    world.terrain.width === LEGACY_WORLD_WIDTH && world.terrain.height === LEGACY_WORLD_HEIGHT;
  invariant(hasCurrentDimensions || hasLegacyDimensions, "terrain dimensions are unsupported");
  invariant(
    world.terrain.tiles.length === world.terrain.width * world.terrain.height,
    "terrain tile count is wrong",
  );
  for (let index = 0; index < world.terrain.tiles.length; index += 1) {
    const tile = world.terrain.tiles[index];
    invariant(tile !== undefined && tile.index === index, `terrain tile ${index} has the wrong index`);
    invariant(
      tile.x === index % world.terrain.width && tile.y === Math.floor(index / world.terrain.width),
      `terrain tile ${index} has wrong coordinates`,
    );
    assertFixed(tile.elevation, `tile ${index}.elevation`);
    assertFixed(tile.moisture, `tile ${index}.moisture`);
    assertFixed(tile.roughness, `tile ${index}.roughness`);
    assertFixed(tile.traceStrength, `tile ${index}.traceStrength`);
    invariant(tile.baseTravelCost > 0, `tile ${index} travel cost must be positive`);
  }

  const expectedTide = tideAtTick(world.meta.completedTick);
  invariant(
    world.tide.phase === expectedTide.phase &&
      world.tide.level === expectedTide.level &&
      world.tide.direction === expectedTide.direction,
    "tide does not match completed tick",
  );
  assertFixed(world.weather.intensity, "weather.intensity");
  invariant(world.weather.nextChangeTick > world.meta.completedTick, "weather transition must be in the future");
  invariant(world.weather.windX >= -FIXED_POINT && world.weather.windX <= FIXED_POINT, "weather.windX is invalid");
  invariant(world.weather.windY >= -FIXED_POINT && world.weather.windY <= FIXED_POINT, "weather.windY is invalid");

  invariant(world.settlements.length === 7, "world must have seven settlements");
  invariant(world.residents.length === 42, "world must have forty-two named residents");
  assertSortedIds(world.settlements, "settlements");
  assertSortedIds(world.residents, "residents");
  assertSortedIds(world.routes, "routes");
  assertSortedIds(world.choirs, "choirs");
  assertSortedIds(world.contracts, "contracts");

  const entityIds = new Set<number>();
  const claimId = (id: number, path: string) => {
    invariant(id > 0, `${path} ID must be positive`);
    invariant(!entityIds.has(id), `${path} duplicates entity ID ${id}`);
    entityIds.add(id);
  };
  const settlementOriginKeys = new Set<string>();
  for (let settlementOrdinal = 0; settlementOrdinal < world.settlements.length; settlementOrdinal += 1) {
    const settlement = world.settlements[settlementOrdinal];
    invariant(settlement !== undefined, `settlement ${settlementOrdinal} is missing`);
    claimId(settlement.id, `settlement ${settlement.id}`);
    invariant(settlement.name.length > 0, `settlement ${settlement.id} is unnamed`);
    invariant(
      settlement.originKey === stableRegionObjectId(
        world.meta.rootSeed,
        { x: 0, y: 0 },
        "settlement",
        settlementOrdinal,
      ),
      `settlement ${settlement.id} origin key is invalid`,
    );
    invariant(!settlementOriginKeys.has(settlement.originKey), `settlement origin key ${settlement.originKey} is duplicated`);
    settlementOriginKeys.add(settlement.originKey);
    invariant(world.terrain.tiles[settlement.tileIndex] !== undefined, `settlement ${settlement.id} tile is invalid`);
    for (const resource of RESOURCE_KINDS) {
      invariant(settlement.inventory[resource] >= 0, `settlement ${settlement.id} has negative ${resource}`);
    }
    claimId(settlement.project.id, `settlement ${settlement.id} project`);
    invariant(settlement.project.progress >= 0 && settlement.project.progress <= settlement.project.target, `settlement ${settlement.id} project progress is invalid`);
    assertFixed(settlement.stress, `settlement ${settlement.id}.stress`);
    for (const recipe of settlement.recipes) {
      claimId(recipe.id, `settlement ${settlement.id} recipe`);
      invariant(recipe.intervalTicks > 0 && recipe.nextRunTick > world.meta.completedTick, `recipe ${recipe.id} schedule is invalid`);
    }
    const trustIds = new Set<number>();
    for (const trust of settlement.trust) {
      invariant(!trustIds.has(trust.settlementId), `settlement ${settlement.id} has duplicate trust target`);
      trustIds.add(trust.settlementId);
      invariant(trust.settlementId !== settlement.id, `settlement ${settlement.id} trusts itself`);
      assertFixed(trust.value, `settlement ${settlement.id}.trust`);
    }
    for (const knowledge of settlement.knowledge) {
      claimId(knowledge.id, `knowledge ${knowledge.id}`);
      invariant(knowledge.ageTicks >= 0, `knowledge ${knowledge.id} has negative age`);
      invariant(knowledge.reportedQuantity >= 0, `knowledge ${knowledge.id} has negative quantity`);
      assertFixed(knowledge.confidence, `knowledge ${knowledge.id}.confidence`);
    }
  }

  const settlementIds = new Set(world.settlements.map((settlement) => settlement.id));
  const residentIds = new Set(world.residents.map((resident) => resident.id));
  const routeIds = new Set(world.routes.map((route) => route.id));
  for (const settlement of world.settlements) {
    invariant(settlement.residentIds.length === 6, `settlement ${settlement.id} must have six residents`);
    for (const residentId of settlement.residentIds) invariant(residentIds.has(residentId), `settlement ${settlement.id} references unknown resident`);
    for (const trust of settlement.trust) {
      invariant(settlementIds.has(trust.settlementId), `settlement ${settlement.id} trust target is invalid`);
      const reciprocal = world.settlements
        .find((candidate) => candidate.id === trust.settlementId)
        ?.trust.find((candidate) => candidate.settlementId === settlement.id);
      invariant(reciprocal?.value === trust.value, `settlement ${settlement.id} trust is not reciprocal`);
    }
    for (const knowledge of settlement.knowledge) {
      invariant(settlementIds.has(knowledge.subjectSettlementId), `knowledge ${knowledge.id} subject is invalid`);
    }
  }

  const stableResidentIds = new Set<string>();
  const residentMemoryIds = new Set<string>();
  const validTemperaments = new Set([
    "calm", "nervous", "bold", "cautious", "curious", "reserved", "patient", "practical",
    "protective", "social", "stubborn", "optimistic",
  ]);
  const incompatibleTemperamentPairs = new Set([
    "bold|cautious",
    "calm|nervous",
    "reserved|social",
  ]);
  const validSkillKinds = new Set([
    "navigation", "first-aid", "swimming", "weather-knowledge", "rope-work", "animal-handling",
    "repair", "foraging",
  ]);
  const validGear = new Set([
    "waterproof-pack", "walking-pole", "rain-shell", "rope-coil", "map-case", "medical-satchel",
    "tool-roll", "reed-hat",
  ]);
  const validEmotions = new Set(["content", "focused", "worried", "afraid", "tired", "relieved"]);
  const validEmotionCauses = new Set([
    "ROUTINE_SAFE", "PROMISE_IN_PROGRESS", "WEATHER_EXPOSURE", "NEED_REST", "NEED_FOOD",
    "SHELTER_REACHED", "PROMISE_DELIVERED",
  ]);
  const validRoles = new Set(["fisher", "harvester", "medic", "mechanic", "navigator", "steward"]);
  const validIntentions = new Set(["rest", "eat", "connect", "work", "carry"]);
  const validAges = new Set(["young-adult", "adult", "older-adult"]);
  const validBuilds = new Set(["slight", "lean", "average", "broad", "stocky"]);
  const validHair = new Set(["black", "brown", "auburn", "gray", "silver", "cropped", "covered"]);
  const validMarks = new Set(["none", "freckles", "weathered", "brow-scar", "hand-scar", "round-glasses"]);
  const validPalettes = new Set(["silt", "reed", "tide", "ember", "lichen", "storm"]);
  const validHistoryKinds = new Set([
    "survived-storm", "worked-another-route", "rescued-traveler", "lost-equipment", "learned-trade",
    "migrated-settlement",
  ]);
  for (const resident of world.residents) {
    claimId(resident.id, `resident ${resident.id}`);
    invariant(resident.name.length > 0, `resident ${resident.id} is unnamed`);
    invariant(validRoles.has(resident.role), `resident ${resident.id} role is invalid`);
    invariant(validIntentions.has(resident.intention), `resident ${resident.id} intention is invalid`);
    invariant(settlementIds.has(resident.homeSettlementId), `resident ${resident.id} home is invalid`);
    const home = world.settlements.find(({ id }) => id === resident.homeSettlementId);
    invariant(home?.residentIds.includes(resident.id) === true, `resident ${resident.id} is absent from current home`);
    invariant(resident.identity.species === "human", `resident ${resident.id} species is invalid`);
    invariant(
      Number.isSafeInteger(resident.identity.generationVersion)
        && resident.identity.generationVersion > 0,
      `resident ${resident.id} generation version is invalid`,
    );
    invariant(
      resident.identity.originRegion.x === 0 && resident.identity.originRegion.y === 0,
      `resident ${resident.id} compatibility origin is invalid`,
    );
    const origin = world.settlements.find(({ id }) => id === resident.identity.originSettlementId);
    invariant(origin !== undefined, `resident ${resident.id} origin settlement is invalid`);
    invariant(
      resident.identity.originSettlementKey.length > 0
        && resident.identity.originSettlementKey === origin?.originKey,
      `resident ${resident.id} semantic origin is invalid`,
    );
    invariant(
      Number.isSafeInteger(resident.identity.originActorOrdinal)
        && resident.identity.originActorOrdinal >= 0,
      `resident ${resident.id} origin actor ordinal is invalid`,
    );
    invariant(validRoles.has(resident.identity.originRole), `resident ${resident.id} origin role is invalid`);
    invariant(!stableResidentIds.has(resident.identity.stableId), `resident stable ID ${resident.identity.stableId} is duplicated`);
    stableResidentIds.add(resident.identity.stableId);
    invariant(
      resident.identity.stableId === stableResidentIdForGeneration(
        {
          seed: world.meta.rootSeed,
          originSettlementId: resident.identity.originSettlementId,
          originSettlementKey: resident.identity.originSettlementKey,
          originActorOrdinal: resident.identity.originActorOrdinal,
          role: resident.identity.originRole,
          originRegion: resident.identity.originRegion,
        },
        resident.identity.generationVersion,
      ),
      `resident ${resident.id} stable ID does not match its semantic origin`,
    );
    invariant(
      resident.identity.heightCm >= 145 && resident.identity.heightCm <= 200,
      `resident ${resident.id} height is invalid`,
    );
    invariant(validAges.has(resident.identity.age), `resident ${resident.id} age is invalid`);
    invariant(validBuilds.has(resident.identity.build), `resident ${resident.id} build is invalid`);
    invariant(validHair.has(resident.identity.appearance.hair), `resident ${resident.id} hair is invalid`);
    invariant(validMarks.has(resident.identity.appearance.mark), `resident ${resident.id} mark is invalid`);
    invariant(validPalettes.has(resident.identity.appearance.palette), `resident ${resident.id} palette is invalid`);
    invariant(
      resident.identity.temperament.length === 2
        && new Set(resident.identity.temperament).size === resident.identity.temperament.length,
      `resident ${resident.id} temperament is incoherent`,
    );
    for (const temperament of resident.identity.temperament) {
      invariant(validTemperaments.has(temperament), `resident ${resident.id} temperament is invalid`);
    }
    invariant(
      !incompatibleTemperamentPairs.has([...resident.identity.temperament].sort().join("|")),
      `resident ${resident.id} temperament pair is contradictory`,
    );
    invariant(
      resident.identity.skills.length === 2
        && new Set(resident.identity.skills.map(({ kind }) => kind)).size === resident.identity.skills.length,
      `resident ${resident.id} skills are incoherent`,
    );
    for (const skill of resident.identity.skills) {
      invariant(validSkillKinds.has(skill.kind), `resident ${resident.id} skill is invalid`);
      assertFixed(skill.aptitude, `resident ${resident.id}.${skill.kind}`);
    }
    invariant(
      new Set(resident.identity.visibleGear).size === resident.identity.visibleGear.length,
      `resident ${resident.id} visible gear is duplicated`,
    );
    for (const gear of resident.identity.visibleGear) {
      invariant(validGear.has(gear), `resident ${resident.id} visible gear is invalid`);
    }
    invariant(resident.identity.history.length <= 2, `resident ${resident.id} history is unbounded`);
    for (const event of resident.identity.history) {
      invariant(validHistoryKinds.has(event.kind), `resident ${resident.id} history kind is invalid`);
      invariant(event.worldDay > 0, `resident ${resident.id} history day is invalid`);
    }
    assertFixed(resident.condition.wetness, `resident ${resident.id}.wetness`);
    assertFixed(resident.condition.coldStress, `resident ${resident.id}.coldStress`);
    assertFixed(resident.condition.exhaustion, `resident ${resident.id}.exhaustion`);
    invariant(validEmotions.has(resident.condition.emotion), `resident ${resident.id} emotion is invalid`);
    invariant(validEmotionCauses.has(resident.condition.emotionCause), `resident ${resident.id} emotion cause is invalid`);
    invariant(typeof resident.condition.sheltering === "boolean", `resident ${resident.id} shelter state is invalid`);
    invariant(resident.condition.routeDelayTicks >= 0, `resident ${resident.id} route delay is invalid`);
    invariant(
      !resident.condition.sheltering || resident.location.kind === "route",
      `resident ${resident.id} shelters outside a route`,
    );
    invariant(resident.memories.length <= MAX_RESIDENT_MEMORIES, `resident ${resident.id} memories are unbounded`);
    for (const memory of resident.memories) {
      invariant(memory.id.length > 0 && !residentMemoryIds.has(memory.id), `resident memory ${memory.id} is duplicated`);
      residentMemoryIds.add(memory.id);
      invariant(memory.tick >= 0 && memory.tick <= world.meta.completedTick, `resident memory ${memory.id} tick is invalid`);
      invariant(
        (memory.kind === "met-player" && memory.cause === "PLAYER_GREETING")
          || (memory.kind === "weather-shelter" && memory.cause === "SEVERE_WEATHER"),
        `resident memory ${memory.id} cause is invalid`,
      );
    }
    invariant(
      new Set(resident.playerKnowledge.facts).size === resident.playerKnowledge.facts.length,
      `resident ${resident.id} known facts are duplicated`,
    );
    for (const fact of resident.playerKnowledge.facts) {
      invariant(fact === "name" || fact === "occupation" || fact === "home", `resident ${resident.id} known fact is invalid`);
    }
    if (resident.playerKnowledge.level === "unfamiliar") {
      invariant(resident.playerKnowledge.firstObservedTick === null, `resident ${resident.id} is secretly observed`);
      invariant(resident.playerKnowledge.introducedTick === null, `resident ${resident.id} is secretly introduced`);
      invariant(resident.playerKnowledge.facts.length === 0, `resident ${resident.id} leaks unknown facts`);
    } else {
      invariant(
        resident.playerKnowledge.firstObservedTick !== null
          && resident.playerKnowledge.firstObservedTick <= world.meta.completedTick,
        `resident ${resident.id} observation tick is invalid`,
      );
      if (resident.playerKnowledge.level === "acquainted") {
        invariant(
          resident.playerKnowledge.introducedTick !== null
            && resident.playerKnowledge.introducedTick <= world.meta.completedTick
            && resident.playerKnowledge.introducedTick >= resident.playerKnowledge.firstObservedTick,
          `resident ${resident.id} introduction tick is invalid`,
        );
        invariant(
          resident.playerKnowledge.facts.length === 3
            && resident.playerKnowledge.facts[0] === "name"
            && resident.playerKnowledge.facts[1] === "occupation"
            && resident.playerKnowledge.facts[2] === "home",
          `resident ${resident.id} introduction facts are incomplete`,
        );
      } else {
        invariant(resident.playerKnowledge.level === "recognized", `resident ${resident.id} knowledge level is invalid`);
        invariant(resident.playerKnowledge.introducedTick === null, `resident ${resident.id} is introduced too early`);
        invariant(resident.playerKnowledge.facts.length === 0, `resident ${resident.id} recognized facts leak identity`);
      }
    }
    assertFixed(resident.traits.resolve, `resident ${resident.id}.resolve`);
    assertFixed(resident.traits.empathy, `resident ${resident.id}.empathy`);
    assertFixed(resident.traits.curiosity, `resident ${resident.id}.curiosity`);
    assertFixed(resident.needs.food, `resident ${resident.id}.food`);
    assertFixed(resident.needs.rest, `resident ${resident.id}.rest`);
    assertFixed(resident.needs.belonging, `resident ${resident.id}.belonging`);
    if (resident.location.kind === "settlement") {
      invariant(settlementIds.has(resident.location.settlementId), `resident ${resident.id} location is invalid`);
    } else {
      invariant(routeIds.has(resident.location.routeId), `resident ${resident.id} route is invalid`);
      assertFixed(resident.location.progress, `resident ${resident.id}.progress`);
    }
    const relationshipIds = new Set<number>();
    for (const relationship of resident.relationships) {
      invariant(residentIds.has(relationship.residentId), `resident ${resident.id} relationship is invalid`);
      invariant(relationship.residentId !== resident.id, `resident ${resident.id} relates to self`);
      invariant(!relationshipIds.has(relationship.residentId), `resident ${resident.id} has duplicate relationship`);
      relationshipIds.add(relationship.residentId);
      assertFixed(relationship.trust, `resident ${resident.id}.relationship trust`);
    }
  }

  const routeEndpointSignatures = new Set<string>();
  for (const route of world.routes) {
    claimId(route.id, `route ${route.id}`);
    invariant(settlementIds.has(route.fromSettlementId) && settlementIds.has(route.toSettlementId), `route ${route.id} endpoint is invalid`);
    invariant(route.fromSettlementId < route.toSettlementId, `route ${route.id} endpoint order is unstable`);
    const endpointSignature = `${route.fromSettlementId},${route.toSettlementId}`;
    invariant(!routeEndpointSignatures.has(endpointSignature), `route ${route.id} duplicates an endpoint pair`);
    routeEndpointSignatures.add(endpointSignature);
    invariant(route.path.length >= 2, `route ${route.id} path is too short`);
    invariant(new Set(route.path).size === route.path.length, `route ${route.id} path repeats a tile`);
    const from = world.settlements.find((settlement) => settlement.id === route.fromSettlementId);
    const to = world.settlements.find((settlement) => settlement.id === route.toSettlementId);
    invariant(route.path[0] === from?.tileIndex && route.path[route.path.length - 1] === to?.tileIndex, `route ${route.id} path endpoints are wrong`);
    for (let index = 1; index < route.path.length; index += 1) {
      const previous = world.terrain.tiles[route.path[index - 1] ?? -1];
      const tile = world.terrain.tiles[route.path[index] ?? -1];
      invariant(previous !== undefined && tile !== undefined, `route ${route.id} path tile is invalid`);
      invariant(Math.abs(previous.x - tile.x) + Math.abs(previous.y - tile.y) === 1, `route ${route.id} path is disconnected`);
    }
    assertFixed(route.traceStrength, `route ${route.id}.traceStrength`);
    assertFixed(route.condition, `route ${route.id}.condition`);
    assertFixed(route.reliability, `route ${route.id}.reliability`);
    invariant(route.baseTravelTicks > 0 && route.traffic >= 0, `route ${route.id} timing or traffic is invalid`);
  }

  const tideChoirSignatures = new Set<string>();
  for (const choir of world.choirs) {
    claimId(choir.id, `tide choir ${choir.id}`);
    invariant(choir.awakenedTick >= 0 && choir.awakenedTick <= world.meta.completedTick, `tide choir ${choir.id} awakening tick is invalid`);
    invariant(choir.routeIds.length >= 3 && choir.routeIds.length <= 7, `tide choir ${choir.id} must contain 3 to 7 routes`);
    invariant(choir.settlementIds.length === choir.routeIds.length, `tide choir ${choir.id} cycle size is invalid`);
    for (let index = 1; index < choir.routeIds.length; index += 1) {
      invariant(
        (choir.routeIds[index - 1] ?? 0) < (choir.routeIds[index] ?? 0),
        `tide choir ${choir.id} route IDs are not canonical`,
      );
    }
    for (let index = 1; index < choir.settlementIds.length; index += 1) {
      invariant(
        (choir.settlementIds[index - 1] ?? 0) < (choir.settlementIds[index] ?? 0),
        `tide choir ${choir.id} settlement IDs are not canonical`,
      );
    }
    const signature = choir.routeIds.join(",");
    invariant(!tideChoirSignatures.has(signature), `tide choir ${choir.id} repeats an awakened cycle`);
    tideChoirSignatures.add(signature);

    const degrees = new Map<number, number>();
    const neighbors = new Map<number, number[]>();
    for (const routeId of choir.routeIds) {
      invariant(routeIds.has(routeId), `tide choir ${choir.id} route ${routeId} is invalid`);
      const route = world.routes.find((candidate) => candidate.id === routeId);
      invariant(route !== undefined, `tide choir ${choir.id} route ${routeId} is missing`);
      degrees.set(route.fromSettlementId, (degrees.get(route.fromSettlementId) ?? 0) + 1);
      degrees.set(route.toSettlementId, (degrees.get(route.toSettlementId) ?? 0) + 1);
      const fromNeighbors = neighbors.get(route.fromSettlementId) ?? [];
      fromNeighbors.push(route.toSettlementId);
      neighbors.set(route.fromSettlementId, fromNeighbors);
      const toNeighbors = neighbors.get(route.toSettlementId) ?? [];
      toNeighbors.push(route.fromSettlementId);
      neighbors.set(route.toSettlementId, toNeighbors);
    }
    const derivedSettlementIds = [...degrees.keys()].sort((left, right) => left - right);
    invariant(
      derivedSettlementIds.length === choir.routeIds.length
        && derivedSettlementIds.every((settlementId) => degrees.get(settlementId) === 2),
      `tide choir ${choir.id} is not a simple cycle`,
    );
    invariant(
      derivedSettlementIds.every((settlementId, index) => settlementId === choir.settlementIds[index]),
      `tide choir ${choir.id} settlement IDs do not match its routes`,
    );
    const visited = new Set<number>();
    const pending = derivedSettlementIds[0] === undefined ? [] : [derivedSettlementIds[0]];
    while (pending.length > 0) {
      const settlementId = pending.pop();
      if (settlementId === undefined || visited.has(settlementId)) continue;
      visited.add(settlementId);
      for (const neighbor of neighbors.get(settlementId) ?? []) {
        if (!visited.has(neighbor)) pending.push(neighbor);
      }
    }
    invariant(visited.size === derivedSettlementIds.length, `tide choir ${choir.id} cycle is disconnected`);
  }

  for (const contract of world.contracts) {
    claimId(contract.id, `contract ${contract.id}`);
    assertContractLifecycle(contract);
    invariant(settlementIds.has(contract.originSettlementId) && settlementIds.has(contract.destinationSettlementId), `contract ${contract.id} settlement is invalid`);
    const requester = world.residents.find((resident) => resident.id === contract.requesterResidentId);
    invariant(requester !== undefined, `contract ${contract.id} requester is invalid`);
    invariant(requester.homeSettlementId === contract.destinationSettlementId, `contract ${contract.id} requester is not at its destination`);
    invariant(routeIds.has(contract.routeId), `contract ${contract.id} route is invalid`);
    const primaryRoute = world.routes.find((route) => route.id === contract.routeId);
    invariant(
      primaryRoute !== undefined
        && primaryRoute.fromSettlementId === Math.min(contract.originSettlementId, contract.destinationSettlementId)
        && primaryRoute.toSettlementId === Math.max(contract.originSettlementId, contract.destinationSettlementId),
      `contract ${contract.id} primary route does not connect its settlements`,
    );
    for (const routeId of contract.porterRouteIds) {
      invariant(routeIds.has(routeId), `contract ${contract.id} porter route is invalid`);
    }
    if (contract.carrierKind === "resident") {
      invariant(contract.porterRouteIds.length > 0, `resident contract ${contract.id} needs a route plan`);
      invariant(
        contract.porterSettlementIds.length === contract.porterRouteIds.length + 1,
        `resident contract ${contract.id} route plan shape is invalid`,
      );
      invariant(
        contract.porterSettlementIds[0] === contract.originSettlementId
          && contract.porterSettlementIds.at(-1) === contract.destinationSettlementId,
        `resident contract ${contract.id} route plan endpoints are invalid`,
      );
      invariant(
        new Set(contract.porterRouteIds).size === contract.porterRouteIds.length,
        `resident contract ${contract.id} route plan repeats a route`,
      );
      invariant(
        new Set(contract.porterSettlementIds).size === contract.porterSettlementIds.length,
        `resident contract ${contract.id} route plan repeats a settlement`,
      );
      for (let legIndex = 0; legIndex < contract.porterRouteIds.length; legIndex += 1) {
        const porterRouteId = contract.porterRouteIds[legIndex];
        const fromSettlementId = contract.porterSettlementIds[legIndex];
        const toSettlementId = contract.porterSettlementIds[legIndex + 1];
        const porterRoute = world.routes.find((route) => route.id === porterRouteId);
        invariant(
          porterRoute !== undefined
            && fromSettlementId !== undefined
            && toSettlementId !== undefined
            && porterRoute.fromSettlementId === Math.min(fromSettlementId, toSettlementId)
            && porterRoute.toSettlementId === Math.max(fromSettlementId, toSettlementId),
          `resident contract ${contract.id} porter leg ${legIndex} is disconnected`,
        );
      }
    } else {
      invariant(contract.porterRouteIds.length === 0, `non-resident contract ${contract.id} has a porter route plan`);
      invariant(contract.porterSettlementIds.length === 0, `non-resident contract ${contract.id} has porter settlements`);
    }
    if (contract.assignedResidentId !== null) invariant(residentIds.has(contract.assignedResidentId), `contract ${contract.id} resident is invalid`);
  }

  const contractIds = new Set(world.contracts.map((contract) => contract.id));
  for (const resident of world.residents) {
    if (resident.activeContractId === null) continue;
    invariant(contractIds.has(resident.activeContractId), `resident ${resident.id} active contract is invalid`);
    const contract = world.contracts.find((candidate) => candidate.id === resident.activeContractId);
    invariant(contract?.assignedResidentId === resident.id, `resident ${resident.id} contract assignment disagrees`);
    invariant(contract.status === "accepted" || contract.status === "in-transit", `resident ${resident.id} has terminal contract`);
  }

  invariant(world.meta.nextEntityId > Math.max(0, ...entityIds), "next entity ID is not ahead of allocated IDs");
  invariant(new Set(world.processedCommandIds).size === world.processedCommandIds.length, "processed command IDs are duplicated");
  for (let index = 1; index < world.events.length; index += 1) {
    invariant((world.events[index - 1]?.sequence ?? 0) < (world.events[index]?.sequence ?? 0), "events are not strictly ordered");
  }
  const lastEvent = world.events[world.events.length - 1];
  invariant(lastEvent === undefined || world.meta.nextEventSequence > lastEvent.sequence, "next event sequence is stale");

  const current = currentInventoryTotals(world);
  for (const resource of RESOURCE_KINDS) {
    invariant(world.ledger.initial[resource] >= 0, `ledger initial ${resource} is negative`);
    invariant(world.ledger.produced[resource] >= 0, `ledger produced ${resource} is negative`);
    invariant(world.ledger.consumed[resource] >= 0, `ledger consumed ${resource} is negative`);
    const expected = world.ledger.initial[resource] + world.ledger.produced[resource] - world.ledger.consumed[resource];
    invariant(current[resource] === expected, `${resource} conservation expected ${expected}, found ${current[resource]}`);
  }
}

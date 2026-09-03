export {
  MIN_ROUTE_REINFORCEMENT_COVERAGE,
  TIDE_CHOIR_CONDITION_BONUS,
  TIDE_CHOIR_RELIABILITY_BONUS,
  calculateRouteTraceCoverage,
  createWorld,
  findTraceReinforcedRoutes,
  runTicks,
  stepWorld,
} from "./engine";
export type { RouteTraceCoverage } from "./engine";
export { assertWorldInvariants } from "./invariants";
export { deserializeWorld, hashWorld, serializeWorld } from "./persistence";
export { keyedChance, keyedRandomInt, keyedRandomU32, mixUint32, seedFromText } from "./rng";
export type { RootSeed } from "./rng";
export {
  BIOME_IDS,
  applyWeatherToBiomeClimate,
  biomeInteractionAt,
  classifyBiome,
  deriveBaselineBiomeClimate,
  deriveBiomeProfile,
  deriveMagicalWaterInfluence,
} from "./biomes";
export type {
  BiomeClimate,
  BiomeGlobalTile,
  BiomeId,
  BiomeInteraction,
  BiomeProfile,
  BiomeProfileInput,
  BiomeTerrainInput,
  BiomeWeatherInput,
} from "./biomes";
export {
  BOOTSTRAP_FIBER_MATERIALS,
  BOOTSTRAP_RIGID_MATERIALS,
  BOOTSTRAP_SAFE_BIOMES,
  FIELD_MATERIALS_BY_BIOME,
  FIELD_MATERIAL_IDS,
  FIELD_MATERIAL_UNIT_LOAD_MILLI,
  FIELD_RESOURCE_LIVING_RESERVE_UNITS,
  advanceFieldResourceEcology,
  canonicalizeFieldResourceState,
  createFieldResourceEcologyState,
  deriveFieldResourceNode,
  evaluateHarborBootstrap,
  fieldResourceStockUnits,
  fieldResourceWeatherMultiplierPermille,
  generateFieldResourceCatalog,
  harvestFieldResource,
} from "./fieldResources";
export type {
  BiomeMaterialSet,
  FieldHarvestReason,
  FieldHarvestResult,
  FieldMaterialId,
  FieldResourceCatalog,
  FieldResourceDepletion,
  FieldResourceEcologyState,
  FieldResourceNode,
  FieldResourceRarity,
  HarborBootstrapEvaluation,
} from "./fieldResources";
export { createWorldView } from "./view";
export {
  MAX_RESIDENT_MEMORIES,
  NPC_GENERATION_VERSION,
  createResidentCondition,
  createResidentPlayerKnowledge,
  generateResidentDisplayName,
  generateResidentIdentity,
  generateResidentNeeds,
  generateResidentTraits,
  residentKnowsFact,
  residentRainProtection,
  residentRelationshipTrust,
  residentSkillAptitude,
  stableResidentId,
  stableResidentIdForGeneration,
} from "./npcIdentity";
export type { ResidentIdentityGenerationInput } from "./npcIdentity";
export { calculateNetworkMetrics, findAutonomousRoutePlan, routeCapacity, routeIsActive } from "./network";
export type { AutonomousRoutePlan, NetworkMetrics } from "./network";
export * from "./types";

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
export type {
  ResidentPerceptionFrame,
  ResidentPerceptionFrameEntry,
  RouteTraceCoverage,
} from "./engine";
export { assertWorldInvariants } from "./invariants";
export { deserializeWorld, hashWorld, serializeWorld } from "./persistence";
export {
  LIVING_CIRCADIAN_DRIVERS,
  LIVING_CIRCADIAN_OWNER_ID,
  LIVING_CIRCADIAN_PROFILE_IDS,
  LIVING_CIRCADIAN_PROFILES,
  LIVING_CIRCADIAN_STATES,
  LIVING_CIRCADIAN_VERSION,
  RESIDENT_CIRCADIAN_URGENT_BELONGING_NEED,
  RESIDENT_CIRCADIAN_URGENT_EXHAUSTION,
  RESIDENT_CIRCADIAN_URGENT_FOOD_NEED,
  RESIDENT_CIRCADIAN_URGENT_REST_NEED,
  RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
  RESIDENT_HOME_REST_DESTINATION_OWNER_ID,
  canonicalizeLivingCircadianPersistentState,
  canonicalizeLivingCircadianPolicy,
  canonicalizeResidentCircadianState,
  firstLivingCircadianActiveTick,
  livingCircadianPhaseOffsetTicks,
  livingCircadianProfile,
  projectLivingCircadianClockPreference,
  replaceResidentCircadian,
  residentCircadianUrgentPreference,
  residentHomeRestDestinationId,
} from "./livingCircadian";
export type {
  LivingCircadianDriver,
  LivingCircadianPersistentState,
  LivingCircadianPolicy,
  LivingCircadianPosture,
  LivingCircadianPreference,
  LivingCircadianProfile,
  LivingCircadianProfileId,
  LivingCircadianRhythm,
  LivingCircadianState,
  ReplaceResidentCircadianInput,
  ResidentCircadianBinding,
  ResidentCircadianUrgentPreference,
} from "./livingCircadian";
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
  WORLD_DAWN_START_TICK,
  WORLD_DAY_ILLUMINATION,
  WORLD_DAY_START_TICK,
  WORLD_DUSK_START_TICK,
  WORLD_NIGHT_ILLUMINATION,
  WORLD_NIGHT_START_TICK,
  WORLD_NEW_GAME_START_TICK,
  WORLD_TICKS_PER_DAY,
  WORLD_TIME_CONTRACT_VERSION,
  WORLD_TIME_EPOCH,
  projectWorldTime,
} from "./worldTime";
export type { WorldDayPhase, WorldTimeProjection } from "./worldTime";
export {
  MAX_OUTDOOR_LOCAL_LIGHT_RADIUS_TILES,
  MAX_OUTDOOR_LOCAL_LIGHT_SOURCES,
  OUTDOOR_ILLUMINATION_VERSION,
  OUTDOOR_LOCAL_LIGHT_KINDS,
  evaluateOutdoorIllumination,
  outdoorTerrainTransmission,
  outdoorWeatherTransmission,
} from "./outdoorIllumination";
export type {
  OutdoorIlluminationInput,
  OutdoorIlluminationSample,
  OutdoorIlluminationTerrain,
  OutdoorLocalLightKind,
  OutdoorLocalLightSource,
} from "./outdoorIllumination";
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

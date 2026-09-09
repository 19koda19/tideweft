import type { RendererCommand, TideweftView, WorldPoint } from "../render/types";
import { validatePerceivedEntityCommand } from "../render/worldTap";
import {
  createWorld,
  createWorldView,
  deserializeWorld,
  FIXED_POINT,
  residentKnowsFact,
  serializeWorld,
  STRAND_AUTOMATION_THRESHOLD,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  stepWorld,
  type ContractState,
  type ResidentPerceptionFrame,
  type ResidentState,
  type SimCommand,
  type TerrainState,
  type WeatherState,
  type WorldState,
  type WorldView,
} from "../sim/public";
import {
  findTilePath,
  MAX_TIDE_LEVEL,
} from "../sim/terrain";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
import {
  stableDogId,
  type DogIdentityGenerationInput,
  type GeneratedDogState,
} from "../sim/dogIdentity";
import {
  canonicalizeActorObservations,
  createActorObservation,
  stepActorPerception,
  type ActorObservation,
  type ActorPerceptionState,
} from "../sim/actorPerception";
import {
  generateCoreWildlifeIdentity,
  getCoreWildlifeProfile,
  type CoreWildlifeSpecies,
} from "../sim/coreWildlifeIdentity";
import {
  advanceFieldResourceEcology,
  canonicalizeFieldResourceState,
  createFieldResourceEcologyState,
  fieldResourceStockUnits,
  generateFieldResourceCatalog,
  harvestFieldResource,
  type FieldMaterialId,
  type FieldResourceCatalog,
  type FieldResourceEcologyState,
  type FieldResourceNode,
} from "../sim/fieldResources";
import {
  PERPETUAL_SESSION_SHAPE,
  type LivingActorTargetUIView,
  type TideweftUICommand,
  type TideweftUIView,
  type WildlifeEvidenceTargetUIView,
} from "../ui/types";
import {
  projectDogLivingActorInspection,
  projectWildlifeLivingActorInspection,
  withLivingActorInteractions,
} from "../ui/livingActorAbout";
import { projectLivingActorInteractionChoices } from "../ui/livingActorInteractionProjection";
import { TideweftSoundscape, type WaterAmbienceState } from "../audio/soundscape";
import {
  ConflictingSaveCopiesError,
  createSaveRepository,
  NewerSaveUnavailableError,
  SAVE_WORLD_JSON_MAX_CHARACTERS,
  StaleSaveWriteError,
  type SaveRecord,
  type SaveRepository,
} from "../platform/persistence";
import { acceptsRestartPhrase } from "./restartPolicy";
import { surfaceCurrentDirection } from "./currentDirection";
import { deriveWaterFlowProfile } from "./waterFlow";
import {
  smoothAutopilotPath,
  steerAutopilotToPoint,
} from "./autopilotPath";
import {
  BASE_CARGO_CAPACITY,
  FIELD_TOOL_LABELS,
  PACK_LOAD_MILLI_PER_UNIT,
  TILE_UNITS,
  activeTideHarpAtPlayer,
  cargoWeight,
  cargoWeightMilli,
  createPlayer,
  loadContractCargo,
  playerTileIndex,
  pulseScan,
  restoreSweptPlayer,
  settlementAtPlayer,
  stepPlayer,
  unlockFieldToolAtSettlement,
  unloadContractCargo,
  waterEffortPerStep,
  wayknotEffectsAt,
  type FieldToolKind,
  type PlayerControl,
  type PlayerMode,
  type PlayerState,
  type TravelPace,
} from "./player";
import {
  acknowledgeIncidentCue,
  canonicalizeTraversalFeedback,
  createTraversalFeedbackState,
  type TraversalFeedbackState,
} from "./traversalFeedback";
import {
  CRAFTING_CONDITION_MAX,
  CRAFTING_RECIPES,
  CRAFTING_STACK_DEFINITIONS,
  createCraftingInventory,
  craft,
  dismantle,
  inventoryLoadMilli,
  quoteWayknotRepairCost,
  repair,
  type CraftingInventory,
  type CraftingStackId,
} from "./crafting";
import type { TideHarp } from "./tideHarps";
import {
  DEFAULT_WAYKNOT_CAPACITY,
  TIDE_ANCHOR_PLACEMENT_DEPTH,
  WAYKNOT_DESCRIPTIONS,
  WAYKNOT_LABELS,
  contextualWayknotKind,
  modifyPathCost,
  normalizeWayknotState,
  toggleContextualWayknot,
  wayknotAtTile,
  type WayknotActionReason,
  type WayknotKind,
  type WayknotPlacementReason,
} from "./wayknots";
import {
  projectGameView,
  projectPerception,
  RESIDENT_CONVERSATION_RANGE_TILES,
} from "./projection";
import {
  VISIBILITY_DIRECT,
  evaluateVisualContact,
  type PerceptionCell,
} from "./perception";
import {
  announce,
  captureSessionBaseline,
  createSessionState,
  type GameSessionState,
} from "./sessionTypes";
import { updateTutorial } from "./tutorial";
import { appendSurveyedHarborLeg, assessHarborLeg, type TideChoirCycle } from "./tideChoir";
import { eventIsDirectlyObservableAtLocus, projectUIView } from "./uiProjection";
import {
  LOOSE_CARGO_TILE_UNITS,
  addLooseCargoProvision,
  addLooseCargoStack,
  consumeLooseCargoProvisionEntity,
  consumeLooseCargoStack,
  createLooseCargoCarrier,
  dropLooseCargo,
  LOOSE_CARGO_MAX_PICKUP_REACH,
  pickupLooseCargo,
  removeLooseCargoGear,
  removeLooseCargoPromise,
  setLooseCargoGearCondition,
  setLooseCargoPromiseMaterialState,
  setLooseCargoReservedLoad,
  upsertLooseCargoGear,
  upsertLooseCargoPromise,
  type CarriedCargoLot,
  type LooseCargoCarrierState,
  type LooseCargoPayload,
  type LooseCargoRegionAddress,
  type LooseCargoWorldState,
} from "./looseCargo";
import {
  looseCargoPositionAtRegionalPlayer,
  playerPositionAtRegionalLooseCargo,
  projectLooseCargoCarrierToPlayer,
  sampleLooseCargoRegionalNeighborhood,
} from "./looseCargoRuntime";
import {
  adoptPhysicalCargoStateV1,
  commitPhysicalCargoRegionalMutation,
  commitPhysicalCargoState,
  createPhysicalCargoStateFromPlayer,
  gameSaveEnvelopeIntegrity,
  locatePhysicalCargoEntity,
  physicalCargoWorlds,
  physicalCargoWorldAt,
  physicalCargoPromiseCustody,
  queryPhysicalCargoPartitions,
  quotePhysicalCargoSource,
  snapshotPhysicalCargoState,
  stepPhysicalCargoAcrossRegions,
  transitionPhysicalCargoRegion,
  validatePhysicalCargoState,
  type PhysicalCargoState,
  type SerializedPhysicalCargoState,
} from "./physicalCargoState";
import {
  projectCoreEcologyWildlife,
  selectedCoreEcologyActor,
  setCoreEcologyMaterializationForWindow,
} from "./coreEcologyRuntime";
import {
  projectCoreEcologyAggregateEvidence,
  selectWitnessedBrownRatRedistribution,
} from "./coreEcologyEvidenceRuntime";
import {
  collectCoreEcologyRootAggregateActivityObservationBatches,
  collectCoreEcologyVisualObservationBatches,
  propagateCoreEcologyAlarmObservationBatches,
  type CoreEcologyObservationBatch,
} from "./coreEcologyPerception";
import {
  deriveCoreEcologySettlementShadowsStimulusFrame,
  selectCoreEcologyAggregateExposedFoodSources,
  selectCoreEcologyAggregateVisualSources,
  type CoreEcologyAggregateExposedFoodSource,
  type CoreEcologyAggregateVisualSource,
} from "./coreEcologyAggregatePerception";
import { projectCoreEcologyAggregateHeardCues } from "./coreEcologyAggregateAudio";
import { resolveFallCargo } from "./fallCargo";
import {
  capturePlayerRegionalTravel,
  migratePlayerToRegionalTravel,
  rebaseRegionalWindowPath,
  recenterRegionalPlayer,
  restorePlayerRegionalTravel,
  serializePlayerRegionalTravel,
  type RegionalPlayerTravelState,
} from "./regionalPlayerTravel";
import {
  LEGACY_REGIONAL_TRAVEL_COLUMNS,
  LEGACY_REGIONAL_TRAVEL_ROWS,
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
} from "./regionalTravel";
import {
  createRegionalWorldView,
  rebindRegionalWorldViewWindow,
  regionalAddressAt,
  regionalStorageRegionsInView,
  regionalTileIndexInView,
  regionalWorldCenter,
} from "./regionalWorldView";
import {
  HUMAN_PERCEPTION_MAX_PLAYER_SAMPLES,
  LOCAL_PLAYER_SUBJECT_ID,
  PLAYER_SENSE_SAMPLE_VERSION,
  collectExistingHumanObservations,
  createPlayerSenseSample,
  type PlayerSenseSample,
} from "./humanPerception";
import { playerWorldPositionInRegionalWindow } from "./residentSpatial";
import {
  projectCompatibilityFieldResources,
  regionalFieldResourceAtViewTile,
  regionalFieldResourceById,
  type RegionalFieldResourceProjection,
} from "./regionalFieldResources";
import {
  createRegionCoord,
  regionKey,
  regionLocalToGlobalTile,
  type RegionCoord,
} from "../sim/regions";
import type { RootSeed } from "../sim/rng";
import {
  createTerrainRegionPrefetchJob,
  desiredRegionCoords,
  type TerrainRegionPrefetchJob,
} from "./regionStreaming";
import { regionalWayknotContextAt } from "./regionalWayknots";
import {
  advanceRegionalPromiseJourney,
  beginRegionalPromiseJourney,
  clearRegionalPromiseJourney,
  createRegionalPromiseJourney,
  migrateRegionalPromiseJourney,
  regionalPromiseDeliveryEvidence,
  restoreRegionalPromiseJourney,
  type RegionalPromiseJourneyState,
} from "./regionalPromiseJourney";
import {
  BIO0_FOOD_CONTACT_RANGE_UNITS,
  adoptBio0ActorCargoState,
  canonicalizeBio0EcologyState,
  createBio0Ecology,
  deserializeBio0Ecology,
  serializeBio0Ecology,
  stepBio0Ecology,
  type Bio0EcologyState,
} from "./bio0Ecology";
import {
  applyCoreEcologyCrossOwnerWildlifeMortality,
  canonicalizeCoreEcologyAggregatePatch,
  canonicalizeCoreEcologyPatch,
  coreEcologyAggregatePatchActor,
  createCoreEcologyAggregatePatch,
  deserializeCoreEcologyAggregatePatch,
  migrateLegacyCoreEcologyAggregatePatch,
  migrateLegacyCoreEcologyPatch,
  replaceCoreEcologyAggregatePatchActor,
  replaceCoreEcologyAggregatePatchCarcass,
  serializeCoreEcologyAggregatePatch,
  setCoreEcologyAggregatePatchMaterializedActors,
  stableCoreEcologyAggregatePopulationId,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPatchState,
  type CoreEcologyPopulationState,
} from "./coreEcology";
import {
  deriveCoreEcologyHabitatAssemblage,
  deriveCoreEcologyDomesticPenHabitatAssemblage,
  deriveCoreEcologyDomesticYardHabitatAssemblage,
  deriveCoreEcologyHarborEdgeHabitatAssemblage,
  deriveCoreEcologyMarshEdgeHabitatAssemblage,
  deriveCoreEcologyRainChorusHabitatAssemblage,
  deriveCoreEcologyRegionalPredatorHabitatAssemblage,
  deriveCoreEcologyRegionalUplandHabitatAssemblage,
  deriveCoreEcologyTidalTableHabitatAssemblage,
  deriveCoreEcologyTidalWebHabitatAssemblage,
  deriveCoreEcologyWaterfowlHabitatAssemblage,
  type CoreEcologyHabitatAssemblage,
  type CoreEcologyDomesticPenHabitatAssemblage,
  type CoreEcologyDomesticYardHabitatAssemblage,
  type CoreEcologyHarborEdgeHabitatAssemblage,
  type CoreEcologyMarshEdgeHabitatAssemblage,
  type CoreEcologyRainChorusHabitatAssemblage,
  type CoreEcologyRegionalPredatorHabitatAssemblage,
  type CoreEcologyRegionalUplandHabitatAssemblage,
  type CoreEcologyTidalTableHabitatAssemblage,
  type CoreEcologyTidalWebHabitatAssemblage,
  type CoreEcologyWaterfowlHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  coreEcologyGroupComponentForMember,
  createCoreEcologyGroup,
  createCoreEcologyGroupSet,
  reconcileCoreEcologyGroupMaterialized,
  type CoreEcologyGroupState,
  type CoreEcologyGroupTransitionEvent,
} from "./coreEcologyGroups";
import {
  adoptCoreEcologySettlementHomeFromV24,
  canonicalCoreEcologySettlementHomePatch,
  createCoreEcologySettlementHomePatch,
} from "./coreEcologySettlementHome";
import {
  adoptRegionalEcologyFromV24,
  advanceRegionalEcologyRoot,
  createPristineRegionalEcologyRoot,
  putRegionalEcologyResidentDeviation,
  type RegionalEcologyRootV1,
} from "./regionalEcology";
import {
  canonicalCoreEcologyRegionalResidentPatchForRoot,
  createCoreEcologyRegionalResidentPatchForRoot,
} from "./regionalEcologyResidents";
import { CORE_ECOLOGY_DOMESTIC_SPECIES } from "./coreEcologyRegionalHabitat";
import {
  canonicalRegionalEcologyLegacyCohortPatchForWorld,
  projectRegionalEcologyLegacyCohort,
} from "./regionalEcologyLegacyCohort";
import {
  canonicalRegionalEcologyStateForWorld,
  commitRegionalEcologyActiveProjection,
  createRegionalEcologyState,
  deserializeRegionalEcologyState,
  projectRegionalEcologyActiveState,
  regionalEcologyRegionalResidentsForActiveRegions,
  replaceRegionalEcologyActiveState,
  serializeRegionalEcologyState,
  type RegionalEcologyActiveProjectionV1,
  type RegionalEcologyActiveResidentInput,
  type RegionalEcologyProjectedResidentV1,
  type RegionalEcologyStateV1,
} from "./regionalEcologyState";
import { stepCoreEcologySettlementShadows } from "./coreEcologySmallWorld";
import {
  applySettlementKeeperStoreResponse,
  canonicalizeSettlementEcologyState,
  createSettlementEcologyState,
  createSettlementPlayerStoreReport,
  deserializeSettlementEcologyState,
  establishSettlementDomesticAnimalCustody,
  projectSettlementFoodStoreSource,
  proposeSettlementKeeperStoreResponse,
  proposeSettlementRatAttraction,
  recordSettlementKeeperKnowledge,
  recoverPendingSettlementDomesticFoodUse,
  recoverPendingSettlementFoodLoss,
  resolveSettlementDomesticFoodUse,
  resolveSettlementFoodLoss,
  serializeSettlementEcologyState,
  SETTLEMENT_DOMESTIC_FOOD_USE_VERSION,
  stageSettlementDomesticFoodUse,
  stageSettlementFoodLoss,
  type SettlementEcologyState,
} from "./settlementEcology";
import {
  adoptSettlementWorkingAnimalStateV1,
  canonicalizeSettlementWorkingAnimalState,
  createSettlementWorkingAnimalHandlerSearchReport,
  createSettlementWorkingAnimalState,
  deriveSettlementWorkingAnimalTaskSearchProbe,
  deserializeSettlementWorkingAnimalState,
  PRIOR_SETTLEMENT_WORKING_ANIMALS_OWNER_ID,
  PRIOR_SETTLEMENT_WORKING_ANIMALS_VERSION,
  recoverPendingSettlementWorkingAnimalActivity,
  recoverPendingSettlementWorkingAnimalTaskLifecycle,
  resolveSettlementWorkingAnimalActivity,
  resolveSettlementWorkingAnimalTaskLifecycle,
  serializeSettlementWorkingAnimalState,
  stageSettlementWorkingAnimalActivity,
  stageSettlementWorkingAnimalSearchFromHandlerReport,
  stageSettlementWorkingAnimalTaskLifecycle,
  settlementWorkingAnimalReturnArea,
  type SettlementWorkingAnimalActorDisposition,
  type SettlementWorkingAnimalActivityDecision,
  type SettlementWorkingAnimalActivityTransaction,
  type SettlementWorkingAnimalAssignment,
  type SettlementWorkingAnimalHandlerDisposition,
  type SettlementWorkingAnimalHandlerSearchReport,
  type SettlementWorkingAnimalState,
  type SettlementWorkingAnimalTaskLifecycleEvaluationInput,
} from "./settlementWorkingAnimals";
import {
  canonicalizeSettlementDomesticAnimalRecoveryState,
  createSettlementDomesticAnimalRecoveryState,
  deserializeSettlementDomesticAnimalRecoveryState,
  recoverPendingSettlementDomesticAnimalRecovery,
  resolveSettlementDomesticAnimalRecovery,
  serializeSettlementDomesticAnimalRecoveryState,
  stageSettlementDomesticAnimalRecovery,
  type SettlementDomesticAnimalRecoveryCase,
  type SettlementDomesticAnimalRecoveryOutcome,
  type SettlementDomesticAnimalRecoveryState,
} from "./settlementDomesticAnimalRecovery";
import {
  coreEcologyPatchHasTidalTableAuthority,
  stepCoreEcologyTidalTable,
  type CoreEcologyTidalTableProjection,
} from "./coreEcologyTidalTable";
import {
  coreEcologyPatchHasBoundedActivityAuthority,
  coreEcologyActivityTravelMedium,
  coreEcologySpeciesHasBoundedActivityProjection,
  projectCoreEcologyActivity,
  projectCoreEcologyDayPhase,
  stepCoreEcologyActivityMotion,
} from "./coreEcologyActivity";
import {
  projectCoreEcologyActivityAuthority,
  type CoreEcologyActivityAuthorityV1,
} from "./coreEcologyActivityAuthority";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  CORE_WILDLIFE_EVENT_VERSION,
  CORE_WILDLIFE_INTENTS,
  CORE_WILDLIFE_MAX_FOOD_OPPORTUNITIES,
  repositionCoreWildlifeActor,
  repositionCoreWildlifeActorWithMovementEvidence,
  replaceCoreWildlifeActorPhysiology,
  type CoreWildlifeActorState,
  type CoreWildlifeActionAccessibility,
  type CoreWildlifeCausalEvent,
  type CoreWildlifeFoodOpportunity,
  type CoreWildlifeIntentKind,
  type CoreWildlifeNeutralActivityPreference,
  type CoreWildlifeRegroupOpportunity,
  type CoreWildlifeResourceClaim,
} from "./coreWildlifeActor";
import {
  CORE_WILDLIFE_RESOURCE_CLAIM_ARBITRATION_VERSION,
  orderCoreWildlifeResourceClaimContenders,
  type CoreWildlifeResourceClaimContender,
} from "./coreWildlifeResourceClaimArbitration";
import {
  coreEcologySpeciesCanOwnActorAddress,
  coreEcologySpeciesCanFeedFromCarcass,
  coreEcologySpeciesCanGuardCarcass,
  coreEcologySpeciesPhysicalBodyResourceUnits,
  coreEcologySpeciesPredatorContact,
  coreEcologySpeciesHasRuntimeCapability,
  coreEcologySpeciesRuntimePolicy,
} from "./coreEcologySpeciesRuntimePolicy";
import {
  coreEcologyCanPursueLivingActor,
  coreEcologyCanResolveMortalityTarget,
} from "./coreEcologyTrophic";
import {
  resolveCoreWildlifePredatorContact,
  type CoreWildlifeMortalityEvent,
} from "./coreWildlifeMortality";
import {
  claimCoreWildlifeCarcass,
  consumeCoreWildlifeCarcass,
  releaseCoreWildlifeCarcass,
  type CoreWildlifeCarcass,
} from "./coreWildlifeCarcass";
import {
  applyDogBehaviorDecision,
  createDogActorState,
  repositionDogActor,
  replaceDogActorPerception,
  replaceDogActorPhysiology,
  type DogActorState,
} from "./dogActor";
import {
  canonicalizeDogActorRoster,
  createDogActorRoster,
  deserializeDogActorRoster,
  dogActorRosterActor,
  replaceDogActorInRoster,
  serializeDogActorRoster,
  type DogActorRosterState,
} from "./dogActorRoster";
import {
  evaluateDogBehavior,
  type DogActionAccessibility,
  type DogBehaviorDecision,
} from "./dogBehavior";
import {
  DOG_EXPOSURE_VERSION,
  stepDogExposure,
  type DogExposureSample,
} from "./dogExposure";
import { DOG_NEEDS_STEP_VERSION, stepDogNeeds } from "./dogNeeds";
import {
  createLivingActorAddress,
  headingFromRadians,
  headingToRadians,
  livingActorAddressForResident,
  livingActorAddressInRegionalWindow,
  type LivingActorAddress,
} from "./livingActor";
import { PROVISION_DEFINITIONS } from "./provisions";
import {
  REGION_HEIGHT_UNITS,
  REGION_WIDTH_UNITS,
  WORLD_POSITION_UNITS_PER_TILE,
  createSpatialFrame,
  createWorldPosition,
  translateWorldPosition,
  worldPositionDelta,
  worldPositionToSpatialFrame,
} from "./worldPosition";
import {
  projectDogPresentation,
  type DogWorkActivityContext,
} from "./dogPresentation";
import {
  isWildlifeWorldPositionDirectlyObserved,
  projectWildlifePresentation,
} from "./wildlifePresentation";
import { projectCoreEcologyWildlifeCarcasses } from "./wildlifeCarcassPresentation";
import {
  createLivingActorTraversabilitySurface,
  deriveLivingActorEscapeTargets,
  deriveLivingActorSearchProbe,
  resolveLivingActorLocomotion,
  type LivingActorTraversabilitySurface,
} from "./livingActorLocomotion";
import { ADRIFT_STAND_DEPTH } from "./adrift";
import {
  coreWildlifeMaximumStepUnits,
  coreWildlifeTraversabilityCell,
  type CoreWildlifeTravelMedium,
} from "./coreWildlifeLocomotionProfile";
import {
  LIVING_ACTOR_VISUAL_CONTACT_VERSION,
  collectLivingActorVisualContactObservations,
} from "./livingActorVisualContact";
import {
  PORTER_RESPONSE_VERSION,
  applyPorterResponseDecision,
  canonicalizePorterResponseState,
  createPorterResponseState,
  decidePorterResponse,
  type PorterResponseAccessibility,
  type PorterResponseInput,
  type PorterResponseState,
} from "./porterResponse";
import { resolveLivingActorSimulationPolicy } from "./livingActorSimulation";
import {
  LIVING_ACTOR_PLAYER_CHOICE_VERSION,
  canonicalizeLivingActorPlayerChoiceState,
  createLivingActorPlayerChoiceAction,
  createLivingActorPlayerChoiceState,
  reduceLivingActorPlayerChoice,
  type LivingActorPlayerChoiceEvent,
  type LivingActorPlayerChoiceSpec,
  type LivingActorPlayerChoiceState,
  type RerouteEffect,
} from "./livingActorPlayerChoice";
import {
  LIVING_ACTOR_ACTION_ENACTMENT_VERSION,
  enactLivingActorAction,
  type OfferedProvisionContact,
} from "./livingActorActionEnactment";

const FIXED_STEP_MS = 100;
const PLAYER_STEPS_PER_WORLD_TICK = 10;
const MAX_STEPS_PER_FRAME = 6;
const AUTOSAVE_INTERVAL_TICKS = 600;
const AUTOSAVE_SLOT = "autosave";
const SAVE_RETRY_BASE_DELAY_MS = 2_000;
const SAVE_RETRY_MAX_DELAY_MS = 30_000;
const HARD_POSTURE = "gale" as const;
const HARD_PRESSURE_MODE = "wild" as const;
const RENDER_TILE_SIZE = 24;
const GAME_SAVE_VERSION = 25;
const REGIONAL_PREDATOR_GAME_SAVE_VERSION = 24;
const REGIONAL_UPLAND_GAME_SAVE_VERSION = 23;
const MORTALITY_BODY_GAME_SAVE_VERSION = 22;
const DOMESTIC_GOAT_GAME_SAVE_VERSION = 21;
const WATCH_RETURNS_GAME_SAVE_VERSION = 20;
const PADDOCK_WATCH_GAME_SAVE_VERSION = 19;
const DOMESTIC_PEN_GAME_SAVE_VERSION = 18;
const DOMESTIC_YARD_GAME_SAVE_VERSION = 17;
const STOREHOUSE_GAME_SAVE_VERSION = 16;
const TIDAL_CONVERGENCE_GAME_SAVE_VERSION = 15;
const WATERFOWL_GAME_SAVE_VERSION = 14;
const TIDAL_TABLE_GAME_SAVE_VERSION = 13;
const RAIN_CHORUS_GAME_SAVE_VERSION = 12;
const MARSH_EDGE_GAME_SAVE_VERSION = 11;
const HARBOR_EDGE_GAME_SAVE_VERSION = 10;
const WAVE_A_GAME_SAVE_VERSION = 9;
const CORE_ECOLOGY_GAME_SAVE_VERSION = 8;
const LIVING_ACTOR_CHOICE_GAME_SAVE_VERSION = 7;
const BIO0_GAME_SAVE_VERSION = 6;
const PLAYER_PERCEPTION_GAME_SAVE_VERSION = 5;
const REGIONAL_GAME_SAVE_VERSION = 4;
const PHYSICAL_CARGO_GAME_SAVE_VERSION = 3;
const PLAYER_PERCEPTION_CARRY_VERSION = 1 as const;
/** Begin preparing the next storage neighborhood well before its invisible seam. */
const TERRAIN_PREFETCH_MARGIN_TILES = 24;
/** Roughly 5 ms on the reference desktop; work is spread across fixed ticks. */
const TERRAIN_PREFETCH_TILE_BUDGET = 1_024;
const TERRAIN_PREFETCH_MAX_JOBS = 9;
const FIELD_RESOURCE_GAME_SAVE_VERSION = 2;
const LEGACY_GAME_SAVE_VERSION = 1;
const FIRST_CRAFTED_GEAR_ID = DEFAULT_WAYKNOT_CAPACITY + 1;
const MAX_SAFE_CARGO_QUANTITY = Math.floor(
  Number.MAX_SAFE_INTEGER / (2 * PACK_LOAD_MILLI_PER_UNIT),
);
const LOOSE_CARGO_RECOVERY_REACH = LOOSE_CARGO_MAX_PICKUP_REACH;

const PLAYER_CARGO_RESOURCES: ReadonlySet<ContractState["resource"]> = new Set([
  "food",
  "freshWater",
  "medicine",
  "parts",
  "reed",
]);

const GATHER_STAMINA_COST: Readonly<Record<FieldMaterialId, number>> = {
  bladderkelp: 4_000,
  cordreed: 4_000,
  driftwood: 6_000,
  "glimmer-spore": 4_000,
  hookstone: 8_000,
  pitchmoss: 4_000,
  shellstone: 8_000,
  stormlichen: 6_000,
  sunfiber: 4_000,
};

interface GameSaveEnvelope {
  format: "tideweft-session";
  version: number;
  world: string;
  player: PlayerState;
  session: GameSessionState;
  fieldResources: FieldResourceEcologyState;
  traversalFeedback: TraversalFeedbackState;
  physicalCargo: SerializedPhysicalCargoState;
  regionalTravel: string;
  promiseJourney: RegionalPromiseJourneyState;
  perceptionCarry: PlayerPerceptionCarry;
  bio0Ecology: string;
  regionalEcology: string;
  /** Present only on v8-v24 envelopes during one-way migration. */
  coreEcology?: string;
  settlementEcology: string;
  dogActorRoster: string;
  settlementWorkingAnimals: string;
  settlementDomesticAnimalRecovery: string;
  porterResponse: PorterResponseState;
  livingActorPlayerChoice: LivingActorPlayerChoiceState;
  integrity: string;
}

interface PlayerPerceptionCarry {
  readonly version: typeof PLAYER_PERCEPTION_CARRY_VERSION;
  readonly playerStepsSinceWorldTick: number;
  readonly playerSenseSamples: readonly PlayerSenseSample[];
  readonly nextPlayerSenseSampleOrdinal: number;
}

export interface TideweftRuntime {
  readonly start: () => void;
  readonly stop: () => void;
  readonly destroy: () => void;
  readonly getRenderView: () => TideweftView;
  readonly getUIView: () => TideweftUIView;
  readonly dispatchRenderer: (command: RendererCommand) => void;
  readonly dispatchUI: (command: TideweftUICommand) => void;
  /** Called from the title's armed user gesture; shares the gameplay graph. */
  readonly playTitleCrescendo: (openingOrdinal: number) => Promise<void>;
  readonly save: () => Promise<void>;
  readonly setFocusHandler: (handler: ((point: WorldPoint, zoom?: number) => void) | undefined) => void;
}

type Bio0PorterAddress = LivingActorAddress & { readonly species: "human" };

interface RuntimeBio0Porter {
  readonly resident: ResidentState;
  readonly address: Bio0PorterAddress;
}

const BIO0_HABITAT_KEY = "bio0/compatibility-estuary";
const BIO0_POPULATION_KEY = "bio0/independent-dogs";
const BIO0_PROVISION_QUANTITY = 4;
const BIO0_COARSE_ACTION_ACCESSIBILITY: DogActionAccessibility = Object.freeze({
  retreat: false,
  "seek-shelter": false,
  "avoid-human": false,
  eat: false,
  "approach-food": false,
  rest: false,
  observe: true,
});

const CORE_ECOLOGY_PATCH_KEY = "wave-a/alarm-crossing";
const LEGACY_CORE_ECOLOGY_POPULATION_TOPOLOGY = Object.freeze([
  Object.freeze({
    species: "black-bear" as const,
    populationKey: "wave-a/black-bear",
    populationOrdinals: Object.freeze([0]),
  }),
  Object.freeze({
    species: "deer" as const,
    populationKey: "wave-a/deer-herd",
    populationOrdinals: Object.freeze([0, 1]),
  }),
  Object.freeze({
    species: "gull" as const,
    populationKey: "wave-a/gull-flock",
    populationOrdinals: Object.freeze([0, 1, 2]),
  }),
] as const);
const CORE_ECOLOGY_FORAGE_PROVISION = "dried-fish" as const;
const RUNTIME_CORE_ECOLOGY_HABITAT_CACHE_LIMIT = 24;
const runtimeCoreEcologyHabitatCache =
  new Map<string, CoreEcologyRegionalPredatorHabitatAssemblage>();
const runtimeRegionalUplandCoreEcologyHabitatCache =
  new Map<string, CoreEcologyRegionalUplandHabitatAssemblage>();
const runtimeDomesticPenCoreEcologyHabitatCache =
  new Map<string, CoreEcologyDomesticPenHabitatAssemblage>();
const runtimeDomesticYardCoreEcologyHabitatCache =
  new Map<string, CoreEcologyDomesticYardHabitatAssemblage>();
const runtimeTidalWebCoreEcologyHabitatCache =
  new Map<string, CoreEcologyTidalWebHabitatAssemblage>();
const runtimeWaterfowlCoreEcologyHabitatCache =
  new Map<string, CoreEcologyWaterfowlHabitatAssemblage>();
const runtimeTidalTableCoreEcologyHabitatCache =
  new Map<string, CoreEcologyTidalTableHabitatAssemblage>();
const runtimeRainChorusCoreEcologyHabitatCache =
  new Map<string, CoreEcologyRainChorusHabitatAssemblage>();
const runtimeMarshEdgeCoreEcologyHabitatCache =
  new Map<string, CoreEcologyMarshEdgeHabitatAssemblage>();
const runtimeHarborEdgeCoreEcologyHabitatCache =
  new Map<string, CoreEcologyHarborEdgeHabitatAssemblage>();
const runtimeWaveACoreEcologyHabitatCache = new Map<string, CoreEcologyHabitatAssemblage>();
const runtimeCoreTraversabilityCache = new WeakMap<
  WorldView,
  Map<string, Readonly<{
    sampledAtTick: number;
    surface: LivingActorTraversabilitySurface;
  }>>
>();
const CORE_ECOLOGY_CONTACT_REACH_LOOSE_UNITS = Math.trunc(LOOSE_CARGO_TILE_UNITS * 3 / 4);
// A storehouse is a structure rather than a point parcel. Domestic custody
// exposes a small, bounded yard/doorway footprint while the conserved food lot
// remains owned by the store transaction kernel.
const CORE_ECOLOGY_DOMESTIC_STORE_ACCESS_REACH_UNITS =
  3 * WORLD_POSITION_UNITS_PER_TILE;
const CORE_ECOLOGY_MOVING_SOURCE_SALIENCE = 780_000;
/** Focused keeper attention toward a known worksite; ordinary detail sight remains unchanged. */
const SETTLEMENT_KEEPER_WORKSITE_DIRECT_SIGHT_RANGE_TILES = 32;

function bigintAbs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

type RuntimeCoreWildlifeTarget = LivingActorTargetUIView & {
  readonly species: CoreWildlifeSpecies;
};

interface RuntimePorterVisualFrame {
  readonly actorId: string;
  readonly observations: readonly ActorObservation[];
}

function runtimeBio0Porter(economy: WorldView, actorId?: string): RuntimeBio0Porter {
  const startingSettlementId = economy.contracts.find(({ status }) => status === "offered")
    ?.originSettlementId ?? economy.settlements[0]?.id;
  const seedResidents = actorId === undefined && startingSettlementId !== undefined
    ? economy.residents.filter((resident) => (
        resident.location.kind === "settlement"
        && resident.location.settlementId === startingSettlementId
      ))
    : [];
  const residents = actorId === undefined
    ? [...(seedResidents.length > 0 ? seedResidents : economy.residents)].sort((left, right) => (
        left.identity.stableId < right.identity.stableId
          ? -1
          : left.identity.stableId > right.identity.stableId
            ? 1
            : left.id - right.id
      ))
    : economy.residents.filter(({ identity }) => identity.stableId === actorId);
  for (const resident of residents) {
    const address = livingActorAddressForResident(economy, resident);
    if (address?.species === "human") {
      return { resident, address: address as Bio0PorterAddress };
    }
  }
  throw new Error(actorId === undefined
    ? "BIO0 requires one existing compatibility resident"
    : "BIO0 porter no longer resolves through the compatibility resident owner");
}

function runtimeBio0DogGeneration(
  world: WorldState,
  resident: ResidentState,
): DogIdentityGenerationInput {
  return {
    seed: world.meta.rootSeed,
    originRegion: createRegionCoord(
      resident.identity.originRegion.x,
      resident.identity.originRegion.y,
    ),
    originNamespace: "regional",
    habitatClass: "coastal-lowland",
    habitatKey: BIO0_HABITAT_KEY,
    populationKey: BIO0_POPULATION_KEY,
    populationOrdinal: resident.identity.originActorOrdinal,
  };
}

function runtimeBio0FoodIds(
  world: WorldState,
  porterActorId: string,
): Readonly<{
  providerContainerId: string;
  receiverContainerId: string;
  sourceLotId: string;
}> {
  const identity = hashCanonical([
    "tideweft-bio0-runtime/1",
    world.meta.rootSeed,
    porterActorId,
  ]);
  return {
    providerContainerId: `bio0:porter-pack:${identity}`,
    receiverContainerId: `bio0:dog-contact-pack:${identity}`,
    sourceLotId: `bio0:dried-fish:${identity}`,
  };
}

function createRuntimeBio0Ecology(
  world: WorldState,
  economy: WorldView = createWorldView(world),
): Bio0EcologyState {
  const porter = runtimeBio0Porter(economy);
  const foodIds = runtimeBio0FoodIds(world, porter.address.actorId);
  const unitLoad = PROVISION_DEFINITIONS["dried-fish"].loadMilli;
  const porterFacing = headingToRadians(porter.address.heading);
  const dogOffsetX = Math.round(Math.cos(porterFacing) * WORLD_POSITION_UNITS_PER_TILE);
  const dogOffsetY = Math.round(Math.sin(porterFacing) * WORLD_POSITION_UNITS_PER_TILE);
  return createBio0Ecology({
    dogGeneration: runtimeBio0DogGeneration(world, porter.resident),
    // Seed the first causal web where the porter can actually perceive the
    // animal. This is a physical placement, not an injected cognition fact.
    dogPosition: translateWorldPosition(porter.address.position, dogOffsetX, dogOffsetY),
    porterAddress: porter.address,
    food: {
      providerContainerId: foodIds.providerContainerId,
      receiverContainerId: foodIds.receiverContainerId,
      lotId: foodIds.sourceLotId,
      provision: "dried-fish",
      quantity: BIO0_PROVISION_QUANTITY,
      providerCapacityMilliLoad: unitLoad * BIO0_PROVISION_QUANTITY,
      receiverCapacityMilliLoad: unitLoad,
      providerClosure: "open",
      materialState: { condition: FIXED_POINT, contamination: 0, decay: 0 },
    },
    tick: world.meta.completedTick,
  });
}

function canonicalRuntimeBio0Ecology(
  value: unknown,
  world: WorldState,
  economy: WorldView = createWorldView(world),
): Bio0EcologyState | null {
  const state = canonicalizeBio0EcologyState(value);
  if (state === null || state.tick !== world.meta.completedTick) return null;
  let porter: RuntimeBio0Porter;
  try {
    porter = runtimeBio0Porter(economy, state.porterAddress.actorId);
  } catch {
    return null;
  }
  const foodIds = runtimeBio0FoodIds(world, porter.address.actorId);
  if (
    stableStringify(porter.address) !== stableStringify(state.porterAddress)
    || state.dog.identity.stableId !== stableDogId(runtimeBio0DogGeneration(world, porter.resident))
    || state.foodSource.providerContainerId !== foodIds.providerContainerId
    || state.foodSource.receiverContainerId !== foodIds.receiverContainerId
    || state.foodSource.sourceLotId !== foodIds.sourceLotId
  ) return null;
  return state;
}

function createRuntimeCoreEcology(
  world: WorldState,
  bio0: Bio0EcologyState,
  economy: WorldView = createWorldView(world),
): CoreEcologyAggregatePatchState {
  const habitat = deriveRuntimeCoreEcologyHabitat(world, bio0, economy);
  const groups = createRuntimeCoreEcologyGroups(world, habitat);
  let patch = createCoreEcologyAggregatePatch({
    seed: world.meta.rootSeed,
    patchKey: CORE_ECOLOGY_PATCH_KEY,
    originRegion: habitat.originRegion,
    tick: world.meta.completedTick,
    derivation: { kind: "habitat-v11", habitat },
    groups,
    populations: habitat.populations
      .filter(({ populationUnits, representation }) => (
        populationUnits > 0
        && representation === "individual-representatives"
      ))
      .filter(({ species }) => coreEcologySpeciesCanOwnActorAddress(species))
      .map((population) => ({
        species: population.species,
        populationKey: population.populationKey,
        populationSize: population.populationUnits,
        members: population.allocations.map((allocation) => ({
          populationOrdinal: allocation.allocationOrdinal,
          representedUnits: allocation.representedUnits,
          position: allocation.position,
          materialization: "coarse" as const,
        })),
      })),
  });
  const initialMaterialization = setCoreEcologyMaterializationForWindow(
    patch,
    {
      origin: (() => {
        const regionOrigin = regionLocalToGlobalTile(habitat.originRegion, 0, 0);
        return {
          x: regionOrigin.x - Math.trunc((REGIONAL_TRAVEL_COLUMNS - WORLD_WIDTH) / 2),
          y: regionOrigin.y - Math.trunc((REGIONAL_TRAVEL_ROWS - WORLD_HEIGHT) / 2),
        };
      })(),
      terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS },
    },
    world.meta.completedTick,
  );
  if (initialMaterialization === null) {
    throw new Error("Initial tidal-web materialization failed validation");
  }
  patch = initialMaterialization;
  const bearMember = patch.populations
    .find(({ species }) => species === "black-bear")
    ?.members[0];
  if (bearMember !== undefined) {
    const hungryBear = replaceCoreWildlifeActorPhysiology(bearMember.actor, {
      atTick: world.meta.completedTick,
      needs: { ...bearMember.actor.needs, hunger: Math.max(680_000, bearMember.actor.needs.hunger) },
      condition: bearMember.actor.condition,
    });
    patch = replaceCoreEcologyAggregatePatchActor(patch, hungryBear);
  }
  const tidal = stepCoreEcologyTidalTable(patch, {
    atTick: world.meta.completedTick,
  });
  if (tidal === null) throw new Error("Initial tidal ecology projection failed validation");
  const initialized = initializeRuntimeTidalActivityActor(
    tidal.patch,
    tidal.projection,
    world.meta.completedTick,
  );
  if (initialized === null) throw new Error("Initial tidal actor placement failed validation");
  const waterfowlInitialized = initializeRuntimeWaterfowlActivityActor(
    initialized,
    world.meta.completedTick,
  );
  if (waterfowlInitialized === null) {
    throw new Error("Initial waterfowl placement failed validation");
  }
  const tidalWebInitialized = initializeRuntimeTidalWebActivityActor(
    waterfowlInitialized,
    world.meta.completedTick,
  );
  if (tidalWebInitialized === null) {
    throw new Error("Initial tidal-web activity placement failed validation");
  }
  return tidalWebInitialized;
}

/**
 * Alpha-32 separates settlement-owned animals from the signed regional
 * wildlife ledger. This patch remains the authoritative home for livestock,
 * the settlement-edge rat population, and their physical custody records.
 */
function createRuntimeSettlementHomeCoreEcology(
  world: WorldState,
  bio0: Bio0EcologyState,
  economy: WorldView = createWorldView(world),
): CoreEcologyAggregatePatchState {
  return createCoreEcologySettlementHomePatch({
    seed: world.meta.rootSeed,
    habitat: deriveRuntimeCoreEcologyHabitat(world, bio0, economy),
    tick: world.meta.completedTick,
  });
}

function canonicalRuntimeSettlementHomeCoreEcology(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
  economy: WorldView = createWorldView(world),
): CoreEcologyAggregatePatchState | null {
  return canonicalCoreEcologySettlementHomePatch(value, {
    seed: world.meta.rootSeed,
    habitat: deriveRuntimeCoreEcologyHabitat(world, bio0, economy),
    completedTick: world.meta.completedTick,
  });
}

function createRuntimeRegionalEcologyState(
  world: WorldState,
  bio0: Bio0EcologyState,
  settlementHome: CoreEcologyAggregatePatchState,
  regionalView: WorldView,
  economy: WorldView = createWorldView(world),
): RegionalEcologyStateV1 {
  const root = createPristineRegionalEcologyRoot({
    rootSeed: world.meta.rootSeed,
    completedTick: world.meta.completedTick,
  });
  const activeRegions = regionalStorageRegionsInView(regionalView);
  const residents = deriveRuntimeRegionalResidentInputs(
    root,
    world.meta.rootSeed,
    activeRegions,
  );
  const state = createRegionalEcologyState({
    root,
    settlementHome: {
      sourceKey: settlementHome.patchKey,
      patch: settlementHome,
    },
    activeRegions,
    activeResidents: residents,
  });
  const canonical = canonicalRuntimeRegionalEcologyState(
    state,
    world,
    bio0,
    economy,
  );
  if (canonical === null) {
    throw new Error("Initial regional ecology state failed its world binding");
  }
  return canonical;
}

function deriveRuntimeRegionalResidentInputs(
  root: RegionalEcologyRootV1,
  rootSeed: RootSeed,
  regions: readonly RegionCoord[],
): readonly RegionalEcologyActiveResidentInput[] {
  return Object.freeze(regions.flatMap((region) => {
    const patch = createCoreEcologyRegionalResidentPatchForRoot({
      seed: rootSeed,
      root,
      region,
    });
    return patch === null ? [] : [{
      kind: "regional-habitat" as const,
      sourceKey: patch.patchKey,
      patch,
    }];
  }));
}

/**
 * Reprojects the transient schedule destinations owned by one active regional
 * source. Settlement-home actors still authenticate against their embedded
 * frozen habitat; sparse regional and migration owners must present a current
 * root-bound receipt for every materialized activity actor.
 */
function runtimeCoreEcologyActivityAuthorities(
  rootSeed: RootSeed,
  root: RegionalEcologyRootV1,
  source: Pick<
    RegionalEcologyProjectedResidentV1,
    "kind" | "patch" | "sourceKey"
  >,
): ReadonlyMap<string, CoreEcologyActivityAuthorityV1> | null {
  const activityActors = source.patch.populations
    .flatMap(({ members }) => members)
    .filter(({ actor, materialization }) => (
      materialization === "materialized"
      && coreEcologySpeciesHasBoundedActivityProjection(actor.identity.species)
    ))
    .map(({ actor }) => actor)
    .sort((left, right) => compareText(
      left.identity.stableId,
      right.identity.stableId,
    ));
  if (source.kind === "settlement-home") {
    return coreEcologyPatchHasBoundedActivityAuthority(source.patch)
      ? new Map()
      : null;
  }
  if (coreEcologyPatchHasBoundedActivityAuthority(source.patch)) return null;
  const authorities = new Map<string, CoreEcologyActivityAuthorityV1>();
  for (const actor of activityActors) {
    const authority = projectCoreEcologyActivityAuthority({
      rootSeed,
      root,
      sourceKind: source.kind,
      patch: source.patch,
      actorId: actor.identity.stableId,
    });
    if (
      authority === null
      || authority.sourceKey !== source.sourceKey
      || authority.species !== actor.identity.species
      || authorities.has(authority.actorId)
    ) return null;
    authorities.set(authority.actorId, authority);
  }
  return authorities;
}

function canonicalRuntimeRegionalEcologyState(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
  economy: WorldView = createWorldView(world),
): RegionalEcologyStateV1 | null {
  return canonicalRegionalEcologyStateForWorld(value, {
    rootSeed: world.meta.rootSeed,
    completedTick: world.meta.completedTick,
    settlementHomeHabitat: deriveRuntimeCoreEcologyHabitat(world, bio0, economy),
  });
}

/**
 * Exchanges only the bounded hot neighborhood. Before an owner leaves memory,
 * any changed regional patch is written into the sparse root ledger; pristine
 * seeded baselines therefore cost no durable bytes merely because the player
 * crossed them.
 */
function rebaseRuntimeRegionalEcologyState(
  value: RegionalEcologyStateV1,
  world: WorldState,
  bio0: Bio0EcologyState,
  regionalView: WorldView,
  economy: WorldView = createWorldView(world),
): RegionalEcologyStateV1 {
  const prior = canonicalRuntimeRegionalEcologyState(value, world, bio0, economy);
  if (prior === null) {
    throw new Error("Regional ecology could not authenticate before a window exchange");
  }
  const activeRegions = regionalStorageRegionsInView(regionalView);
  const desiredRegionKeys = new Set(activeRegions.map(regionKey));
  let root = prior.root;
  for (const resident of prior.activeResidents) {
    if (
      resident.kind !== "regional-habitat"
      || desiredRegionKeys.has(regionKey(resident.region))
    ) continue;
    root = putRegionalEcologyResidentDeviation(root, {
      rootSeed: world.meta.rootSeed,
      patch: resident.patch,
    });
  }

  const requiredRegionalResidents = regionalEcologyRegionalResidentsForActiveRegions(
    root,
    world.meta.rootSeed,
    activeRegions,
  );
  if (requiredRegionalResidents === null) {
    throw new Error("Regional ecology entrants could not be derived from physical residence");
  }
  const retainedBySource = new Map(prior.activeResidents
    .filter(({ kind }) => kind === "regional-habitat")
    .map((resident) => [resident.sourceKey, resident] as const));
  const activeResidents: RegionalEcologyActiveResidentInput[] = requiredRegionalResidents.map(
    (entrant) => {
      const retained = retainedBySource.get(entrant.sourceKey);
      return {
        kind: "regional-habitat" as const,
        sourceKey: entrant.sourceKey,
        // Preserve the already-authenticated live snapshot whenever this owner
        // remains required. Root derivation decides eligibility; it never
        // transfers identities merely because residence crossed a seam.
        patch: retained?.patch ?? entrant.patch,
      };
    },
  );
  for (const legacy of prior.activeResidents.filter(({ kind }) => kind === "legacy-cohort")) {
    activeResidents.push({
      kind: "legacy-cohort",
      sourceKey: legacy.sourceKey,
      patch: legacy.patch,
    });
  }
  const next = replaceRegionalEcologyActiveState(prior, {
    expectedIntegrity: prior.integrity,
    rootSeed: world.meta.rootSeed,
    root,
    settlementHome: {
      sourceKey: prior.settlementHome.sourceKey,
      patch: prior.settlementHome.patch,
    },
    activeRegions,
    activeResidents,
  });
  const canonical = canonicalRuntimeRegionalEcologyState(next, world, bio0, economy);
  if (canonical === null) {
    throw new Error("Regional ecology window exchange failed its world binding");
  }
  return canonical;
}

function runtimeRegionalEcologyActor(
  state: RegionalEcologyStateV1,
  world: WorldView,
  window: RegionalPlayerTravelState["window"],
  target: RuntimeCoreWildlifeTarget,
): CoreWildlifeActorState | null {
  const projection = projectRegionalEcologyActiveState(state, {
    origin: window.origin,
    terrain: { width: world.terrain.width, height: world.terrain.height },
  });
  if (projection === null) return null;
  const matches = projection.residents.flatMap(({ patch }) => {
    const actor = selectedCoreEcologyActor(patch, target);
    return actor === null ? [] : [actor];
  });
  if (matches.length > 1) {
    throw new Error("Selected wildlife identity has multiple regional owners");
  }
  return matches[0] ?? null;
}

/** Frozen Alpha-30 v10 constructor used only to authenticate and extend v23 saves. */
function createRuntimeRegionalUplandCoreEcology(
  world: WorldState,
  bio0: Bio0EcologyState,
  economy: WorldView = createWorldView(world),
): CoreEcologyAggregatePatchState {
  const habitat = deriveRuntimeRegionalUplandCoreEcologyHabitat(world, bio0, economy);
  const groups = createRuntimeCoreEcologyGroups(world, habitat);
  let patch = createCoreEcologyAggregatePatch({
    seed: world.meta.rootSeed,
    patchKey: CORE_ECOLOGY_PATCH_KEY,
    originRegion: habitat.originRegion,
    tick: world.meta.completedTick,
    derivation: { kind: "habitat-v10", habitat },
    groups,
    populations: habitat.populations
      .filter(({ populationUnits, representation }) => (
        populationUnits > 0
        && representation === "individual-representatives"
      ))
      .filter(({ species }) => coreEcologySpeciesCanOwnActorAddress(species))
      .map((population) => ({
        species: population.species,
        populationKey: population.populationKey,
        populationSize: population.populationUnits,
        members: population.allocations.map((allocation) => ({
          populationOrdinal: allocation.allocationOrdinal,
          representedUnits: allocation.representedUnits,
          position: allocation.position,
          materialization: "coarse" as const,
        })),
      })),
  });
  const initialMaterialization = setCoreEcologyMaterializationForWindow(
    patch,
    {
      origin: (() => {
        const regionOrigin = regionLocalToGlobalTile(habitat.originRegion, 0, 0);
        return {
          x: regionOrigin.x - Math.trunc((REGIONAL_TRAVEL_COLUMNS - WORLD_WIDTH) / 2),
          y: regionOrigin.y - Math.trunc((REGIONAL_TRAVEL_ROWS - WORLD_HEIGHT) / 2),
        };
      })(),
      terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS },
    },
    world.meta.completedTick,
  );
  if (initialMaterialization === null) {
    throw new Error("Initial tidal-web materialization failed validation");
  }
  patch = initialMaterialization;
  const bearMember = patch.populations
    .find(({ species }) => species === "black-bear")
    ?.members[0];
  if (bearMember !== undefined) {
    const hungryBear = replaceCoreWildlifeActorPhysiology(bearMember.actor, {
      atTick: world.meta.completedTick,
      needs: { ...bearMember.actor.needs, hunger: Math.max(680_000, bearMember.actor.needs.hunger) },
      condition: bearMember.actor.condition,
    });
    patch = replaceCoreEcologyAggregatePatchActor(patch, hungryBear);
  }
  const tidal = stepCoreEcologyTidalTable(patch, {
    atTick: world.meta.completedTick,
  });
  if (tidal === null) throw new Error("Initial tidal ecology projection failed validation");
  const initialized = initializeRuntimeTidalActivityActor(
    tidal.patch,
    tidal.projection,
    world.meta.completedTick,
  );
  if (initialized === null) throw new Error("Initial tidal actor placement failed validation");
  const waterfowlInitialized = initializeRuntimeWaterfowlActivityActor(
    initialized,
    world.meta.completedTick,
  );
  if (waterfowlInitialized === null) {
    throw new Error("Initial waterfowl placement failed validation");
  }
  const tidalWebInitialized = initializeRuntimeTidalWebActivityActor(
    waterfowlInitialized,
    world.meta.completedTick,
  );
  if (tidalWebInitialized === null) {
    throw new Error("Initial tidal-web activity placement failed validation");
  }
  return tidalWebInitialized;
}

/** Frozen Alpha-29 constructor used only to authenticate and extend v22 saves. */
function createRuntimeDomesticPenCoreEcology(
  world: WorldState,
  bio0: Bio0EcologyState,
  economy: WorldView = createWorldView(world),
): CoreEcologyAggregatePatchState {
  const habitat = deriveRuntimeDomesticPenCoreEcologyHabitat(world, bio0, economy);
  const groups = createRuntimeCoreEcologyGroups(world, habitat);
  let patch = createCoreEcologyAggregatePatch({
    seed: world.meta.rootSeed,
    patchKey: CORE_ECOLOGY_PATCH_KEY,
    originRegion: habitat.originRegion,
    tick: world.meta.completedTick,
    derivation: { kind: "habitat-v9", habitat },
    groups,
    populations: habitat.populations
      .filter(({ populationUnits, representation }) => (
        populationUnits > 0 && representation === "individual-representatives"
      ))
      .filter(({ species }) => coreEcologySpeciesCanOwnActorAddress(species))
      .map((population) => ({
        species: population.species,
        populationKey: population.populationKey,
        populationSize: population.populationUnits,
        members: population.allocations.map((allocation) => ({
          populationOrdinal: allocation.allocationOrdinal,
          representedUnits: allocation.representedUnits,
          position: allocation.position,
          materialization: "coarse" as const,
        })),
      })),
  });
  const initialMaterialization = setCoreEcologyMaterializationForWindow(
    patch,
    {
      origin: (() => {
        const regionOrigin = regionLocalToGlobalTile(habitat.originRegion, 0, 0);
        return {
          x: regionOrigin.x - Math.trunc((REGIONAL_TRAVEL_COLUMNS - WORLD_WIDTH) / 2),
          y: regionOrigin.y - Math.trunc((REGIONAL_TRAVEL_ROWS - WORLD_HEIGHT) / 2),
        };
      })(),
      terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS },
    },
    world.meta.completedTick,
  );
  if (initialMaterialization === null) {
    throw new Error("Initial domestic-pen materialization failed validation");
  }
  patch = initialMaterialization;
  const bearMember = patch.populations.find(({ species }) => species === "black-bear")?.members[0];
  if (bearMember !== undefined) {
    patch = replaceCoreEcologyAggregatePatchActor(patch, replaceCoreWildlifeActorPhysiology(
      bearMember.actor,
      {
        atTick: world.meta.completedTick,
        needs: {
          ...bearMember.actor.needs,
          hunger: Math.max(680_000, bearMember.actor.needs.hunger),
        },
        condition: bearMember.actor.condition,
      },
    ));
  }
  const tidal = stepCoreEcologyTidalTable(patch, { atTick: world.meta.completedTick });
  if (tidal === null) throw new Error("Domestic-pen tidal projection failed validation");
  const initialized = initializeRuntimeTidalActivityActor(
    tidal.patch,
    tidal.projection,
    world.meta.completedTick,
  );
  if (initialized === null) throw new Error("Domestic-pen tidal actor placement failed validation");
  const waterfowl = initializeRuntimeWaterfowlActivityActor(initialized, world.meta.completedTick);
  if (waterfowl === null) throw new Error("Domestic-pen waterfowl placement failed validation");
  const tidalWeb = initializeRuntimeTidalWebActivityActor(waterfowl, world.meta.completedTick);
  if (tidalWeb === null) throw new Error("Domestic-pen tidal-web placement failed validation");
  return tidalWeb;
}

function initializeRuntimeWaterfowlActivityActor(
  patch: CoreEcologyAggregatePatchState,
  atTick: number,
): CoreEcologyAggregatePatchState | null {
  const member = patch.populations
    .find(({ species }) => species === "american-black-duck")
    ?.members[0];
  if (member === undefined) return patch;
  if (member.materialization !== "materialized") return patch;
  const activity = projectCoreEcologyActivity(patch, {
    actorId: member.actor.identity.stableId,
    atTick,
  });
  if (activity === null) return null;
  if (activity.motion.kind !== "target-area") return patch;
  try {
    return replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(
      member.actor,
      {
        atTick,
        position: activity.motion.targetArea.center,
        heading: member.actor.address.heading,
      },
    ));
  } catch {
    return null;
  }
}

function initializeRuntimeTidalWebActivityActor(
  patch: CoreEcologyAggregatePatchState,
  atTick: number,
): CoreEcologyAggregatePatchState | null {
  const member = patch.populations
    .find(({ species }) => species === "north-american-river-otter")
    ?.members[0];
  if (member === undefined || member.materialization !== "materialized") return patch;
  const activity = projectCoreEcologyActivity(patch, {
    actorId: member.actor.identity.stableId,
    atTick,
  });
  if (activity === null) return null;
  if (activity.motion.kind !== "target-area") return patch;
  try {
    return replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(
      member.actor,
      {
        atTick,
        position: activity.motion.targetArea.center,
        heading: member.actor.address.heading,
      },
    ));
  } catch {
    return null;
  }
}

/** Frozen Alpha-20 constructor used only to authenticate and extend v14 saves. */
function createRuntimeWaterfowlCoreEcology(
  world: WorldState,
  bio0: Bio0EcologyState,
  economy: WorldView = createWorldView(world),
): CoreEcologyAggregatePatchState {
  const habitat = deriveRuntimeWaterfowlCoreEcologyHabitat(world, bio0, economy);
  const groups = createRuntimeCoreEcologyGroups(world, habitat);
  let patch = createCoreEcologyAggregatePatch({
    seed: world.meta.rootSeed,
    patchKey: CORE_ECOLOGY_PATCH_KEY,
    originRegion: habitat.originRegion,
    tick: world.meta.completedTick,
    derivation: { kind: "habitat-v6", habitat },
    groups,
    populations: habitat.populations
      .filter(({ populationUnits, representation }) => (
        populationUnits > 0
        && representation === "individual-representatives"
      ))
      .filter(({ species }) => coreEcologySpeciesCanOwnActorAddress(species))
      .map((population) => ({
        species: population.species,
        populationKey: population.populationKey,
        populationSize: population.populationUnits,
        members: population.allocations.map((allocation) => ({
          populationOrdinal: allocation.allocationOrdinal,
          representedUnits: allocation.representedUnits,
          position: allocation.position,
          materialization: "materialized" as const,
        })),
      })),
  });
  const bearMember = patch.populations
    .find(({ species }) => species === "black-bear")
    ?.members[0];
  if (bearMember !== undefined) {
    const hungryBear = replaceCoreWildlifeActorPhysiology(bearMember.actor, {
      atTick: world.meta.completedTick,
      needs: { ...bearMember.actor.needs, hunger: Math.max(680_000, bearMember.actor.needs.hunger) },
      condition: bearMember.actor.condition,
    });
    patch = replaceCoreEcologyAggregatePatchActor(patch, hungryBear);
  }
  const tidal = stepCoreEcologyTidalTable(patch, {
    atTick: world.meta.completedTick,
  });
  if (tidal === null) throw new Error("Legacy waterfowl tidal projection failed validation");
  const initialized = initializeRuntimeTidalActivityActor(
    tidal.patch,
    tidal.projection,
    world.meta.completedTick,
  );
  if (initialized === null) throw new Error("Legacy waterfowl egret placement failed validation");
  const waterfowlInitialized = initializeRuntimeWaterfowlActivityActor(
    initialized,
    world.meta.completedTick,
  );
  if (waterfowlInitialized === null) {
    throw new Error("Legacy waterfowl placement failed validation");
  }
  return waterfowlInitialized;
}

/** Frozen Alpha-19 constructor used only to authenticate and extend v13 saves. */
function createRuntimeTidalTableCoreEcology(
  world: WorldState,
  bio0: Bio0EcologyState,
  economy: WorldView = createWorldView(world),
): CoreEcologyAggregatePatchState {
  const habitat = deriveRuntimeTidalTableCoreEcologyHabitat(world, bio0, economy);
  const groups = createRuntimeCoreEcologyGroups(world, habitat);
  let patch = createCoreEcologyAggregatePatch({
    seed: world.meta.rootSeed,
    patchKey: CORE_ECOLOGY_PATCH_KEY,
    originRegion: habitat.originRegion,
    tick: world.meta.completedTick,
    derivation: { kind: "habitat-v5", habitat },
    groups,
    populations: habitat.populations
      .filter(({ populationUnits, representation }) => (
        populationUnits > 0
        && representation === "individual-representatives"
      ))
      .filter(({ species }) => coreEcologySpeciesCanOwnActorAddress(species))
      .map((population) => ({
        species: population.species,
        populationKey: population.populationKey,
        populationSize: population.populationUnits,
        members: population.allocations.map((allocation) => ({
          populationOrdinal: allocation.allocationOrdinal,
          representedUnits: allocation.representedUnits,
          position: allocation.position,
          materialization: "materialized" as const,
        })),
      })),
  });
  const bearMember = patch.populations
    .find(({ species }) => species === "black-bear")
    ?.members[0];
  if (bearMember !== undefined) {
    const hungryBear = replaceCoreWildlifeActorPhysiology(bearMember.actor, {
      atTick: world.meta.completedTick,
      needs: { ...bearMember.actor.needs, hunger: Math.max(680_000, bearMember.actor.needs.hunger) },
      condition: bearMember.actor.condition,
    });
    patch = replaceCoreEcologyAggregatePatchActor(patch, hungryBear);
  }
  const tidal = stepCoreEcologyTidalTable(patch, {
    atTick: world.meta.completedTick,
  });
  if (tidal === null) throw new Error("Legacy tidal ecology projection failed validation");
  const initialized = initializeRuntimeTidalActivityActor(
    tidal.patch,
    tidal.projection,
    world.meta.completedTick,
  );
  if (initialized === null) throw new Error("Legacy tidal actor placement failed validation");
  return initialized;
}

/**
 * A newly minted egret has no travel history to preserve, so its first saved
 * address begins at the current tide/day destination rather than spending its
 * opening frames crossing from a baseline habitat sample that was never live.
 */
function initializeRuntimeTidalActivityActor(
  patch: CoreEcologyAggregatePatchState,
  projection: CoreEcologyTidalTableProjection,
  atTick: number,
): CoreEcologyAggregatePatchState | null {
  if (projection.snowyEgret === null) return patch;
  const actor = coreEcologyAggregatePatchActor(patch, projection.snowyEgret.actorId);
  const day = projectCoreEcologyDayPhase(atTick);
  if (actor === null || day === null || actor.identity.species !== "snowy-egret") return null;
  const target = day.phase === "daylight" && projection.snowyEgret.wadingTarget !== null
    ? projection.snowyEgret.wadingTarget
    : projection.snowyEgret.refugeTarget;
  try {
    return replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(actor, {
      atTick,
      position: target.targetPosition,
      heading: actor.address.heading,
    }));
  } catch {
    return null;
  }
}

/** Frozen Alpha-18 constructor used only to authenticate and extend v12 saves. */
function createRuntimeRainChorusCoreEcology(
  world: WorldState,
  bio0: Bio0EcologyState,
  economy: WorldView = createWorldView(world),
): CoreEcologyAggregatePatchState {
  const habitat = deriveRuntimeRainChorusCoreEcologyHabitat(world, bio0, economy);
  const groups = createRuntimeCoreEcologyGroups(world, habitat);
  let patch = createCoreEcologyAggregatePatch({
    seed: world.meta.rootSeed,
    patchKey: CORE_ECOLOGY_PATCH_KEY,
    originRegion: habitat.originRegion,
    tick: world.meta.completedTick,
    derivation: { kind: "habitat-v4", habitat },
    groups,
    populations: habitat.populations
      .filter(({ populationUnits, representation }) => (
        populationUnits > 0
        && representation === "individual-representatives"
      ))
      .filter(({ species }) => coreEcologySpeciesCanOwnActorAddress(species))
      .map((population) => ({
        species: population.species,
        populationKey: population.populationKey,
        populationSize: population.populationUnits,
        members: population.allocations.map((allocation) => ({
          populationOrdinal: allocation.allocationOrdinal,
          representedUnits: allocation.representedUnits,
          position: allocation.position,
          materialization: "materialized" as const,
        })),
      })),
  });
  const bearMember = patch.populations
    .find(({ species }) => species === "black-bear")
    ?.members[0];
  if (bearMember !== undefined) {
    const hungryBear = replaceCoreWildlifeActorPhysiology(bearMember.actor, {
      atTick: world.meta.completedTick,
      needs: { ...bearMember.actor.needs, hunger: Math.max(680_000, bearMember.actor.needs.hunger) },
      condition: bearMember.actor.condition,
    });
    patch = replaceCoreEcologyAggregatePatchActor(patch, hungryBear);
  }
  return patch;
}

/** Frozen Alpha-16 constructor used only to authenticate and extend v11 saves. */
function createRuntimeMarshEdgeCoreEcology(
  world: WorldState,
  bio0: Bio0EcologyState,
  economy: WorldView = createWorldView(world),
): CoreEcologyAggregatePatchState {
  const habitat = deriveRuntimeMarshEdgeCoreEcologyHabitat(world, bio0, economy);
  const groups = createRuntimeCoreEcologyGroups(world, habitat);
  let patch = createCoreEcologyAggregatePatch({
    seed: world.meta.rootSeed,
    patchKey: CORE_ECOLOGY_PATCH_KEY,
    originRegion: habitat.originRegion,
    tick: world.meta.completedTick,
    derivation: { kind: "habitat-v3", habitat },
    groups,
    populations: habitat.populations
      .filter(({ populationUnits, representation }) => (
        populationUnits > 0
        && representation === "individual-representatives"
      ))
      .filter(({ species }) => coreEcologySpeciesCanOwnActorAddress(species))
      .map((population) => ({
        species: population.species,
        populationKey: population.populationKey,
        populationSize: population.populationUnits,
        members: population.allocations.map((allocation) => ({
          populationOrdinal: allocation.allocationOrdinal,
          representedUnits: allocation.representedUnits,
          position: allocation.position,
          materialization: "materialized" as const,
        })),
      })),
  });
  const bearMember = patch.populations
    .find(({ species }) => species === "black-bear")
    ?.members[0];
  if (bearMember !== undefined) {
    const hungryBear = replaceCoreWildlifeActorPhysiology(bearMember.actor, {
      atTick: world.meta.completedTick,
      needs: { ...bearMember.actor.needs, hunger: Math.max(680_000, bearMember.actor.needs.hunger) },
      condition: bearMember.actor.condition,
    });
    patch = replaceCoreEcologyAggregatePatchActor(patch, hungryBear);
  }
  return patch;
}

/** Frozen Alpha-15 constructor used only to authenticate and extend v10 saves. */
function createRuntimeHarborEdgeCoreEcology(
  world: WorldState,
  bio0: Bio0EcologyState,
  economy: WorldView = createWorldView(world),
): CoreEcologyAggregatePatchState {
  const habitat = deriveRuntimeHarborEdgeCoreEcologyHabitat(world, bio0, economy);
  const groups = createRuntimeCoreEcologyGroups(world, habitat);
  let patch = createCoreEcologyAggregatePatch({
    seed: world.meta.rootSeed,
    patchKey: CORE_ECOLOGY_PATCH_KEY,
    originRegion: habitat.originRegion,
    tick: world.meta.completedTick,
    derivation: { kind: "habitat-v2", habitat },
    groups,
    populations: habitat.populations
      .filter(({ populationUnits, representation }) => (
        populationUnits > 0
        && representation === "individual-representatives"
      ))
      .filter(({ species }) => coreEcologySpeciesCanOwnActorAddress(species))
      .map((population) => ({
        species: population.species,
        populationKey: population.populationKey,
        populationSize: population.populationUnits,
        members: population.allocations.map((allocation) => ({
          populationOrdinal: allocation.allocationOrdinal,
          representedUnits: allocation.representedUnits,
          position: allocation.position,
          materialization: "materialized" as const,
        })),
      })),
  });
  const bearMember = patch.populations
    .find(({ species }) => species === "black-bear")
    ?.members[0];
  if (bearMember !== undefined) {
    const hungryBear = replaceCoreWildlifeActorPhysiology(bearMember.actor, {
      atTick: world.meta.completedTick,
      needs: { ...bearMember.actor.needs, hunger: Math.max(680_000, bearMember.actor.needs.hunger) },
      condition: bearMember.actor.condition,
    });
    patch = replaceCoreEcologyAggregatePatchActor(patch, hungryBear);
  }
  return patch;
}

function deriveRuntimeCoreEcologyHabitat(
  world: WorldState,
  bio0: Bio0EcologyState,
  economy: WorldView,
): CoreEcologyRegionalPredatorHabitatAssemblage {
  const input = runtimeCoreEcologyHabitatInput(world, bio0, economy);
  const cacheKey = hashCanonical(["runtime-core-ecology-habitat/v11", input]);
  const cached = runtimeCoreEcologyHabitatCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const habitat = deriveCoreEcologyRegionalPredatorHabitatAssemblage(input);
  runtimeCoreEcologyHabitatCache.set(cacheKey, habitat);
  if (runtimeCoreEcologyHabitatCache.size > RUNTIME_CORE_ECOLOGY_HABITAT_CACHE_LIMIT) {
    const oldest = runtimeCoreEcologyHabitatCache.keys().next().value as string | undefined;
    if (oldest !== undefined) runtimeCoreEcologyHabitatCache.delete(oldest);
  }
  return habitat;
}

/** Frozen Alpha-30 v10 habitat authority used only by outer-save adoption. */
function deriveRuntimeRegionalUplandCoreEcologyHabitat(
  world: WorldState,
  bio0: Bio0EcologyState,
  economy: WorldView,
): CoreEcologyRegionalUplandHabitatAssemblage {
  const input = runtimeCoreEcologyHabitatInput(world, bio0, economy);
  const cacheKey = hashCanonical(["runtime-core-ecology-habitat/v10", input]);
  const cached = runtimeRegionalUplandCoreEcologyHabitatCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const habitat = deriveCoreEcologyRegionalUplandHabitatAssemblage(input);
  runtimeRegionalUplandCoreEcologyHabitatCache.set(cacheKey, habitat);
  if (
    runtimeRegionalUplandCoreEcologyHabitatCache.size
      > RUNTIME_CORE_ECOLOGY_HABITAT_CACHE_LIMIT
  ) {
    const oldest = runtimeRegionalUplandCoreEcologyHabitatCache.keys().next().value as
      string | undefined;
    if (oldest !== undefined) runtimeRegionalUplandCoreEcologyHabitatCache.delete(oldest);
  }
  return habitat;
}

/** Frozen Alpha-29 v9 habitat authority used only by outer-save adoption. */
function deriveRuntimeDomesticPenCoreEcologyHabitat(
  world: WorldState,
  bio0: Bio0EcologyState,
  economy: WorldView,
): CoreEcologyDomesticPenHabitatAssemblage {
  const input = runtimeCoreEcologyHabitatInput(world, bio0, economy);
  const cacheKey = hashCanonical(["runtime-core-ecology-habitat/v9", input]);
  const cached = runtimeDomesticPenCoreEcologyHabitatCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const habitat = deriveCoreEcologyDomesticPenHabitatAssemblage(input);
  runtimeDomesticPenCoreEcologyHabitatCache.set(cacheKey, habitat);
  if (runtimeDomesticPenCoreEcologyHabitatCache.size > RUNTIME_CORE_ECOLOGY_HABITAT_CACHE_LIMIT) {
    const oldest = runtimeDomesticPenCoreEcologyHabitatCache.keys().next().value as
      string | undefined;
    if (oldest !== undefined) runtimeDomesticPenCoreEcologyHabitatCache.delete(oldest);
  }
  return habitat;
}

function runtimeCoreEcologyHabitatInput(
  world: WorldState,
  bio0: Bio0EcologyState,
  economy: WorldView,
) {
  const porter = runtimeBio0Porter(economy, bio0.porterAddress.actorId);
  const startingSettlement = economy.settlements.find(
    ({ id }) => id === porter.resident.homeSettlementId,
  ) ?? economy.settlements[0];
  const startingTile = startingSettlement === undefined
    ? undefined
    : economy.terrain.tiles[startingSettlement.tileIndex];
  const focus = startingTile === undefined
    ? bio0.porterAddress.position
    : createWorldPosition(
        bio0.porterAddress.position.region,
        Math.min(
          REGION_WIDTH_UNITS - 1,
          (startingTile.x + 6) * WORLD_POSITION_UNITS_PER_TILE
            + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
        ),
        startingTile.y * WORLD_POSITION_UNITS_PER_TILE
          + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
      );
  const excludedTileIndices = economy.settlements
    .map(({ tileIndex }) => tileIndex)
    .filter((tileIndex) => Number.isSafeInteger(tileIndex) && tileIndex >= 0)
    .sort((left, right) => left - right);
  const settlementId = startingSettlement?.id ?? porter.resident.homeSettlementId;
  const domesticPosition = runtimeSettlementStorePosition(economy, settlementId);
  const domesticAnchor = Object.freeze({
    anchorId: `SETTLEMENT-DOMESTIC-YARD-${settlementId}`,
    species: "domestic-chicken" as const,
    position: domesticPosition,
    radiusTiles: 4,
  });
  return Object.freeze({
    rootSeed: world.meta.rootSeed,
    originRegion: focus.region,
    focus: Object.freeze({
      position: focus,
      radiusTiles: 32,
      excludedTileIndices: Object.freeze(excludedTileIndices),
    }),
    domesticAnchor,
  });
}

function runtimeGuardianDogGeneration(
  world: WorldState,
  core: CoreEcologyAggregatePatchState,
): DogIdentityGenerationInput | null {
  const habitat = runtimeSettlementHomeHabitat(core);
  if (habitat === null) return null;
  const pen = habitat.domesticPenAnchor;
  const identity = hashCanonical([
    "settlement-working-dog/v1",
    world.meta.rootSeed,
    pen.anchorId,
  ]);
  return Object.freeze({
    seed: world.meta.rootSeed,
    originRegion: pen.position.region,
    originNamespace: "regional" as const,
    habitatClass: "settlement-edge" as const,
    habitatKey: `guardian:${identity}`,
    populationKey: `working-dogs:${identity}`,
    populationOrdinal: 0,
  });
}

/**
 * The first working dog is a separate individual beside the livestock pen.
 * It is deliberately not grafted onto the unowned BIO0 dog's history.
 */
function createRuntimeDogActorRoster(
  world: WorldState,
  bio0: Bio0EcologyState,
  core: CoreEcologyAggregatePatchState,
): DogActorRosterState {
  const generation = runtimeGuardianDogGeneration(world, core);
  const habitat = runtimeSettlementHomeHabitat(core);
  if (generation === null || habitat === null) {
    throw new Error("Working-dog roster requires the authenticated livestock pen");
  }
  const guardian = createDogActorState({
    ...generation,
    position: habitat.domesticPenAnchor.position,
    tick: world.meta.completedTick,
  });
  if (guardian.identity.stableId === bio0.dog.identity.stableId) {
    throw new Error("Working dog collided with the independent BIO0 dog identity");
  }
  return createDogActorRoster([guardian]);
}

function runtimeSettlementHomeHabitat(
  core: CoreEcologyAggregatePatchState,
): CoreEcologyDomesticPenHabitatAssemblage
  | CoreEcologyRegionalUplandHabitatAssemblage
  | CoreEcologyRegionalPredatorHabitatAssemblage
  | null {
  switch (core.derivation.kind) {
    case "habitat-v9":
    case "legacy-fixed-v1-with-habitat-v9":
    case "habitat-v10":
    case "legacy-fixed-v1-with-habitat-v10":
    case "habitat-v11":
    case "legacy-fixed-v1-with-habitat-v11":
    case "settlement-home-v1":
      return core.derivation.habitat;
    default:
      return null;
  }
}

function canonicalRuntimeDogActorRoster(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
  core: CoreEcologyAggregatePatchState,
): DogActorRosterState | null {
  const state = canonicalizeDogActorRoster(value);
  const generation = runtimeGuardianDogGeneration(world, core);
  if (state === null || generation === null || state.actors.length !== 1) return null;
  const actor = state.actors[0];
  if (
    actor === undefined
    || actor.updatedAtTick !== world.meta.completedTick
    || actor.identity.stableId === bio0.dog.identity.stableId
    || actor.identity.stableId !== stableDogId(generation)
    || stableStringify(actor.identity.originRegion) !== stableStringify(generation.originRegion)
    || actor.identity.habitatKey !== generation.habitatKey
    || actor.identity.populationKey !== generation.populationKey
    || actor.identity.populationOrdinal !== generation.populationOrdinal
  ) return null;
  return state;
}

function runtimeDogActors(
  bio0: Bio0EcologyState,
  roster: DogActorRosterState,
): readonly DogActorState[] {
  const actors = [bio0.dog, ...roster.actors];
  if (new Set(actors.map(({ identity }) => identity.stableId)).size !== actors.length) {
    throw new Error("Dog actor authorities contain a duplicate stable identity");
  }
  return Object.freeze(actors);
}

function runtimeDogActorById(
  bio0: Bio0EcologyState,
  roster: DogActorRosterState,
  actorId: string | null,
): DogActorState | null {
  if (actorId === null) return null;
  return runtimeDogActors(bio0, roster).find(({ identity }) => (
    identity.stableId === actorId
  )) ?? null;
}

/** Frozen Alpha-24 habitat authority used only to authenticate v17 saves. */
function deriveRuntimeDomesticYardCoreEcologyHabitat(
  world: WorldState,
  bio0: Bio0EcologyState,
  economy: WorldView,
): CoreEcologyDomesticYardHabitatAssemblage {
  const porter = runtimeBio0Porter(economy, bio0.porterAddress.actorId);
  const startingSettlement = economy.settlements.find(
    ({ id }) => id === porter.resident.homeSettlementId,
  ) ?? economy.settlements[0];
  const startingTile = startingSettlement === undefined
    ? undefined
    : economy.terrain.tiles[startingSettlement.tileIndex];
  const focus = startingTile === undefined
    ? bio0.porterAddress.position
    : createWorldPosition(
        bio0.porterAddress.position.region,
        Math.min(
          REGION_WIDTH_UNITS - 1,
          (startingTile.x + 6) * WORLD_POSITION_UNITS_PER_TILE
            + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
        ),
        startingTile.y * WORLD_POSITION_UNITS_PER_TILE
          + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
      );
  const excludedTileIndices = economy.settlements
    .map(({ tileIndex }) => tileIndex)
    .filter((tileIndex) => Number.isSafeInteger(tileIndex) && tileIndex >= 0)
    .sort((left, right) => left - right);
  const settlementId = startingSettlement?.id ?? porter.resident.homeSettlementId;
  const domesticPosition = runtimeSettlementStorePosition(economy, settlementId);
  const domesticAnchor = Object.freeze({
    anchorId: `SETTLEMENT-DOMESTIC-YARD-${settlementId}`,
    species: "domestic-chicken" as const,
    position: domesticPosition,
    radiusTiles: 4,
  });
  const cacheKey = hashCanonical([
    "runtime-core-ecology-habitat/v8",
    world.meta.rootSeed,
    focus,
    32,
    excludedTileIndices,
    domesticAnchor,
  ]);
  const cached = runtimeDomesticYardCoreEcologyHabitatCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const habitat = deriveCoreEcologyDomesticYardHabitatAssemblage({
    rootSeed: world.meta.rootSeed,
    originRegion: focus.region,
    focus: {
      position: focus,
      radiusTiles: 32,
      excludedTileIndices,
    },
    domesticAnchor,
  });
  runtimeDomesticYardCoreEcologyHabitatCache.set(cacheKey, habitat);
  if (
    runtimeDomesticYardCoreEcologyHabitatCache.size
      > RUNTIME_CORE_ECOLOGY_HABITAT_CACHE_LIMIT
  ) {
    const oldest = runtimeDomesticYardCoreEcologyHabitatCache.keys().next().value as
      | string
      | undefined;
    if (oldest !== undefined) runtimeDomesticYardCoreEcologyHabitatCache.delete(oldest);
  }
  return habitat;
}

/** Frozen Alpha-21 habitat authority used only to authenticate v15/v16 saves. */
function deriveRuntimeTidalWebCoreEcologyHabitat(
  world: WorldState,
  bio0: Bio0EcologyState,
  economy: WorldView,
): CoreEcologyTidalWebHabitatAssemblage {
  const porter = runtimeBio0Porter(economy, bio0.porterAddress.actorId);
  const startingSettlement = economy.settlements.find(
    ({ id }) => id === porter.resident.homeSettlementId,
  ) ?? economy.settlements[0];
  const startingTile = startingSettlement === undefined
    ? undefined
    : economy.terrain.tiles[startingSettlement.tileIndex];
  const focus = startingTile === undefined
    ? bio0.porterAddress.position
    : createWorldPosition(
        bio0.porterAddress.position.region,
        Math.min(
          REGION_WIDTH_UNITS - 1,
          (startingTile.x + 6) * WORLD_POSITION_UNITS_PER_TILE
            + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
        ),
        startingTile.y * WORLD_POSITION_UNITS_PER_TILE
          + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
      );
  const excludedTileIndices = economy.settlements
    .map(({ tileIndex }) => tileIndex)
    .filter((tileIndex) => Number.isSafeInteger(tileIndex) && tileIndex >= 0)
    .sort((left, right) => left - right);
  const cacheKey = hashCanonical([
    "runtime-core-ecology-habitat/v7",
    world.meta.rootSeed,
    focus,
    32,
    excludedTileIndices,
  ]);
  const cached = runtimeTidalWebCoreEcologyHabitatCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const habitat = deriveCoreEcologyTidalWebHabitatAssemblage({
    rootSeed: world.meta.rootSeed,
    originRegion: focus.region,
    focus: {
      position: focus,
      radiusTiles: 32,
      excludedTileIndices,
    },
  });
  runtimeTidalWebCoreEcologyHabitatCache.set(cacheKey, habitat);
  if (runtimeTidalWebCoreEcologyHabitatCache.size > RUNTIME_CORE_ECOLOGY_HABITAT_CACHE_LIMIT) {
    const oldest = runtimeTidalWebCoreEcologyHabitatCache.keys().next().value as
      | string
      | undefined;
    if (oldest !== undefined) runtimeTidalWebCoreEcologyHabitatCache.delete(oldest);
  }
  return habitat;
}

/** Frozen Alpha-20 habitat authority used only to authenticate v14 saves. */
function deriveRuntimeWaterfowlCoreEcologyHabitat(
  world: WorldState,
  bio0: Bio0EcologyState,
  economy: WorldView,
): CoreEcologyWaterfowlHabitatAssemblage {
  const porter = runtimeBio0Porter(economy, bio0.porterAddress.actorId);
  const startingSettlement = economy.settlements.find(
    ({ id }) => id === porter.resident.homeSettlementId,
  ) ?? economy.settlements[0];
  const startingTile = startingSettlement === undefined
    ? undefined
    : economy.terrain.tiles[startingSettlement.tileIndex];
  const focus = startingTile === undefined
    ? bio0.porterAddress.position
    : createWorldPosition(
        bio0.porterAddress.position.region,
        Math.min(
          REGION_WIDTH_UNITS - 1,
          (startingTile.x + 6) * WORLD_POSITION_UNITS_PER_TILE
            + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
        ),
        startingTile.y * WORLD_POSITION_UNITS_PER_TILE
          + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
      );
  const excludedTileIndices = economy.settlements
    .map(({ tileIndex }) => tileIndex)
    .filter((tileIndex) => Number.isSafeInteger(tileIndex) && tileIndex >= 0)
    .sort((left, right) => left - right);
  const cacheKey = hashCanonical([
    "runtime-core-ecology-habitat/v6",
    world.meta.rootSeed,
    focus,
    32,
    excludedTileIndices,
  ]);
  const cached = runtimeWaterfowlCoreEcologyHabitatCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const habitat = deriveCoreEcologyWaterfowlHabitatAssemblage({
    rootSeed: world.meta.rootSeed,
    originRegion: focus.region,
    focus: {
      position: focus,
      radiusTiles: 32,
      excludedTileIndices,
    },
  });
  runtimeWaterfowlCoreEcologyHabitatCache.set(cacheKey, habitat);
  if (runtimeWaterfowlCoreEcologyHabitatCache.size > RUNTIME_CORE_ECOLOGY_HABITAT_CACHE_LIMIT) {
    const oldest = runtimeWaterfowlCoreEcologyHabitatCache.keys().next().value as
      | string
      | undefined;
    if (oldest !== undefined) runtimeWaterfowlCoreEcologyHabitatCache.delete(oldest);
  }
  return habitat;
}

/** Frozen Alpha-19 habitat authority used only to authenticate v13 saves. */
function deriveRuntimeTidalTableCoreEcologyHabitat(
  world: WorldState,
  bio0: Bio0EcologyState,
  economy: WorldView,
): CoreEcologyTidalTableHabitatAssemblage {
  const porter = runtimeBio0Porter(economy, bio0.porterAddress.actorId);
  const startingSettlement = economy.settlements.find(
    ({ id }) => id === porter.resident.homeSettlementId,
  ) ?? economy.settlements[0];
  const startingTile = startingSettlement === undefined
    ? undefined
    : economy.terrain.tiles[startingSettlement.tileIndex];
  const focus = startingTile === undefined
    ? bio0.porterAddress.position
    : createWorldPosition(
        bio0.porterAddress.position.region,
        Math.min(
          REGION_WIDTH_UNITS - 1,
          (startingTile.x + 6) * WORLD_POSITION_UNITS_PER_TILE
            + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
        ),
        startingTile.y * WORLD_POSITION_UNITS_PER_TILE
          + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
      );
  const excludedTileIndices = economy.settlements
    .map(({ tileIndex }) => tileIndex)
    .filter((tileIndex) => Number.isSafeInteger(tileIndex) && tileIndex >= 0)
    .sort((left, right) => left - right);
  const cacheKey = hashCanonical([
    "runtime-core-ecology-habitat/v5",
    world.meta.rootSeed,
    focus,
    32,
    excludedTileIndices,
  ]);
  const cached = runtimeTidalTableCoreEcologyHabitatCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const habitat = deriveCoreEcologyTidalTableHabitatAssemblage({
    rootSeed: world.meta.rootSeed,
    originRegion: focus.region,
    focus: {
      position: focus,
      radiusTiles: 32,
      excludedTileIndices,
    },
  });
  runtimeTidalTableCoreEcologyHabitatCache.set(cacheKey, habitat);
  if (runtimeTidalTableCoreEcologyHabitatCache.size > RUNTIME_CORE_ECOLOGY_HABITAT_CACHE_LIMIT) {
    const oldest = runtimeTidalTableCoreEcologyHabitatCache.keys().next().value as string | undefined;
    if (oldest !== undefined) runtimeTidalTableCoreEcologyHabitatCache.delete(oldest);
  }
  return habitat;
}

/** Frozen Alpha-18 habitat authority used only to authenticate v12 saves. */
function deriveRuntimeRainChorusCoreEcologyHabitat(
  world: WorldState,
  bio0: Bio0EcologyState,
  economy: WorldView,
): CoreEcologyRainChorusHabitatAssemblage {
  const porter = runtimeBio0Porter(economy, bio0.porterAddress.actorId);
  const startingSettlement = economy.settlements.find(
    ({ id }) => id === porter.resident.homeSettlementId,
  ) ?? economy.settlements[0];
  const startingTile = startingSettlement === undefined
    ? undefined
    : economy.terrain.tiles[startingSettlement.tileIndex];
  const focus = startingTile === undefined
    ? bio0.porterAddress.position
    : createWorldPosition(
        bio0.porterAddress.position.region,
        Math.min(
          REGION_WIDTH_UNITS - 1,
          (startingTile.x + 6) * WORLD_POSITION_UNITS_PER_TILE
            + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
        ),
        startingTile.y * WORLD_POSITION_UNITS_PER_TILE
          + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
      );
  const excludedTileIndices = economy.settlements
    .map(({ tileIndex }) => tileIndex)
    .filter((tileIndex) => Number.isSafeInteger(tileIndex) && tileIndex >= 0)
    .sort((left, right) => left - right);
  const cacheKey = hashCanonical([
    "runtime-core-ecology-habitat/v4",
    world.meta.rootSeed,
    focus,
    32,
    excludedTileIndices,
  ]);
  const cached = runtimeRainChorusCoreEcologyHabitatCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const habitat = deriveCoreEcologyRainChorusHabitatAssemblage({
    rootSeed: world.meta.rootSeed,
    originRegion: focus.region,
    focus: {
      position: focus,
      radiusTiles: 32,
      excludedTileIndices,
    },
  });
  runtimeRainChorusCoreEcologyHabitatCache.set(cacheKey, habitat);
  if (runtimeRainChorusCoreEcologyHabitatCache.size > RUNTIME_CORE_ECOLOGY_HABITAT_CACHE_LIMIT) {
    const oldest = runtimeRainChorusCoreEcologyHabitatCache.keys().next().value as
      | string
      | undefined;
    if (oldest !== undefined) runtimeRainChorusCoreEcologyHabitatCache.delete(oldest);
  }
  return habitat;
}

/** Frozen Alpha-16 habitat authority used only to authenticate v11 saves. */
function deriveRuntimeMarshEdgeCoreEcologyHabitat(
  world: WorldState,
  bio0: Bio0EcologyState,
  economy: WorldView,
): CoreEcologyMarshEdgeHabitatAssemblage {
  const porter = runtimeBio0Porter(economy, bio0.porterAddress.actorId);
  const startingSettlement = economy.settlements.find(
    ({ id }) => id === porter.resident.homeSettlementId,
  ) ?? economy.settlements[0];
  const startingTile = startingSettlement === undefined
    ? undefined
    : economy.terrain.tiles[startingSettlement.tileIndex];
  const focus = startingTile === undefined
    ? bio0.porterAddress.position
    : createWorldPosition(
        bio0.porterAddress.position.region,
        Math.min(
          REGION_WIDTH_UNITS - 1,
          (startingTile.x + 6) * WORLD_POSITION_UNITS_PER_TILE
            + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
        ),
        startingTile.y * WORLD_POSITION_UNITS_PER_TILE
          + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
      );
  const excludedTileIndices = economy.settlements
    .map(({ tileIndex }) => tileIndex)
    .filter((tileIndex) => Number.isSafeInteger(tileIndex) && tileIndex >= 0)
    .sort((left, right) => left - right);
  const cacheKey = hashCanonical([
    "runtime-core-ecology-habitat/v3",
    world.meta.rootSeed,
    focus,
    32,
    excludedTileIndices,
  ]);
  const cached = runtimeMarshEdgeCoreEcologyHabitatCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const habitat = deriveCoreEcologyMarshEdgeHabitatAssemblage({
    rootSeed: world.meta.rootSeed,
    originRegion: focus.region,
    focus: {
      position: focus,
      radiusTiles: 32,
      excludedTileIndices,
    },
  });
  runtimeMarshEdgeCoreEcologyHabitatCache.set(cacheKey, habitat);
  if (runtimeMarshEdgeCoreEcologyHabitatCache.size > RUNTIME_CORE_ECOLOGY_HABITAT_CACHE_LIMIT) {
    const oldest = runtimeMarshEdgeCoreEcologyHabitatCache.keys().next().value as
      | string
      | undefined;
    if (oldest !== undefined) runtimeMarshEdgeCoreEcologyHabitatCache.delete(oldest);
  }
  return habitat;
}

/** Frozen Alpha-15 habitat authority used only to authenticate v10 saves. */
function deriveRuntimeHarborEdgeCoreEcologyHabitat(
  world: WorldState,
  bio0: Bio0EcologyState,
  economy: WorldView,
): CoreEcologyHarborEdgeHabitatAssemblage {
  const porter = runtimeBio0Porter(economy, bio0.porterAddress.actorId);
  const startingSettlement = economy.settlements.find(
    ({ id }) => id === porter.resident.homeSettlementId,
  ) ?? economy.settlements[0];
  const startingTile = startingSettlement === undefined
    ? undefined
    : economy.terrain.tiles[startingSettlement.tileIndex];
  const focus = startingTile === undefined
    ? bio0.porterAddress.position
    : createWorldPosition(
        bio0.porterAddress.position.region,
        Math.min(
          REGION_WIDTH_UNITS - 1,
          (startingTile.x + 6) * WORLD_POSITION_UNITS_PER_TILE
            + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
        ),
        startingTile.y * WORLD_POSITION_UNITS_PER_TILE
          + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
      );
  const excludedTileIndices = economy.settlements
    .map(({ tileIndex }) => tileIndex)
    .filter((tileIndex) => Number.isSafeInteger(tileIndex) && tileIndex >= 0)
    .sort((left, right) => left - right);
  const cacheKey = hashCanonical([
    "runtime-core-ecology-habitat/v2",
    world.meta.rootSeed,
    focus,
    32,
    excludedTileIndices,
  ]);
  const cached = runtimeHarborEdgeCoreEcologyHabitatCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const habitat = deriveCoreEcologyHarborEdgeHabitatAssemblage({
    rootSeed: world.meta.rootSeed,
    originRegion: focus.region,
    focus: {
      position: focus,
      radiusTiles: 32,
      excludedTileIndices,
    },
  });
  runtimeHarborEdgeCoreEcologyHabitatCache.set(cacheKey, habitat);
  if (runtimeHarborEdgeCoreEcologyHabitatCache.size > RUNTIME_CORE_ECOLOGY_HABITAT_CACHE_LIMIT) {
    const oldest = runtimeHarborEdgeCoreEcologyHabitatCache.keys().next().value as string | undefined;
    if (oldest !== undefined) runtimeHarborEdgeCoreEcologyHabitatCache.delete(oldest);
  }
  return habitat;
}

/** Frozen Alpha-14 habitat authority used only to authenticate v9 saves. */
function deriveRuntimeWaveACoreEcologyHabitat(
  world: WorldState,
  bio0: Bio0EcologyState,
  economy: WorldView,
): CoreEcologyHabitatAssemblage {
  const porter = runtimeBio0Porter(economy, bio0.porterAddress.actorId);
  const startingSettlement = economy.settlements.find(
    ({ id }) => id === porter.resident.homeSettlementId,
  ) ?? economy.settlements[0];
  const startingTile = startingSettlement === undefined
    ? undefined
    : economy.terrain.tiles[startingSettlement.tileIndex];
  const focus = startingTile === undefined
    ? bio0.porterAddress.position
    : createWorldPosition(
        bio0.porterAddress.position.region,
        Math.min(
          REGION_WIDTH_UNITS - 1,
          (startingTile.x + 6) * WORLD_POSITION_UNITS_PER_TILE
            + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
        ),
        startingTile.y * WORLD_POSITION_UNITS_PER_TILE
          + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
      );
  const excludedTileIndices = economy.settlements
    .map(({ tileIndex }) => tileIndex)
    .filter((tileIndex) => Number.isSafeInteger(tileIndex) && tileIndex >= 0)
    .sort((left, right) => left - right);
  const cacheKey = hashCanonical([
    "runtime-core-ecology-habitat/v1",
    world.meta.rootSeed,
    focus,
    32,
    excludedTileIndices,
  ]);
  const cached = runtimeWaveACoreEcologyHabitatCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const habitat = deriveCoreEcologyHabitatAssemblage({
    rootSeed: world.meta.rootSeed,
    originRegion: focus.region,
    focus: {
      position: focus,
      radiusTiles: 32,
      excludedTileIndices,
    },
  });
  runtimeWaveACoreEcologyHabitatCache.set(cacheKey, habitat);
  if (runtimeWaveACoreEcologyHabitatCache.size > RUNTIME_CORE_ECOLOGY_HABITAT_CACHE_LIMIT) {
    const oldest = runtimeWaveACoreEcologyHabitatCache.keys().next().value as string | undefined;
    if (oldest !== undefined) runtimeWaveACoreEcologyHabitatCache.delete(oldest);
  }
  return habitat;
}

function createRuntimeCoreEcologyGroups(
  world: WorldState,
  habitat:
    | CoreEcologyHabitatAssemblage
    | CoreEcologyHarborEdgeHabitatAssemblage
    | CoreEcologyMarshEdgeHabitatAssemblage
    | CoreEcologyRainChorusHabitatAssemblage
    | CoreEcologyTidalTableHabitatAssemblage
    | CoreEcologyWaterfowlHabitatAssemblage
    | CoreEcologyTidalWebHabitatAssemblage
    | CoreEcologyDomesticPenHabitatAssemblage
    | CoreEcologyDomesticYardHabitatAssemblage
    | CoreEcologyRegionalUplandHabitatAssemblage
    | CoreEcologyRegionalPredatorHabitatAssemblage,
) {
  const groups: CoreEcologyGroupState[] = [];
  for (const population of habitat.populations) {
    const policy = coreEcologySpeciesRuntimePolicy(population.species);
    if (
      policy === null
      || !policy.actorAddressable
      || policy.groupOrganization === null
      || policy.groupStableIdNamespace === null
      || !coreEcologySpeciesHasRuntimeCapability(population.species, "group-coordination")
      || population.allocations.length < 2
    ) continue;
    const anchor = population.allocations[0]?.position;
    if (anchor === undefined) continue;
    groups.push(createCoreEcologyGroup({
      seed: world.meta.rootSeed,
      species: population.species,
      originRegion: habitat.originRegion,
      populationKey: population.populationKey,
      groupOrdinal: 0,
      memberOrdinals: population.allocations.map(({ allocationOrdinal }) => allocationOrdinal),
      anchor,
      tick: world.meta.completedTick,
    }));
  }
  return createCoreEcologyGroupSet(groups);
}

function canonicalRuntimeCoreEcology(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
): CoreEcologyAggregatePatchState | null {
  const state = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    state === null
    || state.updatedAtTick !== world.meta.completedTick
    || state.patchKey !== CORE_ECOLOGY_PATCH_KEY
  ) return null;
  const origin = bio0.porterAddress.position.region;
  if (
    state.originRegion.x !== origin.x
    || state.originRegion.y !== origin.y
    || state.derivation.kind === "bounded-input-v1"
  ) return null;
  if (
    state.derivation.kind === "habitat-v11"
    || state.derivation.kind === "legacy-fixed-v1-with-habitat-v11"
  ) {
    const expectedHabitat = deriveRuntimeCoreEcologyHabitat(world, bio0, createWorldView(world));
    if (stableStringify(state.derivation.habitat) !== stableStringify(expectedHabitat)) return null;
    if (state.derivation.kind === "habitat-v11") {
      const expectedGroups = createRuntimeCoreEcologyGroups(world, expectedHabitat);
      if (!runtimeCoreGroupTopologyMatches(state.groups.groups, expectedGroups.groups)) return null;
    } else {
      const legacyPopulations = state.populations.filter(({ species }) => (
        species === "deer" || species === "gull" || species === "black-bear"
      ));
      const expectedExtensionGroups = createRuntimeCoreEcologyGroups(world, expectedHabitat)
        .groups.filter(({ identity }) => (
          identity.species === "fish-crow"
          || identity.species === "domestic-chicken"
          || identity.species === "domestic-goat"
          || identity.species === "wild-boar"
          || identity.species === "elk"
          || identity.species === "gray-wolf"
        ));
      if (
        !legacyRuntimeCoreEcologyTopologyMatches(legacyPopulations)
        || !runtimeCoreGroupTopologyMatches(state.groups.groups, expectedExtensionGroups)
      ) return null;
    }
  } else {
    // Current envelopes always carry their authenticated v11 habitat. Earlier
    // derivations are admitted only through the explicit one-way migrators.
    return null;
  }
  return runtimeCoreEcologyIdentitiesMatch(state, world) ? state : null;
}

/** Authenticate the exact Alpha-30 v10 ecology before its one-way adoption. */
function canonicalRuntimeRegionalUplandCoreEcology(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
): CoreEcologyAggregatePatchState | null {
  const state = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    state === null
    || state.updatedAtTick !== world.meta.completedTick
    || state.patchKey !== CORE_ECOLOGY_PATCH_KEY
  ) return null;
  const origin = bio0.porterAddress.position.region;
  if (
    state.originRegion.x !== origin.x
    || state.originRegion.y !== origin.y
    || (
      state.derivation.kind !== "habitat-v10"
      && state.derivation.kind !== "legacy-fixed-v1-with-habitat-v10"
    )
  ) return null;
  const expectedHabitat = deriveRuntimeRegionalUplandCoreEcologyHabitat(
    world,
    bio0,
    createWorldView(world),
  );
  if (stableStringify(state.derivation.habitat) !== stableStringify(expectedHabitat)) return null;
  if (state.derivation.kind === "habitat-v10") {
    const expectedGroups = createRuntimeCoreEcologyGroups(world, expectedHabitat);
    if (!runtimeCoreGroupTopologyMatches(state.groups.groups, expectedGroups.groups)) return null;
  } else {
    const legacyPopulations = state.populations.filter(({ species }) => (
      species === "deer" || species === "gull" || species === "black-bear"
    ));
    const expectedExtensionGroups = createRuntimeCoreEcologyGroups(world, expectedHabitat)
      .groups.filter(({ identity }) => (
        identity.species === "fish-crow"
        || identity.species === "domestic-chicken"
        || identity.species === "domestic-goat"
        || identity.species === "wild-boar"
        || identity.species === "elk"
        || identity.species === "gray-wolf"
      ));
    if (
      !legacyRuntimeCoreEcologyTopologyMatches(legacyPopulations)
      || !runtimeCoreGroupTopologyMatches(state.groups.groups, expectedExtensionGroups)
    ) return null;
  }
  return runtimeCoreEcologyIdentitiesMatch(state, world) ? state : null;
}

/** Authenticate the exact Alpha-29 v9 ecology, including its mortality/body ledger. */
function canonicalRuntimeDomesticPenCoreEcology(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
): CoreEcologyAggregatePatchState | null {
  const state = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    state === null
    || state.updatedAtTick !== world.meta.completedTick
    || state.patchKey !== CORE_ECOLOGY_PATCH_KEY
  ) return null;
  const origin = bio0.porterAddress.position.region;
  if (
    state.originRegion.x !== origin.x
    || state.originRegion.y !== origin.y
    || (
      state.derivation.kind !== "habitat-v9"
      && state.derivation.kind !== "legacy-fixed-v1-with-habitat-v9"
    )
  ) return null;
  const expectedHabitat = deriveRuntimeDomesticPenCoreEcologyHabitat(
    world,
    bio0,
    createWorldView(world),
  );
  if (stableStringify(state.derivation.habitat) !== stableStringify(expectedHabitat)) return null;
  if (state.derivation.kind === "habitat-v9") {
    const expectedGroups = createRuntimeCoreEcologyGroups(world, expectedHabitat);
    if (!runtimeCoreGroupTopologyMatches(state.groups.groups, expectedGroups.groups)) return null;
  } else {
    const legacyPopulations = state.populations.filter(({ species }) => (
      species === "deer" || species === "gull" || species === "black-bear"
    ));
    const expectedExtensionGroups = createRuntimeCoreEcologyGroups(world, expectedHabitat)
      .groups.filter(({ identity }) => (
        identity.species === "fish-crow"
        || identity.species === "domestic-chicken"
        || identity.species === "domestic-goat"
      ));
    if (
      !legacyRuntimeCoreEcologyTopologyMatches(legacyPopulations)
      || !runtimeCoreGroupTopologyMatches(state.groups.groups, expectedExtensionGroups)
    ) return null;
  }
  return runtimeCoreEcologyIdentitiesMatch(state, world) ? state : null;
}

/** Exact Alpha-24 v8 authority used only before the additive goat migration. */
function canonicalRuntimeDomesticYardCoreEcology(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
): CoreEcologyAggregatePatchState | null {
  const state = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    state === null
    || state.updatedAtTick !== world.meta.completedTick
    || state.patchKey !== CORE_ECOLOGY_PATCH_KEY
  ) return null;
  const origin = bio0.porterAddress.position.region;
  if (
    state.originRegion.x !== origin.x
    || state.originRegion.y !== origin.y
    || (
      state.derivation.kind !== "habitat-v8"
      && state.derivation.kind !== "legacy-fixed-v1-with-habitat-v8"
    )
  ) return null;
  const expectedHabitat = deriveRuntimeDomesticYardCoreEcologyHabitat(
    world,
    bio0,
    createWorldView(world),
  );
  if (stableStringify(state.derivation.habitat) !== stableStringify(expectedHabitat)) return null;
  if (state.derivation.kind === "habitat-v8") {
    const expectedGroups = createRuntimeCoreEcologyGroups(world, expectedHabitat);
    if (!runtimeCoreGroupTopologyMatches(state.groups.groups, expectedGroups.groups)) return null;
  } else {
    const legacyPopulations = state.populations.filter(({ species }) => (
      species === "deer" || species === "gull" || species === "black-bear"
    ));
    const expectedExtensionGroups = createRuntimeCoreEcologyGroups(world, expectedHabitat)
      .groups.filter(({ identity }) => (
        identity.species === "fish-crow"
        || identity.species === "domestic-chicken"
      ));
    if (
      !legacyRuntimeCoreEcologyTopologyMatches(legacyPopulations)
      || !runtimeCoreGroupTopologyMatches(state.groups.groups, expectedExtensionGroups)
    ) return null;
  }
  return runtimeCoreEcologyIdentitiesMatch(state, world) ? state : null;
}

function runtimeCoreEcologyIdentitiesMatch(
  state: CoreEcologyAggregatePatchState,
  world: WorldState,
): boolean {
  const identityRecords = [
    ...state.populations.flatMap((population) => population.members.map((member) => ({
      population,
      actor: member.actor,
      populationOrdinal: member.populationOrdinal,
    }))),
    ...state.mortalityTransactions.map((transaction) => ({
      population: state.populations.find((population) => (
        population.species === transaction.retiredActor.identity.species
        && population.populationKey === transaction.retiredActor.identity.populationKey
      )),
      actor: transaction.retiredActor,
      populationOrdinal: transaction.retiredActor.identity.populationOrdinal,
    })),
  ];
  for (const record of identityRecords) {
    const population = record.population;
    if (population === undefined) return false;
    if (!coreEcologySpeciesCanOwnActorAddress(population.species)) return false;
    const expectedIdentity = generateCoreWildlifeIdentity({
      seed: world.meta.rootSeed,
      species: population.species,
      originRegion: state.originRegion,
      populationKey: population.populationKey,
      populationOrdinal: record.populationOrdinal,
    });
    if (stableStringify(record.actor.identity) !== stableStringify(expectedIdentity)) return false;
  }
  for (const population of state.aggregatePopulations) {
    if (population.aggregateId !== stableCoreEcologyAggregatePopulationId({
      seed: world.meta.rootSeed,
      originRegion: state.originRegion,
      populationKey: population.populationKey,
      species: population.species,
    })) return false;
  }
  return true;
}

function runtimeSettlementStorePosition(economy: WorldView, settlementId: number) {
  const settlement = economy.settlements.find(({ id }) => id === settlementId);
  const tile = settlement === undefined
    ? undefined
    : economy.terrain.tiles[settlement.tileIndex];
  if (settlement === undefined || tile === undefined) {
    throw new Error("Settlement ecology starting settlement no longer resolves");
  }
  return createWorldPosition(
    createRegionCoord(0, 0),
    tile.x * WORLD_POSITION_UNITS_PER_TILE + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    tile.y * WORLD_POSITION_UNITS_PER_TILE + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
  );
}

function createRuntimeSettlementEcology(
  world: WorldState,
  bio0: Bio0EcologyState,
  core: CoreEcologyAggregatePatchState,
  dogRoster: DogActorRosterState,
  economy: WorldView = createWorldView(world),
): SettlementEcologyState {
  const keeper = runtimeBio0Porter(economy, bio0.porterAddress.actorId);
  // The BIO0 keeper's home is the stable bootstrap harbor. Current offered
  // Promises change over time and therefore cannot be a persistence key.
  const settlementId = keeper.resident.homeSettlementId;
  const store = createSettlementEcologyState({
    rootSeed: world.meta.rootSeed,
    settlementId,
    keeperActorId: keeper.address.actorId,
    position: runtimeSettlementStorePosition(economy, settlementId),
    aggregatePatch: core,
  });
  const habitat = runtimeSettlementHomeHabitat(core);
  if (habitat === null) return store;
  const definitions = [
    {
      custodyOrdinal: 0,
      species: "domestic-chicken" as const,
      groupOrganization: "flock" as const,
      homeStructure: {
        kind: "coop" as const,
        position: habitat.domesticAnchor.position,
        radiusUnits:
          habitat.domesticAnchor.radiusTiles
            * WORLD_POSITION_UNITS_PER_TILE,
      },
    },
    {
      custodyOrdinal: 1,
      species: "domestic-goat" as const,
      groupOrganization: "herd" as const,
      homeStructure: {
        kind: "pen" as const,
        position: habitat.domesticPenAnchor.position,
        radiusUnits:
          habitat.domesticPenAnchor.radiusTiles
            * WORLD_POSITION_UNITS_PER_TILE,
      },
    },
  ] as const;
  let established = store;
  for (const definition of definitions) {
    const population = core.populations.find(({ species }) => (
      species === definition.species
    ));
    const group = core.groups.groups.find(({ identity }) => (
      identity.species === definition.species
      && identity.organization === definition.groupOrganization
    ));
    if (population === undefined || population.members.length === 0 || group === undefined) {
      throw new Error(
        `Domestic ${definition.species} population lost its authenticated group or home anchor`,
      );
    }
    const next = establishSettlementDomesticAnimalCustody(established, {
      custodyOrdinal: definition.custodyOrdinal,
      owner: { kind: "settlement", id: settlementId },
      caretakerActorId: keeper.address.actorId,
      species: definition.species,
      memberActorIds: population.members.map(({ actor }) => actor.identity.stableId),
      memberGroupId: group.identity.stableId,
      homeStructure: definition.homeStructure,
    });
    if (next === null) {
      throw new Error(`Domestic ${definition.species} custody could not bind to its actors`);
    }
    established = next;
  }
  const guardian = dogRoster.actors[0];
  if (guardian === undefined) {
    throw new Error("Domestic guardian custody requires one authenticated dog actor");
  }
  const guardianCustody = establishSettlementDomesticAnimalCustody(established, {
    custodyOrdinal: 2,
    owner: { kind: "settlement", id: settlementId },
    caretakerActorId: keeper.address.actorId,
    species: "domestic-dog",
    memberActorIds: [guardian.identity.stableId],
    memberGroupId: null,
    homeStructure: {
      kind: "kennel",
      position: habitat.domesticPenAnchor.position,
      radiusUnits: 3 * WORLD_POSITION_UNITS_PER_TILE,
    },
  });
  if (guardianCustody === null) {
    throw new Error("Domestic guardian custody could not bind to its actor");
  }
  established = guardianCustody;
  return established;
}

function canonicalRuntimeSettlementEcology(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
  core: CoreEcologyAggregatePatchState,
  dogRoster: DogActorRosterState,
  economy: WorldView = createWorldView(world),
): SettlementEcologyState | null {
  const state = canonicalizeSettlementEcologyState(value);
  if (state === null || stableStringify(state) !== stableStringify(value)) return null;
  if (
    state.identity.keeperActorId !== bio0.porterAddress.actorId
    || state.keeperKnowledge.some(({ learnedAtTick }) => learnedAtTick > world.meta.completedTick)
    || (state.lastResolvedCauseEventTick ?? 0) > world.meta.completedTick
    || (state.pendingLoss?.causeEventTick ?? 0) > world.meta.completedTick
    || (state.lastResolvedDomesticFoodUseCauseEventTick ?? 0) > world.meta.completedTick
    || (state.pendingDomesticFoodUse?.causeEventTick ?? 0) > world.meta.completedTick
  ) return null;
  try {
    const keeper = runtimeBio0Porter(economy, state.identity.keeperActorId);
    if (keeper.address.actorId !== bio0.porterAddress.actorId) return null;
    const expected = createRuntimeSettlementEcology(world, bio0, core, dogRoster, economy);
    return stableStringify(state.identity) === stableStringify(expected.identity)
      && stableStringify(state.domesticCustodies) === stableStringify(expected.domesticCustodies)
      ? state
      : null;
  } catch {
    return null;
  }
}

function establishRuntimeDomesticCustodies(
  state: SettlementEcologyState,
  expected: SettlementEcologyState,
): SettlementEcologyState | null {
  if (stableStringify(state.identity) !== stableStringify(expected.identity)) return null;
  let adopted = state;
  for (const custody of expected.domesticCustodies) {
    const existing = adopted.domesticCustodies.find(({ custodyOrdinal }) => (
      custodyOrdinal === custody.custodyOrdinal
    ));
    if (existing !== undefined) {
      if (stableStringify(existing) !== stableStringify(custody)) return null;
      continue;
    }
    const next = establishSettlementDomesticAnimalCustody(adopted, {
      custodyOrdinal: custody.custodyOrdinal,
      owner: custody.owner,
      caretakerActorId: custody.caretakerActorId,
      species: custody.species,
      memberActorIds: custody.memberActorIds,
      memberGroupId: custody.memberGroupId,
      homeStructure: {
        kind: custody.homeStructure.kind,
        position: custody.homeStructure.position,
        radiusUnits: custody.homeStructure.radiusUnits,
      },
    });
    if (next === null) return null;
    adopted = next;
  }
  return stableStringify(adopted.domesticCustodies)
    === stableStringify(expected.domesticCustodies)
    ? adopted
    : null;
}

function createRuntimeSettlementWorkingAnimals(
  world: WorldState,
  settlement: SettlementEcologyState,
  dogRoster: DogActorRosterState,
  createdAtTick: number = world.meta.completedTick,
): SettlementWorkingAnimalState {
  const guardian = dogRoster.actors[0];
  const workerCustody = guardian === undefined
    ? undefined
    : settlement.domesticCustodies.find((custody) => (
        custody.species === "domestic-dog"
        && custody.memberActorIds.length === 1
        && custody.memberActorIds[0] === guardian.identity.stableId
      ));
  const protectedCustody = settlement.domesticCustodies.find((custody) => (
    custody.species === "domestic-goat"
    && custody.memberGroupId !== null
  ));
  if (
    guardian === undefined
    || workerCustody === undefined
    || protectedCustody === undefined
    || protectedCustody.memberGroupId === null
    || !Number.isSafeInteger(createdAtTick)
    || createdAtTick < 0
    || createdAtTick > world.meta.completedTick
  ) {
    throw new Error("Guardian work requires authenticated dog and livestock custody");
  }
  return createSettlementWorkingAnimalState({
    settlementId: settlement.identity.settlementId,
    assignments: [{
      assignmentOrdinal: 0,
      workerActorId: guardian.identity.stableId,
      workerSpecies: "domestic-dog",
      handlerActorId: settlement.identity.keeperActorId,
      workerCustodyRelationshipId: workerCustody.relationshipId,
      protectedCustodyRelationshipId: protectedCustody.relationshipId,
      protectedGroupId: protectedCustody.memberGroupId,
      role: "guardian",
      worksiteId: protectedCustody.homeStructure.structureId,
      dutyArea: {
        center: protectedCustody.homeStructure.position,
        radiusUnits: Math.max(
          protectedCustody.homeStructure.radiusUnits,
          8 * WORLD_POSITION_UNITS_PER_TILE,
        ),
      },
      createdAtTick,
    }],
  });
}

function workingAssignmentIdentityView(assignment: SettlementWorkingAnimalAssignment) {
  return Object.freeze({
    version: assignment.version,
    assignmentOrdinal: assignment.assignmentOrdinal,
    assignmentId: assignment.assignmentId,
    settlementId: assignment.settlementId,
    workerActorId: assignment.workerActorId,
    workerSpecies: assignment.workerSpecies,
    handlerActorId: assignment.handlerActorId,
    workerCustodyRelationshipId: assignment.workerCustodyRelationshipId,
    protectedCustodyRelationshipId: assignment.protectedCustodyRelationshipId,
    protectedGroupId: assignment.protectedGroupId,
    role: assignment.role,
    worksiteId: assignment.worksiteId,
    dutyArea: assignment.dutyArea,
    createdAtTick: assignment.createdAtTick,
  });
}

function canonicalRuntimeSettlementWorkingAnimals(
  value: unknown,
  world: WorldState,
  settlement: SettlementEcologyState,
  dogRoster: DogActorRosterState,
): SettlementWorkingAnimalState | null {
  const state = canonicalizeSettlementWorkingAnimalState(value);
  const assignment = state?.assignments[0];
  if (
    state === null
    || assignment === undefined
    || state.assignments.length !== 1
    || state.settlementId !== settlement.identity.settlementId
    || assignment.createdAtTick > world.meta.completedTick
    || assignment.currentActivity.acceptedAtTick > world.meta.completedTick
    || (assignment.pendingActivity?.acceptedAtTick ?? 0) > world.meta.completedTick
    || (assignment.currentTask?.openedAtTick ?? 0) > world.meta.completedTick
    || (assignment.currentTask?.lastTransition.acceptedAtTick ?? 0) > world.meta.completedTick
    || (assignment.currentTask?.outcomeAtTick ?? 0) > world.meta.completedTick
    || (assignment.lastTaskOutcome?.outcomeAtTick ?? 0) > world.meta.completedTick
    || (assignment.lastTaskOutcome?.closedAtTick ?? 0) > world.meta.completedTick
    || (assignment.lastTaskOutcome?.lastTransition.acceptedAtTick ?? 0) > world.meta.completedTick
    || (assignment.pendingTaskTransition?.acceptedAtTick ?? 0) > world.meta.completedTick
    || dogActorRosterActor(dogRoster, assignment.workerActorId) === null
  ) return null;
  try {
    const expected = createRuntimeSettlementWorkingAnimals(
      world,
      settlement,
      dogRoster,
      assignment.createdAtTick,
    );
    const expectedAssignment = expected.assignments[0];
    return expectedAssignment !== undefined
      && stableStringify(workingAssignmentIdentityView(assignment))
        === stableStringify(workingAssignmentIdentityView(expectedAssignment))
      ? state
      : null;
  } catch {
    return null;
  }
}

type RuntimeDomesticRecoveryRecord =
  | SettlementDomesticAnimalRecoveryCase
  | SettlementDomesticAnimalRecoveryOutcome;

function runtimeDomesticRecoveryRecordMatches(
  record: RuntimeDomesticRecoveryRecord,
  settlement: SettlementEcologyState,
  core: CoreEcologyAggregatePatchState,
  completedTick: number,
): boolean {
  const custody = settlement.domesticCustodies.find(({ relationshipId }) => (
    relationshipId === record.custodyRelationshipId
  ));
  const group = core.groups.groups.find(({ identity }) => (
    identity.stableId === record.groupId
  ));
  if (
    custody === undefined
    || group === undefined
    || record.settlementId !== settlement.identity.settlementId
    || custody.settlementId !== record.settlementId
    || custody.homeId !== record.homeId
    || custody.homeStructure.structureId !== record.homeStructureId
    || custody.caretakerActorId !== record.caretakerActorId
    || custody.species !== record.species
    || custody.memberGroupId !== record.groupId
    || group.identity.species !== record.species
    || stableStringify(custody.memberActorIds) !== stableStringify(record.memberActorIds)
    || stableStringify({
      center: custody.homeStructure.position,
      radiusUnits: custody.homeStructure.radiusUnits,
    }) !== stableStringify(record.homeArea)
    || record.openedAtTick > completedTick
    || record.splitEvent.atTick > completedTick
    || record.lastTransition.acceptedAtTick > completedTick
  ) return false;
  for (const binding of record.memberBindings) {
    const actor = coreEcologyAggregatePatchActor(core, binding.actorId);
    if (
      actor === null
      || actor.identity.species !== record.species
      || actor.identity.populationKey !== group.identity.populationKey
      || actor.identity.populationOrdinal !== binding.populationOrdinal
      || !group.memberOrdinals.includes(binding.populationOrdinal)
    ) return false;
  }
  return (record.notice?.learnedAtTick ?? 0) <= completedTick
    && (record.linkedSearch?.linkedAtTick ?? 0) <= completedTick
    && (record.reunionEvent?.atTick ?? 0) <= completedTick
    && (!("closedAtTick" in record) || (
      record.closedAtTick <= completedTick
      && record.confirmation.confirmedAtTick <= completedTick
    ));
}

function canonicalRuntimeSettlementDomesticAnimalRecovery(
  value: unknown,
  world: WorldState,
  settlement: SettlementEcologyState,
  core: CoreEcologyAggregatePatchState,
): SettlementDomesticAnimalRecoveryState | null {
  const state = canonicalizeSettlementDomesticAnimalRecoveryState(value);
  if (
    state === null
    || stableStringify(state) !== stableStringify(value)
    || state.settlementId !== settlement.identity.settlementId
    || state.pendingTransition !== null
    || state.currentCase !== null
      && !runtimeDomesticRecoveryRecordMatches(
        state.currentCase,
        settlement,
        core,
        world.meta.completedTick,
      )
    || state.latestClosedOutcome !== null
      && !runtimeDomesticRecoveryRecordMatches(
        state.latestClosedOutcome,
        settlement,
        core,
        world.meta.completedTick,
      )
  ) return null;
  return state;
}

function commitRuntimeSettlementDomesticAnimalRecovery(
  state: SettlementDomesticAnimalRecoveryState,
  request: Parameters<typeof stageSettlementDomesticAnimalRecovery>[1],
): SettlementDomesticAnimalRecoveryState | null {
  const staged = stageSettlementDomesticAnimalRecovery(state, request);
  if (staged === null) return null;
  const resolved = resolveSettlementDomesticAnimalRecovery(
    staged.state,
    staged.transaction,
  );
  return resolved?.state ?? null;
}

function runtimeDirectAnimalObservations(
  observations: readonly ActorObservation[],
  observerActorId: string,
  actorIds: readonly string[],
  expectedSpecies: CoreWildlifeSpecies,
  atTick: number,
): readonly ActorObservation[] {
  const eligible = new Set(actorIds);
  return Object.freeze(observations.filter((observation) => (
    observation.observerId === observerActorId
    && observation.subjectId !== null
    && eligible.has(observation.subjectId)
    && observation.observedAtTick === atTick
    && observation.channel === "vision"
    && observation.perceivedClass === expectedSpecies
    && observation.identification === "identified"
    && observation.area.radiusUnits === 0
    && observation.confidence > 0
    && observation.salience > 0
  )).slice().sort((left, right) => (
    compareText(left.subjectId!, right.subjectId!) || compareText(left.id, right.id)
  )));
}

/**
 * Reprojects one still-retained direct sight record without upgrading what the
 * caretaker knew. The salient record supplies the original observation locus
 * and tick; its matching live belief supplies only its canonical class and
 * identification. Decayed/forgotten evidence fails closed.
 */
function runtimeRetainedDirectAnimalObservation(
  perception: ActorPerceptionState,
  observerActorId: string,
  subjectActorId: string,
  expectedSpecies: CoreWildlifeSpecies,
  observedAtTick: number,
): ActorObservation | null {
  if (perception.actorId !== observerActorId || perception.tick < observedAtTick) return null;
  const candidates = perception.salientMemory.filter((memory) => (
    memory.subjectId === subjectActorId
    && memory.observedAtTick === observedAtTick
    && memory.channel === "vision"
    && memory.perceivedClass === expectedSpecies
    && memory.area.radiusUnits === 0
    && memory.salience > 0
  )).slice().sort((left, right) => compareText(left.observationId, right.observationId));
  for (const memory of candidates) {
    const belief = perception.beliefs.find((candidate) => (
      candidate.sourceObservationId === memory.observationId
      && candidate.subjectId === subjectActorId
      && candidate.channel === "vision"
      && candidate.perceivedClass === expectedSpecies
      && candidate.identification === "identified"
      && candidate.area.radiusUnits === 0
      && stableStringify(candidate.area) === stableStringify(memory.area)
      && candidate.confidence > 0
      && candidate.salience > 0
    ));
    if (belief === undefined) continue;
    const observation = createActorObservation({
      id: memory.observationId,
      observerId: observerActorId,
      observedAtTick: memory.observedAtTick,
      channel: "vision",
      perceivedClass: expectedSpecies,
      subjectId: subjectActorId,
      area: memory.area,
      confidence: belief.confidence,
      salience: memory.salience,
      identification: "identified",
      interrupt: belief.strongInterrupt ? "strong" : "none",
    });
    if (observation !== null) return observation;
  }
  return null;
}

function runtimeWorldPositionDistanceSquared(
  left: LivingActorAddress["position"],
  right: LivingActorAddress["position"],
): bigint {
  const dx = (BigInt(left.region.x) - BigInt(right.region.x))
      * BigInt(REGION_WIDTH_UNITS)
    + BigInt(left.localX) - BigInt(right.localX);
  const dy = (BigInt(left.region.y) - BigInt(right.region.y))
      * BigInt(REGION_HEIGHT_UNITS)
    + BigInt(left.localY) - BigInt(right.localY);
  return dx * dx + dy * dy;
}

/**
 * Advances only from the keeper's current direct visual evidence. A remembered
 * custody relationship may direct attention toward the pen, but cannot reveal
 * an unseen split, reunion, or animal position.
 */
function advanceRuntimeDomesticRecoveryFromCaretakerSight(input: Readonly<{
  state: SettlementDomesticAnimalRecoveryState;
  settlement: SettlementEcologyState;
  core: CoreEcologyAggregatePatchState;
  caretakerActorId: string;
  caretakerPerception: ActorPerceptionState;
  observations: readonly ActorObservation[];
  atTick: number;
}>): SettlementDomesticAnimalRecoveryState | null {
  const current = input.state.currentCase;
  if (current === null) return input.state;
  const group = input.core.groups.groups.find(({ identity }) => (
    identity.stableId === current.groupId
  ));
  if (group === undefined || current.caretakerActorId !== input.caretakerActorId) return null;
  const direct = runtimeDirectAnimalObservations(
    input.observations,
    input.caretakerActorId,
    current.memberActorIds,
    group.identity.species,
    input.atTick,
  );

  if (current.phase === "unnoticed" && group.phase !== "cohesive") {
    const separatedObservation = direct.find(({ subjectId, area }) => (
      subjectId === current.separatedMemberActorId
      && !runtimePositionInsideArea(area.center, current.homeArea)
    ));
    const homeMemberObservation = direct.find(({ subjectId, area }) => (
      subjectId !== current.separatedMemberActorId
      && runtimePositionInsideArea(area.center, current.homeArea)
    ));
    if (separatedObservation !== undefined && homeMemberObservation !== undefined) {
      return commitRuntimeSettlementDomesticAnimalRecovery(input.state, {
        kind: "notice",
        evidenceKind: "current-dual-sight",
        atTick: input.atTick,
        settlement: input.settlement,
        group,
        separatedObservation,
        homeMemberObservation,
      });
    }
    const witnessedSplitObservation = runtimeRetainedDirectAnimalObservation(
      input.caretakerPerception,
      input.caretakerActorId,
      current.separatedMemberActorId,
      group.identity.species,
      current.activeSplitEvent.atTick,
    );
    const homeMemberObservations = current.memberActorIds
      .filter((actorId) => actorId !== current.separatedMemberActorId)
      .map((actorId) => direct.find(({ subjectId, area }) => (
        subjectId === actorId && runtimePositionInsideArea(area.center, current.homeArea)
      )));
    if (
      witnessedSplitObservation === null
      || runtimePositionInsideArea(witnessedSplitObservation.area.center, current.homeArea)
      || homeMemberObservations.some((observation) => observation === undefined)
    ) return input.state;
    return commitRuntimeSettlementDomesticAnimalRecovery(input.state, {
      kind: "notice",
      evidenceKind: "witnessed-split-home-census",
      atTick: input.atTick,
      settlement: input.settlement,
      group,
      witnessedSplitObservation,
      homeMemberObservations: homeMemberObservations as readonly ActorObservation[],
    });
  }

  if (current.phase === "awaiting-confirmation" && group.phase === "cohesive") {
    const memberObservations = current.memberActorIds.map((actorId) => direct.find(
      ({ subjectId, area }) => (
        subjectId === actorId && runtimePositionInsideArea(area.center, current.homeArea)
      ),
    ));
    if (memberObservations.some((observation) => observation === undefined)) return input.state;
    return commitRuntimeSettlementDomesticAnimalRecovery(input.state, {
      kind: "confirm-home",
      atTick: input.atTick,
      settlement: input.settlement,
      group,
      memberObservations: memberObservations as readonly ActorObservation[],
    });
  }
  return input.state;
}

/** A guardian's independently opened search may be linked, never treated as proof of finding. */
function advanceRuntimeDomesticRecoveryFromWorkingSearch(input: Readonly<{
  state: SettlementDomesticAnimalRecoveryState;
  settlement: SettlementEcologyState;
  core: CoreEcologyAggregatePatchState;
  workingAnimals: SettlementWorkingAnimalState;
  atTick: number;
}>): SettlementDomesticAnimalRecoveryState | null {
  const current = input.state.currentCase;
  if (current === null || current.phase !== "noticed") return input.state;
  const group = input.core.groups.groups.find(({ identity }) => (
    identity.stableId === current.groupId
  ));
  const assignment = input.workingAnimals.assignments.find((candidate) => (
    candidate.handlerActorId === current.caretakerActorId
    && candidate.protectedCustodyRelationshipId === current.custodyRelationshipId
    && candidate.protectedGroupId === current.groupId
    && candidate.currentTask?.phase === "investigating"
    && stableStringify(candidate.currentTask.perceivedArea)
      === stableStringify(current.lastKnownArea)
  ));
  if (group === undefined) return null;
  if (assignment?.currentTask === null || assignment?.currentTask === undefined) return input.state;
  return commitRuntimeSettlementDomesticAnimalRecovery(input.state, {
    kind: "link-search",
    atTick: input.atTick,
    settlement: input.settlement,
    group,
    workingAnimals: input.workingAnimals,
    assignmentId: assignment.assignmentId,
    taskId: assignment.currentTask.taskId,
  });
}

/**
 * Turns the caretaker's retained recovery proof into an explicit handler
 * report. It contains only the last area the caretaker actually learned; it
 * never samples the animal's current body or reclassifies it as a threat.
 */
function runtimeDomesticRecoveryHandlerSearchReport(
  state: SettlementDomesticAnimalRecoveryState,
  workingAnimals: SettlementWorkingAnimalState,
): SettlementWorkingAnimalHandlerSearchReport | null {
  const current = state.currentCase;
  if (current === null || current.phase !== "noticed" || current.notice === null) return null;
  const assignment = workingAnimals.assignments.find((candidate) => (
    candidate.handlerActorId === current.caretakerActorId
    && candidate.protectedCustodyRelationshipId === current.custodyRelationshipId
    && candidate.protectedGroupId === current.groupId
  ));
  if (assignment === undefined) return null;
  return createSettlementWorkingAnimalHandlerSearchReport({
    assignmentId: assignment.assignmentId,
    handlerActorId: current.caretakerActorId,
    knownAtTick: current.notice.learnedAtTick,
    sourceReferenceId: current.notice.proofId,
    knownArea: current.lastKnownArea,
  });
}

/**
 * Turns authenticated physical topology events into one bounded recovery case.
 * It does not notify the keeper; awareness remains a separate sight transition.
 */
function advanceRuntimeDomesticRecoveryFromGroupEvents(input: Readonly<{
  state: SettlementDomesticAnimalRecoveryState;
  settlement: SettlementEcologyState;
  core: CoreEcologyAggregatePatchState;
  events: readonly CoreEcologyGroupTransitionEvent[];
  atTick: number;
}>): SettlementDomesticAnimalRecoveryState | null {
  const ordered = input.events.slice().sort((left, right) => (
    left.atTick - right.atTick || compareText(left.eventId, right.eventId)
  ));
  const current = input.state.currentCase;
  if (current !== null) {
    const group = input.core.groups.groups.find(({ identity }) => (
      identity.stableId === current.groupId
    ));
    if (group === undefined) return null;
    if (current.phase === "awaiting-confirmation") {
      const resplitEvent = ordered.find((event) => (
        event.kind === "group-split" && event.groupId === current.groupId
      ));
      if (resplitEvent === undefined) return input.state;
      return commitRuntimeSettlementDomesticAnimalRecovery(input.state, {
        kind: "record-resplit",
        atTick: input.atTick,
        settlement: input.settlement,
        group,
        splitEvent: resplitEvent,
      });
    }
    const rejoinEvent = ordered.find((event) => (
      event.kind === "group-rejoined" && event.groupId === current.groupId
    ));
    if (rejoinEvent === undefined) return input.state;
    return commitRuntimeSettlementDomesticAnimalRecovery(input.state, {
      kind: "record-rejoin",
      atTick: input.atTick,
      settlement: input.settlement,
      group,
      rejoinEvent,
    });
  }

  for (const splitEvent of ordered) {
    if (splitEvent.kind !== "group-split") continue;
    const group = input.core.groups.groups.find(({ identity }) => (
      identity.stableId === splitEvent.groupId
    ));
    const custody = input.settlement.domesticCustodies.find((candidate) => (
      candidate.memberGroupId === splitEvent.groupId
    ));
    if (group === undefined || custody === undefined) continue;
    const population = input.core.populations.find((candidate) => (
      candidate.species === group.identity.species
      && candidate.populationKey === group.identity.populationKey
    ));
    if (population === undefined) return null;
    const maybeMembers = custody.memberActorIds.map((actorId) => (
      population.members.find(({ actor }) => actor.identity.stableId === actorId)
    ));
    if (maybeMembers.some((member) => member === undefined)) return null;
    const members = maybeMembers as typeof population.members;
    // A player-absent coarse split remains authoritative physical topology,
    // but it is not current actor evidence and must not manufacture a keeper
    // recovery case. Absence/census-derived opening is outside this bounded
    // slice; case creation remains owned by a current materialized split.
    const materializedCount = members.filter(({ materialization }) => (
      materialization === "materialized"
    )).length;
    if (materializedCount === 0) continue;
    if (materializedCount !== members.length) return null;
    const memberActors = members.map(({ actor }) => actor);
    if (memberActors.some(({ updatedAtTick }) => updatedAtTick !== input.atTick)) return null;
    const outsideMembers = memberActors.filter((actor) => (
      !runtimePositionInsideArea(actor.address.position, {
          center: custody.homeStructure.position,
          radiusUnits: custody.homeStructure.radiusUnits,
      })
    )).sort((left, right) => {
      const leftDistance = runtimeWorldPositionDistanceSquared(
        left.address.position,
        custody.homeStructure.position,
      );
      const rightDistance = runtimeWorldPositionDistanceSquared(
        right.address.position,
        custody.homeStructure.position,
      );
      return leftDistance === rightDistance
        ? compareText(left.identity.stableId, right.identity.stableId)
        : leftDistance > rightDistance ? -1 : 1;
    });
    const separatedMember = outsideMembers[0];
    if (separatedMember === undefined) continue;
    return commitRuntimeSettlementDomesticAnimalRecovery(input.state, {
      kind: "open",
      atTick: input.atTick,
      settlement: input.settlement,
      custodyRelationshipId: custody.relationshipId,
      group,
      splitEvent,
      separatedMember,
      memberActors,
      lastKnownArea: {
        center: separatedMember.address.position,
        radiusUnits: 0,
      },
    });
  }
  return input.state;
}

/** Authenticate the exact tidal-web contract shipped by Alpha 21–23. */
function canonicalRuntimeTidalWebCoreEcology(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
): CoreEcologyAggregatePatchState | null {
  const state = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    state === null
    || state.updatedAtTick !== world.meta.completedTick
    || state.patchKey !== CORE_ECOLOGY_PATCH_KEY
  ) return null;
  const origin = bio0.porterAddress.position.region;
  if (
    state.originRegion.x !== origin.x
    || state.originRegion.y !== origin.y
    || (
      state.derivation.kind !== "habitat-v7"
      && state.derivation.kind !== "legacy-fixed-v1-with-habitat-v7"
    )
  ) return null;
  const expectedHabitat = deriveRuntimeTidalWebCoreEcologyHabitat(
    world,
    bio0,
    createWorldView(world),
  );
  if (stableStringify(state.derivation.habitat) !== stableStringify(expectedHabitat)) return null;
  if (state.derivation.kind === "habitat-v7") {
    const expectedGroups = createRuntimeCoreEcologyGroups(world, expectedHabitat);
    if (!runtimeCoreGroupTopologyMatches(state.groups.groups, expectedGroups.groups)) return null;
  } else {
    const legacyPopulations = state.populations.filter(({ species }) => (
      species === "deer" || species === "gull" || species === "black-bear"
    ));
    const expectedExtensionGroups = createRuntimeCoreEcologyGroups(world, expectedHabitat)
      .groups.filter(({ identity }) => identity.species === "fish-crow");
    if (
      !legacyRuntimeCoreEcologyTopologyMatches(legacyPopulations)
      || !runtimeCoreGroupTopologyMatches(state.groups.groups, expectedExtensionGroups)
    ) return null;
  }
  for (const population of state.populations) {
    if (!coreEcologySpeciesCanOwnActorAddress(population.species)) return null;
    for (const member of population.members) {
      const expectedIdentity = generateCoreWildlifeIdentity({
        seed: world.meta.rootSeed,
        species: population.species,
        originRegion: state.originRegion,
        populationKey: population.populationKey,
        populationOrdinal: member.populationOrdinal,
      });
      if (stableStringify(member.actor.identity) !== stableStringify(expectedIdentity)) return null;
    }
  }
  for (const population of state.aggregatePopulations) {
    if (population.aggregateId !== stableCoreEcologyAggregatePopulationId({
      seed: world.meta.rootSeed,
      originRegion: state.originRegion,
      populationKey: population.populationKey,
      species: population.species,
    })) return null;
  }
  return state;
}

/** Authenticate the exact waterfowl contract shipped by Alpha 20. */
function canonicalRuntimeWaterfowlCoreEcology(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
): CoreEcologyAggregatePatchState | null {
  const state = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    state === null
    || state.updatedAtTick !== world.meta.completedTick
    || state.patchKey !== CORE_ECOLOGY_PATCH_KEY
  ) return null;
  const origin = bio0.porterAddress.position.region;
  if (
    state.originRegion.x !== origin.x
    || state.originRegion.y !== origin.y
    || (
      state.derivation.kind !== "habitat-v6"
      && state.derivation.kind !== "legacy-fixed-v1-with-habitat-v6"
    )
  ) return null;
  const expectedHabitat = deriveRuntimeWaterfowlCoreEcologyHabitat(
    world,
    bio0,
    createWorldView(world),
  );
  if (stableStringify(state.derivation.habitat) !== stableStringify(expectedHabitat)) return null;
  if (state.derivation.kind === "habitat-v6") {
    const expectedGroups = createRuntimeCoreEcologyGroups(world, expectedHabitat);
    if (!runtimeCoreGroupTopologyMatches(state.groups.groups, expectedGroups.groups)) return null;
  } else {
    const legacyPopulations = state.populations.filter(({ species }) => (
      species === "deer" || species === "gull" || species === "black-bear"
    ));
    const expectedExtensionGroups = createRuntimeCoreEcologyGroups(world, expectedHabitat)
      .groups.filter(({ identity }) => identity.species === "fish-crow");
    if (
      !legacyRuntimeCoreEcologyTopologyMatches(legacyPopulations)
      || !runtimeCoreGroupTopologyMatches(state.groups.groups, expectedExtensionGroups)
    ) return null;
  }
  for (const population of state.populations) {
    if (!coreEcologySpeciesCanOwnActorAddress(population.species)) return null;
    for (const member of population.members) {
      const expectedIdentity = generateCoreWildlifeIdentity({
        seed: world.meta.rootSeed,
        species: population.species,
        originRegion: state.originRegion,
        populationKey: population.populationKey,
        populationOrdinal: member.populationOrdinal,
      });
      if (stableStringify(member.actor.identity) !== stableStringify(expectedIdentity)) return null;
    }
  }
  for (const population of state.aggregatePopulations) {
    if (population.aggregateId !== stableCoreEcologyAggregatePopulationId({
      seed: world.meta.rootSeed,
      originRegion: state.originRegion,
      populationKey: population.populationKey,
      species: population.species,
    })) return null;
  }
  return state;
}

/** Authenticate the exact Tide Table contract shipped by Alpha 19. */
function canonicalRuntimeTidalTableCoreEcology(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
): CoreEcologyAggregatePatchState | null {
  const state = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    state === null
    || state.updatedAtTick !== world.meta.completedTick
    || state.patchKey !== CORE_ECOLOGY_PATCH_KEY
  ) return null;
  const origin = bio0.porterAddress.position.region;
  if (
    state.originRegion.x !== origin.x
    || state.originRegion.y !== origin.y
    || (
      state.derivation.kind !== "habitat-v5"
      && state.derivation.kind !== "legacy-fixed-v1-with-habitat-v5"
    )
  ) return null;
  const expectedHabitat = deriveRuntimeTidalTableCoreEcologyHabitat(
    world,
    bio0,
    createWorldView(world),
  );
  if (stableStringify(state.derivation.habitat) !== stableStringify(expectedHabitat)) return null;
  if (state.derivation.kind === "habitat-v5") {
    const expectedGroups = createRuntimeCoreEcologyGroups(world, expectedHabitat);
    if (!runtimeCoreGroupTopologyMatches(state.groups.groups, expectedGroups.groups)) return null;
  } else {
    const legacyPopulations = state.populations.filter(({ species }) => (
      species === "deer" || species === "gull" || species === "black-bear"
    ));
    const expectedExtensionGroups = createRuntimeCoreEcologyGroups(world, expectedHabitat)
      .groups.filter(({ identity }) => identity.species === "fish-crow");
    if (
      !legacyRuntimeCoreEcologyTopologyMatches(legacyPopulations)
      || !runtimeCoreGroupTopologyMatches(state.groups.groups, expectedExtensionGroups)
    ) return null;
  }
  for (const population of state.populations) {
    if (!coreEcologySpeciesCanOwnActorAddress(population.species)) return null;
    for (const member of population.members) {
      const expectedIdentity = generateCoreWildlifeIdentity({
        seed: world.meta.rootSeed,
        species: population.species,
        originRegion: state.originRegion,
        populationKey: population.populationKey,
        populationOrdinal: member.populationOrdinal,
      });
      if (stableStringify(member.actor.identity) !== stableStringify(expectedIdentity)) return null;
    }
  }
  for (const population of state.aggregatePopulations) {
    if (population.aggregateId !== stableCoreEcologyAggregatePopulationId({
      seed: world.meta.rootSeed,
      originRegion: state.originRegion,
      populationKey: population.populationKey,
      species: population.species,
    })) return null;
  }
  return state;
}

/** Authenticate the exact Rain Chorus / Shadow Overhead contract shipped by Alpha 18. */
function canonicalRuntimeRainChorusCoreEcology(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
): CoreEcologyAggregatePatchState | null {
  const state = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    state === null
    || state.updatedAtTick !== world.meta.completedTick
    || state.patchKey !== CORE_ECOLOGY_PATCH_KEY
  ) return null;
  const origin = bio0.porterAddress.position.region;
  if (
    state.originRegion.x !== origin.x
    || state.originRegion.y !== origin.y
    || (
      state.derivation.kind !== "habitat-v4"
      && state.derivation.kind !== "legacy-fixed-v1-with-habitat-v4"
    )
  ) return null;
  const expectedHabitat = deriveRuntimeRainChorusCoreEcologyHabitat(
    world,
    bio0,
    createWorldView(world),
  );
  if (stableStringify(state.derivation.habitat) !== stableStringify(expectedHabitat)) return null;
  if (state.derivation.kind === "habitat-v4") {
    const expectedGroups = createRuntimeCoreEcologyGroups(world, expectedHabitat);
    if (!runtimeCoreGroupTopologyMatches(state.groups.groups, expectedGroups.groups)) return null;
  } else {
    const legacyPopulations = state.populations.filter(({ species }) => (
      species === "deer" || species === "gull" || species === "black-bear"
    ));
    const expectedExtensionGroups = createRuntimeCoreEcologyGroups(world, expectedHabitat)
      .groups.filter(({ identity }) => identity.species === "fish-crow");
    if (
      !legacyRuntimeCoreEcologyTopologyMatches(legacyPopulations)
      || !runtimeCoreGroupTopologyMatches(state.groups.groups, expectedExtensionGroups)
    ) return null;
  }
  for (const population of state.populations) {
    if (!coreEcologySpeciesCanOwnActorAddress(population.species)) return null;
    for (const member of population.members) {
      const expectedIdentity = generateCoreWildlifeIdentity({
        seed: world.meta.rootSeed,
        species: population.species,
        originRegion: state.originRegion,
        populationKey: population.populationKey,
        populationOrdinal: member.populationOrdinal,
      });
      if (stableStringify(member.actor.identity) !== stableStringify(expectedIdentity)) return null;
    }
  }
  for (const population of state.aggregatePopulations) {
    if (population.aggregateId !== stableCoreEcologyAggregatePopulationId({
      seed: world.meta.rootSeed,
      originRegion: state.originRegion,
      populationKey: population.populationKey,
      species: population.species,
    })) return null;
  }
  return state;
}

/** Authenticate the exact Rain-Chorus predecessor shipped by Alpha 16. */
function canonicalRuntimeMarshEdgeCoreEcology(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
): CoreEcologyAggregatePatchState | null {
  const state = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    state === null
    || state.updatedAtTick !== world.meta.completedTick
    || state.patchKey !== CORE_ECOLOGY_PATCH_KEY
  ) return null;
  const origin = bio0.porterAddress.position.region;
  if (
    state.originRegion.x !== origin.x
    || state.originRegion.y !== origin.y
    || (
      state.derivation.kind !== "habitat-v3"
      && state.derivation.kind !== "legacy-fixed-v1-with-habitat-v3"
    )
  ) return null;
  const expectedHabitat = deriveRuntimeMarshEdgeCoreEcologyHabitat(
    world,
    bio0,
    createWorldView(world),
  );
  if (stableStringify(state.derivation.habitat) !== stableStringify(expectedHabitat)) return null;
  if (state.derivation.kind === "habitat-v3") {
    const expectedGroups = createRuntimeCoreEcologyGroups(world, expectedHabitat);
    if (!runtimeCoreGroupTopologyMatches(state.groups.groups, expectedGroups.groups)) return null;
  } else {
    const legacyPopulations = state.populations.filter(({ species }) => (
      species === "deer" || species === "gull" || species === "black-bear"
    ));
    if (
      state.groups.groups.length !== 0
      || !legacyRuntimeCoreEcologyTopologyMatches(legacyPopulations)
    ) return null;
  }
  for (const population of state.populations) {
    if (!coreEcologySpeciesCanOwnActorAddress(population.species)) return null;
    for (const member of population.members) {
      const expectedIdentity = generateCoreWildlifeIdentity({
        seed: world.meta.rootSeed,
        species: population.species,
        originRegion: state.originRegion,
        populationKey: population.populationKey,
        populationOrdinal: member.populationOrdinal,
      });
      if (stableStringify(member.actor.identity) !== stableStringify(expectedIdentity)) return null;
    }
  }
  for (const population of state.aggregatePopulations) {
    if (population.aggregateId !== stableCoreEcologyAggregatePopulationId({
      seed: world.meta.rootSeed,
      originRegion: state.originRegion,
      populationKey: population.populationKey,
      species: population.species,
    })) return null;
  }
  return state;
}

/** Authenticate the exact aggregate ecology contract shipped by Alpha 15. */
function canonicalRuntimeHarborEdgeCoreEcology(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
): CoreEcologyAggregatePatchState | null {
  const state = canonicalizeCoreEcologyAggregatePatch(value);
  if (
    state === null
    || state.updatedAtTick !== world.meta.completedTick
    || state.patchKey !== CORE_ECOLOGY_PATCH_KEY
  ) return null;
  const origin = bio0.porterAddress.position.region;
  if (
    state.originRegion.x !== origin.x
    || state.originRegion.y !== origin.y
    || (
      state.derivation.kind !== "habitat-v2"
      && state.derivation.kind !== "legacy-fixed-v1-with-habitat-v2"
    )
  ) return null;
  const expectedHabitat = deriveRuntimeHarborEdgeCoreEcologyHabitat(
    world,
    bio0,
    createWorldView(world),
  );
  if (stableStringify(state.derivation.habitat) !== stableStringify(expectedHabitat)) return null;
  if (state.derivation.kind === "habitat-v2") {
    const expectedGroups = createRuntimeCoreEcologyGroups(world, expectedHabitat);
    if (!runtimeCoreGroupTopologyMatches(state.groups.groups, expectedGroups.groups)) return null;
  } else {
    const legacyPopulations = state.populations.filter(({ species }) => (
      species === "deer" || species === "gull" || species === "black-bear"
    ));
    if (
      state.groups.groups.length !== 0
      || !legacyRuntimeCoreEcologyTopologyMatches(legacyPopulations)
    ) return null;
  }
  for (const population of state.populations) {
    if (!coreEcologySpeciesCanOwnActorAddress(population.species)) return null;
    for (const member of population.members) {
      const expectedIdentity = generateCoreWildlifeIdentity({
        seed: world.meta.rootSeed,
        species: population.species,
        originRegion: state.originRegion,
        populationKey: population.populationKey,
        populationOrdinal: member.populationOrdinal,
      });
      if (stableStringify(member.actor.identity) !== stableStringify(expectedIdentity)) return null;
    }
  }
  for (const population of state.aggregatePopulations) {
    if (population.aggregateId !== stableCoreEcologyAggregatePopulationId({
      seed: world.meta.rootSeed,
      originRegion: state.originRegion,
      populationKey: population.populationKey,
      species: population.species,
    })) return null;
  }
  return state;
}

/** Authenticate the exact v2 ecology contract shipped by Alpha 14 before migration. */
function canonicalRuntimeWaveACoreEcology(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
): CoreEcologyPatchState | null {
  const state = canonicalizeCoreEcologyPatch(value);
  if (
    state === null
    || state.updatedAtTick !== world.meta.completedTick
    || state.patchKey !== CORE_ECOLOGY_PATCH_KEY
  ) return null;
  const origin = bio0.porterAddress.position.region;
  if (
    state.originRegion.x !== origin.x
    || state.originRegion.y !== origin.y
    || state.derivation.kind === "bounded-input-v1"
  ) return null;
  if (state.derivation.kind === "habitat-v1") {
    const expectedHabitat = deriveRuntimeWaveACoreEcologyHabitat(
      world,
      bio0,
      createWorldView(world),
    );
    if (stableStringify(state.derivation.habitat) !== stableStringify(expectedHabitat)) return null;
    const expectedGroups = createRuntimeCoreEcologyGroups(world, expectedHabitat);
    if (!runtimeCoreGroupTopologyMatches(state.groups.groups, expectedGroups.groups)) return null;
  } else if (
    state.groups.groups.length !== 0
    || !legacyRuntimeCoreEcologyTopologyMatches(state.populations)
  ) {
    return null;
  }
  for (const population of state.populations) {
    if (!coreEcologySpeciesCanOwnActorAddress(population.species)) return null;
    for (const member of population.members) {
      const expectedIdentity = generateCoreWildlifeIdentity({
        seed: world.meta.rootSeed,
        species: population.species,
        originRegion: state.originRegion,
        populationKey: population.populationKey,
        populationOrdinal: member.populationOrdinal,
      });
      if (stableStringify(member.actor.identity) !== stableStringify(expectedIdentity)) return null;
    }
  }
  return state;
}

/**
 * Adopt Alpha-14 ecology without rewriting any established actor or group.
 * The new cat/rat segment is derived once at the saved tick, so reload cannot
 * reroll it and no pre-migration encounter history is fabricated.
 */
function migrateRuntimeCoreEcologyFromWaveA(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
): CoreEcologyAggregatePatchState | null {
  const waveA = canonicalRuntimeWaveACoreEcology(value, world, bio0);
  if (waveA === null) return null;
  const template = createRuntimeHarborEdgeCoreEcology(world, bio0, createWorldView(world));
  if (template.derivation.kind !== "habitat-v2") return null;
  const catPopulations = template.populations.filter(
    ({ species }) => species === "domestic-cat",
  );
  const migrated = canonicalizeCoreEcologyAggregatePatch({
    ...template,
    updatedAtTick: waveA.updatedAtTick,
    derivation: waveA.derivation.kind === "legacy-fixed-v1"
      ? {
          kind: "legacy-fixed-v1-with-habitat-v2",
          habitat: template.derivation.habitat,
        }
      : template.derivation,
    groups: waveA.groups,
    populations: [...waveA.populations, ...catPopulations],
  });
  if (migrated === null) return null;
  for (const oldPopulation of waveA.populations) {
    const retained = migrated.populations.find(({ species, populationKey }) => (
      species === oldPopulation.species && populationKey === oldPopulation.populationKey
    ));
    if (stableStringify(retained) !== stableStringify(oldPopulation)) return null;
  }
  const harborEdge = canonicalRuntimeHarborEdgeCoreEcology(migrated, world, bio0);
  return harborEdge === null
    ? null
    : migrateRuntimeCoreEcologyFromHarborEdge(harborEdge, world, bio0);
}

/**
 * Append the marsh-edge rabbit/fox segment without rewriting any Alpha-15
 * actor, group, aggregate population, disturbance, or evidence state.
 */
function migrateRuntimeCoreEcologyFromHarborEdge(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
): CoreEcologyAggregatePatchState | null {
  const harborEdge = canonicalRuntimeHarborEdgeCoreEcology(value, world, bio0);
  if (harborEdge === null) return null;
  const template = createRuntimeMarshEdgeCoreEcology(world, bio0, createWorldView(world));
  if (template.derivation.kind !== "habitat-v3") return null;
  const extensionPopulations = template.populations.filter(({ species }) => (
    species === "marsh-rabbit" || species === "marsh-fox"
  ));
  const migrated = canonicalizeCoreEcologyAggregatePatch({
    ...harborEdge,
    derivation: harborEdge.derivation.kind === "legacy-fixed-v1-with-habitat-v2"
      ? {
          kind: "legacy-fixed-v1-with-habitat-v3",
          habitat: template.derivation.habitat,
        }
      : template.derivation,
    populations: [...harborEdge.populations, ...extensionPopulations],
  });
  if (migrated === null) return null;
  if (
    stableStringify(migrated.groups) !== stableStringify(harborEdge.groups)
    || stableStringify(migrated.aggregatePopulations)
      !== stableStringify(harborEdge.aggregatePopulations)
  ) return null;
  for (const oldPopulation of harborEdge.populations) {
    const retained = migrated.populations.find(({ species, populationKey }) => (
      species === oldPopulation.species && populationKey === oldPopulation.populationKey
    ));
    if (stableStringify(retained) !== stableStringify(oldPopulation)) return null;
  }
  const marshEdge = canonicalRuntimeMarshEdgeCoreEcology(migrated, world, bio0);
  return marshEdge === null
    ? null
    : migrateRuntimeCoreEcologyFromMarshEdge(marshEdge, world, bio0);
}

/**
 * Append the Rain Chorus / Shadow Overhead segment without rewriting any
 * Alpha-16 actor, group, aggregate population, disturbance, or evidence state.
 */
function migrateRuntimeCoreEcologyFromMarshEdge(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
): CoreEcologyAggregatePatchState | null {
  const marshEdge = canonicalRuntimeMarshEdgeCoreEcology(value, world, bio0);
  if (marshEdge === null) return null;
  const template = createRuntimeRainChorusCoreEcology(world, bio0, createWorldView(world));
  if (template.derivation.kind !== "habitat-v4") return null;
  const extensionPopulations = template.populations.filter(({ species }) => (
    species === "fish-crow" || species === "northern-harrier"
  ));
  const extensionGroups = template.groups.groups.filter(
    ({ identity }) => identity.species === "fish-crow",
  );
  const extensionAggregates = template.aggregatePopulations.filter(
    ({ species }) => species === "southern-leopard-frog",
  );
  const migrated = canonicalizeCoreEcologyAggregatePatch({
    ...marshEdge,
    derivation: marshEdge.derivation.kind === "legacy-fixed-v1-with-habitat-v3"
      ? {
          kind: "legacy-fixed-v1-with-habitat-v4",
          habitat: template.derivation.habitat,
        }
      : template.derivation,
    groups: createCoreEcologyGroupSet([
      ...marshEdge.groups.groups,
      ...extensionGroups,
    ]),
    populations: [...marshEdge.populations, ...extensionPopulations],
    aggregatePopulations: [
      ...marshEdge.aggregatePopulations,
      ...extensionAggregates,
    ],
  });
  if (migrated === null) return null;
  for (const oldPopulation of marshEdge.populations) {
    const retained = migrated.populations.find(({ species, populationKey }) => (
      species === oldPopulation.species && populationKey === oldPopulation.populationKey
    ));
    if (stableStringify(retained) !== stableStringify(oldPopulation)) return null;
  }
  for (const oldGroup of marshEdge.groups.groups) {
    const retained = migrated.groups.groups.find(
      ({ identity }) => identity.stableId === oldGroup.identity.stableId,
    );
    if (stableStringify(retained) !== stableStringify(oldGroup)) return null;
  }
  for (const oldAggregate of marshEdge.aggregatePopulations) {
    const retained = migrated.aggregatePopulations.find(
      ({ aggregateId }) => aggregateId === oldAggregate.aggregateId,
    );
    if (stableStringify(retained) !== stableStringify(oldAggregate)) return null;
  }
  const rainChorus = canonicalRuntimeRainChorusCoreEcology(migrated, world, bio0);
  return rainChorus === null
    ? null
    : migrateRuntimeCoreEcologyFromRainChorus(rainChorus, world, bio0);
}

/**
 * Append the first tidal-table ecology without rewriting any Alpha-18 actor,
 * group, aggregate population, disturbance, or evidence state.
 */
function migrateRuntimeCoreEcologyFromRainChorus(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
): CoreEcologyAggregatePatchState | null {
  const rainChorus = canonicalRuntimeRainChorusCoreEcology(value, world, bio0);
  if (rainChorus === null) return null;
  const template = createRuntimeTidalTableCoreEcology(world, bio0, createWorldView(world));
  if (template.derivation.kind !== "habitat-v5") return null;
  const extensionPopulations = template.populations.filter(({ species }) => (
    species === "snowy-egret"
  ));
  const extensionAggregates = template.aggregatePopulations.filter(({ species }) => (
    species === "atlantic-silverside"
      || species === "atlantic-marsh-fiddler-crab"
  ));
  const migrated = canonicalizeCoreEcologyAggregatePatch({
    ...rainChorus,
    derivation: rainChorus.derivation.kind === "legacy-fixed-v1-with-habitat-v4"
      ? {
          kind: "legacy-fixed-v1-with-habitat-v5",
          habitat: template.derivation.habitat,
        }
      : template.derivation,
    populations: [...rainChorus.populations, ...extensionPopulations],
    aggregatePopulations: [
      ...rainChorus.aggregatePopulations,
      ...extensionAggregates,
    ],
  });
  if (migrated === null) return null;
  if (stableStringify(migrated.groups) !== stableStringify(rainChorus.groups)) return null;
  for (const oldPopulation of rainChorus.populations) {
    const retained = migrated.populations.find(({ species, populationKey }) => (
      species === oldPopulation.species && populationKey === oldPopulation.populationKey
    ));
    if (stableStringify(retained) !== stableStringify(oldPopulation)) return null;
  }
  for (const oldAggregate of rainChorus.aggregatePopulations) {
    const retained = migrated.aggregatePopulations.find(
      ({ aggregateId }) => aggregateId === oldAggregate.aggregateId,
    );
    if (stableStringify(retained) !== stableStringify(oldAggregate)) return null;
  }
  const tidalTable = canonicalRuntimeTidalTableCoreEcology(migrated, world, bio0);
  return tidalTable === null
    ? null
    : migrateRuntimeCoreEcologyFromTidalTable(tidalTable, world, bio0);
}

/**
 * Adopt Alpha-29's exact v9 population/body ledger once, then append only the
 * three regional population keys and their shared social groups. Mortality,
 * carcass custody, old identities, ordinals, and dynamic actor state remain
 * byte-for-byte authoritative.
 */
function migrateRuntimeCoreEcologyFromDomesticPen(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
): CoreEcologyAggregatePatchState | null {
  const domesticPen = canonicalRuntimeDomesticPenCoreEcology(value, world, bio0);
  if (domesticPen === null) return null;
  const template = createRuntimeRegionalUplandCoreEcology(
    world,
    bio0,
    createWorldView(world),
  );
  if (template.derivation.kind !== "habitat-v10") return null;
  const regionalSpecies = new Set<CoreWildlifeSpecies>([
    "wild-boar",
    "elk",
    "gray-wolf",
  ]);
  const extensionPopulations = template.populations
    .filter(({ species }) => regionalSpecies.has(species))
    .map((population) => Object.freeze({
      ...population,
      members: Object.freeze(population.members.map((member) => Object.freeze({
        ...member,
        materialization: "coarse" as const,
      }))),
    }));
  const extensionGroups = template.groups.groups.filter(({ identity }) => (
    regionalSpecies.has(identity.species)
  ));
  const migrated = canonicalizeCoreEcologyAggregatePatch({
    ...domesticPen,
    derivation: domesticPen.derivation.kind === "legacy-fixed-v1-with-habitat-v9"
      ? {
          kind: "legacy-fixed-v1-with-habitat-v10",
          habitat: template.derivation.habitat,
        }
      : template.derivation,
    groups: createCoreEcologyGroupSet([
      ...domesticPen.groups.groups,
      ...extensionGroups,
    ]),
    populations: [...domesticPen.populations, ...extensionPopulations],
  });
  if (migrated === null) return null;
  if (
    stableStringify(migrated.aggregatePopulations)
      !== stableStringify(domesticPen.aggregatePopulations)
    || migrated.nextMortalityOrdinal !== domesticPen.nextMortalityOrdinal
    || stableStringify(migrated.mortalityTransactions)
      !== stableStringify(domesticPen.mortalityTransactions)
    || stableStringify(migrated.carcasses) !== stableStringify(domesticPen.carcasses)
  ) return null;
  for (const oldPopulation of domesticPen.populations) {
    const retained = migrated.populations.find(({ species, populationKey }) => (
      species === oldPopulation.species && populationKey === oldPopulation.populationKey
    ));
    if (stableStringify(retained) !== stableStringify(oldPopulation)) return null;
  }
  for (const oldGroup of domesticPen.groups.groups) {
    const retained = migrated.groups.groups.find(
      ({ identity }) => identity.stableId === oldGroup.identity.stableId,
    );
    if (stableStringify(retained) !== stableStringify(oldGroup)) return null;
  }
  const regionalUpland = canonicalRuntimeRegionalUplandCoreEcology(migrated, world, bio0);
  return regionalUpland === null
    ? null
    : migrateRuntimeCoreEcologyFromRegionalUpland(regionalUpland, world, bio0);
}

/**
 * Adopt Alpha-30's exact v10 population/body ledger once and append only the
 * two solitary regional-predator populations. Existing groups, aggregate
 * populations, mortality transactions, carcasses, actor claims, and item
 * custody remain byte-for-byte authoritative; the extension creates no group.
 */
function migrateRuntimeCoreEcologyFromRegionalUpland(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
): CoreEcologyAggregatePatchState | null {
  const regionalUpland = canonicalRuntimeRegionalUplandCoreEcology(value, world, bio0);
  if (regionalUpland === null) return null;
  const template = createRuntimeCoreEcology(world, bio0, createWorldView(world));
  if (template.derivation.kind !== "habitat-v11") return null;
  const predatorSpecies = new Set<CoreWildlifeSpecies>(["cougar", "brown-bear"]);
  const extensionPopulations = template.populations
    .filter(({ species }) => predatorSpecies.has(species))
    .map((population) => Object.freeze({
      ...population,
      members: Object.freeze(population.members.map((member) => Object.freeze({
        ...member,
        materialization: "coarse" as const,
      }))),
    }));
  const migrated = canonicalizeCoreEcologyAggregatePatch({
    ...regionalUpland,
    derivation: regionalUpland.derivation.kind === "legacy-fixed-v1-with-habitat-v10"
      ? {
          kind: "legacy-fixed-v1-with-habitat-v11",
          habitat: template.derivation.habitat,
        }
      : template.derivation,
    groups: regionalUpland.groups,
    populations: [...regionalUpland.populations, ...extensionPopulations],
  });
  if (migrated === null) return null;
  if (
    stableStringify(migrated.groups) !== stableStringify(regionalUpland.groups)
    || stableStringify(migrated.aggregatePopulations)
      !== stableStringify(regionalUpland.aggregatePopulations)
    || migrated.nextMortalityOrdinal !== regionalUpland.nextMortalityOrdinal
    || stableStringify(migrated.mortalityTransactions)
      !== stableStringify(regionalUpland.mortalityTransactions)
    || stableStringify(migrated.carcasses) !== stableStringify(regionalUpland.carcasses)
  ) return null;
  for (const oldPopulation of regionalUpland.populations) {
    const retained = migrated.populations.find(({ species, populationKey }) => (
      species === oldPopulation.species && populationKey === oldPopulation.populationKey
    ));
    if (stableStringify(retained) !== stableStringify(oldPopulation)) return null;
  }
  if (migrated.groups.groups.some(({ identity }) => predatorSpecies.has(identity.species))) {
    return null;
  }
  return canonicalRuntimeCoreEcology(migrated, world, bio0);
}

/**
 * Append the first multimodal waterfowl actor without rewriting any Alpha-19
 * actor, group, aggregate population, disturbance, evidence, or tide clock.
 */
function migrateRuntimeCoreEcologyFromTidalTable(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
): CoreEcologyAggregatePatchState | null {
  const tidalTable = canonicalRuntimeTidalTableCoreEcology(value, world, bio0);
  if (tidalTable === null) return null;
  const template = createRuntimeWaterfowlCoreEcology(world, bio0, createWorldView(world));
  if (template.derivation.kind !== "habitat-v6") return null;
  const extensionPopulations = template.populations.filter(({ species }) => (
    species === "american-black-duck"
  ));
  const migrated = canonicalizeCoreEcologyAggregatePatch({
    ...tidalTable,
    derivation: tidalTable.derivation.kind === "legacy-fixed-v1-with-habitat-v5"
      ? {
          kind: "legacy-fixed-v1-with-habitat-v6",
          habitat: template.derivation.habitat,
        }
      : template.derivation,
    populations: [...tidalTable.populations, ...extensionPopulations],
  });
  if (migrated === null) return null;
  if (
    stableStringify(migrated.groups) !== stableStringify(tidalTable.groups)
    || stableStringify(migrated.aggregatePopulations)
      !== stableStringify(tidalTable.aggregatePopulations)
  ) return null;
  for (const oldPopulation of tidalTable.populations) {
    const retained = migrated.populations.find(({ species, populationKey }) => (
      species === oldPopulation.species && populationKey === oldPopulation.populationKey
    ));
    if (stableStringify(retained) !== stableStringify(oldPopulation)) return null;
  }
  const waterfowl = canonicalRuntimeWaterfowlCoreEcology(migrated, world, bio0);
  return waterfowl === null
    ? null
    : migrateRuntimeCoreEcologyFromWaterfowl(waterfowl, world, bio0);
}

/**
 * Append the second domestic species to an exact Alpha-24 yard. Every earlier
 * actor, group, aggregate unit, event, need, and position remains byte exact.
 */
function migrateRuntimeCoreEcologyFromDomesticYard(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
): CoreEcologyAggregatePatchState | null {
  const domesticYard = canonicalRuntimeDomesticYardCoreEcology(value, world, bio0);
  if (domesticYard === null) return null;
  const template = createRuntimeDomesticPenCoreEcology(world, bio0, createWorldView(world));
  if (template.derivation.kind !== "habitat-v9") return null;
  const extensionPopulations = template.populations
    .filter(({ species }) => species === "domestic-goat")
    .map((population) => ({
      ...population,
      members: population.members.map((member) => ({
        ...member,
        materialization: "coarse" as const,
      })),
    }));
  const extensionGroups = template.groups.groups.filter(
    ({ identity }) => identity.species === "domestic-goat",
  );
  const migrated = canonicalizeCoreEcologyAggregatePatch({
    ...domesticYard,
    derivation: domesticYard.derivation.kind === "legacy-fixed-v1-with-habitat-v8"
      ? {
          kind: "legacy-fixed-v1-with-habitat-v9",
          habitat: template.derivation.habitat,
        }
      : template.derivation,
    groups: createCoreEcologyGroupSet([
      ...domesticYard.groups.groups,
      ...extensionGroups,
    ]),
    populations: [...domesticYard.populations, ...extensionPopulations],
  });
  if (migrated === null) return null;
  if (
    stableStringify(migrated.aggregatePopulations)
      !== stableStringify(domesticYard.aggregatePopulations)
  ) return null;
  for (const oldPopulation of domesticYard.populations) {
    const retained = migrated.populations.find(({ species, populationKey }) => (
      species === oldPopulation.species && populationKey === oldPopulation.populationKey
    ));
    if (stableStringify(retained) !== stableStringify(oldPopulation)) return null;
  }
  for (const oldGroup of domesticYard.groups.groups) {
    const retained = migrated.groups.groups.find(
      ({ identity }) => identity.stableId === oldGroup.identity.stableId,
    );
    if (stableStringify(retained) !== stableStringify(oldGroup)) return null;
  }
  return migrateRuntimeCoreEcologyFromDomesticPen(migrated, world, bio0);
}

/**
 * Append the tidal-web mammal and bounded domestic groups without rewriting
 * any Alpha-20 actor, group, aggregate population, disturbance, evidence, or
 * tide clock.
 */
function migrateRuntimeCoreEcologyFromWaterfowl(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
): CoreEcologyAggregatePatchState | null {
  const waterfowl = canonicalRuntimeWaterfowlCoreEcology(value, world, bio0);
  if (waterfowl === null) return null;
  const template = createRuntimeDomesticPenCoreEcology(world, bio0, createWorldView(world));
  if (template.derivation.kind !== "habitat-v9") return null;
  const extensionPopulations = template.populations
    .filter(({ species }) => (
      species === "north-american-river-otter"
      || species === "domestic-chicken"
      || species === "domestic-goat"
    ))
    .map((population) => ({
      ...population,
      // Adoption never changes an established Alpha-20 actor's representation.
      // The shared spatial top-K seam may materialize this appended actor on
      // the next fixed step when its physical position wins a slot.
      members: population.members.map((member) => ({
        ...member,
        materialization: "coarse" as const,
      })),
    }));
  const extensionGroups = template.groups.groups.filter(({ identity }) => (
    identity.species === "domestic-chicken"
    || identity.species === "domestic-goat"
  ));
  const migrated = canonicalizeCoreEcologyAggregatePatch({
    ...waterfowl,
    derivation: waterfowl.derivation.kind === "legacy-fixed-v1-with-habitat-v6"
      ? {
          kind: "legacy-fixed-v1-with-habitat-v9",
          habitat: template.derivation.habitat,
        }
      : template.derivation,
    groups: createCoreEcologyGroupSet([
      ...waterfowl.groups.groups,
      ...extensionGroups,
    ]),
    populations: [...waterfowl.populations, ...extensionPopulations],
  });
  if (migrated === null) return null;
  if (
    stableStringify(migrated.aggregatePopulations)
      !== stableStringify(waterfowl.aggregatePopulations)
  ) return null;
  for (const oldPopulation of waterfowl.populations) {
    const retained = migrated.populations.find(({ species, populationKey }) => (
      species === oldPopulation.species && populationKey === oldPopulation.populationKey
    ));
    if (stableStringify(retained) !== stableStringify(oldPopulation)) return null;
  }
  for (const oldGroup of waterfowl.groups.groups) {
    const retained = migrated.groups.groups.find(
      ({ identity }) => identity.stableId === oldGroup.identity.stableId,
    );
    if (stableStringify(retained) !== stableStringify(oldGroup)) return null;
  }
  return migrateRuntimeCoreEcologyFromDomesticPen(migrated, world, bio0);
}

/**
 * Append the bounded domestic actors to an exact Alpha-21–23 tidal-web save.
 * Every earlier actor, group, aggregate unit, disturbance, and evidence record
 * remains byte-for-byte unchanged.
 */
function migrateRuntimeCoreEcologyFromTidalWeb(
  value: unknown,
  world: WorldState,
  bio0: Bio0EcologyState,
): CoreEcologyAggregatePatchState | null {
  const tidalWeb = canonicalRuntimeTidalWebCoreEcology(value, world, bio0);
  if (tidalWeb === null) return null;
  const template = createRuntimeDomesticPenCoreEcology(world, bio0, createWorldView(world));
  if (template.derivation.kind !== "habitat-v9") return null;
  const extensionPopulations = template.populations
    .filter(({ species }) => (
      species === "domestic-chicken" || species === "domestic-goat"
    ))
    .map((population) => ({
      ...population,
      members: population.members.map((member) => ({
        ...member,
        materialization: "coarse" as const,
      })),
    }));
  const extensionGroups = template.groups.groups.filter(({ identity }) => (
    identity.species === "domestic-chicken"
    || identity.species === "domestic-goat"
  ));
  const migrated = canonicalizeCoreEcologyAggregatePatch({
    ...tidalWeb,
    derivation: tidalWeb.derivation.kind === "legacy-fixed-v1-with-habitat-v7"
      ? {
          kind: "legacy-fixed-v1-with-habitat-v9",
          habitat: template.derivation.habitat,
        }
      : template.derivation,
    groups: createCoreEcologyGroupSet([
      ...tidalWeb.groups.groups,
      ...extensionGroups,
    ]),
    populations: [...tidalWeb.populations, ...extensionPopulations],
  });
  if (migrated === null) return null;
  if (
    stableStringify(migrated.aggregatePopulations)
      !== stableStringify(tidalWeb.aggregatePopulations)
  ) return null;
  for (const oldPopulation of tidalWeb.populations) {
    const retained = migrated.populations.find(({ species, populationKey }) => (
      species === oldPopulation.species && populationKey === oldPopulation.populationKey
    ));
    if (stableStringify(retained) !== stableStringify(oldPopulation)) return null;
  }
  for (const oldGroup of tidalWeb.groups.groups) {
    const retained = migrated.groups.groups.find(
      ({ identity }) => identity.stableId === oldGroup.identity.stableId,
    );
    if (stableStringify(retained) !== stableStringify(oldGroup)) return null;
  }
  return migrateRuntimeCoreEcologyFromDomesticPen(migrated, world, bio0);
}

/**
 * Alpha-13 shipped exactly one fixed six-actor topology. Structural v1 input
 * alone is not migration authority: missing, extra, or invented populations
 * must be quarantined even when their actor identities are self-consistent.
 */
function legacyRuntimeCoreEcologyTopologyMatches(
  populations: readonly CoreEcologyPopulationState[],
): boolean {
  if (populations.length !== LEGACY_CORE_ECOLOGY_POPULATION_TOPOLOGY.length) return false;
  return LEGACY_CORE_ECOLOGY_POPULATION_TOPOLOGY.every((expected) => {
    const population = populations.find((candidate) => (
      candidate.species === expected.species
      && candidate.populationKey === expected.populationKey
    ));
    return population !== undefined
      && population.populationSize === expected.populationOrdinals.length
      && population.members.length === expected.populationOrdinals.length
      && population.members.every((member, index) => (
        member.populationOrdinal === expected.populationOrdinals[index]
        && member.representedUnits === 1
      ));
  });
}

function runtimeCoreGroupTopologyMatches(
  actual: readonly CoreEcologyGroupState[],
  expected: readonly CoreEcologyGroupState[],
): boolean {
  if (actual.length !== expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    const current = actual[index];
    const baseline = expected[index];
    if (
      current === undefined
      || baseline === undefined
      || stableStringify(current.identity) !== stableStringify(baseline.identity)
      || stableStringify(current.memberOrdinals) !== stableStringify(baseline.memberOrdinals)
    ) return false;
  }
  return true;
}

function seedRuntimeCoreEcologyProvision(
  state: PhysicalCargoState,
  regionalEcology: RegionalEcologyStateV1,
): PhysicalCargoState {
  const physicalOwners = runtimeRegionalCorePhysicalOwnerIndex([
    regionalEcology.settlementHome,
    ...regionalEcology.activeResidents,
  ]);
  if (physicalOwners === null) {
    throw new Error("Regional ecology has ambiguous physical ownership during forage seeding");
  }
  const bear = [...physicalOwners.actors.values()]
    .map(({ actor }) => actor)
    .filter(({ identity, condition }) => (
      identity.species === "black-bear" && condition.health > 0
    ))
    .sort((left, right) => compareText(
      left.identity.stableId,
      right.identity.stableId,
    ))[0];
  if (bear === undefined) return state;
  const priorActiveRegion = state.activeRegion;
  const target = transitionPhysicalCargoRegion(
    state,
    bear.address.position.region,
    WORLD_WIDTH,
    WORLD_HEIGHT,
  );
  const source = quotePhysicalCargoSource(
    target,
    "wildlife-forage",
    `wave-a:${hashCanonical([
      CORE_ECOLOGY_PATCH_KEY,
      bear.identity.stableId,
      CORE_ECOLOGY_FORAGE_PROVISION,
    ])}`,
  );
  const unitLoad = PROVISION_DEFINITIONS[CORE_ECOLOGY_FORAGE_PROVISION].loadMilli;
  const temporary = createLooseCargoCarrier(
    { kind: "unclaimed" },
    createCraftingInventory(unitLoad),
  );
  const provision = addLooseCargoProvision(temporary, {
    sourceLotId: source.lotId,
    provision: CORE_ECOLOGY_FORAGE_PROVISION,
    quantity: 1,
    materialState: { condition: FIXED_POINT, contamination: 0, decay: 0 },
  });
  if (!provision.ok) throw new Error(`Wave-A forage provision creation failed: ${provision.reason}`);
  const dropped = dropLooseCargo(target.looseWorld, provision.carrier, {
    lotId: source.lotId,
    quantity: 1,
    x: bear.address.position.localX * (LOOSE_CARGO_TILE_UNITS / WORLD_POSITION_UNITS_PER_TILE),
    y: bear.address.position.localY * (LOOSE_CARGO_TILE_UNITS / WORLD_POSITION_UNITS_PER_TILE),
  });
  if (!dropped.ok || dropped.entity === null) {
    throw new Error(`Wave-A forage provision placement failed: ${dropped.reason}`);
  }
  const seeded = commitPhysicalCargoRegionalMutation(target, {
    looseWorld: dropped.world,
    carrier: target.carrier,
    committedSourceOrdinal: source.ordinal,
  }, {
    kind: "delta",
    removed: [],
    added: [dropped.entity.payload],
  });
  return transitionPhysicalCargoRegion(
    seeded,
    priorActiveRegion,
    WORLD_WIDTH,
    WORLD_HEIGHT,
  );
}

interface RuntimeRegionalCoreActorOwner {
  readonly sourceKey: string;
  readonly actor: CoreWildlifeActorState;
}

interface RuntimeRegionalCoreCarcassOwner {
  readonly sourceKey: string;
  readonly carcass: CoreWildlifeCarcass;
}

interface RuntimeRegionalCorePhysicalOwnerIndex {
  readonly actors: ReadonlyMap<string, RuntimeRegionalCoreActorOwner>;
  readonly carcasses: ReadonlyMap<string, RuntimeRegionalCoreCarcassOwner>;
}

/**
 * Transient cross-owner lookup over one immutable root-wide snapshot. It is
 * never serialized and refuses ambiguous identity instead of allowing source
 * order to decide which animal or body another actor perceived.
 */
function runtimeRegionalCorePhysicalOwnerIndex(
  sources: readonly Readonly<{
    sourceKey: string;
    patch: CoreEcologyAggregatePatchState;
  }>[],
): RuntimeRegionalCorePhysicalOwnerIndex | null {
  const actors = new Map<string, RuntimeRegionalCoreActorOwner>();
  const carcasses = new Map<string, RuntimeRegionalCoreCarcassOwner>();
  const sourceKeys = new Set<string>();
  for (const source of sources) {
    if (sourceKeys.has(source.sourceKey) || source.patch.patchKey !== source.sourceKey) return null;
    sourceKeys.add(source.sourceKey);
    for (const { actor } of source.patch.populations.flatMap(({ members }) => members)) {
      const actorId = actor.identity.stableId;
      if (actors.has(actorId)) return null;
      actors.set(actorId, Object.freeze({ sourceKey: source.sourceKey, actor }));
    }
    for (const carcass of source.patch.carcasses) {
      if (carcasses.has(carcass.carcassId)) return null;
      carcasses.set(carcass.carcassId, Object.freeze({
        sourceKey: source.sourceKey,
        carcass,
      }));
    }
  }
  return Object.freeze({ actors, carcasses });
}

function runtimeCoreFoodEvidence(
  actor: CoreWildlifeActorState,
  state: PhysicalCargoState,
  physicalOwners: RuntimeRegionalCorePhysicalOwnerIndex,
  settlementEcology: SettlementEcologyState,
  world: WorldView,
  tick: number,
): Readonly<{
  observations: readonly ActorObservation[];
  opportunities: readonly CoreWildlifeFoodOpportunity[];
}> | null {
  if (!coreEcologySpeciesHasRuntimeCapability(
    actor.identity.species,
    "food-investigation",
  )) {
    return Object.freeze({ observations: Object.freeze([]), opportunities: Object.freeze([]) });
  }
  const profile = getCoreWildlifeProfile(actor.identity.species);
  if (!profile.roles.some((role) => (
    role === "scavenger" || role === "predator" || role === "omnivore"
  ))) {
    return Object.freeze({ observations: Object.freeze([]), opportunities: Object.freeze([]) });
  }
  const looseWorlds = physicalCargoPartitionsForView(state, world);
  const origin = regionalAddressAt(world, 0);
  if (origin === null) {
    return Object.freeze({ observations: Object.freeze([]), opportunities: Object.freeze([]) });
  }
  let frame;
  try {
    frame = createSpatialFrame(
      createWorldPosition(
        origin.region,
        origin.localX * WORLD_POSITION_UNITS_PER_TILE,
        origin.localY * WORLD_POSITION_UNITS_PER_TILE,
      ),
      world.terrain.width * WORLD_POSITION_UNITS_PER_TILE,
      world.terrain.height * WORLD_POSITION_UNITS_PER_TILE,
    );
  } catch {
    return null;
  }
  const observerPoint = worldPositionToSpatialFrame(frame, actor.address.position);
  if (observerPoint === null) {
    return Object.freeze({ observations: Object.freeze([]), opportunities: Object.freeze([]) });
  }
  const observerTileIndex = Math.floor(observerPoint.y / WORLD_POSITION_UNITS_PER_TILE)
    * world.terrain.width
    + Math.floor(observerPoint.x / WORLD_POSITION_UNITS_PER_TILE);
  const cells = runtimeLivingActorPerceptionCells(world);
  const candidates: Array<Readonly<{
    entityId: string;
    quantity: number;
    motion: string;
    position: CoreWildlifeActorState["address"]["position"];
    targetTileIndex: number;
    distanceUnits: number;
    supportsUnitClaim: boolean;
    knownFeedingStation: boolean;
    contactRadiusUnits: number;
    foodClass: "carrion" | "exposed-food";
    sourceKind: "physical-carcass" | "physical-item";
    currentClaimantActorId: string | null;
  }>> = [];
  for (const looseWorld of looseWorlds) {
    for (const entity of looseWorld.entities) {
      if (entity.payload.kind !== "provision") continue;
      const position = createWorldPosition(
        looseWorld.region,
        Math.trunc(entity.x / (LOOSE_CARGO_TILE_UNITS / WORLD_POSITION_UNITS_PER_TILE)),
        Math.trunc(entity.y / (LOOSE_CARGO_TILE_UNITS / WORLD_POSITION_UNITS_PER_TILE)),
      );
      const targetPoint = worldPositionToSpatialFrame(frame, position);
      if (targetPoint === null) continue;
      let delta;
      try {
        delta = worldPositionDelta(actor.address.position, position);
      } catch {
        continue;
      }
      const distanceUnits = Math.round(Math.hypot(delta.x, delta.y));
      if (distanceUnits > 10 * WORLD_POSITION_UNITS_PER_TILE) continue;
      candidates.push(Object.freeze({
        entityId: entity.id,
        quantity: entity.payload.quantity,
        motion: entity.motion,
        position,
        targetTileIndex: Math.floor(targetPoint.y / WORLD_POSITION_UNITS_PER_TILE)
          * world.terrain.width
          + Math.floor(targetPoint.x / WORLD_POSITION_UNITS_PER_TILE),
        distanceUnits,
        supportsUnitClaim: false,
        knownFeedingStation: false,
        contactRadiusUnits: 0,
        foodClass: "exposed-food",
        sourceKind: "physical-item",
        currentClaimantActorId: null,
      }));
    }
  }
  if (coreEcologySpeciesCanFeedFromCarcass(actor.identity.species)) {
    for (const { carcass } of physicalOwners.carcasses.values()) {
      if (carcass.remainingResourceUnits === 0 || carcass.retiredAtTick !== null) continue;
      const targetPoint = worldPositionToSpatialFrame(frame, carcass.deathPosition);
      if (targetPoint === null) continue;
      let delta;
      try {
        delta = worldPositionDelta(actor.address.position, carcass.deathPosition);
      } catch {
        continue;
      }
      const distanceUnits = Math.round(Math.hypot(delta.x, delta.y));
      if (distanceUnits > 10 * WORLD_POSITION_UNITS_PER_TILE) continue;
      candidates.push(Object.freeze({
        entityId: carcass.carcassId,
        quantity: carcass.remainingResourceUnits,
        motion: "resting",
        position: carcass.deathPosition,
        targetTileIndex: Math.floor(targetPoint.y / WORLD_POSITION_UNITS_PER_TILE)
          * world.terrain.width
          + Math.floor(targetPoint.x / WORLD_POSITION_UNITS_PER_TILE),
        distanceUnits,
        supportsUnitClaim: true,
        knownFeedingStation: false,
        contactRadiusUnits: Math.min(carcass.bodySizeUnits * 100, WORLD_POSITION_UNITS_PER_TILE),
        foodClass: "carrion",
        sourceKind: "physical-carcass",
        currentClaimantActorId: carcass.currentClaimantActorId,
      }));
    }
  }
  const storeSource = projectSettlementFoodStoreSource(settlementEcology);
  const storeLot = settlementEcology.carrier.lots.find(({ id }) => (
    id === settlementEcology.identity.foodLotId
  ));
  const domesticCustody = settlementEcology.domesticCustodies.find(({ memberActorIds }) => (
    memberActorIds.includes(actor.identity.stableId)
  ));
  if (
    storeSource !== null
    && storeSource.closure === "open"
    && storeSource.source.packagingLeakage > 0
    && storeLot?.payload.kind === "provision"
    && domesticCustody !== undefined
  ) {
    const targetPoint = worldPositionToSpatialFrame(frame, storeSource.source.position);
    if (targetPoint !== null) {
      try {
        const delta = worldPositionDelta(actor.address.position, storeSource.source.position);
        const distanceUnits = Math.round(Math.hypot(delta.x, delta.y));
        if (distanceUnits <= 10 * WORLD_POSITION_UNITS_PER_TILE) {
          candidates.push(Object.freeze({
            entityId: settlementEcology.identity.foodLotId,
            quantity: storeLot.payload.quantity,
            motion: "resting",
            position: storeSource.source.position,
            targetTileIndex: Math.floor(targetPoint.y / WORLD_POSITION_UNITS_PER_TILE)
              * world.terrain.width
              + Math.floor(targetPoint.x / WORLD_POSITION_UNITS_PER_TILE),
            distanceUnits,
            supportsUnitClaim: true,
            // Custody records a familiar home/feeding locus. The animal may
            // deliberately look toward it without learning whether food is
            // present through walls or outside ordinary visual range.
            knownFeedingStation: true,
            contactRadiusUnits: Math.min(
              domesticCustody.homeStructure.radiusUnits,
              CORE_ECOLOGY_DOMESTIC_STORE_ACCESS_REACH_UNITS,
            ),
            foodClass: "exposed-food",
            sourceKind: "physical-item",
            currentClaimantActorId: null,
          }));
        }
      } catch {
        // A store outside this bounded signed spatial frame is not perceived.
      }
    }
  }
  candidates.sort((left, right) => (
    left.distanceUnits - right.distanceUnits
    || (left.entityId < right.entityId ? -1 : left.entityId > right.entityId ? 1 : 0)
  ));
  const observations: ActorObservation[] = [];
  const opportunities: CoreWildlifeFoodOpportunity[] = [];
  for (const candidate of candidates.slice(0, CORE_WILDLIFE_MAX_FOOD_OPPORTUNITIES)) {
    const carcassClaimantId = candidate.currentClaimantActorId;
    let observerFacingRadians = headingToRadians(actor.address.heading);
    if (candidate.knownFeedingStation) {
      try {
        const delta = worldPositionDelta(actor.address.position, candidate.position);
        observerFacingRadians = Math.atan2(delta.y, delta.x);
      } catch {
        continue;
      }
    }
    const sight = evaluateVisualContact({
      columns: world.terrain.width,
      rows: world.terrain.height,
      cells,
      observerTileIndex,
      targetTileIndex: candidate.targetTileIndex,
      observerFacingRadians,
      weatherVisibility: clamp(1 - world.weather.intensity / FIXED_POINT * 0.52, 0, 1),
      targetMovementSalience: candidate.motion === "resting" ? 0 : 0.5,
      targetLightVisibility: 0.72,
    });
    if (sight === null || !sight.identityEligible) continue;
    const observationId = `food:${hashCanonical([
      actor.identity.stableId,
      candidate.entityId,
      tick,
    ])}`;
    const observation = createActorObservation({
      id: observationId,
      observerId: actor.identity.stableId,
      observedAtTick: tick,
      channel: "vision",
      perceivedClass: candidate.foodClass,
      subjectId: candidate.entityId,
      area: { center: candidate.position, radiusUnits: candidate.contactRadiusUnits },
      confidence: clamp(Math.round(sight.confidence * FIXED_POINT), 0, FIXED_POINT),
      salience: actor.identity.species === "black-bear" ? 880_000 : 720_000,
      identification: "identified",
    });
    if (observation === null) return null;
    observations.push(observation);
    opportunities.push(Object.freeze({
      resourceId: candidate.entityId,
      observationId,
      foodClass: candidate.foodClass,
      sourceKind: candidate.sourceKind,
      availableUnits: candidate.quantity,
      nutrition: candidate.foodClass === "carrion" ? 900_000 : 820_000,
      effort: clamp(
        Math.round(candidate.distanceUnits
          / (10 * WORLD_POSITION_UNITS_PER_TILE) * FIXED_POINT),
        0,
        FIXED_POINT,
      ),
      risk: candidate.foodClass === "carrion" ? 120_000 : 60_000,
      competition: carcassClaimantId !== null
        && carcassClaimantId !== actor.identity.stableId
        ? 620_000
        : 0,
      directlyConfirmed: true,
      // Loose parcels remain all-or-nothing here. A separately owned physical
      // carrier may advertise an exact-unit transaction through its own owner.
      accessible: candidate.supportsUnitClaim || candidate.quantity === 1,
    }));
  }
  return Object.freeze({
    observations: canonicalizeActorObservations(observations),
    opportunities: Object.freeze(opportunities.sort((left, right) => (
      left.resourceId < right.resourceId ? -1 : left.resourceId > right.resourceId ? 1 : 0
    ))),
  });
}

function runtimeCoreLivingFoodOpportunities(
  actor: CoreWildlifeActorState,
  observations: readonly ActorObservation[],
  physicalOwners: RuntimeRegionalCorePhysicalOwnerIndex,
): readonly CoreWildlifeFoodOpportunity[] {
  const opportunities: CoreWildlifeFoodOpportunity[] = [];
  for (const observation of observations) {
    if (
      observation.channel !== "vision"
      || observation.perceivedClass !== "live-prey"
      || observation.subjectId === null
      || observation.identification !== "identified"
    ) continue;
    const target = physicalOwners.actors.get(observation.subjectId)?.actor ?? null;
    if (
      target === null
      || target.condition.health <= 0
      || !coreEcologyCanPursueLivingActor(
        actor.identity.species,
        target.identity.species,
      )
      || !sameRuntimeWorldPosition(observation.area.center, target.address.position)
    ) continue;
    let delta;
    try {
      delta = worldPositionDelta(actor.address.position, observation.area.center);
    } catch {
      continue;
    }
    const distanceUnits = Math.round(Math.hypot(delta.x, delta.y));
    opportunities.push(Object.freeze({
      resourceId: observation.subjectId,
      observationId: observation.id,
      foodClass: "live-prey",
      sourceKind: "living-actor",
      availableUnits: 1,
      nutrition: 900_000,
      effort: clamp(
        Math.round(distanceUnits / (12 * WORLD_POSITION_UNITS_PER_TILE) * FIXED_POINT),
        0,
        FIXED_POINT,
      ),
      risk: 180_000,
      competition: 0,
      directlyConfirmed: true,
      accessible: true,
    }));
  }
  return Object.freeze(opportunities.sort((left, right) => (
    left.resourceId < right.resourceId ? -1 : left.resourceId > right.resourceId ? 1 : 0
  )));
}

function runtimeCoreAlarmEvents(
  state: CoreEcologyAggregatePatchState,
): readonly CoreWildlifeCausalEvent[] {
  return Object.freeze(state.populations.flatMap(({ members }) => members.flatMap((member) => {
    if (member.materialization !== "materialized") return [];
    const actor = member.actor;
    if (
      actor.intent.kind !== "alarm"
      || actor.intent.enteredAtTick !== state.updatedAtTick
      || actor.intent.resourceReference !== null
    ) return [];
    return [Object.freeze({
      version: CORE_WILDLIFE_EVENT_VERSION,
      eventId: `${actor.identity.stableId}:e:${actor.intent.enteredAtTick.toString(36)}:alarm`,
      atTick: actor.intent.enteredAtTick,
      actorId: actor.identity.stableId,
      species: actor.identity.species,
      kind: "alarm" as const,
      causeReferenceId: actor.intent.cause.referenceId,
      observationId: actor.intent.focusObservationId,
      resourceReference: null,
      position: actor.address.position,
    })];
  })).sort((left, right) => (
    left.actorId < right.actorId ? -1 : left.actorId > right.actorId ? 1 : 0
  )));
}

function mergeRuntimeCoreObservationBatches(
  observerId: string,
  batches: readonly (readonly CoreEcologyObservationBatch[])[],
): readonly ActorObservation[] | null {
  const combined = batches.flatMap((batch) => (
    batch.find((candidate) => candidate.observerId === observerId)?.observations ?? []
  ));
  const canonical = canonicalizeActorObservations(combined);
  return canonical.length === combined.length ? canonical : null;
}

/**
 * Offers a separated social actor only a group mate it directly sees in a
 * different physical component. The actor policy may still refuse or defer;
 * no home point, hidden body, or search result is smuggled through this seam.
 */
function runtimeCoreRegroupOpportunity(
  state: CoreEcologyAggregatePatchState,
  actor: CoreWildlifeActorState,
  observations: readonly ActorObservation[],
  tick: number,
): CoreWildlifeRegroupOpportunity | undefined {
  const population = state.populations.find(({ species, populationKey, members }) => (
    species === actor.identity.species
    && populationKey === actor.identity.populationKey
    && members.some(({ actor: member }) => member.identity.stableId === actor.identity.stableId)
  ));
  if (population === undefined) return undefined;
  const member = population.members.find(({ actor: candidate }) => (
    candidate.identity.stableId === actor.identity.stableId
  ));
  if (member === undefined) return undefined;
  const group = state.groups.groups.find((candidate) => (
    candidate.phase !== "cohesive"
    && candidate.identity.species === population.species
    && candidate.identity.populationKey === population.populationKey
    && candidate.memberOrdinals.includes(member.populationOrdinal)
  ));
  if (group === undefined) return undefined;
  const component = coreEcologyGroupComponentForMember(group, member.populationOrdinal);
  if (component === null) return undefined;
  const eligibleTargetIds = new Set(population.members
    .filter((candidate) => (
      group.memberOrdinals.includes(candidate.populationOrdinal)
      && !component.memberOrdinals.includes(candidate.populationOrdinal)
    ))
    .map(({ actor: candidate }) => candidate.identity.stableId));
  const direct = observations
    .filter((observation) => (
      observation.observedAtTick === tick
      && observation.channel === "vision"
      && observation.identification === "identified"
      && observation.perceivedClass === actor.identity.species
      && observation.subjectId !== null
      && eligibleTargetIds.has(observation.subjectId)
      && observation.area.radiusUnits === 0
    ))
    .sort((left, right) => (
      (left.subjectId ?? "") < (right.subjectId ?? "") ? -1
        : (left.subjectId ?? "") > (right.subjectId ?? "") ? 1
          : left.id < right.id ? -1 : left.id > right.id ? 1 : 0
    ))[0];
  if (direct?.subjectId === null || direct === undefined) return undefined;
  return Object.freeze({
    groupId: group.identity.stableId,
    observationId: direct.id,
    targetActorId: direct.subjectId,
  });
}

const RUNTIME_CORE_ESCAPE_INTENTS: ReadonlySet<CoreWildlifeIntentKind> = new Set([
  "disengage",
  "flee",
  "retreat",
] satisfies readonly CoreWildlifeIntentKind[]);

const RUNTIME_CORE_MOVING_INTENTS: ReadonlySet<CoreWildlifeIntentKind> = new Set([
  ...RUNTIME_CORE_ESCAPE_INTENTS,
  "scavenge",
  "forage",
  "pursue",
  "regroup",
] satisfies readonly CoreWildlifeIntentKind[]);
const RUNTIME_CORE_OFF_FRAME_ACTION_ACCESSIBILITY: CoreWildlifeActionAccessibility =
  Object.freeze({
    disengage: false,
    flee: false,
    alarm: false,
    retreat: false,
    guard: false,
    scavenge: false,
    forage: false,
    pursue: false,
    regroup: false,
    rest: false,
    observe: true,
  });
// Keep the physical split threshold inside the ordinary direct-detail sight
// envelope. A separated social actor may then lawfully perceive a group mate
// and choose regroup without hidden coordinates or a bespoke homing rule.
const RUNTIME_CORE_GROUP_SPLIT_DISTANCE_UNITS = 6 * WORLD_POSITION_UNITS_PER_TILE;
const RUNTIME_CORE_GROUP_REJOIN_DISTANCE_UNITS = 2 * WORLD_POSITION_UNITS_PER_TILE;

function runtimeCoreMovementTargets(
  actor: CoreWildlifeActorState,
): readonly Readonly<{
  center: CoreWildlifeActorState["address"]["position"];
  radiusUnits: number;
}>[] {
  const focus = actor.intent.focusObservationId === null
    ? null
    : actor.perception.beliefs.find(({ sourceObservationId }) => (
        sourceObservationId === actor.intent.focusObservationId
      )) ?? null;
  if (
    actor.intent.kind === "pursue"
    || actor.intent.kind === "scavenge"
    || actor.intent.kind === "forage"
    || actor.intent.kind === "regroup"
  ) return focus === null ? Object.freeze([]) : Object.freeze([focus.area]);
  if (!RUNTIME_CORE_ESCAPE_INTENTS.has(actor.intent.kind)) return Object.freeze([]);
  return deriveLivingActorEscapeTargets({
    actor: actor.address,
    focusArea: focus?.area ?? null,
  }) ?? Object.freeze([]);
}

function createRuntimeCoreTraversability(
  actor: CoreWildlifeActorState,
  world: WorldView,
  sampledAtTick: number,
  travelMedium?: CoreWildlifeTravelMedium,
): LivingActorTraversabilitySurface | null {
  const cacheKey = `${actor.identity.stableId}:${travelMedium ?? "default"}`;
  const cached = runtimeCoreTraversabilityCache
    .get(world)
    ?.get(cacheKey);
  if (cached?.sampledAtTick === sampledAtTick) return cached.surface;
  const origin = regionalAddressAt(world, 0);
  if (origin === null) return null;
  try {
    const surface = createLivingActorTraversabilitySurface({
      forActorId: actor.identity.stableId,
      sampledAtTick,
      origin: createWorldPosition(
        origin.region,
        origin.localX * WORLD_POSITION_UNITS_PER_TILE,
        origin.localY * WORLD_POSITION_UNITS_PER_TILE,
      ),
      widthTiles: world.terrain.width,
      heightTiles: world.terrain.height,
      cells: world.terrain.tiles.map((tile) => (
        coreWildlifeTraversabilityCell(actor.identity.species, tile, travelMedium)
      )),
    });
    let cache = runtimeCoreTraversabilityCache.get(world);
    if (cache === undefined) {
      cache = new Map();
      runtimeCoreTraversabilityCache.set(world, cache);
    }
    cache.set(cacheKey, Object.freeze({ sampledAtTick, surface }));
    return surface;
  } catch {
    return null;
  }
}

function runtimeCoreMovementEvidenceStrength(
  actor: CoreWildlifeActorState,
  world: WorldView,
): number | null {
  const policy = coreEcologySpeciesRuntimePolicy(actor.identity.species);
  if (
    policy === null
    || !coreEcologySpeciesHasRuntimeCapability(
      actor.identity.species,
      "ground-movement-evidence",
    )
    || !policy.evidenceKinds.some((kind) => (
      kind === "paired-tracks" || kind === "canid-pawprints"
    ))
  ) return null;
  const localX = Math.floor(actor.address.position.localX / WORLD_POSITION_UNITS_PER_TILE);
  const localY = Math.floor(actor.address.position.localY / WORLD_POSITION_UNITS_PER_TILE);
  const localTileIndex = localY * WORLD_WIDTH + localX;
  const viewTileIndex = regionalTileIndexInView(
    world,
    actor.address.position.region,
    localTileIndex,
  );
  const tile = viewTileIndex === null ? undefined : world.terrain.tiles[viewTileIndex];
  if (
    tile === undefined
    || !(tile.terrain === "marsh"
      || tile.terrain === "tidal-flat"
      || (tile.terrain === "meadow" && tile.moisture >= 560_000))
  ) return null;
  const surface = tile.terrain === "tidal-flat"
    ? 500_000
    : tile.terrain === "marsh"
      ? 420_000
      : 300_000;
  const rain = world.weather.kind === "rain" || world.weather.kind === "storm"
    ? Math.trunc(world.weather.intensity / 3)
    : 0;
  return Math.min(
    FIXED_POINT,
    surface
      + Math.trunc(tile.moisture / 3)
      + Math.trunc(tile.roughness / 8)
      + rain,
  );
}

function recordRuntimeCoreMovementEvidence(
  source: CoreWildlifeActorState,
  moved: CoreWildlifeActorState,
  world: WorldView,
  tick: number,
): CoreWildlifeActorState {
  const strength = runtimeCoreMovementEvidenceStrength(moved, world);
  return strength === null
    ? moved
    : repositionCoreWildlifeActorWithMovementEvidence(source, {
        atTick: tick,
        position: moved.address.position,
        heading: moved.address.heading,
        strength,
      });
}

function runtimeCoreIntentTravelMedium(
  actor: CoreWildlifeActorState,
): CoreWildlifeTravelMedium | undefined {
  return coreEcologySpeciesHasRuntimeCapability(
    actor.identity.species,
    "shore-water-activity",
  ) && coreEcologySpeciesHasRuntimeCapability(
    actor.identity.species,
    "amphibious-locomotion",
  ) && coreEcologySpeciesHasRuntimeCapability(
    actor.identity.species,
    "aquatic-locomotion",
  )
    ? "amphibious"
    : undefined;
}

function runtimeCoreActionAccessibility(
  actor: CoreWildlifeActorState,
  world: WorldView,
  tick: number,
): CoreWildlifeActionAccessibility | null {
  const travelMedium = runtimeCoreIntentTravelMedium(actor);
  if (
    travelMedium === undefined
    && coreEcologySpeciesHasRuntimeCapability(actor.identity.species, "aerial-locomotion")
  ) {
    return CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE;
  }
  const surface = createRuntimeCoreTraversability(actor, world, tick, travelMedium);
  if (surface === null) return null;
  let frame;
  try {
    frame = createSpatialFrame(
      surface.origin,
      surface.widthTiles * WORLD_POSITION_UNITS_PER_TILE,
      surface.heightTiles * WORLD_POSITION_UNITS_PER_TILE,
    );
  } catch {
    return null;
  }
  const point = worldPositionToSpatialFrame(frame, actor.address.position);
  if (point === null) return null;
  const x = Math.floor(point.x / WORLD_POSITION_UNITS_PER_TILE);
  const y = Math.floor(point.y / WORLD_POSITION_UNITS_PER_TILE);
  const actorCell = surface.cells[y * surface.widthTiles + x];
  const canStand = actorCell?.access === "open";
  const canGuardPhysicalFood = coreEcologySpeciesHasRuntimeCapability(
    actor.identity.species,
    "same-species-food-guard",
  ) || coreEcologySpeciesCanGuardCarcass(actor.identity.species);
  // Moving intents begin as conditionally available. The selected intent is
  // refined against its exact routed target below before any event is accepted.
  const canAttemptMovement = canStand;
  return Object.freeze({
    disengage: canAttemptMovement,
    flee: canAttemptMovement,
    alarm: true,
    retreat: canAttemptMovement,
    // Decision profiles may express generic competition pressure, but a live
    // runtime species only owns guarding when its catalog contract says what
    // physical resource it can guard. This keeps a non-guarding scavenger from
    // stalling at a claimed carcass instead of attempting to feed.
    guard: canStand && canGuardPhysicalFood,
    scavenge: canStand,
    forage: canStand,
    pursue: canAttemptMovement,
    regroup: canAttemptMovement,
    rest: canStand,
    observe: true,
  });
}

function runtimeCoreReachableFoodOpportunities(
  actor: CoreWildlifeActorState,
  observations: readonly ActorObservation[],
  opportunities: readonly CoreWildlifeFoodOpportunity[],
  world: WorldView,
  tick: number,
): readonly CoreWildlifeFoodOpportunity[] | null {
  const travelMedium = runtimeCoreIntentTravelMedium(actor);
  if (
    travelMedium === undefined
    && coreEcologySpeciesHasRuntimeCapability(actor.identity.species, "aerial-locomotion")
  ) return opportunities;
  const surface = createRuntimeCoreTraversability(actor, world, tick, travelMedium);
  if (surface === null) return null;
  const observationById = new Map(observations.map((observation) => (
    [observation.id, observation] as const
  )));
  return Object.freeze(opportunities.map((opportunity) => {
    if (!opportunity.accessible) return opportunity;
    const observation = observationById.get(opportunity.observationId);
    if (observation === undefined) return Object.freeze({ ...opportunity, accessible: false });
    const resolution = resolveLivingActorLocomotion({
      requestId: `core-reach:${hashCanonical([
        actor.identity.stableId,
        opportunity.resourceId,
        tick,
      ])}`,
      tick,
      actor: actor.address,
      targetArea: observation.area,
      maximumStepUnits: coreWildlifeMaximumStepUnits(
        actor.identity.species,
        actor.intent.kind,
      ),
      surface,
    });
    const accessible = resolution.kind === "moved"
      || resolution.reason === "already-within-observed-area";
    return accessible === opportunity.accessible
      ? opportunity
      : Object.freeze({ ...opportunity, accessible });
  }));
}

interface RuntimeCoreBlockedMovement {
  readonly actorId: string;
  readonly intent: CoreWildlifeIntentKind;
}

function resolveRuntimeCoreLocomotion(
  state: CoreEcologyAggregatePatchState,
  world: WorldView,
  tick: number,
  localActorIds: ReadonlySet<string>,
  activityAuthorities: ReadonlyMap<string, CoreEcologyActivityAuthorityV1>,
): Readonly<{
  patch: CoreEcologyAggregatePatchState;
  blocked: readonly RuntimeCoreBlockedMovement[];
}> | null {
  let patch = state;
  const blocked: RuntimeCoreBlockedMovement[] = [];
  for (const member of state.populations.flatMap(({ members }) => members)
    .filter(({ materialization, actor }) => (
      materialization === "materialized"
      && localActorIds.has(actor.identity.stableId)
    ))
    .sort((left, right) => left.actor.identity.stableId < right.actor.identity.stableId ? -1 : 1)) {
    const actor = coreEcologyAggregatePatchActor(patch, member.actor.identity.stableId);
    if (actor === null) return null;
    const ownsActivity = coreEcologySpeciesHasBoundedActivityProjection(
      actor.identity.species,
    );
    if (ownsActivity) {
      const authority = activityAuthorities.get(actor.identity.stableId);
      const projectedActivity = projectCoreEcologyActivity(patch, {
        actorId: actor.identity.stableId,
        atTick: tick,
      }, authority);
      if (projectedActivity === null) return null;
      const travelMedium = coreEcologyActivityTravelMedium(projectedActivity.motion);
      const activitySurface = travelMedium !== null && travelMedium !== "air"
        ? createRuntimeCoreTraversability(actor, world, tick, travelMedium)
        : undefined;
      if (travelMedium !== null && travelMedium !== "air" && activitySurface === null) return null;
      const activityMotion = stepCoreEcologyActivityMotion(patch, {
        actorId: actor.identity.stableId,
        atTick: tick,
        maximumStepUnits: coreWildlifeMaximumStepUnits(
          actor.identity.species,
          actor.intent.kind,
        ),
        ...(activitySurface === undefined || activitySurface === null
          ? {}
          : { surface: activitySurface }),
      }, authority);
      if (activityMotion === null) return null;
      patch = activityMotion.patch;
      // A bounded physical-surface route can be temporarily closed by the live
      // terrain/tide window. Holding is valid; only deferred threat motion
      // falls through to the ordinary intent resolver.
      if (activityMotion.resolution !== "deferred") continue;
    }
    const targetAreas = runtimeCoreMovementTargets(actor);
    if (targetAreas.length === 0) {
      if (RUNTIME_CORE_MOVING_INTENTS.has(actor.intent.kind)) {
        blocked.push(Object.freeze({
          actorId: actor.identity.stableId,
          intent: actor.intent.kind,
        }));
      }
      continue;
    }
    const intentTravelMedium = runtimeCoreIntentTravelMedium(actor);
    if (
      intentTravelMedium === undefined
      && coreEcologySpeciesHasRuntimeCapability(actor.identity.species, "aerial-locomotion")
    ) {
      let resolved = false;
      for (const targetArea of targetAreas) {
        let delta;
        try {
          delta = worldPositionDelta(actor.address.position, targetArea.center);
        } catch {
          continue;
        }
        const magnitude = Math.hypot(delta.x, delta.y);
        if (magnitude <= targetArea.radiusUnits) {
          resolved = true;
          break;
        }
        const distance = Math.min(
          coreWildlifeMaximumStepUnits(actor.identity.species, actor.intent.kind),
          magnitude,
        );
        const moveX = Math.round(delta.x / magnitude * distance);
        const moveY = Math.round(delta.y / magnitude * distance);
        try {
          patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(actor, {
            atTick: tick,
            position: translateWorldPosition(actor.address.position, moveX, moveY),
            heading: headingFromRadians(Math.atan2(moveY, moveX)),
          }));
          resolved = true;
          break;
        } catch {
          return null;
        }
      }
      if (!resolved && RUNTIME_CORE_MOVING_INTENTS.has(actor.intent.kind)) {
        blocked.push(Object.freeze({
          actorId: actor.identity.stableId,
          intent: actor.intent.kind,
        }));
      }
      continue;
    }
    const surface = createRuntimeCoreTraversability(actor, world, tick, intentTravelMedium);
    if (surface === null) return null;
    let resolved = false;
    for (const targetArea of targetAreas) {
      const requestId = `core-move:${hashCanonical([
        actor.identity.stableId,
        actor.intent.enteredAtTick,
        actor.intent.kind,
        targetArea,
      ])}`;
      const resolution = resolveLivingActorLocomotion({
        requestId,
        tick,
        actor: actor.address,
        targetArea,
        maximumStepUnits: coreWildlifeMaximumStepUnits(
          actor.identity.species,
          actor.intent.kind,
        ),
        surface,
      });
      if (resolution.kind === "no-move") {
        if (resolution.reason === "invalid-input") return null;
        if (
          resolution.reason === "already-within-observed-area"
          || resolution.reason === "already-at-search-probe"
        ) {
          resolved = true;
          break;
        }
        continue;
      }
      try {
        let movedActor = repositionCoreWildlifeActor(actor, {
          atTick: tick,
          position: resolution.actor.position,
          heading: resolution.actor.heading,
        });
        movedActor = recordRuntimeCoreMovementEvidence(actor, movedActor, world, tick);
        patch = replaceCoreEcologyAggregatePatchActor(patch, movedActor);
        resolved = true;
        break;
      } catch {
        return null;
      }
    }
    if (!resolved) {
      blocked.push(Object.freeze({
        actorId: actor.identity.stableId,
        intent: actor.intent.kind,
      }));
    }
  }
  blocked.sort((left, right) => (
    left.actorId < right.actorId
      ? -1
      : left.actorId > right.actorId
        ? 1
        : left.intent < right.intent
          ? -1
          : left.intent > right.intent ? 1 : 0
  ));
  return Object.freeze({ patch, blocked: Object.freeze(blocked) });
}

/**
 * Reconciles only fully materialized groups from exact post-locomotion bodies.
 * Distance alone cannot split a group: a current actor-owned escape event must
 * authenticate the separation. Partial groups remain under the coarse/group
 * representation owner until all required bodies are active together.
 */
function reconcileRuntimeCoreMaterializedGroups(
  state: CoreEcologyAggregatePatchState,
  events: readonly CoreWildlifeCausalEvent[],
  tick: number,
): Readonly<{
  patch: CoreEcologyAggregatePatchState;
  events: readonly CoreEcologyGroupTransitionEvent[];
}> | null {
  const groups: CoreEcologyGroupState[] = [];
  const transitions: CoreEcologyGroupTransitionEvent[] = [];
  for (const group of state.groups.groups) {
    const population = state.populations.find(({ species, populationKey }) => (
      species === group.identity.species
      && populationKey === group.identity.populationKey
    ));
    if (population === undefined) return null;
    const members = population.members
      .filter(({ populationOrdinal }) => group.memberOrdinals.includes(populationOrdinal))
      .sort((left, right) => left.populationOrdinal - right.populationOrdinal);
    if (
      members.length !== group.memberOrdinals.length
      || members.some(({ materialization }) => materialization !== "materialized")
    ) {
      groups.push(group);
      continue;
    }
    const escapeEvents = events
      .filter((event) => (
        event.atTick === tick
        && (event.kind === "flee" || event.kind === "retreat")
        && members.some(({ actor }) => actor.identity.stableId === event.actorId)
      ))
      .sort((left, right) => (
        left.eventId < right.eventId ? -1 : left.eventId > right.eventId ? 1 : 0
      ));
    const memberPositions = members.map(({ populationOrdinal, actor }) => ({
      memberOrdinal: populationOrdinal,
      position: actor.address.position,
    }));
    const baseInput = {
      atTick: tick,
      memberPositions,
      splitDistanceUnits: RUNTIME_CORE_GROUP_SPLIT_DISTANCE_UNITS,
      rejoinDistanceUnits: RUNTIME_CORE_GROUP_REJOIN_DISTANCE_UNITS,
    } as const;
    // More than one member may flee in the same tick. Select the first stable
    // event that actually satisfies the exact physical split invariant, rather
    // than letting an unrelated lower-sorted event suppress the real split.
    let reconciled: ReturnType<typeof reconcileCoreEcologyGroupMaterialized> = null;
    if (group.phase === "cohesive") {
      for (const escapeEvent of escapeEvents) {
        const escapingMember = members.find(({ actor }) => (
          actor.identity.stableId === escapeEvent.actorId
        ));
        if (escapingMember === undefined) return null;
        const candidate = reconcileCoreEcologyGroupMaterialized(group, {
          ...baseInput,
          currentEscapeCause: {
            eventId: escapeEvent.eventId,
            causeReferenceId: escapeEvent.causeReferenceId,
            memberOrdinal: escapingMember.populationOrdinal,
          },
        });
        if (candidate === null) return null;
        if (candidate.events.some(({ kind }) => kind === "group-split")) {
          reconciled = candidate;
          break;
        }
      }
    }
    reconciled ??= reconcileCoreEcologyGroupMaterialized(group, baseInput);
    if (reconciled === null) return null;
    groups.push(reconciled.group);
    transitions.push(...reconciled.events);
  }
  let groupSet;
  try {
    groupSet = createCoreEcologyGroupSet(groups);
  } catch {
    return null;
  }
  const patch = canonicalizeCoreEcologyAggregatePatch({ ...state, groups: groupSet });
  if (patch === null) return null;
  transitions.sort((left, right) => (
    left.atTick - right.atTick
    || (left.eventId < right.eventId ? -1 : left.eventId > right.eventId ? 1 : 0)
  ));
  return Object.freeze({ patch, events: Object.freeze(transitions) });
}

interface RuntimeRegionalCoreMortalitySource {
  readonly sourceKey: string;
  readonly patch: CoreEcologyAggregatePatchState;
  readonly localActorIds: readonly string[];
  readonly currentLivePreyByAttacker: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * Resolve exact current-tick contacts once for the whole active ecology root.
 * Stable attacker identity—not source iteration order—decides contention. A
 * target remains in its lineage owner, and a kill creates its one body there.
 */
function resolveRuntimeRegionalCoreMortality(
  sourcesValue: readonly RuntimeRegionalCoreMortalitySource[],
  tick: number,
): Readonly<{
  patches: ReadonlyMap<string, CoreEcologyAggregatePatchState>;
  events: readonly CoreWildlifeMortalityEvent[];
}> | null {
  const sources = [...sourcesValue].sort((left, right) => (
    compareText(left.sourceKey, right.sourceKey)
  ));
  if (new Set(sources.map(({ sourceKey }) => sourceKey)).size !== sources.length) return null;
  const sourceByKey = new Map(sources.map((source) => [source.sourceKey, source] as const));
  const patches = new Map(sources.map(({ sourceKey, patch }) => [sourceKey, patch] as const));
  const snapshots = (): readonly Readonly<{
    sourceKey: string;
    patch: CoreEcologyAggregatePatchState;
  }>[] => sources.map(({ sourceKey }) => ({ sourceKey, patch: patches.get(sourceKey)! }));
  let owners = runtimeRegionalCorePhysicalOwnerIndex(snapshots());
  if (owners === null) return null;
  const attackerIds = sources.flatMap(({ sourceKey, localActorIds }) => (
    localActorIds.filter((actorId) => {
      const owner = owners?.actors.get(actorId);
      return owner?.sourceKey === sourceKey
        && coreEcologySpeciesPredatorContact(owner.actor.identity.species) !== null;
    })
  )).sort(compareText);
  if (new Set(attackerIds).size !== attackerIds.length) return null;

  const events: CoreWildlifeMortalityEvent[] = [];
  for (const attackerId of attackerIds) {
    owners = runtimeRegionalCorePhysicalOwnerIndex(snapshots());
    if (owners === null) return null;
    const attackerOwner = owners.actors.get(attackerId);
    if (attackerOwner === undefined) continue;
    const attackerSource = sourceByKey.get(attackerOwner.sourceKey);
    const attackerPatch = patches.get(attackerOwner.sourceKey);
    const attacker = attackerPatch === undefined
      ? null
      : coreEcologyAggregatePatchActor(attackerPatch, attackerId);
    if (attackerSource === undefined || attackerPatch === undefined || attacker === null) return null;
    if (attacker.intent.kind !== "pursue") continue;
    const contact = coreEcologySpeciesPredatorContact(attacker.identity.species);
    const resource = attacker.intent.resourceReference;
    if (
      contact === null
      || resource === null
      || resource.sourceKind !== "living-actor"
      || resource.foodClass !== "live-prey"
      || !attackerSource.currentLivePreyByAttacker.get(attackerId)?.has(resource.resourceId)
    ) continue;
    const victimOwner = owners.actors.get(resource.resourceId);
    if (victimOwner === undefined) continue;
    const victimPatch = patches.get(victimOwner.sourceKey);
    const target = victimPatch === undefined
      ? null
      : coreEcologyAggregatePatchActor(victimPatch, resource.resourceId);
    if (
      victimPatch === undefined
      || target === null
      || !coreEcologyCanResolveMortalityTarget(
        attacker.identity.species,
        target.identity.species,
      )
      || coreEcologySpeciesPhysicalBodyResourceUnits(target.identity.species) <= 0
    ) continue;
    const resolved = resolveCoreWildlifePredatorContact({
      attacker,
      target,
      atTick: tick,
      contactRadiusUnits: contact.reachUnits,
      damageUnits: contact.damageUnits,
      cause: contact.cause,
    });
    if (resolved === null) continue;
    const applied = applyCoreEcologyCrossOwnerWildlifeMortality(victimPatch, {
      attackerPatch,
      result: resolved,
      // Weather-owned thermal decay is a later seam. A fresh body begins in a
      // neutral normalized condition; the contact invents no decay.
      temperature: Math.trunc(FIXED_POINT / 2),
    });
    if (applied === null) return null;
    patches.set(victimOwner.sourceKey, applied.patch);
    events.push(applied.event);
  }
  return Object.freeze({
    patches,
    events: Object.freeze(events.sort((left, right) => (
      left.atTick - right.atTick || compareText(left.eventId, right.eventId)
    ))),
  });
}

/**
 * A guard decision is only cognition until the physical resource owner accepts
 * custody. Carcass guarding therefore becomes the same bounded, ordered claim
 * proposal used by feeding without teaching the actor kernel how to mutate a
 * body or making ordinary item-guard decisions consume inventory.
 */
function runtimeCoreCarcassGuardClaims(
  patch: CoreEcologyAggregatePatchState,
  physicalOwners: RuntimeRegionalCorePhysicalOwnerIndex,
  events: readonly CoreWildlifeCausalEvent[],
): readonly CoreWildlifeResourceClaim[] {
  const claims: CoreWildlifeResourceClaim[] = [];
  for (const event of events) {
    const resource = event.resourceReference;
    const actor = coreEcologyAggregatePatchActor(patch, event.actorId);
    if (
      event.kind !== "guard"
      || resource === null
      || resource.foodClass !== "carrion"
      || resource.sourceKind !== "physical-carcass"
      || actor === null
      || actor.intent.kind !== "guard"
      || !coreEcologySpeciesCanGuardCarcass(actor.identity.species)
      || (physicalOwners.carcasses.get(resource.resourceId)?.carcass.remainingResourceUnits ?? 0) <= 0
    ) continue;
    claims.push(Object.freeze({
      eventId: event.eventId,
      actorId: event.actorId,
      resourceId: resource.resourceId,
      foodClass: resource.foodClass,
      observedAvailableUnits: resource.observedAvailableUnits,
      requestedUnits: 1,
    }));
  }
  return Object.freeze(claims.sort((left, right) => (
    compareText(left.resourceId, right.resourceId)
    || compareText(left.actorId, right.actorId)
    || compareText(left.eventId, right.eventId)
  )));
}

function stepRuntimeCoreEcology(
  state: CoreEcologyAggregatePatchState,
  world: WorldState,
  perceptionView: WorldView,
  movementView: WorldView,
  physicalCargo: PhysicalCargoState,
  settlementEcology: SettlementEcologyState,
  physicalOwners: RuntimeRegionalCorePhysicalOwnerIndex,
  observationBatches: readonly (readonly CoreEcologyObservationBatch[])[],
  localActorIdsValue: readonly string[],
  activityAuthorities: ReadonlyMap<string, CoreEcologyActivityAuthorityV1>,
): Readonly<{
  /** Cognition-complete, pre-mortality and pre-locomotion owner snapshot. */
  patch: CoreEcologyAggregatePatchState;
  events: readonly CoreWildlifeCausalEvent[];
  groupEvents: readonly CoreEcologyGroupTransitionEvent[];
  resourceClaims: readonly CoreWildlifeResourceClaim[];
  currentLivePreyByAttacker: ReadonlyMap<string, ReadonlySet<string>>;
  localActorIds: readonly string[];
  activityAuthorities: ReadonlyMap<string, CoreEcologyActivityAuthorityV1>;
}> | null {
  const materializedActorIds = state.populations.flatMap(({ members }) => members)
    .filter(({ materialization }) => materialization === "materialized")
    .map(({ actor }) => actor.identity.stableId);
  const materializedActorIdSet = new Set(materializedActorIds);
  const localActorIds = new Set(localActorIdsValue);
  if (
    localActorIds.size !== localActorIdsValue.length
    || localActorIdsValue.some((actorId) => !materializedActorIdSet.has(actorId))
  ) return null;
  const actorSteps: Array<{
    actorId: string;
    observations: readonly ActorObservation[];
    foodOpportunities: readonly CoreWildlifeFoodOpportunity[];
    accessibility: typeof CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE;
    neutralActivityPreference?: CoreWildlifeNeutralActivityPreference;
    regroupOpportunity?: CoreWildlifeRegroupOpportunity;
  }> = [];
  for (const { actor } of state.populations.flatMap(({ members }) => members)
    .filter(({ materialization }) => materialization === "materialized")) {
    if (!localActorIds.has(actor.identity.stableId)) {
      // Atomic group admission may retain an exact body just beyond this
      // regional frame. Age it without inventing perception, resources, or
      // movement until its segmented address re-enters a loaded frame.
      actorSteps.push({
        actorId: actor.identity.stableId,
        observations: Object.freeze([]),
        foodOpportunities: Object.freeze([]),
        accessibility: RUNTIME_CORE_OFF_FRAME_ACTION_ACCESSIBILITY,
        neutralActivityPreference: "observe",
      });
      continue;
    }
    const sharedObservations = mergeRuntimeCoreObservationBatches(
      actor.identity.stableId,
      observationBatches,
    );
    const food = runtimeCoreFoodEvidence(
      actor,
      physicalCargo,
      physicalOwners,
      settlementEcology,
      perceptionView,
      world.meta.completedTick,
    );
    if (sharedObservations === null || food === null) return null;
    const observations = canonicalizeActorObservations([
      ...sharedObservations,
      ...food.observations,
    ]);
    if (observations.length !== sharedObservations.length + food.observations.length) return null;
    const livingFood = runtimeCoreLivingFoodOpportunities(
      actor,
      sharedObservations,
      physicalOwners,
    );
    const foodOpportunities = [
      // A currently seen living target remains actionable even when a dense
      // spill reaches the bounded physical-food cap.
      ...livingFood,
      ...food.opportunities,
    ].slice(0, CORE_WILDLIFE_MAX_FOOD_OPPORTUNITIES);
    const reachableFood = runtimeCoreReachableFoodOpportunities(
      actor,
      observations,
      foodOpportunities,
      movementView,
      world.meta.completedTick,
    );
    const accessibility = runtimeCoreActionAccessibility(
      actor,
      movementView,
      world.meta.completedTick,
    );
    const ownsActivity = coreEcologySpeciesHasBoundedActivityProjection(
      actor.identity.species,
    );
    const authority = activityAuthorities.get(actor.identity.stableId);
    const activity = ownsActivity
      ? projectCoreEcologyActivity(state, {
          actorId: actor.identity.stableId,
          atTick: world.meta.completedTick,
        }, authority)
      : null;
    if (
      reachableFood === null
      || accessibility === null
      || (ownsActivity && activity === null)
    ) return null;
    const regroupOpportunity = runtimeCoreRegroupOpportunity(
      state,
      actor,
      observations,
      world.meta.completedTick,
    );
    actorSteps.push({
      actorId: actor.identity.stableId,
      observations,
      foodOpportunities: reachableFood,
      accessibility,
      ...(regroupOpportunity === undefined ? {} : { regroupOpportunity }),
      ...(activity?.preferredNeutralIntent === null || activity === null
        ? {}
        : { neutralActivityPreference: activity.preferredNeutralIntent }),
    });
  }
  let stepped = stepCoreEcologyAggregatePatch(state, {
    tick: world.meta.completedTick,
    actorSteps,
  });
  if (stepped === null) return null;
  const currentLivePreyByAttacker = new Map<string, ReadonlySet<string>>(
    actorSteps.map(({ actorId, foodOpportunities }) => [
      actorId,
      new Set(foodOpportunities.flatMap((opportunity) => (
        opportunity.sourceKind === "living-actor"
        && opportunity.foodClass === "live-prey"
          ? [opportunity.resourceId]
          : []
      ))),
    ]),
  );
  let cognitionPatch: CoreEcologyAggregatePatchState | null = null;
  for (let refinement = 0; refinement <= CORE_WILDLIFE_INTENTS.length; refinement += 1) {
    const locomotion = resolveRuntimeCoreLocomotion(
      stepped.patch,
      movementView,
      world.meta.completedTick,
      localActorIds,
      activityAuthorities,
    );
    if (locomotion === null) return null;
    if (locomotion.blocked.length === 0) {
      cognitionPatch = stepped.patch;
      break;
    }
    let changed = false;
    for (const blocked of locomotion.blocked) {
      // Disengagement ends an exhausted pursuit even when terrain leaves no
      // physical escape route; unlike flee/retreat it is not policy-gated.
      if (blocked.intent === "disengage") continue;
      const actorStep = actorSteps.find(({ actorId }) => actorId === blocked.actorId);
      if (actorStep === undefined || !actorStep.accessibility[blocked.intent]) continue;
      actorStep.accessibility = Object.freeze({
        ...actorStep.accessibility,
        [blocked.intent]: false,
      });
      changed = true;
    }
    if (!changed) {
      if (locomotion.blocked.some(({ intent }) => intent !== "disengage")) return null;
      cognitionPatch = stepped.patch;
      break;
    }
    stepped = stepCoreEcologyAggregatePatch(state, {
      tick: world.meta.completedTick,
      actorSteps,
    });
    if (stepped === null) return null;
  }
  if (cognitionPatch === null) return null;
  return Object.freeze({
    patch: cognitionPatch,
    events: stepped.events,
    groupEvents: stepped.groupEvents,
    resourceClaims: stepped.resourceClaims,
    currentLivePreyByAttacker,
    localActorIds: Object.freeze([...localActorIds].sort(compareText)),
    activityAuthorities,
  });
}

interface RuntimeCoreEcologyFinishedStep {
  readonly patch: CoreEcologyAggregatePatchState;
  readonly events: readonly CoreWildlifeCausalEvent[];
  readonly groupEvents: readonly CoreEcologyGroupTransitionEvent[];
  readonly resourceClaims: readonly CoreWildlifeResourceClaim[];
}

/**
 * Finish one owner only after root-wide mortality has committed. The dry-run
 * in the cognition phase already proved its selected movement is traversable;
 * mortality may remove a target or alter health, but cannot authorize a new
 * path or move a body before its contact is resolved.
 */
function finishRuntimeCoreEcologyStep(
  prepared: NonNullable<ReturnType<typeof stepRuntimeCoreEcology>>,
  stateAfterMortality: CoreEcologyAggregatePatchState,
  movementView: WorldView,
  tick: number,
  physicalOwners: RuntimeRegionalCorePhysicalOwnerIndex,
  validateAcceptedPatch: (
    patch: CoreEcologyAggregatePatchState,
  ) => CoreEcologyAggregatePatchState | null,
): RuntimeCoreEcologyFinishedStep | null {
  const locomotion = resolveRuntimeCoreLocomotion(
    stateAfterMortality,
    movementView,
    tick,
    new Set(prepared.localActorIds),
    prepared.activityAuthorities,
  );
  if (locomotion === null || locomotion.blocked.some(({ intent }) => intent !== "disengage")) {
    return null;
  }
  const reconciledGroups = reconcileRuntimeCoreMaterializedGroups(
    locomotion.patch,
    prepared.events,
    tick,
  );
  if (reconciledGroups === null) return null;
  const tidalPatch = coreEcologyPatchHasTidalTableAuthority(reconciledGroups.patch)
    ? stepCoreEcologyTidalTable(reconciledGroups.patch, { atTick: tick })?.patch ?? null
    : reconciledGroups.patch;
  if (tidalPatch === null) return null;
  const canonical = validateAcceptedPatch(tidalPatch);
  if (canonical === null) return null;
  const groupEvents = [
    ...prepared.groupEvents,
    ...reconciledGroups.events,
  ].sort((left, right) => (
    left.atTick - right.atTick || compareText(left.eventId, right.eventId)
  ));
  return Object.freeze({
    patch: canonical,
    events: prepared.events,
    groupEvents: Object.freeze(groupEvents),
    resourceClaims: Object.freeze([
      ...prepared.resourceClaims,
      ...runtimeCoreCarcassGuardClaims(canonical, physicalOwners, prepared.events),
    ]),
  });
}

function runtimeCoreCarcassContactDistance(
  actor: CoreWildlifeActorState,
  carcass: CoreWildlifeCarcass,
): bigint | null {
  let delta: Readonly<{ x: number; y: number }>;
  try {
    delta = worldPositionDelta(actor.address.position, carcass.deathPosition);
  } catch {
    return null;
  }
  const squared = BigInt(delta.x) * BigInt(delta.x) + BigInt(delta.y) * BigInt(delta.y);
  const reach = BigInt(Math.min(
    carcass.bodySizeUnits * 100,
    WORLD_POSITION_UNITS_PER_TILE,
  ));
  return squared <= reach * reach ? squared : null;
}

function runtimeCoreResourceClaimContenders(
  patch: CoreEcologyAggregatePatchState,
  physicalOwners: RuntimeRegionalCorePhysicalOwnerIndex,
  physicalCargo: PhysicalCargoState,
  settlementEcology: SettlementEcologyState,
  claims: readonly CoreWildlifeResourceClaim[],
): readonly CoreWildlifeResourceClaimContender[] | null {
  const contenders: CoreWildlifeResourceClaimContender[] = [];
  for (const claim of claims) {
    const actor = coreEcologyAggregatePatchActor(patch, claim.actorId);
    if (actor === null) continue;
    if (claim.foodClass === "carrion") {
      const carcass = physicalOwners.carcasses.get(claim.resourceId)?.carcass;
      const contactDistance = carcass === undefined
        ? null
        : runtimeCoreCarcassContactDistance(actor, carcass);
      const resource = actor.intent.resourceReference;
      const intendsToFeed = actor.intent.kind === "scavenge"
        && coreEcologySpeciesCanFeedFromCarcass(actor.identity.species);
      const intendsToGuard = actor.intent.kind === "guard"
        && coreEcologySpeciesCanGuardCarcass(actor.identity.species);
      if (
        carcass === undefined
        || contactDistance === null
        || (!intendsToFeed && !intendsToGuard)
        || resource?.resourceId !== carcass.carcassId
        || resource.foodClass !== "carrion"
        || resource.sourceKind !== "physical-carcass"
      ) continue;
      contenders.push(Object.freeze({
        version: CORE_WILDLIFE_RESOURCE_CLAIM_ARBITRATION_VERSION,
        claim,
        contactDistance,
        needPressure: actor.needs.hunger,
      }));
      continue;
    }
    const located = locatePhysicalCargoEntity(physicalCargo, claim.resourceId);
    if (located === null) {
      const custody = settlementEcology.domesticCustodies.find(({ memberActorIds }) => (
        memberActorIds.includes(actor.identity.stableId)
      ));
      if (
        custody === undefined
        || claim.resourceId !== settlementEcology.identity.foodLotId
      ) continue;
      let contactDelta: Readonly<{ x: number; y: number }>;
      try {
        contactDelta = worldPositionDelta(
          actor.address.position,
          settlementEcology.identity.position,
        );
      } catch {
        continue;
      }
      const accessReachUnits = Math.min(
        custody.homeStructure.radiusUnits,
        CORE_ECOLOGY_DOMESTIC_STORE_ACCESS_REACH_UNITS,
      );
      const contactDistance = BigInt(contactDelta.x) * BigInt(contactDelta.x)
        + BigInt(contactDelta.y) * BigInt(contactDelta.y);
      if (contactDistance > BigInt(accessReachUnits) * BigInt(accessReachUnits)) continue;
      contenders.push(Object.freeze({
        version: CORE_WILDLIFE_RESOURCE_CLAIM_ARBITRATION_VERSION,
        claim,
        contactDistance,
        needPressure: actor.needs.hunger,
      }));
      continue;
    }
    if (
      located.entity.payload.kind !== "provision"
      || located.entity.payload.quantity !== claim.requestedUnits
    ) continue;
    const looseUnitsPerWorldUnit = LOOSE_CARGO_TILE_UNITS / WORLD_POSITION_UNITS_PER_TILE;
    if (!Number.isSafeInteger(looseUnitsPerWorldUnit) || looseUnitsPerWorldUnit <= 0) return null;
    const looseScale = BigInt(looseUnitsPerWorldUnit);
    const actorX = (
      (BigInt(actor.address.position.region.x) - BigInt(located.world.region.x))
        * BigInt(REGION_WIDTH_UNITS)
      + BigInt(actor.address.position.localX)
    ) * looseScale;
    const actorY = (
      (BigInt(actor.address.position.region.y) - BigInt(located.world.region.y))
        * BigInt(REGION_HEIGHT_UNITS)
      + BigInt(actor.address.position.localY)
    ) * looseScale;
    const contactDistance = bigintAbs(actorX - BigInt(located.entity.x))
      + bigintAbs(actorY - BigInt(located.entity.y));
    if (contactDistance > BigInt(CORE_ECOLOGY_CONTACT_REACH_LOOSE_UNITS)) continue;
    contenders.push(Object.freeze({
      version: CORE_WILDLIFE_RESOURCE_CLAIM_ARBITRATION_VERSION,
      claim,
      contactDistance,
      needPressure: actor.needs.hunger,
    }));
  }
  return orderCoreWildlifeResourceClaimContenders(contenders);
}

function resolveRuntimeCoreNonCarcassResourceClaims(
  state: CoreEcologyAggregatePatchState,
  physicalOwners: RuntimeRegionalCorePhysicalOwnerIndex,
  cargoState: PhysicalCargoState,
  settlementState: SettlementEcologyState,
  claims: readonly CoreWildlifeResourceClaim[],
  world: WorldState,
  bio0: Bio0EcologyState,
  validateAcceptedPatch: (
    patch: CoreEcologyAggregatePatchState,
  ) => CoreEcologyAggregatePatchState | null = (patch) => (
    canonicalRuntimeCoreEcology(patch, world, bio0)
  ),
): Readonly<{
  patch: CoreEcologyAggregatePatchState;
  physicalCargo: PhysicalCargoState;
  settlementEcology: SettlementEcologyState;
  consumed: readonly Readonly<{
    actorId: string;
    resourceId: string;
    source: "loose-parcel" | "settlement-store" | "wildlife-carcass";
  }>[];
}> | null {
  let patch = state;
  let physicalCargo = cargoState;
  let settlementEcology = settlementState;
  const consumed: Array<Readonly<{
    actorId: string;
    resourceId: string;
    source: "loose-parcel" | "settlement-store" | "wildlife-carcass";
  }>> = [];
  const orderedContenders = runtimeCoreResourceClaimContenders(
    patch,
    physicalOwners,
    physicalCargo,
    settlementEcology,
    claims,
  );
  if (orderedContenders === null) return null;
  for (const { claim } of orderedContenders) {
    if (claim.foodClass === "carrion") continue;
    const actor = coreEcologyAggregatePatchActor(patch, claim.actorId);
    if (actor === null) continue;
    const located = locatePhysicalCargoEntity(physicalCargo, claim.resourceId);
    if (located === null) {
      const custody = settlementEcology.domesticCustodies.find(({ memberActorIds }) => (
        memberActorIds.includes(actor.identity.stableId)
      ));
      if (
        custody === undefined
        || claim.resourceId !== settlementEcology.identity.foodLotId
      ) continue;
      let contactDelta: Readonly<{ x: number; y: number }>;
      try {
        contactDelta = worldPositionDelta(
          actor.address.position,
          settlementEcology.identity.position,
        );
      } catch {
        continue;
      }
      const domesticAccessReachUnits = Math.min(
        custody.homeStructure.radiusUnits,
        CORE_ECOLOGY_DOMESTIC_STORE_ACCESS_REACH_UNITS,
      );
      const contactDistanceSquared = BigInt(contactDelta.x) * BigInt(contactDelta.x)
        + BigInt(contactDelta.y) * BigInt(contactDelta.y);
      const domesticAccessReachSquared = BigInt(domesticAccessReachUnits)
        * BigInt(domesticAccessReachUnits);
      if (
        contactDistanceSquared > domesticAccessReachSquared
      ) continue;
      const staged = stageSettlementDomesticFoodUse(settlementEcology, {
        version: SETTLEMENT_DOMESTIC_FOOD_USE_VERSION,
        storeId: settlementEcology.identity.storeId,
        foodLotId: settlementEcology.identity.foodLotId,
        relationshipId: custody.relationshipId,
        memberActorId: actor.identity.stableId,
        requestedQuantity: 1,
        causeEventId: claim.eventId,
        causeEventTick: world.meta.completedTick,
      });
      if (staged === null) continue;
      const resolved = resolveSettlementDomesticFoodUse(staged.state, staged.transaction);
      if (resolved === null) return null;
      if (!resolved.applied) continue;
      settlementEcology = resolved.state;
      try {
        patch = replaceCoreEcologyAggregatePatchActor(patch, replaceCoreWildlifeActorPhysiology(actor, {
          atTick: world.meta.completedTick,
          condition: actor.condition,
          needs: {
            ...actor.needs,
            hunger: Math.max(0, actor.needs.hunger - 360_000),
          },
        }));
      } catch {
        return null;
      }
      consumed.push(Object.freeze({
        actorId: actor.identity.stableId,
        resourceId: claim.resourceId,
        source: "settlement-store",
      }));
      continue;
    }
    if (located.entity.payload.kind !== "provision") continue;
    // This first integration owns unit parcels. Refuse to erase a multi-unit
    // stack until physical splitting is represented as its own transaction.
    if (located.entity.payload.quantity !== claim.requestedUnits) continue;
    const looseUnitsPerWorldUnit = LOOSE_CARGO_TILE_UNITS / WORLD_POSITION_UNITS_PER_TILE;
    if (!Number.isSafeInteger(looseUnitsPerWorldUnit) || looseUnitsPerWorldUnit <= 0) return null;
    const looseScale = BigInt(looseUnitsPerWorldUnit);
    const actorXInOwnerRegionExact = (
      (BigInt(actor.address.position.region.x) - BigInt(located.world.region.x))
        * BigInt(REGION_WIDTH_UNITS)
      + BigInt(actor.address.position.localX)
    ) * looseScale;
    const actorYInOwnerRegionExact = (
      (BigInt(actor.address.position.region.y) - BigInt(located.world.region.y))
        * BigInt(REGION_HEIGHT_UNITS)
      + BigInt(actor.address.position.localY)
    ) * looseScale;
    const contactDistanceExact = (
      bigintAbs(actorXInOwnerRegionExact - BigInt(located.entity.x))
      + bigintAbs(actorYInOwnerRegionExact - BigInt(located.entity.y))
    );
    if (contactDistanceExact > BigInt(CORE_ECOLOGY_CONTACT_REACH_LOOSE_UNITS)) continue;
    const actorXInOwnerRegion = Number(actorXInOwnerRegionExact);
    const actorYInOwnerRegion = Number(actorYInOwnerRegionExact);
    if (!Number.isSafeInteger(actorXInOwnerRegion) || !Number.isSafeInteger(actorYInOwnerRegion)) {
      return null;
    }
    const actorContactX = clamp(
      actorXInOwnerRegion,
      0,
      located.world.width * LOOSE_CARGO_TILE_UNITS - 1,
    );
    const actorContactY = clamp(
      actorYInOwnerRegion,
      0,
      located.world.height * LOOSE_CARGO_TILE_UNITS - 1,
    );
    const result = consumeLooseCargoProvisionEntity(located.world, {
      actorId: actor.identity.stableId,
      entityId: located.entity.id,
      // The lower transaction receives the actor's locus expressed in this
      // parcel owner's regional coordinates. At a region seam its half-open
      // boundary is clamped by one physical unit only after the segmented
      // world-distance proof above succeeds.
      x: actorContactX,
      y: actorContactY,
      reach: CORE_ECOLOGY_CONTACT_REACH_LOOSE_UNITS,
    });
    if (!result.ok || result.removedPayload === null) {
      if (result.reason === "out-of-reach" || result.reason === "entity-not-found") continue;
      return null;
    }
    try {
      physicalCargo = commitPhysicalCargoRegionalMutation(physicalCargo, {
        looseWorld: result.world,
        carrier: physicalCargo.carrier,
      }, {
        kind: "delta",
        removed: [result.removedPayload],
        added: [],
      });
      patch = replaceCoreEcologyAggregatePatchActor(patch, replaceCoreWildlifeActorPhysiology(actor, {
        atTick: world.meta.completedTick,
        condition: actor.condition,
        needs: {
          ...actor.needs,
          hunger: Math.max(0, actor.needs.hunger - 360_000),
        },
      }));
    } catch {
      return null;
    }
    consumed.push(Object.freeze({
      actorId: actor.identity.stableId,
      resourceId: claim.resourceId,
      source: "loose-parcel",
    }));
  }
  const canonical = validateAcceptedPatch(patch);
  return canonical === null ? null : Object.freeze({
    patch: canonical,
    physicalCargo,
    settlementEcology,
    consumed: Object.freeze(consumed),
  });
}

interface RuntimeRegionalCoreResourceSource {
  readonly sourceKey: string;
  readonly patch: CoreEcologyAggregatePatchState;
  readonly claims: readonly CoreWildlifeResourceClaim[];
  readonly validateAcceptedPatch: (
    patch: CoreEcologyAggregatePatchState,
  ) => CoreEcologyAggregatePatchState | null;
}

/**
 * Resource ownership is global even though animal state is region-owned. All
 * contenders therefore enter one deterministic arbitration order before any
 * parcel/store/body mutation is committed.
 */
function resolveRuntimeRegionalCoreResourceClaims(
  sourcesValue: readonly RuntimeRegionalCoreResourceSource[],
  cargoState: PhysicalCargoState,
  settlementState: SettlementEcologyState,
  world: WorldState,
  bio0: Bio0EcologyState,
): Readonly<{
  patches: ReadonlyMap<string, CoreEcologyAggregatePatchState>;
  physicalCargo: PhysicalCargoState;
  settlementEcology: SettlementEcologyState;
  consumed: readonly Readonly<{
    actorId: string;
    resourceId: string;
    source: "loose-parcel" | "settlement-store" | "wildlife-carcass";
    ownerSourceKey: string;
  }>[];
}> | null {
  const sources = [...sourcesValue].sort((left, right) => (
    compareText(left.sourceKey, right.sourceKey)
  ));
  if (new Set(sources.map(({ sourceKey }) => sourceKey)).size !== sources.length) return null;

  const patches = new Map<string, CoreEcologyAggregatePatchState>();
  const sourceByKey = new Map<string, RuntimeRegionalCoreResourceSource>();
  let physicalCargo = cargoState;
  let settlementEcology = settlementState;
  for (const source of sources) {
    patches.set(source.sourceKey, source.patch);
    sourceByKey.set(source.sourceKey, source);
  }
  const snapshots = (): readonly Readonly<{
    sourceKey: string;
    patch: CoreEcologyAggregatePatchState;
  }>[] => sources.map(({ sourceKey }) => ({
    sourceKey,
    patch: patches.get(sourceKey)!,
  }));
  let physicalOwners = runtimeRegionalCorePhysicalOwnerIndex(snapshots());
  if (physicalOwners === null) return null;

  // Body custody is root-wide. A claimant may lawfully live in a different
  // regional owner, so stale claims are checked against one global actor
  // index and released only in the patch that physically owns the carcass.
  for (const source of sources) {
    let patch = patches.get(source.sourceKey);
    if (patch === undefined) return null;
    for (const carcass of [...patch.carcasses].sort((left, right) => (
      compareText(left.carcassId, right.carcassId)
    ))) {
      const claimantId = carcass.currentClaimantActorId;
      if (claimantId === null) continue;
      const claimant = physicalOwners.actors.get(claimantId)?.actor ?? null;
      const resource = claimant?.intent.resourceReference;
      const remainsLawful = claimant !== null
        && coreEcologySpeciesCanGuardCarcass(claimant.identity.species)
        && (claimant.intent.kind === "scavenge" || claimant.intent.kind === "guard")
        && resource?.resourceId === carcass.carcassId
        && resource.foodClass === "carrion"
        && resource.sourceKind === "physical-carcass"
        && runtimeCoreCarcassContactDistance(claimant, carcass) !== null;
      if (remainsLawful) continue;
      const released = releaseCoreWildlifeCarcass(carcass, {
        actorId: claimantId,
        atTick: world.meta.completedTick,
      });
      if (released === null) return null;
      const candidate = replaceCoreEcologyAggregatePatchCarcass(patch, released);
      if (candidate === null) return null;
      const accepted = source.validateAcceptedPatch(candidate);
      if (accepted === null) return null;
      patch = accepted;
    }
    patches.set(source.sourceKey, patch);
  }
  physicalOwners = runtimeRegionalCorePhysicalOwnerIndex(snapshots());
  if (physicalOwners === null) return null;

  const globalContenders: CoreWildlifeResourceClaimContender[] = [];
  for (const source of sources) {
    const patch = patches.get(source.sourceKey);
    if (patch === undefined) return null;
    const contenders = runtimeCoreResourceClaimContenders(
      patch,
      physicalOwners,
      physicalCargo,
      settlementEcology,
      source.claims,
    );
    if (contenders === null) return null;
    globalContenders.push(...contenders);
  }
  const ordered = orderCoreWildlifeResourceClaimContenders(globalContenders);
  if (ordered === null) return null;

  const consumed: Array<{
    actorId: string;
    resourceId: string;
    source: "loose-parcel" | "settlement-store" | "wildlife-carcass";
    ownerSourceKey: string;
  }> = [];
  for (const { claim } of ordered) {
    physicalOwners = runtimeRegionalCorePhysicalOwnerIndex(snapshots());
    if (physicalOwners === null) return null;
    const actorOwner = physicalOwners.actors.get(claim.actorId);
    if (actorOwner === undefined) return null;
    const actorSource = sourceByKey.get(actorOwner.sourceKey);
    const actorPatch = patches.get(actorOwner.sourceKey);
    if (actorSource === undefined || actorPatch === undefined) return null;

    if (claim.foodClass === "carrion") {
      const bodyOwner = physicalOwners.carcasses.get(claim.resourceId);
      if (bodyOwner === undefined) continue;
      const bodySource = sourceByKey.get(bodyOwner.sourceKey);
      const bodyPatch = patches.get(bodyOwner.sourceKey);
      const actor = coreEcologyAggregatePatchActor(actorPatch, claim.actorId);
      const carcass = bodyPatch?.carcasses.find(({ carcassId }) => (
        carcassId === claim.resourceId
      ));
      if (bodySource === undefined || bodyPatch === undefined || actor === null || carcass === undefined) {
        return null;
      }
      const resource = actor.intent.resourceReference;
      const guarding = actor.intent.kind === "guard"
        && coreEcologySpeciesCanGuardCarcass(actor.identity.species);
      const feeding = actor.intent.kind === "scavenge"
        && coreEcologySpeciesCanFeedFromCarcass(actor.identity.species);
      if (
        runtimeCoreCarcassContactDistance(actor, carcass) === null
        || (!guarding && !feeding)
        || resource?.resourceId !== carcass.carcassId
        || resource.foodClass !== "carrion"
        || resource.sourceKind !== "physical-carcass"
      ) continue;
      const claimed = carcass.currentClaimantActorId === actor.identity.stableId
        ? carcass
        : claimCoreWildlifeCarcass(carcass, {
            actorId: actor.identity.stableId,
            provenanceId: claim.eventId,
            atTick: world.meta.completedTick,
          });
      if (claimed === null) continue;
      let nextCarcass = claimed;
      if (feeding) {
        const fed = consumeCoreWildlifeCarcass(nextCarcass, {
          actorId: actor.identity.stableId,
          units: 1,
          atTick: world.meta.completedTick,
        });
        if (fed === null) return null;
        nextCarcass = fed;
        if (
          nextCarcass.remainingResourceUnits > 0
          && !coreEcologySpeciesCanGuardCarcass(actor.identity.species)
        ) {
          const released = releaseCoreWildlifeCarcass(nextCarcass, {
            actorId: actor.identity.stableId,
            atTick: world.meta.completedTick,
          });
          if (released === null) return null;
          nextCarcass = released;
        }
      }
      const bodyCandidate = replaceCoreEcologyAggregatePatchCarcass(
        bodyPatch,
        nextCarcass,
      );
      if (bodyCandidate === null) return null;
      if (guarding) {
        const acceptedBody = bodySource.validateAcceptedPatch(bodyCandidate);
        if (acceptedBody === null) return null;
        patches.set(bodyOwner.sourceKey, acceptedBody);
        continue;
      }
      let fedActor: CoreWildlifeActorState;
      try {
        fedActor = replaceCoreWildlifeActorPhysiology(actor, {
          atTick: world.meta.completedTick,
          condition: actor.condition,
          needs: {
            ...actor.needs,
            hunger: Math.max(0, actor.needs.hunger - 360_000),
          },
        });
      } catch {
        return null;
      }
      if (actorOwner.sourceKey === bodyOwner.sourceKey) {
        let combined: CoreEcologyAggregatePatchState;
        try {
          combined = replaceCoreEcologyAggregatePatchActor(bodyCandidate, fedActor);
        } catch {
          return null;
        }
        const accepted = actorSource.validateAcceptedPatch(combined);
        if (accepted === null) return null;
        patches.set(actorOwner.sourceKey, accepted);
      } else {
        let actorCandidate: CoreEcologyAggregatePatchState;
        try {
          actorCandidate = replaceCoreEcologyAggregatePatchActor(actorPatch, fedActor);
        } catch {
          return null;
        }
        // Validate both immutable candidates before committing either owner.
        // A rejected second owner cannot leave half a meal in authoritative state.
        const acceptedBody = bodySource.validateAcceptedPatch(bodyCandidate);
        const acceptedActor = actorSource.validateAcceptedPatch(actorCandidate);
        if (acceptedBody === null || acceptedActor === null) return null;
        patches.set(bodyOwner.sourceKey, acceptedBody);
        patches.set(actorOwner.sourceKey, acceptedActor);
      }
      consumed.push(Object.freeze({
        actorId: actor.identity.stableId,
        resourceId: claim.resourceId,
        source: "wildlife-carcass",
        ownerSourceKey: bodyOwner.sourceKey,
      }));
      continue;
    }

    const resolved = resolveRuntimeCoreNonCarcassResourceClaims(
      actorPatch,
      physicalOwners,
      physicalCargo,
      settlementEcology,
      [claim],
      world,
      bio0,
      actorSource.validateAcceptedPatch,
    );
    if (resolved === null) return null;
    patches.set(actorOwner.sourceKey, resolved.patch);
    physicalCargo = resolved.physicalCargo;
    settlementEcology = resolved.settlementEcology;
    consumed.push(...resolved.consumed.map((entry) => ({
      ...entry,
      ownerSourceKey: actorOwner.sourceKey,
    })));
  }
  return Object.freeze({
    patches,
    physicalCargo,
    settlementEcology,
    consumed: Object.freeze(consumed),
  });
}

function createRuntimePorterResponse(ecology: Bio0EcologyState): PorterResponseState {
  return createPorterResponseState(ecology.porterAddress.actorId, ecology.tick);
}

function canonicalRuntimePorterResponse(
  value: unknown,
  ecology: Bio0EcologyState,
  world: WorldState,
): PorterResponseState | null {
  const state = canonicalizePorterResponseState(value);
  return state !== null
    && state.actorId === ecology.porterAddress.actorId
    && state.tick === world.meta.completedTick
    && stableStringify(state) === stableStringify(value)
    ? state
    : null;
}

function createRuntimeLivingActorPlayerChoice(): LivingActorPlayerChoiceState {
  return createLivingActorPlayerChoiceState(LOCAL_PLAYER_SUBJECT_ID);
}

function canonicalRuntimeLivingActorPlayerChoice(
  value: unknown,
  world: WorldState,
): LivingActorPlayerChoiceState | null {
  const state = canonicalizeLivingActorPlayerChoiceState(value);
  return state !== null
    && state.playerId === LOCAL_PLAYER_SUBJECT_ID
    && state.events.every(({ tick }) => tick <= world.meta.completedTick)
    && stableStringify(state) === stableStringify(value)
    ? state
    : null;
}

function runtimeLivingActorPerceptionCells(world: WorldView): readonly PerceptionCell[] {
  const occupied = new Set(world.settlements.map(({ tileIndex }) => tileIndex));
  return world.terrain.tiles.map((tile, index) => ({
    elevation: tile.elevation / FIXED_POINT,
    obstruction: occupied.has(index)
      ? 0.72
      : tile.terrain === "ridge"
        ? 0.76
        : tile.terrain === "marsh"
          ? 0.34
          : tile.terrain === "meadow" && tile.roughness >= 880_000
            ? 0.5
            : 0,
  }));
}

function runtimePorterDogVisualObservations(
  world: WorldView,
  window: RegionalPlayerTravelState["window"],
  porterAddress: Bio0PorterAddress,
  dogAddress: LivingActorAddress,
  tick: number,
  knownWorksiteFocus: LivingActorAddress["position"] | null = null,
): readonly ActorObservation[] | null {
  const observer = livingActorAddressInRegionalWindow(porterAddress, window);
  const subject = livingActorAddressInRegionalWindow(dogAddress, window);
  // An actor outside the currently materialized sensory window is a lawful
  // absence of evidence, not a malformed frame. Never flatten a remote dog
  // into this local view merely because the keeper relationship is known.
  if (observer === null || subject === null) return Object.freeze([]);
  const targetTile = world.terrain.tiles[subject.tileIndex];
  if (targetTile === undefined) return null;
  const targetLightVisibility = targetTile.terrain === "marsh"
    ? 0.55
    : targetTile.terrain === "ridge" || targetTile.terrain === "deep-water"
      ? 0.9
      : 0.72;
  let observerFacingRadians = headingToRadians(porterAddress.heading);
  if (knownWorksiteFocus !== null) {
    try {
      const delta = worldPositionDelta(porterAddress.position, knownWorksiteFocus);
      observerFacingRadians = Math.atan2(delta.y, delta.x);
    } catch {
      return Object.freeze([]);
    }
  }
  const sight = evaluateVisualContact({
    columns: world.terrain.width,
    rows: world.terrain.height,
    cells: runtimeLivingActorPerceptionCells(world),
    observerTileIndex: observer.tileIndex,
    targetTileIndex: subject.tileIndex,
    observerFacingRadians,
    weatherVisibility: clamp(1 - world.weather.intensity / FIXED_POINT * 0.52, 0, 1),
    ...(knownWorksiteFocus === null ? {} : {
      detailRangeOverrides: {
        closePeripheralRange: 2,
        directSightRange: SETTLEMENT_KEEPER_WORKSITE_DIRECT_SIGHT_RANGE_TILES,
        forwardConeRadians: (5 * Math.PI) / 9,
      },
    }),
    // A keeper deliberately checking the known worksite can pick out the
    // returning dog's gait/posture; ordinary incidental dog visibility keeps
    // the neutral salience used elsewhere.
    targetMovementSalience: knownWorksiteFocus === null ? 0 : 0.5,
    targetLightVisibility,
  });
  if (sight === null) return Object.freeze([]);
  const confidence = clamp(Math.round(sight.confidence * FIXED_POINT), 0, FIXED_POINT);
  const identityEligible = sight.identityEligible;
  return collectLivingActorVisualContactObservations({
    version: LIVING_ACTOR_VISUAL_CONTACT_VERSION,
    observer: porterAddress,
    tick,
    contacts: [{
      version: LIVING_ACTOR_VISUAL_CONTACT_VERSION,
      evidenceId: `bio0-visual:${hashCanonical({
        dogActorId: dogAddress.actorId,
        observerActorId: porterAddress.actorId,
        tick,
      })}`,
      perceivedClass: identityEligible ? "domestic-dog" : "animal-silhouette",
      subject: dogAddress,
      lineOfSight: sight.grade === VISIBILITY_DIRECT ? "clear" : "partial",
      confidence,
      salience: Math.max(confidence, identityEligible ? 650_000 : 0),
      identityEligible,
    }],
  });
}

function runtimeBio0FoodContactAccessible(
  ecology: Bio0EcologyState,
  porterAddress: Bio0PorterAddress,
): boolean {
  try {
    const delta = worldPositionDelta(ecology.dog.address.position, porterAddress.position);
    const squared = BigInt(delta.x) * BigInt(delta.x) + BigInt(delta.y) * BigInt(delta.y);
    return squared <= BigInt(BIO0_FOOD_CONTACT_RANGE_UNITS) ** 2n;
  } catch {
    return false;
  }
}

function runtimePorterResponseAccessibility(
  fullSimulation: boolean,
  offerFood: boolean,
): PorterResponseAccessibility {
  return Object.freeze({
    "secure-food": fullSimulation,
    reroute: fullSimulation,
    leave: fullSimulation,
    "offer-food": fullSimulation && offerFood,
    "wait-observe": true,
  });
}

function runtimePorterResponseInput(
  current: PorterResponseState,
  porter: RuntimeBio0Porter,
  ecology: Bio0EcologyState,
  weather: WeatherState,
  fullSimulation: boolean,
  tick: number,
): PorterResponseInput | null {
  const canonical = canonicalizePorterResponseState(current);
  if (
    canonical === null
    || canonical.actorId !== porter.address.actorId
    || canonical.tick > tick
    || porter.resident.perception.tick !== tick
  ) return null;
  const exposure = bio0ExposureFromCompletedWeather(weather);
  return {
    version: PORTER_RESPONSE_VERSION,
    tick,
    perception: porter.resident.perception,
    cargo: ecology.cargo,
    packContainerId: ecology.foodSource.providerContainerId,
    weather: {
      rainIntensity: exposure.rain,
      coldPressure: exposure.ambientCold,
      windPressure: exposure.wind,
    },
    needs: porter.resident.needs,
    disposition: {
      traits: porter.resident.traits,
      temperament: porter.resident.identity.temperament,
    },
    accessibility: runtimePorterResponseAccessibility(
      fullSimulation,
      runtimeBio0FoodContactAccessible(ecology, porter.address),
    ),
    current: canonical,
  };
}

function stepRuntimePorterResponse(
  current: PorterResponseState,
  porter: RuntimeBio0Porter,
  ecology: Bio0EcologyState,
  weather: WeatherState,
  fullSimulation: boolean,
  tick: number,
): PorterResponseState | null {
  const input = runtimePorterResponseInput(
    current,
    porter,
    ecology,
    weather,
    fullSimulation,
    tick,
  );
  if (input === null) return null;
  if (input.current.nextThinkTick > tick) {
    return canonicalizePorterResponseState({ ...input.current, tick });
  }
  const decision = decidePorterResponse(input);
  if (decision === null) return null;
  const applied = applyPorterResponseDecision(input.current, decision);
  return applied.ok && applied.state !== null ? applied.state : null;
}

function runtimeActionableLivingActorRequests(
  state: LivingActorPlayerChoiceState,
  tick: number,
): readonly LivingActorPlayerChoiceEvent[] {
  return state.events.filter((event) => (
    event.tick <= tick
    && (event.effect.kind === "request-provision-offer"
      || event.effect.kind === "request-secure-provisions")
  ));
}

function bio0ExposureFromCompletedWeather(weather: WeatherState): DogExposureSample {
  const raining = weather.kind === "rain" || weather.kind === "storm";
  const rain = raining
    ? clamp(weather.intensity + (weather.kind === "storm" ? 180_000 : 0), 0, FIXED_POINT)
    : 0;
  const wind = clamp(
    Math.trunc((Math.abs(weather.windX) + Math.abs(weather.windY)) / 2),
    0,
    FIXED_POINT,
  );
  return Object.freeze({
    version: DOG_EXPOSURE_VERSION,
    rain,
    immersion: 0,
    ambientCold: clamp(Math.trunc((rain + wind) / 2), 0, FIXED_POINT),
    ambientHeat: 0,
    wind,
    shelter: 0,
    exertion: 0,
  });
}

function createRuntimeBio0Traversability(
  state: Bio0EcologyState,
  world: WorldView,
  sampledAtTick: number,
): LivingActorTraversabilitySurface | null {
  return createRuntimeDogTraversability(state.dog, world, sampledAtTick);
}

function createRuntimeDogTraversability(
  actor: DogActorState,
  world: WorldView,
  sampledAtTick: number,
): LivingActorTraversabilitySurface | null {
  const origin = regionalAddressAt(world, 0);
  if (origin === null) return null;
  return createLivingActorTraversabilitySurface({
    forActorId: actor.identity.stableId,
    sampledAtTick,
    origin: createWorldPosition(
      origin.region,
      origin.localX * WORLD_POSITION_UNITS_PER_TILE,
      origin.localY * WORLD_POSITION_UNITS_PER_TILE,
    ),
    widthTiles: world.terrain.width,
    heightTiles: world.terrain.height,
    cells: world.terrain.tiles.map((tile) => (
      tile.terrain === "deep-water" || tile.waterDepth > ADRIFT_STAND_DEPTH
    )
      ? { access: "deep-water" as const, travelCost: 0 }
      : {
          access: "open" as const,
          travelCost: clamp(tile.baseTravelCost, 1, 1_000_000),
        }),
  });
}

function runtimeBio0ActorTileIndex(
  state: Bio0EcologyState,
  surface: LivingActorTraversabilitySurface,
): number | null {
  return runtimeDogActorTileIndex(state.dog, surface);
}

function runtimeDogActorTileIndex(
  actor: DogActorState,
  surface: LivingActorTraversabilitySurface,
): number | null {
  let frame;
  try {
    frame = createSpatialFrame(
      surface.origin,
      surface.widthTiles * WORLD_POSITION_UNITS_PER_TILE,
      surface.heightTiles * WORLD_POSITION_UNITS_PER_TILE,
    );
  } catch {
    return null;
  }
  const point = worldPositionToSpatialFrame(frame, actor.address.position);
  if (point === null) return null;
  const x = Math.floor(point.x / WORLD_POSITION_UNITS_PER_TILE);
  const y = Math.floor(point.y / WORLD_POSITION_UNITS_PER_TILE);
  return y * surface.widthTiles + x;
}

function runtimeDogActorTileIndexInWorld(
  actor: DogActorState,
  world: WorldView,
): number | null {
  const point = runtimeWorldPositionTileInWorld(actor.address.position, world);
  return point === null ? null : point.y * world.terrain.width + point.x;
}

function runtimeWorldPositionTileInWorld(
  position: LivingActorAddress["position"],
  world: WorldView,
): Readonly<{ readonly x: number; readonly y: number }> | null {
  const origin = regionalAddressAt(world, 0);
  if (origin === null) return null;
  let frame;
  try {
    frame = createSpatialFrame(
      createWorldPosition(
        origin.region,
        origin.localX * WORLD_POSITION_UNITS_PER_TILE,
        origin.localY * WORLD_POSITION_UNITS_PER_TILE,
      ),
      world.terrain.width * WORLD_POSITION_UNITS_PER_TILE,
      world.terrain.height * WORLD_POSITION_UNITS_PER_TILE,
    );
  } catch {
    return null;
  }
  const point = worldPositionToSpatialFrame(frame, position);
  if (point === null) return null;
  const x = Math.floor(point.x / WORLD_POSITION_UNITS_PER_TILE);
  const y = Math.floor(point.y / WORLD_POSITION_UNITS_PER_TILE);
  return x >= 0
    && x < world.terrain.width
    && y >= 0
    && y < world.terrain.height
    ? Object.freeze({ x, y })
    : null;
}

/**
 * A working animal only needs the bounded corridor between its physical body
 * and its cognition-owned task area. Keeping this surface local avoids paying
 * for the entire streamed region on every investigative step.
 */
function createRuntimeWorkingDogTraversability(
  actor: DogActorState,
  world: WorldView,
  sampledAtTick: number,
  targetArea: Readonly<{ readonly center: LivingActorAddress["position"] }>,
): LivingActorTraversabilitySurface | null {
  const actorTile = runtimeWorldPositionTileInWorld(actor.address.position, world);
  const targetTile = runtimeWorldPositionTileInWorld(targetArea.center, world);
  if (actorTile === null || targetTile === null) return null;
  const padding = 4;
  const minimumX = Math.max(0, Math.min(actorTile.x, targetTile.x) - padding);
  const maximumX = Math.min(
    world.terrain.width - 1,
    Math.max(actorTile.x, targetTile.x) + padding,
  );
  const minimumY = Math.max(0, Math.min(actorTile.y, targetTile.y) - padding);
  const maximumY = Math.min(
    world.terrain.height - 1,
    Math.max(actorTile.y, targetTile.y) + padding,
  );
  const originAddress = regionalAddressAt(
    world,
    minimumY * world.terrain.width + minimumX,
  );
  if (originAddress === null) return null;
  const cells = [];
  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      const tile = world.terrain.tiles[y * world.terrain.width + x];
      if (tile === undefined) return null;
      cells.push(
        tile.terrain === "deep-water" || tile.waterDepth > ADRIFT_STAND_DEPTH
          ? { access: "deep-water" as const, travelCost: 0 }
          : {
              access: "open" as const,
              travelCost: clamp(tile.baseTravelCost, 1, 1_000_000),
            },
      );
    }
  }
  try {
    return createLivingActorTraversabilitySurface({
      forActorId: actor.identity.stableId,
      sampledAtTick,
      origin: createWorldPosition(
        originAddress.region,
        originAddress.localX * WORLD_POSITION_UNITS_PER_TILE,
        originAddress.localY * WORLD_POSITION_UNITS_PER_TILE,
      ),
      widthTiles: maximumX - minimumX + 1,
      heightTiles: maximumY - minimumY + 1,
      cells,
    });
  } catch {
    return null;
  }
}

function runtimeDogWorldTileOpen(world: WorldView, tileIndex: number): boolean {
  const tile = world.terrain.tiles[tileIndex];
  return tile !== undefined
    && tile.terrain !== "deep-water"
    && tile.waterDepth <= ADRIFT_STAND_DEPTH;
}

function runtimeDogHasTraversableStepInWorld(
  actor: DogActorState,
  world: WorldView,
): boolean {
  const index = runtimeDogActorTileIndexInWorld(actor, world);
  if (index === null || !runtimeDogWorldTileOpen(world, index)) return false;
  const x = index % world.terrain.width;
  const y = Math.floor(index / world.terrain.width);
  return [
    { x: x - 1, y },
    { x: x + 1, y },
    { x, y: y - 1 },
    { x, y: y + 1 },
  ].some((neighbor) => (
    neighbor.x >= 0
    && neighbor.x < world.terrain.width
    && neighbor.y >= 0
    && neighbor.y < world.terrain.height
    && runtimeDogWorldTileOpen(
      world,
      neighbor.y * world.terrain.width + neighbor.x,
    )
  ));
}

function runtimeBio0HasTraversableStep(
  state: Bio0EcologyState,
  surface: LivingActorTraversabilitySurface,
): boolean {
  return runtimeDogHasTraversableStep(state.dog, surface);
}

function runtimeDogHasTraversableStep(
  actor: DogActorState,
  surface: LivingActorTraversabilitySurface,
): boolean {
  const index = runtimeDogActorTileIndex(actor, surface);
  if (index === null) return false;
  if (surface.cells[index]?.access !== "open") return false;
  const x = index % surface.widthTiles;
  const y = Math.floor(index / surface.widthTiles);
  return [
    { x: x - 1, y },
    { x: x + 1, y },
    { x, y: y - 1 },
    { x, y: y + 1 },
  ].some((neighbor) => (
    neighbor.x >= 0
    && neighbor.x < surface.widthTiles
    && neighbor.y >= 0
    && neighbor.y < surface.heightTiles
    && surface.cells[neighbor.y * surface.widthTiles + neighbor.x]?.access === "open"
  ));
}

function runtimeBio0ApproachAccessible(
  state: Bio0EcologyState,
  surface: LivingActorTraversabilitySurface,
  hasTraversableStep: boolean,
): boolean | null {
  const request = state.pendingMovement;
  if (request === null) return hasTraversableStep;
  const searchProbe = deriveLivingActorSearchProbe({
    requestId: request.id,
    beliefKey: request.beliefKey,
    probeOrdinal: 0,
    sourceArea: request.targetArea,
  });
  if (searchProbe === null) return null;
  const resolution = resolveLivingActorLocomotion({
    requestId: request.id,
    tick: surface.sampledAtTick,
    actor: state.dog.address,
    targetArea: request.targetArea,
    searchProbe,
    maximumStepUnits: request.maximumStepUnits,
    surface,
  });
  if (resolution.kind === "no-move" && resolution.reason === "invalid-input") return null;
  return resolution.kind === "moved";
}

function runtimeBio0ActionAccessibility(
  state: Bio0EcologyState,
  surface: LivingActorTraversabilitySurface,
): DogActionAccessibility | null {
  const actorTileIndex = runtimeBio0ActorTileIndex(state, surface);
  const hasTraversableStep = runtimeBio0HasTraversableStep(state, surface);
  const approachFood = runtimeBio0ApproachAccessible(
    state,
    surface,
    hasTraversableStep,
  );
  if (approachFood === null) return null;
  return Object.freeze({
    retreat: hasTraversableStep,
    "seek-shelter": hasTraversableStep,
    "avoid-human": hasTraversableStep,
    // Runtime food contact is deliberately absent until a physical offer exists.
    eat: false,
    "approach-food": approachFood,
    rest: actorTileIndex !== null && surface.cells[actorTileIndex]?.access === "open",
    // Observation is the species-neutral fail-safe even when locomotion is closed.
    observe: true,
  });
}

function resolveRuntimeBio0Locomotion(
  state: Bio0EcologyState,
  surface: LivingActorTraversabilitySurface,
): Bio0EcologyState | null {
  const request = state.pendingMovement;
  if (request === null || request.issuedAtTick !== state.tick) return state;
  const searchProbe = deriveLivingActorSearchProbe({
    requestId: request.id,
    beliefKey: request.beliefKey,
    probeOrdinal: 0,
    sourceArea: request.targetArea,
  });
  if (searchProbe === null || surface.sampledAtTick !== request.issuedAtTick) return null;
  const resolution = resolveLivingActorLocomotion({
    requestId: request.id,
    tick: request.issuedAtTick,
    actor: state.dog.address,
    targetArea: request.targetArea,
    searchProbe,
    maximumStepUnits: request.maximumStepUnits,
    surface,
  });
  if (resolution.kind === "no-move") {
    return resolution.reason === "invalid-input" ? null : state;
  }
  const dog = repositionDogActor(state.dog, {
    position: resolution.actor.position,
    heading: resolution.actor.heading,
    atTick: request.issuedAtTick,
  });
  return canonicalizeBio0EcologyState({ ...state, dog });
}

function runtimePositionInsideArea(
  position: LivingActorAddress["position"],
  area: Readonly<{
    readonly center: LivingActorAddress["position"];
    readonly radiusUnits: number;
  }>,
): boolean {
  const dx = (BigInt(position.region.x) - BigInt(area.center.region.x))
      * BigInt(REGION_WIDTH_UNITS)
    + BigInt(position.localX) - BigInt(area.center.localX);
  const dy = (BigInt(position.region.y) - BigInt(area.center.region.y))
      * BigInt(REGION_HEIGHT_UNITS)
    + BigInt(position.localY) - BigInt(area.center.localY);
  const radius = BigInt(area.radiusUnits);
  return dx * dx + dy * dy <= radius * radius;
}

function runtimeWorkingDogStepUnits(actor: DogActorState): number {
  const factor = actor.identity.body.size === "tiny"
    ? 360
    : actor.identity.body.size === "small"
      ? 440
      : actor.identity.body.size === "medium"
        ? 540
        : actor.identity.body.size === "large" ? 620 : 680;
  return Math.trunc(WORLD_POSITION_UNITS_PER_TILE * factor / 1_000);
}

function runtimeGeneratedDogView(dog: DogActorState): GeneratedDogState {
  return {
    identity: dog.identity,
    needs: { ...dog.needs },
    condition: {
      ...dog.condition,
      injuries: [...dog.condition.injuries],
    },
    humanFamiliarity: { ...dog.humanFamiliarity },
  };
}

function runtimeWorkingDogActionAccessibility(input: Readonly<{
  readonly actorOnOpenTerrain: boolean;
  readonly hasTraversableStep: boolean;
}>): DogActionAccessibility {
  return Object.freeze({
    retreat: input.hasTraversableStep,
    "seek-shelter": input.hasTraversableStep,
    "avoid-human": input.hasTraversableStep,
    // Working-dog feeding is deliberately dormant until the same physical
    // settlement inventory owner can commit both the item and nutrition.
    eat: false,
    "approach-food": false,
    rest: input.actorOnOpenTerrain,
    observe: true,
  });
}

/**
 * Ordinary dog cognition publishes whether assigned work may proceed. Runtime
 * never reclassifies a threat or infers obedience from handler/custody IDs.
 */
function stepRuntimeWorkingDogAutonomy(input: Readonly<{
  readonly dog: DogActorState;
  readonly tick: number;
  readonly exposure: DogExposureSample;
  readonly accessibility: DogActionAccessibility;
}>): Readonly<{
  readonly dog: DogActorState;
  readonly disposition: SettlementWorkingAnimalActorDisposition;
  /** Actor-owned fallback offered only while assigned work can consume it. */
  readonly assignmentCompatibleFallback: DogBehaviorDecision | null;
}> | null {
  const evaluation = evaluateDogBehavior({
    tick: input.tick,
    dog: runtimeGeneratedDogView(input.dog),
    perception: input.dog.perception,
    weather: {
      coldPressure: input.exposure.ambientCold,
      heatPressure: input.exposure.ambientHeat,
      rainIntensity: input.exposure.rain,
      windPressure: input.exposure.wind,
    },
    accessibility: input.accessibility,
    foodContact: { directlyConfirmed: false, accessible: false },
    current: {
      intent: input.dog.intent.kind,
      enteredAtTick: input.dog.intent.enteredAtTick,
    },
  });
  if (evaluation === null) return null;
  const { decision, assignmentReadiness } = evaluation;
  const behaviorDue = input.tick >= input.dog.intent.nextThinkTick;
  const actorPriorityInterrupt = assignmentReadiness.kind === "defer-to-actor"
    && decision.intent !== input.dog.intent.kind;
  const assignmentCompatibleFallback = assignmentReadiness.kind === "available"
    && decision.intent !== "observe"
    ? decision
    : null;
  let dog = input.dog;
  // A yieldable alert is consumed by the assignment arbiter below; persisting
  // the dog's fallback retreat here would create a second competing authority.
  if (
    actorPriorityInterrupt
    || (
      behaviorDue
      && (assignmentReadiness.kind === "defer-to-actor" || decision.intent === "observe")
    )
  ) {
    dog = applyDogBehaviorDecision(dog, decision);
  }
  const disposition: SettlementWorkingAnimalActorDisposition = (
    assignmentReadiness.kind === "available" && dog.intent.kind === "observe"
  )
    ? Object.freeze({ kind: "available" })
    : Object.freeze({
        kind: "defer-to-actor",
        referenceId: assignmentReadiness.kind === "defer-to-actor"
          ? assignmentReadiness.referenceId
          : `actor-intent:${dog.intent.kind}`,
      });
  return Object.freeze({ dog, disposition, assignmentCompatibleFallback });
}

/**
 * Assigned work may suppress an actor-owned fallback only when it accepts the
 * exact lawful observation behind that fallback. Area overlap or a different
 * stronger signal is insufficient.
 */
function runtimeWorkConsumesDogFallback(
  dog: DogActorState,
  fallback: DogBehaviorDecision,
  work: SettlementWorkingAnimalActivityDecision,
): boolean {
  if (
    fallback.focusBeliefKey === null
    || work.activity !== "investigate"
    || work.cause.kind !== "perception"
    || work.perceivedArea === null
  ) return false;
  const belief = dog.perception.beliefs.find(({ key }) => key === fallback.focusBeliefKey);
  return belief !== undefined
    && belief.sourceObservationId === work.cause.referenceId
    && stableStringify(belief.area) === stableStringify(work.perceivedArea);
}

/**
 * Prove that the exact cognition-owned investigation accepted by work has a
 * traversable first step before work is allowed to consume the dog's own
 * response to that observation. This is a route check, not hidden-target
 * knowledge: both the surface and search probe terminate at perceived space.
 */
function runtimeWorkingDogInvestigationReachable(input: Readonly<{
  readonly dog: DogActorState;
  readonly regionalView: WorldView;
  readonly tick: number;
  readonly assignment: SettlementWorkingAnimalAssignment;
  readonly activity: SettlementWorkingAnimalActivityTransaction;
}>): boolean | null {
  const { activity } = input;
  if (
    activity.activity !== "investigate"
    || (activity.cause.kind !== "perception" && activity.cause.kind !== "handler-report")
    || activity.perceivedArea === null
  ) return false;
  if (activity.cause.kind === "perception") {
    const belief = input.dog.perception.beliefs.find(({ sourceObservationId, area }) => (
      sourceObservationId === activity.cause.referenceId
      && stableStringify(area) === stableStringify(activity.perceivedArea)
    ));
    if (belief === undefined) return null;
  }
  const surface = createRuntimeWorkingDogTraversability(
    input.dog,
    input.regionalView,
    input.tick,
    activity.perceivedArea,
  );
  if (surface === null) return false;
  const searchProbe = deriveSettlementWorkingAnimalTaskSearchProbe(
    input.assignment,
    activity,
  );
  if (searchProbe === null) return null;
  const movement = resolveLivingActorLocomotion({
    requestId: activity.transactionId,
    tick: input.tick,
    actor: input.dog.address,
    targetArea: activity.perceivedArea,
    searchProbe,
    maximumStepUnits: runtimeWorkingDogStepUnits(input.dog),
    surface,
  });
  if (movement.kind === "moved") return true;
  if (movement.reason === "invalid-input") return null;
  return movement.reason === "already-at-search-probe";
}

/**
 * The keeper has one narrow autonomous policy in this slice: ask an
 * investigating dog that has crossed its authenticated duty boundary to come
 * back. This is only intent. The work owner still requires fresh reciprocal
 * identified sight before it may become an authoritative cancellation.
 */
function runtimeWorkingAnimalHandlerDisposition(input: Readonly<{
  readonly assignment: SettlementWorkingAnimalAssignment;
  readonly dog: DogActorState;
  readonly handler: RuntimeBio0Porter;
}>): SettlementWorkingAnimalHandlerDisposition {
  if (
    input.handler.address.actorId === input.assignment.handlerActorId
    && input.assignment.currentTask?.phase === "investigating"
    && !runtimePositionInsideArea(input.dog.address.position, input.assignment.dutyArea)
  ) {
    return Object.freeze({
      kind: "recall" as const,
      referenceId: "handler-intent:recall-outside-duty-area",
    });
  }
  return Object.freeze({ kind: "continue" as const });
}

/** Stage and commit at most one exact-once work-task transition. */
function stepRuntimeWorkingAnimalTaskLifecycle(
  state: SettlementWorkingAnimalState,
  evaluation: SettlementWorkingAnimalTaskLifecycleEvaluationInput,
): SettlementWorkingAnimalState | null {
  const staged = stageSettlementWorkingAnimalTaskLifecycle(state, evaluation);
  if (staged === null) return null;
  if (staged.transaction === null) return staged.state;
  const resolved = resolveSettlementWorkingAnimalTaskLifecycle(
    staged.state,
    staged.transaction,
  );
  return resolved?.state ?? null;
}

function stepRuntimeSettlementWorkingDog(input: Readonly<{
  readonly roster: DogActorRosterState;
  readonly workingAnimals: SettlementWorkingAnimalState;
  readonly settlement: SettlementEcologyState;
  readonly handler: RuntimeBio0Porter;
  readonly world: WorldState;
  readonly regionalView: WorldView;
  readonly weather: WeatherState;
  readonly observationBatches: readonly (readonly CoreEcologyObservationBatch[])[];
  readonly handlerSearchReport: SettlementWorkingAnimalHandlerSearchReport | null;
}>): Readonly<{
  readonly roster: DogActorRosterState;
  readonly workingAnimals: SettlementWorkingAnimalState;
}> | null {
  const assignment = input.workingAnimals.assignments[0];
  if (assignment === undefined || input.workingAnimals.assignments.length !== 1) return null;
  let dog = dogActorRosterActor(input.roster, assignment.workerActorId);
  if (dog === null) return null;
  const tick = input.world.meta.completedTick;
  const observations = mergeRuntimeCoreObservationBatches(
    dog.identity.stableId,
    input.observationBatches,
  );
  if (observations === null) return null;
  const perception = stepActorPerception(dog.perception, { tick, observations });
  if (perception === null || perception.tick !== tick) return null;
  dog = replaceDogActorPerception(dog, perception);

  const workerCustody = input.settlement.domesticCustodies.find(({ relationshipId }) => (
    relationshipId === assignment.workerCustodyRelationshipId
  ));
  const protectedCustody = input.settlement.domesticCustodies.find(({ relationshipId }) => (
    relationshipId === assignment.protectedCustodyRelationshipId
  ));
  if (
    workerCustody === undefined
    || protectedCustody === undefined
    || workerCustody.homeStructure.kind !== "kennel"
    || protectedCustody.homeStructure.structureId !== assignment.worksiteId
  ) return null;

  const shelter = runtimePositionInsideArea(dog.address.position, {
    center: workerCustody.homeStructure.position,
    radiusUnits: workerCustody.homeStructure.radiusUnits,
  }) ? 720_000 : 0;
  const currentActivity = assignment.currentActivity.activity;
  const exertion = currentActivity === "investigate" || currentActivity === "return"
    ? 260_000
    : currentActivity === "watch" ? 40_000 : 0;
  const exposure = {
    ...bio0ExposureFromCompletedWeather(input.weather),
    shelter,
    exertion,
  };
  const condition = stepDogExposure(
    { ...dog.condition, injuries: [...dog.condition.injuries] },
    dog.identity.weatherAdaptation,
    exposure,
  );
  const steppedNeeds = stepDogNeeds(dog.needs, condition, {
    version: DOG_NEEDS_STEP_VERSION,
    exertion,
    ambientHeat: exposure.ambientHeat,
    threatPressure: perception.suspicionPressure,
    shelter,
    resting: FIXED_POINT - exertion,
    socialContact: 0,
  });
  // Hunger/thirst are not actionable for this roster dog until a physical
  // settlement feeding/drinking transaction exists. Do not activate a need
  // whose remedy the simulated actor cannot actually reach.
  const needs = Object.freeze({
    ...steppedNeeds,
    hunger: dog.needs.hunger,
    thirst: dog.needs.thirst,
  });
  dog = replaceDogActorPhysiology(dog, {
    needs,
    condition,
    humanFamiliarity: dog.humanFamiliarity,
    atTick: tick,
  });

  const actorTileIndex = runtimeDogActorTileIndexInWorld(dog, input.regionalView);
  const actorOnOpenTerrain = actorTileIndex !== null
    && runtimeDogWorldTileOpen(input.regionalView, actorTileIndex);
  const hasTraversableStep = runtimeDogHasTraversableStepInWorld(
    dog,
    input.regionalView,
  );
  const actionAccessibility = runtimeWorkingDogActionAccessibility({
    actorOnOpenTerrain,
    hasTraversableStep,
  });
  const autonomy = stepRuntimeWorkingDogAutonomy({
    dog,
    tick,
    exposure,
    accessibility: actionAccessibility,
  });
  if (autonomy === null) return null;
  dog = autonomy.dog;
  const welfare = {
    injuryPressure: Math.min(
      FIXED_POINT,
      FIXED_POINT - dog.condition.health + dog.condition.injuries.length * 100_000,
    ),
    coldPressure: dog.condition.coldStress,
    heatPressure: dog.condition.heatStress,
    exhaustionPressure: Math.max(dog.condition.exhaustion, dog.needs.rest),
    hungerPressure: dog.needs.hunger,
    thirstPressure: dog.needs.thirst,
  } as const;
  let workingAnimals = input.workingAnimals;
  if (
    input.handlerSearchReport !== null
    && assignment.currentTask === null
    && autonomy.assignmentCompatibleFallback === null
  ) {
    const reportStage = stageSettlementWorkingAnimalSearchFromHandlerReport(
      workingAnimals,
      {
        tick,
        report: input.handlerSearchReport,
        welfare,
        accessibility: {
          watch: true,
          investigate: actorOnOpenTerrain && hasTraversableStep,
          return: actorOnOpenTerrain && hasTraversableStep,
        },
        actorDisposition: autonomy.disposition,
        workerInsideDutyArea: runtimePositionInsideArea(
          dog.address.position,
          assignment.dutyArea,
        ),
      },
    );
    if (reportStage !== null) {
      const reportAssignment = reportStage.state.assignments.find(({ assignmentId }) => (
        assignmentId === assignment.assignmentId
      ));
      const reportActivity = reportStage.transaction ?? reportAssignment?.currentActivity;
      if (reportAssignment === undefined || reportActivity === undefined) return null;
      const routeReachable = runtimeWorkingDogInvestigationReachable({
        dog,
        regionalView: input.regionalView,
        tick,
        assignment: reportAssignment,
        activity: reportActivity,
      });
      if (routeReachable === null) return null;
      if (routeReachable) {
        workingAnimals = reportStage.state;
        if (reportStage.transaction !== null) {
          const resolvedReport = resolveSettlementWorkingAnimalActivity(
            workingAnimals,
            reportStage.transaction,
          );
          if (resolvedReport === null) return null;
          workingAnimals = resolvedReport.state;
        }
      }
    }
  }

  const initialTaskLifecycle = stepRuntimeWorkingAnimalTaskLifecycle(
    workingAnimals,
    {
      assignmentId: assignment.assignmentId,
      tick,
      workerPosition: dog.address.position,
      handlerPosition: input.handler.address.position,
      workerPerception: dog.perception,
      handlerPerception: input.handler.resident.perception,
      welfare,
      actorDisposition: autonomy.disposition,
      handlerDisposition: runtimeWorkingAnimalHandlerDisposition({
        assignment,
        dog,
        handler: input.handler,
      }),
    },
  );
  if (initialTaskLifecycle === null) return null;
  workingAnimals = initialTaskLifecycle;
  let activeAssignment = workingAnimals.assignments.find(({ assignmentId }) => (
    assignmentId === assignment.assignmentId
  ));
  if (activeAssignment === undefined) return null;
  const requiredWorkArea = activeAssignment.currentTask?.phase === "awaiting-handler"
    ? settlementWorkingAnimalReturnArea(activeAssignment)
    : activeAssignment.dutyArea;
  if (requiredWorkArea === null) return null;
  // For an outcome awaiting acknowledgement, the required area is the narrow
  // relationship worksite rather than the broader guardian duty perimeter.
  const workerInsideDutyArea = runtimePositionInsideArea(
    dog.address.position,
    requiredWorkArea,
  );
  let workActorDisposition = autonomy.disposition;
  const workEvaluation = {
    assignmentId: activeAssignment.assignmentId,
    tick,
    perception: dog.perception,
    welfare,
    actorDisposition: workActorDisposition,
    accessibility: {
      watch: true,
      investigate: actorOnOpenTerrain && hasTraversableStep,
      return: actorOnOpenTerrain && hasTraversableStep,
    },
    workerInsideDutyArea,
  } as const;
  let staged = stageSettlementWorkingAnimalActivity(
    workingAnimals,
    workEvaluation,
  );
  if (staged === null) return null;
  const stagedAssignment = staged.state.assignments.find(({ assignmentId }) => (
    assignmentId === assignment.assignmentId
  ));
  if (stagedAssignment === undefined) return null;
  const acceptedCandidate = staged.transaction ?? stagedAssignment.currentActivity;
  if (
    activeAssignment.currentTask === null
    && staged.decision.activity === "investigate"
  ) {
    const routeReachable = runtimeWorkingDogInvestigationReachable({
      dog,
      regionalView: input.regionalView,
      tick,
      assignment: stagedAssignment,
      activity: acceptedCandidate,
    });
    if (routeReachable === null) return null;
    if (!routeReachable) {
      // No task may become authoritative when it cannot take even one lawful
      // step toward the cognition-owned search area.
      staged = stageSettlementWorkingAnimalActivity(
        workingAnimals,
        {
          ...workEvaluation,
          accessibility: {
            ...workEvaluation.accessibility,
            investigate: false,
          },
        },
      );
      if (staged === null || staged.decision.activity === "investigate") return null;
    }
  }
  if (
    autonomy.assignmentCompatibleFallback !== null
  ) {
    const consumesFallback = runtimeWorkConsumesDogFallback(
      dog,
      autonomy.assignmentCompatibleFallback,
      staged.decision,
    );
    if (!consumesFallback) {
      dog = applyDogBehaviorDecision(dog, autonomy.assignmentCompatibleFallback);
      workActorDisposition = {
        kind: "defer-to-actor",
        referenceId: `actor-intent:${dog.intent.kind}`,
      };
      // Re-propose against the original authoritative work state. The
      // speculative stage above was immutable and never became committed.
      staged = stageSettlementWorkingAnimalActivity(
        workingAnimals,
        {
          ...workEvaluation,
          accessibility: {
            ...workEvaluation.accessibility,
            investigate: false,
          },
          actorDisposition: workActorDisposition,
        },
      );
      if (staged === null) return null;
    }
  }
  workingAnimals = staged.state;
  if (staged.transaction !== null) {
    const resolved = resolveSettlementWorkingAnimalActivity(
      staged.state,
      staged.transaction,
    );
    if (resolved === null) return null;
    workingAnimals = resolved.state;
  }

  // A newly committed investigation opens its retained task here. The same
  // pass also records an actor-owned fallback as suspension; only one task
  // transition can commit in a world tick.
  activeAssignment = workingAnimals.assignments.find(({ assignmentId }) => (
    assignmentId === assignment.assignmentId
  ));
  if (activeAssignment === undefined) return null;
  const acceptedTaskLifecycle = stepRuntimeWorkingAnimalTaskLifecycle(
    workingAnimals,
    {
      assignmentId: activeAssignment.assignmentId,
      tick,
      workerPosition: dog.address.position,
      handlerPosition: input.handler.address.position,
      workerPerception: dog.perception,
      handlerPerception: input.handler.resident.perception,
      welfare,
      actorDisposition: workActorDisposition,
      handlerDisposition: runtimeWorkingAnimalHandlerDisposition({
        assignment: activeAssignment,
        dog,
        handler: input.handler,
      }),
    },
  );
  if (acceptedTaskLifecycle === null) return null;
  workingAnimals = acceptedTaskLifecycle;

  const acceptedAssignment = workingAnimals.assignments.find(({ assignmentId }) => (
    assignmentId === assignment.assignmentId
  ));
  if (acceptedAssignment === undefined) return null;
  const acceptedActivity = acceptedAssignment.currentActivity;
  const targetAreas: Array<Readonly<{
    center: LivingActorAddress["position"];
    radiusUnits: number;
  }>> = [];
  if (acceptedActivity.activity === "investigate" && acceptedActivity.perceivedArea !== null) {
    if (acceptedAssignment.currentTask?.phase !== "investigating") return null;
    targetAreas.push(acceptedAssignment.currentTask.perceivedArea);
  } else if (acceptedActivity.activity === "return") {
    const returnArea = settlementWorkingAnimalReturnArea(acceptedAssignment);
    if (returnArea === null) return null;
    targetAreas.push(returnArea);
  } else if (
    acceptedActivity.activity === "survival-override"
    || (acceptedActivity.activity === "defer-to-actor" && dog.intent.kind === "seek-shelter")
  ) {
    targetAreas.push({
      center: workerCustody.homeStructure.position,
      radiusUnits: WORLD_POSITION_UNITS_PER_TILE,
    });
  } else if (
    acceptedActivity.activity === "defer-to-actor"
    && (dog.intent.kind === "retreat" || dog.intent.kind === "avoid-human")
  ) {
    const actorIntentCause = dog.intent.cause;
    const focus = actorIntentCause.kind === "perception"
      ? dog.perception.beliefs.find(({ key }) => key === actorIntentCause.referenceId) ?? null
      : null;
    const escapeTargets = deriveLivingActorEscapeTargets({
      actor: dog.address,
      focusArea: focus?.area ?? null,
    });
    if (escapeTargets === null) return null;
    targetAreas.push(...escapeTargets);
  }

  for (let targetOrdinal = 0; targetOrdinal < targetAreas.length; targetOrdinal += 1) {
    const targetArea = targetAreas[targetOrdinal];
    if (targetArea === undefined) break;
    const searchProbe = acceptedActivity.activity === "investigate"
      ? acceptedAssignment.currentTask?.phase === "investigating"
        ? acceptedAssignment.currentTask.searchProbe
        : null
      : null;
    if (
      searchProbe === null
      && runtimePositionInsideArea(dog.address.position, targetArea)
    ) break;
    const surface = createRuntimeWorkingDogTraversability(
      dog,
      input.regionalView,
      tick,
      targetArea,
    );
    const isEscape = acceptedActivity.activity === "defer-to-actor"
      && (dog.intent.kind === "retreat" || dog.intent.kind === "avoid-human");
    if (surface === null) {
      if (isEscape) continue;
      // A route can leave the materialized window or become temporarily
      // blocked. The retained task remains authoritative and simply makes no
      // physical progress this tick.
      break;
    }
    const requestId = isEscape
      ? `work-move:${hashCanonical([
          acceptedActivity.transactionId,
          dog.intent.kind,
          targetOrdinal,
          targetArea,
        ])}`
      : searchProbe?.requestId ?? acceptedActivity.transactionId;
    if (acceptedActivity.activity === "investigate" && searchProbe === null) return null;
    const movement = resolveLivingActorLocomotion({
      requestId,
      tick,
      actor: dog.address,
      targetArea,
      ...(searchProbe === null ? {} : { searchProbe }),
      maximumStepUnits: runtimeWorkingDogStepUnits(dog),
      surface,
    });
    if (movement.kind === "no-move" && movement.reason === "invalid-input") return null;
    if (movement.kind === "moved") {
      dog = repositionDogActor(dog, {
        position: movement.actor.position,
        heading: movement.actor.heading,
        atTick: tick,
      });
      break;
    }
  }
  const roster = replaceDogActorInRoster(input.roster, dog);
  return roster === null ? null : Object.freeze({ roster, workingAnimals });
}

function physicalCargoPartitionsForView(
  state: PhysicalCargoState,
  view: WorldView,
): readonly LooseCargoWorldState[] {
  return queryPhysicalCargoPartitions(state, regionalStorageRegionsInView(view)).worlds;
}

function runtimeCoreAggregateExposedFoodSources(
  state: PhysicalCargoState,
  settlementEcology: SettlementEcologyState,
  view: WorldView,
  patch: CoreEcologyAggregatePatchState,
): readonly CoreEcologyAggregateExposedFoodSource[] | null {
  const sources: CoreEcologyAggregateExposedFoodSource[] = [];
  for (const looseWorld of physicalCargoPartitionsForView(state, view)) {
    for (const entity of looseWorld.entities) {
      if (entity.payload.kind !== "provision") continue;
      const definition = PROVISION_DEFINITIONS[entity.payload.provision];
      sources.push(Object.freeze({
        sourceReferenceId: entity.id,
        position: createWorldPosition(
          looseWorld.region,
          Math.trunc(entity.x / (LOOSE_CARGO_TILE_UNITS / WORLD_POSITION_UNITS_PER_TILE)),
          Math.trunc(entity.y / (LOOSE_CARGO_TILE_UNITS / WORLD_POSITION_UNITS_PER_TILE)),
        ),
        sourceStrength: definition.scentStrength,
        // Only already-loose parcels enter this adapter. Secured carried food
        // remains owned by the cargo/container scent contract instead.
        packagingLeakage: FIXED_POINT,
      }));
    }
  }
  const foodStore = projectSettlementFoodStoreSource(settlementEcology);
  if (foodStore !== null && foodStore.source.packagingLeakage > 0) {
    sources.push(foodStore.source);
  }
  sources.sort((left, right) => (
    left.sourceReferenceId < right.sourceReferenceId
      ? -1
      : left.sourceReferenceId > right.sourceReferenceId ? 1 : 0
  ));
  return selectCoreEcologyAggregateExposedFoodSources(patch, sources);
}

function runtimeCoreAggregateVisualSources(input: Readonly<{
  readonly beforePatches: readonly CoreEcologyAggregatePatchState[];
  readonly afterPatches: readonly CoreEcologyAggregatePatchState[];
  readonly selectionPatch: CoreEcologyAggregatePatchState;
  readonly beforeDogs: readonly LivingActorAddress[];
  readonly afterDogs: readonly LivingActorAddress[];
  readonly beforePorter: Bio0PorterAddress;
  readonly afterPorter: Bio0PorterAddress;
  readonly player: LivingActorAddress;
  readonly playerMoved: boolean;
}>): readonly CoreEcologyAggregateVisualSource[] {
  const sources: CoreEcologyAggregateVisualSource[] = [];
  const beforeActors = new Map<string, ReturnType<typeof coreEcologyAggregatePatchActor>>();
  for (const patch of input.beforePatches) {
    for (const population of patch.populations) {
      for (const member of population.members) {
        const actorId = member.actor.identity.stableId;
        if (beforeActors.has(actorId)) {
          throw new Error("Aggregate perception received duplicate prior actor custody");
        }
        beforeActors.set(actorId, member.actor);
      }
    }
  }
  const afterActorIds = new Set<string>();
  for (const patch of input.afterPatches) {
    for (const population of patch.populations) {
      for (const member of population.members) {
        if (member.materialization !== "materialized") continue;
        const actorId = member.actor.identity.stableId;
        if (afterActorIds.has(actorId)) {
          throw new Error("Aggregate perception received duplicate current actor custody");
        }
        afterActorIds.add(actorId);
        const before = beforeActors.get(actorId) ?? null;
        sources.push(Object.freeze({
          sourceReferenceId: actorId,
          sourceSpecies: population.species,
          position: member.actor.address.position,
          movementSalience: before !== null
            && !sameRuntimeWorldPosition(before.address.position, member.actor.address.position)
            ? CORE_ECOLOGY_MOVING_SOURCE_SALIENCE
            : 0,
        }));
      }
    }
  }
  for (const afterDog of input.afterDogs) {
    const beforeDog = input.beforeDogs.find(({ actorId }) => actorId === afterDog.actorId);
    if (beforeDog === undefined || afterDog.species !== "domestic-dog") {
      throw new Error("Aggregate perception received incoherent dog source custody");
    }
    sources.push(Object.freeze({
      sourceReferenceId: afterDog.actorId,
      sourceSpecies: "domestic-dog",
      position: afterDog.position,
      movementSalience: sameRuntimeWorldPosition(
        beforeDog.position,
        afterDog.position,
      ) ? 0 : CORE_ECOLOGY_MOVING_SOURCE_SALIENCE,
    }));
  }
  sources.push(
    Object.freeze({
      sourceReferenceId: input.afterPorter.actorId,
      sourceSpecies: "human",
      position: input.afterPorter.position,
      movementSalience: sameRuntimeWorldPosition(
        input.beforePorter.position,
        input.afterPorter.position,
      ) ? 0 : CORE_ECOLOGY_MOVING_SOURCE_SALIENCE,
    }),
    Object.freeze({
      sourceReferenceId: input.player.actorId,
      sourceSpecies: "human",
      position: input.player.position,
      movementSalience: input.playerMoved ? CORE_ECOLOGY_MOVING_SOURCE_SALIENCE : 0,
    }),
  );
  sources.sort((left, right) => (
    left.sourceSpecies < right.sourceSpecies
      ? -1
      : left.sourceSpecies > right.sourceSpecies
        ? 1
        : left.sourceReferenceId < right.sourceReferenceId
          ? -1
          : left.sourceReferenceId > right.sourceReferenceId ? 1 : 0
  ));
  const selected = selectCoreEcologyAggregateVisualSources(input.selectionPatch, sources);
  if (selected === null) {
    throw new Error("Core ecology living-source projection could not be bounded");
  }
  return selected;
}

function sameRuntimeWorldPosition(
  left: LivingActorAddress["position"],
  right: LivingActorAddress["position"],
): boolean {
  return left.region.x === right.region.x
    && left.region.y === right.region.y
    && left.localX === right.localX
    && left.localY === right.localY;
}

function inactiveCargoPartitions(
  state: PhysicalCargoState,
  partitions: readonly LooseCargoWorldState[],
): readonly LooseCargoWorldState[] {
  return partitions.filter((world) => world !== state.looseWorld);
}

function projectRuntimeSettlementFoodStore(
  view: TideweftView,
  state: SettlementEcologyState,
  world: WorldView,
  perception: ReturnType<typeof projectPerception>,
): TideweftView {
  const settlement = world.settlements.find(({ id }) => id === state.identity.settlementId);
  if (
    settlement === undefined
    || perception.detailVisibilityGrades[settlement.tileIndex] !== VISIBILITY_DIRECT
  ) return view;
  const settlementViewId = String(settlement.id);
  if (!view.settlements.some(({ id }) => id === settlementViewId)) return view;
  return {
    ...view,
    settlements: view.settlements.map((candidate) => candidate.id === settlementViewId
      ? {
          ...candidate,
          foodStore: {
            id: state.identity.storeId,
            closure: state.closure,
          },
        }
      : candidate),
  };
}

function runtimeDogWorkActivityContext(
  actorId: string,
  state: SettlementWorkingAnimalState,
  atTick: number,
): DogWorkActivityContext | undefined {
  return state.assignments.some(({ workerActorId }) => workerActorId === actorId)
    ? Object.freeze({ state, atTick })
    : undefined;
}

export async function createTideweftRuntime(
  repository: SaveRepository = createSaveRepository(),
): Promise<TideweftRuntime> {
  let world = createWorld("quiet-delta", HARD_PRESSURE_MODE);
  let economyView = createWorldView(world);
  let bio0Ecology = createRuntimeBio0Ecology(world, economyView);
  let coreEcology = createRuntimeSettlementHomeCoreEcology(world, bio0Ecology, economyView);
  let dogActorRoster = createRuntimeDogActorRoster(world, bio0Ecology, coreEcology);
  let settlementEcology = createRuntimeSettlementEcology(
    world,
    bio0Ecology,
    coreEcology,
    dogActorRoster,
    economyView,
  );
  let settlementWorkingAnimals = createRuntimeSettlementWorkingAnimals(
    world,
    settlementEcology,
    dogActorRoster,
  );
  let settlementDomesticAnimalRecovery = createSettlementDomesticAnimalRecoveryState(
    settlementEcology.identity.settlementId,
  );
  let porterResponse = createRuntimePorterResponse(bio0Ecology);
  let livingActorPlayerChoice = createRuntimeLivingActorPlayerChoice();
  let fieldResourceCatalog = runtimeFieldResourceCatalog(world);
  let fieldResourceEcology = createFieldResourceEcologyState(world.meta.completedTick);
  let traversalFeedback = createTraversalFeedbackState();
  const firstPromise = economyView.contracts.find((contract) => contract.status === "offered");
  let player = createPlayer(economyView, firstPromise?.originSettlementId);
  let physicalCargo = createPhysicalCargoStateFromPlayer(
    player,
    WORLD_WIDTH,
    WORLD_HEIGHT,
  );
  let regionalTravel = migratePlayerToRegionalTravel(world.meta.rootSeed, player);
  let worldView = createRegionalWorldView(
    economyView,
    regionalTravel.window,
    { discovered: player.discovered, depthSoundings: player.depthSoundings },
  );
  let regionalEcology = createRuntimeRegionalEcologyState(
    world,
    bio0Ecology,
    coreEcology,
    worldView,
    economyView,
  );
  physicalCargo = seedRuntimeCoreEcologyProvision(physicalCargo, regionalEcology);
  let fieldResourceProjection: RegionalFieldResourceProjection =
    projectCompatibilityFieldResources(fieldResourceCatalog, worldView);
  let promiseJourney = createRegionalPromiseJourney();
  let session = createSessionState(world.meta.seedText, HARD_POSTURE);
  let perception = projectPerception(worldView, player);
  const initialCargoPartitions = physicalCargoPartitionsForView(physicalCargo, worldView);
  const initialDogPresentations = runtimeDogActors(bio0Ecology, dogActorRoster)
    .flatMap((actor) => {
      const activity = runtimeDogWorkActivityContext(
        actor.identity.stableId,
        settlementWorkingAnimals,
        world.meta.completedTick,
      );
      const presentation = projectDogPresentation({
        actor,
        window: {
          origin: regionalTravel.window.origin,
          terrain: {
            width: worldView.terrain.width,
            height: worldView.terrain.height,
          },
        },
        tileSize: RENDER_TILE_SIZE,
        detailVisibilityGrades: perception.detailVisibilityGrades,
        ...(activity === undefined ? {} : { activity }),
      });
      return presentation === null ? [] : [presentation];
    });
  let renderView = projectRuntimeSettlementFoodStore(
    {
      ...projectGameView(worldView, player, {
        paused: true,
        traversalFeedback,
        looseCargoWorld: physicalCargo.looseWorld,
        looseCargoWorlds: initialCargoPartitions,
        perception,
      }),
      dogs: initialDogPresentations,
    },
    settlementEcology,
    worldView,
    perception,
  );
  let uiView = projectUIView(worldView, player, session, {
    economyWorld: economyView,
    fieldResourceCatalog: fieldResourceProjection.catalog,
    fieldResourceEcology,
    looseCargoCarrier: physicalCargo.carrier,
    looseCargoWorld: physicalCargo.looseWorld,
    inactiveLooseCargoWorlds: inactiveCargoPartitions(physicalCargo, initialCargoPartitions),
    traversalFeedback,
    perception,
  });
  const soundscape = new TideweftSoundscape();
  let focusHandler: ((point: WorldPoint, zoom?: number) => void) | undefined;
  let animationFrame = 0;
  let running = false;
  let previousFrame = 0;
  let accumulator = 0;
  let commandSequence = 1;
  let commandQueue: SimCommand[] = [];
  let playerStepsSinceWorldTick = 0;
  let playerSenseSamples: PlayerSenseSample[] = [];
  let nextPlayerSenseSampleOrdinal = 0;
  let terrainPrefetchJobs: TerrainRegionPrefetchJob[] = [];
  let manualControl: PlayerControl = { moveX: 0, moveY: 0, brace: false };
  let adriftTapControl: PlayerControl | null = null;
  let adriftTapTicksRemaining = 0;
  let lastAdriftControl: PlayerControl = { moveX: 0, moveY: 0, brace: false };
  let lastAdriftPaddleSoundMs = Number.NEGATIVE_INFINITY;
  let autopilotPath: number[] = [];
  let pendingGatherNodeId: string | null = null;
  let pendingParcelTargetId: string | null = null;
  let pendingParcelRecoverOnArrival = false;
  let pendingAcceptance: { contractId: number; acceptCommandId: string; pickupCommandId: string } | null = null;
  let pendingDelivery: { contractId: number; commandId: string; wasAutomated: boolean } | null = null;
  let pendingReinforcement: {
    routeId: number;
    settlementId: number;
    commandId: string;
    wasAutomated: boolean;
  } | null = null;
  let pendingRenegotiation: { contractId: number; settlementId: number; commandId: string } | null = null;
  let pendingReportDelivery: { commandId: string; targetSettlementId: number } | null = null;
  let pendingChoir: { commandId: string; cycle: TideChoirCycle } | null = null;
  let selectedResidentId: number | null = null;
  let selectedDogActorId: string | null = null;
  let selectedWildlifeTarget: RuntimeCoreWildlifeTarget | null = null;
  let selectedWildlifeEvidenceTarget: WildlifeEvidenceTargetUIView | null = null;
  let pendingResidentObservation: { residentId: number; commandId: string } | null = null;
  let pendingResidentGreeting: { residentId: number; commandId: string } | null = null;
  let eventObservationCursor = 0;
  const residentSpeech = new Map<number, { text: string; untilSessionMs: number }>();
  let lastAutosaveTick = 0;
  let lastCargoDamageNoticeMs = Number.NEGATIVE_INFINITY;
  let pendingSave: { sequence: number; record: SaveRecord } | undefined;
  let saveWorkerRunning = false;
  let saveSequence = 0;
  let saveGenerationEra = 0;
  let saveGeneration = 0;
  let lastIssuedSaveTimestamp = -1;
  let saveRetryTimer: ReturnType<typeof setTimeout> | undefined;
  let saveRetryAttempts = 0;
  let saveFailureVisible = false;
  let saveRecoveryBlocked = false;
  let newerSaveUnavailable = false;
  let staleSaveDetected = false;
  let saveReadFailed = false;
  let runtimeIntegrityFailure: string | null = null;
  let recoverableSaveIssue: "corrupt" | "conflict" | null = null;
  let replacementSeedRequired = false;
  let destroyed = false;
  const saveWaiters: Array<{
    sequence: number;
    resolve: () => void;
    reject: (reason: unknown) => void;
  }> = [];

  const loaded = await loadAutosave(repository);
  if (loaded?.kind === "read-failed") {
    saveReadFailed = true;
    saveRecoveryBlocked = true;
    saveFailureVisible = true;
    announce(
      session,
      "LOCAL SAVE UNAVAILABLE — Tideweft could not determine whether a durable local save exists. Nothing will be opened or overwritten; reload to retry local storage.",
      true,
    );
  }
  if (loaded?.kind === "unavailable") {
    saveGenerationEra = loaded.version.saveGenerationEra;
    saveGeneration = loaded.version.saveGeneration;
    lastIssuedSaveTimestamp = loaded.version.updatedAt;
    saveRecoveryBlocked = true;
    newerSaveUnavailable = true;
    saveFailureVisible = true;
    announce(
      session,
      "LOCAL SAVE TEMPORARILY UNAVAILABLE — a newer copy exists, so Tideweft will not open or overwrite an older fallback. Reload when local storage is available again.",
      true,
    );
  }
  if (loaded?.kind === "conflict") {
    const recovery = nextSaveGeneration(loaded.version);
    if (recovery) {
      saveGenerationEra = recovery.saveGenerationEra;
      saveGeneration = recovery.saveGeneration;
      lastIssuedSaveTimestamp = -1;
      saveFailureVisible = true;
      recoverableSaveIssue = "conflict";
      replacementSeedRequired = true;
      announce(
        session,
        "Two conflicting local autosaves claimed the same version. Start a seed to replace both safely; neither copy was chosen behind your back.",
        true,
      );
    } else {
      saveGenerationEra = Number.MAX_SAFE_INTEGER;
      saveGeneration = Number.MAX_SAFE_INTEGER;
      lastIssuedSaveTimestamp = loaded.version.updatedAt;
      saveRecoveryBlocked = true;
      saveFailureVisible = true;
      announce(
        session,
        "LOCAL SAVE CONFLICT CANNOT BE REPLACED — its safe replacement counter is exhausted. Clear Tideweft's stored site data, reload, and begin the seed again.",
        true,
      );
    }
  }
  if (loaded?.kind === "corrupt") {
    const recovery = nextSaveGeneration(loaded.version);
    if (recovery) {
      saveGenerationEra = recovery.saveGenerationEra;
      saveGeneration = recovery.saveGeneration;
      lastIssuedSaveTimestamp = -1;
      saveFailureVisible = true;
      recoverableSaveIssue = "corrupt";
      replacementSeedRequired = true;
      announce(
        session,
        "The previous local autosave could not be read. Start a seed to replace it safely; older tabs cannot restore the damaged copy.",
        true,
      );
    } else {
      saveGenerationEra = Number.MAX_SAFE_INTEGER;
      saveGeneration = Number.MAX_SAFE_INTEGER;
      lastIssuedSaveTimestamp = loaded.version.updatedAt;
      saveRecoveryBlocked = true;
      saveFailureVisible = true;
      announce(
        session,
        "LOCAL SAVE CANNOT BE REPLACED — its safe replacement counter is exhausted. Clear Tideweft's stored site data, reload, and begin the seed again.",
        true,
      );
    }
  }
  if (loaded?.kind === "loaded") {
    saveGenerationEra = loaded.saveGenerationEra;
    saveGeneration = loaded.saveGeneration;
    lastIssuedSaveTimestamp = loaded.updatedAt;
    world = loaded.world;
    // Historical events without an explicit observation bit are not
    // retroactively revealed merely because the player now visits their locus.
    eventObservationCursor = Math.max(0, world.meta.nextEventSequence - 1);
    // Calm/standard remain readable simulation values for old snapshots and
    // deterministic fixtures, but the playable game now has one ruleset.
    world.meta.pressureMode = HARD_PRESSURE_MODE;
    economyView = createWorldView(world);
    bio0Ecology = loaded.bio0Ecology;
    coreEcology = loaded.coreEcology;
    regionalEcology = loaded.regionalEcology;
    dogActorRoster = loaded.dogActorRoster;
    settlementEcology = loaded.settlementEcology;
    settlementWorkingAnimals = loaded.settlementWorkingAnimals;
    settlementDomesticAnimalRecovery = loaded.settlementDomesticAnimalRecovery;
    porterResponse = loaded.porterResponse;
    livingActorPlayerChoice = loaded.livingActorPlayerChoice;
    fieldResourceCatalog = runtimeFieldResourceCatalog(world);
    fieldResourceEcology = canonicalizeFieldResourceState(
      fieldResourceCatalog,
      loaded.fieldResources,
    );
    traversalFeedback = loaded.traversalFeedback;
    player = loaded.player;
    physicalCargo = loaded.physicalCargo;
    regionalTravel = loaded.regionalTravel;
    promiseJourney = loaded.promiseJourney;
    playerStepsSinceWorldTick = loaded.perceptionCarry.playerStepsSinceWorldTick;
    playerSenseSamples = [...loaded.perceptionCarry.playerSenseSamples];
    nextPlayerSenseSampleOrdinal = loaded.perceptionCarry.nextPlayerSenseSampleOrdinal;
    rebuildRegionalWorldView();
    normalizePlayerForRuntime(player, worldView, economyView);
    session = loaded.session;
    session.pressureMode = HARD_PRESSURE_MODE;
    session.posture = HARD_POSTURE;
    session.paused = false;
    session.titleVisible = false;
    session.quietHourVisible = false;
    session.hasSave = true;
    session.sessionPlayMilliseconds = Number.isFinite(session.sessionPlayMilliseconds)
      ? Math.max(0, session.sessionPlayMilliseconds)
      : 0;
    session.sessionStrandsWoven = Number.isFinite(session.sessionStrandsWoven) ? session.sessionStrandsWoven : 0;
    session.sessionChoirsAwakened = Number.isFinite(session.sessionChoirsAwakened) ? session.sessionChoirsAwakened : 0;
    session.sessionReportsDelivered = Number.isFinite(session.sessionReportsDelivered)
      ? session.sessionReportsDelivered
      : 0;
    session.sessionDiscoveredAtStart = Number.isFinite(session.sessionDiscoveredAtStart)
      ? session.sessionDiscoveredAtStart
      : discoveredCount(player);
    session.sessionBaseline = session.sessionBaseline ?? null;
    session.closureOffered = Boolean(session.closureOffered);
    session.campaignCelebrated = Boolean(session.campaignCelebrated);
    session.continueSummary = continueSummary(economyView, player);
    lastAutosaveTick = world.meta.completedTick;
    beginSession();
    announce(session, "Welcome back to the estuary. Nothing changed while you were away.");
    refreshViews();
  }

  function rebuildRegionalWorldView(): void {
    economyView = createWorldView(world);
    worldView = createRegionalWorldView(
      economyView,
      regionalTravel.window,
      { discovered: player.discovered, depthSoundings: player.depthSoundings },
    );
    fieldResourceProjection = projectCompatibilityFieldResources(fieldResourceCatalog, worldView);
  }

  function settlementStoreKeeperAtPlayer(
    currentPerception: ReturnType<typeof projectPerception>,
  ): RuntimeBio0Porter | null {
    if (
      settlementEcology.closure !== "open"
      || projectSettlementFoodStoreSource(settlementEcology) === null
      || settlementAtPlayer(player, worldView) !== settlementEcology.identity.settlementId
    ) return null;
    let keeper: RuntimeBio0Porter;
    try {
      keeper = runtimeBio0Porter(economyView, settlementEcology.identity.keeperActorId);
    } catch {
      return null;
    }
    if (stableStringify(keeper.address) !== stableStringify(bio0Ecology.porterAddress)) return null;
    const placement = livingActorAddressInRegionalWindow(keeper.address, {
      origin: regionalTravel.window.origin,
      terrain: {
        width: worldView.terrain.width,
        height: worldView.terrain.height,
      },
    });
    if (
      placement === null
      || currentPerception.detailVisibilityGrades[placement.tileIndex] !== VISIBILITY_DIRECT
    ) return null;
    const maximumDistance = RESIDENT_CONVERSATION_RANGE_TILES * WORLD_POSITION_UNITS_PER_TILE;
    const dx = placement.point.x - player.x;
    const dy = placement.point.y - player.y;
    return dx * dx + dy * dy <= maximumDistance * maximumDistance ? keeper : null;
  }

  function refreshViews(): void {
    perception = projectPerception(worldView, player);
    captureNewlyObservedEvents();
    const actorWindow = {
      origin: regionalTravel.window.origin,
      terrain: {
        width: worldView.terrain.width,
        height: worldView.terrain.height,
      },
    };
    const ecologyProjection = projectRegionalEcologyActiveState(
      regionalEcology,
      actorWindow,
    );
    if (ecologyProjection === null) {
      throw new Error("Regional ecology presentation projection could not be resolved");
    }
    const activeCoreEcologyPatches = ecologyProjection.residents.map(({ patch }) => patch);
    const activityAuthoritiesBySource = new Map<
      string,
      ReadonlyMap<string, CoreEcologyActivityAuthorityV1>
    >();
    for (const source of ecologyProjection.residents) {
      const authorities = runtimeCoreEcologyActivityAuthorities(
        world.meta.rootSeed,
        regionalEcology.root,
        source,
      );
      if (authorities === null) {
        throw new Error(
          `Regional ecology source ${source.sourceKey} lost presentation activity authority`,
        );
      }
      activityAuthoritiesBySource.set(source.sourceKey, authorities);
    }
    const settlementStoreKeeper = settlementStoreKeeperAtPlayer(perception);
    const activeContract = player.activeContractId === null
      ? undefined
      : economyView.contracts.find((contract) => contract.id === player.activeContractId);
    const trackedContract = session.trackedContractId === null
      ? undefined
      : economyView.contracts.find((contract) => contract.id === session.trackedContractId);
    const objectiveContract = activeContract ?? trackedContract;
    const visibleCargoPartitions = physicalCargoPartitionsForView(physicalCargo, worldView);
    const activePromiseCustody = activeContract
      ? physicalCargoPromiseCustody(physicalCargo, activeContract.id)
      : undefined;
    const destinationSettlementId = activeContract
      ? activeContract.destinationSettlementId
      : player.report
        ? player.report.targetSettlementId
      : trackedContract?.status === "offered"
        ? trackedContract.originSettlementId
        : trackedContract?.destinationSettlementId;
    const destinationKind = activeContract
      ? "delivery" as const
      : player.report
        ? "report" as const
        : trackedContract?.status === "offered"
          ? "pickup" as const
          : undefined;
    const dogPresentations = runtimeDogActors(bio0Ecology, dogActorRoster)
      .flatMap((actor) => {
        const activity = runtimeDogWorkActivityContext(
          actor.identity.stableId,
          settlementWorkingAnimals,
          world.meta.completedTick,
        );
        const presentation = projectDogPresentation({
          actor,
          window: actorWindow,
          tileSize: RENDER_TILE_SIZE,
          detailVisibilityGrades: perception.detailVisibilityGrades,
          selected: selectedDogActorId === actor.identity.stableId,
          ...(activity === undefined ? {} : { activity }),
        });
        return presentation === null ? [] : [presentation];
      });
    if (
      selectedDogActorId !== null
      && !dogPresentations.some(({ actorId }) => actorId === selectedDogActorId)
    ) {
      selectedDogActorId = null;
    }
    const wildlifePresentation = ecologyProjection.residents.flatMap((source) => {
      const activityAuthorities = activityAuthoritiesBySource.get(source.sourceKey);
      if (activityAuthorities === undefined) {
        throw new Error("Regional ecology presentation lost its activity source map");
      }
      const projected = projectCoreEcologyWildlife({
        patch: source.patch,
        window: actorWindow,
        perception,
        tileSize: RENDER_TILE_SIZE,
        selectedTarget: selectedWildlifeTarget,
        ...(activityAuthorities.size === 0
          ? {}
          : { activityAuthorities: Object.freeze([...activityAuthorities.values()]) }),
      });
      if (projected === null) {
        throw new Error("Core wildlife presentation could not be projected");
      }
      return projected;
    });
    if (
      selectedWildlifeTarget !== null
      && !wildlifePresentation.some(({ actorId, species }) => (
        actorId === selectedWildlifeTarget?.actorId
        && species === selectedWildlifeTarget?.species
      ))
    ) {
      selectedWildlifeTarget = null;
    }
    const wildlifeCarcassPresentation = activeCoreEcologyPatches.flatMap((patch) => {
      const projected = projectCoreEcologyWildlifeCarcasses({
        patch,
        window: actorWindow,
        perception,
        tileSize: RENDER_TILE_SIZE,
      });
      if (projected === null) {
        throw new Error("Core wildlife carcass presentation could not be projected");
      }
      return projected;
    });
    const aggregateEvidenceProjections = activeCoreEcologyPatches.map((patch) => {
      const projected = projectCoreEcologyAggregateEvidence({
        patch,
        window: actorWindow,
        perception,
        tileSize: RENDER_TILE_SIZE,
        selectedTarget: selectedWildlifeEvidenceTarget,
      });
      if (projected === null) {
        throw new Error("Aggregate wildlife evidence runtime projection could not be resolved");
      }
      return projected;
    });
    const selectedEvidence = aggregateEvidenceProjections
      .map(({ selectedAbout }) => selectedAbout)
      .filter((selected) => selected !== null);
    if (selectedEvidence.length > 1) {
      throw new Error("Aggregate wildlife evidence has multiple source owners");
    }
    const aggregateEvidenceProjection = {
      renderEvidence: aggregateEvidenceProjections.flatMap(({ renderEvidence }) => renderEvidence),
      selectedAbout: selectedEvidence[0] ?? null,
    };
    if (
      selectedWildlifeEvidenceTarget !== null
      && aggregateEvidenceProjection.selectedAbout === null
    ) {
      selectedWildlifeEvidenceTarget = null;
    }
    renderView = projectRuntimeSettlementFoodStore(
      {
        ...projectGameView(worldView, player, {
          selectedSettlementId: session.selectedSettlementId,
          selectedResidentId,
          residentSpeech: activeResidentSpeech(),
          selectedRouteId: objectiveContract?.routeId ?? null,
          destinationSettlementId: destinationSettlementId ?? null,
          ...(destinationKind ? { destinationKind } : {}),
          fieldResourceCatalog: fieldResourceProjection.catalog,
          fieldResourceEcology,
          traversalFeedback,
          looseCargoWorld: physicalCargo.looseWorld,
          looseCargoWorlds: visibleCargoPartitions,
          bracing: manualControl.brace,
          adriftControl: lastAdriftControl,
          perception,
          paused: session.paused || session.titleVisible || session.quietHourVisible,
        }),
        dogs: dogPresentations,
        wildlife: wildlifePresentation,
        wildlifeCarcasses: wildlifeCarcassPresentation,
        aggregateWildlifeEvidence: aggregateEvidenceProjection.renderEvidence,
      },
      settlementEcology,
      worldView,
      perception,
    );
    // ABOUT is a live sensory affordance, not a durable remote tracker. Once
    // the selected person leaves direct detail perception, that selection is
    // discarded and cannot silently reappear after a region or camera change.
    if (
      selectedResidentId !== null
      && !renderView.porters.some((porter) => Number(porter.id) === selectedResidentId)
    ) {
      selectedResidentId = null;
    }
    const selectedDog = runtimeDogActorById(
      bio0Ecology,
      dogActorRoster,
      selectedDogActorId,
    );
    const selectedDogIsBio0 = selectedDog?.identity.stableId
      === bio0Ecology.dog.identity.stableId;
    const dogInspection = selectedDog === null
      ? null
      : projectDogLivingActorInspection(selectedDog, {
          perception,
          window: actorWindow,
        }, runtimeDogWorkActivityContext(
          selectedDog.identity.stableId,
          settlementWorkingAnimals,
          world.meta.completedTick,
        ));
    const rawDogInteractions = dogInspection === null
      ? null
      : projectLivingActorInteractionChoices({
          target: dogInspection.target,
          requestRecipientActorId: selectedDogIsBio0
            ? bio0Ecology.porterAddress.actorId
            : null,
          actors: selectedDogIsBio0
            ? [selectedDog!.address, bio0Ecology.porterAddress]
            : [selectedDog!.address],
          observation: {
            window: actorWindow,
            perception,
          },
        });
    const dogInteractions = rawDogInteractions?.map((choice) => choice.id === "reroute"
      ? autopilotPath.length > 0
        ? {
            ...choice,
            label: "ROUTE AROUND THIS SPOT",
            hint: "Replans the current automatic route around the actor's observed position.",
          }
        : {
            ...choice,
            label: "ROUTE AROUND THIS SPOT",
            disabled: true,
            hint: "Set an automatic route first.",
          }
      : choice) ?? null;
    const dogSelection = dogInspection !== null && dogInteractions !== null
      ? withLivingActorInteractions(dogInspection, dogInteractions)
      : null;
    if (selectedDogActorId !== null && dogSelection === null) {
      selectedDogActorId = null;
    }
    const selectedWildlifeOwners = selectedWildlifeTarget === null
      ? []
      : ecologyProjection.residents.flatMap((source) => {
          const actor = selectedCoreEcologyActor(source.patch, selectedWildlifeTarget);
          return actor === null ? [] : [{ actor, source }];
        });
    if (selectedWildlifeOwners.length > 1) {
      throw new Error("Selected wildlife identity has multiple ecology owners");
    }
    const selectedWildlifeOwner = selectedWildlifeOwners[0] ?? null;
    const selectedWildlife = selectedWildlifeOwner?.actor ?? null;
    const selectedWildlifeActivity = selectedWildlife !== null
      && coreEcologySpeciesHasRuntimeCapability(
        selectedWildlife.identity.species,
        "diurnal-activity",
      )
      && selectedWildlifeOwner !== null
      ? {
          patch: selectedWildlifeOwner.source.patch,
          atTick: selectedWildlifeOwner.source.patch.updatedAtTick,
          ...(activityAuthoritiesBySource
            .get(selectedWildlifeOwner.source.sourceKey)
            ?.get(selectedWildlife.identity.stableId) === undefined
            ? {}
            : {
                authority: activityAuthoritiesBySource
                  .get(selectedWildlifeOwner.source.sourceKey)!
                  .get(selectedWildlife.identity.stableId)!,
              }),
        }
      : undefined;
    const selectedWildlifePresentation = selectedWildlife === null
      ? undefined
      : wildlifePresentation.find(({ actorId, species }) => (
          actorId === selectedWildlife.identity.stableId
          && species === selectedWildlife.identity.species
        ));
    const wildlifeInspection = selectedWildlife === null
      ? null
      : projectWildlifeLivingActorInspection(selectedWildlife, {
          perception,
          window: actorWindow,
          ...(selectedWildlifePresentation?.groupSize === undefined
            ? {}
            : { visibleAggregateCount: selectedWildlifePresentation.groupSize }),
        }, selectedWildlifeActivity);
    const coreActorAddresses = activeCoreEcologyPatches.flatMap((patch) => (
      patch.populations.flatMap(({ members }) => members
        .filter(({ materialization }) => materialization === "materialized")
        .map(({ actor }) => actor.address))
    ));
    const rawWildlifeInteractions = wildlifeInspection === null
      ? null
      : projectLivingActorInteractionChoices({
          target: wildlifeInspection.target,
          requestRecipientActorId: null,
          actors: coreActorAddresses,
          observation: { window: actorWindow, perception },
        });
    const wildlifeInteractions = rawWildlifeInteractions?.map((choice) => choice.id === "reroute"
      ? autopilotPath.length > 0
        ? choice
        : {
            ...choice,
            disabled: true,
            hint: "Set an automatic route first.",
          }
      : choice) ?? null;
    const wildlifeSelection = wildlifeInspection !== null && wildlifeInteractions !== null
      ? withLivingActorInteractions(wildlifeInspection, wildlifeInteractions)
      : null;
    if (selectedWildlifeTarget !== null && wildlifeSelection === null) {
      selectedWildlifeTarget = null;
    }
    const wildlifeEvidenceSelection = aggregateEvidenceProjection.selectedAbout;
    uiView = {
      ...projectUIView(worldView, player, session, {
        economyWorld: economyView,
        selectedResidentId,
        fieldResourceCatalog: fieldResourceProjection.catalog,
        fieldResourceEcology,
        looseCargoCarrier: physicalCargo.carrier,
        looseCargoWorld: physicalCargo.looseWorld,
        inactiveLooseCargoWorlds: inactiveCargoPartitions(physicalCargo, visibleCargoPartitions),
        ...(activePromiseCustody
          ? { activePromiseCustody: { contractId: activeContract!.id, ...activePromiseCustody } }
          : {}),
        bracing: manualControl.brace,
        adriftControl: lastAdriftControl,
        traversalFeedback,
        perception,
        ...(settlementStoreKeeper === null
          ? {}
          : {
              settlementFoodStoreAction: {
                id: `${settlementEcology.identity.storeId}:${settlementEcology.revision}`,
                label: "Warn the store keeper",
                hint: "The food-store door is standing open. Tell the visible keeper to secure it.",
              },
            }),
        requiresSeed: replacementSeedRequired,
        worldCreationBlocked: saveRecoveryBlocked,
        ...(runtimeIntegrityFailure
          ? {
              saveWarning: {
                id: "runtime-integrity-halt",
                message: "SIMULATION PAUSED SAFELY",
                detail: `${runtimeIntegrityFailure} No further world step was accepted. Reload the last durable save; this window will not continue from a partial transaction.`,
                tone: "danger" as const,
              },
            }
          : saveFailureVisible
            ? {
                saveWarning: {
                  id: `local-save-${recoverableSaveIssue ?? (saveReadFailed ? "read-unavailable" : staleSaveDetected ? "superseded" : newerSaveUnavailable ? "unavailable" : saveRecoveryBlocked ? "blocked" : "failed")}-era-${saveGenerationEra}-generation-${saveGeneration}`,
                  message: recoverableSaveIssue === "corrupt"
                    ? "LOCAL AUTOSAVE UNREADABLE"
                    : recoverableSaveIssue === "conflict"
                      ? "LOCAL AUTOSAVES CONFLICT"
                      : saveReadFailed
                        ? "LOCAL SAVE UNAVAILABLE"
                        : staleSaveDetected
                          ? "LOCAL SAVE SUPERSEDED"
                          : "LOCAL SAVE NOT STORED",
                  detail: recoverableSaveIssue === "corrupt"
                    ? "No damaged data was loaded. Enter a seed to replace that copy safely; this warning remains until the replacement is stored."
                    : recoverableSaveIssue === "conflict"
                      ? "Neither equal-version copy was chosen. Enter a seed to replace both safely; this warning remains until the replacement is stored."
                      : saveReadFailed
                        ? "Tideweft could not prove that local storage is empty. Nothing will be opened, started, or overwritten in this window. Reload to retry local storage."
                        : staleSaveDetected
                          ? "Another tab or copy stored a different or newer durable version. This window will not retry or overwrite it. Reload to resolve the copies and continue."
                          : newerSaveUnavailable
                            ? "A newer local copy exists but its storage backend is unavailable. Reload; Tideweft will not overwrite it with an older fallback."
                            : saveRecoveryBlocked
                              ? "This browser save exhausted its replacement counter. Clear Tideweft's stored site data, reload, and begin the seed again."
                              : "This estuary currently exists only in this open window. Keep it open while Tideweft retries local storage automatically.",
                  tone: "danger" as const,
                },
              }
            : {}),
      }),
      ...(wildlifeSelection !== null
        ? { selectedLivingActor: wildlifeSelection }
        : dogSelection === null ? {} : { selectedLivingActor: dogSelection }),
      ...(wildlifeEvidenceSelection === null
        ? {}
        : { selectedWildlifeEvidence: wildlifeEvidenceSelection }),
    };
  }

  function captureNewlyObservedEvents(): void {
    let nextCursor = eventObservationCursor;
    for (const event of economyView.events) {
      if (event.sequence <= eventObservationCursor) continue;
      nextCursor = Math.max(nextCursor, event.sequence);
      if (!eventIsDirectlyObservableAtLocus(event, economyView, worldView, perception)) continue;
      for (const events of [world.events, economyView.events, worldView.events]) {
        const match = events.find((candidate) => candidate.sequence === event.sequence);
        if (match) match.data.playerObserved = true;
      }
    }
    eventObservationCursor = nextCursor;
  }

  function commandId(kind: string): string {
    const id = `player-${kind}-${world.meta.completedTick + 1}-${commandSequence}`;
    commandSequence += 1;
    return id;
  }

  function activeResidentSpeech(): ReadonlyMap<number, string> {
    const active = new Map<number, string>();
    for (const [residentId, speech] of residentSpeech) {
      if (speech.untilSessionMs <= session.sessionPlayMilliseconds) {
        residentSpeech.delete(residentId);
        continue;
      }
      active.set(residentId, speech.text);
    }
    return active;
  }

  function queue(command: SimCommand): void {
    commandQueue.push(command);
  }

  function physicalReceiptPending(): boolean {
    return pendingAcceptance !== null
      || pendingDelivery !== null
      || pendingRenegotiation !== null
      || pendingReportDelivery !== null;
  }

  function currentControl(): PlayerControl {
    if (player.mode === "swept") {
      if (manualControl.moveX || manualControl.moveY) return manualControl;
      if (adriftTapControl && adriftTapTicksRemaining > 0) {
        return { ...adriftTapControl, brace: manualControl.brace };
      }
      return { moveX: 0, moveY: 0, brace: manualControl.brace };
    }
    if (physicalReceiptPending()) {
      return { moveX: 0, moveY: 0, brace: manualControl.brace };
    }
    if (manualControl.moveX || manualControl.moveY || autopilotPath.length === 0) return manualControl;
    const nextIndex = autopilotPath[0];
    if (nextIndex === undefined) return manualControl;
    const tile = worldView.terrain.tiles[nextIndex];
    if (!tile) {
      autopilotPath = [];
      pendingGatherNodeId = null;
      return manualControl;
    }
    const targetX = tile.x * TILE_UNITS + TILE_UNITS / 2;
    const targetY = tile.y * TILE_UNITS + TILE_UNITS / 2;
    const dx = targetX - player.x;
    const dy = targetY - player.y;
    const steering = steerAutopilotToPoint(dx, dy);
    if (steering.arrived) {
      autopilotPath.shift();
      return currentControl();
    }
    return {
      moveX: steering.moveX,
      moveY: steering.moveY,
      brace: manualControl.brace,
    };
  }

  /**
   * Preserve the strongest meaningful parts of every 100 ms player step until
   * the next authoritative world tick. Residents later receive only contacts
   * their own sensory queries admit; this buffer is never itself NPC knowledge.
   */
  function capturePlayerSenseSample(strongImpact: boolean): void {
    const position = playerWorldPositionInRegionalWindow(regionalTravel.window, player);
    if (position === null) throw new Error("Player has no canonical sensory position");
    const speed = Math.hypot(player.velocityX, player.velocityY);
    const movementSalience = Math.max(
      0,
      Math.min(FIXED_POINT, Math.round(speed * FIXED_POINT / 164)),
    );
    const moved = movementSalience > 0;
    const inWater = player.mode === "wading" || player.mode === "skiff" || player.mode === "swept";
    const tile = worldView.terrain.tiles[playerTileIndex(player)];
    const lightVisibility = tile?.terrain === "marsh"
      ? 550_000
      : tile?.terrain === "ridge" || tile?.terrain === "deep-water"
        ? 900_000
        : 720_000;
    const soundLoudness = strongImpact
      ? FIXED_POINT
      : !moved
        ? 0
        : inWater
          ? Math.max(560_000, movementSalience)
          : player.pace === "swift"
            ? Math.max(720_000, movementSalience)
            : Math.max(360_000, Math.round(movementSalience * 0.72));
    const soundRangeUnits = strongImpact
      ? 28 * TILE_UNITS
      : !moved
        ? 0
        : inWater
          ? 20 * TILE_UNITS
          : player.pace === "swift"
            ? 18 * TILE_UNITS
            : 12 * TILE_UNITS;
    const sample = createPlayerSenseSample({
      id: `p-${world.meta.completedTick}-${nextPlayerSenseSampleOrdinal}`,
      sampleOrdinal: nextPlayerSenseSampleOrdinal,
      position,
      movementSalience,
      lightVisibility,
      soundLoudness,
      soundRangeUnits,
      soundClass: strongImpact ? "impact" : inWater ? "splash" : "footsteps",
      soundInterrupt: strongImpact ? "strong" : "none",
    });
    if (sample === null) throw new Error("Player sensory sample failed validation");
    nextPlayerSenseSampleOrdinal += 1;
    if (playerSenseSamples.length >= HUMAN_PERCEPTION_MAX_PLAYER_SAMPLES) {
      // The fixed runtime normally contributes ten samples. Retain the latest
      // bounded suffix under catch-up pressure rather than growing without end.
      playerSenseSamples = playerSenseSamples.slice(
        playerSenseSamples.length - HUMAN_PERCEPTION_MAX_PLAYER_SAMPLES + 1,
      );
    }
    playerSenseSamples.push(sample);
  }

  function residentPerceptionFrame(
    targetTick: number,
    porterVisual: RuntimePorterVisualFrame | null = null,
  ): ResidentPerceptionFrame {
    const batches = collectExistingHumanObservations({
      world: worldView,
      window: regionalTravel.window,
      targetTick,
      playerSamples: playerSenseSamples,
    });
    const batchByResidentId = new Map<number, (typeof batches)[number]>();
    for (const batch of batches) {
      const resident = world.residents.find(({ id }) => id === batch.residentId);
      if (
        resident === undefined
        || resident.identity.stableId !== batch.observerId
        || batchByResidentId.has(batch.residentId)
      ) {
        throw new Error("Human sensory bridge returned a noncanonical resident batch");
      }
      batchByResidentId.set(batch.residentId, batch);
    }
    const residents = [...world.residents]
      .sort((left, right) => left.id - right.id)
      .map((resident) => {
        const existing = batchByResidentId.get(resident.id)?.observations ?? [];
        if (porterVisual === null || resident.identity.stableId !== porterVisual.actorId) {
          return {
            residentId: resident.id,
            actorId: resident.identity.stableId,
            observations: existing,
          };
        }
        const observations = canonicalizeActorObservations([
          ...existing,
          ...porterVisual.observations,
        ]);
        if (observations.length !== existing.length + porterVisual.observations.length) {
          throw new Error("Dog visual contact could not enter porter cognition");
        }
        return {
          residentId: resident.id,
          actorId: resident.identity.stableId,
          observations,
        };
      });
    return {
      tick: targetTick,
      // A supplied frame is a complete snapshot, not a partial patch. Humans
      // outside the bounded spatial window still receive an explicit empty
      // observation list so no omitted actor can be mistaken for stale data.
      residents,
    };
  }

  function clearPlayerSenseSamples(): void {
    playerSenseSamples = [];
    nextPlayerSenseSampleOrdinal = 0;
  }

  function mirrorPhysicalCargoToPlayer(): void {
    const mirror = projectLooseCargoCarrierToPlayer(physicalCargo.carrier);
    player.craftingInventory = mirror.craftingInventory;
    player.cargo = mirror.cargo.map((cargo) => ({ ...cargo }));
  }

  function applyPlayerStepToPhysicalCargo(
    result: ReturnType<typeof stepPlayer>,
    incidentPosition?: ReturnType<typeof looseCargoPositionAtRegionalPlayer>,
  ): void {
    let carrier = physicalCargo.carrier;
    let changed = false;
    for (const pressure of result.cargoConditionPressures ?? []) {
      for (const lot of carrier.lots.filter((candidate) =>
        candidate.payload.kind === "promise"
        && candidate.payload.contractId === pressure.contractId)) {
        const materialState = {
          ...lot.materialState,
          condition: Math.max(0, lot.materialState.condition - pressure.conditionLoss),
        };
        const mutation = setLooseCargoPromiseMaterialState(carrier, lot.id, materialState);
        if (!mutation.ok) throw new Error(`Promise weathering failed: ${mutation.reason}`);
        carrier = mutation.carrier;
        changed ||= mutation.reason === "applied";
      }
    }
    for (const gear of player.craftingInventory.gear) {
      const lot = carrier.lots.find((candidate) =>
        candidate.payload.kind === "gear" && candidate.payload.gearId === gear.id);
      if (!lot || lot.payload.kind !== "gear") {
        throw new Error(`Physical gear #${gear.id} vanished during service wear`);
      }
      if (lot.materialState.condition === gear.condition) continue;
      const mutation = setLooseCargoGearCondition(carrier, gear.id, gear.condition);
      if (!mutation.ok) throw new Error(`Physical gear wear failed: ${mutation.reason}`);
      carrier = mutation.carrier;
      changed = true;
    }
    if (changed) {
      physicalCargo = commitPhysicalCargoState(
        physicalCargo,
        { looseWorld: physicalCargo.looseWorld, carrier },
        { kind: "conserved" },
      );
    }

    const incident = result.traversalIncident;
    if (incident) {
      const evaluation = result.fallEvaluations.find((candidate) =>
        candidate.usedTraversalOrdinal === incident.traversalOrdinal);
      if (!evaluation) throw new Error("Traversal incident lost its accepted fall evaluation");
      const position = incidentPosition
        ?? looseCargoPositionAtRegionalPlayer(worldView, incident.position.x, incident.position.y);
      // A fall changes only the player's active storage owner, but the
      // authoritative manifest also covers parcels left in every touched
      // region. Include those immutable owners in the incident-time proof so
      // distant physical cargo cannot make a legitimate fall fail closed.
      const otherCargoWorlds = physicalCargoWorlds(physicalCargo).filter(({ region }) =>
        region.x !== physicalCargo.activeRegion.x || region.y !== physicalCargo.activeRegion.y);
      const fall = resolveFallCargo({
        seed: world.meta.rootSeed,
        actorId: incident.actorId,
        evaluation,
        nextTraversalOrdinal: incident.traversalOrdinal,
        world: physicalCargo.looseWorld,
        otherWorlds: otherCargoWorlds,
        carrier: physicalCargo.carrier,
        expectedManifest: physicalCargo.expectedManifest,
        x: position.x,
        y: position.y,
      });
      if (!fall.ok) throw new Error(`Physical fall transaction failed: ${fall.reason}`);
      physicalCargo = commitPhysicalCargoState(
        physicalCargo,
        { looseWorld: fall.world, carrier: fall.carrier },
        { kind: "conserved" },
      );
      if (fall.outcome === "separated") {
        session.sessionChanges.push(
          `${incident.label}; ${fall.separatedEntityIds.length} physical parcel${fall.separatedEntityIds.length === 1 ? "" : "s"} broke loose and remained recoverable.`,
        );
      }
    }

    const cargoInputs = sampleLooseCargoRegionalNeighborhood(
      worldView,
      physicalCargoPartitionsForView(physicalCargo, worldView),
    );
    if (cargoInputs.length > 0) {
      const stepped = stepPhysicalCargoAcrossRegions(physicalCargo, cargoInputs);
      if (!stepped.ok) throw new Error(`Loose cargo simulation failed closed: ${stepped.reason}`);
      physicalCargo = stepped.state;
    }
    mirrorPhysicalCargoToPlayer();
  }

  function scheduleTerrainPrefetch(moveX: number, moveY: number): void {
    const address = regionalAddressAt(worldView, playerTileIndex(player));
    if (!address || (moveX === 0 && moveY === 0)) return;
    const center = regionalTravel.stream.center;
    const centers: ReturnType<typeof createRegionCoord>[] = [];
    const appendCenter = (x: number, y: number): void => {
      try {
        const candidate = createRegionCoord(x, y);
        if (!centers.some((value) => regionKey(value) === regionKey(candidate))) {
          centers.push(candidate);
        }
      } catch {
        // The numeric envelope is a representation guard, never a wrapped edge.
      }
    };

    if (regionKey(address.region) !== regionKey(center)) {
      appendCenter(address.region.x, address.region.y);
    } else {
      const shiftX = moveX < 0 && address.localX < TERRAIN_PREFETCH_MARGIN_TILES
        ? -1
        : moveX > 0 && address.localX >= WORLD_WIDTH - TERRAIN_PREFETCH_MARGIN_TILES
          ? 1
          : 0;
      const shiftY = moveY < 0 && address.localY < TERRAIN_PREFETCH_MARGIN_TILES
        ? -1
        : moveY > 0 && address.localY >= WORLD_HEIGHT - TERRAIN_PREFETCH_MARGIN_TILES
          ? 1
          : 0;
      if (shiftX !== 0) appendCenter(center.x + shiftX, center.y);
      if (shiftY !== 0) appendCenter(center.x, center.y + shiftY);
      if (shiftX !== 0 && shiftY !== 0) {
        appendCenter(center.x + shiftX, center.y + shiftY);
      }
    }
    if (centers.length === 0) {
      for (const job of terrainPrefetchJobs) job.cancel();
      terrainPrefetchJobs = [];
      return;
    }
    const loadedKeys = new Set(regionalTravel.stream.loaded.map(({ key }) => key));
    const planned = centers.flatMap((candidateCenter) =>
      desiredRegionCoords(candidateCenter, regionalTravel.stream.config));
    const neededKeys = new Set(planned.map(regionKey).filter((key) => !loadedKeys.has(key)));
    terrainPrefetchJobs = terrainPrefetchJobs.filter((job) => {
      if (neededKeys.has(job.key)) return true;
      job.cancel();
      return false;
    });
    const queuedKeys = new Set(terrainPrefetchJobs.map(({ key }) => key));
    for (const coord of planned) {
      const key = regionKey(coord);
      if (loadedKeys.has(key) || queuedKeys.has(key)) continue;
      const job = createTerrainRegionPrefetchJob(world.meta.rootSeed, coord);
      if (!job.complete) {
        terrainPrefetchJobs.push(job);
        queuedKeys.add(key);
      }
      if (terrainPrefetchJobs.length >= TERRAIN_PREFETCH_MAX_JOBS) return;
    }
  }

  function advanceTerrainPrefetch(): void {
    while (terrainPrefetchJobs[0]?.complete) terrainPrefetchJobs.shift();
    const job = terrainPrefetchJobs[0];
    if (!job) return;
    job.step(TERRAIN_PREFETCH_TILE_BUDGET);
    if (job.complete) terrainPrefetchJobs.shift();
  }

  function tick(): void {
    if (session.paused || session.titleVisible || session.quietHourVisible) return;
    advancePendingParcelTarget();
    const beforeX = player.x;
    const beforeY = player.y;
    const acceptedControl = currentControl();
    lastAdriftControl = player.mode === "swept"
      ? { ...acceptedControl }
      : { moveX: 0, moveY: 0, brace: acceptedControl.brace };
    const result = stepPlayer(player, worldView, acceptedControl, {
      seed: world.meta.rootSeed,
      actorId: 0,
      feedback: traversalFeedback,
      deferFallCargoConsequence: true,
    });
    scheduleTerrainPrefetch(player.x - beforeX, player.y - beforeY);
    advanceTerrainPrefetch();
    if (result.traversalFeedback) traversalFeedback = result.traversalFeedback;
    promiseJourney = advanceRegionalPromiseJourney(
      promiseJourney,
      player,
      economyView,
      worldView,
    );
    const acceptedDistance = Math.round(Math.hypot(player.x - beforeX, player.y - beforeY));
    const incidentPosition = result.traversalIncident
      ? looseCargoPositionAtRegionalPlayer(
          worldView,
          result.traversalIncident.position.x,
          result.traversalIncident.position.y,
        )
      : undefined;
    const priorRegionalWindow = regionalTravel.window;
    const regionalTransition = recenterRegionalPlayer(
      world.meta.rootSeed,
      regionalTravel,
      player,
    );
    regionalTravel = regionalTransition.state;
    if (regionalTransition.crossed) {
      physicalCargo = transitionPhysicalCargoRegion(
        physicalCargo,
        regionalTransition.to,
        WORLD_WIDTH,
        WORLD_HEIGHT,
      );
    }
    if (regionalTransition.rebased) {
      autopilotPath = rebaseRegionalWindowPath(
        priorRegionalWindow,
        regionalTransition.state.window,
        autopilotPath,
      );
      rebuildRegionalWorldView();
      regionalEcology = rebaseRuntimeRegionalEcologyState(
        regionalEcology,
        world,
        bio0Ecology,
        worldView,
        economyView,
      );
    } else if (regionalTransition.crossed) {
      // Crossing an invisible persistence-cell boundary does not imply that
      // the bounded visible frame moved. Retarget metadata in place so the
      // renderer keeps the exact same terrain/camera objects across the seam.
      rebindRegionalWorldViewWindow(worldView, regionalTransition.state.window);
    }
    if (adriftTapTicksRemaining > 0) adriftTapTicksRemaining -= 1;
    if (adriftTapTicksRemaining <= 0 || player.mode !== "swept") {
      adriftTapControl = null;
      adriftTapTicksRemaining = 0;
    }
    applyPlayerStepToPhysicalCargo(result, incidentPosition);
    capturePlayerSenseSample(result.traversalIncident !== null || result.becameSwept);
    if (result.enteredTile !== null && result.settlementId !== null) {
      recordHarborArrival(result.settlementId);
      const unlockedTool = unlockFieldToolAtSettlement(player, worldView, result.settlementId);
      if (unlockedTool) {
        const harborName = settlementName(economyView, result.settlementId);
        session.sessionChanges.push(`${harborName} entrusted you with ${FIELD_TOOL_LABELS[unlockedTool].toLocaleLowerCase()}.`);
        announce(
          session,
          `${harborName}'s completed civic work adds ${FIELD_TOOL_LABELS[unlockedTool]} to your field kit. ${fieldToolEffect(unlockedTool)}`,
          true,
        );
        soundscape.play("strand", 0.68);
      }
    }
    session.sessionPlayMilliseconds += FIXED_STEP_MS;
    session.sessionDistanceUnits += acceptedDistance;
    playerStepsSinceWorldTick += 1;
    const worldAdvanced = playerStepsSinceWorldTick >= PLAYER_STEPS_PER_WORLD_TICK;
    if (worldAdvanced) {
      playerStepsSinceWorldTick = 0;
      const elapsedWeather = { ...world.weather };
      const targetTick = world.meta.completedTick + 1;
      const priorPorter = runtimeBio0Porter(
        economyView,
        bio0Ecology.porterAddress.actorId,
      );
      const priorWorkingDogs = dogActorRoster.actors.map(({ address }) => address);
      const ecologyWindow = {
        origin: regionalTravel.window.origin,
        terrain: {
          width: worldView.terrain.width,
          height: worldView.terrain.height,
        },
      };
      const regionalEcologyProjectionForStep = projectRegionalEcologyActiveState(
        regionalEcology,
        ecologyWindow,
      );
      if (regionalEcologyProjectionForStep === null) {
        throw new Error("Regional ecology materialization could not be resolved");
      }
      const projectedEcologySources = regionalEcologyProjectionForStep.residents;
      const projectedHomeSource = projectedEcologySources.find(({ sourceKey }) => (
        sourceKey === regionalEcology.settlementHome.sourceKey
      )) ?? null;
      const coreEcologyForStep = projectedHomeSource?.patch
        ?? regionalEcology.settlementHome.patch;
      const materializedCoreActors = projectedEcologySources
        .flatMap(({ patch }) => patch.populations.flatMap(({ members }) => members))
        .filter(({ materialization }) => materialization === "materialized")
        .map(({ actor }) => actor);
      const localMaterializedCoreActors = materializedCoreActors.filter(({ address }) => (
        livingActorAddressInRegionalWindow(address, regionalTravel.window) !== null
      ));
      const localMaterializedCoreActorIds = localMaterializedCoreActors
        .map(({ identity }) => identity.stableId)
        .sort(compareText);
      const localMaterializedCoreActorIdSet = new Set(localMaterializedCoreActorIds);
      const coreEcologyPerceptionPatches = projectedEcologySources.map(({ patch }) => {
        const materializedIds = patch.populations
          .flatMap(({ members }) => members)
          .filter(({ materialization }) => materialization === "materialized")
          .map(({ actor }) => actor.identity.stableId);
        const localIds = materializedIds.filter((actorId) => (
          localMaterializedCoreActorIdSet.has(actorId)
        ));
        if (localIds.length === materializedIds.length) return patch;
        try {
          // The canonical source keeps its whole group-atomic admission. This
          // transient observer view narrows only perception ownership to
          // bodies inside the loaded signed frame.
          return setCoreEcologyAggregatePatchMaterializedActors(patch, {
            atTick: patch.updatedAtTick,
            actorIds: localIds,
          });
        } catch {
          throw new Error("Core ecology local perception ownership could not be resolved");
        }
      });
      const playerWorldPosition = playerWorldPositionInRegionalWindow(
        regionalTravel.window,
        player,
      );
      if (playerWorldPosition === null) {
        throw new Error("Player living-actor address could not be resolved");
      }
      const playerHeading = Math.round((
        ((player.facingMilliRadians / 1_000) / (Math.PI * 2) + 1) % 1
      ) * FIXED_POINT);
      const playerAddress = createLivingActorAddress({
        actorId: LOCAL_PLAYER_SUBJECT_ID,
        species: "human",
        position: playerWorldPosition,
        heading: playerHeading,
        persistence: "promoted",
      });
      const corePerceptionFrame = {
        actors: localMaterializedCoreActors,
        participants: [
          ...runtimeDogActors(bio0Ecology, dogActorRoster).map(({ address }) => ({
            address,
            contactScope: "all-participants" as const,
          })),
          { address: priorPorter.address, contactScope: "core-only" as const },
          { address: playerAddress, contactScope: "core-only" as const },
        ],
        world: worldView,
        window: regionalTravel.window,
        tick: targetTick,
      };
      const coreVisualObservations = collectCoreEcologyVisualObservationBatches(
        corePerceptionFrame,
      );
      if (coreVisualObservations === null) {
        throw new Error("Core ecology visual perception could not be resolved");
      }
      const coreAggregateActivityObservationBatches =
        collectCoreEcologyRootAggregateActivityObservationBatches({
          ...corePerceptionFrame,
          patches: coreEcologyPerceptionPatches,
        });
      if (coreAggregateActivityObservationBatches === null) {
        throw new Error("Root-wide core ecology aggregate activity perception could not be resolved");
      }
      const coreAlarmObservationBatches: Array<readonly CoreEcologyObservationBatch[]> = [];
      const coreAlarms = projectedEcologySources.flatMap(({ patch }) => (
        runtimeCoreAlarmEvents(patch)
      )).filter(({ actorId }) => localMaterializedCoreActorIdSet.has(actorId));
      for (const alarm of coreAlarms) {
        const propagated = propagateCoreEcologyAlarmObservationBatches(
          alarm,
          corePerceptionFrame,
        );
        if (propagated === null) {
          throw new Error("Core ecology alarm perception could not be resolved");
        }
        coreAlarmObservationBatches.push(propagated);
      }
      const coreObservationBatches: Array<readonly CoreEcologyObservationBatch[]> = [
        coreVisualObservations,
        coreAggregateActivityObservationBatches,
        ...coreAlarmObservationBatches,
      ];
      const bio0Simulation = resolveLivingActorSimulationPolicy({
        participants: [bio0Ecology.dog.address, priorPorter.address],
        loadedWindow: {
          origin: regionalTravel.window.origin,
          terrain: {
            width: worldView.terrain.width,
            height: worldView.terrain.height,
          },
        },
      });
      if (bio0Simulation === null) {
        throw new Error("BIO0 active simulation policy could not be resolved");
      }
      const dogVisualObservations: ActorObservation[] = [];
      for (const dog of runtimeDogActors(bio0Ecology, dogActorRoster)) {
        const workingAssignment = settlementWorkingAnimals.assignments.find(({ workerActorId }) => (
          workerActorId === dog.identity.stableId
        ));
        // The keeper routinely watches the authenticated pen worksite attached
        // to this dog relationship. Attention must not switch because hidden
        // task phase changed: identical physical/perception frames receive the
        // same facing and range policy.
        const knownWorksiteFocus = workingAssignment === undefined
          ? null
          : settlementWorkingAnimalReturnArea(workingAssignment)?.center ?? null;
        const observations = runtimePorterDogVisualObservations(
          worldView,
          regionalTravel.window,
          priorPorter.address,
          dog.address,
          targetTick,
          knownWorksiteFocus,
        );
        if (observations === null) {
          throw new Error("Dog visual contact could not be resolved");
        }
        dogVisualObservations.push(...observations);
      }
      const canonicalDogVisualObservations = canonicalizeActorObservations(
        dogVisualObservations,
      );
      if (canonicalDogVisualObservations.length !== dogVisualObservations.length) {
        throw new Error("Dog visual contacts could not be canonicalized");
      }
      const dogCoreObservations = bio0Simulation.mode === "full"
        ? mergeRuntimeCoreObservationBatches(
            bio0Ecology.dog.identity.stableId,
            coreObservationBatches,
          )
        : Object.freeze([] as ActorObservation[]);
      const porterCoreObservations = mergeRuntimeCoreObservationBatches(
        priorPorter.address.actorId,
        coreObservationBatches,
      );
      const playerCoreObservations = mergeRuntimeCoreObservationBatches(
        playerAddress.actorId,
        coreObservationBatches,
      );
      if (
        dogCoreObservations === null
        || porterCoreObservations === null
        || playerCoreObservations === null
      ) {
        throw new Error("Core ecology observations could not enter living-actor cognition");
      }
      const porterWorldObservations = canonicalizeActorObservations([
        ...canonicalDogVisualObservations,
        ...porterCoreObservations,
      ]);
      if (
        porterWorldObservations.length
        !== canonicalDogVisualObservations.length + porterCoreObservations.length
      ) {
        throw new Error("Porter world observations could not be canonicalized");
      }
      const perceptionFrame = residentPerceptionFrame(targetTick, {
        actorId: priorPorter.address.actorId,
        observations: porterWorldObservations,
      });
      world = stepWorld(world, commandQueue, perceptionFrame);
      const completedEconomyView = createWorldView(world);
      const completedRegionalView = createRegionalWorldView(
        completedEconomyView,
        regionalTravel.window,
        { discovered: player.discovered, depthSoundings: player.depthSoundings },
      );
      const porter = runtimeBio0Porter(
        completedEconomyView,
        bio0Ecology.porterAddress.actorId,
      );
      const sightAdvancedRecovery = advanceRuntimeDomesticRecoveryFromCaretakerSight({
        state: settlementDomesticAnimalRecovery,
        settlement: settlementEcology,
        core: coreEcologyForStep,
        caretakerActorId: porter.address.actorId,
        caretakerPerception: porter.resident.perception,
        observations: porterCoreObservations,
        atTick: world.meta.completedTick,
      });
      if (sightAdvancedRecovery === null) {
        throw new Error("Domestic-animal recovery sight transition was rejected");
      }
      settlementDomesticAnimalRecovery = sightAdvancedRecovery;
      const bio0Traversability = bio0Simulation.allowPhysicalMovement
        ? createRuntimeBio0Traversability(
            bio0Ecology,
            completedRegionalView,
            world.meta.completedTick,
          )
        : null;
      const bio0Accessibility = bio0Simulation.allowPhysicalMovement
        ? bio0Traversability === null
          ? null
          : runtimeBio0ActionAccessibility(bio0Ecology, bio0Traversability)
        : BIO0_COARSE_ACTION_ACCESSIBILITY;
      if (
        bio0Accessibility === null
        || (bio0Simulation.allowPhysicalMovement && bio0Traversability === null)
      ) {
        throw new Error("BIO0 traversability could not be resolved");
      }
      let ecologyForStep = bio0Ecology;
      let acceptedPorterResponse: PorterResponseState | null = null;
      let offeredContact: OfferedProvisionContact | null = null;
      const responseInput = runtimePorterResponseInput(
        porterResponse,
        porter,
        ecologyForStep,
        elapsedWeather,
        bio0Simulation.mode === "full",
        targetTick,
      );
      if (responseInput === null) {
        throw new Error("BIO0 porter response input could not be resolved");
      }
      if (responseInput.current.nextThinkTick <= targetTick) {
        for (const request of runtimeActionableLivingActorRequests(
          livingActorPlayerChoice,
          targetTick,
        )) {
          const enactment = enactLivingActorAction({
            version: LIVING_ACTOR_ACTION_ENACTMENT_VERSION,
            requestId: request.actionId,
            choiceState: livingActorPlayerChoice,
            porter: {
              ...responseInput,
              cargo: ecologyForStep.cargo,
              current: responseInput.current,
            },
            receiverContainerId: request.effect.kind === "request-provision-offer"
              ? ecologyForStep.foodSource.receiverContainerId
              : null,
          });
          if (enactment.reason === "request-expired") continue;
          if (
            !enactment.ok
            || enactment.cargo === null
            || enactment.porterState === null
          ) {
            throw new Error(`BIO0 living-actor enactment rejected: ${enactment.reason}`);
          }
          if (enactment.reason === "already-applied" && enactment.contact === null) {
            continue;
          }
          const adopted = adoptBio0ActorCargoState(ecologyForStep, enactment.cargo);
          if (adopted === null) {
            throw new Error("BIO0 enactment cargo could not be adopted");
          }
          ecologyForStep = adopted;
          acceptedPorterResponse = enactment.porterState;
          offeredContact = enactment.contact;
          break;
        }
      }
      if (acceptedPorterResponse === null) {
        acceptedPorterResponse = stepRuntimePorterResponse(
          porterResponse,
          porter,
          ecologyForStep,
          elapsedWeather,
          bio0Simulation.mode === "full",
          targetTick,
        );
      }
      if (acceptedPorterResponse === null) {
        throw new Error("BIO0 porter response step rejected");
      }
      const stepAccessibility = offeredContact === null
        ? bio0Accessibility
        : Object.freeze({ ...bio0Accessibility, eat: true });
      const bio0Step = stepBio0Ecology(ecologyForStep, {
        tick: world.meta.completedTick,
        porterAddress: porter.address,
        exposure: bio0ExposureFromCompletedWeather(elapsedWeather),
        wind: { x: elapsedWeather.windX, y: elapsedWeather.windY },
        accessibility: stepAccessibility,
        foodContact: offeredContact,
        additionalDogObservations: dogCoreObservations,
        simulationMode: bio0Simulation.mode,
      });
      const movedBio0 = bio0Step.ok
        ? bio0Simulation.allowPhysicalMovement
          ? resolveRuntimeBio0Locomotion(bio0Step.state, bio0Traversability!)
          : bio0Step.state
        : null;
      const acceptedBio0 = bio0Step.ok
        && movedBio0 !== null
        ? canonicalRuntimeBio0Ecology(movedBio0, world, completedEconomyView)
        : null;
      if (acceptedBio0 === null) {
        throw new Error(`BIO0 ecology step rejected: ${bio0Step.reason}`);
      }
      bio0Ecology = acceptedBio0;
      const workingDogStep = stepRuntimeSettlementWorkingDog({
        roster: dogActorRoster,
        workingAnimals: settlementWorkingAnimals,
        settlement: settlementEcology,
        handler: porter,
        world,
        regionalView: completedRegionalView,
        weather: elapsedWeather,
        observationBatches: coreObservationBatches,
        handlerSearchReport: runtimeDomesticRecoveryHandlerSearchReport(
          settlementDomesticAnimalRecovery,
          settlementWorkingAnimals,
        ),
      });
      if (workingDogStep === null) {
        throw new Error("Settlement working dog step rejected");
      }
      dogActorRoster = workingDogStep.roster;
      settlementWorkingAnimals = workingDogStep.workingAnimals;
      const searchLinkedRecovery = advanceRuntimeDomesticRecoveryFromWorkingSearch({
        state: settlementDomesticAnimalRecovery,
        settlement: settlementEcology,
        core: coreEcologyForStep,
        workingAnimals: settlementWorkingAnimals,
        atTick: world.meta.completedTick,
      });
      if (searchLinkedRecovery === null) {
        throw new Error("Domestic-animal recovery search linkage was rejected");
      }
      settlementDomesticAnimalRecovery = searchLinkedRecovery;
      const regionalRootForStep = advanceRegionalEcologyRoot(
        regionalEcology.root,
        world.meta.completedTick,
      );
      const ecologySourcesForStep = [
        ...projectedEcologySources,
        ...(projectedHomeSource === null
          ? [{
              kind: "settlement-home" as const,
              sourceKey: regionalEcology.settlementHome.sourceKey,
              region: regionalEcology.settlementHome.region,
              sourcePatchHash: regionalEcology.settlementHome.patchHash,
              projectedPatchHash: regionalEcology.settlementHome.patchHash,
              patch: regionalEcology.settlementHome.patch,
            }]
          : []),
      ];
      const physicalOwnersForStep = runtimeRegionalCorePhysicalOwnerIndex(
        ecologySourcesForStep,
      );
      if (physicalOwnersForStep === null) {
        throw new Error("Regional ecology physical ownership is ambiguous");
      }
      const preparedCoreSteps: Array<Readonly<{
        kind: (typeof ecologySourcesForStep)[number]["kind"];
        sourceKey: string;
        beforePatch: CoreEcologyAggregatePatchState;
        validateAcceptedPatch: (
          patch: CoreEcologyAggregatePatchState,
        ) => CoreEcologyAggregatePatchState | null;
        prepared: NonNullable<ReturnType<typeof stepRuntimeCoreEcology>>;
      }>> = [];
      for (const source of ecologySourcesForStep) {
        const activityAuthorities = runtimeCoreEcologyActivityAuthorities(
          world.meta.rootSeed,
          regionalEcology.root,
          source,
        );
        if (activityAuthorities === null) {
          throw new Error(
            `Regional ecology source ${source.sourceKey} lost activity authority`,
          );
        }
        const sourceLocalActorIds = source.patch.populations
          .flatMap(({ members }) => members)
          .filter(({ actor, materialization }) => (
            materialization === "materialized"
            && localMaterializedCoreActorIdSet.has(actor.identity.stableId)
          ))
          .map(({ actor }) => actor.identity.stableId)
          .sort(compareText);
        const validateAcceptedPatch = (patch: CoreEcologyAggregatePatchState) => {
          if (source.kind === "settlement-home") {
            return canonicalRuntimeSettlementHomeCoreEcology(
              patch,
              world,
              bio0Ecology,
              completedEconomyView,
            );
          }
          if (source.kind === "legacy-cohort") {
            return canonicalRegionalEcologyLegacyCohortPatchForWorld(patch, {
              rootSeed: world.meta.rootSeed,
              root: regionalRootForStep,
              completedTick: world.meta.completedTick,
            });
          }
          return canonicalCoreEcologyRegionalResidentPatchForRoot(patch, {
            seed: world.meta.rootSeed,
            root: regionalRootForStep,
            region: source.region,
            completedTick: world.meta.completedTick,
          });
        };
        const coreStep = stepRuntimeCoreEcology(
          source.patch,
          world,
          worldView,
          completedRegionalView,
          physicalCargo,
          settlementEcology,
          physicalOwnersForStep,
          coreObservationBatches,
          sourceLocalActorIds,
          activityAuthorities,
        );
        if (coreStep === null) {
          throw new Error(`Regional ecology source ${source.sourceKey} rejected its step`);
        }
        preparedCoreSteps.push({
          kind: source.kind,
          sourceKey: source.sourceKey,
          beforePatch: source.patch,
          validateAcceptedPatch,
          prepared: coreStep,
        });
      }
      const regionalMortality = resolveRuntimeRegionalCoreMortality(
        preparedCoreSteps.map(({ sourceKey, prepared }) => ({
          sourceKey,
          patch: prepared.patch,
          localActorIds: prepared.localActorIds,
          currentLivePreyByAttacker: prepared.currentLivePreyByAttacker,
        })),
        world.meta.completedTick,
      );
      if (regionalMortality === null) {
        throw new Error("Regional ecology mortality transaction was rejected");
      }
      const postMortalityOwners = runtimeRegionalCorePhysicalOwnerIndex(
        preparedCoreSteps.map(({ sourceKey }) => ({
          sourceKey,
          patch: regionalMortality.patches.get(sourceKey)!,
        })),
      );
      if (postMortalityOwners === null) {
        throw new Error("Regional ecology mortality produced ambiguous ownership");
      }
      const coreSteps: Array<Readonly<{
        kind: (typeof ecologySourcesForStep)[number]["kind"];
        sourceKey: string;
        beforePatch: CoreEcologyAggregatePatchState;
        validateAcceptedPatch: (
          patch: CoreEcologyAggregatePatchState,
        ) => CoreEcologyAggregatePatchState | null;
        result: RuntimeCoreEcologyFinishedStep;
      }>> = [];
      for (const preparedSource of preparedCoreSteps) {
        const mortalityPatch = regionalMortality.patches.get(preparedSource.sourceKey);
        if (mortalityPatch === undefined) {
          throw new Error("Regional ecology mortality lost an owner");
        }
        const finished = finishRuntimeCoreEcologyStep(
          preparedSource.prepared,
          mortalityPatch,
          completedRegionalView,
          world.meta.completedTick,
          postMortalityOwners,
          preparedSource.validateAcceptedPatch,
        );
        if (finished === null) {
          throw new Error(`Regional ecology source ${preparedSource.sourceKey} rejected finalization`);
        }
        coreSteps.push({
          kind: preparedSource.kind,
          sourceKey: preparedSource.sourceKey,
          beforePatch: preparedSource.beforePatch,
          validateAcceptedPatch: preparedSource.validateAcceptedPatch,
          result: finished,
        });
      }
      const allCoreMortalityEvents = regionalMortality.events;
      const homeCoreStep = coreSteps.find(({ kind }) => kind === "settlement-home");
      if (homeCoreStep === undefined) {
        throw new Error("Regional ecology step lost the settlement-home owner");
      }
      const topologyAdvancedRecovery = advanceRuntimeDomesticRecoveryFromGroupEvents({
        state: settlementDomesticAnimalRecovery,
        settlement: settlementEcology,
        core: homeCoreStep.result.patch,
        events: homeCoreStep.result.groupEvents,
        atTick: world.meta.completedTick,
      });
      if (topologyAdvancedRecovery === null) {
        throw new Error("Domestic-animal recovery topology transition was rejected");
      }
      settlementDomesticAnimalRecovery = topologyAdvancedRecovery;
      const playerEventTimeAlarmObservations: ActorObservation[] = [];
      for (const event of coreSteps.flatMap(({ result }) => result.events)) {
        if (
          event.kind !== "alarm"
          || !localMaterializedCoreActorIdSet.has(event.actorId)
        ) continue;
        const propagated = propagateCoreEcologyAlarmObservationBatches(
          event,
          corePerceptionFrame,
        );
        const heardByPlayer = propagated === null
          ? null
          : mergeRuntimeCoreObservationBatches(playerAddress.actorId, [propagated]);
        if (heardByPlayer === null) {
          throw new Error("Core ecology event-time player hearing could not be resolved");
        }
        playerEventTimeAlarmObservations.push(...heardByPlayer);
      }
      const canonicalPlayerEventTimeAlarms = canonicalizeActorObservations(
        playerEventTimeAlarmObservations,
      );
      if (canonicalPlayerEventTimeAlarms.length !== playerEventTimeAlarmObservations.length) {
        throw new Error("Core ecology event-time player hearing could not be canonicalized");
      }
      const resolvedRegionalResources = resolveRuntimeRegionalCoreResourceClaims(
        coreSteps.map(({ sourceKey, result: sourceStep, validateAcceptedPatch }) => ({
          sourceKey,
          patch: sourceStep.patch,
          claims: sourceStep.resourceClaims,
          validateAcceptedPatch,
        })),
        physicalCargo,
        settlementEcology,
        world,
        bio0Ecology,
      );
      if (resolvedRegionalResources === null) {
        throw new Error("Core ecology physical resource claims could not be resolved");
      }
      const resolvedHomePatch = resolvedRegionalResources.patches.get(
        regionalEcology.settlementHome.sourceKey,
      );
      if (resolvedHomePatch === undefined) {
        throw new Error("Resource arbitration lost settlement-home ecology");
      }
      const resolvedCoreResources = {
        patch: resolvedHomePatch,
        physicalCargo: resolvedRegionalResources.physicalCargo,
        settlementEcology: resolvedRegionalResources.settlementEcology,
        consumed: resolvedRegionalResources.consumed,
      };
      settlementEcology = resolvedCoreResources.settlementEcology;
      const aggregateFoodSources = runtimeCoreAggregateExposedFoodSources(
        resolvedCoreResources.physicalCargo,
        settlementEcology,
        completedRegionalView,
        resolvedCoreResources.patch,
      );
      if (aggregateFoodSources === null) {
        throw new Error("Settlement-shadows physical food projection could not be bounded");
      }
      const settlementShadowsFrame = deriveCoreEcologySettlementShadowsStimulusFrame({
        patch: resolvedCoreResources.patch,
        world: completedRegionalView,
        window: regionalTravel.window,
        tick: world.meta.completedTick,
        visualSources: runtimeCoreAggregateVisualSources({
          beforePatches: projectedEcologySources.map(({ patch }) => patch),
          afterPatches: [...resolvedRegionalResources.patches.values()],
          selectionPatch: resolvedCoreResources.patch,
          beforeDogs: [ecologyForStep.dog.address, ...priorWorkingDogs],
          afterDogs: [
            bio0Ecology.dog.address,
            ...dogActorRoster.actors.map(({ address }) => address),
          ],
          beforePorter: priorPorter.address,
          afterPorter: porter.address,
          player: playerAddress,
          playerMoved: result.moved,
        }),
        exposedFoodSources: aggregateFoodSources,
      });
      if (settlementShadowsFrame === null) {
        throw new Error("Settlement-shadows perception frame could not be resolved");
      }
      const settlementRatAttraction = proposeSettlementRatAttraction(
        settlementEcology,
        resolvedCoreResources.patch,
        settlementShadowsFrame,
      );
      const settlementShadows = stepCoreEcologySettlementShadows(
        resolvedCoreResources.patch,
        world.meta.completedTick,
        settlementShadowsFrame,
      );
      if (settlementShadows === null) {
        throw new Error("Settlement-shadows ecology could not advance atomically");
      }
      let settlementFoodLossApplied = false;
      if (settlementRatAttraction !== null) {
        const orderedEvents = [...settlementShadows.events].sort((left, right) => (
          left.eventId < right.eventId ? -1 : left.eventId > right.eventId ? 1 : 0
        ));
        for (const event of orderedEvents) {
          const staged = stageSettlementFoodLoss(
            settlementEcology,
            settlementRatAttraction,
            settlementShadows.patch,
            event,
          );
          if (staged === null) continue;
          const resolved = resolveSettlementFoodLoss(staged.state, staged.transaction);
          if (resolved === null) {
            throw new Error("Settlement storehouse loss could not resolve atomically");
          }
          settlementEcology = resolved.state;
          settlementFoodLossApplied = resolved.applied;
          break;
        }
      }
      const finalRegionalPatches = new Map(resolvedRegionalResources.patches);
      finalRegionalPatches.set(
        regionalEcology.settlementHome.sourceKey,
        settlementShadows.patch,
      );
      const committedRegionalEcology = commitRegionalEcologyActiveProjection(
        regionalEcology,
        regionalEcologyProjectionForStep,
        {
          root: regionalRootForStep,
          rootSeed: world.meta.rootSeed,
          settlementHome: projectedHomeSource === null
            ? {
                sourceKey: regionalEcology.settlementHome.sourceKey,
                patch: settlementShadows.patch,
              }
            : null,
          residents: regionalEcologyProjectionForStep.residents.map(({ sourceKey }) => {
            const patch = finalRegionalPatches.get(sourceKey);
            if (patch === undefined) {
              throw new Error(`Regional ecology commit lost source ${sourceKey}`);
            }
            return { sourceKey, patch };
          }),
        },
      );
      if (committedRegionalEcology === null) {
        throw new Error("Regional ecology sources could not commit atomically");
      }
      const acceptedRegionalEcology = canonicalRuntimeRegionalEcologyState(
        committedRegionalEcology,
        world,
        bio0Ecology,
        completedEconomyView,
      );
      if (acceptedRegionalEcology === null) {
        throw new Error("Committed regional ecology failed its world binding");
      }
      regionalEcology = acceptedRegionalEcology;
      coreEcology = regionalEcology.settlementHome.patch;
      physicalCargo = resolvedCoreResources.physicalCargo;
      porterResponse = acceptedPorterResponse;
      clearPlayerSenseSamples();
      commandQueue = [];
      fieldResourceEcology = advanceFieldResourceEcology(
        fieldResourceCatalog,
        fieldResourceEcology,
        1,
        elapsedWeather,
      );
      rebuildRegionalWorldView();
      const eventPerception = projectPerception(worldView, player);
      const coreEventObservation = {
        window: {
          origin: regionalTravel.window.origin,
          terrain: {
            width: worldView.terrain.width,
            height: worldView.terrain.height,
          },
        },
        perception: eventPerception,
      } as const;
      const witnessedCoreWildlife = [...finalRegionalPatches.values()].flatMap((patch) => {
        const projected = projectCoreEcologyWildlife({
          patch,
          window: coreEventObservation.window,
          perception: eventPerception,
          tileSize: RENDER_TILE_SIZE,
        });
        if (projected === null) {
          throw new Error("Core ecology event perception could not be projected");
        }
        return projected;
      });
      const witnessedCoreBeforeMortality = coreSteps.flatMap(({ beforePatch }) => {
        const projected = projectCoreEcologyWildlife({
          patch: beforePatch,
          window: coreEventObservation.window,
          perception: eventPerception,
          tileSize: RENDER_TILE_SIZE,
        });
        if (projected === null) {
          throw new Error("Core ecology pre-mortality perception could not be projected");
        }
        return projected;
      });
      const witnessedCoreById = new Map(witnessedCoreWildlife.map((animal) => (
        [animal.actorId, animal] as const
      )));
      const witnessedCoreBeforeById = new Map(witnessedCoreBeforeMortality.map((animal) => (
        [animal.actorId, animal] as const
      )));
      const allCoreStepEvents = coreSteps.flatMap(({ result }) => result.events);
      const directlyWitnessedCoreEventIds = new Set(allCoreStepEvents
        .filter((event) => isWildlifeWorldPositionDirectlyObserved(
          event.position,
          coreEventObservation,
        ))
        .map(({ eventId }) => eventId));
      const witnessedAggregateEvidence = [...finalRegionalPatches.values()].flatMap((patch) => {
        const projected = projectCoreEcologyAggregateEvidence({
          patch,
          window: coreEventObservation.window,
          perception: eventPerception,
          tileSize: RENDER_TILE_SIZE,
        });
        if (projected === null) {
          throw new Error("Aggregate wildlife event perception could not be projected");
        }
        return projected.renderEvidence;
      });
      const lawfullyHeardAlarm = canonicalPlayerEventTimeAlarms.some((observation) => (
        observation.channel === "hearing"
        && observation.perceivedClass === "animal-alarm"
      ));
      const heardAggregateCues = [...finalRegionalPatches.values()].flatMap((patch) => {
        const projected = projectCoreEcologyAggregateHeardCues({
          patch,
          player: playerAddress,
          tick: world.meta.completedTick,
          window: regionalTravel.window,
          world: worldView,
        });
        if (projected === null) {
          throw new Error("Aggregate wildlife hearing could not be projected");
        }
        return projected;
      });
      let ecologyConsequenceAnnounced = false;
      for (const event of allCoreMortalityEvents) {
        if (!isWildlifeWorldPositionDirectlyObserved(
          event.victimPosition,
          coreEventObservation,
        )) continue;
        const victim = witnessedCoreBeforeById.get(event.victimId);
        if (victim === undefined) continue;
        const attacker = witnessedCoreBeforeById.get(event.attackerId)
          ?? witnessedCoreById.get(event.attackerId);
        const victimLabel = victim.identityLabel.toLowerCase();
        announce(
          session,
          attacker === undefined
            ? event.outcome === "death"
              ? `${victim.identityLabel} falls. The body remains where it fell.`
              : `${victim.identityLabel} is hurt.`
            : event.outcome === "death"
              ? `${attacker.identityLabel} brings down ${victimLabel}. The body remains where it fell.`
              : `${attacker.identityLabel} strikes ${victimLabel}. The animal is hurt.`,
        );
        ecologyConsequenceAnnounced = true;
      }
      if (
        settlementFoodLossApplied
        && isWildlifeWorldPositionDirectlyObserved(
          settlementEcology.identity.position,
          coreEventObservation,
        )
      ) {
        announce(
          session,
          "One produce bundle is ruined inside the open storehouse.",
        );
        ecologyConsequenceAnnounced = true;
      }
      for (const consumption of resolvedCoreResources.consumed) {
        const animal = witnessedCoreById.get(consumption.actorId);
        if (animal === undefined) continue;
        if (consumption.source === "wildlife-carcass") {
          const body = finalRegionalPatches.get(consumption.ownerSourceKey)?.carcasses.find(
            ({ carcassId }) => carcassId === consumption.resourceId,
          );
          if (
            body === undefined
            || !isWildlifeWorldPositionDirectlyObserved(
              body.deathPosition,
              coreEventObservation,
            )
          ) continue;
        }
        announce(
          session,
          consumption.source === "settlement-store"
            ? `${animal.identityLabel} eats one produce unit from the open store. The physical stock is reduced.`
            : consumption.source === "wildlife-carcass"
              ? `${animal.identityLabel} feeds from the remains. One physical resource unit is consumed.`
              : `${animal.identityLabel} takes the exposed food. The physical parcel is gone.`,
        );
        ecologyConsequenceAnnounced = true;
      }
      if (bio0Step.event?.kind === "food-consumed") {
        const witnessedDog = projectDogPresentation({
          actor: bio0Ecology.dog,
          window: {
            origin: regionalTravel.window.origin,
            terrain: {
              width: worldView.terrain.width,
              height: worldView.terrain.height,
            },
          },
          tileSize: RENDER_TILE_SIZE,
          detailVisibilityGrades: eventPerception.detailVisibilityGrades,
        });
        // BIO0 remains fully simulated and persisted outside the player's
        // sight, but only direct event-time perception earns player-facing
        // narration. Walking into view later never grants a retroactive report.
        if (witnessedDog !== null) {
          announce(
            session,
            "The porter offers one provision. The dog accepts it, and the food leaves the pack.",
          );
          soundscape.play("accept", 0.38);
          ecologyConsequenceAnnounced = true;
        }
      }
      const witnessedRatDisplacement = selectWitnessedBrownRatRedistribution(
        settlementShadows.events,
        witnessedAggregateEvidence,
      );
      const coreActorBeforeStep = (actorId: string): CoreWildlifeActorState | null => {
        for (const { beforePatch } of coreSteps) {
          const actor = coreEcologyAggregatePatchActor(beforePatch, actorId);
          if (actor !== null) return actor;
        }
        return null;
      };
      const witnessedCatTransition = allCoreStepEvents
        .filter((event) => event.species === "domestic-cat")
        .slice()
        .sort((left, right) => left.eventId < right.eventId ? -1 : left.eventId > right.eventId ? 1 : 0)
        .find((event) => {
          const before = coreActorBeforeStep(event.actorId);
          return directlyWitnessedCoreEventIds.has(event.eventId)
            && before !== null
            && before.intent.kind !== event.kind;
        });
      const witnessedRabbitThump = allCoreStepEvents
        .filter((event) => event.species === "marsh-rabbit" && event.kind === "alarm")
        .slice()
        .sort((left, right) => left.eventId < right.eventId ? -1 : left.eventId > right.eventId ? 1 : 0)
        .find((event) => {
          const before = coreActorBeforeStep(event.actorId);
          return directlyWitnessedCoreEventIds.has(event.eventId)
            && before !== null
            && before.intent.kind !== event.kind;
        });
      const witnessedFoxYip = allCoreStepEvents
        .filter((event) => event.species === "marsh-fox" && event.kind === "pursue")
        .slice()
        .sort((left, right) => left.eventId < right.eventId ? -1 : left.eventId > right.eventId ? 1 : 0)
        .find((event) => {
          const before = coreActorBeforeStep(event.actorId);
          return directlyWitnessedCoreEventIds.has(event.eventId)
            && before !== null
            && before.intent.kind !== event.kind;
        });
      const witnessedCrowDoubleCall = allCoreStepEvents
        .filter((event) => event.species === "fish-crow" && event.kind === "alarm")
        .slice()
        .sort((left, right) => left.eventId < right.eventId ? -1 : left.eventId > right.eventId ? 1 : 0)
        .find((event) => {
          const before = coreActorBeforeStep(event.actorId);
          return directlyWitnessedCoreEventIds.has(event.eventId)
            && before !== null
            && before.intent.kind !== event.kind;
        });
      const ecologyCues: Array<Readonly<{
        cue: "rat-rustle" | "cat-call" | "rabbit-thump" | "fox-yip"
          | "crow-nasal-double-call" | "frog-chorus" | "wildlife-alarm";
        volume: number;
        variantSeed: number;
        caption: string;
        pan?: number;
      }>> = [];
      if (witnessedRatDisplacement !== undefined) {
        ecologyCues.push(Object.freeze({
          cue: "rat-rustle",
          volume: 0.34,
          variantSeed: witnessedRatDisplacement.atTick,
          caption: "SMALL RUSTLE — beside the signs you can see.",
        }));
      }
      if (witnessedCatTransition !== undefined) {
        ecologyCues.push(Object.freeze({
          cue: "cat-call",
          volume: 0.34,
          variantSeed: witnessedCatTransition.atTick,
          caption: "CAT CALL — nearby and in view.",
        }));
      }
      if (witnessedRabbitThump !== undefined) {
        ecologyCues.push(Object.freeze({
          cue: "rabbit-thump",
          volume: 0.34,
          variantSeed: witnessedRabbitThump.atTick,
          caption: "[soft thump nearby]",
        }));
      }
      if (witnessedFoxYip !== undefined) {
        ecologyCues.push(Object.freeze({
          cue: "fox-yip",
          volume: 0.36,
          variantSeed: witnessedFoxYip.atTick,
          caption: "[brief yip nearby]",
        }));
      }
      if (witnessedCrowDoubleCall !== undefined) {
        ecologyCues.push(Object.freeze({
          cue: "crow-nasal-double-call",
          volume: 0.36,
          variantSeed: witnessedCrowDoubleCall.atTick,
          caption: "[nasal double call nearby]",
        }));
      }
      if (
        lawfullyHeardAlarm
        && witnessedRabbitThump === undefined
        && witnessedCrowDoubleCall === undefined
      ) {
        ecologyCues.push(Object.freeze({
          cue: "wildlife-alarm",
          volume: 0.44,
          variantSeed: 0,
          caption: "ANIMAL ALARM — source unclear.",
        }));
      }
      for (const heard of heardAggregateCues) {
        ecologyCues.push(Object.freeze({
          cue: heard.cue,
          volume: heard.volume,
          variantSeed: heard.variantSeed,
          caption: heard.caption,
          pan: heard.pan,
        }));
      }
      // Two simultaneous voices preserve the strongest causal exchange
      // without turning a busy habitat tick into an audio pile-up.
      // The ordered list preserves event/alarm priority over an ambient chorus
      // when more than two lawful cues coincide.
      const emittedEcologyCues = ecologyCues.slice(0, 2);
      for (const cue of emittedEcologyCues) {
        if (cue.pan === undefined) {
          soundscape.play(cue.cue, cue.volume, cue.variantSeed);
        } else {
          soundscape.play(cue.cue, cue.volume, cue.variantSeed, cue.pan);
        }
      }
      if (emittedEcologyCues.length > 0) {
        const cueCaption = emittedEcologyCues.map(({ caption }) => caption).join(" ");
        if (ecologyConsequenceAnnounced && session.announcement !== null) {
          const consequence = session.announcement;
          announce(
            session,
            `${consequence.message} ${cueCaption}`,
            consequence.assertive,
          );
        } else {
          announce(session, cueCaption);
        }
      }
    }

    if (pendingGatherNodeId !== null && autopilotPath.length === 0) {
      const mapping = regionalFieldResourceById(fieldResourceProjection, pendingGatherNodeId);
      if (mapping && mapping.viewTileIndex === playerTileIndex(player)) {
        const requestedNodeId = pendingGatherNodeId;
        pendingGatherNodeId = null;
        gatherFieldResource(requestedNodeId);
      }
    }

    if (result.moved && player.mode !== "swept") {
      soundscape.play("step", player.pace === "swift" ? 0.8 : 0.42);
    }
    if (
      result.adriftPaddling === true
      && session.sessionPlayMilliseconds - lastAdriftPaddleSoundMs >= 360
    ) {
      lastAdriftPaddleSoundMs = session.sessionPlayMilliseconds;
      soundscape.play("paddle", 0.48);
    }
    if (result.becameSwept) {
      autopilotPath = [];
      pendingGatherNodeId = null;
      pendingParcelTargetId = null;
      pendingParcelRecoverOnArrival = false;
      const collapse = result.sweepCause === "stability"
        ? {
            change: "Deep-water footing failed under the live conditions; the recoverable sweep kept cargo accountable and weathered it once.",
            warning: "CURRENT FOOTING FAILED IN DEEP WATER — SWEPT.",
          }
        : {
            change: "Deep-water exhaustion became a recoverable sweep; the cargo stayed accountable and weathered once.",
            warning: "STAMINA EMPTY IN DEEP WATER — SWEPT.",
          };
      const support = result.sweepSupport === "ferry"
        ? " A connected ferry crew is helping without removing the current."
        : " Float to recover stamina; paddle toward visible shallow water.";
      session.sessionChanges.push(collapse.change);
      if (result.traversalIncident?.kind !== "sweep") {
        announce(
          session,
          `${collapse.warning} ADRIFT — use movement keys or tap toward shallow water. The current remains stronger than you; cargo stays physical, and anything separated stays recoverable.${support}`,
          true,
        );
        soundscape.play("warning", 0.82);
      }
    } else if (result.exhausted || (result.rescued && !result.washedAshore)) {
      if (result.rescued) {
        session.sessionChanges.push("A completed clinic and established strand turned a field collapse into mutual aid.");
        announce(session, "A clinic crew reached you through the established strand. Nothing was lost; infrastructure changed failure into care.", true);
        soundscape.play("deliver", 0.62);
      } else {
        announce(session, "You made camp. Nothing was lost; staying still will rebuild your stamina.");
        soundscape.play("rest");
      }
    }
    if (result.washedAshore) {
      const support = result.sweepSupport
        ? `${result.sweepSupport === "clinic" ? "Clinic" : "Ferry"} support brought you in sooner.`
        : "You reached water shallow enough to stand.";
      session.sessionChanges.push(
        `You rose from the current; cargo quantity stayed accountable, and any separated parcel remains recoverable. ${support}`,
      );
      announce(
        session,
        `ASHORE — ${support} You recovered enough stamina to rise; check RECOVER for any separated cargo.`,
        true,
      );
      soundscape.play("rest", 0.9);
    }
    if (
      !result.becameSwept
      && !result.traversalIncident
      && result.damagedCargo
      && session.sessionPlayMilliseconds - lastCargoDamageNoticeMs >= 2_500
    ) {
      lastCargoDamageNoticeMs = session.sessionPlayMilliseconds;
      const property = player.cargo[0]?.property;
      announce(
        session,
        property === "perishable"
          ? "Fresh provisions age gently in transit. Choose an efficient line; completed harbor caches halt the loss while sheltered."
          : property === "fragile"
            ? "The medicine case felt that jolt. Hold Shift to brace while moving: slower, steadier, and fully protected from handling shock."
            : "The load shifted and weathered slightly. Stop to recover, choose sounder footing, or hold Shift to BRACE while moving.",
      );
      soundscape.play("warning", 0.32);
    }
    const audibleIncident = acknowledgeIncidentCue(traversalFeedback);
    traversalFeedback = audibleIncident.state;
    if (audibleIncident.incident) {
      const incident = audibleIncident.incident;
      announce(session, `${incident.label} — ${incident.detail}`, incident.kind !== "stumble");
      soundscape.play(incident.cue, incident.kind === "stumble" ? 0.58 : 0.9, incident.variantSeed);
      if (incident.kind !== "stumble") {
        session.sessionChanges.push(
          `${incident.label}; every cargo identity persisted, and any separated parcel remains physically recoverable.`,
        );
        if (session.sessionChanges.length > 32) session.sessionChanges.splice(0, 8);
      }
    }
    if (worldAdvanced) {
      reconcileResidentInteractions();
      reconcileContract();
      checkCampaignResolution();
    }
    const tutorialAdvanced = updateTutorial(session.tutorial, player);
    if (tutorialAdvanced) {
      announce(session, tutorialAdvanceMessage(session.tutorial.stage));
      soundscape.play("strand", 0.45);
    }
    const ambiencePerception = projectPerception(worldView, player);
    soundscape.updateAmbience(
      worldView.tide.level / 1_000_000,
      worldView.weather.intensity / 1_000_000,
      averageObservedRouteStrength(worldView, ambiencePerception.detailVisibilityGrades),
      localWaterAmbience(worldView, player),
    );
    refreshViews();

    if (world.meta.completedTick - lastAutosaveTick >= AUTOSAVE_INTERVAL_TICKS) {
      lastAutosaveTick = world.meta.completedTick;
      saveInBackground();
    }
  }

  function reconcileContract(): void {
    if (pendingAcceptance !== null) {
      const accepted = worldView.contracts.find((contract) => contract.id === pendingAcceptance?.contractId);
      const rejected = rejectionFor([pendingAcceptance.acceptCommandId, pendingAcceptance.pickupCommandId]);
      if (accepted?.status === "in-transit" && accepted.carrierKind === "player") {
        pendingAcceptance = null;
      } else if (rejected || !accepted || accepted.carrierKind === "resident" || isTerminal(accepted.status)) {
        const contractId = pendingAcceptance.contractId;
        pendingAcceptance = null;
        releaseLocalCargo(contractId);
        if (accepted?.status === "accepted" && accepted.carrierKind === "player") {
          queue({
            id: commandId("cancel-after-pickup"),
            type: "cancel-contract",
            contractId,
            sourceId: 0,
            sequence: commandSequence,
          });
        }
        announce(
          session,
          rejected
            ? `The harbor could not secure that cargo: ${rejected}. The promise remains recoverable.`
            : "That cargo was claimed before the harbor could secure it. Choose another useful promise.",
          true,
        );
        soundscape.play("warning");
      }
    }

    if (pendingDelivery !== null) {
      const delivered = worldView.contracts.find((contract) => contract.id === pendingDelivery?.contractId);
      if (delivered?.status === "fulfilled") {
        const deliveryWasAutomated = pendingDelivery.wasAutomated;
        const custody = physicalPromiseCustody(pendingDelivery.contractId);
        if (custody.looseQuantity > 0 || custody.carriedQuantity !== delivered.quantity) {
          throw new Error("A fulfilled Promise lost exact physical custody before its harbor handoff");
        }
        physicalCargo = removePhysicalPromiseContract(physicalCargo, pendingDelivery.contractId);
        const cargo = unloadContractCargo(player, pendingDelivery.contractId);
        promiseJourney = clearRegionalPromiseJourney();
        mirrorPhysicalCargoToPlayer();
        pendingDelivery = null;
        if (session.trackedContractId === delivered.id) session.trackedContractId = null;
        session.sessionDeliveries += 1;
        session.tutorial.witnessedChanges += 1;
        const destination = settlementName(economyView, delivered.destinationSettlementId);
        const grade = delivered.deliveryGrade ?? "arrived";
        const requesterResident = economyView.residents.find(
          (resident) =>
            resident.id === delivered.requesterResidentId
            && resident.location.kind === "settlement"
            && resident.location.settlementId === delivered.destinationSettlementId,
        );
        const requester = requesterResident
          && residentKnowsFact(requesterResident.playerKnowledge, "name")
          ? requesterResident.name
          : undefined;
        const route = economyView.routes.find((candidate) => candidate.id === delivered.routeId);
        const newlyAutomated = !deliveryWasAutomated
          && (route?.traceStrength ?? 0) >= STRAND_AUTOMATION_THRESHOLD;
        const unlockedTool = unlockFieldToolAtSettlement(player, worldView, delivered.destinationSettlementId);
        if (newlyAutomated) session.sessionStrandsWoven += 1;
        const change = `${requester ?? destination} received ${delivered.quantity} ${humanResource(delivered.resource)} at ${destination} (${grade})${newlyAutomated ? "; the route became self-carrying" : ""}.`;
        session.sessionChanges.push(change);
        if (unlockedTool) {
          session.sessionChanges.push(`${destination}'s completed project entrusted you with ${FIELD_TOOL_LABELS[unlockedTool].toLocaleLowerCase()}.`);
        }
        if (session.sessionChanges.length > 32) session.sessionChanges.splice(0, 8);
        announce(
          session,
          `${requester ?? destination} received the promise${cargo ? ` at ${Math.round(custody.condition / 10_000)}% condition` : ""}. The route and relationship both changed${newlyAutomated ? ", and autonomous porters can now inherit this corridor" : ""}.${unlockedTool ? ` ${destination} adds ${FIELD_TOOL_LABELS[unlockedTool]} to your field kit: ${fieldToolEffect(unlockedTool)}` : ""}`,
          true,
        );
        soundscape.play("deliver", 1);
        return;
      }
      const rejected = rejectionFor([pendingDelivery.commandId]);
      if (rejected || (delivered && delivered.status !== "in-transit")) {
        pendingDelivery = null;
        announce(
          session,
          rejected
            ? `The harbor could not read that route: ${rejected}. Your cargo remains safe; retrace the final approach and try again.`
            : "The delivery could not be recorded. The cargo remains with you so you can recover.",
          true,
        );
        soundscape.play("warning");
      }
    }

    if (pendingRenegotiation !== null) {
      const contract = worldView.contracts.find((candidate) => candidate.id === pendingRenegotiation?.contractId);
      const rejected = rejectionFor([pendingRenegotiation.commandId]);
      if (contract?.status === "cancelled") {
        const harbor = settlementName(economyView, pendingRenegotiation.settlementId);
        releaseLocalCargo(contract.id);
        if (session.trackedContractId === contract.id) session.trackedContractId = null;
        session.sessionChanges.push(`${harbor} accepted a careful cargo handoff; the traveled trace remains charted.`);
        pendingRenegotiation = null;
        announce(session, `${harbor} took responsibility for the cargo. The promise was released without erasing your route knowledge.`, true);
        soundscape.play("rest", 0.8);
      } else if (rejected) {
        pendingRenegotiation = null;
        announce(session, `The harbor could not record that handoff: ${rejected}. Your cargo remains safe.`, true);
        soundscape.play("warning");
      }
    }

    if (player.activeContractId !== null) {
      const active = worldView.contracts.find((contract) => contract.id === player.activeContractId);
      if (!active || active.status === "expired" || active.status === "cancelled") {
        releaseLocalCargo(player.activeContractId);
        announce(session, "That promise changed before arrival. Your route knowledge remains, and the harbor will renegotiate.");
      }
    }

    if (pendingReinforcement !== null) {
      const reinforced = worldView.events.find(
        (event) => event.type === "route-reinforced" && event.data.commandId === pendingReinforcement?.commandId,
      );
      const rejected = rejectionFor([pendingReinforcement.commandId]);
      if (reinforced) {
        const route = economyView.routes.find((candidate) => candidate.id === pendingReinforcement?.routeId);
        const origin = economyView.settlements.find((settlement) => settlement.id === route?.fromSettlementId)?.name ?? "one harbor";
        const destination = economyView.settlements.find((settlement) => settlement.id === route?.toSettlementId)?.name ?? "another harbor";
        const newlyAutomated = !pendingReinforcement.wasAutomated
          && (route?.traceStrength ?? 0) >= 32_000;
        session.sessionStrandsWoven += 1;
        session.sessionChanges.push(
          newlyAutomated
            ? `${origin} ↔ ${destination} became a self-carrying strand.`
            : `${origin} ↔ ${destination} was tended for future travelers.`,
        );
        announce(
          session,
          newlyAutomated
            ? `The route between ${origin} and ${destination} can now carry autonomous porters. Your path became shared capacity.`
            : `${origin} and ${destination} now share a stronger, more weatherworthy strand.`,
          true,
        );
        pendingReinforcement = null;
        soundscape.play("deliver", 0.72);
      } else if (rejected) {
        pendingReinforcement = null;
        announce(session, `The strand crew kept the part in stores: ${rejected}.`, true);
        soundscape.play("warning");
      }
    }

    if (pendingReportDelivery !== null) {
      const shared = worldView.events.find(
        (event) => event.type === "knowledge-shared" && event.data.commandId === pendingReportDelivery?.commandId,
      );
      const rejected = rejectionFor([pendingReportDelivery.commandId]);
      if (shared && player.report) {
        const source = settlementName(economyView, player.report.sourceSettlementId);
        const target = settlementName(economyView, player.report.targetSettlementId);
        const age = worldView.completedTick - player.report.observedTick;
        const unreserved = setLooseCargoReservedLoad(
          physicalCargo.carrier,
          physicalCargo.carrier.reservedLoadMilli - PACK_LOAD_MILLI_PER_UNIT,
        );
        if (!unreserved.ok) throw new Error(`Signed report load could not leave the pack: ${unreserved.reason}`);
        physicalCargo = commitPhysicalCargoState(
          physicalCargo,
          {
            looseWorld: physicalCargo.looseWorld,
            carrier: unreserved.carrier,
          },
          {
            kind: "delta",
            removed: [],
            added: [],
            reservedLoadDeltaMilli: -PACK_LOAD_MILLI_PER_UNIT,
          },
        );
        player.report = null;
        player.reportsDelivered += 1;
        session.sessionReportsDelivered += 1;
        session.sessionChanges.push(`${target} received ${source}'s signed report at ${age} minutes old.`);
        pendingReportDelivery = null;
        announce(session, `${target} now has a sourced, current fact from ${source}. Future supply decisions can use it without guessing.`, true);
        soundscape.play("deliver", 0.68);
      } else if (rejected) {
        pendingReportDelivery = null;
        announce(session, `The report stayed in your case: ${rejected}. Its source and age remain intact.`, true);
        soundscape.play("warning");
      }
    }

    if (pendingChoir !== null) {
      const awakened = worldView.events.find(
        (event) => event.type === "tide-choir-awakened" && event.data.commandId === pendingChoir?.commandId,
      );
      const rejected = rejectionFor([pendingChoir.commandId]);
      if (awakened) {
        const harborNames = pendingChoir.cycle.harborIds
          .slice(0, -1)
          .map((id) => settlementName(economyView, id));
        session.sessionChoirsAwakened += 1;
        session.sessionChanges.push(
          `The ${harborNames.join("–")} loop awakened a Tide Choir; its shared routes became more weatherworthy.`,
        );
        pendingChoir = null;
        announce(
          session,
          `The loop closes: ${harborNames.join(" → ")} → ${harborNames[0] ?? "home"}. Lantern-moths answer in harmony, and every route in this unique Tide Choir gains condition and reliability.`,
          true,
        );
        soundscape.play("choir", 1);
      } else if (rejected) {
        pendingChoir = null;
        announce(session, `The harbor phrase could not settle into the network: ${rejected}. The surveyed routes remain remembered.`, true);
        soundscape.play("warning", 0.45);
      }
    }
  }

  function reconcileResidentInteractions(): void {
    if (pendingResidentObservation !== null) {
      const resident = economyView.residents.find(
        (candidate) => candidate.id === pendingResidentObservation?.residentId,
      );
      const rejected = rejectionFor([pendingResidentObservation.commandId]);
      if (resident?.playerKnowledge.firstObservedTick !== null || rejected) {
        pendingResidentObservation = null;
      }
    }

    if (pendingResidentGreeting !== null) {
      const pending = pendingResidentGreeting;
      const resident = economyView.residents.find((candidate) => candidate.id === pending.residentId);
      const rejected = rejectionFor([pending.commandId]);
      if (resident?.playerKnowledge.level === "acquainted") {
        const home = economyView.settlements.find(
          (settlement) => settlement.id === resident.homeSettlementId,
        )?.name ?? "the estuary";
        residentSpeech.set(resident.id, {
          text: `${resident.name}. ${titleCaseWord(resident.role)}, out of ${home}.`,
          untilSessionMs: session.sessionPlayMilliseconds + 5_600,
        });
        pendingResidentGreeting = null;
        soundscape.play("ui", 0.6);
        saveInBackground();
      } else if (rejected || !resident) {
        pendingResidentGreeting = null;
        if (rejected) {
          announce(session, `That greeting did not become part of the world: ${rejected}.`, true);
          soundscape.play("warning", 0.28);
        }
      }
    }
  }

  function dispatchRenderer(command: RendererCommand): void {
    void soundscape.unlock();
    const perceivedCommand = validatePerceivedEntityCommand(renderView, command);
    if (!perceivedCommand) return;
    if (player.mode === "swept") {
      const adriftPoint = (() => {
        switch (perceivedCommand.type) {
          case "move-target":
          case "resource-target":
            return perceivedCommand.point;
          case "parcel-target":
            return renderView.looseCargo?.find(
              (parcel) => parcel.id === perceivedCommand.parcelId,
            )?.position;
          case "select":
            return perceivedCommand.point;
          default:
            return undefined;
        }
      })();
      if (adriftPoint) {
        beginAdriftTap(adriftPoint);
        refreshViews();
        return;
      }
    }
    switch (perceivedCommand.type) {
      case "movement":
        manualControl = {
          moveX: signControl(perceivedCommand.vector.x),
          moveY: signControl(perceivedCommand.vector.y),
          brace: manualControl.brace,
        };
        // A release/focus-loss movement command cancels a bounded touch
        // stroke too. Keyboard input otherwise takes immediate precedence.
        adriftTapControl = null;
        adriftTapTicksRemaining = 0;
        if (manualControl.moveX || manualControl.moveY) {
          autopilotPath = [];
          pendingGatherNodeId = null;
          pendingParcelTargetId = null;
          pendingParcelRecoverOnArrival = false;
        }
        break;
      case "brace":
        manualControl = { ...manualControl, brace: perceivedCommand.active };
        // Brace is a momentary safety control. Project it immediately so the
        // player sees a planted pose before the next fixed movement beat.
        refreshViews();
        break;
      case "move-target":
        pendingGatherNodeId = null;
        pendingParcelTargetId = null;
        pendingParcelRecoverOnArrival = false;
        setAutopilot(perceivedCommand.point, perceivedCommand.additive);
        break;
      case "resource-target":
        pendingParcelTargetId = null;
        pendingParcelRecoverOnArrival = false;
        targetFieldResource(perceivedCommand.nodeId, perceivedCommand.gatherOnArrival);
        break;
      case "parcel-target":
        targetPhysicalParcel(perceivedCommand.parcelId, perceivedCommand.recoverOnArrival);
        break;
      case "scan":
        scan();
        break;
      case "interact":
        interact();
        break;
      case "wayknot":
        toggleWayknot();
        break;
      case "select":
        if (perceivedCommand.entity === "settlement" && perceivedCommand.id) {
          session.selectedSettlementId = Number(perceivedCommand.id);
          selectedResidentId = null;
          selectedDogActorId = null;
          selectedWildlifeTarget = null;
          selectedWildlifeEvidenceTarget = null;
        } else if (perceivedCommand.entity === "porter" && perceivedCommand.id) {
          const residentId = Number(perceivedCommand.id);
          const visiblePorter = renderView.porters.find((porter) => porter.id === perceivedCommand.id);
          const resident = economyView.residents.find((candidate) => candidate.id === residentId);
          if (visiblePorter && resident) {
            selectedResidentId = residentId;
            selectedDogActorId = null;
            selectedWildlifeTarget = null;
            selectedWildlifeEvidenceTarget = null;
            session.selectedSettlementId = null;
            if (
              resident.playerKnowledge.firstObservedTick === null
              && pendingResidentObservation?.residentId !== residentId
            ) {
              const observationCommandId = commandId("observe-resident");
              queue({
                id: observationCommandId,
                type: "observe-resident",
                residentId,
                sourceId: 0,
                sequence: commandSequence,
              });
              pendingResidentObservation = { residentId, commandId: observationCommandId };
            }
          }
        } else if (
          perceivedCommand.entity === "living-actor"
          && perceivedCommand.species === "domestic-dog"
          && runtimeDogActorById(
            bio0Ecology,
            dogActorRoster,
            perceivedCommand.id,
          ) !== null
          && renderView.dogs?.some(({ actorId }) => actorId === perceivedCommand.id)
        ) {
          selectedDogActorId = perceivedCommand.id;
          selectedWildlifeTarget = null;
          selectedWildlifeEvidenceTarget = null;
          selectedResidentId = null;
          session.selectedSettlementId = null;
        } else if (
          perceivedCommand.entity === "living-actor"
          && perceivedCommand.species !== "domestic-dog"
          && renderView.wildlife?.some(({ actorId, species }) => (
            actorId === perceivedCommand.id && species === perceivedCommand.species
          ))
          && runtimeRegionalEcologyActor(regionalEcology, worldView, regionalTravel.window, {
            species: perceivedCommand.species,
            actorId: perceivedCommand.id,
          }) !== null
        ) {
          selectedWildlifeTarget = {
            species: perceivedCommand.species,
            actorId: perceivedCommand.id,
          };
          selectedWildlifeEvidenceTarget = null;
          selectedDogActorId = null;
          selectedResidentId = null;
          session.selectedSettlementId = null;
        } else if (
          perceivedCommand.entity === "aggregate-wildlife-evidence"
          && renderView.aggregateWildlifeEvidence?.some((evidence) => (
            evidence.species === perceivedCommand.species
            && evidence.aggregateId === perceivedCommand.aggregateId
            && evidence.evidenceId === perceivedCommand.evidenceId
          ))
        ) {
          selectedWildlifeEvidenceTarget = {
            species: perceivedCommand.species,
            aggregateId: perceivedCommand.aggregateId,
            evidenceId: perceivedCommand.evidenceId,
          };
          selectedWildlifeTarget = null;
          selectedDogActorId = null;
          selectedResidentId = null;
          session.selectedSettlementId = null;
        } else if (perceivedCommand.entity === "world") {
          session.selectedSettlementId = null;
          selectedResidentId = null;
          selectedDogActorId = null;
          selectedWildlifeTarget = null;
          selectedWildlifeEvidenceTarget = null;
        }
        refreshViews();
        break;
      case "cancel":
        autopilotPath = [];
        adriftTapControl = null;
        adriftTapTicksRemaining = 0;
        pendingGatherNodeId = null;
        pendingParcelTargetId = null;
        pendingParcelRecoverOnArrival = false;
        session.selectedSettlementId = null;
        selectedResidentId = null;
        selectedDogActorId = null;
        selectedWildlifeTarget = null;
        selectedWildlifeEvidenceTarget = null;
        refreshViews();
        break;
    }
  }

  function beginAdriftTap(point: WorldPoint): void {
    const dx = point.x - renderView.player.position.x;
    const dy = point.y - renderView.player.position.y;
    const moveX = signControl(dx);
    const moveY = signControl(dy);
    if (moveX === 0 && moveY === 0) return;
    adriftTapControl = { moveX, moveY, brace: manualControl.brace };
    // Eight fixed beats make a coarse mobile tap meaningful without creating
    // sticky virtual movement or a hidden autopilot.
    adriftTapTicksRemaining = 8;
    autopilotPath = [];
    pendingGatherNodeId = null;
    pendingParcelTargetId = null;
    pendingParcelRecoverOnArrival = false;
  }

  function greetSelectedResident(residentId: number): void {
    if (
      !Number.isSafeInteger(residentId)
      || selectedResidentId !== residentId
      || pendingResidentGreeting !== null
      || session.paused
      || session.titleVisible
      || session.quietHourVisible
    ) return;

    const porter = renderView.porters.find((candidate) => Number(candidate.id) === residentId);
    const resident = economyView.residents.find((candidate) => candidate.id === residentId);
    if (!porter || !resident) {
      selectedResidentId = null;
      return;
    }
    if (resident.playerKnowledge.level === "acquainted") return;
    if (player.mode === "swept") {
      announce(session, "ADRIFT — reach footing before trying to hold a conversation.", true);
      soundscape.play("warning", 0.28);
      return;
    }
    const distance = Math.hypot(
      renderView.player.position.x - porter.position.x,
      renderView.player.position.y - porter.position.y,
    );
    if (distance > RESIDENT_CONVERSATION_RANGE_TILES * RENDER_TILE_SIZE) {
      announce(session, `Move within ${RESIDENT_CONVERSATION_RANGE_TILES} tiles to greet this porter.`);
      return;
    }

    const greetingCommandId = commandId("greet-resident");
    queue({
      id: greetingCommandId,
      type: "greet-resident",
      residentId,
      observedTick: resident.playerKnowledge.firstObservedTick
        ?? (pendingResidentObservation?.residentId === residentId
          ? world.meta.completedTick + 1
          : world.meta.completedTick),
      sourceId: 0,
      sequence: commandSequence,
    });
    pendingResidentGreeting = { residentId, commandId: greetingCommandId };
  }

  function stopAutomaticLivingActorRoute(): void {
    autopilotPath = [];
    pendingGatherNodeId = null;
    pendingParcelTargetId = null;
    pendingParcelRecoverOnArrival = false;
  }

  function planLivingActorReroute(effect: RerouteEffect): number[] | null {
    if (autopilotPath.length === 0) return null;
    const focusAddress = runtimeDogActorById(
      bio0Ecology,
      dogActorRoster,
      effect.focusActorId,
    )?.address ?? coreEcologyAggregatePatchActor(coreEcology, effect.focusActorId)?.address;
    if (focusAddress === undefined) return null;
    const destination = autopilotPath.at(-1);
    if (destination === undefined) return null;
    const placement = livingActorAddressInRegionalWindow(
      focusAddress,
      {
        origin: regionalTravel.window.origin,
        terrain: {
          width: worldView.terrain.width,
          height: worldView.terrain.height,
        },
      },
    );
    if (placement === null) return null;
    const start = playerTileIndex(player);
    const avoidedTiles = new Set<number>();
    for (let tileIndex = 0; tileIndex < worldView.terrain.tiles.length; tileIndex += 1) {
      const tile = worldView.terrain.tiles[tileIndex];
      if (tile === undefined) continue;
      const centerX = tile.x * WORLD_POSITION_UNITS_PER_TILE
        + WORLD_POSITION_UNITS_PER_TILE / 2;
      const centerY = tile.y * WORLD_POSITION_UNITS_PER_TILE
        + WORLD_POSITION_UNITS_PER_TILE / 2;
      if (Math.hypot(centerX - placement.point.x, centerY - placement.point.y)
        <= effect.avoidArea.radiusUnits) {
        avoidedTiles.add(tileIndex);
      }
    }
    // Leaving the starting tile is legal; arriving at the very place the
    // player asked to avoid is not a truthful reroute.
    avoidedTiles.delete(start);
    if (avoidedTiles.size === 0 || avoidedTiles.has(destination)) return null;

    const traversalTerrain = currentAutopilotTerrain(avoidedTiles);
    let path: number[];
    try {
      path = findTilePath(traversalTerrain, start, destination);
    } catch {
      return null;
    }
    if (
      path.length < 2
      || path.slice(1).some((tileIndex) => avoidedTiles.has(tileIndex))
    ) return null;
    const smoothed = smoothCurrentAutopilotPath(
      traversalTerrain,
      path,
      avoidedTiles,
    );
    return smoothed.length >= 2 ? smoothed.slice(1) : null;
  }

  function handleLivingActorInteraction(
    command: Extract<TideweftUICommand, { readonly type: "living-actor"; readonly action: "interact" }>,
  ): void {
    const selectedDog = command.target.species === "domestic-dog"
      && command.target.actorId === selectedDogActorId
      ? runtimeDogActorById(bio0Ecology, dogActorRoster, command.target.actorId)
      : null;
    const isDog = selectedDog !== null;
    const isBio0Dog = selectedDog?.identity.stableId === bio0Ecology.dog.identity.stableId;
    const wildlifeActor = command.target.species === "domestic-dog"
      ? null
      : selectedWildlifeTarget?.species === command.target.species
          && selectedWildlifeTarget.actorId === command.target.actorId
        ? runtimeRegionalEcologyActor(
            regionalEcology,
            worldView,
            regionalTravel.window,
            selectedWildlifeTarget,
          )
        : null;
    if (
      (!isDog && wildlifeActor === null)
      || session.paused
      || session.titleVisible
      || session.quietHourVisible
      || player.mode === "swept"
      || (command.interaction === "reroute" && autopilotPath.length === 0)
    ) return;

    let porter: RuntimeBio0Porter | null = null;
    if (isBio0Dog) {
      try {
        porter = runtimeBio0Porter(economyView, bio0Ecology.porterAddress.actorId);
      } catch {
        return;
      }
    }
    const focusActorId = isDog
      ? selectedDog!.identity.stableId
      : wildlifeActor!.identity.stableId;
    const focusAddress = isDog ? selectedDog!.address : wildlifeActor!.address;
    const currentPerception = projectPerception(worldView, player);
    const issuedAtTick = world.meta.completedTick;
    let spec: LivingActorPlayerChoiceSpec;
    switch (command.interaction) {
      case "help":
        if (!isBio0Dog || porter === null) return;
        spec = {
          kind: "ask-offer-provision",
          issuedAtTick,
          custodianActorId: porter.address.actorId,
          beneficiaryActorId: bio0Ecology.dog.identity.stableId,
          containerId: bio0Ecology.foodSource.providerContainerId,
        };
        break;
      case "secure-food":
        if (!isBio0Dog || porter === null) return;
        spec = {
          kind: "ask-secure-provisions",
          issuedAtTick,
          custodianActorId: porter.address.actorId,
          containerId: bio0Ecology.foodSource.providerContainerId,
        };
        break;
      case "wait":
        spec = {
          kind: "wait-observe",
          issuedAtTick,
          focusActorId,
          durationTicks: 3,
        };
        break;
      case "reroute":
        spec = {
          kind: "reroute",
          issuedAtTick,
          focusActorId,
        };
        break;
      case "leave":
        spec = {
          kind: "leave",
          issuedAtTick,
          focusActorId,
        };
        break;
    }
    const action = createLivingActorPlayerChoiceAction(livingActorPlayerChoice, spec);
    const reduced = reduceLivingActorPlayerChoice(
      livingActorPlayerChoice,
      action,
      {
        actors: porter === null
          ? [focusAddress]
          : [selectedDog!.address, porter.address],
        cargo: bio0Ecology.cargo,
        observation: {
          window: {
            origin: regionalTravel.window.origin,
            terrain: {
              width: worldView.terrain.width,
              height: worldView.terrain.height,
            },
          },
          perception: currentPerception,
        },
      },
    );
    if (!reduced.ok || reduced.reason !== "applied" || reduced.effect === null) return;
    const reroutedPath = reduced.effect.kind === "request-reroute"
      ? planLivingActorReroute(reduced.effect)
      : null;
    if (reduced.effect.kind === "request-reroute" && reroutedPath === null) {
      announce(
        session,
        "The Loom cannot preserve that destination while avoiding the observed spot.",
      );
      soundscape.play("warning", 0.4);
      refreshViews();
      return;
    }
    livingActorPlayerChoice = reduced.state;
    if (reduced.effect.kind === "wait-observe") {
      stopAutomaticLivingActorRoute();
      manualControl = { moveX: 0, moveY: 0, brace: manualControl.brace };
      adriftTapControl = null;
      adriftTapTicksRemaining = 0;
    } else if (reduced.effect.kind === "request-reroute") {
      autopilotPath = reroutedPath ?? [];
      announce(
        session,
        "The Loom bends the current route around the actor's observed position.",
      );
    } else if (reduced.effect.kind === "leave-interaction") {
      if (isDog) selectedDogActorId = null;
      else selectedWildlifeTarget = null;
    }
    saveInBackground();
  }

  function dispatchUI(command: TideweftUICommand): void {
    void soundscape.unlock();
    switch (command.type) {
      case "resume-world":
        if (saveRecoveryBlocked) {
          announce(session, blockedWorldCreationMessage("resume"), true);
          break;
        }
        if (!session.titleVisible && !session.paused) break;
        session.titleVisible = false;
        session.paused = false;
        beginSession();
        announce(session, `Welcome back to ${renderView.worldName ?? "the estuary"}. Nothing changed while you were away.`);
        break;
      case "new-world":
        if (saveRecoveryBlocked) {
          announce(session, blockedWorldCreationMessage("start"), true);
          break;
        }
        if (replacementSeedRequired && command.seed.trim().length === 0) {
          announce(
            session,
            "The unreadable or conflicting autosave is unchanged. Enter a non-empty seed phrase before replacing it.",
            true,
          );
          break;
        }
        if (session.hasSave && !acceptsRestartPhrase(command.restartPhrase ?? "")) {
          announce(
            session,
            "The existing estuary is unchanged. Type restartrestartrestart on the title screen before choosing a new seed.",
            true,
          );
          break;
        }
        if (session.hasSave && command.seed.trim().length === 0) {
          announce(
            session,
            "The existing estuary is unchanged. Enter a non-empty seed phrase to confirm its replacement.",
            true,
          );
          break;
        }
        if (
          session.hasSave
          && saveGenerationEra >= Number.MAX_SAFE_INTEGER
          && saveGeneration >= Number.MAX_SAFE_INTEGER
        ) {
          announce(
            session,
            "This save has exhausted its safe replacement counter. Clear Tideweft's stored site data, reload, and begin the seed again.",
            true,
          );
          break;
        }
        newWorld(command.seed, session.hasSave);
        break;
      case "scan":
        scan();
        break;
      case "interact":
        interact();
        break;
      case "wayknot":
        toggleWayknot();
        break;
      case "set-session-shape":
        session.sessionShape = command.sessionShape;
        break;
      case "contract":
        handleContractCommand(command.action, Number(command.contractId));
        break;
      case "strand":
        reinforceStrand(Number(command.routeId), Number(command.settlementId));
        break;
      case "report":
        collectReport(Number(command.sourceSettlementId), Number(command.targetSettlementId));
        break;
      case "kit":
        if (command.action === "craft") craftFromKit(command.recipeId);
        if (command.action === "repair") {
          repairFromKit(Number(command.gearId), command.conditionGain);
        }
        if (command.action === "dismantle") dismantleFromKit(Number(command.gearId));
        if (command.action === "drop") dropPhysicalLot(command.lotId, command.quantity);
        break;
      case "settlement":
        if (command.action === "close") {
          session.selectedSettlementId = null;
        } else if (command.settlementId) {
          const id = Number(command.settlementId);
          session.selectedSettlementId = id;
          selectedResidentId = null;
          selectedDogActorId = null;
          selectedWildlifeTarget = null;
          selectedWildlifeEvidenceTarget = null;
          const settlement = worldView.settlements.find((candidate) => candidate.id === id);
          if (settlement) {
            const tile = worldView.terrain.tiles[settlement.tileIndex];
            if (tile) focusHandler?.({ x: (tile.x + 0.5) * RENDER_TILE_SIZE, y: (tile.y + 0.5) * RENDER_TILE_SIZE }, 1.3);
          }
        }
        break;
      case "resident":
        if (command.action === "close") {
          selectedResidentId = null;
        } else if (command.residentId) {
          greetSelectedResident(Number(command.residentId));
        }
        break;
      case "living-actor":
        if (
          command.action === "close"
          && command.target.species === "domestic-dog"
          && command.target.actorId === selectedDogActorId
        ) {
          selectedDogActorId = null;
        } else if (
          command.action === "close"
          && selectedWildlifeTarget?.species === command.target.species
          && selectedWildlifeTarget.actorId === command.target.actorId
        ) {
          selectedWildlifeTarget = null;
        } else if (command.action === "interact") {
          handleLivingActorInteraction(command);
        }
        break;
      case "aggregate-wildlife-evidence":
        if (
          command.action === "close"
          && selectedWildlifeEvidenceTarget?.species === command.target.species
          && selectedWildlifeEvidenceTarget.aggregateId === command.target.aggregateId
          && selectedWildlifeEvidenceTarget.evidenceId === command.target.evidenceId
        ) {
          selectedWildlifeEvidenceTarget = null;
        }
        break;
      case "quiet-hour":
        if (command.action === "open") openQuietHour();
        if (command.action === "continue") {
          session.quietHourVisible = false;
          session.paused = false;
        }
        if (command.action === "finish") {
          session.quietHourVisible = false;
          session.titleVisible = true;
          session.paused = true;
          session.hasSave = true;
          session.continueSummary = continueSummary(worldView, player);
          saveInBackground();
        }
        break;
      case "open-title":
        if (saveRecoveryBlocked) {
          session.paused = true;
          session.titleVisible = true;
          session.hasSave = false;
          announce(session, blockedWorldCreationMessage("resume"), true);
          break;
        }
        session.paused = true;
        session.titleVisible = true;
        session.hasSave = true;
        session.continueSummary = continueSummary(worldView, player);
        saveInBackground();
        break;
    }
    refreshViews();
  }

  async function playTitleCrescendo(openingOrdinal: number): Promise<void> {
    await soundscape.unlock();
    soundscape.play(
      "title",
      0.72,
      Number.isSafeInteger(openingOrdinal) ? openingOrdinal : 0,
    );
  }

  function blockedWorldCreationMessage(action: "resume" | "start"): string {
    if (saveReadFailed) {
      return action === "resume"
        ? "LOCAL SAVE UNAVAILABLE — reload to retry local storage. This window will not open or overwrite an unknown save."
        : "LOCAL SAVE UNAVAILABLE — no seed was started. Reload to retry local storage without risking an unknown durable save.";
    }
    if (staleSaveDetected) {
      return "LOCAL SAVE SUPERSEDED — reload to resolve the different or newer durable copy before continuing or starting another seed.";
    }
    if (newerSaveUnavailable) {
      return "LOCAL SAVE TEMPORARILY UNAVAILABLE — reload when the newer durable copy's storage backend is available; nothing was opened or replaced.";
    }
    return "LOCAL SAVE CANNOT BE REPLACED — clear Tideweft's stored site data, reload, and begin the seed again.";
  }

  function availableCraftingInventory(): CraftingInventory | null {
    const availableMilli = player.cargoCapacity * PACK_LOAD_MILLI_PER_UNIT
      - (cargoWeightMilli(player) - inventoryLoadMilli(player.craftingInventory));
    try {
      return createCraftingInventory(
        Math.max(0, availableMilli),
        player.craftingInventory.stacks,
        player.craftingInventory.gear,
      );
    } catch {
      return null;
    }
  }

  function consumePhysicalIngredients(
    initialCarrier: LooseCargoCarrierState,
    ingredients: readonly { readonly item: CraftingStackId; readonly quantity: number }[],
  ): {
    readonly carrier: LooseCargoCarrierState;
    readonly removedLots: readonly CarriedCargoLot[];
    readonly removedPayloads: readonly LooseCargoPayload[];
  } {
    let carrier = initialCarrier;
    const removedLots: CarriedCargoLot[] = [];
    for (const ingredient of ingredients) {
      const mutation = consumeLooseCargoStack(carrier, ingredient);
      if (!mutation.ok) {
        throw new Error(`Physical ingredient ${ingredient.item} could not be consumed: ${mutation.reason}`);
      }
      carrier = mutation.carrier;
      removedLots.push(...mutation.removed);
    }
    return {
      carrier,
      removedLots,
      removedPayloads: removedLots.map(({ payload }) => payload),
    };
  }

  /** Crafting inherits the weakest condition and strongest taint of its exact inputs. */
  function materialStateFromInputs(
    inputs: readonly CarriedCargoLot[],
  ): CarriedCargoLot["materialState"] {
    if (inputs.length === 0) return { condition: FIXED_POINT, contamination: 0, decay: 0 };
    return {
      condition: Math.min(...inputs.map(({ materialState }) => materialState.condition)),
      contamination: Math.max(...inputs.map(({ materialState }) => materialState.contamination)),
      decay: Math.max(...inputs.map(({ materialState }) => materialState.decay)),
    };
  }

  function kitActionBlocked(): boolean {
    if (session.titleVisible || session.quietHourVisible || session.paused) return true;
    if (physicalReceiptPending()) {
      announce(session, "The harbor is sealing an exact receipt. PACK changes resume as soon as it settles.", true);
      soundscape.play("warning", 0.3);
      return true;
    }
    if (player.mode !== "swept" && player.mode !== "rescued") return false;
    announce(
      session,
      player.mode === "swept"
        ? "Both hands are keeping you afloat. Make or mend field gear after you rise from shallow water."
        : "Secure your footing before making or mending field gear.",
      true,
    );
    soundscape.play("warning", 0.3);
    return true;
  }

  function craftFromKit(recipeId: string): void {
    if (kitActionBlocked()) return;
    const inventory = availableCraftingInventory();
    if (!inventory) {
      announce(session, "The shared pack is over capacity; free space before making anything.", true);
      soundscape.play("warning", 0.35);
      return;
    }
    const recipe = CRAFTING_RECIPES.find((candidate) => candidate.id === recipeId);
    if (recipe?.output.type === "gear" && player.nextCraftedGearId >= Number.MAX_SAFE_INTEGER) {
      announce(session, "KIT has reached its durable identity limit. No ingredients were consumed; dismantle or continue with the gear already named.", true);
      soundscape.play("warning", 0.35);
      return;
    }
    const request = recipe?.output.type === "gear"
      ? { recipeId, gearId: player.nextCraftedGearId }
      : { recipeId };
    const result = craft(inventory, request);
    if (!result.ok || !result.recipe) {
      announce(session, result.message, true);
      soundscape.play("warning", 0.32);
      return;
    }
    let consumed: ReturnType<typeof consumePhysicalIngredients>;
    let carrier: LooseCargoCarrierState;
    let addedPayload: LooseCargoPayload;
    try {
      consumed = consumePhysicalIngredients(physicalCargo.carrier, result.recipe.inputs);
      carrier = consumed.carrier;
      const source = quotePhysicalCargoSource(
        physicalCargo,
        "craft",
        `${result.recipe.id}:gear:${result.craftedGear?.id ?? "stack"}`,
      );
      const materialState = materialStateFromInputs(consumed.removedLots);
      if (result.recipe.output.type === "gear") {
        if (!result.craftedGear) throw new Error("Crafted gear lost its durable identity");
        addedPayload = {
          kind: "gear",
          gearId: result.craftedGear.id,
          gearKind: result.recipe.output.kind,
        };
        const mutation = upsertLooseCargoGear(carrier, {
          sourceLotId: source.lotId,
          gearId: result.craftedGear.id,
          gearKind: result.recipe.output.kind,
          materialState,
        });
        if (!mutation.ok) throw new Error(`Physical crafted gear could not be packed: ${mutation.reason}`);
        carrier = mutation.carrier;
      } else {
        addedPayload = {
          kind: "stack",
          item: result.recipe.output.item,
          quantity: result.recipe.output.quantity,
        };
        const mutation = addLooseCargoStack(carrier, {
          sourceLotId: source.lotId,
          item: result.recipe.output.item,
          quantity: result.recipe.output.quantity,
          materialState,
        });
        if (!mutation.ok) throw new Error(`Physical crafted stack could not be packed: ${mutation.reason}`);
        carrier = mutation.carrier;
      }
      physicalCargo = commitPhysicalCargoState(
        physicalCargo,
        {
          looseWorld: physicalCargo.looseWorld,
          carrier,
          committedSourceOrdinal: source.ordinal,
        },
        {
          kind: "delta",
          removed: consumed.removedPayloads,
          added: [addedPayload],
        },
      );
    } catch (error) {
      announce(
        session,
        `KIT kept every item unchanged because the exact craft could not be sealed: ${errorMessage(error)}.`,
        true,
      );
      soundscape.play("warning", 0.35);
      return;
    }
    mirrorPhysicalCargoToPlayer();
    if (result.craftedGear) player.nextCraftedGearId += 1;
    const outputLabel = result.recipe.output.type === "gear"
      ? result.craftedGear
        ? `${result.recipe.label.replace(/^Make\s+/u, "")} #${result.craftedGear.id}`
        : result.recipe.label
      : CRAFTING_STACK_DEFINITIONS[result.recipe.output.item].label;
    announce(
      session,
      `${outputLabel} made in KIT · pack ${formatMilliLoad(cargoWeightMilli(player))} / ${formatMilliLoad(player.cargoCapacity * PACK_LOAD_MILLI_PER_UNIT)}.`,
      true,
    );
    session.sessionChanges.push(`${outputLabel} was made from gathered field materials.`);
    if (session.sessionChanges.length > 32) session.sessionChanges.splice(0, 8);
    soundscape.play("strand", 0.7);
  }

  function repairFromKit(gearId: number, conditionGain: number): void {
    if (kitActionBlocked()) return;
    const inventory = availableCraftingInventory();
    if (!inventory) {
      announce(session, "The shared pack is over capacity; free space before mending.", true);
      return;
    }
    const coreWayknot = player.wayknots.wayknots.find((wayknot) => wayknot.id === gearId);
    if (coreWayknot) {
      if (coreWayknot.tileIndex !== null) {
        announce(session, `Reclaim ${WAYKNOT_LABELS[coreWayknot.kind]} #${gearId} before mending it.`, true);
        soundscape.play("warning", 0.3);
        return;
      }
      const quote = quoteWayknotRepairCost(coreWayknot.kind, coreWayknot.condition, conditionGain);
      if (!quote || quote.conditionRestored <= 0) {
        announce(session, `${WAYKNOT_LABELS[coreWayknot.kind]} #${gearId} is already pristine.`, true);
        return;
      }
      const missing = quote.ingredients.filter(
        ({ item, quantity }) => inventory.stacks[item] < quantity,
      );
      if (missing.length > 0) {
        announce(
          session,
          `MEND needs ${missing.map(({ item, quantity }) => `${quantity - inventory.stacks[item]} more ${CRAFTING_STACK_DEFINITIONS[item].label}`).join(" + ")}.`,
          true,
        );
        soundscape.play("warning", 0.3);
        return;
      }
      try {
        const consumed = consumePhysicalIngredients(physicalCargo.carrier, quote.ingredients);
        const source = quotePhysicalCargoSource(
          physicalCargo,
          "repair-core-wayknot",
          `${coreWayknot.kind}:${gearId}:${quote.conditionAfter}`,
        );
        physicalCargo = commitPhysicalCargoState(
          physicalCargo,
          {
            looseWorld: physicalCargo.looseWorld,
            carrier: consumed.carrier,
            committedSourceOrdinal: source.ordinal,
          },
          { kind: "delta", removed: consumed.removedPayloads, added: [] },
        );
      } catch (error) {
        announce(session, `MEND kept every item unchanged: ${errorMessage(error)}.`, true);
        soundscape.play("warning", 0.35);
        return;
      }
      player.wayknots = {
        ...player.wayknots,
        wayknots: player.wayknots.wayknots.map((wayknot) => wayknot.id === gearId
          ? { ...wayknot, condition: quote.conditionAfter }
          : wayknot),
      };
      mirrorPhysicalCargoToPlayer();
      announce(
        session,
        `${WAYKNOT_LABELS[coreWayknot.kind]} #${gearId} mended to ${Math.round(quote.conditionAfter / 10_000)}% condition. Its stable ID and wear history remain.`,
        true,
      );
      soundscape.play("rest", 0.62);
      return;
    }
    const result = repair(inventory, gearId, conditionGain);
    if (!result.ok || !result.gear || !result.quote) {
      announce(session, result.message, true);
      soundscape.play("warning", 0.3);
      return;
    }
    try {
      const consumed = consumePhysicalIngredients(physicalCargo.carrier, result.quote.ingredients);
      const repaired = setLooseCargoGearCondition(
        consumed.carrier,
        gearId,
        result.quote.conditionAfter,
      );
      if (!repaired.ok) throw new Error(`Physical gear could not be mended: ${repaired.reason}`);
      const gearPayload: LooseCargoPayload = {
        kind: "gear",
        gearId,
        gearKind: result.gear.kind,
      };
      const source = quotePhysicalCargoSource(
        physicalCargo,
        "repair-gear",
        `${result.gear.kind}:${gearId}:${result.quote.conditionAfter}`,
      );
      physicalCargo = commitPhysicalCargoState(
        physicalCargo,
        {
          looseWorld: physicalCargo.looseWorld,
          carrier: repaired.carrier,
          committedSourceOrdinal: source.ordinal,
        },
        {
          kind: "delta",
          removed: [...consumed.removedPayloads, gearPayload],
          added: [gearPayload],
        },
      );
    } catch (error) {
      announce(session, `MEND kept every item unchanged: ${errorMessage(error)}.`, true);
      soundscape.play("warning", 0.35);
      return;
    }
    mirrorPhysicalCargoToPlayer();
    const label = result.gear.kind === "ladder"
      ? "Field ladder"
      : result.gear.kind.split("-").map(titleCaseWord).join(" ");
    announce(
      session,
      `${label} #${gearId} mended to ${Math.round(result.quote.conditionAfter / 10_000)}% condition.`,
      true,
    );
    soundscape.play("rest", 0.62);
  }

  function dismantleFromKit(gearId: number): void {
    if (kitActionBlocked()) return;
    const inventory = availableCraftingInventory();
    if (!inventory) {
      announce(session, "The shared pack is over capacity; free space before dismantling.", true);
      return;
    }
    const result = dismantle(inventory, gearId);
    if (!result.ok || !result.gear) {
      announce(session, result.message, true);
      soundscape.play("warning", 0.3);
      return;
    }
    try {
      const gearLot = physicalCargo.carrier.lots.find((lot) =>
        lot.payload.kind === "gear" && lot.payload.gearId === gearId);
      if (!gearLot || gearLot.payload.kind !== "gear") {
        throw new Error(`Physical gear #${gearId} is not in the pack`);
      }
      const source = quotePhysicalCargoSource(
        physicalCargo,
        "dismantle-gear",
        `${gearLot.payload.gearKind}:${gearId}`,
      );
      const removed = removeLooseCargoGear(physicalCargo.carrier, gearId);
      if (!removed.ok) throw new Error(`Physical gear could not be dismantled: ${removed.reason}`);
      let carrier = removed.carrier;
      const added: LooseCargoPayload[] = [];
      for (const salvage of result.salvage) {
        const payload: LooseCargoPayload = {
          kind: "stack",
          item: salvage.item,
          quantity: salvage.quantity,
        };
        const addition = addLooseCargoStack(carrier, {
          sourceLotId: `${source.lotId}:salvage:${salvage.item}`,
          item: salvage.item,
          quantity: salvage.quantity,
          materialState: gearLot.materialState,
        });
        if (!addition.ok) throw new Error(`Physical salvage could not be packed: ${addition.reason}`);
        carrier = addition.carrier;
        added.push(payload);
      }
      physicalCargo = commitPhysicalCargoState(
        physicalCargo,
        {
          looseWorld: physicalCargo.looseWorld,
          carrier,
          committedSourceOrdinal: source.ordinal,
        },
        { kind: "delta", removed: [gearLot.payload], added },
      );
    } catch (error) {
      announce(session, `DISMANTLE kept every item unchanged: ${errorMessage(error)}.`, true);
      soundscape.play("warning", 0.35);
      return;
    }
    mirrorPhysicalCargoToPlayer();
    announce(
      session,
      result.salvage.length > 0
        ? `${result.gear.kind.split("-").map(titleCaseWord).join(" ")} #${gearId} dismantled. Lossy salvage returned to PACK.`
        : `${result.gear.kind.split("-").map(titleCaseWord).join(" ")} #${gearId} was too worn to return usable parts.`,
      true,
    );
    soundscape.play("rest", 0.5);
  }

  function beginSession(): void {
    session.sessionStartedTick = world.meta.completedTick;
    session.sessionPlayMilliseconds = 0;
    session.sessionDistanceUnits = 0;
    session.sessionDeliveries = 0;
    session.sessionReportsDelivered = 0;
    session.sessionStrandsWoven = 0;
    session.sessionChoirsAwakened = 0;
    session.sessionDiscoveredAtStart = discoveredCount(player);
    session.sessionBaseline = captureSessionBaseline(economyView);
    session.closureOffered = false;
    session.sessionChanges = [];
    lastCargoDamageNoticeMs = Number.NEGATIVE_INFINITY;
  }

  function checkCampaignResolution(): void {
    if (!worldView.network.resolved || session.campaignCelebrated) return;
    session.campaignCelebrated = true;
    session.closureOffered = true;
    session.sessionChanges.push(
      `The regional weave reached ${worldView.network.cycleRank} independent loops with only ${worldView.network.bridgeCount} fragile bridges.`,
    );
    announce(
      session,
      "The estuary can now route essential care around failures without depending on one corridor. You completed the resilient weave; the world remains open for endless tending.",
      true,
    );
    soundscape.play("deliver", 1);
    saveInBackground();
  }

  function rejectionFor(commandIds: readonly string[]): string | undefined {
    const commandIdSet = new Set(commandIds);
    for (let index = worldView.events.length - 1; index >= 0; index -= 1) {
      const event = worldView.events[index];
      if (event?.type !== "command-rejected") continue;
      const rejectedId = event.data.commandId;
      if (typeof rejectedId === "string" && commandIdSet.has(rejectedId)) {
        return typeof event.data.reason === "string" ? event.data.reason : "the promise changed";
      }
    }
    return undefined;
  }

  function physicalPromiseCustody(contractId: number): {
    readonly carriedQuantity: number;
    readonly looseQuantity: number;
    readonly condition: number;
  } {
    return physicalCargoPromiseCustody(physicalCargo, contractId);
  }

  function preflightPhysicalPromiseRemoval(contractId: number): string | null {
    try {
      removePhysicalPromiseContract(physicalCargo, contractId);
      return null;
    } catch (error) {
      return errorMessage(error);
    }
  }

  function preflightReportRelease(): string | null {
    try {
      const unreserved = setLooseCargoReservedLoad(
        physicalCargo.carrier,
        physicalCargo.carrier.reservedLoadMilli - PACK_LOAD_MILLI_PER_UNIT,
      );
      if (!unreserved.ok) throw new Error(unreserved.reason);
      commitPhysicalCargoState(
        physicalCargo,
        { looseWorld: physicalCargo.looseWorld, carrier: unreserved.carrier },
        {
          kind: "delta",
          removed: [],
          added: [],
          reservedLoadDeltaMilli: -PACK_LOAD_MILLI_PER_UNIT,
        },
      );
      return null;
    } catch (error) {
      return errorMessage(error);
    }
  }

  function releaseLocalCargo(contractId: number): void {
    const custody = physicalPromiseCustody(contractId);
    if (custody.looseQuantity > 0) {
      throw new Error("Cannot hand off a Promise while one of its physical parcels remains loose");
    }
    physicalCargo = removePhysicalPromiseContract(physicalCargo, contractId);
    player.cargo = player.cargo.filter((cargo) => cargo.contractId !== contractId);
    if (player.activeContractId === contractId) player.activeContractId = null;
    if (promiseJourney.contractId === contractId) {
      promiseJourney = clearRegionalPromiseJourney();
    }
    mirrorPhysicalCargoToPlayer();
  }

  function newWorld(seed: string, replacesExistingSave: boolean): void {
    const normalizedSeed = seed.trim().slice(0, 128) || "quiet-delta";
    if (replacesExistingSave) {
      if (saveGeneration >= Number.MAX_SAFE_INTEGER) {
        saveGenerationEra += 1;
        saveGeneration = 0;
      } else {
        saveGeneration += 1;
      }
      // Generation dominates wall-clock ordering, so a deliberate replacement
      // can recover even from an imported/future-dated MAX_SAFE timestamp.
      if (lastIssuedSaveTimestamp >= Number.MAX_SAFE_INTEGER) {
        lastIssuedSaveTimestamp = -1;
      }
    }
    session = createSessionState(normalizedSeed, HARD_POSTURE, PERPETUAL_SESSION_SHAPE);
    world = createWorld(normalizedSeed, session.pressureMode);
    eventObservationCursor = 0;
    economyView = createWorldView(world);
    bio0Ecology = createRuntimeBio0Ecology(world, economyView);
    coreEcology = createRuntimeSettlementHomeCoreEcology(world, bio0Ecology, economyView);
    dogActorRoster = createRuntimeDogActorRoster(world, bio0Ecology, coreEcology);
    settlementEcology = createRuntimeSettlementEcology(
      world,
      bio0Ecology,
      coreEcology,
      dogActorRoster,
      economyView,
    );
    settlementWorkingAnimals = createRuntimeSettlementWorkingAnimals(
      world,
      settlementEcology,
      dogActorRoster,
    );
    settlementDomesticAnimalRecovery = createSettlementDomesticAnimalRecoveryState(
      settlementEcology.identity.settlementId,
    );
    porterResponse = createRuntimePorterResponse(bio0Ecology);
    livingActorPlayerChoice = createRuntimeLivingActorPlayerChoice();
    fieldResourceCatalog = runtimeFieldResourceCatalog(world);
    fieldResourceEcology = createFieldResourceEcologyState(world.meta.completedTick);
    traversalFeedback = createTraversalFeedbackState();
    const promise = economyView.contracts.find((contract) => contract.status === "offered");
    player = createPlayer(economyView, promise?.originSettlementId);
    physicalCargo = createPhysicalCargoStateFromPlayer(
      player,
      WORLD_WIDTH,
      WORLD_HEIGHT,
    );
    regionalTravel = migratePlayerToRegionalTravel(world.meta.rootSeed, player);
    promiseJourney = createRegionalPromiseJourney();
    rebuildRegionalWorldView();
    regionalEcology = createRuntimeRegionalEcologyState(
      world,
      bio0Ecology,
      coreEcology,
      worldView,
      economyView,
    );
    physicalCargo = seedRuntimeCoreEcologyProvision(physicalCargo, regionalEcology);
    session.titleVisible = false;
    session.paused = false;
    session.hasSave = true;
    replacementSeedRequired = false;
    beginSession();
    commandQueue = [];
    playerStepsSinceWorldTick = 0;
    clearPlayerSenseSamples();
    terrainPrefetchJobs = [];
    autopilotPath = [];
    adriftTapControl = null;
    adriftTapTicksRemaining = 0;
    lastAdriftControl = { moveX: 0, moveY: 0, brace: false };
    lastAdriftPaddleSoundMs = Number.NEGATIVE_INFINITY;
    pendingGatherNodeId = null;
    pendingParcelTargetId = null;
    pendingParcelRecoverOnArrival = false;
    pendingAcceptance = null;
    pendingDelivery = null;
    pendingReinforcement = null;
    pendingRenegotiation = null;
    pendingReportDelivery = null;
    pendingChoir = null;
    selectedResidentId = null;
    selectedDogActorId = null;
    selectedWildlifeTarget = null;
    selectedWildlifeEvidenceTarget = null;
    pendingResidentObservation = null;
    pendingResidentGreeting = null;
    residentSpeech.clear();
    lastAutosaveTick = 0;
    announce(session, "A new estuary settles into one possible shape. Begin by moving, then pulse the Loom.");
    soundscape.play("strand", 0.9);
    refreshViews();
    saveInBackground();
  }

  function currentAutopilotTerrain(
    avoidedTiles: ReadonlySet<number> = new Set<number>(),
  ): TerrainState {
    return {
      ...worldView.terrain,
      tiles: worldView.terrain.tiles.map((tile, index) => {
        const depth = tile.waterDepth;
        const wayknotEffects = wayknotEffectsAt(player, worldView, index);
        const waterCost = waterEffortPerStep(
          player,
          depth,
          wayknotEffects.staminaCostPermille,
        );
        const unknownWaterCost = depth > 40_000 && (player.depthSoundings[index] ?? 0) <= 0
          ? 850
          : 0;
        const stiltsRelief = player.tools.includes("marsh-stilts")
          && (tile.terrain === "marsh" || tile.terrain === "tidal-flat")
          ? 130
          : 0;
        const unknottedCost = Math.max(
          40,
          tile.baseTravelCost + waterCost + unknownWaterCost - stiltsRelief,
        );
        const ordinaryCost = Math.max(
          40,
          modifyPathCost(unknottedCost, wayknotEffects),
        );
        return {
          ...tile,
          // A visible actor is not an impassable wall. A large bounded cost
          // requests a genuine detour and lets validation reject the proposal
          // cleanly when no route around the observed place exists.
          baseTravelCost: avoidedTiles.has(index)
            ? ordinaryCost + 50_000_000
            : ordinaryCost,
        };
      }),
    };
  }

  function smoothCurrentAutopilotPath(
    traversalTerrain: TerrainState,
    path: readonly number[],
    avoidedTiles: ReadonlySet<number> = new Set<number>(),
  ): number[] {
    const severeWind = Math.trunc(
      (Math.max(Math.abs(worldView.weather.windX), Math.abs(worldView.weather.windY))
        * worldView.weather.intensity) / FIXED_POINT,
    ) >= 400_000;
    const hazardousTile = (tileIndex: number): boolean => {
      const tile = worldView.terrain.tiles[tileIndex];
      return avoidedTiles.has(tileIndex)
        || !tile
        || tile.waterDepth > 55_000
        || tile.terrain !== "meadow"
        || tile.roughness >= 650_000;
    };
    const hazardousEdge = (fromTileIndex: number, toTileIndex: number): boolean => {
      const from = worldView.terrain.tiles[fromTileIndex];
      const to = worldView.terrain.tiles[toTileIndex];
      return !from
        || !to
        || severeWind
        || hazardousTile(fromTileIndex)
        || hazardousTile(toTileIndex)
        || Math.abs(to.elevation - from.elevation) >= 180_000;
    };
    return smoothAutopilotPath(traversalTerrain, path, {
      edgePassable: (fromTileIndex, toTileIndex) => {
        const from = worldView.terrain.tiles[fromTileIndex];
        const to = worldView.terrain.tiles[toTileIndex];
        if (!from || !to) return false;
        return Math.abs(from.x - to.x) + Math.abs(from.y - to.y) === 1;
      },
      hazardousTile,
      hazardousEdge,
    });
  }

  function setAutopilot(point: WorldPoint, additive: boolean, announcePath = true): boolean {
    if (player.mode === "swept") {
      if (announcePath) announce(session, "ADRIFT — tap toward visible shallow water to make a short paddle stroke.", true);
      return false;
    }
    const tileX = clamp(Math.floor(point.x / RENDER_TILE_SIZE), 0, worldView.terrain.width - 1);
    const tileY = clamp(Math.floor(point.y / RENDER_TILE_SIZE), 0, worldView.terrain.height - 1);
    const destination = tileY * worldView.terrain.width + tileX;
    // Pointer paths use the same live depth/tool costs as manual travel. Unknown
    // water receives a caution premium, so sounding a channel can materially
    // improve the Loom's route without ever making manual exploration illegal.
    const traversalTerrain = currentAutopilotTerrain();
    const path = findTilePath(traversalTerrain, playerTileIndex(player), destination);
    if (path.length < 2) {
      if (announcePath) {
        announce(session, "The Loom cannot currently resolve a traversable line there.");
        soundscape.play("warning", 0.45);
      }
      return false;
    }
    const smoothed = smoothCurrentAutopilotPath(traversalTerrain, path);
    const route = path.slice(1);
    const next = smoothed.slice(1);
    autopilotPath = additive ? [...autopilotPath, ...next] : next;
    const unknownWater = route.filter(
      (index) => (worldView.terrain.tiles[index]?.waterDepth ?? 0) > 40_000
        && (player.depthSoundings[index] ?? 0) <= 0,
    ).length;
    if (announcePath) {
      announce(
        session,
        `Loom path set across ${route.length} terrain marks${unknownWater > 0 ? `, including ${unknownWater} unsounded water marks` : " using sounded depth and your field tools"}.`,
      );
    }
    return true;
  }

  function physicalParcelPosition(parcelId: string): WorldPoint | null {
    const located = locateVisiblePhysicalCargoEntity(parcelId);
    if (!located) return null;
    const playerPoint = playerPositionAtRegionalLooseCargo(worldView, {
      region: located.world.region,
      x: located.entity.x,
      y: located.entity.y,
    });
    if (!playerPoint) return null;
    return {
      x: (playerPoint.x / TILE_UNITS) * RENDER_TILE_SIZE,
      y: (playerPoint.y / TILE_UNITS) * RENDER_TILE_SIZE,
    };
  }

  function locateVisiblePhysicalCargoEntity(parcelId: string): {
    readonly world: LooseCargoWorldState;
    readonly entity: LooseCargoWorldState["entities"][number];
  } | null {
    for (const cargoWorld of physicalCargoPartitionsForView(physicalCargo, worldView)) {
      const entity = cargoWorld.entities.find(({ id }) => id === parcelId);
      if (entity) return { world: cargoWorld, entity };
    }
    return null;
  }

  function playerCargoPositionInRegion(
    region: LooseCargoRegionAddress,
  ): { readonly x: number; readonly y: number } | null {
    const position = looseCargoPositionAtRegionalPlayer(worldView, player.x, player.y);
    const x = position.x
      + (position.region.x - region.x) * WORLD_WIDTH * LOOSE_CARGO_TILE_UNITS;
    const y = position.y
      + (position.region.y - region.y) * WORLD_HEIGHT * LOOSE_CARGO_TILE_UNITS;
    return Number.isSafeInteger(x) && Number.isSafeInteger(y) ? { x, y } : null;
  }

  function parcelPositionIsDirectlyObserved(point: WorldPoint): boolean {
    if (!perception.valid) return false;
    const column = Math.floor(point.x / RENDER_TILE_SIZE);
    const row = Math.floor(point.y / RENDER_TILE_SIZE);
    if (
      !Number.isSafeInteger(column)
      || !Number.isSafeInteger(row)
      || column < 0
      || column >= worldView.terrain.width
      || row < 0
      || row >= worldView.terrain.height
    ) return false;
    return perception.detailVisibilityGrades[row * worldView.terrain.width + column]
      === VISIBILITY_DIRECT;
  }

  function recoverPhysicalParcel(parcelId: string, announceFailure = true): boolean {
    if (physicalReceiptPending()) {
      if (announceFailure) {
        announce(session, "The harbor is sealing an exact receipt. Recover the parcel when that transaction settles.", true);
        soundscape.play("warning", 0.3);
      }
      return false;
    }
    const located = locateVisiblePhysicalCargoEntity(parcelId);
    const position = located ? playerCargoPositionInRegion(located.world.region) : null;
    if (!located || !position) {
      if (announceFailure) announce(session, "That exact parcel is no longer within this traveled scene.", true);
      return false;
    }
    const recovered = pickupLooseCargo(
      located.world,
      physicalCargo.carrier,
      {
        entityId: parcelId,
        x: position.x,
        y: position.y,
        reach: LOOSE_CARGO_RECOVERY_REACH,
      },
    );
    if (!recovered.ok) {
      if (announceFailure) {
        announce(session, recovered.message, recovered.reason !== "out-of-reach");
        if (recovered.reason !== "out-of-reach") soundscape.play("warning", 0.32);
      }
      return false;
    }
    physicalCargo = commitPhysicalCargoRegionalMutation(
      physicalCargo,
      { looseWorld: recovered.world, carrier: recovered.carrier },
      { kind: "conserved" },
    );
    mirrorPhysicalCargoToPlayer();
    if (pendingParcelTargetId === parcelId) {
      pendingParcelTargetId = null;
      pendingParcelRecoverOnArrival = false;
      autopilotPath = [];
    }
    announce(session, `${recovered.message} Its exact condition and history stayed with it.`, true);
    soundscape.play("strand", 0.58);
    return true;
  }

  function targetPhysicalParcel(parcelId: string, recoverOnArrival: boolean): void {
    if (session.paused || session.titleVisible || session.quietHourVisible) return;
    const point = physicalParcelPosition(parcelId);
    if (!point || !parcelPositionIsDirectlyObserved(point)) {
      pendingParcelTargetId = null;
      pendingParcelRecoverOnArrival = false;
      announce(session, "That parcel is no longer in exact sight. Its last observed place remains yours to search.", true);
      return;
    }
    if (recoverPhysicalParcel(parcelId, false)) {
      refreshViews();
      return;
    }
    if (!recoverOnArrival) {
      announce(session, "That parcel moved beyond arm's reach. Move closer and press E again.");
      refreshViews();
      return;
    }
    pendingGatherNodeId = null;
    pendingParcelTargetId = parcelId;
    pendingParcelRecoverOnArrival = true;
    if (!setAutopilot(point, false, false)) {
      pendingParcelTargetId = null;
      pendingParcelRecoverOnArrival = false;
      announce(session, "The parcel is visible, but the Loom cannot currently resolve a safe approach.", true);
      soundscape.play("warning", 0.35);
    } else {
      announce(session, "Parcel marked. The Loom follows its current position; recovery happens only inside physical reach.");
    }
    refreshViews();
  }

  function advancePendingParcelTarget(): void {
    const parcelId = pendingParcelTargetId;
    if (!parcelId || !pendingParcelRecoverOnArrival) return;
    const point = physicalParcelPosition(parcelId);
    if (!point) {
      pendingParcelTargetId = null;
      pendingParcelRecoverOnArrival = false;
      autopilotPath = [];
      announce(session, "The marked parcel left the loaded scene; no other object was targeted in its place.", true);
      return;
    }
    // Keep walking toward the last observed point, but never steer from the
    // parcel's hidden live coordinates. Reacquiring direct detail sight lets
    // the target update again.
    if (!parcelPositionIsDirectlyObserved(point)) return;
    if (recoverPhysicalParcel(parcelId, false)) return;
    if (!setAutopilot(point, false, false)) {
      pendingParcelTargetId = null;
      pendingParcelRecoverOnArrival = false;
      autopilotPath = [];
      announce(session, "The marked parcel is currently unreachable. Its identity remains on the chart.", true);
    }
  }

  function dropPhysicalLot(lotId: string, quantity: number): void {
    if (kitActionBlocked()) return;
    const lot = physicalCargo.carrier.lots.find((candidate) => candidate.id === lotId);
    if (!lot) {
      announce(session, "That exact carried lot is no longer in the PACK.", true);
      return;
    }
    if (lot.payload.kind === "promise"
      && (pendingAcceptance !== null || pendingDelivery !== null || pendingRenegotiation !== null)) {
      announce(session, "The harbor is still sealing this Promise transaction. Keep its cargo in hand until the receipt settles.", true);
      soundscape.play("warning", 0.35);
      return;
    }
    const position = looseCargoPositionAtRegionalPlayer(worldView, player.x, player.y);
    const dropped = dropLooseCargo(
      physicalCargo.looseWorld,
      physicalCargo.carrier,
      {
        lotId,
        ...(lot.payload.kind === "stack" ? { quantity } : {}),
        x: position.x,
        y: position.y,
      },
    );
    if (!dropped.ok) {
      announce(session, dropped.message, true);
      soundscape.play("warning", 0.35);
      return;
    }
    physicalCargo = commitPhysicalCargoState(
      physicalCargo,
      { looseWorld: dropped.world, carrier: dropped.carrier },
      { kind: "conserved" },
    );
    mirrorPhysicalCargoToPlayer();
    announce(session, `${dropped.message} Water, grade, weather, and rock impact can now move or mark it.`, true);
    soundscape.play("impact", 0.42, dropped.entity?.origin.ordinal ?? 0);
  }

  function fieldResourceNode(nodeId: string): FieldResourceNode | undefined {
    return fieldResourceCatalog.nodes.find((node) => node.id === nodeId);
  }

  function targetFieldResource(nodeId: string, gatherOnArrival: boolean): void {
    if (session.paused || session.titleVisible || session.quietHourVisible) return;
    if (player.mode === "swept" || player.mode === "rescued") {
      announce(session, "ADRIFT — paddle or float for shallows. Gathering waits until you have footing.", true);
      soundscape.play("warning", 0.3);
      refreshViews();
      return;
    }
    const mapping = regionalFieldResourceById(fieldResourceProjection, nodeId);
    const node = mapping?.source;
    if (!mapping || !node || (player.discovered[mapping.viewTileIndex] ?? 0) <= 0) {
      pendingGatherNodeId = null;
      announce(session, "That field sign is not part of the chart you can currently act on.", true);
      soundscape.play("warning", 0.3);
      refreshViews();
      return;
    }
    if (mapping.viewTileIndex === playerTileIndex(player)) {
      pendingGatherNodeId = null;
      if (gatherOnArrival) gatherFieldResource(node.id);
      else announce(session, `${materialLabel(node.material)} is underfoot. Press E to gather one unit.`);
      refreshViews();
      return;
    }
    const tile = worldView.terrain.tiles[mapping.viewTileIndex];
    if (!tile) throw new Error("Visible field resource lost its regional terrain tile");
    const point = {
      x: (tile.x + 0.5) * RENDER_TILE_SIZE,
      y: (tile.y + 0.5) * RENDER_TILE_SIZE,
    };
    pendingGatherNodeId = null;
    if (!setAutopilot(point, false)) {
      refreshViews();
      return;
    }
    pendingGatherNodeId = gatherOnArrival ? node.id : null;
    announce(
      session,
      gatherOnArrival
        ? `${materialLabel(node.material)} marked. You will gather one unit when you reach its exact patch.`
        : `${materialLabel(node.material)} marked. Reach its exact patch and press E to gather.`,
    );
    refreshViews();
  }

  function gatherFieldResource(nodeId: string): boolean {
    if (physicalReceiptPending()) {
      announce(session, "The harbor is sealing an exact receipt. Gather when that transaction settles.", true);
      soundscape.play("warning", 0.3);
      return false;
    }
    const mapping = regionalFieldResourceById(fieldResourceProjection, nodeId);
    const node = mapping?.source;
    if (!mapping || !node) {
      announce(session, "That natural patch no longer belongs to this estuary.", true);
      return false;
    }
    const label = materialLabel(node.material);
    if (player.mode === "swept" || player.mode === "rescued") {
      announce(session, `You cannot gather ${label} until you have your footing.`, true);
      return false;
    }
    if (mapping.viewTileIndex !== playerTileIndex(player)) {
      announce(session, `Move onto the ${label} patch first. On desktop, press E once it is underfoot.`, true);
      return false;
    }
    if ((player.discovered[mapping.viewTileIndex] ?? 0) <= 0) {
      announce(session, "This patch has not entered your chart yet.", true);
      return false;
    }
    const stock = fieldResourceStockUnits(fieldResourceCatalog, fieldResourceEcology, node.id);
    if (stock === null || stock <= 1) {
      announce(session, `${label} is recovering. Its final living unit stays in the landscape.`, true);
      soundscape.play("warning", 0.3);
      return false;
    }
    const capacityMilli = player.cargoCapacity * PACK_LOAD_MILLI_PER_UNIT;
    const freeMilli = Math.max(0, capacityMilli - cargoWeightMilli(player));
    if (node.unitLoadMilli > freeMilli) {
      announce(
        session,
        `Pack needs ${formatMilliLoad(node.unitLoadMilli - freeMilli)} more load for one ${label}. Open KIT to make room.`,
        true,
      );
      soundscape.play("warning", 0.35);
      return false;
    }
    const harvested = harvestFieldResource(
      fieldResourceCatalog,
      fieldResourceEcology,
      node.id,
      1,
    );
    if (!harvested.ok || harvested.material === null) {
      announce(
        session,
        harvested.reason === "living-reserve"
          ? `${label} is recovering. Its final living unit stays in the landscape.`
          : `${label} could not be gathered; the patch was left unchanged.`,
        true,
      );
      soundscape.play("warning", 0.3);
      return false;
    }
    const payload: LooseCargoPayload = {
      kind: "stack",
      item: harvested.material,
      quantity: 1,
    };
    let gatheredPhysicalCargo: PhysicalCargoState;
    try {
      const source = quotePhysicalCargoSource(
        physicalCargo,
        "gather",
        `${node.id}:${harvested.state.activeTick}`,
      );
      const added = addLooseCargoStack(physicalCargo.carrier, {
        sourceLotId: source.lotId,
        item: harvested.material,
        quantity: 1,
      });
      if (!added.ok) throw new Error(added.reason);
      gatheredPhysicalCargo = commitPhysicalCargoState(
        physicalCargo,
        {
          looseWorld: physicalCargo.looseWorld,
          carrier: added.carrier,
          committedSourceOrdinal: source.ordinal,
        },
        { kind: "delta", removed: [], added: [payload] },
      );
    } catch (error) {
      announce(session, `The ${label} remained rooted because its exact PACK transaction could not settle: ${errorMessage(error)}.`, true);
      soundscape.play("warning", 0.35);
      return false;
    }
    physicalCargo = gatheredPhysicalCargo;
    mirrorPhysicalCargoToPlayer();
    fieldResourceEcology = harvested.state;
    const staminaCost = GATHER_STAMINA_COST[harvested.material];
    player.stamina = Math.max(0, player.stamina - staminaCost);
    const remaining = Math.max(1, stock - 1);
    const tile = worldView.terrain.tiles[mapping.viewTileIndex];
    const sweepWarning = player.stamina === 0 && (tile?.waterDepth ?? 0) >= 120_000
      ? " STAMINA EMPTY IN DEEP WATER — the current takes control on the next field beat."
      : "";
    announce(
      session,
      `Gathered 1 ${label} · ${resourceStockBand(remaining, node.capacityUnits)} remains · pack ${formatMilliLoad(cargoWeightMilli(player))} / ${formatMilliLoad(capacityMilli)}.${sweepWarning}`,
      sweepWarning.length > 0,
    );
    soundscape.play("strand", 0.42);
    return true;
  }

  function scan(): void {
    if (session.paused || session.titleVisible) return;
    if (player.mode === "swept") {
      announce(session, "ADRIFT — the sounding line stays secured while both hands paddle. Read visible shallows and float when stamina is low.", true);
      soundscape.play("warning", 0.3);
      refreshViews();
      return;
    }
    const activeTideHarp = activeTideHarpAtPlayer(player, worldView);
    if (pulseScan(player, worldView)) {
      session.tutorial.scansUsed += 1;
      soundscape.play("scan");
      announce(session, tideHarpPulseAnnouncement(activeTideHarp));
      refreshViews();
    } else {
      announce(session, "The Loom is recharging. The current map remains trustworthy.");
      soundscape.play("warning", 0.3);
    }
  }

  function toggleWayknot(): void {
    if (session.paused || session.titleVisible || session.quietHourVisible) return;
    if (player.mode === "swept") {
      announce(session, "ADRIFT — reclaim or bind a Wayknot after you reach shallow water and stand.", true);
      soundscape.play("warning", 0.3);
      refreshViews();
      return;
    }
    const tileIndex = playerTileIndex(player);
    const resolved = regionalWayknotContextAt(worldView, tileIndex);
    if (!resolved) {
      announce(session, "The field kit cannot read this patch of the estuary.", true);
      return;
    }
    const context = resolved.context;
    const existing = wayknotAtTile(
      player.wayknots,
      resolved.localTileIndex,
      resolved.region,
    );
    if (
      !existing
      && context.terrain !== "deep-water"
      && context.waterDepth > 20_000
      && (player.depthSoundings[tileIndex] ?? 0) <= 0
    ) {
      announce(
        session,
        "Sound this flooded ground before binding a Wayknot. Pulse Space first; the recorded depth will tell the field kit which weave is safe.",
        true,
      );
      soundscape.play("warning", 0.35);
      refreshViews();
      return;
    }
    const intendedKind = existing?.kind ?? contextualWayknotKind(context);
    const result = toggleContextualWayknot(
      player.wayknots,
      context,
      worldView.completedTick,
      resolved.region,
    );
    if (!result.ok || !result.wayknot) {
      announce(
        session,
        wayknotFailureMessage(result.reason, intendedKind, result.placementReason),
        true,
      );
      soundscape.play("warning", 0.35);
      refreshViews();
      return;
    }
    player.wayknots = result.state;
    const label = WAYKNOT_LABELS[result.wayknot.kind];
    if (result.reason === "reclaimed") {
      session.sessionChanges.push(`${label} #${result.wayknot.id} returned to the reusable field kit.`);
      announce(
        session,
        `${label} reclaimed at ${Math.round(result.wayknot.condition / 10_000)}% condition. Moving a field aid wears it; open KIT → MEND to repair this same numbered core piece.`,
      );
      soundscape.play("rest", 0.52);
    } else {
      session.sessionChanges.push(`${label} #${result.wayknot.id} was bound into the traveled landscape.`);
      announce(
        session,
        `${label} bound here at ${Math.round(result.wayknot.condition / 10_000)}% condition. It supplies half strength while setting for 3 world ticks, then full strength. ${WAYKNOT_DESCRIPTIONS[result.wayknot.kind]} Stand on it and press F again to reclaim it.`,
        true,
      );
      soundscape.play("strand", 0.72);
    }
    if (session.sessionChanges.length > 32) session.sessionChanges.splice(0, 8);
    refreshViews();
  }

  function secureSettlementFoodStore(): boolean {
    const keeper = settlementStoreKeeperAtPlayer(projectPerception(worldView, player));
    if (keeper === null) return false;
    const atTick = world.meta.completedTick;
    const report = createSettlementPlayerStoreReport(settlementEcology, atTick);
    const informed = report === null
      ? null
      : recordSettlementKeeperKnowledge(settlementEcology, atTick, {
          kind: "player-report",
          report,
        });
    const proposal = informed === null
      ? null
      : proposeSettlementKeeperStoreResponse(informed, atTick);
    const resolution = informed === null || proposal === null
      ? null
      : applySettlementKeeperStoreResponse(informed, proposal);
    if (resolution === null || !resolution.applied) {
      announce(session, "The store warning cannot be acted on right now.");
      soundscape.play("warning", 0.28);
      refreshViews();
      return true;
    }
    settlementEcology = resolution.state;
    const keeperSpeech = "I'll bar the storehouse door.";
    residentSpeech.set(keeper.resident.id, {
      text: keeperSpeech.slice(0, 72),
      untilSessionMs: Math.min(
        Number.MAX_SAFE_INTEGER,
        Math.max(0, session.sessionPlayMilliseconds) + 4_000,
      ),
    });
    session.sessionChanges.push("You warned a visible store keeper, who secured the physical food stock.");
    if (session.sessionChanges.length > 32) session.sessionChanges.splice(0, 8);
    announce(
      session,
      "You warn the keeper. The storehouse door is barred, and the remaining food stays physically inside.",
    );
    soundscape.play("ui", 0.6);
    refreshViews();
    saveInBackground();
    return true;
  }

  function interact(): void {
    if (session.paused || session.titleVisible) return;
    const reachableParcel = physicalCargoPartitionsForView(physicalCargo, worldView)
      .flatMap((cargoWorld) => {
        const porterPosition = playerCargoPositionInRegion(cargoWorld.region);
        return porterPosition
          ? cargoWorld.entities.map((entity) => ({
              entity,
              distance: Math.abs(entity.x - porterPosition.x)
                + Math.abs(entity.y - porterPosition.y),
            }))
          : [];
      })
      .filter(({ distance }) => distance <= LOOSE_CARGO_RECOVERY_REACH)
      .sort((left, right) => left.distance - right.distance || left.entity.id.localeCompare(right.entity.id))[0];
    if (reachableParcel) {
      recoverPhysicalParcel(reachableParcel.entity.id);
      refreshViews();
      return;
    }
    if (player.mode === "swept") {
      announce(session, "ADRIFT — nothing loose is within arm's reach. Paddle for shallows; harbor and gathering work needs footing.", true);
      soundscape.play("warning", 0.3);
      refreshViews();
      return;
    }
    const resource = regionalFieldResourceAtViewTile(
      fieldResourceProjection,
      playerTileIndex(player),
    );
    if (resource && (player.discovered[resource.viewTileIndex] ?? 0) > 0) {
      gatherFieldResource(resource.source.id);
      refreshViews();
      return;
    }
    const settlementId = settlementAtPlayer(player, worldView);
    if (settlementId === null) {
      announce(session, "No harbor or strand structure is within reach.");
      return;
    }
    const active = player.activeContractId === null
      ? undefined
      : worldView.contracts.find((contract) => contract.id === player.activeContractId);
    if (active?.destinationSettlementId === settlementId && active.status === "in-transit") {
      deliver(active);
      return;
    }
    if (player.report?.targetSettlementId === settlementId) {
      deliverReport();
      return;
    }
    if (secureSettlementFoodStore()) return;
    if (player.activeContractId === null && player.report === null) {
      const localOffers = worldView.contracts
        .filter((contract) => contract.status === "offered" && contract.originSettlementId === settlementId)
        .sort((left, right) => left.dueTick - right.dueTick || left.id - right.id);
      const trackedLocal = localOffers.find((contract) => contract.id === session.trackedContractId);
      if (trackedLocal || localOffers.length === 1) {
        accept(trackedLocal ?? localOffers[0]!);
        return;
      }
      if (localOffers.length > 1) {
        session.selectedSettlementId = settlementId;
        announce(
          session,
          `${localOffers.length} physical cargo promises are waiting here. Choose one in the scrollable Promises list; “Sign info report” is a separate one-document information journey that moves no goods.`,
        );
        soundscape.play("ui");
        refreshViews();
        return;
      }
    }
    session.selectedSettlementId = settlementId;
    const settlement = worldView.settlements.find((candidate) => candidate.id === settlementId);
    announce(session, `${settlement?.name ?? "The harbor"} is ready to be inspected.`);
    soundscape.play("ui");
    refreshViews();
  }

  function handleContractCommand(action: "inspect" | "accept" | "track" | "renegotiate", contractId: number): void {
    const contract = worldView.contracts.find((candidate) => candidate.id === contractId);
    if (!contract) return;
    session.inspectedContractId = contractId;
    if (action === "inspect") {
      session.selectedSettlementId = contract.status === "offered"
        ? contract.originSettlementId
        : contract.destinationSettlementId;
      return;
    }
    if (action === "track") {
      session.trackedContractId = contractId;
      focusContractTarget(contract);
      return;
    }
    if (player.mode === "swept" && (action === "accept" || action === "renegotiate")) {
      announce(session, "ADRIFT — you can read and track a Promise, but its physical handoff waits until you have footing.", true);
      soundscape.play("warning", 0.3);
      return;
    }
    if (action === "renegotiate") {
      renegotiate(contract);
      return;
    }
    accept(contract);
  }

  function accept(contract: ContractState): void {
    const here = settlementAtPlayer(player, worldView);
    if (here !== contract.originSettlementId) {
      session.trackedContractId = contract.id;
      announce(session, `Pickup charted at ${settlementName(economyView, contract.originSettlementId)}. The amber marker and highlighted route will stay with you.`);
      focusContractOrigin(contract);
      refreshViews();
      return;
    }
    if (player.activeContractId !== null) {
      announce(session, "Finish or renegotiate the promise already in your pack before taking another.");
      return;
    }
    const playerCandidate = structuredClone(player);
    if (!loadContractCargo(playerCandidate, contract)) {
      announce(session, "That load does not fit the current pack. Choose a lighter promise.", true);
      soundscape.play("warning");
      return;
    }
    const cargo = playerCandidate.cargo.find((candidate) => candidate.contractId === contract.id);
    if (!cargo) throw new Error("Promise pickup did not create its player mirror");
    const payload: LooseCargoPayload = {
      kind: "promise",
      contractId: contract.id,
      resource: contract.resource,
      quantity: contract.quantity,
      property: cargo.property,
    };
    let acceptedPhysicalCargo: PhysicalCargoState;
    try {
      const source = quotePhysicalCargoSource(
        physicalCargo,
        "promise-pickup",
        `contract:${contract.id}:origin:${contract.originSettlementId}`,
      );
      const physicalPickup = upsertLooseCargoPromise(physicalCargo.carrier, {
        sourceLotId: source.lotId,
        contractId: contract.id,
        resource: contract.resource,
        quantity: contract.quantity,
        property: cargo.property,
        materialState: { condition: FIXED_POINT, contamination: 0, decay: 0 },
      });
      if (!physicalPickup.ok) throw new Error(physicalPickup.reason);
      acceptedPhysicalCargo = commitPhysicalCargoState(
        physicalCargo,
        {
          looseWorld: physicalCargo.looseWorld,
          carrier: physicalPickup.carrier,
          committedSourceOrdinal: source.ordinal,
        },
        { kind: "delta", removed: [], added: [payload] },
      );
      // Acceptance remains reversible until the simulation confirms pickup.
      // Proving retirement now prevents a later rejected command from trapping
      // an optimistic physical lot in the pack.
      removePhysicalPromiseContract(acceptedPhysicalCargo, contract.id);
    } catch (error) {
      announce(session, `That load remained in harbor because its exact custody could not be sealed: ${errorMessage(error)}.`, true);
      soundscape.play("warning", 0.4);
      return;
    }
    physicalCargo = acceptedPhysicalCargo;
    player = playerCandidate;
    promiseJourney = beginRegionalPromiseJourney(contract, economyView);
    mirrorPhysicalCargoToPlayer();
    const acceptCommandId = commandId("accept");
    const pickupCommandId = commandId("pickup");
    queue({
      id: acceptCommandId,
      type: "accept-contract",
      contractId: contract.id,
      carrier: "player",
      sourceId: 0,
      sequence: commandSequence,
    });
    queue({
      id: pickupCommandId,
      type: "pickup-contract",
      contractId: contract.id,
      originSettlementId: contract.originSettlementId,
      sourceId: 0,
      sequence: commandSequence,
    });
    pendingAcceptance = { contractId: contract.id, acceptCommandId, pickupCommandId };
    session.tutorial.acceptedPromises += 1;
    session.trackedContractId = contract.id;
    announce(session, `Promise made: bring ${contract.quantity} ${humanResource(contract.resource)} to ${settlementName(economyView, contract.destinationSettlementId)}.`);
    soundscape.play("accept");
    focusContractDestination(contract);
    refreshViews();
  }

  function renegotiate(contract: ContractState): void {
    if (pendingRenegotiation !== null || pendingDelivery !== null) return;
    const here = settlementAtPlayer(player, worldView);
    if (here === null) {
      announce(session, "Reach any harbor to hand the cargo into accountable local care. Your traveled trace will remain.");
      return;
    }
    const custody = physicalPromiseCustody(contract.id);
    if (custody.looseQuantity > 0 || custody.carriedQuantity !== contract.cargoQuantity) {
      announce(
        session,
        `RECOVER CARGO — ${custody.looseQuantity} promised unit${custody.looseQuantity === 1 ? " is" : "s are"} still loose. A harbor cannot sign for a partial handoff.`,
        true,
      );
      soundscape.play("warning", 0.42);
      return;
    }
    const preflightFailure = preflightPhysicalPromiseRemoval(contract.id);
    if (preflightFailure) {
      announce(session, `The harbor left the Promise untouched because its exact handoff could not be sealed: ${preflightFailure}.`, true);
      soundscape.play("warning", 0.42);
      return;
    }
    const handoffCommandId = commandId("handoff");
    queue({
      id: handoffCommandId,
      type: "cancel-contract",
      contractId: contract.id,
      returnSettlementId: here,
      sourceId: 0,
      sequence: commandSequence,
    });
    pendingRenegotiation = { contractId: contract.id, settlementId: here, commandId: handoffCommandId };
    announce(session, `${settlementName(economyView, here)} is receiving an accountable handoff. No cargo or map knowledge will vanish.`);
    soundscape.play("strand", 0.45);
  }

  function deliver(contract: ContractState): void {
    if (pendingDelivery !== null) return;
    const custody = physicalPromiseCustody(contract.id);
    if (custody.looseQuantity > 0 || custody.carriedQuantity !== contract.cargoQuantity) {
      announce(
        session,
        custody.looseQuantity > 0
          ? `RECOVER CARGO — ${custody.looseQuantity} promised unit${custody.looseQuantity === 1 ? " is" : "s are"} still loose in the world. The harbor will only receive the complete physical shipment.`
          : "The promise is recorded, but its complete physical cargo is not in your pack.",
        true,
      );
      soundscape.play("warning", 0.42);
      return;
    }
    const preflightFailure = preflightPhysicalPromiseRemoval(contract.id);
    if (preflightFailure) {
      announce(session, `The harbor left the Promise in your pack because its exact delivery could not be sealed: ${preflightFailure}.`, true);
      soundscape.play("warning", 0.42);
      return;
    }
    const deliverCommandId = commandId("deliver");
    const deliveryRoute = economyView.routes.find((route) => route.id === contract.routeId);
    const routeEvidence = regionalPromiseDeliveryEvidence(
      promiseJourney,
      contract,
      economyView,
    );
    queue({
      id: deliverCommandId,
      type: "deliver-contract",
      contractId: contract.id,
      destinationSettlementId: contract.destinationSettlementId,
      condition: custody.condition,
      trace: [...routeEvidence.trace],
      routeEvidence: routeEvidence.routeEvidence,
      sourceId: 0,
      sequence: commandSequence,
    });
    pendingDelivery = {
      contractId: contract.id,
      commandId: deliverCommandId,
      wasAutomated: (deliveryRoute?.traceStrength ?? 0) >= STRAND_AUTOMATION_THRESHOLD,
    };
    announce(
      session,
      routeEvidence.routeEvidence === "regional-detour"
        ? "The harbor is receiving the cargo. This expedition left the local chart, so delivery counts fully but no finite-map route is reinforced."
        : "The harbor is receiving the cargo and reading the route you left behind…",
    );
    soundscape.play("strand", 0.8);
  }

  function focusContractOrigin(contract: ContractState): void {
    focusSettlement(contract.originSettlementId);
  }

  function focusContractDestination(contract: ContractState): void {
    focusSettlement(contract.destinationSettlementId);
  }

  function focusContractTarget(contract: ContractState): void {
    if (contract.status === "offered") focusContractOrigin(contract);
    else focusContractDestination(contract);
  }

  function focusSettlement(settlementId: number): void {
    session.selectedSettlementId = settlementId;
    const settlement = worldView.settlements.find((candidate) => candidate.id === settlementId);
    const tile = settlement ? worldView.terrain.tiles[settlement.tileIndex] : undefined;
    if (tile) focusHandler?.({ x: (tile.x + 0.5) * RENDER_TILE_SIZE, y: (tile.y + 0.5) * RENDER_TILE_SIZE }, 1.25);
  }

  function recordHarborArrival(arrivalHarborId: number): void {
    const fromHarborId = player.lastHarborId;
    const arrival = worldView.settlements.find((settlement) => settlement.id === arrivalHarborId);
    if (!arrival) return;
    if (fromHarborId === null) {
      player.lastHarborId = arrivalHarborId;
      player.harborTrail = [arrivalHarborId];
      player.surveyTrace = [arrival.tileIndex];
      return;
    }
    if (fromHarborId === arrivalHarborId) {
      player.surveyTrace = [arrival.tileIndex];
      return;
    }

    const leg = assessHarborLeg(worldView, fromHarborId, arrivalHarborId, player.surveyTrace);
    const rememberedChoirKeys = worldView.choirs.map(
      (choir) => `tide-choir:${[...choir.routeIds].sort((left, right) => left - right).join("-")}`,
    );
    const phrase = appendSurveyedHarborLeg(worldView, player.harborTrail, leg, rememberedChoirKeys);
    player.lastHarborId = arrivalHarborId;
    player.harborTrail = [...phrase.trail];
    player.surveyTrace = [arrival.tileIndex];

    const fromName = settlementName(economyView, fromHarborId);
    const toName = arrival.name;
    if (!leg.surveyed || leg.routeId === null) {
      announce(
        session,
        `${fromName} → ${toName} was traveled, but only ${Math.round(leg.coverage / 10_000)}% followed that corridor. Exact terrain still remembers you; stay near the visible route for 70% to survey its shared strand.`,
      );
      return;
    }

    if (!player.surveyedRouteIds.includes(leg.routeId)) {
      player.surveyedRouteIds = [...player.surveyedRouteIds, leg.routeId].sort((left, right) => left - right);
      session.sessionChanges.push(`${fromName} ↔ ${toName} was surveyed closely enough for accountable strand work.`);
      announce(
        session,
        `Survey complete: ${fromName} ↔ ${toName} is now safe to strengthen with shared parts. ${Math.round(leg.coverage / 10_000)}% of the corridor was heard.`,
      );
      soundscape.play("strand", 0.58);
    } else if (phrase.reason === "immediate-backtrack") {
      announce(session, `${fromName} ↔ ${toName} remains surveyed. A Tide Choir needs at least three different harbor legs, so a simple out-and-back does not close a song.`);
    }

    if (phrase.choir === null || pendingChoir !== null) return;
    const awakenCommandId = commandId("choir");
    queue({
      id: awakenCommandId,
      type: "awaken-tide-choir",
      routeIds: [...phrase.choir.routeIds],
      sourceId: 0,
      sequence: commandSequence,
    });
    pendingChoir = { commandId: awakenCommandId, cycle: phrase.choir };
    announce(session, `A complete harbor loop is resonating. The estuary is checking whether this Tide Choir has sung before…`);
    soundscape.play("strand", 0.82);
  }

  function reinforceStrand(routeId: number, settlementId: number): void {
    if (session.paused || session.titleVisible || pendingReinforcement !== null) return;
    const here = settlementAtPlayer(player, worldView);
    const settlement = economyView.settlements.find((candidate) => candidate.id === settlementId);
    const route = economyView.routes.find((candidate) => candidate.id === routeId);
    if (!settlement || !route || here !== settlementId) {
      announce(session, "Strand work must begin at the harbor whose shared stores will supply it.");
      soundscape.play("warning", 0.4);
      return;
    }
    if (route.fromSettlementId !== settlementId && route.toSettlementId !== settlementId) {
      announce(session, "That route does not meet this harbor.");
      soundscape.play("warning", 0.4);
      return;
    }
    if (!player.surveyedRouteIds.includes(route.id)) {
      const otherId = route.fromSettlementId === settlementId ? route.toSettlementId : route.fromSettlementId;
      announce(
        session,
        `Survey this corridor first: travel from ${settlement.name} to ${settlementName(economyView, otherId)} along the visible route. Parts only improve paths you have physically learned.`,
      );
      soundscape.play("warning", 0.4);
      return;
    }
    if (settlement.inventory.parts < 1) {
      announce(session, `${settlement.name} needs a parts delivery before this strand can be tended.`);
      soundscape.play("warning", 0.4);
      return;
    }
    const actionCommandId = commandId("reinforce");
    queue({
      id: actionCommandId,
      type: "reinforce-route",
      routeId,
      settlementId,
      parts: 1,
      sourceId: 0,
      sequence: commandSequence,
    });
    pendingReinforcement = {
      routeId,
      settlementId,
      commandId: actionCommandId,
      wasAutomated: route.traceStrength >= STRAND_AUTOMATION_THRESHOLD,
    };
    announce(session, `${settlement.name} is weaving one shared part into the route. The result will belong to every porter.`);
    soundscape.play("strand", 0.55);
  }

  function collectReport(sourceSettlementId: number, targetSettlementId: number): void {
    if (session.paused || session.titleVisible) return;
    const source = economyView.settlements.find((settlement) => settlement.id === sourceSettlementId);
    const target = economyView.settlements.find((settlement) => settlement.id === targetSettlementId);
    if (!source || !target || settlementAtPlayer(player, worldView) !== sourceSettlementId) {
      announce(session, "A signed report must be witnessed at the harbor that produced it.");
      soundscape.play("warning", 0.35);
      return;
    }
    if (player.report !== null) {
      announce(session, "Your document case already holds one accountable report. Deliver or hand it on before taking another.");
      return;
    }
    if (
      cargoWeightMilli(player) + PACK_LOAD_MILLI_PER_UNIT
      > player.cargoCapacity * PACK_LOAD_MILLI_PER_UNIT
    ) {
      announce(session, "The pack needs one full load free for the sealed document case. Open KIT to make room.");
      soundscape.play("warning", 0.35);
      return;
    }
    let reportedPhysicalCargo: PhysicalCargoState;
    try {
      const reportSource = quotePhysicalCargoSource(
        physicalCargo,
        "report-sign",
        `${sourceSettlementId}:${targetSettlementId}:${worldView.completedTick}`,
      );
      const reserved = setLooseCargoReservedLoad(
        physicalCargo.carrier,
        physicalCargo.carrier.reservedLoadMilli + PACK_LOAD_MILLI_PER_UNIT,
      );
      if (!reserved.ok) throw new Error(reserved.reason);
      reportedPhysicalCargo = commitPhysicalCargoState(
        physicalCargo,
        {
          looseWorld: physicalCargo.looseWorld,
          carrier: reserved.carrier,
          committedSourceOrdinal: reportSource.ordinal,
        },
        {
          kind: "delta",
          removed: [],
          added: [],
          reservedLoadDeltaMilli: PACK_LOAD_MILLI_PER_UNIT,
        },
      );
    } catch (error) {
      announce(session, `The sealed document case stayed at the desk: ${errorMessage(error)}.`, true);
      soundscape.play("warning", 0.35);
      return;
    }
    physicalCargo = reportedPhysicalCargo;
    const resource = source.specialization;
    player.report = {
      sourceSettlementId,
      targetSettlementId,
      resource,
      reportedQuantity: source.inventory[resource],
      observedTick: worldView.completedTick,
      confidence: 1_000_000,
    };
    announce(session, `${source.name} signed its ${humanResource(resource)} count for ${target.name}. Carry the truth there and press E to relay it.`);
    soundscape.play("accept", 0.72);
    focusSettlement(targetSettlementId);
    refreshViews();
  }

  function deliverReport(): void {
    const report = player.report;
    if (!report || pendingReportDelivery !== null) return;
    const preflightFailure = preflightReportRelease();
    if (preflightFailure) {
      announce(session, `The report stayed in its sealed case because the handoff could not be recorded exactly: ${preflightFailure}.`, true);
      soundscape.play("warning", 0.4);
      return;
    }
    const reportCommandId = commandId("report");
    queue({
      id: reportCommandId,
      type: "share-knowledge",
      fromSettlementId: report.sourceSettlementId,
      toSettlementId: report.targetSettlementId,
      subjectSettlementId: report.sourceSettlementId,
      resource: report.resource,
      reportedQuantity: report.reportedQuantity,
      observedTick: report.observedTick,
      confidence: report.confidence,
      sourceId: 0,
      sequence: commandSequence,
    });
    pendingReportDelivery = { commandId: reportCommandId, targetSettlementId: report.targetSettlementId };
    announce(session, "The harbor is checking the signature, source, age, and count…");
    soundscape.play("strand", 0.5);
  }

  function openQuietHour(): void {
    session.paused = true;
    session.quietHourVisible = true;
    soundscape.play("rest");
    saveInBackground();
  }

  /**
   * Internal saves must never become unhandled promise rejections. A failed
   * write leaves the current world authoritative in memory and schedules a
   * fresh snapshot, so a retry always includes changes made after the failure.
   */
  function saveInBackground(): void {
    void save().catch(() => undefined);
  }

  function scheduleSaveRetry(): void {
    if (destroyed || saveRetryTimer !== undefined) return;
    const delay = Math.min(
      SAVE_RETRY_MAX_DELAY_MS,
      SAVE_RETRY_BASE_DELAY_MS * (2 ** Math.min(saveRetryAttempts, 4)),
    );
    saveRetryAttempts += 1;
    saveRetryTimer = setTimeout(() => {
      saveRetryTimer = undefined;
      saveInBackground();
    }, delay);
  }

  function noteSaveFailure(retryable = true): void {
    if (destroyed) return;
    const wasRecoverableIssue = recoverableSaveIssue !== null;
    recoverableSaveIssue = null;
    if (!saveFailureVisible || wasRecoverableIssue) {
      saveFailureVisible = true;
      announce(
        session,
        "LOCAL SAVE FAILED — this estuary remains open in memory but is not durable yet. Keep this window open; Tideweft will retry automatically.",
        true,
      );
      refreshViews();
    }
    if (retryable) scheduleSaveRetry();
  }

  function noteStaleSave(): void {
    if (destroyed) return;
    recoverableSaveIssue = null;
    staleSaveDetected = true;
    newerSaveUnavailable = false;
    saveRecoveryBlocked = true;
    saveFailureVisible = true;
    session.paused = true;
    session.titleVisible = true;
    session.hasSave = false;
    if (saveRetryTimer !== undefined) {
      clearTimeout(saveRetryTimer);
      saveRetryTimer = undefined;
    }
    announce(
      session,
      "LOCAL SAVE SUPERSEDED — another tab or copy stored a different or newer durable version. This window will not retry or overwrite it; reload to resolve the copies and continue.",
      true,
    );
    refreshViews();
  }

  function noteSaveSuccess(record: SaveRecord, sequence: number): void {
    // A replacement world can be created while an older generation's retry is
    // still inside the repository. That older write may complete successfully,
    // but it does not make the world currently on screen durable. Leave the
    // warning and current-generation retry state intact until a covering write
    // for this generation succeeds.
    if (
      (record.saveGenerationEra ?? 0) !== saveGenerationEra
      || (record.saveGeneration ?? 0) !== saveGeneration
      || sequence !== saveSequence
    ) return;
    saveRetryAttempts = 0;
    if (saveRetryTimer !== undefined) {
      clearTimeout(saveRetryTimer);
      saveRetryTimer = undefined;
    }
    if (!saveFailureVisible || destroyed) return;
    const resolvedRecoverableIssue = recoverableSaveIssue;
    recoverableSaveIssue = null;
    saveFailureVisible = false;
    announce(
      session,
      resolvedRecoverableIssue
        ? "LOCAL SAVE REPLACED — the new estuary is durable and the unreadable or conflicting copy can no longer return."
        : "LOCAL SAVE RESTORED — the current estuary is durable on this device again.",
      true,
    );
    refreshViews();
  }

  async function save(): Promise<void> {
    if (saveReadFailed) {
      throw new Error("Local save storage could not be read; reload before starting or saving.");
    }
    if (replacementSeedRequired) {
      throw new Error("Choose a seed before replacing the unreadable or conflicting local autosave.");
    }
    if (saveRecoveryBlocked) {
      noteSaveFailure(false);
      throw new Error(staleSaveDetected
        ? "This runtime was superseded by a newer local save; reload before continuing."
        : newerSaveUnavailable
          ? "A newer local save is temporarily unavailable."
          : "The local save replacement counter is exhausted.");
    }
    const regionalTravelSnapshot = capturePlayerRegionalTravel(regionalTravel, player);
    const needsContractWorldRepair = world.contracts.some(isAcceptedWithoutPickup);
    const worldSnapshot = needsContractWorldRepair ? structuredClone(world) : world;
    const playerSnapshot = structuredClone(player);
    const sessionSnapshot = structuredClone(session);
    // Runtime custody is an immutable persistent graph. Keep structural
    // sharing while reconciling the snapshot, then flatten its regional AVL
    // exactly once at the persistence boundary below.
    let physicalCargoSnapshot = physicalCargo;
    let promiseJourneySnapshot = promiseJourney;
    const repairedContractIds = repairInterruptedPickups(
      worldSnapshot,
      playerSnapshot,
      sessionSnapshot,
    );
    for (const contractId of repairedContractIds) {
      physicalCargoSnapshot = removePhysicalPromiseContract(physicalCargoSnapshot, contractId);
      if (promiseJourneySnapshot.contractId === contractId) {
        promiseJourneySnapshot = clearRegionalPromiseJourney();
      }
    }
    if (pendingAcceptance !== null && playerSnapshot.activeContractId === pendingAcceptance.contractId) {
      rollbackOptimisticPickup(playerSnapshot, sessionSnapshot, pendingAcceptance.contractId);
      physicalCargoSnapshot = removePhysicalPromiseContract(
        physicalCargoSnapshot,
        pendingAcceptance.contractId,
      );
      promiseJourneySnapshot = clearRegionalPromiseJourney();
    }
    const snapshotPhysicalValidation = validatePhysicalCargoState(
      physicalCargoSnapshot,
      playerSnapshot,
      WORLD_WIDTH,
      WORLD_HEIGHT,
    );
    if (!snapshotPhysicalValidation.valid || !snapshotPhysicalValidation.state) {
      throw new Error(`Refusing to save inconsistent physical cargo: ${snapshotPhysicalValidation.reason}`);
    }
    validatePhysicalPromiseCustody(worldSnapshot, playerSnapshot, snapshotPhysicalValidation.state);
    const bio0EcologySnapshot = canonicalRuntimeBio0Ecology(bio0Ecology, worldSnapshot);
    if (bio0EcologySnapshot === null) {
      throw new Error("Refusing to save inconsistent BIO0 ecology state");
    }
    const regionalEcologySnapshot = canonicalRuntimeRegionalEcologyState(
      regionalEcology,
      worldSnapshot,
      bio0EcologySnapshot,
    );
    if (
      regionalEcologySnapshot === null
      || stableStringify(regionalEcologySnapshot.settlementHome.patch)
        !== stableStringify(coreEcology)
    ) {
      throw new Error("Refusing to save inconsistent regional ecology state");
    }
    const coreEcologySnapshot = regionalEcologySnapshot.settlementHome.patch;
    const dogActorRosterSnapshot = canonicalRuntimeDogActorRoster(
      dogActorRoster,
      worldSnapshot,
      bio0EcologySnapshot,
      coreEcologySnapshot,
    );
    if (dogActorRosterSnapshot === null) {
      throw new Error("Refusing to save inconsistent dog actor roster");
    }
    const settlementEcologySnapshot = canonicalRuntimeSettlementEcology(
      settlementEcology,
      worldSnapshot,
      bio0EcologySnapshot,
      coreEcologySnapshot,
      dogActorRosterSnapshot,
    );
    if (settlementEcologySnapshot === null) {
      throw new Error("Refusing to save inconsistent settlement ecology state");
    }
    const settlementWorkingAnimalsSnapshot = canonicalRuntimeSettlementWorkingAnimals(
      settlementWorkingAnimals,
      worldSnapshot,
      settlementEcologySnapshot,
      dogActorRosterSnapshot,
    );
    if (settlementWorkingAnimalsSnapshot === null) {
      throw new Error("Refusing to save inconsistent settlement working-animal state");
    }
    const settlementDomesticAnimalRecoverySnapshot =
      canonicalRuntimeSettlementDomesticAnimalRecovery(
        settlementDomesticAnimalRecovery,
        worldSnapshot,
        settlementEcologySnapshot,
        coreEcologySnapshot,
      );
    if (settlementDomesticAnimalRecoverySnapshot === null) {
      throw new Error("Refusing to save inconsistent domestic-animal recovery state");
    }
    const porterResponseSnapshot = canonicalRuntimePorterResponse(
      porterResponse,
      bio0EcologySnapshot,
      worldSnapshot,
    );
    if (porterResponseSnapshot === null) {
      throw new Error("Refusing to save inconsistent BIO0 porter response state");
    }
    const livingActorPlayerChoiceSnapshot = canonicalRuntimeLivingActorPlayerChoice(
      livingActorPlayerChoice,
      worldSnapshot,
    );
    if (livingActorPlayerChoiceSnapshot === null) {
      throw new Error("Refusing to save inconsistent living-actor player choice state");
    }
    const envelopeBase: Omit<GameSaveEnvelope, "integrity"> = {
      format: "tideweft-session",
      version: GAME_SAVE_VERSION,
      world: serializeWorld(worldSnapshot),
      player: playerSnapshot,
      session: sessionSnapshot,
      fieldResources: structuredClone(fieldResourceEcology),
      traversalFeedback: structuredClone(traversalFeedback),
      physicalCargo: snapshotPhysicalCargoState(snapshotPhysicalValidation.state),
      regionalTravel: serializePlayerRegionalTravel(regionalTravelSnapshot),
      promiseJourney: promiseJourneySnapshot,
      perceptionCarry: canonicalPlayerPerceptionCarry({
        version: PLAYER_PERCEPTION_CARRY_VERSION,
        playerStepsSinceWorldTick,
        playerSenseSamples,
        nextPlayerSenseSampleOrdinal,
      }, worldSnapshot.meta.completedTick) ?? invalidPlayerPerceptionCarry(),
      bio0Ecology: serializeBio0Ecology(bio0EcologySnapshot),
      regionalEcology: serializeRegionalEcologyState(regionalEcologySnapshot),
      settlementEcology: serializeSettlementEcologyState(settlementEcologySnapshot),
      dogActorRoster: serializeDogActorRoster(dogActorRosterSnapshot),
      settlementWorkingAnimals: serializeSettlementWorkingAnimalState(
        settlementWorkingAnimalsSnapshot,
      ),
      settlementDomesticAnimalRecovery: serializeSettlementDomesticAnimalRecoveryState(
        settlementDomesticAnimalRecoverySnapshot,
      ),
      porterResponse: porterResponseSnapshot,
      livingActorPlayerChoice: livingActorPlayerChoiceSnapshot,
    };
    const envelope: GameSaveEnvelope = {
      ...envelopeBase,
      integrity: gameSaveEnvelopeIntegrity(envelopeBase),
    };
    const worldJson = JSON.stringify(envelope);
    if (worldJson.length > SAVE_WORLD_JSON_MAX_CHARACTERS) {
      throw new Error("The perpetual world has reached this browser save's safe size limit; nothing was overwritten.");
    }
    const record: SaveRecord = {
      slotId: AUTOSAVE_SLOT,
      label: renderView.worldName ?? "TIDEWEFT estuary",
      seed: world.meta.seedText,
      ...(saveGenerationEra === 0 ? {} : { saveGenerationEra }),
      saveGeneration,
      payloadVersion: GAME_SAVE_VERSION,
      updatedAt: nextSaveTimestamp(),
      playTicks: world.meta.completedTick,
      settlementCount: world.settlements.length,
      connectedCount: world.routes.filter((route) => route.traceStrength >= 120_000).length,
      worldJson,
    };
    saveSequence += 1;
    const sequence = saveSequence;
    // While storage is busy, retain the most recent complete snapshot rather
    // than returning the older in-flight write. Every superseded caller waits
    // for the newer snapshot that covers it.
    pendingSave = { sequence, record };
    const completion = new Promise<void>((resolve, reject) => {
      saveWaiters.push({ sequence, resolve, reject });
    });
    startSaveWorker();
    return completion;
  }

  function nextSaveTimestamp(): number {
    if (lastIssuedSaveTimestamp >= Number.MAX_SAFE_INTEGER) {
      // A higher play tick can still supersede this pathological same-world
      // record; deliberate replacement resets the clock inside a new generation.
      return Number.MAX_SAFE_INTEGER;
    }
    const now = Date.now();
    const safeNow = Number.isSafeInteger(now) && now >= 0 ? now : 0;
    lastIssuedSaveTimestamp = Math.max(safeNow, lastIssuedSaveTimestamp + 1);
    return lastIssuedSaveTimestamp;
  }

  function startSaveWorker(): void {
    if (saveWorkerRunning) return;
    saveWorkerRunning = true;
    void drainSaveQueue().finally(() => {
      saveWorkerRunning = false;
      // A request can arrive after the loop observes an empty queue but before
      // this microtask clears the running flag (notably visibility → pagehide).
      if (pendingSave) startSaveWorker();
    });
  }

  async function drainSaveQueue(): Promise<void> {
    while (pendingSave) {
      const candidate = pendingSave;
      pendingSave = undefined;
      try {
        await repository.save(candidate.record);
        settleSaveWaiters(candidate.sequence, false);
        noteSaveSuccess(candidate.record, candidate.sequence);
      } catch (error) {
        if (error instanceof StaleSaveWriteError || error instanceof ConflictingSaveCopiesError) {
          noteStaleSave();
          pendingSave = undefined;
          settleSaveWaiters(saveSequence, true, error);
          break;
        }
        noteSaveFailure();
        settleSaveWaiters(candidate.sequence, true, error);
      }
    }
  }

  function settleSaveWaiters(sequence: number, failed: boolean, error?: unknown): void {
    for (let index = saveWaiters.length - 1; index >= 0; index -= 1) {
      const waiter = saveWaiters[index];
      if (!waiter || waiter.sequence > sequence) continue;
      saveWaiters.splice(index, 1);
      if (failed) waiter.reject(error);
      else waiter.resolve();
    }
  }

  function runTickFailClosed(): boolean {
    const worldWillAdvance = playerStepsSinceWorldTick + 1 >= PLAYER_STEPS_PER_WORLD_TICK;
    const priorWorld = worldWillAdvance ? structuredClone(world) : null;
    const prior = {
      player: structuredClone(player),
      // Every admitted cargo sidecar is recursively frozen and every mutation
      // replaces its root. Retaining the exact reference is therefore a full
      // transaction checkpoint without cloning lifetime regional history.
      physicalCargo,
      bio0Ecology,
      coreEcology,
      regionalEcology,
      settlementEcology,
      dogActorRoster,
      settlementWorkingAnimals,
      settlementDomesticAnimalRecovery,
      porterResponse,
      livingActorPlayerChoice,
      regionalTravel,
      promiseJourney,
      session: structuredClone(session),
      fieldResourceEcology: structuredClone(fieldResourceEcology),
      traversalFeedback: structuredClone(traversalFeedback),
      commandQueue: structuredClone(commandQueue),
      playerStepsSinceWorldTick,
      playerSenseSamples: [...playerSenseSamples],
      nextPlayerSenseSampleOrdinal,
      commandSequence,
      pendingGatherNodeId,
      pendingParcelTargetId,
      pendingParcelRecoverOnArrival,
      pendingAcceptance: structuredClone(pendingAcceptance),
      pendingDelivery: structuredClone(pendingDelivery),
      pendingReinforcement: structuredClone(pendingReinforcement),
      pendingRenegotiation: structuredClone(pendingRenegotiation),
      pendingReportDelivery: structuredClone(pendingReportDelivery),
      pendingChoir: structuredClone(pendingChoir),
      selectedResidentId,
      selectedDogActorId,
      selectedWildlifeTarget,
      selectedWildlifeEvidenceTarget,
      eventObservationCursor,
      pendingResidentObservation: structuredClone(pendingResidentObservation),
      pendingResidentGreeting: structuredClone(pendingResidentGreeting),
      residentSpeech: new Map(residentSpeech),
      autopilotPath: [...autopilotPath],
      lastAutosaveTick,
      lastCargoDamageNoticeMs,
    };
    try {
      tick();
      return true;
    } catch (error) {
      if (priorWorld) {
        world = priorWorld;
        fieldResourceCatalog = runtimeFieldResourceCatalog(world);
      }
      player = prior.player;
      physicalCargo = prior.physicalCargo;
      bio0Ecology = prior.bio0Ecology;
      coreEcology = prior.coreEcology;
      regionalEcology = prior.regionalEcology;
      settlementEcology = prior.settlementEcology;
      dogActorRoster = prior.dogActorRoster;
      settlementWorkingAnimals = prior.settlementWorkingAnimals;
      settlementDomesticAnimalRecovery = prior.settlementDomesticAnimalRecovery;
      porterResponse = prior.porterResponse;
      livingActorPlayerChoice = prior.livingActorPlayerChoice;
      regionalTravel = prior.regionalTravel;
      promiseJourney = prior.promiseJourney;
      session = prior.session;
      fieldResourceEcology = prior.fieldResourceEcology;
      traversalFeedback = prior.traversalFeedback;
      commandQueue = prior.commandQueue;
      playerStepsSinceWorldTick = prior.playerStepsSinceWorldTick;
      playerSenseSamples = prior.playerSenseSamples;
      nextPlayerSenseSampleOrdinal = prior.nextPlayerSenseSampleOrdinal;
      commandSequence = prior.commandSequence;
      pendingGatherNodeId = prior.pendingGatherNodeId;
      pendingParcelTargetId = prior.pendingParcelTargetId;
      pendingParcelRecoverOnArrival = prior.pendingParcelRecoverOnArrival;
      pendingAcceptance = prior.pendingAcceptance;
      pendingDelivery = prior.pendingDelivery;
      pendingReinforcement = prior.pendingReinforcement;
      pendingRenegotiation = prior.pendingRenegotiation;
      pendingReportDelivery = prior.pendingReportDelivery;
      pendingChoir = prior.pendingChoir;
      selectedResidentId = prior.selectedResidentId;
      selectedDogActorId = prior.selectedDogActorId;
      selectedWildlifeTarget = prior.selectedWildlifeTarget;
      selectedWildlifeEvidenceTarget = prior.selectedWildlifeEvidenceTarget;
      eventObservationCursor = prior.eventObservationCursor;
      pendingResidentObservation = prior.pendingResidentObservation;
      pendingResidentGreeting = prior.pendingResidentGreeting;
      residentSpeech.clear();
      for (const [residentId, speech] of prior.residentSpeech) {
        residentSpeech.set(residentId, speech);
      }
      autopilotPath = prior.autopilotPath;
      lastAutosaveTick = prior.lastAutosaveTick;
      lastCargoDamageNoticeMs = prior.lastCargoDamageNoticeMs;
      manualControl = { moveX: 0, moveY: 0, brace: false };
      adriftTapControl = null;
      adriftTapTicksRemaining = 0;
      lastAdriftControl = { moveX: 0, moveY: 0, brace: false };
      rebuildRegionalWorldView();
      runtimeIntegrityFailure = `INTEGRITY HALT — ${errorMessage(error)}.`;
      session.paused = true;
      announce(session, `${runtimeIntegrityFailure} The last complete in-memory step was restored.`, true);
      soundscape.play("warning", 1);
      running = false;
      refreshViews();
      return false;
    }
  }

  function frame(now: number): void {
    if (!running) return;
    if (previousFrame === 0) previousFrame = now;
    accumulator += Math.min(500, Math.max(0, now - previousFrame));
    previousFrame = now;
    let steps = 0;
    while (accumulator >= FIXED_STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      if (!runTickFailClosed()) break;
      accumulator -= FIXED_STEP_MS;
      steps += 1;
    }
    if (!running) return;
    if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;
    animationFrame = requestAnimationFrame(frame);
  }

  function start(): void {
    if (running || runtimeIntegrityFailure !== null) return;
    running = true;
    previousFrame = 0;
    animationFrame = requestAnimationFrame(frame);
  }

  function stop(): void {
    running = false;
    cancelAnimationFrame(animationFrame);
  }

  function destroy(): void {
    destroyed = true;
    if (saveRetryTimer !== undefined) {
      clearTimeout(saveRetryTimer);
      saveRetryTimer = undefined;
    }
    stop();
    soundscape.destroy();
  }

  refreshViews();

  return {
    start,
    stop,
    destroy,
    getRenderView: () => renderView,
    getUIView: () => uiView,
    dispatchRenderer,
    dispatchUI,
    playTitleCrescendo,
    save,
    setFocusHandler: (handler) => {
      focusHandler = handler;
    },
  };
}

interface AutosaveVersion {
  readonly saveGenerationEra: number;
  readonly saveGeneration: number;
  readonly updatedAt: number;
  readonly playTicks: number;
}

type LoadedAutosave = {
  readonly kind: "loaded";
  readonly world: WorldState;
  readonly player: PlayerState;
  readonly session: GameSessionState;
  readonly fieldResources: FieldResourceEcologyState;
  readonly traversalFeedback: TraversalFeedbackState;
  readonly physicalCargo: PhysicalCargoState;
  readonly bio0Ecology: Bio0EcologyState;
  readonly coreEcology: CoreEcologyAggregatePatchState;
  readonly regionalEcology: RegionalEcologyStateV1;
  readonly dogActorRoster: DogActorRosterState;
  readonly settlementEcology: SettlementEcologyState;
  readonly settlementWorkingAnimals: SettlementWorkingAnimalState;
  readonly settlementDomesticAnimalRecovery: SettlementDomesticAnimalRecoveryState;
  readonly porterResponse: PorterResponseState;
  readonly livingActorPlayerChoice: LivingActorPlayerChoiceState;
  readonly regionalTravel: RegionalPlayerTravelState;
  readonly promiseJourney: RegionalPromiseJourneyState;
  readonly perceptionCarry: PlayerPerceptionCarry;
  readonly saveGenerationEra: number;
  readonly saveGeneration: number;
  readonly updatedAt: number;
} | {
  readonly kind: "corrupt";
  readonly version: AutosaveVersion;
} | {
  readonly kind: "unavailable";
  readonly version: AutosaveVersion;
} | {
  readonly kind: "conflict";
  readonly version: AutosaveVersion;
} | {
  readonly kind: "read-failed";
};

function emptyPlayerPerceptionCarry(): PlayerPerceptionCarry {
  return Object.freeze({
    version: PLAYER_PERCEPTION_CARRY_VERSION,
    playerStepsSinceWorldTick: 0,
    playerSenseSamples: Object.freeze([]),
    nextPlayerSenseSampleOrdinal: 0,
  });
}

/**
 * Admit the whole pending sensory interval or none of it. Its contiguous
 * ordinals and tick-bound IDs make an interrupted interval deterministic and
 * prevent a resealed payload from splicing observations across world ticks.
 */
function canonicalPlayerPerceptionCarry(
  value: unknown,
  completedWorldTick: number,
): PlayerPerceptionCarry | null {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || !hasExactObjectKeys(value, [
      "nextPlayerSenseSampleOrdinal",
      "playerSenseSamples",
      "playerStepsSinceWorldTick",
      "version",
    ])
  ) return null;
  const record = value as Readonly<Record<string, unknown>>;
  const phase = record.playerStepsSinceWorldTick;
  const nextOrdinal = record.nextPlayerSenseSampleOrdinal;
  const rawSamples = record.playerSenseSamples;
  if (
    record.version !== PLAYER_PERCEPTION_CARRY_VERSION
    || !Number.isSafeInteger(completedWorldTick)
    || completedWorldTick < 0
    || !Number.isSafeInteger(phase)
    || (phase as number) < 0
    || (phase as number) >= PLAYER_STEPS_PER_WORLD_TICK
    || !Number.isSafeInteger(nextOrdinal)
    || nextOrdinal !== phase
    || !Array.isArray(rawSamples)
    || rawSamples.length !== phase
    || rawSamples.length > HUMAN_PERCEPTION_MAX_PLAYER_SAMPLES
  ) return null;

  const samples: PlayerSenseSample[] = [];
  for (let ordinal = 0; ordinal < rawSamples.length; ordinal += 1) {
    const raw = rawSamples[ordinal];
    if (
      raw === null
      || typeof raw !== "object"
      || Array.isArray(raw)
      || !hasExactObjectKeys(raw, [
        "id",
        "lightVisibility",
        "movementSalience",
        "position",
        "sampleOrdinal",
        "soundClass",
        "soundInterrupt",
        "soundLoudness",
        "soundRangeUnits",
        "version",
      ])
    ) return null;
    const candidate = raw as unknown as PlayerSenseSample;
    if (
      candidate.version !== PLAYER_SENSE_SAMPLE_VERSION
      || candidate.sampleOrdinal !== ordinal
      || candidate.id !== `p-${completedWorldTick}-${ordinal}`
    ) return null;
    const sample = createPlayerSenseSample({
      id: candidate.id,
      sampleOrdinal: candidate.sampleOrdinal,
      position: candidate.position,
      movementSalience: candidate.movementSalience,
      lightVisibility: candidate.lightVisibility,
      soundLoudness: candidate.soundLoudness,
      soundRangeUnits: candidate.soundRangeUnits,
      soundClass: candidate.soundClass,
      soundInterrupt: candidate.soundInterrupt,
    });
    if (sample === null || stableStringify(sample) !== stableStringify(candidate)) return null;
    samples.push(sample);
  }
  return Object.freeze({
    version: PLAYER_PERCEPTION_CARRY_VERSION,
    playerStepsSinceWorldTick: phase as number,
    playerSenseSamples: Object.freeze(samples),
    nextPlayerSenseSampleOrdinal: nextOrdinal as number,
  });
}

function invalidPlayerPerceptionCarry(): never {
  throw new Error("Refusing to save an inconsistent pending perception interval");
}

function playerPerceptionCarryMatchesPosition(
  carry: PlayerPerceptionCarry,
  regionalTravel: RegionalPlayerTravelState,
  player: PlayerState,
): boolean {
  const latest = carry.playerSenseSamples[carry.playerSenseSamples.length - 1];
  if (latest === undefined) return carry.playerStepsSinceWorldTick === 0;
  const position = playerWorldPositionInRegionalWindow(regionalTravel.window, player);
  return position !== null
    && position.region.x === latest.position.region.x
    && position.region.y === latest.position.region.y
    && position.localX === latest.position.localX
    && position.localY === latest.position.localY;
}

function nextSaveGeneration(version: AutosaveVersion): {
  readonly saveGenerationEra: number;
  readonly saveGeneration: number;
} | undefined {
  if (version.saveGeneration < Number.MAX_SAFE_INTEGER) {
    return {
      saveGenerationEra: version.saveGenerationEra,
      saveGeneration: version.saveGeneration + 1,
    };
  }
  if (version.saveGenerationEra < Number.MAX_SAFE_INTEGER) {
    return {
      saveGenerationEra: version.saveGenerationEra + 1,
      saveGeneration: 0,
    };
  }
  return undefined;
}

async function loadAutosave(repository: SaveRepository): Promise<LoadedAutosave | undefined> {
  let record: SaveRecord | undefined;
  try {
    record = await repository.load(AUTOSAVE_SLOT);
  } catch (error) {
    if (error instanceof NewerSaveUnavailableError) {
      const latest = error.latestVersion;
      const version: AutosaveVersion = {
        saveGenerationEra: latest.saveGenerationEra ?? 0,
        saveGeneration: latest.saveGeneration ?? 0,
        updatedAt: latest.updatedAt,
        playTicks: latest.playTicks,
      };
      return { kind: "unavailable", version };
    }
    if (error instanceof ConflictingSaveCopiesError) {
      const latest = error.latestVersion;
      const version: AutosaveVersion = {
        saveGenerationEra: latest.saveGenerationEra ?? 0,
        saveGeneration: latest.saveGeneration ?? 0,
        updatedAt: latest.updatedAt,
        playTicks: latest.playTicks,
      };
      return { kind: "conflict", version };
    }
    return { kind: "read-failed" };
  }
  if (!record) return undefined;
  const version: AutosaveVersion = {
    saveGenerationEra: record.saveGenerationEra ?? 0,
    saveGeneration: record.saveGeneration ?? 0,
    updatedAt: record.updatedAt,
    playTicks: record.playTicks,
  };
  if (
    !Number.isSafeInteger(version.saveGenerationEra) || version.saveGenerationEra < 0
    || !Number.isSafeInteger(version.saveGeneration) || version.saveGeneration < 0
    || !Number.isSafeInteger(version.updatedAt) || version.updatedAt < 0
    || !Number.isSafeInteger(version.playTicks) || version.playTicks < 0
  ) {
    return undefined;
  }
  try {
    if (record.worldJson.length > SAVE_WORLD_JSON_MAX_CHARACTERS) {
      throw new Error("Save envelope exceeds the safe local size limit");
    }
    const decoded = JSON.parse(record.worldJson) as Partial<GameSaveEnvelope>;
    if (
      decoded.format !== "tideweft-session" ||
      (
        decoded.version !== LEGACY_GAME_SAVE_VERSION
        && decoded.version !== FIELD_RESOURCE_GAME_SAVE_VERSION
        && decoded.version !== PHYSICAL_CARGO_GAME_SAVE_VERSION
        && decoded.version !== REGIONAL_GAME_SAVE_VERSION
        && decoded.version !== PLAYER_PERCEPTION_GAME_SAVE_VERSION
        && decoded.version !== BIO0_GAME_SAVE_VERSION
        && decoded.version !== LIVING_ACTOR_CHOICE_GAME_SAVE_VERSION
        && decoded.version !== CORE_ECOLOGY_GAME_SAVE_VERSION
        && decoded.version !== WAVE_A_GAME_SAVE_VERSION
        && decoded.version !== HARBOR_EDGE_GAME_SAVE_VERSION
        && decoded.version !== MARSH_EDGE_GAME_SAVE_VERSION
        && decoded.version !== RAIN_CHORUS_GAME_SAVE_VERSION
        && decoded.version !== TIDAL_TABLE_GAME_SAVE_VERSION
        && decoded.version !== WATERFOWL_GAME_SAVE_VERSION
        && decoded.version !== TIDAL_CONVERGENCE_GAME_SAVE_VERSION
        && decoded.version !== STOREHOUSE_GAME_SAVE_VERSION
        && decoded.version !== DOMESTIC_YARD_GAME_SAVE_VERSION
        && decoded.version !== DOMESTIC_PEN_GAME_SAVE_VERSION
        && decoded.version !== PADDOCK_WATCH_GAME_SAVE_VERSION
        && decoded.version !== WATCH_RETURNS_GAME_SAVE_VERSION
        && decoded.version !== DOMESTIC_GOAT_GAME_SAVE_VERSION
        && decoded.version !== MORTALITY_BODY_GAME_SAVE_VERSION
        && decoded.version !== REGIONAL_UPLAND_GAME_SAVE_VERSION
        && decoded.version !== REGIONAL_PREDATOR_GAME_SAVE_VERSION
        && decoded.version !== GAME_SAVE_VERSION
      ) ||
      typeof decoded.world !== "string" ||
      !decoded.player ||
      !decoded.session
    ) {
      throw new Error("Save contains an invalid session envelope");
    }
    if (
      (decoded.version >= REGIONAL_GAME_SAVE_VERSION && record.payloadVersion !== decoded.version)
      || (record.payloadVersion !== undefined && record.payloadVersion !== decoded.version)
    ) {
      throw new Error("Save record format fence does not match its embedded envelope");
    }
    if (decoded.version >= PHYSICAL_CARGO_GAME_SAVE_VERSION) {
      if (
        typeof decoded.integrity !== "string"
        || gameSaveEnvelopeIntegrity(decoded as Readonly<Record<string, unknown>>) !== decoded.integrity
      ) throw new Error("Save envelope integrity does not match its contents");
      if (decoded.version === GAME_SAVE_VERSION) {
        if (
          !hasExactObjectKeys(decoded, [
            "bio0Ecology",
            "dogActorRoster",
            "fieldResources",
            "format",
            "integrity",
            "livingActorPlayerChoice",
            "perceptionCarry",
            "physicalCargo",
            "player",
            "porterResponse",
            "promiseJourney",
            "regionalEcology",
            "regionalTravel",
            "session",
            "settlementEcology",
            "settlementDomesticAnimalRecovery",
            "settlementWorkingAnimals",
            "traversalFeedback",
            "version",
            "world",
          ])
          || typeof decoded.regionalTravel !== "string"
          || typeof decoded.bio0Ecology !== "string"
          || typeof decoded.regionalEcology !== "string"
          || typeof decoded.settlementEcology !== "string"
          || typeof decoded.dogActorRoster !== "string"
          || typeof decoded.settlementWorkingAnimals !== "string"
          || typeof decoded.settlementDomesticAnimalRecovery !== "string"
        ) throw new Error("Version 25 save envelope is not canonical");
      } else if (
        decoded.version === REGIONAL_PREDATOR_GAME_SAVE_VERSION
        || decoded.version === REGIONAL_UPLAND_GAME_SAVE_VERSION
        || decoded.version === MORTALITY_BODY_GAME_SAVE_VERSION
        || decoded.version === DOMESTIC_GOAT_GAME_SAVE_VERSION
      ) {
        if (
          !hasExactObjectKeys(decoded, [
            "bio0Ecology",
            "coreEcology",
            "dogActorRoster",
            "fieldResources",
            "format",
            "integrity",
            "livingActorPlayerChoice",
            "perceptionCarry",
            "physicalCargo",
            "player",
            "porterResponse",
            "promiseJourney",
            "regionalTravel",
            "session",
            "settlementEcology",
            "settlementDomesticAnimalRecovery",
            "settlementWorkingAnimals",
            "traversalFeedback",
            "version",
            "world",
          ])
          || typeof decoded.regionalTravel !== "string"
          || typeof decoded.bio0Ecology !== "string"
          || typeof decoded.coreEcology !== "string"
          || typeof decoded.settlementEcology !== "string"
          || typeof decoded.dogActorRoster !== "string"
          || typeof decoded.settlementWorkingAnimals !== "string"
          || typeof decoded.settlementDomesticAnimalRecovery !== "string"
        ) throw new Error(`Version ${decoded.version} save envelope is not canonical`);
      } else if (
        decoded.version === WATCH_RETURNS_GAME_SAVE_VERSION
        || decoded.version === PADDOCK_WATCH_GAME_SAVE_VERSION
      ) {
        if (
          !hasExactObjectKeys(decoded, [
            "bio0Ecology",
            "coreEcology",
            "dogActorRoster",
            "fieldResources",
            "format",
            "integrity",
            "livingActorPlayerChoice",
            "perceptionCarry",
            "physicalCargo",
            "player",
            "porterResponse",
            "promiseJourney",
            "regionalTravel",
            "session",
            "settlementEcology",
            "settlementWorkingAnimals",
            "traversalFeedback",
            "version",
            "world",
          ])
          || typeof decoded.regionalTravel !== "string"
          || typeof decoded.bio0Ecology !== "string"
          || typeof decoded.coreEcology !== "string"
          || typeof decoded.settlementEcology !== "string"
          || typeof decoded.dogActorRoster !== "string"
          || typeof decoded.settlementWorkingAnimals !== "string"
        ) throw new Error(`Version ${decoded.version} save envelope is not canonical`);
      } else if (
        decoded.version === DOMESTIC_PEN_GAME_SAVE_VERSION
        || decoded.version === DOMESTIC_YARD_GAME_SAVE_VERSION
        || decoded.version === STOREHOUSE_GAME_SAVE_VERSION
      ) {
        if (
          !hasExactObjectKeys(decoded, [
            "bio0Ecology",
            "coreEcology",
            "fieldResources",
            "format",
            "integrity",
            "livingActorPlayerChoice",
            "perceptionCarry",
            "physicalCargo",
            "player",
            "porterResponse",
            "promiseJourney",
            "regionalTravel",
            "session",
            "settlementEcology",
            "traversalFeedback",
            "version",
            "world",
          ])
          || typeof decoded.regionalTravel !== "string"
          || typeof decoded.bio0Ecology !== "string"
          || typeof decoded.coreEcology !== "string"
          || typeof decoded.settlementEcology !== "string"
        ) throw new Error(`Version ${decoded.version} save envelope is not canonical`);
      } else if (
        decoded.version === TIDAL_CONVERGENCE_GAME_SAVE_VERSION
        || decoded.version === WATERFOWL_GAME_SAVE_VERSION
        || decoded.version === TIDAL_TABLE_GAME_SAVE_VERSION
        || decoded.version === RAIN_CHORUS_GAME_SAVE_VERSION
        || decoded.version === MARSH_EDGE_GAME_SAVE_VERSION
        || decoded.version === HARBOR_EDGE_GAME_SAVE_VERSION
        || decoded.version === WAVE_A_GAME_SAVE_VERSION
      ) {
        if (
          !hasExactObjectKeys(decoded, [
            "bio0Ecology",
            "coreEcology",
            "fieldResources",
            "format",
            "integrity",
            "livingActorPlayerChoice",
            "perceptionCarry",
            "physicalCargo",
            "player",
            "porterResponse",
            "promiseJourney",
            "regionalTravel",
            "session",
            "traversalFeedback",
            "version",
            "world",
          ])
          || typeof decoded.regionalTravel !== "string"
          || typeof decoded.bio0Ecology !== "string"
          || typeof decoded.coreEcology !== "string"
        ) throw new Error(`Version ${decoded.version} save envelope is not canonical`);
      } else if (decoded.version === CORE_ECOLOGY_GAME_SAVE_VERSION) {
        if (
          !hasExactObjectKeys(decoded, [
            "bio0Ecology",
            "coreEcology",
            "fieldResources",
            "format",
            "integrity",
            "livingActorPlayerChoice",
            "perceptionCarry",
            "physicalCargo",
            "player",
            "porterResponse",
            "promiseJourney",
            "regionalTravel",
            "session",
            "traversalFeedback",
            "version",
            "world",
          ])
          || typeof decoded.regionalTravel !== "string"
          || typeof decoded.bio0Ecology !== "string"
          || typeof decoded.coreEcology !== "string"
        ) throw new Error("Version 8 save envelope is not canonical");
      } else if (decoded.version === LIVING_ACTOR_CHOICE_GAME_SAVE_VERSION) {
        if (
          !hasExactObjectKeys(decoded, [
            "bio0Ecology",
            "fieldResources",
            "format",
            "integrity",
            "livingActorPlayerChoice",
            "perceptionCarry",
            "physicalCargo",
            "player",
            "porterResponse",
            "promiseJourney",
            "regionalTravel",
            "session",
            "traversalFeedback",
            "version",
            "world",
          ])
          || typeof decoded.regionalTravel !== "string"
          || typeof decoded.bio0Ecology !== "string"
        ) throw new Error("Version 7 save envelope is not canonical");
      } else if (decoded.version === BIO0_GAME_SAVE_VERSION) {
        if (
          !hasExactObjectKeys(decoded, [
            "bio0Ecology",
            "fieldResources",
            "format",
            "integrity",
            "perceptionCarry",
            "physicalCargo",
            "player",
            "promiseJourney",
            "regionalTravel",
            "session",
            "traversalFeedback",
            "version",
            "world",
          ])
          || typeof decoded.regionalTravel !== "string"
          || typeof decoded.bio0Ecology !== "string"
        ) throw new Error("Version 6 save envelope is not canonical");
      } else if (decoded.version === PLAYER_PERCEPTION_GAME_SAVE_VERSION) {
        if (
          !hasExactObjectKeys(decoded, [
            "fieldResources",
            "format",
            "integrity",
            "perceptionCarry",
            "physicalCargo",
            "player",
            "promiseJourney",
            "regionalTravel",
            "session",
            "traversalFeedback",
            "version",
            "world",
          ])
          || typeof decoded.regionalTravel !== "string"
        ) throw new Error("Version 5 save envelope is not canonical");
      } else if (decoded.version === REGIONAL_GAME_SAVE_VERSION) {
        if (
          !hasExactObjectKeys(decoded, [
            "fieldResources",
            "format",
            "integrity",
            "physicalCargo",
            "player",
            "promiseJourney",
            "regionalTravel",
            "session",
            "traversalFeedback",
            "version",
            "world",
          ])
          || typeof decoded.regionalTravel !== "string"
        ) throw new Error("Version 4 save envelope is not canonical");
      } else if (
        Object.hasOwn(decoded, "regionalTravel")
        || Object.hasOwn(decoded, "promiseJourney")
        || Object.hasOwn(decoded, "perceptionCarry")
        || Object.hasOwn(decoded, "bio0Ecology")
        || Object.hasOwn(decoded, "coreEcology")
        || Object.hasOwn(decoded, "regionalEcology")
        || Object.hasOwn(decoded, "settlementEcology")
        || Object.hasOwn(decoded, "dogActorRoster")
        || Object.hasOwn(decoded, "settlementWorkingAnimals")
        || Object.hasOwn(decoded, "settlementDomesticAnimalRecovery")
        || Object.hasOwn(decoded, "porterResponse")
        || Object.hasOwn(decoded, "livingActorPlayerChoice")
      ) {
        throw new Error("Version 3 save contains v4 regional fields");
      }
    } else if (
      Object.hasOwn(decoded, "physicalCargo")
      || Object.hasOwn(decoded, "integrity")
      || Object.hasOwn(decoded, "regionalTravel")
      || Object.hasOwn(decoded, "promiseJourney")
      || Object.hasOwn(decoded, "perceptionCarry")
      || Object.hasOwn(decoded, "bio0Ecology")
      || Object.hasOwn(decoded, "coreEcology")
      || Object.hasOwn(decoded, "regionalEcology")
      || Object.hasOwn(decoded, "settlementEcology")
      || Object.hasOwn(decoded, "dogActorRoster")
      || Object.hasOwn(decoded, "settlementWorkingAnimals")
      || Object.hasOwn(decoded, "settlementDomesticAnimalRecovery")
      || Object.hasOwn(decoded, "porterResponse")
      || Object.hasOwn(decoded, "livingActorPlayerChoice")
    ) {
      throw new Error("Legacy save version contains v3-only physical custody fields");
    }
    const world = deserializeWorld(decoded.world);
    // Ordering metadata is authoritative only when it describes the payload
    // being adopted. A lying MAX_SAFE tick must not pin every later save.
    if (record.playTicks !== world.meta.completedTick) {
      throw new Error("Save metadata does not match the decoded world tick");
    }
    const compatibilityView = createWorldView(world);
    const bio0Ecology = decoded.version >= BIO0_GAME_SAVE_VERSION
      ? canonicalRuntimeBio0Ecology(deserializeBio0Ecology(decoded.bio0Ecology), world, compatibilityView)
      : createRuntimeBio0Ecology(world, compatibilityView);
    if (bio0Ecology === null) {
      throw new Error("Current save contains invalid BIO0 ecology state");
    }
    const persistedRegionalEcology = decoded.version === GAME_SAVE_VERSION
      ? (() => {
          const text = decoded.regionalEcology;
          const structural = deserializeRegionalEcologyState(text);
          if (
            structural === null
            || serializeRegionalEcologyState(structural) !== text
          ) return null;
          return canonicalRuntimeRegionalEcologyState(
            structural,
            world,
            bio0Ecology,
            compatibilityView,
          );
        })()
      : null;
    if (decoded.version === GAME_SAVE_VERSION && persistedRegionalEcology === null) {
      throw new Error("Current save contains invalid regional ecology state");
    }

    /**
     * Every older supported save is first authenticated and normalized through
     * the frozen v24 whole-patch owner. The v25 adoption then splits that exact
     * authority into settlement-home, regional baseline, and one finite legacy
     * cohort without asking any later system to reinterpret old identities.
     */
    const v24CompatibilityCoreEcology = decoded.version === GAME_SAVE_VERSION
      ? null
      : decoded.version === REGIONAL_PREDATOR_GAME_SAVE_VERSION
        ? canonicalRuntimeCoreEcology(
            deserializeCoreEcologyAggregatePatch(decoded.coreEcology),
            world,
            bio0Ecology,
          )
      : decoded.version === REGIONAL_UPLAND_GAME_SAVE_VERSION
        ? migrateRuntimeCoreEcologyFromRegionalUpland(
            deserializeCoreEcologyAggregatePatch(decoded.coreEcology),
            world,
            bio0Ecology,
          )
      : decoded.version === MORTALITY_BODY_GAME_SAVE_VERSION
        ? migrateRuntimeCoreEcologyFromDomesticPen(
            deserializeCoreEcologyAggregatePatch(decoded.coreEcology),
            world,
            bio0Ecology,
          )
      : (
          decoded.version === DOMESTIC_GOAT_GAME_SAVE_VERSION
          || decoded.version === WATCH_RETURNS_GAME_SAVE_VERSION
          || decoded.version === PADDOCK_WATCH_GAME_SAVE_VERSION
          || decoded.version === DOMESTIC_PEN_GAME_SAVE_VERSION
        )
        ? migrateRuntimeCoreEcologyFromDomesticPen(
            migrateLegacyCoreEcologyAggregatePatch(decoded.coreEcology),
            world,
            bio0Ecology,
          )
      : decoded.version === DOMESTIC_YARD_GAME_SAVE_VERSION
        ? migrateRuntimeCoreEcologyFromDomesticYard(
            migrateLegacyCoreEcologyAggregatePatch(decoded.coreEcology),
            world,
            bio0Ecology,
          )
      : (
          decoded.version === STOREHOUSE_GAME_SAVE_VERSION
          || decoded.version === TIDAL_CONVERGENCE_GAME_SAVE_VERSION
        )
        ? migrateRuntimeCoreEcologyFromTidalWeb(
            migrateLegacyCoreEcologyAggregatePatch(decoded.coreEcology),
            world,
            bio0Ecology,
          )
      : decoded.version === WATERFOWL_GAME_SAVE_VERSION
        ? migrateRuntimeCoreEcologyFromWaterfowl(
            migrateLegacyCoreEcologyAggregatePatch(decoded.coreEcology),
            world,
            bio0Ecology,
          )
      : decoded.version === TIDAL_TABLE_GAME_SAVE_VERSION
        ? migrateRuntimeCoreEcologyFromTidalTable(
            migrateLegacyCoreEcologyAggregatePatch(decoded.coreEcology),
            world,
            bio0Ecology,
          )
      : decoded.version === RAIN_CHORUS_GAME_SAVE_VERSION
        ? migrateRuntimeCoreEcologyFromRainChorus(
            migrateLegacyCoreEcologyAggregatePatch(decoded.coreEcology),
            world,
            bio0Ecology,
          )
        : decoded.version === MARSH_EDGE_GAME_SAVE_VERSION
        ? migrateRuntimeCoreEcologyFromMarshEdge(
            migrateLegacyCoreEcologyAggregatePatch(decoded.coreEcology),
            world,
            bio0Ecology,
          )
        : decoded.version === HARBOR_EDGE_GAME_SAVE_VERSION
          ? migrateRuntimeCoreEcologyFromHarborEdge(
              migrateLegacyCoreEcologyAggregatePatch(decoded.coreEcology),
              world,
              bio0Ecology,
            )
          : decoded.version >= CORE_ECOLOGY_GAME_SAVE_VERSION
            ? migrateRuntimeCoreEcologyFromWaveA(
                migrateLegacyCoreEcologyPatch(decoded.coreEcology),
                world,
                bio0Ecology,
              )
            : createRuntimeCoreEcology(world, bio0Ecology);
    const coreEcology = persistedRegionalEcology?.settlementHome.patch
      ?? (v24CompatibilityCoreEcology === null
        ? null
        : adoptCoreEcologySettlementHomeFromV24({
            seed: world.meta.rootSeed,
            habitat: deriveRuntimeCoreEcologyHabitat(world, bio0Ecology, compatibilityView),
            completedTick: world.meta.completedTick,
            sourcePatch: v24CompatibilityCoreEcology,
          }));
    if (coreEcology === null) {
      throw new Error("Current save contains invalid core ecology state");
    }
    const dogActorRoster = decoded.version >= PADDOCK_WATCH_GAME_SAVE_VERSION
      ? canonicalRuntimeDogActorRoster(
          deserializeDogActorRoster(decoded.dogActorRoster),
          world,
          bio0Ecology,
          coreEcology,
        )
      : createRuntimeDogActorRoster(world, bio0Ecology, coreEcology);
    if (dogActorRoster === null) {
      throw new Error("Current save contains invalid dog actor roster");
    }
    const settlementEcology = decoded.version >= STOREHOUSE_GAME_SAVE_VERSION
      ? (() => {
          const migrated = deserializeSettlementEcologyState(decoded.settlementEcology);
          if (
            decoded.version >= PADDOCK_WATCH_GAME_SAVE_VERSION
            && serializeSettlementEcologyState(migrated) !== decoded.settlementEcology
          ) return null;
          const expected = createRuntimeSettlementEcology(
            world,
            bio0Ecology,
            coreEcology,
            dogActorRoster,
            compatibilityView,
          );
          const adopted = establishRuntimeDomesticCustodies(migrated, expected);
          if (adopted === null) return null;
          let accepted = canonicalRuntimeSettlementEcology(
            adopted,
            world,
            bio0Ecology,
            coreEcology,
            dogActorRoster,
            compatibilityView,
          );
          if (accepted === null) return null;
          if (accepted.pendingLoss !== null) {
            const recovered = recoverPendingSettlementFoodLoss(accepted, coreEcology);
            if (recovered === null) return null;
            accepted = recovered.state;
          }
          if (accepted.pendingDomesticFoodUse !== null) {
            const recovered = recoverPendingSettlementDomesticFoodUse(accepted);
            if (recovered === null) return null;
            accepted = recovered.state;
          }
          return canonicalRuntimeSettlementEcology(
            accepted,
            world,
            bio0Ecology,
            coreEcology,
            dogActorRoster,
            compatibilityView,
          );
        })()
      : createRuntimeSettlementEcology(
          world,
          bio0Ecology,
          coreEcology,
          dogActorRoster,
          compatibilityView,
        );
    if (settlementEcology === null) {
      throw new Error("Current save contains invalid settlement ecology state");
    }
    const settlementWorkingAnimals = decoded.version >= PADDOCK_WATCH_GAME_SAVE_VERSION
      ? (() => {
          const workingAnimalsText = decoded.settlementWorkingAnimals;
          if (typeof workingAnimalsText !== "string") return null;
          let parsedWorkingAnimals: unknown;
          try {
            parsedWorkingAnimals = JSON.parse(workingAnimalsText);
          } catch {
            return null;
          }
          if (stableStringify(parsedWorkingAnimals) !== workingAnimalsText) {
            return null;
          }
          if (
            decoded.version === PADDOCK_WATCH_GAME_SAVE_VERSION
            && (
              parsedWorkingAnimals === null
              || typeof parsedWorkingAnimals !== "object"
              || Array.isArray(parsedWorkingAnimals)
              || (parsedWorkingAnimals as Record<string, unknown>).version
                !== PRIOR_SETTLEMENT_WORKING_ANIMALS_VERSION
              || (parsedWorkingAnimals as Record<string, unknown>).ownerId
                !== PRIOR_SETTLEMENT_WORKING_ANIMALS_OWNER_ID
            )
          ) return null;
          const deserialized = decoded.version >= WATCH_RETURNS_GAME_SAVE_VERSION
            ? deserializeSettlementWorkingAnimalState(workingAnimalsText)
            : adoptSettlementWorkingAnimalStateV1(parsedWorkingAnimals);
          if (
            deserialized === null
            || (
              decoded.version >= WATCH_RETURNS_GAME_SAVE_VERSION
              && serializeSettlementWorkingAnimalState(deserialized)
                !== workingAnimalsText
            )
          ) return null;
          let accepted = canonicalRuntimeSettlementWorkingAnimals(
            deserialized,
            world,
            settlementEcology,
            dogActorRoster,
          );
          if (accepted === null) return null;
          // A pending task transition was staged against the saved current
          // activity. Resolve it first; a later pending activity may otherwise
          // invalidate that authenticated lifecycle transaction before replay.
          for (const assignment of accepted.assignments) {
            if (assignment.pendingTaskTransition === null) continue;
            const recovered = recoverPendingSettlementWorkingAnimalTaskLifecycle(
              accepted,
              assignment.assignmentId,
            );
            if (recovered === null) return null;
            accepted = recovered.state;
          }
          for (const assignment of accepted.assignments) {
            if (assignment.pendingActivity === null) continue;
            const recovered = recoverPendingSettlementWorkingAnimalActivity(
              accepted,
              assignment.assignmentId,
            );
            if (recovered === null) return null;
            accepted = recovered.state;
          }
          return canonicalRuntimeSettlementWorkingAnimals(
            accepted,
            world,
            settlementEcology,
            dogActorRoster,
          );
        })()
      : createRuntimeSettlementWorkingAnimals(
          world,
          settlementEcology,
          dogActorRoster,
        );
    if (settlementWorkingAnimals === null) {
      throw new Error("Current save contains invalid settlement working-animal state");
    }
    const settlementDomesticAnimalRecovery = decoded.version >= DOMESTIC_GOAT_GAME_SAVE_VERSION
      ? (() => {
          const recoveryText = decoded.settlementDomesticAnimalRecovery;
          if (typeof recoveryText !== "string") return null;
          const deserialized = deserializeSettlementDomesticAnimalRecoveryState(recoveryText);
          if (
            deserialized === null
            || serializeSettlementDomesticAnimalRecoveryState(deserialized) !== recoveryText
          ) return null;
          const recovered = recoverPendingSettlementDomesticAnimalRecovery(deserialized);
          if (recovered === null) return null;
          return canonicalRuntimeSettlementDomesticAnimalRecovery(
            recovered.state,
            world,
            settlementEcology,
            coreEcology,
          );
        })()
      : createSettlementDomesticAnimalRecoveryState(
          settlementEcology.identity.settlementId,
        );
    if (settlementDomesticAnimalRecovery === null) {
      throw new Error("Current save contains invalid domestic-animal recovery state");
    }
    const porterResponse = decoded.version >= LIVING_ACTOR_CHOICE_GAME_SAVE_VERSION
      ? canonicalRuntimePorterResponse(decoded.porterResponse, bio0Ecology, world)
      : createRuntimePorterResponse(bio0Ecology);
    if (porterResponse === null) {
      throw new Error("Current save contains invalid BIO0 porter response state");
    }
    const livingActorPlayerChoice = decoded.version >= LIVING_ACTOR_CHOICE_GAME_SAVE_VERSION
      ? canonicalRuntimeLivingActorPlayerChoice(decoded.livingActorPlayerChoice, world)
      : createRuntimeLivingActorPlayerChoice();
    if (livingActorPlayerChoice === null) {
      throw new Error("Current save contains invalid living-actor player choice state");
    }
    const perceptionCarry = decoded.version >= PLAYER_PERCEPTION_GAME_SAVE_VERSION
      ? canonicalPlayerPerceptionCarry(decoded.perceptionCarry, world.meta.completedTick)
      : emptyPlayerPerceptionCarry();
    if (perceptionCarry === null) {
      throw new Error("Current save contains an invalid pending perception interval");
    }
    const rawSession = structuredClone(decoded.session);
    const rawPlayer = structuredClone(decoded.player);
    const loadedSession = normalizeLoadedSession(
      decoded.session,
      world.meta.seedText,
      world.choirs.length,
    );
    if (
      decoded.version >= PHYSICAL_CARGO_GAME_SAVE_VERSION
      && (
        stableStringify(loadedSession) !== stableStringify(rawSession)
        || loadedSession.posture !== HARD_POSTURE
        || loadedSession.pressureMode !== HARD_PRESSURE_MODE
        || loadedSession.sessionShape !== PERPETUAL_SESSION_SHAPE
      )
    ) throw new Error("Current save contains noncanonical session state");
    if (decoded.version <= FIELD_RESOURCE_GAME_SAVE_VERSION) {
      prepareLegacyWayknotsForRegionalMigration(decoded.player);
    }
    normalizePlayerCrafting(decoded.player, decoded.version === LEGACY_GAME_SAVE_VERSION);
    const catalog = runtimeFieldResourceCatalog(world);
    const fieldResources = decoded.version >= FIELD_RESOURCE_GAME_SAVE_VERSION
      ? canonicalizeFieldResourceState(catalog, requireFieldResourceState(decoded.fieldResources))
      : createFieldResourceEcologyState(world.meta.completedTick);
    const traversalFeedback = canonicalizeTraversalFeedback(
      decoded.traversalFeedback,
      { allowMissingLegacy: decoded.version < PHYSICAL_CARGO_GAME_SAVE_VERSION },
    );
    if (decoded.version >= PHYSICAL_CARGO_GAME_SAVE_VERSION) {
      if (stableStringify(fieldResources) !== stableStringify(decoded.fieldResources)) {
        throw new Error("Current save contains noncanonical field-resource state");
      }
      if (stableStringify(traversalFeedback) !== stableStringify(decoded.traversalFeedback)) {
        throw new Error("Current save contains noncanonical traversal feedback");
      }
    }
    // Alpha player snapshots predate dynamic world dimensions. Pickup repair
    // can reset currentTrace, so dimensions must be authoritative before it
    // asks playerTileIndex to derive that trace origin.
    if (decoded.version >= PHYSICAL_CARGO_GAME_SAVE_VERSION) {
      const currentRegionalGeometry = decoded.player.worldWidth === REGIONAL_TRAVEL_COLUMNS
        && decoded.player.worldHeight === REGIONAL_TRAVEL_ROWS;
      const legacyRegionalGeometry = decoded.player.worldWidth === LEGACY_REGIONAL_TRAVEL_COLUMNS
        && decoded.player.worldHeight === LEGACY_REGIONAL_TRAVEL_ROWS;
      if (
        decoded.version >= REGIONAL_GAME_SAVE_VERSION
          ? !currentRegionalGeometry && !legacyRegionalGeometry
          : decoded.player.worldWidth !== world.terrain.width
            || decoded.player.worldHeight !== world.terrain.height
      ) throw new Error("Current save player dimensions do not match its world");
      if (stableStringify(decoded.player) !== stableStringify(rawPlayer)) {
        throw new Error("Current save contains noncanonical player crafting state");
      }
    } else {
      decoded.player.worldWidth = world.terrain.width;
      decoded.player.worldHeight = world.terrain.height;
    }
    const legacyBaseline = loadedSession.sessionBaseline;
    if (legacyBaseline && !Number.isFinite(legacyBaseline.awakenedChoirs)) {
      legacyBaseline.awakenedChoirs = world.choirs.length;
    }
    const sealedSave = decoded.version >= PHYSICAL_CARGO_GAME_SAVE_VERSION;
    const repairedContractIds = sealedSave
      ? repairInterruptedPickups(
          structuredClone(world),
          structuredClone(decoded.player),
          structuredClone(loadedSession),
        )
      : repairInterruptedPickups(world, decoded.player, loadedSession);
    if (sealedSave && repairedContractIds.length > 0) {
      throw new Error("Current save contains an interrupted optimistic Promise transaction");
    }
    if (repairedContractIds.length > 0) {
      loadedSession.sessionChanges = Array.isArray(loadedSession.sessionChanges)
        ? [...loadedSession.sessionChanges, "An interrupted cargo pickup was safely reset before any harbor stock moved."]
        : ["An interrupted cargo pickup was safely reset before any harbor stock moved."];
      loadedSession.trackedContractId = repairedContractIds[0] ?? null;
    }
    validatePlayer(
      decoded.player,
      world,
      decoded.version >= REGIONAL_GAME_SAVE_VERSION
        ? decoded.player.worldWidth * decoded.player.worldHeight
        : world.terrain.tiles.length,
    );
    let regionalTravel: RegionalPlayerTravelState;
    let promiseJourney: RegionalPromiseJourneyState;
    if (decoded.version >= REGIONAL_GAME_SAVE_VERSION) {
      const restored = restorePlayerRegionalTravel(
        world.meta.rootSeed,
        decoded.player,
        decoded.regionalTravel!,
      );
      if (!restored) throw new Error("Current save contains invalid regional travel state");
      const restoredView = createRegionalWorldView(
        compatibilityView,
        restored.window,
        { discovered: decoded.player.discovered, depthSoundings: decoded.player.depthSoundings },
      );
      const playerAddress = regionalAddressAt(restoredView, playerTileIndex(decoded.player));
      if (!playerAddress || regionKey(playerAddress.region) !== regionKey(restored.stream.center)) {
        throw new Error("Current save captured a half-completed region crossing");
      }
      const restoredJourney = restoreRegionalPromiseJourney(
        decoded.promiseJourney,
        decoded.player,
        compatibilityView,
        restoredView,
      );
      if (!restoredJourney) throw new Error("Current save contains invalid Promise journey state");
      const runtimeCanonicalPlayer = structuredClone(decoded.player);
      normalizePlayerForRuntime(runtimeCanonicalPlayer, restoredView, compatibilityView);
      if (stableStringify(runtimeCanonicalPlayer) !== stableStringify(decoded.player)) {
        throw new Error("Current save contains noncanonical runtime player state");
      }
      regionalTravel = restored;
      promiseJourney = restoredJourney;
      if (!playerPerceptionCarryMatchesPosition(perceptionCarry, regionalTravel, decoded.player)) {
        throw new Error("Current save perception interval does not end at the saved player position");
      }
    } else {
      promiseJourney = migrateRegionalPromiseJourney(decoded.player, compatibilityView);
      normalizePlayerForRuntime(decoded.player, compatibilityView);
      if (
        decoded.version === PHYSICAL_CARGO_GAME_SAVE_VERSION
        && stableStringify(decoded.player) !== stableStringify(rawPlayer)
      ) throw new Error("Version 3 save contains noncanonical runtime player state");
      regionalTravel = migratePlayerToRegionalTravel(world.meta.rootSeed, decoded.player);
    }
    const restoredRegionalView = createRegionalWorldView(
      compatibilityView,
      regionalTravel.window,
      { discovered: decoded.player.discovered, depthSoundings: decoded.player.depthSoundings },
    );
    const activeEcologyRegions = regionalStorageRegionsInView(restoredRegionalView);
    const regionalEcology = persistedRegionalEcology === null
      ? (() => {
          if (v24CompatibilityCoreEcology === null) return null;
          const sourceActorIds = new Set(v24CompatibilityCoreEcology.populations.flatMap(
            ({ members }) => members.map(({ actor }) => actor.identity.stableId),
          ));
          const choiceActorIds = livingActorPlayerChoice.events.flatMap(({ effect }) => {
            switch (effect.kind) {
              case "request-provision-offer":
                return [effect.custodianActorId, effect.beneficiaryActorId];
              case "request-secure-provisions":
                return [effect.custodianActorId];
              case "wait-observe":
              case "leave-interaction":
                return effect.focusActorId === null ? [] : [effect.focusActorId];
              case "request-reroute":
                return [effect.focusActorId];
            }
          });
          const protectedActorIds = [...new Set([
            ...choiceActorIds,
            ...v24CompatibilityCoreEcology.populations.flatMap(({ species, members }) => (
              CORE_ECOLOGY_DOMESTIC_SPECIES.includes(species)
                ? members.map(({ actor }) => actor.identity.stableId)
                : members.flatMap(({ actor }) => (
                    actor.address.persistence === "promoted"
                      ? [actor.identity.stableId]
                      : []
                  ))
            )),
          ])].filter((actorId) => sourceActorIds.has(actorId)).sort(compareText);
          const protectedAggregateIds = v24CompatibilityCoreEcology.aggregatePopulations
            .filter(({ species }) => species === "brown-rat")
            .map(({ aggregateId }) => aggregateId)
            .sort(compareText);
          const normalizedSourceIntegrity = decoded.version
            === REGIONAL_PREDATOR_GAME_SAVE_VERSION
            ? decoded.integrity!
            : hashCanonical({
                kind: "normalized-v24-regional-ecology-source:v1",
                normalizedOuterVersion: REGIONAL_PREDATOR_GAME_SAVE_VERSION,
                sourceOuterVersion: decoded.version,
                sourceEnvelopeIntegrity: typeof decoded.integrity === "string"
                  ? decoded.integrity
                  : null,
                sourceCoreEcologyHash: hashCanonical(v24CompatibilityCoreEcology),
              });
          const root = adoptRegionalEcologyFromV24({
            rootSeed: world.meta.rootSeed,
            completedTick: world.meta.completedTick,
            sourceEnvelopeIntegrity: normalizedSourceIntegrity,
            legacyPatch: v24CompatibilityCoreEcology,
            protectedActorIds,
            protectedAggregateIds,
          });
          const legacyPatch = projectRegionalEcologyLegacyCohort({
            rootSeed: world.meta.rootSeed,
            root,
          });
          if (legacyPatch === null) return null;
          const state = createRegionalEcologyState({
            root,
            settlementHome: {
              sourceKey: coreEcology.patchKey,
              patch: coreEcology,
            },
            activeRegions: activeEcologyRegions,
            activeResidents: [
              ...deriveRuntimeRegionalResidentInputs(
                root,
                world.meta.rootSeed,
                activeEcologyRegions,
              ),
              {
                kind: "legacy-cohort" as const,
                sourceKey: legacyPatch.patchKey,
                patch: legacyPatch,
              },
            ],
          });
          return canonicalRuntimeRegionalEcologyState(
            state,
            world,
            bio0Ecology,
            compatibilityView,
          );
        })()
      : persistedRegionalEcology;
    if (
      regionalEcology === null
      || stableStringify(regionalEcology.activeRegions.map(regionKey).sort(compareText))
        !== stableStringify(activeEcologyRegions.map(regionKey).sort(compareText))
    ) {
      throw new Error("Current save contains ecology for a different active regional window");
    }
    // Regional storage deliberately normalizes materialization and group
    // rendezvous state. Once v24 adoption commits, that normalized home owner
    // is authoritative; retaining the separately adopted materialized view
    // would make every honest migration fail its first v25 round trip.
    const loadedCoreEcology = regionalEcology.settlementHome.patch;
    const physicalCargoValidation = decoded.version >= REGIONAL_GAME_SAVE_VERSION
      ? validatePhysicalCargoState(decoded.physicalCargo, decoded.player, WORLD_WIDTH, WORLD_HEIGHT)
      : decoded.version === PHYSICAL_CARGO_GAME_SAVE_VERSION
        ? adoptPhysicalCargoStateV1(decoded.physicalCargo, decoded.player, WORLD_WIDTH, WORLD_HEIGHT)
        : {
            valid: true as const,
            reason: "valid" as const,
            state: createPhysicalCargoStateFromPlayer(decoded.player, WORLD_WIDTH, WORLD_HEIGHT),
          };
    if (!physicalCargoValidation.valid || !physicalCargoValidation.state) {
      throw new Error(`Save contains invalid physical cargo: ${physicalCargoValidation.reason}`);
    }
    const loadedPhysicalCargo = decoded.version >= CORE_ECOLOGY_GAME_SAVE_VERSION
      ? physicalCargoValidation.state
      : seedRuntimeCoreEcologyProvision(physicalCargoValidation.state, regionalEcology);
    if (
      decoded.version >= REGIONAL_GAME_SAVE_VERSION
      && regionKey(loadedPhysicalCargo.activeRegion) !== regionKey(regionalTravel.stream.center)
    ) throw new Error("Current save physical cargo is active in the wrong region");
    validatePhysicalPromiseCustody(world, decoded.player, loadedPhysicalCargo);
    return {
      kind: "loaded",
      world,
      player: decoded.player,
      session: loadedSession,
      fieldResources,
      traversalFeedback,
      physicalCargo: loadedPhysicalCargo,
      bio0Ecology,
      coreEcology: loadedCoreEcology,
      regionalEcology,
      dogActorRoster,
      settlementEcology,
      settlementWorkingAnimals,
      settlementDomesticAnimalRecovery,
      porterResponse,
      livingActorPlayerChoice,
      regionalTravel,
      promiseJourney,
      perceptionCarry,
      saveGenerationEra: version.saveGenerationEra,
      saveGeneration: version.saveGeneration,
      updatedAt: record.updatedAt,
    };
  } catch {
    return { kind: "corrupt", version };
  }
}

/**
 * Old unsealed session envelopes sometimes contain a newly constructed kit
 * object with legacy half-address deployments. The envelope version—not that
 * nested object's optimistic version—is authoritative during migration. Strip
 * the not-yet-persistent region field and let the v2 migrator preserve every
 * stable core ID, returning unsuitable placements to hand rather than silently
 * deleting physical equipment.
 */
function prepareLegacyWayknotsForRegionalMigration(player: PlayerState): void {
  const value: unknown = player.wayknots;
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const state = value as { readonly capacity?: unknown; readonly wayknots?: unknown };
  if (!Array.isArray(state.wayknots)) return;
  const wayknots = state.wayknots.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const { region: _region, ...legacy } = raw as Record<string, unknown>;
    return legacy;
  });
  (player as unknown as { wayknots: unknown }).wayknots = {
    version: 2,
    capacity: state.capacity,
    wayknots,
  };
}

function normalizeLoadedSession(
  value: unknown,
  worldSeed: string,
  legacyChoirCount: number,
): GameSessionState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Save contains invalid session state");
  }
  const candidate = value as Partial<GameSessionState>;
  const fallback = createSessionState(worldSeed, HARD_POSTURE, PERPETUAL_SESSION_SHAPE);
  const tutorial = normalizeLoadedTutorial(candidate.tutorial);
  const sessionChanges = candidate.sessionChanges === undefined
    ? []
    : Array.isArray(candidate.sessionChanges)
      && candidate.sessionChanges.every((entry) => typeof entry === "string")
      ? candidate.sessionChanges.slice(-32)
      : invalidLoadedSession("changes");
  const announcement = normalizeLoadedAnnouncement(candidate.announcement);
  const sessionBaseline = normalizeLoadedBaseline(candidate.sessionBaseline, legacyChoirCount);
  const posture = candidate.posture === "hearth"
    || candidate.posture === "journey"
    || candidate.posture === "gale"
    ? candidate.posture
    : candidate.posture === undefined
      ? fallback.posture
      : invalidLoadedSession("posture");
  const sessionShape = candidate.sessionShape === "drift"
    || candidate.sessionShape === "weave"
    || candidate.sessionShape === "wander"
    ? candidate.sessionShape
    : candidate.sessionShape === undefined
      ? fallback.sessionShape
      : invalidLoadedSession("shape");
  const pressureMode = candidate.pressureMode === "calm"
    || candidate.pressureMode === "standard"
    || candidate.pressureMode === "wild"
    ? candidate.pressureMode
    : candidate.pressureMode === undefined
      ? fallback.pressureMode
      : invalidLoadedSession("pressure");

  return {
    seed: optionalSessionString(candidate.seed, worldSeed, "seed"),
    pressureMode,
    posture,
    sessionShape,
    paused: optionalSessionBoolean(candidate.paused, fallback.paused, "paused"),
    titleVisible: optionalSessionBoolean(candidate.titleVisible, fallback.titleVisible, "title visibility"),
    quietHourVisible: optionalSessionBoolean(
      candidate.quietHourVisible,
      fallback.quietHourVisible,
      "Quiet Hour visibility",
    ),
    selectedSettlementId: optionalSessionId(candidate.selectedSettlementId, "selected settlement"),
    inspectedContractId: optionalSessionId(candidate.inspectedContractId, "inspected Promise"),
    trackedContractId: optionalSessionId(candidate.trackedContractId, "tracked Promise"),
    sessionStartedTick: optionalSessionCount(candidate.sessionStartedTick, 0, "start tick"),
    sessionPlayMilliseconds: optionalSessionCount(
      candidate.sessionPlayMilliseconds,
      0,
      "play time",
    ),
    sessionDistanceUnits: optionalSessionCount(candidate.sessionDistanceUnits, 0, "distance"),
    sessionDeliveries: optionalSessionCount(candidate.sessionDeliveries, 0, "deliveries"),
    sessionReportsDelivered: optionalSessionCount(
      candidate.sessionReportsDelivered,
      0,
      "reports",
    ),
    sessionStrandsWoven: optionalSessionCount(candidate.sessionStrandsWoven, 0, "strands"),
    sessionChoirsAwakened: optionalSessionCount(candidate.sessionChoirsAwakened, 0, "choirs"),
    sessionDiscoveredAtStart: optionalSessionCount(
      candidate.sessionDiscoveredAtStart,
      0,
      "charted marks",
    ),
    sessionBaseline,
    closureOffered: optionalSessionBoolean(candidate.closureOffered, false, "closure"),
    campaignCelebrated: optionalSessionBoolean(candidate.campaignCelebrated, false, "celebration"),
    sessionChanges,
    announcement,
    nextAnnouncementId: optionalSessionCount(
      candidate.nextAnnouncementId,
      Math.max(1, (announcement?.id ?? 0) + 1),
      "announcement counter",
      1,
    ),
    tutorial,
    hasSave: optionalSessionBoolean(candidate.hasSave, true, "save presence"),
    continueSummary: optionalSessionString(candidate.continueSummary, "", "continue summary"),
  };
}

function normalizeLoadedTutorial(value: unknown): GameSessionState["tutorial"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Save contains invalid tutorial state");
  }
  const candidate = value as Partial<GameSessionState["tutorial"]>;
  const stages: readonly GameSessionState["tutorial"]["stage"][] = [
    "move",
    "scan",
    "promise",
    "travel",
    "witness",
    "complete",
  ];
  if (!stages.includes(candidate.stage as GameSessionState["tutorial"]["stage"])) {
    throw new Error("Save contains invalid tutorial stage");
  }
  return {
    stage: candidate.stage as GameSessionState["tutorial"]["stage"],
    scansUsed: requiredSessionCount(candidate.scansUsed, "tutorial scans"),
    acceptedPromises: requiredSessionCount(candidate.acceptedPromises, "tutorial Promises"),
    witnessedChanges: requiredSessionCount(candidate.witnessedChanges, "tutorial changes"),
    dismissed: candidate.dismissed === true
      ? true
      : candidate.dismissed === false
        ? false
        : invalidLoadedSession("tutorial dismissal"),
  };
}

function normalizeLoadedAnnouncement(
  value: unknown,
): GameSessionState["announcement"] {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Save contains invalid announcement state");
  }
  const candidate = value as Partial<NonNullable<GameSessionState["announcement"]>>;
  if (
    !Number.isSafeInteger(candidate.id)
    || (candidate.id ?? 0) < 1
    || typeof candidate.message !== "string"
    || typeof candidate.assertive !== "boolean"
  ) {
    throw new Error("Save contains invalid announcement state");
  }
  return {
    id: candidate.id as number,
    message: candidate.message,
    assertive: candidate.assertive,
  };
}

function normalizeLoadedBaseline(
  value: unknown,
  legacyChoirCount: number,
): GameSessionState["sessionBaseline"] {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Save contains invalid session baseline");
  }
  const candidate = value as Partial<NonNullable<GameSessionState["sessionBaseline"]>>;
  return {
    completedTick: requiredSessionCount(candidate.completedTick, "baseline tick"),
    activeRoutes: requiredSessionCount(candidate.activeRoutes, "baseline routes"),
    resilience: requiredSessionMetric(candidate.resilience, "baseline resilience"),
    averageStress: requiredSessionMetric(candidate.averageStress, "baseline stress"),
    averageTrust: requiredSessionMetric(candidate.averageTrust, "baseline trust"),
    projectProgress: requiredSessionMetric(candidate.projectProgress, "baseline projects"),
    fulfilledContracts: requiredSessionCount(candidate.fulfilledContracts, "baseline Promises"),
    awakenedChoirs: candidate.awakenedChoirs === undefined
      ? legacyChoirCount
      : requiredSessionCount(candidate.awakenedChoirs, "baseline choirs"),
  };
}

function optionalSessionBoolean(value: unknown, fallback: boolean, field: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  return invalidLoadedSession(field);
}

function optionalSessionString(value: unknown, fallback: string, field: string): string {
  if (value === undefined) return fallback;
  if (typeof value === "string") return value;
  return invalidLoadedSession(field);
}

function optionalSessionId(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  if (Number.isSafeInteger(value) && (value as number) >= 0) return value as number;
  return invalidLoadedSession(field);
}

function optionalSessionCount(
  value: unknown,
  fallback: number,
  field: string,
  minimum = 0,
): number {
  if (value === undefined) return fallback;
  if (Number.isSafeInteger(value) && (value as number) >= minimum) return value as number;
  return invalidLoadedSession(field);
}

function requiredSessionCount(value: unknown, field: string): number {
  if (Number.isSafeInteger(value) && (value as number) >= 0) return value as number;
  return invalidLoadedSession(field);
}

function requiredSessionMetric(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return invalidLoadedSession(field);
}

function invalidLoadedSession(field: string): never {
  throw new Error(`Save contains invalid session ${field}`);
}

/**
 * Accepting a promise is optimistic in the game layer but atomic in the
 * simulation: origin stock is not debited until accept + pickup run together.
 * A save taken inside that short window therefore persists the authoritative
 * offered contract and rolls back only its uncommitted local pack copy.
 */
function rollbackOptimisticPickup(
  player: PlayerState,
  session: GameSessionState,
  contractId: number,
): void {
  player.cargo = player.cargo.filter((cargo) => cargo.contractId !== contractId);
  if (player.activeContractId === contractId) {
    player.activeContractId = null;
    player.currentTrace = [playerTileIndex(player)];
  }
  session.trackedContractId = contractId;
  session.tutorial.acceptedPromises = Math.max(0, session.tutorial.acceptedPromises - 1);
  if (session.tutorial.stage === "travel" && player.completedJourneys === 0) {
    session.tutorial.stage = "promise";
  }
}

function removePhysicalPromiseContract(
  state: PhysicalCargoState,
  contractId: number,
): PhysicalCargoState {
  if (physicalCargoPromiseCustody(state, contractId).looseQuantity > 0) {
    throw new Error("Cannot remove Promise substance while one of its parcels is loose in the world");
  }
  const lots = state.carrier.lots.filter((lot) =>
    lot.payload.kind === "promise" && lot.payload.contractId === contractId);
  if (lots.length === 0) return state;
  let carrier = state.carrier;
  const removed: LooseCargoPayload[] = [];
  for (const lot of lots) {
    const result = removeLooseCargoPromise(carrier, lot.id);
    if (!result.ok) throw new Error(`Could not remove physical Promise lot: ${result.reason}`);
    carrier = result.carrier;
    removed.push(lot.payload);
  }
  return commitPhysicalCargoState(
    state,
    { looseWorld: state.looseWorld, carrier },
    { kind: "delta", removed, added: [] },
  );
}

/**
 * Repairs snapshots produced before pending pickups were reconciled at save
 * time. The common offered state only needs its phantom local cargo removed.
 * An accepted-without-pickup state has not moved inventory either, so it can
 * deterministically return to offered without creating or destroying stock.
 */
function repairInterruptedPickups(
  world: WorldState,
  player: PlayerState,
  session: GameSessionState,
): number[] {
  const repairedContractIds: number[] = [];
  const contractId = player.activeContractId;
  if (contractId !== null) {
    const activeContract = world.contracts.find((candidate) => candidate.id === contractId);
    if (activeContract?.status === "offered" && activeContract.cargoQuantity === 0) {
      rollbackOptimisticPickup(player, session, contractId);
      repairedContractIds.push(contractId);
    }
  }

  // A player-accepted contract with no authoritative cargo is never a stable
  // runtime state: the game always submits accept + pickup as one pair. It can
  // remain only when pickup failed and the follow-up release command was lost,
  // or in a legacy save captured between those operations. No inventory moved,
  // so returning it to offered is the unique conservation-preserving repair.
  for (const contract of world.contracts) {
    if (!isAcceptedWithoutPickup(contract)) continue;
    resetContractToOffered(contract);
    rollbackOptimisticPickup(player, session, contract.id);
    if (!repairedContractIds.includes(contract.id)) repairedContractIds.push(contract.id);
  }
  return repairedContractIds.sort((left, right) => left - right);
}

function isAcceptedWithoutPickup(contract: ContractState): boolean {
  return contract.status === "accepted"
    && contract.carrierKind === "player"
    && contract.cargoQuantity === 0;
}

function resetContractToOffered(contract: ContractState): void {
  contract.status = "offered";
  contract.acceptedTick = null;
  contract.departedTick = null;
  contract.arrivalTick = null;
  contract.completedTick = null;
  contract.carrierKind = null;
  contract.assignedResidentId = null;
  contract.porterRouteIds = [];
  contract.porterSettlementIds = [];
  contract.deliveryCondition = null;
  contract.deliveryGrade = null;
  contract.deliveryTraceCost = null;
}

function runtimeFieldResourceCatalog(world: WorldState): FieldResourceCatalog {
  const natural = generateFieldResourceCatalog(world.meta.rootSeed, world.terrain);
  const occupied = new Set(world.settlements.map((settlement) => settlement.tileIndex));
  return {
    ...natural,
    // Harbors remain unambiguous interaction tiles. Their stone, gardens, and
    // workshops are civic space rather than remotely harvestable nature.
    nodes: natural.nodes.filter((node) => !occupied.has(node.tileIndex)),
  };
}

function requireFieldResourceState(value: unknown): FieldResourceEcologyState {
  if (!value || typeof value !== "object") {
    throw new Error("Save is missing field-resource ecology");
  }
  const candidate = value as Partial<FieldResourceEcologyState>;
  if (
    candidate.version !== 1
    || !Number.isSafeInteger(candidate.activeTick)
    || (candidate.activeTick ?? -1) < 0
    || !Array.isArray(candidate.depletion)
  ) {
    throw new Error("Save contains invalid field-resource ecology");
  }
  return candidate as FieldResourceEcologyState;
}

function normalizePlayerForRuntime(
  player: PlayerState,
  world: WorldView,
  economyWorld: WorldView = world,
): void {
  player.worldWidth = world.terrain.width;
  player.worldHeight = world.terrain.height;
  player.x = clamp(player.x, TILE_UNITS / 2, world.terrain.width * TILE_UNITS - TILE_UNITS / 2);
  player.y = clamp(player.y, TILE_UNITS / 2, world.terrain.height * TILE_UNITS - TILE_UNITS / 2);
  player.previousX = Number.isFinite(player.previousX)
    ? clamp(player.previousX, TILE_UNITS / 2, world.terrain.width * TILE_UNITS - TILE_UNITS / 2)
    : player.x;
  player.previousY = Number.isFinite(player.previousY)
    ? clamp(player.previousY, TILE_UNITS / 2, world.terrain.height * TILE_UNITS - TILE_UNITS / 2)
    : player.y;
  player.velocityX = Number.isFinite(player.velocityX) ? player.velocityX : 0;
  player.velocityY = Number.isFinite(player.velocityY) ? player.velocityY : 0;
  player.facingMilliRadians = Number.isFinite(player.facingMilliRadians) ? player.facingMilliRadians : 0;
  player.stamina = clamp(player.stamina, 0, FIXED_POINT);
  player.stability = clamp(player.stability, 0, FIXED_POINT);
  player.scanCharge = clamp(player.scanCharge, 0, FIXED_POINT);
  player.scanPulse = Number.isFinite(player.scanPulse) ? clamp(player.scanPulse, 0, FIXED_POINT) : 0;
  player.pace = isTravelPace(player.pace) ? player.pace : "steady";
  player.mode = isPlayerMode(player.mode) ? player.mode : "foot";
  player.report = player.report ?? null;
  player.reportsDelivered = Number.isFinite(player.reportsDelivered)
    ? Math.max(0, Math.floor(player.reportsDelivered))
    : 0;
  player.stabilityTrend = player.stabilityTrend === "falling" || player.stabilityTrend === "recovering"
    ? player.stabilityTrend
    : "steady";
  player.stabilityHint = typeof player.stabilityHint === "string" && player.stabilityHint.trim().length > 0
    ? player.stabilityHint
    : "Stable · hold Shift while moving to brace";
  player.discovered = player.discovered.map((value) => Number.isFinite(value)
    ? clamp(value, 0, FIXED_POINT)
    : 0);
  const validTools: readonly FieldToolKind[] = ["sounding-line", "marsh-stilts", "tide-sail", "storm-kite"];
  player.tools = Array.isArray(player.tools)
    ? [...new Set(player.tools.filter((tool): tool is FieldToolKind => validTools.includes(tool as FieldToolKind)))].sort()
    : ["sounding-line"];
  if (!player.tools.includes("sounding-line")) player.tools.unshift("sounding-line");
  player.wayknots = normalizeWayknotState(player.wayknots, {
    capacity: DEFAULT_WAYKNOT_CAPACITY,
    tileCount: WORLD_WIDTH * WORLD_HEIGHT,
    loadTick: world.completedTick,
    contextRegion: regionalWorldCenter(world),
    contextAt: (localTileIndex, region) => {
      const viewTileIndex = regionalTileIndexInView(world, region, localTileIndex);
      if (viewTileIndex === null) return undefined;
      const resolved = regionalWayknotContextAt(world, viewTileIndex);
      if (!resolved) return undefined;
      const context = resolved.context;
      const tile = world.terrain.tiles[viewTileIndex];
      const canReachAnchorDepth = tile !== undefined
        && MAX_TIDE_LEVEL - tile.elevation >= TIDE_ANCHOR_PLACEMENT_DEPTH;
      return canReachAnchorDepth
        ? { ...context, waterDepth: Math.max(context.waterDepth, TIDE_ANCHOR_PLACEMENT_DEPTH) }
        : context;
    },
  });
  player.depthSoundings = Array.isArray(player.depthSoundings)
    && player.depthSoundings.length === world.terrain.tiles.length
    ? player.depthSoundings.map((value) => Number.isFinite(value)
      ? Math.max(0, Math.min(FIXED_POINT, value))
      : 0)
    : Array.from({ length: world.terrain.tiles.length }, () => 0);
  player.sweepPath = Array.isArray(player.sweepPath) ? player.sweepPath : [];
  player.sweepTicksRemaining = Number.isFinite(player.sweepTicksRemaining)
    ? Math.max(0, Math.floor(player.sweepTicksRemaining))
    : 0;
  player.sweepTotalTicks = Number.isFinite(player.sweepTotalTicks)
    ? Math.max(player.sweepTicksRemaining, Math.floor(player.sweepTotalTicks))
    : player.sweepTicksRemaining;
  player.sweepSupport = player.sweepSupport === "clinic" || player.sweepSupport === "ferry"
    ? player.sweepSupport
    : null;
  if (player.mode === "swept" && !restoreSweptPlayer(player, world)) {
    player.mode = "camp";
    player.stamina = Math.max(player.stamina, 150_000);
    restoreSweptPlayer(player, world);
  } else if (player.mode !== "swept") {
    restoreSweptPlayer(player, world);
  }
  const loadedHarborId = settlementAtPlayer(player, world);
  player.surveyTrace = Array.isArray(player.surveyTrace) && player.surveyTrace.length > 0
    ? player.surveyTrace
    : [playerTileIndex(player)];
  player.surveyedRouteIds = Array.isArray(player.surveyedRouteIds)
    ? [...new Set(player.surveyedRouteIds.filter((id) => economyWorld.routes.some((route) => route.id === id)))]
        .sort((left, right) => left - right)
    : [];
  player.lastHarborId = player.lastHarborId === null
    || economyWorld.settlements.some((settlement) => settlement.id === player.lastHarborId)
    ? player.lastHarborId
    : loadedHarborId;
  player.harborTrail = Array.isArray(player.harborTrail)
    && player.harborTrail.every((id) => economyWorld.settlements.some((settlement) => settlement.id === id))
    ? player.harborTrail.slice(-8)
    : player.lastHarborId === null ? [] : [player.lastHarborId];
}

function normalizePlayerCrafting(player: PlayerState, allowMissing: boolean): void {
  if (!Number.isSafeInteger(player.cargoCapacity) || player.cargoCapacity <= 0) {
    throw new Error("Save contains invalid pack capacity");
  }
  // The Alpha pack grew from 16 to 18 shared load units. Raising the saved
  // floor before rebuilding the structural inventory preserves every valid
  // old stack/gear item while retaining any future capacity above the base.
  player.cargoCapacity = Math.max(BASE_CARGO_CAPACITY, player.cargoCapacity);
  const capacityMilli = player.cargoCapacity * PACK_LOAD_MILLI_PER_UNIT;
  if (!Number.isSafeInteger(capacityMilli)) {
    throw new Error("Save contains invalid pack capacity");
  }
  requireValidPlayerCargoForLoad(player);
  const snapshot = (player as PlayerState & { craftingInventory?: CraftingInventory }).craftingInventory;
  if (!snapshot) {
    if (!allowMissing) throw new Error("Save is missing crafting inventory");
    player.craftingInventory = createCraftingInventory(capacityMilli);
  } else {
    if (!snapshot.stacks || !Array.isArray(snapshot.gear)) {
      throw new Error("Save contains invalid crafting inventory");
    }
    if (snapshot.gear.some((gear) => {
      const id = gear && typeof gear === "object"
        ? (gear as { readonly id?: unknown }).id
        : undefined;
      return !Number.isSafeInteger(id) || (id as number) < FIRST_CRAFTED_GEAR_ID;
    })) {
      throw new Error("Save contains a crafted gear ID reserved for the inherited Wayknot kit");
    }
    player.craftingInventory = createCraftingInventory(
      capacityMilli,
      snapshot.stacks,
      snapshot.gear,
    );
  }
  if (cargoWeightMilli(player) > capacityMilli) {
    throw new Error("Save contains an over-capacity pack");
  }
  const highestGearId = player.craftingInventory.gear.reduce(
    (highest, gear) => Math.max(highest, gear.id),
    FIRST_CRAFTED_GEAR_ID - 1,
  );
  const nextAvailableId = highestGearId >= Number.MAX_SAFE_INTEGER
    ? Number.MAX_SAFE_INTEGER
    : Math.max(FIRST_CRAFTED_GEAR_ID, highestGearId + 1);
  player.nextCraftedGearId = Number.isSafeInteger(player.nextCraftedGearId)
    && player.nextCraftedGearId >= nextAvailableId
    ? player.nextCraftedGearId
    : nextAvailableId;
}

/** Validate transport fields before any shared-pack arithmetic can admit NaN. */
function requireValidPlayerCargoForLoad(player: PlayerState): void {
  if (!Array.isArray(player.cargo) || player.cargo.length > 1) {
    throw new Error("Save contains invalid player cargo");
  }
  for (const value of player.cargo as unknown[]) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Save contains invalid player cargo");
    }
    const cargo = value as Partial<PlayerState["cargo"][number]>;
    if (
      !Number.isSafeInteger(cargo.contractId)
      || (cargo.contractId ?? 0) <= 0
      || !PLAYER_CARGO_RESOURCES.has(cargo.resource as ContractState["resource"])
      || !Number.isSafeInteger(cargo.quantity)
      || (cargo.quantity ?? 0) <= 0
      || (cargo.quantity ?? 0) > player.cargoCapacity
      || (cargo.quantity ?? 0) > MAX_SAFE_CARGO_QUANTITY
      || !Number.isSafeInteger(cargo.condition)
      || (cargo.condition ?? -1) < 0
      || (cargo.condition ?? FIXED_POINT + 1) > FIXED_POINT
      || cargo.property !== expectedCargoProperty(cargo.resource as ContractState["resource"])
    ) {
      throw new Error("Save contains invalid player cargo");
    }
  }
}

function expectedCargoProperty(
  resource: ContractState["resource"],
): PlayerState["cargo"][number]["property"] {
  switch (resource) {
    case "medicine": return "fragile";
    case "food": return "perishable";
    case "freshWater":
    case "parts": return "heavy";
    case "reed": return "ordinary";
  }
}

function validatePlayer(
  player: PlayerState,
  world: WorldState,
  expectedChartTiles = world.terrain.tiles.length,
): void {
  for (const value of [player.x, player.y, player.stamina, player.stability, player.scanCharge]) {
    if (!Number.isFinite(value)) throw new Error("Save contains invalid player state");
  }
  if (!Array.isArray(player.discovered) || player.discovered.length !== expectedChartTiles) {
    throw new Error("Save contains an incompatible chart");
  }
  if (!Array.isArray(player.cargo) || !Array.isArray(player.currentTrace)) {
    throw new Error("Save contains invalid player cargo or trace");
  }
  if (!player.craftingInventory || !Number.isSafeInteger(player.nextCraftedGearId)) {
    throw new Error("Save contains invalid crafting state");
  }
  if (player.surveyTrace !== undefined && !Array.isArray(player.surveyTrace)) {
    throw new Error("Save contains an invalid survey trace");
  }
  if (player.surveyedRouteIds !== undefined && !Array.isArray(player.surveyedRouteIds)) {
    throw new Error("Save contains invalid surveyed routes");
  }
  if (player.harborTrail !== undefined && !Array.isArray(player.harborTrail)) {
    throw new Error("Save contains an invalid harbor phrase");
  }
  if (
    player.depthSoundings !== undefined
    && !Array.isArray(player.depthSoundings)
  ) {
    throw new Error("Save contains an invalid depth chart");
  }
  if (player.tools !== undefined && !Array.isArray(player.tools)) {
    throw new Error("Save contains an invalid field kit");
  }
  if (player.sweepPath !== undefined && !Array.isArray(player.sweepPath)) {
    throw new Error("Save contains an invalid sweep path");
  }
  if (player.report !== undefined && player.report !== null) {
    const report = player.report;
    if (
      !Number.isSafeInteger(report.sourceSettlementId)
      || !Number.isSafeInteger(report.targetSettlementId)
      || !Number.isSafeInteger(report.reportedQuantity)
      || !Number.isSafeInteger(report.observedTick)
      || !world.settlements.some((settlement) => settlement.id === report.sourceSettlementId)
      || !world.settlements.some((settlement) => settlement.id === report.targetSettlementId)
    ) {
      throw new Error("Save contains an invalid signed report");
    }
  }
}

function hasExactObjectKeys(
  value: object,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const canonicalExpected = [...expected].sort();
  return actual.length === canonicalExpected.length
    && actual.every((key, index) => key === canonicalExpected[index]);
}

function validatePhysicalPromiseCustody(
  world: WorldState,
  player: PlayerState,
  physicalCargo: PhysicalCargoState,
): void {
  const playerContracts = world.contracts.filter((contract) =>
    contract.status === "in-transit" && contract.carrierKind === "player");
  if (playerContracts.length > 1) {
    throw new Error("Save contains more than one player-carried Promise");
  }
  const active = playerContracts[0] ?? null;
  if ((active?.id ?? null) !== player.activeContractId) {
    throw new Error("Save Promise ownership does not match the active physical carrier");
  }
  const physicalPromises = [
    ...physicalCargo.carrier.lots.map((lot) => lot.payload),
    ...physicalCargoWorlds(physicalCargo).flatMap(({ entities }) =>
      entities.map((entity) => entity.payload)),
  ].filter((payload): payload is Extract<LooseCargoPayload, { readonly kind: "promise" }> =>
    payload.kind === "promise");
  if (!active) {
    if (physicalPromises.length > 0 || player.cargo.length > 0) {
      throw new Error("Save retains physical Promise cargo without an active contract");
    }
    return;
  }
  let quantity = 0;
  for (const payload of physicalPromises) {
    if (
      payload.contractId !== active.id
      || payload.resource !== active.resource
      || payload.property !== expectedCargoProperty(active.resource)
    ) throw new Error("Save contains a Promise parcel with contradictory ownership or contents");
    quantity += payload.quantity;
    if (!Number.isSafeInteger(quantity)) throw new Error("Save Promise quantity overflowed");
  }
  if (quantity !== active.cargoQuantity || active.cargoQuantity !== active.quantity) {
    throw new Error("Save physical Promise quantity does not match authoritative contract custody");
  }
}

function materialLabel(material: FieldMaterialId): string {
  return CRAFTING_STACK_DEFINITIONS[material].label;
}

function titleCaseWord(word: string): string {
  return word.length === 0 ? word : `${word[0]?.toLocaleUpperCase() ?? ""}${word.slice(1)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "the transaction failed closed";
}

function formatMilliLoad(loadMilli: number): string {
  const value = Math.max(0, Math.trunc(loadMilli)) / PACK_LOAD_MILLI_PER_UNIT;
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/u, "").replace(/\.$/u, "");
}

function resourceStockBand(stock: number, capacity: number): string {
  if (stock <= 1) return "recovering";
  const ratio = stock / Math.max(1, capacity);
  if (ratio >= 2 / 3) return "plentiful";
  if (ratio >= 1 / 3) return "some";
  return "recovering";
}

function signControl(value: number): -1 | 0 | 1 {
  if (value > 0.05) return 1;
  if (value < -0.05) return -1;
  return 0;
}

function isTravelPace(value: unknown): value is TravelPace {
  return value === "rest" || value === "steady" || value === "swift";
}

function isPlayerMode(value: unknown): value is PlayerMode {
  return value === "foot"
    || value === "wading"
    || value === "skiff"
    || value === "swept"
    || value === "camp"
    || value === "rescued";
}

function settlementName(world: WorldView, id: number): string {
  return world.settlements.find((settlement) => settlement.id === id)?.name ?? `Settlement ${id}`;
}

function humanResource(resource: ContractState["resource"]): string {
  return resource === "freshWater" ? "fresh water" : resource;
}

export function tideHarpPulseAnnouncement(harp: TideHarp | undefined): string {
  if (!harp) {
    return "The sounding line charts nearby terrain and water depth. Those bathymetry marks will remain on this world.";
  }
  const [reed, anchor, wind] = harp.knots;
  return `${harp.label} answered the Loom. One pulse sounded from your position and from its three knot origins: Reed mat #${reed.id}, Tide anchor #${anchor.id}, and Wind knot #${wind.id}. Each origin recorded nearby terrain and water depth.`;
}

function fieldToolEffect(tool: FieldToolKind): string {
  switch (tool) {
    case "sounding-line":
      return "Loom pulses now reveal nearby water depth.";
    case "marsh-stilts":
      return "Mudflats and reed marsh cost less stamina and no longer drag as heavily.";
    case "tide-sail":
      return "Deep-water travel is faster and uses less stamina.";
    case "storm-kite":
      return "Strong wind harms stability less and any current sweep reaches shore sooner.";
  }
}

function wayknotFailureMessage(
  reason: WayknotActionReason,
  kind: WayknotKind | null,
  placementReason?: WayknotPlacementReason,
): string {
  const label = kind ? WAYKNOT_LABELS[kind] : "Wayknot";
  if (placementReason === "condition-too-low") {
    return `${label} is too frail to bind. Reclaiming and redeploying preserve wear; it needs at least 15% condition before placement.`;
  }
  switch (reason) {
    case "capacity-reached":
      return `Both reusable ${label.toLocaleLowerCase()} pieces are already in the field. Stand on one and press F to reclaim it.`;
    case "occupied":
      return "This tile already holds a harbor or Wayknot. Stand directly on a placed knot and press F to reclaim it.";
    case "unsuitable-terrain":
      return "No field weave fits this ground: reed mats bind mudflat or marsh, Tide anchors bind waist-deep water, and Wind knots bind scrub or ridge.";
    case "invalid-context":
      return "The field kit cannot safely read this terrain patch.";
    case "not-found":
      return "No placed Wayknot is underfoot to reclaim.";
    case "already-carried":
      return `${label} is already carried in the reusable field kit.`;
    case "already-there":
      return `${label} is already bound here.`;
    case "placed":
    case "reclaimed":
    case "redeployed":
      return `${label} is ready.`;
  }
}

function isTerminal(status: ContractState["status"]): boolean {
  return status === "fulfilled" || status === "expired" || status === "cancelled";
}

/** The looping noise graph listens to one bounded, distance-softened local wet tile. */
export function localWaterAmbience(
  world: WorldView,
  player: PlayerState,
): WaterAmbienceState {
  const centerIndex = playerTileIndex(player);
  const centerColumn = centerIndex % world.terrain.width;
  const centerRow = Math.floor(centerIndex / world.terrain.width);
  const radius = 6;
  let strongest: {
    readonly profile: ReturnType<typeof deriveWaterFlowProfile>;
    readonly attenuation: number;
    readonly dx: number;
    readonly score: number;
  } | undefined;
  for (let row = Math.max(0, centerRow - radius); row <= Math.min(world.terrain.height - 1, centerRow + radius); row += 1) {
    for (let column = Math.max(0, centerColumn - radius); column <= Math.min(world.terrain.width - 1, centerColumn + radius); column += 1) {
      const dx = column - centerColumn;
      const dy = row - centerRow;
      const distance = Math.hypot(dx, dy);
      if (distance > radius) continue;
      const tile = world.terrain.tiles[row * world.terrain.width + column];
      if (!tile) continue;
      const profile = deriveWaterFlowProfile({
        waterDepth: tile.waterDepth,
        bedRoughness: tile.roughness,
        tideLevel: world.tide.level,
        weatherIntensity: world.weather.intensity,
      });
      if (profile.voice === "silent") continue;
      const attenuation = 1 / (1 + distance * 0.7);
      const score = (profile.strength + profile.turbulence * 0.55) * attenuation;
      if (!strongest || score > strongest.score) {
        strongest = { profile, attenuation, dx, score };
      }
    }
  }
  if (!strongest) return { strength: 0, turbulence: 0, voice: "silent", pan: 0 };
  const direction = surfaceCurrentDirection(world.tide.direction, world.weather.windY);
  const spatialPan = strongest.dx === 0 ? 0 : Math.sign(strongest.dx) * 0.68;
  const flowPan = (direction.x * 0.18 + direction.y * 0.06) / FIXED_POINT;
  return {
    strength: strongest.profile.strength / FIXED_POINT * strongest.attenuation,
    turbulence: strongest.profile.turbulence / FIXED_POINT * strongest.attenuation,
    voice: strongest.profile.voice,
    // A bank-side source stays perceptually on its physical side; flow adds a
    // smaller directional drift without pulling it across the listener.
    pan: Math.max(-1, Math.min(1, spatialPan + flowPan)),
  };
}

export function averageObservedRouteStrength(
  world: WorldView,
  detailVisibilityGrades: Uint8Array,
): number {
  if (detailVisibilityGrades.length !== world.terrain.tiles.length) return 0;
  const observed = world.routes.filter((route) => route.path.some(
    (tileIndex) => detailVisibilityGrades[tileIndex] === VISIBILITY_DIRECT,
  ));
  if (observed.length === 0) return 0;
  return observed.reduce((sum, route) => sum + route.traceStrength, 0)
    / observed.length
    / 1_000_000;
}

function discoveredCount(player: PlayerState): number {
  return player.discovered.reduce((count, discovery) => count + (discovery > 0 ? 1 : 0), 0);
}

function continueSummary(world: WorldView, player: PlayerState): string {
  const here = settlementAtPlayer(player, world);
  return `Day ${Math.floor(world.completedTick / 1_440) + 1} · ${here === null ? "between harbors" : settlementName(world, here)} · ${player.completedJourneys} promises kept`;
}

function tutorialAdvanceMessage(stage: GameSessionState["tutorial"]["stage"]): string {
  switch (stage) {
    case "move":
      return "Begin by feeling the terrain underfoot.";
    case "scan":
      return "The estuary remembers your movement. Now pulse the Loom with Space.";
    case "promise":
      return "Nearby ground is charted. Choose one useful promise at this harbor.";
    case "travel":
      return "The cargo is yours. Choose a route; a rough arrival still matters.";
    case "witness":
      return "Promise kept. Read how the material, relationship, and route responded.";
    case "complete":
      return "The first weave is complete. The estuary is now yours to shape.";
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

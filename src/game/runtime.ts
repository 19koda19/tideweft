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
import { findTilePath, MAX_TIDE_LEVEL } from "../sim/terrain";
import { hashCanonical, stableStringify } from "../sim/util";
import { stableDogId, type DogIdentityGenerationInput } from "../sim/dogIdentity";
import {
  canonicalizeActorObservations,
  createActorObservation,
  type ActorObservation,
} from "../sim/actorPerception";
import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
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
  collectCoreEcologyVisualObservationBatches,
  propagateCoreEcologyAlarmObservationBatches,
  type CoreEcologyObservationBatch,
} from "./coreEcologyPerception";
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
import { createRegionCoord, regionKey } from "../sim/regions";
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
  canonicalizeCoreEcologyPatch,
  coreEcologyActor,
  createCoreEcologyPatch,
  deserializeCoreEcologyPatch,
  replaceCoreEcologyActor,
  serializeCoreEcologyPatch,
  setCoreEcologyMaterializedActors,
  stepCoreEcologyPatch,
  type CoreEcologyPatchState,
} from "./coreEcology";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  CORE_WILDLIFE_EVENT_VERSION,
  CORE_WILDLIFE_INTENTS,
  CORE_WILDLIFE_MAX_FOOD_OPPORTUNITIES,
  repositionCoreWildlifeActor,
  replaceCoreWildlifeActorPhysiology,
  type CoreWildlifeActorState,
  type CoreWildlifeActionAccessibility,
  type CoreWildlifeCausalEvent,
  type CoreWildlifeFoodOpportunity,
  type CoreWildlifeIntentKind,
  type CoreWildlifeResourceClaim,
} from "./coreWildlifeActor";
import { repositionDogActor } from "./dogActor";
import type { DogActionAccessibility } from "./dogBehavior";
import { DOG_EXPOSURE_VERSION, type DogExposureSample } from "./dogExposure";
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
import { projectDogPresentation } from "./dogPresentation";
import { projectWildlifePresentation } from "./wildlifePresentation";
import {
  createLivingActorTraversabilitySurface,
  deriveLivingActorSearchProbe,
  resolveLivingActorLocomotion,
  type LivingActorTraversabilitySurface,
} from "./livingActorLocomotion";
import { ADRIFT_STAND_DEPTH } from "./adrift";
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
const GAME_SAVE_VERSION = 8;
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
  coreEcology: string;
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
const CORE_ECOLOGY_DEER_POPULATION_KEY = "wave-a/deer-herd";
const CORE_ECOLOGY_GULL_POPULATION_KEY = "wave-a/gull-flock";
const CORE_ECOLOGY_BEAR_POPULATION_KEY = "wave-a/black-bear";
const CORE_ECOLOGY_FORAGE_PROVISION = "dried-fish" as const;
const CORE_ECOLOGY_CONTACT_REACH_LOOSE_UNITS = Math.trunc(LOOSE_CARGO_TILE_UNITS * 3 / 4);
const CORE_ECOLOGY_MOVE_STEP_UNITS = Math.trunc(WORLD_POSITION_UNITS_PER_TILE * 3 / 4);

function bigintAbs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

type RuntimeCoreWildlifeTarget = LivingActorTargetUIView & {
  readonly species: CoreWildlifeSpecies;
};

interface RuntimeBio0PorterVisualFrame {
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
): CoreEcologyPatchState {
  const origin = bio0.porterAddress.position;
  let patch = createCoreEcologyPatch({
    seed: world.meta.rootSeed,
    patchKey: CORE_ECOLOGY_PATCH_KEY,
    originRegion: origin.region,
    tick: world.meta.completedTick,
    populations: [
      {
        species: "deer",
        populationKey: CORE_ECOLOGY_DEER_POPULATION_KEY,
        members: [
          {
            populationOrdinal: 0,
            position: translateWorldPosition(
              origin,
              5 * WORLD_POSITION_UNITS_PER_TILE,
              2 * WORLD_POSITION_UNITS_PER_TILE,
            ),
            heading: 625_000,
            materialization: "materialized",
          },
          {
            populationOrdinal: 1,
            position: translateWorldPosition(
              origin,
              6 * WORLD_POSITION_UNITS_PER_TILE,
              3 * WORLD_POSITION_UNITS_PER_TILE,
            ),
            heading: 590_000,
            materialization: "materialized",
          },
        ],
      },
      {
        species: "gull",
        populationKey: CORE_ECOLOGY_GULL_POPULATION_KEY,
        members: [0, 1, 2].map((populationOrdinal) => ({
          populationOrdinal,
          position: translateWorldPosition(
            origin,
            (2 + populationOrdinal) * WORLD_POSITION_UNITS_PER_TILE,
            (-2 + (populationOrdinal % 2)) * WORLD_POSITION_UNITS_PER_TILE,
          ),
          heading: 110_000 + populationOrdinal * 70_000,
          materialization: "materialized" as const,
        })),
      },
      {
        species: "black-bear",
        populationKey: CORE_ECOLOGY_BEAR_POPULATION_KEY,
        members: [{
          populationOrdinal: 0,
          position: translateWorldPosition(
            origin,
            9 * WORLD_POSITION_UNITS_PER_TILE,
            2 * WORLD_POSITION_UNITS_PER_TILE,
          ),
          heading: 500_000,
          materialization: "materialized",
        }],
      },
    ],
  });
  const bearMember = patch.populations
    .find(({ species }) => species === "black-bear")
    ?.members[0];
  if (bearMember === undefined) {
    throw new Error("Wave-A ecology creation lost its black bear");
  }
  const hungryBear = replaceCoreWildlifeActorPhysiology(bearMember.actor, {
    atTick: world.meta.completedTick,
    needs: { ...bearMember.actor.needs, hunger: Math.max(680_000, bearMember.actor.needs.hunger) },
    condition: bearMember.actor.condition,
  });
  patch = replaceCoreEcologyActor(patch, hungryBear);
  return patch;
}

function canonicalRuntimeCoreEcology(
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
  const expected = createRuntimeCoreEcology(world, bio0);
  if (
    stableStringify(state.originRegion) !== stableStringify(expected.originRegion)
    || state.populations.length !== expected.populations.length
  ) return null;
  for (let index = 0; index < expected.populations.length; index += 1) {
    const actualPopulation = state.populations[index];
    const expectedPopulation = expected.populations[index];
    if (
      actualPopulation === undefined
      || expectedPopulation === undefined
      || actualPopulation.species !== expectedPopulation.species
      || actualPopulation.populationKey !== expectedPopulation.populationKey
      || actualPopulation.populationSize !== expectedPopulation.populationSize
      || actualPopulation.members.length !== expectedPopulation.members.length
    ) return null;
    for (let memberIndex = 0; memberIndex < expectedPopulation.members.length; memberIndex += 1) {
      const actual = actualPopulation.members[memberIndex];
      const baseline = expectedPopulation.members[memberIndex];
      if (
        actual === undefined
        || baseline === undefined
        || actual.populationOrdinal !== baseline.populationOrdinal
        || stableStringify(actual.actor.identity) !== stableStringify(baseline.actor.identity)
      ) return null;
    }
  }
  return state;
}

function seedRuntimeCoreEcologyProvision(
  state: PhysicalCargoState,
  ecology: CoreEcologyPatchState,
): PhysicalCargoState {
  const bear = ecology.populations
    .find(({ species }) => species === "black-bear")
    ?.members[0]?.actor;
  if (bear === undefined) throw new Error("Wave-A forage seed requires its black bear");
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
  return commitPhysicalCargoRegionalMutation(state, {
    looseWorld: dropped.world,
    carrier: state.carrier,
    committedSourceOrdinal: source.ordinal,
  }, {
    kind: "delta",
    removed: [],
    added: [dropped.entity.payload],
  });
}

function runtimeCoreFoodEvidence(
  actor: CoreWildlifeActorState,
  state: PhysicalCargoState,
  world: WorldView,
  tick: number,
): Readonly<{
  observations: readonly ActorObservation[];
  opportunities: readonly CoreWildlifeFoodOpportunity[];
}> | null {
  if (actor.identity.species === "deer") {
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
      }));
    }
  }
  candidates.sort((left, right) => (
    left.distanceUnits - right.distanceUnits
    || (left.entityId < right.entityId ? -1 : left.entityId > right.entityId ? 1 : 0)
  ));
  const observations: ActorObservation[] = [];
  const opportunities: CoreWildlifeFoodOpportunity[] = [];
  for (const candidate of candidates.slice(0, CORE_WILDLIFE_MAX_FOOD_OPPORTUNITIES)) {
    const sight = evaluateVisualContact({
      columns: world.terrain.width,
      rows: world.terrain.height,
      cells,
      observerTileIndex,
      targetTileIndex: candidate.targetTileIndex,
      observerFacingRadians: headingToRadians(actor.address.heading),
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
      perceivedClass: "exposed-food",
      subjectId: candidate.entityId,
      area: { center: candidate.position, radiusUnits: 0 },
      confidence: clamp(Math.round(sight.confidence * FIXED_POINT), 0, FIXED_POINT),
      salience: actor.identity.species === "black-bear" ? 880_000 : 720_000,
      identification: "identified",
    });
    if (observation === null) return null;
    observations.push(observation);
    opportunities.push(Object.freeze({
      resourceId: candidate.entityId,
      observationId,
      foodClass: "exposed-food",
      sourceKind: "physical-item",
      availableUnits: candidate.quantity,
      nutrition: 820_000,
      effort: clamp(
        Math.round(candidate.distanceUnits
          / (10 * WORLD_POSITION_UNITS_PER_TILE) * FIXED_POINT),
        0,
        FIXED_POINT,
      ),
      risk: 60_000,
      competition: 0,
      directlyConfirmed: true,
      // A multi-unit stack needs a separate split transaction; never advertise
      // it as consumable and then let cognition loop on a rejected claim.
      accessible: candidate.quantity === 1,
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
): readonly CoreWildlifeFoodOpportunity[] {
  if (actor.identity.species !== "black-bear") return Object.freeze([]);
  const opportunities: CoreWildlifeFoodOpportunity[] = [];
  for (const observation of observations) {
    if (
      observation.channel !== "vision"
      || observation.perceivedClass !== "live-prey"
      || observation.subjectId === null
      || observation.identification !== "identified"
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
  state: CoreEcologyPatchState,
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
] satisfies readonly CoreWildlifeIntentKind[]);

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
  ) return focus === null ? Object.freeze([]) : Object.freeze([focus.area]);
  if (!RUNTIME_CORE_ESCAPE_INTENTS.has(actor.intent.kind)) {
    return Object.freeze([]);
  }

  let preferredX = 0;
  let preferredY = 0;
  if (focus !== null) {
    try {
      const delta = worldPositionDelta(actor.address.position, focus.area.center);
      preferredX = -delta.x;
      preferredY = -delta.y;
    } catch {
      return Object.freeze([]);
    }
  }
  if (preferredX === 0 && preferredY === 0) {
    const facing = headingToRadians(actor.address.heading);
    preferredX = -Math.cos(facing);
    preferredY = -Math.sin(facing);
  }

  const directions = [
    { x: -1, y: -1, ordinal: 0 },
    { x: 0, y: -1, ordinal: 1 },
    { x: 1, y: -1, ordinal: 2 },
    { x: -1, y: 0, ordinal: 3 },
    { x: 1, y: 0, ordinal: 4 },
    { x: -1, y: 1, ordinal: 5 },
    { x: 0, y: 1, ordinal: 6 },
    { x: 1, y: 1, ordinal: 7 },
  ].map((direction) => ({
    ...direction,
    alignment: (direction.x * preferredX + direction.y * preferredY)
      / Math.hypot(direction.x, direction.y),
  })).sort((left, right) => right.alignment - left.alignment || left.ordinal - right.ordinal);
  const targets: Array<Readonly<{
    center: CoreWildlifeActorState["address"]["position"];
    radiusUnits: number;
  }>> = [];
  for (const direction of directions) {
    for (let distanceTiles = 4; distanceTiles >= 1; distanceTiles -= 1) {
      try {
        targets.push(Object.freeze({
          center: translateWorldPosition(
            actor.address.position,
            direction.x * distanceTiles * WORLD_POSITION_UNITS_PER_TILE,
            direction.y * distanceTiles * WORLD_POSITION_UNITS_PER_TILE,
          ),
          radiusUnits: 0,
        }));
      } catch {
        // The remaining signed-world candidates may still be canonical.
      }
    }
  }
  return Object.freeze(targets);
}

function createRuntimeCoreTraversability(
  actor: CoreWildlifeActorState,
  world: WorldView,
  sampledAtTick: number,
): LivingActorTraversabilitySurface | null {
  const origin = regionalAddressAt(world, 0);
  if (origin === null) return null;
  try {
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
            travelCost: clamp(tile.baseTravelCost, 1, FIXED_POINT),
          }),
    });
  } catch {
    return null;
  }
}

function runtimeCoreActionAccessibility(
  actor: CoreWildlifeActorState,
  world: WorldView,
  tick: number,
): CoreWildlifeActionAccessibility | null {
  if (actor.identity.species === "gull") return CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE;
  const surface = createRuntimeCoreTraversability(actor, world, tick);
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
  // Moving intents begin as conditionally available. The selected intent is
  // refined against its exact routed target below before any event is accepted.
  const canAttemptMovement = canStand;
  return Object.freeze({
    disengage: canAttemptMovement,
    flee: canAttemptMovement,
    alarm: true,
    retreat: canAttemptMovement,
    guard: canStand,
    scavenge: canStand,
    forage: canStand,
    pursue: canAttemptMovement,
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
  if (actor.identity.species === "gull") return opportunities;
  const surface = createRuntimeCoreTraversability(actor, world, tick);
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
      maximumStepUnits: CORE_ECOLOGY_MOVE_STEP_UNITS,
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
  state: CoreEcologyPatchState,
  world: WorldView,
  tick: number,
): Readonly<{
  patch: CoreEcologyPatchState;
  blocked: readonly RuntimeCoreBlockedMovement[];
}> | null {
  let patch = state;
  const blocked: RuntimeCoreBlockedMovement[] = [];
  for (const member of state.populations.flatMap(({ members }) => members)
    .filter(({ materialization }) => materialization === "materialized")
    .sort((left, right) => left.actor.identity.stableId < right.actor.identity.stableId ? -1 : 1)) {
    const actor = coreEcologyActor(patch, member.actor.identity.stableId);
    if (actor === null) return null;
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
    if (actor.identity.species === "gull") {
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
        const distance = Math.min(CORE_ECOLOGY_MOVE_STEP_UNITS, magnitude);
        const moveX = Math.round(delta.x / magnitude * distance);
        const moveY = Math.round(delta.y / magnitude * distance);
        try {
          patch = replaceCoreEcologyActor(patch, repositionCoreWildlifeActor(actor, {
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
      if (!resolved) {
        blocked.push(Object.freeze({
          actorId: actor.identity.stableId,
          intent: actor.intent.kind,
        }));
      }
      continue;
    }
    const surface = createRuntimeCoreTraversability(actor, world, tick);
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
        maximumStepUnits: CORE_ECOLOGY_MOVE_STEP_UNITS,
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
        patch = replaceCoreEcologyActor(patch, repositionCoreWildlifeActor(actor, {
          atTick: tick,
          position: resolution.actor.position,
          heading: resolution.actor.heading,
        }));
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

function stepRuntimeCoreEcology(
  state: CoreEcologyPatchState,
  world: WorldState,
  bio0: Bio0EcologyState,
  perceptionView: WorldView,
  movementView: WorldView,
  physicalCargo: PhysicalCargoState,
  observationBatches: readonly (readonly CoreEcologyObservationBatch[])[],
): Readonly<{
  patch: CoreEcologyPatchState;
  events: readonly CoreWildlifeCausalEvent[];
  resourceClaims: readonly CoreWildlifeResourceClaim[];
}> | null {
  const actorSteps: Array<{
    actorId: string;
    observations: readonly ActorObservation[];
    foodOpportunities: readonly CoreWildlifeFoodOpportunity[];
    accessibility: typeof CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE;
  }> = [];
  for (const { actor } of state.populations.flatMap(({ members }) => members)
    .filter(({ materialization }) => materialization === "materialized")) {
    const sharedObservations = mergeRuntimeCoreObservationBatches(
      actor.identity.stableId,
      observationBatches,
    );
    const food = runtimeCoreFoodEvidence(
      actor,
      physicalCargo,
      perceptionView,
      world.meta.completedTick,
    );
    if (sharedObservations === null || food === null) return null;
    const observations = canonicalizeActorObservations([
      ...sharedObservations,
      ...food.observations,
    ]);
    if (observations.length !== sharedObservations.length + food.observations.length) return null;
    const livingFood = runtimeCoreLivingFoodOpportunities(actor, sharedObservations);
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
    if (reachableFood === null || accessibility === null) return null;
    actorSteps.push({
      actorId: actor.identity.stableId,
      observations,
      foodOpportunities: reachableFood,
      accessibility,
    });
  }
  let stepped = stepCoreEcologyPatch(state, {
    tick: world.meta.completedTick,
    actorSteps,
  });
  if (stepped === null) return null;
  let moved: CoreEcologyPatchState | null = null;
  for (let refinement = 0; refinement <= CORE_WILDLIFE_INTENTS.length; refinement += 1) {
    const locomotion = resolveRuntimeCoreLocomotion(
      stepped.patch,
      movementView,
      world.meta.completedTick,
    );
    if (locomotion === null) return null;
    if (locomotion.blocked.length === 0) {
      moved = locomotion.patch;
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
      moved = locomotion.patch;
      break;
    }
    stepped = stepCoreEcologyPatch(state, {
      tick: world.meta.completedTick,
      actorSteps,
    });
    if (stepped === null) return null;
  }
  if (moved === null) return null;
  const canonical = canonicalRuntimeCoreEcology(moved, world, bio0);
  return canonical === null ? null : Object.freeze({
    patch: canonical,
    events: stepped.events,
    resourceClaims: stepped.resourceClaims,
  });
}

function resolveRuntimeCoreResourceClaims(
  state: CoreEcologyPatchState,
  cargoState: PhysicalCargoState,
  claims: readonly CoreWildlifeResourceClaim[],
  world: WorldState,
  bio0: Bio0EcologyState,
): Readonly<{
  patch: CoreEcologyPatchState;
  physicalCargo: PhysicalCargoState;
  consumed: readonly Readonly<{ actorId: string; resourceId: string }>[];
}> | null {
  let patch = state;
  let physicalCargo = cargoState;
  const consumed: Array<Readonly<{ actorId: string; resourceId: string }>> = [];
  const orderedClaims = [...claims].sort((left, right) => (
    left.resourceId < right.resourceId
      ? -1
      : left.resourceId > right.resourceId
        ? 1
        : left.actorId < right.actorId
          ? -1
          : left.actorId > right.actorId
            ? 1
            : 0
  ));
  for (const claim of orderedClaims) {
    const actor = coreEcologyActor(patch, claim.actorId);
    const located = locatePhysicalCargoEntity(physicalCargo, claim.resourceId);
    if (actor === null || located === null || located.entity.payload.kind !== "provision") continue;
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
      patch = replaceCoreEcologyActor(patch, replaceCoreWildlifeActorPhysiology(actor, {
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
    }));
  }
  const canonical = canonicalRuntimeCoreEcology(patch, world, bio0);
  return canonical === null ? null : Object.freeze({
    patch: canonical,
    physicalCargo,
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

function runtimeBio0DogVisualObservations(
  world: WorldView,
  window: RegionalPlayerTravelState["window"],
  porterAddress: Bio0PorterAddress,
  dogAddress: LivingActorAddress,
  tick: number,
): readonly ActorObservation[] | null {
  const observer = livingActorAddressInRegionalWindow(porterAddress, window);
  const subject = livingActorAddressInRegionalWindow(dogAddress, window);
  if (observer === null || subject === null) return null;
  const targetTile = world.terrain.tiles[subject.tileIndex];
  if (targetTile === undefined) return null;
  const targetLightVisibility = targetTile.terrain === "marsh"
    ? 0.55
    : targetTile.terrain === "ridge" || targetTile.terrain === "deep-water"
      ? 0.9
      : 0.72;
  const sight = evaluateVisualContact({
    columns: world.terrain.width,
    rows: world.terrain.height,
    cells: runtimeLivingActorPerceptionCells(world),
    observerTileIndex: observer.tileIndex,
    targetTileIndex: subject.tileIndex,
    observerFacingRadians: headingToRadians(porterAddress.heading),
    weatherVisibility: clamp(1 - world.weather.intensity / FIXED_POINT * 0.52, 0, 1),
    targetMovementSalience: 0,
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
  const origin = regionalAddressAt(world, 0);
  if (origin === null) return null;
  return createLivingActorTraversabilitySurface({
    forActorId: state.dog.identity.stableId,
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
  const point = worldPositionToSpatialFrame(frame, state.dog.address.position);
  if (point === null) return null;
  const x = Math.floor(point.x / WORLD_POSITION_UNITS_PER_TILE);
  const y = Math.floor(point.y / WORLD_POSITION_UNITS_PER_TILE);
  return y * surface.widthTiles + x;
}

function runtimeBio0HasTraversableStep(
  state: Bio0EcologyState,
  surface: LivingActorTraversabilitySurface,
): boolean {
  const index = runtimeBio0ActorTileIndex(state, surface);
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

function physicalCargoPartitionsForView(
  state: PhysicalCargoState,
  view: WorldView,
): readonly LooseCargoWorldState[] {
  return queryPhysicalCargoPartitions(state, regionalStorageRegionsInView(view)).worlds;
}

function inactiveCargoPartitions(
  state: PhysicalCargoState,
  partitions: readonly LooseCargoWorldState[],
): readonly LooseCargoWorldState[] {
  return partitions.filter((world) => world !== state.looseWorld);
}

export async function createTideweftRuntime(
  repository: SaveRepository = createSaveRepository(),
): Promise<TideweftRuntime> {
  let world = createWorld("quiet-delta", HARD_PRESSURE_MODE);
  let economyView = createWorldView(world);
  let bio0Ecology = createRuntimeBio0Ecology(world, economyView);
  let coreEcology = createRuntimeCoreEcology(world, bio0Ecology);
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
  physicalCargo = seedRuntimeCoreEcologyProvision(physicalCargo, coreEcology);
  let regionalTravel = migratePlayerToRegionalTravel(world.meta.rootSeed, player);
  let worldView = createRegionalWorldView(
    economyView,
    regionalTravel.window,
    { discovered: player.discovered, depthSoundings: player.depthSoundings },
  );
  let fieldResourceProjection: RegionalFieldResourceProjection =
    projectCompatibilityFieldResources(fieldResourceCatalog, worldView);
  let promiseJourney = createRegionalPromiseJourney();
  let session = createSessionState(world.meta.seedText, HARD_POSTURE);
  let perception = projectPerception(worldView, player);
  const initialCargoPartitions = physicalCargoPartitionsForView(physicalCargo, worldView);
  const initialDogPresentation = projectDogPresentation({
    actor: bio0Ecology.dog,
    window: {
      origin: regionalTravel.window.origin,
      terrain: {
        width: worldView.terrain.width,
        height: worldView.terrain.height,
      },
    },
    tileSize: RENDER_TILE_SIZE,
    detailVisibilityGrades: perception.detailVisibilityGrades,
  });
  let renderView = {
    ...projectGameView(worldView, player, {
      paused: true,
      traversalFeedback,
      looseCargoWorld: physicalCargo.looseWorld,
      looseCargoWorlds: initialCargoPartitions,
      perception,
    }),
    dogs: initialDogPresentation === null ? [] : [initialDogPresentation],
  };
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
    const dogPresentation = projectDogPresentation({
      actor: bio0Ecology.dog,
      window: actorWindow,
      tileSize: RENDER_TILE_SIZE,
      detailVisibilityGrades: perception.detailVisibilityGrades,
      selected: selectedDogActorId === bio0Ecology.dog.identity.stableId,
    });
    if (selectedDogActorId !== null && dogPresentation === null) {
      selectedDogActorId = null;
    }
    const wildlifePresentation = projectCoreEcologyWildlife({
      patch: coreEcology,
      window: actorWindow,
      perception,
      tileSize: RENDER_TILE_SIZE,
      selectedTarget: selectedWildlifeTarget,
    });
    if (wildlifePresentation === null) {
      throw new Error("Core wildlife presentation could not be projected");
    }
    if (
      selectedWildlifeTarget !== null
      && !wildlifePresentation.some(({ actorId, species }) => (
        actorId === selectedWildlifeTarget?.actorId
        && species === selectedWildlifeTarget?.species
      ))
    ) {
      selectedWildlifeTarget = null;
    }
    renderView = {
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
      dogs: dogPresentation === null ? [] : [dogPresentation],
      wildlife: wildlifePresentation,
    };
    // ABOUT is a live sensory affordance, not a durable remote tracker. Once
    // the selected person leaves direct detail perception, that selection is
    // discarded and cannot silently reappear after a region or camera change.
    if (
      selectedResidentId !== null
      && !renderView.porters.some((porter) => Number(porter.id) === selectedResidentId)
    ) {
      selectedResidentId = null;
    }
    const dogInspection = selectedDogActorId === bio0Ecology.dog.identity.stableId
      ? projectDogLivingActorInspection(bio0Ecology.dog, {
          perception,
          window: actorWindow,
      })
      : null;
    const rawDogInteractions = dogInspection === null
      ? null
      : projectLivingActorInteractionChoices({
          target: dogInspection.target,
          requestRecipientActorId: bio0Ecology.porterAddress.actorId,
          actors: [bio0Ecology.dog.address, bio0Ecology.porterAddress],
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
    const selectedWildlife = selectedWildlifeTarget === null
      ? null
      : selectedCoreEcologyActor(coreEcology, selectedWildlifeTarget);
    const wildlifeInspection = selectedWildlife === null
      ? null
      : projectWildlifeLivingActorInspection(selectedWildlife, {
          perception,
          window: actorWindow,
        });
    const coreActorAddresses = coreEcology.populations.flatMap(({ members }) => members
      .filter(({ materialization }) => materialization === "materialized")
      .map(({ actor }) => actor.address));
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
    bio0Visual: RuntimeBio0PorterVisualFrame | null = null,
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
        if (bio0Visual === null || resident.identity.stableId !== bio0Visual.actorId) {
          return {
            residentId: resident.id,
            actorId: resident.identity.stableId,
            observations: existing,
          };
        }
        const observations = canonicalizeActorObservations([
          ...existing,
          ...bio0Visual.observations,
        ]);
        if (observations.length !== existing.length + bio0Visual.observations.length) {
          throw new Error("BIO0 visual contact could not enter porter cognition");
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
      const coreEcologyForStep = setCoreEcologyMaterializationForWindow(
        coreEcology,
        {
          origin: regionalTravel.window.origin,
          terrain: {
            width: worldView.terrain.width,
            height: worldView.terrain.height,
          },
        },
        coreEcology.updatedAtTick,
      );
      if (coreEcologyForStep === null) {
        throw new Error("Core ecology materialization could not be resolved");
      }
      const materializedCoreActors = coreEcologyForStep.populations
        .flatMap(({ members }) => members)
        .filter(({ materialization }) => materialization === "materialized")
        .map(({ actor }) => actor);
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
        actors: materializedCoreActors,
        dogAddress: bio0Ecology.dog.address,
        porterAddress: priorPorter.address,
        playerAddress,
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
      const coreAlarmObservationBatches: Array<readonly CoreEcologyObservationBatch[]> = [];
      for (const alarm of runtimeCoreAlarmEvents(coreEcologyForStep)) {
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
      const dogVisualObservations = bio0Simulation.allowNewObservations
        ? runtimeBio0DogVisualObservations(
            worldView,
            regionalTravel.window,
            priorPorter.address,
            bio0Ecology.dog.address,
            targetTick,
          )
        : Object.freeze([] as ActorObservation[]);
      if (dogVisualObservations === null) {
        throw new Error("BIO0 dog visual contact could not be resolved");
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
        ...dogVisualObservations,
        ...porterCoreObservations,
      ]);
      if (
        porterWorldObservations.length
        !== dogVisualObservations.length + porterCoreObservations.length
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
      const coreStep = stepRuntimeCoreEcology(
        coreEcologyForStep,
        world,
        bio0Ecology,
        worldView,
        completedRegionalView,
        physicalCargo,
        coreObservationBatches,
      );
      if (coreStep === null) {
        throw new Error("Core ecology step rejected");
      }
      const playerEventTimeAlarmObservations: ActorObservation[] = [];
      for (const event of coreStep.events) {
        if (event.kind !== "alarm") continue;
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
      const resolvedCoreResources = resolveRuntimeCoreResourceClaims(
        coreStep.patch,
        physicalCargo,
        coreStep.resourceClaims,
        world,
        bio0Ecology,
      );
      if (resolvedCoreResources === null) {
        throw new Error("Core ecology physical resource claims could not be resolved");
      }
      coreEcology = resolvedCoreResources.patch;
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
      const witnessedCoreWildlife = projectCoreEcologyWildlife({
        patch: coreEcology,
        window: {
          origin: regionalTravel.window.origin,
          terrain: {
            width: worldView.terrain.width,
            height: worldView.terrain.height,
          },
        },
        perception: eventPerception,
        tileSize: RENDER_TILE_SIZE,
      });
      if (witnessedCoreWildlife === null) {
        throw new Error("Core ecology event perception could not be projected");
      }
      const witnessedCoreById = new Map(witnessedCoreWildlife.map((animal) => (
        [animal.actorId, animal] as const
      )));
      const lawfullyHeardAlarm = canonicalPlayerEventTimeAlarms.some((observation) => (
        observation.channel === "hearing"
        && observation.perceivedClass === "animal-alarm"
      ));
      for (const consumption of resolvedCoreResources.consumed) {
        const animal = witnessedCoreById.get(consumption.actorId);
        if (animal === undefined) continue;
        announce(
          session,
          `${animal.identityLabel} takes the exposed food. The physical parcel is gone.`,
        );
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
        }
      }
      // Keep the non-audio equivalent after ordinary ecology narration so a
      // simultaneous food event cannot erase a sound the player lawfully
      // heard. Later urgent traversal warnings may still take precedence.
      if (lawfullyHeardAlarm) {
        soundscape.play("wildlife-alarm", 0.44);
        announce(session, "ANIMAL ALARM — source unclear.");
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
        } else if (perceivedCommand.entity === "porter" && perceivedCommand.id) {
          const residentId = Number(perceivedCommand.id);
          const visiblePorter = renderView.porters.find((porter) => porter.id === perceivedCommand.id);
          const resident = economyView.residents.find((candidate) => candidate.id === residentId);
          if (visiblePorter && resident) {
            selectedResidentId = residentId;
            selectedDogActorId = null;
            selectedWildlifeTarget = null;
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
          && perceivedCommand.id === bio0Ecology.dog.identity.stableId
          && renderView.dogs?.some(({ actorId }) => actorId === perceivedCommand.id)
        ) {
          selectedDogActorId = perceivedCommand.id;
          selectedWildlifeTarget = null;
          selectedResidentId = null;
          session.selectedSettlementId = null;
        } else if (
          perceivedCommand.entity === "living-actor"
          && perceivedCommand.species !== "domestic-dog"
          && renderView.wildlife?.some(({ actorId, species }) => (
            actorId === perceivedCommand.id && species === perceivedCommand.species
          ))
          && selectedCoreEcologyActor(coreEcology, {
            species: perceivedCommand.species,
            actorId: perceivedCommand.id,
          }) !== null
        ) {
          selectedWildlifeTarget = {
            species: perceivedCommand.species,
            actorId: perceivedCommand.id,
          };
          selectedDogActorId = null;
          selectedResidentId = null;
          session.selectedSettlementId = null;
        } else if (perceivedCommand.entity === "world") {
          session.selectedSettlementId = null;
          selectedResidentId = null;
          selectedDogActorId = null;
          selectedWildlifeTarget = null;
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
    const focusAddress = effect.focusActorId === bio0Ecology.dog.identity.stableId
      ? bio0Ecology.dog.address
      : coreEcologyActor(coreEcology, effect.focusActorId)?.address;
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
    const isDog = command.target.species === "domestic-dog"
      && command.target.actorId === selectedDogActorId
      && command.target.actorId === bio0Ecology.dog.identity.stableId;
    const wildlifeActor = command.target.species === "domestic-dog"
      ? null
      : selectedWildlifeTarget?.species === command.target.species
          && selectedWildlifeTarget.actorId === command.target.actorId
        ? selectedCoreEcologyActor(coreEcology, selectedWildlifeTarget)
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
    if (isDog) {
      try {
        porter = runtimeBio0Porter(economyView, bio0Ecology.porterAddress.actorId);
      } catch {
        return;
      }
    }
    const focusActorId = isDog
      ? bio0Ecology.dog.identity.stableId
      : wildlifeActor!.identity.stableId;
    const focusAddress = isDog ? bio0Ecology.dog.address : wildlifeActor!.address;
    const currentPerception = projectPerception(worldView, player);
    const issuedAtTick = world.meta.completedTick;
    let spec: LivingActorPlayerChoiceSpec;
    switch (command.interaction) {
      case "help":
        if (!isDog || porter === null) return;
        spec = {
          kind: "ask-offer-provision",
          issuedAtTick,
          custodianActorId: porter.address.actorId,
          beneficiaryActorId: bio0Ecology.dog.identity.stableId,
          containerId: bio0Ecology.foodSource.providerContainerId,
        };
        break;
      case "secure-food":
        if (!isDog || porter === null) return;
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
          : [bio0Ecology.dog.address, porter.address],
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
    coreEcology = createRuntimeCoreEcology(world, bio0Ecology);
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
    physicalCargo = seedRuntimeCoreEcologyProvision(physicalCargo, coreEcology);
    regionalTravel = migratePlayerToRegionalTravel(world.meta.rootSeed, player);
    promiseJourney = createRegionalPromiseJourney();
    rebuildRegionalWorldView();
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
    const coreEcologySnapshot = canonicalRuntimeCoreEcology(
      coreEcology,
      worldSnapshot,
      bio0EcologySnapshot,
    );
    if (coreEcologySnapshot === null) {
      throw new Error("Refusing to save inconsistent core ecology state");
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
      coreEcology: serializeCoreEcologyPatch(coreEcologySnapshot),
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
  readonly coreEcology: CoreEcologyPatchState;
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
        ) throw new Error("Current save envelope is not canonical");
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
    const coreEcology = decoded.version >= GAME_SAVE_VERSION
      ? canonicalRuntimeCoreEcology(
          deserializeCoreEcologyPatch(decoded.coreEcology),
          world,
          bio0Ecology,
        )
      : createRuntimeCoreEcology(world, bio0Ecology);
    if (coreEcology === null) {
      throw new Error("Current save contains invalid core ecology state");
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
    const loadedPhysicalCargo = decoded.version >= GAME_SAVE_VERSION
      ? physicalCargoValidation.state
      : seedRuntimeCoreEcologyProvision(physicalCargoValidation.state, coreEcology);
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
      coreEcology,
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

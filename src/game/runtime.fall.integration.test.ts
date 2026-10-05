import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import { createWorldView, deserializeWorld, serializeWorld } from "../sim/public";
import {
  createRegionCoord,
  regionKey,
  regionLocalToGlobalTile,
} from "../sim/regions";
import type { RootSeed } from "../sim/rng";
import { FIXED_POINT, type WorldState } from "../sim/types";
import type { FieldResourceEcologyState } from "../sim/fieldResources";
import type { TideweftView } from "../render/types";
import {
  actorCalloutViewport,
  layoutAcousticTextCallouts,
} from "../render/playerPresentation";
import { acousticTextRectsOverlap } from "../render/acousticTextLayout";
import { stableStringify } from "../sim/util";
import * as humanPerception from "./humanPerception";
import * as uiProjection from "./uiProjection";
import {
  replaceDogActorCircadian,
  replaceDogActorPhysiology,
  repositionDogActor,
} from "./dogActor";
import {
  deserializeDogActorRoster,
  replaceDogActorInRoster,
  serializeDogActorRoster,
} from "./dogActorRoster";
import { deserializeSettlementEcologyState } from "./settlementEcology";
import { deserializeSettlementWorkingAnimalState } from "./settlementWorkingAnimals";
import { projectSettlementWorkingDogCircadian } from "./settlementWorkingDogCircadian";
import { livingActorAddressInRegionalWindow } from "./livingActor";
import { evaluateAudibleContact, VISIBILITY_DIRECT } from "./perception";
import { projectPerception } from "./projection";
import { PLAYER_MOVEMENT_STAMINA_GATE, TILE_UNITS, stepPlayer, type PlayerState } from "./player";
import {
  gameSaveEnvelopeIntegrity,
  type SerializedPhysicalCargoState,
} from "./physicalCargoState";
import {
  capturePlayerRegionalTravel,
  recenterRegionalPlayer,
  restorePlayerRegionalTravel,
  serializePlayerRegionalTravel,
  type RegionalPlayerTravelState,
} from "./regionalPlayerTravel";
import type { RegionalPromiseJourneyState } from "./regionalPromiseJourney";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
  REGIONAL_TRAVEL_SAFE_MAX_X,
  REGIONAL_TRAVEL_SAFE_MAX_Y,
  REGIONAL_TRAVEL_SAFE_MIN_X,
  REGIONAL_TRAVEL_SAFE_MIN_Y,
  regionLocalToWindowTile,
  regionTileIndexToWindowIndex,
  shiftedRegionalFrameOrigin,
  type RegionalTerrainWindow,
} from "./regionalTravel";
import {
  putRegionalEcologyResidentDeviation,
} from "./regionalEcology";
import {
  regionalEcologyRegionalResidentsForActiveRegions,
  type RegionalEcologyActiveResidentInput,
} from "./regionalEcologyState";
import {
  deserializeRegionalEcologyStateV6,
  replaceRegionalEcologyStateV6ActiveState,
  serializeRegionalEcologyStateV6,
} from "./regionalEcologyStateV6";
import {
  createRegionalWorldView,
  regionalStorageRegionsInView,
} from "./regionalWorldView";
import { playerWorldPositionInRegionalWindow } from "./residentSpatial";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import type { PorterResponseState } from "./porterResponse";
import type { GameSessionState } from "./sessionTypes";
import type { TraversalFeedbackState } from "./traversalFeedback";
import type { SituatedExpressionChannelBank } from "./situatedExpressionChannelBank";
import type { SituatedExpressionAdmissionLedger } from "./situatedExpressionAdmissionLedger";
import type { SituatedExpressionCausalAuthorityLedger } from "./situatedExpressionCausalAuthority";
import { createSituatedExpressionCausalAuthorityRecord } from "./situatedExpressionCausalAuthority";
import type { PlayerStepStateAnchor, PlayerStepStateSample } from "./playerStepState";
import type { PlayerExpressionRecencyState } from "./playerExpressionRecency";
import type { PlayerEffortRecencyState } from "./playerEffortRecency";
import { situatedExpressionCooldownSteps } from "./situatedExpression";
import * as expressionChannelBank from "./situatedExpressionChannelBank";
import * as expressionDiagnostics from "./situatedExpressionDiagnostics";
import * as dogExpression from "./dogSignalExpression";
import { translateWorldPosition, worldPositionDelta, type WorldPosition } from "./worldPosition";

const soundscapePlay = vi.hoisted(() => vi.fn());
vi.mock("../audio/soundscape", () => ({
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(...args: unknown[]): void { soundscapePlay(...args); }
    updateAmbience(): void {}
    destroy(): void {}
  },
}));

interface CurrentGameSaveEnvelope {
  readonly format: "tideweft-session";
  readonly version: 49;
  readonly world: string;
  readonly player: PlayerState;
  readonly session: GameSessionState;
  readonly fieldResources: FieldResourceEcologyState;
  readonly traversalFeedback: TraversalFeedbackState;
  readonly physicalCargo: SerializedPhysicalCargoState;
  readonly regionalTravel: string;
  readonly promiseJourney: RegionalPromiseJourneyState;
  readonly playerExpressionRecency: PlayerExpressionRecencyState;
  readonly perceptionCarry: {
    readonly version: 14;
    readonly intervalStartPosition: WorldPosition;
    readonly intervalStartFacingMilliRadians: number;
    readonly intervalStartWasSleeping: boolean;
    readonly playerStepsSinceWorldTick: number;
    readonly playerSenseSamples: readonly humanPerception.PlayerSenseSample[];
    readonly playerStepStateSamples: readonly (PlayerStepStateSample | null)[];
    readonly playerStepStateAnchor: PlayerStepStateAnchor;
    readonly actorVocalizationSamples: readonly humanPerception.SupplementalSoundSample[];
    readonly animalContactAcousticCarry: unknown;
    readonly situatedExpressionChannels: SituatedExpressionChannelBank;
    readonly situatedExpressionAdmissions: SituatedExpressionAdmissionLedger;
    readonly situatedExpressionCausalAuthority: SituatedExpressionCausalAuthorityLedger;
    readonly nextPlayerSenseSampleOrdinal: number;
  };
  readonly bio0Ecology: string;
  readonly regionalEcology: string;
  readonly settlementEcology: string;
  readonly dogActorRoster: string;
  readonly settlementWorkingAnimals: string;
  readonly settlementDomesticAnimalRecovery: string;
  readonly porterResponse: PorterResponseState;
  readonly integrity: string;
}

interface RidgeCorner {
  readonly startTileIndex: number;
  readonly ridgeTileIndex: number;
  readonly diagonalTileIndex: number;
  readonly x: number;
  readonly y: number;
}

class MemoryRepository implements SaveRepository {
  constructor(private record?: SaveRecord) {}

  async list() {
    return [];
  }

  async load(slotId: string) {
    return slotId === "autosave" && this.record
      ? structuredClone(this.record)
      : undefined;
  }

  async save(record: SaveRecord) {
    this.record = structuredClone(record);
  }

  async remove() {
    this.record = undefined;
  }

  snapshot(): SaveRecord {
    if (!this.record) throw new Error("fall integration fixture has no autosave");
    return structuredClone(this.record);
  }

  replace(record: SaveRecord): void {
    this.record = structuredClone(record);
  }
}

let scheduledFrame: ((now: number) => void) | undefined;
let nextFrameTime = 100;

beforeEach(() => {
  scheduledFrame = undefined;
  nextFrameTime = 100;
  soundscapePlay.mockClear();
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: (now: number) => void) => {
    scheduledFrame = callback;
    return 1;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function advancePlayerSteps(runtime: TideweftRuntime, count: number): void {
  runtime.start();
  // The first requested frame establishes the clock. Each later 100 ms frame
  // advances exactly one authoritative fixed step.
  for (let frame = 0; frame <= count; frame += 1) {
    const callback = scheduledFrame;
    if (!callback) throw new Error("runtime did not schedule its next frame");
    scheduledFrame = undefined;
    callback(nextFrameTime);
    nextFrameTime += 100;
  }
  runtime.stop();
}

function decodeCurrent(record: SaveRecord): CurrentGameSaveEnvelope {
  const envelope = JSON.parse(record.worldJson) as CurrentGameSaveEnvelope;
  if (
    envelope.format !== "tideweft-session"
    || envelope.version !== 49
    || record.payloadVersion !== 49
  ) {
    throw new Error("fixture did not produce a current v49 regional session save");
  }
  return envelope;
}

function reseal(envelope: CurrentGameSaveEnvelope): CurrentGameSaveEnvelope {
  const { integrity: _priorIntegrity, ...unsealed } = envelope;
  return {
    ...unsealed,
    integrity: gameSaveEnvelopeIntegrity(unsealed),
  };
}

function replaceEnvelope(
  repository: MemoryRepository,
  envelope: CurrentGameSaveEnvelope,
): void {
  const record = repository.snapshot();
  const sealed = reseal(envelope);
  repository.replace({
    ...record,
    payloadVersion: 49,
    updatedAt: record.updatedAt + 1,
    worldJson: JSON.stringify(sealed),
  });
}

function findRidgeCorner(world: WorldState, window: RegionalTerrainWindow): RidgeCorner {
  const occupied = new Set(world.settlements.map(({ tileIndex }) => tileIndex));
  const { width, height, tiles } = world.terrain;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 2; x += 1) {
      const startTileIndex = y * width + x;
      const ridgeTileIndex = startTileIndex + 1;
      const diagonalTileIndex = ridgeTileIndex + width;
      const start = tiles[startTileIndex];
      const ridge = tiles[ridgeTileIndex];
      const diagonal = tiles[diagonalTileIndex];
      if (
        !start
        || !ridge
        || !diagonal
        || ridge.terrain !== "ridge"
        || occupied.has(startTileIndex)
        || occupied.has(ridgeTileIndex)
        || occupied.has(diagonalTileIndex)
      ) continue;
      const point = regionLocalToWindowTile(
        window,
        createRegionCoord(0, 0),
        x,
        y,
      );
      if (point === null) continue;
      const alignedOrigin = shiftedRegionalFrameOrigin(window, point.x, point.y);
      const global = regionLocalToGlobalTile(createRegionCoord(0, 0), x, y);
      const alignedX = global.x - alignedOrigin.x;
      const alignedY = global.y - alignedOrigin.y;
      if (
        alignedX < REGIONAL_TRAVEL_SAFE_MIN_X
        || alignedX >= REGIONAL_TRAVEL_SAFE_MAX_X
        || alignedY < REGIONAL_TRAVEL_SAFE_MIN_Y
        || alignedY >= REGIONAL_TRAVEL_SAFE_MAX_Y
      ) continue;
      return { startTileIndex, ridgeTileIndex, diagonalTileIndex, x, y };
    }
  }
  throw new Error("generated world did not contain an unoccupied diagonal ridge corner");
}

function moveFixtureFrameToCompatibilityTile(
  rootSeed: RootSeed,
  initial: RegionalPlayerTravelState,
  player: PlayerState,
  localX: number,
  localY: number,
): RegionalPlayerTravelState {
  const region = createRegionCoord(0, 0);
  const target = regionLocalToGlobalTile(region, localX, localY);
  let state = initial;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const point = regionLocalToWindowTile(state.window, region, localX, localY);
    if (point !== null) {
      player.x = point.x * TILE_UNITS + TILE_UNITS / 2;
      player.y = point.y * TILE_UNITS + TILE_UNITS / 2;
      player.previousX = player.x;
      player.previousY = player.y;
      const index = point.y * REGIONAL_TRAVEL_COLUMNS + point.x;
      player.currentTrace = [index];
      player.surveyTrace = [index];
      return recenterRegionalPlayer(rootSeed, state, player).state;
    }
    const currentX = Math.floor(player.x / TILE_UNITS);
    const currentY = Math.floor(player.y / TILE_UNITS);
    const triggerX = target.x < state.window.origin.x
      ? REGIONAL_TRAVEL_SAFE_MIN_X - 1
      : target.x > state.window.origin.x + REGIONAL_TRAVEL_COLUMNS - 1
        ? REGIONAL_TRAVEL_SAFE_MAX_X + 1
        : Math.min(REGIONAL_TRAVEL_SAFE_MAX_X, Math.max(REGIONAL_TRAVEL_SAFE_MIN_X, currentX));
    const triggerY = target.y < state.window.origin.y
      ? REGIONAL_TRAVEL_SAFE_MIN_Y - 1
      : target.y > state.window.origin.y + REGIONAL_TRAVEL_ROWS - 1
        ? REGIONAL_TRAVEL_SAFE_MAX_Y + 1
        : Math.min(REGIONAL_TRAVEL_SAFE_MAX_Y, Math.max(REGIONAL_TRAVEL_SAFE_MIN_Y, currentY));
    player.x = triggerX * TILE_UNITS + TILE_UNITS / 2;
    player.y = triggerY * TILE_UNITS + TILE_UNITS / 2;
    player.previousX = player.x;
    player.previousY = player.y;
    const triggerIndex = triggerY * REGIONAL_TRAVEL_COLUMNS + triggerX;
    player.currentTrace = [triggerIndex];
    player.surveyTrace = [triggerIndex];
    state = recenterRegionalPlayer(rootSeed, state, player).state;
  }
  throw new Error("fixture could not align its frame with the ridge");
}

function rebaseFixtureRegionalEcology(
  serialized: string,
  rootSeed: RootSeed,
  spatial: ReturnType<typeof createWorldView>,
): string {
  const priorV6 = deserializeRegionalEcologyStateV6(serialized);
  if (priorV6 === null) throw new Error("fixture started with invalid regional ecology");
  const priorV5 = priorV6.base;
  const priorV4 = priorV5.base;
  const priorV3 = priorV4.base;
  const priorV2 = priorV3.base;
  const prior = priorV2.base;
  const activeRegions = regionalStorageRegionsInView(spatial);
  const desiredRegionKeys = new Set(activeRegions.map(regionKey));
  let root = prior.root;
  for (const resident of prior.activeResidents) {
    if (
      resident.kind !== "regional-habitat"
      || desiredRegionKeys.has(regionKey(resident.region))
    ) continue;
    root = putRegionalEcologyResidentDeviation(root, {
      rootSeed,
      patch: resident.patch,
    });
  }
  const entrants = regionalEcologyRegionalResidentsForActiveRegions(
    root,
    rootSeed,
    activeRegions,
  );
  if (entrants === null) throw new Error("fixture could not derive regional ecology entrants");
  const retainedBySource = new Map(prior.activeResidents
    .filter(({ kind }) => kind === "regional-habitat")
    .map((resident) => [resident.sourceKey, resident] as const));
  const activeResidents: RegionalEcologyActiveResidentInput[] = entrants.map((entrant) => ({
    kind: "regional-habitat" as const,
    sourceKey: entrant.sourceKey,
    patch: retainedBySource.get(entrant.sourceKey)?.patch ?? entrant.patch,
  }));
  for (const legacy of prior.activeResidents.filter(({ kind }) => kind === "legacy-cohort")) {
    activeResidents.push({
      kind: "legacy-cohort",
      sourceKey: legacy.sourceKey,
      patch: legacy.patch,
    });
  }
  return serializeRegionalEcologyStateV6(replaceRegionalEcologyStateV6ActiveState(priorV6, {
    expectedIntegrity: priorV6.integrity,
    base: {
      expectedIntegrity: priorV5.integrity,
      base: {
        expectedIntegrity: priorV4.integrity,
        base: {
          expectedIntegrity: priorV3.integrity,
          base: {
            expectedIntegrity: priorV2.integrity,
            base: {
              expectedIntegrity: prior.integrity,
              rootSeed,
              root,
              settlementHome: {
                sourceKey: prior.settlementHome.sourceKey,
                patch: prior.settlementHome.patch,
              },
              activeRegions,
              activeResidents,
            },
          },
        },
      },
    },
  }));
}

function relocateToRidgeAtZeroStability(
  envelope: CurrentGameSaveEnvelope,
): { readonly envelope: CurrentGameSaveEnvelope; readonly corner: RidgeCorner } {
  const world = deserializeWorld(envelope.world);
  const regionalTravel = restorePlayerRegionalTravel(
    world.meta.rootSeed,
    envelope.player,
    envelope.regionalTravel,
  );
  if (!regionalTravel) {
    throw new Error("fixture started with an invalid v4 regional-travel sidecar");
  }
  const corner = findRidgeCorner(world, regionalTravel.window);
  const startTerrain = world.terrain.tiles[corner.startTileIndex];
  const ridgeTerrain = world.terrain.tiles[corner.ridgeTileIndex];
  if (!startTerrain || !ridgeTerrain) throw new Error("ridge fixture lost its terrain pair");
  // Make the selected natural ridge a deterministic serious downhill contact.
  // The stability model is percentage-derived from present conditions, so a
  // stale saved value alone must not force a fall.
  startTerrain.elevation = FIXED_POINT;
  startTerrain.roughness = 0;
  ridgeTerrain.elevation = 400_000;
  ridgeTerrain.roughness = FIXED_POINT;
  ridgeTerrain.terrain = "ridge";
  world.weather = {
    kind: "storm",
    intensity: FIXED_POINT,
    windX: -FIXED_POINT,
    windY: FIXED_POINT,
    nextChangeTick: world.meta.completedTick + 10_000,
  };
  const player = structuredClone(envelope.player);
  const alignedTravel = moveFixtureFrameToCompatibilityTile(
    world.meta.rootSeed,
    regionalTravel,
    player,
    corner.x,
    corner.y,
  );
  const regionalTileIndex = (compatibilityTileIndex: number): number => {
    const mapped = regionTileIndexToWindowIndex(
      alignedTravel.window,
      createRegionCoord(0, 0),
      compatibilityTileIndex,
    );
    if (mapped === null) throw new Error("ridge fixture is outside its spatial frame");
    return mapped;
  };
  const startTileIndex = regionalTileIndex(corner.startTileIndex);
  const ridgeTileIndex = regionalTileIndex(corner.ridgeTileIndex);
  const diagonalTileIndex = regionalTileIndex(corner.diagonalTileIndex);
  // Even a full pack retains a bounded minimum movement speed. One unit from
  // each boundary guarantees that the shared diagonal command crosses both
  // axes this step without changing speed/load rules for the fixture.
  player.x = (startTileIndex % REGIONAL_TRAVEL_COLUMNS) * TILE_UNITS + 999;
  player.y = Math.floor(startTileIndex / REGIONAL_TRAVEL_COLUMNS) * TILE_UNITS + 999;
  player.previousX = player.x;
  player.previousY = player.y;
  player.velocityX = 0;
  player.velocityY = 0;
  player.stamina = FIXED_POINT;
  player.stability = 0;
  player.stabilityTrend = "steady";
  player.stabilityHint = "No reserve on ridge footing";
  player.pace = "steady";
  player.mode = "foot";
  player.sweepTicksRemaining = 0;
  player.sweepTotalTicks = 0;
  player.sweepPath = [];
  player.sweepSupport = null;
  player.currentTrace = [startTileIndex];
  player.surveyTrace = [startTileIndex];
  player.discovered[startTileIndex] = FIXED_POINT;
  player.discovered[ridgeTileIndex] = FIXED_POINT;
  player.discovered[diagonalTileIndex] = FIXED_POINT;
  const capturedTravel = capturePlayerRegionalTravel(alignedTravel, player);
  const regionalTravelText = serializePlayerRegionalTravel(capturedTravel);
  const promiseJourney: RegionalPromiseJourneyState = player.activeContractId === null
    ? { version: 1, contractId: null, detoured: false, compatibilityTrace: [] }
    : {
        version: 1,
        contractId: player.activeContractId,
        detoured: true,
        compatibilityTrace: [],
      };
  if (!restorePlayerRegionalTravel(world.meta.rootSeed, player, regionalTravelText)) {
    throw new Error("relocated fixture did not produce a coherent regional-travel sidecar");
  }
  const spatial = createRegionalWorldView(
    createWorldView(world),
    alignedTravel.window,
    {
      discovered: player.discovered,
      depthSoundings: player.depthSoundings,
    },
  );
  const intervalStartPosition = playerWorldPositionInRegionalWindow(
    alignedTravel.window,
    player,
  );
  if (intervalStartPosition === null) {
    throw new Error("relocated fixture has no canonical phase-zero player position");
  }
  return {
    envelope: {
      ...envelope,
      world: serializeWorld(world),
      player,
      regionalTravel: regionalTravelText,
      promiseJourney,
      perceptionCarry: {
        ...envelope.perceptionCarry,
        intervalStartPosition,
        intervalStartFacingMilliRadians: player.facingMilliRadians,
      },
      regionalEcology: rebaseFixtureRegionalEcology(
        envelope.regionalEcology,
        world.meta.rootSeed,
        spatial,
      ),
      traversalFeedback: {
        ...envelope.traversalFeedback,
        nextTraversalOrdinal: 0,
        incident: null,
        lastAudibleIncidentId: null,
      },
    },
    corner: {
      ...corner,
      startTileIndex,
      ridgeTileIndex,
      diagonalTileIndex,
    },
  };
}

function relocateForDryExhaustion(
  envelope: CurrentGameSaveEnvelope,
  waterDepth = 0,
): CurrentGameSaveEnvelope {
  const relocated = relocateToRidgeAtZeroStability(envelope);
  const world = deserializeWorld(relocated.envelope.world);
  const startIndex = relocated.corner.y * world.terrain.width + relocated.corner.x;
  const destinationIndex = startIndex + 1;
  const meadowTemplate = world.terrain.tiles.find(({ terrain }) => terrain === "meadow");
  const start = world.terrain.tiles[startIndex];
  const destination = world.terrain.tiles[destinationIndex];
  if (!meadowTemplate || !start || !destination) {
    throw new Error("dry-exhaustion fixture lost its meadow crossing");
  }
  for (const tile of [start, destination]) {
    tile.elevation = world.tide.level - waterDepth;
    tile.moisture = 0;
    tile.roughness = 0;
    tile.terrain = "meadow";
    tile.baseTravelCost = meadowTemplate.baseTravelCost;
  }
  world.weather = {
    kind: "clear",
    intensity: 0,
    windX: 0,
    windY: 0,
    nextChangeTick: world.meta.completedTick + 10_000,
  };

  const player = structuredClone(relocated.envelope.player);
  player.velocityX = 0;
  player.velocityY = 0;
  player.stamina = 12_500;
  player.stability = FIXED_POINT;
  player.stabilityTrend = "steady";
  player.stabilityHint = "Stable on sound footing";
  player.pace = "steady";
  player.mode = "foot";
  player.sweepTicksRemaining = 0;
  player.sweepTotalTicks = 0;
  player.sweepPath = [];
  player.sweepSupport = null;
  player.timeAction = null;

  const regionalTravel = restorePlayerRegionalTravel(
    world.meta.rootSeed,
    player,
    relocated.envelope.regionalTravel,
  );
  if (regionalTravel === null) {
    throw new Error("dry-exhaustion fixture lost its regional travel authority");
  }
  const capturedTravel = capturePlayerRegionalTravel(regionalTravel, player);
  const regionalTravelText = serializePlayerRegionalTravel(capturedTravel);
  const spatial = createRegionalWorldView(
    createWorldView(world),
    capturedTravel.window,
    {
      discovered: player.discovered,
      depthSoundings: player.depthSoundings,
    },
  );
  const intervalStartPosition = playerWorldPositionInRegionalWindow(
    capturedTravel.window,
    player,
  );
  if (intervalStartPosition === null) {
    throw new Error("dry-exhaustion fixture has no canonical player position");
  }

  return {
    ...relocated.envelope,
    world: serializeWorld(world),
    player,
    regionalTravel: regionalTravelText,
    perceptionCarry: {
      ...relocated.envelope.perceptionCarry,
      intervalStartPosition,
      intervalStartFacingMilliRadians: player.facingMilliRadians,
      playerStepStateAnchor: {
        version: 1,
        sampleOrdinal: relocated.envelope.perceptionCarry.playerStepsSinceWorldTick,
        stamina: player.stamina,
        mode: player.mode,
      },
    },
    regionalEcology: rebaseFixtureRegionalEcology(
      relocated.envelope.regionalEcology,
      world.meta.rootSeed,
      spatial,
    ),
    traversalFeedback: {
      ...relocated.envelope.traversalFeedback,
      incident: null,
      lastAudibleIncidentId: null,
    },
  };
}

/** Calibrate only the initial reserve through the actual unchanged movement owner. */
function dryExhaustionAtTenthStep(envelope: CurrentGameSaveEnvelope): CurrentGameSaveEnvelope {
  const prepared = relocateForDryExhaustion(envelope);
  const world = deserializeWorld(prepared.world);
  const travel = restorePlayerRegionalTravel(world.meta.rootSeed, prepared.player, prepared.regionalTravel);
  if (travel === null) throw new Error("phase-ten fixture lost its travel authority");
  const spatial = createRegionalWorldView(createWorldView(world), travel.window, {
    discovered: prepared.player.discovered, depthSoundings: prepared.player.depthSoundings,
  });
  const probe = structuredClone(prepared.player);
  probe.stamina = 500_000;
  stepPlayer(probe, spatial, { moveX: 1, moveY: 0, brace: false }, {
    seed: world.meta.rootSeed, actorId: 0,
    feedback: structuredClone(prepared.traversalFeedback), deferFallCargoConsequence: true,
  });
  const drain = 500_000 - probe.stamina;
  if (drain <= 0 || probe.mode !== "foot") throw new Error("phase-ten fixture needs ordinary dry movement");
  const stamina = PLAYER_MOVEMENT_STAMINA_GATE + 9 * drain + 1;
  return {
    ...prepared, player: { ...prepared.player, stamina },
    perceptionCarry: {
      ...prepared.perceptionCarry,
      playerStepStateAnchor: { ...prepared.perceptionCarry.playerStepStateAnchor, stamina },
    },
  };
}

async function createCurrentFixture(
  repository: MemoryRepository,
  seed: string,
  acceptPromise: boolean,
): Promise<{
  readonly contractId: number | null;
  readonly sourceLotId: string | null;
  readonly sourceCondition: number | null;
  readonly promiseQuantity: number;
  readonly nextParcelOrdinal: number;
  readonly corner: RidgeCorner;
}> {
  const runtime = await createTideweftRuntime(repository);
  runtime.dispatchUI({
    type: "new-world",
    seed,
    posture: "gale",
    sessionShape: "wander",
  });
  let contractId: number | null = null;
  if (acceptPromise) {
    const offer = runtime.getUIView().contracts.find(({ actionLabel }) =>
      actionLabel === "Pick up cargo here");
    if (!offer) throw new Error("fixture did not begin at a physical Promise offer");
    contractId = Number(offer.id);
    runtime.dispatchUI({
      type: "contract",
      action: "accept",
      contractId: offer.id,
    });
    // Accept and pickup settle together on the next authoritative world tick.
    advancePlayerSteps(runtime, 10);
  }
  await runtime.save();
  runtime.destroy();

  const initial = decodeCurrent(repository.snapshot());
  const promiseLot = contractId === null
    ? undefined
    : initial.physicalCargo.carrier.lots.find((lot) =>
        lot.payload.kind === "promise" && lot.payload.contractId === contractId);
  if (acceptPromise && (!promiseLot || promiseLot.payload.kind !== "promise")) {
    throw new Error("accepted Promise did not reach the physical carrier");
  }
  const relocated = relocateToRidgeAtZeroStability(initial);
  replaceEnvelope(repository, relocated.envelope);
  return {
    contractId,
    sourceLotId: promiseLot?.id ?? null,
    sourceCondition: promiseLot?.materialState.condition ?? null,
    promiseQuantity: promiseLot?.payload.kind === "promise" ? promiseLot.payload.quantity : 0,
    nextParcelOrdinal: initial.physicalCargo.looseWorld.lastEntityOrdinal + 1,
    corner: relocated.corner,
  };
}

function promiseQuantity(state: SerializedPhysicalCargoState, contractId: number): number {
  return [
    ...state.carrier.lots.map(({ payload }) => payload),
    ...state.looseWorld.entities.map(({ payload }) => payload),
  ].reduce((quantity, payload) => quantity + (
    payload.kind === "promise" && payload.contractId === contractId
      ? payload.quantity
      : 0
  ), 0);
}

function incidentCueCalls(cue: string): number {
  return soundscapePlay.mock.calls.filter(([kind]) => kind === cue).length;
}

function playerExpression(runtime: TideweftRuntime, tone: "alarmed" | "relieved") {
  const expressions = runtime.getRenderView().expressions ?? [];
  expect(expressions).toHaveLength(1);
  const expression = expressions[0];
  if (!expression) throw new Error(`runtime omitted its ${tone} player expression`);
  expect(expression).toMatchObject({
    sourceActorId: "player:local",
    sourceKind: "player",
    speakerLabel: "You",
    tone,
  });
  expect(expression.position).toEqual(runtime.getRenderView().player.position);
  expect(runtime.getUIView().expressionCaption).toEqual({
    id: expression.id,
    presentationKind: "speech",
    speakerLabel: expression.speakerLabel,
    text: expression.text,
    tone: expression.tone,
    assertive: tone === "alarmed",
  });
  return expression;
}

function renderedTileIndex(view: TideweftView): number {
  const tileX = Math.floor(view.player.position.x / view.terrain.tileSize);
  const tileY = Math.floor(view.player.position.y / view.terrain.tileSize);
  return tileY * view.terrain.columns + tileX;
}

/** Initial controlled world only; actual steps must still earn the stumbles. */
async function prepareStormStumbleFixture(): Promise<SaveRecord> {
    const repository = new MemoryRepository();
    const fixture = await createCurrentFixture(repository, "fall cargo exact test", false);
    const initial = decodeCurrent(repository.snapshot());
    const world = deserializeWorld(initial.world);
    const meadow = world.terrain.tiles.find(({ terrain }) => terrain === "meadow");
    if (meadow === undefined) throw new Error("storm corner has no existing meadow material");
    // A controlled initial physical corner, not fabricated stumble/expression
    // events. Equal dry ground removes downhill/rock/water causes; actual wind
    // and keyed entry rolls must earn both incidents after setup.
    const compatibilityStart = fixture.corner.y * world.terrain.width + fixture.corner.x;
    for (const index of [compatibilityStart, compatibilityStart + 1, compatibilityStart + 1 + world.terrain.width]) {
      const tile = world.terrain.tiles[index];
      if (tile === undefined) throw new Error("storm corner exceeds its generated region");
      tile.elevation = 900_000;
      tile.terrain = "meadow";
      tile.roughness = 0;
      tile.moisture = 0;
      tile.baseTravelCost = meadow.baseTravelCost;
    }
    world.weather = {
      kind: "storm", intensity: FIXED_POINT, windX: -400_000, windY: 400_000,
      nextChangeTick: world.meta.completedTick + 10_000,
    };
    const player = { ...initial.player, stability: FIXED_POINT, stamina: FIXED_POINT };
    const travel = restorePlayerRegionalTravel(world.meta.rootSeed, player, initial.regionalTravel);
    if (travel === null) throw new Error("storm corner lost its actual travel frame");
    const spatial = createRegionalWorldView(createWorldView(world), travel.window, {
      discovered: player.discovered, depthSoundings: player.depthSoundings,
    });
    // An initial bounded real stepPlayer search witnessed ordinal73. Freeze
    // that address: do not silently search another outcome if physics changes.
    // Actual runtime wind, footing and rolls must still earn both incidents.
    const selectedOrdinal = 73;
    replaceEnvelope(repository, {
      ...initial, player, world: serializeWorld(world),
      regionalEcology: rebaseFixtureRegionalEcology(initial.regionalEcology, world.meta.rootSeed, spatial),
      traversalFeedback: { ...initial.traversalFeedback, nextTraversalOrdinal: selectedOrdinal },
    });
    return repository.snapshot();
}

describe("production terrain fall and physical cargo", () => {
  it("preserves accepted speech cooldown across two actual storm stumbles and boundary reload", async () => {
    const prepared = await prepareStormStumbleFixture();
    const selectedOrdinal = 73;

    async function run(reloadAtBoundary: boolean) {
      const runRepository = new MemoryRepository(prepared);
      soundscapePlay.mockClear();
      let runtime = await createTideweftRuntime(runRepository);
      let vocalAudio = 0;
      let physicalAudio = 0;
      const events: { step: number; incidentId: string; kind: string; meaning: string | null; trigger: string | null }[] = [];
      const trajectory: { step: number; position: unknown; stamina: number }[] = [];
      let lastIncidentId: string | null = null;
      try {
        // Compare enabled captured-producer diagnostics with the disabled
        // boundary-reload run; copied evidence must not alter physical truth.
        runtime.expressionDiagnostics!.setEnabled(!reloadAtBoundary);
        expect(runtime.getUIView().saveWarning).toBeUndefined();
        runtime.dispatchUI({ type: "resume-world" });
        advancePlayerSteps(runtime, 6);
        runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 1 } });
        for (let step = 7; step <= 11; step += 1) {
          advancePlayerSteps(runtime, 1);
          const view = runtime.getRenderView();
          trajectory.push({ step, position: view.player.position, stamina: runtime.getUIView().player.stamina });
          const incident = view.player.incident;
          if (incident !== undefined && incident.id !== lastIncidentId) {
            lastIncidentId = incident.id;
            await runtime.save();
            const saved = decodeCurrent(runRepository.snapshot());
            const expression = saved.perceptionCarry.situatedExpressionChannels.channels
              .find(({ sourceActorId }) => sourceActorId === "player:local")?.state.active;
            events.push({ step, incidentId: incident.id, kind: incident.kind,
              meaning: expression?.meaning ?? null, trigger: expression?.triggerEventId ?? null });
          }
          if (step === 10) {
            await runtime.save();
            const saved = decodeCurrent(runRepository.snapshot());
            expect(saved.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
            expect(saved.perceptionCarry.situatedExpressionChannels.channels.some(
              ({ sourceActorId }) => sourceActorId === "player:local",
            )).toBe(false);
            if (reloadAtBoundary) {
              vocalAudio += incidentCueCalls("vocalization-relief");
              physicalAudio += incidentCueCalls("stumble");
              runtime.destroy();
              soundscapePlay.mockClear();
              runtime = await createTideweftRuntime(runRepository);
              expect(runtime.getUIView().title.hasSave).toBe(true);
              expect(incidentCueCalls("vocalization-relief")).toBe(0);
              expect(incidentCueCalls("stumble")).toBe(0);
              await runtime.save();
              expect(decodeCurrent(runRepository.snapshot()).perceptionCarry).toEqual(saved.perceptionCarry);
              expect(decodeCurrent(runRepository.snapshot()).traversalFeedback).toEqual(saved.traversalFeedback);
              expect(decodeCurrent(runRepository.snapshot()).playerExpressionRecency).toEqual(saved.playerExpressionRecency);
              runtime.dispatchUI({ type: "resume-world" });
              runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 1 } });
            }
          }
        }
        await runtime.save();
        vocalAudio += incidentCueCalls("vocalization-relief");
        physicalAudio += incidentCueCalls("stumble");
        const decisions = runtime.expressionDiagnostics!.getSnapshot({ sourceActorId: "player:local" }).records;
        const replays = decisions.map(({ sequence }) => runtime.expressionDiagnostics!.replayProducer(sequence));
        return { events, trajectory, vocalAudio, physicalAudio, decisions, replays,
          final: decodeCurrent(runRepository.snapshot()) };
      } finally { runtime.destroy(); }
    }

    const uninterrupted = await run(false);
    const restored = await run(true);
    expect(restored.events).toEqual(uninterrupted.events);
    expect(restored.trajectory).toEqual(uninterrupted.trajectory);
    expect(restored.vocalAudio).toBe(uninterrupted.vocalAudio);
    expect(restored.physicalAudio).toBe(uninterrupted.physicalAudio);
    expect(uninterrupted.events.map(({ step }) => step)).toEqual([7, 11]);
    expect(uninterrupted.events.every(({ kind }) => kind === "stumble")).toBe(true);
    expect(uninterrupted.events.map(({ meaning }) => meaning)).toEqual(["relief-after-near-fall", null]);
    expect(uninterrupted.events[0]?.trigger).toBe(uninterrupted.events[0]?.incidentId);
    expect(uninterrupted.events.map(({ incidentId }) => incidentId)).toEqual([
      "player:0:traversal:73", "player:0:traversal:74",
    ]);
    // Both physical incidents survive. Retiring sound cannot erase the first
    // accepted choice's sixteen-step lock or admit another relief four later.
    expect(situatedExpressionCooldownSteps("relief-after-near-fall")?.meaning).toBe(16);
    expect(uninterrupted.vocalAudio).toBe(1);
    expect(uninterrupted.physicalAudio).toBe(2);
    expect(restored.decisions).toEqual([]);
    expect(uninterrupted.decisions.map(({ reason }) => reason)).toEqual(["accepted", "footing-recency"]);
    for (const [index, decision] of uninterrupted.decisions.entries()) {
      expect(decision.producerContext).toMatchObject({
        kind: "player-traversal", input: { incident: { id: uninterrupted.events[index]!.incidentId } },
      });
      expect(uninterrupted.replays[index]).toMatchObject({
        scope: "captured-producer-and-kernel-replay",
        producerKind: "player-traversal", actualRuntimeReason: decision.reason,
        candidate: decision.intent,
      });
    }
    // Consumed kernel memory cannot erase the separate real footing refusal.
    expect(uninterrupted.replays[1]).toMatchObject({ accepted: true, actualRuntimeReason: "footing-recency" });
    expect(uninterrupted.final.playerExpressionRecency.footing).toHaveLength(1);
    expect(uninterrupted.final.playerExpressionRecency.footing[0]?.admission.triggerEventId)
      .toBe("player:0:traversal:73");
    const { session: _firstSession, integrity: _firstSeal, regionalTravel: _firstTravel,
      ...firstRoots } = uninterrupted.final;
    const { session: _restoredSession, integrity: _restoredSeal, regionalTravel: _restoredTravel,
      ...restoredRoots } = restored.final;
    expect(restoredRoots).toEqual(firstRoots);
    const comparableTravel = (saved: CurrentGameSaveEnvelope) => {
      const actual = restorePlayerRegionalTravel(
        deserializeWorld(saved.world).meta.rootSeed, saved.player, saved.regionalTravel,
      );
      if (actual === null) throw new Error("storm witness travel failed current validation");
      // Same partitioned-capture exception as the exhaustion witness: reload
      // adopts a published chart revision. Every semantic mark/frame survives.
      const { revision, integrity: _chartSeal, ...chart } = actual.cartography;
      const { integrity: _travelSeal, cartography: _serializedChart, ...frame } = JSON.parse(
        saved.regionalTravel,
      ) as Record<string, unknown>;
      return { revision, facts: { chart, frame } };
    };
    const firstTravel = comparableTravel(uninterrupted.final);
    const restoredTravel = comparableTravel(restored.final);
    expect(restoredTravel.facts).toEqual(firstTravel.facts);
    expect(restoredTravel.revision).toBe(firstTravel.revision + 1);
    console.info("Actual repeated storm-stumble recency proof:", JSON.stringify({
      scope: "controlled initial current world, then actual input/steps; not ordinary-play frequency",
      selectedOrdinal, events: uninterrupted.events, vocalAudio: uninterrupted.vocalAudio,
      physicalAudio: uninterrupted.physicalAudio,
    }));
  });

  it("quietly refuses footing at a saturated sound budget without rolling back its physical stumble", async () => {
    const prepared = await prepareStormStumbleFixture();
    const baselineRepository = new MemoryRepository(prepared);
    const baseline = await createTideweftRuntime(baselineRepository);
    try {
      baseline.dispatchUI({ type: "resume-world" });
      advancePlayerSteps(baseline, 6);
      baseline.dispatchRenderer({ type: "movement", vector: { x: 1, y: 1 } });
      advancePlayerSteps(baseline, 1);
      await baseline.save();
    } finally { baseline.destroy(); }
    const expected = decodeCurrent(baselineRepository.snapshot());
    // Existing capacity-refusal technique: a zero-cap fixture saturates the
    // same boundary without fabricating eight unrelated authoritative sounds.
    vi.resetModules();
    vi.doMock("./humanPerception", async (importOriginal) => ({
      ...await importOriginal<typeof import("./humanPerception")>(),
      HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES: 0,
    }));
    let runtime: TideweftRuntime | null = null;
    try {
      const refusedModule = await import("./runtime");
      const repository = new MemoryRepository(prepared);
      soundscapePlay.mockClear();
      runtime = await refusedModule.createTideweftRuntime(repository);
      runtime.expressionDiagnostics!.setEnabled(true);
      runtime.dispatchUI({ type: "resume-world" });
      advancePlayerSteps(runtime, 6);
      runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 1 } });
      advancePlayerSteps(runtime, 1);
      expect(runtime.getUIView().announcement?.message ?? "").not.toContain("INTEGRITY HALT");
      expect(runtime.getRenderView().player.incident?.id).toBe("player:0:traversal:73");
      expect(incidentCueCalls("vocalization-relief")).toBe(0);
      const decisions = runtime.expressionDiagnostics!.getSnapshot({ sourceActorId: "player:local" }).records;
      expect(decisions).toEqual([expect.objectContaining({
        reason: "sound-budget", event: null, admission: null,
        producerContext: { kind: "player-traversal", input: expect.objectContaining({
          incident: expect.objectContaining({ id: "player:0:traversal:73" }),
        }) },
      })]);
      expect(runtime.expressionDiagnostics!.replayProducer(decisions[0]!.sequence)).toMatchObject({
        scope: "captured-producer-and-kernel-replay", actualRuntimeReason: "sound-budget", accepted: true,
      });
      await runtime.save();
      const actual = decodeCurrent(repository.snapshot());
      expect(actual.playerExpressionRecency.footing).toEqual([]);
      expect(actual.perceptionCarry.actorVocalizationSamples).toEqual([]);
      expect(actual.player).toEqual(expected.player);
      expect(actual.traversalFeedback).toEqual(expected.traversalFeedback);
      expect(actual.physicalCargo).toEqual(expected.physicalCargo);
      expect(actual.world).toEqual(expected.world);
    } finally {
      runtime?.destroy();
      vi.doUnmock("./humanPerception");
      vi.resetModules();
    }
  }, 60_000);

  it("preserves supported40 pending footing sound without inventing missing physical history", async () => {
    const repository = new MemoryRepository(await prepareStormStumbleFixture());
    const runtime = await createTideweftRuntime(repository);
    let pendingRecord: SaveRecord;
    try {
      runtime.dispatchUI({ type: "resume-world" });
      advancePlayerSteps(runtime, 6);
      runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 1 } });
      advancePlayerSteps(runtime, 1);
      await runtime.save();
      pendingRecord = repository.snapshot();
    } finally { runtime.destroy(); }
    const pending = decodeCurrent(pendingRecord);
    expect(pending.playerExpressionRecency.footing).toHaveLength(1);
    expect(pending.perceptionCarry.playerStepsSinceWorldTick).toBe(7);
    const { playerExpressionRecency: _recency, integrity: _seal, perceptionCarry, ...roots } = pending;
    // Carry8 already owned animal contact, pose, pending sound and causal
    // expression records, but not sleep/physical-step history. Retain its
    // actual pending stumble rather than replacing it with a synthetic event.
    const { intervalStartWasSleeping: _sleep, playerStepStateAnchor: _anchor,
      playerStepStateSamples: _steps, ...historicalCarry } = perceptionCarry;
    const old = { ...roots, version: 40, perceptionCarry: { ...historicalCarry, version: 8 } };
    const historicalRepository = new MemoryRepository({ ...pendingRecord, payloadVersion: 40,
      worldJson: JSON.stringify({ ...old, integrity: gameSaveEnvelopeIntegrity(old) }) });
    soundscapePlay.mockClear();
    const loaded = await createTideweftRuntime(historicalRepository);
    let adoptedRecord: SaveRecord;
    try {
      expect(loaded.getUIView().saveWarning).toBeUndefined();
      expect(loaded.getUIView().title.hasSave).toBe(true);
      expect(soundscapePlay).not.toHaveBeenCalled();
      await loaded.save();
      adoptedRecord = historicalRepository.snapshot();
    } finally { loaded.destroy(); }
    const adopted = decodeCurrent(adoptedRecord);
    expect(adopted.playerExpressionRecency).toEqual({
      ...pending.playerExpressionRecency, footing: [],
    });
    expect(adopted.player).toEqual(pending.player);
    expect(adopted.traversalFeedback).toEqual(pending.traversalFeedback);
    expect(adopted.physicalCargo).toEqual(pending.physicalCargo);
    expect(adopted.perceptionCarry).toEqual({ ...pending.perceptionCarry,
      intervalStartWasSleeping: false,
      playerStepStateSamples: Array.from({ length: 7 }, () => null),
      playerStepStateAnchor: { version: 1, sampleOrdinal: 7,
        stamina: pending.player.stamina, mode: pending.player.mode },
    });
    expect(adopted.perceptionCarry.actorVocalizationSamples).toHaveLength(1);
    const restoredRepository = new MemoryRepository(adoptedRecord);
    soundscapePlay.mockClear();
    const restored = await createTideweftRuntime(restoredRepository);
    try {
      expect(restored.getUIView().saveWarning).toBeUndefined();
      expect(restored.getUIView().title.hasSave).toBe(true);
      expect(soundscapePlay).not.toHaveBeenCalled();
      await restored.save();
      expect(decodeCurrent(restoredRepository.snapshot()).perceptionCarry).toEqual(adopted.perceptionCarry);
      expect(decodeCurrent(restoredRepository.snapshot()).playerExpressionRecency)
        .toEqual(adopted.playerExpressionRecency);
    } finally { restored.destroy(); }
    // Only the deliberately supported reader may lack the original history.
    // A current record still requires its exact anchored null prefix.
    for (const anchor of [null, { ...adopted.perceptionCarry.playerStepStateAnchor, sampleOrdinal: 6 }]) {
      const malformed = { ...adopted, perceptionCarry: { ...adopted.perceptionCarry,
        playerStepStateAnchor: anchor } };
      const malformedRecord = { ...adoptedRecord,
        worldJson: JSON.stringify({ ...malformed, integrity: gameSaveEnvelopeIntegrity(malformed) }) };
      const rejectedRepository = new MemoryRepository(malformedRecord);
      const rejected = await createTideweftRuntime(rejectedRepository);
      try {
        expect(rejected.getUIView().title.hasSave).toBe(false);
        expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
        await expect(rejected.save()).rejects.toThrow("Choose a seed before replacing");
        expect(rejectedRepository.snapshot()).toEqual(malformedRecord);
      } finally { rejected.destroy(); }
    }
  }, 60_000);

  it("preserves pending footing during pause, validates current history and honestly adopts supported48", async () => {
    const repository = new MemoryRepository(await prepareStormStumbleFixture());
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    advancePlayerSteps(runtime, 6);
    runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 1 } });
    advancePlayerSteps(runtime, 1);
    await runtime.save();
    const pendingRecord = repository.snapshot();
    const pending = decodeCurrent(pendingRecord);
    const receipt = pending.playerExpressionRecency.footing[0];
    if (receipt === undefined) throw new Error("Real stumble omitted accepted footing history");
    expect(receipt.step.sampleOrdinal).toBe(6);
    expect(receipt.authority.committedWorldTick).toBe(deserializeWorld(pending.world).meta.completedTick);
    runtime.dispatchUI({ type: "open-title" });
    advancePlayerSteps(runtime, 40);
    await runtime.save();
    expect(decodeCurrent(repository.snapshot()).playerExpressionRecency).toEqual(pending.playerExpressionRecency);
    expect(decodeCurrent(repository.snapshot()).perceptionCarry).toEqual(pending.perceptionCarry);
    runtime.dispatchUI({ type: "resume-world" });
    runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    advancePlayerSteps(runtime, 3);
    await runtime.save();
    const consumed = decodeCurrent(repository.snapshot());
    runtime.destroy();
    expect(consumed.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expect(consumed.playerExpressionRecency.footing).toEqual([receipt]);

    for (const saved of [pending, consumed]) {
      const { playerExpressionRecency, integrity: _seal, ...roots } = saved;
      const old = { ...roots, version: 48, playerEffortRecency: playerExpressionRecency.effort };
      const oldRecord = { ...pendingRecord, payloadVersion: 48,
        playTicks: deserializeWorld(saved.world).meta.completedTick,
        worldJson: JSON.stringify({ ...old, integrity: gameSaveEnvelopeIntegrity(old) }) };
      const oldRepository = new MemoryRepository(oldRecord);
      soundscapePlay.mockClear();
      const loaded = await createTideweftRuntime(oldRepository);
      try {
        expect(loaded.getUIView().title.hasSave).toBe(true);
        expect(incidentCueCalls("vocalization-relief")).toBe(0);
        await loaded.save();
        const adopted = decodeCurrent(oldRepository.snapshot());
        expect(adopted.perceptionCarry).toEqual(saved.perceptionCarry);
        expect(adopted.playerExpressionRecency.effort).toEqual(playerExpressionRecency.effort);
        // Consumed48 never carried footing history: do not fabricate it.
        expect(adopted.playerExpressionRecency.footing).toEqual(saved === pending ? [receipt] : []);
      } finally { loaded.destroy(); }
      const forged = { ...old, playerExpressionRecency };
      const rejectedRepository = new MemoryRepository({ ...oldRecord,
        worldJson: JSON.stringify({ ...forged, integrity: gameSaveEnvelopeIntegrity(forged) }) });
      const rejected = await createTideweftRuntime(rejectedRepository);
      try { expect(rejected.getUIView().title.hasSave).toBe(false); }
      finally { rejected.destroy(); }
    }
    const wrongPositionAuthority = createSituatedExpressionCausalAuthorityRecord(
      receipt.admission, receipt.authority.committedWorldTick,
      translateWorldPosition(receipt.authority.playerPosition, 10, 0),
    );
    if (wrongPositionAuthority === null) throw new Error("Contradiction fixture failed its own canonical owner");
    const { playerExpressionRecency: _removed, ...missing } = pending;
    const variants = [
      missing,
      { ...pending, playerExpressionRecency: null },
      ...[
        [], [receipt, receipt],
        [{ ...receipt, authority: wrongPositionAuthority }],
        [{ ...receipt, step: { ...receipt.step, staminaAfter: receipt.step.staminaAfter - 1 } }],
      ].map((footing) => ({ ...pending,
        playerExpressionRecency: { ...pending.playerExpressionRecency, footing } })),
      { ...pending, playerEffortRecency: pending.playerExpressionRecency.effort },
    ];
    for (const invalid of variants) {
      const badRepository = new MemoryRepository(pendingRecord);
      replaceEnvelope(badRepository, invalid as CurrentGameSaveEnvelope);
      const before = badRepository.snapshot();
      soundscapePlay.mockClear();
      const rejected = await createTideweftRuntime(badRepository);
      try {
        expect(rejected.getUIView().title.hasSave).toBe(false);
        expect(rejected.getUIView().saveWarning).toBeDefined();
        await expect(rejected.save()).rejects.toThrow("Choose a seed");
        expect(badRepository.snapshot()).toEqual(before);
        expect(incidentCueCalls("vocalization-relief")).toBe(0);
      } finally { rejected.destroy(); }
    }
  }, 60_000);

  it.each([false, true])("normalizes actual phase-ten footing and rolls back late failure (reject=%s)", async (reject) => {
    const repository = new MemoryRepository(await prepareStormStumbleFixture());
    const runtime = await createTideweftRuntime(repository);
    try {
      runtime.expressionDiagnostics!.setEnabled(true);
      runtime.dispatchUI({ type: "resume-world" });
      advancePlayerSteps(runtime, 9);
      await runtime.save();
      const beforeRecord = repository.snapshot();
      const before = decodeCurrent(beforeRecord);
      expect(before.playerExpressionRecency.footing).toEqual([]);
      expect(before.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
      const close = expressionChannelBank.closeSituatedExpressionChannelBankInterval;
      let closes = 0;
      if (reject) vi.spyOn(expressionChannelBank, "closeSituatedExpressionChannelBankInterval")
        .mockImplementation((...args) => ++closes === 1 ? null : close(...args));
      soundscapePlay.mockClear();
      runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 1 } });
      advancePlayerSteps(runtime, 1);
      if (reject) {
        expect(closes).toBe(1);
        expect(runtime.getUIView().announcement?.message).toContain("INTEGRITY HALT");
        expect(repository.snapshot()).toEqual(beforeRecord);
        expect(incidentCueCalls("vocalization-relief")).toBe(0);
        expect(runtime.expressionDiagnostics!.getSnapshot().records).toEqual([]);
        expect(runtime.expressionDiagnostics!.replayProducer(1)).toBeNull();
        await runtime.save();
        const rolledBack = decodeCurrent(repository.snapshot());
        expect(rolledBack.playerExpressionRecency).toEqual(before.playerExpressionRecency);
        expect(rolledBack.perceptionCarry).toEqual(before.perceptionCarry);
        expect(rolledBack.player).toEqual(before.player);
        expect(rolledBack.world).toEqual(before.world);
      } else {
        expect(incidentCueCalls("vocalization-relief")).toBe(1);
        const decisions = runtime.expressionDiagnostics!.getSnapshot({ sourceActorId: "player:local" }).records;
        expect(decisions).toHaveLength(1);
        expect(runtime.expressionDiagnostics!.replayProducer(decisions[0]!.sequence)).toMatchObject({
          scope: "captured-producer-and-kernel-replay", actualRuntimeReason: "accepted", accepted: true,
          candidate: decisions[0]!.intent,
        });
        await runtime.save();
        const closed = decodeCurrent(repository.snapshot());
        expect(closed.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
        expect(closed.playerExpressionRecency.footing).toHaveLength(1);
        expect(closed.playerExpressionRecency.footing[0]).toMatchObject({
          step: { sampleOrdinal: 9, traversalIncidentKind: "stumble" },
          admission: { admittedAtPlayerStepPhase: 9 },
          authority: { committedWorldTick: deserializeWorld(before.world).meta.completedTick },
        });
        runtime.destroy();
        soundscapePlay.mockClear();
        const loaded = await createTideweftRuntime(repository);
        try {
          expect(loaded.expressionDiagnostics!.getSnapshot().records).toEqual([]);
          expect(loaded.expressionDiagnostics!.replayProducer(1)).toBeNull();
          expect(loaded.getUIView().title.hasSave).toBe(true);
          expect(incidentCueCalls("vocalization-relief")).toBe(0);
          await loaded.save();
          expect(decodeCurrent(repository.snapshot()).playerExpressionRecency).toEqual(closed.playerExpressionRecency);
        } finally { loaded.destroy(); }
      }
    } finally { runtime.destroy(); }
  }, 60_000);

  it.each([false, true])("commits automatic fall-parcel recovery audio only after presentation (reject=%s)", async (reject) => {
    const repository = new MemoryRepository();
    const fixture = await createCurrentFixture(repository, "fall cargo exact test", true);
    if (fixture.contractId === null) throw new Error("recovery fixture needs its real Promise");
    // The existing fixture stages a real downhill fall on a generated ridge.
    // Give its eastward approach a bounded flat meadow corridor in that same
    // initial physical world to keep the real target directly visible. The
    // normal footing rules may still cause further accepted incidents; none
    // may substitute a different parcel for this exact first-fall identity.
    const prepared = decodeCurrent(repository.snapshot());
    const preparedWorld = deserializeWorld(prepared.world);
    const meadow = preparedWorld.terrain.tiles.find(({ terrain }) => terrain === "meadow");
    if (meadow === undefined) throw new Error("recovery corridor has no meadow material");
    for (let offset = 1; offset <= 5; offset += 1) {
      const tile = preparedWorld.terrain.tiles[fixture.corner.y * preparedWorld.terrain.width + fixture.corner.x + offset];
      if (tile === undefined) throw new Error("recovery corridor exceeds its generated region");
      tile.elevation = 600_000;
      if (offset > 1) {
        tile.terrain = "meadow";
        tile.roughness = 0;
        tile.moisture = 0;
        tile.baseTravelCost = meadow.baseTravelCost;
      }
    }
    replaceEnvelope(repository, { ...prepared, world: serializeWorld(preparedWorld) });
    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getUIView().title.hasSave).toBe(true);
    runtime.dispatchUI({ type: "resume-world" });
    runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 1 } });
    advancePlayerSteps(runtime, 1);
    runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    expect(runtime.getRenderView().player.incident?.kind).toBe("fall");
    advancePlayerSteps(runtime, 10);
    const parcel = runtime.getRenderView().looseCargo?.find(({ recovery }) => recovery === "reachable");
    if (parcel === undefined) throw new Error("actual fall produced no reachable parcel");
    const initialView = runtime.getRenderView();
    const parcelPoint = {
      x: (initialView.terrain.worldTileOrigin?.x ?? 0) + parcel.position.x / initialView.terrain.tileSize,
      y: (initialView.terrain.worldTileOrigin?.y ?? 0) + parcel.position.y / initialView.terrain.tileSize,
    };
    const distanceFromOriginalParcel = () => {
      const view = runtime.getRenderView();
      return Math.abs((view.terrain.worldTileOrigin?.x ?? 0) + view.player.position.x / view.terrain.tileSize - parcelPoint.x)
        + Math.abs((view.terrain.worldTileOrigin?.y ?? 0) + view.player.position.y / view.terrain.tileSize - parcelPoint.y);
    };

    // Leave pickup reach through ordinary accepted movement, then let the
    // existing touch-target approach recover the same exact physical parcel.
    // No post-fall position, elapsed phase, event or recovery result is injected.
    runtime.dispatchRenderer({ type: "brace", active: true });
    runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
    for (let step = 0; step < 160 && distanceFromOriginalParcel() < 2.4; step += 1) {
      advancePlayerSteps(runtime, 1);
      expect(runtime.getRenderView().player.mode).not.toBe("swept");
    }
    expect(distanceFromOriginalParcel()).toBeGreaterThanOrEqual(2.4);
    // Turning is a real accepted step: looking away does not grant exact sight
    // of a parcel behind the player. Keep enough margin to remain out of reach.
    runtime.dispatchRenderer({ type: "movement", vector: { x: -1, y: 0 } });
    advancePlayerSteps(runtime, 1);
    runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    const distantParcel = runtime.getRenderView().looseCargo?.find(({ id }) => id === parcel.id);
    expect(distantParcel?.recovery).toBe("approach");
    await runtime.save();
    const beforeTarget = decodeCurrent(repository.snapshot());
    expect(runtime.getRenderView().player.mode).not.toBe("swept");
    const carriedPromiseQuantity = (lots: typeof beforeTarget.physicalCargo.carrier.lots) => (
      lots.reduce((quantity, lot) => quantity + (
        lot.payload.kind === "promise" && lot.payload.contractId === fixture.contractId
          ? lot.payload.quantity
          : 0
      ), 0)
    );
    const carriedBeforeTarget = carriedPromiseQuantity(beforeTarget.physicalCargo.carrier.lots);
    const cargoWorlds = (state: SerializedPhysicalCargoState) => (
      [state.looseWorld, ...state.inactiveWorlds.map(({ world }) => world)]
    );
    expect(cargoWorlds(beforeTarget.physicalCargo).some(({ history }) => history.some((record) => (
      record.kind === "scatter"
      && record.step === 0
      && record.entityIds.includes(parcel.id)
      && record.causes.includes("fall-separation")
    )))).toBe(true);
    soundscapePlay.mockClear();
    runtime.dispatchRenderer({ type: "parcel-target", parcelId: parcel.id, recoverOnArrival: true });
    expect(runtime.getRenderView().looseCargo?.some(({ id }) => id === parcel.id)).toBe(true);
    expect(runtime.getUIView().announcement?.message).toContain("Parcel marked");
    expect(soundscapePlay.mock.calls.filter(([cue, gain]) => (
      (cue === "strand" && gain === 0.58) || cue === "vocalization-relief"
    ))).toHaveLength(0);

    const project = uiProjection.projectUIView;
    let recoveryPresentations = 0;
    let recoveryAudioInsidePresentation = false;
    const recoveryAudio = () => soundscapePlay.mock.calls.filter(([cue, gain]) => (
      (cue === "strand" && gain === 0.58) || cue === "vocalization-relief"
    ));
    vi.spyOn(uiProjection, "projectUIView").mockImplementation((...args) => {
      const options = args[3];
      const worlds = [options?.looseCargoWorld, ...(options?.inactiveLooseCargoWorlds ?? [])];
      const exactPickup = worlds.some((world) => world?.history.some((record) => (
        record.entityIds.includes(parcel.id)
        && (record.kind === "pickup" || record.kind === "merge")
        && record.causes.includes("recovery")
      )));
      if (recoveryPresentations === 0
        && exactPickup
        && carriedPromiseQuantity(options?.looseCargoCarrier?.lots ?? []) === carriedBeforeTarget + parcel.quantity
        && worlds.every((world) => !world?.entities.some(({ id }) => id === parcel.id))) {
        recoveryPresentations += 1;
        recoveryAudioInsidePresentation ||= recoveryAudio().length > 0;
        if (reject) throw new Error("synthetic late recovery presentation fault");
      }
      return project(...args);
    });
    soundscapePlay.mockClear();
    let beforeRecovery: SaveRecord | undefined;
    for (let step = 0; step < 160 && recoveryPresentations === 0; step += 1) {
      await runtime.save();
      beforeRecovery = repository.snapshot();
      advancePlayerSteps(runtime, 1);
    }
    expect(recoveryPresentations).toBe(1);
    if (beforeRecovery === undefined) throw new Error("automatic recovery never reached its physical commit");
    expect(recoveryAudioInsidePresentation).toBe(false);
    expect(recoveryAudio().filter(([cue]) => cue === "strand")).toHaveLength(reject ? 0 : 1);
    expect(recoveryAudio().filter(([cue]) => cue === "vocalization-relief")).toHaveLength(reject ? 0 : 1);
    if (reject) {
      expect(runtime.getUIView().announcement?.message).toContain("INTEGRITY HALT");
      expect(repository.snapshot()).toEqual(beforeRecovery);
    }
    await runtime.save();
    const before = decodeCurrent(beforeRecovery);
    const after = decodeCurrent(repository.snapshot());
    expect(after.perceptionCarry.version).toBe(14);
    const looseQuantity = cargoWorlds(after.physicalCargo).flatMap(({ entities }) => entities)
      .reduce((quantity, { payload }) => quantity + (
        payload.kind === "promise" && payload.contractId === fixture.contractId ? payload.quantity : 0
      ), 0);
    expect(carriedPromiseQuantity(after.physicalCargo.carrier.lots) + looseQuantity).toBe(fixture.promiseQuantity);
    if (reject) {
      const { session: _beforeSession, integrity: _beforeIntegrity, ...beforeRoots } = before;
      const { session: _afterSession, integrity: _afterIntegrity, ...afterRoots } = after;
      expect(afterRoots).toEqual(beforeRoots);
      const { paused: _beforePaused, announcement: _beforeAnnouncement, nextAnnouncementId: _beforeAnnouncementId, ...beforeSession } = before.session;
      const { paused: _afterPaused, announcement: _afterAnnouncement, nextAnnouncementId: _afterAnnouncementId, ...afterSession } = after.session;
      expect(afterSession).toEqual(beforeSession);
    } else {
      const pickup = cargoWorlds(after.physicalCargo).flatMap(({ history }) => history).find((record) => (
        record.entityIds.includes(parcel.id)
        && (record.kind === "pickup" || record.kind === "merge")
        && record.causes.includes("recovery")
      ));
      if (pickup === undefined) throw new Error("committed recovery lost its exact receipt");
      expect(carriedPromiseQuantity(after.physicalCargo.carrier.lots)).toBe(carriedBeforeTarget + parcel.quantity);
      expect(recoveryAudio()).toEqual([
        ["strand", 0.58, 0, undefined],
        ["vocalization-relief", 0.68, pickup.ordinal >>> 0, 0],
      ]);
      expect(runtime.getRenderView().looseCargo?.some(({ id }) => id === parcel.id)).toBe(false);
    }
    runtime.destroy();
    soundscapePlay.mockClear();
    const reloaded = await createTideweftRuntime(repository);
    expect(reloaded.getUIView().title.hasSave).toBe(true);
    expect(recoveryAudio()).toEqual([]);
    await reloaded.save();
    expect(decodeCurrent(repository.snapshot()).physicalCargo).toEqual(after.physicalCargo);
    reloaded.destroy();
  });

  it("rejects a resealed current player snapshot whose regional cartography was left stale", async () => {
    const repository = new MemoryRepository();
    await createCurrentFixture(repository, "stale regional fall fixture", false);
    const stale = structuredClone(decodeCurrent(repository.snapshot()));
    const unseenIndex = stale.player.discovered.findIndex((value) => value !== FIXED_POINT);
    if (unseenIndex < 0) throw new Error("fixture unexpectedly discovered its entire regional window");
    stale.player.discovered[unseenIndex] = FIXED_POINT;
    replaceEnvelope(repository, stale);
    const invalidRecord = repository.snapshot();

    const rejected = await createTideweftRuntime(repository);
    expect(rejected.getUIView().title).toMatchObject({
      visible: true,
      requiresSeed: true,
    });
    expect(rejected.getUIView().saveWarning).toMatchObject({
      message: "LOCAL AUTOSAVE UNREADABLE",
    });
    await expect(rejected.save()).rejects.toThrow("Choose a seed before replacing");
    expect(repository.snapshot()).toEqual(invalidRecord);
    rejected.destroy();
  }, process.env.CI === "true" ? 90_000 : 30_000);

  it("turns one committed dry exhaustion boundary into conserved effort expression without replay", async () => {
    const repository = new MemoryRepository();
    const bootstrap = await createTideweftRuntime(repository);
    bootstrap.dispatchUI({
      type: "new-world",
      seed: "dry exhaustion expression",
      posture: "gale",
      sessionShape: "wander",
    });
    await bootstrap.save();
    bootstrap.destroy();
    replaceEnvelope(
      repository,
      relocateForDryExhaustion(decodeCurrent(repository.snapshot())),
    );

    soundscapePlay.mockClear();
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
    advancePlayerSteps(runtime, 1);
    runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });

    expect(runtime.getUIView().player.stamina).toBe(0);
    const expression = runtime.getRenderView().expressions?.find(({ sourceActorId }) =>
      sourceActorId === "player:local");
    expect(expression).toMatchObject({
      sourceActorId: "player:local",
      sourceKind: "player",
      speakerLabel: "You",
      tone: "strained",
    });
    expect(runtime.getUIView().expressionCaption).toMatchObject({
      id: expression?.id,
      presentationKind: "speech",
      speakerLabel: "You",
      tone: "strained",
      assertive: false,
    });
    expect(incidentCueCalls("vocalization-strained")).toBe(1);

    // The committed step remains authoritative after ordinary idle recovery
    // changes the current player state while the utterance is active.
    advancePlayerSteps(runtime, 2);
    expect(runtime.getUIView().player.stamina).toBe(0.0144);
    expect(runtime.getRenderView().expressions?.find(({ sourceActorId }) =>
      sourceActorId === "player:local")).toMatchObject({ id: expression?.id });

    await runtime.save();
    const exhausted = decodeCurrent(repository.snapshot());
    expect(exhausted.perceptionCarry).toMatchObject({
      version: 14,
      playerStepsSinceWorldTick: 3,
      situatedExpressionAdmissions: {
        version: 1,
        records: [{
          kind: "player-exhaustion",
          sourceActorId: "player:local",
          committedWorldTick: deserializeWorld(exhausted.world).meta.completedTick,
          admittedAtPlayerStepPhase: 1,
          acceptedDistanceUnits: expect.any(Number),
          resolution: "dry-exhaustion-camp",
          sampleOrdinal: 0,
        }],
      },
      situatedExpressionCausalAuthority: {
        version: 1,
        records: [expect.objectContaining({
          eventId: expression?.id,
          sourceActorId: "player:local",
          admittedAtPlayerStepPhase: 1,
          sampleOrdinal: 0,
        })],
      },
      situatedExpressionChannels: {
        version: 1,
        channels: [{
          sourceActorId: "player:local",
          state: {
            active: expect.objectContaining({
              eventId: expression?.id,
              meaning: "need-rest-after-exertion",
              family: "condition",
              tone: "strained",
              volume: "murmur",
              knowledgeBasis: "self-felt-exhaustion",
              audioAcknowledged: true,
            }),
          },
          reception: expect.objectContaining({
            eventId: expression?.id,
            sourceActorId: "player:local",
            kind: "self",
          }),
        }],
      },
      actorVocalizationSamples: [expect.objectContaining({
        expressionEventId: expression?.id,
        sourceActorId: "player:local",
        soundLoudness: 360_000,
        soundRangeUnits: 8_000,
        soundClass: "human-vocalization",
        soundInterrupt: "none",
      })],
    });
    expect(exhausted.perceptionCarry.playerStepStateSamples[0]).toMatchObject({
      version: 1,
      sampleOrdinal: 0,
      staminaBefore: 12_500,
      staminaAfter: 0,
      modeBefore: "foot",
      modeAfter: "camp",
      acceptedDistanceUnits: expect.any(Number),
      moved: true,
      exhausted: true,
      rescued: false,
      becameSwept: false,
      traversalIncidentKind: null,
      startingWaterDepth: 0,
      endingWaterDepth: 0,
    });
    expect(exhausted.perceptionCarry.playerStepStateAnchor).toEqual({
      version: 1,
      sampleOrdinal: 0,
      stamina: 12_500,
      mode: "foot",
    });
    expect(exhausted.perceptionCarry.playerStepStateSamples.slice(1)).toEqual([
      expect.objectContaining({ sampleOrdinal: 1, staminaBefore: 0, staminaAfter: 7_200 }),
      expect.objectContaining({ sampleOrdinal: 2, staminaBefore: 7_200, staminaAfter: 14_400 }),
    ]);
    expect(exhausted.player).toMatchObject({ stamina: 14_400, mode: "foot" });
    runtime.destroy();

    soundscapePlay.mockClear();
    scheduledFrame = undefined;
    const reloaded = await createTideweftRuntime(repository);
    expect(incidentCueCalls("vocalization-strained")).toBe(0);
    expect(reloaded.getRenderView().expressions?.find(({ sourceActorId }) =>
      sourceActorId === "player:local")).toMatchObject({ id: expression?.id });
    await reloaded.save();
    const roundTripped = decodeCurrent(repository.snapshot());
    expect(roundTripped.perceptionCarry.situatedExpressionAdmissions)
      .toEqual(exhausted.perceptionCarry.situatedExpressionAdmissions);
    expect(roundTripped.perceptionCarry.actorVocalizationSamples)
      .toEqual(exhausted.perceptionCarry.actorVocalizationSamples);
    reloaded.destroy();
  }, process.env.CI === "true" ? 90_000 : 30_000);

  it("preserves held-input exhaustion cooldown across consumed intervals and current reload", async () => {
    const bootstrapRepository = new MemoryRepository();
    const bootstrap = await createTideweftRuntime(bootstrapRepository);
    try {
      bootstrap.dispatchUI({
        type: "new-world",
        seed: "dry exhaustion expression",
        posture: "gale",
        sessionShape: "wander",
      });
      await bootstrap.save();
    } finally {
      bootstrap.destroy();
    }
    replaceEnvelope(
      bootstrapRepository,
      relocateForDryExhaustion(decodeCurrent(bootstrapRepository.snapshot())),
    );
    const initialRecord = bootstrapRepository.snapshot();

    const run = async (reloadAt: number | null) => {
      const repository = new MemoryRepository(initialRecord);
      let runtime = await createTideweftRuntime(repository);
      // Enabled uninterrupted run is compared with the unchanged, disabled
      // reload run below: instrumentation cannot create a different outcome.
      runtime.expressionDiagnostics!.setEnabled(reloadAt === null);
      const events: { step: number; eventId: string; triggerEventId: string }[] = [];
      const boundaryCarries: CurrentGameSaveEnvelope["perceptionCarry"][] = [];
      const modes: { step: number; mode: string; stamina: number }[] = [];
      const seen = new Set<string>();
      soundscapePlay.mockClear();
      let audioCalls = 0;
      try {
        runtime.dispatchUI({ type: "resume-world" });
        // The normal movement adapter owns every physical step. No voice,
        // stamina, camp, admission or sound is injected after initial setup.
        runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
        for (let step = 1; step <= 80; step += 1) {
          advancePlayerSteps(runtime, 1);
          const expression = runtime.getRenderView().expressions?.find(({ sourceActorId }) => (
            sourceActorId === "player:local"
          ));
          const newEvent = expression !== undefined && !seen.has(expression.id);
          // Both runs perform the same explicit save actions.
          if (newEvent || step % 10 === 0 || step === 49) {
            await runtime.save();
            const saved = decodeCurrent(repository.snapshot());
            if (newEvent) {
              const admission = saved.perceptionCarry.situatedExpressionAdmissions.records.find(
                ({ eventId }) => eventId === expression.id,
              );
              const active = saved.perceptionCarry.situatedExpressionChannels.channels.find(
                ({ sourceActorId }) => sourceActorId === "player:local",
              )?.state.active;
              expect(admission?.kind).toBe("player-exhaustion");
              expect(active).toMatchObject({
                eventId: expression.id,
                meaning: "need-rest-after-exertion",
                audioAcknowledged: true,
              });
              if (admission === undefined) throw new Error("actual effort lost its admission");
              seen.add(expression.id);
              events.push({ step, eventId: expression.id, triggerEventId: admission.triggerEventId });
            }
            if (step % 10 === 0) {
              expect(saved.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
              expect(saved.perceptionCarry.situatedExpressionChannels.channels.some(
                ({ sourceActorId }) => sourceActorId === "player:local",
              )).toBe(false);
              expect(saved.perceptionCarry.situatedExpressionAdmissions.records.some(
                ({ sourceActorId }) => sourceActorId === "player:local",
              )).toBe(false);
              boundaryCarries.push(saved.perceptionCarry);
            }
          }
          modes.push({
            step,
            mode: runtime.getRenderView().player.mode,
            stamina: runtime.getUIView().player.stamina,
          });
          if (step === reloadAt) {
            const saved = decodeCurrent(repository.snapshot());
            audioCalls += incidentCueCalls("vocalization-strained");
            runtime.destroy();
            soundscapePlay.mockClear();
            runtime = await createTideweftRuntime(repository);
            expect(runtime.getUIView().title.hasSave).toBe(true);
            expect(incidentCueCalls("vocalization-strained")).toBe(0);
            await runtime.save();
            expect(decodeCurrent(repository.snapshot()).perceptionCarry).toEqual(saved.perceptionCarry);
            expect(decodeCurrent(repository.snapshot()).playerExpressionRecency).toEqual(saved.playerExpressionRecency);
            runtime.dispatchUI({ type: "resume-world" });
            runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
          }
        }
        runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
        await runtime.save();
        const final = decodeCurrent(repository.snapshot());
        audioCalls += incidentCueCalls("vocalization-strained");
        return {
          events, boundaryCarries, modes, final, audioCalls,
          diagnosticRecords: runtime.expressionDiagnostics!.getSnapshot({
            sourceActorId: "player:local",
          }).records,
        };
      } finally {
        runtime.destroy();
      }
    };

    const uninterrupted = await run(null);
    const restored = await run(49);
    expect(restored.events).toEqual(uninterrupted.events);
    expect(restored.modes).toEqual(uninterrupted.modes);
    expect(restored.boundaryCarries).toEqual(uninterrupted.boundaryCarries);
    expect(restored.audioCalls).toBe(uninterrupted.audioCalls);
    expect(restored.diagnosticRecords).toEqual([]);
    expect(uninterrupted.diagnosticRecords.some(({ reason }) => reason === "effort-recency"))
      .toBe(true);
    expect(uninterrupted.diagnosticRecords.filter(({ reason }) => reason === "accepted"))
      .toHaveLength(uninterrupted.events.length);
    expect(uninterrupted.audioCalls).toBe(uninterrupted.events.length);
    // Several real micro-recoveries still happen. The optional effort utterance
    // stays quiet beyond the unchanged 36-step pending-sound cooldown, including
    // after a current reload at step49. No physical transition is suppressed.
    const campEntries = uninterrupted.modes.filter(({ mode }, index, modes) => (
      mode === "camp" && (index === 0 || modes[index - 1]!.mode !== "camp")
    ));
    expect(campEntries.length).toBeGreaterThan(1);
    expect(uninterrupted.events.map(({ step }) => step)).toEqual([1]);
    expect(uninterrupted.final.playerExpressionRecency.effort.lastAccepted).not.toBeNull();
    const { session: _firstSession, integrity: _firstIntegrity,
      regionalTravel: _firstTravel, ...firstRoots } = uninterrupted.final;
    const { session: _restoredSession, integrity: _restoredIntegrity,
      regionalTravel: _restoredTravel, ...restoredRoots } = restored.final;
    expect(restoredRoots).toEqual(firstRoots);
    const comparableTravel = (saved: CurrentGameSaveEnvelope) => {
      const travel = restorePlayerRegionalTravel(
        deserializeWorld(saved.world).meta.rootSeed, saved.player, saved.regionalTravel,
      );
      if (travel === null) throw new Error("terminal travel failed its actual owner validation");
      // Save captures a dirty chart snapshot without replacing runtime travel.
      // Reload adopts that published revision; later captures can legitimately
      // have one extra revision and derived seals. Compare every actual mark,
      // seed, origin, stream and version, not those publication counters/seals.
      const { revision, integrity: _chartSeal, ...chart } = travel.cartography;
      const { integrity: _travelSeal, cartography: _serializedChart, ...frame } = JSON.parse(
        saved.regionalTravel,
      ) as Record<string, unknown>;
      return { revision, facts: { chart, frame } };
    };
    const firstTravel = comparableTravel(uninterrupted.final);
    const restoredTravel = comparableTravel(restored.final);
    expect(restoredTravel.facts).toEqual(firstTravel.facts);
    // This later reload adopts an already-published, unchanged chart. Unlike
    // the former step19 capture, it creates no additional publication revision;
    // every cartographic fact is still compared above.
    expect(restoredTravel.revision).toBe(firstTravel.revision);
    console.info("Held-input exhaustion cooldown proof", {
      scope: "controlled current runtime, not natural play rate or hours annoyance acceptance",
      fixedSteps: 80,
      physicalCampEntrySteps: campEntries.map(({ step }) => step),
      acceptedEventSteps: uninterrupted.events.map(({ step }) => step),
      actualVocalAudio: uninterrupted.audioCalls,
      consumedIntervals: uninterrupted.boundaryCarries.length,
      reloadAtStep: 49,
      currentReloadEventAndPhysicalEquivalence: true,
      excludedPublicationFields: ["session", "envelope integrity", "chart revision and seals"],
    });
  }, process.env.CI === "true" ? 120_000 : 60_000);

  it.each([false, true])("normalizes phase-ten effort history and rolls it back on late failure (reject=%s)", async (reject) => {
    const repository = new MemoryRepository();
    const bootstrap = await createTideweftRuntime(repository);
    bootstrap.dispatchUI({ type: "new-world", seed: "dry exhaustion expression", posture: "gale", sessionShape: "wander" });
    await bootstrap.save();
    bootstrap.destroy();
    replaceEnvelope(repository, dryExhaustionAtTenthStep(decodeCurrent(repository.snapshot())));
    let runtime = await createTideweftRuntime(repository);
    try {
      runtime.dispatchUI({ type: "resume-world" });
      runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
      advancePlayerSteps(runtime, 9);
      await runtime.save();
      const beforeRecord = repository.snapshot();
      const before = decodeCurrent(beforeRecord);
      expect(before.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
      expect(before.playerExpressionRecency.effort.lastAccepted).toBeNull();
      expect(before.perceptionCarry.playerStepStateSamples.every((step) => step?.exhausted === false)).toBe(true);
      const close = expressionChannelBank.closeSituatedExpressionChannelBankInterval;
      let closes = 0;
      if (reject) vi.spyOn(expressionChannelBank, "closeSituatedExpressionChannelBankInterval")
        .mockImplementation((...args) => ++closes === 1 ? null : close(...args));
      soundscapePlay.mockClear();
      advancePlayerSteps(runtime, 1);
      if (reject) {
        expect(closes).toBe(1);
        expect(runtime.getUIView().announcement?.message).toContain("INTEGRITY HALT");
        expect(repository.snapshot()).toEqual(beforeRecord);
        expect(incidentCueCalls("vocalization-strained")).toBe(0);
        await runtime.save();
        const rolledBack = decodeCurrent(repository.snapshot());
        expect(rolledBack.playerExpressionRecency).toEqual(before.playerExpressionRecency);
        expect(rolledBack.perceptionCarry).toEqual(before.perceptionCarry);
        expect(rolledBack.player).toEqual(before.player);
        expect(rolledBack.world).toEqual(before.world);
      } else {
        expect(incidentCueCalls("vocalization-strained")).toBe(1);
        await runtime.save();
        const closed = decodeCurrent(repository.snapshot());
        expect(closed.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
        expect(closed.perceptionCarry.situatedExpressionAdmissions.records.some((r) => r.kind === "player-exhaustion")).toBe(false);
        expect(closed.playerExpressionRecency.effort.lastAccepted).toMatchObject({
          step: { sampleOrdinal: 9, exhausted: true },
          admission: { committedWorldTick: deserializeWorld(before.world).meta.completedTick, admittedAtPlayerStepPhase: 9 },
        });
        runtime.destroy();
        soundscapePlay.mockClear();
        runtime = await createTideweftRuntime(repository);
        expect(runtime.getUIView().title.hasSave).toBe(true);
        expect(incidentCueCalls("vocalization-strained")).toBe(0);
        expect(runtime.getRenderView().expressions?.some((event) => event.sourceActorId === "player:local")).toBe(false);
        await runtime.save();
        expect(decodeCurrent(repository.snapshot()).playerExpressionRecency).toEqual(closed.playerExpressionRecency);
      }
    } finally { runtime.destroy(); }
  }, 60_000);

  it("preserves effort history during pause and deliberately adopts supported47/48 without replay", async () => {
    const repository = new MemoryRepository();
    const bootstrap = await createTideweftRuntime(repository);
    bootstrap.dispatchUI({ type: "new-world", seed: "dry exhaustion expression", posture: "gale", sessionShape: "wander" });
    await bootstrap.save();
    bootstrap.destroy();
    replaceEnvelope(repository, relocateForDryExhaustion(decodeCurrent(repository.snapshot())));
    const runtime = await createTideweftRuntime(repository);
    try {
      runtime.dispatchUI({ type: "resume-world" });
      runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
      advancePlayerSteps(runtime, 1);
      await runtime.save();
      const pendingRecord = repository.snapshot();
      const pending = decodeCurrent(repository.snapshot());
      expect(pending.playerExpressionRecency.effort.lastAccepted).not.toBeNull();
      runtime.dispatchUI({ type: "open-title" });
      advancePlayerSteps(runtime, 40);
      await runtime.save();
      expect(decodeCurrent(repository.snapshot()).playerExpressionRecency).toEqual(pending.playerExpressionRecency);
      expect(decodeCurrent(repository.snapshot()).perceptionCarry).toEqual(pending.perceptionCarry);
      runtime.dispatchUI({ type: "resume-world" });
      runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
      advancePlayerSteps(runtime, 9);
      await runtime.save();
      const consumed = decodeCurrent(repository.snapshot());
      expect(consumed.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
      for (const saved of [pending, consumed]) {
        for (const version of [47, 48]) {
        const { playerExpressionRecency: _newHistory, integrity: _oldSeal, ...legacyRoots } = saved;
        const legacy = { ...legacyRoots, version,
          ...(version === 48 ? { playerEffortRecency: saved.playerExpressionRecency.effort } : {}) };
        const legacyRepository = new MemoryRepository({
          ...repository.snapshot(), payloadVersion: version,
          playTicks: deserializeWorld(saved.world).meta.completedTick,
          worldJson: JSON.stringify({ ...legacy, integrity: gameSaveEnvelopeIntegrity(legacy) }),
        });
        soundscapePlay.mockClear();
        const loaded = await createTideweftRuntime(legacyRepository);
        try {
          expect(loaded.getUIView().title.hasSave).toBe(true);
          expect(incidentCueCalls("vocalization-strained")).toBe(0);
          await loaded.save();
          const migrated = decodeCurrent(legacyRepository.snapshot());
          expect(migrated.perceptionCarry).toEqual(saved.perceptionCarry);
          expect(migrated.playerExpressionRecency.effort.lastAccepted).toEqual(
            version === 48 || saved === pending ? saved.playerExpressionRecency.effort.lastAccepted : null,
          );
        } finally { loaded.destroy(); }
        const forged = version === 47
          ? { ...legacy, playerEffortRecency: saved.playerExpressionRecency.effort }
          : { ...legacy, playerExpressionRecency: saved.playerExpressionRecency };
        const forgedRepository = new MemoryRepository({
          ...legacyRepository.snapshot(), payloadVersion: version,
          worldJson: JSON.stringify({ ...forged, integrity: gameSaveEnvelopeIntegrity(forged) }),
        });
        const rejected = await createTideweftRuntime(forgedRepository);
        try { expect(rejected.getUIView().title.hasSave).toBe(false); }
        finally { rejected.destroy(); }
        }
      }
      const recoveryRecency: PlayerEffortRecencyState[] = [];
      for (const recovering of [false, true]) {
        const branchRepository = new MemoryRepository(pendingRecord);
        const branch = await createTideweftRuntime(branchRepository);
        try {
          branch.dispatchUI({ type: "resume-world" });
          if (recovering) {
            branch.dispatchUI({ type: "recover", action: "begin" });
            expect(branch.getRenderView().player.recoveryKind).toBe("rest");
            branch.start();
            const callback = scheduledFrame;
            if (!callback) throw new Error("REST did not schedule its bounded frame");
            scheduledFrame = undefined;
            callback(nextFrameTime);
            nextFrameTime += 100;
            branch.stop();
          } else advancePlayerSteps(branch, 10);
          await branch.save();
          const after = decodeCurrent(branchRepository.snapshot());
          expect(after.perceptionCarry.playerStepsSinceWorldTick).toBe(1);
          expect(deserializeWorld(after.world).meta.completedTick).toBe(deserializeWorld(pending.world).meta.completedTick + 1);
          recoveryRecency.push(after.playerExpressionRecency.effort);
        } finally { branch.destroy(); }
      }
      expect(recoveryRecency[0]).toEqual(recoveryRecency[1]);
      expect(recoveryRecency[0]).toEqual(pending.playerExpressionRecency.effort);
    } finally { runtime.destroy(); }
  }, 60_000);

  it("rejects resealed missing or contradictory effort history without overwriting the save", async () => {
    const repository = new MemoryRepository();
    const bootstrap = await createTideweftRuntime(repository);
    bootstrap.dispatchUI({ type: "new-world", seed: "dry exhaustion expression", posture: "gale", sessionShape: "wander" });
    await bootstrap.save();
    bootstrap.destroy();
    replaceEnvelope(repository, relocateForDryExhaustion(decodeCurrent(repository.snapshot())));
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
    advancePlayerSteps(runtime, 1);
    await runtime.save();
    runtime.destroy();
    const saved = decodeCurrent(repository.snapshot());
    const last = saved.playerExpressionRecency.effort.lastAccepted;
    if (last === null) throw new Error("fixture lost accepted effort history");
    const { playerExpressionRecency: _removed, ...missing } = saved;
    const variants = [
      missing,
      { ...saved, playerExpressionRecency: null },
      ...[
        { ...saved.playerExpressionRecency.effort, lastAccepted: null },
        { ...saved.playerExpressionRecency.effort, remaining: 36 },
        { ...saved.playerExpressionRecency.effort, rootSeed: [1, 2, 3, 4] },
        { ...saved.playerExpressionRecency.effort, lastAccepted: { ...last, predecessor: { ...last.predecessor, stamina: 14_000 } } },
      ].map((effort) => ({ ...saved, playerExpressionRecency: { ...saved.playerExpressionRecency, effort } })),
    ];
    for (const invalid of variants) {
      const badRepository = new MemoryRepository(repository.snapshot());
      replaceEnvelope(badRepository, invalid as CurrentGameSaveEnvelope);
      const before = badRepository.snapshot();
      soundscapePlay.mockClear();
      const rejected = await createTideweftRuntime(badRepository);
      try {
        expect(rejected.getUIView().title.hasSave).toBe(false);
        expect(rejected.getUIView().saveWarning).toBeDefined();
        await expect(rejected.save()).rejects.toThrow("Choose a seed");
        expect(badRepository.snapshot()).toEqual(before);
        expect(incidentCueCalls("vocalization-strained")).toBe(0);
      } finally { rejected.destroy(); }
    }
  }, 60_000);

  it("rejects a resealed movement sample whose dry physical evidence contradicts the world", async () => {
    const repository = new MemoryRepository();
    const bootstrap = await createTideweftRuntime(repository);
    bootstrap.dispatchUI({
      type: "new-world",
      seed: "dry exhaustion admission tamper",
      posture: "gale",
      sessionShape: "wander",
    });
    await bootstrap.save();
    bootstrap.destroy();
    replaceEnvelope(
      repository,
      relocateForDryExhaustion(decodeCurrent(repository.snapshot())),
    );

    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
    advancePlayerSteps(runtime, 1);
    runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    await runtime.save();
    runtime.destroy();

    const tampered = structuredClone(decodeCurrent(repository.snapshot()));
    const stepState = tampered.perceptionCarry.playerStepStateSamples[0];
    if (stepState === null || stepState === undefined) {
      throw new Error("effort tamper fixture omitted its movement-owned step state");
    }
    const mutableStepState = stepState as { startingWaterDepth: number };
    mutableStepState.startingWaterDepth = stepState.startingWaterDepth === 0 ? 1 : 0;
    replaceEnvelope(repository, tampered);

    scheduledFrame = undefined;
    const rejected = await createTideweftRuntime(repository);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();
  }, process.env.CI === "true" ? 90_000 : 30_000);

  it("cannot transplant coherent exhaustion speech onto an ordinary dry footstep", async () => {
    const bootstrapRepository = new MemoryRepository();
    const bootstrap = await createTideweftRuntime(bootstrapRepository);
    bootstrap.dispatchUI({
      type: "new-world",
      seed: "dry exhaustion coordinated forgery",
      posture: "gale",
      sessionShape: "wander",
    });
    await bootstrap.save();
    bootstrap.destroy();

    const exhaustedStart = relocateForDryExhaustion(
      decodeCurrent(bootstrapRepository.snapshot()),
    );
    replaceEnvelope(bootstrapRepository, exhaustedStart);
    const exhaustedRepository = new MemoryRepository(bootstrapRepository.snapshot());
    const ordinaryRepository = new MemoryRepository(bootstrapRepository.snapshot());
    replaceEnvelope(ordinaryRepository, {
      ...exhaustedStart,
      player: {
        ...exhaustedStart.player,
        // This remains inside the exhaustion predicate's maximum-spend
        // envelope, but a cheap dry meadow step lawfully leaves reserve.
        stamina: 18_000,
      },
      perceptionCarry: {
        ...exhaustedStart.perceptionCarry,
        playerStepStateAnchor: {
          ...exhaustedStart.perceptionCarry.playerStepStateAnchor,
          stamina: 18_000,
        },
      },
    });

    scheduledFrame = undefined;
    const exhaustedRuntime = await createTideweftRuntime(exhaustedRepository);
    exhaustedRuntime.dispatchUI({ type: "resume-world" });
    exhaustedRuntime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
    advancePlayerSteps(exhaustedRuntime, 1);
    exhaustedRuntime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    await exhaustedRuntime.save();
    exhaustedRuntime.destroy();

    scheduledFrame = undefined;
    const ordinaryRuntime = await createTideweftRuntime(ordinaryRepository);
    ordinaryRuntime.dispatchUI({ type: "resume-world" });
    ordinaryRuntime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
    advancePlayerSteps(ordinaryRuntime, 1);
    ordinaryRuntime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    await ordinaryRuntime.save();
    ordinaryRuntime.destroy();

    const exhausted = decodeCurrent(exhaustedRepository.snapshot());
    const ordinary = decodeCurrent(ordinaryRepository.snapshot());
    expect(ordinary.perceptionCarry.playerSenseSamples)
      .toEqual(exhausted.perceptionCarry.playerSenseSamples);
    expect(ordinary.perceptionCarry.playerStepStateSamples[0]).toMatchObject({
      staminaBefore: 18_000,
      staminaAfter: expect.any(Number),
      modeAfter: "foot",
      moved: true,
      exhausted: false,
      traversalIncidentKind: null,
    });
    expect(ordinary.perceptionCarry.playerStepStateSamples[0]?.staminaAfter)
      .toBeGreaterThan(0);
    expect(exhausted.perceptionCarry.situatedExpressionAdmissions.records)
      .toEqual([expect.objectContaining({ kind: "player-exhaustion" })]);
    expect(ordinary.perceptionCarry.situatedExpressionAdmissions.records).toEqual([]);

    const forged = structuredClone(ordinary);
    const forgedCarry = forged.perceptionCarry as unknown as {
      situatedExpressionAdmissions: SituatedExpressionAdmissionLedger;
      situatedExpressionCausalAuthority: SituatedExpressionCausalAuthorityLedger;
      situatedExpressionChannels: SituatedExpressionChannelBank;
      actorVocalizationSamples: readonly humanPerception.SupplementalSoundSample[];
      playerStepStateSamples: readonly (PlayerStepStateSample | null)[];
    };
    forgedCarry.situatedExpressionAdmissions = structuredClone(
      exhausted.perceptionCarry.situatedExpressionAdmissions,
    );
    forgedCarry.situatedExpressionCausalAuthority = structuredClone(
      exhausted.perceptionCarry.situatedExpressionCausalAuthority,
    );
    forgedCarry.situatedExpressionChannels = structuredClone(
      exhausted.perceptionCarry.situatedExpressionChannels,
    );
    forgedCarry.actorVocalizationSamples = structuredClone(
      exhausted.perceptionCarry.actorVocalizationSamples,
    );
    forgedCarry.playerStepStateSamples = structuredClone(
      exhausted.perceptionCarry.playerStepStateSamples,
    );
    // Coordinate the visible final state with the transplanted exhausted
    // trajectory too. Reauthentication must reject the unexplained 18,000 to
    // 12,500 predecessor gap itself, not merely an ordinary final-player tail.
    forged.player.stamina = 0;
    forged.player.mode = "camp";
    forged.player.pace = "rest";
    replaceEnvelope(exhaustedRepository, forged);

    scheduledFrame = undefined;
    const rejected = await createTideweftRuntime(exhaustedRepository);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();
  }, process.env.CI === "true" ? 120_000 : 45_000);

  it("keeps stationary and wading exhaustion outside the dry-effort voice gate", async () => {
    for (const scenario of ["already-zero", "wading"] as const) {
      const repository = new MemoryRepository();
      const bootstrap = await createTideweftRuntime(repository);
      bootstrap.dispatchUI({
        type: "new-world",
        seed: `dry exhaustion negative ${scenario}`,
        posture: "gale",
        sessionShape: "wander",
      });
      await bootstrap.save();
      bootstrap.destroy();
      const relocated = relocateForDryExhaustion(
        decodeCurrent(repository.snapshot()),
        scenario === "wading" ? 40_000 : 0,
      );
      replaceEnvelope(repository, scenario === "already-zero"
        ? {
            ...relocated,
            player: { ...relocated.player, stamina: 0 },
          }
        : relocated);

      soundscapePlay.mockClear();
      scheduledFrame = undefined;
      const runtime = await createTideweftRuntime(repository);
      runtime.dispatchUI({ type: "resume-world" });
      runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
      advancePlayerSteps(runtime, 1);
      runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
      expect(runtime.getRenderView().expressions?.some(({ sourceActorId }) =>
        sourceActorId === "player:local")).toBe(false);
      expect(incidentCueCalls("vocalization-strained")).toBe(0);
      await runtime.save();
      const savedCarry = decodeCurrent(repository.snapshot()).perceptionCarry;
      expect(savedCarry.playerStepStateSamples).toHaveLength(1);
      expect(savedCarry.playerStepStateSamples[0]).not.toBeNull();
      expect(savedCarry.situatedExpressionAdmissions.records.some(({ kind }) =>
        kind === "player-exhaustion")).toBe(false);
      runtime.destroy();
    }
  }, process.env.CI === "true" ? 90_000 : 30_000);

  it.each([false, true])("composes a current storm shelter whine with real Promise fall and cargo impact (visible=%s)", async (visible) => {
    const repository = new MemoryRepository();
    const fixture = await createCurrentFixture(repository, "fall cargo exact test", true);
    if (fixture.contractId === null || fixture.sourceLotId === null) {
      throw new Error("mixed scene omitted its genuinely acquired Promise cargo");
    }
    const before = decodeCurrent(repository.snapshot());
    const world = deserializeWorld(before.world);
    const travel = restorePlayerRegionalTravel(world.meta.rootSeed, before.player, before.regionalTravel);
    const playerPosition = travel === null ? null
      : playerWorldPositionInRegionalWindow(travel.window, before.player);
    const roster = deserializeDogActorRoster(before.dogActorRoster);
    const work = deserializeSettlementWorkingAnimalState(before.settlementWorkingAnimals);
    const settlement = deserializeSettlementEcologyState(before.settlementEcology);
    const assignment = work?.assignments[0];
    const guardian = roster?.actors.find(({ identity }) => identity.stableId === assignment?.workerActorId);
    const custody = settlement.domesticCustodies.find(({ relationshipId }) => (
      relationshipId === assignment?.workerCustodyRelationshipId
    ));
    if (travel === null || playerPosition === null || roster === null || guardian === undefined || custody === undefined
      || assignment === undefined) {
      throw new Error("mixed scene omitted its current physical guardian/custody/travel");
    }
    // Stage the same body's wet condition, low competing needs and physical
    // location near the existing fall. No observation, intent, work
    // transaction, expression or sound is supplied by this test.
    // Retain the original open dog tile in both cases. The visible twin
    // starts the player 200 units north: the same real diagonal movement
    // reaches the east ridge without south-edge clamping, earning diagonal
    // facing. Sight, cognition and the whine are never supplied by this test.
    const dogPosition = translateWorldPosition(playerPosition, 75, 75);
    const kennelDelta = worldPositionDelta(dogPosition, custody.homeStructure.position);
    expect(Math.hypot(kennelDelta.x, kennelDelta.y)).toBeGreaterThan(custody.homeStructure.radiusUnits);
    let wetGuardian = repositionDogActor(replaceDogActorPhysiology(guardian, {
      needs: { hunger: 0, thirst: 0, rest: 0, safety: 0, company: 0 },
      condition: { ...guardian.condition, wetness: FIXED_POINT, injuries: [...guardian.condition.injuries] },
      humanFamiliarity: guardian.humanFamiliarity,
      atTick: world.meta.completedTick,
    }), {
      position: dogPosition, heading: guardian.address.heading, atTick: world.meta.completedTick,
    });
    const circadian = projectSettlementWorkingDogCircadian({
      dog: wetGuardian, custody, assignment, atTick: world.meta.completedTick,
      kennelArrived: Math.hypot(kennelDelta.x, kennelDelta.y) <= custody.homeStructure.radiusUnits,
    });
    if (circadian === null) throw new Error("mixed scene could not reproject actual kennel arrival");
    wetGuardian = replaceDogActorCircadian(wetGuardian, {
      atTick: world.meta.completedTick, circadian: circadian.receipt,
    });
    const stagedRoster = replaceDogActorInRoster(roster, wetGuardian);
    if (stagedRoster === null) throw new Error("mixed scene rejected its same finite guardian");
    const stagedPlayer = visible
      ? { ...before.player, y: before.player.y - 200, previousY: before.player.y - 200 }
      : before.player;
    const stagedTravel = capturePlayerRegionalTravel(travel, stagedPlayer);
    const stagedPlayerPosition = playerWorldPositionInRegionalWindow(stagedTravel.window, stagedPlayer);
    if (stagedPlayerPosition === null) throw new Error("mixed scene lost its initial physical player pose");
    replaceEnvelope(repository, {
      ...before,
      player: stagedPlayer,
      regionalTravel: serializePlayerRegionalTravel(stagedTravel),
      perceptionCarry: { ...before.perceptionCarry, intervalStartPosition: stagedPlayerPosition },
      dogActorRoster: serializeDogActorRoster(stagedRoster),
    });
    const observerDisabledStart = repository.snapshot();

    soundscapePlay.mockClear();
    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getUIView().saveWarning).toBeUndefined();
    runtime.expressionDiagnostics!.setEnabled(true);
    const diagnosticAppend = vi.spyOn(expressionDiagnostics, "appendExpressionDiagnostic");
    runtime.dispatchUI({ type: "resume-world" });
    // Nine accepted neutral steps are real simulation, not an edited phase.
    // Fall on the due world step so short physical cues coexist with the call.
    advancePlayerSteps(runtime, 9);
    runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 1 } });
    advancePlayerSteps(runtime, 1);
    runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    const mixedView = runtime.getRenderView();
    expect(mixedView.player.incident?.kind).toBe("fall");
    await runtime.save();
    const saved = decodeCurrent(repository.snapshot());
    const savedGuardian = deserializeDogActorRoster(saved.dogActorRoster)?.actors.find(({ identity }) => (
      identity.stableId === guardian.identity.stableId
    ));
    if (savedGuardian === undefined) throw new Error("mixed scene lost its finite guardian body");
    const savedTravel = restorePlayerRegionalTravel(world.meta.rootSeed, saved.player, saved.regionalTravel);
    if (savedTravel === null) throw new Error("mixed scene lost its saved physical frame");
    const guardianPlacement = livingActorAddressInRegionalWindow(savedGuardian.address, savedTravel.window);
    if (guardianPlacement === null) throw new Error("mixed guardian left the active physical frame");
    const savedSpatialWorld = createRegionalWorldView(
      createWorldView(deserializeWorld(saved.world)), savedTravel.window,
      { discovered: saved.player.discovered, depthSoundings: saved.player.depthSoundings },
    );
    expect(mixedView.acousticText).toEqual(expect.arrayContaining([
      expect.objectContaining({ acousticKind: "speech", sourceActorId: "player:local" }),
      expect.objectContaining({ acousticKind: "physical", sourceId: "player:local", semanticFamily: "thud" }),
      expect.objectContaining({ acousticKind: "physical", sourceKind: "object" }),
    ]));
    // Both cases use an actual weather/work-owned call. Direct sight alone
    // permits its exact body anchor; stronger cargo speech remains primary
    // without deleting the whine or its lawful receipt.
    const whineAdmission = saved.perceptionCarry.situatedExpressionAdmissions.records.find(({ kind }) => (
      kind === "guardian-dog-shelter-whine"
    ));
    const whineChannel = saved.perceptionCarry.situatedExpressionChannels.channels.find(({ sourceActorId }) => (
      sourceActorId === guardian.identity.stableId
    ));
    expect(whineAdmission).toMatchObject({
      sourceActorId: guardian.identity.stableId,
      assignmentId: assignment.assignmentId,
      acceptedAtTick: world.meta.completedTick + 1,
      admittedAtPlayerStepPhase: 0,
    });
    expect(whineChannel).toMatchObject({
      state: {
        active: {
          eventId: whineAdmission?.eventId,
          position: savedGuardian.address.position,
          meaning: "guardian-dog-shelter-whine",
          audioAcknowledged: true,
        },
      },
      reception: {
        eventId: whineAdmission?.eventId,
        kind: visible ? "heard-visible" : "heard-unseen",
        directVisualReceipt: visible,
        receivedAtTick: world.meta.completedTick + 1,
      },
    });
    expect(whineChannel?.reception?.certainty).toBeGreaterThan(0);
    const guardianCall = mixedView.acousticText?.find((item) => (
      item.acousticKind === "animal-call" && item.sourceActorId === guardian.identity.stableId
    ));
    expect(saved.perceptionCarry.intervalStartPosition)
      .toEqual(playerWorldPositionInRegionalWindow(savedTravel.window, saved.player));
    expect(saved.perceptionCarry.intervalStartFacingMilliRadians).toBe(saved.player.facingMilliRadians);
    expect(saved.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    const detailSight = projectPerception(savedSpatialWorld, saved.player).detailVisibilityGrades;
    expect(detailSight[guardianPlacement.tileIndex] === VISIBILITY_DIRECT).toBe(visible);
    expect(saved.perceptionCarry.actorVocalizationSamples.filter(({ expressionEventId, sourceActorId }) => (
      expressionEventId === whineAdmission?.eventId && sourceActorId === guardian.identity.stableId
    ))).toEqual([
      expect.objectContaining({
        position: savedGuardian.address.position, soundClass: "animal-call", soundInterrupt: "none",
      }),
    ]);
    if (visible) {
      const visibleDog = mixedView.dogs?.find(({ actorId }) => actorId === guardian.identity.stableId);
      if (visibleDog === undefined || guardianCall === undefined) {
        throw new Error("directly perceived guardian omitted its body or actual call projection");
      }
      expect(guardianCall.id).toBe(whineAdmission?.eventId);
      // Equivalent render projections may differ by floating-point rounding.
      // The authoritative body/event/sample world positions above stay exact.
      expect(guardianCall.position.x).toBeCloseTo(visibleDog.position.x, 10);
      expect(guardianCall.position.y).toBeCloseTo(visibleDog.position.y, 10);
    } else {
      expect(guardianCall).toBeUndefined();
      expect(mixedView.acousticText?.some((item) => (
        item.acousticKind !== "physical" && item.sourceActorId === guardian.identity.stableId
      ))).toBe(false);
      expect(mixedView.dogs?.some(({ actorId }) => actorId === guardian.identity.stableId)).toBe(false);
    }
    const cargoSpeech = mixedView.acousticText?.find(({ acousticKind }) => acousticKind === "speech");
    expect(runtime.getUIView().expressionCaption).toMatchObject({
      id: cargoSpeech?.id, text: "We've lost cargo!", presentationKind: "speech",
    });
    expect(incidentCueCalls("vocalization-dog-shelter-whine")).toBe(1);
    expect(incidentCueCalls("vocalization-alarm")).toBe(1);
    const inspector = runtime.expressionDiagnostics!;
    const dogDecisions = inspector.getSnapshot({ sourceActorId: guardian.identity.stableId }).records;
    expect(dogDecisions).toHaveLength(1);
    const dogDecision = dogDecisions[0]!;
    expect(dogDecision).toMatchObject({
      reason: "accepted",
      event: { eventId: whineAdmission?.eventId },
      producerContext: {
        kind: "guardian-dog-shelter-whine",
        input: {
          completedTick: world.meta.completedTick + 1,
          shelterIntentScore: whineAdmission?.kind === "guardian-dog-shelter-whine"
            ? whineAdmission.shelterIntentScore : undefined,
          dog: { intent: { kind: "seek-shelter", cause: { referenceId: "condition:weather-exposure" } } },
          workingAnimals: { assignments: [expect.objectContaining({
            currentActivity: expect.objectContaining({ activity: "defer-to-actor" }),
          })] },
        },
      },
    });
    const beforeReplay = structuredClone({ render: mixedView, ui: runtime.getUIView(), calls: soundscapePlay.mock.calls });
    expect(inspector.replayProducer(dogDecision.sequence)).toMatchObject({
      scope: "captured-producer-and-kernel-replay", producerKind: "guardian-dog-shelter-whine",
      actualRuntimeReason: "accepted", candidate: dogDecision.intent,
      accepted: true, reason: "accepted", realization: dogDecision.realization,
    });
    const listening = dogDecision.listeningContext;
    expect(listening).not.toBeNull();
    if (listening === null || listening.contact === null) {
      throw new Error("actual heard shelter whine omitted its captured listening contact");
    }
    const observedListening = diagnosticAppend.mock.calls.find(([, input]) => (
      input.intent.sourceActorId === guardian.identity.stableId
      && input.intent.meaning === "guardian-dog-shelter-whine"
    ))?.[1].listeningContext;
    expect(observedListening).toEqual(listening);
    expect(listening).not.toBe(observedListening);
    expect(listening.input).not.toBe(observedListening?.input);
    expect(listening.input.source).not.toBe(observedListening?.input.source);
    expect(listening.contact).not.toBe(observedListening?.contact);
    const listenerDelta = worldPositionDelta(saved.perceptionCarry.intervalStartPosition, savedGuardian.address.position);
    expect(listening.input.listener).toEqual({ x: 0, y: 0 });
    expect(listening.input.source).toEqual({ x: listenerDelta.x, y: listenerDelta.y });
    expect(evaluateAudibleContact(listening.input)).toEqual(listening.contact);
    expect(dogDecision.playerReception).toEqual(whineChannel?.reception);
    expect(dogDecision.playerReception?.certainty).toBe(Math.max(1, Math.round(listening.contact.certainty * FIXED_POINT)));
    for (const value of [listening, listening.input, listening.input.listener, listening.input.source,
      listening.input.wind, listening.contact, listening.contact.bearing, listening.contact.distanceBand]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    const beforeListening = { diagnostics: structuredClone(inspector.getSnapshot()), record: repository.snapshot() };
    const baseline = inspector.previewListening(dogDecision.sequence);
    const masked = inspector.previewListening(dogDecision.sequence, { ambientNoise: 1 });
    expect(baseline).toEqual({
      scope: "captured-player-listening-preview", actualRuntimeReason: "accepted",
      actualContact: listening.contact, actualPlayerReception: dogDecision.playerReception,
      candidateInput: listening.input, hypotheticalContact: listening.contact,
      notEvaluated: ["physical-environment-change", "terrain/structure/foliage-transmission", "sleep-policy",
        "visibility/identification", "comprehension", "npc-reception", "causal-admission", "audio/presentation"],
    });
    expect(masked).toEqual({ ...baseline, candidateInput: { ...listening.input, ambientNoise: 1 }, hypotheticalContact: null });
    expect(baseline?.actualContact).not.toBe(listening.contact);
    expect(baseline?.candidateInput).not.toBe(listening.input);
    expect(baseline?.candidateInput.source).not.toBe(listening.input.source);
    expect(Object.isFrozen(baseline?.actualContact)).toBe(true);
    expect(Object.isFrozen(baseline?.candidateInput.source)).toBe(true);
    expect(Object.isFrozen(masked?.candidateInput)).toBe(true);
    expect(Reflect.set(listening.input.source, "x", 999_999)).toBe(false);
    expect(Reflect.set(listening.contact, "certainty", 0)).toBe(false);
    expect(inspector.getSnapshot()).toEqual(beforeListening.diagnostics);
    expect({ render: runtime.getRenderView(), ui: runtime.getUIView(), calls: soundscapePlay.mock.calls })
      .toEqual(beforeReplay);
    expect(repository.snapshot()).toEqual(beforeListening.record);
    await runtime.save();
    expect(repository.snapshot().worldJson).toBe(beforeListening.record.worldJson);
    for (const marker of ["listeningContext", "candidateInput", "captured-player-listening-preview", "previewListening"]) {
      expect(repository.snapshot().worldJson).not.toContain(marker);
    }
    expect(inspector.reset()).toMatchObject({ enabled: true, totalCount: 0, evictedCount: 0, records: [] });
    expect(inspector.previewListening(dogDecision.sequence)).toBeNull();
    expect(inspector.replayProducer(dogDecision.sequence)).toBeNull();
    expect({ render: runtime.getRenderView(), ui: runtime.getUIView(), calls: soundscapePlay.mock.calls })
      .toEqual(beforeReplay);
    await runtime.save();
    expect(repository.snapshot().worldJson).toBe(beforeListening.record.worldJson);

    // Use actual runtime candidates with a deterministic test camera. These
    // are production layout envelopes, not browser font/glyph measurements.
    for (const [width, height] of [[1_280, 720], [390, 844]] as const) {
      const viewport = actorCalloutViewport(width, height);
      const anchor = (item: NonNullable<TideweftView["acousticText"]>[number]) => ({
        x: width / 2 + (item.position.x - mixedView.player.position.x) * 0.05,
        y: height / 2 + (item.position.y - mixedView.player.position.y) * 0.05,
      });
      const layout = layoutAcousticTextCallouts(mixedView.acousticText ?? [], viewport, anchor);
      expect(layout.placements.length).toBeGreaterThan(0);
      expect(layout.placements.length).toBeLessThanOrEqual(4);
      expect(new Set(layout.placements.map(({ candidate }) => candidate.sourceId)).size)
        .toBe(layout.placements.length);
      expect(layout.placements.some(({ candidate }) => candidate.acousticText.acousticKind === "speech"))
        .toBe(true);
      if (visible) {
        expect(layout.placements.some(({ candidate }) => candidate.id === guardianCall?.id)).toBe(true);
      }
      expect(layout.suppressions.some(({ candidate, reason }) => (
        candidate.acousticText.acousticKind === "physical" && candidate.sourceId === "player:local"
        && reason === "per-source-cap"
      ))).toBe(true);
      for (let index = 0; index < layout.placements.length; index += 1) {
        for (const other of layout.placements.slice(index + 1)) {
          expect(acousticTextRectsOverlap(layout.placements[index]!.rect, other.rect)).toBe(false);
        }
      }
      expect(layoutAcousticTextCallouts([...(mixedView.acousticText ?? [])].reverse(), viewport, anchor))
        .toEqual(layout);
    }

    const incident = saved.traversalFeedback.incident;
    if (incident === null) throw new Error("mixed scene omitted its authoritative fall incident");
    expect(incidentCueCalls(incident.cue)).toBe(2);
    const savedWork = deserializeSettlementWorkingAnimalState(saved.settlementWorkingAnimals);
    expect(savedGuardian?.intent).toMatchObject({
      kind: "seek-shelter", enteredAtTick: world.meta.completedTick + 1,
      cause: { kind: "condition", referenceId: "condition:weather-exposure" },
    });
    expect(savedWork?.assignments.find(({ workerActorId }) => workerActorId === guardian.identity.stableId)
      ?.currentActivity).toMatchObject({
      activity: "defer-to-actor", acceptedAtTick: world.meta.completedTick + 1,
      cause: { kind: "actor-disposition", referenceId: "actor-intent:seek-shelter" },
    });
    expect(deserializeSettlementEcologyState(saved.settlementEcology).domesticCustodies)
      .toEqual(settlement.domesticCustodies);
    expect(promiseQuantity(saved.physicalCargo, fixture.contractId)).toBe(fixture.promiseQuantity);
    expect(saved.physicalCargo.looseWorld.entities.some(({ payload }) => (
      payload.kind === "promise" && payload.contractId === fixture.contractId
    ))).toBe(true);
    const calls = [...soundscapePlay.mock.calls];
    runtime.destroy();
    const reloaded = await createTideweftRuntime(repository);
    expect(reloaded.getUIView().saveWarning).toBeUndefined();
    expect(reloaded.expressionDiagnostics!.getSnapshot()).toMatchObject({ enabled: false, records: [] });
    expect(reloaded.expressionDiagnostics!.replayProducer(dogDecision.sequence)).toBeNull();
    expect(reloaded.expressionDiagnostics!.previewListening(dogDecision.sequence)).toBeNull();
    reloaded.expressionDiagnostics!.setEnabled(true);
    expect(reloaded.expressionDiagnostics!.previewListening(dogDecision.sequence)).toBeNull();
    expect(soundscapePlay.mock.calls).toEqual(calls);
    expect(reloaded.getRenderView().acousticText?.some(({ acousticKind }) => acousticKind === "physical"))
      .toBe(false);
    if (visible) {
      // Continuing the same retained label is not a fresh utterance. Reload
      // must keep its exact event/locus/progress and cannot replay the cue.
      expect(reloaded.getRenderView().acousticText?.find(({ id }) => id === guardianCall?.id))
        .toEqual(guardianCall);
    }
    await reloaded.save();
    const roundtrip = decodeCurrent(repository.snapshot());
    for (const key of ["world", "player", "regionalTravel", "regionalEcology", "physicalCargo", "dogActorRoster",
      "settlementWorkingAnimals", "perceptionCarry"] as const) {
      expect(stableStringify(roundtrip[key])).toBe(stableStringify(saved[key]));
    }
    reloaded.destroy();

    // Repeat exactly the same actual fixed steps from the same current save
    // with the observer off. Full saved roots and committed audio must agree.
    const disabledRepository = new MemoryRepository(observerDisabledStart);
    soundscapePlay.mockClear();
    const disabled = await createTideweftRuntime(disabledRepository);
    try {
      disabled.dispatchUI({ type: "resume-world" });
      advancePlayerSteps(disabled, 9);
      disabled.dispatchRenderer({ type: "movement", vector: { x: 1, y: 1 } });
      advancePlayerSteps(disabled, 1);
      disabled.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
      await disabled.save();
      expect(decodeCurrent(disabledRepository.snapshot())).toEqual(saved);
      expect(soundscapePlay.mock.calls).toEqual(calls);
      expect(disabled.expressionDiagnostics!.getSnapshot().records).toEqual([]);
      expect(disabled.expressionDiagnostics!.previewListening(dogDecision.sequence)).toBeNull();
    } finally { disabled.destroy(); }

    if (!visible) {
      // The real whine is mapped before this later interval-closure failure.
      // Its staged diagnostic must not survive any more than its audio/roots.
      const failedRepository = new MemoryRepository(observerDisabledStart);
      const failed = await createTideweftRuntime(failedRepository);
      try {
        failed.expressionDiagnostics!.setEnabled(true);
        failed.dispatchUI({ type: "resume-world" });
        advancePlayerSteps(failed, 9);
        await failed.save();
        const beforeFailureRecord = failedRepository.snapshot();
        const beforeFailure = decodeCurrent(beforeFailureRecord);
        const close = expressionChannelBank.closeSituatedExpressionChannelBankInterval;
        let closes = 0;
        const closure = vi.spyOn(expressionChannelBank, "closeSituatedExpressionChannelBankInterval")
          .mockImplementation((...args) => ++closes === 1 ? null : close(...args));
        const mapper = vi.spyOn(dogExpression, "guardianDogShelterWhineExpressionIntent");
        soundscapePlay.mockClear();
        diagnosticAppend.mockClear();
        try {
          failed.dispatchRenderer({ type: "movement", vector: { x: 1, y: 1 } });
          advancePlayerSteps(failed, 1);
          expect(closes).toBe(1);
          expect(mapper.mock.results.some(({ type, value }) => type === "return"
            && value?.meaning === "guardian-dog-shelter-whine")).toBe(true);
          expect(diagnosticAppend.mock.calls.some(([, input]) => input.intent.meaning === "guardian-dog-shelter-whine"
            && input.reason === "accepted" && input.listeningContext !== null && input.listeningContext !== undefined
            && input.listeningContext.contact !== null)).toBe(true);
          expect(failed.getUIView().announcement?.message).toContain("INTEGRITY HALT");
          expect(failedRepository.snapshot()).toEqual(beforeFailureRecord);
          expect(failed.expressionDiagnostics!.getSnapshot().records).toEqual([]);
          expect(failed.expressionDiagnostics!.replayProducer(1)).toBeNull();
          expect(failed.expressionDiagnostics!.previewListening(1)).toBeNull();
          expect(incidentCueCalls("vocalization-dog-shelter-whine")).toBe(0);
          await failed.save();
          const rolledBack = decodeCurrent(failedRepository.snapshot());
          for (const key of ["world", "player", "regionalTravel", "regionalEcology", "physicalCargo",
            "dogActorRoster", "settlementWorkingAnimals", "perceptionCarry", "fieldResources",
            "playerExpressionRecency", "promiseJourney"] as const) {
            expect(rolledBack[key]).toEqual(beforeFailure[key]);
          }
        } finally { closure.mockRestore(); mapper.mockRestore(); }
      } finally { failed.destroy(); }
    }
  }, 60_000);

  it("turns one deterministic diagonal ridge fall into persistent recoverable Promise parcels", async () => {
    const repository = new MemoryRepository();
    const fixture = await createCurrentFixture(
      repository,
      "fall cargo exact test",
      true,
    );
    if (
      fixture.contractId === null
      || fixture.sourceLotId === null
      || fixture.sourceCondition === null
    ) throw new Error("Promise fixture lost its source identity");

    const humanPerceptionSpy = vi.spyOn(
      humanPerception,
      "collectExistingHumanObservations",
    );
    soundscapePlay.mockClear();
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    expect(runtime.getUIView().objective?.title).toContain("DELIVER");
    const staminaBefore = FIXED_POINT;
    runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 1 } });
    advancePlayerSteps(runtime, 1);
    runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });

    const fallenView = runtime.getRenderView();
    expect(fallenView.player.incident).toMatchObject({
      id: "player:0:traversal:0",
      kind: "fall",
    });
    expect(fallenView.player.balanceState).toBe("fallen");
    expect(fallenView.acousticText).toEqual(expect.arrayContaining([
      expect.objectContaining({
        acousticKind: "speech",
        sourceActorId: "player:local",
      }),
      expect.objectContaining({
        acousticKind: "physical",
        sourceId: "player:local",
        semanticFamily: "thud",
      }),
      expect.objectContaining({
        acousticKind: "physical",
        sourceKind: "object",
        semanticFamily: expect.stringMatching(/^(?:clatter|thud)$/u),
      }),
    ]));
    // X-before-Y is authoritative: the porter reaches the ridge edge and does
    // not also commit the diagonal edge after this first mishap.
    expect(renderedTileIndex(fallenView)).toBe(fixture.corner.ridgeTileIndex);
    expect(renderedTileIndex(fallenView)).not.toBe(fixture.corner.diagonalTileIndex);
    expect(runtime.getUIView().player.stamina).toBeLessThan(staminaBefore);
    expect(runtime.getUIView().objective).toMatchObject({
      id: `recover-${fixture.contractId}`,
      eyebrow: "Recover loose Promise cargo",
    });
    const cargoLossExpression = playerExpression(runtime, "alarmed");
    expect(cargoLossExpression.text.length).toBeGreaterThan(0);
    expect(incidentCueCalls("vocalization-alarm")).toBe(1);
    expect(runtime.getUIView().chronicle).toContainEqual(expect.objectContaining({
      id: "incident-player:0:traversal:0",
      new: true,
    }));
    expect(runtime.getUIView().announcement?.message.startsWith(
      fallenView.player.incident?.label ?? "missing-incident",
    )).not.toBe(true);
    expect(runtime.getUIView().announcement?.message).toContain(
      "Cargo can separate; regain your feet before moving.",
    );

    await runtime.save();
    const fallenSave = decodeCurrent(repository.snapshot());
    expect(fallenSave).toMatchObject({
      version: 49,
      player: {
        worldWidth: REGIONAL_TRAVEL_COLUMNS,
        worldHeight: REGIONAL_TRAVEL_ROWS,
      },
      physicalCargo: {
        version: 2,
        activeRegion: { x: 0, y: 0 },
      },
    });
    expect(Object.keys(fallenSave.perceptionCarry).sort()).toEqual([
      "actorVocalizationSamples",
      "animalContactAcousticCarry",
      "intervalStartFacingMilliRadians",
      "intervalStartPosition",
      "intervalStartWasSleeping",
      "nextPlayerSenseSampleOrdinal",
      "playerSenseSamples",
      "playerStepStateAnchor",
      "playerStepStateSamples",
      "playerStepsSinceWorldTick",
      "situatedExpressionAdmissions",
      "situatedExpressionCausalAuthority",
      "situatedExpressionChannels",
      "version",
    ]);
    expect(fallenSave.perceptionCarry).toMatchObject({
      version: 14,
      intervalStartPosition: expect.any(Object),
      intervalStartFacingMilliRadians: expect.any(Number),
      playerStepsSinceWorldTick: 1,
      nextPlayerSenseSampleOrdinal: 1,
      situatedExpressionAdmissions: {
        version: 1,
        records: [{
          kind: "player-traversal",
          causalClass: "cargo-separation",
          admittedAtPlayerStepPhase: 1,
          sampleOrdinal: 0,
        }],
      },
      situatedExpressionCausalAuthority: {
        version: 1,
        records: [expect.objectContaining({
          eventId: cargoLossExpression.id,
          sourceActorId: "player:local",
          sampleOrdinal: 0,
          admittedAtPlayerStepPhase: 1,
        })],
      },
      situatedExpressionChannels: {
        version: 1,
        channels: [{
          sourceActorId: "player:local",
          state: {
            active: { eventId: cargoLossExpression.id, audioAcknowledged: true },
          },
          reception: {
            eventId: cargoLossExpression.id,
            sourceActorId: "player:local",
            kind: "self",
          },
        }],
      },
    });
    expect(fallenSave.perceptionCarry.playerSenseSamples.map(({ sampleOrdinal }) => sampleOrdinal))
      .toEqual([0]);
    expect(fallenSave.perceptionCarry.actorVocalizationSamples).toEqual([
      expect.objectContaining({
        id: `av-${deserializeWorld(fallenSave.world).meta.completedTick}-0`,
        sourceActorId: "player:local",
        soundClass: "human-vocalization",
        soundInterrupt: "strong",
      }),
    ]);
    const reloadedDuringFall = await createTideweftRuntime(repository);
    expect(reloadedDuringFall.getRenderView().acousticText?.some(
      ({ acousticKind }) => acousticKind === "physical",
    )).toBe(false);
    reloadedDuringFall.destroy();
    expect(restorePlayerRegionalTravel(
      deserializeWorld(fallenSave.world).meta.rootSeed,
      fallenSave.player,
      fallenSave.regionalTravel,
    )).not.toBeNull();
    const incident = fallenSave.traversalFeedback.incident;
    if (!incident) throw new Error("fall incident did not persist");
    expect(incident).toMatchObject({
      id: "player:0:traversal:0",
      actorId: 0,
      traversalOrdinal: 0,
      kind: "fall",
    });
    expect(incident.label).toMatch(/rock|ridge|balance/u);
    expect(incident.primaryCause).not.toBe("invalid-input");
    expect(fallenSave.traversalFeedback).toMatchObject({
      nextTraversalOrdinal: 1,
      lastAudibleIncidentId: incident.id,
    });
    // One cue belongs to the committed body impact and one to the separately
    // conserved cargo impact. The exact count guards both dropped audio and a
    // retry/adapter duplication at the post-commit side-effect boundary.
    expect(incidentCueCalls(incident.cue)).toBe(2);

    const parcels = fallenSave.physicalCargo.looseWorld.entities.filter(({ payload }) =>
      payload.kind === "promise" && payload.contractId === fixture.contractId);
    expect(parcels.length).toBeGreaterThan(0);
    expect(promiseQuantity(fallenSave.physicalCargo, fixture.contractId))
      .toBe(fixture.promiseQuantity);
    expect(parcels.every(({ materialState }) =>
      materialState.condition < fixture.sourceCondition!)).toBe(true);
    // The same production step immediately advances loose parcels, so their
    // live causal signature truthfully describes the latest terrain/weather
    // forces. The append-only scatter record retains the originating fall.
    expect(parcels.every(({ causalSignature }) => causalSignature.length > 0)).toBe(true);
    expect(fallenSave.physicalCargo.looseWorld.history.some((record) =>
      record.kind === "scatter"
      && record.causes.includes("fall-separation"))).toBe(true);
    const parcelIds = parcels.map(({ id }) => id);
    expect(parcelIds[0]).toBe(`lc:0:0:parcel:${fixture.nextParcelOrdinal}`);
    const sourceOccurrences = fallenSave.physicalCargo.carrier.lots.filter(({ id }) =>
      id === fixture.sourceLotId).length;
    expect(sourceOccurrences).toBeLessThanOrEqual(1);
    if (sourceOccurrences === 0) {
      expect(fallenSave.physicalCargo.carrier.retiredLotIds).toContain(fixture.sourceLotId);
    }
    // Repeating input while the committed incident still owns control neither
    // accepts another expression nor replays the same human vocalization.
    runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 1 } });
    advancePlayerSteps(runtime, 1);
    runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    expect(playerExpression(runtime, "alarmed").id).toBe(cargoLossExpression.id);
    expect(incidentCueCalls("vocalization-alarm")).toBe(1);

    // The player line remains visible through the presentation that closes its
    // exact ten-step perception interval. The world receives distinct physical
    // impact and vocalization samples, then retires the interval-owned channel.
    // Its presentation-only remainder stays readable without reopening actor
    // hearing or replaying audio; the later relief line proves an ordinary
    // same-source replacement still retires that stale remainder.
    advancePlayerSteps(runtime, 8);
    expect(playerExpression(runtime, "alarmed").id).toBe(cargoLossExpression.id);
    advancePlayerSteps(runtime, 1);
    expect(playerExpression(runtime, "alarmed")).toMatchObject({
      id: cargoLossExpression.id,
      progress: 10 / 14,
    });
    expect(runtime.getUIView().expressionCaption?.id).toBe(cargoLossExpression.id);
    expect((runtime.getRenderView().looseCargo ?? []).some((parcel) =>
      parcelIds.includes(parcel.id) && parcel.recovery === "reachable")).toBe(true);
    const perceptionInput = humanPerceptionSpy.mock.calls
      .map(([input]) => input)
      .find(({ supplementalSoundSamples }) => supplementalSoundSamples?.some(
        ({ soundClass }) => soundClass === "human-vocalization",
      ));
    if (!perceptionInput) {
      throw new Error("fall vocalization never reached the human perception bridge");
    }
    const impactSamples = perceptionInput.playerSamples.filter(({ soundClass }) =>
      soundClass === "physical-thud");
    const vocalizationSamples = (perceptionInput.supplementalSoundSamples ?? []).filter(({
      soundClass,
    }) =>
      soundClass === "human-vocalization");
    expect(impactSamples).toHaveLength(1);
    expect(vocalizationSamples).toHaveLength(1);
    expect(vocalizationSamples[0]).toMatchObject({
      soundInterrupt: "strong",
    });
    expect(vocalizationSamples[0]?.id).not.toBe(impactSamples[0]?.id);
    expect(vocalizationSamples[0]?.position).toEqual(impactSamples[0]?.position);
    const recoverableParcel = (runtime.getRenderView().looseCargo ?? [])
      .find((parcel) => parcelIds.includes(parcel.id) && parcel.recovery === "reachable");
    if (!recoverableParcel) {
      throw new Error("fall fixture lost every exact reachable Promise parcel");
    }
    await runtime.save();
    const beforeRecovery = decodeCurrent(repository.snapshot());
    const recoveredEntity = beforeRecovery.physicalCargo.looseWorld.entities
      .find(({ id }) => id === recoverableParcel.id);
    if (!recoveredEntity || recoveredEntity.payload.kind !== "promise") {
      throw new Error("selected recovery target is not the saved fall-separated Promise parcel");
    }
    const carriedBeforeRecovery = beforeRecovery.physicalCargo.carrier.lots
      .reduce((quantity, lot) => quantity + (
        lot.payload.kind === "promise" && lot.payload.contractId === fixture.contractId
          ? lot.payload.quantity
          : 0
      ), 0);
    const reliefCueCount = incidentCueCalls("vocalization-relief");
    const confirmationCueCount = soundscapePlay.mock.calls.filter(([cue, gain]) => (
      cue === "strand" && gain === 0.58
    )).length;
    runtime.dispatchRenderer({
      type: "parcel-target",
      parcelId: recoverableParcel.id,
      recoverOnArrival: true,
    });

    const recoveryExpression = playerExpression(runtime, "relieved");
    const reliefCueCountAfterRecovery = incidentCueCalls("vocalization-relief");
    // Within-reach manual targeting commits immediately, without requiring
    // any RAF step. The automatic transaction change must not mute this path.
    expect(soundscapePlay.mock.calls.filter(([cue, gain]) => (
      cue === "strand" && gain === 0.58
    ))).toHaveLength(confirmationCueCount + 1);
    expect(soundscapePlay.mock.calls).toContainEqual(["strand", 0.58]);
    expect(recoveryExpression.id).not.toBe(cargoLossExpression.id);
    expect(reliefCueCountAfterRecovery).toBe(reliefCueCount + 1);
    expect((runtime.getRenderView().looseCargo ?? []).map(({ id }) => id))
      .not.toContain(recoverableParcel.id);

    await runtime.save();
    const recoveredSave = decodeCurrent(repository.snapshot());
    expect(recoveredSave.physicalCargo.looseWorld.entities.map(({ id }) => id))
      .not.toContain(recoverableParcel.id);
    const carriedAfterRecovery = recoveredSave.physicalCargo.carrier.lots
      .reduce((quantity, lot) => quantity + (
        lot.payload.kind === "promise" && lot.payload.contractId === fixture.contractId
          ? lot.payload.quantity
          : 0
      ), 0);
    expect(carriedAfterRecovery).toBe(
      carriedBeforeRecovery + recoveredEntity.payload.quantity,
    );
    expect(promiseQuantity(recoveredSave.physicalCargo, fixture.contractId))
      .toBe(fixture.promiseQuantity);
    expect(recoveredSave.physicalCargo.looseWorld.history.some((record) =>
      (record.kind === "pickup" || record.kind === "merge")
      && record.entityIds.includes(recoverableParcel.id)
      && record.causes.includes("recovery"))).toBe(true);
    const remainingParcelIds = recoveredSave.physicalCargo.looseWorld.entities
      .filter(({ payload }) =>
        payload.kind === "promise" && payload.contractId === fixture.contractId)
      .map(({ id }) => id);
    expect(remainingParcelIds).toEqual(parcelIds.filter((id) => id !== recoverableParcel.id));
    const visibleParcelIds = (runtime.getRenderView().looseCargo ?? []).map(({ id }) => id);
    const recoveredRecord = repository.snapshot();

    // Let the original runtime finish the pending perception interval. This is
    // the reference for the interrupted branch below.
    advancePlayerSteps(runtime, 9);
    await runtime.save();
    const uninterruptedSave = decodeCurrent(repository.snapshot());
    expect(uninterruptedSave.perceptionCarry.actorVocalizationSamples).toEqual([]);
    const uninterruptedResidentPerception = deserializeWorld(uninterruptedSave.world)
      .residents.map(({ id, perception }) => ({ id, perception }));
    const materialAndHistory = {
      entities: uninterruptedSave.physicalCargo.looseWorld.entities,
      history: uninterruptedSave.physicalCargo.looseWorld.history,
      historyBaseOrdinal: uninterruptedSave.physicalCargo.looseWorld.historyBaseOrdinal,
      historyArchiveHash: uninterruptedSave.physicalCargo.looseWorld.historyArchiveHash,
      retiredLotIds: uninterruptedSave.physicalCargo.carrier.retiredLotIds,
    };
    runtime.destroy();

    const cueCountBeforeReload = incidentCueCalls(incident.cue);
    const resumedRepository = new MemoryRepository(recoveredRecord);
    humanPerceptionSpy.mockClear();
    const resumed = await createTideweftRuntime(resumedRepository);
    expect(incidentCueCalls(incident.cue)).toBe(cueCountBeforeReload);
    // Reload preserves the still-active expression and its semantic cooldown,
    // but its acknowledged audio is not replayed.
    expect(playerExpression(resumed, "relieved").id).toBe(recoveryExpression.id);
    expect(resumed.getUIView().expressionCaption?.id)
      .toBe(recoveryExpression.id);
    expect(incidentCueCalls("vocalization-relief")).toBe(reliefCueCountAfterRecovery);
    expect((resumed.getRenderView().looseCargo ?? []).map(({ id }) => id)).toEqual(visibleParcelIds);
    if (remainingParcelIds.length > 0) {
      expect(resumed.getUIView().objective?.id).toBe(`recover-${fixture.contractId}`);
    } else {
      expect(resumed.getUIView().objective?.title).toContain("DELIVER");
    }
    advancePlayerSteps(resumed, 9);
    const resumedPerceptionInput = humanPerceptionSpy.mock.calls
      .map(([input]) => input)
      .find(({ supplementalSoundSamples }) => supplementalSoundSamples?.some(
        ({ id }) => id === recoveredSave.perceptionCarry.actorVocalizationSamples[0]?.id,
      ));
    expect(resumedPerceptionInput?.supplementalSoundSamples).toContainEqual(
      recoveredSave.perceptionCarry.actorVocalizationSamples[0],
    );
    await resumed.save();
    const roundTripped = decodeCurrent(resumedRepository.snapshot());
    expect(roundTripped.perceptionCarry.actorVocalizationSamples).toEqual([]);
    expect(deserializeWorld(roundTripped.world).residents
      .map(({ id, perception }) => ({ id, perception })))
      .toEqual(uninterruptedResidentPerception);
    expect({
      entities: roundTripped.physicalCargo.looseWorld.entities,
      history: roundTripped.physicalCargo.looseWorld.history,
      historyBaseOrdinal: roundTripped.physicalCargo.looseWorld.historyBaseOrdinal,
      historyArchiveHash: roundTripped.physicalCargo.looseWorld.historyArchiveHash,
      retiredLotIds: roundTripped.physicalCargo.carrier.retiredLotIds,
    }).toEqual(materialAndHistory);
    expect(roundTripped.traversalFeedback).toEqual(uninterruptedSave.traversalFeedback);
    expect(promiseQuantity(roundTripped.physicalCargo, fixture.contractId))
      .toBe(fixture.promiseQuantity);
    resumed.destroy();
  }, process.env.CI === "true" ? 90_000 : 30_000);

  it("rejects a resealed player expression whose active event and cooldown agree with each other but not causal authority", async () => {
    const repository = new MemoryRepository();
    await createCurrentFixture(repository, "fall expression authority tamper", true);
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 1 } });
    advancePlayerSteps(runtime, 1);
    runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    await runtime.save();
    runtime.destroy();

    const record = repository.snapshot();
    const decoded = JSON.parse(record.worldJson) as Record<string, unknown>;
    const carry = decoded.perceptionCarry as {
      situatedExpressionChannels: {
        channels: Array<{
          sourceActorId: string;
          state: {
            active: { priority: number } | null;
            recent: Array<{ priority: number }>;
          };
        }>;
      };
    };
    const playerChannel = carry.situatedExpressionChannels.channels
      .find(({ sourceActorId }) => sourceActorId === "player:local");
    const active = playerChannel?.state.active;
    const memory = playerChannel?.state.recent[0];
    if (!active || !memory) throw new Error("player authority fixture omitted its expression");
    active.priority += 1;
    memory.priority += 1;
    const { integrity: _integrity, ...base } = decoded;
    repository.replace({
      ...record,
      updatedAt: record.updatedAt + 1,
      worldJson: JSON.stringify({
        ...base,
        integrity: gameSaveEnvelopeIntegrity(base),
      }),
    });

    scheduledFrame = undefined;
    const rejected = await createTideweftRuntime(repository);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();
  }, process.env.CI === "true" ? 90_000 : 30_000);

  it("rejects a bound player vocalization and expression moved away from the carried physical path", async () => {
    const repository = new MemoryRepository();
    await createCurrentFixture(repository, "fall expression path tamper", true);
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 1 } });
    advancePlayerSteps(runtime, 1);
    runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    await runtime.save();
    runtime.destroy();

    const record = repository.snapshot();
    const decoded = JSON.parse(record.worldJson) as Record<string, unknown>;
    const carry = decoded.perceptionCarry as {
      actorVocalizationSamples: Array<{ position: { localX: number } }>;
      situatedExpressionChannels: {
        channels: Array<{
          sourceActorId: string;
          state: { active: { position: { localX: number } } | null };
        }>;
      };
    };
    const playerChannel = carry.situatedExpressionChannels.channels
      .find(({ sourceActorId }) => sourceActorId === "player:local");
    const active = playerChannel?.state.active;
    const sample = carry.actorVocalizationSamples[0];
    if (!active || !sample) throw new Error("player path fixture omitted its bound expression");
    active.position.localX += 5 * TILE_UNITS;
    sample.position.localX += 5 * TILE_UNITS;
    const { integrity: _integrity, ...base } = decoded;
    repository.replace({
      ...record,
      updatedAt: record.updatedAt + 1,
      worldJson: JSON.stringify({
        ...base,
        integrity: gameSaveEnvelopeIntegrity(base),
      }),
    });

    scheduledFrame = undefined;
    const rejected = await createTideweftRuntime(repository);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();
  }, process.env.CI === "true" ? 90_000 : 30_000);

  it("applies one terrain fall to an empty porter without inventing player cargo", async () => {
    const repository = new MemoryRepository();
    const fixture = await createCurrentFixture(
      repository,
      "fall cargo exact test",
      false,
    );
    soundscapePlay.mockClear();
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    const staminaBefore = FIXED_POINT;
    runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 1 } });
    advancePlayerSteps(runtime, 1);
    runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    await runtime.save();

    const fallen = decodeCurrent(repository.snapshot());
    const incident = fallen.traversalFeedback.incident;
    if (!incident) throw new Error("empty porter fall incident did not persist");
    expect(incident).toMatchObject({
      id: "player:0:traversal:0",
      kind: "fall",
      traversalOrdinal: 0,
    });
    expect(renderedTileIndex(runtime.getRenderView())).toBe(fixture.corner.ridgeTileIndex);
    expect(fallen.player.stamina).toBeLessThan(staminaBefore);
    expect(fallen.physicalCargo.carrier.lots).toEqual([]);
    expect(fallen.physicalCargo.looseWorld.entities.every(({ payload }) =>
      payload.kind === "provision"
    )).toBe(true);
    expect(fallen.physicalCargo.expectedManifest.entries.every(({ payloadKey }) =>
      payloadKey === "provision:dried-fish"
    )).toBe(true);
    const staminaAfterFall = fallen.player.stamina;
    const cueCount = incidentCueCalls(incident.cue);

    runtime.dispatchRenderer({ type: "movement", vector: { x: -1, y: -1 } });
    advancePlayerSteps(runtime, 1);
    runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    await runtime.save();
    const repeated = decodeCurrent(repository.snapshot());
    expect(repeated.traversalFeedback.nextTraversalOrdinal).toBe(1);
    expect(repeated.player.stamina).toBeGreaterThanOrEqual(staminaAfterFall);
    expect(repeated.physicalCargo.carrier.lots).toEqual([]);
    expect(repeated.physicalCargo.looseWorld.entities.every(({ payload }) =>
      payload.kind === "provision"
    )).toBe(true);
    expect(repeated.physicalCargo.expectedManifest.entries.every(({ payloadKey }) =>
      payloadKey === "provision:dried-fish"
    )).toBe(true);
    expect(incidentCueCalls(incident.cue)).toBe(cueCount);
    runtime.destroy();
  });
});

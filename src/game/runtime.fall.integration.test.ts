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
import * as humanPerception from "./humanPerception";
import { TILE_UNITS, type PlayerState } from "./player";
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
import type { PlayerStepStateAnchor, PlayerStepStateSample } from "./playerStepState";
import type { WorldPosition } from "./worldPosition";

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
  readonly version: 45;
  readonly world: string;
  readonly player: PlayerState;
  readonly session: GameSessionState;
  readonly fieldResources: FieldResourceEcologyState;
  readonly traversalFeedback: TraversalFeedbackState;
  readonly physicalCargo: SerializedPhysicalCargoState;
  readonly regionalTravel: string;
  readonly promiseJourney: RegionalPromiseJourneyState;
  readonly perceptionCarry: {
    readonly version: 13;
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
    || envelope.version !== 45
    || record.payloadVersion !== 45
  ) {
    throw new Error("fixture did not produce a current v45 regional session save");
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
    payloadVersion: 45,
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

describe("production terrain fall and physical cargo", () => {
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
      version: 13,
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
      version: 45,
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
      version: 13,
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
    runtime.dispatchRenderer({
      type: "parcel-target",
      parcelId: recoverableParcel.id,
      recoverOnArrival: true,
    });

    const recoveryExpression = playerExpression(runtime, "relieved");
    const reliefCueCountAfterRecovery = incidentCueCalls("vocalization-relief");
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

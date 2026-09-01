import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import { createWorldView, deserializeWorld } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import {
  FIXED_POINT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type WorldView,
} from "../sim/types";
import type { FieldResourceEcologyState } from "../sim/fieldResources";
import { TILE_UNITS, type PlayerState } from "./player";
import {
  gameSaveEnvelopeIntegrity,
  type PhysicalCargoState,
} from "./physicalCargoState";
import {
  capturePlayerRegionalTravel,
  restorePlayerRegionalTravel,
  serializePlayerRegionalTravel,
  type RegionalPlayerTravelState,
} from "./regionalPlayerTravel";
import { projectRegionalCartographyRegion } from "./regionalCartography";
import type { RegionalPromiseJourneyState } from "./regionalPromiseJourney";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_HALO_TILES,
  REGIONAL_TRAVEL_ROWS,
} from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import type { GameSessionState } from "./sessionTypes";
import type { TraversalFeedbackState } from "./traversalFeedback";

vi.mock("../audio/soundscape", () => ({
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(): void {}
    updateAmbience(): void {}
    destroy(): void {}
  },
}));

interface V4GameSaveEnvelope {
  readonly format: "tideweft-session";
  readonly version: 4;
  readonly world: string;
  readonly player: PlayerState;
  readonly session: GameSessionState;
  readonly fieldResources: FieldResourceEcologyState;
  readonly traversalFeedback: TraversalFeedbackState;
  readonly physicalCargo: PhysicalCargoState;
  readonly regionalTravel: string;
  readonly promiseJourney: RegionalPromiseJourneyState;
  readonly integrity: string;
}

interface AcceptedPromiseFixture {
  readonly contractId: number;
  readonly lotId: string;
  readonly payload: PhysicalCargoState["carrier"]["lots"][number]["payload"];
  readonly manifest: PhysicalCargoState["expectedManifest"];
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
    if (!this.record) throw new Error("regional integration fixture has no autosave");
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
  for (let frame = 0; frame <= count; frame += 1) {
    const callback = scheduledFrame;
    if (!callback) throw new Error("runtime did not schedule its next frame");
    scheduledFrame = undefined;
    callback(nextFrameTime);
    nextFrameTime += 100;
  }
  runtime.stop();
}

function decodeV4(record: SaveRecord): V4GameSaveEnvelope {
  const value = JSON.parse(record.worldJson) as V4GameSaveEnvelope;
  if (
    value.format !== "tideweft-session"
    || value.version !== 4
    || record.payloadVersion !== 4
  ) throw new Error("fixture did not produce a current v4 regional save");
  const { integrity, ...unsealed } = value;
  if (integrity !== gameSaveEnvelopeIntegrity(unsealed)) {
    throw new Error("fixture v4 outer envelope does not match its integrity seal");
  }
  expect(Object.keys(value).sort()).toEqual([
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
  ]);
  return value;
}

function replaceEnvelope(
  repository: MemoryRepository,
  envelope: V4GameSaveEnvelope,
): void {
  const { integrity: _priorIntegrity, ...unsealed } = envelope;
  const sealed: V4GameSaveEnvelope = {
    ...unsealed,
    integrity: gameSaveEnvelopeIntegrity(unsealed),
  };
  const prior = repository.snapshot();
  repository.replace({
    ...prior,
    payloadVersion: 4,
    updatedAt: prior.updatedAt + 1,
    worldJson: JSON.stringify(sealed),
  });
}

async function createCurrentSave(
  repository: MemoryRepository,
  seed: string,
  acceptPromise: boolean,
): Promise<AcceptedPromiseFixture | null> {
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
    if (!offer) throw new Error("fixture did not begin beside a Promise offer");
    contractId = Number(offer.id);
    runtime.dispatchUI({
      type: "contract",
      action: "accept",
      contractId: offer.id,
    });
    advancePlayerSteps(runtime, 10);
  }
  await runtime.save();
  runtime.destroy();

  if (contractId === null) return null;
  const saved = decodeV4(repository.snapshot());
  const lot = saved.physicalCargo.carrier.lots.find(({ payload }) =>
    payload.kind === "promise" && payload.contractId === contractId);
  if (!lot) throw new Error("accepted Promise did not reach the physical carrier");
  return {
    contractId,
    lotId: lot.id,
    payload: structuredClone(lot.payload),
    manifest: structuredClone(saved.physicalCargo.expectedManifest),
  };
}

function safeEastSeamRow(view: WorldView): number {
  const sourceX = REGIONAL_TRAVEL_HALO_TILES + WORLD_WIDTH - 1;
  const destinationX = sourceX + 1;
  for (let localY = 0; localY < WORLD_HEIGHT; localY += 1) {
    const windowY = localY + REGIONAL_TRAVEL_HALO_TILES;
    const source = view.terrain.tiles[windowY * REGIONAL_TRAVEL_COLUMNS + sourceX];
    const destination = view.terrain.tiles[windowY * REGIONAL_TRAVEL_COLUMNS + destinationX];
    if (
      source
      && destination
      && source.terrain !== "ridge"
      && destination.terrain !== "ridge"
      && Math.max(source.waterDepth, destination.waterDepth) <= 55_000
      && Math.max(source.roughness, destination.roughness) < 650_000
      && Math.abs(destination.elevation - source.elevation) < 180_000
    ) return localY;
  }
  throw new Error("seed did not produce a safe deterministic east seam entry");
}

function adjacentCompatibilityTrace(
  originTileIndex: number,
  destinationX: number,
  destinationY: number,
  width: number,
): number[] {
  let x = originTileIndex % width;
  let y = Math.floor(originTileIndex / width);
  const trace = [originTileIndex];
  while (x !== destinationX) {
    x += Math.sign(destinationX - x);
    trace.push(y * width + x);
  }
  while (y !== destinationY) {
    y += Math.sign(destinationY - y);
    trace.push(y * width + x);
  }
  return trace;
}

function relocateToEastSeam(
  envelope: V4GameSaveEnvelope,
): V4GameSaveEnvelope {
  const world = deserializeWorld(envelope.world);
  const economy = createWorldView(world);
  const travel = restorePlayerRegionalTravel(
    world.meta.rootSeed,
    envelope.player,
    envelope.regionalTravel,
  );
  if (!travel) throw new Error("fixture started with an invalid regional sidecar");
  const spatial = createRegionalWorldView(economy, travel.window, {
    discovered: envelope.player.discovered,
    depthSoundings: envelope.player.depthSoundings,
  });
  const localY = safeEastSeamRow(spatial);
  const sourceWindowX = REGIONAL_TRAVEL_HALO_TILES + WORLD_WIDTH - 1;
  const sourceWindowY = localY + REGIONAL_TRAVEL_HALO_TILES;
  const sourceViewIndex = sourceWindowY * REGIONAL_TRAVEL_COLUMNS + sourceWindowX;
  const player = structuredClone(envelope.player);
  player.x = (sourceWindowX + 1) * TILE_UNITS - 1;
  player.y = sourceWindowY * TILE_UNITS + Math.floor(TILE_UNITS / 2);
  player.previousX = player.x;
  player.previousY = player.y;
  player.velocityX = 0;
  player.velocityY = 0;
  player.stamina = FIXED_POINT;
  player.stability = FIXED_POINT;
  player.stabilityTrend = "steady";
  player.stabilityHint = "Stable on sound footing";
  player.pace = "steady";
  player.mode = "foot";
  player.sweepTicksRemaining = 0;
  player.sweepTotalTicks = 0;
  player.sweepPath = [];
  player.sweepSupport = null;
  player.currentTrace = [sourceViewIndex];
  player.surveyTrace = [sourceViewIndex];

  const captured = capturePlayerRegionalTravel(travel, player);
  const regionalTravel = serializePlayerRegionalTravel(captured);
  if (!restorePlayerRegionalTravel(world.meta.rootSeed, player, regionalTravel)) {
    throw new Error("relocated seam fixture is not a coherent regional save");
  }
  const contract = economy.contracts.find(({ id }) => id === player.activeContractId);
  const origin = contract
    ? economy.settlements.find(({ id }) => id === contract.originSettlementId)
    : undefined;
  const promiseJourney: RegionalPromiseJourneyState = contract && origin
    ? {
        version: 1,
        contractId: contract.id,
        detoured: false,
        compatibilityTrace: adjacentCompatibilityTrace(
          origin.tileIndex,
          WORLD_WIDTH - 1,
          localY,
          economy.terrain.width,
        ),
      }
    : { version: 1, contractId: null, detoured: false, compatibilityTrace: [] };
  return {
    ...envelope,
    player,
    regionalTravel,
    promiseJourney,
  };
}

function restoredTravel(envelope: V4GameSaveEnvelope): RegionalPlayerTravelState {
  const world = deserializeWorld(envelope.world);
  const travel = restorePlayerRegionalTravel(
    world.meta.rootSeed,
    envelope.player,
    envelope.regionalTravel,
  );
  if (!travel) throw new Error("saved regional state did not restore");
  return travel;
}

function regionContentHash(
  travel: RegionalPlayerTravelState,
  key: string,
): string {
  const loaded = travel.stream.loaded.find((region) => region.key === key);
  if (!loaded) throw new Error(`stream did not retain loaded region ${key}`);
  return loaded.contentHash;
}

function expectExactPromiseCustody(
  state: PhysicalCargoState,
  fixture: AcceptedPromiseFixture,
): void {
  const occurrences = [
    ...state.carrier.lots.map((lot) => ({ id: lot.id, payload: lot.payload })),
    ...state.looseWorld.entities.map((entity) => ({ id: entity.id, payload: entity.payload })),
    ...state.inactiveWorlds.flatMap(({ world }) =>
      world.entities.map((entity) => ({ id: entity.id, payload: entity.payload }))),
  ].filter(({ payload }) =>
    payload.kind === "promise" && payload.contractId === fixture.contractId);
  expect(occurrences).toEqual([{ id: fixture.lotId, payload: fixture.payload }]);
  expect(state.expectedManifest).toEqual(fixture.manifest);
}

describe("production signed-region crossing", () => {
  it("crosses, saves, reloads, returns, and revisits with exact Promise custody", async () => {
    const repository = new MemoryRepository();
    const promise = await createCurrentSave(
      repository,
      "cargo remembers the far shore",
      true,
    );
    if (!promise) throw new Error("fixture did not accept a Promise");
    replaceEnvelope(repository, relocateToEastSeam(decodeV4(repository.snapshot())));

    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    expect(runtime.getRenderView().spatialEpoch).toBe("r:0:0");
    runtime.dispatchRenderer({ type: "brace", active: true });
    runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
    runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
    advancePlayerSteps(runtime, 1);
    runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    expect(runtime.getRenderView().spatialEpoch).toBe("r:1:0");
    await runtime.save();
    const eastSave = decodeV4(repository.snapshot());
    const eastTravel = restoredTravel(eastSave);
    expect(eastTravel.stream).toMatchObject({
      center: { x: 1, y: 0 },
      transitionOrdinal: 1,
    });
    expect(eastTravel.stream.loaded).toHaveLength(5);
    expect(eastSave.physicalCargo).toMatchObject({
      version: 2,
      activeRegion: { x: 1, y: 0 },
      activeRegionKey: "r:1:0",
    });
    expect(eastSave.promiseJourney).toEqual({
      version: 1,
      contractId: promise.contractId,
      detoured: true,
      compatibilityTrace: [],
    });
    expectExactPromiseCustody(eastSave.physicalCargo, promise);
    const eastTerrainHash = regionContentHash(eastTravel, "r:1:0");
    const eastKnowledge = projectRegionalCartographyRegion(
      eastTravel.cartography,
      createRegionCoord(1, 0),
    );
    expect(eastKnowledge.discovered.some((value) => value > 0)).toBe(true);
    runtime.destroy();

    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getRenderView().spatialEpoch).toBe("r:1:0");
    expect(resumed.getUIView().saveWarning).toBeUndefined();
    resumed.dispatchUI({ type: "resume-world" });
    resumed.dispatchRenderer({ type: "brace", active: true });
    resumed.dispatchRenderer({ type: "movement", vector: { x: -1, y: 0 } });
    advancePlayerSteps(resumed, 1);
    resumed.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    expect(resumed.getRenderView().spatialEpoch).toBe("r:0:0");
    await resumed.save();
    const returnedSave = decodeV4(repository.snapshot());
    expect(restoredTravel(returnedSave).stream).toMatchObject({
      center: { x: 0, y: 0 },
      transitionOrdinal: 2,
    });
    expect(returnedSave.physicalCargo.activeRegion).toEqual({ x: 0, y: 0 });
    expectExactPromiseCustody(returnedSave.physicalCargo, promise);

    resumed.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
    advancePlayerSteps(resumed, 1);
    resumed.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    expect(resumed.getRenderView().spatialEpoch).toBe("r:1:0");
    await resumed.save();
    const revisitedSave = decodeV4(repository.snapshot());
    const revisitedTravel = restoredTravel(revisitedSave);
    expect(revisitedTravel.stream).toMatchObject({
      center: { x: 1, y: 0 },
      transitionOrdinal: 3,
    });
    expect(revisitedTravel.stream.loaded).toHaveLength(5);
    expect(regionContentHash(revisitedTravel, "r:1:0")).toBe(eastTerrainHash);
    const revisitedKnowledge = projectRegionalCartographyRegion(
      revisitedTravel.cartography,
      createRegionCoord(1, 0),
    );
    expect(revisitedKnowledge.discovered.every((value, index) =>
      value >= (eastKnowledge.discovered[index] ?? 0))).toBe(true);
    expect(revisitedKnowledge.depthSoundings.every((value, index) =>
      value >= (eastKnowledge.depthSoundings[index] ?? 0))).toBe(true);
    expect(revisitedSave.physicalCargo.activeRegion).toEqual({ x: 1, y: 0 });
    expectExactPromiseCustody(revisitedSave.physicalCargo, promise);
    resumed.destroy();
  }, 20_000);

  it("rejects an otherwise resealed save captured halfway through a recenter", async () => {
    const repository = new MemoryRepository();
    await createCurrentSave(repository, "no half crossed worlds", false);
    const relocated = relocateToEastSeam(decodeV4(repository.snapshot()));
    const world = deserializeWorld(relocated.world);
    const player = structuredClone(relocated.player);
    const travel = restoredTravel(relocated);
    const destinationX = REGIONAL_TRAVEL_COLUMNS - 1;
    const y = Math.floor(player.y / TILE_UNITS);
    player.x = destinationX * TILE_UNITS + Math.floor(TILE_UNITS / 2);
    player.previousX = player.x;
    player.currentTrace = [y * REGIONAL_TRAVEL_COLUMNS + destinationX];
    player.surveyTrace = [...player.currentTrace];
    const halfTravel = serializePlayerRegionalTravel(
      capturePlayerRegionalTravel(travel, player),
    );
    if (!restorePlayerRegionalTravel(world.meta.rootSeed, player, halfTravel)) {
      throw new Error("half-cross fixture should be valid before the atomic-center fence");
    }
    replaceEnvelope(repository, {
      ...relocated,
      player,
      regionalTravel: halfTravel,
    });
    const rejectedRecord = repository.snapshot();

    const rejected = await createTideweftRuntime(repository);
    expect(rejected.getUIView().title).toMatchObject({ visible: true, requiresSeed: true });
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    await expect(rejected.save()).rejects.toThrow("Choose a seed before replacing");
    expect(repository.snapshot()).toEqual(rejectedRecord);
    rejected.destroy();
  }, 10_000);
});

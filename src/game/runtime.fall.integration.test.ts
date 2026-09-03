import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import { deserializeWorld, serializeWorld } from "../sim/public";
import {
  createRegionCoord,
  regionLocalToGlobalTile,
} from "../sim/regions";
import type { RootSeed } from "../sim/rng";
import { FIXED_POINT, type WorldState } from "../sim/types";
import type { FieldResourceEcologyState } from "../sim/fieldResources";
import type { TideweftView } from "../render/types";
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
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import type { GameSessionState } from "./sessionTypes";
import type { TraversalFeedbackState } from "./traversalFeedback";

const soundscapePlay = vi.hoisted(() => vi.fn());
vi.mock("../audio/soundscape", () => ({
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(...args: unknown[]): void { soundscapePlay(...args); }
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
  readonly physicalCargo: SerializedPhysicalCargoState;
  readonly regionalTravel: string;
  readonly promiseJourney: RegionalPromiseJourneyState;
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

function decodeV4(record: SaveRecord): V4GameSaveEnvelope {
  const envelope = JSON.parse(record.worldJson) as V4GameSaveEnvelope;
  if (envelope.format !== "tideweft-session" || envelope.version !== 4) {
    throw new Error("fixture did not produce a current v4 regional session save");
  }
  return envelope;
}

function reseal(envelope: V4GameSaveEnvelope): V4GameSaveEnvelope {
  const { integrity: _priorIntegrity, ...unsealed } = envelope;
  return {
    ...unsealed,
    integrity: gameSaveEnvelopeIntegrity(unsealed),
  };
}

function replaceEnvelope(
  repository: MemoryRepository,
  envelope: V4GameSaveEnvelope,
): void {
  const record = repository.snapshot();
  const sealed = reseal(envelope);
  repository.replace({
    ...record,
    payloadVersion: 4,
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

function relocateToRidgeAtZeroStability(
  envelope: V4GameSaveEnvelope,
): { readonly envelope: V4GameSaveEnvelope; readonly corner: RidgeCorner } {
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
  return {
    envelope: {
      ...envelope,
      world: serializeWorld(world),
      player,
      regionalTravel: regionalTravelText,
      promiseJourney,
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

async function createV4Fixture(
  repository: MemoryRepository,
  seed: string,
  acceptPromise: boolean,
): Promise<{
  readonly contractId: number | null;
  readonly sourceLotId: string | null;
  readonly sourceCondition: number | null;
  readonly promiseQuantity: number;
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

  const initial = decodeV4(repository.snapshot());
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

function renderedTileIndex(view: TideweftView): number {
  const tileX = Math.floor(view.player.position.x / view.terrain.tileSize);
  const tileY = Math.floor(view.player.position.y / view.terrain.tileSize);
  return tileY * view.terrain.columns + tileX;
}

describe("production terrain fall and physical cargo", () => {
  it("rejects a resealed v4 player snapshot whose regional cartography was left stale", async () => {
    const repository = new MemoryRepository();
    await createV4Fixture(repository, "stale regional fall fixture", false);
    const stale = structuredClone(decodeV4(repository.snapshot()));
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
  }, 10_000);

  it("turns one deterministic diagonal ridge fall into persistent recoverable Promise parcels", async () => {
    const repository = new MemoryRepository();
    const fixture = await createV4Fixture(
      repository,
      "fall cargo exact test",
      true,
    );
    if (
      fixture.contractId === null
      || fixture.sourceLotId === null
      || fixture.sourceCondition === null
    ) throw new Error("Promise fixture lost its source identity");

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
    // X-before-Y is authoritative: the porter reaches the ridge edge and does
    // not also commit the diagonal edge after this first mishap.
    expect(renderedTileIndex(fallenView)).toBe(fixture.corner.ridgeTileIndex);
    expect(renderedTileIndex(fallenView)).not.toBe(fixture.corner.diagonalTileIndex);
    expect(runtime.getUIView().player.stamina).toBeLessThan(staminaBefore);
    expect(runtime.getUIView().objective).toMatchObject({
      id: `recover-${fixture.contractId}`,
      eyebrow: "Recover loose Promise cargo",
    });

    await runtime.save();
    const fallenSave = decodeV4(repository.snapshot());
    expect(fallenSave).toMatchObject({
      version: 4,
      player: {
        worldWidth: REGIONAL_TRAVEL_COLUMNS,
        worldHeight: REGIONAL_TRAVEL_ROWS,
      },
      physicalCargo: {
        version: 2,
        activeRegion: { x: 0, y: 0 },
      },
    });
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
    expect(incidentCueCalls(incident.cue)).toBe(1);

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
    expect(parcelIds[0]).toBe("lc:0:0:parcel:1");
    const materialAndHistory = {
      entities: fallenSave.physicalCargo.looseWorld.entities,
      history: fallenSave.physicalCargo.looseWorld.history,
      historyBaseOrdinal: fallenSave.physicalCargo.looseWorld.historyBaseOrdinal,
      historyArchiveHash: fallenSave.physicalCargo.looseWorld.historyArchiveHash,
      retiredLotIds: fallenSave.physicalCargo.carrier.retiredLotIds,
    };
    const sourceOccurrences = fallenSave.physicalCargo.carrier.lots.filter(({ id }) =>
      id === fixture.sourceLotId).length;
    expect(sourceOccurrences).toBeLessThanOrEqual(1);
    if (sourceOccurrences === 0) {
      expect(fallenSave.physicalCargo.carrier.retiredLotIds).toContain(fixture.sourceLotId);
    }
    const visibleParcelIds = (runtime.getRenderView().looseCargo ?? []).map(({ id }) => id);
    runtime.destroy();

    const cueCountBeforeReload = incidentCueCalls(incident.cue);
    const resumed = await createTideweftRuntime(repository);
    expect(incidentCueCalls(incident.cue)).toBe(cueCountBeforeReload);
    // Reload recomputes the same direct perception at the same physical locus:
    // visible parcels stay visible, while anything beyond sight remains absent.
    expect((resumed.getRenderView().looseCargo ?? []).map(({ id }) => id)).toEqual(visibleParcelIds);
    expect(resumed.getUIView().objective?.id).toBe(`recover-${fixture.contractId}`);
    await resumed.save();
    const roundTripped = decodeV4(repository.snapshot());
    expect({
      entities: roundTripped.physicalCargo.looseWorld.entities,
      history: roundTripped.physicalCargo.looseWorld.history,
      historyBaseOrdinal: roundTripped.physicalCargo.looseWorld.historyBaseOrdinal,
      historyArchiveHash: roundTripped.physicalCargo.looseWorld.historyArchiveHash,
      retiredLotIds: roundTripped.physicalCargo.carrier.retiredLotIds,
    }).toEqual(materialAndHistory);
    expect(roundTripped.traversalFeedback).toEqual(fallenSave.traversalFeedback);

    // Repeating the same diagonal input during physical recovery cannot assign
    // another ordinal, replay the cue, duplicate a parcel, or resurrect a lot.
    resumed.dispatchRenderer({ type: "movement", vector: { x: 1, y: 1 } });
    advancePlayerSteps(resumed, 1);
    resumed.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    await resumed.save();
    const afterRepeatedInput = decodeV4(repository.snapshot());
    expect(afterRepeatedInput.traversalFeedback.nextTraversalOrdinal).toBe(1);
    expect(incidentCueCalls(incident.cue)).toBe(cueCountBeforeReload);
    expect(afterRepeatedInput.physicalCargo.looseWorld.entities.map(({ id }) => id).sort())
      .toEqual([...parcelIds].sort());
    expect(promiseQuantity(afterRepeatedInput.physicalCargo, fixture.contractId))
      .toBe(fixture.promiseQuantity);
    expect(afterRepeatedInput.physicalCargo.carrier.lots.filter(({ id }) =>
      id === fixture.sourceLotId)).toHaveLength(sourceOccurrences);
    resumed.destroy();
  }, 15_000);

  it("applies one terrain fall to an empty porter without inventing or deleting cargo", async () => {
    const repository = new MemoryRepository();
    const fixture = await createV4Fixture(
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

    const fallen = decodeV4(repository.snapshot());
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
    expect(fallen.physicalCargo.looseWorld.entities).toEqual([]);
    expect(fallen.physicalCargo.expectedManifest.entries).toEqual([]);
    const staminaAfterFall = fallen.player.stamina;
    const cueCount = incidentCueCalls(incident.cue);

    runtime.dispatchRenderer({ type: "movement", vector: { x: -1, y: -1 } });
    advancePlayerSteps(runtime, 1);
    runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    await runtime.save();
    const repeated = decodeV4(repository.snapshot());
    expect(repeated.traversalFeedback.nextTraversalOrdinal).toBe(1);
    expect(repeated.player.stamina).toBeGreaterThanOrEqual(staminaAfterFall);
    expect(repeated.physicalCargo.carrier.lots).toEqual([]);
    expect(repeated.physicalCargo.looseWorld.entities).toEqual([]);
    expect(repeated.physicalCargo.expectedManifest.entries).toEqual([]);
    expect(incidentCueCalls(incident.cue)).toBe(cueCount);
    runtime.destroy();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import { deserializeWorld } from "../sim/public";
import { FIXED_POINT, type WorldState } from "../sim/types";
import type { FieldResourceEcologyState } from "../sim/fieldResources";
import type { TideweftView } from "../render/types";
import { TILE_UNITS, type PlayerState } from "./player";
import {
  gameSaveEnvelopeIntegrity,
  type PhysicalCargoState,
} from "./physicalCargoState";
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

interface V3GameSaveEnvelope {
  readonly format: "tideweft-session";
  readonly version: 3;
  readonly world: string;
  readonly player: PlayerState;
  readonly session: GameSessionState;
  readonly fieldResources: FieldResourceEcologyState;
  readonly traversalFeedback: TraversalFeedbackState;
  readonly physicalCargo: PhysicalCargoState;
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

function decodeV3(record: SaveRecord): V3GameSaveEnvelope {
  const envelope = JSON.parse(record.worldJson) as V3GameSaveEnvelope;
  if (envelope.format !== "tideweft-session" || envelope.version !== 3) {
    throw new Error("fixture did not produce a current v3 session save");
  }
  return envelope;
}

function reseal(envelope: V3GameSaveEnvelope): V3GameSaveEnvelope {
  const { integrity: _priorIntegrity, ...unsealed } = envelope;
  return {
    ...unsealed,
    integrity: gameSaveEnvelopeIntegrity(unsealed),
  };
}

function replaceEnvelope(
  repository: MemoryRepository,
  envelope: V3GameSaveEnvelope,
): void {
  const record = repository.snapshot();
  const sealed = reseal(envelope);
  repository.replace({
    ...record,
    payloadVersion: 3,
    updatedAt: record.updatedAt + 1,
    worldJson: JSON.stringify(sealed),
  });
}

function findRidgeCorner(world: WorldState): RidgeCorner {
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
      return { startTileIndex, ridgeTileIndex, diagonalTileIndex, x, y };
    }
  }
  throw new Error("generated world did not contain an unoccupied diagonal ridge corner");
}

function relocateToRidgeAtZeroStability(
  envelope: V3GameSaveEnvelope,
): { readonly envelope: V3GameSaveEnvelope; readonly corner: RidgeCorner } {
  const world = deserializeWorld(envelope.world);
  const corner = findRidgeCorner(world);
  const player = structuredClone(envelope.player);
  // Even a full pack retains a bounded minimum movement speed. One unit from
  // each boundary guarantees that the shared diagonal command crosses both
  // axes this step without changing speed/load rules for the fixture.
  player.x = corner.x * TILE_UNITS + 999;
  player.y = corner.y * TILE_UNITS + 999;
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
  player.currentTrace = [corner.startTileIndex];
  player.surveyTrace = [corner.startTileIndex];
  player.discovered[corner.startTileIndex] = FIXED_POINT;
  player.discovered[corner.ridgeTileIndex] = FIXED_POINT;
  player.discovered[corner.diagonalTileIndex] = FIXED_POINT;
  return {
    envelope: {
      ...envelope,
      player,
      traversalFeedback: {
        ...envelope.traversalFeedback,
        nextTraversalOrdinal: 0,
        incident: null,
        lastAudibleIncidentId: null,
      },
    },
    corner,
  };
}

async function createV3Fixture(
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

  const initial = decodeV3(repository.snapshot());
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

function promiseQuantity(state: PhysicalCargoState, contractId: number): number {
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
  it("turns one deterministic diagonal ridge fall into persistent recoverable Promise parcels", async () => {
    const repository = new MemoryRepository();
    const fixture = await createV3Fixture(
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
    const fallenSave = decodeV3(repository.snapshot());
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
    runtime.destroy();

    const cueCountBeforeReload = incidentCueCalls(incident.cue);
    const resumed = await createTideweftRuntime(repository);
    expect(incidentCueCalls(incident.cue)).toBe(cueCountBeforeReload);
    expect(resumed.getRenderView().looseCargo?.map(({ id }) => id).sort())
      .toEqual([...parcelIds].sort());
    expect(resumed.getUIView().objective?.id).toBe(`recover-${fixture.contractId}`);
    await resumed.save();
    const roundTripped = decodeV3(repository.snapshot());
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
    const afterRepeatedInput = decodeV3(repository.snapshot());
    expect(afterRepeatedInput.traversalFeedback.nextTraversalOrdinal).toBe(1);
    expect(incidentCueCalls(incident.cue)).toBe(cueCountBeforeReload);
    expect(afterRepeatedInput.physicalCargo.looseWorld.entities.map(({ id }) => id).sort())
      .toEqual([...parcelIds].sort());
    expect(promiseQuantity(afterRepeatedInput.physicalCargo, fixture.contractId))
      .toBe(fixture.promiseQuantity);
    expect(afterRepeatedInput.physicalCargo.carrier.lots.filter(({ id }) =>
      id === fixture.sourceLotId)).toHaveLength(sourceOccurrences);
    resumed.destroy();
  });

  it("applies one terrain fall to an empty porter without inventing or deleting cargo", async () => {
    const repository = new MemoryRepository();
    const fixture = await createV3Fixture(
      repository,
      "empty porter fall vertical slice",
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

    const fallen = decodeV3(repository.snapshot());
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
    const repeated = decodeV3(repository.snapshot());
    expect(repeated.traversalFeedback.nextTraversalOrdinal).toBe(1);
    expect(repeated.player.stamina).toBeGreaterThanOrEqual(staminaAfterFall);
    expect(repeated.physicalCargo.carrier.lots).toEqual([]);
    expect(repeated.physicalCargo.looseWorld.entities).toEqual([]);
    expect(repeated.physicalCargo.expectedManifest.entries).toEqual([]);
    expect(incidentCueCalls(incident.cue)).toBe(cueCount);
    runtime.destroy();
  });
});

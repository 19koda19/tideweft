import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ConflictingSaveCopiesError,
  NewerSaveUnavailableError,
  StaleSaveWriteError,
  createSaveRepository,
  type SaveRecord,
  type SaveRepository,
} from "../platform/persistence";
import {
  FIXED_POINT,
  LEGACY_WORLD_HEIGHT,
  LEGACY_WORLD_WIDTH,
  RESOURCE_KINDS,
  WORLD_WIDTH,
  assertWorldInvariants,
  createWorld,
  createWorldView,
  deserializeWorld,
  runTicks,
  serializeWorld,
  stepWorld,
  type WorldState,
} from "../sim/public";
import { tideAtTick } from "../sim/terrain";
import { hashCanonical } from "../sim/util";
import {
  createRegionCoord,
  regionLocalToGlobalTile,
  type RegionCoord,
} from "../sim/regions";
import type { RootSeed } from "../sim/rng";
import {
  createFieldResourceEcologyState,
  type FieldResourceEcologyState,
} from "../sim/fieldResources";
import {
  createPlayer,
  loadContractCargo,
  TILE_UNITS,
  wayknotContextAt,
  type PlayerState,
} from "./player";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import {
  captureSessionBaseline,
  createSessionState,
  type GameSessionState,
  type SessionBaseline,
} from "./sessionTypes";
import { placeWayknot } from "./wayknots";
import {
  createTraversalFeedbackState,
  type TraversalFeedbackState,
} from "./traversalFeedback";
import {
  gameSaveEnvelopeIntegrity,
  type SerializedPhysicalCargoState,
} from "./physicalCargoState";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
  REGIONAL_TRAVEL_SAFE_MAX_X,
  REGIONAL_TRAVEL_SAFE_MAX_Y,
  REGIONAL_TRAVEL_SAFE_MIN_X,
  REGIONAL_TRAVEL_SAFE_MIN_Y,
  regionLocalToWindowTile,
  regionTileIndexToWindowIndex,
} from "./regionalTravel";
import {
  capturePlayerRegionalTravel,
  recenterRegionalPlayer,
  restorePlayerRegionalTravel,
  serializePlayerRegionalTravel,
  type RegionalPlayerTravelState,
} from "./regionalPlayerTravel";
import type { RegionalPromiseJourneyState } from "./regionalPromiseJourney";

const soundscapePlay = vi.hoisted(() => vi.fn());
vi.mock("../audio/soundscape", () => ({
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(...args: unknown[]): void { soundscapePlay(...args); }
    updateAmbience(): void {}
    destroy(): void {}
  },
}));

class MemoryRepository implements SaveRepository {
  constructor(private record?: SaveRecord) {}

  async list() {
    return [];
  }

  async load(slotId: string) {
    return slotId === "autosave" ? this.record : undefined;
  }

  async save(record: SaveRecord) {
    this.record = structuredClone(record);
  }

  async remove() {
    this.record = undefined;
  }

  snapshot(): SaveRecord {
    if (!this.record) throw new Error("test repository has no autosave");
    return structuredClone(this.record);
  }

  replace(record: SaveRecord): void {
    this.record = structuredClone(record);
  }
}

class RuntimeTestStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, String(value)); }
}

function saveGenerationOf(record: SaveRecord): number {
  return record.saveGeneration ?? 0;
}

function saveGenerationEraOf(record: SaveRecord): number {
  return record.saveGenerationEra ?? 0;
}

function isNewerSave(candidate: SaveRecord, reference: SaveRecord): boolean {
  const candidateEra = saveGenerationEraOf(candidate);
  const referenceEra = saveGenerationEraOf(reference);
  if (candidateEra !== referenceEra) {
    return candidateEra > referenceEra;
  }
  const candidateGeneration = saveGenerationOf(candidate);
  const referenceGeneration = saveGenerationOf(reference);
  if (candidateGeneration !== referenceGeneration) {
    return candidateGeneration > referenceGeneration;
  }
  return candidate.updatedAt > reference.updatedAt
    || (candidate.updatedAt === reference.updatedAt && candidate.playTicks > reference.playTicks);
}

/** Mirrors the browser repositories' compare-before-write behavior. */
class VersionedMemoryRepository implements SaveRepository {
  constructor(private record?: SaveRecord) {
    this.record = record ? structuredClone(record) : undefined;
  }

  async list() {
    return [];
  }

  async load(slotId: string) {
    return slotId === "autosave" && this.record ? structuredClone(this.record) : undefined;
  }

  async save(record: SaveRecord) {
    if (!this.record || !isNewerSave(this.record, record)) {
      this.record = structuredClone(record);
    }
  }

  async remove() {
    this.record = undefined;
  }

  snapshot(): SaveRecord {
    if (!this.record) throw new Error("test repository has no autosave");
    return structuredClone(this.record);
  }
}

class DeferredSaveRepository implements SaveRepository {
  private record: SaveRecord | undefined;
  private readonly pending: Array<{
    record: SaveRecord;
    resolve: () => void;
    reject: (reason: unknown) => void;
  }> = [];
  readonly started: SaveRecord[] = [];

  constructor(record?: SaveRecord) {
    this.record = record ? structuredClone(record) : undefined;
  }

  async list() {
    return [];
  }

  async load(slotId: string) {
    return slotId === "autosave" && this.record ? structuredClone(this.record) : undefined;
  }

  async save(record: SaveRecord): Promise<void> {
    const snapshot = structuredClone(record);
    this.started.push(snapshot);
    await new Promise<void>((resolve, reject) => {
      this.pending.push({ record: snapshot, resolve, reject });
    });
    this.record = snapshot;
  }

  async remove(): Promise<void> {
    this.record = undefined;
  }

  resolveNext(): void {
    const pending = this.pending.shift();
    if (!pending) throw new Error("test repository has no pending save");
    pending.resolve();
  }

  rejectNext(reason: unknown): void {
    const pending = this.pending.shift();
    if (!pending) throw new Error("test repository has no pending save");
    pending.reject(reason);
  }

  snapshot(): SaveRecord {
    if (!this.record) throw new Error("test repository has no completed save");
    return structuredClone(this.record);
  }
}

interface TestGameSaveEnvelope {
  format: "tideweft-session";
  version: number;
  world: string;
  player: PlayerState;
  session: GameSessionState;
  fieldResources?: FieldResourceEcologyState;
  traversalFeedback?: TraversalFeedbackState;
  physicalCargo?: SerializedPhysicalCargoState;
  regionalTravel?: string;
  promiseJourney?: RegionalPromiseJourneyState;
  integrity?: string;
}

let scheduledFrame: ((now: number) => void) | undefined;

beforeEach(() => {
  scheduledFrame = undefined;
  soundscapePlay.mockClear();
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: (now: number) => void) => {
    scheduledFrame = callback;
    return 1;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function decodeGameSave(record: SaveRecord): TestGameSaveEnvelope {
  return JSON.parse(record.worldJson) as TestGameSaveEnvelope;
}

function resealGameSave(envelope: TestGameSaveEnvelope): void {
  envelope.integrity = gameSaveEnvelopeIntegrity(envelope as unknown as Readonly<Record<string, unknown>>);
}

function runtimeSaveRecord(
  world: WorldState,
  player: PlayerState,
  session: GameSessionState,
  label: string,
): SaveRecord {
  const envelope: TestGameSaveEnvelope = {
    format: "tideweft-session",
    version: 1,
    world: serializeWorld(world),
    player,
    session,
  };
  return {
    slotId: "autosave",
    label,
    seed: world.meta.seedText,
    updatedAt: 1,
    playTicks: world.meta.completedTick,
    settlementCount: world.settlements.length,
    connectedCount: 0,
    worldJson: JSON.stringify(envelope),
  };
}

function placePlayerOnTile(player: PlayerState, tile: { x: number; y: number; index: number }): void {
  player.x = tile.x * TILE_UNITS + TILE_UNITS / 2;
  player.y = tile.y * TILE_UNITS + TILE_UNITS / 2;
  player.previousX = player.x;
  player.previousY = player.y;
  player.velocityX = 0;
  player.velocityY = 0;
  player.currentTrace = [tile.index];
  player.surveyTrace = [tile.index];
}

function moveRegionalFixtureToAddress(
  rootSeed: RootSeed,
  initial: RegionalPlayerTravelState,
  player: PlayerState,
  targetRegion: RegionCoord,
  localX: number,
  localY: number,
): RegionalPlayerTravelState {
  const target = regionLocalToGlobalTile(targetRegion, localX, localY);
  let state = initial;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const point = regionLocalToWindowTile(state.window, targetRegion, localX, localY);
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
  throw new Error("fixture could not move its spatial frame to the requested address");
}

function advancePlayerSteps(runtime: TideweftRuntime, count: number): void {
  runtime.start();
  let now = 100;
  // The first frame establishes the clock; each later 100 ms frame is one
  // fixed player step.
  for (let frame = 0; frame <= count; frame += 1) {
    const callback = scheduledFrame;
    if (!callback) throw new Error("runtime did not schedule its next frame");
    scheduledFrame = undefined;
    callback(now);
    now += 100;
  }
  runtime.stop();
}

function expectConserved(world: WorldState): void {
  for (const resource of RESOURCE_KINDS) {
    const stored = world.settlements.reduce(
      (total, settlement) => total + settlement.inventory[resource],
      0,
    ) + world.contracts.reduce(
      (total, contract) => total + (contract.resource === resource ? contract.cargoQuantity : 0),
      0,
    );
    expect(stored).toBe(
      world.ledger.initial[resource]
        + world.ledger.produced[resource]
        - world.ledger.consumed[resource],
    );
  }
}

function legacySizedWorld(world: WorldState): WorldState {
  const legacy = structuredClone(world);
  const template = legacy.terrain.tiles[0];
  if (!template) throw new Error("test world has no terrain template");
  legacy.terrain = {
    width: LEGACY_WORLD_WIDTH,
    height: LEGACY_WORLD_HEIGHT,
    tiles: Array.from({ length: LEGACY_WORLD_WIDTH * LEGACY_WORLD_HEIGHT }, (_, index) => ({
      ...template,
      index,
      x: index % LEGACY_WORLD_WIDTH,
      y: Math.floor(index / LEGACY_WORLD_WIDTH),
      traceStrength: 0,
    })),
  };
  const harborCoordinates = [
    [4, 4],
    [24, 4],
    [44, 4],
    [59, 12],
    [54, 32],
    [32, 42],
    [8, 38],
  ] as const;
  for (let index = 0; index < legacy.settlements.length; index += 1) {
    const settlement = legacy.settlements[index];
    const coordinate = harborCoordinates[index];
    if (!settlement || !coordinate) throw new Error("missing legacy harbor fixture");
    settlement.tileIndex = coordinate[1] * LEGACY_WORLD_WIDTH + coordinate[0];
  }
  for (const route of legacy.routes) {
    const from = legacy.settlements.find((settlement) => settlement.id === route.fromSettlementId);
    const to = legacy.settlements.find((settlement) => settlement.id === route.toSettlementId);
    const fromTile = from ? legacy.terrain.tiles[from.tileIndex] : undefined;
    const toTile = to ? legacy.terrain.tiles[to.tileIndex] : undefined;
    if (!fromTile || !toTile) throw new Error("missing legacy route endpoint");
    const path = [fromTile.index];
    let x = fromTile.x;
    let y = fromTile.y;
    while (x !== toTile.x) {
      x += Math.sign(toTile.x - x);
      path.push(y * LEGACY_WORLD_WIDTH + x);
    }
    while (y !== toTile.y) {
      y += Math.sign(toTile.y - y);
      path.push(y * LEGACY_WORLD_WIDTH + x);
    }
    route.path = path;
    route.baseTravelTicks = Math.max(12, path.length - 1);
  }
  const worldCreated = legacy.events.find((event) => event.type === "world-created");
  if (worldCreated) {
    worldCreated.data.width = LEGACY_WORLD_WIDTH;
    worldCreated.data.height = LEGACY_WORLD_HEIGHT;
  }
  return legacy;
}

function alphaWorldSaveText(world: WorldState): string {
  const legacyWorld = structuredClone(world) as unknown as Record<string, unknown>;
  delete legacyWorld.choirs;
  const meta = legacyWorld.meta as Record<string, unknown>;
  meta.saveFormatVersion = 1;
  meta.rulesVersion = "tideweft-sim/2";
  return JSON.stringify({
    format: "tideweft-world",
    saveFormatVersion: 1,
    rulesVersion: "tideweft-sim/2",
    checksum: hashCanonical(legacyWorld),
    world: legacyWorld,
  });
}

describe("perpetual new worlds", () => {
  it("opens a directly selected resident ABOUT and completes GREET without pausing play", async () => {
    const runtime = await createTideweftRuntime(new MemoryRepository());
    runtime.dispatchUI({
      type: "new-world",
      seed: "resident interaction runtime",
      posture: "journey",
      sessionShape: "wander",
    });

    const porter = runtime.getRenderView().porters[0];
    expect(porter).toBeDefined();
    if (!porter) throw new Error("starting harbor should expose a resident in direct sight");

    runtime.dispatchRenderer({
      type: "select",
      entity: "porter",
      id: porter.id,
      point: porter.position,
    });

    expect(runtime.getUIView().selectedResident).toMatchObject({
      id: porter.id,
      knowledgeLabel: "Unfamiliar",
      actionLabel: "GREET",
    });
    expect(runtime.getRenderView().paused).toBe(false);

    advancePlayerSteps(runtime, 10);
    expect(runtime.getUIView().selectedResident?.knowledgeLabel).toBe("Recognized");
    runtime.dispatchUI({ type: "resident", action: "greet", residentId: porter.id });
    advancePlayerSteps(runtime, 10);

    expect(runtime.getUIView().selectedResident).toMatchObject({
      id: porter.id,
      knowledgeLabel: "Acquainted",
    });
    expect(runtime.getUIView().selectedResident?.actionLabel).toBeUndefined();
    expect(runtime.getRenderView().paused).toBe(false);
    runtime.destroy();
  });

  it("routes the title flourish through the runtime-owned soundscape", async () => {
    const runtime = await createTideweftRuntime(new MemoryRepository());

    await runtime.playTitleCrescendo(3);

    expect(soundscapePlay).toHaveBeenCalledOnce();
    expect(soundscapePlay).toHaveBeenCalledWith("title", 0.72, 3);
    runtime.destroy();
  });

  it("creates and persists Wander even when an older caller requests a timed shape", async () => {
    const repository = new MemoryRepository();
    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getUIView().title.requiresSeed).toBeUndefined();

    runtime.dispatchUI({
      type: "new-world",
      seed: "perpetual runtime",
      posture: "journey",
      sessionShape: "drift",
    });

    expect(runtime.getUIView().sessionShape).toBe("wander");
    expect(runtime.getUIView().posture).toBe("gale");
    expect(runtime.getUIView().title.visible).toBe(false);
    await runtime.save();
    const saved = decodeGameSave(repository.snapshot());
    expect(saved.session.sessionShape).toBe("wander");
    expect(saved.session.posture).toBe("gale");
    expect(saved.session.pressureMode).toBe("wild");
    expect(deserializeWorld(saved.world).meta.pressureMode).toBe("wild");
    runtime.destroy();
  });

  it("auto-resumes old postures into hard mode and refuses an unphrased replacement", async () => {
    const world = createWorld("auto return ledger", "calm");
    const session = createSessionState(world.meta.seedText, "hearth");
    session.titleVisible = true;
    session.paused = true;
    const repository = new MemoryRepository(runtimeSaveRecord(
      world,
      createPlayer(createWorldView(world)),
      session,
      "Auto return ledger",
    ));

    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getUIView().title.visible).toBe(false);
    expect(runtime.getUIView().clock.paused).toBe(false);
    expect(runtime.getUIView().posture).toBe("gale");

    runtime.dispatchUI({ type: "open-title" });
    const originalWorldName = runtime.getUIView().worldName;
    runtime.dispatchUI({
      type: "new-world",
      seed: "must not replace",
      posture: "hearth",
      sessionShape: "drift",
    });
    expect(runtime.getUIView().worldName).toBe(originalWorldName);
    expect(runtime.getUIView().title.visible).toBe(true);
    expect(runtime.getUIView().announcement?.message).toContain("restartrestartrestart");

    runtime.dispatchUI({
      type: "new-world",
      seed: "hard restart accepted",
      posture: "hearth",
      sessionShape: "drift",
      restartPhrase: "restartrestartrestart",
    });
    expect(runtime.getUIView().worldName).toContain("Hard Restart Accepted");
    expect(runtime.getUIView().posture).toBe("gale");
    expect(runtime.getUIView().sessionShape).toBe("wander");
    expect(runtime.getUIView().title.visible).toBe(false);
    await runtime.save();
    expect(deserializeWorld(decodeGameSave(repository.snapshot()).world).meta.pressureMode)
      .toBe("wild");
    runtime.destroy();
  });

  it("persists an exact restart in a new generation when the clock does not advance", async () => {
    vi.spyOn(Date, "now").mockReturnValue(700);
    const oldWorld = createWorld("same clock legacy", "calm");
    const oldSession = createSessionState(oldWorld.meta.seedText, "hearth");
    oldSession.titleVisible = true;
    oldSession.paused = true;
    const legacyRecord = runtimeSaveRecord(
      oldWorld,
      createPlayer(createWorldView(oldWorld)),
      oldSession,
      "Same clock legacy",
    );
    legacyRecord.updatedAt = 700;
    const repository = new VersionedMemoryRepository(legacyRecord);
    const runtime = await createTideweftRuntime(repository);

    // A generationless alpha save remains readable and is canonicalized to
    // generation zero on its next ordinary autosave.
    await runtime.save();
    expect(repository.snapshot()).toMatchObject({ saveGeneration: 0, updatedAt: 701 });

    runtime.dispatchUI({ type: "open-title" });
    runtime.dispatchUI({
      type: "new-world",
      seed: "padded phrase must fail",
      posture: "gale",
      sessionShape: "wander",
      restartPhrase: " restartrestartrestart",
    });
    expect(deserializeWorld(decodeGameSave(repository.snapshot()).world).meta.seedText)
      .toBe("same clock legacy");
    expect(runtime.getUIView().title.visible).toBe(true);

    runtime.dispatchUI({
      type: "new-world",
      seed: "   ",
      posture: "gale",
      sessionShape: "wander",
      restartPhrase: "restartrestartrestart",
    });
    expect(deserializeWorld(decodeGameSave(repository.snapshot()).world).meta.seedText)
      .toBe("same clock legacy");
    expect(runtime.getUIView().title.visible).toBe(true);
    expect(runtime.getUIView().announcement?.message).toContain("non-empty seed phrase");

    runtime.dispatchUI({
      type: "new-world",
      seed: "same clock replacement",
      posture: "hearth",
      sessionShape: "drift",
      restartPhrase: "restartrestartrestart",
    });
    await runtime.save();
    const replacement = repository.snapshot();
    expect(replacement.saveGeneration).toBe(1);
    expect(replacement.updatedAt).toBeGreaterThan(701);
    expect(deserializeWorld(decodeGameSave(replacement).world).meta.seedText)
      .toBe("same clock replacement");

    // A callback from the pre-restart tab can have the largest possible clock
    // and tick values; its older generation must still lose.
    await repository.save({
      ...legacyRecord,
      saveGeneration: 0,
      updatedAt: Number.MAX_SAFE_INTEGER,
      playTicks: Number.MAX_SAFE_INTEGER,
    });
    expect(repository.snapshot()).toEqual(replacement);
    runtime.destroy();

    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().title.visible).toBe(false);
    expect(resumed.getUIView().clock.paused).toBe(false);
    expect(resumed.getUIView().posture).toBe("gale");
    expect(deserializeWorld(decodeGameSave(repository.snapshot()).world).meta.seedText)
      .toBe("same clock replacement");
    await resumed.save();
    const resumedSave = repository.snapshot();
    expect(resumedSave.saveGeneration).toBe(1);
    expect(resumedSave.updatedAt).toBeGreaterThan(replacement.updatedAt);
    resumed.destroy();
  });

  it("can replace and reload a future-dated maximum timestamp inside a newer generation", async () => {
    vi.spyOn(Date, "now").mockReturnValue(812);
    const oldWorld = createWorld("maximum clock old world", "calm");
    const oldSession = createSessionState(oldWorld.meta.seedText, "hearth");
    const record = runtimeSaveRecord(
      oldWorld,
      createPlayer(createWorldView(oldWorld)),
      oldSession,
      "Maximum clock old world",
    );
    record.updatedAt = Number.MAX_SAFE_INTEGER;
    const repository = new VersionedMemoryRepository(record);
    const runtime = await createTideweftRuntime(repository);

    runtime.dispatchUI({ type: "open-title" });
    runtime.dispatchUI({
      type: "new-world",
      seed: "maximum clock replacement",
      posture: "hearth",
      sessionShape: "drift",
      restartPhrase: "restartrestartrestart",
    });
    await runtime.save();

    const replacement = repository.snapshot();
    expect(replacement.saveGeneration).toBe(1);
    expect(replacement.updatedAt).toBeGreaterThanOrEqual(812);
    expect(replacement.updatedAt).toBeLessThan(Number.MAX_SAFE_INTEGER);
    expect(deserializeWorld(decodeGameSave(replacement).world).meta.seedText)
      .toBe("maximum clock replacement");
    runtime.destroy();

    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().title.visible).toBe(false);
    expect(resumed.getUIView().clock.paused).toBe(false);
    expect(resumed.getUIView().worldName).toContain("Maximum Clock Replacement");
    resumed.destroy();
  });

  it("replaces a malformed saturated autosave with a durable newer generation", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_200);
    const corruptWorld = createWorld("corrupt saturated autosave", "calm");
    const corrupt = runtimeSaveRecord(
      corruptWorld,
      createPlayer(createWorldView(corruptWorld)),
      createSessionState(corruptWorld.meta.seedText, "hearth"),
      "Corrupt saturated autosave",
    );
    corrupt.updatedAt = Number.MAX_SAFE_INTEGER;
    corrupt.playTicks = Number.MAX_SAFE_INTEGER;
    corrupt.worldJson = "{not-json";
    const repository = new VersionedMemoryRepository(corrupt);

    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getUIView().title.visible).toBe(true);
    expect(runtime.getUIView().title.requiresSeed).toBe(true);
    expect(runtime.getUIView().title.worldCreationBlocked).toBeUndefined();
    expect(runtime.getUIView().announcement?.message).toContain("could not be read");
    expect(runtime.getUIView().saveWarning).toMatchObject({
      message: "LOCAL AUTOSAVE UNREADABLE",
      detail: expect.stringContaining("replacement is stored"),
    });
    await expect(runtime.save()).rejects.toThrow("Choose a seed before replacing");
    expect(repository.snapshot()).toEqual(corrupt);
    runtime.dispatchUI({
      type: "new-world",
      seed: "   ",
      posture: "gale",
      sessionShape: "wander",
    });
    expect(runtime.getUIView().announcement?.message).toContain("Enter a non-empty seed phrase");
    expect(runtime.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    expect(repository.snapshot()).toEqual(corrupt);
    runtime.dispatchUI({
      type: "new-world",
      seed: "clean recovery estuary",
      posture: "gale",
      sessionShape: "wander",
    });
    await runtime.save();

    const recovered = repository.snapshot();
    expect(recovered).toMatchObject({
      saveGeneration: 1,
      updatedAt: expect.any(Number),
    });
    expect(recovered.updatedAt).toBeLessThan(Number.MAX_SAFE_INTEGER);
    expect(recovered.playTicks).toBe(
      deserializeWorld(decodeGameSave(recovered).world).meta.completedTick,
    );
    expect(deserializeWorld(decodeGameSave(recovered).world).meta.seedText)
      .toBe("clean recovery estuary");
    expect(runtime.getUIView().saveWarning).toBeUndefined();
    expect(runtime.getUIView().title.requiresSeed).toBeUndefined();
    expect(runtime.getUIView().announcement?.message).toContain("LOCAL SAVE REPLACED");

    // A callback retaining the corrupt maximum clock still belongs to the old
    // generation and cannot resurrect it after recovery.
    await repository.save(corrupt);
    expect(repository.snapshot()).toEqual(recovered);
    runtime.destroy();

    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().title.visible).toBe(false);
    expect(resumed.getUIView().worldName).toContain("Clean Recovery Estuary");
    resumed.destroy();
  });

  it("recovers the exact malformed MAX record through the production local repository", async () => {
    vi.stubGlobal("indexedDB", undefined);
    vi.stubGlobal("localStorage", new RuntimeTestStorage());
    const repository = createSaveRepository();
    const corruptWorld = createWorld("production repository corruption", "calm");
    const corrupt = runtimeSaveRecord(
      corruptWorld,
      createPlayer(createWorldView(corruptWorld)),
      createSessionState("production repository corruption", "hearth"),
      "Production repository corruption",
    );
    corrupt.updatedAt = Number.MAX_SAFE_INTEGER;
    corrupt.playTicks = Number.MAX_SAFE_INTEGER;
    corrupt.worldJson = "{";
    await repository.save(corrupt);

    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({
      type: "new-world",
      seed: "production repository recovery",
      posture: "gale",
      sessionShape: "wander",
    });
    await runtime.save();
    const recovered = await repository.load("autosave");
    expect(recovered).toMatchObject({ saveGeneration: 1 });
    if (!recovered) throw new Error("production repository did not retain recovery");
    expect(deserializeWorld(decodeGameSave(recovered).world).meta.seedText)
      .toBe("production repository recovery");
    await expect(repository.save(corrupt)).rejects.toBeInstanceOf(StaleSaveWriteError);
    runtime.destroy();

    const resumed = await createTideweftRuntime(createSaveRepository());
    expect(resumed.getUIView().worldName).toContain("Production Repository Recovery");
    resumed.destroy();
  });

  it("rolls a corrupt maximum generation into a new era and blocks stale tabs", async () => {
    const corruptWorld = createWorld("maximum generation corruption", "calm");
    const corrupt = runtimeSaveRecord(
      corruptWorld,
      createPlayer(createWorldView(corruptWorld)),
      createSessionState(corruptWorld.meta.seedText, "hearth"),
      "Maximum generation corruption",
    );
    corrupt.saveGeneration = Number.MAX_SAFE_INTEGER;
    corrupt.updatedAt = Number.MAX_SAFE_INTEGER;
    corrupt.playTicks = Number.MAX_SAFE_INTEGER;
    corrupt.worldJson = "not an envelope";
    const repository = new VersionedMemoryRepository(corrupt);
    const runtime = await createTideweftRuntime(repository);

    runtime.dispatchUI({
      type: "new-world",
      seed: "era rollover recovery",
      posture: "gale",
      sessionShape: "wander",
    });
    await runtime.save();
    const recovered = repository.snapshot();
    expect(recovered).toMatchObject({ saveGenerationEra: 1, saveGeneration: 0 });
    expect(deserializeWorld(decodeGameSave(recovered).world).meta.seedText)
      .toBe("era rollover recovery");

    await repository.save(corrupt);
    expect(repository.snapshot()).toEqual(recovered);
    runtime.destroy();

    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().worldName).toContain("Era Rollover Recovery");
    resumed.destroy();
  });

  it("quarantines a decodable envelope whose outer play tick lies about its world", async () => {
    const corruptWorld = createWorld("lying save metadata", "calm");
    const corrupt = runtimeSaveRecord(
      corruptWorld,
      createPlayer(createWorldView(corruptWorld)),
      createSessionState(corruptWorld.meta.seedText, "hearth"),
      "Lying save metadata",
    );
    corrupt.updatedAt = Number.MAX_SAFE_INTEGER;
    corrupt.playTicks = Number.MAX_SAFE_INTEGER;
    const repository = new VersionedMemoryRepository(corrupt);
    const runtime = await createTideweftRuntime(repository);

    expect(runtime.getUIView().title.visible).toBe(true);
    expect(runtime.getUIView().announcement?.message).toContain("could not be read");
    runtime.dispatchUI({
      type: "new-world",
      seed: "metadata truthful recovery",
      posture: "gale",
      sessionShape: "wander",
    });
    await runtime.save();
    const recovered = repository.snapshot();
    expect(recovered.saveGeneration).toBe(1);
    expect(recovered.playTicks).toBe(
      deserializeWorld(decodeGameSave(recovered).world).meta.completedTick,
    );
    runtime.destroy();
  });

  it("quarantines a malformed session object before runtime adoption", async () => {
    const corruptWorld = createWorld("malformed session autosave", "calm");
    const corrupt = runtimeSaveRecord(
      corruptWorld,
      createPlayer(createWorldView(corruptWorld)),
      createSessionState(corruptWorld.meta.seedText, "hearth"),
      "Malformed session autosave",
    );
    const envelope = decodeGameSave(corrupt);
    corrupt.saveGeneration = 4;
    corrupt.worldJson = JSON.stringify({ ...envelope, session: {} });
    const repository = new VersionedMemoryRepository(corrupt);

    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getUIView().title.visible).toBe(true);
    expect(runtime.getUIView().announcement?.message).toContain("could not be read");
    runtime.dispatchUI({
      type: "new-world",
      seed: "safe session recovery",
      posture: "gale",
      sessionShape: "wander",
    });
    await runtime.save();
    expect(repository.snapshot().saveGeneration).toBe(5);
    runtime.destroy();

    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().worldName).toContain("Safe Session Recovery");
    resumed.destroy();
  });

  it.each([
    ["missing outer format fence", (record: SaveRecord, _envelope: TestGameSaveEnvelope) => {
      delete record.payloadVersion;
    }],
    ["contradictory outer format fence", (record: SaveRecord, _envelope: TestGameSaveEnvelope) => {
      record.payloadVersion = 2;
    }],
    ["unsealed player mutation", (_record: SaveRecord, envelope: TestGameSaveEnvelope) => {
      envelope.player.stamina = 123_456;
    }],
    ["resealed noncanonical session", (_record: SaveRecord, envelope: TestGameSaveEnvelope) => {
      envelope.session.posture = "hearth";
      resealGameSave(envelope);
    }],
    ["resealed invalid field ecology", (_record: SaveRecord, envelope: TestGameSaveEnvelope) => {
      if (!envelope.fieldResources) throw new Error("v3 fixture lost field ecology");
      envelope.fieldResources = { ...envelope.fieldResources, version: 2 as 1 };
      resealGameSave(envelope);
    }],
    ["resealed invalid traversal ledger", (_record: SaveRecord, envelope: TestGameSaveEnvelope) => {
      if (!envelope.traversalFeedback) throw new Error("v3 fixture lost traversal feedback");
      envelope.traversalFeedback = { ...envelope.traversalFeedback, completedSteps: -1 };
      resealGameSave(envelope);
    }],
    ["resealed missing physical custody", (_record: SaveRecord, envelope: TestGameSaveEnvelope) => {
      delete envelope.physicalCargo;
      resealGameSave(envelope);
    }],
  ] as const)("quarantines a current v3 save with %s", async (_label, mutate) => {
    const repository = new MemoryRepository();
    const original = await createTideweftRuntime(repository);
    await original.save();
    original.destroy();
    const record = repository.snapshot();
    const envelope = decodeGameSave(record);

    mutate(record, envelope);
    record.worldJson = JSON.stringify(envelope);
    repository.replace(record);

    const rejected = await createTideweftRuntime(repository);
    expect(rejected.getUIView().title.visible).toBe(true);
    expect(rejected.getUIView().title.hasSave).toBe(false);
    expect(rejected.getUIView().announcement?.message).toContain("could not be read");
    rejected.destroy();
  });

  it("rolls a valid maximum generation into a new era on deliberate restart", async () => {
    const oldWorld = createWorld("valid maximum generation", "calm");
    const record = runtimeSaveRecord(
      oldWorld,
      createPlayer(createWorldView(oldWorld)),
      createSessionState(oldWorld.meta.seedText, "hearth"),
      "Valid maximum generation",
    );
    record.saveGeneration = Number.MAX_SAFE_INTEGER;
    record.updatedAt = Number.MAX_SAFE_INTEGER;
    const repository = new VersionedMemoryRepository(record);
    const runtime = await createTideweftRuntime(repository);

    runtime.dispatchUI({ type: "open-title" });
    runtime.dispatchUI({
      type: "new-world",
      seed: "valid era restart",
      posture: "gale",
      sessionShape: "wander",
      restartPhrase: "restartrestartrestart",
    });
    await runtime.save();
    expect(repository.snapshot()).toMatchObject({ saveGenerationEra: 1, saveGeneration: 0 });
    expect(deserializeWorld(decodeGameSave(repository.snapshot()).world).meta.seedText)
      .toBe("valid era restart");
    runtime.destroy();
  });

  it("never wraps or reports durability when both save generation components are exhausted", async () => {
    const corruptWorld = createWorld("fully saturated corruption", "calm");
    const corrupt = runtimeSaveRecord(
      corruptWorld,
      createPlayer(createWorldView(corruptWorld)),
      createSessionState(corruptWorld.meta.seedText, "hearth"),
      "Fully saturated corruption",
    );
    corrupt.saveGenerationEra = Number.MAX_SAFE_INTEGER;
    corrupt.saveGeneration = Number.MAX_SAFE_INTEGER;
    corrupt.updatedAt = Number.MAX_SAFE_INTEGER;
    corrupt.playTicks = Number.MAX_SAFE_INTEGER;
    corrupt.worldJson = "{";
    const repository = new VersionedMemoryRepository(corrupt);
    const runtime = await createTideweftRuntime(repository);

    expect(runtime.getUIView().saveWarning).toMatchObject({
      message: "LOCAL SAVE NOT STORED",
      tone: "danger",
    });
    expect(runtime.getUIView().saveWarning?.detail).toContain("Clear Tideweft's stored site data");
    expect(runtime.getUIView().title.worldCreationBlocked).toBe(true);
    const saturatedWorldName = runtime.getUIView().worldName;
    runtime.dispatchUI({
      type: "new-world",
      seed: "must not wrap saturated save",
      posture: "gale",
      sessionShape: "wander",
    });
    runtime.dispatchUI({ type: "resume-world" });
    expect(runtime.getUIView().worldName).toBe(saturatedWorldName);
    expect(runtime.getUIView().title.visible).toBe(true);
    expect(runtime.getUIView().announcement?.message).toContain("clear Tideweft's stored site data");
    await expect(runtime.save()).rejects.toThrow("replacement counter is exhausted");
    expect(repository.snapshot()).toEqual(corrupt);
    runtime.destroy();
  });

  it("refuses to overwrite a fenced newer save while its backend is unavailable", async () => {
    const repository: SaveRepository = {
      list: vi.fn(async () => []),
      load: vi.fn(async () => {
        throw new NewerSaveUnavailableError({
          slotId: "autosave",
          saveGenerationEra: 3,
          saveGeneration: 7,
          updatedAt: 4_000,
          playTicks: 900,
        });
      }),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };

    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getUIView().saveWarning?.message).toBe("LOCAL SAVE NOT STORED");
    expect(runtime.getUIView().saveWarning?.detail).toContain("newer local copy exists");
    expect(runtime.getUIView().title.worldCreationBlocked).toBe(true);
    expect(runtime.getUIView().announcement?.message).toContain("TEMPORARILY UNAVAILABLE");
    const unavailableWorldName = runtime.getUIView().worldName;
    runtime.dispatchUI({
      type: "new-world",
      seed: "must not replace fenced save",
      posture: "gale",
      sessionShape: "wander",
    });
    runtime.dispatchUI({ type: "resume-world" });
    expect(runtime.getUIView().worldName).toBe(unavailableWorldName);
    expect(runtime.getUIView().title.visible).toBe(true);
    expect(runtime.getUIView().announcement?.message).toContain("nothing was opened or replaced");
    await expect(runtime.save()).rejects.toThrow("newer local save is temporarily unavailable");
    expect(repository.save).not.toHaveBeenCalled();
    runtime.destroy();
  });

  it("fails closed when storage cannot prove whether an autosave exists", async () => {
    vi.useFakeTimers();
    const latentWorld = createWorld("latent durable save", "calm");
    const latentRecord = runtimeSaveRecord(
      latentWorld,
      createPlayer(createWorldView(latentWorld)),
      createSessionState(latentWorld.meta.seedText, "hearth"),
      "Latent durable save",
    );
    let readable = false;
    const repository: SaveRepository = {
      list: vi.fn(async () => []),
      load: vi.fn(async () => {
        if (!readable) throw new Error("transient IndexedDB read failure");
        return structuredClone(latentRecord);
      }),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };

    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getUIView().title.visible).toBe(true);
    expect(runtime.getUIView().title.hasSave).toBe(false);
    expect(runtime.getUIView().title.requiresSeed).toBeUndefined();
    expect(runtime.getUIView().title.worldCreationBlocked).toBe(true);
    expect(runtime.getUIView().saveWarning).toMatchObject({
      message: "LOCAL SAVE UNAVAILABLE",
      detail: expect.stringContaining("could not prove that local storage is empty"),
    });
    expect(runtime.getUIView().announcement?.message).toContain("Nothing will be opened or overwritten");

    for (const seed of ["", "   ", "must not replace latent data", "rapid second submission"]) {
      runtime.dispatchUI({
        type: "new-world",
        seed,
        posture: "gale",
        sessionShape: "wander",
      });
    }
    runtime.dispatchUI({ type: "resume-world" });
    expect(runtime.getUIView().title.visible).toBe(true);
    expect(runtime.getUIView().saveWarning?.message).toBe("LOCAL SAVE UNAVAILABLE");
    expect(runtime.getUIView().announcement?.message).toContain("will not open or overwrite");
    await expect(runtime.save()).rejects.toThrow("could not be read");
    await expect(runtime.save()).rejects.toThrow("could not be read");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.remove).not.toHaveBeenCalled();
    runtime.destroy();

    readable = true;
    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().worldName).toContain("Latent Durable Save");
    expect(resumed.getUIView().title.visible).toBe(false);
    expect(resumed.getUIView().saveWarning).toBeUndefined();
    expect(repository.save).not.toHaveBeenCalled();
    resumed.destroy();
  });

  it("truthfully replaces equal-version conflicting copies in a newer generation", async () => {
    let conflictPending = true;
    let stored: SaveRecord | undefined;
    const repository: SaveRepository = {
      list: vi.fn(async () => []),
      load: vi.fn(async () => {
        if (conflictPending) {
          conflictPending = false;
          throw new ConflictingSaveCopiesError({
            slotId: "autosave",
            saveGenerationEra: 2,
            saveGeneration: 7,
            updatedAt: 5_000,
            playTicks: 90,
          });
        }
        return stored ? structuredClone(stored) : undefined;
      }),
      save: vi.fn(async (record) => { stored = structuredClone(record); }),
      remove: vi.fn(async () => { stored = undefined; }),
    };

    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getUIView().announcement?.message).toContain("conflicting local autosaves");
    expect(runtime.getUIView().announcement?.message).toContain("Start a seed to replace both safely");
    expect(runtime.getUIView().saveWarning).toMatchObject({
      message: "LOCAL AUTOSAVES CONFLICT",
      detail: expect.stringContaining("Neither equal-version copy was chosen"),
    });
    expect(runtime.getUIView().title.requiresSeed).toBe(true);
    expect(runtime.getUIView().title.worldCreationBlocked).toBeUndefined();
    await expect(runtime.save()).rejects.toThrow("Choose a seed before replacing");
    expect(repository.save).not.toHaveBeenCalled();
    runtime.dispatchUI({
      type: "new-world",
      seed: "conflict recovery seed",
      posture: "gale",
      sessionShape: "wander",
    });
    await runtime.save();
    expect(stored).toMatchObject({ saveGenerationEra: 2, saveGeneration: 8 });
    if (!stored) throw new Error("conflict recovery was not stored");
    expect(deserializeWorld(decodeGameSave(stored).world).meta.seedText)
      .toBe("conflict recovery seed");
    expect(runtime.getUIView().saveWarning).toBeUndefined();
    expect(runtime.getUIView().title.requiresSeed).toBeUndefined();
    expect(runtime.getUIView().announcement?.message).toContain("LOCAL SAVE REPLACED");
    runtime.destroy();

    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().worldName).toContain("Conflict Recovery Seed");
    resumed.destroy();
  });

  it("blocks and stops retrying when a newer local save supersedes this runtime", async () => {
    vi.useFakeTimers();
    const repository: SaveRepository = {
      list: vi.fn(async () => []),
      load: vi.fn(async () => undefined),
      save: vi.fn(async () => {
        throw new StaleSaveWriteError("autosave");
      }),
      remove: vi.fn(async () => undefined),
    };
    const runtime = await createTideweftRuntime(repository);

    await expect(runtime.save()).rejects.toBeInstanceOf(StaleSaveWriteError);
    expect(runtime.getUIView().saveWarning).toMatchObject({
      message: "LOCAL SAVE SUPERSEDED",
      detail: expect.stringContaining("will not retry or overwrite it"),
    });
    expect(runtime.getUIView().title.worldCreationBlocked).toBe(true);
    expect(runtime.getUIView().announcement?.message).toContain("reload to resolve the copies");
    const supersededWorldName = runtime.getUIView().worldName;
    runtime.dispatchUI({
      type: "new-world",
      seed: "must not replace superseded save",
      posture: "gale",
      sessionShape: "wander",
    });
    runtime.dispatchUI({ type: "resume-world" });
    expect(runtime.getUIView().worldName).toBe(supersededWorldName);
    expect(runtime.getUIView().title.visible).toBe(true);
    expect(runtime.getUIView().announcement?.message).toContain("reload to resolve");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(repository.save).toHaveBeenCalledOnce();
    await expect(runtime.save()).rejects.toThrow("superseded by a newer local save");
    expect(repository.save).toHaveBeenCalledOnce();
    runtime.destroy();
  });

  it("warns without losing the in-memory restart and retries its newest snapshot after a failed automatic save", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(900);
    const oldWorld = createWorld("failed restart old world", "calm");
    const oldSession = createSessionState(oldWorld.meta.seedText, "hearth");
    const repository = new DeferredSaveRepository(runtimeSaveRecord(
      oldWorld,
      createPlayer(createWorldView(oldWorld)),
      oldSession,
      "Failed restart old world",
    ));
    const runtime = await createTideweftRuntime(repository);

    runtime.dispatchUI({
      type: "new-world",
      seed: "retryable replacement",
      posture: "hearth",
      sessionShape: "drift",
      restartPhrase: "restartrestartrestart",
    });
    expect(repository.started).toHaveLength(1);
    expect(repository.started[0]?.saveGeneration).toBe(1);

    repository.rejectNext(new Error("all local save backends unavailable"));
    await vi.waitFor(() => {
      expect(runtime.getUIView().announcement?.message).toContain("LOCAL SAVE FAILED");
    });
    expect(runtime.getUIView().saveWarning).toMatchObject({
      message: "LOCAL SAVE NOT STORED",
      tone: "danger",
    });
    expect(runtime.getUIView().saveWarning?.detail).toContain("only in this open window");
    expect(runtime.getUIView().worldName).toContain("Retryable Replacement");
    expect(runtime.getUIView().title.visible).toBe(false);

    // The retry snapshots live state instead of replaying a stale failed
    // record, so changes made while storage is unavailable remain included.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(repository.started).toHaveLength(2);
    const retryEnvelope = decodeGameSave(repository.started[1] as SaveRecord);
    expect(deserializeWorld(retryEnvelope.world).meta.seedText).toBe("retryable replacement");
    expect(retryEnvelope.player.pace).toBe("steady");
    expect(repository.started[1]?.saveGeneration).toBe(1);

    repository.resolveNext();
    await vi.waitFor(() => {
      expect(runtime.getUIView().announcement?.message).toContain("LOCAL SAVE RESTORED");
    });
    expect(runtime.getUIView().saveWarning).toBeUndefined();
    expect(deserializeWorld(decodeGameSave(repository.snapshot()).world).meta.seedText)
      .toBe("retryable replacement");
    runtime.destroy();
  });

  it("cancels a failed-save retry when the runtime is destroyed", async () => {
    vi.useFakeTimers();
    const repository = new DeferredSaveRepository();
    const runtime = await createTideweftRuntime(repository);
    const failedSave = runtime.save();
    const rejected = expect(failedSave).rejects.toThrow("storage remains unavailable");
    repository.rejectNext(new Error("storage remains unavailable"));
    await rejected;
    expect(runtime.getUIView().saveWarning?.message).toBe("LOCAL SAVE NOT STORED");
    expect(repository.started).toHaveLength(1);

    runtime.destroy();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(repository.started).toHaveLength(1);
  });

  it("keeps the save warning until the world currently on screen is durable", async () => {
    vi.useFakeTimers();
    const oldWorld = createWorld("generation race old world", "calm");
    const repository = new DeferredSaveRepository(runtimeSaveRecord(
      oldWorld,
      createPlayer(createWorldView(oldWorld)),
      createSessionState(oldWorld.meta.seedText, "hearth"),
      "Generation race old world",
    ));
    const runtime = await createTideweftRuntime(repository);

    runtime.dispatchUI({
      type: "new-world",
      seed: "generation one",
      posture: "hearth",
      sessionShape: "drift",
      restartPhrase: "restartrestartrestart",
    });
    repository.rejectNext(new Error("generation one could not be stored"));
    await vi.waitFor(() => {
      expect(runtime.getUIView().saveWarning?.message).toBe("LOCAL SAVE NOT STORED");
    });

    await vi.advanceTimersByTimeAsync(2_000);
    expect(repository.started.at(-1)?.saveGeneration).toBe(1);

    // Replace the in-memory world again while generation one's automatic retry
    // is still unresolved. Its later success must not clear generation two's
    // warning or claim that generation two is durable.
    runtime.dispatchUI({
      type: "new-world",
      seed: "generation two",
      posture: "hearth",
      sessionShape: "drift",
      restartPhrase: "restartrestartrestart",
    });
    expect(runtime.getUIView().worldName).toContain("Generation Two");

    repository.resolveNext();
    await vi.waitFor(() => {
      expect(repository.started.at(-1)?.saveGeneration).toBe(2);
    });
    expect(runtime.getUIView().saveWarning?.message).toBe("LOCAL SAVE NOT STORED");
    expect(runtime.getUIView().announcement?.message).not.toContain("LOCAL SAVE RESTORED");

    repository.resolveNext();
    await vi.waitFor(() => {
      expect(runtime.getUIView().saveWarning).toBeUndefined();
    });
    expect(runtime.getUIView().announcement?.message).toContain("LOCAL SAVE RESTORED");
    expect(repository.snapshot().saveGeneration).toBe(2);
    expect(deserializeWorld(decodeGameSave(repository.snapshot()).world).meta.seedText)
      .toBe("generation two");
    runtime.destroy();
  });

  it("loads and re-saves legacy shape values without restoring their quota objective", async () => {
    const world = createWorld("legacy shape runtime", "calm");
    const view = createWorldView(world);
    const player = createPlayer(view);
    const legacySession = createSessionState(world.meta.seedText, "journey", "weave");
    legacySession.tutorial.dismissed = true;
    legacySession.closureOffered = true;
    legacySession.sessionDeliveries = 9;
    const repository = new MemoryRepository(runtimeSaveRecord(
      world,
      player,
      legacySession,
      "Legacy Weave",
    ));

    const runtime = await createTideweftRuntime(repository);

    expect(runtime.getUIView().sessionShape).toBe("weave");
    expect(runtime.getUIView().objective?.id).toBe("perpetual-estuary");
    expect(runtime.getUIView().objective?.description).toContain("no session timer or quota");
    await runtime.save();
    expect(decodeGameSave(repository.snapshot()).session.sessionShape).toBe("weave");
    runtime.destroy();
  });
});

describe("runtime clarity guards", () => {
  it("projects the held brace bit immediately into both player views", async () => {
    const runtime = await createTideweftRuntime(new MemoryRepository());
    runtime.dispatchUI({
      type: "new-world",
      seed: "visible global brace",
      posture: "gale",
      sessionShape: "wander",
    });

    expect(runtime.getRenderView().player.bracing).toBe(false);
    expect(runtime.getUIView().player.bracing).toBe(false);
    runtime.dispatchRenderer({ type: "brace", active: true });
    expect(runtime.getRenderView().player.bracing).toBe(true);
    expect(runtime.getUIView().player.bracing).toBe(true);
    runtime.dispatchRenderer({ type: "brace", active: false });
    expect(runtime.getRenderView().player.bracing).toBe(false);
    expect(runtime.getUIView().player.bracing).toBe(false);
    runtime.destroy();
  });

  it("holds a coherent clicked diagonal, stops without bounce, and keeps routes transient", async () => {
    const world = createWorld("the loom walks one clean diagonal", "calm");
    for (const tile of world.terrain.tiles) {
      tile.elevation = 900_000;
      tile.moisture = 100_000;
      tile.roughness = 0;
      tile.terrain = "meadow";
      tile.baseTravelCost = 100;
    }
    world.weather.kind = "clear";
    world.weather.intensity = 0;
    world.weather.windX = 0;
    world.weather.windY = 0;
    world.weather.nextChangeTick = world.meta.completedTick + 100_000;
    const view = createWorldView(world);
    const startTile = view.terrain.tiles.find((tile) => tile.x === 24 && tile.y === 24);
    if (!startTile) throw new Error("fixture could not find its interior start tile");
    const player = createPlayer(view);
    placePlayerOnTile(player, startTile);
    player.stamina = 1_000_000;
    player.stability = 1_000_000;
    const repository = new MemoryRepository(runtimeSaveRecord(
      world,
      player,
      createSessionState(world.meta.seedText),
      "Coherent diagonal",
    ));
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    const tileSize = runtime.getRenderView().terrain.tileSize;
    const start = runtime.getRenderView().player.position;
    const target = {
      x: start.x + tileSize * 6,
      y: start.y + tileSize * 6,
    };
    runtime.dispatchRenderer({ type: "move-target", point: target, additive: false });

    const movingVelocities: Array<{ x: number; y: number }> = [];
    for (let step = 0; step < 120; step += 1) {
      advancePlayerSteps(runtime, 1);
      const velocity = runtime.getRenderView().player.velocity;
      if (velocity.x !== 0 || velocity.y !== 0) movingVelocities.push({ ...velocity });
      const position = runtime.getRenderView().player.position;
      if (
        velocity.x === 0
        && velocity.y === 0
        && Math.hypot(target.x - position.x, target.y - position.y) < tileSize / 2
      ) break;
    }

    expect(movingVelocities.length).toBeGreaterThan(30);
    expect(movingVelocities.every(({ x, y }) => x > 0 && y > 0)).toBe(true);
    const arrived = runtime.getRenderView().player.position;
    expect(Math.hypot(target.x - arrived.x, target.y - arrived.y)).toBeLessThan(tileSize / 8);
    advancePlayerSteps(runtime, 4);
    expect(runtime.getRenderView().player.position).toEqual(arrived);
    expect(runtime.getRenderView().player.velocity).toEqual({ x: 0, y: 0 });

    // Replacing a destination changes heading immediately, while explicit
    // cancellation never leaves a stale waypoint able to pull the player.
    runtime.dispatchRenderer({
      type: "move-target",
      point: { x: arrived.x + tileSize * 4, y: arrived.y },
      additive: false,
    });
    advancePlayerSteps(runtime, 2);
    runtime.dispatchRenderer({
      type: "move-target",
      point: {
        x: runtime.getRenderView().player.position.x - tileSize * 4,
        y: runtime.getRenderView().player.position.y - tileSize * 4,
      },
      additive: false,
    });
    advancePlayerSteps(runtime, 1);
    expect(runtime.getRenderView().player.velocity.x).toBeLessThan(0);
    expect(runtime.getRenderView().player.velocity.y).toBeLessThan(0);
    runtime.dispatchRenderer({ type: "cancel" });
    const cancelled = runtime.getRenderView().player.position;
    advancePlayerSteps(runtime, 3);
    expect(runtime.getRenderView().player.position).toEqual(cancelled);

    runtime.dispatchRenderer({
      type: "move-target",
      point: { x: cancelled.x + tileSize * 4, y: cancelled.y + tileSize * 4 },
      additive: false,
    });
    advancePlayerSteps(runtime, 1);
    runtime.dispatchRenderer({ type: "movement", vector: { x: -1, y: 0 } });
    advancePlayerSteps(runtime, 1);
    expect(runtime.getRenderView().player.velocity.x).toBeLessThan(0);
    expect(runtime.getRenderView().player.velocity.y).toBe(0);
    runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    const manuallyCancelled = runtime.getRenderView().player.position;
    advancePlayerSteps(runtime, 2);
    expect(runtime.getRenderView().player.position).toEqual(manuallyCancelled);

    // Autopilot is intentionally transient: saving during a fresh route must
    // never reconstruct a stale click after reload.
    runtime.dispatchRenderer({
      type: "move-target",
      point: {
        x: manuallyCancelled.x + tileSize * 5,
        y: manuallyCancelled.y + tileSize * 2,
      },
      additive: false,
    });
    await runtime.save();
    runtime.destroy();
    const resumed = await createTideweftRuntime(repository);
    resumed.dispatchUI({ type: "resume-world" });
    const reloadedPosition = resumed.getRenderView().player.position;
    advancePlayerSteps(resumed, 3);
    expect(resumed.getRenderView().player.position).toEqual(reloadedPosition);
    resumed.destroy();
  });

  it("projects every stamina change through sweep recovery and immediate water re-entry", async () => {
    const world = createWorld("runtime stamina reentry", "calm");
    const occupied = new Set(world.settlements.map((settlement) => settlement.tileIndex));
    const channel = world.terrain.tiles.find(
      (tile) => tile.x > 2
        && tile.y > 2
        && tile.x + 3 < world.terrain.width
        && tile.y + 3 < world.terrain.height
        && !occupied.has(tile.index),
    );
    if (!channel) throw new Error("fixture could not reserve a channel tile");

    // One deep mark in an otherwise safe local estuary makes the recovery and
    // return path short, deterministic, and independent of generated relief.
    for (const tile of world.terrain.tiles) {
      tile.elevation = world.tide.level;
      tile.terrain = "meadow";
      tile.roughness = 0;
      tile.baseTravelCost = 100;
    }
    channel.elevation = 0;
    channel.terrain = "deep-water";
    channel.baseTravelCost = 520;

    const view = createWorldView(world);
    const player = createPlayer(view);
    const channelView = view.terrain.tiles[channel.index];
    if (!channelView) throw new Error("fixture channel disappeared from the world view");
    placePlayerOnTile(player, channelView);
    player.pace = "swift";
    player.stamina = 12_001;
    const repository = new MemoryRepository(runtimeSaveRecord(
      world,
      player,
      createSessionState(world.meta.seedText),
      "Stamina re-entry",
    ));
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    const channelTarget = structuredClone(runtime.getRenderView().player.position);
    runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
    advancePlayerSteps(runtime, 1);
    runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });

    expect(runtime.getRenderView().player.mode).toBe("swept");
    expect(runtime.getRenderView().player.stamina).toBe(0);
    expect(runtime.getUIView().player.stamina).toBe(0);

    // Reaching shallow water is no longer enough by itself: the porter must
    // also float long enough to rebuild the authoritative standing reserve.
    for (let step = 0; step < 80 && runtime.getRenderView().player.mode === "swept"; step += 1) {
      advancePlayerSteps(runtime, 1);
      expect(runtime.getUIView().player.stamina).toBe(runtime.getRenderView().player.stamina);
    }

    expect(runtime.getRenderView().player.mode).toBe("camp");
    expect(runtime.getUIView().player.pace).toBe("rest");
    const shoreStamina = runtime.getUIView().player.stamina;
    expect(shoreStamina).toBeCloseTo(0.15, 6);
    expect(runtime.getRenderView().player.stamina).toBe(shoreStamina);

    runtime.dispatchRenderer({
      type: "move-target",
      point: {
        x: channelTarget.x,
        y: channelTarget.y,
      },
      additive: false,
    });
    advancePlayerSteps(runtime, 1);

    // The first touch-routed step after reaching shore is real travel, not a
    // hidden rest tick, and both projections expose its drain immediately.
    expect(runtime.getUIView().player.stamina).toBeLessThan(shoreStamina);
    expect(runtime.getRenderView().player.stamina).toBe(runtime.getUIView().player.stamina);

    for (let step = 0; step < 16 && !runtime.getUIView().field.isWater; step += 1) {
      const before = runtime.getUIView().player.stamina;
      advancePlayerSteps(runtime, 1);
      expect(runtime.getUIView().player.stamina).toBeLessThan(before);
      expect(runtime.getRenderView().player.stamina).toBe(runtime.getUIView().player.stamina);
    }
    expect(runtime.getUIView().field.isWater).toBe(true);
    expect(runtime.getUIView().player.stamina).toBeLessThan(shoreStamina);
    runtime.destroy();
  });

  it("announces stability loss, rather than stamina loss, when deep water takes control", async () => {
    const world = createWorld("runtime stability sweep", "calm");
    const occupied = new Set(world.settlements.map(({ tileIndex }) => tileIndex));
    const deepTile = world.terrain.tiles.find((tile) => !occupied.has(tile.index));
    if (!deepTile) throw new Error("fixture did not provide an open water test tile");
    deepTile.terrain = "deep-water";
    deepTile.roughness = FIXED_POINT;
    deepTile.elevation = 0;
    runTicks(world, 360);
    world.weather = {
      kind: "storm",
      intensity: FIXED_POINT,
      windX: FIXED_POINT,
      windY: -FIXED_POINT,
      nextChangeTick: world.meta.completedTick + 1_000,
    };
    const view = createWorldView(world);
    const liveDeepTile = view.terrain.tiles[deepTile.index];
    if (!liveDeepTile) throw new Error("fixture lost deep water in projection");
    const player = createPlayer(view);
    placePlayerOnTile(player, liveDeepTile);
    player.stability = FIXED_POINT;
    player.stamina = 800_000;
    const repository = new MemoryRepository(runtimeSaveRecord(
      world,
      player,
      createSessionState(world.meta.seedText),
      "Stability sweep",
    ));

    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 1 } });
    advancePlayerSteps(runtime, 1);

    expect(runtime.getRenderView().player.mode).toBe("swept");
    expect(runtime.getRenderView().player.incident?.kind).toBe("sweep");
    expect(runtime.getUIView().announcement?.message).toContain("WHHSH!");
    expect(runtime.getUIView().announcement?.message).toContain("lost balance");
    expect(runtime.getUIView().announcement?.message).not.toContain("STAMINA EMPTY");
    runtime.destroy();
  });

  it("reloads a current v5 ADRIFT save without moving the porter or changing physical cargo", async () => {
    const repository = new MemoryRepository();
    const setup = await createTideweftRuntime(repository);
    setup.dispatchUI({ type: "resume-world" });
    const offer = setup.getUIView().contracts.find((contract) =>
      contract.actionLabel === "Pick up cargo here");
    if (!offer) throw new Error("fixture did not begin beside physical Promise cargo");
    setup.dispatchUI({ type: "contract", action: "accept", contractId: offer.id });
    advancePlayerSteps(setup, 10);
    await setup.save();
    setup.destroy();

    // Begin from a real, sealed v5 save with an authoritative physical cargo
    // manifest. Choose the strongest real wet contact in its persisted region
    // at high tide so the next movement beat can lose live footing.
    const preparedRecord = repository.snapshot();
    const prepared = decodeGameSave(preparedRecord);
    expect(prepared.version).toBe(5);
    expect(prepared.physicalCargo?.expectedManifest.entries.length).toBeGreaterThan(0);
    const preparedWorld = deserializeWorld(prepared.world);
    const ticksToHighTide = (360 - (preparedWorld.meta.completedTick % 720) + 720) % 720;
    runTicks(preparedWorld, ticksToHighTide);
    preparedWorld.weather = {
      kind: "storm",
      intensity: FIXED_POINT,
      windX: FIXED_POINT,
      windY: -FIXED_POINT,
      nextChangeTick: preparedWorld.meta.completedTick + 1_000,
    };
    const preparedRegional = restorePlayerRegionalTravel(
      preparedWorld.meta.rootSeed,
      prepared.player,
      prepared.regionalTravel ?? "",
    );
    if (!preparedRegional) throw new Error("fixture lost its sealed regional stream");
    const exposedChannelTile = [...preparedRegional.window.terrain.tiles]
      .filter((tile) => {
        const address = preparedRegional.window.addresses[tile.index];
        return address?.region.x === 0
          && address.region.y === 0
          && preparedWorld.tide.level - tile.elevation >= 120_000;
      })
      .sort((left, right) => (
        (preparedWorld.tide.level - right.elevation) * 2 + right.roughness
      ) - (
        (preparedWorld.tide.level - left.elevation) * 2 + left.roughness
      ))[0];
    if (!exposedChannelTile) throw new Error("fixture did not provide an exposed channel tile");
    const exposedAddress = preparedRegional.window.addresses[exposedChannelTile.index];
    if (!exposedAddress) throw new Error("fixture channel lost its stable address");
    const compatibilityChannel = preparedWorld.terrain.tiles[
      exposedAddress.localY * preparedWorld.terrain.width + exposedAddress.localX
    ];
    if (!compatibilityChannel) throw new Error("fixture channel left the compatibility terrain");
    compatibilityChannel.elevation = 0;
    compatibilityChannel.terrain = "deep-water";
    compatibilityChannel.roughness = FIXED_POINT;
    compatibilityChannel.baseTravelCost = 520;
    const positionedRegional = moveRegionalFixtureToAddress(
      preparedWorld.meta.rootSeed,
      preparedRegional,
      prepared.player,
      exposedAddress.region,
      exposedAddress.localX,
      exposedAddress.localY,
    );
    const positionedChannel = regionLocalToWindowTile(
      positionedRegional.window,
      exposedAddress.region,
      exposedAddress.localX,
      exposedAddress.localY,
    );
    if (positionedChannel === null) throw new Error("fixture channel left its aligned frame");
    prepared.world = serializeWorld(preparedWorld);
    const regionalX = positionedChannel.x;
    const regionalY = positionedChannel.y;
    const regionalTileIndex = regionalY * REGIONAL_TRAVEL_COLUMNS + regionalX;
    prepared.player.x = regionalX * TILE_UNITS + TILE_UNITS / 2;
    prepared.player.y = regionalY * TILE_UNITS + TILE_UNITS / 2;
    prepared.player.previousX = prepared.player.x;
    prepared.player.previousY = prepared.player.y;
    prepared.player.currentTrace = [regionalTileIndex];
    prepared.player.surveyTrace = [regionalTileIndex];
    prepared.player.mode = "foot";
    prepared.player.pace = "steady";
    prepared.player.stability = FIXED_POINT;
    prepared.player.stamina = 800_000;
    prepared.player.velocityX = 0;
    prepared.player.velocityY = -100;
    prepared.player.sweepPath = [];
    prepared.player.sweepTicksRemaining = 0;
    prepared.player.sweepTotalTicks = 0;
    prepared.player.sweepSupport = null;
    prepared.regionalTravel = serializePlayerRegionalTravel(
      capturePlayerRegionalTravel(positionedRegional, prepared.player),
    );
    prepared.promiseJourney = prepared.player.activeContractId === null
      ? { version: 1, contractId: null, detoured: false, compatibilityTrace: [] }
      : {
          version: 1,
          contractId: prepared.player.activeContractId,
          detoured: true,
          compatibilityTrace: [],
        };
    prepared.traversalFeedback = createTraversalFeedbackState();
    resealGameSave(prepared);
    repository.replace({
      ...preparedRecord,
      playTicks: preparedWorld.meta.completedTick,
      worldJson: JSON.stringify(prepared),
    });

    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    const tileSize = runtime.getRenderView().terrain.tileSize;

    // This movement command models a held keyboard direction. It is sent while
    // still standing, creates the sweep on the first tick, and must remain the
    // accepted paddle input on the next ADRIFT tick without another keydown.
    runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 1 } });
    advancePlayerSteps(runtime, 1);
    expect(runtime.getRenderView().player.mode).toBe("swept");
    expect(runtime.getRenderView().player.incident?.kind).toBe("sweep");
    const sweepEntryPosition = runtime.getRenderView().player.position;
    const staminaAtSweep = runtime.getRenderView().player.stamina;

    advancePlayerSteps(runtime, 1);
    expect(runtime.getRenderView().player.adrift).toMatchObject({
      paddling: true,
      catchingBreath: false,
    });
    expect(runtime.getRenderView().player.stamina).toBeLessThan(staminaAtSweep);

    // Keyup is the zero vector. The next fixed beat floats and recovers rather
    // than inheriting a hidden stroke from the transition.
    runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    const staminaBeforeReleaseBeat = runtime.getRenderView().player.stamina;
    advancePlayerSteps(runtime, 1);
    expect(runtime.getRenderView().player.adrift).toMatchObject({
      paddling: false,
      catchingBreath: true,
    });
    expect(runtime.getRenderView().player.stamina).toBeGreaterThan(staminaBeforeReleaseBeat);

    // Blur/view-deactivation is projected as an explicit zero movement command.
    // It must cancel a runtime-owned touch stroke even though no keyboard key
    // was ever held.
    const beforeTap = runtime.getRenderView().player.position;
    runtime.dispatchRenderer({
      type: "move-target",
      point: { x: beforeTap.x, y: beforeTap.y + tileSize },
      additive: false,
    });
    runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    const staminaBeforeCancelledTap = runtime.getRenderView().player.stamina;
    advancePlayerSteps(runtime, 1);
    expect(runtime.getRenderView().player.adrift).toMatchObject({
      paddling: false,
      catchingBreath: true,
    });
    expect(runtime.getRenderView().player.stamina).toBeGreaterThan(staminaBeforeCancelledTap);

    // A nearby mobile move target supplies exactly the same directional verb
    // for a bounded eight-beat stroke. One later beat proves it cannot become
    // sticky touch autopilot.
    const secondTap = runtime.getRenderView().player.position;
    runtime.dispatchRenderer({
      type: "move-target",
      point: { x: secondTap.x, y: secondTap.y + tileSize },
      additive: false,
    });
    advancePlayerSteps(runtime, 1);
    expect(runtime.getRenderView().player.adrift?.paddling).toBe(true);
    advancePlayerSteps(runtime, 8);
    expect(runtime.getRenderView().player.adrift).toMatchObject({
      paddling: false,
      catchingBreath: true,
    });

    const entryTile = {
      x: Math.floor(sweepEntryPosition.x / tileSize),
      y: Math.floor(sweepEntryPosition.y / tileSize),
    };
    let afterMovement = runtime.getRenderView().player.position;
    for (let step = 0; step < 48; step += 1) {
      const currentTile = {
        x: Math.floor(afterMovement.x / tileSize),
        y: Math.floor(afterMovement.y / tileSize),
      };
      if (currentTile.x !== entryTile.x || currentTile.y !== entryTile.y) break;
      advancePlayerSteps(runtime, 1);
      afterMovement = runtime.getRenderView().player.position;
    }
    expect({
      x: Math.floor(afterMovement.x / tileSize),
      y: Math.floor(afterMovement.y / tileSize),
    }).not.toEqual(entryTile);
    expect(runtime.getRenderView().player.mode).toBe("swept");
    expect(runtime.getRenderView().player.incident?.kind).toBe("sweep");

    await runtime.save();
    const durableRecord = repository.snapshot();
    const durable = decodeGameSave(durableRecord);
    const durableCargo = durable.physicalCargo;
    const durableTraversal = durable.traversalFeedback;
    if (!durableCargo || !durableTraversal) {
      throw new Error("current ADRIFT save omitted authoritative sidecars");
    }
    expect(durable.version).toBe(5);
    expect(durableRecord.payloadVersion).toBe(5);
    expect(durable.player.mode).toBe("swept");
    expect(durable.player.sweepSupport).toBeNull();
    expect(durableTraversal.incident?.kind).toBe("sweep");
    const positionAtSave = { x: durable.player.x, y: durable.player.y };
    const priorPositionAtSave = {
      x: durable.player.previousX,
      y: durable.player.previousY,
    };
    const staminaAtSave = durable.player.stamina;
    const supportAtSave = durable.player.sweepSupport;
    const incidentAtSave = structuredClone(durableTraversal);
    const cargoAtSave = structuredClone(durableCargo);
    const renderAtSave = structuredClone(runtime.getRenderView().player);
    runtime.destroy();

    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getRenderView().player).toMatchObject({
      position: renderAtSave.position,
      velocity: renderAtSave.velocity,
      stamina: renderAtSave.stamina,
      mode: "swept",
      incident: renderAtSave.incident,
    });
    await resumed.save();
    const reloaded = decodeGameSave(repository.snapshot());
    expect({ x: reloaded.player.x, y: reloaded.player.y }).toEqual(positionAtSave);
    expect({
      x: reloaded.player.previousX,
      y: reloaded.player.previousY,
    }).toEqual(priorPositionAtSave);
    expect(reloaded.player.stamina).toBe(staminaAtSave);
    expect(reloaded.player.mode).toBe("swept");
    expect(reloaded.player.sweepSupport).toBe(supportAtSave);
    expect(reloaded.traversalFeedback).toEqual(incidentAtSave);
    expect(reloaded.physicalCargo?.expectedManifest).toEqual(cargoAtSave.expectedManifest);
    expect(reloaded.physicalCargo).toEqual(cargoAtSave);
    resumed.destroy();
  });

  it("explains ADRIFT control and ignores scan and pace commands while swept", async () => {
    const world = createWorld("runtime swept guard", "calm");
    const view = createWorldView(world);
    const deepTile = view.terrain.tiles.find((tile) => tile.waterDepth >= 120_000);
    if (!deepTile) throw new Error("fixture did not generate deep water");
    const player = createPlayer(view);
    player.x = deepTile.x * TILE_UNITS + TILE_UNITS / 2;
    player.y = deepTile.y * TILE_UNITS + TILE_UNITS / 2;
    player.previousX = player.x;
    player.previousY = player.y;
    player.mode = "swept";
    player.pace = "rest";
    player.sweepPath = [view.terrain.tiles.length - 1];
    player.sweepTicksRemaining = 0;
    player.sweepTotalTicks = 0;
    const session = createSessionState(world.meta.seedText);
    const envelope = {
      format: "tideweft-session",
      version: 1,
      world: serializeWorld(world),
      player,
      session,
    };
    const repository = new MemoryRepository({
      slotId: "autosave",
      label: "Swept save",
      seed: world.meta.seedText,
      updatedAt: 1,
      playTicks: 0,
      settlementCount: world.settlements.length,
      connectedCount: 0,
      worldJson: JSON.stringify(envelope),
    });
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });

    expect(runtime.getUIView().field.swept).toBe(true);
    runtime.dispatchUI({ type: "scan" });
    expect(runtime.getUIView().announcement?.message).toContain("ADRIFT");
    expect(runtime.getUIView().announcement?.message).toContain("sounding line stays secured");
    expect(runtime.getUIView().player.pace).toBe("rest");
    runtime.destroy();
  });

  it("preserves a legitimately high-tide Tide anchor when its tidal flat reloads at low water", async () => {
    const world = createWorld("receded anchor save", "calm");
    const lowView = createWorldView(world);
    const settlementTiles = new Set(world.settlements.map((settlement) => settlement.tileIndex));
    const tidalFlat = lowView.terrain.tiles.find(
      (tile) => tile.terrain === "tidal-flat" && !settlementTiles.has(tile.index),
    );
    if (!tidalFlat) throw new Error("fixture did not generate an open tidal flat");
    const context = wayknotContextAt(lowView, tidalFlat.index);
    if (!context) throw new Error("fixture tidal flat has no Wayknot context");
    const highTideDepth = Math.max(0, tideAtTick(360).level - tidalFlat.elevation);
    expect(context.waterDepth).toBeLessThan(120_000);
    expect(highTideDepth).toBeGreaterThanOrEqual(120_000);

    const player = createPlayer(lowView);
    const placed = placeWayknot(player.wayknots, "tide-anchor", {
      ...context,
      waterDepth: highTideDepth,
    });
    expect(placed.ok).toBe(true);
    player.wayknots = placed.state;
    const repository = new MemoryRepository(runtimeSaveRecord(
      world,
      player,
      createSessionState(world.meta.seedText),
      "Receded anchor",
    ));

    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getRenderView().wayknots).toEqual([
      expect.objectContaining({ id: "3", kind: "tide-anchor" }),
    ]);
    await runtime.save();
    expect(
      decodeGameSave(repository.snapshot()).player.wayknots.wayknots
        .find((wayknot) => wayknot.id === 3)?.tileIndex,
    ).toBe(tidalFlat.index);
    runtime.destroy();
  });

  it("returns malformed Tide anchors on permanently unsuitable meadow and ridge to the pack", async () => {
    const world = createWorld("dry anchor repair", "calm");
    const view = createWorldView(world);
    const settlementTiles = new Set(world.settlements.map((settlement) => settlement.tileIndex));
    const meadow = view.terrain.tiles.find(
      (tile) => tile.terrain === "meadow" && !settlementTiles.has(tile.index),
    );
    const ridge = view.terrain.tiles.find(
      (tile) => tile.terrain === "ridge" && !settlementTiles.has(tile.index),
    );
    if (!meadow || !ridge) throw new Error("fixture did not generate open meadow and ridge tiles");
    expect(meadow.waterDepth).toBeLessThan(120_000);
    expect(ridge.waterDepth).toBeLessThan(120_000);

    const player = createPlayer(view);
    player.wayknots = {
      ...player.wayknots,
      wayknots: player.wayknots.wayknots.map((wayknot) => {
        if (wayknot.id === 3) return { ...wayknot, tileIndex: meadow.index };
        if (wayknot.id === 4) return { ...wayknot, tileIndex: ridge.index };
        return wayknot;
      }),
    };
    const repository = new MemoryRepository(runtimeSaveRecord(
      world,
      player,
      createSessionState(world.meta.seedText),
      "Dry malformed anchors",
    ));

    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getRenderView().wayknots).toEqual([]);
    await runtime.save();
    const repaired = decodeGameSave(repository.snapshot()).player.wayknots.wayknots;
    expect(repaired.find((wayknot) => wayknot.id === 3)?.tileIndex).toBeNull();
    expect(repaired.find((wayknot) => wayknot.id === 4)?.tileIndex).toBeNull();
    runtime.destroy();
  });

  it("requires a sounding before binding a flooded non-channel anchor but still permits reclaim", async () => {
    const world = runTicks(createWorld("sound before anchor", "calm"), 360);
    const view = createWorldView(world);
    const settlementTiles = new Set(world.settlements.map((settlement) => settlement.tileIndex));
    const flooded = view.terrain.tiles.find((tile) =>
      tile.terrain !== "deep-water"
      && tile.waterDepth >= 120_000
      && !settlementTiles.has(tile.index),
    );
    if (!flooded) throw new Error("fixture did not generate sounded-anchor ground at high tide");
    const player = createPlayer(view);
    placePlayerOnTile(player, flooded);
    player.depthSoundings[flooded.index] = 0;
    const session = createSessionState(world.meta.seedText);
    session.titleVisible = false;
    session.paused = false;
    const repository = new MemoryRepository(runtimeSaveRecord(
      world,
      player,
      session,
      "Unsounded flooded anchor",
    ));

    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    runtime.dispatchUI({ type: "wayknot" });
    expect(runtime.getRenderView().wayknots).toEqual([]);
    expect(runtime.getUIView().announcement?.message).toContain("Pulse Space first");

    runtime.dispatchUI({ type: "scan" });
    expect(runtime.getUIView().field.depthKnown).toBe(true);
    runtime.dispatchUI({ type: "wayknot" });
    expect(runtime.getRenderView().wayknots).toEqual([
      expect.objectContaining({ id: "3", kind: "tide-anchor" }),
    ]);
    await runtime.save();
    runtime.destroy();

    const unsoundedRecord = repository.snapshot();
    const unsoundedEnvelope = decodeGameSave(unsoundedRecord);
    unsoundedEnvelope.player.depthSoundings[flooded.index] = 0;
    resealGameSave(unsoundedEnvelope);
    unsoundedRecord.updatedAt += 1;
    unsoundedRecord.worldJson = JSON.stringify(unsoundedEnvelope);
    repository.replace(unsoundedRecord);

    const resumed = await createTideweftRuntime(repository);
    resumed.dispatchUI({ type: "resume-world" });
    expect(resumed.getRenderView().wayknots).toHaveLength(1);
    resumed.dispatchUI({ type: "wayknot" });
    expect(resumed.getRenderView().wayknots).toEqual([]);
    expect(resumed.getUIView().announcement?.message).toContain("reclaimed");
    resumed.destroy();
  });

  it("collects a promise immediately when its action is used at the offer harbor", async () => {
    const runtime = await createTideweftRuntime(new MemoryRepository());
    runtime.dispatchUI({ type: "resume-world" });
    const localOffer = runtime.getUIView().contracts.find((contract) => contract.actionLabel === "Pick up cargo here");
    if (!localOffer) throw new Error("fixture did not start at a local cargo offer");

    runtime.dispatchUI({
      type: "contract",
      action: "accept",
      contractId: localOffer.id,
    });

    expect(runtime.getUIView().player.cargoLoad).toBeGreaterThan(0);
    expect(runtime.getUIView().objective?.title).toContain("DELIVER");
    expect(runtime.getUIView().objective?.description).toContain("cargo is in your pack");
    runtime.destroy();
  });

  it("turns a dropped Promise into a persistent RECOVER objective and restores the same exact parcel", async () => {
    const repository = new MemoryRepository();
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    const offer = runtime.getUIView().contracts.find((contract) =>
      contract.actionLabel === "Pick up cargo here");
    if (!offer) throw new Error("fixture did not begin at a physical Promise pickup");
    runtime.dispatchUI({ type: "contract", action: "accept", contractId: offer.id });
    advancePlayerSteps(runtime, 10);
    const promiseRow = runtime.getUIView().kit?.transportRows.find((row) =>
      row.kind === "promise-cargo" && row.lotId !== undefined);
    if (!promiseRow?.lotId || !promiseRow.dropQuantity) {
      throw new Error("accepted Promise did not expose its exact carried lot");
    }

    runtime.dispatchUI({
      type: "kit",
      action: "drop",
      lotId: promiseRow.lotId,
      quantity: promiseRow.dropQuantity,
    });

    const loose = runtime.getRenderView().looseCargo ?? [];
    expect(loose).toHaveLength(1);
    expect(loose[0]).toMatchObject({
      contentKind: "promise",
      promiseContractId: Number(offer.id),
      recovery: "reachable",
    });
    expect(runtime.getUIView().objective).toMatchObject({
      id: `recover-${offer.id}`,
      eyebrow: "Recover loose Promise cargo",
    });
    expect(runtime.getUIView().controls).toMatchObject({
      canInteract: true,
      interactLabel: "Recover parcel",
    });
    runtime.dispatchUI({ type: "contract", action: "renegotiate", contractId: offer.id });
    expect(runtime.getUIView().announcement?.message).toContain("RECOVER CARGO");
    const parcelId = loose[0]?.id;
    if (!parcelId) throw new Error("dropped Promise lost its parcel identity");
    await runtime.save();
    const beforeReload = decodeGameSave(repository.snapshot()).physicalCargo;
    expect(beforeReload?.looseWorld.entities[0]?.id).toBe(parcelId);
    runtime.destroy();

    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().objective?.id).toBe(`recover-${offer.id}`);
    expect(resumed.getRenderView().looseCargo?.map(({ id }) => id)).toEqual([parcelId]);
    resumed.dispatchRenderer({
      type: "parcel-target",
      parcelId,
      recoverOnArrival: true,
    });
    expect(resumed.getRenderView().looseCargo).toEqual([]);
    expect(resumed.getUIView().objective?.id).toBe(offer.id);
    expect(resumed.getUIView().objective?.title).toContain("DELIVER");
    const recoveredLotId = `loose:${parcelId}`;
    expect(resumed.getUIView().kit?.transportRows.find((row) =>
      row.kind === "promise-cargo")?.lotId).toBe(recoveredLotId);
    await resumed.save();
    const recoveredSave = decodeGameSave(repository.snapshot()).physicalCargo;
    expect(recoveredSave?.looseWorld.entities).toEqual([]);
    expect(recoveredSave?.carrier.lots.some((lot) => lot.id === recoveredLotId)).toBe(true);
    expect(recoveredSave?.carrier.retiredLotIds).toContain(promiseRow.lotId);
    resumed.destroy();
  });

  it("repairs an older accepted-without-pickup snapshot back to an offered promise", async () => {
    const world = createWorld("interrupted accepted pickup", "calm");
    const view = createWorldView(world);
    const contract = world.contracts.find((candidate) => candidate.status === "offered");
    if (!contract) throw new Error("fixture did not generate an offered contract");
    const player = createPlayer(view, contract.originSettlementId);
    expect(loadContractCargo(player, contract)).toBe(true);
    stepWorld(world, [{
      id: "legacy-half-accept",
      type: "accept-contract",
      contractId: contract.id,
      carrier: "player",
    }]);
    expect(contract.status).toBe("accepted");
    expect(contract.cargoQuantity).toBe(0);
    const session = createSessionState(world.meta.seedText);
    session.trackedContractId = contract.id;
    session.tutorial.acceptedPromises = 1;
    session.tutorial.stage = "travel";
    const envelope: TestGameSaveEnvelope = {
      format: "tideweft-session",
      version: 1,
      world: serializeWorld(world),
      player,
      session,
    };
    const repository = new MemoryRepository({
      slotId: "autosave",
      label: "Interrupted pickup",
      seed: world.meta.seedText,
      updatedAt: 1,
      playTicks: world.meta.completedTick,
      settlementCount: world.settlements.length,
      connectedCount: 0,
      worldJson: JSON.stringify(envelope),
    });

    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getUIView().player.cargoLoad).toBe(0);
    expect(runtime.getUIView().contracts.find((item) => Number(item.id) === contract.id)?.actionLabel)
      .toBe("Pick up cargo here");
    await runtime.save();
    const repairedWorld = deserializeWorld(decodeGameSave(repository.snapshot()).world);
    const repairedContract = repairedWorld.contracts.find((candidate) => candidate.id === contract.id);
    expect(repairedContract?.status).toBe("offered");
    expect(repairedContract?.carrierKind).toBeNull();
    expect(repairedContract?.cargoQuantity).toBe(0);
    expectConserved(repairedWorld);
    runtime.destroy();
  });

  it("repairs a 64x48 Alpha pickup before deriving trace and restores its choir baseline", async () => {
    const world = legacySizedWorld(createWorld("published alpha pickup", "calm"));
    assertWorldInvariants(world);
    const view = createWorldView(world);
    const contract = world.contracts.find((candidate) => candidate.status === "offered");
    if (!contract) throw new Error("legacy fixture did not generate an offered contract");
    const player = createPlayer(view, contract.originSettlementId);
    expect(loadContractCargo(player, contract)).toBe(true);
    const legacyPlayer = structuredClone(player) as Partial<PlayerState>;
    legacyPlayer.currentTrace = [0, 1];
    delete legacyPlayer.worldWidth;
    delete legacyPlayer.worldHeight;
    delete legacyPlayer.previousX;
    delete legacyPlayer.previousY;
    delete legacyPlayer.velocityX;
    delete legacyPlayer.velocityY;
    delete legacyPlayer.facingMilliRadians;
    delete legacyPlayer.stabilityTrend;
    delete legacyPlayer.stabilityHint;
    delete legacyPlayer.scanPulse;
    delete legacyPlayer.depthSoundings;
    delete legacyPlayer.tools;
    delete legacyPlayer.wayknots;
    delete legacyPlayer.sweepTicksRemaining;
    delete legacyPlayer.sweepTotalTicks;
    delete legacyPlayer.sweepPath;
    delete legacyPlayer.sweepSupport;
    delete legacyPlayer.surveyTrace;
    delete legacyPlayer.surveyedRouteIds;
    delete legacyPlayer.harborTrail;
    delete legacyPlayer.lastHarborId;
    delete legacyPlayer.report;
    delete legacyPlayer.reportsDelivered;

    const session = createSessionState(world.meta.seedText);
    session.trackedContractId = contract.id;
    session.tutorial.acceptedPromises = 1;
    session.tutorial.stage = "travel";
    session.sessionBaseline = captureSessionBaseline(view);
    const legacySession = structuredClone(session) as Partial<GameSessionState>;
    delete legacySession.sessionChoirsAwakened;
    delete (legacySession.sessionBaseline as Partial<SessionBaseline>).awakenedChoirs;
    const envelope: TestGameSaveEnvelope = {
      format: "tideweft-session",
      version: 1,
      world: alphaWorldSaveText(world),
      player: legacyPlayer as PlayerState,
      session: legacySession as GameSessionState,
    };
    const repository = new MemoryRepository({
      slotId: "autosave",
      label: "Published Alpha pickup",
      seed: world.meta.seedText,
      updatedAt: 1,
      playTicks: world.meta.completedTick,
      settlementCount: world.settlements.length,
      connectedCount: 0,
      worldJson: JSON.stringify(envelope),
    });

    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getUIView().player.cargoLoad).toBe(0);
    expect(runtime.getUIView().contracts.find((item) => Number(item.id) === contract.id)?.actionLabel)
      .toBe("Pick up cargo here");
    await runtime.save();
    const repaired = decodeGameSave(repository.snapshot());
    const repairedWorld = deserializeWorld(repaired.world);
    expect(repairedWorld.terrain.width).toBe(LEGACY_WORLD_WIDTH);
    expect(repairedWorld.terrain.height).toBe(LEGACY_WORLD_HEIGHT);
    expect(repaired.player.worldWidth).toBe(REGIONAL_TRAVEL_COLUMNS);
    expect(repaired.player.worldHeight).toBe(REGIONAL_TRAVEL_ROWS);
    const repairedOrigin = world.settlements.find(
      (settlement) => settlement.id === contract.originSettlementId,
    )?.tileIndex;
    if (repairedOrigin === undefined) throw new Error("legacy Promise origin disappeared");
    const repairedOriginX = repairedOrigin % LEGACY_WORLD_WIDTH;
    const repairedOriginY = Math.floor(repairedOrigin / LEGACY_WORLD_WIDTH);
    if (!repaired.regionalTravel) throw new Error("repaired save omitted regional travel");
    const repairedTravel = restorePlayerRegionalTravel(
      repairedWorld.meta.rootSeed,
      repaired.player,
      repaired.regionalTravel,
    );
    if (!repairedTravel) throw new Error("repaired regional travel did not restore");
    const repairedTraceIndex = regionTileIndexToWindowIndex(
      repairedTravel.window,
      createRegionCoord(0, 0),
      repairedOriginY * WORLD_WIDTH + repairedOriginX,
    );
    if (repairedTraceIndex === null) throw new Error("repaired origin is outside its spatial frame");
    expect(repaired.player.currentTrace).toEqual([repairedTraceIndex]);
    expect(repaired.player.currentTrace.every(Number.isSafeInteger)).toBe(true);
    expect(repaired.player.wayknots.capacity).toBe(6);
    expect(repaired.player.wayknots.wayknots).toHaveLength(6);
    expect(repaired.player.wayknots.wayknots.every((wayknot) => wayknot.tileIndex === null)).toBe(true);
    expect(Object.hasOwn(repaired.player, "tideHarps")).toBe(false);
    expect(repaired.session.sessionBaseline?.awakenedChoirs).toBe(repairedWorld.choirs.length);
    assertWorldInvariants(repairedWorld);
    runtime.destroy();
  });

  it("repairs a failed pickup when saving before its queued release tick", async () => {
    const world = createWorld("pickup stock race", "calm");
    const view = createWorldView(world);
    const contract = world.contracts.find((candidate) => candidate.status === "offered");
    if (!contract) throw new Error("fixture did not generate an offered contract");
    const origin = world.settlements.find((settlement) => settlement.id === contract.originSettlementId);
    if (!origin) throw new Error("fixture contract has no origin");
    const availableAtPickup = Math.max(0, contract.quantity - 1);
    const removedStock = origin.inventory[contract.resource] - availableAtPickup;
    origin.inventory[contract.resource] = availableAtPickup;
    world.ledger.consumed[contract.resource] += removedStock;
    assertWorldInvariants(world);
    expectConserved(world);

    const player = createPlayer(view, contract.originSettlementId);
    const session = createSessionState(world.meta.seedText);
    const envelope: TestGameSaveEnvelope = {
      format: "tideweft-session",
      version: 1,
      world: serializeWorld(world),
      player,
      session,
    };
    const repository = new MemoryRepository({
      slotId: "autosave",
      label: "Pickup stock race",
      seed: world.meta.seedText,
      updatedAt: 1,
      playTicks: world.meta.completedTick,
      settlementCount: world.settlements.length,
      connectedCount: 0,
      worldJson: JSON.stringify(envelope),
    });
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    runtime.dispatchUI({ type: "contract", action: "accept", contractId: String(contract.id) });
    expect(runtime.getUIView().player.cargoLoad).toBeGreaterThan(0);

    advancePlayerSteps(runtime, 10);
    expect(runtime.getUIView().player.cargoLoad).toBe(0);
    expect(runtime.getUIView().announcement?.message).toContain("could not secure that cargo");
    // The simulation accepted first, pickup rejected, and reconciliation queued
    // a release. Saving here used to lose that queue and strand the contract.
    await runtime.save();
    const repairedSave = decodeGameSave(repository.snapshot());
    const repairedWorld = deserializeWorld(repairedSave.world);
    const repairedContract = repairedWorld.contracts.find((candidate) => candidate.id === contract.id);
    expect(repairedContract?.status).toBe("offered");
    expect(repairedContract?.carrierKind).toBeNull();
    expect(repairedContract?.cargoQuantity).toBe(0);
    expect(repairedSave.player.activeContractId).toBeNull();
    expectConserved(repairedWorld);
    assertWorldInvariants(repairedWorld);
    runtime.destroy();

    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().contracts.find((item) => Number(item.id) === contract.id)?.actionLabel)
      .toBe("Pick up cargo here");
    expect(resumed.getUIView().player.cargoLoad).toBe(0);
    resumed.destroy();
  });

  it("rolls back an interrupted optimistic pickup in the save and can reload, retry, and deliver", async () => {
    const repository = new MemoryRepository();
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    await runtime.save();
    const beforePickup = decodeGameSave(repository.snapshot());
    const localOffer = runtime.getUIView().contracts.find((contract) => contract.actionLabel === "Pick up cargo here");
    if (!localOffer) throw new Error("fixture did not start at a local cargo offer");
    const contractId = Number(localOffer.id);

    runtime.dispatchUI({ type: "contract", action: "accept", contractId: localOffer.id });
    expect(runtime.getUIView().player.cargoLoad).toBeGreaterThan(0);

    // This is the pagehide window: local cargo exists, but accept + pickup have
    // not reached the next authoritative world tick.
    await runtime.save();
    const interruptedSave = decodeGameSave(repository.snapshot());
    expect(interruptedSave.world).toBe(beforePickup.world);
    expect(interruptedSave.player.activeContractId).toBeNull();
    expect(interruptedSave.player.cargo.some((cargo) => cargo.contractId === contractId)).toBe(false);
    expect(interruptedSave.session.trackedContractId).toBe(contractId);
    const interruptedWorld = deserializeWorld(interruptedSave.world);
    const stillOffered = interruptedWorld.contracts.find((contract) => contract.id === contractId);
    expect(stillOffered?.status).toBe("offered");
    expect(stillOffered?.cargoQuantity).toBe(0);
    expectConserved(interruptedWorld);
    runtime.destroy();

    const resumed = await createTideweftRuntime(repository);
    resumed.dispatchUI({ type: "resume-world" });
    const retry = resumed.getUIView().contracts.find((contract) => Number(contract.id) === contractId);
    expect(retry?.actionLabel).toBe("Pick up cargo here");
    expect(resumed.getUIView().player.cargoLoad).toBe(0);
    resumed.dispatchUI({ type: "contract", action: "accept", contractId: String(contractId) });
    expect(resumed.getUIView().player.cargoLoad).toBeGreaterThan(0);
    advancePlayerSteps(resumed, 10);
    await resumed.save();

    const carriedSaveRecord = repository.snapshot();
    const carriedSave = decodeGameSave(carriedSaveRecord);
    const carriedWorld = deserializeWorld(carriedSave.world);
    const carriedContract = carriedWorld.contracts.find((contract) => contract.id === contractId);
    if (!carriedContract) throw new Error("retried contract disappeared");
    const unknownRequester = carriedWorld.residents.find(
      ({ id }) => id === carriedContract.requesterResidentId,
    );
    if (!unknownRequester) throw new Error("retried contract requester disappeared");
    expect(unknownRequester.playerKnowledge.level).toBe("unfamiliar");
    expect(carriedContract.status).toBe("in-transit");
    expect(carriedContract.carrierKind).toBe("player");
    expect(carriedContract.cargoQuantity).toBe(carriedContract.quantity);
    expectConserved(carriedWorld);

    const destination = carriedWorld.settlements.find(
      (settlement) => settlement.id === carriedContract.destinationSettlementId,
    );
    const route = carriedWorld.routes.find((candidate) => candidate.id === carriedContract.routeId);
    if (!destination || !route) throw new Error("retried contract has no destination route");
    const destinationTile = carriedWorld.terrain.tiles[destination.tileIndex];
    if (!destinationTile) throw new Error("destination has no terrain tile");
    const trace = route.fromSettlementId === carriedContract.originSettlementId
      ? [...route.path]
      : [...route.path].reverse();
    if (!carriedSave.regionalTravel) throw new Error("carried save omitted regional travel");
    const carriedTravel = restorePlayerRegionalTravel(
      carriedWorld.meta.rootSeed,
      carriedSave.player,
      carriedSave.regionalTravel,
    );
    if (!carriedTravel) throw new Error("carried save regional travel did not restore");
    const positionedTravel = moveRegionalFixtureToAddress(
      carriedWorld.meta.rootSeed,
      carriedTravel,
      carriedSave.player,
      createRegionCoord(0, 0),
      destinationTile.x,
      destinationTile.y,
    );
    carriedSave.regionalTravel = serializePlayerRegionalTravel(
      capturePlayerRegionalTravel(positionedTravel, carriedSave.player),
    );
    carriedSave.promiseJourney = {
      version: 1,
      contractId,
      detoured: false,
      compatibilityTrace: trace,
    };
    resealGameSave(carriedSave);
    repository.replace({
      ...carriedSaveRecord,
      worldJson: JSON.stringify(carriedSave),
    });
    resumed.destroy();

    const atDestination = await createTideweftRuntime(repository);
    atDestination.dispatchUI({ type: "resume-world" });
    atDestination.dispatchUI({ type: "interact" });
    expect(atDestination.getUIView().announcement?.message).toContain("receiving the cargo");
    advancePlayerSteps(atDestination, 10);
    expect(atDestination.getUIView().player.cargoLoad).toBe(0);
    expect(atDestination.getUIView().announcement?.message).not.toContain(unknownRequester.name);
    await atDestination.save();
    const deliveredSave = decodeGameSave(repository.snapshot());
    const deliveredWorld = deserializeWorld(deliveredSave.world);
    expect(deliveredWorld.contracts.find((contract) => contract.id === contractId)?.status).toBe("fulfilled");
    expect(deliveredSave.session.sessionChanges.join("\n")).not.toContain(unknownRequester.name);
    expectConserved(deliveredWorld);
    atDestination.destroy();
  });

  it("coalesces visibility and pagehide saves behind an in-flight write and persists the newest snapshot", async () => {
    const repository = new DeferredSaveRepository();
    const runtime = await createTideweftRuntime(repository);
    const firstSave = runtime.save();
    expect(repository.started).toHaveLength(1);

    runtime.dispatchUI({ type: "resume-world" });
    const visibilitySave = runtime.save();
    const pagehideSave = runtime.save();
    expect(repository.started).toHaveLength(1);

    let visibilitySettled = false;
    void visibilitySave.then(() => { visibilitySettled = true; });
    repository.resolveNext();
    await firstSave;
    await vi.waitFor(() => expect(repository.started).toHaveLength(2));
    expect(visibilitySettled).toBe(false);
    // Only the latest of the two lifecycle snapshots reaches the repository.
    expect(decodeGameSave(repository.started[1] as SaveRecord).player.pace).toBe("steady");

    repository.resolveNext();
    await Promise.all([visibilitySave, pagehideSave]);
    const newest = decodeGameSave(repository.snapshot());
    expect(newest.player.pace).toBe("steady");
    expect(repository.started).toHaveLength(2);
    expect(repository.started[0]?.playTicks).toBe(repository.started[1]?.playTicks);
    runtime.destroy();
  });

  it("continues with a queued newer snapshot when an earlier repository write fails", async () => {
    const repository = new DeferredSaveRepository();
    const runtime = await createTideweftRuntime(repository);
    const failedSave = runtime.save();
    const failedExpectation = expect(failedSave).rejects.toThrow("transient storage failure");

    runtime.dispatchUI({ type: "resume-world" });
    const recoverySave = runtime.save();
    repository.rejectNext(new Error("transient storage failure"));
    await failedExpectation;
    await vi.waitFor(() => expect(repository.started).toHaveLength(2));
    expect(decodeGameSave(repository.started[1] as SaveRecord).player.pace).toBe("steady");

    repository.resolveNext();
    await recoverySave;
    expect(decodeGameSave(repository.snapshot()).player.pace).toBe("steady");
    expect(runtime.getUIView().saveWarning).toBeUndefined();
    expect(runtime.getUIView().announcement?.message).toContain("LOCAL SAVE RESTORED");
    runtime.destroy();
  });

  it("keeps warning when an older same-generation retry succeeds before a newer request", async () => {
    vi.useFakeTimers();
    const repository = new DeferredSaveRepository();
    const runtime = await createTideweftRuntime(repository);
    const firstSave = runtime.save();
    const firstFailure = expect(firstSave).rejects.toThrow("initial storage failure");
    repository.rejectNext(new Error("initial storage failure"));
    await firstFailure;
    expect(runtime.getUIView().saveWarning?.message).toBe("LOCAL SAVE NOT STORED");

    await vi.advanceTimersByTimeAsync(2_000);
    expect(repository.started).toHaveLength(2);
    const newerSave = runtime.save();
    expect(repository.started).toHaveLength(2);

    repository.resolveNext();
    await vi.waitFor(() => expect(repository.started).toHaveLength(3));
    expect(runtime.getUIView().saveWarning?.message).toBe("LOCAL SAVE NOT STORED");
    expect(runtime.getUIView().announcement?.message).not.toContain("LOCAL SAVE RESTORED");
    expect(decodeGameSave(repository.started[2] as SaveRecord).player.pace).toBe("steady");

    const newerFailure = expect(newerSave).rejects.toThrow("newest snapshot failed");
    repository.rejectNext(new Error("newest snapshot failed"));
    await newerFailure;
    expect(runtime.getUIView().saveWarning?.message).toBe("LOCAL SAVE NOT STORED");

    await vi.advanceTimersByTimeAsync(4_000);
    expect(repository.started).toHaveLength(4);
    expect(decodeGameSave(repository.started[3] as SaveRecord).player.pace).toBe("steady");
    repository.resolveNext();
    await vi.waitFor(() => expect(runtime.getUIView().saveWarning).toBeUndefined());
    expect(runtime.getUIView().announcement?.message).toContain("LOCAL SAVE RESTORED");
    runtime.destroy();
  });
});

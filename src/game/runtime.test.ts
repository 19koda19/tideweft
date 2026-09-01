import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import {
  LEGACY_WORLD_HEIGHT,
  LEGACY_WORLD_WIDTH,
  RESOURCE_KINDS,
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

vi.mock("../audio/soundscape", () => ({
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(): void {}
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

class DeferredSaveRepository implements SaveRepository {
  private record: SaveRecord | undefined;
  private readonly pending: Array<{
    record: SaveRecord;
    resolve: () => void;
    reject: (reason: unknown) => void;
  }> = [];
  readonly started: SaveRecord[] = [];

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
  version: 1;
  world: string;
  player: PlayerState;
  session: GameSessionState;
}

let scheduledFrame: ((now: number) => void) | undefined;

beforeEach(() => {
  scheduledFrame = undefined;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: (now: number) => void) => {
    scheduledFrame = callback;
    return 1;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function decodeGameSave(record: SaveRecord): TestGameSaveEnvelope {
  return JSON.parse(record.worldJson) as TestGameSaveEnvelope;
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
  it("creates and persists Wander even when an older caller requests a timed shape", async () => {
    const repository = new MemoryRepository();
    const runtime = await createTideweftRuntime(repository);

    runtime.dispatchUI({
      type: "new-world",
      seed: "perpetual runtime",
      posture: "journey",
      sessionShape: "drift",
    });

    expect(runtime.getUIView().sessionShape).toBe("wander");
    expect(runtime.getUIView().title.visible).toBe(false);
    await runtime.save();
    expect(decodeGameSave(repository.snapshot()).session.sessionShape).toBe("wander");
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
    player.stamina = 16_000;
    const repository = new MemoryRepository(runtimeSaveRecord(
      world,
      player,
      createSessionState(world.meta.seedText),
      "Stamina re-entry",
    ));
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
    advancePlayerSteps(runtime, 1);
    runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });

    expect(runtime.getRenderView().player.mode).toBe("swept");
    expect(runtime.getRenderView().player.stamina).toBe(0);
    expect(runtime.getUIView().player.stamina).toBe(0);

    for (let step = 0; step < 20 && runtime.getRenderView().player.mode === "swept"; step += 1) {
      advancePlayerSteps(runtime, 1);
      expect(runtime.getUIView().player.stamina).toBe(runtime.getRenderView().player.stamina);
    }

    expect(runtime.getRenderView().player.mode).toBe("camp");
    expect(runtime.getUIView().player.pace).toBe("steady");
    const shoreStamina = runtime.getUIView().player.stamina;
    expect(shoreStamina).toBeCloseTo(0.15, 6);
    expect(runtime.getRenderView().player.stamina).toBe(shoreStamina);

    runtime.dispatchRenderer({
      type: "move-target",
      point: { x: (channel.x + 0.5) * 24, y: (channel.y + 0.5) * 24 },
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
    const view = createWorldView(world);
    const deepTile = view.terrain.tiles.find((tile) => tile.waterDepth >= 120_000);
    if (!deepTile) throw new Error("fixture did not generate deep water");
    const player = createPlayer(view);
    placePlayerOnTile(player, deepTile);
    player.stability = 0;
    player.stamina = 800_000;
    const repository = new MemoryRepository(runtimeSaveRecord(
      world,
      player,
      createSessionState(world.meta.seedText),
      "Stability sweep",
    ));

    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    advancePlayerSteps(runtime, 1);

    expect(runtime.getRenderView().player.mode).toBe("swept");
    expect(runtime.getUIView().announcement?.message).toContain("STABILITY EMPTY IN DEEP WATER");
    expect(runtime.getUIView().announcement?.message).not.toContain("STAMINA EMPTY");
    runtime.destroy();
  });

  it("explains current control and ignores scan and pace commands while swept", async () => {
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
    expect(runtime.getUIView().controls?.canChangePace).toBe(false);
    runtime.dispatchUI({ type: "scan" });
    expect(runtime.getUIView().announcement?.message).toContain("current has the helm");
    expect(runtime.getUIView().announcement?.message).toContain("sounding line is secured");
    runtime.dispatchUI({ type: "set-pace", pace: "swift" });
    expect(runtime.getUIView().player.pace).toBe("rest");
    expect(runtime.getUIView().announcement?.message).toContain("pace returns ashore");
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
    expect(repaired.player.worldWidth).toBe(LEGACY_WORLD_WIDTH);
    expect(repaired.player.worldHeight).toBe(LEGACY_WORLD_HEIGHT);
    expect(repaired.player.currentTrace).toEqual([
      world.settlements.find((settlement) => settlement.id === contract.originSettlementId)?.tileIndex,
    ]);
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
    carriedSave.player.x = destinationTile.x * TILE_UNITS + TILE_UNITS / 2;
    carriedSave.player.y = destinationTile.y * TILE_UNITS + TILE_UNITS / 2;
    carriedSave.player.previousX = carriedSave.player.x;
    carriedSave.player.previousY = carriedSave.player.y;
    carriedSave.player.currentTrace = trace;
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
    await atDestination.save();
    const deliveredWorld = deserializeWorld(decodeGameSave(repository.snapshot()).world);
    expect(deliveredWorld.contracts.find((contract) => contract.id === contractId)?.status).toBe("fulfilled");
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
    runtime.dispatchUI({ type: "set-pace", pace: "swift" });
    const pagehideSave = runtime.save();
    expect(repository.started).toHaveLength(1);

    let visibilitySettled = false;
    void visibilitySave.then(() => { visibilitySettled = true; });
    repository.resolveNext();
    await firstSave;
    await vi.waitFor(() => expect(repository.started).toHaveLength(2));
    expect(visibilitySettled).toBe(false);
    // Only the latest of the two lifecycle snapshots reaches the repository.
    expect(decodeGameSave(repository.started[1] as SaveRecord).player.pace).toBe("swift");

    repository.resolveNext();
    await Promise.all([visibilitySave, pagehideSave]);
    const newest = decodeGameSave(repository.snapshot());
    expect(newest.player.pace).toBe("swift");
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
    runtime.dispatchUI({ type: "set-pace", pace: "swift" });
    const recoverySave = runtime.save();
    repository.rejectNext(new Error("transient storage failure"));
    await failedExpectation;
    await vi.waitFor(() => expect(repository.started).toHaveLength(2));
    expect(decodeGameSave(repository.started[1] as SaveRecord).player.pace).toBe("swift");

    repository.resolveNext();
    await recoverySave;
    expect(decodeGameSave(repository.snapshot()).player.pace).toBe("swift");
    runtime.destroy();
  });
});

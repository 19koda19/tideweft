import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import {
  createFieldResourceEcologyState,
  generateFieldResourceCatalog,
  harvestFieldResource,
  type FieldMaterialId,
  type FieldResourceCatalog,
  type FieldResourceEcologyState,
  type FieldResourceNode,
} from "../sim/fieldResources";
import {
  FIXED_POINT,
  createWorld,
  createWorldView,
  runTicks,
  serializeWorld,
  type WorldState,
} from "../sim/public";
import {
  createCraftingInventory,
  type CraftingStackId,
} from "./crafting";
import {
  BASE_CARGO_CAPACITY,
  PACK_LOAD_MILLI_PER_UNIT,
  TILE_UNITS,
  createPlayer,
  type PlayerState,
} from "./player";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import { createSessionState, type GameSessionState } from "./sessionTypes";
import type { PhysicalCargoState } from "./physicalCargoState";

vi.mock("../audio/soundscape", () => ({
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(): void {}
    updateAmbience(): void {}
    destroy(): void {}
  },
}));

interface V1GameSaveEnvelope {
  readonly format: "tideweft-session";
  readonly version: 1;
  readonly world: string;
  readonly player: PlayerState;
  readonly session: GameSessionState;
}

interface PersistedGameSaveEnvelope {
  readonly format: "tideweft-session";
  readonly version: number;
  readonly world: string;
  readonly player: PlayerState;
  readonly session: GameSessionState;
  readonly fieldResources: FieldResourceEcologyState;
  readonly physicalCargo?: PhysicalCargoState;
  readonly regionalTravel?: string;
  readonly integrity?: string;
}

class MemoryRepository implements SaveRepository {
  constructor(private record?: SaveRecord) {}

  async list() {
    return [];
  }

  async load(slotId: string): Promise<SaveRecord | undefined> {
    return slotId === "autosave" && this.record
      ? structuredClone(this.record)
      : undefined;
  }

  async save(record: SaveRecord): Promise<void> {
    this.record = structuredClone(record);
  }

  async remove(): Promise<void> {
    this.record = undefined;
  }

  snapshot(): SaveRecord {
    if (!this.record) throw new Error("test repository has no autosave");
    return structuredClone(this.record);
  }
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

function runtimeCatalog(world: WorldState): FieldResourceCatalog {
  const natural = generateFieldResourceCatalog(world.meta.rootSeed, world.terrain);
  const harborTiles = new Set(world.settlements.map((settlement) => settlement.tileIndex));
  return {
    ...natural,
    nodes: natural.nodes.filter((node) => !harborTiles.has(node.tileIndex)),
  };
}

function v2SaveRecord(
  world: WorldState,
  player: PlayerState,
  ecology = createFieldResourceEcologyState(world.meta.completedTick),
): SaveRecord {
  const envelope: PersistedGameSaveEnvelope = {
    format: "tideweft-session",
    version: 2,
    world: serializeWorld(world),
    player,
    session: createSessionState(world.meta.seedText),
    fieldResources: ecology,
  };
  return {
    slotId: "autosave",
    label: "Resource runtime fixture",
    seed: world.meta.seedText,
    updatedAt: 1,
    playTicks: world.meta.completedTick,
    settlementCount: world.settlements.length,
    connectedCount: 0,
    worldJson: JSON.stringify(envelope),
  };
}

function v1SaveRecord(
  world: WorldState,
  player: PlayerState,
): SaveRecord {
  const envelope: V1GameSaveEnvelope = {
    format: "tideweft-session",
    version: 1,
    world: serializeWorld(world),
    player,
    session: createSessionState(world.meta.seedText),
  };
  return {
    slotId: "autosave",
    label: "Legacy resource-free fixture",
    seed: world.meta.seedText,
    // Intentionally ancient. Migration must not convert wall time into growth.
    updatedAt: 1,
    playTicks: world.meta.completedTick,
    settlementCount: world.settlements.length,
    connectedCount: 0,
    worldJson: JSON.stringify(envelope),
  };
}

function decodeGameSave(record: SaveRecord): PersistedGameSaveEnvelope {
  return JSON.parse(record.worldJson) as PersistedGameSaveEnvelope;
}

const VALID_CARGO_FIXTURE = {
  contractId: 1,
  resource: "reed" as const,
  quantity: 1,
  condition: FIXED_POINT,
  property: "ordinary" as const,
};

const MALFORMED_CARGO_CASES: readonly (readonly [string, unknown])[] = [
  ["non-numeric quantity", { ...VALID_CARGO_FIXTURE, quantity: "not-a-number" }],
  ["negative quantity", { ...VALID_CARGO_FIXTURE, quantity: -1 }],
  ["fractional quantity", { ...VALID_CARGO_FIXTURE, quantity: 1.5 }],
  ["quantity beyond pack bounds", {
    ...VALID_CARGO_FIXTURE,
    quantity: BASE_CARGO_CAPACITY + 1,
  }],
  ["negative contract ID", { ...VALID_CARGO_FIXTURE, contractId: -1 }],
  ["unknown resource", { ...VALID_CARGO_FIXTURE, resource: "moon-silt" }],
  ["mismatched light property", {
    ...VALID_CARGO_FIXTURE,
    resource: "parts",
    property: "ordinary",
  }],
  ["condition above fixed-point range", {
    ...VALID_CARGO_FIXTURE,
    condition: FIXED_POINT + 1,
  }],
];

function placePlayerOnNode(
  player: PlayerState,
  node: FieldResourceNode,
): void {
  player.x = node.x * TILE_UNITS + TILE_UNITS / 2;
  player.y = node.y * TILE_UNITS + TILE_UNITS / 2;
  player.previousX = player.x;
  player.previousY = player.y;
  player.velocityX = 0;
  player.velocityY = 0;
  player.currentTrace = [node.tileIndex];
  player.surveyTrace = [node.tileIndex];
  player.discovered[node.tileIndex] = FIXED_POINT;
  player.depthSoundings[node.tileIndex] = FIXED_POINT;
}

function placePlayerOnTile(
  player: PlayerState,
  tile: { readonly index: number; readonly x: number; readonly y: number },
): void {
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
  for (let frame = 0; frame <= count; frame += 1) {
    const callback = scheduledFrame;
    if (!callback) throw new Error("runtime did not schedule its next frame");
    scheduledFrame = undefined;
    callback(now);
    now += 100;
  }
  runtime.stop();
}

function stackQuantity(runtime: TideweftRuntime, material: CraftingStackId): number {
  return runtime.getUIView().kit?.stackRows
    .filter((row) => row.itemId === material)
    .reduce((total, row) => total + row.quantity, 0) ?? 0;
}

function renderedTileIndex(runtime: TideweftRuntime): number {
  const view = runtime.getRenderView();
  const x = Math.floor(view.player.position.x / view.terrain.tileSize);
  const y = Math.floor(view.player.position.y / view.terrain.tileSize);
  return y * view.terrain.columns + x;
}

function dryResourceRouteFixture(seedText: string): {
  readonly world: WorldState;
  readonly catalog: FieldResourceCatalog;
  readonly node: FieldResourceNode;
  readonly startTile: WorldState["terrain"]["tiles"][number];
} {
  const world = createWorld(seedText, "calm");
  const original = runtimeCatalog(world).nodes.find((node) =>
    node.x > 1 && node.x + 1 < world.terrain.width
  );
  if (!original) throw new Error("fixture could not find an interior field-resource coordinate");

  for (const tile of world.terrain.tiles) {
    tile.elevation = world.tide.level;
    tile.moisture = 400_000;
    tile.roughness = 0;
    tile.terrain = "meadow";
    tile.baseTravelCost = 100;
  }
  const catalog = runtimeCatalog(world);
  const node = catalog.nodes.find((candidate) => candidate.tileIndex === original.tileIndex);
  if (!node) throw new Error("resource presence should remain stable when biome presentation changes");
  const startTile = world.terrain.tiles[node.tileIndex - 1];
  if (!startTile) throw new Error("fixture resource should have a western approach tile");
  return { world, catalog, node, startTile };
}

describe("runtime field-resource integration", () => {
  it("projects the same complete visible catalog for identical runtime saves", async () => {
    const world = createWorld("the visible gathering atlas", "standard");
    const view = createWorldView(world);
    const catalog = runtimeCatalog(world);
    const player = createPlayer(view);
    player.discovered.fill(FIXED_POINT);
    player.depthSoundings.fill(FIXED_POINT);
    const record = v2SaveRecord(world, player);
    const first = await createTideweftRuntime(new MemoryRepository(record));
    const second = await createTideweftRuntime(new MemoryRepository(record));

    const firstResources = first.getRenderView().fieldResources;
    const secondResources = second.getRenderView().fieldResources;
    expect(firstResources).toEqual(secondResources);
    expect(firstResources.length).toBeGreaterThan(0);
    expect(firstResources.length).toBeLessThan(catalog.nodes.length);
    expect(firstResources.every((node) => catalog.nodes.some((candidate) => candidate.id === node.id)))
      .toBe(true);
    expect(firstResources.every((node) => node.knowledge === "sounded")).toBe(true);

    first.destroy();
    second.destroy();
  });

  it("gathers exactly one underfoot unit through the desktop E interaction", async () => {
    const world = createWorld("a hand beneath the cordreed", "calm");
    const view = createWorldView(world);
    const catalog = runtimeCatalog(world);
    const node = catalog.nodes.find((candidate) => candidate.capacityUnits >= 3);
    if (!node) throw new Error("fixture needs a resource with two harvestable units");
    const player = createPlayer(view);
    placePlayerOnNode(player, node);
    const runtime = await createTideweftRuntime(
      new MemoryRepository(v2SaveRecord(world, player)),
    );
    runtime.dispatchUI({ type: "resume-world" });
    const before = runtime.getRenderView().fieldResources.find((item) => item.id === node.id);
    expect(before?.stockUnits).toBe(node.capacityUnits - 1);

    runtime.dispatchRenderer({ type: "interact" });

    expect(stackQuantity(runtime, node.material)).toBe(1);
    expect(runtime.getRenderView().fieldResources.find((item) => item.id === node.id)?.stockUnits)
      .toBe(node.capacityUnits - 2);
    expect(runtime.getUIView().announcement?.message).toContain("Gathered 1");
    runtime.destroy();
  });

  it("routes a mobile resource target and gathers only after reaching its exact patch", async () => {
    const { world, node, startTile } = dryResourceRouteFixture("the fingertip follows sunfiber");
    const player = createPlayer(createWorldView(world));
    player.discovered.fill(FIXED_POINT);
    player.depthSoundings.fill(FIXED_POINT);
    placePlayerOnTile(player, startTile);
    const runtime = await createTideweftRuntime(
      new MemoryRepository(v2SaveRecord(world, player)),
    );
    runtime.dispatchUI({ type: "resume-world" });
    const startPoint = { ...runtime.getRenderView().player.position };

    // A stale/tampered tap coordinate cannot redirect the authoritative node
    // target; runtime navigation resolves the node's exact tile center itself.
    runtime.dispatchRenderer({
      type: "resource-target",
      nodeId: node.id,
      point: startPoint,
      gatherOnArrival: true,
    });
    expect(stackQuantity(runtime, node.material)).toBe(0);
    const targetPosition = runtime.getRenderView().fieldResources
      .find((resource) => resource.id === node.id)?.position;
    if (!targetPosition) throw new Error("target resource should be projected into the regional window");
    const renderTileSize = runtime.getRenderView().terrain.tileSize;
    const targetTileIndex = Math.floor(targetPosition.y / renderTileSize)
      * runtime.getRenderView().terrain.columns
      + Math.floor(targetPosition.x / renderTileSize);

    let gathered = false;
    for (let step = 0; step < 40; step += 1) {
      advancePlayerSteps(runtime, 1);
      const quantity = stackQuantity(runtime, node.material);
      const currentTile = renderedTileIndex(runtime);
      if (currentTile !== targetTileIndex) expect(quantity).toBe(0);
      if (quantity > 0) {
        expect(quantity).toBe(1);
        expect(currentTile).toBe(targetTileIndex);
        const position = runtime.getRenderView().player.position;
        const target = runtime.getRenderView().fieldResources
          .find((resource) => resource.id === node.id)?.position;
        if (!target) throw new Error("target resource should remain after one harvest");
        expect(Math.hypot(position.x - target.x, position.y - target.y)).toBeLessThan(2.1);
        gathered = true;
        break;
      }
    }
    expect(gathered).toBe(true);
    runtime.destroy();
  });

  it("rejects an over-capacity gather atomically", async () => {
    const world = createWorld("the pack says enough", "calm");
    const view = createWorldView(world);
    const catalog = runtimeCatalog(world);
    const node = catalog.nodes.find((candidate) => candidate.unitLoadMilli > PACK_LOAD_MILLI_PER_UNIT);
    if (!node) throw new Error("fixture needs a material heavier than one load unit");
    const player = createPlayer(view);
    player.craftingInventory = createCraftingInventory(
      BASE_CARGO_CAPACITY * PACK_LOAD_MILLI_PER_UNIT,
      { driftwood: 10 },
    );
    placePlayerOnNode(player, node);
    const repository = new MemoryRepository(v2SaveRecord(world, player));
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    const stockBefore = runtime.getRenderView().fieldResources
      .find((resource) => resource.id === node.id)?.stockUnits;
    const carriedBefore = stackQuantity(runtime, node.material);
    const staminaBefore = runtime.getUIView().player.stamina;

    runtime.dispatchRenderer({ type: "interact" });

    expect(stackQuantity(runtime, node.material)).toBe(carriedBefore);
    expect(runtime.getRenderView().fieldResources
      .find((resource) => resource.id === node.id)?.stockUnits).toBe(stockBefore);
    expect(runtime.getUIView().player.stamina).toBe(staminaBefore);
    expect(runtime.getUIView().announcement?.message).toContain("Pack needs");
    await runtime.save();
    expect(decodeGameSave(repository.snapshot()).fieldResources.depletion).toEqual([]);
    runtime.destroy();
  });

  it("refuses the final living unit even when desktop interaction occurs underfoot", async () => {
    const world = createWorld("one green shoot remains", "calm");
    const view = createWorldView(world);
    const catalog = runtimeCatalog(world);
    const node = catalog.nodes[0];
    if (!node) throw new Error("fixture needs a natural resource");
    const drained = harvestFieldResource(
      catalog,
      createFieldResourceEcologyState(world.meta.completedTick),
      node.id,
      node.capacityUnits - 1,
    );
    if (!drained.ok) throw new Error("fixture should drain to the living reserve");
    const player = createPlayer(view);
    placePlayerOnNode(player, node);
    const repository = new MemoryRepository(v2SaveRecord(world, player, drained.state));
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    expect(runtime.getRenderView().fieldResources.some((resource) => resource.id === node.id))
      .toBe(false);

    runtime.dispatchRenderer({ type: "interact" });

    expect(stackQuantity(runtime, node.material)).toBe(0);
    expect(runtime.getUIView().announcement?.message).toContain("final living unit");
    await runtime.save();
    expect(decodeGameSave(repository.snapshot()).fieldResources).toEqual(drained.state);
    runtime.destroy();
  });

  it("round-trips v2 depletion, material inventory, and the next durable gear ID", async () => {
    const world = createWorld("the field ledger closes exactly", "standard");
    const view = createWorldView(world);
    const catalog = runtimeCatalog(world);
    const node = catalog.nodes.find((candidate) => candidate.capacityUnits >= 3);
    if (!node) throw new Error("fixture needs a resource with at least two harvestable units");
    const ecology = harvestFieldResource(
      catalog,
      createFieldResourceEcologyState(world.meta.completedTick),
      node.id,
      2,
    );
    if (!ecology.ok) throw new Error("fixture depletion should be valid");
    const player = createPlayer(view);
    player.craftingInventory = createCraftingInventory(
      player.cargoCapacity * PACK_LOAD_MILLI_PER_UNIT,
      { cordreed: 2, pitchmoss: 1, "glimmer-spore": 3 },
    );
    player.nextCraftedGearId = 29;
    const repository = new MemoryRepository(v2SaveRecord(world, player, ecology.state));
    const runtime = await createTideweftRuntime(repository);

    expect(stackQuantity(runtime, "cordreed")).toBe(2);
    expect(stackQuantity(runtime, "pitchmoss")).toBe(1);
    await runtime.save();
    const saved = decodeGameSave(repository.snapshot());
    expect(saved.version).toBe(10);
    expect(saved.regionalTravel).toEqual(expect.any(String));
    expect(saved.fieldResources).toEqual(ecology.state);
    expect(saved.player.craftingInventory).toEqual(player.craftingInventory);
    expect(saved.player.nextCraftedGearId).toBe(29);
    runtime.destroy();
  });

  it("crafts one exact component transaction and preserves its source lot through tick, save, and reload", async () => {
    const world = createWorld("the braid keeps every fiber", "calm");
    const player = createPlayer(createWorldView(world));
    player.craftingInventory = createCraftingInventory(
      player.cargoCapacity * PACK_LOAD_MILLI_PER_UNIT,
      { cordreed: 2, sunfiber: 1 },
    );
    const repository = new MemoryRepository(v2SaveRecord(world, player));
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });

    runtime.dispatchUI({ type: "kit", action: "craft", recipeId: "component/braided-cord" });

    expect(stackQuantity(runtime, "cordreed")).toBe(0);
    expect(stackQuantity(runtime, "sunfiber")).toBe(0);
    expect(stackQuantity(runtime, "braided-cord")).toBe(1);
    const lotId = runtime.getUIView().kit?.stackRows.find((row) =>
      row.itemId === "braided-cord")?.lotId;
    expect(lotId).toMatch(/^pc:0:0:source:/u);
    advancePlayerSteps(runtime, 1);
    await runtime.save();
    const saved = decodeGameSave(repository.snapshot());
    expect(saved.physicalCargo?.carrier.lots).toEqual([
      expect.objectContaining({
        id: lotId,
        payload: { kind: "stack", item: "braided-cord", quantity: 1 },
      }),
    ]);
    runtime.destroy();

    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().kit?.stackRows.find((row) =>
      row.itemId === "braided-cord")?.lotId).toBe(lotId);
    expect(stackQuantity(resumed, "cordreed")).toBe(0);
    resumed.destroy();
  });

  it("mends a worn exact gear lot once, consumes exact ingredients, and keeps its durable identity", async () => {
    const world = createWorld("the cape remembers the mending", "calm");
    const player = createPlayer(createWorldView(world));
    player.craftingInventory = createCraftingInventory(
      player.cargoCapacity * PACK_LOAD_MILLI_PER_UNIT,
      { stormlichen: 1, pitchmoss: 1 },
      [{ id: 7, kind: "weather-cape", condition: 500_000 }],
    );
    player.nextCraftedGearId = 8;
    const repository = new MemoryRepository(v2SaveRecord(world, player));
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    const originalLotId = runtime.getUIView().kit?.gearRows.find((row) => row.id === "7")?.lotId;

    runtime.dispatchUI({
      type: "kit",
      action: "repair",
      gearId: "7",
      conditionGain: 250_000,
    });

    const mended = runtime.getUIView().kit?.gearRows.find((row) => row.id === "7");
    expect(mended?.condition).toBe(0.75);
    expect(mended?.lotId).toBe(originalLotId);
    expect(stackQuantity(runtime, "stormlichen")).toBe(0);
    expect(stackQuantity(runtime, "pitchmoss")).toBe(0);
    runtime.dispatchUI({
      type: "kit",
      action: "repair",
      gearId: "7",
      conditionGain: 250_000,
    });
    expect(runtime.getUIView().kit?.gearRows.find((row) => row.id === "7")?.condition).toBe(0.75);
    expect(runtime.getUIView().announcement?.message).toContain("Missing");
    await runtime.save();
    runtime.destroy();

    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().kit?.gearRows.find((row) => row.id === "7")).toMatchObject({
      lotId: originalLotId,
      condition: 0.75,
    });
    expect(stackQuantity(resumed, "stormlichen")).toBe(0);
    expect(stackQuantity(resumed, "pitchmoss")).toBe(0);
    resumed.destroy();
  });

  it("blocks durable gear identity exhaustion before consuming ingredients", async () => {
    const world = createWorld("the last name in the kit", "calm");
    const player = createPlayer(createWorldView(world));
    player.craftingInventory = createCraftingInventory(
      player.cargoCapacity * PACK_LOAD_MILLI_PER_UNIT,
      { "braided-cord": 1, pitchcloth: 1 },
    );
    player.nextCraftedGearId = Number.MAX_SAFE_INTEGER;
    const repository = new MemoryRepository(v2SaveRecord(world, player));
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });

    runtime.dispatchUI({ type: "kit", action: "craft", recipeId: "gear/marsh-wraps" });

    expect(stackQuantity(runtime, "braided-cord")).toBe(1);
    expect(stackQuantity(runtime, "pitchcloth")).toBe(1);
    expect(runtime.getUIView().kit?.gearRows.some((row) => row.kind === "marsh-wraps")).toBe(false);
    expect(runtime.getUIView().announcement?.message).toContain("identity limit");
    await runtime.save();
    runtime.destroy();
    const resumed = await createTideweftRuntime(repository);
    expect(stackQuantity(resumed, "braided-cord")).toBe(1);
    expect(resumed.getUIView().saveWarning).toBeUndefined();
    resumed.destroy();
  });

  it.each(MALFORMED_CARGO_CASES)(
    "rejects malformed cargo before shared-pack load arithmetic can admit NaN or negative load: %s",
    async (label, cargo) => {
      const world = createWorld("the malformed cargo stays quarantined", "calm");
      const player = createPlayer(createWorldView(world));
      player.cargo = [cargo] as PlayerState["cargo"];
      player.activeContractId = 1;
      const repository = new MemoryRepository(v2SaveRecord(world, player));
      const runtime = await createTideweftRuntime(repository);
      expect(runtime.getUIView().saveWarning?.message, label).toBe("LOCAL AUTOSAVE UNREADABLE");
      expect(runtime.getUIView().title.requiresSeed, label).toBe(true);
      await expect(runtime.save()).rejects.toThrow("Choose a seed before replacing");
      expect(repository.snapshot().seed, label).toBe(world.meta.seedText);
      runtime.dispatchUI({
        type: "new-world",
        seed: `cargo recovery ${label}`,
        posture: "gale",
        sessionShape: "wander",
      });
      await runtime.save();
      expect(repository.snapshot().seed, label).toBe(`cargo recovery ${label}`);
      expect(runtime.getUIView().saveWarning, label).toBeUndefined();
      expect(Number.isFinite(runtime.getUIView().kit?.combinedLoadMilli ?? Number.NaN), label)
        .toBe(true);
      runtime.destroy();
    },
  );

  it("rejects crafted gear IDs reserved for inherited Wayknots", async () => {
    const world = createWorld("the numbered core keeps its identity", "calm");
    const player = createPlayer(createWorldView(world));
    player.craftingInventory = createCraftingInventory(
      player.cargoCapacity * PACK_LOAD_MILLI_PER_UNIT,
      {},
      [{ id: 6, kind: "weather-cape", condition: FIXED_POINT }],
    );
    player.nextCraftedGearId = 7;
    const repository = new MemoryRepository(v2SaveRecord(world, player));

    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    await expect(runtime.save()).rejects.toThrow("Choose a seed before replacing");
    expect(repository.snapshot().seed).toBe(world.meta.seedText);
    runtime.dispatchUI({
      type: "new-world",
      seed: "reserved gear recovery",
      posture: "gale",
      sessionShape: "wander",
    });
    await runtime.save();

    expect(repository.snapshot().seed).toBe("reserved gear recovery");
    expect(runtime.getUIView().saveWarning).toBeUndefined();
    expect(runtime.getUIView().kit?.gearRows.some((row) =>
      row.label.includes("Weather cape #6")
    )).toBe(false);
    runtime.destroy();
  });

  it("migrates v1 saves to an empty pack and ecology at the current active tick", async () => {
    const world = runTicks(createWorld("the old map wakes without a harvest", "calm"), 37);
    const player = createPlayer(createWorldView(world));
    player.cargoCapacity = 16;
    const legacyPlayer = structuredClone(player) as Partial<PlayerState>;
    delete legacyPlayer.craftingInventory;
    delete legacyPlayer.nextCraftedGearId;
    const repository = new MemoryRepository(v1SaveRecord(world, legacyPlayer as PlayerState));
    const runtime = await createTideweftRuntime(repository);

    expect(runtime.getUIView().kit?.stackRows).toEqual([]);
    expect(runtime.getUIView().kit?.gearRows.every((row) =>
      row.locationLabel.includes("Core field-kit piece") && row.loadMilli === 0
    )).toBe(true);
    await runtime.save();
    const migrated = decodeGameSave(repository.snapshot());
    expect(migrated.version).toBe(10);
    expect(migrated.regionalTravel).toEqual(expect.any(String));
    expect(migrated.fieldResources).toEqual({
      version: 1,
      activeTick: world.meta.completedTick,
      depletion: [],
    });
    expect(Object.values(migrated.player.craftingInventory.stacks)
      .every((quantity) => quantity === 0)).toBe(true);
    expect(migrated.player.craftingInventory.gear).toEqual([]);
    expect(migrated.player.cargoCapacity).toBe(BASE_CARGO_CAPACITY);
    expect(migrated.player.craftingInventory.capacityMilliLoad).toBe(18_000);
    expect(migrated.player.nextCraftedGearId).toBe(7);
    runtime.destroy();
  });

  it("raises an existing v2 Alpha pack to the new base without losing its contents", async () => {
    const world = createWorld("the old pack finds two new pockets", "calm");
    const player = createPlayer(createWorldView(world));
    player.cargoCapacity = 16;
    player.craftingInventory = createCraftingInventory(16_000, {
      cordreed: 2,
      pitchmoss: 1,
    });
    const repository = new MemoryRepository(v2SaveRecord(world, player));

    const runtime = await createTideweftRuntime(repository);

    expect(runtime.getUIView().player.cargoCapacity).toBe(BASE_CARGO_CAPACITY);
    expect(runtime.getUIView().kit?.capacityMilli).toBe(18_000);
    expect(stackQuantity(runtime, "cordreed")).toBe(2);
    expect(stackQuantity(runtime, "pitchmoss")).toBe(1);
    await runtime.save();
    const migrated = decodeGameSave(repository.snapshot());
    expect(migrated.player.cargoCapacity).toBe(BASE_CARGO_CAPACITY);
    expect(migrated.player.craftingInventory.capacityMilliLoad).toBe(18_000);
    expect(migrated.player.craftingInventory.stacks.cordreed).toBe(2);
    expect(migrated.player.craftingInventory.stacks.pitchmoss).toBe(1);
    runtime.destroy();
  });

  it("lets a deep-water gathering exhaustion become a sweep on the next fixed step", async () => {
    const world = createWorld("the kelp patch takes the final breath", "calm");
    const originalCatalog = runtimeCatalog(world);
    const original = originalCatalog.nodes.find((node) =>
      node.x > 1
      && node.y > 1
      && node.x + 1 < world.terrain.width
      && node.y + 1 < world.terrain.height
    );
    if (!original) throw new Error("fixture needs an interior resource coordinate");
    for (const tile of world.terrain.tiles) {
      tile.elevation = world.tide.level;
      tile.moisture = 400_000;
      tile.roughness = 0;
      tile.terrain = "meadow";
      tile.baseTravelCost = 100;
    }
    const deepTile = world.terrain.tiles[original.tileIndex];
    if (!deepTile) throw new Error("fixture deep tile disappeared");
    deepTile.elevation = 0;
    deepTile.moisture = FIXED_POINT;
    deepTile.terrain = "deep-water";
    deepTile.baseTravelCost = 520;
    const catalog = runtimeCatalog(world);
    const node = catalog.nodes.find((candidate) => candidate.tileIndex === deepTile.index);
    if (!node) throw new Error("resource presence should survive the controlled water change");
    const staminaCost: Readonly<Record<FieldMaterialId, number>> = {
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
    const player = createPlayer(createWorldView(world));
    placePlayerOnNode(player, node);
    player.stamina = staminaCost[node.material];
    player.stability = FIXED_POINT;
    const runtime = await createTideweftRuntime(
      new MemoryRepository(v2SaveRecord(world, player)),
    );
    runtime.dispatchUI({ type: "resume-world" });

    runtime.dispatchRenderer({ type: "interact" });
    expect(stackQuantity(runtime, node.material)).toBe(1);
    expect(runtime.getUIView().player.stamina).toBe(0);
    expect(runtime.getRenderView().player.mode).not.toBe("swept");
    expect(runtime.getUIView().announcement?.message).toContain("next field beat");

    advancePlayerSteps(runtime, 1);

    expect(runtime.getRenderView().player.mode).toBe("swept");
    expect(runtime.getUIView().announcement?.message).toContain("STAMINA EMPTY IN DEEP WATER");
    runtime.destroy();
  });
});

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildSurfaceCurrentCues } from "./currentCues";
import { isDirectlyDetailPerceived } from "./perceptionPresentation";
import { buildReliefPerceptionMaterialBatches } from "./reliefTerrainBatches";
import {
  MAX_TERRAIN_PERCEPTION_MEMORY_TILES,
  TERRAIN_PERCEPTION_MEMORY_FADE_MS,
  createTerrainPerceptionMemoryStore,
  rememberedTerrainVisibilityAt,
  sampleTerrainPerceptionMemory,
  terrainPerceptionMemoryIdentity,
  terrainPerceptionMemoryValue,
  type TerrainPerceptionMemoryInput,
} from "./terrainPerceptionMemory";
import { buildTerrainMesh } from "./terrainMesh";
import type {
  LooseCargoView,
  TerrainGridView,
  TerrainTileView,
  TideweftView,
} from "./types";
import { visibleWaterPresentation } from "./waterPresentation";
import {
  commandForWorldTap,
  validatePerceivedEntityCommand,
} from "./worldTap";

const point = { x: 12, y: 12 } as const;

const tile = (changes: Partial<TerrainTileView> = {}): TerrainTileView => ({
  kind: "channel",
  biome: "tide-channel",
  climate: {
    rainfall: 0.91,
    heat: 0.17,
    salinity: 0.83,
    exposure: 0.74,
    magicalWater: 0.62,
  },
  elevation: 0.07,
  moisture: 0.94,
  roughness: 0.86,
  waterDepth: 0.987_654,
  depthKnown: 0,
  discovered: 0,
  currentVisibility: 0,
  currentDetailVisibility: 0,
  trace: 0.79,
  shelter: 0.21,
  blocked: true,
  ...changes,
});

const grid = (
  tiles: readonly TerrainTileView[],
  columns = Math.max(1, tiles.length),
  changes: Partial<TerrainGridView> = {},
): TerrainGridView => ({
  columns,
  rows: Math.max(1, Math.ceil(tiles.length / columns)),
  tileSize: 24,
  origin: { x: 0, y: 0 },
  tiles,
  revision: "temporal-fog-audit",
  ...changes,
});

const input = (
  terrain: TerrainGridView,
  timeMs: number,
  changes: Partial<TerrainPerceptionMemoryInput> = {},
): TerrainPerceptionMemoryInput => ({
  terrain,
  spatialEpoch: "r:0:0",
  worldName: "Audit Estuary",
  tick: Math.floor(timeMs / 50),
  timeMs,
  perceptionEnabled: true,
  reducedMotion: false,
  ...changes,
});

const parcel: LooseCargoView = {
  id: "secret-parcel",
  region: { x: 0, y: 0 },
  position: point,
  velocity: { x: 0, y: 0 },
  contentKind: "promise",
  resourceKind: "confidential-ledger",
  resourceLabel: "SECRET CARGO LABEL",
  quantity: 7,
  property: "confidential",
  condition: 0.73,
  conditionBand: "worn",
  wetness: 0.81,
  contamination: 0.19,
  decay: 0.24,
  motion: "resting",
  snaggedBy: null,
  impactMark: "none",
  promiseContractId: 99,
  recoverable: true,
  recovery: "reachable",
};

function obscuredView(terrain: TerrainGridView): TideweftView {
  return {
    revision: "temporal-fog-audit",
    spatialEpoch: "r:0:0",
    tick: 6,
    worldName: "Audit Estuary",
    terrain,
    tide: {
      phase: "flood",
      level: 0.73,
      progress: 0.4,
      surfaceCurrent: { x: 1, y: 0 },
    },
    weather: {
      kind: "clear",
      intensity: 0,
      wind: { x: 0, y: 0 },
    },
    perception: {
      version: 3,
      signature: "all-exact-detail-obscured",
      valid: true,
      visibleTileCount: 0,
      directTileCount: 0,
      peripheralTileCount: 0,
      detailVisibleTileCount: 0,
      detailDirectTileCount: 0,
      detailPeripheralTileCount: 0,
    },
    settlements: [{
      id: "secret-harbor",
      name: "SECRET HARBOR LABEL",
      position: point,
      population: 9_999,
      status: "evacuating",
      connection: 1,
      stress: 1,
      discovered: true,
      currentVisibility: 0,
      selected: true,
    }],
    player: {
      position: point,
      velocity: { x: 0, y: 0 },
      facing: 0,
      stamina: 1,
      stability: 1,
      scanCharge: 1,
      scanProgress: 1,
      cargoLoad: 0,
      cargoCapacity: 4,
      cargo: [],
      pace: "steady",
      mode: "foot",
    },
    routes: [{
      id: "secret-route",
      kind: "remembered",
      points: [{ x: 0, y: 12 }, { x: 24, y: 12 }],
      strength: 0,
      condition: 0,
      reliability: 0,
    }],
    choirs: [],
    wayknots: [],
    tideHarps: [],
    fieldResources: [{
      id: "secret-resource",
      material: "stormlichen",
      label: "SECRET RESOURCE LABEL",
      position: point,
      knowledge: "sounded",
      rarity: "rare",
      stockUnits: 123,
      // Deliberately contradictory: the tile-level exact field must win.
      currentVisibility: 1,
    }],
    looseCargo: [parcel],
    traces: [],
    porters: [{
      id: "secret-porter",
      name: "SECRET ACTOR LABEL",
      position: point,
      facing: 0,
      state: "stranded",
      selected: true,
    }],
    particles: [{
      id: "secret-particle",
      position: point,
      life: 1,
      kind: "signal",
    }],
    events: [{
      id: "secret-event",
      kind: "warning",
      position: point,
      label: "SECRET EVENT LABEL",
      detail: "SECRET EVENT DETAIL",
      progress: 0,
    }],
    camera: {
      center: point,
      zoom: 1,
      followPlayer: true,
    },
  };
}

describe("adversarial temporal terrain-fog boundary", () => {
  it("uses one monotone clock across alternating Chart/Relief-style samples", () => {
    const visible = grid([tile({ currentVisibility: 1, currentDetailVisibility: 1 })]);
    const hidden = grid([tile()]);
    const store = createTerrainPerceptionMemoryStore();
    store.sample(input(visible, 100));

    const times = [190, 280, 460, 730, 1_000];
    const values = times.map((timeMs) => rememberedTerrainVisibilityAt(
      store.sample(input(hidden, timeMs)),
      0,
    ));
    expect(values.every((value, index) => index === 0 || value <= values[index - 1]!)).toBe(true);
    for (let index = 0; index < times.length; index += 1) {
      expect(values[index]).toBeCloseTo(
        terrainPerceptionMemoryValue(1, 0, times[index]! - 100, false),
        5,
      );
    }
    expect(values.at(-1)).toBe(0);
    expect(TERRAIN_PERCEPTION_MEMORY_FADE_MS).toBe(900);
  });

  it("retains only a bounded scalar surface impression, never raw hidden tile facts", () => {
    const visible = grid([tile({ currentVisibility: 1, currentDetailVisibility: 1 })]);
    const hiddenTile = tile();
    const hidden = grid([hiddenTile]);
    let state = sampleTerrainPerceptionMemory(undefined, input(visible, 0));
    state = sampleTerrainPerceptionMemory(state, input(hidden, 300));
    const remembered = rememberedTerrainVisibilityAt(state, 0);
    expect(remembered).toBeGreaterThan(0);
    expect(Object.keys(state).sort()).toEqual([
      "frame",
      "identity",
      "sampledAtMs",
      "signature",
      "tick",
      "values",
    ]);
    expect(Object.values(state)).not.toContain(hiddenTile);
    expect(state.values).toBeInstanceOf(Float32Array);

    const mesh = buildTerrainMesh(hidden, { chunkSize: 1 });
    const chunk = mesh.chunks[0];
    if (!chunk) throw new Error("audit fixture did not produce a Relief chunk");
    const batch = buildReliefPerceptionMaterialBatches(chunk, hidden, state.values)[0];
    expect(batch).toBeDefined();
    expect(batch).not.toHaveProperty("waterDepth");
    expect(batch).not.toHaveProperty("depthKnown");
    expect(batch).not.toHaveProperty("roughness");
    expect(batch).not.toHaveProperty("currentDetailVisibility");

    const shallowSecret = visibleWaterPresentation(
      tile({ waterDepth: 0.11 }),
      { transientVisibility: remembered },
    );
    const deepSecret = visibleWaterPresentation(
      tile({ waterDepth: 0.99 }),
      { transientVisibility: remembered },
    );
    expect(shallowSecret?.depthDisclosed).toBe(false);
    expect(deepSecret?.depthDisclosed).toBe(false);
    expect(deepSecret?.depth).toBe(shallowSecret?.depth);
    expect(deepSecret?.band).toBe(shallowSecret?.band);
  });

  it("cuts actors, items, labels, currents, hit targets, and commands off on the live frame", () => {
    const visible = grid([tile({ currentVisibility: 1, currentDetailVisibility: 1 })]);
    const hidden = grid([tile()]);
    let state = sampleTerrainPerceptionMemory(undefined, input(visible, 0));
    state = sampleTerrainPerceptionMemory(state, input(hidden, 250));
    expect(rememberedTerrainVisibilityAt(state, 0)).toBeGreaterThan(0);
    expect(isDirectlyDetailPerceived(hidden, point, true)).toBe(false);

    const view = obscuredView(hidden);
    expect(buildSurfaceCurrentCues(hidden, view.tide.surfaceCurrent, {
      analytical: true,
      requireDetailDisclosure: true,
      reducedMotion: false,
    })).toEqual([]);

    const commands = [
      { type: "resource-target", nodeId: "secret-resource", point, gatherOnArrival: true },
      { type: "parcel-target", parcelId: "secret-parcel", recoverOnArrival: true },
      { type: "select", entity: "settlement", id: "secret-harbor", point },
      { type: "select", entity: "porter", id: "secret-porter", point },
      { type: "select", entity: "route", id: "secret-route", point },
    ] as const;
    expect(commands.map((command) => validatePerceivedEntityCommand(view, command)))
      .toEqual([null, null, null, null, null]);

    for (const target of [
      { entity: "resource", id: "secret-resource" },
      { entity: "settlement", id: "secret-harbor" },
      { entity: "porter", id: "secret-porter" },
      { entity: "route", id: "secret-route" },
    ] as const) {
      expect(commandForWorldTap(view, target, point, false)).toEqual({
        type: "move-target",
        point,
        additive: false,
      });
    }
  });

  it("keeps opaque identities distinct, rebases absolute overlap, and caps active storage", () => {
    const terrain = grid([tile({ currentVisibility: 1 })]);
    const identities = [-0, 0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
      .map((spatialEpoch) => terrainPerceptionMemoryIdentity({ terrain, spatialEpoch }));
    expect(new Set(identities)).toHaveLength(identities.length);

    const absolute = grid([
      tile({ currentVisibility: 1 }),
      tile({ currentVisibility: 1 }),
    ], 2, { worldTileOrigin: { x: -7_000, y: 9_000 } });
    let state = sampleTerrainPerceptionMemory(undefined, input(absolute, 100));
    const oldValues = state.values;
    state = sampleTerrainPerceptionMemory(state, input(grid([tile(), tile()], 2, {
      worldTileOrigin: { x: -6_999, y: 9_000 },
    }), 150, {
      spatialEpoch: "r:9007199254740991:-9007199254740991",
    }));
    expect(state.values).not.toBe(oldValues);
    expect(rememberedTerrainVisibilityAt(state, 0)).toBeCloseTo(1 - 50 / 900, 5);
    expect(rememberedTerrainVisibilityAt(state, 1)).toBe(0);

    const oversizedTiles = Array.from(
      { length: MAX_TERRAIN_PERCEPTION_MEMORY_TILES + 37 },
      () => tile({ currentVisibility: 1 }),
    );
    state = sampleTerrainPerceptionMemory(undefined, input(grid(oversizedTiles, 120), 0));
    expect(state.values).toHaveLength(MAX_TERRAIN_PERCEPTION_MEMORY_TILES);
    expect(MAX_TERRAIN_PERCEPTION_MEMORY_TILES).toBe(120 * 120);
    const store = createTerrainPerceptionMemoryStore();
    store.sample(input(terrain, 0));
    store.reset();
    expect(store.current()).toBeUndefined();
  });

  it("never lets reduced-motion preference widen exact perception", () => {
    const visible = grid([tile({ currentVisibility: 1, currentDetailVisibility: 1 })]);
    const hidden = grid([tile()]);
    const prior = sampleTerrainPerceptionMemory(undefined, input(visible, 0));
    const animated = sampleTerrainPerceptionMemory(prior, input(hidden, 100));
    const reduced = sampleTerrainPerceptionMemory(
      sampleTerrainPerceptionMemory(undefined, input(visible, 0)),
      input(hidden, 100, { reducedMotion: true }),
    );
    expect(rememberedTerrainVisibilityAt(reduced, 0))
      .toBeLessThanOrEqual(rememberedTerrainVisibilityAt(animated, 0));

    const view = obscuredView(hidden);
    for (const reducedMotion of [false, true]) {
      expect(buildSurfaceCurrentCues(hidden, view.tide.surfaceCurrent, {
        analytical: true,
        requireDetailDisclosure: true,
        reducedMotion,
      })).toEqual([]);
      expect(validatePerceivedEntityCommand(view, {
        type: "parcel-target",
        parcelId: parcel.id,
        recoverOnArrival: true,
      })).toBeNull();
    }
  });

  it("wires memory only into terrain and fail-closes Chart numeric soundings", () => {
    const chart = readFileSync(new URL("./p5Sketch.ts", import.meta.url), "utf8");
    const relief = readFileSync(new URL("./p5ReliefSketch.ts", import.meta.url), "utf8");
    const composite = readFileSync(new URL("./renderer.ts", import.meta.url), "utf8");
    expect(chart).toContain("drawTerrain(latestView, terrainMemory)");
    expect(chart).not.toMatch(/draw(?:SurfaceCurrents|FieldResources|LooseCargo|Settlements|Porters|Dogs)\([^)]*terrainMemory/u);
    expect(relief).toContain("drawTerrain(view, cache, camera, terrainMemory)");
    expect(relief).not.toMatch(/draw(?:Water|FieldResources|SurfaceCurrents|LooseCargo|Soundings|Settlements|Porters|Dogs)\([^)]*terrainMemory/u);
    expect(relief).not.toMatch(/syncReliefLabels\([^)]*terrainMemory/u);

    const soundingStart = chart.indexOf("const drawDepthSoundings =");
    const soundingEnd = chart.indexOf("const drawTraces =", soundingStart);
    expect(soundingStart).toBeGreaterThanOrEqual(0);
    expect(soundingEnd).toBeGreaterThan(soundingStart);
    const soundings = chart.slice(soundingStart, soundingEnd);
    expect(soundings).toContain("view.perception ? 0 : unit(tile.discovered, 1)");
    expect(soundings).toContain("currentTerrainDetailVisibility(tile, true) < 1");
    expect(soundings).not.toContain("unit(tile.depthKnown, unit(tile.discovered, 1))");

    // The memory is born and dies inside presentation composition. Neither
    // simulation/session state nor either persistence boundary can save it.
    expect(composite).toContain("createTerrainPerceptionMemoryStore()");
    expect(composite).toContain("terrainPerceptionMemory.reset()");
    for (const moduleUrl of [
      new URL("../game/sessionTypes.ts", import.meta.url),
      new URL("../platform/persistence.ts", import.meta.url),
      new URL("../sim/persistence.ts", import.meta.url),
    ]) {
      expect(readFileSync(moduleUrl, "utf8")).not.toMatch(
        /terrainPerceptionMemory|TerrainPerceptionMemory|rememberedTerrainVisibility/u,
      );
    }
  });
});

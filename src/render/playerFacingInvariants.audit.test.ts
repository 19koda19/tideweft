import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createPlayer, TILE_UNITS } from "../game/player";
import { projectGameView } from "../game/projection";
import { createSessionState } from "../game/sessionTypes";
import { projectUIView } from "../game/uiProjection";
import { createWorld, createWorldView } from "../sim/public";
import {
  mobileHudCopy,
  navigationTelemetryCopy,
} from "../ui/createTideweftUI";
import {
  buildSurfaceCurrentCues,
  buildWaterVoiceLabels,
  type SurfaceCurrentCueOptions,
} from "./currentCues";
import { reliefSurfaceMaterialColor } from "./reliefMaterialPresentation";
import {
  buildReliefMaterialBatches,
  buildReliefPerceptionMaterialBatches,
} from "./reliefTerrainBatches";
import { buildReliefRainFrame } from "./reliefWeather";
import { buildTerrainMesh } from "./terrainMesh";
import type {
  BiomeId,
  TerrainGridView,
  TerrainKind,
  TerrainTileView,
  WeatherView,
} from "./types";

const waterTile = (changes: Partial<TerrainTileView> = {}): TerrainTileView => ({
  kind: "channel",
  elevation: 0.1,
  waterDepth: 0.6,
  discovered: 1,
  depthKnown: 0,
  currentVisibility: 1,
  currentDetailVisibility: 1,
  ...changes,
});

const grid = (tiles: readonly TerrainTileView[], columns = tiles.length): TerrainGridView => ({
  columns,
  rows: Math.ceil(tiles.length / Math.max(1, columns)),
  tileSize: 24,
  origin: { x: 0, y: 0 },
  tiles,
  revision: "player-facing-audit",
});

function currentOptions(analytical: boolean): SurfaceCurrentCueOptions {
  return {
    reducedMotion: true,
    requireDetailDisclosure: true,
    analytical,
  };
}

function hsl(hex: string): { readonly hue: number; readonly saturation: number } {
  const packed = Number.parseInt(hex.replace(/^#/u, ""), 16);
  const red = ((packed >> 16) & 0xff) / 255;
  const green = ((packed >> 8) & 0xff) / 255;
  const blue = (packed & 0xff) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  const saturation = delta === 0
    ? 0
    : delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (delta > 0 && maximum === red) hue = 60 * (((green - blue) / delta) % 6);
  else if (delta > 0 && maximum === green) hue = 60 * ((blue - red) / delta + 2);
  else if (delta > 0) hue = 60 * ((red - green) / delta + 4);
  return { hue: hue < 0 ? hue + 360 : hue, saturation };
}

describe("player-facing release invariants", () => {
  it("draws no water arrowheads with scan off and restores them with scan on", () => {
    const terrain = grid([waterTile()]);
    const direction = { x: 1, y: 0 } as const;
    const scanOff = buildSurfaceCurrentCues(terrain, direction, currentOptions(false));
    const scanOn = buildSurfaceCurrentCues(terrain, direction, currentOptions(true));

    expect(scanOff).toHaveLength(1);
    expect(scanOff[0]?.analytical).toBe(false);
    expect(scanOff[0]?.streamline.length).toBe(4);
    expect(scanOff[0]?.headLeft).toEqual(scanOff[0]?.tip);
    expect(scanOff[0]?.headRight).toEqual(scanOff[0]?.tip);
    expect(scanOn).toHaveLength(1);
    expect(scanOn[0]?.analytical).toBe(true);
    expect(scanOn[0]?.headLeft).not.toEqual(scanOn[0]?.tip);
    expect(scanOn[0]?.headRight).not.toEqual(scanOn[0]?.tip);
  });

  it("keeps unsounded flow qualitative and gated by current detail perception", () => {
    const hidden = grid([waterTile({
      depthKnown: 0,
      currentVisibility: 1,
      currentDetailVisibility: 0,
    })]);
    expect(buildSurfaceCurrentCues(
      hidden,
      { x: 1, y: 0 },
      currentOptions(false),
    )).toEqual([]);

    const perceived = grid([waterTile({
      depthKnown: 0,
      currentVisibility: 1,
      currentDetailVisibility: 1,
    })]);
    const cues = buildSurfaceCurrentCues(
      perceived,
      { x: 1, y: 0 },
      currentOptions(false),
    );
    expect(cues).toHaveLength(1);
    expect(cues[0]).not.toHaveProperty("depth");
    expect(cues[0]).not.toHaveProperty("waterDepth");
    expect(cues[0]).not.toHaveProperty("effort");
    const voices = buildWaterVoiceLabels(cues, 0, false);
    expect(voices.every(({ text }) => text === "ohm" || text === "whissh")).toBe(true);
    expect(voices.map(({ text }) => text).join(" ")).not.toMatch(/\d|depth|effort/iu);
  });

  it("keeps unsounded UI depth and effort copy non-numeric", () => {
    const world = createWorldView(createWorld("unsounded player-facing audit", "standard"));
    const player = createPlayer(world);
    const occupied = new Set(world.settlements.map(({ tileIndex }) => tileIndex));
    const water = world.terrain.tiles.find((tile) =>
      tile.waterDepth > 20_000 && !occupied.has(tile.index));
    if (!water) throw new Error("unsounded UI audit did not find open water");
    player.x = water.x * TILE_UNITS + TILE_UNITS / 2;
    player.y = water.y * TILE_UNITS + TILE_UNITS / 2;
    player.previousX = player.x;
    player.previousY = player.y;
    player.depthSoundings[water.index] = 0;

    const field = projectUIView(
      world,
      player,
      createSessionState(world.seedText),
    ).field;
    expect(field.depthKnown).toBe(false);
    expect(field.depthLabel).toContain("unsounded");
    expect(field.depthLabel).not.toMatch(/\d/u);
    expect(field.effortLabel).not.toMatch(/\d/u);
    expect(field.hint).not.toMatch(/\d|extra stamina per movement step/iu);
  });

  it("keeps weather out of projected cameras and both renderer world transforms", () => {
    const base = createWorldView(createWorld("weather camera invariance audit", "standard"));
    const player = createPlayer(base);
    const camera = (weather: typeof base.weather) => projectGameView({
      ...base,
      weather,
    }, player).camera;
    const clear = camera({
      ...base.weather,
      kind: "clear",
      intensity: 0,
      windX: 0,
      windY: 0,
    });
    for (const weather of [
      { ...base.weather, kind: "rain" as const, intensity: 750_000, windX: -900_000, windY: 800_000 },
      { ...base.weather, kind: "storm" as const, intensity: 1_000_000, windX: 1_000_000, windY: -1_000_000 },
    ]) {
      expect(camera(weather)).toEqual(clear);
      expect(camera(weather).shake).toBe(0);
    }

    const chartSource = readFileSync(new URL("./p5Sketch.ts", import.meta.url), "utf8");
    const chartDrawStart = chartSource.indexOf("p.draw =");
    const chartWorldStart = chartSource.indexOf("p.push();", chartDrawStart);
    const chartWorldEnd = chartSource.indexOf("p.pop();", chartWorldStart);
    const chartWeather = chartSource.indexOf("drawWeather(latestView.weather", chartWorldEnd);
    expect(chartDrawStart).toBeGreaterThanOrEqual(0);
    expect(chartWorldStart).toBeGreaterThan(chartDrawStart);
    expect(chartWorldEnd).toBeGreaterThan(chartWorldStart);
    expect(chartWeather).toBeGreaterThan(chartWorldEnd);
    expect(chartSource.slice(chartWorldStart, chartWorldEnd)).not.toContain("weather");

    const source = readFileSync(new URL("./p5ReliefSketch.ts", import.meta.url), "utf8");
    const sceneStart = source.indexOf("const drawScene =");
    const sceneEnd = source.indexOf("p.setup =", sceneStart);
    expect(sceneStart).toBeGreaterThanOrEqual(0);
    expect(sceneEnd).toBeGreaterThan(sceneStart);
    const scene = source.slice(sceneStart, sceneEnd);

    // Screen-space rain/wind may animate themselves, but authoritative terrain,
    // labels, picking, and camera projection must not inherit a weather shake.
    expect(scene).not.toMatch(/const\s+storm[\s\S]*?p\.translate\([\s\S]*?storm/u);
  });

  it("keeps every rain kind downward under extreme wind and every camera yaw", () => {
    const kinds = ["drizzle", "rain", "squall"] as const;
    const winds = [
      { x: -1, y: -1 },
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: -1 },
    ] as const;
    const yaws = [-Math.PI, -Math.PI / 2, 0, Math.PI / 2, Math.PI] as const;

    for (const kind of kinds) {
      for (const wind of winds) {
        for (const yaw of yaws) {
          const weather: WeatherView = { kind, intensity: 1, wind };
          const streaks = buildReliefRainFrame(weather, {
            width: 390,
            height: 844,
            now: 98_765,
            reducedMotion: false,
            yaw,
            maximumStreaks: 6,
          });
          expect(streaks.length, `${kind} ${JSON.stringify(wind)} yaw ${yaw}`).toBeGreaterThan(0);
          expect(streaks.every(({ dy }) => Number.isFinite(dy) && dy > 0)).toBe(true);
        }
      }
    }
  });

  it("projects equivalent terrain, biome, depth, effort, stability, navigation, and FPS facts", () => {
    const terrainLabel = "Rain meadow · meadow";
    const depthLabel = "Knee deep";
    const effortLabel = "Heavy stamina use";
    const stabilityHint = "Falling · cross-current + loose footing";
    const mobile = mobileHudCopy({
      objectiveTitle: "Carry the promise",
      objectiveRoute: "PICKUP: Bellwake · DELIVERY: Reedwake",
      objectiveProgress: "1.2 tiles to delivery",
      stamina: 0.61,
      stability: 0.37,
      stabilityHint,
      isWater: true,
      terrain: terrainLabel,
      depth: depthLabel,
      effort: effortLabel,
      swept: false,
      fieldHint: "Brace across the current.",
      canScan: true,
      interactLabel: "Recover parcel",
      wayknotLabel: "Lay Tide anchor",
    });
    const navigation = {
      regionX: -304,
      regionY: 719,
      localX: 17,
      localY: 4,
      globalX: -29_775,
      globalY: 52_984,
    };
    const telemetry = {
      fps: 59.6,
      frameTimeMs: 16.78,
      frameCount: 120,
      active: true,
    };
    const desktopNavigation = navigationTelemetryCopy(navigation, telemetry);
    const mobileNavigation = navigationTelemetryCopy(navigation, telemetry, true);

    expect(mobile.terrain).toContain(terrainLabel);
    expect(mobile.terrain).toContain(depthLabel);
    expect(mobile.terrain).toContain(effortLabel);
    expect(mobile.safety).toContain("cross-current + loose footing");
    expect(desktopNavigation).toContain("REGION -304,+719");
    expect(desktopNavigation).toContain("LOCAL 17,4");
    expect(desktopNavigation).toContain("GLOBAL -29775,+52984");
    expect(mobileNavigation).toContain("R -304,+719");
    expect(mobileNavigation).toContain("L 17,4");
    expect(mobileNavigation).toContain("G -29775,+52984");
    expect(desktopNavigation).toContain("60 FPS");
    expect(mobileNavigation).toContain("60 FPS");

    const source = readFileSync(new URL("../ui/createTideweftUI.ts", import.meta.url), "utf8");
    expect(source).toMatch(/setProgress\(refs\.stability,\s*view\.player\.stability\)/u);
    expect(source).toMatch(/setProgress\(refs\.mobileStability,\s*view\.player\.stability/u);
    expect(source).toMatch(/terrainLabel:\s*view\.field\.terrainLabel/u);
    expect(source).toMatch(/terrain:\s*presentedTerrainLabel/u);
    expect(source).toMatch(/depth:\s*view\.field\.depthLabel/u);
    expect(source).toMatch(/effort:\s*view\.field\.effortLabel/u);
    expect(source).toMatch(/navigationTelemetryCopy\(view\.navigation,\s*telemetry,\s*true\)/u);
  });

  it("keeps dry Relief identities out of water kinds and saturated cyan materials", () => {
    const identities: readonly {
      readonly kind: TerrainKind;
      readonly biome: Exclude<BiomeId, "tide-channel">;
    }[] = [
      { kind: "salt-marsh", biome: "brine-flat" },
      { kind: "salt-marsh", biome: "reed-marsh" },
      { kind: "meadow", biome: "rain-meadow" },
      { kind: "meadow", biome: "sun-meadow" },
      { kind: "ridge", biome: "wind-ridge" },
      { kind: "scrub", biome: "glimmerfen" },
    ];
    const tiles = identities.map(({ kind, biome }): TerrainTileView => ({
      kind,
      biome,
      elevation: 0.4,
      waterDepth: 0,
      discovered: 1,
      currentVisibility: 1,
      currentDetailVisibility: 1,
    }));
    const terrain = grid(tiles);
    const chunk = buildTerrainMesh(terrain, { chunkSize: identities.length }).chunks[0];
    if (!chunk) throw new Error("dry material audit did not create a terrain chunk");
    const durable = buildReliefMaterialBatches(chunk, terrain);
    const transient = buildReliefPerceptionMaterialBatches(chunk, terrain);
    const waterKinds = new Set<TerrainKind>(["deep-water", "channel", "shallows"]);

    expect([...durable, ...transient].every(({ kind }) => !waterKinds.has(kind))).toBe(true);
    for (const { kind, biome } of identities) {
      const material = reliefSurfaceMaterialColor({
        kind,
        biome,
        environment: 1,
        visibility: 1,
        fog: 0,
        currentVisibility: 1,
      });
      const { hue, saturation } = hsl(material);
      const saturatedCyan = saturation >= 0.2 && hue >= 170 && hue <= 210;
      expect(saturatedCyan, `${biome} collapsed to cyan at hue ${hue}`).toBe(false);
    }
  });
});

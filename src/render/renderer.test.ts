import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TerrainPerceptionMemoryStore } from "./terrainPerceptionMemory";

const leaf = vi.hoisted(() => ({
  reliefSupported: true,
  reliefError: null as ((reason: string) => void) | null,
  reliefOrbitChange: null as ((yaw: number) => void) | null,
  reliefYaw: -0.36,
  chartSetActive: vi.fn(),
  reliefSetActive: vi.fn(),
  chartDestroy: vi.fn(),
  reliefDestroy: vi.fn(),
  compassSetHeading: vi.fn(),
  compassSetActive: vi.fn(),
  compassDestroy: vi.fn(),
  chartMemory: undefined as TerrainPerceptionMemoryStore | undefined,
  reliefMemory: undefined as TerrainPerceptionMemoryStore | undefined,
}));

vi.mock("./worldCompass", () => ({
  createWorldCompass: () => ({
    element: null,
    setHeading: leaf.compassSetHeading,
    setActive: leaf.compassSetActive,
    destroy: leaf.compassDestroy,
  }),
}));

vi.mock("./p5Sketch", () => ({
  createTideweftRenderer: (options: { terrainPerceptionMemory?: TerrainPerceptionMemoryStore }) => {
    leaf.chartMemory = options.terrainPerceptionMemory;
    return ({
    canvas: () => null,
    resize: vi.fn(),
    focusWorld: vi.fn(),
    pulseScan: vi.fn(),
    setActive: leaf.chartSetActive,
    destroy: leaf.chartDestroy,
    });
  },
}));

vi.mock("./p5ReliefSketch", () => ({
  createTideweftReliefRenderer: (options: {
    onWebGLError?: (reason: string) => void;
    onOrbitChange?: (yaw: number) => void;
    terrainPerceptionMemory?: TerrainPerceptionMemoryStore;
  }) => {
    leaf.reliefError = options.onWebGLError ?? null;
    leaf.reliefOrbitChange = options.onOrbitChange ?? null;
    leaf.reliefMemory = options.terrainPerceptionMemory;
    return {
      canvas: () => null,
      resize: vi.fn(),
      focusWorld: vi.fn(),
      pulseScan: vi.fn(),
      supported: () => leaf.reliefSupported,
      isActive: vi.fn(),
      setActive: leaf.reliefSetActive,
      setOrbit: vi.fn(),
      resetOrbit: vi.fn(),
      orbitYaw: () => leaf.reliefYaw,
      destroy: leaf.reliefDestroy,
    };
  },
}));

import { createTideweftRenderer } from "./renderer";

beforeEach(() => {
  leaf.reliefSupported = true;
  leaf.reliefError = null;
  leaf.reliefOrbitChange = null;
  leaf.reliefYaw = -0.36;
  leaf.chartMemory = undefined;
  leaf.reliefMemory = undefined;
  vi.clearAllMocks();
});

function options(onModeChange: (mode: string, reliefAvailable: boolean) => void) {
  return {
    mount: { dataset: {} } as HTMLElement,
    getView: () => null,
    dispatch: vi.fn(),
    onModeChange,
  };
}

describe("composite renderer fallback", () => {
  it("shares one bounded terrain impression across quick view toggles and clears it only on destroy", () => {
    const renderer = createTideweftRenderer(options(vi.fn()));
    expect(leaf.chartMemory).toBeDefined();
    expect(leaf.reliefMemory).toBe(leaf.chartMemory);
    const memory = leaf.chartMemory!;
    memory.sample({
      terrain: {
        columns: 1,
        rows: 1,
        tileSize: 24,
        origin: { x: 0, y: 0 },
        revision: "quick-toggle",
        tiles: [{
          kind: "meadow",
          elevation: 0.2,
          discovered: 1,
          currentVisibility: 1,
          currentDetailVisibility: 1,
        }],
      },
      spatialEpoch: "r:0:0",
      worldName: "Toggle Estuary",
      tick: 1,
      timeMs: 100,
      perceptionEnabled: true,
      reducedMotion: false,
    });

    expect(renderer.toggleMode()).toBe("relief-3d");
    expect(memory.current()?.values[0]).toBe(1);
    expect(renderer.toggleMode()).toBe("chart-2d");
    expect(memory.current()?.values[0]).toBe(1);
    renderer.destroy();
    expect(memory.current()).toBeUndefined();
  });

  it("falls back from active Relief and disables it after a context failure", async () => {
    const changes: Array<[string, boolean]> = [];
    const renderer = createTideweftRenderer({
      ...options((mode, available) => changes.push([mode, available])),
      initialMode: "relief-3d",
    });

    expect(renderer.mode()).toBe("relief-3d");
    expect(leaf.compassSetHeading).toHaveBeenLastCalledWith("relief-3d", -0.36);
    leaf.reliefOrbitChange?.(0.72);
    expect(leaf.compassSetHeading).toHaveBeenLastCalledWith("relief-3d", 0.72);
    leaf.reliefError?.("context lost");
    await Promise.resolve();

    expect(renderer.mode()).toBe("chart-2d");
    expect(renderer.reliefSupported()).toBe(false);
    expect(changes.at(-1)).toEqual(["chart-2d", false]);
    expect(leaf.chartSetActive).toHaveBeenLastCalledWith(true);
    expect(leaf.reliefSetActive).toHaveBeenLastCalledWith(false);
    expect(leaf.compassSetHeading).toHaveBeenLastCalledWith("chart-2d", 0);

    renderer.setActive(false);
    expect(renderer.isActive()).toBe(false);
    expect(leaf.compassSetActive).toHaveBeenLastCalledWith(false);
    renderer.setActive(true);
    expect(renderer.isActive()).toBe(true);
    expect(leaf.compassSetActive).toHaveBeenLastCalledWith(true);

    renderer.destroy();
    expect(leaf.compassDestroy).toHaveBeenCalledOnce();
  });

  it("updates availability when the hidden Relief context fails in Chart mode", async () => {
    const changes: Array<[string, boolean]> = [];
    const renderer = createTideweftRenderer(
      options((mode, available) => changes.push([mode, available])),
    );

    expect(changes.at(-1)).toEqual(["chart-2d", true]);
    expect(leaf.compassSetHeading).toHaveBeenLastCalledWith("chart-2d", 0);
    const compassUpdates = leaf.compassSetHeading.mock.calls.length;
    leaf.reliefOrbitChange?.(1.2);
    expect(leaf.compassSetHeading).toHaveBeenCalledTimes(compassUpdates);
    leaf.reliefError?.("hidden context lost");
    await Promise.resolve();

    expect(renderer.mode()).toBe("chart-2d");
    expect(changes.at(-1)).toEqual(["chart-2d", false]);
    expect(renderer.toggleMode()).toBe("chart-2d");
  });
});

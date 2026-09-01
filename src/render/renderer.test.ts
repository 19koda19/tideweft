import { beforeEach, describe, expect, it, vi } from "vitest";

const leaf = vi.hoisted(() => ({
  reliefSupported: true,
  reliefError: null as ((reason: string) => void) | null,
  chartSetActive: vi.fn(),
  reliefSetActive: vi.fn(),
  chartDestroy: vi.fn(),
  reliefDestroy: vi.fn(),
}));

vi.mock("./p5Sketch", () => ({
  createTideweftRenderer: () => ({
    canvas: () => null,
    resize: vi.fn(),
    focusWorld: vi.fn(),
    pulseScan: vi.fn(),
    setActive: leaf.chartSetActive,
    destroy: leaf.chartDestroy,
  }),
}));

vi.mock("./p5ReliefSketch", () => ({
  createTideweftReliefRenderer: (options: { onWebGLError?: (reason: string) => void }) => {
    leaf.reliefError = options.onWebGLError ?? null;
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
      destroy: leaf.reliefDestroy,
    };
  },
}));

import { createTideweftRenderer } from "./renderer";

beforeEach(() => {
  leaf.reliefSupported = true;
  leaf.reliefError = null;
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
  it("falls back from active Relief and disables it after a context failure", async () => {
    const changes: Array<[string, boolean]> = [];
    const renderer = createTideweftRenderer({
      ...options((mode, available) => changes.push([mode, available])),
      initialMode: "relief-3d",
    });

    expect(renderer.mode()).toBe("relief-3d");
    leaf.reliefError?.("context lost");
    await Promise.resolve();

    expect(renderer.mode()).toBe("chart-2d");
    expect(renderer.reliefSupported()).toBe(false);
    expect(changes.at(-1)).toEqual(["chart-2d", false]);
    expect(leaf.chartSetActive).toHaveBeenLastCalledWith(true);
    expect(leaf.reliefSetActive).toHaveBeenLastCalledWith(false);
  });

  it("updates availability when the hidden Relief context fails in Chart mode", async () => {
    const changes: Array<[string, boolean]> = [];
    const renderer = createTideweftRenderer(
      options((mode, available) => changes.push([mode, available])),
    );

    expect(changes.at(-1)).toEqual(["chart-2d", true]);
    leaf.reliefError?.("hidden context lost");
    await Promise.resolve();

    expect(renderer.mode()).toBe("chart-2d");
    expect(changes.at(-1)).toEqual(["chart-2d", false]);
    expect(renderer.toggleMode()).toBe("chart-2d");
  });
});

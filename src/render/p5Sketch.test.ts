import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DogView, RendererCommand, TideweftView } from "./types";

const p5Harness = vi.hoisted(() => ({
  canvas: null as MockCanvas | null,
  instance: null as Record<PropertyKey, unknown> | null,
}));

vi.mock("p5", () => ({
  default: class MockP5 {
    constructor(sketch: (instance: Record<PropertyKey, unknown>) => void) {
      const drawingContext = {
        lineDashOffset: 0,
        restore: vi.fn(),
        save: vi.fn(),
        setLineDash: vi.fn(),
        shadowBlur: 0,
        shadowColor: "",
      };
      const target: Record<PropertyKey, unknown> = {
        BOLD: "bold",
        CENTER: "center",
        CLOSE: "close",
        CORNER: "corner",
        HALF_PI: Math.PI / 2,
        NORMAL: "normal",
        P2D: "p2d",
        PI: Math.PI,
        ROUND: "round",
        TWO_PI: Math.PI * 2,
        drawingContext,
        height: 100,
        width: 200,
        color: vi.fn(() => ({ setAlpha: vi.fn() })),
        createCanvas: vi.fn((width: number, height: number) => {
          target.width = width;
          target.height = height;
          return { elt: p5Harness.canvas };
        }),
        loop: vi.fn(),
        noLoop: vi.fn(),
        remove: vi.fn(),
        resizeCanvas: vi.fn((width: number, height: number) => {
          target.width = width;
          target.height = height;
        }),
        textWidth: vi.fn((text: unknown) => String(text).length * 6),
      };
      const instance = new Proxy(target, {
        get(object, property) {
          if (Reflect.has(object, property)) return Reflect.get(object, property);
          const fallback = vi.fn();
          Reflect.set(object, property, fallback);
          return fallback;
        },
      });
      sketch(instance);
      (instance.setup as (() => void) | undefined)?.();
      p5Harness.instance = instance;
      return instance;
    }
  },
}));

import { createTideweftRenderer } from "./p5Sketch";

type Listener = (event: TestPointerEvent) => void;

interface TestPointerEvent {
  readonly button: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly pointerId: number;
  readonly pointerType: string;
  readonly shiftKey: boolean;
  readonly preventDefault: ReturnType<typeof vi.fn>;
}

class MockCanvas {
  readonly classList = { add: vi.fn() };
  readonly dataset: Record<string, string> = {};
  readonly releasedPointerIds: number[] = [];
  hidden = false;
  tabIndex = 0;
  private readonly captures = new Set<number>();
  private readonly listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, overrides: Partial<TestPointerEvent> = {}): TestPointerEvent {
    const event: TestPointerEvent = {
      button: 0,
      clientX: 100,
      clientY: 50,
      pointerId: 1,
      pointerType: "mouse",
      shiftKey: false,
      preventDefault: vi.fn(),
      ...overrides,
    };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    return event;
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  focus(): void {}

  getBoundingClientRect(): DOMRect {
    return {
      bottom: 100,
      height: 100,
      left: 0,
      right: 200,
      top: 0,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.captures.has(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    if (!this.captures.delete(pointerId)) return;
    this.releasedPointerIds.push(pointerId);
  }

  setAttribute(): void {}

  setPointerCapture(pointerId: number): void {
    this.captures.add(pointerId);
  }
}

const draw = (): void => {
  const callback = p5Harness.instance?.draw;
  if (typeof callback !== "function") throw new Error("p5 draw callback was not installed");
  callback();
};

const view = (
  spatialEpoch: number | string | undefined,
  position = { x: 20, y: 30 },
  cameraOverrides: Partial<TideweftView["camera"]> = {},
): TideweftView => ({
  revision: 1,
  ...(spatialEpoch === undefined ? {} : { spatialEpoch }),
  tick: 1,
  terrain: {
    columns: 1,
    rows: 1,
    tileSize: 24,
    origin: { x: 0, y: 0 },
    tiles: [],
    revision: 1,
  },
  tide: { phase: "low", level: 0, progress: 0, surfaceCurrent: { x: 0, y: 0 } },
  weather: { kind: "clear", intensity: 0, wind: { x: 0, y: 0 } },
  settlements: [],
  player: {
    position,
    velocity: { x: 0, y: 0 },
    facing: 0,
    stamina: 1,
    stability: 1,
    scanCharge: 1,
    cargoLoad: 0,
    cargoCapacity: 4,
    cargo: [],
    pace: "steady",
    balanceState: "balanced",
    mode: "foot",
  },
  routes: [],
  choirs: [],
  wayknots: [],
  tideHarps: [],
  fieldResources: [],
  looseCargo: [],
  traces: [],
  porters: [],
  particles: [],
  events: [],
  camera: {
    center: position,
    zoom: 1,
    followPlayer: true,
    bounds: { minX: -1_000, minY: -1_000, maxX: 1_000, maxY: 1_000 },
    ...cameraOverrides,
  },
});

const dogView = (overrides: Partial<DogView> = {}): DogView => ({
  version: 1,
  actorId: "D-R-v1-render-dog",
  quickLabel: "Unknown dog",
  position: { x: 12, y: 12 },
  facing: 0,
  size: "medium",
  sizeScale: 0.9,
  coat: {
    primary: "brown",
    secondary: "cream",
    pattern: "bicolor",
    length: "medium",
  },
  wetness: 700_000,
  conditionLabels: ["WET"],
  behavior: "observe",
  selected: false,
  ...overrides,
});

let canvas: MockCanvas;

beforeEach(() => {
  canvas = new MockCanvas();
  p5Harness.canvas = canvas;
  p5Harness.instance = null;
  const mediaQuery = {
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    devicePixelRatio: 1,
    innerHeight: 100,
    innerWidth: 200,
    matchMedia: vi.fn(() => mediaQuery),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("document", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    visibilityState: "visible",
  });
  vi.stubGlobal("ResizeObserver", undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Chart spatial epoch gate", () => {
  it("keeps legacy, first-defined, repeated, and temporarily absent epochs compatible", () => {
    let current = view(undefined);
    const commands: RendererCommand[] = [];
    const renderer = createTideweftRenderer({
      mount: { getBoundingClientRect: () => canvas.getBoundingClientRect() } as HTMLElement,
      getView: () => current,
      dispatch: (command) => commands.push(command),
    });
    draw();

    const completeClick = (pointerId: number): void => {
      canvas.emit("pointerdown", { pointerId });
      draw();
      canvas.emit("pointerup", { pointerId });
    };

    current = view("7");
    completeClick(1);
    current = view("7");
    completeClick(2);
    current = view(undefined);
    completeClick(3);
    current = view("7");
    completeClick(4);

    expect(commands).toHaveLength(4);
    expect(commands.every((command) => command.type === "move-target")).toBe(true);
    renderer.destroy();
  });

  it("rebases a held world tap from absolute tile origins without consuming real player motion", () => {
    const framedView = (
      spatialEpoch: string,
      position: { readonly x: number; readonly y: number },
      worldTileOrigin: { readonly x: number; readonly y: number },
    ): TideweftView => {
      const base = view(spatialEpoch, position);
      return {
        ...base,
        terrain: { ...base.terrain, worldTileOrigin },
      };
    };
    let current = framedView("frame-a", { x: 500, y: 300 }, { x: 100, y: -50 });
    const commands: RendererCommand[] = [];
    const renderer = createTideweftRenderer({
      mount: { getBoundingClientRect: () => canvas.getBoundingClientRect() } as HTMLElement,
      getView: () => current,
      dispatch: (command) => commands.push(command),
    });
    draw();
    canvas.emit("pointerdown", { pointerId: 71 });

    // The local player moved four world units while the spatial frame shifted
    // sixteen tiles. Camera/input continuity must use only the exact frame
    // translation (-16 * 24), not infer a rebase from player displacement.
    current = framedView("frame-b", { x: 120, y: 300 }, { x: 116, y: -50 });
    draw();
    expect(canvas.releasedPointerIds).not.toContain(71);
    canvas.emit("pointerup", { pointerId: 71 });

    expect(commands).toEqual([{
      type: "move-target",
      point: { x: 116, y: 300 },
      additive: false,
    }]);
    expect(canvas.releasedPointerIds).toContain(71);
    renderer.destroy();
  });

  it("rejects a held world tap when a different world reuses the same spatial frame", () => {
    const inWorld = (worldName: string, position: { x: number; y: number }): TideweftView => {
      const base = view("g:10:-20", position);
      return {
        ...base,
        worldName,
        terrain: { ...base.terrain, worldTileOrigin: { x: 10, y: -20 } },
      };
    };
    let current = inWorld("First Estuary", { x: 20, y: 30 });
    const commands: RendererCommand[] = [];
    const renderer = createTideweftRenderer({
      mount: { getBoundingClientRect: () => canvas.getBoundingClientRect() } as HTMLElement,
      getView: () => current,
      dispatch: (command) => commands.push(command),
    });
    draw();
    canvas.emit("pointerdown", { pointerId: 72 });

    current = inWorld("Replacement Estuary", { x: 600, y: 500 });
    canvas.emit("pointerup", { pointerId: 72 });

    expect(commands).toEqual([]);
    expect(canvas.releasedPointerIds).toContain(72);
    renderer.destroy();
  });

  it("treats epochs as opaque, snaps to the new player, and rejects an old desktop release", () => {
    let current = view("7", { x: 20, y: 30 });
    const commands: RendererCommand[] = [];
    const renderer = createTideweftRenderer({
      mount: { getBoundingClientRect: () => canvas.getBoundingClientRect() } as HTMLElement,
      getView: () => current,
      dispatch: (command) => commands.push(command),
    });
    draw();
    renderer.focusWorld({ x: 800, y: 700 }, 2);
    canvas.emit("pointermove", { clientX: 130, clientY: 60, pointerId: 8 });
    canvas.emit("pointerdown", { pointerId: 9 });
    expect(canvas.dataset.hoverEntity).toBe("world");

    current = view(7, { x: 640, y: 360 });
    const staleRelease = canvas.emit("pointerup", { pointerId: 9 });
    expect(canvas.releasedPointerIds).toContain(9);
    expect(canvas.dataset.hoverEntity).toBeUndefined();
    expect(staleRelease.preventDefault).toHaveBeenCalledOnce();
    expect(commands).toEqual([]);

    canvas.emit("pointerdown", { pointerId: 10 });
    canvas.emit("pointerup", { pointerId: 10 });
    expect(commands).toEqual([{
      type: "move-target",
      point: { x: 640, y: 360 },
      additive: false,
    }]);
    renderer.destroy();
  });

  it("releases an epoch-invalidated touch sequence and explicitly clears runtime input on blur", () => {
    let current = view("r:0:0");
    const commands: RendererCommand[] = [];
    const renderer = createTideweftRenderer({
      mount: { getBoundingClientRect: () => canvas.getBoundingClientRect() } as HTMLElement,
      getView: () => current,
      dispatch: (command) => commands.push(command),
    });
    draw();
    canvas.emit("pointerdown", { pointerId: 21, pointerType: "touch" });
    current = view("r:-1:0", { x: -120, y: 80 });
    draw();
    expect(canvas.releasedPointerIds).toContain(21);
    canvas.emit("pointerup", { pointerId: 21, pointerType: "touch" });

    canvas.emit("pointerdown", { pointerId: 22, pointerType: "touch" });
    canvas.emit("pointercancel", { pointerId: 22, pointerType: "touch" });
    canvas.emit("pointerup", { pointerId: 22, pointerType: "touch" });
    canvas.emit("pointerdown", { pointerId: 23 });
    canvas.emit("blur", { pointerId: 23 });
    canvas.emit("pointerup", { pointerId: 23 });

    expect(commands).toEqual([{
      type: "movement",
      vector: { x: 0, y: 0 },
    }]);
    renderer.destroy();
  });

  it("snaps a non-follow camera when pointer cancellation observes the epoch before draw", () => {
    let current = view("west");
    const commands: RendererCommand[] = [];
    const renderer = createTideweftRenderer({
      mount: { getBoundingClientRect: () => canvas.getBoundingClientRect() } as HTMLElement,
      getView: () => current,
      dispatch: (command) => commands.push(command),
    });
    draw();
    canvas.emit("pointerdown", { pointerId: 31 });

    current = view(
      "east",
      { x: 720, y: 690 },
      { center: { x: -240, y: 410 }, followPlayer: false },
    );
    canvas.emit("pointercancel", { pointerId: 31 });
    canvas.emit("pointerup", { pointerId: 31 });
    expect(commands).toEqual([]);

    canvas.emit("pointerdown", { pointerId: 32 });
    canvas.emit("pointerup", { pointerId: 32 });
    expect(commands).toEqual([{
      type: "move-target",
      point: { x: -240, y: 410 },
      additive: false,
    }]);

    canvas.emit("pointerdown", { pointerId: 33 });
    current = view(
      "north",
      { x: 600, y: 600 },
      { center: { x: 75, y: -310 }, followPlayer: false },
    );
    const staleContextMenu = canvas.emit("contextmenu", { pointerId: 33 });
    expect(staleContextMenu.preventDefault).toHaveBeenCalledOnce();
    expect(commands).toHaveLength(1);
    renderer.destroy();
  });

  it("rebases to the latest epoch after the hidden renderer misses several crossings", () => {
    let current = view("r:0:0", { x: 20, y: 30 });
    const commands: RendererCommand[] = [];
    const renderer = createTideweftRenderer({
      mount: { getBoundingClientRect: () => canvas.getBoundingClientRect() } as HTMLElement,
      getView: () => current,
      dispatch: (command) => commands.push(command),
    });
    draw();
    canvas.emit("pointerdown", { pointerId: 51 });
    renderer.setActive?.(false);
    current = view("r:1:0", { x: 780, y: 420 });
    current = view("r:-7:9", { x: -360, y: 640 });
    renderer.setActive?.(true);
    canvas.emit("pointerup", { pointerId: 51 });
    expect(commands).toEqual([{
      type: "movement",
      vector: { x: 0, y: 0 },
    }]);

    canvas.emit("pointerdown", { pointerId: 52 });
    canvas.emit("pointerup", { pointerId: 52 });
    expect(commands).toEqual([
      { type: "movement", vector: { x: 0, y: 0 } },
      {
        type: "move-target",
        point: { x: -360, y: 640 },
        additive: false,
      },
    ]);
    renderer.destroy();
  });
});

describe("Chart presentation-only pointer drift", () => {
  it("eases a clamped mouse drift and inverts it for accurate world clicks", () => {
    let now = 0;
    vi.stubGlobal("performance", { now: () => now });
    const commands: RendererCommand[] = [];
    const renderer = createTideweftRenderer({
      mount: { getBoundingClientRect: () => canvas.getBoundingClientRect() } as HTMLElement,
      getView: () => view("stable"),
      dispatch: (command) => commands.push(command),
    });
    draw();
    const translate = p5Harness.instance?.translate as ReturnType<typeof vi.fn>;
    translate.mockClear();

    canvas.emit("pointermove", { clientX: 200, clientY: 100, pointerType: "mouse" });
    now = 120;
    draw();
    const sceneTranslation = translate.mock.calls[0];
    expect(sceneTranslation?.[0]).toBeGreaterThanOrEqual(96.5);
    expect(sceneTranslation?.[0]).toBeLessThan(100);
    expect(sceneTranslation?.[1]).toBeGreaterThanOrEqual(46.5);
    expect(sceneTranslation?.[1]).toBeLessThan(50);
    const driftX = Number(sceneTranslation?.[0]) - 100;
    const driftY = Number(sceneTranslation?.[1]) - 50;

    canvas.emit("pointerdown", { clientX: 100, clientY: 50, pointerId: 77 });
    canvas.emit("pointerup", { clientX: 100, clientY: 50, pointerId: 77 });
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ type: "move-target", additive: false });
    if (commands[0]?.type !== "move-target") throw new Error("expected move target");
    expect(commands[0].point.x).toBeCloseTo(20 - driftX, 8);
    expect(commands[0].point.y).toBeCloseTo(30 - driftY, 8);
    renderer.destroy();
  });

  it("recenters on leave, disables touch hover, and cleans up on inactive/destroy", () => {
    let now = 0;
    vi.stubGlobal("performance", { now: () => now });
    let current = view("west");
    const dispatch = vi.fn();
    const renderer = createTideweftRenderer({
      mount: { getBoundingClientRect: () => canvas.getBoundingClientRect() } as HTMLElement,
      getView: () => current,
      dispatch,
    });
    draw();
    const translate = p5Harness.instance?.translate as ReturnType<typeof vi.fn>;
    translate.mockClear();
    canvas.emit("pointermove", { clientX: 200, clientY: 100 });
    now = 100;
    draw();
    const drifted = Number(translate.mock.calls[0]?.[0]);

    canvas.emit("pointerleave");
    translate.mockClear();
    now = 200;
    draw();
    expect(Math.abs(Number(translate.mock.calls[0]?.[0]) - 100)).toBeLessThan(Math.abs(drifted - 100));

    canvas.emit("pointermove", { clientX: 200, clientY: 100, pointerType: "touch" });
    translate.mockClear();
    now = 300;
    draw();
    expect(translate.mock.calls[0]?.[0]).toBe(100);
    expect(translate.mock.calls[0]?.[1]).toBe(50);

    canvas.emit("pointermove", { clientX: 200, clientY: 100 });
    current = view("east", { x: 600, y: 600 });
    translate.mockClear();
    now = 400;
    draw();
    expect(translate.mock.calls[0]?.[0]).toBe(100);
    expect(translate.mock.calls[0]?.[1]).toBe(50);

    renderer.setActive?.(false);
    expect(p5Harness.instance?.noLoop).toHaveBeenCalled();
    renderer.setActive?.(true);
    translate.mockClear();
    now = 500;
    draw();
    expect(translate.mock.calls[0]?.[0]).toBe(100);
    expect(canvas.listenerCount("pointermove")).toBe(1);
    renderer.destroy();
    expect(canvas.listenerCount("pointermove")).toBe(0);
    expect(p5Harness.instance?.remove).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: "movement",
      vector: { x: 0, y: 0 },
    });
  });

  it("eases a world label toward its new projected camera position", () => {
    let now = 0;
    vi.stubGlobal("performance", { now: () => now });
    const base = view("label-stable");
    const settlement = {
      id: "chart-label",
      name: "Chart Label",
      position: { x: 20, y: 30 },
      population: 10,
      status: "steady" as const,
      connection: 1,
      stress: 0,
      discovered: true,
    };
    let current: TideweftView = { ...base, settlements: [settlement] };
    const renderer = createTideweftRenderer({
      mount: { getBoundingClientRect: () => canvas.getBoundingClientRect() } as HTMLElement,
      getView: () => current,
      dispatch: vi.fn(),
    });
    draw();
    const text = p5Harness.instance?.text as ReturnType<typeof vi.fn>;
    const initial = text.mock.calls.find((call) => call[0] === "Chart Label");
    expect(initial?.[1]).toBe(100);

    text.mockClear();
    current = view(
      "label-stable",
      { x: 20, y: 30 },
      { center: { x: 120, y: 30 }, followPlayer: false },
    );
    current = { ...current, settlements: [settlement] };
    now = 16;
    draw();
    const eased = text.mock.calls.find((call) => call[0] === "Chart Label");
    expect(Number(eased?.[1])).toBeGreaterThan(90.5);
    expect(Number(eased?.[1])).toBeLessThan(100);
    renderer.destroy();
  });
});

describe("Chart wind production path", () => {
  it("draws sparse wind threads for clear wind, none when calm, and emits no command", () => {
    const base = view("wind-stable");
    let current: TideweftView = {
      ...base,
      weather: { kind: "clear", intensity: 0, wind: { x: 0.65, y: -0.2 } },
    };
    const dispatch = vi.fn();
    const renderer = createTideweftRenderer({
      mount: { getBoundingClientRect: () => canvas.getBoundingClientRect() } as HTMLElement,
      getView: () => current,
      dispatch,
    });
    draw();
    const bezier = p5Harness.instance?.bezier as ReturnType<typeof vi.fn>;
    expect(bezier.mock.calls.length).toBeGreaterThan(0);
    expect(bezier.mock.calls.length).toBeLessThanOrEqual(16);

    bezier.mockClear();
    current = { ...base, weather: { kind: "clear", intensity: 0, wind: { x: 0, y: 0 } } };
    draw();
    expect(bezier).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    renderer.destroy();
  });
});

describe("Chart sounding disclosure", () => {
  it("cuts exact depth labels immediately even while terrain memory is fading", () => {
    vi.stubGlobal("performance", { now: () => 100 });
    const base = view("sounding-detail", { x: 12, y: 12 });
    const terrainTiles = Array.from({ length: 16 }, (_, index) => ({
      kind: "channel" as const,
      elevation: 0,
      waterDepth: index === 2 ? 1 : 0,
      discovered: 1,
      depthKnown: index === 2 ? 1 : 0,
      currentVisibility: index === 2 ? 1 : 0,
      currentDetailVisibility: index === 2 ? 1 as const : 0 as const,
    }));
    let current: TideweftView = {
      ...base,
      perception: {
        version: 3,
        signature: "sounding-visible",
        valid: true,
        visibleTileCount: 1,
        directTileCount: 1,
        peripheralTileCount: 0,
      },
      terrain: {
        columns: 4,
        rows: 4,
        tileSize: 24,
        origin: { x: 0, y: 0 },
        revision: "sounding-detail",
        tiles: terrainTiles,
      },
      player: { ...base.player, position: { x: 12, y: 12 }, scanProgress: 1 },
    };
    const renderer = createTideweftRenderer({
      mount: { getBoundingClientRect: () => canvas.getBoundingClientRect() } as HTMLElement,
      getView: () => current,
      dispatch: vi.fn(),
    });
    draw();
    const text = p5Harness.instance?.text as ReturnType<typeof vi.fn>;
    expect(text.mock.calls.some(([copy]) => copy === "9 deep")).toBe(true);

    text.mockClear();
    current = {
      ...current,
      perception: { ...current.perception!, signature: "sounding-hidden" },
      terrain: {
        ...current.terrain,
        tiles: current.terrain.tiles.map((candidate, index) => index === 2
          ? { ...candidate, currentVisibility: 0, currentDetailVisibility: 0 as const }
          : candidate),
      },
    };
    draw();
    expect(text.mock.calls.some(([copy]) => copy === "9 deep")).toBe(false);

    text.mockClear();
    current = {
      ...current,
      terrain: {
        ...current.terrain,
        tiles: current.terrain.tiles.map((candidate, index) => {
          if (index !== 2) return candidate;
          const { depthKnown: _omitted, ...withoutDepthKnown } = candidate;
          return { ...withoutDepthKnown, currentDetailVisibility: 1 as const };
        }),
      },
    };
    draw();
    expect(text.mock.calls.some(([copy]) => copy === "9 deep")).toBe(false);
    renderer.destroy();
  });
});

describe("Chart ADRIFT presentation path", () => {
  it("uses live optional facts for bounded panel-free paddle copy, color, wake, and pose", () => {
    vi.stubGlobal("performance", { now: () => 0 });
    const base = view("adrift-chart", { x: 20, y: 30 });
    const legacySwept: TideweftView = {
      ...base,
      player: {
        ...base.player,
        mode: "swept",
        balanceState: "swept",
        sweptProgress: 0.99,
        stamina: 0.72,
        velocity: { x: 0.8, y: -0.2 },
      },
    };
    let current = legacySwept;
    const renderer = createTideweftRenderer({
      mount: { getBoundingClientRect: () => canvas.getBoundingClientRect() } as HTMLElement,
      getView: () => current,
      dispatch: vi.fn(),
    });
    draw();

    const p = p5Harness.instance;
    const text = p?.text as ReturnType<typeof vi.fn>;
    const line = p?.line as ReturnType<typeof vi.fn>;
    const rect = p?.rect as ReturnType<typeof vi.fn>;
    const color = p?.color as ReturnType<typeof vi.fn>;
    const legacyLineCount = line.mock.calls.length;
    const legacyRectCount = rect.mock.calls.length;
    expect(text.mock.calls.flat().map(String)).not.toContain("ADRIFT");
    text.mockClear();
    line.mockClear();
    rect.mockClear();
    color.mockClear();

    current = {
      ...legacySwept,
      player: {
        ...legacySwept.player,
        adrift: {
          paddling: true,
          catchingBreath: false,
          canStand: false,
          waterDepth: 0.78,
          currentDirection: { x: 1, y: 0 },
        },
      },
    };
    draw();

    const label = text.mock.calls.find(([copy]) => copy === "PADDLING");
    const instruction = text.mock.calls.find(([copy]) => copy === "PADDLE TOWARD SHALLOW WATER");
    const syllable = text.mock.calls.find(([copy]) => copy === "WHHSH");
    for (const call of [label, instruction, syllable]) {
      expect(call).toBeDefined();
      expect(Number(call?.[1])).toBeGreaterThanOrEqual(0);
      expect(Number(call?.[1])).toBeLessThanOrEqual(200);
      expect(Number(call?.[2])).toBeGreaterThanOrEqual(0);
      expect(Number(call?.[2])).toBeLessThanOrEqual(100);
    }
    const renderedCopy = text.mock.calls.map(([copy]) => String(copy)).join(" ");
    expect(renderedCopy).not.toMatch(/ashore|arrived|\bETA\b|\d+(?:\.\d+)?\s*%|percent/iu);
    expect(color).toHaveBeenCalledWith("#61e6d2");
    expect(color).toHaveBeenCalledWith("#edfff9");
    expect(line).toHaveBeenCalledTimes(legacyLineCount + 1);
    expect(rect).toHaveBeenCalledTimes(legacyRectCount);
    renderer.destroy();
  });
});

describe("Chart dog presentation", () => {
  it("draws a distinct observable dog, highlights selection/hover, and cuts it off with live detail", () => {
    vi.stubGlobal("performance", { now: () => 0 });
    const base = view("chart-dog", { x: 12, y: 12 });
    const visibleTerrain = {
      ...base.terrain,
      tiles: [{
        kind: "meadow" as const,
        elevation: 0.2,
        discovered: 1,
        currentVisibility: 1,
        currentDetailVisibility: 1 as const,
      }],
    };
    let current: TideweftView = {
      ...base,
      terrain: visibleTerrain,
      dogs: [dogView({ selected: true, conditionLabels: ["WET", "INJURED"] })],
    };
    const dispatch = vi.fn();
    const renderer = createTideweftRenderer({
      mount: { getBoundingClientRect: () => canvas.getBoundingClientRect() } as HTMLElement,
      getView: () => current,
      dispatch,
    });
    draw();

    const p = p5Harness.instance;
    const text = p?.text as ReturnType<typeof vi.fn>;
    const ellipse = p?.ellipse as ReturnType<typeof vi.fn>;
    const circle = p?.circle as ReturnType<typeof vi.fn>;
    const triangle = p?.triangle as ReturnType<typeof vi.fn>;
    expect(text.mock.calls.some(([copy]) => copy === "Unknown dog · wet · injured")).toBe(true);
    expect(text.mock.calls.flat().map(String)).not.toContain("D-R-v1-render-dog");
    expect(ellipse).toHaveBeenCalled();
    expect(circle).toHaveBeenCalled();
    expect(triangle).toHaveBeenCalled();

    canvas.emit("pointerdown", { clientX: 100, clientY: 50, pointerId: 91 });
    canvas.emit("pointerup", { clientX: 100, clientY: 50, pointerId: 91 });
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "select",
      entity: "living-actor",
      species: "domestic-dog",
      id: "D-R-v1-render-dog",
      point: { x: 12, y: 12 },
    });

    dispatch.mockClear();
    canvas.emit("pointerdown", {
      clientX: 100,
      clientY: 50,
      pointerId: 92,
      pointerType: "touch",
    });
    canvas.emit("pointerup", {
      clientX: 100,
      clientY: 50,
      pointerId: 92,
      pointerType: "touch",
    });
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({
      type: "select",
      entity: "living-actor",
      species: "domestic-dog",
      id: "D-R-v1-render-dog",
      point: { x: 12, y: 12 },
    });

    text.mockClear();
    dispatch.mockClear();
    current = {
      ...current,
      dogs: [dogView()],
    };
    canvas.emit("pointermove", { clientX: 100, clientY: 50, pointerType: "mouse" });
    draw();
    expect(text.mock.calls.some(([copy]) => copy === "Unknown dog · wet")).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();

    text.mockClear();
    current = {
      ...current,
      perception: {
        version: 1,
        signature: "dog-hidden",
        valid: true,
        visibleTileCount: 1,
        directTileCount: 1,
        peripheralTileCount: 0,
        detailVisibleTileCount: 0,
        detailDirectTileCount: 0,
        detailPeripheralTileCount: 0,
      },
      terrain: {
        ...visibleTerrain,
        tiles: visibleTerrain.tiles.map((tile) => ({
          ...tile,
          currentDetailVisibility: 0 as const,
        })),
      },
      dogs: [dogView({ selected: true })],
    };
    draw();
    expect(text.mock.calls.some(([copy]) => String(copy).startsWith("Unknown dog"))).toBe(false);
    canvas.emit("pointerdown", { clientX: 100, clientY: 50, pointerId: 93 });
    canvas.emit("pointerup", { clientX: 100, clientY: 50, pointerId: 93 });
    expect(dispatch.mock.calls.some(([command]) => command.type === "select")).toBe(false);
    renderer.destroy();
  });
});

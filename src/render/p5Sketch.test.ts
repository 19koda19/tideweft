import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RendererCommand, TideweftView } from "./types";

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

  it("releases an epoch-invalidated touch sequence and keeps cancel or blur releases inert", () => {
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

    expect(commands).toEqual([]);
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
    expect(commands).toEqual([]);

    canvas.emit("pointerdown", { pointerId: 52 });
    canvas.emit("pointerup", { pointerId: 52 });
    expect(commands).toEqual([{
      type: "move-target",
      point: { x: -360, y: 640 },
      additive: false,
    }]);
    renderer.destroy();
  });
});

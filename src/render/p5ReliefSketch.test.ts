import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TideweftView, WeatherView } from "./types";

const p5Harness = vi.hoisted(() => ({
  canvasFactory: null as null | (() => unknown),
  instances: [] as Array<Record<string, unknown>>,
  projectionShiftX: 0,
  overlayProjection: {
    xx: 1,
    xy: 0,
    yx: 0,
    yy: 1,
  },
  materialTrace: [] as Array<{
    readonly method: "fill" | "ambientMaterial" | "emissiveMaterial";
    readonly args: readonly unknown[];
  }>,
  initialDepthWriteEnabled: false,
}));

function projectOverlayLocalToScreen(x: number, y: number): { readonly x: number; readonly y: number } {
  const basis = p5Harness.overlayProjection;
  return {
    x: 160 + x * basis.xx + y * basis.yx,
    y: 120 + x * basis.xy + y * basis.yy,
  };
}

vi.mock("p5", () => {
  class FakeP5 {
    constructor(sketch: (instance: Record<string, unknown>) => void) {
      const camera = vi.fn();
      const methods = new Map<PropertyKey, ReturnType<typeof vi.fn>>();
      let depthWriteEnabled = p5Harness.initialDepthWriteEnabled;
      const depthMask = vi.fn((enabled: boolean) => {
        depthWriteEnabled = enabled;
      });
      const color = (value: unknown) => ({
        value,
        setAlpha: vi.fn(),
      });
      const tracedMaterial = (
        method: "fill" | "ambientMaterial" | "emissiveMaterial",
      ) => vi.fn((...args: unknown[]) => {
        p5Harness.materialTrace.push({ method, args });
      });
      const target: Record<PropertyKey, unknown> = {
        width: 320,
        height: 240,
        WEBGL: "webgl",
        TRIANGLES: "triangles",
        HALF_PI: Math.PI / 2,
        drawingContext: {
          DEPTH_TEST: 0x0b71,
          DEPTH_WRITEMASK: 0x0b72,
          depthMask,
          getParameter: vi.fn(() => depthWriteEnabled),
          isEnabled: vi.fn(() => true),
          disable: vi.fn(),
          enable: vi.fn(),
        },
        camera,
        color,
        fill: tracedMaterial("fill"),
        ambientMaterial: tracedMaterial("ambientMaterial"),
        emissiveMaterial: tracedMaterial("emissiveMaterial"),
        lerpColor: (_left: unknown, right: unknown) => right,
        worldToScreen: (x: number, y: number) => projectOverlayLocalToScreen(x, y),
        createCanvas: () => ({ elt: p5Harness.canvasFactory?.() }),
        resizeCanvas: vi.fn(),
        noLoop: vi.fn(),
        loop: vi.fn(),
        remove: vi.fn(),
      };
      const instance = new Proxy(target, {
        get: (record, property) => {
          if (Reflect.has(record, property)) return Reflect.get(record, property);
          let method = methods.get(property);
          if (!method) {
            method = vi.fn();
            methods.set(property, method);
          }
          return method;
        },
        set: (record, property, value) => Reflect.set(record, property, value),
      });
      sketch(instance);
      (instance.setup as (() => void) | undefined)?.();
      p5Harness.instances.push(instance);
      return instance;
    }
  }
  return { default: FakeP5 };
});

vi.mock("./reliefCamera", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./reliefCamera")>();
  return {
    ...actual,
    screenToDiscoveredReliefSurface: () => ({ x: 12, y: 12 }),
    projectReliefPoint: (...args: Parameters<typeof actual.projectReliefPoint>) => {
      const projected = actual.projectReliefPoint(...args);
      return { ...projected, x: projected.x + p5Harness.projectionShiftX };
    },
  };
});

import {
  MAX_RELIEF_MANUAL_ZOOM,
  MIN_RELIEF_MANUAL_ZOOM,
  createTideweftReliefRenderer,
} from "./p5ReliefSketch";

type Listener = (event: Record<string, unknown>) => void;

class FakeEventTarget {
  readonly listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  fire(type: string, event: Record<string, unknown> = {}): void {
    if (!("target" in event)) event.target = this;
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakeElement extends FakeEventTarget {
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly classList = { add: vi.fn() };
  hidden = false;
  tabIndex = 0;
  className = "";
  textContent: string | null = null;
  removed = false;

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  remove(): void {
    this.removed = true;
  }

  matches(): boolean {
    return false;
  }

  closest(): null {
    return null;
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: 320, height: 240 };
  }
}

class FakeCanvas extends FakeElement {
  readonly captures = new Set<number>();
  readonly released: number[] = [];
  readonly focus = vi.fn();

  getContext(): Record<string, never> {
    return {};
  }

  setPointerCapture(pointerId: number): void {
    this.captures.add(pointerId);
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.captures.has(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    if (!this.captures.delete(pointerId)) return;
    this.released.push(pointerId);
  }
}

class FakeDocument extends FakeEventTarget {
  visibilityState = "visible";

  createElement(tagName: string): FakeElement {
    return tagName === "canvas" ? new FakeCanvas() : new FakeElement();
  }

  querySelector(): null {
    return null;
  }
}

class FakeWindow extends FakeEventTarget {
  readonly innerWidth = 320;
  readonly innerHeight = 240;
  readonly devicePixelRatio = 1;

  matchMedia(): {
    matches: boolean;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  } {
    return {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  }
}

class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

function view(
  spatialEpoch: TideweftView["spatialEpoch"],
  position: { readonly x: number; readonly y: number },
): TideweftView {
  return {
    revision: 0,
    ...(spatialEpoch === undefined ? {} : { spatialEpoch }),
    tick: 0,
    terrain: {
      columns: 4,
      rows: 4,
      tileSize: 24,
      origin: { x: 0, y: 0 },
      revision: "same-local-terrain-revision",
      tiles: Array.from({ length: 16 }, () => ({
        kind: "meadow" as const,
        elevation: 0.2,
        discovered: 1,
      })),
    },
    tide: {
      phase: "low",
      level: 0,
      progress: 0,
      surfaceCurrent: { x: 0, y: 0 },
    },
    weather: {
      kind: "clear",
      intensity: 0,
      wind: { x: 0, y: 0 },
    },
    settlements: [],
    player: {
      position,
      velocity: { x: 0, y: 0 },
      facing: 0,
      stamina: 1,
      stability: 1,
      scanCharge: 1,
      cargoLoad: 0,
      cargoCapacity: 8,
      cargo: [],
      pace: "steady",
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
    camera: {
      center: position,
      zoom: 1,
      followPlayer: true,
      bounds: { minX: 0, minY: 0, maxX: 96, maxY: 96 },
    },
  };
}

function warmWaterView(spatialEpoch = "warm-water"): TideweftView {
  const base = view(spatialEpoch, { x: 48, y: 48 });
  return {
    ...base,
    terrain: {
      ...base.terrain,
      revision: "warm-biome-water",
      tiles: base.terrain.tiles.map((_, index) => ({
        kind: index % 3 === 0
          ? "shallows" as const
          : index % 3 === 1
            ? "channel" as const
            : "deep-water" as const,
        biome: index % 2 === 0 ? "sun-meadow" as const : "brine-flat" as const,
        climate: {
          rainfall: 1,
          heat: 1,
          salinity: 1,
          exposure: 1,
          magicalWater: 1,
        },
        elevation: 0.08,
        waterDepth: index % 3 === 0 ? 0.2 : index % 3 === 1 ? 0.5 : 0.9,
        discovered: 1,
        currentVisibility: 1,
        currentDetailVisibility: 1 as const,
      })),
    },
    tide: { ...base.tide, level: 0.9 },
  };
}

function pointer(
  canvas: FakeCanvas,
  changes: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
    clientX: 160,
    clientY: 120,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    target: canvas,
    ...changes,
  };
}

function renderHarness(initial: TideweftView) {
  const mount = new FakeElement();
  const canvas = new FakeCanvas();
  const documentTarget = new FakeDocument();
  const windowTarget = new FakeWindow();
  vi.stubGlobal("Element", FakeElement);
  vi.stubGlobal("document", documentTarget);
  vi.stubGlobal("window", windowTarget);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  p5Harness.canvasFactory = () => canvas;
  let current = initial;
  const dispatch = vi.fn();
  const renderer = createTideweftReliefRenderer({
    mount: mount as unknown as HTMLElement,
    getView: () => current,
    dispatch,
  });
  const instance = p5Harness.instances.at(-1);
  if (!instance) throw new Error("Relief p5 harness did not create an instance");
  const draw = instance.draw as (() => void) | undefined;
  const camera = instance.camera as ReturnType<typeof vi.fn>;
  if (!draw || !camera) throw new Error("Relief p5 harness is missing draw/camera hooks");
  return {
    canvas,
    dispatch,
    draw,
    camera,
    instance,
    mount,
    renderer,
    setView: (next: TideweftView) => { current = next; },
  };
}

beforeEach(() => {
  p5Harness.canvasFactory = null;
  p5Harness.instances.length = 0;
  p5Harness.projectionShiftX = 0;
  p5Harness.overlayProjection = { xx: 1, xy: 0, yx: 0, yy: 1 };
  p5Harness.materialTrace.length = 0;
  p5Harness.initialDepthWriteEnabled = false;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Relief spatial epoch release gate", () => {
  it("binds the same terrain color to diffuse fill and ambient reflection", () => {
    const harness = renderHarness(view("r:0:0", { x: 8, y: 8 }));
    const fill = harness.instance.fill as ReturnType<typeof vi.fn>;
    const ambientMaterial = harness.instance.ambientMaterial as ReturnType<typeof vi.fn>;
    harness.draw();

    expect(ambientMaterial).toHaveBeenCalled();
    expect(fill.mock.calls.some(([fillColor]) =>
      ambientMaterial.mock.calls.some(([ambientColor]) => ambientColor === fillColor)
    )).toBe(true);
    harness.renderer.destroy();
  });

  it("initializes quietly, preserves an unchanged epoch, and accepts legacy epoch transitions", () => {
    const harness = renderHarness(view(undefined, { x: 8, y: 8 }));
    harness.draw();

    const firstPress = pointer(harness.canvas, { pointerId: 1 });
    harness.canvas.fire("pointerdown", firstPress);
    harness.setView(view("r:-9007199254740991:9007199254740991", { x: 8, y: 8 }));
    harness.canvas.fire("pointerup", pointer(harness.canvas, { pointerId: 1 }));
    expect(harness.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "move-target" }));

    harness.dispatch.mockClear();
    harness.canvas.fire("pointerdown", pointer(harness.canvas, { pointerId: 2 }));
    harness.canvas.fire("pointerup", pointer(harness.canvas, { pointerId: 2 }));
    expect(harness.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "move-target" }));

    harness.dispatch.mockClear();
    harness.canvas.fire("pointerdown", pointer(harness.canvas, { pointerId: 3 }));
    harness.setView(view(undefined, { x: 8, y: 8 }));
    harness.canvas.fire("pointerup", pointer(harness.canvas, { pointerId: 3 }));
    expect(harness.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "move-target" }));
    harness.renderer.destroy();
  });

  it("rebuilds durable and perception geometry when a new region reuses the same local revision", () => {
    const perceivedRegion = (spatialEpoch: string, elevation: number): TideweftView => {
      const base = view(spatialEpoch, { x: 48, y: 48 });
      return {
        ...base,
        perception: {
          version: 3,
          signature: "same-local-mask",
          valid: true,
          visibleTileCount: 16,
          directTileCount: 16,
          peripheralTileCount: 0,
        },
        terrain: {
          ...base.terrain,
          revision: "same-local-terrain-revision",
          tiles: base.terrain.tiles.map((tile) => ({
            ...tile,
            elevation,
            currentVisibility: 1,
            currentDetailVisibility: 1 as const,
          })),
        },
      };
    };

    const harness = renderHarness(perceivedRegion("r:0:0", 0.2));
    const vertex = harness.instance.vertex as ReturnType<typeof vi.fn>;
    harness.draw();
    expect(vertex.mock.calls.length).toBeGreaterThan(0);
    expect(Math.min(...vertex.mock.calls.map((call) => Number(call[1])))).toBeGreaterThan(-20);

    vertex.mockClear();
    harness.setView(perceivedRegion("r:1:0", 0.8));
    harness.draw();
    const transitionedHeights = vertex.mock.calls.map((call) => Number(call[1]));
    expect(transitionedHeights.length).toBeGreaterThan(0);
    // Both the durable terrain and its transient perception overlay must come
    // from the new region. A stale overlay would leave vertices near -14 here.
    expect(Math.max(...transitionedHeights)).toBeLessThan(-40);
    harness.renderer.destroy();
  });

  it("snaps across rapid opaque epochs and suppresses a stale desktop pointerup", () => {
    const harness = renderHarness(view("r:0:0", { x: 8, y: 12 }));
    harness.draw();
    expect(harness.camera).toHaveBeenLastCalledWith(
      expect.any(Number), expect.any(Number), expect.any(Number),
      8, expect.any(Number), 12,
      expect.any(Number), expect.any(Number), expect.any(Number),
    );

    harness.canvas.fire("pointerdown", pointer(harness.canvas, { pointerId: 11 }));
    harness.setView(view("r:-1:0", { x: 88, y: 76 }));
    harness.canvas.fire("pointerup", pointer(harness.canvas, { pointerId: 11 }));
    expect(harness.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "move-target" }));

    harness.draw();
    expect(harness.camera).toHaveBeenLastCalledWith(
      expect.any(Number), expect.any(Number), expect.any(Number),
      88, expect.any(Number), 76,
      expect.any(Number), expect.any(Number), expect.any(Number),
    );
    harness.setView(view("r:9007199254740991:-9007199254740991", { x: 4, y: 92 }));
    harness.draw();
    expect(harness.camera.mock.calls.at(-1)?.[3]).toBe(4);
    expect(harness.camera.mock.calls.at(-1)?.[5]).toBe(92);
    const centered = view("r:2:-3", { x: 4, y: 92 });
    harness.setView({
      ...centered,
      camera: {
        ...centered.camera,
        center: { x: 44, y: 52 },
        followPlayer: false,
      },
    });
    harness.draw();
    expect(harness.camera.mock.calls.at(-1)?.[3]).toBe(44);
    expect(harness.camera.mock.calls.at(-1)?.[5]).toBe(52);
    harness.renderer.destroy();
  });

  it("releases touch/orbit capture, cancels gestures, and never leaves a ghost tap stuck", () => {
    const harness = renderHarness(view("r:0:0", { x: 8, y: 8 }));
    harness.draw();
    harness.canvas.fire("pointerdown", pointer(harness.canvas, {
      pointerId: 21,
      pointerType: "touch",
    }));
    harness.canvas.fire("pointerdown", pointer(harness.canvas, {
      pointerId: 22,
      pointerType: "touch",
      clientX: 220,
    }));
    expect(harness.canvas.captures).toEqual(new Set([21, 22]));

    harness.setView(view("r:1:0", { x: 88, y: 88 }));
    harness.draw();
    expect(harness.canvas.captures.size).toBe(0);
    expect(harness.canvas.released).toEqual(expect.arrayContaining([21, 22]));
    harness.canvas.fire("pointerup", pointer(harness.canvas, {
      pointerId: 21,
      pointerType: "touch",
    }));
    harness.canvas.fire("pointercancel", pointer(harness.canvas, {
      pointerId: 22,
      pointerType: "touch",
    }));
    expect(harness.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "move-target" }));

    harness.canvas.fire("pointerdown", pointer(harness.canvas, {
      pointerId: 23,
      pointerType: "touch",
    }));
    harness.canvas.fire("pointerup", pointer(harness.canvas, {
      pointerId: 23,
      pointerType: "touch",
    }));
    expect(harness.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "move-target" }));

    harness.dispatch.mockClear();
    harness.canvas.fire("pointerdown", pointer(harness.canvas, { pointerId: 31, button: 2 }));
    expect(harness.canvas.captures.has(31)).toBe(true);
    harness.setView(view("r:0:0", { x: 8, y: 8 }));
    harness.draw();
    expect(harness.canvas.captures.has(31)).toBe(false);
    harness.canvas.fire("pointerup", pointer(harness.canvas, { pointerId: 31, button: 2 }));
    expect(harness.dispatch).not.toHaveBeenCalledWith({ type: "cancel" });

    harness.canvas.fire("pointerdown", pointer(harness.canvas, { pointerId: 32, button: 2 }));
    harness.setView(view("r:3:0", { x: 24, y: 68 }));
    const contextMenu = { preventDefault: vi.fn(), target: harness.canvas };
    harness.canvas.fire("contextmenu", contextMenu);
    expect(contextMenu.preventDefault).toHaveBeenCalledOnce();
    expect(harness.canvas.captures.has(32)).toBe(false);
    harness.canvas.fire("pointerup", pointer(harness.canvas, { pointerId: 32, button: 2 }));
    expect(harness.dispatch).not.toHaveBeenCalledWith({ type: "cancel" });

    harness.canvas.fire("pointerdown", pointer(harness.canvas, { pointerId: 41 }));
    harness.setView(view("r:-2:4", { x: 72, y: 20 }));
    harness.canvas.fire("blur");
    harness.canvas.fire("pointerup", pointer(harness.canvas, { pointerId: 41 }));
    expect(harness.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "move-target" }));
    expect(harness.dispatch).toHaveBeenCalledWith({
      type: "movement",
      vector: { x: 0, y: 0 },
    });
    harness.draw();
    expect(harness.camera.mock.calls.at(-1)?.[3]).toBe(72);
    expect(harness.camera.mock.calls.at(-1)?.[5]).toBe(20);
    harness.renderer.destroy();
  });

  it("snaps to the latest epoch after Relief was inactive across multiple crossings", () => {
    const harness = renderHarness(view("r:0:0", { x: 8, y: 8 }));
    harness.draw();
    harness.canvas.fire("pointerdown", pointer(harness.canvas, {
      pointerId: 61,
      pointerType: "touch",
    }));
    harness.renderer.setActive(false);
    expect(harness.dispatch).toHaveBeenCalledWith({
      type: "movement",
      vector: { x: 0, y: 0 },
    });
    harness.setView(view("r:6:-2", { x: 84, y: 24 }));
    harness.setView(view("r:-9:11", { x: 16, y: 80 }));
    harness.renderer.setActive(true);
    harness.canvas.fire("pointerup", pointer(harness.canvas, {
      pointerId: 61,
      pointerType: "touch",
    }));
    expect(harness.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "move-target" }));
    harness.draw();
    expect(harness.camera.mock.calls.at(-1)?.[3]).toBe(16);
    expect(harness.camera.mock.calls.at(-1)?.[5]).toBe(80);
    harness.renderer.destroy();
  });
});

describe("Relief weather production path", () => {
  it("draws bounded dual-contrast rain from the live view and draws none when dry", () => {
    const dry = view("r:0:0", { x: 8, y: 8 });
    const harness = renderHarness(dry);
    const line = harness.instance.line as ReturnType<typeof vi.fn>;
    const ortho = harness.instance.ortho as ReturnType<typeof vi.fn>;
    const drawingContext = harness.instance.drawingContext as {
      depthMask: ReturnType<typeof vi.fn>;
      disable: ReturnType<typeof vi.fn>;
      enable: ReturnType<typeof vi.fn>;
    };

    harness.draw();
    const dryLineCount = line.mock.calls.length;
    line.mockClear();

    harness.setView({
      ...dry,
      weather: {
        kind: "rain",
        intensity: 0.75,
        wind: { x: -0.8, y: 0.25 },
      },
    });
    harness.renderer.setOrbit(Math.PI, Math.PI * 0.29);
    harness.draw();
    // 320x240 uses the 52-mark mobile budget. At 0.75 rain this is 37
    // transient streaks, each keyed dark and faced pale.
    expect(line.mock.calls.length - dryLineCount).toBe(37 * 2);
    const firstRainLine = line.mock.calls.at(-37 * 2);
    expect(Number(firstRainLine?.[3]) - Number(firstRainLine?.[0])).toBeGreaterThan(0);
    expect(Number(firstRainLine?.[4]) - Number(firstRainLine?.[1])).toBeGreaterThan(0);
    expect(ortho).toHaveBeenLastCalledWith(-160, 160, -120, 120, 0, 2);
    expect(drawingContext.disable).toHaveBeenCalledWith(0x0b71);
    expect(drawingContext.depthMask).toHaveBeenCalledWith(false);
    expect(drawingContext.depthMask).toHaveBeenLastCalledWith(false);
    expect(drawingContext.enable).toHaveBeenCalledWith(0x0b71);

    line.mockClear();
    harness.setView(dry);
    harness.draw();
    expect(line).toHaveBeenCalledTimes(dryLineCount);
    harness.renderer.destroy();
  });

  it("keeps rain moving downward after the final WEBGL camera projection", () => {
    let now = 0;
    vi.stubGlobal("performance", { now: () => now });
    // Exercise the release-blocking case explicitly: local +y projects upward,
    // with a little camera-axis shear. A model-space `dy > 0` assertion would
    // fail to prove (or fix) the direction visible on the final canvas.
    p5Harness.overlayProjection = {
      xx: 1.15,
      xy: 0.08,
      yx: 0.12,
      yy: -0.9,
    };
    const base = view("rain-projection", { x: 8, y: 8 });
    const rainy: TideweftView = {
      ...base,
      weather: {
        kind: "rain",
        intensity: 0.75,
        wind: { x: -0.8, y: 0.25 },
      },
    };
    const harness = renderHarness(rainy);
    harness.renderer.setOrbit(Math.PI, Math.PI * 0.29);
    const line = harness.instance.line as ReturnType<typeof vi.fn>;

    harness.draw();
    const firstFrameRain = line.mock.calls.slice(-37 * 2);
    const firstStroke = firstFrameRain[0];
    if (!firstStroke) throw new Error("expected projected rain stroke");
    const firstStart = projectOverlayLocalToScreen(
      Number(firstStroke[0]),
      Number(firstStroke[1]),
    );
    const firstEnd = projectOverlayLocalToScreen(
      Number(firstStroke[3]),
      Number(firstStroke[4]),
    );
    expect(firstEnd.y).toBeGreaterThan(firstStart.y);

    line.mockClear();
    now = 16;
    harness.draw();
    const nextFrameRain = line.mock.calls.slice(-37 * 2);
    const nextStroke = nextFrameRain[0];
    if (!nextStroke) throw new Error("expected next projected rain stroke");
    const nextStart = projectOverlayLocalToScreen(
      Number(nextStroke[0]),
      Number(nextStroke[1]),
    );
    expect(nextStart.y).toBeGreaterThan(firstStart.y);
    harness.renderer.destroy();
  });

  it("draws yaw-aware wind threads in clear weather and none when calm", () => {
    const calm = view("r:0:0", { x: 8, y: 8 });
    const windy: TideweftView = {
      ...calm,
      weather: { kind: "clear", intensity: 0, wind: { x: 0.7, y: 0.15 } },
    };
    const harness = renderHarness(windy);
    harness.renderer.setOrbit(Math.PI / 2, Math.PI * 0.29);
    harness.draw();
    const bezier = harness.instance.bezier as ReturnType<typeof vi.fn>;
    expect(bezier.mock.calls.length).toBeGreaterThan(0);
    expect(bezier.mock.calls.length).toBeLessThanOrEqual(16);
    const first = bezier.mock.calls[0];
    expect(Number(first?.[7]) - Number(first?.[1])).toBeGreaterThan(0);

    bezier.mockClear();
    harness.setView(calm);
    harness.draw();
    expect(bezier).not.toHaveBeenCalled();
    expect(harness.dispatch).not.toHaveBeenCalled();
    harness.renderer.destroy();
  });
});

describe("Relief presentation-only pointer and label motion", () => {
  it("eases mouse parallax into the camera, recenters on leave, and keeps touch inert", () => {
    let now = 0;
    vi.stubGlobal("performance", { now: () => now });
    const initial = view("r:0:0", { x: 48, y: 48 });
    const harness = renderHarness(initial);
    harness.draw();
    const baseline = harness.camera.mock.calls.at(-1);
    harness.camera.mockClear();

    harness.canvas.fire("pointermove", pointer(harness.canvas, {
      clientX: 320,
      clientY: 240,
      pointerType: "mouse",
    }));
    now = 120;
    harness.draw();
    const drifted = harness.camera.mock.calls.at(-1);
    expect(drifted?.[3]).not.toBeCloseTo(Number(baseline?.[3]), 6);
    expect(drifted?.[5]).not.toBeCloseTo(Number(baseline?.[5]), 6);
    expect(harness.dispatch).not.toHaveBeenCalled();

    harness.canvas.fire("pointerleave");
    harness.camera.mockClear();
    now = 240;
    harness.draw();
    const returning = harness.camera.mock.calls.at(-1);
    expect(Math.abs(Number(returning?.[3]) - Number(baseline?.[3])))
      .toBeLessThan(Math.abs(Number(drifted?.[3]) - Number(baseline?.[3])));

    harness.canvas.fire("pointermove", pointer(harness.canvas, {
      clientX: 320,
      clientY: 240,
      pointerType: "touch",
    }));
    harness.camera.mockClear();
    now = 360;
    harness.draw();
    const touch = harness.camera.mock.calls.at(-1);
    expect(touch?.[3]).toBeCloseTo(Number(baseline?.[3]), 8);
    expect(touch?.[5]).toBeCloseTo(Number(baseline?.[5]), 8);

    harness.canvas.fire("pointermove", pointer(harness.canvas, {
      clientX: 320,
      clientY: 240,
      pointerType: "mouse",
    }));
    harness.setView(view("r:1:0", { x: 80, y: 72 }));
    harness.camera.mockClear();
    now = 480;
    harness.draw();
    const recentered = harness.camera.mock.calls.at(-1);
    expect(recentered?.[3]).toBeCloseTo(80, 8);
    expect(recentered?.[5]).toBeCloseTo(72, 8);

    harness.renderer.setActive(false);
    expect(harness.instance.noLoop).toHaveBeenCalled();
    harness.renderer.destroy();
    expect(harness.canvas.listeners.get("pointermove")?.size ?? 0).toBe(0);
  });

  it("eases projected DOM labels, removes stale state, and snaps reintroduced labels", () => {
    let now = 0;
    vi.stubGlobal("performance", { now: () => now });
    const base = view("r:0:0", { x: 48, y: 48 });
    const settlement = {
      id: "harbor-label",
      name: "Harbor Label",
      position: { x: 48, y: 48 },
      population: 20,
      status: "steady" as const,
      connection: 1,
      stress: 0,
      discovered: true,
    };
    let current: TideweftView = { ...base, settlements: [settlement] };
    const harness = renderHarness(current);
    harness.draw();
    const layer = harness.mount.children.find((child) => child.className === "relief-label-layer");
    const first = layer?.children.find((child) => child.textContent === "Harbor Label");
    if (!first) throw new Error("expected Relief label");
    const initialLeft = Number.parseFloat(String(first.style.left));

    p5Harness.projectionShiftX = 100;
    now = 16;
    harness.draw();
    const easedLeft = Number.parseFloat(String(first.style.left));
    expect(easedLeft).toBeGreaterThan(initialLeft);
    expect(easedLeft).toBeCloseTo(231.2, 1);

    current = { ...base, settlements: [] };
    harness.setView(current);
    now = 32;
    harness.draw();
    expect(first.removed).toBe(true);

    p5Harness.projectionShiftX = 150;
    current = { ...base, settlements: [settlement] };
    harness.setView(current);
    now = 48;
    harness.draw();
    const replacement = [...(layer?.children ?? [])].reverse().find(
      (child: FakeElement) => child.textContent === "Harbor Label" && !child.removed,
    );
    if (!replacement) throw new Error("expected replacement Relief label");
    expect(Number.parseFloat(String(replacement.style.left))).toBeCloseTo(231.2, 1);
    harness.renderer.destroy();
  });
});

describe("Relief water camera invariant", () => {
  it("keeps water blue while facing the river at every yaw and zoom bound in every weather", () => {
    const waterView = warmWaterView("water-camera-invariant");
    const harness = renderHarness(waterView);
    const zooms = [MIN_RELIEF_MANUAL_ZOOM, 1, MAX_RELIEF_MANUAL_ZOOM] as const;
    const yaws = [-Math.PI, -Math.PI / 2, 0, Math.PI / 2, Math.PI] as const;
    const weather: readonly WeatherView[] = [
      { kind: "clear", intensity: 0, wind: { x: 0, y: 0 } },
      { kind: "mist", intensity: 1, visibility: 0.2, wind: { x: 0.2, y: 0.1 } },
      { kind: "drizzle", intensity: 1, wind: { x: -0.4, y: 0.2 } },
      { kind: "rain", intensity: 1, wind: { x: 0.7, y: 0.4 } },
      { kind: "squall", intensity: 1, wind: { x: 1, y: -1 } },
      { kind: "aurora", intensity: 1, wind: { x: -0.1, y: 0.3 } },
    ];

    for (const currentWeather of weather) {
      harness.setView({ ...waterView, weather: currentWeather });
      for (const zoom of zooms) {
        harness.renderer.focusWorld(waterView.player.position, zoom);
        for (const yaw of yaws) {
          p5Harness.materialTrace.length = 0;
          harness.renderer.setOrbit(yaw, Math.PI * 0.29);
          harness.draw();
          const waterSteps = p5Harness.materialTrace.flatMap((entry, index) => {
            const ambient = p5Harness.materialTrace[index + 1];
            const emissive = p5Harness.materialTrace[index + 2];
            return entry.method === "fill"
              && entry.args.join(",") === "0,0,0,255"
              && ambient?.method === "ambientMaterial"
              && ambient.args.join(",") === "0,0,0"
              && emissive?.method === "emissiveMaterial"
              && typeof emissive.args[0] === "string"
              ? [{ index, color: emissive.args[0] }]
              : [];
          });
          expect(waterSteps.length, `${currentWeather.kind}, zoom ${zoom}, yaw ${yaw}`)
            .toBeGreaterThan(0);
          for (const { color: waterColor } of waterSteps) {
            const red = Number.parseInt(waterColor.slice(1, 3), 16);
            const green = Number.parseInt(waterColor.slice(3, 5), 16);
            const blue = Number.parseInt(waterColor.slice(5, 7), 16);
            expect(blue - green, `${currentWeather.kind}, zoom ${zoom}, yaw ${yaw}: ${waterColor}`)
              .toBeGreaterThanOrEqual(14);
            expect(green - red, `${currentWeather.kind}, zoom ${zoom}, yaw ${yaw}: ${waterColor}`)
              .toBeGreaterThanOrEqual(12);
          }
          const lastWater = waterSteps.at(-1);
          expect(p5Harness.materialTrace[lastWater!.index + 3]).toEqual({
            method: "emissiveMaterial",
            args: [0, 0, 0],
          });
        }
      }
    }
    harness.renderer.destroy();
  });

  it("writes opaque water depth and restores either prior depth-write state", () => {
    for (const initialDepthWriteEnabled of [false, true]) {
      p5Harness.initialDepthWriteEnabled = initialDepthWriteEnabled;
      const harness = renderHarness(warmWaterView(`water-depth-${initialDepthWriteEnabled}`));
      const drawingContext = harness.instance.drawingContext as {
        DEPTH_WRITEMASK: number;
        depthMask: ReturnType<typeof vi.fn>;
        getParameter: ReturnType<typeof vi.fn>;
      };
      drawingContext.depthMask.mockClear();
      drawingContext.getParameter.mockClear();
      harness.draw();

      expect(drawingContext.getParameter).toHaveBeenCalledWith(
        drawingContext.DEPTH_WRITEMASK,
      );
      expect(drawingContext.depthMask.mock.calls[0]).toEqual([true]);
      expect(drawingContext.depthMask.mock.calls.at(-1)).toEqual([
        initialDepthWriteEnabled,
      ]);
      harness.renderer.destroy();
    }
  });
});

describe("Relief ADRIFT presentation path", () => {
  it("keeps the ADRIFT DOM label visually panel-free", () => {
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    const rule = styles.match(/\.relief-world-label\[data-tone="adrift"\]\s*\{([^}]*)\}/u)?.[1];
    expect(rule).toBeDefined();
    expect(rule).toMatch(/padding:\s*0\s*;/u);
    expect(rule).toMatch(/background:\s*transparent\s*;/u);
    expect(rule).toMatch(/border:\s*0\s*;/u);
    expect(rule).toMatch(/box-shadow:\s*none\s*;/u);
  });

  it("renders truthful bounded floating and paddle facts, then removes optional state cleanly", () => {
    vi.stubGlobal("performance", { now: () => 0 });
    const base = view("adrift-relief", { x: 48, y: 48 });
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
    const harness = renderHarness(legacySwept);
    const line = harness.instance.line as ReturnType<typeof vi.fn>;
    const stroke = harness.instance.stroke as ReturnType<typeof vi.fn>;
    const emissiveMaterial = harness.instance.emissiveMaterial as ReturnType<typeof vi.fn>;
    harness.draw();
    const legacyLineCount = line.mock.calls.length;
    const layer = harness.mount.children.find((child) => child.className === "relief-label-layer");
    expect(layer?.children.some((child) => child.dataset.tone === "adrift" && !child.removed))
      .toBe(false);

    line.mockClear();
    stroke.mockClear();
    emissiveMaterial.mockClear();
    const floating: TideweftView = {
      ...legacySwept,
      player: {
        ...legacySwept.player,
        adrift: {
          paddling: false,
          catchingBreath: false,
          canStand: false,
          waterDepth: 0.78,
          currentDirection: { x: 1, y: 0 },
        },
      },
    };
    harness.setView(floating);
    harness.draw();
    const floatingLabel = layer?.children.find((child) =>
      child.textContent === "ADRIFT · STEER ACROSS THE CURRENT" && !child.removed);
    if (!floatingLabel) throw new Error("expected floating ADRIFT label");
    expect(floatingLabel.className).toBe("relief-world-label");
    expect(floatingLabel.dataset).toMatchObject({ tone: "adrift", selected: "true" });
    // The adrift label uses a 76vw maximum width, so its complete instruction
    // is clamped as a wider envelope than ordinary world labels.
    expect(Number.parseFloat(floatingLabel.style.left ?? "NaN")).toBeGreaterThanOrEqual(133.6);
    expect(Number.parseFloat(floatingLabel.style.left ?? "NaN")).toBeLessThanOrEqual(186.4);
    expect(Number.parseFloat(floatingLabel.style.top ?? "NaN")).toBeGreaterThanOrEqual(62);
    expect(Number.parseFloat(floatingLabel.style.top ?? "NaN")).toBeLessThanOrEqual(206);
    expect(emissiveMaterial).toHaveBeenCalledWith("#55c7dc");
    expect(stroke.mock.calls.some(([value]) =>
      value === "#e5fbff"
        || (value as { value?: unknown } | undefined)?.value === "#e5fbff"
    )).toBe(true);
    expect(line).toHaveBeenCalledTimes(legacyLineCount);

    line.mockClear();
    stroke.mockClear();
    emissiveMaterial.mockClear();
    harness.setView({
      ...floating,
      player: {
        ...floating.player,
        adrift: { ...floating.player.adrift!, paddling: true },
      },
    });
    harness.draw();
    const paddleLabel = layer?.children.find((child) =>
      child.textContent === "PADDLING · PADDLE TOWARD SHALLOW WATER" && !child.removed);
    if (!paddleLabel) throw new Error("expected paddling ADRIFT label");
    const renderedCopy = layer?.children
      .filter((child) => !child.removed)
      .map((child) => child.textContent ?? "")
      .join(" ") ?? "";
    expect(renderedCopy).not.toMatch(/ashore|arrived|\bETA\b|\d+(?:\.\d+)?\s*%|percent/iu);
    expect(emissiveMaterial).toHaveBeenCalledWith("#61e6d2");
    expect(stroke.mock.calls.some(([value]) =>
      value === "#edfff9"
        || (value as { value?: unknown } | undefined)?.value === "#edfff9"
    )).toBe(true);
    expect(line).toHaveBeenCalledTimes(legacyLineCount + 1);
    expect(line).toHaveBeenCalledWith(0, 0, 0, 11.52, 3.84, 5.76);

    harness.setView(legacySwept);
    harness.draw();
    expect(paddleLabel.removed).toBe(true);
    expect(layer?.children.some((child) => child.dataset.tone === "adrift" && !child.removed))
      .toBe(false);
    harness.renderer.destroy();
  });
});

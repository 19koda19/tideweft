import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TideweftView } from "./types";

const p5Harness = vi.hoisted(() => ({
  canvasFactory: null as null | (() => unknown),
  instances: [] as Array<Record<string, unknown>>,
  projectionShiftX: 0,
}));

vi.mock("p5", () => {
  class FakeP5 {
    constructor(sketch: (instance: Record<string, unknown>) => void) {
      const camera = vi.fn();
      const methods = new Map<PropertyKey, ReturnType<typeof vi.fn>>();
      const color = (value: unknown) => ({
        value,
        setAlpha: vi.fn(),
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
          depthMask: vi.fn(),
          getParameter: vi.fn(() => false),
          isEnabled: vi.fn(() => true),
          disable: vi.fn(),
          enable: vi.fn(),
        },
        camera,
        color,
        lerpColor: (_left: unknown, right: unknown) => right,
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

import { createTideweftReliefRenderer } from "./p5ReliefSketch";

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
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Relief spatial epoch release gate", () => {
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
    expect(easedLeft).toBeGreaterThan(initialLeft + 88);
    expect(easedLeft).toBeLessThan(initialLeft + 100);

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
    expect(Number.parseFloat(String(replacement.style.left))).toBeCloseTo(initialLeft + 150, 1);
    harness.renderer.destroy();
  });
});

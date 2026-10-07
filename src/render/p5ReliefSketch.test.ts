import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AcousticTextView,
  AggregateWildlifeEvidenceView,
  DogView,
  FieldResourceNodeView,
  LooseCargoView,
  TideweftView,
  WeatherView,
  WildlifeCarcassView,
  WildlifeView,
} from "./types";
import { RELIEF_ATMOSPHERE_BAND_COUNT } from "./reliefAtmosphere";
import { outdoorIlluminationPresentation } from "./outdoorIllumination";
import type { WildlifeVisualSpecies } from "./wildlifeVisualProfile";
import * as playerPresentation from "./playerPresentation";
import * as reliefCamera from "./reliefCamera";
import { discoveredReliefSurfaceHeightAt, perceivedReliefSurfaceHeightAt } from "./reliefTerrain";
import { buildSurfaceCurrentCues } from "./currentCues";
import { reliefTerrainDecorationHash01 } from "./terrainDecoration";
import {
  BIOME_PRESENTATION,
  biomeEnvironmentalEmphasis,
  biomePresentationVisibility,
  visibleBiomePresentation,
} from "./biomePresentation";
import { currentTerrainDetailVisibility } from "./perceptionPresentation";
import {
  acousticTextRectsOverlap,
  DEFAULT_ACOUSTIC_TEXT_GUTTER,
  MAX_ACOUSTIC_TEXT_PLACEMENTS,
  type AcousticTextRect,
} from "./acousticTextLayout";

export const ALPHA31_PREDATOR_PRESENTATION_OWNER_INTENT =
  "test:alpha31-predator-presentation-invariants:v1" as const;
export const ALPHA33_ALPINE_PRESENTATION_INVARIANTS_OWNER_INTENT =
  "test:alpha33-alpine-presentation-invariants:v1" as const;
export const ALPHA34_POLAR_PRESENTATION_INVARIANTS_OWNER_INTENT =
  "test:alpha34-polar-presentation-invariants:v1" as const;
export const ALPHA37_ESTUARY_BREADTH_PRESENTATION_INVARIANTS_OWNER_INTENT =
  "test:alpha37-estuary-breadth-presentation-invariants:v1" as const;

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
  reducedMotion: false,
  perceptionShaderSupported: false,
  perceptionShaderThrowsAfterBind: false,
  perceptionShaderHooks: [] as object[],
  waterShaderSupported: false,
  waterShaderThrowsAfterBind: false,
  waterShaderHooks: [] as object[],
  waterShaderUniforms: [] as Array<{ readonly name: string; readonly value: unknown }>,
  friendlyErrorsDisabled: false,
  viewport: null as null | { readonly width: number; readonly height: number },
}));

function projectOverlayLocalToScreen(x: number, y: number): { readonly x: number; readonly y: number } {
  const basis = p5Harness.overlayProjection;
  return {
    x: (p5Harness.viewport?.width ?? 320) / 2 + x * basis.xx + y * basis.yx,
    y: (p5Harness.viewport?.height ?? 240) / 2 + x * basis.xy + y * basis.yy,
  };
}

vi.mock("p5", () => {
  class FakeP5 {
    static get disableFriendlyErrors(): boolean {
      return p5Harness.friendlyErrorsDisabled;
    }

    static set disableFriendlyErrors(disabled: boolean) {
      p5Harness.friendlyErrorsDisabled = disabled;
    }

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
      let geometryOrdinal = 0;
      const vertex = vi.fn();
      const modifiedPerceptionShader = { kind: "fake-perception-shader" };
      const modifiedWaterShader = { kind: "fake-water-shader", setUniform: vi.fn(
        (name: string, value: unknown) => p5Harness.waterShaderUniforms.push({ name, value }),
      ) };
      const target: Record<PropertyKey, unknown> = {
        width: p5Harness.viewport?.width ?? 320,
        height: p5Harness.viewport?.height ?? 240,
        WEBGL: "webgl",
        TRIANGLES: "triangles",
        LINES: "lines",
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
        createCanvas: vi.fn((width: number, height: number) => {
          target.width = width;
          target.height = height;
          return { elt: p5Harness.canvasFactory?.() };
        }),
        resizeCanvas: vi.fn((width: number, height: number) => {
          target.width = width;
          target.height = height;
        }),
        noLoop: vi.fn(),
        loop: vi.fn(),
        buildGeometry: vi.fn((callback: () => void) => {
          const vertexCountBefore = vertex.mock.calls.length;
          callback();
          geometryOrdinal += 1;
          return {
            gid: `fake-relief-geometry-${geometryOrdinal}`,
            vertices: Array.from(
              { length: vertex.mock.calls.length - vertexCountBefore },
              () => ({}),
            ),
            faces: Array.from(
              { length: (vertex.mock.calls.length - vertexCountBefore) / 3 },
              (_value, faceIndex) => [faceIndex * 3, faceIndex * 3 + 1, faceIndex * 3 + 2],
            ),
            uvs: [] as number[],
            clearColors: vi.fn(),
          };
        }),
        baseMaterialShader: vi.fn(() => {
          if (!p5Harness.perceptionShaderSupported && !p5Harness.waterShaderSupported) return undefined;
          return {
            modify: vi.fn((hooks: object) => {
              if ("Vertex getObjectInputs" in hooks) {
                p5Harness.waterShaderHooks.push(hooks);
                if (!p5Harness.waterShaderSupported) throw new Error("unsupported synthetic water shader");
                p5Harness.friendlyErrorsDisabled = false;
                return modifiedWaterShader;
              }
              if (!p5Harness.perceptionShaderSupported) throw new Error("unsupported synthetic perception shader");
              p5Harness.perceptionShaderHooks.push(hooks);
              // Reproduce the pinned library's object-modifier cleanup, which
              // restores its module-load flag rather than the caller's policy.
              p5Harness.friendlyErrorsDisabled = false;
              return modifiedPerceptionShader;
            }),
          };
        }),
        shader: vi.fn((value: { readonly kind: string }) => {
          if (value.kind === "fake-water-shader") {
            if (p5Harness.waterShaderThrowsAfterBind) throw new Error("synthetic water shader failure after bind");
            return;
          }
          if (p5Harness.perceptionShaderThrowsAfterBind) {
            throw new Error("synthetic shader compilation failure after bind");
          }
        }),
        resetShader: vi.fn(),
        vertex,
        model: vi.fn(),
        freeGeometry: vi.fn(),
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
  viewport = { width: 320, height: 240 };

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  remove(): void {
    this.removed = true;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  matches(): boolean {
    return false;
  }

  closest(): null {
    return null;
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, ...this.viewport };
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
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly devicePixelRatio = 1;

  constructor(viewport = { width: 320, height: 240 }) {
    super();
    this.innerWidth = viewport.width;
    this.innerHeight = viewport.height;
  }

  matchMedia(query: string): {
    matches: boolean;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  } {
    return {
      matches: query === "(prefers-reduced-motion: reduce)" && p5Harness.reducedMotion,
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

function dogView(overrides: Partial<DogView> = {}): DogView {
  return {
    version: 1,
    actorId: "D-R-v1-relief-dog",
    quickLabel: "Unknown dog",
    position: { x: 48, y: 48 },
    facing: Math.PI * 0.25,
    size: "large",
    sizeScale: 1.08,
    coat: {
      primary: "red",
      secondary: "white",
      pattern: "patched",
      length: "long",
    },
    wetness: 650_000,
    conditionLabels: ["SOAKED"],
    behavior: "approach-food",
    selected: false,
    ...overrides,
  };
}

type IndividualWildlifeViewSpecies = WildlifeVisualSpecies;

function wildlifeView(
  species: IndividualWildlifeViewSpecies,
  overrides: Partial<WildlifeView> = {},
): WildlifeView {
  const quickLabel: Readonly<Record<IndividualWildlifeViewSpecies, string>> = {
    deer: "Deer",
    gull: "Gulls",
    "black-bear": "Black bear",
    "domestic-cat": "Domestic cat",
    "marsh-rabbit": "Marsh rabbit",
    "marsh-fox": "Marsh fox",
    "arctic-fox": "Arctic fox",
    "harbor-seal": "Harbor seal",
    "polar-bear": "Polar bear",
    "fish-crow": "Fish crows",
    "northern-harrier": "Northern harrier",
    "snowy-egret": "Snowy egret",
    "american-black-duck": "American black duck",
    "domestic-chicken": "Domestic chicken",
    "domestic-goat": "Domestic goat",
    "north-american-river-otter": "North American river otter",
    "wild-boar": "Wild boar",
    elk: "Elk",
    "gray-wolf": "Gray wolf",
    cougar: "Cougar",
    "brown-bear": "Brown bear",
    "mountain-goat": "Mountain goat",
    "golden-eagle": "Golden eagle",
    "great-blue-heron": "Great blue heron",
    "common-tern": "Common terns",
    osprey: "Osprey",
    "greater-yellowlegs": "Greater yellowlegs",
    "belted-kingfisher": "Belted kingfisher",
    "double-crested-cormorant": "Double-crested cormorants",
    "seaside-sparrow": "Seaside sparrows",
    "diamondback-terrapin": "Diamondback terrapin",
  };
  const actorIdPrefix: Readonly<Record<IndividualWildlifeViewSpecies, string>> = {
    deer: "DEER-",
    gull: "GULL-",
    "black-bear": "BEAR-",
    "domestic-cat": "CAT-",
    "marsh-rabbit": "RABBIT-",
    "marsh-fox": "FOX-",
    "arctic-fox": "ARCTICFOX-",
    "harbor-seal": "HARBORSEAL-",
    "polar-bear": "POLARBEAR-",
    "fish-crow": "CROW-",
    "northern-harrier": "HARRIER-",
    "snowy-egret": "EGRET-",
    "american-black-duck": "DUCK-",
    "domestic-chicken": "CHICKEN-",
    "domestic-goat": "GOAT-",
    "north-american-river-otter": "OTTER-",
    "wild-boar": "BOAR-",
    elk: "ELK-",
    "gray-wolf": "WOLF-",
    cougar: "COUGAR-",
    "brown-bear": "BROWNBEAR-",
    "mountain-goat": "MOUNTAINGOAT-",
    "golden-eagle": "GOLDENEAGLE-",
    "great-blue-heron": "BLUEHERON-",
    "common-tern": "COMMONTERN-",
    osprey: "OSPREY-",
    "greater-yellowlegs": "YELLOWLEGS-",
    "belted-kingfisher": "KINGFISHER-",
    "double-crested-cormorant": "CORMORANT-",
    "seaside-sparrow": "SEASIDESPARROW-",
    "diamondback-terrapin": "TERRAPIN-",
  };
  return {
    actorId: `${actorIdPrefix[species]}R-v1-relief-${species}`,
    species,
    quickLabel: quickLabel[species],
    position: { x: 48, y: 48 },
    facing: Math.PI * 0.25,
    sizeScale: 1,
    appearanceKey: species === "domestic-goat"
      ? "brown-coated"
      : species === "mountain-goat"
        ? "cream-white"
        : species === "golden-eagle"
          ? "golden-naped"
          : species === "great-blue-heron"
            ? "blue-gray"
            : species === "common-tern"
              ? "black-capped-gray"
              : species === "osprey"
                ? "pale-headed"
                : species === "seaside-sparrow"
                  ? "salt-gray"
                  : species === "diamondback-terrapin"
                    ? "warm-olive"
                    : "test-visible-morph",
    behavior: "watch",
    conditionLabels: [],
    selected: false,
    ...overrides,
  };
}

function aggregateWildlifeEvidenceView(
  overrides: Partial<AggregateWildlifeEvidenceView> = {},
): AggregateWildlifeEvidenceView {
  return {
    version: 1,
    aggregateId: "RAT-AREA-v1-relief-aggregate",
    evidenceId: "RAT-AREA-v1-relief-aggregate:evidence:0",
    species: "brown-rat",
    representation: "population-evidence",
    form: "gnaw-marks",
    quickLabel: "Brown rat signs",
    identityLabel: "Brown rat population signs",
    evidenceLabel: "Rat gnaw marks",
    speciesIdentified: true,
    position: { x: 12, y: 12 },
    sizeScale: 0.82,
    distanceUnits: 4_000,
    selected: false,
    ...overrides,
  } as AggregateWildlifeEvidenceView;
}

function wildlifeCarcassView(
  overrides: Partial<WildlifeCarcassView> = {},
): WildlifeCarcassView {
  return {
    version: 1,
    carcassId: "wildlife-carcass:0123456789abcdef",
    position: { x: 48, y: 48 },
    form: "body",
    quickLabel: "Marsh rabbit body",
    speciesIdentified: true,
    sizeScale: 1,
    orientation: Math.PI * 0.25,
    distanceUnits: 4_000,
    ...overrides,
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

function renderHarness(
  initial: TideweftView,
  options: {
    readonly chunkSize?: number;
    readonly viewport?: { readonly width: number; readonly height: number };
    readonly getAcousticTextReservations?: () => readonly AcousticTextRect[];
    readonly getAnimalCallTextMode?: () => "full" | "important";
  } = {},
) {
  const { viewport, ...rendererOptions } = options;
  p5Harness.viewport = viewport ?? null;
  const mount = new FakeElement();
  const canvas = new FakeCanvas();
  if (viewport !== undefined) {
    mount.viewport = viewport;
    canvas.viewport = viewport;
  }
  const documentTarget = new FakeDocument();
  const windowTarget = new FakeWindow(viewport);
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
    ...rendererOptions,
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
  p5Harness.reducedMotion = false;
  p5Harness.perceptionShaderSupported = false;
  p5Harness.perceptionShaderThrowsAfterBind = false;
  p5Harness.perceptionShaderHooks.length = 0;
  p5Harness.waterShaderSupported = false;
  p5Harness.waterShaderThrowsAfterBind = false;
  p5Harness.waterShaderHooks.length = 0;
  p5Harness.waterShaderUniforms.length = 0;
  p5Harness.friendlyErrorsDisabled = false;
  p5Harness.viewport = null;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Relief focus accessibility", () => {
  it("retains an explicit reduced-motion focus through the next frame without easing or extending its lease", () => {
    p5Harness.reducedMotion = true;
    let now = 1_000;
    vi.stubGlobal("performance", { now: () => now });
    const current = view("focus", { x: 8, y: 12 });
    const harness = renderHarness(current);
    harness.draw();
    harness.renderer.focusWorld({ x: 44, y: 52 });
    for (now of [1_016, 1_400, 2_799]) {
      harness.draw();
      expect(harness.camera.mock.calls.at(-1)?.[3]).toBe(44);
      expect(harness.camera.mock.calls.at(-1)?.[5]).toBe(52);
    }
    now = 2_800;
    harness.draw();
    expect(harness.camera.mock.calls.at(-1)?.[3]).toBe(8);
    expect(harness.camera.mock.calls.at(-1)?.[5]).toBe(12);
    expect(harness.dispatch).not.toHaveBeenCalled();
    expect(current.player.position).toEqual({ x: 8, y: 12 });
    harness.renderer.destroy();
  });
});

describe("Relief renderer telemetry", () => {
  it("measures completed draw CPU time and publishes cheap truthful draw counts", () => {
    let clock = 0;
    vi.stubGlobal("performance", { now: () => {
      clock += 2;
      return clock;
    } });
    const harness = renderHarness(view("relief-telemetry", { x: 48, y: 48 }));
    harness.renderer.setPerformanceTelemetryEnabled?.(true);

    harness.draw();
    harness.draw();

    const telemetry = harness.renderer.telemetry();
    expect(telemetry).toMatchObject({
      frameCount: 2,
      rawFrameIntervalSampleCount: 1,
      drawCpuSampleCount: 2,
      terrainTiles: 16,
      projectedEntityCandidates: 1,
      labels: 0,
      particles: 0,
    });
    expect(telemetry.rawFrameIntervalMeanMs ?? 0).toBeGreaterThan(0);
    expect(telemetry.drawCpuMeanMs ?? 0).toBeGreaterThan(0);
    harness.renderer.destroy();
  });

  it("reduces only passive field-resource halos while hover and sounding stay full-detail", () => {
    const source = view("passive-resource-halo-lod", { x: 48, y: 48 });
    const charted: FieldResourceNodeView = {
      id: "resource:charted-cordreed",
      material: "cordreed",
      label: "Cordreed",
      position: { x: 12, y: 12 },
      knowledge: "charted",
      currentVisibility: 1,
    };
    const harness = renderHarness(source);
    harness.renderer.setPerformanceTelemetryEnabled?.(true);
    const vertex = harness.instance.vertex as ReturnType<typeof vi.fn>;

    // Warm retained terrain so per-frame vertex deltas contain only immediate
    // presentation work.
    harness.draw();
    vertex.mockClear();
    harness.draw();
    const baselineVertices = vertex.mock.calls.length;

    harness.setView({ ...source, fieldResources: [charted] });
    vertex.mockClear();
    harness.draw();
    const passiveTelemetry = harness.renderer.telemetry();
    const passiveVertices = vertex.mock.calls.length - baselineVertices;
    expect(passiveTelemetry.passiveFieldResourceHaloCount).toBe(1);
    expect(passiveTelemetry.passiveFieldResourceHaloVertices).toBe(passiveVertices);
    expect([13, 25]).toContain(passiveVertices);
    expect(passiveVertices).toBeLessThan(49);

    harness.setView({
      ...source,
      fieldResources: [{ ...charted, knowledge: "sounded", rarity: "common", stockUnits: 1 }],
    });
    vertex.mockClear();
    harness.draw();
    expect(vertex.mock.calls.length - baselineVertices).toBe(49);
    expect(harness.renderer.telemetry()).toMatchObject({
      passiveFieldResourceHaloCount: 0,
      passiveFieldResourceHaloVertices: 0,
    });

    harness.setView({ ...source, fieldResources: [charted] });
    harness.canvas.fire("pointermove", pointer(harness.canvas));
    vertex.mockClear();
    harness.draw();
    expect(vertex.mock.calls.length - baselineVertices).toBe(49);
    expect(harness.renderer.telemetry()).toMatchObject({
      passiveFieldResourceHaloCount: 0,
      passiveFieldResourceHaloVertices: 0,
    });
    harness.renderer.destroy();
  });

  it("retains terrain batches across frames and owns their complete GPU lifecycle", () => {
    const source = view("retained-relief", { x: 48, y: 48 });
    const harness = renderHarness(source);
    const buildGeometry = harness.instance.buildGeometry as ReturnType<typeof vi.fn>;
    const model = harness.instance.model as ReturnType<typeof vi.fn>;
    const freeGeometry = harness.instance.freeGeometry as ReturnType<typeof vi.fn>;

    harness.draw();
    const firstBuildCount = buildGeometry.mock.calls.length;
    const firstModelCount = model.mock.calls.length;
    expect(firstBuildCount).toBeGreaterThan(0);
    expect(firstModelCount).toBeGreaterThan(0);
    for (const [geometry] of model.mock.calls) {
      expect(geometry).toEqual(expect.objectContaining({
        gid: expect.stringContaining("fake-relief-geometry-"),
      }));
      expect(geometry.clearColors).toHaveBeenCalledOnce();
    }

    harness.draw();
    expect(buildGeometry).toHaveBeenCalledTimes(firstBuildCount);
    expect(model.mock.calls.length).toBeGreaterThan(firstModelCount);
    expect(freeGeometry).not.toHaveBeenCalled();

    harness.setView({
      ...source,
      terrain: {
        ...source.terrain,
        revision: "retained-relief-raised",
        tiles: source.terrain.tiles.map((tile, index) => ({
          ...tile,
          elevation: index === 5 ? 0.75 : tile.elevation,
        })),
      },
    });
    harness.draw();
    expect(buildGeometry.mock.calls.length).toBeGreaterThan(firstBuildCount);
    expect(freeGeometry.mock.calls.length).toBeGreaterThan(0);

    const buildsBeforeContextLoss = buildGeometry.mock.calls.length;
    freeGeometry.mockClear();
    const preventDefault = vi.fn();
    harness.canvas.fire("webglcontextlost", { preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    // The browser owns buffer disposal after context loss; calling back into
    // WebGL here would itself be unsafe.
    expect(freeGeometry).not.toHaveBeenCalled();
    harness.canvas.fire("webglcontextrestored");
    harness.draw();
    expect(buildGeometry.mock.calls.length).toBeGreaterThan(buildsBeforeContextLoss);

    freeGeometry.mockClear();
    harness.renderer.destroy();
    expect(freeGeometry.mock.calls.length).toBeGreaterThan(0);
  });

  it("promotes one exact perception surface, reuses it across camera motion, and owns its lifecycle", () => {
    let clock = 0;
    vi.stubGlobal("performance", { now: () => clock });
    p5Harness.reducedMotion = true;
    p5Harness.perceptionShaderSupported = true;
    p5Harness.friendlyErrorsDisabled = true;
    const base = view("retained-perception", { x: 48, y: 48 });
    const perception = {
      version: 1,
      signature: "retained-perception-a",
      valid: true,
      visibleTileCount: 16,
      directTileCount: 16,
      peripheralTileCount: 0,
      detailVisibleTileCount: 16,
      detailDirectTileCount: 16,
      detailPeripheralTileCount: 0,
    } as const;
    const source: TideweftView = {
      ...base,
      perception,
      terrain: {
        ...base.terrain,
        currentLocalIlluminationRevision: "retained-perception-light-a",
        tiles: base.terrain.tiles.map((tile) => ({
          ...tile,
          currentVisibility: 1,
          currentDetailVisibility: 1 as const,
          currentLocalIllumination: 0,
        })),
      },
    };
    const harness = renderHarness(source, { chunkSize: 2 });
    harness.renderer.setPerformanceTelemetryEnabled?.(true);
    const buildGeometry = harness.instance.buildGeometry as ReturnType<typeof vi.fn>;
    const baseMaterialShader = harness.instance.baseMaterialShader as ReturnType<typeof vi.fn>;
    const shader = harness.instance.shader as ReturnType<typeof vi.fn>;
    const resetShader = harness.instance.resetShader as ReturnType<typeof vi.fn>;
    const model = harness.instance.model as ReturnType<typeof vi.fn>;
    const freeGeometry = harness.instance.freeGeometry as ReturnType<typeof vi.fn>;

    harness.draw();
    const durableBuildCount = buildGeometry.mock.calls.length;
    clock = 149;
    harness.draw();
    expect(buildGeometry).toHaveBeenCalledTimes(durableBuildCount);
    expect(baseMaterialShader).not.toHaveBeenCalled();

    clock = 150;
    harness.draw();
    expect(buildGeometry).toHaveBeenCalledTimes(durableBuildCount + 1);
    expect(baseMaterialShader).toHaveBeenCalledOnce();
    expect(p5Harness.friendlyErrorsDisabled).toBe(true);
    expect(p5Harness.perceptionShaderHooks).toHaveLength(1);
    const hooks = p5Harness.perceptionShaderHooks[0] as Record<string, string>;
    expect(hooks["Inputs getPixelInputs"]).toContain("inputs.ambientMaterial = inputs.color.rgb");
    expect(hooks["Inputs getPixelInputs"]).toContain(
      "vec3(inputs.texCoord.xy, inputs.color.a)",
    );
    expect(hooks["Inputs getPixelInputs"]).toContain("inputs.color.a = 1.0");
    expect(hooks["Inputs getPixelInputs"]).not.toContain("if (");
    const retained = buildGeometry.mock.results.at(-1)?.value as {
      readonly vertices: unknown[];
      readonly faces: unknown[];
      readonly uvs: number[];
      readonly clearColors: ReturnType<typeof vi.fn>;
    };
    expect(retained.vertices.length).toBeGreaterThan(0);
    expect(retained.faces).toHaveLength(0);
    expect(retained.uvs).toHaveLength(retained.vertices.length * 2);
    expect(retained.uvs.every(
      (emission) => emission >= 0 && emission <= 74 / 255,
    )).toBe(true);
    expect(retained.clearColors).not.toHaveBeenCalled();
    expect(model.mock.calls.some(([geometry]) => geometry === retained)).toBe(true);
    expect(shader).toHaveBeenCalledWith({ kind: "fake-perception-shader" });
    expect(resetShader).toHaveBeenCalled();
    expect(harness.renderer.telemetry()).toMatchObject({
      perceptionMaterialSubmissions: 1,
      perceptionMaterialSegments: 4,
    });

    buildGeometry.mockClear();
    freeGeometry.mockClear();
    harness.renderer.setOrbit(0.42, 0.7);
    clock = 151;
    harness.draw();
    expect(buildGeometry).not.toHaveBeenCalled();
    expect(freeGeometry).not.toHaveBeenCalled();

    harness.setView({
      ...source,
      perception: { ...perception, signature: "retained-perception-b" },
      terrain: {
        ...source.terrain,
        currentLocalIlluminationRevision: "retained-perception-light-b",
        tiles: source.terrain.tiles.map((tile, index) => ({
          ...tile,
          currentLocalIllumination: index === 0 ? 1 : 0,
        })),
      },
    });
    clock = 152;
    harness.draw();
    expect(freeGeometry).toHaveBeenCalledOnce();
    expect(freeGeometry).toHaveBeenCalledWith(retained);

    clock = 302;
    harness.draw();
    const replacement = buildGeometry.mock.results.at(-1)?.value as unknown;
    expect(replacement).toBeDefined();
    freeGeometry.mockClear();
    const preventDefault = vi.fn();
    harness.canvas.fire("webglcontextlost", { preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(freeGeometry).not.toHaveBeenCalled();

    harness.canvas.fire("webglcontextrestored");
    clock = 303;
    harness.draw();
    const buildsAfterRestoreFallback = buildGeometry.mock.calls.length;
    clock = 453;
    harness.draw();
    expect(buildGeometry.mock.calls.length).toBeGreaterThan(buildsAfterRestoreFallback);

    const finalPerception = buildGeometry.mock.results.at(-1)?.value as unknown;
    freeGeometry.mockClear();
    harness.renderer.destroy();
    expect(freeGeometry.mock.calls.some(([geometry]) => geometry === finalPerception)).toBe(true);
  });

  it("keeps the immediate truthful surface when retained shader support fails", () => {
    let clock = 0;
    vi.stubGlobal("performance", { now: () => clock });
    const base = view("retained-perception-fallback", { x: 48, y: 48 });
    const source: TideweftView = {
      ...base,
      perception: {
        version: 1,
        signature: "retained-perception-fallback",
        valid: true,
        visibleTileCount: 16,
        directTileCount: 16,
        peripheralTileCount: 0,
        detailVisibleTileCount: 16,
        detailDirectTileCount: 16,
        detailPeripheralTileCount: 0,
      },
      terrain: {
        ...base.terrain,
        currentLocalIlluminationRevision: "fallback-unlit",
        tiles: base.terrain.tiles.map((tile) => ({
          ...tile,
          currentVisibility: 1,
          currentDetailVisibility: 1 as const,
          currentLocalIllumination: 0,
        })),
      },
    };
    const harness = renderHarness(source, { chunkSize: 2 });
    harness.renderer.setPerformanceTelemetryEnabled?.(true);
    const buildGeometry = harness.instance.buildGeometry as ReturnType<typeof vi.fn>;
    const beginShape = harness.instance.beginShape as ReturnType<typeof vi.fn>;

    harness.draw();
    const durableBuildCount = buildGeometry.mock.calls.length;
    beginShape.mockClear();
    clock = 150;
    harness.draw();
    expect(buildGeometry).toHaveBeenCalledTimes(durableBuildCount);
    expect(beginShape).toHaveBeenCalled();
    expect(harness.renderer.telemetry()).toMatchObject({
      terrainTiles: 32,
      perceptionMaterialSubmissions: 1,
      perceptionMaterialSegments: 4,
    });
    harness.renderer.destroy();
  });

  it("resets a shader that throws after binding before drawing the immediate fallback", () => {
    let clock = 0;
    vi.stubGlobal("performance", { now: () => clock });
    p5Harness.perceptionShaderSupported = true;
    p5Harness.perceptionShaderThrowsAfterBind = true;
    const base = view("retained-perception-compile-fallback", { x: 48, y: 48 });
    const source: TideweftView = {
      ...base,
      perception: {
        version: 1,
        signature: "retained-perception-compile-fallback",
        valid: true,
        visibleTileCount: 16,
        directTileCount: 16,
        peripheralTileCount: 0,
        detailVisibleTileCount: 16,
        detailDirectTileCount: 16,
        detailPeripheralTileCount: 0,
      },
      terrain: {
        ...base.terrain,
        currentLocalIlluminationRevision: "compile-fallback-unlit",
        tiles: base.terrain.tiles.map((tile) => ({
          ...tile,
          currentVisibility: 1,
          currentDetailVisibility: 1 as const,
          currentLocalIllumination: 0,
        })),
      },
    };
    const harness = renderHarness(source, { chunkSize: 2 });
    harness.renderer.setPerformanceTelemetryEnabled?.(true);
    const beginShape = harness.instance.beginShape as ReturnType<typeof vi.fn>;
    const baseMaterialShader = harness.instance.baseMaterialShader as ReturnType<typeof vi.fn>;
    const resetShader = harness.instance.resetShader as ReturnType<typeof vi.fn>;
    const freeGeometry = harness.instance.freeGeometry as ReturnType<typeof vi.fn>;

    harness.draw();
    beginShape.mockClear();
    resetShader.mockClear();
    freeGeometry.mockClear();
    clock = 150;
    harness.draw();

    expect(resetShader).toHaveBeenCalledOnce();
    expect(freeGeometry).toHaveBeenCalledOnce();
    expect(beginShape).toHaveBeenCalled();
    expect(harness.renderer.telemetry()).toMatchObject({
      terrainTiles: 32,
      perceptionMaterialSubmissions: 1,
      perceptionMaterialSegments: 4,
    });

    const shaderAttemptsAfterFailure = baseMaterialShader.mock.calls.length;
    harness.setView({
      ...source,
      perception: {
        ...source.perception!,
        signature: "retained-perception-other-owner",
      },
    });
    clock = 1000;
    harness.draw();
    expect(baseMaterialShader).toHaveBeenCalledTimes(shaderAttemptsAfterFailure);

    p5Harness.perceptionShaderThrowsAfterBind = false;
    harness.canvas.fire("webglcontextrestored");
    clock = 1001;
    harness.draw();
    clock = 1151;
    harness.draw();
    expect(baseMaterialShader.mock.calls.length).toBeGreaterThan(shaderAttemptsAfterFailure);
    harness.renderer.destroy();
  });

  it("invalidates the exact retained owner when camera culling or perception availability changes", () => {
    let clock = 0;
    vi.stubGlobal("performance", { now: () => clock });
    p5Harness.reducedMotion = true;
    p5Harness.perceptionShaderSupported = true;
    const columns = 64;
    const rows = 4;
    const base = view("retained-perception-mask", { x: 48, y: 48 });
    const perception = {
      version: 1,
      signature: "retained-perception-mask",
      valid: true,
      visibleTileCount: columns * rows,
      directTileCount: columns * rows,
      peripheralTileCount: 0,
      detailVisibleTileCount: columns * rows,
      detailDirectTileCount: columns * rows,
      detailPeripheralTileCount: 0,
    } as const;
    const source: TideweftView = {
      ...base,
      perception,
      terrain: {
        ...base.terrain,
        columns,
        rows,
        revision: "retained-perception-mask-terrain",
        currentLocalIlluminationRevision: "retained-perception-mask-light",
        tiles: Array.from({ length: columns * rows }, () => ({
          kind: "meadow" as const,
          elevation: 0.2,
          discovered: 1,
          currentVisibility: 1,
          currentDetailVisibility: 1 as const,
          currentLocalIllumination: 0,
        })),
      },
      camera: {
        ...base.camera,
        bounds: { minX: 0, minY: 0, maxX: columns * 24, maxY: rows * 24 },
      },
    };
    const harness = renderHarness(source, { chunkSize: 2 });
    const buildGeometry = harness.instance.buildGeometry as ReturnType<typeof vi.fn>;
    const freeGeometry = harness.instance.freeGeometry as ReturnType<typeof vi.fn>;

    harness.draw();
    clock = 150;
    harness.draw();
    const firstRetained = buildGeometry.mock.results.at(-1)?.value as unknown;
    freeGeometry.mockClear();

    const farPosition = { x: columns * 24 - 48, y: 48 };
    const farView: TideweftView = {
      ...source,
      player: { ...source.player, position: farPosition },
      camera: { ...source.camera, center: farPosition },
    };
    harness.setView(farView);
    clock = 151;
    harness.draw();
    expect(freeGeometry).toHaveBeenCalledOnce();
    expect(freeGeometry).toHaveBeenCalledWith(firstRetained);

    clock = 301;
    harness.draw();
    const secondRetained = buildGeometry.mock.results.at(-1)?.value as unknown;
    freeGeometry.mockClear();
    const { perception: _perception, ...withoutPerception } = farView;
    harness.setView(withoutPerception);
    clock = 302;
    harness.draw();
    expect(freeGeometry).toHaveBeenCalledOnce();
    expect(freeGeometry).toHaveBeenCalledWith(secondRetained);
    harness.renderer.destroy();
  });

  it("coalesces exact perception materials across visible chunks without merging local light", () => {
    const base = view("perception-material-coalescing", { x: 48, y: 48 });
    const perception = {
      version: 1,
      signature: "uniform-perception",
      valid: true,
      visibleTileCount: 16,
      directTileCount: 16,
      peripheralTileCount: 0,
      detailVisibleTileCount: 16,
      detailDirectTileCount: 16,
      detailPeripheralTileCount: 0,
    } as const;
    const uniform: TideweftView = {
      ...base,
      perception,
      terrain: {
        ...base.terrain,
        currentLocalIlluminationRevision: "uniform-dark",
        tiles: base.terrain.tiles.map((tile) => ({
          ...tile,
          currentVisibility: 1,
          currentDetailVisibility: 1 as const,
          currentLocalIllumination: 0,
        })),
      },
    };
    const harness = renderHarness(uniform, { chunkSize: 2 });
    harness.renderer.setPerformanceTelemetryEnabled?.(true);
    const beginShape = harness.instance.beginShape as ReturnType<typeof vi.fn>;
    const endShape = harness.instance.endShape as ReturnType<typeof vi.fn>;

    // Warm durable retained geometry, then establish the frame's unrelated
    // immediate-shape baseline before isolating perception submissions.
    harness.draw();
    beginShape.mockClear();
    endShape.mockClear();
    const { perception: _perception, ...withoutPerception } = uniform;
    harness.setView(withoutPerception);
    harness.draw();
    const baselineBeginShapes = beginShape.mock.calls.length;
    const baselineEndShapes = endShape.mock.calls.length;
    beginShape.mockClear();
    endShape.mockClear();
    harness.setView(uniform);
    harness.draw();
    expect(beginShape).toHaveBeenCalledTimes(baselineBeginShapes + 1);
    expect(endShape).toHaveBeenCalledTimes(baselineEndShapes + 1);
    expect(harness.renderer.telemetry()).toMatchObject({
      terrainTiles: 32,
      perceptionMaterialSubmissions: 1,
      perceptionMaterialSegments: 4,
    });

    harness.setView({
      ...uniform,
      perception: { ...perception, signature: "top-left-lit" },
      terrain: {
        ...uniform.terrain,
        currentLocalIlluminationRevision: "top-left-lit",
        tiles: uniform.terrain.tiles.map((tile, index) => ({
          ...tile,
          currentLocalIllumination: [0, 1, 4, 5].includes(index) ? 1 : 0,
        })),
      },
    });
    beginShape.mockClear();
    endShape.mockClear();
    harness.draw();
    expect(beginShape).toHaveBeenCalledTimes(baselineBeginShapes + 2);
    expect(endShape).toHaveBeenCalledTimes(baselineEndShapes + 2);
    expect(harness.renderer.telemetry()).toMatchObject({
      terrainTiles: 32,
      perceptionMaterialSubmissions: 2,
      perceptionMaterialSegments: 4,
    });

    const columns = 64;
    const rows = 4;
    const wide: TideweftView = {
      ...uniform,
      perception: {
        ...perception,
        signature: "wide-uniform-perception",
        visibleTileCount: columns * rows,
        directTileCount: columns * rows,
        detailVisibleTileCount: columns * rows,
        detailDirectTileCount: columns * rows,
      },
      terrain: {
        ...uniform.terrain,
        columns,
        rows,
        revision: "wide-uniform-perception",
        currentLocalIlluminationRevision: "wide-uniform-dark",
        tiles: Array.from({ length: columns * rows }, () => ({
          kind: "meadow" as const,
          elevation: 0.2,
          discovered: 1,
          currentVisibility: 1,
          currentDetailVisibility: 1 as const,
          currentLocalIllumination: 0,
        })),
      },
      camera: {
        ...uniform.camera,
        bounds: { minX: 0, minY: 0, maxX: columns * 24, maxY: rows * 24 },
      },
    };
    harness.setView(wide);
    harness.draw();
    const culled = harness.renderer.telemetry();
    const visibleSegments = culled.perceptionMaterialSegments ?? 0;
    const totalChunks = (columns / 2) * (rows / 2);
    expect(culled.perceptionMaterialSubmissions).toBe(1);
    expect(visibleSegments).toBeGreaterThan(0);
    expect(visibleSegments).toBeLessThan(totalChunks);
    expect(culled.terrainTiles).toBe(visibleSegments * 8);
    harness.renderer.destroy();
  });
});

describe("Relief shared outdoor illumination", () => {
  it("uses the projected clock for sky and lights while blue water stays unlit", () => {
    // Reduced motion removes camera/actor decoration, never the physical time
    // of day or its static accessible color state.
    p5Harness.reducedMotion = true;
    const nightTime = {
      version: 1 as const,
      dayNumber: 1,
      dayTick: 0,
      phase: "night" as const,
      phaseProgress: 0.4,
      cycleProgress: 0,
      solarProgress: null,
      illumination: 0.1,
    };
    const source = warmWaterView("daylight-relief");
    const harness = renderHarness({ ...source, worldTime: nightTime });
    harness.draw();
    const night = outdoorIlluminationPresentation(nightTime);
    const background = harness.instance.background as ReturnType<typeof vi.fn>;
    const ambientLight = harness.instance.ambientLight as ReturnType<typeof vi.fn>;
    const directionalLight = harness.instance.directionalLight as ReturnType<typeof vi.fn>;
    expect(background).toHaveBeenLastCalledWith(night.reliefSky);
    expect(ambientLight).toHaveBeenLastCalledWith(
      night.ambient.red,
      night.ambient.green,
      night.ambient.blue,
    );
    expect(directionalLight.mock.calls.at(-2)).toEqual([
      night.key.red,
      night.key.green,
      night.key.blue,
      night.keyDirection.x,
      night.keyDirection.y,
      night.keyDirection.z,
    ]);

    const waterColors = p5Harness.materialTrace.flatMap((entry, index) => {
      const ambient = p5Harness.materialTrace[index + 1];
      const emissive = p5Harness.materialTrace[index + 2];
      return entry.method === "fill"
        && entry.args.join(",") === "0,0,0,255"
        && ambient?.method === "ambientMaterial"
        && ambient.args.join(",") === "0,0,0"
        && emissive?.method === "emissiveMaterial"
        && typeof emissive.args[0] === "string"
        ? [emissive.args[0]]
        : [];
    });
    expect(waterColors.length).toBeGreaterThan(0);
    for (const waterColor of waterColors) {
      const red = Number.parseInt(waterColor.slice(1, 3), 16);
      const green = Number.parseInt(waterColor.slice(3, 5), 16);
      const blue = Number.parseInt(waterColor.slice(5, 7), 16);
      expect(blue).toBeGreaterThan(green);
      expect(green).toBeGreaterThan(red);
    }

    const dayTime = {
      ...nightTime,
      dayTick: 720,
      phase: "day" as const,
      phaseProgress: 0.5,
      cycleProgress: 0.5,
      solarProgress: 0.5,
      illumination: 1,
    };
    harness.setView({ ...source, worldTime: dayTime });
    harness.draw();
    const day = outdoorIlluminationPresentation(dayTime);
    expect(background).toHaveBeenLastCalledWith(day.reliefSky);
    expect(ambientLight).toHaveBeenLastCalledWith(
      day.ambient.red,
      day.ambient.green,
      day.ambient.blue,
    );
    expect(day.ambient).not.toEqual(night.ambient);
    harness.renderer.destroy();
  });

  it("renders only the observation-gated local-light pool and invalidates its material cache", () => {
    const base = view("relief-local-light", { x: 48, y: 48 });
    const perception = {
      version: 1,
      signature: "same-detail-mask",
      valid: true,
      visibleTileCount: 16,
      directTileCount: 16,
      peripheralTileCount: 0,
      detailVisibleTileCount: 16,
      detailDirectTileCount: 16,
      detailPeripheralTileCount: 0,
    } as const;
    const lit: TideweftView = {
      ...base,
      perception,
      terrain: {
        ...base.terrain,
        currentLocalIlluminationRevision: "lamp-on",
        tiles: base.terrain.tiles.map((tile, index) => ({
          ...tile,
          currentVisibility: 1,
          currentDetailVisibility: 1 as const,
          currentLocalIllumination: index === 5 ? 0.78 : 0,
        })),
      },
    };
    const harness = renderHarness(lit);
    harness.draw();
    expect(p5Harness.materialTrace.some(({ method, args }) => (
      method === "emissiveMaterial"
      && typeof args[0] === "number"
      && typeof args[1] === "number"
      && typeof args[2] === "number"
      && args[0] > args[1]
      && args[1] > args[2]
      && args[2] > 0
    ))).toBe(true);

    p5Harness.materialTrace.length = 0;
    harness.setView({
      ...lit,
      terrain: {
        ...lit.terrain,
        currentLocalIlluminationRevision: "lamp-out-of-sight",
        tiles: lit.terrain.tiles.map((tile) => ({
          ...tile,
          currentLocalIllumination: 0,
        })),
      },
    });
    harness.draw();
    expect(p5Harness.materialTrace.some(({ method, args }) => (
      method === "emissiveMaterial"
      && typeof args[0] === "number"
      && typeof args[1] === "number"
      && typeof args[2] === "number"
      && (args[0] > 0 || args[1] > 0 || args[2] > 0)
    ))).toBe(false);
    harness.renderer.destroy();
  });
});

describe("Relief spatial epoch release gate", () => {
  it("draws one bounded screen-space atmosphere instead of mesh-chunk fog blocks", () => {
    const harness = renderHarness(view("atmosphere", { x: 48, y: 48 }));
    const quad = harness.instance.quad as ReturnType<typeof vi.fn>;
    harness.draw();
    expect(quad).toHaveBeenCalledTimes(RELIEF_ATMOSPHERE_BAND_COUNT);
    harness.draw();
    expect(quad).toHaveBeenCalledTimes(RELIEF_ATMOSPHERE_BAND_COUNT * 2);
    harness.renderer.destroy();
  });

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

  it("rebases from absolute tile origins while preserving an in-flight touch", () => {
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
    const harness = renderHarness(framedView(
      "frame-a",
      { x: 48, y: 48 },
      { x: -200, y: 300 },
    ));
    harness.draw();
    harness.canvas.fire("pointerdown", pointer(harness.canvas, {
      pointerId: 72,
      pointerType: "touch",
    }));

    // The frame moves one tile left in local coordinates while the player also
    // walks six units. Relief must preserve the touch and ease only those six
    // units after applying the exact -24-unit frame translation.
    harness.setView(framedView(
      "frame-b",
      { x: 30, y: 48 },
      { x: -199, y: 300 },
    ));
    harness.draw();

    expect(harness.camera.mock.calls.at(-1)?.[3]).toBeCloseTo(24.54, 6);
    expect(harness.camera.mock.calls.at(-1)?.[5]).toBeCloseTo(48, 6);
    expect(harness.canvas.captures.has(72)).toBe(true);
    harness.canvas.fire("pointerup", pointer(harness.canvas, {
      pointerId: 72,
      pointerType: "touch",
    }));
    expect(harness.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "move-target" }));
    harness.renderer.destroy();
  });

  it("invalidates an in-flight touch when a replacement world reuses the same frame", () => {
    const inWorld = (worldName: string, position: { x: number; y: number }): TideweftView => {
      const base = view("g:-8:14", position);
      return {
        ...base,
        worldName,
        terrain: { ...base.terrain, worldTileOrigin: { x: -8, y: 14 } },
      };
    };
    const harness = renderHarness(inWorld("First Estuary", { x: 48, y: 48 }));
    harness.draw();
    harness.canvas.fire("pointerdown", pointer(harness.canvas, {
      pointerId: 73,
      pointerType: "touch",
    }));

    harness.setView(inWorld("Replacement Estuary", { x: 72, y: 20 }));
    harness.draw();

    expect(harness.canvas.captures.has(73)).toBe(false);
    expect(harness.canvas.released).toContain(73);
    harness.canvas.fire("pointerup", pointer(harness.canvas, {
      pointerId: 73,
      pointerType: "touch",
    }));
    expect(harness.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "move-target" }));
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

describe("Relief water motion", () => {
  it("reuses one water-only GPU program and a bounded render clock without changing source vertices", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    p5Harness.waterShaderSupported = true;
    p5Harness.friendlyErrorsDisabled = true;
    const source = warmWaterView("gpu-water-motion");
    const sourceBytes = JSON.stringify(source);
    const harness = renderHarness(source);
    const waterVertices: number[][] = [];
    (harness.instance.vertex as ReturnType<typeof vi.fn>).mockImplementation((...coordinates: number[]) => {
      if (p5Harness.materialTrace.slice(-3)[0]?.args.join(",") === "0,0,0,255") waterVertices.push(coordinates);
    });
    const time = (): number => p5Harness.waterShaderUniforms.filter(
      (entry) => entry.name === "waterMotionTime",
    ).at(-1)!.value as number;
    try {
      harness.draw();
      expect(p5Harness.waterShaderHooks).toHaveLength(1);
      expect(time()).toBe(0);
      const initialVertices = waterVertices.map((coordinates) => [...coordinates]);
      expect(initialVertices).toHaveLength(16 * 6);
      waterVertices.length = 0;
      now = 100;
      harness.draw();
      const advanced = time();
      expect(advanced).toBeGreaterThan(0);
      expect(advanced).toBeLessThanOrEqual(0.225);
      expect(waterVertices).toEqual(initialVertices);
      now = 100_000;
      harness.draw();
      expect(time() - advanced).toBeLessThanOrEqual(0.25 * 2.25);
      expect(p5Harness.waterShaderHooks).toHaveLength(1);
      expect(harness.instance.resetShader).toHaveBeenCalled();
      expect(JSON.stringify(source)).toBe(sourceBytes);
      expect(p5Harness.friendlyErrorsDisabled).toBe(true);
      const hooks = p5Harness.waterShaderHooks[0] as Record<string, unknown>;
      expect(hooks["Vertex getObjectInputs"]).toContain("inputs.position.y -= waterMotionAmplitude * wave");
    } finally {
      harness.renderer.destroy();
    }
  });

  it("keeps reduced-motion water flat without allocating its optional GPU program", () => {
    p5Harness.reducedMotion = true;
    p5Harness.waterShaderSupported = true;
    const harness = renderHarness(warmWaterView("reduced-water-motion"));
    try {
      harness.draw();
      harness.draw();
      expect(p5Harness.waterShaderHooks).toHaveLength(0);
      expect(p5Harness.waterShaderUniforms).toHaveLength(0);
    } finally {
      harness.renderer.destroy();
    }
  });

  it("restores the flat opaque sheet after a bind failure without retrying each frame", () => {
    p5Harness.waterShaderSupported = true;
    p5Harness.waterShaderThrowsAfterBind = true;
    p5Harness.friendlyErrorsDisabled = true;
    const harness = renderHarness(warmWaterView("unsupported-water-motion"));
    const waterVertices: number[][] = [];
    (harness.instance.vertex as ReturnType<typeof vi.fn>).mockImplementation((...coordinates: number[]) => {
      if (p5Harness.materialTrace.slice(-3)[0]?.args.join(",") === "0,0,0,255") waterVertices.push(coordinates);
    });
    try {
      expect(() => harness.draw()).not.toThrow();
      expect(waterVertices).toHaveLength(16 * 6);
      expect(harness.instance.resetShader).toHaveBeenCalled();
      waterVertices.length = 0;
      harness.draw();
      expect(waterVertices).toHaveLength(16 * 6);
      expect(p5Harness.waterShaderHooks).toHaveLength(1);
      expect(p5Harness.waterShaderUniforms).toHaveLength(0);
      expect(p5Harness.friendlyErrorsDisabled).toBe(true);
    } finally {
      harness.renderer.destroy();
    }
  });

  it("allows a fresh water program after context restoration", () => {
    p5Harness.waterShaderSupported = true;
    p5Harness.waterShaderThrowsAfterBind = true;
    const harness = renderHarness(warmWaterView("restored-water-motion"));
    try {
      harness.draw();
      harness.canvas.fire("webglcontextlost", { preventDefault: vi.fn() });
      p5Harness.waterShaderThrowsAfterBind = false;
      harness.canvas.fire("webglcontextrestored");
      harness.draw();
      expect(p5Harness.waterShaderHooks).toHaveLength(2);
      expect(p5Harness.waterShaderUniforms.some((entry) => entry.name === "waterMotionAmplitude")).toBe(true);
    } finally {
      harness.renderer.destroy();
    }
  });
});

describe("Relief water camera invariant", () => {
  it("reveals newly wet uncharted cells without relying on stale cached water-plane metadata", () => {
    const source = warmWaterView("uncharted-water-cached-geometry");
    const dry: TideweftView = {
      ...source,
      terrain: {
        ...source.terrain,
        tiles: source.terrain.tiles.map((tile) => ({
          ...tile, elevation: 0.4, waterDepth: 0, discovered: 0,
          currentVisibility: 1, currentDetailVisibility: 0 as const,
        })),
      },
    };
    const harness = renderHarness(dry);
    const waterVertices: number[][] = [];
    (harness.instance.vertex as ReturnType<typeof vi.fn>).mockImplementation((...coordinates: number[]) => {
      const [fill, ambient, emissive] = p5Harness.materialTrace.slice(-3);
      if (fill?.args.join(",") === "0,0,0,255"
        && ambient?.method === "ambientMaterial"
        && emissive?.method === "emissiveMaterial") waterVertices.push(coordinates);
    });
    try {
      harness.draw();
      expect(waterVertices).toHaveLength(0);
      harness.setView({
        ...dry,
        tide: { ...dry.tide, level: 0.7 },
        terrain: { ...dry.terrain, tiles: dry.terrain.tiles.map((tile) => ({
          ...tile, waterDepth: 0.3,
        })) },
      });
      harness.draw();
      expect(waterVertices).toHaveLength(16 * 6);
      for (const [, y] of waterVertices) {
        expect(-y!).toBeCloseTo(0.7 * dry.terrain.tileSize * 2.9 + 0.45, 8);
      }
      expect(dry.terrain.tiles.every((tile) => tile.discovered === 0 && tile.waterDepth === 0)).toBe(true);
    } finally {
      harness.renderer.destroy();
    }
  });

  it("keeps one physical water level across different submerged beds and depth-disclosure changes", () => {
    const source = warmWaterView("level-water-over-submerged-beds");
    const tideLevel = 0.9;
    const waterView: TideweftView = {
      ...source,
      tide: { ...source.tide, level: tideLevel },
      terrain: {
        ...source.terrain,
        // Unlike the former constant-depth sloping fixture, each physical
        // depth here is exactly tide minus its submerged bed elevation.
        tiles: source.terrain.tiles.map((tile, index) => {
          const elevation = index % 3 === 0 ? 0.05 : index % 3 === 1 ? 0.35 : 0.85;
          return { ...tile, elevation, waterDepth: tideLevel - elevation };
        }),
      },
    };
    const harness = renderHarness(waterView);
    const waterVertices: number[][] = [];
    (harness.instance.vertex as ReturnType<typeof vi.fn>).mockImplementation((...coordinates: number[]) => {
      const [fill, ambient, emissive] = p5Harness.materialTrace.slice(-3);
      if (fill?.args.join(",") === "0,0,0,255"
        && ambient?.method === "ambientMaterial"
        && emissive?.method === "emissiveMaterial") waterVertices.push(coordinates);
    });
    try {
      const scale = waterView.terrain.tileSize * 2.9;
      const captureWater = (level: number): number[][] => {
        waterVertices.length = 0;
        harness.draw();
        expect(waterVertices).toHaveLength(16 * 6);
        for (const [, y] of waterVertices) {
          expect(-y!).toBeCloseTo(level * scale + 0.45, 8);
        }
        // Disclosure can regroup material batches; compare the complete
        // geometric multiset rather than assuming material submission order.
        return waterVertices.map((coordinates) => [...coordinates]).sort((left, right) => (
          left[0]! - right[0]! || left[2]! - right[2]! || left[1]! - right[1]!
        ));
      };
      const directVertices = captureWater(tideLevel);
      for (const depthKnown of [0, 1]) {
        harness.setView({
          ...waterView,
          terrain: {
            ...waterView.terrain,
            tiles: waterView.terrain.tiles.map((tile) => ({
              ...tile,
              currentDetailVisibility: 0 as const,
              depthKnown,
            })),
          },
        });
        expect(captureWater(tideLevel)).toEqual(directVertices);
      }

      const nextTideLevel = 0.95;
      harness.setView({
        ...waterView,
        tide: { ...waterView.tide, level: nextTideLevel },
        terrain: {
          ...waterView.terrain,
          // An unchanged external revision must not preserve stale geometry
          // when a new immutable physical depth field accompanies the tide.
          tiles: waterView.terrain.tiles.map((tile) => ({
            ...tile,
            waterDepth: nextTideLevel - tile.elevation,
          })),
        },
      });
      expect(captureWater(nextTideLevel)).not.toEqual(directVertices);
      expect(waterView.terrain.tiles.every((tile) => (
        tile.waterDepth === tideLevel - tile.elevation
      ))).toBe(true);
    } finally {
      harness.renderer.destroy();
    }
  });

  it.each([
    ["visible", 1, 16 * 6],
    ["hidden", 0, 0],
  ] as const)("submits opaque water only for broad-%s tiles even with no detail visibility", (_label, currentVisibility, expectedVertices) => {
    const source = warmWaterView(`water-broad-visibility-${currentVisibility}`);
    const waterView: TideweftView = {
      ...source,
      terrain: {
        ...source.terrain,
        tiles: source.terrain.tiles.map((tile) => ({
          ...tile,
          currentVisibility,
          currentDetailVisibility: 0 as const,
        })),
      },
    };
    const harness = renderHarness(waterView);
    const waterVertices: unknown[][] = [];
    const waterPrimitives: unknown[] = [];
    const hasOpaqueWaterMaterial = (): boolean => {
      const [fill, ambient, emissive] = p5Harness.materialTrace.slice(-3);
      return fill?.method === "fill"
        && fill.args.join(",") === "0,0,0,255"
        && ambient?.method === "ambientMaterial"
        && ambient.args.join(",") === "0,0,0"
        && emissive?.method === "emissiveMaterial"
        && typeof emissive.args[0] === "string";
    };
    // Count actual immediate-mode water submissions, not retained terrain
    // geometry or actor shapes in this renderer-only disclosure fixture.
    (harness.instance.vertex as ReturnType<typeof vi.fn>).mockImplementation((...coordinates: unknown[]) => {
      if (hasOpaqueWaterMaterial()) waterVertices.push(coordinates);
    });
    (harness.instance.beginShape as ReturnType<typeof vi.fn>).mockImplementation((primitive: unknown) => {
      if (hasOpaqueWaterMaterial()) waterPrimitives.push(primitive);
    });
    try {
      harness.draw();
      expect(waterVertices).toHaveLength(expectedVertices);
      if (currentVisibility === 1) {
        expect(waterPrimitives.length).toBeGreaterThan(0);
        expect(waterPrimitives.every((primitive) => primitive === harness.instance.TRIANGLES)).toBe(true);
        expect(waterVertices.every((coordinates) => coordinates.length === 3
          && coordinates.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))))
          .toBe(true);
      } else {
        expect(waterPrimitives).toEqual([]);
      }
    } finally {
      harness.renderer.destroy();
    }
  });

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

type CurrentStrokeOperation = {
  readonly kind: "segment" | "point";
  readonly color: string;
  readonly alpha: number;
  readonly weight: number;
  readonly coordinates: readonly number[];
};

/** Normalize immediate lines and independent LINES pairs without joining them. */
function recordCurrentStrokes(
  harness: ReturnType<typeof renderHarness>,
  surfaces: ReadonlySet<number>,
): { readonly operations: CurrentStrokeOperation[] } {
  const operations: CurrentStrokeOperation[] = [];
  let color = "";
  let alpha = 0;
  let weight = 0;
  let shapeKind: unknown;
  let vertices: number[][] = [];
  const record = (kind: CurrentStrokeOperation["kind"], coordinates: number[]): void => {
    if ((color === "#061416" || color === "#ddfff1") && surfaces.has(coordinates[1]!)) {
      operations.push({ kind, color, alpha, weight, coordinates });
    }
  };
  (harness.instance.stroke as ReturnType<typeof vi.fn>).mockImplementation((value: {
    readonly value?: unknown;
    readonly setAlpha?: ReturnType<typeof vi.fn>;
  }) => {
    color = String(value?.value ?? value);
    alpha = Number(value?.setAlpha?.mock.calls.at(-1)?.[0] ?? 255);
  });
  (harness.instance.strokeWeight as ReturnType<typeof vi.fn>)
    .mockImplementation((value: number) => { weight = value; });
  (harness.instance.line as ReturnType<typeof vi.fn>)
    .mockImplementation((...coordinates: number[]) => record("segment", coordinates));
  (harness.instance.point as ReturnType<typeof vi.fn>)
    .mockImplementation((...coordinates: number[]) => record("point", coordinates));
  (harness.instance.beginShape as ReturnType<typeof vi.fn>).mockImplementation((kind: unknown) => {
    shapeKind = kind;
    vertices = [];
  });
  (harness.instance.vertex as ReturnType<typeof vi.fn>).mockImplementation((...coordinates: number[]) => {
    if (shapeKind === "lines") vertices.push(coordinates);
  });
  (harness.instance.endShape as ReturnType<typeof vi.fn>).mockImplementation(() => {
    if (shapeKind === "lines") {
      expect(vertices.length % 2).toBe(0);
      for (let index = 0; index < vertices.length; index += 2) {
        record("segment", [...vertices[index]!, ...vertices[index + 1]!]);
      }
    }
    shapeKind = undefined;
  });
  return { operations };
}

describe("Relief surface-current submission equivalence", () => {
  it.each([0, 0.5, undefined] as const)("does not submit current strokes without direct detail (%s)", (detail) => {
    vi.stubGlobal("performance", { now: () => 0 });
    p5Harness.reducedMotion = true;
    const base = warmWaterView("current-detail-boundary");
    const current: TideweftView = {
      ...base,
      tide: { ...base.tide, surfaceCurrent: { x: -1, y: 1 } },
      perception: {
        version: 1, signature: "no-direct-current", valid: true,
        visibleTileCount: 16, directTileCount: 16, peripheralTileCount: 0,
        detailVisibleTileCount: detail === 0.5 ? 16 : 0,
        detailDirectTileCount: 0, detailPeripheralTileCount: detail === 0.5 ? 16 : 0,
      },
      terrain: {
        ...base.terrain,
        tiles: base.terrain.tiles.map((tile) => {
          const { currentDetailVisibility: _oldDetail, ...rest } = tile;
          return { ...rest, ...(detail === undefined ? {} : { currentDetailVisibility: detail }) };
        }),
      },
    };
    const harness = renderHarness(current);
    try {
      harness.draw();
      const surfaces = new Set(current.terrain.tiles.map((_tile, index) => -(
        perceivedReliefSurfaceHeightAt(current.terrain, {
          x: (index % 4 + 0.5) * 24, y: (Math.floor(index / 4) + 0.5) * 24,
        }, 24 * 2.9, true) + 1.25
      )));
      const trace = recordCurrentStrokes(harness, surfaces);
      harness.draw();
      expect(trace.operations).toEqual([]);
      const shapes = harness.instance.beginShape as ReturnType<typeof vi.fn>;
      expect(shapes.mock.calls.some(([kind]) => kind === "triangles")).toBe(true);
    } finally {
      harness.renderer.destroy();
    }
  });

  it.each([
    [false, false, 0, 4], [false, false, 50_000, 4],
    [false, true, 0, 4], [false, true, 50_000, 4],
    [true, false, 0, 4], [true, false, 50_000, 4],
    [true, true, 0, 4], [true, true, 50_000, 4],
    [true, true, 50_000, 32],
  ] as const)("preserves ordered geometry/styles/flecks (scan %s, reduced %s, time %s, size %s)",
    (analytical, reducedMotion, timeMs, size) => {
      vi.stubGlobal("performance", { now: () => timeMs });
      p5Harness.reducedMotion = reducedMotion;
      const base = warmWaterView("current-submission");
      const center = { x: size * 12, y: size * 12 };
      const current: TideweftView = {
        ...base,
        terrain: {
          ...base.terrain, columns: size, rows: size,
          tiles: Array.from({ length: size * size }, (_, index) => ({
            ...base.terrain.tiles[index % 16]!, roughness: index % 2 ? 0.1 : 0.9,
          })),
        },
        player: { ...base.player, position: center, scanProgress: analytical ? 1 : 0 },
        camera: { ...base.camera, center, bounds: { minX: 0, minY: 0, maxX: size * 24, maxY: size * 24 } },
        tide: { ...base.tide, surfaceCurrent: { x: -1, y: 1 } },
      };
      const freeze = (value: unknown): void => {
        if (value && typeof value === "object") {
          for (const child of Object.values(value)) freeze(child);
          Object.freeze(value);
        }
      };
      freeze(current);
      const original = JSON.stringify(current);
      const cues = buildSurfaceCurrentCues(current.terrain, current.tide.surfaceCurrent, {
        analytical, focus: center, tideLevel: current.tide.level,
        weatherIntensity: current.weather.intensity, timeMs, reducedMotion, maxCues: 220,
      });
      expect(cues).toHaveLength(size === 32 ? 220 : 4);
      const heights = cues.map((cue) => -(
        perceivedReliefSurfaceHeightAt(current.terrain, cue.center, 24 * 2.9, true) + 1.25
      ));
      const expected: CurrentStrokeOperation[] = [];
      for (const pass of ["ink", "foam"] as const) {
        cues.forEach((cue, index) => {
          const y = heights[index]!;
          const color = pass === "ink" ? "#061416" : "#ddfff1";
          const alpha = pass === "ink" ? 145 + cue.strength * 80 : 110 + cue.strength * 115;
          const weight = pass === "ink" ? 2.8 + cue.turbulence * 1.5 : 0.8 + cue.strength * 0.9;
          const [start, controlA, controlB, end] = cue.streamline;
          const pairs = [[start, controlA], [controlA, controlB], [controlB, end]] as const;
          for (const [from, to] of [...pairs, ...(analytical
            ? [[cue.tip, cue.headLeft], [cue.tip, cue.headRight]] as const : [])]) {
            expected.push({ kind: "segment", color, alpha, weight,
              coordinates: [from.x, y, from.y, to.x, y, to.y] });
          }
          if (pass === "foam") {
            for (const fleck of cue.foam) expected.push({ kind: "point", color, alpha,
              weight: 1.2 + cue.turbulence * 2.2, coordinates: [fleck.x, y, fleck.y] });
          }
        });
      }
      const harness = renderHarness(current);
      try {
        harness.draw(); // Retained terrain preparation is outside the stroke trace.
        const trace = recordCurrentStrokes(harness, new Set(heights));
        harness.draw();
        expect(trace.operations).toEqual(expected);
        expect(JSON.stringify(current)).toBe(original);
      } finally {
        harness.renderer.destroy();
      }
    });
});

type BiomeStroke = Omit<CurrentStrokeOperation, "kind">;
type BiomeMotifFixture = {
  readonly tileIndex: number;
  readonly center: { readonly x: number; readonly y: number };
  readonly surface: number;
  readonly operations: readonly BiomeStroke[];
};

function biomeFixture(size = 4, tileSize = 24, worldOriginY = 1): TideweftView {
  const base = view("biome-submission-fixture", { x: size * tileSize / 2, y: size * tileSize / 2 });
  const biomes = Object.keys(BIOME_PRESENTATION) as Array<keyof typeof BIOME_PRESENTATION>;
  return {
    ...base,
    terrain: {
      ...base.terrain, columns: size, rows: size, tileSize,
      worldTileOrigin: { x: 0, y: worldOriginY },
      tiles: Array.from({ length: size * size }, (_, index) => ({
        kind: "meadow" as const, elevation: 0.2, waterDepth: 0.6,
        biome: biomes[index % biomes.length]!, discovered: 0,
        currentVisibility: 1, currentDetailVisibility: 1 as const,
        climate: { rainfall: 0.2, heat: 0.3, salinity: 0.4, exposure: 0.5, magicalWater: 0.6 },
      })),
    },
    camera: { ...base.camera, bounds: { minX: 0, minY: 0, maxX: size * tileSize, maxY: size * tileSize } },
    perception: { version: 3, signature: "biome-submission-fixture", valid: true,
      visibleTileCount: size * size, directTileCount: size * size, peripheralTileCount: 0,
      detailVisibleTileCount: size * size, detailDirectTileCount: size * size, detailPeripheralTileCount: 0 },
    acousticText: [],
  };
}

function biomeFixtureCamera(current: TideweftView, viewport = { width: 320, height: 240 }, yaw = 0): reliefCamera.ReliefCameraState {
  const distance = Math.max(150, Math.min(2_200,
    Math.max(430, Math.min(780, Math.min(viewport.width, viewport.height) * 0.96)) / current.camera.zoom,
  ));
  return { target: current.player.position,
    targetHeight: discoveredReliefSurfaceHeightAt(current.terrain, current.player.position, Math.max(1, current.terrain.tileSize * 2.9), false),
    distance, yaw, pitch: Math.PI * 0.29, verticalFov: Math.PI / 3.5, near: 1,
    far: Math.max(4_000, Math.hypot(current.terrain.columns * current.terrain.tileSize,
      current.terrain.rows * current.terrain.tileSize) * 2.5) };
}

/** Original row-major/hash admission and motif geometry; no camera rejection. */
function originalBiomeMotifs(current: TideweftView, camera: reliefCamera.ReliefCameraState): readonly BiomeMotifFixture[] {
  const grid = current.terrain, tileSize = grid.tileSize, reach = camera.distance * 1.15;
  const bound = (value: number, maximum: number): number => Math.max(0, Math.min(maximum, value));
  const firstColumn = bound(Math.floor((camera.target.x - reach - grid.origin.x) / tileSize), grid.columns - 1);
  const lastColumn = bound(Math.ceil((camera.target.x + reach - grid.origin.x) / tileSize), grid.columns - 1);
  const firstRow = bound(Math.floor((camera.target.y - reach - grid.origin.y) / tileSize), grid.rows - 1);
  const lastRow = bound(Math.ceil((camera.target.y + reach - grid.origin.y) / tileSize), grid.rows - 1);
  const threshold = 1 - Math.min(0.43, 420 / Math.max(1, (lastColumn - firstColumn + 1) * (lastRow - firstRow + 1)));
  const motifs: BiomeMotifFixture[] = [];
  for (let row = firstRow; row <= lastRow; row += 1) for (let column = firstColumn; column <= lastColumn; column += 1) {
    const tileIndex = row * grid.columns + column, tile = grid.tiles[tileIndex];
    const presentation = visibleBiomePresentation(tile), visibility = biomePresentationVisibility(tile);
    if (!tile || tile.kind === "built" || !presentation || visibility < 0.3
      || currentTerrainDetailVisibility(tile, current.perception !== undefined) < 1) continue;
    const variant = reliefTerrainDecorationHash01(grid, column, row, 0x6269_6f6d);
    if (variant < threshold) continue;
    const emphasis = biomeEnvironmentalEmphasis(tile), center = {
      x: grid.origin.x + (column + 0.5) * tileSize, y: grid.origin.y + (row + 0.5) * tileSize,
    };
    const surface = perceivedReliefSurfaceHeightAt(grid, center, Math.max(1, tileSize * 2.9),
      presentation.motif === "ripple" || presentation.motif === "glimmer") + 0.8;
    const baseY = -surface, lift = tileSize * (0.19 + emphasis * 0.12), half = tileSize * 0.13;
    const skew = (variant - 0.5) * tileSize * 0.18;
    const operations: BiomeStroke[] = [];
    const line = (...coordinates: number[]): void => { operations.push({ coordinates,
      color: presentation.accentColor, alpha: (70 + emphasis * 90) * visibility, weight: 0.85 + visibility * 0.65 }); };
    switch (presentation.motif) {
      case "ripple":
        line(center.x - half * 1.4, baseY, center.y, center.x + half * 1.4, baseY, center.y + skew * 0.3);
        line(center.x - half * 0.8, baseY - 0.5, center.y + half, center.x + half * 0.8, baseY - 0.5, center.y + half + skew * 0.2);
        break;
      case "salt-crystal":
        line(center.x, baseY, center.y - half, center.x + half, baseY - lift * 0.45, center.y);
        line(center.x + half, baseY - lift * 0.45, center.y, center.x, baseY, center.y + half);
        line(center.x, baseY, center.y + half, center.x - half, baseY - lift * 0.45, center.y);
        line(center.x - half, baseY - lift * 0.45, center.y, center.x, baseY, center.y - half);
        break;
      case "reeds":
        for (let reed = -1; reed <= 1; reed += 1) {
          const x = center.x + reed * half * 0.72;
          line(x, baseY, center.y, x + skew * 0.1, baseY - lift * (reed === 0 ? 1 : 0.72), center.y);
        }
        break;
      case "rain-stem":
        line(center.x, baseY, center.y, center.x, baseY - lift, center.y);
        line(center.x, baseY - lift * 0.56, center.y, center.x - half, baseY - lift * 0.77, center.y + half * 0.35);
        line(center.x, baseY - lift * 0.45, center.y, center.x + half, baseY - lift * 0.66, center.y - half * 0.35);
        break;
      case "sunburst":
        line(center.x, baseY, center.y, center.x, baseY - lift * 0.7, center.y);
        line(center.x - half, baseY - lift * 0.7, center.y, center.x + half, baseY - lift * 0.7, center.y);
        line(center.x, baseY - lift * 0.7, center.y - half, center.x, baseY - lift * 0.7, center.y + half);
        break;
      case "wind-stroke":
        line(center.x - half * 1.5, baseY - lift * 0.25, center.y + half, center.x + half * 1.4, baseY - lift * 0.55, center.y - half);
        line(center.x - half, baseY - lift * 0.58, center.y - half, center.x + half * 0.9, baseY - lift * 0.78, center.y - half * 1.35);
        break;
      case "glimmer":
        line(center.x, baseY, center.y, center.x, baseY - lift, center.y);
        line(center.x - half, baseY - lift * 0.62, center.y, center.x + half, baseY - lift * 0.62, center.y);
        line(center.x, baseY - lift * 0.62, center.y - half, center.x, baseY - lift * 0.62, center.y + half);
        break;
    }
    motifs.push({ tileIndex, center, surface, operations });
  }
  return motifs;
}

function projectBiomeStroke(operation: BiomeStroke, camera: reliefCamera.ReliefCameraState,
  viewport: { readonly width: number; readonly height: number }) {
  const point = (offset: number) => reliefCamera.projectReliefPoint({ x: operation.coordinates[offset]!,
    y: operation.coordinates[offset + 2]! }, -operation.coordinates[offset + 1]!, camera, viewport);
  return [point(0), point(3)] as const;
}

function recordBiomeStrokes(harness: ReturnType<typeof renderHarness>): BiomeStroke[] {
  const operations: BiomeStroke[] = [], colors = new Set(Object.values(BIOME_PRESENTATION).map(({ accentColor }) => accentColor));
  let color = "", alpha = 0, weight = 0;
  (harness.instance.stroke as ReturnType<typeof vi.fn>).mockImplementation((value: {
    readonly value?: unknown; readonly setAlpha?: ReturnType<typeof vi.fn>;
  }) => { color = String(value?.value ?? value); alpha = Number(value?.setAlpha?.mock.calls.at(-1)?.[0] ?? 255); });
  (harness.instance.strokeWeight as ReturnType<typeof vi.fn>).mockImplementation((value: number) => { weight = value; });
  (harness.instance.line as ReturnType<typeof vi.fn>).mockImplementation((...coordinates: number[]) => {
    if (colors.has(color) && coordinates.length === 6) operations.push({ color, alpha, weight, coordinates });
  });
  return operations;
}

describe("Relief biome submission characterization", () => {
  it.each(Object.keys(BIOME_PRESENTATION) as Array<keyof typeof BIOME_PRESENTATION>)(
    "preserves original on-camera %s membership, ordered geometry, style and grounding", (biome) => {
      vi.stubGlobal("performance", { now: () => 0 }); p5Harness.reducedMotion = true;
      const base = biomeFixture(), current: TideweftView = { ...base,
        terrain: { ...base.terrain, tiles: base.terrain.tiles.map((tile) => Object.freeze({ ...tile, biome })) } };
      const viewport = { width: 320, height: 240 }, camera = biomeFixtureCamera(current, viewport);
      const selected = originalBiomeMotifs(current, camera).slice(0, 420);
      expect(selected.length).toBeGreaterThan(0);
      expect(selected.every((motif) => motif.operations.some((operation) =>
        projectBiomeStroke(operation, camera, viewport).some(({ visible }) => visible)))).toBe(true);
      const before = JSON.stringify(current), harness = renderHarness(current, { viewport });
      try {
        harness.renderer.setOrbit(0, camera.pitch); harness.draw();
        const operations = recordBiomeStrokes(harness); harness.draw();
        expect(operations).toEqual(selected.flatMap(({ operations: lines }) => lines));
        expect(JSON.stringify(current)).toBe(before);
        expect(current.terrain.tiles.every((tile) => tile.discovered === 0)).toBe(true);
        expect(harness.dispatch).not.toHaveBeenCalled();
      } finally { harness.renderer.destroy(); }
    });

  it.each([0, 0.5, undefined] as const)("does not disclose biome strokes without direct detail (%s)", (detail) => {
    vi.stubGlobal("performance", { now: () => 0 }); p5Harness.reducedMotion = true;
    const base = biomeFixture(), current: TideweftView = { ...base, terrain: { ...base.terrain,
      tiles: base.terrain.tiles.map((tile) => { const { currentDetailVisibility: _old, ...rest } = tile;
        return { ...rest, ...(detail === undefined ? {} : { currentDetailVisibility: detail }) }; }) } };
    const harness = renderHarness(current);
    try { harness.draw(); const operations = recordBiomeStrokes(harness); harness.draw(); expect(operations).toEqual([]); }
    finally { harness.renderer.destroy(); }
  });

  it.each([0, Math.PI] as const)("preserves the original first 420 motif submissions and ordering at yaw %s", (yaw) => {
    vi.stubGlobal("performance", { now: () => 0 }); p5Harness.reducedMotion = true;
    const viewport = { width: 200, height: 240 };
    // Bounded search chooses a real signed-world hash fixture, not mocked
    // admission: more than 420 selected cells exercise the original cap.
    const dense = (worldOriginY: number): TideweftView => {
      const base = biomeFixture(48, 24, worldOriginY);
      const position = { x: base.player.position.x, y: base.player.position.y + 64 };
      return { ...base, player: { ...base.player, position }, camera: { ...base.camera,
        center: position, zoom: MIN_RELIEF_MANUAL_ZOOM } };
    };
    let current = dense(1), camera = biomeFixtureCamera(current, viewport, yaw);
    let selected = originalBiomeMotifs(current, camera);
    for (let origin = 2; origin <= 32 && selected.length <= 420; origin += 1) {
      current = dense(origin); camera = biomeFixtureCamera(current, viewport, yaw);
      selected = originalBiomeMotifs(current, camera);
    }
    expect(selected.length).toBeGreaterThan(420);
    const admitted = selected.slice(0, 420);
    expect(admitted).toHaveLength(420);
    expect(admitted.some((motif) => motif.operations.some((operation) =>
      projectBiomeStroke(operation, camera, viewport).some(({ visible }) => visible)))).toBe(true);
    const before = JSON.stringify(current), harness = renderHarness(current, { viewport });
    try {
      harness.renderer.setOrbit(yaw, camera.pitch); harness.draw();
      const operations = recordBiomeStrokes(harness); harness.draw();
      const expected = admitted.flatMap(({ operations: lines }) => lines);
      expect(operations).toHaveLength(expected.length);
      expect(operations).toEqual(expected);
      expect(JSON.stringify(current)).toBe(before); expect(harness.dispatch).not.toHaveBeenCalled();
    } finally { harness.renderer.destroy(); }
  });

  it.each([[24, 48, 320, 240], [0.25, 32, 4, 720]] as const)(
    "retains a real viewport-crossing stroke with its center outside (tile %s, grid %s, viewport %sx%s)",
    (tileSize, size, width, height) => {
      vi.stubGlobal("performance", { now: () => 0 }); p5Harness.reducedMotion = true;
      const viewport = { width, height }, base = biomeFixture(size, tileSize);
      // Camera movement is presentation-only. Find an actual segment crossing
      // the viewport edge using real projection, not a forged visibility flag.
      let current = base, camera = biomeFixtureCamera(current, viewport);
      let admitted = originalBiomeMotifs(current, camera).slice(0, 420);
      const crossing = (motif: BiomeMotifFixture): boolean => !reliefCamera.projectReliefPoint(
        motif.center, motif.surface, camera, viewport).visible && motif.operations.some((operation) => {
        const [a, b] = projectBiomeStroke(operation, camera, viewport); return a.visible !== b.visible;
      });
      for (let offset = 1; offset <= 32 && !admitted.some(crossing); offset += 1) {
        const position = { x: base.player.position.x + offset * tileSize / 64, y: base.player.position.y };
        current = { ...base, player: { ...base.player, position }, camera: { ...base.camera, center: position } };
        camera = biomeFixtureCamera(current, viewport); admitted = originalBiomeMotifs(current, camera).slice(0, 420);
      }
      const edge = admitted.filter(crossing); expect(edge.length).toBeGreaterThan(0);
      const before = JSON.stringify(current), harness = renderHarness(current, { viewport });
      try {
        harness.renderer.setOrbit(0, camera.pitch); harness.draw();
        const operations = recordBiomeStrokes(harness); harness.draw();
        for (const motif of edge) for (const operation of motif.operations) expect(operations).toContainEqual(operation);
        const expected = admitted.flatMap(({ operations: lines }) => lines);
        expect(operations).toHaveLength(expected.length);
        expect(operations).toEqual(expected);
        expect(JSON.stringify(current)).toBe(before);
        expect(harness.dispatch).not.toHaveBeenCalled();
      } finally { harness.renderer.destroy(); }
    });
});

describe("Relief ambient-water acoustic authority", () => {
  it.each([
    ["ohm", false],
    ["whissh", false],
    ["ohm", true],
    ["whissh", true],
  ] as const)("suppresses raw %s labels with shared acoustic text (reduced motion: %s)", (voice, reducedMotion) => {
    vi.stubGlobal("performance", { now: () => 0 });
    p5Harness.reducedMotion = reducedMotion;
    const base = warmWaterView("water-acoustic-authority");
    const current: TideweftView = {
      ...base,
      terrain: {
        ...base.terrain,
        tiles: base.terrain.tiles.map((tile) => ({
          ...tile,
          waterDepth: voice === "ohm" ? 0.2 : 0.9,
          roughness: voice === "ohm" ? 0 : 1,
        })),
      },
      tide: { ...base.tide, level: 0.5, surfaceCurrent: { x: 1, y: 0 } },
    };
    const harness = renderHarness(current);
    const point = harness.instance.point as ReturnType<typeof vi.fn>;
    const layer = harness.mount.children.find((child) => child.className === "relief-label-layer");
    const labels = (): FakeElement[] => layer?.children.filter((child) => (
      !child.removed && (child.textContent === "ohm" || child.textContent === "whissh")
    )) ?? [];
    try {
      harness.draw();
      const cues = buildSurfaceCurrentCues(current.terrain, current.tide.surfaceCurrent, {
        analytical: false, tideLevel: current.tide.level,
        weatherIntensity: current.weather.intensity, timeMs: 0, reducedMotion, maxCues: 220,
      });
      const surfaces = new Set(cues.map((cue) => -(
        perceivedReliefSurfaceHeightAt(current.terrain, cue.center, 24 * 2.9, true) + 1.25
      )));
      const trace = recordCurrentStrokes(harness, surfaces);
      point.mockClear();
      harness.draw();
      const legacyLabels = labels();
      expect(legacyLabels.map(({ textContent }) => textContent)).toContain(voice);
      const flowStrokes = [...trace.operations];
      const foamCount = point.mock.calls.length;
      expect(flowStrokes.filter(({ kind }) => kind === "segment")).toHaveLength(cues.length * 6);
      if (voice === "whissh") expect(foamCount).toBeGreaterThan(0);

      trace.operations.length = 0;
      point.mockClear();
      harness.setView({ ...current, acousticText: [] });
      harness.draw();
      expect(labels()).toEqual([]);
      expect(legacyLabels.every(({ removed }) => removed)).toBe(true);
      expect(trace.operations).toEqual(flowStrokes);
      expect(point).toHaveBeenCalledTimes(foamCount);

      harness.setView({ ...current, acousticText: [{
        acousticKind: "physical", id: "shared-thud", sourceId: "object:crate",
        sourceKind: "object", text: "shared thud", position: base.player.position,
        progress: 0.2, priority: 9, salience: 7, tone: "restrained",
        variantSeed: 1, semanticFamily: "thud",
      }] });
      harness.draw();
      expect(labels()).toEqual([]);
      expect(layer?.children.some((child) => (
        !child.removed && child.textContent === "shared thud"
      ))).toBe(true);

      harness.setView(current);
      harness.draw();
      expect(labels().map(({ textContent }) => textContent)).toContain(voice);
    } finally {
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
    const ambientMaterial = harness.instance.ambientMaterial as ReturnType<typeof vi.fn>;
    harness.draw();
    const legacyLineCount = line.mock.calls.length;
    const layer = harness.mount.children.find((child) => child.className === "relief-label-layer");
    expect(layer?.children.some((child) => child.dataset.tone === "adrift" && !child.removed))
      .toBe(false);

    line.mockClear();
    stroke.mockClear();
    ambientMaterial.mockClear();
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
    expect(layer?.children.some((child) =>
      child.textContent === "OHM" && child.dataset.tone === "sound" && !child.removed))
      .toBe(true);
    expect(ambientMaterial).toHaveBeenCalledWith("#55c7dc");
    expect(stroke.mock.calls.some(([value]) =>
      value === "#e5fbff"
        || (value as { value?: unknown } | undefined)?.value === "#e5fbff"
    )).toBe(true);
    expect(line).toHaveBeenCalledTimes(legacyLineCount);

    line.mockClear();
    stroke.mockClear();
    ambientMaterial.mockClear();
    const paddlingWithAcousticText: TideweftView = {
      ...floating,
      acousticText: [],
      player: {
        ...floating.player,
        adrift: { ...floating.player.adrift!, paddling: true },
      },
    };
    harness.setView(paddlingWithAcousticText);
    harness.draw();
    const paddleLabel = layer?.children.find((child) =>
      child.textContent === "PADDLING · PADDLE TOWARD SHALLOW WATER" && !child.removed);
    if (!paddleLabel) throw new Error("expected paddling ADRIFT label");
    expect(layer?.children.some((child) =>
      child.dataset.tone === "sound" && !child.removed)).toBe(false);
    const renderedCopy = layer?.children
      .filter((child) => !child.removed)
      .map((child) => child.textContent ?? "")
      .join(" ") ?? "";
    expect(renderedCopy).not.toMatch(/ashore|arrived|\bETA\b|\d+(?:\.\d+)?\s*%|percent/iu);
    expect(ambientMaterial).toHaveBeenCalledWith("#61e6d2");
    expect(stroke.mock.calls.some(([value]) =>
      value === "#edfff9"
        || (value as { value?: unknown } | undefined)?.value === "#edfff9"
    )).toBe(true);
    expect(line).toHaveBeenCalledTimes(legacyLineCount + 1);
    expect(line).toHaveBeenCalledWith(0, 0, 0, 11.52, 3.84, 5.76);

    const { acousticText: _acousticText, ...legacyPaddling } = paddlingWithAcousticText;
    harness.setView(legacyPaddling);
    harness.draw();
    expect(layer?.children.some((child) =>
      child.textContent === "WHHSH" && child.dataset.tone === "sound" && !child.removed))
      .toBe(true);

    harness.setView(legacySwept);
    harness.draw();
    expect(paddleLabel.removed).toBe(true);
    expect(layer?.children.some((child) => child.dataset.tone === "adrift" && !child.removed))
      .toBe(false);
    harness.renderer.destroy();
  });
});

describe("Relief situated expression presentation", () => {
  it.each([
    [1_280, 720, false], [390, 844, false], [320, 640, false], [844, 390, false],
    [1_280, 720, true], [390, 844, true], [320, 640, true], [844, 390, true],
  ] as const)("lets optional harbor names yield to placed speech at %sx%s (reduced motion: %s)", (width, height, reducedMotion) => {
    vi.stubGlobal("performance", { now: () => 0 });
    p5Harness.reducedMotion = reducedMotion;
    const base = view("harbor-acoustic-conflict", { x: 48, y: 48 });
    const settlement = {
      id: "harbor-label", name: "Harbor Label", position: { x: 48, y: 48 },
      population: 20, status: "steady" as const, connection: 1, stress: 0, discovered: true,
    };
    const speech: AcousticTextView = {
      acousticKind: "speech", id: "harbor-speech", sourceActorId: "human:speaker",
      sourceKind: "human", speakerLabel: "Nearby person", text: "Good day.",
      position: { x: 48, y: 48 }, progress: 0.2, priority: 900_000,
      salience: 900_000, tone: "restrained", variantSeed: 1,
    };
    let current: TideweftView = { ...base, settlements: [settlement], acousticText: [] };
    const harness = renderHarness(current, { viewport: { width, height } });
    const sharedLayout = vi.spyOn(playerPresentation, "layoutAcousticTextCallouts");
    try {
      harness.draw();
      const layer = harness.mount.children.find(({ className }) => className === "relief-label-layer");
      const harbor = layer?.children.find(({ textContent }) => textContent === settlement.name);
      if (!harbor || !layer) throw new Error("Expected ordinary harbor label");
      expect(harbor.hidden).toBe(false);
      const originalPosition = { ...harbor.style };
      // Use the ordinary label's final eased/clamped position. The fixture
      // supplies a lawful presentation placement, not a new runtime event or
      // browser-glyph proof. Native paired-GREET evidence covers actual CSS.
      const rect = {
        x: Number.parseFloat(harbor.style.left!) - 40,
        y: Number.parseFloat(harbor.style.top!) - 18, width: 80, height: 22,
      };
      const placed = {
        candidate: { id: speech.id, sourceId: speech.sourceActorId, priority: speech.priority,
          salience: speech.salience, anchor: { x: rect.x, y: rect.y },
          box: { width: rect.width, height: rect.height }, acousticText: speech },
        laneId: "above", rect,
      };
      const result = { placements: [placed], suppressions: [] };
      sharedLayout.mockReturnValue(result);
      vi.spyOn(harbor, "getBoundingClientRect").mockImplementation(() => {
        throw new Error("Ordinary label arbitration must not force DOM measurement");
      });
      current = { ...current, acousticText: [speech] };
      harness.setView(current);
      harness.draw();
      expect(harbor.hidden).toBe(true);
      expect(harbor.style).toEqual(originalPosition);
      const acoustic = layer.children.find(({ dataset, removed }) => dataset.acousticKind === "speech" && !removed);
      expect(acoustic?.hidden).toBe(false);
      expect(acoustic?.style.left).toBe(`${(rect.x + rect.width / 2).toFixed(1)}px`);
      expect(sharedLayout).toHaveBeenLastCalledWith(current.acousticText,
        playerPresentation.actorCalloutViewport(width, height), expect.any(Function), undefined, undefined);

      sharedLayout.mockReturnValue({ ...result,
        placements: [{ ...placed, rect: { ...rect, y: rect.y + 140 } }] });
      harness.draw();
      expect(harbor.hidden).toBe(false);
      // Essential destination guidance is not silently removed by this narrow
      // optional-name correction, even if its envelope conflicts with speech.
      sharedLayout.mockReturnValue(result);
      harness.setView({ ...current, player: { ...base.player, destination: settlement.position } });
      harness.draw();
      expect(harbor.dataset.tone).toBe("destination");
      expect(harbor.hidden).toBe(false);

      sharedLayout.mockReturnValue({ placements: [], suppressions: [] });
      harness.setView(current);
      harness.draw();
      expect(harbor.dataset.tone).toBe("harbor");
      expect(harbor.hidden).toBe(false);
      // A candidate that is layout-suppressed spends no screen occupancy.
      const { acousticText: _acousticText, ...legacy } = current;
      for (const restored of [{ ...current, acousticText: [] }, legacy]) {
        harness.setView(restored);
        harness.draw();
        expect(harbor.hidden).toBe(false);
      }
    } finally {
      sharedLayout.mockRestore();
      harness.renderer.destroy();
    }
  });

  it.each([
    [844, 390, false], [1_280, 720, false],
    [844, 390, true], [1_280, 720, true],
  ] as const)("lets an unrelated porter emotion yield only to placed acoustic occupancy at %sx%s (reduced motion: %s)", (width, height, reducedMotion) => {
    vi.stubGlobal("performance", { now: () => 0 });
    p5Harness.reducedMotion = reducedMotion;
    // Force the ordinary projection beyond the edge: arbitration must use
    // the final eased/clamped CSS position, not the raw projected anchor.
    p5Harness.projectionShiftX = width * 2;
    const base = view("unrelated-porter-acoustic-conflict", { x: 48, y: 48 });
    const porter = Object.freeze({
      actorId: "human:quiet-unrelated", id: "porter:quiet-unrelated",
      quickLabel: "Unknown porter", position: Object.freeze({ x: 48, y: 48 }),
      facing: 0, state: "waiting" as const, emotionMark: ":|" as const, selected: false,
    });
    const porters = Object.freeze([porter]);
    const speech: AcousticTextView = {
      acousticKind: "speech", id: "unrelated-speaker-speech", sourceActorId: "human:speaker",
      sourceKind: "human", speakerLabel: "Nearby person", text: "Good day.",
      position: { x: 48, y: 48 }, progress: 0.2, priority: 900_000,
      salience: 900_000, tone: "restrained", variantSeed: 1,
    };
    let current: TideweftView = { ...base, porters, acousticText: [] };
    const originalPorters = JSON.stringify(porters);
    const harness = renderHarness(current, { viewport: { width, height } });
    const sharedLayout = vi.spyOn(playerPresentation, "layoutAcousticTextCallouts");
    try {
      harness.draw();
      const layer = harness.mount.children.find(({ className }) => className === "relief-label-layer");
      const emotion = layer?.children.find(({ dataset, removed }) => (
        dataset.tone === "porter-emotion" && !removed
      ));
      if (!emotion || !layer) throw new Error("Expected unrelated observable porter emotion");
      expect(emotion.textContent).toBe(porter.emotionMark);
      expect(emotion.hidden).toBe(false);
      const originalPosition = { ...emotion.style };
      expect(Number.parseFloat(emotion.style.left!)).toBe(width - 12 - 144);
      const rect = {
        x: Number.parseFloat(emotion.style.left!) - 40,
        y: Number.parseFloat(emotion.style.top!) - 18, width: 80, height: 22,
      };
      const placed = {
        candidate: { id: speech.id, sourceId: speech.sourceActorId, priority: speech.priority,
          salience: speech.salience, anchor: { x: rect.x, y: rect.y },
          box: { width: rect.width, height: rect.height }, acousticText: speech },
        laneId: "above", rect,
      };
      const result = { placements: [placed], suppressions: [] };
      sharedLayout.mockReturnValue(result);
      const measurement = vi.spyOn(emotion, "getBoundingClientRect").mockImplementation(() => {
        throw new Error("Optional state arbitration must not force DOM measurement");
      });
      const bodyDraw = harness.instance.ellipsoid as ReturnType<typeof vi.fn>;
      const bodyCallsPerFrame = bodyDraw.mock.calls.length;
      expect(bodyCallsPerFrame).toBeGreaterThan(0);
      current = { ...current, acousticText: [speech] };
      harness.setView(current);
      harness.draw();
      expect(emotion.hidden).toBe(true);
      expect(emotion.removed).toBe(false);
      expect(emotion.style).toEqual(originalPosition);
      expect(bodyDraw).toHaveBeenCalledTimes(bodyCallsPerFrame * 2);
      const acoustic = layer.children.find(({ dataset, removed }) => (
        dataset.acousticKind === "speech" && !removed
      ));
      expect(acoustic?.hidden).toBe(false);
      expect(acoustic?.textContent).toBe(speech.text);
      expect(speech.sourceActorId).not.toBe(porter.actorId);
      expect(current.porters).toBe(porters);
      expect(JSON.stringify(current.porters)).toBe(originalPorters);

      sharedLayout.mockReturnValue({ ...result,
        placements: [{ ...placed, rect: { ...rect, y: rect.y + 140 } }] });
      harness.draw();
      expect(emotion.hidden).toBe(false);
      expect(emotion.style).toEqual(originalPosition);

      // A real input candidate with no placed envelope occupies no pixels.
      sharedLayout.mockReturnValue({ placements: [], suppressions: [] });
      harness.draw();
      expect(emotion.hidden).toBe(false);
      const { acousticText: _acousticText, ...legacy } = current;
      for (const restored of [{ ...current, acousticText: [] }, legacy]) {
        harness.setView(restored);
        harness.draw();
        expect(emotion.hidden).toBe(false);
        expect(emotion.textContent).toBe(porter.emotionMark);
        expect(JSON.stringify(restored.porters)).toBe(originalPorters);
      }
      expect(measurement).not.toHaveBeenCalled();
    } finally {
      sharedLayout.mockRestore();
      harness.renderer.destroy();
    }
  });

  it.each([
    [1_280, 720, false],
    [390, 844, false],
    [1_280, 720, true],
    [390, 844, true],
  ] as const)("matches shared mixed acoustic layout at %sx%s (reduced motion: %s)", (width, height, reducedMotion) => {
    vi.stubGlobal("performance", { now: () => 0 });
    p5Harness.reducedMotion = reducedMotion;
    const base = view("relief-mixed-acoustic", { x: 48, y: 48 });
    const acousticText: readonly AcousticTextView[] = [
      {
        acousticKind: "speech", id: "mixed-speech", sourceActorId: "human:mixed",
        sourceKind: "human", speakerLabel: "Nearby person", text: "Careful.",
        position: { x: 32, y: 32 }, progress: 0.2, priority: 900_000,
        salience: 900_000, tone: "alarmed", variantSeed: 1,
      },
      {
        acousticKind: "animal-call", id: "mixed-bark", sourceActorId: "animal:mixed",
        sourceKind: "animal", speakerLabel: "Nearby dog", text: "BARK!",
        position: { x: 64, y: 32 }, progress: 0.2, priority: 760_000,
        salience: 760_000, tone: "alarmed", variantSeed: 2,
      },
      {
        acousticKind: "physical", id: "mixed-scrape", sourceId: "player:mixed",
        sourceKind: "player", text: "scrape", semanticFamily: "scrape",
        position: { x: 32, y: 64 }, progress: 0.2, priority: 500_000,
        salience: 700_000, tone: "restrained", variantSeed: 3,
      },
      {
        acousticKind: "physical", id: "mixed-cargo-thud", sourceId: "cargo:mixed",
        sourceKind: "object", text: "thud", semanticFamily: "thud",
        position: { x: 64, y: 64 }, progress: 0.2, priority: 450_000,
        salience: 700_000, tone: "restrained", variantSeed: 4,
      },
    ];
    const legacySpeech = acousticText[0];
    if (legacySpeech?.acousticKind !== "speech") throw new Error("Mixed fixture needs its speech source");
    let current: TideweftView = {
      ...base,
      camera: { ...base.camera, zoom: 4 },
      player: {
        ...base.player,
        incident: {
          id: "mixed-old-incident", kind: "stumble", label: "OLD MIXED INCIDENT",
          progress: 0.2, variantSeed: 1,
        },
      },
      expressions: [{ ...legacySpeech, text: "OLD MIXED SPEECH" }],
      acousticText,
    };
    const layout = playerPresentation.layoutAcousticTextCallouts;
    const sharedLayout = vi.spyOn(playerPresentation, "layoutAcousticTextCallouts");
    let reservedRects: readonly AcousticTextRect[] = [];
    let animalCallTextMode: "full" | "important" = "full";
    const harness = renderHarness(current, { viewport: { width, height },
      getAcousticTextReservations: () => reservedRects,
      getAnimalCallTextMode: () => animalCallTextMode });
    try {
      expect(harness.instance).toMatchObject({ width, height });
      expect(harness.mount.getBoundingClientRect()).toMatchObject({ width, height });
      expect(harness.canvas.getBoundingClientRect()).toMatchObject({ width, height });
      expect(harness.instance.createCanvas).toHaveBeenCalledWith(width, height, "webgl");
      harness.renderer.resize();
      expect(harness.instance.resizeCanvas).toHaveBeenCalledWith(width, height, true);
      const viewport = playerPresentation.actorCalloutViewport(width, height);

      const drawAndCompare = () => {
        harness.draw();
        const args = sharedLayout.mock.calls.at(-1);
        if (args === undefined) throw new Error("Relief did not consume the shared acoustic adapter");
        expect(args[0]).toBe(current.acousticText);
        expect(args[1]).toEqual(viewport);
        expect(args[4]).toBe(animalCallTextMode);
        // Reuse the real terrain-aware Relief projector, not invented screen
        // anchors. These are the adapter's estimated envelopes, not measured
        // CSS glyphs or browser/mobile hardware evidence.
        const expected = layout(...args);
        const layer = harness.mount.children.find(({ className }) => className === "relief-label-layer");
        if (layer === undefined) throw new Error("Relief label layer was not mounted");
        const nodes = layer.children.filter((node) => !node.removed && node.dataset.acousticKind !== undefined);
        expect(nodes).toHaveLength(expected.placements.length);
        expect(nodes.length).toBeLessThanOrEqual(MAX_ACOUSTIC_TEXT_PLACEMENTS);
        expect(new Set(expected.placements.map(({ candidate }) => candidate.sourceId)).size).toBe(nodes.length);
        const snapshot = expected.placements.map(({ candidate, rect }) => {
          const node = nodes.find(({ textContent }) => textContent === candidate.acousticText.text);
          if (node === undefined) throw new Error(`Relief omitted placed acoustic label ${candidate.id}`);
          expect(node.hidden).toBe(false);
          expect(node.dataset.acousticKind).toBe(candidate.acousticText.acousticKind);
          expect(node.style.left).toBe(`${(rect.x + rect.width / 2).toFixed(1)}px`);
          expect(node.style.top).toBe(`${(rect.y + rect.height / 2).toFixed(1)}px`);
          expect(node.style.width).toBe(`${rect.width.toFixed(1)}px`);
          expect(node.style.maxWidth).toBe(node.style.width);
          expect(node.style.transform).toBe("translate(-50%, -50%)");
          expect(rect.x).toBeGreaterThanOrEqual(12);
          expect(rect.x + rect.width).toBeLessThanOrEqual(width - 12);
          expect(rect.y).toBeGreaterThan(viewport.safeTop);
          expect(rect.y + rect.height).toBeLessThan(height - viewport.safeBottom);
          const { left, top, width: renderedWidth } = node.style;
          if (left === undefined || top === undefined || renderedWidth === undefined) {
            throw new Error(`Relief placed acoustic label ${candidate.id} without complete CSS bounds`);
          }
          return {
            id: candidate.id, node, left, top, width: renderedWidth,
            rect: {
              x: parseFloat(left) - parseFloat(renderedWidth) / 2,
              y: parseFloat(top) - rect.height / 2,
              width: parseFloat(renderedWidth), height: rect.height,
            },
          };
        });
        for (let left = 0; left < snapshot.length; left += 1) {
          for (let right = left + 1; right < snapshot.length; right += 1) {
            // CSS centers/widths round to a tenth of a pixel; retain the
            // shared gutter except that bounded rounding allowance.
            expect(acousticTextRectsOverlap(
              snapshot[left]!.rect, snapshot[right]!.rect, DEFAULT_ACOUSTIC_TEXT_GUTTER - 0.2,
            )).toBe(false);
          }
        }
        return { snapshot, layer };
      };

      const first = drawAndCompare();
      const geometry = (snapshot: typeof first.snapshot) => snapshot.map(({ id, rect }) => ({ id, rect }));
      expect(first.snapshot).toHaveLength(4);
      expect(first.snapshot.map(({ id }) => id)).toEqual(acousticText.map(({ id }) => id));
      expect(drawAndCompare().snapshot).toEqual(first.snapshot);
      const animal = acousticText[1]!;
      if (animal.acousticKind !== "animal-call") throw new Error("Expected animal fixture");
      const quietItems = [...acousticText];
      quietItems[1] = { ...animal, criticalCall: false };
      current = { ...current, acousticText: quietItems };
      harness.setView(current);
      animalCallTextMode = "important";
      expect(drawAndCompare().snapshot.map(({ id }) => id)).toEqual([
        "mixed-speech", "mixed-scrape", "mixed-cargo-thud",
      ]);
      // The global source is untouched and the removed DOM cue is cleaned up.
      expect(current.acousticText).toBe(quietItems);
      quietItems[1] = { ...animal, criticalCall: true };
      expect(geometry(drawAndCompare().snapshot)).toEqual(geometry(first.snapshot));
      quietItems[1] = animal;
      expect(geometry(drawAndCompare().snapshot)).toEqual(geometry(first.snapshot));
      animalCallTextMode = "full";
      quietItems[1] = { ...animal, criticalCall: false };
      expect(geometry(drawAndCompare().snapshot)).toEqual(geometry(first.snapshot));
      current = { ...current, acousticText: [...acousticText].reverse() };
      harness.setView(current);
      expect(geometry(drawAndCompare().snapshot)).toEqual(geometry(first.snapshot));

      const crowded = acousticText.map((candidate) => ({ ...candidate, position: { x: 48, y: 48 } }));
      current = { ...current, acousticText: [
        ...crowded,
        { ...crowded[0]!, id: "mixed-repeated-source", text: "More words", priority: 100_000 },
      ] };
      harness.setView(current);
      const crowdedResult = drawAndCompare();
      expect(crowdedResult.snapshot.map(({ id }) => id)).toContain("mixed-speech");
      expect(crowdedResult.snapshot.map(({ id }) => id)).not.toContain("mixed-repeated-source");
      expect(drawAndCompare().snapshot).toEqual(crowdedResult.snapshot);
      current = { ...current, acousticText };
      harness.setView(current);
      reservedRects = [{ x: 0, y: 0, width, height }];
      expect(drawAndCompare().snapshot).toEqual([]);
      expect(current.acousticText).toBe(acousticText);
      reservedRects = [];
      expect(drawAndCompare().snapshot.map(({ id, rect }) => ({ id, rect })))
        .toEqual(first.snapshot.map(({ id, rect }) => ({ id, rect })));
      current = { ...current, acousticText: [] };
      harness.setView(current);
      expect(drawAndCompare().snapshot).toEqual([]);
      expect(first.layer.children.filter((node) => !node.removed && node.dataset.acousticKind !== undefined)).toEqual([]);
      expect(first.layer.children.some((node) => !node.removed && (
        node.textContent === "OLD MIXED INCIDENT" || node.textContent === "OLD MIXED SPEECH"
      ))).toBe(false);
    } finally {
      harness.renderer.destroy();
      sharedLayout.mockRestore();
    }
  });

  it("shares bounded arbitration with Chart and removes stale expression nodes", () => {
    vi.stubGlobal("performance", { now: () => 0 });
    const base = view("relief-situated-expression", { x: 48, y: 48 });
    let current: TideweftView = {
      ...base,
      player: {
        ...base.player,
        incident: {
          id: "legacy-stumble",
          kind: "stumble",
          label: "LEGACY INCIDENT",
          progress: 0.2,
          variantSeed: 1,
        },
      },
      expressions: [
        {
          acousticKind: "speech",
          id: "b-equal",
          sourceActorId: "human:b",
          sourceKind: "human",
          speakerLabel: "Nearby porter",
          text: "LATER EXPRESSION",
          position: { x: 48, y: 48 },
          progress: 0.2,
          priority: 5,
          salience: 4,
          tone: "restrained",
          variantSeed: 4,
        },
        {
          acousticKind: "animal-call",
          id: "a-equal",
          sourceActorId: "animal:a",
          sourceKind: "animal",
          speakerLabel: "Nearby animal",
          text: "SELECTED SHORT EXPRESSION",
          position: { x: 48, y: 48 },
          progress: 0.3,
          priority: 5,
          salience: 4,
          tone: "alarmed",
          variantSeed: 9,
        },
      ],
    };
    const harness = renderHarness(current);
    harness.draw();
    const layer = harness.mount.children.find((child) => child.className === "relief-label-layer");
    const selected = layer?.children.find((child) =>
      child.textContent === "SELECTED SHORT EXPRESSION" && !child.removed);
    if (!selected) throw new Error("expected selected situated expression label");
    expect(selected.dataset).toMatchObject({
      tone: "expression",
      expressionTone: "alarmed",
      sourceKind: "animal",
    });
    expect(layer?.children.some((child) =>
      child.textContent === "LATER EXPRESSION" && !child.removed)).toBe(false);
    expect(layer?.children.some((child) =>
      child.textContent === "LEGACY INCIDENT" && !child.removed)).toBe(false);

    current = { ...current, expressions: [] };
    harness.setView(current);
    harness.draw();
    expect(selected.removed).toBe(true);
    expect(layer?.children.some((child) =>
      child.textContent === "LEGACY INCIDENT" && !child.removed)).toBe(false);

    const { expressions: _expressions, ...legacy } = current;
    harness.setView(legacy);
    harness.draw();
    expect(layer?.children.some((child) =>
      child.textContent === "LEGACY INCIDENT" && !child.removed)).toBe(true);
    harness.renderer.destroy();
  });

  it("uses the unified acoustic layer and never revives legacy text for an explicit empty list", () => {
    vi.stubGlobal("performance", { now: () => 0 });
    const base = view("relief-acoustic-text", { x: 48, y: 48 });
    let current: TideweftView = {
      ...base,
      porters: [{
        actorId: "human:shared-acoustic",
        id: "porter:shared-acoustic",
        quickLabel: "Unknown porter · alert",
        position: { x: 48, y: 48 },
        facing: 0,
        state: "alert",
        emotionMark: ":S",
        selected: true,
      }],
      player: {
        ...base.player,
        incident: {
          id: "legacy-acoustic-stumble",
          kind: "stumble",
          label: "LEGACY ACOUSTIC INCIDENT",
          progress: 0.2,
          variantSeed: 1,
        },
      },
      expressions: [{
        acousticKind: "speech",
        id: "legacy-relief-expression",
        sourceActorId: "human:legacy",
        sourceKind: "human",
        speakerLabel: "Nearby porter",
        text: "LEGACY RELIEF EXPRESSION",
        position: { x: 48, y: 48 },
        progress: 0.2,
        priority: 4,
        salience: 4,
        tone: "restrained",
        variantSeed: 2,
      }],
      acousticText: [
        {
          acousticKind: "physical",
          id: "physical-thud",
          sourceId: "object:crate",
          sourceKind: "object",
          text: "RELIEF THUD",
          position: { x: 48, y: 48 },
          progress: 0.3,
          priority: 9,
          salience: 3,
          tone: "alarmed",
          variantSeed: 91,
          semanticFamily: "thud",
        },
        {
          acousticKind: "animal-call",
          id: "animal-warning",
          sourceActorId: "animal:warning",
          sourceKind: "animal",
          speakerLabel: "Nearby animal",
          text: "RELIEF WARNING CALL",
          position: { x: 48, y: 48 },
          progress: 0.4,
          priority: 9,
          salience: 7,
          tone: "alarmed",
          variantSeed: 37,
        },
        {
          acousticKind: "embodied-signal",
          id: "rabbit-foot-thump",
          sourceActorId: "animal:rabbit",
          sourceKind: "animal",
          speakerLabel: "Marsh rabbit",
          text: "thump",
          position: { x: 48, y: 48 },
          progress: 0.2,
          priority: 8,
          salience: 6,
          tone: "restrained",
          variantSeed: 17,
        },
        {
          acousticKind: "speech",
          id: "relief-matching-source-offscreen",
          sourceActorId: "human:shared-acoustic",
          sourceKind: "human",
          speakerLabel: "Nearby porter",
          text: "RELIEF OFFSCREEN MATCHING SPEECH",
          position: { x: 1_000_000, y: 1_000_000 },
          progress: 0.2,
          priority: 1,
          salience: 1,
          tone: "restrained",
          variantSeed: 18,
        },
      ],
    };
    const harness = renderHarness(current);
    harness.draw();
    const layer = harness.mount.children.find((child) => child.className === "relief-label-layer");
    const selected = layer?.children.find((child) =>
      child.textContent === "RELIEF WARNING CALL" && !child.removed);
    if (!selected) throw new Error("expected unified Relief acoustic label");
    expect(selected.dataset).toMatchObject({
      acousticKind: "animal-call",
      expressionTone: "alarmed",
      sourceKind: "animal",
      tone: "expression",
    });
    expect(layer?.children.some((child) =>
      child.textContent === "LEGACY RELIEF EXPRESSION" && !child.removed)).toBe(false);
    expect(layer?.children.some((child) =>
      child.textContent === "LEGACY ACOUSTIC INCIDENT" && !child.removed)).toBe(false);
    expect(layer?.children.some((child) =>
      child.textContent === "RELIEF OFFSCREEN MATCHING SPEECH" && !child.removed)).toBe(false);
    expect(layer?.children.some((child) =>
      child.dataset.tone === "porter-emotion" && !child.removed)).toBe(true);
    expect(layer?.children.some((child) =>
      child.dataset.tone === "porter" && !child.removed)).toBe(true);

    const originalAcousticText = current.acousticText;
    if (originalAcousticText === undefined) throw new Error("expected unified acoustic fixture");
    const sourceOwnedSpeech = {
      acousticKind: "speech" as const,
      id: "relief-source-owned-speech",
      sourceActorId: "human:shared-acoustic",
      sourceKind: "human" as const,
      speakerLabel: "Nearby porter",
      text: "RELIEF SOURCE OWNED SPEECH",
      position: { x: 48, y: 48 },
      progress: 0.2,
      priority: 10,
      salience: 10,
      tone: "restrained" as const,
      variantSeed: 24,
    };
    current = { ...current, acousticText: [sourceOwnedSpeech] };
    harness.setView(current);
    harness.draw();
    expect(layer?.children.some((child) =>
      child.textContent === "RELIEF SOURCE OWNED SPEECH" && !child.removed)).toBe(true);
    expect(layer?.children.some((child) =>
      child.dataset.tone === "porter-emotion" && !child.removed)).toBe(false);
    expect(layer?.children.some((child) =>
      child.dataset.tone === "porter" && !child.removed)).toBe(false);
    current = { ...current, acousticText: [{
      ...sourceOwnedSpeech, acousticKind: "indistinct-voice", text: "indistinct voice",
    }] };
    harness.setView(current);
    harness.draw();
    const indistinct = layer?.children.find((child) => !child.removed && !child.hidden
      && child.textContent === "indistinct voice");
    expect(indistinct?.dataset).toMatchObject({ acousticKind: "indistinct-voice", tone: "incident" });
    expect(layer?.children.some((child) => !child.removed && !child.hidden
      && child.textContent === "RELIEF SOURCE OWNED SPEECH")).toBe(false);
    current = { ...current, acousticText: originalAcousticText };
    harness.setView(current);

    const embodiedSignal = current.acousticText?.find(({ acousticKind }) => (
      acousticKind === "embodied-signal"
    ));
    if (!embodiedSignal) throw new Error("expected embodied acoustic signal fixture");
    const physicalAcousticText = current.acousticText?.find(({ acousticKind }) => (
      acousticKind === "physical"
    ));
    if (!physicalAcousticText) throw new Error("expected physical acoustic fixture");
    current = { ...current, acousticText: [physicalAcousticText] };
    harness.setView(current);
    harness.draw();
    const physical = layer?.children.find((child) =>
      child.textContent === "RELIEF THUD" && !child.removed);
    if (!physical) throw new Error("expected physical Relief acoustic label");
    expect(physical.dataset).toMatchObject({
      acousticKind: "physical",
      expressionTone: "alarmed",
      semanticFamily: "thud",
      sourceKind: "object",
      tone: "incident",
    });

    current = { ...current, acousticText: [embodiedSignal] };
    harness.setView(current);
    harness.draw();
    const embodied = layer?.children.find((child) => (
      child.textContent === "thump" && !child.removed
    ));
    if (!embodied) throw new Error("expected embodied Relief acoustic label");
    expect(embodied.dataset).toMatchObject({
      acousticKind: "embodied-signal",
      expressionTone: "restrained",
      sourceKind: "animal",
      tone: "incident",
    });
    expect(embodied.dataset).not.toHaveProperty("semanticFamily");

    current = { ...current, acousticText: [] };
    harness.setView(current);
    harness.draw();
    expect(selected.removed).toBe(true);
    expect(physical.removed).toBe(true);
    expect(embodied.removed).toBe(true);
    expect(layer?.children.some((child) =>
      child.textContent === "LEGACY RELIEF EXPRESSION" && !child.removed)).toBe(false);
    expect(layer?.children.some((child) =>
      child.textContent === "LEGACY ACOUSTIC INCIDENT" && !child.removed)).toBe(false);

    const { acousticText: _acousticText, ...expressionFallback } = current;
    current = expressionFallback;
    harness.setView(current);
    harness.draw();
    expect(layer?.children.some((child) =>
      child.textContent === "LEGACY RELIEF EXPRESSION" && !child.removed)).toBe(true);

    const { expressions: _expressions, ...incidentFallback } = current;
    harness.setView(incidentFallback);
    harness.draw();
    expect(layer?.children.some((child) =>
      child.textContent === "LEGACY ACOUSTIC INCIDENT" && !child.removed)).toBe(true);
    harness.renderer.destroy();
  });
});

describe("Relief dog presentation", () => {
  it.each([
    ["close behind", -7, 0, true],
    ["medium forward", 20, 0, true],
    ["far forward", 40, 0, false],
    ["medium sideways", 0, 20, false],
  ] as const)("retains broad-visible bodies but clips fine labels, style and picking %s", (_name, dx, dy, recognized) => {
    vi.stubGlobal("performance", { now: () => 0 });
    const player = { x: 12, y: 12 }, point = { x: 12 + dx * 24, y: 12 + dy * 24 };
    const base = view("relief-recognition-range", player);
    const origin = { x: Math.min(0, point.x - 24), y: Math.min(0, point.y - 24) };
    const columns = Math.max(4, Math.ceil((Math.max(player.x, point.x) - origin.x + 24) / 24));
    const rows = Math.max(4, Math.ceil((Math.max(player.y, point.y) - origin.y + 24) / 24));
    // Public renderer fixture, not a world perception receipt: each body is
    // already broadly DIRECT and fine presentation alone varies by range.
    const current: TideweftView = { ...base,
      camera: { center: point, zoom: 1, followPlayer: false,
        bounds: { minX: origin.x, minY: origin.y, maxX: origin.x + columns * 24, maxY: origin.y + rows * 24 } },
      perception: { version: 3, signature: "range-body", valid: true, visibleTileCount: columns * rows,
        directTileCount: columns * rows, peripheralTileCount: 0, detailVisibleTileCount: columns * rows,
        detailDirectTileCount: columns * rows, detailPeripheralTileCount: 0 },
      terrain: { ...base.terrain, origin, columns, rows, tiles: Array.from({ length: columns * rows }, () => ({
        kind: "meadow" as const, elevation: 0.2, discovered: 1, currentVisibility: 1, currentDetailVisibility: 1 as const,
      })) },
      porters: [{ actorId: "human:range", id: "porter:range", quickLabel: "Range keeper", position: point,
        facing: 0, state: "alert", selected: true, emotionMark: ":S",
        appearance: { heightScale: 1, build: "average", palette: "ember", wetness: 1 } }],
      dogs: [dogView({ position: point, selected: true })],
      wildlife: [wildlifeView("deer", { position: point, selected: true })],
      aggregateWildlifeEvidence: [aggregateWildlifeEvidenceView({ position: point, selected: true })],
      wildlifeCarcasses: [wildlifeCarcassView({ position: point })],
    };
    const before = JSON.stringify(current), harness = renderHarness(current);
    const ray = vi.spyOn(reliefCamera, "screenToDiscoveredReliefSurface").mockReturnValue(point);
    try {
      harness.draw();
      const translate = harness.instance.translate as ReturnType<typeof vi.fn>;
      expect(translate.mock.calls.filter(([x, _y, z]) => x === point.x && z === point.y).length).toBeGreaterThanOrEqual(5);
      const layer = harness.mount.children.find(({ className }) => className === "relief-label-layer");
      const copies = layer?.children.filter(({ removed, hidden }) => !removed && !hidden).map(({ textContent }) => textContent) ?? [];
      for (const copy of ["Range keeper", ":S", "Unknown dog · soaked", "Deer", "Brown rat signs · rat gnaw marks"]) {
        expect(copies.includes(copy), copy).toBe(recognized);
      }
      expect(p5Harness.materialTrace.some(({ method, args }) => method === "ambientMaterial" && args[0] === "#e58b62")).toBe(recognized);
      expect(harness.canvas.attributes.has("aria-description")).toBe(recognized);
      // Only the ray intersection is fixed here; the real selection predicate
      // and release-frame validator must independently enforce the tier.
      harness.canvas.fire("pointerdown", pointer(harness.canvas, { pointerId: 151 }));
      harness.canvas.fire("pointerup", pointer(harness.canvas, { pointerId: 151 }));
      expect(harness.dispatch.mock.calls.some(([command]) => command.type === "select" && command.entity === "porter")).toBe(recognized);
      if (!recognized) {
        const call: AcousticTextView = { acousticKind: "animal-call", id: "broad-range-bark",
          sourceActorId: current.dogs![0]!.actorId, sourceKind: "animal", speakerLabel: "Nearby dog", text: "BARK!",
          position: point, progress: 0.2, priority: 80, salience: 1, tone: "restrained", variantSeed: 1 };
        harness.setView({ ...current, acousticText: [call] });
        harness.draw();
        expect(layer?.children.some((node) => !node.removed && !node.hidden && node.textContent === "BARK!")).toBe(true);
      }
      expect(JSON.stringify(current)).toBe(before);
    } finally { ray.mockRestore(); harness.renderer.destroy(); }
  });

  it.each([[7, true], [9, true], [20, false], [40, false]] as const)("clips physical pickup silhouettes and hits at %s tiles without changing reach", (distance, visible) => {
    vi.stubGlobal("performance", { now: () => 0 });
    const player = { x: 12, y: 12 }, point = { x: 12 + distance * 24, y: 12 };
    const base = view("relief-pickup-range", player), columns = distance + 3;
    const parcel: LooseCargoView = { id: "range-parcel", region: { x: 0, y: 0 }, position: point, velocity: { x: 0, y: 0 },
      contentKind: "raw-material", resourceKind: "cordreed", resourceLabel: "Cordreed", quantity: 1, property: "ordinary",
      condition: 1, conditionBand: "sound", wetness: 0, contamination: 0, decay: 0, motion: "resting", snaggedBy: null,
      impactMark: "none", recoverable: true, recovery: "approach" };
    const resourcePosition = { x: point.x, y: point.y + 24 };
    const current: TideweftView = { ...base,
      camera: { center: point, zoom: 1, followPlayer: false, bounds: { minX: 0, minY: 0, maxX: columns * 24, maxY: 96 } },
      perception: { version: 3, signature: "range-pickup", valid: true, visibleTileCount: columns * 4,
        directTileCount: columns * 4, peripheralTileCount: 0, detailVisibleTileCount: columns * 4,
        detailDirectTileCount: columns * 4, detailPeripheralTileCount: 0 },
      terrain: { ...base.terrain, columns, rows: 4, tiles: Array.from({ length: columns * 4 }, () => ({
        kind: "meadow" as const, elevation: 0.2, discovered: 1, currentVisibility: 1, currentDetailVisibility: 1 as const,
      })) }, looseCargo: [parcel],
      fieldResources: [{ id: "range-cordreed", material: "cordreed", label: "Cordreed", knowledge: "charted",
        currentVisibility: 1, position: resourcePosition }],
    };
    const before = JSON.stringify(current), harness = renderHarness(current);
    let hitPoint = point;
    const ray = vi.spyOn(reliefCamera, "screenToDiscoveredReliefSurface").mockImplementation(() => hitPoint);
    const projection = vi.spyOn(reliefCamera, "projectReliefPoint").mockImplementation((position) => ({
      x: 160, y: 120 + position.y - point.y, depth: 100, visible: true,
    }));
    try {
      harness.draw();
      const translate = harness.instance.translate as ReturnType<typeof vi.fn>;
      expect(translate.mock.calls.some(([x, _y, z]) => x === point.x && z === point.y)).toBe(visible);
      expect(translate.mock.calls.some(([x, _y, z]) => x === resourcePosition.x && z === resourcePosition.y)).toBe(visible);
      harness.canvas.fire("pointerdown", pointer(harness.canvas, { pointerId: 152 }));
      harness.canvas.fire("pointerup", pointer(harness.canvas, { pointerId: 152 }));
      expect(harness.dispatch.mock.calls.some(([command]) => command.type === "parcel-target")).toBe(visible);
      expect(harness.dispatch.mock.calls.some(([command]) => command.type === "recover-loose-cargo")).toBe(false);
      harness.dispatch.mockClear(); hitPoint = resourcePosition;
      harness.canvas.fire("pointerdown", pointer(harness.canvas, { pointerId: 153, clientY: 144 }));
      harness.canvas.fire("pointerup", pointer(harness.canvas, { pointerId: 153, clientY: 144 }));
      expect(harness.dispatch.mock.calls.some(([command]) => command.type === "resource-target")).toBe(visible);
      expect(JSON.stringify(current)).toBe(before);
    } finally { ray.mockRestore(); projection.mockRestore(); harness.renderer.destroy(); }
  });

  it.each([1, 0.5, 0] as const)("grounds uncharted DIRECT biome, body and acoustic anchors without revealing hidden detail (%s)", (visibility) => {
    vi.stubGlobal("performance", { now: () => 0 });
    const base = view("uncharted-relief-source", { x: 48, y: 48 });
    const dog = dogView({
      position: { x: 36, y: 36 },
      sizeScale: 1,
      coat: { primary: "red", secondary: null, pattern: "solid", length: "short" },
      wetness: 0,
      conditionLabels: [],
    });
    const call: AcousticTextView = {
      acousticKind: "animal-call", id: "uncharted-direct-dog-call",
      sourceActorId: dog.actorId, sourceKind: "animal", speakerLabel: "Nearby dog",
      text: "BARK!", position: dog.position, progress: 0.2,
      priority: 80, salience: 1, tone: "restrained", variantSeed: 1,
    };
    const parcel: LooseCargoView = {
      id: "uncharted-direct-parcel", region: { x: 0, y: 0 },
      position: { x: 60, y: 36 }, velocity: { x: 0, y: 0 },
      contentKind: "raw-material", resourceKind: "cordreed", resourceLabel: "Cordreed",
      quantity: 1, property: "ordinary", condition: 1, conditionBand: "sound",
      wetness: 0, contamination: 0, decay: 0, motion: "resting", snaggedBy: null,
      impactMark: "none", recoverable: true, recovery: "approach",
    };
    const current: TideweftView = {
      ...base,
      perception: {
        version: 3,
        signature: `uncharted-relief-source:${visibility}`,
        valid: true,
        visibleTileCount: visibility > 0 ? 16 : 0,
        directTileCount: visibility === 1 ? 16 : 0,
        peripheralTileCount: visibility === 0.5 ? 16 : 0,
        detailVisibleTileCount: visibility > 0 ? 16 : 0,
        detailDirectTileCount: visibility === 1 ? 16 : 0,
        detailPeripheralTileCount: visibility === 0.5 ? 16 : 0,
      },
      terrain: {
        ...base.terrain,
        // This signed-world window contains three genuinely selected cosmetic
        // cells under the existing hash/threshold; the local 0,0 window has none.
        worldTileOrigin: { x: 0, y: 1 },
        tiles: base.terrain.tiles.map((tile) => ({
          ...tile, biome: "rain-meadow" as const, elevation: 0.7,
          discovered: 0, currentVisibility: visibility, currentDetailVisibility: visibility,
        })),
      },
      dogs: [dog],
      looseCargo: [parcel],
      // A renderer fixture supplies an already-authorized call, not a world
      // producer. The negative branch makes no unheard/hidden call assertion.
      acousticText: visibility === 1 ? [call] : [],
    };
    const before = JSON.stringify(current);
    const projection = vi.spyOn(reliefCamera, "projectReliefPoint");
    const harness = renderHarness(current);
    try {
      harness.draw();
      harness.canvas.fire("pointermove", pointer(harness.canvas));
      const line = harness.instance.line as ReturnType<typeof vi.fn>;
      const translate = harness.instance.translate as ReturnType<typeof vi.fn>;
      const verticalScale = current.terrain.tileSize * 2.9;
      const motifSurface = 0.7 * verticalScale + 0.8;
      const stemLift = current.terrain.tileSize * (0.19 + 0.5 * 0.12);
      const eligibleStems = current.terrain.tiles.flatMap((_tile, index) => {
        const column = index % current.terrain.columns;
        const row = Math.floor(index / current.terrain.columns);
        if (reliefTerrainDecorationHash01(current.terrain, column, row, 0x6269_6f6d) < 1 - 0.43) return [];
        const x = (column + 0.5) * current.terrain.tileSize;
        const z = (row + 0.5) * current.terrain.tileSize;
        return [[x, -motifSurface, z, x, -motifSurface - stemLift, z]];
      });
      expect(eligibleStems.length).toBeGreaterThan(0);
      const drawnStems = line.mock.calls.filter((coordinates) => coordinates.length === 6
        && eligibleStems.some(([x, _y, z]) => coordinates[0] === x && coordinates[3] === x
          && coordinates[2] === z && coordinates[5] === z)
        && Math.abs(Number(coordinates[1]) - Number(coordinates[4]) - stemLift) < 1e-8);
      expect(drawnStems).toHaveLength(visibility === 1 ? eligibleStems.length : 0);
      for (const stem of eligibleStems) {
        expect(line.mock.calls.some((coordinates) => coordinates.length === stem.length
          && coordinates.every((coordinate, index) => Math.abs(Number(coordinate) - stem[index]!) < 1e-8)))
          .toBe(visibility === 1);
      }
      const body = translate.mock.calls.find(([x, _y, z]) => x === dog.position.x && z === dog.position.y);
      const layer = harness.mount.children.find(({ className }) => className === "relief-label-layer");
      const label = layer?.children.find((node) => !node.removed && node.textContent === call.text);
      if (visibility === 1) {
        const surface = perceivedReliefSurfaceHeightAt(current.terrain, dog.position, verticalScale, true);
        expect(surface).toBeGreaterThan(0);
        const bodyBase = current.terrain.tileSize * 0.105;
        const bodyHeight = bodyBase * 0.7 * 0.94 + bodyBase * 0.92 * 0.72;
        expect(body?.[1]).toBeCloseTo(-surface - bodyHeight, 8);
        expect(projection).toHaveBeenCalledWith(dog.position,
          surface + current.terrain.tileSize * 0.72,
          expect.any(Object), { width: 320, height: 240 });
        expect(projection).toHaveBeenCalledWith(parcel.position,
          perceivedReliefSurfaceHeightAt(current.terrain, parcel.position, verticalScale, true)
            + current.terrain.tileSize * 0.24,
          expect.any(Object), { width: 320, height: 240 });
        expect(label?.hidden).toBe(false);
      } else {
        expect(body).toBeUndefined();
        expect(label).toBeUndefined();
        expect(projection.mock.calls.some(([position]) => position === parcel.position)).toBe(false);
        expect(p5Harness.materialTrace.some(({ method, args }) => (
          method === "ambientMaterial" && args[0] === "#98583d"
        ))).toBe(false);
      }
      expect(JSON.stringify(current)).toBe(before);
      expect(current.terrain.tiles.every((tile) => tile.discovered === 0)).toBe(true);
      expect(harness.dispatch).not.toHaveBeenCalled();
    } finally {
      harness.renderer.destroy();
      projection.mockRestore();
    }
  });

  it("renders a readable quadruped with honest coat/wetness, hover/selection emphasis, and detail gating", () => {
    vi.stubGlobal("performance", { now: () => 0 });
    const base = view("relief-dog", { x: 48, y: 48 });
    let current: TideweftView = {
      ...base,
      dogs: [dogView({ selected: true, conditionLabels: ["SOAKED", "INJURED"] })],
    };
    const harness = renderHarness(current);
    harness.draw();

    const layer = harness.mount.children.find((child) => child.className === "relief-label-layer");
    const selectedLabel = layer?.children.find((child) =>
      child.textContent === "Unknown dog · soaked · injured" && !child.removed);
    if (!selectedLabel) throw new Error("expected selected dog label");
    expect(selectedLabel.dataset).toMatchObject({ tone: "dog", selected: "true" });
    expect(layer?.children.map((child) => child.textContent).join(" "))
      .not.toContain("D-R-v1-relief-dog");
    expect(p5Harness.materialTrace.some(({ method, args }) =>
      method === "ambientMaterial" && args[0] === "#98583d"
    )).toBe(true);
    expect(p5Harness.materialTrace.some(({ method, args }) =>
      method === "emissiveMaterial" && args[0] === "#98583d"
    )).toBe(false);
    expect(harness.instance.ellipsoid).toHaveBeenCalled();
    expect(harness.instance.sphere).toHaveBeenCalled();
    expect(harness.instance.cone).toHaveBeenCalled();
    expect(harness.instance.box).toHaveBeenCalled();

    current = {
      ...base,
      dogs: [dogView({ position: { x: 12, y: 12 }, selected: false })],
    };
    harness.setView(current);
    harness.canvas.fire("pointermove", pointer(harness.canvas));
    harness.draw();
    const hoverLabel = [...(layer?.children ?? [])].reverse().find((child) =>
      child.textContent === "Unknown dog · soaked" && !child.removed);
    expect(hoverLabel?.dataset).toMatchObject({ tone: "dog", selected: "true" });
    expect(harness.dispatch).not.toHaveBeenCalled();

    harness.canvas.fire("pointerdown", pointer(harness.canvas, { pointerId: 91 }));
    harness.canvas.fire("pointerup", pointer(harness.canvas, { pointerId: 91 }));
    expect(harness.dispatch).toHaveBeenLastCalledWith({
      type: "select",
      entity: "living-actor",
      species: "domestic-dog",
      id: "D-R-v1-relief-dog",
      point: { x: 12, y: 12 },
    });

    harness.dispatch.mockClear();
    harness.canvas.fire("pointerdown", pointer(harness.canvas, {
      pointerId: 92,
      pointerType: "touch",
    }));
    harness.canvas.fire("pointerup", pointer(harness.canvas, {
      pointerId: 92,
      pointerType: "touch",
    }));
    expect(harness.dispatch).toHaveBeenCalledOnce();
    expect(harness.dispatch).toHaveBeenCalledWith({
      type: "select",
      entity: "living-actor",
      species: "domestic-dog",
      id: "D-R-v1-relief-dog",
      point: { x: 12, y: 12 },
    });

    p5Harness.materialTrace.length = 0;
    harness.dispatch.mockClear();
    current = {
      ...base,
      perception: {
        version: 1,
        signature: "relief-dog-hidden",
        valid: true,
        visibleTileCount: 16,
        directTileCount: 16,
        peripheralTileCount: 0,
        detailVisibleTileCount: 0,
        detailDirectTileCount: 0,
        detailPeripheralTileCount: 0,
      },
      terrain: {
        ...base.terrain,
        tiles: base.terrain.tiles.map((tile) => ({
          ...tile,
          currentVisibility: 1,
          currentDetailVisibility: 0 as const,
        })),
      },
      dogs: [dogView({ selected: true })],
    };
    harness.setView(current);
    harness.draw();
    expect(layer?.children.some((child) => child.dataset.tone === "dog" && !child.removed))
      .toBe(false);
    expect(p5Harness.materialTrace.some(({ method, args }) =>
      method === "ambientMaterial" && args[0] === "#98583d"
    )).toBe(false);
    harness.canvas.fire("pointerdown", pointer(harness.canvas, { pointerId: 93 }));
    harness.canvas.fire("pointerup", pointer(harness.canvas, { pointerId: 93 }));
    expect(harness.dispatch.mock.calls.some(([command]) =>
      (command as { type?: unknown }).type === "select"
    )).toBe(false);
    harness.renderer.destroy();
  });
});

describe("Relief physical wildlife remains", () => {
  it("draws color-independent forms, exposes direct labels, and keeps carcass taps as travel", () => {
    vi.stubGlobal("performance", { now: () => 0 });
    const base = view("relief-carcass", { x: 48, y: 48 });
    let current: TideweftView = {
      ...base,
      perception: {
        version: 1,
        signature: "relief-carcass-direct-detail",
        valid: true,
        visibleTileCount: 16,
        directTileCount: 16,
        peripheralTileCount: 0,
        detailVisibleTileCount: 16,
        detailDirectTileCount: 16,
        detailPeripheralTileCount: 0,
      },
      terrain: {
        ...base.terrain,
        tiles: base.terrain.tiles.map((tile) => ({
          ...tile,
          currentVisibility: 1,
          currentDetailVisibility: 1 as const,
        })),
      },
      wildlifeCarcasses: [
        wildlifeCarcassView({ position: { x: 12, y: 12 } }),
        wildlifeCarcassView({
          carcassId: "wildlife-carcass:fedcba9876543210",
          form: "depleted-remains",
          quickLabel: "Marsh rabbit remains",
          position: { x: 52, y: 48 },
        }),
      ],
    };
    const harness = renderHarness(current);
    harness.draw();
    const ellipsoid = harness.instance.ellipsoid as ReturnType<typeof vi.fn>;
    const sphere = harness.instance.sphere as ReturnType<typeof vi.fn>;
    const box = harness.instance.box as ReturnType<typeof vi.fn>;
    expect(p5Harness.materialTrace.some(({ method, args }) =>
      method === "ambientMaterial" && args[0] === "#694f42"
    )).toBe(true);
    expect(p5Harness.materialTrace.some(({ method, args }) =>
      method === "ambientMaterial" && args[0] === "#c7b89b"
    )).toBe(true);
    expect(ellipsoid.mock.calls.some(([x, y, z]) => (
      Math.abs(Number(x) - 3.24) < 0.001
      && Math.abs(Number(y) - 0.864) < 0.001
      && Math.abs(Number(z) - 1.296) < 0.001
    ))).toBe(true);
    expect(sphere.mock.calls.some(([radius]) => (
      Math.abs(Number(radius) - 0.828) < 0.001
    ))).toBe(true);
    expect(box.mock.calls.some(([x, y, z]) => (
      Math.abs(Number(x) - 4.5) < 0.001
      && Math.abs(Number(y) - 0.216) < 0.001
      && Math.abs(Number(z) - 0.252) < 0.001
    ))).toBe(true);
    expect(harness.canvas.attributes.get("aria-description")).toBe(
      "Nearby wildlife remains: Marsh rabbit body; Marsh rabbit remains.",
    );

    harness.canvas.fire("pointermove", pointer(harness.canvas));
    harness.draw();
    const layer = harness.mount.children.find((child) => (
      child.className === "relief-label-layer"
    ));
    const label = [...(layer?.children ?? [])].reverse().find((child) => (
      child.textContent === "Marsh rabbit body" && !child.removed
    ));
    expect(label?.dataset).toMatchObject({ tone: "wildlife", selected: "true" });
    expect(Number.parseFloat(label?.style.left ?? "NaN")).toBeGreaterThanOrEqual(60);
    expect(Number.parseFloat(label?.style.left ?? "NaN")).toBeLessThanOrEqual(260);
    expect(Number.parseFloat(label?.style.top ?? "NaN")).toBeGreaterThanOrEqual(28);
    expect(Number.parseFloat(label?.style.top ?? "NaN")).toBeLessThanOrEqual(206);
    expect(harness.dispatch).not.toHaveBeenCalled();

    harness.canvas.fire("pointerdown", pointer(harness.canvas, { pointerId: 91 }));
    harness.canvas.fire("pointerup", pointer(harness.canvas, { pointerId: 91 }));
    expect(harness.dispatch).toHaveBeenLastCalledWith({
      type: "move-target",
      point: { x: 12, y: 12 },
      additive: false,
    });
    expect(harness.dispatch.mock.calls.some(([command]) => (
      (command as { type?: unknown }).type === "select"
    ))).toBe(false);

    p5Harness.materialTrace.length = 0;
    harness.dispatch.mockClear();
    current = {
      ...current,
      terrain: {
        ...current.terrain,
        tiles: current.terrain.tiles.map((tile) => ({
          ...tile,
          currentDetailVisibility: 0 as const,
        })),
      },
    };
    harness.setView(current);
    harness.draw();
    expect(p5Harness.materialTrace.some(({ args }) => args[0] === "#694f42")).toBe(false);
    expect(p5Harness.materialTrace.some(({ args }) => args[0] === "#c7b89b")).toBe(false);
    expect(harness.canvas.attributes.has("aria-description")).toBe(false);
    expect(layer?.children.some((child) => (
      child.textContent === "Marsh rabbit body" && !child.removed
    ))).toBe(false);
    harness.renderer.destroy();
  });
});

describe(`${ALPHA33_ALPINE_PRESENTATION_INVARIANTS_OWNER_INTENT} ${ALPHA34_POLAR_PRESENTATION_INVARIANTS_OWNER_INTENT} ${ALPHA37_ESTUARY_BREADTH_PRESENTATION_INVARIANTS_OWNER_INTENT} Relief wildlife presentation`, () => {
  it("renders and touch-selects aggregate population evidence without an actor target", () => {
    vi.stubGlobal("performance", { now: () => 0 });
    const base = view("relief-rat-evidence", { x: 48, y: 48 });
    const evidence = aggregateWildlifeEvidenceView({ selected: true });
    const current: TideweftView = {
      ...base,
      perception: {
        version: 1,
        signature: "relief-rat-evidence-direct-detail",
        valid: true,
        visibleTileCount: 16,
        directTileCount: 16,
        peripheralTileCount: 0,
        detailVisibleTileCount: 16,
        detailDirectTileCount: 16,
        detailPeripheralTileCount: 0,
      },
      terrain: {
        ...base.terrain,
        tiles: base.terrain.tiles.map((tile) => ({
          ...tile,
          currentVisibility: 1,
          currentDetailVisibility: 1 as const,
        })),
      },
      aggregateWildlifeEvidence: [evidence],
    };
    const harness = renderHarness(current);
    harness.draw();

    const layer = harness.mount.children.find((child) => child.className === "relief-label-layer");
    const evidenceLabel = layer?.children.find((child) =>
      child.dataset.tone === "wildlife" && !child.removed
    );
    expect(evidenceLabel?.textContent).toBe("Brown rat signs · rat gnaw marks");
    expect(layer?.children.map((child) => child.textContent).join(" "))
      .not.toMatch(/RAT-AREA|evidence:0/u);
    expect(harness.instance.box).toHaveBeenCalled();
    expect(p5Harness.materialTrace.some(({ method, args }) =>
      method === "ambientMaterial" && args[0] === "#76563e"
    )).toBe(true);

    harness.canvas.fire("pointerdown", pointer(harness.canvas, {
      pointerId: 182,
      pointerType: "touch",
    }));
    harness.canvas.fire("pointerup", pointer(harness.canvas, {
      pointerId: 182,
      pointerType: "touch",
    }));
    expect(harness.dispatch).toHaveBeenCalledWith({
      type: "select",
      entity: "aggregate-wildlife-evidence",
      species: "brown-rat",
      aggregateId: evidence.aggregateId,
      evidenceId: evidence.evidenceId,
      point: { x: 12, y: 12 },
    });
    expect(harness.dispatch.mock.calls.some(([command]) =>
      (command as { entity?: unknown }).entity === "living-actor"
    )).toBe(false);
    harness.renderer.destroy();
  });

  it("renders and touch-selects frog impressions without fabricating frog actors", () => {
    vi.stubGlobal("performance", { now: () => 0 });
    const base = view("relief-frog-evidence", { x: 48, y: 48 });
    const evidence = aggregateWildlifeEvidenceView({
      aggregateId: "FROG-AREA-v1-relief-aggregate",
      evidenceId: "FROG-AREA-v1-relief-aggregate:evidence:0",
      species: "southern-leopard-frog",
      representation: "population-evidence",
      form: "frog-tracks",
      quickLabel: "Southern leopard frog signs",
      identityLabel: "Southern leopard frog population signs",
      evidenceLabel: "Leopard frog mud impressions",
      sizeScale: 0.78,
      selected: true,
    });
    const current: TideweftView = {
      ...base,
      perception: {
        version: 1,
        signature: "relief-frog-evidence-direct-detail",
        valid: true,
        visibleTileCount: 16,
        directTileCount: 16,
        peripheralTileCount: 0,
        detailVisibleTileCount: 16,
        detailDirectTileCount: 16,
        detailPeripheralTileCount: 0,
      },
      terrain: {
        ...base.terrain,
        tiles: base.terrain.tiles.map((tile) => ({
          ...tile,
          currentVisibility: 1,
          currentDetailVisibility: 1 as const,
        })),
      },
      aggregateWildlifeEvidence: [evidence],
    };
    const harness = renderHarness(current);
    harness.draw();

    const layer = harness.mount.children.find((child) => child.className === "relief-label-layer");
    expect(layer?.children.some((child) => (
      child.textContent === "Southern leopard frog signs · leopard frog mud impressions"
      && !child.removed
    ))).toBe(true);
    expect(p5Harness.materialTrace.some(({ method, args }) => (
      method === "ambientMaterial" && args[0] === "#536b3d"
    ))).toBe(true);
    harness.canvas.fire("pointerdown", pointer(harness.canvas, {
      pointerId: 186,
      pointerType: "touch",
    }));
    harness.canvas.fire("pointerup", pointer(harness.canvas, {
      pointerId: 186,
      pointerType: "touch",
    }));
    expect(harness.dispatch).toHaveBeenCalledWith({
      type: "select",
      entity: "aggregate-wildlife-evidence",
      species: "southern-leopard-frog",
      aggregateId: evidence.aggregateId,
      evidenceId: evidence.evidenceId,
      point: { x: 12, y: 12 },
    });
    expect(harness.dispatch.mock.calls.some(([command]) => (
      (command as { entity?: unknown }).entity === "living-actor"
    ))).toBe(false);
    harness.renderer.destroy();
  });

  it.each([
    ["atlantic-silverside", "surface-dimples", "#55c7dc", "torus", "Atlantic silverside signs", "Atlantic silverside school signs", "Silverside surface dimples and school glints", true, "deep-water"],
    ["atlantic-capelin", "surface-dimples", "#55c7dc", "torus", "Aquatic activity", "Unidentified aquatic activity", "Aquatic surface dimples and brief glints", false, "deep-water"],
    ["bay-anchovy", "surface-dimples", "#55c7dc", "torus", "Aquatic activity", "Unidentified aquatic activity", "Aquatic surface dimples and brief glints", false, "deep-water"],
    ["atlantic-marsh-fiddler-crab", "burrow-openings", "#4c392b", "torus", "Atlantic marsh fiddler crab signs", "Atlantic marsh fiddler crab area signs", "Fiddler crab burrow openings", true, "mudflat"],
    ["atlantic-marsh-fiddler-crab", "feeding-scrapes", "#735b43", "line", "Atlantic marsh fiddler crab signs", "Atlantic marsh fiddler crab area signs", "Fiddler crab feeding scrapes", true, "mudflat"],
    ["atlantic-ghost-crab", "burrow-openings", "#4c392b", "torus", "Shoreline signs", "Unidentified shoreline activity", "Small shoreline burrow openings", false, "mudflat"],
    ["atlantic-ghost-crab", "feeding-scrapes", "#735b43", "line", "Shoreline signs", "Unidentified shoreline activity", "Fine shoreline feeding scrapes", false, "mudflat"],
    ["american-pika", "haypile", "#737848", "ellipsoid", "American pika signs", "American pika population signs", "American pika haypile", true, "ridge"],
    ["american-pika", "talus-sign", "#777b73", "cone", "American pika signs", "American pika population signs", "American pika talus sign", true, "ridge"],
    ["eastern-saltmarsh-mosquito", "airborne-swarm", "#d8c98f", "sphere", "Flying-insect activity", "Unidentified flying-insect activity", "A loose haze of tiny flying insects", false, "salt-marsh"],
    ["marsh-periwinkle", "shell-clusters", "#7d765d", "torus", "Salt-marsh shell signs", "Unidentified salt-marsh shell signs", "Clusters of small salt-marsh shells", false, "salt-marsh"],
    ["marsh-periwinkle", "grazing-traces", "#62694c", "line", "Salt-marsh shell signs", "Unidentified salt-marsh shell signs", "Fine grazing and crawl traces on the marsh surface", false, "salt-marsh"],
  ] as const)("renders and pointer-selects low-cost %s %s without an actor alias", (
    species,
    form,
    primary,
    structuralMethod,
    quickLabel,
    identityLabel,
    evidenceLabel,
    speciesIdentified,
    terrainKind,
  ) => {
    vi.stubGlobal("performance", { now: () => 2_117 });
    p5Harness.reducedMotion = true;
    const base = view(`relief-tidal-${form}`, { x: 48, y: 48 });
    const evidence = aggregateWildlifeEvidenceView({
      aggregateId: `TIDAL-AREA-${species}`,
      evidenceId: `TIDAL-EVIDENCE-${form}`,
      species,
      form,
      quickLabel,
      identityLabel,
      evidenceLabel,
      speciesIdentified,
      selected: true,
    });
    const current: TideweftView = {
      ...base,
      perception: {
        version: 1,
        signature: `relief-tidal-${form}-direct-detail`,
        valid: true,
        visibleTileCount: 16,
        directTileCount: 16,
        peripheralTileCount: 0,
        detailVisibleTileCount: 16,
        detailDirectTileCount: 16,
        detailPeripheralTileCount: 0,
      },
      terrain: {
        ...base.terrain,
        tiles: base.terrain.tiles.map((tile) => ({
          ...tile,
          kind: terrainKind,
          currentVisibility: 1,
          currentDetailVisibility: 1 as const,
        })),
      },
      aggregateWildlifeEvidence: [evidence],
    };
    const harness = renderHarness(current);
    harness.draw();

    expect(p5Harness.materialTrace.some(({ method, args }) => (
      method === "ambientMaterial" && args[0] === primary
    ))).toBe(true);
    expect(harness.instance[structuralMethod]).toHaveBeenCalled();
    const layer = harness.mount.children.find((child) => child.className === "relief-label-layer");
    const visibleText = layer?.children.map((child) => child.textContent).join(" ") ?? "";
    expect(visibleText).not.toContain(evidence.aggregateId);
    expect(visibleText).not.toContain(evidence.evidenceId);
    expect(visibleText).not.toMatch(/\b48\b|actorId|mortality|carcass/iu);
    if (!speciesIdentified) {
      expect(visibleText).not.toMatch(/anchovy|capelin|ghost crab|mosquito|periwinkle/iu);
    }
    if (species === "atlantic-capelin") {
      const torus = harness.instance.torus as ReturnType<typeof vi.fn>;
      const surfaceRings = torus.mock.calls.map((call: unknown[]) => [...call]);
      torus.mockClear();
      harness.draw();
      expect(torus.mock.calls).toEqual(surfaceRings);
    }
    const pointerTypes = species === "atlantic-capelin"
      ? (["mouse", "touch"] as const)
      : (["touch"] as const);
    for (const [index, pointerType] of pointerTypes.entries()) {
      harness.dispatch.mockClear();
      harness.canvas.fire("pointerdown", pointer(harness.canvas, {
        pointerId: 187 + index,
        pointerType,
      }));
      harness.canvas.fire("pointerup", pointer(harness.canvas, {
        pointerId: 187 + index,
        pointerType,
      }));
      expect(harness.dispatch).toHaveBeenCalledWith({
        type: "select",
        entity: "aggregate-wildlife-evidence",
        species,
        aggregateId: evidence.aggregateId,
        evidenceId: evidence.evidenceId,
        point: { x: 12, y: 12 },
      });
    }
    expect(harness.dispatch.mock.calls.some(([command]) => (
      (command as { entity?: unknown }).entity === "living-actor"
    ))).toBe(false);
    harness.renderer.destroy();
  });

  it("renders direct cat pawprints in Relief without creating an evidence selection target", () => {
    vi.stubGlobal("performance", { now: () => 0 });
    const base = view("relief-cat-rain-evidence", { x: 48, y: 48 });
    const evidence = aggregateWildlifeEvidenceView({
      aggregateId: "CAT-R-v1-relief-rain-source",
      evidenceId: "CAT-R-v1-relief-rain-source:e:1:wet-tracks",
      species: "domestic-cat",
      representation: "individual-evidence",
      form: "small-tracks",
      quickLabel: "Domestic cat signs",
      identityLabel: "Domestic cat tracks",
      evidenceLabel: "Wet cat pawprints",
      sizeScale: 1.02,
    });
    const current: TideweftView = {
      ...base,
      perception: {
        version: 1,
        signature: "relief-cat-rain-evidence-direct-detail",
        valid: true,
        visibleTileCount: 16,
        directTileCount: 16,
        peripheralTileCount: 0,
        detailVisibleTileCount: 16,
        detailDirectTileCount: 16,
        detailPeripheralTileCount: 0,
      },
      terrain: {
        ...base.terrain,
        tiles: base.terrain.tiles.map((tile) => ({
          ...tile,
          currentVisibility: 1,
          currentDetailVisibility: 1 as const,
        })),
      },
      aggregateWildlifeEvidence: [evidence],
    };
    const harness = renderHarness(current);
    harness.draw();

    expect(harness.instance.ellipsoid).toHaveBeenCalled();
    harness.canvas.fire("pointerdown", pointer(harness.canvas, {
      pointerId: 183,
      pointerType: "touch",
    }));
    harness.canvas.fire("pointerup", pointer(harness.canvas, {
      pointerId: 183,
      pointerType: "touch",
    }));
    expect(harness.dispatch.mock.calls.some(([command]) => (
      (command as { entity?: unknown }).entity === "aggregate-wildlife-evidence"
    ))).toBe(false);
    expect(harness.dispatch.mock.calls.some(([command]) => (
      (command as { entity?: unknown }).entity === "living-actor"
    ))).toBe(false);
    harness.renderer.destroy();
  });

  it.each([
    ["marsh-rabbit", "paired-tracks", "#80694f"],
    ["marsh-fox", "canid-pawprints", "#765b48"],
  ] as const)("renders non-targetable %s movement evidence as %s", (
    species,
    form,
    primary,
  ) => {
    vi.stubGlobal("performance", { now: () => 0 });
    const base = view(`relief-${species}-evidence`, { x: 48, y: 48 });
    const evidence = aggregateWildlifeEvidenceView({
      aggregateId: `${species}:source-hidden-from-labels`,
      evidenceId: `${species}:movement-evidence:1`,
      species,
      representation: "individual-evidence",
      form,
      quickLabel: species === "marsh-rabbit" ? "Marsh rabbit signs" : "Marsh fox signs",
      identityLabel: species === "marsh-rabbit" ? "Marsh rabbit tracks" : "Marsh fox tracks",
      evidenceLabel: species === "marsh-rabbit" ? "Paired rabbit tracks" : "Fox pawprints",
      sizeScale: species === "marsh-rabbit" ? 0.94 : 1.12,
      selected: false,
    });
    const current: TideweftView = {
      ...base,
      perception: {
        version: 1,
        signature: `relief-${species}-evidence-direct-detail`,
        valid: true,
        visibleTileCount: 16,
        directTileCount: 16,
        peripheralTileCount: 0,
        detailVisibleTileCount: 16,
        detailDirectTileCount: 16,
        detailPeripheralTileCount: 0,
      },
      terrain: {
        ...base.terrain,
        tiles: base.terrain.tiles.map((tile) => ({
          ...tile,
          currentVisibility: 1,
          currentDetailVisibility: 1 as const,
        })),
      },
      aggregateWildlifeEvidence: [evidence],
    };
    const harness = renderHarness(current);
    harness.draw();

    expect(p5Harness.materialTrace.some(({ method, args }) => (
      method === "ambientMaterial" && args[0] === primary
    ))).toBe(true);
    const layer = harness.mount.children.find((child) => child.className === "relief-label-layer");
    expect(layer?.children.some((child) => child.textContent?.includes(evidence.evidenceId)))
      .toBe(false);
    harness.canvas.fire("pointerdown", pointer(harness.canvas, {
      pointerId: 185,
      pointerType: "touch",
    }));
    harness.canvas.fire("pointerup", pointer(harness.canvas, {
      pointerId: 185,
      pointerType: "touch",
    }));
    expect(harness.dispatch.mock.calls.some(([command]) => (
      (command as { type?: unknown }).type === "select"
    ))).toBe(false);
    harness.renderer.destroy();
  });

  it("fails closed for aggregate evidence outside direct detail", () => {
    vi.stubGlobal("performance", { now: () => 0 });
    const base = view("relief-rat-evidence-hidden", { x: 48, y: 48 });
    const hidden: TideweftView = {
      ...base,
      perception: {
        version: 1,
        signature: "relief-rat-evidence-hidden",
        valid: true,
        visibleTileCount: 16,
        directTileCount: 16,
        peripheralTileCount: 0,
        detailVisibleTileCount: 0,
        detailDirectTileCount: 0,
        detailPeripheralTileCount: 0,
      },
      terrain: {
        ...base.terrain,
        tiles: base.terrain.tiles.map((tile) => ({
          ...tile,
          currentVisibility: 1,
          currentDetailVisibility: 0 as const,
        })),
      },
      aggregateWildlifeEvidence: [aggregateWildlifeEvidenceView({ selected: true })],
    };
    const harness = renderHarness(hidden);
    harness.draw();

    const layer = harness.mount.children.find((child) => child.className === "relief-label-layer");
    expect(layer?.children.some((child) => child.dataset.tone === "wildlife" && !child.removed))
      .toBe(false);
    expect(p5Harness.materialTrace.some(({ method, args }) =>
      method === "ambientMaterial" && args[0] === "#76563e"
    )).toBe(false);
    harness.canvas.fire("pointerdown", pointer(harness.canvas, { pointerId: 183 }));
    harness.canvas.fire("pointerup", pointer(harness.canvas, { pointerId: 183 }));
    expect(harness.dispatch.mock.calls.some(([command]) =>
      (command as { type?: unknown }).type === "select"
    )).toBe(false);
    harness.renderer.destroy();
  });

  it("renders distinct low-cost silhouettes and only projected observable labels", () => {
    vi.stubGlobal("performance", { now: () => 0 });
    const base = view("relief-wildlife", { x: 48, y: 48 });
    const current: TideweftView = {
      ...base,
      wildlife: [
        wildlifeView("deer", {
          actorId: "DEER-VISIBLE",
          position: { x: 30, y: 48 },
          conditionLabels: ["ALERT"],
          selected: true,
        }),
        wildlifeView("gull", {
          actorId: "GULL-FLOCK",
          groupSize: 7,
          conditionLabels: ["WATCHFUL"],
          selected: true,
        }),
        wildlifeView("black-bear", {
          actorId: "BEAR-VISIBLE",
          position: { x: 66, y: 48 },
          conditionLabels: ["WET"],
          selected: true,
        }),
        wildlifeView("domestic-cat", {
          actorId: "CAT-VISIBLE",
          position: { x: 84, y: 48 },
          conditionLabels: ["WATCHFUL"],
          selected: true,
        }),
        wildlifeView("marsh-rabbit", {
          actorId: "RABBIT-VISIBLE",
          position: { x: 36, y: 72 },
          behavior: "flee",
          conditionLabels: ["ALERT"],
          selected: true,
        }),
        wildlifeView("marsh-fox", {
          actorId: "FOX-VISIBLE",
          position: { x: 72, y: 72 },
          behavior: "pursue",
          conditionLabels: ["TENSE"],
          selected: true,
        }),
        wildlifeView("fish-crow", {
          actorId: "CROW-VISIBLE",
          position: { x: 30, y: 24 },
          groupSize: 3,
          behavior: "alarm",
          conditionLabels: ["WATCHFUL"],
          selected: true,
        }),
        wildlifeView("northern-harrier", {
          actorId: "HARRIER-VISIBLE",
          position: { x: 66, y: 24 },
          behavior: "pursue",
          conditionLabels: ["ALERT"],
          selected: true,
        }),
        wildlifeView("snowy-egret", {
          actorId: "EGRET-VISIBLE",
          position: { x: 84, y: 24 },
          behavior: "forage",
          conditionLabels: ["WATCHFUL"],
          selected: true,
        }),
        wildlifeView("american-black-duck", {
          actorId: "DUCK-VISIBLE",
          position: { x: 12, y: 72 },
          behavior: "forage",
          conditionLabels: ["WATCHFUL"],
          selected: true,
        }),
        wildlifeView("domestic-chicken", {
          actorId: "CHICKEN-VISIBLE",
          position: { x: 84, y: 72 },
          behavior: "forage",
          conditionLabels: ["WATCHFUL"],
          selected: true,
        }),
        wildlifeView("north-american-river-otter", {
          actorId: "OTTER-VISIBLE",
          position: { x: 48, y: 84 },
          behavior: "dive",
          conditionLabels: ["WATCHFUL"],
          selected: true,
        }),
      ],
    };
    const harness = renderHarness(current);
    harness.draw();

    const layer = harness.mount.children.find((child) => child.className === "relief-label-layer");
    const visibleLabels = layer?.children
      .filter((child) => child.dataset.tone === "wildlife" && !child.removed)
      .map((child) => child.textContent) ?? [];
    expect(visibleLabels).toEqual(expect.arrayContaining([
      "Deer · alert",
      "Gulls · ~7 visible · watchful",
      "Black bear · wet",
      "Domestic cat · watchful",
      "Marsh rabbit · alert",
      "Marsh fox · tense",
      "Fish crows · ~3 visible · watchful",
      "Northern harrier · alert",
      "Snowy egret · watchful",
      "American black duck · watchful",
      "Domestic chicken · watchful",
      "North American river otter · watchful",
    ]));
    expect(layer?.children.map((child) => child.textContent).join(" "))
      .not.toMatch(/DEER-VISIBLE|GULL-FLOCK|BEAR-VISIBLE|CAT-VISIBLE|RABBIT-VISIBLE|FOX-VISIBLE|CROW-VISIBLE|HARRIER-VISIBLE|EGRET-VISIBLE|DUCK-VISIBLE|CHICKEN-VISIBLE|OTTER-VISIBLE/u);
    for (const color of [
      "#9d744f",
      "#e2e8df",
      "#202827",
      "#746153",
      "#806c52",
      "#995138",
      "#17262a",
      "#88715d",
      "#f4f1df",
      "#d3ad4f",
      "#4b382e",
      "#4a5f8f",
      "#a66a3f",
      "#b34735",
      "#5b402e",
      "#9b7957",
    ]) {
      expect(p5Harness.materialTrace.some(({ method, args }) =>
        method === "ambientMaterial" && args[0] === color
      )).toBe(true);
    }
    expect(harness.instance.ellipsoid).toHaveBeenCalled();
    expect(harness.instance.sphere).toHaveBeenCalled();
    expect(harness.instance.cone).toHaveBeenCalled();
    expect(harness.instance.box).toHaveBeenCalled();
    expect(harness.instance.line).toHaveBeenCalled();
    harness.renderer.destroy();
  });

  it("renders one floating broad-billed duck form without a flock suffix", () => {
    vi.stubGlobal("performance", { now: () => 320 });
    p5Harness.reducedMotion = true;
    const base = view("relief-american-black-duck", { x: 48, y: 48 });
    const duck = wildlifeView("american-black-duck", {
      actorId: "DUCK-INDIVIDUAL",
      behavior: "forage",
      conditionLabels: ["WATCHFUL"],
      groupSize: 7,
      selected: true,
    });
    const harness = renderHarness({ ...base, wildlife: [duck] });
    harness.draw();

    for (const color of ["#4b382e", "#76604a", "#4a5f8f", "#a59655"]) {
      expect(p5Harness.materialTrace.some(({ method, args }) => (
        method === "ambientMaterial" && args[0] === color
      ))).toBe(true);
    }
    expect((harness.instance.ellipsoid as ReturnType<typeof vi.fn>).mock.calls.some(
      ([length, height]) => Number(length) > Number(height) * 2.5,
    )).toBe(true);
    expect((harness.instance.box as ReturnType<typeof vi.fn>).mock.calls.some(
      ([length, height, width]) => (
        Number(length) > Number(height) * 3
        && Number(width) > Number(height) * 2
      ),
    )).toBe(true);
    const layer = harness.mount.children.find((child) => child.className === "relief-label-layer");
    const labels = layer?.children.filter((child) => (
      child.dataset.tone === "wildlife" && !child.removed
    )).map((child) => child.textContent) ?? [];
    expect(labels).toContain("American black duck · watchful");
    expect(labels.join(" ")).not.toMatch(/DUCK-INDIVIDUAL|~7 visible|flock/iu);
    harness.renderer.destroy();
  });

  it("renders one grounded chicken with a static forage posture under reduced motion", () => {
    let now = 320;
    vi.stubGlobal("performance", { now: () => now });
    p5Harness.reducedMotion = true;
    const base = view("relief-domestic-chicken", { x: 48, y: 48 });
    const chicken = wildlifeView("domestic-chicken", {
      actorId: "CHICKEN-INDIVIDUAL",
      behavior: "forage",
      conditionLabels: ["WATCHFUL"],
      groupSize: 3,
      selected: true,
    });
    const harness = renderHarness({ ...base, wildlife: [chicken] });
    const translate = harness.instance.translate as ReturnType<typeof vi.fn>;
    harness.draw();

    for (const color of ["#a66a3f", "#d6b37e", "#34241d", "#b34735", "#d8a84b"]) {
      expect(p5Harness.materialTrace.some(({ method, args }) => (
        method === "ambientMaterial" && args[0] === color
      ))).toBe(true);
    }
    expect((harness.instance.cone as ReturnType<typeof vi.fn>).mock.calls.length)
      .toBeGreaterThanOrEqual(7);
    expect((harness.instance.box as ReturnType<typeof vi.fn>).mock.calls.length)
      .toBeGreaterThanOrEqual(4);
    const layer = harness.mount.children.find((child) => child.className === "relief-label-layer");
    const labels = layer?.children.filter((child) => (
      child.dataset.tone === "wildlife" && !child.removed
    )).map((child) => child.textContent) ?? [];
    expect(labels).toContain("Domestic chicken · watchful");
    expect(labels.join(" ")).not.toMatch(/CHICKEN-INDIVIDUAL|~3 visible|flock|owner|hunger/iu);

    const firstFrame = translate.mock.calls.map((call) => [...call]);
    translate.mockClear();
    now = 2_320;
    harness.draw();
    expect(translate.mock.calls).toEqual(firstFrame);
    harness.renderer.destroy();
  });

  it("draws the same authenticated goat coat in Relief without disclosing the key", () => {
    vi.stubGlobal("performance", { now: () => 320 });
    const base = view("relief-authenticated-goat-coat", { x: 48, y: 48 });
    const goat = wildlifeView("domestic-goat", {
      actorId: "GOAT-AUTHENTICATED-PIED",
      appearanceKey: "pied-coated",
      conditionLabels: ["WATCHFUL"],
      selected: true,
    });
    const harness = renderHarness({ ...base, wildlife: [goat] });
    harness.draw();

    for (const color of ["#e2d6bc", "#55463b", "#211c19", "#b99d72"]) {
      expect(p5Harness.materialTrace.some(({ method, args }) => (
        method === "ambientMaterial" && args[0] === color
      ))).toBe(true);
    }
    expect(p5Harness.materialTrace.some(({ method, args }) => (
      method === "ambientMaterial" && args[0] === "#8f7150"
    ))).toBe(false);
    const layer = harness.mount.children.find((child) => (
      child.className === "relief-label-layer"
    ));
    expect(layer?.children.map(({ textContent }) => textContent).join(" "))
      .not.toContain("pied-coated");
    harness.renderer.destroy();
  });

  it("renders one long-bodied swimming river otter without a group or private-state label", () => {
    vi.stubGlobal("performance", { now: () => 320 });
    p5Harness.reducedMotion = true;
    const base = view("relief-north-american-river-otter", { x: 48, y: 48 });
    const otter = wildlifeView("north-american-river-otter", {
      actorId: "OTTER-INDIVIDUAL",
      behavior: "swim",
      conditionLabels: ["WATCHFUL"],
      groupSize: 7,
      selected: true,
    });
    const harness = renderHarness({ ...base, wildlife: [otter] });
    harness.draw();

    for (const color of ["#5b402e", "#9b7957", "#241b17", "#d6c3a0"]) {
      expect(p5Harness.materialTrace.some(({ method, args }) => (
        method === "ambientMaterial" && args[0] === color
      ))).toBe(true);
    }
    expect((harness.instance.ellipsoid as ReturnType<typeof vi.fn>).mock.calls.some(
      ([length, height]) => Number(length) > Number(height) * 3,
    )).toBe(true);
    expect(harness.instance.sphere).toHaveBeenCalled();
    expect(harness.instance.cone).toHaveBeenCalled();
    expect(harness.instance.line).toHaveBeenCalled();
    const layer = harness.mount.children.find((child) => child.className === "relief-label-layer");
    const labels = layer?.children.filter((child) => (
      child.dataset.tone === "wildlife" && !child.removed
    )).map((child) => child.textContent) ?? [];
    expect(labels).toContain("North American river otter · watchful");
    expect(labels.join(" "))
      .not.toMatch(/OTTER-INDIVIDUAL|~7 visible|flock|hunger|prey|fish|crab|target/iu);
    harness.renderer.destroy();
  });

  it("distinguishes rabbit ears from the fox's low tail without relying on color", () => {
    vi.stubGlobal("performance", { now: () => 320 });
    const base = view("relief-marsh-forms", { x: 48, y: 48 });
    const rabbitHarness = renderHarness({
      ...base,
      wildlife: [wildlifeView("marsh-rabbit", { behavior: "flee" })],
    });
    rabbitHarness.draw();
    const rabbitCones = (rabbitHarness.instance.cone as ReturnType<typeof vi.fn>).mock.calls;
    expect(rabbitCones.filter(([radius, height]) => (
      Number(height) > Number(radius) * 6
    ))).toHaveLength(2);
    rabbitHarness.renderer.destroy();

    p5Harness.instances.length = 0;
    p5Harness.materialTrace.length = 0;
    const foxHarness = renderHarness({
      ...base,
      wildlife: [wildlifeView("marsh-fox", { behavior: "pursue" })],
    });
    foxHarness.draw();
    const foxTail = (foxHarness.instance.ellipsoid as ReturnType<typeof vi.fn>).mock.calls
      .find(([length, height]) => Number(length) > Number(height) * 4);
    expect(foxTail).toBeDefined();
    expect((foxHarness.instance.cone as ReturnType<typeof vi.fn>).mock.calls.length)
      .toBeGreaterThanOrEqual(3);
    foxHarness.renderer.destroy();
  });

  it("keeps grounded wildlife geometry static and targetable under reduced motion", () => {
    let now = 120;
    vi.stubGlobal("performance", { now: () => now });
    p5Harness.reducedMotion = true;
    const base = view("relief-marsh-reduced", { x: 48, y: 48 });
    const harness = renderHarness({
      ...base,
      wildlife: [
        wildlifeView("marsh-rabbit", { position: { x: 12, y: 12 }, behavior: "flee" }),
        wildlifeView("marsh-fox", { position: { x: 36, y: 12 }, behavior: "pursue" }),
        wildlifeView("domestic-chicken", { position: { x: 60, y: 12 }, behavior: "forage" }),
      ],
    });
    const translate = harness.instance.translate as ReturnType<typeof vi.fn>;
    harness.draw();
    const firstFrame = translate.mock.calls.map((call) => [...call]);
    translate.mockClear();
    now = 2_120;
    harness.draw();
    expect(translate.mock.calls).toEqual(firstFrame);

    harness.dispatch.mockClear();
    harness.canvas.fire("pointerdown", pointer(harness.canvas, {
      pointerId: 184,
      pointerType: "touch",
    }));
    harness.canvas.fire("pointerup", pointer(harness.canvas, {
      pointerId: 184,
      pointerType: "touch",
    }));
    expect(harness.dispatch.mock.calls.some(([command]) => (
      (command as { entity?: unknown; species?: unknown }).entity === "living-actor"
      && (command as { species?: unknown }).species === "marsh-rabbit"
    ))).toBe(true);
    harness.renderer.destroy();
  });

  it("keeps representative aerial silhouettes static under reduced motion", () => {
    let now = 120;
    vi.stubGlobal("performance", { now: () => now });
    p5Harness.reducedMotion = true;
    const base = view("relief-aerial-reduced", { x: 48, y: 48 });
    const harness = renderHarness({
      ...base,
      wildlife: [
        wildlifeView("fish-crow", {
          position: { x: 12, y: 12 },
          behavior: "alarm",
          groupSize: 3,
        }),
        wildlifeView("northern-harrier", {
          position: { x: 36, y: 12 },
          behavior: "pursue",
        }),
        wildlifeView("golden-eagle", {
          position: { x: 60, y: 12 },
          behavior: "flight",
        }),
      ],
    });
    const translate = harness.instance.translate as ReturnType<typeof vi.fn>;
    harness.draw();
    // There is one body per aerial representative. Crow `groupSize` must not
    // multiply its individually owned body again.
    expect(harness.instance.ellipsoid).toHaveBeenCalledTimes(3);
    const firstFrame = translate.mock.calls.map((call) => [...call]);
    translate.mockClear();
    now = 2_120;
    harness.draw();
    expect(translate.mock.calls).toEqual(firstFrame);
    harness.renderer.destroy();
  });

  it("places perched crows on the surface and quartering harriers in low flight", () => {
    vi.stubGlobal("performance", { now: () => 2_117 });
    const base = view("relief-aerial-activity", { x: 48, y: 48 });
    const harness = renderHarness({
      ...base,
      wildlife: [wildlifeView("fish-crow", {
        position: { x: 12, y: 12 },
        behavior: "alarm",
      })],
    });
    const translate = harness.instance.translate as ReturnType<typeof vi.fn>;
    harness.draw();
    translate.mockClear();
    harness.draw();
    const flyingCrow = translate.mock.calls.find((call) => call[0] === 12 && call[2] === 12);

    translate.mockClear();
    harness.setView({
      ...base,
      wildlife: [wildlifeView("fish-crow", {
        position: { x: 12, y: 12 },
        behavior: "perch",
      })],
    });
    harness.draw();
    const perchedCrow = translate.mock.calls.find((call) => call[0] === 12 && call[2] === 12);
    expect(perchedCrow?.[1]).not.toBe(flyingCrow?.[1]);

    translate.mockClear();
    harness.setView({
      ...base,
      wildlife: [wildlifeView("northern-harrier", {
        position: { x: 36, y: 12 },
        behavior: "quarter",
      })],
    });
    harness.draw();
    const lowHarrier = translate.mock.calls.find((call) => call[0] === 36 && call[2] === 12);

    translate.mockClear();
    harness.setView({
      ...base,
      wildlife: [wildlifeView("northern-harrier", {
        position: { x: 36, y: 12 },
        behavior: "pursue",
      })],
    });
    harness.draw();
    const highHarrier = translate.mock.calls.find((call) => call[0] === 36 && call[2] === 12);
    expect(lowHarrier?.[1]).not.toBe(highHarrier?.[1]);

    translate.mockClear();
    harness.setView({
      ...base,
      wildlife: [wildlifeView("golden-eagle", {
        position: { x: 60, y: 12 },
        behavior: "flight",
      })],
    });
    harness.draw();
    const soaringEagle = translate.mock.calls.find((call) => call[0] === 60 && call[2] === 12);

    translate.mockClear();
    harness.setView({
      ...base,
      wildlife: [wildlifeView("golden-eagle", {
        position: { x: 60, y: 12 },
        behavior: "perch",
      })],
    });
    harness.draw();
    const perchedEagle = translate.mock.calls.find((call) => call[0] === 60 && call[2] === 12);
    expect(perchedEagle?.[1]).not.toBe(soaringEagle?.[1]);
    harness.renderer.destroy();
  });

  it.each([
    ["wild-boar", "#614735", "cone"],
    ["elk", "#9b6f43", "ellipsoid"],
    ["gray-wolf", "#727875", "sphere"],
    ["cougar", "#aa8258", "cylinder"],
    ["brown-bear", "#4c372b", "sphere"],
    ["mountain-goat", "#d8d1bd", "cone"],
    ["golden-eagle", "#4c3928", "cone"],
    ["arctic-fox", "#e7e9e4", "ellipsoid"],
    ["harbor-seal", "#687579", "ellipsoid"],
    ["polar-bear", "#e5dfc9", "box"],
    ["great-blue-heron", "#667a82", "ellipsoid"],
    ["common-tern", "#dce1de", "cone"],
    ["osprey", "#5a493a", "cone"],
    ["greater-yellowlegs", "#8d9898", "ellipsoid"],
    ["belted-kingfisher", "#567989", "cone"],
    ["double-crested-cormorant", "#222d2c", "ellipsoid"],
    ["seaside-sparrow", "#74766f", "box"],
    ["diamondback-terrapin", "#6f7551", "ellipsoid"],
  ] as const)(`${ALPHA31_PREDATOR_PRESENTATION_OWNER_INTENT} renders and touch-selects the shared color-independent upland %s form`, (
    species,
    primaryColor,
    structuralMethod,
  ) => {
    vi.stubGlobal("performance", { now: () => 320 });
    p5Harness.reducedMotion = true;
    const base = view(`relief-${species}`, { x: 48, y: 48 });
    const actor = wildlifeView(species, {
      appearanceKey: "unknown-morph",
      behavior: species === "gray-wolf"
        ? "pursue"
        : species === "golden-eagle"
          ? "flight"
          : "forage",
      position: { x: 12, y: 12 },
      selected: true,
    });
    const harness = renderHarness({ ...base, wildlife: [actor] });
    harness.draw();

    expect(p5Harness.materialTrace.some(({ method, args }) => (
      method === "ambientMaterial" && args[0] === primaryColor
    ))).toBe(true);
    expect(harness.instance[structuralMethod]).toHaveBeenCalled();
    const labels = harness.mount.children.flatMap(({ children }) => (
      children.map(({ textContent }) => textContent)
    ));
    expect(labels.join(" ")).not.toMatch(/unknown-morph|BOAR-|ELK-|WOLF-/u);
    harness.canvas.fire("pointerdown", pointer(harness.canvas, {
      pointerId: 230,
      pointerType: "touch",
    }));
    harness.canvas.fire("pointerup", pointer(harness.canvas, {
      pointerId: 230,
      pointerType: "touch",
    }));
    expect(harness.dispatch).toHaveBeenLastCalledWith({
      type: "select",
      entity: "living-actor",
      species,
      id: actor.actorId,
      point: { x: 12, y: 12 },
    });
    harness.renderer.destroy();
  });

  it("hovers and selects every individually represented wildlife species", () => {
    vi.stubGlobal("performance", { now: () => 0 });
    const base = view("relief-wildlife-targets", { x: 48, y: 48 });
    const harness = renderHarness(base);
    const species: readonly IndividualWildlifeViewSpecies[] = [
      "deer",
      "gull",
      "black-bear",
      "domestic-cat",
      "marsh-rabbit",
      "marsh-fox",
      "arctic-fox",
      "harbor-seal",
      "polar-bear",
      "fish-crow",
      "northern-harrier",
      "snowy-egret",
      "american-black-duck",
      "domestic-chicken",
      "domestic-goat",
      "north-american-river-otter",
      "wild-boar",
      "elk",
      "gray-wolf",
      "cougar",
      "brown-bear",
      "mountain-goat",
      "golden-eagle",
      "great-blue-heron",
      "common-tern",
      "osprey",
      "greater-yellowlegs",
      "belted-kingfisher",
      "double-crested-cormorant",
      "seaside-sparrow",
      "diamondback-terrapin",
    ];
    const prefix: Readonly<Record<IndividualWildlifeViewSpecies, string>> = {
      deer: "DEER-",
      gull: "GULL-",
      "black-bear": "BEAR-",
      "domestic-cat": "CAT-",
      "marsh-rabbit": "RABBIT-",
      "marsh-fox": "FOX-",
      "arctic-fox": "ARCTICFOX-",
      "harbor-seal": "HARBORSEAL-",
      "polar-bear": "POLARBEAR-",
      "fish-crow": "CROW-",
      "northern-harrier": "HARRIER-",
      "snowy-egret": "EGRET-",
      "american-black-duck": "DUCK-",
      "domestic-chicken": "CHICKEN-",
      "domestic-goat": "GOAT-",
      "north-american-river-otter": "OTTER-",
      "wild-boar": "BOAR-",
      elk: "ELK-",
      "gray-wolf": "WOLF-",
      cougar: "COUGAR-",
      "brown-bear": "BROWNBEAR-",
      "mountain-goat": "MOUNTAINGOAT-",
      "golden-eagle": "GOLDENEAGLE-",
      "great-blue-heron": "BLUEHERON-",
      "common-tern": "COMMONTERN-",
      osprey: "OSPREY-",
      "greater-yellowlegs": "YELLOWLEGS-",
      "belted-kingfisher": "KINGFISHER-",
      "double-crested-cormorant": "CORMORANT-",
      "seaside-sparrow": "SEASIDESPARROW-",
      "diamondback-terrapin": "TERRAPIN-",
    };

    for (const kind of species) {
      const actor = wildlifeView(kind, {
        actorId: `${prefix[kind]}target-${kind}`,
        position: { x: 12, y: 12 },
      });
      harness.setView({ ...base, wildlife: [actor] });
      harness.dispatch.mockClear();
      harness.canvas.fire("pointermove", pointer(harness.canvas));
      harness.draw();

      const layer = harness.mount.children.find((child) => child.className === "relief-label-layer");
      const hoverLabel = [...(layer?.children ?? [])].reverse().find((child) =>
        child.dataset.tone === "wildlife" && child.textContent === actor.quickLabel && !child.removed);
      expect(hoverLabel?.dataset).toMatchObject({ tone: "wildlife", selected: "true" });
      expect(harness.dispatch).not.toHaveBeenCalled();

      harness.canvas.fire("pointerdown", pointer(harness.canvas, { pointerId: 180 }));
      harness.canvas.fire("pointerup", pointer(harness.canvas, { pointerId: 180 }));
      expect(harness.dispatch).toHaveBeenLastCalledWith({
        type: "select",
        entity: "living-actor",
        species: kind,
        id: actor.actorId,
        point: { x: 12, y: 12 },
      });
    }
    harness.renderer.destroy();
  });

  it("fails closed outside direct detail and keeps flock motion still under reduced motion", () => {
    let now = 120;
    vi.stubGlobal("performance", { now: () => now });
    p5Harness.reducedMotion = true;
    const base = view("relief-wildlife-disclosure", { x: 48, y: 48 });
    const gull = wildlifeView("gull", {
      actorId: "GULL-reduced-flock",
      groupSize: 3,
      selected: true,
    });
    const harness = renderHarness({ ...base, wildlife: [gull] });
    const line = harness.instance.line as ReturnType<typeof vi.fn>;
    harness.draw();
    const firstFrameLines = line.mock.calls.map((call) => [...call]);
    expect(firstFrameLines.length).toBeGreaterThanOrEqual(6);

    line.mockClear();
    now = 1_920;
    harness.draw();
    expect(line.mock.calls).toEqual(firstFrameLines);

    const layer = harness.mount.children.find((child) => child.className === "relief-label-layer");
    p5Harness.materialTrace.length = 0;
    harness.dispatch.mockClear();
    const hidden: TideweftView = {
      ...base,
      perception: {
        version: 1,
        signature: "relief-wildlife-hidden",
        valid: true,
        visibleTileCount: 16,
        directTileCount: 16,
        peripheralTileCount: 0,
        detailVisibleTileCount: 0,
        detailDirectTileCount: 0,
        detailPeripheralTileCount: 0,
      },
      terrain: {
        ...base.terrain,
        tiles: base.terrain.tiles.map((tile) => ({
          ...tile,
          currentVisibility: 1,
          currentDetailVisibility: 0 as const,
        })),
      },
      wildlife: [wildlifeView("black-bear", {
        actorId: "BEAR-hidden",
        position: { x: 12, y: 12 },
        selected: true,
      })],
    };
    harness.setView(hidden);
    harness.draw();
    expect(layer?.children.some((child) => child.dataset.tone === "wildlife" && !child.removed))
      .toBe(false);
    expect(p5Harness.materialTrace.some(({ method, args }) =>
      method === "ambientMaterial" && args[0] === "#202827"
    )).toBe(false);
    harness.canvas.fire("pointerdown", pointer(harness.canvas, { pointerId: 181 }));
    harness.canvas.fire("pointerup", pointer(harness.canvas, { pointerId: 181 }));
    expect(harness.dispatch.mock.calls.some(([command]) =>
      (command as { type?: unknown }).type === "select"
    )).toBe(false);
    harness.renderer.destroy();
  });
});

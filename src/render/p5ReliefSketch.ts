import p5 from "p5";

import {
  BIOME_PRESENTATION,
  biomeEnvironmentalEmphasis,
  visibleBiomePresentation,
} from "./biomePresentation";
import { buildSurfaceCurrentCues } from "./currentCues";
import {
  buildTerrainMesh,
  type TerrainMesh,
  type TerrainMeshChunk,
} from "./terrainMesh";
import {
  buildReliefMaterialBatches,
  buildReliefPerceptionMaterialBatches,
  type ReliefMaterialBatch,
  type ReliefPerceptionMaterialBatch,
} from "./reliefTerrainBatches";
import {
  buildReliefWaterMaterialBatches,
  reliefWaterOpacity,
} from "./reliefWaterBatches";
import {
  MAX_RELIEF_PITCH,
  MIN_RELIEF_PITCH,
  cameraRelativeReliefMovement,
  normalizeReliefCamera,
  projectReliefPoint,
  reliefBoundsVisible,
  reliefCameraPose,
  reliefFogAmount,
  screenToDiscoveredReliefSurface,
  type ReliefCameraState,
} from "./reliefCamera";
import {
  beginReliefTwist,
  heldReliefOrbitDelta,
  updateReliefTwist,
  wrapReliefOrbitRadians,
  type ReliefTouchPoint,
  type ReliefTwistGesture,
} from "./reliefOrbitControls";
import { reliefSoundingStyle, type ReliefDepthBand } from "./reliefSounding";
import { buildReliefRainFrame } from "./reliefWeather";
import {
  createReliefDiscoverySignatureMemo,
  discoveredReliefSurfaceHeightAt,
  maskReliefTileForDiscovery,
  perceivedReliefSurfaceHeightAt,
  reliefDiscoveryVisibility,
} from "./reliefTerrain";
import {
  createTideHarpGeometryMemo,
  tideHarpBellBaseHeight,
  tideHarpBellBob,
  tideHarpRootLift,
} from "./tideHarps";
import { buildWaychordBindings, buildWaychords } from "./wayknots";
import { buildWindThreadFrame } from "./windPresentation";
import { createRendererTelemetry } from "./rendererTelemetry";
import {
  clipPolylineToBounds,
  polylineBounds,
  worldBoundsOverlap,
} from "./routePresentation";
import {
  currentSettlementVisibility,
  currentTerrainDetailVisibility,
  currentTerrainVisibility,
  isDirectlyDetailPerceived,
} from "./perceptionPresentation";
import {
  commandForWorldTap,
  routePointerTargetIsDirectlyPerceived,
  usesCoarseWorldPointer,
  validatePerceivedEntityCommand,
} from "./worldTap";
import { hitTestFieldResource } from "./resourceHitTest";
import { FIELD_RESOURCE_PRESENTATION } from "./resourcePresentation";
import {
  beginLooseCargoPointerPress,
  cancelLooseCargoPointerPress,
  hitTestLooseCargoScreen,
  keyboardLooseCargoRecoveryCommand,
  looseCargoHitRadiusPixels,
  looseCargoRecoveryLabel,
  looseCargoVisual,
  moveLooseCargoPointerPress,
  nearestRecoverableLooseCargo,
  releaseLooseCargoPointerCaptures,
  resolveLooseCargoPointerRelease,
  safeLooseCargoViews,
  type LooseCargoPointerPress,
} from "./looseCargoPresentation";
import {
  placeIncidentCallout,
  playerBalancePresentation,
  type PlayerBalancePresentation,
} from "./playerPresentation";
import {
  advancePointerParallax,
  createPointerParallaxState,
  easeWorldLabelPoint,
  normalizedPresentationPointer,
  presentationParallaxTarget,
  resetPointerParallax,
  setPointerParallaxTarget,
  type EasedScreenPoint,
} from "./presentationMotion";
import type {
  FieldResourceNodeView,
  LooseCargoView,
  PorterView,
  RendererCommand,
  RouteView,
  SettlementStatus,
  SettlementView,
  TerrainGridView,
  TerrainKind,
  TideweftRendererController,
  TideweftRendererOptions,
  TideweftView,
  WayknotKind,
  WayknotView,
  WeatherView,
  WorldBounds,
  WorldPoint,
} from "./types";

const RELIEF_PALETTE = {
  ink: "#061416",
  horizon: "#102e35",
  deep: "#082832",
  channel: "#0e4149",
  shallows: "#28666a",
  mud: "#655d4a",
  sand: "#9a865e",
  marsh: "#365b46",
  meadow: "#486b53",
  scrub: "#3f5148",
  ridge: "#67716b",
  built: "#8e846e",
  water: "#49bfd0",
  foam: "#ddfff1",
  tide: "#64efd3",
  amber: "#ffc071",
  coral: "#ff8f78",
  violet: "#bea9ff",
  danger: "#ff796c",
} as const;

const TERRAIN_COLORS: Readonly<Record<TerrainKind, string>> = {
  "deep-water": RELIEF_PALETTE.deep,
  channel: RELIEF_PALETTE.channel,
  shallows: RELIEF_PALETTE.shallows,
  mudflat: RELIEF_PALETTE.mud,
  sandbar: RELIEF_PALETTE.sand,
  "salt-marsh": RELIEF_PALETTE.marsh,
  meadow: RELIEF_PALETTE.meadow,
  scrub: RELIEF_PALETTE.scrub,
  ridge: RELIEF_PALETTE.ridge,
  built: RELIEF_PALETTE.built,
};

const DEFAULT_YAW = -0.36;
const DEFAULT_PITCH = Math.PI * 0.29;
const DEFAULT_FOV = Math.PI / 3.5;

export interface TideweftReliefRendererOptions extends TideweftRendererOptions {
  /** Starts the expensive WEBGL draw loop stopped when false. */
  readonly initiallyActive?: boolean;
  readonly chunkSize?: number;
  /** World height represented by a normalized elevation of one. */
  readonly verticalScale?: number;
  readonly onWebGLError?: (reason: string) => void;
  /** Presentation-only heading used by the shared world compass. */
  readonly onOrbitChange?: (yaw: number) => void;
}

export interface TideweftReliefRendererController extends TideweftRendererController {
  readonly supported: () => boolean;
  readonly isActive: () => boolean;
  readonly setActive: (active: boolean) => void;
  readonly setOrbit: (yaw: number, pitch: number) => void;
  readonly resetOrbit: () => void;
  readonly orbitYaw: () => number;
}

interface OrbitRuntime {
  x: number;
  y: number;
  height: number;
  distance: number;
  manualZoom: number;
  yaw: number;
  pitch: number;
  initialized: boolean;
  focusPoint: WorldPoint | undefined;
  focusUntil: number;
}

interface ReliefChunkBatch {
  readonly chunk: TerrainMeshChunk;
  readonly materials: readonly ReliefMaterialBatch[];
}

interface CachedReliefMesh {
  readonly key: string;
  /** Discovery-masked geometry retained as durable chart memory. */
  readonly mesh: TerrainMesh;
  readonly chunks: readonly ReliefChunkBatch[];
  /** Full geometry used only through the bounded current-terrain mask. */
  readonly perceptionMesh: TerrainMesh;
}

interface CachedReliefPerceptionMesh {
  readonly key: string;
  readonly mesh: TerrainMesh;
}

interface ReliefPerceptionChunkBatch {
  readonly chunk: TerrainMeshChunk;
  readonly materials: readonly ReliefPerceptionMaterialBatch[];
}

interface CachedReliefPerception {
  readonly key: string;
  readonly chunks: readonly ReliefPerceptionChunkBatch[];
}

interface ScanRipple {
  readonly point: WorldPoint;
  readonly startedAt: number;
}

interface OrbitDrag {
  readonly pointerId: number;
  readonly button: number;
  lastX: number;
  lastY: number;
  moved: boolean;
}

interface ClickCandidate {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly shiftKey: boolean;
  readonly coarsePointer: boolean;
}

interface AttachedListeners {
  readonly element: HTMLCanvasElement;
  readonly pointerDown: (event: PointerEvent) => void;
  readonly pointerMove: (event: PointerEvent) => void;
  readonly pointerUp: (event: PointerEvent) => void;
  readonly pointerCancel: (event: PointerEvent) => void;
  readonly lostPointerCapture: (event: PointerEvent) => void;
  readonly pointerLeave: () => void;
  readonly contextMenu: (event: MouseEvent) => void;
  readonly keyDown: (event: KeyboardEvent) => void;
  readonly keyUp: (event: KeyboardEvent) => void;
  readonly blur: () => void;
  readonly windowKeyDown: (event: KeyboardEvent) => void;
  readonly windowKeyUp: (event: KeyboardEvent) => void;
  readonly windowBlur: () => void;
  readonly visibilityChange: () => void;
  readonly wheel: (event: WheelEvent) => void;
  readonly contextLost: (event: Event) => void;
  readonly contextRestored: () => void;
}

/**
 * Optional, actual 3D estuary presentation. It deliberately shares only the
 * projection and command contracts with the flat renderer, so hosts can swap
 * between them without forking simulation state.
 */
export function createTideweftReliefRenderer(
  options: TideweftReliefRendererOptions,
): TideweftReliefRendererController {
  let instance: p5 | null = null;
  let canvasElement: HTMLCanvasElement | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let reducedMotionQuery: MediaQueryList | null = null;
  let reducedMotionChangeHandler: ((event: MediaQueryListEvent) => void) | null = null;
  let reducedMotion = false;
  let attached: AttachedListeners | null = null;
  let notice: HTMLDivElement | null = null;
  let labelLayer: HTMLDivElement | null = null;
  const labelNodes = new Map<string, HTMLSpanElement>();
  const labelPositions = new Map<string, EasedScreenPoint>();
  let webglSupported = detectWebGLSupport();
  let contextLost = false;
  let active = options.initiallyActive ?? true;
  let latestView: TideweftView | null = null;
  let cached: CachedReliefMesh | null = null;
  let cachedPerceptionMesh: CachedReliefPerceptionMesh | null = null;
  let cachedPerception: CachedReliefPerception | null = null;
  let orbitDrag: OrbitDrag | null = null;
  let clickCandidate: ClickCandidate | null = null;
  let parcelPress: LooseCargoPointerPress | null = null;
  let twistGesture: ReliefTwistGesture | null = null;
  let touchSequenceSuppressed = false;
  let pointerWorld: WorldPoint | null = null;
  let hoverParcelId: string | null = null;
  let hasObservedSpatialEpoch = false;
  let observedSpatialEpoch: TideweftView["spatialEpoch"];
  let lastMovement = "0,0";
  let lastOrbitFrameAt: number | undefined;
  const activeTouchPointers = new Map<number, ReliefTouchPoint>();
  const heldDirections = new Set<string>();
  const heldBraceKeys = new Set<string>();
  const heldOrbitKeys = new Set<string>();
  const ripples: ScanRipple[] = [];
  const pointerParallax = createPointerParallaxState();
  const telemetry = createRendererTelemetry();
  telemetry.setActive(active && webglSupported);
  const discoverySignatureFor = createReliefDiscoverySignatureMemo();
  const tideHarpGeometryFor = createTideHarpGeometryMemo();
  const orbit: OrbitRuntime = {
    x: 0,
    y: 0,
    height: 0,
    distance: 620,
    manualZoom: 1,
    yaw: DEFAULT_YAW,
    pitch: DEFAULT_PITCH,
    initialized: false,
    focusPoint: undefined,
    focusUntil: 0,
  };

  const emit = (command: RendererCommand): void => {
    if (!active || contextLost) return;
    const validated = latestView
      ? validatePerceivedEntityCommand(latestView, command)
      : command;
    if (validated) options.dispatch(validated);
  };

  const getCanvasSize = (): { width: number; height: number } => {
    const rectangle = options.mount.getBoundingClientRect();
    return {
      width: Math.max(1, Math.round(rectangle.width || window.innerWidth || 1)),
      height: Math.max(1, Math.round(rectangle.height || window.innerHeight || 1)),
    };
  };

  const syncActivePresentation = (): void => {
    if (canvasElement) {
      canvasElement.hidden = !active;
      canvasElement.tabIndex = active ? 0 : -1;
      canvasElement.dataset.active = active ? "true" : "false";
      canvasElement.setAttribute("aria-hidden", active ? "false" : "true");
    }
    if (notice) notice.hidden = !active;
    if (labelLayer) labelLayer.hidden = !active;
  };

  const showFailure = (reason: string): void => {
    webglSupported = false;
    options.mount.dataset.reliefFailure = reason;
    options.onWebGLError?.(reason);
    if (!notice && typeof document !== "undefined") {
      notice = document.createElement("div");
      notice.dataset.reliefUnavailable = "true";
      notice.setAttribute("role", "status");
      notice.textContent = "3D relief is unavailable here; the chart view can keep carrying the strand.";
      notice.style.cssText = [
        "position:absolute",
        "left:50%",
        "top:50%",
        "transform:translate(-50%,-50%)",
        "max-width:28rem",
        "padding:.8rem 1rem",
        "color:#ddfff1",
        "background:rgba(6,20,22,.9)",
        "border:1px solid rgba(100,239,211,.55)",
        "font:600 12px/1.5 system-ui,sans-serif",
        "letter-spacing:.05em",
        "text-align:center",
        "pointer-events:none",
      ].join(";");
      options.mount.append(notice);
      syncActivePresentation();
    }
  };

  const updateMovement = (): void => {
    const left = heldDirections.has("ArrowLeft") || heldDirections.has("KeyA");
    const right = heldDirections.has("ArrowRight") || heldDirections.has("KeyD");
    const up = heldDirections.has("ArrowUp") || heldDirections.has("KeyW");
    const down = heldDirections.has("ArrowDown") || heldDirections.has("KeyS");
    let x = Number(right) - Number(left);
    let y = Number(down) - Number(up);
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    ({ x, y } = cameraRelativeReliefMovement({ x, y }, orbit.yaw));
    const signature = `${x},${y}`;
    if (signature === lastMovement) return;
    lastMovement = signature;
    options.dispatch({ type: "movement", vector: { x, y } });
  };

  const setOrbitYaw = (yaw: number): void => {
    orbit.yaw = wrapReliefOrbitRadians(Number.isFinite(yaw) ? yaw : DEFAULT_YAW);
    updateMovement();
    options.onOrbitChange?.(orbit.yaw);
  };

  const advanceHeldOrbit = (now: number): void => {
    const previous = lastOrbitFrameAt;
    lastOrbitFrameAt = now;
    if (heldOrbitKeys.size === 0) return;
    if (hasOpenDialog()) {
      heldOrbitKeys.clear();
      return;
    }
    if (previous === undefined) return;
    const yawDelta = heldReliefOrbitDelta(heldOrbitKeys, now - previous);
    if (yawDelta !== 0) setOrbitYaw(orbit.yaw + yawDelta);
  };

  const releaseInput = (): void => {
    heldDirections.clear();
    if (heldBraceKeys.size > 0) options.dispatch({ type: "brace", active: false });
    heldBraceKeys.clear();
    heldOrbitKeys.clear();
    updateMovement();
    orbitDrag = null;
    clickCandidate = null;
    parcelPress = null;
    hoverParcelId = null;
    twistGesture = null;
    touchSequenceSuppressed = false;
    releaseLooseCargoPointerCaptures(canvasElement, [...activeTouchPointers.keys()]);
    activeTouchPointers.clear();
    lastOrbitFrameAt = undefined;
    resetPointerParallax(pointerParallax, true);
    labelPositions.clear();
  };

  /**
   * Floating-origin recentering reuses local coordinates for a different
   * region. Any pointer candidate captured under the old interpretation must
   * die before pointerup can resolve against the new view.
   */
  const cancelSpatialCandidates = (): void => {
    const capturedPointerIds = new Set<number>(activeTouchPointers.keys());
    if (orbitDrag) capturedPointerIds.add(orbitDrag.pointerId);
    if (clickCandidate) capturedPointerIds.add(clickCandidate.pointerId);
    if (parcelPress) capturedPointerIds.add(parcelPress.pointerId);
    releaseLooseCargoPointerCaptures(canvasElement, [...capturedPointerIds]);
    orbitDrag = null;
    clickCandidate = null;
    parcelPress = null;
    twistGesture = null;
    touchSequenceSuppressed = false;
    activeTouchPointers.clear();
    pointerWorld = null;
    hoverParcelId = null;
    orbit.focusPoint = undefined;
    orbit.focusUntil = 0;
    ripples.length = 0;
    cached = null;
    cachedPerception = null;
    for (const node of labelNodes.values()) node.remove();
    labelNodes.clear();
    labelPositions.clear();
    resetPointerParallax(pointerParallax, true);
  };

  const snapCameraToView = (view: TideweftView): void => {
    const target = view.camera.followPlayer ? view.player.position : view.camera.center;
    const minimumViewport = Math.min(instance?.width ?? 640, instance?.height ?? 480);
    const baseDistance = clamp(minimumViewport * 0.96, 430, 780);
    orbit.x = target.x;
    orbit.y = target.y;
    orbit.height = discoveredReliefSurfaceHeightAt(
      view.terrain,
      target,
      reliefScale(view.terrain),
      false,
    );
    orbit.distance = clamp(
      baseDistance / Math.max(0.12, view.camera.zoom * orbit.manualZoom),
      150,
      2_200,
    );
    orbit.initialized = true;
    const bounds = view.camera.bounds;
    if (bounds) {
      orbit.x = clamp(orbit.x, bounds.minX, bounds.maxX);
      orbit.y = clamp(orbit.y, bounds.minY, bounds.maxY);
    }
  };

  const observeSpatialEpoch = (view: TideweftView): boolean => {
    const epoch = view.spatialEpoch;
    // Legacy projections have no floating-origin signal. They retain their
    // historical interpolation and input behavior rather than fabricating one.
    if (epoch === undefined) return false;
    if (!hasObservedSpatialEpoch) {
      hasObservedSpatialEpoch = true;
      observedSpatialEpoch = epoch;
      return false;
    }
    if (Object.is(observedSpatialEpoch, epoch)) return false;
    observedSpatialEpoch = epoch;
    cancelSpatialCandidates();
    snapCameraToView(view);
    return true;
  };

  const refreshLatestView = (): TideweftView | null => {
    latestView = options.getView() ?? null;
    if (latestView) observeSpatialEpoch(latestView);
    return latestView;
  };

  const currentCameraState = (): ReliefCameraState => {
    const view = latestView;
    const worldWidth = view ? view.terrain.columns * view.terrain.tileSize : 2_400;
    const worldHeight = view ? view.terrain.rows * view.terrain.tileSize : 1_800;
    const units = (2 * orbit.distance * Math.tan(DEFAULT_FOV / 2))
      / Math.max(1, instance?.height ?? 1);
    const screenX = -pointerParallax.current.x * units;
    const screenY = -pointerParallax.current.y * units;
    const cosine = Math.cos(orbit.yaw);
    const sine = Math.sin(orbit.yaw);
    const parallaxX = screenX * cosine + screenY * sine;
    const parallaxY = -screenX * sine + screenY * cosine;
    return normalizeReliefCamera({
      target: { x: orbit.x + parallaxX, y: orbit.y + parallaxY },
      targetHeight: orbit.height,
      yaw: orbit.yaw,
      pitch: orbit.pitch,
      distance: orbit.distance,
      verticalFov: DEFAULT_FOV,
      near: 1,
      far: Math.max(4_000, Math.hypot(worldWidth, worldHeight) * 2.5),
    });
  };

  const localPointer = (event: PointerEvent | WheelEvent): WorldPoint => {
    const rectangle = canvasElement?.getBoundingClientRect();
    return {
      x: event.clientX - (rectangle?.left ?? 0),
      y: event.clientY - (rectangle?.top ?? 0),
    };
  };

  const looseCargoViews = (): readonly LooseCargoView[] => {
    const view = latestView;
    const parcels = safeLooseCargoViews(view?.looseCargo ?? []);
    if (!view?.perception) return parcels;
    return parcels.filter((parcel) => isDirectlyDetailPerceived(view.terrain, parcel.position, true));
  };

  const projectParcelScreen = (parcel: LooseCargoView): WorldPoint | null => {
    const view = latestView;
    const p = instance;
    if (!view || !p) return null;
    const surface = discoveredReliefSurfaceHeightAt(
      view.terrain,
      parcel.position,
      cached?.mesh.verticalScale ?? reliefScale(view.terrain),
      true,
    );
    const projected = projectReliefPoint(
      parcel.position,
      surface + view.terrain.tileSize * 0.24,
      currentCameraState(),
      { width: p.width, height: p.height },
    );
    return projected.visible ? { x: projected.x, y: projected.y } : null;
  };

  const parcelHitAt = (screen: WorldPoint, coarsePointer: boolean) =>
    hitTestLooseCargoScreen(
      looseCargoViews(),
      screen,
      looseCargoHitRadiusPixels(coarsePointer, 10),
      projectParcelScreen,
    );

  const pickWorld = (screen: WorldPoint): WorldPoint | null => {
    const view = latestView;
    const p = instance;
    if (!view || !p) return null;
    const viewport = { width: p.width, height: p.height };
    const camera = currentCameraState();
    const point = screenToDiscoveredReliefSurface(
      screen,
      view.terrain,
      cached?.mesh.verticalScale ?? reliefScale(view.terrain),
      camera,
      viewport,
    );
    if (!point) return null;
    const bounds = view.camera.bounds;
    return bounds
      ? {
          x: clamp(point.x, bounds.minX, bounds.maxX),
          y: clamp(point.y, bounds.minY, bounds.maxY),
        }
      : point;
  };

  const unitsPerPixel = (): number => {
    const height = Math.max(1, instance?.height ?? 1);
    return (2 * orbit.distance * Math.tan(DEFAULT_FOV / 2)) / height;
  };

  const syncReliefLabels = (
    view: TideweftView,
    cache: CachedReliefMesh,
    camera: ReliefCameraState,
    now: number,
  ): void => {
    if (!labelLayer || !instance) return;
    const used = new Set<string>();
    const destination = view.player.destination;
    const tileSize = view.terrain.tileSize;
    const labelNode = (id: string, text: string): HTMLSpanElement => {
      let node = labelNodes.get(id);
      if (!node) {
        node = document.createElement("span");
        node.className = "relief-world-label";
        labelLayer?.append(node);
        labelNodes.set(id, node);
      }
      used.add(id);
      if (node.textContent !== text) node.textContent = text;
      return node;
    };
    const place = (
      id: string,
      text: string,
      point: WorldPoint,
      height: number,
      tone: "harbor" | "destination" | "wayknot",
      selected = false,
    ): void => {
      const projected = projectReliefPoint(
        point,
        height,
        camera,
        { width: instance?.width ?? 1, height: instance?.height ?? 1 },
      );
      const node = labelNode(id, text);
      node.hidden = !projected.visible;
      if (!projected.visible) {
        labelPositions.delete(id);
        return;
      }
      const eased = easeWorldLabelPoint(
        labelPositions.get(id),
        projected,
        now,
        reducedMotion,
      );
      labelPositions.set(id, eased);
      const viewportWidth = instance?.width ?? 1;
      const labelHalfWidth = Math.min(144, Math.max(48, viewportWidth * 0.24));
      const labelX = clamp(
        eased.x,
        12 + labelHalfWidth,
        Math.max(12 + labelHalfWidth, viewportWidth - 12 - labelHalfWidth),
      );
      node.dataset.tone = tone;
      node.dataset.selected = selected ? "true" : "false";
      node.style.left = `${labelX.toFixed(1)}px`;
      node.style.top = `${eased.y.toFixed(1)}px`;
    };

    for (const settlement of view.settlements) {
      if (settlement.discovered === false) continue;
      const isDestination = Boolean(
        destination && distanceSquared(destination, settlement.position) <= tileSize * tileSize * 0.25,
      );
      if (
        currentSettlementVisibility(settlement, view.perception !== undefined) < 1
        && !isDestination
      ) continue;
      const surface = discoveredReliefSurfaceHeightAt(
        view.terrain,
        settlement.position,
        cache.mesh.verticalScale,
        true,
      );
      place(
        `settlement-${settlement.id}`,
        isDestination && view.player.destinationLabel
          ? view.player.destinationLabel
          : settlement.name,
        settlement.position,
        surface + tileSize * 1.45,
        isDestination ? "destination" : "harbor",
        Boolean(settlement.selected),
      );
    }
    if (destination && !view.settlements.some(
      (settlement) => settlement.discovered !== false
        && distanceSquared(destination, settlement.position) <= tileSize * tileSize * 0.25,
    )) {
      const surface = discoveredReliefSurfaceHeightAt(
        view.terrain,
        destination,
        cache.mesh.verticalScale,
        true,
      );
      place(
        "journey-destination",
        view.player.destinationLabel ?? "DESTINATION",
        destination,
        surface + tileSize,
        "destination",
      );
    }
    for (const wayknot of view.wayknots) {
      if (
        view.perception
        && !isDirectlyDetailPerceived(view.terrain, wayknot.position, true)
      ) continue;
      const surface = discoveredReliefSurfaceHeightAt(
        view.terrain,
        wayknot.position,
        cache.mesh.verticalScale,
        true,
      );
      const labelLift = wayknot.kind === "wind-knot"
        ? tileSize * 1.62
        : wayknot.kind === "tide-anchor"
          ? tileSize * 0.9
          : tileSize * 0.58;
      place(
        `wayknot-${wayknot.id}`,
        wayknot.active ? `WAYKNOT · ${wayknot.label}` : wayknot.label,
        wayknot.position,
        surface + labelLift,
        "wayknot",
        wayknot.active,
      );
    }
    if (pointerWorld && !hoverParcelId) {
      const resourceHit = hitTestFieldResource(
        view.fieldResources.filter((node) =>
          !view.perception || node.currentVisibility === 1
        ),
        pointerWorld,
        Math.max(tileSize * 0.58, unitsPerPixel() * 22),
      );
      if (resourceHit) {
        const node = resourceHit.node;
        const surface = discoveredReliefSurfaceHeightAt(
          view.terrain,
          node.position,
          cache.mesh.verticalScale,
          true,
        );
        const detail = node.knowledge === "sounded"
          ? `${node.rarity ?? "known"} · ${node.stockUnits ?? 0} ready`
          : "charted · sound for stock";
        place(
          `resource-${node.id}`,
          `${FIELD_RESOURCE_PRESENTATION[node.material].label} · ${detail}`,
          node.position,
          surface + tileSize * 0.82,
          "wayknot",
          true,
        );
      }
    }
    const parcels = looseCargoViews();
    const nearbyParcel = nearestRecoverableLooseCargo(
      parcels,
      view.player.position,
      Math.max(1, tileSize * 0.9),
    );
    const labeledParcel = parcels.find(({ id }) => id === hoverParcelId)
      ?? nearbyParcel;
    if (labeledParcel) {
      const surface = discoveredReliefSurfaceHeightAt(
        view.terrain,
        labeledParcel.position,
        cache.mesh.verticalScale,
        true,
      );
      place(
        `parcel-${labeledParcel.id}`,
        looseCargoRecoveryLabel(
          labeledParcel,
          window.matchMedia?.("(pointer: coarse)").matches ?? false,
        ),
        labeledParcel.position,
        surface + tileSize * 0.78,
        "wayknot",
        true,
      );
    }
    const tideHarps = tideHarpGeometryFor(view.tideHarps, tileSize * 0.1);
    for (const harp of tideHarps) {
      if (
        view.perception
        && !isDirectlyDetailPerceived(view.terrain, harp.center, true)
      ) continue;
      const centerSurface = discoveredReliefSurfaceHeightAt(
        view.terrain,
        harp.center,
        cache.mesh.verticalScale,
        true,
      );
      const rootSurfaces = harp.spokes.map((spoke) => ({
        kind: spoke.kind,
        surface: discoveredReliefSurfaceHeightAt(
          view.terrain,
          spoke.from,
          cache.mesh.verticalScale,
          true,
        ),
      }));
      const bellBase = tideHarpBellBaseHeight(
        centerSurface,
        rootSurfaces,
        tileSize,
        harp.active,
      );
      place(
        `tide-harp-${harp.id}`,
        harp.label,
        harp.center,
        bellBase + tileSize * (harp.active ? 1.18 : 1.02),
        "wayknot",
        harp.active,
      );
    }
    const incident = view.player.incident;
    if (incident && typeof incident.id === "string" && incident.id.length > 0) {
      const compact = instance.width <= 704
        || (instance.height <= 544 && instance.width <= 1_024);
      const text = incident.label;
      const node = labelNode(`player-incident-${incident.id}`, text);
      const playerSurface = discoveredReliefSurfaceHeightAt(
        view.terrain,
        view.player.position,
        cache.mesh.verticalScale,
        true,
      );
      const projected = projectReliefPoint(
        view.player.position,
        playerSurface + tileSize * 0.72,
        camera,
        { width: instance.width, height: instance.height },
      );
      node.hidden = !projected.visible;
      if (projected.visible) {
        const presentation = playerBalancePresentation(view.player.balanceState);
        const variant = Number.isSafeInteger(incident.variantSeed)
          ? ((incident.variantSeed % 3) + 3) % 3 - 1
          : 0;
        const desiredWidth = Math.min(
          compact ? 226 : 310,
          Math.max(86, text.length * (compact ? 5.8 : 6.4) + 22),
        );
        const eased = easeWorldLabelPoint(
          labelPositions.get(`player-incident-${incident.id}`),
          projected,
          now,
          reducedMotion,
        );
        labelPositions.set(`player-incident-${incident.id}`, eased);
        const placed = placeIncidentCallout(
          { x: eased.x + variant * 3, y: eased.y },
          desiredWidth,
          {
            width: instance.width,
            height: instance.height,
            safeTop: compact ? 76 : 70,
            safeBottom: compact ? 92 : 58,
            compact,
          },
        );
        const progress = unit(incident.progress);
        node.dataset.tone = "incident";
        node.dataset.selected = "false";
        node.dataset.incidentKind = incident.kind;
        node.dataset.placement = placed.aboveCourier ? "above" : "below";
        node.style.left = `${placed.x.toFixed(1)}px`;
        node.style.top = `${placed.y.toFixed(1)}px`;
        node.style.width = `${placed.width.toFixed(1)}px`;
        node.style.maxWidth = `${placed.width.toFixed(1)}px`;
        node.style.boxSizing = "border-box";
        node.style.color = presentation.outline;
        node.style.borderLeftColor = presentation.fill;
        node.style.boxShadow = `0 0 0 1px ${presentation.fill}55`;
        node.style.opacity = `${(0.98 - progress * 0.14).toFixed(3)}`;
        node.style.transform = "translate(-50%, -50%)";
      } else {
        labelPositions.delete(`player-incident-${incident.id}`);
      }
    }
    for (const [id, node] of labelNodes) {
      if (used.has(id)) continue;
      node.remove();
      labelNodes.delete(id);
      labelPositions.delete(id);
    }
  };

  const findSelection = (
    point: WorldPoint,
  ): { entity: "settlement" | "porter" | "route" | "resource"; id: string } | null => {
    const view = latestView;
    if (!view) return null;
    let nearest: { entity: "settlement" | "porter" | "route" | "resource"; id: string; distance: number } | null = null;
    const settlementRadius = Math.max(view.terrain.tileSize * 0.55, unitsPerPixel() * 18);
    for (const settlement of view.settlements) {
      if (settlement.discovered === false) continue;
      if (currentSettlementVisibility(settlement, view.perception !== undefined) < 1) continue;
      const distance = distanceSquared(point, settlement.position);
      if (distance <= settlementRadius ** 2 && (!nearest || distance < nearest.distance)) {
        nearest = { entity: "settlement", id: settlement.id, distance };
      }
    }
    const resourceRadius = Math.max(view.terrain.tileSize * 0.58, unitsPerPixel() * 22);
    const resourceHit = hitTestFieldResource(
      view.fieldResources.filter((node) =>
        !view.perception || node.currentVisibility === 1
      ),
      point,
      resourceRadius,
    );
    if (resourceHit && (!nearest || resourceHit.distanceSquared < nearest.distance)) {
      nearest = {
        entity: "resource",
        id: resourceHit.node.id,
        distance: resourceHit.distanceSquared,
      };
    }
    const porterRadius = Math.max(view.terrain.tileSize * 0.35, unitsPerPixel() * 12);
    for (const porter of view.porters) {
      if (!isDirectlyDetailPerceived(view.terrain, porter.position, view.perception !== undefined)) continue;
      const distance = distanceSquared(point, porter.position);
      if (distance <= porterRadius ** 2 && (!nearest || distance < nearest.distance)) {
        nearest = { entity: "porter", id: porter.id, distance };
      }
    }
    if (routePointerTargetIsDirectlyPerceived(view, point)) {
      const routeRadius = Math.max(view.terrain.tileSize * 0.2, unitsPerPixel() * 8);
      for (const route of view.routes) {
        const distance = routeDistanceSquared(point, route);
        if (distance <= routeRadius ** 2 && (!nearest || distance < nearest.distance)) {
          nearest = { entity: "route", id: route.id, distance };
        }
      }
    }
    return nearest && { entity: nearest.entity, id: nearest.id };
  };

  const pulseScan = (point?: WorldPoint): void => {
    const view = refreshLatestView();
    const origin = point ?? view?.player.position;
    if (!origin) return;
    ripples.push({ point: { ...origin }, startedAt: performance.now() });
    if (ripples.length > 4) ripples.shift();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    refreshLatestView();
    if (!active
      || contextLost
      || event.ctrlKey
      || event.metaKey
      || event.altKey
      || isEditingTarget(event.target)
      || hasOpenDialog()) return;
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      event.preventDefault();
      const wasBracing = heldBraceKeys.size > 0;
      heldBraceKeys.add(event.code);
      if (!wasBracing) emit({ type: "brace", active: true });
      return;
    }
    if ([
      "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
      "KeyA", "KeyD", "KeyW", "KeyS",
    ].includes(event.code)) {
      event.preventDefault();
      heldDirections.add(event.code);
      updateMovement();
      return;
    }
    if (event.repeat) return;
    switch (event.code) {
      case "Space":
        event.preventDefault();
        pulseScan();
        emit({ type: "scan" });
        break;
      case "KeyE":
      case "Enter": {
        const view = latestView;
        const parcel = view
          ? nearestRecoverableLooseCargo(
              looseCargoViews(),
              view.player.position,
              Math.max(1, view.terrain.tileSize * 0.9),
            )
          : null;
        const parcelCommand = keyboardLooseCargoRecoveryCommand(parcel);
        if (parcelCommand) {
          emit(parcelCommand);
        } else {
          emit({ type: "interact" });
        }
        break;
      }
      case "KeyF":
        event.preventDefault();
        emit({ type: "wayknot" });
        break;
      case "Escape":
        emit({ type: "cancel" });
        break;
    }
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    refreshLatestView();
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      event.preventDefault();
      heldBraceKeys.delete(event.code);
      if (heldBraceKeys.size === 0) options.dispatch({ type: "brace", active: false });
      return;
    }
    if (!heldDirections.delete(event.code)) return;
    event.preventDefault();
    updateMovement();
  };

  const onWindowKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== "KeyJ" && event.code !== "KeyL") return;
    if (!active
      || contextLost
      || event.ctrlKey
      || event.metaKey
      || event.altKey
      || isEditingTarget(event.target)
      || hasOpenDialog()) return;
    event.preventDefault();
    heldOrbitKeys.add(event.code);
  };

  const onWindowKeyUp = (event: KeyboardEvent): void => {
    if (event.code !== "KeyJ" && event.code !== "KeyL") return;
    if (!heldOrbitKeys.delete(event.code)) return;
    event.preventDefault();
  };

  const detachCanvasListeners = (): void => {
    if (!attached) return;
    const { element } = attached;
    element.removeEventListener("pointerdown", attached.pointerDown);
    element.removeEventListener("pointermove", attached.pointerMove);
    element.removeEventListener("pointerup", attached.pointerUp);
    element.removeEventListener("pointercancel", attached.pointerCancel);
    element.removeEventListener("lostpointercapture", attached.lostPointerCapture);
    element.removeEventListener("pointerleave", attached.pointerLeave);
    element.removeEventListener("contextmenu", attached.contextMenu);
    element.removeEventListener("keydown", attached.keyDown);
    element.removeEventListener("keyup", attached.keyUp);
    element.removeEventListener("blur", attached.blur);
    window.removeEventListener("keydown", attached.windowKeyDown);
    window.removeEventListener("keyup", attached.windowKeyUp);
    window.removeEventListener("blur", attached.windowBlur);
    document.removeEventListener("visibilitychange", attached.visibilityChange);
    element.removeEventListener("wheel", attached.wheel);
    element.removeEventListener("webglcontextlost", attached.contextLost);
    element.removeEventListener("webglcontextrestored", attached.contextRestored);
    attached = null;
  };

  const attachCanvasListeners = (element: HTMLCanvasElement): void => {
    detachCanvasListeners();
    const releasePointerCapture = (pointerId: number): void => {
      releaseLooseCargoPointerCaptures(element, [pointerId]);
    };
    const endTouch = (pointerId: number): void => {
      activeTouchPointers.delete(pointerId);
      if (twistGesture?.pointerIds.includes(pointerId)) twistGesture = null;
      if (activeTouchPointers.size === 0) {
        twistGesture = null;
        touchSequenceSuppressed = false;
      }
      releasePointerCapture(pointerId);
    };
    const dispatchClick = (event: PointerEvent): void => {
      refreshLatestView();
      if (clickCandidate?.pointerId !== event.pointerId) return;
      const candidate = clickCandidate;
      clickCandidate = null;
      const screen = localPointer(event);
      const parcelRelease = resolveLooseCargoPointerRelease(
        parcelPress,
        event.pointerId,
        screen,
        looseCargoViews(),
        looseCargoHitRadiusPixels(candidate.coarsePointer, 10),
        projectParcelScreen,
        "relief-3d",
        candidate.coarsePointer,
      );
      parcelPress = null;
      if (parcelRelease.consumesWorldTap) {
        if (parcelRelease.command) emit(parcelRelease.command);
        return;
      }
      const point = pickWorld(screen);
      if (!point) return;
      pointerWorld = point;
      const target = findSelection(point);
      const view = latestView;
      if (view) emit(commandForWorldTap(
        view,
        target,
        point,
        candidate.coarsePointer,
        candidate.shiftKey || event.shiftKey,
      ));
    };
    const pointerDown = (event: PointerEvent): void => {
      refreshLatestView();
      if (!active || contextLost) return;
      element.focus({ preventScroll: true });
      if (event.pointerType === "touch" && event.button === 0) {
        resetPointerParallax(pointerParallax, true);
        activeTouchPointers.set(event.pointerId, {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        });
        element.setPointerCapture?.(event.pointerId);
        if (activeTouchPointers.size >= 2) {
          twistGesture ??= beginReliefTwist([...activeTouchPointers.values()]);
          // Once a second finger joins, this entire touch sequence belongs to
          // camera manipulation and can never leak through as a route click.
          touchSequenceSuppressed = true;
          clickCandidate = null;
          parcelPress = null;
          hoverParcelId = null;
          orbitDrag = null;
        } else if (!touchSequenceSuppressed) {
          const screen = localPointer(event);
          parcelPress = beginLooseCargoPointerPress(
            event.pointerId,
            screen,
            looseCargoViews(),
            looseCargoHitRadiusPixels(true, 10),
            18,
            projectParcelScreen,
            "relief-3d",
          );
          clickCandidate = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            shiftKey: event.shiftKey,
            coarsePointer: true,
          };
        }
        event.preventDefault();
        return;
      }
      const orbiting = event.button === 1 || event.button === 2 || (event.button === 0 && event.altKey);
      if (orbiting) {
        orbitDrag = {
          pointerId: event.pointerId,
          button: event.button,
          lastX: event.clientX,
          lastY: event.clientY,
          moved: false,
        };
        element.setPointerCapture?.(event.pointerId);
      } else if (event.button === 0) {
        const coarsePointer = usesCoarseWorldPointer(
          event.pointerType,
          window.matchMedia?.("(pointer: coarse)").matches ?? false,
        );
        parcelPress = beginLooseCargoPointerPress(
          event.pointerId,
          localPointer(event),
          looseCargoViews(),
          looseCargoHitRadiusPixels(coarsePointer, 10),
          coarsePointer ? 18 : 7,
          projectParcelScreen,
          "relief-3d",
        );
        clickCandidate = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          shiftKey: event.shiftKey,
          coarsePointer,
        };
      }
      event.preventDefault();
    };
    const pointerMove = (event: PointerEvent): void => {
      refreshLatestView();
      if (event.pointerType === "touch" && activeTouchPointers.has(event.pointerId)) {
        activeTouchPointers.set(event.pointerId, {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        });
        if (!twistGesture && activeTouchPointers.size >= 2) {
          twistGesture = beginReliefTwist([...activeTouchPointers.values()]);
        }
        if (twistGesture) {
          const update = updateReliefTwist(twistGesture, [...activeTouchPointers.values()]);
          twistGesture = update.gesture;
          if (update.yawDelta !== 0) setOrbitYaw(orbit.yaw + update.yawDelta);
          clickCandidate = null;
          parcelPress = null;
          hoverParcelId = null;
          event.preventDefault();
          return;
        }
        if (touchSequenceSuppressed) {
          clickCandidate = null;
          parcelPress = null;
          hoverParcelId = null;
          event.preventDefault();
          return;
        }
      }
      if (orbitDrag?.pointerId === event.pointerId) {
        resetPointerParallax(pointerParallax, true);
        const dx = event.clientX - orbitDrag.lastX;
        const dy = event.clientY - orbitDrag.lastY;
        if (Math.abs(dx) + Math.abs(dy) > 0.5) orbitDrag.moved = true;
        setOrbitYaw(orbit.yaw - dx * 0.008);
        orbit.pitch = clamp(orbit.pitch + dy * 0.006, MIN_RELIEF_PITCH, MAX_RELIEF_PITCH);
        orbitDrag.lastX = event.clientX;
        orbitDrag.lastY = event.clientY;
        hoverParcelId = null;
        event.preventDefault();
        return;
      }
      const local = localPointer(event);
      const coarsePointer = usesCoarseWorldPointer(
        event.pointerType,
        window.matchMedia?.("(pointer: coarse)").matches ?? false,
      );
      if (event.pointerType === "touch" || coarsePointer || reducedMotion) {
        resetPointerParallax(pointerParallax, true);
      } else {
        setPointerParallaxTarget(
          pointerParallax,
          presentationParallaxTarget(normalizedPresentationPointer(
            local,
            { width: instance?.width ?? 1, height: instance?.height ?? 1 },
          ), 3.2),
        );
      }
      pointerWorld = event.pointerType === "touch" ? null : pickWorld(local);
      hoverParcelId = event.pointerType === "touch"
        ? null
        : parcelHitAt(local, coarsePointer)?.parcel.id ?? null;
      if (clickCandidate?.pointerId === event.pointerId) {
        const maximumTravel = clickCandidate.coarsePointer ? 18 : 7;
        parcelPress = moveLooseCargoPointerPress(
          parcelPress,
          event.pointerId,
          local,
        );
        if (Math.hypot(
          event.clientX - clickCandidate.startX,
          event.clientY - clickCandidate.startY,
        ) > maximumTravel) {
          clickCandidate = null;
        }
      }
    };
    const pointerUp = (event: PointerEvent): void => {
      refreshLatestView();
      if (event.pointerType === "touch" && activeTouchPointers.has(event.pointerId)) {
        if (!touchSequenceSuppressed) dispatchClick(event);
        else if (clickCandidate?.pointerId === event.pointerId) clickCandidate = null;
        endTouch(event.pointerId);
        event.preventDefault();
        return;
      }
      if (orbitDrag?.pointerId === event.pointerId) {
        const wasRightClick = orbitDrag.button === 2 && !orbitDrag.moved;
        orbitDrag = null;
        releasePointerCapture(event.pointerId);
        if (wasRightClick) emit({ type: "cancel" });
        event.preventDefault();
        return;
      }
      if (clickCandidate?.pointerId !== event.pointerId) return;
      dispatchClick(event);
      event.preventDefault();
    };
    const pointerCancel = (event: PointerEvent): void => {
      refreshLatestView();
      if (orbitDrag?.pointerId === event.pointerId) orbitDrag = null;
      if (clickCandidate?.pointerId === event.pointerId) clickCandidate = null;
      parcelPress = cancelLooseCargoPointerPress(parcelPress, event.pointerId);
      if (event.pointerType === "touch" && activeTouchPointers.has(event.pointerId)) {
        endTouch(event.pointerId);
      }
    };
    const lostPointerCapture = (event: PointerEvent): void => {
      refreshLatestView();
      // Mobile browsers may revoke capture during an OS gesture or interruption
      // without first delivering pointerup/pointercancel. Clear the same
      // per-pointer state so a stale finger cannot swallow the next route tap.
      if (orbitDrag?.pointerId === event.pointerId) orbitDrag = null;
      if (clickCandidate?.pointerId === event.pointerId) clickCandidate = null;
      parcelPress = cancelLooseCargoPointerPress(parcelPress, event.pointerId);
      if (activeTouchPointers.has(event.pointerId)) endTouch(event.pointerId);
    };
    const pointerLeave = (): void => {
      pointerWorld = null;
      hoverParcelId = null;
      resetPointerParallax(pointerParallax, false);
    };
    const contextMenu = (event: MouseEvent): void => {
      refreshLatestView();
      event.preventDefault();
    };
    const blur = (): void => {
      refreshLatestView();
      releaseInput();
    };
    const windowBlur = (): void => {
      refreshLatestView();
      releaseInput();
    };
    const visibilityChange = (): void => {
      if (document.visibilityState === "hidden") {
        refreshLatestView();
        releaseInput();
      }
    };
    const wheel = (event: WheelEvent): void => {
      refreshLatestView();
      if (!active || contextLost) return;
      event.preventDefault();
      orbit.manualZoom = clamp(orbit.manualZoom * Math.exp(-event.deltaY * 0.0012), 0.38, 3.2);
    };
    const contextLostListener = (event: Event): void => {
      event.preventDefault();
      contextLost = true;
      telemetry.setActive(false);
      releaseInput();
      instance?.noLoop();
      options.onWebGLError?.("The 3D graphics context was lost. Chart view is active; reload to retry Relief 3D.");
    };
    const contextRestored = (): void => {
      contextLost = false;
      telemetry.setActive(active && webglSupported);
      cached = null;
      cachedPerceptionMesh = null;
      cachedPerception = null;
      refreshLatestView();
      if (active) instance?.loop();
    };

    element.addEventListener("pointerdown", pointerDown);
    element.addEventListener("pointermove", pointerMove);
    element.addEventListener("pointerup", pointerUp);
    element.addEventListener("pointercancel", pointerCancel);
    element.addEventListener("lostpointercapture", lostPointerCapture);
    element.addEventListener("pointerleave", pointerLeave);
    element.addEventListener("contextmenu", contextMenu);
    element.addEventListener("keydown", onKeyDown);
    element.addEventListener("keyup", onKeyUp);
    element.addEventListener("blur", blur);
    window.addEventListener("keydown", onWindowKeyDown);
    window.addEventListener("keyup", onWindowKeyUp);
    window.addEventListener("blur", windowBlur);
    document.addEventListener("visibilitychange", visibilityChange);
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("webglcontextlost", contextLostListener);
    element.addEventListener("webglcontextrestored", contextRestored);
    attached = {
      element,
      pointerDown,
      pointerMove,
      pointerUp,
      pointerCancel,
      lostPointerCapture,
      pointerLeave,
      contextMenu,
      keyDown: onKeyDown,
      keyUp: onKeyUp,
      blur,
      windowKeyDown: onWindowKeyDown,
      windowKeyUp: onWindowKeyUp,
      windowBlur,
      visibilityChange,
      wheel,
      contextLost: contextLostListener,
      contextRestored,
    };
  };

  const reliefScale = (grid: TerrainGridView): number =>
    options.verticalScale ?? Math.max(1, grid.tileSize * 2.9);

  const ensureMesh = (view: TideweftView): CachedReliefMesh => {
    const scale = reliefScale(view.terrain);
    const discoveryKey = discoverySignatureFor(view.terrain);
    const key = [
      typeof view.terrain.revision,
      String(view.terrain.revision),
      discoveryKey,
      view.terrain.columns,
      view.terrain.rows,
      view.terrain.tileSize,
      options.chunkSize ?? 16,
      scale,
    ].join(":");
    if (cached?.key === key) return cached;
    const maskedTerrain: TerrainGridView = {
      ...view.terrain,
      revision: key,
      // Unknown topography remains a flat dark possibility until the Loom
      // actually charts it. Partial edge discovery eases the relief in.
      tiles: view.terrain.tiles.map(maskReliefTileForDiscovery),
    };
    const mesh = buildTerrainMesh(maskedTerrain, {
      chunkSize: options.chunkSize ?? 16,
      verticalScale: scale,
    });
    // Durable discovery can change every travel step. The unmasked height
    // field cannot, so retain it independently and rebuild only when the
    // authoritative terrain revision or mesh configuration changes.
    const perceptionMeshKey = [
      typeof view.terrain.revision,
      String(view.terrain.revision),
      view.terrain.columns,
      view.terrain.rows,
      view.terrain.tileSize,
      options.chunkSize ?? 16,
      scale,
    ].join(":");
    if (cachedPerceptionMesh?.key !== perceptionMeshKey) {
      cachedPerceptionMesh = {
        key: perceptionMeshKey,
        mesh: buildTerrainMesh(view.terrain, {
          chunkSize: options.chunkSize ?? 16,
          verticalScale: scale,
        }),
      };
    }
    const perceptionMesh = cachedPerceptionMesh.mesh;
    const chunks = mesh.chunks.map((chunk): ReliefChunkBatch => ({
      chunk,
      materials: buildReliefMaterialBatches(chunk, view.terrain),
    }));
    cached = { key, mesh, chunks, perceptionMesh };
    return cached;
  };

  const ensurePerceptionSurface = (
    view: TideweftView,
    mesh: CachedReliefMesh,
  ): CachedReliefPerception | null => {
    if (!view.perception) return null;
    const key = `${mesh.key}:perception:${view.perception.signature}`;
    if (cachedPerception?.key === key) return cachedPerception;
    cachedPerception = {
      key,
      chunks: mesh.perceptionMesh.chunks.map((chunk) => ({
        chunk,
        materials: buildReliefPerceptionMaterialBatches(chunk, view.terrain),
      })),
    };
    return cachedPerception;
  };

  const updateCamera = (view: TideweftView, now: number, mesh: TerrainMesh): void => {
    const projected = view.camera.followPlayer ? view.player.position : view.camera.center;
    const focusActive = orbit.focusPoint !== undefined && now < orbit.focusUntil;
    const target = focusActive ? orbit.focusPoint! : projected;
    const minimumViewport = Math.min(instance?.width ?? 640, instance?.height ?? 480);
    const baseDistance = clamp(minimumViewport * 0.96, 430, 780);
    const targetDistance = clamp(
      baseDistance / Math.max(0.12, view.camera.zoom * orbit.manualZoom),
      150,
      2_200,
    );
    const targetHeight = discoveredReliefSurfaceHeightAt(
      view.terrain,
      target,
      mesh.verticalScale,
      false,
    );
    if (!orbit.initialized || reducedMotion) {
      orbit.x = target.x;
      orbit.y = target.y;
      orbit.height = targetHeight;
      orbit.distance = targetDistance;
      orbit.initialized = true;
    } else {
      orbit.x += (target.x - orbit.x) * 0.09;
      orbit.y += (target.y - orbit.y) * 0.09;
      orbit.height += (targetHeight - orbit.height) * 0.08;
      orbit.distance += (targetDistance - orbit.distance) * 0.085;
    }
    if (!focusActive) orbit.focusPoint = undefined;
    const bounds = view.camera.bounds;
    if (bounds) {
      orbit.x = clamp(orbit.x, bounds.minX, bounds.maxX);
      orbit.y = clamp(orbit.y, bounds.minY, bounds.maxY);
    }
  };

  const sketch = (p: p5): void => {
    const withAlpha = (hex: string, alpha: number): p5.Color => {
      const color = p.color(hex);
      color.setAlpha(clamp(alpha, 0, 255));
      return color;
    };

    const materialColor = (
      material: ReliefMaterialBatch,
      fog: number,
      memoryOnly = false,
      currentVisibility = 1,
    ): p5.Color => {
      const biome = material.kind === "built" || material.biome === undefined
        ? undefined
        : BIOME_PRESENTATION[material.biome];
      const base = p.color(biome?.reliefColor ?? TERRAIN_COLORS[material.kind]);
      const conditioned = p.lerpColor(
        base,
        p.color(biome?.accentColor ?? RELIEF_PALETTE.foam),
        biome ? clamp(0.07 + material.environment * 0.15, 0.07, 0.22) : 0.04,
      );
      const revealed = p.lerpColor(
        p.color(RELIEF_PALETTE.ink),
        conditioned,
        Math.pow(unit(material.visibility), 0.72),
      );
      const atmospheric = p.lerpColor(
        revealed,
        p.color(RELIEF_PALETTE.horizon),
        clamp(fog * 0.5, 0, 0.58),
      );
      if (memoryOnly) return p.lerpColor(p.color(RELIEF_PALETTE.ink), atmospheric, 0.13);
      return currentVisibility < 1
        ? p.lerpColor(
            p.color(RELIEF_PALETTE.ink),
            atmospheric,
            Math.pow(unit(currentVisibility), 1.15),
          )
        : atmospheric;
    };

    const setCamera = (state: ReliefCameraState): void => {
      const pose = reliefCameraPose(state, { width: p.width, height: p.height });
      p.perspective(pose.verticalFov, pose.aspect, pose.near, pose.far);
      p.camera(
        pose.eye.x, pose.eye.y, pose.eye.z,
        pose.target.x, pose.target.y, pose.target.z,
        pose.down.x, pose.down.y, pose.down.z,
      );
    };

    const drawTerrain = (view: TideweftView, cache: CachedReliefMesh, camera: ReliefCameraState): void => {
      const viewport = { width: p.width, height: p.height };
      const fogStart = orbit.distance * 0.55;
      const fogEnd = orbit.distance * 1.7;
      p.noStroke();
      for (const batch of cache.chunks) {
        if (!reliefBoundsVisible(batch.chunk.bounds, camera, viewport, view.terrain.tileSize * 2)) continue;
        const fog = reliefFogAmount(batch.chunk.bounds, camera, viewport, fogStart, fogEnd);
        for (const material of batch.materials) {
          const surfaceColor = materialColor(material, fog, view.perception !== undefined);
          // p5 keeps directional diffuse fill separate from ambient material.
          // Bind both or its default white fill washes dark terrain toward cyan.
          p.fill(surfaceColor);
          p.ambientMaterial(surfaceColor);
          p.beginShape(p.TRIANGLES);
          for (const index of material.indices) {
            const vertex = batch.chunk.vertices[index];
            if (!vertex) continue;
            p.normal(vertex.normal.x, -vertex.normal.z, vertex.normal.y);
            p.vertex(vertex.x, -vertex.z, vertex.y);
          }
          p.endShape();
        }
      }

      const perception = ensurePerceptionSurface(view, cache);
      if (!perception) return;
      // Re-light only the small current sensory footprint. This overlay is
      // cached by perception signature and never invalidates the durable mesh.
      // Keep this height field depth-writing: translucent overlapping
      // triangles accumulate into a bright silhouette in an oblique camera.
      // Visibility is instead eased in RGB all the way to the background ink.
      for (const batch of perception.chunks) {
        if (!reliefBoundsVisible(batch.chunk.bounds, camera, viewport, view.terrain.tileSize * 2)) continue;
        const fog = reliefFogAmount(batch.chunk.bounds, camera, viewport, fogStart, fogEnd);
        for (const material of batch.materials) {
          const surfaceColor = materialColor(material, fog, false, material.currentVisibility);
          p.fill(surfaceColor);
          p.ambientMaterial(surfaceColor);
          p.beginShape(p.TRIANGLES);
          for (const index of material.indices) {
            const vertex = batch.chunk.vertices[index];
            if (!vertex) continue;
            p.normal(vertex.normal.x, -vertex.normal.z, vertex.normal.y);
            p.vertex(vertex.x, -vertex.z - 0.12, vertex.y);
          }
          p.endShape();
        }
      }
    };

    const drawBiomeDetails = (view: TideweftView, cache: CachedReliefMesh): void => {
      const grid = view.terrain;
      const tileSize = grid.tileSize;
      const reach = orbit.distance * 1.15;
      const startColumn = clampInteger(Math.floor((orbit.x - reach - grid.origin.x) / tileSize), 0, grid.columns - 1);
      const endColumn = clampInteger(Math.ceil((orbit.x + reach - grid.origin.x) / tileSize), 0, grid.columns - 1);
      const startRow = clampInteger(Math.floor((orbit.y - reach - grid.origin.y) / tileSize), 0, grid.rows - 1);
      const endRow = clampInteger(Math.ceil((orbit.y + reach - grid.origin.y) / tileSize), 0, grid.rows - 1);
      let shown = 0;
      const maximumDetails = 420;
      const candidateCells = Math.max(1, (endColumn - startColumn + 1) * (endRow - startRow + 1));
      const detailThreshold = 1 - Math.min(0.43, maximumDetails / candidateCells);

      p.noFill();
      for (let row = startRow; row <= endRow && shown < maximumDetails; row += 1) {
        for (let column = startColumn; column <= endColumn && shown < maximumDetails; column += 1) {
          const tile = grid.tiles[row * grid.columns + column];
          const visibility = reliefDiscoveryVisibility(tile);
          const presentation = visibleBiomePresentation(tile);
          if (
            !tile
            || tile.kind === "built"
            || !presentation
            || visibility < 0.3
            || currentTerrainDetailVisibility(tile, view.perception !== undefined) < 1
          ) continue;
          const variant = reliefTileHash01(column, row, 0x6269_6f6d);
          if (variant < detailThreshold) continue;

          const emphasis = biomeEnvironmentalEmphasis(tile);
          const center = {
            x: grid.origin.x + (column + 0.5) * tileSize,
            y: grid.origin.y + (row + 0.5) * tileSize,
          };
          const surface = discoveredReliefSurfaceHeightAt(
            grid,
            center,
            cache.mesh.verticalScale,
            presentation.motif === "ripple" || presentation.motif === "glimmer",
          ) + 0.8;
          const baseY = -surface;
          const lift = tileSize * (0.19 + emphasis * 0.12);
          const half = tileSize * 0.13;
          const skew = (variant - 0.5) * tileSize * 0.18;
          p.stroke(withAlpha(presentation.accentColor, (70 + emphasis * 90) * visibility));
          p.strokeWeight(0.85 + visibility * 0.65);

          switch (presentation.motif) {
            case "ripple":
              p.line(center.x - half * 1.4, baseY, center.y, center.x + half * 1.4, baseY, center.y + skew * 0.3);
              p.line(center.x - half * 0.8, baseY - 0.5, center.y + half, center.x + half * 0.8, baseY - 0.5, center.y + half + skew * 0.2);
              break;
            case "salt-crystal":
              p.line(center.x, baseY, center.y - half, center.x + half, baseY - lift * 0.45, center.y);
              p.line(center.x + half, baseY - lift * 0.45, center.y, center.x, baseY, center.y + half);
              p.line(center.x, baseY, center.y + half, center.x - half, baseY - lift * 0.45, center.y);
              p.line(center.x - half, baseY - lift * 0.45, center.y, center.x, baseY, center.y - half);
              break;
            case "reeds":
              for (let reed = -1; reed <= 1; reed += 1) {
                const reedX = center.x + reed * half * 0.72;
                p.line(reedX, baseY, center.y, reedX + skew * 0.1, baseY - lift * (reed === 0 ? 1 : 0.72), center.y);
              }
              break;
            case "rain-stem":
              p.line(center.x, baseY, center.y, center.x, baseY - lift, center.y);
              p.line(center.x, baseY - lift * 0.56, center.y, center.x - half, baseY - lift * 0.77, center.y + half * 0.35);
              p.line(center.x, baseY - lift * 0.45, center.y, center.x + half, baseY - lift * 0.66, center.y - half * 0.35);
              break;
            case "sunburst":
              p.line(center.x, baseY, center.y, center.x, baseY - lift * 0.7, center.y);
              p.line(center.x - half, baseY - lift * 0.7, center.y, center.x + half, baseY - lift * 0.7, center.y);
              p.line(center.x, baseY - lift * 0.7, center.y - half, center.x, baseY - lift * 0.7, center.y + half);
              break;
            case "wind-stroke":
              p.line(center.x - half * 1.5, baseY - lift * 0.25, center.y + half, center.x + half * 1.4, baseY - lift * 0.55, center.y - half);
              p.line(center.x - half, baseY - lift * 0.58, center.y - half, center.x + half * 0.9, baseY - lift * 0.78, center.y - half * 1.35);
              break;
            case "glimmer":
              p.line(center.x, baseY, center.y, center.x, baseY - lift, center.y);
              p.line(center.x - half, baseY - lift * 0.62, center.y, center.x + half, baseY - lift * 0.62, center.y);
              p.line(center.x, baseY - lift * 0.62, center.y - half, center.x, baseY - lift * 0.62, center.y + half);
              break;
          }
          shown += 1;
        }
      }
      p.noStroke();
    };

    const drawWater = (view: TideweftView, cache: CachedReliefMesh): void => {
      if (!cache.mesh.waterPlane && !cache.perceptionMesh.waterPlane) return;
      const grid = view.terrain;
      const tileSize = grid.tileSize;
      const reach = orbit.distance * 1.45;
      const startColumn = clampInteger(Math.floor((orbit.x - reach - grid.origin.x) / tileSize), 0, grid.columns - 1);
      const endColumn = clampInteger(Math.ceil((orbit.x + reach - grid.origin.x) / tileSize), 0, grid.columns - 1);
      const startRow = clampInteger(Math.floor((orbit.y - reach - grid.origin.y) / tileSize), 0, grid.rows - 1);
      const endRow = clampInteger(Math.ceil((orbit.y + reach - grid.origin.y) / tileSize), 0, grid.rows - 1);
      const gl = p.drawingContext as WebGLRenderingContext | WebGL2RenderingContext;
      gl.depthMask(false);
      p.noStroke();
      const waterBatches = buildReliefWaterMaterialBatches(grid, view.tide.level, {
        firstColumn: startColumn,
        lastColumn: endColumn,
        firstRow: startRow,
        lastRow: endRow,
      });
      for (const batch of waterBatches) {
        // Emissive here means "use the authored dark surface color unchanged,"
        // not "glow": low-valued palette colors remain dark instead of being
        // lifted toward the pale terrain by WebGL's directional lights.
        p.emissiveMaterial(withAlpha(batch.material.color, reliefWaterOpacity(batch.material)));
        p.beginShape(p.TRIANGLES);
        for (const cell of batch.cells) {
          const { column, row } = cell;
          const x0 = grid.origin.x + column * tileSize;
          const x1 = x0 + tileSize;
          const z0 = grid.origin.y + row * tileSize;
          const z1 = z0 + tileSize;
          const surface = perceivedReliefSurfaceHeightAt(
            grid,
            { x: x0 + tileSize / 2, y: z0 + tileSize / 2 },
            cache.mesh.verticalScale,
            true,
          ) + 0.45;
          p.normal(0, -1, 0);
          p.vertex(x0, -surface, z0);
          p.vertex(x1, -surface, z0);
          p.vertex(x1, -surface, z1);
          p.vertex(x0, -surface, z0);
          p.vertex(x1, -surface, z1);
          p.vertex(x0, -surface, z1);
        }
        p.endShape();
      }
      gl.depthMask(true);
    };

    const drawSurfaceCurrents = (
      view: TideweftView,
      cache: CachedReliefMesh,
      now: number,
    ): void => {
      const grid = view.terrain;
      const tileSize = grid.tileSize;
      const reach = orbit.distance * 1.45;
      const bounds = {
        firstColumn: Math.floor((orbit.x - reach - grid.origin.x) / tileSize),
        lastColumn: Math.ceil((orbit.x + reach - grid.origin.x) / tileSize),
        firstRow: Math.floor((orbit.y - reach - grid.origin.y) / tileSize),
        lastRow: Math.ceil((orbit.y + reach - grid.origin.y) / tileSize),
      };
      const cues = buildSurfaceCurrentCues(grid, view.tide.surfaceCurrent, {
        bounds,
        focus: { x: orbit.x, y: orbit.y },
        tideLevel: view.tide.level,
        timeMs: now,
        reducedMotion,
        maxCues: 220,
        requireDetailDisclosure: view.perception !== undefined,
      });
      if (cues.length === 0) return;

      const heights = cues.map((cue) => discoveredReliefSurfaceHeightAt(
        grid,
        cue.center,
        cache.mesh.verticalScale,
        true,
      ) + 1.25);
      const strokeCue = (cue: (typeof cues)[number], surface: number): void => {
        p.line(cue.tail.x, -surface, cue.tail.y, cue.tip.x, -surface, cue.tip.y);
        p.line(cue.tip.x, -surface, cue.tip.y, cue.headLeft.x, -surface, cue.headLeft.y);
        p.line(cue.tip.x, -surface, cue.tip.y, cue.headRight.x, -surface, cue.headRight.y);
      };
      p.push();
      p.noFill();
      p.stroke(withAlpha(RELIEF_PALETTE.ink, 210));
      p.strokeWeight(3.7);
      for (let index = 0; index < cues.length; index += 1) {
        const cue = cues[index];
        const surface = heights[index];
        if (cue && surface !== undefined) strokeCue(cue, surface);
      }
      p.stroke(withAlpha(RELIEF_PALETTE.foam, 220));
      p.strokeWeight(1.35);
      for (let index = 0; index < cues.length; index += 1) {
        const cue = cues[index];
        const surface = heights[index];
        if (cue && surface !== undefined) strokeCue(cue, surface);
      }
      p.pop();
    };

    const drawRouteRun = (
      view: TideweftView,
      points: readonly WorldPoint[],
      cache: CachedReliefMesh,
      style: Pick<RouteView, "kind" | "strength">,
      selected: boolean,
    ): void => {
      if (points.length < 2) return;
      const remembered = style.kind === "remembered";
      const color = selected
        ? RELIEF_PALETTE.amber
        : style.kind === "wake"
          ? RELIEF_PALETTE.water
          : style.kind === "crossing"
            ? RELIEF_PALETTE.coral
            : RELIEF_PALETTE.foam;
      p.noFill();
      p.stroke(withAlpha(color, remembered ? (selected ? 178 : 66) : 115 + unit(style.strength) * 125));
      p.strokeWeight(selected ? 3 : remembered ? 0.9 : 1.45 + unit(style.strength));
      p.beginShape();
      for (const point of points) {
        const height = discoveredReliefSurfaceHeightAt(
          view.terrain,
          point,
          cache.mesh.verticalScale,
          true,
        ) + 2.2;
        p.vertex(point.x, -height, point.y);
      }
      p.endShape();
    };

    const drawRoutes = (
      view: TideweftView,
      cache: CachedReliefMesh,
      camera: ReliefCameraState,
    ): void => {
      const reach = orbit.distance * 1.45;
      const viewportBounds: WorldBounds = {
        minX: camera.target.x - reach,
        minY: camera.target.y - reach,
        maxX: camera.target.x + reach,
        maxY: camera.target.y + reach,
      };
      const viewport = { width: p.width, height: p.height };
      const routeBoundsVisible = (bounds: WorldBounds | null): boolean => {
        if (!bounds || !worldBoundsOverlap(bounds, viewportBounds)) return false;
        return reliefBoundsVisible({
          min: { x: bounds.minX, y: bounds.minY, z: 0 },
          max: {
            x: bounds.maxX,
            y: bounds.maxY,
            z: cache.mesh.verticalScale + view.terrain.tileSize * 0.25,
          },
        }, camera, viewport, view.terrain.tileSize * 2);
      };
      const visibleRuns = (
        points: readonly WorldPoint[],
        knownBounds: WorldBounds | null,
      ): readonly (readonly WorldPoint[])[] => routeBoundsVisible(knownBounds)
        ? clipPolylineToBounds(points, viewportBounds)
        : [];

      for (const route of view.routes) {
        const memoryRuns = visibleRuns(route.points, route.bounds ?? polylineBounds(route.points));
        for (const run of memoryRuns) drawRouteRun(view, run, cache, route, route.selected === true);
        for (const observation of route.observedRuns ?? []) {
          const observedRuns = visibleRuns(
            observation.points,
            observation.bounds ?? polylineBounds(observation.points),
          );
          for (const run of observedRuns) {
            drawRouteRun(view, run, cache, observation, route.selected === true);
          }
        }
      }
      const pulse = reducedMotion ? 0.72 : 0.65 + Math.sin(performance.now() * 0.002) * 0.15;
      p.noFill();
      p.stroke(withAlpha(RELIEF_PALETTE.violet, 150 * pulse));
      p.strokeWeight(2.2);
      for (const choir of view.choirs) {
        for (let pathIndex = 0; pathIndex < choir.routePaths.length; pathIndex += 1) {
          const path = choir.routePaths[pathIndex];
          if (!path) continue;
          const runs = visibleRuns(
            path,
            choir.routePathBounds?.[pathIndex] ?? polylineBounds(path),
          );
          for (const run of runs) {
            p.beginShape();
            for (const point of run) {
              const height = discoveredReliefSurfaceHeightAt(
                view.terrain,
                point,
                cache.mesh.verticalScale,
                true,
              ) + 4;
              p.vertex(point.x, -height, point.y);
            }
            p.endShape();
          }
        }
      }
    };

    const drawGroundRing = (
      view: TideweftView,
      cache: CachedReliefMesh,
      point: WorldPoint,
      radius: number,
      color: string,
      alpha: number,
      completion = 1,
    ): void => {
      const segments = 48;
      const count = Math.max(2, Math.floor(segments * clamp(completion, 0, 1)));
      p.noFill();
      p.stroke(withAlpha(color, alpha));
      p.strokeWeight(1.6);
      p.beginShape();
      for (let index = 0; index <= count; index += 1) {
        const angle = (index / segments) * Math.PI * 2;
        const sample = {
          x: point.x + Math.cos(angle) * radius,
          y: point.y + Math.sin(angle) * radius,
        };
        const height = discoveredReliefSurfaceHeightAt(
          view.terrain,
          sample,
          cache.mesh.verticalScale,
          true,
        ) + 3;
        p.vertex(sample.x, -height, sample.y);
      }
      p.endShape();
    };

    const drawFieldResourceNode = (
      node: FieldResourceNodeView,
      surface: number,
      size: number,
    ): void => {
      const presentation = FIELD_RESOURCE_PRESENTATION[node.material];
      const orientation = reliefStringHash(node.id) / 4_294_967_295 * Math.PI * 2;
      const color = presentation.reliefColor;
      const foam = RELIEF_PALETTE.foam;

      p.push();
      p.translate(node.position.x, -surface, node.position.y);
      p.rotateY(orientation);
      p.noStroke();
      switch (presentation.motif) {
        case "kelp-bladders":
          for (let index = -1; index <= 1; index += 1) {
            const height = size * (0.72 + (index === 0 ? 0.28 : Math.abs(index) * 0.08));
            p.push();
            p.translate(index * size * 0.3, -height / 2, index * size * 0.08);
            p.ambientMaterial(color);
            p.box(size * 0.075, height, size * 0.075);
            p.translate(0, -height / 2 - size * 0.11, 0);
            p.ambientMaterial(index === 0 && node.knowledge === "sounded" ? foam : color);
            p.sphere(size * 0.18, 6, 4);
            p.pop();
          }
          break;
        case "crossed-driftwood":
          for (const angle of [-0.58, 0.58]) {
            p.push();
            p.translate(0, -size * 0.12, angle * size * 0.08);
            p.rotateY(angle);
            p.rotateZ(angle * 0.08);
            p.ambientMaterial(color);
            p.box(size * 1.35, size * 0.2, size * 0.18);
            p.pop();
          }
          break;
        case "glimmer-cap":
          p.push();
          p.translate(0, -size * 0.42, 0);
          p.ambientMaterial(foam);
          p.box(size * 0.13, size * 0.78, size * 0.13);
          p.translate(0, -size * 0.42, 0);
          p.scale(1, 0.38, 1);
          if (node.knowledge === "sounded") p.emissiveMaterial(color);
          else p.ambientMaterial(color);
          p.sphere(size * 0.56, 7, 4);
          p.pop();
          break;
        case "shell-spiral":
          p.push();
          p.translate(0, -size * 0.34, 0);
          p.rotateX(p.HALF_PI);
          p.ambientMaterial(color);
          p.torus(size * 0.35, size * 0.12, 7, 4);
          p.ambientMaterial(foam);
          p.sphere(size * 0.14, 5, 3);
          p.pop();
          break;
        case "sunburst-fiber":
          p.push();
          p.translate(0, -size * 0.52, 0);
          p.ambientMaterial(color);
          p.box(size * 0.11, size * 1.04, size * 0.11);
          p.translate(0, -size * 0.48, 0);
          p.emissiveMaterial(node.knowledge === "sounded" ? color : foam);
          p.sphere(size * 0.17, 6, 4);
          for (let ray = 0; ray < 6; ray += 1) {
            p.push();
            p.rotateY(ray * Math.PI / 3);
            p.translate(size * 0.34, 0, 0);
            p.ambientMaterial(color);
            p.box(size * 0.48, size * 0.075, size * 0.075);
            p.pop();
          }
          p.pop();
          break;
        case "hooked-stone":
          p.push();
          p.translate(-size * 0.16, -size * 0.48, 0);
          p.ambientMaterial(color);
          p.box(size * 0.28, size * 0.92, size * 0.34);
          p.translate(size * 0.28, -size * 0.34, 0);
          p.rotateZ(p.HALF_PI);
          p.box(size * 0.28, size * 0.72, size * 0.34);
          p.translate(0, -size * 0.38, 0);
          p.ambientMaterial(foam);
          p.cone(size * 0.17, size * 0.34, 5, 1);
          p.pop();
          break;
        case "bound-reeds":
          for (let index = -2; index <= 2; index += 1) {
            const height = size * (0.68 + (2 - Math.abs(index)) * 0.14);
            p.push();
            p.translate(index * size * 0.18, -height / 2, Math.abs(index) * size * 0.04);
            p.rotateZ(index * 0.055);
            p.ambientMaterial(color);
            p.box(size * 0.105, height, size * 0.105);
            p.pop();
          }
          p.push();
          p.translate(0, -size * 0.34, 0);
          p.ambientMaterial(foam);
          p.box(size * 0.92, size * 0.1, size * 0.16);
          p.pop();
          break;
        case "moss-cushion":
          for (const [x, z, scale] of [
            [-0.32, 0.04, 0.66],
            [0.05, -0.08, 0.88],
            [0.38, 0.08, 0.54],
          ] as const) {
            p.push();
            p.translate(x * size, -size * 0.16 * scale, z * size);
            p.scale(1, 0.38, 0.82);
            p.ambientMaterial(color);
            p.sphere(size * scale * 0.48, 6, 3);
            p.pop();
          }
          break;
        case "forked-lichen": {
          const branch = (x: number, y: number, angle: number, length: number): void => {
            p.push();
            p.translate(x * size, y * size, 0);
            p.rotateZ(angle);
            p.ambientMaterial(color);
            p.box(size * 0.1, size * length, size * 0.1);
            p.pop();
          };
          branch(0, -0.43, 0, 0.86);
          branch(-0.18, -0.58, -0.72, 0.58);
          branch(0.2, -0.48, 0.68, 0.64);
          branch(-0.38, -0.78, -0.35, 0.38);
          p.push();
          p.translate(0, -size * 0.88, 0);
          if (node.knowledge === "sounded") p.emissiveMaterial(color);
          else p.ambientMaterial(foam);
          p.sphere(size * 0.12, 5, 3);
          p.pop();
          break;
        }
      }
      p.pop();
    };

    const drawFieldResources = (
      view: TideweftView,
      cache: CachedReliefMesh,
    ): void => {
      const reachSquared = (orbit.distance * 1.18) ** 2;
      const visible = view.fieldResources
        .filter((node) => !view.perception || node.currentVisibility === 1)
        .map((node) => ({
          node,
          distance: distanceSquared(node.position, { x: orbit.x, y: orbit.y }),
        }))
        .filter((candidate) => candidate.distance <= reachSquared)
        .sort((left, right) => left.distance - right.distance
          || (left.node.id < right.node.id ? -1 : left.node.id > right.node.id ? 1 : 0))
        .slice(0, 220);
      const hoveredId = pointerWorld
        ? hitTestFieldResource(
            view.fieldResources.filter((node) => !view.perception || node.currentVisibility === 1),
            pointerWorld,
            Math.max(view.terrain.tileSize * 0.58, unitsPerPixel() * 22),
          )?.node.id
        : undefined;
      const size = view.terrain.tileSize * 0.42;

      for (const { node } of visible) {
        const surface = discoveredReliefSurfaceHeightAt(
          view.terrain,
          node.position,
          cache.mesh.verticalScale,
          true,
        );
        if (node.knowledge === "sounded" || node.id === hoveredId) {
          drawGroundRing(
            view,
            cache,
            node.position,
            view.terrain.tileSize * (node.id === hoveredId ? 0.58 : 0.43),
            FIELD_RESOURCE_PRESENTATION[node.material].reliefColor,
            node.id === hoveredId ? 220 : 105,
          );
          if (node.knowledge === "sounded") {
            const markCount = node.rarity === "rare" ? 3 : node.rarity === "secondary" ? 2 : 1;
            for (let mark = 0; mark < markCount; mark += 1) {
              const angle = -0.35 + mark * 0.35 - (markCount - 1) * 0.175;
              p.push();
              p.noStroke();
              p.translate(
                node.position.x + Math.cos(angle) * size * 0.58,
                -surface - size * 0.08,
                node.position.y + Math.sin(angle) * size * 0.58,
              );
              p.ambientMaterial(RELIEF_PALETTE.foam);
              p.sphere(size * 0.055, 4, 2);
              p.pop();
            }
          }
        } else {
          // Keep an understated material-colored halo around every discovered
          // find so low-poly silhouettes stay distinct from lit terrain.
          drawGroundRing(
            view,
            cache,
            node.position,
            view.terrain.tileSize * 0.29,
            FIELD_RESOURCE_PRESENTATION[node.material].reliefColor,
            96,
          );
        }
        drawFieldResourceNode(node, surface, size);
      }
    };

    const drawLooseCargo = (
      view: TideweftView,
      cache: CachedReliefMesh,
      now: number,
    ): void => {
      const parcels = safeLooseCargoViews(view.looseCargo ?? []).filter((parcel) =>
        !view.perception || isDirectlyDetailPerceived(view.terrain, parcel.position, true)
      );
      if (parcels.length === 0) return;
      const nearby = nearestRecoverableLooseCargo(
        parcels,
        view.player.position,
        Math.max(1, view.terrain.tileSize * 0.9),
      );
      const size = Math.max(3, view.terrain.tileSize * 0.34);

      for (const parcel of parcels) {
        const visual = looseCargoVisual(parcel);
        const surface = discoveredReliefSurfaceHeightAt(
          view.terrain,
          parcel.position,
          cache.mesh.verticalScale,
          true,
        );
        const highlighted = hoverParcelId === parcel.id || nearby?.id === parcel.id;

        if (visual.motionMark === "wake") {
          const nx = -visual.wake.x;
          const nz = -visual.wake.y;
          const px = -nz;
          const pz = nx;
          p.noFill();
          p.stroke(withAlpha(RELIEF_PALETTE.water, 185));
          p.strokeWeight(1.3);
          for (const side of [-1, 1]) {
            p.line(
              parcel.position.x + nx * size * 0.3 + px * side * size * 0.28,
              -surface - 2,
              parcel.position.y + nz * size * 0.3 + pz * side * size * 0.28,
              parcel.position.x + nx * size * 2.35 + px * side * size * 0.62,
              -surface - 2,
              parcel.position.y + nz * size * 2.35 + pz * side * size * 0.62,
            );
          }
        }

        if (visual.snagMark !== "none") {
          const angle = visual.orientationRadians + (visual.snagMark === "roots" ? 0.9 : -0.7);
          const anchor = {
            x: parcel.position.x + Math.cos(angle) * size * 1.9,
            y: parcel.position.y + Math.sin(angle) * size * 1.9,
          };
          p.stroke(visual.snagMark === "roots" ? RELIEF_PALETTE.marsh : RELIEF_PALETTE.coral);
          p.strokeWeight(1.6);
          p.line(
            parcel.position.x,
            -surface - size * 0.18,
            parcel.position.y,
            anchor.x,
            -surface - size * 0.08,
            anchor.y,
          );
          if (visual.snagMark === "roots") {
            p.line(anchor.x, -surface, anchor.y, anchor.x - size * 0.45, -surface, anchor.y + size * 0.38);
            p.line(anchor.x, -surface, anchor.y, anchor.x + size * 0.4, -surface, anchor.y + size * 0.35);
          } else {
            p.push();
            p.noStroke();
            p.translate(anchor.x, -surface - size * 0.16, anchor.y);
            p.ambientMaterial(RELIEF_PALETTE.coral);
            p.cone(size * 0.16, size * 0.5, 4, 1);
            p.pop();
          }
        }

        if (highlighted || parcel.recovery === "reachable") {
          drawGroundRing(
            view,
            cache,
            parcel.position,
            view.terrain.tileSize * (highlighted ? 0.5 : 0.4),
            parcel.recovery === "reachable" ? RELIEF_PALETTE.foam : visual.accent,
            highlighted ? 225 : 115,
          );
        }

        p.push();
        p.noStroke();
        p.translate(parcel.position.x, -surface - size * 0.27, parcel.position.y);
        p.rotateY(visual.orientationRadians);
        if (visual.motionMark === "tumble") {
          const tumble = reducedMotion ? visual.orientationRadians * 0.16 : now * 0.0035;
          p.rotateX(tumble);
          p.rotateZ(tumble * 0.72);
        }
        p.ambientMaterial(visual.fill);
        switch (visual.silhouette) {
          case "bundle":
            p.scale(1, 0.72, 0.88);
            p.sphere(size * 0.55, 6, 4);
            break;
          case "crate":
            p.box(size * 1.05, size * 0.82, size * 0.92);
            break;
          case "case":
            p.box(size * 1.18, size * 0.62, size * 0.82, 2, 1);
            p.push();
            p.translate(0, -size * 0.42, 0);
            p.ambientMaterial(visual.outline);
            p.torus(size * 0.23, size * 0.055, 6, 3);
            p.pop();
            break;
          case "sealed-case":
            p.box(size * 1.2, size * 0.72, size * 0.9);
            p.push();
            p.translate(0, 0, size * 0.49);
            p.emissiveMaterial(RELIEF_PALETTE.violet);
            p.sphere(size * 0.17, 6, 4);
            p.pop();
            break;
        }

        // Durable non-color condition marks remain visible in monochrome and
        // under color-vision filters.
        p.stroke(RELIEF_PALETTE.ink);
        p.strokeWeight(1.8);
        switch (visual.conditionMark) {
          case "none": break;
          case "slash":
            p.line(-size * 0.42, -size * 0.28, size * 0.48, size * 0.3);
            break;
          case "crack":
            p.line(-size * 0.42, -size * 0.2, -size * 0.1, size * 0.02);
            p.line(-size * 0.1, size * 0.02, size * 0.02, -size * 0.16);
            p.line(size * 0.02, -size * 0.16, size * 0.46, size * 0.28);
            break;
          case "cross":
            p.line(-size * 0.42, -size * 0.3, size * 0.42, size * 0.3);
            p.line(-size * 0.42, size * 0.3, size * 0.42, -size * 0.3);
            break;
        }

        if (visual.wetMark) {
          p.noStroke();
          p.push();
          p.translate(size * 0.46, -size * 0.38, size * 0.25);
          p.emissiveMaterial(RELIEF_PALETTE.water);
          p.sphere(size * 0.12, 5, 3);
          p.pop();
        }
        for (let mark = 0; mark < visual.contaminationMarks; mark += 1) {
          p.push();
          p.noStroke();
          p.translate(
            (mark - (visual.contaminationMarks - 1) / 2) * size * 0.28,
            size * 0.37,
            size * 0.46,
          );
          p.emissiveMaterial(RELIEF_PALETTE.violet);
          p.sphere(size * 0.075, 4, 2);
          p.pop();
        }
        p.pop();

        if (parcel.impactMark !== "none") {
          p.noFill();
          p.stroke(RELIEF_PALETTE.coral);
          p.strokeWeight(1.25);
          for (let ray = 0; ray < 4; ray += 1) {
            const angle = visual.orientationRadians + ray * Math.PI / 2;
            p.line(
              parcel.position.x + Math.cos(angle) * size * 0.7,
              -surface - size * 0.3,
              parcel.position.y + Math.sin(angle) * size * 0.7,
              parcel.position.x + Math.cos(angle) * size * 1.05,
              -surface - size * 0.48,
              parcel.position.y + Math.sin(angle) * size * 1.05,
            );
          }
        }
      }
    };

    const wayknotColor = (kind: WayknotKind): string => {
      switch (kind) {
        case "reed-mat": return RELIEF_PALETTE.amber;
        case "tide-anchor": return RELIEF_PALETTE.water;
        case "wind-knot": return RELIEF_PALETTE.violet;
      }
    };

    const drawWaychords = (view: TideweftView, cache: CachedReliefMesh): void => {
      const tileSize = view.terrain.tileSize;
      const halfWidth = Math.max(1.4, tileSize * 0.075);
      for (const chord of buildWaychords(view.wayknots)) {
        const segmentCount = clampInteger(
          Math.ceil(chord.length / Math.max(8, tileSize * 0.5)),
          2,
          32,
        );
        const drawRail = (offset: number, color: p5.Color, weight: number): void => {
          p.noFill();
          p.stroke(color);
          p.strokeWeight(weight);
          p.beginShape();
          for (let index = 0; index <= segmentCount; index += 1) {
            const amount = index / segmentCount;
            const point = {
              x: chord.from.x + (chord.to.x - chord.from.x) * amount + chord.normal.x * offset,
              y: chord.from.y + (chord.to.y - chord.from.y) * amount + chord.normal.y * offset,
            };
            const height = discoveredReliefSurfaceHeightAt(
              view.terrain,
              point,
              cache.mesh.verticalScale,
              true,
            ) + 3.2;
            p.vertex(point.x, -height, point.y);
          }
          p.endShape();
        };

        drawRail(halfWidth, withAlpha(RELIEF_PALETTE.ink, 225), 4.8);
        drawRail(-halfWidth, withAlpha(RELIEF_PALETTE.ink, 225), 4.8);
        drawRail(halfWidth, withAlpha(RELIEF_PALETTE.foam, 195), 1.25);
        drawRail(-halfWidth, withAlpha(RELIEF_PALETTE.foam, 195), 1.25);

        p.stroke(withAlpha(RELIEF_PALETTE.coral, 220));
        p.strokeWeight(1.5);
        const bindings = buildWaychordBindings(
          chord,
          Math.max(10, tileSize * 0.72),
          halfWidth,
          18,
        );
        for (const binding of bindings) {
          const leftHeight = discoveredReliefSurfaceHeightAt(
            view.terrain,
            binding.left,
            cache.mesh.verticalScale,
            true,
          ) + 3.4;
          const rightHeight = discoveredReliefSurfaceHeightAt(
            view.terrain,
            binding.right,
            cache.mesh.verticalScale,
            true,
          ) + 3.4;
          p.line(
            binding.left.x,
            -leftHeight,
            binding.left.y,
            binding.right.x,
            -rightHeight,
            binding.right.y,
          );
        }

        const midpointHeight = discoveredReliefSurfaceHeightAt(
          view.terrain,
          chord.midpoint,
          cache.mesh.verticalScale,
          true,
        );
        p.push();
        p.noStroke();
        p.translate(chord.midpoint.x, -midpointHeight - 4, chord.midpoint.y);
        p.rotateY(Math.atan2(chord.to.y - chord.from.y, chord.to.x - chord.from.x) + Math.PI / 4);
        p.ambientMaterial(RELIEF_PALETTE.foam);
        p.box(tileSize * 0.18, tileSize * 0.1, tileSize * 0.18);
        p.pop();
      }
    };

    const drawReedMat = (
      wayknot: WayknotView,
      surface: number,
      size: number,
      orientation: number,
    ): void => {
      p.push();
      p.translate(wayknot.position.x, -surface - size * 0.035, wayknot.position.y);
      p.rotateY(orientation);
      p.noStroke();
      for (let slat = -2; slat <= 2; slat += 1) {
        p.push();
        p.translate(0, slat % 2 === 0 ? -size * 0.018 : 0, slat * size * 0.145);
        if (wayknot.active) p.emissiveMaterial(RELIEF_PALETTE.amber);
        else p.ambientMaterial(RELIEF_PALETTE.amber);
        p.box(size * 0.92, size * 0.07, size * 0.105);
        p.pop();
      }
      for (const cross of [-0.27, 0, 0.27]) {
        p.push();
        p.translate(cross * size, -size * 0.045, 0);
        p.ambientMaterial(RELIEF_PALETTE.foam);
        p.box(size * 0.075, size * 0.055, size * 0.72);
        p.pop();
      }
      p.pop();
    };

    const drawTideAnchor = (
      view: TideweftView,
      cache: CachedReliefMesh,
      wayknot: WayknotView,
      surface: number,
      size: number,
      orientation: number,
    ): void => {
      const ground = discoveredReliefSurfaceHeightAt(
        view.terrain,
        wayknot.position,
        cache.mesh.verticalScale,
        false,
      );
      const ropeTop = surface + size * 0.03;
      const ropeBottom = ground + size * 0.08;
      p.stroke(withAlpha(RELIEF_PALETTE.foam, wayknot.active ? 220 : 120));
      p.strokeWeight(1.45);
      p.line(
        wayknot.position.x,
        -ropeTop,
        wayknot.position.y,
        wayknot.position.x,
        -ropeBottom,
        wayknot.position.y,
      );

      p.push();
      p.noStroke();
      p.translate(wayknot.position.x, -surface - size * 0.14, wayknot.position.y);
      p.rotateY(orientation);
      if (wayknot.active) p.emissiveMaterial(RELIEF_PALETTE.water);
      else p.ambientMaterial(RELIEF_PALETTE.shallows);
      p.sphere(size * 0.2, 7, 4);
      p.ambientMaterial(RELIEF_PALETTE.foam);
      p.box(size * 0.48, size * 0.075, size * 0.11);
      p.pop();

      p.push();
      p.noStroke();
      p.translate(wayknot.position.x, -ground - size * 0.22, wayknot.position.y);
      p.rotateY(orientation);
      p.ambientMaterial(wayknot.active ? RELIEF_PALETTE.foam : RELIEF_PALETTE.built);
      p.box(size * 0.08, size * 0.42, size * 0.08);
      p.push();
      p.translate(0, -size * 0.1, 0);
      p.box(size * 0.45, size * 0.065, size * 0.08);
      p.pop();
      for (const direction of [-1, 1]) {
        p.push();
        p.translate(direction * size * 0.18, size * 0.15, 0);
        p.rotateZ(direction * -0.66);
        p.box(size * 0.3, size * 0.07, size * 0.09);
        p.pop();
      }
      p.pop();
    };

    const drawWindKnot = (
      wayknot: WayknotView,
      surface: number,
      size: number,
      orientation: number,
      now: number,
    ): void => {
      const mastHeight = size * 1.18;
      p.push();
      p.noStroke();
      p.translate(
        wayknot.position.x,
        -surface - mastHeight / 2,
        wayknot.position.y,
      );
      p.rotateY(orientation);
      p.ambientMaterial(wayknot.active ? RELIEF_PALETTE.foam : RELIEF_PALETTE.built);
      p.box(size * 0.075, mastHeight, size * 0.075);
      p.pop();

      const flutter = reducedMotion
        ? 0
        : Math.sin(now * 0.004 + orientation * 3) * size * 0.12;
      p.push();
      p.translate(
        wayknot.position.x,
        -surface - mastHeight * 0.93,
        wayknot.position.y,
      );
      p.rotateY(orientation);
      p.noStroke();
      if (wayknot.active) p.emissiveMaterial(RELIEF_PALETTE.violet);
      else p.ambientMaterial(RELIEF_PALETTE.violet);
      p.beginShape(p.TRIANGLES);
      p.vertex(0, 0, 0);
      p.vertex(size * 0.72, size * 0.18, flutter);
      p.vertex(size * 0.34, size * 0.42, -flutter * 0.35);
      p.vertex(0, 0, 0);
      p.vertex(size * 0.34, size * 0.42, -flutter * 0.35);
      p.vertex(0, size * 0.3, 0);
      p.endShape();
      if (wayknot.active) p.emissiveMaterial(RELIEF_PALETTE.coral);
      else p.ambientMaterial(RELIEF_PALETTE.coral);
      p.beginShape(p.TRIANGLES);
      p.vertex(size * 0.34, size * 0.42, -flutter * 0.35);
      p.vertex(size * 0.67, size * 0.66, flutter);
      p.vertex(size * 0.24, size * 0.54, 0);
      p.endShape();
      p.pop();
    };

    const drawTideHarps = (
      view: TideweftView,
      cache: CachedReliefMesh,
      now: number,
    ): void => {
      const size = view.terrain.tileSize;
      const geometry = tideHarpGeometryFor(view.tideHarps, size * 0.1);
      for (const harp of geometry) {
        const centerSurface = discoveredReliefSurfaceHeightAt(
          view.terrain,
          harp.center,
          cache.mesh.verticalScale,
          true,
        );
        const rootSurfaces = harp.spokes.map((spoke) => ({
          id: spoke.knotId,
          kind: spoke.kind,
          surface: discoveredReliefSurfaceHeightAt(
            view.terrain,
            spoke.from,
            cache.mesh.verticalScale,
            true,
          ),
        }));
        const bellBase = tideHarpBellBaseHeight(
          centerSurface,
          rootSurfaces,
          size,
          harp.active,
        );
        const bellHeight = bellBase + tideHarpBellBob(
          harp.id,
          now,
          size,
          harp.active,
          reducedMotion,
        );

        for (const spoke of harp.spokes) {
          const root = rootSurfaces.find((candidate) => candidate.id === spoke.knotId);
          if (!root) continue;
          const rootHeight = root.surface + tideHarpRootLift(root.kind, size);
          p.stroke(withAlpha(RELIEF_PALETTE.ink, 230));
          p.strokeWeight(harp.active ? 4.2 : 3.4);
          p.line(
            spoke.from.x,
            -rootHeight,
            spoke.from.y,
            harp.center.x,
            -bellHeight,
            harp.center.y,
          );
          p.stroke(withAlpha(RELIEF_PALETTE.foam, harp.active ? 232 : 148));
          p.strokeWeight(harp.active ? 1.5 : 1.05);
          p.line(
            spoke.from.x,
            -rootHeight,
            spoke.from.y,
            harp.center.x,
            -bellHeight,
            harp.center.y,
          );
          if (harp.active) {
            const amount = 0.56;
            p.push();
            p.noStroke();
            p.translate(
              spoke.from.x + (harp.center.x - spoke.from.x) * amount,
              -(rootHeight + (bellHeight - rootHeight) * amount),
              spoke.from.y + (harp.center.y - spoke.from.y) * amount,
            );
            p.ambientMaterial(RELIEF_PALETTE.foam);
            p.box(size * 0.095);
            p.pop();
          }
        }

        const phase = reliefStringHash(harp.id) / 4_294_967_295 * Math.PI * 2;
        const sway = reducedMotion ? 0 : Math.sin(now * 0.0017 + phase) * 0.09;
        const bellScale = harp.active ? 1.2 : 1;
        p.push();
        p.translate(harp.center.x, -bellHeight, harp.center.y);
        p.rotateY(phase);
        p.rotateZ(sway);
        p.noStroke();
        if (harp.active) p.emissiveMaterial(RELIEF_PALETTE.violet);
        else p.ambientMaterial(RELIEF_PALETTE.violet);
        p.cone(size * 0.34 * bellScale, size * 0.52 * bellScale, 6, 1);
        p.push();
        p.translate(0, size * 0.31 * bellScale, 0);
        p.ambientMaterial(RELIEF_PALETTE.foam);
        p.sphere(size * 0.115 * bellScale, 6, 4);
        p.pop();
        // A blocky note stem and head make the suspended object read as an
        // instrument from oblique camera angles rather than as another buoy.
        p.push();
        p.translate(size * 0.34 * bellScale, -size * 0.04 * bellScale, 0);
        p.ambientMaterial(RELIEF_PALETTE.foam);
        p.box(size * 0.07 * bellScale, size * 0.54 * bellScale, size * 0.07 * bellScale);
        p.translate(-size * 0.11 * bellScale, size * 0.28 * bellScale, 0);
        p.sphere(size * 0.145 * bellScale, 6, 4);
        p.pop();
        if (harp.active) {
          // The six-pronged crown and three cord beads are fixed structural
          // activity cues, so monochrome and reduced-motion play remain clear.
          const crownRadius = size * 0.52;
          const crownY = -size * 0.48;
          p.noFill();
          p.stroke(withAlpha(RELIEF_PALETTE.foam, 235));
          p.strokeWeight(1.4);
          for (let mark = 0; mark < 6; mark += 1) {
            const angle = mark * Math.PI * 2 / 6;
            const next = (mark + 1) * Math.PI * 2 / 6;
            const x = Math.cos(angle) * crownRadius;
            const z = Math.sin(angle) * crownRadius;
            p.line(
              x,
              crownY,
              z,
              Math.cos(next) * crownRadius,
              crownY,
              Math.sin(next) * crownRadius,
            );
            p.line(x, crownY, z, x * 0.48, -size * 0.16, z * 0.48);
          }
        }
        p.pop();
      }
    };

    const drawWayknots = (
      view: TideweftView,
      cache: CachedReliefMesh,
      now: number,
    ): void => {
      drawWaychords(view, cache);
      const size = view.terrain.tileSize;
      for (const wayknot of view.wayknots) {
        const surface = discoveredReliefSurfaceHeightAt(
          view.terrain,
          wayknot.position,
          cache.mesh.verticalScale,
          true,
        );
        if (wayknot.active && wayknot.influenceRadius > 0) {
          drawGroundRing(
            view,
            cache,
            wayknot.position,
            wayknot.influenceRadius,
            wayknotColor(wayknot.kind),
            72,
          );
        }
        const orientation = reliefStringHash(wayknot.id) / 4_294_967_295 * Math.PI * 2;
        switch (wayknot.kind) {
          case "reed-mat":
            drawReedMat(wayknot, surface, size, orientation);
            break;
          case "tide-anchor":
            drawTideAnchor(view, cache, wayknot, surface, size, orientation);
            break;
          case "wind-knot":
            drawWindKnot(wayknot, surface, size, orientation, now);
            break;
        }
      }
    };

    const settlementColor = (status: SettlementStatus): string => {
      switch (status) {
        case "strained":
        case "evacuating":
          return RELIEF_PALETTE.danger;
        case "watchful":
          return RELIEF_PALETTE.amber;
        case "recovering":
          return RELIEF_PALETTE.violet;
        case "steady":
          return RELIEF_PALETTE.tide;
      }
    };

    const drawSettlement = (
      view: TideweftView,
      cache: CachedReliefMesh,
      settlement: SettlementView,
    ): void => {
      if (settlement.discovered === false) return;
      const currentVisibility = currentSettlementVisibility(
        settlement,
        view.perception !== undefined,
      );
      const tileSize = view.terrain.tileSize;
      const surface = discoveredReliefSurfaceHeightAt(
        view.terrain,
        settlement.position,
        cache.mesh.verticalScale,
        true,
      );
      const directlyVisible = currentVisibility >= 1;
      // Remote Relief structures are geographic memory only. Keep their
      // silhouette fixed so live population changes cannot be read through
      // fog simply by comparing tower height.
      const towerHeight = directlyVisible
        ? tileSize * clamp(0.52 + Math.log2(Math.max(1, settlement.population)) * 0.055, 0.56, 1.18)
        : tileSize * 0.64;
      const color = directlyVisible ? settlementColor(settlement.status) : RELIEF_PALETTE.ink;
      if (directlyVisible) {
        drawGroundRing(
          view,
          cache,
          settlement.position,
          tileSize * (settlement.selected ? 0.72 : 0.56),
          color,
          settlement.selected ? 235 : 155,
        );
      }
      p.push();
      p.noStroke();
      p.translate(settlement.position.x, -surface - towerHeight / 2 - 1, settlement.position.y);
      p.ambientMaterial(directlyVisible ? RELIEF_PALETTE.built : RELIEF_PALETTE.ink);
      p.box(tileSize * 0.48, towerHeight, tileSize * 0.48);
      p.translate(0, -towerHeight * 0.58, 0);
      if (directlyVisible) p.emissiveMaterial(color);
      else p.ambientMaterial(RELIEF_PALETTE.ink);
      p.cone(tileSize * 0.38, tileSize * 0.42, 5, 1);
      p.pop();
    };

    const porterColor = (porter: PorterView): string => {
      if (porter.state === "stranded") return RELIEF_PALETTE.danger;
      if (porter.state === "helping") return RELIEF_PALETTE.tide;
      if (porter.state === "waiting") return RELIEF_PALETTE.amber;
      return porter.cargoColor ?? RELIEF_PALETTE.foam;
    };

    const drawPorters = (view: TideweftView, cache: CachedReliefMesh): void => {
      const size = view.terrain.tileSize;
      for (const porter of view.porters) {
        if (
          view.perception
          && !isDirectlyDetailPerceived(view.terrain, porter.position, true)
        ) continue;
        const surface = discoveredReliefSurfaceHeightAt(
          view.terrain,
          porter.position,
          cache.mesh.verticalScale,
          true,
        );
        p.push();
        p.noStroke();
        p.translate(porter.position.x, -surface - size * 0.23, porter.position.y);
        p.emissiveMaterial(porterColor(porter));
        p.sphere(size * (porter.selected ? 0.18 : 0.13), 7, 5);
        p.ambientMaterial(porter.cargoColor ?? RELIEF_PALETTE.amber);
        p.translate(-Math.cos(porter.facing) * size * 0.18, size * 0.05, -Math.sin(porter.facing) * size * 0.18);
        p.box(size * 0.16);
        p.pop();
      }
    };

    const drawDestination = (view: TideweftView, cache: CachedReliefMesh): void => {
      const destination = view.player.destination;
      if (!destination) return;
      const pulse = reducedMotion ? 1 : 1 + Math.sin(performance.now() * 0.005) * 0.12;
      drawGroundRing(
        view,
        cache,
        destination,
        view.terrain.tileSize * 0.6 * pulse,
        RELIEF_PALETTE.amber,
        230,
      );
    };

    const drawReliefBalanceMark = (
      presentation: PlayerBalancePresentation,
      size: number,
    ): void => {
      p.push();
      p.noFill();
      p.stroke(presentation.outline);
      p.strokeWeight(1.7);
      switch (presentation.mark) {
        case "keel":
          p.line(-size * 0.25, 0, 0, size * 0.28, 0, 0);
          p.line(size * 0.12, -size * 0.08, 0, size * 0.28, 0, 0);
          p.line(size * 0.12, size * 0.08, 0, size * 0.28, 0, 0);
          break;
        case "counterweight":
          p.line(-size * 0.12, 0, -size * 0.31, -size * 0.12, 0, size * 0.31);
          p.line(-size * 0.18, -size * 0.06, -size * 0.31, -size * 0.06, size * 0.06, -size * 0.31);
          p.line(-size * 0.18, -size * 0.06, size * 0.31, -size * 0.06, size * 0.06, size * 0.31);
          break;
        case "skid":
          p.line(-size * 0.62, size * 0.16, -size * 0.18, -size * 0.18, size * 0.08, -size * 0.18);
          p.line(-size * 0.58, size * 0.16, size * 0.18, -size * 0.14, size * 0.08, size * 0.18);
          break;
        case "impact":
          p.line(-size * 0.55, size * 0.12, 0, -size * 0.3, 0, 0);
          p.line(size * 0.3, 0, 0, size * 0.55, size * 0.12, 0);
          p.line(0, size * 0.12, -size * 0.55, 0, 0, -size * 0.3);
          p.line(0, 0, size * 0.3, 0, size * 0.12, size * 0.55);
          break;
        case "eddy":
          p.line(-size * 0.4, size * 0.08, -size * 0.2, size * 0.3, 0, -size * 0.38);
          p.line(size * 0.3, 0, -size * 0.38, size * 0.42, size * 0.08, size * 0.08);
          p.line(size * 0.42, size * 0.08, size * 0.08, size * 0.08, 0, size * 0.4);
          p.line(size * 0.08, 0, size * 0.4, -size * 0.32, size * 0.08, size * 0.26);
          break;
        case "rise":
          p.line(-size * 0.22, size * 0.06, 0, 0, -size * 0.2, 0);
          p.line(0, -size * 0.2, 0, size * 0.22, size * 0.06, 0);
          p.line(0, -size * 0.2, 0, 0, -size * 0.52, 0);
          break;
      }
      p.pop();
    };

    const reliefSilhouetteScale = (
      presentation: PlayerBalancePresentation,
    ): readonly [number, number, number] => {
      switch (presentation.silhouette) {
        case "upright": return [0.8, 1.1, 0.8];
        case "leaning": return [1.02, 0.9, 0.72];
        case "off-step": return [1.18, 0.7, 0.7];
        case "low": return [1.38, 0.4, 0.86];
        case "afloat": return [1.3, 0.46, 1.04];
        case "rising": return [0.74, 0.96, 0.74];
      }
    };

    const drawPlayer = (view: TideweftView, cache: CachedReliefMesh): void => {
      const player = view.player;
      const presentation = playerBalancePresentation(player.balanceState);
      const size = view.terrain.tileSize;
      const surface = discoveredReliefSurfaceHeightAt(
        view.terrain,
        player.position,
        cache.mesh.verticalScale,
        true,
      );
      const playerColor = presentation.fill;
      drawDestination(view, cache);
      drawGroundRing(
        view,
        cache,
        player.position,
        size * (player.mode === "swept" ? 0.58 : 0.42),
        playerColor,
        225,
        unit(player.stamina),
      );
      if (player.bracing === true && player.mode !== "swept") {
        // Full amber footing ring confirms Shift/BRACE independently of the
        // stamina arc and balance-state body color.
        drawGroundRing(
          view,
          cache,
          player.position,
          size * 0.54,
          RELIEF_PALETTE.amber,
          248,
          1,
        );
      }
      const facing = {
        x: player.position.x + Math.cos(player.facing) * size * 0.7,
        y: player.position.y + Math.sin(player.facing) * size * 0.7,
      };
      const facingSurface = discoveredReliefSurfaceHeightAt(
        view.terrain,
        facing,
        cache.mesh.verticalScale,
        true,
      );
      p.stroke(withAlpha(RELIEF_PALETTE.foam, 225));
      p.strokeWeight(2.2);
      p.line(
        player.position.x, -surface - size * 0.28, player.position.y,
        facing.x, -facingSurface - size * 0.18, facing.y,
      );
      p.push();
      p.noStroke();
      const bodyLift = size * (0.08 + presentation.heightScale * 0.26);
      p.translate(player.position.x, -surface - bodyLift, player.position.y);
      p.rotateY(-player.facing);
      p.rotateZ(presentation.leanRadians);
      p.emissiveMaterial(playerColor);
      const silhouetteScale = reliefSilhouetteScale(presentation);
      p.scale(...silhouetteScale);
      if (player.mode === "skiff") {
        p.scale(1.45, 0.55, 0.8);
      }
      p.sphere(size * 0.26, 10, 7);
      p.pop();

      p.push();
      p.translate(player.position.x, -surface - bodyLift, player.position.y);
      p.rotateY(-player.facing);
      p.rotateZ(presentation.leanRadians);
      drawReliefBalanceMark(presentation, size);
      p.pop();

      const shownCargo = Math.min(5, player.cargo.length);
      for (let index = 0; index < shownCargo; index += 1) {
        const cargo = player.cargo[index];
        if (!cargo) continue;
        const side = (index - (shownCargo - 1) / 2) * size * 0.18;
        const behindX = player.position.x - Math.cos(player.facing) * size * 0.38
          + Math.cos(player.facing + Math.PI / 2) * side;
        const behindY = player.position.y - Math.sin(player.facing) * size * 0.38
          + Math.sin(player.facing + Math.PI / 2) * side;
        const cargoSurface = discoveredReliefSurfaceHeightAt(
          view.terrain,
          { x: behindX, y: behindY },
          cache.mesh.verticalScale,
          true,
        );
        p.push();
        p.noStroke();
        p.translate(behindX, -cargoSurface - size * 0.14, behindY);
        p.ambientMaterial(cargo.color ?? RELIEF_PALETTE.amber);
        p.box(size * 0.18);
        p.pop();
      }
    };

    const drawSoundings = (view: TideweftView, cache: CachedReliefMesh): void => {
      const grid = view.terrain;
      const tileSize = grid.tileSize;
      const reach = Math.min(orbit.distance, tileSize * 18);
      const startColumn = clampInteger(Math.floor((orbit.x - reach - grid.origin.x) / tileSize), 0, grid.columns - 1);
      const endColumn = clampInteger(Math.ceil((orbit.x + reach - grid.origin.x) / tileSize), 0, grid.columns - 1);
      const startRow = clampInteger(Math.floor((orbit.y - reach - grid.origin.y) / tileSize), 0, grid.rows - 1);
      const endRow = clampInteger(Math.ceil((orbit.y + reach - grid.origin.y) / tileSize), 0, grid.rows - 1);
      let shown = 0;
      p.strokeWeight(1);
      const soundingColor = (band: ReliefDepthBand): string => {
        if (band === "deep") return RELIEF_PALETTE.danger;
        if (band === "mid") return RELIEF_PALETTE.amber;
        return RELIEF_PALETTE.tide;
      };
      for (let row = startRow; row <= endRow && shown < 220; row += 1) {
        for (let column = startColumn; column <= endColumn && shown < 220; column += 1) {
          const tile = grid.tiles[row * grid.columns + column];
          const known = unit(tile?.depthKnown);
          if (
            !tile
            || known <= 0.002
            || currentTerrainDetailVisibility(tile, view.perception !== undefined) < 1
          ) continue;
          const depth = unit(tile.waterDepth);
          if (depth <= 0.035) continue;
          const style = reliefSoundingStyle(depth);
          const point = {
            x: grid.origin.x + (column + 0.5) * tileSize,
            y: grid.origin.y + (row + 0.5) * tileSize,
          };
          const surface = discoveredReliefSurfaceHeightAt(
            grid,
            point,
            cache.mesh.verticalScale,
            true,
          );
          const needle = tileSize * style.needleScale;
          p.stroke(withAlpha(soundingColor(style.band), 95 + known * 150));
          p.line(point.x, -surface - 1, point.y, point.x, -surface - needle, point.y);
          for (let rung = 1; rung <= style.rungCount; rung += 1) {
            const height = 1 + (needle - 2) * (rung / (style.rungCount + 1));
            const halfWidth = tileSize * (0.045 + style.depthRank * 0.0035);
            p.line(
              point.x - halfWidth,
              -surface - height,
              point.y,
              point.x + halfWidth,
              -surface - height,
              point.y,
            );
          }
          shown += 1;
        }
      }
    };

    const drawScanRipples = (view: TideweftView, cache: CachedReliefMesh, now: number): void => {
      if (view.player.scanProgress !== undefined && view.player.scanProgress > 0.001) {
        const progress = unit(view.player.scanProgress);
        drawGroundRing(
          view,
          cache,
          view.player.position,
          view.terrain.tileSize * (1.1 + progress * 6.5),
          RELIEF_PALETTE.tide,
          220 * (1 - progress),
        );
      }
      for (let index = ripples.length - 1; index >= 0; index -= 1) {
        const ripple = ripples[index];
        if (!ripple) continue;
        const progress = (now - ripple.startedAt) / (reducedMotion ? 360 : 1_300);
        if (progress >= 1) {
          ripples.splice(index, 1);
          continue;
        }
        const eased = 1 - Math.pow(1 - progress, 3);
        drawGroundRing(
          view,
          cache,
          ripple.point,
          view.terrain.tileSize * (0.8 + eased * 8),
          RELIEF_PALETTE.foam,
          180 * (1 - eased),
        );
      }
    };

    const drawRain = (weather: WeatherView, now: number): void => {
      const streaks = buildReliefRainFrame(weather, {
        width: p.width,
        height: p.height,
        now,
        reducedMotion,
        yaw: orbit.yaw,
      });
      if (streaks.length === 0) return;

      // A dark key under a pale face keeps rain readable over both foam/water
      // and the ink-dark ridges. This is a final screen-space pass so terrain
      // depth cannot swallow precipitation as it did in the old 3D path.
      const gl = p.drawingContext as WebGLRenderingContext | WebGL2RenderingContext;
      const depthWasEnabled = gl.isEnabled(gl.DEPTH_TEST);
      const depthWriteWasEnabled = typeof gl.getParameter === "function"
        ? Boolean(gl.getParameter(gl.DEPTH_WRITEMASK))
        : true;
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      p.push();
      try {
        p.camera(0, 0, 1, 0, 0, 0, 0, 1, 0);
        // p5's WEBGL camera/projection path already converts its y-up camera
        // space into the canvas' y-down screen space. Reversing bottom/top a
        // second time made both falling rain and wind rise on screen.
        p.ortho(-p.width / 2, p.width / 2, -p.height / 2, p.height / 2, 0, 2);
        p.resetMatrix();
        p.noFill();
        const first = streaks[0]!;
        p.stroke(withAlpha(RELIEF_PALETTE.ink, Math.min(150, first.alpha * 0.7)));
        p.strokeWeight(first.width + 1.7);
        for (const streak of streaks) {
          p.line(
            streak.x - p.width / 2,
            streak.y - p.height / 2,
            0,
            streak.x + streak.dx - p.width / 2,
            streak.y + streak.dy - p.height / 2,
            0,
          );
        }
        p.stroke(withAlpha("#e5fbff", first.alpha));
        p.strokeWeight(first.width);
        for (const streak of streaks) {
          p.line(
            streak.x - p.width / 2,
            streak.y - p.height / 2,
            0,
            streak.x + streak.dx - p.width / 2,
            streak.y + streak.dy - p.height / 2,
            0,
          );
        }
      } finally {
        p.pop();
        gl.depthMask(depthWriteWasEnabled);
        if (depthWasEnabled) gl.enable(gl.DEPTH_TEST);
      }
    };

    const drawWind = (weather: WeatherView, now: number): void => {
      const threads = buildWindThreadFrame(weather, {
        width: p.width,
        height: p.height,
        now,
        reducedMotion,
        yaw: orbit.yaw,
      });
      const first = threads[0];
      if (!first) return;
      const gl = p.drawingContext as WebGLRenderingContext | WebGL2RenderingContext;
      const depthWasEnabled = gl.isEnabled(gl.DEPTH_TEST);
      const depthWriteWasEnabled = typeof gl.getParameter === "function"
        ? Boolean(gl.getParameter(gl.DEPTH_WRITEMASK))
        : true;
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      p.push();
      try {
        p.camera(0, 0, 1, 0, 0, 0, 0, 1, 0);
        p.ortho(-p.width / 2, p.width / 2, -p.height / 2, p.height / 2, 0, 2);
        p.resetMatrix();
        p.noFill();
        p.stroke(withAlpha(RELIEF_PALETTE.foam, first.alpha));
        p.strokeWeight(first.width);
        for (const thread of threads) {
          p.bezier(
            thread.start.x - p.width / 2,
            thread.start.y - p.height / 2,
            thread.controlA.x - p.width / 2,
            thread.controlA.y - p.height / 2,
            thread.controlB.x - p.width / 2,
            thread.controlB.y - p.height / 2,
            thread.end.x - p.width / 2,
            thread.end.y - p.height / 2,
          );
        }
      } finally {
        p.pop();
        gl.depthMask(depthWriteWasEnabled);
        if (depthWasEnabled) gl.enable(gl.DEPTH_TEST);
      }
    };

    const drawScene = (view: TideweftView, cache: CachedReliefMesh, now: number): void => {
      const camera = currentCameraState();
      setCamera(camera);
      const storm = view.weather.kind === "squall" ? unit(view.weather.intensity) : 0;
      if (!reducedMotion && storm > 0.02) {
        p.translate(
          Math.sin(now * 0.046) * storm * 2.5,
          Math.cos(now * 0.039) * storm * 1.5,
          0,
        );
      }
      // A warm neutral key and restrained cool fill preserve material identity;
      // the former cyan-heavy rig flattened water, land, and finds together.
      p.ambientLight(94, 91, 82);
      p.directionalLight(224, 207, 174, -0.55, 0.9, -0.35);
      p.directionalLight(66, 105, 126, 0.65, 0.2, 0.7);
      drawTerrain(view, cache, camera);
      drawWater(view, cache);
      drawBiomeDetails(view, cache);
      drawFieldResources(view, cache);
      drawSurfaceCurrents(view, cache, now);
      drawLooseCargo(view, cache, now);
      drawRoutes(view, cache, camera);
      drawSoundings(view, cache);
      drawTideHarps(view, cache, now);
      drawWayknots(view, cache, now);
      for (const settlement of view.settlements) drawSettlement(view, cache, settlement);
      drawPorters(view, cache);
      drawPlayer(view, cache);
      drawScanRipples(view, cache, now);
      drawWind(view.weather, now);
      drawRain(view.weather, now);
    };

    p.setup = (): void => {
      try {
        const size = getCanvasSize();
        const renderer = p.createCanvas(size.width, size.height, p.WEBGL);
        canvasElement = renderer.elt as HTMLCanvasElement;
        canvasElement.classList.add("tideweft-canvas", "tideweft-relief-canvas");
        canvasElement.dataset.renderer = "relief-3d";
        canvasElement.tabIndex = 0;
        canvasElement.setAttribute("role", "application");
        canvasElement.setAttribute(
          "aria-label",
          "TIDEWEFT relief view. Travel with WASD or arrows. Hold J or L to spin the map; on touch, twist with two fingers and tap a visible parcel to approach and recover it. Space sounds the water, E interacts or recovers a nearby parcel, F ties or tends a Wayknot, T opens the tutorial, Shift braces, wheel zooms, and right-drag also orbits the estuary.",
        );
        canvasElement.setAttribute(
          "aria-keyshortcuts",
          "ArrowUp ArrowDown ArrowLeft ArrowRight W A S D J L Shift Space E F T Escape",
        );
        labelLayer = document.createElement("div");
        labelLayer.className = "relief-label-layer";
        labelLayer.dataset.renderer = "relief-3d";
        labelLayer.setAttribute("aria-hidden", "true");
        options.mount.append(labelLayer);
        syncActivePresentation();
        p.pixelDensity(Math.min(window.devicePixelRatio || 1, 1.5));
        p.frameRate(60);
        attachCanvasListeners(canvasElement);
        if (!active) p.noLoop();
      } catch (error) {
        showFailure(error instanceof Error ? error.message : "WEBGL initialization failed.");
        p.noLoop();
      }
    };

    p.draw = (): void => {
      if (!active || contextLost || !webglSupported) return;
      refreshLatestView();
      const now = performance.now();
      telemetry.recordFrame(now);
      advancePointerParallax(pointerParallax, now, reducedMotion);
      p.background(latestView?.weather.kind === "mist" ? RELIEF_PALETTE.horizon : RELIEF_PALETTE.ink);
      if (!latestView) return;
      const mesh = ensureMesh(latestView);
      advanceHeldOrbit(now);
      updateCamera(latestView, now, mesh.mesh);
      drawScene(latestView, mesh, now);
      syncReliefLabels(latestView, mesh, currentCameraState(), now);
    };
  };

  const destroy = (): void => {
    telemetry.setActive(false);
    releaseInput();
    detachCanvasListeners();
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (reducedMotionQuery && reducedMotionChangeHandler) {
      reducedMotionQuery.removeEventListener("change", reducedMotionChangeHandler);
    }
    reducedMotionQuery = null;
    instance?.remove();
    instance = null;
    canvasElement = null;
    notice?.remove();
    notice = null;
    labelLayer?.remove();
    labelLayer = null;
    labelNodes.clear();
    labelPositions.clear();
    resetPointerParallax(pointerParallax, true);
    delete options.mount.dataset.reliefFailure;
    cached = null;
    cachedPerceptionMesh = null;
    cachedPerception = null;
  };

  const setActive = (nextActive: boolean): void => {
    if (active === nextActive) {
      syncActivePresentation();
      return;
    }
    active = nextActive;
    telemetry.setActive(active && !contextLost && webglSupported);
    syncActivePresentation();
    if (!active) {
      releaseInput();
      instance?.noLoop();
    } else if (!contextLost && webglSupported) {
      refreshLatestView();
      instance?.loop();
    }
  };

  const controller: TideweftReliefRendererController = {
    canvas: () => canvasElement,
    telemetry: telemetry.getSnapshot,
    supported: () => webglSupported,
    isActive: () => active,
    setActive,
    resize: () => {
      if (!instance || !webglSupported || contextLost) return;
      const size = getCanvasSize();
      instance.resizeCanvas(size.width, size.height, true);
    },
    focusWorld: (point, zoom) => {
      refreshLatestView();
      orbit.focusPoint = { ...point };
      orbit.focusUntil = performance.now() + (reducedMotion ? 1 : 1_800);
      if (zoom !== undefined) orbit.manualZoom = clamp(zoom, 0.38, 3.2);
    },
    pulseScan,
    setOrbit: (yaw, pitch) => {
      setOrbitYaw(yaw);
      orbit.pitch = clamp(Number.isFinite(pitch) ? pitch : DEFAULT_PITCH, MIN_RELIEF_PITCH, MAX_RELIEF_PITCH);
    },
    resetOrbit: () => {
      setOrbitYaw(DEFAULT_YAW);
      orbit.pitch = DEFAULT_PITCH;
      orbit.manualZoom = 1;
    },
    orbitYaw: () => wrapReliefOrbitRadians(orbit.yaw),
    destroy,
  };

  if (!webglSupported) {
    showFailure("This browser did not expose a WebGL drawing context.");
    return controller;
  }

  reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  reducedMotion = reducedMotionQuery.matches;
  reducedMotionChangeHandler = (event: MediaQueryListEvent): void => {
    reducedMotion = event.matches;
    if (reducedMotion) {
      resetPointerParallax(pointerParallax, true);
      labelPositions.clear();
    }
  };
  reducedMotionQuery.addEventListener("change", reducedMotionChangeHandler);
  options.onOrbitChange?.(orbit.yaw);

  try {
    instance = new p5(sketch, options.mount);
  } catch (error) {
    showFailure(error instanceof Error ? error.message : "WEBGL initialization failed.");
  }
  if (typeof ResizeObserver !== "undefined" && webglSupported) {
    resizeObserver = new ResizeObserver(() => controller.resize());
    resizeObserver.observe(options.mount);
  }
  return controller;
}

function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.matches("input, textarea, select, [contenteditable]:not([contenteditable='false'])")
    || target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])") !== null;
}

function hasOpenDialog(): boolean {
  return typeof document !== "undefined" && document.querySelector("dialog[open]") !== null;
}

function detectWebGLSupport(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2", { antialias: false })
      ?? canvas.getContext("webgl", { antialias: false }),
    );
  } catch {
    return false;
  }
}

function distanceSquared(a: WorldPoint, b: WorldPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function routeDistanceSquared(point: WorldPoint, route: RouteView): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < route.points.length; index += 1) {
    const start = route.points[index - 1];
    const end = route.points[index];
    if (!start || !end) continue;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const denominator = dx * dx + dy * dy;
    const amount = denominator <= 0
      ? 0
      : clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / denominator, 0, 1);
    nearest = Math.min(nearest, distanceSquared(point, {
      x: start.x + dx * amount,
      y: start.y + dy * amount,
    }));
  }
  return nearest;
}

function reliefStringHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function reliefTileHash01(column: number, row: number, salt: number): number {
  let value = Math.imul((column | 0) ^ salt, 0x45d9_f3b);
  value ^= Math.imul((row | 0) ^ 0x27d4_eb2d, 0x119d_e1f3);
  value ^= value >>> 15;
  return (value >>> 0) / 4_294_967_295;
}

function unit(value: number | undefined, fallback = 0): number {
  return clamp(value ?? fallback, 0, 1);
}

function clampInteger(value: number, low: number, high: number): number {
  return Math.floor(clamp(value, low, high));
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, Number.isFinite(value) ? value : low));
}

export type {
  RendererCommand,
  TideweftRendererOptions,
  TideweftView,
} from "./types";

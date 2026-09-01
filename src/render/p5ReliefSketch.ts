import p5 from "p5";

import { buildSurfaceCurrentCues } from "./currentCues";
import {
  buildTerrainMesh,
  type TerrainMesh,
  type TerrainMeshChunk,
} from "./terrainMesh";
import {
  buildReliefMaterialBatches,
  type ReliefMaterialBatch,
} from "./reliefTerrainBatches";
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
import { reliefSoundingStyle, type ReliefDepthBand } from "./reliefSounding";
import {
  createReliefDiscoverySignatureMemo,
  discoveredReliefSurfaceHeightAt,
  maskReliefTileForDiscovery,
  reliefDiscoveryVisibility,
} from "./reliefTerrain";
import {
  createTideHarpGeometryMemo,
  tideHarpBellBaseHeight,
  tideHarpBellBob,
  tideHarpRootLift,
} from "./tideHarps";
import { buildWaychordBindings, buildWaychords } from "./wayknots";
import type {
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
}

export interface TideweftReliefRendererController extends TideweftRendererController {
  readonly supported: () => boolean;
  readonly isActive: () => boolean;
  readonly setActive: (active: boolean) => void;
  readonly setOrbit: (yaw: number, pitch: number) => void;
  readonly resetOrbit: () => void;
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
  readonly mesh: TerrainMesh;
  readonly chunks: readonly ReliefChunkBatch[];
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
}

interface AttachedListeners {
  readonly element: HTMLCanvasElement;
  readonly pointerDown: (event: PointerEvent) => void;
  readonly pointerMove: (event: PointerEvent) => void;
  readonly pointerUp: (event: PointerEvent) => void;
  readonly pointerCancel: (event: PointerEvent) => void;
  readonly contextMenu: (event: MouseEvent) => void;
  readonly keyDown: (event: KeyboardEvent) => void;
  readonly keyUp: (event: KeyboardEvent) => void;
  readonly blur: () => void;
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
  let webglSupported = detectWebGLSupport();
  let contextLost = false;
  let active = options.initiallyActive ?? true;
  let latestView: TideweftView | null = null;
  let cached: CachedReliefMesh | null = null;
  let orbitDrag: OrbitDrag | null = null;
  let clickCandidate: ClickCandidate | null = null;
  let pointerWorld: WorldPoint | null = null;
  let lastMovement = "0,0";
  const heldDirections = new Set<string>();
  const heldBraceKeys = new Set<string>();
  const ripples: ScanRipple[] = [];
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
    if (active && !contextLost) options.dispatch(command);
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

  const releaseInput = (): void => {
    heldDirections.clear();
    if (heldBraceKeys.size > 0) options.dispatch({ type: "brace", active: false });
    heldBraceKeys.clear();
    updateMovement();
    orbitDrag = null;
    clickCandidate = null;
  };

  const currentCameraState = (): ReliefCameraState => {
    const view = latestView;
    const worldWidth = view ? view.terrain.columns * view.terrain.tileSize : 2_400;
    const worldHeight = view ? view.terrain.rows * view.terrain.tileSize : 1_800;
    return normalizeReliefCamera({
      target: { x: orbit.x, y: orbit.y },
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
  ): void => {
    if (!labelLayer || !instance) return;
    const used = new Set<string>();
    const destination = view.player.destination;
    const tileSize = view.terrain.tileSize;
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
      let node = labelNodes.get(id);
      if (!node) {
        node = document.createElement("span");
        node.className = "relief-world-label";
        labelLayer?.append(node);
        labelNodes.set(id, node);
      }
      used.add(id);
      node.hidden = !projected.visible;
      if (!projected.visible) return;
      if (node.textContent !== text) node.textContent = text;
      node.dataset.tone = tone;
      node.dataset.selected = selected ? "true" : "false";
      node.style.left = `${projected.x.toFixed(1)}px`;
      node.style.top = `${projected.y.toFixed(1)}px`;
    };

    for (const settlement of view.settlements) {
      if (settlement.discovered === false) continue;
      const surface = discoveredReliefSurfaceHeightAt(
        view.terrain,
        settlement.position,
        cache.mesh.verticalScale,
        true,
      );
      const isDestination = Boolean(
        destination && distanceSquared(destination, settlement.position) <= tileSize * tileSize * 0.25,
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
    const tideHarps = tideHarpGeometryFor(view.tideHarps, tileSize * 0.1);
    for (const harp of tideHarps) {
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
    for (const [id, node] of labelNodes) {
      if (used.has(id)) continue;
      node.remove();
      labelNodes.delete(id);
    }
  };

  const findSelection = (
    point: WorldPoint,
  ): { entity: "settlement" | "porter" | "route"; id: string } | null => {
    const view = latestView;
    if (!view) return null;
    let nearest: { entity: "settlement" | "porter" | "route"; id: string; distance: number } | null = null;
    const settlementRadius = Math.max(view.terrain.tileSize * 0.55, unitsPerPixel() * 18);
    for (const settlement of view.settlements) {
      if (settlement.discovered === false) continue;
      const distance = distanceSquared(point, settlement.position);
      if (distance <= settlementRadius ** 2 && (!nearest || distance < nearest.distance)) {
        nearest = { entity: "settlement", id: settlement.id, distance };
      }
    }
    const porterRadius = Math.max(view.terrain.tileSize * 0.35, unitsPerPixel() * 12);
    for (const porter of view.porters) {
      const distance = distanceSquared(point, porter.position);
      if (distance <= porterRadius ** 2 && (!nearest || distance < nearest.distance)) {
        nearest = { entity: "porter", id: porter.id, distance };
      }
    }
    const routeRadius = Math.max(view.terrain.tileSize * 0.2, unitsPerPixel() * 8);
    for (const route of view.routes) {
      const distance = routeDistanceSquared(point, route);
      if (distance <= routeRadius ** 2 && (!nearest || distance < nearest.distance)) {
        nearest = { entity: "route", id: route.id, distance };
      }
    }
    return nearest && { entity: nearest.entity, id: nearest.id };
  };

  const pulseScan = (point?: WorldPoint): void => {
    const origin = point ?? options.getView()?.player.position;
    if (!origin) return;
    ripples.push({ point: { ...origin }, startedAt: performance.now() });
    if (ripples.length > 4) ripples.shift();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!active || contextLost || event.ctrlKey || event.metaKey || event.altKey) return;
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
      case "Enter":
        emit({ type: "interact" });
        break;
      case "KeyF":
        event.preventDefault();
        emit({ type: "wayknot" });
        break;
      case "KeyP":
        emit({ type: "toggle-pause" });
        break;
      case "Equal":
      case "NumpadAdd":
      case "BracketRight":
        emit({ type: "pace-step", delta: 1 });
        break;
      case "Minus":
      case "NumpadSubtract":
      case "BracketLeft":
        emit({ type: "pace-step", delta: -1 });
        break;
      case "Escape":
        emit({ type: "cancel" });
        break;
    }
  };

  const onKeyUp = (event: KeyboardEvent): void => {
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

  const detachCanvasListeners = (): void => {
    if (!attached) return;
    const { element } = attached;
    element.removeEventListener("pointerdown", attached.pointerDown);
    element.removeEventListener("pointermove", attached.pointerMove);
    element.removeEventListener("pointerup", attached.pointerUp);
    element.removeEventListener("pointercancel", attached.pointerCancel);
    element.removeEventListener("contextmenu", attached.contextMenu);
    element.removeEventListener("keydown", attached.keyDown);
    element.removeEventListener("keyup", attached.keyUp);
    element.removeEventListener("blur", attached.blur);
    element.removeEventListener("wheel", attached.wheel);
    element.removeEventListener("webglcontextlost", attached.contextLost);
    element.removeEventListener("webglcontextrestored", attached.contextRestored);
    attached = null;
  };

  const attachCanvasListeners = (element: HTMLCanvasElement): void => {
    detachCanvasListeners();
    const pointerDown = (event: PointerEvent): void => {
      if (!active || contextLost) return;
      element.focus({ preventScroll: true });
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
        clickCandidate = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          shiftKey: event.shiftKey,
        };
      }
      event.preventDefault();
    };
    const pointerMove = (event: PointerEvent): void => {
      if (orbitDrag?.pointerId === event.pointerId) {
        const dx = event.clientX - orbitDrag.lastX;
        const dy = event.clientY - orbitDrag.lastY;
        if (Math.abs(dx) + Math.abs(dy) > 0.5) orbitDrag.moved = true;
        orbit.yaw -= dx * 0.008;
        orbit.pitch = clamp(orbit.pitch + dy * 0.006, MIN_RELIEF_PITCH, MAX_RELIEF_PITCH);
        updateMovement();
        orbitDrag.lastX = event.clientX;
        orbitDrag.lastY = event.clientY;
        event.preventDefault();
        return;
      }
      const local = localPointer(event);
      pointerWorld = pickWorld(local);
      if (clickCandidate?.pointerId === event.pointerId
        && Math.hypot(event.clientX - clickCandidate.startX, event.clientY - clickCandidate.startY) > 7) {
        clickCandidate = null;
      }
    };
    const pointerUp = (event: PointerEvent): void => {
      if (orbitDrag?.pointerId === event.pointerId) {
        const wasRightClick = orbitDrag.button === 2 && !orbitDrag.moved;
        orbitDrag = null;
        if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId);
        if (wasRightClick) emit({ type: "cancel" });
        event.preventDefault();
        return;
      }
      if (clickCandidate?.pointerId !== event.pointerId) return;
      const candidate = clickCandidate;
      clickCandidate = null;
      const point = pickWorld(localPointer(event));
      if (!point) return;
      const target = findSelection(point);
      if (target) {
        emit({ type: "select", entity: target.entity, id: target.id, point });
      } else {
        emit({ type: "move-target", point, additive: candidate.shiftKey || event.shiftKey });
      }
      event.preventDefault();
    };
    const pointerCancel = (event: PointerEvent): void => {
      if (orbitDrag?.pointerId === event.pointerId) orbitDrag = null;
      if (clickCandidate?.pointerId === event.pointerId) clickCandidate = null;
    };
    const contextMenu = (event: MouseEvent): void => event.preventDefault();
    const blur = (): void => releaseInput();
    const wheel = (event: WheelEvent): void => {
      if (!active || contextLost) return;
      event.preventDefault();
      orbit.manualZoom = clamp(orbit.manualZoom * Math.exp(-event.deltaY * 0.0012), 0.38, 3.2);
    };
    const contextLostListener = (event: Event): void => {
      event.preventDefault();
      contextLost = true;
      releaseInput();
      instance?.noLoop();
      options.onWebGLError?.("The 3D graphics context was lost. Chart view is active; reload to retry Relief 3D.");
    };
    const contextRestored = (): void => {
      contextLost = false;
      cached = null;
      if (active) instance?.loop();
    };

    element.addEventListener("pointerdown", pointerDown);
    element.addEventListener("pointermove", pointerMove);
    element.addEventListener("pointerup", pointerUp);
    element.addEventListener("pointercancel", pointerCancel);
    element.addEventListener("contextmenu", contextMenu);
    element.addEventListener("keydown", onKeyDown);
    element.addEventListener("keyup", onKeyUp);
    element.addEventListener("blur", blur);
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("webglcontextlost", contextLostListener);
    element.addEventListener("webglcontextrestored", contextRestored);
    attached = {
      element,
      pointerDown,
      pointerMove,
      pointerUp,
      pointerCancel,
      contextMenu,
      keyDown: onKeyDown,
      keyUp: onKeyUp,
      blur,
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
    const chunks = mesh.chunks.map((chunk): ReliefChunkBatch => ({
      chunk,
      materials: buildReliefMaterialBatches(chunk, view.terrain),
    }));
    cached = { key, mesh, chunks };
    return cached;
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

    const materialColor = (material: ReliefMaterialBatch, fog: number): p5.Color => {
      const revealed = p.lerpColor(
        p.color(RELIEF_PALETTE.ink),
        p.color(TERRAIN_COLORS[material.kind]),
        Math.pow(unit(material.visibility), 0.72),
      );
      return p.lerpColor(revealed, p.color(RELIEF_PALETTE.horizon), clamp(fog * 0.72, 0, 0.78));
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
          p.ambientMaterial(materialColor(material, fog));
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
    };

    const drawWater = (view: TideweftView, cache: CachedReliefMesh): void => {
      if (!cache.mesh.waterPlane) return;
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
      p.ambientMaterial(withAlpha(RELIEF_PALETTE.water, 112));
      p.beginShape(p.TRIANGLES);
      for (let row = startRow; row <= endRow; row += 1) {
        for (let column = startColumn; column <= endColumn; column += 1) {
          const tile = grid.tiles[row * grid.columns + column];
          const visibility = reliefDiscoveryVisibility(tile);
          const depth = unit(tile?.waterDepth) * visibility;
          if (!tile || depth <= 0.002 || visibility <= 0.08) continue;
          const x0 = grid.origin.x + column * tileSize;
          const x1 = x0 + tileSize;
          const z0 = grid.origin.y + row * tileSize;
          const z1 = z0 + tileSize;
          const surface = discoveredReliefSurfaceHeightAt(
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
      }
      p.endShape();
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

    const drawRoute = (view: TideweftView, route: RouteView, cache: CachedReliefMesh): void => {
      if (route.points.length < 2) return;
      const color = route.selected
        ? RELIEF_PALETTE.amber
        : route.kind === "wake"
          ? RELIEF_PALETTE.water
          : route.kind === "crossing"
            ? RELIEF_PALETTE.coral
            : RELIEF_PALETTE.foam;
      p.noFill();
      p.stroke(withAlpha(color, 115 + unit(route.strength) * 125));
      p.strokeWeight(route.selected ? 3 : 1.45 + unit(route.strength));
      p.beginShape();
      for (const point of route.points) {
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

    const drawRoutes = (view: TideweftView, cache: CachedReliefMesh): void => {
      for (const route of view.routes) drawRoute(view, route, cache);
      const pulse = reducedMotion ? 0.72 : 0.65 + Math.sin(performance.now() * 0.002) * 0.15;
      p.noFill();
      p.stroke(withAlpha(RELIEF_PALETTE.violet, 150 * pulse));
      p.strokeWeight(2.2);
      for (const choir of view.choirs) {
        for (const path of choir.routePaths) {
          p.beginShape();
          for (const point of path) {
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
      const tileSize = view.terrain.tileSize;
      const surface = discoveredReliefSurfaceHeightAt(
        view.terrain,
        settlement.position,
        cache.mesh.verticalScale,
        true,
      );
      const towerHeight = tileSize * clamp(0.52 + Math.log2(Math.max(1, settlement.population)) * 0.055, 0.56, 1.18);
      const color = settlementColor(settlement.status);
      drawGroundRing(
        view,
        cache,
        settlement.position,
        tileSize * (settlement.selected ? 0.72 : 0.56),
        color,
        settlement.selected ? 235 : 155,
      );
      p.push();
      p.noStroke();
      p.translate(settlement.position.x, -surface - towerHeight / 2 - 1, settlement.position.y);
      p.ambientMaterial(RELIEF_PALETTE.built);
      p.box(tileSize * 0.48, towerHeight, tileSize * 0.48);
      p.translate(0, -towerHeight * 0.58, 0);
      p.emissiveMaterial(color);
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

    const drawPlayer = (view: TideweftView, cache: CachedReliefMesh): void => {
      const player = view.player;
      const size = view.terrain.tileSize;
      const surface = discoveredReliefSurfaceHeightAt(
        view.terrain,
        player.position,
        cache.mesh.verticalScale,
        true,
      );
      const playerColor = player.mode === "swept" ? RELIEF_PALETTE.water : RELIEF_PALETTE.tide;
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
      p.translate(player.position.x, -surface - size * 0.36, player.position.y);
      p.emissiveMaterial(playerColor);
      if (player.mode === "skiff" || player.mode === "swept") {
        p.scale(1.45, 0.55, 0.8);
      }
      p.sphere(size * 0.26, 10, 7);
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
          if (!tile || known <= 0.002) continue;
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
      p.ambientLight(72, 91, 90);
      p.directionalLight(190, 220, 207, -0.55, 0.9, -0.35);
      p.directionalLight(76, 128, 146, 0.65, 0.2, 0.7);
      drawTerrain(view, cache, camera);
      drawWater(view, cache);
      drawSurfaceCurrents(view, cache, now);
      drawRoutes(view, cache);
      drawSoundings(view, cache);
      drawTideHarps(view, cache, now);
      drawWayknots(view, cache, now);
      for (const settlement of view.settlements) drawSettlement(view, cache, settlement);
      drawPorters(view, cache);
      drawPlayer(view, cache);
      drawScanRipples(view, cache, now);
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
          "TIDEWEFT relief view. Travel with WASD or arrows. Space sounds the water, E interacts, F ties or tends a Wayknot, Shift braces, P pauses, wheel zooms, and right-drag orbits the estuary.",
        );
        canvasElement.setAttribute(
          "aria-keyshortcuts",
          "ArrowUp ArrowDown ArrowLeft ArrowRight W A S D Shift Space E F P Escape",
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
      latestView = options.getView() ?? null;
      const now = performance.now();
      p.background(latestView?.weather.kind === "mist" ? RELIEF_PALETTE.horizon : RELIEF_PALETTE.ink);
      if (!latestView) return;
      const mesh = ensureMesh(latestView);
      updateCamera(latestView, now, mesh.mesh);
      drawScene(latestView, mesh, now);
      syncReliefLabels(latestView, mesh, currentCameraState());
    };
  };

  const destroy = (): void => {
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
    delete options.mount.dataset.reliefFailure;
    cached = null;
  };

  const setActive = (nextActive: boolean): void => {
    if (active === nextActive) {
      syncActivePresentation();
      return;
    }
    active = nextActive;
    syncActivePresentation();
    if (!active) {
      releaseInput();
      instance?.noLoop();
    } else if (!contextLost && webglSupported) {
      instance?.loop();
    }
  };

  const controller: TideweftReliefRendererController = {
    canvas: () => canvasElement,
    supported: () => webglSupported,
    isActive: () => active,
    setActive,
    resize: () => {
      if (!instance || !webglSupported || contextLost) return;
      const size = getCanvasSize();
      instance.resizeCanvas(size.width, size.height, true);
    },
    focusWorld: (point, zoom) => {
      orbit.focusPoint = { ...point };
      orbit.focusUntil = performance.now() + (reducedMotion ? 1 : 1_800);
      if (zoom !== undefined) orbit.manualZoom = clamp(zoom, 0.38, 3.2);
    },
    pulseScan,
    setOrbit: (yaw, pitch) => {
      orbit.yaw = Number.isFinite(yaw) ? yaw : DEFAULT_YAW;
      orbit.pitch = clamp(Number.isFinite(pitch) ? pitch : DEFAULT_PITCH, MIN_RELIEF_PITCH, MAX_RELIEF_PITCH);
      updateMovement();
    },
    resetOrbit: () => {
      orbit.yaw = DEFAULT_YAW;
      orbit.pitch = DEFAULT_PITCH;
      orbit.manualZoom = 1;
      updateMovement();
    },
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
  };
  reducedMotionQuery.addEventListener("change", reducedMotionChangeHandler);

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

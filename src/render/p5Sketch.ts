import p5 from "p5";

import {
  biomeEnvironmentalEmphasis,
  visibleBiomePresentation,
} from "./biomePresentation";
import {
  chartTerrainDecorationHash01,
  terrainTileGlobalCoordinate,
} from "./terrainDecoration";
import { buildSurfaceCurrentCues, buildWaterVoiceLabels } from "./currentCues";
import { createTideHarpGeometryMemo } from "./tideHarps";
import { buildWaychordBindings, buildWaychords } from "./wayknots";
import { visibleWaterPresentation } from "./waterPresentation";
import { buildWindThreadFrame } from "./windPresentation";
import { createRendererTelemetry } from "./rendererTelemetry";
import {
  createTerrainPerceptionMemoryStore,
  rememberedTerrainVisibilityAt,
  type TerrainPerceptionMemoryState,
  type TerrainPerceptionMemoryStore,
} from "./terrainPerceptionMemory";
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
  EMPTY_LOOSE_CARGO_TOUCH_SEQUENCE,
  beginLooseCargoPointerPress,
  beginLooseCargoTouch,
  cancelLooseCargoPointerPress,
  endLooseCargoTouch,
  hitTestLooseCargoScreen,
  keyboardLooseCargoRecoveryCommand,
  looseCargoHitRadiusPixels,
  looseCargoRecoveryLabel,
  looseCargoTouchCanDispatch,
  looseCargoVisual,
  moveLooseCargoPointerPress,
  nearestRecoverableLooseCargo,
  releaseLooseCargoPointerCaptures,
  resolveLooseCargoPointerRelease,
  safeLooseCargoViews,
  type LooseCargoPointerPress,
  type LooseCargoTouchSequence,
} from "./looseCargoPresentation";
import {
  placeIncidentCallout,
  playerBalancePresentation,
  type PlayerBalancePresentation,
} from "./playerPresentation";
import {
  clampPorterSpeechPlacement,
  porterAppearancePresentation,
  porterQuickLabel,
  wrapPorterSpeech,
} from "./porterPresentation";
import {
  adriftPresentation,
  type AdriftPresentation,
} from "./adriftPresentation";
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
import {
  captureTerrainSpatialFrame,
  terrainSpatialFrameDelta,
  terrainSpatialFramesEqual,
  type TerrainSpatialFrame,
} from "./spatialFrame";

import type {
  AggregateWildlifeEvidenceView,
  CameraView,
  DogView,
  FieldResourceNodeView,
  LooseCargoView,
  LivingActorViewSpecies,
  ParticleView,
  PorterView,
  RendererCommand,
  RouteView,
  SettlementGlyph,
  SettlementStatus,
  SettlementView,
  TerrainKind,
  TerrainTileView,
  TideChoirMemoryView,
  TideweftRendererController,
  TideweftRendererOptions,
  TideweftView,
  TraceView,
  WayknotKind,
  WayknotView,
  WeatherView,
  WildlifeView,
  WorldEventView,
  WorldPoint,
} from "./types";

const PALETTE = {
  ink: "#061416",
  deep: "#08252e",
  channel: "#0d3b44",
  shallows: "#1b5960",
  mud: "#615b49",
  sand: "#8d7c58",
  marsh: "#315544",
  meadow: "#3e614f",
  scrub: "#394c45",
  ridge: "#53615d",
  built: "#827b68",
  foam: "#d9f8ea",
  tide: "#61e6d2",
  sky: "#87d8df",
  amber: "#ffc071",
  coral: "#ff8f78",
  violet: "#bea9ff",
  warning: "#ffcf6a",
  danger: "#ff796c",
} as const;

const TERRAIN_COLORS: Record<TerrainKind, string> = {
  "deep-water": PALETTE.deep,
  channel: PALETTE.channel,
  shallows: PALETTE.shallows,
  mudflat: PALETTE.mud,
  sandbar: PALETTE.sand,
  "salt-marsh": PALETTE.marsh,
  meadow: PALETTE.meadow,
  scrub: PALETTE.scrub,
  ridge: PALETTE.ridge,
  built: PALETTE.built,
};

const DOG_COAT_COLORS: Readonly<Record<DogView["coat"]["primary"], string>> = {
  black: "#172022",
  brown: "#624831",
  chocolate: "#432f28",
  tan: "#b68b5c",
  cream: "#d9ccaa",
  gold: "#c59a4b",
  white: "#e8e4d5",
  gray: "#7e8782",
  red: "#98583d",
  "blue-gray": "#657b82",
};

interface RuntimeCamera {
  x: number;
  y: number;
  zoom: number;
  initialized: boolean;
  manualZoom: number;
  focusPoint: WorldPoint | undefined;
  focusUntil: number;
}

interface ScanRipple {
  point: WorldPoint;
  startedAt: number;
}

type HoverTarget =
  | { readonly entity: "settlement" | "porter" | "route" | "resource"; readonly id: string }
  | {
      readonly entity: "living-actor";
      readonly species: LivingActorViewSpecies;
      readonly id: string;
    }
  | {
      readonly entity: "aggregate-wildlife-evidence";
      readonly species: "brown-rat";
      readonly aggregateId: string;
      readonly evidenceId: string;
    }
  | { readonly entity: "parcel"; readonly id: string };

interface ClickCandidate {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly shiftKey: boolean;
  readonly coarsePointer: boolean;
}

type SpatialEpochObservation = "unchanged" | "rebased" | "invalidated";

interface AttachedCanvasListeners {
  element: HTMLCanvasElement;
  pointerDown: (event: PointerEvent) => void;
  pointerMove: (event: PointerEvent) => void;
  pointerUp: (event: PointerEvent) => void;
  pointerCancel: (event: PointerEvent) => void;
  lostPointerCapture: (event: PointerEvent) => void;
  pointerLeave: () => void;
  contextMenu: (event: MouseEvent) => void;
  keyDown: (event: KeyboardEvent) => void;
  keyUp: (event: KeyboardEvent) => void;
  blur: () => void;
  windowBlur: () => void;
  visibilityChange: () => void;
  wheel: (event: WheelEvent) => void;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, Number.isFinite(value) ? value : low));

const unit = (value: number | undefined, fallback = 0): number =>
  clamp(value ?? fallback, 0, 1);

const distanceSquared = (a: WorldPoint, b: WorldPoint): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

const hash01 = (x: number, y: number, salt = 0): number => {
  let value = Math.imul((x | 0) ^ 0x45d9f3b, 0x45d9f3b);
  value ^= Math.imul((y | 0) ^ salt, 0x27d4eb2d);
  value ^= value >>> 15;
  return (value >>> 0) / 4_294_967_295;
};

const segmentDistanceSquared = (
  point: WorldPoint,
  start: WorldPoint,
  end: WorldPoint,
): number => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return distanceSquared(point, start);
  const amount = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy),
    0,
    1,
  );
  const nearest = { x: start.x + dx * amount, y: start.y + dy * amount };
  return distanceSquared(point, nearest);
};

const routeDistanceSquared = (point: WorldPoint, route: RouteView): number => {
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < route.points.length; index += 1) {
    const start = route.points[index - 1];
    const end = route.points[index];
    if (!start || !end) continue;
    nearest = Math.min(
      nearest,
      segmentDistanceSquared(point, start, end),
    );
  }
  return nearest;
};

interface PathSample {
  readonly point: WorldPoint;
  readonly angle: number;
}

const samplePath = (points: readonly WorldPoint[], amount: number): PathSample | null => {
  const first = points[0];
  if (!first) return null;
  if (points.length === 1) return { point: first, angle: 0 };

  const lengths: number[] = [];
  let totalLength = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (!start || !end) continue;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    lengths.push(length);
    totalLength += length;
  }
  if (totalLength <= 0) return { point: first, angle: 0 };

  const target = clamp(amount, 0, 1) * totalLength;
  let traversed = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (!start || !end) continue;
    const length = lengths[index - 1] ?? 0;
    if (traversed + length >= target || index === points.length - 1) {
      const local = length <= 0 ? 0 : clamp((target - traversed) / length, 0, 1);
      return {
        point: {
          x: start.x + (end.x - start.x) * local,
          y: start.y + (end.y - start.y) * local,
        },
        angle: Math.atan2(end.y - start.y, end.x - start.x),
      };
    }
    traversed += length;
  }
  return { point: first, angle: 0 };
};

const stringHash = (value: string): number => {
  let result = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16_777_619);
  }
  return result >>> 0;
};

const lineDashForStatus = (status: SettlementStatus, scale: number): number[] => {
  const size = Math.max(0.4, scale);
  switch (status) {
    case "steady":
      return [];
    case "watchful":
      return [5 * size, 3 * size];
    case "strained":
      return [1.5 * size, 3 * size];
    case "recovering":
      return [7 * size, 2.5 * size, 1.5 * size, 2.5 * size];
    case "evacuating":
      return [1 * size, 4 * size];
  }
};

/**
 * Creates the browser-pure p5 presentation. The projection remains authoritative;
 * all local state here is cosmetic camera/input state and can be discarded safely.
 */
export function createTideweftRenderer(
  options: TideweftRendererOptions & {
    readonly terrainPerceptionMemory?: TerrainPerceptionMemoryStore;
  },
): TideweftRendererController {
  let instance: p5 | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let reducedMotionQuery: MediaQueryList | null = null;
  let reducedMotion = false;
  let attached: AttachedCanvasListeners | null = null;
  let canvasElement: HTMLCanvasElement | null = null;
  let latestView: TideweftView | null = null;
  let active = true;
  let hoverTarget: HoverTarget | null = null;
  let pointerWorld: WorldPoint | null = null;
  let clickCandidate: ClickCandidate | null = null;
  let parcelPress: LooseCargoPointerPress | null = null;
  let touchSequence: LooseCargoTouchSequence = EMPTY_LOOSE_CARGO_TOUCH_SEQUENCE;
  let hasObservedSpatialEpoch = false;
  let observedSpatialEpoch: number | string | undefined;
  let observedSpatialFrame: TerrainSpatialFrame | null = null;
  let observedWorldName: string | undefined;
  const ownsTerrainPerceptionMemory = options.terrainPerceptionMemory === undefined;
  const terrainPerceptionMemory = options.terrainPerceptionMemory
    ?? createTerrainPerceptionMemoryStore();
  let lastMovement = "0,0";
  const heldDirections = new Set<string>();
  const heldBraceKeys = new Set<string>();
  const ripples: ScanRipple[] = [];
  const pointerParallax = createPointerParallaxState();
  const telemetry = createRendererTelemetry();
  const labelPositions = new Map<string, EasedScreenPoint>();
  const usedLabelPositions = new Set<string>();
  const tideHarpGeometryFor = createTideHarpGeometryMemo();
  const camera: RuntimeCamera = {
    x: 0,
    y: 0,
    zoom: 1,
    initialized: false,
    manualZoom: 1,
    focusPoint: undefined,
    focusUntil: 0,
  };

  const emit = (command: RendererCommand): void => {
    if (!active) return;
    const validated = latestView
      ? validatePerceivedEntityCommand(latestView, command)
      : command;
    if (validated) options.dispatch(validated);
  };

  const syncActivePresentation = (): void => {
    if (!canvasElement) return;
    canvasElement.hidden = !active;
    canvasElement.tabIndex = active ? 0 : -1;
    canvasElement.dataset.active = active ? "true" : "false";
    canvasElement.setAttribute("aria-hidden", active ? "false" : "true");
  };

  const getCanvasSize = (): { width: number; height: number } => {
    const rectangle = options.mount.getBoundingClientRect();
    return {
      width: Math.max(1, Math.round(rectangle.width || window.innerWidth || 1)),
      height: Math.max(1, Math.round(rectangle.height || window.innerHeight || 1)),
    };
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
    const signature = `${x},${y}`;
    if (signature === lastMovement) return;
    lastMovement = signature;
    emit({ type: "movement", vector: { x, y } });
  };

  const worldToScreen = (point: WorldPoint): WorldPoint => ({
    x: (point.x - camera.x) * camera.zoom + (instance?.width ?? 0) / 2 + pointerParallax.current.x,
    y: (point.y - camera.y) * camera.zoom + (instance?.height ?? 0) / 2 + pointerParallax.current.y,
  });

  const clientToWorld = (clientX: number, clientY: number): WorldPoint => {
    const rectangle = canvasElement?.getBoundingClientRect();
    if (!rectangle) return { x: camera.x, y: camera.y };
    const localX = clientX - rectangle.left;
    const localY = clientY - rectangle.top;
    return {
      x: (localX - rectangle.width / 2 - pointerParallax.current.x) / camera.zoom + camera.x,
      y: (localY - rectangle.height / 2 - pointerParallax.current.y) / camera.zoom + camera.y,
    };
  };

  const clientToScreen = (clientX: number, clientY: number): WorldPoint => {
    const rectangle = canvasElement?.getBoundingClientRect();
    return {
      x: clientX - (rectangle?.left ?? 0),
      y: clientY - (rectangle?.top ?? 0),
    };
  };

  const looseCargoViews = (): readonly LooseCargoView[] => {
    const view = latestView;
    const parcels = safeLooseCargoViews(view?.looseCargo ?? []);
    if (!view?.perception) return parcels;
    return parcels.filter((parcel) => isDirectlyDetailPerceived(view.terrain, parcel.position, true));
  };

  const releaseActiveTouchPointerCaptures = (): void => {
    releaseLooseCargoPointerCaptures(canvasElement, touchSequence.activePointerIds);
  };

  const invalidateSpatialInteraction = (): void => {
    const capturedPointerIds = [...touchSequence.activePointerIds];
    if (clickCandidate) capturedPointerIds.push(clickCandidate.pointerId);
    if (parcelPress) capturedPointerIds.push(parcelPress.pointerId);
    releaseLooseCargoPointerCaptures(canvasElement, capturedPointerIds);
    hoverTarget = null;
    pointerWorld = null;
    clickCandidate = null;
    parcelPress = null;
    touchSequence = EMPTY_LOOSE_CARGO_TOUCH_SEQUENCE;
    ripples.length = 0;
    camera.focusPoint = undefined;
    camera.focusUntil = 0;
    resetPointerParallax(pointerParallax, true);
    labelPositions.clear();
    if (canvasElement) delete canvasElement.dataset.hoverEntity;
  };

  const rebaseCameraToSpatialView = (view: TideweftView, delta: WorldPoint): void => {
    camera.x += delta.x;
    camera.y += delta.y;
    if (camera.focusPoint) {
      camera.focusPoint = {
        x: camera.focusPoint.x + delta.x,
        y: camera.focusPoint.y + delta.y,
      };
    }
    if (pointerWorld) {
      pointerWorld = { x: pointerWorld.x + delta.x, y: pointerWorld.y + delta.y };
    }
    for (const ripple of ripples) {
      ripple.point = { x: ripple.point.x + delta.x, y: ripple.point.y + delta.y };
    }
    const bounds = view.camera.bounds;
    if (bounds) {
      camera.x = clamp(camera.x, bounds.minX, bounds.maxX);
      camera.y = clamp(camera.y, bounds.minY, bounds.maxY);
    }
  };

  const snapCameraToSpatialView = (view: TideweftView): void => {
    const target = view.camera.followPlayer ? view.player.position : view.camera.center;
    camera.x = target.x;
    camera.y = target.y;
    camera.zoom = clamp(view.camera.zoom * camera.manualZoom, 0.12, 8);
    camera.initialized = true;
    const bounds = view.camera.bounds;
    if (bounds) {
      camera.x = clamp(camera.x, bounds.minX, bounds.maxX);
      camera.y = clamp(camera.y, bounds.minY, bounds.maxY);
    }
  };

  /**
   * Epochs are opaque projection identities. An absent epoch is a compatible
   * legacy view, while the first defined identity establishes the baseline
   * without disturbing an in-flight interaction.
   */
  const observeSpatialEpoch = (view: TideweftView): SpatialEpochObservation => {
    const nextEpoch = view.spatialEpoch;
    if (nextEpoch === undefined) return "unchanged";
    const nextFrame = captureTerrainSpatialFrame(view.terrain);
    if (!hasObservedSpatialEpoch) {
      hasObservedSpatialEpoch = true;
      observedSpatialEpoch = nextEpoch;
      observedSpatialFrame = nextFrame;
      observedWorldName = view.worldName;
      return "unchanged";
    }
    const epochChanged = !Object.is(observedSpatialEpoch, nextEpoch);
    const frameChanged = !terrainSpatialFramesEqual(observedSpatialFrame, nextFrame);
    const worldChanged = !Object.is(observedWorldName, view.worldName);
    if (!epochChanged && !frameChanged && !worldChanged) {
      return "unchanged";
    }
    observedSpatialEpoch = nextEpoch;
    observedWorldName = view.worldName;
    latestView = view;
    const delta = worldChanged
      ? null
      : terrainSpatialFrameDelta(observedSpatialFrame, nextFrame);
    if (delta) {
      rebaseCameraToSpatialView(view, delta);
      observedSpatialFrame = nextFrame;
      return "rebased";
    } else {
      // Missing/malformed frame metadata cannot safely reinterpret a held world
      // gesture. Legacy fixtures and true incompatible-world changes retain the
      // former fail-closed behavior.
      invalidateSpatialInteraction();
      snapCameraToSpatialView(view);
      observedSpatialFrame = nextFrame;
      return "invalidated";
    }
  };

  const observeCurrentSpatialEpoch = (): SpatialEpochObservation => {
    const currentView = options.getView();
    if (!currentView) return "unchanged";
    latestView = currentView;
    return observeSpatialEpoch(currentView);
  };

  const parcelHitAt = (
    screen: WorldPoint,
    coarsePointer: boolean,
  ) => hitTestLooseCargoScreen(
    looseCargoViews(),
    screen,
    looseCargoHitRadiusPixels(
      coarsePointer,
      Math.max(6, (latestView?.terrain.tileSize ?? 24) * camera.zoom * 0.28),
    ),
    (parcel) => worldToScreen(parcel.position),
  );

  const findHoverTarget = (point: WorldPoint): HoverTarget | null => {
    const view = latestView;
    if (!view) return null;
    const settlementRadius = 25 / Math.max(camera.zoom, 0.01);
    let nearest: { target: HoverTarget; distance: number } | null = null;

    for (const settlement of view.settlements) {
      if (settlement.discovered === false) continue;
      if (currentSettlementVisibility(settlement, view.perception !== undefined) < 1) continue;
      const distance = distanceSquared(point, settlement.position);
      if (distance <= settlementRadius * settlementRadius && (!nearest || distance < nearest.distance)) {
        nearest = {
          target: { entity: "settlement", id: settlement.id },
          distance,
        };
      }
    }

    const resourceRadius = Math.max(
      view.terrain.tileSize * 0.58,
      22 / Math.max(camera.zoom, 0.01),
    );
    const resourceHit = hitTestFieldResource(
      view.fieldResources.filter((node) =>
        !view.perception || node.currentVisibility === 1
      ),
      point,
      resourceRadius,
    );
    if (resourceHit && (!nearest || resourceHit.distanceSquared < nearest.distance)) {
      nearest = {
        target: { entity: "resource", id: resourceHit.node.id },
        distance: resourceHit.distanceSquared,
      };
    }

    const porterRadius = 22 / Math.max(camera.zoom, 0.01);
    for (const porter of view.porters) {
      if (!isDirectlyDetailPerceived(view.terrain, porter.position, view.perception !== undefined)) continue;
      const distance = distanceSquared(point, porter.position);
      if (distance <= porterRadius * porterRadius && (!nearest || distance < nearest.distance)) {
        nearest = { target: { entity: "porter", id: porter.id }, distance };
      }
    }

    const dogRadius = Math.max(
      view.terrain.tileSize * 0.4,
      22 / Math.max(camera.zoom, 0.01),
    );
    for (const dog of view.dogs ?? []) {
      if (!isDirectlyDetailPerceived(view.terrain, dog.position, view.perception !== undefined)) continue;
      const distance = distanceSquared(point, dog.position);
      if (distance <= dogRadius * dogRadius && (!nearest || distance < nearest.distance)) {
        nearest = {
          target: {
            entity: "living-actor",
            species: "domestic-dog",
            id: dog.actorId,
          },
          distance,
        };
      }
    }

    const wildlifeRadius = Math.max(
      view.terrain.tileSize * 0.5,
      22 / Math.max(camera.zoom, 0.01),
    );
    for (const actor of view.wildlife ?? []) {
      if (!isDirectlyDetailPerceived(view.terrain, actor.position, view.perception !== undefined)) continue;
      const distance = distanceSquared(point, actor.position);
      if (distance <= wildlifeRadius * wildlifeRadius && (!nearest || distance < nearest.distance)) {
        nearest = {
          target: {
            entity: "living-actor",
            species: actor.species,
            id: actor.actorId,
          },
          distance,
        };
      }
    }

    const evidenceRadius = Math.max(
      view.terrain.tileSize * 0.45,
      22 / Math.max(camera.zoom, 0.01),
    );
    for (const evidence of view.aggregateWildlifeEvidence ?? []) {
      if (evidence.representation !== "population-evidence") continue;
      if (!isDirectlyDetailPerceived(
        view.terrain,
        evidence.position,
        view.perception !== undefined,
      )) continue;
      const distance = distanceSquared(point, evidence.position);
      if (distance <= evidenceRadius ** 2 && (!nearest || distance < nearest.distance)) {
        nearest = {
          target: {
            entity: "aggregate-wildlife-evidence",
            species: "brown-rat",
            aggregateId: evidence.aggregateId,
            evidenceId: evidence.evidenceId,
          },
          distance,
        };
      }
    }

    if (routePointerTargetIsDirectlyPerceived(view, point)) {
      const routeRadius = 10 / Math.max(camera.zoom, 0.01);
      for (const route of view.routes) {
        const distance = routeDistanceSquared(point, route);
        if (distance <= routeRadius * routeRadius && (!nearest || distance < nearest.distance)) {
          nearest = { target: { entity: "route", id: route.id }, distance };
        }
      }
    }
    return nearest?.target ?? null;
  };

  const pulseScan = (point?: WorldPoint): void => {
    const view = options.getView();
    if (view) {
      latestView = view;
      observeSpatialEpoch(view);
    }
    const origin = point ?? view?.player.position;
    if (!origin) return;
    ripples.push({ point: origin, startedAt: performance.now() });
    if (ripples.length > 4) ripples.shift();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    observeCurrentSpatialEpoch();
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      event.preventDefault();
      const wasBracing = heldBraceKeys.size > 0;
      heldBraceKeys.add(event.code);
      if (!wasBracing) emit({ type: "brace", active: true });
      return;
    }
    const directional = [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "KeyA",
      "KeyD",
      "KeyW",
      "KeyS",
    ].includes(event.code);
    if (directional) {
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
    observeCurrentSpatialEpoch();
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      event.preventDefault();
      heldBraceKeys.delete(event.code);
      if (heldBraceKeys.size === 0) emit({ type: "brace", active: false });
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
    element.removeEventListener("lostpointercapture", attached.lostPointerCapture);
    element.removeEventListener("pointerleave", attached.pointerLeave);
    element.removeEventListener("contextmenu", attached.contextMenu);
    element.removeEventListener("keydown", attached.keyDown);
    element.removeEventListener("keyup", attached.keyUp);
    element.removeEventListener("blur", attached.blur);
    window.removeEventListener("blur", attached.windowBlur);
    document.removeEventListener("visibilitychange", attached.visibilityChange);
    element.removeEventListener("wheel", attached.wheel);
    attached = null;
  };

  const attachCanvasListeners = (element: HTMLCanvasElement): void => {
    detachCanvasListeners();

    const releasePointerCapture = (pointerId: number): void => {
      releaseLooseCargoPointerCaptures(element, [pointerId]);
    };

    const endTouch = (pointerId: number): void => {
      touchSequence = endLooseCargoTouch(touchSequence, pointerId);
      releasePointerCapture(pointerId);
    };

    const clearPointer = (pointerId?: number): void => {
      const capturedPointer = pointerId ?? clickCandidate?.pointerId ?? parcelPress?.pointerId;
      if (pointerId === undefined || clickCandidate?.pointerId === pointerId) clickCandidate = null;
      parcelPress = cancelLooseCargoPointerPress(parcelPress, pointerId);
      if (capturedPointer !== undefined) releasePointerCapture(capturedPointer);
    };

    const pointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      observeCurrentSpatialEpoch();
      element.focus({ preventScroll: true });
      if (event.pointerType === "touch") {
        resetPointerParallax(pointerParallax, true);
        touchSequence = beginLooseCargoTouch(touchSequence, event.pointerId);
        element.setPointerCapture?.(event.pointerId);
        if (touchSequence.suppressed) {
          clickCandidate = null;
          parcelPress = null;
          hoverTarget = null;
          event.preventDefault();
          return;
        }
      }
      const coarsePointer = usesCoarseWorldPointer(
        event.pointerType,
        window.matchMedia?.("(pointer: coarse)").matches ?? false,
      );
      const screen = clientToScreen(event.clientX, event.clientY);
      const radius = looseCargoHitRadiusPixels(
        coarsePointer,
        Math.max(6, (latestView?.terrain.tileSize ?? 24) * camera.zoom * 0.28),
      );
      parcelPress = beginLooseCargoPointerPress(
        event.pointerId,
        screen,
        looseCargoViews(),
        radius,
        coarsePointer ? 18 : 7,
        (parcel) => worldToScreen(parcel.position),
        "chart-2d",
      );
      clickCandidate = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        shiftKey: event.shiftKey,
        coarsePointer,
      };
      element.setPointerCapture?.(event.pointerId);
      pointerWorld = clientToWorld(event.clientX, event.clientY);
      event.preventDefault();
    };

    const pointerMove = (event: PointerEvent): void => {
      if (observeCurrentSpatialEpoch() === "invalidated") {
        event.preventDefault();
        return;
      }
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
            clientToScreen(event.clientX, event.clientY),
            {
              width: element.clientWidth || instance?.width || 1,
              height: element.clientHeight || instance?.height || 1,
            },
          )),
        );
      }
      const parcelHit = parcelHitAt(clientToScreen(event.clientX, event.clientY), coarsePointer);
      if (event.pointerType === "touch") {
        pointerWorld = null;
        hoverTarget = null;
        delete element.dataset.hoverEntity;
      } else {
        pointerWorld = clientToWorld(event.clientX, event.clientY);
        hoverTarget = parcelHit
          ? { entity: "parcel", id: parcelHit.parcel.id }
          : findHoverTarget(pointerWorld);
        element.dataset.hoverEntity = hoverTarget?.entity ?? "world";
      }
      if (clickCandidate?.pointerId === event.pointerId) {
        const maximumTravel = clickCandidate.coarsePointer ? 18 : 7;
        parcelPress = moveLooseCargoPointerPress(
          parcelPress,
          event.pointerId,
          clientToScreen(event.clientX, event.clientY),
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
      if (observeCurrentSpatialEpoch() === "invalidated") {
        event.preventDefault();
        return;
      }
      const trackedTouch = event.pointerType === "touch"
        && touchSequence.activePointerIds.includes(event.pointerId);
      if (trackedTouch && !looseCargoTouchCanDispatch(touchSequence, event.pointerId)) {
        clickCandidate = null;
        parcelPress = null;
        endTouch(event.pointerId);
        event.preventDefault();
        return;
      }
      if (clickCandidate?.pointerId !== event.pointerId) {
        clearPointer(event.pointerId);
        if (trackedTouch) endTouch(event.pointerId);
        return;
      }
      const candidate = clickCandidate;
      clickCandidate = null;
      const screen = clientToScreen(event.clientX, event.clientY);
      const parcelRelease = resolveLooseCargoPointerRelease(
        parcelPress,
        event.pointerId,
        screen,
        looseCargoViews(),
        looseCargoHitRadiusPixels(
          candidate.coarsePointer,
          Math.max(6, (latestView?.terrain.tileSize ?? 24) * camera.zoom * 0.28),
        ),
        (parcel) => worldToScreen(parcel.position),
        "chart-2d",
        candidate.coarsePointer,
      );
      parcelPress = null;
      releasePointerCapture(event.pointerId);
      if (trackedTouch) endTouch(event.pointerId);
      if (parcelRelease.consumesWorldTap) {
        if (parcelRelease.command) emit(parcelRelease.command);
        event.preventDefault();
        return;
      }
      const point = clientToWorld(event.clientX, event.clientY);
      pointerWorld = point;
      const target = findHoverTarget(point);
      const view = latestView;
      if (view) emit(commandForWorldTap(
        view,
        target?.entity === "parcel" ? null : target,
        point,
        candidate.coarsePointer,
        candidate.shiftKey || event.shiftKey,
      ));
      event.preventDefault();
    };

    const pointerCancel = (event: PointerEvent): void => {
      observeCurrentSpatialEpoch();
      clearPointer(event.pointerId);
      if (touchSequence.activePointerIds.includes(event.pointerId)) endTouch(event.pointerId);
    };

    const lostPointerCapture = (event: PointerEvent): void => {
      observeCurrentSpatialEpoch();
      clearPointer(event.pointerId);
      if (touchSequence.activePointerIds.includes(event.pointerId)) {
        touchSequence = endLooseCargoTouch(touchSequence, event.pointerId);
      }
    };

    const pointerLeave = (): void => {
      hoverTarget = null;
      pointerWorld = null;
      delete element.dataset.hoverEntity;
      resetPointerParallax(pointerParallax, false);
    };

    const contextMenu = (event: MouseEvent): void => {
      event.preventDefault();
      if (observeCurrentSpatialEpoch() === "invalidated") return;
      clearPointer();
      emit({ type: "cancel" });
    };

    const blur = (): void => {
      observeCurrentSpatialEpoch();
      heldDirections.clear();
      if (heldBraceKeys.size > 0) emit({ type: "brace", active: false });
      heldBraceKeys.clear();
      // A touch ADRIFT stroke lives in the runtime rather than this keyboard
      // signature. Always send an explicit zero on focus loss so that bounded
      // pulse cannot keep paddling after the player leaves the field.
      lastMovement = "0,0";
      emit({ type: "movement", vector: { x: 0, y: 0 } });
      clearPointer();
      releaseLooseCargoPointerCaptures(element, touchSequence.activePointerIds);
      touchSequence = EMPTY_LOOSE_CARGO_TOUCH_SEQUENCE;
      resetPointerParallax(pointerParallax, true);
      labelPositions.clear();
    };

    const windowBlur = (): void => blur();
    const visibilityChange = (): void => {
      if (document.visibilityState === "hidden") blur();
    };

    const wheel = (event: WheelEvent): void => {
      event.preventDefault();
      observeCurrentSpatialEpoch();
      const before = clientToWorld(event.clientX, event.clientY);
      const factor = Math.exp(-event.deltaY * 0.001);
      camera.manualZoom = clamp(camera.manualZoom * factor, 0.58, 2.4);
      camera.focusPoint = before;
      camera.focusUntil = performance.now() + 700;
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
    window.addEventListener("blur", windowBlur);
    document.addEventListener("visibilitychange", visibilityChange);
    element.addEventListener("wheel", wheel, { passive: false });
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
      windowBlur,
      visibilityChange,
      wheel,
    };
  };

  const sketch = (p: p5): void => {
    const withAlpha = (hex: string, alpha: number): p5.Color => {
      const color = p.color(hex);
      color.setAlpha(clamp(alpha, 0, 255));
      return color;
    };

    const terrainColor = (tile: TerrainTileView): p5.Color => {
      const biome = visibleBiomePresentation(tile);
      const base = p.color(
        tile.kind === "built"
          ? TERRAIN_COLORS.built
          : biome?.chartColor ?? TERRAIN_COLORS[tile.kind],
      );
      const lift = clamp((unit(tile.elevation) - 0.45) * 0.22, -0.08, 0.12);
      return p.lerpColor(base, p.color(lift >= 0 ? PALETTE.foam : PALETTE.ink), Math.abs(lift));
    };

    const setDash = (values: readonly number[], offset = 0): void => {
      const context = p.drawingContext as CanvasRenderingContext2D;
      context.setLineDash([...values]);
      context.lineDashOffset = offset;
    };

    const worldLabelScreen = (id: string, point: WorldPoint, now: number): WorldPoint => {
      usedLabelPositions.add(id);
      const eased = easeWorldLabelPoint(
        labelPositions.get(id),
        worldToScreen(point),
        now,
        reducedMotion,
      );
      labelPositions.set(id, eased);
      return eased;
    };

    const cleanupWorldLabelPositions = (): void => {
      for (const id of labelPositions.keys()) {
        if (!usedLabelPositions.has(id)) labelPositions.delete(id);
      }
    };

    const clearDash = (): void => setDash([]);

    const drawPolyline = (points: readonly WorldPoint[]): void => {
      if (points.length < 2) return;
      p.beginShape();
      for (const point of points) p.vertex(point.x, point.y);
      p.endShape();
    };

    const drawTerrainTexture = (
      grid: TideweftView["terrain"],
      tile: TerrainTileView,
      column: number,
      row: number,
      x: number,
      y: number,
      tileSize: number,
      waterDepth: number,
    ): void => {
      const centerX = x + tileSize * 0.5;
      const centerY = y + tileSize * 0.5;
      const stroke = tile.kind === "mudflat" || tile.kind === "sandbar"
        ? PALETTE.ink
        : PALETTE.foam;
      const alpha = tile.kind === "deep-water"
        ? 45 + waterDepth * 28
        : tile.kind === "channel" || tile.kind === "shallows"
          ? 54
          : 48;
      const variant = chartTerrainDecorationHash01(grid, column, row, 0x7465_7874);
      const offset = (variant - 0.5) * tileSize * 0.12;
      const weight = 0.72 / camera.zoom;

      p.noFill();
      p.stroke(withAlpha(stroke, alpha));
      p.strokeWeight(weight);
      clearDash();
      switch (tile.kind) {
        case "deep-water": {
          const width = tileSize * 0.58;
          p.arc(centerX, centerY - tileSize * 0.12 + offset, width, tileSize * 0.22, p.PI, p.TWO_PI);
          p.arc(centerX, centerY + tileSize * 0.13 + offset, width * 0.72, tileSize * 0.18, 0, p.PI);
          break;
        }
        case "channel": {
          const direction = variant > 0.5 ? 1 : -1;
          p.line(
            centerX - tileSize * 0.33,
            centerY + direction * tileSize * 0.23,
            centerX + tileSize * 0.33,
            centerY - direction * tileSize * 0.23,
          );
          p.line(centerX + tileSize * 0.08, centerY - direction * tileSize * 0.06, centerX, centerY - direction * tileSize * 0.24);
          p.line(centerX + tileSize * 0.08, centerY - direction * tileSize * 0.06, centerX + tileSize * 0.27, centerY - direction * tileSize * 0.02);
          break;
        }
        case "shallows": {
          for (let line = -1; line <= 1; line += 1) {
            const half = tileSize * (0.22 - Math.abs(line) * 0.035);
            const lineY = centerY + line * tileSize * 0.16 + offset * 0.35;
            p.line(centerX - half, lineY, centerX + half, lineY);
          }
          break;
        }
        case "mudflat": {
          const forkY = centerY + tileSize * 0.03;
          p.line(centerX + offset, y + tileSize * 0.2, centerX + offset, forkY);
          p.line(centerX + offset, forkY, x + tileSize * 0.26, y + tileSize * 0.8);
          p.line(centerX + offset, forkY, x + tileSize * 0.74, y + tileSize * 0.7);
          p.line(x + tileSize * 0.26, y + tileSize * 0.8, x + tileSize * 0.17, y + tileSize * 0.69);
          break;
        }
        case "sandbar": {
          p.arc(centerX, centerY + tileSize * 0.06, tileSize * 0.72, tileSize * 0.43, p.PI, p.TWO_PI);
          p.arc(centerX, centerY + tileSize * 0.12, tileSize * 0.42, tileSize * 0.24, p.PI, p.TWO_PI);
          break;
        }
        case "salt-marsh": {
          for (let reed = -1; reed <= 1; reed += 1) {
            const reedX = centerX + reed * tileSize * 0.16;
            const top = centerY - tileSize * (reed === 0 ? 0.31 : 0.2);
            p.line(reedX, centerY + tileSize * 0.28, reedX, top);
            p.line(reedX, top + tileSize * 0.11, reedX + (reed <= 0 ? -1 : 1) * tileSize * 0.1, top + tileSize * 0.03);
          }
          break;
        }
        case "meadow": {
          const baseY = centerY + tileSize * 0.24;
          p.line(centerX, baseY, centerX, centerY - tileSize * 0.22);
          p.line(centerX, centerY, centerX - tileSize * 0.22, centerY - tileSize * 0.14);
          p.line(centerX, centerY + tileSize * 0.06, centerX + tileSize * 0.23, centerY - tileSize * 0.08);
          break;
        }
        case "scrub": {
          const half = tileSize * 0.26;
          p.line(centerX - half, centerY + half, centerX + half, centerY - half);
          p.line(centerX - tileSize * 0.08, centerY + tileSize * 0.08, centerX - half, centerY - tileSize * 0.04);
          p.line(centerX + tileSize * 0.08, centerY - tileSize * 0.08, centerX + half, centerY + tileSize * 0.04);
          p.rectMode(p.CENTER);
          p.rect(centerX, centerY, tileSize * 0.11, tileSize * 0.11);
          break;
        }
        case "ridge": {
          for (let ridge = 0; ridge < 2; ridge += 1) {
            const inset = ridge * tileSize * 0.14;
            const baseY = centerY + tileSize * (0.22 - ridge * 0.08);
            p.beginShape();
            p.vertex(x + tileSize * 0.17 + inset, baseY);
            p.vertex(centerX, y + tileSize * 0.22 + inset * 0.4);
            p.vertex(x + tileSize * 0.83 - inset, baseY);
            p.endShape();
          }
          break;
        }
        case "built": {
          p.rectMode(p.CENTER);
          p.rect(centerX, centerY, tileSize * 0.52, tileSize * 0.52);
          p.line(centerX - tileSize * 0.26, centerY, centerX + tileSize * 0.26, centerY);
          p.line(centerX, centerY - tileSize * 0.26, centerX, centerY + tileSize * 0.26);
          break;
        }
      }
      p.rectMode(p.CORNER);
      p.noStroke();
    };

    const drawBiomeAccent = (
      grid: TideweftView["terrain"],
      tile: TerrainTileView,
      column: number,
      row: number,
      x: number,
      y: number,
      tileSize: number,
    ): void => {
      const presentation = visibleBiomePresentation(tile);
      if (!presentation) return;
      const visibility = unit(tile.discovered, 1);
      const emphasis = biomeEnvironmentalEmphasis(tile);
      const centerX = x + tileSize * 0.5;
      const centerY = y + tileSize * 0.5;
      const variant = chartTerrainDecorationHash01(grid, column, row, 0x6269_6f6d);
      const shift = (variant - 0.5) * tileSize * 0.16;
      const alpha = (38 + emphasis * 72) * visibility;

      p.noFill();
      p.stroke(withAlpha(presentation.accentColor, alpha));
      p.strokeWeight((0.62 + emphasis * 0.35) / camera.zoom);
      clearDash();
      switch (presentation.motif) {
        case "ripple":
          p.arc(centerX, centerY - tileSize * 0.08, tileSize * 0.54, tileSize * 0.2, 0, p.PI);
          p.arc(centerX + shift, centerY + tileSize * 0.15, tileSize * 0.34, tileSize * 0.12, p.PI, p.TWO_PI);
          break;
        case "salt-crystal":
          p.beginShape();
          p.vertex(centerX, centerY - tileSize * 0.29);
          p.vertex(centerX + tileSize * 0.21, centerY);
          p.vertex(centerX, centerY + tileSize * 0.29);
          p.vertex(centerX - tileSize * 0.21, centerY);
          p.endShape(p.CLOSE);
          p.line(centerX - tileSize * 0.17, centerY, centerX + tileSize * 0.17, centerY);
          break;
        case "reeds":
          for (let reed = -1; reed <= 1; reed += 1) {
            const reedX = centerX + reed * tileSize * 0.17 + shift * 0.25;
            const height = tileSize * (0.22 + (reed === 0 ? 0.14 : 0));
            p.line(reedX, centerY + tileSize * 0.3, reedX + shift * 0.18, centerY + tileSize * 0.3 - height);
          }
          break;
        case "rain-stem":
          p.line(centerX, centerY + tileSize * 0.3, centerX, centerY - tileSize * 0.16);
          p.arc(centerX - tileSize * 0.12, centerY - tileSize * 0.04, tileSize * 0.24, tileSize * 0.18, p.PI, p.TWO_PI);
          p.line(centerX + tileSize * 0.22, centerY - tileSize * 0.28, centerX + tileSize * 0.18, centerY - tileSize * 0.13);
          break;
        case "sunburst": {
          const radius = tileSize * (0.1 + emphasis * 0.035);
          p.circle(centerX + shift * 0.25, centerY, radius * 1.15);
          for (let ray = 0; ray < 4; ray += 1) {
            const angle = ray * p.HALF_PI + variant * 0.35;
            p.line(
              centerX + Math.cos(angle) * radius,
              centerY + Math.sin(angle) * radius,
              centerX + Math.cos(angle) * radius * 2.15,
              centerY + Math.sin(angle) * radius * 2.15,
            );
          }
          break;
        }
        case "wind-stroke": {
          const direction = variant > 0.5 ? 1 : -1;
          p.line(x + tileSize * 0.18, centerY - tileSize * 0.13, x + tileSize * 0.78, centerY - direction * tileSize * 0.03);
          p.line(x + tileSize * 0.31, centerY + tileSize * 0.17, x + tileSize * 0.66, centerY + direction * tileSize * 0.09);
          break;
        }
        case "glimmer":
          p.circle(centerX + shift, centerY - tileSize * 0.08, tileSize * 0.18);
          p.line(centerX + shift, centerY - tileSize * 0.28, centerX + shift, centerY + tileSize * 0.12);
          p.line(centerX - tileSize * 0.2 + shift, centerY - tileSize * 0.08, centerX + tileSize * 0.2 + shift, centerY - tileSize * 0.08);
          p.circle(centerX - tileSize * 0.24, centerY + tileSize * 0.22, tileSize * 0.055);
          break;
      }
      p.noStroke();
    };

    const drawTerrain = (
      view: TideweftView,
      terrainMemory: TerrainPerceptionMemoryState,
    ): void => {
      const grid = view.terrain;
      const tileSize = Math.max(0.1, grid.tileSize);
      const halfWidth = p.width / (2 * camera.zoom);
      const halfHeight = p.height / (2 * camera.zoom);
      const firstColumn = clamp(
        Math.floor((camera.x - halfWidth - grid.origin.x) / tileSize) - 1,
        0,
        Math.max(0, grid.columns - 1),
      );
      const lastColumn = clamp(
        Math.ceil((camera.x + halfWidth - grid.origin.x) / tileSize) + 1,
        0,
        Math.max(0, grid.columns - 1),
      );
      const firstRow = clamp(
        Math.floor((camera.y - halfHeight - grid.origin.y) / tileSize) - 1,
        0,
        Math.max(0, grid.rows - 1),
      );
      const lastRow = clamp(
        Math.ceil((camera.y + halfHeight - grid.origin.y) / tileSize) + 1,
        0,
        Math.max(0, grid.rows - 1),
      );

      p.noStroke();
      for (let row = firstRow; row <= lastRow; row += 1) {
        for (let column = firstColumn; column <= lastColumn; column += 1) {
          const tile = grid.tiles[row * grid.columns + column];
          if (!tile) continue;
          const x = grid.origin.x + column * tileSize;
          const y = grid.origin.y + row * tileSize;
          const discovered = unit(tile.discovered, 1);
          const liveCurrentVisibility = currentTerrainVisibility(
            tile,
            view.perception !== undefined,
          );
          const currentVisibility = rememberedTerrainVisibilityAt(
            terrainMemory,
            row * grid.columns + column,
          );
          if (discovered <= 0 && currentVisibility <= 0) {
            p.fill(PALETTE.ink);
            p.rect(x, y, tileSize + 0.35 / camera.zoom, tileSize + 0.35 / camera.zoom);
            continue;
          }
          if (currentVisibility <= 0) {
            // The Chart retains only a dim geographic memory. Live water,
            // climate, surface texture, and status cues never leak through it.
            p.fill(p.lerpColor(p.color(PALETTE.ink), terrainColor(tile), 0.1 * discovered));
            p.rect(x, y, tileSize + 0.35 / camera.zoom, tileSize + 0.35 / camera.zoom);
            continue;
          }
          const derivedDepth = clamp(view.tide.level * 0.82 - unit(tile.elevation), 0, 1);
          const waterDepth = unit(tile.waterDepth, derivedDepth);
          const rememberedWater = visibleWaterPresentation(tile, {
            derivedDepth,
            tideLevel: view.tide.level,
            transientVisibility: currentVisibility,
          });
          const water = visibleWaterPresentation(tile, {
            derivedDepth,
            tideLevel: view.tide.level,
            transientVisibility: liveCurrentVisibility,
          });
          const sensoryStrength = Math.pow(currentVisibility, 1.08);
          // Distant unsounded water gets one neutral under-surface as well as
          // one neutral water material. Otherwise translucent water can reveal
          // raw channel/shallows/deep terrain colors underneath it.
          const visibleTerrainColor = rememberedWater && !rememberedWater.depthDisclosed
            ? p.color(TERRAIN_COLORS.channel)
            : terrainColor(tile);
          p.fill(p.lerpColor(p.color(PALETTE.ink), visibleTerrainColor, sensoryStrength));
          p.rect(x, y, tileSize + 0.35 / camera.zoom, tileSize + 0.35 / camera.zoom);

          if (water) {
            const liveSensoryStrength = Math.pow(liveCurrentVisibility, 1.08);
            p.fill(withAlpha(water.color, water.opacity * liveSensoryStrength));
            p.rect(x, y, tileSize + 0.4 / camera.zoom, tileSize + 0.4 / camera.zoom);
            const globalTile = terrainTileGlobalCoordinate(grid, column, row);
            if (
              water.depthDisclosed
              && ((globalTile.x % 3) + (globalTile.y % 3)) % 3 === 0
              && waterDepth < 0.74
            ) {
              p.stroke(withAlpha(water.accentColor, water.accentOpacity));
              p.strokeWeight(0.55 / camera.zoom);
              const inset = tileSize * (
                0.2 + chartTerrainDecorationHash01(grid, column, row, 7) * 0.24
              );
              p.line(x + inset, y + tileSize * 0.66, x + tileSize - inset * 0.4, y + tileSize * 0.66);
              p.noStroke();
            }
          } else if (
            liveCurrentVisibility > 0
            && chartTerrainDecorationHash01(grid, column, row, 13) > 0.78
          ) {
            p.fill(withAlpha(PALETTE.foam, 14 + unit(tile.shelter) * 12));
            const fleck = Math.max(tileSize * 0.08, 0.5 / camera.zoom);
            p.circle(x + tileSize * 0.34, y + tileSize * 0.39, fleck);
          }

          const detailVisibility = currentTerrainDetailVisibility(
            tile,
            view.perception !== undefined,
          );
          if (detailVisibility >= 1) {
            drawTerrainTexture(grid, tile, column, row, x, y, tileSize, waterDepth);
            drawBiomeAccent(grid, tile, column, row, x, y, tileSize);
          }

          const trace = unit(tile.trace);
          if (trace > 0.02 && detailVisibility >= 1) {
            p.stroke(withAlpha(PALETTE.amber, 24 + trace * 72));
            p.strokeWeight((0.45 + trace * 1.2) / camera.zoom);
            p.line(x + tileSize * 0.12, y + tileSize * 0.78, x + tileSize * 0.88, y + tileSize * 0.22);
            p.noStroke();
          }

          if (tile.blocked && liveCurrentVisibility > 0) {
            p.stroke(withAlpha(PALETTE.ink, 80));
            p.strokeWeight(0.75 / camera.zoom);
            p.line(x + tileSize * 0.18, y + tileSize * 0.18, x + tileSize * 0.82, y + tileSize * 0.82);
            p.line(x + tileSize * 0.82, y + tileSize * 0.18, x + tileSize * 0.18, y + tileSize * 0.82);
            p.noStroke();
          }

          const presentationConfidence = Math.max(discovered, currentVisibility);
          if (presentationConfidence < 0.995) {
            p.fill(withAlpha(PALETTE.ink, (1 - presentationConfidence) * 238));
            p.rect(x, y, tileSize + 0.4 / camera.zoom, tileSize + 0.4 / camera.zoom);
          }
        }
      }
    };

    const drawSurfaceCurrents = (view: TideweftView, now: number): void => {
      const grid = view.terrain;
      const tileSize = Math.max(0.1, grid.tileSize);
      const halfWidth = p.width / (2 * camera.zoom);
      const halfHeight = p.height / (2 * camera.zoom);
      const bounds = {
        firstColumn: Math.floor((camera.x - halfWidth - grid.origin.x) / tileSize) - 1,
        lastColumn: Math.ceil((camera.x + halfWidth - grid.origin.x) / tileSize) + 1,
        firstRow: Math.floor((camera.y - halfHeight - grid.origin.y) / tileSize) - 1,
        lastRow: Math.ceil((camera.y + halfHeight - grid.origin.y) / tileSize) + 1,
      };
      const cues = buildSurfaceCurrentCues(grid, view.tide.surfaceCurrent, {
        analytical: (view.player.scanProgress ?? 0) > 0.001,
        bounds,
        focus: { x: camera.x, y: camera.y },
        tideLevel: view.tide.level,
        weatherIntensity: view.weather.intensity,
        timeMs: now,
        reducedMotion,
        maxCues: 220,
        requireDetailDisclosure: view.perception !== undefined,
      });
      if (cues.length === 0) return;

      const strokeCue = (cue: (typeof cues)[number]): void => {
        const [start, controlA, controlB, end] = cue.streamline;
        p.bezier(
          start.x, start.y,
          controlA.x, controlA.y,
          controlB.x, controlB.y,
          end.x, end.y,
        );
        if (cue.analytical) {
          p.line(cue.tip.x, cue.tip.y, cue.headLeft.x, cue.headLeft.y);
          p.line(cue.tip.x, cue.tip.y, cue.headRight.x, cue.headRight.y);
        }
      };
      p.push();
      p.noFill();
      clearDash();
      for (const cue of cues) {
        p.stroke(withAlpha(PALETTE.ink, 130 + cue.strength * 90));
        p.strokeWeight((2.5 + cue.turbulence * 1.3) / camera.zoom);
        strokeCue(cue);
      }
      for (const cue of cues) {
        p.stroke(withAlpha(PALETTE.foam, 105 + cue.strength * 120));
        p.strokeWeight((0.7 + cue.strength * 0.8) / camera.zoom);
        strokeCue(cue);
        p.strokeWeight((1.2 + cue.turbulence * 1.8) / camera.zoom);
        for (const fleck of cue.foam) p.point(fleck.x, fleck.y);
      }
      const voices = buildWaterVoiceLabels(cues, now, reducedMotion, 4);
      p.textAlign(p.CENTER, p.CENTER);
      p.textSize(9 / camera.zoom);
      p.noStroke();
      for (const voice of voices) {
        p.fill(withAlpha(PALETTE.ink, 220));
        p.text(voice.text, voice.point.x + 0.8 / camera.zoom, voice.point.y + 0.8 / camera.zoom);
        p.fill(withAlpha(PALETTE.foam, 180));
        p.text(voice.text, voice.point.x, voice.point.y);
      }
      p.pop();
    };

    const drawDepthSoundings = (view: TideweftView, now: number): void => {
      const scanProgress = view.player.scanProgress;
      if (scanProgress === undefined || scanProgress <= 0.001) return;
      const grid = view.terrain;
      const tileSize = Math.max(0.1, grid.tileSize);
      const centerColumn = Math.floor((view.player.position.x - grid.origin.x) / tileSize);
      const centerRow = Math.floor((view.player.position.y - grid.origin.y) / tileSize);
      const radiusTiles = 5.5;
      const candidates: {
        readonly point: WorldPoint;
        readonly depth: number;
        readonly distanceSquared: number;
        readonly order: number;
      }[] = [];

      for (let row = Math.max(0, centerRow - 6); row <= Math.min(grid.rows - 1, centerRow + 6); row += 1) {
        for (let column = Math.max(0, centerColumn - 6); column <= Math.min(grid.columns - 1, centerColumn + 6); column += 1) {
          const dx = column + 0.5 - (centerColumn + 0.5);
          const dy = row + 0.5 - (centerRow + 0.5);
          const distance = dx * dx + dy * dy;
          if (distance > radiusTiles * radiusTiles || distance < 1.15) continue;
          const tile = grid.tiles[row * grid.columns + column];
          if (!tile || unit(tile.discovered, 1) <= 0.08) continue;
          // Production views must never turn missing sounding metadata or a
          // fading terrain impression into exact bathymetry. Legacy fixtures
          // retain their historical discovered fallback only without a
          // perception contract.
          const known = unit(
            tile.depthKnown,
            view.perception ? 0 : unit(tile.discovered, 1),
          );
          if (known <= 0.08) continue;
          if (
            view.perception
            && currentTerrainDetailVisibility(tile, true) < 1
          ) continue;
          const derivedDepth = clamp(view.tide.level * 0.82 - unit(tile.elevation), 0, 1);
          const depth = unit(tile.waterDepth, derivedDepth);
          if (depth <= 0.035) continue;
          candidates.push({
            point: {
              x: grid.origin.x + (column + 0.5) * tileSize,
              y: grid.origin.y + (row + 0.5) * tileSize,
            },
            depth,
            distanceSquared: distance,
            order: hash01(column, row, 0x736f756e),
          });
        }
      }

      candidates.sort((left, right) =>
        left.distanceSquared - right.distanceSquared || left.order - right.order,
      );
      const selected: typeof candidates = [];
      const separationSquared = tileSize * tileSize * 2.35;
      for (const candidate of candidates) {
        if (selected.some((other) => distanceSquared(candidate.point, other.point) < separationSquared)) continue;
        selected.push(candidate);
        if (selected.length >= 7) break;
      }

      for (const sounding of selected) {
        const depthRank = Math.max(1, Math.min(9, Math.round(sounding.depth * 9)));
        const quality = sounding.depth < 0.28 ? "shoal" : sounding.depth < 0.62 ? "mid" : "deep";
        const shaft = tileSize * (0.15 + sounding.depth * 0.3);
        const rungCount = 1 + Math.floor(sounding.depth * 3);
        p.push();
        p.translate(sounding.point.x, sounding.point.y - tileSize * 0.08);
        p.noFill();
        p.stroke(withAlpha(PALETTE.foam, 218));
        p.strokeWeight(1.05 / camera.zoom);
        p.line(0, -shaft / 2, 0, shaft / 2);
        for (let rung = 0; rung < rungCount; rung += 1) {
          const amount = rungCount === 1 ? 0.5 : rung / (rungCount - 1);
          const rungY = -shaft / 2 + shaft * amount;
          const halfWidth = tileSize * (0.075 + sounding.depth * 0.035);
          p.line(-halfWidth, rungY, halfWidth, rungY);
        }
        p.fill(withAlpha(PALETTE.ink, 230));
        p.circle(0, shaft / 2, 2.8 / camera.zoom);
        p.pop();

        const screen = worldLabelScreen(
          `sounding-${sounding.point.x.toFixed(3)}-${sounding.point.y.toFixed(3)}`,
          sounding.point,
          now,
        );
        const label = `${depthRank} ${quality}`;
        p.push();
        p.resetMatrix();
        p.textAlign(p.CENTER, p.CENTER);
        p.textStyle(p.BOLD);
        p.textSize(8.5);
        const labelWidth = p.textWidth(label) + 8;
        p.noStroke();
        p.fill(withAlpha(PALETTE.ink, 218));
        p.rectMode(p.CENTER);
        p.rect(screen.x, screen.y + 10, labelWidth, 13, 4);
        p.fill(withAlpha(PALETTE.foam, 238));
        p.text(label, screen.x, screen.y + 9.5);
        p.pop();
      }
    };

  const routeColor = (route: RouteView): string => {
      switch (route.kind) {
        case "remembered":
          return PALETTE.foam;
        case "footpath":
          return PALETTE.amber;
        case "wake":
          return PALETTE.sky;
        case "strand":
          return PALETTE.tide;
        case "crossing":
          return PALETTE.coral;
      }
    };

    const chartViewportBounds = (marginPixels = 54) => {
      const zoom = Math.max(camera.zoom, 0.01);
      const margin = Math.max(0, marginPixels) / zoom;
      const centerX = camera.x - pointerParallax.current.x / zoom;
      const centerY = camera.y - pointerParallax.current.y / zoom;
      return {
        minX: centerX - p.width / (2 * zoom) - margin,
        minY: centerY - p.height / (2 * zoom) - margin,
        maxX: centerX + p.width / (2 * zoom) + margin,
        maxY: centerY + p.height / (2 * zoom) + margin,
      };
    };

    const routeRunsInViewport = (
      points: readonly WorldPoint[],
      bounds: ReturnType<typeof polylineBounds>,
      viewport: ReturnType<typeof chartViewportBounds>,
    ): readonly (readonly WorldPoint[])[] => {
      if (bounds && !worldBoundsOverlap(bounds, viewport)) return [];
      return clipPolylineToBounds(points, viewport);
    };

    const drawTraces = (traces: readonly TraceView[], now: number): void => {
      p.noFill();
      for (const trace of traces) {
        if (trace.points.length < 2 || trace.intensity <= 0) continue;
        const alpha = 22 + unit(trace.intensity) * 85 * (1 - unit(trace.age) * 0.55);
        const color = trace.kind === "possibility" ? PALETTE.violet : trace.kind === "wake" ? PALETTE.sky : PALETTE.amber;
        p.stroke(withAlpha(color, alpha));
        p.strokeWeight((0.7 + unit(trace.intensity) * 1.35) / camera.zoom);
        if (trace.kind === "possibility") {
          setDash([4 / camera.zoom, 6 / camera.zoom], reducedMotion ? 0 : -now * 0.012);
        } else {
          clearDash();
        }
        drawPolyline(trace.points);
      }
      clearDash();
    };

    const drawRoutes = (routes: readonly RouteView[], now: number): void => {
      const context = p.drawingContext as CanvasRenderingContext2D;
      const viewport = chartViewportBounds();
      p.noFill();
      for (const route of routes) {
        if (route.points.length < 2) continue;
        const memoryRuns = routeRunsInViewport(
          route.points,
          route.bounds ?? polylineBounds(route.points),
          viewport,
        );
        if (memoryRuns.length === 0) continue;
        const color = routeColor(route);
        const condition = unit(route.condition, 1);
        const strength = unit(route.strength);
        const selected = route.selected || (hoverTarget?.entity === "route" && hoverTarget.id === route.id);
        const remembered = route.kind === "remembered";

        context.save();
        context.shadowColor = color;
        context.shadowBlur = selected ? 18 : remembered ? 2 : 6 + strength * 8;
        p.stroke(withAlpha(PALETTE.ink, 170));
        p.strokeWeight((remembered ? 3.3 : 4.8 + strength * 2.5) / camera.zoom);
        clearDash();
        for (const run of memoryRuns) drawPolyline(run);

        p.stroke(withAlpha(color, remembered ? (selected ? 180 : 70) : 90 + condition * 150));
        p.strokeWeight((remembered ? 0.9 + (selected ? 0.7 : 0) : 1.15 + strength * 2.15 + (selected ? 0.7 : 0)) / camera.zoom);
        const reliability = unit(route.reliability, 1);
        if (!remembered && (reliability < 0.82 || route.kind === "wake")) {
          const dash = Math.max(2.5, 7 * reliability) / camera.zoom;
          setDash([dash, (3 + (1 - reliability) * 7) / camera.zoom], reducedMotion ? 0 : -now * 0.015);
        } else if (remembered) {
          setDash([2.2 / camera.zoom, 5.2 / camera.zoom], 0);
        } else {
          clearDash();
        }
        for (const run of memoryRuns) drawPolyline(run);
        context.restore();

        // Current route values are overlaid only where adjacent path points
        // are directly visible. The remembered line never inherits them.
        for (const observation of route.observedRuns ?? []) {
          const visibleRuns = routeRunsInViewport(
            observation.points,
            observation.bounds ?? polylineBounds(observation.points),
            viewport,
          );
          if (visibleRuns.length === 0) continue;
          const observedColor = routeColor({ ...route, kind: observation.kind });
          const observedStrength = unit(observation.strength);
          const observedCondition = unit(observation.condition, 1);
          const observedReliability = unit(observation.reliability, 1);
          context.save();
          context.shadowColor = observedColor;
          context.shadowBlur = selected ? 18 : 6 + observedStrength * 8;
          p.stroke(withAlpha(observedColor, 90 + observedCondition * 150));
          p.strokeWeight((1.15 + observedStrength * 2.15 + (selected ? 0.7 : 0)) / camera.zoom);
          if (observedReliability < 0.82 || observation.kind === "wake") {
            const dash = Math.max(2.5, 7 * observedReliability) / camera.zoom;
            setDash([dash, (3 + (1 - observedReliability) * 7) / camera.zoom], reducedMotion ? 0 : -now * 0.015);
          } else {
            clearDash();
          }
          for (const run of visibleRuns) drawPolyline(run);
          context.restore();
        }

        const directionalRun = memoryRuns[Math.floor(memoryRuns.length / 2)];
        if (route.directional && directionalRun && directionalRun.length > 1) {
          const middleIndex = Math.max(1, Math.floor(directionalRun.length / 2));
          const start = directionalRun[middleIndex - 1];
          const end = directionalRun[middleIndex];
          if (!start || !end) continue;
          const angle = Math.atan2(end.y - start.y, end.x - start.x);
          const x = (start.x + end.x) / 2;
          const y = (start.y + end.y) / 2;
          p.push();
          p.translate(x, y);
          p.rotate(angle);
          p.noStroke();
          p.fill(withAlpha(color, 210));
          const size = 3.8 / camera.zoom;
          p.triangle(size, 0, -size, -size * 0.7, -size, size * 0.7);
          p.pop();
        }
      }
      clearDash();
    };

    const drawChoirs = (choirs: readonly TideChoirMemoryView[], now: number): void => {
      const context = p.drawingContext as CanvasRenderingContext2D;
      const viewport = chartViewportBounds(72);
      for (const choir of choirs) {
        if (choir.routePaths.length === 0 && choir.harborPoints.length === 0) continue;
        const strong = choir.emphasis === "strong";
        const quiet = choir.emphasis === "quiet";
        const alpha = quiet ? 48 : strong ? 168 : 88;
        const salt = stringHash(choir.id);
        const visibleRoutePaths = choir.routePaths.flatMap((path, routeIndex) => {
          if (!path || path.length < 2) return [];
          const runs = routeRunsInViewport(
            path,
            choir.routePathBounds?.[routeIndex] ?? polylineBounds(path),
            viewport,
          );
          return runs.length > 0 ? [{ runs }] : [];
        });

        // The parallel outline, fixed dotted phrase, and diamond notes preserve
        // the loop's meaning without asking color alone to carry it.
        for (const visiblePath of visibleRoutePaths) {
          context.save();
          context.shadowColor = PALETTE.violet;
          context.shadowBlur = strong ? 13 : 5;
          p.noFill();
          clearDash();
          p.stroke(withAlpha(PALETTE.foam, alpha * 0.34));
          p.strokeWeight((strong ? 7.4 : 5.6) / camera.zoom);
          for (const run of visiblePath.runs) drawPolyline(run);
          p.stroke(withAlpha(PALETTE.violet, alpha));
          p.strokeWeight((strong ? 2.15 : 1.45) / camera.zoom);
          setDash([1.2 / camera.zoom, 5.4 / camera.zoom], 0);
          for (const run of visiblePath.runs) drawPolyline(run);
          clearDash();
          context.restore();

          const note = samplePath(
            visiblePath.runs[Math.floor(visiblePath.runs.length / 2)] ?? [],
            0.5,
          );
          if (!note) continue;
          const noteSize = (strong ? 4.4 : 3.5) / camera.zoom;
          p.push();
          p.translate(note.point.x, note.point.y);
          p.rotate(note.angle);
          p.fill(withAlpha(PALETTE.ink, 238));
          p.stroke(withAlpha(PALETTE.foam, strong ? 238 : 188));
          p.strokeWeight((strong ? 1.35 : 1) / camera.zoom);
          p.quad(0, -noteSize, noteSize, 0, 0, noteSize, -noteSize, 0);
          p.line(noteSize, 0, noteSize, -noteSize * 1.85);
          p.line(noteSize, -noteSize * 1.85, noteSize * 1.7, -noteSize * 1.45);
          p.pop();
        }

        const visibleHarbors = choir.harborPoints.filter((harbor) =>
          harbor.x >= viewport.minX
          && harbor.x <= viewport.maxX
          && harbor.y >= viewport.minY
          && harbor.y <= viewport.maxY
        );
        for (const harbor of visibleHarbors) {
          const radius = (strong ? 15 : 12) / camera.zoom;
          p.push();
          p.translate(harbor.x, harbor.y);
          p.noFill();
          p.stroke(withAlpha(PALETTE.foam, strong ? 146 : 72));
          p.strokeWeight((strong ? 1.5 : 1) / camera.zoom);
          clearDash();
          p.circle(0, 0, radius * 2);
          setDash([1.1 / camera.zoom, 3.2 / camera.zoom], 0);
          p.stroke(withAlpha(PALETTE.violet, strong ? 230 : 132));
          p.circle(0, 0, radius * 2.7);
          clearDash();
          for (let mark = 0; mark < 4; mark += 1) {
            const angle = mark * p.HALF_PI;
            p.line(
              Math.cos(angle) * radius * 1.48,
              Math.sin(angle) * radius * 1.48,
              Math.cos(angle) * radius * 1.78,
              Math.sin(angle) * radius * 1.78,
            );
          }
          p.pop();
        }

        // Motion is entirely optional decoration. Reduced-motion retains the
        // fixed double halo and note glyphs above, with no clock-derived state.
        const visibleMotePaths = visibleRoutePaths.flatMap(({ runs }) => runs);
        if (!reducedMotion && visibleMotePaths.length > 0) {
          const mothCount = Math.min(2, visibleMotePaths.length);
          for (let moteIndex = 0; moteIndex < mothCount; moteIndex += 1) {
            const path = visibleMotePaths[(salt + moteIndex) % visibleMotePaths.length];
            if (!path) continue;
            const seed = hash01(salt, moteIndex, 0x63686f69);
            const progress = (seed + now * (0.000018 + moteIndex * 0.000004)) % 1;
            const sample = samplePath(path, progress);
            if (!sample) continue;
            const wing = (1.2 + Math.sin(now * 0.006 + seed * 17) * 0.35) / camera.zoom;
            const drift = Math.sin(now * 0.0019 + seed * 23) * 2.1 / camera.zoom;
            const moteAlpha = strong ? 210 : 112;
            p.push();
            p.translate(
              sample.point.x - Math.sin(sample.angle) * drift,
              sample.point.y + Math.cos(sample.angle) * drift,
            );
            p.rotate(sample.angle);
            p.noStroke();
            p.fill(withAlpha(PALETTE.amber, moteAlpha * 0.68));
            p.ellipse(-wing * 0.9, -wing * 0.55, wing * 1.6, wing);
            p.ellipse(-wing * 0.9, wing * 0.55, wing * 1.6, wing);
            p.fill(withAlpha(PALETTE.foam, moteAlpha));
            p.ellipse(0, 0, wing * 1.9, wing * 0.68);
            p.pop();
          }

          if (strong && visibleHarbors.length > 0) {
            const signalStep = Math.floor(now / 1_500);
            const harbor = visibleHarbors[(salt + signalStep) % visibleHarbors.length];
            if (harbor) {
              const progress = (now % 1_500) / 1_500;
              const radius = (5 + progress * 12) / camera.zoom;
              p.push();
              p.translate(harbor.x, harbor.y);
              p.noFill();
              p.stroke(withAlpha(PALETTE.foam, 170 * (1 - progress)));
              p.strokeWeight(1 / camera.zoom);
              p.circle(0, 0, radius * 2);
              p.pop();
            }
          }
        }

        if (strong && visibleHarbors.length > 0) {
          const total = visibleHarbors.reduce(
            (total, point) => ({ x: total.x + point.x, y: total.y + point.y }),
            { x: 0, y: 0 },
          );
          const center = {
            x: total.x / visibleHarbors.length,
            y: total.y / visibleHarbors.length,
          };
          const screen = worldLabelScreen(`choir-${choir.id}`, center, now);
          p.push();
          p.resetMatrix();
          p.textAlign(p.CENTER, p.CENTER);
          p.textStyle(p.BOLD);
          p.textSize(11.5);
          const width = Math.min(310, p.textWidth(choir.label) + 22);
          p.noStroke();
          p.fill(withAlpha(PALETTE.ink, 224));
          p.rectMode(p.CENTER);
          p.rect(screen.x, screen.y - 35, width, 23, 8);
          p.fill(withAlpha(PALETTE.foam, 245));
          p.text(choir.label, screen.x, screen.y - 35.5, width - 12, 21);
          p.pop();
        }
      }
      clearDash();
    };

    const drawFieldResourceMotif = (
      node: FieldResourceNodeView,
      size: number,
    ): void => {
      const presentation = FIELD_RESOURCE_PRESENTATION[node.material];
      const color = presentation.chartColor;
      const sounded = node.knowledge === "sounded";
      const orientation = (stringHash(node.id) / 4_294_967_295) * p.TWO_PI;
      const inkAlpha = sounded ? 238 : 190;

      p.push();
      p.translate(node.position.x, node.position.y);
      p.rotate(orientation * 0.18 - 0.2);
      p.strokeCap(p.ROUND);
      p.strokeJoin(p.ROUND);
      p.stroke(withAlpha(PALETTE.ink, 218));
      p.strokeWeight(Math.max(size * 0.3, 3.2 / camera.zoom));

      switch (presentation.motif) {
        case "kelp-bladders":
          for (const offset of [-0.34, 0, 0.34]) {
            p.line(offset * size, size * 0.48, offset * size * 0.62, -size * 0.2);
            p.fill(withAlpha(color, inkAlpha));
            p.stroke(withAlpha(PALETTE.ink, 218));
            p.strokeWeight(1 / camera.zoom);
            p.circle(offset * size * 0.62, -size * (0.2 + Math.abs(offset) * 0.22), size * 0.42);
          }
          break;
        case "crossed-driftwood":
          p.stroke(withAlpha(color, inkAlpha));
          p.strokeWeight(size * 0.23);
          p.line(-size * 0.62, -size * 0.28, size * 0.58, size * 0.26);
          p.line(-size * 0.46, size * 0.45, size * 0.5, -size * 0.48);
          p.stroke(withAlpha(PALETTE.foam, 145));
          p.strokeWeight(size * 0.055);
          p.line(-size * 0.32, -size * 0.14, -size * 0.02, -size * 0.01);
          break;
        case "glimmer-cap":
          p.stroke(withAlpha(PALETTE.foam, 205));
          p.strokeWeight(size * 0.12);
          p.line(0, size * 0.46, 0, -size * 0.06);
          p.noStroke();
          p.fill(withAlpha(color, inkAlpha));
          p.arc(0, -size * 0.06, size * 1.18, size * 0.82, p.PI, p.TWO_PI, p.CHORD);
          p.fill(withAlpha(PALETTE.foam, sounded ? 238 : 170));
          p.circle(-size * 0.2, -size * 0.24, size * 0.12);
          p.circle(size * 0.19, -size * 0.32, size * 0.1);
          break;
        case "shell-spiral":
          p.fill(withAlpha(PALETTE.ink, 205));
          p.stroke(withAlpha(color, inkAlpha));
          p.strokeWeight(size * 0.13);
          p.circle(0, 0, size * 1.08);
          p.noFill();
          p.stroke(withAlpha(PALETTE.foam, 205));
          p.strokeWeight(size * 0.075);
          p.arc(0, 0, size * 0.68, size * 0.68, -0.4, p.TWO_PI - 0.4);
          p.arc(size * 0.07, 0, size * 0.3, size * 0.3, -0.4, p.TWO_PI - 0.4);
          break;
        case "sunburst-fiber":
          p.stroke(withAlpha(color, inkAlpha));
          p.strokeWeight(size * 0.1);
          p.line(0, size * 0.58, 0, -size * 0.18);
          for (let ray = 0; ray < 7; ray += 1) {
            const angle = -p.PI + (ray / 6) * p.PI;
            p.line(
              0,
              -size * 0.12,
              Math.cos(angle) * size * 0.58,
              -size * 0.12 + Math.sin(angle) * size * 0.58,
            );
          }
          p.noStroke();
          p.fill(withAlpha(PALETTE.foam, 218));
          p.circle(0, -size * 0.12, size * 0.24);
          break;
        case "hooked-stone":
          p.noFill();
          p.stroke(withAlpha(color, inkAlpha));
          p.strokeWeight(size * 0.27);
          p.arc(-size * 0.02, -size * 0.05, size * 0.84, size * 1.02, -p.HALF_PI, p.PI * 0.78);
          p.stroke(withAlpha(PALETTE.foam, 175));
          p.strokeWeight(size * 0.07);
          p.line(size * 0.2, size * 0.34, size * 0.52, size * 0.5);
          break;
        case "bound-reeds":
          p.stroke(withAlpha(color, inkAlpha));
          p.strokeWeight(size * 0.13);
          for (const offset of [-0.3, 0, 0.3]) {
            p.line(offset * size, size * 0.58, offset * size * 0.78, -size * 0.58);
          }
          p.stroke(withAlpha(PALETTE.foam, 205));
          p.strokeWeight(size * 0.08);
          p.line(-size * 0.43, size * 0.08, size * 0.43, size * 0.08);
          p.line(-size * 0.4, size * 0.25, size * 0.4, size * 0.25);
          break;
        case "moss-cushion":
          p.noStroke();
          p.fill(withAlpha(PALETTE.ink, 205));
          p.ellipse(0, size * 0.2, size * 1.35, size * 0.62);
          p.fill(withAlpha(color, inkAlpha));
          p.circle(-size * 0.34, size * 0.04, size * 0.62);
          p.circle(size * 0.06, -size * 0.08, size * 0.78);
          p.circle(size * 0.4, size * 0.08, size * 0.5);
          break;
        case "forked-lichen":
          p.stroke(withAlpha(color, inkAlpha));
          p.strokeWeight(size * 0.11);
          p.line(0, size * 0.58, 0, -size * 0.24);
          p.line(0, size * 0.1, -size * 0.43, -size * 0.28);
          p.line(-size * 0.2, -size * 0.08, -size * 0.45, -size * 0.52);
          p.line(0, -size * 0.1, size * 0.42, -size * 0.46);
          p.line(size * 0.2, -size * 0.28, size * 0.52, -size * 0.16);
          p.noStroke();
          p.fill(withAlpha(PALETTE.foam, 205));
          p.circle(0, -size * 0.24, size * 0.15);
          break;
      }
      p.pop();
    };

    const drawFieldResources = (view: TideweftView, now: number): void => {
      const baseSize = Math.max(view.terrain.tileSize * 0.38, 5.5 / camera.zoom);
      for (const node of view.fieldResources) {
        const direct = !view.perception || node.currentVisibility === 1;
        const projectedScreen = worldToScreen(node.position);
        const hovered = direct && hoverTarget?.entity === "resource" && hoverTarget.id === node.id;
        const screen = hovered
          ? worldLabelScreen(`resource-${node.id}`, node.position, now)
          : projectedScreen;
        if (projectedScreen.x < -40 || projectedScreen.y < -40 || projectedScreen.x > p.width + 40 || projectedScreen.y > p.height + 40) {
          continue;
        }
        if (!direct) {
          // A learned Chart mark persists, but it carries no current stock,
          // interaction halo, or species-specific live silhouette.
          p.push();
          p.translate(node.position.x, node.position.y);
          p.noFill();
          p.stroke(withAlpha(PALETTE.foam, node.currentVisibility === 0.5 ? 70 : 28));
          p.strokeWeight(0.65 / camera.zoom);
          p.circle(0, 0, baseSize * 0.8);
          p.pop();
          continue;
        }
        if (node.knowledge === "sounded" || hovered) {
          p.push();
          p.translate(node.position.x, node.position.y);
          p.noFill();
          p.stroke(withAlpha(
            FIELD_RESOURCE_PRESENTATION[node.material].chartColor,
            hovered ? 225 : 118,
          ));
          p.strokeWeight((hovered ? 1.5 : 0.9) / camera.zoom);
          p.circle(0, 0, baseSize * (hovered ? 3.15 : 2.7));
          if (node.knowledge === "sounded") {
            const markCount = node.rarity === "rare" ? 3 : node.rarity === "secondary" ? 2 : 1;
            p.noStroke();
            p.fill(withAlpha(PALETTE.foam, hovered ? 235 : 175));
            for (let mark = 0; mark < markCount; mark += 1) {
              const x = (mark - (markCount - 1) / 2) * baseSize * 0.38;
              p.circle(x, baseSize * 1.58, baseSize * 0.13);
            }
          }
          p.pop();
        }
        drawFieldResourceMotif(node, baseSize);

        if (!hovered) continue;
        const presentation = FIELD_RESOURCE_PRESENTATION[node.material];
        const detail = node.knowledge === "sounded"
          ? `${node.rarity ?? "known"} · ${node.stockUnits ?? 0} ready`
          : "charted · sound for stock";
        const label = `${presentation.label} · ${detail}`;
        p.push();
        p.resetMatrix();
        p.textAlign(p.CENTER, p.CENTER);
        p.textStyle(p.BOLD);
        p.textSize(11);
        const labelWidth = p.textWidth(label) + 16;
        p.noStroke();
        p.fill(withAlpha(PALETTE.ink, 232));
        p.rectMode(p.CENTER);
        p.rect(screen.x, screen.y + 25, labelWidth, 20, 7);
        p.fill(withAlpha(PALETTE.foam, 242));
        p.text(label, screen.x, screen.y + 24.5);
        p.pop();
      }
    };

    const drawLooseCargo = (view: TideweftView, now: number): void => {
      const parcels = safeLooseCargoViews(view.looseCargo ?? []).filter((parcel) =>
        !view.perception || isDirectlyDetailPerceived(view.terrain, parcel.position, true)
      );
      if (parcels.length === 0) return;
      const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
      const nearby = nearestRecoverableLooseCargo(
        parcels,
        view.player.position,
        Math.max(1, view.terrain.tileSize * 0.9),
      );
      const size = Math.max(view.terrain.tileSize * 0.31, 6.5 / camera.zoom);

      for (const parcel of parcels) {
        const projectedScreen = worldToScreen(parcel.position);
        if (projectedScreen.x < -50 || projectedScreen.y < -50 || projectedScreen.x > p.width + 50 || projectedScreen.y > p.height + 50) {
          continue;
        }
        const visual = looseCargoVisual(parcel);
        const hovered = hoverTarget?.entity === "parcel" && hoverTarget.id === parcel.id;
        const recoveryFocus = nearby?.id === parcel.id;
        const highlighted = hovered || recoveryFocus;
        const screen = highlighted
          ? worldLabelScreen(`parcel-${parcel.id}`, parcel.position, now)
          : projectedScreen;
        const tumble = visual.motionMark === "tumble" && !reducedMotion
          ? now * 0.004 + visual.orientationRadians
          : visual.orientationRadians * 0.22;

        p.push();
        p.translate(parcel.position.x, parcel.position.y);

        if (visual.motionMark === "wake") {
          const wakeLength = size * 2.2;
          p.noFill();
          p.stroke(withAlpha(PALETTE.sky, 185));
          p.strokeWeight(1.15 / camera.zoom);
          const nx = -visual.wake.x;
          const ny = -visual.wake.y;
          const px = -ny;
          const py = nx;
          p.line(
            nx * size * 0.45 + px * size * 0.3,
            ny * size * 0.45 + py * size * 0.3,
            nx * wakeLength + px * size * 0.58,
            ny * wakeLength + py * size * 0.58,
          );
          p.line(
            nx * size * 0.45 - px * size * 0.3,
            ny * size * 0.45 - py * size * 0.3,
            nx * wakeLength - px * size * 0.58,
            ny * wakeLength - py * size * 0.58,
          );
        }

        if (visual.snagMark !== "none") {
          const anchorAngle = visual.orientationRadians + (visual.snagMark === "roots" ? 0.9 : -0.7);
          const anchor = {
            x: Math.cos(anchorAngle) * size * 1.75,
            y: Math.sin(anchorAngle) * size * 1.75,
          };
          p.noFill();
          p.stroke(withAlpha(visual.snagMark === "roots" ? PALETTE.marsh : PALETTE.coral, 235));
          p.strokeWeight(1.35 / camera.zoom);
          if (visual.snagMark === "roots") {
            p.line(0, 0, anchor.x, anchor.y);
            p.line(anchor.x, anchor.y, anchor.x - size * 0.46, anchor.y + size * 0.33);
            p.line(anchor.x, anchor.y, anchor.x + size * 0.38, anchor.y + size * 0.42);
          } else {
            p.beginShape();
            p.vertex(0, 0);
            p.vertex(anchor.x * 0.35 - size * 0.2, anchor.y * 0.35);
            p.vertex(anchor.x * 0.68 + size * 0.18, anchor.y * 0.68);
            p.vertex(anchor.x, anchor.y);
            p.endShape();
          }
        }

        if (highlighted || parcel.recovery === "reachable") {
          p.noFill();
          p.stroke(withAlpha(
            parcel.recovery === "reachable" ? PALETTE.foam : visual.accent,
            highlighted ? 230 : 115,
          ));
          p.strokeWeight((highlighted ? 1.6 : 0.9) / camera.zoom);
          p.circle(0, 0, size * (highlighted ? 3.05 : 2.6));
        }

        p.rotate(tumble);
        p.rectMode(p.CENTER);
        p.stroke(withAlpha(visual.outline, 245));
        p.strokeWeight(1.15 / camera.zoom);
        p.fill(withAlpha(visual.fill, parcel.recoverable ? 244 : 155));
        switch (visual.silhouette) {
          case "bundle":
            p.beginShape();
            p.vertex(0, -size * 0.58);
            p.vertex(size * 0.62, -size * 0.12);
            p.vertex(size * 0.48, size * 0.54);
            p.vertex(-size * 0.5, size * 0.54);
            p.vertex(-size * 0.64, -size * 0.12);
            p.endShape(p.CLOSE);
            break;
          case "crate":
            p.rect(0, 0, size * 1.2, size * 1.02, size * 0.08);
            p.line(-size * 0.48, -size * 0.36, size * 0.48, size * 0.36);
            break;
          case "case":
            p.rect(0, size * 0.06, size * 1.28, size * 0.84, size * 0.2);
            p.noFill();
            p.arc(0, -size * 0.38, size * 0.58, size * 0.46, p.PI, p.TWO_PI);
            break;
          case "sealed-case":
            p.rect(0, 0, size * 1.3, size * 0.94, size * 0.12);
            p.fill(withAlpha(PALETTE.violet, 250));
            p.circle(0, 0, size * 0.34);
            p.noFill();
            p.line(-size * 0.65, 0, -size * 0.19, 0);
            p.line(size * 0.19, 0, size * 0.65, 0);
            break;
        }

        p.noFill();
        p.stroke(withAlpha(PALETTE.ink, 225));
        p.strokeWeight(1.2 / camera.zoom);
        switch (visual.conditionMark) {
          case "none": break;
          case "slash":
            p.line(-size * 0.42, size * 0.34, size * 0.42, -size * 0.34);
            break;
          case "crack":
            p.beginShape();
            p.vertex(-size * 0.34, -size * 0.38);
            p.vertex(-size * 0.08, -size * 0.06);
            p.vertex(-size * 0.2, size * 0.12);
            p.vertex(size * 0.36, size * 0.4);
            p.endShape();
            break;
          case "cross":
            p.line(-size * 0.42, -size * 0.36, size * 0.42, size * 0.36);
            p.line(-size * 0.42, size * 0.36, size * 0.42, -size * 0.36);
            break;
        }

        if (visual.wetMark) {
          p.noStroke();
          p.fill(withAlpha(PALETTE.sky, 235));
          p.circle(size * 0.47, -size * 0.43, size * 0.22);
          p.circle(-size * 0.36, size * 0.4, size * 0.14);
        }
        if (visual.contaminationMarks > 0) {
          p.noStroke();
          p.fill(withAlpha(PALETTE.violet, 230));
          for (let mark = 0; mark < visual.contaminationMarks; mark += 1) {
            p.circle(
              (mark - (visual.contaminationMarks - 1) / 2) * size * 0.3,
              size * 0.62,
              size * 0.12,
            );
          }
        }
        if (parcel.impactMark !== "none") {
          p.noFill();
          p.stroke(withAlpha(PALETTE.coral, 230));
          p.strokeWeight(1 / camera.zoom);
          for (let ray = 0; ray < 4; ray += 1) {
            const angle = ray * p.HALF_PI + visual.orientationRadians;
            p.line(
              Math.cos(angle) * size * 0.75,
              Math.sin(angle) * size * 0.75,
              Math.cos(angle) * size * 1.05,
              Math.sin(angle) * size * 1.05,
            );
          }
        }
        p.pop();

        if (!highlighted) continue;
        const label = looseCargoRecoveryLabel(parcel, coarsePointer);
        p.push();
        p.resetMatrix();
        p.textAlign(p.CENTER, p.CENTER);
        p.textStyle(p.BOLD);
        p.textSize(11);
        const labelWidth = Math.min(260, p.textWidth(label) + 18);
        p.rectMode(p.CENTER);
        p.fill(withAlpha(PALETTE.ink, 238));
        p.stroke(withAlpha(visual.outline, 210));
        p.strokeWeight(1);
        p.rect(screen.x, screen.y + 27, labelWidth, 21, 6);
        p.noStroke();
        p.fill(withAlpha(PALETTE.foam, 248));
        p.text(label, screen.x, screen.y + 26.5, labelWidth - 10, 19);
        p.pop();
      }
    };

    const wayknotColor = (kind: WayknotKind): string => {
      switch (kind) {
        case "reed-mat": return PALETTE.amber;
        case "tide-anchor": return PALETTE.sky;
        case "wind-knot": return PALETTE.violet;
      }
    };

    const drawTideHarps = (view: TideweftView, now: number): void => {
      const tileSize = view.terrain.tileSize;
      const geometry = tideHarpGeometryFor(
        view.tideHarps,
        Math.max(tileSize * 0.105, 1.4 / camera.zoom),
      );
      const context = p.drawingContext as CanvasRenderingContext2D;
      for (const harp of geometry) {
        p.push();
        context.shadowColor = PALETTE.violet;
        context.shadowBlur = harp.active ? 13 : 4;
        clearDash();
        for (const string of harp.strings) {
          // A dark casing keeps all three strings readable in monochrome and
          // on top of any terrain hue; unlike Waychords these bow and never
          // use cross-ties.
          p.noFill();
          p.stroke(withAlpha(PALETTE.ink, harp.active ? 230 : 196));
          p.strokeWeight((harp.active ? 4.1 : 3.4) / camera.zoom);
          p.bezier(
            string.from.x,
            string.from.y,
            string.control.x,
            string.control.y,
            string.control.x,
            string.control.y,
            string.to.x,
            string.to.y,
          );
          p.stroke(withAlpha(PALETTE.foam, harp.active ? 232 : 148));
          p.strokeWeight((string.stringIndex === 0 ? 1.3 : 0.9) / camera.zoom);
          p.bezier(
            string.from.x,
            string.from.y,
            string.control.x,
            string.control.y,
            string.control.x,
            string.control.y,
            string.to.x,
            string.to.y,
          );
        }
        p.pop();

        const noteSize = tileSize * (harp.active ? 0.34 : 0.28);
        p.push();
        p.translate(harp.center.x, harp.center.y);
        if (harp.active) {
          // Six fixed sounding marks make activity legible without color or
          // animation. The harp remains fully recognizable when inactive.
          p.noFill();
          p.stroke(withAlpha(PALETTE.foam, 220));
          p.strokeWeight(1.2 / camera.zoom);
          p.circle(0, 0, noteSize * 3.15);
          for (let mark = 0; mark < 6; mark += 1) {
            const angle = mark * p.TWO_PI / 6;
            p.line(
              Math.cos(angle) * noteSize * 1.72,
              Math.sin(angle) * noteSize * 1.72,
              Math.cos(angle) * noteSize * 2.08,
              Math.sin(angle) * noteSize * 2.08,
            );
          }
        }
        p.rotate(Math.PI / 4);
        p.rectMode(p.CENTER);
        p.fill(withAlpha(PALETTE.ink, 236));
        p.stroke(withAlpha(PALETTE.violet, harp.active ? 248 : 190));
        p.strokeWeight((harp.active ? 1.8 : 1.2) / camera.zoom);
        p.rect(0, 0, noteSize * 1.8, noteSize * 1.8, noteSize * 0.18);
        p.stroke(withAlpha(PALETTE.foam, harp.active ? 240 : 184));
        p.strokeWeight(0.8 / camera.zoom);
        for (const offset of [-0.38, 0, 0.38]) {
          p.line(-noteSize * 0.72, noteSize * offset, noteSize * 0.72, noteSize * offset);
          p.line(noteSize * offset, -noteSize * 0.72, noteSize * offset, noteSize * 0.72);
        }
        p.pop();

        if (
          view.perception
          && !isDirectlyDetailPerceived(view.terrain, harp.center, true)
        ) continue;
        const labelScreen = worldLabelScreen(
          `tide-harp-${harp.id}`,
          { x: harp.center.x, y: harp.center.y + noteSize * 2.15 },
          now,
        );
        p.push();
        p.resetMatrix();
        p.textAlign(p.CENTER, p.CENTER);
        p.textStyle(p.BOLD);
        p.textSize(8);
        const labelWidth = p.textWidth(harp.label) + 10;
        p.noStroke();
        p.rectMode(p.CENTER);
        p.fill(withAlpha(PALETTE.ink, 218));
        p.rect(labelScreen.x, labelScreen.y, labelWidth, 13, 4);
        p.fill(withAlpha(PALETTE.foam, harp.active ? 245 : 184));
        p.text(harp.label, labelScreen.x, labelScreen.y - 0.2);
        p.pop();
      }
      clearDash();
    };

    const drawWaychords = (view: TideweftView): void => {
      const tileSize = view.terrain.tileSize;
      const railHalfWidth = Math.max(tileSize * 0.075, 1.2 / camera.zoom);
      const chords = buildWaychords(view.wayknots);
      for (const chord of chords) {
        const leftFrom = {
          x: chord.from.x + chord.normal.x * railHalfWidth,
          y: chord.from.y + chord.normal.y * railHalfWidth,
        };
        const leftTo = {
          x: chord.to.x + chord.normal.x * railHalfWidth,
          y: chord.to.y + chord.normal.y * railHalfWidth,
        };
        const rightFrom = {
          x: chord.from.x - chord.normal.x * railHalfWidth,
          y: chord.from.y - chord.normal.y * railHalfWidth,
        };
        const rightTo = {
          x: chord.to.x - chord.normal.x * railHalfWidth,
          y: chord.to.y - chord.normal.y * railHalfWidth,
        };
        p.noFill();
        clearDash();
        p.stroke(withAlpha(PALETTE.ink, 205));
        p.strokeWeight(4.6 / camera.zoom);
        p.line(leftFrom.x, leftFrom.y, leftTo.x, leftTo.y);
        p.line(rightFrom.x, rightFrom.y, rightTo.x, rightTo.y);
        p.stroke(withAlpha(PALETTE.foam, 172));
        p.strokeWeight(1.15 / camera.zoom);
        p.line(leftFrom.x, leftFrom.y, leftTo.x, leftTo.y);
        p.line(rightFrom.x, rightFrom.y, rightTo.x, rightTo.y);

        const bindings = buildWaychordBindings(
          chord,
          Math.max(tileSize * 0.7, 10 / camera.zoom),
          railHalfWidth,
          18,
        );
        p.stroke(withAlpha(PALETTE.coral, 205));
        p.strokeWeight(1.35 / camera.zoom);
        for (const binding of bindings) {
          p.line(binding.left.x, binding.left.y, binding.right.x, binding.right.y);
        }
        const diamond = Math.max(tileSize * 0.12, 2.5 / camera.zoom);
        p.push();
        p.translate(chord.midpoint.x, chord.midpoint.y);
        p.noStroke();
        p.fill(withAlpha(PALETTE.ink, 235));
        p.rotate(Math.PI / 4);
        p.rectMode(p.CENTER);
        p.rect(0, 0, diamond * 2, diamond * 2, diamond * 0.25);
        p.fill(withAlpha(PALETTE.foam, 225));
        p.rect(0, 0, diamond, diamond, diamond * 0.18);
        p.pop();
      }
      clearDash();
    };

    const drawWayknotMotif = (
      wayknot: WayknotView,
      tileSize: number,
      now: number,
    ): void => {
      const size = tileSize * (wayknot.active ? 0.68 : 0.58);
      const color = wayknotColor(wayknot.kind);
      const orientation = (stringHash(wayknot.id) / 4_294_967_295) * p.TWO_PI;
      p.push();
      p.translate(wayknot.position.x, wayknot.position.y);

      if (wayknot.active && wayknot.influenceRadius > 0) {
        p.noFill();
        p.stroke(withAlpha(color, 54));
        p.strokeWeight(1.05 / camera.zoom);
        setDash(
          [5 / camera.zoom, 8 / camera.zoom],
          reducedMotion ? 0 : -now * 0.004,
        );
        p.circle(0, 0, wayknot.influenceRadius * 2);
        clearDash();
        for (let tick = 0; tick < 4; tick += 1) {
          const angle = tick * p.HALF_PI;
          const halfTick = Math.min(
            wayknot.influenceRadius * 0.18,
            2.5 / camera.zoom,
          );
          const inner = Math.max(0, wayknot.influenceRadius - halfTick);
          const outer = wayknot.influenceRadius + halfTick;
          p.line(
            Math.cos(angle) * inner,
            Math.sin(angle) * inner,
            Math.cos(angle) * outer,
            Math.sin(angle) * outer,
          );
        }
      }

      p.rotate(orientation);
      p.strokeWeight(Math.max(0.8, 1.3 / camera.zoom));
      switch (wayknot.kind) {
        case "reed-mat": {
          p.rectMode(p.CENTER);
          p.noStroke();
          p.fill(withAlpha(PALETTE.ink, wayknot.active ? 210 : 190));
          p.rect(0, 0, size * 1.12, size * 0.86, size * 0.12);
          for (let slat = -2; slat <= 2; slat += 1) {
            const y = slat * size * 0.16;
            p.stroke(withAlpha(color, wayknot.active ? 238 : 200));
            p.strokeWeight(size * 0.105);
            p.line(-size * 0.48, y, size * 0.48, y);
          }
          p.stroke(withAlpha(PALETTE.foam, wayknot.active ? 196 : 170));
          p.strokeWeight(size * 0.075);
          for (const x of [-0.28, 0, 0.28]) {
            p.line(x * size, -size * 0.4, x * size, size * 0.4);
          }
          break;
        }
        case "tide-anchor": {
          p.noFill();
          p.stroke(withAlpha(PALETTE.foam, wayknot.active ? 228 : 180));
          p.strokeWeight(size * 0.085);
          p.line(0, -size * 0.22, 0, size * 0.36);
          p.arc(0, size * 0.18, size * 0.7, size * 0.65, 0.08, p.PI - 0.08);
          p.line(-size * 0.35, size * 0.2, -size * 0.43, size * 0.04);
          p.line(size * 0.35, size * 0.2, size * 0.43, size * 0.04);
          p.stroke(withAlpha(color, wayknot.active ? 245 : 205));
          p.fill(withAlpha(PALETTE.ink, 220));
          p.circle(0, -size * 0.3, size * 0.38);
          p.noStroke();
          p.fill(withAlpha(color, wayknot.active ? 245 : 205));
          p.rectMode(p.CENTER);
          p.rect(0, -size * 0.3, size * 0.5, size * 0.1, size * 0.04);
          break;
        }
        case "wind-knot": {
          p.stroke(withAlpha(PALETTE.foam, wayknot.active ? 225 : 180));
          p.strokeWeight(size * 0.08);
          p.line(-size * 0.18, size * 0.43, -size * 0.18, -size * 0.48);
          p.noStroke();
          p.fill(withAlpha(color, wayknot.active ? 240 : 200));
          p.beginShape();
          p.vertex(-size * 0.15, -size * 0.46);
          p.vertex(size * 0.5, -size * 0.26);
          p.vertex(size * 0.2, -size * 0.03);
          p.vertex(-size * 0.15, -size * 0.14);
          p.endShape(p.CLOSE);
          p.stroke(withAlpha(PALETTE.coral, wayknot.active ? 220 : 180));
          p.strokeWeight(size * 0.055);
          const flutter = reducedMotion ? 0 : Math.sin(now * 0.004 + orientation) * size * 0.055;
          p.line(size * 0.2, -size * 0.03, size * 0.46, size * 0.18 + flutter);
          p.line(size * 0.06, -size * 0.08, size * 0.22, size * 0.27 - flutter);
          break;
        }
      }
      p.pop();

    };

    const drawWayknots = (view: TideweftView, now: number): void => {
      drawWaychords(view);
      for (const wayknot of view.wayknots) {
        drawWayknotMotif(wayknot, view.terrain.tileSize, now);
        if (
          view.perception
          && !isDirectlyDetailPerceived(view.terrain, wayknot.position, true)
        ) continue;
        const size = view.terrain.tileSize * (wayknot.active ? 0.68 : 0.58);
        const screen = worldLabelScreen(
          `wayknot-${wayknot.id}`,
          { x: wayknot.position.x, y: wayknot.position.y + size * 0.78 + 8 / camera.zoom },
          now,
        );
        const color = wayknotColor(wayknot.kind);
        p.push();
        p.resetMatrix();
        p.textAlign(p.CENTER, p.CENTER);
        p.textStyle(p.BOLD);
        p.textSize(8.5);
        const width = p.textWidth(wayknot.label) + 9;
        p.noStroke();
        p.rectMode(p.CENTER);
        p.fill(withAlpha(PALETTE.ink, wayknot.active ? 220 : 205));
        p.rect(screen.x, screen.y, width, 13, 4);
        p.fill(withAlpha(color, wayknot.active ? 245 : 210));
        p.text(wayknot.label, screen.x, screen.y - 0.25);
        p.pop();
      }
    };

    const settlementStatusColor = (status: SettlementStatus): string => {
      switch (status) {
        case "steady":
          return PALETTE.tide;
        case "watchful":
          return PALETTE.warning;
        case "strained":
          return PALETTE.danger;
        case "recovering":
          return PALETTE.violet;
        case "evacuating":
          return PALETTE.coral;
      }
    };

    const drawSettlementGlyph = (glyph: SettlementGlyph, radius: number): void => {
      switch (glyph) {
        case "harbor":
          p.arc(0, 0, radius * 1.18, radius * 1.18, 0, p.PI);
          p.line(0, -radius * 0.62, 0, radius * 0.5);
          p.line(-radius * 0.38, -radius * 0.08, radius * 0.38, -radius * 0.08);
          break;
        case "workshop":
          p.rectMode(p.CENTER);
          p.rect(0, 0, radius * 0.92, radius * 0.92, radius * 0.12);
          p.line(-radius * 0.28, radius * 0.28, radius * 0.28, -radius * 0.28);
          break;
        case "garden":
          p.ellipse(-radius * 0.18, 0, radius * 0.48, radius * 0.82);
          p.ellipse(radius * 0.18, 0, radius * 0.48, radius * 0.82);
          p.line(0, -radius * 0.36, 0, radius * 0.42);
          break;
        case "relay":
          p.line(0, radius * 0.52, 0, -radius * 0.42);
          p.arc(0, -radius * 0.16, radius * 0.82, radius * 0.82, p.PI * 1.16, p.PI * 1.84);
          p.arc(0, -radius * 0.16, radius * 1.24, radius * 1.24, p.PI * 1.2, p.PI * 1.8);
          break;
        case "hearth":
        default:
          p.beginShape();
          for (let index = 0; index < 6; index += 1) {
            const angle = p.TWO_PI * (index / 6) - p.HALF_PI;
            p.vertex(Math.cos(angle) * radius * 0.5, Math.sin(angle) * radius * 0.5);
          }
          p.endShape(p.CLOSE);
          break;
      }
    };

    const drawSettlements = (settlements: readonly SettlementView[], now: number): void => {
      const context = p.drawingContext as CanvasRenderingContext2D;
      for (const settlement of settlements) {
        if (settlement.discovered === false) continue;
        const currentVisibility = currentSettlementVisibility(
          settlement,
          latestView?.perception !== undefined,
        );
        const directlyVisible = currentVisibility >= 1;
        const hovered = directlyVisible
          && hoverTarget?.entity === "settlement"
          && hoverTarget.id === settlement.id;
        // Selection is a live interaction state. A settlement remembered on
        // the Chart must not keep pulsing as selected after it leaves direct
        // perception, because that leaks both focus and current status.
        const selected = directlyVisible && Boolean(settlement.selected || hovered);
        const statusColor = directlyVisible
          ? settlementStatusColor(settlement.status)
          : PALETTE.foam;
        const radius = (
          directlyVisible
            ? 8.5 + Math.sqrt(Math.max(0, settlement.population)) * 0.5
            : 9.5
        ) / camera.zoom;
        const pulse = reducedMotion ? 0 : Math.sin(now * 0.0023 + settlement.position.x) * 0.5 + 0.5;
        const halo = radius * (
          directlyVisible
            ? 2.7 + pulse * unit(settlement.connection) * 0.35
            : 2.35
        );

        p.push();
        p.translate(settlement.position.x, settlement.position.y);
        p.noStroke();
        p.fill(withAlpha(
          statusColor,
          directlyVisible ? 12 + unit(settlement.connection) * 28 : currentVisibility > 0 ? 8 : 3,
        ));
        p.circle(0, 0, halo * 2);

        context.save();
        context.shadowColor = statusColor;
        context.shadowBlur = selected ? 20 : 10;
        p.fill(withAlpha(PALETTE.ink, 238));
        p.stroke(withAlpha(PALETTE.foam, directlyVisible ? 225 : currentVisibility > 0 ? 90 : 36));
        p.strokeWeight((selected ? 2.2 : 1.25) / camera.zoom);
        p.circle(0, 0, radius * 2.1);
        context.restore();

        if (directlyVisible) {
          p.noFill();
          p.stroke(withAlpha(statusColor, 235));
          p.strokeWeight(1.7 / camera.zoom);
          setDash(lineDashForStatus(settlement.status, 1 / camera.zoom), reducedMotion ? 0 : -now * 0.008);
          p.circle(0, 0, radius * 2.95);
          clearDash();
        }

        p.stroke(withAlpha(PALETTE.foam, 235));
        p.strokeWeight(1.15 / camera.zoom);
        p.noFill();
        drawSettlementGlyph(directlyVisible ? settlement.glyph ?? "hearth" : "hearth", radius);
        p.pop();

        // The glyph is durable geographic memory; its name and live Promise
        // badge require the shorter exact-detail field.
        if (!directlyVisible) continue;
        const screen = worldLabelScreen(`settlement-${settlement.id}`, settlement.position, now);
        const labelY = screen.y + radius * camera.zoom + 15;
        p.push();
        p.resetMatrix();
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(selected ? 12.5 : 11.5);
        p.textStyle(selected ? p.BOLD : p.NORMAL);
        const nameWidth = p.textWidth(settlement.name) + 16;
        p.noStroke();
        p.fill(withAlpha(PALETTE.ink, directlyVisible ? (selected ? 232 : 198) : 116));
        p.rectMode(p.CENTER);
        p.rect(screen.x, labelY, nameWidth, 21, 8);
        p.fill(withAlpha(PALETTE.foam, directlyVisible ? 255 : 96));
        p.text(settlement.name, screen.x, labelY - 0.5);
        if (directlyVisible && settlement.promiseCount && settlement.promiseCount > 0) {
          p.fill(statusColor);
          p.circle(screen.x + nameWidth / 2 - 3, labelY - 8, 7);
        }
        p.pop();
      }
      clearDash();
    };

    const porterStateColor = (porter: PorterView): string => {
      switch (porter.state) {
        case "helping":
          return PALETTE.tide;
        case "stranded":
          return PALETTE.danger;
        case "waiting":
          return PALETTE.warning;
        case "listening":
          return PALETTE.amber;
        case "watching":
          return PALETTE.warning;
        case "alert":
          return PALETTE.danger;
        case "searching":
          return PALETTE.violet;
        case "resting":
          return PALETTE.violet;
        case "traveling":
        default:
          return porter.cargoColor ?? PALETTE.foam;
      }
    };

    const drawPorters = (porters: readonly PorterView[], now: number): void => {
      for (const porter of porters) {
        if (
          latestView?.perception
          && !isDirectlyDetailPerceived(latestView.terrain, porter.position, true)
        ) continue;
        const appearance = porterAppearancePresentation(porter);
        const stateColor = porterStateColor(porter);
        const hovered = hoverTarget?.entity === "porter" && hoverTarget.id === porter.id;
        const radius = (porter.selected || hovered ? 6.2 : 4.8) / camera.zoom;
        const length = radius * appearance.heightScale;
        const breadth = radius * appearance.widthScale;
        p.push();
        p.translate(porter.position.x, porter.position.y);
        p.rotate(porter.facing);
        p.noStroke();
        p.fill(withAlpha(PALETTE.ink, 220));
        p.ellipse(0, 0, length * 3, breadth * 3);
        if (appearance.wetness > 0.02) {
          p.noFill();
          p.stroke(withAlpha(PALETTE.tide, 45 + appearance.wetness * 150));
          p.strokeWeight((0.7 + appearance.wetness * 0.9) / camera.zoom);
          p.ellipse(0, 0, length * 3.45, breadth * 3.45);
          p.noStroke();
        }
        p.fill(appearance.color);
        p.triangle(length * 1.2, 0, -length * 0.75, -breadth * 0.72, -length * 0.75, breadth * 0.72);
        p.fill(withAlpha(porter.cargoColor ?? stateColor, 220));
        p.rectMode(p.CENTER);
        p.rect(-length * 0.9, 0, length * 0.72, breadth * 0.88, radius * 0.12);
        p.pop();

        const quickLabel = porterQuickLabel(
          porter,
          Boolean((porter.selected || hovered) && !porter.speech),
        );
        if (quickLabel || porter.speech || porter.emotionMark) {
          const screen = worldLabelScreen(`porter-${porter.id}`, porter.position, now);
          p.push();
          p.resetMatrix();
          p.textAlign(p.CENTER, p.CENTER);
          p.textSize(10.5);
          p.noStroke();
          if (porter.speech) {
            const charactersPerLine = Math.max(
              8,
              Math.min(p.width < 440 ? 22 : 30, Math.floor((p.width - 32) / 6.5)),
            );
            const lines = [
              ...(porter.emotionMark ? [porter.emotionMark] : []),
              ...wrapPorterSpeech(porter.speech, charactersPerLine),
            ];
            const lineHeight = 13;
            const width = Math.min(
              Math.max(1, p.width - 16),
              Math.max(1, ...lines.map((line) => p.textWidth(line))) + 14,
            );
            const height = lines.length * lineHeight + 10;
            const placement = clampPorterSpeechPlacement(
              screen,
              { width, height },
              { width: p.width, height: p.height },
              18,
              8,
            );
            const textX = placement.x + width / 2;
            const textTop = placement.y + 5 + lineHeight / 2;
            for (let index = 0; index < lines.length; index += 1) {
              const line = lines[index];
              if (line === undefined) continue;
              const textY = textTop + index * lineHeight;
              p.fill(withAlpha(PALETTE.ink, 235));
              p.text(line, textX + 1, textY + 1);
              p.fill(PALETTE.foam);
              p.text(line, textX, textY);
            }
          } else if (porter.emotionMark) {
            const emotionX = clamp(screen.x, 8, Math.max(8, p.width - 8));
            const emotionY = clamp(screen.y - 20, 10, Math.max(10, p.height - 10));
            p.fill(withAlpha(PALETTE.ink, 235));
            p.text(porter.emotionMark, emotionX + 1, emotionY + 1);
            p.fill(PALETTE.foam);
            p.text(porter.emotionMark, emotionX, emotionY);
          }
          if (quickLabel) {
            const width = Math.min(p.width - 16, p.textWidth(quickLabel) + 12);
            const labelX = clamp(screen.x, 8 + width / 2, Math.max(8 + width / 2, p.width - 8 - width / 2));
            const labelY = clamp(screen.y + 20, 11, Math.max(11, p.height - 11));
            p.fill(withAlpha(PALETTE.ink, 235));
            p.text(quickLabel, labelX + 1, labelY + 0.5);
            p.fill(PALETTE.foam);
            p.text(quickLabel, labelX, labelY - 0.5);
          }
          p.pop();
        }
      }
    };

    const drawDogs = (dogs: readonly DogView[], now: number): void => {
      const hoveredDogId = hoverTarget?.entity === "living-actor"
        && hoverTarget.species === "domestic-dog"
        ? hoverTarget.id
        : null;

      for (const dog of dogs) {
        if (
          latestView?.perception
          && !isDirectlyDetailPerceived(latestView.terrain, dog.position, true)
        ) continue;
        const highlighted = dog.selected || dog.actorId === hoveredDogId;
        const coat = DOG_COAT_COLORS[dog.coat.primary];
        const secondary = dog.coat.secondary === null
          ? coat
          : DOG_COAT_COLORS[dog.coat.secondary];
        const wetness = unit(dog.wetness / 1_000_000);
        const coatVolume = dog.coat.length === "short"
          ? 0.94
          : dog.coat.length === "medium"
            ? 1
            : 1.08;
        const scale = (highlighted ? 5.5 : 4.7) * dog.sizeScale / camera.zoom;
        const resting = dog.behavior === "rest";
        const bodyLength = scale * 2.7;
        const bodyHeight = scale * (resting ? 0.88 : 1.08) * coatVolume;
        const headRadius = scale * 0.72 * coatVolume;
        const headX = bodyLength * 0.53;
        const footY = bodyHeight * 0.68;
        const tuckedTail = dog.behavior === "avoid-human" || dog.behavior === "retreat";

        p.push();
        p.translate(dog.position.x, dog.position.y);
        p.rotate(dog.facing);
        if (highlighted) {
          p.noFill();
          p.stroke(withAlpha(PALETTE.tide, 205));
          p.strokeWeight(1.25 / camera.zoom);
          p.ellipse(0, 0, bodyLength * 1.95, scale * 3.05);
        }

        p.stroke(withAlpha(PALETTE.ink, 235));
        p.strokeWeight(Math.max(0.85, scale * 0.16));
        const tailY = tuckedTail ? bodyHeight * 0.78 : -bodyHeight * 0.52;
        p.line(-bodyLength * 0.48, 0, -bodyLength * 0.83, tailY);
        if (!resting) {
          for (const legX of [-bodyLength * 0.28, bodyLength * 0.28]) {
            p.line(legX, bodyHeight * 0.22, legX - scale * 0.08, footY);
          }
        }

        p.noStroke();
        p.fill(withAlpha(PALETTE.ink, 235));
        p.ellipse(0, 0, bodyLength * 1.12, bodyHeight * 1.34);
        p.circle(headX, -bodyHeight * 0.12, headRadius * 2.34);
        p.fill(coat);
        p.ellipse(0, 0, bodyLength, bodyHeight);
        p.circle(headX, -bodyHeight * 0.12, headRadius * 2);
        p.fill(secondary);
        if (dog.coat.secondary !== null && dog.coat.pattern !== "solid") {
          p.ellipse(bodyLength * 0.18, -bodyHeight * 0.04, bodyLength * 0.28, bodyHeight * 0.72);
        }
        p.ellipse(headX + headRadius * 0.63, -bodyHeight * 0.04, headRadius * 0.86, headRadius * 0.58);
        p.fill(withAlpha(PALETTE.ink, 235));
        p.triangle(
          headX - headRadius * 0.38,
          -headRadius * 0.78,
          headX + headRadius * 0.04,
          -headRadius * 0.62,
          headX - headRadius * 0.05,
          -headRadius * 0.14,
        );

        if (dog.conditionLabels.includes("INJURED") && !resting) {
          p.stroke(withAlpha(PALETTE.coral, 225));
          p.strokeWeight(Math.max(0.65, scale * 0.12));
          p.line(-bodyLength * 0.3, bodyHeight * 0.43, -bodyLength * 0.15, bodyHeight * 0.52);
          p.noStroke();
        }
        if (wetness > 0.02) {
          p.noFill();
          p.stroke(withAlpha(PALETTE.sky, 35 + wetness * 115));
          p.strokeWeight((0.55 + wetness * 0.65) / camera.zoom);
          p.ellipse(0, 0, bodyLength * 1.08, bodyHeight * 1.18);
          p.circle(headX, -bodyHeight * 0.12, headRadius * 2.17);
        }
        p.pop();

        if (!highlighted) continue;
        const screen = worldLabelScreen(`dog-${dog.actorId}`, dog.position, now);
        const observableCondition = dog.conditionLabels
          .slice(0, 2)
          .map((label) => label.toLocaleLowerCase())
          .join(" · ");
        const label = observableCondition.length > 0
          ? `${dog.quickLabel} · ${observableCondition}`
          : dog.quickLabel;
        const width = Math.min(Math.max(1, p.width - 16), p.textWidth(label) + 12);
        const labelX = clamp(
          screen.x,
          8 + width / 2,
          Math.max(8 + width / 2, p.width - 8 - width / 2),
        );
        const labelY = clamp(screen.y + 19, 11, Math.max(11, p.height - 11));
        p.push();
        p.resetMatrix();
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(10.5);
        p.noStroke();
        p.fill(withAlpha(PALETTE.ink, 235));
        p.text(label, labelX + 1, labelY + 0.5);
        p.fill(PALETTE.foam);
        p.text(label, labelX, labelY - 0.5);
        p.pop();
      }
    };

    const drawChartGulls = (actor: WildlifeView, base: number, now: number): void => {
      const visible = Math.min(5, Math.max(1, actor.groupSize ?? 1));
      const flap = reducedMotion ? 0.2 : Math.sin(now * 0.006) * 0.32;
      for (let index = 0; index < visible; index += 1) {
        const column = index % 3;
        const row = Math.floor(index / 3);
        const x = (column - 1) * base * 1.75 + row * base * 0.6;
        const y = (row - 0.35) * base * 1.4 + (column % 2) * base * 0.25;
        p.push();
        p.translate(x, y);
        p.noFill();
        p.stroke(withAlpha(PALETTE.ink, 235));
        p.strokeWeight(Math.max(1, base * 0.42));
        p.line(-base * 1.05, flap * base, 0, -base * 0.18);
        p.line(0, -base * 0.18, base * 1.05, flap * base);
        p.stroke(PALETTE.foam);
        p.strokeWeight(Math.max(0.55, base * 0.23));
        p.line(-base * 1.02, flap * base, 0, -base * 0.18);
        p.line(0, -base * 0.18, base * 1.02, flap * base);
        p.pop();
      }
    };

    const drawChartDeer = (actor: WildlifeView, base: number): void => {
      const fleeing = actor.behavior === "flee" || actor.behavior === "retreat";
      const bodyLength = base * 3.15;
      const bodyHeight = base * 1.2;
      const headX = bodyLength * 0.48;
      const headY = -bodyHeight * 0.52;
      const headRadius = base * 0.58;
      p.stroke(withAlpha(PALETTE.ink, 235));
      p.strokeWeight(Math.max(0.8, base * 0.16));
      for (const legX of [-bodyLength * 0.34, bodyLength * 0.34]) {
        p.line(legX, bodyHeight * 0.22, legX + (fleeing ? -base * 0.3 : 0), bodyHeight * 0.9);
      }
      p.noStroke();
      p.fill(withAlpha(PALETTE.ink, 235));
      p.ellipse(0, 0, bodyLength * 1.08, bodyHeight * 1.22);
      p.circle(headX, headY, headRadius * 2.25);
      p.fill("#9b7550");
      p.ellipse(0, 0, bodyLength, bodyHeight);
      p.fill("#ad8258");
      p.circle(headX, headY, headRadius * 2);
      p.fill("#eee1c7");
      p.triangle(
        -bodyLength * 0.52,
        -bodyHeight * 0.12,
        -bodyLength * 0.67,
        -bodyHeight * (fleeing ? 0.7 : 0.36),
        -bodyLength * 0.42,
        -bodyHeight * 0.38,
      );
      p.fill("#ad8258");
      p.triangle(
        headX - headRadius * 0.25,
        headY - headRadius * 0.68,
        headX - headRadius * 0.75,
        headY - headRadius * 1.2,
        headX - headRadius * 0.05,
        headY - headRadius * 0.48,
      );
      p.triangle(
        headX + headRadius * 0.12,
        headY - headRadius * 0.65,
        headX + headRadius * 0.55,
        headY - headRadius * 1.18,
        headX + headRadius * 0.45,
        headY - headRadius * 0.42,
      );
    };

    const drawChartBlackBear = (actor: WildlifeView, base: number): void => {
      const fleeing = actor.behavior === "flee" || actor.behavior === "retreat";
      const guarding = actor.behavior === "guard" || actor.behavior === "watch";
      const bodyLength = base * 3.9;
      const bodyHeight = base * 1.75;
      const headX = bodyLength * 0.48;
      const headY = -bodyHeight * 0.08;
      const headRadius = base * 0.82;
      p.stroke(withAlpha(PALETTE.ink, 235));
      p.strokeWeight(Math.max(0.8, base * 0.16));
      for (const legX of [-bodyLength * 0.31, bodyLength * 0.31]) {
        p.line(legX, bodyHeight * 0.22, legX + (fleeing ? -base * 0.3 : 0), bodyHeight * 0.9);
      }
      p.noStroke();
      p.fill(withAlpha(PALETTE.ink, 235));
      p.ellipse(0, 0, bodyLength * 1.08, bodyHeight * 1.22);
      p.circle(headX, headY, headRadius * 2.25);
      p.fill("#292a24");
      p.ellipse(0, 0, bodyLength, bodyHeight);
      p.fill("#332f27");
      p.circle(headX, headY, headRadius * 2);
      p.fill("#292a24");
      p.circle(headX - headRadius * 0.55, headY - headRadius * 0.62, headRadius * 0.62);
      p.circle(headX + headRadius * 0.22, headY - headRadius * 0.72, headRadius * 0.62);
      if (guarding) {
        p.fill(PALETTE.amber);
        p.circle(headX + headRadius * 0.62, headY - headRadius * 0.12, Math.max(1.2, base * 0.18));
      }
    };

    const drawChartDomesticCat = (actor: WildlifeView, base: number): void => {
      const fleeing = actor.behavior === "flee" || actor.behavior === "retreat";
      const watching = actor.behavior === "guard" || actor.behavior === "watch";
      const bodyLength = base * 3.35;
      const bodyHeight = base * 1.08;
      const headX = bodyLength * 0.48;
      const headY = -bodyHeight * 0.3;
      const headRadius = base * 0.62;
      p.noFill();
      p.stroke(withAlpha(PALETTE.ink, 235));
      p.strokeWeight(Math.max(0.9, base * 0.22));
      p.bezier(
        -bodyLength * 0.48,
        -bodyHeight * 0.12,
        -bodyLength * 0.92,
        -bodyHeight * 0.82,
        -bodyLength * 0.76,
        -bodyHeight * 1.52,
        -bodyLength * 0.45,
        -bodyHeight * 1.2,
      );
      for (const legX of [-bodyLength * 0.27, bodyLength * 0.25]) {
        p.line(legX, bodyHeight * 0.2, legX + (fleeing ? -base * 0.36 : 0), bodyHeight * 0.92);
      }
      p.noStroke();
      p.fill(withAlpha(PALETTE.ink, 240));
      p.ellipse(0, 0, bodyLength * 1.08, bodyHeight * 1.24);
      p.circle(headX, headY, headRadius * 2.25);
      p.fill("#706152");
      p.ellipse(0, 0, bodyLength, bodyHeight);
      p.fill("#8b7762");
      p.circle(headX, headY, headRadius * 2);
      p.triangle(
        headX - headRadius * 0.72,
        headY - headRadius * 0.46,
        headX - headRadius * 0.55,
        headY - headRadius * 1.18,
        headX - headRadius * 0.04,
        headY - headRadius * 0.5,
      );
      p.triangle(
        headX + headRadius * 0.05,
        headY - headRadius * 0.5,
        headX + headRadius * 0.48,
        headY - headRadius * 1.18,
        headX + headRadius * 0.68,
        headY - headRadius * 0.42,
      );
      p.stroke(watching ? PALETTE.amber : "#c7bc8c");
      p.strokeWeight(Math.max(0.55, base * 0.12));
      p.line(headX + headRadius * 0.3, headY, headX + headRadius * 1.05, headY - headRadius * 0.18);
      p.line(headX + headRadius * 0.3, headY + headRadius * 0.12, headX + headRadius * 1.08, headY + headRadius * 0.26);
    };

    const drawChartMarshRabbit = (
      actor: WildlifeView,
      base: number,
      now: number,
    ): void => {
      const bounding = actor.behavior === "flee" || actor.behavior === "alarm";
      const lift = reducedMotion || !bounding
        ? 0
        : Math.abs(Math.sin(now * 0.01)) * base * 0.52;
      const bodyLength = base * 2.72;
      const bodyHeight = base * 1.18;
      const headX = bodyLength * 0.44;
      const headY = -bodyHeight * 0.38 - lift * 0.12;
      const headRadius = base * 0.56;

      p.translate(0, -lift);
      p.stroke(withAlpha(PALETTE.ink, 240));
      p.strokeWeight(Math.max(0.8, base * 0.16));
      p.line(-bodyLength * 0.26, bodyHeight * 0.25, -bodyLength * 0.5, bodyHeight * 0.72);
      p.line(bodyLength * 0.28, bodyHeight * 0.24, bodyLength * 0.48, bodyHeight * 0.7);
      p.noStroke();
      p.fill(withAlpha(PALETTE.ink, 240));
      p.ellipse(-bodyLength * 0.08, 0, bodyLength * 1.1, bodyHeight * 1.28);
      p.circle(headX, headY, headRadius * 2.28);
      p.fill("#816b52");
      p.ellipse(-bodyLength * 0.08, 0, bodyLength, bodyHeight);
      p.circle(headX, headY, headRadius * 2);
      p.fill("#a98a65");
      for (const offset of [-0.26, 0.2]) {
        p.triangle(
          headX + headRadius * offset - headRadius * 0.21,
          headY - headRadius * 0.55,
          headX + headRadius * offset,
          headY - headRadius * 1.96,
          headX + headRadius * offset + headRadius * 0.25,
          headY - headRadius * 0.5,
        );
      }
      p.fill("#eee3ca");
      p.circle(-bodyLength * 0.58, -bodyHeight * 0.08, base * 0.72);
    };

    const drawChartMarshFox = (
      actor: WildlifeView,
      base: number,
      now: number,
    ): void => {
      const stalking = actor.behavior === "pursue" || actor.behavior === "scavenge";
      const running = stalking || actor.behavior === "flee" || actor.behavior === "retreat";
      const stride = reducedMotion || !running ? 0 : Math.sin(now * 0.012) * base * 0.34;
      const bodyLength = base * 3.72;
      const bodyHeight = base * (stalking ? 0.88 : 1.08);
      const headX = bodyLength * 0.49;
      const headY = -bodyHeight * 0.3;
      const headRadius = base * 0.63;

      p.noFill();
      p.stroke(withAlpha(PALETTE.ink, 240));
      p.strokeWeight(Math.max(1.1, base * 0.3));
      p.bezier(
        -bodyLength * 0.46,
        -bodyHeight * 0.02,
        -bodyLength * 0.88,
        bodyHeight * 0.18,
        -bodyLength * 1.06,
        bodyHeight * 0.64,
        -bodyLength * 0.72,
        bodyHeight * 0.7,
      );
      p.strokeWeight(Math.max(0.8, base * 0.15));
      p.line(-bodyLength * 0.28, bodyHeight * 0.22, -bodyLength * 0.3 + stride, bodyHeight * 0.86);
      p.line(bodyLength * 0.29, bodyHeight * 0.22, bodyLength * 0.31 - stride, bodyHeight * 0.86);
      p.noStroke();
      p.fill(withAlpha(PALETTE.ink, 240));
      p.ellipse(0, 0, bodyLength * 1.08, bodyHeight * 1.24);
      p.circle(headX, headY, headRadius * 2.25);
      p.fill("#9d5136");
      p.ellipse(0, 0, bodyLength, bodyHeight);
      p.circle(headX, headY, headRadius * 2);
      p.fill("#b96a43");
      p.triangle(
        headX - headRadius * 0.72,
        headY - headRadius * 0.42,
        headX - headRadius * 0.5,
        headY - headRadius * 1.34,
        headX - headRadius * 0.02,
        headY - headRadius * 0.46,
      );
      p.triangle(
        headX + headRadius * 0.02,
        headY - headRadius * 0.48,
        headX + headRadius * 0.44,
        headY - headRadius * 1.3,
        headX + headRadius * 0.68,
        headY - headRadius * 0.38,
      );
      p.fill("#d8c7a7");
      p.triangle(
        headX + headRadius * 0.48,
        headY - headRadius * 0.12,
        headX + headRadius * 1.28,
        headY + headRadius * 0.1,
        headX + headRadius * 0.42,
        headY + headRadius * 0.42,
      );
    };

    const drawChartWildlifeActor = (
      actor: WildlifeView,
      base: number,
      now: number,
    ): boolean => {
      switch (actor.species) {
        case "deer":
          drawChartDeer(actor, base);
          return true;
        case "gull":
          drawChartGulls(actor, base, now);
          return true;
        case "black-bear":
          drawChartBlackBear(actor, base);
          return true;
        case "domestic-cat":
          drawChartDomesticCat(actor, base);
          return true;
        case "marsh-rabbit":
          drawChartMarshRabbit(actor, base, now);
          return true;
        case "marsh-fox":
          drawChartMarshFox(actor, base, now);
          return true;
      }
    };

    const drawAggregateWildlifeEvidence = (
      evidenceViews: readonly AggregateWildlifeEvidenceView[],
      now: number,
    ): void => {
      const hovered = hoverTarget?.entity === "aggregate-wildlife-evidence"
        ? hoverTarget
        : null;
      for (const evidence of evidenceViews) {
        if (
          latestView?.perception
          && !isDirectlyDetailPerceived(latestView.terrain, evidence.position, true)
        ) continue;
        const highlighted = evidence.selected
          || (hovered?.aggregateId === evidence.aggregateId
            && hovered.evidenceId === evidence.evidenceId);
        const base = (highlighted ? 5.4 : 4.7)
          * clamp(evidence.sizeScale, 0.55, 1.4)
          / camera.zoom;

        p.push();
        p.translate(evidence.position.x, evidence.position.y);
        if (highlighted) {
          p.noFill();
          p.stroke(withAlpha(PALETTE.tide, 205));
          p.strokeWeight(1.2 / camera.zoom);
          p.circle(0, 0, base * 5.2);
        }
        switch (evidence.form) {
          case "gnaw-marks":
            p.noStroke();
            p.fill(withAlpha(PALETTE.ink, 230));
            p.ellipse(0, 0, base * 3.35, base * 1.3);
            p.fill("#76563e");
            p.ellipse(0, 0, base * 3.05, base * 1.06);
            p.stroke("#dec29b");
            p.strokeWeight(Math.max(0.7, base * 0.13));
            for (const offset of [-0.65, -0.2, 0.25, 0.7]) {
              p.line(
                base * offset,
                -base * 0.46,
                base * (offset - 0.18),
                base * 0.38,
              );
            }
            break;
          case "small-tracks":
            p.noFill();
            p.stroke(withAlpha(PALETTE.ink, 235));
            p.strokeWeight(Math.max(0.75, base * 0.14));
            p.line(-base * 1.45, base * 0.64, base * 1.45, -base * 0.64);
            p.noStroke();
            p.fill("#9b8067");
            for (let index = 0; index < 4; index += 1) {
              const x = (index - 1.5) * base * 0.82;
              const y = (index % 2 === 0 ? 0.3 : -0.3) * base;
              p.ellipse(x, y, base * 0.48, base * 0.34);
              p.circle(x + base * 0.26, y - base * 0.22, base * 0.18);
            }
            break;
          case "paired-tracks":
            p.noStroke();
            p.fill(withAlpha(PALETTE.ink, 230));
            for (const [x, y, length, width] of [
              [-0.72, 0.42, 0.68, 0.34],
              [-0.56, -0.38, 0.68, 0.34],
              [0.48, 0.24, 0.42, 0.25],
              [0.62, -0.22, 0.42, 0.25],
            ] as const) {
              p.ellipse(base * x, base * y, base * length, base * width);
            }
            p.stroke("#c7ad86");
            p.strokeWeight(Math.max(0.65, base * 0.11));
            p.line(-base * 1.25, base * 0.82, base * 1.25, -base * 0.62);
            break;
          case "canid-pawprints":
            p.noStroke();
            for (const step of [-0.62, 0.62]) {
              const x = step * base;
              const y = -step * base * 0.46;
              p.fill(withAlpha(PALETTE.ink, 235));
              p.ellipse(x, y, base * 0.58, base * 0.48);
              p.fill("#9b8067");
              for (const [toeX, toeY] of [
                [-0.28, -0.37],
                [-0.09, -0.5],
                [0.11, -0.5],
                [0.3, -0.35],
              ] as const) {
                p.circle(x + toeX * base, y + toeY * base, base * 0.2);
              }
            }
            p.stroke("#d0b694");
            p.strokeWeight(Math.max(0.65, base * 0.1));
            p.line(-base * 1.45, base * 0.7, base * 1.45, -base * 0.7);
            break;
          case "shelter-sign":
            p.noStroke();
            p.fill("#70563f");
            p.triangle(
              -base * 1.75,
              base * 0.72,
              0,
              -base * 1.18,
              base * 1.75,
              base * 0.72,
            );
            p.fill(withAlpha(PALETTE.ink, 245));
            p.ellipse(0, base * 0.34, base * 1.45, base * 1.05);
            p.stroke("#b28e68");
            p.strokeWeight(Math.max(0.7, base * 0.12));
            p.line(-base * 1.55, base * 0.82, -base * 0.78, base * 0.45);
            p.line(base * 1.55, base * 0.82, base * 0.78, base * 0.45);
            break;
        }
        p.pop();

        if (!highlighted) continue;
        const screen = worldLabelScreen(
          `aggregate-wildlife-evidence-${evidence.evidenceId}`,
          evidence.position,
          now,
        );
        const label = `${evidence.quickLabel} · ${evidence.evidenceLabel.toLocaleLowerCase("en-US")}`;
        const width = Math.min(Math.max(1, p.width - 16), p.textWidth(label) + 12);
        const labelX = clamp(
          screen.x,
          8 + width / 2,
          Math.max(8 + width / 2, p.width - 8 - width / 2),
        );
        const labelY = clamp(screen.y + 19, 11, Math.max(11, p.height - 11));
        p.push();
        p.resetMatrix();
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(10.5);
        p.noStroke();
        p.fill(withAlpha(PALETTE.ink, 235));
        p.text(label, labelX + 1, labelY + 0.5);
        p.fill(PALETTE.foam);
        p.text(label, labelX, labelY - 0.5);
        p.pop();
      }
    };

    const drawWildlife = (actors: readonly WildlifeView[], now: number): void => {
      const hovered = hoverTarget?.entity === "living-actor" ? hoverTarget : null;
      for (const actor of actors) {
        if (
          latestView?.perception
          && !isDirectlyDetailPerceived(latestView.terrain, actor.position, true)
        ) continue;
        const highlighted = Boolean(actor.selected)
          || (hovered?.species === actor.species && hovered.id === actor.actorId);
        const base = (highlighted ? 6 : 5.2) * actor.sizeScale / camera.zoom;

        p.push();
        p.translate(actor.position.x, actor.position.y);
        p.rotate(actor.facing);
        if (highlighted) {
          p.noFill();
          p.stroke(withAlpha(PALETTE.tide, 205));
          p.strokeWeight(1.25 / camera.zoom);
          p.ellipse(0, 0, base * 6.2, base * 3.9);
        }

        const rendered = drawChartWildlifeActor(actor, base, now);
        p.pop();

        if (!rendered || !highlighted) continue;
        const screen = worldLabelScreen(`wildlife-${actor.actorId}`, actor.position, now);
        const condition = actor.conditionLabels.slice(0, 2)
          .map((label) => label.toLocaleLowerCase())
          .join(" · ");
        const label = condition.length > 0
          ? `${actor.quickLabel} · ${condition}`
          : actor.quickLabel;
        const width = Math.min(Math.max(1, p.width - 16), p.textWidth(label) + 12);
        const labelX = clamp(screen.x, 8 + width / 2, Math.max(8 + width / 2, p.width - 8 - width / 2));
        const labelY = clamp(screen.y + 20, 11, Math.max(11, p.height - 11));
        p.push();
        p.resetMatrix();
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(10.5);
        p.noStroke();
        p.fill(withAlpha(PALETTE.ink, 235));
        p.text(label, labelX + 1, labelY + 0.5);
        p.fill(PALETTE.foam);
        p.text(label, labelX, labelY - 0.5);
        p.pop();
      }
    };

    const drawDestination = (view: TideweftView, now: number): void => {
      const destination = view.player.destination;
      if (!destination) return;
      const radius = (7 + (reducedMotion ? 0 : Math.sin(now * 0.005) * 1.2)) / camera.zoom;
      p.push();
      p.translate(destination.x, destination.y);
      p.noFill();
      p.stroke(withAlpha(PALETTE.amber, 210));
      p.strokeWeight(1.4 / camera.zoom);
      setDash([2 / camera.zoom, 3 / camera.zoom]);
      p.circle(0, 0, radius * 2.2);
      clearDash();
      p.line(-radius, 0, radius, 0);
      p.line(0, -radius, 0, radius);
      if (view.player.destinationLabel) {
        const label = view.player.destinationLabel;
        const screen = worldLabelScreen("journey-destination", destination, now);
        p.push();
        p.resetMatrix();
        p.textAlign(p.CENTER, p.CENTER);
        p.textStyle(p.BOLD);
        p.textSize(10);
        const labelWidth = p.textWidth(label) + 14;
        const labelY = screen.y - radius * camera.zoom * 2.45;
        p.noStroke();
        p.fill(withAlpha(PALETTE.ink, 224));
        p.rectMode(p.CENTER);
        p.rect(screen.x, labelY, labelWidth, 18, 5);
        p.fill(withAlpha(PALETTE.amber, 246));
        p.text(label, screen.x, labelY + 0.2);
        p.rectMode(p.CORNER);
        p.pop();
      }
      p.pop();
    };

    const drawSweptCurrent = (
      view: TideweftView,
      radius: number,
      wakeIntensity: number,
    ): void => {
      const player = view.player;
      if (player.mode !== "swept") return;
      const wakeLength = radius * (3.1 + unit(wakeIntensity) * 1.25);
      p.push();
      p.translate(player.position.x, player.position.y);
      p.rotate(player.facing);
      p.noFill();
      p.stroke(withAlpha(PALETTE.ink, 205));
      p.strokeWeight(4.6 / camera.zoom);
      clearDash();
      p.arc(0, 0, radius * 4.8, radius * 3.5, -p.PI * 0.72, p.PI * 0.72);
      p.stroke(withAlpha(PALETTE.sky, 218));
      p.strokeWeight(1.25 / camera.zoom);
      p.arc(0, 0, radius * 4.8, radius * 3.5, -p.PI * 0.72, p.PI * 0.72);
      setDash([2 / camera.zoom, 3.4 / camera.zoom], 0);
      p.arc(0, 0, radius * 6.25, radius * 4.7, p.PI * 0.28, p.PI * 1.72);
      clearDash();
      p.stroke(withAlpha(PALETTE.foam, 168));
      p.line(-radius * 0.9, -radius * 0.5, -wakeLength, -radius * 1.15);
      p.line(-radius * 0.9, radius * 0.5, -wakeLength, radius * 1.15);
      p.line(-wakeLength * 0.72, -radius * 0.9, -wakeLength * 0.9, 0);
      p.line(-wakeLength * 0.72, radius * 0.9, -wakeLength * 0.9, 0);
      p.pop();
    };

    const drawAdriftText = (
      view: TideweftView,
      presentation: AdriftPresentation,
      now: number,
    ): void => {
      const anchor = worldLabelScreen("player-adrift", view.player.position, now);
      const compact = p.width <= 704 || p.height <= 544;
      const x = clamp(anchor.x, compact ? 104 : 136, p.width - (compact ? 104 : 136));
      const y = clamp(anchor.y - (compact ? 30 : 38), compact ? 70 : 62, p.height - 86);
      const context = p.drawingContext as CanvasRenderingContext2D;
      p.push();
      p.resetMatrix();
      p.textAlign(p.CENTER, p.CENTER);
      p.noStroke();
      context.save();
      context.shadowColor = "rgba(0, 0, 0, 0.96)";
      context.shadowBlur = 5;
      p.textStyle(p.BOLD);
      p.textSize(compact ? 11 : 12);
      p.fill(presentation.edgeColor);
      p.text(presentation.label, x, y);
      p.textStyle(p.NORMAL);
      p.textSize(compact ? 8.5 : 9.5);
      p.fill(withAlpha(PALETTE.foam, 238));
      p.text(presentation.instruction, x, y + (compact ? 13 : 15));
      if (
        presentation.soundSyllable
        && Math.floor(now / (reducedMotion ? 900 : 560)) % 3 === 0
      ) {
        p.textStyle(p.BOLD);
        p.textSize(compact ? 8 : 9);
        p.fill(withAlpha(presentation.bodyColor, 210));
        p.text(presentation.soundSyllable, x + (compact ? 76 : 96), y + 5);
      }
      context.restore();
      p.pop();
    };

    const drawPlayerBalanceMark = (
      presentation: PlayerBalancePresentation,
      radius: number,
    ): void => {
      p.push();
      p.noFill();
      p.stroke(presentation.outline);
      p.strokeWeight(1.25 / camera.zoom);
      switch (presentation.mark) {
        case "keel":
          p.line(-radius * 0.48, 0, radius * 0.5, 0);
          p.line(radius * 0.18, -radius * 0.22, radius * 0.5, 0);
          p.line(radius * 0.18, radius * 0.22, radius * 0.5, 0);
          break;
        case "counterweight":
          p.line(-radius * 0.52, -radius * 0.66, -radius * 0.52, radius * 0.66);
          p.circle(-radius * 0.52, -radius * 0.66, radius * 0.2);
          p.circle(-radius * 0.52, radius * 0.66, radius * 0.2);
          break;
        case "skid":
          p.line(-radius * 1.55, -radius * 0.5, -radius * 0.55, -radius * 0.28);
          p.line(-radius * 1.42, radius * 0.38, -radius * 0.48, radius * 0.2);
          break;
        case "impact":
          for (const angle of [0, p.HALF_PI, p.PI, p.PI + p.HALF_PI]) {
            p.line(
              Math.cos(angle) * radius * 0.88,
              Math.sin(angle) * radius * 0.88,
              Math.cos(angle) * radius * 1.38,
              Math.sin(angle) * radius * 1.38,
            );
          }
          break;
        case "eddy":
          p.arc(0, 0, radius * 2.8, radius * 2.25, -p.PI * 0.2, p.PI * 1.18);
          p.line(radius * 1.05, radius * 0.36, radius * 1.36, radius * 0.58);
          break;
        case "rise":
          p.line(-radius * 0.55, radius * 0.34, 0, -radius * 0.28);
          p.line(0, -radius * 0.28, radius * 0.55, radius * 0.34);
          p.line(0, -radius * 0.28, 0, -radius * 0.92);
          break;
      }
      p.pop();
    };

    const drawPlayerSilhouette = (
      presentation: PlayerBalancePresentation,
      player: TideweftView["player"],
      radius: number,
    ): void => {
      p.stroke(presentation.outline);
      p.strokeWeight(1.35 / camera.zoom);
      p.fill(withAlpha(presentation.fill, 238));
      if (player.mode === "skiff") {
        p.beginShape();
        p.vertex(radius * 1.55, 0);
        p.vertex(-radius * 0.8, -radius * 0.72);
        p.vertex(-radius * 1.15, 0);
        p.vertex(-radius * 0.8, radius * 0.72);
        p.endShape(p.CLOSE);
      } else {
        switch (presentation.silhouette) {
          case "upright":
            p.ellipse(0, 0, radius * 2.08, radius * 1.95);
            break;
          case "leaning":
            p.ellipse(radius * 0.1, 0, radius * 2.25, radius * 1.48);
            break;
          case "off-step":
            p.ellipse(radius * 0.3, 0, radius * 2.38, radius * 1.26);
            p.circle(-radius * 0.78, radius * 0.58, radius * 0.38);
            break;
          case "low":
            p.ellipse(0, 0, radius * 2.82, radius * 0.82);
            break;
          case "afloat":
            p.ellipse(0, 0, radius * 2.52, radius * 1.36);
            break;
          case "rising":
            p.ellipse(-radius * 0.08, 0, radius * 1.7, radius * 2.12);
            break;
        }
      }

      if (presentation.silhouette !== "low" && presentation.silhouette !== "afloat") {
        p.noStroke();
        p.fill(presentation.outline);
        p.triangle(
          radius * 1.15,
          0,
          radius * 0.36,
          -radius * 0.3,
          radius * 0.36,
          radius * 0.3,
        );
      }
      drawPlayerBalanceMark(presentation, radius);
    };

    const drawPlayerIncident = (view: TideweftView, now: number): void => {
      const incident = view.player.incident;
      if (!incident || typeof incident.id !== "string" || incident.id.length === 0) return;
      const presentation = playerBalancePresentation(view.player.balanceState);
      const variant = Number.isSafeInteger(incident.variantSeed)
        ? ((incident.variantSeed % 3) + 3) % 3 - 1
        : 0;
      const courier = worldLabelScreen(`incident-${incident.id}`, view.player.position, now);
      const compact = p.width <= 704 || (p.height <= 544 && p.width <= 1_024);
      const label = incident.label;
      p.push();
      p.resetMatrix();
      p.textAlign(p.CENTER, p.CENTER);
      p.textStyle(p.BOLD);
      p.textSize(compact ? 10 : 11);
      const desiredWidth = Math.min(compact ? 226 : 310, p.textWidth(label) + 22);
      const placed = placeIncidentCallout(
        { x: courier.x + variant * 3, y: courier.y },
        desiredWidth,
        {
          width: p.width,
          height: p.height,
          safeTop: compact ? 76 : 70,
          safeBottom: compact ? 92 : 58,
          compact,
        },
      );
      const progress = unit(incident.progress);
      const alpha = 246 - Math.trunc(progress * 38);
      const connectorY = placed.y + (placed.aboveCourier ? 11 : -11);
      p.stroke(withAlpha(presentation.fill, alpha * 0.82));
      p.strokeWeight(1);
      p.line(placed.x, connectorY, courier.x, courier.y);
      p.rectMode(p.CENTER);
      p.fill(withAlpha(PALETTE.ink, alpha));
      p.stroke(withAlpha(presentation.fill, alpha));
      p.strokeWeight(1.2);
      p.rect(placed.x, placed.y, placed.width, 22, 5);
      p.noStroke();
      p.fill(withAlpha(presentation.outline, alpha));
      p.text(label, placed.x, placed.y - 0.5, placed.width - 12, 18);
      p.pop();
    };

    const drawPlayer = (view: TideweftView, now: number): void => {
      const player = view.player;
      const adrift = player.adrift
        ? adriftPresentation({
            modeActive: player.mode === "swept",
            paddling: player.adrift.paddling,
            catchingBreath: player.adrift.catchingBreath,
            canStand: player.adrift.canStand,
            stamina: player.stamina,
            velocity: player.velocity,
            currentDirection: player.adrift.currentDirection,
          })
        : undefined;
      const basePresentation = playerBalancePresentation(player.balanceState);
      const presentation: PlayerBalancePresentation = adrift
        ? { ...basePresentation, fill: adrift.bodyColor, outline: adrift.edgeColor }
        : basePresentation;
      const position = player.position;
      const radius = 7.2 / camera.zoom;
      const stability = unit(player.stability, 1);
      const loadRatio = clamp(player.cargoLoad / Math.max(1, player.cargoCapacity), 0, 1.5);
      const sway = reducedMotion
        ? 0
        : Math.sin(now * (player.mode === "swept" ? 0.0022 : 0.005))
          * (player.mode === "swept" ? 0.08 : (1 - stability) * 0.18);
      const balanceLean = presentation.leanRadians;
      const bodyRotation = player.facing + sway + balanceLean;
      const context = p.drawingContext as CanvasRenderingContext2D;

      drawDestination(view, now);
      drawSweptCurrent(view, radius, adrift?.wakeIntensity ?? 0.4);
      p.push();
      const adriftBob = adrift && !reducedMotion
        ? Math.sin(now * 0.0042) * radius * adrift.bobIntensity * 0.22
        : 0;
      p.translate(position.x, position.y + adriftBob);
      p.rotate(bodyRotation);

      context.save();
      context.shadowColor = presentation.fill;
      context.shadowBlur = 12 + presentation.haloScale * 6;
      p.noStroke();
      p.fill(withAlpha(presentation.fill, player.mode === "swept" ? 52 : 35));
      p.circle(0, 0, radius * 4.4 * presentation.haloScale);
      context.restore();

      const cargoShown = Math.min(4, player.cargo.length);
      for (let index = 0; index < cargoShown; index += 1) {
        const cargo = player.cargo[index];
        if (!cargo) continue;
        const angle = ((index - (cargoShown - 1) / 2) * 0.48) + p.PI;
        const distance = radius * (1.15 + loadRatio * 0.28);
        p.push();
        p.translate(Math.cos(angle) * distance, Math.sin(angle) * distance);
        p.rotate(-bodyRotation);
        p.rectMode(p.CENTER);
        p.noStroke();
        p.fill(withAlpha(cargo.color ?? PALETTE.amber, 235));
        p.rect(0, 0, radius * 0.68, radius * 0.68, radius * 0.12);
        if (cargo.condition < 0.5) {
          p.stroke(withAlpha(PALETTE.ink, 170));
          p.strokeWeight(0.8 / camera.zoom);
          p.line(-radius * 0.22, radius * 0.22, radius * 0.22, -radius * 0.22);
        }
        p.pop();
      }

      drawPlayerSilhouette(presentation, player, radius);
      if (adrift?.pose === "stroke" || adrift?.pose === "reach") {
        const strokeSide = Math.sin(now * 0.012) >= 0 ? 1 : -1;
        p.noFill();
        p.stroke(withAlpha(adrift.edgeColor, 242));
        p.strokeWeight(1.35 / camera.zoom);
        p.line(
          -radius * 0.15,
          strokeSide * radius * 0.18,
          radius * (adrift.pose === "reach" ? 1.85 : 1.35),
          strokeSide * radius * (adrift.pose === "reach" ? 0.42 : 0.9),
        );
      }
      if (player.bracing === true && player.mode !== "swept") {
        // A held brace is a planted physical pose, not merely a recolor. The
        // four feet remain legible against every biome and at low contrast.
        p.noFill();
        p.stroke(withAlpha(PALETTE.amber, 248));
        p.strokeWeight(1.45 / camera.zoom);
        const inner = radius * 1.55;
        const outer = radius * 2.1;
        for (const angle of [0, p.HALF_PI, p.PI, p.PI + p.HALF_PI]) {
          p.line(
            Math.cos(angle) * inner,
            Math.sin(angle) * inner,
            Math.cos(angle) * outer,
            Math.sin(angle) * outer,
          );
        }
      }
      if (player.mode === "wading") {
        p.noFill();
        p.stroke(withAlpha(PALETTE.sky, 238));
        p.strokeWeight(1 / camera.zoom);
        p.arc(0, radius * 0.48, radius * 2.8, radius * 0.92, p.PI, p.TWO_PI);
        p.line(-radius * 1.14, radius * 0.51, -radius * 0.54, radius * 0.51);
        p.line(radius * 0.54, radius * 0.51, radius * 1.14, radius * 0.51);
      }

      p.noFill();
      p.stroke(withAlpha(stability < 0.3 ? PALETTE.danger : PALETTE.tide, 235));
      p.strokeWeight(1.8 / camera.zoom);
      p.arc(0, 0, radius * 3.3, radius * 3.3, -p.HALF_PI, -p.HALF_PI + p.TWO_PI * unit(player.stamina));
      p.pop();

      if (adrift) drawAdriftText(view, adrift, now);

      if (player.scanProgress !== undefined && player.scanProgress > 0.001) {
        drawScanRing(position, unit(player.scanProgress), 220);
      }
    };

    const drawScanRing = (point: WorldPoint, progress: number, alpha = 180): void => {
      const eased = 1 - Math.pow(1 - unit(progress), 3);
      const radius = (22 + eased * 150) / camera.zoom;
      p.push();
      p.translate(point.x, point.y);
      p.noFill();
      p.stroke(withAlpha(PALETTE.tide, alpha * (1 - eased)));
      p.strokeWeight((2.2 - eased * 1.4) / camera.zoom);
      p.circle(0, 0, radius * 2);
      p.stroke(withAlpha(PALETTE.foam, alpha * 0.45 * (1 - eased)));
      p.strokeWeight(0.7 / camera.zoom);
      p.circle(0, 0, radius * 1.82);
      p.pop();
    };

    const drawRipples = (now: number): void => {
      for (let index = ripples.length - 1; index >= 0; index -= 1) {
        const ripple = ripples[index];
        if (!ripple) continue;
        const progress = (now - ripple.startedAt) / (reducedMotion ? 420 : 1_250);
        if (progress >= 1) {
          ripples.splice(index, 1);
          continue;
        }
        drawScanRing(ripple.point, progress);
      }
    };

    const drawParticles = (particles: readonly ParticleView[]): void => {
      p.noStroke();
      for (const particle of particles) {
        if (
          latestView?.perception
          && !isDirectlyDetailPerceived(latestView.terrain, particle.position, true)
        ) continue;
        const life = unit(particle.life, 1);
        const radius = (particle.radius ?? 2.4) / camera.zoom;
        const color = particle.color ?? (particle.kind === "splash" ? PALETTE.sky : PALETTE.tide);
        p.fill(withAlpha(color, life * 190));
        if (particle.kind === "signal") {
          p.noFill();
          p.stroke(withAlpha(color, life * 200));
          p.strokeWeight(1 / camera.zoom);
          p.circle(particle.position.x, particle.position.y, radius * (2 + (1 - life) * 5));
          p.noStroke();
        } else if (particle.kind === "leaf") {
          p.push();
          p.translate(particle.position.x, particle.position.y);
          p.rotate(Math.atan2(particle.velocity?.y ?? 0, particle.velocity?.x ?? 1));
          p.ellipse(0, 0, radius * 2.4, radius);
          p.pop();
        } else {
          p.circle(particle.position.x, particle.position.y, radius * (particle.kind === "spark" ? 1.3 : 2));
        }
      }
    };

    const eventColor = (event: WorldEventView): string => {
      switch (event.kind) {
        case "warning":
          return PALETTE.warning;
        case "delivery":
          return PALETTE.amber;
        case "memory":
          return PALETTE.violet;
        case "repair":
          return PALETTE.coral;
        case "signal":
          return PALETTE.sky;
        case "arrival":
        default:
          return PALETTE.tide;
      }
    };

    const drawEvents = (events: readonly WorldEventView[], now: number): void => {
      for (const event of events) {
        if (!event.position || event.progress >= 1) continue;
        if (
          latestView?.perception
          && !isDirectlyDetailPerceived(latestView.terrain, event.position, true)
        ) continue;
        const screen = worldLabelScreen(`event-${event.id}`, event.position, now);
        const rise = reducedMotion ? 0 : unit(event.progress) * 20;
        const alpha = 255 * (1 - Math.pow(unit(event.progress), 2));
        p.push();
        p.resetMatrix();
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(event.emphasis === "strong" ? 13 : 11);
        p.textStyle(event.emphasis === "strong" ? p.BOLD : p.NORMAL);
        const charactersPerLine = Math.max(12, Math.min(36, Math.floor((p.width - 24) / 7)));
        const lines = wrapPorterSpeech(event.label, charactersPerLine);
        const lineHeight = event.emphasis === "strong" ? 15 : 13;
        const width = Math.min(
          Math.max(1, p.width - 16),
          Math.max(1, ...lines.map((line) => p.textWidth(line))) + 12,
        );
        const height = lines.length * lineHeight + 6;
        const placement = clampPorterSpeechPlacement(
          { x: screen.x, y: screen.y - rise },
          { width, height },
          { width: p.width, height: p.height },
          18,
          8,
        );
        const textX = placement.x + width / 2;
        const textTop = placement.y + 3 + lineHeight / 2;
        p.noStroke();
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index];
          if (line === undefined) continue;
          const textY = textTop + index * lineHeight;
          p.fill(withAlpha(PALETTE.ink, alpha * 0.94));
          p.text(line, textX + 1, textY + 1);
          p.fill(withAlpha(eventColor(event), alpha));
          p.text(line, textX, textY);
        }
        p.pop();
      }
    };

    const drawPointerTarget = (): void => {
      if (!pointerWorld || hoverTarget) return;
      const radius = 5 / camera.zoom;
      p.push();
      p.translate(pointerWorld.x, pointerWorld.y);
      p.noFill();
      p.stroke(withAlpha(PALETTE.foam, 105));
      p.strokeWeight(0.85 / camera.zoom);
      p.circle(0, 0, radius * 2);
      p.pop();
    };

    const drawAurora = (weather: WeatherView, now: number): void => {
      if (weather.kind !== "aurora") return;
      const intensity = unit(weather.intensity);
      p.push();
      p.resetMatrix();
      p.noFill();
      for (let band = 0; band < 3; band += 1) {
        const color = band === 0 ? PALETTE.tide : band === 1 ? PALETTE.violet : PALETTE.sky;
        p.stroke(withAlpha(color, 18 + intensity * 24));
        p.strokeWeight(34 + band * 17);
        p.beginShape();
        for (let x = -40; x <= p.width + 40; x += 36) {
          const movement = reducedMotion ? 0 : now * 0.00018 * (band + 1);
          const y = p.height * (0.1 + band * 0.08) + Math.sin(x * 0.006 + movement) * 23;
          p.vertex(x, y);
        }
        p.endShape();
      }
      p.pop();
    };

    const drawWind = (weather: WeatherView, now: number): void => {
      const threads = buildWindThreadFrame(weather, {
        width: p.width,
        height: p.height,
        now,
        reducedMotion,
      });
      const first = threads[0];
      if (!first) return;
      p.push();
      p.resetMatrix();
      p.noFill();
      p.stroke(withAlpha(PALETTE.foam, first.alpha));
      p.strokeWeight(first.width);
      for (const thread of threads) {
        p.bezier(
          thread.start.x,
          thread.start.y,
          thread.controlA.x,
          thread.controlA.y,
          thread.controlB.x,
          thread.controlB.y,
          thread.end.x,
          thread.end.y,
        );
      }
      p.pop();
    };

    const drawWeather = (weather: WeatherView, now: number): void => {
      const intensity = unit(weather.intensity);
      drawAurora(weather, now);
      if (intensity <= 0.01 || weather.kind === "clear" || weather.kind === "aurora") return;
      p.push();
      p.resetMatrix();
      if (weather.kind === "mist") {
        p.noStroke();
        for (let index = 0; index < 7; index += 1) {
          const drift = reducedMotion ? 0 : ((now * (0.003 + index * 0.0002)) % (p.width + 300));
          const x = ((index * 211 + drift) % (p.width + 300)) - 150;
          const y = p.height * (0.16 + hash01(index, 81) * 0.72);
          p.fill(withAlpha(PALETTE.foam, 7 + intensity * 10));
          p.ellipse(x, y, 360, 120);
        }
      } else {
        const count = Math.floor(22 + intensity * 100);
        const windX = clamp(weather.wind.x, -1, 1);
        const windY = clamp(weather.wind.y, -1, 1);
        p.stroke(withAlpha(PALETTE.sky, 28 + intensity * 75));
        p.strokeWeight(weather.kind === "squall" ? 1.3 : 0.8);
        for (let index = 0; index < count; index += 1) {
          const speed = reducedMotion ? 0 : now * (0.09 + hash01(index, 3) * 0.08);
          const x = (hash01(index, 8) * p.width + speed * windX + index * 17) % (p.width + 80) - 40;
          const y = (hash01(index, 18) * p.height + speed * (0.8 + windY * 0.25)) % (p.height + 80) - 40;
          const length = 5 + intensity * 12;
          p.line(x, y, x + windX * length, y + length * (0.72 + windY * 0.2));
        }
      }
      p.pop();
    };

    const drawPausedVeil = (): void => {
      p.push();
      p.resetMatrix();
      p.noStroke();
      p.fill(withAlpha(PALETTE.ink, 52));
      p.rect(0, 0, p.width, p.height);
      p.textAlign(p.CENTER, p.CENTER);
      p.textSize(11);
      p.textStyle(p.BOLD);
      p.fill(withAlpha(PALETTE.foam, 210));
      p.text("THE TIDE IS HELD", p.width / 2, 24);
      p.pop();
    };

    const drawEmptyEstuary = (now: number): void => {
      p.background(PALETTE.ink);
      p.noFill();
      for (let band = 0; band < 14; band += 1) {
        const amount = band / 13;
        p.stroke(withAlpha(band % 3 === 0 ? PALETTE.tide : PALETTE.channel, 18 + amount * 28));
        p.strokeWeight(band % 3 === 0 ? 1.2 : 0.7);
        p.beginShape();
        for (let x = -30; x <= p.width + 30; x += 24) {
          const motion = reducedMotion ? 0 : now * 0.0003;
          const y = p.height * (0.18 + amount * 0.72) + Math.sin(x * 0.008 + band + motion) * (8 + amount * 19);
          p.vertex(x, y);
        }
        p.endShape();
      }
    };

    const updateCamera = (view: TideweftView, now: number): void => {
      const projection: CameraView = view.camera;
      const projectedCenter = projection.followPlayer ? view.player.position : projection.center;
      const focusActive = camera.focusPoint && now < camera.focusUntil;
      const target = focusActive ? camera.focusPoint! : projectedCenter;
      const targetZoom = clamp(projection.zoom * camera.manualZoom, 0.12, 8);
      if (!camera.initialized || reducedMotion) {
        camera.x = target.x;
        camera.y = target.y;
        camera.zoom = targetZoom;
        camera.initialized = true;
      } else {
        camera.x += (target.x - camera.x) * 0.095;
        camera.y += (target.y - camera.y) * 0.095;
        camera.zoom += (targetZoom - camera.zoom) * 0.085;
      }
      if (!focusActive) camera.focusPoint = undefined;

      const bounds = projection.bounds;
      if (bounds) {
        camera.x = clamp(camera.x, bounds.minX, bounds.maxX);
        camera.y = clamp(camera.y, bounds.minY, bounds.maxY);
      }
    };

    p.setup = (): void => {
      const size = getCanvasSize();
      const renderer = p.createCanvas(size.width, size.height, p.P2D);
      canvasElement = renderer.elt as HTMLCanvasElement;
      canvasElement.classList.add("tideweft-canvas");
      canvasElement.dataset.renderer = "chart-2d";
      canvasElement.tabIndex = 0;
      canvasElement.setAttribute("role", "application");
      canvasElement.setAttribute(
        "aria-label",
        "TIDEWEFT estuary. Use WASD or arrow keys to travel and to paddle while ADRIFT; release movement to float and recover stamina. Space scans, E interacts or recovers a nearby parcel, F ties or tends a Wayknot, T opens the tutorial, and Escape cancels. On touch, tap toward shallow water to paddle while ADRIFT.",
      );
      canvasElement.setAttribute(
        "aria-keyshortcuts",
        "ArrowUp ArrowDown ArrowLeft ArrowRight W A S D Space E F T Escape",
      );
      p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
      p.frameRate(60);
      p.textFont("system-ui, sans-serif");
      p.strokeCap(p.ROUND);
      p.strokeJoin(p.ROUND);
      attachCanvasListeners(canvasElement);
      syncActivePresentation();
      if (!active) p.noLoop();
    };

    p.draw = (): void => {
      if (!active) return;
      const now = performance.now();
      telemetry.recordFrame(now);
      advancePointerParallax(pointerParallax, now, reducedMotion);
      usedLabelPositions.clear();
      latestView = options.getView() ?? null;
      if (!latestView) {
        labelPositions.clear();
        drawEmptyEstuary(now);
        return;
      }

      const spatialEpochObservation = observeSpatialEpoch(latestView);
      if (spatialEpochObservation === "unchanged") updateCamera(latestView, now);
      const terrainMemory = terrainPerceptionMemory.sample({
        terrain: latestView.terrain,
        ...(latestView.spatialEpoch === undefined
          ? {}
          : { spatialEpoch: latestView.spatialEpoch }),
        ...(latestView.worldName === undefined ? {} : { worldName: latestView.worldName }),
        tick: latestView.tick,
        timeMs: now,
        perceptionEnabled: latestView.perception !== undefined,
        reducedMotion,
      });
      p.background(PALETTE.ink);
      p.push();
      p.translate(
        p.width / 2 + pointerParallax.current.x,
        p.height / 2 + pointerParallax.current.y,
      );
      p.scale(camera.zoom);
      p.translate(-camera.x, -camera.y);
      drawTerrain(latestView, terrainMemory);
      drawSurfaceCurrents(latestView, now);
      drawTraces(latestView.traces, now);
      drawRoutes(latestView.routes, now);
      drawChoirs(latestView.choirs, now);
      drawDepthSoundings(latestView, now);
      drawFieldResources(latestView, now);
      drawLooseCargo(latestView, now);
      drawTideHarps(latestView, now);
      drawWayknots(latestView, now);
      drawAggregateWildlifeEvidence(latestView.aggregateWildlifeEvidence ?? [], now);
      drawSettlements(latestView.settlements, now);
      drawPorters(latestView.porters, now);
      drawDogs(latestView.dogs ?? [], now);
      drawWildlife(latestView.wildlife ?? [], now);
      drawParticles(latestView.particles ?? []);
      drawPlayer(latestView, now);
      drawRipples(now);
      drawPointerTarget();
      p.pop();
      drawEvents(latestView.events ?? [], now);
      drawWind(latestView.weather, now);
      drawWeather(latestView.weather, now);
      drawPlayerIncident(latestView, now);
      if (latestView.paused) drawPausedVeil();
      cleanupWorldLabelPositions();
    };
  };

  reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  reducedMotion = reducedMotionQuery.matches;
  const onReducedMotionChange = (event: MediaQueryListEvent): void => {
    reducedMotion = event.matches;
    if (reducedMotion) {
      resetPointerParallax(pointerParallax, true);
      labelPositions.clear();
    }
  };
  reducedMotionQuery.addEventListener("change", onReducedMotionChange);

  instance = new p5(sketch, options.mount);
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      if (!instance) return;
      const size = getCanvasSize();
      if (size.width !== instance.width || size.height !== instance.height) {
        instance.resizeCanvas(size.width, size.height, true);
      }
    });
    resizeObserver.observe(options.mount);
  }

  return {
    canvas: () => canvasElement,
    telemetry: telemetry.getSnapshot,
    isActive: () => active,
    setActive: (nextActive) => {
      if (nextActive) observeCurrentSpatialEpoch();
      if (active === nextActive) {
        syncActivePresentation();
        return;
      }
      if (!nextActive) {
        releaseActiveTouchPointerCaptures();
        clickCandidate = null;
        parcelPress = null;
        touchSequence = EMPTY_LOOSE_CARGO_TOUCH_SEQUENCE;
        heldDirections.clear();
        if (heldBraceKeys.size > 0) options.dispatch({ type: "brace", active: false });
        heldBraceKeys.clear();
        // Also cancels a runtime-owned ADRIFT touch pulse when switching view.
        lastMovement = "0,0";
        options.dispatch({ type: "movement", vector: { x: 0, y: 0 } });
        resetPointerParallax(pointerParallax, true);
        labelPositions.clear();
      }
      active = nextActive;
      telemetry.setActive(active);
      syncActivePresentation();
      if (active) instance?.loop();
      else instance?.noLoop();
    },
    resize: () => {
      if (!instance) return;
      const size = getCanvasSize();
      instance.resizeCanvas(size.width, size.height, true);
    },
    focusWorld: (point, zoom) => {
      observeCurrentSpatialEpoch();
      camera.focusPoint = { ...point };
      camera.focusUntil = performance.now() + (reducedMotion ? 1 : 1_800);
      if (zoom !== undefined) camera.manualZoom = clamp(zoom, 0.58, 2.4);
    },
    pulseScan,
    destroy: () => {
      telemetry.setActive(false);
      releaseActiveTouchPointerCaptures();
      clickCandidate = null;
      parcelPress = null;
      touchSequence = EMPTY_LOOSE_CARGO_TOUCH_SEQUENCE;
      heldDirections.clear();
      if (heldBraceKeys.size > 0) emit({ type: "brace", active: false });
      heldBraceKeys.clear();
      updateMovement();
      resetPointerParallax(pointerParallax, true);
      labelPositions.clear();
      detachCanvasListeners();
      resizeObserver?.disconnect();
      resizeObserver = null;
      if (reducedMotionQuery) {
        reducedMotionQuery.removeEventListener("change", onReducedMotionChange);
      }
      reducedMotionQuery = null;
      instance?.remove();
      instance = null;
      canvasElement = null;
      if (ownsTerrainPerceptionMemory) terrainPerceptionMemory.reset();
    },
  };
}

export type {
  RendererCommand,
  TideweftRendererController,
  TideweftRendererOptions,
  TideweftView,
} from "./types";

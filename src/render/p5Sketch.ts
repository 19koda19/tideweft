import p5 from "p5";

import {
  biomeEnvironmentalEmphasis,
  visibleBiomePresentation,
} from "./biomePresentation";
import { buildSurfaceCurrentCues } from "./currentCues";
import { createTideHarpGeometryMemo } from "./tideHarps";
import { buildWaychordBindings, buildWaychords } from "./wayknots";
import { visibleWaterPresentation } from "./waterPresentation";
import { commandForWorldTap, usesCoarseWorldPointer } from "./worldTap";

import type {
  CameraView,
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

interface HoverTarget {
  entity: "settlement" | "porter" | "route";
  id: string;
}

interface AttachedCanvasListeners {
  element: HTMLCanvasElement;
  pointerDown: (event: PointerEvent) => void;
  pointerMove: (event: PointerEvent) => void;
  pointerLeave: () => void;
  contextMenu: (event: MouseEvent) => void;
  keyDown: (event: KeyboardEvent) => void;
  keyUp: (event: KeyboardEvent) => void;
  blur: () => void;
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
  options: TideweftRendererOptions,
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
  let lastMovement = "0,0";
  const heldDirections = new Set<string>();
  const heldBraceKeys = new Set<string>();
  const ripples: ScanRipple[] = [];
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
    if (active) options.dispatch(command);
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
    x: (point.x - camera.x) * camera.zoom + (instance?.width ?? 0) / 2,
    y: (point.y - camera.y) * camera.zoom + (instance?.height ?? 0) / 2,
  });

  const clientToWorld = (clientX: number, clientY: number): WorldPoint => {
    const rectangle = canvasElement?.getBoundingClientRect();
    if (!rectangle) return { x: camera.x, y: camera.y };
    const localX = clientX - rectangle.left;
    const localY = clientY - rectangle.top;
    return {
      x: (localX - rectangle.width / 2) / camera.zoom + camera.x,
      y: (localY - rectangle.height / 2) / camera.zoom + camera.y,
    };
  };

  const findHoverTarget = (point: WorldPoint): HoverTarget | null => {
    const view = latestView;
    if (!view) return null;
    const settlementRadius = 25 / Math.max(camera.zoom, 0.01);
    let nearest: { target: HoverTarget; distance: number } | null = null;

    for (const settlement of view.settlements) {
      if (settlement.discovered === false) continue;
      const distance = distanceSquared(point, settlement.position);
      if (distance <= settlementRadius * settlementRadius && (!nearest || distance < nearest.distance)) {
        nearest = {
          target: { entity: "settlement", id: settlement.id },
          distance,
        };
      }
    }

    const porterRadius = 16 / Math.max(camera.zoom, 0.01);
    for (const porter of view.porters) {
      const distance = distanceSquared(point, porter.position);
      if (distance <= porterRadius * porterRadius && (!nearest || distance < nearest.distance)) {
        nearest = { target: { entity: "porter", id: porter.id }, distance };
      }
    }

    const routeRadius = 10 / Math.max(camera.zoom, 0.01);
    for (const route of view.routes) {
      const distance = routeDistanceSquared(point, route);
      if (distance <= routeRadius * routeRadius && (!nearest || distance < nearest.distance)) {
        nearest = { target: { entity: "route", id: route.id }, distance };
      }
    }
    return nearest?.target ?? null;
  };

  const pulseScan = (point?: WorldPoint): void => {
    const view = options.getView();
    const origin = point ?? view?.player.position;
    if (!origin) return;
    ripples.push({ point: origin, startedAt: performance.now() });
    if (ripples.length > 4) ripples.shift();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
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
      case "Enter":
        emit({ type: "interact" });
        break;
      case "KeyF":
        event.preventDefault();
        emit({ type: "wayknot" });
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
    element.removeEventListener("pointerleave", attached.pointerLeave);
    element.removeEventListener("contextmenu", attached.contextMenu);
    element.removeEventListener("keydown", attached.keyDown);
    element.removeEventListener("keyup", attached.keyUp);
    element.removeEventListener("blur", attached.blur);
    element.removeEventListener("wheel", attached.wheel);
    attached = null;
  };

  const attachCanvasListeners = (element: HTMLCanvasElement): void => {
    detachCanvasListeners();

    const pointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      element.focus({ preventScroll: true });
      const point = clientToWorld(event.clientX, event.clientY);
      pointerWorld = point;
      const target = findHoverTarget(point);
      const view = latestView;
      if (view) emit(commandForWorldTap(
        view,
        target,
        point,
        usesCoarseWorldPointer(
          event.pointerType,
          window.matchMedia?.("(pointer: coarse)").matches ?? false,
        ),
        event.shiftKey,
      ));
      event.preventDefault();
    };

    const pointerMove = (event: PointerEvent): void => {
      pointerWorld = clientToWorld(event.clientX, event.clientY);
      hoverTarget = findHoverTarget(pointerWorld);
      element.dataset.hoverEntity = hoverTarget?.entity ?? "world";
    };

    const pointerLeave = (): void => {
      hoverTarget = null;
      pointerWorld = null;
      delete element.dataset.hoverEntity;
    };

    const contextMenu = (event: MouseEvent): void => {
      event.preventDefault();
      emit({ type: "cancel" });
    };

    const blur = (): void => {
      heldDirections.clear();
      if (heldBraceKeys.size > 0) emit({ type: "brace", active: false });
      heldBraceKeys.clear();
      updateMovement();
    };

    const wheel = (event: WheelEvent): void => {
      event.preventDefault();
      const before = clientToWorld(event.clientX, event.clientY);
      const factor = Math.exp(-event.deltaY * 0.001);
      camera.manualZoom = clamp(camera.manualZoom * factor, 0.58, 2.4);
      camera.focusPoint = before;
      camera.focusUntil = performance.now() + 700;
    };

    element.addEventListener("pointerdown", pointerDown);
    element.addEventListener("pointermove", pointerMove);
    element.addEventListener("pointerleave", pointerLeave);
    element.addEventListener("contextmenu", contextMenu);
    element.addEventListener("keydown", onKeyDown);
    element.addEventListener("keyup", onKeyUp);
    element.addEventListener("blur", blur);
    element.addEventListener("wheel", wheel, { passive: false });
    attached = {
      element,
      pointerDown,
      pointerMove,
      pointerLeave,
      contextMenu,
      keyDown: onKeyDown,
      keyUp: onKeyUp,
      blur,
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

    const clearDash = (): void => setDash([]);

    const drawPolyline = (points: readonly WorldPoint[]): void => {
      if (points.length < 2) return;
      p.beginShape();
      for (const point of points) p.vertex(point.x, point.y);
      p.endShape();
    };

    const drawTerrainTexture = (
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
      const variant = hash01(column, row, 0x74657874);
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
      const variant = hash01(column, row, 0x6269_6f6d);
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

    const drawTerrain = (view: TideweftView): void => {
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
          if (discovered <= 0) {
            p.fill(PALETTE.ink);
            p.rect(x, y, tileSize + 0.35 / camera.zoom, tileSize + 0.35 / camera.zoom);
            continue;
          }
          p.fill(terrainColor(tile));
          p.rect(x, y, tileSize + 0.35 / camera.zoom, tileSize + 0.35 / camera.zoom);

          const derivedDepth = clamp(view.tide.level * 0.82 - unit(tile.elevation), 0, 1);
          const waterDepth = unit(tile.waterDepth, derivedDepth);
          const water = visibleWaterPresentation(tile, {
            derivedDepth,
            tideLevel: view.tide.level,
          });
          if (water) {
            p.fill(withAlpha(water.color, water.opacity));
            p.rect(x, y, tileSize + 0.4 / camera.zoom, tileSize + 0.4 / camera.zoom);
            if ((column + row) % 3 === 0 && waterDepth < 0.74) {
              p.stroke(withAlpha(water.accentColor, water.accentOpacity));
              p.strokeWeight(0.55 / camera.zoom);
              const inset = tileSize * (0.2 + hash01(column, row, 7) * 0.24);
              p.line(x + inset, y + tileSize * 0.66, x + tileSize - inset * 0.4, y + tileSize * 0.66);
              p.noStroke();
            }
          } else if (hash01(column, row, 13) > 0.78) {
            p.fill(withAlpha(PALETTE.foam, 14 + unit(tile.shelter) * 12));
            const fleck = Math.max(tileSize * 0.08, 0.5 / camera.zoom);
            p.circle(x + tileSize * 0.34, y + tileSize * 0.39, fleck);
          }

          drawTerrainTexture(tile, column, row, x, y, tileSize, waterDepth);
          drawBiomeAccent(tile, column, row, x, y, tileSize);

          const trace = unit(tile.trace);
          if (trace > 0.02) {
            p.stroke(withAlpha(PALETTE.amber, 24 + trace * 72));
            p.strokeWeight((0.45 + trace * 1.2) / camera.zoom);
            p.line(x + tileSize * 0.12, y + tileSize * 0.78, x + tileSize * 0.88, y + tileSize * 0.22);
            p.noStroke();
          }

          if (tile.blocked) {
            p.stroke(withAlpha(PALETTE.ink, 80));
            p.strokeWeight(0.75 / camera.zoom);
            p.line(x + tileSize * 0.18, y + tileSize * 0.18, x + tileSize * 0.82, y + tileSize * 0.82);
            p.line(x + tileSize * 0.82, y + tileSize * 0.18, x + tileSize * 0.18, y + tileSize * 0.82);
            p.noStroke();
          }

          if (discovered < 0.995) {
            p.fill(withAlpha(PALETTE.ink, (1 - discovered) * 238));
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
        bounds,
        focus: { x: camera.x, y: camera.y },
        tideLevel: view.tide.level,
        timeMs: now,
        reducedMotion,
        maxCues: 220,
      });
      if (cues.length === 0) return;

      const strokeCue = (cue: (typeof cues)[number]): void => {
        p.line(cue.tail.x, cue.tail.y, cue.tip.x, cue.tip.y);
        p.line(cue.tip.x, cue.tip.y, cue.headLeft.x, cue.headLeft.y);
        p.line(cue.tip.x, cue.tip.y, cue.headRight.x, cue.headRight.y);
      };
      p.push();
      p.noFill();
      clearDash();
      p.stroke(withAlpha(PALETTE.ink, 186));
      p.strokeWeight(3.2 / camera.zoom);
      for (const cue of cues) strokeCue(cue);
      p.stroke(withAlpha(PALETTE.foam, 198));
      p.strokeWeight(1.15 / camera.zoom);
      for (const cue of cues) strokeCue(cue);
      p.pop();
    };

    const drawDepthSoundings = (view: TideweftView): void => {
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
          if (unit(tile.depthKnown, unit(tile.discovered, 1)) <= 0.08) continue;
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

        const screen = worldToScreen(sounding.point);
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
      p.noFill();
      for (const route of routes) {
        if (route.points.length < 2) continue;
        const color = routeColor(route);
        const condition = unit(route.condition, 1);
        const strength = unit(route.strength);
        const selected = route.selected || (hoverTarget?.entity === "route" && hoverTarget.id === route.id);

        context.save();
        context.shadowColor = color;
        context.shadowBlur = selected ? 18 : 6 + strength * 8;
        p.stroke(withAlpha(PALETTE.ink, 170));
        p.strokeWeight((4.8 + strength * 2.5) / camera.zoom);
        clearDash();
        drawPolyline(route.points);

        p.stroke(withAlpha(color, 90 + condition * 150));
        p.strokeWeight((1.15 + strength * 2.15 + (selected ? 0.7 : 0)) / camera.zoom);
        const reliability = unit(route.reliability, 1);
        if (reliability < 0.82 || route.kind === "wake") {
          const dash = Math.max(2.5, 7 * reliability) / camera.zoom;
          setDash([dash, (3 + (1 - reliability) * 7) / camera.zoom], reducedMotion ? 0 : -now * 0.015);
        } else {
          clearDash();
        }
        drawPolyline(route.points);
        context.restore();

        if (route.directional && route.points.length > 1) {
          const middleIndex = Math.max(1, Math.floor(route.points.length / 2));
          const start = route.points[middleIndex - 1];
          const end = route.points[middleIndex];
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
      for (const choir of choirs) {
        if (choir.routePaths.length === 0 && choir.harborPoints.length === 0) continue;
        const strong = choir.emphasis === "strong";
        const quiet = choir.emphasis === "quiet";
        const alpha = quiet ? 48 : strong ? 168 : 88;
        const salt = stringHash(choir.id);

        // The parallel outline, fixed dotted phrase, and diamond notes preserve
        // the loop's meaning without asking color alone to carry it.
        for (let routeIndex = 0; routeIndex < choir.routePaths.length; routeIndex += 1) {
          const path = choir.routePaths[routeIndex];
          if (!path || path.length < 2) continue;
          context.save();
          context.shadowColor = PALETTE.violet;
          context.shadowBlur = strong ? 13 : 5;
          p.noFill();
          clearDash();
          p.stroke(withAlpha(PALETTE.foam, alpha * 0.34));
          p.strokeWeight((strong ? 7.4 : 5.6) / camera.zoom);
          drawPolyline(path);
          p.stroke(withAlpha(PALETTE.violet, alpha));
          p.strokeWeight((strong ? 2.15 : 1.45) / camera.zoom);
          setDash([1.2 / camera.zoom, 5.4 / camera.zoom], 0);
          drawPolyline(path);
          clearDash();
          context.restore();

          const note = samplePath(path, 0.5);
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

        for (const harbor of choir.harborPoints) {
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
        if (!reducedMotion && choir.routePaths.length > 0) {
          const mothCount = Math.min(2, choir.routePaths.length);
          for (let moteIndex = 0; moteIndex < mothCount; moteIndex += 1) {
            const path = choir.routePaths[(salt + moteIndex) % choir.routePaths.length];
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

          if (strong && choir.harborPoints.length > 0) {
            const signalStep = Math.floor(now / 1_500);
            const harbor = choir.harborPoints[(salt + signalStep) % choir.harborPoints.length];
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

        if (strong && choir.harborPoints.length > 0) {
          const total = choir.harborPoints.reduce(
            (total, point) => ({ x: total.x + point.x, y: total.y + point.y }),
            { x: 0, y: 0 },
          );
          const center = {
            x: total.x / choir.harborPoints.length,
            y: total.y / choir.harborPoints.length,
          };
          const screen = worldToScreen(center);
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

    const wayknotColor = (kind: WayknotKind): string => {
      switch (kind) {
        case "reed-mat": return PALETTE.amber;
        case "tide-anchor": return PALETTE.sky;
        case "wind-knot": return PALETTE.violet;
      }
    };

    const drawTideHarps = (view: TideweftView): void => {
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

        p.push();
        p.translate(harp.center.x, harp.center.y + noteSize * 2.15);
        p.textAlign(p.CENTER, p.CENTER);
        p.textStyle(p.BOLD);
        p.textSize(8 / camera.zoom);
        const labelWidth = p.textWidth(harp.label) + 10 / camera.zoom;
        p.noStroke();
        p.rectMode(p.CENTER);
        p.fill(withAlpha(PALETTE.ink, 218));
        p.rect(0, 0, labelWidth, 13 / camera.zoom, 4 / camera.zoom);
        p.fill(withAlpha(PALETTE.foam, harp.active ? 245 : 184));
        p.text(harp.label, 0, -0.2 / camera.zoom);
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

      const labelSize = 8.5 / camera.zoom;
      p.push();
      p.translate(wayknot.position.x, wayknot.position.y + size * 0.78 + 8 / camera.zoom);
      p.textAlign(p.CENTER, p.CENTER);
      p.textStyle(p.BOLD);
      p.textSize(labelSize);
      const width = p.textWidth(wayknot.label) + 9 / camera.zoom;
      p.noStroke();
      p.rectMode(p.CENTER);
      p.fill(withAlpha(PALETTE.ink, wayknot.active ? 220 : 205));
      p.rect(0, 0, width, 13 / camera.zoom, 4 / camera.zoom);
      p.fill(withAlpha(color, wayknot.active ? 245 : 210));
      p.text(wayknot.label, 0, -0.25 / camera.zoom);
      p.pop();
    };

    const drawWayknots = (view: TideweftView, now: number): void => {
      drawWaychords(view);
      for (const wayknot of view.wayknots) {
        drawWayknotMotif(wayknot, view.terrain.tileSize, now);
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
        const hovered = hoverTarget?.entity === "settlement" && hoverTarget.id === settlement.id;
        const selected = Boolean(settlement.selected || hovered);
        const statusColor = settlementStatusColor(settlement.status);
        const radius = (8.5 + Math.sqrt(Math.max(0, settlement.population)) * 0.5) / camera.zoom;
        const pulse = reducedMotion ? 0 : Math.sin(now * 0.0023 + settlement.position.x) * 0.5 + 0.5;
        const halo = radius * (2.7 + pulse * unit(settlement.connection) * 0.35);

        p.push();
        p.translate(settlement.position.x, settlement.position.y);
        p.noStroke();
        p.fill(withAlpha(statusColor, 12 + unit(settlement.connection) * 28));
        p.circle(0, 0, halo * 2);

        context.save();
        context.shadowColor = statusColor;
        context.shadowBlur = selected ? 20 : 10;
        p.fill(withAlpha(PALETTE.ink, 238));
        p.stroke(withAlpha(PALETTE.foam, 225));
        p.strokeWeight((selected ? 2.2 : 1.25) / camera.zoom);
        p.circle(0, 0, radius * 2.1);
        context.restore();

        p.noFill();
        p.stroke(withAlpha(statusColor, 235));
        p.strokeWeight(1.7 / camera.zoom);
        setDash(lineDashForStatus(settlement.status, 1 / camera.zoom), reducedMotion ? 0 : -now * 0.008);
        p.circle(0, 0, radius * 2.95);
        clearDash();

        p.stroke(withAlpha(PALETTE.foam, 235));
        p.strokeWeight(1.15 / camera.zoom);
        p.noFill();
        drawSettlementGlyph(settlement.glyph ?? "hearth", radius);
        p.pop();

        const screen = worldToScreen(settlement.position);
        const labelY = screen.y + radius * camera.zoom + 15;
        p.push();
        p.resetMatrix();
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(selected ? 12.5 : 11.5);
        p.textStyle(selected ? p.BOLD : p.NORMAL);
        const nameWidth = p.textWidth(settlement.name) + 16;
        p.noStroke();
        p.fill(withAlpha(PALETTE.ink, selected ? 232 : 198));
        p.rectMode(p.CENTER);
        p.rect(screen.x, labelY, nameWidth, 21, 8);
        p.fill(PALETTE.foam);
        p.text(settlement.name, screen.x, labelY - 0.5);
        if (settlement.promiseCount && settlement.promiseCount > 0) {
          p.fill(statusColor);
          p.circle(screen.x + nameWidth / 2 - 3, labelY - 8, 7);
        }
        p.pop();
      }
      clearDash();
    };

    const porterColor = (porter: PorterView): string => {
      switch (porter.state) {
        case "helping":
          return PALETTE.tide;
        case "stranded":
          return PALETTE.danger;
        case "waiting":
          return PALETTE.warning;
        case "resting":
          return PALETTE.violet;
        case "traveling":
        default:
          return porter.cargoColor ?? PALETTE.foam;
      }
    };

    const drawPorters = (porters: readonly PorterView[]): void => {
      for (const porter of porters) {
        const color = porterColor(porter);
        const hovered = hoverTarget?.entity === "porter" && hoverTarget.id === porter.id;
        const radius = (porter.selected || hovered ? 6.2 : 4.8) / camera.zoom;
        p.push();
        p.translate(porter.position.x, porter.position.y);
        p.rotate(porter.facing);
        p.noStroke();
        p.fill(withAlpha(PALETTE.ink, 220));
        p.circle(0, 0, radius * 3);
        p.fill(color);
        p.triangle(radius * 1.2, 0, -radius * 0.75, -radius * 0.72, -radius * 0.75, radius * 0.72);
        p.fill(withAlpha(porter.cargoColor ?? PALETTE.amber, 220));
        p.rectMode(p.CENTER);
        p.rect(-radius * 0.9, 0, radius * 0.72, radius * 0.88, radius * 0.12);
        p.pop();

        if ((porter.selected || hovered) && porter.name) {
          const screen = worldToScreen(porter.position);
          p.push();
          p.resetMatrix();
          p.textAlign(p.CENTER, p.CENTER);
          p.textSize(10.5);
          p.noStroke();
          p.fill(withAlpha(PALETTE.ink, 214));
          const width = p.textWidth(porter.name) + 12;
          p.rectMode(p.CENTER);
          p.rect(screen.x, screen.y + 20, width, 18, 7);
          p.fill(PALETTE.foam);
          p.text(porter.name, screen.x, screen.y + 19.5);
          p.pop();
        }
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
        p.textAlign(p.CENTER, p.CENTER);
        p.textStyle(p.BOLD);
        p.textSize(10 / camera.zoom);
        const labelWidth = p.textWidth(label) + 14 / camera.zoom;
        const labelY = -radius * 2.45;
        p.noStroke();
        p.fill(withAlpha(PALETTE.ink, 224));
        p.rectMode(p.CENTER);
        p.rect(0, labelY, labelWidth, 18 / camera.zoom, 5 / camera.zoom);
        p.fill(withAlpha(PALETTE.amber, 246));
        p.text(label, 0, labelY + 0.2 / camera.zoom);
        p.rectMode(p.CORNER);
      }
      p.pop();
    };

    const drawSweptCurrent = (view: TideweftView, radius: number): void => {
      const player = view.player;
      if (player.mode !== "swept") return;
      const progress = unit(player.sweptProgress);
      const wakeLength = radius * (3.1 + progress * 1.25);
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

    const drawPlayer = (view: TideweftView, now: number): void => {
      const player = view.player;
      const position = player.position;
      const radius = 7.2 / camera.zoom;
      const stability = unit(player.stability, 1);
      const loadRatio = clamp(player.cargoLoad / Math.max(1, player.cargoCapacity), 0, 1.5);
      const sway = reducedMotion
        ? 0
        : Math.sin(now * (player.mode === "swept" ? 0.0022 : 0.005))
          * (player.mode === "swept" ? 0.08 : (1 - stability) * 0.18);
      const context = p.drawingContext as CanvasRenderingContext2D;

      drawDestination(view, now);
      drawSweptCurrent(view, radius);
      p.push();
      p.translate(position.x, position.y);
      p.rotate(player.facing + sway);

      context.save();
      context.shadowColor = player.mode === "swept" ? PALETTE.sky : PALETTE.tide;
      context.shadowBlur = player.mode === "swept" ? 12 : 18;
      p.noStroke();
      p.fill(withAlpha(player.mode === "swept" ? PALETTE.sky : PALETTE.tide, player.mode === "swept" ? 52 : 35));
      p.circle(0, 0, radius * (player.mode === "swept" ? 4.4 : 5.5));
      context.restore();

      const cargoShown = Math.min(4, player.cargo.length);
      for (let index = 0; index < cargoShown; index += 1) {
        const cargo = player.cargo[index];
        if (!cargo) continue;
        const angle = ((index - (cargoShown - 1) / 2) * 0.48) + p.PI;
        const distance = radius * (1.15 + loadRatio * 0.28);
        p.push();
        p.translate(Math.cos(angle) * distance, Math.sin(angle) * distance);
        p.rotate(-player.facing - sway);
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

      p.stroke(withAlpha(PALETTE.foam, 245));
      p.strokeWeight(1.35 / camera.zoom);
      p.fill(withAlpha(PALETTE.ink, 245));
      if (player.mode === "skiff") {
        p.beginShape();
        p.vertex(radius * 1.55, 0);
        p.vertex(-radius * 0.8, -radius * 0.72);
        p.vertex(-radius * 1.15, 0);
        p.vertex(-radius * 0.8, radius * 0.72);
        p.endShape(p.CLOSE);
      } else if (player.mode === "swept") {
        p.ellipse(0, 0, radius * 2.45, radius * 1.42);
        p.line(-radius * 0.52, -radius * 0.52, radius * 0.5, radius * 0.5);
        p.line(-radius * 0.52, radius * 0.52, radius * 0.5, -radius * 0.5);
        p.noStroke();
        p.fill(PALETTE.foam);
        p.triangle(radius * 1.42, 0, radius * 0.62, -radius * 0.3, radius * 0.62, radius * 0.3);
      } else {
        p.circle(0, 0, radius * 2.1);
        p.fill(PALETTE.foam);
        p.triangle(radius * 1.18, 0, radius * 0.38, -radius * 0.34, radius * 0.38, radius * 0.34);
        if (player.mode === "wading") {
          p.noFill();
          p.stroke(withAlpha(PALETTE.sky, 238));
          p.strokeWeight(1 / camera.zoom);
          p.arc(0, radius * 0.48, radius * 2.8, radius * 0.92, p.PI, p.TWO_PI);
          p.line(-radius * 1.14, radius * 0.51, -radius * 0.54, radius * 0.51);
          p.line(radius * 0.54, radius * 0.51, radius * 1.14, radius * 0.51);
        }
      }

      p.noFill();
      p.stroke(withAlpha(stability < 0.3 ? PALETTE.danger : PALETTE.tide, 235));
      p.strokeWeight(1.8 / camera.zoom);
      p.arc(0, 0, radius * 3.3, radius * 3.3, -p.HALF_PI, -p.HALF_PI + p.TWO_PI * unit(player.stamina));
      p.pop();

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

    const drawEvents = (events: readonly WorldEventView[]): void => {
      for (const event of events) {
        if (!event.position || event.progress >= 1) continue;
        const screen = worldToScreen(event.position);
        const rise = reducedMotion ? 0 : unit(event.progress) * 20;
        const alpha = 255 * (1 - Math.pow(unit(event.progress), 2));
        p.push();
        p.resetMatrix();
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(event.emphasis === "strong" ? 13 : 11);
        p.textStyle(event.emphasis === "strong" ? p.BOLD : p.NORMAL);
        const width = Math.min(260, p.textWidth(event.label) + 18);
        p.noStroke();
        p.fill(withAlpha(PALETTE.ink, alpha * 0.84));
        p.rectMode(p.CENTER);
        p.rect(screen.x, screen.y - 24 - rise, width, 23, 9);
        p.fill(withAlpha(eventColor(event), alpha));
        p.text(event.label, screen.x, screen.y - 25 - rise, width - 10, 21);
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
        "TIDEWEFT estuary. Use WASD or arrow keys to travel, Space to scan, E to interact, F to tie or tend a Wayknot, T for the tutorial, and Escape to cancel.",
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
      latestView = options.getView() ?? null;
      if (!latestView) {
        drawEmptyEstuary(now);
        return;
      }

      updateCamera(latestView, now);
      p.background(PALETTE.ink);
      p.push();
      const shake = reducedMotion ? 0 : unit(latestView.camera.shake) * 3;
      const shakeX = shake ? Math.sin(now * 0.051) * shake : 0;
      const shakeY = shake ? Math.cos(now * 0.043) * shake : 0;
      p.translate(p.width / 2 + shakeX, p.height / 2 + shakeY);
      p.scale(camera.zoom);
      p.translate(-camera.x, -camera.y);
      drawTerrain(latestView);
      drawSurfaceCurrents(latestView, now);
      drawTraces(latestView.traces, now);
      drawRoutes(latestView.routes, now);
      drawChoirs(latestView.choirs, now);
      drawDepthSoundings(latestView);
      drawTideHarps(latestView);
      drawWayknots(latestView, now);
      drawSettlements(latestView.settlements, now);
      drawPorters(latestView.porters);
      drawParticles(latestView.particles ?? []);
      drawPlayer(latestView, now);
      drawRipples(now);
      drawPointerTarget();
      p.pop();
      drawEvents(latestView.events ?? []);
      drawWeather(latestView.weather, now);
      if (latestView.paused) drawPausedVeil();
    };
  };

  reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  reducedMotion = reducedMotionQuery.matches;
  const onReducedMotionChange = (event: MediaQueryListEvent): void => {
    reducedMotion = event.matches;
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
    isActive: () => active,
    setActive: (nextActive) => {
      if (active === nextActive) {
        syncActivePresentation();
        return;
      }
      if (!nextActive) {
        heldDirections.clear();
        if (heldBraceKeys.size > 0) options.dispatch({ type: "brace", active: false });
        heldBraceKeys.clear();
        if (lastMovement !== "0,0") {
          lastMovement = "0,0";
          options.dispatch({ type: "movement", vector: { x: 0, y: 0 } });
        }
      }
      active = nextActive;
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
      camera.focusPoint = { ...point };
      camera.focusUntil = performance.now() + (reducedMotion ? 1 : 1_800);
      if (zoom !== undefined) camera.manualZoom = clamp(zoom, 0.58, 2.4);
    },
    pulseScan,
    destroy: () => {
      heldDirections.clear();
      if (heldBraceKeys.size > 0) emit({ type: "brace", active: false });
      heldBraceKeys.clear();
      updateMovement();
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
    },
  };
}

export type {
  RendererCommand,
  TideweftRendererController,
  TideweftRendererOptions,
  TideweftView,
} from "./types";

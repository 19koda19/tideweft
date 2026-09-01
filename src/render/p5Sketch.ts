import p5 from "p5";

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
  TideweftRendererController,
  TideweftRendererOptions,
  TideweftView,
  TraceView,
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
  let hoverTarget: HoverTarget | null = null;
  let pointerWorld: WorldPoint | null = null;
  let lastMovement = "0,0";
  const heldDirections = new Set<string>();
  const heldBraceKeys = new Set<string>();
  const ripples: ScanRipple[] = [];
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
    options.dispatch(command);
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
      if (target) {
        emit({ type: "select", entity: target.entity, id: target.id, point });
      } else {
        emit({ type: "move-target", point, additive: event.shiftKey });
      }
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
      const base = p.color(TERRAIN_COLORS[tile.kind]);
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
          p.fill(terrainColor(tile));
          p.rect(x, y, tileSize + 0.35 / camera.zoom, tileSize + 0.35 / camera.zoom);

          const derivedDepth = clamp(view.tide.level * 0.82 - unit(tile.elevation), 0, 1);
          const waterDepth = unit(tile.waterDepth, derivedDepth);
          if (waterDepth > 0.015) {
            p.fill(withAlpha(PALETTE.channel, 50 + waterDepth * 150));
            p.rect(x, y, tileSize + 0.4 / camera.zoom, tileSize + 0.4 / camera.zoom);
            if ((column + row) % 3 === 0 && waterDepth < 0.74) {
              p.stroke(withAlpha(PALETTE.sky, 28 + waterDepth * 45));
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

          const discovered = unit(tile.discovered, 1);
          if (discovered < 0.995) {
            p.fill(withAlpha(PALETTE.ink, (1 - discovered) * 238));
            p.rect(x, y, tileSize + 0.4 / camera.zoom, tileSize + 0.4 / camera.zoom);
          }
        }
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
      p.pop();
    };

    const drawPlayer = (view: TideweftView, now: number): void => {
      const player = view.player;
      const position = player.position;
      const radius = 7.2 / camera.zoom;
      const stability = unit(player.stability, 1);
      const loadRatio = clamp(player.cargoLoad / Math.max(1, player.cargoCapacity), 0, 1.5);
      const sway = reducedMotion ? 0 : Math.sin(now * 0.005) * (1 - stability) * 0.18;
      const context = p.drawingContext as CanvasRenderingContext2D;

      drawDestination(view, now);
      p.push();
      p.translate(position.x, position.y);
      p.rotate(player.facing + sway);

      context.save();
      context.shadowColor = PALETTE.tide;
      context.shadowBlur = 18;
      p.noStroke();
      p.fill(withAlpha(PALETTE.tide, 35));
      p.circle(0, 0, radius * 5.5);
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
      } else {
        p.circle(0, 0, radius * 2.1);
        p.fill(PALETTE.foam);
        p.triangle(radius * 1.18, 0, radius * 0.38, -radius * 0.34, radius * 0.38, radius * 0.34);
      }

      p.noFill();
      p.stroke(withAlpha(stability < 0.3 ? PALETTE.danger : PALETTE.tide, 235));
      p.strokeWeight(1.8 / camera.zoom);
      p.arc(0, 0, radius * 3.3, radius * 3.3, -p.HALF_PI, -p.HALF_PI + p.TWO_PI * unit(player.stamina));
      p.pop();

      if (player.scanProgress !== undefined) {
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
      canvasElement.tabIndex = 0;
      canvasElement.setAttribute("role", "application");
      canvasElement.setAttribute(
        "aria-label",
        "TIDEWEFT estuary. Use WASD or arrow keys to travel, Space to scan, E to interact, and Escape to cancel.",
      );
      canvasElement.setAttribute(
        "aria-keyshortcuts",
        "ArrowUp ArrowDown ArrowLeft ArrowRight W A S D Space E P Escape",
      );
      p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
      p.frameRate(60);
      p.textFont("system-ui, sans-serif");
      p.strokeCap(p.ROUND);
      p.strokeJoin(p.ROUND);
      attachCanvasListeners(canvasElement);
    };

    p.draw = (): void => {
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
      drawTraces(latestView.traces, now);
      drawRoutes(latestView.routes, now);
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

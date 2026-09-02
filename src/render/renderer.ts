import { createTideweftReliefRenderer } from "./p5ReliefSketch";
import { createTideweftRenderer as createTideweftChartRenderer } from "./p5Sketch";
import { createWorldCompass } from "./worldCompass";
import type {
  TideweftRendererController,
  TideweftRendererOptions,
  WorldPoint,
} from "./types";
import type { ViewMode } from "./viewMode";

export interface TideweftCompositeRendererOptions extends TideweftRendererOptions {
  readonly initialMode?: ViewMode;
  readonly onModeChange?: (mode: ViewMode, reliefAvailable: boolean) => void;
  readonly onReliefUnavailable?: (reason: string) => void;
}

export interface TideweftCompositeRendererController extends TideweftRendererController {
  readonly mode: () => ViewMode;
  readonly setMode: (mode: ViewMode) => ViewMode;
  readonly toggleMode: () => ViewMode;
  readonly reliefSupported: () => boolean;
  readonly isActive: () => boolean;
  readonly setActive: (active: boolean) => void;
}

/**
 * Keeps one simulation projection behind two disposable presentations. Only
 * the selected p5 instance loops or accepts input, so switching views never
 * forks world state, movement, saves, or contract consequences.
 */
export function createTideweftRenderer(
  options: TideweftCompositeRendererOptions,
): TideweftCompositeRendererController {
  let currentMode: ViewMode = "chart-2d";
  let destroyed = false;
  let active = true;
  let reliefUsable = true;
  const compass = createWorldCompass(options.mount);
  const chart = createTideweftChartRenderer(options);
  let applyMode: (mode: ViewMode) => ViewMode = () => "chart-2d";
  const relief = createTideweftReliefRenderer({
    ...options,
    initiallyActive: false,
    onWebGLError: (reason) => {
      reliefUsable = false;
      options.onReliefUnavailable?.(reason);
      // p5 may report setup failure while its controller is still being
      // assigned. Defer the fallback until both leaf renderers exist.
      queueMicrotask(() => {
        // Re-apply Chart too: a hidden Relief context may be evicted while the
        // player is already in 2D, and the visible toggle must immediately
        // advertise that 3D is no longer available.
        if (!destroyed) applyMode(currentMode);
      });
    },
    onOrbitChange: (yaw) => {
      if (!destroyed && currentMode === "relief-3d") {
        compass.setHeading("relief-3d", yaw);
      }
    },
  });

  applyMode = (requested): ViewMode => {
    const reliefAvailable = reliefUsable && relief.supported();
    const next = requested === "relief-3d" && reliefAvailable
      ? "relief-3d"
      : "chart-2d";
    currentMode = next;
    chart.setActive?.(active && next === "chart-2d");
    relief.setActive(active && next === "relief-3d");
    compass.setActive(active);
    compass.setHeading(next, next === "relief-3d" ? relief.orbitYaw() : 0);
    options.mount.dataset.viewMode = next;
    options.onModeChange?.(next, reliefAvailable);
    return next;
  };

  applyMode(options.initialMode ?? "chart-2d");

  const activeRenderer = (): TideweftRendererController =>
    currentMode === "relief-3d" && reliefUsable && relief.supported() ? relief : chart;

  return {
    canvas: () => activeRenderer().canvas(),
    telemetry: () => activeRenderer().telemetry(),
    mode: () => currentMode,
    setMode: applyMode,
    toggleMode: () => applyMode(currentMode === "chart-2d" ? "relief-3d" : "chart-2d"),
    reliefSupported: () => reliefUsable && relief.supported(),
    resize: () => {
      chart.resize();
      relief.resize();
    },
    focusWorld: (point: WorldPoint, zoom?: number) => {
      activeRenderer().focusWorld(point, zoom);
    },
    pulseScan: (point?: WorldPoint) => {
      activeRenderer().pulseScan(point);
    },
    isActive: () => active,
    setActive: (nextActive) => {
      active = nextActive;
      chart.setActive?.(active && currentMode === "chart-2d");
      relief.setActive(active && currentMode === "relief-3d");
      compass.setActive(active);
    },
    destroy: () => {
      destroyed = true;
      chart.destroy();
      relief.destroy();
      compass.destroy();
      delete options.mount.dataset.viewMode;
    },
  };
}

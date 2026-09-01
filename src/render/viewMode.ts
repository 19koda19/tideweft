export const VIEW_MODE_STORAGE_KEY = "tideweft:view-mode:v1";

export type ViewMode = "chart-2d" | "relief-3d";

export interface ViewModeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface InitialViewModeOptions {
  readonly webglAvailable: boolean;
  readonly prefersReducedMotion: boolean;
  readonly storage?: ViewModeStorage | null;
}

export interface ViewModeButtonState {
  readonly mode: ViewMode;
  readonly currentLabel: "Chart 2D" | "Relief 3D";
  readonly nextAction: "Switch to Chart 2D" | "Switch to Relief 3D" | "Relief 3D unavailable";
  readonly ariaPressed: boolean;
}

export function isViewMode(value: unknown): value is ViewMode {
  return value === "chart-2d" || value === "relief-3d";
}

function browserStorage(): ViewModeStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function resolveStorage(storage: ViewModeStorage | null | undefined): ViewModeStorage | null {
  return storage === undefined ? browserStorage() : storage;
}

export function loadSavedViewMode(
  storage?: ViewModeStorage | null,
): ViewMode | null {
  try {
    const value = resolveStorage(storage)?.getItem(VIEW_MODE_STORAGE_KEY);
    return isViewMode(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveViewMode(
  mode: ViewMode,
  storage?: ViewModeStorage | null,
): boolean {
  try {
    const target = resolveStorage(storage);
    if (!target) return false;
    target.setItem(VIEW_MODE_STORAGE_KEY, mode);
    return true;
  } catch {
    return false;
  }
}

export function defaultViewMode(
  webglAvailable: boolean,
  prefersReducedMotion: boolean,
): ViewMode {
  return webglAvailable && !prefersReducedMotion ? "relief-3d" : "chart-2d";
}

export function resolveInitialViewMode(options: InitialViewModeOptions): ViewMode {
  const saved = loadSavedViewMode(options.storage);

  if (saved === "chart-2d") return saved;
  if (saved === "relief-3d" && options.webglAvailable) return saved;

  return defaultViewMode(options.webglAvailable, options.prefersReducedMotion);
}

export function toggleViewMode(
  current: ViewMode,
  webglAvailable: boolean,
): ViewMode {
  if (current === "relief-3d" || !webglAvailable) return "chart-2d";
  return "relief-3d";
}

export function viewModeButtonState(
  mode: ViewMode,
  webglAvailable: boolean,
): ViewModeButtonState {
  if (mode === "relief-3d") {
    return {
      mode,
      currentLabel: "Relief 3D",
      nextAction: "Switch to Chart 2D",
      ariaPressed: true,
    };
  }

  return {
    mode,
    currentLabel: "Chart 2D",
    nextAction: webglAvailable ? "Switch to Relief 3D" : "Relief 3D unavailable",
    ariaPressed: false,
  };
}

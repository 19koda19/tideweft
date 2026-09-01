import { describe, expect, it, vi } from "vitest";

import {
  VIEW_MODE_STORAGE_KEY,
  defaultViewMode,
  loadSavedViewMode,
  resolveInitialViewMode,
  saveViewMode,
  toggleViewMode,
  viewModeButtonState,
  type ViewModeStorage,
} from "./viewMode";

class MemoryStorage implements ViewModeStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("view-mode preference", () => {
  it("defaults to Relief 3D only when WebGL and full motion are available", () => {
    expect(defaultViewMode(true, false)).toBe("relief-3d");
    expect(defaultViewMode(true, true)).toBe("chart-2d");
    expect(defaultViewMode(false, false)).toBe("chart-2d");
  });

  it("honors an explicit saved choice ahead of the motion-based default", () => {
    const storage = new MemoryStorage();
    storage.setItem(VIEW_MODE_STORAGE_KEY, "relief-3d");

    expect(
      resolveInitialViewMode({
        webglAvailable: true,
        prefersReducedMotion: true,
        storage,
      }),
    ).toBe("relief-3d");

    storage.setItem(VIEW_MODE_STORAGE_KEY, "chart-2d");
    expect(
      resolveInitialViewMode({
        webglAvailable: true,
        prefersReducedMotion: false,
        storage,
      }),
    ).toBe("chart-2d");
  });

  it("never selects Relief 3D when WebGL is unavailable", () => {
    const storage = new MemoryStorage();
    storage.setItem(VIEW_MODE_STORAGE_KEY, "relief-3d");

    expect(
      resolveInitialViewMode({
        webglAvailable: false,
        prefersReducedMotion: false,
        storage,
      }),
    ).toBe("chart-2d");
    expect(toggleViewMode("chart-2d", false)).toBe("chart-2d");
  });

  it("loads, saves, and ignores unrecognized persisted values", () => {
    const storage = new MemoryStorage();

    expect(loadSavedViewMode(storage)).toBeNull();
    expect(saveViewMode("relief-3d", storage)).toBe(true);
    expect(loadSavedViewMode(storage)).toBe("relief-3d");

    storage.setItem(VIEW_MODE_STORAGE_KEY, "isometric-maybe");
    expect(loadSavedViewMode(storage)).toBeNull();
  });

  it("does not throw when local storage is absent or denies access", () => {
    const denied: ViewModeStorage = {
      getItem: vi.fn(() => {
        throw new DOMException("denied", "SecurityError");
      }),
      setItem: vi.fn(() => {
        throw new DOMException("denied", "QuotaExceededError");
      }),
    };

    expect(loadSavedViewMode(null)).toBeNull();
    expect(saveViewMode("chart-2d", null)).toBe(false);
    expect(loadSavedViewMode(denied)).toBeNull();
    expect(saveViewMode("relief-3d", denied)).toBe(false);
  });

  it("toggles modes and provides unambiguous accessible button copy", () => {
    expect(toggleViewMode("chart-2d", true)).toBe("relief-3d");
    expect(toggleViewMode("relief-3d", true)).toBe("chart-2d");
    expect(viewModeButtonState("relief-3d", true)).toEqual({
      mode: "relief-3d",
      currentLabel: "Relief 3D",
      nextAction: "Switch to Chart 2D",
      ariaPressed: true,
    });
    expect(viewModeButtonState("chart-2d", false)).toEqual({
      mode: "chart-2d",
      currentLabel: "Chart 2D",
      nextAction: "Relief 3D unavailable",
      ariaPressed: false,
    });
  });
});

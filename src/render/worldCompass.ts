import type { ViewMode } from "./viewMode";
import { wrapReliefOrbitRadians } from "./reliefOrbitControls";

export interface WorldCompassController {
  readonly element: HTMLDivElement | null;
  readonly setHeading: (mode: ViewMode, cameraYaw: number) => void;
  readonly setActive: (active: boolean) => void;
  readonly destroy: () => void;
}

/** CSS rotates clockwise; Relief yaw uses the same screen-space convention. */
export function worldNorthDegrees(cameraYaw: number): number {
  const degrees = wrapReliefOrbitRadians(cameraYaw) * 180 / Math.PI;
  return Object.is(degrees, -0) ? 0 : degrees;
}

export function worldCompassLabel(mode: ViewMode, cameraYaw: number): string {
  if (mode === "chart-2d") return "World compass. North is straight up in Chart 2D.";
  const degrees = Math.round(worldNorthDegrees(cameraYaw));
  if (Math.abs(degrees) <= 1) return "World compass. The arrow points north, straight up.";
  const side = degrees < 0 ? "left" : "right";
  return `World compass. The arrow points north, ${Math.abs(degrees)} degrees ${side} of screen-up.`;
}

/** Shared overlay: Chart stays north-up; Relief follows its presentation yaw. */
export function createWorldCompass(mount: HTMLElement): WorldCompassController {
  const ownerDocument = mount.ownerDocument
    ?? (typeof document !== "undefined" ? document : undefined);
  if (!ownerDocument || typeof mount.append !== "function") {
    return {
      element: null,
      setHeading: () => undefined,
      setActive: () => undefined,
      destroy: () => undefined,
    };
  }

  const element = ownerDocument.createElement("div");
  element.className = "world-compass";
  element.setAttribute("role", "img");
  element.setAttribute("aria-roledescription", "world compass");

  const north = ownerDocument.createElement("span");
  north.className = "world-compass__north";
  north.textContent = "N";
  north.setAttribute("aria-hidden", "true");

  const arrow = ownerDocument.createElement("span");
  arrow.className = "world-compass__arrow";
  arrow.textContent = "↑";
  arrow.setAttribute("aria-hidden", "true");
  element.append(north, arrow);
  mount.append(element);

  let lastLabel = "";
  const setHeading = (mode: ViewMode, cameraYaw: number): void => {
    const yaw = mode === "relief-3d" ? cameraYaw : 0;
    element.dataset.viewMode = mode;
    element.style.setProperty("--world-north-angle", `${worldNorthDegrees(yaw).toFixed(3)}deg`);
    const label = worldCompassLabel(mode, yaw);
    if (label !== lastLabel) {
      element.setAttribute("aria-label", label);
      lastLabel = label;
    }
  };

  setHeading("chart-2d", 0);
  return {
    element,
    setHeading,
    setActive: (active) => {
      element.hidden = !active;
    },
    destroy: () => element.remove(),
  };
}

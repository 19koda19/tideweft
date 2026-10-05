import {
  MAX_ACOUSTIC_TEXT_RESERVED_RECTS,
  type AcousticTextRect,
} from "../render/acousticTextLayout";

export interface AcousticTextReservationReader {
  readonly get: () => readonly AcousticTextRect[];
  readonly invalidate: () => void;
  readonly destroy: () => void;
}

const EMPTY: readonly AcousticTextRect[] = Object.freeze([]);

/**
 * Measures only the three feedback owners, not actors or labels. Resize/font/
 * disclosure changes invalidate cached mount-relative boxes. Stable render
 * frames reuse them without DOM measurements. No world facts enter this owner.
 */
export function createAcousticTextReservationReader(
  mount: HTMLElement | undefined,
  targets: readonly HTMLElement[],
  layoutContainer: HTMLElement,
): AcousticTextReservationReader {
  if (targets.length > MAX_ACOUSTIC_TEXT_RESERVED_RECTS) {
    throw new Error("Acoustic feedback reservations exceed their fixed budget");
  }
  const retainedTargets = Object.freeze(targets.slice());
  let dirty = true;
  let destroyed = false;
  let cached = EMPTY;
  const invalidate = (): void => { dirty = true; };
  const windowTarget = mount?.ownerDocument.defaultView;
  const observer = mount !== undefined && typeof ResizeObserver !== "undefined"
    ? new ResizeObserver(invalidate)
    : null;
  if (observer !== null && mount !== undefined) {
    observer.observe(mount);
    observer.observe(layoutContainer);
    for (const target of retainedTargets) observer.observe(target);
  }
  windowTarget?.addEventListener("resize", invalidate);
  return Object.freeze({
    invalidate,
    get: (): readonly AcousticTextRect[] => {
      if (destroyed || mount === undefined) return EMPTY;
      if (!dirty) return cached;
      dirty = false;
      const origin = mount.getBoundingClientRect();
      const boxes: AcousticTextRect[] = [];
      for (const target of retainedTargets) {
        if (target.hidden) continue;
        const rect = target.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        boxes.push(Object.freeze({
          x: rect.x - origin.x, y: rect.y - origin.y,
          width: rect.width, height: rect.height,
        }));
      }
      cached = Object.freeze(boxes);
      return cached;
    },
    destroy: () => {
      destroyed = true;
      cached = EMPTY;
      observer?.disconnect();
      windowTarget?.removeEventListener("resize", invalidate);
    },
  });
}

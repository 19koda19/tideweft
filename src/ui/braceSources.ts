export type BraceInputSource = "renderer" | "desktop-global" | "touch";

export interface BraceSourceController {
  /** True while any authoritative input source is still holding BRACE. */
  readonly active: () => boolean;
  /** Update one source without allowing another source's release to cancel it. */
  readonly set: (source: BraceInputSource, active: boolean) => void;
  /** Releases every held source exactly once, then ignores further input. */
  readonly destroy: () => void;
}

/**
 * Combines canvas keyboard, global desktop keyboard, and touch holds into one
 * authoritative brace bit. A release belongs only to the source that emitted
 * it, which keeps hybrid devices and focus transfers from cancelling a hold
 * that is still physically active elsewhere.
 */
export function createBraceSourceController(
  onBraceChange: (active: boolean) => void,
): BraceSourceController {
  const held = new Set<BraceInputSource>();
  let destroyed = false;

  const set = (source: BraceInputSource, active: boolean): void => {
    if (destroyed) return;
    const wasActive = held.size > 0;
    if (active) held.add(source);
    else held.delete(source);
    const isActive = held.size > 0;
    if (isActive !== wasActive) onBraceChange(isActive);
  };

  return {
    active: () => !destroyed && held.size > 0,
    set,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      const wasActive = held.size > 0;
      held.clear();
      if (wasActive) onBraceChange(false);
    },
  };
}

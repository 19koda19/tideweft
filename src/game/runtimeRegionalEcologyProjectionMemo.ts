import type { CoreEcologyRuntimeWindow } from "./coreEcologyRuntime";
import type {
  RegionalEcologyStateV6,
  RegionalEcologyStateV6ActiveProjection,
} from "./regionalEcologyStateV6";

export type RegionalEcologyActiveProjector = (
  state: RegionalEcologyStateV6,
  window: CoreEcologyRuntimeWindow,
) => RegionalEcologyStateV6ActiveProjection | null;

export interface RuntimeRegionalEcologyProjectionMemo {
  readonly project: RegionalEcologyActiveProjector;
}

/**
 * Reuses one already-authenticated hot projection while both immutable input
 * authority and the exact signed runtime window remain unchanged.
 *
 * This is deliberately runtime-local and single-entry: it cannot retain old
 * infinite-world regions, and a newly committed ecology state invalidates by
 * object identity even when its integrity text happens to match.
 */
export function createRuntimeRegionalEcologyProjectionMemo(
  projector: RegionalEcologyActiveProjector,
): RuntimeRegionalEcologyProjectionMemo {
  let stateAuthority: RegionalEcologyStateV6 | null = null;
  let originX = 0;
  let originY = 0;
  let width = 0;
  let height = 0;
  let projection: RegionalEcologyStateV6ActiveProjection | null = null;

  return Object.freeze({
    project: (
      state: RegionalEcologyStateV6,
      window: CoreEcologyRuntimeWindow,
    ): RegionalEcologyStateV6ActiveProjection | null => {
      if (
        projection !== null
        && stateAuthority === state
        && Object.is(originX, window.origin.x)
        && Object.is(originY, window.origin.y)
        && Object.is(width, window.terrain.width)
        && Object.is(height, window.terrain.height)
      ) return projection;

      const next = projector(state, window);
      if (next !== null) {
        stateAuthority = state;
        originX = window.origin.x;
        originY = window.origin.y;
        width = window.terrain.width;
        height = window.terrain.height;
        projection = next;
      }
      return next;
    },
  });
}

import { regionKey, type RegionCoord } from "../sim/regions";
import { compareText } from "../sim/util";

/** Matches the canonical V1 persistent-key order without changing its input. */
export function orderRuntimeRegionalEcologyActiveRegions(
  regions: readonly RegionCoord[],
): readonly RegionCoord[] {
  const keyed = regions.map((region) => Object.freeze({
    key: regionKey(region),
    region,
  }));
  keyed.sort((left, right) => compareText(left.key, right.key));
  return Object.freeze(keyed.map(({ region }) => region));
}

/**
 * Exact ordered equality for already-canonical regional-ecology owner lists.
 *
 * The runtime authenticates the retained state and canonicalizes the requested
 * neighborhood before calling this helper. Keeping comparison here strictly
 * ordered prevents a merely set-equal or malformed sequence from acquiring a
 * no-work receipt.
 */
export function sameOrderedRuntimeRegionalEcologyActiveRegions(
  current: readonly RegionCoord[],
  requested: readonly RegionCoord[],
): boolean {
  if (current.length !== requested.length) return false;
  for (let index = 0; index < current.length; index += 1) {
    const left = current[index];
    const right = requested[index];
    if (
      left === undefined
      || right === undefined
      || !Object.is(left.x, right.x)
      || !Object.is(left.y, right.y)
    ) return false;
  }
  return true;
}

/** Returns the exact authenticated authority only for one unchanged owner list. */
export function reuseAuthenticatedRuntimeRegionalEcologyState<State extends object>(
  state: State,
  current: readonly RegionCoord[],
  requested: readonly RegionCoord[],
): State | null {
  return sameOrderedRuntimeRegionalEcologyActiveRegions(current, requested)
    ? state
    : null;
}

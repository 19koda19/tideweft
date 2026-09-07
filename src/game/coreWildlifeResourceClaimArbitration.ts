import type { CoreWildlifeResourceClaim } from "./coreWildlifeActor";

export const CORE_WILDLIFE_RESOURCE_CLAIM_ARBITRATION_VERSION = 1 as const;
export const CORE_WILDLIFE_RESOURCE_CLAIM_ARBITRATION_OWNER_ID =
  "game:core-wildlife-resource-claim-arbitration:v1" as const;

/**
 * A claim that has already passed source-specific capability, ownership, and
 * physical-contact checks. Distances only compete against claims for the same
 * resource, so each resource owner may use its own exact integer unit.
 */
export interface CoreWildlifeResourceClaimContender {
  readonly version: typeof CORE_WILDLIFE_RESOURCE_CLAIM_ARBITRATION_VERSION;
  readonly claim: CoreWildlifeResourceClaim;
  readonly contactDistance: bigint;
  /** Current pressure from satisfied (0) to urgent (1,000,000). */
  readonly needPressure: number;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isValidContender(value: CoreWildlifeResourceClaimContender): boolean {
  return value.version === CORE_WILDLIFE_RESOURCE_CLAIM_ARBITRATION_VERSION
    && typeof value.contactDistance === "bigint"
    && value.contactDistance >= 0n
    && Number.isSafeInteger(value.needPressure)
    && value.needPressure >= 0
    && value.needPressure <= 1_000_000
    && value.claim.actorId.length > 0
    && value.claim.resourceId.length > 0
    && value.claim.eventId.length > 0
    && value.claim.requestedUnits === 1;
}

/**
 * Produces the single canonical contention order used by physical resource
 * owners. Physical reach wins, then current need, with stable identity used
 * only to settle a true tie. Input iteration order can never decide custody.
 */
export function orderCoreWildlifeResourceClaimContenders(
  contenders: readonly CoreWildlifeResourceClaimContender[],
): readonly CoreWildlifeResourceClaimContender[] | null {
  if (!contenders.every(isValidContender)) return null;
  const seenActorResources = new Set<string>();
  for (const { claim } of contenders) {
    const key = `${claim.resourceId}\u0000${claim.actorId}`;
    if (seenActorResources.has(key)) return null;
    seenActorResources.add(key);
  }
  return Object.freeze([...contenders].sort((left, right) => {
    const byResource = compareText(left.claim.resourceId, right.claim.resourceId);
    if (byResource !== 0) return byResource;
    if (left.contactDistance < right.contactDistance) return -1;
    if (left.contactDistance > right.contactDistance) return 1;
    if (left.needPressure !== right.needPressure) {
      return right.needPressure - left.needPressure;
    }
    const byActor = compareText(left.claim.actorId, right.claim.actorId);
    if (byActor !== 0) return byActor;
    return compareText(left.claim.eventId, right.claim.eventId);
  }));
}

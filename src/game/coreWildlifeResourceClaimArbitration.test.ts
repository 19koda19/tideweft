import { describe, expect, it } from "vitest";

import type { CoreWildlifeResourceClaim } from "./coreWildlifeActor";
import {
  CORE_WILDLIFE_RESOURCE_CLAIM_ARBITRATION_VERSION,
  orderCoreWildlifeResourceClaimContenders,
  type CoreWildlifeResourceClaimContender,
} from "./coreWildlifeResourceClaimArbitration";

function claim(
  actorId: string,
  resourceId: string,
): CoreWildlifeResourceClaim {
  return Object.freeze({
    eventId: `event:${actorId}:${resourceId}`,
    actorId,
    resourceId,
    foodClass: "exposed-food",
    observedAvailableUnits: 1,
    requestedUnits: 1,
  });
}

function contender(
  actorId: string,
  resourceId: string,
  contactDistance: bigint,
  needPressure: number,
): CoreWildlifeResourceClaimContender {
  return Object.freeze({
    version: CORE_WILDLIFE_RESOURCE_CLAIM_ARBITRATION_VERSION,
    claim: claim(actorId, resourceId),
    contactDistance,
    needPressure,
  });
}

describe("shared physical resource-claim arbitration", () => {
  it("is input-order invariant and gives physical reach priority over actor namespace", () => {
    const values = [
      contender("animal:a", "food:1", 12n, 900_000),
      contender("wildlife:z", "food:1", 3n, 300_000),
      contender("animal:b", "food:2", 1n, 400_000),
    ] as const;

    const forward = orderCoreWildlifeResourceClaimContenders(values);
    const reversed = orderCoreWildlifeResourceClaimContenders([...values].reverse());

    expect(forward?.map(({ claim: value }) => value.actorId)).toEqual([
      "wildlife:z",
      "animal:a",
      "animal:b",
    ]);
    expect(reversed).toEqual(forward);
  });

  it("uses current need and then stable identity only for actual contact ties", () => {
    const ordered = orderCoreWildlifeResourceClaimContenders([
      contender("animal:z", "food", 4n, 700_000),
      contender("animal:b", "food", 4n, 800_000),
      contender("animal:a", "food", 4n, 800_000),
    ]);

    expect(ordered?.map(({ claim: value }) => value.actorId)).toEqual([
      "animal:a",
      "animal:b",
      "animal:z",
    ]);
  });

  it("fails closed on duplicate actor/resource claims or invalid authoritative pressure", () => {
    const duplicate = contender("animal:a", "food", 1n, 500_000);
    expect(orderCoreWildlifeResourceClaimContenders([duplicate, duplicate])).toBeNull();
    expect(orderCoreWildlifeResourceClaimContenders([{
      ...duplicate,
      needPressure: 1_000_001,
    }])).toBeNull();
  });
});

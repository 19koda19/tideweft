import { describe, expect, it } from "vitest";

import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_RIDGE_ACTIVITY_AUTHORITY_OWNER_ID,
  MAX_CORE_ECOLOGY_RIDGE_SOAR_ANCHORS,
  coreEcologyRidgeSoarAnchorAtCadence,
  deriveCoreEcologyRidgeActivityAuthority,
  isTrustedCoreEcologyRidgeActivityAuthority,
  type CoreEcologyRidgeActivityCandidate,
  type CoreEcologyRidgeActivityAuthorityV1,
} from "./coreEcologyRidgeActivityAuthority";
import { createWorldPosition } from "./worldPosition";

const REGION = createRegionCoord(-17, 42);
const HOME = createWorldPosition(REGION, 500, 500);

function candidate(
  sourceTileKey: string,
  localX: number,
  elevation: number,
  roughness: number,
): CoreEcologyRidgeActivityCandidate {
  return {
    sourceTileKey,
    position: createWorldPosition(REGION, localX, 500),
    terrain: "ridge",
    elevation,
    roughness,
  };
}

const CANDIDATES = Object.freeze([
  candidate("ridge-tile:a", 1_500, 800_000, 700_000),
  candidate("ridge-tile:b", 2_500, 900_000, 300_000),
  candidate("ridge-tile:c", 3_500, 900_000, 800_000),
  candidate("ridge-tile:d", 4_500, 700_000, 950_000),
  candidate("ridge-tile:e", 5_500, 600_000, 400_000),
]);

function derive(
  candidates: readonly CoreEcologyRidgeActivityCandidate[] = CANDIDATES,
) {
  return deriveCoreEcologyRidgeActivityAuthority({
    sourceKey: "alpine-habitat:r-17:42:v1",
    actorId: "ridge-activity:test-actor",
    homeAnchor: HOME,
    candidates,
  });
}

describe("species-neutral ridge activity authority", () => {
  it("selects a bounded high perch and deterministic soar loop independent of input order", () => {
    const forward = derive();
    const reverse = derive([...CANDIDATES].reverse());

    expect(forward).not.toBeNull();
    expect(reverse).not.toBeNull();
    expect(stableStringify(reverse)).toBe(stableStringify(forward));
    expect(forward).toMatchObject({
      ownerId: CORE_ECOLOGY_RIDGE_ACTIVITY_AUTHORITY_OWNER_ID,
      sourceKey: "alpine-habitat:r-17:42:v1",
      actorId: "ridge-activity:test-actor",
      perchAnchor: {
        purpose: "perch",
        sourceTileKey: "ridge-tile:c",
        elevation: 900_000,
        roughness: 800_000,
      },
    });
    expect(forward?.soarAnchors).toHaveLength(MAX_CORE_ECOLOGY_RIDGE_SOAR_ANCHORS);
    expect(new Set(forward?.soarAnchors.map(({ sourceTileKey }) => sourceTileKey)).size)
      .toBe(MAX_CORE_ECOLOGY_RIDGE_SOAR_ANCHORS);
    expect(Object.isFrozen(forward)).toBe(true);
    expect(Object.isFrozen(forward?.soarAnchors)).toBe(true);
    expect(isTrustedCoreEcologyRidgeActivityAuthority(forward)).toBe(true);
    expect(isTrustedCoreEcologyRidgeActivityAuthority(reverse)).toBe(true);
  });

  it("cycles over only authenticated ridge anchors without mutating the receipt", () => {
    const authority = derive();
    if (authority === null) throw new Error("Expected ridge activity authority");
    const before = stableStringify(authority);
    const firstCycle = Array.from(
      { length: authority.soarAnchors.length },
      (_, ordinal) => coreEcologyRidgeSoarAnchorAtCadence(authority, ordinal),
    );
    const secondCycle = Array.from(
      { length: authority.soarAnchors.length },
      (_, ordinal) => coreEcologyRidgeSoarAnchorAtCadence(
        authority,
        ordinal + authority.soarAnchors.length,
      ),
    );

    expect(firstCycle).toEqual(secondCycle);
    expect(new Set(firstCycle.map((anchor) => anchor?.sourceTileKey)).size)
      .toBe(authority.soarAnchors.length);
    expect(firstCycle.every((anchor) => anchor?.purpose === "soar")).toBe(true);
    expect(stableStringify(authority)).toBe(before);
    expect(coreEcologyRidgeSoarAnchorAtCadence(authority, -1)).toBeNull();
  });

  it("rejects structural clones, non-ridge facts, duplicate sites, and cross-region candidates", () => {
    const authority = derive();
    if (authority === null) throw new Error("Expected ridge activity authority");
    const forged = JSON.parse(stableStringify(authority)) as CoreEcologyRidgeActivityAuthorityV1;
    expect(isTrustedCoreEcologyRidgeActivityAuthority(forged)).toBe(false);
    expect(coreEcologyRidgeSoarAnchorAtCadence(forged, 0)).toBeNull();

    expect(deriveCoreEcologyRidgeActivityAuthority({
      sourceKey: "alpine-habitat:r-17:42:v1",
      actorId: "ridge-activity:test-actor",
      homeAnchor: HOME,
      candidates: [{ ...CANDIDATES[0], terrain: "meadow" }],
    })).toBeNull();
    expect(derive([CANDIDATES[0]!, CANDIDATES[0]!])).toBeNull();
    expect(derive([
      CANDIDATES[0]!,
      { ...CANDIDATES[0]!, sourceTileKey: "ridge-tile:copy" },
    ])).toBeNull();
    expect(derive([{ ...CANDIDATES[0]!, position: createWorldPosition(
      createRegionCoord(REGION.x - 1, REGION.y),
      1_500,
      500,
    ) }])).toBeNull();
  });

  it("remains deterministic at the segmented coordinate envelope", () => {
    const extremeRegion = createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT);
    const homeAnchor = createWorldPosition(extremeRegion, 500, 500);
    const input = {
      sourceKey: "alpine-habitat:extreme:v1",
      actorId: "ridge-activity:extreme-actor",
      homeAnchor,
      candidates: [
        {
          sourceTileKey: "ridge-tile:extreme",
          position: createWorldPosition(extremeRegion, 1_500, 500),
          terrain: "ridge",
          elevation: 1_000_000,
          roughness: 1_000_000,
        },
      ],
    } as const;
    const first = deriveCoreEcologyRidgeActivityAuthority(input);
    const repeated = deriveCoreEcologyRidgeActivityAuthority(input);

    expect(first).not.toBeNull();
    expect(stableStringify(repeated)).toBe(stableStringify(first));
    expect(first?.perchAnchor.position.region).toEqual(extremeRegion);
  });
});

import { describe, expect, it } from "vitest";

import { hashCanonical } from "../sim/util";
import {
  commitGeneratedRegionModification,
  createRegionManifest,
  validateRegionManifest,
} from "./regionManifest";

const TERRAIN_HASH = "0123456789abcdeffedcba9876543210";

function resealManifest(value: Record<string, unknown>): Record<string, unknown> {
  const { integrity: _integrity, ...payload } = value;
  return { ...payload, integrity: hashCanonical(payload) };
}

describe("signed-region release audit", () => {
  it("rejects impossible region and object revisions even under a fresh integrity seal", () => {
    const committed = commitGeneratedRegionModification(
      createRegionManifest(),
      TERRAIN_HASH,
      {
        region: { x: -4, y: 9 },
        id: "evidence:revision-audit:1",
        kind: "evidence",
        expectedManifestRevision: 0,
        expectedRegionRevision: 0,
        expectedModificationRevision: 0,
        removed: false,
        value: { severity: 1 },
      },
    );
    const raw = JSON.parse(JSON.stringify(committed.manifest)) as Record<string, unknown>;

    const impossibleRegion = structuredClone(raw);
    const impossibleRegionRecords = impossibleRegion.regions as Record<string, unknown>[];
    impossibleRegionRecords[0] = {
      ...impossibleRegionRecords[0],
      revision: Number.MAX_SAFE_INTEGER,
    };
    expect(validateRegionManifest(resealManifest(impossibleRegion)).valid).toBe(false);

    const impossibleObject = structuredClone(raw);
    const impossibleObjectRegions = impossibleObject.regions as Record<string, unknown>[];
    const firstRegion = impossibleObjectRegions[0];
    if (!firstRegion) throw new Error("audit fixture lost its durable region");
    const modifications = firstRegion.modifications as Record<string, unknown>[];
    modifications[0] = {
      ...modifications[0],
      revision: Number.MAX_SAFE_INTEGER,
    };
    expect(validateRegionManifest(resealManifest(impossibleObject)).valid).toBe(false);
  });
});

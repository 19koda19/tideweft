import { describe, expect, it } from "vitest";
import { REGION_COORD_LIMIT, regionKey, type RegionCoord } from "../sim/regions";
import { hashCanonical, stableStringify } from "../sim/util";
import {
  REGION_MANIFEST_MAX_REGIONS,
  REGION_MANIFEST_VERSION,
  adoptRegionManifest,
  collectGeneratedRegionIdentity,
  collectRegionIdentity,
  commitGeneratedRegionModification,
  commitRegionModification,
  createRegionManifest,
  getDurableRegionRecord,
  parseRegionManifest,
  serializeRegionManifest,
  validateRegionManifest,
  visitRegionManifest,
  type DurableRegionRecord,
  type RegionManifest,
} from "./regionManifest";

const COMPATIBILITY_HASH = "0123456789abcdeffedcba9876543210";

function terrainHash(value: unknown): string {
  return hashCanonical(["manifest-terrain-fixture", 0, value])
    + hashCanonical(["manifest-terrain-fixture", 1, value]);
}

function durablyTouched(...coords: readonly RegionCoord[]): RegionManifest {
  let manifest = createRegionManifest();
  for (const coord of coords) {
    manifest = collectGeneratedRegionIdentity(manifest, terrainHash(coord), {
      region: coord,
      id: "fixture:durable-touch",
      expectedManifestRevision: manifest.revision,
      expectedRegionRevision: 0,
    }).manifest;
  }
  return manifest;
}

function requiredRecord(manifest: RegionManifest, coord: RegionCoord): DurableRegionRecord {
  const record = getDurableRegionRecord(manifest, coord);
  if (!record) throw new Error(`missing durable region ${regionKey(coord)}`);
  return record;
}

function reseal(value: Record<string, unknown>): Record<string, unknown> {
  const { integrity: _integrity, ...payload } = value;
  return { ...payload, integrity: hashCanonical(payload) };
}

describe("sparse durable region manifest", () => {
  it("migrates absent and exact-v0 state without inventing a compatibility-region change", () => {
    const absent = adoptRegionManifest(undefined, COMPATIBILITY_HASH);
    const legacy = adoptRegionManifest({ version: 0 }, COMPATIBILITY_HASH);
    expect(absent).not.toBeNull();
    expect(legacy).toEqual(absent);
    expect(absent).toEqual(createRegionManifest());
    expect(absent?.regions).toEqual([]);
    expect(adoptRegionManifest({ version: 0, collected: [] }, COMPATIBILITY_HASH)).toBeNull();
    expect(adoptRegionManifest(undefined, "not-a-hash")).toBeNull();
    expect(adoptRegionManifest(undefined, COMPATIBILITY_HASH.slice(0, 16))).toBeNull();
    expect(adoptRegionManifest(undefined, COMPATIBILITY_HASH.slice(0, -1))).toBeNull();
  });

  it("keeps arbitrary pristine visits ephemeral, including signed and distant coordinates", () => {
    const initial = createRegionManifest();
    const coords: readonly RegionCoord[] = [
      { x: -1, y: -1 },
      { x: 1, y: 1 },
      { x: -1_000_000, y: 1_000_000 },
      { x: 1_000_000, y: -1_000_000 },
      { x: REGION_COORD_LIMIT, y: -REGION_COORD_LIMIT },
    ];
    const visited = visitRegionManifest(initial, coords.map((coord) => ({
      coord,
      visitedHash: terrainHash(coord),
    })));
    expect(visited).toBe(initial);
    expect(visited.regions).toEqual([]);
    expect(visited.revision).toBe(0);
    expect(visited.lastEventOrdinal).toBe(0);
    expect(serializeRegionManifest(visited)).toBe(serializeRegionManifest(initial));
  });

  it("does not consume durable capacity under 10,001 distinct one-direction visits", () => {
    const initial = createRegionManifest();
    const visits = Array.from({ length: 10_001 }, (_, x) => ({
      coord: { x, y: -2_000_000 },
      visitedHash: terrainHash({ x, y: -2_000_000 }),
    }));
    const visited = visitRegionManifest(initial, visits);
    expect(visited).toBe(initial);
    expect(visited.regions).toHaveLength(0);
    expect(serializeRegionManifest(visited).length).toBeLessThan(150);
  });

  it("serializes, parses, freezes, and orders only durably changed regions", () => {
    const coords = [
      { x: 8, y: -2 },
      { x: -1, y: 0 },
      { x: 0, y: 0 },
      { x: -99, y: 100 },
    ] as const;
    const original = durablyTouched(...coords);
    const text = serializeRegionManifest(original);
    const parsed = parseRegionManifest(text);
    expect(parsed).toEqual(original);
    expect(parsed && serializeRegionManifest(parsed)).toBe(text);
    expect(parseRegionManifest(` ${text}`)).toBeNull();
    expect(original.regions.map(({ key }) => key)).toEqual(
      original.regions.map(({ key }) => key).sort(),
    );
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.regions)).toBe(true);
    expect(Object.isFrozen(parsed?.regions[0]?.coord)).toBe(true);
  });

  it("allows untouched regeneration but rejects a changed hash after durable touch", () => {
    const coord = { x: 4, y: 7 } as const;
    const hash = terrainHash(coord);
    const pristine = createRegionManifest();
    expect(visitRegionManifest(pristine, [{ coord, visitedHash: hash }])).toBe(pristine);
    expect(visitRegionManifest(pristine, [{ coord, visitedHash: "a".repeat(32) }])).toBe(pristine);

    const touched = collectGeneratedRegionIdentity(pristine, hash, {
      region: coord,
      id: "resource:touch:1",
      expectedManifestRevision: 0,
      expectedRegionRevision: 0,
    }).manifest;
    expect(visitRegionManifest(touched, [{ coord, visitedHash: hash }])).toBe(touched);
    expect(() => visitRegionManifest(touched, [{ coord, visitedHash: "a".repeat(32) }]))
      .toThrow(/different terrain hash/);
    expect(requiredRecord(touched, coord).visitedHash).toBe(hash);
  });

  it("materializes a first modification atomically and preserves revisions and tombstones", () => {
    const coord = { x: -3, y: 5 } as const;
    const initial = createRegionManifest();
    const built = commitGeneratedRegionModification(initial, terrainHash(coord), {
      region: coord,
      id: "wayknot:rg:17",
      kind: "wayknot",
      expectedManifestRevision: 0,
      expectedRegionRevision: 0,
      expectedModificationRevision: 0,
      removed: false,
      value: { tileIndex: 18, strength: 725_000, materials: ["reed", 2] },
    });
    expect(initial.regions).toEqual([]);
    expect(built.manifest.revision).toBe(2);
    expect(built.region).toMatchObject({
      revision: 2,
      visitedEventOrdinal: 1,
      lastEventOrdinal: 2,
    });
    expect(built.region.modifications[0]).toMatchObject({
      id: "wayknot:rg:17",
      revision: 1,
      removed: false,
    });
    const removed = commitRegionModification(built.manifest, {
      region: coord,
      id: "wayknot:rg:17",
      kind: "wayknot",
      expectedManifestRevision: built.manifest.revision,
      expectedRegionRevision: built.region.revision,
      expectedModificationRevision: 1,
      removed: true,
      value: null,
    });
    expect(removed.region.modifications[0]).toMatchObject({ revision: 2, removed: true, value: null });
    expect(parseRegionManifest(serializeRegionManifest(removed.manifest))).toEqual(removed.manifest);
  });

  it("tombstones a first collection atomically through serialization", () => {
    const coord = { x: 12, y: -8 } as const;
    const initial = createRegionManifest();
    const collected = collectGeneratedRegionIdentity(initial, terrainHash(coord), {
      region: coord,
      id: "resource:root-fiber:8",
      expectedManifestRevision: 0,
      expectedRegionRevision: 0,
    });
    const loaded = parseRegionManifest(serializeRegionManifest(collected.manifest));
    expect(requiredRecord(loaded as RegionManifest, coord).collected).toEqual([
      { id: "resource:root-fiber:8", eventOrdinal: collected.eventOrdinal },
    ]);
    const loadedRegion = requiredRecord(loaded as RegionManifest, coord);
    expect(() => collectRegionIdentity(loaded as RegionManifest, {
      region: coord,
      id: "resource:root-fiber:8",
      expectedManifestRevision: loaded?.revision ?? -1,
      expectedRegionRevision: loadedRegion.revision,
    })).toThrow(/cannot be collected twice/);
  });

  it("leaves no empty record after invalid first changes and rejects stale quotes", () => {
    const coord = { x: 2, y: 3 } as const;
    const initial = createRegionManifest();
    const input = {
      region: coord,
      id: "terrain:scar:1",
      kind: "terrain" as const,
      expectedManifestRevision: initial.revision,
      expectedRegionRevision: 0,
      expectedModificationRevision: 0,
      removed: false,
      value: { depth: 4 },
    };
    expect(() => commitGeneratedRegionModification(initial, terrainHash(coord), {
      ...input,
      value: Number.NaN as never,
    })).toThrow(/not canonical/);
    expect(initial.regions).toEqual([]);

    const committed = commitGeneratedRegionModification(initial, terrainHash(coord), input);
    expect(() => commitGeneratedRegionModification(committed.manifest, terrainHash(coord), input))
      .toThrow(/manifest quote is stale/);
    expect(() => commitRegionModification(committed.manifest, {
      ...input,
      expectedManifestRevision: committed.manifest.revision,
    })).toThrow(/region quote is stale/);
    expect(() => commitRegionModification(committed.manifest, {
      ...input,
      expectedManifestRevision: committed.manifest.revision,
      expectedRegionRevision: committed.region.revision,
    })).toThrow(/modification quote is stale/);
  });

  it("rejects kind switching, invalid removals, aliases, and resurrection", () => {
    const coord = { x: 0, y: 0 } as const;
    const committed = commitGeneratedRegionModification(createRegionManifest(), terrainHash(coord), {
      region: coord,
      id: "infrastructure:bridge:2",
      kind: "infrastructure",
      expectedManifestRevision: 0,
      expectedRegionRevision: 0,
      expectedModificationRevision: 0,
      removed: false,
      value: { condition: 900_000 },
    });
    expect(() => commitRegionModification(committed.manifest, {
      region: coord,
      id: "infrastructure:bridge:2",
      kind: "evidence",
      expectedManifestRevision: committed.manifest.revision,
      expectedRegionRevision: committed.region.revision,
      expectedModificationRevision: 1,
      removed: false,
      value: { condition: 1 },
    })).toThrow(/cannot change kind/);
    expect(() => commitRegionModification(committed.manifest, {
      region: coord,
      id: "infrastructure:bridge:2",
      kind: "infrastructure",
      expectedManifestRevision: committed.manifest.revision,
      expectedRegionRevision: committed.region.revision,
      expectedModificationRevision: 1,
      removed: true,
      value: { forbidden: true },
    })).toThrow(/null tombstone/);

    const collected = collectGeneratedRegionIdentity(createRegionManifest(), terrainHash(coord), {
      region: coord,
      id: "resource:ore:3",
      expectedManifestRevision: 0,
      expectedRegionRevision: 0,
    });
    expect(() => commitRegionModification(collected.manifest, {
      region: coord,
      id: "resource:ore:3",
      kind: "resource",
      expectedManifestRevision: collected.manifest.revision,
      expectedRegionRevision: collected.region.revision,
      expectedModificationRevision: 0,
      removed: false,
      value: { quantity: 1 },
    })).toThrow(/cannot be resurrected/);
  });

  it("rejects noncanonical or unbounded generic mutation payloads", () => {
    const coord = { x: 0, y: 0 } as const;
    const initial = createRegionManifest();
    const base = {
      region: coord,
      id: "evidence:tracks:1",
      kind: "evidence" as const,
      expectedManifestRevision: 0,
      expectedRegionRevision: 0,
      expectedModificationRevision: 0,
      removed: false,
    };
    expect(() => commitGeneratedRegionModification(
      initial,
      terrainHash(coord),
      { ...base, value: Number.NaN as never },
    )).toThrow(/not canonical/);
    expect(() => commitGeneratedRegionModification(
      initial,
      terrainHash(coord),
      { ...base, value: 1.5 as never },
    )).toThrow(/not canonical/);
    expect(() => commitGeneratedRegionModification(initial, terrainHash(coord), {
      ...base,
      value: { huge: "x".repeat(70_000) },
    })).toThrow(/not canonical/);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => commitGeneratedRegionModification(initial, terrainHash(coord), {
      ...base,
      value: circular as never,
    })).toThrow(/not canonical/);
    expect(initial.regions).toEqual([]);
  });

  it("rejects integrity corruption, aliases, empty durable records, duplicates, and reordering", () => {
    const manifest = durablyTouched({ x: -4, y: 2 }, { x: 3, y: 1 });
    const raw = JSON.parse(serializeRegionManifest(manifest)) as Record<string, unknown>;
    expect(validateRegionManifest({ ...raw, integrity: "0000000000000000" }).valid).toBe(false);

    const regions = raw.regions as Record<string, unknown>[];
    const legacyHash = structuredClone(raw);
    const legacyHashRegions = legacyHash.regions as Record<string, unknown>[];
    legacyHashRegions[0] = {
      ...legacyHashRegions[0],
      visitedHash: String(legacyHashRegions[0]?.visitedHash).slice(0, 16),
    };
    expect(validateRegionManifest(reseal(legacyHash)).reason).toBe("invalid-region");

    const truncatedHash = structuredClone(raw);
    const truncatedHashRegions = truncatedHash.regions as Record<string, unknown>[];
    truncatedHashRegions[0] = {
      ...truncatedHashRegions[0],
      visitedHash: String(truncatedHashRegions[0]?.visitedHash).slice(0, -1),
    };
    expect(validateRegionManifest(reseal(truncatedHash)).reason).toBe("invalid-region");

    const alias = structuredClone(raw);
    const aliasRegions = alias.regions as Record<string, unknown>[];
    aliasRegions[0] = { ...aliasRegions[0], key: "r:-04:2" };
    expect(validateRegionManifest(reseal(alias)).valid).toBe(false);

    const coordinateAlias = structuredClone(raw);
    const coordinateAliasRegions = coordinateAlias.regions as Record<string, unknown>[];
    coordinateAliasRegions[0] = {
      ...coordinateAliasRegions[0],
      coord: { ...(coordinateAliasRegions[0]?.coord as object), alias: true },
    };
    expect(validateRegionManifest(reseal(coordinateAlias)).valid).toBe(false);

    const duplicate = structuredClone(raw);
    duplicate.regions = [regions[0], regions[0]];
    expect(validateRegionManifest(reseal(duplicate)).reason).toBe("duplicate-identity");

    const reordered = structuredClone(raw);
    reordered.regions = [...(reordered.regions as unknown[])].reverse();
    expect(validateRegionManifest(reseal(reordered)).reason).toBe("noncanonical-order");

    const one = JSON.parse(serializeRegionManifest(durablyTouched({ x: 6, y: 7 }))) as Record<string, unknown>;
    const oneRegions = one.regions as Record<string, unknown>[];
    const visitedEventOrdinal = oneRegions[0]?.visitedEventOrdinal;
    oneRegions[0] = {
      ...oneRegions[0],
      collected: [],
      modifications: [],
      revision: 1,
      lastEventOrdinal: visitedEventOrdinal,
    };
    one.revision = visitedEventOrdinal;
    one.lastEventOrdinal = visitedEventOrdinal;
    expect(validateRegionManifest(reseal(one)).reason).toBe("invalid-region");
  });

  it("rejects oversized manifests before traversing their contents", () => {
    const oversized = {
      version: REGION_MANIFEST_VERSION,
      revision: 0,
      lastEventOrdinal: 0,
      regions: new Array(REGION_MANIFEST_MAX_REGIONS + 1),
      integrity: "0000000000000000",
    };
    expect(validateRegionManifest(oversized).reason).toBe("oversized");
  });

  it("does not allow caller mutation of trusted state or input values", () => {
    const coord = { x: 0, y: 0 } as const;
    const inputValue = { trail: [1, 2, 3] };
    const committed = commitGeneratedRegionModification(
      createRegionManifest(),
      terrainHash(coord),
      {
        region: coord,
        id: "evidence:trail:4",
        kind: "evidence",
        expectedManifestRevision: 0,
        expectedRegionRevision: 0,
        expectedModificationRevision: 0,
        removed: false,
        value: inputValue,
      },
    );
    inputValue.trail[0] = 99;
    expect(committed.region.modifications[0]?.value).toEqual({ trail: [1, 2, 3] });
    expect(() => {
      (committed.manifest.regions as unknown as unknown[]).push({});
    }).toThrow();
  });

  it("fails atomically when the event ordinal is exhausted", () => {
    const coord = { x: 0, y: 0 } as const;
    const original = durablyTouched(coord);
    const raw = JSON.parse(serializeRegionManifest(original)) as Record<string, unknown>;
    const regions = raw.regions as Record<string, unknown>[];
    const collected = regions[0]?.collected as Record<string, unknown>[];
    regions[0] = {
      ...regions[0],
      visitedEventOrdinal: Number.MAX_SAFE_INTEGER - 1,
      lastEventOrdinal: Number.MAX_SAFE_INTEGER,
      collected: [{ ...collected[0], eventOrdinal: Number.MAX_SAFE_INTEGER }],
    };
    raw.revision = Number.MAX_SAFE_INTEGER;
    raw.lastEventOrdinal = Number.MAX_SAFE_INTEGER;
    const validation = validateRegionManifest(reseal(raw));
    expect(validation.valid).toBe(true);
    const saturated = validation.manifest as RegionManifest;
    expect(() => collectRegionIdentity(saturated, {
      region: coord,
      id: "resource:last:1",
      expectedManifestRevision: saturated.revision,
      expectedRegionRevision: saturated.regions[0]?.revision ?? -1,
    })).toThrow(/ordinal capacity exhausted/);
    expect(serializeRegionManifest(saturated)).toBe(stableStringify(saturated));
  });
});

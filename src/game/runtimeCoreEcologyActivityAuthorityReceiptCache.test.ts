import { describe, expect, it, vi } from "vitest";
import type { RootSeed } from "../sim/rng";
import {
  createRuntimeCoreEcologyActivityAuthorityReceiptCache,
  type RuntimeCoreEcologyActivityAuthorityCustody,
  type RuntimeCoreEcologyActivityAuthorityRequest,
} from "./runtimeCoreEcologyActivityAuthorityReceiptCache";

interface FixtureReceipt {
  readonly sourceKey: string;
  readonly actorId: string;
  readonly ordinal: number;
}

const trusted = new WeakSet<object>();

function receipt(sourceKey: string, actorId: string, ordinal = 1): FixtureReceipt {
  const value = Object.freeze({ sourceKey, actorId, ordinal });
  trusted.add(value);
  return value;
}

function seed(a = 1, b = 2, c = 3, d = 4): RootSeed {
  return Object.freeze([a, b, c, d]);
}

function custody(
  actorId: string,
  overrides: Partial<RuntimeCoreEcologyActivityAuthorityCustody> = {},
): RuntimeCoreEcologyActivityAuthorityCustody {
  return Object.freeze({
    rootSeed: seed(),
    sourceKind: "regional-habitat",
    sourceKey: "source-a",
    sourceRegionX: 12,
    sourceRegionY: -8,
    derivationKind: "regional-habitat-v1",
    lineageKey: "lineage-a",
    actorId,
    species: "red-fox",
    populationKey: "foxes-a",
    populationOrdinal: 0,
    representedUnits: 1,
    alpineSeedFingerprint: null,
    legacyCustodyKey: null,
    ...overrides,
  });
}

function request(
  actorId: string,
  overrides: Partial<RuntimeCoreEcologyActivityAuthorityCustody> = {},
  project?: () => FixtureReceipt | null,
  validate: (value: unknown) => value is FixtureReceipt = (value): value is FixtureReceipt => (
    typeof value === "object" && value !== null && trusted.has(value)
  ),
): RuntimeCoreEcologyActivityAuthorityRequest<FixtureReceipt> {
  const actorCustody = custody(actorId, overrides);
  return Object.freeze({
    sourceKey: actorCustody.sourceKey,
    custody: actorCustody,
    project: project ?? (() => receipt(actorCustody.sourceKey, actorCustody.actorId)),
    validate,
  });
}

function fixture() {
  let ordinal = 0;
  const projector = vi.fn((sourceKey: string, actorId: string) => (
    receipt(sourceKey, actorId, ordinal += 1)
  ));
  const validateReceipt = vi.fn((value: unknown): value is FixtureReceipt => (
    typeof value === "object" && value !== null && trusted.has(value)
  ));
  const cache = createRuntimeCoreEcologyActivityAuthorityReceiptCache<FixtureReceipt>();
  const project = (
    requests: readonly RuntimeCoreEcologyActivityAuthorityRequest<FixtureReceipt>[],
    sourceKeys: readonly string[] = ["source-a"],
  ) => cache.project({
    sourceKeys,
    requests: requests.map((candidate) => Object.freeze({
      ...candidate,
      project: () => projector(candidate.sourceKey, candidate.custody.actorId),
      validate: validateReceipt,
    })),
  });
  return { cache, project, projector, validateReceipt };
}

describe("runtime core-ecology activity-authority receipt cache", () => {
  it("reuses exact cross-tick custody while returning fresh outer and source maps", () => {
    const { cache, project, projector, validateReceipt } = fixture();
    const first = project([request("fox-a")]);
    const second = project([request("fox-a")]);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect(second?.get("source-a")).not.toBe(first?.get("source-a"));
    expect(second?.get("source-a")?.get("fox-a"))
      .toBe(first?.get("source-a")?.get("fox-a"));
    expect(projector).toHaveBeenCalledTimes(1);
    expect(validateReceipt).toHaveBeenCalledTimes(2);
    expect(cache.entryCount()).toBe(1);
  });

  it("misses when any custody field changes, including signed zero", () => {
    const cases: Array<[string, Partial<RuntimeCoreEcologyActivityAuthorityCustody>]> = [
      ["seed-0", { rootSeed: seed(9, 2, 3, 4) }],
      ["seed-1", { rootSeed: seed(1, 9, 3, 4) }],
      ["seed-2", { rootSeed: seed(1, 2, 9, 4) }],
      ["seed-3", { rootSeed: seed(1, 2, 3, 9) }],
      ["seed-signed-zero", { rootSeed: seed(-0, 2, 3, 4) }],
      ["source-kind", { sourceKind: "legacy-cohort" }],
      ["source-key", { sourceKey: "source-b" }],
      ["region-x", { sourceRegionX: 13 }],
      ["region-y", { sourceRegionY: -9 }],
      ["region-signed-zero", { sourceRegionX: -0 }],
      ["derivation", { derivationKind: "breadth-habitat-v1" }],
      ["lineage", { lineageKey: "lineage-b" }],
      ["species", { species: "arctic-fox" }],
      ["population", { populationKey: "foxes-b" }],
      ["ordinal", { populationOrdinal: 1 }],
      ["ordinal-signed-zero", { populationOrdinal: -0 }],
      ["units", { representedUnits: 2 }],
      ["alpine", { alpineSeedFingerprint: "alpine-a" }],
      ["legacy", { legacyCustodyKey: "legacy-a" }],
    ];
    for (const [label, changed] of cases) {
      const { project, projector } = fixture();
      const baseline = label === "seed-signed-zero"
        ? { rootSeed: seed(0, 2, 3, 4) }
        : label === "region-signed-zero"
          ? { sourceRegionX: 0 }
          : label === "ordinal-signed-zero"
            ? { populationOrdinal: 0 }
            : {};
      project([request("fox-a", baseline)]);
      const sourceKeys = changed.sourceKey === undefined
        ? ["source-a"]
        : [changed.sourceKey];
      project([request("fox-a", { ...baseline, ...changed })], sourceKeys);
      expect(projector, label).toHaveBeenCalledTimes(2);
    }
  });

  it("projects exactly the current membership when actors leave or arrive", () => {
    const { project, projector } = fixture();
    const first = project([request("fox-a"), request("fox-b")]);
    const second = project([request("fox-b"), request("fox-c")]);

    expect([...first?.get("source-a")?.keys() ?? []]).toEqual(["fox-a", "fox-b"]);
    expect([...second?.get("source-a")?.keys() ?? []]).toEqual(["fox-b", "fox-c"]);
    expect(second?.get("source-a")?.has("fox-a")).toBe(false);
    expect(projector).toHaveBeenCalledTimes(3);
  });

  it("rejects untrusted, unfrozen, cloned, and wrong actor/source receipts", () => {
    const invalid: Array<(
      r: RuntimeCoreEcologyActivityAuthorityRequest<FixtureReceipt>,
    ) => FixtureReceipt> = [
      (r) => Object.freeze({ sourceKey: r.custody.sourceKey, actorId: r.custody.actorId, ordinal: 1 }),
      (r) => {
        const value = { sourceKey: r.custody.sourceKey, actorId: r.custody.actorId, ordinal: 1 };
        trusted.add(value);
        return value;
      },
      (r) => Object.freeze(structuredClone(receipt(
        r.custody.sourceKey,
        r.custody.actorId,
      ))),
      (r) => receipt(r.custody.sourceKey, "wrong-actor"),
      (r) => receipt("wrong-source", r.custody.actorId),
    ];
    for (const projector of invalid) {
      const cache = createRuntimeCoreEcologyActivityAuthorityReceiptCache<FixtureReceipt>();
      const candidate = request("fox-a");
      expect(cache.project({
        sourceKeys: ["source-a"],
        requests: [{
          ...candidate,
          project: () => projector(candidate),
        }],
      })).toBeNull();
      expect(cache.entryCount()).toBe(0);
    }
  });

  it("does not insert or touch any entry after null, throw, or partial failure", () => {
    const { cache, project, projector } = fixture();
    project(Array.from({ length: 128 }, (_, index) => request(`actor-${index}`)));

    const failingRequests = [request("actor-0"), request("new-b")].map((candidate) => ({
      ...candidate,
      project: () => candidate.custody.actorId === "new-b"
        ? null
        : receipt(candidate.sourceKey, candidate.custody.actorId),
    }));
    expect(cache.project({
      sourceKeys: ["source-a"],
      requests: failingRequests,
    })).toBeNull();
    expect(cache.entryCount()).toBe(128);

    expect(() => cache.project({
      sourceKeys: ["source-a"],
      requests: failingRequests.map((candidate) => ({
        ...candidate,
        project: () => {
          if (candidate.custody.actorId === "new-b") throw new Error("bad projector");
          return receipt(candidate.sourceKey, candidate.custody.actorId);
        },
      })),
    })).toThrow("bad projector");
    expect(cache.entryCount()).toBe(128);

    project([request("actor-128")]);
    project([request("actor-0")]);
    expect(projector).toHaveBeenCalledTimes(130);
  });

  it("returns empty source maps without caching an empty bundle", () => {
    const { cache, project, projector } = fixture();
    const result = project([], ["source-a", "source-b"]);
    expect([...result?.keys() ?? []]).toEqual(["source-a", "source-b"]);
    expect(result?.get("source-a")?.size).toBe(0);
    expect(result?.get("source-b")?.size).toBe(0);
    expect(projector).not.toHaveBeenCalled();
    expect(cache.entryCount()).toBe(0);
  });

  it("rejects duplicate sources, duplicate actors, and absent sources", () => {
    const { cache, project, projector } = fixture();
    expect(project([], ["source-a", "source-a"])).toBeNull();
    expect(project([request("fox-a"), request("fox-a")])).toBeNull();
    expect(project([request("fox-a", { sourceKey: "missing" })])).toBeNull();
    expect(projector).not.toHaveBeenCalled();
    expect(cache.entryCount()).toBe(0);
  });

  it("caps at 128 entries, evicts least recently used, and promotes hits", () => {
    const { cache, project, projector } = fixture();
    project(Array.from({ length: 128 }, (_, index) => request(`actor-${index}`)));
    expect(cache.entryCount()).toBe(128);
    project([request("actor-0")]);
    expect(projector).toHaveBeenCalledTimes(128);
    project([request("actor-128")]);
    expect(cache.entryCount()).toBe(128);
    project([request("actor-1")]);
    project([request("actor-0")]);
    expect(projector).toHaveBeenCalledTimes(130);
  });

  it("clears explicitly and never shares entries between instances", () => {
    const first = fixture();
    const second = fixture();
    first.project([request("fox-a")]);
    second.project([request("fox-a")]);
    expect(first.projector).toHaveBeenCalledTimes(1);
    expect(second.projector).toHaveBeenCalledTimes(1);
    first.cache.clear();
    expect(first.cache.entryCount()).toBe(0);
    first.project([request("fox-a")]);
    expect(first.projector).toHaveBeenCalledTimes(2);
    expect(second.cache.entryCount()).toBe(1);
  });
});
